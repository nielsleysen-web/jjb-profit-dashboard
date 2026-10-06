// POST /api/portal/auth/request-link  { email, purpose?: "login" | "reset" }
// Maakt een inloglink (20 min geldig) en stuurt het Klaviyo-event "Portal Login Link"
// met de link als property → daar hangt in Klaviyo de flow met de m1-template aan.
// Antwoordt altijd { ok: true }, ook als het e-mailadres onbekend is (geen lekken van ledenlijst).

import { createLoginLink, normEmail } from "../../../../lib/portal-auth";
import { getMember } from "../../../../lib/portal-members";
import { bump } from "../../../../lib/portal-store";
import { trackEvent, klaviyoConfigured } from "../../../../lib/klaviyo";
import { withPortalBrand } from "../../../../lib/portal-brand";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const email = normEmail(req.body?.email);
    const purpose = req.body?.purpose === "reset" ? "reset" : "login";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: "invalid_email" });

    // Max 3 links per 10 minuten per adres
    const n = await bump(`portal:rl:link:${email}`, 600);
    if (n > 3) return res.status(200).json({ ok: true });

    const member = await getMember(email);
    if (!member) {
      console.log(`portal: login link requested for unknown member ${email}`);
    } else if (!klaviyoConfigured()) {
      console.warn(`portal: KLAVIYO_PRIVATE_KEY ontbreekt — geen login link gestuurd naar ${email}`);
    } else {
      const url = await createLoginLink(email, { purpose, ttlSec: 20 * 60 });
      await trackEvent("Portal Login Link", email, {
        login_url: url, purpose, first_name: member.firstName || "", expires_minutes: 20,
      }, { uniqueId: `portal-link-${email}-${Date.now()}` });
      console.log(`portal: login link (${purpose}) sent to ${email}`);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("portal request-link:", e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
