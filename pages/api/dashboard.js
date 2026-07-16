// pages/api/dashboard.js
// JJB Profit Dashboard — REAL data endpoint (Shopify + Meta)
//
// Env vars (Vercel → Settings → Environment Variables):
//   SHOPIFY_STORE_URL      = your-store.myshopify.com  (zonder https://)
//   SHOPIFY_CLIENT_ID      = uit Dev Dashboard → app → Settings
//   SHOPIFY_CLIENT_SECRET  = uit Dev Dashboard → app → Settings
//   META_ACCESS_TOKEN      = EAAW...
//   META_AD_ACCOUNT_IDS    = 1729,2349                 (volledige act_ nummers, komma-gescheiden)
//
// Auth: client credentials grant (Dev Dashboard app). De code haalt zelf een
// access token op en vernieuwt het automatisch voor het na 24u vervalt.

import axios from "axios";

const SHOPIFY_API_VERSION = "2025-01";
const STORE_TIMEZONE = "Europe/Brussels";

// Fallback payment fee voor orders zonder geregistreerde transaction fees
// (bv. PayPal). Shopify Payments fees worden EXACT uit de transacties gelezen.
const FALLBACK_FEE_PERCENT = 0.029;
const FALLBACK_FEE_FIXED = 0.3;

// Optionele COGS override per variant. Wordt gebruikt als er GEEN unitCost
// in Shopify staat. Key = "Product titel|Variant titel", value = kostprijs in EUR.
// Voorbeeld: "ArmLift|2": 10.43
const COGS_MAP = {
  // TODO: exacte COGS invullen (of unitCost in Shopify zetten — heeft voorrang niet nodig,
  // Shopify unitCost wordt altijd eerst geprobeerd)
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { range = "7d" } = req.query;
    const { dateFrom, dateTo, prevFrom, prevTo } = getDateRange(range);

    // 1 window = huidige + vorige periode → in één keer ophalen, daarna splitsen
    const [orders, meta] = await Promise.all([
      fetchShopifyOrders(prevFrom, dateTo),
      fetchMetaData(prevFrom, dateTo),
    ]);

    const dashboard = buildDashboard(orders, meta, { dateFrom, dateTo, prevFrom, prevTo });

    return res.status(200).json({
      success: true,
      data: dashboard,
      dateFrom,
      dateTo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch dashboard data",
    });
  }
}

/* ---------------- date helpers (store-tijdzone, niet UTC) ---------------- */

function localDateStr(date) {
  // YYYY-MM-DD in Europe/Brussels
  return date.toLocaleDateString("sv-SE", { timeZone: STORE_TIMEZONE });
}

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function getDateRange(range) {
  const today = localDateStr(new Date());
  let dateFrom, dateTo;

  if (range === "today") {
    dateFrom = today;
    dateTo = today;
  } else if (range === "yesterday") {
    dateFrom = shiftDays(today, -1);
    dateTo = dateFrom;
  } else {
    let days = 7;
    if (range === "1d") days = 1;
    else if (range === "14d") days = 14;
    else if (range === "30d") days = 30;
    dateTo = today;
    dateFrom = shiftDays(today, -(days - 1)); // inclusief vandaag
  }

  // Vorige periode van gelijke lengte, direct ervoor
  const periodLen =
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  const prevTo = shiftDays(dateFrom, -1);
  const prevFrom = shiftDays(prevTo, -(periodLen - 1));

  return { dateFrom, dateTo, prevFrom, prevTo };
}

/* --------------------------- Shopify (GraphQL) --------------------------- */

const ORDERS_QUERY = `
  query DashboardOrders($first: Int!, $query: String, $after: String) {
    orders(first: $first, query: $query, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        currentTotalPriceSet { shopMoney { amount } }
        currentSubtotalPriceSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            discountedTotalSet { shopMoney { amount } }
            product { title }
            variant { title inventoryItem { unitCost { amount } } }
          }
        }
        transactions {
          kind
          status
          fees { amount { amount } }
        }
      }
    }
  }
`;

// Token cache (blijft geldig binnen een warme serverless instance)
let shopifyTokenCache = { token: null, expiresAt: 0 };

async function getShopifyToken(storeUrl) {
  // 5 min veiligheidsmarge voor de 24u-vervaltijd
  if (shopifyTokenCache.token && Date.now() < shopifyTokenCache.expiresAt - 300000) {
    return shopifyTokenCache.token;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_CLIENT_ID of SHOPIFY_CLIENT_SECRET ontbreekt in environment variables"
    );
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let response;
  try {
    response = await axios.post(
      `https://${storeUrl}/admin/oauth/access_token`,
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`Shopify TOKEN request mislukt — ${detail}`);
  }

  const { access_token, expires_in } = response.data;
  if (!access_token) {
    throw new Error("Shopify token request gaf geen access_token terug");
  }

  shopifyTokenCache = {
    token: access_token,
    expiresAt: Date.now() + (expires_in || 86399) * 1000,
  };
  return access_token;
}

