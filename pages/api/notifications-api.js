// pages/api/notifications.js
// In-app notifications for every user (assignments, mentions, status changes).
// Storage: Shopify metaobject (type jjb_dashboard_data, handle "notifications").

import axios from "axios";
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

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

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Not signed in" });
  res.setHeader("Cache-Control", "no-store");

  try {
    const store = (await readData("notifications")) || { items: [] };
    const mine = store.items
      .filter((n) => n.email === session.email)
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
      .slice(0, 50);

    if (req.method === "GET") {
      return res.status(200).json({
        success: true,
        notifications: mine,
        unread: mine.filter((n) => !n.read).length,
      });
    }

    if (req.method === "POST") {
      const { action } = req.body || {};
      if (action === "markRead") {
        let changed = false;
        for (const n of store.items) {
          if (n.email === session.email && !n.read) {
            n.read = true;
            changed = true;
          }
        }
        if (changed) await writeData("notifications", store);
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ success: false, error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Notifications error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
