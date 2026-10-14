// lib/paypal-disputes.js — PayPal disputes: a message to the buyer BEFORE it becomes a claim/chargeback.
//
// A PayPal dispute starts as an "inquiry" (buyer ↔ seller, ±20 days). In that phase we may send the buyer a
// message in the PayPal Resolution Center. A quick, friendly reply (cancel + solution) stops many escalations.
//
// - Webhook CUSTOMER.DISPUTE.CREATED → handleDisputeCreated(): sends the message automatically,
//   ONLY when env PAYPAL_DISPUTE_AUTOREPLY=on (texts must be approved first). Otherwise only logged.
// - Dashboard (Members → PayPal disputes): live list + "Send message" button per dispute.
// - Card chargebacks via PayPal (dispute_channel EXTERNAL) have no inquiry phase → no message possible.
// Never twice: Redis key paypal:dispute:msg:<id> (+ check of the messages already in the dispute).
//
// PayPal: the REST app needs access to the Disputes API; webhook event CUSTOMER.DISPUTE.CREATED must be on.

import { pp } from "./paypal";
import { redis, storeConfigured } from "./portal-store";

export const SUPPORT_EMAIL = "hello@justjennybeauty.com";
const SENT_KEY = (id) => `paypal:dispute:msg:${id}`;

/* ---------------- message texts (Italian) — change only with the owner's approval ---------------- */
const SIGN = `Puoi rispondere direttamente qui oppure scriverci a ${SUPPORT_EMAIL}.\n\nUn caro saluto,\nIl team Just Jenny`;
export const TEMPLATES = {
  billing: {
    label: "Charge not recognised / subscription",
    text: ({ name, amount }) =>
      `Ciao${name ? ` ${name}` : ""},\n\nabbiamo visto la tua segnalazione e vogliamo risolverla subito, senza bisogno di aprire un reclamo.\n\n` +
      `L'addebito${amount ? ` di ${amount} €` : ""} è il rinnovo della membership Just Jenny che si è attivata con il tuo ordine, dopo il periodo di prova gratuito. Puoi annullarla quando vuoi.\n\n` +
      `Non vuoi continuare? Rispondi a questo messaggio con «ANNULLA»: annulliamo la membership per te e troviamo insieme una soluzione per questo addebito.\n\n${SIGN}`,
  },
  not_received: {
    label: "Item not received",
    text: ({ name }) =>
      `Ciao${name ? ` ${name}` : ""},\n\nci dispiace che il tuo pacco Just Jenny non sia ancora arrivato. Controlliamo subito la spedizione con il corriere e ti scriviamo qui il tracking aggiornato.\n\n` +
      `Se il pacco risulta perso, ce ne occupiamo noi. Non serve aprire un reclamo: rispondi a questo messaggio e troviamo una soluzione.\n\n${SIGN}`,
  },
  not_as_described: {
    label: "Not as described",
    text: ({ name }) =>
      `Ciao${name ? ` ${name}` : ""},\n\nci dispiace che il prodotto non sia come te lo aspettavi. Raccontaci cosa non va rispondendo a questo messaggio: troviamo insieme una soluzione, senza complicazioni.\n\n${SIGN}`,
  },
  refund: {
    label: "Refund not received",
    text: ({ name }) =>
      `Ciao${name ? ` ${name}` : ""},\n\nabbiamo visto la tua segnalazione sul rimborso. Verifichiamo subito lo stato e ti rispondiamo qui con tutti i dettagli.\n\n${SIGN}`,
  },
};
export function templateFor(reason) {
  switch (reason) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED": return "not_received";
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED": return "not_as_described";
    case "CREDIT_NOT_PROCESSED": return "refund";
    default: return "billing"; // CANCELED_RECURRING_BILLING, UNAUTHORISED, DUPLICATE_TRANSACTION, INCORRECT_AMOUNT, OTHER…
  }
}

export const REASON_LABEL = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Not received", MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
  UNAUTHORISED: "Unauthorised", CREDIT_NOT_PROCESSED: "Refund not processed", DUPLICATE_TRANSACTION: "Duplicate charge",
  INCORRECT_AMOUNT: "Incorrect amount", PAYMENT_BY_OTHER_MEANS: "Paid by other means", CANCELED_RECURRING_BILLING: "Cancelled subscription still charged",
  PROBLEM_WITH_REMITTANCE: "Remittance problem", OTHER: "Other",
};

