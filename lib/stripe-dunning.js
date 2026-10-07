// lib/stripe-dunning.js — Kortingsladder bij een mislukte Stripe-rebill door saldotekort (insufficient_funds).
//
// Stripe kan een afgeronde factuur niet voor een lager bedrag opnieuw innen. Daarom:
//   1. webhook invoice.payment_failed (decline_code insufficient_funds, billing_reason subscription_cycle)
//      → startDunning(): auto_advance uit (Stripe's eigen Smart Retries stoppen voor DEZE factuur),
//        metadata jj_dunning=1, stage=0, next=<vandaag + 2 dagen>. Andere declines blijven bij Stripe's retries.
//   2. cron /api/stripe/dunning (dagelijks) → runDunning(): voor elke open factuur met jj_dunning=1 waarvan
//      "next" vandaag of eerder is: een PaymentIntent (off_session, opgeslagen kaart) voor het bedrag min korting.
//        stage 1 → dag 2  → 10%     stage 2 → dag 5 → 20%     stage 3 → dag 9 → 30%
//      Gelukt  → factuur "paid out of band" (abonnement wordt weer active; invoice.paid-webhook doet Klaviyo/portaal
//                zoals bij elke rebill). Het echte bedrag staat in metadata jj_dunning_amount (zie paidAmount()).
//      Mislukt → volgende stage; na de 30%-poging: abonnement annuleren + factuur voiden
//                (customer.subscription.deleted-webhook doet de bestaande opzegflow).
//   Betaalt de klant intussen zelf (portaal /riattiva, nieuwe kaart) dan is de factuur niet meer open → overslaan.
//
// Alles staat in Stripe-metadata; geen eigen database. Idempotent per factuur + stage (idempotencyKey).

import Stripe from "stripe";

const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null);

// Dag (na de mislukte rebill) en korting per poging
export const LADDER = [
  { stage: 1, day: 2, pct: 10 },
  { stage: 2, day: 5, pct: 20 },
  { stage: 3, day: 9, pct: 30 },
];
export const DUNNING_DECLINES = ["insufficient_funds"];

const TZ = "Europe/Rome";
export const dayStr = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: TZ });
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const idOf = (v) => (typeof v === "string" ? v : v?.id || null);

