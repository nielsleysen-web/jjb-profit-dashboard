// pages/api/set-cogs.js
// Slaat unit costs (COGS) op in Shopify — direct op de variant (inventoryItem.unitCost).
// POST /api/set-cogs  body: { updates: [{ inventoryItemId, cost }] }
// Vereist scope: write_inventory

import axios from "axios";

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

const MUTATION = `
  mutation SetUnitCost($id: ID!, $cost: Decimal!) {
    inventoryItemUpdate(id: $id, input: {cost: $cost}) {
      inventoryItem { id unitCost { amount } }
      userErrors { field message }
    }
  }
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: "Geen updates meegegeven" });
    }

    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const token = await getShopifyToken(storeUrl);
    const endpoint = `https://${storeUrl}/admin/api/2025-01/graphql.json`;

    const results = [];
    const errors = [];

    for (const u of updates) {
      if (!u.inventoryItemId || u.cost == null || isNaN(parseFloat(u.cost))) {
        errors.push({ id: u.inventoryItemId, message: "Ongeldige input" });
        continue;
      }
      const response = await axios.post(
        endpoint,
        {
          query: MUTATION,
          variables: { id: u.inventoryItemId, cost: String(parseFloat(u.cost)) },
        },
        {
          headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
          timeout: 15000,
        }
      );

      const payload = response.data?.data?.inventoryItemUpdate;
      const userErrors = payload?.userErrors || [];
      if (response.data.errors) {
        errors.push({ id: u.inventoryItemId, message: JSON.stringify(response.data.errors) });
      } else if (userErrors.length > 0) {
        errors.push({ id: u.inventoryItemId, message: userErrors.map((e) => e.message).join(", ") });
      } else {
        results.push({
          id: payload.inventoryItem.id,
          unitCost: parseFloat(payload.inventoryItem.unitCost.amount),
        });
      }
    }

    return res.status(200).json({ success: errors.length === 0, saved: results, errors });
  } catch (error) {
    console.error("Set COGS error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
