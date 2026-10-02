// pages/api/checkout/sweep.js — Vercel-cron (elke 10 min, zie vercel.json). Drie vangnetten:
//   1. mail 1 ("Started Membership") alsnog versturen voor wie de upsellpagina sloot zonder te kiezen (> 30 min)
//   2. betaalde upsells uit de Redis-wachtrij alsnog op hun Shopify-order zetten
//   3. Stripe afspeuren naar geslaagde upsell-betalingen (7 dagen) die nog niet op een order staan
// Beveiligd met CRON_SECRET (Authorization: Bearer …); zonder CRON_SECRET alleen voor de Vercel-cron zelf.
import { flushHeld } from "../../../lib/upsell-gate";
import { retryQueuedUpsells, sweepStripeUpsells } from "../../../lib/upsell-queue";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const fromVercelCron = /^vercel-cron\//i.test(req.headers["user-agent"] || "");
  const ok = secret ? auth === `Bearer ${secret}` : fromVercelCron;
  if (!ok) return res.status(401).json({ ok: false });
  const out = { ok: true };
  try { out.mail1 = await flushHeld(); } catch (e) { out.mail1 = { error: e.message }; console.error("sweep mail1:", e.message); }
  try { out.upsellQueue = await retryQueuedUpsells(); } catch (e) { out.upsellQueue = { error: e.message }; console.error("sweep queue:", e.message); }
  try { out.stripeUpsells = await sweepStripeUpsells(); } catch (e) { out.stripeUpsells = { error: e.message }; console.error("sweep stripe:", e.message); }
  const did = [...(out.upsellQueue?.done || []), ...(out.stripeUpsells?.done || []), ...(out.mail1?.sent || [])];
  if (did.length) console.log("sweep:", JSON.stringify(out));
  return res.status(200).json(out);
}
