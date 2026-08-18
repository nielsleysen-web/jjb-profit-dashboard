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
// Toegang: admin + Funnel Builder. Model: goedkoop klein model (vertaalwerk) — de
// salescopy-pipeline blijft onveranderd op Fable 5.

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: "8mb" } } };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
// Vertalen/lokaliseren is regelvolgend werk, geen copywriting: een klein model doet dit
// prima en is ~10x goedkoper dan Fable 5 (±€0,50-1 per advertorial i.p.v. €5-8).
// Ander model proberen? Zet ADVERTORIAL_MODEL in Vercel (env var), geen code nodig.
const MODEL = process.env.ADVERTORIAL_MODEL || "claude-haiku-4-5";
const CHUNK_STORE_SIZE = 60000;   // metaobject-veld blijft onder de limiet
const AI_CHUNK_SIZE = 12000;      // (legacy) HTML-chunkgrootte
const SEG_GROUP = 50;             // tekstsegmenten per vertaalstap
const PARALLEL_CHUNKS = 5;        // vertalingen tegelijk per serverbeurt
const PARALLEL_IMAGES = 4;        // vision-analyses tegelijk per serverbeurt
const MAX_ATTEMPTS = 3;
const MAX_QUEUE_RUNS = 150;
const MAX_IMAGES = 40;            // vision-analyse cap
// Twee aparte limieten: de vision-analyse zit vast aan de limiet van de AI-API,
// het re-hosten op de Shopify CDN kan veel grotere bestanden aan. Zo blokkeert een
// zware foto nooit meer het publiceren — de funnel builder hoeft niets opnieuw te doen.
const VISION_MAX_BYTES = 3.5 * 1024 * 1024;   // analyse (AI-limiet)
const REHOST_MAX_BYTES = 20 * 1024 * 1024;    // re-hosten op Shopify Files

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
  const jobs = [];
  for (let i = 0; i < total; i++) {
    // len = totale lengte, zodat bij het lezen meteen blijkt of er een stuk ontbreekt
    jobs.push(writeData(`${base}-${i}`, { i, total, len: s.length, data: s.slice(i * CHUNK_STORE_SIZE, (i + 1) * CHUNK_STORE_SIZE) }));
  }
  await Promise.all(jobs); // parallel: start is seconden sneller
}
async function readLarge(base) {
  const first = await readData(`${base}-0`);
  if (!first) return "";
  let out = first.data || "";
  for (let i = 1; i < (first.total || 1); i++) {
    let part = await readData(`${base}-${i}`);
    if (!part || typeof part.data !== "string") {
      // Eén hapering bij het lezen mag nooit stilletjes de halve pagina wegsnijden
      await new Promise((r) => setTimeout(r, 400));
      part = await readData(`${base}-${i}`);
    }
    if (!part || typeof part.data !== "string") {
      throw new Error(`Storage incomplete: part ${i + 1} of ${first.total} is missing — press Resume to rebuild`);
    }
    out += part.data;
  }
  // Lengtecontrole: liever een duidelijke fout dan een pagina die halverwege stopt
  if (typeof first.len === "number" && out.length !== first.len) {
    throw new Error(`Storage incomplete: expected ${first.len} characters, got ${out.length} — press Resume to rebuild`);
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
  // <noscript> wordt hier NIET verwijderd — lazy-loaders zetten daar vaak de echte
  // <img>-fallbacks in. recoverLazyImages() haalt die eruit en unwrapt de blokken.
  // Losse tracking-pixels (1x1 imgs van bekende trackers)
  out = out.replace(/<img[^>]+(facebook\.com\/tr|googletagmanager|google-analytics|doubleclick|hotjar|clarity\.ms)[^>]*>/gi, () => {
    removed++;
    return "";
  });
  return { html: out, removed };
}

// Tags normaliseren zodat alle regex-verwerking hierna veilig is. Funnelish-pagina's
// bevatten (a) '>' BINNEN gequote attribuutwaarden (media="(width > 1024px)") waardoor
// elke [^>]*-tagregex het einde van de tag verkeerd ziet en halve tags als tekst
// achterblijven, en (b) ongequote attribuutwaarden (src=//img...) die alle
// quote-gebaseerde regexes missen. Dit loopt tag-voor-tag (quote-bewust):
//   1. '>' en '<' binnen gequote waarden → &gt;/&lt; (browser decodeert dit identiek)
//   2. kale attribuutwaarden krijgen quotes: src=//x → src="//x"
function normalizeTags(html) {
  return String(html).replace(/<[a-zA-Z][^\s>]*(?:[^>"']|"[^"]*"|'[^']*')*>/g, (tag) => {
    let body = tag.slice(1, -1);
    body = body.replace(/"[^"]*"|'[^']*'|(?<![-\w])([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*([^\s"'=<>`]+)/g, (m, attr, val) => {
      if (attr) return `${attr}="${val}"`; // kale waarde → gequote
      return m[0] + m.slice(1, -1).replace(/>/g, "&gt;").replace(/</g, "&lt;") + m[0];
    });
    return `<${body}>`;
  });
}

