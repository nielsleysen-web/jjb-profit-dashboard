// pages/api/paypal/upsell.js — upsell (1+1 gratis, €29,95) na een PayPal-aankoop
//
// PayPal-abonnementen hebben geen bewaarde betaalmethode die wij zelf mogen belasten; de klant bevestigt
// met één tik in de PayPal-knop op /checkout/offerta. Flow (PayPal JS SDK, intent=capture):
//   POST { action: "create",  pp: "I-…" }               → PayPal-order van €29,95 aanmaken → { id }
//   POST { action: "capture", pp: "I-…", orderId: "…" } → capture → 2x NeuroTone op de Shopify-order van de aankoop
// Alleen binnen 2 uur na de aankoop (UPSELL.windowMin); dubbele upsell wordt via de ordertag tegengehouden.

import { paypalConfigured, pp, ppTag } from "../../../lib/paypal";
import { UPSELL, PRODUCT_TITLE } from "../../../lib/checkout";
import { waitForOrder, addUpsellToOrder, findOrderByTag } from "../../../lib/upsell";
import { releaseStartedMembership } from "../../../lib/upsell-gate";
import { queueUpsell, dequeueUpsell } from "../../../lib/upsell-queue";

export const config = { maxDuration: 60 };
const eur = (c) => (c / 100).toFixed(2);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!paypalConfigured()) return res.status(500).json({ error: "PayPal non configurato" });
  const b = req.body || {};
  const id = String(b.pp || "");
  if (!/^I-[A-Z0-9]{6,}$/.test(id)) return res.status(400).json({ error: "Riferimento non valido" });

  try {
    const sub = await pp("get", `/v1/billing/subscriptions/${id}`);
    const ageMin = (Date.now() - new Date(sub.create_time || 0).getTime()) / 60000;
    if (ageMin > UPSELL.windowMin) return res.status(410).json({ error: "Questa offerta non è più disponibile." });
    if (sub.status !== "ACTIVE") return res.status(409).json({ error: "Il pagamento del tuo ordine non risulta ancora confermato." });

    const existing = await findOrderByTag(ppTag(id));
    if (existing && (existing.tags || []).includes(UPSELL.tag)) return res.status(200).json({ ok: true, already: true, order: existing.name });

    if (b.action === "create") {
      const order = await pp("post", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: "upsell",
          custom_id: `upsell:${id}`,
          description: `${PRODUCT_TITLE} — ${UPSELL.label}`,
          amount: { currency_code: "EUR", value: eur(UPSELL.price), breakdown: { item_total: { currency_code: "EUR", value: eur(UPSELL.price) } } },
          items: [{ name: `${PRODUCT_TITLE} (${UPSELL.label})`, quantity: "1", unit_amount: { currency_code: "EUR", value: eur(UPSELL.price) }, category: "PHYSICAL_GOODS" }],
        }],
        payment_source: { paypal: { experience_context: { brand_name: "Just Jenny", locale: "it-IT", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" } } },
      });
      return res.status(200).json({ id: order.id });
    }

    if (b.action === "capture") {
      const orderId = String(b.orderId || "");
      if (!/^[A-Z0-9]{8,}$/.test(orderId)) return res.status(400).json({ error: "Ordine non valido" });
      let cap;
      try {
        cap = await pp("post", `/v2/checkout/orders/${orderId}/capture`, {});
      } catch (e) {
        // Al gecaptured (dubbele klik) → status ophalen
        if (e.status === 422 && /ORDER_ALREADY_CAPTURED/.test(e.message)) cap = await pp("get", `/v2/checkout/orders/${orderId}`);
        else throw e;
      }
      const pu = cap.purchase_units?.[0];
      const capture = pu?.payments?.captures?.[0];
      if (cap.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") return res.status(402).json({ error: "Pagamento PayPal non completato." });
      if (pu.custom_id !== `upsell:${id}` || capture.amount?.value !== eur(UPSELL.price)) return res.status(400).json({ error: "Riferimento non valido" });

      // Betaald → wachtrij + mail 1 (met upsellregel), daarna de order aanvullen; mislukt dat, dan doet de cron het later
      const item = { provider: "paypal", ref: id, tag: ppTag(id), reference: `PayPal ${capture.id}`, email: sub.subscriber?.email_address || "", firstName: sub.subscriber?.name?.given_name || "" };
      await queueUpsell(item).catch((e) => console.warn("upsell queue:", e.message));
      await releaseStartedMembership(id, { upsellAdded: true }).catch((e) => console.warn("mail1 release:", e.message));
      try {
        const order = existing || (await waitForOrder(ppTag(id), { tries: 12 }));
        if (!order) { console.warn("paypal/upsell: order nog niet gevonden, in wachtrij", id); return res.status(200).json({ ok: true, pending: true, capture: capture.id }); }
        const r = await addUpsellToOrder(order, { reference: item.reference, email: order.email || item.email, firstName: order.customer?.firstName || item.firstName });
        await dequeueUpsell(id).catch(() => {});
        return res.status(200).json({ ok: true, order: r.order.name });
      } catch (e) {
        console.error("paypal/upsell attach:", id, e.message);
        return res.status(200).json({ ok: true, pending: true, capture: capture.id });
      }
    }

    return res.status(400).json({ error: "Azione non valida" });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: "Non trovato" });
    console.error("paypal/upsell:", e.message);
    return res.status(500).json({ error: "Si è verificato un errore. Riprova tra qualche istante." });
  }
}
