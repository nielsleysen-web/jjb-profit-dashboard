// pages/api/checkout-visit.js — telt bezoeken aan de checkout-pagina's
// POST (vanaf checkout.js bij het laden van de checkout): { p: product, src: host van de salespagina, u: 1 = eerste bezoek vandaag }
// Land komt van Vercel (x-vercel-ip-country). Dag = kalenderdag in Miami/New York (America/New_York).
// Redis (Upstash): cv:{dag} (hash)  veld "{product}|{land}|{bron}" = paginaweergaven
//                  cvu:{dag} (hash) zelfde veld                  = unieke bezoekers (per browser per dag)

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = "34560000"; // 400 dagen

export const etDay = (ms = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    if (!R_URL || !R_TOK) return res.status(200).json({ ok: false });
    const ua = String(req.headers["user-agent"] || "");
    if (!ua || /bot|crawl|spider|preview|headless|lighthouse|facebookexternalhit|monitor|curl|python|node-fetch/i.test(ua)) return res.status(200).json({ ok: false });

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const p = String(b?.p || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "unknown";
    const src = String(b?.src || "").toLowerCase().replace(/[^a-z0-9.\-]/g, "").slice(0, 60) || "direct";
    const c = String(req.headers["x-vercel-ip-country"] || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "??";
    const d = etDay();
    const f = `${p}|${c}|${src}`;
    const cmds = [["HINCRBY", `cv:${d}`, f, 1], ["EXPIRE", `cv:${d}`, TTL]];
    if (b?.u) cmds.push(["HINCRBY", `cvu:${d}`, f, 1], ["EXPIRE", `cvu:${d}`, TTL]);
    const r = await fetch(`${R_URL}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
    return res.status(200).json({ ok: r.ok });
  } catch {
    return res.status(200).json({ ok: false });
  }
}
