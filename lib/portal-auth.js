// lib/portal-auth.js — Inloggen in het ledenportaal (members.getjustjenny.com).
//
// Twee manieren om binnen te komen:
//   1. Inloglink (magic link): token in Redis met vervaltijd → /api/portal/auth/verify?t=…
//      - welkomstlink in mail 1 (Klaviyo): 30 dagen geldig
//      - link op aanvraag ("Email me a login link" / "Forgot password"): 20 minuten
//   2. E-mail + wachtwoord (optioneel; het lid kiest er zelf een na de eerste login)
//
// Sessie = ondertekende cookie "jj_member" (HMAC, 30 dagen), zelfde techniek als de dashboard-login.
// Wachtwoorden: scrypt met salt (Node crypto, geen extra pakket nodig).
//
// Env: PORTAL_SESSION_SECRET (valt terug op SESSION_SECRET) · PORTAL_URL (bv. https://members.getjustjenny.com)

import crypto from "crypto";
import { getJson, setJson, del } from "./portal-store";
import { currentBrand } from "./portal-brand";

const SECRET = process.env.PORTAL_SESSION_SECRET || process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
export const COOKIE = "jj_member";
const SESSION_DAYS = 30;

export const PORTAL_URL = (process.env.PORTAL_URL || "https://members.getjustjenny.com").replace(/\/$/, "");
// URL van het portaal van het actieve brand (NeuroTone: members.…, LubriSense: intimate.…)
export const portalUrl = () => currentBrand().portalUrl;
export const normEmail = (e) => String(e || "").trim().toLowerCase();

// ---- sessie-cookie ----------------------------------------------------------
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

export function makeSession(email) {
  const body = b64(JSON.stringify({ e: normEmail(email), exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${body}.${sign(body)}`;
}

export function readSession(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || !SECRET) return null;
  const expect = sign(body);
  if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp && p.exp > Date.now() && p.e ? { email: p.e } : null;
  } catch { return null; }
}

export function setSessionCookie(res, email) {
  res.setHeader("Set-Cookie", `${COOKIE}=${makeSession(email)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ---- wachtwoord -------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

// ---- inloglinks (magic links) ----------------------------------------------
// purpose: "welcome" (mail 1), "login" (op aanvraag), "reset" (wachtwoord vergeten)
export async function createLoginToken(email, { purpose = "login", ttlSec = 20 * 60 } = {}) {
  const token = crypto.randomBytes(24).toString("base64url");
  await setJson(`portal:login:${token}`, { e: normEmail(email), p: purpose, t: Date.now() }, ttlSec);
  return token;
}
export const loginUrl = (token) => `${portalUrl()}/api/portal/auth/verify?t=${encodeURIComponent(token)}`;

export async function createLoginLink(email, opts) {
  return loginUrl(await createLoginToken(email, opts));
}

// Eenmalig gebruik: token wordt na het inlezen verwijderd
export async function consumeLoginToken(token) {
  if (!token || token.length > 64) return null;
  const key = `portal:login:${token}`;
  const v = await getJson(key);
  if (!v) return null;
  await del(key);
  return { email: v.e, purpose: v.p };
}
