// pages/api/creative-copy.js
// Creative Copy — automatische image-ad headlines voor Graphic Designer taken.
//
// Trigger: een design-taak komt in "Ready To Work" (nieuw aangemaakt of doorgeschoven
// vanuit de product pipeline / First Creative Batch). design-tasks.js vuurt dan een
// interne kick af. Geen "Ready for AI"-gate — de statusovergang IS de trigger.
//
// Bronnen (in volgorde):
//   1. De research-JSON van de gekoppelde product-pipeline-taak (salescopy-<sourceLaunchTaskId>)
//   2. Geen JSON? → de advertorial-link van de taak wordt opgehaald en de benodigde
//      informatie wordt daaruit geëxtraheerd (zelfde JSON-structuur).
//
// Output: 5 headlines volgens de vaste promptstructuren (Marketing Creatives doc),
// in het Engels + de taal van de Market Country. Opgeslagen als bewerkbare tabel
// (saveCell → stille herbouw van het XLSX) + XLSX in Shopify Files.
//
// Model: HARDCODED claude-fable-5 — dit is copywriting, zelfde niveau als salescopy.
// Eén keer genereren per taak; opnieuw = expliciete Regenerate (admin + Creative Strategist).

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 300 };

const MODEL = "claude-fable-5";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const STALE_MS = 6 * 60 * 1000; // run zonder update > 6 min = gestrand → auto-retry
const MAX_AUTO_ATTEMPTS = 3;

const LANGUAGES = { Italy: "Italian", France: "French", Israel: "Hebrew", Sweden: "Swedish" };

// Rijen van de tabel + het XLSX. key = veld in store.en / store.tr
export const ROWS = [
  { key: "h1", label: "Headline 1 — Doctor discovery" },
  { key: "h2_field", label: "Headline 2 — Specialist field" },
  { key: "h2", label: "Headline 2 — University discovery" },
  { key: "h3_field", label: "Headline 3 — Specialist field" },
  { key: "h3", label: "Headline 3 — After 50 activity" },
  { key: "h4", label: "Headline 4 — Not the cause you think" },
  { key: "h5", label: "Headline 5 — Morning trick" },
];

/* ---------------- session & internal key ---------------- */
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
const internalKey = (taskId) => crypto.createHmac("sha256", SESSION_SECRET).update(`creative-copy:${taskId}`).digest("base64url");

/* ---------------- Shopify storage ---------------- */
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
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 }
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

const uid = () => crypto.randomBytes(8).toString("hex");

/* ---------------- notificaties ---------------- */
async function pushNotifications(items) {
  if (!items.length) return;
  const store = (await readData("notifications")) || { items: [] };
  const at = new Date().toISOString();
  for (const n of items) {
    store.items.push({ id: uid(), email: n.email, text: n.text, href: n.href || "/graphic-designer", read: false, at });
  }
  if (store.items.length > 400) store.items = store.items.slice(-400);
  await writeData("notifications", store);
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const accounts = (await readData("accounts")) || { users: [] };
      const slackByEmail = {};
      for (const u of accounts.users || []) if (u.slackId) slackByEmail[(u.email || "").toLowerCase()] = u.slackId;
      const lines = items.map((n) => {
        const sid = slackByEmail[(n.email || "").toLowerCase()];
        return `${sid ? `<@${sid}> ` : ""}${n.text}`;
      });
      await axios.post(process.env.SLACK_WEBHOOK_URL, { text: lines.join("\n") }, { timeout: 8000 });
    } catch {}
  }
}

/* ---------------- Claude ---------------- */
async function callClaude({ prompt, maxTokens = 3000, timeoutMs = 90000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel");
  let response;
  try {
    response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] },
      {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        timeout: timeoutMs,
      }
    );
  } catch (e) {
    const apiMsg = e.response?.data?.error?.message;
    throw new Error(apiMsg ? `Anthropic API: ${apiMsg}` : e.message);
  }
  const text = (response.data?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (response.data?.stop_reason === "max_tokens") throw new Error("Output hit the token limit — retry");
  if (response.data?.stop_reason === "refusal") throw new Error("Model declined this content — adjust the source material");
  if (!text) throw new Error(`Model returned no text (stop_reason: ${response.data?.stop_reason || "?"})`);
  return text;
}

function parseJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/* ---------------- research ophalen ---------------- */
async function fetchAdvertorialText(url) {
  const r = await axios.get(url, {
    timeout: 25000,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
  });
  let html = String(r.data || "");
  html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<style\b[\s\S]*?<\/style\s*>/gi, "").replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, "");
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 400) throw new Error("Advertorial page contains almost no readable text");
  return text.slice(0, 30000);
}

const EXTRACT_SCHEMA = `{ "product": { "name": "" }, "avatar": { "age_range": "", "gender": "", "awareness_stage": "", "pain_point_own_word": "", "pain_point_formal": "", "buzzwords_known": [], "buzzwords_unknown": [], "first_symptoms": [], "most_hated_aspect": "", "deeper_desire": "", "ranked_benefits": [] }, "beliefs": { "common_believed_causes_ranked": [] }, "mechanism": { "entry_route": "", "root_cause_structure": "", "step_2_root_cause": "", "cell_word": "", "structure_word": "", "recognisable_anatomical_word": "" }, "usage": { "application_place": "", "application_moment": "", "dosage": "" }, "authority": { "name": "", "title_singular": "", "institution": "" } }`;

function extractionPrompt(advertorialText) {
  return `Below is the full text of a direct-response advertorial for a health product. Extract the information into the JSON structure at the bottom. Every value comes from the text — never invent. Empty string / empty array when the text genuinely does not contain it.

RULES
- avatar.pain_point_own_word: NOUN PHRASE of 1-4 words naming the broad condition in the avatar's everyday words ("erectile problems", "fatty liver") — never a symptom, never a subtype.
- beliefs.common_believed_causes_ranked: the causes the avatar currently BELIEVES are behind the pain point (age, genetics, salt, low testosterone…), ranked most common first. These are the beliefs the advertorial debunks.
- mechanism fields: the REAL root cause the advertorial reveals — structure words in everyday language.
- avatar.ranked_benefits: outcome phrases of 2-5 words, most-mentioned first.
- All values in English. Return ONLY valid JSON, no markdown, no explanation.

ADVERTORIAL TEXT:
${advertorialText}

RETURN THIS STRUCTURE:
${EXTRACT_SCHEMA}`;
}

