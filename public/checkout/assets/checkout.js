/* Just Jenny checkout (checkout.getjustjenny.com) — gebaseerd op de subscription-checkout-kit.
   Stripe (losse kaartvelden + Express Checkout: Apple Pay / Google Pay / PayPal / Link).
   Model: de bundel wordt NU betaald (+ verzending), daarna start de Just Jenny Health For Life Membership:
   7 dagen gratis proef, dan €49 elke 28 dagen. Alleen de eerste order gaat naar Shopify.
   Sleutels (publishable key, pixel-ID) komen uit Vercel via /api/checkout-config —
   er staan dus geen sleutels in dit (publieke) bestand. */

/* ================================== CONFIG ================================== */
const CONFIG = {
  BRAND_NAME: 'Just Jenny',
  PRODUCT_NAME: 'Neurotone Drops',
  SUCCESS_PATH: '/checkout/offerta', // post-purchase upsell (1+1 gratis); daarna /checkout/grazie
  TRIAL_DAYS: 7,             // moet gelijk zijn aan MEMBERSHIP.trialDays in lib/checkout.js
  CYCLE_DAYS: 28,            // idem intervalDays
  MEMBERSHIP_CENTS: 4900,    // idem price — enkel voor de tekst, Stripe rekent met STRIPE_PRICE_MEMBERSHIP
  FUNNEL: 'main',
  PAYPAL_CLIENT_ID: '',      // wordt ingevuld door /api/checkout-config (PayPal rechtstreeks, buiten Stripe)
  PAYPAL_PLANS: { 1: '', 2: '', 3: '', 5: '' },
  META_CONTENT_IDS: ['10561889403146'],
  // Wordt ingevuld door /api/checkout-config
  STRIPE_PK: '',
  STRIPE_PAYPAL: false,
  META_PIXEL_ID: '',
};
/* ============================================================================ */

/* ---- Product: NeuroTone (standaard) of LubriSense ----------------------------
   checkout.getjustjenny.com/lubrisense  (of /checkout?p=lubrisense) → LubriSense met een eigen membership.
   Bedragen moeten gelijk zijn aan PRODUCTS in lib/checkout.js. */
const _pq = (new URLSearchParams(location.search).get('p') || '').toLowerCase();
const PRODUCT_KEY = (/sageleaf/i.test(location.pathname) || _pq === 'sageleaf') ? 'sageleaf' // Sage Leaf Extract (Engels, USD, refill elke 28 dagen)
  : (/pumpkinoil/i.test(location.pathname) || _pq === 'pumpkinoil' || /(^|\/)en(\/|\.html|$)/i.test(location.pathname)) ? 'pumpkinoil' // /en/… = Engelse USD-checkout
  : (/lubrisense/i.test(location.pathname) || _pq === 'lubrisense') ? 'lubrisense'
  : (/magnesium/i.test(location.pathname) || _pq === 'magnesium') ? 'magnesium'
  : (/emorroidi/i.test(location.pathname) || _pq === 'emorroidi') ? 'emorroidi'
  : (/urinapatches/i.test(location.pathname) || _pq === 'urinapatches') ? 'urinapatches'
  : (/pumpkinseed/i.test(location.pathname) || _pq === 'pumpkinseed') ? 'pumpkinseed'
  : (/ceylon/i.test(location.pathname) || _pq === 'ceylon') ? 'ceylon' : 'neurotone';
/* A/B-test 3D Secure: de aparte links checkout.getjustjenny.com/3ds, /lubrisense/3ds, /magnesium/3ds en /emorroidi/3ds
   (of ?ab=3ds) → debit- en prepaidkaarten krijgen bij de eerste betaling een verplichte 3DS-bevestiging.
   De gewone links werken exact zoals voorheen. */
const TDS_VARIANT = /\/3ds\/?$/i.test(location.pathname) || new URLSearchParams(location.search).get('ab') === '3ds';
// Markt: 'nl' (NL/BE: /nl/<product> of nl.html — iDEAL + Bancontact + kaart via het Payment Element, SEPA-rebills) of 'it'
// 'us': Engelstalige USD-checkout (en.html, checkout.getjustjenny.com/en/pumpkinoil) — US/CA/UK/AU/NZ (Shopify-markt "Big 5")
const MARKET = (PRODUCT_KEY === 'pumpkinoil' || PRODUCT_KEY === 'sageleaf' || /(^|\/)en(\/|\.html|$)/i.test(location.pathname)) ? 'us'
  : (/(^|\/)nl(\/|\.html|$)/i.test(location.pathname) || new URLSearchParams(location.search).get('m') === 'nl') ? 'nl' : 'it';
const IS_NL = MARKET === 'nl';
const IS_US = MARKET === 'us';
const CUR = IS_US ? 'usd' : 'eur';
const L = (it, en) => (IS_US ? en : it); // Italiaanse tekst, of Engels op de USD-checkout
// Teksten die checkout.js zelf schrijft (de vaste teksten staan in index.html / nl.html / en.html)
const T = IS_US ? {
  shipFree: 'Standard (5-8 business days)', shipInsured: 'Express (3-5 business days)', free: 'FREE', enterAddress: 'Enter shipping address',
  save: 'You save', items1: '1 item', items2: '2 items', discount: 'Discount', apply: 'Apply',
  discountOk: 'Discount applied.', discountBad: 'Enter a valid discount code.', discountErr: 'Could not check the code, please try again.',
  generic: 'Something went wrong, please try again.', billing: 'Please complete your billing address.', payIncomplete: 'Please complete your card details.',
  payUnavailable: 'Payment will be available shortly.', payLoadFail: 'Payment could not be loaded. Reload the page or try another browser.',
  zip: 'ZIP code', dateLocale: 'en-US', moneyLocale: 'en-US',
} : IS_NL ? {
  shipFree: 'Standaard (3-5 werkdagen)', shipInsured: 'Express (1-2 werkdagen)', free: 'GRATIS', enterAddress: 'Vul je adres in',
  save: 'Je bespaart', items1: '1 artikel', items2: '2 artikelen', discount: 'Korting', apply: 'Toepassen',
  discountOk: 'Korting toegepast.', discountBad: 'Vul een geldige kortingscode in.', discountErr: 'Code kon niet gecontroleerd worden, probeer opnieuw.',
  generic: 'Er ging iets mis, probeer het opnieuw.', billing: 'Vul je factuuradres volledig in.', payIncomplete: 'Vul je betaalgegevens in.',
  payUnavailable: 'Betalen is zo beschikbaar.', payLoadFail: 'Betaling kon niet geladen worden. Herlaad de pagina of probeer een andere browser.',
  zip: 'Postcode', dateLocale: 'nl-NL', moneyLocale: 'nl-NL',
} : {
  shipFree: 'Standard (5-8 giorni lavorativi)', shipInsured: 'Express (3-5 giorni lavorativi)', free: 'GRATIS', enterAddress: 'Inserisci l’indirizzo',
  save: 'Risparmi', items1: '1 articolo', items2: '2 articoli', discount: 'Sconto', apply: 'Applica',
  discountOk: 'Sconto applicato.', discountBad: 'Inserisci un codice sconto valido.', discountErr: 'Impossibile verificare il codice, riprova.',
  generic: 'Qualcosa è andato storto, riprova.', billing: 'Completa l’indirizzo di fatturazione.', payIncomplete: 'Completa i dati della carta.',
  payUnavailable: 'Il pagamento sarà disponibile a breve.', payLoadFail: 'Impossibile caricare il pagamento. Ricarica la pagina o prova con un altro browser.',
  zip: 'CAP', dateLocale: 'it-IT', moneyLocale: 'it-IT',
};
/* A/B-test checkout (NeuroTone): middleware.js verdeelt checkout.getjustjenny.com/ over variant A (index.html) en
   B (b.html, <body data-ab="b">) en zet cookie jj_ab. De variant gaat mee naar Stripe/PayPal → Shopify-tag
   checkout-ab-a / checkout-ab-b; paginaweergaven via /api/checkout/ab-view. Leeg = niet in de test. */
const AB_VARIANT = (() => {
  if (document.body && (document.body.dataset.ab === 'b' || document.body.dataset.ab === 'c')) return document.body.dataset.ab; // c = checkout A + 3 offers (c.html)
  if (PRODUCT_KEY !== 'neurotone' || TDS_VARIANT) return '';
  const m = document.cookie.match(/(?:^|;\s*)jj_ab=(a|b)(?:;|$)/);
  return m ? m[1] : '';
})();
const PRODUCT_CONFIG = {
  // Magnesium Freeze: voorlopig met de NeuroTone-membership (Health For Life); geen upsellpagina.
  // NO_MEMBERSHIP: true → eenmalige aankoop (dan ook geen PayPal rechtstreeks).
  magnesium: {
    PRODUCT_NAME: 'Magnesium Freeze',
    SUCCESS_PATH: '/checkout/grazie',
    META_CONTENT_IDS: ['10589604675850'],
  },
  lubrisense: {
    PRODUCT_NAME: 'LubriSense',
    SUCCESS_PATH: '/checkout/offerta', // post-purchase upsell 1+1 (€34,95); daarna /checkout/grazie
    MEMBERSHIP_NAME: 'Just Jenny Intimate Care Membership',
    META_CONTENT_IDS: ['10597036163338'],
  },
  // Emorroidi Cerotti: eigen membership (zelfde voorwaarden als NeuroTone), testfase zonder upsellpagina
  emorroidi: {
    PRODUCT_NAME: 'Emorroidi Cerotti',
    SUCCESS_PATH: '/checkout/grazie',
    MEMBERSHIP_NAME: 'Just Jenny Comfort Care Membership',
    META_CONTENT_IDS: ['10602127065354'],
  },
  // UrinaPatches: eigen membership (zelfde voorwaarden) + upsellpagina 1+1 gratis (€29,95)
  urinapatches: {
    PRODUCT_NAME: 'UrinaPatches',
    SUCCESS_PATH: '/checkout/offerta', // post-purchase upsell 1+1 (€29,95); daarna /checkout/grazie
    MEMBERSHIP_NAME: 'Just Jenny Daily Comfort Membership',
    META_CONTENT_IDS: ['10685715448074'],
    PAY_LABEL: 'Completa l’ordine', // eigen knoptekst + donkerdere groene knop (body.pay-dark, checkout.css)
  },
  // Pumpkin Seed Drops: eigen membership (zelfde voorwaarden), zonder upsellpagina; knop zoals UrinaPatches
  pumpkinseed: {
    PRODUCT_NAME: 'Pumpkin Seed Drops',
    SUCCESS_PATH: '/checkout/grazie',
    MEMBERSHIP_NAME: 'Just Jenny Daily Wellness Membership',
    META_CONTENT_IDS: ['10689121911050'],
    PAY_LABEL: 'Completa l’ordine',
  },
  // Pumpkin Seed Oil Softgels (Engels, USD): 14 dagen proef, daarna $49.95 / 28 dagen; geen upsellpagina
  pumpkinoil: {
    PRODUCT_NAME: 'Pumpkin Seed Oil Softgels',
    SUCCESS_PATH: '/checkout/thanks',
    MEMBERSHIP_NAME: 'Just Jenny Daily Vitality Membership',
    META_CONTENT_IDS: ['10704578609418'],
    TRIAL_DAYS: 14, CYCLE_DAYS: 28, MEMBERSHIP_CENTS: 4995,
    PAY_LABEL: 'Complete order',
  },
  // Sage Leaf Extract (Engels, USD): REFILL — de gekozen bundel wordt elke 28 dagen opnieuw aangerekend en verzonden
  sageleaf: {
    PRODUCT_NAME: 'Sage Leaf Extract',
    SUCCESS_PATH: '/checkout/thanks',
    MEMBERSHIP_NAME: 'Just Jenny Sage Leaf Refill Plan',
    META_CONTENT_IDS: ['10710604906762'],
    TRIAL_DAYS: 28, CYCLE_DAYS: 28, MEMBERSHIP_CENTS: 5995, REFILL: true, INS_CENTS: 295,
    PAY_LABEL: 'Pay Now',
  },
  // Cannella di Ceylon: eigen membership (zelfde voorwaarden), zonder upsellpagina; knop zoals UrinaPatches
  ceylon: {
    PRODUCT_NAME: 'Cannella di Ceylon',
    SUCCESS_PATH: '/checkout/grazie',
    MEMBERSHIP_NAME: 'Just Jenny Metabolic Balance Membership',
    META_CONTENT_IDS: ['10700016156938'],
    PAY_LABEL: 'Completa l’ordine',
  },
};
CONFIG.MEMBERSHIP_NAME = 'Just Jenny Health For Life Membership';
Object.assign(CONFIG, PRODUCT_CONFIG[PRODUCT_KEY] || {});
if (IS_NL) {
  CONFIG.SUCCESS_PATH = '/checkout/grazie'; CONFIG.STRIPE_PAYPAL = false; // PayPal wél, maar rechtstreeks (gele knop), niet via Stripe
  if (CONFIG.PAY_LABEL) CONFIG.PAY_LABEL = 'Bestelling afronden'; // NL-versie van "Completa l’ordine"
  // Kaartmarkup verbergen: het Payment Element (iDEAL + kaart) neemt het over; de PayPal-rij blijft eronder staan
  const cc = document.getElementById('pm-cc'); if (cc) cc.hidden = true;
}
// Eigen knoptekst per product (vóór PAY_LABEL hieronder uit de DOM wordt gelezen): knop + voorwaardentekst
if (CONFIG.PAY_LABEL) {
  const bt = document.getElementById('pay-btn-text');
  if (bt && bt.textContent.trim() !== CONFIG.PAY_LABEL) {
    document.querySelectorAll('.sub-terms').forEach(el => { el.innerHTML = el.innerHTML.split('«' + bt.textContent.trim() + '»').join('«' + CONFIG.PAY_LABEL + '»'); });
    bt.textContent = CONFIG.PAY_LABEL;
  }
  document.body.classList.add('pay-dark');
}
const PQ = PRODUCT_KEY === 'neurotone' ? '' : '&p=' + PRODUCT_KEY; // gaat mee naar de bedankpagina

/* ---- Client error logging ---------------------------------------------------
   Ships uncaught errors + payment failures to /api/clientlog so a break that
   stops checkout shows up in your server logs instead of being invisible. ---- */
function logClient(kind, msg, src) {
  try {
    fetch('/api/clientlog', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, msg: String(msg || '').slice(0, 500), src: src || '', href: location.href }),
    });
  } catch (e) {}
}
window.addEventListener('error', function (e) {
  logClient('jserror', (e && e.message) || 'script error', (e && e.filename) ? (e.filename + ':' + e.lineno) : '');
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e && e.reason;
  logClient('promise', (r && (r.message || r)) || 'unhandledrejection', '');
});

const PAYPAL_CLIENT_ID = CONFIG.PAYPAL_CLIENT_ID;

/* Bundels (centen). `amount` moet gelijk zijn aan BUNDLES in lib/checkout.js — dat is wat
   Stripe rekent; `compare` / `save` / `savePct` zijn enkel voor de weergave. */
