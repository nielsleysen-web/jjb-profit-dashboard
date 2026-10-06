// lib/klaviyo.js
// Abonnees van de checkout → Klaviyo. Bij de eerste betaling (Stripe én PayPal):
//   1. profiel aanmaken/bijwerken met de membership-gegevens (jj_* eigenschappen)
//   2. inschrijven op de lijst "Just Jenny Health Membership" (KLAVIYO_LIST_ID)
//   3. event "Started Membership" → daar hang je in Klaviyo de flows aan
//      (orderbevestiging, herinnering dag 5 vóór het einde van de proef, …)
// Later: "Membership Renewed" bij elke rebill en "Membership Cancelled" bij opzegging.
//
// Eigenschappen op het profiel (bruikbaar in segmenten en e-mails):
//   jj_membership_status   trialing | active | cancelled
//   jj_membership_provider stripe | paypal
//   jj_membership_started  2026-09-24
//   jj_trial_ends          2026-10-01   (dag waarop de €49 voor het eerst wordt afgeschreven)
//   jj_bundle              3            (aantal flesjes van de eerste bestelling)
//   jj_subscription_id     sub_… / I-…
//   jj_shopify_order       #2219
//
// Env: KLAVIYO_PRIVATE_KEY (pk_…, Secret) · KLAVIYO_LIST_ID (Config, optioneel)
// Nooit blokkerend: een fout hier mag de order of de bedankpagina niet tegenhouden.

import { currentBrand } from "./portal-brand";
import axios from "axios";

const API = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export const klaviyoConfigured = () => !!process.env.KLAVIYO_PRIVATE_KEY;

async function kl(method, path, body) {
  const { data } = await axios({
    method, url: `${API}${path}`, data: body, timeout: 15000,
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
      revision: REVISION, "Content-Type": "application/json", Accept: "application/json",
    },
  });
  return data;
}
const errText = (e) => JSON.stringify(e.response?.data?.errors?.map((x) => x.detail) || e.message).slice(0, 300);

// Profiel aanmaken of bijwerken (upsert op e-mail). Telefoon alleen als hij geldig is;
// keurt Klaviyo hem toch af, dan nog eens zonder telefoon.
async function upsertProfile(p) {
  const attributes = {
    email: p.email,
    first_name: p.firstName || undefined,
    last_name: p.lastName || undefined,
    location: p.address && (p.address.city || p.address.zip) ? {
      address1: p.address.address1 || undefined,
      city: p.address.city || undefined,
      zip: p.address.zip || undefined,
      region: p.address.province || undefined,
      country: "Italy",
    } : undefined,
    properties: p.properties || {},
  };
  const phone = /^\+\d{8,15}$/.test(String(p.phone || "")) ? p.phone : undefined;
  const send = (attrs) => kl("post", "/profile-import/", { data: { type: "profile", attributes: attrs } });
  try {
    return await send({ ...attributes, phone_number: phone });
  } catch (e) {
    if (phone) return send(attributes); // zonder telefoon opnieuw
    throw e;
  }
}

async function subscribeToList(email, listId) {
  await kl("post", "/profile-subscription-bulk-create-jobs/", {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        historical_import: false,
        profiles: { data: [{ type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } } } }] },
      },
      relationships: { list: { data: { type: "list", id: listId } } },
    },
  });
}

// Losse profiel-eigenschappen zetten (bv. jj_streak_reminder, jj_birthday). null → leeg.
// Ander brand (LubriSense-portaal): eigen profielvelden "jj_lubrisense_…" i.p.v. "jj_…", zodat de NeuroTone-
// segmenten en -flows er niet op reageren (zie lib/portal-brand.js)
const brandProp = (k) => {
  const b = currentBrand();
  return b.propPrefix !== "jj_" && k.startsWith("jj_") && !k.startsWith(b.propPrefix) ? b.propPrefix + k.slice(3) : k;
};

export async function setProfileProperties(email, props) {
  const properties = Object.fromEntries(Object.entries(props || {}).map(([k, v]) => [brandProp(k), v === null ? "" : v]));
  return upsertProfile({ email, properties });
}

