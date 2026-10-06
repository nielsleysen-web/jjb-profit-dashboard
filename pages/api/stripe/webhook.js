// pages/api/stripe/webhook.js
// Stripe → Operations Centre. Bij de EERSTE betaalde factuur van een abonnement (front-end
// bundel + verzending) maken we een betaalde Shopify-order aan, zodat fulfilment gewoon
// doorloopt en het hoofddashboard de front-end omzet ziet. Rebills (membership) blijven in
// Stripe — daar wordt niets verzonden.
//
// Stripe → Developers → Webhooks → endpoint: https://<dashboard>/api/stripe/webhook
// Events: invoice.paid  (verplicht) · customer.subscription.deleted (optioneel: opzegging → Klaviyo)
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Shopify-scope: write_orders (naast de bestaande read-scopes)

import Stripe from "stripe";
import axios from "axios";
import { SHIPPING, getProduct } from "../../../lib/checkout";
import { syncNewMember, syncRenewal, syncCancel, trackEvent, syncProductMember } from "../../../lib/klaviyo";
import { PORTAL_URL } from "../../../lib/portal-auth";
import { sendPurchase, META_CONTENT_ID } from "../../../lib/meta-capi";
import { registerMember, markRenewed, markCancelled } from "../../../lib/portal-members";
import { addUpsellToOrder } from "../../../lib/upsell";
import { holdStartedMembership, releaseStartedMembership } from "../../../lib/upsell-gate";
import { hasCheckoutBonus, clearCheckoutBonus, bonusLineItem } from "../../../lib/checkout-bonus";

export const config = { api: { bodyParser: false } }; // ruwe body nodig voor de handtekening

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/* ---------------- Shopify ---------------- */
let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET });
  const r = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { token: r.data.access_token, expiresAt: Date.now() + (r.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}
async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const r = await axios.post(`https://${storeUrl}/admin/api/2025-01/graphql.json`, { query, variables }, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 });
  if (r.data.errors) throw new Error(JSON.stringify(r.data.errors));
  return r.data.data;
}

// Shopify weigert ongeldige telefoonnummers → naar +39… zetten, of weglaten
function itPhone(p) {
  let d = String(p || "").replace(/[^\d+]/g, "");
  if (!d) return undefined;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : undefined;
  if (d.startsWith("39") && d.length >= 11) return "+" + d;
  if (/^[03]\d{5,10}$/.test(d)) return "+39" + d;
  return undefined;
}

const invTag = (invoiceId) => `stripe-inv-${invoiceId}`.slice(0, 40);

async function orderExistsForInvoice(invoiceId) {
  const d = await shopifyGraphql(`query($q: String!) { orders(first: 1, query: $q) { nodes { id name } } }`, { q: `tag:'${invTag(invoiceId)}'` });
  return d.orders.nodes[0] || null;
}

