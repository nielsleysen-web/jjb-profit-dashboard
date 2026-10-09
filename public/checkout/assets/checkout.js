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
const PRODUCT_KEY = (/lubrisense/i.test(location.pathname) || _pq === 'lubrisense') ? 'lubrisense'
  : (/magnesium/i.test(location.pathname) || _pq === 'magnesium') ? 'magnesium' : 'neurotone';
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
};
CONFIG.MEMBERSHIP_NAME = 'Just Jenny Health For Life Membership';
Object.assign(CONFIG, PRODUCT_CONFIG[PRODUCT_KEY] || {});
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
const PACKS = PRODUCT_KEY === 'lubrisense' ? PACKS_LUBRISENSE : PRODUCT_KEY === 'magnesium' ? PACKS_MAGNESIUM : PACKS_NEUROTONE;
// Verzendopties — moeten gelijk zijn aan SHIPPING in lib/checkout.js
const SHIP = {
  free:    { cents: 0,   title: 'Standard (5-8 giorni lavorativi)' },
  insured: { cents: 395, title: 'Express (3-5 giorni lavorativi)' },
};
const PROVINCES = { AG:'Agrigento',AL:'Alessandria',AN:'Ancona',AO:'Aosta',AR:'Arezzo',AP:'Ascoli Piceno',AT:'Asti',AV:'Avellino',BA:'Bari',BT:'Barletta-Andria-Trani',BL:'Belluno',BN:'Benevento',BG:'Bergamo',BI:'Biella',BO:'Bologna',BZ:'Bolzano',BS:'Brescia',BR:'Brindisi',CA:'Cagliari',CL:'Caltanissetta',CB:'Campobasso',CE:'Caserta',CT:'Catania',CZ:'Catanzaro',CH:'Chieti',CO:'Como',CS:'Cosenza',CR:'Cremona',KR:'Crotone',CN:'Cuneo',EN:'Enna',FM:'Fermo',FE:'Ferrara',FI:'Firenze',FG:'Foggia',FC:'Forlì-Cesena',FR:'Frosinone',GE:'Genova',GO:'Gorizia',GR:'Grosseto',IM:'Imperia',IS:'Isernia',SP:'La Spezia',AQ:"L'Aquila",LT:'Latina',LE:'Lecce',LC:'Lecco',LI:'Livorno',LO:'Lodi',LU:'Lucca',MC:'Macerata',MN:'Mantova',MS:'Massa-Carrara',MT:'Matera',ME:'Messina',MI:'Milano',MO:'Modena',MB:'Monza e Brianza',NA:'Napoli',NO:'Novara',NU:'Nuoro',OR:'Oristano',PD:'Padova',PA:'Palermo',PR:'Parma',PV:'Pavia',PG:'Perugia',PU:'Pesaro e Urbino',PE:'Pescara',PC:'Piacenza',PI:'Pisa',PT:'Pistoia',PN:'Pordenone',PZ:'Potenza',PO:'Prato',RG:'Ragusa',RA:'Ravenna',RC:'Reggio Calabria',RE:'Reggio Emilia',RI:'Rieti',RN:'Rimini',RM:'Roma',RO:'Rovigo',SA:'Salerno',SS:'Sassari',SV:'Savona',SI:'Siena',SR:'Siracusa',SO:'Sondrio',SU:'Sud Sardegna',TA:'Taranto',TE:'Teramo',TR:'Terni',TO:'Torino',TP:'Trapani',TN:'Trento',TV:'Treviso',TS:'Trieste',UD:'Udine',VA:'Varese',VE:'Venezia',VB:'Verbano-Cusio-Ossola',VC:'Vercelli',VR:'Verona',VV:'Vibo Valentia',VI:'Vicenza',VT:'Viterbo' };
const COUNTRIES = { IT: 'Italia' };
const ALLOWED_COUNTRIES = Object.keys(COUNTRIES);
// Tracking-parameters van jjb-track.js (salespagina → checkout-link) → Stripe-metadata → Shopify-order
const TRACK_KEYS = ['ad_id','adset_id','campaign_id','fbclid','fbc','fbp','vid','utm_source','utm_campaign','utm_content','first_touch','host','path','pgs'];

