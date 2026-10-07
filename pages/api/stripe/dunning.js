// pages/api/stripe/dunning.js — Vercel-cron (dagelijks, zie vercel.json): kortingsladder bij mislukte rebills
// door saldotekort (10% → 20% → 30%, daarna opzeggen). Logica in lib/stripe-dunning.js.
// Beveiligd met CRON_SECRET (Authorization: Bearer …) of een ingelogde dashboard-admin/finance.
//
// Handmatig (ingelogd in het dashboard, gewoon in de browser):
//   /api/stripe/dunning?dry=1             → wie is vandaag aan de beurt, wie wacht nog; doet niets
//   /api/stripe/dunning?run=1             → voert de pogingen van vandaag uit
//   /api/stripe/dunning?enroll=1&dry=1    → bestaande mislukte rebills (insufficient_funds) die nog niet in de ladder zitten: lijst
//   /api/stripe/dunning?enroll=1          → die alsnog in de ladder zetten (10% = vandaag), nog geen afschrijving
//   /api/stripe/dunning?enroll=1&run=1    → in de ladder zetten ÉN meteen de 10%-poging doen
//   /api/stripe/dunning?run=1&force=1     → negeert de wachtdagen (alleen om te testen)
import crypto from "crypto";
import { runDunning, enrollOpenFailures } from "../../../lib/stripe-dunning";

export const config = { maxDuration: 60 };

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
function dashboardSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const tok = match ? match[1] : null;
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  if (crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url") !== sig) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp && p.exp > Date.now() ? p : null; } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const fromCron = secret ? auth === `Bearer ${secret}` : /^vercel-cron\//i.test(req.headers["user-agent"] || "");
  const sess = dashboardSession(req);
  const fromDashboard = !!(sess && (sess.admin || sess.finance));
  if (!fromCron && !fromDashboard) return res.status(401).json({ ok: false });

  const q = req.query || {};
  const dry = q.dry === "1";
  try {
    // Vanuit het dashboard: alleen doen wat expliciet gevraagd wordt (zonder parameters = droge run)
    if (fromDashboard && !fromCron) {
      const out = {};
      if (q.enroll === "1") out.enroll = await enrollOpenFailures({ dry });
      if (q.run === "1" && !dry) out.run = await runDunning({ force: q.force === "1" });
      else out.status = await runDunning({ dry: true });
      return res.status(200).json(out);
    }
    const out = await runDunning({ dry, force: q.force === "1" });
    if (out.attempted?.length) console.log("dunning:", JSON.stringify(out.attempted));
    return res.status(200).json(out);
  } catch (e) {
    console.error("dunning:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
