export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { range = "7d" } = req.query;

    // Simple data - ready to replace with real API calls later
    const shopifyData = {
      totalOrders: 7,
      revenue: 700,
      cogs: 245,
      fees: 75,
      products: [
        {
          name: "Cerotto CircuMax",
          orders: 4,
          revenue: 239.58,
          cogs: 83.85,
          adSpend: 0
        },
        {
          name: "Neurotone Drops",
          orders: 2,
          revenue: 76.19,
          cogs: 26.67,
          adSpend: 0
        },
        {
          name: "ArmLift",
          orders: 1,
          revenue: 54.45,
          cogs: 19.06,
          adSpend: 0
        }
      ]
    };

    // Meta ad spend - replace this with real Meta API call later
    const metaSpend = 150;

    // Calculate metrics
    const totalOrders = shopifyData.totalOrders;
    const revenue = shopifyData.revenue;
    const cogsAndFees = shopifyData.cogs + shopifyData.fees;
    const adSpend = metaSpend;
    const netProfit = revenue - cogsAndFees - adSpend;
    const profitPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;
    const roas = adSpend > 0 ? revenue / adSpend : 0;
    const adSpendPercent = revenue > 0 ? (adSpend / revenue) * 100 : 0;

    // Process products
    const products = shopifyData.products.map(p => ({
      name: p.name,
      orders: p.orders,
      revenue: p.revenue,
      cogs: p.cogs,
      adSpend: p.adSpend || 0,
      profit: p.revenue - p.cogs - (p.adSpend || 0),
      roas: p.adSpend > 0 ? p.revenue / p.adSpend : 0
    }));

    // Sort by profit
    products.sort((a, b) => b.profit - a.profit);

    return res.status(200).json({
      success: true,
      data: {
        totalOrders,
        ordersChange: 133.3,
        revenue,
        revenueChange: 156.45,
        cogsAndFees,
        cogs: shopifyData.cogs,
        fees: shopifyData.fees,
        cogsPercent: (shopifyData.cogs / revenue * 100).toFixed(1),
        feesPercent: (shopifyData.fees / revenue * 100).toFixed(1),
        avgOrderValue,
        aovChange: 10,
        adSpend,
        roas: roas.toFixed(2),
        netProfit,
        profitChange: 0,
        profitPercent: profitPercent.toFixed(1),
        profitPercentChange: 0,
        adSpendPercent: adSpendPercent.toFixed(1),
        products
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch dashboard data"
    });
  }
}