const IMG = 'https://cdn.shopify.com/s/files/1/0901/0606/9258/files/';
const PACKS_NEUROTONE = {
  1: { label: '1x NeuroTone™', amount: 2995, compare: 6000,  save: 3005,  savePct: 50, img: IMG + 'Artboard3_aa37d423-8b7a-450f-8ea6-83c2aff726c2.png?v=1783404886&width=240' },
  2: { label: '2x NeuroTone™', amount: 3995, compare: 12000, save: 8005,  savePct: 67, img: IMG + 'Artboard3_1.png?v=1783404885&width=240' },
  3: { label: '3x NeuroTone™', amount: 4995, compare: 18000, save: 13005, savePct: 72, img: IMG + 'Artboard3_2.png?v=1783404886&width=240' },
  5: { label: '5x NeuroTone™', amount: 5995, compare: 30000, save: 24005, savePct: 80, img: IMG + 'Artboard3copy_1c26406e-68ad-44c1-a428-5d99f4ff1fa7.png?v=1783404886&width=240' },
};
// LubriSense: prijzen zoals in Shopify, geen doorstreepprijs (compare 0 → niet getoond)
const PACKS_LUBRISENSE = {
  1: { label: '1x LubriSense™', amount: 3495, compare: 0, save: 0, savePct: 0, img: IMG + '3_5305b5fc-f123-40dc-a487-545a8bd63b05.png?v=1787285389&width=240' },
  2: { label: '2x LubriSense™', amount: 4495, compare: 0, save: 0, savePct: 0, img: IMG + '4_681fd7dd-be4d-4f81-ad4b-c1295e55e3f6.png?v=1787285390&width=240' },
  3: { label: '3x LubriSense™', amount: 5495, compare: 0, save: 0, savePct: 0, img: IMG + '5.png?v=1787285390&width=240' },
  5: { label: '5x LubriSense™', amount: 6495, compare: 0, save: 0, savePct: 0, img: IMG + '6.png?v=1787285390&width=240', gift: true },
};
// Magnesium Freeze: prijzen zoals in Shopify (product 10589604675850), geen doorstreepprijs
const MF = 'Comeotorinolaringoiatra_raccomandoNeuroTonedadiversianni.Il93_notagiaunmiglioramentodelproprioacufeneentroiprimi3giorni_senzausarel_apparecchioacustico._';
const PACKS_MAGNESIUM = {
  1: { label: '1x Magnesium Freeze™', amount: 3495, compare: 0, save: 0, savePct: 0, img: IMG + MF + '4.png?v=1786453406&width=240' },
  2: { label: '2x Magnesium Freeze™', amount: 4495, compare: 0, save: 0, savePct: 0, img: IMG + MF + '7.png?v=1786453405&width=240' },
  3: { label: '3x Magnesium Freeze™', amount: 5495, compare: 0, save: 0, savePct: 0, img: IMG + MF + '6.png?v=1786453406&width=240' },
  5: { label: '5x Magnesium Freeze™', amount: 6495, compare: 0, save: 0, savePct: 0, img: IMG + MF + '5.png?v=1786453406&width=240', gift: true },
};
// Emorroidi Cerotti (Shopify-product 10602127065354, zelfde bestandsprefix als Magnesium): prijzen/doorstreepprijzen als NeuroTone
const PACKS_EMORROIDI = {
  1: { label: '1x Emorroidi Cerotti™', amount: 2995, compare: 6000, save: 3005, savePct: 50, img: IMG + MF + '1_faf2ffad-e1e4-41ac-9f1b-5a0f7e859dc5.png?v=1787828803&width=240' },
  2: { label: '2x Emorroidi Cerotti™', amount: 3995, compare: 12000, save: 8005, savePct: 67, img: IMG + MF + '2_7d9c8636-c5be-4c96-8530-106a94542664.png?v=1787828803&width=240' },
  3: { label: '3x Emorroidi Cerotti™', amount: 4995, compare: 18000, save: 13005, savePct: 72, img: IMG + MF + '3_53ea0f9e-d272-4b65-b25d-4679da9f597c.png?v=1787828802&width=240' },
  5: { label: '5x Emorroidi Cerotti™', amount: 5995, compare: 30000, save: 24005, savePct: 80, img: IMG + MF + '4_27df4bba-5842-4628-abc1-01dd1c406bd4.png?v=1787828802&width=240', gift: true },
};
// UrinaPatches (Shopify-product 10685715448074): alleen 1/3/5; doorstreepprijs 60 € per stuk, zoals NeuroTone
const PACKS_URINAPATCHES = {
  1: { label: '1x UrinaPatches™', amount: 2995, compare: 6000, save: 3005, savePct: 50, img: IMG + '11.webp?v=1793144295&width=240' },
  3: { label: '3x UrinaPatches™', amount: 3995, compare: 18000, save: 14005, savePct: 78, img: IMG + '12.webp?v=1793144295&width=240' },
  5: { label: '5x UrinaPatches™', amount: 4495, compare: 30000, save: 25505, savePct: 85, img: IMG + '13.webp?v=1793144295&width=240' },
};
// Pumpkin Seed Drops (Shopify-product 10689121911050): 1/3/5, doorstreepprijs 60 € per stuk
const PACKS_PUMPKINSEED = {
  1: { label: '1x Pumpkin Seed Drops™', amount: 2995, compare: 6000, save: 3005, savePct: 50, img: IMG + '1793282375-12.webp?v=1793283030&width=240' },
  3: { label: '3x Pumpkin Seed Drops™', amount: 3995, compare: 18000, save: 14005, savePct: 78, img: IMG + '1793282377-13.webp?v=1793283030&width=240' },
  5: { label: '5x Pumpkin Seed Drops™', amount: 4495, compare: 30000, save: 25505, savePct: 85, img: IMG + '1793282378-14.webp?v=1793283030&width=240' },
};
// Cannella di Ceylon (Shopify-product 10700016156938): 1/3/5, prijzen en doorstreepprijzen van de landingspagina
const PACKS_CEYLON = {
  1: { label: '1x Cannella di Ceylon', amount: 2999, compare: 5999, save: 3000, savePct: 50, img: 'https://cdn.shopify.com/s/files/1/0901/0606/9258/files/pouch-1_1e421163-a187-40e5-85f0-5a3c9a9e2428.jpg?v=1793742250&width=240', gift: true },
  3: { label: '3x Cannella di Ceylon', amount: 5495, compare: 17997, save: 12502, savePct: 69, img: 'https://cdn.shopify.com/s/files/1/0901/0606/9258/files/pouch-3_c3c92249-ad57-4050-b0cd-6ec494b68fdc.jpg?v=1793742250&width=240', gift: true },
  5: { label: '5x Cannella di Ceylon', amount: 7995, compare: 29995, save: 22000, savePct: 73, img: 'https://cdn.shopify.com/s/files/1/0901/0606/9258/files/pouch-5_6c56d46e-234c-4c2a-9791-87fc558fb4d8.jpg?v=1793742250&width=240', gift: true },
};
// Pumpkin Seed Oil Softgels (Shopify-product 10704578609418, USD): 1/3/5, prijzen = salespagina
const PSO = 'https://cannella.getjustjenny.com/';
const PACKS_PUMPKINOIL = {
  1: { label: '1x Pumpkin Seed Oil Softgels', amount: 2995, compare: 5995, save: 3000, savePct: 50, img: PSO + 'assets/offer/zakje-1x.webp?v=o1' },
  3: { label: '3x Pumpkin Seed Oil Softgels', amount: 5995, compare: 11995, save: 6000, savePct: 50, img: PSO + 'assets/offer/zakjes-3x.webp?v=o1' },
  5: { label: '5x Pumpkin Seed Oil Softgels', amount: 8995, compare: 17995, save: 9000, savePct: 50, img: PSO + 'assets/offer/zakjes-5x.webp?v=o1' },
};
// Sage Leaf Extract (Shopify-product 10710604906762, USD): 1/3/5, prijzen = salespagina /sage
const SGL = 'https://cannella.getjustjenny.com/sage/assets/uploads/';
const PACKS_SAGELEAF = {
  1: { label: '1x Sage Leaf Extract', amount: 2995, compare: 5995, save: 3000, savePct: 50, img: SGL + 'ed-pic-8.webp?v=c1' },
  3: { label: '3x Sage Leaf Extract', amount: 5995, compare: 17997, save: 12002, savePct: 67, img: SGL + 'ed-pic-9.webp?v=c1' },
  5: { label: '5x Sage Leaf Extract', amount: 8995, compare: 29995, save: 21000, savePct: 70, img: SGL + 'ed-pic-10.webp?v=c1' },
};
const PACKS = PRODUCT_KEY === 'sageleaf' ? PACKS_SAGELEAF : PRODUCT_KEY === 'pumpkinoil' ? PACKS_PUMPKINOIL : PRODUCT_KEY === 'ceylon' ? PACKS_CEYLON : PRODUCT_KEY === 'lubrisense' ? PACKS_LUBRISENSE : PRODUCT_KEY === 'magnesium' ? PACKS_MAGNESIUM : PRODUCT_KEY === 'emorroidi' ? PACKS_EMORROIDI : PRODUCT_KEY === 'urinapatches' ? PACKS_URINAPATCHES : PRODUCT_KEY === 'pumpkinseed' ? PACKS_PUMPKINSEED : PACKS_NEUROTONE;
// Verzendopties — moeten gelijk zijn aan SHIPPING in lib/checkout.js
const SHIP = {
  free:    { cents: 0,   title: T.shipFree },
  insured: { cents: 395, title: T.shipInsured },
};
const PROVINCES = { AG:'Agrigento',AL:'Alessandria',AN:'Ancona',AO:'Aosta',AR:'Arezzo',AP:'Ascoli Piceno',AT:'Asti',AV:'Avellino',BA:'Bari',BT:'Barletta-Andria-Trani',BL:'Belluno',BN:'Benevento',BG:'Bergamo',BI:'Biella',BO:'Bologna',BZ:'Bolzano',BS:'Brescia',BR:'Brindisi',CA:'Cagliari',CL:'Caltanissetta',CB:'Campobasso',CE:'Caserta',CT:'Catania',CZ:'Catanzaro',CH:'Chieti',CO:'Como',CS:'Cosenza',CR:'Cremona',KR:'Crotone',CN:'Cuneo',EN:'Enna',FM:'Fermo',FE:'Ferrara',FI:'Firenze',FG:'Foggia',FC:'Forlì-Cesena',FR:'Frosinone',GE:'Genova',GO:'Gorizia',GR:'Grosseto',IM:'Imperia',IS:'Isernia',SP:'La Spezia',AQ:"L'Aquila",LT:'Latina',LE:'Lecce',LC:'Lecco',LI:'Livorno',LO:'Lodi',LU:'Lucca',MC:'Macerata',MN:'Mantova',MS:'Massa-Carrara',MT:'Matera',ME:'Messina',MI:'Milano',MO:'Modena',MB:'Monza e Brianza',NA:'Napoli',NO:'Novara',NU:'Nuoro',OR:'Oristano',PD:'Padova',PA:'Palermo',PR:'Parma',PV:'Pavia',PG:'Perugia',PU:'Pesaro e Urbino',PE:'Pescara',PC:'Piacenza',PI:'Pisa',PT:'Pistoia',PN:'Pordenone',PZ:'Potenza',PO:'Prato',RG:'Ragusa',RA:'Ravenna',RC:'Reggio Calabria',RE:'Reggio Emilia',RI:'Rieti',RN:'Rimini',RM:'Roma',RO:'Rovigo',SA:'Salerno',SS:'Sassari',SV:'Savona',SI:'Siena',SR:'Siracusa',SO:'Sondrio',SU:'Sud Sardegna',TA:'Taranto',TE:'Teramo',TR:'Terni',TO:'Torino',TP:'Trapani',TN:'Trento',TV:'Treviso',TS:'Trieste',UD:'Udine',VA:'Varese',VE:'Venezia',VB:'Verbano-Cusio-Ossola',VC:'Vercelli',VR:'Verona',VV:'Vibo Valentia',VI:'Vicenza',VT:'Viterbo' };
const COUNTRIES = IS_US ? { US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia', NZ: 'New Zealand' }
  : IS_NL ? { NL: 'Nederland', BE: 'België' } : { IT: 'Italia' };
const US_STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',PR:'Puerto Rico',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
const CA_PROVINCES = { AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland and Labrador',NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon' };
const AU_STATES = { ACT:'Australian Capital Territory',NSW:'New South Wales',NT:'Northern Territory',QLD:'Queensland',SA:'South Australia',TAS:'Tasmania',VIC:'Victoria',WA:'Western Australia' };
const REGION_LISTS = { IT: PROVINCES, US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES };
const ALLOWED_COUNTRIES = Object.keys(COUNTRIES);
// Tracking-parameters van jjb-track.js (salespagina → checkout-link) → Stripe-metadata → Shopify-order
const TRACK_KEYS = ['ad_id','adset_id','campaign_id','fbclid','fbc','fbp','vid','utm_source','utm_campaign','utm_content','first_touch','host','path','pgs'];

/* Bundel uit de URL: /checkout?b=3 (of ?pack=3), standaard 3. */
const PLANS = CONFIG.PAYPAL_PLANS;
const params = new URLSearchParams(location.search);
const _pk = params.get('b') || params.get('pack') || params.get('bundle');
let pack = PACKS[_pk] ? _pk : '3'; // variant C (c.html) wisselt de bundel op de pagina, zie setPack()
let P = PACKS[pack];

// InitiateCheckout fires ONCE, from the DOMContentLoaded handler below, with a
// dedup eventID + matching server CAPI event. (A second, un-deduped IC used to
// fire here on page parse — removed: it double-counted IC and muddied the signal
// sent to Meta's optimizer.)

let shipMethod = 'insured'; // standaard: Express 3,95 €
let promo = null; // { code, percent_off, amount_off, duration }

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const money = (c) => IS_US ? (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : IS_NL ? '€ ' + (c / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : (c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function shipCents() { return (SHIP[shipMethod] || SHIP.free).cents; }
// Stripe applies subscription-level discounts to the WHOLE first invoice,
// including the one-time express-shipping item — mirror that here.
function discountCents() {
  if (!promo) return 0;
  const base = P.amount + shipCents() + insCents() + bumpCents(); // Stripe past de code toe op de hele eerste factuur, ook op de verzekering/bump
  if (promo.amount_off) return Math.min(promo.amount_off, base);
  if (promo.percent_off) return Math.round(base * promo.percent_off / 100);
  return 0;
}
const INS_PRICE = CONFIG.INS_CENTS || 495; // verzendverzekering (4,95 €; Sage Leaf $2.95), standaard aangevinkt
function insCents() { const c = document.getElementById('ins-check'); return c && c.checked ? INS_PRICE : 0; }
/* Order bump (UrinaPatches, A/B-test): "Spray Neutralizzante" 9,95 € met een Aggiungi-knop boven het totaal
   (index.html #bump-template). Variant per bezoeker (cookie jj_bump: a = zonder, b = met), verdeling CONFIG.BUMP_SPLIT
   (Vercel-env JJ_BUMP_AB). Gaat als bump + bump_ab mee naar Stripe/PayPal → eigen orderregel + tags bump-spray / bump-ab-*. */
const BUMP = PRODUCT_KEY === 'urinapatches' ? { key: 'spray', title: 'Spray Neutralizzante', price: 995, img: '/checkout/assets/spray-neutralizzante.webp' } : null;
let bumpVariant = ''; // 'a' | 'b' zodra de test loopt (initBump)
let bumpOn = false;   // klant heeft op Aggiungi geklikt
function bumpCents() { return BUMP && bumpOn ? BUMP.price : 0; }
function totalCents() { return P.amount + shipCents() + insCents() + bumpCents() - discountCents(); }
// Wat de membership daarna kost: vol bedrag, tenzij de kortingscode "forever" geldt
function renewalCents() {
  const M = CONFIG.REFILL ? P.amount : CONFIG.MEMBERSHIP_CENTS; // refill: de bundel zelf, elke 28 dagen
  if (!promo || promo.duration !== 'forever') return M;
  if (promo.amount_off) return Math.max(0, M - promo.amount_off);
  if (promo.percent_off) return Math.round(M * (100 - promo.percent_off) / 100);
  return M;
}
function successUrl(subId) {
  // Mail 2 (?bonus=1): geen upsellpagina, meteen door naar de bedankpagina (skip=1)
  return new URL(CONFIG.SUCCESS_PATH + '?sub=' + encodeURIComponent(subId || '') + '&b=' + pack + PQ + (BONUS ? '&skip=1' : ''), location.origin).href;
}

/* ---------- Gratis cadeau bij de bundel (LubriSense 5x): een e-book op het platform (niet vermeld), €0 ----------
   Zelfde als de oude Shopify-cartlink (product "Regalo gratuito"); de €0-regel komt mee op de Shopify-order. */
const BUNDLE_GIFT_COPY = { name: 'Regalo a sorpresa', sub: 'Incluso nel tuo ordine', free: 'GRATIS' };
// Cannella di Ceylon: het gratis e-book (landingspagina: "E-book esclusivo gratuito con ogni ordine"), verstuurd per e-mail
if (PRODUCT_KEY === 'ceylon') Object.assign(BUNDLE_GIFT_COPY, { name: 'E-book: Cannella di Ceylon – Una guida pratica', sub: 'Incluso nel tuo ordine · inviato via e-mail', free: 'GRATIS' });
const GIFT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 7.5h18V11H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 7.5V21" stroke="currentColor" stroke-width="1.5"/><path d="M12 7.5C10.8 4.6 7.2 4 7.2 6.1c0 1.2 1.6 1.4 4.8 1.4zM12 7.5c1.2-2.9 4.8-3.5 4.8-1.4 0 1.2-1.6 1.4-4.8 1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
function addBundleGift(slot) {
  if (!document.getElementById('jj-bgift-style')) {
    const st = document.createElement('style');
    st.id = 'jj-bgift-style';
    st.textContent = '.jj-bgift{display:flex;align-items:center;gap:12px;margin-top:14px;padding:10px 12px;border:1px solid #efe4d8;border-radius:12px;background:linear-gradient(180deg,#fffaf5,#fdf5ee)}'
      + '.jj-bgift-ic{width:38px;height:38px;flex:none;border-radius:50%;background:#fbeadd;color:#b8693c;display:flex;align-items:center;justify-content:center}'
      + '.jj-bgift-tx{flex:1;min-width:0}.jj-bgift-n{font-size:14px;font-weight:600;color:#2b2420}.jj-bgift-s{font-size:12px;color:#8c7f74;margin-top:1px}'
      + '.jj-bgift-p{font-size:11px;font-weight:700;letter-spacing:.5px;color:#2d6b45;background:#e8f3ec;border-radius:999px;padding:4px 10px}';
    document.head.appendChild(st);
  }
  const prod = slot.querySelector('.prod-row');
  if (!prod || slot.querySelector('.jj-bgift')) return;
  if (PRODUCT_KEY === 'ceylon') {
    // Cannella di Ceylon: e-book als gewone productregel (cover, doorstreepte waarde, GRATIS)
    const r = document.createElement('div'); r.className = 'prod-row jj-bgift jj-bgift-row';
    r.innerHTML = '<div class="prod-thumb"><img src="/checkout/assets/ebook-ceylon.png?v=1" alt="E-book" style="object-fit:contain;background:#fff"><span class="qty-badge">1</span></div>'
      + '<div class="prod-info"><div class="prod-name">E-book: Cannella di Ceylon</div><div class="prod-variant">Ottieni i migliori risultati con l’e-book</div><div class="prod-save">Gratis con il tuo acquisto</div></div>'
      + '<div class="prod-price"><span class="compare">19,90 €</span><span class="actual"><span style="color:#2d6b45;font-weight:700">GRATIS</span></span></div>';
    prod.parentNode.insertBefore(r, prod.nextSibling); return;
  }
  const row = document.createElement('div');
  row.className = 'jj-bgift';
  row.innerHTML = '<span class="jj-bgift-ic">' + GIFT_ICON + '</span>'
    + '<span class="jj-bgift-tx"><span class="jj-bgift-n">' + BUNDLE_GIFT_COPY.name + '</span><br><span class="jj-bgift-s">' + BUNDLE_GIFT_COPY.sub + '</span></span>'
    + '<span class="jj-bgift-p">' + BUNDLE_GIFT_COPY.free + '</span>';
  prod.parentNode.insertBefore(row, prod.nextSibling);
}

/* Vertrouwensblok per product uit <template id="trust-<product>"> (index.html: urinapatches, pumpkinseed) — rechterkolom
   i.p.v. .sum-trust, op mobiel onder de bestelknop i.p.v. .trust-row. Producten zonder template: null (niets verandert). */
function trustBlock(mobile) {
  const t = document.getElementById('trust-' + PRODUCT_KEY);
  if (!t) return null;
  const el = t.content.firstElementChild.cloneNode(true);
  if (mobile) el.classList.add('mob');
  return el;
}

/* ---------- Render order summary into both slots ---------- */
function renderSummaries() {
  const tpl = $('#summary-template');
  $$('.js-summary-slot').forEach(slot => {
    slot.innerHTML = '';
    slot.appendChild(tpl.content.cloneNode(true));
    slot.querySelectorAll('.prod-name').forEach(el => { el.textContent = CONFIG.PRODUCT_NAME; });
    if (P.gift) addBundleGift(slot);
    // UrinaPatches: vertrouwensblok (garanties + Trustpilot-reviews) i.p.v. de vinkjes
    const tb = trustBlock(); const st = slot.querySelector('.sum-trust');
    if (tb && st) st.replaceWith(tb);
    // Cannella di Ceylon: nog geen Trustpilot-reviews → die regel weglaten (garantie + verzending blijven)
    if (PRODUCT_KEY === 'ceylon' && st) st.querySelectorAll('li').forEach(li => { if (/Trustpilot/i.test(li.textContent)) li.remove(); });
    // Order bump (variant B): in het overzicht boven Subtotale/Totale (desktop; in de mobiele uitklap verborgen via CSS)
    const tot = slot.querySelector('.totals'); const bp = renderBump();
    if (bp && tot) tot.insertAdjacentElement('beforebegin', bp);
  });
  wireDiscountInputs();
  updateAmounts();
}

/* ---------- Order bump (UrinaPatches, A/B-test) ---------- */
function initBump() {
  if (!BUMP) return;
  const split = Number(CONFIG.BUMP_SPLIT) || 0;
  if (split <= 0) return; // test uit (JJ_BUMP_AB=off/0): geen bump, geen tag
  let v = (document.cookie.match(/(?:^|;\s*)jj_bump=(a|b)(?:;|$)/) || [])[1] || '';
  if (split >= 100) v = 'b';
  if (!v) v = Math.random() * 100 < split ? 'b' : 'a';
  try { document.cookie = 'jj_bump=' + v + '; Max-Age=' + 30 * 86400 + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
  bumpVariant = v;
  // 1 weergave per variant per sessie (noemer voor /api/ab-bump)
  try {
    const k = 'jj_bump_view_' + v;
    if (!sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, '1');
      fetch('/api/checkout/ab-view', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bump: v }) }).catch(() => {});
    }
  } catch (e) {}
  if (v !== 'b') return;
  // Mobiel: boven het totaal (in de mobiele footer, verborgen op desktop via CSS)
  const mt = $('#mobile-total'); const bp = renderBump();
  if (mt && bp) { bp.classList.add('jj-bump-m'); mt.insertAdjacentElement('beforebegin', bp); }
}
function renderBump() {
  if (!BUMP || bumpVariant !== 'b') return null;
  const tpl = $('#bump-template'); if (!tpl) return null;
  const el = tpl.content.firstElementChild.cloneNode(true);
  const btn = el.querySelector('.jj-bump-add');
  btn.addEventListener('click', () => { bumpOn = !bumpOn; syncBumpButtons(); updateAmounts(); });
  return el;
}
function syncBumpButtons() {
  $$('.jj-bump-add').forEach(b => {
    b.classList.toggle('on', bumpOn); b.setAttribute('aria-pressed', bumpOn ? 'true' : 'false');
    b.querySelector('.bp-lbl').textContent = bumpOn ? 'Aggiunto' : 'Aggiungi';
    b.querySelector('.bp-ic').innerHTML = bumpOn
      ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.6 2.6L10 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  });
}
// Extra regel "Spray Neutralizzante · 9,95 €" in elk overzicht zolang de bump aan staat
function syncBumpRows() {
  $$('.js-summary-slot').forEach(slot => {
    const ex = slot.querySelector('.jj-bump-row');
    if (!bumpOn) { if (ex) ex.remove(); return; }
    if (ex) return;
    const prod = slot.querySelector('.prod-row'); if (!prod) return;
    const row = document.createElement('div');
    row.className = 'prod-row jj-bump-row';
    row.innerHTML = '<div class="prod-thumb"><img src="' + BUMP.img + '" alt="' + BUMP.title + '"><span class="qty-badge">1</span></div>'
      + '<div class="prod-info"><div class="prod-name">' + BUMP.title + '</div><div class="prod-variant">Neutralizza gli odori in 2 minuti</div></div>'
      + '<div class="prod-price"><span class="actual"><span>' + money(BUMP.price) + '</span></span></div>';
    const after = slot.querySelector('.jj-gift-row') || prod;
    after.insertAdjacentElement('afterend', row);
  });
}

function updateAmounts() {
  $$('.prod-row:not(.jj-bgift) .prod-thumb img, .mobile-total img').forEach(el => { el.src = P.img; el.alt = CONFIG.PRODUCT_NAME; });
  $$('.js-pack-label').forEach(el => el.textContent = P.label);
  const hasCompare = P.compare > P.amount;
  $$('.js-compare').forEach(el => { el.textContent = hasCompare ? money(P.compare) : ''; el.hidden = !hasCompare; });
  $$('.js-price').forEach(el => el.textContent = money(P.amount));
  $$('.js-save').forEach(el => { el.textContent = hasCompare ? `${T.save} ${money(P.save)} (${P.savePct}%)` : ''; el.hidden = !hasCompare; });
  $$('.js-subtotal').forEach(el => el.textContent = money(P.amount + bumpCents()));
  if (BUMP) { $$('.js-items').forEach(el => el.textContent = bumpOn ? T.items2 : T.items1); syncBumpRows(); }
  $$('.js-shipping').forEach(el => {
    if (!addrComplete()) {
      el.textContent = T.enterAddress;
      el.classList.add('t-muted');
    } else {
      el.textContent = shipCents() ? money(shipCents()) : T.free;
      el.classList.remove('t-muted');
    }
  });
  $$('.js-ins-line').forEach(el => el.hidden = !insCents());
  $$('.js-ins-amt').forEach(el => el.textContent = money(INS_PRICE));
  $$('.js-total').forEach(el => el.textContent = money(totalCents()));
  // Normale prijs doorgestreept boven het totaal (onderaan op mobiel): totaal + de korting op de bundel
  const cmpTotal = hasCompare ? totalCents() + (P.compare - P.amount) : 0;
  $$('.js-total-compare').forEach(el => { el.textContent = cmpTotal ? money(cmpTotal) : ''; el.hidden = !cmpTotal; });
  // Disclosure shows the RECURRING amount, not today's total — a one-off promo or
  // express shipping changes the first charge but not what rebills every 28 days.
  $$('.js-renewal-amt').forEach(el => el.textContent = money(renewalCents()));
  $$('.js-cycle-days').forEach(el => el.textContent = CONFIG.CYCLE_DAYS);
  $$('.js-trial-days').forEach(el => el.textContent = CONFIG.TRIAL_DAYS);
  $$('.js-cycle-per-year').forEach(el => el.textContent = Math.floor(365 / CONFIG.CYCLE_DAYS));
  $$('.js-discount-line').forEach(el => el.hidden = !promo);
  if (promo) {
    $$('.js-discount-label').forEach(el => el.textContent = `${T.discount} (${promo.code})`);
    $$('.js-discount-amt').forEach(el => el.textContent = '-' + money(discountCents()));
  }
  if (elementsExpress) elementsExpress.update({ amount: totalCents() });
  if (elementsExpress2) elementsExpress2.update({ amount: totalCents() });
  if (elementsPay) elementsPay.update({ amount: totalCents() });
  updatePayPalGate();
}

/* PayPal-native subscriptions bill the FIXED plan price with standard shipping —
   they cannot carry a promo discount or the express-shipping add-on. If we left
   the buttons up, a buyer with a discount/express total on screen would be
   charged a DIFFERENT amount by PayPal. Gate: hide PayPal whenever the displayed
   total diverges from the plan price, and say why. */
function updatePayPalGate() {
  const blocked = !!promo; // PayPal-plannen hebben een vaste prijs: geen kortingscode mogelijk
  const hideRow = blocked || apGuardActive;
  const expressBtn = $('#paypal-button-container');
  const payRow = $('#pm-paypal');
  const note = $('#paypal-gate-note');
  if (expressBtn) expressBtn.style.display = blocked ? 'none' : '';
  if (payRow && !payRow.hidden) payRow.style.display = hideRow ? 'none' : '';
  if (note) note.hidden = !blocked || !payRow || payRow.hidden;
  if (blocked && payPalSelected) setPayPalSelected(false);
}

/* ---------- Discount code ---------- */
function wireDiscountInputs() {
  $$('.js-discount-input').forEach(input => {
    const btn = input.closest('.discount-row').querySelector('.js-apply');
    input.addEventListener('input', () => btn.classList.toggle('active', input.value.trim().length > 0));
    // Enter should apply the code, not submit the whole checkout form (the mobile
    // discount row lives inside <form>, so Enter used to trigger full validation).
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });
    btn.addEventListener('click', async () => {
      const code = input.value.trim();
      const msg = input.closest('.discount-row').nextElementSibling;
      if (!code) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        const r = await fetch('/api/validate-code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await r.json();
        if (data.valid) {
          promo = { code: data.code, percent_off: data.percent_off, amount_off: data.amount_off, duration: data.duration };
          msg.textContent = T.discountOk;
          msg.className = 'discount-msg ok';
        } else {
          promo = null;
          msg.textContent = T.discountBad;
          msg.className = 'discount-msg err';
        }
      } catch {
        msg.textContent = T.discountErr;
        msg.className = 'discount-msg err';
      }
      msg.hidden = false;
      btn.disabled = false; btn.textContent = T.apply;
      updateAmounts();
    });
  });
}

