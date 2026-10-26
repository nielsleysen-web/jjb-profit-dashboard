// pages/api/ab-checkout.js — Resultaten van de A/B-test checkout NeuroTone (middleware.js: variant A = index.html, B = b.html).
//
// Noemer: paginaweergaven per variant (1 per sessie, /api/checkout/ab-view → Redis abck:views:*).
// Teller: Shopify-orders met tag checkout-ab-a / checkout-ab-b (Stripe én PayPal; de webhook/PayPal-flow zet de tag).
// Per variant: weergaven, orders, conversie, omzet, omzet per weergave, gemiddelde order, verzekering gekozen (alleen B),
// PayPal-aandeel, en de kans dat B écht beter converteert (2-proporties z-test).
// Variant C (c.html, 3 offers op de checkout, link ?ab=c van de nieuwe salespagina; tag checkout-ab-c): ander soort test —
// iedereen die op de knop klikt komt op de checkout, dus C-weergaven ≠ A/B-weergaven. Vergelijk per salespagina-bezoeker:
// salespageTest geeft orders/omzet sinds de start van C voor de oude flow (A+B) en de nieuwe (C); deel door de
// bezoekers per variatie in de split test van Funnelish.
// GET (ingelogd: admin / finance / Funnel Builder) → { success, start, mode, days: [...], a, b, c, probBBetter, salespageTest }
import { getDashboardSession } from "../../lib/dashboard-session";
import { redis, storeConfigured } from "../../lib/portal-store";
import { shopifyGraphql } from "../../lib/shopify-admin";

export const config = { maxDuration: 60 };
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const day = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

function probBetter(okA, nA, okB, nB) {
  if (!nA || !nB) return null;
  const pA = okA / nA, pB = okB / nB, p = (okA + okB) / (nA + nB);
  const se = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB));
  if (!se) return pB === pA ? 0.5 : pB > pA ? 1 : 0;
  const z = (pB - pA) / se;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return r3(z > 0 ? 1 - q : q);
}

async function ordersFor(v) {
  const out = [];
  let after = null;
  for (let i = 0; i < 20; i++) {
    const d = await shopifyGraphql(
      `query($q: String!, $after: String) { orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT) {
        nodes { name createdAt tags cancelledAt totalPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } }
        pageInfo { hasNextPage endCursor } } }`,
      { q: `tag:'checkout-ab-${v}'`, after }
    );
    out.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    after = d.orders.pageInfo.endCursor;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getDashboardSession(req);
  const roles = Array.isArray(s?.roles) ? s.roles : [];
  if (!s || !(s.finance || s.admin || roles.includes("Funnel Builder"))) return res.status(401).json({ success: false, error: "No access" });
  try {
    const views = { a: 0, b: 0, c: 0 };
    let start = null, startC = null;
    const perDay = {};
    if (storeConfigured()) {
      const [va, vb, vc, st, stc] = await Promise.all([redis(["GET", "abck:views:a"]), redis(["GET", "abck:views:b"]), redis(["GET", "abck:views:c"]), redis(["GET", "abck:start"]), redis(["GET", "abck:start:c"])]);
      views.a = parseInt(va || "0", 10); views.b = parseInt(vb || "0", 10); views.c = parseInt(vc || "0", 10); start = st || null; startC = stc || null;
      if (start) {
        const days = [];
        for (let t = Date.parse(start); t <= Date.now() + 3600e3; t += 86400e3) days.push(day(t));
        if (!days.includes(day(Date.now()))) days.push(day(Date.now()));
        const vals = await redis(["MGET", ...days.flatMap((d) => [`abck:views:${d}:a`, `abck:views:${d}:b`, `abck:views:${d}:c`])]);
        days.forEach((d, i) => { perDay[d] = { d, viewsA: parseInt(vals[3 * i] || "0", 10), viewsB: parseInt(vals[3 * i + 1] || "0", 10), viewsC: parseInt(vals[3 * i + 2] || "0", 10), ordersA: 0, ordersB: 0, ordersC: 0, revenueA: 0, revenueB: 0, revenueC: 0 }; });
      }
    }
    const [oa, ob, oc] = await Promise.all([ordersFor("a"), ordersFor("b"), ordersFor("c")]);
    const sum = (list, v) => {
      const ok = list.filter((o) => !o.cancelledAt);
      const revenue = ok.reduce((t, o) => t + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0) - parseFloat(o.totalRefundedSet?.shopMoney?.amount || 0), 0);
      for (const o of ok) {
        const d = day(o.createdAt);
        const row = (perDay[d] ||= { d, viewsA: 0, viewsB: 0, viewsC: 0, ordersA: 0, ordersB: 0, ordersC: 0, revenueA: 0, revenueB: 0, revenueC: 0 });
        const V = v.toUpperCase();
        row["orders" + V]++;
        row["revenue" + V] = r2(row["revenue" + V] + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0));
      }
      const n = views[v];
      return {
        views: n, orders: ok.length, conversion: n ? r3(ok.length / n) : null,
        revenue: r2(revenue), revenuePerView: n ? r2(revenue / n) : null, aov: ok.length ? r2(revenue / ok.length) : null,
        insurance: ok.filter((o) => (o.tags || []).includes("shipping-insurance")).length,
        insuranceRate: ok.length ? r3(ok.filter((o) => (o.tags || []).includes("shipping-insurance")).length / ok.length) : null,
        paypal: ok.filter((o) => (o.tags || []).includes("paypal")).length,
        cancelled: list.length - ok.length,
      };
    };
    const a = sum(oa, "a"), b = sum(ob, "b"), c = sum(oc, "c");
    // Salespagina-test: oude flow (offers op de salespagina → checkout A/B) vs nieuwe (C), sinds de eerste C-weergave
    const since = (list) => (startC ? list.filter((o) => !o.cancelledAt && o.createdAt >= startC) : []);
    const tot = (list) => ({ orders: list.length, revenue: r2(list.reduce((t, o) => t + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0) - parseFloat(o.totalRefundedSet?.shopMoney?.amount || 0), 0)) });
    const salespageTest = { start: startC, oldFlow: tot([...since(oa), ...since(ob)]), newFlow: tot(since(oc)) };
    return res.status(200).json({
      success: true, start, mode: process.env.JJ_CHECKOUT_AB || "50",
      a, b, c, probBBetter: probBetter(a.orders, a.views, b.orders, b.views), salespageTest,
      days: Object.values(perDay).sort((x, y) => x.d.localeCompare(y.d)),
    });
  } catch (e) {
    console.error("ab-checkout:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
