// POST /api/portal/auth/login  { email, password }  → sessie-cookie

import { normEmail, verifyPassword, setSessionCookie } from "../../../../lib/portal-auth";
import { getMember } from "../../../../lib/portal-members";
import { bump } from "../../../../lib/portal-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ ok: false, error: "missing" });

    // Max 10 pogingen per 15 minuten per adres
    const n = await bump(`portal:rl:pw:${email}`, 900);
    if (n > 10) return res.status(429).json({ ok: false, error: "too_many" });

    const member = await getMember(email);
    if (!member) return res.status(401).json({ ok: false, error: "bad_login" });
    if (!member.password?.hash) return res.status(401).json({ ok: false, error: "no_password" });
    if (!verifyPassword(password, member.password.salt, member.password.hash)) return res.status(401).json({ ok: false, error: "bad_login" });

    setSessionCookie(res, email);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("portal login:", e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
