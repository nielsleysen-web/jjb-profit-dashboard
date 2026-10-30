// pages/api/ab-bump.js — Resultaten van de A/B-test order bump op de UrinaPatches-checkout (Spray Neutralizzante 9,95 €).
//
// Variant a = checkout zonder bump, b = met bump ("Aggiungi" boven het totaal). Verdeling: Vercel-env JJ_BUMP_AB
// (percentage dat B ziet; standaard 50, "off" = test uit, 100 = iedereen B); checkout.js bepaalt de variant per bezoeker
// (cookie jj_bump, 30 dagen) en meldt 1 weergave per sessie via /api/checkout/ab-view { bump: "a"|"b" } → Redis abbump:views:*.
// Orders: Shopify-tag bump-ab-a / bump-ab-b (Stripe-webhook en PayPal-flow); bump gekozen = tag bump-spray.
// Winnaar = omzet per weergave (B betaalt zich terug als de extra 9,95 € de eventuele lagere conversie goedmaakt).
// GET (ingelogd: admin / finance / Funnel Builder) → { success, start, mode, a, b, probBBetter, days }
import { getDashboardSession } from "../../lib/dashboard-session";
import { redis, storeConfigured } from "../../lib/portal-store";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { BUMP_SPRAY } from "../../lib/checkout";

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
      { q: `tag:'bump-ab-${v}'`, after }
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
    const views = { a: 0, b: 0 };
    let start = null;
    const perDay = {};
    if (storeConfigured()) {
      const [va, vb, st] = await Promise.all([redis(["GET", "abbump:views:a"]), redis(["GET", "abbump:views:b"]), redis(["GET", "abbump:start"])]);
      views.a = parseInt(va || "0", 10); views.b = parseInt(vb || "0", 10); start = st || null;
      if (start) {
        const days = [];
        for (let t = Date.parse(start); t <= Date.now() + 3600e3; t += 86400e3) days.push(day(t));
        if (!days.includes(day(Date.now()))) days.push(day(Date.now()));
        const vals = await redis(["MGET", ...days.flatMap((d) => [`abbump:views:${d}:a`, `abbump:views:${d}:b`])]);
        days.forEach((d, i) => { perDay[d] = { d, viewsA: parseInt(vals[2 * i] || "0", 10), viewsB: parseInt(vals[2 * i + 1] || "0", 10), ordersA: 0, ordersB: 0, revenueA: 0, revenueB: 0, bumpsB: 0 }; });
      }
    }
    const [oa, ob] = await Promise.all([ordersFor("a"), ordersFor("b")]);
    const sum = (list, v) => {
      const ok = list.filter((o) => !o.cancelledAt);
      const revenue = ok.reduce((t, o) => t + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0) - parseFloat(o.totalRefundedSet?.shopMoney?.amount || 0), 0);
      const bumps = ok.filter((o) => (o.tags || []).includes(BUMP_SPRAY.tag)).length;
      for (const o of ok) {
        const d = day(o.createdAt);
        const row = (perDay[d] ||= { d, viewsA: 0, viewsB: 0, ordersA: 0, ordersB: 0, revenueA: 0, revenueB: 0, bumpsB: 0 });
        const V = v.toUpperCase();
        row["orders" + V]++;
        row["revenue" + V] = r2(row["revenue" + V] + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0));
        if (v === "b" && (o.tags || []).includes(BUMP_SPRAY.tag)) row.bumpsB++;
      }
      const n = views[v];
      return {
        views: n, orders: ok.length, conversion: n ? r3(ok.length / n) : null,
        revenue: r2(revenue), revenuePerView: n ? r2(revenue / n) : null, aov: ok.length ? r2(revenue / ok.length) : null,
        bumps, bumpRate: ok.length ? r3(bumps / ok.length) : null, bumpRevenue: r2(bumps * BUMP_SPRAY.price / 100),
        paypal: ok.filter((o) => (o.tags || []).includes("paypal")).length,
        cancelled: list.length - ok.length,
      };
    };
    const a = sum(oa, "a"), b = sum(ob, "b");
    return res.status(200).json({
      success: true, start, mode: process.env.JJ_BUMP_AB || "50", bump: { title: BUMP_SPRAY.title, price: BUMP_SPRAY.price },
      a, b, probBBetter: probBetter(a.orders, a.views, b.orders, b.views),
      days: Object.values(perDay).sort((x, y) => x.d.localeCompare(y.d)),
    });
  } catch (e) {
    console.error("ab-bump:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
