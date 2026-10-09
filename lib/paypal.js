// lib/paypal.js
// PayPal-abonnementen rechtstreeks (buiten Stripe), met hetzelfde model als de Stripe-checkout:
//   - setup fee = bundel + verzending → meteen afgerekend bij goedkeuring
//   - daarna 7 dagen gratis proef, dan €49 elke 28 dagen (Just Jenny Health For Life Membership)
// Alleen de eerste betaling wordt een Shopify-order; rebills blijven in PayPal.
//
// Product + plannen worden automatisch aangemaakt bij de eerste bestelling (één plan per
// bundel × verzendoptie). Prijs gewijzigd in lib/checkout.js? Verhoog dan PLAN_VERSION.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox | live), PAYPAL_WEBHOOK_ID

import axios from "axios";
import { SHIPPING, MEMBERSHIP, TRACK_KEYS, getProduct, giftLineItem, BUNDLE_GIFT } from "./checkout";
import { shopifyGraphql } from "./shopify-admin";
import { syncNewMember, syncCancel, syncProductMember } from "./klaviyo";
import { holdStartedMembership, releaseStartedMembership } from "./upsell-gate";
import { registerMember, markCancelled, productMemberEvent } from "./portal-members";
import { sendPurchase, META_CONTENT_ID } from "./meta-capi";
import { hasCheckoutBonus, clearCheckoutBonus, bonusLineItem } from "./checkout-bonus";
import { getJson, setJson, storeConfigured } from "./portal-store";

/* ---------------- tracking van de checkout bewaren (vangnet voor de webhook) ----------------
   De order wordt normaal gemaakt door /api/paypal/confirm (met fbc/fbp/IP uit de checkout). Lukt dat niet
   (klant sluit de pagina, activering duurt te lang), dan maakt de PayPal-webhook de order — vroeger zonder
   tracking → Purchase naar Meta zonder fbc/fbp. Daarom bewaren we de tracking al bij het aanmaken. */
const CTX_KEY = (id) => `ppctx:${id}`;
export async function saveCheckoutContext(subId, ctx) {
  if (!subId || !storeConfigured()) return;
  await setJson(CTX_KEY(subId), ctx, 7 * 86400).catch((e) => console.warn("ppctx save:", e.message));
}
async function loadCheckoutContext(subId) {
  if (!subId || !storeConfigured()) return null;
  return getJson(CTX_KEY(subId)).catch(() => null);
}

const PLAN_VERSION = "v1";
const PRODUCT_ID = "JJ-NEUROTONE-MEMBERSHIP";
const eur = (cents) => (cents / 100).toFixed(2);

export const paypalConfigured = () => !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const base = () => (process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let tokenCache = { token: null, exp: 0 };
async function token() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const { data } = await axios.post(`${base()}/v1/oauth2/token`, "grant_type=client_credentials", {
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in || 3000) * 1000 };
  return tokenCache.token;
}

