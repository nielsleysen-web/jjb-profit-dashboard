// pages/api/attribution.js
// First-party ad attribution + Meta Conversions API (vervangt WeTracked).
//
// Flow:
//   1. jjb-track.js (op alle funnelpagina's + auto in /a/ advertorials) bewaart
//      fbclid/ad_id/adset_id/campaign_id/fbp/fbc en zet ze bij de checkout-klik
//      als attributes[jjb_...] op de Shopify cart-permalink → note attributes op de order.
//   2. Deze API scant elke ~5 min de recente orders (kick vanuit het dashboard),
//      leest de jjb_-attributes en slaat de attributie per order op:
//      order → exact ad-ID, adset, campagne.
//   3. Meta CAPI: zodra CAPI_ENABLED=1 in Vercel staat, wordt per order een
//      server-side Purchase-event naar Meta gestuurd met fbc/fbp + gehashte
//      klantgegevens (event_id = order-ID voor deduplicatie).
//      → NU NOG UIT (WeTracked draait parallel; dubbel sturen = dubbel tellen).
//
// Env: META_PIXEL_ID, META_CAPI_TOKEN (Events Manager → instellingen → Conversions API),
//      CAPI_ENABLED=1 (pas bij de omschakeling), optioneel META_TEST_EVENT_CODE (testen).

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 120 };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const SCAN_INTERVAL_MS = 4 * 60 * 1000; // max 1 scan per 4 min
const LOOKBACK_DAYS = 3;                // orders van de laatste 3 dagen scannen
const MAX_STORED_ORDERS = 600;

/* ---------------- session & internal key ---------------- */
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
const internalKey = () => crypto.createHmac("sha256", SESSION_SECRET).update("attribution:scan").digest("base64url");

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

/* ---------------- Meta CAPI ---------------- */
const sha = (v) => (v ? crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex") : undefined);

async function sendCapiPurchase(order, attrib) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) throw new Error("META_PIXEL_ID / META_CAPI_TOKEN not set");

  const addr = order.billingAddress || {};
  const userData = {
    em: order.email ? [sha(order.email)] : undefined,
    ph: order.phone ? [sha(String(order.phone).replace(/[^\d]/g, ""))] : undefined,
    fn: addr.firstName ? [sha(addr.firstName)] : undefined,
    ln: addr.lastName ? [sha(addr.lastName)] : undefined,
    ct: addr.city ? [sha(String(addr.city).replace(/[^a-z]/gi, ""))] : undefined,
    zp: addr.zip ? [sha(String(addr.zip).replace(/\s/g, ""))] : undefined,
    country: addr.countryCode ? [sha(addr.countryCode)] : undefined,
    client_ip_address: order.clientIp || undefined,
    external_id: attrib.vid ? [sha(attrib.vid)] : undefined,
    fbc: attrib.fbc || undefined,
    fbp: attrib.fbp || undefined,
  };
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k]);

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(order.createdAt).getTime() / 1000),
    event_id: `jjb-${order.name.replace("#", "")}`, // deduplicatie
    action_source: "website",
    event_source_url: attrib.lastUrl || `https://${process.env.SHOPIFY_STORE_URL}`,
    user_data: userData,
    custom_data: {
      currency: order.currentTotalPriceSet?.shopMoney?.currencyCode || "EUR",
      value: parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || 0),
      order_id: order.name,
    },
  };
  const body = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const r = await axios.post(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, body, { timeout: 15000 });
  return r.data;
}

/* ---------------- Meta ad-level insights (voor het dashboard) ---------------- */
// Spend per AD (niet per campagne) zodat we per exacte ad ROAS/CPA kunnen tonen.
const localDateStr = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
let adInsightsCache = { key: "", at: 0, data: null };

