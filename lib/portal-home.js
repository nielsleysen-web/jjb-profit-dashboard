// lib/portal-home.js — Home van het ledenportaal (server-only): login-streak met verrassingscadeaus,
// verjaardagscadeau, waarde van de membership, recente activiteit en notificaties.
//
// Login-streak (dagen in Italiaanse tijd, Europe/Rome):
//   - elk bezoek aan het portaal (overview) telt voor die dag; de eerste van de dag verhoogt de streak
//   - één dag gemist → de streak saver (1 per kalendermaand) houdt de streak vast; anders opnieuw vanaf 1
//   - op dag 30, 60 en 90 wordt een verrassingscadeau klaargezet: een willekeurig e-book dat het lid nog niet heeft.
//     Pas bij het openen ("Open my gift") komt het in de bibliotheek en in de activiteit, zodat de verrassing blijft.
//   Redis portal:streak:<email> = { current, best, lastDay, lastVisitAt, saverMonth, saverAvail, saverUsedAt, rewards: { "30": { at, slug, openedAt } } }
//
// Verjaardag: member.birthday = "MM-DD" (Instellingen). Van de verjaardag tot 30 dagen erna staat er een cadeau klaar
// (willekeurig e-book), één keer per jaar. Redis portal:bday:<email> = { "2026": { at, slug, openedAt } }
//
// Streak-herinnering per e-mail: member.streakReminder = true. Bij het eerste bezoek van de dag gaat het Klaviyo-event
// "Portal Daily Visit" (streak, days_to_gift, …). De Klaviyo-flow wacht tot 19:00 de volgende dag en mailt alleen als er
// sindsdien geen nieuw "Portal Daily Visit" was (= niet ingelogd die dag).
//
// Notificaties worden afgeleid uit de toestand (cadeau klaar, nieuwe cyclus, verzonden pakket, streak, saver gebruikt …);
// gelezen = alles van vóór member.notifReadAt.
//
// Ideeën/verzoeken van leden ("Suggest something"): Redis-lijst portal:suggestions (nieuwste eerst, max 500),
// te zien op de Members-pagina van het dashboard.

import { redis, getJson, setJson } from "./portal-store";
import { normEmail, PORTAL_URL } from "./portal-auth";
import { memberKey } from "./portal-members";
import { BOOKS, findBook } from "./portal-content";
import { findPortalProduct } from "./portal-products";
import { logEvent, getLog } from "./portal-activity";
import { trackEvent, setProfileProperties, klaviyoConfigured } from "./klaviyo";

export const STREAK_MILESTONES = [30, 60, 90];
export const EBOOK_VALUE = 29.95; // waarde van één e-book in het waardeblok
const TZ = "Europe/Rome";
const DAY = 86400000;

const streakKey = (e) => `portal:streak:${normEmail(e)}`;
const bdayKey = (e) => `portal:bday:${normEmail(e)}`;
// Secret gift uit de abandoned-checkout-mail: portal:secretgift:<email> = { at, slug, openedAt, order }
const secretKey = (e) => `portal:secretgift:${normEmail(e)}`;
const libKey = (e) => `portal:lib:${normEmail(e)}`;
const romeDay = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE", { timeZone: TZ });
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

// Lid-record bijwerken zonder de filter van upsertMember (die laat false/"" weg)
export async function patchMember(email, patch) {
  const k = memberKey(normEmail(email));
  const cur = (await getJson(k)) || null;
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  for (const [key, v] of Object.entries(patch)) if (v === null) delete next[key];
  await setJson(k, next);
  return next;
}

async function unlockedSet(email) {
  return new Set((await redis(["SMEMBERS", libKey(email)]).catch(() => [])) || []);
}

// Willekeurig e-book dat het lid nog niet heeft (welkomstcadeau en al gereserveerde cadeaus overgeslagen)
async function pickBook(email, exclude = []) {
  const have = await unlockedSet(email);
  const pool = BOOKS.filter((b) => !b.gift && !have.has(b.slug) && !exclude.includes(b.slug));
  const fallback = BOOKS.filter((b) => !b.gift);
  const list = pool.length ? pool : fallback;
  return list.length ? list[Math.floor(Math.random() * list.length)].slug : null;
}

const nextMilestone = (current) => STREAK_MILESTONES.find((m) => m > current) || null;

// ---- streak ------------------------------------------------------------------
export async function getStreak(email) {
  return (await getJson(streakKey(email)).catch(() => null)) || { current: 0, best: 0, lastDay: null, saverMonth: null, saverAvail: 1, rewards: {} };
}

