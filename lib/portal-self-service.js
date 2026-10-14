// lib/portal-self-service.js — The member manages their own membership in the portal (Il mio abbonamento).
//
//   pause    once, 28 days (= skip one rebill). Same mechanism as CS (lib/membership-actions.js):
//            Stripe pause_collection { void, resumes_at } · PayPal /suspend + daily cron re-activates.
//            A second pause → contact customer service.
//   resume   now, or on a chosen date (only earlier than the end of the pause)
//   offer    retention offer, max. once per member:
//              "price"  → next rebill at €24,95   ·   "pct15" → next rebill 15% off
//            Stripe: one-time coupon on the subscription.
//            PayPal: the rebill is charged normally and the difference is refunded automatically when PayPal
//            reports the payment (webhook PAYMENT.SALE.COMPLETED → applyPaypalOfferRefund).
//   cancel   no more rebills, access until the end of the period that is already paid
//            Stripe: cancel_at_period_end (undo possible until then) · PayPal: cancel now + accessUntil in the record.
//            Cancelling during a pause = immediately (nothing paid to use up).
//
// Member record (portal:member:<email>): selfPauseUsedAt, retentionOffer { kind, at }, selfCancel { reason, note, at },
// accessUntil + accessCycleStart (PayPal after cancelling). Timeline (portal:log): self_paused · self_resumed ·
// offer_accepted · self_cancelled · cancel_undone.  Redis hash membership:offers (PayPal, pending refunds).

import Stripe from "stripe";
import { pp, paypalConfigured } from "./paypal";
import { redis, getJson, setJson, storeConfigured } from "./portal-store";
import { memberKey } from "./portal-members";
import { logEvent } from "./portal-activity";
import { pauseMembership, resumeMembership, ActionError } from "./membership-actions";
import { currentBrand } from "./portal-brand";

const DAY = 86400000;
export const SELF_PAUSE_DAYS = 28;
export const OFFER_PRICE_CENTS = 2495;          // "next rebill at €24,95"
export const OFFER_PCT = 15;                    // "15% off the next rebill"
export const DEFAULT_PRICE_CENTS = 4900;
export const CANCEL_REASONS = ["not_subscription", "too_expensive", "no_results", "too_much", "not_started", "other"];
const PAUSES = "membership:pauses";
const OFFERS = "membership:offers";
const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null);
const isStripeId = (id) => String(id || "").startsWith("sub_");
const isPaypalId = (id) => String(id || "").startsWith("I-");

async function patch(email, fn) {
  if (!storeConfigured()) return null;
  const key = memberKey(email);
  const cur = await getJson(key);
  if (!cur) return null;
  const next = fn({ ...cur }) || cur;
  next.updatedAt = new Date().toISOString();
  await setJson(key, next);
  return next;
}

/* ---------------- what the member may do (shown in the portal) ---------------- */
// sub = getSubscriptionInfo(member)
export function manageState(member, sub) {
  const now = Date.now();
  const paused = !!(member?.pausedUntil && Date.parse(member.pausedUntil) > now && member?.status !== "cancelled");
  const price = Number(sub?.priceCents) || DEFAULT_PRICE_CENTS;
  const cancelled = sub?.status === "cancelled" || member?.status === "cancelled";
  const offerFree = !member?.retentionOffer;
  return {
    status: paused ? "paused" : cancelled ? "cancelled" : sub?.cancelAtPeriodEnd ? "cancelling" : sub?.status === "trialing" ? "trial" : "active",
    provider: sub?.provider || member?.provider || null,
    priceCents: price,
    nextCharge: paused ? member.pausedUntil : cancelled || sub?.cancelAtPeriodEnd ? null : sub?.cycleEnd || null,
    pausedUntil: paused ? member.pausedUntil : null,
    accessUntil: sub?.cancelAtPeriodEnd ? sub.cycleEnd : member?.accessUntil || null,
    canPause: !paused && !cancelled && !sub?.cancelAtPeriodEnd && !member?.selfPauseUsedAt,
    pauseUsed: !!member?.selfPauseUsedAt,
    pauseDays: SELF_PAUSE_DAYS,
    offers: {
      price: offerFree && price > OFFER_PRICE_CENTS ? { cents: OFFER_PRICE_CENTS } : null,
      pct15: offerFree ? { pct: OFFER_PCT, cents: Math.round(price * (100 - OFFER_PCT) / 100) } : null,
    },
    offerActive: member?.retentionOffer && !member.retentionOffer.appliedAt ? member.retentionOffer.kind : null,
    canCancel: !cancelled && !sub?.cancelAtPeriodEnd,
    canUndoCancel: !!sub?.cancelAtPeriodEnd && (sub?.provider === "stripe" || isStripeId(sub?.subscriptionId)),
  };
}

