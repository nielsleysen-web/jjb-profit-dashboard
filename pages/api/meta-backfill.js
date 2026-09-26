// pages/api/meta-backfill.js — eenmalig: membership-orders van de laatste 7 dagen alsnog als
// Purchase naar Meta CAPI sturen (Meta accepteert events tot 7 dagen terug).
//
// Gebruik (ingelogd als admin/finance in het dashboard):
//   GET /api/meta-backfill            → droog: toont welke orders verstuurd zouden worden
//   GET /api/meta-backfill?run=1      → verstuurt ze echt (elke order maximaal één keer; bijgehouden in Redis)
//   optioneel &days=5                 → andere periode (max 7)
//
// Overgeslagen: geannuleerde en volledig terugbetaalde orders (testorders), en orders die al verstuurd zijn.

import crypto from "crypto";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { sendPurchase, capiConfigured, META_CONTENT_ID } from "../../lib/meta-capi";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const tok = match ? match[1] : null;
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  if (crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url") !== sig) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp && p.exp > Date.now() ? p : null; } catch { return null; }
}

const R_URL = process.env.UPSTASH_REDIS_REST_URL, R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
const SENT_KEY = "meta:backfill:sent";
async function redis(cmd) {
  if (!R_URL || !R_TOK) return null;
  const r = await fetch(R_URL, { method: "POST", headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  return (await r.json()).result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    if (!s || !(s.finance || s.admin)) return res.status(401).json({ success: false, error: "No access" });
    if (!capiConfigured()) return res.status(400).json({ success: false, error: "META_PIXEL_ID / META_CAPI_TOKEN ontbreekt" });

    const run = req.query.run === "1";
    const days = Math.min(7, Math.max(1, parseInt(req.query.days || "7", 10) || 7));
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const d = await shopifyGraphql(
      `query($q: String!) {
        orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name createdAt cancelledAt email phone clientIp tags
            currentTotalPriceSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            billingAddress { firstName lastName city zip provinceCode countryCode }
            shippingAddress { firstName lastName city zip provinceCode countryCode }
            customAttributes { key value }
            lineItems(first: 3) { nodes { title quantity } }
          }
        }
      }`,
      { q: `tag:subscription-frontend AND created_at:>='${since}'` }
    );

    const alreadySent = new Set((await redis(["SMEMBERS", SENT_KEY])) || []);
    const plan = [], skipped = [];
    for (const o of d.orders.nodes) {
      const total = parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || "0") || 0;
      const refunded = parseFloat(o.totalRefundedSet?.shopMoney?.amount || "0") || 0;
      if (o.cancelledAt) { skipped.push(`${o.name}: geannuleerd`); continue; }
      if (total > 0 && refunded >= total) { skipped.push(`${o.name}: volledig terugbetaald`); continue; }
      if (alreadySent.has(o.name)) { skipped.push(`${o.name}: al verstuurd`); continue; }
      const attrs = Object.fromEntries((o.customAttributes || []).map((a) => [a.key, a.value]));
      const addr = o.billingAddress || o.shippingAddress || {};
      const li = (o.lineItems?.nodes || []).find((l) => /neurotone/i.test(l.title)) || o.lineItems?.nodes?.[0];
      plan.push({
        orderName: o.name, createdAt: o.createdAt, value: total - refunded, currency: "EUR", provider: attrs.paypal_subscription ? "paypal" : "stripe",
        email: o.email, phone: o.phone, firstName: addr.firstName, lastName: addr.lastName, city: addr.city, zip: addr.zip, state: addr.provinceCode, country: addr.countryCode || "IT",
        clientIp: o.clientIp || undefined, fbc: attrs.jjb_fbc, fbp: attrs.jjb_fbp, vid: attrs.jjb_vid,
        contents: [{ id: META_CONTENT_ID, quantity: li?.quantity || 1 }],
      });
    }

    if (!run) {
      return res.status(200).json({ success: true, dryRun: true, since, toSend: plan.map((p) => ({ order: p.orderName, at: p.createdAt, value: p.value, provider: p.provider, hasFbc: !!p.fbc, hasFbp: !!p.fbp, email: p.email ? "✓" : "—" })), skipped, hint: "Voeg ?run=1 toe om te versturen" });
    }

    const sent = [], errors = [];
    for (const p of plan) {
      const r = await sendPurchase(p);
      if (r.sent) { sent.push(p.orderName); await redis(["SADD", SENT_KEY, p.orderName]); }
      else errors.push(`${p.orderName}: ${r.error || "niet verstuurd"}`);
    }
    return res.status(200).json({ success: true, since, sent, errors, skipped });
  } catch (e) {
    console.error("meta-backfill:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