// Lazy-loaded afbeeldingen terughalen. Moderne pagina's laden images via JS:
// de echte URL staat dan in data-src/data-lazy-src/... en src is een placeholder,
// of de echte <img> staat als fallback in <noscript>. Omdat wij alle scripts
// strippen zou de pagina anders alleen placeholders tonen — én collectImages
// zou die images missen. Dit draait vóór het verzamelen van images.
const LAZY_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-image", "data-echo"];
function recoverLazyImages(html) {
  let out = String(html);

  // 1. Alle lazy-URL's verzamelen (voor dedup met de noscript-fallbacks)
  const lazySet = new Set();
  const lazyAttrRe = /\bdata-(?:src|lazy-src|original|lazy|image|echo)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = lazyAttrRe.exec(out))) lazySet.add(m[1].trim());

  // 2. <noscript>-blokken unwrappen: de <img>-fallbacks eruit houden (behalve als
  //    dezelfde URL al als lazy-attribuut op een gewone <img> staat — anders dubbel),
  //    tracking-pixels eruit, de rest van het blok weg (browsers renderen noscript niet).
  out = out.replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi, (block, inner) => {
    const imgs = inner.match(/<img\b[^>]*>/gi) || [];
    const keep = imgs.filter((tag) => {
      if (/(facebook\.com\/tr|googletagmanager|google-analytics|doubleclick|hotjar|clarity\.ms)/i.test(tag)) return false;
      const sm = tag.match(/(?<![-\w])src\s*=\s*["']([^"']+)["']/i); // lookbehind: niet de "src" in data-src matchen
      return sm && sm[1].trim() && !lazySet.has(sm[1].trim());
    });
    return keep.join("");
  });

  // 3. <source>-tags binnen <picture> weg: die zouden anders (met competitor-URL's)
  //    voorrang krijgen op de src die wij re-hosten/vervangen.
  out = out.replace(/<picture\b[^>]*>([\s\S]*?)<\/picture\s*>/gi, (block, inner) => block.replace(inner, inner.replace(/<source\b[^>]*\/?>/gi, "")));

  // 4. Lazy-attributen op <img> promoveren naar echte src + srcset/lazy-attrs strippen
  //    (src wordt zo de enige bron — belangrijk voor re-hosten en vervangen).
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    let t = tag;
    let lazyUrl = "";
    for (const attr of LAZY_ATTRS) {
      const am = t.match(new RegExp("\\b" + attr + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
      const v = am ? am[1].trim() : "";
      if (v && !v.startsWith("data:")) { lazyUrl = v; break; }
    }
    if (!lazyUrl) {
      const sm = t.match(/\bdata-(?:lazy-)?srcset\s*=\s*["']([^"']+)["']/i);
      if (sm) {
        const first = sm[1].split(",")[0].trim().split(/\s+/)[0];
        if (first && !first.startsWith("data:")) lazyUrl = first;
      }
    }
    if (lazyUrl) {
      // (?<![-\w]) — anders matcht dit óók de "src" binnen "data-src" (hyphen = woordgrens)
      const srcM = t.match(/(?<![-\w])src\s*=\s*["']([^"']*)["']/i);
      const cur = srcM ? srcM[1].trim() : "";
      const isPlaceholder = !cur || cur.startsWith("data:") || /(1x1|blank|placeholder|spacer|pixel|loading|lazy)/i.test(cur);
      if (srcM && isPlaceholder) t = t.replace(srcM[0], `src="${lazyUrl}"`);
      else if (!srcM) t = t.replace(/<img\b/i, `<img src="${lazyUrl}"`);
    }
    // srcset/sizes/lazy-attrs strippen zodat de browser altijd onze src gebruikt
    t = t.replace(/\s(?:srcset|sizes|data-(?:src|lazy-src|original|lazy|image|echo|srcset|lazy-srcset|sizes))\s*=\s*["'][^"']*["']/gi, "");
    return t;
  });

  // 5. data-bg / data-background-image → echte inline background-image
  out = out.replace(/<[a-z][^>]*\bdata-(?:bg|background(?:-image)?)\s*=\s*["'][^"']+["'][^>]*>/gi, (tag) => {
    const bm = tag.match(/\bdata-(?:bg|background(?:-image)?)\s*=\s*["']([^"']+)["']/i);
    const url = bm ? bm[1].trim() : "";
    if (!url || url.startsWith("data:") || /background-image\s*:/i.test(tag)) return tag;
    const styleM = tag.match(/\bstyle\s*=\s*"([^"]*)"/i);
    if (styleM) return tag.replace(styleM[0], `style="${styleM[1]};background-image:url('${url}')"`);
    return tag.replace(/^<([a-z][a-z0-9]*)/i, `<$1 style="background-image:url('${url}')"`);
  });

  return out;
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
  const imgRe = /<img\b[^>]*?(?<![-\w])src\s*=\s*["']([^"']+)["']/gi;
  while ((m = imgRe.exec(html))) add(m[1], "img");
  const bgRe = /background(?:-image)?\s*:\s*[^;"']*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = bgRe.exec(html))) add(m[1], "background");
  // Vangnet: elk data-attribuut dat een directe afbeeldings-URL bevat
  // (lazy-load-varianten die recoverLazyImages niet kende)
  const dataRe = /\bdata-[a-z][a-z0-9-]*\s*=\s*["'](https?:\/\/[^"'\s]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^"']*)?)["']/gi;
  while ((m = dataRe.exec(html))) add(m[1], "img");
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

// Echte <button>-elementen (geen links) klikbaar maken naar #next-step.
// Zeldzaam op advertorials (CTA's zijn meestal <a>-links), maar zonder scripts
// zou zo'n knop anders dood zijn. Buttons die al in een <a> zitten laten we staan.
function wrapButtonsInNextStep(html) {
  const anchorRanges = [];
  const aRe = /<a\b[\s\S]*?<\/a\s*>/gi;
  let m;
  while ((m = aRe.exec(html))) anchorRanges.push([m.index, m.index + m[0].length]);
  const inAnchor = (idx) => anchorRanges.some(([s, e]) => idx >= s && idx < e);
  let out = "";
  let last = 0;
  const bRe = /<button\b[\s\S]*?<\/button\s*>/gi;
  while ((m = bRe.exec(html))) {
    out += html.slice(last, m.index);
    out += inAnchor(m.index) ? m[0] : `<a href="#next-step" style="text-decoration:none">${m[0]}</a>`;
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

// Tekstsegmenten uit de HTML halen en vervangen door placeholders.
// Het model vertaalt ALLEEN de segmenten — de HTML-structuur blijft onaantastbaar.
// Spatie-entiteiten tellen als witruimte; alle entiteiten samen voor de inhoudstest
const WS_ENTITY = "\\s|&nbsp;|&#160;|&#xa0;|&emsp;|&ensp;|&thinsp;|&#8194;|&#8195;|&#8201;";
const ENTITY_ANY = /&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/gi;

function extractSegments(html, ownName) {
  const guards = [];
  let masked = String(html).replace(/<style\b[\s\S]*?<\/style\s*>/gi, (m) => {
    guards.push(m);
    return `\u27EA${guards.length - 1}\u27EB`;
  });
  const segments = [];
  const urlSwaps = [];
  const grab = (text) => {
    const id = segments.length;
    segments.push(String(text));
    return `\u27E6${id}\u27E7`;
  };
  // Anchor-bereiken bepalen zodat we weten of een tekstnode al in een <a> staat
  const anchorRanges = [];
  const aRe = /<a\b[\s\S]*?<\/a\s*>/gi;
  let am;
  while ((am = aRe.exec(masked))) anchorRanges.push([am.index, am.index + am[0].length]);
  const inAnchor = (idx) => anchorRanges.some(([a, b]) => idx >= a && idx < b);

  // Tekstnodes (tussen > en <) met letters, cijfers of valuta erin.
  // BELANGRIJK: spatie-entiteiten (&nbsp; en varianten) tellen als WITRUIMTE, niet als
  // tekst. Anders werd "&nbsp;" als los segment naar het model gestuurd, kwam het leeg
  // terug en plakten woorden/zinnen aan elkaar of verdween de regelafstand.
  masked = masked.replace(/>([^<>]+)</g, (m, t, offset) => {
    if (!t.trim()) return m;
    if (/[\u27EA\u27EB]/.test(t)) return m; // gemaskeerd stijlblok: nooit als tekst grijpen
    const lead = (t.match(new RegExp(`^(?:${WS_ENTITY})*`, "i")) || [""])[0];
    const rest = t.slice(lead.length);
    const tail = (rest.match(new RegExp(`(?:${WS_ENTITY})*$`, "i")) || [""])[0];
    const core = tail ? rest.slice(0, rest.length - tail.length) : rest;
    if (!core) return m; // alleen witruimte/entiteiten -> nooit naar het model
    // Zichtbare URL-tekst: NOOIT naar het model — direct vervangen door de eigen
    // productnaam als #next-step-link (of alleen de naam als hij al in een link staat)
    if (/^(https?:\/\/|www\.)\S+$/i.test(core.trim())) {
      const rep = inAnchor(offset) ? ownName : `<a href="#next-step">${ownName}</a>`;
      urlSwaps.push({ before: core.trim(), after: `${ownName} → #next-step` });
      return `>${lead}${rep}${tail}<`;
    }
    // Betekenisvolle inhoud? Entiteiten eerst wegdenken (&nbsp; is geen "tekst")
    if (!/[A-Za-zÀ-ÿ\u0590-\u05FF\d€$£₪]/.test(core.replace(ENTITY_ANY, " "))) return m;
    return `>${lead}${grab(core)}${tail}<`;
  });
  // Zichtbare attributen
  masked = masked.replace(/(alt|title|placeholder)\s*=\s*"([^"]+)"/gi, (m, attr, val) =>
    /[A-Za-zÀ-ÿ\u0590-\u05FF]/.test(val) ? `${attr}="${grab(val)}"` : m
  );
  const template = masked.replace(/\u27EA(\d+)\u27EB/g, (m, i) => guards[+i]);
  return { template, segments, urlSwaps };
}

function segmentPrompt(build, items) {
  const market = MARKETS[build.targetMarket] || { language: build.targetLanguage, currency: "local currency" };
  const source = build.sourceLanguage === "auto" ? "auto-detect the source language" : `the source language is ${build.sourceLanguage}`;
  return `You are localising text segments from a direct-response advertorial page for the ${build.targetMarket} market; ${source}.

Translate every segment to ${market.language} — natural and native, never literal. Preserve the persuasive tone, claims, numbers and urgency exactly. The segments are fragments of ONE page (headlines, paragraphs, buttons, image alt texts) in page order.

LOCALISE while translating:
- "${build.competitorName}" (all inflections, possessive forms, ™/® variants) → "${build.ownProductName}", everywhere.
- Currency → ${market.currency} with sensible charm pricing.
- Cities/regions/country → credible ${build.targetMarket} equivalents.
- Person names → natural local names, same gender.
- Schools/universities/medical institutions → compose credible local ones tied to the discipline; NEVER a real famous hospital or university.
- Brands → local equivalent or neutral description.
- Weight/distance/dimensions/temperature → local units, values converted correctly. Clothing sizes → local convention.
- Date and number formats → local convention.

HARD RULES
- NEVER output a URL, domain or link. If a segment contains a URL, replace that URL with "${build.ownProductName}". Never invent domains.
- Return the SAME number of segments with the SAME "i" values. Never merge, split, drop or reorder segments.
- Keep HTML entities exactly as they appear (&nbsp;, &amp;, &#8217; …). Never remove them,
  never turn &nbsp; into a normal space, never add or drop spaces at the start or end.
- A segment that is only a number, symbol or code: return it unchanged.
- Keep leading/trailing punctuation of each segment.

OUTPUT: only valid JSON, no markdown, no text before or after:
{"segments":[{"i":0,"t":"..."}],"changes":[{"category":"product|currency|places|people|institutions|brands|units|dates|numbers|other","before":"...","after":"...","confidence":"high|low"}]}
List in "changes" only the localisation swaps (names, prices, places, institutions, units, dates) — not ordinary translations. Use confidence "low" when you invented something (e.g. a composed clinic name).

SEGMENTS:
${JSON.stringify(items)}`;
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

/* ================= pagina ophalen (URL-modus) ================= */
async function fetchPage(url) {
  const r = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
    validateStatus: (st) => st >= 200 && st < 400,
  });
  const html = String(r.data || "");
  if (html.length < 500) throw new Error("The page returned almost no HTML — paste the source manually instead");
  return html;
}

