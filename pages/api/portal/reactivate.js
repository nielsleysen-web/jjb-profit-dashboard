// pages/api/portal/reactivate.js — Gedeactiveerd lid (opgezegd of mislukte rebill) hervat de membership.
//
// Alleen bereikbaar als het lid gedeactiveerd is; alle andere portaalfuncties blijven dicht tot de betaling slaagt.
//
// POST { action: "setup" }                       Stripe: SetupIntent → client_secret om een nieuwe kaart te bewaren
// POST { action: "stripe", paymentMethodId }      Stripe: kaart koppelen, dan
//                                                  - past_due/unpaid: openstaande factuur opnieuw innen op die kaart
//                                                  - opgezegd: nieuw abonnement €49/28 dagen, meteen betaald (geen proef)
// POST { action: "paypal" }                       PayPal: nieuw abonnement (plan zonder setup fee en zonder proef) → approve-URL
// POST { action: "paypal_confirm", id }           PayPal: na goedkeuring: actief? → lid heractiveren
//
// Succes → ledenrecord status active + nieuwe subscriptionId + Klaviyo "Membership Reactivated".

import Stripe from "stripe";
import { readSession } from "../../../lib/portal-auth";
import { getMember, upsertMember } from "../../../lib/portal-members";
import { getSubscriptionInfo } from "../../../lib/portal-account";
import { paypalConfigured, pp, reactivationPlan } from "../../../lib/paypal";
import { MEMBERSHIP } from "../../../lib/checkout";
import { trackEvent, klaviyoConfigured } from "../../../lib/klaviyo";
import { PORTAL_URL } from "../../../lib/portal-auth";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const config = { maxDuration: 30 };
const V = "v1";

async function membershipPriceId() {
  if (process.env.STRIPE_PRICE_MEMBERSHIP) return process.env.STRIPE_PRICE_MEMBERSHIP;
  const key = `jj_membership_${MEMBERSHIP.price}_${MEMBERSHIP.intervalDays}d_${V}`;
  const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 });
  if (found.data.length) return found.data[0].id;
  const price = await stripe.prices.create({ currency: "eur", unit_amount: MEMBERSHIP.price, recurring: { interval: "day", interval_count: MEMBERSHIP.intervalDays }, product_data: { name: MEMBERSHIP.name }, lookup_key: key });
  return price.id;
}

