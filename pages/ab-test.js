// pages/ab-test.js — A/B Tests
// Eén duidelijke vergelijking per split test: Variant A vs B naast elkaar met de cijfers
// die ertoe doen (bezoekers, orders, CVR, omzet per bezoeker), het verschil in %, een
// betrouwbaarheidsscore en een dagverloop van de conversie. Bron: /api/ab-test.

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};
const COL = { A: "#94a3b8", B: "#4f6df5" };
const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const fmtLift = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);
const iso = (d) => d.toISOString().slice(0, 10);
const PRESETS = [["7d", "Last 7 days"], ["14d", "Last 14 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"]];
const LS = "jjb_ab_labels";

function loadLabels() { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } }

/* Dagverloop: CVR per variant als 2 lijnen */
function CvrChart({ variants }) {
  const W = 680, H = 170, P = { l: 34, r: 10, t: 12, b: 22 };
  const n = variants[0].series.length;
  const cvr = variants.map((v) => v.series.map((s) => (s.pvu > 0 ? s.o / s.pvu : 0)));
  const maxV = Math.max(0.01, ...cvr.flat());
  const x = (i) => (n === 1 ? W / 2 : P.l + (i * (W - P.l - P.r)) / (n - 1));
  const y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, maxV / 2, maxV];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#eef0f4" />
          <text x={P.l - 6} y={y(t) + 4} fontSize="10" fill="#8a92a3" textAnchor="end">{(t * 100).toFixed(1)}%</text>
        </g>
      ))}
      {variants.map((v, k) => (
        <path key={v.id} d={path(cvr[k])} fill="none" stroke={COL[v.letter] || "#0f172a"} strokeWidth={k === 0 ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {variants[0].series.map((s, i) => (i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
        <text key={s.d} x={x(i)} y={H - 6} fontSize="10" fill="#8a92a3" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{s.d.slice(5)}</text>
      ))}
    </svg>
  );
}

function Stat({ label, a, b, fmt, lift, good = "up" }) {
  const better = lift == null ? null : good === "up" ? lift > 0 : lift < 0;
  return (
    <tr>
      <td style={{ padding: "11px 10px", borderBottom: "1px solid #f1f3f6", color: "#475569", fontSize: "13px" }}>{label}</td>
      <td style={{ padding: "11px 10px", borderBottom: "1px solid #f1f3f6", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(a)}</td>
      <td style={{ padding: "11px 10px", borderBottom: "1px solid #f1f3f6", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#1e293b" }}>{fmt(b)}</td>
      <td style={{ padding: "11px 10px", borderBottom: "1px solid #f1f3f6", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {lift == null ? <span style={{ color: "#b6bdc9" }}>—</span> : (
          <span style={{ fontWeight: 800, fontSize: "12.5px", padding: "3px 9px", borderRadius: "999px", color: better ? "#166534" : "#991b1b", background: better ? "#dcfce7" : "#fee2e2" }}>{fmtLift(lift)}</span>
        )}
      </td>
    </tr>
  );
}

function TestCard({ t, labels, setLabel }) {
  const [a, b] = t.variants;
  const c = t.compare;
  const winner = c.probBetter == null ? null : c.probBetter >= 0.5 ? b : a;
  const conf = c.probBetter == null ? null : Math.max(c.probBetter, 1 - c.probBetter);
  const verdict = !c.enough
    ? { txt: "Nog te weinig data. Streef naar minstens 100 bezoekers en 20 orders per variant.", bg: "#f1f5f9", col: "#475569" }
    : conf >= 0.95
      ? { txt: `Variant ${winner.letter} wint met ${(conf * 100).toFixed(0)}% zekerheid.`, bg: "#dcfce7", col: "#166534" }
      : conf >= 0.8
        ? { txt: `Variant ${winner.letter} ligt voor (${(conf * 100).toFixed(0)}% zekerheid). Nog even laten lopen.`, bg: "#fef9c3", col: "#854d0e" }
        : { txt: `Geen duidelijk verschil (${(conf * 100).toFixed(0)}% zekerheid). Laten lopen.`, bg: "#f1f5f9", col: "#475569" };
  const name = (v) => labels[v.id] || `Variant ${v.letter}`;

  return (
    <div style={{ ...ui.card, padding: "22px 24px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={ui.label}>Split test</div>
          <div style={{ fontSize: "17px", fontWeight: 800, marginTop: "4px", fontFamily: "ui-monospace, monospace" }}>{t.host}{t.path}</div>
        </div>
        <div style={{ background: verdict.bg, color: verdict.col, fontWeight: 700, fontSize: "13px", padding: "9px 14px", borderRadius: "10px", maxWidth: "420px" }}>{verdict.txt}</div>
      </div>

      {/* Kop: 2 grote CVR-blokken */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", margin: "18px 0 16px" }}>
        {[a, b].map((v) => (
          <div key={v.id} style={{ border: `2px solid ${v === winner && c.enough ? COL[v.letter] : "#eceef2"}`, borderRadius: "14px", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: COL[v.letter] }} />
              <input value={labels[v.id] || ""} placeholder={`Variant ${v.letter}`} onChange={(e) => setLabel(v.id, e.target.value)}
                style={{ border: "none", background: "transparent", fontWeight: 800, fontSize: "14px", color: "#0f172a", outline: "none", width: "100%" }} />
            </div>
            <div style={{ fontSize: "11px", color: "#b6bdc9", marginTop: "2px" }}>pageid {v.id}</div>
            <div style={{ fontSize: "34px", fontWeight: 800, marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>{fmtPct(v.cvr, 2)}</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>conversie · {v.orders} orders / {v.pvu.toLocaleString()} bezoekers</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px", alignItems: "start" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["", name(a), name(b), "B vs A"].map((h, i) => <th key={i} style={{ ...ui.label, textAlign: i === 0 ? "left" : "right", padding: "6px 10px", borderBottom: "1px solid #eceef2" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            <Stat label="Unieke bezoekers" a={a.pvu} b={b.pvu} fmt={(v) => v.toLocaleString()} lift={null} />
            <Stat label="Checkout-kliks" a={a.ccu} b={b.ccu} fmt={(v) => v.toLocaleString()} lift={null} />
            <Stat label="→ Checkout rate" a={a.ctr} b={b.ctr} fmt={(v) => fmtPct(v)} lift={c.ctrLift} />
            <Stat label="Orders" a={a.orders} b={b.orders} fmt={(v) => v.toLocaleString()} lift={null} />
            <Stat label="Conversie (orders / bezoekers)" a={a.cvr} b={b.cvr} fmt={(v) => fmtPct(v, 2)} lift={c.cvrLift} />
            <Stat label="Omzet" a={a.revenue} b={b.revenue} fmt={fmtEur} lift={null} />
            <Stat label="Gem. orderwaarde" a={a.aov} b={b.aov} fmt={fmtEur} lift={c.aovLift} />
            <Stat label="Omzet per bezoeker" a={a.rpv} b={b.rpv} fmt={fmtEur} lift={c.rpvLift} />
          </tbody>
        </table>
        <div>
          <div style={{ ...ui.label, marginBottom: "8px" }}>Conversie per dag</div>
          <CvrChart variants={[a, b]} />
          <div style={{ display: "flex", gap: "14px", marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
            {[a, b].map((v) => <span key={v.id}><span style={{ display: "inline-block", width: "10px", height: "3px", background: COL[v.letter], verticalAlign: "middle", marginRight: "6px" }} />{name(v)}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AbTest() {
  const [preset, setPreset] = useState("30d");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [labels, setLabels] = useState({});
  useEffect(() => { setLabels(loadLabels()); }, []);
  const setLabel = (id, v) => { const n = { ...labels, [id]: v }; setLabels(n); try { localStorage.setItem(LS, JSON.stringify(n)); } catch {} };

  useEffect(() => {
    setData(null); setErr("");
    const days = parseInt(preset, 10);
    fetch(`/api/ab-test?days=${days}`).then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Fout"))).catch((e) => setErr(e.message));
  }, [preset]);

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>A/B Tests</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "13.5px" }}>Welke variant verkoopt beter? Orders worden aan een variant toegewezen via de Funnelish-pageid die de koper zag (jjb_pgs op de order).</p>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {PRESETS.map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} style={{ padding: "8px 12px", borderRadius: "10px", border: "1px solid #e2e6ec", background: preset === k ? "#0f172a" : "#fff", color: preset === k ? "#fff" : "#334155", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {err && <div style={{ ...ui.card, padding: "16px", color: "#991b1b" }}>{err}</div>}
      {!data && !err && <div style={{ color: "#8a92a3", fontSize: "13px" }}>Laden…</div>}
      {data && !data.configured && <div style={{ ...ui.card, padding: "16px" }}>Tracking (Upstash Redis) is niet geconfigureerd.</div>}
      {data && data.configured && data.tests.length === 0 && (
        <div style={{ ...ui.card, padding: "22px", color: "#475569", fontSize: "14px" }}>
          Geen split tests gevonden in deze periode. Een test verschijnt hier zodra jjb-track op dezelfde URL minstens 2 verschillende Funnelish-pageids ziet.
        </div>
      )}
      {data && data.tests.map((t) => <TestCard key={t.key} t={t} labels={labels} setLabel={setLabel} />)}

      {data && data.tests.length > 0 && (
        <p style={{ fontSize: "12px", color: "#8a92a3", marginTop: "4px" }}>
          Zekerheid = kans dat het verschil in conversie echt is (2-proporties z-test). Vanaf 95% mag je kiezen. Tip: geef de varianten een naam (klik op "Variant A/B"), bijv. "Shopify checkout" en "Membership checkout".
        </p>
      )}
    </div>
  );
}
