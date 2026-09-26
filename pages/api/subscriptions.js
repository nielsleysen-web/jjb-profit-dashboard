// pages/api/subscriptions.js — Membership Dashboard (Health For Life)
//
// Bronnen (allemaal live):
//   Stripe   → abonnementen + betaalde/mislukte rebill-facturen (billing_reason subscription_cycle)
//   PayPal   → abonnementen (geen list-endpoint: ids komen uit de Shopify-orders), cycli, mislukte betalingen
//   Shopify  → front-end orders (tag subscription-frontend): omzet, refunds, fees, COGS, campagne-id
//   Meta     → ad spend van de campagnes achter die orders (jjb_campaign_id) + optionele keywords
//
// GET ?range=today|yesterday|7|28|all   (dagen in Europe/Brussels)
// Env (allemaal al aanwezig): STRIPE_SECRET_KEY, PAYPAL_*, SHOPIFY_*, META_ACCESS_TOKEN, META_AD_ACCOUNT_IDS
// Optioneel: SUB_CAMPAIGN_KEYWORDS="neurodrops,membership"  (extra campagnes meetellen op naam)
//            MEMBERSHIP_REBILL_COGS="0"  (kostprijs per rebill, bv. gratis portaalproduct + verzending)

import crypto from "crypto";
import axios from "axios";
import Stripe from "stripe";
import { MEMBERSHIP } from "../../lib/checkout";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { pp, paypalConfigured } from "../../lib/paypal";

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

const TZ = "Europe/Brussels";
const PRICE = MEMBERSHIP.price / 100;
const TRIAL_MS = MEMBERSHIP.trialDays * 86400000;
const CYCLE_MS = MEMBERSHIP.intervalDays * 86400000;
const DAY = 86400000;
const REBILL_COGS = parseFloat(process.env.MEMBERSHIP_REBILL_COGS || "0") || 0;
const REBILL_FEE_PCT = 0.029, REBILL_FEE_FIXED = 0.3; // schatting Stripe/PayPal-fee per rebill
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const dayStr = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ });
const r2 = (v) => Math.round((v || 0) * 100) / 100;

/* ---------------- periode ---------------- */
function period(range) {
  const today = dayStr(Date.now());
  const shift = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  if (range === "yesterday") { const y = shift(today, -1); return { from: y, to: y }; }
  if (range === "7") return { from: shift(today, -6), to: today };
  if (range === "28") return { from: shift(today, -27), to: today };
  if (range === "all") return { from: "2026-01-01", to: today };
  return { from: today, to: today };
}
// ms-grenzen van een lokale dag (Brussel) — offset bepalen via Intl
function dayBounds(from, to) {
  const offsetMs = (s) => {
    const d = new Date(`${s}T12:00:00Z`);
    const local = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
    return local.getTime() - new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  };
  const start = Date.parse(`${from}T00:00:00Z`) - offsetMs(from);
  const end = Date.parse(`${to}T00:00:00Z`) - offsetMs(to) + DAY;
  return { start, end };
}

