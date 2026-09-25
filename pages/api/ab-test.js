// pages/api/ab-test.js — A/B Tests
// Eén duidelijke vergelijking per split test (Funnelish-varianten op dezelfde URL):
// per variant bezoekers, checkout-kliks, orders, omzet, CVR, AOV en omzet per bezoeker,
// plus een dagreeks en een statistische toets (2-proporties z-test) op de order-conversie.
// Bron: jjb-track beacons (Redis, fmv:*) + Shopify-orders (attribution-store, jjb_pgs).
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD | ?days=N

import crypto from "crypto";
import axios from "axios";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;

function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const tok = match ? match[1] : null;
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  if (crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url") !== sig) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp && p.exp > Date.now() ? p : null; } catch { return null; }
}

let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET });
  const r = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { token: r.data.access_token, expiresAt: Date.now() + (r.data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}
async function readData(handle) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const r = await axios.post(`https://${storeUrl}/admin/api/2025-01/graphql.json`,
    { query: `query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`, variables: { handle } },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 });
  const raw = r.data?.data?.metaobjectByHandle?.field?.value;
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function redis(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(`${R_URL}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return r.json();
}
async function mget(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 400) {
    const r = await redis([["MGET", ...keys.slice(i, i + 400)]]);
    out.push(...(r[0]?.result || []));
  }
  return out.map((v) => parseInt(v || "0", 10) || 0);
}

// Normale verdeling: P(Z < z)
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
// 2-proporties z-test (orders / unieke bezoekers): kans dat B écht beter is dan A
function zTest(aConv, aN, bConv, bN) {
  if (aN < 1 || bN < 1) return null;
  const pa = aConv / aN, pb = bConv / bN, p = (aConv + bConv) / (aN + bN);
  const se = Math.sqrt(p * (1 - p) * (1 / aN + 1 / bN));
  if (!se) return null;
  const z = (pb - pa) / se;
  return { z, probBetter: phi(z), pValue: 2 * (1 - phi(Math.abs(z))) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    const roles = Array.isArray(s?.roles) ? s.roles : [];
    if (!s || !(s.finance || s.admin || roles.includes("Funnel Builder"))) return res.status(401).json({ success: false, error: "No access" });
    if (!R_URL || !R_TOK) return res.status(200).json({ success: true, configured: false, tests: [] });

    const isDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
    const today = new Date().toISOString().slice(0, 10);
    let from = isDate(req.query.from) ? req.query.from : null;
    let to = isDate(req.query.to) ? req.query.to : null;
    if (!from || !to) {
      const days = Math.min(92, Math.max(1, parseInt(req.query.days || "30", 10) || 30));
      to = today; from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    }
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    const dates = [];
    for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86400000) dates.push(new Date(ms).toISOString().slice(0, 10));

    // 1. hosts → paden → varianten (alleen paden met ≥2 varianten in de periode)
    const hostSets = await redis(dates.map((d) => ["SMEMBERS", `fmh:${d}`]));
    const dh = []; dates.forEach((d, i) => (hostSets[i]?.result || []).forEach((h) => dh.push([d, h])));
    const pathSets = await redis(dh.map(([d, h]) => ["SMEMBERS", `fmp:${d}:${h}`]));
    const dhp = []; pathSets.forEach((r, i) => (r?.result || []).forEach((p) => dhp.push([...dh[i], p])));
    const varSets = await redis(dhp.map(([d, h, p]) => ["SMEMBERS", `fmvs:${d}:${h}:${p}`]));
    const rows = []; // [d,h,p,vid]
    varSets.forEach((r, i) => (r?.result || []).forEach((vid) => rows.push([...dhp[i], vid])));
    const K = ["pv", "pvu", "cc", "ccu"];
    const vals = await mget(rows.flatMap(([d, h, p, v]) => K.map((k) => `fmv:${d}:${h}:${p}:${v}:${k}`)));

    // tests[host|path].variants[vid] = { totals, days{d:{pvu,ccu}} }
    const tests = {};
    rows.forEach(([d, h, p, vid], i) => {
      const t = (tests[`${h}|${p}`] = tests[`${h}|${p}`] || { host: h, path: p, variants: {} });
      const v = (t.variants[vid] = t.variants[vid] || { pv: 0, pvu: 0, cc: 0, ccu: 0, orders: 0, revenue: 0, days: {} });
      const day = (v.days[d] = v.days[d] || { pvu: 0, ccu: 0, o: 0, r: 0 });
      K.forEach((k, j) => { const n = vals[i * 4 + j]; v[k] += n; if (k === "pvu") day.pvu += n; if (k === "ccu") day.ccu += n; });
    });
    for (const key of Object.keys(tests)) if (Object.keys(tests[key].variants).length < 2) delete tests[key];

    // 2. orders per variant (jjb_pgs op de order) uit de attribution-store
    const store = (await readData("attribution")) || { orders: {} };
    const sinceMs = Date.parse(`${from}T00:00:00Z`), untilMs = Date.parse(`${to}T23:59:59.999Z`);
    const byVid = {};
    for (const o of Object.values(store.orders || {})) {
      if (!o.at) continue;
      const ms = new Date(o.at).getTime();
      if (ms < sinceMs || ms > untilMs) continue;
      const d = o.at.slice(0, 10);
      for (const pg of Array.isArray(o.pgs) ? o.pgs : []) {
        const b = (byVid[pg] = byVid[pg] || { o: 0, r: 0, days: {} });
        b.o += 1; b.r += o.value || 0;
        const dd = (b.days[d] = b.days[d] || { o: 0, r: 0 }); dd.o += 1; dd.r += o.value || 0;
      }
    }

    // 3. response
    const out = Object.values(tests).map((t) => {
      const vids = Object.keys(t.variants).sort();
      const variants = vids.map((id, idx) => {
        const v = t.variants[id]; const ob = byVid[id] || { o: 0, r: 0, days: {} };
        const series = dates.map((d) => ({ d, pvu: v.days[d]?.pvu || 0, ccu: v.days[d]?.ccu || 0, o: ob.days[d]?.o || 0, r: Math.round((ob.days[d]?.r || 0) * 100) / 100 }));
        return {
          id, letter: String.fromCharCode(65 + idx),
          pv: v.pv, pvu: v.pvu, cc: v.cc, ccu: v.ccu,
          orders: ob.o, revenue: Math.round(ob.r * 100) / 100,
          cvr: v.pvu > 0 ? ob.o / v.pvu : 0,
          ctr: v.pvu > 0 ? v.ccu / v.pvu : 0,
          aov: ob.o > 0 ? ob.r / ob.o : 0,
          rpv: v.pvu > 0 ? ob.r / v.pvu : 0,
          series,
        };
      });
      const [a, b] = variants;
      const stat = zTest(a.orders, a.pvu, b.orders, b.pvu);
      const lift = (x, y) => (x > 0 ? (y - x) / x : null);
      return {
        key: `${t.host}${t.path}`, host: t.host, path: t.path, variants,
        compare: {
          cvrLift: lift(a.cvr, b.cvr), rpvLift: lift(a.rpv, b.rpv), ctrLift: lift(a.ctr, b.ctr), aovLift: lift(a.aov, b.aov),
          probBetter: stat?.probBetter ?? null, pValue: stat?.pValue ?? null,
          enough: a.pvu >= 100 && b.pvu >= 100 && a.orders + b.orders >= 20,
        },
      };
    }).sort((x, y) => (y.variants[0].pvu + y.variants[1].pvu) - (x.variants[0].pvu + x.variants[1].pvu));

    return res.status(200).json({ success: true, configured: true, from, to, tests: out });
  } catch (e) {
    console.error("ab-test:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
