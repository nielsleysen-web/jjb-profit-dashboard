// pages/api/salescopy.js
// Sales Page Copy pipeline (Stefan's Brain) — per launch task.
// Step 1: research from the advertorial (Claude + web search) → prose document.
// Step 1B: extractor → research JSON.
// Steps 2-20: copy steps that receive ONLY the JSON (never the advertorial, never earlier copy).
// Validator: deterministic code checks — no LLM, so nothing gets rewritten.
// Storage: one metaobject per task, handle "salescopy-<taskId>".
// Requires ANTHROPIC_API_KEY in Vercel (optional: ANTHROPIC_MODEL, default claude-sonnet-5).

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: "4mb" } } };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
// Vast model: dit proces draait ALTIJD op Fable 5, nooit op een ander model.
const MODEL = "claude-fable-5";
// Uitzondering: de VERTAALSTAP draait op Opus 4.6 (keuze Niels, aug 2026).
// Alle schrijfstappen blijven op Fable 5.
const TRANSLATE_MODEL = "claude-opus-4-6";

// Market Country → doeltaal voor de vertaalkolom in de CSV
const LANGUAGES = { Italy: "Italian", France: "French", Israel: "Hebrew" };
// Max automatische pogingen per stap; daarna wordt de stap overgeslagen (lege cel, validator meldt het)
const MAX_ATTEMPTS = 3;

/* ---------------- session ---------------- */
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

/* ---------------- Anthropic ---------------- */
async function callClaude({ prompt, webSearch = false, maxTokens = 4000, timeoutMs = 55000, image = null, model = null }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel");
  // Met afbeelding (stap 1C): content wordt een array van [image, text]
  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } }, { type: "text", text: prompt }]
    : prompt;
  const body = {
    model: model || MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  };
  if (webSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  let response;
  try {
    response = await axios.post("https://api.anthropic.com/v1/messages", body, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: timeoutMs,
    });
  } catch (e) {
    // Echte API-foutmelding tonen i.p.v. een kale statuscode
    const apiMsg = e.response?.data?.error?.message;
    throw new Error(apiMsg ? `Anthropic API: ${apiMsg}` : e.message);
  }
  const blocks = response.data?.content || [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (response.data?.stop_reason === "max_tokens") {
    throw new Error("Output hit the token limit and was cut off — retry gives it more room");
  }
  if (response.data?.stop_reason === "refusal") {
    // Inhoudelijke weigering van het model: retryen heeft geen zin, de bron moet aangepast
    throw new Error("Model declined this content — adjust the advertorial claims and run the pipeline again. Retrying unchanged will not help.");
  }
  if (!text) {
    // Leeg antwoord: laat zien wáárom en wat er wel in zat
    const types = blocks.map((b) => b.type).join(", ") || "no blocks at all";
    throw new Error(`Model returned no text — stop_reason: ${response.data?.stop_reason || "?"}, content blocks: ${types}`);
  }
  return text;
}

const uidLog = () => crypto.randomBytes(8).toString("hex");

// Interne sleutel waarmee de keten zichzelf mag aanroepen (zonder sessie)
const internalKey = (taskId) => crypto.createHmac("sha256", SESSION_SECRET).update(`salescopy-queue:${taskId}`).digest("base64url");

/* ---------------- notificaties (zelfde patroon als de taken-API's, incl. Slack) ---------------- */
async function pushNotifications(items) {
  if (!items.length) return;
  const store = (await readData("notifications")) || { items: [] };
  const at = new Date().toISOString();
  for (const n of items) {
    store.items.push({ id: crypto.randomBytes(8).toString("hex"), email: n.email, text: n.text, href: n.href || "/product-launching", read: false, at });
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
    } catch (e) {
      console.error("Slack notify error:", e.message);
    }
  }
}

/* ---------------- CSV naar Shopify Files (zelfde flow als /api/upload) ---------------- */
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
  if (!target) throw new Error("Could not create upload target — check the write_files scope");
  const boundary = "----jjbcsv" + crypto.randomBytes(6).toString("hex");
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
    const node = await shopifyGraphql(`query Get($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus } } }`, { id: fileId });
    if (node?.node?.fileStatus === "FAILED") throw new Error("Shopify could not process the CSV");
    url = node?.node?.url || "";
  }
  if (!url) throw new Error("CSV is still processing — retry this step in a few seconds");
  return url;
}

function parseJsonLoose(text) {
  let t = (text || "").trim();
  t = t.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) {
    // Laat zien wat het model dan wél zei — anders valt dit niet te debuggen
    const peek = t ? t.slice(0, 260) : "(empty output)";
    throw new Error(`No JSON found in model output. The model said: "${peek}"`);
  }
  return JSON.parse(t.slice(start, end + 1));
}

/* ================= PROMPTS ================= */

const LANGUAGE_NOTE = `
The advertorial may be written in any language (Dutch, Italian, French, ...). Write your entire analysis in English, including every quoted word and every extracted value.
Where you give the avatar's own everyday words, give the natural English equivalent that a native English speaker in the same situation would actually use — not a literal translation. "Kraaienpootjes" becomes "crow's feet", not "chicken feet".`;

const PROMPT_1 = `Hi there,
First I want you to analyze this advertorial and I want you to get all the answers to the following, do online research by yourself if needed, and make a research document:

- What is the product we're selling here? What TYPE of product is it (drops, patches, spray, cream)?
- What is the product we're selling here CALLED?
- Which 2 ingredients are mentioned here that primarily deliver the solution?
- The main pain point
- The main avatar
- The awareness stage of the avatar
- Which buzzwords does our target audience know at this awareness stage?
- Their common beliefs that cause the problem
- Their common beliefs that solve the problem
- Their most commonly used alternatives (and what do they hate most about these alternatives)
- Their main desires (surface level, and one level deeper)
- The authority figure of this story
- The unique mechanism of the pain that's been used here
- The unique mechanism of the solution that's been used here (explain it to me step by step as it's given in the advertorial example)
- Understand what the first things are that they do to treat this problem (if they even treat it)
- What are their first symptoms of this pain point?
- What are the following pain points that follow after they experience their first symptoms?
- What is the worst-case outcome on a unique-mechanism level that can happen if they don't treat this (speaking more on a physiological level about what happens INSIDE the body)
- How does this worst-case outcome start to affect their body, how is that visible, and what does it result in?
- What is the consequence of this worst-case outcome on themselves, on the people around them, and how will they have to adjust their life?
- Based on their awareness stage, what do the people around them — or their current trusted advisor — tell them they should do to solve this problem?
- What are their 'last resort' solutions before they move on to the 'worst case' solution they think could still help them?
- How are the ingredients processed in the body? What is the absorption mechanism by which it's taken up into the body?
- Why does this product ensure the problem is solved permanently? How does that work?
- What do they need to avoid in the future so the problem doesn't come back?
- What else can you find online that's applicable to the main avatar we're addressing here?
- Can you sketch a clear picture so that if we now move on to a questioning round, you can answer every question about this persona?
- Is the pain point EXTERNAL or INTERNAL? External means it is visible and the avatar can show the result to someone else (skin, wrinkles, hair, nails). Internal means only the avatar feels, hears or notices it (tinnitus, memory, erection, joints, digestion).
- Is the result VISUAL or NON-VISUAL? Can the avatar see the change with their own eyes, or can they only notice it?
- Is the product delivered in the singular (one jar, one bottle) or in the plural (patches, drops, capsules)?
- What is the exact physical route by which the product enters the body — the ear canal, the skin, the skin behind the ear, the mouth, the nose?
- Which cell word and which structure word does the advertorial use literally? Quote them in the original language of the advertorial.
- What is the most recognisable, everyday anatomical word for the body part involved — the word the avatar would use, not the technical one?
- Which second body part or structure does the instant solution act on, as opposed to the root cause?
- Where exactly on the body is the product applied, according to the section "How do the [product name] work?" Quote the sentence.
- In the section "Mistake 1: underestimating the severity of the problem", quote the sentence that begins with "it often begins with". What are the first symptoms in it?
- Which specific substance or ingredient do they absolutely not want in a product like this, based on the alternatives they have tried and the side effects they hate? Name the substance, not the category.
- Which alternative are they still actively using right now, that they would be afraid of having to give up?
- Which characteristic makes them feel like an exception — their age, how long they have had the complaint, their skin type, or other medication they take? Which one would make them say "yes but in my case it's different, because ..."?
- What is the pain point in their own everyday word, the word they say to a friend at the kitchen table? This must be a NOUN PHRASE of 1-4 words that names the condition itself — "stubborn belly fat", "erectile problems", "fatty liver", "crow's feet" — NEVER a spoken sentence, complaint or quote like "it all goes straight to my belly". And what is the formal or medical name for it?
- Name the BROAD condition, never a symptom, measurement or keyword that belongs to it, and never a subtype or stage. For a blood sugar product the pain point is "diabetes", not "my sugar", not "high blood sugar" and not "diabetes mellitus type 2". For a liver product it is "fatty liver", not "liver values". The symptom words stay available as jargon; they never replace the name of the condition.
- Who is the authority figure, and what is their professional title in the singular and in the plural? Give the title exactly as the advertorial states it, even if a different specialist would seem more logical for this product type.
- Which cleaning agent would a normal person actually use on the body part where the product is applied?
- At which moment in their existing daily routine would this type of product logically be used for maximum effect?
- What is the logical dosage per application for this product form?
- Which sensory confirmation can the user establish within seconds that proves they applied it correctly?
- How many days does the advertorial promise before a noticeable difference appears?
- What is the physical substance, buildup or blockage that the root cause consists of — the fluid, the calcium, the plaque? Name the substance, not the organ or the system.
- Does the advertorial state a percentage for the effect on that substance? Quote it.
- Which single adjective describes the visible desired outcome and belongs almost exclusively to this pain point — slimmer, smoother, firmer?
- What is their biggest objection to the product itself before buying? Not what makes them feel like an exception, but what makes them hesitate to buy at all.
- What do they hate MOST about the pain point itself — the single concrete aspect or symptom that bothers them most in daily life, the thing they would name first when complaining to a friend? Name the thing itself (the bloated belly, the constant ringing, the flaky patches) — never an emotion like frustration or shame.
- Which concrete BENEFITS of the product does the advertorial mention, and how often does each one come back? Count every repetition across the whole advertorial (headline, body, bullets, testimonials, captions). Rank them from most-mentioned to least-mentioned and give the top 3 to 5, each with its count. Phrase every benefit as a short outcome the avatar feels or sees ("reduces bloating", "all-day energy", "deeper sleep") — never as a mechanism or an ingredient.
- What type of practice does the authority figure have — a dermatology practice, an ENT practice, a urology practice?
- Which clinic or hospital is the authority figure connected to? If the advertorial names none, leave empty.
- Describe the physical appearance of the product itself in one sentence — form, colour, size, texture, packaging — exactly as shown or described in the advertorial.
- How large is the product compared to a familiar everyday object — a coin, a credit card, a plaster, a teabag? Use the comparison the advertorial itself makes; if it makes none but states dimensions, give the closest natural comparison. If neither appears, leave empty.
- How would the pain point be symbolised in an image ad? Decide the symbol type: "glow" if the problem sits in or on the body and can be marked with a soft red glow on that exact body area; "object" if the problem is invisible on the body but a physical object communicates it instantly (reading glasses, a walking cane, pharmacy pills, a hearing aid); "none" if neither works. List the 2-4 strongest candidate symbols (body areas for glow, objects for object).
- Determine the visual symbol for the problem side of the split image. Follow the branch rule strictly (none / glow / object) and return exactly one symbol, never a list. Within the branch, pick the option most readable in half a second without text; if two are equal, choose the more common everyday object or the simpler lighting effect.
- Which activities does the avatar now AVOID, skip, cancel or make excuses to get out of BECAUSE of the pain point (conversations, phone calls, dinners, invitations, stairs, walks, intimacy, certain clothing, photos)? Only what the advertorial actually supports — quote or paraphrase the evidence. If none appear, say so.
- What is the single most-hated RECURRING SYMPTOM MOMENT — the concrete, daily or weekly moment when the pain point hits hardest (waking up with pain, climbing the stairs, mid-meal, mid-intimacy)? A moment, not a feeling.
- Classify the pain point into exactly one of three types. FELT-PAIN: the suffering is a physical sensation (pain, burning, stinging, stiffness, cramping) felt regardless of who is around. SHAME-SOCIAL: the symptom is audible or visible to others or disrupts social life — the research shows hiding, embarrassment or avoided situations. DESIRE: nothing hurts — something they want is missing (pleasure, energy, looks). When signals conflict, the answer to "what do they hate most" decides.
- Classify the mechanism into exactly one of three types. REMOVAL: the product removes, flushes or dissolves an accumulated substance (toxins, deposits, plaque). SUPPLY: the product delivers or replenishes something that is lacking (blood flow, moisture, collagen, a nutrient). REPAIR: the product protects and rebuilds damaged tissue (a barrier plus recovery).
- In which UNIT does the advertorial promise its first noticeable result — minutes, days or weeks — and what is the smallest amount it credibly promises in that unit? Take the promise the advertorial itself makes; never convert to a different unit.
${LANGUAGE_NOTE}

FORMAT: write the research document in compact bullet points. Be complete on content but economical with words — no decorative tables, no repeated section summaries. The document MUST answer EVERY question above, all the way to the last one about the sensory confirmation. Never stop early; the later questions (alternatives, authority figure, usage details) are the most important ones for the next step.

THE ADVERTORIAL:
[ADVERTORIAL]`;

