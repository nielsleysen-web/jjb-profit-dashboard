// lib/shopify-admin.js
// Kleine Shopify Admin GraphQL-helper voor de checkout-routes (server-only).
// Env: SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET

import axios from "axios";

let tokenCache = { token: null, expiresAt: 0 };

async function getToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET });
  const r = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
  tokenCache = { token: r.data.access_token, expiresAt: Date.now() + (r.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}

export async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getToken(storeUrl);
  const r = await axios.post(`https://${storeUrl}/admin/api/2025-01/graphql.json`, { query, variables }, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 });
  if (r.data.errors) throw new Error(JSON.stringify(r.data.errors));
  return r.data.data;
}

// De Shopify-order die de webhook voor deze Stripe-factuur aanmaakte (tag stripe-inv-<id>)
export async function findOrderForInvoice(invoiceId) {
  const tag = `stripe-inv-${invoiceId}`.slice(0, 40);
  const d = await shopifyGraphql(
    `query($q: String!) { orders(first: 1, query: $q) { nodes { id name note statusPageUrl totalTaxSet { shopMoney { amount } } } } }`,
    { q: `tag:'${tag}'` }
  );
  return d.orders.nodes[0] || null;
}
