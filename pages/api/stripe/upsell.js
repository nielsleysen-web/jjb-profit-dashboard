// pages/api/stripe/upsell.js — one-click upsell (1+1 gratis, €29,95) na een Stripe-aankoop
//
// POST { sub: "sub_…" }            → afschrijven op de bewaarde betaalmethode van het abonnement (off-session),
//                                     daarna 2x NeuroTone aan de Shopify-order van die aankoop toevoegen
// POST { sub: "sub_…", pi: "pi_…" } → na een bankbevestiging (3-D Secure) in de browser: afronden (order aanvullen)
//
// Veiligheid: alleen abonnementen van de laatste 2 uur (UPSELL.windowMin), één upsell per abonnement
// (idempotency key + metadata upsell_pi), bedrag en product staan vast in lib/checkout.js.
// Antwoord: { ok, order, pending } · { requires_action, client_secret } · { error }

import Stripe from "stripe";
import { UPSELL, PRODUCT_TITLE } from "../../../lib/checkout";
import { waitForOrder, addUpsellToOrder } from "../../../lib/upsell";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const config = { maxDuration: 60 };

const invTag = (invoiceId) => `stripe-inv-${invoiceId}`.slice(0, 40);

// Order van de eerste factuur zoeken en de upsell erop zetten; null als de order er (nog) niet is
async function attachToOrder(sub, pi) {
  const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  if (!inv) return null;
  const order = await waitForOrder(invTag(inv.id));
  if (!order) return null;
  const r = await addUpsellToOrder(order, { reference: `Stripe ${pi.id}` });
  await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id, upsell_qty: String(UPSELL.qty), upsell_order: "1" } }).catch(() => {});
  return r.order;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(500).json({ error: "Pagamento non configurato" });
  const subId = String(req.body?.sub || "");
  if (!/^sub_[A-Za-z0-9]{8,}$/.test(subId)) return res.status(400).json({ error: "Riferimento non valido" });

  try {
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer", "default_payment_method", "latest_invoice.payment_intent"] });
    const ageMin = (Date.now() / 1000 - sub.created) / 60;
    if (ageMin > UPSELL.windowMin) return res.status(410).json({ error: "Questa offerta non è più disponibile." });
    const customer = typeof sub.customer === "object" ? sub.customer : null;
    const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const firstPi = inv?.payment_intent && typeof inv.payment_intent === "object" ? inv.payment_intent : null;
    if (!inv || inv.status !== "paid") return res.status(409).json({ error: "Il pagamento del tuo ordine non risulta ancora confermato." });

    // --- al gedaan? (dubbelklik, herladen) → alleen nog de order aanvullen als dat nog niet lukte ---
    const existingPiId = req.body?.pi || sub.metadata?.upsell_pi;
    if (existingPiId) {
      const pi = await stripe.paymentIntents.retrieve(String(existingPiId));
      if (pi.status === "succeeded") {
        if (sub.metadata?.upsell_order === "1") return res.status(200).json({ ok: true, already: true });
        if (pi.metadata?.subscription_id !== sub.id) return res.status(400).json({ error: "Riferimento non valido" });
        const order = await attachToOrder(sub, pi);
        return res.status(200).json({ ok: true, order: order?.name || null, pending: !order });
      }
    }

    // --- betaalmethode van de aankoop hergebruiken ---
    const pmId =
      (sub.default_payment_method && (typeof sub.default_payment_method === "object" ? sub.default_payment_method.id : sub.default_payment_method)) ||
      (typeof firstPi?.payment_method === "string" ? firstPi.payment_method : firstPi?.payment_method?.id) ||
      customer?.invoice_settings?.default_payment_method ||
      null;
    if (!pmId) return res.status(409).json({ error: "Nessun metodo di pagamento salvato per questo ordine." });

    let pi;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: UPSELL.price,
          currency: "eur",
          customer: customer?.id || (typeof sub.customer === "string" ? sub.customer : undefined),
          payment_method: pmId,
          off_session: true,
          confirm: true,
          description: `${PRODUCT_TITLE} — ${UPSELL.label} (upsell post-acquisto)`,
          receipt_email: customer?.email || undefined,
          metadata: { source: "jjb-checkout", kind: "upsell", upsell: UPSELL.tag, qty: String(UPSELL.qty), subscription_id: sub.id, invoice_id: inv.id, shopify_order: sub.metadata?.shopify_order || "" },
        },
        { idempotencyKey: `jjup_${sub.id}` }
      );
    } catch (e) {
      // Bank wil een extra bevestiging → de pagina rondt het af met Stripe.js en roept ons daarna met ?pi= opnieuw aan
      if (e.code === "authentication_required" && e.raw?.payment_intent?.client_secret) {
        await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: e.raw.payment_intent.id } }).catch(() => {});
        return res.status(200).json({ requires_action: true, client_secret: e.raw.payment_intent.client_secret, pi: e.raw.payment_intent.id });
      }
      console.warn("stripe/upsell charge:", e.code, e.message);
      return res.status(402).json({ error: e.type === "StripeCardError" ? "La tua carta non ha autorizzato l'addebito." : "Impossibile completare l'addebito. Riprova." });
    }

    if (pi.status === "requires_action" && pi.client_secret) {
      await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id } }).catch(() => {});
      return res.status(200).json({ requires_action: true, client_secret: pi.client_secret, pi: pi.id });
    }
    if (pi.status !== "succeeded") return res.status(402).json({ error: "Addebito non riuscito. Riprova." });

    // Betaald → vastleggen op het abonnement (de webhook neemt de upsell mee als de order nog gemaakt moet worden)
    await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id, upsell_qty: String(UPSELL.qty) } }).catch(() => {});
    const order = await attachToOrder(sub, pi);
    return res.status(200).json({ ok: true, order: order?.name || null, pending: !order });
  } catch (e) {
    if (e.statusCode === 404 || e.code === "resource_missing") return res.status(404).json({ error: "Non trovato" });
    console.error("stripe/upsell:", e.message);
    return res.status(500).json({ error: "Si è verificato un errore. Riprova tra qualche istante." });
  }
}
