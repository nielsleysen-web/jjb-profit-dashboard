// pages/api/advertorials.js
// Advertorial HTML Builder — de motor.
//
// Wat dit doet:
//   1. Databank van builds (index + record per build) in Shopify metaobjects.
//      Grote HTML wordt in chunks van 60k tekens opgeslagen (metaobject-veldlimiet).
//   2. Prep (pure code): scripts/tracking strippen, links verzamelen + CTA's naar #next-step,
//      afbeeldingen verzamelen (img + CSS backgrounds), images klikbaar maken (#next-step).
//   3. AI-lokalisatierun via een zelf-kettende server-side queue (zelfde patroon als salescopy):
//      vertaalt per chunk naar de doeltaal en lokaliseert valuta, steden, namen, instituten,
//      merken, eenheden, maten, datums en getallen. Daarna vision-analyse per afbeelding
//      (tekst erop? competitor-product?).
//   4. Review-acties: wijziging overschrijven, linkbeslissingen, imagebeslissingen.
//   5. Publish: alles toepassen, keep-images re-hosten op Shopify CDN, finale HTML opslaan.
//      De pagina wordt geserveerd via pages/a/[slug].js — edits updaten dezelfde link.
//
// Toegang: admin + Funnel Builder. Model hardcoded (zelfde afspraak als de salescopy-pipeline).

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: "8mb" } } };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const MODEL = "claude-fable-5"; // vast model, nooit een ander
const CHUNK_STORE_SIZE = 60000;   // metaobject-veld blijft onder de limiet
const AI_CHUNK_SIZE = 12000;      // HTML-chunkgrootte per vertaalstap
const PARALLEL_CHUNKS = 5;        // vertalingen tegelijk per serverbeurt
const PARALLEL_IMAGES = 4;        // vision-analyses tegelijk per serverbeurt
const MAX_ATTEMPTS = 3;
const MAX_QUEUE_RUNS = 150;
const MAX_IMAGES = 25;            // vision-analyse cap
const IMG_MAX_BYTES = 4.5 * 1024 * 1024;

const MARKETS = {
  Italy: { language: "Italian", currency: "EUR" },
  France: { language: "French", currency: "EUR" },
  Israel: { language: "Hebrew", currency: "ILS (₪)" },
  Sweden: { language: "Swedish", currency: "SEK (kr)" },
};

/* ================= session ================= */
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
const internalKey = (id) => crypto.createHmac("sha256", SESSION_SECRET).update(`advertorial-queue:${id}`).digest("base64url");

/* ================= Shopify storage ================= */
let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  tokenCache = { token: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}

