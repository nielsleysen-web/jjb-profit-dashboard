// pages/api/creatives-data.js
// Creatives Data — prestaties per ad, gekoppeld aan de video- en design-taak
// die het creative heeft opgeleverd, zodat editors en designers zien welk werk verkoopt.
//
// Koppeling ad → taak gaat via de naming convention in de Meta ad-naam:
//   PRODUCT | STRATEGIST | EDITOR | ANGLE | NET NEW/ITERATION | DD-MM-YYYY
// Media buyers zetten daar vaak een prefix voor ("3 | …", "H2 - …") of gebruiken
// streepjes, dus we matchen op de kern (product + editor + deadline), niet op de
// exacte string. Wat niet automatisch matcht, kan de admin handmatig koppelen.
//
// Bronnen: Meta insights (spend per ad, per dag), Shopify orders (jjb_ad_id → omzet,
// COGS), creative-tasks + design-tasks (editor, product, type).

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 60 };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const MAX_DAYS = 92;

// Winner-drempel: pas een echte winnaar na voldoende spend én een sterke ROAS
const WINNER_MIN_SPEND = 500;
const WINNER_MIN_ROAS = 2.0;

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

/* ---------------- Shopify ---------------- */
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
    `https://${storeUrl}/admin/api/2025-01/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 }
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

/* ---------------- datums ---------------- */
const localDateStr = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
const shiftDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function resolveRange(q) {
  const today = localDateStr(new Date());
  let from, to;
  if (q.from && q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.from) && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
    from = q.from;
    to = q.to;
  } else {
    const days = Math.min(MAX_DAYS, Math.max(1, parseInt(q.days || "30", 10) || 30));
    to = today;
    from = shiftDays(today, -(days - 1));
  }
  if (to > today) to = today;
  if (from > to) from = to;
  // hard cap zodat de Shopify-scan niet ontspoort
  const span = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  if (span > MAX_DAYS) from = shiftDays(to, -(MAX_DAYS - 1));
  return { from, to };
}

/* ---------------- Meta: spend per ad, per dag ---------------- */
let adCache = { key: "", at: 0, data: null };

async function fetchAdSpend(since, until) {
  const cacheKey = `${since}:${until}`;
  if (adCache.data && adCache.key === cacheKey && Date.now() - adCache.at < 120000) return adCache.data;

  const token = process.env.META_ACCESS_TOKEN;
  const accountIds = (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const byAd = {};
  if (!token || !accountIds.length) return byAd;

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        let url = `https://graph.facebook.com/v21.0/act_${accountId}/insights`;
        let params = {
          access_token: token,
          level: "ad",
          fields: "ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,unique_outbound_clicks",
          time_range: JSON.stringify({ since, until }),
          time_increment: 1, // per dag → eerste/laatste actieve dag per ad
          limit: 500,
        };
        for (let p = 0; p < 6 && url; p++) {
          const r = await axios.get(url, { params, timeout: 20000 });
          for (const row of r.data?.data || []) {
            const id = row.ad_id;
            if (!id) continue;
            const spend = parseFloat(row.spend || 0);
            if (!byAd[id]) {
              byAd[id] = {
                adId: id,
                adName: row.ad_name || "",
                adsetName: row.adset_name || "",
                campaignId: row.campaign_id || "",
                campaignName: row.campaign_name || "",
                spend: 0,
                impressions: 0,
                clicks: 0,
                firstDay: row.date_start,
                lastDay: row.date_start,
                activeDays: 0,
              };
            }
            const a = byAd[id];
            a.spend += spend;
            a.impressions += parseFloat(row.impressions || 0);
            a.clicks += (row.unique_outbound_clicks || []).reduce((s, x) => s + parseFloat(x.value || 0), 0);
            if (spend > 0) {
              a.activeDays += 1;
              if (row.date_start < a.firstDay) a.firstDay = row.date_start;
              if (row.date_start > a.lastDay) a.lastDay = row.date_start;
            }
          }
          url = r.data?.paging?.next || null;
          params = undefined;
        }
      } catch (e) {
        console.warn(`Creatives Data — Meta error (act ${accountId}):`, e.response?.data?.error?.message || e.message);
      }
    })
  );

  adCache = { key: cacheKey, at: Date.now(), data: byAd };
  return byAd;
}

/* ---------------- Shopify: orders met jjb_ad_id + COGS ---------------- */
const ORDERS_QUERY = `
  query CreativesOrders($first: Int!, $query: String, $after: String) {
    orders(first: $first, query: $query, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        createdAt
        cancelledAt
        currentTotalPriceSet { shopMoney { amount } }
        customAttributes { key value }
        lineItems(first: 20) {
          nodes {
            quantity
            product { title }
            variant { inventoryItem { unitCost { amount } } }
          }
        }
      }
    }
  }
`;

