// pages/api/members.js — Ledenoverzicht voor het dashboard (Finance/Admin).
//
// GET /api/members            → { success, members: [...], summary, generatedAt }
// GET /api/members?email=…    → { success, member, log }   (detail + tijdlijn)
//
// Bronnen: ledenrecords in Redis (portal) · live abonnementen uit /api/subscriptions (Stripe + PayPal) ·
// Shopify-orders met tag portal-order (gratis producten) en upsell-1plus1.
import crypto from "crypto";
import { listMemberEmails, getMember } from "../../lib/portal-members";
import { getLog } from "../../lib/portal-activity";
import { getRegift, regiftView } from "../../lib/portal-regift";
import { redis, getJson, storeConfigured } from "../../lib/portal-store";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { normEmail } from "../../lib/portal-auth";
import { BUNDLES, MEMBERSHIP } from "../../lib/checkout";

export const config = { maxDuration: 60 };
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const DAY = 86400000;

function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const tok = match ? match[1] : null;
  if (!tok) return null;
  const [body, sig] = tok.split(".");
  if (!body || !sig) return null;
  if (crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url") !== sig) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp && p.exp > Date.now() ? p : null; } catch { return null; }
}

// Live abonnementenlijst van de Membership-pagina (zelfde deployment, cookie doorgeven)
async function liveSubscriptions(req) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const r = await fetch(`${proto}://${host}/api/subscriptions?range=all`, { headers: { cookie: req.headers.cookie || "" } });
    const d = await r.json();
    const by = {};
    for (const m of d.members || []) { const e = normEmail(m.email); if (e && !by[e]) by[e] = m; }
    return by;
  } catch (e) { console.warn("members: live subs:", e.message); return {}; }
}

// Shopify: portaalorders (gratis producten) en upsells, gegroepeerd per e-mail
async function shopifyActivity() {
  const out = { claims: {}, upsell: {} };
  try {
    const q = async (query) => {
      const d = await shopifyGraphql(
        `query($q: String!) { orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { name email createdAt totalPriceSet { shopMoney { amount } } customAttributes { key value } } } }`,
        { q: query }
      );
      return d.orders.nodes;
    };
    for (const o of await q("tag:portal-order")) {
      const e = normEmail(o.email); if (!e) continue;
      const slug = (o.customAttributes || []).find((a) => a.key === "portal_product")?.value || "";
      const c = (out.claims[e] ||= { count: 0, last: null, slugs: [], fees: 0 });
      c.count++; c.slugs.push(slug); c.fees += parseFloat(o.totalPriceSet?.shopMoney?.amount || "0");
      if (!c.last || o.createdAt > c.last) c.last = o.createdAt;
    }
    for (const o of await q("tag:upsell-1plus1")) {
      const e = normEmail(o.email); if (!e) continue;
      out.upsell[e] = { order: o.name, at: o.createdAt };
    }
  } catch (e) { console.warn("members: shopify:", e.message); }
  return out;
}

