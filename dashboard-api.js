import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { range = "7d" } = req.query;

    // Get date range
    const dates = getDateRange(range);
    const { dateFrom, dateTo } = dates;

    // Fetch Shopify data
    const shopifyData = await fetchShopifyData(dateFrom, dateTo);

    // Fetch Meta data
    const metaData = await fetchMetaData(dateFrom, dateTo);

    // Combine and calculate metrics
    const dashboard = {
      totalOrders: shopifyData.totalOrders || 0,
      ordersChange: shopifyData.ordersChange || 0,
      revenue: shopifyData.revenue || 0,
      revenueChange: shopifyData.revenueChange || 0,
      cogsAndFees: shopifyData.cogsAndFees || 0,
      cogsPercent: shopifyData.cogsPercent || 0,
      feesPercent: shopifyData.feesPercent || 0,
      avgOrderValue: shopifyData.totalOrders > 0 ? shopifyData.revenue / shopifyData.totalOrders : 0,
      aovChange: shopifyData.aovChange || 0,
      adSpend: metaData.spend || 0,
      roas: metaData.spend > 0 ? shopifyData.revenue / metaData.spend : 0,
      netProfit: (shopifyData.revenue - shopifyData.cogsAndFees - metaData.spend) || 0,
      profitChange: 0, // Would calculate from previous period
      profitPercent: shopifyData.revenue > 0 ? ((shopifyData.revenue - shopifyData.cogsAndFees - metaData.spend) / shopifyData.revenue) * 100 : 0,
      profitPercentChange: 0,
      adSpendPercent: shopifyData.revenue > 0 ? (metaData.spend / shopifyData.revenue) * 100 : 0,
      products: shopifyData.products || []
    };

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
  const dateTo = today.toISOString().split("T")[0];
  
  let daysAgo = 7;
  if (range === "1d") daysAgo = 0;
  else if (range === "30d") daysAgo = 30;
  else if (range === "90d") daysAgo = 90;

  const dateFrom = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return { dateFrom, dateTo };
}

async function fetchShopifyData(dateFrom, dateTo) {
  // TODO: Implement Shopify GraphQL query
  // For now, return mock data structure
  
  return {
    totalOrders: 7,
    ordersChange: 133.3,
    revenue: 700,
    revenueChange: 156.45,
    cogsAndFees: 320, // Would be calculated
    cogsPercent: 35,
    feesPercent: 5,
    aovChange: 10,
    products: [
      {
        name: "Cerotto CircuMax",
        orders: 4,
        revenue: 239.58,
        cogs: 47.16,
        adSpend: 0,
        profit: 184.27,
        roas: 0
      },
      {
        name: "Neurotone Drops",
        orders: 2,
        revenue: 76.19,
        cogs: 17.10,
        adSpend: 0,
        profit: 58.28,
        roas: 0
      },
      {
        name: "ArmLift",
        orders: 1,
        revenue: 54.45,
        cogs: 12.84,
        adSpend: 0,
        profit: 39.73,
        roas: 0
      }
    ]
  };
}

async function fetchMetaData(dateFrom, dateTo) {
  // TODO: Implement Meta API calls for both accounts (1729 + 2349)
  // For now, return mock data
  
  return {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0
  };
}
