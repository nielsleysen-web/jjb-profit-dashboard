// lib/upsell.js — post-purchase upsell (1+1 gratis) op een bestaande Shopify-order zetten (server-only)
//
// addUpsellToOrder(orderId): order-edit → variant × 2 toevoegen → regelkorting tot €29,95 → commit (klant krijgt
// géén mail) → openstaand saldo als betaald markeren (het geld is al via Stripe/PayPal geïnd) → tag upsell-1plus1.
// Idempotent: een order met de tag wordt niet nog eens aangepast.
// Shopify-scopes: read/write_order_edits + write_orders (naast de bestaande).

import { shopifyGraphql } from "./shopify-admin";
import { UPSELL } from "./checkout";

const eur = (c) => (c / 100).toFixed(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function findOrderByTag(tag) {
  const d = await shopifyGraphql(`query($q: String!) { orders(first: 1, query: $q) { nodes { id name tags statusPageUrl } } }`, { q: `tag:'${tag}'` });
  return d.orders.nodes[0] || null;
}

// Wachten tot de order er is (webhook/confirm kan een paar seconden achterlopen)
export async function waitForOrder(tag, { tries = 8, delayMs = 2500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const o = await findOrderByTag(tag);
    if (o) return o;
    await sleep(delayMs);
  }
  return null;
}

function errs(list, where) {
  if (list && list.length) throw new Error(`${where}: ` + list.map((e) => `${(e.field || []).join(".")} ${e.message}`).join("; "));
}

export async function addUpsellToOrder(order, { reference = "" } = {}) {
  if ((order.tags || []).includes(UPSELL.tag)) return { order, skipped: "already" };

  const b = await shopifyGraphql(`mutation($id: ID!) { orderEditBegin(id: $id) { calculatedOrder { id } userErrors { field message } } }`, { id: order.id });
  errs(b.orderEditBegin.userErrors, "orderEditBegin");
  const calcId = b.orderEditBegin.calculatedOrder.id;

  const a = await shopifyGraphql(
    `mutation($id: ID!, $variantId: ID!, $quantity: Int!) { orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity, allowDuplicates: true) { calculatedLineItem { id quantity originalUnitPriceSet { shopMoney { amount } } } userErrors { field message } } }`,
    { id: calcId, variantId: UPSELL.variantId, quantity: UPSELL.qty }
  );
  errs(a.orderEditAddVariant.userErrors, "orderEditAddVariant");
  const li = a.orderEditAddVariant.calculatedLineItem;
  const lineId = li.id;

  // Korting = catalogusprijs van de regel (variantprijs × 2) − €29,95, zodat de orderregel precies de upsellprijs toont
  const lineCents = Math.round(parseFloat(li.originalUnitPriceSet?.shopMoney?.amount || "0") * 100) * (li.quantity || UPSELL.qty);
  const disc = lineCents - UPSELL.price;
  if (disc > 0) {
    const d = await shopifyGraphql(
      `mutation($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) { orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) { userErrors { field message } } }`,
      { id: calcId, lineItemId: lineId, discount: { description: "Offerta 1+1 gratis", fixedValue: { amount: eur(disc), currencyCode: "EUR" } } }
    );
    errs(d.orderEditAddLineItemDiscount.userErrors, "orderEditAddLineItemDiscount");
  }

  const c = await shopifyGraphql(
    `mutation($id: ID!, $note: String) { orderEditCommit(id: $id, notifyCustomer: false, staffNote: $note) { order { id name } userErrors { field message } } }`,
    { id: calcId, note: `Upsell 1+1 gratis: ${UPSELL.qty}x NeuroTone voor €${eur(UPSELL.price)}${reference ? ` · ${reference}` : ""}` }
  );
  errs(c.orderEditCommit.userErrors, "orderEditCommit");

  // Het openstaande saldo is al geïnd via Stripe/PayPal → als betaald markeren
  const p = await shopifyGraphql(`mutation($input: OrderMarkAsPaidInput!) { orderMarkAsPaid(input: $input) { order { id } userErrors { field message } } }`, { input: { id: order.id } });
  if (p.orderMarkAsPaid.userErrors?.length) console.warn("upsell orderMarkAsPaid:", JSON.stringify(p.orderMarkAsPaid.userErrors));

  const t = await shopifyGraphql(`mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`, { id: order.id, tags: [UPSELL.tag] });
  errs(t.tagsAdd.userErrors, "tagsAdd");

  return { order: { ...order, name: c.orderEditCommit.order.name }, added: true };
}