export async function pp(method, path, body) {
  const t = await token();
  try {
    const { data } = await axios({ method, url: `${base()}${path}`, data: body, timeout: 20000,
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" } });
    return data;
  } catch (e) {
    const d = e.response?.data;
    const err = new Error(d ? `${d.name || "PAYPAL"}: ${d.message || ""} ${JSON.stringify(d.details || [])}` : e.message);
    err.status = e.response?.status;
    throw err;
  }
}

/* ---------------- product + plannen (per product: NeuroTone, LubriSense, …) ---------------- */
const planName = (product, qty, ship) => `${product.paypalPlanPrefix} ${qty}x + membership · ${ship.code} · ${PLAN_VERSION}`;

const ensured = {};
async function ensureProduct(product = getProduct()) {
  if (ensured[product.key]) return;
  try {
    await pp("get", `/v1/catalogs/products/${product.paypalProductId}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    await pp("post", "/v1/catalogs/products", { id: product.paypalProductId, name: `${product.title} + ${product.membership.name}`, type: "PHYSICAL" });
  }
  ensured[product.key] = true;
}

const planCaches = {}; // per product: { "3|insured": "P-..." }
async function loadPlans(product) {
  if (planCaches[product.key]) return planCaches[product.key];
  await ensureProduct(product);
  const found = {};
  const list = await pp("get", `/v1/billing/plans?product_id=${product.paypalProductId}&page_size=20&total_required=true`);
  for (const p of list.plans || []) if (p.status === "ACTIVE") found[p.name] = p.id;
  const cache = {};
  for (const qty of Object.keys(product.bundles)) {
    for (const code of Object.keys(SHIPPING)) {
      const b = product.bundles[qty], sh = SHIPPING[code], name = planName(product, b.qty, sh);
      cache[`${b.qty}|${sh.code}`] = found[name] || null;
    }
  }
  return (planCaches[product.key] = cache);
}

export async function planFor(qty, shipCode, productKey) {
  const product = getProduct(productKey);
  const M = product.membership;
  const b = product.bundles[qty] || product.bundles[3];
  const s = SHIPPING[shipCode] || SHIPPING.insured;
  const plans = await loadPlans(product);
  const key = `${b.qty}|${s.code}`;
  if (plans[key]) return { id: plans[key], bundle: b, ship: s, product };
  const plan = await pp("post", "/v1/billing/plans", {
    product_id: product.paypalProductId,
    name: planName(product, b.qty, s),
    description: `${b.label} + ${M.name}: ${M.trialDays} giorni di prova, poi ${eur(M.price)} € ogni ${M.intervalDays} giorni`.slice(0, 127),
    status: "ACTIVE",
    billing_cycles: [
      { tenure_type: "TRIAL", sequence: 1, total_cycles: 1, frequency: { interval_unit: "DAY", interval_count: M.trialDays } },
      { tenure_type: "REGULAR", sequence: 2, total_cycles: 0, frequency: { interval_unit: "DAY", interval_count: M.intervalDays },
        pricing_scheme: { fixed_price: { value: eur(M.price), currency_code: "EUR" } } },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: eur(b.price + s.price), currency_code: "EUR" }, // bundel + verzending, meteen
      setup_fee_failure_action: "CANCEL",
      payment_failure_threshold: 2,
    },
  });
  plans[key] = plan.id;
  return { id: plan.id, bundle: b, ship: s, product };
}

// Heractivering vanuit het portaal: alleen de membership (€49 / 28 dagen), zonder proef en zonder setup fee
const REACT_NAME = `JJ membership riattivazione · ${PLAN_VERSION}`;
const reactPlanIds = {};
// Heractivering per product (NeuroTone = het bestaande plan "JJ membership riattivazione · v1")
export async function reactivationPlan(productKey) {
  const product = getProduct(productKey), M = product.membership;
  const pid = product.key === "neurotone" ? PRODUCT_ID : product.paypalProductId;
  const name = product.key === "neurotone" ? REACT_NAME : `${product.paypalPlanPrefix} membership riattivazione · ${PLAN_VERSION}`;
  if (reactPlanIds[product.key]) return { id: reactPlanIds[product.key] };
  await ensureProduct(product);
  const list = await pp("get", `/v1/billing/plans?product_id=${pid}&page_size=20&total_required=true`);
  const found = (list.plans || []).find((p) => p.status === "ACTIVE" && p.name === name);
  if (found) { reactPlanIds[product.key] = found.id; return { id: found.id }; }
  const plan = await pp("post", "/v1/billing/plans", {
    product_id: pid, name, status: "ACTIVE",
    description: `${M.name}: ${eur(M.price)} € ogni ${M.intervalDays} giorni`.slice(0, 127),
    billing_cycles: [{ tenure_type: "REGULAR", sequence: 1, total_cycles: 0, frequency: { interval_unit: "DAY", interval_count: M.intervalDays },
      pricing_scheme: { fixed_price: { value: eur(M.price), currency_code: "EUR" } } }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  });
  reactPlanIds[product.key] = plan.id;
  return { id: plan.id };
}

/* ---------------- tracking in custom_id (max 127 tekens) ---------------- */
// 5e veld = product (leeg = NeuroTone, zodat bestaande abonnementen hetzelfde blijven)
export function packCustom(qty, shipCode, track = {}, productKey = "") {
  const prod = productKey && productKey !== "neurotone" ? productKey : "";
  return [`b${qty}`, shipCode, String(track.ad_id || "").slice(0, 25), String(track.pg || "").slice(0, 24), prod].join("|").replace(/\|$/, "").slice(0, 127);
}
export function unpackCustom(custom = "") {
  // Heractivering vanuit het portaal: "reactivate|<email>" (NeuroTone) of "reactivate|<email>|<product>"
  if (String(custom).startsWith("reactivate|")) return { qty: 0, ship: "", ad_id: "", pg: "", product: String(custom).split("|")[2] || "neurotone", reactivation: true };
  const [b, ship, ad_id, pg, prod] = String(custom).split("|");
  return { qty: parseInt(String(b || "").replace("b", ""), 10) || 3, ship: ship || "insured", ad_id: ad_id || "", pg: pg || "", product: prod || "neurotone" };
}

/* ---------------- Shopify-order voor de eerste betaling ---------------- */
function itPhone(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (!d) return undefined;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : undefined;
  if (d.startsWith("39") && d.length >= 11) return "+" + d;
  if (/^[03]\d{5,10}$/.test(d)) return "+39" + d;
  return undefined;
}
export const ppTag = (id) => `pp-${id}`.slice(0, 40);

export async function findOrderForPaypal(id) {
  const d = await shopifyGraphql(
    `query($q: String!) { orders(first: 1, query: $q) { nodes { id name note tags statusPageUrl totalTaxSet { shopMoney { amount } } } } }`,
    { q: `tag:'${ppTag(id)}'` }
  );
  return d.orders.nodes[0] || null;
}

// sub = PayPal-abonnement (GET /v1/billing/subscriptions/{id}); extra = { track, phone } van de checkout
export async function createShopifyOrderForPaypal(sub, extra = {}) {
  // Geen tracking meegegeven (order via de webhook) → wat de checkout bij het aanmaken bewaarde
  if (!extra.track || !Object.keys(extra.track).length) {
    const ctx = await loadCheckoutContext(sub.id);
    if (ctx) extra = { ...ctx, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null && v !== "" && !(typeof v === "object" && !Object.keys(v).length))) };
  }
  const meta = unpackCustom(sub.custom_id);
  const product = getProduct(meta.product);
  const bundle = product.bundles[meta.qty] || product.bundles[3];
  const ship = SHIPPING[meta.ship] || SHIPPING.insured;
  const s = sub.subscriber || {};
  const addr = s.shipping_address?.address || {};
  const fullName = s.shipping_address?.name?.full_name || [s.name?.given_name, s.name?.surname].filter(Boolean).join(" ");
  const [firstName, ...rest] = String(fullName || "").split(" ");
  const phone = itPhone(extra.phone || s.phone?.phone_number?.national_number);
  const paid = parseFloat(sub.billing_info?.last_payment?.amount?.value || eur(bundle.price + ship.price));

  const track = { ...(extra.track || {}) };
  if (!track.ad_id && meta.ad_id) track.ad_id = meta.ad_id;
  if (!track.pg && meta.pg) track.pg = meta.pg;
  const customAttributes = [];
  for (const k of [...TRACK_KEYS, "pg", "utm_medium"]) if (track[k]) customAttributes.push({ key: `jjb_${k}`, value: String(track[k]).slice(0, 250) });
  customAttributes.push({ key: "paypal_subscription", value: sub.id });

  const addrOk = !!(addr.address_line_1 && addr.admin_area_2 && /^\d{5}$/.test(String(addr.postal_code || "")));
  const tags = ["paypal", "subscription-frontend", ppTag(sub.id)];
  if (!addrOk) tags.push("missing-address");
  if (product.tag) tags.push(product.tag);
  if (bundle.gift) tags.push(BUNDLE_GIFT.tag);

  const shippingAddress = {
    firstName: firstName || "-",
    lastName: rest.join(" ") || "-",
    address1: addr.address_line_1 || "",
    address2: addr.address_line_2 || undefined,
    city: addr.admin_area_2 || "",
    zip: addr.postal_code || "",
    provinceCode: addr.admin_area_1 || undefined,
    countryCode: addr.country_code || "IT",
    phone,
  };
  const order = {
    email: s.email_address || undefined,
    phone,
    currency: "EUR",
    financialStatus: "PAID",
    sourceName: "paypal-checkout",
    tags,
    note: `PayPal checkout — ${bundle.label} + ${product.membership.name} (${product.membership.trialDays} giorni prova). Subscription ${sub.id}`,
    customAttributes,
    lineItems: [{ variantId: bundle.variantId, quantity: 1, priceSet: { shopMoney: { amount: eur(bundle.price), currencyCode: "EUR" } } }],
    shippingLines: [{ title: ship.title, code: ship.code, priceSet: { shopMoney: { amount: eur(ship.price), currencyCode: "EUR" } } }],
    shippingAddress,
    billingAddress: shippingAddress,
    transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "paypal", amountSet: { shopMoney: { amount: paid.toFixed(2), currencyCode: "EUR" } } }],
  };
  // Abandoned-checkout-mail 2: 1 flacone in omaggio
  if (bundle.gift) { order.lineItems.push(giftLineItem()); order.note += ` + ${BUNDLE_GIFT.title} (${BUNDLE_GIFT.note})`; }
  const bonus = product.abandoned ? await hasCheckoutBonus(order.email) : false;
  if (bonus) { order.lineItems.push(bonusLineItem(product.key)); order.tags.push("abandon-bonus"); order.note += ` + 1x ${product.title} in omaggio (abandoned checkout)`; }
  const d = await shopifyGraphql(
    `mutation Create($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) { order { id name } userErrors { field message } }
    }`,
    { order, options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false } }
  );
  const errs = d.orderCreate?.userErrors || [];
  if (errs.length) throw new Error("Shopify orderCreate: " + errs.map((e) => `${(e.field || []).join(".")} ${e.message}`).join("; "));
  const created = d.orderCreate.order;
  if (bonus) await clearCheckoutBonus(order.email);

  // Meta CAPI: Purchase (server-side; de bedankpagina vuurt hetzelfde event_id in de browser → dedup)
  await sendPurchase({
    orderName: created.name, createdAt: sub.create_time, value: paid, currency: "EUR", provider: "paypal",
    email: s.email_address, phone, firstName, lastName: rest.join(" "),
    city: addr.admin_area_2, zip: addr.postal_code, state: addr.admin_area_1, country: addr.country_code || "IT",
    clientIp: extra.clientIp, userAgent: extra.userAgent, fbc: track.fbc, fbp: track.fbp, vid: track.vid,
    contents: [{ id: product.key === "neurotone" ? META_CONTENT_ID : product.shopifyProductId, quantity: bundle.qty }],
  });

  // Abonnee → Klaviyo (lijst + event "Started Membership"); nooit blokkerend
  const trialEnds = sub.billing_info?.next_billing_time || new Date(new Date(sub.create_time || Date.now()).getTime() + product.membership.trialDays * 86400000);
  const memberInfo = {
    email: s.email_address, firstName, lastName: rest.join(" "), phone,
    address: { address1: addr.address_line_1, city: addr.admin_area_2, zip: addr.postal_code, province: addr.admin_area_1, country: addr.country_code || "IT" },
    provider: "paypal", subscriptionId: sub.id, paypalPayerId: s.payer_id, qty: bundle.qty, bundleLabel: bundle.label, shippingTitle: ship.title,
    amountPaid: paid, trialEnds, orderName: created.name, membershipPrice: product.membership.price / 100, intervalDays: product.membership.intervalDays,
    startedAt: sub.create_time, nextChargeAt: sub.billing_info?.next_billing_time || null,
  };
  // Product zonder (NeuroTone-)portaal, bv. LubriSense: alleen eigen Klaviyo-events
  if (!product.portal) {
    await productMemberEvent(product, "started", memberInfo);
    return created;
  }
  // Ledenportaal: record + welkomstlink (30 dagen) voor mail 1; nooit blokkerend
  const portalLoginUrl = await registerMember(memberInfo);
  await syncNewMember({ ...memberInfo, portalLoginUrl }); // profiel + lijst
  await holdStartedMembership(sub.id, { ...memberInfo, portalLoginUrl }).catch((e) => console.warn("mail1 hold:", e.message)); // mail 1 na de upsellpagina
  // Product zonder upsellpagina (Magnesium Freeze) → mail 1 meteen, niet pas na 30 min via de cron
  if (!product.upsell) await releaseStartedMembership(sub.id, { upsellAdded: false }).catch((e) => console.warn("mail1 release:", e.message));
  return created;
}

// Opzegging in PayPal → Klaviyo
export async function cancelMemberForPaypal(sub, reason) {
  const product = getProduct(unpackCustom(sub?.custom_id).product);
  if (!product.portal) return productMemberEvent(product, "cancelled", { email: sub?.subscriber?.email_address, provider: "paypal", subscriptionId: sub?.id, reason: reason || "" });
  await markCancelled(sub?.subscriber?.email_address);
  return syncCancel({ email: sub?.subscriber?.email_address, provider: "paypal", subscriptionId: sub?.id, reason: reason || "" });
}

// Order maken als die er nog niet is (confirm én webhook roepen dit aan)
export async function ensureOrderForPaypal(sub, extra) {
  const existing = await findOrderForPaypal(sub.id);
  if (existing) return existing;
  return createShopifyOrderForPaypal(sub, extra);
}
