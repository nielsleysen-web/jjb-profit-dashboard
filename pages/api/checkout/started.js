// pages/api/checkout/started.js — Abandoned checkout: het e-mailadres zodra de klant het op de checkout invult.
//
// POST { email, pack, product?, first_name?, track?, gift?, bonus? }
//   → Klaviyo-event "Started Checkout" (NeuroTone) of "LubriSense Started Checkout" (eigen flow per product),
//     met twee persoonlijke terugkeerlinks:
//       checkout_url        terug naar de checkout (zelfde bundel, e-mail ingevuld, oorspronkelijke advertentie-tracking)
//       checkout_url_gift   idem + kortingscode (automatisch toegepast) + "secret gift" (gratis e-book), voor mail 1
//       checkout_url_bonus  idem + 1 flacone in omaggio + "secret gift" (zonder kortingscode), voor mail 2
//   bonus: true → bij de order komt er een gratis 1x NeuroTone bij (lib/checkout-bonus.js)
//   De Klaviyo-flow (trigger "Started Checkout") stuurt mail 1 na 5 min en mail 2 na 1 uur, en stopt zodra
//   "Checkout Completed" binnenkomt (zie lib/klaviyo.js → syncNewMember).
//   gift: true → de klant kwam terug via mail 2; bij de aankoop krijgt het lid een willekeurig e-book in het portaal
//   (Redis checkout:gift:<email>, 30 dagen; lib/portal-members.js → registerMember).
//
// Antwoordt altijd snel { ok: true }; fouten blokkeren de checkout nooit.
import { trackEvent, klaviyoConfigured } from "../../../lib/klaviyo";
import { bump, redis, storeConfigured } from "../../../lib/portal-store";
import { getProduct } from "../../../lib/checkout";

const CHECKOUT_BASE = process.env.CHECKOUT_URL || "https://checkout.getjustjenny.com/";
export const RECOVERY_CODE = process.env.CHECKOUT_RECOVERY_CODE || "BENTORNATO20";
const TRACK_KEYS = ["ad_id", "adset_id", "campaign_id", "fbclid", "utm_source", "utm_campaign", "utm_content", "utm_medium", "utm_term", "host", "path", "pg"];
const IMG = "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/";
const PACK_IMG = {
  neurotone: { 1: "Artboard3_aa37d423-8b7a-450f-8ea6-83c2aff726c2.png?width=480", 2: "Artboard3_1.png?width=480", 3: "Artboard3_2.png?width=480", 5: "Artboard3copy_1c26406e-68ad-44c1-a428-5d99f4ff1fa7.png?width=480" },
  lubrisense: { 1: "3_5305b5fc-f123-40dc-a487-545a8bd63b05.png?v=1787285389&width=480", 2: "4_681fd7dd-be4d-4f81-ad4b-c1295e55e3f6.png?v=1787285390&width=480", 3: "5.png?v=1787285390&width=480", 5: "6.png?v=1787285390&width=480" },
};

const money = (c) => (c / 100).toFixed(2).replace(".", ",");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(200).json({ ok: false, error: "invalid_email" });
    const product = getProduct(b.product);
    if (!product.abandoned) return res.status(200).json({ ok: true, skipped: "product" });
    const BUNDLES = product.bundles;
    const pack = BUNDLES[b.pack] ? String(b.pack) : "3";
    const bundle = BUNDLES[pack];

    // Misbruik beperken: max 10 per IP per uur, max 4 per e-mailadres per uur
    if (storeConfigured()) {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "na";
      if ((await bump(`checkout:rl:ip:${ip}`, 3600)) > 10) return res.status(200).json({ ok: true });
      if ((await bump(`checkout:rl:em:${email}`, 3600)) > 4) return res.status(200).json({ ok: true });
    }
    // Terug via mail 2: alleen het cadeau onthouden (geen nieuw event, anders start de flow opnieuw)
    if (b.gift || b.bonus) {
      if (storeConfigured()) {
        if (b.gift) await redis(["SET", `checkout:gift:${email}`, "1", "EX", String(30 * 86400)]);
        if (b.bonus) await redis(["SET", `checkout:bonus:${email}`, product.key, "EX", String(30 * 86400)]); // waarde = product → 1x van dát product gratis
      }
      return res.status(200).json({ ok: true, gift: !!b.gift, bonus: !!b.bonus });
    }
    if (!klaviyoConfigured()) return res.status(200).json({ ok: true });

    // Terugkeerlinks: zelfde bundel, e-mail ingevuld, oorspronkelijke advertentie-tracking behouden
    const url = new URL(CHECKOUT_BASE);
    if (product.key !== "neurotone") url.searchParams.set("p", product.key);
    url.searchParams.set("b", pack);
    url.searchParams.set("email", email);
    const track = b.track && typeof b.track === "object" ? b.track : {};
    for (const k of TRACK_KEYS) if (track[k]) url.searchParams.set(k, String(track[k]).slice(0, 200));
    url.searchParams.set("jj_recover", "1");
    const gift = new URL(url);
    gift.searchParams.set("code", RECOVERY_CODE);
    gift.searchParams.set("gift", "1");
    // Mail 2: 1 flacone in omaggio + regalo segreto (geen kortingscode)
    const bonus = new URL(url);
    bonus.searchParams.set("bonus", "1");
    bonus.searchParams.set("gift", "1");

    // Eén event per adres per half uur (dubbele invoer/verversen telt niet opnieuw)
    const slot = Math.floor(Date.now() / (30 * 60000));
    const eventName = product.key === "neurotone" ? "Started Checkout" : `${product.title} Started Checkout`;
    await trackEvent(eventName, email, {
      first_name: String(b.first_name || "").trim().slice(0, 60),
      pack: Number(pack),
      bundle_label: bundle.label,
      product: product.key === "neurotone" ? "Neurotone Drops" : product.title,
      price: money(bundle.price),
      compare_at: money(bundle.compare),
      image_url: IMG + (PACK_IMG[product.key] || PACK_IMG.neurotone)[pack],
      checkout_url: url.toString(),
      checkout_url_gift: gift.toString(),
      checkout_url_bonus: bonus.toString(),
      discount_code: RECOVERY_CODE,
    }, { value: bundle.price / 100, uniqueId: `checkout-${product.key}-${email}-${slot}` });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.warn("checkout started:", e.message);
    return res.status(200).json({ ok: true });
  }
}
