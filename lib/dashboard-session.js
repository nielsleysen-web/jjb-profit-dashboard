// lib/dashboard-session.js — Sessie van het Operations Centre lezen (HMAC-getekende cookie jjb_session).
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
export const CS_ROLE = "Membership CS Rep";

export function getDashboardSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const tok = match ? match[1] : null;
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  if (crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url") !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

// Toegang tot alles onder "Membership": admin, finance of de rol Membership CS Rep
export const canMembership = (s) => !!s && (s.admin || s.finance || (Array.isArray(s.roles) && s.roles.includes(CS_ROLE)));
