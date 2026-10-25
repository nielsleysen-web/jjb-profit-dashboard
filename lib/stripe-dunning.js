// lib/stripe-dunning.js — Kortingsladder bij een mislukte Stripe-rebill door saldotekort (insufficient_funds).
//
// Stripe kan een afgeronde factuur niet voor een lager bedrag opnieuw innen. Daarom:
//   1. webhook invoice.payment_failed (decline_code insufficient_funds, billing_reason subscription_cycle)
//      → startDunning(): auto_advance uit (Stripe's eigen Smart Retries stoppen voor DEZE factuur),
//        metadata jj_dunning=1, stage=0, next=<vandaag + 2 dagen>. Andere declines blijven bij Stripe's retries,
//        behalve NO_RETRY_DECLINES (3DS vereist, fout kaartnummer, pick-up card, kaartlimiet): die worden meteen
//        gevoid + opgezegd (stopNoRetry) — opnieuw proberen lukt daar nooit.
//   2. cron /api/stripe/dunning (dagelijks) → runDunning(): voor elke open factuur met jj_dunning=1 waarvan
//      "next" vandaag of eerder is: een PaymentIntent (off_session, opgeslagen kaart) voor het bedrag min korting.
//        stage 1 → dag 2 → −20%     stage 2 → dag 5 → vast €24,95     stage 3 → dag 9 → vast €19,95
//      Lukt een poging met een vast bedrag (€24,95 / €19,95), dan gaat het abonnement van die klant vanaf de volgende
//      cyclus naar dat bedrag per 28 dagen (downgradeSubscription): dat bedrag kan de kaart blijkbaar wel dragen.
//      Gelukt  → factuur "paid out of band" (abonnement wordt weer active; invoice.paid-webhook doet Klaviyo/portaal
//                zoals bij elke rebill). Het echte bedrag staat in metadata jj_dunning_amount (zie paidAmount()).
//      Mislukt → volgende stage; na de laatste poging: abonnement annuleren + factuur voiden
//                (customer.subscription.deleted-webhook doet de bestaande opzegflow).
//   Betaalt de klant intussen zelf (portaal /riattiva, nieuwe kaart) dan is de factuur niet meer open → overslaan.
//
// Alles staat in Stripe-metadata; geen eigen database. Idempotent per factuur + stage (idempotencyKey).

import Stripe from "stripe";

const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null);

// Dag (na de mislukte rebill) en korting per poging
export const LADDER = [
  { stage: 1, day: 2, pct: 20, label: "−20%" },
  { stage: 2, day: 5, fixed: 2495, label: "€24.95", downgrade: true }, // vast bedrag; gelukt → abonnement naar €24,95
  { stage: 3, day: 9, fixed: 1995, label: "€19.95", downgrade: true }, // vast bedrag; gelukt → abonnement naar €19,95
];
// Bedrag (centen) van een poging op een factuur van fullCents
export const stepAmount = (step, fullCents) => (step.fixed ? Math.min(step.fixed, fullCents) : Math.round(fullCents * (1 - step.pct / 100)));
// Korting in procent (afgerond) — voor metadata/rapportage, ook bij een vast bedrag
export const stepPct = (step, fullCents) => (step.fixed ? Math.max(0, Math.round((1 - stepAmount(step, fullCents) / Math.max(1, fullCents)) * 100)) : step.pct);
export const DUNNING_DECLINES = ["insufficient_funds"];
// Declines waarbij opnieuw proberen in de praktijk nooit lukt (3DS vereist kan off-session niet; fout/ingetrokken
// kaartnummer; kaartlimiet): geen ladder én geen Stripe Smart Retries → factuur voiden en abonnement meteen opzeggen
// (customer.subscription.deleted-webhook doet de gewone opzegflow). Scheelt dagen "past_due" en zinloze pogingen.
export const NO_RETRY_DECLINES = [
  "authentication_required", // 3DS / authenticatie vereist
  "incorrect_number", "invalid_number", // kaartnummer klopt niet
  "pickup_card", // pick-up card (bank heeft de kaart ingetrokken)
  "card_velocity_exceeded", "withdrawal_count_limit_exceeded", // kaartlimiet overschreden
];

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
  if (NO_RETRY_DECLINES.includes(code)) {
    const r = await stopNoRetry(s, fresh, code);
    return { started: false, reason: `no-retry-${code}`, cancelled: r.cancelled, log: r.log };
  }
  if (!DUNNING_DECLINES.includes(code)) return { started: false, reason: `decline-${code || "unknown"}` };
  const failedAt = dayStr();
  await s.invoices.update(inv.id, {
    auto_advance: false, // Stripe's eigen retries uit voor deze factuur; wij nemen het over
    metadata: { ...(fresh.metadata || {}), jj_dunning: "1", jj_dunning_stage: "0", jj_dunning_failed: failedAt, jj_dunning_next: addDays(failedAt, LADDER[0].day), jj_dunning_code: code },
  });
  console.log(`dunning start: ${inv.id} (${code}) → ${LADDER[0].label} op ${addDays(failedAt, LADDER[0].day)}`);
  return { started: true, next: addDays(failedAt, LADDER[0].day) };
}

