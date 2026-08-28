// pages/api/track.js — Funnel Metrics beacon-ontvanger
// Ontvangt pageview- en checkout-klik-beacons van jjb-track.js (op de funnel-domeinen)
// en telt ze atomair op in Upstash Redis:
//   fm:{datum}:{host}:{pad}:pv   = pageviews        fm:...:pvu = unieke bezoekers (per dag)
//   fm:{datum}:{host}:{pad}:cc   = checkout-kliks   fm:...:ccu = unieke checkout-klikkers
//   fmp:{datum}:{host} (set)     = paden per host   fmh:{datum} (set) = hosts per dag
// Vereist env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (gratis tier volstaat ruim).
// Zonder die env-vars antwoordt de endpoint stil met ok:false — niets breekt op de funnel.

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = "7776000"; // 90 dagen bewaren

async function redisPipeline(cmds) {
  const r = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  // CORS: de beacons komen van de funnel-domeinen (Funnelish), niet van het dashboard zelf.
  // Origin terugspiegelen i.p.v. "*": sendBeacon stuurt cookies mee en browsers weigeren
  // een wildcard bij requests met credentials.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    if (!R_URL || !R_TOK) return res.status(200).json({ ok: false, reason: "not configured" });

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const t = b?.t === "cc" ? "cc" : "pv";
    const h = String(b?.h || "").toLowerCase().replace(/[^a-z0-9.\-]/g, "").slice(0, 80);
    let p = String(b?.p || "/").split("?")[0].slice(0, 120);
    if (!h || !h.includes(".") || !p.startsWith("/")) return res.status(200).json({ ok: false });
    p = p.replace(/\/+$/, "") || "/";
    const u = b?.u ? 1 : 0;

    const d = new Date().toISOString().slice(0, 10); // UTC-dag
    const base = `fm:${d}:${h}:${p}`;
    const cmds = [
      ["INCR", `${base}:${t}`],
      ["EXPIRE", `${base}:${t}`, TTL],
      ["SADD", `fmp:${d}:${h}`, p],
      ["EXPIRE", `fmp:${d}:${h}`, TTL],
      ["SADD", `fmh:${d}`, h],
      ["EXPIRE", `fmh:${d}`, TTL],
    ];
    if (u) {
      cmds.push(["INCR", `${base}:${t}u`]);
      cmds.push(["EXPIRE", `${base}:${t}u`, TTL]);
    }
    await redisPipeline(cmds);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: false });
  }
}