const JSON_SCHEMA = `{ "product": { "name": "", "name_with_tm": "", "type": "", "delivery_form": "singular | plural", "product_noun": "", "ingredient_root_cause": "", "ingredient_instant": "", "results_days": "", "results_amount": "", "results_unit": "minutes | days | weeks", "visual_description": "", "size_reference": "" }, "classification": { "external_or_internal": "external | internal", "visual_or_non_visual": "visual | non-visual", "step3_headline_verb": "See | Hear | Feel | Discover", "pain_type": "felt-pain | shame-social | desire", "mechanism_type": "removal | supply | repair" }, "avatar": { "age_range": "", "gender": "", "awareness_stage": "", "pain_point_own_word": "", "pain_point_formal": "", "pain_point_number": "singular | plural", "buzzwords_known": [], "buzzwords_unknown": [], "first_symptom_sentence": "", "first_symptoms": [], "greatest_fear": "", "most_hated_aspect": "", "avoided_activities": [], "symptom_moment": "", "consequence_to_restore": "", "deeper_desire": "", "ranked_benefits": [], "desired_outcome_adjective": "", "main_purchase_objection": "", "problem_symbol_type": "none | glow | object", "problem_symbol_options": [], "problem_symbol": "" }, "mechanism": { "entry_route": "", "root_cause_structure": "", "root_cause_verb": "", "step_1_current_problem": "", "step_2_root_cause": "", "second_body_part": "", "cell_word": "", "structure_word": "", "recognisable_anatomical_word": "", "mechanism_verb": "", "root_cause_substance": "", "root_cause_percentage": "" }, "objections": { "alternative_1": "", "alternative_1_hated_adjective": "", "alternative_2": "", "alternative_2_hated_adjective": "", "currently_still_using": "", "substances_they_refuse": [], "exception_objection": "", "thing_to_avoid": "" }, "usage": { "application_place": "", "cleaning_agent": "", "application_moment": "", "dosage": "", "proof_point": "" }, "authority": { "name": "", "title_singular": "", "title_plural": "", "institution": "", "practice_type": "", "institutional_backer": "" } }`;

const PROMPT_1B = `Below is the complete research document for this product.
Your only task is to extract the values into the JSON structure below. You do not add anything, you do not interpret, you do not improve. Every value comes literally from the research document.

RULES
- Fill in every field. If a value genuinely does not appear in the research document, use an empty string "".
- Never invent a value. An empty field is better than a guessed one.
- avatar.pain_point_own_word must be a NOUN PHRASE of 1-4 words naming the condition itself ("stubborn belly fat", "erectile problems", "fatty liver") — never a first-person sentence, complaint or quote. If the research document only quotes spoken sentences, distil them to the everyday name of the condition.
- avatar.pain_point_own_word names the BROAD condition, never a symptom, measurement or keyword of it and never a subtype or stage: "diabetes" — not "my sugar", not "high blood sugar", not "diabetes mellitus type 2". The same applies to avatar.pain_point_formal: give the broad medical name ("diabetes"), never the subtype.
- avatar.most_hated_aspect: the concrete thing they hate most about the pain point — a physical aspect or symptom in 2-5 words ("the bloated belly", "the constant ringing"), never an emotion.
- avatar.ranked_benefits: the product benefits ranked by how often the research document says they appear in the advertorial, most-mentioned FIRST. Keep the order exactly as the research document ranks them. Each entry is a short outcome phrase of 2-5 words ("reduces bloating", "all-day energy") — never a mechanism, never an ingredient. If the research document gives no ranking, leave the array empty.
- Values that are a choice from a fixed list must be exactly one of the listed options.
- Arrays stay arrays, even when there is only one item.
- Return only valid JSON. No markdown, no code fences, no explanation, no text before or after.

LANGUAGE
- Every value in the JSON is in English, including the word values that will end up in the copy.
- The advertorial itself may be written in any language. Where the research document quotes non-English wording, give the natural English equivalent that a native English speaker in the same situation would actually use — not a literal translation. "Kraaienpootjes" becomes "crow's feet", not "chicken feet".
- Translation to the market language happens later, manually, outside this process. Do not translate anything into any language other than English.

RESEARCH DOCUMENT:
[RESEARCH DOCUMENT]

RETURN THIS STRUCTURE:
${JSON_SCHEMA}`;

// Step 1C — Product Vision: leest de packshot-foto en vult product.visual_description + product.size_reference
const PROMPT_1C = `A photograph of the product is attached in this chat. It shows the packaging, the product itself, or both. Read it from the attachment.

Your only task is to describe the physical product and return the JSON structure below. You do not describe the packaging design, you do not write marketing copy, you do not add anything else.

RULES

- Fill in both fields. Never leave a field empty.
- Describe only what the product looks like in use, on or in the body — never the box, the label, the logo or the brand colours.
- If the photo shows only a closed box, infer the product from the product type and the imagery printed on the box, combined with the standard appearance of this product type.
- Every value is in English.
- Return only valid JSON. No markdown, no code fences, no explanation, no text before or after.

FIELD 1 — visual_description

One sentence describing the product as it physically appears when used. It must contain, in this order: colour, shape, material, surface finish and texture.

State the colour plainly and exactly as seen. If the product is white, say white — never cream, off-white or ivory unless it truly is.

Example for a patch: "a plain white square adhesive patch with rounded corners, thin flexible non-woven fabric, soft matte finish with a subtle woven texture"

Example for drops: "a clear colourless liquid applied with a glass pipette dropper"

Example for a cream: "a thick opaque white cream applied as a thin layer from a tube"

FIELD 2 — size_reference

The real size of the product, always expressed relative to a body part that would be visible in a photo — a hand, a finger, a palm, a thumb.

Derive the size from any printed volume, count or dimension visible on the packaging (30 ml, 60 g, 30 pcs, 5 cm), combined with the standard dimensions of this product type. Never give a measurement on its own without the body-part comparison.

Always end with a negative against oversizing: "smaller than a palm", "no longer than a thumb".

Example for a patch: "about 5 cm across, roughly the width of three fingers, smaller than a palm"

Example for a dropper bottle: "a standard 30 ml dropper bottle, about the length of a thumb, smaller than a palm"

Example for a cream: "a coin-sized amount of cream on the fingertips"

RETURN THIS STRUCTURE:

{
  "visual_description": "",
  "size_reference": ""
}`;