export async function trackEvent(name, email, properties = {}, { value, uniqueId, time } = {}) {
  // Ander brand (LubriSense-portaal): "LubriSense Portal Login Link" enz. → eigen flows/mails per product
  const pre = currentBrand().eventPrefix;
  if (pre && !name.startsWith(pre) && name !== "Checkout Completed") name = pre + name;
  await kl("post", "/events/", {
    data: {
      type: "event",
      attributes: {
        properties,
        value: value ?? undefined,
        unique_id: uniqueId || undefined,
        time: time || new Date().toISOString(),
        metric: { data: { type: "metric", attributes: { name } } },
        profile: { data: { type: "profile", attributes: { email } } },
      },
    },
  });
}

/**
 * Eerste betaling → abonnee naar Klaviyo.
 * m = { email, firstName, lastName, phone, address:{address1,city,zip,province}, provider,
 *       subscriptionId, qty, bundleLabel, shippingTitle, amountPaid (EUR), trialEnds (Date|ms|ISO),
 *       orderName, membershipPrice (EUR), intervalDays }
 */
export async function syncNewMember(m) {
  if (!klaviyoConfigured() || !m.email) return { skipped: true };
  const started = new Date();
  const props = {
    jj_membership_status: "trialing",
    jj_membership_provider: m.provider,
    jj_membership_started: ymd(started),
    jj_trial_ends: m.trialEnds ? ymd(m.trialEnds) : undefined,
    jj_bundle: m.qty,
    jj_subscription_id: m.subscriptionId,
    jj_shopify_order: m.orderName || undefined,
    jj_portal_login_url: m.portalLoginUrl || undefined, // welkomstlink naar het ledenportaal (30 dagen geldig)
  };
  const out = { profile: false, list: false, event: false };
  try {
    await upsertProfile({ ...m, properties: props });
    out.profile = true;
  } catch (e) { console.warn("klaviyo profile:", errText(e)); }

  if (process.env.KLAVIYO_LIST_ID) {
    try { await subscribeToList(m.email, process.env.KLAVIYO_LIST_ID); out.list = true; }
    catch (e) { console.warn("klaviyo list:", errText(e)); }
  }
  // Meteen bij de aankoop (niet uitgesteld zoals mail 1): stopt de abandoned-checkout-flow ("Started Checkout")
  try {
    await trackEvent("Checkout Completed", m.email, { provider: m.provider, subscription_id: m.subscriptionId, bundle: m.qty, order: m.orderName || "" }, { uniqueId: `checkout-done-${m.subscriptionId || m.email}` });
    out.event = true;
  } catch (e) { console.warn("klaviyo checkout completed:", errText(e)); }
  // Het event "Started Membership" (mail 1) vertrekt NIET hier maar pas na de upsellpagina (lib/upsell-gate.js),
  // zodat de ordertabel in mail 1 ook de offerta 1+1 bevat als de klant die kiest.
  return out;
}

// Andere producten (LubriSense, …) met een eigen membership: eigen profielvelden (jj_<product>_*),
// eigen lijst (env KLAVIYO_LIST_ID_<PRODUCT>) en eigen events ("<Titel> Membership Started/Renewed/Cancelled"),
// zodat de NeuroTone-flows (portaal, welkomstmails) er niet op afgaan. "Checkout Completed" gaat wel mee.
export async function syncProductMember(product, kind, m) {
  if (!klaviyoConfigured() || !m.email) return { skipped: true };
  const k = product.key, title = product.title;
  const props = {};
  if (kind === "started") Object.assign(props, {
    [`jj_${k}_status`]: "trialing", [`jj_${k}_provider`]: m.provider, [`jj_${k}_started`]: ymd(new Date()),
    [`jj_${k}_trial_ends`]: m.trialEnds ? ymd(m.trialEnds) : undefined, [`jj_${k}_bundle`]: m.qty,
    [`jj_${k}_subscription_id`]: m.subscriptionId, [`jj_${k}_shopify_order`]: m.orderName || undefined,
    [`jj_${k}_portal_login_url`]: m.portalLoginUrl || undefined,
  });
  if (kind === "renewed") props[`jj_${k}_status`] = "active";
  if (kind === "cancelled") props[`jj_${k}_status`] = "cancelled";
  try { await upsertProfile({ ...m, properties: props }); } catch (e) { console.warn("klaviyo profile:", errText(e)); }
  const list = process.env[`KLAVIYO_LIST_ID_${k.toUpperCase()}`];
  if (kind === "started" && list) { try { await subscribeToList(m.email, list); } catch (e) { console.warn("klaviyo list:", errText(e)); } }
  const ev = { started: "Membership Started", renewed: "Membership Renewed", cancelled: "Membership Cancelled", failed: "Membership Payment Failed" }[kind];
  const data = { product: title, provider: m.provider, subscription_id: m.subscriptionId, bundle: m.qty, bundle_label: m.bundleLabel,
    shipping: m.shippingTitle, amount_paid: m.amountPaid, trial_ends: m.trialEnds ? ymd(m.trialEnds) : undefined,
    membership_name: product.membership?.name, membership_price: product.membership ? (product.membership.price / 100).toFixed(2).replace(".", ",") : undefined,
    next_charge: m.nextCharge ? ymd(m.nextCharge) : undefined, order: m.orderName || "", reason: m.reason || undefined,
    portal_login_url: m.portalLoginUrl || undefined, portal_url: m.portalUrl || undefined, first_name: m.firstName || undefined };
  try {
    if (kind === "started") await trackEvent("Checkout Completed", m.email, { product: title, provider: m.provider, subscription_id: m.subscriptionId, bundle: m.qty, order: m.orderName || "" }, { uniqueId: `checkout-done-${m.subscriptionId || m.email}` });
    await trackEvent(`${title} ${ev}`, m.email, data, { uniqueId: `${k}-${kind}-${m.invoiceId || m.subscriptionId || m.email}` });
  } catch (e) { console.warn("klaviyo product member:", errText(e)); }
  return { ok: true };
}

