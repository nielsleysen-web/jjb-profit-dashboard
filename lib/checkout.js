// lib/checkout.js
// Gedeelde catalogus + regels voor de eigen checkout (checkout.getjustjenny.com).
// Wordt gebruikt door de pagina (client) én de Stripe-routes (server) — geen secrets hier.

// Bundels zoals op de salespagina. Prijzen in centen. Shopify-variant-ID's van "Neurotone Drops"
// (product 10561889403146) zodat de fulfilment-order de juiste variant krijgt.
export const BUNDLES = {
  1: { qty: 1, price: 2995, compare: 6000, variantId: "gid://shopify/ProductVariant/53320505426186", label: "1x NeuroTone™" },
  2: { qty: 2, price: 3995, compare: 12000, variantId: "gid://shopify/ProductVariant/53320505458954", label: "2x NeuroTone™" },
  3: { qty: 3, price: 4995, compare: 18000, variantId: "gid://shopify/ProductVariant/53320505491722", label: "3x NeuroTone™", badge: "PIÙ VENDUTO" },
  5: { qty: 5, price: 5995, compare: 30000, variantId: "gid://shopify/ProductVariant/53320505524490", label: "5x NeuroTone™" },
};

export const PRODUCT_TITLE = "Neurotone Drops";

// Post-purchase upsell (pagina /checkout/offerta): 1+1 gratis → 2 flacons voor €29,95, zonder verzendkosten,
// met één klik toegevoegd aan dezelfde Shopify-order. Prijzen in centen; compare = 2 × listprijs €60.
export const UPSELL = {
  qty: 1, bottles: 2, price: 2995, compare: 12000, perBottle: 1498, // 1 regel van het upsell-product = 2 flacons
  variantId: "gid://shopify/ProductVariant/53842294735114", // eigen Shopify-product "NeuroTone Drops · Offerta 1+1 (2 flaconi)", €29,95, draft/portal-only
  sku: "JJ-NEUROTONE-UPSELL-2",
  label: "1+1 GRATIS (2 Flaconi)",
  title: "NeuroTone Drops · 1+1 GRATIS (2 Flaconi)",
  tag: "upsell-1plus1",
  windowMin: 120, // aanbod alleen binnen 2 uur na de aankoop
};

// Verzendopties zoals in de Shopify-checkout
export const SHIPPING = {
  // title = zoals op de checkout; komt ook als verzendregel op de Shopify-order en op de bedankpagina
  insured: { code: "insured", title: "Express (3-5 giorni lavorativi)", sub: "Tracciamento del pacco incluso", price: 395 },
  free: { code: "free", title: "Standard (5-8 giorni lavorativi)", sub: "Spedizione gratuita", price: 0 },
};

// Membership: 7 dagen proef, daarna €49 elke 28 dagen (Stripe-prijs via env STRIPE_PRICE_MEMBERSHIP)
export const MEMBERSHIP = { trialDays: 7, price: 4900, intervalDays: 28, name: "Just Jenny Health For Life Membership" };

export const CURRENCY = "eur";

// ---- Meerdere producten op dezelfde checkout ----
// checkout.getjustjenny.com/            → NeuroTone (alles hierboven, ongewijzigd)
// checkout.getjustjenny.com/lubrisense  → LubriSense met een eigen membership (eigen Stripe-prijs + PayPal-plannen)
// Shopify-variant-ID's van "LubriSense" (product 10597036163338). Geen doorstreepprijs in Shopify → compare = 0.
export const PRODUCTS = {
  neurotone: {
    key: "neurotone", title: PRODUCT_TITLE, bundles: BUNDLES, membership: MEMBERSHIP,
    shopifyProductId: "10561889403146", funnel: "main", priceEnv: "STRIPE_PRICE_MEMBERSHIP",
    lookupPrefix: "jj", paypalProductId: "JJ-NEUROTONE-MEMBERSHIP", paypalPlanPrefix: "JJ NeuroTone",
    portal: true, upsell: true, abandoned: true, tag: null,
  },
  lubrisense: {
    key: "lubrisense", title: "LubriSense",
    bundles: {
      1: { qty: 1, price: 3495, compare: 0, variantId: "gid://shopify/ProductVariant/53543831994634", label: "1x LubriSense™" },
      2: { qty: 2, price: 4495, compare: 0, variantId: "gid://shopify/ProductVariant/53543832027402", label: "2x LubriSense™" },
      3: { qty: 3, price: 5495, compare: 0, variantId: "gid://shopify/ProductVariant/53543832060170", label: "3x LubriSense™", badge: "PIÙ VENDUTO" },
      5: { qty: 5, price: 6495, compare: 0, variantId: "gid://shopify/ProductVariant/53543832092938", label: "5x LubriSense™", gift: true },
    },
    membership: { trialDays: 7, price: 4900, intervalDays: 28, name: "Just Jenny Intimate Care Membership" },
    shopifyProductId: "10597036163338", funnel: "lubrisense", priceEnv: "STRIPE_PRICE_MEMBERSHIP_LUBRISENSE",
    lookupPrefix: "jj_lubrisense", paypalProductId: "JJ-LUBRISENSE-MEMBERSHIP", paypalPlanPrefix: "JJ LubriSense",
    // Eigen ledenportaal volgt later; tot dan geen NeuroTone-portaal, -upsell of -abandoned-mails
    portal: false, upsell: false, abandoned: false, tag: "lubrisense",
    portalBrand: "lubrisense", // eigen ledenportaal intimate.getjustjenny.com (lib/portal-brand.js)
  },
};
// Gratis cadeau bij sommige bundels (zoals de Shopify-cartlink deed): Shopify-product "Regalo gratuito" (€0).
// Inhoud = het e-book dat de klant op het platform krijgt; de €0-regel komt mee op de Shopify-order.
export const BUNDLE_GIFT = { variantId: "gid://shopify/ProductVariant/53313269072138", title: "Regalo a sorpresa", variant: "Incluso nel tuo ordine", note: "e-book", tag: "gift-ebook" };
export function giftLineItem() {
  return { variantId: BUNDLE_GIFT.variantId, quantity: 1, priceSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } } };
}