let ordersCache = { key: "", at: 0, data: null };

async function fetchOrdersByAd(from, to) {
  const cacheKey = `${from}:${to}`;
  if (ordersCache.data && ordersCache.key === cacheKey && Date.now() - ordersCache.at < 60000) return ordersCache.data;

  const byAd = {};
  const searchQuery = `created_at:>='${from}T00:00:00+02:00' AND created_at:<='${to}T23:59:59+02:00'`;
  let after = null;
  for (let page = 0; page < 40; page++) {
    const d = await shopifyGraphql(ORDERS_QUERY, { first: 250, query: searchQuery, after });
    const conn = d.orders;
    for (const o of conn.nodes) {
      if (o.cancelledAt) continue;
      let adId = "";
      for (const a of o.customAttributes || []) {
        if (a?.key === "jjb_ad_id") adId = String(a.value || "").trim();
      }
      if (!adId) continue;
      let cogs = 0;
      for (const li of o.lineItems?.nodes || []) {
        const uc = li.variant?.inventoryItem?.unitCost?.amount;
        if (uc != null) cogs += parseFloat(uc) * (li.quantity || 0);
      }
      const value = parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || 0);
      if (!byAd[adId]) byAd[adId] = { orders: 0, revenue: 0, cogs: 0 };
      byAd[adId].orders += 1;
      byAd[adId].revenue += value;
      byAd[adId].cogs += cogs;
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }

  ordersCache = { key: cacheKey, at: Date.now(), data: byAd };
  return byAd;
}

/* ---------------- taken → naming convention ---------------- */
const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
const fmtDeadlineDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const norm = (s) =>
  String(s || "")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