// Mail 1: "Started Membership" met (optioneel) de upsell-regel. Aangeroepen door lib/upsell-gate.js.
export async function sendStartedMembership(m, { upsellAdded = false, upsellAmount = 0, upsellCompare = 0, upsellTitle = "" } = {}) {
  if (!klaviyoConfigured() || !m.email) return { skipped: true };
  const total = (m.amountPaid || 0) + (upsellAdded ? upsellAmount : 0);
  return trackEvent("Started Membership", m.email, {
    provider: m.provider,
    subscription_id: m.subscriptionId,
    bundle: m.qty,
    bundle_label: m.bundleLabel,
    shipping: m.shippingTitle,
    amount_paid: m.amountPaid,
    upsell_added: upsellAdded,
    upsell_amount: upsellAdded ? upsellAmount : 0, upsell_compare: upsellAdded ? upsellCompare : 0,
    upsell_title: upsellAdded ? upsellTitle : "",
    total_paid: total,
    trial_ends: m.trialEnds ? ymd(m.trialEnds) : undefined,
    membership_price: m.membershipPrice,
    interval_days: m.intervalDays,
    shopify_order: m.orderName,
    first_name: m.firstName,
    portal_login_url: m.portalLoginUrl,
  }, { value: total, uniqueId: `start-${m.subscriptionId}` });
}

// Rebill van €49 → event + status "active"
export async function syncRenewal(m) {
  if (!klaviyoConfigured() || !m.email) return { skipped: true };
  try {
    await upsertProfile({ email: m.email, properties: { jj_membership_status: "active", jj_last_renewal: ymd(new Date()), jj_next_charge: m.nextCharge ? ymd(m.nextCharge) : undefined } });
    await trackEvent("Membership Renewed", m.email, { provider: m.provider, subscription_id: m.subscriptionId, amount_paid: m.amountPaid, next_charge: m.nextCharge ? ymd(m.nextCharge) : undefined },
      { value: m.amountPaid, uniqueId: `renew-${m.invoiceId || m.subscriptionId + "-" + ymd(new Date())}` });
    return { ok: true };
  } catch (e) { console.warn("klaviyo renewal:", errText(e)); return { ok: false }; }
}

// Opzegging → event + status "cancelled"
export async function syncCancel(m) {
  if (!klaviyoConfigured() || !m.email) return { skipped: true };
  try {
    await upsertProfile({ email: m.email, properties: { jj_membership_status: "cancelled", jj_membership_cancelled: ymd(new Date()) } });
    await trackEvent("Membership Cancelled", m.email, { provider: m.provider, subscription_id: m.subscriptionId, reason: m.reason || "" }, { uniqueId: `cancel-${m.subscriptionId}` });
    return { ok: true };
  } catch (e) { console.warn("klaviyo cancel:", errText(e)); return { ok: false }; }
}
