// pages/api/growth-model.js
// Growth Model tracker — meet de hypothese uit het funnelmodel met echte data:
// hitrate per bron (Own Write / Swipe), levensduur, CPA, decay, testburn en live winners.
//
// Databronnen:
//   - Meta insights: spend per campagne per dag (laatste 90 dagen, met paginatie)
//   - Shopify orders: omzet/orders/COGS per product per dag
//   - Launch-taken: product + source (Own Write / Swipe)
// Matching: campagnenaam bevat de productnaam — zelfde logica als het profit dashboard.
//
// Cache: resultaat wordt 6 uur bewaard in metaobject "growth-model-snapshot".
// Verversen: GET /api/growth-model?refresh=1

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 300 };

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const SHOPIFY_API_VERSION = "2025-01";
const STORE_TIMEZONE = "Europe/Brussels";

/* ---------------- instellingen van het model ---------------- */
const LOOKBACK_DAYS = 90;          // hoeveel historie we meenemen
const TRACK_FROM = "2026-08-10";   // startdatum van de meting — funnels met eerste spend vóór deze datum tellen niet mee
const WINNER_CPA = 20;             // winner = CPA onder dit bedrag (EUR)
const GATE_SWIPE = 60;             // testbudget swipe (EUR) — verdict valt zodra spend hier voorbij is
const GATE_OWN = 210;              // testbudget eigen funnel (EUR)
const MIN_DAILY_SPEND = 0.5;       // dagen met minder spend tellen niet als "live"
const DEAD_AFTER_DAYS = 3;         // geen spend in de laatste 3 dagen = campagne is uit
const AD_SUPPLIER_FEE = 0.025;     // 2,5% supplier fee bovenop Meta spend
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Aannames uit het hypothesedocument — de pagina zet ze naast de metingen
const ASSUMPTIONS = {
  hitrate: 0.20,
  lifespanOwnWeeks: 6,
  lifespanSwipeWeeks: 4,
  decayPctOfPeak: 0.55,
  profitPerWinnerDay: 333,
  ownPerWeek: 3,
  swipesPerWeek: 15,
};

/* ---------------- session ---------------- */
function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;
  if (!sessionToken) return null;
  const [body, sig] = sessionToken.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------------- Shopify helpers ---------------- */
let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  tokenCache = { token: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}

async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(
    `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 25000 }
  );
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}

async function readData(handle) {
  const data = await shopifyGraphql(
    `query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`,
    { handle }
  );
  const raw = data?.metaobjectByHandle?.field?.value;
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeData(handle, value) {
  const data = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id }
        userErrors { message }
      }
    }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

/* ---------------- date helpers ---------------- */
function localDateStr(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: STORE_TIMEZONE });
}
function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/* ---------------- Shopify orders (90 dagen, per product per dag) ---------------- */
const ORDERS_QUERY = `
  query GrowthOrders($first: Int!, $query: String, $after: String) {
    orders(first: $first, query: $query, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        lineItems(first: 50) {
          nodes {
            title
            quantity
            discountedTotalSet { shopMoney { amount } }
            product { title }
            variant { inventoryItem { unitCost { amount } } }
          }
        }
      }
    }
  }
