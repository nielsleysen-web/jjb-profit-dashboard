// pages/api/checkout-quiz.js
// Antwoorden van de enquête op de bedankpagina → Google Sheet (zelfde kolommen als nu):
//   SID | Stato | Prima risposta | Ultimo aggiornamento | Ultima domanda | Lingua | 1. … | … | 11. …
// Na elke klik op "Successivo" wordt de rij van deze klant bijgewerkt (partial → completed),
// zodat ook halve antwoorden bewaard blijven. Bij "completed" komen de antwoorden ook als
// notitie op de Shopify-order.
//
// POST { sub, sid, first, answers: [..], questions: [..] }
// Env: QUIZ_SHEET_ID (ID uit de Sheet-URL), GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, STRIPE_SECRET_KEY

import Stripe from "stripe";
import { upsertRow } from "../../lib/gsheets";
import { shopifyGraphql, findOrderForInvoice } from "../../lib/shopify-admin";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;
const MAX_Q = 11;

// Zelfde notatie als in de Sheet: 11-9-2026 2:43:53 (Italiaanse tijd)
function itTime(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value])
  );
  return `${parseInt(p.day, 10)}-${parseInt(p.month, 10)}-${p.year} ${parseInt(p.hour, 10)}:${p.minute}:${p.second}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe || !process.env.QUIZ_SHEET_ID) return res.status(500).json({ error: "Non configurato" });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const subId = String(b.sub || "");
  const sid = String(b.sid || "");
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, MAX_Q).map((a) => String(a || "").trim().slice(0, 2000));
  const questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, MAX_Q).map((q) => String(q || "").slice(0, 300));
  const first = Number(b.first) || Date.now();
  if (!/^sub_[A-Za-z0-9]{8,}$/.test(subId) || !/^[0-9a-f]{18}$/.test(sid) || !answers.length) {
    return res.status(400).json({ error: "Richiesta non valida" });
  }

  try {
    // Alleen echte, recente bestellingen mogen schrijven
    const sub = await stripe.subscriptions.retrieve(subId);
    if (Date.now() / 1000 - sub.created > 30 * 86400) return res.status(404).json({ error: "Non trovato" });

    const completed = answers.length >= MAX_Q;
    const row = [
      sid,
      completed ? "completed" : "partial",
      itTime(first),
      itTime(Date.now()),
      String(answers.length),
      "it",
      ...Array.from({ length: MAX_Q }, (_, k) => answers[k] || ""),
    ];
    await upsertRow(process.env.QUIZ_SHEET_ID, sid, row);

    if (completed) {
      try {
        const invId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
        const order = invId ? await findOrderForInvoice(invId) : null;
        if (order) {
          const lines = answers.map((a, k) => `${k + 1}. ${questions[k] || ""}\n→ ${a || "-"}`).join("\n\n");
          const note = `${order.note ? order.note + "\n\n" : ""}— Enquête bedankpagina (SID ${sid}) —\n${lines}`.slice(0, 5000);
          await shopifyGraphql(`mutation($input: OrderInput!) { orderUpdate(input: $input) { userErrors { field message } } }`, { input: { id: order.id, note } });
        }
      } catch (e) {
        console.warn("checkout-quiz shopify note:", e.message);
      }
    }
    return res.status(200).json({ ok: true, completed });
  } catch (e) {
    console.error("checkout-quiz:", e.response?.data?.error?.message || e.message);
    return res.status(500).json({ error: "Errore" });
  }
}
