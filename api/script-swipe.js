// pages/api/script-swipe.js — Script Swipe: concurrent-video → transcript (in de browser) → zin voor zin → eigen versie ernaast.
// Geen externe transcriptiedienst of API-sleutel nodig.
//
// Flow (pages/script-swipe.js):
//   POST { action: "create", name, source?, chunks? | text? }  → zinnen (lib/script-swipe.js) → opgeslagen script
//     chunks = segmenten met starttijd uit de browser-transcriptie (Whisper in de browser, pages/script-swipe.js)
//   GET → { scripts: [{ id, name, … }] } · GET ?id= → één script met zinnen
//   POST { action: "save", id, name?, sentences: [{ i, t, text, mine, added? }] } (volledige lijst; text/mine allebei bewerkbaar) · { action: "save", id, restore: true } (originele regels terug)
//   POST { action: "delete", id } · { action: "csv", id }
//   Elk script bewaart ook "original": het onaangeroerde transcript, los van de bewerkbare regels.
// Opslag: Shopify metaobject jjb_dashboard_data, handle "swipe-index" (lijst) + "swipe-<id>" (per script).
// Toegang: admin en Creative Strategist.

import axios from "axios";
import crypto from "crypto";
import { splitText, splitChunks } from "../../lib/script-swipe";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

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

let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET });
  const r = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { token: r.data.access_token, expiresAt: Date.now() + (r.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}
async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const r = await axios.post(`https://${storeUrl}/admin/api/2025-01/graphql.json`, { query, variables }, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 });
  if (r.data.errors) throw new Error(JSON.stringify(r.data.errors));
  return r.data.data;
}
async function readData(handle) {
  const d = await shopifyGraphql(`query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`, { handle });
  const raw = d?.metaobjectByHandle?.field?.value;
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function writeData(handle, value) {
  const d = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) { metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) { metaobject { id } userErrors { message } } }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = d?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}
async function deleteData(handle) {
  const d = await shopifyGraphql(`query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { id } }`, { handle });
  const id = d?.metaobjectByHandle?.id;
  if (id) await shopifyGraphql(`mutation Del($id: ID!) { metaobjectDelete(id: $id) { deletedId userErrors { message } } }`, { id });
}

