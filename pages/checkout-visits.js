// pages/checkout-visits.js — Checkout Visits
// Hoeveel mensen de checkout-pagina openen, per dag (Miami-tijd), per land, per product en
// vanaf welke salespagina. Bron: beacon in checkout.js → /api/checkout-visit (Upstash Redis).

import { useState, useEffect, useMemo } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  th: { textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", padding: "10px 14px", borderBottom: "1px solid #eceef2" },
  td: { padding: "10px 14px", fontSize: "13.5px", borderBottom: "1px solid #f1f3f6" },
};
const ACCENT = "#4f6df5";
const fmtInt = (v) => Number(v || 0).toLocaleString();
const etDay = (ms = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const shift = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function presetRange(key) {
  const today = etDay();
  if (key === "today") return { from: today, to: today };
  if (key === "yesterday") return { from: shift(today, -1), to: shift(today, -1) };
  if (key === "7d") return { from: shift(today, -6), to: today };
  if (key === "30d") return { from: shift(today, -29), to: today };
  if (key === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: today, to: today };
}
const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom period" },
];

const PRODUCT_NAMES = { sageleaf: "Sage Leaf Extract", pumpkinoil: "Pumpkin Seed Oil (EN)", pumpkinseed: "Pumpkin Seed (IT)", ceylon: "Cannella di Ceylon", neurotone: "NeuroTone", lubrisense: "LubriSense", magnesium: "Magnesium", emorroidi: "Emorroidi", urinapatches: "UrinaPatches" };
const productName = (k) => PRODUCT_NAMES[k] || k;
let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
const countryName = (c) => { if (!c || c === "??") return "Unknown"; try { return (regionNames && regionNames.of(c)) || c; } catch (e) { return c; } };
const flag = (c) => (/^[A-Z]{2}$/.test(c || "") ? String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))) : "🌐");

function group(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    const o = m.get(k) || { key: k, views: 0, visitors: 0 };
    o.views += r.views; o.visitors += r.visitors;
    m.set(k, o);
  });
  return [...m.values()];
}

function Bar({ value, max }) {
  return (
    <div style={{ height: "8px", background: "#eef1f6", borderRadius: "999px", overflow: "hidden", minWidth: "80px" }}>
      <div style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, height: "100%", background: ACCENT, borderRadius: "999px" }} />
    </div>
  );
}

function Table({ title, firstCol, rows, render }) {
  const max = Math.max(0, ...rows.map((r) => r.visitors));
  const total = rows.reduce((s, r) => s + r.visitors, 0);
  return (
    <div style={{ ...ui.card, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 6px", fontSize: "15px", fontWeight: 800 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={ui.th}>{firstCol}</th>
            <th style={{ ...ui.th, textAlign: "right" }}>Visitors</th>
            <th style={{ ...ui.th, textAlign: "right" }}>Share</th>
            <th style={{ ...ui.th, width: "32%" }}></th>
            <th style={{ ...ui.th, textAlign: "right" }}>Page views</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ ...ui.td, color: "#94a3b8", textAlign: "center", padding: "26px" }}>No checkout visits in this period.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ ...ui.td, fontWeight: 600 }}>{render(r.key)}</td>
              <td style={{ ...ui.td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtInt(r.visitors)}</td>
              <td style={{ ...ui.td, textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{total > 0 ? `${((r.visitors / total) * 100).toFixed(1)}%` : "—"}</td>
              <td style={ui.td}><Bar value={r.visitors} max={max} /></td>
              <td style={{ ...ui.td, textAlign: "right", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{fmtInt(r.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CheckoutVisits() {
  const [preset, setPreset] = useState("today");
  const [range, setRange] = useState(presetRange("today"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState("all");
  const [country, setCountry] = useState("all");

  useEffect(() => { if (preset !== "custom") setRange(presetRange(preset)); }, [preset]);
  useEffect(() => {
    if (!range.from || !range.to) return;
    let on = true;
    setLoading(true);
    fetch(`/api/checkout-visits?from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((d) => { if (on) { setData(d); setLoading(false); } })
      .catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [range.from, range.to]);

  const all = data?.rows || [];
  const products = useMemo(() => [...new Set(all.map((r) => r.product))].sort(), [all]);
  const countries = useMemo(() => group(all, (r) => r.country).sort((a, b) => b.visitors - a.visitors).map((r) => r.key), [all]);
  const rows = all.filter((r) => (product === "all" || r.product === product) && (country === "all" || r.country === country));

  const totalVisitors = rows.reduce((s, r) => s + r.visitors, 0);
  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const byCountry = group(rows, (r) => r.country).sort((a, b) => b.visitors - a.visitors || b.views - a.views);
  const byDay = group(rows, (r) => r.day).sort((a, b) => (a.key < b.key ? 1 : -1));
  const byProduct = group(rows, (r) => r.product).sort((a, b) => b.visitors - a.visitors);
  const bySource = group(rows, (r) => r.source).sort((a, b) => b.visitors - a.visitors);
  const top = byCountry[0];

  const input = { padding: "7px 10px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", color: "#334155", background: "#fff" };
  const kpi = (label, value, sub) => (
    <div style={{ ...ui.card, padding: "16px 18px", flex: "1 1 180px" }}>
      <div style={ui.label}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
  const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>🛒 Checkout Visits</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
            Who opens the checkout — per day, country, product and sales page. Days are in Miami time (ET).
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginRight: "48px" }}>
          <select value={product} onChange={(e) => setProduct(e.target.value)} style={{ ...input, cursor: "pointer" }}>
            <option value="all">All products</option>
            {products.map((p) => <option key={p} value={p}>{productName(p)}</option>)}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ ...input, cursor: "pointer" }}>
            <option value="all">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...input, fontWeight: 700, cursor: "pointer" }}>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {preset === "custom" && (
            <>
              <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} style={input} />
              <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} style={input} />
            </>
          )}
        </div>
      </div>

      {data && data.success === false && (
        <div style={{ ...ui.card, padding: "18px", color: "#b91c1c", marginBottom: "16px" }}>Could not load the data: {data.error || "no access"}</div>
      )}
      {data && data.configured === false && (
        <div style={{ ...ui.card, padding: "18px", color: "#92400e", marginBottom: "16px" }}>The counter store (Upstash Redis) is not configured.</div>
      )}

      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "16px", opacity: loading ? 0.5 : 1 }}>
        {kpi("Unique visitors", fmtInt(totalVisitors), `${range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} – ${dayLabel(range.to)}`}`)}
        {kpi("Page views", fmtInt(totalViews), "incl. reloads")}
        {kpi("Countries", fmtInt(byCountry.length), top ? `Top: ${flag(top.key)} ${countryName(top.key)} (${fmtInt(top.visitors)})` : "—")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "16px", opacity: loading ? 0.5 : 1 }}>
        <Table title="By country" firstCol="Country" rows={byCountry} render={(k) => <span>{flag(k)}&nbsp; {countryName(k)}</span>} />
        <Table title="By day (Miami time)" firstCol="Day" rows={byDay} render={(k) => dayLabel(k)} />
        <Table title="By product" firstCol="Checkout" rows={byProduct} render={(k) => productName(k)} />
        <Table title="Coming from" firstCol="Sales page" rows={bySource} render={(k) => (k === "direct" ? "Direct / unknown" : k)} />
      </div>

      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "16px" }}>
        Counting started on Nov 13, 2026. A visitor is counted once per day per browser; country comes from the visitor's IP address.
      </p>
    </div>
  );
}
