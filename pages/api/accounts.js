// pages/api/accounts.js
// Account Management — alleen toegankelijk voor de admin (nielsleysen@gmail.com).
// GET: lijst van alle accounts. POST: status/rechten wijzigen of account verwijderen.

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

/* ---------------- sessie check ---------------- */
function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return null;
  const [body, sig] = token.split(".");
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
  tokenCache = {
    token: response.data.access_token,
    expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000,
  };
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

async function readAccounts() {
  const data = await shopifyGraphql(`
    query { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: "accounts" }) { field(key: "data") { value } } }
  `);
  const raw = data?.metaobjectByHandle?.field?.value;
  try {
    return raw ? JSON.parse(raw) : { users: [] };
  } catch {
    return { users: [] };
  }
}

async function writeAccounts(accounts) {
  const data = await shopifyGraphql(
    `mutation Save($value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: "accounts" }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id }
        userErrors { message }
      }
    }`,
    { value: JSON.stringify(accounts) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session || !session.admin) {
    return res.status(401).json({ success: false, error: "Only the administrator has access." });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const accounts = await readAccounts();
      // Wachtwoord-hashes nooit naar de client sturen
      const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
      return res.status(200).json({ success: true, users });
    }

    if (req.method === "POST") {
      const { userId, updates, remove } = req.body || {};
      if (!userId) return res.status(400).json({ success: false, error: "No userId" });

      const accounts = await readAccounts();
      const user = accounts.users.find((u) => u.id === userId);
      if (!user) return res.status(404).json({ success: false, error: "Account not found" });

      // De admin zelf kan niet verwijderd of afgezwakt worden
      if (user.email === ADMIN_EMAIL && (remove || (updates && updates.status && updates.status !== "active"))) {
        return res.status(400).json({ success: false, error: "The admin account cannot be modified or removed." });
      }

      if (remove) {
        accounts.users = accounts.users.filter((u) => u.id !== userId);
      } else if (updates) {
        const allowed = ["status", "finance", "strategy", "marketing", "name"];
        for (const key of allowed) {
          if (key in updates) user[key] = updates[key];
        }
      }

      await writeAccounts(accounts);
      const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
      return res.status(200).json({ success: true, users });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Accounts error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
