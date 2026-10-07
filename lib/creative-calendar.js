// lib/creative-calendar.js — Angle/ICP-kalender: per product en per week de angle × ICP waarop het team focust.
// Opslag: Shopify metaobject "creative-calendar" → { entries: [{ id, product, week, mechanism, icp, note, createdBy, createdAt }] }
// week = maandag van die week als YYYY-MM-DD (weken lopen van maandag t/m zondag, tijdzone Asia/Hong_Kong zoals de deadlines).

const TZ = "Asia/Hong_Kong";

// Datum van vandaag in de teamtijdzone, als YYYY-MM-DD
export function todayStr(d = new Date()) {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

// Maandag van de week waarin de datum valt (YYYY-MM-DD)
export function weekStart(dateStr) {
  const d = new Date(`${dateStr || todayStr()}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // ma=0 … zo=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ISO-weeknummer van een maandag
export function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - ((t.getUTCDay() + 6) % 7 + 1));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

// entries = ingeplande focus per week · backlog = ideeën (angle × ICP per product) die nog ingepland moeten worden
export function normCalendar(c) {
  return {
    entries: Array.isArray(c?.entries) ? c.entries.filter((e) => e && e.id && e.product && e.week) : [],
    backlog: Array.isArray(c?.backlog) ? c.backlog.filter((e) => e && e.id && e.product && e.mechanism && e.icp) : [],
  };
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// Focus-entries voor een product in een week (nieuwste eerst)
export function focusFor(cal, product, week = weekStart()) {
  return normCalendar(cal).entries
    .filter((e) => same(e.product, product) && e.week === week)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
