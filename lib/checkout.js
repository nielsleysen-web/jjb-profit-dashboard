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

// Verzendopties zoals in de Shopify-checkout
export const SHIPPING = {
  // title = zoals op de checkout; komt ook als verzendregel op de Shopify-order en op de bedankpagina
  insured: { code: "insured", title: "Express (3-5 giorni lavorativi)", sub: "Tracciamento del pacco incluso", price: 395 },
  free: { code: "free", title: "Standard (5-8 giorni lavorativi)", sub: "Spedizione gratuita", price: 0 },
};

// Membership: 7 dagen proef, daarna €49 elke 28 dagen (Stripe-prijs via env STRIPE_PRICE_MEMBERSHIP)
export const MEMBERSHIP = { trialDays: 7, price: 4900, intervalDays: 28, name: "Just Jenny Health For Life Membership" };

export const CURRENCY = "eur";

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
