// pages/api/constraint-data.js
// Opslag voor de Constraint Focus pagina — bewaard als metaobject in Shopify.
// Beveiligd met een apart wachtwoord (header x-focus-password).
// Vereist scopes: read_metaobjects, write_metaobjects

import axios from "axios";

const FOCUS_PASSWORD = process.env.FOCUS_PASSWORD || "Keeper1234@";

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
  // Apart wachtwoord voor deze pagina — server-side gecheckt
  if (req.headers["x-focus-password"] !== FOCUS_PASSWORD) {
    return res.status(401).json({ success: false, error: "Onjuist wachtwoord" });
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
        return res.status(400).json({ success: false, error: "Geen data meegegeven" });
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
