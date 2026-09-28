// GET /api/portal/me → gegevens van het ingelogde lid (zonder wachtwoord-hash)
import { readSession } from "../../../lib/portal-auth";
import { getMember, publicMember } from "../../../lib/portal-members";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  const m = await getMember(s.email);
  if (!m) return res.status(401).json({ ok: false, error: "no_member" });
  return res.status(200).json({ ok: true, member: publicMember(m) });
}