// Decline zonder kans (NO_RETRY_DECLINES): Stripe's retries uit, factuur voiden, abonnement opzeggen.
// Idempotent: een al-gevoide factuur of al-opgezegd abonnement wordt overgeslagen.
async function stopNoRetry(s, inv, code) {
  const log = [];
  let cancelled = false;
  const subId = idOf(inv.subscription);
  const sub = subId ? await s.subscriptions.retrieve(subId).catch(() => null) : null;
  await s.invoices.update(inv.id, {
    auto_advance: false,
    metadata: { ...(inv.metadata || {}), jj_dunning: "done", jj_dunning_stage: "0", jj_dunning_failed: dayStr(), jj_dunning_code: code, jj_dunning_result: "no-retry" },
  }).catch((e) => log.push(`update ${inv.id}: ${e.message}`));
  if (sub && sub.status !== "canceled") {
    await s.subscriptions.cancel(subId, { cancellation_details: { comment: `Rebill failed (${code}) — retries never succeed for this decline, cancelled immediately` } })
      .then(() => { cancelled = true; })
      .catch((e) => log.push(`cancel ${subId}: ${e.message}`));
  }
  if (inv.status === "open") await s.invoices.voidInvoice(inv.id).catch((e) => log.push(`void ${inv.id}: ${e.message}`));
  console.log(`dunning no-retry: ${inv.id} (${code}) → ${cancelled ? "subscription cancelled" : "already cancelled"}, invoice voided`);
  return { cancelled, log };
}

// Open mislukte rebills met een kansloze decline (NO_RETRY_DECLINES) die nog in Stripe's retry-wachtrij staan:
// lijst (dry) of meteen afhandelen zoals de webhook dat vanaf nu doet (voiden + opzeggen).
export async function cancelNoRetryFailures({ dry = false } = {}) {
  const s = stripe();
  if (!s) return { ok: false, error: "STRIPE_SECRET_KEY ontbreekt" };
  const handled = [], skipped = [];
  let n = 0;
  for await (const inv of s.invoices.list({ status: "open", limit: 100, expand: ["data.payment_intent"] })) {
    if (++n > 3000) break;
    if (inv.billing_reason !== "subscription_cycle" || !inv.attempted || !inv.amount_due) continue;
    if (inv.metadata?.jj_dunning) continue; // zit al in de ladder of is al afgehandeld
    const code = await failedDeclineCode(inv);
    if (!NO_RETRY_DECLINES.includes(code)) continue;
    const row = { id: inv.id, email: inv.customer_email, amount: (inv.amount_due || 0) / 100, failedAt: dayStr((inv.status_transitions?.finalized_at || inv.created) * 1000), attempts: inv.attempt_count || 0, decline: code, nextStripeRetry: inv.next_payment_attempt ? dayStr(inv.next_payment_attempt * 1000) : null };
    const subId = idOf(inv.subscription);
    const sub = subId ? await s.subscriptions.retrieve(subId).catch(() => null) : null;
    if (!sub || sub.status === "canceled") { skipped.push({ ...row, why: "subscription canceled" }); continue; }
    if (!dry) { const r = await stopNoRetry(s, inv, code); row.cancelled = r.cancelled; if (r.log.length) row.log = r.log; }
    handled.push(row);
  }
  return { ok: true, dry, today: dayStr(), handled, skipped };
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
    await s.subscriptions.cancel(subId, { cancellation_details: { comment: "Rebill failed after discount ladder (−20% / €24.95 / €19.95)" } }).catch((e) => log.push(`cancel ${subId}: ${e.message}`));
  }
  await s.invoices.update(inv.id, { metadata: { ...(inv.metadata || {}), jj_dunning: "done", jj_dunning_result: "cancelled" } }).catch(() => {});
  await s.invoices.voidInvoice(inv.id).catch((e) => log.push(`void ${inv.id}: ${e.message}`));
}

