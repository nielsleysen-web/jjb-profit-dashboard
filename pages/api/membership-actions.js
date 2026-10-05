// pages/api/membership-actions.js — Acties van customer service (Membership Dashboard en Members).
// POST { action: "pause",    provider, subscriptionId, email, days: 30|60|90 }
// POST { action: "resume",   provider, subscriptionId, email }
// POST { action: "cancel",   provider, subscriptionId, email, reason, refundRequested: bool, chargebackRisk: "High"|"Medium"|"Low" }
// POST { action: "magicLink", email }
// Toegang: admin, finance of de rol Membership CS Rep.
import { getDashboardSession, canMembership } from "../../lib/dashboard-session";
import { pauseMembership, resumeMembership, cancelMembership, sendMagicLink, ActionError } from "../../lib/membership-actions";
import { storeConfigured } from "../../lib/portal-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  const s = getDashboardSession(req);
  if (!canMembership(s)) return res.status(401).json({ success: false, error: "No access" });
  if (!storeConfigured()) return res.status(500).json({ success: false, error: "Portal store not configured" });
  const b = req.body || {};
  const by = s.name || s.email || "";
  try {
    let result;
    if (b.action === "pause") result = await pauseMembership({ ...b, by });
    else if (b.action === "resume") result = await resumeMembership({ ...b, by });
    else if (b.action === "cancel") result = await cancelMembership({ ...b, by });
    else if (b.action === "magicLink") result = await sendMagicLink({ email: b.email, by });
    else return res.status(400).json({ success: false, error: "Unknown action" });
    console.log(`membership action ${b.action} by ${s.email}: ${b.subscriptionId || b.email}`);
    return res.status(200).json({ success: true, result });
  } catch (e) {
    console.error("membership action:", b.action, e.message);
    return res.status(e instanceof ActionError ? e.status : 502).json({ success: false, error: e.message });
  }
}
