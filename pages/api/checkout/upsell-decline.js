// pages/api/checkout/upsell-decline.js — De klant gaat ZONDER upsell door naar de bedankpagina ("No grazie" /
// doorgaan) → mail 1 ("Started Membership") mag nu vertrekken, zonder upsell-regel.
// Bij een geslaagde upsell doet de server dit zelf (met upsell-regel) in /api/stripe/upsell en /api/paypal/upsell.
// POST { ref: "sub_…" | "I-…" }  (sendBeacon vanaf /checkout/offerta)
import { releaseStartedMembership } from "../../../lib/upsell-gate";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const ref = String(body?.ref || "");
  if (!/^(sub_[A-Za-z0-9]{8,}|I-[A-Z0-9]{6,})$/.test(ref)) return res.status(400).json({ ok: false });
  try {
    const r = await releaseStartedMembership(ref, { upsellAdded: false });
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.warn("upsell-decline:", ref, e.message);
    return res.status(200).json({ ok: false });
  }
}