/* Bundel uit de URL: /checkout?b=3 (of ?pack=3), standaard 3. */
const PLANS = CONFIG.PAYPAL_PLANS;
const params = new URLSearchParams(location.search);
const _pk = params.get('b') || params.get('pack') || params.get('bundle');
const pack = PACKS[_pk] ? _pk : '3';
const P = PACKS[pack];

// InitiateCheckout fires ONCE, from the DOMContentLoaded handler below, with a
// dedup eventID + matching server CAPI event. (A second, un-deduped IC used to
// fire here on page parse — removed: it double-counted IC and muddied the signal
// sent to Meta's optimizer.)

let shipMethod = 'insured'; // standaard: Express 3,95 €
let promo = null; // { code, percent_off, amount_off, duration }

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const money = (c) => (c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function shipCents() { return (SHIP[shipMethod] || SHIP.free).cents; }
// Stripe applies subscription-level discounts to the WHOLE first invoice,
// including the one-time express-shipping item — mirror that here.
function discountCents() {
  if (!promo) return 0;
  const base = P.amount + shipCents();
  if (promo.amount_off) return Math.min(promo.amount_off, base);
  if (promo.percent_off) return Math.round(base * promo.percent_off / 100);
  return 0;
}
function totalCents() { return P.amount + shipCents() - discountCents(); }
// Wat de membership daarna kost: vol bedrag, tenzij de kortingscode "forever" geldt
function renewalCents() {
  const M = CONFIG.MEMBERSHIP_CENTS;
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
  const row = document.createElement('div');
  row.className = 'jj-bgift';
  row.innerHTML = '<span class="jj-bgift-ic">' + GIFT_ICON + '</span>'
    + '<span class="jj-bgift-tx"><span class="jj-bgift-n">' + BUNDLE_GIFT_COPY.name + '</span><br><span class="jj-bgift-s">' + BUNDLE_GIFT_COPY.sub + '</span></span>'
    + '<span class="jj-bgift-p">' + BUNDLE_GIFT_COPY.free + '</span>';
  prod.parentNode.insertBefore(row, prod.nextSibling);
}

/* ---------- Render order summary into both slots ---------- */
function renderSummaries() {
  const tpl = $('#summary-template');
  $$('.js-summary-slot').forEach(slot => {
    slot.innerHTML = '';
    slot.appendChild(tpl.content.cloneNode(true));
    slot.querySelectorAll('.prod-name').forEach(el => { el.textContent = CONFIG.PRODUCT_NAME; });
    if (P.gift) addBundleGift(slot);
  });
  wireDiscountInputs();
  updateAmounts();
}

function updateAmounts() {
  $$('.prod-thumb img, .mobile-total img').forEach(el => { el.src = P.img; el.alt = CONFIG.PRODUCT_NAME; });
  $$('.js-pack-label').forEach(el => el.textContent = P.label);
  const hasCompare = P.compare > P.amount;
  $$('.js-compare').forEach(el => { el.textContent = hasCompare ? money(P.compare) : ''; el.hidden = !hasCompare; });
  $$('.js-price').forEach(el => el.textContent = money(P.amount));
  $$('.js-save').forEach(el => { el.textContent = hasCompare ? `Risparmi ${money(P.save)} (${P.savePct}%)` : ''; el.hidden = !hasCompare; });
  $$('.js-subtotal').forEach(el => el.textContent = money(P.amount));
  $$('.js-shipping').forEach(el => {
    if (!addrComplete()) {
      el.textContent = 'Inserisci l’indirizzo';
      el.classList.add('t-muted');
    } else {
      el.textContent = shipCents() ? money(shipCents()) : 'GRATIS';
      el.classList.remove('t-muted');
    }
  });
  $$('.js-total').forEach(el => el.textContent = money(totalCents()));
  // Disclosure shows the RECURRING amount, not today's total — a one-off promo or
  // express shipping changes the first charge but not what rebills every 28 days.
  $$('.js-renewal-amt').forEach(el => el.textContent = money(renewalCents()));
  $$('.js-cycle-days').forEach(el => el.textContent = CONFIG.CYCLE_DAYS);
  $$('.js-trial-days').forEach(el => el.textContent = CONFIG.TRIAL_DAYS);
  $$('.js-cycle-per-year').forEach(el => el.textContent = Math.floor(365 / CONFIG.CYCLE_DAYS));
  $$('.js-discount-line').forEach(el => el.hidden = !promo);
  if (promo) {
    $$('.js-discount-label').forEach(el => el.textContent = `Sconto (${promo.code})`);
    $$('.js-discount-amt').forEach(el => el.textContent = '-' + money(discountCents()));
  }
  if (elementsExpress) elementsExpress.update({ amount: totalCents() });
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
          msg.textContent = 'Sconto applicato.';
          msg.className = 'discount-msg ok';
        } else {
          promo = null;
          msg.textContent = 'Inserisci un codice sconto valido.';
          msg.className = 'discount-msg err';
        }
      } catch {
        msg.textContent = 'Impossibile verificare il codice, riprova.';
        msg.className = 'discount-msg err';
      }
      msg.hidden = false;
      btn.disabled = false; btn.textContent = 'Applica';
      updateAmounts();
    });
  });
}