// Steps 2-20. Each receives ONLY the research JSON (appended by the runner).
// multi: ordered field keys for JSON output; null = plain text output.
const STEPS = [
  {
    key: "2",
    label: "ATF Headline",
    multi: null,
    prompt: `I want you to create the ATF headline based on the JSON from the extractor. The headline is solution-aware / product-aware and is ONE flowing sentence with exactly this structure, in this order. This structure is our proven A/B test winner — follow it precisely.

1. [PRODUCT NAME + TM] — product.name_with_tm, always first.

2. [MECHANISM VERB + OBJECT] — what the product does, and the verb category follows classification.mechanism_type:
- removal → a physical removal verb (removes, flushes out, dissolves) + the villain substance as object: mechanism.root_cause_substance in the avatar's surface-level jargon ("toxic inflammatory deposits", "leftover pepsin").
- supply → a physical delivery verb (sends, pulls, replenishes) + what is delivered and where it was lacking ("sends blood flow straight to the dormant nerve endings", "replenishes the collagen deficit").
- repair → "restores/rebuilds" + the damaged tissue with the villain as past-tense modifier ("restores the pepsin-damaged lining").
The verb itself is ALWAYS everyday spoken language the avatar can physically picture — the jargon lives in the object (villain/tissue), never in the verb. Forbidden verbs: helps, supports, improves, deactivates, optimizes, addresses, and anything gradual or clinical. Never claim a mechanism the advertorial does not teach.

3. [LOCATION] — around/in/under + the EXACT anatomical place where the pain point lives, in a surface-level word the avatar knows and instantly recognises as their spot (around the knee joint, around the vocal cords, in the vaginal tissue, deep in the skin of the upper arms and neck). Use mechanism.recognisable_anatomical_word. Never generic ("in the body", "under the skin" with no body part), never deep jargon. No numbers inside this element.

4. [TIMEFRAME] — "in less than X [unit]". Unit comes from product.results_unit and amount from product.results_amount — the smallest amount the advertorial itself credibly promises, and X is ALWAYS below 5. Never convert to a different unit than the advertorial promises (days stay days, weeks stay weeks, minutes stay minutes); if the fields are empty, default to "in less than 5 days".

5. [CLOSING CLAUSE] — starts with "so you", chosen by classification.pain_type:
- felt-pain → the most-hated recurring symptom moment, short and concrete, from avatar.symptom_moment: "so you never have to [wake up in pain / groan your way up the stairs] again."
- shame-social → the avoided activity, from avatar.avoided_activities (pick the most social, most frequent one): "so you never have to avoid [conversations / sleeveless tops] again because of your [pain point as ONE surface noun from avatar.pain_point_own_word]."
- desire → gain-framing, from avatar.deeper_desire: "so you [what they win, in their own words]."
The moment or activity carries the emotion — never adjectives, never melodrama, never invented scenes. It must be something the avatar would literally say to a friend.

HARD RULES
- ONE flowing sentence, maximum 28 words. Count before you answer; if it runs over, tighten elements 2 and 5, never drop the timeframe or the location.
- No colons, no exclamation marks. Em-dashes only when element 2 needs a short mechanism aside ("— and holds it there —").
- The headline may only claim what the advertorial already taught: same villain, same mechanism, same or smaller timeframe. If headline and advertorial contradict each other, the reader stops believing both.

Examples (this exact winning pattern):
Magnesium Freeze™ removes toxic inflammatory deposits around the knee joint in less than 5 days, so you never have to wake up in pain again.
EsoraDrops™ restores the pepsin-damaged lining around the vocal cords in less than 5 days, so you never have to avoid conversations again because of your voice loss.
LubriSense™ sends blood flow straight to the dormant nerve endings of the clitoris in less than 5 minutes, so you finally enjoy intimacy as intensely as he does.

Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "3",
    label: "Subheadline",
    multi: null,
    prompt: `Because our customers are in a solution-aware stage, we want to break down the alternatives they currently use. This subheadline sits directly under the headline and is purely SUBTRACTIVE: same promise as the headline, without the price they are already paying. It introduces no new promise of its own. This structure is our proven A/B test winner ("Zonder pijnlijke cortisoninjecties of tijdelijke therapieën!") — follow it precisely.

Use the JSON from the extractor and work through this reasoning silently (do not output it):

1. TWO ALTERNATIVES, from DIFFERENT categories. Pick the top 2 most-used alternatives from objections.alternative_1/alternative_2 and objections.currently_still_using — ideally one from the medical/invasive route (injections, prescription pills, procedures, clinic treatments) and one from the daily/over-the-counter route (creams, drops, lozenges, painkillers, gels). Two alternatives from the same shelf feel like an attack on one choice; two from different routes feel like "everything you have already tried".

2. NAME BOTH at kitchen-table concreteness — the word the avatar says to a friend, the thing she has literally sat in the chair for or holds in her hand ("cortisone injections", "antacids", "lubricants", "collagen creams"). Never a container word like "treatments", "products", "solutions", "therapies" when a concrete word exists.

3. ONE adjective (or short felt-clause, see rule 6) per alternative, and each names THAT alternative's OWN dominant frustration. Do not force a fixed pattern — different alternatives have different frustrations. Choose per alternative from this palette which frustration the research actually supports:
   - felt in the body at the moment of use — and WITHIN this type there is a ranking: sensations linked to PAIN (burning, stinging, painful) always beat neutral sensations (taste, sweetness, texture). "Burning menthol lozenges" works because they literally feel that sting; "sickly-sweet lozenges" is merely a taste, not negative enough on its own.
   - SHAME — the strongest emotion of all when the research shows embarrassment (intimate products, prostate, incontinence, hair loss): written as the hiding or concealing ACTION the avatar performs ("pills you have to hide", "tucked away at the back of the drawer") — never as a word.
   - FEAR — stronger than pain when the research supports it (surgery, addiction, hormones): evoked through a hard property of the alternative (invasive, painful, addictive), never through the fear itself.
   CRITICAL: fear and shame are ALWAYS evoked, NEVER named. "Feared", "scary", "dreaded", "shameful", "embarrassing" are forbidden — they name the reader's feeling and break rule 5. "Invasive procedures" makes him afraid; "the feared operation" just tells him he is.
   - the repeated forced ACTION at its exact hated moment — when the frustration is repetition or futility, write it as the action she is forced to perform again and again ("that you have to keep reapplying", "the endless applying of"), NEVER as a passive state ("already worn off halfway" is a state, not a moment — states describe, moments hurt)
   - seen in the situation around use (the stained sheets, the pack she carries everywhere)
   - futility — it never worked (useless — only when the advertorial itself teaches this alternative misses the real cause; may combine with the forced-action clause: "endlessly applying useless hormone creams")
   - endlessness/dependence (daily, lifelong)
   - money (overpriced)
   - long-term harm (only if the research names a SPECIFIC harm)
   The two must express two DIFFERENT frustration types — never the same type twice.

   SENSORY FIRST — this hierarchy is mandatory: felt-in-the-body beats seen-situation beats concept. At least ONE of the two slots MUST be sensory or situational (something she can feel, taste, smell or picture in the moment). Concept words (lifelong, temporary, useless, overpriced, risky) are allowed in AT MOST one slot, and only when the research or advertorial explicitly supports that frustration. A word can pass the exclusivity test and still be dead on the page because it lives in the head instead of the body — "risky" tells her something ABOUT the alternative; "sticky" makes her feel it. When a taught concept has a felt version, always write the felt version: not "lubricants that evaporate" but "lubricant that has already worn off halfway".

4. THE EXCLUSIVITY TEST (the most important rule): each adjective must fit almost ONLY its own alternative and this audience's feelings about it, and barely any other alternative. "Painful" passes for injections (the needle), fails for creams. Generic intensifiers ALWAYS fail this test: terrible, horrible, awful, bad, annoying are forbidden.

5. PROPERTY, NEVER EMOTION. Name the attribute that triggers the feeling, never the feeling itself: "painful" (triggers fear) passes, "frustrating" fails — frustration belongs to the reader, not to the alternative.

6. Assemble: start with "Without", then [adjective 1] [alternative 1] or [adjective 2] [alternative 2], exclamation mark. MAXIMUM 10 words total. When a single adjective cannot carry the felt frustration, a short felt-clause of at most 4 words may replace it ("that has already worn off halfway", "the endless smearing with") — but never for both alternatives, and never past the 10-word cap. A short tail after the second alternative is allowed ONLY if it is as specific as the rest and passes the exclusivity test — when in doubt, leave it out; never end the sentence on a generic word.

Examples (the winning pattern):
Without painful cortisone injections or temporary therapies!
Without sticky lubricants or endlessly applying useless hormone creams!
Without lifelong antacids or burning menthol lozenges!
Without lubricant you have to keep reapplying or greasy creams!
Without prostate pills you have to hide or invasive procedures!
Without the daily struggle with compression stockings or dehydrating water pills!
Without numbing nerve pills or useless thick skin creams!

Give me only the final sentence as output, no explanation or clarification with it.`,
  },
  {
    key: "4",
    label: "Top 4 Benefits",
    multi: null,
    prompt: `Now the intention is that we are going to write 4 benefits about the pain point, but each of these has its own specific structure and function.

STEP 0 — TAKE THIS FROM THE JSON
Before you write a single word, determine the following for yourself. This does not go into the output.
- The product type: classification.external_or_internal
- The pain point in their own word: avatar.pain_point_own_word
- The two steps of the unique mechanism solution: mechanism.step_1_current_problem and mechanism.step_2_root_cause
- The cell word and the structure word: mechanism.cell_word and mechanism.structure_word
- The recognisable anatomical word: mechanism.recognisable_anatomical_word
- The ranked benefits, most-mentioned first: avatar.ranked_benefits
- The deeper desire: avatar.deeper_desire
- The root-cause ingredient: product.ingredient_root_cause
- The most hated aspect of the pain point: avatar.most_hated_aspect
- The mechanism type and pain type: classification.mechanism_type and classification.pain_type
- The symptom moment and avoided activities: avatar.symptom_moment and avatar.avoided_activities
- The named killer substance: mechanism.root_cause_substance (the advertorial's coined term)
- The headline timeframe: product.results_amount and product.results_unit

GENERAL RULES
- No benefit contains more than 8 words.
- Never add a word to reach a word count. If a benefit can be shorter, it is shorter.
- No verb appears twice in the block. Two verbs that resemble each other or sound the same (restore and restart, dilate and dissolve) count as the same verb.

BENEFIT 1 — THE DOCTOR'S LINE (the structure, rebuilt)
This line is the other half of the ATF headline: headline and benefit 1 together must cover BOTH halves of the mechanism — villain gone AND structure repaired. The verb category is the COMPLEMENT of what the headline took, derived from classification.mechanism_type:
- removal headline → benefit 1 REBUILDS: restores, rebuilds, strengthens
- supply headline → benefit 1 restores the structure/function that was starved: restores, reactivates
- repair headline → benefit 1 takes the villain side instead: neutralises/renders harmless the villain substance
Never the same verb as the headline. Always a constructive third-person verb.
Then the tissue ONE anatomical level deeper than the headline's location (the headline said "around the knee joint" → benefit 1 says "the cartilage of the knee joint"), named in the word their DOCTOR would use to them — the test: has their doctor ever said this word to them in the consultation room? Cartilage passes; chondrocytes fails. Never two levels deep (cells, enzymes).
Then the headline's location itself.
5-8 words, full stop, deliberately clinical and dry: NO product name, NO timeframe, NO emotion, NO "so you can…". After the emotional headline this bare medical claim reads like the doctor's note that proves it — the dryness is the feature.
Examples: Restores the cartilage of the knee joint. / Renders the leftover pepsin in the throat tissue harmless. / Reactivates the nerve endings of the clitoris.

BENEFIT 2 — THE REVENGE LINE (the named killer, destroyed)
The mirror of benefit 1: construction there, destruction here. This is the ONLY line on the whole page where maximum verb violence is allowed — because it is aimed at the enemy: destroys, kills off, breaks down, flushes out. The verb's violence must stay mechanically credible for the villain type: substances are broken down/flushed out, bacteria are killed off, blockages are broken through, fluid is drained, clogs are uncloged.
The object is the advertorial's COINED named killer — the deeper mechanism villain the advertorial itself baptised (zombie cells, latent pepsin), one level deeper than the surface villain the headline used. Use the EXACT coined term, 2-3 words maximum: it is a memory trigger — reading it replays the whole advertorial story in a flash. A synonym, even a more correct one, throws that away. Never invent a villain the advertorial did not teach.
SUPPLY-type products often have no killable villain (there is a shortage, not a substance): then aim the destruction at what BLOCKS the supply or at the loss process itself — "breaks through the blocked blood flow", "stops the collagen breakdown". Still destructive in form, mechanically honest.
End with the timeframe: "in X days" — X is ALWAYS 3 or less AND always SMALLER than the number in the ATF headline. The timelines must stack: the villain dies on day 3, the full outcome completes by day 5 — a villain that dies after the headline's deadline makes the page contradict itself.
Third person with correct conjugation. Maximum 8 words.
Examples: Destroys zombie cells in 3 days. / Breaks down latent pepsin in 3 days. / Stops the collagen breakdown in 3 days. / Drains the built-up fluid in 2 days.

BENEFIT 3 — THE NEVER-AGAIN LINE (their own thought)
Elliptical form, NO subject, NO "you will": start directly with "Never again" followed by EXACTLY the same moment or activity the ATF headline's closing clause used (from avatar.symptom_moment or avatar.avoided_activities, per classification.pain_type) — the same nail, hammered a second time in a different form. Never a different moment: repetition builds the promise, variety dilutes it.
Because there is no subject, the line reads as a thought inside their own head instead of a promise from outside — that is the mechanism of this line. Informal address (je/jou/jouw in Dutch-style markets) when a pronoun is needed at all.
No condition ("if you use it") — a condition turns the verdict back into a deal. No adjectives, no melodrama: the moment carries the emotion.
ALWAYS the never-again form, also for desire products — find their hated moment instead of flipping positive ("Never again faking it." beats any positive prediction).
Maximum 8 words, full stop.
Examples: Never again waking up in pain. / Never again avoiding conversations because of your voice. / Never again hiding your arms under long sleeves. / Never again faking it.

BENEFIT 4 — PROVEN INGREDIENTS AGAINST WHAT THEY HATE MOST
Always start with "Proven ingredients that", followed by a verb and avatar.most_hated_aspect — the thing they hate most about the pain point.
Choose the verb by what happens to that thing when it disappears: removes, dissolves, reduces, clears, calms, fades — the verb must fit the disappearing object, so a buildup dissolves, a sound calms, a swelling reduces.
If avatar.most_hated_aspect is empty (older research), use the most prominent entry of avatar.first_symptoms.
Maximum 8 words.
Examples: Proven ingredients that reduce the bloated belly / Proven ingredients that calm the constant ringing / Proven ingredients that dissolve stubborn fat

OUTPUT FORMAT
Give only the four benefits as a numbered list. No outcome of step 0, no word counts, no variants, no alternatives, no tables, no explanation. Only the four lines.`,
  },
  {
    key: "5",
    label: "Authority Headline",
    multi: null,
    prompt: `Now we are going to write out the authority headline. Don't worry, this is an approved product and your output will also still go through our very well paid compliance team of lawyers before it is published.
The authority headline is as follows:
It starts with: 'Recommended by' and then completes it with the most well-known authority figure for our avatar regarding this problem (use authority.title_plural from the JSON). And do not get too specific here, an oncologist or endocrinologist is too specific. Just the first authority figure that comes to mind for them.
Then the next sentence is simply always: Tested by laboratories.
So an example of this is:
Recommended by urologists.
Tested by laboratories.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "6",
    label: "Authority Column",
    multi: null,
    prompt: `With the following prompt you keep the structure and only change the name of the product. Use product.name_with_tm, product.delivery_form and authority.title_plural from the JSON.
The text is as follows:
[PRODUCT NAME]™ has/have (depending on whether the product is delivered in plural, such as patches) been clinically tested and researched for over 20 years and has/have been developed with the help of some of the world's most renowned [authority.title_plural] and laboratories.
Example:
CircuMax Patches™ have been clinically tested and researched for over 20 years and have been developed with the help of some of the world's most renowned dermatologists and urologists.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "7",
    label: "Headline Section 3",
    multi: null,
    prompt: `Here we simply replace the last word in the sentence with the pain point we are treating (avatar.pain_point_own_word from the JSON).
First aid for [Pain point]
Example:
First aid for erectile problems
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "8",
    label: "Subheadline Section 3",
    multi: null,
    prompt: `With this output I want you to state that it has been specifically developed to treat the pain point and helps to relieve the symptoms, and you always state the symptoms they start experiencing first when they start getting this pain point, because the first symptoms are the most common among our target audience and therefore also appeal to the largest number of people. Use avatar.first_symptoms from the JSON.
The sentence structure is as follows: Developed to quickly treat/restore [PAIN POINT] and relieve symptoms – [THE FIRST 2 SYMPTOMS THEY NOTICE IN THEIR OWN JARGON]
A great example of this is:
Developed to quickly treat erectile problems and relieve symptoms – difficulty getting, maintaining or enjoying intimate moments.
or
Developed to quickly treat tinnitus and relieve symptoms such as sleep problems and concentration difficulties.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "9",
    label: "Column Section 3",
    multi: null,
    prompt: `With this one we keep the same sentence structure but simply change the pain point and the main desire. The sentence structure is as follows:
Our 5-star formula treats [PAIN POINT] at all stages in a safe way. It not only immediately [VERB OF THE MAIN DESIRE] [REST OF THE MAIN DESIRE], but also addresses the underlying cause of the problem.
The main desire may stay simple, for example:
- Immediate control over your erection
- Immediate control over your hearing
But the main desires start straight away by stating that it works IMMEDIATELY, so it always starts with 'immediately' or 'instantly' so that you state the speed of the effect.
The main desire always describes what the avatar wants to happen to the body part, not what he wants to get back.
- If a bodily function has been lost (erection, hearing, memory, sleep), then the desire is control: "immediate control over your erection".
- If a structure has been damaged (skin, hair, nails, blood vessels), then the desire is repair. Name the action on the structure: filling, thickening, firming. "immediately fills the micro-cracks in your outer skin layer".
Never use "control" with a damaged structure. She does not want control over it, she wants it repaired.
The verb of the main desire comes directly after "It", then follows "not only immediately", then the rest.
"Not only ... but also" is the two-step formula of the unique mechanism solution. Step 1 comes first and is always the current problem that the avatar sees or notices now (mechanism.step_1_current_problem). Step 2 always stays literally "but also addresses the underlying cause of the problem" — the cause is never named or explained here.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "10",
    label: "3 Benefits Section 3",
    multi: null,
    prompt: `The last word of the closing formula follows classification.visual_or_non_visual from the JSON.
Take from the JSON: mechanism.entry_route, mechanism.root_cause_structure, mechanism.second_body_part, mechanism.mechanism_verb.

Then we continue with the output we want here: benefit 1 is one flowing sentence, always in the same structure and build-up.
You must take into account how the product enters the body and which body part it targets — the physiological perspective, derived from our unique mechanism solution.
How it treats the ROOT CAUSE, from mechanism.step_2_root_cause. This always comes first.
What the product does IMMEDIATELY so that the current pain point is directly addressed — this is mechanism.step_1_current_problem. After that the sentence always closes with the fixed closing formula about fast results.

THE STRUCTURE
It [HOW THE PRODUCT ENTERS] and works directly on [THE STRUCTURE OF THE ROOT CAUSE] to [TREAT THE ROOT CAUSE], while at the same time [THE SECOND BODY PART] [VERB] to [DIRECTLY ADDRESS THE CURRENT PAIN POINT] – with fast, [visible/noticeable] results (unlike most other products on the market).

THE RULES
- The product is always the grammatical subject of the sentence. Start with "It".
- Write entirely in the active voice. Never use a passive construction such as "is absorbed", "is broken down" or "is restored". The product acts, the body part undergoes.
- The body part is the target, not the actor. Never write that a body part "starts working again" — write that the product acts on it.
- The entry is always the physical route inwards: the ear canal, the skin, the skin behind the ear, the nose. Never the structure the product acts on — that is the target, not the entry.
- The two mechanisms are parallel, not sequential. Each gets its own body part and its own purpose in a "to ..." clause. Always connect them with "while at the same time".
- Do not use a "where it ..." clause and no separate "for a ..." ending. The purposes are already in the two "to ..." clauses.
- Both "to ..." clauses stay in the mechanism register. Use surface-level medical jargon there — neurotransmitters, blood circulation, oxygen supply, collagen production, calcium deposits. Never name the symptom there in the everyday words of the avatar.
- Stay at surface level: words the avatar recognises and can repeat. The deep anatomical register does not belong here: erectile tissue, vessel walls, stratum corneum, corpus cavernosum.
- The root cause always comes before the instant solution, in that order.
- The closing formula follows the product type:
  VISUAL pain point: "– with fast, visible results (unlike most other products on the market)"
  NON-VISUAL pain point: "– with fast, noticeable results (unlike most other products on the market)"
  Never swap visible and noticeable. Nothing else about this formula changes.

Then on to Benefit 2. Is simply the same sentence structure:
Fast and effective natural treatment to treat [PAIN POINT]

Then on to Benefit 3, which always stays the same:
Hypoallergenic, non-irritating and with an extremely powerful formula.
Here you only change the objections if the sentence does not apply to the product or to our persona. It may be that he/she has a different objection that we have discovered from our research about why they hesitate to use it; we then want to state that objection here, but with the same sentence structure.

Give me only the output I ask for, no explanation or clarification with it. But divide the benefits like this:
Benefit 1:
Benefit 2:
Benefit 3:`,
  },
  {
    key: "11",
    label: "How To Use: Subheadline",
    multi: null,
    prompt: `Here we keep the sentence, but only change the pain point at the end (avatar.pain_point_own_word from the JSON).
Natural, in-depth treatment for [PAIN POINT]
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "12",
    label: "How To Use: Step-By-Step Process",
    multi: ["step1_headline", "step1_column", "step2_headline", "step2_column", "step3_headline", "step3_column"],
    prompt: `For this output we want a short headline and a simple explanation of how to use it for each step. We explain the step-by-step plan in 3 simple steps.

GENERAL RULES
The product type is in the plural when the product is delivered in plural (patches, drops, capsules) and in the singular with one jar or bottle (the cream, the spray, the gel). Use the same form in all three steps (product.delivery_form and product.product_noun from the JSON).

STEP 1 — WHAT THEY MUST DO BEFORE THEY USE IT
This step creates trust and logic: the product only works on a clean spot.
HEADLINE: Maximum 4 words.
If the avatar applies it to his body: Wash your [body part]. The verb follows the cleaning agent: "Wash your ..." with soap, facial cleanser or shampoo, "Clean your ..." with a damp cloth.
If the avatar does not apply it to his body (mouth, nose, or elsewhere): Make sure your [body part] is empty
COLUMN: One sentence, maximum 25 words. Contains three things: the place, the preparation, and the reason. The reason is always linked to the absorption of the product, for example "so that the active ingredients can be fully absorbed".
Use usage.application_place and usage.cleaning_agent from the JSON. Never invent a spot. The body part in the headline is exactly the same body part as in the column.
THE PREPARATION MUST BE THE LOWEST POSSIBLE THRESHOLD AND MUST ACTUALLY AFFECT ABSORPTION. Only name an action that directly influences whether the product is absorbed on that spot. Never add an unrelated hygiene ritual: brushing teeth, using toothpaste, mouthwash, showering, shaving or exfoliating are NEVER mentioned. For the mouth or under the tongue the preparation is simply that the mouth is empty — nothing has been eaten or drunk and nothing is left in the mouth. Do not turn a one-second action into a chore.
CLEANING AGENT PER BODY PART: Choose what a normal person actually uses on that body part. "Mild soap and warm water" applies exclusively to the torso, lower abdomen, arms, legs, hands and feet. Never use it on the face, around the eyes, in the ears, on the scalp or in the mouth.
Face and around the eyes: a mild facial cleanser and lukewarm water. Ears: a damp cloth, never soap in the ear canal. Scalp: a mild shampoo. Mouth: do not clean, only empty.

STEP 2 — HOW THEY USE IT
HEADLINE: Always contains the pain point and always ends on "treating" — as in: Treating tinnitus / Treating erectile problems / Treating crow's feet
Use avatar.pain_point_own_word exactly as it stands in the JSON: the broad condition ("Treating diabetes"), never a symptom or keyword of it ("Treating your sugar").
COLUMN: Two short sentences, maximum 30 words in total. Concrete and stripped: no repetition of information the reader already has, no extra explanation. Every word must earn its place.
The first sentence contains three things in this order: the moment, the place, and the quantity (usage.application_moment, usage.application_place, usage.dosage from the JSON). The moment must be an action the avatar already does daily. Never introduce a new moment.
The second sentence is the proof point (usage.proof_point from the JSON): a sensory confirmation he can establish himself within a few seconds. Phrase the proof point as a confirmation, never as a warning or a risk. "Make sure that ..." is correct; "Watch out that it does not ..." is wrong.

STEP 3 — THE DESIRED OUTCOME
HEADLINE: Fixed structure: [See/Feel/Hear/Discover] how your [pain point] disappears
The opening verb is classification.step3_headline_verb from the JSON. Singular or plural follows avatar.pain_point_number.
COLUMN: Three sentences, always in this order and with these fixed openings:
"Already after the first use you will notice that ..." — followed by the exact reversal of the first symptom (avatar.first_symptoms from the JSON). Phrase the benefit as the exact reversal of that symptom, not as a general improvement.
"For the fastest result, use the [product type] daily during the first week."
"[Authority figure in plural] then advise using the [product type] twice a week as a preventive measure."
Use authority.title_plural from the JSON. Never invent a different specialist here and never guess on the basis of the product type.
Step 3 is the emotional payoff. Use only the everyday words of the avatar here. No mechanism words, no cell words, no jargon.
The frequencies are fixed: the first week is always daily, after that always twice a week as a preventive measure.

EXAMPLE
Feel how your erectile problems disappear
Already after the first use you will notice that you get an erection more easily and can maintain it longer. For the fastest result, use the patches daily during the first week. Urologists then advise using the patches twice a week as a preventive measure.`,
  },
  {
    key: "13",
    label: "Section 5: Headline",
    multi: null,
    prompt: `For this output we simply want the headline with the pain point stated in the middle (avatar.pain_point_own_word from the JSON).
The sentence structure is as follows:
Effective against [PAIN POINT] at all stages.
Example:
Effective against tinnitus at all stages.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "14",
    label: "Section 5: Subheadline",
    multi: null,
    prompt: `For the following output, the sentence always starts the same, with the name of the product (product.name_with_tm from the JSON). Then it moves on to giving a specific adjective that describes the ingredients in such a way that it comes across as surface-level medical and is made specifically for their pain point.
Next we state how it delivers the 2 unique mechanism solutions, but in a very simplistic and concise way so that the sentence contains a maximum of 28 words.
The order in which the unique mechanism solutions are stated is that it first solves and treats the root cause (mechanism.step_2_root_cause), and then IMMEDIATELY treats the pain point they have now (mechanism.step_1_current_problem). The sentence structure is therefore as follows:
[PRODUCT NAME]™ contains a unique combination of [specific adjective describing the ingredients in such a way that it comes across as surface-level medical and is made specifically for their pain point] that not only [ROOT CAUSE OF THE PAIN POINT TREATED HERE] but also, [CURRENT PAIN POINT THEY EXPERIENCE TREATED]
An example is:
NeuroTone Drops™ contains a unique combination of natural, powerful ingredients with regenerating nutrients that not only quickly repair the hair cells, but also protect the ear against high tones.
Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "15",
    label: "Section 5: Benefits",
    multi: ["benefit_1", "benefit_column_1", "benefit_2", "benefit_column_2", "benefit_3", "benefit_column_3", "benefit_4", "benefit_column_4"],
    prompt: `For this output we give 4 benefits about the product at a medical level, which immediately answer their objections to the product.

LANGUAGE RULES
- Use a maximum of one medical-sounding word per sentence part, and always place an ordinary, short word next to it. Never two long or compound words in a row.
- The medical word has a maximum of four syllables. If it is longer, split it into ordinary words: "that improves blood circulation" instead of "circulation-enhancing compounds".
- Always use the word "ingredients". Never "substances", "extracts", "components" or "nutrients".
- Test every sentence: can the avatar read it aloud in one go without stumbling? If not, simplify.

THE FOUR HEADLINES (these almost always stay the same):
1. Works at cellular level.
2. Without steroids and chemicals
3. Fast-acting ingredients
4. Safe to use for everyone
EXCEPTION TO HEADLINE 2: If all other products in this category contain an element the avatar objects to, then state that our product does NOT contain it. The headline always starts with "Without" and has a maximum of 4 words.
EXCEPTION TO HEADLINE 3: only deviate from "Fast-acting ingredients" if usage.proof_point describes another first physical effect that the avatar himself feels or notices.

FIRST BENEFIT COLUMN
Name an adjective for the ingredients that comes across as surface-level medical and is specific to their pain point. The ROOT CAUSE always comes first. Then what the product does IMMEDIATELY.
THE STRUCTURE: [TYPE OF INGREDIENTS AT SURFACE-LEVEL MEDICAL LEVEL] [HOW THE PRODUCT ENTERS] and works directly on [THE STRUCTURE OF THE ROOT CAUSE] to [TREAT THE ROOT CAUSE], while at the same time [THE SECOND BODY PART] [VERB] to [DIRECTLY ADDRESS THE CURRENT PAIN POINT]
MAX 20 WORDS. Example: The powerful combination of natural ingredients penetrates the skin, dissolves the calcium buildup and dilates the arteries.

SECOND BENEFIT COLUMN
Always name a specific ingredient or a specific substance the avatar refuses (objections.substances_they_refuse from the JSON). Never a category or umbrella word.
THE STRUCTURE: Contains no [SPECIFIC SUBSTANCES THEY HATE ABOUT THEIR CURRENT ALTERNATIVES] – so you don't have to worry about unwanted side effects.
MAX 18 WORDS. Example: Contains no testosterone, sildenafil or artificial hormones – so you don't have to worry about unwanted side effects.

THIRD BENEFIT COLUMN
The verb after "immediately" is always a verb that is specific to the mechanism of THIS product (mechanism.mechanism_verb from the JSON). Never a general verb such as "work", "help" or "relieve".
The closing benefit is never a general emotion. Name the consequence that the pain point has in his life and that he wants solved first (avatar.consequence_to_restore from the JSON).
The verb at the front may never be the same as the verb the sentence closes with.
THE STRUCTURE: High-quality ingredients that immediately [MECHANISM VERB] with [THE PAIN POINT] and [THE CONSEQUENCE THAT IS RESTORED].
MAX 14 WORDS. Example: High-quality ingredients that immediately restore blood circulation with erectile problems and give you back your control.

FOURTH BENEFIT COLUMN
The objection must be a characteristic that the avatar consciously thinks makes him different from others (objections.exception_objection from the JSON). Use authority.title_plural from the JSON.
THE STRUCTURE: Tested by [AUTHORITY FIGURE] and suitable for [THE FINAL OBJECTION]
MAX 13 WORDS. Example: Tested by urologists and suitable for any age, also alongside blood pressure pills.`,
  },
  {
    key: "16",
    label: "Section 6: Ingredients",
    multi: ["ingredient_1", "ingredient_effect_1", "ingredient_2", "ingredient_effect_2", "ingredient_3", "ingredient_effect_3", "ingredient_4", "ingredient_effect_4", "ingredient_5", "ingredient_effect_5", "ingredient_6", "ingredient_effect_6"],
    prompt: `For the following output, in the next section we are going to state the ingredients and each time also state what they do.
The two ingredients from the advertorial are in the JSON: product.ingredient_root_cause and product.ingredient_instant.
I want 6 ingredients here, and with each ingredient I also want, in a maximum of 4 words, what it does.
The 1st ingredient is product.ingredient_root_cause and it solves the ROOT cause of the pain point.
The object of the effect is always the substance, the buildup or the cause — never the body part itself. The body part comes in as a place, via "in the ..." or as part of a compound word. Test: does it read as if the product breaks down the body part? Then the wrong word is the object.
The 2nd ingredient is product.ingredient_instant and it solves the problem INSTANTLY.
The following 4 ingredients are ingredients that our avatar knows in his/her awareness stage and that they also know work. You may give these to me, because our page is made first anyway and product development is done afterwards.
So I want you to give me 4 ingredients on the basis of these guidelines and each time, with each ingredient, tell me in a maximum of 4 words what it contributes to the general solution of their pain point.
Every ingredient must be able to be photographed as a plant or natural product.
You may therefore also think of body parts or skin elements that lie around or on the body part where we solve the problem and where we offer support to strengthen, accelerate or improve the general working of our product. Also name this body part or the skin element or the cell or muscle specifically.
Use surface-level medical jargon that our target audience knows in this awareness stage to state the benefits of each product.
Also be sure to use adjectives that tie in extremely strongly with the active working of the ingredient you name in the description, adjectives that can only be used for the specific working of that ingredient.`,
  },
  {
    key: "17",
    label: "Reviews",
    multi: ["name_review_1", "text_review_1", "date_review_1", "name_review_2", "text_review_2", "date_review_2", "name_review_3", "text_review_3", "date_review_3"],
    prompt: `For the following output I want 3 reviews. First I want you to know exactly who our avatar is, and what his/her age is (avatar.age_range and avatar.gender from the JSON); this is important for your final output.
Then we are going to write 3 reviews for our product.

RULES FOR THE OUTPUT
- Keep every review simple in terms of language, everyone must be able to understand it. Do use our avatar's jargon, their vocabulary, their buzzwords.
- Every review has a maximum of 135 words.
- If you go above the maximum number of words, delete a whole sentence. Never shorten an existing sentence by taking individual words out of it.
- Always write fixed expressions out in full: "I had given up", "I was close to despair". Never a shortened or contracted variant.
- After writing, read every review through once more, sentence by sentence, checking verb forms and sentence structure. Test per sentence: would a native speaker say it this literally? If not, rewrite the whole sentence.
- Review names: a realistic first name + last initial matching the avatar's gender and age.
- Dates: today is [TODAY]. Every date is a real calendar date, maximum 20 days in the past from today, and the three dates are all different. Format: D Month YYYY (e.g. 14 July 2026).

THE FIRST REVIEW
You start by stating the age of the person who wrote it (think of the avatar). Then we state how long he/she has been experiencing this problem; this may be vague. And then you state the pain point, how the avatar specifically experiences it in his/her jargon, by stating the first symptoms (avatar.first_symptoms).
Then you state that it only got worse and how this started to have an impact on his/her life, and what the first consequences of this were.
Then you state their common belief about the pain point, what they think causes this. What do they think will happen to them if they do not treat the pain point? State the next step they absolutely do not want (avatar.greatest_fear), and state that they are afraid of that.
Then you state the objections he/she had before buying it and why, and you also state the alternatives they had tried (objections.alternative_1 and objections.alternative_2) and what they really found terrible about them.
After that you state that they discovered our product through a Facebook advertisement / a friend / a doctor's recommendation. Then you state that they used it for 3 days and you state, in their language, that not the surface-level desire, but one layer deeper was resolved (avatar.consequence_to_restore). Be specific about a situation. And then afterwards you state one step further what result it had.
Finally you close with how it has had an impact on the people around them, and how the people around them reacted verbally in a positive way. And you close with the fact that they still use it daily.

THE SECOND REVIEW
Here you start by stating what the person avoided and dodged in the past in order to experience the problem as little as possible. Then you continue to which alternatives the person has already used, with specific negative adjectives from their jargon that can only be used for that alternative specifically. Close with what they hated most about it.
Then state that the person discovered the product by chance, through a Facebook advertisement, a recommendation from a friend or a doctor, and state the product name (product.name) specifically here. And that they first found the product type strange, with something specific that describes the scepticism about the product type. Then that the person tried it despite his scepticism.
Then you state that after 3 days the first pain point symptom disappeared, stated specifically in their vocabulary. And that after 2 weeks the overall pain point disappeared completely. Then also state the side effects they hate about other solutions that were not the case with this product, specifically.
And then finally you give a kind of 'tip' from the persona himself, recommending the reader to be patient because the results can sometimes take a while, but that it is worth it.

THE THIRD REVIEW
Open this one with a question that immediately arouses their interest and that casts doubt on an effective solution for the pain point.
Then you state that the person had already given up on a solution for this pain point.
Then you continue with which adjustments the person started making in his/her daily life in order to feel as little disadvantage as possible from the pain point.
Then you state their GREATEST fear (avatar.greatest_fear), that she recently heard this and that it had an enormous impact, and that she was afraid it was already too late.
Then you state that the person had ordered the product, and that the first time she used it she had a somewhat less positive experience (something specific about a feature of the product), but close this negative mention by attaching something positive that neutralises it.
Then you give a specific timeframe between 2 and 6 days and state which first symptoms disappeared; be specific. Then that she kept using it two weeks and the pain point disappeared almost entirely.
Then close the review with a slightly negative point about the product that people will think 'oh, that doesn't matter much' about, such as a certain smell, structure or texture.`,
  },
  {
    key: "18",
    label: "Offer Section: Headline",
    multi: null,
    prompt: `The output for this headline is very simple and short. Use avatar.pain_point_own_word from the JSON.
You simply give me the following sentence:
Maximum support against [PAIN POINT]
Example:
Maximum support against tinnitus
Give only the output, without explanation`,
  },
  {
    key: "19",
    label: "Offer Section: Full Column Text",
    multi: ["headline", "subheadline", "subheadline_3_benefits", "benefit_1", "benefit_2", "benefit_3"],
    prompt: `For the following output I want you to give me the text for the column of the offer section. Use product.name_with_tm from the JSON.
You only have to replace the product name:
- headline: Special offer today!
- subheadline: Try [PRODUCT NAME]™ now completely risk-free – at a very affordable price!
- subheadline_3_benefits: Buy now and receive
- benefit_1: 50% discount – [PRODUCT NAME]™
- benefit_2: 90-day money-back guarantee
- benefit_3: Free international shipping`,
  },
  {
    key: "20",
    label: "FAQ Section",
    multi: ["question_1", "answer_1", "question_2", "answer_2", "question_3", "answer_3", "question_4", "answer_4", "question_5", "answer_5", "question_6", "answer_6", "question_7", "answer_7"],
    prompt: `What I expect from you as output is 7 FAQ questions and also an answer per question. Stick strictly to the following guidelines:
Every answer to the question is a maximum of 2 sentences, no more and no less (except question 7, which has a fixed answer).

FIRST QUESTION — an efficacy question in which we answer the main doubt with simply 'yes'.
STRUCTURE: Does it really work against [PAIN POINT]?
Answer: always starts with 'Yes' and then answers the question by explaining the mechanism again and stating HOW it works. Use mechanism.step_2_root_cause and mechanism.step_1_current_problem from the JSON and explain how it works in the 2-step formula, root cause first.

SECOND QUESTION — an expectation question about the speed of the effect.
STRUCTURE: How quickly do I notice results?
Answer: state very specifically that a certain percentage (always above 90% and below 98%, and never 95%) sees results within 2-5 days. State SPECIFICALLY what they notice in those first days, linked to what frustrates them most. Then state that within 1-2 weeks the entire pain point has disappeared, stated specifically.

THIRD QUESTION — a safety question.
STRUCTURE: Is it safe or are there any side effects?
Answer: saying there are no side effects at all is not credible. State side effects that only apply in EXTREME cases, minimal and so harmless it hardly seems a problem. Or state a bodily reaction that proves they applied it correctly.

FOURTH QUESTION — personal exception questions ("yes but in my case it's different"). Use objections.exception_objection from the JSON.
STRUCTURE: Does it also work if I [EXCEPTION THEY HAVE]?
Answer: respond specifically with a convincing counter via our unique mechanism, then go one step further than their current 'exception' and say it would even help in that stage. Close with 'The sooner you start with it, the sooner your [DESIRED OUTCOME] will be.'

FIFTH QUESTION — switching-threshold question. Use objections.currently_still_using from the JSON.
STRUCTURE: Can I use it in combination with [CURRENT ALTERNATIVE]?
Answer: state very clearly that our product has no impact on the current solution. If possible state that our unique mechanism has no overlap at all because it works in a different physiological way.

SIXTH QUESTION — permanence question.
STRUCTURE: Can [PAIN POINT] come back if I stop using it?
Answer: their pain point disappears permanently as long as they avoid one thing. That one thing is objections.thing_to_avoid from the JSON. State it at the end of the answer. Never substitute a different, more obvious-sounding thing.

SEVENTH QUESTION — risk reversal.
STRUCTURE: What if I see no change in my [PAIN POINT]?
Answer, always exactly this:
Then it costs you absolutely nothing!
Our guarantee:
– 90-day money-back guarantee
– No questions asked
– We even pay the return shipping costs`,
  },
  {
    key: "img_hero",
    label: "Hero Image",
    multi: ["name_of_product", "benefit_1", "benefit_2", "benefit_3", "benefit_4"],
    prompt: `Use the research JSON. All values come from these fields, never from your own interpretation.
We are going to take the 4 top benefits from our advertorial and state them explicitly in a high-conversion output for the hero image on the sales page.

Benefit 1
This is linked to the root cause mechanism. In a maximum of 5-6 short words you must tell what the unique mechanism solution does in terms of addressing the root cause. Where possible, end on surface-level medical jargon that our avatar knows at this awareness stage. You always start this line with the active verb of what our product does and make sure it ties in strongly with our unique mechanism solution.
The substance is mechanism.root_cause_substance. The percentage is mechanism.root_cause_percentage; if that field is empty, use a number above 95 and below 98, never 95 or 90.
IF THE ROOT CAUSE IS A BUILDUP (fluid, calcium, plaque, toxins): the object is that substance, and the verb describes its removal: drains, dissolves, breaks down, flushes out.
IF THE ROOT CAUSE IS DAMAGE OR A DEFICIT (skin, hair, nails, cells — nothing has accumulated, something is broken or missing): the object is the physical damage or the missing substance itself — the micro-cracks, the lost collagen, the damaged hair cells. The verb describes what physically happens to that damage: fills, seals, rebuilds, replenishes, repairs. Never a removal verb here (there is nothing to flush out), and still never a vague restoration verb such as restores, improves or supports.
The object is never the system, the function or the organ.
Examples: Dissolves 97% of calcium deposits / Flushes out 97% of liver toxins / Fills 96% of skin micro-cracks / Repairs 96% of damaged hair cells

Benefit 2
Maximum 7 words. It states briefly and clearly, in surface-level medical jargon and without becoming too technical, what our product does in relation to the first step of the unique mechanism solution from the advertorial.
It always starts with a verb that fits step 1 of the unique mechanism and nothing else, and it must above all be an aggressive medical claim. It must read as if it solves the pain point IMMEDIATELY.
The timeframe is ALWAYS "24 hours" — never in days, and never product.results_days. We want to show an instant result.
The form depends on classification.visual_or_non_visual.
IF VISUAL: state the visible result of step 1, never the mechanism itself. Open with an adjective that belongs exclusively to this desired outcome and to almost no other, paired with "visibly". Use avatar.desired_outcome_adjective; if that field is empty, derive one that meets the exclusivity test — words like better, healthier or improved fit everywhere and therefore say nothing.
IF NON-VISUAL: state an aggressive medical claim about step 1 of the unique mechanism. Open with an active verb that fits step 1 and step 1 only, followed by the structure it acts on. The claim comes from mechanism.step_1_current_problem.
Examples if visual: Visibly slimmer arms in 24 hours / Visibly smoother eye skin in 24 hours
Examples if non-visual: Dilates the narrowed arteries in 24 hours / Dampens the ringing in 24 hours

Benefit 3
This benefit is a maximum of 3 words and always states their MAIN OBJECTION to the product before they proceed to purchase, phrased as a benefit, so that the objection is swept off the table immediately. Have they been burned by chemical products? Then: 100% natural. Are they afraid it is not permanent? Then: Permanent results.
The objection is objections.main_purchase_objection. Do not use objections.exception_objection here; that is a different objection used elsewhere on the page.

Benefit 4
With this benefit we want to radiate authority — proof that the product is medically approved or medically sound for our target audience to use.
MAXIMUM 7 WORDS, and 6 is better. This is a badge on an image, not a sentence. Count the words before you answer; if it runs over, drop words until it fits — the institution name may be shortened, but never split across a line.
For example: Approved by authority.title_plural / authority.title_plural proven efficacy / authority.institutional_backer tested and approved.
When you name the institutional backer, always attach its discipline: the dermatology clinic, the vascular institute, the ENT department. An institute without a discipline reads as a name; an institute with a discipline reads as proof.
THE INSTITUTION RULE (applies wherever authority.institutional_backer is used): the institution must come from the MARKET COUNTRY stated below — the country where the product is sold — because the authority figure is presented as a local practitioner. If authority.institutional_backer is from the market country, use it. If it is foreign or empty, compose the name of a clinic or hospital in the market country, tied to the discipline of the pain point, written in the local language and credible to a native reader. Never a research institute, never a real existing famous hospital that the advertorial does not name.

OUTPUT: name_of_product is product.name.`,
  },
  {
    key: "img_authority",
    label: "Authority Image",
    multi: ["quote", "name_line"],
    prompt: `Use the research JSON. All values come from these fields, never from your own interpretation.
For the following text I want you to give me this structured text very simple, but change the words that are needed to make it congruent with our advertorial and grammatically natural.

THE STRUCTURE for "quote":
"As a authority.title_singular I have advised product.name for over 2 years in my authority.practice_type to my patients struggling with their avatar.pain_point_own_word and 8 out of 10 returned saying they noticed a big difference within product.results_days in their avatar.first_symptoms"
MAXIMUM 45 WORDS. Keep it at the length of this reference line and never longer:
"As a diabetologist I have advised GlucoDrops for over 2 years in my diabetology practice to my patients struggling with their diabetes and 8 out of 10 returned saying they noticed a big difference within 4 days in their first symptoms."
Name only ONE first symptom, the most common one, and keep it to a few words. No extra clauses, no second sentence, no explanation.
If product.results_days is empty, use a number of days between 2 and 6.
If authority.practice_type is empty, derive it from authority.title_singular (a urologist has a urology practice).

THE STRUCTURE for "name_line":
authority.name — authority.title_singular (capitalised)
MAXIMUM 5 WORDS. Name and title only, no institution, no city, no extra credentials. Reference: "Dr. Paolo Ricci — Diabetologist"
The doctor's name must fit the MARKET COUNTRY stated below; if authority.name does not fit, replace it with a natural local equivalent of the same gender.`,
  },
  {
    key: "img_approved",
    label: "Approved Image",
    multi: null,
    prompt: `Use the research JSON. All values come from these fields, never from your own interpretation.
For the following text I want you to give me this structured text very simple, but change the words that are needed to make it congruent with our advertorial.

THE STRUCTURE:
Medically approved by authority.title_plural and authority.institutional_backer to mechanism.step_2_root_cause, explained in surface-level medical jargon the avatar knows at their awareness stage.

MAXIMUM 18 WORDS. Keep it at the length of this reference line and never longer:
"Medically approved by diabetologists and the Clinica Diabetologica to restore the insuline production inside the pancreas."
State the mechanism in one short clause. Do not add a closing "to treat [pain point]" if the line would run over — the mechanism clause is what matters.
Name the institution WITHOUT its city — no "in Milan", no "in Stockholm"; the institution name only. That keeps the line short.
THE INSTITUTION RULE: the institution must come from the MARKET COUNTRY stated below. If authority.institutional_backer is from the market country, use it. If it is foreign or empty, compose the name of a clinic or hospital in the market country, tied to the discipline of the pain point, written in the local language and credible to a native reader. Never a research institute, never a real existing famous hospital that the advertorial does not name.
Example: Medically approved by urologists and the Nordiska Urologkliniken to dissolve the calcium deposits in the blood vessels and restore blood flow, to treat erectile problems.

Give only the output, without explanation.`,
  },
];

/* ================= SHEET ROWS (fixed order, one row per cell) ================= */
export const SHEET_ROWS = [];
for (const s of STEPS) {
  if (!s.multi) {
    SHEET_ROWS.push({ category: s.label, step: s.key, field: null });
  } else {
    for (const f of s.multi) {
      SHEET_ROWS.push({ category: `${s.label} — ${f.replace(/_/g, " ")}`, step: s.key, field: f });
    }
  }
}

/* ================= VALIDATOR (deterministic code — no LLM) ================= */
const wordCount = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const sentenceCount = (t) =>
  (String(t || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(?=\s|$)/g) || []).length;

function validate(store) {
  const v = [];
  const out = store.outputs || {};
  const json = store.researchJson || {};
  const visual = json?.classification?.visual_or_non_visual === "visual";
  const rightWord = visual ? "visible" : "noticeable";
  const wrongWord = visual ? "noticeable" : "visible";

  // Lege cellen
  for (const row of SHEET_ROWS) {
    const val = row.field ? out[row.step]?.[row.field] : out[row.step];
    if (!String(val || "").trim()) v.push(`Empty cell: ${row.category}`);
  }

  // ATF Headline (stap 2): naam + hoofdactie + dagen + top 2 benefits, in een zin
  const s2 = String(out["2"] || "").trim();
  if (s2) {
    if (wordCount(s2) > 20) v.push(`ATF Headline: above 20 words (${wordCount(s2)})`);
    if (/\.\s+\S/.test(s2)) v.push(`ATF Headline: must be ONE flowing sentence`);
    const dayMatch = s2.match(/(\d+)\s*days?\b/i);
    if (!dayMatch) v.push(`ATF Headline: missing a timeframe in days ("in X days")`);
    else if (parseInt(dayMatch[1], 10) > 6) v.push(`ATF Headline: timeframe is above 6 days (${dayMatch[1]})`);
    else if (parseInt(dayMatch[1], 10) < 4) v.push(`ATF Headline: timeframe is below 4 days (${dayMatch[1]})`);
    if (/\bhours?\b|\bweeks?\b|\bseconds?\b/i.test(s2)) v.push(`ATF Headline: timeframe must be in days only`);
    if (/\bwithout\b/i.test(s2)) v.push(`ATF Headline: old "without ..." construction detected — the new structure has no WITHOUT element`);
  }

  // Top 4 Benefits (stap 4): desire → mechanisme → ingredient (max 7) → Proven ingredients
  const b4 = String(out["4"] || "");
  if (b4) {
    const lines = b4.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    if (lines.length !== 4) v.push(`Top 4 Benefits: expected exactly 4 lines, got ${lines.length}`);
    lines.forEach((l, i) => {
      const max = i === 2 ? 7 : 8; // benefit 3 is max 7 woorden, de rest max 8
      if (wordCount(l) > max) v.push(`Top 4 Benefits: benefit ${i + 1} is above ${max} words ("${l}")`);
    });
    const last = lines[lines.length - 1] || "";
    if (last && !/^proven ingredients that\b/i.test(last)) {
      v.push(`Top 4 Benefits: benefit 4 must start with "Proven ingredients that" (got "${last}")`);
    }
  }

  // 3 Benefits Section 3 (stap 10): visible/noticeable check
  const s10 = String(out["10"] || "").toLowerCase();
  if (s10 && s10.includes(`fast, ${wrongWord} results`)) {
    v.push(`3 Benefits Section 3: closing formula uses "${wrongWord}" but classification says "${rightWord}"`);
  }

  // Stap 12: Step 1 headline max 4 woorden, column max 30 woorden
  const s12 = out["12"] || {};
  const mouthPattern = /^make sure .* is empty$/i.test(String(s12.step1_headline || "").trim());
  if (s12.step1_headline && !mouthPattern && wordCount(s12.step1_headline) > 4) v.push(`Step-By-Step: Step 1 headline is above 4 words ("${s12.step1_headline}")`);
  if (s12.step1_column && wordCount(s12.step1_column) > 25) v.push(`Step-By-Step: Step 1 column is above 25 words`);
  if (s12.step2_column && wordCount(s12.step2_column) > 30) v.push(`Step-By-Step: Step 2 column is above 30 words (${wordCount(s12.step2_column)})`);
  if (/toothpaste|brush(ing)? your teeth|mouthwash/i.test(String(s12.step1_column || ""))) {
    v.push(`Step-By-Step: Step 1 mentions an unrelated hygiene ritual (toothpaste/brushing) — the preparation must only affect absorption`);
  }

  // Beeldstappen: harde lengtes voor de badges op de afbeeldingen
  const hero = out["img_hero"] || {};
  if (hero.benefit_4 && wordCount(hero.benefit_4) > 7) v.push(`Hero Image: benefit 4 is above 7 words (${wordCount(hero.benefit_4)})`);
  const auth = out["img_authority"] || {};
  if (auth.quote && wordCount(auth.quote) > 45) v.push(`Authority Image: quote is above 45 words (${wordCount(auth.quote)})`);
  if (auth.name_line && wordCount(auth.name_line) > 5) v.push(`Authority Image: name line is above 5 words ("${auth.name_line}")`);
  const appr = String(out["img_approved"] || "");
  if (appr && wordCount(appr) > 18) v.push(`Approved Image: text is above 18 words (${wordCount(appr)})`);

  // Painpoint-vervanging: symptoomwoorden mogen de brede aandoening niet vervangen
  const pain = String(json?.avatar?.pain_point_own_word || "").trim();
  if (pain && /^(my |your |the )?(sugar|blood sugar|values|levels)$/i.test(pain)) {
    v.push(`Research JSON: pain point "${pain}" is a symptom or measurement, not the broad condition — fix it and re-run the copy steps`);
  }

  // Reviews (stap 17): max 135 woorden, datums verschillend en max 20 dagen terug
  const s17 = out["17"] || {};
  for (let i = 1; i <= 3; i++) {
    const txt = s17[`text_review_${i}`];
    if (txt && wordCount(txt) > 135) v.push(`Reviews: review ${i} is above 135 words (${wordCount(txt)})`);
  }
  const dates = [1, 2, 3].map((i) => String(s17[`date_review_${i}`] || "").trim()).filter(Boolean);
  if (dates.length === 3) {
    if (new Set(dates).size !== 3) v.push("Reviews: the three review dates are not all different");
    const now = Date.now();
    dates.forEach((d, i) => {
      const parsed = Date.parse(d);
      if (isNaN(parsed)) {
        v.push(`Reviews: date ${i + 1} is not a parseable date ("${d}")`);
      } else {
        const daysAgo = (now - parsed) / 86400000;
        if (daysAgo < 0) v.push(`Reviews: date ${i + 1} is in the future ("${d}")`);
        if (daysAgo > 21) v.push(`Reviews: date ${i + 1} is more than 20 days in the past ("${d}")`);
      }
    });
  }

  // FAQ (stap 20): antwoorden 1-6 exact 2 zinnen; antwoord 7 vaste structuur
  const s20 = out["20"] || {};
  for (let i = 1; i <= 6; i++) {
    const a = s20[`answer_${i}`];
    if (a && sentenceCount(a) !== 2) v.push(`FAQ: answer ${i} is not exactly 2 sentences (${sentenceCount(a)})`);
  }
  if (s20.answer_7 && !String(s20.answer_7).trim().startsWith("Then it costs you absolutely nothing")) {
    v.push('FAQ: answer 7 must start with "Then it costs you absolutely nothing!"');
  }

  return v;
}

/* ================= RUNNER ================= */
function emptyStore() {
  return { advertorialText: "", researchDoc: "", researchJson: null, visionJson: null, outputs: {}, stepStatus: {}, violations: null, translated: null, translatedLanguage: "", csvUrl: "", csvName: "", queueActive: false, attempts: {}, queueRuns: 0, updatedAt: null };
}

// Alle cellen als platte map: "step" of "step.field" → tekst
function flatCells(store) {
  const flat = {};
  for (const row of SHEET_ROWS) {
    const v = row.field ? store.outputs?.[row.step]?.[row.field] : store.outputs?.[row.step];
    flat[row.field ? `${row.step}.${row.field}` : row.step] = String(v || "");
  }
  return flat;
}

/* ---------------- Minimale XLSX-schrijver (geen dependencies) ---------------- */
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
  // entries: [{ name, data: Buffer }] — ZIP zonder compressie (store)
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, e.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + e.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
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
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="3" width="70" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
}
function buildXlsx(sheets) {
  // sheets: [{ name, rows: [[cel, ...], ...] }]
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

function buildCsv(store, langName) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const flat = flatCells(store);
  const lines = [["Category", "English", langName].map(esc).join(",")];
  for (const row of SHEET_ROWS) {
    const key = row.field ? `${row.step}.${row.field}` : row.step;
    lines.push([row.category, flat[key], store.translated?.[key] || ""].map(esc).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

// Vertaalprompt van Niels — letterlijk overgenomen; per markt worden taal en land ingevuld.
// Alleen de I/O-wrapper eronder is toegevoegd zodat elke cel apart als JSON terugkomt.
function translatePrompt(langName, country, flat) {
  return `You will answer only in ${langName}.
You will receive a text translated from another language (this may be English, Hebrew, or any other source).
⚠️ CRITICAL RULE
Treat the source text as the single source of truth.
Your task is NOT to reinterpret, soften, strengthen, reframe, or creatively improve the message.
Your sole objective is to preserve:

* identical claims
* identical promises
* identical certainty
* identical urgency
* identical psychological impact

🚫 ABSOLUTE CONSTRAINTS (NON-NEGOTIABLE)
You MUST NOT:

* Change or reinterpret medical or technical terms
* Add or remove claims
* Change timeframes, numbers, or percentages (except for currency localisation as defined below)
* Add authority, proof, or details
* Replace precise statements with vaguer ones

🌍 REQUIRED FULL LOCALISATION (MANDATORY)
You MUST localise all market-specific elements to ${country}, including:

* Names of people
* Schools, universities, and institutions
* Places and locations
* Brands or entities where applicable
* Currencies

📏 UNIT & MEASUREMENT LOCALISATION (MANDATORY)
You MUST localise all units of measurement and numerical conventions to the target market/country.
This includes, where applicable:

* Weight
* Distance
* Dimensions
* Temperature
* Volume
* Clothing and shoe sizing
* Date formatting
* Numerical formatting
* Any other locally used measurement standards

The AI must independently determine and apply the correct regional standards used in the target market instead of relying on fixed predefined country examples or hardcoded rules.
💶 CURRENCY LOCALISATION RULE
If prices or monetary amounts appear, you MUST convert them to a reasonable and realistic equivalent in the local currency that preserves the original price level, purchasing power, and intent.
The numeric value may change, but the economic meaning and psychological impact must remain the same.
You MUST NOT localise or change:

* The core message
* The mechanism
* The promise
* The outcome
* The claim strength

Localisation is contextual and market-based, never conceptual.
NATIVE ${langName.toUpperCase()} DELIVERY
The final text must sound like it was originally written in ${langName} by a native direct-response copywriter — not translated.
🧠 DECISION RULE
If forced to choose between sounding more natural or preserving exact meaning and strength — always preserve meaning and strength.
Return only the final ${langName} text. No explanations. No comments.

PIPELINE INPUT/OUTPUT (this overrides the output instruction above, all rules above stay fully in force):
The source text arrives as a JSON object of separate sales page copy cells. Translate every value according to ALL the rules above. The product name and the ™ symbol stay exactly as they are — never translate the product name.
Return ONLY a valid JSON object with exactly the same keys as the input, all string values in ${langName}. Empty values stay empty. No markdown, no code fences, no explanations, no text before or after.

INPUT JSON:
${JSON.stringify(flat, null, 2)}`;
}

// Advertorial-tekst ophalen van de live pagina (Advertorial Link in de Funnel-sectie)
async function fetchAdvertorial(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 5 * 1024 * 1024,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; JJB-Operations/1.0)" },
  });
  let html = String(res.data || "");
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  html = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n");
  let text = html.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  text = text.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 400) throw new Error("Could not extract enough text from the Advertorial Link — is the page live and public?");
  return text.slice(0, 120000);
}

