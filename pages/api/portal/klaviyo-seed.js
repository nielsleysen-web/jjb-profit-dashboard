// pages/api/portal/klaviyo-seed.js — Klaviyo-metrics "aanmaken" door één testevent te sturen, zodat ze in de
// flow-builder kiesbaar zijn vóór het eerste echte geval. Alleen voor dashboard-admin/finance (ingelogd) of CRON_SECRET.
//
// GET /api/portal/klaviyo-seed?email=<testadres>            → stuurt "Membership Payment Failed" + "Membership Reactivated"
// GET /api/portal/klaviyo-seed?email=<testadres>&only=failed → alleen het eerste (of only=reactivated)
//
// Het testprofiel komt daardoor ook in de flows terecht zodra die live staan — gebruik dus een eigen testadres.
import crypto from "crypto";
import { trackEvent, klaviyoConfigured } from "../../../lib/klaviyo";
import { PORTAL_URL } from "../../../lib/portal-auth";

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
  if (secret && (req.headers.authorization || "") === `Bearer ${secret}`) return true;
  const s = dashboardSession(req);
  return !!(s && (s.finance || s.admin));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!klaviyoConfigured()) return res.status(500).json({ ok: false, error: "klaviyo_not_configured" });
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "email ontbreekt (?email=…)" });
  const only = String(req.query.only || "");
  const stamp = Date.now();
  const sent = [];
  try {
    if (only !== "reactivated") {
      await trackEvent("Membership Payment Failed", email, { provider: "stripe", subscription_id: "sub_test_seed", amount: "49,00", portal_url: `${PORTAL_URL}/riattiva`, test: true }, { uniqueId: `seed-payfail-${stamp}` });
      sent.push("Membership Payment Failed");
    }
    if (only !== "failed") {
      await trackEvent("Membership Reactivated", email, { first_name: "Test", provider: "stripe", amount: "49,00", portal_url: PORTAL_URL, gift: true, test: true }, { value: 49, uniqueId: `seed-react-${stamp}` });
      sent.push("Membership Reactivated");
    }
    return res.status(200).json({ ok: true, email, sent, note: "Metrics verschijnen binnen ±1 minuut in Klaviyo → Flows → trigger → Your metrics." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, sent });
  }
}