/* ---------- Country / region fields ---------- */
function fillCountries(sel) {
  sel.innerHTML = Object.entries(COUNTRIES)
    .map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
  sel.value = ALLOWED_COUNTRIES[0];
}
function regionUsesSelect(country) { return !!REGION_LISTS[country]; }

/* Countries whose carriers reject a label with no state/province. US and CA pick
   from a dropdown; AU types into #state-free, which used to go unvalidated — the
   old gate only required a region when a <select> was on screen, so every
   non-US/CA order could be submitted with an empty state. */
const REGION_REQUIRED = new Set(['IT', 'US', 'CA', 'AU']);
function regionValue(country) {
  return regionUsesSelect(country) ? $('#state').value : $('#state-free').value.trim();
}

/* A ZIP that is merely non-empty is not enough — a 4-digit US ZIP (a stripped
   leading zero, common across New England and the 006xx-009xx territories) reads
   as present and still can't be labelled. Non-US/CA formats vary too much to
   check, so those only need to be non-empty. */
function zipLooksValid(zip, country) {
  const z = String(zip || '').trim();
  if (!z) return false;
  if (country === 'IT') return /^\d{5}$/.test(z);
  if (country === 'NL') return /^\d{4}\s?[A-Za-z]{2}$/.test(z);
  if (country === 'BE') return /^\d{4}$/.test(z);
  if (country === 'US') return /^\d{5}(-?\d{4})?$/.test(z);
  if (country === 'CA') return /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(z);
  if (country === 'GB') return /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/.test(z);
  if (country === 'AU' || country === 'NZ') return /^\d{4}$/.test(z);
  return true;
}

/* The gate above tolerates a space in a US ZIP+4 because people type it that way;
   USPS wants it hyphenated, so canonicalise here rather than storing "90210 1234"
   and handing the label software the same ambiguity we just set out to remove. */