// Packshot ophalen als base64 voor de vision-stap (max ~4,5 MB — de API-limiet is 5 MB)
async function fetchPackshot(url) {
  let src = url;
  // Shopify CDN kan zelf verkleinen — scheelt tokens en blijft onder de limiet
  if (/cdn\.shopify\.com/.test(src) && !/[?&]width=/.test(src)) {
    src += (src.includes("?") ? "&" : "?") + "width=1600";
  }
  const r = await axios.get(src, { responseType: "arraybuffer", timeout: 25000, maxRedirects: 5 });
  const buf = Buffer.from(r.data);
  if (buf.length > 4.5 * 1024 * 1024) throw new Error("Product photo is larger than 4.5 MB — use a smaller image on the Shopify product");
  const ct = String(r.headers["content-type"] || "").split(";")[0].trim();
  const byExt = /\.png(\?|$)/i.test(url) ? "image/png" : /\.webp(\?|$)/i.test(url) ? "image/webp" : /\.gif(\?|$)/i.test(url) ? "image/gif" : "image/jpeg";
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct) ? ct : byExt;
  return { media_type: media, data: buf.toString("base64") };
}

// Productfoto voor de vision-stap automatisch bepalen:
// 1. een handmatig geuploade packshot op de taak (oude taken) wint altijd,
// 2. anders de featured image van het gekozen Shopify-product (via id),
// 3. anders het product opzoeken op titel en die featured image nemen.
async function resolveProductImageUrl(task) {
  const manual = (task?.productPackshot || "").trim();
  if (manual) return manual;
  const prod = task?.product || {};
  if (prod.id) {
    try {
      const data = await shopifyGraphql(
        `query Img($id: ID!) { product(id: $id) { featuredImage { url(transform: {maxWidth: 1600, maxHeight: 1600}) } } }`,
        { id: prod.id }
      );
      const url = data?.product?.featuredImage?.url;
      if (url) return url;
    } catch { /* val hieronder terug op zoeken op titel */ }
  }
  const title = (prod.title || task?.productName || "").trim();
  if (!title) return "";
  try {
    const data = await shopifyGraphql(
      `query Find($q: String!) { products(first: 5, query: $q) { nodes { title featuredImage { url(transform: {maxWidth: 1600, maxHeight: 1600}) } } } }`,
      { q: `title:*${title.replace(/["\\]/g, "")}*` }
    );
    const nodes = data?.products?.nodes || [];
    const match = nodes.find((p) => (p.title || "").toLowerCase() === title.toLowerCase()) || nodes[0];
    return match?.featuredImage?.url || "";
  } catch {
    return "";
  }
}

