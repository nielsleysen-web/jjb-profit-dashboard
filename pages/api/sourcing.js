// pages/api/sourcing.js
// Automatische sourcing-flow voor nieuwe winnende producten.
//
// Trigger (scan, max 1x/uur, aangetrapt vanuit het dashboard):
//   1. Tel per product de orders van de laatste 30 dagen (Shopify).
//   2. Product haalt 3+ sales én heeft nog NERGENS een unit cost in Shopify
//      (= nieuw, nog niet gesourced) → automatisch:
//      - rij in de sourcing-Google-Sheet (Alibaba Link uit de pipeline-card,
//        Website Link + Product Name uit Shopify, Country uit de pipeline-card)
//      - Slack-bericht in het notificatiekanaal dat de agent tagt met de vraag
//        de 1/2/3/5-prijzen IN EURO in te vullen
//   3. Elke scan leest de sheet ook uit: ingevulde prijzen worden automatisch
//      als unit cost op de juiste Shopify-varianten gezet (1x→F, 2x→G, 3x→H, 5x→I)
//      → Product Economics en het dashboard rekenen er meteen mee.
//      Niet-matchbare varianten → notificatie aan de admin om het handmatig te doen.
//
// Vereiste env-variabelen (Vercel):
//   SOURCING_SHEET_URL     — web-app-URL van het Apps Script op de sheet (/exec)
//   SOURCING_SHEET_SECRET  — zelfde secret als in het Apps Script
//   SLACK_SOURCING_AGENT_ID— Slack member ID van de sourcing-agent (bv. U0123ABC)
//   SLACK_WEBHOOK_URL      — bestaande notificatie-webhook (al ingesteld)

import axios from "axios";
import crypto from "crypto";

export const config = { maxDuration: 120 };

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const SHEET_LINK = "https://docs.google.com/spreadsheets/d/1xVTFWjwq_vxv8rnNew41SHoCNkQOSY_5NxNVve9CveU/edit";
const SALES_THRESHOLD = 3;      // 3+ orders in de laatste 30 dagen
const SCAN_INTERVAL_MS = 55 * 60 * 1000; // max 1 scan per uur
const MAX_NEW_PER_SCAN = 5;

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
const internalKey = () => crypto.createHmac("sha256", SESSION_SECRET).update("sourcing:scan").digest("base64url");

/* ---------------- Shopify ---------------- */
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

/* ---------------- notificaties (CRM + Slack) ---------------- */
async function pushCrmNotification(email, text, href) {
  try {
    const store = (await readData("notifications")) || { items: [] };
    store.items.push({ id: uid(), email, text, href: href || "/product-economics", read: false, at: new Date().toISOString() });
    if (store.items.length > 400) store.items = store.items.slice(-400);
    await writeData("notifications", store);
  } catch {}
}

async function postSlack(text) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text }, { timeout: 8000 });
  } catch (e) {
    console.error("Slack error:", e.message);
  }
}

/* ---------------- Google Sheet (via Apps Script web-app) ---------------- */
async function sheetRequest(payload) {
  const url = process.env.SOURCING_SHEET_URL;
  const secret = process.env.SOURCING_SHEET_SECRET;
  if (!url || !secret) throw new Error("SOURCING_SHEET_URL / SOURCING_SHEET_SECRET not set in Vercel");
  const r = await axios.post(url, JSON.stringify({ ...payload, secret }), {
    headers: { "Content-Type": "text/plain" }, // Apps Script leest e.postData.contents
    timeout: 25000,
    maxRedirects: 5, // Apps Script antwoordt via een redirect
  });
  const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  if (!data.ok) throw new Error(`Sheet script: ${data.error || "unknown error"}`);
  return data;
}

