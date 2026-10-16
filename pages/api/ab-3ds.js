// pages/api/ab-3ds.js — Resultaten van de A/B-test 3D Secure (checkout.getjustjenny.com/3ds-links vs. de gewone checkout).
//
// Variant "3ds"  = abonnementen met metadata jj_checkout_variant=3ds (de /3ds-links; debit/prepaid → verplichte 3DS)
// Variant "standard" = alle andere Stripe-checkouts sinds de start van de test (eerste bestelling via een /3ds-link).
// Per variant en per kaarttype (alle / debit+prepaid / credit):
//   checkout   gestarte kaartbetalingen → betaald (meet de extra 3DS-stap; bij de gewone checkout is het kaarttype
//              van een NIET-betaalde poging onbekend → per kaarttype alleen voor de 3DS-variant)
//   1e rebill  leden van wie de proef voorbij is (opzeg tijdens de proef niet meegeteld):
//              meteen gelukt · later toch betaald (Stripe-retry of kortingsladder) · nog open · verloren
//   omzet      front-end + rebills, per gestarte checkout en per lid
// Zekerheid: 2-proporties z-test (kans dat de 3DS-variant écht beter is). Alleen Stripe (PayPal rechtstreeks valt erbuiten).
// flow: per variant en kaarttype waar de kaartcheckouts eindigen: betaald (zonder 3DS · frictionless · na bevestiging),
//   3DS niet afgerond (afgehaakt/geannuleerd/mislukt), geweigerd door de bank, of nooit bevestigd (pagina verlaten).
//   Kaarttype van een niet-betaalde poging komt van de kaart op de PaymentIntent (indien ingevuld).
// GET → { success, running, start, groups: { standard: { all, dp, credit }, tds: {…} }, compare: {…}, flow: { standard: { all, dp, credit }, tds: {…} } }

import Stripe from "stripe";
import { getDashboardSession } from "../../lib/dashboard-session";
import { paidAmount } from "../../lib/stripe-dunning";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const config = { maxDuration: 60 };

const DAY = 86400;
const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const idOf = (v) => (typeof v === "string" ? v : v?.id || null);
const isDp = (f) => f === "debit" || f === "prepaid";

// Standaardnormale verdeling (Abramowitz-Stegun) → kans dat B > A bij twee proporties
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

