// pages/api/subscriptions.js — Membership Dashboard (Health For Life)
//
// Bronnen (allemaal live):
//   Stripe   → abonnementen + betaalde/mislukte rebill-facturen (billing_reason subscription_cycle)
//   PayPal   → abonnementen (geen list-endpoint: ids komen uit de Shopify-orders), cycli, mislukte betalingen
//   Shopify  → front-end orders (tag subscription-frontend): omzet, refunds, fees, COGS, campagne-id
//   Meta     → ad spend van de campagnes achter die orders (jjb_campaign_id) + optionele keywords
//
// GET ?range=today|yesterday|7|28|all   (dagen in Europe/Brussels)
// Levert: kpis, compare (dag ervoor), chart (per uur bij één dag, anders per dag), cycleRows (rebills per cyclus),
// events (geslaagd/mislukt/gepland), cohorten en de ledenlijst.
// Env (allemaal al aanwezig): STRIPE_SECRET_KEY, PAYPAL_*, SHOPIFY_*, META_ACCESS_TOKEN, META_AD_ACCOUNT_IDS
// Optioneel: SUB_CAMPAIGN_KEYWORDS="neurodrops,membership"  (extra campagnes meetellen op naam)
//            MEMBERSHIP_REBILL_COGS="0"  (kostprijs per rebill, bv. gratis portaalproduct + verzending)

