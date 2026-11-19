// pages/checkout-visits.js — Checkout Clicks (funnel-overzicht in Funnelish-stijl)
// Per funnel (domein + eerste padsegment) elke stap onder elkaar: pagina's → checkout → order,
// met unieke bezoekers, paginaweergaven en hoeveel % doorgaat naar de volgende stap.
// Bronnen: /api/funnel-metrics (pageviews, checkout-kliks, orders, omzet) en
// /api/checkout-visits (bezoeken aan de checkout-pagina per funnel, land en product).

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

const PRODUCT_NAMES = { cayenne: "Cayenne Pepper Softgels", sageleaf: "Sage Leaf Extract", pumpkinoil: "Pumpkin Seed Oil (EN)", pumpkinseed: "Pumpkin Seed (IT)", ceylon: "Cannella di Ceylon", neurotone: "NeuroTone", lubrisense: "LubriSense", magnesium: "Magnesium", emorroidi: "Emorroidi", urinapatches: "UrinaPatches" };
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

function List({ title, rows, render, empty, wide }) {
  const max = Math.max(0, ...rows.map((r) => r.visitors));
  return (
    <div style={{ ...ui.card, padding: "18px 20px" }}>
      <div style={{ ...ui.label, marginBottom: "10px" }}>{title}</div>
      {rows.length === 0 && <div style={{ color: "#94a3b8", fontSize: "13.5px", padding: "10px 0" }}>{empty}</div>}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "9px 0", borderTop: "1px solid #f1f3f6" }}>
          <div style={{ width: wide ? "260px" : "170px", maxWidth: "45%", fontSize: "14px", fontWeight: 600, flex: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{render(r.key)}</div>
          <div style={{ flex: 1, height: "10px", background: "#eef1f6", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: `${max > 0 ? Math.max(2, (r.visitors / max) * 100) : 0}%`, height: "100%", background: ACCENT, borderRadius: "999px" }} />
          </div>
          <div style={{ width: "48px", textAlign: "right", fontSize: "16px", fontWeight: 800, fontVariantNumeric: "tabular-nums", flex: "none" }}>{fmtInt(r.visitors)}</div>
        </div>
      ))}
    </div>
  );
}

