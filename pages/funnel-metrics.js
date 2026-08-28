// pages/funnel-metrics.js — Funnel Metrics
// Overzicht: verticale tabel van alle funnels met traffic in de gekozen periode.
// Klik op een funnel → detailscherm in Funnelish-stijl: per KPI een eigen vloeiende
// lijngrafiek (Revenue groot, daaronder een raster met Orders, Conv. rate, AOV,
// Unique visitors, Page views, Checkout clicks) + de stappentabel met drop-offs.
// Periode: presets of vrije van-tot-selectie. Bron: jjb-track beacons + Shopify-orders.

import { useState, useEffect, useRef } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};

const ACCENT = "#4f6df5"; // lijnkleur (één accent voor alle series, tekst blijft in inkt-kleuren)
const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (v) => Number(v || 0).toLocaleString();
const pct = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");
const iso = (d) => d.toISOString().slice(0, 10);

/* Presets → {from, to} in UTC-dagen (zelfde kalender als de tellers) */
function presetRange(key) {
  const now = new Date();
  const today = iso(now);
  const dayMs = 86400000;
  if (key === "today") return { from: today, to: today };
  if (key === "yesterday") { const y = iso(new Date(now.getTime() - dayMs)); return { from: y, to: y }; }
  if (key === "7d") return { from: iso(new Date(now.getTime() - 6 * dayMs)), to: today };
  if (key === "30d") return { from: iso(new Date(now.getTime() - 29 * dayMs)), to: today };
  if (key === "90d") return { from: iso(new Date(now.getTime() - 89 * dayMs)), to: today };
  if (key === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === "lastmonth") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: iso(first), to: iso(last) };
  }
  return { from: iso(new Date(now.getTime() - 6 * dayMs)), to: today };
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom period" },
];

/* Vloeiende curve (Catmull-Rom → bezier), met y-klem zodat de curve nooit onder
   de basislijn of boven het plotgebied "doorschiet" voorbij de echte data */