function normalizeZip(zip, country) {
  const z = String(zip || '').trim();
  if (country === 'US') { const d = z.replace(/[^\d]/g, ''); return d.length === 9 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  if (country === 'CA') { const c = z.replace(/[\s-]+/g, '').toUpperCase(); return c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c; }
  if (country === 'GB') { const c = z.replace(/\s+/g, '').toUpperCase(); return c.length > 3 ? c.slice(0, -3) + ' ' + c.slice(-3) : c; }
  return z.replace(/\s+/g, '');
}
function updateRegionFields() {
  const country = $('#country').value;
  const useSelect = regionUsesSelect(country);
  $('#state-select-wrap').hidden = !useSelect;
  $('#state-text-wrap').hidden = useSelect || IS_NL; // NL/BE: geen provincie
  if (useSelect) {
    const list = REGION_LISTS[country] || PROVINCES;
    // No pre-selected default: a silent WA/ON default was being submitted verbatim
    // by anyone who typed their address by hand — wrong-state shipments on PAID
    // orders. Empty placeholder + required validation instead.
    $('#state').innerHTML = '<option value="" disabled selected>' + L('Seleziona…', 'Select…') + '</option>' +
      Object.entries(list).map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
    $('#state-label').textContent = IS_US ? (country === 'CA' ? 'Province' : 'State') : 'Provincia';
  } else {
    // AU now requires a region, so the free-text field must stop advertising
    // itself as optional for the countries that gate on it.
    $('#state-free-label').textContent = REGION_REQUIRED.has(country)
      ? 'State/Province' : 'State/Province (optional)';
  }
  $('#zip-label').textContent = IS_US ? (country === 'US' ? 'ZIP code' : 'Postal code') : T.zip;
  if (IS_US) { const zi = $('#zip'); zi.setAttribute('inputmode', country === 'US' || country === 'AU' || country === 'NZ' ? 'numeric' : 'text'); }
}
function stateCodeFromName(country, name) {
  if (!name) return '';
  const list = REGION_LISTS[country] || null;
  if (!list) return name;
  if (list[name.toUpperCase()]) return name.toUpperCase();
  // Photon geeft "Como" of "Provincia di Como" / "Città metropolitana di Milano" / "Roma Capitale"
  const clean = name.toLowerCase()
    .replace(/^(provincia (autonoma )?di |città metropolitana di |libero consorzio comunale di )/, '')
    .replace(/ capitale$/, '').trim();
  const hit = Object.entries(list).find(([, n]) => n.toLowerCase() === clean);
  return hit ? hit[0] : '';
}

/* Provincia uit de CAP (Italiaanse postcodes: de eerste cijfers bepalen de provincie).
   Vangnet als de adres-suggestie geen provincie meegeeft, en bij zelf typen van de CAP. */
const CAP2 = {
  '00':'RM','01':'VT','02':'RI','03':'FR','04':'LT','05':'TR','06':'PG','07':'SS','08':'NU',
  '10':'TO','11':'AO','12':'CN','13':'VC','14':'AT','15':'AL','16':'GE','17':'SV','18':'IM','19':'SP',
  '20':'MI','21':'VA','22':'CO','23':'SO','24':'BG','25':'BS','26':'CR','27':'PV','28':'NO','29':'PC',
  '30':'VE','31':'TV','32':'BL','33':'UD','34':'TS','35':'PD','36':'VI','37':'VR','38':'TN','39':'BZ',
  '40':'BO','41':'MO','42':'RE','43':'PR','44':'FE','45':'RO','46':'MN','47':'FC','48':'RA',
  '50':'FI','51':'PT','52':'AR','53':'SI','54':'MS','55':'LU','56':'PI','57':'LI','58':'GR','59':'PO',
  '60':'AN','61':'PU','62':'MC','63':'AP','64':'TE','65':'PE','66':'CH','67':'AQ',
  '70':'BA','71':'FG','72':'BR','73':'LE','74':'TA','75':'MT','76':'BT',
  '80':'NA','81':'CE','82':'BN','83':'AV','84':'SA','85':'PZ','86':'CB','87':'CS','88':'CZ','89':'RC',
  '90':'PA','91':'TP','92':'AG','93':'CL','94':'EN','95':'CT','96':'SR','97':'RG','98':'ME',
};
const CAP3 = { '138':'BI','139':'BI','208':'MB','209':'MB','238':'LC','239':'LC','268':'LO','269':'LO',
  '288':'VB','289':'VB','478':'RN','479':'RN','638':'FM','639':'FM','888':'KR','889':'KR','898':'VV','899':'VV' };
const CAP4 = { '3307':'PN','3308':'PN','3309':'PN','3317':'PN','3407':'GO','3417':'GO',
  '8607':'IS','8608':'IS','8609':'IS','8617':'IS','0907':'OR','0908':'OR','0909':'OR','0917':'OR','0912':'CA','0913':'CA' };
function provinceFromCap(zip) {
  const z = String(zip || '').trim();
  if (!/^\d{5}$/.test(z)) return '';
  if (z.startsWith('09')) return CAP4[z.slice(0, 4)] || ''; // Sardegna-zuid: te gemengd, laat klant kiezen
  return CAP4[z.slice(0, 4)] || CAP3[z.slice(0, 3)] || CAP2[z.slice(0, 2)] || '';
}
// Provincie invullen, tenzij de klant er zelf al een koos
function autoSetProvince(code) {
  const sel = $('#state');
  const rl = REGION_LISTS[($('#country') || {}).value] || PROVINCES;
  if (!code || !sel || !rl[code]) return;
  if (sel.value && sel.dataset.auto !== '1') return;
  sel.value = code;
  sel.dataset.auto = '1';
  sel.classList.remove('invalid');
}

/* ---------- Address autocomplete (Photon/OSM, filtered to the chosen country) ---------- */
let addrDebounce = null;
let addrSuppress = false;
function initAddressAutocomplete() {
  const input = $('#address');
  const panel = $('#addr-suggest');
  const list = $('#as-list');
  const hide = () => { panel.hidden = true; };
  $('#as-close').addEventListener('click', hide);
  document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== input) hide(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  input.addEventListener('input', () => {
    if (addrSuppress) return;
    clearTimeout(addrDebounce);
    const q = input.value.trim();
    if (q.length < 4) { hide(); return; }
    addrDebounce = setTimeout(async () => {
      try {
        const country = $('#country').value;
        // lang=default → plaatsnamen in het Italiaans ("Roma", niet "Rome")
        const bias = IS_US ? ({ US: '&lat=39.8&lon=-98.6', CA: '&lat=56.1&lon=-106.3', GB: '&lat=54&lon=-2', AU: '&lat=-25.3&lon=133.8', NZ: '&lat=-41&lon=174' }[country] || '') + '&lang=en' : '&lat=42.5&lon=12.5&lang=default';
        const r = await fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=8' + bias);
        const data = await r.json();
        const seen = new Set();
        const items = (data.features || [])
          .map(f => f.properties)
          .filter(pr => (pr.countrycode || '').toUpperCase() === country && (pr.street || pr.housenumber || pr.name))
          .map(pr => {
            const typedNum = (q.match(/^\s*(\d[\w-]*)\s+/) || [])[1] || '';
            const line1 = [pr.housenumber || typedNum, pr.street || pr.name].filter(Boolean).join(' ');
            return {
              line1,
              city: pr.city || pr.district || pr.county || '',
              state: IS_US ? (pr.state || '') : (pr.county || pr.state || ''),
              zip: pr.postcode || '',
              label2: [pr.postcode || '', pr.city || pr.district || '', pr.county || ''].filter(Boolean).join(' '),
            };
          })
          .filter(it => { const k = it.line1 + '|' + it.label2; if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 5);
        if (!items.length) { hide(); return; }
        list.innerHTML = '';
        items.forEach(it => {
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'as-item';
          row.innerHTML = '<strong>' + it.line1 + '</strong>' + (it.label2 ? ', ' + it.label2 : '');
          row.addEventListener('click', () => {
            addrSuppress = true;
            input.value = it.line1;
            if (it.city) $('#city').value = it.city;
            const country2 = $('#country').value;
            if (it.zip) $('#zip').value = it.zip.split(';')[0];
            if (regionUsesSelect(country2)) {
              // Suggestie kiezen = nieuw adres → provincie altijd opnieuw bepalen
              const code = stateCodeFromName(country2, it.state) || (IS_US ? '' : stateCodeFromName(country2, it.city) || provinceFromCap($('#zip').value));
              if (code) { $('#state').dataset.auto = '1'; autoSetProvince(code); }
            } else if (it.state) {
              $('#state-free').value = it.state;
            }
            hide();
            setTimeout(() => { addrSuppress = false; }, 50);
            shipGate();
          });
          list.appendChild(row);
        });
        panel.hidden = false;
      } catch (e) { hide(); }
    }, 300);
  });
}

/* ---------- Shipping delivery-date estimates ---------- */
function addBusinessDays(from, n) {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) added++;
  }
  return d;
}
function renderShipDates() {
  const fmt = (d) => d.toLocaleDateString(T.dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  $$('.ship-date').forEach(el => {
    const [min, max] = el.dataset.shipDate.split(',').map(Number);
    el.textContent = fmt(addBusinessDays(new Date(), min)) + ' – ' + fmt(addBusinessDays(new Date(), max));
  });
}

/* ---------- Stripe ---------- */
// Guard: if js.stripe.com was blocked (ad-blocker, network, region) the Stripe
// global is undefined and the whole checkout would silently die. Detect it,
// log it, and we surface a clear retry message when the buyer tries to pay.
if (typeof Stripe === 'undefined') logClient('fatal', 'Stripe.js failed to load');
let stripe = null; // aangemaakt in boot() zodra de publishable key uit /api/checkout-config binnen is
let elementsExpress = null;
let elementsExpress2 = null; // US: tweede groep (Google Pay apart naast Apple Pay)
let ECE_OPTS = null;
let elementsPay = null; // NL/BE: Payment Element (iDEAL / Bancontact / kaart) i.p.v. de losse kaartvelden
let payComplete = false;
let cardNumber = null;
let cardState = { number: false, expiry: false, cvc: false };
let payPalSelected = false;
let expressAvailable = false; // a wallet or PayPal button actually mounted

function addrComplete() {
  const country = $('#country').value;
  const stateOk = !REGION_REQUIRED.has(country) || !!regionValue(country);
  return !!($('#address').value.trim() && $('#city').value.trim()
    && zipLooksValid($('#zip').value, country) && stateOk);
}
function shipGate() {
  const ready = addrComplete();
  $('#ship-empty').hidden = ready;
  $('#ship-options').hidden = !ready;
  updateAmounts();
}

function setPayPalSelected(on) {
  if (on === payPalSelected) return;
  const row = $('#pm-paypal');
  if (!row || row.hidden) return;
  payPalSelected = on;
  row.classList.toggle('selected', on);
  $('#pm-cc').classList.toggle('selected', !on);
  $('#pm-paypal-toggle').setAttribute('aria-pressed', String(on));
  $('#pm-cc-toggle').setAttribute('aria-pressed', String(!on));
  $('#pm-paypal-body').hidden = !on;
  $('#pm-cc-body').hidden = on;
  if (IS_NL) { const pe = $('#payment-element'); if (pe) pe.hidden = on; const note = $('.pe-note'); if (note) note.hidden = on; }
  // PayPal: de gele PayPal-knop in de rij vervangt de gewone bestelknop
  $('#pay-btn').hidden = on && !!CONFIG.PAYPAL_CLIENT_ID;
  if (!CONFIG.PAYPAL_CLIENT_ID) $('#pay-btn-text').textContent = on ? L('Paga con PayPal', 'Pay with PayPal') : PAY_LABEL;
}

const IS_MOBILE = matchMedia('(max-width: 999px)').matches;
const BASE_FONT = IS_MOBILE ? '16px' : '14px';
const appearance = {
  labels: 'floating',
  variables: {
    colorPrimary: PRODUCT_KEY === 'sageleaf' ? '#2F5A45' : IS_US ? '#C9643A' : '#2c6e65',
    colorText: '#1a1a1a',
    colorTextSecondary: '#707070',
    colorDanger: '#c0392b',
    borderRadius: '10px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSizeBase: BASE_FONT,
    gridRowSpacing: '14px',
    fontSizeSm: '12px',
  },
  rules: {
    '.Input': { borderColor: '#d9d9d9', padding: '6px 12px' },
    '.Input:focus': PRODUCT_KEY === 'sageleaf' ? { borderColor: '#2F5A45', boxShadow: '0 0 0 1px #2F5A45' } : IS_US ? { borderColor: '#C9643A', boxShadow: '0 0 0 1px #C9643A' } : { borderColor: '#2c6e65', boxShadow: '0 0 0 1px #2c6e65' },
    '.Label': { color: '#707070' },
  },
};
/* Split card elements use the classic style API */
const cardStyle = {
  base: {
    fontSize: BASE_FONT,
    color: '#1a1a1a',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    '::placeholder': { color: '#707070' },
  },
  invalid: { color: '#c0392b' },
};

function initStripe() {
  if (!stripe) {
    // Preview zonder Stripe-sleutel: toon hoe de snelle knoppen eruitzien (niet klikbaar)
    if (!CONFIG.STRIPE_PK) { $('#express-section').hidden = false; $('#ece-preview').hidden = !!CONFIG.PAYPAL_CLIENT_ID; $('#pm-paypal').hidden = false; }
    showError(CONFIG.STRIPE_PK ? T.payLoadFail : T.payUnavailable);
    $('#pay-btn').disabled = true;
    return;
  }
  // Express checkout gets its own deferred group with Link enabled
  // (the card form below uses classic split elements — no Link UI).
  ECE_OPTS = {
    mode: 'subscription',
    amount: totalCents(),
    currency: CUR,
    setupFutureUsage: 'off_session',
    paymentMethodTypes: CONFIG.STRIPE_PAYPAL && !IS_NL && !IS_US ? ['card', 'link', 'paypal'] : ['card', 'link'],
    appearance,
    locale: IS_US ? 'en' : MARKET,
  };
  elementsExpress = stripe.elements(ECE_OPTS);
  if (IS_NL) CONFIG.STRIPE_PAYPAL = false; // /api/checkout-config zet dit aan; NL/BE doet PayPal rechtstreeks, niet via Stripe

  if (IS_NL) {
    // NL/BE: Stripe's Payment Element met iDEAL (bovenaan) en kaart. Met setupFutureUsage off_session toont Stripe
    // bij iDEAL zelf de SEPA-machtigingstekst; de rebills lopen daarna als sepa_debit. Zolang SEPA Direct Debit op het
    // Stripe-account niet actief is, weigert Stripe iDEAL+off_session (loaderror) → dan opnieuw met alleen kaart,
    // zodat kaart (en PayPal in de rij eronder) gewoon blijven werken. Bancontact erbij zodra SEPA actief is.
    // Naam/e-mail/adres komen uit ons formulier (fields: never) en gaan mee bij confirmPayment.
    const mountPay = (types) => {
      elementsPay = stripe.elements({
        mode: 'subscription', amount: totalCents(), currency: 'eur', setupFutureUsage: 'off_session',
        paymentMethodTypes: types, appearance, locale: 'nl',
      });
      const paymentElement = elementsPay.create('payment', {
        layout: { type: 'accordion', defaultCollapsed: false, radios: true, spacedAccordionItems: true },
        paymentMethodOrder: ['ideal', 'card'],
        fields: { billingDetails: { name: 'never', email: 'never', phone: 'never', address: 'never' } },
        wallets: { applePay: 'never', googlePay: 'never' }, // staan al bovenaan (express checkout)
      });
      paymentElement.mount('#payment-element');
      paymentElement.on('change', (e) => { payComplete = !!e.complete; });
      paymentElement.on('focus', () => setPayPalSelected(false));
      paymentElement.on('ready', () => { const ph = $('#payment-element-loading'); if (ph) ph.remove(); });
      paymentElement.on('loaderror', (e) => {
        logClient('pe_loaderror', (e && e.error && e.error.message) + ' [' + types.join(',') + ']', 'payment_element');
        if (types.includes('ideal')) {
          // iDEAL-recurring vereist SEPA Direct Debit op het account: terugvallen op alleen kaart
          try { paymentElement.destroy(); } catch (err) {}
          const note = $('.pe-note'); if (note) note.hidden = true;
          return mountPay(['card']);
        }
        const ph = $('#payment-element-loading'); if (ph) ph.textContent = T.payUnavailable;
        showError(T.payLoadFail); $('#pay-btn').disabled = true;
      });
    };
    mountPay(['card', 'ideal']);
    $('#pm-cc').hidden = true;
    return initExpress();
  }
  initCardElements();
  initExpress();
}
function initCardElements() {
  // Split card elements inside our own Shopify-style markup
  const elementsCard = stripe.elements({ locale: IS_US ? 'en' : 'it' });
  cardNumber = elementsCard.create('cardNumber', { style: cardStyle, placeholder: L('Numero della carta', 'Card number'), showIcon: false });
  const cardExpiry = elementsCard.create('cardExpiry', { style: cardStyle, placeholder: 'Scadenza (MM/AA)' });
  const cardCvc = elementsCard.create('cardCvc', { style: cardStyle, placeholder: 'Codice CVV' });
  $$('.cc-ph').forEach(el => el.remove()); // eigen placeholders weg; Stripe toont zijn eigen tekst
  cardNumber.mount('#card-number');
  cardExpiry.mount('#card-expiry');
  cardCvc.mount('#card-cvc');
  [[cardNumber, 'number'], [cardExpiry, 'expiry'], [cardCvc, 'cvc']].forEach(([el, key]) => {
    el.on('change', (e) => { cardState[key] = !!e.complete; });
    el.on('focus', () => {
      el._wrap = el._wrap || $('#card-' + (key === 'number' ? 'number' : key)).closest('.cc-fld');
      el._wrap.classList.add('focus');
      setPayPalSelected(false);
    });
    el.on('blur', () => { if (el._wrap) el._wrap.classList.remove('focus'); });
  });
}
// Snelle knoppen bovenaan. US (Engelse checkout): Apple Pay en Google Pay elk in een eigen kolom naast de PayPal-knop
// (Stripe zet in één element maar 1 knop + "See more" in een smalle kolom) → twee Express Checkout-elementen.
function initExpress() {
  const base = { paypal: 'never', link: 'never', amazonPay: 'never', klarna: 'never' };
  if (IS_US) {
    const one = { maxColumns: 1, maxRows: 1, overflow: 'auto' }; // overflow 'never' toont bij Stripe niets
    mountExpress(elementsExpress, '#express-checkout-element', { ...base, applePay: 'always', googlePay: 'never' }, one);
    elementsExpress2 = stripe.elements(ECE_OPTS);
    mountExpress(elementsExpress2, '#express-checkout-element-2', { ...base, applePay: 'never', googlePay: 'always' }, one);
    return;
  }
  mountExpress(elementsExpress, '#express-checkout-element', { ...base, paypal: IS_NL ? 'never' : 'auto', googlePay: 'always', applePay: 'always' }, { maxColumns: 3, maxRows: 1, overflow: 'auto' });
}
function mountExpress(grp, target, pm, layout) {
  // Snelle knoppen bovenaan: PayPal + Google Pay (+ Apple Pay op iPhone/Safari), naast elkaar
  const expressCheckout = grp.create('expressCheckout', {
    buttonHeight: 48,
    layout,
    buttonTheme: { paypal: 'gold', googlePay: 'black', applePay: 'black' },
    paymentMethods: pm,
  });
  expressCheckout.mount(target);
  expressCheckout.on('ready', (e) => {
    if (!e.availablePaymentMethods) $(target).style.display = 'none';
    if (e.availablePaymentMethods) {
      expressAvailable = true;
      if (!apGuardActive) $('#express-section').hidden = false;
    }
  });
  expressCheckout.on('click', (e) => {
    const insured = { id: 'insured', displayName: SHIP.insured.title, amount: SHIP.insured.cents };
    const free = { id: 'free', displayName: SHIP.free.title, amount: SHIP.free.cents };
    e.resolve({
      emailRequired: true,
      phoneNumberRequired: true,
      shippingAddressRequired: true,
      allowedShippingCountries: ALLOWED_COUNTRIES,
      // eerste optie = voorgeselecteerd in Apple Pay / Google Pay — volg de keuze in het formulier
      shippingRates: shipMethod === 'insured' ? [insured, free] : [free, insured],
    });
  });
  expressCheckout.on('shippingratechange', (e) => {
    shipMethod = e.shippingRate.id;
    // Sync the form's shipping radios — otherwise a rate picked inside the wallet
    // sheet silently changes what a later CARD payment is charged while the form
    // still shows the old selection.
    const radio = document.querySelector('.ship-opt input[value="' + shipMethod + '"]');
    if (radio) {
      radio.checked = true;
      $$('.ship-opt').forEach(o => o.classList.toggle('selected', o.contains(radio)));
    }
    updateAmounts();
    e.resolve();
  });
  expressCheckout.on('confirm', async (e) => {
    const ship = e.shippingAddress;
    const name = (e.billingDetails && e.billingDetails.name) || (ship && ship.name) || '';
    const email = (e.billingDetails && e.billingDetails.email) || '';
    const phone = (e.billingDetails && e.billingDetails.phone) || '';
    const flatShipping = ship ? {
      name: ship.name,
      line1: ship.address.line1, line2: ship.address.line2 || '',
      city: ship.address.city, state: ship.address.state,
      postal_code: ship.address.postal_code,
      country: ship.address.country || ALLOWED_COUNTRIES[0],
      country_name: COUNTRIES[ship.address.country] || ship.address.country || 'Italia',
    } : null;
    try {
      const { error: submitError } = await grp.submit();
      if (submitError) { showError(submitError.message); return; }
      const { clientSecret, amount, subscriptionId } = await createSubscription({ email, name, phone, shipping: flatShipping, ...(IS_NL ? { market: 'nl' } : IS_US ? { market: 'us' } : {}) });
      if (amount && amount !== totalCents()) grp.update({ amount });
      saveOrderForThankYou({ email, name, shipping: flatShipping, wallet: true });
      const { error } = await stripe.confirmPayment({
        elements: grp, clientSecret,
        confirmParams: { return_url: successUrl(subscriptionId) },
      });
      if (error) { showPayError(error, 'wallet_confirm'); }
    } catch (err) {
      showError(err.message || T.generic);
      logClient('pay_exception', err && err.message, 'wallet');
    }
  });
}

/* Build a PayPal `subscriber` object from the checkout form so the buyer's typed
   shipping address flows form → PayPal → webhook → Shopify. Returns null unless
   BOTH a complete address and a name are present — in that case the caller falls
   back to GET_FROM_FILE (PayPal's stored address). This is what stops the silent
   "PayPal order with no shipping address" path in api/paypal-webhook.js. */
function paypalSubscriber() {
  const first = $('#first-name').value.trim();
  const last = $('#last-name').value.trim();
  if (!addrComplete() || !(first || last)) return null;
  const s = collectShipping();
  const email = $('#email').value.trim();
  const address = {
    address_line_1: s.line1,
    admin_area_2: s.city,     // city
    admin_area_1: s.state,    // state / province code (US/CA) or free text
    postal_code: s.postal_code,
    country_code: s.country,
  };
  if (s.line2) address.address_line_2 = s.line2;
  const subscriber = {
    name: { given_name: first || undefined, surname: last || undefined },
    shipping_address: {
      name: { full_name: s.name || [first, last].filter(Boolean).join(' ') },
      address,
    },
  };
  if (email) subscriber.email_address = email;
  return subscriber;
}

/* Mark the empty shipping fields invalid so the buyer sees exactly what's missing
   when the PayPal onClick gate blocks them. */
function highlightShippingGaps() {
  const country = $('#country').value;
  ['first-name', 'last-name', 'address', 'city'].forEach(id => {
    const el = $('#' + id);
    el.classList.toggle('invalid', !el.value.trim());
  });
  // ZIP is checked by shape, not emptiness, so it can't ride the loop above.
  $('#zip').classList.toggle('invalid', !zipLooksValid($('#zip').value, country));
  if (REGION_REQUIRED.has(country)) {
    const st = regionUsesSelect(country) ? $('#state') : $('#state-free');
    st.classList.toggle('invalid', !regionValue(country));
  }
}

/* ---------- PayPal (rechtstreeks, buiten Stripe) ----------
   Onze server kiest het juiste PayPal-plan (bundel × verzending) en maakt het abonnement;
   na goedkeuring maakt /api/paypal/confirm meteen de Shopify-order (met ad-tracking). */
let paypalReady = false;
function initPayPal() {
  if (!CONFIG.PAYPAL_CLIENT_ID) return;
  const s = document.createElement('script');
  s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(CONFIG.PAYPAL_CLIENT_ID)
        + '&vault=true&intent=subscription&currency=' + CUR.toUpperCase() + '&locale=' + (IS_US ? 'en_US' : 'it_IT') + '&disable-funding=credit,card';
  s.onload = () => {
    if (!window.paypal) return;
    const makeConfig = (inline) => ({
      fundingSource: window.paypal.FUNDING.PAYPAL,
      style: { shape: 'rect', height: 48, label: 'paypal', tagline: false, color: 'gold' },
      // Onderaan (in het formulier): eerst naam + adres invullen, zodat het juiste adres naar Shopify gaat.
      // Bovenaan (snelle knop): mag zonder formulier — dan nemen we het adres uit PayPal.
      onClick: (data, actions) => {
        if (promo) { showError(L('I codici sconto sono disponibili con il pagamento con carta.', 'Discount codes are available when paying by card.')); return actions.reject(); }
        if (!inline || paypalSubscriber()) return actions.resolve();
        showError(L('Inserisci nome e indirizzo di spedizione prima di pagare con PayPal.', 'Please enter your name and shipping address before paying with PayPal.'));
        highlightShippingGaps();
        const first = $('#first-name');
        (first.value.trim() ? $('#address') : first).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return actions.reject();
      },
      createSubscription: async () => {
        const sh = paypalSubscriber() ? collectShipping() : null;
        const r = await fetch('/api/paypal/create-subscription', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pack, product: PRODUCT_KEY, ship_method: shipMethod, insurance: insCents() > 0, checkout_ab: AB_VARIANT || undefined, track: attribution(),
            bump: bumpCents() > 0, bump_ab: bumpVariant || undefined,
            email: $('#email').value.trim(), name: sh ? sh.name : '', shipping: sh, ...(IS_NL ? { market: 'nl' } : IS_US ? { market: 'us' } : {}),
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.id) { showError(d.error || L('PayPal non è riuscito ad avviare l’ordine: riprova oppure paga con carta.', 'PayPal could not start your order: please try again or pay by card.')); throw new Error('paypal create'); }
        return d.id;
      },
      onApprove: async (data) => {
        setBusy(true);
        const id = data.subscriptionID;
        try {
          await fetch('/api/paypal/confirm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, track: attribution(), phone: ($('#phone') && $('#phone').value.trim()) || '' }),
          });
        } catch (e) { logClient('paypal_confirm', e && e.message, 'paypal'); }
        try { sessionStorage.setItem('checkout_purchase_fired', id); } catch (e) {}
        location.href = new URL(CONFIG.SUCCESS_PATH + '?pp=' + encodeURIComponent(id) + '&b=' + pack + PQ + (BONUS ? '&skip=1' : ''), location.origin).href;
      },
      onError: (err) => { showError(L('PayPal non è riuscito ad avviare l’ordine: riprova oppure paga con carta.', 'PayPal could not start your order: please try again or pay by card.')); logClient('paypal_error', err && err.message, 'paypal'); },
    });
    // Snelle knop bovenaan
    window.paypal.Buttons(makeConfig(false)).render('#paypal-button-container').then(() => {
      paypalReady = true;
      $('#ece-preview').hidden = true;
      if (!apGuardActive) $('#express-section').hidden = false;
      updatePayPalGate();
    }).catch(() => {});
    // Rij "PayPal" bij Pagamento
    window.paypal.Buttons(makeConfig(true)).render('#paypal-inline-container').then(() => {
      $('#pm-paypal').hidden = false;
      updatePayPalGate();
    }).catch(() => {});
  };
  document.head.appendChild(s);
}

