// pages/api/capi.js — overgenomen uit de checkout-kit
import crypto from "crypto";

// ============================================================================
//  POST /api/capi — META CONVERSIONS API relay (server-side tracking).
//
//  The checkout (InitiateCheckout / AddPaymentInfo) and both webhooks (Purchase)
//  POST here. We hash the PII (SHA-256, per Meta spec) and forward a server event
//  to Meta using the SAME event_id as the browser pixel event, so Meta
//  DEDUPLICATES the pair — one conversion, but it still lands when the browser
//  event is blocked (iOS ATT, ad blockers, ITP, dropped beacons).
//
//  Required env:  META_PIXEL_ID, META_CAPI_ACCESS_TOKEN  (Events Manager → your
//                 pixel → Settings → Conversions API → Generate access token)
//  Optional env:  META_TEST_EVENT_CODE  (set temporarily to see events in
//                                        Events Manager → Test events)
// ============================================================================

const PIXEL_ID = process.env.META_PIXEL_ID;
const TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_CODE = process.env.META_TEST_EVENT_CODE;
const GRAPH = "https://graph.facebook.com/v21.0";

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();

const hashEmail = (e) => { const v = norm(e); return v ? sha256(v) : null; };
const hashText = (t) => { const v = norm(t); return v ? sha256(v) : null; };
const hashPhone = (p) => { const d = String(p || "").replace(/[^0-9]/g, ""); return d ? sha256(d) : null; };
const hashZip = (z) => { const v = norm(z).replace(/\s+/g, ""); return v ? sha256(v) : null; };
const hashCountry = (c) => { let v = norm(c); if (v.length > 2) v = v.slice(0, 2); return v ? sha256(v) : null; };

// Read the body whether Vercel parsed it (object) or it arrived as the raw
// text/plain blob the pixel sends (string / stream).
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try { return JSON.parse(req.body); } catch { /* fall through */ }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!TOKEN || !PIXEL_ID) return res.status(200).json({ ok: false, error: "missing META_PIXEL_ID / META_CAPI_ACCESS_TOKEN" });

  const b = await readBody(req);
  if (!b.event_name || !b.event_id) {
    return res.status(200).json({ ok: false, error: "missing event_name/event_id" });
  }

  // Customer IP + UA. For a browser beacon these come from the customer's own request.
  // For a SERVER-originated event (b.server_event — e.g. the Stripe webhook), the request
  // IP/UA belong to the server, NOT the buyer, so we must ONLY trust body-provided values
  // (captured at checkout) and never fall back to this request's IP/UA.
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const reqIp = xff || (req.socket && req.socket.remoteAddress) || undefined;
  const ip = b.server_event ? (b.client_ip_address || undefined) : (b.client_ip_address || reqIp);
  const ua = b.server_event ? (b.user_agent || undefined) : (b.user_agent || req.headers["user-agent"] || undefined);

  const user_data = {};
  const put = (key, val) => { if (val) user_data[key] = [val]; };
  put("em", hashEmail(b.email));
  put("ph", hashPhone(b.phone));
  put("fn", hashText(b.first_name));
  put("ln", hashText(b.last_name));
  put("ct", hashText(b.city));
  put("st", hashText(b.state));
  put("zp", hashZip(b.zip));
  put("country", hashCountry(b.country));
  if (b.fbp) user_data.fbp = b.fbp;           // not arrays
  if (b.fbc) user_data.fbc = b.fbc;
  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;

  const custom_data = {};
  if (b.value != null && b.value !== "") custom_data.value = Number(b.value);
  if (b.currency) custom_data.currency = b.currency;

  const event = {
    event_name: b.event_name,
    event_time: Number(b.event_time) || Math.floor(Date.now() / 1000),
    event_id: String(b.event_id),
    action_source: "website",
    user_data,
  };
  if (b.event_source_url) event.event_source_url = b.event_source_url;
  if (Object.keys(custom_data).length) event.custom_data = custom_data;

  const payload = { data: [event] };
  // test_event_code routes the event to Events Manager → Test Events ONLY (not counted in
  // reporting). Env-level TEST_CODE applies globally; a per-request b.test_event_code lets us
  // verify a single server event end-to-end without polluting production numbers.
  const testCode = b.test_event_code || TEST_CODE;
  if (testCode) payload.test_event_code = testCode;

  try {
    const r = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    // Return Meta's summary only — never echo PII.
    return res.status(200).json({ ok: r.ok, events_received: j.events_received, fbtrace_id: j.fbtrace_id, error: j.error });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
