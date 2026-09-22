// pages/api/stripe/order.js
// Gegevens voor de bedankpagina: GET /api/stripe/order?sub=<subscription-id>
// Leest het abonnement, de klant en de eerste betaling uit Stripe, en het ordernummer
// + de "Traccia ordine"-link uit Shopify (zodra de webhook de order heeft aangemaakt).
// Het subscription-ID is lang en willekeurig; we geven alleen gegevens terug van
// abonnementen van de laatste 30 dagen.

import Stripe from "stripe";
import { BUNDLES, SHIPPING } from "../../../lib/checkout";
import { findOrderForInvoice } from "../../../lib/shopify-admin";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!stripe) return res.status(500).json({ error: "Stripe non configurato" });
  const subId = String(req.query.sub || "");
  if (!/^sub_[A-Za-z0-9]{8,}$/.test(subId)) return res.status(400).json({ error: "Riferimento non valido" });

  try {
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["customer", "latest_invoice.payment_intent.payment_method"],
    });
    if (Date.now() / 1000 - sub.created > 30 * 86400) return res.status(404).json({ error: "Non trovato" });

    const md = sub.metadata || {};
    const qty = parseInt(md.qty || md.bundle || "3", 10);
    const bundle = BUNDLES[qty] || BUNDLES[3];
    const ship = SHIPPING[md.shipping] || SHIPPING.insured;
    const cust = typeof sub.customer === "object" ? sub.customer : {};
    const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const pi = inv?.payment_intent && typeof inv.payment_intent === "object" ? inv.payment_intent : null;
    const pm = pi?.payment_method && typeof pi.payment_method === "object" ? pi.payment_method : null;

    let payment = null;
    if (pm?.type === "card") payment = { type: "card", brand: pm.card.brand, last4: pm.card.last4, wallet: pm.card.wallet?.type || null };
    else if (pm) payment = { type: pm.type };

    let order = null;
    if (inv?.id && inv.status === "paid") {
      try {
        const o = await findOrderForInvoice(inv.id);
        if (o) order = { name: o.name, statusPageUrl: o.statusPageUrl, tax: Math.round(parseFloat(o.totalTaxSet?.shopMoney?.amount || "0") * 100) };
      } catch (e) {
        console.warn("stripe/order shopify:", e.message);
      }
    }

    const sh = cust.shipping || {};
    return res.status(200).json({
      paid: inv?.status === "paid",
      created: sub.created,
      qty: bundle.qty,
      shipping: ship.code,
      amountPaid: inv?.amount_paid ?? bundle.price + ship.price,
      email: cust.email || "",
      name: sh.name || cust.name || "",
      phone: sh.phone || cust.phone || "",
      address: sh.address || cust.address || null,
      payment,
      order,
      quizDone: md.quiz_done === "1",
    });
  } catch (e) {
    if (e.statusCode === 404 || e.code === "resource_missing") return res.status(404).json({ error: "Non trovato" });
    console.error("stripe/order:", e.message);
    return res.status(500).json({ error: "Errore" });
  }
}
