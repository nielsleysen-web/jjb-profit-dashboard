// pages/api/stripe/dunning.js — Vercel-cron (dagelijks, zie vercel.json): kortingsladder bij mislukte rebills
// door saldotekort (10% → 20% → 30%, daarna opzeggen). Logica in lib/stripe-dunning.js.
// Beveiligd met CRON_SECRET (Authorization: Bearer …); zonder CRON_SECRET alleen voor de Vercel-cron zelf.
//
// Handmatig (met Bearer CRON_SECRET):
//   GET /api/stripe/dunning?dry=1    → toont welke facturen vandaag aan de beurt zijn en welke nog wachten, doet niets
//   GET /api/stripe/dunning          → voert de pogingen van vandaag uit
//   GET /api/stripe/dunning?force=1  → negeert de wachtdagen (alleen om te testen)
import { runDunning } from "../../../lib/stripe-dunning";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const fromVercelCron = /^vercel-cron\//i.test(req.headers["user-agent"] || "");
  const ok = secret ? auth === `Bearer ${secret}` : fromVercelCron;
  if (!ok) return res.status(401).json({ ok: false });
  try {
    const out = await runDunning({ dry: req.query.dry === "1", force: req.query.force === "1" });
    if (out.attempted?.length) console.log("dunning:", JSON.stringify(out.attempted));
    return res.status(200).json(out);
  } catch (e) {
    console.error("dunning:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
