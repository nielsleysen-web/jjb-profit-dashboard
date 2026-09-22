// pages/api/stripe/subscribe.js
// Maakt de klant + het abonnement aan in Stripe en geeft de client_secret terug waarmee
// de checkout-pagina de betaling bevestigt.
//
// Wat er in Stripe gebeurt:
//   - Customer met adres, e-mail, telefoon en onze tracking-metadata (ad_id, funnel, …)
//   - Subscription op de membership-prijs met 7 dagen proef
//   - De front-end bundel + verzending als eenmalige regels op de EERSTE factuur
//     → die factuur wordt nu betaald (bundel + verzending), de membership start na 7 dagen,
//       daarna elke 28 dagen €49, met de opgeslagen betaalmethode.
//
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_MEMBERSHIP (terugkerende prijs, elke 28 dagen),
//      STRIPE_PRODUCT_NEUROTONE, STRIPE_PRODUCT_SHIPPING (producten voor de eenmalige regels)

import Stripe from "stripe";
import { pickBundle, pickShipping, totals, PRODUCT_TITLE, CURRENCY, TRACK_KEYS, MEMBERSHIP } from "../../../lib/checkout";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;

const clean = (s, max = 200) => String(s || "").trim().slice(0, max);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe || !process.env.STRIPE_PRICE_MEMBERSHIP || !process.env.STRIPE_PRODUCT_NEUROTONE) {
    return res.status(500).json({ error: "Stripe non configurato" });
  }

  try {
    const b = req.body || {};
    const bundle = pickBundle(b.bundle);
    const shipping = pickShipping(b.shipping);
    const t = totals(bundle, shipping);

    // --- validatie van het formulier ---
    const email = clean(b.email, 120).toLowerCase();
    const firstName = clean(b.firstName, 60);
    const lastName = clean(b.lastName, 60);
    const address1 = clean(b.address1, 120);
    const address2 = clean(b.address2, 120);
    const zip = clean(b.zip, 12);
    const city = clean(b.city, 80);
    const province = clean(b.province, 2).toUpperCase();
    const phone = clean(b.phone, 30);
    const smsOptIn = !!b.smsOptIn;

    const missing = [];
    if (!isEmail(email)) missing.push("email");
    if (!firstName) missing.push("firstName");
    if (!lastName) missing.push("lastName");
    if (!address1) missing.push("address1");
    if (!/^\d{5}$/.test(zip)) missing.push("zip");
    if (!city) missing.push("city");
    if (!province) missing.push("province");
    if (missing.length) return res.status(400).json({ error: "Controlla i campi evidenziati", fields: missing });

    // --- tracking-metadata (van jjb-track.js via de URL) ---
    const metadata = { source: "jjb-checkout", bundle: String(bundle.qty), shipping: shipping.code, sms_opt_in: smsOptIn ? "1" : "0" };
    const track = b.track && typeof b.track === "object" ? b.track : {};
    for (const k of TRACK_KEYS) if (track[k]) metadata[`jjb_${k}`] = clean(track[k], 300);
    if (track.pg) metadata.jjb_pg = clean(track.pg, 24); // pagina-variant (A/B) waar de klant vandaan kwam

    const name = `${firstName} ${lastName}`;
    const address = { line1: address1, line2: address2 || undefined, postal_code: zip, city, state: province, country: "IT" };

    // --- klant (hergebruik op e-mail zodat een tweede poging geen dubbele klant maakt) ---
    let customer = null;
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length) {
      customer = await stripe.customers.update(existing.data[0].id, { name, phone: phone || undefined, address, shipping: { name, phone: phone || undefined, address }, metadata });
    } else {
      customer = await stripe.customers.create({ email, name, phone: phone || undefined, address, shipping: { name, phone: phone || undefined, address }, metadata, preferred_locales: ["it"] });
    }

    // --- abonnement met proefperiode + eenmalige regels op de eerste factuur ---
    const trialEnd = Math.floor(Date.now() / 1000) + MEMBERSHIP.trialDays * 86400;
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_MEMBERSHIP, quantity: 1 }],
      trial_end: trialEnd,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      // Front-end bundel + verzending → nu betalen
      add_invoice_items: [
        {
          price_data: { currency: CURRENCY, product: process.env.STRIPE_PRODUCT_NEUROTONE, unit_amount: bundle.price },
          quantity: 1,
        },
        ...(shipping.price > 0 && process.env.STRIPE_PRODUCT_SHIPPING
          ? [{ price_data: { currency: CURRENCY, product: process.env.STRIPE_PRODUCT_SHIPPING, unit_amount: shipping.price }, quantity: 1 }]
          : []),
      ],
      metadata: { ...metadata, bundle_label: bundle.label, product: PRODUCT_TITLE, qty: String(bundle.qty), amount_frontend: String(bundle.price), amount_shipping: String(shipping.price) },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    });

    // Bij een proefperiode met eenmalige regels heeft de eerste factuur een bedrag > 0 → PaymentIntent.
    const invoice = subscription.latest_invoice;
    const pi = invoice?.payment_intent;
    if (!pi || !pi.client_secret) {
      // Zou niet mogen (bundel is altijd > 0), maar dan valt Stripe terug op een SetupIntent
      const si = subscription.pending_setup_intent;
      if (si?.client_secret) return res.status(200).json({ type: "setup", clientSecret: si.client_secret, subscriptionId: subscription.id, customerId: customer.id, total: t.total });
      throw new Error("Nessun intent di pagamento sulla prima fattura");
    }

    // Metadata ook op de PaymentIntent, zodat de webhook en de dashboards er direct bij kunnen
    await stripe.paymentIntents.update(pi.id, {
      metadata: { ...metadata, subscription_id: subscription.id, invoice_id: invoice.id, qty: String(bundle.qty), amount_frontend: String(bundle.price), amount_shipping: String(shipping.price) },
      description: `${bundle.label} + membership (trial ${MEMBERSHIP.trialDays}d)`,
      receipt_email: email,
      shipping: { name, phone: phone || undefined, address },
    });

    return res.status(200).json({ type: "payment", clientSecret: pi.client_secret, subscriptionId: subscription.id, customerId: customer.id, total: t.total, amountDue: invoice.amount_due });
  } catch (e) {
    console.error("stripe/subscribe:", e.message);
    const msg = e.type === "StripeCardError" ? e.message : "Si è verificato un errore. Riprova tra qualche istante.";
    return res.status(500).json({ error: msg });
  }
}
