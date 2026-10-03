// /api/portal/auth/verify
//   GET  ?t=<token>  → stuurt door naar de pagina /verify?t=… (de token wordt daar pas gebruikt).
//                     Zo kan een link-voorvertoning van de browser of een mailscanner de eenmalige
//                     link niet "opbranden" vóór het lid hem echt opent.
//   POST { t }       → token controleren, sessie-cookie zetten, antwoord { ok, next }
//                     next: "/welcome" (nog geen wachtwoord) · "/new-password" (reset) · "/" (startpagina)

import { consumeLoginToken, setSessionCookie, PORTAL_URL } from "../../../../lib/portal-auth";
import { getMember } from "../../../../lib/portal-members";
import { recordLogin } from "../../../../lib/portal-activity";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const t = String(req.query.t || "");
    return res.redirect(302, `${PORTAL_URL}/verify?t=${encodeURIComponent(t)}`);
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const t = String(req.body?.t || "");
    const hit = t ? await consumeLoginToken(t) : null;
    if (!hit) return res.status(400).json({ ok: false, error: "expired" });
    const member = await getMember(hit.email);
    if (!member) return res.status(400).json({ ok: false, error: "expired" });
    setSessionCookie(res, hit.email);
    await recordLogin(hit.email, hit.purpose === "welcome" ? "welcome" : "link");
    const next = hit.purpose === "reset" ? "/new-password" : !member.password?.hash ? "/welcome" : "/";
    return res.status(200).json({ ok: true, next });
  } catch (e) {
    console.error("portal verify:", e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
