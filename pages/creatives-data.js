// pages/creatives-data.js
// Creatives Data — welke creatives verkopen, per editor/designer.
// Zichtbaar voor de hele creative kant; profit alleen voor admin/finance.

import { useState, useEffect, useMemo } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px" },
  select: { padding: "8px 12px", border: "1px solid #e2e6ec", borderRadius: "10px", fontSize: "13px", background: "#fff", color: "#0f172a", fontFamily: "inherit", outline: "none" },
};

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const RANGES = [
  { key: "1", label: "Today" },
  { key: "7", label: "7d" },
  { key: "14", label: "14d" },
  { key: "30", label: "30d" },
  { key: "60", label: "60d" },
  { key: "90", label: "90d" },
  { key: "custom", label: "Custom" },
];

const eur = (v) => "€" + (v || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = (v) => "€" + Math.round(v || 0).toLocaleString("en-IE");
const pct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
const num = (v) => (v == null ? "—" : v.toFixed(2));

// Kleur van een ROAS-badge: onder 1 rood, 1–2 oranje, boven 2 groen
const roasColor = (r) => (r == null ? { c: "#94a3b8", bg: "#f1f5f9" } : r >= 2 ? { c: "#15803d", bg: "#dcfce7" } : r >= 1 ? { c: "#b45309", bg: "#fef3c7" } : { c: "#b91c1c", bg: "#fee2e2" });

/* De ad-naam volgt de naming convention en is lang; de angle is wat telt. */
const AD_NOISE = /^(net new|iteration|h\d+|v\d+|ad|ugc|insta|organic ad|podcast ad|person iteration|\d+)$/i;
const AD_DATE = /^\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?$/;
function adLabel(name, productTitle) {
  if (!name) return "";
  const prod = (productTitle || "").toLowerCase();
  const parts = name.split(/\s*[|–-]\s*/).map((x) => x.trim()).filter(Boolean);
  const keep = parts.filter((x) => {
    const l = x.toLowerCase();
    if (AD_DATE.test(x) || AD_NOISE.test(x)) return false;
    if (prod && (l === prod || prod.indexOf(l) > -1 || l.indexOf(prod) > -1)) return false;
    return true;
  });
  const phrases = keep.filter((x) => /\s/.test(x));
  const pick = phrases.length ? phrases.slice(0, 2) : keep.length ? [keep[keep.length - 1]] : parts.slice(0, 1);
  return pick.join(" · ");
}

const personColor = (seed) => {
  const palette = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};

export default function CreativesData() {
  const isMobile = useIsMobile();
  const [range, setRange] = useState("1"); // standaard: vandaag
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // filters
  const [fEditor, setFEditor] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fKind, setFKind] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "revenue", dir: "desc" });
  const [prefilled, setPrefilled] = useState(false);
  // handmatig koppelen
  const [linkPick, setLinkPick] = useState({});
  const [linkBusy, setLinkBusy] = useState("");

  const load = async (silent = false) => {
    if (range === "custom" && (!customFrom || !customTo)) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const qs = range === "custom" ? `from=${customFrom}&to=${customTo}` : `days=${range}`;
      const res = await fetch(`/api/creatives-data?${qs}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Failed to load");
      setData(res);
      // Editors en designers landen standaard op hun eigen werk
      if (!prefilled) {
        const mine = res.me?.roles?.some((r) => r === "Video Editor" || r === "Graphic Designer");
        if (mine && res.rows.some((x) => x.editorEmail === res.me.email)) setFEditor(res.me.email);
        setPrefilled(true);
      }
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo]);

  const rows = data?.rows || [];
  const showProfit = !!data?.showProfit;

  // keuzelijsten uit de data zelf
  const editors = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.editorEmail || r.editor) m.set(r.editorEmail || r.editor, r.editor || r.editorEmail);
    return [...m.entries()].map(([k, v]) => ({ key: k, label: v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const products = useMemo(() => [...new Set(rows.map((r) => r.product).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEditor && (r.editorEmail || r.editor) !== fEditor) return false;
      if (fProduct && r.product !== fProduct) return false;
      if (fKind && r.kind !== fKind) return false;
      if (q && !`${r.adName} ${r.angle} ${r.campaignName} ${r.product} ${r.editor}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, fEditor, fProduct, fKind, search]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const s = [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv);
      return av - bv;
    });
    return dir === "desc" ? s.reverse() : s;
  }, [filtered, sort]);

  // totalen voor de huidige filter
  const totals = useMemo(() => {
    const t = filtered.reduce(
      (acc, r) => {
        acc.spend += r.spend;
        acc.revenue += r.revenue;
        acc.orders += r.orders;
        acc.clicks += r.clicks;
        acc.profit += r.profit || 0;
        acc.winners += r.winner ? 1 : 0;
        return acc;
      },
      { spend: 0, revenue: 0, orders: 0, clicks: 0, profit: 0, winners: 0 }
    );
    t.roas = t.spend > 0 ? t.revenue / t.spend : null;
    t.cvr = t.clicks > 0 ? (t.orders / t.clicks) * 100 : null;
    t.cac = t.orders > 0 ? t.spend / t.orders : null;
    return t;
  }, [filtered]);

  // leaderboard per editor (binnen product/type-filter, niet binnen editor-filter)
  const leaderboard = useMemo(() => {
    const m = {};
    for (const r of rows) {
      if (fProduct && r.product !== fProduct) continue;
      if (fKind && r.kind !== fKind) continue;
      const k = r.editorEmail || r.editor || "?";
      if (!m[k]) m[k] = { key: k, name: r.editor || r.editorEmail, spend: 0, revenue: 0, orders: 0, ads: 0, winners: 0 };
      m[k].spend += r.spend;
      m[k].revenue += r.revenue;
      m[k].orders += r.orders;
      m[k].ads += 1;
      m[k].winners += r.winner ? 1 : 0;
    }
    return Object.values(m)
      .map((e) => ({ ...e, roas: e.spend > 0 ? e.revenue / e.spend : null }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, fProduct, fKind]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const sortMark = (key) => (sort.key === key ? (sort.dir === "desc" ? " ▾" : " ▴") : "");

  const linkAd = async (adId) => {
    const pick = linkPick[adId];
    if (!pick) return;
    const [kind, taskId] = pick.split(":");
    setLinkBusy(adId);
    try {
      const res = await fetch("/api/creatives-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", adId, taskId, kind }) }).then((r) => r.json());
      if (!res.success) throw new Error(res.error);
      await load(true);
    } catch (e) {
      alert(e.message || "Could not link");
    }
    setLinkBusy("");
  };
  const unlinkAd = async (adId) => {
    setLinkBusy(adId);
    try {
      await fetch("/api/creatives-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlink", adId }) });
      await load(true);
    } catch (e) {}
    setLinkBusy("");
  };

  const th = (key, label, align = "right") => (
    <th key={key} onClick={() => toggleSort(key)} style={{ padding: "10px 12px", textAlign: align, ...ui.label, borderBottom: "1px solid #eceef2", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
      {label}{sortMark(key)}
    </th>
  );
  const td = { padding: "11px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#334155", whiteSpace: "nowrap" };

  const winnerRule = data?.winnerRule || { minSpend: 500, minRoas: 2 };

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 12px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.3px" }}>Creatives Data</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
            Which creatives sell. Sales are matched to the exact ad via first-party tracking, ads to your task via the naming convention.
          </p>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ padding: "7px 12px", borderRadius: "999px", border: "1px solid " + (range === r.key ? "#0f172a" : "#e2e6ec"), background: range === r.key ? "#0f172a" : "#fff", color: range === r.key ? "#fff" : "#334155", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={ui.select} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={ui.select} />
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...ui.card, padding: "12px 14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
        <select value={fEditor} onChange={(e) => setFEditor(e.target.value)} style={ui.select}>
          <option value="">All editors & designers</option>
          {editors.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} style={ui.select}>
          <option value="">All products</option>
          {products.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={fKind} onChange={(e) => setFKind(e.target.value)} style={ui.select}>
          <option value="">Video + Image</option>
          <option value="video">🎬 Video</option>
          <option value="image">🎨 Image</option>
        </select>
        <input placeholder="Search angle, ad, campaign…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...ui.select, minWidth: isMobile ? "100%" : "240px" }} />
        {(fEditor || fProduct || fKind || search) && (
          <button onClick={() => { setFEditor(""); setFProduct(""); setFKind(""); setSearch(""); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: "12.5px", cursor: "pointer", fontWeight: 600 }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#8a92a3" }}>
          {data ? `${data.from} → ${data.to} · ${filtered.length} ads` : ""}
        </span>
      </div>

      {error && <div style={{ ...ui.card, padding: "14px 16px", color: "#b91c1c", background: "#fef2f2", borderColor: "#fecaca", marginBottom: "16px" }}>{error}</div>}
      {loading && !data && <div style={{ padding: "40px", textAlign: "center", color: "#8a92a3" }}>Loading…</div>}

      {data && (
        <>
          {/* Totalen */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${showProfit ? 7 : 6}, 1fr)`, gap: isMobile ? "10px" : "14px", marginBottom: "16px" }}>
            <Stat label="Ad spend" value={eur0(totals.spend)} />
            <Stat label="Revenue" value={eur0(totals.revenue)} />
            <Stat label="ROAS" value={totals.roas == null ? "—" : totals.roas.toFixed(2)} accent={totals.roas == null ? undefined : totals.roas >= winnerRule.minRoas ? "#15803d" : totals.roas >= 1 ? "#b45309" : "#b91c1c"} />
            {showProfit && <Stat label="Profit" value={eur0(totals.profit)} accent={totals.profit >= 0 ? "#15803d" : "#b91c1c"} />}
            <Stat label="Orders" value={totals.orders} />
            <Stat label="CAC" value={totals.cac == null ? "—" : eur(totals.cac)} sub="spend / order" />
            <Stat label="CVR" value={pct(totals.cvr)} sub="orders / clicks" />
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div style={{ ...ui.card, padding: isMobile ? "14px 12px" : "18px 20px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Leaderboard</h2>
                <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>🏆 Winner = ≥ {eur0(winnerRule.minSpend)} spend and ROAS ≥ {winnerRule.minRoas.toFixed(1)}</span>
              </div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
                {leaderboard.map((e, i) => {
                  const active = fEditor === e.key;
                  const rc = roasColor(e.roas);
                  return (
                    <div key={e.key} onClick={() => setFEditor(active ? "" : e.key)} style={{ minWidth: "190px", padding: "12px 14px", borderRadius: "12px", border: "1px solid " + (active ? "#0f172a" : "#eceef2"), background: active ? "#f8fafc" : "#fff", cursor: "pointer", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ width: "26px", height: "26px", borderRadius: "999px", background: personColor(e.key), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>
                          {(e.name || "?").charAt(0).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}{e.name}</div>
                          <div style={{ fontSize: "11px", color: "#8a92a3" }}>{e.ads} ads · {e.winners} 🏆</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.3px" }}>{eur0(e.revenue)}</div>
                      <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
                        spend {eur0(e.spend)} · <span style={{ color: rc.c, fontWeight: 700 }}>ROAS {e.roas == null ? "—" : e.roas.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabel */}
          <div style={{ ...ui.card, padding: isMobile ? "10px 6px" : "18px 20px", marginBottom: "16px" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: "980px", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    {th("angle", "Creative", "left")}
                    {th("editor", "Editor", "left")}
                    {th("roas", "ROAS")}
                    {th("revenue", "Revenue")}
                    {showProfit && th("profit", "Profit")}
                    {th("spend", "Ad spend")}
                    {th("orders", "Orders")}
                    {th("cac", "CAC")}
                    {th("cvr", "CVR")}
                    {th("lastDay", "Active")}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && (
                    <tr><td colSpan={showProfit ? 10 : 9} style={{ padding: "28px", textAlign: "center", color: "#94a3b8" }}>No ads match this filter.</td></tr>
                  )}
                  {sorted.map((r) => {
                    const rc = roasColor(r.roas);
                    const label = adLabel(r.adName, r.product) || r.angle || r.adName;
                    return (
                      <tr key={r.adId} style={{ borderBottom: "1px solid #f4f5f7" }}>
                        <td style={{ padding: "10px 12px", minWidth: "260px" }}>
                          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            {r.productImage ? (
                              <img src={r.productImage} alt="" style={{ width: "34px", height: "34px", borderRadius: "8px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#f1f5f9", flexShrink: 0 }} />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "340px" }} title={r.adName}>
                                {r.winner && <span title="Winner" style={{ marginRight: "5px" }}>🏆</span>}
                                {label}
                              </div>
                              <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "340px" }}>
                                {r.kind === "video" ? "🎬" : "🎨"} {r.product}{r.type ? ` · ${r.type}` : ""}{r.linkedManually ? " · linked manually" : ""}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                            <span style={{ width: "20px", height: "20px", borderRadius: "999px", background: personColor(r.editorEmail || r.editor), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700 }}>
                              {(r.editor || "?").charAt(0).toUpperCase()}
                            </span>
                            {r.editor || "—"}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: "999px", background: rc.bg, color: rc.c, fontWeight: 700, fontSize: "12px" }}>{num(r.roas)}</span>
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: "#0f172a" }}>{eur(r.revenue)}</td>
                        {showProfit && <td style={{ ...td, color: (r.profit || 0) >= 0 ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{eur(r.profit)}</td>}
                        <td style={td}>{eur(r.spend)}</td>
                        <td style={td}>{r.orders}</td>
                        <td style={td}>{r.cac == null ? "—" : eur(r.cac)}</td>
                        <td style={td}>{pct(r.cvr)}</td>
                        <td style={{ ...td, fontSize: "12px" }}>
                          {r.live ? <span style={{ color: "#15803d", fontWeight: 700 }}>● live</span> : <span style={{ color: "#94a3b8" }}>paused</span>}
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>{r.activeDays} {r.activeDays === 1 ? "day" : "days"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "12px 0 0 0", fontSize: "11.5px", color: "#8a92a3" }}>
              Revenue and orders are first-party (exact ad ID on the Shopify order). Ad spend and clicks come from Meta. CVR = orders / outbound clicks. CAC = ad spend / orders.
              {!data.isAdmin && data.unmatchedCount > 0 && ` · ${data.unmatchedCount} ads could not be linked to a task — check the naming convention with the media buyer.`}
            </p>
          </div>

          {/* Unmatched — alleen admin */}
          {data.isAdmin && (
            <div style={{ ...ui.card, padding: isMobile ? "14px 12px" : "18px 20px" }}>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700 }}>Not linked to a task <span style={{ color: "#8a92a3", fontWeight: 500 }}>({data.unmatched.length})</span></h2>
              <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#8a92a3" }}>
                Ads whose name doesn’t follow the naming convention. Link them to the right task so they count for the editor. Only you see this block.
              </p>
              {data.unmatched.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#15803d", margin: 0 }}>Everything is linked. 🎉</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {data.unmatched.map((u) => (
                    <div key={u.adId} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "10px 12px", background: "#f8fafc", borderRadius: "12px", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={u.adName}>{u.adName}</div>
                        <div style={{ fontSize: "11.5px", color: "#8a92a3" }}>
                          {u.campaignName} · spend {eur(u.spend)} · {u.orders} orders · {eur(u.revenue)}
                        </div>
                      </div>
                      <select value={linkPick[u.adId] || ""} onChange={(e) => setLinkPick((p) => ({ ...p, [u.adId]: e.target.value }))} style={{ ...ui.select, maxWidth: isMobile ? "100%" : "420px" }}>
                        <option value="">— Link to task —</option>
                        {data.taskOptions.map((t) => (
                          <option key={`${t.kind}:${t.taskId}`} value={`${t.kind}:${t.taskId}`}>
                            {t.kind === "video" ? "🎬" : "🎨"} {t.label}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => linkAd(u.adId)} disabled={!linkPick[u.adId] || linkBusy === u.adId} style={{ padding: "8px 14px", borderRadius: "10px", border: "none", background: linkPick[u.adId] ? "#0f172a" : "#e2e6ec", color: linkPick[u.adId] ? "#fff" : "#94a3b8", fontSize: "12.5px", fontWeight: 700, cursor: linkPick[u.adId] ? "pointer" : "default" }}>
                        {linkBusy === u.adId ? "…" : "Link"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {rows.some((r) => r.linkedManually) && (
                <details style={{ marginTop: "14px" }}>
                  <summary style={{ fontSize: "12px", color: "#64748b", cursor: "pointer" }}>Manually linked ads ({rows.filter((r) => r.linkedManually).length})</summary>
                  <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                    {rows.filter((r) => r.linkedManually).map((r) => (
                      <div key={r.adId} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "12px", color: "#334155" }}>
                        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.adName}>{r.adName} → <b>{r.editor}</b> · {r.product}</span>
                        <button onClick={() => unlinkAd(r.adId)} disabled={linkBusy === r.adId} style={{ background: "none", border: "none", color: "#b91c1c", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Unlink</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ ...ui.card, padding: "14px 16px" }}>
      <div style={{ ...ui.label, marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", color: accent || "#0f172a" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}
