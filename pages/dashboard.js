import { useState, useEffect } from "react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("7d");

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/dashboard?range=${dateRange}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch data");
      }

      setData(result.data);
    } catch (err) {
      setError(err.message);
      console.error("Dashboard Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px" }}>
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px", borderRadius: "6px" }}>
          Error: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "40px" }}>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", background: "#f9fafb", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 16px 0", fontSize: "28px", color: "#1f2937" }}>Dashboard</h1>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px"
          }}
        >
          <option value="1d">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "24px"
      }}>
        {/* Total Orders */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Total Orders
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {data.totalOrders || 0}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {data.ordersChange >= 0 ? "↑" : "↓"} {Math.abs(data.ordersChange || 0).toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* Net Profit */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "2px solid #10b981" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Net Profit
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#10b981", marginBottom: "4px" }}>
            {formatCurrency(data.netProfit || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {data.profitChange >= 0 ? "↑" : "↓"} {Math.abs(data.profitChange || 0).toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* Revenue */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Revenue
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {formatCurrency(data.revenue || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {data.revenueChange >= 0 ? "↑" : "↓"} {Math.abs(data.revenueChange || 0).toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* Profit % */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Profit %
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {formatPercent(data.profitPercent || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {data.profitPercentChange >= 0 ? "↑" : "↓"} {Math.abs(data.profitPercentChange || 0).toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* Blended ROAS */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Blended ROAS
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {(data.roas || 0).toFixed(2)}x
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            Return on ad spend
          </div>
        </div>

        {/* Avg Order Value */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Avg Order Value
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {formatCurrency(data.avgOrderValue || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {data.aovChange >= 0 ? "↑" : "↓"} {Math.abs(data.aovChange || 0).toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* COGS + Fees */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            COGS + Fees
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {formatCurrency(data.cogsAndFees || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            COGS {(data.cogsPercent || 0).toFixed(0)}% • Fees {(data.feesPercent || 0).toFixed(0)}%
          </div>
        </div>

        {/* Ad Spend (Meta) */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", marginBottom: "8px" }}>
            Ad Spend (Meta)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>
            {formatCurrency(data.adSpend || 0)}
          </div>
          <div style={{ fontSize: "12px", color: "#9ca3af" }}>
            {(data.adSpendPercent || 0).toFixed(1)}% of revenue
          </div>
        </div>
      </div>

      {/* Profit Per Day Chart */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#1f2937" }}>
          Profit Per Day
        </h2>
        <div style={{ height: "300px", background: "#f9fafb", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#9ca3af" }}>Chart loading...</p>
        </div>
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
          Daily COGS estimated from the period's avg COGS/order • revenue & spend are exact per day
        </p>
      </div>

      {/* Products Table */}
      <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "600", color: "#1f2937" }}>
          Products — Ranked by Profit
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Product</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>ROAS</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Orders</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Revenue</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>COGS</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Ad Spend</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.products && data.products.length > 0 ? (
              data.products.map((product, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px", color: "#1f2937", fontWeight: "500" }}>{product.name}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{(product.roas || 0).toFixed(2)}x</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{product.orders || 0}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.revenue || 0)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.cogs || 0)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.adSpend || 0)}</td>
                  <td style={{ padding: "12px", color: product.profit >= 0 ? "#10b981" : "#ef4444", fontWeight: "600" }}>
                    {formatCurrency(product.profit || 0)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>
                  No sales in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
          Ad spend is matched to products by campaign name • product profit = revenue - COGS - payment fees - matched ad spend.
        </p>
      </div>
    </div>
  );
}