export function getProduct(key) {
  return PRODUCTS[String(key || "").toLowerCase()] || PRODUCTS.neurotone;
}
export function pickBundleFor(product, b) {
  const n = parseInt(b, 10);
  return product.bundles[n] || product.bundles[3];
}

// Italiaanse provincies (sigla → naam) voor de Provincia-dropdown
export const PROVINCES = [
  ["AG","Agrigento"],["AL","Alessandria"],["AN","Ancona"],["AO","Aosta"],["AR","Arezzo"],["AP","Ascoli Piceno"],["AT","Asti"],["AV","Avellino"],["BA","Bari"],["BT","Barletta-Andria-Trani"],["BL","Belluno"],["BN","Benevento"],["BG","Bergamo"],["BI","Biella"],["BO","Bologna"],["BZ","Bolzano"],["BS","Brescia"],["BR","Brindisi"],["CA","Cagliari"],["CL","Caltanissetta"],["CB","Campobasso"],["CE","Caserta"],["CT","Catania"],["CZ","Catanzaro"],["CH","Chieti"],["CO","Como"],["CS","Cosenza"],["CR","Cremona"],["KR","Crotone"],["CN","Cuneo"],["EN","Enna"],["FM","Fermo"],["FE","Ferrara"],["FI","Firenze"],["FG","Foggia"],["FC","Forlì-Cesena"],["FR","Frosinone"],["GE","Genova"],["GO","Gorizia"],["GR","Grosseto"],["IM","Imperia"],["IS","Isernia"],["SP","La Spezia"],["AQ","L'Aquila"],["LT","Latina"],["LE","Lecce"],["LC","Lecco"],["LI","Livorno"],["LO","Lodi"],["LU","Lucca"],["MC","Macerata"],["MN","Mantova"],["MS","Massa-Carrara"],["MT","Matera"],["ME","Messina"],["MI","Milano"],["MO","Modena"],["MB","Monza e Brianza"],["NA","Napoli"],["NO","Novara"],["NU","Nuoro"],["OR","Oristano"],["PD","Padova"],["PA","Palermo"],["PR","Parma"],["PV","Pavia"],["PG","Perugia"],["PU","Pesaro e Urbino"],["PE","Pescara"],["PC","Piacenza"],["PI","Pisa"],["PT","Pistoia"],["PN","Pordenone"],["PZ","Potenza"],["PO","Prato"],["RG","Ragusa"],["RA","Ravenna"],["RC","Reggio Calabria"],["RE","Reggio Emilia"],["RI","Rieti"],["RN","Rimini"],["RM","Roma"],["RO","Rovigo"],["SA","Salerno"],["SS","Sassari"],["SV","Savona"],["SI","Siena"],["SR","Siracusa"],["SO","Sondrio"],["SU","Sud Sardegna"],["TA","Taranto"],["TE","Teramo"],["TR","Terni"],["TO","Torino"],["TP","Trapani"],["TN","Trento"],["TV","Treviso"],["TS","Trieste"],["UD","Udine"],["VA","Varese"],["VE","Venezia"],["VB","Verbano-Cusio-Ossola"],["VC","Vercelli"],["VR","Verona"],["VV","Vibo Valentia"],["VI","Vicenza"],["VT","Viterbo"],
];

export function pickBundle(b) {
  const n = parseInt(b, 10);
  return BUNDLES[n] ? BUNDLES[n] : BUNDLES[3]; // standaard: de bestseller
}

export function pickShipping(code) {
  return SHIPPING[code] ? SHIPPING[code] : SHIPPING.insured;
}

export function totals(bundle, shipping) {
  const subtotal = bundle.price;
  const ship = shipping.price;
  return { subtotal, shipping: ship, total: subtotal + ship };
}

export const fmtEur = (cents) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

// Tracking-parameters die van de salespagina meekomen (jjb-track.js) → Stripe-metadata
export const TRACK_KEYS = ["ad_id", "adset_id", "campaign_id", "fbclid", "fbc", "fbp", "vid", "utm_source", "utm_campaign", "utm_content", "first_touch", "host", "path", "pgs"];
