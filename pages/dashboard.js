// pages/dashboard.js
// JJB Profit Dashboard — frontend (EUR, echte data, Profit Per Day chart)

import { useState, useEffect } from "react";

const RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7d", value: "7d" },
  { label: "14d", value: "14d" },
  { label: "30d", value: "30d" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("7d");
  const [refreshedAt, setRefreshedAt] = useState("");

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard?range=${dateRange}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
      setRefreshedAt(
        new Date().toLocaleString("nl-BE", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: (data && data.currency) || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);

  const changeLabel = (change) => {
    const v = change || 0;
    const up = v >= 0;
    return (
      <span style={{ color: up ? "#10b981" : "#ef4444" }}>
        {up ? "↑" : "↓"} {Math.abs(v).toFixed(1)}% vs. vorige periode
      </span>
    );
  };

  if (loading)
    return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
  if (error)
    return <div style={{ padding: "40px", color: "#dc2626" }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: "40px" }}>No data</div>;

  return (
    <div style={{ padding: "32px", background: "#f9fafb", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "32px", fontWeight: "700", color: "#1f2937" }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>refreshed {refreshedAt}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
              style={{
                padding: "6px 12px",
                background: dateRange === value ? "#3b82f6" : "white",
                color: dateRange === value ? "white" : "#6b7280",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <Card label="Total Orders" value={data.totalOrders || 0} sub={changeLabel(data.ordersChange)} />
        <Card
          label="Net Profit"
          value={formatCurrency(data.netProfit)}
          sub={changeLabel(data.profitChange)}
          highlight={data.netProfit >= 0 ? "#10b981" : "#ef4444"}
        />
        <Card label="Revenue" value={formatCurrency(data.revenue)} sub={changeLabel(data.revenueChange)} />
      </div>

      {/* Second Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <Card small label="Profit %" value={`${(data.profitPercent || 0).toFixed(1)}%`} sub={changeLabel(data.profitPercentChange)} />
        <Card small label="Blended ROAS" value={data.adSpend > 0 ? (data.roas || 0).toFixed(2) : "—"} sub={<span style={{ color: "#6b7280" }}>revenue / ad spend</span>} />
        <Card small label="Avg. Order Value" value={formatCurrency(data.avgOrderValue)} sub={changeLabel(data.aovChange)} />
        <Card
          small
          label="COGS + Fees"
          value={formatCurrency(data.cogsAndFees)}
          sub={<span style={{ color: "#6b7280" }}>COGS {formatCurrency(data.cogs)} · fees {formatCurrency(data.fees)}</span>}
        />
        <Card
          small
          label="Ad Spend (Meta)"
          value={formatCurrency(data.adSpend)}
          sub={<span style={{ color: "#6b7280" }}>{(data.adSpendPercent || 0).toFixed(1)}% van revenue</span>}
        />
      </div>

      {/* Profit Per Day Chart */}
      <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#1f2937" }}>Profit Per Day</h2>
        <ProfitChart days={data.profitPerDay || []} formatCurrency={formatCurrency} />
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
          Profit = revenue − COGS − fees − ad spend, per dag
        </p>
      </div>

      {/* Products Table */}
      <div style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#1f2937" }}>Products — Ranked by Profit</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
              {["Product", "ROAS", "Orders", "Revenue", "COGS", "Ad spend", "Profit"].map((h) => (
                <th key={h} style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#374151" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.products && data.products.length > 0 ? (
              data.products.map((product, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px", color: "#1f2937", fontWeight: "500" }}>{product.name}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{product.roas != null ? product.roas.toFixed(2) : "—"}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{product.orders || 0}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.revenue)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{formatCurrency(product.cogs)}</td>
                  <td style={{ padding: "12px", color: "#1f2937" }}>{product.adSpend > 0 ? formatCurrency(product.adSpend) : "—"}</td>
                  <td style={{ padding: "12px", fontWeight: "600", color: product.profit >= 0 ? "#10b981" : "#ef4444" }}>
                    {formatCurrency(product.profit)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>No sales in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
          Ad spend gematcht op campagnenaam • product profit = revenue − COGS − matched ad spend
        </p>
      </div>
    </div>
  );
}

function Card({ label, value, sub, highlight, small }) {
  return (
    <div
      style={{
        background: "white",
        padding: small ? "20px" : "24px",
        borderRadius: "8px",
        border: highlight ? `2px solid ${highlight}` : "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: small ? "11px" : "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: small ? "8px" : "12px" }}>
        {label}
      </div>
      <div style={{ fontSize: small ? "24px" : "32px", fontWeight: "700", color: highlight || "#1f2937", marginBottom: small ? "4px" : "8px" }}>
        {value}
      </div>
      <div style={{ fontSize: small ? "11px" : "12px" }}>{sub}</div>
    </div>
  );
}

function ProfitChart({ days, formatCurrency }) {
  if (!days.length) {
    return (
      <div style={{ height: "300px", background: "#f9fafb", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#9ca3af", margin: 0 }}>Geen data voor deze periode</p>
      </div>
    );
  }

  const maxAbs = Math.max(...days.map((d) => Math.abs(d.profit)), 1);
  const H = 260; // chart hoogte in px
  const zero = H / 2;

  return (
    <div style={{ height: `${H + 40}px`, display: "flex", alignItems: "flex-end", gap: "4px", padding: "0 4px" }}>
      {days.map((d) => {
        const barH = Math.max((Math.abs(d.profit) / maxAbs) * (H / 2 - 10), 2);
        const positive = d.profit >= 0;
        const dateLabel = new Date(`${d.date}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
        return (
          <div
            key={d.date}
            title={`${dateLabel}\nProfit: ${formatCurrency(d.profit)}\nRevenue: ${formatCurrency(d.revenue)}\nCOGS: ${formatCurrency(d.cogs)}\nFees: ${formatCurrency(d.fees)}\nAd spend: ${formatCurrency(d.adSpend)}\nOrders: ${d.orders}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "default" }}
          >
            <div style={{ height: `${H}px`, width: "100%", position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "10%",
                  width: "80%",
                  background: positive ? "#10b981" : "#ef4444",
                  borderRadius: "3px",
                  height: `${barH}px`,
                  top: positive ? `${zero - barH}px` : `${zero}px`,
                }}
              />
              {/* nullijn */}
              <div style={{ position: "absolute", top: `${zero}px`, left: 0, right: 0, borderTop: "1px solid #e5e7eb" }} />
            </div>
            <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "6px", whiteSpace: "nowrap" }}>
              {days.length <= 16 ? dateLabel : dateLabel.split(" ")[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