const firstName = (full) => String(full || "").trim().split(/\s+/)[0]?.replace(/^./, (c) => c.toUpperCase()) || "";

// Can we (still) send a message in this dispute?
export function messageable(d) {
  if (!d) return { ok: false, why: "not found" };
  if (d.dispute_channel === "EXTERNAL") return { ok: false, why: "card chargeback (bank): no inquiry phase" };
  if (d.dispute_life_cycle_stage && d.dispute_life_cycle_stage !== "INQUIRY") return { ok: false, why: `stage ${d.dispute_life_cycle_stage}` };
  if (["RESOLVED", "UNDER_REVIEW"].includes(d.status)) return { ok: false, why: `status ${d.status}` };
  return { ok: true };
}
const sellerMessaged = (d) => (d?.messages || []).some((m) => m.posted_by === "SELLER");

export async function getDispute(id) {
  return pp("get", `/v1/customer/disputes/${encodeURIComponent(id)}`);
}

// Sends the message for this dispute (once). by = who triggered it ("auto" or a dashboard user)
export async function sendDisputeMessage(id, { by = "auto" } = {}) {
  const d = await getDispute(id);
  const can = messageable(d);
  if (!can.ok) return { sent: false, reason: can.why };
  if (sellerMessaged(d)) return { sent: false, reason: "already messaged" };
  if (storeConfigured()) {
    const lock = await redis(["SET", SENT_KEY(id), JSON.stringify({ at: new Date().toISOString(), by }), "NX", "EX", String(180 * 86400)]).catch(() => "OK");
    if (lock !== "OK") return { sent: false, reason: "already messaged" };
  }
  const tx = d.disputed_transactions?.[0] || {};
  const kind = templateFor(d.reason);
  const amount = d.dispute_amount?.value ? Number(d.dispute_amount.value).toFixed(2).replace(".", ",") : ""; // Italian: 49,00
  const message = TEMPLATES[kind].text({ name: firstName(tx.buyer?.name), amount });
  try {
    await pp("post", `/v1/customer/disputes/${encodeURIComponent(id)}/send-message`, { message });
  } catch (e) {
    if (storeConfigured()) await redis(["DEL", SENT_KEY(id)]).catch(() => {}); // allow a retry
    throw e;
  }
  return { sent: true, kind };
}

// Webhook: new dispute
export async function handleDisputeCreated(resource) {
  const id = resource?.dispute_id;
  if (!id) return { ignored: "no dispute_id" };
  if (String(process.env.PAYPAL_DISPUTE_AUTOREPLY || "").toLowerCase() !== "on") return { id, autoreply: "off" };
  return { id, ...(await sendDisputeMessage(id, { by: "auto" })) };
}

// Dashboard list (live from PayPal, last ~180 days) + whether we sent our message
export async function listDisputes() {
  const out = [];
  let path = `/v1/customer/disputes?page_size=50`;
  for (let page = 0; page < 6 && path; page++) {
    const r = await pp("get", path);
    for (const d of r.items || []) out.push(d);
    const next = (r.links || []).find((l) => l.rel === "next")?.href;
    path = next ? next.replace(/^https:\/\/api-m(\.sandbox)?\.paypal\.com/, "") : null;
  }
  let sent = [];
  if (storeConfigured() && out.length) sent = await redis(["MGET", ...out.map((d) => SENT_KEY(d.dispute_id))]).catch(() => []);
  return out.map((d, i) => {
    let s = null; try { s = sent?.[i] ? JSON.parse(sent[i]) : null; } catch {}
    const can = messageable(d);
    return {
      id: d.dispute_id, created: d.create_time, updated: d.update_time, reason: d.reason, reasonLabel: REASON_LABEL[d.reason] || d.reason,
      status: d.status, stage: d.dispute_life_cycle_stage, channel: d.dispute_channel, amount: Number(d.dispute_amount?.value || 0),
      currency: d.dispute_amount?.currency_code || "EUR", template: templateFor(d.reason), messaged: s, canMessage: can.ok && !s, why: can.ok ? null : can.why,
    };
  });
}