async function fetchAdInsights(since, until) {
  const cacheKey = `${since}:${until}`;
  if (adInsightsCache.data && adInsightsCache.key === cacheKey && Date.now() - adInsightsCache.at < 120000) {
    return adInsightsCache.data;
  }
  const token = process.env.META_ACCESS_TOKEN;
  const accountIds = (process.env.META_AD_ACCOUNT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const byAd = {};
  if (!token || !accountIds.length) return byAd;

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        let url = `https://graph.facebook.com/v21.0/act_${accountId}/insights`;
        let params = {
          access_token: token,
          level: "ad",
          fields: "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,unique_outbound_clicks,actions",
          time_range: JSON.stringify({ since, until }),
          limit: 500,
        };
        for (let p = 0; p < 3 && url; p++) {
          const r = await axios.get(url, { params, timeout: 15000 });
          for (const row of r.data?.data || []) {
            const id = row.ad_id;
            if (!id) continue;
            if (!byAd[id]) {
              byAd[id] = { adName: row.ad_name || "", adsetId: row.adset_id || "", adsetName: row.adset_name || "", campaignId: row.campaign_id || "", campaignName: row.campaign_name || "", spend: 0, impressions: 0, outboundClicks: 0, checkouts: 0 };
            }
            byAd[id].spend += parseFloat(row.spend || 0);
            byAd[id].impressions += parseFloat(row.impressions || 0);
            byAd[id].outboundClicks += (row.unique_outbound_clicks || []).reduce((s, a) => s + parseFloat(a.value || 0), 0);
            const acts = row.actions || [];
            const ic = acts.find((a) => a.action_type === "initiate_checkout") || acts.find((a) => a.action_type === "omni_initiated_checkout");
            byAd[id].checkouts += ic ? parseFloat(ic.value || 0) : 0;
          }
          url = r.data?.paging?.next || null;
          params = undefined; // de next-URL bevat alle parameters al
        }
      } catch (e) {
        console.warn(`Ad insights error (act ${accountId}):`, e.response?.data?.error?.message || e.message);
      }
    })
  );

  adInsightsCache = { key: cacheKey, at: Date.now(), data: byAd };
  return byAd;
}

// Budgetten van campagnes en adsets (voor de Budget-kolom); 10 min cache
let budgetsCache = { at: 0, data: null };
async function fetchBudgets() {
  if (budgetsCache.data && Date.now() - budgetsCache.at < 600000) return budgetsCache.data;
  const token = process.env.META_ACCESS_TOKEN;
  const accountIds = (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = { campaigns: {}, adsets: {} };
  if (!token || !accountIds.length) return out;
  const label = (row) => {
    if (row.daily_budget) return `€${(parseFloat(row.daily_budget) / 100).toFixed(2)}/day`;
    if (row.lifetime_budget) return `€${(parseFloat(row.lifetime_budget) / 100).toFixed(2)} lifetime`;
    return "";
  };
  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        const [c, s] = await Promise.all([
          axios.get(`https://graph.facebook.com/v21.0/act_${accountId}/campaigns`, { params: { access_token: token, fields: "id,daily_budget,lifetime_budget", limit: 500 }, timeout: 15000 }),
          axios.get(`https://graph.facebook.com/v21.0/act_${accountId}/adsets`, { params: { access_token: token, fields: "id,daily_budget,lifetime_budget", limit: 500 }, timeout: 15000 }),
        ]);
        for (const row of c.data?.data || []) out.campaigns[row.id] = label(row);
        for (const row of s.data?.data || []) out.adsets[row.id] = label(row);
      } catch (e) {
        console.warn(`Budgets error (act ${accountId}):`, e.response?.data?.error?.message || e.message);
      }
    })
  );
  budgetsCache = { at: Date.now(), data: out };
  return out;
}

