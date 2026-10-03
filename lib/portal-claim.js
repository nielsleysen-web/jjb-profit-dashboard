// lib/portal-claim.js — Een gratis product bestellen vanuit het ledenportaal (server-only).
//
// Verloop:
//   1. startClaim(member, slug)
//        - controles: lid actief, product bestaat, deze cyclus nog niet besteld, adres aanwezig
//        - Stripe-lid → PaymentIntent op de opgeslagen kaart (lid is aanwezig → on-session, 3D Secure mogelijk)
//            geslaagd          → finalizeClaim → klaar
//            requires_action   → browser bevestigt met Stripe.js, daarna completeStripe(piId)
//        - PayPal-lid → PayPal-order (eenmalige betaling S&H) → lid keurt goed op PayPal → completePaypal(orderId)
//   2. finalizeClaim: betaalde Shopify-order (product € 0 + "Spedizione e gestione" = fee), tag membership-item,
//      Klaviyo-event "Portal Order Confirmed" (bevestigingsmail), product gemarkeerd als besteld deze cyclus.
//      Idempotent per betaling (Redis): dubbel klikken of terugknop maakt nooit 2 orders.
//
// Portaalbestellingen tellen NIET mee in de omzet van het dashboard (break-even): ze hebben tag membership-item.

import Stripe from "stripe";
import { shopifyGraphql } from "./shopify-admin";
import { pp, paypalConfigured } from "./paypal";
import { findPortalProduct } from "./portal-products";
import { getSubscriptionInfo, getOrders, claimedKey, claimedThisCycle, isDeactivated } from "./portal-account";
import { availableCredit, useRegiftCredit } from "./portal-regift";
import { logEvent } from "./portal-activity";
import { getMember } from "./portal-members";
import { redis, getJson, setJson } from "./portal-store";
import { trackEvent, klaviyoConfigured } from "./klaviyo";
import { PORTAL_URL } from "./portal-auth";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
const eur = (cents) => (cents / 100).toFixed(2);
const DAY = 86400000;


function itPhone(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (!d) return undefined;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : undefined;
  if (d.startsWith("39") && d.length >= 11) return "+" + d;
  if (/^[03]\d{5,10}$/.test(d)) return "+39" + d;
  return undefined;
}

class ClaimError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export { ClaimError };

// ---- 1. starten ---------------------------------------------------------------
export async function startClaim(member, slug) {
  const product = findPortalProduct(slug);
  if (!product) throw new ClaimError("unknown_product", 404);

  const sub = await getSubscriptionInfo(member);
  const cycleStart = new Date(sub.cycleStart || Date.now()).getTime();
  const cycleEnd = new Date(sub.cycleEnd || Date.now() + 28 * DAY).getTime();
  if (isDeactivated(member, sub)) throw new ClaimError("ended", 403);

  // Al besteld deze cyclus? (Redis + Shopify)
  const claimed = await claimedThisCycle(member.email, cycleStart);
  if (claimed.includes(slug)) throw new ClaimError("already_ordered", 409);
  const orders = await getOrders(member.email).catch(() => []);
  const dup = (orders || []).some((o) => { const t = new Date(o.createdAt).getTime(); return t >= cycleStart && t < cycleEnd && o.items.some((i) => i.portal === slug); });
  if (dup) throw new ClaimError("already_ordered", 409);

  const a = member.address || {};
  if (!a.address1 || !a.city || !a.zip) throw new ClaimError("no_address", 400);

  // Tegen dubbel klikken: 2 minuten slot per lid + product
  const lock = await redis(["SET", `portal:claimlock:${member.email}:${slug}`, "1", "NX", "EX", "120"]);
  if (lock !== "OK") throw new ClaimError("busy", 409);

  // Regalo na heractivering: 9,95 € van de fee af (één keer, één product)
  const credit = Math.min(await availableCredit(member.email).catch(() => 0), product.shipping);
  const fee = product.shipping - credit;
  const ctx = { email: member.email, slug, cycleStart, cycleEnd, regift: credit };
  const title = product.it?.title || product.title;

  // Fee volledig gedekt door het regalo → geen betaling nodig
  if (fee <= 0) {
    return { action: "done", result: await finalizeClaim({ ...ctx, provider: "regalo", ref: `regalo-${member.email}-${Date.now()}`, amount: 0, pm: null }) };
  }

  if (sub.provider === "paypal" || member.provider === "paypal") {
    if (!paypalConfigured()) throw new ClaimError("paypal_unavailable", 500);
    const order = await pp("post", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: slug,
        description: `Just Jenny · ${title} · spedizione e gestione`.slice(0, 127),
        custom_id: `portal|${slug}`.slice(0, 127),
        amount: { currency_code: "EUR", value: eur(fee) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: "Just Jenny", locale: "it-IT", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW",
        return_url: `${PORTAL_URL}/paypal-return`, cancel_url: `${PORTAL_URL}/#claim/${slug}`,
      } } },
    });
    const url = (order.links || []).find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!url) throw new ClaimError("paypal_unavailable", 500);
    await setJson(`portal:pp:${order.id}`, ctx, 3600);
    return { action: "redirect", url };
  }

  // Stripe
  if (!stripe || !sub.customerId || !sub.defaultPaymentMethodId) {
    await releaseLock(ctx);
    throw new ClaimError("no_payment_method", 400);
  }
  let pi;
  try {
    pi = await stripe.paymentIntents.create({
      amount: fee, currency: "eur",
      customer: sub.customerId, payment_method: sub.defaultPaymentMethodId,
      payment_method_types: ["card"], confirm: true,
      description: `Just Jenny · ${title} · spedizione e gestione`,
      statement_descriptor_suffix: "JUST JENNY",
      metadata: { portal_email: member.email, portal_product: slug, portal_cycle: String(cycleStart), portal_cycle_end: String(cycleEnd), portal_regift: String(credit) },
    });
  } catch (e) {
    await releaseLock(ctx);
    console.warn("portal claim stripe:", member.email, e.code || e.message);
    throw new ClaimError(e.type === "StripeCardError" ? "card_declined" : "payment_failed", 402);
  }
  if (pi.status === "succeeded") return { action: "done", result: await finalizeClaim({ ...ctx, provider: "stripe", ref: pi.id, amount: pi.amount_received / 100, pm: sub.paymentMethod }) };
  if (pi.status === "requires_action") return { action: "confirm", clientSecret: pi.client_secret, paymentIntentId: pi.id };
  await releaseLock(ctx);
  throw new ClaimError("payment_failed", 402);
}