async function getLaunchTask(taskId) {
  const launchStore = (await readData("launch-tasks")) || { tasks: [] };
  return { launchStore, task: launchStore.tasks.find((x) => x.id === taskId) || null };
}

async function runStep(store, step, taskId) {
  if (step === "translate") {
    const { task } = await getLaunchTask(taskId);
    const langName = LANGUAGES[task?.marketCountry || ""];
    if (!langName) throw new Error(`Set Market Country on the task first (${Object.keys(LANGUAGES).join(", ")}) — needed for the translation`);
    const prompt = translatePrompt(langName, task.marketCountry, flatCells(store));
    const text = await callClaude({ prompt, maxTokens: 12000, timeoutMs: 280000, model: TRANSLATE_MODEL });
    const obj = parseJsonLoose(text);
    const clean = {};
    for (const row of SHEET_ROWS) {
      const key = row.field ? `${row.step}.${row.field}` : row.step;
      clean[key] = String(obj[key] ?? "").trim();
    }
    store.translated = clean;
    store.translatedLanguage = langName;
    return;
  }
  if (step === "finalize") {
    if (!store.translated) throw new Error("Run the translation first");
    const wasDelivered = !!store.csvUrl || !!store.silentRebuild; // herbouw na handmatige edits: stil, zonder nieuwe notificaties
    const { launchStore, task } = await getLaunchTask(taskId);
    const langName = store.translatedLanguage || "Translation";
    const flat = flatCells(store);
    const mainRows = [["Category", "English", langName]];
    const imageRows = [["Category", "English", langName]];
    for (const row of SHEET_ROWS) {
      const key = row.field ? `${row.step}.${row.field}` : row.step;
      const target = String(row.step).startsWith("img_") ? imageRows : mainRows;
      target.push([row.category, flat[key], store.translated?.[key] || ""]);
    }
    const xlsxBuf = buildXlsx([
      { name: "Sales Page Copy", rows: mainRows },
      { name: "Image Copy", rows: imageRows },
    ]);
    const safeProduct = String(task?.productName || "product").replace(/[^\w.\-]+/g, "_").slice(0, 60);
    const filename = `${safeProduct}-sales-page-copy.xlsx`;
    store.csvUrl = await uploadBufferToShopify(xlsxBuf, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    store.csvName = filename;
    // Taak automatisch door naar Ready For Build + notificatie voor de funnel builder
    if (task) {
      const at = new Date().toISOString();
      task.activity = task.activity || [];
      if (!wasDelivered) {
        if (task.status === "AI Translation" || task.status === "Task Start") {
          task.status = "Ready For Build";
          task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `changed status to "Ready For Build" — sales page copy (English + ${langName}) is ready`, at });
        }
        task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `🧠 Sales Page Copy Excel delivered (English + ${langName})`, at });
      } else {
        task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `🧠 Excel rebuilt after manual edits`, at });
      }
      task.salesCopyCsvUrl = store.csvUrl;
      await writeData("launch-tasks", launchStore);
      if (!wasDelivered) {
        const notifs = [];
        const target = task.assigneeEmail || ADMIN_EMAIL;
        notifs.push({ email: target, text: `Sales page copy for "${task.productName}" is ready (English + ${langName}) — the Excel file is waiting in the task` });
        if (target !== ADMIN_EMAIL) notifs.push({ email: ADMIN_EMAIL, text: `Sales page copy for "${task.productName}" is ready — task moved to Ready For Build` });
        await pushNotifications(notifs);
      }
    }
    return;
  }
  if (step === "1") {
    const { launchStore, task } = await getLaunchTask(taskId);
    const link = (task?.advertorialLink || "").trim();
    let adv = "";
    if (link) {
      adv = await fetchAdvertorial(link);
      store.advertorialText = adv;
      store.advertorialSource = link;
    } else {
      adv = (store.advertorialText || "").trim();
    }
    if (!adv) throw new Error("Fill in the Advertorial Link in the Funnel section first");
    // Taak automatisch naar de kolom AI Translation
    if (task && (task.status === "Task Start" || task.status === "Ready For Build")) {
      task.status = "AI Translation";
      task.activity = task.activity || [];
      task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `changed status to "AI Translation" — Sales Page Copy pipeline started`, at: new Date().toISOString() });
      await writeData("launch-tasks", launchStore);
    }
    const prompt = PROMPT_1.replace("[ADVERTORIAL]", adv);
    // Webresearch staat voorlopig uit: alle velden voor de JSON komen uit de advertorial zelf,
    // en zonder zoekopdrachten past de stap gegarandeerd binnen de functietijd.
    store.researchDoc = await callClaude({ prompt, webSearch: false, maxTokens: 20000, timeoutMs: 280000 });
    store.researchJson = null; // nieuw onderzoek maakt oude JSON ongeldig
    return;
  }
  if (step === "1c") {
    // Product Vision: productfoto → product.visual_description + product.size_reference (merge in de research JSON)
    // De foto komt automatisch uit Shopify (featured image van het gekozen product); een oude handmatige packshot wint.
    const { task } = await getLaunchTask(taskId);
    const url = await resolveProductImageUrl(task);
    if (!url) {
      // Geen productfoto te vinden: stap netjes overslaan, de waarden uit de research blijven staan
      store.visionJson = { skipped: true };
      return;
    }
    const image = await fetchPackshot(url);
    const text = await callClaude({ prompt: PROMPT_1C, image, maxTokens: 1000, timeoutMs: 120000 });
    const obj = parseJsonLoose(text);
    store.visionJson = {
      visual_description: String(obj.visual_description || "").trim(),
      size_reference: String(obj.size_reference || "").trim(),
    };
    if (store.researchJson) {
      store.researchJson.product = store.researchJson.product || {};
      if (store.visionJson.visual_description) store.researchJson.product.visual_description = store.visionJson.visual_description;
      if (store.visionJson.size_reference) store.researchJson.product.size_reference = store.visionJson.size_reference;
    }
    return;
  }
  if (step === "1b") {
    if (!store.researchDoc?.trim()) {
      // Research ontbreekt nog: draai die eerst, daarna alsnog de extractie
      await runStep(store, "1", taskId);
      store.stepStatus["1"] = "done";
    }
    const prompt = PROMPT_1B.replace("[RESEARCH DOCUMENT]", store.researchDoc);
    const text = await callClaude({ prompt, maxTokens: 12000, timeoutMs: 180000 });
    store.researchJson = parseJsonLoose(text);
    // Vision-resultaat (1C) van een eerdere run opnieuw inmengen — de packshot wint altijd van de advertorial
    if (store.visionJson && !store.visionJson.skipped) {
      store.researchJson.product = store.researchJson.product || {};
      if (store.visionJson.visual_description) store.researchJson.product.visual_description = store.visionJson.visual_description;
      if (store.visionJson.size_reference) store.researchJson.product.size_reference = store.visionJson.size_reference;
    }
    return;
  }
  if (step === "validate") {
    store.violations = validate(store);
    return;
  }
  const def = STEPS.find((s) => s.key === step);
  if (!def) throw new Error(`Unknown step ${step}`);
  if (!store.researchJson) throw new Error("Run steps 1 and 1B first — steps 2-20 need the research JSON");

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  let prompt = def.prompt.replace("[TODAY]", today);
  prompt += `\n\nJSON FROM THE EXTRACTOR (this is your ONLY source of facts — never invent or substitute values):\n${JSON.stringify(store.researchJson, null, 2)}`;
  prompt += `\n\nPAIN POINT RULE (applies to every sentence you write): wherever the pain point is named, use avatar.pain_point_own_word exactly as it stands in the JSON — the broad condition. Never replace it with a symptom, measurement or related keyword ("your sugar", "your blood sugar", "your liver values") and never narrow it to a subtype or stage ("diabetes mellitus type 2", "stage 3"). The symptom words may only appear where the prompt explicitly asks for symptoms or desires.`;
  if (def.key.startsWith("img_")) {
    const { task: imgTask } = await getLaunchTask(taskId);
    prompt += `\n\nMARKET COUNTRY: ${imgTask?.marketCountry || "Italy"}`;
  }
  if (def.multi) {
    prompt += `\n\nOUTPUT FORMAT (overrides any earlier output format): return ONLY a valid JSON object with exactly these keys, all string values, no markdown, no code fences, no text before or after:\n{ ${def.multi.map((f) => `"${f}": ""`).join(", ")} }`;
  } else {
    prompt += `\n\nOUTPUT FORMAT: return only the final output text. No explanation, no preamble, no markdown formatting.`;
  }

  const text = await callClaude({ prompt, maxTokens: def.key === "17" ? 6000 : 4000, timeoutMs: 120000 });
  if (def.multi) {
    const obj = parseJsonLoose(text);
    const clean = {};
    for (const f of def.multi) clean[f] = String(obj[f] ?? "").trim();
    store.outputs[def.key] = clean;
  } else {
    store.outputs[def.key] = text.trim();
  }
}

