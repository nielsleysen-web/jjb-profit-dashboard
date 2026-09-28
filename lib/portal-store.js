// lib/portal-store.js — Opslag voor het ledenportaal (Upstash Redis, REST).
//
// Sleutels:
//   portal:member:<email>        JSON met de ledengegevens (zie lib/portal-members.js)
//   portal:login:<token>         e-mail + doel van een inloglink (met vervaltijd)
//   portal:rl:<soort>:<email>    teller voor rate-limiting
//   portal:members               set van alle e-mails (voor overzichten/backfill)
//
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (dezelfde als de rest van het dashboard)

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeConfigured = () => !!(R_URL && R_TOK);

export async function redis(cmd) {
  if (!storeConfigured()) throw new Error("UPSTASH_REDIS_REST_URL / _TOKEN ontbreekt");
  const r = await fetch(R_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

export async function getJson(key) {
  const v = await redis(["GET", key]);
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export async function setJson(key, value, ttlSec) {
  const cmd = ["SET", key, JSON.stringify(value)];
  if (ttlSec) cmd.push("EX", String(ttlSec));
  return redis(cmd);
}

export const del = (key) => redis(["DEL", key]);

// Teller met vervaltijd: geeft het nieuwe aantal terug (1 bij de eerste keer in het venster)
export async function bump(key, windowSec) {
  const n = await redis(["INCR", key]);
  if (n === 1) await redis(["EXPIRE", key, String(windowSec)]);
  return n;
}
