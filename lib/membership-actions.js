// lib/membership-actions.js — Acties van customer service op een membership (server-only).
//
//   pause   30/60/90 dagen geen afschrijvingen
//            Stripe → pause_collection { behavior: "void", resumes_at }  (Stripe hervat zelf op die datum)
//            PayPal → subscription /suspend; de dagelijkse cron (renewal-reminders) activeert hem weer op de einddatum
//   resume  pauze vroegtijdig opheffen (Stripe: pause_collection leegmaken · PayPal: /activate)
//   cancel  meteen opzeggen bij Stripe/PayPal (de webhooks doen de rest: Klaviyo + ledenrecord)
//            + CS-gegevens bewaren: datum, reden, refund gevraagd, chargeback-risico
//   magic link  inloglink opnieuw sturen (zelfde Klaviyo-event als "inloglink aanvragen" in het portaal)
//
// Opslag (Redis):
//   membership:pauses         hash  subscriptionId → { until, days, email, provider, at, by }
//   membership:cancellations  hash  subscriptionId → { date, reason, refundRequested, chargebackRisk, email, provider, at, by }
//   portal:member:<email>     pausedUntil / pausedDays  (portaal dicht tijdens de pauze) · csCancellation
//   portal:log:<email>        tijdlijn: paused · resumed · cs_cancelled · magic_link

import Stripe from "stripe";
import { pp, paypalConfigured } from "./paypal";
import { redis, getJson, setJson, storeConfigured } from "./portal-store";
import { memberKey } from "./portal-members";
import { logEvent } from "./portal-activity";
import { createLoginLink, normEmail } from "./portal-auth";
import { trackEvent, klaviyoConfigured } from "./klaviyo";

const DAY = 86400000;
export const PAUSE_OPTIONS = [30, 60, 90];
export const RISK_LEVELS = ["High", "Medium", "Low"];
const PAUSES = "membership:pauses";
const CANCELS = "membership:cancellations";
const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null);

export class ActionError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const isStripe = (provider, id) => provider === "stripe" || String(id || "").startsWith("sub_");
const isPaypal = (provider, id) => provider === "paypal" || String(id || "").startsWith("I-");

async function patchMember(email, fn) {
  if (!email || !storeConfigured()) return null;
  const key = memberKey(email);
  const cur = await getJson(key);
  if (!cur) return null;
  const next = fn({ ...cur }) || cur;
  next.updatedAt = new Date().toISOString();
  await setJson(key, next);
  return next;
}

async function hgetallJson(key) {
  const raw = (await redis(["HGETALL", key]).catch(() => [])) || [];
  const out = {};
  for (let i = 0; i < raw.length; i += 2) {
    try { out[raw[i]] = JSON.parse(raw[i + 1]); } catch {}
  }
  return out;
}
export const getPauses = () => hgetallJson(PAUSES);
export const getCancellations = () => hgetallJson(CANCELS);

/* ---------------- pauze ---------------- */
export async function pauseMembership({ provider, subscriptionId, email, days, by }) {
  days = Number(days);
  if (!PAUSE_OPTIONS.includes(days)) throw new ActionError("Choose 30, 60 or 90 days.");
  if (!subscriptionId) throw new ActionError("Missing subscription.");
  const until = new Date(Date.now() + days * DAY);

  if (isStripe(provider, subscriptionId)) {
    const s = stripe();
    if (!s) throw new ActionError("Stripe is not configured.", 500);
    await s.subscriptions.update(subscriptionId, { pause_collection: { behavior: "void", resumes_at: Math.floor(until.getTime() / 1000) } });
    provider = "stripe";
  } else if (isPaypal(provider, subscriptionId)) {
    if (!paypalConfigured()) throw new ActionError("PayPal is not configured.", 500);
    await pp("post", `/v1/billing/subscriptions/${subscriptionId}/suspend`, { reason: `Paused by customer service for ${days} days` });
    provider = "paypal";
  } else throw new ActionError("Unknown payment provider.");

  const rec = { until: until.toISOString(), days, email: normEmail(email), provider, at: new Date().toISOString(), by: by || "" };
  await redis(["HSET", PAUSES, subscriptionId, JSON.stringify(rec)]);
  if (email) {
    await patchMember(email, (m) => ({ ...m, pausedUntil: rec.until, pausedDays: days, pausedAt: rec.at }));
    await logEvent(email, "paused", { days, until: rec.until, by: by || "" });
  }
  return rec;
}

