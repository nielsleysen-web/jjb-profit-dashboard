// pages/api/latest-orders.js
// Laatste orders voor realtime sale-notificaties (confetti + toast).
// Vereist scopes: read_orders, read_products, read_customers

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

const QUERY = `
  query LatestOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        currentTotalPriceSet { shopMoney { amount } }
        customer { firstName lastName }
        shippingAddress { city country }
        lineItems(first: 5) {
          nodes {
            title
            quantity
            image { url(transform: {maxWidth: 120, maxHeight: 120}) }
            product { title }
          }
        }
      }
    }
  }
`;

const isFreeGift = (title) => /regalo|gratuito|free gift/i.test(title || "");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const storeUrl = process.env.SHOPIFY_STORE_URL;
    const token = await getShopifyToken(storeUrl);

    const response = await axios.post(
      `https://${storeUrl}/admin/api/2025-01/graphql.json`,
      { query: QUERY, variables: { first: 20 } },
      {
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    if (response.data.errors) {
      throw new Error(JSON.stringify(response.data.errors));
    }

    const orders = response.data.data.orders.nodes.map((o) => {
      const items = o.lineItems.nodes
        .filter((i) => !isFreeGift(i.product?.title || i.title))
        .map((i) => ({
          title: i.product?.title || i.title,
          quantity: i.quantity,
          image: i.image?.url || null,
        }));
      const fullName = [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ");
      return {
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        total: parseFloat(o.currentTotalPriceSet?.shopMoney?.amount || 0),
        customer: o.customer?.firstName || null,
        customerFull: fullName || null,
        city: o.shippingAddress?.city || null,
        country: o.shippingAddress?.country || null,
        items,
      };
    });

    // Geen browser-caching: we willen verse data bij elke poll
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Latest orders error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
