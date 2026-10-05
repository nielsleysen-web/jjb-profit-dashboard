// pages/api/portal/renewal-reminders.js — Herinnering 3 dagen vóór elke rebill (Klaviyo-event)
//
// Draait dagelijks via Vercel Cron (vercel.json, 07:00 UTC). Per lid:
//   - live abonnement ophalen (Stripe of PayPal) → volgende afschrijving = einde huidige cyclus/proef
//   - alleen actieve of proef-abonnementen; opgezegd (of "stopt aan einde periode") wordt overgeslagen
//   - volgende afschrijving binnen 6–84 uur → event "Membership Renewal Reminder" naar Klaviyo
//     (normaal ±3 dagen vooraf; wie door een late deploy of nieuwe inschrijving net later valt, krijgt hem alsnog)
//   - elke afschrijving krijgt maximaal één herinnering (Redis-slot + Klaviyo unique_id)
//
// Event-properties (voor de mail): first_name, renewal_date ("2 ottobre"), renewal_date_iso, amount ("49,00"),
// login_url (persoonlijke loginlink, 7 dagen geldig), provider.
//
// Handmatig (alleen dashboard-admin/finance, of met CRON_SECRET):
//   GET /api/portal/renewal-reminders?dry=1          → toont wie een herinnering zou krijgen, verstuurt niets
//   GET /api/portal/renewal-reminders?run=1          → nu uitvoeren (zelfde regels als de dagelijkse run)
//   GET /api/portal/renewal-reminders?test=<email>   → stuurt meteen één herinnering naar dat lid (om de mail te testen)

import crypto from "crypto";
import { listMemberEmails, getMember } from "../../../lib/portal-members";
import { getSubscriptionInfo } from "../../../lib/portal-account";
import { createLoginLink, normEmail } from "../../../lib/portal-auth";
import { redis, storeConfigured } from "../../../lib/portal-store";
import { trackEvent, klaviyoConfigured } from "../../../lib/klaviyo";
import { MEMBERSHIP } from "../../../lib/checkout";
import { resumeDuePauses } from "../../../lib/membership-actions";

export const config = { maxDuration: 60 };

const HOUR = 3600000;
const MIN_H = 6, MAX_H = 84;
const EVENT = "Membership Renewal Reminder";
const PRICE = (MEMBERSHIP?.price || 4900) / 100;

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
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  // Zonder CRON_SECRET: de dagelijkse Vercel-cron herkennen aan zijn user-agent
  if (!secret && /^vercel-cron\//i.test(req.headers["user-agent"] || "")) return true;
  const s = dashboardSession(req);
  return !!(s && (s.finance || s.admin));
}

const itDate = (d) => new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
const eur = (v) => Number(v).toFixed(2).replace(".", ",");

// Volgende afschrijving + of er überhaupt een komt
async function nextCharge(m) {
  const sub = await getSubscriptionInfo(m);
  const status = sub.status;
  const renews = (status === "trialing" || status === "active") && !sub.cancelAtPeriodEnd && m.status !== "cancelled";
  const at = sub.cycleEnd ? new Date(sub.cycleEnd).getTime() : m.nextChargeAt ? new Date(m.nextChargeAt).getTime() : null;
  return { renews, at, status, provider: sub.provider || m.provider, live: sub.live };
}

async function sendReminder(m, at, provider, { test = false } = {}) {
  const loginUrl = await createLoginLink(m.email, { purpose: "login", ttlSec: 7 * 86400 });
  const iso = new Date(at).toISOString().slice(0, 10);
  await trackEvent(EVENT, m.email, {
    first_name: m.firstName || "",
    renewal_date: itDate(at),
    renewal_date_iso: iso,
    amount: eur(PRICE),
    login_url: loginUrl,
    provider: provider || "",
  }, { uniqueId: `renewrem-${normEmail(m.email)}-${iso}${test ? `-test-${Date.now()}` : ""}` });
  return iso;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ success: false, error: "No access" });
  if (!storeConfigured()) return res.status(400).json({ success: false, error: "UPSTASH_REDIS_REST_URL / _TOKEN ontbreekt" });
  // Pauzes van customer service die vandaag aflopen: PayPal weer activeren (Stripe hervat zelf)
  const resumed = req.query.dry === "1" || req.query.test ? [] : await resumeDuePauses().catch((e) => { console.warn("resume pauses:", e.message); return []; });
  if (!klaviyoConfigured()) return res.status(400).json({ success: false, error: "KLAVIYO_PRIVATE_KEY ontbreekt" });

  try {
    // Eén testherinnering, los van het tijdvenster
    if (req.query.test) {
      const m = await getMember(req.query.test);
      if (!m) return res.status(404).json({ success: false, error: `Geen lid met e-mail ${normEmail(req.query.test)}` });
      const n = await nextCharge(m).catch(() => ({ at: null }));
      const at = n.at && n.at > Date.now() ? n.at : Date.now() + 3 * 86400000;
      const iso = await sendReminder(m, at, n.provider, { test: true });
      return res.status(200).json({ success: true, test: true, email: m.email, renewalDate: iso, note: "Testherinnering verstuurd" });
    }

    const dry = req.query.dry === "1";
    const now = Date.now();
    const emails = await listMemberEmails();
    const sent = [], due = [], skipped = [], errors = [];

    // Beperkt parallel (Stripe/PayPal-limieten)
    const queue = [...emails];
    const worker = async () => {
      while (queue.length) {
        const email = queue.shift();
        try {
          const m = await getMember(email);
          if (!m) continue;
          if (m.test) { skipped.push({ email, reason: "testlid" }); continue; }
          if (m.pausedUntil && Date.parse(m.pausedUntil) > now) { skipped.push({ email, reason: "gepauzeerd" }); continue; }
          const n = await nextCharge(m);
          if (!n.renews) { skipped.push({ email, reason: `geen verlenging (${n.status || "onbekend"})` }); continue; }
          if (!n.at) { skipped.push({ email, reason: "datum onbekend" }); continue; }
          const h = (n.at - now) / HOUR;
          if (h <= MIN_H || h > MAX_H) continue;
          const iso = new Date(n.at).toISOString().slice(0, 10);
          const row = { email, renewal: new Date(n.at).toISOString(), inHours: Math.round(h), provider: n.provider, live: n.live };
          if (dry) { due.push(row); continue; }
          // Eén herinnering per afschrijving
          const lockKey = `portal:renewrem:${normEmail(email)}:${iso}`;
          const ok = await redis(["SET", lockKey, "1", "NX", "EX", String(10 * 86400)]);
          if (ok !== "OK") { skipped.push({ email, reason: "al herinnerd" }); continue; }
          try { await sendReminder(m, n.at, n.provider); }
          catch (e) { await redis(["DEL", lockKey]).catch(() => {}); throw e; } // mislukt → morgen opnieuw proberen
          sent.push(row);
        } catch (e) {
          errors.push({ email, error: e.message });
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));

    console.log(`portal renewal-reminders: ${dry ? "dry " : ""}${dry ? due.length : sent.length} due, ${errors.length} errors`);
    return res.status(200).json({ success: true, dryRun: dry, resumedPauses: resumed, members: emails.length, window: `${MIN_H}-${MAX_H}u`, ...(dry ? { due } : { sent }), skipped, errors });
  } catch (e) {
    console.error("portal renewal-reminders:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