/* ---------------- Shopify: front-end orders ---------------- */
async function shopifyOrders() {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 12; page++) {
    const d = await shopifyGraphql(
      `query($q: String!, $after: String) {
        orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id name createdAt cancelledAt tags
            currentTotalPriceSet { shopMoney { amount } }
            currentSubtotalPriceSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            customer { email firstName lastName }
            shippingAddress { city provinceCode }
            customAttributes { key value }
            transactions(first: 5) { kind status fees { amount { amount } } }
            lineItems(first: 5) { nodes { title quantity variant { title inventoryItem { unitCost { amount } } } } }
          }
        }
      }`,
      { q: "tag:subscription-frontend", after: cursor }
    );
    out.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    cursor = d.orders.pageInfo.endCursor;
  }
  const bySub = {};
  for (const o of out) {
    const attrs = Object.fromEntries((o.customAttributes || []).map((a) => [a.key, a.value]));
    const subId = attrs.stripe_subscription || attrs.paypal_subscription;
    if (!subId) continue;
    const gross = parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || "0") || 0;
    const refunded = parseFloat(o.totalRefundedSet?.shopMoney?.amount || "0") || 0;
    let fees = 0, real = false;
    for (const t of o.transactions || []) {
      if (t.status !== "SUCCESS" || (t.kind !== "SALE" && t.kind !== "CAPTURE")) continue;
      for (const f of t.fees || []) { fees += parseFloat(f.amount.amount); real = true; }
    }
    if (!real) { const sub = parseFloat(o.currentSubtotalPriceSet?.shopMoney?.amount || "0") || 0; fees = sub > 0 ? sub * REBILL_FEE_PCT + REBILL_FEE_FIXED : 0; }
    let cogs = 0;
    for (const li of o.lineItems?.nodes || []) { const uc = li.variant?.inventoryItem?.unitCost?.amount; if (uc != null) cogs += parseFloat(uc) * li.quantity; }
    const li = (o.lineItems?.nodes || []).find((l) => /neurotone/i.test(l.title)) || o.lineItems?.nodes?.[0];
    bySub[subId] = {
      orderId: o.id.split("/").pop(), orderName: o.name, orderAt: o.createdAt, cancelledAt: o.cancelledAt,
      gross, refunded, net: gross - refunded, fees, cogs,
      bundle: li ? `${li.quantity}x ${li.title}`.replace(/™/g, "") : "",
      email: o.customer?.email || "", name: [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" "),
      city: [o.shippingAddress?.city, o.shippingAddress?.provinceCode].filter(Boolean).join(" "),
      campaignId: attrs.jjb_campaign_id || "", campaign: attrs.jjb_utm_campaign || "",
    };
  }
  return bySub;
}

/* ---------------- Stripe ---------------- */
async function stripeData() {
  if (!process.env.STRIPE_SECRET_KEY) return { members: [], rebills: [], failed: [] };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
  const statusMap = { trialing: "trial", active: "active", past_due: "problem", unpaid: "problem", incomplete: "problem", incomplete_expired: "canceled", canceled: "canceled", paused: "paused" };
  const members = [];
  let n = 0;
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] })) {
    if (++n > 5000) break;
    const c = typeof s.customer === "object" ? s.customer : {};
    members.push({
      id: s.id, provider: "stripe", status: statusMap[s.status] || s.status, rawStatus: s.status,
      startedAt: iso(s.created * 1000), trialEnd: iso((s.trial_end || s.created + MEMBERSHIP.trialDays * 86400) * 1000),
      nextBilling: s.status === "canceled" ? null : iso((s.current_period_end || 0) * 1000),
      cancelAtPeriodEnd: !!s.cancel_at_period_end, canceledAt: iso((s.canceled_at || s.ended_at || 0) * 1000),
      email: c.email || "", name: c.shipping?.name || c.name || "", cycles: 0, membershipRevenue: 0, rebillAt: [],
    });
  }
  const rebills = [], failed = [];
  n = 0;
  for await (const inv of stripe.invoices.list({ limit: 100 })) {
    if (++n > 8000) break;
    if (inv.billing_reason !== "subscription_cycle") continue;
    const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
    if (inv.status === "paid" && inv.amount_paid) rebills.push({ subId, at: iso((inv.status_transitions?.paid_at || inv.created) * 1000), amount: inv.amount_paid / 100, provider: "stripe" });
    else if (inv.attempted && (inv.status === "open" || inv.status === "uncollectible")) failed.push({ subId, at: iso(inv.created * 1000), amount: (inv.amount_due || 0) / 100, provider: "stripe" });
  }
  return { members, rebills, failed };
}

