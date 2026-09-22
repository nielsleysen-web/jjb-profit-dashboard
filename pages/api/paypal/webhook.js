// pages/api/paypal/webhook.js
// Vangnet: als de klant na PayPal niet terugkomt op de checkout, maakt deze webhook de
// Shopify-order toch aan. Rebills (PAYMENT.SALE.COMPLETED) negeren we: daar wordt niets verzonden.
// PayPal Developer → je app → Webhooks → URL: https://<dashboard>/api/paypal/webhook
// Event: BILLING.SUBSCRIPTION.ACTIVATED · Env: PAYPAL_WEBHOOK_ID

import { paypalConfigured, pp, ensureOrderForPaypal } from "../../../lib/paypal";

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
      // Eerste 2 minuten: de checkout maakt de order zelf (met volledige tracking) → PayPal later opnieuw laten proberen
      if (Date.now() - new Date(sub.create_time).getTime() < 120000) return res.status(503).send("retry later");
      const order = await ensureOrderForPaypal(sub, {});
      return res.status(200).json({ received: true, order: order.name });
    }
    return res.status(200).json({ received: true, ignored: event.event_type });
  } catch (e) {
    console.error("paypal/webhook:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