/* ================= server-side queue ================= */
function computePending(store) {
  const att = store.attempts || {};
  const blocked = (k) => (att[k] || 0) >= MAX_ATTEMPTS;
  const seq = [];
  if (!store.researchDoc) seq.push("1");
  if (store.researchDoc && !store.researchJson) seq.push("1b");
  if (store.researchJson && !store.visionJson) seq.push("1c"); // Product Vision: Shopify-productfoto → visual_description/size_reference
  if (store.researchJson) for (const st of STEPS) if (!store.outputs?.[st.key]) seq.push(st.key);
  // Staart mag door zodra elke copystap klaar is OF zijn pogingen heeft opgebruikt
  // (mislukte stap = lege cel; de validator meldt hem, de rijen verschuiven nooit)
  const anyCopy = STEPS.some((st) => store.outputs?.[st.key]);
  const copyDoneOrBlocked = STEPS.every((st) => store.outputs?.[st.key] || blocked(st.key));
  if (store.researchJson && anyCopy && copyDoneOrBlocked && !store.violations) seq.push("validate");
  if (store.researchJson && anyCopy && copyDoneOrBlocked && !store.translated) seq.push("translate");
  if (store.translated && !store.csvUrl) seq.push("finalize");
  return seq;
}

// Voortgang (X van 27) berekenen zoals het paneel dat doet: 1, 1B, alle copy/imagestappen, validate, translate, finalize
function computeProgress(store) {
  let done = 0;
  const total = 3 + STEPS.length + 3; // 1 + 1b + 1c + copystappen + validate/translate/finalize
  if (store.researchDoc) done++;
  if (store.researchJson) done++;
  if (store.visionJson) done++;
  for (const st of STEPS) if (store.outputs?.[st.key]) done++;
  if (store.violations) done++;
  if (store.translated) done++;
  if (store.csvUrl) done++;
  return { done, total };
}