// Tokens van een ad-naam: gesplitst op | of losse streepjes, genormaliseerd
function tokensOf(name) {
  return norm(name)
    .split(/\s*\|\s*|\s+-\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function taskProfile(t, kind) {
  const product = norm(t.product?.title);
  const editor = norm(firstName(t.assigneeName));
  const deadline = fmtDeadlineDate(t.deadline);
  const angle = norm(t.angle);
  return {
    id: t.id,
    kind, // "video" | "image"
    product,
    productTitle: t.product?.title || "",
    productImage: t.product?.image || null,
    editor,
    editorName: t.assigneeName || "",
    editorEmail: (t.assigneeEmail || "").toLowerCase(),
    strategistName: t.strategistName || "",
    angle,
    type: t.type || t.batchType || "",
    deadline,
    status: t.status || "",
    naming: [t.product?.title, firstName(t.strategistName), firstName(t.assigneeName), t.angle, t.type || t.batchType, deadline]
      .filter(Boolean)
      .map((s) => String(s).toUpperCase())
      .join(" | "),
  };
}

// Score hoe goed een ad-naam bij een taak past. Product + editor + deadline zijn de kern.
function matchScore(adName, prof) {
  if (!prof.product || !prof.editor) return 0;
  const n = norm(adName);
  const toks = tokensOf(adName);
  let score = 0;
  if (toks.includes(prof.product) || n.includes(prof.product)) score += 3;
  else return 0;
  if (toks.includes(prof.editor)) score += 3;
  else return 0;
  if (prof.deadline && n.includes(prof.deadline)) score += 3;
  if (prof.angle && (toks.includes(prof.angle) || n.includes(prof.angle))) score += 2;
  return score;
}

function bestTask(adName, profiles) {
  let best = null;
  let bestScore = 0;
  for (const p of profiles) {
    const s = matchScore(adName, p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  // product + editor alleen is te mager (dezelfde editor maakt meerdere creatives voor hetzelfde product);
  // we willen ook de deadline óf de angle terugzien
  return bestScore >= 8 ? best : null;
}

/* ---------------- handler ---------------- */
const round2 = (v) => Math.round((v || 0) * 100) / 100;

export default async function handler(req, res) {
  const session = getSession(req);
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  const isAdmin = !!session?.admin;
  const isFinance = isAdmin || !!session?.finance;
  const isCreative = ["Creative Strategist", "Video Editor", "Graphic Designer", "Media Buyer"].some((r) => roles.includes(r));
  if (!session || !(isAdmin || isFinance || isCreative)) {
    return res.status(401).json({ success: false, error: "No access" });
  }

  try {
    /* --- handmatige koppeling (alleen admin) --- */
    if (req.method === "POST") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the admin can link ads" });
      const { action, adId, taskId, kind } = req.body || {};
      const links = (await readData("creative-links")) || {};
      if (action === "link") {
        if (!adId || !taskId || !["video", "image"].includes(kind)) return res.status(400).json({ success: false, error: "adId, taskId and kind are required" });
        links[String(adId)] = { taskId: String(taskId), kind, by: session.email, at: new Date().toISOString() };
        await writeData("creative-links", links);
        return res.status(200).json({ success: true });
      }
      if (action === "unlink") {
        delete links[String(adId)];
        await writeData("creative-links", links);
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ success: false, error: "Unknown action" });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { from, to } = resolveRange(req.query);
    const [ads, ordersByAd, videoStore, designStore, links] = await Promise.all([
      fetchAdSpend(from, to),
      fetchOrdersByAd(from, to),
      readData("creative-tasks"),
      readData("design-tasks"),
      readData("creative-links"),
    ]);

    const profiles = [
      ...((videoStore?.tasks || []).map((t) => taskProfile(t, "video"))),
      ...((designStore?.tasks || []).map((t) => taskProfile(t, "image"))),
    ];
    const byTaskId = {};
    for (const p of profiles) byTaskId[`${p.kind}:${p.id}`] = p;

    // Elke ad die in de periode spend óf orders had
    const adIds = new Set([...Object.keys(ads), ...Object.keys(ordersByAd)]);
    const rows = [];
    const unmatched = [];

    for (const adId of adIds) {
      const a = ads[adId] || { adId, adName: "", adsetName: "", campaignId: "", campaignName: "", spend: 0, impressions: 0, clicks: 0, firstDay: "", lastDay: "", activeDays: 0 };
      const o = ordersByAd[adId] || { orders: 0, revenue: 0, cogs: 0 };

      const manual = links?.[adId];
      let task = manual ? byTaskId[`${manual.kind}:${manual.taskId}`] || null : null;
      const linkedManually = !!task;
      if (!task && a.adName) task = bestTask(a.adName, profiles);

      const spend = round2(a.spend);
      const revenue = round2(o.revenue);
      const profit = round2(o.revenue - o.cogs - a.spend);
      const base = {
        adId,
        adName: a.adName || `ad ${adId}`,
        adsetName: a.adsetName,
        campaignName: a.campaignName,
        spend,
        impressions: a.impressions,
        clicks: a.clicks,
        orders: o.orders,
        revenue,
        roas: spend > 0 ? round2(revenue / spend) : null,
        cvr: a.clicks > 0 ? round2((o.orders / a.clicks) * 100) : null,
        cac: o.orders > 0 ? round2(spend / o.orders) : null,
        firstDay: a.firstDay || "",
        lastDay: a.lastDay || "",
        activeDays: a.activeDays,
        live: !!a.lastDay && a.lastDay >= shiftDays(localDateStr(new Date()), -1),
        winner: spend >= WINNER_MIN_SPEND && spend > 0 && revenue / spend >= WINNER_MIN_ROAS,
      };
      // Profit (en dus COGS) alleen voor admin/finance — marges blijven intern
      if (isFinance) {
        base.profit = profit;
        base.cogs = round2(o.cogs);
      }

      if (task) {
        rows.push({
          ...base,
          taskId: task.id,
          kind: task.kind,
          editor: task.editorName,
          editorEmail: task.editorEmail,
          strategist: task.strategistName,
          product: task.productTitle,
          productImage: task.productImage,
          angle: task.angle,
          type: task.type,
          linkedManually,
        });
      } else if (spend > 0 || o.orders > 0) {
        unmatched.push(base);
      }
    }

    rows.sort((x, y) => y.revenue - x.revenue || y.spend - x.spend);
    unmatched.sort((x, y) => y.spend - x.spend);

    // Keuzelijst voor handmatig koppelen (alleen admin) — alleen taken die al een editor + product hebben
    const taskOptions = isAdmin
      ? profiles
          .filter((p) => p.productTitle && p.editorName)
          .map((p) => ({ taskId: p.id, kind: p.kind, label: p.naming, editor: p.editorName, product: p.productTitle, status: p.status }))
          .sort((x, y) => x.label.localeCompare(y.label))
      : [];

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      from,
      to,
      showProfit: isFinance,
      isAdmin,
      me: { email: (session.email || "").toLowerCase(), name: session.name || "", roles },
      winnerRule: { minSpend: WINNER_MIN_SPEND, minRoas: WINNER_MIN_ROAS },
      rows,
      unmatched: isAdmin ? unmatched : [],
      unmatchedCount: unmatched.length,
      taskOptions,
    });
  } catch (error) {
    console.error("Creatives Data error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