function failReason(inv) {
  const md = inv.metadata || {};
  const pi = typeof inv.payment_intent === "object" ? inv.payment_intent : null;
  const err = pi?.last_payment_error;
  return md.jj_dunning_code || err?.decline_code || err?.code || (pi?.status === "requires_action" ? "authentication_required" : null) || "unknown";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getDashboardSession(req);
  const roles = Array.isArray(s?.roles) ? s.roles : [];
  if (!s || !(s.finance || s.admin || roles.includes("Funnel Builder") || roles.includes("Membership CS Rep"))) return res.status(401).json({ success: false, error: "No access" });
  if (!stripe) return res.status(200).json({ success: true, configured: false, running: false });

  try {
    const now = Math.floor(Date.now() / 1000);
    // --- abonnementen (laatste 120 dagen) ---
    const subs = [];
    let n = 0;
    for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, created: { gte: now - 120 * DAY }, expand: ["data.default_payment_method"] })) {
      if (++n > 6000) break;
      const md = sub.metadata || {};
      if (md.kind === "onetime" || md.kind === "reactivation") continue;
      const pm = typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
      subs.push({
        id: sub.id, created: sub.created, status: sub.status,
        variant: md.jj_checkout_variant === "3ds" ? "tds" : "standard",
        funding: md.jj_card_funding || pm?.card?.funding || null,
        forced: md.jj_3ds === "forced",
        paid: sub.status !== "incomplete" && sub.status !== "incomplete_expired",
        trialEnd: sub.trial_end || null, canceledAt: sub.canceled_at || null,
        product: md.product_key || "neurotone",
      });
    }
    const tdsStarts = subs.filter((x) => x.variant === "tds").map((x) => x.created);
    if (!tdsStarts.length) return res.status(200).json({ success: true, running: false });
    const start = Math.min(...tdsStarts);
    const inTest = subs.filter((x) => x.created >= start);
    const byId = Object.fromEntries(inTest.map((x) => [x.id, x]));

    // --- facturen sinds de start: front-end (subscription_create) + rebills (subscription_cycle) ---
    const fe = {}, cycles = {};
    n = 0;
    const firstPi = {}; // abonnement → PaymentIntent van de eerste factuur (met charge en kaart)
    for await (const inv of stripe.invoices.list({ limit: 100, created: { gte: start - 3600 }, expand: ["data.payment_intent.latest_charge", "data.payment_intent.payment_method"] })) {
      if (++n > 8000) break;
      const sid = idOf(inv.subscription);
      if (!sid || !byId[sid]) continue;
      if (inv.billing_reason === "subscription_create" && typeof inv.payment_intent === "object") firstPi[sid] = inv.payment_intent;
      if (inv.billing_reason === "subscription_create" && inv.status === "paid") fe[sid] = (inv.amount_paid || 0) / 100;
      if (inv.billing_reason === "subscription_cycle") (cycles[sid] ||= []).push(inv);
    }

    // --- per lid: uitkomst van de eerste rebill ---
    for (const x of inTest) {
      x.fe = fe[x.id] || 0;
      const list = (cycles[x.id] || []).sort((a, b) => a.created - b.created);
      x.rebillRevenue = list.filter((i) => i.status === "paid").reduce((a, i) => a + paidAmount(i), 0);
      x.rebills = list.filter((i) => i.status === "paid").length;
      const first = list[0];
      const trialOver = x.trialEnd && x.trialEnd <= now;
      const cancelledInTrial = x.canceledAt && x.trialEnd && x.canceledAt < x.trialEnd && !first;
      if (!x.paid) x.first = "none";
      else if (!trialOver) x.first = "trial";
      else if (cancelledInTrial) x.first = "cancelled-trial";
      else if (!first || first.status === "draft" || (!first.attempted && first.status === "open")) x.first = "pending";
      else if (first.status === "paid") {
        const md = first.metadata || {};
        x.first = (first.attempt_count || 1) <= 1 && !md.jj_dunning ? "ok" : "recovered";
        if (x.first === "recovered") x.reason = md.jj_dunning_code || null;
      } else if (first.status === "open") { x.first = "open"; x.reason = failReason(first); }
      else { x.first = "lost"; x.reason = failReason(first); }
      if (x.first === "recovered" && !x.reason) x.reason = "unknown";
    }

    const group = (variant, seg) => {
      const segOk = (f) => seg === "all" || (seg === "dp" ? isDp(f) : f === "credit");
      const all = inTest.filter((x) => x.variant === variant);
      // Kaarttype van een niet-betaalde poging is bij de gewone checkout onbekend → checkoutcijfers per kaarttype weglaten
      const startsKnown = seg === "all" || variant === "tds";
      const starts = startsKnown ? all.filter((x) => seg === "all" || segOk(x.funding)) : null;
      const members = all.filter((x) => x.paid && segOk(x.funding));
      const due = members.filter((x) => ["ok", "recovered", "open", "lost"].includes(x.first));
      const cnt = (k) => due.filter((x) => x.first === k).length;
      const reasons = {};
      for (const x of due) if (x.first !== "ok") reasons[x.reason || "unknown"] = (reasons[x.reason || "unknown"] || 0) + 1;
      const revenue = members.reduce((a, x) => a + x.fe + x.rebillRevenue, 0);
      const forced = starts ? starts.filter((x) => x.forced) : [];
      return {
        started: starts ? starts.length : null, paid: starts ? starts.filter((x) => x.paid).length : null,
        completion: starts && starts.length ? r3(starts.filter((x) => x.paid).length / starts.length) : null,
        tdsAsked: variant === "tds" && starts ? forced.length : null, tdsPaid: variant === "tds" && starts ? forced.filter((x) => x.paid).length : null,
        members: members.length, inTrial: members.filter((x) => x.first === "trial").length,
        cancelledInTrial: members.filter((x) => x.first === "cancelled-trial").length, pending: members.filter((x) => x.first === "pending").length,
        due: due.length, ok: cnt("ok"), recovered: cnt("recovered"), open: cnt("open"), lost: cnt("lost"),
        firstTryRate: due.length ? r3(cnt("ok") / due.length) : null,
        finalRate: due.length ? r3((cnt("ok") + cnt("recovered")) / due.length) : null,
        reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
        revenue: r2(revenue), revPerStart: starts && starts.length ? r2(revenue / starts.length) : null, revPerMember: members.length ? r2(revenue / members.length) : null,
      };
    };
    const segs = ["all", "dp", "credit"];
    const groups = { standard: {}, tds: {} };
    for (const v of ["standard", "tds"]) for (const sg of segs) groups[v][sg] = group(v, sg);
    const compare = {};
    for (const sg of segs) {
      const a = groups.standard[sg], b = groups.tds[sg];
      compare[sg] = {
        firstTry: probBetter(a.ok, a.due, b.ok, b.due),
        final: probBetter(a.ok + a.recovered, a.due, b.ok + b.recovered, b.due),
        completion: a.started != null && b.started != null ? probBetter(a.paid, a.started, b.paid, b.started) : null,
      };
    }
    // --- verloop van de kaartcheckouts: waar eindigen ze (per variant en kaarttype) ---
    const emptyFlow = () => ({ started: 0, paid: 0, paidNo3ds: 0, paidFrictionless: 0, paidChallenge: 0, notCompleted: 0, declined: 0, other: 0 });
    const flow = { standard: { all: emptyFlow(), dp: emptyFlow(), credit: emptyFlow() }, tds: { all: emptyFlow(), dp: emptyFlow(), credit: emptyFlow() } };
    for (const x of inTest) {
      const pi = firstPi[x.id] || null;
      const ch = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      const pm = pi && typeof pi.payment_method === "object" ? pi.payment_method : null;
      const type = pm?.type || ch?.payment_method_details?.type || null;
      if (type && type !== "card") continue; // PayPal/Link via Stripe: geen kaart-3DS
      const funding = x.funding || pm?.card?.funding || ch?.payment_method_details?.card?.funding || null;
      const tds = ch?.payment_method_details?.card?.three_d_secure || null;
      const err = pi?.last_payment_error;
      let k;
      if (x.paid) k = !tds ? "paidNo3ds" : tds.authentication_flow === "challenge" ? "paidChallenge" : "paidFrictionless";
      else if (pi?.status === "requires_action" || err?.code === "payment_intent_authentication_failure") k = "notCompleted";
      else if (err?.type === "card_error" || ch?.status === "failed") k = "declined";
      else k = "other"; // nooit bevestigd (pagina verlaten vóór de betaling)
      const segs = ["all"];
      if (isDp(funding)) segs.push("dp"); else if (funding === "credit") segs.push("credit");
      for (const sg of segs) {
        const f = flow[x.variant][sg];
        f.started++; f[k]++;
        if (x.paid) f.paid++;
      }
    }
    return res.status(200).json({ success: true, running: true, start: new Date(start * 1000).toISOString(), days: Math.max(1, Math.ceil((now - start) / DAY)), groups, compare, flow, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("ab-3ds:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