/* ---------------- Shopify data-helpers ---------------- */
// Orders per product (laatste 30 dagen): telt ORDERS (niet stuks), net als het dashboard
async function countRecentOrdersPerProduct() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const counts = {};
  let after = null;
  for (let page = 0; page < 15; page++) {
    const d = await shopifyGraphql(
      `query Orders($first: Int!, $query: String, $after: String) {
        orders(first: $first, query: $query, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { lineItems(first: 10) { nodes { title quantity product { title } } } }
        }
      }`,
      { first: 250, query: `created_at:>='${since}'`, after }
    );
    const conn = d.orders;
    for (const o of conn.nodes) {
      const titles = new Set();
      for (const li of o.lineItems.nodes) titles.add(li.product?.title || li.title);
      for (const t of titles) {
        if (!t) continue;
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return counts;
}

async function getProductByTitle(title) {
  const q = `title:${JSON.stringify(title)}`;
  const d = await shopifyGraphql(
    `query Prod($q: String!) {
      products(first: 5, query: $q) {
        nodes {
          title
          handle
          onlineStoreUrl
          variants(first: 25) { nodes { title inventoryItem { id unitCost { amount } } } }
        }
      }
    }`,
    { q }
  );
  const nodes = d.products?.nodes || [];
  return nodes.find((p) => p.title.toLowerCase() === title.toLowerCase()) || nodes[0] || null;
}

// Variant-titel → aantal stuks (1/2/3/5). "Default Title" of één variant = 1.
function variantQuantity(title, isOnlyVariant) {
  const t = String(title || "").toLowerCase();
  if (!t || t === "default title") return 1;
  let m =
    t.match(/(\d+)[\s-]*(?:x|pcs?|pieces?|items?|packs?|stuks|pz|flacons?|bottles?|dozen|boxes?)/i) ||
    t.match(/(?:x|buy|kit)\s*(\d+)/i) ||
    t.match(/^(\d+)$/);
  if (m) {
    const q = parseInt(m[1], 10);
    if ([1, 2, 3, 5].includes(q)) return q;
  }
  return isOnlyVariant ? 1 : null;
}

const parsePrice = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[€\s]/g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : null;
};

async function setUnitCost(inventoryItemId, cost) {
  const d = await shopifyGraphql(
    `mutation SetUnitCost($id: ID!, $cost: Decimal!) {
      inventoryItemUpdate(id: $id, input: {cost: $cost}) {
        inventoryItem { id unitCost { amount } }
        userErrors { field message }
      }
    }`,
    { id: inventoryItemId, cost: String(cost) }
  );
  const errs = d?.inventoryItemUpdate?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

/* ---------------- de scan ---------------- */
async function runScan(force) {
  const store = (await readData("sourcing")) || { products: {}, lastScanAt: null };
  if (!force && store.lastScanAt && Date.now() - new Date(store.lastScanAt).getTime() < SCAN_INTERVAL_MS) {
    return { skipped: "recently scanned" };
  }
  store.lastScanAt = new Date().toISOString();
  await writeData("sourcing", store);

  const result = { requested: [], priced: [], attention: [] };
  const agentTag = process.env.SLACK_SOURCING_AGENT_ID ? `<@${process.env.SLACK_SOURCING_AGENT_ID}> ` : "";

  /* ---- STAP 1: nieuwe winnaars detecteren → sheet + Slack ---- */
  const counts = await countRecentOrdersPerProduct();
  const launchStore = (await readData("launch-tasks")) || { tasks: [] };
  const candidates = Object.entries(counts)
    .filter(([title, n]) => n >= SALES_THRESHOLD && !store.products[title])
    .slice(0, MAX_NEW_PER_SCAN);

  for (const [title, n] of candidates) {
    try {
      const product = await getProductByTitle(title);
      if (!product) {
        store.products[title] = { status: "not-found", at: new Date().toISOString() };
        continue;
      }
      // Al een unit cost ergens = geen nieuw product → overslaan (permanent)
      const hasCost = product.variants.nodes.some((v) => v.inventoryItem?.unitCost?.amount != null);
      if (hasCost) {
        store.products[title] = { status: "already-tracked", at: new Date().toISOString() };
        continue;
      }
      // Pipeline-card zoeken voor Alibaba-link + country
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const task = launchStore.tasks.find(
        (t) => norm(t.product?.title) === norm(title) || norm(t.productName) === norm(title) ||
               (norm(t.productName) && norm(title).includes(norm(t.productName)))
      );
      const websiteLink = product.onlineStoreUrl || (product.handle ? `https://${process.env.SHOPIFY_STORE_URL}/products/${product.handle}` : "");

      await sheetRequest({
        action: "append",
        alibabaLink: task?.alibabaLink || "",
        websiteLink,
        productName: product.title,
        country: task?.marketCountry || "",
      });

      await postSlack(
        `${agentTag}🛒 *New winning product — pricing needed*\n` +
          `*${product.title}* (${task?.marketCountry || "market unknown"}) just hit ${n} sales.\n` +
          `A row has been added to the sourcing sheet — please fill in the *1 / 2 / 3 / 5 item prices in EUR (€)*:\n${SHEET_LINK}\n` +
          (task?.alibabaLink ? `Alibaba: ${task.alibabaLink}` : "⚠ No Alibaba link on the pipeline card — check with the funnel builder.")
      );
      await pushCrmNotification(ADMIN_EMAIL, `Sourcing request sent for "${product.title}" (${n} sales) — waiting for prices in the sheet`);

      store.products[title] = { status: "requested", at: new Date().toISOString(), country: task?.marketCountry || "" };
      result.requested.push(title);
    } catch (e) {
      console.error(`Sourcing request error for ${title}:`, e.message);
      result.attention.push(`${title}: ${e.message}`);
    }
  }

  /* ---- STAP 2: ingevulde prijzen uit de sheet → Shopify unit costs ---- */
  const pending = Object.entries(store.products).filter(([, p]) => p.status === "requested");
  if (pending.length) {
    let rows = [];
    try {
      rows = (await sheetRequest({ action: "list" })).rows || [];
    } catch (e) {
      console.error("Sheet read error:", e.message);
    }
    for (const [title, p] of pending) {
      try {
        const row = rows.find((r) => String(r.productName).trim().toLowerCase() === title.trim().toLowerCase());
        if (!row) continue;
        const prices = { 1: parsePrice(row.p1), 2: parsePrice(row.p2), 3: parsePrice(row.p3), 5: parsePrice(row.p5) };
        if (!prices[1] && !prices[2] && !prices[3] && !prices[5]) continue; // nog niets ingevuld

        const product = await getProductByTitle(title);
        if (!product) continue;
        const variants = product.variants.nodes;
        let applied = 0;
        let unmatched = [];
        for (const v of variants) {
          const qty = variantQuantity(v.title, variants.length === 1);
          if (qty == null) {
            unmatched.push(v.title);
            continue;
          }
          const price = prices[qty];
          if (price == null) continue; // die prijs is (nog) niet ingevuld
          if (v.inventoryItem?.id) {
            await setUnitCost(v.inventoryItem.id, price);
            applied++;
          }
        }

        if (applied > 0) {
          store.products[title] = { ...p, status: "priced", pricedAt: new Date().toISOString(), applied };
          result.priced.push(title);
          await pushCrmNotification(
            ADMIN_EMAIL,
            `Prices for "${title}" applied from the sourcing sheet (${applied} variant${applied === 1 ? "" : "s"}) — dashboard is now calculating with them` +
              (unmatched.length ? `. ⚠ Could not match: ${unmatched.join(", ")} — set those in Product Economics` : "")
          );
          await postSlack(`✅ Prices for *${title}* received and applied to the dashboard. ${agentTag}thank you!`);
        } else if (unmatched.length) {
          if (!p.notifiedNoMatch) {
            store.products[title] = { ...p, notifiedNoMatch: true };
            await pushCrmNotification(
              ADMIN_EMAIL,
              `Prices for "${title}" are in the sheet, but the variants (${unmatched.join(", ")}) could not be matched to 1/2/3/5 — set them manually in Product Economics`
            );
          }
          result.attention.push(`${title}: variants not matchable`);
        }
      } catch (e) {
        console.error(`Price apply error for ${title}:`, e.message);
        result.attention.push(`${title}: ${e.message}`);
      }
    }
  }

  await writeData("sourcing", store);
  return result;
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = getSession(req);
    const isAdmin = !!session?.admin;

    if (req.method === "GET") {
      if (!isAdmin) return res.status(401).json({ success: false, error: "Admin only" });
      const store = (await readData("sourcing")) || { products: {}, lastScanAt: null };
      return res.status(200).json({ success: true, store });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, key, force } = req.body || {};
    const isInternal = key && key === internalKey();
    if (!isInternal && !isAdmin) return res.status(401).json({ success: false, error: "No access" });

    if (action === "scan") {
      const result = await runScan(force === true);
      return res.status(200).json({ success: true, ...result });
    }

    // Reset van één product (admin): opnieuw laten triggeren of status wissen
    if (action === "reset" && isAdmin) {
      const store = (await readData("sourcing")) || { products: {}, lastScanAt: null };
      delete store.products[String(req.body.product || "")];
      await writeData("sourcing", store);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Sourcing error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
