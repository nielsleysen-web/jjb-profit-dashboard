// pages/api/products-search.js
// Zoekt producten in Shopify (live) incl. varianten, prijzen en unit costs.
// GET /api/products-search?q=zoekterm   (zonder q: eerste 50 producten)

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

const SEARCH_QUERY = `
  query SearchProducts($q: String, $first: Int!, $after: String) {
    products(first: $first, query: $q, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        featuredImage { url(transform: {maxWidth: 120, maxHeight: 120}) }
        variants(first: 25) {
          nodes {
            id
            title
            price
            inventoryItem { id unitCost { amount } }
          }
        }
      }
    }
  }
`;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const token = await getShopifyToken(storeUrl);
    const endpoint = `https://${storeUrl}/admin/api/2025-01/graphql.json`;
    const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
    const q = (req.query.q || "").trim();

    // Zonder zoekterm: ALLE producten doorlopen (paginatie), zodat ook
    // producten verderop in het alfabet (Neurotone, Varicose, ...) meekomen.
    const nodes = [];
    let after = null;
    let hasNextPage = true;
    let pages = 0;
    while (hasNextPage && pages < 5) {
      const response = await axios.post(
        endpoint,
        {
          query: SEARCH_QUERY,
          variables: { q: q ? `title:*${q}*` : null, first: 100, after },
        },
        { headers, timeout: 15000 }
      );
      if (response.data.errors) {
        throw new Error(JSON.stringify(response.data.errors));
      }
      const conn = response.data.data.products;
      nodes.push(...conn.nodes);
      hasNextPage = conn.pageInfo.hasNextPage;
      after = conn.pageInfo.endCursor;
      pages++;
      if (q && nodes.length >= 50) break; // bij zoeken zijn 50 resultaten genoeg
    }

    const products = nodes.map((p) => ({
      id: p.id,
      title: p.title,
      image: p.featuredImage?.url || null,
      variants: p.variants.nodes.map((v) => ({
        id: v.id,
        title: v.title,
        price: parseFloat(v.price),
        inventoryItemId: v.inventoryItem?.id || null,
        unitCost: v.inventoryItem?.unitCost?.amount != null
          ? parseFloat(v.inventoryItem.unitCost.amount)
          : null,
      })),
    }));

    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Products search error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