// Bezoek registreren (idempotent per dag). Geeft de bijgewerkte streak terug.
export async function touchStreak(member) {
  const email = member.email;
  const st = await getStreak(email);
  const now = Date.now(), today = romeDay(now), month = today.slice(0, 7);
  if (st.saverMonth !== month) { st.saverMonth = month; st.saverAvail = 1; }
  if (st.lastDay === today) return st;

  const gap = st.lastDay ? dayDiff(st.lastDay, today) : null;
  if (gap === 1) st.current = (st.current || 0) + 1;
  else if (gap === 2 && st.saverAvail > 0) {
    st.saverAvail = 0; st.saverUsedAt = new Date(now).toISOString(); st.current = (st.current || 0) + 1;
    await logEvent(email, "streak_saver", { streak: st.current });
  } else st.current = 1;
  st.lastDay = today;
  st.lastVisitAt = new Date(now).toISOString();
  st.best = Math.max(st.best || 0, st.current);
  st.rewards = st.rewards || {};

  for (const m of STREAK_MILESTONES) {
    if (st.current >= m && !st.rewards[m]) {
      const reserved = Object.values(st.rewards).map((r) => r.slug);
      st.rewards[m] = { at: new Date(now).toISOString(), slug: await pickBook(email, reserved), openedAt: null };
      await logEvent(email, "streak_reward", { days: m });
    }
  }
  await setJson(streakKey(email), st);

  // Herinnering per e-mail: Klaviyo-flow start bij dit event en mailt als morgen om 19:00 geen nieuw bezoek is
  if (member.streakReminder && klaviyoConfigured()) {
    const nm = nextMilestone(st.current);
    trackEvent("Portal Daily Visit", email, {
      streak: st.current, next_gift_day: nm, days_to_gift: nm ? nm - st.current : null,
      saver_available: st.saverAvail > 0, first_name: member.firstName || "", portal_url: PORTAL_URL,
    }, { uniqueId: `visit-${email}-${today}` }).catch((e) => console.warn("klaviyo daily visit:", e.message));
  }
  return st;
}

