// GET /api/portal/overview → alles wat het portaal toont voor het ingelogde lid
// (abonnement, cyclus, bestellingen, gratis producten, library, cursussen) + de Home (streak, waarde, activiteit,
// notificaties; lib/portal-home.js). Elk bezoek telt voor de login-streak.
import { readSession } from "../../../lib/portal-auth";
import { getMember, publicMember } from "../../../lib/portal-members";
import { getOverview } from "../../../lib/portal-account";
import { touchSeen } from "../../../lib/portal-activity";
import { buildHome } from "../../../lib/portal-home";
import { withPortalBrand } from "../../../lib/portal-brand";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const overview = await getOverview(m);
    await touchSeen(s.email);
    const home = overview.deactivated ? null : await buildHome(m, overview).catch((e) => { console.warn("portal home:", s.email, e.message); return null; });
    return res.status(200).json({ ok: true, member: publicMember(m), ...overview, home });
  } catch (e) {
    console.error("portal overview:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