// Abonnement blijvend naar een lager bedrag (zelfde product en interval), vanaf de volgende cyclus, zonder pro rata.
// Prijs wordt één keer aangemaakt per product/bedrag/interval (lookup_key) en daarna hergebruikt.
export async function downgradeSubscription(s, sub, cents, { invoice } = {}) {
  const item = sub?.items?.data?.[0];
  const cur = item?.price;
  if (!item || !cur?.recurring) return null;
  if (cur.unit_amount === cents) return { already: true };
  const productId = idOf(cur.product);
  const { interval, interval_count } = cur.recurring;
  const key = `jj_member_${cents}_${interval}${interval_count}_${productId}`.slice(0, 200);
  const found = await s.prices.list({ lookup_keys: [key], limit: 1 });
  const priceId = found.data[0]?.id || (await s.prices.create({ currency: cur.currency || "eur", unit_amount: cents, recurring: { interval, interval_count }, product: productId, lookup_key: key, nickname: `Membership ${(cents / 100).toFixed(2)} (after retry)` })).id;
  await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: "none",
    metadata: { ...(sub.metadata || {}), jj_price_downgrade: String(cents), jj_price_downgrade_from: String(cur.unit_amount), jj_price_downgrade_at: dayStr(), jj_price_downgrade_invoice: invoice || "" },
  });
  console.log(`dunning downgrade: ${sub.id} €${(cur.unit_amount / 100).toFixed(2)} → €${(cents / 100).toFixed(2)} (${priceId})`);
  return { priceId };
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

  const amount = stepAmount(step, fresh.amount_due);
  const pct = stepPct(step, fresh.amount_due);
  const productKey = sub.metadata?.product_key || "";
  let pi = null, error = null;
  try {
    pi = await s.paymentIntents.create(
      {
        amount, currency: fresh.currency || "eur", customer: idOf(fresh.customer), payment_method: pm,
        off_session: true, confirm: true,
        description: `Membership rebill ${step.label} (retry ${step.stage}/${LADDER.length}) · invoice ${fresh.id}`,
        metadata: { jj_dunning_invoice: fresh.id, jj_dunning_stage: String(step.stage), jj_dunning_pct: String(pct), jj_dunning_label: step.label, subscription: subId, product_key: productKey, kind: "dunning-retry" },
      },
      { idempotencyKey: `jj-dunning-${fresh.id}-${step.stage}` }
    );
  } catch (e) {
    error = e;
    pi = e?.payment_intent || e?.raw?.payment_intent || null;
  }

  if (pi?.status === "succeeded") {
    const paid = amount / 100;
    await s.invoices.update(fresh.id, { metadata: { ...md, jj_dunning: "done", jj_dunning_stage: String(step.stage), jj_dunning_result: `paid-${pct}`, jj_dunning_amount: paid.toFixed(2), jj_dunning_pi: pi.id, jj_dunning_label: step.label } });
    // Factuur buiten Stripe om als betaald markeren → abonnement weer active, invoice.paid-webhook doet de rest
    await s.invoices.pay(fresh.id, { paid_out_of_band: true });
    console.log(`dunning paid: ${fresh.id} stage ${step.stage} (${step.label}) €${paid.toFixed(2)} ${pi.id}`);
    // Laatste trede gelukt → dit bedrag werkt voor deze kaart: abonnement vanaf de volgende cyclus naar dat bedrag
    let downgraded = null;
    if (step.downgrade) {
      downgraded = await downgradeSubscription(s, sub, amount, { invoice: fresh.id }).catch((e) => { console.error(`dunning downgrade ${subId}:`, e.message); return null; });
    }
    return { id: inv.id, result: `paid ${step.label} €${paid.toFixed(2)}${downgraded ? ` → subscription now €${(amount / 100).toFixed(2)}` : ""}`, pi: pi.id };
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
    console.log(`dunning failed: ${fresh.id} stage ${step.stage} (${code}) → ${next.label} op ${nextDay}`);
    return { id: inv.id, result: `failed ${step.label} (${code}) → next ${next.label} on ${nextDay}` };
  }
  await s.invoices.update(fresh.id, { metadata: { ...md, jj_dunning_stage: String(step.stage), [`jj_dunning_fail_${step.stage}`]: code } }).catch(() => {});
  await finishFailed(s, { ...fresh, metadata: { ...md, jj_dunning_stage: String(step.stage) } }, sub, log);
  console.log(`dunning end: ${fresh.id} stage ${step.stage} (${code}) → subscription cancelled`);
  return { id: inv.id, result: `failed ${step.label} (${code}) → subscription cancelled`, log };
}

