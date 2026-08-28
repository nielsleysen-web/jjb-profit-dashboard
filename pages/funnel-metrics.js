// pages/funnel-metrics.js — Funnel Metrics
// Per funnel (domein): elke stap met unieke bezoekers, pageviews, checkout-kliks,
// doorstroom & drop-off — en onderaan de orders + omzet uit de attributie.
// Databron: jjb-track.js beacons (Upstash Redis) + Shopify-orders (jjb_host attribute).

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};

const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

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
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    fetch(`/api/funnel-metrics?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (on) { setData(d); setLoading(false); } })
      .catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [days]);

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>📈 Funnel Metrics</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
            Where visitors drop off, per funnel — from first pageview to Shopify order.
          </p>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {[{ d: 1, l: "Today" }, { d: 7, l: "7 days" }, { d: 30, l: "30 days" }].map((o) => (
            <button
              key={o.d}
              onClick={() => setDays(o.d)}
              style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid " + (days === o.d ? "#0f172a" : "#e2e6ec"), background: days === o.d ? "#0f172a" : "#fff", color: days === o.d ? "#fff" : "#334155", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              {o.l}
            </button>
          ))}
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
            Funnel Metrics stores its counters in a free Upstash Redis database. Create one at <b>upstash.com</b> (Redis → free tier),
            copy the <b>REST URL</b> and <b>REST Token</b>, and add them in Vercel as environment variables
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "6px", margin: "0 4px" }}>UPSTASH_REDIS_REST_URL</code> and
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "6px", margin: "0 4px" }}>UPSTASH_REDIS_REST_TOKEN</code>,
            then redeploy. Tracking starts automatically — the funnel script is already sending data.
          </p>
        </div>
      ) : data.funnels.length === 0 ? (
        <div style={{ ...ui.card, padding: "40px", textAlign: "center", color: "#8a92a3", fontSize: "13px" }}>
          No funnel traffic recorded yet in this period. Data appears as soon as visitors hit a funnel page with the tracking script installed.
        </div>
      ) : (
        <>
          {data.funnels.map((f) => (
            <div key={f.host} style={{ ...ui.card, padding: "20px 24px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                <h2 style={{ margin: 0, fontSize: "15.5px", fontWeight: 800 }}>{f.host}</h2>
                <div style={{ display: "flex", gap: "18px", fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
                  <span><b>{f.totalUniques.toLocaleString()}</b> <span style={{ color: "#8a92a3" }}>uniques</span></span>
                  <span><b>{f.checkoutClicks.toLocaleString()}</b> <span style={{ color: "#8a92a3" }}>checkout clicks</span></span>
                  <span><b>{f.orders.toLocaleString()}</b> <span style={{ color: "#8a92a3" }}>orders</span></span>
                  <span style={{ color: "#166534", fontWeight: 700 }}>{fmtEur(f.revenue)}</span>
                  <span><b>{pct(f.orders, f.totalUniques)}</b> <span style={{ color: "#8a92a3" }}>CVR</span></span>
                </div>
              </div>
              {f.steps.length > 0 ? (
                <StepTable funnel={f} />
              ) : (
                <p style={{ margin: 0, fontSize: "12.5px", color: "#8a92a3" }}>Orders attributed to this funnel, but no pageview data yet (script not installed here in this period).</p>
              )}
            </div>
          ))}
          {(data.noHostOrders > 0) && (
            <p style={{ fontSize: "12px", color: "#8a92a3", margin: "4px 2px" }}>
              +{data.noHostOrders} order{data.noHostOrders === 1 ? "" : "s"} ({fmtEur(data.noHostRevenue)}) without funnel attribution in this period — orders placed before the script carried the funnel domain, or from other channels.
            </p>
          )}
        </>
      )}
    </div>
  );
}
