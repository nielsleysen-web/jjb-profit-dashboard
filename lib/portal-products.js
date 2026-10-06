// lib/portal-products.js — Gratis producten in het ledenportaal (Health For Life).
// Regel: elk product 1× per cyclus (proefweek = cyclus 0, daarna elke afschrijving van 28 dagen).
// Elke bestelling = 1 product met zijn eigen Shipping & Handling-fee (= onze kostprijs, break-even).
// Shopify-producten staan op DRAFT + tag portal-only (niet zichtbaar in de winkel); orders gaan via de Admin API.
// Volgorde in het portaal = volgorde hieronder: van laagste naar hoogste Shipping & Handling-fee.
// Foto's: public/portal/products/<slug>.jpg → https://checkout.getjustjenny.com/portal/products/<slug>.jpg

import { BUNDLES } from "./checkout";
import { currentBrand } from "./portal-brand";
import { LUBRISENSE_PORTAL_PRODUCTS } from "./portal-products-lubrisense";

export const PORTAL_PRODUCTS = [
  {
    // NeuroTone Drops: 1 flacon per cyclus, zoals de andere producten (echte Shopify-variant 1x → fulfilment klopt)
    slug: "neurotone-drops",
    it: { title: "NeuroTone Drops", tagline: "Le gocce che sopprimono le onde sonore e riparano le cellule ciliate danneggiate. 1 flacone, scorta per 4 settimane." },
    title: "NeuroTone Drops",
    tagline: "The drops that suppress the sound waves and repair the damaged hair cells. 1 bottle, a 4-week supply.",
    compareAt: BUNDLES[1].compare,
    shipping: 995,
    shopifyProductId: "gid://shopify/Product/10561889403146",
    shopifyVariantId: BUNDLES[1].variantId,
    sku: "JJ-NEUROTONE-1",
    image: "/portal/products/neurotone-drops.jpg",
  },
  {
    slug: "shower-earplugs",
    it: { title: "Tappi per la doccia", tagline: "Tengono l'acqua fuori dalle orecchie, in doccia o in piscina. Riutilizzabili." },
    title: "Shower Earplugs",
    tagline: "Keep water out in the shower or pool. Reusable.",
    compareAt: 4995,
    shipping: 995,
    shopifyProductId: "gid://shopify/Product/10650879492362",
    shopifyVariantId: "gid://shopify/ProductVariant/53824739180810",
    sku: "JJ-PORTAL-SHOWERPLUGS",
    image: "/portal/products/shower-earplugs.jpg",
  },
  {
    slug: "motion-sensor-night-light",
    it: { title: "Luce notturna con sensore di movimento", tagline: "Una luce calda che si accende da sola quando ti alzi di notte." },
    title: "Motion-Sensor Night Light",
    tagline: "Soft warm light that switches on by itself when you get up at night.",
    compareAt: 4995,
    shipping: 995,
    shopifyProductId: "gid://shopify/Product/10650900103434",
    shopifyVariantId: "gid://shopify/ProductVariant/53824809992458",
    sku: "JJ-PORTAL-NIGHTLIGHT",
    image: "/portal/products/motion-sensor-night-light.jpg",
  },
  {
    slug: "ear-cleaner-hd-camera",
    it: { title: "Pulisci-orecchie con telecamera HD", tagline: "Guarda dentro l'orecchio dal telefono e puliscilo in sicurezza." },
    title: "Ear Cleaner with HD Camera",
    tagline: "See inside your ear on your phone and clear it safely.",
    compareAt: 6995,
    shipping: 995,
    shopifyProductId: "gid://shopify/Product/10650866942218",
    shopifyVariantId: "gid://shopify/ProductVariant/53824701104394",
    sku: "JJ-PORTAL-EARCLEANER",
    image: "/portal/products/ear-cleaner-hd-camera.jpg",
  },
  {
    slug: "ear-comfort-sleep-pillow",
    it: { title: "Cuscino ergonomico salva-orecchio", tagline: "Dormi sul fianco senza pressione sull'orecchio." },
    title: "Ergonomic Ear-Comfort Sleep Pillow",
    tagline: "Sleep on your side without pressure on your ear.",
    compareAt: 10995,
    shipping: 1495,
    shopifyProductId: "gid://shopify/Product/10650875756810",
    shopifyVariantId: "gid://shopify/ProductVariant/53824726368522",
    sku: "JJ-PORTAL-EARPILLOW",
    image: "/portal/products/ear-comfort-sleep-pillow.jpg",
  },
  {
    slug: "quiet-night-led-sleep-plugs",
    it: { title: "Tappi per dormire Quiet Night LED", tagline: "Ti addormenti subito, anche quando il fischio è forte." },
    title: "Quiet Night LED Sleep Plugs",
    tagline: "Fall asleep right away, no matter how loud the ringing is.",
    compareAt: 11995,      // doorgestreepte "originele prijs" in centen
    shipping: 2795,        // Shipping & Handling-fee in centen (= kostprijs)
    shopifyProductId: "gid://shopify/Product/10650860683530",
    shopifyVariantId: "gid://shopify/ProductVariant/53824687177994",
    sku: "JJ-PORTAL-SLEEPPLUGS",
    image: "/portal/products/quiet-night-led-sleep-plugs.jpg",
  },
];

export const PORTAL_RULES = { perProductPerCycle: 1, cycleDays: 28, trialDays: 7 };
// Producten van het actieve brand (NeuroTone-portaal of LubriSense-portaal, zie lib/portal-brand.js)
export const portalProducts = () => (currentBrand().key === "lubrisense" ? LUBRISENSE_PORTAL_PRODUCTS : PORTAL_PRODUCTS);
export const findPortalProduct = (slug) => portalProducts().find((p) => p.slug === slug) || null;
// Herkennen in Shopify-orders: op SKU, of op variant-ID (LubriSense zelf heeft geen SKU)
export const findPortalProductBySku = (sku, variantId) =>
  portalProducts().find((p) => (sku && p.sku === sku) || (variantId && p.shopifyVariantId === variantId)) || null;
