// POST /api/portal/auth/logout → cookie wissen
import { clearSessionCookie } from "../../../../lib/portal-auth";
export default function handler(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
