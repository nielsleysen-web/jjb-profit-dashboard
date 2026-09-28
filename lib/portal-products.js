// lib/portal-products.js — Gratis producten in het ledenportaal (Health For Life).
// Regel: elk product 1× per cyclus (proefweek = cyclus 0, daarna elke afschrijving van 28 dagen).
// Elke bestelling = 1 product met zijn eigen Shipping & Handling-fee (= onze kostprijs, break-even).
// Shopify-producten staan op DRAFT + tag portal-only (niet zichtbaar in de winkel); orders gaan via de Admin API.
// Foto's: public/portal/products/<slug>.jpg → https://checkout.getjustjenny.com/portal/products/<slug>.jpg

export const PORTAL_PRODUCTS = [
  {
    slug: "quiet-night-led-sleep-plugs",
    title: "Quiet Night LED Sleep Plugs",
    tagline: "Fall asleep right away, no matter how loud the ringing is.",
    compareAt: 11995,      // doorgestreepte "originele prijs" in centen
    shipping: 1995,        // Shipping & Handling-fee in centen (= kostprijs)
    shopifyProductId: "gid://shopify/Product/10650860683530",
    shopifyVariantId: "gid://shopify/ProductVariant/53824687177994",
    sku: "JJ-PORTAL-SLEEPPLUGS",
    image: "/portal/products/quiet-night-led-sleep-plugs.jpg",
  },
  {
    slug: "ear-cleaner-hd-camera",
    title: "Ear Cleaner with HD Camera",
    tagline: "See inside your ear on your phone and clear it safely.",
    compareAt: 6995,
    shipping: 495,
    shopifyProductId: "gid://shopify/Product/10650866942218",
    shopifyVariantId: "gid://shopify/ProductVariant/53824701104394",
    sku: "JJ-PORTAL-EARCLEANER",
    image: "/portal/products/ear-cleaner-hd-camera.jpg",
  },
  {
    slug: "ear-comfort-sleep-pillow",
    title: "Ergonomic Ear-Comfort Sleep Pillow",
    tagline: "Sleep on your side without pressure on your ear.",
    compareAt: 10995,
    shipping: 1995,
    shopifyProductId: "gid://shopify/Product/10650875756810",
    shopifyVariantId: "gid://shopify/ProductVariant/53824726368522",
    sku: "JJ-PORTAL-EARPILLOW",
    image: "/portal/products/ear-comfort-sleep-pillow.jpg",
  },
  {
    slug: "shower-earplugs",
    title: "Shower Earplugs",
    tagline: "Keep water out in the shower or pool. Reusable.",
    compareAt: 4995,
    shipping: 1495,
    shopifyProductId: "gid://shopify/Product/10650879492362",
    shopifyVariantId: "gid://shopify/ProductVariant/53824739180810",
    sku: "JJ-PORTAL-SHOWERPLUGS",
    image: "/portal/products/shower-earplugs.jpg",
  },
  {
    slug: "motion-sensor-night-light",
    title: "Motion-Sensor Night Light",
    tagline: "Soft warm light that switches on by itself when you get up at night.",
    compareAt: 4995,
    shipping: 995,
    shopifyProductId: "gid://shopify/Product/10650900103434",
    shopifyVariantId: "gid://shopify/ProductVariant/53824809992458",
    sku: "JJ-PORTAL-NIGHTLIGHT",
    image: "/portal/products/motion-sensor-night-light.jpg",
  },
];

export const PORTAL_RULES = { perProductPerCycle: 1, cycleDays: 28, trialDays: 7 };
export const findPortalProduct = (slug) => PORTAL_PRODUCTS.find((p) => p.slug === slug) || null;
