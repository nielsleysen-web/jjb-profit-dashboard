// pages/api/paypal-disputes.js — PayPal disputes for customer service (Members page).
// GET                       → { success, autoreply, disputes: [...], templates: { key: { label, preview } } }
// POST { id }               → send our message in that dispute (inquiry phase only, never twice)
// Access: admin, finance or Membership CS Rep.
import { getDashboardSession, canMembership } from "../../lib/dashboard-session";
import { paypalConfigured } from "../../lib/paypal";
import { listDisputes, sendDisputeMessage, TEMPLATES } from "../../lib/paypal-disputes";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getDashboardSession(req);
  if (!canMembership(s)) return res.status(401).json({ success: false, error: "No access" });
  if (!paypalConfigured()) return res.status(200).json({ success: true, configured: false, disputes: [] });
  try {
    if (req.method === "GET") {
      const templates = Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, { label: t.label, preview: t.text({ name: "Maria", amount: "49,00" }) }]));
      const disputes = await listDisputes();
      return res.status(200).json({ success: true, configured: true, autoreply: String(process.env.PAYPAL_DISPUTE_AUTOREPLY || "").toLowerCase() === "on", disputes, templates });
    }
    if (req.method === "POST") {
      const id = String(req.body?.id || "");
      if (!/^PP-[A-Z0-9-]{4,40}$/i.test(id)) return res.status(400).json({ success: false, error: "Invalid dispute id" });
      const r = await sendDisputeMessage(id, { by: s.name || s.email || "dashboard" });
      return res.status(r.sent ? 200 : 409).json({ success: !!r.sent, ...r, error: r.sent ? undefined : `Not sent: ${r.reason}` });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (e) {
    console.error("paypal-disputes:", e.message);
    const hint = e.status === 403 ? " (the PayPal app has no access to the Disputes API)" : "";
    return res.status(500).json({ success: false, error: e.message + hint });
  }
}
