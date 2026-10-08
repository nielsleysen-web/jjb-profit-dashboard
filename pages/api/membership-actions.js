// pages/api/membership-actions.js — Acties van customer service (Membership Dashboard en Members).
// POST { action: "pause",    provider, subscriptionId, email, days: 30|60|90 }
// POST { action: "resume",   provider, subscriptionId, email }
// POST { action: "cancel",   provider, subscriptionId, email, reason, refundRequested: bool, chargebackRisk: "High"|"Medium"|"Low" }
// POST { action: "magicLink", email }
// Optioneel brand: "neurotone" | "lubrisense" (anders: het portaal waar dit e-mailadres lid is).
// Toegang: admin, finance of de rol Membership CS Rep.
import { getDashboardSession, canMembership } from "../../lib/dashboard-session";
import { pauseMembership, resumeMembership, cancelMembership, sendMagicLink, ActionError } from "../../lib/membership-actions";
import { storeConfigured, getJson } from "../../lib/portal-store";
import { memberKey } from "../../lib/portal-members";
import { normEmail } from "../../lib/portal-auth";
import { BRANDS, runWithBrand } from "../../lib/portal-brand";

// Ledenportaal van deze actie: body.brand, anders het portaal waar dit e-mailadres lid is (NeuroTone eerst)
async function detectBrand(b) {
  const k = String(b.brand || "").toLowerCase();
  if (BRANDS[k]) return k;
  const email = normEmail(b.email || "");
  if (email) for (const key of Object.keys(BRANDS)) { if (await runWithBrand(key, () => getJson(memberKey(email))).catch(() => null)) return key; }
  return "neurotone";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  const s = getDashboardSession(req);
  if (!canMembership(s)) return res.status(401).json({ success: false, error: "No access" });
  if (!storeConfigured()) return res.status(500).json({ success: false, error: "Portal store not configured" });
  const b = req.body || {};
  const by = s.name || s.email || "";
  try {
    if (!["pause", "resume", "cancel", "magicLink"].includes(b.action)) return res.status(400).json({ success: false, error: "Unknown action" });
    const brand = await detectBrand(b);
    const result = await runWithBrand(brand, async () => {
      if (b.action === "pause") return pauseMembership({ ...b, by });
      if (b.action === "resume") return resumeMembership({ ...b, by });
      if (b.action === "cancel") return cancelMembership({ ...b, by });
      return sendMagicLink({ email: b.email, by });
    });
    console.log(`membership action ${b.action} by ${s.email}: ${b.subscriptionId || b.email}`);
    return res.status(200).json({ success: true, result });
  } catch (e) {
    console.error("membership action:", b.action, e.message);
    return res.status(e instanceof ActionError ? e.status : 502).json({ success: false, error: e.message });
  }
}
