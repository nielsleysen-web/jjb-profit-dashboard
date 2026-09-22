// pages/api/stripe/create-subscription.js
// Aangeroepen door de checkout (public/checkout/assets/checkout.js).
// Maakt de klant + het abonnement in Stripe en geeft de client secret terug.
//
// Model:
//   - NU betalen: de gekozen bundel (1/2/3/5) + verzending  → eenmalige regels op de 1e factuur
//   - Daarna: Just Jenny Health For Life Membership, 7 dagen gratis proef, dan €49 elke 28 dagen
//   - De webhook maakt van de 1e betaling een Shopify-order; rebills blijven in Stripe.
//
// Stripe-prijzen worden automatisch aangemaakt bij de eerste checkout (via lookup keys) —
// je hoeft in Stripe niets met de hand aan te maken. Wil je een prijs wijzigen: pas het
// bedrag aan in lib/checkout.js ÉN verhoog het versienummer in de lookup key hieronder.
// Env: STRIPE_SECRET_KEY · optioneel STRIPE_PAYPAL=1 (als PayPal in Stripe aanstaat)

import Stripe from "stripe";
import { pickBundle, SHIPPING, MEMBERSHIP, PRODUCT_TITLE, TRACK_KEYS } from "../../../lib/checkout";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
const FUNNEL = "main";
const CURRENCY = "eur";
const V = "v1"; // verhoog bij een prijswijziging

const clean = (s, max = 200) => String(s || "").trim().slice(0, max);

async function getOrCreatePrice(lookupKey, create) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data.length) return found.data[0].id;
  const price = await stripe.prices.create({ ...create, lookup_key: lookupKey });
  return price.id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(500).json({ error: "Pagamento non configurato" });

  try {
    const b = req.body || {};
    const bundle = pickBundle(b.pack);
    const ship = SHIPPING[b.ship_method] || SHIPPING.insured;

    const email = clean(b.email, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Inserisci un indirizzo email valido" });
    const s = b.shipping || {};
    const name = clean(b.name || s.name, 120);
    const phone = clean(b.phone || s.phone, 30);
    const address = {
      line1: clean(s.line1, 120),
      line2: clean(s.line2, 120) || undefined,
      city: clean(s.city, 80),
      state: clean(s.state, 40),
      postal_code: clean(s.postal_code, 12),
      country: "IT",
    };
    if (!address.line1 || !address.city || !/^\d{5}$/.test(address.postal_code)) {
      return res.status(400).json({ error: "Controlla l’indirizzo di spedizione" });
    }

    // Echte IP + browser van de koper (voor Meta CAPI later)
    const clientIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const clientUa = String(req.headers["user-agent"] || "").slice(0, 450);

    // --- metadata: funnel + bundel + onze tracking (jjb_*) → webhook → Shopify-order ---
    const metadata = {
      funnel: FUNNEL,
      source: "jjb-checkout",
      qty: String(bundle.qty),
      bundle: String(bundle.qty),
      bundle_label: bundle.label,
      product: PRODUCT_TITLE,
      shipping: ship.code,
      amount_frontend: String(bundle.price),
      amount_shipping: String(ship.price),
      ...(clientIp ? { client_ip: clientIp } : {}),
      ...(clientUa ? { client_ua: clientUa } : {}),
    };
    const track = b.track && typeof b.track === "object" ? b.track : {};
    for (const k of TRACK_KEYS) if (track[k]) metadata[`jjb_${k}`] = clean(track[k], 300);
    if (track.pg) metadata.jjb_pg = clean(track.pg, 24);
    if (track.utm_medium) metadata.jjb_utm_medium = clean(track.utm_medium, 100);

    // --- prijzen (automatisch aangemaakt, daarna hergebruikt) ---
    const membershipPrice = process.env.STRIPE_PRICE_MEMBERSHIP || (await getOrCreatePrice(`jj_membership_${MEMBERSHIP.price}_${MEMBERSHIP.intervalDays}d_${V}`, {
      currency: CURRENCY,
      unit_amount: MEMBERSHIP.price,
      recurring: { interval: "day", interval_count: MEMBERSHIP.intervalDays },
      product_data: { name: `${MEMBERSHIP.name} (ogni ${MEMBERSHIP.intervalDays} giorni)` },
    }));
    const bundlePrice = await getOrCreatePrice(`jj_bundle_${bundle.qty}_${bundle.price}_${V}`, {
      currency: CURRENCY,
      unit_amount: bundle.price,
      product_data: { name: `${PRODUCT_TITLE} — ${bundle.label}` },
    });
    const addInvoiceItems = [{ price: bundlePrice, quantity: 1 }];
    if (ship.price > 0) {
      const shipPrice = await getOrCreatePrice(`jj_ship_${ship.code}_${ship.price}_${V}`, {
        currency: CURRENCY,
        unit_amount: ship.price,
        product_data: { name: ship.title },
      });
      addInvoiceItems.push({ price: shipPrice, quantity: 1 });
    }

    // --- klant (hergebruik op e-mail) ---
    const customerData = {
      email,
      name: name || undefined,
      phone: phone || undefined,
      address,
      shipping: { name: name || email, phone: phone || undefined, address },
      preferred_locales: ["it"],
      metadata,
    };
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data.length
      ? await stripe.customers.update(existing.data[0].id, customerData)
      : await stripe.customers.create(customerData);

    // --- kortingscode (optioneel) ---
    let discounts;
    if (b.promo_code) {
      const codes = await stripe.promotionCodes.list({ code: clean(b.promo_code, 60), active: true, limit: 1 });
      if (codes.data.length) {
        discounts = [{ promotion_code: codes.data[0].id }];
        metadata.promo_code = codes.data[0].code;
      }
    }

    // --- abonnement: proefperiode + eenmalige regels op de eerste factuur ---
    const methods = ["card", "link"];
    if (process.env.STRIPE_PAYPAL === "1") methods.push("paypal");
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: membershipPrice, quantity: 1 }],
        trial_end: Math.floor(Date.now() / 1000) + MEMBERSHIP.trialDays * 86400,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: methods },
        add_invoice_items: addInvoiceItems,
        discounts,
        metadata,
        expand: ["latest_invoice.payment_intent"],
      },
      // Zelfde bestelling opnieuw verstuurd (dubbelklik/netwerk) → zelfde abonnement, geen dubbel
      b.attempt_id ? { idempotencyKey: "jjsub_" + String(b.attempt_id).slice(0, 120) } : undefined
    );

    const invoice = subscription.latest_invoice;
    const pi = invoice && invoice.payment_intent;
    if (!pi || !pi.client_secret) return res.status(500).json({ error: "Impossibile avviare il pagamento" });

    // Metadata ook op de betaling zelf (handig in Stripe en voor de dashboards)
    await stripe.paymentIntents.update(pi.id, {
      metadata: { ...metadata, subscription_id: subscription.id, invoice_id: invoice.id },
      description: `${bundle.label} + ${MEMBERSHIP.name} (prova ${MEMBERSHIP.trialDays} giorni)`,
      receipt_email: email,
      shipping: { name: name || email, phone: phone || undefined, address },
    });

    return res.status(200).json({ clientSecret: pi.client_secret, subscriptionId: subscription.id, amount: pi.amount });
  } catch (e) {
    console.error("stripe/create-subscription:", e.message);
    return res.status(500).json({ error: e.type === "StripeCardError" ? e.message : "Si è verificato un errore. Riprova tra qualche istante." });
  }
}
