// lib/portal-account.js — Alles wat het ledenportaal over één lid toont (server-only).
//
//   - abonnement: status, huidige cyclus (begin/einde), laatste betaling, betaalmethode
//       Stripe  → subscription.current_period_start/end, laatste betaalde factuur, kaart (merk + laatste 4)
//       PayPal  → billing_info.last_payment / next_billing_time
//       Valt terug op het ledenrecord in Redis als de betaalprovider niet bereikbaar is.
//   - bestellingen: Shopify-orders op het e-mailadres (niet-geannuleerd), status + 17TRACK-link
//   - gratis producten: welk product is deze cyclus al besteld (Shopify-order met tag membership-item,
//       herkend op SKU) en vanaf wanneer het opnieuw kan
//   - cursussen: ontgrendeld op basis van dagen sinds de start

import Stripe from "stripe";
import { paidAmount } from "./stripe-dunning";
import { shopifyGraphql } from "./shopify-admin";
import { pp, paypalConfigured } from "./paypal";
import { portalProducts, findPortalProductBySku, PORTAL_RULES } from "./portal-products";
import { portalCourses } from "./portal-content";
import { currentBrand } from "./portal-brand";
import { getLibraryState, libraryView } from "./portal-library";
import { getRegift, regiftView } from "./portal-regift";
import { redis } from "./portal-store";

const DAY = 86400000;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const TRACKING_URL = (num) => `https://www.getjustjenny.com/apps/tracking?nums=${encodeURIComponent(num)}`;
const iso = (x) => (x ? new Date(x).toISOString() : null);

// Producten die deze cyclus via het portaal besteld zijn — direct in Redis bijgehouden, omdat het zoeken in
// Shopify soms een paar minuten achterloopt (anders zou een product even "opnieuw bestelbaar" lijken)
export const claimedKey = (email, cycleStart) => `portal:claimed:${email}:${new Date(cycleStart).toISOString().slice(0, 10)}`;
export async function claimedThisCycle(email, cycleStart) {
  try { return (await redis(["SMEMBERS", claimedKey(email, cycleStart)])) || []; } catch { return []; }
}

// ---- abonnement ------------------------------------------------------------
async function stripeInfo(m) {
  if (!stripe || !m.subscriptionId || !String(m.subscriptionId).startsWith("sub_")) return null;
  const sub = await stripe.subscriptions.retrieve(m.subscriptionId, { expand: ["default_payment_method", "customer"] });
  let pm = sub.default_payment_method;
  if (!pm && sub.customer && typeof sub.customer === "object") {
    const def = sub.customer.invoice_settings?.default_payment_method;
    if (def) pm = typeof def === "string" ? await stripe.paymentMethods.retrieve(def).catch(() => null) : def;
  }
  if (!pm && sub.customer) {
    const list = await stripe.paymentMethods.list({ customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id, type: "card", limit: 1 }).catch(() => null);
    pm = list?.data?.[0] || null;
  }
  const inv = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 1 }).catch(() => null);
  const last = inv?.data?.[0];
  return {
    provider: "stripe",
    status: sub.status === "canceled" || sub.status === "incomplete_expired" ? "cancelled" : sub.status, // trialing | active | past_due | unpaid | cancelled …
    subscriptionId: sub.id,
    latestInvoiceId: typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    cycleStart: iso(sub.current_period_start * 1000),
    cycleEnd: iso((sub.ended_at || sub.current_period_end) * 1000),
    lastPayment: last ? { at: iso(last.created * 1000), amount: paidAmount(last) } : null,
    paymentMethod: pm?.card ? { type: "card", brand: pm.card.brand, last4: pm.card.last4 } : pm?.type === "paypal" ? { type: "paypal" } : null,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    defaultPaymentMethodId: pm?.id || null,
  };
}

async function paypalInfo(m) {
  if (!paypalConfigured() || !m.subscriptionId || !String(m.subscriptionId).startsWith("I-")) return null;
  const sub = await pp("get", `/v1/billing/subscriptions/${m.subscriptionId}`);
  const created = new Date(sub.create_time || m.startedAt || Date.now()).getTime();
  const next = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time).getTime() : null;
  const cycleStart = next ? Math.max(created, next - PORTAL_RULES.cycleDays * DAY) : created;
  const lp = sub.billing_info?.last_payment;
  return {
    provider: "paypal",
    status: ["CANCELLED", "EXPIRED"].includes(sub.status) ? "cancelled" : sub.status === "SUSPENDED" ? "past_due" : "active",
    cancelAtPeriodEnd: false,
    subscriptionId: sub.id,
    cycleStart: iso(cycleStart),
    cycleEnd: iso(next || cycleStart + PORTAL_RULES.cycleDays * DAY),
    lastPayment: lp?.time ? { at: iso(lp.time), amount: parseFloat(lp.amount?.value || "0") || 0 } : null,
    paymentMethod: { type: "paypal", email: sub.subscriber?.email_address || null },
  };
}

