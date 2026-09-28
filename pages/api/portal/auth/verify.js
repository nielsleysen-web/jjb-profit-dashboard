// GET /api/portal/auth/verify?t=<token>
// Inloglink uit de mail: token controleren, sessie-cookie zetten en doorsturen.
//   welcome / login zonder wachtwoord → /portal/welcome  (wachtwoord kiezen of overslaan)
//   reset                            → /portal/new-password
//   anders                           → /portal

import { consumeLoginToken, setSessionCookie } from "../../../../lib/portal-auth";
import { getMember } from "../../../../lib/portal-members";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const t = String(req.query.t || "");
    const hit = t ? await consumeLoginToken(t) : null;
    if (!hit) return res.redirect(302, "/portal/login?expired=1");
    const member = await getMember(hit.email);
    if (!member) return res.redirect(302, "/portal/login?expired=1");
    setSessionCookie(res, hit.email);
    if (hit.purpose === "reset") return res.redirect(302, "/portal/new-password");
    if (!member.password?.hash) return res.redirect(302, "/portal/welcome");
    return res.redirect(302, "/portal");
  } catch (e) {
    console.error("portal verify:", e.message);
    return res.redirect(302, "/portal/login?expired=1");
  }
}