// Bestaande mislukte rebills (van vóór de ladder, of gemist) alsnog in de ladder zetten.
// Open subscription_cycle-facturen met decline insufficient_funds en een niet-opgezegd abonnement
// → jj_dunning=1 met "next" = vandaag, zodat de eerstvolgende run meteen de eerste poging (−20%) doet.
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
      console.log(`dunning enroll: ${inv.id} ${inv.customer_email} (${code}) → ${LADDER[0].label} vandaag`);
    }
    enrolled.push(row);
  }
  return { ok: true, today, dry, enrolled, skipped };
}

// Rapport: wat heeft de kortingsladder opgeleverd (facturen met jj_dunning-metadata van de laatste N dagen).
export async function ladderReport({ days = 90 } = {}) {
  const s = stripe();
  if (!s) return { ok: false, error: "STRIPE_SECRET_KEY ontbreekt" };
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = [];
  let n = 0;
  for await (const inv of s.invoices.list({ created: { gte: since }, limit: 100 })) {
    if (++n > 6000) break;
    const md = inv.metadata || {};
    if (!md.jj_dunning) continue;
    const full = (inv.amount_due || inv.total || 0) / 100;
    const result = md.jj_dunning_result || "";
    const stage = parseInt(md.jj_dunning_stage || "0", 10);
    const outcome = md.jj_dunning === "1" && inv.status === "open" ? "in-progress"
      : result.startsWith("paid-") ? "recovered" : result === "cancelled" ? "cancelled" : result === "no-retry" ? "no-retry"
      : result === "invoice-paid" ? "paid-by-customer" : result || inv.status;
    rows.push({ id: inv.id, email: inv.customer_email, failedOn: md.jj_dunning_failed || dayStr(inv.created * 1000), code: md.jj_dunning_code || null, full, stage,
      outcome, paid: outcome === "recovered" ? Number(md.jj_dunning_amount) || 0 : outcome === "paid-by-customer" ? paidAmount(inv) : 0, label: md.jj_dunning_label || null,
      fails: [1, 2, 3].map((k) => md[`jj_dunning_fail_${k}`] || null).filter(Boolean), enrolled: md.jj_dunning_enrolled || null });
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const of = (o) => rows.filter((r) => r.outcome === o);
  const rec = of("recovered");
  const byStage = LADDER.map((st) => { const list = rec.filter((r) => r.stage === st.stage); return { stage: st.stage, label: st.label, count: list.length, amount: r2(list.reduce((a, r) => a + r.paid, 0)) }; });
  const fund = rows.filter((r) => r.outcome !== "no-retry");
  return {
    ok: true, days, since: dayStr(since * 1000),
    enrolled: fund.length, enrolledAmount: r2(fund.reduce((a, r) => a + r.full, 0)),
    recovered: rec.length, recoveredAmount: r2(rec.reduce((a, r) => a + r.paid, 0)),
    recoveredFull: r2(rec.reduce((a, r) => a + r.full, 0)), // wat die facturen zonder korting waren geweest
    byStage,
    paidByCustomer: of("paid-by-customer").length, paidByCustomerAmount: r2(of("paid-by-customer").reduce((a, r) => a + r.paid, 0)),
    inProgress: of("in-progress").length, inProgressAmount: r2(of("in-progress").reduce((a, r) => a + r.full, 0)),
    cancelled: of("cancelled").length, cancelledAmount: r2(of("cancelled").reduce((a, r) => a + r.full, 0)),
    other: rows.filter((r) => !["recovered", "paid-by-customer", "in-progress", "cancelled", "no-retry"].includes(r.outcome)).map((r) => ({ id: r.id, outcome: r.outcome })),
    noRetry: of("no-retry").length,
    rows: rows.sort((a, b) => b.failedOn.localeCompare(a.failedOn)),
  };
}

// Alle open facturen in de ladder langslopen (cron). dry=true: alleen tonen wat er zou gebeuren.
export async function runDunning({ dry = false, force = false } = {}) {
  const s = stripe();
  if (!s) return { ok: false, error: "STRIPE_SECRET_KEY ontbreekt" };
  const today = dayStr();
  const due = [], waiting = [], results = [];
  let n = 0;
  // Open facturen via list (direct consistent); Stripe Search loopt minuten achter op metadata-wijzigingen
  for await (const inv of s.invoices.list({ status: "open", limit: 100 })) {
    if (++n > 3000) break;
    const md = inv.metadata || {};
    if (md.jj_dunning !== "1") continue;
    const stageDone = parseInt(md.jj_dunning_stage || "0", 10);
    const step = LADDER[stageDone];
    if (!step) continue;
    const row = { id: inv.id, email: inv.customer_email, amount: (inv.amount_due || 0) / 100, nextStage: step.stage, step: step.label, amountTry: stepAmount(step, inv.amount_due || 0) / 100, next: md.jj_dunning_next, failed: md.jj_dunning_failed };
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
