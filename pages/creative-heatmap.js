// pages/creative-heatmap.js — Creative Heatmap
// Per product: spend en ROAS per combinatie van twee creative-dimensies (concept, angle, ICP,
// awareness stage, script structure, format type, net new/iteration). De dimensies komen uit de
// velden van de video-taak; de cijfers uit /api/creatives-data (Meta spend + Shopify-orders per ad,
// gekoppeld aan de taak via de naming convention). Geen AI-classificatie nodig: de strateeg vult
// de velden in bij het briefen.

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { weekStart, addDays, isoWeek } from "../lib/creative-calendar";

const DIMS = {
  concept: "Concept",
  mechanism: "Angle",
  icp: "ICP",
  awareness: "Awareness stage",
  scriptStructure: "Script structure",
  formatType: "Format type",
  type: "Net New / Iteration",
};
const WINDOWS = [["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["90", "90 days"]];
const NOT_SET = "Not set";

// Testing ladder: een angle × ICP is bewezen na ≥ €2.000 spend met ROAS ≥ 1,50.
const LADDER = { minSpend: 2000, minRoas: 1.5 };
function ladderStatus(spend, roas) {
  if (spend >= LADDER.minSpend) return roas >= LADDER.minRoas ? "proven" : "failed";
  return roas >= LADDER.minRoas ? "promising" : "testing";
}
const STATUS_LABEL = { proven: "Proven", promising: "Promising", testing: "Testing", failed: "Failed" };

const eur = (n) => "€" + Math.round(n || 0).toLocaleString("nl-BE");
const eurK = (n) => (n >= 1000 ? "€" + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + "k" : "€" + Math.round(n || 0));
const x2 = (n) => (Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "—");

// Kleur = ROAS t.o.v. het productgemiddelde (5 stappen, neutraal in het midden)
function tone(ratio) {
  if (!Number.isFinite(ratio)) return ["var(--n)", "var(--ink)"];
  if (ratio >= 1.25) return ["var(--g2)", "#fff"];
  if (ratio >= 1.05) return ["var(--g1)", "var(--ink)"];
  if (ratio >= 0.9) return ["var(--n)", "var(--ink)"];
  if (ratio >= 0.7) return ["var(--r1)", "var(--ink)"];
  return ["var(--r2)", "#fff"];
}

const val = (r, dim) => String(r[dim] || "").trim() || NOT_SET;

export default function CreativeHeatmap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [win, setWin] = useState("30");
  const [product, setProduct] = useState("");
  const [rowDim, setRowDim] = useState("concept");
  const [colDim, setColDim] = useState("icp");
  const [adsF, setAdsF] = useState("all");
  const [kindF, setKindF] = useState("all");
  const [calendar, setCalendar] = useState({ entries: [], backlog: [], week: "", options: { icp: {} }, canEdit: false });
  const [score90, setScore90] = useState(null); // rows van de laatste 90 dagen → scorebord
  const [calEdit, setCalEdit] = useState(null); // { id?, product, week, mechanism, icp, note }
  const [calBusy, setCalBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [tip, setTip] = useState(null);
  const [tab, setTab] = useState("heatmap");
  useEffect(() => { try { const t = localStorage.getItem("jj-heatmap-tab"); if (t === "ladder" || t === "calendar") setTab(t); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("jj-heatmap-tab", tab); } catch {} }, [tab]);
  const [openAngles, setOpenAngles] = useState({});

  useEffect(() => {
    try {
      setDark(localStorage.getItem("jj-creatives-theme") === "dark");
      const r = localStorage.getItem("jj-heatmap-rows"), c = localStorage.getItem("jj-heatmap-cols");
      if (r && DIMS[r]) setRowDim(r);
      if (c && DIMS[c] && c !== r) setColDim(c);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("jj-heatmap-rows", rowDim); localStorage.setItem("jj-heatmap-cols", colDim); } catch {} }, [rowDim, colDim]);
  const toggleDark = () => { setDark((d) => { try { localStorage.setItem("jj-creatives-theme", d ? "light" : "dark"); } catch {} return !d; }); };

  useEffect(() => {
    let dead = false;
    setLoading(true);
    fetch(`/api/creatives-data?days=${win}`)
      .then((r) => r.json())
      .then((res) => { if (dead) return; if (!res.success) throw new Error(res.error || "Failed to load"); setData(res); setError(""); })
      .catch((e) => !dead && setError(e.message))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [win]);
  useEffect(() => { setSel(null); }, [product, rowDim, colDim, win, adsF, kindF]);

  // Angle/ICP-kalender
  const loadCalendar = () => fetch("/api/creative-calendar").then((r) => r.json()).then((res) => res?.success && setCalendar({ entries: res.entries || [], backlog: res.backlog || [], week: res.week || weekStart(), options: res.options || { icp: {} }, canEdit: !!res.canEdit })).catch(() => {});
  useEffect(() => {
    loadCalendar();
    fetch("/api/creatives-data?days=90").then((r) => r.json()).then((res) => res?.success && setScore90(res.rows || [])).catch(() => {});
  }, []);
  const calPost = async (payload) => {
    setCalBusy(true);
    try {
      const res = await fetch("/api/creative-calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((r) => r.json());
      if (!res.success) { alert(res.error || "Something went wrong"); return false; }
      setCalendar((c) => ({ ...c, entries: res.entries || [], backlog: res.backlog || c.backlog }));
      return true;
    } finally { setCalBusy(false); }
  };
  // Slepen in de kalender: meteen tonen (optimistic), daarna opslaan. Opslagen na elkaar (geen overschrijvingen
  // bij snel na elkaar slepen); mislukt er één, dan de kalender opnieuw laden.
  const dropQueue = useRef(Promise.resolve());
  const calDrop = (payload, optimistic) => {
    setCalendar((c) => optimistic(c));
    dropQueue.current = dropQueue.current.then(() => calPost(payload)).then((ok) => { if (!ok) loadCalendar(); }).catch(() => loadCalendar());
  };

  // Gekoppelde ads van video- en design-taken (beide hebben de velden), met filter
  const videoRows = useMemo(() => (data?.rows || []).filter((r) => kindF === "all" ? true : r.kind === kindF), [data, kindF]);
  const products = useMemo(() => {
    const m = {};
    for (const r of videoRows) { const k = r.product || "—"; m[k] = (m[k] || 0) + r.spend; }
    return Object.keys(m).sort((a, b) => m[b] - m[a]);
  }, [videoRows]);
  useEffect(() => { if (products.length && !products.includes(product)) setProduct(products[0]); }, [products, product]);

  const rows = useMemo(() => videoRows.filter((r) => r.product === product).filter((r) => (adsF === "all" ? true : adsF === "live" ? r.live : !r.live)), [videoRows, product, adsF]);

  // Concept = taak. Ads van dezelfde taak worden opgeteld.
  const concepts = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const c = m[r.taskId] || (m[r.taskId] = { taskId: r.taskId, name: "", spend: 0, revenue: 0, orders: 0, ads: 0, live: false, editor: r.editor, thumbSrc: r.thumbSrc, missing: [] });
      for (const d of Object.keys(DIMS)) c[d] = val(r, d);
      c.spend += r.spend; c.revenue += r.revenue; c.orders += r.orders || 0; c.ads += 1; c.live = c.live || r.live;
      if (!c.thumbSrc && r.thumbSrc) c.thumbSrc = r.thumbSrc;
    }
    for (const c of Object.values(m)) {
      c.name = [c.concept !== NOT_SET ? c.concept : "", c.mechanism !== NOT_SET ? c.mechanism : ""].filter(Boolean).join(" · ") || "(no concept)";
      c.missing = ["concept", "mechanism", "icp", "awareness", "scriptStructure", "formatType"].filter((d) => c[d] === NOT_SET);
    }
    return Object.values(m);
  }, [rows]);

  const tot = concepts.reduce((a, c) => ({ s: a.s + c.spend, r: a.r + c.revenue, ads: a.ads + c.ads, o: a.o + c.orders }), { s: 0, r: 0, ads: 0, o: 0 });
  const avg = tot.s > 0 ? tot.r / tot.s : NaN;
  const sumBy = (k) => { const m = {}; for (const c of concepts) { const o = m[c[k]] || (m[c[k]] = { s: 0, r: 0, n: 0 }); o.s += c.spend; o.r += c.revenue; o.n++; } return m; };
  const R = sumBy(rowDim), K = sumBy(colDim);
  const sortKeys = (m) => Object.keys(m).sort((a, b) => (a === NOT_SET) - (b === NOT_SET) || m[b].s - m[a].s);
  const rKeys = sortKeys(R), cKeys = sortKeys(K);
  const cells = {};
  for (const c of concepts) { const k = c[rowDim] + "|" + c[colDim]; const o = cells[k] || (cells[k] = { s: 0, r: 0, n: 0 }); o.s += c.spend; o.r += c.revenue; o.n++; }
  const roas = (o) => (o.s > 0 ? o.r / o.s : NaN);

  // Inzichten
  const list = Object.entries(cells).map(([k, v]) => ({ k: k.split("|"), ...v, ro: roas(v) })).filter((c) => !c.k.includes(NOT_SET));
  const best = list.filter((c) => c.s > tot.s * 0.04 && Number.isFinite(c.ro)).sort((a, b) => b.ro - a.ro)[0];
  const leak = list.filter((c) => Number.isFinite(c.ro) && c.ro < avg * 0.9).sort((a, b) => b.s - a.s)[0];
  const hidden = list.filter((c) => c.s < tot.s * 0.03 && c.ro > avg * 1.15).sort((a, b) => b.ro - a.ro)[0];
  const gaps = [];
  for (const rw of rKeys.filter((k) => k !== NOT_SET).slice(0, 3)) for (const cl of cKeys.filter((k) => k !== NOT_SET).slice(0, 3)) if (!cells[rw + "|" + cl]) gaps.push(`${rw} × ${cl}`);
  const insights = [];
  if (best) insights.push(["▲", "var(--g1)", `Strongest combination: ${best.k[0]} × ${best.k[1]}`, `${x2(best.ro)} ROAS on ${eur(best.s)} spend. Brief more concepts on this.`]);
  if (leak) insights.push(["▼", "var(--r1)", `High spend, low ROAS: ${leak.k[0]} × ${leak.k[1]}`, `${eur(leak.s)} at ${x2(leak.ro)} ROAS. Check which concepts sit here before cutting.`]);
  if (hidden) insights.push(["◆", "var(--n)", `Hidden opportunity: ${hidden.k[0]} × ${hidden.k[1]}`, `${x2(hidden.ro)} ROAS on little spend (${eur(hidden.s)}). Not proven yet, worth testing.`]);
  if (gaps.length) insights.push(["○", "var(--seg)", `Never tested: ${gaps[0]}`, `A strong row and column that were never combined${gaps.length > 1 ? ` (+${gaps.length - 1} more)` : ""}.`]);

  const missing = concepts.filter((c) => c.missing.length).sort((a, b) => b.spend - a.spend);
  const board = concepts.filter((c) => !sel || (c[rowDim] === sel[0] && c[colDim] === sel[1])).sort((a, b) => b.spend - a.spend).slice(0, 10);

  // ---- Status per product × angle × ICP over álle producten (voor de kalender) ----
  const statusMap = useMemo(() => {
    const m = {};
    for (const r of videoRows.filter((r) => (adsF === "all" ? true : adsF === "live" ? r.live : !r.live))) {
      const k = [r.product, val(r, "mechanism"), val(r, "icp")].map((x) => String(x || "").trim().toLowerCase()).join("|");
      const o = m[k] || (m[k] = { s: 0, r: 0, n: new Set(), product: r.product, mechanism: val(r, "mechanism"), icp: val(r, "icp") });
      o.s += r.spend; o.r += r.revenue; o.n.add(r.taskId);
    }
    const out = {};
    for (const [k, o] of Object.entries(m)) out[k] = { product: o.product, mechanism: o.mechanism, icp: o.icp, spend: o.s, roas: o.s > 0 ? o.r / o.s : NaN, concepts: o.n.size, status: ladderStatus(o.s, o.s > 0 ? o.r / o.s : NaN) };
    return out;
  }, [videoRows, adsF]);
  const scoreboard = useMemo(() => {
    const m = {};
    for (const r of score90 || []) {
      const mech = val(r, "mechanism"), icp = val(r, "icp");
      if (mech === NOT_SET || icp === NOT_SET) continue;
      const k = [r.product, mech, icp].map((x) => String(x || "").trim().toLowerCase()).join("|");
      const o = m[k] || (m[k] = { product: r.product, mechanism: mech, icp, s: 0, r: 0 });
      o.s += r.spend; o.r += r.revenue;
    }
    const byProduct = {};
    for (const o of Object.values(m)) {
      const roas = o.s > 0 ? o.r / o.s : NaN, status = ladderStatus(o.s, roas);
      const p = byProduct[o.product] || (byProduct[o.product] = { working: [], failed: [], testing: [] });
      const item = { ...o, roas, status };
      if (status === "proven" || status === "promising") p.working.push(item);
      else if (status === "failed") p.failed.push(item);
      else p.testing.push(item);
    }
    for (const p of Object.values(byProduct)) { p.working.sort((a, b) => b.roas - a.roas); p.failed.sort((a, b) => b.s - a.s); p.testing.sort((a, b) => b.s - a.s); }
    return Object.entries(byProduct).sort((a, b) => a[0].localeCompare(b[0]));
  }, [score90]);

  const calStatus = (e) => statusMap[[e.product, e.mechanism, e.icp].map((x) => String(x || "").trim().toLowerCase()).join("|")] || null;

  // ---- Testing ladder: angle × ICP → formats ----
  const ladder = useMemo(() => {
    const m = {};
    for (const c of concepts) {
      const key = c.mechanism + "|" + c.icp;
      const a = m[key] || (m[key] = { key, mechanism: c.mechanism, icp: c.icp, spend: 0, revenue: 0, n: 0, ads: 0, formats: {}, unset: c.mechanism === NOT_SET || c.icp === NOT_SET });
      a.spend += c.spend; a.revenue += c.revenue; a.n++; a.ads += c.ads;
      const f = a.formats[c.formatType] || (a.formats[c.formatType] = { name: c.formatType, spend: 0, revenue: 0, n: 0, ads: 0, structures: new Set(), editors: new Set(), concepts: [] });
      f.spend += c.spend; f.revenue += c.revenue; f.n++; f.ads += c.ads; f.concepts.push(c);
      if (c.scriptStructure !== NOT_SET) f.structures.add(c.scriptStructure);
      if (c.editor) f.editors.add(c.editor);
    }
    const allIcps = new Set(concepts.map((c) => c.icp).filter((f) => f !== NOT_SET));
    const list = Object.values(m).map((a) => {
      a.roas = a.spend > 0 ? a.revenue / a.spend : NaN;
      a.status = a.unset ? "testing" : ladderStatus(a.spend, a.roas);
      a.formatList = Object.values(a.formats).map((f) => ({ ...f, roas: f.spend > 0 ? f.revenue / f.spend : NaN, status: f.name === NOT_SET ? "testing" : ladderStatus(f.spend, f.spend > 0 ? f.revenue / f.spend : NaN) })).sort((x, y) => (x.name === NOT_SET) - (y.name === NOT_SET) || y.spend - x.spend);
      const tested = a.formatList.filter((f) => f.name !== NOT_SET).length;
      // Volgende stap in de volgorde: angle bewijzen → 5 formats → schalen
      if (a.unset) a.next = { tone: "", text: `Angle or ICP is empty on ${a.n} task${a.n > 1 ? "s" : ""}. Fill them in to place these concepts on the ladder.` };
      else if (a.status === "failed") a.next = { tone: "stop", text: `€${Math.round(a.spend).toLocaleString("nl-BE")} spent at ${x2(a.roas)} ROAS (bar: ${x2(LADDER.minRoas)}). Stop this angle for this ICP; try another mechanism.` };
      else if (a.status === "testing") a.next = { tone: "", text: `${eur(LADDER.minSpend - a.spend)} more spend needed to judge this angle (ROAS now ${x2(a.roas)}, bar ${x2(LADDER.minRoas)}).` };
      else if (a.status === "promising") a.next = { tone: "go", text: `ROAS above the bar, ${eur(LADDER.minSpend - a.spend)} more spend needed to call it proven. Keep it running.` };
      else { const best = a.formatList.filter((f) => f.name !== NOT_SET && Number.isFinite(f.roas)).sort((x, y) => y.roas - x.roas)[0]; a.next = { tone: "go", text: `Proven: profitable after ${eur(a.spend)} spend. Scale this angle for this ICP${best ? ` — best format so far: ${best.name} (${x2(best.roas)})` : ""}.` }; }
      a.tested = tested;
      return a;
    });
    const rank = { proven: 0, promising: 1, testing: 2, failed: 3 };
    list.sort((x, y) => (x.unset ? 1 : 0) - (y.unset ? 1 : 0) || rank[x.status] - rank[y.status] || y.spend - x.spend);
    // ICP's die bij een bewezen angle nog nooit getest zijn
    const gaps = [];
    for (const mech of [...new Set(list.filter((x) => x.status === "proven").map((x) => x.mechanism))]) for (const icp of allIcps) if (!m[mech + "|" + icp]) gaps.push(`${mech} × ${icp}`);
    const count = (st) => list.filter((a) => !a.unset && a.status === st).length;
    return { list, gaps, counts: { proven: count("proven"), promising: count("promising"), testing: count("testing"), failed: count("failed"), unset: list.filter((a) => a.unset).length } };
  }, [concepts]);

  return (
    <div className={`hm ${dark ? "hm-dark" : ""}`} onMouseMove={(e) => tip && setTip({ ...tip, x: e.clientX, y: e.clientY })}>
      <style>{CSS}</style>
      <div className="hm-head">
        <div>
          <h1>Creative Heatmap</h1>
          <div className="hm-meta">
            {data ? <>Meta spend × Shopify revenue per ad, grouped by the fields of the video task · {data.from} → {data.to}</> : "Loading…"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="hm-seg">{products.map((p) => <button key={p} className={product === p ? "on" : ""} onClick={() => setProduct(p)}>{p}</button>)}</div>
          <button className="hm-icon" onClick={toggleDark} title="Theme">{dark ? "☀" : "☾"}</button>
        </div>
      </div>

      <div className="hm-tabs">
        <button className={tab === "heatmap" ? "on" : ""} onClick={() => setTab("heatmap")}>Heatmap</button>
        <button className={tab === "ladder" ? "on" : ""} onClick={() => setTab("ladder")}>Testing ladder</button>
        <button className={tab === "calendar" ? "on" : ""} onClick={() => setTab("calendar")}>Calendar</button>
      </div>

      <div className="hm-bar">
        <div className="hm-seg">{WINDOWS.map(([k, l]) => <button key={k} className={win === k ? "on" : ""} onClick={() => setWin(k)}>{l}</button>)}</div>
        {tab === "calendar" && <div className="hm-rule">One angle × ICP per product per week · status comes from the ads in the selected window</div>}
        {tab === "ladder" && <div className="hm-rule">Proven = ≥ <b>{eur(LADDER.minSpend)}</b> spend and ROAS ≥ <b>{x2(LADDER.minRoas)}</b></div>}
        {tab === "heatmap" && <label className="hm-pick">Rows <select value={rowDim} onChange={(e) => setRowDim(e.target.value)}>{Object.entries(DIMS).filter(([k]) => k !== colDim).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        {tab === "heatmap" && <label className="hm-pick">Columns <select value={colDim} onChange={(e) => setColDim(e.target.value)}>{Object.entries(DIMS).filter(([k]) => k !== rowDim).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        <div className="hm-sp" />
        {tab !== "calendar" && <label className="hm-pick">Type <select value={kindF} onChange={(e) => setKindF(e.target.value)}><option value="all">Video + image</option><option value="video">Video</option><option value="image">Image</option></select></label>}
        {tab !== "calendar" && <label className="hm-pick">Ads <select value={adsF} onChange={(e) => setAdsF(e.target.value)}><option value="all">All</option><option value="live">Delivering</option><option value="off">Paused</option></select></label>}
      </div>

      {error && <div className="hm-card hm-box" style={{ color: "var(--r2)" }}>Error: {error}</div>}

      {tab === "calendar" && (
        <CalendarView
          calendar={calendar}
          products={[...new Set([...products, ...calendar.entries.map((e) => e.product), ...calendar.backlog.map((e) => e.product)])]}
          allProducts={[...new Set((data?.rows || []).map((r) => r.product).filter(Boolean))]}
          knownAngles={[...new Set([...(data?.rows || []).map((r) => r.mechanism).filter(Boolean), ...calendar.entries.map((e) => e.mechanism), ...calendar.backlog.map((e) => e.mechanism)])]}
          backlogPost={calPost}
          onDrop={calDrop}
          calStatus={calStatus}
          statusMap={statusMap}
          scoreboard={scoreboard}
          scoreLoaded={!!score90}
          edit={calEdit}
          setEdit={setCalEdit}
          busy={calBusy}
          onSave={async (e) => { const ok = await calPost(e.id ? { action: "update", id: e.id, entry: e } : { action: "add", entry: e }); if (ok) setCalEdit(null); }}
          onDelete={async (id) => { if (confirm("Remove this focus from the calendar?")) await calPost({ action: "delete", id }); }}
        />
      )}

      {tab === "ladder" && (
        <>
          {/* Samenvatting: één strook, drie cijfers, één kleur */}
          <div className="hm-card hm-sum">
            {(() => {
              const c = ladder.counts, total = c.proven + c.promising + c.testing + c.failed;
              const parts = [c.promising ? `${c.promising} promising` : "", c.testing ? `${c.testing} testing` : "", c.failed ? `${c.failed} failed` : "", c.unset ? `${c.unset} not filled in` : ""].filter(Boolean);
              return (
                <>
                  <div className="hm-tile">
                    <div className="st"><span className="n">1</span>Angle × ICP</div>
                    <div className="big">{c.proven}<small>of {total} proven</small></div>
                    <div className="bar"><i style={{ width: `${total ? (c.proven / total) * 100 : 0}%` }} /></div>
                    <div className="sub">{parts.length ? parts.join(" · ") : "nothing else yet"}</div>
                  </div>
                  <div className="hm-tile">
                    <div className="st"><span className="n">2</span>Still in test</div>
                    <div className="big">{c.testing + c.promising}<small>under {eur(LADDER.minSpend)} spend</small></div>
                    <div className="bar"><i style={{ width: `${total ? ((c.testing + c.promising) / total) * 100 : 0}%` }} /></div>
                    <div className="sub">{c.testing + c.promising ? `${eur(ladder.list.filter((x) => !x.unset && (x.status === "testing" || x.status === "promising")).reduce((t, x) => t + (LADDER.minSpend - x.spend), 0))} more spend needed in total · ${c.promising} already above the bar` : "nothing in test"}</div>
                  </div>
                  <div className="hm-tile">
                    <div className="st"><span className="n">3</span>Gaps</div>
                    <div className="big">{ladder.gaps.length}<small>proven angle, ICP never tried</small></div>
                    <div className="gaps">{ladder.gaps.length ? ladder.gaps.slice(0, 2).map((g) => <span key={g}>{g}</span>) : <span>none</span>}{ladder.gaps.length > 2 ? <span>+{ladder.gaps.length - 2} more</span> : null}</div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Eén kaart per angle × ICP: spend-balk naar €2k, ROAS-meter met de lat, 5 format-stippen */}
          {!ladder.list.length && <div className="hm-card hm-empty">No matched ads for this product in this window.</div>}
          <div className="hm-grid">
            {ladder.list.map((a) => {
              const open = !!openAngles[a.key];
              const spendPct = Math.min(100, (a.spend / LADDER.minSpend) * 100);
              const roasPct = Number.isFinite(a.roas) ? Math.min(100, (a.roas / (LADDER.minRoas * 2)) * 100) : 0;
              return (
                <div key={a.key} className={`hm-card hm-ac ${a.status} ${a.unset ? "ns" : ""}`}>
                  <div className="top">
                    <span className={`hm-st ${a.status}`}>{STATUS_LABEL[a.status]}</span>
                    <div className="ttl"><b>{a.mechanism}</b><span className="x"> × </span><b>{a.icp}</b></div>
                    <div className="sub">{a.n} concept{a.n > 1 ? "s" : ""} · {a.ads} ad{a.ads > 1 ? "s" : ""} · {a.tested} format{a.tested === 1 ? "" : "s"}</div>
                  </div>
                  <div className="meters">
                    <div className="m">
                      <div className="l"><span>Spend</span><b>{eur(a.spend)}</b><small>of {eur(LADDER.minSpend)}</small></div>
                      <div className="track"><i className={a.status} style={{ width: `${spendPct}%` }} /></div>
                    </div>
                    <div className="m">
                      <div className="l"><span>ROAS</span><b>{x2(a.roas)}</b><small>bar {x2(LADDER.minRoas)}</small></div>
                      <div className="track"><i className={a.status} style={{ width: `${roasPct}%` }} /><em style={{ left: "50%" }} /></div>
                    </div>
                  </div>
                  <div className={`hm-next ${a.next.tone}`}><i>{a.next.tone === "stop" ? "■" : "→"}</i>{a.next.text}</div>
                  <button type="button" className="more" onClick={() => setOpenAngles((o) => ({ ...o, [a.key]: !open }))}>{open ? "Hide formats ▴" : "Show formats ▾"}</button>
                  {open && (
                    <div className="fl">
                      {a.formatList.map((f) => (
                        <div key={f.name} className={`hm-lr l2 ${f.name === NOT_SET ? "ns" : ""}`}>
                          <div className="tg"><span className={`d ${f.status}`} /></div>
                          <div style={{ minWidth: 0 }}>
                            <div className="nm">{f.name}{f.structures.size ? <span className="sub"> · {[...f.structures].join(", ")}</span> : null}</div>
                            <div className="sub">{f.concepts.slice(0, 3).map((c, i) => <Link key={c.taskId} href={`/video-editor?task=${encodeURIComponent(c.taskId)}`} className="hm-lnk">{i ? " · " : ""}{c.concept !== NOT_SET ? c.concept : "(no concept)"}</Link>)}{f.concepts.length > 3 ? ` · +${f.concepts.length - 3}` : ""}{f.editors.size ? ` · ${[...f.editors].join(", ")}` : ""}</div>
                          </div>
                          <div className="v">{eur(f.spend)}</div>
                          <div className="ro">{x2(f.roas)}</div>
                          <span className={`hm-st ${f.status}`}>{STATUS_LABEL[f.status]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "heatmap" && <>
      <div className="hm-card hm-kpis">
        {[["Spend", eur(tot.s), "Meta, matched ads"], ["ROAS", x2(avg), "Shopify revenue ÷ spend · average = middle of the scale"], ["Concepts", concepts.length, `${tot.ads} ads · ${tot.o} orders`], ["Classified", concepts.length ? `${Math.round(((concepts.length - missing.length) / concepts.length) * 100)}%` : "—", missing.length ? `${missing.length} concept${missing.length > 1 ? "s" : ""} with empty fields` : "all fields filled in"]]
          .map(([l, v, s]) => <div key={l} className="hm-kpi"><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>)}
      </div>

      <div className="hm-card hm-hmc">
        <div className="hm-hmh">
          <div><h2>{DIMS[rowDim]} × {DIMS[colDim]}</h2><p>Colour = ROAS vs. the product average. Click a cell to see its concepts.</p></div>
          <div className="hm-legend">
            <span>lower</span>
            <span className="scale"><i style={{ background: "var(--r2)" }} /><i style={{ background: "var(--r1)" }} /><i style={{ background: "var(--n)" }} /><i style={{ background: "var(--g1)" }} /><i style={{ background: "var(--g2)" }} /></span>
            <span>higher</span>
            <span className="fade"><i />little spend</span>
          </div>
        </div>
        {!loading && concepts.length > 0 && (cKeys.every((k) => k === NOT_SET) || rKeys.every((k) => k === NOT_SET)) && (
          <div className="hm-note">
            {[cKeys.every((k) => k === NOT_SET) ? DIMS[colDim] : null, rKeys.every((k) => k === NOT_SET) ? DIMS[rowDim] : null].filter(Boolean).join(" and ")} is not filled in on any task yet.
            Fill it in on the video tasks (see the list below), or pick another dimension.
          </div>
        )}
        {loading && !data ? (
          <div className="hm-empty">Loading…</div>
        ) : !concepts.length ? (
          <div className="hm-empty">
            {videoRows.length ? "No concepts for this product in this window." : "No matched ads in this window. Ads are linked to video tasks by their Meta ad name (naming convention)."}
          </div>
        ) : (
          <div className="hm-scroll">
            <table className="hm-t">
              <thead><tr><th className="rl" /> {cKeys.map((c) => <th key={c} className={c === NOT_SET ? "ns" : ""}>{c}</th>)}<th className="tot">Total</th></tr></thead>
              <tbody>
                {rKeys.map((rw) => (
                  <tr key={rw}>
                    <td className={`rl ${rw === NOT_SET ? "ns" : ""}`}>{rw}</td>
                    {cKeys.map((cl) => {
                      const v = cells[rw + "|" + cl];
                      if (!v) return <td key={cl}><div className="hm-e" title="Never tested" /></td>;
                      const ro = roas(v), [bg, fg] = tone(ro / avg), on = sel && sel[0] === rw && sel[1] === cl;
                      return (
                        <td key={cl}>
                          <button
                            className={`hm-c ${v.s < tot.s * 0.02 ? "low" : ""} ${on ? "sel" : ""}`}
                            style={{ background: bg, color: fg }}
                            onClick={() => setSel(on ? null : [rw, cl])}
                            onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, html: `<b>${rw} × ${cl}</b><br>Spend ${eur(v.s)}<br>ROAS ${x2(ro)}${Number.isFinite(ro / avg) ? ` (${x2(ro / avg)}× avg)` : ""}<br>${v.n} concept${v.n > 1 ? "s" : ""}` })}
                            onMouseLeave={() => setTip(null)}
                          >
                            <b>{x2(ro)}</b><span>{eurK(v.s)}</span>
                          </button>
                        </td>
                      );
                    })}
                    <td className="tot"><b>{x2(roas(R[rw]))}</b>{eurK(R[rw].s)}</td>
                  </tr>
                ))}
                <tr className="tr"><td className="rl">Total</td>{cKeys.map((c) => <td key={c} className="tot"><b>{x2(roas(K[c]))}</b>{eurK(K[c].s)}</td>)}<td className="tot"><b>{x2(avg)}</b>{eurK(tot.s)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hm-two">
        <div className="hm-card hm-box">
          <h3>Insights <small>automatic</small></h3>
          {insights.length ? insights.map(([ic, bg, t, d]) => (
            <div key={t} className="hm-ins"><div className="ic" style={{ background: bg }}>{ic}</div><div><div className="t">{t}</div><div className="d">{d}</div></div></div>
          )) : <div className="hm-muted">Not enough data yet.</div>}
        </div>
        <div className="hm-card hm-box">
          <h3><span>{sel ? `${sel[0]} × ${sel[1]}` : "Top concepts"}</span> <small>{sel ? <button className="hm-clear" onClick={() => setSel(null)}>all concepts</button> : "by spend"}</small></h3>
          {board.map((c) => {
            const ro = c.spend > 0 ? c.revenue / c.spend : NaN, [bg, fg] = tone(ro / avg);
            return (
              <Link key={c.taskId} href={`/video-editor?task=${encodeURIComponent(c.taskId)}`} className="hm-row">
                <div className="hm-thumb">{c.thumbSrc ? <img src={c.thumbSrc} alt="" /> : "▶"}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="n">{c.name}</div>
                  <div className="m">{[c.icp !== NOT_SET ? c.icp : "", c.formatType !== NOT_SET ? c.formatType : "", c.editor, `${c.ads} ad${c.ads > 1 ? "s" : ""}`, c.live ? "" : "paused"].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="v">{eur(c.spend)}</div>
                <span className="hm-pill" style={{ background: bg, color: fg }}>{x2(ro)}</span>
              </Link>
            );
          })}
          {!board.length && <div className="hm-muted">No concepts.</div>}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="hm-card hm-box" style={{ marginTop: 16 }}>
          <h3>Concepts with empty fields <small>{missing.length} · fill them in on the task so they land in the right cell</small></h3>
          {missing.slice(0, 12).map((c) => (
            <Link key={c.taskId} href={`/video-editor?task=${encodeURIComponent(c.taskId)}`} className="hm-row">
              <div className="hm-thumb">{c.thumbSrc ? <img src={c.thumbSrc} alt="" /> : "▶"}</div>
              <div style={{ minWidth: 0 }}><div className="n">{c.name}</div><div className="m">Missing: {c.missing.map((d) => DIMS[d]).join(", ")}</div></div>
              <div className="v">{eur(c.spend)}</div>
              <span className="hm-pill" style={{ background: "var(--seg)", color: "var(--ink2)" }}>open ↗</span>
            </Link>
          ))}
        </div>
      )}

      </>}

      {tip && <div className="hm-tip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250), top: tip.y + 14 }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
    </div>
  );
}

// Productkiezer zoals in de taken: Shopify-zoekveld + snelle keuze uit bekende producten
function ProductPicker({ value, onChange, known }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products-search?q=${encodeURIComponent(q)}`).then((r) => r.json());
        if (res.success) setResults((res.products || []).slice(0, 8));
      } catch {} finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  if (value) {
    return (
      <div className="hm-pp-sel">
        {value.image ? <img src={value.image} alt="" /> : <span className="ph" />}
        <b>{value.title}</b>
        <button type="button" onClick={() => onChange(null)}>change</button>
      </div>
    );
  }
  return (
    <div className="hm-pp">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your Shopify products…" autoFocus />
      {!q.trim() && known.length > 0 && (
        <div className="hm-pp-known">{known.map((k) => <button key={k} type="button" onClick={() => onChange({ title: k, image: "" })}>{k}</button>)}</div>
      )}
      {searching && <div className="hm-muted" style={{ marginTop: 6 }}>Searching…</div>}
      {results.length > 0 && (
        <div className="hm-pp-res">
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange({ title: p.title, image: p.image || "" }); setQ(""); setResults([]); }}>
              {p.image ? <img src={p.image} alt="" /> : <span className="ph" />}<span>{p.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const lc = (x) => String(x || "").trim().toLowerCase();
const sameProduct = (a, b) => lc(a) === lc(b);
const sameKey = (a, b) => sameProduct(a.product, b.product) && lc(a.mechanism) === lc(b.mechanism) && lc(a.icp) === lc(b.icp);

// ---- Angle/ICP-kalender: rijen = producten, kolommen = weken ----
function CalendarView({ calendar, products, allProducts, knownAngles, calStatus, statusMap, scoreboard, scoreLoaded, edit, setEdit, busy, onSave, onDelete, backlogPost, onDrop }) {
  const [idea, setIdea] = useState(null); // { product, mechanism, icp, note }
  // Drag & drop: kaartje naar een andere week (zelfde product), backlog-idee in een week, of kaartje terug naar de backlog
  const [drag, setDrag] = useState(null); // { kind: "entry" | "backlog", id, product }
  const [over, setOver] = useState(null); // "product|week" of "backlog"
  const isTmp = (id) => String(id || "").startsWith("tmp-"); // nog niet opgeslagen → (nog) niet slepen
  const startDrag = (ev, item) => {
    ev.dataTransfer.effectAllowed = "move";
    try { ev.dataTransfer.setData("text/plain", item.id); } catch {}
    setDrag(item);
  };
  const endDrag = () => { setDrag(null); setOver(null); };
  const canDropCell = (p) => !!drag && sameProduct(drag.product, p);
  const dropOnCell = (p, w) => {
    const d = drag;
    endDrag();
    if (!d || !sameProduct(d.product, p)) return;
    if (d.kind === "entry") {
      const e = calendar.entries.find((x) => x.id === d.id);
      if (!e || e.week === w) return;
      onDrop({ action: "move", id: d.id, week: w }, (c) => ({ ...c, entries: c.entries.map((x) => (x.id === d.id ? { ...x, week: w } : x)) }));
    } else {
      const b = calendar.backlog.find((x) => x.id === d.id);
      if (!b) return;
      const entry = { product: b.product, week: w, mechanism: b.mechanism, icp: b.icp, note: b.note || "" };
      onDrop({ action: "add", entry }, (c) => ({ ...c, entries: [...c.entries, { ...entry, id: `tmp-${Date.now()}` }] }));
    }
  };
  const dropOnBacklog = () => {
    const d = drag;
    endDrag();
    if (!d || d.kind !== "entry") return;
    const e = calendar.entries.find((x) => x.id === d.id);
    if (!e) return;
    onDrop({ action: "unplan", id: d.id }, (c) => ({
      ...c,
      entries: c.entries.filter((x) => x.id !== d.id),
      backlog: c.backlog.some((b) => sameKey(b, e)) ? c.backlog : [...c.backlog, { id: `tmp-${Date.now()}`, product: e.product, mechanism: e.mechanism, icp: e.icp, note: e.note || "" }],
    }));
  };
  const thisWeek = calendar.week || weekStart();
  const [offset, setOffset] = useState(0);
  const [newProduct, setNewProduct] = useState(false);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(thisWeek, (i - 1 + offset) * 7));
  const rows = products.length ? products : [];
  const entriesAt = (p, w) => calendar.entries.filter((e) => e.week === w && String(e.product || "").trim().toLowerCase() === String(p).trim().toLowerCase());
  const label = (w) => { const d = new Date(`${w}T12:00:00Z`); return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`; };
  const canEdit = calendar.canEdit;
  const icpsFor = (p) => calendar.options?.icp?.[String(p || "").trim().toLowerCase() || "_none"] || [];
  const extraProducts = allProducts.filter((p) => !products.includes(p));

  // Wat is al getest? (alle angle × ICP met spend, per product) → tracker onder de kalender
  const planned = new Set(calendar.entries.map((e) => [e.product, e.mechanism, e.icp].map((x) => String(x || "").trim().toLowerCase()).join("|")));

  return (
    <>
      <div className="hm-card hm-cal">
        <div className="hm-calh">
          <div><h2>Angle × ICP per week</h2><p>Click a cell to plan the focus for that product and week. Drag a card to another week, drag a backlog idea into a week, or drag a card back to the backlog. Colour = status of that angle × ICP in the ads so far.</p></div>
          <div className="hm-seg"><button onClick={() => setOffset(offset - 3)}>‹</button><button onClick={() => setOffset(0)} className={offset === 0 ? "on" : ""}>This week</button><button onClick={() => setOffset(offset + 3)}>›</button></div>
        </div>
        <div className="hm-scroll">
          <table className="hm-ct">
            <thead><tr><th className="rl" />{weeks.map((w) => <th key={w} className={w === thisWeek ? "now" : ""}>W{isoWeek(w)}<small>{label(w)}</small></th>)}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p}>
                  <td className="rl">{p}</td>
                  {weeks.map((w) => {
                    const es = entriesAt(p, w);
                    const key = `${p}|${w}`;
                    return (
                      <td key={w} className={w === thisWeek ? "now" : ""}
                        onDragOver={(ev) => { if (!canDropCell(p)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (over !== key) setOver(key); }}
                        onDragLeave={(ev) => { if (over === key && !ev.currentTarget.contains(ev.relatedTarget)) setOver(null); }}
                        onDrop={(ev) => { ev.preventDefault(); dropOnCell(p, w); }}>
                        <div className={`cell${drag ? (canDropCell(p) ? " droppable" : " nodrop") : ""}${over === key ? " over" : ""}`}>
                          {es.map((e) => { const st = calStatus(e); return (
                            <div key={e.id} role="button" tabIndex={0} className={`chip ${st ? st.status : "planned"}${drag?.id === e.id ? " dragging" : ""}`} onClick={() => canEdit && !isTmp(e.id) && setEdit({ ...e })}
                              onKeyDown={(ev) => { if ((ev.key === "Enter" || ev.key === " ") && canEdit && !isTmp(e.id)) { ev.preventDefault(); setEdit({ ...e }); } }}
                              draggable={canEdit && !isTmp(e.id)} onDragStart={(ev) => startDrag(ev, { kind: "entry", id: e.id, product: e.product })} onDragEnd={endDrag}
                              title={st ? `${eur(st.spend)} · ROAS ${x2(st.roas)} · ${st.concepts} concept${st.concepts > 1 ? "s" : ""}` : "No matched ads yet"}>
                              <b>{e.mechanism}</b><span>{e.icp}</span>{st && <em>{x2(st.roas)}</em>}
                            </div>
                          ); })}
                          {canEdit && <button type="button" className="add" onClick={() => setEdit({ product: p, week: w, mechanism: "", icp: "", note: "" })}>+</button>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length && <tr><td className="rl" colSpan={weeks.length + 1} style={{ color: "var(--ink3)", padding: "20px 0" }}>No products yet. Add one below.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="hm-caladd">
            <span className="hm-muted">Add a product row:</span>
            {newProduct ? (
              <div style={{ flex: 1, minWidth: 260 }}><ProductPicker value={null} onChange={(p) => { setNewProduct(false); if (p) setEdit({ product: p.title, week: thisWeek, mechanism: "", icp: "", note: "" }); }} known={extraProducts} /></div>
            ) : (
              <button type="button" className="hm-chipbtn" onClick={() => setNewProduct(true)}>+ Product</button>
            )}
          </div>
        )}
        <datalist id="hm-angles">{knownAngles.map((a) => <option key={a} value={a} />)}</datalist>
        <div className="hm-callegend"><span><i className="proven" />proven</span><span><i className="promising" />promising</span><span><i className="testing" />testing</span><span><i className="failed" />failed</span><span><i className="planned" />planned, no ads yet</span></div>
      </div>

      {edit && (
        <div className="hm-modal" onClick={() => setEdit(null)}>
          <div className="hm-card hm-form" onClick={(e) => e.stopPropagation()}>
            <h3>{edit.id ? "Edit focus" : "Plan focus"} <small>{edit.product} · week {isoWeek(edit.week)} ({label(edit.week)})</small></h3>
            <label>Week <input type="date" value={edit.week} onChange={(e) => setEdit({ ...edit, week: weekStart(e.target.value) })} /></label>
            <label>Angle (mechanism)
              <input list="hm-angles" value={edit.mechanism} onChange={(e) => setEdit({ ...edit, mechanism: e.target.value })} placeholder="e.g. Calms the auditory nerve" autoFocus />
            </label>
            <label>ICP
              <input list="hm-icps" value={edit.icp} onChange={(e) => setEdit({ ...edit, icp: e.target.value })} placeholder="e.g. Retired man 65+" />
              <datalist id="hm-icps">{icpsFor(edit.product).map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <label>Note <input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="optional" /></label>
            <div className="act">
              {edit.id && <button type="button" className="del" onClick={() => { onDelete(edit.id); setEdit(null); }}>Remove</button>}
              <span style={{ flex: 1 }} />
              <button type="button" className="b2" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="b1" disabled={busy || !edit.mechanism.trim() || !edit.icp.trim()} onClick={() => onSave(edit)}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Backlog: ideeën die nog ingepland moeten worden */}
      <div className={`hm-card hm-box hm-blbox${drag?.kind === "entry" ? " droppable" : ""}${over === "backlog" ? " over" : ""}`} style={{ marginTop: 16 }}
        onDragOver={(ev) => { if (drag?.kind !== "entry") return; ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (over !== "backlog") setOver("backlog"); }}
        onDragLeave={(ev) => { if (over === "backlog" && !ev.currentTarget.contains(ev.relatedTarget)) setOver(null); }}
        onDrop={(ev) => { ev.preventDefault(); dropOnBacklog(); }}>
        <h3>Backlog · angles × ICPs to test <small>add ideas now, plan them into a week later · {calendar.backlog.filter((b) => !calendar.entries.some((e) => sameKey(e, b))).length} still open</small></h3>
        {!calendar.backlog.length && <div className="hm-muted" style={{ marginBottom: 8 }}>No ideas yet.</div>}
        {drag?.kind === "entry" && <div className="hm-bldrop">Drop here to take it off the calendar and back into the backlog</div>}
        {products.filter((p) => calendar.backlog.some((b) => sameProduct(b.product, p))).map((p) => (
          <div key={p} className="hm-bl">
            <div className="p">{p}</div>
            <div className="items">
              {calendar.backlog.filter((b) => sameProduct(b.product, p)).map((b) => {
                const planned = calendar.entries.filter((e) => sameKey(e, b)).sort((x, y) => x.week.localeCompare(y.week));
                const st = calStatus(b);
                const state = st ? st.status : planned.length ? "planned" : "open";
                return (
                  <div key={b.id} className={`it ${state}${canEdit && !isTmp(b.id) ? " drag" : ""}${drag?.id === b.id ? " dragging" : ""}`}
                    draggable={canEdit && !isTmp(b.id)} onDragStart={(ev) => startDrag(ev, { kind: "backlog", id: b.id, product: b.product })} onDragEnd={endDrag}
                    title={canEdit ? "Drag into a week of the calendar" : undefined}>
                    <span className="nm"><b>{b.mechanism}</b> × {b.icp}{b.note ? <small> · {b.note}</small> : null}</span>
                    <span className="meta">
                      {st ? <em className={st.status}>{STATUS_LABEL[st.status]} · {x2(st.roas)}</em> : planned.length ? <em>planned W{planned.map((e) => isoWeek(e.week)).join(", W")}</em> : <em className="open">not planned</em>}
                    </span>
                    {canEdit && (
                      <span className="act">
                        {!planned.length && <button type="button" className="hm-chipbtn" onClick={() => setEdit({ product: b.product, week: thisWeek, mechanism: b.mechanism, icp: b.icp, note: b.note || "" })}>Plan</button>}
                        <button type="button" className="x" title="Remove from backlog" onClick={() => { if (confirm("Remove this idea from the backlog?")) backlogPost({ action: "backlogDelete", id: b.id }); }}>×</button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {canEdit && (
          <div className="hm-caladd" style={{ marginTop: 10 }}>
            <button type="button" className="hm-chipbtn" onClick={() => setIdea({ product: "", mechanism: "", icp: "", note: "" })}>+ Add idea</button>
          </div>
        )}
      </div>

      {idea && (
        <div className="hm-modal" onClick={() => setIdea(null)}>
          <div className="hm-card hm-form" onClick={(e) => e.stopPropagation()}>
            <h3>Add to backlog <small>an angle × ICP to test later</small></h3>
            {/* géén <label>: die zou een klik op een resultaat doorsturen naar de "change"-knop */}
            <div className="hm-form-field">Product
              <ProductPicker value={idea.product ? { title: idea.product, image: idea.productImage || "" } : null} onChange={(p) => setIdea({ ...idea, product: p?.title || "", productImage: p?.image || "" })} known={[...new Set([...products, ...allProducts])]} />
            </div>
            <label>Angle (mechanism)
              <input list="hm-angles" value={idea.mechanism} onChange={(e) => setIdea({ ...idea, mechanism: e.target.value })} placeholder="e.g. Calms the auditory nerve" autoFocus />
            </label>
            <label>ICP
              <input list="hm-icps-idea" value={idea.icp} onChange={(e) => setIdea({ ...idea, icp: e.target.value })} placeholder="e.g. Retired man 65+" />
              <datalist id="hm-icps-idea">{icpsFor(idea.product).map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <label>Note <input value={idea.note || ""} onChange={(e) => setIdea({ ...idea, note: e.target.value })} placeholder="optional" /></label>
            <div className="act">
              <span style={{ flex: 1 }} />
              <button type="button" className="b2" onClick={() => setIdea(null)}>Cancel</button>
              <button type="button" className="b1" disabled={busy || !idea.product.trim() || !idea.mechanism.trim() || !idea.icp.trim()} onClick={async () => { const ok = await backlogPost({ action: "backlogAdd", entry: idea }); if (ok) setIdea(null); }}>{busy ? "Saving…" : "Add"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="hm-card hm-box" style={{ marginTop: 16 }}>
        <h3>Tested angles × ICPs <small>last 90 days · working = ROAS ≥ {x2(LADDER.minRoas)} · failed = ≥ {eur(LADDER.minSpend)} spend under the bar · ◆ = on the calendar</small></h3>
        {!scoreLoaded && <div className="hm-muted">Loading…</div>}
        {scoreLoaded && !scoreboard.length && <div className="hm-muted">No angle × ICP with ads yet. Fill in Angle and ICP on the tasks.</div>}
        {scoreboard.map(([product, p]) => (
          <div key={product} className="hm-score">
            <div className="p">{product}</div>
            <div className="col">
              <div className="h ok">✓ Working <span>{p.working.length}</span></div>
              {p.working.map((i) => <div key={i.mechanism + i.icp} className="it"><span><b>{i.mechanism}</b> × {i.icp}{planned.has([i.product, i.mechanism, i.icp].map((x) => String(x || "").trim().toLowerCase()).join("|")) ? " ◆" : ""}</span><em className="ok">{x2(i.roas)}{i.status === "promising" ? " · under €2k" : ""}</em></div>)}
              {!p.working.length && <div className="none">none yet</div>}
            </div>
            <div className="col">
              <div className="h bad">✕ Failed <span>{p.failed.length}</span></div>
              {p.failed.map((i) => <div key={i.mechanism + i.icp} className="it"><span><b>{i.mechanism}</b> × {i.icp}</span><em className="bad">{x2(i.roas)}</em></div>)}
              {!p.failed.length && <div className="none">none</div>}
            </div>
            <div className="col">
              <div className="h">… Still testing <span>{p.testing.length}</span></div>
              {p.testing.map((i) => <div key={i.mechanism + i.icp} className="it"><span><b>{i.mechanism}</b> × {i.icp}</span><em>{eur(i.s)} · {x2(i.roas)}</em></div>)}
              {!p.testing.length && <div className="none">none</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const CSS = `
.hm{--bg:#fafafa;--surface:#fff;--card:#d6d6da;--line:#efefef;--line2:#e6e6e6;--ink:#111;--ink2:#555;--ink3:#999;--seg:#f2f2f3;--acc:#7f9ccb;
  --g2:#178a5f;--g1:#8fd3b4;--n:#ecebe8;--r1:#f4b0a0;--r2:#d4483f;
  background:var(--bg);color:var(--ink);min-height:100vh;padding:26px 32px 60px;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45}
.hm.hm-dark{--bg:#0f1012;--surface:#17181b;--card:#3b3c42;--line:#232428;--line2:#2d2e33;--ink:#ececee;--ink2:#a6a7ad;--ink3:#74757b;--seg:#202125;
  --g2:#1f9e6d;--g1:#2f6b55;--n:#2a2b30;--r1:#6e3a33;--r2:#c4473f;color-scheme:dark}
.hm button,.hm select{font:inherit}
.hm-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.hm h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.3px}
.hm-meta,.hm-muted{color:var(--ink3);font-size:12px}
.hm-meta{margin-top:3px}
.hm-seg{display:inline-flex;background:var(--seg);border-radius:9px;padding:3px;gap:2px;flex-wrap:wrap}
.hm-seg button{border:0;background:transparent;color:var(--ink2);border-radius:7px;padding:5px 12px;cursor:pointer;font-size:12.5px}
.hm-seg button.on{background:var(--surface);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.hm-icon{width:32px;height:32px;border-radius:9px;border:1px solid var(--line2);background:var(--surface);color:var(--ink2);cursor:pointer}
.hm-tabs{display:flex;gap:2px;margin:18px 0 0;border-bottom:1px solid var(--line2)}
.hm-tabs button{border:0;background:transparent;padding:9px 12px;color:var(--ink3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:13px}
.hm-tabs button.on{color:var(--ink);font-weight:600;border-color:var(--ink)}
.hm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0 16px}
.hm-rule{font-size:12px;color:var(--ink3)}.hm-rule b{color:var(--ink2);font-weight:600}
.hm-sum{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:16px}
.hm-tile{padding:14px 18px;border-left:1px solid var(--line)}
.hm-tile:first-child{border-left:0}
.hm-tile .st{font-size:12px;font-weight:600;color:var(--ink2);display:flex;align-items:center;gap:8px}
.hm-tile .st .n{width:20px;height:20px;border-radius:50%;background:var(--ink);color:var(--surface);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.hm-tile .big{font-size:28px;font-weight:800;letter-spacing:-.6px;margin:8px 0 8px;line-height:1}
.hm-tile .big small{font-size:12px;font-weight:500;color:var(--ink3);margin-left:7px;letter-spacing:0}
.hm-tile .bar{height:6px;border-radius:3px;background:var(--seg);overflow:hidden}
.hm-tile .bar i{display:block;height:100%;background:var(--g2);border-radius:3px}
.hm-tile .sub{font-size:11.5px;color:var(--ink3);margin-top:7px}
.hm-tile .gaps{display:flex;flex-wrap:wrap;gap:5px}
.hm-tile .gaps span{font-size:11.5px;background:var(--seg);border-radius:999px;padding:3px 9px;color:var(--ink2)}
.proven.d,i.proven{background:var(--g2)!important}
.promising.d,i.promising{background:#3b82f6!important}
.testing.d,i.testing{background:#b8bcc6!important}
.failed.d,i.failed{background:var(--r2)!important}
i.unset{background:var(--line2)!important}
.hm-tile .gaps{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.hm-tile .gaps span{font-size:11.5px;background:var(--seg);border-radius:999px;padding:3px 9px;color:var(--ink2)}
.hm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.hm-ac{padding:16px 18px 12px}
.hm-ac.proven::before{border-top-color:var(--g2)}.hm-ac.promising::before{border-top-color:#3b82f6}.hm-ac.failed::before{border-top-color:var(--r2)}.hm-ac.testing::before{border-top-color:#b8bcc6}
.hm-ac.ns{opacity:.75}
.hm-ac .top{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:start}
.hm-ac .top .hm-st{grid-column:2;grid-row:1}
.hm-ac .ttl{grid-column:1;font-size:14.5px;line-height:1.3}
.hm-ac .ttl .x{color:var(--ink3);font-weight:400}
.hm-ac.ns .ttl{color:var(--ink3);font-style:italic}
.hm-ac .top .sub{grid-column:1;color:var(--ink3);font-size:11.5px}
.hm-ac .meters{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0 10px}
.hm-ac .m .l{display:flex;align-items:baseline;gap:6px;font-size:11.5px;color:var(--ink3);margin-bottom:5px}
.hm-ac .m .l b{font-size:14px;color:var(--ink);font-weight:700}
.hm-ac .m .l small{font-size:10.5px}
.hm-ac .track{position:relative;height:8px;border-radius:4px;background:var(--seg);overflow:visible}
.hm-ac .track i{display:block;height:100%;border-radius:4px;max-width:100%}
.hm-ac .track em{position:absolute;top:-3px;width:2px;height:14px;background:var(--ink);border-radius:1px;opacity:.55}
.hm-ac .dots{display:flex;gap:5px}
.hm-ac .d{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#fff;flex-shrink:0}
.hm-ac .d.testing{color:#fff}
.hm-ac .d.empty{background:transparent!important;border:1.5px dashed var(--line2)}
.hm-ac .more{border:0;background:none;color:var(--ink3);font-size:11.5px;cursor:pointer;padding:6px 0 0;display:block}
.hm-ac .fl{margin-top:6px;border-top:1px solid var(--line)}
.hm-ac .fl .d{width:9px;height:9px;display:block;margin:0 auto}
.hm-lr{display:grid;grid-template-columns:22px minmax(0,1fr) 90px 64px 96px;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.hm-lr.l2{padding-left:0}
.hm-lr .tg{color:var(--ink3);font-size:10px;text-align:center}
.hm-lr .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hm-lr.l2 .nm{font-weight:500}
.hm-lr .x{color:var(--ink3);font-weight:400}
.hm-lr .sub{color:var(--ink3);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:400}
.hm-lr.ns .nm{color:var(--ink3);font-style:italic}
.hm-lr .v{text-align:right;color:var(--ink2);font-size:12.5px}
.hm-lr .ro{text-align:right;font-weight:700}
.hm-lnk{color:inherit;text-decoration:none}.hm-lnk:hover{text-decoration:underline}
.hm-st{justify-self:end;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;white-space:nowrap}
.hm-st.proven{background:#dcf5e8;color:#136b49}.hm-st.promising{background:#e8f0fc;color:#2456a8}.hm-st.testing{background:var(--seg);color:var(--ink2)}.hm-st.failed{background:#fde3df;color:#a8322a}
.hm-dark .hm-st.proven{background:#173d2c;color:#7fd6a8}.hm-dark .hm-st.promising{background:#1d2b45;color:#8fb3f0}.hm-dark .hm-st.failed{background:#44221f;color:#f0968d}
.hm-next{padding:4px 0 0;font-size:12px;color:var(--ink2);display:flex;gap:6px;align-items:flex-start}
.hm-next i{font-style:normal}.hm-next.go{color:#136b49}.hm-next.stop{color:#a8322a}
.hm-dark .hm-next.go{color:#7fd6a8}.hm-dark .hm-next.stop{color:#f0968d}
.hm-pick{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--surface);border-radius:9px;padding:0 4px 0 10px;height:32px;color:var(--ink3);font-size:12px}
.hm-pick select{border:0;background:transparent;color:var(--ink);font-weight:600;outline:none;cursor:pointer;height:30px}
.hm-sp{flex:1}
.hm-card{background:var(--surface);border:1px solid var(--card);border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);position:relative}
.hm-card::before{content:"";position:absolute;inset:-1px;border-top:3px solid var(--acc);border-radius:14px;pointer-events:none}
.hm-kpis{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:16px}
.hm-kpi{padding:14px 18px;border-left:1px solid var(--line)}.hm-kpi:first-child{border-left:0}
.hm-kpi .l{font-size:11.5px;color:var(--ink3)}
.hm-kpi .v{font-size:22px;font-weight:700;letter-spacing:-.4px;margin-top:2px}
.hm-kpi .s{font-size:11.5px;color:var(--ink3)}
.hm-hmc{padding:18px 20px 16px}
.hm-hmh{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.hm-hmh h2{margin:0;font-size:15px}
.hm-hmh p{margin:2px 0 0;color:var(--ink3);font-size:12px}
.hm-legend{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink3)}
.hm-legend .scale{display:flex;gap:2px}.hm-legend .scale i{width:26px;height:10px;border-radius:3px;display:block}
.hm-legend .fade{display:inline-flex;align-items:center;gap:5px;margin-left:10px}
.hm-legend .fade i{width:14px;height:10px;border-radius:3px;background:var(--g2);opacity:.35;display:block}
.hm-empty{padding:40px 20px;text-align:center;color:var(--ink3)}
.hm-note{background:var(--seg);border-radius:9px;padding:9px 12px;font-size:12px;color:var(--ink2);margin-bottom:12px}
.hm-scroll{overflow-x:auto}
.hm-t{border-collapse:separate;border-spacing:4px;width:auto;table-layout:fixed}
.hm-t th{font-weight:500;color:var(--ink2);font-size:11.5px;padding:4px 4px 8px;text-align:center;vertical-align:bottom;line-height:1.25;word-wrap:break-word;width:150px;min-width:150px}
.hm-t th.rl,.hm-t td.rl{text-align:left;width:180px;color:var(--ink);font-size:12.5px;padding-left:2px;word-wrap:break-word}
.hm-t th.ns,.hm-t td.ns{color:var(--ink3);font-style:italic}
.hm-t th.tot,.hm-t td.tot{width:86px;min-width:86px}
.hm-t td{padding:0}
.hm-c{height:52px;width:100%;border:0;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:transform .1s,box-shadow .1s}
.hm-c b{font-size:14px;font-weight:700;letter-spacing:-.2px}
.hm-c span{font-size:11px;opacity:.8}
.hm-c:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
.hm-c.low{opacity:.4}
.hm-c.sel{outline:2px solid var(--ink);outline-offset:2px}
.hm-e{height:52px;border-radius:8px;border:1px dashed var(--line2)}
.hm-t td.tot{text-align:center;font-size:12px;color:var(--ink2)}
.hm-t td.tot b{display:block;color:var(--ink);font-weight:600}
.hm-t tr.tr td{padding-top:6px;border-top:1px solid var(--line)}
.hm-t tr.tr td.rl{color:var(--ink3)}
.hm-tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface);font-size:11.5px;padding:7px 9px;border-radius:8px;line-height:1.45;z-index:20;max-width:240px}
.hm-two{display:grid;grid-template-columns:1fr 1.25fr;gap:16px;margin-top:16px}
.hm-box{padding:16px 18px}
.hm-box h3{margin:0 0 10px;font-size:14px;display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.hm-box h3 small{font-weight:400;color:var(--ink3);font-size:12px;text-align:right}
.hm-ins{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.hm-ins:first-of-type{border-top:0}
.hm-ins .ic{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px}
.hm-ins .t{font-weight:600}.hm-ins .d{color:var(--ink3);font-size:12px}
.hm-row{display:grid;grid-template-columns:40px minmax(0,1fr) 86px 64px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--line);color:inherit;text-decoration:none}
.hm-row:first-of-type{border-top:0}
.hm-row:hover .n{text-decoration:underline}
.hm-thumb{width:40px;height:50px;border-radius:8px;background:linear-gradient(135deg,#d9dde6,#b9c1d2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;overflow:hidden}
.hm-thumb img{width:100%;height:100%;object-fit:cover}
.hm-dark .hm-thumb{background:linear-gradient(135deg,#2c3038,#3d4350)}
.hm-row .n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hm-row .m{color:var(--ink3);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hm-row .v{text-align:right;color:var(--ink2)}
.hm-pill{justify-self:end;font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 9px;white-space:nowrap}
.hm-clear{border:0;background:none;color:var(--ink2);text-decoration:underline;cursor:pointer;font-size:12px;padding:0}
.hm-cal{padding:18px 20px 14px}
.hm-calh{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.hm-calh h2{margin:0;font-size:15px}.hm-calh p{margin:2px 0 0;color:var(--ink3);font-size:12px}
.hm-ct{border-collapse:separate;border-spacing:4px;width:100%;table-layout:fixed;min-width:760px}
.hm-ct th{font-weight:600;color:var(--ink2);font-size:12px;padding:4px 4px 6px;text-align:center;vertical-align:bottom}
.hm-ct th small{display:block;font-weight:400;color:var(--ink3);font-size:11px}
.hm-ct th.now{color:var(--ink)}
.hm-ct th.rl,.hm-ct td.rl{text-align:left;width:150px;font-weight:600;color:var(--ink);font-size:12.5px;padding-left:2px;vertical-align:middle}
.hm-ct td{padding:0;vertical-align:top}
.hm-ct td.now .cell{background:var(--seg)}
.hm-ct .cell{min-height:64px;border:1px dashed var(--line2);border-radius:10px;padding:5px;display:flex;flex-direction:column;gap:4px}
.hm-ct td.now .cell{border-style:solid}
.hm-ct .chip{border:0;border-left:3px solid var(--ink3);background:var(--surface);border-radius:7px;padding:5px 7px;text-align:left;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:0 6px;box-shadow:0 1px 2px rgba(0,0,0,.06);color:var(--ink)}
.hm-ct .chip b{font-size:11.5px;font-weight:600;line-height:1.25;grid-column:1}
.hm-ct .chip span{font-size:10.5px;color:var(--ink3);line-height:1.25;grid-column:1}
.hm-ct .chip em{font-style:normal;font-size:11px;font-weight:700;grid-column:2;grid-row:1/3;align-self:center}
.hm-ct .chip.proven{border-left-color:var(--g2)}.hm-ct .chip.proven em{color:var(--g2)}
.hm-ct .chip.promising{border-left-color:#3b82f6}.hm-ct .chip.promising em{color:#3b82f6}
.hm-ct .chip.testing{border-left-color:#b8bcc6}
.hm-ct .chip.failed{border-left-color:var(--r2)}.hm-ct .chip.failed em{color:var(--r2)}
.hm-ct .chip.planned{border-left-color:var(--ink3);border-left-style:dashed}
.hm-ct .add{border:0;background:none;color:var(--ink3);font-size:14px;cursor:pointer;padding:2px;line-height:1;opacity:.5;margin-top:auto}
.hm-ct .cell:hover .add{opacity:1}
.hm-ct .chip[draggable="true"]{cursor:grab}.hm-ct .chip[draggable="true"]:active{cursor:grabbing}
.hm-ct .chip.dragging,.hm-bl .it.dragging{opacity:.4}
.hm-ct .cell.droppable{border-color:#3b82f6;background:rgba(59,130,246,.04)}
.hm-ct .cell.nodrop{opacity:.45}
.hm-ct .cell.over{border-style:solid;border-color:#3b82f6;background:rgba(59,130,246,.12)}
.hm-blbox.droppable{outline:2px dashed #3b82f6;outline-offset:-2px}
.hm-blbox.over{background:rgba(59,130,246,.08)}
.hm-bldrop{margin:4px 0 10px;padding:10px;border:1px dashed #3b82f6;border-radius:10px;color:#3b82f6;font-size:12.5px;text-align:center}
.hm-bl .it.drag{cursor:grab}.hm-bl .it.drag:active{cursor:grabbing}
.hm-caladd{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;font-size:12px}
.hm-caladd input{border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:8px;height:30px;padding:0 10px;font:inherit;font-size:12.5px;outline:none;min-width:200px}
.hm-chipbtn{border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 11px;font:inherit;font-size:12px;cursor:pointer}
.hm-callegend{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:12px;font-size:11.5px;color:var(--ink3)}
.hm-callegend i{display:inline-block;width:3px;height:11px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--ink3)}
.hm-callegend i.proven{background:var(--g2)}.hm-callegend i.promising{background:#3b82f6}.hm-callegend i.testing{background:#b8bcc6}.hm-callegend i.failed{background:var(--r2)}.hm-callegend i.planned{background:none;border-left:3px dashed var(--ink3);width:0}
.hm-modal{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px}
.hm-form{width:min(440px,100%);padding:18px 20px}
.hm-form h3{margin:0 0 12px;font-size:15px}.hm-form h3 small{display:block;font-weight:400;color:var(--ink3);font-size:12px;margin-top:2px}
.hm-form label,.hm-form .hm-form-field{display:block;font-size:11.5px;color:var(--ink3);margin:10px 0 0}
.hm-form input{display:block;width:100%;margin-top:4px;border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:9px;height:34px;padding:0 10px;font:inherit;font-size:13px;outline:none;box-sizing:border-box}
.hm-form .act{display:flex;gap:8px;align-items:center;margin-top:16px}
.hm-form .b1{border:0;background:var(--ink);color:var(--surface);border-radius:9px;height:32px;padding:0 16px;font:inherit;font-weight:600;cursor:pointer}
.hm-form .b1:disabled{opacity:.4;cursor:default}
.hm-form .b2{border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:9px;height:32px;padding:0 14px;font:inherit;cursor:pointer}
.hm-form .del{border:0;background:none;color:var(--r2);font:inherit;font-size:12px;cursor:pointer;padding:0}
.hm-pp input{display:block;width:100%;margin-top:4px;border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:9px;height:34px;padding:0 10px;font:inherit;font-size:13px;outline:none;box-sizing:border-box}
.hm-pp-known{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.hm-pp-known button{border:1px solid var(--line2);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 11px;font:inherit;font-size:12px;cursor:pointer}
.hm-pp-res{display:grid;gap:4px;margin-top:6px}
.hm-pp-res button{display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--surface);border:1px solid var(--line2);border-radius:9px;cursor:pointer;text-align:left;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink)}
.hm-pp-res img,.hm-pp-sel img{width:26px;height:26px;border-radius:6px;object-fit:cover}
.hm-pp-res .ph,.hm-pp-sel .ph{width:26px;height:26px;border-radius:6px;background:var(--seg);display:inline-block}
.hm-pp-sel{display:flex;align-items:center;gap:10px;margin-top:4px;background:var(--seg);border-radius:9px;padding:6px 10px;font-size:13px;color:var(--ink)}
.hm-pp-sel b{flex:1}
.hm-pp-sel button{border:0;background:none;color:var(--ink3);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline}
.hm-bl{display:grid;grid-template-columns:150px 1fr;gap:14px;padding:10px 0;border-top:1px solid var(--line)}
.hm-bl:first-of-type{border-top:0}
.hm-bl .p{font-weight:700;font-size:13.5px}
.hm-bl .it{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px}
.hm-bl .it:first-child{border-top:0}
.hm-bl .it .nm b{font-weight:600}.hm-bl .it .nm small{color:var(--ink3)}
.hm-bl .it.open .nm{color:var(--ink)}
.hm-bl .it em{font-style:normal;font-size:11.5px;color:var(--ink3);white-space:nowrap}
.hm-bl .it em.open{color:#b7791f;font-weight:600}.hm-bl .it em.proven,.hm-bl .it em.promising{color:var(--g2);font-weight:600}.hm-bl .it em.failed{color:var(--r2);font-weight:600}
.hm-bl .act{display:flex;gap:6px;align-items:center}
.hm-bl .x{border:0;background:none;color:var(--ink3);font-size:15px;cursor:pointer;padding:0 4px;line-height:1}
.hm-score{display:grid;grid-template-columns:150px repeat(3,1fr);gap:14px;padding:12px 0;border-top:1px solid var(--line)}
.hm-score:first-of-type{border-top:0}
.hm-score .p{font-weight:700;font-size:13.5px}
.hm-score .h{font-size:11.5px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:var(--ink3);margin-bottom:6px}
.hm-score .h span{font-weight:500;margin-left:4px}
.hm-score .h.ok{color:var(--g2)}.hm-score .h.bad{color:var(--r2)}
.hm-score .it{font-size:12.5px;padding:5px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:baseline}
.hm-score .it b{font-weight:600}
.hm-score .it em{font-style:normal;font-size:11.5px;color:var(--ink3);white-space:nowrap}
.hm-score .it em.ok{color:var(--g2);font-weight:700}.hm-score .it em.bad{color:var(--r2);font-weight:700}
.hm-score .none{font-size:12px;color:var(--ink3);font-style:italic}
@media (max-width:900px){.hm-score,.hm-bl{grid-template-columns:1fr;gap:8px}.hm-sum,.hm-grid{grid-template-columns:1fr}.hm-tile{border-left:0;border-top:1px solid var(--line)}.hm-tile:first-child{border-top:0}.hm-ac .meters{grid-template-columns:1fr 1fr;gap:10px}.hm-lr{grid-template-columns:18px minmax(0,1fr) auto auto auto;gap:6px 8px}.hm-lr .nm,.hm-lr .sub{white-space:normal}.hm-lr .v,.hm-lr .ro,.hm-lr .hm-st{grid-row:2;align-self:center}.hm-lr .v{grid-column:2;justify-self:start}.hm-lr .ro{grid-column:3}.hm-lr .hm-st{grid-column:4/6}.hm-lr>div:nth-child(2){grid-column:2/6}.hm-next{padding-left:26px}.hm{padding:18px 14px 40px}.hm-kpis{grid-template-columns:repeat(2,1fr)}.hm-kpi:nth-child(3){border-left:0}.hm-kpi:nth-child(n+3){border-top:1px solid var(--line)}.hm-two{grid-template-columns:1fr}.hm-t th.rl,.hm-t td.rl{width:130px}.hm-row{grid-template-columns:40px minmax(0,1fr) 70px 56px;gap:8px}}
`;