// Relatieve src/href/background-URL's omzetten naar absolute, zodat afbeeldingen
// analyseerbaar en re-hostbaar zijn. #-ankers, data:, mailto: enz. blijven onaangeraakt.
function absolutise(u, base) {
  const v = String(u || "").trim();
  if (!v || /^(https?:|#|data:|mailto:|tel:|javascript:)/i.test(v)) return v;
  // Protocol-relatief, incl. Funnelish-eigenaardigheid met extra slashes (////cdn...)
  if (/^\/\//.test(v)) return "https://" + v.replace(/^\/+/, "");
  try {
    return new URL(v, base).href;
  } catch {
    return v;
  }
}
function resolveRelativeUrls(html, base) {
  let out = String(html);
  out = out.replace(/(src|href|poster|data-src|data-lazy-src|data-original|data-lazy|data-image|data-echo|data-bg|data-background(?:-image)?)\s*=\s*"([^"]*)"/gi, (m, attr, val) => `${attr}="${absolutise(val, base)}"`);
  out = out.replace(/(src|href|poster|data-src|data-lazy-src|data-original|data-lazy|data-image|data-echo|data-bg|data-background(?:-image)?)\s*=\s*'([^']*)'/gi, (m, attr, val) => `${attr}='${absolutise(val, base)}'`);
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, val) => `url(${q}${absolutise(val, base)}${q})`);
  out = out.replace(/((?:data-(?:lazy-)?)?srcset)\s*=\s*"([^"]*)"/gi, (m, attr, val) =>
    `${attr}="${val
      .split(",")
      .map((p) => {
        const bits = p.trim().split(/\s+/);
        return [absolutise(bits[0], base), bits[1]].filter(Boolean).join(" ");
      })
      .join(", ")}"`
  );
  return out;
}

