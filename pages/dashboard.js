// pages/dashboard.js
// JJB Profit Dashboard — modern design: line chart bovenaan, productfoto's, EUR

import { useState, useEffect, useRef } from "react";

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
      <SaleNotifier />
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

      {/* ===== REVENUE CHART — bovenaan ===== */}
      <div style={{ ...ui.card, padding: "20px 20px 8px 20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>
                Revenue {data.revenueChart?.granularity === "hour" ? "Per Hour" : "Per Day"}
              </span>
              <Change value={data.revenueChange} />
            </div>
            <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px", marginTop: "4px", color: "#0f172a" }}>
              {formatCurrency(data.revenue)}
            </div>
          </div>
          <span style={{ fontSize: "12px", color: "#8a92a3" }}>
            net profit: <b style={{ color: data.netProfit >= 0 ? "#16a34a" : "#dc2626" }}>{formatCurrency(data.netProfit)}</b>
          </span>
        </div>
        <RevenueChart chart={data.revenueChart} formatCurrency={formatCurrency} />
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

/* ---------- realtime sale-notificaties (confetti + toast) ---------- */

function fireConfetti() {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const colors = ["#3b82f6", "#16a34a", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];
  const parts = [];
  for (let i = 0; i < 140; i++) {
    const fromLeft = i % 2 === 0;
    parts.push({
      x: fromLeft ? -10 : canvas.width + 10,
      y: canvas.height * (0.35 + Math.random() * 0.45),
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 8),
      vy: -(6 + Math.random() * 8),
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    });
  }

  const start = Date.now();
  const tick = () => {
    const t = Date.now() - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // zwaartekracht
      p.vx *= 0.99;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - t / 3000);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 3000) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

function SaleNotifier() {
  const [toasts, setToasts] = useState([]);
  const seenRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/latest-orders").then((r) => r.json());
        if (!res.success || !Array.isArray(res.orders)) return;

        // Eerste keer: alleen onthouden wat er al is (geen notificaties)
        if (!seenRef.current) {
          seenRef.current = new Set(res.orders.map((o) => o.id));
          return;
        }

        const fresh = res.orders.filter((o) => !seenRef.current.has(o.id));
        if (fresh.length === 0) return;

        fireConfetti();
        // Oudste eerst tonen
        [...fresh].reverse().forEach((order, idx) => {
          seenRef.current.add(order.id);
          setTimeout(() => {
            setToasts((t) => [...t, order]);
            setTimeout(() => {
              setToasts((t) => t.filter((x) => x.id !== order.id));
            }, 9000);
          }, idx * 600);
        });
      } catch {
        /* stil falen, volgende poll probeert opnieuw */
      }
    };

    poll();
    const interval = setInterval(poll, 20000); // elke 20 sec
    return () => clearInterval(interval);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 9999,
      }}
    >
      {toasts.map((order) => {
        const item = order.items?.[0];
        const extra = (order.items?.length || 0) - 1;
        const who = [order.customer, order.city, order.country].filter(Boolean);
        return (
          <div
            key={order.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#ffffff",
              border: "1px solid #eceef2",
              borderRadius: "14px",
              padding: "12px 16px",
              boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
              minWidth: "300px",
              maxWidth: "380px",
              animation: "jjbSlideIn 0.35s ease-out",
            }}
          >
            {item?.image ? (
              <img
                src={item.image}
                alt=""
                style={{ width: "44px", height: "44px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "#f1f5f9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                🛒
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                🎉 Nieuwe sale — {item ? `${item.quantity}× ${item.title}` : order.name}
                {extra > 0 ? ` +${extra}` : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                {who.length > 0 ? `${who[0]}${who.length > 1 ? ` uit ${who.slice(1).join(", ")}` : ""}` : "Nieuwe bestelling"}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes jjbSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ---------- moderne revenue line chart (y-as, smooth, gradient, hover) ---------- */

function niceTicks(maxValue) {
  const max = Math.max(maxValue, 10);
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  let step = pow;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= rough) {
      step = m * pow;
      break;
    }
  }
  const ticks = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function RevenueChart({ chart, formatCurrency }) {
  const [hover, setHover] = useState(null);
  const days = chart?.points || [];
  const isHourly = chart?.granularity === "hour";

  if (!days.length) {
    return (
      <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#94a3b8", fontSize: "13px" }}>Geen data voor deze periode</span>
      </div>
    );
  }

  const W = 1000;
  const H = 190;
  const PAD = { top: 12, right: 14, bottom: 26, left: 54 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const revenues = days.map((d) => d.revenue);
  const ticks = niceTicks(Math.max(...revenues));
  const min = 0;
  const max = ticks[ticks.length - 1];
  const span = max - min || 1;

  const x = (i) => PAD.left + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v) => PAD.top + ih - ((v - min) / span) * ih;
  const zeroY = y(0);

  const fmtAxis = (v) =>
    new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

  const pts = days.map((d, i) => [x(i), y(d.revenue)]);

  // Smooth cubic bezier pad
  const linePath = pts.reduce((acc, [px, py], i) => {
    if (i === 0) return `M ${px},${py}`;
    const [prevX, prevY] = pts[i - 1];
    const cx = (prevX + px) / 2;
    return `${acc} C ${cx},${prevY} ${cx},${py} ${px},${py}`;
  }, "");

  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${zeroY} L ${pts[0][0]},${zeroY} Z`;

  const dateLabel = (label) =>
    isHourly
      ? label
      : new Date(`${label}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });

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

  const labelStep = isHourly ? 3 : Math.max(1, Math.ceil(days.length / 10));

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* y-as: gridlijnen + eurobedragen */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? "#e2e6ec" : "#f1f3f6"}
              strokeWidth="1"
            />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#94a3b8" fontFamily="inherit">
              {fmtAxis(t)}
            </text>
          </g>
        ))}

        {/* area + lijn */}
        <path d={areaPath} fill="url(#revenueFill)" />
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
            <text key={d.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#94a3b8" fontFamily="inherit">
              {dateLabel(d.label)}
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
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>{dateLabel(days[hover].label)}</div>
          <div>
            Revenue: <b style={{ color: "#93c5fd" }}>{formatCurrency(days[hover].revenue)}</b>
          </div>
          {days[hover].profit != null && (
            <div style={{ color: "#cbd5e1" }}>
              Profit:{" "}
              <b style={{ color: days[hover].profit >= 0 ? "#4ade80" : "#f87171" }}>{formatCurrency(days[hover].profit)}</b>
            </div>
          )}
          <div style={{ color: "#cbd5e1" }}>Orders: {days[hover].orders}</div>
        </div>
      )}
    </div>
  );
}