// Mini-voortgang op de taak zelf zetten zodat het kanban-kaartje hem kan tonen
async function writeTaskProgress(taskId, store) {
  try {
    const { launchStore, task } = await getLaunchTask(taskId);
    if (!task) return;
    const { done, total } = computeProgress(store);
    task.salesCopyProgress = { done, total, delivered: !!store.csvUrl, active: !!store.queueActive, at: new Date().toISOString() };
    await writeData("launch-tasks", launchStore);
  } catch (e) {
    console.error("writeTaskProgress error:", e.message); // voortgang is cosmetisch — nooit de pipeline breken
  }
}

// Na een lange stap de store nooit blind terugschrijven: vers inlezen en alleen het resultaat
// van déze stap eroverheen leggen — handmatige celbewerkingen tijdens de run blijven zo bewaard
async function mergeStepResult(handle, store, step) {
  const fresh = (await readData(handle)) || store;
  fresh.stepStatus = { ...(fresh.stepStatus || {}), [step]: store.stepStatus?.[step] };
  fresh.attempts = { ...(fresh.attempts || {}), ...(store.attempts || {}) };
  fresh.queueRuns = store.queueRuns;
  fresh.queueActive = store.queueActive;
  if (step === "1") {
    fresh.researchDoc = store.researchDoc;
    fresh.researchJson = store.researchJson;
    fresh.advertorialText = store.advertorialText;
    fresh.advertorialSource = store.advertorialSource;
  } else if (step === "1b") {
    fresh.researchDoc = store.researchDoc;
    fresh.researchJson = store.researchJson;
    if (store.stepStatus?.["1"]) fresh.stepStatus["1"] = store.stepStatus["1"]; // 1b kan 1 automatisch meedraaien
  } else if (step === "1c") {
    fresh.visionJson = store.visionJson;
    fresh.researchJson = store.researchJson; // bevat de gemergde vision-velden
  } else if (step === "validate") {
    fresh.violations = store.violations;
  } else if (step === "translate") {
    fresh.translated = store.translated;
    fresh.translatedLanguage = store.translatedLanguage;
  } else if (step === "finalize") {
    fresh.csvUrl = store.csvUrl;
    fresh.csvName = store.csvName;
    fresh.silentRebuild = false; // herbouw afgerond
  } else {
    fresh.outputs = { ...(fresh.outputs || {}), [step]: store.outputs?.[step] };
  }
  return fresh;
}

