// POST /api/portal/library/unlock { slug } → { ok, url, viaGift } | { ok:false, error:"limit"|"unknown", availableAgain }
import { readSession } from "../../../../lib/portal-auth";
import { getMember } from "../../../../lib/portal-members";
import { getSubscriptionInfo } from "../../../../lib/portal-account";
import { unlockBook, LibraryError } from "../../../../lib/portal-library";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const s = readSession(req);
    if (!s) return res.status(401).json({ ok: false, error: "auth" });
    const member = await getMember(s.email);
    if (!member) return res.status(401).json({ ok: false, error: "auth" });
    const sub = await getSubscriptionInfo(member);
    const cycleEnd = sub.cycleEnd ? new Date(sub.cycleEnd).getTime() : Date.now();
    if (sub.status === "cancelled" && cycleEnd < Date.now()) return res.status(403).json({ ok: false, error: "ended" });
    const r = await unlockBook(s.email, String(req.body?.slug || ""), sub.cycleStart || Date.now());
    return res.status(200).json({ ok: true, url: `/api/portal/library/file?slug=${encodeURIComponent(req.body.slug)}`, viaGift: r.viaGift });
  } catch (e) {
    if (e instanceof LibraryError) {
      const extra = {};
      if (e.code === "limit") { try { const m = await getMember(readSession(req).email); const sub = await getSubscriptionInfo(m); extra.availableAgain = sub.cycleEnd; } catch {} }
      return res.status(e.status).json({ ok: false, error: e.code, ...extra });
    }
    console.error("portal library unlock:", e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
