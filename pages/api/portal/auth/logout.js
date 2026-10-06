// POST /api/portal/auth/logout → cookie wissen
import { clearSessionCookie } from "../../../../lib/portal-auth";
import { withPortalBrand } from "../../../../lib/portal-brand";
function handler(req, res) {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
