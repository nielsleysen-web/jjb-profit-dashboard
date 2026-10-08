// pages/api/stripe/upsell.js — one-click upsell (1+1 gratis: NeuroTone €29,95 / LubriSense €34,95) na een Stripe-aankoop
// Het product volgt uit subscription.metadata.product_key (lib/checkout.js upsellFor).
//
// POST { sub: "sub_…" }            → afschrijven op de bewaarde betaalmethode van het abonnement (off-session),
//                                     daarna 2x NeuroTone aan de Shopify-order van die aankoop toevoegen
// POST { sub: "sub_…", pi: "pi_…" } → na een bankbevestiging (3-D Secure) in de browser: afronden (order aanvullen)
//
// Veiligheid: alleen abonnementen van de laatste 2 uur (UPSELL.windowMin), één upsell per abonnement
// (idempotency key + metadata upsell_pi), bedrag en product staan vast in lib/checkout.js.
// Antwoord: { ok, order, pending } · { requires_action, client_secret } · { error }

import Stripe from "stripe";
import { upsellFor, getProduct } from "../../../lib/checkout";
import { waitForOrder, addUpsellToOrder } from "../../../lib/upsell";
import { releaseStartedMembership } from "../../../lib/upsell-gate";
import { queueUpsell, dequeueUpsell } from "../../../lib/upsell-queue";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
export const config = { maxDuration: 60 };

const invTag = (invoiceId) => `stripe-inv-${invoiceId}`.slice(0, 40);

