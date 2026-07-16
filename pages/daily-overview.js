// pages/daily-overview.js
// Dagoverzicht — orders, revenue, ad spend, net profit, profit % en AOV per dag.

import { useState, useEffect } from "react";

const RANGES = [
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

export default function DailyOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("14d");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/dashboard?range=${dateRange}`)
      .then((r) => r.json())
      .then((result) => {
        if (!result.success) throw new Error(result.error);
        setData(result.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [dateRange]);

  const fmt = (v) =>
    new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(v || 0);

  const dateLabel = (dateStr) =>
    new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("nl-BE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

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

  // Nieuwste dag bovenaan
  const days = [...(data?.profitPerDay || [])].reverse();

  const th = (align = "right") => ({
    padding: "10px 14px",
    textAlign: align,
    ...ui.label,
    borderBottom: "1px solid #eceef2",
  });
  const td = {
    padding: "11px 14px",
    textAlign: "right",
    fontSize: "13px",
    color: "#334155",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>Daily Overview</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Orders, revenue, profit, AOV en ad spend per dag
          </p>
        </div>
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
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...ui.card, padding: "8px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th("left")}>Datum</th>
              <th style={th()}>Orders</th>
              <th style={th()}>Revenue</th>
              <th style={th()}>Ad Spend</th>
              <th style={th()}>Net Profit</th>
              <th style={th()}>Profit %</th>
              <th style={th()}>AOV</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, idx) => {
              const profitPct = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
              const aov = d.orders > 0 ? d.revenue / d.orders : 0;
              const isToday = idx === 0 && dateRange !== "custom";
              return (
                <tr
                  key={d.date}
                  style={{
                    borderBottom: idx < days.length - 1 ? "1px solid #f4f5f7" : "none",
                    background: isToday ? "#f8fafc" : "transparent",
                  }}
                >
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "#0f172a" }}>
                    {dateLabel(d.date)}
                    {isToday && (
                      <span style={{ marginLeft: "8px", fontSize: "10px", fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase" }}>
                        vandaag
                      </span>
                    )}
                  </td>
                  <td style={td}>{d.orders}</td>
                  <td style={td}>{fmt(d.revenue)}</td>
                  <td style={td}>{d.adSpend > 0 ? fmt(d.adSpend) : "—"}</td>
                  <td style={{ ...td, fontWeight: 700, color: d.profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(d.profit)}</td>
                  <td style={{ ...td, color: profitPct >= 0 ? "#16a34a" : "#dc2626" }}>
                    {d.revenue > 0 ? `${profitPct.toFixed(1)}%` : "—"}
                  </td>
                  <td style={td}>{d.orders > 0 ? fmt(aov) : "—"}</td>
                </tr>
              );
            })}
            {days.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>Geen data</td>
              </tr>
            )}
          </tbody>
          {days.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid #eceef2", background: "#fafbfc" }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, color: "#0f172a" }}>Totaal</td>
                <td style={{ ...td, fontWeight: 700 }}>{data.totalOrders}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmt(data.revenue)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmt(data.adSpend)}</td>
                <td style={{ ...td, fontWeight: 700, color: data.netProfit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(data.netProfit)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{(data.profitPercent || 0).toFixed(1)}%</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmt(data.avgOrderValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
