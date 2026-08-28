// pages/api/funnel-metrics.js — Funnel Metrics overzicht
// Leest de tellers uit Upstash Redis (pageviews, unieke bezoekers, checkout-kliks per
// host+pad per dag) en legt er de Shopify-orders naast (via de attribution-store, waar
// jjb_host op de order zegt uit welke funnel hij kwam).
// GET ?days=7 → { funnels: [{ host, steps: [...], orders, revenue }], noHostOrders, noHostRevenue }

import crypto from "crypto";
import axios from "axios";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;

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

/* ---- Shopify (voor de attribution-store met orders) ---- */
let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000,
  });
  tokenCache = { token: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 3600) * 1000 };
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
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/* ---- Redis ---- */
async function redisPipeline(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return r.json(); // [{result: ...}, ...]
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = getSession(req);
    // Toegang: admin, finance, én funnel builders (het tabblad staat onder Product Launching)
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    if (!session || !(session.finance || session.admin || roles.includes("Funnel Builder"))) {
      return res.status(401).json({ success: false, error: "No access" });
    }
    if (req.method !== "GET") return res.status(405).json({ success: false });
    if (!R_URL || !R_TOK) {
      return res.status(200).json({ success: true, configured: false, funnels: [], noHostOrders: 0, noHostRevenue: 0 });
    }

    // Periode: ?from=YYYY-MM-DD&to=YYYY-MM-DD (vrije range), of ?days=N (laatste N dagen)
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
    const today = new Date().toISOString().slice(0, 10);
    let from = isDate(req.query.from) ? req.query.from : null;
    let to = isDate(req.query.to) ? req.query.to : null;
    if (!from || !to) {
      const days = Math.min(92, Math.max(1, parseInt(req.query.days || "7", 10) || 7));
      to = today;
      from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    }
    if (from > to) { const t = from; from = to; to = t; }
    if (to > today) to = today;
    // Range begrenzen op 92 dagen (retentie van de tellers is 90 dagen)
    const fromMsRaw = Date.parse(`${from}T00:00:00Z`);
    const toMsRaw = Date.parse(`${to}T00:00:00Z`);
    if ((toMsRaw - fromMsRaw) / 86400000 > 91) from = new Date(toMsRaw - 91 * 86400000).toISOString().slice(0, 10);
    const dates = [];
    for (let ms = Date.parse(`${to}T00:00:00Z`); ms >= Date.parse(`${from}T00:00:00Z`); ms -= 86400000) {
      dates.push(new Date(ms).toISOString().slice(0, 10));
    }

    // 1. Hosts per dag
    const hostSets = await redisPipeline(dates.map((d) => ["SMEMBERS", `fmh:${d}`]));
    const hostsByDate = {};
    const allHosts = new Set();
    dates.forEach((d, i) => {
      const hs = hostSets[i]?.result || [];
      hostsByDate[d] = hs;
      hs.forEach((h) => allHosts.add(h));
    });

    // 2. Paden per (dag, host)
    const pathCmds = [];
    const pathIdx = [];
    for (const d of dates) for (const h of hostsByDate[d]) { pathCmds.push(["SMEMBERS", `fmp:${d}:${h}`]); pathIdx.push([d, h]); }
    const pathSets = await redisPipeline(pathCmds);
    const triples = []; // [date, host, path]
    pathSets.forEach((r, i) => {
      const [d, h] = pathIdx[i];
      for (const p of r?.result || []) triples.push([d, h, p]);
    });

    // 3. Tellers per (dag, host, pad) — 4 keys per triple, in chunks via MGET
    const KEYS = ["pv", "pvu", "cc", "ccu"];
    const flatKeys = [];
    for (const [d, h, p] of triples) for (const k of KEYS) flatKeys.push(`fm:${d}:${h}:${p}:${k}`);
    const values = [];
    for (let i = 0; i < flatKeys.length; i += 400) {
      const chunk = flatKeys.slice(i, i + 400);
      const out = await redisPipeline([["MGET", ...chunk]]);
      values.push(...(out[0]?.result || []));
    }

    // Groeperen per FUNNEL: host + eerste padsegment (try.getjustjenny.com/lubrisense),
    // met per funnel ook een dagreeks voor de trendgrafiek
    const keyOf = (h, p) => { const s = (p.split("/")[1] || "").toLowerCase(); return s ? `${h}/${s}` : h; };
    const fun = {}; // key → { host, paths: {pad: tellers}, days: {datum: {u, pv, cc}} }
    triples.forEach(([d, h, p], i) => {
      const key = keyOf(h, p);
      const f = (fun[key] = fun[key] || { host: h, paths: {}, days: {} });
      const bucket = (f.paths[p] = f.paths[p] || { pv: 0, pvu: 0, cc: 0, ccu: 0 });
      const day = (f.days[d] = f.days[d] || { u: 0, pv: 0, cc: 0 });
      KEYS.forEach((k, j) => {
        const v = parseInt(values[i * 4 + j] || "0", 10) || 0;
        bucket[k] += v;
        if (k === "pvu") day.u += v;
        if (k === "pv") day.pv += v;
        if (k === "ccu") day.cc += v;
      });
    });

    // 4. Orders per funnel-host uit de attribution-store (jjb_host op de order)
    const store = (await readData("attribution")) || { orders: {} };
    const sinceMs = Date.parse(`${from}T00:00:00Z`);
    const untilMs = Date.parse(`${to}T23:59:59.999Z`);
    // Product (naam + foto) per funnel-key, gematcht via de links op de funnel-taken in het CRM
    const keyFromUrl = (u) => {
      try {
        const url = new URL(u);
        const s = (url.pathname.split("/")[1] || "").toLowerCase();
        return s ? `${url.host.toLowerCase()}/${s}` : url.host.toLowerCase();
      } catch { return null; }
    };
    let productByKey = {};
    try {
      const launchStore = (await readData("launch-tasks")) || { tasks: [] };
      for (const t of launchStore.tasks || []) {
        const prod = { title: t.productName || t.product?.title || "", image: t.product?.image || "" };
        if (!prod.title && !prod.image) continue;
        for (const link of [t.advertorialLink, t.funnelishLink, t.finalCampaignLink]) {
          if (!link) continue;
          const k = keyFromUrl(link);
          if (k && !productByKey[k]) productByKey[k] = prod;
        }
      }
    } catch {}

    // Orders per funnel-key (jjb_host + jjb_path op de order); oudere orders zonder
    // padsegment vallen terug op de host-root-rij van dat domein
    const ordersBy = {}; // key → { orders, revenue, days: {datum: {o, r}} }
    let noHostOrders = 0, noHostRevenue = 0;
    for (const o of Object.values(store.orders || {})) {
      if (!o.at) continue;
      const t = new Date(o.at).getTime();
      if (t < sinceMs || t > untilMs) continue;
      const h = (o.host || "").toLowerCase();
      if (!h) { noHostOrders += 1; noHostRevenue += o.value || 0; continue; }
      const key = o.path ? `${h}/${String(o.path).toLowerCase()}` : h;
      const tgt = (ordersBy[key] = ordersBy[key] || { orders: 0, revenue: 0, days: {} });
      tgt.orders += 1;
      tgt.revenue += o.value || 0;
      const d = (o.at || "").slice(0, 10);
      const dd = (tgt.days[d] = tgt.days[d] || { o: 0, r: 0 });
      dd.o += 1;
      dd.r += o.value || 0;
    }

    // 5. Response: per funnel de stappen (gesorteerd op uniques) + dagreeks voor de grafiek
    const datesAsc = [...dates].reverse();
    const allKeys = new Set([...Object.keys(fun), ...Object.keys(ordersBy)]);
    const funnels = [...allKeys].map((key) => {
      const f = fun[key];
      const ob = ordersBy[key];
      const steps = Object.entries(f?.paths || {})
        .map(([path, m]) => ({ path, ...m }))
        .sort((a, b) => b.pvu - a.pvu || b.pv - a.pv);
      const series = datesAsc.map((d) => ({
        d,
        u: f?.days?.[d]?.u || 0,
        pv: f?.days?.[d]?.pv || 0,
        cc: f?.days?.[d]?.cc || 0,
        o: ob?.days?.[d]?.o || 0,
        r: Math.round((ob?.days?.[d]?.r || 0) * 100) / 100,
      }));
      return {
        key,
        host: f?.host || key.split("/")[0],
        product: productByKey[key] || null,
        steps,
        series,
        totalUniques: steps.length ? steps[0].pvu : 0,
        checkoutClicks: steps.reduce((s, x) => s + x.ccu, 0),
        orders: ob?.orders || 0,
        revenue: Math.round((ob?.revenue || 0) * 100) / 100,
      };
    }).sort((a, b) => b.totalUniques - a.totalUniques || b.revenue - a.revenue);

    return res.status(200).json({ success: true, configured: true, from, to, funnels, noHostOrders, noHostRevenue: Math.round(noHostRevenue * 100) / 100 });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
