// POST /api/portal/membership (logged in) — the member manages their own membership (lib/portal-self-service.js)
//   { action: "pause" }                                  pause 28 days (once)
//   { action: "resume", mode: "now" | "date", date }     end the pause now or on a date (YYYY-MM-DD)
//   { action: "offer", kind: "price" | "pct15", reason, note }  retention offer on the next rebill (once)
//   { action: "cancel", reason, note }                   cancel: no more rebills, access until the end of the paid period
//   { action: "undoCancel" }                             Stripe: keep the membership after all
import { readSession } from "../../../lib/portal-auth";
import { getMember } from "../../../lib/portal-members";
import { getSubscriptionInfo } from "../../../lib/portal-account";
import { selfPause, selfResume, selfOffer, selfCancel, selfUndoCancel } from "../../../lib/portal-self-service";
import { bump, redis } from "../../../lib/portal-store";
import { withPortalBrand } from "../../../lib/portal-brand";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    if ((await bump(`portal:rl:manage:${m.email}`, 3600)) > 20) return res.status(429).json({ ok: false, error: "too_many" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const sub = await getSubscriptionInfo(m);
    let r;
    if (b.action === "pause") r = await selfPause(m, sub);
    else if (b.action === "resume") r = await selfResume(m, { mode: b.mode, date: b.date });
    else if (b.action === "offer") r = await selfOffer(m, sub, String(b.kind || ""), { reason: b.reason, note: b.note });
    else if (b.action === "cancel") r = await selfCancel(m, sub, { reason: String(b.reason || ""), note: b.note });
    else if (b.action === "undoCancel") r = await selfUndoCancel(m, sub);
    else return res.status(400).json({ ok: false, error: "unknown_action" });
    await redis(["DEL", "cache:subs:raw:v2"]).catch(() => {}); // dashboard shows the change right away
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    if (e.status && e.status < 500) return res.status(e.status).json({ ok: false, error: e.message });
    console.error("portal membership:", s.email, b_action(req), e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
const b_action = (req) => { try { return (typeof req.body === "string" ? JSON.parse(req.body) : req.body)?.action; } catch { return ""; } };

// Brand follows the host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