async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(
    `https://${storeUrl}/admin/api/2025-01/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 25000 }
  );
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}

async function readData(handle) {
  const data = await shopifyGraphql(
    `query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`,
    { handle }
  );
  const raw = data?.metaobjectByHandle?.field?.value;
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeData(handle, value) {
  const data = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id }
        userErrors { message }
      }
    }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

// Grote strings (HTML) in chunks opslaan — metaobject-velden hebben een tekenlimiet
async function writeLarge(base, str) {
  const s = String(str || "");
  const total = Math.max(1, Math.ceil(s.length / CHUNK_STORE_SIZE));
  for (let i = 0; i < total; i++) {
    await writeData(`${base}-${i}`, { i, total, data: s.slice(i * CHUNK_STORE_SIZE, (i + 1) * CHUNK_STORE_SIZE) });
  }
}
async function readLarge(base) {
  const first = await readData(`${base}-0`);
  if (!first) return "";
  let out = first.data || "";
  for (let i = 1; i < (first.total || 1); i++) {
    const part = await readData(`${base}-${i}`);
    out += part?.data || "";
  }
  return out;
}

/* ================= Anthropic ================= */
async function callClaude({ prompt, maxTokens = 4000, timeoutMs = 120000, image = null }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel");
  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } }, { type: "text", text: prompt }]
    : prompt;
  let response;
  try {
    response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] },
      {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        timeout: timeoutMs,
      }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    throw new Error(`Anthropic API: ${msg}`);
  }
  const stop = response.data?.stop_reason;
  if (stop === "refusal") throw new Error("Model declined this content — adjust the advertorial text and retry");
  const text = (response.data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new Error(`Empty output (stop_reason ${stop})`);
  if (stop === "max_tokens") throw new Error("Output truncated (max_tokens) — chunk too large");
  return text;
}

function parseJsonLoose(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/* ================= HTML prep (pure code) ================= */
function stripScripts(html) {
  let removed = 0;
  let out = String(html);
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, () => {
    removed++;
    return "";
  });
  out = out.replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, () => {
    removed++;
    return "";
  });
  // Losse tracking-pixels (1x1 imgs van bekende trackers)
  out = out.replace(/<img[^>]+(facebook\.com\/tr|googletagmanager|google-analytics|doubleclick|hotjar|clarity\.ms)[^>]*>/gi, () => {
    removed++;
    return "";
  });
  return { html: out, removed };
}

function collectLinks(html) {
  const map = {};
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (href.startsWith("#next-step")) continue;
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!map[href]) map[href] = { href, text, count: 0 };
    map[href].count++;
  }
  return Object.values(map);
}

function collectImages(html) {
  const map = {};
  const add = (url, kind) => {
    const u = String(url || "").trim();
    if (!u || u.startsWith("data:") || u.startsWith("#")) return;
    if (!map[u]) map[u] = { url: u, kind, count: 0, containsText: null, isProduct: null, description: "", decision: "pending", newUrl: "" };
    map[u].count++;
  };
  let m;
  const imgRe = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi;
  while ((m = imgRe.exec(html))) add(m[1], "img");
  const bgRe = /background(?:-image)?\s*:\s*[^;"']*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = bgRe.exec(html))) add(m[1], "background");
  return Object.values(map).slice(0, MAX_IMAGES);
}

// Elke afbeelding klikbaar maken naar #next-step (Funnelish trackt dit als volgende-stap-klik).
// Img's die al in een <a> zitten laten we staan — die link wordt via de linkbeslissingen geregeld.
function wrapImagesInNextStep(html) {
  const anchorRanges = [];
  const aRe = /<a\b[\s\S]*?<\/a\s*>/gi;
  let m;
  while ((m = aRe.exec(html))) anchorRanges.push([m.index, m.index + m[0].length]);
  const inAnchor = (idx) => anchorRanges.some(([s, e]) => idx >= s && idx < e);
  let out = "";
  let last = 0;
  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(html))) {
    out += html.slice(last, m.index);
    out += inAnchor(m.index) ? m[0] : `<a href="#next-step">${m[0]}</a>`;
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

// HTML in chunks knippen op tag-grenzen (nooit midden in een tag)
function chunkHtml(html, size) {
  const chunks = [];
  let rest = String(html);
  while (rest.length > size) {
    let cut = rest.lastIndexOf(">", size);
    if (cut < size * 0.4) cut = size; // geen goede taggrens gevonden: hard knippen
    else cut = cut + 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

const slugify = (s) =>
  String(s || "advertorial")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "advertorial";

const uid = () => crypto.randomBytes(6).toString("hex");

/* ================= AI prompts ================= */
function localisePrompt(build, chunk, chunkIndex, chunkTotal) {
  const market = MARKETS[build.targetMarket] || { language: build.targetLanguage, currency: "local currency" };
  const source = build.sourceLanguage === "auto" ? "auto-detect the source language from the fragment" : `the source language is ${build.sourceLanguage}`;
  return `You are localising a direct-response advertorial for the ${build.targetMarket} market. This is HTML fragment ${chunkIndex + 1} of ${chunkTotal}; ${source}.

TRANSLATE all human-visible text to ${market.language}, natural and native — never literal. Preserve the persuasive tone, claims, numbers and urgency exactly.

LOCALISE while translating (this is the core job):
- Product name: every mention of "${build.competitorName}" (including possessives, abbreviations and ™/® variants) becomes "${build.ownProductName}". Never leave the competitor name anywhere.
- Currency: convert prices to ${market.currency} with sensible charm pricing (a €49.90-style price stays a charm price, never an odd conversion).
- Cities, regions and country references: replace with credible ${build.targetMarket} equivalents.
- Person names (doctors, testimonial names): natural local names of the same gender.
- Schools, universities, medical institutions: compose credible local ones tied to the discipline; NEVER a real famous hospital or university, never a research institute.
- Brands: replace with the local equivalent when a clear one exists, otherwise a neutral description.
- Units: convert weight, distance, dimensions and temperature to what ${build.targetMarket} uses, converting the values correctly.
- Clothing sizes: local sizing convention.
- Date formats and number formats (decimal/thousand separators): local convention.

HARD RULES
- Preserve EVERY HTML tag, attribute and the structure EXACTLY as-is. Only change text nodes and the alt/title/placeholder attribute values.
- Never change href, src, class, id, style or data attributes.
- Never add or remove elements.

OUTPUT: return ONLY valid JSON, no markdown fences, no text before or after:
{"html": "<the full localised fragment>", "changes": [{"category": "product|currency|places|people|institutions|brands|units|dates|numbers|other", "before": "...", "after": "...", "confidence": "high|low"}]}
List in "changes" only the LOCALISATION swaps (names, prices, places, institutions, units, sizes, dates, numbers) — not every translated sentence. Use confidence "low" when you had to invent or guess (e.g. a composed clinic name).

FRAGMENT:
${chunk}`;
}

const VISION_PROMPT = `Analyse this image from an advertorial page. Return ONLY valid JSON, no markdown, no explanation:
{"contains_text": true|false, "is_product_packshot": true|false, "description": "max 8 words"}
contains_text = readable overlaid or embedded text in the image (any language). is_product_packshot = the image mainly shows a product/packaging.`;

/* ================= image helpers ================= */
async function fetchImage(url) {
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 25000, maxRedirects: 5 });
  const buf = Buffer.from(r.data);
  if (buf.length > IMG_MAX_BYTES) throw new Error("Image larger than 4.5 MB");
  const ct = String(r.headers["content-type"] || "").split(";")[0].trim();
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct) ? ct : "image/jpeg";
  return { buf, media };
}

// Bestand naar Shopify Files (staged upload) → CDN-URL. Zelfde flow als api/upload.js.
async function uploadToShopifyCdn(buf, filename, mimeType) {
  const staged = await shopifyGraphql(
    `mutation Stage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    { input: [{ filename, mimeType, resource: "FILE", httpMethod: "POST" }] }
  );
  const errs = staged?.stagedUploadsCreate?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
  const target = staged?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("No staged upload target");

  const boundary = "----jjbadv" + crypto.randomBytes(8).toString("hex");
  const parts = [];
  for (const p of target.parameters) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
  parts.push(buf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  await axios.post(target.url, body, {
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
    maxBodyLength: Infinity,
    timeout: 30000,
  });

  const created = await shopifyGraphql(
    `mutation Create($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id } userErrors { message } }
    }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "FILE" }] }
  );
  const cErrs = created?.fileCreate?.userErrors || [];
  if (cErrs.length) throw new Error(cErrs.map((e) => e.message).join(", "));
  const fileId = created?.fileCreate?.files?.[0]?.id;

  let url = "";
  for (let i = 0; i < 10 && !url; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 350 : 600));
    const node = await shopifyGraphql(
      `query Get($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus } } }`,
      { id: fileId }
    );
    if (node?.node?.fileStatus === "FAILED") throw new Error("Shopify could not process this image");
    url = node?.node?.url || "";
  }
  if (!url) throw new Error("CDN URL not ready — try again");
  return url;
}

/* ================= queue ================= */
async function kickQueue(req, id) {
  const host = req.headers.host || process.env.VERCEL_URL;
  if (!host) return;
  const proto = String(host).startsWith("localhost") ? "http" : "https";
  await axios
    .post(`${proto}://${host}/api/advertorials`, { action: "runQueue", id, internalKey: internalKey(id) }, { timeout: 10000 })
    .catch((e) => console.error("adv kickQueue:", e.message));
}