async function releaseLock(ctx) { try { await redis(["DEL", `portal:claimlock:${ctx.email}:${ctx.slug}`]); } catch {} }

// ---- 2a. Stripe na 3D Secure --------------------------------------------------
export async function completeStripe(member, paymentIntentId) {
  if (!stripe) throw new ClaimError("payment_failed", 500);
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
  if (pi.metadata?.portal_email !== member.email) throw new ClaimError("not_yours", 403);
  const ctx = { email: member.email, slug: pi.metadata.portal_product, cycleStart: parseInt(pi.metadata.portal_cycle, 10) || Date.now(), cycleEnd: parseInt(pi.metadata.portal_cycle_end, 10) || null, regift: parseInt(pi.metadata.portal_regift, 10) || 0 };
  if (pi.status !== "succeeded") { await releaseLock(ctx); throw new ClaimError("payment_failed", 402); }
  const card = pi.payment_method?.card;
  return finalizeClaim({ ...ctx, provider: "stripe", ref: pi.id, amount: pi.amount_received / 100, pm: card ? { type: "card", brand: card.brand, last4: card.last4 } : null });
}

// ---- 2b. PayPal na goedkeuring ------------------------------------------------
export async function completePaypal(member, orderId) {
  const ctx = await getJson(`portal:pp:${orderId}`);
  if (!ctx || ctx.email !== member.email) throw new ClaimError("not_yours", 403);
  // Al afgerond (terugknop / dubbel laden)?
  const done = await getJson(`portal:claim:done:${orderId}`);
  if (done && done.orderName) return done;
  let cap;
  try {
    cap = await pp("post", `/v2/checkout/orders/${orderId}/capture`, {});
  } catch (e) {
    if (!/ORDER_ALREADY_CAPTURED/.test(e.message)) { await releaseLock(ctx); throw new ClaimError("payment_failed", 402); }
    cap = await pp("get", `/v2/checkout/orders/${orderId}`);
  }
  if (cap.status !== "COMPLETED") { await releaseLock(ctx); throw new ClaimError("payment_failed", 402); }
  const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = parseFloat(capture?.amount?.value || "0") || 0;
  return finalizeClaim({ ...ctx, provider: "paypal", ref: orderId, amount, pm: { type: "paypal", email: cap.payer?.email_address || null } });
}