async function createShopifyOrder({ invoice, subscription, customer, paymentIntent }) {
  const md = { ...(subscription?.metadata || {}), ...(paymentIntent?.metadata || {}) };
  const qty = parseInt(md.qty || md.bundle || "3", 10);
  const product = getProduct(md.product_key); // NeuroTone of LubriSense
  const bundle = product.bundles[qty] || product.bundles[3];
  const shipCode = md.shipping || "insured";
  const ship = SHIPPING[shipCode] || SHIPPING.insured;
  const addr = customer?.shipping?.address || customer?.address || {};
  const fullName = customer?.shipping?.name || customer?.name || "";
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ") || "-";
  const amountPaid = (invoice.amount_paid || 0) / 100;

  // Tracking-attributen zoals jjb-track.js ze op Shopify-orders zet → Ad Attribution en dashboards blijven werken
  const customAttributes = [];
  for (const [k, v] of Object.entries(md)) {
    if (k.startsWith("jjb_") && v) customAttributes.push({ key: k, value: String(v).slice(0, 250) });
  }
  customAttributes.push({ key: "stripe_subscription", value: subscription?.id || "" });
  customAttributes.push({ key: "stripe_invoice", value: invoice.id });

  // Onbruikbaar adres → tag, zodat je die orders in Shopify kunt filteren vóór verzending
  const addrOk = !!(addr.line1 && addr.city && /^\d{5}$/.test(String(addr.postal_code || "")));
  const tags = ["stripe", "subscription-frontend", invTag(invoice.id)];
  if (!addrOk) tags.push("missing-address");
  if (product.tag) tags.push(product.tag);
  // Kortingscode in Stripe → zelfde korting op de Shopify-order, zodat de bedragen kloppen
  const discountCents = (invoice.total_discount_amounts || []).reduce((t, d) => t + (d.amount || 0), 0);

  const order = {
    email: customer?.email || invoice.customer_email || undefined,
    phone: itPhone(customer?.shipping?.phone || customer?.phone),
    currency: "EUR",
    financialStatus: "PAID",
    sourceName: "stripe-checkout",
    tags,
    note: `Stripe checkout — ${bundle.label} + ${product.membership.name} (${product.membership.trialDays} giorni prova). Invoice ${invoice.id}, subscription ${subscription?.id || "?"}`,
    customAttributes,
    lineItems: [{ variantId: bundle.variantId, quantity: 1, priceSet: { shopMoney: { amount: (bundle.price / 100).toFixed(2), currencyCode: "EUR" } } }],
    shippingLines: [{ title: ship.title, code: ship.code, priceSet: { shopMoney: { amount: (ship.price / 100).toFixed(2), currencyCode: "EUR" } } }],
    shippingAddress: {
      firstName: firstName || "-",
      lastName,
      address1: addr.line1 || "",
      address2: addr.line2 || undefined,
      city: addr.city || "",
      zip: addr.postal_code || "",
      provinceCode: addr.state || undefined,
      countryCode: "IT",
      phone: itPhone(customer?.shipping?.phone || customer?.phone),
    },
    transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "stripe", amountSet: { shopMoney: { amount: amountPaid.toFixed(2), currencyCode: "EUR" } } }],
  };
  order.billingAddress = order.shippingAddress;
  if (discountCents > 0) {
    order.discountCode = { itemFixedDiscountCode: { code: md.promo_code || "STRIPE", amountSet: { shopMoney: { amount: (discountCents / 100).toFixed(2), currencyCode: "EUR" } } } };
  }

  // Abandoned-checkout-mail 2: 1 flacone in omaggio
  const bonus = product.abandoned ? await hasCheckoutBonus(order.email) : false;
  if (bonus) { order.lineItems.push(bonusLineItem()); order.tags.push("abandon-bonus"); order.note += " + 1x NeuroTone in omaggio (abandoned checkout)"; }

  const d = await shopifyGraphql(
    `mutation Create($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id name }
        userErrors { field message }
      }
    }`,
    { order, options: { inventoryBehaviour: "DECREMENT_OBEYING_POLICY", sendReceipt: false, sendFulfillmentReceipt: false } }
  );
  const errs = d.orderCreate?.userErrors || [];
  if (errs.length) throw new Error("Shopify orderCreate: " + errs.map((e) => `${(e.field || []).join(".")} ${e.message}`).join("; "));
  if (bonus) await clearCheckoutBonus(order.email);
  return d.orderCreate.order;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send("Stripe webhook niet geconfigureerd");

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.warn("stripe webhook signature:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    if (event.type === "invoice.paid") {
      // Factuur opnieuw ophalen met ONZE vaste API-versie: nieuwere Stripe-versies zetten
      // subscription/payment_intent op een andere plek in het event. Zo werkt het altijd.
      const inv = await stripe.invoices.retrieve(event.data.object.id);
      // Alleen de eerste factuur van een abonnement bevat de front-end bundel → Shopify-order
      if (inv.billing_reason === "subscription_create" && inv.amount_paid > 0) {
        // Heractivering vanuit het portaal (alleen membership) → geen Shopify-order, alleen Klaviyo-renewal
        const subIdEarly = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        const subEarly = subIdEarly ? await stripe.subscriptions.retrieve(subIdEarly).catch(() => null) : null;
        if (subEarly?.metadata?.kind === "reactivation") {
          await markRenewed(inv.customer_email, { paidAt: inv.created * 1000, nextChargeAt: subEarly.current_period_end * 1000, amountPaid: (inv.amount_paid || 0) / 100 });
          return res.status(200).json({ received: true, reactivation: true });
        }
        const already = await orderExistsForInvoice(inv.id);
        if (already) return res.status(200).json({ received: true, order: already.name, dedupe: true });

        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        const custId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        const piId = typeof inv.payment_intent === "string" ? inv.payment_intent : inv.payment_intent?.id;
        const [subscription, customer, paymentIntent] = await Promise.all([
          subId ? stripe.subscriptions.retrieve(subId) : null,
          custId ? stripe.customers.retrieve(custId) : null,
          piId ? stripe.paymentIntents.retrieve(piId) : null,
        ]);
        const order = await createShopifyOrder({ invoice: inv, subscription, customer, paymentIntent });
        // Ordernaam terugschrijven op het abonnement → handig in Stripe zelf
        if (subscription) await stripe.subscriptions.update(subscription.id, { metadata: { ...subscription.metadata, shopify_order: order.name, shopify_order_id: order.id } }).catch(() => {});
        // Upsell (1+1 gratis) al betaald vóór deze order bestond (api/stripe/upsell) → nu alsnog op de order zetten
        let upsellAppliedEarly = false;
        if (subscription?.metadata?.upsell_pi && subscription.metadata.upsell_order !== "1") {
          try {
            const upi = await stripe.paymentIntents.retrieve(subscription.metadata.upsell_pi);
            if (upi.status === "succeeded") {
              await addUpsellToOrder({ ...order, tags: [], email: customer?.email || inv.customer_email, statusPageUrl: "" }, { reference: `Stripe ${upi.id}`, email: customer?.email || inv.customer_email || "", firstName: String(customer?.shipping?.name || customer?.name || "").split(" ")[0] || "" });
              await stripe.subscriptions.update(subscription.id, { metadata: { ...subscription.metadata, shopify_order: order.name, shopify_order_id: order.id, upsell_order: "1" } }).catch(() => {});
              upsellAppliedEarly = true;
            }
          } catch (e) { console.warn("stripe webhook upsell:", e.message); }
        }
        const md = { ...(subscription?.metadata || {}), ...(paymentIntent?.metadata || {}) };
        const qty = parseInt(md.qty || md.bundle || "3", 10);
        const product = getProduct(md.product_key);
        const addr = customer?.shipping?.address || customer?.address || {};
        const [fn, ...ln] = String(customer?.shipping?.name || customer?.name || "").split(" ");
        // Meta CAPI: Purchase (server-side, gededupliceerd met de pixel op de bedankpagina via event_id)
        await sendPurchase({
          orderName: order.name, createdAt: inv.created * 1000, value: (inv.amount_paid || 0) / 100, currency: "EUR", provider: "stripe",
          email: customer?.email || inv.customer_email, phone: customer?.shipping?.phone || customer?.phone,
          firstName: fn, lastName: ln.join(" "), city: addr.city, zip: addr.postal_code, state: addr.state, country: addr.country || "IT",
          clientIp: md.client_ip, userAgent: md.client_ua, fbc: md.jjb_fbc, fbp: md.jjb_fbp, vid: md.jjb_vid,
          contents: [{ id: product.key === "neurotone" ? META_CONTENT_ID : product.shopifyProductId, quantity: qty }],
        });
        // Ledenportaal: record aanmaken + welkomstlink (30 dagen) voor mail 1; nooit blokkerend
        const memberInfo = {
          email: customer?.email || inv.customer_email, firstName: fn, lastName: ln.join(" "),
          phone: itPhone(customer?.shipping?.phone || customer?.phone),
          address: { address1: addr.line1, city: addr.city, zip: addr.postal_code, province: addr.state, country: addr.country || "IT" },
          provider: "stripe", subscriptionId: subscription?.id || subId, stripeCustomerId: custId, qty,
          bundleLabel: (product.bundles[qty] || product.bundles[3]).label, shippingTitle: (SHIPPING[md.shipping] || SHIPPING.insured).title,
          amountPaid: (inv.amount_paid || 0) / 100, trialEnds: subscription?.trial_end ? subscription.trial_end * 1000 : null,
          orderName: order.name, membershipPrice: product.membership.price / 100, intervalDays: product.membership.intervalDays,
          startedAt: inv.created * 1000, nextChargeAt: subscription?.current_period_end ? subscription.current_period_end * 1000 : null,
        };
        // Product zonder (NeuroTone-)portaal, bv. LubriSense: alleen eigen Klaviyo-events, geen portaal/upsell-mail
        if (!product.portal) {
          await syncProductMember(product, "started", memberInfo);
          return res.status(200).json({ received: true, order: order.name, product: product.key });
        }
        const portalLoginUrl = await registerMember(memberInfo);
        // Abonnee → Klaviyo (lijst + event "Started Membership"); nooit blokkerend
        await syncNewMember({ ...memberInfo, portalLoginUrl }); // profiel + lijst
        // Mail 1 pas na de upsellpagina (ordertabel incl. offerta 1+1); vangnet: cron na 30 min
        await holdStartedMembership(subscription?.id || subId, { ...memberInfo, portalLoginUrl }).catch((e) => console.warn("mail1 hold:", e.message));
        if (upsellAppliedEarly) await releaseStartedMembership(subscription?.id || subId, { upsellAdded: true }).catch((e) => console.warn("mail1 release:", e.message));
        return res.status(200).json({ received: true, order: order.name });
      }
      // Rebill (€49 elke 28 dagen) → alleen Klaviyo-event, geen Shopify-order
      if (inv.billing_reason === "subscription_cycle" && inv.amount_paid > 0) {
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        const sub = subId ? await stripe.subscriptions.retrieve(subId).catch(() => null) : null;
        const product = getProduct(sub?.metadata?.product_key);
        if (!product.portal) {
          await syncProductMember(product, "renewed", { email: inv.customer_email, provider: "stripe", subscriptionId: subId, invoiceId: inv.id,
            amountPaid: (inv.amount_paid || 0) / 100, nextCharge: sub?.current_period_end ? sub.current_period_end * 1000 : null });
          return res.status(200).json({ received: true, renewal: true, product: product.key });
        }
        await syncRenewal({ email: inv.customer_email, provider: "stripe", subscriptionId: subId, invoiceId: inv.id,
          amountPaid: (inv.amount_paid || 0) / 100, nextCharge: sub?.current_period_end ? sub.current_period_end * 1000 : null });
        await markRenewed(inv.customer_email, { paidAt: inv.created * 1000, nextChargeAt: sub?.current_period_end ? sub.current_period_end * 1000 : null, amountPaid: (inv.amount_paid || 0) / 100 });
        return res.status(200).json({ received: true, renewal: true });
      }
    }
    if (event.type === "invoice.payment_failed") {
      // Mislukte rebill: het portaal deactiveert het lid (status live uit Stripe) → Klaviyo-event voor de herinneringsmail
      const inv = event.data.object;
      if (inv.customer_email && inv.billing_reason === "subscription_cycle") {
        const fsubId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        const fsub = fsubId ? await stripe.subscriptions.retrieve(fsubId).catch(() => null) : null;
        const fproduct = getProduct(fsub?.metadata?.product_key);
        if (!fproduct.portal) {
          await syncProductMember(fproduct, "failed", { email: inv.customer_email, provider: "stripe", subscriptionId: fsubId, invoiceId: inv.id, amountPaid: (inv.amount_due || 0) / 100 });
          return res.status(200).json({ received: true, paymentFailed: true, product: fproduct.key });
        }
        await trackEvent("Membership Payment Failed", inv.customer_email, { provider: "stripe", subscription_id: typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id || "", amount: ((inv.amount_due || 0) / 100).toFixed(2).replace(".", ","), portal_url: `${PORTAL_URL}/riattiva` }, { uniqueId: `payfail-${inv.id}` }).catch(() => {});
      }
      return res.status(200).json({ received: true, paymentFailed: true });
    }
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const custId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const customer = custId ? await stripe.customers.retrieve(custId).catch(() => null) : null;
      const cproduct = getProduct(sub.metadata?.product_key);
      if (!cproduct.portal) {
        await syncProductMember(cproduct, "cancelled", { email: customer?.email, provider: "stripe", subscriptionId: sub.id, reason: sub.cancellation_details?.reason || "" });
        return res.status(200).json({ received: true, cancelled: true, product: cproduct.key });
      }
      await syncCancel({ email: customer?.email, provider: "stripe", subscriptionId: sub.id, reason: sub.cancellation_details?.reason || "" });
      await markCancelled(customer?.email);
      return res.status(200).json({ received: true, cancelled: true });
    }
    return res.status(200).json({ received: true, ignored: event.type });
  } catch (e) {
    console.error("stripe webhook:", event.type, e.message);
    // 500 → Stripe probeert opnieuw (tot 3 dagen); de dedupe op de factuur-tag voorkomt dubbele orders
    return res.status(500).json({ error: e.message });
  }
}