async function fetchShopifyOrders(dateFrom, dateTo) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  if (!storeUrl) {
    throw new Error("SHOPIFY_STORE_URL ontbreekt in environment variables");
  }
  const token = await getShopifyToken(storeUrl);

  const endpoint = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const searchQuery = `created_at:>='${dateFrom}T00:00:00+02:00' AND created_at:<='${dateTo}T23:59:59+02:00'`;

  const orders = [];
  let after = null;
  let hasNextPage = true;
  let pages = 0;

  while (hasNextPage && pages < 20) {
    let response;
    try {
      response = await axios.post(
        endpoint,
        {
          query: ORDERS_QUERY,
          variables: { first: 250, query: searchQuery, after },
        },
        {
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err.message;
      throw new Error(`Shopify ORDERS request mislukt — ${detail}`);
    }

    if (response.data.errors) {
      throw new Error(
        "Shopify API error: " + JSON.stringify(response.data.errors)
      );
    }

    const conn = response.data.data.orders;
    orders.push(...conn.nodes);
    hasNextPage = conn.pageInfo.hasNextPage;
    after = conn.pageInfo.endCursor;
    pages++;
  }

  return orders;
}

/* ------------------------------ Meta (Ads) ------------------------------- */

async function fetchMetaData(dateFrom, dateTo) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountIds = (process.env.META_AD_ACCOUNT_IDS || "1729,2349")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const empty = { dailySpend: {}, campaignSpend: [], accountsData: {} };
  if (!token) {
    console.warn("META_ACCESS_TOKEN not set — ad spend = 0");
    return empty;
  }

  const dailySpend = {}; // { 'YYYY-MM-DD': spend }
  const campaignSpend = []; // [{ name, spend, date }]
  const accountsData = {};

  await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        // Daily spend per campagne — daarmee kunnen we zowel de chart
        // als de product-matching voeden.
        const response = await axios.get(
          `https://graph.facebook.com/v21.0/act_${accountId}/insights`,
          {
            params: {
              access_token: token,
              level: "campaign",
              fields: "campaign_name,spend,impressions,clicks",
              time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
              time_increment: 1,
              limit: 500,
            },
            timeout: 15000,
          }
        );

        const rows = response.data?.data || [];
        let accountTotal = 0;

        for (const row of rows) {
          const spend = parseFloat(row.spend || 0);
          const day = row.date_start;
          accountTotal += spend;
          dailySpend[day] = (dailySpend[day] || 0) + spend;
          campaignSpend.push({ name: row.campaign_name || "", spend, date: day });
        }

        accountsData[accountId] = { spend: accountTotal };
      } catch (err) {
        console.warn(
          `Meta API error voor account ${accountId}:`,
          err.response?.data?.error?.message || err.message
        );
        accountsData[accountId] = { spend: 0, error: true };
      }
    })
  );

  return { dailySpend, campaignSpend, accountsData };
}

/* --------------------------- metrics opbouwen ---------------------------- */

function orderFees(order) {
  // Exacte fees uit Shopify transacties (Shopify Payments)
  let fees = 0;
  let hasRealFees = false;
  for (const t of order.transactions || []) {
    if (t.status !== "SUCCESS") continue;
    if (t.kind !== "SALE" && t.kind !== "CAPTURE") continue;
    for (const f of t.fees || []) {
      fees += parseFloat(f.amount.amount);
      hasRealFees = true;
    }
  }
  if (hasRealFees) return fees;

  // Fallback: geschat (bv. PayPal-orders zonder fees in Shopify)
  const subtotal = parseFloat(
    order.currentSubtotalPriceSet?.shopMoney?.amount || 0
  );
  return subtotal > 0 ? subtotal * FALLBACK_FEE_PERCENT + FALLBACK_FEE_FIXED : 0;
}

function lineItemCOGS(item) {
  const unitCost = item.variant?.inventoryItem?.unitCost?.amount;
  if (unitCost != null) return parseFloat(unitCost) * item.quantity;

  const key = `${item.product?.title || item.title}|${item.variant?.title || ""}`;
  if (COGS_MAP[key] != null) return COGS_MAP[key] * item.quantity;

  return 0; // COGS onbekend → 0, wordt zichtbaar in dashboard
}

function summarizeOrders(orders) {
  let totalOrders = 0;
  let revenue = 0;
  let cogs = 0;
  let fees = 0;
  const productMap = {};
  const daily = {}; // { day: { orders, revenue, cogs, fees } }

  for (const order of orders) {
    totalOrders++;
    const gross = parseFloat(order.currentTotalPriceSet.shopMoney.amount);
    const refunded = parseFloat(
      order.totalRefundedSet?.shopMoney?.amount || 0
    );
    const net = gross - refunded;
    revenue += net;

    const f = orderFees(order);
    fees += f;

    const day = localDateStr(new Date(order.createdAt));
    if (!daily[day]) daily[day] = { orders: 0, revenue: 0, cogs: 0, fees: 0 };
    daily[day].orders++;
    daily[day].revenue += net;
    daily[day].fees += f;

    for (const item of order.lineItems.nodes) {
      const name = item.product?.title || item.title;
      const itemCogs = lineItemCOGS(item);
      const itemRevenue = parseFloat(
        item.discountedTotalSet?.shopMoney?.amount || 0
      );

      cogs += itemCogs;
      daily[day].cogs += itemCogs;

      if (itemRevenue === 0 && itemCogs === 0) continue; // gratis geschenken overslaan

      if (!productMap[name]) {
        productMap[name] = { name, orders: 0, revenue: 0, cogs: 0, adSpend: 0 };
      }
      productMap[name].orders += item.quantity;
      productMap[name].revenue += itemRevenue;
      productMap[name].cogs += itemCogs;
    }
  }

  return { totalOrders, revenue, cogs, fees, productMap, daily };
}

function pctChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function matchAdSpendToProducts(productMap, campaignSpend, inPeriod) {
  // Ad spend per product o.b.v. campagnenaam die de productnaam bevat
  for (const row of campaignSpend) {
    if (!inPeriod(row.date)) continue;
    const campaign = row.name.toLowerCase();
    for (const product of Object.values(productMap)) {
      if (campaign.includes(product.name.toLowerCase())) {
        product.adSpend += row.spend;
        break;
      }
    }
  }
}

function buildDashboard(orders, meta, { dateFrom, dateTo, prevFrom, prevTo }) {
  const inCurrent = (d) => d >= dateFrom && d <= dateTo;
  const inPrev = (d) => d >= prevFrom && d <= prevTo;

  const currentOrders = orders.filter((o) =>
    inCurrent(localDateStr(new Date(o.createdAt)))
  );
  const prevOrders = orders.filter((o) =>
    inPrev(localDateStr(new Date(o.createdAt)))
  );

  const cur = summarizeOrders(currentOrders);
  const prev = summarizeOrders(prevOrders);

  // Meta spend splitsen in huidige/vorige periode
  let adSpend = 0;
  let prevAdSpend = 0;
  for (const [day, spend] of Object.entries(meta.dailySpend)) {
    if (inCurrent(day)) adSpend += spend;
    else if (inPrev(day)) prevAdSpend += spend;
  }

  matchAdSpendToProducts(cur.productMap, meta.campaignSpend, inCurrent);

  // Kerncijfers
  const netProfit = cur.revenue - cur.cogs - cur.fees - adSpend;
  const prevNetProfit = prev.revenue - prev.cogs - prev.fees - prevAdSpend;
  const avgOrderValue = cur.totalOrders > 0 ? cur.revenue / cur.totalOrders : 0;
  const prevAOV = prev.totalOrders > 0 ? prev.revenue / prev.totalOrders : 0;
  const profitPercent = cur.revenue > 0 ? (netProfit / cur.revenue) * 100 : 0;
  const prevProfitPercent =
    prev.revenue > 0 ? (prevNetProfit / prev.revenue) * 100 : 0;

  // Profit per day (chart)
  const profitPerDay = [];
  for (let d = dateFrom; d <= dateTo; d = shiftDays(d, 1)) {
    const day = cur.daily[d] || { orders: 0, revenue: 0, cogs: 0, fees: 0 };
    const spend = inCurrent(d) ? meta.dailySpend[d] || 0 : 0;
    profitPerDay.push({
      date: d,
      orders: day.orders,
      revenue: round2(day.revenue),
      cogs: round2(day.cogs),
      fees: round2(day.fees),
      adSpend: round2(spend),
      profit: round2(day.revenue - day.cogs - day.fees - spend),
    });
  }

  // Producten gesorteerd op winst
  const products = Object.values(cur.productMap)
    .map((p) => ({
      ...p,
      revenue: round2(p.revenue),
      cogs: round2(p.cogs),
      adSpend: round2(p.adSpend),
      profit: round2(p.revenue - p.cogs - p.adSpend),
      roas: p.adSpend > 0 ? round2(p.revenue / p.adSpend) : null,
    }))
    .sort((a, b) => b.profit - a.profit);

  return {
    currency: "EUR",
    totalOrders: cur.totalOrders,
    ordersChange: round1(pctChange(cur.totalOrders, prev.totalOrders)),
    revenue: round2(cur.revenue),
    revenueChange: round1(pctChange(cur.revenue, prev.revenue)),
    cogs: round2(cur.cogs),
    fees: round2(cur.fees),
    cogsAndFees: round2(cur.cogs + cur.fees),
    cogsPercent: cur.revenue > 0 ? round1((cur.cogs / cur.revenue) * 100) : 0,
    feesPercent: cur.revenue > 0 ? round1((cur.fees / cur.revenue) * 100) : 0,
    avgOrderValue: round2(avgOrderValue),
    aovChange: round1(pctChange(avgOrderValue, prevAOV)),
    adSpend: round2(adSpend),
    adSpendPercent:
      cur.revenue > 0 ? round1((adSpend / cur.revenue) * 100) : 0,
    roas: adSpend > 0 ? round2(cur.revenue / adSpend) : 0,
    netProfit: round2(netProfit),
    profitChange: round1(pctChange(netProfit, prevNetProfit)),
    profitPercent: round1(profitPercent),
    profitPercentChange: round1(profitPercent - prevProfitPercent),
    profitPerDay,
    products,
    metaAccounts: meta.accountsData,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;
