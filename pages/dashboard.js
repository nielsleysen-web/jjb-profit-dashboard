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
      if (!result.success) throw new Error(result.error);
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
  };

  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
  if (error) return <div style={{ padding: "40px", color: "#dc2626" }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: "40px" }}>No data</div>;

  return (
    <div style={{ padding: "32px", background: "#f9fafb", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "32px", fontWeight: "700", color: "#1f2937" }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>15 Jul - refreshed 14:29</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {["Today", "Yesterday", "7d", "14d", "30d"].map(label => (
            <button
              key={label}
              onClick={() => setDateRange(label === "Today" ? "1d" : label === "Yesterday" ? "1d" : label)}
              style={{
                padding: "6px 12px",
                background: label === "7d" ? "#3b82f6" : "white",
                color: label === "7d" ? "white" : "#6b7280",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px"
              }}
            >
              {label}
            </button>
          ))}
          <button style={{ padding: "6px 12px", background: "white", border: "1px solid #e5e7eb", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>Custom</button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {/* TOTAL ORDERS */}
        <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Total Orders</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#1f2937", marginBottom: "8px" }}>{data.totalOrders || 0}</div>
          <div style={{ fontSize: "12px", color: "#10b981" }}>↑ {data.ordersChange?.toFixed(1) || 0}% vs. yesterday</div>
        </div>

        {/* NET PROFIT - GREEN CARD */}
        <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "2px solid #10b981" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Net Profit</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#10b981", marginBottom: "8px" }}>{formatCurrency(data.netProfit || 0)}</div>
          <div style={{ fontSize: "12px", color: "#10b981" }}>↑ {data.profitChange?.toFixed(1) || 0}% vs. yesterday</div>
        </div>

        {/* REVENUE */}
        <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Revenue</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#1f2937", marginBottom: "8px" }}>{formatCurrency(data.revenue || 0)}</div>
          <div style={{ fontSize: "12px", color: "#10b981" }}>↑ {data.revenueChange?.toFixed(1) || 0}% vs. yesterday</div>
        </div>
      </div>

      {/* Second Row - More Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {/* PROFIT % */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Profit %</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>{(data.profitPercent || 0).toFixed(1)}%</div>
          <div style={{ fontSize: "11px", color: "#10b981" }}>↑ {data.profitPercentChange?.toFixed(1) || 0}% vs. yesterday</div>
        </div>

        {/* BLENDED ROAS */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Blended ROAS</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>—</div>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>vs. yesterday</div>
        </div>

        {/* AVG ORDER VALUE */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Avg. Order Value</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>{formatCurrency(data.avgOrderValue || 0)}</div>
          <div style={{ fontSize: "11px", color: "#10b981" }}>↑ {data.aovChange?.toFixed(1) || 0}% vs. yesterday</div>
        </div>

        {/* COGS + FEES */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>COGS + Fees</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>{formatCurrency(data.cogsAndFees || 0)}</div>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>COGS $0 - fees $0</div>
        </div>

        {/* AD SPEND (META) */}
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Ad Spend (Meta)</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1f2937", marginBottom: "4px" }}>{formatCurrency(data.adSpend || 0)}</div>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>Meta ads spend</div>
        </div>
      </div>

      {/* Profit Per Day Chart */}
      <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#1f2937" }}>Profit Per Day</h2>
        <div style={{ height: "300px", background: "#f9fafb", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#9ca3af", margin: 0 }}>Chart will display here</p>
        </div>
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>Daily COGS estimated from the period's avg COGS/order • revenue & spend are exact per day</p>
      </div>

      {/* Products Table */}
      <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#1f2937" }}>Products — Ranked by Profit</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Product</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>ROAS</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Orders</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Revenue</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>COGS</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Ad spend</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.products && data.products.length > 0 ? (
              data.products.map((product, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px", color: "#1f2937", fontWeight: "500" }}>{product.name}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>—</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{product.orders || 0}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.revenue || 0)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.cogs || 0)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>—</td>
                  <td style={{ padding: "12px", fontWeight: "600", color: product.profit >= 0 ? "#10b981" : "#ef4444" }}>{formatCurrency(product.profit || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>No sales in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>Ad spend is matched to products by campaign name • product profit = revenue - COGS - payment fees - matched ad spend.</p>
      </div>
    </div>
  );
}
