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
import { TRACK_KEYS, getProduct, pickBundleFor, INSURANCE, bumpFor, getMarket, zipValidFor, currencyOf, shippingFor, insuranceFor, membershipOf } from "../../../lib/checkout";
import { saveCheckoutPhone } from "../../../lib/klaviyo";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
const V = "v1"; // verhoog bij een prijswijziging

const clean = (s, max = 200) => String(s || "").trim().slice(0, max);

// A/B-test 3D Secure — alleen op de aparte 3DS-checkoutlinks (checkout.getjustjenny.com/3ds, /lubrisense/3ds,
// /magnesium/3ds; checkout.js stuurt dan checkout_variant "3ds" mee). Daar krijgen debit- en prepaidkaarten een
// verplichte 3DS-bevestiging bij de eerste betaling (vaak €29,95, net onder de €30-vrijstelling → anders géén 3DS,
// waarna strenge banken zoals Intesa/PostePay de latere rebill zonder bevestigde machtiging weigeren).
// De gewone checkoutlinks blijven exact zoals ze waren (controlegroep).
//   JJ_3DS_FUNDING  kaarttypes, komma-gescheiden (standaard "debit,prepaid"); "off" = op de 3DS-links ook uit
// Het kaarttype komt van de PaymentMethod die de checkout vlak voor de betaling aanmaakt (server haalt hem zelf op).
async function threeDsDecision(variant, pmId) {
  if (variant !== "3ds") return { force: false, funding: null };
  const cfg = String(process.env.JJ_3DS_FUNDING ?? "debit,prepaid").toLowerCase().trim();
  if (!pmId || !/^pm_[A-Za-z0-9]+$/.test(String(pmId))) return { force: false, funding: null };
  const pm = await stripe.paymentMethods.retrieve(String(pmId)).catch(() => null);
  const funding = pm?.card?.funding || null;
  if (!funding || pm?.card?.wallet || !cfg || cfg === "off" || cfg === "0") return { force: false, funding };
  return { force: cfg.split(",").map((x) => x.trim()).includes(funding), funding };
}

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
    // Product: NeuroTone (standaard) of LubriSense (checkout.getjustjenny.com/lubrisense) — elk met een eigen membership
    const product = getProduct(b.product);
    const PRODUCT_TITLE = product.title;
    const bundle = pickBundleFor(product, b.pack);
    // Valuta per product (standaard EUR; Pumpkin Seed Oil Softgels = USD). Niet-EUR-prijzen krijgen een eigen lookup key (_usd).
    const MEMBERSHIP = membershipOf(product, bundle); // refill-product (Sage Leaf): bundelprijs elke 28 dagen
    const CURRENCY = currencyOf(product);
    const CS = CURRENCY === "eur" ? "" : `_${CURRENCY}`;
    const SHIP = shippingFor(CURRENCY), INS = insuranceFor(CURRENCY);
    const ship = SHIP[b.ship_method] || SHIP.insured;
    const insurance = b.insurance === true || b.insurance === "1" || b.insurance === 1; // verzendverzekering (4,95 €, eenmalig)
    // Order bump (UrinaPatches: Spray Neutralizzante 9,95 €, A/B-test) — alleen voor producten met een bump
    const BUMP = bumpFor(product.key);
    const bump = !!BUMP && (b.bump === true || b.bump === "1" || b.bump === 1);
    const bumpAb = BUMP && ["a", "b"].includes(b.bump_ab) ? b.bump_ab : "";

    // Markt: it (standaard), nl (NL/BE: iDEAL + Bancontact + kaart, SEPA-machtiging) of us (Engels, USD; vast per product)
    const market = getMarket(product.market || b.market);
    const EN = market.key === "us";
    const email = clean(b.email, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: EN ? "Please enter a valid email address" : "Inserisci un indirizzo email valido" });
    const s = b.shipping || {};
    const name = clean(b.name || s.name, 120);
    let phone = clean(b.phone || s.phone, 30);
    const country = market.countries.includes(String(s.country || "").toUpperCase()) ? String(s.country).toUpperCase() : market.countries[0];
    const address = {
      line1: clean(s.line1, 120),
      line2: clean(s.line2, 120) || undefined,
      city: clean(s.city, 80),
      state: clean(s.state, 40) || undefined,
      postal_code: clean(s.postal_code, 12).toUpperCase(),
      country,
    };
    // NL/BE: nationaal nummer (06…/04…) → internationaal, anders maakt itPhone() er een Italiaans nummer van
    if (market.key === "nl" && phone) {
      const d = phone.replace(/[^\d+]/g, "");
      if (/^0[1-9]\d{7,9}$/.test(d)) phone = (country === "BE" ? "+32" : "+31") + d.slice(1);
      else if (d.startsWith("00")) phone = "+" + d.slice(2);
    }
    // US/CA/GB/AU/NZ: nationaal nummer → internationaal (+1 / +44 / +61 / +64)
    if (EN && phone) {
      const d = phone.replace(/[^\d+]/g, "");
      if (d.startsWith("+")) phone = d;
      else if (d.startsWith("00")) phone = "+" + d.slice(2);
      else if ((country === "US" || country === "CA") && /^1?\d{10}$/.test(d)) phone = "+1" + d.slice(-10);
      else if (/^0\d{8,10}$/.test(d)) phone = ({ GB: "+44", AU: "+61", NZ: "+64" }[country] || "") + d.slice(1);
    }
    if (!address.line1 || !address.city || !zipValidFor(market, address.postal_code, country)) {
      return res.status(400).json({ error: EN ? "Please check your shipping address" : market.key === "nl" ? "Controleer je bezorgadres" : "Controlla l’indirizzo di spedizione" });
    }
    // Telefoonnummer meteen naar Klaviyo (ook als de betaling hierna niet doorgaat); blokkeert de checkout nooit
    const klPhone = saveCheckoutPhone({ email, phone, name }).catch((e) => console.error("klaviyo phone:", e.message));

    // Echte IP + browser van de koper (voor Meta CAPI later)
    const clientIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const clientUa = String(req.headers["user-agent"] || "").slice(0, 450);

    // --- metadata: funnel + bundel + onze tracking (jjb_*) → webhook → Shopify-order ---
    const metadata = {
      funnel: product.funnel,
      product_key: product.key,
      ...(bundle.gift ? { gift: "ebook" } : {}),
      source: "jjb-checkout",
      qty: String(bundle.qty),
      bundle: String(bundle.qty),
      bundle_label: bundle.label,
      product: PRODUCT_TITLE,
      shipping: ship.code,
      amount_frontend: String(bundle.price),
      amount_shipping: String(ship.price),
      ...(insurance ? { insurance: "1", amount_insurance: String(INSURANCE.price) } : {}),
      ...(CURRENCY !== "eur" ? { currency: CURRENCY } : {}),
      ...(bump ? { bump: BUMP.key, amount_bump: String(BUMP.price) } : {}),
      ...(bumpAb ? { jj_bump_ab: bumpAb } : {}), // A/B-test order bump (a = zonder, b = met bump getoond)
      ...(["a", "b", "c"].includes(b.checkout_ab) ? { jj_checkout_ab: b.checkout_ab } : {}), // A/B-test checkout NeuroTone
      ...(clientIp ? { client_ip: clientIp } : {}),
      ...(clientUa ? { client_ua: clientUa } : {}),
    };
    const track = b.track && typeof b.track === "object" ? b.track : {};
    for (const k of TRACK_KEYS) if (track[k]) metadata[`jjb_${k}`] = clean(track[k], 300);
    if (track.pg) metadata.jjb_pg = clean(track.pg, 24);
    if (track.utm_medium) metadata.jjb_utm_medium = clean(track.utm_medium, 100);

    // Product zonder membership (Magnesium Freeze): eenmalige aankoop. Technisch een abonnement op een
    // €0-prijs dat na de eerste factuur afloopt (cancel_at_period_end) → nooit een herhaalde afschrijving,
    // maar webhook (Shopify-order), bedankpagina en dashboards werken zoals bij de andere producten.
    const onetime = !MEMBERSHIP;
    if (onetime) metadata.kind = "onetime";

    // --- prijzen (automatisch aangemaakt, daarna hergebruikt) ---
    const membershipPrice = onetime
      ? await getOrCreatePrice(`jj_onetime_zero${CS}_${V}`, {
          currency: CURRENCY,
          unit_amount: 0,
          recurring: { interval: "month", interval_count: 1 },
          product_data: { name: "Just Jenny — acquisto singolo (nessun abbonamento)" },
        })
      : process.env[product.priceEnv] || (await getOrCreatePrice(`${product.lookupPrefix}_membership_${MEMBERSHIP.price}_${MEMBERSHIP.intervalDays}d_${V}`, {
          currency: CURRENCY,
          unit_amount: MEMBERSHIP.price,
          recurring: { interval: "day", interval_count: MEMBERSHIP.intervalDays },
          product_data: { name: MEMBERSHIP.name },
        }));
    const bundlePrice = await getOrCreatePrice(`${product.lookupPrefix}_bundle_${bundle.qty}_${bundle.price}_${V}`, {
      currency: CURRENCY,
      unit_amount: bundle.price,
      product_data: { name: `${PRODUCT_TITLE} — ${bundle.label}` },
    });
    const addInvoiceItems = [{ price: bundlePrice, quantity: 1 }];
    if (ship.price > 0) {
      const shipPrice = await getOrCreatePrice(`jj_ship_${ship.code}_${ship.price}${CS}_${V}`, {
        currency: CURRENCY,
        unit_amount: ship.price,
        product_data: { name: ship.title },
      });
      addInvoiceItems.push({ price: shipPrice, quantity: 1 });
    }
    if (insurance) {
      const insPrice = await getOrCreatePrice(`jj_insurance_${INSURANCE.price}${CS}_${V}`, {
        currency: CURRENCY,
        unit_amount: INSURANCE.price,
        product_data: { name: INS.title },
      });
      addInvoiceItems.push({ price: insPrice, quantity: 1 });
    }
    if (bump) {
      const bumpPrice = await getOrCreatePrice(`jj_bump_${BUMP.key}_${BUMP.price}${CS}_${V}`, {
        currency: CURRENCY,
        unit_amount: BUMP.price,
        product_data: { name: BUMP.title },
      });
      addInvoiceItems.push({ price: bumpPrice, quantity: 1 });
    }

    // --- klant (hergebruik op e-mail) ---
    const customerData = {
      email,
      name: name || undefined,
      phone: phone || undefined,
      address,
      shipping: { name: name || email, phone: phone || undefined, address },
      preferred_locales: [market.locale],
      metadata,
    };
    // Niet-EUR (USD): eigen Stripe-klant per valuta, zodat een bestaande EUR-klant met hetzelfde e-mailadres niet botst
    const existing = await stripe.customers.list({ email, limit: CS ? 10 : 1 });
    const reuse = CS ? existing.data.find((c) => c.metadata?.currency === CURRENCY) : existing.data[0];
    const customer = reuse
      ? await stripe.customers.update(reuse.id, customerData)
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
    const methods = [...market.paymentMethods];
    if (market.paypal && process.env.STRIPE_PAYPAL === "1") methods.push("paypal");
    if (market.key !== "it") metadata.market = market.key;
    const variant = b.checkout_variant === "3ds" ? "3ds" : null;
    const tds = await threeDsDecision(variant, b.pm_id);
    if (variant) metadata.jj_checkout_variant = variant; // A/B: ontbreekt = gewone checkout
    if (tds.funding) metadata.jj_card_funding = tds.funding;
    if (tds.force) metadata.jj_3ds = "forced";
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: membershipPrice, quantity: 1 }],
        ...(onetime
          ? { cancel_at_period_end: true } // eenmalig: loopt na de eerste factuur af, €0 → nooit een rebill
          : { trial_end: Math.floor(Date.now() / 1000) + MEMBERSHIP.trialDays * 86400 }),
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: methods,
          ...(tds.force ? { payment_method_options: { card: { request_three_d_secure: "any" } } } : {}),
        },
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
    if (!pi || !pi.client_secret) return res.status(500).json({ error: EN ? "Could not start the payment" : "Impossibile avviare il pagamento" });

    // Metadata ook op de betaling zelf (handig in Stripe en voor de dashboards)
    await stripe.paymentIntents.update(pi.id, {
      metadata: { ...metadata, subscription_id: subscription.id, invoice_id: invoice.id },
      description: onetime ? `${PRODUCT_TITLE} — ${bundle.label}` : MEMBERSHIP.refill ? `${bundle.label} — refill every ${MEMBERSHIP.intervalDays} days` : EN ? `${bundle.label} + ${MEMBERSHIP.name} (${MEMBERSHIP.trialDays}-day trial)` : `${bundle.label} + ${MEMBERSHIP.name} (prova ${MEMBERSHIP.trialDays} giorni)`,
      receipt_email: email,
      shipping: { name: name || email, phone: phone || undefined, address },
    });

    await Promise.race([klPhone, new Promise((r) => setTimeout(r, 1500))]); // meestal al klaar; nooit langer dan 1,5 s wachten
    return res.status(200).json({ clientSecret: pi.client_secret, subscriptionId: subscription.id, amount: pi.amount });
  } catch (e) {
    console.error("stripe/create-subscription:", e.message);
    const en = getProduct((req.body || {}).product).market === "us";
    return res.status(500).json({ error: e.type === "StripeCardError" ? e.message : en ? "Something went wrong. Please try again in a moment." : "Si è verificato un errore. Riprova tra qualche istante." });
  }
}