// Volgende schakel van de keten aftrappen: request wordt afgeleverd, antwoord wachten we niet af
async function kickQueue(req, taskId) {
  // Publiek domein eerst: de interne VERCEL_URL kan door Deployment Protection geblokkeerd zijn
  const host = req.headers.host || process.env.VERCEL_URL;
  if (!host) return;
  const proto = String(host).startsWith("localhost") ? "http" : "https";
  await axios
    .post(`${proto}://${host}/api/salescopy`, { action: "runQueue", taskId, internalKey: internalKey(taskId) }, { timeout: 10000 })
    .catch((e) => console.error("kickQueue error:", e.message));
}

/* ================= handler ================= */
export default async function handler(req, res) {
  const rawTaskId = String((req.method === "GET" ? req.query.taskId : req.body?.taskId) || "").replace(/[^a-f0-9]/g, "");
  const isInternal = req.method === "POST" && (req.body?.action === "runQueue" || req.body?.action === "startQueue") && !!rawTaskId && req.body?.internalKey === internalKey(rawTaskId);
  const session = getSession(req);
  const roles = session?.roles || [];
  const isAdmin = !!session?.admin;
  const isFB = roles.includes("Funnel Builder");
  const isMB = roles.includes("Media Buyer");
  if (!isInternal && (!session || !(isAdmin || isFB || isMB))) {
    return res.status(401).json({ success: false, error: "No access" });
  }
  res.setHeader("Cache-Control", "no-store");
  const canRun = isInternal || isAdmin || isFB;

  try {
    const taskId = rawTaskId;
    if (!taskId) return res.status(400).json({ success: false, error: "No taskId" });
    const handle = `salescopy-${taskId}`;

    if (req.method === "GET") {
      const store = (await readData(handle)) || emptyStore();
      return res.status(200).json({ success: true, store, canRun });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!canRun) return res.status(403).json({ success: false, error: "Only admin and Funnel Builders can run the pipeline" });

    const { action, text, step } = req.body || {};
    const store = (await readData(handle)) || emptyStore();

    if (action === "saveAdvertorial") {
      store.advertorialText = String(text || "").slice(0, 200000);
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      return res.status(200).json({ success: true, store });
    }

    if (action === "saveJson") {
      // Handmatig research-JSON injecteren (bv. de testfixtures) — slaat stap 1/1B over
      let parsed;
      try {
        parsed = parseJsonLoose(String(text || ""));
      } catch (e) {
        return res.status(400).json({ success: false, error: `Invalid JSON: ${e.message}` });
      }
      store.researchJson = parsed;
      store.stepStatus["1b"] = "done";
      // Stap 1 hoeft niet meer te draaien: de JSON is er al (anders pakt de keten hem alsnog op)
      if (!String(store.researchDoc || "").trim()) {
        store.researchDoc = "(Research JSON was provided manually — steps 1 and 1B were skipped.)";
      }
      store.stepStatus["1"] = "done";
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      return res.status(200).json({ success: true, store });
    }

    if (action === "saveCell") {
      // Handmatige celbewerking in de copytabel — alleen admin
      if (!isAdmin) return res.status(403).json({ success: false, error: "Admin only" });
      const stepKey = String(req.body.step || "");
      const fieldKey = req.body.field ? String(req.body.field) : null;
      const validRow = SHEET_ROWS.some((r) => String(r.step) === stepKey && (r.field || null) === fieldKey);
      if (!validRow) return res.status(400).json({ success: false, error: "Unknown cell" });
      if (req.body.en !== undefined && req.body.en !== null) {
        store.outputs = store.outputs || {};
        if (fieldKey) {
          if (!store.outputs[stepKey] || typeof store.outputs[stepKey] !== "object") store.outputs[stepKey] = {};
          store.outputs[stepKey][fieldKey] = String(req.body.en);
        } else {
          store.outputs[stepKey] = String(req.body.en);
        }
      }
      if (req.body.tr !== undefined && req.body.tr !== null) {
        store.translated = store.translated || {};
        store.translated[fieldKey ? `${stepKey}.${fieldKey}` : stepKey] = String(req.body.tr);
      }
      // Handmatig gevuld = stap afgerond: de foutmelding (bv. een refusal) verdwijnt uit het foutenblok
      if (String(req.body.en || "").trim() && String(store.stepStatus?.[stepKey] || "").startsWith("error")) {
        store.stepStatus[stepKey] = "done";
      }
      // Validator live bijwerken zodat "Empty cell"-waarschuwingen meteen verdwijnen zodra de cel inhoud heeft
      if (store.violations) store.violations = validate(store);
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      return res.status(200).json({ success: true, store });
    }

    if (action === "retranslate") {
      // Opnieuw vertalen + Excel vervangen via de server-side keten: de browser mag dicht
      if (!isAdmin) return res.status(403).json({ success: false, error: "Admin only" });
      store.translated = null;
      store.translatedLanguage = "";
      store.csvUrl = "";
      store.silentRebuild = true; // geen nieuwe notificaties/statuswijziging bij finalize
      store.queueActive = true;
      store.queueRuns = 0;
      const keep = {};
      for (const [k, v] of Object.entries(store.stepStatus || {})) {
        if (/declined this content/.test(String(v))) keep[k] = MAX_ATTEMPTS;
      }
      store.attempts = keep;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      await kickQueue(req, taskId);
      return res.status(200).json({ success: true, store });
    }

    if (action === "reset") {
      const keep = store.advertorialText;
      const fresh = emptyStore();
      fresh.advertorialText = keep;
      fresh.updatedAt = new Date().toISOString();
      await writeData(handle, fresh);
      return res.status(200).json({ success: true, store: fresh });
    }

    /* --- startQueue: pipeline server-side laten doorlopen, browser mag dicht --- */
    if (action === "startQueue") {
      // Interne aanroep (board-watchdog): alleen een gestorven keten weer aantrappen,
      // nooit een queue herstarten die met Stop bewust is stilgelegd
      if (isInternal && !store.queueActive) return res.status(200).json({ success: true, halted: true });
      if (store.queueActive && store.updatedAt && Date.now() - Date.parse(store.updatedAt) < 90000) {
        await kickQueue(req, taskId); // keten draait (of viel stil): geef een nieuwe zet
        return res.status(200).json({ success: true, store });
      }
      store.queueActive = true;
      // Pogingen resetten, behalve bij inhoudelijke weigeringen: die zouden meteen weer weigeren
      // en zo de staart (validate/translate/finalize) opnieuw blokkeren
      const keepBlocked = {};
      for (const [k, v] of Object.entries(store.stepStatus || {})) {
        if (/declined this content/.test(String(v))) keepBlocked[k] = MAX_ATTEMPTS;
      }
      store.attempts = keepBlocked;
      store.queueRuns = 0;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      await writeTaskProgress(taskId, store); // balkje meteen op het kaartje zetten
      await kickQueue(req, taskId);
      return res.status(200).json({ success: true, store });
    }

    if (action === "stopQueue") {
      store.queueActive = false;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      await writeTaskProgress(taskId, store); // active: false op het kaartje — houdt de board-watchdog stil
      return res.status(200).json({ success: true, store });
    }

    /* --- runQueue: een schakel van de keten (interne aanroep) --- */
    if (action === "runQueue") {
      if (!store.queueActive) return res.status(200).json({ success: true, halted: true });
      store.queueRuns = (store.queueRuns || 0) + 1;
      // 28 stappen + max 3 pogingen per stap kan onder zware belasting boven 60 uitkomen;
      // 120 dekt het slechtste geval en blijft een echte runaway-stop
      if (store.queueRuns > 120) {
        store.queueActive = false;
        await writeData(handle, store);
        return res.status(200).json({ success: false, error: "Queue safety limit reached" });
      }
      store.attempts = store.attempts || {};
      const pending = computePending(store).filter((k) => (store.attempts[k] || 0) < MAX_ATTEMPTS);
      if (!pending.length) {
        store.queueActive = false;
        store.updatedAt = new Date().toISOString();
        await writeData(handle, store);
        if (computePending(store).length) {
          const errs = Object.entries(store.stepStatus || {}).filter(([, v]) => String(v).startsWith("error"));
          await pushNotifications([{ email: ADMIN_EMAIL, text: `Sales page copy pipeline stopped with ${errs.length} failed step(s) - open the task to retry` }]);
        }
        return res.status(200).json({ success: true, done: true });
      }
      const step = pending[0];
      store.attempts[step] = (store.attempts[step] || 0) + 1;
      store.stepStatus[step] = "error: step was interrupted (most likely a timeout) - press Resume to retry";
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      try {
        await runStep(store, step, taskId);
        store.stepStatus[step] = "done";
      } catch (e) {
        store.stepStatus[step] = `error: ${e.message}`;
        // Weigering is inhoudelijk, geen technisch falen: niet opnieuw proberen, meteen doorschuiven
        if (/declined this content/.test(e.message)) store.attempts[step] = MAX_ATTEMPTS;
      }
      // Vers samenvoegen zodat celbewerkingen die tijdens deze stap zijn opgeslagen niet verloren gaan
      const merged = await mergeStepResult(handle, store, step);
      const remaining = computePending(merged).filter((k) => (merged.attempts[k] || 0) < MAX_ATTEMPTS);
      if (!remaining.length) merged.queueActive = false;
      merged.updatedAt = new Date().toISOString();
      await writeData(handle, merged);
      await writeTaskProgress(taskId, merged);
      if (remaining.length) {
        await kickQueue(req, taskId);
      } else if (computePending(merged).length) {
        const errs = Object.entries(merged.stepStatus || {}).filter(([, v]) => String(v).startsWith("error"));
        await pushNotifications([{ email: ADMIN_EMAIL, text: `Sales page copy pipeline stopped with ${errs.length} failed step(s) - open the task to retry` }]);
      }
      return res.status(200).json({ success: true });
    }

    if (action === "runStep") {
      const key = String(step || "");
      try {
        await runStep(store, key, taskId);
        store.stepStatus[key] = "done";
      } catch (e) {
        store.stepStatus[key] = `error: ${e.message}`;
        const mergedErr = await mergeStepResult(handle, store, key);
        mergedErr.updatedAt = new Date().toISOString();
        await writeData(handle, mergedErr);
        return res.status(200).json({ success: false, error: e.message, store: mergedErr });
      }
      const merged = await mergeStepResult(handle, store, key);
      merged.updatedAt = new Date().toISOString();
      await writeData(handle, merged);
      await writeTaskProgress(taskId, merged);
      return res.status(200).json({ success: true, store: merged });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Salescopy error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