/* ---- PaymentIntent reuse across retries --------------------------------------
   A declined card used to mint a BRAND-NEW subscription + PaymentIntent on every
   Pay click. Three retries on one bank decline = three "Subscription creation"
   failures in Stripe, three orphan `incomplete` subscriptions hanging off the
   customer (each able to fire its own dunning email), and a worse authorization-
   decline ratio on the account. Stripe supports re-confirming the SAME
   PaymentIntent after a decline, so cache the secret per checkout config and only
   mint a new subscription when the order itself actually changes.
   The cached value is a PROMISE, so two concurrent callers share one request. -- */
let subCache = null; // { key, promise }
const CHECKOUT_NONCE = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function keyHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function subCacheKey(customer) {
  return JSON.stringify([
    pack, shipMethod, insCents(), bumpCents(), promo ? promo.code : '',
    customer.email || '', customer.name || '', customer.shipping || null,
    customer.card_funding || '', customer.checkout_variant || '', // ander kaarttype → ander 3DS-besluit → nieuw abonnement
  ]);
}
// Bumped on every reset so the next attempt_id is genuinely new. Without this, a
// reset would re-send the same idempotency key and Stripe would hand back the very
// subscription we just decided was unusable (expired invoice, or already paid via
// "Place another order").
let subGeneration = 0;
function resetSubCache() { subCache = null; subGeneration++; }
function createSubscription(customer) {
  const key = subCacheKey(customer);
  if (subCache && subCache.key === key) return subCache.promise;
  const promise = (async () => {
    const res = await fetch('/api/stripe/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pack,
        product: PRODUCT_KEY,
        ship_method: shipMethod,
        insurance: insCents() > 0,
        bump: bumpCents() > 0, bump_ab: bumpVariant || undefined,
        checkout_ab: AB_VARIANT || undefined,
        promo_code: promo ? promo.code : null,
        track: attribution(),
        // Deterministic per (config): the server uses it as a Stripe idempotency
        // key, so a duplicated/retried request can't create a second subscription.
        attempt_id: CHECKOUT_NONCE + '_' + subGeneration + '_' + keyHash(key),
        ...customer,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.clientSecret) throw new Error(data.error || L('Impossibile avviare l’ordine. Riprova.', 'Could not start your order. Please try again.'));
    return data;
  })();
  subCache = { key, promise };
  // Never cache a failure — the next Pay click must be able to try again.
  promise.catch(() => { if (subCache && subCache.key === key) resetSubCache(); });
  return promise;
}

/* Two decline classes are NOT "try the same card again" problems: a 3DS
   authentication step that failed to complete (common inside the Facebook /
   Instagram in-app browsers nearly all of this traffic arrives in) and cards that
   refuse recurring charges outright. Both are recoverable via PayPal — say so,
   and put the PayPal row in front of the buyer instead of dead-ending them. */
