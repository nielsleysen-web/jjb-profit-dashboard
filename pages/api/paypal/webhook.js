// pages/api/paypal/webhook.js
// Vangnet: als de klant na PayPal niet terugkomt op de checkout, maakt deze webhook de
// Shopify-order toch aan. Rebills (PAYMENT.SALE.COMPLETED) negeren we: daar wordt niets verzonden.
// PayPal Developer → je app → Webhooks → URL: https://<dashboard>/api/paypal/webhook
// Events: BILLING.SUBSCRIPTION.ACTIVATED (+ CANCELLED/EXPIRED → Klaviyo) · CUSTOMER.DISPUTE.CREATED (message to the buyer,
// see lib/paypal-disputes.js) · PAYMENT.SALE.COMPLETED (portal retention offer → refund the difference) · Env: PAYPAL_WEBHOOK_ID, PAYPAL_DISPUTE_AUTOREPLY=on

import { paypalConfigured, pp, ensureOrderForPaypal, cancelMemberForPaypal, unpackCustom } from "../../../lib/paypal";
import { trackEvent } from "../../../lib/klaviyo";
import { productMemberEvent } from "../../../lib/portal-members";
import { getProduct } from "../../../lib/checkout";
import { PORTAL_URL } from "../../../lib/portal-auth";
import { handleDisputeCreated } from "../../../lib/paypal-disputes";
import { applyPaypalOfferRefund, markOfferApplied } from "../../../lib/portal-self-service";
import { runWithBrand } from "../../../lib/portal-brand";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!paypalConfigured() || !process.env.PAYPAL_WEBHOOK_ID) return res.status(500).send("PayPal webhook niet geconfigureerd");
  const event = req.body || {};
  try {
    const h = req.headers;
    const v = await pp("post", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h["paypal-auth-algo"], cert_url: h["paypal-cert-url"], transmission_id: h["paypal-transmission-id"],
      transmission_sig: h["paypal-transmission-sig"], transmission_time: h["paypal-transmission-time"],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: event,
    });
    if (v.verification_status !== "SUCCESS") return res.status(400).send("bad signature");

    if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED" && event.resource?.id) {
      const sub = await pp("get", `/v1/billing/subscriptions/${event.resource.id}`);
      // Heractivering vanuit het portaal (alleen membership, geen product) → geen Shopify-order
      if (String(sub.custom_id || "").startsWith("reactivate|")) return res.status(200).json({ received: true, reactivation: true });
      // Eerste 2 minuten: de checkout maakt de order zelf (met volledige tracking) → PayPal later opnieuw laten proberen
      if (Date.now() - new Date(sub.create_time).getTime() < 120000) return res.status(503).send("retry later");
      const order = await ensureOrderForPaypal(sub, {});
      return res.status(200).json({ received: true, order: order.name });
    }
    if ((event.event_type === "BILLING.SUBSCRIPTION.CANCELLED" || event.event_type === "BILLING.SUBSCRIPTION.EXPIRED") && event.resource?.id) {
      const sub = await pp("get", `/v1/billing/subscriptions/${event.resource.id}`);
      await cancelMemberForPaypal(sub, event.event_type === "BILLING.SUBSCRIPTION.EXPIRED" ? "expired" : "cancelled");
      return res.status(200).json({ received: true, cancelled: true });
    }
    if ((event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED" || event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") && event.resource?.id) {
      // Mislukte rebill: lid wordt in het portaal gedeactiveerd (status live uit PayPal) → Klaviyo-event voor de herinneringsmail
      const sub = await pp("get", `/v1/billing/subscriptions/${event.resource.id}`).catch(() => null);
      const email = sub?.subscriber?.email_address;
      const product = getProduct(unpackCustom(sub?.custom_id).product);
      if (email && !product.portal) {
        await productMemberEvent(product, "failed", { email, provider: "paypal", subscriptionId: event.resource.id, invoiceId: `${event.resource.id}-${new Date().toISOString().slice(0, 10)}` });
        return res.status(200).json({ received: true, paymentFailed: true, product: product.key });
      }
      if (email) await trackEvent("Membership Payment Failed", email, { provider: "paypal", subscription_id: event.resource.id, portal_url: `${PORTAL_URL}/riattiva` }, { uniqueId: `payfail-${event.resource.id}-${new Date().toISOString().slice(0, 10)}` }).catch(() => {});
      return res.status(200).json({ received: true, paymentFailed: true });
    }
    if (event.event_type === "PAYMENT.SALE.COMPLETED" && event.resource?.billing_agreement_id) {
      // Rebill of a member who accepted a retention offer in the portal (€24,95 / 15% off): refund the difference
      const r = await applyPaypalOfferRefund(event.resource);
      if (r?.refunded && r.email) await runWithBrand(r.brand || "neurotone", () => markOfferApplied(r.email)).catch(() => {});
      return res.status(200).json({ received: true, offer: r || null });
    }
    if (event.event_type === "CUSTOMER.DISPUTE.CREATED") {
      // New dispute: friendly message in the inquiry phase (only with PAYPAL_DISPUTE_AUTOREPLY=on). Never let it fail the webhook.
      const r = await handleDisputeCreated(event.resource).catch((e) => ({ error: e.message }));
      if (r.error) console.error("paypal/webhook dispute:", r.error);
      return res.status(200).json({ received: true, dispute: r });
    }
    return res.status(200).json({ received: true, ignored: event.event_type });
  } catch (e) {
    console.error("paypal/webhook:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