/* ---------- Country / region fields ---------- */
function fillCountries(sel) {
  sel.innerHTML = Object.entries(COUNTRIES)
    .map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
  sel.value = 'IT';
}
function regionUsesSelect(country) { return country === 'IT'; }

/* Countries whose carriers reject a label with no state/province. US and CA pick
   from a dropdown; AU types into #state-free, which used to go unvalidated — the
   old gate only required a region when a <select> was on screen, so every
   non-US/CA order could be submitted with an empty state. */
const REGION_REQUIRED = new Set(['IT']);
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
  return true;
}

/* The gate above tolerates a space in a US ZIP+4 because people type it that way;
   USPS wants it hyphenated, so canonicalise here rather than storing "90210 1234"
   and handing the label software the same ambiguity we just set out to remove. */
function normalizeZip(zip, country) {
  const z = String(zip || '').trim();
  return z.replace(/\s+/g, '');
}
function updateRegionFields() {
  const country = $('#country').value;
  const useSelect = regionUsesSelect(country);
  $('#state-select-wrap').hidden = !useSelect;
  $('#state-text-wrap').hidden = useSelect;
  if (useSelect) {
    const list = PROVINCES;
    // No pre-selected default: a silent WA/ON default was being submitted verbatim
    // by anyone who typed their address by hand — wrong-state shipments on PAID
    // orders. Empty placeholder + required validation instead.
    $('#state').innerHTML = '<option value="" disabled selected>Seleziona…</option>' +
      Object.entries(list).map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
    $('#state-label').textContent = 'Provincia';
  } else {
    // AU now requires a region, so the free-text field must stop advertising
    // itself as optional for the countries that gate on it.
    $('#state-free-label').textContent = REGION_REQUIRED.has(country)
      ? 'State/Province' : 'State/Province (optional)';
  }
  $('#zip-label').textContent = 'CAP';
}
function stateCodeFromName(country, name) {
  if (!name) return '';
  const list = country === 'IT' ? PROVINCES : null;
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
  if (!code || !sel || !PROVINCES[code]) return;
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
        const r = await fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=8&lat=42.5&lon=12.5&lang=default');
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
              state: pr.county || pr.state || '',
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
              const code = stateCodeFromName(country2, it.state) || stateCodeFromName(country2, it.city) || provinceFromCap($('#zip').value);
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
  const fmt = (d) => d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
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
  // PayPal: de gele PayPal-knop in de rij vervangt de gewone bestelknop
  $('#pay-btn').hidden = on && !!CONFIG.PAYPAL_CLIENT_ID;
  if (!CONFIG.PAYPAL_CLIENT_ID) $('#pay-btn-text').textContent = on ? 'Paga con PayPal' : PAY_LABEL;
}

