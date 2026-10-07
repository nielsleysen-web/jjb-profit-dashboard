// pages/api/creative-calendar.js — Angle/ICP-kalender (Creative Heatmap → Calendar)
// GET  → { entries, week (maandag van deze week), options (ICP-lijsten per product) }
// POST { action: "add",    entry: { product, week, mechanism, icp, note } }
//      { action: "backlogAdd",    entry: { product, mechanism, icp, note } }   → idee, nog niet ingepland
//      { action: "backlogDelete", id }
//      { action: "update", id, entry: { … } }
//      { action: "delete", id }
// Lezen: iedereen met een creative rol (+ admin/finance). Schrijven: admin + Creative Strategist.
// Een nieuwe ICP komt meteen in de keuzelijst van dat product (creative-options), zodat de taken hem kennen.

import axios from "axios";
import crypto from "crypto";
import { normCalendar, weekStart } from "../../lib/creative-calendar";
import { normOptions, addOption } from "../../lib/creative-options";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;
  if (!sessionToken) return null;
  const [body, sig] = sessionToken.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET });
  const response = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { token: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}
async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(`https://${storeUrl}/admin/api/2025-01/graphql.json`, { query, variables }, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 15000 });
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}
async function readData(handle) {
  const data = await shopifyGraphql(`query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`, { handle });
  const raw = data?.metaobjectByHandle?.field?.value;
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function writeData(handle, value) {
  const data = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) { metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) { metaobject { id } userErrors { message } } }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

const uid = () => crypto.randomBytes(8).toString("hex");
const clean = (v, max = 120) => String(v || "").trim().slice(0, max);

export default async function handler(req, res) {
  const session = getSession(req);
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  const isAdmin = !!session?.admin;
  const isCreative = ["Creative Strategist", "Video Editor", "Graphic Designer", "Media Buyer"].some((r) => roles.includes(r));
  if (!session || !(isAdmin || session.finance || isCreative)) return res.status(401).json({ success: false, error: "No access" });
  const canEdit = isAdmin || roles.includes("Creative Strategist");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const [cal, opts] = await Promise.all([readData("creative-calendar"), readData("creative-options")]);
      const c = normCalendar(cal);
      return res.status(200).json({ success: true, entries: c.entries, backlog: c.backlog, week: weekStart(), options: normOptions(opts), canEdit });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Creative Strategists can plan the calendar" });

    const { action, id, entry } = req.body || {};
    const cal = normCalendar(await readData("creative-calendar"));

    if (action === "add" || action === "update") {
      const e = entry || {};
      const product = clean(e.product), mechanism = clean(e.mechanism), icp = clean(e.icp), note = clean(e.note, 300);
      const week = /^\d{4}-\d{2}-\d{2}$/.test(e.week || "") ? weekStart(e.week) : weekStart();
      if (!product || !mechanism || !icp) return res.status(400).json({ success: false, error: "Product, angle and ICP are required" });
      // ICP in de keuzelijst van dit product zetten
      try {
        const opts = normOptions(await readData("creative-options"));
        if (addOption(opts, "icp", icp, product)) await writeData("creative-options", opts);
      } catch (err) { console.warn("creative-options:", err.message); }
      if (action === "add") {
        cal.entries.push({ id: uid(), product, week, mechanism, icp, note, createdBy: session.name || session.email, createdAt: new Date().toISOString() });
      } else {
        const cur = cal.entries.find((x) => x.id === id);
        if (!cur) return res.status(404).json({ success: false, error: "Entry not found" });
        Object.assign(cur, { product, week, mechanism, icp, note, updatedAt: new Date().toISOString() });
      }
      await writeData("creative-calendar", cal);
      return res.status(200).json({ success: true, entries: cal.entries, backlog: cal.backlog });
    }
    if (action === "backlogAdd") {
      const e = entry || {};
      const product = clean(e.product), mechanism = clean(e.mechanism), icp = clean(e.icp), note = clean(e.note, 300);
      if (!product || !mechanism || !icp) return res.status(400).json({ success: false, error: "Product, angle and ICP are required" });
      const dup = cal.backlog.some((x) => [x.product, x.mechanism, x.icp].join("|").toLowerCase() === [product, mechanism, icp].join("|").toLowerCase());
      if (dup) return res.status(400).json({ success: false, error: "That angle × ICP is already in the backlog" });
      try {
        const opts = normOptions(await readData("creative-options"));
        if (addOption(opts, "icp", icp, product)) await writeData("creative-options", opts);
      } catch (err) { console.warn("creative-options:", err.message); }
      cal.backlog.push({ id: uid(), product, mechanism, icp, note, createdBy: session.name || session.email, createdAt: new Date().toISOString() });
      await writeData("creative-calendar", cal);
      return res.status(200).json({ success: true, entries: cal.entries, backlog: cal.backlog });
    }
    if (action === "backlogDelete") {
      cal.backlog = cal.backlog.filter((x) => x.id !== id);
      await writeData("creative-calendar", cal);
      return res.status(200).json({ success: true, entries: cal.entries, backlog: cal.backlog });
    }
    if (action === "delete") {
      cal.entries = cal.entries.filter((x) => x.id !== id);
      await writeData("creative-calendar", cal);
      return res.status(200).json({ success: true, entries: cal.entries, backlog: cal.backlog });
    }
    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (e) {
    console.error("creative-calendar:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
