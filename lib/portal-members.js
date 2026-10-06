// lib/portal-members.js — Ledenrecord voor het portaal.
//
// Wordt aangemaakt bij de eerste betaling (Stripe-webhook / PayPal-confirm) en bijgewerkt bij
// rebill/opzegging. Bron van waarheid voor betalingen blijft Stripe/PayPal; hier staat wat het
// portaal snel nodig heeft: naam, adres, provider, abonnement, status, wachtwoord-hash.
//
// portal:member:<email> = {
//   email, firstName, lastName, phone,
//   address: { address1, city, zip, province, country },
//   provider: "stripe" | "paypal", subscriptionId, stripeCustomerId?, paypalPayerId?,
//   status: "trialing" | "active" | "cancelled", startedAt, trialEnds, lastPaymentAt, nextChargeAt,
//   shopifyOrder, bundle,
//   password: { salt, hash } | null,
//   createdAt, updatedAt
// }

import { getJson, setJson, redis, storeConfigured } from "./portal-store";
import { normEmail, createLoginLink, portalUrl } from "./portal-auth";
import { runWithBrand } from "./portal-brand";
import { syncProductMember } from "./klaviyo";

export const memberKey = (email) => `portal:member:${normEmail(email)}`;

export async function getMember(email) {
  if (!storeConfigured() || !email) return null;
  return getJson(memberKey(email));
}

// Aanmaken of bijwerken (velden die je meegeeft overschrijven; wachtwoord blijft altijd staan)
export async function upsertMember(m) {
  if (!storeConfigured() || !m?.email) return null;
  const email = normEmail(m.email);
  const cur = (await getJson(memberKey(email))) || {};
  const next = {
    ...cur,
    ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== null && v !== "")),
    email,
    password: cur.password || null,
    createdAt: cur.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setJson(memberKey(email), next);
  await redis(["SADD", "portal:members", email]);
  return next;
}

export async function setMemberPassword(email, password /* {salt, hash} */) {
  const cur = await getJson(memberKey(email));
  if (!cur) return null;
  cur.password = password;
  cur.updatedAt = new Date().toISOString();
  await setJson(memberKey(email), cur);
  return cur;
}

export async function listMemberEmails() {
  if (!storeConfigured()) return [];
  return (await redis(["SMEMBERS", "portal:members"])) || [];
}

// Wat de browser mag zien (nooit de wachtwoord-hash)
export function publicMember(m) {
  if (!m) return null;
  const { password, ...rest } = m;
  return { ...rest, hasPassword: !!(password && password.hash) };
}

// ---- aanroepen vanuit de webhooks (nooit blokkerend) ------------------------

// Eerste betaling: record aanmaken + welkomstlink (30 dagen geldig) voor mail 1.
// Geeft de link terug (of null als opslag niet geconfigureerd is / iets misgaat).
export async function registerMember(info) {
  try {
    if (!storeConfigured() || !info?.email) return null;
    await upsertMember({
      email: info.email, firstName: info.firstName, lastName: info.lastName, phone: info.phone, address: info.address,
      provider: info.provider, subscriptionId: info.subscriptionId, stripeCustomerId: info.stripeCustomerId, paypalPayerId: info.paypalPayerId,
      status: "trialing", startedAt: info.startedAt ? new Date(info.startedAt).toISOString() : new Date().toISOString(),
      trialEnds: info.trialEnds ? new Date(info.trialEnds).toISOString() : undefined,
      nextChargeAt: info.nextChargeAt ? new Date(info.nextChargeAt).toISOString() : undefined,
      lastPaymentAt: info.startedAt ? new Date(info.startedAt).toISOString() : new Date().toISOString(),
      lastPaymentAmount: info.amountPaid, shopifyOrder: info.orderName, bundle: info.qty,
    });
    const url = await createLoginLink(info.email, { purpose: "welcome", ttlSec: 30 * 86400 });
    try { await redis(["LPUSH", `portal:log:${normEmail(info.email)}`, JSON.stringify({ at: new Date().toISOString(), type: "registered", provider: info.provider, order: info.orderName, bundle: info.qty, amount: info.amountPaid })]); } catch {}
    // Kwam terug via de abandoned-checkout-mail met "secret gift": e-book klaarzetten (titel pas bij openen in de Home)
    try {
      const e = normEmail(info.email);
      if (await redis(["GET", `checkout:gift:${e}`])) {
        const cur = await getJson(`portal:secretgift:${e}`);
        if (!cur) {
          await setJson(`portal:secretgift:${e}`, { at: new Date().toISOString(), slug: null, openedAt: null, order: info.orderName || null });
          await redis(["LPUSH", `portal:log:${e}`, JSON.stringify({ at: new Date().toISOString(), type: "secret_gift", order: info.orderName })]);
        }
        await redis(["DEL", `checkout:gift:${e}`]);
      }
    } catch (e) { console.warn("portal secret gift:", e.message); }
    console.log(`portal: member registered ${normEmail(info.email)} (${info.provider})`);
    return url;
  } catch (e) { console.warn("portal registerMember:", e.message); return null; }
}

// Rebill gelukt → status active, datums bijwerken
export async function markRenewed(email, { paidAt, nextChargeAt, amountPaid } = {}) {
  try {
    if (!storeConfigured() || !email) return null;
    if (!(await getMember(email))) return null;
    const cur = await getMember(email);
    try { await redis(["LPUSH", `portal:log:${normEmail(email)}`, JSON.stringify({ at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(), type: "rebill", amount: amountPaid })]); } catch {}
    return await upsertMember({ email, status: "active", rebills: (cur?.rebills || 0) + 1, totalPaid: Math.round(((cur?.totalPaid || 0) + (amountPaid || 0)) * 100) / 100,
      lastPaymentAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
      nextChargeAt: nextChargeAt ? new Date(nextChargeAt).toISOString() : undefined, lastPaymentAmount: amountPaid });
  } catch (e) { console.warn("portal markRenewed:", e.message); return null; }
}

// Opzegging → status cancelled (toegang blijft tot het einde van de betaalde periode; dat regelt stap 2)
export async function markCancelled(email) {
  try {
    if (!storeConfigured() || !email) return null;
    if (!(await getMember(email))) return null;
    try { await redis(["LPUSH", `portal:log:${normEmail(email)}`, JSON.stringify({ at: new Date().toISOString(), type: "cancelled" })]); } catch {}
    return await upsertMember({ email, status: "cancelled", cancelledAt: new Date().toISOString() });
  } catch (e) { console.warn("portal markCancelled:", e.message); return null; }
}

// ---- andere producten met een eigen portaal (LubriSense → intimate.getjustjenny.com) ----------------------
// Webhooks roepen dit aan i.p.v. de NeuroTone-functies: ledenrecord in het portaal van dat product (eigen
// Redis-prefix) + eigen Klaviyo-events ("LubriSense Membership Started" met de persoonlijke inloglink).
// kind: started | renewed | cancelled | failed
export async function productMemberEvent(product, kind, info) {
  const brand = product.portalBrand;
  if (!brand) return syncProductMember(product, kind, info);
  return runWithBrand(brand, async () => {
    let portalLoginUrl = null;
    if (kind === "started") portalLoginUrl = await registerMember(info);
    if (kind === "renewed") await markRenewed(info.email, { paidAt: info.paidAt, nextChargeAt: info.nextCharge, amountPaid: info.amountPaid });
    if (kind === "cancelled") await markCancelled(info.email);
    return syncProductMember(product, kind, { ...info, portalLoginUrl, portalUrl: portalUrl() });
  });
}