/* ---------------- PayPal ---------------- */
async function paypalData(ids) {
  if (!paypalConfigured() || !ids.length) return { members: [], rebills: [], failed: [] };
  const members = [], rebills = [], failed = [];
  const statusMap = { APPROVAL_PENDING: "problem", APPROVED: "trial", ACTIVE: "active", SUSPENDED: "problem", CANCELLED: "canceled", EXPIRED: "canceled" };
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(ids.slice(i, i + 8).map((id) => pp("get", `/v1/billing/subscriptions/${id}`).catch(() => null)));
    for (const s of batch) {
      if (!s) continue;
      const bi = s.billing_info || {};
      const regular = (bi.cycle_executions || []).find((c) => c.tenure_type === "REGULAR");
      const cycles = regular?.cycles_completed || 0;
      const start = Date.parse(s.start_time || s.create_time);
      const ended = ["CANCELLED", "EXPIRED"].includes(s.status);
      const inTrial = s.status === "ACTIVE" && cycles === 0 && Date.now() < start + TRIAL_MS;
      const last = bi.last_payment?.time ? Date.parse(bi.last_payment.time) : null;
      const rebillAt = [];
      for (let k = 0; k < cycles; k++) { const at = iso(last ? last - k * CYCLE_MS : start + TRIAL_MS + k * CYCLE_MS); rebillAt.push(at); rebills.push({ subId: s.id, at, amount: PRICE, provider: "paypal" }); }
      if (bi.last_failed_payment?.time) failed.push({ subId: s.id, at: bi.last_failed_payment.time, amount: PRICE, provider: "paypal" });
      members.push({
        id: s.id, provider: "paypal", status: inTrial ? "trial" : statusMap[s.status] || s.status.toLowerCase(), rawStatus: s.status,
        startedAt: iso(Date.parse(s.create_time)), trialEnd: iso(start + TRIAL_MS),
        nextBilling: ended ? null : bi.next_billing_time || null, cancelAtPeriodEnd: false,
        canceledAt: ended ? s.status_update_time || null : null,
        email: s.subscriber?.email_address || "", name: [s.subscriber?.name?.given_name, s.subscriber?.name?.surname].filter(Boolean).join(" "),
        cycles, membershipRevenue: cycles * PRICE, rebillAt,
      });
    }
  }
  return { members, rebills, failed };
}