/* ---------------- headline-prompts (Marketing Creatives doc) ---------------- */
// De 5 vaste structuren. Alles tussen [ ] wordt ingevuld vanuit de research JSON.
function headlinePrompt(json, marketCountry, year) {
  return `You are writing direct-response image-ad headlines for a health product, using the research JSON at the bottom. Follow each structure EXACTLY — you only fill in what is between [brackets]. Everything else stays literally as written.

GLOBAL RULES
- Write in ENGLISH. (Translation to the market language happens in a later step.)
- MARKET COUNTRY: ${marketCountry}. Doctor surnames must be typical, credible surnames from ${marketCountry}. CURRENT YEAR: ${year}.
- Write the way the doctor would explain it to the patient — never the way he would explain it to a colleague.
- [SPECIALIST WHO TREATS THE PAIN POINT]: always the physician the avatar at this awareness stage would actually go to for this pain point (urologist for erectile problems, hepatologist for fatty liver…). IGNORE authority in the JSON when that person is not a treating physician.
- [ROOT MECHANISM TEASED]: max 10-12 words, everyday spoken language, ONE simple image. Use "this one…" + an everyday word (little layer, little tube, little valve, little drain) + where it sits. NO stacking of descriptions, NEVER name medical terms from avatar.buzzwords_unknown literally — only point at WHERE it sits, never HOW it works.
- Believed causes come from beliefs.common_believed_causes_ranked (most common first). Pain point comes from avatar.pain_point_own_word.

HEADLINE 1 — structure:
Dr. [SURNAME] (53), [SPECIALIST WHO TREATS THE PAIN POINT]: "Since I discovered that [PAIN POINT] doesn't come from [BELIEVED CAUSE NR 1] or [BELIEVED CAUSE NR 2], but from [ROOT MECHANISM TEASED], I've solved the problem for 87% of my patients in 4 days."
Example: Dr. Ferrari (53), Urologist: "Since I discovered that erectile problems don't come from getting older or declining testosterone, but from damage to this one small cell on the inside of your blood vessels, I've solved the problem for 87% of men in 4 days."

HEADLINE 2 — two outputs: (a) the specialist FIELD the authority works in (e.g. Diabetology / Urology / Hepatology), (b) the headline:
Discovery University of [MOST FAMOUS CITY OF ${marketCountry}] ${year}: "Recent research shows that [PAIN POINT] is not caused by [BELIEVED CAUSE NR 1]. The real cause is [ROOT MECHANISM TEASED — and cut it off at the most important keyword IN THE MIDDLE of that word with three dots…]"

HEADLINE 3 — two outputs: (a) the specialist FIELD, (b) the headline:
Discovery University of [MOST FAMOUS CITY OF ${marketCountry}] ${year}: "If you still [BELIEVED CAUSE NR 1 PHRASED AS AN ACTIVITY THEY DO] after 50, you can [PAIN POINT + HOW IT GETS WORSE OVER TIME]. That's because [ROOT MECHANISM TEASED — cut off at the most important keyword in the middle of that word with three dots, the cut-off tail maximum 3 words…]"

HEADLINE 4 — structure:
Dr. [SURNAME] (58), [SPECIALIST WHO TREATS THE PAIN POINT]: "[PAIN POINT] is not a result of [BELIEVED CAUSE NR 1]. It comes from [ROOT MECHANISM TEASED]. You can treat it over the next 4 days with your [SURFACE-LEVEL KEYWORD RELATED TO THE PAIN POINT that the avatar is already aware of — a body part, cell or organ linked to the pain point at their current awareness stage — AND CUT THAT WORD OFF IN THE MIDDLE]..."
Example: Dr. Ferrari (58), Diabetologist: "High blood pressure is not a result of too much salt and is not hereditary. It comes from a chronic shortage of nitric oxide. You can treat it over the next 4 days with your blood ve..."

HEADLINE 5 — structure:
[SPECIALIST WHO TREATS THE PAIN POINT] Dr. [FULL NAME] (58): "By doing this every morning after 50, you [DESIRED OUTCOME — name the big pain point with a visual, visceral verb: something the avatar can SEE happening in their body (shrink, melt away, drain, restore). Choose the verb from avatar.pain_point_own_word and the avatar fields — their own language — NEVER from the mechanism fields: the verb describes the desired outcome, not the route, and must not give away the root cause. Avoid clinical or abstract verbs like reduce, improve, address, fix. Intransitive verb → "you let your [pain point] [verb]", transitive → "you [verb] your [pain point]"] from your [THE PLACE IN THE HOME where usage.application_moment + mechanism.entry_route physically happen — swallowing at breakfast → kitchen, before sleep → bedroom, external after showering → bathroom]. Try this 4-day morning trick to treat it at home."
Example: Urologist Dr. Paolo Ricci (58): "By doing this every morning after 50, you let your enlarged prostate shrink from your kitchen. Try this 4-day morning trick to treat it at home."

OUTPUT — only valid JSON, no markdown, no text before or after:
{"h1":{"headline":""},"h2":{"field":"","headline":""},"h3":{"field":"","headline":""},"h4":{"headline":""},"h5":{"headline":""}}

RESEARCH JSON:
${JSON.stringify(json)}`;
}

function translatePrompt(langName, marketCountry, en) {
  return `Translate these direct-response image-ad headlines from English to ${langName} for the ${marketCountry} market. You are a native ${langName} direct-response copywriter — natural and native, never literal. Preserve the persuasive structure, numbers, percentages, timeframes and claims EXACTLY.

RULES
- Doctor names stay unchanged.
- Where a headline cuts a word off in the middle with three dots ("vaatw…"), re-create that effect on the equivalent ${langName} keyword: cut THAT word in the middle. Never leave an English fragment.
- The "field" values are the specialist discipline — translate to the natural ${langName} term.
- Quote marks in the local convention.
- Return the SAME JSON structure with the same keys, values in ${langName}. Only valid JSON, no markdown.

HEADLINES:
${JSON.stringify(en)}`;
}

