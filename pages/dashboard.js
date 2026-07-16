// pages/dashboard.js
// JJB Profit Dashboard — modern design: line chart bovenaan, productfoto's, EUR

import { useState, useEffect } from "react";

const RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7d", value: "7d" },
  { label: "14d", value: "14d" },
  { label: "30d", value: "30d" },
];

const ui = {
  page: {
    padding: "28px 36px",
    background: "#f7f8fa",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #eceef2",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#8a92a3",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
  },
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");

  useEffect(() => {
    if (dateRange === "custom" && (!customFrom || !customTo)) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customFrom, customTo]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const url =
        dateRange === "custom"
          ? `/api/dashboard?range=custom&from=${customFrom}&to=${customTo}`
          : `/api/dashboard?range=${dateRange}`;
      const response = await fetch(url);
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

  const Change = ({ value, muted }) => {
    const v = value || 0;
    const up = v >= 0;
    if (muted) return <span style={{ fontSize: "12px", color: "#8a92a3" }}>{muted}</span>;
    return (
      <span
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: up ? "#16a34a" : "#dc2626",
          background: up ? "#f0fdf4" : "#fef2f2",
          padding: "2px 8px",
          borderRadius: "999px",
        }}
      >
        {up ? "↗" : "↘"} {Math.abs(v).toFixed(1)}%
      </span>
    );
  };

  if (loading)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#8a92a3" }}>Loading…</span>
      </div>
    );
  if (error)
    return (
      <div style={ui.page}>
        <div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div>
      </div>
    );
  if (!data) return <div style={ui.page}>No data</div>;

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>Dashboard</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>refreshed {refreshedAt}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "4px", background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "4px" }}>
            {RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setDateRange(value)}
                style={{
                  padding: "7px 14px",
                  background: dateRange === value ? "#0f172a" : "transparent",
                  color: dateRange === value ? "#ffffff" : "#64748b",
                  border: "none",
                  borderRadius: "9px",
                  cursor: "pointer",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setDateRange("custom")}
              style={{
                padding: "7px 14px",
                background: dateRange === "custom" ? "#0f172a" : "transparent",
                color: dateRange === "custom" ? "#ffffff" : "#64748b",
                border: "none",
                borderRadius: "9px",
                cursor: "pointer",
                fontSize: "12.5px",
                fontWeight: 600,
              }}
            >
              Custom
            </button>
          </div>
          {dateRange === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "5px 10px" }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: "12.5px", color: "#334155", fontFamily: "inherit", background: "transparent" }}
              />
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: "12.5px", color: "#334155", fontFamily: "inherit", background: "transparent" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ===== PROFIT PER DAY — bovenaan ===== */}
      <div style={{ ...ui.card, padding: "24px 24px 12px 24px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>Profit Per Day</span>
              <Change value={data.profitChange} />
            </div>
            <div style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "-0.5px", marginTop: "6px", color: data.netProfit >= 0 ? "#0f172a" : "#dc2626" }}>
              {formatCurrency(data.netProfit)}
            </div>
          </div>
          <span style={{ fontSize: "12px", color: "#8a92a3" }}>revenue − COGS − fees − ad spend</span>
        </div>
        <ProfitLineChart days={data.profitPerDay || []} formatCurrency={formatCurrency} />
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "16px" }}>
        <Card label="Total Orders" value={data.totalOrders || 0} change={data.ordersChange} />
        <Card label="Net Profit" value={formatCurrency(data.netProfit)} change={data.profitChange} accent={data.netProfit >= 0 ? "#16a34a" : "#dc2626"} />
        <Card label="Revenue" value={formatCurrency(data.revenue)} change={data.revenueChange} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <Card small label="Profit %" value={`${(data.profitPercent || 0).toFixed(1)}%`} change={data.profitPercentChange} />
        <Card small label="Blended ROAS" value={data.adSpend > 0 ? (data.roas || 0).toFixed(2) : "—"} sub="revenue / ad spend" />
        <Card small label="Avg. Order Value" value={formatCurrency(data.avgOrderValue)} change={data.aovChange} />
        <Card small label="COGS + Fees" value={formatCurrency(data.cogsAndFees)} sub={`COGS ${formatCurrency(data.cogs)} · fees ${formatCurrency(data.fees)}`} />
        <Card small label="Ad Spend (Meta)" value={formatCurrency(data.adSpend)} sub={`${(data.adSpendPercent || 0).toFixed(1)}% van revenue`} />
      </div>

      {/* Products */}
      <div style={{ ...ui.card, padding: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#334155" }}>Products — Ranked by Profit</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {["Product", "ROAS", "Orders", "Revenue", "COGS", "Ad spend", "Profit"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign: i === 0 ? "left" : "right",
                    ...ui.label,
                    borderBottom: "1px solid #eceef2",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.products && data.products.length > 0 ? (
              data.products.map((product, idx) => (
                <tr key={idx} style={{ borderBottom: idx < data.products.length - 1 ? "1px solid #f4f5f7" : "none" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          style={{ width: "38px", height: "38px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", background: "#f7f8fa" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "10px",
                            background: "#f1f5f9",
                            border: "1px solid #eceef2",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#94a3b8",
                          }}
                        >
                          {product.name?.charAt(0) || "?"}
                        </div>
                      )}
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{product.name}</span>
                    </div>
                  </td>
                  <td style={cellR}>{product.roas != null ? product.roas.toFixed(2) : "—"}</td>
                  <td style={cellR}>{product.orders || 0}</td>
                  <td style={cellR}>{formatCurrency(product.revenue)}</td>
                  <td style={cellR}>{formatCurrency(product.cogs)}</td>
                  <td style={cellR}>{product.adSpend > 0 ? formatCurrency(product.adSpend) : "—"}</td>
                  <td style={{ ...cellR, fontWeight: 700, color: product.profit >= 0 ? "#16a34a" : "#dc2626" }}>{formatCurrency(product.profit)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No sales in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ margin: "14px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Ad spend gematcht op campagnenaam • product profit = revenue − COGS − matched ad spend
        </p>
      </div>
    </div>
  );
}

const cellR = { padding: "10px 12px", textAlign: "right", color: "#334155", fontVariantNumeric: "tabular-nums" };

function Card({ label, value, change, sub, accent, small }) {
  return (
    <div style={{ ...ui.card, padding: small ? "18px 20px" : "22px 24px" }}>
      <div style={{ ...ui.label, marginBottom: small ? "8px" : "10px" }}>{label}</div>
      <div
        style={{
          fontSize: small ? "22px" : "28px",
          fontWeight: 700,
          letterSpacing: "-0.5px",
          color: accent || "#0f172a",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      {sub != null ? (
        <span style={{ fontSize: "12px", color: "#8a92a3" }}>{sub}</span>
      ) : (
        <span>
          {(() => {
            const v = change || 0;
            const up = v >= 0;
            return (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: up ? "#16a34a" : "#dc2626",
                  background: up ? "#f0fdf4" : "#fef2f2",
                  padding: "2px 8px",
                  borderRadius: "999px",
                }}
              >
                {up ? "↗" : "↘"} {Math.abs(v).toFixed(1)}%
              </span>
            );
          })()}
          <span style={{ fontSize: "12px", color: "#8a92a3", marginLeft: "6px" }}>vs. vorige periode</span>
        </span>
      )}
    </div>
  );
}

/* ---------- moderne line chart (smooth, gradient, hover) ---------- */

function ProfitLineChart({ days, formatCurrency }) {
  const [hover, setHover] = useState(null);

  if (!days.length) {
    return (
      <div style={{ height: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#94a3b8", fontSize: "13px" }}>Geen data voor deze periode</span>
      </div>
    );
  }

  const W = 1000;
  const H = 260;
  const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const profits = days.map((d) => d.profit);
  const min = Math.min(0, ...profits);
  const max = Math.max(0, ...profits);
  const span = max - min || 1;

  const x = (i) => PAD.left + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v) => PAD.top + ih - ((v - min) / span) * ih;
  const zeroY = y(0);

  const pts = days.map((d, i) => [x(i), y(d.profit)]);

  // Smooth cubic bezier pad
  const linePath = pts.reduce((acc, [px, py], i) => {
    if (i === 0) return `M ${px},${py}`;
    const [prevX, prevY] = pts[i - 1];
    const cx = (prevX + px) / 2;
    return `${acc} C ${cx},${prevY} ${cx},${py} ${px},${py}`;
  }, "");

  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${zeroY} L ${pts[0][0]},${zeroY} Z`;

  const dateLabel = (dateStr) =>
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    pts.forEach(([px], i) => {
      const dist = Math.abs(px - relX);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  const labelStep = Math.max(1, Math.ceil(days.length / 10));

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontale gridlijnen */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + ih * f}
            y2={PAD.top + ih * f}
            stroke="#f1f3f6"
            strokeWidth="1"
          />
        ))}

        {/* nullijn */}
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="#e2e6ec" strokeWidth="1" />

        {/* area + lijn */}
        <path d={areaPath} fill="url(#profitFill)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />

        {/* hover indicator */}
        {hover != null && (
          <g>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={PAD.top} y2={PAD.top + ih} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="#ffffff" stroke="#3b82f6" strokeWidth="2.5" />
          </g>
        )}

        {/* x-as labels */}
        {days.map((d, i) =>
          i % labelStep === 0 ? (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8" fontFamily="inherit">
              {dateLabel(d.date)}
            </text>
          ) : null
        )}
      </svg>

      {/* tooltip */}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: `${(pts[hover][0] / W) * 100}%`,
            top: "0px",
            transform: `translateX(${pts[hover][0] > W * 0.75 ? "-105%" : "8px"})`,
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "10px 12px",
            fontSize: "12px",
            lineHeight: 1.7,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>{dateLabel(days[hover].date)}</div>
          <div>
            Profit:{" "}
            <b style={{ color: days[hover].profit >= 0 ? "#4ade80" : "#f87171" }}>{formatCurrency(days[hover].profit)}</b>
          </div>
          <div style={{ color: "#cbd5e1" }}>Revenue: {formatCurrency(days[hover].revenue)}</div>
          <div style={{ color: "#cbd5e1" }}>Ad spend: {formatCurrency(days[hover].adSpend)}</div>
          <div style={{ color: "#cbd5e1" }}>
            COGS: {formatCurrency(days[hover].cogs)} · Fees: {formatCurrency(days[hover].fees)}
          </div>
          <div style={{ color: "#cbd5e1" }}>Orders: {days[hover].orders}</div>
        </div>
      )}
    </div>
  );
}