// Eén stap uitvoeren: eerst alle vertaal-chunks, dan alle image-analyses
async function runOneStep(req, build) {
  const q = build.queue;
  if (q.chunksDone < q.chunksTotal) {
    const i = q.chunksDone;
    const src = await readLarge(`advertorial-${build.id}-src`);
    const chunks = chunkHtml(src, AI_CHUNK_SIZE);
    // BATCH: tot PARALLEL_CHUNKS chunks tegelijk. Chunks zonder leesbare tekst
    // (pure CSS/code) gaan er 1-op-1 doorheen zonder AI-call — dat is het gros
    // van een volledige paginabron en scheelt enorm veel tijd.
    const src = await readLarge(`advertorial-${build.id}-src`);
    const chunks = chunkHtml(src, AI_CHUNK_SIZE);
    const batch = [];
    for (let k = q.chunksDone; k < Math.min(q.chunksDone + PARALLEL_CHUNKS, q.chunksTotal); k++) batch.push(k);
    const results = await Promise.all(
      batch.map(async (i) => {
        const chunk = chunks[i];
        if (!needsTranslation(chunk)) return { i, html: chunk, changes: [] }; // passthrough
        try {
          const text = await callClaude({ prompt: localisePrompt(build, chunk, i, chunks.length), maxTokens: 16000, timeoutMs: 240000 });
          const obj = parseJsonLoose(text);
          const html = String(obj.html || "");
          if (!html.trim()) throw new Error("empty output");
          return { i, html, changes: Array.isArray(obj.changes) ? obj.changes : [] };
        } catch (e) {
          // Mislukte chunk: origineel doorlaten + waarschuwing, run loopt altijd door
          return { i, html: chunk, changes: [{ category: "other", before: `section ${i + 1}`, after: `⚠ NOT localised (${String(e.message).slice(0, 60)}) — edit manually`, confidence: "low" }] };
        }
      })
    );
    for (const r of results) {
      await writeData(`advertorial-${build.id}-part-${r.i}`, { data: r.html });
      const newChanges = r.changes.slice(0, 60).map((c) => ({
        id: uid(),
        category: String(c.category || "other"),
        before: String(c.before || "").slice(0, 300),
        after: String(c.after || "").slice(0, 300),
        confidence: c.confidence === "low" ? "low" : "high",
      }));
      build.changes = [...(build.changes || []), ...newChanges];
    }
    q.chunksDone += batch.length;
    return;
  }
  if (!q.assembled) {
    // Alle chunks klaar: delen samenvoegen tot de gelokaliseerde HTML
    let full = "";
    for (let i = 0; i < q.chunksTotal; i++) {
      const part = await readData(`advertorial-${build.id}-part-${i}`);
      full += part?.data || "";
    }
    await writeLarge(`advertorial-${build.id}-loc`, full);
    q.assembled = true;
    return;
  }
  if (q.imagesDone < (build.images || []).length) {
    // BATCH: tot PARALLEL_IMAGES vision-analyses tegelijk
    const batch = (build.images || []).slice(q.imagesDone, q.imagesDone + PARALLEL_IMAGES);
    await Promise.all(
      batch.map(async (img) => {
        try {
          const { buf, media } = await fetchImage(img.url);
          const text = await callClaude({
            prompt: VISION_PROMPT,
            image: { media_type: media, data: buf.toString("base64") },
            maxTokens: 300,
            timeoutMs: 90000,
          });
          const obj = parseJsonLoose(text);
          img.containsText = !!obj.contains_text;
          img.isProduct = !!obj.is_product_packshot;
          img.description = String(obj.description || "").slice(0, 80);
        } catch (e) {
          img.description = `analysis failed: ${e.message}`.slice(0, 80);
          img.containsText = null;
        }
      })
    );
    q.imagesDone += batch.length;
    return;
  }
}

