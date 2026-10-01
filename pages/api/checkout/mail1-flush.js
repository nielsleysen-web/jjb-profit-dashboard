// pages/api/checkout/mail1-flush.js — Vercel-cron (elke 10 min, zie vercel.json): mail 1 ("Started Membership")
// alsnog versturen voor klanten die de upsellpagina sloten zonder te kiezen (langer dan 30 min vastgehouden).
// Beveiligd met CRON_SECRET (Authorization: Bearer …); zonder CRON_SECRET alleen voor de Vercel-cron zelf.
import { flushHeld } from "../../../lib/upsell-gate";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const fromVercelCron = /^vercel-cron\//i.test(req.headers["user-agent"] || "");
  const ok = secret ? auth === `Bearer ${secret}` : fromVercelCron;
  if (!ok) return res.status(401).json({ ok: false });
  try {
    const r = await flushHeld();
    if (r.sent?.length) console.log("mail1-flush: sent", r.sent.join(","));
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error("mail1-flush:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