/* ---------------- XLSX (minimale schrijver, geen dependencies) ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, e.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + e.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}
const xmlEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function colRef(i) {
  let r = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    r = String.fromCharCode(65 + m) + r;
    i = Math.floor((i - 1) / 26);
  }
  return r;
}
function sheetXml(rows) {
  const body = rows
    .map((row, ri) => `<row r="${ri + 1}">` + row.map((c, ci) => `<c r="${colRef(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`).join("") + `</row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="3" width="80" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
}
function buildXlsx(sheets) {
  const sheetTags = sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const relTags = sheets.map((sh, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const ctOverrides = sheets.map((sh, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ctOverrides}</Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}</Relationships>`) },
  ];
  sheets.forEach((sh, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(sh.rows)) }));
  return zipStore(entries);
}

async function uploadBufferToShopify(buf, filename, mimeType) {
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
  if (!target) throw new Error("Could not create upload target");
  const boundary = "----jjbcc" + crypto.randomBytes(6).toString("hex");
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
    timeout: 25000,
  });
  const created = await shopifyGraphql(
    `mutation Create($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { message } } }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "FILE" }] }
  );
  const cErrs = created?.fileCreate?.userErrors || [];
  if (cErrs.length) throw new Error(cErrs.map((e) => e.message).join(", "));
  const fileId = created?.fileCreate?.files?.[0]?.id;
  let url = "";
  for (let i = 0; i < 10 && !url; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 350 : 600));
    const node = await shopifyGraphql(`query Get($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus } } }`, { id: fileId });
    if (node?.node?.fileStatus === "FAILED") throw new Error("Shopify could not process the file");
    url = node?.node?.url || "";
  }
  if (!url) throw new Error("File is still processing — retry in a few seconds");
  return url;
}

/* ---------------- flatten helpers ---------------- */
function flatten(out) {
  return {
    h1: out?.h1?.headline || "",
    h2_field: out?.h2?.field || "",
    h2: out?.h2?.headline || "",
    h3_field: out?.h3?.field || "",
    h3: out?.h3?.headline || "",
    h4: out?.h4?.headline || "",
    h5: out?.h5?.headline || "",
  };
}
function unflatten(flat) {
  return {
    h1: { headline: flat.h1 || "" },
    h2: { field: flat.h2_field || "", headline: flat.h2 || "" },
    h3: { field: flat.h3_field || "", headline: flat.h3 || "" },
    h4: { headline: flat.h4 || "" },
    h5: { headline: flat.h5 || "" },
  };
}