// Zonder live gegevens: cyclus berekenen uit start + proefperiode
function fallbackInfo(m) {
  const start = new Date(m.startedAt || m.createdAt || Date.now()).getTime();
  const trialEnd = m.trialEnds ? new Date(m.trialEnds).getTime() : start + PORTAL_RULES.trialDays * DAY;
  const now = Date.now();
  let cs = start, ce = trialEnd;
  if (now >= trialEnd) {
    const k = Math.floor((now - trialEnd) / (PORTAL_RULES.cycleDays * DAY));
    cs = trialEnd + k * PORTAL_RULES.cycleDays * DAY;
    ce = cs + PORTAL_RULES.cycleDays * DAY;
  }
  return {
    provider: m.provider || null,
    status: m.status || "active",
    cancelAtPeriodEnd: false,
    cycleStart: iso(cs), cycleEnd: iso(ce),
    lastPayment: m.lastPaymentAt ? { at: m.lastPaymentAt, amount: m.lastPaymentAmount || null } : null,
    paymentMethod: m.provider === "paypal" ? { type: "paypal" } : null,
  };
}

// Gedeactiveerd = opgezegd of mislukte afschrijving: alle toegang dicht behalve betaalgegevens/heractivering
export function isDeactivated(member, sub) {
  return isPaused(member) || sub.status === "cancelled" || sub.status === "past_due" || sub.status === "unpaid" || member?.status === "cancelled";
}
// Gepauzeerd door customer service (30/60/90 dagen): geen afschrijvingen en het portaal is dicht tot de einddatum
export const isPaused = (member) => !!(member?.pausedUntil && Date.parse(member.pausedUntil) > Date.now() && member?.status !== "cancelled");

export async function getSubscriptionInfo(m) {
  try {
    const live = m.provider === "paypal" ? await paypalInfo(m) : await stripeInfo(m);
    if (live) {
      // PayPal (en soms Stripe) geeft tijdens de proefweek geen "laatste betaling": dan tonen we de eerste
      // bestelling uit het ledenrecord (datum + bedrag van de bundel bij de start)
      if (!live.lastPayment && m.lastPaymentAt) live.lastPayment = { at: m.lastPaymentAt, amount: m.lastPaymentAmount ?? null };
      return { ...live, live: true };
    }
  } catch (e) { console.warn("portal subscription info:", m.email, e.message); }
  return { ...fallbackInfo(m), live: false };
}

