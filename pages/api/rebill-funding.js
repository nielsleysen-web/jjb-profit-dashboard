// pages/api/rebill-funding.js — Acceptatie van Stripe-rebills per kaarttype (credit / debit / prepaid / overig).
//
// Alle facturen met billing_reason subscription_cycle van de laatste N dagen (default 90). Per factuur het kaarttype
// van de kaart waarmee is (of zou worden) geïnd: de charge → anders de PaymentIntent → anders de standaardkaart van het
// abonnement. Uitkomst per factuur:
//   firstTry   meteen betaald (1 poging, geen ladder)
//   recovered  later alsnog betaald (Stripe-retry, kortingsladder of klant zelf)
//   open       nog open (in de ladder / retries)
//   lost       gevoid / oninbaar (abonnement opgezegd)
// GET ?days=90 (ingelogd: admin / finance) → { success, days, byFunding: { credit, debit, prepaid, other, unknown }, total }
import Stripe from "stripe";
import { getDashboardSession } from "../../lib/dashboard-session";
import { paidAmount } from "../../lib/stripe-dunning";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const config = { maxDuration: 60 };
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const idOf = (v) => (typeof v === "string" ? v : v?.id || null);

const empty = () => ({ invoices: 0, firstTry: 0, recovered: 0, open: 0, lost: 0, revenue: 0, fullValue: 0, brands: {}, declines: {} });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getDashboardSession(req);
  if (!s || !(s.finance || s.admin)) return res.status(401).json({ success: false, error: "No access" });
  if (!stripe) return res.status(500).json({ success: false, error: "Stripe niet geconfigureerd" });
  const days = Math.min(365, Math.max(1, parseInt(req.query.days || "90", 10) || 90));
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  try {
    const byFunding = { credit: empty(), debit: empty(), prepaid: empty(), other: empty(), unknown: empty() };
    const months = {};
    let n = 0;
    for await (const inv of stripe.invoices.list({ created: { gte: since }, limit: 100, expand: ["data.charge", "data.payment_intent.payment_method", "data.subscription.default_payment_method"] })) {
      if (++n > 5000) break;
      if (inv.billing_reason !== "subscription_cycle" || !(inv.amount_due > 0)) continue;
      if (inv.status === "draft" || inv.status === "deleted") continue;
      const ch = typeof inv.charge === "object" ? inv.charge : null;
      const pi = typeof inv.payment_intent === "object" ? inv.payment_intent : null;
      const pm = pi && typeof pi.payment_method === "object" ? pi.payment_method : null;
      const subPm = inv.subscription && typeof inv.subscription === "object" && typeof inv.subscription.default_payment_method === "object" ? inv.subscription.default_payment_method : null;
      const cardOf = (x) => x?.payment_method_details?.card || x?.card || null;
      const card = cardOf(ch) || cardOf(pm) || cardOf(subPm) || null;
      const type = ch?.payment_method_details?.type || pm?.type || subPm?.type || null;
      let funding = card?.funding || null;
      let key = funding === "credit" || funding === "debit" || funding === "prepaid" ? funding : type && type !== "card" ? "other" : funding ? "other" : "unknown";
      const md = inv.metadata || {};
      const dunning = md.jj_dunning || "";
      const dunningPaid = /^paid-/.test(md.jj_dunning_result || "");
      let outcome;
      if (inv.status === "paid") outcome = (inv.attempt_count || 0) <= 1 && !dunningPaid && !md.jj_dunning_enrolled ? "firstTry" : "recovered";
      else if (inv.status === "open") outcome = "open";
      else outcome = "lost"; // void / uncollectible
      const g = byFunding[key];
      g.invoices++; g[outcome]++;
      g.fullValue = r2(g.fullValue + (inv.amount_due || 0) / 100);
      if (inv.status === "paid") g.revenue = r2(g.revenue + paidAmount(inv));
      const brand = card?.brand || type || "?";
      g.brands[brand] = (g.brands[brand] || 0) + 1;
      if (outcome !== "firstTry") {
        const code = md.jj_dunning_code || pi?.last_payment_error?.decline_code || pi?.last_payment_error?.code || ch?.failure_code || "?";
        g.declines[code] = (g.declines[code] || 0) + 1;
      }
      const m = new Date(inv.created * 1000).toISOString().slice(0, 7);
      const row = (months[m] ||= { month: m });
      row[key] ||= { invoices: 0, paid: 0 };
      row[key].invoices++; if (inv.status === "paid") row[key].paid++;
    }
    const finish = (g) => ({
      ...g,
      firstTryRate: g.invoices ? r3(g.firstTry / g.invoices) : null,
      finalRate: g.invoices ? r3((g.firstTry + g.recovered) / g.invoices) : null,
      lostRate: g.invoices ? r3(g.lost / g.invoices) : null,
      revenueRate: g.fullValue ? r3(g.revenue / g.fullValue) : null,
    });
    const out = {}; for (const k of Object.keys(byFunding)) out[k] = finish(byFunding[k]);
    const tot = empty();
    for (const g of Object.values(byFunding)) { for (const k of ["invoices", "firstTry", "recovered", "open", "lost"]) tot[k] += g[k]; tot.revenue = r2(tot.revenue + g.revenue); tot.fullValue = r2(tot.fullValue + g.fullValue); }
    delete tot.brands; delete tot.declines;
    return res.status(200).json({ success: true, days, since: new Date(since * 1000).toISOString().slice(0, 10), scanned: n, byFunding: out, total: finish({ ...tot, brands: {}, declines: {} }), months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)) });
  } catch (e) {
    console.error("rebill-funding:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