// Na een geslaagde betaling: wachtrij + mail 1 vrijgeven (met upsellregel), daarna de order aanvullen.
// Mislukt dat laatste (order nog niet vindbaar, Shopify-fout …) dan blijft de upsell in de wachtrij en zet de
// cron (/api/checkout/sweep) hem later alsnog op de order. De klant krijgt NOOIT een foutmelding na betaling.
async function afterPaid(sub, pi) {
  const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  const customer = typeof sub.customer === "object" ? sub.customer : null;
  const productKey = getProduct(sub.metadata?.product_key).key;
  const UPSELL = upsellFor(productKey);
  const item = {
    provider: "stripe", ref: sub.id, tag: inv ? invTag(inv.id) : "", orderId: sub.metadata?.shopify_order_id || null,
    reference: `Stripe ${pi.id}`, email: customer?.email || "", firstName: String(customer?.shipping?.name || customer?.name || "").split(" ")[0] || "",
    product: productKey,
  };
  await queueUpsell(item).catch((e) => console.warn("upsell queue:", e.message));
  await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id, upsell_qty: String(UPSELL.qty) } }).catch(() => {});
  await releaseStartedMembership(sub.id, { upsellAdded: true }).catch((e) => console.warn("mail1 release:", e.message));
  try {
    const order = inv ? await waitForOrder(item.tag, { orderId: item.orderId }) : null;
    if (!order) { console.warn("stripe/upsell: order nog niet gevonden, in wachtrij", sub.id, item.tag); return { pending: true }; }
    const r = await addUpsellToOrder(order, { reference: item.reference, email: order.email || item.email, firstName: order.customer?.firstName || item.firstName, product: productKey });
    await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id, upsell_qty: String(UPSELL.qty), upsell_order: "1", shopify_order: order.name, shopify_order_id: order.id } }).catch(() => {});
    await dequeueUpsell(sub.id).catch(() => {});
    return { order: r.order?.name || order.name };
  } catch (e) {
    console.error("stripe/upsell attach:", sub.id, e.message);
    return { pending: true };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(500).json({ error: "Pagamento non configurato" });
  const subId = String(req.body?.sub || "");
  if (!/^sub_[A-Za-z0-9]{8,}$/.test(subId)) return res.status(400).json({ error: "Riferimento non valido" });

  try {
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["customer", "default_payment_method", "latest_invoice.payment_intent"] });
    const product = getProduct(sub.metadata?.product_key);
    const UPSELL = upsellFor(product.key);
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
        const r = await afterPaid(sub, pi);
        return res.status(200).json({ ok: true, order: r.order || null, pending: !!r.pending });
      }
    }

    // --- betaalmethode van de aankoop hergebruiken ---
    const pmId =
      (sub.default_payment_method && (typeof sub.default_payment_method === "object" ? sub.default_payment_method.id : sub.default_payment_method)) ||
      (typeof firstPi?.payment_method === "string" ? firstPi.payment_method : firstPi?.payment_method?.id) ||
      customer?.invoice_settings?.default_payment_method ||
      null;
    if (!pmId) return res.status(409).json({ error: "Nessun metodo di pagamento salvato per questo ordine." });
    const customerId = customer?.id || (typeof sub.customer === "string" ? sub.customer : null);

    // Het betaalmiddel van de eerste betaling is soms nog niet aan de klant gekoppeld (Elements + save_default_payment_method
    // gebeurt pas na de factuur) → koppelen, anders weigert Stripe de off-session afschrijving.
    let pm;
    try {
      pm = await stripe.paymentMethods.retrieve(pmId);
      if (!pm.customer && customerId) pm = await stripe.paymentMethods.attach(pmId, { customer: customerId });
      else if (pm.customer && customerId && pm.customer !== customerId) return res.status(409).json({ error: "Metodo di pagamento non valido per questo ordine." });
    } catch (e) {
      console.warn("stripe/upsell pm:", e.code, e.message);
      return res.status(409).json({ error: "Il metodo di pagamento non è riutilizzabile. Riprova dal portale membri." });
    }

    // Idempotency: dezelfde key herhaalt bij Stripe 24 uur lang ook een MISLUKT antwoord → per poging een
    // nieuwe key (teller in de metadata), zodat "Riprova" na een weigering echt opnieuw probeert.
    const attempt = Number(sub.metadata?.upsell_attempts || 0) + 1;
    await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_attempts: String(attempt) } }).catch(() => {});
    const card = pm.card || {};
    const pmInfo = `${pm.type}${card.brand ? "/" + card.brand : ""}${card.funding ? "/" + card.funding : ""}${card.wallet?.type ? "/wallet:" + card.wallet.type : ""}${card.country ? "/" + card.country : ""}`;

    let pi;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: UPSELL.price,
          currency: "eur",
          customer: customerId || undefined,
          payment_method: pm.id,
          off_session: true,
          confirm: true,
          description: `${product.title} — ${UPSELL.label} (upsell post-acquisto)`,
          receipt_email: customer?.email || undefined,
          metadata: { source: "jjb-checkout", kind: "upsell", upsell: UPSELL.tag, qty: String(UPSELL.qty), subscription_id: sub.id, invoice_id: inv.id, shopify_order: sub.metadata?.shopify_order || "", product_key: product.key },
        },
        { idempotencyKey: `jjup_${sub.id}_${attempt}` }
      );
    } catch (e) {
      // Bank wil een extra bevestiging → de pagina rondt het af met Stripe.js en roept ons daarna met ?pi= opnieuw aan
      if (e.code === "authentication_required" && e.raw?.payment_intent?.client_secret) {
        await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: e.raw.payment_intent.id } }).catch(() => {});
        return res.status(200).json({ requires_action: true, client_secret: e.raw.payment_intent.client_secret, pi: e.raw.payment_intent.id });
      }
      console.error("stripe/upsell charge:", e.code, e.decline_code || "-", e.message, "| sub", sub.id, "pm", pm.id, pmInfo, "attempt", attempt);
      const msg = e.type === "StripeCardError" ? "La tua carta non ha autorizzato l'addebito." : "Impossibile completare l'addebito. Riprova.";
      return res.status(402).json({ error: msg, code: e.code || null });
    }

    if (pi.status === "requires_action" && pi.client_secret) {
      await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, upsell_pi: pi.id } }).catch(() => {});
      return res.status(200).json({ requires_action: true, client_secret: pi.client_secret, pi: pi.id });
    }
    if (pi.status !== "succeeded") return res.status(402).json({ error: "Addebito non riuscito. Riprova." });

    // Betaald → wachtrij + mail 1 + order aanvullen (de webhook neemt de upsell mee als de order nog gemaakt moet worden)
    const r = await afterPaid(sub, pi);
    return res.status(200).json({ ok: true, order: r.order || null, pending: !!r.pending });
  } catch (e) {
    if (e.statusCode === 404 || e.code === "resource_missing") return res.status(404).json({ error: "Non trovato" });
    console.error("stripe/upsell:", e.message);
    return res.status(500).json({ error: "Si è verificato un errore. Riprova tra qualche istante." });
  }
}
