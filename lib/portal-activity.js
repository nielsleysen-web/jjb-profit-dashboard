// lib/portal-activity.js — Activiteit van leden vastleggen (server-only), voor de Members-pagina in het dashboard.
//
// Op het ledenrecord (portal:member:<email>) komen:
//   welcomeOpenedAt   eerste keer dat de welkomstlink uit mail 1 is gebruikt
//   firstLoginAt / lastLoginAt / loginCount / lastLoginMethod   ("welcome" | "link" | "password")
//   passwordSetAt     wachtwoord gekozen
//   lastSeenAt        laatste portaalgebruik (overview-call), hooguit 1x per 10 min bijgewerkt
//   logins[]          laatste 20 logins { at, method }
// Daarnaast een los logboek portal:log:<email> (lijst, max 200) met { at, type, meta } voor de tijdlijn.

import { redis, getJson, setJson } from "./portal-store";
import { memberKey } from "./portal-members";
import { normEmail } from "./portal-auth";

const logKey = (e) => `portal:log:${normEmail(e)}`;

export async function logEvent(email, type, meta = {}) {
  try {
    const entry = JSON.stringify({ at: new Date().toISOString(), type, ...meta });
    await redis(["LPUSH", logKey(email), entry]);
    await redis(["LTRIM", logKey(email), "0", "199"]);
  } catch {}
}

export async function getLog(email, n = 200) {
  const raw = (await redis(["LRANGE", logKey(email), "0", String(n - 1)]).catch(() => [])) || [];
  return raw.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}

export async function recordLogin(email, method = "password") {
  try {
    const m = await getJson(memberKey(email));
    if (!m) return null;
    const now = new Date().toISOString();
    const next = { ...m, lastLoginAt: now, lastSeenAt: now, loginCount: (m.loginCount || 0) + 1, lastLoginMethod: method, updatedAt: now };
    if (!m.firstLoginAt) next.firstLoginAt = now;
    if (method === "welcome" && !m.welcomeOpenedAt) next.welcomeOpenedAt = now;
    next.logins = [{ at: now, method }, ...(m.logins || [])].slice(0, 20);
    await setJson(memberKey(email), next);
    await logEvent(email, "login", { method });
    return next;
  } catch (e) { console.warn("portal recordLogin:", e.message); return null; }
}

export async function recordPasswordSet(email) {
  try {
    const m = await getJson(memberKey(email));
    if (!m) return null;
    const now = new Date().toISOString();
    await setJson(memberKey(email), { ...m, passwordSetAt: m.passwordSetAt || now, updatedAt: now });
    await logEvent(email, "password_set");
  } catch {}
}

// "Laatst actief": niet bij elke call schrijven — slot van 10 minuten in Redis
export async function touchSeen(email) {
  try {
    const lock = await redis(["SET", `portal:seen:${normEmail(email)}`, "1", "NX", "EX", "600"]);
    if (lock !== "OK") return;
    const m = await getJson(memberKey(email));
    if (!m) return;
    await setJson(memberKey(email), { ...m, lastSeenAt: new Date().toISOString() });
  } catch {}
}