// Lokale tijd in de landen waar we op adverteren (grote landen: hoofdzone + tweede zone)
const CLOCKS = [
  { cc: "US", name: "United States", tz: "America/New_York", city: "New York", alt: { tz: "America/Los_Angeles", city: "Los Angeles" } },
  { cc: "GB", name: "United Kingdom", tz: "Europe/London", city: "London" },
  { cc: "CA", name: "Canada", tz: "America/Toronto", city: "Toronto", alt: { tz: "America/Vancouver", city: "Vancouver" } },
  { cc: "AU", name: "Australia", tz: "Australia/Sydney", city: "Sydney", alt: { tz: "Australia/Perth", city: "Perth" } },
  { cc: "NZ", name: "New Zealand", tz: "Pacific/Auckland", city: "Auckland" },
];
const hhmm = (now, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
const wday = (now, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
const hourIn = (now, tz) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(now)) % 24;

function LocalTimes() {
  const [now, setNow] = useState(null); // pas na het laden invullen (geen server/browser-verschil)
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);
  return (
    <div style={{ ...ui.card, padding: "18px 20px", marginBottom: "16px" }}>
      <div style={{ ...ui.label, marginBottom: "12px" }}>Local time in our countries</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: "10px" }}>
        {CLOCKS.map((c) => {
          const h = now ? hourIn(now, c.tz) : 12;
          const day = h >= 7 && h < 22;
          return (
            <div key={c.cc} style={{ border: "1px solid #eceef2", borderRadius: "12px", padding: "12px 14px", background: day ? "#ffffff" : "#f4f6fb" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{flag(c.cc)}&nbsp; {c.name}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1.15, marginTop: "6px", fontVariantNumeric: "tabular-nums" }}>{now ? hhmm(now, c.tz) : "--:--"}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{now ? `${day ? "☀️" : "🌙"} ${wday(now, c.tz)} · ${c.city}` : c.city}</div>
              {c.alt && <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{c.alt.city} {now ? hhmm(now, c.alt.tz) : "--:--"}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const QUICK = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const cell = { padding: "11px 12px", borderBottom: "1px solid #f1f3f6", fontSize: "13.5px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const hcell = { ...ui.th, textAlign: "right", whiteSpace: "nowrap" };

// Checkout-bron ("host/pad", of oude rijen met alleen "host") koppelen aan een funnel-key
function matchKey(src, funnels) {
  if (!src || src === "direct") return "direct";
  if (funnels.some((f) => f.key === src)) return src;
  if (!src.includes("/")) {
    const same = funnels.filter((f) => f.host === src);
    const withCc = same.filter((f) => f.checkoutClicks > 0).sort((a, b) => b.checkoutClicks - a.checkoutClicks);
    if (withCc.length) return withCc[0].key;
    if (same.length) return same[0].key;
  }
  return src;
}

function Bar({ v, max, color = ACCENT }) {
  return (
    <div style={{ height: "8px", background: "#eef1f6", borderRadius: "999px", overflow: "hidden", minWidth: "80px" }}>
      <div style={{ width: `${max > 0 ? Math.max(v > 0 ? 2 : 0, Math.min(100, (v / max) * 100)) : 0}%`, height: "100%", background: color, borderRadius: "999px" }} />
    </div>
  );
}

export default function CheckoutVisits() {
  const [preset, setPreset] = useState("today");
  const [range, setRange] = useState(presetRange("today"));
  const [data, setData] = useState(null);
  const [fm, setFm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState("all");
  const [sel, setSel] = useState(null);

  useEffect(() => { setRange(presetRange(preset)); }, [preset]);
  useEffect(() => {
    if (!range.from || !range.to) return;
    let on = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/checkout-visits?from=${range.from}&to=${range.to}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/funnel-metrics?from=${range.from}&to=${range.to}`).then((r) => r.json()).catch(() => null),
    ]).then(([cv, f]) => { if (on) { setData(cv); setFm(f); setLoading(false); } });
    return () => { on = false; };
  }, [range.from, range.to]);

  const all = data?.rows || [];
  const products = useMemo(() => [...new Set(all.map((r) => r.product))].sort(), [all]);
  const rows = all.filter((r) => product === "all" || r.product === product);
  const funnelsRaw = fm?.funnels || [];

  // Checkout-bezoeken per funnel
  const cvBy = {};
  rows.forEach((r) => {
    const k = matchKey(r.source, funnelsRaw);
    const o = (cvBy[k] = cvBy[k] || { visitors: 0, views: 0 });
    o.visitors += r.visitors; o.views += r.views;
  });

  // Funnels samenvoegen: pagina-stappen + checkout + orders
  let funnels = funnelsRaw.map((f) => ({ ...f, cv: cvBy[f.key] || { visitors: 0, views: 0 } }));
  Object.keys(cvBy).forEach((k) => {
    if (k !== "direct" && !funnels.some((f) => f.key === k)) funnels.push({ key: k, host: k.split("/")[0], steps: [], totalUniques: 0, checkoutClicks: 0, orders: 0, revenue: 0, cv: cvBy[k] });
  });
  if (product !== "all") funnels = funnels.filter((f) => cvBy[f.key]);
  funnels = funnels
    .filter((f) => f.totalUniques > 0 || f.cv.visitors > 0 || f.orders > 0)
    .sort((a, b) => b.cv.visitors - a.cv.visitors || b.totalUniques - a.totalUniques || b.revenue - a.revenue);
  const direct = cvBy.direct;

  const cur = funnels.find((f) => f.key === sel) || funnels[0] || null;
  const tot = funnels.reduce((t, f) => ({ u: t.u + f.totalUniques, cc: t.cc + f.checkoutClicks, cv: t.cv + f.cv.visitors, o: t.o + f.orders, r: t.r + f.revenue }), { u: 0, cc: 0, cv: 0, o: 0, r: 0 });
  const totalCv = rows.reduce((s, r) => s + r.visitors, 0);

  // Stappen van de gekozen funnel (Funnelish-stijl)
  const steps = [];
  if (cur) {
    const pages = cur.steps || [];
    pages.forEach((s, i) => {
      const nxt = pages[i + 1];
      const toCheckout = s.ccu > 0 || !nxt;
      steps.push({
        n: steps.length + 1, kind: "page", label: s.path, sub: `${cur.host}${s.path === "/" ? "" : s.path}`,
        u: s.pvu, pv: s.pv,
        next: toCheckout ? s.ccu : nxt.pvu, nextLabel: toCheckout ? "clicked to checkout" : `to ${nxt.path}`,
      });
    });
    steps.push({ n: steps.length + 1, kind: "checkout", label: "Checkout", sub: "checkout.getjustjenny.com", u: cur.cv.visitors, pv: cur.cv.views, next: cur.orders, nextLabel: "bought" });
    steps.push({ n: steps.length + 1, kind: "order", label: "Order", sub: cur.orders > 0 ? `AOV ${fmtEur(cur.revenue / cur.orders)}` : "", u: cur.orders, pv: null, revenue: cur.revenue });
  }
  const top = steps.length ? Math.max(...steps.map((s) => s.u)) : 0;

  const byCountry = group(rows, (r) => r.country).sort((a, b) => b.visitors - a.visitors || b.views - a.views);
  const multiDay = range.from !== range.to;
  const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const pill = (on) => ({ padding: "8px 16px", borderRadius: "999px", border: `1px solid ${on ? ACCENT : "#e2e6ec"}`, background: on ? ACCENT : "#fff", color: on ? "#fff" : "#334155", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const kpi = (label, value, sub) => (
    <div style={{ ...ui.card, padding: "14px 16px" }}>
      <div style={ui.label}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "6px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ ...ui.page, maxWidth: "1100px" }}>
      <h1 style={{ margin: "0 0 16px 0", fontSize: "22px", fontWeight: 800 }}>🛒 Checkout Clicks</h1>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        {QUICK.map((q) => <button key={q.key} onClick={() => setPreset(q.key)} style={pill(preset === q.key)}>{q.label}</button>)}
        <span style={{ fontSize: "12.5px", color: "#64748b", marginLeft: "6px" }}>{multiDay ? `${dayLabel(range.from)} – ${dayLabel(range.to)}` : dayLabel(range.from)}</span>
        <select value={product} onChange={(e) => setProduct(e.target.value)} style={{ marginLeft: "auto", padding: "8px 12px", border: "1px solid #e2e6ec", borderRadius: "999px", fontSize: "13px", fontFamily: "inherit", color: "#334155", background: "#fff", cursor: "pointer" }}>
          <option value="all">All products</option>
          {products.map((p) => <option key={p} value={p}>{productName(p)}</option>)}
        </select>
      </div>

      {data && data.success === false && (
        <div style={{ ...ui.card, padding: "18px", color: "#b91c1c", marginBottom: "16px" }}>Could not load the data: {data.error || "no access"}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: "12px", marginBottom: "16px", opacity: loading ? 0.5 : 1 }}>
        {kpi("Funnel visitors", fmtInt(tot.u), "unique, first page")}
        {kpi("Clicked to checkout", fmtInt(tot.cc), pct(tot.cc, tot.u) + " of visitors")}
        {kpi("Reached checkout", fmtInt(totalCv), "unique checkout visitors")}
        {kpi("Orders", fmtInt(tot.o), pct(tot.o, totalCv) + " of checkout")}
        {kpi("Revenue", fmtEur(tot.r), tot.u > 0 ? `${fmtEur(tot.r / tot.u)} per visitor` : "")}
      </div>

      {/* Alle funnels */}
      <div style={{ ...ui.card, marginBottom: "16px", overflowX: "auto", opacity: loading ? 0.5 : 1 }}>
        <div style={{ ...ui.label, padding: "16px 18px 6px" }}>Funnels</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead><tr>
            <th style={ui.th}>Funnel</th>
            <th style={hcell}>Visitors</th>
            <th style={hcell}>Clicked to checkout</th>
            <th style={hcell}>Reached checkout</th>
            <th style={hcell}>Orders</th>
            <th style={hcell}>Conv.</th>
            <th style={hcell}>Revenue</th>
            <th style={hcell}>Per visitor</th>
          </tr></thead>
          <tbody>
            {funnels.length === 0 && <tr><td colSpan={8} style={{ ...ui.td, color: "#94a3b8" }}>{loading ? "Loading…" : "No funnel traffic in this period."}</td></tr>}
            {funnels.map((f) => {
              const on = cur && f.key === cur.key;
              return (
                <tr key={f.key} onClick={() => setSel(f.key)} style={{ cursor: "pointer", background: on ? "#eef2ff" : "transparent" }}>
                  <td style={{ ...cell, textAlign: "left", fontWeight: 700, color: on ? ACCENT : "#0f172a" }}>{on ? "▸ " : ""}{f.key}</td>
                  <td style={cell}>{fmtInt(f.totalUniques)}</td>
                  <td style={cell}>{fmtInt(f.checkoutClicks)} <span style={{ color: "#94a3b8" }}>· {pct(f.checkoutClicks, f.totalUniques)}</span></td>
                  <td style={cell}>{fmtInt(f.cv.visitors)}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{fmtInt(f.orders)}</td>
                  <td style={cell}>{pct(f.orders, f.totalUniques)}</td>
                  <td style={{ ...cell, fontWeight: 700, color: f.revenue > 0 ? "#166534" : "#0f172a" }}>{fmtEur(f.revenue)}</td>
                  <td style={cell}>{f.totalUniques > 0 ? fmtEur(f.revenue / f.totalUniques) : "—"}</td>
                </tr>
              );
            })}
            {direct && direct.visitors > 0 && (
              <tr><td style={{ ...cell, textAlign: "left", color: "#64748b" }}>Direct / unknown (checkout only)</td><td style={cell}>—</td><td style={cell}>—</td><td style={cell}>{fmtInt(direct.visitors)}</td><td style={cell}>—</td><td style={cell}>—</td><td style={cell}>—</td><td style={cell}>—</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: "12px", color: "#94a3b8", padding: "10px 18px 14px" }}>Click a funnel to see its steps below.</div>
      </div>

      {/* Stappen van de gekozen funnel */}
      {cur && (
        <div style={{ ...ui.card, marginBottom: "16px", overflowX: "auto", opacity: loading ? 0.5 : 1 }}>
          <div style={{ padding: "16px 18px 6px", display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
            <div style={ui.label}>Funnel steps</div>
            <div style={{ fontSize: "15px", fontWeight: 800 }}>{cur.key}</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
            <thead><tr>
              <th style={{ ...ui.th, width: "36px" }}>#</th>
              <th style={ui.th}>Step</th>
              <th style={hcell}>Unique visitors</th>
              <th style={hcell}>Page views</th>
              <th style={{ ...ui.th, width: "22%" }}></th>
              <th style={hcell}>Went to next step</th>
              <th style={hcell}>Rate</th>
            </tr></thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.n} style={{ background: s.kind === "order" ? "#f0fdf4" : s.kind === "checkout" ? "#f8fafc" : "transparent" }}>
                  <td style={{ ...cell, textAlign: "left", color: "#94a3b8", fontWeight: 700 }}>{s.n}</td>
                  <td style={{ ...cell, textAlign: "left", whiteSpace: "normal" }}>
                    <div style={{ fontWeight: 700 }}>{s.kind === "page" ? `Page ${s.label}` : s.kind === "checkout" ? "🛒 Checkout" : "✅ Order"}</div>
                    {s.sub && <div style={{ fontSize: "12px", color: "#94a3b8" }}>{s.sub}</div>}
                  </td>
                  <td style={{ ...cell, fontSize: "16px", fontWeight: 800 }}>{fmtInt(s.u)}</td>
                  <td style={{ ...cell, color: "#64748b" }}>{s.pv == null ? (s.revenue != null ? <b style={{ color: "#166534" }}>{fmtEur(s.revenue)}</b> : "—") : fmtInt(s.pv)}</td>
                  <td style={cell}><Bar v={s.u} max={top} color={s.kind === "order" ? "#16a34a" : ACCENT} /></td>
                  <td style={cell}>{s.kind === "order" ? "" : <>{fmtInt(s.next)} <span style={{ color: "#94a3b8" }}>{s.nextLabel}</span></>}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{s.kind === "order" ? "" : pct(s.next, s.u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: "12px", color: "#94a3b8", padding: "10px 18px 14px" }}>
            Overall conversion: <b style={{ color: "#334155" }}>{pct(cur.orders, cur.totalUniques)}</b> of first-page visitors bought · revenue per visitor <b style={{ color: "#334155" }}>{cur.totalUniques > 0 ? fmtEur(cur.revenue / cur.totalUniques) : "—"}</b>
          </div>
        </div>
      )}

      <LocalTimes />

      <div style={{ display: "grid", gap: "16px", opacity: loading ? 0.5 : 1 }}>
        <List title="Checkout visitors by country" rows={byCountry} empty="No checkout visitors yet." render={(k) => <span>{flag(k)}&nbsp; {countryName(k)}</span>} />
      </div>
    </div>
  );
}
