// lib/upsell-queue.js — Betaalde upsells die (nog) niet op hun Shopify-order staan, alsnog toevoegen.
//
// Waarom: de upsell wordt éérst geïnd (Stripe/PayPal) en daarna op de order gezet. Dat tweede kan mislukken
// (order nog niet vindbaar in de Shopify-zoekindex, Shopify tijdelijk onbereikbaar, ontbrekende scope …) terwijl
// het geld al binnen is. Daarom:
//   1. queueUpsell(...)       direct na de betaling: in Redis (portal:upsell:<ref>) + set portal:upsell:pending
//   2. retryQueuedUpsells()   cron (/api/checkout/sweep, elke 10 min): opnieuw proberen, max 3 dagen
//   3. sweepStripeUpsells()   cron: Stripe zelf afspeuren naar geslaagde upsell-betalingen (metadata kind=upsell)
//                             waarvan het abonnement nog geen upsell_order=1 heeft → ook zonder Redis-record gevonden
// Idempotent: addUpsellToOrder slaat orders met de tag upsell-1plus1 over.

import Stripe from "stripe";
import { redis, getJson, setJson, del, storeConfigured } from "./portal-store";
import { findOrderByTag, getOrderById, addUpsellToOrder } from "./upsell";

const KEY = (ref) => `portal:upsell:${ref}`;
const SET = "portal:upsell:pending";
const MAX_AGE_MS = 3 * 86400000;

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;

// item: { provider: "stripe"|"paypal", ref: sub_…|I-…, tag: stripe-inv-…|pp-…, orderId?: gid, reference, email, firstName, product? }
export async function queueUpsell(item) {
  if (!storeConfigured() || !item?.ref) return { queued: false };
  await setJson(KEY(item.ref), { ...item, at: Date.now() }, 4 * 86400);
  await redis(["SADD", SET, item.ref]);
  return { queued: true };
}

export async function dequeueUpsell(ref) {
  if (!storeConfigured() || !ref) return;
  await del(KEY(ref)).catch(() => {});
  await redis(["SREM", SET, ref]).catch(() => {});
}

// Eén poging: order vinden (eerst op id, dan op tag) en de upsell erop zetten. Gooit bij fouten.
export async function applyQueuedUpsell(item) {
  let order = item.orderId ? await getOrderById(item.orderId).catch(() => null) : null;
  if (!order) order = await findOrderByTag(item.tag);
  if (!order) return { pending: true, reason: "order_not_found" };
  const r = await addUpsellToOrder(order, { reference: item.reference || "", email: item.email || order.email || "", firstName: item.firstName || order.customer?.firstName || "", product: item.product || "" });
  if (item.provider === "stripe" && stripe && /^sub_/.test(item.ref)) {
    const sub = await stripe.subscriptions.retrieve(item.ref).catch(() => null);
    if (sub) await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_order: "1", shopify_order: order.name } }).catch(() => {});
  }
  return { ok: true, order: r.order?.name || order.name, skipped: r.skipped };
}

export async function retryQueuedUpsells() {
  if (!storeConfigured()) return { done: [], pending: [], failed: [] };
  const refs = (await redis(["SMEMBERS", SET])) || [];
  const done = [], pending = [], failed = [];
  for (const ref of refs) {
    const item = await getJson(KEY(ref));
    if (!item) { await redis(["SREM", SET, ref]).catch(() => {}); continue; }
    if (Date.now() - (item.at || 0) > MAX_AGE_MS) { console.error("upsell queue: opgegeven na 3 dagen", ref); await dequeueUpsell(ref); failed.push(ref); continue; }
    try {
      const r = await applyQueuedUpsell(item);
      if (r.ok) { await dequeueUpsell(ref); done.push(`${ref}→${r.order}`); } else pending.push(ref);
    } catch (e) {
      console.warn("upsell queue:", ref, e.message);
      failed.push(`${ref}: ${e.message}`.slice(0, 200));
    }
  }
  return { done, pending, failed };
}

// Stripe afspeuren: geslaagde upsell-betalingen van de laatste 7 dagen zonder upsell_order=1 op het abonnement
export async function sweepStripeUpsells({ days = 7 } = {}) {
  if (!stripe) return { done: [], pending: [], failed: [] };
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const found = await stripe.paymentIntents.search({ query: `metadata['kind']:'upsell' AND status:'succeeded' AND created>${since}`, limit: 100 });
  const done = [], pending = [], failed = [];
  for (const pi of found.data) {
    const subId = pi.metadata?.subscription_id;
    if (!subId) continue;
    try {
      const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer"] });
      if (sub.metadata?.upsell_order === "1") continue;
      const invoiceId = pi.metadata?.invoice_id || (typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id);
      const customer = typeof sub.customer === "object" ? sub.customer : null;
      const r = await applyQueuedUpsell({
        provider: "stripe", ref: sub.id, tag: `stripe-inv-${invoiceId}`.slice(0, 40), orderId: sub.metadata?.shopify_order_id || null,
        reference: `Stripe ${pi.id}`, email: customer?.email || "", firstName: String(customer?.shipping?.name || customer?.name || "").split(" ")[0] || "",
        product: pi.metadata?.product_key || sub.metadata?.product_key || "",
      });
      if (r.ok) { await dequeueUpsell(sub.id); done.push(`${sub.id}→${r.order}`); } else pending.push(sub.id);
    } catch (e) {
      console.warn("upsell sweep:", subId, e.message);
      failed.push(`${subId}: ${e.message}`.slice(0, 200));
    }
  }
  return { done, pending, failed, scanned: found.data.length };
}

// Op verkeer meelopen: wachtrij + Stripe-sweep, maar hooguit één keer per `everySec` (Redis-slot). Nooit gooien.
export async function sweepIfDue({ everySec = 300 } = {}) {
  if (!storeConfigured()) return { skipped: "no_store" };
  try {
    const lock = await redis(["SET", "portal:upsell:sweep-lock", String(Date.now()), "NX", "EX", String(everySec)]);
    if (lock !== "OK") return { skipped: "not_due" };
    const queue = await retryQueuedUpsells();
    const stripeSweep = await sweepStripeUpsells({ days: 7 });
    const did = [...(queue.done || []), ...(stripeSweep.done || [])];
    if (did.length || queue.failed?.length || stripeSweep.failed?.length) console.log("upsell sweep (traffic):", JSON.stringify({ queue, stripeSweep }));
    return { queue, stripeSweep };
  } catch (e) {
    console.warn("sweepIfDue:", e.message);
    return { error: e.message };
  }
}
