// pages/funnel-metrics.js — Funnel Metrics
// Overzicht: verticale tabel van alle funnels met traffic in de gekozen periode.
// Klik op een funnel → detailscherm met KPI-tegels + de stappentabel (waar valt men af).
// Periode: presets (Today / Yesterday / 7d / 30d / This month / Last month / 90d) of een
// vrije van-tot-selectie. Databron: jjb-track beacons (Upstash) + Shopify-orders (jjb_host).

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};

const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function Kpi({ label, value, accent }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: "130px", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ ...ui.label, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: accent || "#0f172a" }}>{value}</div>
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
  const [selected, setSelected] = useState(null); // host van de open funnel

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
  const current = selected ? funnels.find((f) => f.host === selected) : null;

  const dateInput = { padding: "7px 10px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", color: "#334155", background: "#fff" };

  return (
    <div style={ui.page}>
      {/* Kop + periodekiezer */}
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
        /* ===== Detail: één funnel ===== */
        <div style={{ ...ui.card, padding: "22px 26px" }}>
          <button onClick={() => setSelected(null)} style={{ border: "1px solid #e2e6ec", background: "#fff", borderRadius: "9px", padding: "7px 14px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#334155", marginBottom: "14px" }}>
            ← All funnels
          </button>
          <h2 style={{ margin: "0 0 14px 0", fontSize: "17px", fontWeight: 800 }}>{current.host}</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
            <Kpi label="Revenue" value={fmtEur(current.revenue)} accent="#166534" />
            <Kpi label="Orders" value={current.orders.toLocaleString()} />
            <Kpi label="Conv. rate" value={pct(current.orders, current.totalUniques)} />
            <Kpi label="AOV" value={current.orders > 0 ? fmtEur(current.revenue / current.orders) : "—"} />
            <Kpi label="Unique visits" value={current.totalUniques.toLocaleString()} />
            <Kpi label="Page views" value={current.steps.reduce((s, x) => s + x.pv, 0).toLocaleString()} />
            <Kpi label="Checkout clicks" value={current.checkoutClicks.toLocaleString()} />
          </div>
          {current.steps.length > 0 ? (
            <StepTable funnel={current} />
          ) : (
            <p style={{ margin: 0, fontSize: "12.5px", color: "#8a92a3" }}>Orders attributed to this funnel, but no pageview data in this period.</p>
          )}
        </div>
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
                  <tr key={f.host} onClick={() => setSelected(f.host)} style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "13px 16px", borderBottom: "1px solid #f4f5f7", fontWeight: 700 }}>{f.host}</td>
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
