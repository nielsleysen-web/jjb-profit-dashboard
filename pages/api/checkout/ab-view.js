// pages/api/checkout/ab-view.js — A/B-test checkout NeuroTone: één paginaweergave per variant (per sessie, zie checkout.js abView()).
// POST { v: "a" | "b" | "c" } → Redis: abck:views:<v> (totaal) + abck:views:<datum>:<v> (per dag, Europe/Rome) + abck:start (eerste weergave).
// Antwoordt altijd 200; een fout mag de checkout nooit hinderen.
import { redis, storeConfigured } from "../../../lib/portal-store";

const day = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const body = req.body || {};
  // A/B-test order bump (UrinaPatches): { bump: "a"|"b" } → abbump:views:* (zie /api/ab-bump)
  const bv = String(body.bump || "");
  if (["a", "b"].includes(bv) && storeConfigured()) {
    try {
      await redis(["INCR", `abbump:views:${bv}`]);
      const k = `abbump:views:${day()}:${bv}`;
      if ((await redis(["INCR", k])) === 1) await redis(["EXPIRE", k, String(120 * 86400)]);
      await redis(["SET", "abbump:start", new Date().toISOString(), "NX"]);
    } catch (e) { console.warn("ab-view bump:", e.message); }
    return res.status(200).json({ ok: true });
  }
  const v = String(body.v || "");
  if (!["a", "b", "c"].includes(v) || !storeConfigured()) return res.status(200).json({ ok: false });
  try {
    await redis(["INCR", `abck:views:${v}`]);
    const k = `abck:views:${day()}:${v}`;
    if ((await redis(["INCR", k])) === 1) await redis(["EXPIRE", k, String(120 * 86400)]);
    await redis(["SET", v === "c" ? "abck:start:c" : "abck:start", new Date().toISOString(), "NX"]); // C (offers op de checkout) heeft een eigen startdatum
  } catch (e) { console.warn("ab-view:", e.message); }
  return res.status(200).json({ ok: true });
}
