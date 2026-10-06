// POST /api/portal/claim-complete (ingelogd)
//   { paymentIntentId }  → na 3D Secure (Stripe)
//   { paypalOrderId }    → na goedkeuring op PayPal (token uit de return-URL)
// → { ok:true, result } met de Shopify-order
import { readSession } from "../../../lib/portal-auth";
import { getMember } from "../../../lib/portal-members";
import { completeStripe, completePaypal, ClaimError } from "../../../lib/portal-claim";
import { withPortalBrand } from "../../../lib/portal-brand";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const { paymentIntentId, paypalOrderId } = req.body || {};
    let result;
    if (paymentIntentId) result = await completeStripe(m, String(paymentIntentId));
    else if (paypalOrderId) result = await completePaypal(m, String(paypalOrderId));
    else return res.status(400).json({ ok: false, error: "missing" });
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    if (e instanceof ClaimError) return res.status(e.status).json({ ok: false, error: e.code });
    console.error("portal claim-complete:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
