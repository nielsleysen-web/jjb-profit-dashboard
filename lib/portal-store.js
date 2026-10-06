// lib/portal-store.js — Opslag voor het ledenportaal (Upstash Redis, REST).
//
// Sleutels:
//   portal:member:<email>        JSON met de ledengegevens (zie lib/portal-members.js)
//   portal:login:<token>         e-mail + doel van een inloglink (met vervaltijd)
//   portal:rl:<soort>:<email>    teller voor rate-limiting
//   portal:members               set van alle e-mails (voor overzichten/backfill)
//
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (dezelfde als de rest van het dashboard)

import { brandKey } from "./portal-brand";

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeConfigured = () => !!(R_URL && R_TOK);

// Commando's waarvan ALLE argumenten sleutels zijn; bij de rest is alleen het eerste argument een sleutel
const MULTI_KEY = new Set(["DEL", "MGET", "EXISTS", "UNLINK", "SUNION", "SINTER", "SDIFF", "TOUCH"]);

// Sleutels "portal:…" volgen het actieve brand (lib/portal-brand.js): LubriSense → "lportal:…"
function brandCmd(cmd) {
  const c = String(cmd[0] || "").toUpperCase();
  if (MULTI_KEY.has(c)) return [cmd[0], ...cmd.slice(1).map(brandKey)];
  return cmd.length > 1 ? [cmd[0], brandKey(cmd[1]), ...cmd.slice(2)] : cmd;
}

export async function redis(cmd) {
  if (!storeConfigured()) throw new Error("UPSTASH_REDIS_REST_URL / _TOKEN ontbreekt");
  cmd = brandCmd(cmd);
  const r = await fetch(R_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  if (!r.ok || j.error) throw new Error(`Redis ${r.status} bij ${cmd[0]} ${String(cmd[1] || "").slice(0, 40)}: ${j.error || text.slice(0, 200)}`);
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