`;

async function fetchOrdersPerProductPerDay(dateFrom, dateTo) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const endpoint = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const searchQuery = `created_at:>='${dateFrom}T00:00:00+02:00' AND created_at:<='${dateTo}T23:59:59+02:00'`;

  // byProduct[genormaliseerde productnaam][dag] = { qty, revenue, cogs }
  const byProduct = {};
  let after = null;
  let hasNextPage = true;
  let pages = 0;

  while (hasNextPage && pages < 40) {
    const response = await axios.post(
      endpoint,
      { query: ORDERS_QUERY, variables: { first: 250, query: searchQuery, after } },
      { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 25000 }
    );
    if (response.data.errors) throw new Error("Shopify orders: " + JSON.stringify(response.data.errors));
    const conn = response.data.data.orders;
    for (const order of conn.nodes) {
      const day = localDateStr(new Date(order.createdAt));
      for (const item of order.lineItems.nodes) {
        const title = item.product?.title || item.title;
        const key = normalize(title);
        if (!key) continue;
        const revenue = parseFloat(item.discountedTotalSet?.shopMoney?.amount || 0);
        const unitCost = item.variant?.inventoryItem?.unitCost?.amount;
        const cogs = unitCost != null ? parseFloat(unitCost) * item.quantity : 0;
        if (revenue === 0 && cogs === 0) continue; // gratis geschenken overslaan
        if (!byProduct[key]) byProduct[key] = { title, days: {} };
        if (!byProduct[key].days[day]) byProduct[key].days[day] = { qty: 0, revenue: 0, cogs: 0 };
        byProduct[key].days[day].qty += item.quantity;
        byProduct[key].days[day].revenue += revenue;
        byProduct[key].days[day].cogs += cogs;
      }
    }
    hasNextPage = conn.pageInfo.hasNextPage;
    after = conn.pageInfo.endCursor;
    pages++;
  }
  return byProduct;
}

/* ---------------- Meta: spend per campagne per dag (met paginatie) ---------------- */
async function fetchMetaCampaignDays(dateFrom, dateTo) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountIds = (process.env.META_AD_ACCOUNT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = []; // { name, spend, date }
  if (!token) return rows;

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        let url = `https://graph.facebook.com/v21.0/act_${accountId}/insights`;
        let params = {
          access_token: token,
          level: "campaign",
          fields: "campaign_name,spend",
          time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
          time_increment: 1,
          limit: 500,
        };
        let pages = 0;
        while (url && pages < 10) {
          const response = await axios.get(url, { params, timeout: 25000 });
          for (const row of response.data?.data || []) {
            rows.push({ name: row.campaign_name || "", spend: parseFloat(row.spend || 0), date: row.date_start });
          }
          url = response.data?.paging?.next || null;
          params = undefined; // de next-URL bevat alle parameters al
          pages++;
        }
      } catch (err) {
        console.warn(`Meta API error account ${accountId}:`, err.response?.data?.error?.message || err.message);
      }
    })
  );
  return rows;
}

