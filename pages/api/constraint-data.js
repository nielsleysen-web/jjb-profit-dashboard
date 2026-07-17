// pages/api/constraint-data.js
// Opslag voor de Constraint Focus pagina — bewaard als metaobject in Shopify.
// Beveiligd via Operations Centre accounts: alleen Strategy-rechten (of admin).
// Vereist scopes: read_metaobjects, write_metaobjects

import axios from "axios";
import crypto from "crypto";

// --- sessie check (Operations Centre accounts) ---
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
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) {
    return tokenCache.token;
  }
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await axios.post(
    `https://${storeUrl}/admin/oauth/access_token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  tokenCache = {
    token: response.data.access_token,
    expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000,
  };
  return tokenCache.token;
}

const GET_QUERY = `
  query GetFocusData {
    metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: "constraint-focus" }) {
      field(key: "data") { value }
    }
  }
`;

const UPSERT_MUTATION = `
  mutation SaveFocusData($value: String!) {
    metaobjectUpsert(
      handle: { type: "jjb_dashboard_data", handle: "constraint-focus" },
      metaobject: { fields: [{ key: "data", value: $value }] }
    ) {
      metaobject { id }
      userErrors { field message }
    }
  }
`;

const EMPTY = { constraints: [], hypotheses: [] };

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session || !(session.strategy || session.admin)) {
    return res.status(401).json({ success: false, error: "No access — Strategy permission required" });
  }

  try {
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const token = await getShopifyToken(storeUrl);
    const endpoint = `https://${storeUrl}/admin/api/2025-01/graphql.json`;
    const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

    if (req.method === "GET") {
      const response = await axios.post(
        endpoint,
        { query: GET_QUERY },
        { headers, timeout: 15000 }
      );
      if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));

      const raw = response.data.data?.metaobjectByHandle?.field?.value;
      let data = EMPTY;
      try {
        data = raw ? JSON.parse(raw) : EMPTY;
      } catch {
        data = EMPTY;
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ success: true, data });
    }

    if (req.method === "POST") {
      const { data } = req.body || {};
      if (!data || typeof data !== "object") {
        return res.status(400).json({ success: false, error: "No data provided" });
      }
      const response = await axios.post(
        endpoint,
        { query: UPSERT_MUTATION, variables: { value: JSON.stringify(data) } },
        { headers, timeout: 15000 }
      );
      if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
      const userErrors = response.data.data?.metaobjectUpsert?.userErrors || [];
      if (userErrors.length > 0) {
        throw new Error(userErrors.map((e) => e.message).join(", "));
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Constraint data error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
