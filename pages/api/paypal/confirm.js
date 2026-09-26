// pages/api/paypal/confirm.js
// Na goedkeuring in PayPal: controleren of het abonnement actief is (setup fee = bundel + verzending
// is dan betaald) en meteen de Shopify-order aanmaken, met de ad-tracking van de checkout.

import { paypalConfigured, pp, ensureOrderForPaypal } from "../../../lib/paypal";
import { TRACK_KEYS } from "../../../lib/checkout";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!paypalConfigured()) return res.status(500).json({ error: "PayPal non configurato" });
  const b = req.body || {};
  const id = String(b.id || "");
  if (!/^I-[A-Z0-9]{6,}$/.test(id)) return res.status(400).json({ error: "Riferimento non valido" });

  try {
    // Activering kan een paar seconden duren
    let sub = null;
    for (let i = 0; i < 6; i++) {
      sub = await pp("get", `/v1/billing/subscriptions/${id}`);
      if (sub.status === "ACTIVE") break;
      await sleep(1500);
    }
    if (!sub || sub.status !== "ACTIVE") return res.status(202).json({ pending: true, status: sub?.status });

    const track = {};
    const t = b.track && typeof b.track === "object" ? b.track : {};
    for (const k of [...TRACK_KEYS, "pg", "utm_medium"]) if (t[k]) track[k] = String(t[k]).slice(0, 300);

    const clientIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 450);
    const order = await ensureOrderForPaypal(sub, { track, phone: String(b.phone || "").slice(0, 30), clientIp, userAgent });
    return res.status(200).json({ ok: true, order: order.name });
  } catch (e) {
    console.error("paypal/confirm:", e.message);
    // De webhook maakt de order alsnog aan; de klant mag gewoon door naar de bedankpagina
    return res.status(200).json({ ok: false });
  }
}