// ---- 3. afronden: Shopify-order + mail ------------------------------------------
export async function finalizeClaim({ email, slug, cycleStart, cycleEnd, provider, ref, amount, pm, regift = 0 }) {
  const doneKey = `portal:claim:done:${ref}`;
  const existing = await getJson(doneKey);
  if (existing && existing.orderName) return existing;
  const first = await redis(["SET", `${doneKey}:lock`, "1", "NX", "EX", "300"]);
  if (first !== "OK") {
    // Een andere aanvraag is deze betaling al aan het afronden → even wachten op het resultaat
    for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 800)); const d = await getJson(doneKey); if (d?.orderName) return d; }
    throw new ClaimError("busy", 409);
  }

  const member = await getMember(email);
  const product = findPortalProduct(slug);
  const a = member?.address || {};
  const title = product.it?.title || product.title;
  const shippingAddress = {
    firstName: member?.firstName || "-", lastName: member?.lastName || "-",
    address1: a.address1 || "", city: a.city || "", zip: a.zip || "",
    provinceCode: a.province || undefined, countryCode: a.country || "IT", phone: itPhone(member?.phone),
  };
  const order = {
    email, currency: "EUR", financialStatus: "PAID", sourceName: "members-portal",
    tags: ["membership-item", "portal-order", provider, `portal-${slug}`.slice(0, 40)],
    note: `Ledenportaal — gratis product (${product.title}). Betaald: spedizione e gestione ${amount.toFixed(2)} € via ${provider} (${ref}).${regift ? ` Regalo heractivering: −${(regift / 100).toFixed(2)} € op de fee.` : ""}`,
    customAttributes: [{ key: "portal_product", value: slug }, { key: "portal_payment", value: ref }, ...(regift ? [{ key: "portal_regift", value: (regift / 100).toFixed(2) }] : [])],
    lineItems: [{ variantId: product.shopifyVariantId, quantity: 1, priceSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } } }],
    shippingLines: [{ title: regift ? "Spedizione e gestione (regalo −" + (regift / 100).toFixed(2).replace(".", ",") + " €)" : "Spedizione e gestione", code: "portal-sh", priceSet: { shopMoney: { amount: amount.toFixed(2), currencyCode: "EUR" } } }],
    shippingAddress, billingAddress: shippingAddress,
    ...(amount > 0 ? { transactions: [{ kind: "SALE", status: "SUCCESS", gateway: provider, amountSet: { shopMoney: { amount: amount.toFixed(2), currencyCode: "EUR" } } }] } : {}),
  };
  const d = await shopifyGraphql(
    `mutation Create($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) { order { id name createdAt } userErrors { field message } }
    }`,
    { order, options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false } }
  );
  const errs = d.orderCreate?.userErrors || [];
  if (errs.length) {
    console.error("portal claim orderCreate:", email, slug, ref, JSON.stringify(errs));
    await redis(["DEL", `${doneKey}:lock`]).catch(() => {});
    throw new ClaimError("order_failed", 500);
  }
  const created = d.orderCreate.order;
  const availableAgain = cycleEnd ? new Date(cycleEnd).toISOString() : null;

  if (regift) await useRegiftCredit(email, slug, created.name).catch((e) => console.warn("portal regift credit:", e.message));
  const result = {
    orderName: created.name, createdAt: created.createdAt, slug, amount, provider, paymentMethod: pm || null, regift: regift / 100,
    address: { name: `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim(), address1: a.address1, zip: a.zip, city: a.city, province: a.province || "" },
    availableAgain,
  };
  await setJson(doneKey, result, 60 * 86400);
  await redis(["SADD", claimedKey(email, cycleStart), slug]);
  await redis(["EXPIRE", claimedKey(email, cycleStart), String(45 * 86400)]);
  await redis(["DEL", `portal:claimlock:${email}:${slug}`]).catch(() => {});
  console.log(`portal: order ${created.name} ${email} ${slug} ${amount.toFixed(2)}€ ${provider}`);
  await logEvent(email, "claim", { slug, order: created.name, amount, provider, regift: regift / 100 || 0 });

  // Bevestigingsmail via Klaviyo (flow op "Portal Order Confirmed"). Wel afwachten (Vercel stopt de functie
  // na het antwoord, dan zou het event soms nooit vertrekken), maar een fout blokkeert de bestelling nooit.
  if (klaviyoConfigured()) {
    const it = (dt) => new Date(dt).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    await trackEvent("Portal Order Confirmed", email, {
      order_name: created.name,
      product_title: title,
      product_image: `${PORTAL_URL}${product.image}`,
      compare_at: (product.compareAt / 100).toFixed(2).replace(".", ","),
      shipping: amount.toFixed(2).replace(".", ","),
      total: amount.toFixed(2).replace(".", ","),
      ship_name: result.address.name,
      ship_address1: a.address1 || "",
      ship_city: `${a.zip || ""} ${a.city || ""}${a.province ? ` (${a.province})` : ""}`.trim(),
      available_again: availableAgain ? it(availableAgain) : "",
      orders_url: `${PORTAL_URL}/#orders`,
      first_name: member?.firstName || "",
    }, { value: amount, uniqueId: `portal-order-${created.name}` }).catch((e) => console.warn("portal klaviyo:", e.message));
  }
  return result;
}
