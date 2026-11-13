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

function List({ title, rows, render, empty }) {
  const max = Math.max(0, ...rows.map((r) => r.visitors));
  return (
    <div style={{ ...ui.card, padding: "18px 20px" }}>
      <div style={{ ...ui.label, marginBottom: "10px" }}>{title}</div>
      {rows.length === 0 && <div style={{ color: "#94a3b8", fontSize: "13.5px", padding: "10px 0" }}>{empty}</div>}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "9px 0", borderTop: "1px solid #f1f3f6" }}>
          <div style={{ width: "170px", fontSize: "14px", fontWeight: 600, flex: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{render(r.key)}</div>
          <div style={{ flex: 1, height: "10px", background: "#eef1f6", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: `${max > 0 ? Math.max(2, (r.visitors / max) * 100) : 0}%`, height: "100%", background: ACCENT, borderRadius: "999px" }} />
          </div>
          <div style={{ width: "48px", textAlign: "right", fontSize: "16px", fontWeight: 800, fontVariantNumeric: "tabular-nums", flex: "none" }}>{fmtInt(r.visitors)}</div>
        </div>
      ))}
    </div>
  );
}

const QUICK = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

export default function CheckoutVisits() {
  const [preset, setPreset] = useState("today");
  const [range, setRange] = useState(presetRange("today"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState("all");

  useEffect(() => { setRange(presetRange(preset)); }, [preset]);
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
  const rows = all.filter((r) => product === "all" || r.product === product);
  const total = rows.reduce((s, r) => s + r.visitors, 0);
  const byCountry = group(rows, (r) => r.country).sort((a, b) => b.visitors - a.visitors || b.views - a.views);
  const byDay = group(rows, (r) => r.day).sort((a, b) => (a.key < b.key ? 1 : -1));
  const multiDay = range.from !== range.to;
  const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const pill = (on) => ({ padding: "8px 16px", borderRadius: "999px", border: `1px solid ${on ? ACCENT : "#e2e6ec"}`, background: on ? ACCENT : "#fff", color: on ? "#fff" : "#334155", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ ...ui.page, maxWidth: "860px" }}>
      <h1 style={{ margin: "0 0 16px 0", fontSize: "22px", fontWeight: 800 }}>🛒 Checkout Clicks</h1>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {QUICK.map((q) => <button key={q.key} onClick={() => setPreset(q.key)} style={pill(preset === q.key)}>{q.label}</button>)}
        <select value={product} onChange={(e) => setProduct(e.target.value)} style={{ marginLeft: "auto", padding: "8px 12px", border: "1px solid #e2e6ec", borderRadius: "999px", fontSize: "13px", fontFamily: "inherit", color: "#334155", background: "#fff", cursor: "pointer" }}>
          <option value="all">All products</option>
          {products.map((p) => <option key={p} value={p}>{productName(p)}</option>)}
        </select>
      </div>

      {data && data.success === false && (
        <div style={{ ...ui.card, padding: "18px", color: "#b91c1c", marginBottom: "16px" }}>Could not load the data: {data.error || "no access"}</div>
      )}

      <div style={{ ...ui.card, padding: "26px 24px", marginBottom: "16px", opacity: loading ? 0.5 : 1 }}>
        <div style={ui.label}>People who clicked to the checkout</div>
        <div style={{ fontSize: "64px", lineHeight: 1.05, fontWeight: 800, marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>{fmtInt(total)}</div>
        <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
          {multiDay ? `${dayLabel(range.from)} – ${dayLabel(range.to)}` : dayLabel(range.from)} · Miami time
        </div>
      </div>

      <div style={{ display: "grid", gap: "16px", opacity: loading ? 0.5 : 1 }}>
        <List title="By country" rows={byCountry} empty="No clicks yet." render={(k) => <span>{flag(k)}&nbsp; {countryName(k)}</span>} />
        {multiDay && <List title="Per day" rows={byDay} empty="No clicks yet." render={(k) => dayLabel(k)} />}
      </div>
    </div>
  );
}