/* ---------------- campagne ↔ taak matching (zelfde logica als het dashboard) ---------------- */
const GENERIC_WORDS = new Set([
  "drops", "cream", "crema", "cerotto", "patch", "patches", "gel", "serum",
  "roller", "just", "jenny", "the", "and", "for", "con", "die", "het",
]);
const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
function productKeywords(name) {
  const words = (name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
  return [...new Set([normalize(name), ...words])].filter(Boolean);
}

/* ---------------- het rekenwerk ---------------- */
function buildGrowthModel(tasks, campaignDays, ordersByProduct, today) {
  const windowFrom = shiftDays(today, -(LOOKBACK_DAYS - 1));

  // Kandidaten: elke launch-taak met een productnaam
  const funnels = tasks
    .filter((t) => (t.productName || t.product?.title || "").trim())
    .map((t) => {
      const name = t.product?.title || t.productName;
      return {
        taskId: t.id,
        name,
        source: t.source === "Own Write" || t.source === "Swipe" ? t.source : "Unknown",
        status: t.status || "",
        keys: productKeywords(name),
        productKey: normalize(name),
        spendDays: {}, // { dag: spend }
      };
    });

  // Spend per dag toewijzen: langste (meest specifieke) keyword-match wint
  for (const row of campaignDays) {
    if (!row.date || row.date < windowFrom || row.spend <= 0) continue;
    const campaign = normalize(row.name);
    if (!campaign) continue;
    let best = null;
    let bestLen = 0;
    for (const f of funnels) {
      for (const key of f.keys) {
        if (key.length > bestLen && campaign.includes(key)) {
          best = f;
          bestLen = key.length;
        }
      }
    }
    if (best) best.spendDays[row.date] = (best.spendDays[row.date] || 0) + row.spend;
  }

  const yesterday = shiftDays(today, -1);
  const results = [];

  for (const f of funnels) {
    const days = Object.keys(f.spendDays)
      .filter((d) => f.spendDays[d] >= MIN_DAILY_SPEND)
      .sort();
    if (!days.length) continue; // nooit spend gehad → staat nog niet live

    const firstSpendDay = days[0];
    // Alleen funnels die vanaf de startdatum zijn gelanceerd — oudere producten vervuilen
    // de hitrate/levensduur-meting omdat hun geschiedenis buiten het meetvenster begon
    if (firstSpendDay < TRACK_FROM) continue;
    const lastSpendDay = days[days.length - 1];
    const totalSpend = days.reduce((s, d) => s + f.spendDays[d], 0);
    const alive = daysBetween(lastSpendDay, today) <= DEAD_AFTER_DAYS;
    const lifespanDays = daysBetween(firstSpendDay, lastSpendDay) + 1;

    // Orders/omzet/COGS van dit product binnen de spend-periode
    const prodDays = ordersByProduct[f.productKey]?.days || {};
    let orders = 0, revenue = 0, cogs = 0;
    const dailyProfit = [];
    for (let d = firstSpendDay; d <= lastSpendDay; d = shiftDays(d, 1)) {
      const o = prodDays[d] || { qty: 0, revenue: 0, cogs: 0 };
      const spend = f.spendDays[d] || 0;
      orders += o.qty;
      revenue += o.revenue;
      cogs += o.cogs;
      dailyProfit.push(o.revenue - o.cogs - spend * (1 + AD_SUPPLIER_FEE));
    }

    const cpa = orders > 0 ? totalSpend / orders : null;
    const gate = f.source === "Swipe" ? GATE_SWIPE : GATE_OWN;

    // Verdict volgens de testgate uit het model
    let verdict = "testing";
    if (totalSpend >= gate) {
      if (orders === 0) verdict = "loser";
      else if (cpa != null && cpa < WINNER_CPA) verdict = "winner";
      else verdict = "loser";
    } else if (!alive) {
      // Uitgezet vóór de gate vol was: telt als loser (kill-criterium toegepast)
      verdict = orders > 0 && cpa != null && cpa < WINNER_CPA ? "winner" : "loser";
    }

    // Dag waarop de gate vol was → daarop tellen we winners per week
    let gateDay = null;
    let cum = 0;
    for (const d of days) {
      cum += f.spendDays[d];
      if (cum >= gate) { gateDay = d; break; }
    }

    // Decay: gemiddelde dagwinst als % van piek (3-daags voortschrijdend gemiddelde)
    let peak = 0;
    for (let i = 0; i < dailyProfit.length; i++) {
      const w = dailyProfit.slice(Math.max(0, i - 1), i + 2);
      peak = Math.max(peak, w.reduce((a, b) => a + b, 0) / w.length);
    }
    const totalProfit = revenue - cogs - totalSpend * (1 + AD_SUPPLIER_FEE);
    const avgDailyProfit = lifespanDays > 0 ? totalProfit / lifespanDays : 0;
    const decayPct = peak > 0 ? Math.min(1, Math.max(0, avgDailyProfit / peak)) : null;

    results.push({
      taskId: f.taskId,
      name: f.name,
      source: f.source,
      taskStatus: f.status,
      verdict,
      alive,
      firstSpendDay,
      lastSpendDay,
      gateDay,
      lifespanDays,
      spend: round2(totalSpend),
      orders,
      revenue: round2(revenue),
      cpa: cpa != null ? round2(cpa) : null,
      profit: round2(totalProfit),
      avgDailyProfit: round2(avgDailyProfit),
      peakDailyProfit: round2(peak),
      decayPct: decayPct != null ? Math.round(decayPct * 100) : null,
    });
  }

  /* --------- aggregaties per bron --------- */
  const bySource = {};
  for (const src of ["Own Write", "Swipe", "Unknown"]) {
    const list = results.filter((r) => r.source === src);
    const tested = list.filter((r) => r.verdict !== "testing");
    const winners = tested.filter((r) => r.verdict === "winner");
    const deadWinners = winners.filter((r) => !r.alive);
    bySource[src] = {
      funnels: list.length,
      testing: list.length - tested.length,
      tested: tested.length,
      winners: winners.length,
      losers: tested.length - winners.length,
      hitrate: tested.length > 0 ? Math.round((winners.length / tested.length) * 1000) / 10 : null,
      liveWinners: winners.filter((r) => r.alive).length,
      avgLifespanDays: deadWinners.length > 0 ? Math.round(deadWinners.reduce((s, r) => s + r.lifespanDays, 0) / deadWinners.length) : null,
      avgCpaWinners: winners.filter((r) => r.cpa != null).length > 0
        ? round2(winners.filter((r) => r.cpa != null).reduce((s, r) => s + r.cpa, 0) / winners.filter((r) => r.cpa != null).length)
        : null,
    };
  }

  /* --------- totalen --------- */
  const winners = results.filter((r) => r.verdict === "winner");
  const liveWinners = winners.filter((r) => r.alive);
  const last30 = shiftDays(today, -29);
  const testburn30d = results
    .filter((r) => r.verdict === "loser")
    .reduce((s, r) => s + (r.lastSpendDay >= last30 ? r.spend : 0), 0);
  const last28 = shiftDays(today, -27);
  const winnersLast4Weeks = winners.filter((r) => (r.gateDay || r.firstSpendDay) >= last28).length;
  const withDecay = winners.filter((r) => r.decayPct != null && r.lifespanDays >= 7);
  const avgDecayPct = withDecay.length > 0 ? Math.round(withDecay.reduce((s, r) => s + r.decayPct, 0) / withDecay.length) : null;
  const avgProfitPerLiveWinnerDay = liveWinners.length > 0
    ? round2(liveWinners.reduce((s, r) => s + r.avgDailyProfit, 0) / liveWinners.length)
    : null;

  return {
    generatedAt: new Date().toISOString(),
    windowFrom,
    windowTo: today,
    settings: { WINNER_CPA, GATE_SWIPE, GATE_OWN, LOOKBACK_DAYS, DEAD_AFTER_DAYS, TRACK_FROM },
    assumptions: ASSUMPTIONS,
    totals: {
      funnelsTracked: results.length,
      tested: results.filter((r) => r.verdict !== "testing").length,
      winners: winners.length,
      liveWinners: liveWinners.length,
      winnersPerWeek4wkAvg: Math.round((winnersLast4Weeks / 4) * 10) / 10,
      testburn30d: round2(testburn30d),
      avgDecayPct,
      avgProfitPerLiveWinnerDay,
      missingSource: results.filter((r) => r.source === "Unknown").length,
    },
    bySource,
    funnels: results.sort((a, b) => {
      const rank = (r) => (r.verdict === "winner" && r.alive ? 0 : r.verdict === "testing" ? 1 : r.verdict === "winner" ? 2 : 3);
      return rank(a) - rank(b) || b.spend - a.spend;
    }),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const session = getSession(req);
  if (!session || !(session.finance || session.admin)) {
    return res.status(401).json({ success: false, error: "No access — Growth Model requires Finance permission" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const refresh = req.query.refresh === "1";
    if (!refresh) {
      const cached = await readData("growth-model-snapshot");
      if (cached?.generatedAt && Date.now() - Date.parse(cached.generatedAt) < CACHE_TTL_MS) {
        return res.status(200).json({ success: true, data: cached, cached: true });
      }
    }

    const today = localDateStr(new Date());
    const windowFrom = shiftDays(today, -(LOOKBACK_DAYS - 1));

    const [launchStore, campaignDays, ordersByProduct] = await Promise.all([
      readData("launch-tasks"),
      fetchMetaCampaignDays(windowFrom, today),
      fetchOrdersPerProductPerDay(windowFrom, today),
    ]);

    const data = buildGrowthModel(launchStore?.tasks || [], campaignDays, ordersByProduct, today);
    await writeData("growth-model-snapshot", data);
    return res.status(200).json({ success: true, data, cached: false });
  } catch (error) {
    console.error("Growth model error:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to build growth model" });
  }
}