/* ---------------- de scan ---------------- */
async function runScan(force) {
  const store = (await readData("attribution")) || { orders: {}, capi: {}, lastScanAt: null };
  if (!force && store.lastScanAt && Date.now() - new Date(store.lastScanAt).getTime() < SCAN_INTERVAL_MS) {
    return { skipped: "recently scanned" };
  }
  store.lastScanAt = new Date().toISOString();

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const result = { attributed: 0, unattributed: 0, capiSent: 0, capiErrors: [] };
  let after = null;

  for (let page = 0; page < 8; page++) {
    const d = await shopifyGraphql(
      `query Orders($first: Int!, $query: String, $after: String) {
        orders(first: $first, query: $query, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            createdAt
            email
            phone
            clientIp
            customAttributes { key value }
            billingAddress { firstName lastName city zip countryCode }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 5) { nodes { title quantity product { title } } }
          }
        }
      }`,
      { first: 100, query: `created_at:>='${since}'`, after }
    );
    const conn = d.orders;

    for (const order of conn.nodes) {
      if (store.orders[order.name]) continue; // al verwerkt
      const attrs = {};
      for (const a of order.customAttributes || []) {
        if (a.key && a.key.startsWith("jjb_")) attrs[a.key.slice(4)] = a.value;
      }
      const products = order.lineItems.nodes.map((li) => li.product?.title || li.title).filter(Boolean);
      const entry = {
        at: order.createdAt,
        value: parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || 0),
        products: [...new Set(products)].slice(0, 5),
        adId: attrs.ad_id || "",
        adsetId: attrs.adset_id || "",
        campaignId: attrs.campaign_id || "",
        utmCampaign: attrs.utm_campaign || "",
        utmContent: attrs.utm_content || "",
        source: attrs.utm_source || (attrs.fbclid || attrs.fbc ? "facebook" : ""),
        fbclid: attrs.fbclid || "",
        fbc: attrs.fbc || "",
        fbp: attrs.fbp || "",
        vid: attrs.vid || "",
        host: (attrs.host || "").toLowerCase(), // first-touch funnel-domein → Funnel Metrics
        path: (attrs.path || "").toLowerCase(), // first-touch padsegment (funnel op dat domein)
        pgs: String(attrs.pgs || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12), // geziene A/B-varianten (pageids)
      };
      store.orders[order.name] = entry;
      if (entry.adId || entry.fbclid || entry.fbc) result.attributed++;
      else result.unattributed++;

      // CAPI: alleen als de schakelaar aan staat (na de WeTracked-omschakeling)
      if (process.env.CAPI_ENABLED === "1" && !store.capi[order.name]) {
        try {
          await sendCapiPurchase(order, { ...entry, lastUrl: "" });
          store.capi[order.name] = { at: new Date().toISOString() };
          result.capiSent++;
        } catch (e) {
          result.capiErrors.push(`${order.name}: ${String(e.response?.data?.error?.message || e.message).slice(0, 160)}`);
        }
      }
    }

    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }

  // Opslag begrensd houden: oudste orders eruit
  const names = Object.keys(store.orders);
  if (names.length > MAX_STORED_ORDERS) {
    names
      .sort((a, b) => (store.orders[a].at || "").localeCompare(store.orders[b].at || ""))
      .slice(0, names.length - MAX_STORED_ORDERS)
      .forEach((n) => {
        delete store.orders[n];
        delete store.capi[n];
      });
  }

  await writeData("attribution", store);
  return result;
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = getSession(req);
    const isAdmin = !!session?.admin;

    if (req.method === "GET") {
      // Toegang: admin, finance, én media buyers (het tabblad staat onder Media Buying)
      const roles = Array.isArray(session?.roles) ? session.roles : [];
      if (!session || !(session.finance || session.admin || roles.includes("Media Buyer"))) return res.status(401).json({ success: false, error: "No access" });
      const days = Math.min(90, Math.max(1, parseInt(req.query.days || "7", 10) || 7));
      const store = (await readData("attribution")) || { orders: {}, capi: {}, lastScanAt: null };

      const sinceMs = Date.now() - days * 24 * 3600 * 1000;
      const orders = Object.entries(store.orders)
        .map(([name, o]) => ({ name, ...o }))
        .filter((o) => o.at && new Date(o.at).getTime() >= sinceMs)
        .sort((a, b) => (b.at || "").localeCompare(a.at || ""));

      // Ad-level spend + budgetten voor dezelfde periode
      const until = localDateStr(new Date());
      const since = localDateStr(new Date(Date.now() - (days - 1) * 24 * 3600 * 1000));
      const [ads, budgets] = await Promise.all([fetchAdInsights(since, until), fetchBudgets()]);

      return res.status(200).json({
        success: true,
        lastScanAt: store.lastScanAt,
        capiEnabled: process.env.CAPI_ENABLED === "1",
        days,
        orders: orders.slice(0, 600),
        ads,
        budgets,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, key, force } = req.body || {};
    const isInternal = key && key === internalKey();
    if (!isInternal && !isAdmin) return res.status(401).json({ success: false, error: "No access" });

    if (action === "scan") {
      const result = await runScan(force === true);
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Attribution error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