function payErrorHint(error) {
  const code = (error && error.code) || '';
  const dc = (error && error.decline_code) || '';
  if (code === 'payment_intent_authentication_failure' || dc === 'authentication_required') {
    return L(' La verifica della tua banca non è stata completata: riprova oppure paga con PayPal.', ' Your bank’s verification was not completed: please try again or pay with PayPal.');
  }
  if (dc === 'card_not_supported' || dc === 'transaction_not_allowed') {
    return L(' Questa carta non consente pagamenti ricorrenti: usa un’altra carta oppure paga con PayPal.', ' This card does not allow recurring payments: please use another card or pay with PayPal.');
  }
  return '';
}
function showPayError(error, src) {
  const hint = payErrorHint(error);
  showError((error.message || L('Non è stato possibile completare il pagamento.', 'The payment could not be completed.')) + hint);
  logClient('pay_error', [error.code || '', error.decline_code || '', error.message || ''].join('|'), src);
  if (!hint) return;
  const row = $('#pm-paypal');
  if (row && !row.hidden && row.style.display !== 'none') {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ---------- Form flow ---------- */
function collectShipping() {
  const country = $('#country').value;
  return {
    name: [$('#first-name').value.trim(), $('#last-name').value.trim()].filter(Boolean).join(' '),
    line1: $('#address').value.trim(),
    line2: $('#address2').value.trim(),
    city: $('#city').value.trim(),
    state: regionUsesSelect(country) ? $('#state').value : $('#state-free').value.trim(),
    postal_code: normalizeZip($('#zip').value, country),
    country,
    country_name: COUNTRIES[country] || country,
    phone: ($('#phone') && $('#phone').value.trim()) || '',
  };
}
function collectBilling(shipping) {
  if ($('#bill-same').checked) return shipping;
  const country = $('#bill-country').value;
  return {
    name: shipping.name,
    line1: $('#bill-address').value.trim(),
    line2: '',
    city: $('#bill-city').value.trim(),
    state: $('#bill-state').value.trim(),
    postal_code: $('#bill-zip').value.trim(),
    country,
    country_name: COUNTRIES[country] || country,
  };
}
function validateForm() {
  // Email: trim first — mobile keyboards routinely append a space after
  // autocomplete, which used to fail the regex with no visible message.
  const email = $('#email');
  const emailVal = email.value.trim();
  if (emailVal !== email.value) email.value = emailVal;
  const badEmail = !/^\S+@\S+\.\S+$/.test(emailVal);
  email.classList.toggle('invalid', badEmail);
  $('#email-msg').hidden = !badEmail;
  if (badEmail) { email.focus(); return false; }

  let ok = true;
  const country = $('#country').value;
  ['last-name', 'address', 'city'].forEach(id => {
    const el = $('#' + id);
    const bad = !el.value.trim();
    el.classList.toggle('invalid', bad);
    if (bad && ok) { el.focus(); ok = false; }
  });
  // ZIP is validated by shape, not emptiness: a 4-digit US ZIP (stripped leading
  // zero) is non-empty and still unlabelable, so it can't ride the loop above.
  const zipEl = $('#zip');
  const badZip = !zipLooksValid(zipEl.value, country);
  zipEl.classList.toggle('invalid', badZip);
  if (badZip && ok) { zipEl.focus(); ok = false; }
  // State/province is required wherever the carrier needs one — US/CA pick from
  // the select (which starts on an empty placeholder, never a silent default),
  // AU types into the free-text field.
  if (REGION_REQUIRED.has(country)) {
    const st = regionUsesSelect(country) ? $('#state') : $('#state-free');
    const bad = !regionValue(country);
    st.classList.toggle('invalid', bad);
    if (bad && ok) { st.focus(); ok = false; }
  }
  if (!ok) { showError('Controlla i campi evidenziati.'); return false; }
  if (payPalSelected) return true; // PayPal: geen kaartgegevens nodig

  // Billing address: if "same as shipping" is unchecked, blank billing fields
  // used to go straight to Stripe and die as opaque AVS declines.
  if (!$('#bill-same').checked) {
    let billOk = true;
    ['bill-address', 'bill-city', 'bill-zip'].forEach(id => {
      const el = $('#' + id);
      const bad = !el.value.trim();
      el.classList.toggle('invalid', bad);
      if (bad && billOk) { el.focus(); billOk = false; }
    });
    if (!billOk) { showError(T.billing); return false; }
  }
  if (IS_NL) {
    if (!payComplete) { showError(T.payIncomplete); return false; }
    return true;
  }

  if (!cardState.number || !cardState.expiry || !cardState.cvc) {
    showError(T.payIncomplete);
    if (cardNumber) cardNumber.focus();
    return false;
  }
  const nameOnCard = $('#card-name');
  if (!nameOnCard.value.trim()) {
    nameOnCard.classList.add('invalid');
    nameOnCard.focus();
    return false;
  }
  nameOnCard.classList.remove('invalid');
  return true;
}
function showError(msg) {
  const box = $('#pay-error');
  box.textContent = msg;
  box.hidden = false;
  setBusy(false);
}
// Tekst van de bestelknop zoals in de HTML (variant A: "Sì! Confermo l’ordine!", variant B: "Completa l’ordine")
const PAY_LABEL = ((document.getElementById('pay-btn-text') || {}).textContent || 'Sì! Confermo l’ordine!').trim();
function setBusy(busy) {
  $('#pay-btn').disabled = busy;
  $('#pay-spinner').hidden = !busy;
  $('#pay-btn-text').textContent = busy ? L('Elaborazione…', 'Processing…') : (payPalSelected ? L('Paga con PayPal', 'Pay with PayPal') : PAY_LABEL);
}
/* ---------- Tracking (Meta pixel + server CAPI + attribution) ---------- */
const CAPI_URL = '/api/capi';
const CONTENT_IDS = CONFIG.META_CONTENT_IDS;
const IC_EVENT_ID = 'ic_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const AP_EVENT_ID = 'ap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Identity fields for CAPI (email + name + address) built from the form — the
// strong match signals that lift Event Match Quality. Only returns what's
// present; safe to spread into any sendCapi payload. sendCapi already adds
// fbp/fbc/IP/UA, so this is purely additive.
function capiIdentity() {
  const em = ($('#email') && $('#email').value.trim()) || '';
  const sh = collectShipping();
  const nm = String(sh.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    email: em || undefined,
    first_name: nm[0] || undefined,
    last_name: nm.slice(1).join(' ') || undefined,
    city: sh.city || undefined,
    state: sh.state || undefined,
    zip: sh.postal_code || undefined,
    country: sh.country || undefined,
  };
}

function getCookie(n) {
  const m = document.cookie.match('(^|;)\\s*' + n + '=([^;]*)');
  return m ? decodeURIComponent(m[2]) : '';
}
function sendCapi(payload) {
  try {
    fetch(CAPI_URL, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fbp: getCookie('_fbp') || undefined,
        fbc: getCookie('_fbc') || undefined,
        event_source_url: location.href,
        user_agent: navigator.userAgent,
        ...payload,
      }),
    });
  } catch (e) {}
}
function attribution() {
  // Zelfde sleutels als jjb-track.js op de salespagina meegeeft (?ad_id=…&host=…&pg=…)
  const p = new URLSearchParams(location.search);
  const o = {};
  TRACK_KEYS.forEach(k => {
    const v = p.get(k) || p.get('jjb_' + k) || p.get('attributes[jjb_' + k + ']');
    if (v) o[k] = v;
  });
  ['utm_medium', 'utm_term'].forEach(k => { if (p.get(k)) o[k] = p.get(k); });
  if (p.get('pg')) o.pg = p.get('pg');
  const fbp = getCookie('_fbp'), fbc = getCookie('_fbc');
  if (fbp && !o.fbp) o.fbp = fbp;
  if (fbc && !o.fbc) o.fbc = fbc;
  return o;
}

function saveOrderForThankYou(extra) {
  const shipping = extra.shipping || collectShipping();
  sessionStorage.setItem('checkout_order', JSON.stringify({
    pack, label: P.label,
    amount: P.amount, discount: discountCents(), shipping_cents: shipCents(), insurance_cents: insCents(), bump_cents: bumpCents(), total: totalCents(),
    email: extra.email || $('#email').value.trim(),
    name: extra.name || shipping.name,
    first_name: ($('#first-name').value || '').trim(),
    shipping,
    billing: extra.wallet ? shipping : collectBilling(shipping),
    ship_method: (SHIP[shipMethod] || SHIP.free).title,
    ts: Date.now(),
  }));
}

/* ---------- Already-purchased guard (back-button double-charge) ----------
   "Did it go through?" → Back from the thank-you page → the bfcache restores a
   fully-armed form → a second Pay = a second subscription + second charge.
   If a purchase was completed in this session recently, disarm the page and
   point at the confirmation instead. "Place another order" opts back in. */
let apGuardActive = false; // express/PayPal mount callbacks must not unhide UI while the guard is up
function purchasedGuard() {
  try {
    const fired = sessionStorage.getItem('checkout_purchase_fired');
    if (!fired) return;
    const order = JSON.parse(sessionStorage.getItem('checkout_order') || 'null');
    if (!order || !order.ts || Date.now() - order.ts > 6 * 3600 * 1000) return; // stale — don't block a genuine new order
    const banner = $('#already-purchased');
    if (!banner) return;
    apGuardActive = true;
    banner.hidden = false;
    $('#ap-view').href = successUrl(fired);
    $('#pay-btn').disabled = true;
    $('#express-section').hidden = true;
    const pp = $('#pm-paypal'); if (pp) pp.style.display = 'none';
    $('#ap-new').onclick = (e) => {
      e.preventDefault();
      apGuardActive = false;
      // A genuine second order must NOT reuse the already-paid PaymentIntent from
      // the first one — drop the cache and bump the idempotency generation.
      resetSubCache();
      sessionStorage.removeItem('checkout_purchase_fired');
      banner.hidden = true;
      $('#pay-btn').disabled = false;
      if (pp) pp.style.display = '';
      if (expressAvailable) $('#express-section').hidden = false;
      updatePayPalGate();
    };
  } catch (e) {}
}
// bfcache restores skip DOMContentLoaded — re-run the guard on every pageshow
window.addEventListener('pageshow', (e) => { if (e.persisted) purchasedGuard(); });

/* Config (publishable key, PayPal, pixel) ophalen uit Vercel, dan pas Stripe starten */
async function loadConfig() {
  try {
    const r = await fetch('/api/checkout-config', { cache: 'no-store' });
    const c = await r.json();
    CONFIG.STRIPE_PK = c.stripePk || '';
    CONFIG.STRIPE_PAYPAL = !!c.paypal;
    CONFIG.META_PIXEL_ID = c.pixelId || '';
    // PayPal-plannen = altijd met membership → niet voor een eenmalige aankoop (Magnesium Freeze)
    CONFIG.PAYPAL_CLIENT_ID = (CONFIG.NO_MEMBERSHIP || CONFIG.NO_PAYPAL_DIRECT) ? '' : (c.paypalClientId || '');
    CONFIG.BUMP_SPLIT = Number(c.bumpSplit) || 0; // A/B-test order bump (UrinaPatches): % dat de bump ziet
  } catch (e) { logClient('config', e && e.message, 'boot'); }
  if (CONFIG.STRIPE_PK && typeof Stripe !== 'undefined') stripe = Stripe(CONFIG.STRIPE_PK, { locale: IS_US ? 'en' : 'it' });
  if (CONFIG.META_PIXEL_ID) loadPixel(CONFIG.META_PIXEL_ID);
}
function loadPixel(id) {
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
  fbq('track', 'PageView');
}