const INDEX = "swipe-index";
const uid = () => crypto.randomBytes(6).toString("hex");
const clean = (v, max = 200) => String(v || "").trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = getSession(req);
  const roles = Array.isArray(session?.roles) ? session.roles : [];
  if (!session || !(session.admin || roles.includes("Creative Strategist"))) return res.status(401).json({ success: false, error: "No access" });
  const by = session.name || session.email || "";

  try {
    if (req.method === "GET") {
      if (req.query.id) {
        const s = await readData(`swipe-${clean(req.query.id, 40)}`);
        if (!s) return res.status(404).json({ success: false, error: "Not found" });
        return res.status(200).json({ success: true, script: s });
      }
      const idx = (await readData(INDEX)) || { scripts: [] };
      return res.status(200).json({ success: true, scripts: idx.scripts || [] });
    }
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    const b = req.body || {};

    if (b.action === "create") {
      const text = String(b.text || "").slice(0, 60000);
      // chunks: [{ t, text }] van de browser-transcriptie (Whisper, per segment met starttijd); anders geplakte tekst
      const chunks = Array.isArray(b.chunks) ? b.chunks.slice(0, 2000).map((c) => ({ t: Number.isFinite(c?.t) ? Math.round(c.t * 10) / 10 : null, text: String(c?.text || "").slice(0, 2000) })) : null;
      const sentences = chunks ? splitChunks(chunks) : splitText(text);
      if (!sentences.length) return res.status(400).json({ success: false, error: "Paste the transcript first" });
      const id = uid();
      const script = {
        id, name: clean(b.name, 120) || `Script ${new Date().toISOString().slice(0, 10)}`,
        source: clean(b.source, 500), createdAt: new Date().toISOString(), createdBy: by, updatedAt: new Date().toISOString(),
        sentences,
        original: sentences.map((x) => ({ t: x.t, text: x.text })), // onaangeroerde kopie van het transcript
      };
      await writeData(`swipe-${id}`, script);
      const idx = (await readData(INDEX)) || { scripts: [] };
      idx.scripts = [{ id, name: script.name, createdAt: script.createdAt, createdBy: by, count: sentences.length, done: 0 }, ...(idx.scripts || [])].slice(0, 300);
      await writeData(INDEX, idx);
      return res.status(200).json({ success: true, script });
    }

    if (b.action === "save") {
      const id = clean(b.id, 40);
      const s = await readData(`swipe-${id}`);
      if (!s) return res.status(404).json({ success: false, error: "Not found" });
      if (b.name != null) s.name = clean(b.name, 120) || s.name;
      // Het oorspronkelijke transcript blijft altijd bewaard (apart van de bewerkbare regels)
      if (!Array.isArray(s.original) && (s.sentences || []).some((x) => x.text)) s.original = s.sentences.map((x) => ({ t: x.t ?? null, text: x.text }));
      if (Array.isArray(b.sentences)) {
        // Volledige lijst: regels kunnen bewerkt, samengevoegd, ingevoegd (hooks) of verwijderd zijn → opnieuw nummeren.
        // Een rij zonder "text"-veld (oudere pagina die alleen "mine" stuurt) houdt de bestaande originele tekst/tijd op dat nummer.
        const prev = new Map((s.sentences || []).map((x) => [x.i, x]));
        s.sentences = b.sentences.slice(0, 2000).map((x, k) => {
          const old = prev.get(Number(x?.i)) || null;
          const text = x && "text" in x ? clean(x.text, 4000) : clean(old?.text, 4000);
          const t = x && "text" in x ? (Number.isFinite(x.t) ? x.t : null) : (old?.t ?? null);
          return { i: k + 1, t, text, mine: clean(x?.mine, 4000), ...(x?.added ? { added: true } : {}) };
        }).filter((x) => x.text || x.mine || x.added);
      }
      if (b.restore === true && Array.isArray(s.original) && s.original.length) {
        // Originele regels terugzetten; "onze versie" blijft staan per regelnummer
        const mine = new Map((s.sentences || []).map((x) => [x.i, x.mine]));
        s.sentences = s.original.map((x, k) => ({ i: k + 1, t: x.t ?? null, text: x.text, mine: mine.get(k + 1) || "" }));
      }
      s.updatedAt = new Date().toISOString(); s.updatedBy = by;
      await writeData(`swipe-${id}`, s);
      const idx = (await readData(INDEX)) || { scripts: [] };
      idx.scripts = (idx.scripts || []).map((x) => (x.id === id ? { ...x, name: s.name, count: s.sentences.length, done: s.sentences.filter((y) => y.mine).length, updatedAt: s.updatedAt } : x));
      await writeData(INDEX, idx);
      return res.status(200).json({ success: true, script: s });
    }

    if (b.action === "delete") {
      const id = clean(b.id, 40);
      await deleteData(`swipe-${id}`);
      const idx = (await readData(INDEX)) || { scripts: [] };
      idx.scripts = (idx.scripts || []).filter((x) => x.id !== id);
      await writeData(INDEX, idx);
      return res.status(200).json({ success: true, scripts: idx.scripts });
    }

    if (b.action === "csv") {
      const s = await readData(`swipe-${clean(b.id, 40)}`);
      if (!s) return res.status(404).json({ success: false, error: "Not found" });
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const fmtTime = (t) => (t == null ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
      const lines = [["#", "Time", "Original", "Our version"].map(esc).join(","), ...s.sentences.map((x) => [x.i, fmtTime(x.t), x.text, x.mine].map(esc).join(","))];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${s.name.replace(/[^\w\-]+/g, "_")}.csv"`);
      return res.status(200).send("﻿" + lines.join("\n"));
    }
    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (e) {
    console.error("script-swipe:", e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : e.message);
    return res.status(500).json({ success: false, error: e.response?.data?.detail?.message || e.response?.data?.detail || e.message });
  }
}
