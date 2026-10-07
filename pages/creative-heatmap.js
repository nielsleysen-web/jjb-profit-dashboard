// pages/creative-heatmap.js — Creative Heatmap
// Per product: spend en ROAS per combinatie van twee creative-dimensies (concept, angle, ICP,
// awareness stage, script structure, format type, net new/iteration). De dimensies komen uit de
// velden van de video-taak; de cijfers uit /api/creatives-data (Meta spend + Shopify-orders per ad,
// gekoppeld aan de taak via de naming convention). Geen AI-classificatie nodig: de strateeg vult
// de velden in bij het briefen.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

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
  const [sel, setSel] = useState(null);
  const [tip, setTip] = useState(null);

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
  useEffect(() => { setSel(null); }, [product, rowDim, colDim, win, adsF]);

  // Alleen video-taken (daar leven de velden) met een gekoppelde ad
  const videoRows = useMemo(() => (data?.rows || []).filter((r) => r.kind === "video"), [data]);
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

      <div className="hm-bar">
        <div className="hm-seg">{WINDOWS.map(([k, l]) => <button key={k} className={win === k ? "on" : ""} onClick={() => setWin(k)}>{l}</button>)}</div>
        <label className="hm-pick">Rows <select value={rowDim} onChange={(e) => setRowDim(e.target.value)}>{Object.entries(DIMS).filter(([k]) => k !== colDim).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="hm-pick">Columns <select value={colDim} onChange={(e) => setColDim(e.target.value)}>{Object.entries(DIMS).filter(([k]) => k !== rowDim).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div className="hm-sp" />
        <label className="hm-pick">Ads <select value={adsF} onChange={(e) => setAdsF(e.target.value)}><option value="all">All</option><option value="live">Delivering</option><option value="off">Paused</option></select></label>
      </div>

      {error && <div className="hm-card hm-box" style={{ color: "var(--r2)" }}>Error: {error}</div>}

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

      {tip && <div className="hm-tip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250), top: tip.y + 14 }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
    </div>
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
.hm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0 16px}
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
@media (max-width:900px){.hm{padding:18px 14px 40px}.hm-kpis{grid-template-columns:repeat(2,1fr)}.hm-kpi:nth-child(3){border-left:0}.hm-kpi:nth-child(n+3){border-top:1px solid var(--line)}.hm-two{grid-template-columns:1fr}.hm-t th.rl,.hm-t td.rl{width:130px}.hm-row{grid-template-columns:40px minmax(0,1fr) 70px 56px;gap:8px}}
`;