// Bevat deze chunk vertaalbare tekst? Pure CSS/JS/markup-chunks slaan we over.
function needsTranslation(chunk) {
  let visible = String(chunk)
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const words = visible.match(/[A-Za-zÀ-ÿ\u0590-\u05FF]{3,}/g) || [];
  if (words.length < 8) return false; // vrijwel geen tekst
  const codeSigns = (visible.match(/[{};:=]/g) || []).length;
  if (codeSigns > words.length) return false; // ziet eruit als CSS/JS
  return true;
}

function queuePending(build) {
  const q = build.queue || {};
  return q.chunksDone < q.chunksTotal || !q.assembled || q.imagesDone < (build.images || []).length;
}

/* ================= index helpers ================= */
async function getIndex() {
  return (await readData("advertorial-index")) || { builds: [] };
}
async function saveIndexEntry(build) {
  const index = await getIndex();
  const entry = {
    id: build.id,
    slug: build.slug,
    taskName: build.taskName,
    builderEmail: build.builderEmail,
    builderName: build.builderName,
    competitorName: build.competitorName,
    ownProductName: build.ownProductName,
    targetMarket: build.targetMarket,
    targetLanguage: build.targetLanguage,
    status: build.status,
    createdAt: build.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const i = index.builds.findIndex((b) => b.id === build.id);
  if (i >= 0) index.builds[i] = entry;
  else index.builds.unshift(entry);
  await writeData("advertorial-index", index);
}

/* ================= handler ================= */
export default async function handler(req, res) {
  const rawId = String(req.body?.id || req.query.id || "").replace(/[^a-f0-9]/g, "");
  const isInternal = req.method === "POST" && req.body?.action === "runQueue" && !!rawId && req.body?.internalKey === internalKey(rawId);
  const session = getSession(req);
  const isAdmin = !!session?.admin;
  const isFB = (session?.roles || []).includes("Funnel Builder");
  if (!isInternal && (!session || !(isAdmin || isFB))) {
    return res.status(401).json({ success: false, error: "No access — the Advertorial Builder requires the Funnel Builder role" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    /* ---------- GET ---------- */
    if (req.method === "GET") {
      if (req.query.list === "1") {
        const index = await getIndex();
        return res.status(200).json({ success: true, builds: index.builds, me: { email: session.email, name: session.name, admin: isAdmin } });
      }
      if (rawId) {
        const build = await readData(`advertorial-${rawId}`);
        if (!build) return res.status(404).json({ success: false, error: "Build not found" });
        if (req.query.status === "1") {
          return res.status(200).json({
            success: true,
            status: build.status,
            queue: build.queue,
            imagesTotal: (build.images || []).length,
            error: build.queue?.error || "",
          });
        }
        const payload = { ...build };
        if (req.query.full === "1") payload.localizedHtml = await readLarge(`advertorial-${rawId}-loc`);
        return res.status(200).json({ success: true, build: payload });
      }
      return res.status(400).json({ success: false, error: "Missing id or list=1" });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { action } = req.body || {};

    /* ---------- create ---------- */
    if (action === "create") {
      const { taskName, builderEmail, builderName, competitorName, ownProductName, sourceLanguage, targetMarket } = req.body;
      if (!taskName || !competitorName || !ownProductName || !targetMarket) {
        return res.status(400).json({ success: false, error: "Fill in task name, both product names and the target market" });
      }
      const market = MARKETS[targetMarket];
      if (!market) return res.status(400).json({ success: false, error: `Unknown market — choose one of: ${Object.keys(MARKETS).join(", ")}` });
      const id = uid() + uid();
      const index = await getIndex();
      let slug = slugify(taskName);
      while (index.builds.some((b) => b.slug === slug)) slug = `${slugify(taskName)}-${uid().slice(0, 4)}`;
      const build = {
        id,
        slug,
        taskName: String(taskName).slice(0, 120),
        builderEmail: builderEmail || session.email,
        builderName: builderName || session.name,
        competitorName: String(competitorName).slice(0, 80),
        ownProductName: String(ownProductName).slice(0, 80),
        sourceLanguage: sourceLanguage || "auto",
        targetMarket,
        targetLanguage: market.language,
        status: "draft-setup",
        changes: [],
        links: [],
        images: [],
        removedScripts: 0,
        queue: { active: false, chunksTotal: 0, chunksDone: 0, assembled: true, imagesDone: 0, runs: 0, attempts: 0, error: "", updatedAt: null },
        createdAt: new Date().toISOString(),
      };
      await writeData(`advertorial-${id}`, build);
      await saveIndexEntry(build);
      return res.status(200).json({ success: true, id, slug });
    }

    if (!rawId) return res.status(400).json({ success: false, error: "Missing build id" });
    const build = await readData(`advertorial-${rawId}`);
    if (!build) return res.status(404).json({ success: false, error: "Build not found" });

    /* ---------- saveHtml: prep + run starten ---------- */
    if (action === "saveHtml") {
      const raw = String(req.body.html || "");
      if (raw.trim().length < 500) return res.status(400).json({ success: false, error: "That doesn't look like a full advertorial page (too short)" });

      const stripped = stripScripts(raw);
      let html = stripped.html;
      build.removedScripts = stripped.removed;

      // Links verzamelen: meest voorkomende bestemming = CTA → automatisch #next-step
      const links = collectLinks(html);
      const maxCount = Math.max(0, ...links.map((l) => l.count));
      build.links = links.map((l) => ({
        ...l,
        decision: l.count === maxCount && maxCount >= 2 ? "next-step" : "pending",
      }));

      // Afbeeldingen verzamelen + elke losse img klikbaar maken naar #next-step
      html = wrapImagesInNextStep(html);
      build.images = collectImages(html);

      await writeLarge(`advertorial-${build.id}-src`, html);
      const chunks = chunkHtml(html, AI_CHUNK_SIZE);
      build.changes = [];
      build.queue = { active: true, chunksTotal: chunks.length, chunksDone: 0, assembled: false, imagesDone: 0, runs: 0, attempts: 0, error: "", updatedAt: new Date().toISOString() };
      build.status = "processing";
      await writeData(`advertorial-${build.id}`, build);
      await saveIndexEntry(build);
      await kickQueue(req, build.id);
      return res.status(200).json({ success: true, chunks: chunks.length, images: build.images.length, removedScripts: build.removedScripts });
    }

    /* ---------- runQueue (interne keten) ---------- */
    if (action === "runQueue") {
      if (!build.queue?.active) return res.status(200).json({ success: true, halted: true });
      build.queue.runs = (build.queue.runs || 0) + 1;
      if (build.queue.runs > MAX_QUEUE_RUNS) {
        build.queue.active = false;
        build.queue.error = "Queue safety limit reached — press Resume";
        await writeData(`advertorial-${build.id}`, build);
        return res.status(200).json({ success: false, error: "cap" });
      }
      build.queue.updatedAt = new Date().toISOString();
      await writeData(`advertorial-${build.id}`, build);
      try {
        await runOneStep(req, build);
        build.queue.attempts = 0;
        build.queue.error = "";
      } catch (e) {
        build.queue.attempts = (build.queue.attempts || 0) + 1;
        build.queue.error = e.message;
        if (build.queue.attempts >= MAX_ATTEMPTS) {
          // Batch bleef catastrofaal falen (bv. netwerkstoring): batch overslaan met origineel
          if (build.queue.chunksDone < build.queue.chunksTotal) {
            build.changes.push({ id: uid(), category: "other", before: `sections ${build.queue.chunksDone + 1}+`, after: "⚠ NOT localised — press Resume or edit manually", confidence: "low" });
            const src = await readLarge(`advertorial-${build.id}-src`);
            const chunks = chunkHtml(src, AI_CHUNK_SIZE);
            for (let k = build.queue.chunksDone; k < Math.min(build.queue.chunksDone + PARALLEL_CHUNKS, build.queue.chunksTotal); k++) {
              await writeData(`advertorial-${build.id}-part-${k}`, { data: chunks[k] });
              build.queue.chunksDone++;
            }
          } else if (!build.queue.assembled) {
            build.queue.active = false; // samenvoegen faalt: stoppen, Resume probeert opnieuw
          } else {
            build.queue.imagesDone += PARALLEL_IMAGES;
          }
          build.queue.attempts = 0;
        }
      }
      if (!queuePending(build)) {
        build.queue.active = false;
        build.status = "review";
      }
      build.queue.updatedAt = new Date().toISOString();
      await writeData(`advertorial-${build.id}`, build);
      await saveIndexEntry(build);
      if (queuePending(build) && build.queue.active) await kickQueue(req, build.id);
      return res.status(200).json({ success: true });
    }

    /* ---------- resume ---------- */
    if (action === "resume") {
      if (queuePending(build)) {
        build.queue.active = true;
        build.queue.attempts = 0;
        build.queue.runs = 0;
        build.queue.error = "";
        build.queue.updatedAt = new Date().toISOString();
        await writeData(`advertorial-${build.id}`, build);
        await kickQueue(req, build.id);
      }
      return res.status(200).json({ success: true });
    }

    /* ---------- review-acties ---------- */
    if (action === "editChange") {
      const { changeId, after } = req.body;
      const c = (build.changes || []).find((x) => x.id === changeId);
      if (!c) return res.status(404).json({ success: false, error: "Change not found" });
      const loc = await readLarge(`advertorial-${build.id}-loc`);
      if (c.after && loc.includes(c.after)) {
        await writeLarge(`advertorial-${build.id}-loc`, loc.split(c.after).join(String(after || "")));
      }
      c.after = String(after || "").slice(0, 300);
      c.confidence = "high";
      c.edited = true;
      await writeData(`advertorial-${build.id}`, build);
      return res.status(200).json({ success: true });
    }

    if (action === "decideLink") {
      const { href, decision } = req.body; // "next-step" | "remove" | een URL
      const l = (build.links || []).find((x) => x.href === href);
      if (!l) return res.status(404).json({ success: false, error: "Link not found" });
      l.decision = String(decision || "next-step").slice(0, 500);
      await writeData(`advertorial-${build.id}`, build);
      return res.status(200).json({ success: true, pendingLinks: build.links.filter((x) => x.decision === "pending").length });
    }

    if (action === "decideImage") {
      const { url, decision, newUrl } = req.body; // decision: "keep" | "replace"
      const img = (build.images || []).find((x) => x.url === url);
      if (!img) return res.status(404).json({ success: false, error: "Image not found" });
      if (decision === "replace" && !newUrl) return res.status(400).json({ success: false, error: "Upload the replacement first" });
      img.decision = decision === "replace" ? "replace" : "keep";
      img.newUrl = decision === "replace" ? String(newUrl).slice(0, 800) : "";
      await writeData(`advertorial-${build.id}`, build);
      return res.status(200).json({ success: true, pendingImages: build.images.filter((x) => x.decision === "pending").length });
    }

    /* ---------- publish ---------- */
    if (action === "publish") {
      const pendingLinks = (build.links || []).filter((l) => l.decision === "pending");
      const pendingImages = (build.images || []).filter((i) => i.decision === "pending");
      if (pendingLinks.length || pendingImages.length) {
        return res.status(400).json({ success: false, error: `Still undecided: ${pendingLinks.length} link(s), ${pendingImages.length} image(s)` });
      }
      let html = await readLarge(`advertorial-${build.id}-loc`);
      if (!html) return res.status(400).json({ success: false, error: "No localised HTML yet — run the localisation first" });

      // Linkbeslissingen toepassen
      for (const l of build.links) {
        const esc = l.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (l.decision === "remove") {
          html = html.replace(new RegExp(`<a\\b([^>]*)href\\s*=\\s*["']${esc}["']([^>]*)>`, "gi"), "<span>").replace(/<\/a\s*>/gi, (mm) => mm); // openingstags neutraliseren
          // Noot: bijbehorende </a> wordt door de browser genegeerd als er geen opening meer is
        } else {
          const target = l.decision === "next-step" ? "#next-step" : l.decision;
          html = html.split(`href="${l.href}"`).join(`href="${target}"`).split(`href='${l.href}'`).join(`href='${target}'`);
        }
      }

      // Afbeeldingen: replace = uploadlink, keep = re-hosten op Shopify CDN
      for (const img of build.images) {
        let finalUrl = img.newUrl;
        if (img.decision === "keep") {
          if (!img.rehostedUrl) {
            try {
              const { buf, media } = await fetchImage(img.url);
              const ext = media === "image/png" ? "png" : media === "image/webp" ? "webp" : media === "image/gif" ? "gif" : "jpg";
              img.rehostedUrl = await uploadToShopifyCdn(buf, `adv-${build.slug}-${uid().slice(0, 6)}.${ext}`, media);
            } catch (e) {
              return res.status(500).json({ success: false, error: `Could not re-host image (${img.url.slice(0, 60)}…): ${e.message}` });
            }
          }
          finalUrl = img.rehostedUrl;
        }
        if (finalUrl) html = html.split(img.url).join(finalUrl);
      }

      await writeLarge(`advertorial-${build.id}-fin`, html);
      build.status = "live";
      build.publishedAt = new Date().toISOString();
      await writeData(`advertorial-${build.id}`, build);
      await saveIndexEntry(build);
      const host = req.headers.host;
      return res.status(200).json({ success: true, url: `https://${host}/a/${build.slug}` });
    }

    /* ---------- beheer ---------- */
    if (action === "rename") {
      build.taskName = String(req.body.taskName || build.taskName).slice(0, 120);
      await writeData(`advertorial-${build.id}`, build);
      await saveIndexEntry(build);
      return res.status(200).json({ success: true });
    }

    if (action === "duplicate") {
      const id2 = uid() + uid();
      const index = await getIndex();
      let slug2 = `${build.slug}-copy`;
      while (index.builds.some((b) => b.slug === slug2)) slug2 = `${build.slug}-copy-${uid().slice(0, 4)}`;
      const copy = { ...JSON.parse(JSON.stringify(build)), id: id2, slug: slug2, taskName: `${build.taskName} (copy)`, status: build.status === "live" ? "review" : build.status, publishedAt: undefined, createdAt: new Date().toISOString() };
      copy.queue = { ...copy.queue, active: false };
      await writeData(`advertorial-${id2}`, copy);
      for (const suffix of ["src", "loc"]) {
        const content = await readLarge(`advertorial-${build.id}-${suffix}`);
        if (content) await writeLarge(`advertorial-${id2}-${suffix}`, content);
      }
      await saveIndexEntry(copy);
      return res.status(200).json({ success: true, id: id2, slug: slug2 });
    }

    if (action === "delete") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Admin only" });
      const index = await getIndex();
      index.builds = index.builds.filter((b) => b.id !== build.id);
      await writeData("advertorial-index", index);
      build.status = "deleted";
      await writeData(`advertorial-${build.id}`, build);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: `Unknown action "${action}"` });
  } catch (error) {
    console.error("Advertorials API error:", error);
    return res.status(500).json({ success: false, error: error.message || "Server error" });
  }
}
