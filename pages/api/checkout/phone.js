// pages/api/checkout/phone.js — Telefoonnummer van de checkout naar Klaviyo, zodra de klant het veld verlaat.
//
// POST { email, phone, name?, product? } → zet het nummer (+39…) en de naam op het Klaviyo-profiel (lib/klaviyo.js
// → saveCheckoutPhone). Toestemmingen (e-mail/SMS) worden niet gewijzigd. Antwoordt altijd snel { ok: true };
// fouten blokkeren de checkout nooit.
import { saveCheckoutPhone, klaviyoConfigured } from "../../../lib/klaviyo";
import { bump, storeConfigured } from "../../../lib/portal-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(200).json({ ok: false, error: "invalid_email" });
    if (!klaviyoConfigured()) return res.status(200).json({ ok: true });
    // Misbruik beperken: max 20 per IP per uur, max 6 per e-mailadres per uur
    if (storeConfigured()) {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "na";
      if ((await bump(`checkout:rl:ph:ip:${ip}`, 3600)) > 20) return res.status(200).json({ ok: true });
      if ((await bump(`checkout:rl:ph:em:${email}`, 3600)) > 6) return res.status(200).json({ ok: true });
    }
    const r = await saveCheckoutPhone({ email, phone: String(b.phone || "").slice(0, 40), name: String(b.name || "").slice(0, 120) });
    return res.status(200).json({ ok: true, ...(r.skipped ? { skipped: r.skipped } : {}) });
  } catch (e) {
    console.error("checkout/phone:", e.message);
    return res.status(200).json({ ok: true });
  }
}