/* ================= image helpers ================= */
async function fetchImage(url, maxBytes = REHOST_MAX_BYTES) {
  if (!/^https?:\/\//i.test(String(url))) throw new Error("relative URL — upload a replacement");
  const r = await axios.get(url, { responseType: "arraybuffer", timeout: 25000, maxRedirects: 5 });
  const buf = Buffer.from(r.data);
  if (buf.length > maxBytes) throw new Error(`Image larger than ${Math.round(maxBytes / 1048576)} MB`);
  const ct = String(r.headers["content-type"] || "").split(";")[0].trim();
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct) ? ct : "image/jpeg";
  return { buf, media };
}

// Te zware foto voor de analyse? Dan halen we alleen VOOR DE ANALYSE een verkleinde
// kopie op via een publieke resize-service. Het origineel blijft ongemoeid — wat op
// de Shopify CDN belandt is altijd het volledige bestand in originele kwaliteit.
async function fetchImageForVision(url) {
  try {
    return await fetchImage(url, VISION_MAX_BYTES);
  } catch (e) {
    if (!/larger than/i.test(String(e.message))) throw e;
    const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(String(url).replace(/^https?:\/\//i, ""))}&w=1200&output=jpg&q=80`;
    const r = await axios.get(proxied, { responseType: "arraybuffer", timeout: 25000, maxRedirects: 5 });
    const buf = Buffer.from(r.data);
    if (buf.length > VISION_MAX_BYTES) throw new Error("too large to analyse");
    return { buf, media: "image/jpeg" };
  }
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
async function kickQueue(req, id, timeoutMs = 2500) {
  const host = req.headers.host || process.env.VERCEL_URL;
  if (!host) return;
  const proto = String(host).startsWith("localhost") ? "http" : "https";
  // Korte timeout: de aanroep hoeft alleen AFGELEVERD te worden, het antwoord boeit niet.
  // Valt een keten hierdoor stil, dan trapt de watchdog in de status-poll hem weer aan.
  await axios
    .post(`${proto}://${host}/api/advertorials`, { action: "runQueue", id, internalKey: internalKey(id) }, { timeout: timeoutMs })
    .catch((e) => console.error("adv kickQueue:", e.message));
}

// Eén stap uitvoeren: eerst alle vertaal-chunks, dan alle image-analyses
async function runOneStep(req, build) {
  const q = build.queue;
  if (q.chunksDone < q.chunksTotal) {
    // BATCH: tot PARALLEL_CHUNKS segmentgroepen tegelijk. Het model ziet alleen
    // tekst — de HTML-structuur wordt nooit aangeraakt en kan dus niet breken.
    const segRaw = await readLarge(`advertorial-${build.id}-seg`);
    const allSeg = JSON.parse(segRaw || "[]");
    const batch = [];
    for (let g = q.chunksDone; g < Math.min(q.chunksDone + PARALLEL_CHUNKS, q.chunksTotal); g++) batch.push(g);
    const results = await Promise.all(
      batch.map(async (g) => {
        const items = allSeg.slice(g * SEG_GROUP, (g + 1) * SEG_GROUP).map((t, k) => ({ i: g * SEG_GROUP + k, t }));
        if (!items.length) return { g, items, changes: [] };
        try {
          const text = await callClaude({ prompt: segmentPrompt(build, items), maxTokens: 8000, timeoutMs: 180000 });
          const obj = parseJsonLoose(text);
          const map = {};
          for (const seg of obj.segments || []) map[seg.i] = String(seg.t ?? "");
          const translated = items.map((it) => ({ i: it.i, t: map[it.i] != null && map[it.i] !== "" ? map[it.i] : it.t }));
          return { g, items: translated, changes: Array.isArray(obj.changes) ? obj.changes : [] };
        } catch (e) {
          return { g, items, changes: [{ category: "other", before: `text group ${g + 1}`, after: `⚠ NOT localised (${String(e.message).slice(0, 60)}) — edit manually`, confidence: "low" }] };
        }
      })
    );
    for (const r of results) {
      await writeData(`advertorial-${build.id}-part-${r.g}`, { data: JSON.stringify(r.items) });
      const newChanges = r.changes.slice(0, 30).map((c) => ({
        id: uid(),
        category: String(c.category || "other"),
        before: String(c.before || "").slice(0, 160),
        after: String(c.after || "").slice(0, 160),
        confidence: c.confidence === "low" ? "low" : "high",
      }));
      build.changes = [...(build.changes || []), ...newChanges];
    }
    if (build.changes.length > 300) {
      const dropped = build.changes.length - 300;
      build.changes = build.changes.slice(0, 300);
      build.changes.push({ id: uid(), category: "other", before: `${dropped} more small changes`, after: "list truncated — check the preview", confidence: "high" });
    }
    q.chunksDone += batch.length;
    return;
  }
  if (!q.assembled) {
    // Template + vertaalde segmenten samenvoegen tot de gelokaliseerde HTML
    const [tpl, segRaw, ...parts] = await Promise.all([
      readLarge(`advertorial-${build.id}-tpl`),
      readLarge(`advertorial-${build.id}-seg`),
      ...Array.from({ length: q.chunksTotal }, (_, g) => readData(`advertorial-${build.id}-part-${g}`)),
    ]);
    const original = JSON.parse(segRaw || "[]");
    const dict = {};
    for (const p of parts) {
      try {
        for (const it of JSON.parse(p?.data || "[]")) dict[it.i] = it.t;
      } catch {}
    }
    if (!tpl.trim()) throw new Error("Template missing — press Resume");
    // Escapen bij terugplaatsen: een vertaling met een " of > in een alt/title-attribuut
    // zou anders de tag openbreken en halve attributen als zichtbare tekst lekken.
    const escSeg = (s) => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const full = tpl.replace(/\u27E6(\d+)\u27E7/g, (m, i) => {
      const v = dict[+i];
      return escSeg(v != null && v !== "" ? v : original[+i] || "");
    });
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
          const { buf, media } = await fetchImageForVision(img.url);
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
          // Analyse mislukt = alleen de beschrijving ontbreekt. De afbeelding zelf
          // blijft gewoon bruikbaar: Keep re-host hem nog steeds op de eigen CDN.
          img.description = "not analysed — check this one yourself";
          img.analysisError = String(e.message || "").slice(0, 120);
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
        // Watchdog: verwerkende builds die >2 min stil liggen weer aantrappen
        const stalled = index.builds.filter((b) => b.status === "processing" && b.updatedAt && Date.now() - Date.parse(b.updatedAt) > 120000).slice(0, 3);
        for (const b of stalled) {
          const rec = await readData(`advertorial-${b.id}`);
          if (rec?.queue?.active) await kickQueue(req, b.id, 1500);
        }
        return res.status(200).json({ success: true, builds: index.builds, me: { email: session.email, name: session.name, admin: isAdmin } });
      }
      if (rawId) {
        const build = await readData(`advertorial-${rawId}`);
        if (!build) return res.status(404).json({ success: false, error: "Build not found" });
        if (req.query.status === "1") {
          // Watchdog: het voortgangsscherm pollt elke 3s — is de actieve run >90s stil,
          // dan is de zelf-kettende keten gestorven en trappen we hem hier weer aan.
          const q = build.queue || {};
          if (q.active && q.updatedAt && Date.now() - Date.parse(q.updatedAt) > 90000) {
            await kickQueue(req, build.id, 1500);
          }
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

    /* ---------- fetchUrl: pagina zelf ophalen en run starten ---------- */
    if (action === "fetchUrl") {
      const url = String(req.body.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ success: false, error: "Enter a full URL starting with https://" });
      let raw;
      try {
        raw = await fetchPage(url);
      } catch (e) {
        return res.status(400).json({ success: false, error: `Could not fetch the page (${String(e.message).slice(0, 120)}). Paste the HTML manually instead.` });
      }
      build.sourceUrl = url;
      req.body.html = raw; // zelfde pad als saveHtml hieronder (absolutiseren gebeurt daar, ná normalizeTags)
    }

    /* ---------- saveHtml: prep + run starten ---------- */
    if (action === "saveHtml" || action === "fetchUrl") {
      const raw = String(req.body.html || "");
      if (raw.trim().length < 500) return res.status(400).json({ success: false, error: "That doesn't look like a full advertorial page (too short)" });

      const stripped = stripScripts(raw);
      // 1) Tags normaliseren ('>' in attributen escapen, kale waarden quoten) — hierna
      //    zijn alle regexes veilig. 2) Relatieve URL's absoluut maken (URL-import).
      // 3) Lazy-loaded images terughalen (data-src → src, noscript-fallbacks, data-bg).
      let html = normalizeTags(stripped.html);
      if (build.sourceUrl) html = resolveRelativeUrls(html, build.sourceUrl);
      html = recoverLazyImages(html);
      build.removedScripts = stripped.removed;

      // Links verzamelen: meest voorkomende bestemming = CTA → automatisch #next-step
      const links = collectLinks(html);
      const maxCount = Math.max(0, ...links.map((l) => l.count));
      build.links = links.map((l) => ({
        ...l,
        decision: l.count === maxCount && maxCount >= 2 ? "next-step" : "pending",
      }));

      // Afbeeldingen verzamelen + elke losse img én losse <button> klikbaar maken naar #next-step
      html = wrapImagesInNextStep(html);
      html = wrapButtonsInNextStep(html);
      build.images = collectImages(html);

      const { template, segments, urlSwaps } = extractSegments(html, build.ownProductName);
      await writeLarge(`advertorial-${build.id}-tpl`, template);
      await writeLarge(`advertorial-${build.id}-seg`, JSON.stringify(segments));
      const groups = Math.max(1, Math.ceil(segments.length / SEG_GROUP));
      build.segCount = segments.length;
      build.changes = urlSwaps.slice(0, 30).map((u) => ({
        id: uid(),
        category: "product",
        before: String(u.before).slice(0, 160),
        after: String(u.after).slice(0, 160),
        confidence: "high",
      }));
      build.queue = { active: true, chunksTotal: groups, chunksDone: 0, assembled: false, imagesDone: 0, runs: 0, attempts: 0, error: "", updatedAt: new Date().toISOString() };
      build.status = "processing";
      await writeData(`advertorial-${build.id}`, build);
      await saveIndexEntry(build);
      await kickQueue(req, build.id);
      return res.status(200).json({ success: true, chunks: groups, images: build.images.length, removedScripts: build.removedScripts });
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
            build.changes.push({ id: uid(), category: "other", before: `text groups ${build.queue.chunksDone + 1}+`, after: "⚠ NOT localised — press Resume or edit manually", confidence: "low" });
            const segRaw2 = await readLarge(`advertorial-${build.id}-seg`);
            const allSeg2 = JSON.parse(segRaw2 || "[]");
            const upto = Math.min(build.queue.chunksDone + PARALLEL_CHUNKS, build.queue.chunksTotal);
            for (let g = build.queue.chunksDone; g < upto; g++) {
              const items = allSeg2.slice(g * SEG_GROUP, (g + 1) * SEG_GROUP).map((t, k) => ({ i: g * SEG_GROUP + k, t }));
              await writeData(`advertorial-${build.id}-part-${g}`, { data: JSON.stringify(items) });
            }
            build.queue.chunksDone = upto;
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
      try {
        await writeData(`advertorial-${build.id}`, build);
      } catch (e) {
        // Record te groot (bv. lange wijzigingenlijst): hard inkorten en opnieuw proberen
        build.changes = (build.changes || []).slice(0, 120);
        build.changes.push({ id: uid(), category: "other", before: "changes list", after: "trimmed to fit storage", confidence: "high" });
        await writeData(`advertorial-${build.id}`, build);
      }
      await saveIndexEntry(build);
      if (queuePending(build) && build.queue.active) await kickQueue(req, build.id, 8000); // ruime aflevertijd: keten mag niet vallen
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
      if ((pendingLinks.length || pendingImages.length) && req.body.force !== true) {
        return res.status(400).json({ success: false, error: `Still undecided: ${pendingLinks.length} link(s), ${pendingImages.length} image(s)` });
      }
      // force ("Publish anyway"): veilige defaults voor wat nog open stond —
      // links → #next-step, images → keep (re-host op eigen CDN)
      for (const l of pendingLinks) l.decision = "next-step";
      for (const i of pendingImages) i.decision = "keep";
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

      // Afbeeldingen: replace = uploadlink, keep = re-hosten op Shopify CDN.
      // Lukt het re-hosten niet (te groot, hotlink-beveiliging, tijdelijke fout), dan
      // blijft de originele URL staan en gaat het publiceren gewoon door — de pagina
      // werkt, en we melden achteraf welke afbeeldingen nog aandacht nodig hebben.
      const rehostSkipped = [];
      for (const img of build.images) {
        let finalUrl = img.newUrl;
        if (img.decision === "keep") {
          if (!img.rehostedUrl) {
            try {
              const { buf, media } = await fetchImage(img.url, REHOST_MAX_BYTES);
              const ext = media === "image/png" ? "png" : media === "image/webp" ? "webp" : media === "image/gif" ? "gif" : "jpg";
              img.rehostedUrl = await uploadToShopifyCdn(buf, `adv-${build.slug}-${uid().slice(0, 6)}.${ext}`, media);
            } catch (e) {
              img.rehostError = String(e.message || "").slice(0, 120);
              rehostSkipped.push({ url: img.url, error: img.rehostError });
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
      return res.status(200).json({
        success: true,
        url: `https://${host}/a/${build.slug}`,
        rehostSkipped, // afbeeldingen die op de competitor-URL bleven staan
      });
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
      for (const suffix of ["tpl", "seg", "loc"]) {
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