/* ---------- Reserveringstimer: 7 minuten per bezoek (sessionStorage, dus verversen reset hem niet) ---------- */
function startTimer() {
  const clock = $('#jj-timer-clock'), box = $('#jj-timer');
  if (!clock || !box) return;
  const KEY = 'jj_timer_end', LEN = 7 * 60 * 1000;
  let end = 0;
  try { end = parseInt(sessionStorage.getItem(KEY) || '0', 10); } catch (e) {}
  if (!end || end < Date.now() - 30 * 60 * 1000 || (IS_US && end <= Date.now())) { /* US: afgelopen + opnieuw geladen → nieuwe 7 minuten */ end = Date.now() + LEN; try { sessionStorage.setItem(KEY, String(end)); } catch (e) {} }
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    if (left <= 0) {
      $('#jj-timer-text').innerHTML = L('Il tuo ordine è ancora riservato: <b>completa l’acquisto ora</b>', 'Your order is still reserved: <b>complete your purchase now</b>');
      box.classList.add('done');
      return;
    }
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    clock.textContent = (AB_VARIANT === 'b' ? String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

/* Variant C: de klant kiest de bundel op de checkout zelf (.offer met radio value=1/3/5). Wisselt pack/P zonder
   herladen; Stripe/PayPal lezen pack pas bij het betalen, het Google/Apple Pay-bedrag volgt via updateAmounts(). */
function setPack(k) {
  if (!PACKS[k]) return;
  pack = k; P = PACKS[k];
  $$('.offer').forEach(o => { const r = o.querySelector('input'); const on = !!r && r.value === k; o.classList.toggle('selected', on); if (r) r.checked = on; });
  try { const u = new URL(location.href); u.searchParams.set('b', k); history.replaceState(history.state, '', u.href); } catch (e) {}
  updateAmounts();
}

// A/B-test: één weergave per variant per sessie tellen (noemer voor de conversie)
function abView() {
  if (!AB_VARIANT) return;
  try {
    const k = 'jj_ab_view_' + AB_VARIANT;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch (e) {}
  try {
    fetch('/api/checkout/ab-view', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: AB_VARIANT }) }).catch(() => {});
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  startTimer();
  abView();
  await loadConfig();
  fillCountries($('#country'));
  fillCountries($('#bill-country'));
  updateRegionFields();
  $('#country').addEventListener('change', () => { updateRegionFields(); shipGate(); });
  initAddressAutocomplete();
  purchasedGuard();

  // Email "?" tooltip (Shopify-style)
  const helpBtn = $('#email-help'), helpTip = $('#email-tip');
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    helpTip.hidden = !helpTip.hidden;
    helpBtn.setAttribute('aria-expanded', String(!helpTip.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!helpTip.hidden && !helpTip.contains(e.target)) { helpTip.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpTip.hidden) { helpTip.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); }
  });
  ['address', 'city', 'zip'].forEach(id => $('#' + id).addEventListener('input', shipGate));
  $('#state').addEventListener('change', () => { $('#state').classList.remove('invalid'); $('#state').dataset.auto = ''; shipGate(); });
  // CAP getypt → provincie automatisch (alleen Italië, en niet als de klant zelf koos)
  $('#zip').addEventListener('input', () => {
    if (regionUsesSelect($('#country').value) && $('#country').value === 'IT') { autoSetProvince(provinceFromCap($('#zip').value)); shipGate(); }
  });
  $('#email').addEventListener('input', () => {
    $('#email').classList.remove('invalid');
    $('#email-msg').hidden = true;
  });
  initBump(); // order bump UrinaPatches (variant per bezoeker; mobiel boven het totaal, desktop via renderSummaries)
  renderSummaries();
  renderShipDates();
  initStripe();
  initPayPal();
  if (CONFIG.STRIPE_PAYPAL && stripe) { $('#pm-paypal').hidden = false; }

  // verzendverzekering
  const insCheck = $('#ins-check');
  if (insCheck) insCheck.addEventListener('change', () => { $('#ins-card').classList.toggle('checked', insCheck.checked); updateAmounts(); });

  // UrinaPatches: vertrouwensblok onder de bestelknop (mobiel) i.p.v. de kleine badges
  const tbm = trustBlock(true); const trow = $('#pay-btn') && $('#pay-btn').parentNode.querySelector('.trust-row:not(.trust-top)');
  if (tbm && trow) trow.replaceWith(tbm);

  // variant C: bundelkeuze op de checkout
  $$('.offer input').forEach(r => r.addEventListener('change', () => { if (r.checked) setPack(r.value); }));
  if ($('.offer')) $$('.offer').forEach(o => { const r = o.querySelector('input'); const on = !!r && r.value === pack; o.classList.toggle('selected', on); if (r) r.checked = on; });

  // shipping method radios
  $$('.ship-opt input').forEach(r => r.addEventListener('change', () => {
    shipMethod = r.value;
    $$('.ship-opt').forEach(o => o.classList.toggle('selected', o.contains(r)));
    updateAmounts();
  }));

  // Payment method toggles (Shopify-style radio rows)
  $('#pm-paypal-toggle').addEventListener('click', () => setPayPalSelected(true));
  $('#pm-cc-toggle').addEventListener('click', () => setPayPalSelected(false));

  // Add discount (mobile) — reveals the discount input
  $('#add-discount-btn').addEventListener('click', () => {
    const row = $('#form-discount');
    row.hidden = !row.hidden;
    if (!row.hidden) row.querySelector('input').focus();
  });

  // Pijltje bij het totaal: overzicht ter plekke open-/dichtklappen, zonder naar boven te springen
  // (variant A zonder #mt-summary: zoals vroeger de lade bovenaan openen)
  $('#mobile-total').addEventListener('click', () => {
    const box = $('#mt-summary');
    if (!box) {
      const drawer = $('.summary-mobile');
      drawer.open = !drawer.open;
      if (drawer.open) drawer.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    box.hidden = !box.hidden;
    $('#mobile-total').classList.toggle('open', !box.hidden);
  });

  // billing address toggle
  $('#bill-same').addEventListener('change', (e) => {
    $('#billing-fields').hidden = e.target.checked;
  });

  // Meta pixel — InitiateCheckout (browser + server CAPI, deduped by eventID)
  if (window.fbq) fbq('track', 'InitiateCheckout', {
    value: totalCents() / 100, currency: CUR.toUpperCase(),
    content_name: CONFIG.PRODUCT_NAME + ' ' + P.label,
    content_ids: CONTENT_IDS, content_type: 'product', num_items: 1,
  }, { eventID: IC_EVENT_ID });
  if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'InitiateCheckout', event_id: IC_EVENT_ID, value: totalCents() / 100, currency: CUR.toUpperCase() });

  $('#checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#pay-error').hidden = true;
    if (payPalSelected && CONFIG.PAYPAL_CLIENT_ID) return; // PayPal betaalt via de gele PayPal-knop
    if (!validateForm()) return;
    setBusy(true);
    // AddPaymentInfo: fires here on submit, when email + name + full address are
    // known — so its CAPI twin carries the strong match signals (unlike the
    // page-load InitiateCheckout). Shared AP_EVENT_ID dedupes browser + server.
    const _capiId = capiIdentity();
    if (window.fbq) fbq('track', 'AddPaymentInfo', {
      value: totalCents() / 100, currency: CUR.toUpperCase(),
      content_ids: CONTENT_IDS, content_type: 'product',
    }, { eventID: AP_EVENT_ID });
    if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'AddPaymentInfo', event_id: AP_EVENT_ID, value: totalCents() / 100, currency: CUR.toUpperCase(), ..._capiId });
    // Re-send InitiateCheckout with the SAME IC_EVENT_ID now that we have the
    // email/address — Meta merges the richer match keys onto the earlier event,
    // lifting IC match quality without creating a new conversion.
    if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'InitiateCheckout', event_id: IC_EVENT_ID, value: totalCents() / 100, currency: CUR.toUpperCase(), ..._capiId });
    try {
      const shipping = collectShipping();
      const billing = collectBilling(shipping);
      const email = $('#email').value.trim();
      const nameOnCard = $('#card-name').value.trim();

      const phone = shipping.phone;
      const billingDetails = {
        name: (payPalSelected ? '' : nameOnCard) || billing.name, email,
        phone: phone || undefined,
        address: {
          line1: billing.line1, line2: billing.line2 || undefined,
          city: billing.city, state: billing.state,
          postal_code: billing.postal_code, country: billing.country || ALLOWED_COUNTRIES[0],
        },
      };
      // Alleen op de 3DS-testlinks: eerst de PaymentMethod aanmaken → de server ziet het kaarttype
      // (debit/prepaid/credit) en vraagt bij debit/prepaid 3D Secure aan (zie create-subscription.js).
      let cardPm = null;
      if (TDS_VARIANT && !payPalSelected) {
        const r = await stripe.createPaymentMethod({ type: 'card', card: cardNumber, billing_details: billingDetails });
        if (r.error) { showPayError(r.error, 'card_pm'); return; }
        cardPm = r.paymentMethod;
      }
      const subCustomer = { email, name: shipping.name, phone, shipping, ...(cardPm ? { pm_id: cardPm.id, card_funding: (cardPm.card && cardPm.card.funding) || 'unknown' } : {}) };
      if (TDS_VARIANT) subCustomer.checkout_variant = '3ds';
      if (IS_NL) subCustomer.market = 'nl';
      if (IS_US) subCustomer.market = 'us';
      // NL/BE: Payment Element valideren vóór we het abonnement aanmaken (verplicht in deferred mode)
      if (IS_NL) { const r = await elementsPay.submit(); if (r && r.error) { showPayError(r.error, 'pe_submit'); return; } }
      const sub = await createSubscription(subCustomer);
      saveOrderForThankYou({ email });

      // NL/BE: iDEAL / Bancontact (redirect naar de bank, terug op de bedankpagina) of kaart (blijft op de pagina)
      if (IS_NL) {
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements: elementsPay, clientSecret: sub.clientSecret,
          confirmParams: { return_url: successUrl(sub.subscriptionId), payment_method_data: { billing_details: billingDetails } },
          redirect: 'if_required',
        });
        if (error) { showPayError(error, 'pe_confirm'); return; }
        try { sessionStorage.setItem('checkout_purchase_fired', sub.subscriptionId); } catch (e) {}
        location.href = successUrl(sub.subscriptionId);
        return;
      }

      // PayPal via Stripe → redirect naar PayPal en terug naar de bedankpagina
      if (payPalSelected) {
        const { error } = await stripe.confirmPayPalPayment(sub.clientSecret, {
          payment_method: { billing_details: billingDetails },
          return_url: successUrl(sub.subscriptionId),
        });
        if (error) showPayError(error, 'paypal_confirm');
        return;
      }

      const confirmData = {
        payment_method: cardPm ? cardPm.id : { card: cardNumber, billing_details: billingDetails },
        // 3DS: met een return_url kan Stripe terugvallen op een volledige redirect
        // (nodig in de Facebook/Instagram-browser) en komt de klant op de bedankpagina.
        return_url: successUrl(sub.subscriptionId),
      };
      let subId = sub.subscriptionId;
      let { error, paymentIntent } = await stripe.confirmCardPayment(sub.clientSecret, confirmData);
      // Een hergebruikte PaymentIntent kan verlopen zijn → één keer een nieuw abonnement
      if (error && error.code === 'payment_intent_unexpected_state') {
        resetSubCache();
        const fresh = await createSubscription(subCustomer);
        subId = fresh.subscriptionId;
        confirmData.return_url = successUrl(subId);
        ({ error, paymentIntent } = await stripe.confirmCardPayment(fresh.clientSecret, confirmData));
      }
      if (error) { showPayError(error, 'card_confirm'); return; }
      try { sessionStorage.setItem('checkout_purchase_fired', subId); } catch (e) {}
      location.href = successUrl(subId);
    } catch (err) {
      showError(err.message || T.generic);
      logClient('pay_exception', err && err.message, 'card_submit');
    }
  });
});

/* ---------- Abandoned checkout ----------------------------------------------
   1. E-mail ingevuld → /api/checkout/started → Klaviyo "Started Checkout"
      (flow: mail 1 na 5 min, mail 2 na 1 uur; stopt bij "Checkout Completed").
   2. Terug via de mail: ?email= vult het e-mailadres in, ?code= past de kortingscode toe,
      ?gift=1 toont duidelijk het "regalo segreto" (gratis e-book in de ledenomgeving).
   Tekst van de banner/regel: COPY_GIFT hieronder. Fouten blokkeren de checkout nooit. */
