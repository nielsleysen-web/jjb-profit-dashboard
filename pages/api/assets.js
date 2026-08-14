// pages/api/assets.js
// Assets met toegangsbeheer per persoon.
// - Iedereen met een account ziet de Assets-pagina; wélke assets iemand ziet wordt
//   per asset bepaald: access "all" (heel het team) of "restricted" + allowedRoles.
// - Admin beheert alles: assets toevoegen/bewerken/verwijderen + toegang aanduiden.
// - Eerste keer draaien: de bestaande hardcoded assets worden automatisch als seed
//   in de databank gezet (allemaal op "all", zoals ze nu zichtbaar zijn).

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

const CATEGORIES = ["Documents", "Tools", "Marketing Creatives"];
const ROLES = ["Funnel Builder", "Creative Strategist", "Graphic Designer", "Store Manager", "Video Editor", "Media Buyer"];

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
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 15000 }
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

/* ---------------- seed: de assets zoals ze hardcoded op de pagina stonden ---------------- */
const SEED_ASSETS = [
  {
    category: "Documents",
    icon: "🖼️",
    title: "Sales Page Images — SOP",
    description: "Step-by-step standard operating procedure for creating and placing every image on the sales page.",
    href: "https://docs.google.com/document/d/13_lQFefaKE2BhcLPwE2Zi1f9ZL5hOCwwoHlJWB0aLpw/edit?usp=sharing",
    tag: "SOP",
  },
  {
    category: "Documents",
    icon: "✍️",
    title: "Sales Page Copy — Prompts",
    description: "The prompt collection for writing the sales page copy — use these when working outside the automated pipeline.",
    href: "https://docs.google.com/document/d/1Mv0ApyL8cFwgAB4E3i4jc7gDrufB0wgK0kNvq-hwqV4/edit?usp=sharing",
    tag: "Prompts",
  },
  {
    category: "Tools",
    icon: "🛠️",
    title: "Advertorial HTML Builder",
    description: "Paste a competitor advertorial, localise everything to your market (names, prices, institutions, units), replace images, get a live link for Funnelish.",
    href: "/advertorial-builder",
    tag: "Tool",
  },
  {
    category: "Marketing Creatives",
    icon: "🖋️",
    title: "Image Ad Headlines — Prompts",
    description: "The prompt collection for writing the headlines that go on our auto-generated image creatives.",
    href: "https://docs.google.com/document/d/1ftuzOJeE1NcXa74n79kl1ebc46XkePJH993AG0tDfJs/edit?usp=sharing",
    tag: "Prompts",
  },
  {
    category: "Marketing Creatives",
    icon: "🎨",
    title: "Sales Page Creatives",
    description: "The sales page creative images we use — the shared folder with all source files.",
    href: "https://drive.google.com/drive/folders/1RZG4Es0V1FBtUgDSMXArdBxHzLlOHYbq?usp=sharing",
    tag: "Creatives",
  },
];

async function loadStore() {
  let store = await readData("assets");
  if (!store || !Array.isArray(store.assets)) {
    store = {
      assets: SEED_ASSETS.map((a) => ({ ...a, id: uid(), access: "all", allowedRoles: [], createdAt: new Date().toISOString() })),
    };
    await writeData("assets", store);
  }
  return store;
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Not logged in" });
  const isAdmin = !!session.admin || (session.email || "").toLowerCase() === ADMIN_EMAIL;
  res.setHeader("Cache-Control", "no-store");

  try {
    const store = await loadStore();

    if (req.method === "GET") {
      const userRoles = session.roles || [];
      // Zichtbaarheid: "all" = heel het team; "restricted" = alleen de aangeduide ROLLEN. Admin ziet alles.
      const visible = isAdmin
        ? store.assets
        : store.assets.filter((a) => a.access !== "restricted" || (a.allowedRoles || []).some((r) => userRoles.includes(r)));
      return res.status(200).json({ success: true, assets: visible, categories: CATEGORIES, isAdmin, roles: ROLES });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can manage assets" });

    const { action, asset, assetId } = req.body || {};

    if (action === "save") {
      const input = asset || {};
      const clean = {
        category: CATEGORIES.includes(input.category) ? input.category : "Documents",
        icon: String(input.icon || "📄").slice(0, 8),
        title: String(input.title || "").trim().slice(0, 120),
        description: String(input.description || "").trim().slice(0, 400),
        href: String(input.href || "").trim().slice(0, 600),
        tag: String(input.tag || "").trim().slice(0, 30),
        access: input.access === "restricted" ? "restricted" : "all",
        allowedRoles: Array.isArray(input.allowedRoles) ? input.allowedRoles.filter((r) => ROLES.includes(r)) : [],
      };
      if (!clean.title) return res.status(400).json({ success: false, error: "Title is required" });
      if (!clean.href || !(/^https?:\/\//i.test(clean.href) || clean.href.startsWith("/"))) {
        return res.status(400).json({ success: false, error: "Link must start with https:// (or / for internal tools)" });
      }
      const existing = input.id && store.assets.find((a) => a.id === input.id);
      if (existing) Object.assign(existing, clean);
      else store.assets.push({ ...clean, id: uid(), createdAt: new Date().toISOString() });
      await writeData("assets", store);
      return res.status(200).json({ success: true, assets: store.assets });
    }

    if (action === "delete") {
      store.assets = store.assets.filter((a) => a.id !== assetId);
      await writeData("assets", store);
      return res.status(200).json({ success: true, assets: store.assets });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Assets error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
