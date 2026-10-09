// pages/api/paypal/create-subscription.js
// De PayPal-knop op de checkout vraagt hier een abonnement aan. Wij kiezen het juiste plan
// (bundel × verzending) en geven het abonnements-ID terug; de klant keurt het goed in PayPal.

import { paypalConfigured, planFor, pp, packCustom, saveCheckoutContext } from "../../../lib/paypal";
import { getProduct, TRACK_KEYS } from "../../../lib/checkout";

const clean = (s, max = 120) => String(s || "").trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!paypalConfigured()) return res.status(500).json({ error: "PayPal non configurato" });
  try {
    const b = req.body || {};
    // Geen PayPal-plannen voor dit product (Magnesium Freeze: paypal:false, of eenmalig zonder membership)
    const prod = getProduct(b.product);
    if (!prod.membership || prod.paypal === false) return res.status(400).json({ error: "PayPal non disponibile per questo prodotto: paga con carta, Apple Pay o Google Pay." });
    const plan = await planFor(parseInt(b.pack, 10), b.ship_method, b.product);
    const s = b.shipping || {};
    const full = !!(s.line1 && s.city && /^\d{5}$/.test(String(s.postal_code || "")) && (s.name || b.name));

    const body = {
      plan_id: plan.id,
      custom_id: packCustom(plan.bundle.qty, plan.ship.code, b.track || {}, plan.product.key),
      application_context: {
        brand_name: "Just Jenny",
        locale: "it-IT",
        shipping_preference: full ? "SET_PROVIDED_ADDRESS" : "GET_FROM_FILE",
        user_action: "SUBSCRIBE_NOW",
      },
    };
    const name = clean(b.name || s.name);
    const [given, ...sur] = name.split(" ");
    const subscriber = {};
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(b.email))) subscriber.email_address = clean(b.email).toLowerCase();
    if (name) subscriber.name = { given_name: given || undefined, surname: sur.join(" ") || undefined };
    if (full) {
      subscriber.shipping_address = {
        name: { full_name: name },
        address: {
          address_line_1: clean(s.line1), address_line_2: clean(s.line2) || undefined,
          admin_area_2: clean(s.city, 80), admin_area_1: clean(s.state, 40) || undefined,
          postal_code: clean(s.postal_code, 12), country_code: "IT",
        },
      };
    }
    if (Object.keys(subscriber).length) body.subscriber = subscriber;

    const sub = await pp("post", "/v1/billing/subscriptions", body);
    // Tracking (fbc/fbp/ad-id) + IP/browser bewaren: maakt de webhook de order, dan gaat dit toch mee naar Shopify + Meta
    const t = b.track && typeof b.track === "object" ? b.track : {};
    const track = {};
    for (const k of [...TRACK_KEYS, "pg", "utm_medium"]) if (t[k]) track[k] = String(t[k]).slice(0, 300);
    await saveCheckoutContext(sub.id, {
      track, phone: clean(b.phone || s.phone, 30),
      clientIp: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim(),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 450),
    });
    return res.status(200).json({ id: sub.id });
  } catch (e) {
    console.error("paypal/create-subscription:", e.message);
    return res.status(500).json({ error: "Impossibile avviare PayPal. Riprova o paga con carta." });
  }
}
