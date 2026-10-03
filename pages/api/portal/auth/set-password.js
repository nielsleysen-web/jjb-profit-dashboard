// POST /api/portal/auth/set-password  { password }  (ingelogd vereist)
import { readSession, hashPassword } from "../../../../lib/portal-auth";
import { setMemberPassword } from "../../../../lib/portal-members";
import { recordPasswordSet } from "../../../../lib/portal-activity";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  const password = String(req.body?.password || "");
  if (password.length < 8) return res.status(400).json({ ok: false, error: "too_short" });
  try {
    const m = await setMemberPassword(s.email, hashPassword(password));
    await recordPasswordSet(s.email);
    if (!m) return res.status(404).json({ ok: false, error: "no_member" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("portal set-password:", e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