import crypto from "crypto";
import axios from "axios";
import Stripe from "stripe";
import { MEMBERSHIP } from "../../lib/checkout";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { pp, paypalConfigured } from "../../lib/paypal";
import { canMembership } from "../../lib/dashboard-session";
import { getPauses, getCancellations } from "../../lib/membership-actions";

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
    // Front-end betaling nooit gelukt (kaart geweigerd op de checkout) → nooit klant geworden: niet meetellen.
    // Mislukte rebills hebben status past_due/unpaid en blijven wel staan.
    if (s.status === "incomplete" || s.status === "incomplete_expired") continue;
    const c = typeof s.customer === "object" ? s.customer : {};
    members.push({
      id: s.id, provider: "stripe", status: s.pause_collection && s.status !== "canceled" ? "paused" : statusMap[s.status] || s.status, rawStatus: s.status,
      pausedUntil: s.pause_collection?.resumes_at ? iso(s.pause_collection.resumes_at * 1000) : null,
      startedAt: iso(s.created * 1000), trialEnd: iso((s.trial_end || s.created + MEMBERSHIP.trialDays * 86400) * 1000),
      nextBilling: s.status === "canceled" ? null : iso((s.current_period_end || 0) * 1000),
      periodEnd: iso((s.current_period_end || 0) * 1000), // ook bij opgezegd: wanneer de afschrijving zou vallen
      cancelAtPeriodEnd: !!s.cancel_at_period_end, canceledAt: iso((s.canceled_at || s.ended_at || 0) * 1000),
      cancelReason: s.cancellation_details?.reason || null, cancelFeedback: s.cancellation_details?.feedback || null, cancelAt: iso((s.cancel_at || 0) * 1000),
      email: c.email || "", name: c.shipping?.name || c.name || "", cycles: 0, membershipRevenue: 0, rebillAt: [],
    });
  }
  const rebills = [], failed = [], pending = [];
  n = 0;
  for await (const inv of stripe.invoices.list({ limit: 100, expand: ["data.payment_intent"] })) {
    if (++n > 8000) break;
    if (inv.billing_reason !== "subscription_cycle") continue;
    const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
    const pi = typeof inv.payment_intent === "object" ? inv.payment_intent : null;
    const err = pi?.last_payment_error;
    if (inv.status === "paid" && inv.amount_paid) rebills.push({ subId, at: iso((inv.status_transitions?.paid_at || inv.created) * 1000), amount: inv.amount_paid / 100, provider: "stripe", recovered: (inv.attempt_count || 1) > 1 });
    else if (!inv.attempted && (inv.status === "draft" || inv.status === "open") && inv.amount_due) pending.push({ subId, at: iso(inv.created * 1000), amount: inv.amount_due / 100, provider: "stripe" });
    else if (inv.attempted && (inv.status === "open" || inv.status === "uncollectible")) failed.push({ subId, at: iso(inv.created * 1000), amount: (inv.amount_due || 0) / 100, provider: "stripe", reason: err?.decline_code || err?.code || null, attempts: inv.attempt_count || 1, nextAttempt: iso((inv.next_payment_attempt || 0) * 1000) });
  }
  return { members, rebills, failed, pending };
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
      if (s.status === "APPROVAL_PENDING") continue; // PayPal-checkout nooit afgerond (front-end niet betaald)
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
        canceledAt: ended ? s.status_update_time || null : null, cancelReason: ended ? (s.status === "EXPIRED" ? "expired" : s.status_change_note ? "note" : "cancellation_requested") : null, cancelFeedback: s.status_change_note || null,
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
    if (!canMembership(s)) return res.status(401).json({ success: false, error: "No access" });

    const range = String(req.query.range || "today");
    const live = range === "today"; // "nog te innen" van vandaag telt alleen in de live dag-weergave
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
    for (const m of st.members) { const list = (bySub[m.id] || []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); m.cycles = list.length; m.membershipRevenue = list.reduce((a, r) => a + r.amount, 0); m.rebillAt = list.map((r) => r.at); m.rebillAmt = list.map((r) => r.amount); }

    // CS-acties: pauzes (PayPal: SUSPENDED door ons = gepauzeerd) en opzeggingsgegevens
    const [pauses, csCancels] = await Promise.all([getPauses().catch(() => ({})), getCancellations().catch(() => ({}))]);
    for (const m of py.members) {
      const p = pauses[m.id];
      if (p && m.rawStatus === "SUSPENDED") { m.status = "paused"; m.pausedUntil = p.until; }
    }
    const members = [...st.members, ...py.members].map((m) => {
      const o = orders[m.id];
      if (pauses[m.id] && m.status === "paused") m.pauseDays = pauses[m.id].days;
      if (csCancels[m.id]) m.csCancellation = csCancels[m.id];
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
    // ROAS: echte omzet van de periode (front-end + rebills) / ad spend van de periode — geen projectie
    const roas = spend > 0 ? (feRevenue + rebillRevenue) / spend : null;
    const revenue = feRevenue + rebillRevenue;
    const profitPct = revenue > 0 ? netProfit / revenue : null;

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
      cyclesOut.push({ k, label: k === 0 ? `Trial (day 0–${MEMBERSHIP.trialDays})` : `Cycle ${k} (day ${MEMBERSHIP.trialDays + (k - 1) * MEMBERSHIP.intervalDays}–${MEMBERSHIP.trialDays + k * MEMBERSHIP.intervalDays})`,
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
    for (let ms = pStart; ms < pEnd; ms += DAY) { const d = dayStr(ms); days[d] = { d, new: 0, feAmount: 0, rebills: 0, rebillAmount: 0, canceled: 0, failed: 0, spend: r2(meta.daily[d] || 0) }; }
    for (const m of newMembers) { const d = dayStr(Date.parse(m.startedAt)); if (days[d]) { days[d].new++; days[d].feAmount += m.order?.net || 0; } }
    for (const r of pRebills) { const d = dayStr(Date.parse(r.at)); if (days[d]) { days[d].rebills++; days[d].rebillAmount += r.amount; } }
    for (const m of pCancel) { const d = dayStr(Date.parse(m.canceledAt)); if (days[d]) days[d].canceled++; }
    for (const f of pFailed) { const d = dayStr(Date.parse(f.at)); if (days[d]) days[d].failed++; }

    /* ---- grafiek: per uur bij één dag (met de dag ervoor als vergelijking), anders per dag ---- */
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    const hourOf = (t) => parseInt(new Date(t).toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }), 10);
    const between = (t, a, b) => { const ms = typeof t === "number" ? t : Date.parse(t || 0); return ms >= a && ms < b; };
    // te innen: actieve/proef-leden met een geplande afschrijving (opzeggers aan het einde van de cyclus worden niet meer geïnd)
    const billable = members.filter((m) => m.nextBilling && (m.status === "active" || m.status === "trial") && !m.cancelAtPeriodEnd);
    function hourly(dStart, dEnd) {
      const pts = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}:00`, total: 0, rebills: 0, rebillCount: 0, frontEnd: 0, orders: 0, scheduled: 0, scheduledAmount: 0 }));
      for (const m of members) if (m.order && between(m.order.at, dStart, dEnd)) { const p = pts[hourOf(m.order.at)]; p.total += m.order.net; p.frontEnd += m.order.net; p.orders++; }
      for (const r of rebills) if (between(r.at, dStart, dEnd)) { const p = pts[hourOf(r.at)]; p.total += r.amount; p.rebills += r.amount; p.rebillCount++; p.orders++; }
      for (const m of billable) if (between(m.nextBilling, Math.max(now, dStart), dEnd)) { const p = pts[hourOf(m.nextBilling)]; p.scheduled++; p.scheduledAmount += PRICE; }
      return pts.map((p) => ({ ...p, total: r2(p.total), rebills: r2(p.rebills), frontEnd: r2(p.frontEnd), scheduledAmount: r2(p.scheduledAmount) }));
    }
    const singleDay = from === to;
    const chart = singleDay
      ? { granularity: "hour", points: hourly(pStart, pEnd), compare: hourly(pStart - DAY, pEnd - DAY) }
      : { granularity: "day", points: Object.values(days).map((d) => ({ label: d.d, total: r2(d.feAmount + d.rebillAmount), rebills: r2(d.rebillAmount), rebillCount: d.rebills, frontEnd: r2(d.feAmount), orders: d.new + d.rebills, scheduled: 0, scheduledAmount: 0 })) };

    // vergelijking met de dag ervoor: vandaag tot nu toe (zelfde tijdstip), gisteren de hele dag ervoor
    let compare = null;
    if (singleDay) {
      const cEnd = range === "today" ? now - DAY : pEnd - DAY, cStart = pStart - DAY;
      const cRebills = rebills.filter((r) => between(r.at, cStart, cEnd));
      const cFe = members.filter((m) => m.order && between(m.order.at, cStart, cEnd)).reduce((a, m) => a + m.order.net, 0);
      const cNew = members.filter((m) => between(m.startedAt, cStart, cEnd)).length;
      compare = { sameTime: range === "today", newMembers: cNew, rebills: cRebills.length, rebillRevenue: r2(cRebills.reduce((a, r) => a + r.amount, 0)), revenue: r2(cFe + cRebills.reduce((a, r) => a + r.amount, 0)) };
    }

    /* ---- te innen: nog openstaande afschrijvingen in de periode en de komende 7 dagen ---- */
    const openInPeriod = billable.filter((m) => between(m.nextBilling, Math.max(now, pStart), pEnd));
    const next7 = billable.filter((m) => between(m.nextBilling, now, now + 7 * DAY));
    const byProvider = (list) => ({ stripe: list.filter((m) => m.provider === "stripe").length, paypal: list.filter((m) => m.provider === "paypal").length });
    const recoveredInPeriod = pRebills.filter((r) => r.recovered).length;
    const rebillNet = rebillRevenue - rebillFees - rebillCogs;

    /* ---- rebills per cyclus (cyclus k = rebill k, verschuldigd op dag 7 + (k−1)·28) — voor de leden van wie die afschrijving in de periode viel ---- */
    const cycleRows = [];
    for (let k = 1; k <= Math.min(maxCycle + 1, 12); k++) {
      const list = members.filter((m) => inPeriod(cycleEnd(m, k - 1)));
      const paid = list.filter((m) => m.cycles >= k);
      const canceledBefore = list.filter((m) => m.status === "canceled" && m.cycles < k);
      const failedK = list.filter((m) => m.status === "problem" && m.cycles < k);
      const open = list.length - paid.length - canceledBefore.length - failedK.length;
      const rev = paid.reduce((a, m) => a + (m.rebillAmt?.[k - 1] ?? PRICE), 0);
      const fees = paid.reduce((a, m) => a + (m.rebillAmt?.[k - 1] ?? PRICE) * REBILL_FEE_PCT + REBILL_FEE_FIXED, 0);
      const decided = paid.length + failedK.length;
      cycleRows.push({ k, label: `Rebill ${k}`, day: MEMBERSHIP.trialDays + (k - 1) * MEMBERSHIP.intervalDays, due: list.length, paid: paid.length, failed: failedK.length,
        recovered: paid.filter((m) => rebills.find((r) => r.subId === m.id && r.recovered && m.rebillAt[k - 1] === r.at)).length,
        canceledBefore: canceledBefore.length, open, successRate: decided ? r2(paid.length / decided) : null, revenue: r2(rev), net: r2(rev - fees - paid.length * REBILL_COGS) });
      if (list.length === 0 && k > 3) { cycleRows.pop(); break; }
    }

    const who = (m) => ({ id: m.id, name: m.name, email: m.email, provider: m.provider, order: m.order?.name || "", orderId: m.order?.id || "", status: m.status });
    /* ---- projectie komende 7 dagen: rebills die al gepland staan + de nieuwe subscribers van vandaag ----
       venster = nu t/m het einde van dag 7 (Brussel), zodat de proef van wie vandaag instapte (rebill op dag 7) er volledig in valt */
    const todayStr = dayStr(now);
    const { end: winEnd } = dayBounds(todayStr, dayStr(now + 7 * DAY));
    const startedToday = (m) => dayStr(Date.parse(m.startedAt)) === todayStr;
    const inWin = billable.filter((m) => between(m.nextBilling, now, winEnd));
    const projNew = inWin.filter(startedToday), projExisting = inWin.filter((m) => !startedToday(m));
    const projTrial = projExisting.filter((m) => m.status === "trial"), projActive = projExisting.filter((m) => m.status === "active");
    // historische kans dat een geplande afschrijving lukt: proef → rebill 1 (ret1) en rebill k≥2 (betaalde rebills / verschuldigde rebills k≥2)
    let dueK = 0, paidK = 0;
    for (const m of members) for (let k = 2; k <= m.cycles + 1; k++) if (now >= cycleEnd(m, k - 1)) { dueK++; if (m.cycles >= k) paidK++; }
    const retK = dueK ? paidK / dueK : null;
    const pTrial = ret1 ?? 0, pActive = retK ?? ret1 ?? 0;
    const newToday = members.filter(startedToday);
    const projection = {
      until: dayStr(now + 7 * DAY),
      count: inWin.length, amount: r2(inWin.length * PRICE),
      existing: { count: projExisting.length, amount: r2(projExisting.length * PRICE), trial: projTrial.length, active: projActive.length },
      newToday: { count: projNew.length, amount: r2(projNew.length * PRICE), signups: newToday.length },
      expected: r2((projTrial.length + projNew.length) * PRICE * pTrial + projActive.length * PRICE * pActive),
      trialRate: ret1 == null ? null : r2(ret1), rebillRate: retK == null ? null : r2(retK),
    };

    /* ---- opzeggingen (voor de tegel): opgezegd sinds start + wie stopt na de huidige cyclus ---- */
    const cancelList = members.filter((m) => m.status === "canceled" || m.cancelAtPeriodEnd).map((m) => {
      const at = m.canceledAt || null;
      const startMs = Date.parse(m.startedAt), atMs = at ? Date.parse(at) : now;
      return { ...who(m), at, stopsAt: m.status === "canceled" ? null : m.cancelAt || m.nextBilling, pending: m.status !== "canceled",
        startedAt: m.startedAt, days: Math.max(0, Math.floor((atMs - startMs) / DAY)), inTrial: m.cycles === 0 && atMs < Date.parse(m.trialEnd),
        cycles: m.cycles, paid: r2(m.membershipRevenue), frontEnd: m.order ? r2(m.order.net) : null, bundle: m.order?.bundle || "",
        reason: m.cancelReason || null, feedback: m.cancelFeedback || null, inPeriod: !!(at && inPeriod(at)) };
    }).sort((a, b) => Date.parse(b.at || b.stopsAt || 0) - Date.parse(a.at || a.stopsAt || 0));
    const cancelStats = {
      total: canceled, period: pCancel.length, pending: cancelList.filter((c) => c.pending).length,
      inTrial: cancelList.filter((c) => !c.pending && c.inTrial).length,
      afterRebill: cancelList.filter((c) => !c.pending && c.cycles > 0).length,
      paymentFailed: cancelList.filter((c) => c.reason === "payment_failed").length,
      avgDays: cancelList.filter((c) => !c.pending).length ? r2(cancelList.filter((c) => !c.pending).reduce((a, c) => a + c.days, 0) / cancelList.filter((c) => !c.pending).length) : null,
    };

    /* ---- rebill-gebeurtenissen in de periode: geslaagd, mislukt, nog gepland ---- */
    const events = [];
    for (const r of pRebills) { const m = byId[r.subId]; if (!m) continue; events.push({ type: "paid", at: r.at, amount: r2(r.amount), cycle: m.rebillAt.indexOf(r.at) + 1 || m.cycles, next: m.nextBilling, recovered: !!r.recovered, member: who(m) }); }
    for (const f of pFailed) { const m = byId[f.subId]; if (!m) continue; events.push({ type: "failed", at: f.at, amount: r2(f.amount), cycle: m.cycles + 1, reason: f.reason || null, attempts: f.attempts || 1, nextAttempt: f.nextAttempt || null, inRecovery: m.status === "problem", member: who(m) }); }
    for (const m of openInPeriod) events.push({ type: "scheduled", at: m.nextBilling, amount: PRICE, cycle: m.cycles + 1, member: who(m) });
    events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    // Rebills die vandaag (Brussel) geïnd moeten worden: al betaald, mislukt of nog gepland — los van de gekozen periode
    const tb = (() => { const t = period("today"); return dayBounds(t.from, t.to); })();
    const inToday = (t) => { const ms = Date.parse(t || 0); return ms >= tb.start && ms < tb.end; };
    const dueToday = [];
    for (const r of rebills) { if (!inToday(r.at)) continue; const m = byId[r.subId]; if (!m) continue; dueToday.push({ type: "paid", at: r.at, amount: r2(r.amount), cycle: m.rebillAt.indexOf(r.at) + 1 || m.cycles, recovered: !!r.recovered, member: who(m) }); }
    for (const f of failed) { if (!inToday(f.at)) continue; const m = byId[f.subId]; if (!m) continue; dueToday.push({ type: "failed", at: f.at, amount: r2(f.amount), cycle: m.cycles + 1, reason: f.reason || null, nextAttempt: f.nextAttempt || null, member: who(m) }); }
    for (const m of billable) if (between(m.nextBilling, Math.max(now, tb.start), tb.end)) dueToday.push({ type: "scheduled", at: m.nextBilling, amount: PRICE, cycle: m.cycles + 1, member: who(m) });
    // Zodat de lijst van vandaag niet "krimpt": ook wie vandaag aan de beurt was maar (nog) niet betaald/mislukt is
    const seenToday = new Set(dueToday.map((d) => d.member.id));
    const addDue = (type, m, at, extra = {}) => { if (!m || seenToday.has(m.id)) return; seenToday.add(m.id); dueToday.push({ type, at, amount: PRICE, cycle: m.cycles + 1, member: who(m), ...extra }); };
    // Stripe heeft de verlenging gestart maar nog niet afgeschreven (± 1 uur na het verlengmoment)
    for (const pnd of st.pending || []) if (inToday(pnd.at)) addDue("processing", byId[pnd.subId], pnd.at);
    // PayPal: tijdstip voorbij, betaling nog niet binnen (PayPal int soms uren later)
    for (const m of billable) if (m.provider === "paypal" && inToday(m.nextBilling) && Date.parse(m.nextBilling) < now) addDue("processing", m, m.nextBilling);
    for (const m of members) {
      // Opgezegd terwijl de afschrijving vandaag zou vallen (of "stopt aan einde periode" met einde vandaag)
      const dueAt = m.provider === "stripe" ? m.periodEnd : m.status === "canceled" ? iso(Date.parse(m.trialEnd) + (m.cycles || 0) * CYCLE_MS) : m.nextBilling;
      if (m.cancelAtPeriodEnd && inToday(m.nextBilling)) addDue("cancelled", m, m.nextBilling, { canceledAt: m.canceledAt || null });
      else if (m.status === "canceled" && inToday(dueAt) && inToday(m.canceledAt)) addDue("cancelled", m, dueAt, { canceledAt: m.canceledAt || null });
      else if (m.status === "paused" && inToday(dueAt)) addDue("paused", m, dueAt);
    }
    dueToday.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const eventsTotal = events.length;
    events.splice(150);

    const kpis = {
      netProfit: r2(netProfit),
      orders: { count: feOrders.length + pRebills.length, amount: r2(feRevenue + rebillRevenue), frontEnd: feOrders.length, rebills: pRebills.length },
      rebillRevenue: { period: r2(rebillRevenue), total: r2(rebills.reduce((a, r) => a + r.amount, 0)), count: pRebills.length, totalCount: rebills.length },
      cogs: { frontEnd: r2(feCogs), rebills: r2(rebillCogs), rebillCogsEach: REBILL_COGS },
      fees: r2(feFees + rebillFees),
      spend: r2(spend), spendConfigured: meta.configured, campaigns: meta.campaigns,
      cac: cac == null ? null : r2(cac), newMembers: newMembers.length,
      roas: roas == null ? null : r2(roas), roasRebill7: r2(rebill7.sum), roasRebill7Projected: rebill7.projected,
      revenue: r2(revenue), profitPct: profitPct == null ? null : r2(profitPct),
      ltv7: ltv7.value == null ? null : r2(ltv7.value), ltv7Projected: ltv7.projected,
      day7: { value: r2(newMembers.length * PRICE), count: newMembers.length, price: PRICE }, // Dag 7 LTV: nieuwe abonnees in de periode × prijs per cyclus
      ltv28: ltv28.value == null ? null : r2(ltv28.value), ltv28Projected: ltv28.projected,
      profit7: ltv7.value == null || costPerCustomer == null ? null : r2(ltv7.value - costPerCustomer),
      profit28: ltv28.value == null || costPerCustomer == null ? null : r2(ltv28.value - costPerCustomer),
      retention1: ret1 == null ? null : r2(ret1),
      churn: members.length ? r2(canceled / members.length) : null, canceledTotal: canceled, started: members.length,
      failed: { count: pFailed.length, amount: r2(pFailed.reduce((a, f) => a + f.amount, 0)), attempts, rate: attempts ? r2(pFailed.length / attempts) : null, inRecovery: problem, recovered: recoveredInPeriod },
      rebillNet: r2(rebillNet), rebillFees: r2(rebillFees), rebillCogs: r2(rebillCogs), rebillMargin: rebillRevenue > 0 ? r2(rebillNet / rebillRevenue) : null,
      frontEnd: { revenue: r2(feRevenue), cogs: r2(feCogs), fees: r2(feFees), count: feOrders.length },
      due: { open: openInPeriod.length + (live ? dueToday.filter((d) => d.type === "processing").length : 0), openAmount: r2((openInPeriod.length + (live ? dueToday.filter((d) => d.type === "processing").length : 0)) * PRICE), processing: live ? dueToday.filter((d) => d.type === "processing").length : 0, cancelledToday: live ? dueToday.filter((d) => d.type === "cancelled").length : 0, total: pRebills.length + pFailed.length + openInPeriod.length + (live ? dueToday.filter((d) => d.type === "processing").length : 0), ...byProvider(openInPeriod) },
      next7: { count: next7.length, amount: r2(next7.length * PRICE), ...byProvider(next7), firstDay: next7.length ? dayStr(Math.min(...next7.map((m) => Date.parse(m.nextBilling)))) : null },
      cancellations: cancelStats,
      newSubscribers: { period: newMembers.length, today: newToday.length, trialNow: trial },
      projection,
      activeSubscribers: trial + active, trial, active, problem,
      // MRR: alle actieve abonnees, proefleden meegerekend (zij rebillen na de proef)
      mrr: r2((trial + active) * PRICE * (30 / MEMBERSHIP.intervalDays)), recurring28d: r2((trial + active) * PRICE),
    };

    const storeHandle = (process.env.SHOPIFY_STORE_URL || "").replace(".myshopify.com", "");
    return res.status(200).json({ success: true, range, from, to, price: PRICE, storeHandle, kpis, compare, chart, cycleRows, events, eventsTotal, dueToday, series: Object.values(days), cycles: cyclesOut, cohortsWeek: cohorts(weekKey), cohortsMonth: cohorts(monthKey), members, generatedAt: iso(now) });
  } catch (e) {
    console.error("subscriptions:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
