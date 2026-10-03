// GET /api/portal/overview → alles wat het portaal toont voor het ingelogde lid
// (abonnement, cyclus, bestellingen, gratis producten, library, cursussen).
import { readSession } from "../../../lib/portal-auth";
import { getMember, publicMember } from "../../../lib/portal-members";
import { getOverview } from "../../../lib/portal-account";
import { touchSeen } from "../../../lib/portal-activity";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const overview = await getOverview(m);
    await touchSeen(s.email);
    return res.status(200).json({ ok: true, member: publicMember(m), ...overview });
  } catch (e) {
    console.error("portal overview:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