async function activate(member, { provider, subscriptionId, customerId, nextChargeAt, amount }) {
  const now = new Date();
  await upsertMember({
    email: member.email, status: "active", provider, subscriptionId, stripeCustomerId: customerId || member.stripeCustomerId,
    cancelledAt: null, reactivatedAt: now.toISOString(), lastPaymentAt: now.toISOString(), lastPaymentAmount: amount,
    nextChargeAt: nextChargeAt ? new Date(nextChargeAt).toISOString() : undefined,
  });
  if (klaviyoConfigured()) {
    await trackEvent("Membership Reactivated", member.email, { first_name: member.firstName || "", provider, amount: amount.toFixed(2).replace(".", ","), portal_url: PORTAL_URL }, { value: amount, uniqueId: `reactivate-${subscriptionId}` }).catch(() => {});
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "unauthorized" });
  const member = await getMember(s.email);
  if (!member) return res.status(401).json({ ok: false, error: "unauthorized" });

  const b = req.body || {};
  try {
    const sub = await getSubscriptionInfo(member);
    const pastDue = sub.status === "past_due" || sub.status === "unpaid";
    const deactivated = sub.status === "cancelled" || pastDue || member.status === "cancelled";
    if (!deactivated) return res.status(409).json({ ok: false, error: "active" });

    // ---------- Stripe ----------
    if (b.action === "setup") {
      if (!stripe) return res.status(500).json({ ok: false, error: "stripe" });
      let customerId = sub.customerId || member.stripeCustomerId;
      if (!customerId) {
        const existing = await stripe.customers.list({ email: member.email, limit: 1 });
        customerId = existing.data[0]?.id || (await stripe.customers.create({ email: member.email, name: [member.firstName, member.lastName].filter(Boolean).join(" ") || undefined, preferred_locales: ["it"] })).id;
      }
      const si = await stripe.setupIntents.create({ customer: customerId, payment_method_types: ["card"], usage: "off_session", metadata: { portal_email: member.email, kind: "reactivate" } });
      return res.status(200).json({ ok: true, clientSecret: si.client_secret, customerId });
    }

    if (b.action === "stripe") {
      if (!stripe) return res.status(500).json({ ok: false, error: "stripe" });
      const pmId = String(b.paymentMethodId || "");
      if (!/^pm_[A-Za-z0-9]+$/.test(pmId)) return res.status(400).json({ ok: false, error: "payment_method" });
      const pm = await stripe.paymentMethods.retrieve(pmId);
      const customerId = pm.customer || sub.customerId || member.stripeCustomerId;
      if (!customerId) return res.status(400).json({ ok: false, error: "payment_method" });
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });

      // Mislukte rebill: hetzelfde abonnement, openstaande factuur opnieuw innen
      if (pastDue && sub.subscriptionId) {
        await stripe.subscriptions.update(sub.subscriptionId, { default_payment_method: pmId });
        const open = await stripe.invoices.list({ subscription: sub.subscriptionId, status: "open", limit: 1 });
        let inv = open.data[0];
        if (inv) {
          try { inv = await stripe.invoices.pay(inv.id, { payment_method: pmId, off_session: true }); }
          catch (e) {
            if (e.code === "authentication_required" || e.raw?.payment_intent?.status === "requires_action") {
              const pi = e.raw?.payment_intent;
              return res.status(200).json({ ok: false, requires_action: true, clientSecret: pi?.client_secret, invoiceId: inv.id });
            }
            return res.status(402).json({ ok: false, error: e.type === "StripeCardError" ? "card_declined" : "payment_failed" });
          }
          if (inv.status !== "paid") return res.status(402).json({ ok: false, error: "payment_failed" });
        }
        const fresh = await stripe.subscriptions.retrieve(sub.subscriptionId);
        if (!["active", "trialing"].includes(fresh.status)) return res.status(402).json({ ok: false, error: "payment_failed" });
        await activate(member, { provider: "stripe", subscriptionId: fresh.id, customerId, nextChargeAt: fresh.current_period_end * 1000, amount: (inv?.amount_paid ?? MEMBERSHIP.price) / 100 });
        return res.status(200).json({ ok: true, reactivated: true });
      }

      // Opgezegd: nieuw abonnement, meteen €49, geen proefperiode
      const price = await membershipPriceId();
      let created;
      try {
        created = await stripe.subscriptions.create({
          customer: customerId, items: [{ price, quantity: 1 }], default_payment_method: pmId,
          payment_behavior: "error_if_incomplete", off_session: true,
          metadata: { source: "jjb-portal", kind: "reactivation", portal_email: member.email, previous_subscription: sub.subscriptionId || member.subscriptionId || "" },
          expand: ["latest_invoice.payment_intent"],
        }, { idempotencyKey: `jjreact_${member.email}_${Date.now() - (Date.now() % 60000)}` });
      } catch (e) {
        if (e.code === "subscription_payment_intent_requires_action" || e.raw?.payment_intent?.status === "requires_action") {
          return res.status(200).json({ ok: false, requires_action: true, clientSecret: e.raw?.payment_intent?.client_secret, subscriptionId: e.raw?.payment_intent?.metadata?.subscription_id || null });
        }
        return res.status(402).json({ ok: false, error: e.type === "StripeCardError" ? "card_declined" : "payment_failed" });
      }
      const inv = created.latest_invoice;
      await activate(member, { provider: "stripe", subscriptionId: created.id, customerId, nextChargeAt: created.current_period_end * 1000, amount: (inv?.amount_paid ?? MEMBERSHIP.price) / 100 });
      return res.status(200).json({ ok: true, reactivated: true });
    }

    if (b.action === "stripe_confirm") {
      // Na 3-D Secure in de browser: status opnieuw bekijken
      const subId = String(b.subscriptionId || sub.subscriptionId || member.subscriptionId || "");
      if (!subId.startsWith("sub_")) return res.status(400).json({ ok: false, error: "payment_failed" });
      const fresh = await stripe.subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
      if (!["active", "trialing"].includes(fresh.status)) return res.status(402).json({ ok: false, error: "payment_failed" });
      await activate(member, { provider: "stripe", subscriptionId: fresh.id, customerId: typeof fresh.customer === "string" ? fresh.customer : fresh.customer?.id, nextChargeAt: fresh.current_period_end * 1000, amount: (fresh.latest_invoice?.amount_paid ?? MEMBERSHIP.price) / 100 });
      return res.status(200).json({ ok: true, reactivated: true });
    }

    // ---------- PayPal ----------
    if (b.action === "paypal") {
      if (!paypalConfigured()) return res.status(500).json({ ok: false, error: "paypal" });
      const plan = await reactivationPlan();
      const order = await pp("post", "/v1/billing/subscriptions", {
        plan_id: plan.id,
        custom_id: `reactivate|${member.email}`.slice(0, 127),
        subscriber: { email_address: member.email, name: { given_name: member.firstName || undefined, surname: member.lastName || undefined } },
        application_context: { brand_name: "Just Jenny", locale: "it-IT", shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW",
          return_url: `${PORTAL_URL}/riattiva?pp=1`, cancel_url: `${PORTAL_URL}/riattiva` },
      });
      const url = (order.links || []).find((l) => l.rel === "approve")?.href;
      if (!url) return res.status(500).json({ ok: false, error: "paypal" });
      return res.status(200).json({ ok: true, url, id: order.id });
    }

    if (b.action === "paypal_confirm") {
      const id = String(b.id || "");
      if (!/^I-[A-Z0-9]{6,}$/.test(id)) return res.status(400).json({ ok: false, error: "payment_failed" });
      let psub = null;
      for (let i = 0; i < 6; i++) {
        psub = await pp("get", `/v1/billing/subscriptions/${id}`);
        if (psub.status === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!psub || psub.status !== "ACTIVE") return res.status(402).json({ ok: false, error: "payment_failed" });
      if (psub.custom_id !== `reactivate|${member.email}`.slice(0, 127)) return res.status(400).json({ ok: false, error: "payment_failed" });
      const next = psub.billing_info?.next_billing_time ? new Date(psub.billing_info.next_billing_time).getTime() : null;
      await activate(member, { provider: "paypal", subscriptionId: psub.id, nextChargeAt: next, amount: MEMBERSHIP.price / 100 });
      return res.status(200).json({ ok: true, reactivated: true });
    }

    return res.status(400).json({ ok: false, error: "action" });
  } catch (e) {
    console.error("portal reactivate:", member.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
