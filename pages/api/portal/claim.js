// POST /api/portal/claim { slug }  (ingelogd) — gratis product bestellen, zie lib/portal-claim.js
//   → { ok:true, action:"done", result }                 betaald + Shopify-order aangemaakt
//   → { ok:true, action:"confirm", clientSecret, paymentIntentId, pk }   3D Secure in de browser nodig
//   → { ok:true, action:"redirect", url }                PayPal-lid: naar PayPal om te betalen
//   → { ok:false, error }                                 already_ordered | no_address | no_payment_method | card_declined | …
import { readSession } from "../../../lib/portal-auth";
import { getMember } from "../../../lib/portal-members";
import { startClaim, ClaimError } from "../../../lib/portal-claim";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const r = await startClaim(m, String(req.body?.slug || ""));
    if (r.action === "confirm") r.pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ClaimError) return res.status(e.status).json({ ok: false, error: e.code });
    console.error("portal claim:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