async function rebuildXlsx(store, task) {
  const langName = store.language || "Translation";
  const rows = [["Category", "English", langName]];
  for (const r of ROWS) rows.push([r.label, store.en?.[r.key] || "", store.tr?.[r.key] || ""]);
  const buf = buildXlsx([{ name: "Creative Copy Headlines", rows }]);
  const safeProduct = String(task?.product?.title || "creative").replace(/[^\w.\-]+/g, "_").slice(0, 60);
  const filename = `${safeProduct}-creative-copy-headlines.xlsx`;
  store.xlsxUrl = await uploadBufferToShopify(buf, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  store.xlsxName = filename;
}

/* ---------------- de run zelf ---------------- */
async function runGenerate(task, store) {
  const marketCountry = task.market || "Italy";
  const langName = LANGUAGES[marketCountry] || "Italian";
  const year = new Date().getFullYear();

  // 1. Research JSON: uit de product pipeline, anders uit de advertorial
  let json = null;
  let source = "";
  if (task.sourceLaunchTaskId) {
    const sc = await readData(`salescopy-${task.sourceLaunchTaskId}`);
    if (sc?.researchJson && Object.keys(sc.researchJson).length) {
      json = sc.researchJson;
      source = "pipeline JSON";
    }
  }
  if (!json) {
    const link = String(task.advertorialLink || "").trim();
    if (!/^https?:\/\//i.test(link)) {
      throw new Error("No research JSON from the pipeline and no valid advertorial link on this task — add an advertorial link and hit Regenerate");
    }
    const text = await fetchAdvertorialText(link);
    json = parseJson(await callClaude({ prompt: extractionPrompt(text), maxTokens: 2500 }));
    source = "advertorial link";
  }
  store.source = source;
  store.updatedAt = new Date().toISOString();
  await writeData(`creative-copy-${task.id}`, store);

  // 2. Headlines (Engels) — Fable 5
  const en = flatten(parseJson(await callClaude({ prompt: headlinePrompt(json, marketCountry, year), maxTokens: 2500 })));

  // 3. Vertaling naar de markttaal
  const tr = flatten(parseJson(await callClaude({ prompt: translatePrompt(langName, marketCountry, unflatten(en)), maxTokens: 2500 })));

  store.en = en;
  store.tr = tr;
  store.language = langName;

  // 4. XLSX bouwen + uploaden
  await rebuildXlsx(store, task);

  store.status = "done";
  store.error = "";
  store.generatedAt = new Date().toISOString();
  store.updatedAt = store.generatedAt;
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = getSession(req);
    const roles = session?.roles || [];
    const isAdmin = !!session?.admin;
    const canView = isAdmin || ["Creative Strategist", "Graphic Designer", "Media Buyer", "Video Editor"].some((r) => roles.includes(r));
    const canEdit = isAdmin || roles.includes("Creative Strategist");

    /* ---- GET: status + inhoud (+ stille auto-retry bij gestrande run) ---- */
    if (req.method === "GET") {
      if (!canView) return res.status(401).json({ success: false, error: "No access" });
      const taskId = String(req.query.taskId || "");
      const store = (await readData(`creative-copy-${taskId}`)) || null;
      // Gestrande run? Automatisch opnieuw aftrappen (max MAX_AUTO_ATTEMPTS), geen handmatige clicks nodig
      if (store && store.status === "generating" && store.updatedAt && Date.now() - new Date(store.updatedAt).getTime() > STALE_MS && (store.attempts || 0) < MAX_AUTO_ATTEMPTS) {
        try {
          await axios.post(
            `https://${req.headers.host}/api/creative-copy`,
            { action: "generate", taskId, key: internalKey(taskId), force: true },
            { timeout: 2500 }
          ).catch(() => {});
        } catch {}
      }
      return res.status(200).json({ success: true, store, rows: ROWS, canEdit });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, taskId, key, force } = req.body || {};
    const isInternal = key && taskId && key === internalKey(taskId);
    if (!isInternal && !canView) return res.status(401).json({ success: false, error: "No access" });

    const designStore = (await readData("design-tasks")) || { tasks: [] };
    const task = designStore.tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, error: "Design task not found" });

    /* ---- generate (interne trigger of Regenerate-knop) ---- */
    if (action === "generate") {
      if (!isInternal && !canEdit) return res.status(403).json({ success: false, error: "Only admin and Creative Strategists can (re)generate" });
      let store = (await readData(`creative-copy-${taskId}`)) || { status: "", attempts: 0 };
      const stale = store.updatedAt && Date.now() - new Date(store.updatedAt).getTime() > STALE_MS;
      // Eén keer genereren: klaar = klaar, bezig = niet dubbel starten (tenzij gestrand + force)
      if (store.status === "done" && !force) return res.status(200).json({ success: true, skipped: "already generated" });
      if (store.status === "generating" && !stale) return res.status(200).json({ success: true, skipped: "already running" });

      store = {
        ...store,
        status: "generating",
        error: "",
        attempts: (store.attempts || 0) + (force && store.status === "generating" ? 1 : 0),
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeData(`creative-copy-${taskId}`, store);

      try {
        await runGenerate(task, store);
        await writeData(`creative-copy-${taskId}`, store);
        // Melding voor de designer dat de copy klaar staat
        const notifs = [];
        if (task.assigneeEmail) notifs.push({ email: task.assigneeEmail, text: `Creative copy headlines for "${task.product?.title || "your design task"}" are ready` });
        await pushNotifications(notifs);
      } catch (e) {
        store.status = "error";
        store.error = String(e.message || "Unknown error").slice(0, 300);
        store.updatedAt = new Date().toISOString();
        await writeData(`creative-copy-${taskId}`, store);
      }
      return res.status(200).json({ success: true, store });
    }

    /* ---- saveCell: handmatige aanpassing → stille herbouw XLSX ---- */
    if (action === "saveCell") {
      if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Creative Strategists can edit the copy" });
      const { cellKey, en, tr } = req.body;
      if (!ROWS.some((r) => r.key === cellKey)) return res.status(400).json({ success: false, error: "Unknown row" });
      const store = await readData(`creative-copy-${taskId}`);
      if (!store || store.status !== "done") return res.status(400).json({ success: false, error: "Generate the headlines first" });
      store.en = store.en || {};
      store.tr = store.tr || {};
      if (en != null) store.en[cellKey] = String(en).slice(0, 1200);
      if (tr != null) store.tr[cellKey] = String(tr).slice(0, 1200);
      await rebuildXlsx(store, task);
      store.updatedAt = new Date().toISOString();
      await writeData(`creative-copy-${taskId}`, store);
      return res.status(200).json({ success: true, store });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Creative copy error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
