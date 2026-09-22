// pages/api/clientlog.js
// Fouten uit de browser van de checkout (Stripe geblokkeerd, betaalfout, JS-fout) → Vercel-logs.
// Zo zie je in Vercel → Logs wie probeerde te betalen maar vastliep. Geen opslag.

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    console.error("[clientlog] " + JSON.stringify({
      kind: String(b.kind || "error").slice(0, 40),
      msg: String(b.msg || "").slice(0, 500),
      src: String(b.src || "").slice(0, 300),
      href: String(b.href || "").slice(0, 300),
      ua: String(req.headers["user-agent"] || "").slice(0, 200),
    }));
  } catch (e) {}
  return res.status(204).end();
}
