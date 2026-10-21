// pages/api/meta-check.js — Controle van de Meta-koppeling (alleen dashboard-admin/finance, ingelogd).
//
// Laat per adaccount zien wat de token (META_ACCESS_TOKEN) écht terugkrijgt, zodat een verschil met Ads Manager
// meteen zichtbaar is: wie de token is, welke accounts hij mag zien, de spend op accountniveau én op
// campagneniveau voor een dag, en of er paginering nodig was. De token zelf wordt nooit getoond.
//
//   GET /api/meta-check                       → gisteren, alle accounts uit META_AD_ACCOUNT_IDS
//   GET /api/meta-check?date=2026-10-20       → andere dag
//   GET /api/meta-check?account=956757448158555 → één account, met de campagnelijst (status + spend)
import axios from "axios";
import crypto from "crypto";

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

const G = "https://graph.facebook.com/v21.0";
const fbErr = (e) => e.response?.data?.error ? `(#${e.response.data.error.code}) ${e.response.data.error.message}` : e.message;

async function get(path, token, params = {}) {
  const r = await axios.get(`${G}/${path}`, { params: { access_token: token, ...params }, timeout: 20000 });
  return r.data;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const s = getSession(req);
    if (!s || !(s.finance || s.admin)) return res.status(401).json({ success: false, error: "No access" });
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ success: false, error: "META_ACCESS_TOKEN ontbreekt" });

    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const one = String(req.query.account || "").replace(/^act_/, "");
    const accountIds = one ? [one] : (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
    const timeRange = JSON.stringify({ since: date, until: date });

    // Wie is de token, en welke accounts mag hij zien?
    const out = { success: true, date, token: {}, accounts: {} };
    try {
      const me = await get("me", token, { fields: "id,name" });
      out.token = { id: me.id, name: me.name };
    } catch (e) { out.token = { error: fbErr(e) }; }
    try {
      const acc = await get("me/adaccounts", token, { fields: "account_id,name,account_status,disable_reason", limit: 200 });
      out.token.adaccounts = (acc.data || []).map((a) => ({ id: a.account_id, name: a.name, status: a.account_status, disable_reason: a.disable_reason }));
      out.token.adaccountsNote = "Accounts die de token via Business Manager mag zien. Een account uit META_AD_ACCOUNT_IDS dat hier ontbreekt, geeft fout #200.";
    } catch (e) { out.token.adaccountsError = fbErr(e); }

    await Promise.all(accountIds.map(async (id) => {
      const a = { account: `act_${id}` };
      try {
        const info = await get(`act_${id}`, token, { fields: "name,account_status,disable_reason,currency,timezone_name,amount_spent" });
        a.name = info.name; a.status = info.account_status; a.disable_reason = info.disable_reason; a.currency = info.currency; a.timezone = info.timezone_name;
      } catch (e) { a.infoError = fbErr(e); }
      try {
        // Totaal op accountniveau (wat Ads Manager onderaan toont)
        const tot = await get(`act_${id}/insights`, token, { level: "account", fields: "spend,impressions", time_range: timeRange });
        a.accountLevel = (tot.data || [])[0] || { spend: "0 (geen rijen)" };
      } catch (e) { a.accountLevelError = fbErr(e); }
      try {
        // Campagneniveau, zoals het dashboard het doet — mét paginering, om te zien of rijen buiten de eerste pagina vallen
        let url = `${G}/act_${id}/insights`, params = { access_token: token, level: "campaign", fields: "campaign_id,campaign_name,spend,impressions", time_range: timeRange, time_increment: 1, limit: 500 };
        const rows = []; let pages = 0;
        while (url && pages < 10) {
          const r = await axios.get(url, { params, timeout: 20000 });
          rows.push(...(r.data?.data || []));
          url = r.data?.paging?.next || null; params = undefined; pages++;
        }
        a.campaignLevel = { rows: rows.length, pages, spend: rows.reduce((t, r) => t + parseFloat(r.spend || 0), 0).toFixed(2),
          campaigns: rows.filter((r) => parseFloat(r.spend || 0) > 0).sort((x, y) => parseFloat(y.spend) - parseFloat(x.spend)).slice(0, 15).map((r) => ({ id: r.campaign_id, name: r.campaign_name, spend: r.spend })) };
      } catch (e) { a.campaignLevelError = fbErr(e); }
      try {
        // Exact dezelfde aanroep als pages/api/dashboard.js (zelfde velden, twee dagen: de dag ervoor + de dag zelf),
        // met het ruwe antwoord en de throttle-headers van Meta — om een verschil met de dashboardcijfers te verklaren
        const since = new Date(new Date(date + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
        const r = await axios.get(`${G}/act_${id}/insights`, { params: { access_token: token, level: "campaign", fields: "campaign_name,spend,impressions,clicks,unique_outbound_clicks", time_range: JSON.stringify({ since, until: date }), time_increment: 1, limit: 500 }, timeout: 20000 });
        const rows = r.data?.data || [];
        a.asDashboard = { since, until: date, rows: rows.length, hasNextPage: !!r.data?.paging?.next, spend: rows.reduce((t, x) => t + parseFloat(x.spend || 0), 0).toFixed(2),
          sample: rows.slice(0, 5).map((x) => ({ campaign: x.campaign_name, date: x.date_start, spend: x.spend })),
          throttle: r.headers?.["x-fb-ads-insights-throttle"] || null, usage: r.headers?.["x-business-use-case-usage"] || r.headers?.["x-ad-account-usage"] || null };
      } catch (e) { a.asDashboardError = fbErr(e); }
      if (one) {
        // Welk veld maakt de spend 0? Zelfde aanroep met verschillende veldcombinaties
        const variants = { spend: "spend", spend_impressions: "spend,impressions", spend_clicks: "spend,clicks", spend_uoc: "spend,unique_outbound_clicks", spend_actions: "spend,actions", dashboard_fields: "campaign_name,spend,impressions,clicks,unique_outbound_clicks" };
        a.variants = {};
        await Promise.all(Object.entries(variants).map(async ([k, fields]) => {
          try {
            const r = await axios.get(`${G}/act_${id}/insights`, { params: { access_token: token, level: "campaign", fields, time_range: timeRange, time_increment: 1, limit: 500 }, timeout: 20000 });
            const rows = r.data?.data || [];
            a.variants[k] = { rows: rows.length, spend: rows.reduce((t, x) => t + parseFloat(x.spend || 0), 0).toFixed(2) };
          } catch (e) { a.variants[k] = { error: fbErr(e) }; }
        }));
        try {
          // Alle campagnes die de token in dit account kan zien (ook gepauzeerd/gearchiveerd)
          const c = await get(`act_${id}/campaigns`, token, { fields: "id,name,status,effective_status,created_time", limit: 200 });
          a.campaignsVisible = (c.data || []).map((x) => ({ id: x.id, name: x.name, status: x.effective_status, created: x.created_time?.slice(0, 10) }));
          a.campaignsVisibleCount = a.campaignsVisible.length;
        } catch (e) { a.campaignsError = fbErr(e); }
      }
      out.accounts[id] = a;
    }));

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
