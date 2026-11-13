// pages/api/checkout-visits.js — leest de checkout-bezoeken (zie checkout-visit.js)
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → { rows: [{ day, product, country, source, views, visitors }], today }
// Dagen zijn kalenderdagen in Miami/New York.

import crypto from "crypto";
import { etDay } from "./checkout-visit";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;

function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;
  if (!sessionToken) return null;
  const [body, sig] = sessionToken.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = getSession(req);
    const roles = Array.isArray(session?.roles) ? session.roles : [];
    if (!session || !(session.finance || session.admin || roles.includes("Funnel Builder"))) return res.status(401).json({ success: false, error: "No access" });
    if (req.method !== "GET") return res.status(405).json({ success: false });
    const today = etDay();
    if (!R_URL || !R_TOK) return res.status(200).json({ success: true, configured: false, rows: [], today });

    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
    let from = isDate(req.query.from) ? req.query.from : today;
    let to = isDate(req.query.to) ? req.query.to : today;
    if (from > to) { const t = from; from = to; to = t; }
    const days = [];
    for (let ms = Date.parse(`${to}T12:00:00Z`); ms >= Date.parse(`${from}T12:00:00Z`) && days.length < 120; ms -= 86400000) days.push(new Date(ms).toISOString().slice(0, 10));

    const cmds = days.flatMap((d) => [["HGETALL", `cv:${d}`], ["HGETALL", `cvu:${d}`]]);
    const r = await fetch(`${R_URL}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    const out = await r.json();
    const toObj = (a) => { const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = Number(a[i + 1]) || 0; else if (a && typeof a === "object") for (const k of Object.keys(a)) o[k] = Number(a[k]) || 0; return o; };
    const rows = [];
    days.forEach((day, i) => {
      const v = toObj(out[i * 2]?.result), u = toObj(out[i * 2 + 1]?.result);
      for (const f of Object.keys(v)) {
        const [product, country, source] = f.split("|");
        rows.push({ day, product, country, source: source || "direct", views: v[f], visitors: u[f] || 0 });
      }
    });
    return res.status(200).json({ success: true, configured: true, rows, today, from, to });
  } catch (e) {
    return res.status(500).json({ success: false, error: String(e.message || e) });
  }
}
