// pages/ab-test.js — A/B Tests
// Minimalistische vergelijking van de split test op de subscription-offer (Funnelish-varianten
// op dezelfde URL): Variant A vs B met de cijfers die ertoe doen, het verschil en een
// betrouwbaarheidsscore. Standaard: sinds de start van de test (anders vandaag), alleen de
// subscription-funnel. Namen, startdatum en welke variant het origineel is worden gedeeld
// opgeslagen (/api/ab-test POST), zodat het hele team hetzelfde ziet. Bron: /api/ab-test.

import { useState, useEffect } from "react";

const FOCUS = ["neurodrops", "lubrisense"]; // standaard alleen deze funnel(s) tonen; "Alle tests" toont de rest

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};
const COL = { A: "#b6bdc9", B: "#4f6df5" };
const fmtEur = (v) => `€ ${Number(v || 0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const fmtLift = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`);
const PRESETS = [["1", "Today"], ["2", "Yesterday + today"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"]];
const MIN_DAYS = 14, MIN_ORDERS = 100; // advies: zo lang/zoveel laten lopen voor je kiest
const todayUtc = () => new Date().toISOString().slice(0, 10);
const daysSince = (d) => Math.floor((Date.parse(`${todayUtc()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000) + 1;
async function saveSetting(body) {
  const r = await fetch("/api/ab-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!d.success) throw new Error(d.error || "Opslaan mislukt");
  return d.settings;
}

function CvrChart({ variants }) {
  const W = 900, H = 150, P = { l: 38, r: 10, t: 10, b: 22 };
  const n = variants[0].series.length;
  if (n < 2) return <div style={{ fontSize: "12px", color: "#b6bdc9", padding: "8px 0" }}>Dagverloop verschijnt bij een periode van 2 dagen of meer.</div>;
  const cvr = variants.map((v) => v.series.map((s) => (s.pvu > 0 ? s.o / s.pvu : 0)));
  const maxV = Math.max(0.01, ...cvr.flat());
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (n - 1);
  const y = (v) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, maxV].map((t) => (
        <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#eef0f4" /><text x={P.l - 6} y={y(t) + 4} fontSize="10" fill="#b6bdc9" textAnchor="end">{(t * 100).toFixed(1)}%</text></g>
      ))}
      {variants.map((v, k) => <path key={v.id} d={path(cvr[k])} fill="none" stroke={COL[v.letter]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />)}
      {variants[0].series.map((s, i) => (i === 0 || i === n - 1) && <text key={s.d} x={x(i)} y={H - 6} fontSize="10" fill="#b6bdc9" textAnchor={i === 0 ? "start" : "end"}>{s.d.slice(5)}</text>)}
    </svg>
  );
}

const ROWS = [
  ["Bezoekers", (v) => v.pvu.toLocaleString(), null],
  ["Checkout-kliks", (v) => v.ccu.toLocaleString(), null],
  ["Orders", (v) => v.orders.toLocaleString(), null],
  ["Omzet", (v) => fmtEur(v.revenue), null],
  ["Orderwaarde", (v) => fmtEur(v.aov), "aovLift"],
  ["Omzet / bezoeker", (v) => fmtEur(v.rpv), "rpvLift"],
];

function VariantCard({ v, name, setLabel, saveLabel, winner, onMakeControl }) {
  const tag = v.role === "control" ? "Origineel" : v.role === "challenger" ? "Nieuw" : null;
  return (
    <div style={{ flex: 1, padding: "20px 22px", borderRadius: "14px", background: "#fff", border: `1.5px solid ${winner ? COL[v.letter] : "#eceef2"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: COL[v.letter], flex: "none" }} />
        <input value={name} placeholder={`Variant ${v.letter}`} onChange={(e) => setLabel(v.id, e.target.value)} onBlur={(e) => saveLabel(v.id, e.target.value)}
          style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: "14px", color: "#0f172a", outline: "none", width: "100%", minWidth: 0 }} />
        {tag && <span style={{ flex: "none", fontSize: "10.5px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "999px" }}>{tag}</span>}
      </div>
      <div style={{ fontSize: "10.5px", color: "#c3c9d3", marginTop: "3px", fontFamily: "ui-monospace, monospace" }}>
        pageid {v.id}{v.role !== "control" && <> · <button onClick={() => onMakeControl(v.id)} style={{ border: "none", background: "none", padding: 0, color: "#8a92a3", textDecoration: "underline", cursor: "pointer", fontSize: "10.5px" }}>dit is het origineel</button></>}
      </div>
      <div style={{ fontSize: "40px", fontWeight: 800, letterSpacing: "-1px", margin: "10px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmtPct(v.cvr, 2)}</div>
      <div style={{ fontSize: "12px", color: "#8a92a3", marginBottom: "14px" }}>conversie</div>
      {ROWS.map(([l, f]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: "1px solid #f3f4f7", fontSize: "13px" }}>
          <span style={{ color: "#8a92a3" }}>{l}</span><span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{f(v)}</span>
        </div>
      ))}
    </div>
  );
}

function TestCard({ t, labels, setLabel, saveLabel, onSettings }) {
  const [a, b] = t.variants;
  const c = t.compare;
  const name = (v) => (labels[`${t.key}|${v.id}`] ?? v.name) || "";
  const conf = c.probBetter == null ? null : Math.max(c.probBetter, 1 - c.probBetter);
  const winner = c.enough && conf >= 0.8 ? (c.probBetter >= 0.5 ? b : a) : null;
  const verdict = !c.enough ? ["Nog te weinig data", "#f1f5f9", "#64748b"]
    : conf >= 0.95 ? [`${name(winner) || "Variant " + winner.letter} wint · ${(conf * 100).toFixed(0)}% zeker`, "#dcfce7", "#166534"]
    : conf >= 0.8 ? [`${name(winner) || "Variant " + winner.letter} ligt voor · ${(conf * 100).toFixed(0)}%`, "#fef9c3", "#854d0e"]
    : ["Geen duidelijk verschil", "#f1f5f9", "#64748b"];
  const totalOrders = t.variants.reduce((n, v) => n + v.orders, 0);
  const ran = t.start ? daysSince(t.start) : null;
  const ready = ran != null && ran >= MIN_DAYS && totalOrders >= MIN_ORDERS;

  return (
    <div style={{ ...ui.card, padding: "24px 26px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "ui-monospace, monospace", color: "#334155" }}>{t.host}{t.path}</div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            Gestart op
            <input type="date" value={t.start || ""} max={todayUtc()} onChange={(e) => onSettings({ key: t.key, start: e.target.value })}
              style={{ border: "1px solid #e2e6ec", borderRadius: "7px", padding: "2px 6px", fontSize: "12px", color: "#334155", fontFamily: "inherit" }} />
            {ran != null && ran > 0 && <span>· dag {ran} · {totalOrders} orders · {ready ? "genoeg data om te kiezen" : `advies: minstens ${MIN_DAYS} dagen en ${MIN_ORDERS} orders`}</span>}
          </div>
          {t.extra > 0 && <div style={{ fontSize: "11.5px", color: "#b45309", marginTop: "4px" }}>Er zijn in deze periode nog {t.extra} andere variant(en) gezien; alleen de twee hieronder worden vergeleken.</div>}
          {!t.control && <div style={{ fontSize: "11.5px", color: "#b45309", marginTop: "4px" }}>Klik bij het origineel op "dit is het origineel", dan staat het altijd links als A.</div>}
        </div>
        <span style={{ background: verdict[1], color: verdict[2], fontWeight: 700, fontSize: "12.5px", padding: "6px 12px", borderRadius: "999px" }}>{verdict[0]}</span>
      </div>

      <div style={{ display: "flex", gap: "14px", alignItems: "stretch" }}>
        <VariantCard v={a} name={name(a)} setLabel={(id, x) => setLabel(t.key, id, x)} saveLabel={(id, x) => saveLabel(t.key, id, x)} winner={winner === a} onMakeControl={(id) => onSettings({ key: t.key, control: id })} />
        <div style={{ width: "112px", display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "0" }}>
          <div style={{ textAlign: "center", padding: "0 0 8px", fontSize: "11px", color: "#b6bdc9", fontWeight: 600 }}>B vs A</div>
          <Lift v={c.cvrLift} big />
          <div style={{ height: "14px" }} />
          {ROWS.map(([l, , k]) => <div key={l} style={{ height: "31px", display: "flex", alignItems: "center", justifyContent: "center" }}>{k ? <Lift v={c[k]} /> : <span style={{ color: "#e2e6ec" }}>·</span>}</div>)}
        </div>
        <VariantCard v={b} name={name(b)} setLabel={(id, x) => setLabel(t.key, id, x)} saveLabel={(id, x) => saveLabel(t.key, id, x)} winner={winner === b} onMakeControl={(id) => onSettings({ key: t.key, control: id })} />
      </div>

      <div style={{ marginTop: "18px" }}>
        <div style={{ ...ui.label, marginBottom: "6px" }}>Conversie per dag</div>
        <CvrChart variants={[a, b]} />
      </div>
    </div>
  );
}

function Lift({ v, big }) {
  if (v == null) return <span style={{ color: "#e2e6ec", textAlign: "center", display: "block" }}>—</span>;
  const good = v > 0;
  return (
    <span style={{ display: "block", textAlign: "center", fontWeight: 800, fontSize: big ? "15px" : "12px", padding: big ? "8px 0" : "3px 0", borderRadius: "999px", color: good ? "#166534" : "#991b1b", background: good ? "#dcfce7" : "#fee2e2", margin: "0 8px" }}>{fmtLift(v)}</span>
  );
}

export default function AbTest() {
  const [preset, setPreset] = useState(null); // "start" | aantal dagen
  const [all, setAll] = useState(false);
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [labels, setLabels] = useState({}); // lokale invoer terwijl je typt: "testkey|pageid" → naam
  const [reload, setReload] = useState(0);

  const inFocus = (key) => all || FOCUS.some((f) => String(key).toLowerCase().includes(f));
  const starts = Object.entries(settings || {}).filter(([k, v]) => v?.start && inFocus(k)).map(([, v]) => v.start).sort();
  const startFrom = starts[0] || null;

  // 1. instellingen (startdatum, namen, origineel) → standaard "Sinds start"
  useEffect(() => {
    fetch("/api/ab-test?settingsOnly=1").then((r) => r.json()).then((d) => {
      if (!d.success) { setErr(d.error || "Fout"); return; }
      const st = d.settings || {};
      setSettings(st);
      const hasStart = Object.entries(st).some(([k, v]) => v?.start && FOCUS.some((f) => k.includes(f)));
      setPreset(hasStart ? "start" : "1");
    }).catch((e) => setErr(e.message));
  }, []);

  // 2. cijfers
  useEffect(() => {
    if (!preset) return;
    setData(null); setErr("");
    const q = preset === "start" && startFrom ? `from=${startFrom}&to=${todayUtc()}` : `days=${preset === "start" ? 1 : preset}`;
    fetch(`/api/ab-test?${q}`).then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Fout"))).catch((e) => setErr(e.message));
  }, [preset, startFrom, reload]);

  const setLabel = (key, id, v) => setLabels((l) => ({ ...l, [`${key}|${id}`]: v }));
  const saveLabel = (key, id, v) => saveSetting({ key, labels: { [id]: v } }).then((s) => setSettings((x) => ({ ...x, [key]: s }))).catch((e) => setErr(e.message));
  const onSettings = (body) => saveSetting(body).then((s) => { setSettings((x) => ({ ...x, [body.key]: s })); setReload((n) => n + 1); }).catch((e) => setErr(e.message));

  const tests = (data?.tests || []).filter((t) => inFocus(`${t.host}${t.path}`));
  const presets = startFrom ? [["start", `Sinds start (${startFrom.slice(8, 10)}/${startFrom.slice(5, 7)})`], ...PRESETS] : PRESETS;

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "22px", paddingRight: "58px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>A/B Tests</h1>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {presets.map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} style={{ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: preset === k ? "#0f172a" : "#fff", color: preset === k ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>{l}</button>
          ))}
          <span style={{ width: "1px", height: "20px", background: "#e2e6ec", margin: "0 6px" }} />
          <button onClick={() => setAll(!all)} style={{ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: all ? "#0f172a" : "#fff", color: all ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>{all ? "Alle tests" : "Subscription offer"}</button>
        </div>
      </div>

      {err && <div style={{ ...ui.card, padding: "16px", color: "#991b1b", marginBottom: "16px" }}>{err}</div>}
      {!data && !err && <div style={{ color: "#b6bdc9", fontSize: "13px" }}>Laden…</div>}
      {data && tests.length === 0 && <div style={{ ...ui.card, padding: "22px", color: "#64748b", fontSize: "14px", lineHeight: 1.6 }}>Nog geen test met twee varianten in deze periode. Zet in Funnelish beide varianten actief (bv. 50% / 50%); zodra de nieuwe variant bezoekers krijgt verschijnt de test hier binnen enkele minuten.</div>}
      {tests.map((t) => <TestCard key={t.key} t={t} labels={labels} setLabel={setLabel} saveLabel={saveLabel} onSettings={onSettings} />)}
      {tests.length > 0 && <p style={{ fontSize: "11.5px", color: "#b6bdc9", lineHeight: 1.6 }}>Zekerheid via 2-proporties z-test op orders / bezoekers. Kies pas een winnaar vanaf 95% én na minstens {MIN_DAYS} dagen en {MIN_ORDERS} orders. Klik op een naam om die te wijzigen; namen, startdatum en origineel zijn voor iedereen hetzelfde.</p>}
    </div>
  );
}