// Werkelijk betaald bedrag van een factuur (euro): bij een kortingsbetaling staat Stripe's amount_paid op het volle bedrag
export function paidAmount(inv) {
  const m = inv?.metadata || {};
  if (m.jj_dunning_amount) {
    const n = Number(m.jj_dunning_amount);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return (inv?.amount_paid || 0) / 100;
}

// Decline-code van de laatste mislukte poging op een factuur
export async function failedDeclineCode(inv) {
  const s = stripe();
  const piId = idOf(inv.payment_intent);
  if (!s || !piId) return null;
  const pi = typeof inv.payment_intent === "object" && inv.payment_intent?.last_payment_error ? inv.payment_intent : await s.paymentIntents.retrieve(piId).catch(() => null);
  const err = pi?.last_payment_error;
  return err?.decline_code || err?.code || null;
}

// Vanuit de webhook: ladder starten voor een mislukte rebill. Geeft { started, reason } terug.
export async function startDunning(inv) {
  const s = stripe();
  if (!s) return { started: false, reason: "no-stripe" };
  if (inv.billing_reason !== "subscription_cycle") return { started: false, reason: "not-rebill" };
  if (inv.metadata?.jj_dunning) return { started: false, reason: "already" };
  const fresh = await s.invoices.retrieve(inv.id);
  if (fresh.status !== "open" || !fresh.amount_due) return { started: false, reason: `status-${fresh.status}` };
  if (fresh.metadata?.jj_dunning) return { started: false, reason: "already" };
  const code = await failedDeclineCode(fresh);
  if (!DUNNING_DECLINES.includes(code)) return { started: false, reason: `decline-${code || "unknown"}` };
  const failedAt = dayStr();
  await s.invoices.update(inv.id, {
    auto_advance: false, // Stripe's eigen retries uit voor deze factuur; wij nemen het over
    metadata: { ...(fresh.metadata || {}), jj_dunning: "1", jj_dunning_stage: "0", jj_dunning_failed: failedAt, jj_dunning_next: addDays(failedAt, LADDER[0].day), jj_dunning_code: code },
  });
  console.log(`dunning start: ${inv.id} (${code}) → ${LADDER[0].pct}% op ${addDays(failedAt, LADDER[0].day)}`);
  return { started: true, next: addDays(failedAt, LADDER[0].day) };
}

// Kaart waarmee we opnieuw proberen: abonnement → klant → de kaart van de mislukte poging
async function paymentMethodFor(s, inv, sub) {
  const fromSub = idOf(sub?.default_payment_method);
  if (fromSub) return fromSub;
  const custId = idOf(inv.customer);
  const cust = custId ? await s.customers.retrieve(custId).catch(() => null) : null;
  const fromCust = idOf(cust?.invoice_settings?.default_payment_method);
  if (fromCust) return fromCust;
  const piId = idOf(inv.payment_intent);
  const pi = piId ? await s.paymentIntents.retrieve(piId).catch(() => null) : null;
  return idOf(pi?.payment_method) || idOf(pi?.last_payment_error?.payment_method);
}

async function finishFailed(s, inv, sub, log) {
  const subId = idOf(inv.subscription);
  if (subId && sub && sub.status !== "canceled") {
    await s.subscriptions.cancel(subId, { cancellation_details: { comment: "Rebill failed after discount ladder (10/20/30%)" } }).catch((e) => log.push(`cancel ${subId}: ${e.message}`));
  }
  await s.invoices.update(inv.id, { metadata: { ...(inv.metadata || {}), jj_dunning: "done", jj_dunning_result: "cancelled" } }).catch(() => {});
  await s.invoices.voidInvoice(inv.id).catch((e) => log.push(`void ${inv.id}: ${e.message}`));
}

// Eén poging voor één factuur. Geeft een korte uitkomst terug.
export async function attemptInvoice(inv, { force = false } = {}) {
  const s = stripe();
  const log = [];
  const md = inv.metadata || {};
  const stageDone = parseInt(md.jj_dunning_stage || "0", 10);
  const step = LADDER[stageDone]; // volgende poging
  const today = dayStr();
  if (!step) return { id: inv.id, skipped: "ladder-complete" };
  if (!force && md.jj_dunning_next && md.jj_dunning_next > today) return { id: inv.id, skipped: `not-due (${md.jj_dunning_next})` };

  const fresh = await s.invoices.retrieve(inv.id);
  if (fresh.status !== "open") {
    await s.invoices.update(inv.id, { metadata: { ...md, jj_dunning: "done", jj_dunning_result: `invoice-${fresh.status}` } }).catch(() => {});
    return { id: inv.id, skipped: `invoice-${fresh.status}` };
  }
  const subId = idOf(fresh.subscription);
  const sub = subId ? await s.subscriptions.retrieve(subId).catch(() => null) : null;
  if (!sub || sub.status === "canceled") {
    await s.invoices.update(inv.id, { metadata: { ...md, jj_dunning: "done", jj_dunning_result: "subscription-canceled" } }).catch(() => {});
    await s.invoices.voidInvoice(inv.id).catch(() => {});
    return { id: inv.id, skipped: "subscription-canceled" };
  }
  const pm = await paymentMethodFor(s, fresh, sub);
  if (!pm) {
    await finishFailed(s, fresh, sub, log);
    return { id: inv.id, result: "no-payment-method → cancelled", log };
  }

  const amount = Math.round(fresh.amount_due * (1 - step.pct / 100));
  const productKey = sub.metadata?.product_key || "";
  let pi = null, error = null;
  try {
    pi = await s.paymentIntents.create(
      {
        amount, currency: fresh.currency || "eur", customer: idOf(fresh.customer), payment_method: pm,
        off_session: true, confirm: true,
        description: `Membership rebill −${step.pct}% (retry ${step.stage}/3) · invoice ${fresh.id}`,
        metadata: { jj_dunning_invoice: fresh.id, jj_dunning_stage: String(step.stage), jj_dunning_pct: String(step.pct), subscription: subId, product_key: productKey, kind: "dunning-retry" },
      },
      { idempotencyKey: `jj-dunning-${fresh.id}-${step.stage}` }
    );
  } catch (e) {
    error = e;
    pi = e?.payment_intent || e?.raw?.payment_intent || null;
  }

  if (pi?.status === "succeeded") {
    const paid = amount / 100;
    await s.invoices.update(fresh.id, { metadata: { ...md, jj_dunning: "done", jj_dunning_stage: String(step.stage), jj_dunning_result: `paid-${step.pct}`, jj_dunning_amount: paid.toFixed(2), jj_dunning_pi: pi.id } });
    // Factuur buiten Stripe om als betaald markeren → abonnement weer active, invoice.paid-webhook doet de rest
    await s.invoices.pay(fresh.id, { paid_out_of_band: true });
    console.log(`dunning paid: ${fresh.id} stage ${step.stage} (−${step.pct}%) €${paid.toFixed(2)} ${pi.id}`);
    return { id: inv.id, result: `paid −${step.pct}% €${paid.toFixed(2)}`, pi: pi.id };
  }

  // Mislukt (of vreemde status zoals requires_action: off-session kan geen 3DS doen) → volgende stage of einde
  const code = pi?.last_payment_error?.decline_code || pi?.last_payment_error?.code || error?.decline_code || error?.code || pi?.status || "unknown";
  if (pi && pi.status !== "canceled" && pi.status !== "succeeded" && !["requires_payment_method"].includes(pi.status)) {
    await s.paymentIntents.cancel(pi.id).catch(() => {}); // bv. requires_action: niet laten hangen
  }
  const next = LADDER[step.stage]; // index = stage → volgende stap
  if (next) {
    const failedAt = md.jj_dunning_failed || today;
    const nextDay = addDays(failedAt, next.day) > today ? addDays(failedAt, next.day) : addDays(today, 1);
    await s.invoices.update(fresh.id, { metadata: { ...md, jj_dunning_stage: String(step.stage), jj_dunning_next: nextDay, [`jj_dunning_fail_${step.stage}`]: code } });
    console.log(`dunning failed: ${fresh.id} stage ${step.stage} (${code}) → ${next.pct}% op ${nextDay}`);
    return { id: inv.id, result: `failed −${step.pct}% (${code}) → next ${next.pct}% on ${nextDay}` };
  }
  await s.invoices.update(fresh.id, { metadata: { ...md, jj_dunning_stage: String(step.stage), [`jj_dunning_fail_${step.stage}`]: code } }).catch(() => {});
  await finishFailed(s, { ...fresh, metadata: { ...md, jj_dunning_stage: String(step.stage) } }, sub, log);
  console.log(`dunning end: ${fresh.id} stage ${step.stage} (${code}) → subscription cancelled`);
  return { id: inv.id, result: `failed −${step.pct}% (${code}) → subscription cancelled`, log };
}

// Bestaande mislukte rebills (van vóór de ladder, of gemist) alsnog in de ladder zetten.
// Open subscription_cycle-facturen met decline insufficient_funds en een niet-opgezegd abonnement
// → jj_dunning=1 met "next" = vandaag, zodat de eerstvolgende run meteen de 10%-poging doet.
// dry=true: alleen de lijst tonen, niets wijzigen.
export async function enrollOpenFailures({ dry = false } = {}) {
  const s = stripe();
  if (!s) return { ok: false, error: "STRIPE_SECRET_KEY ontbreekt" };
  const today = dayStr();
  const enrolled = [], skipped = [];
  let n = 0;
  for await (const inv of s.invoices.list({ status: "open", limit: 100, expand: ["data.payment_intent"] })) {
    if (++n > 3000) break;
    if (inv.billing_reason !== "subscription_cycle" || !inv.attempted || !inv.amount_due) continue;
    const row = { id: inv.id, email: inv.customer_email, amount: (inv.amount_due || 0) / 100, failedAt: dayStr((inv.status_transitions?.finalized_at || inv.created) * 1000), attempts: inv.attempt_count || 0 };
    if (inv.metadata?.jj_dunning) { skipped.push({ ...row, why: `already (${inv.metadata.jj_dunning})` }); continue; }
    const code = await failedDeclineCode(inv);
    row.decline = code;
    if (!DUNNING_DECLINES.includes(code)) { skipped.push({ ...row, why: `decline ${code || "unknown"}` }); continue; }
    const subId = idOf(inv.subscription);
    const sub = subId ? await s.subscriptions.retrieve(subId).catch(() => null) : null;
    if (!sub || sub.status === "canceled") { skipped.push({ ...row, why: "subscription canceled" }); continue; }
    if (sub.pause_collection) { skipped.push({ ...row, why: "subscription paused" }); continue; }
    if (!dry) {
      await s.invoices.update(inv.id, {
        auto_advance: false,
        metadata: { ...(inv.metadata || {}), jj_dunning: "1", jj_dunning_stage: "0", jj_dunning_failed: today, jj_dunning_next: today, jj_dunning_code: code, jj_dunning_enrolled: "backfill" },
      });
      console.log(`dunning enroll: ${inv.id} ${inv.customer_email} (${code}) → 10% vandaag`);
    }
    enrolled.push(row);
  }
  return { ok: true, today, dry, enrolled, skipped };
}

// Alle open facturen in de ladder langslopen (cron). dry=true: alleen tonen wat er zou gebeuren.
export async function runDunning({ dry = false, force = false } = {}) {
  const s = stripe();
  if (!s) return { ok: false, error: "STRIPE_SECRET_KEY ontbreekt" };
  const today = dayStr();
  const due = [], waiting = [], results = [];
  let n = 0;
  for await (const inv of s.invoices.search({ query: "status:'open' AND metadata['jj_dunning']:'1'", limit: 100 })) {
    if (++n > 2000) break;
    const md = inv.metadata || {};
    const stageDone = parseInt(md.jj_dunning_stage || "0", 10);
    const step = LADDER[stageDone];
    if (!step) continue;
    const row = { id: inv.id, email: inv.customer_email, amount: (inv.amount_due || 0) / 100, nextStage: step.stage, pct: step.pct, next: md.jj_dunning_next, failed: md.jj_dunning_failed };
    if (force || !md.jj_dunning_next || md.jj_dunning_next <= today) due.push({ inv, row });
    else waiting.push(row);
  }
  if (dry) return { ok: true, today, due: due.map((d) => d.row), waiting };
  for (const { inv } of due) {
    try { results.push(await attemptInvoice(inv, { force })); }
    catch (e) { results.push({ id: inv.id, error: e.message }); console.error("dunning:", inv.id, e.message); }
  }
  return { ok: true, today, attempted: results, waiting };
}