const IS_MOBILE = matchMedia('(max-width: 999px)').matches;
const BASE_FONT = IS_MOBILE ? '16px' : '14px';
const appearance = {
  labels: 'floating',
  variables: {
    colorPrimary: '#2c6e65',
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
    '.Input:focus': { borderColor: '#2c6e65', boxShadow: '0 0 0 1px #2c6e65' },
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
    showError(CONFIG.STRIPE_PK ? 'Impossibile caricare il pagamento. Ricarica la pagina o prova con un altro browser.'
      : 'Il pagamento sarà disponibile a breve.');
    $('#pay-btn').disabled = true;
    return;
  }
  // Express checkout gets its own deferred group with Link enabled
  // (the card form below uses classic split elements — no Link UI).
  elementsExpress = stripe.elements({
    mode: 'subscription',
    amount: totalCents(),
    currency: 'eur',
    setupFutureUsage: 'off_session',
    paymentMethodTypes: CONFIG.STRIPE_PAYPAL ? ['card', 'link', 'paypal'] : ['card', 'link'],
    appearance,
    locale: 'it',
  });

  // Split card elements inside our own Shopify-style markup
  const elementsCard = stripe.elements({ locale: 'it' });
  cardNumber = elementsCard.create('cardNumber', { style: cardStyle, placeholder: 'Numero della carta', showIcon: false });
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


  // Snelle knoppen bovenaan: PayPal + Google Pay (+ Apple Pay op iPhone/Safari), naast elkaar
  const expressCheckout = elementsExpress.create('expressCheckout', {
    buttonHeight: 48,
    layout: { maxColumns: 3, maxRows: 1, overflow: 'auto' },
    buttonTheme: { paypal: 'gold', googlePay: 'black', applePay: 'black' },
    paymentMethods: { paypal: 'auto', googlePay: 'always', applePay: 'always', link: 'never', amazonPay: 'never', klarna: 'never' },
  });
  expressCheckout.mount('#express-checkout-element');
  expressCheckout.on('ready', (e) => {
    if (!e.availablePaymentMethods) $('#express-checkout-element').style.display = 'none';
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
      country: ship.address.country || 'IT',
      country_name: COUNTRIES[ship.address.country] || ship.address.country || 'Italia',
    } : null;
    try {
      const { error: submitError } = await elementsExpress.submit();
      if (submitError) { showError(submitError.message); return; }
      const { clientSecret, amount, subscriptionId } = await createSubscription({ email, name, phone, shipping: flatShipping });
      if (amount && amount !== totalCents()) elementsExpress.update({ amount });
      saveOrderForThankYou({ email, name, shipping: flatShipping, wallet: true });
      const { error } = await stripe.confirmPayment({
        elements: elementsExpress, clientSecret,
        confirmParams: { return_url: successUrl(subscriptionId) },
      });
      if (error) { showPayError(error, 'wallet_confirm'); }
    } catch (err) {
      showError(err.message || 'Qualcosa è andato storto, riprova.');
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
        + '&vault=true&intent=subscription&currency=EUR&locale=it_IT&disable-funding=credit,card';
  s.onload = () => {
    if (!window.paypal) return;
    const makeConfig = (inline) => ({
      fundingSource: window.paypal.FUNDING.PAYPAL,
      style: { shape: 'rect', height: 48, label: 'paypal', tagline: false, color: 'gold' },
      // Onderaan (in het formulier): eerst naam + adres invullen, zodat het juiste adres naar Shopify gaat.
      // Bovenaan (snelle knop): mag zonder formulier — dan nemen we het adres uit PayPal.
      onClick: (data, actions) => {
        if (promo) { showError('I codici sconto sono disponibili con il pagamento con carta.'); return actions.reject(); }
        if (!inline || paypalSubscriber()) return actions.resolve();
        showError('Inserisci nome e indirizzo di spedizione prima di pagare con PayPal.');
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
            pack, product: PRODUCT_KEY, ship_method: shipMethod, track: attribution(),
            email: $('#email').value.trim(), name: sh ? sh.name : '', shipping: sh,
          }),
        });
        const d = await r.json();
        if (!r.ok || !d.id) { showError(d.error || 'PayPal non è riuscito ad avviare l’ordine: riprova oppure paga con carta.'); throw new Error('paypal create'); }
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
      onError: (err) => { showError('PayPal non è riuscito ad avviare l’ordine: riprova oppure paga con carta.'); logClient('paypal_error', err && err.message, 'paypal'); },
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
    pack, shipMethod, promo ? promo.code : '',
    customer.email || '', customer.name || '', customer.shipping || null,
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
        promo_code: promo ? promo.code : null,
        track: attribution(),
        // Deterministic per (config): the server uses it as a Stripe idempotency
        // key, so a duplicated/retried request can't create a second subscription.
        attempt_id: CHECKOUT_NONCE + '_' + subGeneration + '_' + keyHash(key),
        ...customer,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.clientSecret) throw new Error(data.error || 'Impossibile avviare l’ordine. Riprova.');
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
    return ' La verifica della tua banca non è stata completata: riprova oppure paga con PayPal.';
  }
  if (dc === 'card_not_supported' || dc === 'transaction_not_allowed') {
    return ' Questa carta non consente pagamenti ricorrenti: usa un’altra carta oppure paga con PayPal.';
  }
  return '';
}
function showPayError(error, src) {
  const hint = payErrorHint(error);
  showError((error.message || 'Non è stato possibile completare il pagamento.') + hint);
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
    if (!billOk) { showError('Completa l’indirizzo di fatturazione.'); return false; }
  }

  if (!cardState.number || !cardState.expiry || !cardState.cvc) {
    showError('Completa i dati della carta.');
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
const PAY_LABEL = 'Sì! Confermo l’ordine!';
function setBusy(busy) {
  $('#pay-btn').disabled = busy;
  $('#pay-spinner').hidden = !busy;
  $('#pay-btn-text').textContent = busy ? 'Elaborazione…' : (payPalSelected ? 'Paga con PayPal' : PAY_LABEL);
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
    amount: P.amount, discount: discountCents(), shipping_cents: shipCents(), total: totalCents(),
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
  } catch (e) { logClient('config', e && e.message, 'boot'); }
  if (CONFIG.STRIPE_PK && typeof Stripe !== 'undefined') stripe = Stripe(CONFIG.STRIPE_PK, { locale: 'it' });
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
  if (!end || end < Date.now() - 30 * 60 * 1000) { end = Date.now() + LEN; try { sessionStorage.setItem(KEY, String(end)); } catch (e) {} }
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    if (left <= 0) {
      $('#jj-timer-text').innerHTML = 'Il tuo ordine è ancora riservato: <b>completa l’acquisto ora</b>';
      box.classList.add('done');
      return;
    }
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    clock.textContent = m + ':' + String(sec).padStart(2, '0');
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

document.addEventListener('DOMContentLoaded', async () => {
  startTimer();
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
  renderSummaries();
  renderShipDates();
  initStripe();
  initPayPal();
  if (CONFIG.STRIPE_PAYPAL && stripe) { $('#pm-paypal').hidden = false; }

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

  // Total row caret opens the order-summary drawer
  $('#mobile-total').addEventListener('click', () => {
    const drawer = $('.summary-mobile');
    drawer.open = !drawer.open;
    if (drawer.open) drawer.scrollIntoView({ behavior: 'smooth' });
  });

  // billing address toggle
  $('#bill-same').addEventListener('change', (e) => {
    $('#billing-fields').hidden = e.target.checked;
  });

  // Meta pixel — InitiateCheckout (browser + server CAPI, deduped by eventID)
  if (window.fbq) fbq('track', 'InitiateCheckout', {
    value: totalCents() / 100, currency: 'EUR',
    content_name: CONFIG.PRODUCT_NAME + ' ' + P.label,
    content_ids: CONTENT_IDS, content_type: 'product', num_items: 1,
  }, { eventID: IC_EVENT_ID });
  if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'InitiateCheckout', event_id: IC_EVENT_ID, value: totalCents() / 100, currency: 'EUR' });

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
      value: totalCents() / 100, currency: 'EUR',
      content_ids: CONTENT_IDS, content_type: 'product',
    }, { eventID: AP_EVENT_ID });
    if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'AddPaymentInfo', event_id: AP_EVENT_ID, value: totalCents() / 100, currency: 'EUR', ..._capiId });
    // Re-send InitiateCheckout with the SAME IC_EVENT_ID now that we have the
    // email/address — Meta merges the richer match keys onto the earlier event,
    // lifting IC match quality without creating a new conversion.
    if (CONFIG.META_PIXEL_ID) sendCapi({ event_name: 'InitiateCheckout', event_id: IC_EVENT_ID, value: totalCents() / 100, currency: 'EUR', ..._capiId });
    try {
      const shipping = collectShipping();
      const billing = collectBilling(shipping);
      const email = $('#email').value.trim();
      const nameOnCard = $('#card-name').value.trim();

      const phone = shipping.phone;
      const sub = await createSubscription({ email, name: shipping.name, phone, shipping });
      saveOrderForThankYou({ email });
      const billingDetails = {
        name: (payPalSelected ? '' : nameOnCard) || billing.name, email,
        phone: phone || undefined,
        address: {
          line1: billing.line1, line2: billing.line2 || undefined,
          city: billing.city, state: billing.state,
          postal_code: billing.postal_code, country: billing.country || 'IT',
        },
      };

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
        payment_method: { card: cardNumber, billing_details: billingDetails },
        // 3DS: met een return_url kan Stripe terugvallen op een volledige redirect
        // (nodig in de Facebook/Instagram-browser) en komt de klant op de bedankpagina.
        return_url: successUrl(sub.subscriptionId),
      };
      let subId = sub.subscriptionId;
      let { error, paymentIntent } = await stripe.confirmCardPayment(sub.clientSecret, confirmData);
      // Een hergebruikte PaymentIntent kan verlopen zijn → één keer een nieuw abonnement
      if (error && error.code === 'payment_intent_unexpected_state') {
        resetSubCache();
        const fresh = await createSubscription({ email, name: shipping.name, phone, shipping });
        subId = fresh.subscriptionId;
        confirmData.return_url = successUrl(subId);
        ({ error, paymentIntent } = await stripe.confirmCardPayment(fresh.clientSecret, confirmData));
      }
      if (error) { showPayError(error, 'card_confirm'); return; }
      try { sessionStorage.setItem('checkout_purchase_fired', subId); } catch (e) {}
      location.href = successUrl(subId);
    } catch (err) {
      showError(err.message || 'Qualcosa è andato storto, riprova.');
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
        el.innerHTML = 'Cliccando su «Sì! Confermo l’ordine!» accetto i '
          + '<a href="https://www.getjustjenny.com/policies/terms-of-service" target="_blank" rel="noopener">Termini e condizioni</a> '
          + 'e l’<a href="https://www.getjustjenny.com/policies/privacy-policy" target="_blank" rel="noopener">Informativa sulla privacy</a>. '
          + 'Pagamento unico: nessun abbonamento e nessun addebito successivo.';
      });
    }
    if (PRODUCT_KEY !== 'neurotone') {
      document.title = 'Checkout — ' + CONFIG.PRODUCT_NAME + ' — Just Jenny';
      // LubriSense: eigen voorwaarden; de NeuroTone-membershippagina past niet (opzeggen staat in de voorwaarden).
      // Magnesium Freeze heeft (voorlopig) de NeuroTone-membership → gewoon de NeuroTone-pagina's.
      if (PRODUCT_KEY === 'lubrisense') {
        $$('a[href^="/checkout/termini"]').forEach(a => { a.href = '/checkout/termini?p=' + PRODUCT_KEY; });
        $$('a[href^="/checkout/membership"]').forEach(a => { a.href = '/checkout/termini?p=' + PRODUCT_KEY + '#membership'; });
      }
      // LubriSense: eigen klantfoto's (vrouwen) in de header; ontbreekt een foto, dan blijft de letter staan
      if (PRODUCT_KEY === 'lubrisense') $$('.jh-av img').forEach((img, i) => { img.src = '/checkout/assets/avatar-lub' + (i + 1) + '.jpg?v=1'; });
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