/* ---------------- Meta: spend van de subscription-campagnes ---------------- */
let metaCache = { key: "", at: 0, data: null };
async function metaSpend(from, to, campaignIds, keywords) {
  const token = process.env.META_ACCESS_TOKEN;
  const key = `${from}:${to}:${campaignIds.size}:${keywords.join()}`;
  if (metaCache.data && metaCache.key === key && Date.now() - metaCache.at < 120000) return metaCache.data;
  const empty = { total: 0, daily: {}, campaigns: [], configured: !!token };
  if (!token) return empty;
  const accounts = (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const daily = {}, campaigns = {};
  let total = 0;
  await Promise.all(accounts.map(async (acc) => {
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/act_${acc}/insights`, {
        params: { access_token: token, level: "campaign", fields: "campaign_id,campaign_name,spend", time_range: JSON.stringify({ since: from, until: to }), time_increment: 1, limit: 500 }, timeout: 15000,
      });
      for (const row of r.data?.data || []) {
        const name = (row.campaign_name || "").toLowerCase();
        if (!campaignIds.has(row.campaign_id) && !keywords.some((k) => k && name.includes(k))) continue;
        const spend = parseFloat(row.spend || 0);
        total += spend; daily[row.date_start] = (daily[row.date_start] || 0) + spend;
        campaigns[row.campaign_id] = campaigns[row.campaign_id] || { id: row.campaign_id, name: row.campaign_name, spend: 0 };
        campaigns[row.campaign_id].spend += spend;
      }
    } catch (e) { console.warn("Meta spend:", e.response?.data?.error?.message || e.message); }
  }));
  const data = { total, daily, campaigns: Object.values(campaigns), configured: true };
  metaCache = { key, at: Date.now(), data };
  return data;
}

/* ---------------- cycli: in welke cyclus zit/zat een lid, en waar haakte hij af ---------------- */
// cyclus 0 = proef (dag 0–7), cyclus k = dag 7+(k−1)·28 … 7+k·28. Een lid "start" cyclus k als hij rebill k betaalde.
function cycleEnd(m, k) { return Date.parse(m.startedAt) + TRIAL_MS + k * CYCLE_MS; }
function droppedAt(m, now) {
  // index van de cyclus waarin het lid afhaakte, of null als hij nog doorloopt
  if (m.status === "canceled") return m.cycles; // opgezegd tijdens cyclus = aantal betaalde rebills
  if (m.status === "problem" && now > cycleEnd(m, m.cycles) + 3 * DAY) return m.cycles; // betaling blijft uit
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    if (!s || !(s.finance || s.admin)) return res.status(401).json({ success: false, error: "No access" });

    const range = String(req.query.range || "today");
    const { from, to } = period(range);
    const { start: pStart, end: pEnd } = dayBounds(from, to);
    const inPeriod = (t) => { const ms = typeof t === "number" ? t : Date.parse(t || 0); return ms >= pStart && ms < pEnd; };
    const now = Date.now();

    const orders = await shopifyOrders();
    const paypalIds = Object.keys(orders).filter((k) => k.startsWith("I-"));
    const campaignIds = new Set(Object.values(orders).map((o) => o.campaignId).filter(Boolean));
    const keywords = (process.env.SUB_CAMPAIGN_KEYWORDS || "").toLowerCase().split(",").map((k) => k.trim()).filter(Boolean);
    const [st, py, meta] = await Promise.all([stripeData(), paypalData(paypalIds), metaSpend(from, to, campaignIds, keywords)]);

    // Stripe-rebills aan leden hangen
    const bySub = {};
    for (const r of st.rebills) (bySub[r.subId] = bySub[r.subId] || []).push(r);
    for (const m of st.members) { const list = (bySub[m.id] || []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); m.cycles = list.length; m.membershipRevenue = list.reduce((a, r) => a + r.amount, 0); m.rebillAt = list.map((r) => r.at); }

    const members = [...st.members, ...py.members].map((m) => {
      const o = orders[m.id];
      return { ...m, email: m.email || o?.email || "", name: m.name || o?.name || "", order: o ? { name: o.orderName, id: o.orderId, at: o.orderAt, net: r2(o.net), gross: r2(o.gross), refunded: r2(o.refunded), fees: r2(o.fees), cogs: r2(o.cogs), bundle: o.bundle, city: o.city, campaign: o.campaign } : null };
    }).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const rebills = [...st.rebills, ...py.rebills];
    const failed = [...st.failed, ...py.failed];

    /* ---- periode-cijfers ---- */
    const newMembers = members.filter((m) => inPeriod(m.startedAt));
    const feOrders = newMembers.filter((m) => m.order);
    const feRevenue = feOrders.reduce((a, m) => a + m.order.net, 0);
    const feCogs = feOrders.reduce((a, m) => a + m.order.cogs, 0);
    const feFees = feOrders.reduce((a, m) => a + m.order.fees, 0);
    const pRebills = rebills.filter((r) => inPeriod(r.at));
    const rebillRevenue = pRebills.reduce((a, r) => a + r.amount, 0);
    const rebillCogs = pRebills.length * REBILL_COGS;
    const rebillFees = pRebills.reduce((a, r) => a + r.amount * REBILL_FEE_PCT + REBILL_FEE_FIXED, 0);
    const spend = meta.total;
    const netProfit = feRevenue + rebillRevenue - feCogs - rebillCogs - feFees - rebillFees - spend;
    const pFailed = failed.filter((f) => inPeriod(f.at));
    const attempts = pRebills.length + pFailed.length;
    const pCancel = members.filter((m) => m.canceledAt && inPeriod(m.canceledAt));

    // retentie cyclus 1 (alle leden met verstreken proef) → gebruikt voor projecties
    const trialsEnded = members.filter((m) => Date.parse(m.trialEnd) <= now);
    const ret1 = trialsEnded.length ? trialsEnded.filter((m) => m.cycles >= 1).length / trialsEnded.length : null;

    // Dag 7 / Dag 28 LTV van de in de periode geworven klanten: gerealiseerd waar de dag al voorbij is, anders projectie
    function ltv(days) {
      if (!newMembers.length) return { value: null, projected: false };
      let sum = 0, projected = false;
      for (const m of newMembers) {
        const startMs = Date.parse(m.startedAt), cutoff = startMs + days * DAY;
        sum += m.order?.net || 0;
        if (now >= cutoff) sum += m.rebillAt.filter((t) => Date.parse(t) <= cutoff).reduce((a) => a + PRICE, 0);
        else if (ret1 != null && days >= MEMBERSHIP.trialDays && m.status !== "canceled") { sum += ret1 * PRICE; projected = true; }
      }
      return { value: sum / newMembers.length, projected };
    }
    const ltv7 = ltv(7), ltv28 = ltv(28);
    const cac = newMembers.length ? spend / newMembers.length : null;
    const costPerCustomer = newMembers.length ? (feCogs + feFees) / newMembers.length + (cac || 0) : null;
    const rebill7 = (() => { // rebills binnen 7 dagen na acquisitie voor de nieuwe leden (gerealiseerd + projectie)
      let sum = 0, projected = false;
      for (const m of newMembers) {
        const startMs = Date.parse(m.startedAt), cutoff = startMs + 7 * DAY + 12 * 3600000; // marge: rebill valt op dag 7
        if (now >= cutoff) sum += m.rebillAt.filter((t) => Date.parse(t) <= cutoff).length * PRICE;
        else if (ret1 != null && m.status !== "canceled") { sum += ret1 * PRICE; projected = true; }
      }
      return { sum, projected };
    })();
    const roas = spend > 0 ? (feRevenue + rebill7.sum) / spend : null;

    /* ---- stand van nu ---- */
    const count = (x) => members.filter((m) => m.status === x).length;
    const trial = count("trial"), active = count("active"), canceled = count("canceled"), problem = count("problem");

    /* ---- drop-off per cyclus (alle leden) ---- */
    const maxCycle = Math.max(1, ...members.map((m) => m.cycles + 1));
    const cyclesOut = [];
    for (let k = 0; k <= Math.min(maxCycle, 12); k++) {
      const started = members.filter((m) => m.cycles >= k);
      const ended = started.filter((m) => now >= cycleEnd(m, k) || droppedAt(m, now) === k);
      const dropped = ended.filter((m) => m.cycles < k + 1);
      cyclesOut.push({ k, label: k === 0 ? `Proef (dag 0–${MEMBERSHIP.trialDays})` : `Cyclus ${k} (dag ${MEMBERSHIP.trialDays + (k - 1) * MEMBERSHIP.intervalDays}–${MEMBERSHIP.trialDays + k * MEMBERSHIP.intervalDays})`,
        started: started.length, ended: ended.length, dropped: dropped.length, dropRate: ended.length ? dropped.length / ended.length : null,
        continued: members.filter((m) => m.cycles >= k + 1).length, pending: started.length - ended.length });
      if (started.length === 0) break;
    }

    /* ---- cohorten (week / maand) ---- */
    const weekKey = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
    const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
    function cohorts(keyFn) {
      const g = {};
      for (const m of members) (g[keyFn(m.startedAt)] = g[keyFn(m.startedAt)] || []).push(m);
      return Object.keys(g).sort().reverse().map((key) => {
        const list = g[key];
        const cells = [];
        for (let k = 0; k <= 6; k++) {
          const allEnded = list.every((m) => now >= cycleEnd(m, k) || droppedAt(m, now) != null);
          if (!allEnded) { cells.push(null); continue; }
          const left = list.filter((m) => m.cycles >= k + 1).length;
          const prev = k === 0 ? list.length : list.filter((m) => m.cycles >= k).length;
          cells.push({ dropped: prev - left, left, rate: list.length ? (prev - left) / list.length : 0 });
        }
        return { key, size: list.length, cells };
      });
    }

    /* ---- dagreeks voor de periode ---- */
    const days = {};
    for (let ms = pStart; ms < pEnd; ms += DAY) { const d = dayStr(ms); days[d] = { d, new: 0, rebills: 0, rebillAmount: 0, canceled: 0, failed: 0, spend: r2(meta.daily[d] || 0) }; }
    for (const m of newMembers) { const d = dayStr(Date.parse(m.startedAt)); if (days[d]) days[d].new++; }
    for (const r of pRebills) { const d = dayStr(Date.parse(r.at)); if (days[d]) { days[d].rebills++; days[d].rebillAmount += r.amount; } }
    for (const m of pCancel) { const d = dayStr(Date.parse(m.canceledAt)); if (days[d]) days[d].canceled++; }
    for (const f of pFailed) { const d = dayStr(Date.parse(f.at)); if (days[d]) days[d].failed++; }

    const kpis = {
      netProfit: r2(netProfit),
      orders: { count: feOrders.length + pRebills.length, amount: r2(feRevenue + rebillRevenue), frontEnd: feOrders.length, rebills: pRebills.length },
      rebillRevenue: { period: r2(rebillRevenue), total: r2(rebills.reduce((a, r) => a + r.amount, 0)), count: pRebills.length, totalCount: rebills.length },
      cogs: { frontEnd: r2(feCogs), rebills: r2(rebillCogs), rebillCogsEach: REBILL_COGS },
      fees: r2(feFees + rebillFees),
      spend: r2(spend), spendConfigured: meta.configured, campaigns: meta.campaigns,
      cac: cac == null ? null : r2(cac), newMembers: newMembers.length,
      roas: roas == null ? null : r2(roas), roasProjected: rebill7.projected, roasRebill7: r2(rebill7.sum),
      ltv7: ltv7.value == null ? null : r2(ltv7.value), ltv7Projected: ltv7.projected,
      ltv28: ltv28.value == null ? null : r2(ltv28.value), ltv28Projected: ltv28.projected,
      profit7: ltv7.value == null || costPerCustomer == null ? null : r2(ltv7.value - costPerCustomer),
      profit28: ltv28.value == null || costPerCustomer == null ? null : r2(ltv28.value - costPerCustomer),
      retention1: ret1 == null ? null : r2(ret1),
      churn: members.length ? r2(canceled / members.length) : null, canceledTotal: canceled, started: members.length,
      failed: { count: pFailed.length, amount: r2(pFailed.reduce((a, f) => a + f.amount, 0)), attempts, rate: attempts ? r2(pFailed.length / attempts) : null },
      cancellations: { period: pCancel.length, total: canceled, pending: members.filter((m) => m.cancelAtPeriodEnd && m.status !== "canceled").length },
      activeSubscribers: trial + active, trial, active, problem,
      mrr: r2(active * PRICE * (30 / MEMBERSHIP.intervalDays)), recurring28d: r2(active * PRICE),
    };

    const storeHandle = (process.env.SHOPIFY_STORE_URL || "").replace(".myshopify.com", "");
    return res.status(200).json({ success: true, range, from, to, price: PRICE, storeHandle, kpis, series: Object.values(days), cycles: cyclesOut, cohortsWeek: cohorts(weekKey), cohortsMonth: cohorts(monthKey), members, generatedAt: iso(now) });
  } catch (e) {
    console.error("subscriptions:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