function smoothPath(pts, yTop, yBase) {
  if (!pts.length) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const cl = (y) => Math.max(yTop, Math.min(yBase, y));
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${cl(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${cl(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/* Eén KPI-kaart met vloeiende lijngrafiek, gradient-vulling, crosshair + tooltip */
function MetricChart({ label, total, series, getV, format = fmtInt, big = false }) {
  const [hi, setHi] = useState(null);
  const boxRef = useRef(null);
  const gid = useRef(`g${Math.random().toString(36).slice(2, 9)}`).current;
  const W = 680, H = big ? 216 : 150, P = { l: 10, r: 10, t: 14, b: 20 };
  const vals = series.map(getV);
  const maxV = Math.max(1, ...vals);
  const n = series.length;
  const x = (i) => (n === 1 ? W / 2 : P.l + (i * (W - P.l - P.r)) / (n - 1));
  const y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts, P.t, H - P.b);
  const area = line ? `${line} L${x(n - 1).toFixed(1)},${(H - P.b).toFixed(1)} L${x(0).toFixed(1)},${(H - P.b).toFixed(1)} Z` : "";
  const short = (d) => d.slice(5);
  const mid = Math.floor(n / 2);

  const onMove = (e) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, isNaN(i) ? 0 : i)));
  };

  return (
    <div style={{ ...ui.card, padding: "16px 18px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={ui.label}>{label}</span>
        <span style={{ fontSize: big ? "20px" : "16px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{total}</span>
      </div>
      <div ref={boxRef} style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.16" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[1 / 3, 2 / 3, 1].map((f) => (
            <line key={f} x1={P.l} x2={W - P.r} y1={H - P.b - f * (H - P.t - P.b)} y2={H - P.b - f * (H - P.t - P.b)} stroke="#f1f3f7" strokeWidth="1" />
          ))}
          <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="#e8eaf0" strokeWidth="1" />
          {area && <path d={area} fill={`url(#${gid})`} />}
          {line && <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {n > 0 && <circle cx={x(n - 1)} cy={y(vals[n - 1])} r="3.4" fill="#fff" stroke={ACCENT} strokeWidth="2" />}
          {hi != null && (
            <>
              <line x1={x(hi)} x2={x(hi)} y1={P.t} y2={H - P.b} stroke="#c6ccda" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(hi)} cy={y(vals[hi])} r="3.6" fill="#fff" stroke={ACCENT} strokeWidth="2" />
            </>
          )}
          <text x={W - P.r} y={P.t - 3} textAnchor="end" fontSize="9.5" fill="#a4adbd" fontVariantNumeric="tabular-nums">{format(maxV)}</text>
          <text x={x(0)} y={H - 6} textAnchor="start" fontSize="9.5" fill="#a4adbd">{short(series[0]?.d || "")}</text>
          {n > 2 && <text x={x(mid)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#a4adbd">{short(series[mid].d)}</text>}
          {n > 1 && <text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize="9.5" fill="#a4adbd">{short(series[n - 1].d)}</text>}
        </svg>
        {hi != null && (
          <div style={{ position: "absolute", left: `${(x(hi) / W) * 100}%`, top: 0, transform: `translateX(${hi > n / 2 ? "-105%" : "8px"})`, background: "#0f172a", color: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", whiteSpace: "nowrap", pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
            <div style={{ color: "#94a3b8", fontSize: "10px" }}>{series[hi].d}</div>
            <b>{format(vals[hi])}</b>
          </div>
        )}
      </div>
    </div>
  );
}

function StepTable({ funnel }) {
  const steps = funnel.steps;
  const first = steps[0];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {["Step (path)", "Uniques", "Views", "From top", "Drop-off vs prev.", "Checkout clicks", "→ Checkout rate"].map((h, i) => (
              <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 10px", borderBottom: "1px solid #eceef2", ...ui.label }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1] : null;
            const drop = prev && prev.pvu > 0 ? 100 - (s.pvu / prev.pvu) * 100 : null;
            return (
              <tr key={s.path}>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", fontFamily: "ui-monospace, monospace", fontSize: "12px", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.path}</td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right", fontWeight: 700 }}>{s.pvu.toLocaleString()}</td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right", color: "#64748b" }}>{s.pv.toLocaleString()}</td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{first ? pct(s.pvu, first.pvu) : "—"}</td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right", color: drop != null && drop > 60 ? "#dc2626" : "#334155", fontWeight: drop != null && drop > 60 ? 700 : 400 }}>
                  {drop == null ? "—" : `-${drop.toFixed(1)}%`}
                </td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{s.ccu > 0 ? s.ccu.toLocaleString() : "—"}</td>
                <td style={{ padding: "9px 10px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{s.ccu > 0 ? pct(s.ccu, s.pvu) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FunnelMetrics() {
  const [preset, setPreset] = useState("7d");
  const [range, setRange] = useState(presetRange("7d"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // key van de open funnel (host/segment)

  useEffect(() => {
    if (preset !== "custom") setRange(presetRange(preset));
  }, [preset]);

  useEffect(() => {
    if (!range.from || !range.to) return;
    let on = true;
    setLoading(true);
    fetch(`/api/funnel-metrics?from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((d) => { if (on) { setData(d); setLoading(false); } })
      .catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [range.from, range.to]);

  const funnels = data?.funnels || [];
  const current = selected ? funnels.find((f) => f.key === selected) : null;
  const dateInput = { padding: "7px 10px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", color: "#334155", background: "#fff" };

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>📈 Funnel Metrics</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
            Where visitors drop off, per funnel — from first pageview to Shopify order.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...dateInput, fontWeight: 700, cursor: "pointer" }}>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {preset === "custom" ? (
            <>
              <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} style={dateInput} />
              <span style={{ color: "#8a92a3", fontSize: "12px" }}>→</span>
              <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} style={dateInput} />
            </>
          ) : (
            <span style={{ fontSize: "12.5px", color: "#64748b", fontVariantNumeric: "tabular-nums", background: "#fff", border: "1px solid #e2e6ec", borderRadius: "9px", padding: "7px 12px" }}>
              {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ ...ui.card, padding: "40px", textAlign: "center", color: "#8a92a3", fontSize: "13px" }}>Loading…</div>
      ) : !data?.success ? (
        <div style={{ ...ui.card, padding: "40px", textAlign: "center", color: "#dc2626", fontSize: "13px" }}>Could not load funnel metrics{data?.error ? ` — ${data.error}` : ""}.</div>
      ) : data.configured === false ? (
        <div style={{ ...ui.card, padding: "28px" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 700 }}>One-time setup needed</h2>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#334155", lineHeight: 1.7, maxWidth: "640px" }}>
            Funnel Metrics stores its counters in a free Upstash Redis database. Create one at <b>upstash.com</b>, copy the REST URL and
            REST Token, add them in Vercel as <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code>, then redeploy.
          </p>
        </div>
      ) : current ? (
        /* ===== Detail: één funnel, Funnelish-stijl ===== */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
            <button onClick={() => setSelected(null)} style={{ border: "1px solid #e2e6ec", background: "#fff", borderRadius: "9px", padding: "7px 14px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#334155" }}>
              ← All funnels
            </button>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>{current.key}</h2>
          </div>

          <div style={{ marginBottom: "14px" }}>
            <MetricChart big label="Revenue" total={fmtEur(current.revenue)} series={current.series} getV={(s) => s.r} format={(v) => fmtEur(v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            <MetricChart label="Orders" total={fmtInt(current.orders)} series={current.series} getV={(s) => s.o} />
            <MetricChart label="Conv. rate" total={pct(current.orders, current.totalUniques)} series={current.series} getV={(s) => (s.u > 0 ? (s.o / s.u) * 100 : 0)} format={(v) => `${v.toFixed(1)}%`} />
            <MetricChart label="AOV" total={current.orders > 0 ? fmtEur(current.revenue / current.orders) : "—"} series={current.series} getV={(s) => (s.o > 0 ? s.r / s.o : 0)} format={(v) => fmtEur(v)} />
            <MetricChart label="Unique visitors" total={fmtInt(current.totalUniques)} series={current.series} getV={(s) => s.u} />
            <MetricChart label="Page views" total={fmtInt(current.steps.reduce((s, x) => s + x.pv, 0))} series={current.series} getV={(s) => s.pv} />
            <MetricChart label="Checkout clicks" total={fmtInt(current.checkoutClicks)} series={current.series} getV={(s) => s.cc} />
          </div>

          <div style={{ ...ui.card, padding: "18px 22px" }}>
            <div style={{ ...ui.label, marginBottom: "10px" }}>Performance breakdown</div>
            {current.steps.length > 0 ? (
              <StepTable funnel={current} />
            ) : (
              <p style={{ margin: 0, fontSize: "12.5px", color: "#8a92a3" }}>Orders attributed to this funnel, but no pageview data in this period.</p>
            )}
          </div>
        </>
      ) : funnels.length === 0 ? (
        <div style={{ ...ui.card, padding: "40px", textAlign: "center", color: "#8a92a3", fontSize: "13px" }}>
          No funnel traffic recorded in this period.
        </div>
      ) : (
        /* ===== Overzicht: alle funnels met traffic in de periode ===== */
        <div style={{ ...ui.card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Funnel", "Uniques", "Page views", "Checkout clicks", "Orders", "Revenue", "CVR", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "12px 16px", borderBottom: "1px solid #eceef2", ...ui.label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funnels.map((f) => (
                  <tr key={f.key} onClick={() => setSelected(f.key)} style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", fontWeight: 700 }}>{f.key}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right", fontWeight: 700 }}>{f.totalUniques.toLocaleString()}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right", color: "#64748b" }}>{f.steps.reduce((s, x) => s + x.pv, 0).toLocaleString()}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{f.checkoutClicks.toLocaleString()}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{f.orders.toLocaleString()}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right", color: "#166534", fontWeight: 700 }}>{fmtEur(f.revenue)}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right" }}>{pct(f.orders, f.totalUniques)}</td>
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", textAlign: "right", color: "#94a3b8" }}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.noHostOrders > 0) && (
            <p style={{ fontSize: "12px", color: "#8a92a3", margin: "10px 16px" }}>
              +{data.noHostOrders} order{data.noHostOrders === 1 ? "" : "s"} ({fmtEur(data.noHostRevenue)}) without funnel attribution in this period.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
