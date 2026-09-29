// POST /api/portal/settings (ingelogd)
//   { action: "name", firstName, lastName }
//   { action: "password", current?, password }   — huidige wachtwoord verplicht als er al één is
import { readSession, hashPassword, verifyPassword } from "../../../lib/portal-auth";
import { getMember, upsertMember, setMemberPassword } from "../../../lib/portal-members";
import { bump } from "../../../lib/portal-store";

const clean = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 60);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const { action } = req.body || {};

    if (action === "name") {
      const firstName = clean(req.body.firstName), lastName = clean(req.body.lastName);
      if (!firstName) return res.status(400).json({ ok: false, error: "missing" });
      await upsertMember({ email: m.email, firstName, lastName });
      return res.status(200).json({ ok: true });
    }

    if (action === "password") {
      const password = String(req.body.password || "");
      if (password.length < 8) return res.status(400).json({ ok: false, error: "too_short" });
      if (m.password?.hash) {
        const n = await bump(`portal:rl:pw:${m.email}`, 900);
        if (n > 10) return res.status(429).json({ ok: false, error: "too_many" });
        if (!verifyPassword(String(req.body.current || ""), m.password.salt, m.password.hash)) return res.status(400).json({ ok: false, error: "wrong_current" });
      }
      await setMemberPassword(m.email, hashPassword(password));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("portal settings:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
