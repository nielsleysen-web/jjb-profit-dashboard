// GET /api/portal/library/file?slug=… → stuurt een ingelogd lid met een ontgrendeld boek door naar de pdf
import { readSession, portalUrl } from "../../../../lib/portal-auth";
import { isUnlocked } from "../../../../lib/portal-library";
import { findBook } from "../../../../lib/portal-content";
import { getMember } from "../../../../lib/portal-members";
import { getSubscriptionInfo, isDeactivated } from "../../../../lib/portal-account";
import { withPortalBrand } from "../../../../lib/portal-brand";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = readSession(req);
  if (!s) return res.redirect(302, `${portalUrl()}/login`);
  const book = findBook(String(req.query.slug || ""));
  if (!book) return res.status(404).send("Not found");
  const member = await getMember(s.email);
  if (!member) return res.redirect(302, `${portalUrl()}/login`);
  const sub = await getSubscriptionInfo(member);
  if (isDeactivated(member, sub)) return res.redirect(302, `${portalUrl()}/`);
  if (!(await isUnlocked(s.email, book.slug))) return res.redirect(302, `${portalUrl()}/#library`);
  return res.redirect(302, `${portalUrl()}${book.file}`);
}

// Brand volgt de host: members.… = NeuroTone, intimate.… = LubriSense (lib/portal-brand.js)
export default withPortalBrand(handler);
