// POST /api/portal/home (ingelogd) — acties van de Home
//   { action: "dismissWelcome" }               welkomstbanner niet meer tonen
//   { action: "readNotifications" }            alle notificaties gelezen
//   { action: "reminder", on: true|false }     e-mailherinnering voor de login-streak (aan via de Home, uit via Instellingen)
//   { action: "birthday", day, month }         verjaardag (optioneel; leeg = wissen)
//   { action: "openReward", id }               verrassingscadeau openen → { slug, url } (e-book komt in de bibliotheek)
//   { action: "suggest", text, page }          idee/verzoek voor het platform
import { readSession } from "../../../lib/portal-auth";
import { getMember } from "../../../lib/portal-members";
import { getSubscriptionInfo, isDeactivated } from "../../../lib/portal-account";
import { patchMember, setStreakReminder, setBirthday, openReward, addSuggestion } from "../../../lib/portal-home";
import { bump } from "../../../lib/portal-store";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const s = readSession(req);
  if (!s) return res.status(401).json({ ok: false, error: "not_logged_in" });
  try {
    const m = await getMember(s.email);
    if (!m) return res.status(401).json({ ok: false, error: "no_member" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const now = new Date().toISOString();

    if (b.action === "dismissWelcome") { await patchMember(m.email, { welcomeDismissedAt: now }); return res.status(200).json({ ok: true }); }
    if (b.action === "readNotifications") { await patchMember(m.email, { notifReadAt: now }); return res.status(200).json({ ok: true }); }
    if (b.action === "reminder") { await setStreakReminder(m, !!b.on); return res.status(200).json({ ok: true, on: !!b.on }); }
    if (b.action === "birthday") {
      const d = parseInt(b.day, 10), mo = parseInt(b.month, 10);
      const valid = d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && !isNaN(Date.parse(`2000-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`));
      if ((b.day || b.month) && !valid) return res.status(400).json({ ok: false, error: "invalid" });
      await setBirthday(m, valid ? `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
      return res.status(200).json({ ok: true });
    }
    if (b.action === "openReward") {
      const sub = await getSubscriptionInfo(m);
      if (isDeactivated(m, sub)) return res.status(403).json({ ok: false, error: "ended" });
      const r = await openReward(m.email, String(b.id || ""));
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });
      return res.status(200).json({ ok: true, ...r });
    }
    if (b.action === "suggest") {
      const text = String(b.text || "").trim();
      if (text.length < 3) return res.status(400).json({ ok: false, error: "empty" });
      if ((await bump(`portal:rl:suggest:${m.email}`, 3600)) > 5) return res.status(429).json({ ok: false, error: "too_many" });
      await addSuggestion(m, text, b.page);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("portal home:", s.email, e.message);
    return res.status(500).json({ ok: false, error: "server" });
  }
}