// ---- Shopify-orders ------------------------------------------------------
export async function getOrders(email) {
  const safe = String(email || "").replace(/["\\]/g, "");
  if (!safe) return [];
  const d = await shopifyGraphql(
    `query($q: String!) {
      orders(first: 25, query: $q, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name createdAt cancelledAt tags displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          lineItems(first: 6) { nodes { title quantity sku image { url } variant { id } } }
          fulfillments(first: 5) { trackingInfo(first: 1) { number } }
        }
      }
    }`,
    { q: `email:"${safe}"` }
  );
  // LubriSense-portaal: alleen LubriSense-bestellingen tonen (niet de NeuroTone-orders op hetzelfde e-mailadres)
  const lubri = currentBrand().key === "lubrisense";
  const mine = (o) => !lubri || (o.tags || []).includes("lubrisense") || (o.lineItems?.nodes || []).some((li) => findPortalProductBySku(li.sku, li.variant?.id));
  return (d.orders?.nodes || []).filter((o) => !o.cancelledAt && mine(o)).map((o) => {
    const tracking = (o.fulfillments || []).flatMap((f) => f.trackingInfo || []).find((t) => t?.number)?.number || null;
    const shipped = !!tracking || ["FULFILLED", "PARTIALLY_FULFILLED"].includes(o.displayFulfillmentStatus);
    const items = (o.lineItems?.nodes || []).map((li) => {
      const pp_ = findPortalProductBySku(li.sku, li.variant?.id);
      return { title: li.title, quantity: li.quantity, sku: li.sku || null, portal: pp_?.slug || null, image: pp_?.image || li.image?.url || null };
    });
    return {
      name: o.name,
      createdAt: o.createdAt,
      portal: (o.tags || []).includes("membership-item") || items.some((i) => i.portal),
      total: parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || "0") || 0,
      shipping: parseFloat(o.totalShippingPriceSet?.shopMoney?.amount || "0") || 0,
      items,
      status: shipped ? "shipped" : "confirmed",
      trackingNumber: tracking,
      trackingUrl: tracking ? TRACKING_URL(tracking) : null,
    };
  });
}

// ---- alles samen ---------------------------------------------------------
export async function getOverview(member) {
  const [sub, orders] = await Promise.all([
    getSubscriptionInfo(member),
    getOrders(member.email).catch((e) => { console.warn("portal orders:", member.email, e.message); return null; }),
  ]);
  const libState = await getLibraryState(member.email, sub.cycleStart || Date.now()).catch(() => ({ unlocked: new Set(), used: new Set(), gift: null }));
  // Regalo na heractivering (mail "C'è un regalo ad aspettarti"): extra e-book + 9,95 € op één fee
  const regift = regiftView(await getRegift(member.email).catch(() => null));
  const now = Date.now();
  const cycleStart = sub.cycleStart ? new Date(sub.cycleStart).getTime() : now;
  const cycleEnd = sub.cycleEnd ? new Date(sub.cycleEnd).getTime() : now + PORTAL_RULES.cycleDays * DAY;

  // Toegang: gedeactiveerd zodra het abonnement is opgezegd of een afschrijving is mislukt (past_due/unpaid,
  // PayPal SUSPENDED). Dan blijft alleen het scherm "betaalgegevens wijzigen en hervatten" over.
  const deactivated = isDeactivated(member, sub);
  const ended = deactivated;
  const deactivatedReason = isPaused(member) ? "paused" : sub.status === "past_due" || sub.status === "unpaid" ? "payment_failed" : "cancelled";

  // Gratis producten: al besteld in deze cyclus?
  const orderedThisCycle = new Set(await claimedThisCycle(member.email, cycleStart));
  for (const o of orders || []) {
    const t = new Date(o.createdAt).getTime();
    if (t >= cycleStart && t < cycleEnd) for (const i of o.items) if (i.portal) orderedThisCycle.add(i.portal);
  }
  const freeItems = portalProducts().map((p) => ({
    slug: p.slug, title: p.title, tagline: p.tagline, it: p.it,
    compareAt: p.compareAt / 100, shipping: p.shipping / 100, image: p.image,
    shippingAfterGift: regift?.creditCents ? Math.max(0, p.shipping - regift.creditCents) / 100 : null,
    ordered: orderedThisCycle.has(p.slug),
    availableAgain: orderedThisCycle.has(p.slug) ? iso(cycleEnd) : null,
  }));

  const startedAt = new Date(member.startedAt || member.createdAt || now).getTime();
  const daysIn = Math.max(0, Math.floor((now - startedAt) / DAY));
  const courses = portalCourses().map((c) => ({
    slug: c.slug, icon: c.icon, tone: c.tone, it: c.it, en: c.en, unlockDays: c.unlockDays,
    unlocked: daysIn >= c.unlockDays,
    unlocksAt: iso(startedAt + c.unlockDays * DAY),
    daysLeft: Math.max(0, c.unlockDays - daysIn),
    lessons: c.lessons.length,
  }));

  return {
    ended,
    deactivated,
    deactivatedReason: deactivated ? deactivatedReason : null,
    pausedUntil: isPaused(member) ? member.pausedUntil : null,
    daysIn,
    paymentReady: sub.provider === "paypal" || member.provider === "paypal" || !!(sub.customerId && sub.defaultPaymentMethodId),
    cycle: { start: iso(cycleStart), end: iso(cycleEnd) },
    membership: {
      since: member.startedAt || member.createdAt || null,
      status: sub.status,
      provider: sub.provider || member.provider || null,
      lastPayment: sub.lastPayment,
      paymentMethod: sub.paymentMethod,
      live: sub.live,
    },
    orders,
    freeItems,
    library: libraryView(libState, cycleStart, cycleEnd),
    gift: libState.gift,
    regift,
    courses,
  };
}