function needSub(member) {
  if (!member?.subscriptionId) throw new ActionError("no_subscription");
  return member.subscriptionId;
}

/* ---------------- pause / resume ---------------- */
export async function selfPause(member, sub) {
  const id = needSub(member);
  const st = manageState(member, sub);
  if (!st.canPause) throw new ActionError(st.pauseUsed ? "pause_used" : "not_allowed");
  const rec = await pauseMembership({ provider: member.provider, subscriptionId: id, email: member.email, days: SELF_PAUSE_DAYS, by: "member (portal)", brand: currentBrand().key });
  await patch(member.email, (m) => ({ ...m, selfPauseUsedAt: new Date().toISOString() }));
  await logEvent(member.email, "self_paused", { days: SELF_PAUSE_DAYS, until: rec.until });
  return { until: rec.until };
}

// mode "now" | "date" (date = YYYY-MM-DD, after today and before the end of the pause)
export async function selfResume(member, { mode, date } = {}) {
  const id = needSub(member);
  if (!member.pausedUntil || Date.parse(member.pausedUntil) <= Date.now()) throw new ActionError("not_paused");
  if (mode !== "date") {
    await resumeMembership({ provider: member.provider, subscriptionId: id, email: member.email, by: "member (portal)" });
    await logEvent(member.email, "self_resumed", { when: "now" });
    return { resumed: true };
  }
  const t = Date.parse(`${String(date || "")}T08:00:00Z`);
  if (!t || t <= Date.now() || t >= Date.parse(member.pausedUntil)) throw new ActionError("bad_date");
  const until = new Date(t).toISOString();
  if (isStripeId(id)) {
    const s = stripe(); if (!s) throw new ActionError("stripe", 500);
    await s.subscriptions.update(id, { pause_collection: { behavior: "void", resumes_at: Math.floor(t / 1000) } });
  } else if (!isPaypalId(id)) throw new ActionError("provider");
  // PayPal: the daily cron re-activates on "until"
  const raw = await redis(["HGET", PAUSES, id]).catch(() => null);
  let p = {}; try { p = raw ? JSON.parse(raw) : {}; } catch {}
  await redis(["HSET", PAUSES, id, JSON.stringify({ ...p, until, email: member.email, provider: member.provider || (isStripeId(id) ? "stripe" : "paypal"), brand: currentBrand().key })]);
  await patch(member.email, (m) => ({ ...m, pausedUntil: until }));
  await logEvent(member.email, "self_resumed", { when: until });
  return { until };
}

/* ---------------- retention offer ---------------- */
async function stripeCoupon(s, kind, priceCents) {
  const id = kind === "price" ? `jj-retention-off-${priceCents - OFFER_PRICE_CENTS}` : `jj-retention-${OFFER_PCT}pct`;
  try { return (await s.coupons.retrieve(id)).id; } catch (e) { if (e?.code !== "resource_missing" && e?.statusCode !== 404) throw e; }
  const body = kind === "price"
    ? { id, amount_off: priceCents - OFFER_PRICE_CENTS, currency: "eur", duration: "once", name: `Retention: next rebill €${(OFFER_PRICE_CENTS / 100).toFixed(2)}` }
    : { id, percent_off: OFFER_PCT, duration: "once", name: `Retention: ${OFFER_PCT}% off next rebill` };
  return (await s.coupons.create(body)).id;
}

export async function selfOffer(member, sub, kind, { reason, note } = {}) {
  const id = needSub(member);
  const st = manageState(member, sub);
  const offer = st.offers[kind];
  if (!offer || st.status === "paused" || st.status === "cancelled" || st.status === "cancelling") throw new ActionError("offer_unavailable");
  const newCents = kind === "price" ? OFFER_PRICE_CENTS : offer.cents;
  if (isStripeId(id)) {
    const s = stripe(); if (!s) throw new ActionError("stripe", 500);
    const coupon = await stripeCoupon(s, kind, st.priceCents);
    await s.subscriptions.update(id, { discounts: [{ coupon }] });
  } else if (isPaypalId(id)) {
    await redis(["HSET", OFFERS, id, JSON.stringify({ email: member.email, brand: currentBrand().key, kind, refundCents: st.priceCents - newCents, at: new Date().toISOString() })]);
  } else throw new ActionError("provider");
  reason = CANCEL_REASONS.includes(reason) ? reason : undefined;
  note = String(note || "").trim().slice(0, 1500) || undefined;
  const rec = { kind, newCents, at: new Date().toISOString(), reason, note };
  await patch(member.email, (m) => ({ ...m, retentionOffer: rec }));
  await logEvent(member.email, "offer_accepted", { offer: kind, amount: newCents / 100, reason, note });
  return rec;
}

