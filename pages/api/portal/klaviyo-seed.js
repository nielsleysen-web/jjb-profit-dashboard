// pages/api/portal/klaviyo-seed.js — Klaviyo-metrics "aanmaken" door één testevent te sturen, zodat ze in de
// flow-builder kiesbaar zijn vóór het eerste echte geval. Alleen voor dashboard-admin/finance (ingelogd) of CRON_SECRET.
//
// GET /api/portal/klaviyo-seed?email=<testadres>            → stuurt "Membership Payment Failed" + "Membership Reactivated"
// GET /api/portal/klaviyo-seed?email=<testadres>&only=failed → alleen het eerste (of only=reactivated)
// GET /api/portal/klaviyo-seed?email=<testadres>&only=cancelled → alleen "Membership Cancelled" (voor flowfilters)
// GET /api/portal/klaviyo-seed?email=<testadres>&only=all    → ALLE metrics van het portaal in één keer (Membership Started,
//     Portal Login Link, Portal Order Confirmed, Membership Renewal Reminder, Membership Renewed, Payment Failed, Reactivated)
//     + profielveld trial_ends. Met &brand=lubrisense (op de dashboard-host) → "LubriSense …"-metrics, zonder testbestelling.
//
// Het testprofiel komt daardoor ook in de flows terecht zodra die live staan — gebruik dus een eigen testadres.
import crypto from "crypto";
import { trackEvent, klaviyoConfigured, setProfileProperties } from "../../../lib/klaviyo";
import { PORTAL_URL, portalUrl } from "../../../lib/portal-auth";
import { withPortalBrand, currentBrand } from "../../../lib/portal-brand";

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

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!klaviyoConfigured()) return res.status(500).json({ ok: false, error: "klaviyo_not_configured" });
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "email ontbreekt (?email=…)" });
  const only = String(req.query.only || "");
  const stamp = Date.now();
  const sent = [];
  try {
    if (only === "cancelled") {
      // Alleen "Membership Cancelled" (nodig voor de flowfilters "zero times since starting this flow")
      await trackEvent("Membership Cancelled", email, { provider: "stripe", subscription_id: "sub_test_seed", reason: "test", test: true }, { uniqueId: `seed-cancel-${stamp}` });
      return res.status(200).json({ ok: true, brand: currentBrand().key, email, sent: [currentBrand().eventPrefix + "Membership Cancelled"], note: "Metric verschijnt binnen ±1 minuut in Klaviyo." });
    }
    if (only === "all") {
      const base = portalUrl();
      const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const t = { test: true };
      const evs = [
        ["Membership Started", { product: currentBrand().key === "lubrisense" ? "LubriSense" : "NeuroTone", provider: "stripe", subscription_id: "sub_test_seed", bundle: 5, bundle_label: "5x LubriSense™", shipping: "Express (3-5 giorni lavorativi)", amount_paid: 64.95, trial_ends: day(7), membership_price: "49,00", order: "#TEST", portal_login_url: `${base}/login`, portal_url: base, first_name: "Test", ...t }],
        ["Portal Login Link", { login_url: `${base}/login`, purpose: "login", first_name: "Test", expires_minutes: 20, ...t }],
        ["Portal Order Confirmed", { order_name: "#TEST", product_title: "Capsule UTI", product_image: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/uti-capsules.jpg?v=1791256063", compare_at: "39,95", shipping: "9,95", total: "9,95", ship_name: "Test", ship_address1: "Via Roma 1", ship_city: "Milano", available_again: "3 novembre", orders_url: `${base}/#orders`, first_name: "Test", ...t }],
        ["Membership Renewal Reminder", { first_name: "Test", renewal_date: "9 ottobre", renewal_date_iso: day(3), amount: "49,00", login_url: `${base}/login`, provider: "stripe", ...t }],
        ["Membership Renewed", { provider: "stripe", subscription_id: "sub_test_seed", amount_paid: 49, next_charge: day(28), ...t }],
        ["Membership Payment Failed", { provider: "stripe", subscription_id: "sub_test_seed", amount: "49,00", portal_url: `${base}/riattiva`, ...t }],
        ["Membership Reactivated", { first_name: "Test", provider: "stripe", amount: "49,00", portal_url: base, gift: true, ...t }],
      ];
      for (const [name, props] of evs) { await trackEvent(name, email, props, { uniqueId: `seed-${name}-${stamp}` }); sent.push(currentBrand().eventPrefix + name); }
      // Profielveld voor de date-flow "rinnovo domani" (jj_trial_ends / jj_lubrisense_trial_ends)
      await setProfileProperties(email, { jj_trial_ends: day(7) }).catch(() => {});
      return res.status(200).json({ ok: true, brand: currentBrand().key, email, sent, note: "Metrics verschijnen binnen ±1 minuut in Klaviyo → Flows → trigger → Your metrics. Zet de flows pas live NA dit testevent." });
    }
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

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
