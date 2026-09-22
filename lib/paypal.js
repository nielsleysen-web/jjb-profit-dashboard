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
import { BUNDLES, SHIPPING, MEMBERSHIP, PRODUCT_TITLE, TRACK_KEYS } from "./checkout";
import { shopifyGraphql } from "./shopify-admin";

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

/* ---------------- product + plannen ---------------- */
const planName = (qty, ship) => `JJ NeuroTone ${qty}x + membership · ${ship.code} · ${PLAN_VERSION}`;

async function ensureProduct() {
  try {
    await pp("get", `/v1/catalogs/products/${PRODUCT_ID}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    await pp("post", "/v1/catalogs/products", { id: PRODUCT_ID, name: `${PRODUCT_TITLE} + ${MEMBERSHIP.name}`, type: "PHYSICAL" });
  }
}

let planCache = null; // { "3|insured": "P-..." }
async function loadPlans() {
  if (planCache) return planCache;
  await ensureProduct();
  const found = {};
  const list = await pp("get", `/v1/billing/plans?product_id=${PRODUCT_ID}&page_size=20&total_required=true`);
  for (const p of list.plans || []) if (p.status === "ACTIVE") found[p.name] = p.id;
  planCache = {};
  for (const qty of Object.keys(BUNDLES)) {
    for (const code of Object.keys(SHIPPING)) {
      const b = BUNDLES[qty], s = SHIPPING[code], name = planName(b.qty, s);
      planCache[`${b.qty}|${s.code}`] = found[name] || null;
    }
  }
  return planCache;
}

export async function planFor(qty, shipCode) {
  const b = BUNDLES[qty] || BUNDLES[3];
  const s = SHIPPING[shipCode] || SHIPPING.insured;
  const plans = await loadPlans();
  const key = `${b.qty}|${s.code}`;
  if (plans[key]) return { id: plans[key], bundle: b, ship: s };
  const plan = await pp("post", "/v1/billing/plans", {
    product_id: PRODUCT_ID,
    name: planName(b.qty, s),
    description: `${b.label} + ${MEMBERSHIP.name}: ${MEMBERSHIP.trialDays} giorni di prova, poi ${eur(MEMBERSHIP.price)} € ogni ${MEMBERSHIP.intervalDays} giorni`.slice(0, 127),
    status: "ACTIVE",
    billing_cycles: [
      { tenure_type: "TRIAL", sequence: 1, total_cycles: 1, frequency: { interval_unit: "DAY", interval_count: MEMBERSHIP.trialDays } },
      { tenure_type: "REGULAR", sequence: 2, total_cycles: 0, frequency: { interval_unit: "DAY", interval_count: MEMBERSHIP.intervalDays },
        pricing_scheme: { fixed_price: { value: eur(MEMBERSHIP.price), currency_code: "EUR" } } },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: eur(b.price + s.price), currency_code: "EUR" }, // bundel + verzending, meteen
      setup_fee_failure_action: "CANCEL",
      payment_failure_threshold: 2,
    },
  });
  plans[key] = plan.id;
  return { id: plan.id, bundle: b, ship: s };
}

/* ---------------- tracking in custom_id (max 127 tekens) ---------------- */
export function packCustom(qty, shipCode, track = {}) {
  return [`b${qty}`, shipCode, String(track.ad_id || "").slice(0, 25), String(track.pg || "").slice(0, 24)].join("|").slice(0, 127);
}
export function unpackCustom(custom = "") {
  const [b, ship, ad_id, pg] = String(custom).split("|");
  return { qty: parseInt(String(b || "").replace("b", ""), 10) || 3, ship: ship || "insured", ad_id: ad_id || "", pg: pg || "" };
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
    `query($q: String!) { orders(first: 1, query: $q) { nodes { id name note statusPageUrl totalTaxSet { shopMoney { amount } } } } }`,
    { q: `tag:'${ppTag(id)}'` }
  );
  return d.orders.nodes[0] || null;
}

// sub = PayPal-abonnement (GET /v1/billing/subscriptions/{id}); extra = { track, phone } van de checkout
export async function createShopifyOrderForPaypal(sub, extra = {}) {
  const meta = unpackCustom(sub.custom_id);
  const bundle = BUNDLES[meta.qty] || BUNDLES[3];
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
    note: `PayPal checkout — ${bundle.label} + membership (${MEMBERSHIP.trialDays} giorni prova). Subscription ${sub.id}`,
    customAttributes,
    lineItems: [{ variantId: bundle.variantId, quantity: 1, priceSet: { shopMoney: { amount: eur(bundle.price), currencyCode: "EUR" } } }],
    shippingLines: [{ title: ship.title, code: ship.code, priceSet: { shopMoney: { amount: eur(ship.price), currencyCode: "EUR" } } }],
    shippingAddress,
    billingAddress: shippingAddress,
    transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "paypal", amountSet: { shopMoney: { amount: paid.toFixed(2), currencyCode: "EUR" } } }],
  };
  const d = await shopifyGraphql(
    `mutation Create($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) { order { id name } userErrors { field message } }
    }`,
    { order, options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false } }
  );
  const errs = d.orderCreate?.userErrors || [];
  if (errs.length) throw new Error("Shopify orderCreate: " + errs.map((e) => `${(e.field || []).join(".")} ${e.message}`).join("; "));
  return d.orderCreate.order;
}

// Order maken als die er nog niet is (confirm én webhook roepen dit aan)
export async function ensureOrderForPaypal(sub, extra) {
  const existing = await findOrderForPaypal(sub.id);
  if (existing) return existing;
  return createShopifyOrderForPaypal(sub, extra);
}