// PayPal webhook PAYMENT.SALE.COMPLETED: refund the difference of an accepted offer on that rebill (once)
export async function applyPaypalOfferRefund(sale) {
  const subId = sale?.billing_agreement_id;
  if (!subId || !storeConfigured()) return null;
  const raw = await redis(["HGET", OFFERS, subId]).catch(() => null);
  if (!raw) return null;
  let o; try { o = JSON.parse(raw); } catch { return null; }
  const paid = Math.round(parseFloat(sale.amount?.total || "0") * 100);
  if (paid < (o.refundCents || 0) + 100) return { skipped: "amount too low", paid }; // not the regular rebill (e.g. setup fee/other)
  if ((await redis(["HDEL", OFFERS, subId])) !== 1) return null; // someone else is already doing it
  try {
    await pp("post", `/v1/payments/sale/${encodeURIComponent(sale.id)}/refund`, { amount: { total: (o.refundCents / 100).toFixed(2), currency: sale.amount?.currency || "EUR" } });
  } catch (e) {
    await redis(["HSET", OFFERS, subId, raw]).catch(() => {}); // retry on the next webhook delivery
    throw e;
  }
  return { refunded: o.refundCents / 100, email: o.email, brand: o.brand };
}
export const markOfferApplied = (email) => patch(email, (m) => (m.retentionOffer ? { ...m, retentionOffer: { ...m.retentionOffer, appliedAt: new Date().toISOString() } } : m));

/* ---------------- cancel ---------------- */
export async function selfCancel(member, sub, { reason, note } = {}) {
  const id = needSub(member);
  if (!CANCEL_REASONS.includes(reason)) throw new ActionError("reason");
  const st = manageState(member, sub);
  if (!st.canCancel && st.status !== "paused") throw new ActionError("already_cancelled");
  note = String(note || "").trim().slice(0, 1500);
  const now = new Date().toISOString();
  const paused = st.status === "paused";
  let accessUntil = null, accessCycleStart = null;

  if (isStripeId(id)) {
    const s = stripe(); if (!s) throw new ActionError("stripe", 500);
    const comment = `Member (portal): ${reason}${note ? ` — ${note}` : ""}`.slice(0, 500);
    if (paused) await s.subscriptions.cancel(id, { cancellation_details: { comment } });
    else {
      const u = await s.subscriptions.update(id, { cancel_at_period_end: true, cancellation_details: { comment } });
      accessUntil = new Date(u.current_period_end * 1000).toISOString();
    }
  } else if (isPaypalId(id)) {
    if (!paypalConfigured()) throw new ActionError("paypal", 500);
    if (!paused && sub?.cycleEnd && Date.parse(sub.cycleEnd) > Date.now()) { accessUntil = sub.cycleEnd; accessCycleStart = sub.cycleStart || null; }
    await pp("post", `/v1/billing/subscriptions/${id}/cancel`, { reason: `Cancelled by member in portal: ${reason}`.slice(0, 128) });
  } else throw new ActionError("provider");

  if (paused) await redis(["HDEL", PAUSES, id]).catch(() => {});
  await patch(member.email, (m) => {
    if (paused) { delete m.pausedUntil; delete m.pausedDays; delete m.pausedAt; }
    const next = { ...m, selfCancel: { reason, note, at: now } };
    if (accessUntil && isPaypalId(id)) { next.accessUntil = accessUntil; next.accessCycleStart = accessCycleStart; }
    return next;
  });
  await redis(["HSET", "membership:cancellations", id, JSON.stringify({ date: now.slice(0, 10), reason, note, email: member.email, provider: isStripeId(id) ? "stripe" : "paypal", at: now, by: "member (portal)", self: true, accessUntil })]).catch(() => {});
  await logEvent(member.email, "self_cancelled", { reason, note: note || undefined, until: accessUntil || undefined });
  return { accessUntil: paused ? null : accessUntil };
}

// Stripe only: cancelled with cancel_at_period_end → keep the membership after all
export async function selfUndoCancel(member, sub) {
  const id = needSub(member);
  if (!isStripeId(id) || !sub?.cancelAtPeriodEnd) throw new ActionError("not_allowed");
  const s = stripe(); if (!s) throw new ActionError("stripe", 500);
  await s.subscriptions.update(id, { cancel_at_period_end: false });
  await redis(["HDEL", "membership:cancellations", id]).catch(() => {});
  await patch(member.email, (m) => { delete m.selfCancel; return m; });
  await logEvent(member.email, "cancel_undone", {});
  return { ok: true };
}
