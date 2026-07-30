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

// Market Country → doeltaal voor de vertaalkolom in de CSV
const LANGUAGES = { Italy: "Italian", France: "French", Israel: "Hebrew" };

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
async function callClaude({ prompt, webSearch = false, maxTokens = 4000, timeoutMs = 55000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel");
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
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
  if (start === -1 || end === -1) throw new Error("No JSON found in model output");
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
- What is the pain point in their own everyday word, the word they say to a friend at the kitchen table? And what is the formal or medical name for it?
- Who is the authority figure, and what is their professional title in the singular and in the plural? Give the title exactly as the advertorial states it, even if a different specialist would seem more logical for this product type.
- Which cleaning agent would a normal person actually use on the body part where the product is applied?
- At which moment in their existing daily routine would this type of product logically be used for maximum effect?
- What is the logical dosage per application for this product form?
- Which sensory confirmation can the user establish within seconds that proves they applied it correctly?
${LANGUAGE_NOTE}

FORMAT: write the research document in compact bullet points. Be complete on content but economical with words — no decorative tables, no repeated section summaries. The document MUST answer EVERY question above, all the way to the last one about the sensory confirmation. Never stop early; the later questions (alternatives, authority figure, usage details) are the most important ones for the next step.

THE ADVERTORIAL:
[ADVERTORIAL]`;

const JSON_SCHEMA = `{ "product": { "name": "", "name_with_tm": "", "type": "", "delivery_form": "singular | plural", "product_noun": "", "ingredient_root_cause": "", "ingredient_instant": "" }, "classification": { "external_or_internal": "external | internal", "visual_or_non_visual": "visual | non-visual", "step3_headline_verb": "See | Hear | Feel | Discover" }, "avatar": { "age_range": "", "gender": "", "awareness_stage": "", "pain_point_own_word": "", "pain_point_formal": "", "pain_point_number": "singular | plural", "buzzwords_known": [], "buzzwords_unknown": [], "first_symptom_sentence": "", "first_symptoms": [], "greatest_fear": "", "consequence_to_restore": "", "deeper_desire": "" }, "mechanism": { "entry_route": "", "root_cause_structure": "", "root_cause_verb": "", "step_1_current_problem": "", "step_2_root_cause": "", "second_body_part": "", "cell_word": "", "structure_word": "", "recognisable_anatomical_word": "", "mechanism_verb": "" }, "objections": { "alternative_1": "", "alternative_1_hated_adjective": "", "alternative_2": "", "alternative_2_hated_adjective": "", "currently_still_using": "", "substances_they_refuse": [], "exception_objection": "", "thing_to_avoid": "" }, "usage": { "application_place": "", "cleaning_agent": "", "application_moment": "", "dosage": "", "proof_point": "" }, "authority": { "name": "", "title_singular": "", "title_plural": "", "institution": "" } }`;

const PROMPT_1B = `Below is the complete research document for this product.
Your only task is to extract the values into the JSON structure below. You do not add anything, you do not interpret, you do not improve. Every value comes literally from the research document.

RULES
- Fill in every field. If a value genuinely does not appear in the research document, use an empty string "".
- Never invent a value. An empty field is better than a guessed one.
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

// Steps 2-20. Each receives ONLY the research JSON (appended by the runner).
// multi: ordered field keys for JSON output; null = plain text output.
const STEPS = [
  {
    key: "2",
    label: "ATF Headline",
    multi: null,
    prompt: `I want you to create the headline for me based on the JSON from the extractor. The headline is solution-aware / product-aware and follows this order:

1. [First the product name]

2. [State the desired outcome they want by breaking down the main pain point and mentioning it negatively, by using an adjective that mainly fits this pain point. Make sure this adjective is also something they know, and that it ties in with what THEY hate about the pain point and that it is only applicable to this and cannot be used for any other pain point, that it is phrased extremely negatively and is relatable for our target audience]

3. State that they should not use what their most common alternative is for this pain point. It usually starts with 'WITHOUT', and also state an adjective that ties in extremely strongly with what they hate about this alternative, and something that can only be used for this specific alternative and does not fit any other alternative. Make sure this adjective is also something they know, and that it ties in with what THEY hate about the alternative. Also make sure it is a word they know in their vocabulary, and not something they barely hear or say themselves

4. Think about our unique mechanism pain point: what is it that caused the pain point? And state that this is solved first, and state a specific timeframe of when it is solved within 4-6 days. You NEVER state more than 6 days, you never state it in hours, seconds, or anything else, only in days. This often starts with 'treats' or 'restores', but it does not necessarily have to start with this. Also state it in their known jargon based on their awareness stage.

Example:
NeuroTone™ treats your annoying tinnitus without sound therapy and restores damaged hair cells within 4 days

Give me only the output I ask for, no explanation or clarification with it.`,
  },
  {
    key: "3",
    label: "Subheadline",
    multi: null,
    prompt: `Because our customers are in a solution-aware stage, we want to break down the alternatives they currently use.
Use the JSON from the extractor and work through this reasoning silently (do not output it):
1. What are the alternatives they use most at this moment? Give me the top 2 most used
2. Tell me what they hate most about these alternatives, what frustrates them the hardest about them?
3. Then give me 3 adjectives that you can only use that tie in with their frustration around this alternative and with nothing, absolutely nothing else. It can only be used specifically for this alternative and by this target audience.
Then choose the adjective that:
- Provokes the most frustration
- The word must describe what the alternative ACTIVELY does at the moment of use, not what happens in the long term. Choose an acute, direct effect over a slow process. It must be tangible, not just visible.
- The word must name the loss that the alternative causes — loss of control over your own body or face. Not the most severe medical complication, but the most fundamental deprivation.
The adjective must be one single word — never a subordinate clause or a description.
When in doubt: choose the word she would say herself to a friend at the kitchen table, not the most correct word.
Also make sure the adjective is something they know in their vocabulary, and not something they barely hear or say themselves.

Once you have done this, I want you to give me a sentence in which you break down the top 2 alternatives by starting with 'Without' and then stating the 2 alternatives, but with the specific adjectives before you state the alternative specifically.

Example:
No retinol creams that make your skin flake, or useless collagen creams!

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

GENERAL RULES
- No benefit contains more than 8 words.
- Never add a word to reach a word count. If a benefit can be shorter, it is shorter.
- No verb appears twice in the block. Two verbs that resemble each other or sound the same (restore and restart, dilate and dissolve) count as the same verb.
- The claim strength rises from 1 to 4. Never start strong and then weaken.

BENEFIT 1 — THE AUTHORITY CLAIM
A strong claim that simply states that the problem is solved. Always start with "Effective treatment for" and end on the pain point as they know it in THEIR jargon. Do not be a smart-ass here with a word they do not use.
Effective treatment for tinnitus / Effective treatment for erectile problems / Effective treatment for crow's feet

BENEFIT 2 — THE MECHANISM, STEP 1 (THE CURRENT PROBLEM)
Always start with an action word: restores, strengthens, stimulates, activates, supports.
Name the cell or structure that the ingredient activates. This is a medical or technical jargon word that they have heard before but do not use in their daily vocabulary. Too technical is just as wrong as too general. Fibroblasts works; matrikine and procollagen fragment go too far; skin cells goes too far back.
If mechanism.cell_word is empty, or is not an actual cell but a structure, use mechanism.structure_word instead. Never invent a cell word that does not appear in the advertorial.
Maximum 8 words.
FOR EXTERNAL: name the cell plus the substance that cell produces. Leave out the article before the cell name. Example: Stimulates fibroblasts to produce collagen
FOR INTERNAL: name the structure plus the function that structure performs. The article stays. Examples: Strengthens the eardrum to dampen sound waves / Restores blood flow to the smallest blood vessels
Overlap in mechanism between benefit 2 and 3 is allowed as long as the perspective differs: 2 works at cell level, 3 at cause level.

BENEFIT 3 — THE CAUSE, STEP 2
Always start with "Proven ingredients that" and then continue to how it solves the CAUSE of the problem, using mechanism.step_2_root_cause from the JSON. Maximum 8 words. Shorter is better.
Choose as the object what the CAUSE is, not what the victim is. Never put the cause into an adjective attached to another object.
The verb names the end state that the mechanism delivers, never the means. Never use a feeding or supply verb: feed, supply, support and stimulate are forbidden here.
Use the most recognisable variant of the anatomical term, not the most technical. So hair cells, not ciliated hair cells. So the skin, not the dermis.
Where possible, use mechanism.root_cause_verb from the JSON.
FOR EXTERNAL: if the cause is the organ itself, name it in its general form (the skin, the hair, the nail). No micro-location, no adjectives. The verb is a dimension verb: thicken, fill, firm, tighten. Example: Proven ingredients that thicken the skin again
FOR INTERNAL: the verb is a function or clearing verb: restore, calm, normalise, dampen, dilate, dissolve, remove. Examples: Proven ingredients that repair the hair cells / Proven ingredients that dissolve calcium buildup
Exception to the umbrella-word ban: "restore" is allowed when no more specific physical verb exists for this cause.

BENEFIT 4 — THE TIME PROMISE
Benefit 4 is always exactly one of these two, depending on the product type:
- FOR EXTERNAL: Visible difference within 24 hours!
- FOR INTERNAL: Noticeable difference within 24 hours!
Nothing more. Never swap visible and noticeable.

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
COLUMN: One sentence, maximum 30 words. Contains three things: the place, the cleaning agent, and the reason. The reason is always linked to the absorption of the product, for example "so that the active ingredients can be fully absorbed".
Use usage.application_place and usage.cleaning_agent from the JSON. Never invent a spot. The body part in the headline is exactly the same body part as in the column.
CLEANING AGENT PER BODY PART: Choose what a normal person actually uses on that body part. "Mild soap and warm water" applies exclusively to the torso, lower abdomen, arms, legs, hands and feet. Never use it on the face, around the eyes, in the ears, on the scalp or in the mouth.
Face and around the eyes: a mild facial cleanser and lukewarm water. Ears: a damp cloth, never soap in the ear canal. Scalp: a mild shampoo. Mouth: do not clean, only empty.

STEP 2 — HOW THEY USE IT
HEADLINE: Always contains the pain point and always ends on "treating" — as in: Treating tinnitus / Treating erectile problems / Treating crow's feet
COLUMN: Two sentences.
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

  // Top 4 Benefits (stap 4)
  const b4 = String(out["4"] || "");
  if (b4) {
    const lines = b4.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    lines.forEach((l, i) => {
      if (wordCount(l) > 8) v.push(`Top 4 Benefits: benefit ${i + 1} is above 8 words ("${l}")`);
    });
    const last = lines[lines.length - 1] || "";
    const okLast = ["Visible difference within 24 hours!", "Noticeable difference within 24 hours!"];
    if (!okLast.includes(last)) {
      v.push(`Top 4 Benefits: benefit 4 must be exactly "Visible difference within 24 hours!" or "Noticeable difference within 24 hours!" (got "${last}")`);
    } else if (!last.toLowerCase().startsWith(rightWord)) {
      v.push(`Top 4 Benefits: benefit 4 uses "${wrongWord}" but classification.visual_or_non_visual says "${rightWord}"`);
    }
  }

  // 3 Benefits Section 3 (stap 10): visible/noticeable check
  const s10 = String(out["10"] || "").toLowerCase();
  if (s10 && s10.includes(`fast, ${wrongWord} results`)) {
    v.push(`3 Benefits Section 3: closing formula uses "${wrongWord}" but classification says "${rightWord}"`);
  }

  // Stap 12: Step 1 headline max 4 woorden, column max 30 woorden
  const s12 = out["12"] || {};
  if (s12.step1_headline && wordCount(s12.step1_headline) > 4) v.push(`Step-By-Step: Step 1 headline is above 4 words ("${s12.step1_headline}")`);
  if (s12.step1_column && wordCount(s12.step1_column) > 30) v.push(`Step-By-Step: Step 1 column is above 30 words`);

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
  return { advertorialText: "", researchDoc: "", researchJson: null, outputs: {}, stepStatus: {}, violations: null, translated: null, translatedLanguage: "", csvUrl: "", csvName: "", queueActive: false, attempts: {}, queueRuns: 0, updatedAt: null };
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

async function getLaunchTask(taskId) {
  const launchStore = (await readData("launch-tasks")) || { tasks: [] };
  return { launchStore, task: launchStore.tasks.find((x) => x.id === taskId) || null };
}

async function runStep(store, step, taskId) {
  if (step === "translate") {
    const missing = STEPS.filter((s) => !store.outputs?.[s.key]).map((s) => s.key);
    if (missing.length) throw new Error(`Finish copy steps first (missing: ${missing.join(", ")})`);
    const { task } = await getLaunchTask(taskId);
    const langName = LANGUAGES[task?.marketCountry || ""];
    if (!langName) throw new Error(`Set Market Country on the task first (${Object.keys(LANGUAGES).join(", ")}) — needed for the translation`);
    const prompt = translatePrompt(langName, task.marketCountry, flatCells(store));
    const text = await callClaude({ prompt, maxTokens: 12000, timeoutMs: 280000 });
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
    const { launchStore, task } = await getLaunchTask(taskId);
    const langName = store.translatedLanguage || "Translation";
    const csv = buildCsv(store, langName);
    const safeProduct = String(task?.productName || "product").replace(/[^\w.\-]+/g, "_").slice(0, 60);
    const filename = `${safeProduct}-sales-page-copy.csv`;
    store.csvUrl = await uploadBufferToShopify(Buffer.from(csv, "utf8"), filename, "text/csv");
    store.csvName = filename;
    // Taak automatisch door naar Ready For Build + notificatie voor de funnel builder
    if (task) {
      const at = new Date().toISOString();
      task.activity = task.activity || [];
      if (task.status === "AI Translation" || task.status === "Task Start") {
        task.status = "Ready For Build";
        task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `changed status to "Ready For Build" — sales page copy (English + ${langName}) is ready`, at });
      }
      task.activity.push({ id: uidLog(), type: "log", author: "Stefan's Brain", email: ADMIN_EMAIL, text: `🧠 Sales Page Copy CSV delivered (English + ${langName})`, at });
      task.salesCopyCsvUrl = store.csvUrl;
      await writeData("launch-tasks", launchStore);
      const notifs = [];
      const target = task.assigneeEmail || ADMIN_EMAIL;
      notifs.push({ email: target, text: `Sales page copy for "${task.productName}" is ready (English + ${langName}) — the CSV is waiting in the task` });
      if (target !== ADMIN_EMAIL) notifs.push({ email: ADMIN_EMAIL, text: `Sales page copy for "${task.productName}" is ready — task moved to Ready For Build` });
      await pushNotifications(notifs);
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
    store.researchDoc = await callClaude({ prompt, webSearch: false, maxTokens: 12000, timeoutMs: 280000 });
    store.researchJson = null; // nieuw onderzoek maakt oude JSON ongeldig
    return;
  }
  if (step === "1b") {
    if (!store.researchDoc?.trim()) {
      // Research ontbreekt nog: draai die eerst, daarna alsnog de extractie
      await runStep(store, "1", taskId);
      store.stepStatus["1"] = "done";
    }
    const prompt = PROMPT_1B.replace("[RESEARCH DOCUMENT]", store.researchDoc);
    const text = await callClaude({ prompt, maxTokens: 8000, timeoutMs: 180000 });
    store.researchJson = parseJsonLoose(text);
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
  const seq = [];
  if (!store.researchDoc) seq.push("1");
  if (store.researchDoc && !store.researchJson) seq.push("1b");
  if (store.researchJson) for (const st of STEPS) if (!store.outputs?.[st.key]) seq.push(st.key);
  const allCopy = STEPS.every((st) => store.outputs?.[st.key]);
  if (allCopy && !store.violations) seq.push("validate");
  if (allCopy && !store.translated) seq.push("translate");
  if (store.translated && !store.csvUrl) seq.push("finalize");
  return seq;
}

// Volgende schakel van de keten aftrappen: request wordt afgeleverd, antwoord wachten we niet af
async function kickQueue(req, taskId) {
  // Publiek domein eerst: de interne VERCEL_URL kan door Deployment Protection geblokkeerd zijn
  const host = req.headers.host || process.env.VERCEL_URL;
  if (!host) return;
  const proto = String(host).startsWith("localhost") ? "http" : "https";
  await axios
    .post(`${proto}://${host}/api/salescopy`, { action: "runQueue", taskId, internalKey: internalKey(taskId) }, { timeout: 5000 })
    .catch((e) => console.error("kickQueue error:", e.message));
}

/* ================= handler ================= */
export default async function handler(req, res) {
  const rawTaskId = String((req.method === "GET" ? req.query.taskId : req.body?.taskId) || "").replace(/[^a-f0-9]/g, "");
  const isInternal = req.method === "POST" && req.body?.action === "runQueue" && !!rawTaskId && req.body?.internalKey === internalKey(rawTaskId);
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
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
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
      if (store.queueActive && store.updatedAt && Date.now() - Date.parse(store.updatedAt) < 90000) {
        await kickQueue(req, taskId); // keten draait (of viel stil): geef een nieuwe zet
        return res.status(200).json({ success: true, store });
      }
      store.queueActive = true;
      store.attempts = {};
      store.queueRuns = 0;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      await kickQueue(req, taskId);
      return res.status(200).json({ success: true, store });
    }

    if (action === "stopQueue") {
      store.queueActive = false;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      return res.status(200).json({ success: true, store });
    }

    /* --- runQueue: een schakel van de keten (interne aanroep) --- */
    if (action === "runQueue") {
      if (!store.queueActive) return res.status(200).json({ success: true, halted: true });
      store.queueRuns = (store.queueRuns || 0) + 1;
      if (store.queueRuns > 60) {
        store.queueActive = false;
        await writeData(handle, store);
        return res.status(200).json({ success: false, error: "Queue safety limit reached" });
      }
      store.attempts = store.attempts || {};
      const pending = computePending(store).filter((k) => (store.attempts[k] || 0) < 2);
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
      }
      const remaining = computePending(store).filter((k) => (store.attempts[k] || 0) < 2);
      if (!remaining.length) store.queueActive = false;
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      if (remaining.length) {
        await kickQueue(req, taskId);
      } else if (computePending(store).length) {
        const errs = Object.entries(store.stepStatus || {}).filter(([, v]) => String(v).startsWith("error"));
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
        store.updatedAt = new Date().toISOString();
        await writeData(handle, store);
        return res.status(200).json({ success: false, error: e.message, store });
      }
      store.updatedAt = new Date().toISOString();
      await writeData(handle, store);
      return res.status(200).json({ success: true, store });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Salescopy error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