function tenure(m, now) {
  const start = Date.parse(m.startedAt || m.createdAt || 0) || now;
  const days = Math.max(0, Math.floor((now - start) / DAY));
  const cycle = days < MEMBERSHIP.trialDays ? 0 : 1 + Math.floor((days - MEMBERSHIP.trialDays) / MEMBERSHIP.intervalDays);
  return { startedAt: new Date(start).toISOString(), days, cycle };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getSession(req);
  if (!s || !(s.admin || s.finance)) return res.status(401).json({ success: false, error: "No access" });
  if (!storeConfigured()) return res.status(500).json({ success: false, error: "Portal store not configured" });
  const now = Date.now();

  try {
    // ---- detail ----
    if (req.query.email) {
      const email = normEmail(req.query.email);
      const m = await getMember(email);
      if (!m) return res.status(404).json({ success: false, error: "Not found" });
      const { password, ...rest } = m;
      const [log, lib, gift, regift] = await Promise.all([
        getLog(email), redis(["SMEMBERS", `portal:lib:${email}`]).catch(() => []), getJson(`portal:gift:${email}`).catch(() => null), getRegift(email).catch(() => null),
      ]);
      return res.status(200).json({ success: true, member: { ...rest, hasPassword: !!password?.hash, ebooks: lib || [], giftClaimedAt: gift?.claimedAt || null, regift: regift || null }, log: log.sort((a, b) => (a.at < b.at ? 1 : -1)) });
    }

    // ---- lijst ----
    const emails = (await listMemberEmails()).map(normEmail).filter(Boolean);
    const [live, shop] = await Promise.all([liveSubscriptions(req), shopifyActivity()]);
    const members = [];
    for (let i = 0; i < emails.length; i += 20) {
      const chunk = emails.slice(i, i + 20);
      const recs = await Promise.all(chunk.map(async (e) => {
        const [m, lib, gift, regift] = await Promise.all([
          getMember(e), redis(["SMEMBERS", `portal:lib:${e}`]).catch(() => []), getJson(`portal:gift:${e}`).catch(() => null), getRegift(e).catch(() => null),
        ]);
        return { e, m, lib: lib || [], gift, regift };
      }));
      for (const { e, m, lib, gift, regift } of recs) {
        if (!m) continue;
        const L = live[e];
        const t = tenure(m, now);
        const claims = shop.claims[e];
        const rg = regiftView(regift);
        const status = L?.status || ({ trialing: "trial", active: "active", cancelled: "canceled", past_due: "problem" }[m.status] || m.status || "trial");
        const trialEnd = L?.trialEnd || m.trialEnds || new Date(Date.parse(t.startedAt) + MEMBERSHIP.trialDays * DAY).toISOString();
        members.push({
          email: e, name: [m.firstName, m.lastName].filter(Boolean).join(" "), provider: L?.provider || m.provider || "",
          bundle: m.bundle || null, bundleLabel: BUNDLES[m.bundle]?.label || "", firstOrder: m.shopifyOrder || "",
          startedAt: t.startedAt, days: t.days, cycle: t.cycle, trialEnd, nextBilling: L?.nextBilling || m.nextChargeAt || null,
          status, cancelAtPeriodEnd: !!L?.cancelAtPeriodEnd, canceledAt: L?.canceledAt || m.cancelledAt || null, reactivatedAt: m.reactivatedAt || null,
          rebills: L?.cycles ?? m.rebills ?? 0, membershipRevenue: L?.membershipRevenue ?? m.totalPaid ?? 0, firstAmount: m.lastPaymentAmount && !m.rebills ? m.lastPaymentAmount : null,
          welcomeOpenedAt: m.welcomeOpenedAt || null, hasPassword: !!m.password?.hash, passwordSetAt: m.passwordSetAt || null,
          firstLoginAt: m.firstLoginAt || null, lastLoginAt: m.lastLoginAt || null, loginCount: m.loginCount || 0, lastSeenAt: m.lastSeenAt || null,
          claims: claims?.count || 0, claimSlugs: claims?.slugs || [], lastClaimAt: claims?.last || null, claimFees: claims?.fees || 0,
          ebooks: lib.length, giftClaimed: !!gift?.claimedAt, upsell: shop.upsell[e] || null,
          regift: rg ? { ebookLeft: rg.ebookLeft, credit: rg.credit } : regift ? { used: true } : null,
        });
      }
    }
    members.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    const inTrial = members.filter((m) => m.status === "trial");
    const summary = {
      total: members.length,
      neverLoggedIn: members.filter((m) => !m.firstLoginAt).length,
      loggedInNoClaim: members.filter((m) => m.firstLoginAt && m.claims === 0).length,
      trialEndingNoLogin: inTrial.filter((m) => !m.firstLoginAt && m.trialEnd && Date.parse(m.trialEnd) - now < 2 * DAY).length,
      active: members.filter((m) => m.status === "active").length,
      trial: inTrial.length,
      canceled: members.filter((m) => m.status === "canceled").length,
      problem: members.filter((m) => m.status === "problem").length,
      withClaim: members.filter((m) => m.claims > 0).length,
      withEbook: members.filter((m) => m.ebooks > 0).length,
      withUpsell: members.filter((m) => !!m.upsell).length,
      liveSource: Object.keys(live).length > 0,
    };
    return res.status(200).json({ success: true, members, summary, generatedAt: new Date(now).toISOString() });
  } catch (e) {
    console.error("members:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