// ---- verjaardag ----------------------------------------------------------------
// Staat er (nu) een verjaardagscadeau klaar? Zet het klaar als de verjaardag in de laatste 30 dagen viel.
export async function checkBirthday(member) {
  const b = String(member.birthday || "");
  if (!/^\d{2}-\d{2}$/.test(b)) return null;
  const now = Date.now(), today = romeDay(now), y = Number(today.slice(0, 4));
  const startedDay = romeDay(new Date(member.startedAt || member.createdAt || now).getTime());
  let gift = null;
  for (const year of [y, y - 1]) {
    const bd = `${year}-${b}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd) || isNaN(Date.parse(bd))) continue;
    const d = dayDiff(bd, today);
    if (d >= 0 && d <= 30 && dayDiff(startedDay, bd) >= 0) { gift = { year: String(year), day: bd }; break; }
  }
  const all = (await getJson(bdayKey(member.email)).catch(() => null)) || {};
  if (gift && !all[gift.year]) {
    all[gift.year] = { at: new Date(now).toISOString(), slug: await pickBook(member.email), openedAt: null };
    await setJson(bdayKey(member.email), all);
    await logEvent(member.email, "birthday_gift", { year: gift.year });
  }
  return all;
}

// ---- cadeau openen ---------------------------------------------------------------
// id = "streak30" | "streak60" | "streak90" | "bday2026" → e-book in de bibliotheek + activiteit
export async function openReward(email, id) {
  let rec, save;
  const m = /^streak(\d+)$/.exec(id), b = /^bday(\d{4})$/.exec(id);
  if (id === "secretgift") {
    rec = await getJson(secretKey(email)).catch(() => null);
    save = async () => setJson(secretKey(email), rec);
  } else if (m) {
    const st = await getStreak(email); rec = st.rewards?.[m[1]];
    save = async () => setJson(streakKey(email), st);
  } else if (b) {
    const all = (await getJson(bdayKey(email)).catch(() => null)) || {}; rec = all[b[1]];
    save = async () => setJson(bdayKey(email), all);
  }
  if (!rec) return null;
  if (!rec.slug) rec.slug = await pickBook(email);
  const book = findBook(rec.slug);
  if (!book) return null;
  if (!rec.openedAt) {
    rec.openedAt = new Date().toISOString();
    await redis(["SADD", libKey(email), book.slug]);
    await logEvent(email, "ebook", { slug: book.slug, surprise: id });
    await save();
  }
  return { slug: book.slug, url: `/api/portal/library/file?slug=${encodeURIComponent(book.slug)}` };
}

// ---- herinnering aan/uit ----------------------------------------------------------
export async function setStreakReminder(member, on) {
  await patchMember(member.email, { streakReminder: !!on });
  if (klaviyoConfigured()) {
    await setProfileProperties(member.email, { jj_streak_reminder: !!on }).catch((e) => console.warn("klaviyo reminder prop:", e.message));
    if (on) {
      // meteen een eerste event, zodat de flow vanaf vandaag loopt
      const st = await getStreak(member.email);
      const nm = nextMilestone(st.current || 0);
      await trackEvent("Portal Daily Visit", member.email, {
        streak: st.current || 0, next_gift_day: nm, days_to_gift: nm ? nm - (st.current || 0) : null,
        saver_available: (st.saverAvail ?? 1) > 0, first_name: member.firstName || "", portal_url: PORTAL_URL,
      }, { uniqueId: `visit-${member.email}-${romeDay()}` }).catch(() => {});
    }
  }
}

export async function setBirthday(member, mmdd) {
  const v = /^\d{2}-\d{2}$/.test(mmdd || "") ? mmdd : null;
  await patchMember(member.email, { birthday: v });
  if (klaviyoConfigured()) {
    // Klaviyo: datum-eigenschap voor een jaarlijkse verjaardagsflow (jaartal is niet belangrijk)
    await setProfileProperties(member.email, { jj_birthday: v ? `2000-${v}` : null }).catch((e) => console.warn("klaviyo birthday prop:", e.message));
  }
}

// ---- alles voor de Home ---------------------------------------------------------------
// overview = resultaat van getOverview (orders, freeItems, library, cycle, …)
export async function buildHome(member, overview) {
  const email = member.email;
  const [st, bdays, log, secret] = await Promise.all([
    touchStreak(member).catch((e) => { console.warn("portal streak:", e.message); return null; }),
    checkBirthday(member).catch(() => null),
    getLog(email, 200).catch(() => []),
    getJson(secretKey(email)).catch(() => null),
  ]);
  const now = Date.now();
  const books = Object.fromEntries(BOOKS.map((b) => [b.slug, b]));
  const unlocked = new Set((overview.library?.books || []).filter((b) => b.unlocked).map((b) => b.slug));

  // --- waarde: gratis producten (portaalorders) + ontgrendelde e-books
  const items = [];
  const seenOrders = new Set();
  for (const o of overview.orders || []) {
    for (const i of o.items || []) {
      const p = i.portal ? findPortalProduct(i.portal) : null;
      if (!p) continue;
      seenOrders.add(o.name);
      items.push({ type: "product", slug: p.slug, at: o.createdAt, value: p.compareAt / 100, image: p.image, order: o.name });
    }
  }
  for (const e of log) if (e.type === "claim" && e.order && !seenOrders.has(e.order)) {
    const p = findPortalProduct(e.slug);
    if (p) { seenOrders.add(e.order); items.push({ type: "product", slug: p.slug, at: e.at, value: p.compareAt / 100, image: p.image, order: e.order }); }
  }
  const ebookAt = {};
  for (const e of log) if (e.type === "ebook" && e.slug && !ebookAt[e.slug]) ebookAt[e.slug] = { at: e.at, kind: e.gift ? "welcome" : e.surprise ? (e.surprise.startsWith("bday") ? "birthday" : e.surprise === "secretgift" ? "secret" : "streak") : "library" };
  for (const slug of unlocked) {
    const b = books[slug]; if (!b) continue;
    items.push({ type: "ebook", slug, at: ebookAt[slug]?.at || null, kind: ebookAt[slug]?.kind || (b.gift ? "welcome" : "library"), value: EBOOK_VALUE, image: b.cover });
  }
  items.sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));
  const value = { total: Math.round(items.reduce((s, i) => s + i.value, 0) * 100) / 100, items: items.slice(0, 3), count: items.length };

  // --- streak
  const rewards = st?.rewards || {};
  const nm = st ? nextMilestone(st.current) : STREAK_MILESTONES[0];
  const pending = [];
  for (const m of STREAK_MILESTONES) if (rewards[m] && !rewards[m].openedAt) pending.push({ id: `streak${m}`, kind: "streak", days: m, at: rewards[m].at });
  for (const [year, r] of Object.entries(bdays || {})) if (!r.openedAt) pending.push({ id: `bday${year}`, kind: "birthday", at: r.at });
  if (secret && !secret.openedAt) pending.push({ id: "secretgift", kind: "secret", at: secret.at });
  const streak = st ? {
    current: st.current, best: st.best, nextGift: nm, daysToGift: nm ? nm - st.current : null,
    milestones: STREAK_MILESTONES.map((m) => ({ day: m, reached: st.current >= m || !!rewards[m], opened: !!rewards[m]?.openedAt })),
    saverAvail: st.saverAvail ?? 1, saverUsedAt: st.saverUsedAt || null, reminder: !!member.streakReminder,
  } : null;

  // --- recente activiteit
  const act = [];
  for (const o of (overview.orders || []).filter((o) => o.portal)) {
    const slug = o.items.find((i) => i.portal)?.portal;
    if (o.status === "shipped") act.push({ type: "shipped", at: o.createdAt, slug, order: o.name, trackingUrl: o.trackingUrl });
  }
  for (const e of log) {
    if (e.type === "claim") { const p = findPortalProduct(e.slug); act.push({ type: "claim", at: e.at, slug: e.slug, value: p ? p.compareAt / 100 : null }); }
    else if (e.type === "ebook") act.push({ type: e.surprise ? "surprise" : "ebook", at: e.at, slug: e.slug });
    else if (e.type === "reactivated") act.push({ type: "reactivated", at: e.at });
  }
  if (!log.some((e) => e.type === "claim")) {
    for (const o of (overview.orders || []).filter((o) => o.portal)) { const slug = o.items.find((i) => i.portal)?.portal; const p = findPortalProduct(slug); act.push({ type: "claim", at: o.createdAt, slug, value: p ? p.compareAt / 100 : null }); }
  }
  const since = overview.membership?.since || member.startedAt;
  if (since) act.push({ type: "joined", at: since });
  act.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  // --- notificaties
  const readAt = Date.parse(member.notifReadAt || 0) || 0;
  const n = [];
  for (const p of pending) n.push({ id: p.id, type: p.kind === "birthday" ? "birthday" : p.kind === "secret" ? "secret" : "reward", at: p.at, days: p.days });
  const cs = overview.cycle?.start;
  if (cs && (overview.freeItems || []).some((p) => !p.ordered)) n.push({ id: `free-${cs.slice(0, 10)}`, type: "free", at: cs });
  if (cs && overview.library?.left > 0) n.push({ id: `guide-${cs.slice(0, 10)}`, type: "guide", at: cs });
  if (st && st.current >= 2) n.push({ id: `streak-${st.lastDay}`, type: "streak", at: st.lastVisitAt, streak: st.current, daysToGift: nm ? nm - st.current : null });
  if (st?.saverUsedAt) n.push({ id: `saver-${st.saverUsedAt.slice(0, 10)}`, type: "saver", at: st.saverUsedAt });
  for (const o of (overview.orders || []).filter((o) => o.portal && o.status === "shipped" && now - Date.parse(o.createdAt) < 30 * DAY)) {
    n.push({ id: `ship-${o.name}`, type: "shipped", at: o.createdAt, slug: o.items.find((i) => i.portal)?.portal, order: o.name });
  }
  n.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const notifications = n.slice(0, 15).map((x) => ({ ...x, unread: (Date.parse(x.at) || 0) > readAt }));

  return {
    welcome: !member.welcomeDismissedAt,
    value,
    streak,
    rewards: pending.map((p) => ({ ...p, slug: null })), // titel pas na openen
    activity: act.slice(0, 4),
    notifications,
    unread: notifications.filter((x) => x.unread).length,
    birthday: member.birthday || null,
  };
}

// ---- ideeën / verzoeken van leden ---------------------------------------------------
const SUGGEST_KEY = "portal:suggestions";
export async function addSuggestion(member, text, page) {
  const entry = { at: new Date().toISOString(), email: member.email, name: [member.firstName, member.lastName].filter(Boolean).join(" "), text: String(text).slice(0, 2000), page: String(page || "").slice(0, 40) };
  await redis(["LPUSH", SUGGEST_KEY, JSON.stringify(entry)]);
  await redis(["LTRIM", SUGGEST_KEY, "0", "499"]);
  await logEvent(member.email, "suggestion", { text: entry.text.slice(0, 200) });
  return entry;
}
export async function listSuggestions(n = 100) {
  const raw = (await redis(["LRANGE", SUGGEST_KEY, "0", String(n - 1)]).catch(() => [])) || [];
  return raw.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}