const COPY_GIFT = {
  name: 'Regalo segreto GRATIS',
  variant: 'E-book a sorpresa',
  value: 2995,          // centen, doorgestreept naast GRATIS
  free: 'GRATIS',
  timerMin: 10,         // korte countdown naast het cadeau (blijft doorlopen bij verversen)
  // Mail 2 (?bonus=1): blok "inclusi gratis" met 1 flacone in omaggio + het regalo segreto
  perksTitle: 'Inclusi gratis nel tuo ordine',
  bonusName: '1x Neurotone Drops',
  bonusVariant: 'In omaggio',
};
if (PRODUCT_KEY === 'lubrisense') { COPY_GIFT.value = 3495; COPY_GIFT.bonusName = '1x LubriSense'; }
if (PRODUCT_KEY === 'magnesium') { COPY_GIFT.value = 3495; COPY_GIFT.bonusName = '1x Magnesium Freeze'; }
if (PRODUCT_KEY === 'emorroidi') { COPY_GIFT.value = 2995; COPY_GIFT.bonusName = '1x Emorroidi Cerotti'; }
if (PRODUCT_KEY === 'urinapatches') { COPY_GIFT.value = 2995; COPY_GIFT.bonusName = '1x UrinaPatches'; }
if (PRODUCT_KEY === 'pumpkinseed') { COPY_GIFT.value = 2995; COPY_GIFT.bonusName = '1x Pumpkin Seed Drops'; }
if (PRODUCT_KEY === 'ceylon') { COPY_GIFT.value = 2999; COPY_GIFT.bonusName = '1x Cannella di Ceylon'; }
const GIFT = params.get('gift') === '1';
const BONUS = params.get('bonus') === '1'; // mail 2: 1 flacone in omaggio (+ regalo segreto)
const _sentEmails = new Set();
function sendStartedCheckout() {
  try {
    const em = ($('#email') && $('#email').value.trim().toLowerCase()) || '';
    if (!/^\S+@\S+\.\S+$/.test(em) || _sentEmails.has(em)) return;
    _sentEmails.add(em);
    fetch('/api/checkout/started', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ email: em, pack, product: PRODUCT_KEY, first_name: ($('#first-name') && $('#first-name').value.trim()) || '', track: attribution(), gift: GIFT, bonus: BONUS }),
    }).catch(() => {});
  } catch (e) {}
}
// Telefoonnummer → Klaviyo-profiel zodra de klant het veld verlaat (ook als er daarna niet betaald wordt).
// Geen zichtbare wijziging; alleen nummer + naam (api/checkout/phone.js), toestemmingen blijven ongemoeid.
const _sentPhones = new Set();
function sendCheckoutPhone() {
  try {
    const em = ($('#email') && $('#email').value.trim().toLowerCase()) || '';
    const ph = ($('#phone') && $('#phone').value.trim()) || '';
    const digits = ph.replace(/\D/g, '');
    if (!/^\S+@\S+\.\S+$/.test(em) || digits.length < 8) return;
    const key = em + '|' + digits;
    if (_sentPhones.has(key)) return;
    _sentPhones.add(key);
    const name = [($('#first-name') && $('#first-name').value.trim()) || '', ($('#last-name') && $('#last-name').value.trim()) || ''].filter(Boolean).join(' ');
    fetch('/api/checkout/phone', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ email: em, phone: ph, name, product: PRODUCT_KEY }),
    }).catch(() => {});
  } catch (e) {}
}
function showGift() {
  if (BONUS) return showPerks();
  if (!GIFT) return;
  if (!document.getElementById('jj-gift-style')) {
    const st = document.createElement('style');
    st.id = 'jj-gift-style';
    st.textContent = '.jj-gift-row{margin-top:14px}.jj-gift-thumb{width:64px;height:64px;border:1px solid var(--border);border-radius:var(--radius);background:#fdf3ec;display:flex;align-items:center;justify-content:center;font-size:30px}'
      + '.jj-gift-row .actual{color:#2d6b45;font-weight:700}.jj-gift-timer{display:inline-flex;align-items:center;gap:4px;margin-top:5px;background:#fdecea;color:#b3261e;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}';
    document.head.appendChild(st);
  }
  $$('.js-summary-slot').forEach(slot => {
    const prod = slot.querySelector('.prod-row');
    if (!prod || slot.querySelector('.jj-gift-row')) return;
    const row = document.createElement('div');
    row.className = 'prod-row jj-gift-row';
    row.innerHTML = '<div class="prod-thumb"><div class="jj-gift-thumb">🎁</div><span class="qty-badge">1</span></div>'
      + '<div class="prod-info"><div class="prod-name">' + COPY_GIFT.name + '</div><div class="prod-variant">' + COPY_GIFT.variant + '</div>'
      + '<div class="jj-gift-timer">⏱ <span class="jj-gift-clock">' + COPY_GIFT.timerMin + ':00</span></div></div>'
      + '<div class="prod-price"><span class="compare">' + money(COPY_GIFT.value) + '</span><span class="actual">' + COPY_GIFT.free + '</span></div>';
    prod.parentNode.insertBefore(row, prod.nextSibling);
  });
  startGiftTimer();
}
// Mail 2: een zacht omkaderd blok onder het product met beide omaggi
function showPerks() {
  if (!document.getElementById('jj-perks-style')) {
    const st = document.createElement('style');
    st.id = 'jj-perks-style';
    st.textContent = '.jj-perks{margin-top:14px;border:1px dashed #9cc7aa;background:#f3faf5;border-radius:12px;padding:10px 12px 12px}'
      + '.jj-perks-h{font-size:11.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#2d6b45;margin:0 0 8px}'
      + '.jj-perk{display:flex;align-items:center;gap:12px}.jj-perk+.jj-perk{margin-top:10px}'
      + '.jj-perk .pt{width:46px;height:46px;flex:none;border-radius:9px;border:1px solid #dfe9e2;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}'
      + '.jj-perk .pt img{width:100%;height:100%;object-fit:cover}'
      + '.jj-perk .pi{flex:1;min-width:0}.jj-perk .pn{font-size:13.5px;font-weight:600;color:#1a1a1a}.jj-perk .pv{font-size:12px;color:#5b6b60;margin-top:1px}'
      + '.jj-perk .pp{text-align:right;white-space:nowrap}.jj-perk .pp s{display:block;font-size:11.5px;color:#8a948d}.jj-perk .pp b{font-size:13px;color:#2d6b45}'
      + '.jj-perk .tm{display:inline-block;margin-left:6px;background:#fdecea;color:#b3261e;border-radius:999px;padding:0 7px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}';
    document.head.appendChild(st);
  }
  const p1 = PACKS[1] || P;
  $$('.js-summary-slot').forEach(slot => {
    const prod = slot.querySelector('.prod-row');
    if (!prod || slot.querySelector('.jj-perks')) return;
    const box = document.createElement('div');
    box.className = 'jj-perks';
    box.innerHTML = '<div class="jj-perks-h">' + COPY_GIFT.perksTitle + '</div>'
      + '<div class="jj-perk"><div class="pt"><img src="' + p1.img + '" alt=""></div><div class="pi"><div class="pn">' + COPY_GIFT.bonusName + '</div><div class="pv">' + COPY_GIFT.bonusVariant + '</div></div>'
      + '<div class="pp"><s>' + money(p1.compare) + '</s><b>' + COPY_GIFT.free + '</b></div></div>'
      + (GIFT ? '<div class="jj-perk"><div class="pt">🎁</div><div class="pi"><div class="pn">' + COPY_GIFT.name + '</div><div class="pv">' + COPY_GIFT.variant + '<span class="tm">⏱ <span class="jj-gift-clock">' + COPY_GIFT.timerMin + ':00</span></span></div></div>'
      + '<div class="pp"><s>' + money(COPY_GIFT.value) + '</s><b>' + COPY_GIFT.free + '</b></div></div>' : '');
    prod.parentNode.insertBefore(box, prod.nextSibling);
  });
  if (GIFT) startGiftTimer();
}
function startGiftTimer() {
  let end = 0;
  try { end = Number(localStorage.getItem('jj_gift_end')) || 0; } catch (e) {}
  if (!end || end < Date.now() - 3600000) {
    end = Date.now() + COPY_GIFT.timerMin * 60000;
    try { localStorage.setItem('jj_gift_end', String(end)); } catch (e) {}
  }
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    const txt = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    $$('.jj-gift-clock').forEach(el => { el.textContent = txt; });
    if (!left) clearInterval(iv);
  };
  const iv = setInterval(tick, 1000);
  tick();
}
// Productteksten in de pagina (naam membership in de voorwaarden, alt-teksten, links met ?p=)
document.addEventListener('DOMContentLoaded', () => {
  try {
    $$('.js-membership-name').forEach(el => { el.textContent = CONFIG.MEMBERSHIP_NAME; });
    $$('img[alt="NeuroTone"]').forEach(el => { el.alt = CONFIG.PRODUCT_NAME; });
    // Geen membership (Magnesium Freeze): abonnementstekst onderaan weg → alleen de algemene voorwaarden van de winkel
    if (CONFIG.NO_MEMBERSHIP) {
      $$('.sub-terms').forEach(el => {
        el.innerHTML = 'Cliccando su «' + PAY_LABEL + '» accetto i '
          + '<a href="https://www.getjustjenny.com/policies/terms-of-service" target="_blank" rel="noopener">Termini e condizioni</a> '
          + 'e l’<a href="https://www.getjustjenny.com/policies/privacy-policy" target="_blank" rel="noopener">Informativa sulla privacy</a>. '
          + 'Pagamento unico: nessun abbonamento e nessun addebito successivo.';
      });
    }
    // Refill-product (Sage Leaf): duidelijke abonnementsvermelding boven de knop + eigen voorwaardentekst
    if (CONFIG.REFILL) {
      $$('.sub-terms').forEach(el => {
        el.innerHTML = 'By clicking “' + PAY_LABEL + ',” you agree to Just Jenny\'s '
          + '<a href="/checkout/terms#refill" target="_blank" rel="noopener">Terms of Sale</a> and '
          + '<a href="https://www.getjustjenny.com/policies/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>. '
          + 'You will be enrolled in a subscription and billed on a recurring basis at the price and frequency shown in the order summary above '
          + '(<span class="js-renewal-amt"></span> every <span class="js-cycle-days"></span> days, starting <span class="js-cycle-days"></span> days from today). '
          + 'You can cancel anytime before your next billing date by emailing hello@justjennybeauty.com';
      });
      const btn = document.getElementById('pay-btn');
      $$('.js-renewal-amt').forEach(el => { el.textContent = money(renewalCents()); });
      $$('.js-cycle-days').forEach(el => { el.textContent = CONFIG.CYCLE_DAYS; });
      // Sage Leaf: groen merk i.p.v. het oranje van Pumpkin Seed Oil (en.html)
      const st = document.createElement('style');
      st.textContent = ':root{--accent:#2F5A45;--accent-dark:#244C3A;--selected-fill:#EEF5F1;--jj-brand:#2F5A45}body.pay-dark .pay-btn,.pay-btn{background:#2F5A45}body.pay-dark .pay-btn:hover,.pay-btn:hover{background:#244C3A}.trust-row .trust-item{background:#EEF5F1;border-color:#DCE9E1}.trust-row svg{stroke:#2F5A45!important}';
      document.head.appendChild(st);
      // Header: logo + groene klantenbalk + drie zekerheden; timer in rustige stijl
      st.textContent += '.jh{padding:10px 16px 9px;text-align:center}.jh .jh-logo{display:none!important}'
        + '.jh-join{max-width:520px;margin:0 auto 8px;padding:8px 14px;border-radius:9px;background:linear-gradient(90deg,#1F4534,#2F5A45 55%,#4C8A6B);color:#fff;font-weight:800;font-size:13.5px;letter-spacing:.02em;text-transform:uppercase;line-height:1.2}'
        + '.jh .jh-ben{display:flex;justify-content:center;align-items:center;gap:0;flex-wrap:nowrap;font-size:13px;color:#111;margin-top:0}.jh .jh-ben span{display:inline-flex;align-items:center;gap:5px;padding:0 10px;white-space:nowrap}.jh .jh-ben svg{width:17px;height:17px;flex:none}.jh .jh-ben i{display:block;width:1.5px;height:18px;background:#2F5A45;flex:none}'
        + '@media(max-width:640px){.jh{padding:9px 10px 8px}.jh .jh-logo{height:17px;margin-bottom:7px}.jh-join{font-size:11.5px;padding:7px 8px;border-radius:8px;margin-bottom:7px}#jj-timer.jj-timer{padding:11px 10px!important;gap:6px!important;white-space:nowrap;justify-content:center}#jj-timer.jj-timer,#jj-timer.jj-timer *{font-size:min(12.5px,2.9vw)!important;letter-spacing:-.01em}#jj-timer.jj-timer svg{width:15px!important;height:15px!important}.jh .jh-ben{font-size:10.5px}.jh .jh-ben span{padding:0 5px;gap:3px}.jh .jh-ben svg{width:14px;height:14px}.jh .jh-ben i{height:16px;width:1.5px}}'
        + '.sg-trust{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:18px}.sg-trust li{display:flex;gap:14px;align-items:flex-start}.sg-trust svg{width:38px;height:38px;flex:none}.sg-trust b{display:block;font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:3px}.sg-trust span{font-size:14px;line-height:1.45;color:#444}.sg-every{font-size:13px;color:#444;margin-top:2px}'
        + '.trust-row{display:none!important}.sg-trust-h{display:none}@media(max-width:999px){.sg-trust-h{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0 14px;padding:0;list-style:none}.sg-trust-h li{text-align:center;font-size:10.5px;font-weight:700;line-height:1.2;color:#1a1a1a}.sg-trust-h svg{width:25px;height:25px;display:block;margin:0 auto 3px}}'
        + '#jj-timer.jj-timer{background:#FAECEA;border:1px solid #F3D9D5;border-radius:12px;color:#5A2A22;font-weight:400;padding:16px 18px;display:flex;align-items:center;gap:12px}#jj-timer.jj-timer *{color:#5A2A22;font-weight:400}#jj-timer.jj-timer svg{width:22px;height:22px;flex:none}';
      const jh = document.querySelector('header.jh'), ben = jh && jh.querySelector('.jh-ben');
      if (ben && !jh.querySelector('.jh-join')) {
        const j = document.createElement('div'); j.className = 'jh-join'; j.textContent = 'Join over 10,000+ happy customers';
        jh.insertBefore(j, ben);
        const I = {
          g: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-8.5 6" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/><path d="M2.6 4.2l.9 5 4.9-1.2" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="16.2" text-anchor="middle" font-size="10.5" font-weight="800" fill="#111" font-family="Arial">$</text></svg>',
          s: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#111" d="M1 6h13v10H1zM15 9h4l4 4v3h-8z"/><circle cx="6" cy="17.5" r="2.4" fill="#111" stroke="#fff" stroke-width="1.2"/><circle cx="18" cy="17.5" r="2.4" fill="#111" stroke="#fff" stroke-width="1.2"/></svg>',
          c: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#111" d="M12 2l8 3v6c0 5-3.4 9.2-8 11-4.6-1.8-8-6-8-11V5z"/><path d="M8.2 12l2.7 2.6 4.9-5.1" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        };
        ben.innerHTML = '<span>' + I.g + '90-Day Guarantee</span><i></i><span>' + I.s + 'Fast US Shipping</span><i></i><span>' + I.c + 'Secure Checkout</span>';
      }
      // Vertrouwensblok: rechts onder de kortingscode/totalen (desktop) en horizontaal vlak boven de knop (mobiel)
      const TI = [
        ['<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#2F5A45" d="M20 3l14 5v10c0 9-6 16-14 19C12 34 6 27 6 18V8z"/><path d="M13 19l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', '90-Day Money Back Guarantee', 'Feel the difference within 90 days or we\'ll make it right.'],
        ['<svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#2F5A45" d="M3 11h20v16H3zM24 16h7l6 6v5H24z"/><circle cx="11" cy="29" r="4" fill="#2F5A45" stroke="#f4f4f4" stroke-width="2"/><circle cx="30" cy="29" r="4" fill="#2F5A45" stroke="#f4f4f4" stroke-width="2"/></svg>', 'Free shipping', 'Free standard shipping on your order.'],
        ['<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="13" r="6" fill="#2F5A45"/><path fill="#2F5A45" d="M8 33c0-7 5-11 12-11s12 4 12 11z"/><circle cx="7.5" cy="16" r="4" fill="#2F5A45"/><circle cx="32.5" cy="16" r="4" fill="#2F5A45"/><path fill="#2F5A45" d="M0 31c0-5 3-8 7-8 1 0 2 .2 3 .6C7.500 26 6.500 28.500 6.200 31zM40 31c0-5-3-8-7-8-1 0-2 .2-3 .6 2.500 2.400 3.500 4.900 3.800 7.400z"/></svg>', '10,000+ happy customers', 'Customers around the world have enjoyed our products that are continuously improved based on community feedback.'],
      ];
      const vHtml = '<ul class="sg-trust">' + TI.map(t => '<li>' + t[0] + '<div><b>' + t[1] + '</b><span>' + t[2] + '</span></div></li>').join('') + '</ul>';
      const fixSummary = (root) => {
        const stl = root.querySelector('.sum-trust'); if (stl) stl.outerHTML = vHtml;
        const tt = root.querySelector('.t-total');
        if (tt && !root.querySelector('.js-ins-line')) tt.insertAdjacentHTML('beforebegin', '<div class="t-row js-ins-line" hidden><span>Shipping Insurance</span><span class="js-ins-amt"></span></div>');
      };
      const tplS = document.getElementById('summary-template'); if (tplS) fixSummary(tplS.content);
      $$('.js-summary-slot').forEach(fixSummary);
      const rn = document.getElementById('refill-note') || btn;
      if (rn && !document.querySelector('.sg-trust-h')) rn.insertAdjacentHTML('beforebegin', '<ul class="sg-trust-h">' + TI.map(t => '<li>' + t[0] + t[1] + '</li>').join('') + '</ul>');
      // Shipping Insurance ($2.95) onder de verzendmethode — standaard aangevinkt voor elke klant
      const shipSec = document.getElementById('ship-options') && document.getElementById('ship-options').parentNode;
      if (shipSec && !document.getElementById('ins-check')) {
        st.textContent += '.sg-ins-h{margin:22px 0 10px}.sg-ins{display:flex;align-items:center;gap:16px;padding:16px 18px;border:1.5px dashed #c9cfcc;border-radius:10px;cursor:pointer;background:#fff}.sg-ins svg{width:40px;height:40px;flex:none}.sg-ins .t{flex:1;min-width:0}.sg-ins b{display:block;font-size:16px;color:#1a1a1a;margin-bottom:3px}.sg-ins span.d{display:block;font-size:14px;line-height:1.4;color:#555}.sg-ins input{width:22px;height:22px;flex:none;accent-color:#2F5A45;cursor:pointer}@media(max-width:640px){.sg-ins{gap:11px;padding:13px 12px}.sg-ins svg{width:32px;height:32px}.sg-ins b{font-size:15px}.sg-ins span.d{font-size:13px}}';
        shipSec.insertAdjacentHTML('beforeend', '<h2 class="h2-sm sg-ins-h">Shipping Insurance</h2><label class="sg-ins" id="ins-card"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4l13 5v9c0 8.5-5.5 15-13 18-7.5-3-13-9.5-13-18V9z" fill="none" stroke="#2F5A45" stroke-width="2.4" stroke-linejoin="round"/><path d="M13.5 20l4.7 4.6 8.5-9" fill="none" stroke="#2F5A45" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="t"><b>Shipping Insurance</b><span class="d">Protect your order against theft, loss or damage for just ' + money(INS_PRICE) + '</span></span><input type="checkbox" id="ins-check" name="insurance" value="1" checked></label>');
        const ic = document.getElementById('ins-check');
        ic.addEventListener('change', () => updateAmounts());
        setTimeout(updateAmounts, 0);
      }
      const tb = document.getElementById('jj-timer');
      if (tb) {
        const sv = tb.querySelector('svg');
        if (sv) sv.outerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#5A2A22" stroke-width="1.6"/><path d="M12 11v6" stroke="#5A2A22" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.1" fill="#5A2A22"/></svg>';
        const tt = document.getElementById('jj-timer-text');
        if (tt && tt.firstChild && tt.firstChild.nodeType === 3) tt.firstChild.nodeValue = tt.firstChild.nodeValue.replace('demand,', 'demand'); // klok-element blijft staan (timer loopt door)
      }
      $$('[stroke="#C9643A"]').forEach(el => el.setAttribute('stroke', '#2F5A45'));
      $$('[fill="#C9643A"]').forEach(el => el.setAttribute('fill', '#2F5A45'));
    }
    if (PRODUCT_KEY !== 'neurotone') {
      document.title = 'Checkout — ' + CONFIG.PRODUCT_NAME + ' — Just Jenny';
      // LubriSense/Emorroidi: eigen voorwaarden; de NeuroTone-membershippagina past niet (opzeggen staat in de voorwaarden).
      // Magnesium Freeze heeft (voorlopig) de NeuroTone-membership → gewoon de NeuroTone-pagina's.
      if (PRODUCT_KEY === 'lubrisense' || PRODUCT_KEY === 'emorroidi' || PRODUCT_KEY === 'urinapatches' || PRODUCT_KEY === 'pumpkinseed' || PRODUCT_KEY === 'ceylon') {
        $$('a[href^="/checkout/termini"]').forEach(a => { a.href = '/checkout/termini?p=' + PRODUCT_KEY; });
        $$('a[href^="/checkout/membership"]').forEach(a => { a.href = '/checkout/termini?p=' + PRODUCT_KEY + '#membership'; });
      }
      // LubriSense: eigen klantfoto's (vrouwen) in de header; ontbreekt een foto, dan blijft de letter staan
      if (PRODUCT_KEY === 'lubrisense') $$('.jh-av img').forEach((img, i) => { img.src = '/checkout/assets/avatar-lub' + (i + 1) + '.jpg?v=1'; });
      // Cannella di Ceylon: geen '40.000+ clienti'-pil in de header (alleen logo + voordelen)
      if (PRODUCT_KEY === 'ceylon') $$('.jh-pill').forEach(el => el.remove());
    }
  } catch (e) { logClient('product_init', e && e.message, 'product'); }
});
document.addEventListener('DOMContentLoaded', () => {
  try {
    const em = $('#email');
    const preEmail = (params.get('email') || '').trim();
    if (em && preEmail && !em.value) em.value = preEmail;
    if (em) {
      em.addEventListener('change', sendStartedCheckout);
      em.addEventListener('blur', sendStartedCheckout);
      em.addEventListener('blur', sendCheckoutPhone); // telefoon al ingevuld vóór het e-mailadres
    }
    const phoneEl = $('#phone');
    if (phoneEl) {
      phoneEl.addEventListener('change', sendCheckoutPhone);
      phoneEl.addEventListener('blur', sendCheckoutPhone);
    }
    // Terug via mail 2: cadeau onthouden voor dit e-mailadres (ook als het al ingevuld was)
    if ((GIFT || BONUS) && em && em.value) sendStartedCheckout();
    // Het overzicht (prijzen, kortingsveld) wordt asynchroon opgebouwd: wachten tot het er staat
    const t1 = Date.now();
    const wait = setInterval(() => {
      if (!$$('.js-summary-slot .totals').length && Date.now() - t1 < 10000) return;
      clearInterval(wait);
      showGift();
      applyLinkCode();
    }, 150);
  } catch (e) { logClient('abandon_init', e && e.message, 'abandon'); }
});
function applyLinkCode() {
  try {
    // Kortingscode uit de link automatisch toepassen
    const code = (params.get('code') || '').trim();
    if (code) {
      const inputs = $$('.js-discount-input');
      inputs.forEach(i => { i.value = code; });
      const btn = inputs.length ? inputs[inputs.length - 1].closest('.discount-row').querySelector('.js-apply') : null;
      if (btn) {
        btn.classList.add('active');
        btn.click();
      }
    }
  } catch (e) { logClient('abandon_code', e && e.message, 'abandon'); }
}
