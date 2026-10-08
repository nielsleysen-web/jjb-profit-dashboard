// pages/api/script-swipe.js — Script Swipe: video van een concurrent → transcript zin voor zin → eigen versie ernaast.
//
// Flow (pages/script-swipe.js):
//   1. POST { action: "stage", filename, mimeType, size }  → Shopify staged upload (de browser uploadt het bestand
//      rechtstreeks naar die URL, dus geen limiet van de API-route)
//   2. POST { action: "transcribe", resourceUrl?, url?, name }  → bestand registreren in Shopify Files (CDN-URL) of een
//      publieke video-URL gebruiken → ElevenLabs Scribe (speech-to-text, woordtijden) → zinnen → opgeslagen script
//   3. GET → { scripts: [{ id, name, … }] } · GET ?id= → één script met zinnen
//      POST { action: "save", id, name?, sentences: [{ mine }] }  · POST { action: "delete", id }
// Opslag: Shopify metaobject jjb_dashboard_data, handle "swipe-index" (lijst) + "swipe-<id>" (per script).
// Toegang: admin en Creative Strategist.

import axios from "axios";
import crypto from "crypto";
import { splitSentences } from "../../lib/script-swipe";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 300 };

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

async function transcribe(url) {
  const b = "----jjbstt" + crypto.randomBytes(6).toString("hex");
  const field = (name, value) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const body = Buffer.concat([field("model_id", "scribe_v1"), field("cloud_storage_url", url), field("timestamps_granularity", "word"), field("diarize", "false"), field("tag_audio_events", "false"), Buffer.from(`--${b}--\r\n`)]);
  const r = await axios.post("https://api.elevenlabs.io/v1/speech-to-text", body, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": `multipart/form-data; boundary=${b}` },
    maxBodyLength: Infinity, timeout: 280000,
  });
  return r.data || {};
}

const fmtTime = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

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
      return res.status(200).json({ success: true, scripts: idx.scripts || [], elevenlabs: !!process.env.ELEVENLABS_API_KEY });
    }
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    const b = req.body || {};

    if (b.action === "stage") {
      const filename = clean(b.filename, 120).replace(/[^\w.\-]+/g, "_") || "video.mp4";
      const mimeType = clean(b.mimeType, 80) || "video/mp4";
      const d = await shopifyGraphql(
        `mutation Stage($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
        { input: [{ filename, mimeType, resource: "FILE", fileSize: String(Math.max(1, parseInt(b.size, 10) || 1)), httpMethod: "POST" }] }
      );
      const errs = d?.stagedUploadsCreate?.userErrors || [];
      if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
      const t = d?.stagedUploadsCreate?.stagedTargets?.[0];
      if (!t) throw new Error("Could not create upload target");
      return res.status(200).json({ success: true, target: t });
    }

    if (b.action === "transcribe") {
      if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ success: false, error: "ELEVENLABS_API_KEY ontbreekt" });
      let url = clean(b.url, 2000);
      if (b.resourceUrl) {
        // Geüpload bestand registreren → publieke CDN-URL
        const created = await shopifyGraphql(`mutation Create($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { message } } }`, { files: [{ originalSource: clean(b.resourceUrl, 2000), contentType: "FILE" }] });
        const errs = created?.fileCreate?.userErrors || [];
        if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
        const fileId = created?.fileCreate?.files?.[0]?.id;
        url = "";
        for (let i = 0; i < 25 && !url; i++) {
          await new Promise((r) => setTimeout(r, i === 0 ? 500 : 1200));
          const node = await shopifyGraphql(`query Get($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus } } }`, { id: fileId });
          if (node?.node?.fileStatus === "FAILED") throw new Error("Shopify could not process this file");
          url = node?.node?.url || "";
        }
        if (!url) throw new Error("File is still processing, try again in a minute");
      }
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ success: false, error: "Upload a video or paste a public video URL" });

      const stt = await transcribe(url);
      const sentences = splitSentences(stt.words, stt.text);
      if (!sentences.length) return res.status(422).json({ success: false, error: "No speech found in this video" });
      const id = uid();
      const script = {
        id, name: clean(b.name, 120) || `Script ${new Date().toISOString().slice(0, 10)}`,
        source: url, language: stt.language_code || "", createdAt: new Date().toISOString(), createdBy: by, updatedAt: new Date().toISOString(),
        sentences,
      };
      await writeData(`swipe-${id}`, script);
      const idx = (await readData(INDEX)) || { scripts: [] };
      idx.scripts = [{ id, name: script.name, language: script.language, createdAt: script.createdAt, createdBy: by, count: sentences.length, done: 0 }, ...(idx.scripts || [])].slice(0, 300);
      await writeData(INDEX, idx);
      return res.status(200).json({ success: true, script });
    }

    if (b.action === "save") {
      const id = clean(b.id, 40);
      const s = await readData(`swipe-${id}`);
      if (!s) return res.status(404).json({ success: false, error: "Not found" });
      if (b.name != null) s.name = clean(b.name, 120) || s.name;
      if (Array.isArray(b.sentences)) {
        const mine = new Map(b.sentences.map((x) => [Number(x.i), clean(x.mine, 2000)]));
        s.sentences = s.sentences.map((x) => (mine.has(x.i) ? { ...x, mine: mine.get(x.i) } : x));
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
