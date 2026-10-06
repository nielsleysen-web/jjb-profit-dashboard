// pages/api/paypal/webhook.js
// Vangnet: als de klant na PayPal niet terugkomt op de checkout, maakt deze webhook de
// Shopify-order toch aan. Rebills (PAYMENT.SALE.COMPLETED) negeren we: daar wordt niets verzonden.
// PayPal Developer → je app → Webhooks → URL: https://<dashboard>/api/paypal/webhook
// Events: BILLING.SUBSCRIPTION.ACTIVATED (+ CANCELLED/EXPIRED → Klaviyo) · Env: PAYPAL_WEBHOOK_ID

import { paypalConfigured, pp, ensureOrderForPaypal, cancelMemberForPaypal, unpackCustom } from "../../../lib/paypal";
import { trackEvent, syncProductMember } from "../../../lib/klaviyo";
import { getProduct } from "../../../lib/checkout";
import { PORTAL_URL } from "../../../lib/portal-auth";

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
        await syncProductMember(product, "failed", { email, provider: "paypal", subscriptionId: event.resource.id, invoiceId: `${event.resource.id}-${new Date().toISOString().slice(0, 10)}` });
        return res.status(200).json({ received: true, paymentFailed: true, product: product.key });
      }
      if (email) await trackEvent("Membership Payment Failed", email, { provider: "paypal", subscription_id: event.resource.id, portal_url: `${PORTAL_URL}/riattiva` }, { uniqueId: `payfail-${event.resource.id}-${new Date().toISOString().slice(0, 10)}` }).catch(() => {});
      return res.status(200).json({ received: true, paymentFailed: true });
    }
    return res.status(200).json({ received: true, ignored: event.event_type });
  } catch (e) {
    console.error("paypal/webhook:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
