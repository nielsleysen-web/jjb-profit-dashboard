import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { range = "7d" } = req.query;
    const { dateFrom, dateTo } = getDateRange(range);

    // Fetch both data sources in parallel
    const [shopifyData, metaData] = await Promise.all([
      fetchShopifyData(dateFrom, dateTo),
      fetchMetaData(dateFrom, dateTo)
    ]);

    // Combine and calculate metrics
    const dashboard = calculateMetrics(shopifyData, metaData);

    return res.status(200).json({
      success: true,
      data: dashboard,
      dateFrom,
      dateTo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch dashboard data"
    });
  }
}

function getDateRange(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateTo = today.toISOString().split("T")[0];

  let daysAgo = 7;
  if (range === "1d") daysAgo = 1;
  else if (range === "14d") daysAgo = 14;
  else if (range === "30d") daysAgo = 30;

  const dateFrom = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return { dateFrom, dateTo };
}

async function fetchMetaData(dateFrom, dateTo) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.warn("META_ACCESS_TOKEN not set - returning 0 ad spend");
    return { spend: 0, accountsData: {} };
  }

  try {
    const accounts = ["1729", "2349"];
    let totalSpend = 0;
    const accountsData = {};

    // Fetch data for both accounts
    for (const accountId of accounts) {
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v18.0/act_${accountId}/insights`,
          {
            params: {
              access_token: token,
              fields: "spend,impressions,clicks,actions,action_values",
              date_start: dateFrom,
              date_stop: dateTo,
              time_range: true
            },
            timeout: 10000
          }
        );

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          const spend = parseFloat(data.spend || 0);
          totalSpend += spend;
          accountsData[accountId] = {
            spend,
            impressions: data.impressions || 0,
            clicks: data.clicks || 0
          };
        }
      } catch (err) {
        console.warn(`Error fetching Meta data for account ${accountId}:`, err.message);
        accountsData[accountId] = { spend: 0, impressions: 0, clicks: 0 };
      }
    }

    return { spend: totalSpend, accountsData };
  } catch (error) {
    console.error("Meta API Error:", error.message);
    throw new Error("Failed to fetch Meta ad spend data");
  }
}

async function fetchShopifyData(dateFrom, dateTo) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;

  if (!storeUrl || !clientId) {
    console.warn("Shopify credentials not set - returning mock data");
    return getMockShopifyData();
  }

  try {
    // Shopify GraphQL query for orders
    const query = `
      query {
        orders(first: 100, query: "created:[${dateFrom}T00:00:00Z TO ${dateTo}T23:59:59Z]") {
          edges {
            node {
              id
              createdAt
              totalPrice
              subtotalPrice
              totalShippingPrice
              totalTax
              lineItems(first: 100) {
                edges {
                  node {
                    title
                    quantity
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${storeUrl}/admin/api/2024-01/graphql.json`,
      { query },
      {
        headers: {
          "X-Shopify-Access-Token": clientId,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    if (response.data.errors) {
      console.warn("Shopify API returned errors:", response.data.errors);
      return getMockShopifyData();
    }

    const orders = response.data.data?.orders?.edges || [];

    // Process orders
    let totalOrders = 0;
    let totalRevenue = 0;
    const productMap = {};
    let totalCOGS = 0;
    let totalFees = 0;

    for (const order of orders) {
      const node = order.node;
      totalOrders++;
      totalRevenue += parseFloat(node.totalPrice);

      // Calculate fees (Shopify takes ~2.9% + 30¢)
      const orderSubtotal = parseFloat(node.subtotalPrice);
      const orderFee = orderSubtotal * 0.029 + 0.3;
      totalFees += orderFee;

      // Process line items
      for (const item of node.lineItems.edges) {
        const product = item.node;
        const productName = product.title;

        if (!productMap[productName]) {
          productMap[productName] = {
            name: productName,
            orders: 0,
            revenue: 0,
            cogs: 0,
            adSpend: 0
          };
        }

        productMap[productName].orders += product.quantity;
        productMap[productName].revenue += parseFloat(product.price) * product.quantity;

        // Estimate COGS (30-40% of price) - in production, query your actual COGS
        const estimatedCOGS = parseFloat(product.price) * product.quantity * 0.35;
        productMap[productName].cogs += estimatedCOGS;
        totalCOGS += estimatedCOGS;
      }
    }

    const products = Object.values(productMap);

    return {
      totalOrders,
      revenue: totalRevenue,
      cogsAndFees: totalCOGS + totalFees,
      cogs: totalCOGS,
      fees: totalFees,
      cogsPercent: totalRevenue > 0 ? (totalCOGS / totalRevenue) * 100 : 0,
      feesPercent: totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0,
      ordersChange: 0, // Would calculate from previous period
      revenueChange: 0, // Would calculate from previous period
      aovChange: 0, // Would calculate from previous period
      products
    };
  } catch (error) {
    console.error("Shopify API Error:", error.message);
    return getMockShopifyData();
  }
}

function getMockShopifyData() {
  return {
    totalOrders: 7,
    ordersChange: 133.3,
    revenue: 700,
    revenueChange: 156.45,
    cogsAndFees: 320,
    cogs: 245,
    fees: 75,
    cogsPercent: 35,
    feesPercent: 10.7,
    aovChange: 10,
    products: [
      {
        name: "Cerotto CircuMax",
        orders: 4,
        revenue: 239.58,
        cogs: 83.85,
        adSpend: 0,
        profit: 155.73
      },
      {
        name: "Neurotone Drops",
        orders: 2,
        revenue: 76.19,
        cogs: 26.67,
        adSpend: 0,
        profit: 49.52
      },
      {
        name: "ArmLift",
        orders: 1,
        revenue: 54.45,
        cogs: 19.06,
        adSpend: 0,
        profit: 35.39
      }
    ]
  };
}

function calculateMetrics(shopifyData, metaData) {
  const totalOrders = shopifyData.totalOrders || 0;
  const revenue = shopifyData.revenue || 0;
  const cogsAndFees = shopifyData.cogsAndFees || 0;
  const adSpend = metaData.spend || 0;

  const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;
  const netProfit = revenue - cogsAndFees - adSpend;
  const profitPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const adSpendPercent = revenue > 0 ? (adSpend / revenue) * 100 : 0;

  // Process products with profit calculation
  const products = (shopifyData.products || []).map((product) => ({
    name: product.name,
    orders: product.orders,
    revenue: product.revenue,
    cogs: product.cogs,
    adSpend: product.adSpend || 0,
    profit: product.revenue - product.cogs - (product.adSpend || 0),
    roas: product.adSpend > 0 ? product.revenue / product.adSpend : 0
  }));

  // Sort by profit descending
  products.sort((a, b) => b.profit - a.profit);

  return {
    totalOrders,
    ordersChange: shopifyData.ordersChange || 0,
    revenue,
    revenueChange: shopifyData.revenueChange || 0,
    cogsAndFees,
    cogs: shopifyData.cogs || 0,
    fees: shopifyData.fees || 0,
    cogsPercent: shopifyData.cogsPercent || 0,
    feesPercent: shopifyData.feesPercent || 0,
    avgOrderValue,
    aovChange: shopifyData.aovChange || 0,
    adSpend,
    roas,
    netProfit,
    profitChange: 0, // Would calculate from previous period
    profitPercent,
    profitPercentChange: 0, // Would calculate from previous period
    adSpendPercent,
    products
  };
}