export async function resumeMembership({ provider, subscriptionId, email, by, auto = false }) {
  if (!subscriptionId) throw new ActionError("Missing subscription.");
  if (isStripe(provider, subscriptionId)) {
    const s = stripe();
    if (!s) throw new ActionError("Stripe is not configured.", 500);
    await s.subscriptions.update(subscriptionId, { pause_collection: "" });
  } else if (isPaypal(provider, subscriptionId)) {
    if (!paypalConfigured()) throw new ActionError("PayPal is not configured.", 500);
    await pp("post", `/v1/billing/subscriptions/${subscriptionId}/activate`, { reason: auto ? "Pause ended" : "Resumed by customer service" });
  } else throw new ActionError("Unknown payment provider.");
  await redis(["HDEL", PAUSES, subscriptionId]);
  if (email) {
    await patchMember(email, (m) => { delete m.pausedUntil; delete m.pausedDays; delete m.pausedAt; return { ...m, resumedAt: new Date().toISOString() }; });
    await logEvent(email, "resumed", { by: auto ? "automatic" : by || "" });
  }
  return { ok: true };
}

// Dagelijks (cron): PayPal-pauzes waarvan de einddatum voorbij is weer activeren; verlopen Stripe-pauzes opruimen
export async function resumeDuePauses() {
  const all = await getPauses();
  const now = Date.now();
  const done = [];
  for (const [subId, p] of Object.entries(all)) {
    if (!p?.until || Date.parse(p.until) > now) continue;
    try {
      if (p.provider === "paypal") await resumeMembership({ provider: "paypal", subscriptionId: subId, email: p.email, auto: true });
      else {
        // Stripe hervat zelf (resumes_at) — alleen onze administratie bijwerken
        await redis(["HDEL", PAUSES, subId]);
        if (p.email) {
          await patchMember(p.email, (m) => { delete m.pausedUntil; delete m.pausedDays; delete m.pausedAt; return { ...m, resumedAt: new Date().toISOString() }; });
          await logEvent(p.email, "resumed", { by: "automatic" });
        }
      }
      done.push(subId);
    } catch (e) { console.warn("resume pause:", subId, e.message); }
  }
  return done;
}

/* ---------------- opzeggen ---------------- */
export async function cancelMembership({ provider, subscriptionId, email, by, reason, refundRequested, chargebackRisk }) {
  if (!subscriptionId) throw new ActionError("Missing subscription.");
  reason = String(reason || "").trim().slice(0, 2000);
  if (!reason) throw new ActionError("Please fill in the cancellation reason.");
  if (typeof refundRequested !== "boolean") throw new ActionError("Please choose whether a refund was requested.");
  if (!RISK_LEVELS.includes(chargebackRisk)) throw new ActionError("Please choose the chargeback risk.");

  if (isStripe(provider, subscriptionId)) {
    const s = stripe();
    if (!s) throw new ActionError("Stripe is not configured.", 500);
    await s.subscriptions.cancel(subscriptionId, { cancellation_details: { comment: `CS: ${reason}`.slice(0, 500) } });
    provider = "stripe";
  } else if (isPaypal(provider, subscriptionId)) {
    if (!paypalConfigured()) throw new ActionError("PayPal is not configured.", 500);
    await pp("post", `/v1/billing/subscriptions/${subscriptionId}/cancel`, { reason: `Cancelled by customer service: ${reason}`.slice(0, 128) });
    provider = "paypal";
  } else throw new ActionError("Unknown payment provider.");

  const now = new Date().toISOString();
  const rec = { date: now.slice(0, 10), reason, refundRequested, chargebackRisk, email: normEmail(email), provider, at: now, by: by || "" };
  await redis(["HSET", CANCELS, subscriptionId, JSON.stringify(rec)]);
  await redis(["HDEL", PAUSES, subscriptionId]);
  if (email) {
    await patchMember(email, (m) => { delete m.pausedUntil; delete m.pausedDays; delete m.pausedAt; return { ...m, csCancellation: rec }; });
    await logEvent(email, "cs_cancelled", { reason, refundRequested, chargebackRisk, by: by || "" });
  }
  return rec;
}

/* ---------------- magic link ---------------- */
export async function sendMagicLink({ email, by }) {
  email = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ActionError("Invalid email address.");
  const member = await getJson(memberKey(email));
  if (!member) throw new ActionError("This customer has no member account in the portal.", 404);
  if (!klaviyoConfigured()) throw new ActionError("Klaviyo is not configured, the email can't be sent.", 500);
  const url = await createLoginLink(email, { purpose: "login", ttlSec: 20 * 60 });
  await trackEvent("Portal Login Link", email, { login_url: url, purpose: "login", first_name: member.firstName || "", expires_minutes: 20 }, { uniqueId: `portal-link-cs-${email}-${Date.now()}` });
  await logEvent(email, "magic_link", { by: by || "" });
  return { ok: true };
}
