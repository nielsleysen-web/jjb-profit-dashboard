// pages/api/portal/backfill.js — eenmalig/onderhoud: bestaande leden (Shopify-orders met tag
// subscription-frontend) als portaal-lid registreren. Alleen voor admin/finance van het dashboard.
//
//   GET /api/portal/backfill                 → droog: wie zou toegevoegd worden
//   GET /api/portal/backfill?run=1           → leden aanmaken (bestaande records worden niet overschreven)
//   GET /api/portal/backfill?link=<email>    → nieuwe welkomstlink (30 dagen) voor één lid, om te testen
//                                              of om handmatig door te sturen; &reset=1 → nieuw wachtwoord kiezen
//   GET /api/portal/backfill?test=<email>    → testlid aanmaken (of bijwerken) met dat e-mailadres + welkomstlink;
//                                              optioneel &name=Voornaam. Gemarkeerd met test:true.
//
// Geannuleerde/terugbetaalde orders (testorders) worden overgeslagen.

import crypto from "crypto";
import { shopifyGraphql } from "../../../lib/shopify-admin";
import { getMember, upsertMember, listMemberEmails } from "../../../lib/portal-members";
import { createLoginLink, normEmail } from "../../../lib/portal-auth";
import { storeConfigured } from "../../../lib/portal-store";

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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    if (!s || !(s.finance || s.admin)) return res.status(401).json({ success: false, error: "No access" });
    if (!storeConfigured()) return res.status(400).json({ success: false, error: "UPSTASH_REDIS_REST_URL / _TOKEN ontbreekt" });

    if (req.query.ping) {
      // Diagnose: elk Redis-commando dat het portaal gebruikt één keer uitvoeren
      const out = {};
      const { redis } = await import("../../../lib/portal-store");
      for (const [name, cmd] of [
        ["set", ["SET", "portal:ping", "1"]],
        ["set_ex", ["SET", "portal:ping:ex", "1", "EX", "60"]],
        ["get", ["GET", "portal:ping"]],
        ["del", ["DEL", "portal:ping"]],
        ["incr", ["INCR", "portal:ping:n"]],
        ["expire", ["EXPIRE", "portal:ping:n", "60"]],
        ["sadd", ["SADD", "portal:ping:set", "a"]],
        ["smembers", ["SMEMBERS", "portal:ping:set"]],
        ["del2", ["DEL", "portal:ping:set"]],
      ]) {
        try { out[name] = { ok: true, result: await redis(cmd) }; } catch (e) { out[name] = { ok: false, error: e.message }; }
      }
      return res.status(200).json({ success: true, ping: out });
    }

    if (req.query.test) {
      const email = normEmail(req.query.test);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, error: "Ongeldig e-mailadres" });
      const now = new Date();
      await upsertMember({
        email, firstName: String(req.query.name || "Test"), lastName: "Account", test: true,
        address: { address1: "Via Roma 12", city: "Milano", zip: "20121", province: "MI", country: "IT" },
        provider: "stripe", status: "trialing", startedAt: now.toISOString(),
        trialEnds: new Date(now.getTime() + 7 * 86400000).toISOString(), nextChargeAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
        lastPaymentAt: now.toISOString(), lastPaymentAmount: 53.9, shopifyOrder: "#TEST", bundle: 3,
      });
      const url = await createLoginLink(email, { purpose: "welcome", ttlSec: 30 * 86400 });
      return res.status(200).json({ success: true, test: true, email, loginUrl: url, validDays: 30 });
    }

    if (req.query.link) {
      const email = normEmail(req.query.link);
      const m = await getMember(email);
      if (!m) return res.status(404).json({ success: false, error: `Geen lid met e-mail ${email}` });
      // &reset=1 → de link opent het scherm "Choose a new password" (wachtwoord vergeten)
      const purpose = req.query.reset === "1" ? "reset" : "welcome";
      const url = await createLoginLink(email, { purpose, ttlSec: 30 * 86400 });
      return res.status(200).json({ success: true, email, firstName: m.firstName, purpose, loginUrl: url, validDays: 30 });
    }

    const run = req.query.run === "1";
    const d = await shopifyGraphql(
      `query($q: String!) {
        orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name createdAt cancelledAt email phone
            currentTotalPriceSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            shippingAddress { firstName lastName address1 city zip provinceCode countryCode phone }
            customAttributes { key value }
            lineItems(first: 3) { nodes { title quantity } }
          }
        }
      }`,
      { q: "tag:subscription-frontend" }
    );

    const existing = new Set(await listMemberEmails());
    const plan = [], skipped = [];
    const seen = new Set();
    for (const o of d.orders.nodes) {
      const email = normEmail(o.email);
      const total = parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || "0") || 0;
      const refunded = parseFloat(o.totalRefundedSet?.shopMoney?.amount || "0") || 0;
      if (!email) { skipped.push(`${o.name}: geen e-mail`); continue; }
      if (o.cancelledAt) { skipped.push(`${o.name}: geannuleerd`); continue; }
      if (total > 0 && refunded >= total) { skipped.push(`${o.name}: volledig terugbetaald`); continue; }
      if (seen.has(email)) { skipped.push(`${o.name}: ${email} al in deze lijst`); continue; }
      seen.add(email);
      if (existing.has(email)) { skipped.push(`${o.name}: ${email} bestaat al als lid`); continue; }
      const attrs = Object.fromEntries((o.customAttributes || []).map((a) => [a.key, a.value]));
      const a = o.shippingAddress || {};
      const startedAt = new Date(o.createdAt);
      const trialEnds = new Date(startedAt.getTime() + 7 * 86400000);
      const qty = (o.lineItems?.nodes || []).find((l) => /neurotone/i.test(l.title))?.quantity || 1;
      plan.push({
        email, firstName: a.firstName || "", lastName: a.lastName || "", phone: a.phone || o.phone || undefined,
        address: { address1: a.address1, city: a.city, zip: a.zip, province: a.provinceCode, country: a.countryCode || "IT" },
        provider: attrs.paypal_subscription ? "paypal" : "stripe",
        subscriptionId: attrs.paypal_subscription || attrs.stripe_subscription || undefined,
        status: trialEnds > new Date() ? "trialing" : "active",
        startedAt: startedAt.toISOString(), trialEnds: trialEnds.toISOString(), nextChargeAt: trialEnds.toISOString(),
        lastPaymentAt: startedAt.toISOString(), lastPaymentAmount: total, shopifyOrder: o.name, bundle: qty,
      });
    }

    if (!run) {
      return res.status(200).json({ success: true, dryRun: true, existingMembers: existing.size,
        toAdd: plan.map((p) => ({ email: p.email, name: `${p.firstName} ${p.lastName}`.trim(), provider: p.provider, order: p.shopifyOrder, since: p.startedAt.slice(0, 10) })),
        skipped, hint: "Voeg ?run=1 toe om ze aan te maken" });
    }
    const added = [];
    for (const p of plan) { await upsertMember(p); added.push(p.email); }
    return res.status(200).json({ success: true, added, skipped, totalMembers: existing.size + added.length });
  } catch (e) {
    console.error("portal backfill:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
