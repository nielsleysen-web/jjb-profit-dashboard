// pages/subscriptions.js — Membership Dashboard (Health For Life)
// Rebill-grafiek (rebills binnen de totale omzet, vandaag vs. gisteren), tegels (rebills, netto winst,
// te innen, MRR), rebills per cyclus, rebill-gebeurtenissen, cohort-retentie en de ledenlijst.
// Bron: /api/subscriptions (Stripe + PayPal + Shopify + Meta).

import { useState, useEffect, useMemo } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  btn: (on) => ({ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  th: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px", padding: "6px 6px", borderBottom: "1px solid #eceef2", whiteSpace: "nowrap", textAlign: "left" },
  td: { padding: "9px 6px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: "13px" },
};
const eur = (v, d = 2) => (v == null ? "—" : `€ ${Number(v).toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (v, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const fmtD = (s) => (s ? new Date(s).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" }) : "—");
const fmtDY = (s) => (s ? new Date(s).toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

const RANGES = [["today", "Vandaag"], ["yesterday", "Gisteren"], ["7", "7 dagen"], ["28", "28 dagen"], ["all", "Sinds start"]];
const STATUS = { trial: ["Proef", "#fef9c3", "#854d0e"], active: ["Betalend", "#dcfce7", "#166534"], canceled: ["Opgezegd", "#f1f5f9", "#64748b"], problem: ["Betaalprobleem", "#fee2e2", "#991b1b"], paused: ["Gepauzeerd", "#f1f5f9", "#64748b"] };
const FILTERS = [["all", "Alle"], ["trial", "Proef"], ["active", "Betalend"], ["canceled", "Opgezegd"], ["problem", "Betaalproblemen"]];

function Tile({ label, value, sub, accent, onClick, hint }) {
  return (
    <div onClick={onClick} style={{ ...ui.card, padding: "16px 18px", position: "relative", borderTop: accent ? `3px solid ${accent}` : undefined, cursor: onClick ? "pointer" : "default", userSelect: "none" }}>
      <div style={ui.label}>{label}</div>
      {hint && <div style={{ position: "absolute", top: "14px", right: "14px", fontSize: "10.5px", color: "#4f6df5", fontWeight: 700 }}>{hint}</div>}
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.5px", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#8a92a3", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}
const Grid = ({ cols, children, mb = 12 }) => <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 3 ? 240 : 190}px, 1fr))`, gap: "12px", marginBottom: `${mb}px` }}>{children}</div>;

function Pill({ s, cancelPending }) {
  const [t, bg, fg] = STATUS[s] || [s, "#f1f5f9", "#64748b"];
  return <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: "11.5px", padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>{t}{cancelPending ? " · stopt" : ""}</span>;
}

const Chip = ({ children, tone = "green" }) => {
  const c = { green: ["#dcfce7", "#166534"], red: ["#fee2e2", "#991b1b"], amber: ["#fef9c3", "#854d0e"], blue: ["#dbeafe", "#1e40af"], gray: ["#f1f5f9", "#64748b"] }[tone];
  return <span style={{ display: "inline-block", background: c[0], color: c[1], fontWeight: 700, fontSize: "11.5px", padding: "2px 8px", borderRadius: "999px", whiteSpace: "nowrap" }}>{children}</span>;
};
// Verandering t.o.v. de vergelijkingswaarde (gisteren zelfde tijd / de dag ervoor)
function Change({ now, prev }) {
  if (prev == null || now == null) return null;
  if (!prev) return now > 0 ? <Chip>nieuw</Chip> : null;
  const d = (now - prev) / prev;
  if (Math.abs(d) < 0.0005) return <Chip tone="gray">= 0,0%</Chip>;
  return <Chip tone={d >= 0 ? "green" : "red"}>{d >= 0 ? "↗" : "↘"} {Math.abs(d * 100).toFixed(1)}%</Chip>;
}
const fmtT = (s) => (s ? new Date(s).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }) : "—");
const fmtDT = (s) => (s ? `${new Date(s).toLocaleDateString("nl-BE", { day: "2-digit", month: "short", timeZone: "Europe/Brussels" })} ${fmtT(s)}` : "—");

/* Grafiek: totale omzet (front end + rebills, groen) met daarachter de rebills (blauw); bij één dag de dag ervoor gestippeld
   en driehoekjes voor afschrijvingen die vandaag nog gepland staan. */
function RebillChart({ chart, live }) {
  const [hover, setHover] = useState(null);
  if (!chart?.points?.length) return null;
  const pts = chart.points, cmp = chart.compare || null, isHour = chart.granularity === "hour";
  const W = 1000, H = 230, PAD = { top: 14, right: 16, bottom: 26, left: 44 };
  const iw = W - PAD.left - PAD.right, ih = H - PAD.top - PAD.bottom;
  const maxV = Math.max(10, ...pts.map((p) => p.total), ...(cmp ? cmp.map((p) => p.total) : []));
  const [nice, stepV] = (() => { const m = Math.pow(10, Math.floor(Math.log10(maxV))); const f = maxV / m; const s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return [s * m, { 1: 0.25, 2: 0.5, 5: 1, 10: 2 }[s] * m]; })();
  const ticks = Array.from({ length: Math.round(nice / stepV) + 1 }, (_, i) => i * stepV);
  const x = (i) => PAD.left + (pts.length > 1 ? (i / (pts.length - 1)) * iw : iw / 2);
  const y = (v) => PAD.top + ih - (Math.min(v, nice) / nice) * ih;
  const path = (arr, key) => arr.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const nowHour = live && isHour ? parseInt(new Date().toLocaleString("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }), 10) : null;
  const upto = nowHour != null ? pts.slice(0, nowHour + 1) : pts; // live: alleen tot het huidige uur tekenen
  const label = (l) => (isHour ? l : new Date(`${l}T12:00:00Z`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }));
  const step = isHour ? 3 : Math.max(1, Math.ceil(pts.length / 10));
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const rx = ((e.clientX - r.left) / r.width) * W; let best = 0, bd = Infinity; pts.forEach((_, i) => { const d = Math.abs(x(i) - rx); if (d < bd) { bd = d; best = i; } }); setHover(best); };
  const fmt = (v) => eur(v, v >= 100 ? 0 : 2);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="totFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.08" /><stop offset="100%" stopColor="#16a34a" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t) => <g key={t}><line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#e2e6ec" : "#f1f3f6"} /><text x={PAD.left - 7} y={y(t) + 3} textAnchor="end" fontSize="8.5" fill="#a4adbd">{eur(t, 0)}</text></g>)}
        {cmp && <path d={path(cmp, "total")} fill="none" stroke="#16a34a" strokeWidth="1.1" strokeDasharray="4,4" opacity="0.3" />}
        {cmp && <path d={path(cmp, "rebills")} fill="none" stroke="#3b82f6" strokeWidth="1.1" strokeDasharray="4,4" opacity="0.3" />}
        <path d={`${path(upto, "total")} L${x(upto.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#totFill)" />
        <path d={path(upto, "total")} fill="none" stroke="#16a34a" strokeWidth="1.3" strokeLinecap="round" />
        <path d={path(upto, "rebills")} fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeLinecap="round" />
        {pts.map((p, i) => p.scheduled ? <path key={i} d={`M${x(i)},${y(0) - 9} l5,8 l-10,0z`} fill="#f59e0b"><title>{p.scheduled} gepland · {eur(p.scheduledAmount)}</title></path> : null)}
        {nowHour != null && nowHour < pts.length && (
          <g>
            <circle cx={x(nowHour)} cy={y(pts[nowHour].total)} r="6" fill="#16a34a" opacity="0.25"><animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.35;0.05;0.35" dur="2s" repeatCount="indefinite" /></circle>
            <circle cx={x(nowHour)} cy={y(pts[nowHour].total)} r="3" fill="#16a34a" stroke="#fff" strokeWidth="1.3" />
            <circle cx={x(nowHour)} cy={y(pts[nowHour].rebills)} r="3" fill="#3b82f6" stroke="#fff" strokeWidth="1.3" />
          </g>
        )}
        {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="#cbd5e1" strokeDasharray="3,3" /><circle cx={x(hover)} cy={y(pts[hover].total)} r="3" fill="#fff" stroke="#16a34a" strokeWidth="1.2" /><circle cx={x(hover)} cy={y(pts[hover].rebills)} r="3" fill="#fff" stroke="#3b82f6" strokeWidth="1.2" /></g>}
        {pts.map((p, i) => (i % step === 0 ? <text key={p.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#a4adbd">{label(p.label)}</text> : null))}
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${x(hover) > W * 0.75 ? "-105%" : "8px"})`, background: "#0f172a", color: "#fff", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.7, pointerEvents: "none", boxShadow: "0 8px 24px rgba(15,23,42,0.18)", whiteSpace: "nowrap", zIndex: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>{label(pts[hover].label)}</div>
          <div>Totale omzet: <b style={{ color: "#86efac" }}>{fmt(pts[hover].total)}</b> <span style={{ color: "#94a3b8" }}>({pts[hover].orders} orders)</span></div>
          <div>Rebills: <b style={{ color: "#93c5fd" }}>{fmt(pts[hover].rebills)}</b> <span style={{ color: "#94a3b8" }}>({pts[hover].rebillCount})</span> · front end {fmt(pts[hover].frontEnd)}</div>
          {cmp && cmp[hover] && <div style={{ color: "#cbd5e1" }}>Dag ervoor: {fmt(cmp[hover].total)} · rebills {fmt(cmp[hover].rebills)}</div>}
          {pts[hover].scheduled > 0 && <div style={{ color: "#fcd34d" }}>▲ {pts[hover].scheduled} gepland · {fmt(pts[hover].scheduledAmount)}</div>}
        </div>
      )}
    </div>
  );
}

function BigTile({ label, value, valueColor, children }) {
  return (
    <div style={{ ...ui.card, padding: "18px 20px" }}>
      <div style={ui.label}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", margin: "8px 0 6px", fontVariantNumeric: "tabular-nums", color: valueColor || "#0f172a" }}>{value}</div>
      <div style={{ fontSize: "12.5px", color: "#64748b", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const Bar = ({ v }) => <span style={{ display: "inline-block", width: "110px", height: "8px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden", verticalAlign: "middle", marginRight: "8px" }}><span style={{ display: "block", width: `${Math.round((v || 0) * 100)}%`, height: "100%", background: "#22c55e" }} /></span>;

function CycleTable({ rows, periodLabel }) {
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 800, fontSize: "15px" }}>Rebills — per cyclus</div><div style={{ fontSize: "12px", color: "#8a92a3" }}>{periodLabel.toLowerCase()} · leden van wie rebill k in deze periode verschuldigd was (dag 7, dag 35, dag 63, …) · Stripe + PayPal</div></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Cyclus", "Te innen", "Geslaagd", "Mislukt", "Hersteld", "Opgezegd vóór rebill", "Nog open", "Succes-%", "Omzet", "Netto winst"].map((h, i) => <th key={h} style={{ ...ui.th, textAlign: i === 0 || i === 7 ? "left" : "right" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.k}>
                <td style={{ ...ui.td, fontWeight: 700 }}>{c.label} <span style={{ color: "#8a92a3", fontSize: "11.5px", fontWeight: 500 }}>dag {c.day}</span></td>
                <td style={{ ...ui.td, textAlign: "right" }}>{c.due}</td>
                <td style={{ ...ui.td, textAlign: "right", color: "#16a34a", fontWeight: 700 }}>{c.paid}</td>
                <td style={{ ...ui.td, textAlign: "right", color: c.failed ? "#dc2626" : "#0f172a", fontWeight: 700 }}>{c.failed}</td>
                <td style={{ ...ui.td, textAlign: "right" }}>{c.recovered}</td>
                <td style={{ ...ui.td, textAlign: "right" }}>{c.canceledBefore}</td>
                <td style={{ ...ui.td, textAlign: "right", color: "#8a92a3" }}>{c.open}</td>
                <td style={ui.td}>{c.successRate == null ? <span style={{ color: "#c3c9d3" }}>—</span> : <><Bar v={c.successRate} />{pct(c.successRate, 0)}</>}</td>
                <td style={{ ...ui.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(c.revenue)}</td>
                <td style={{ ...ui.td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: c.net > 0 ? "#16a34a" : "#0f172a", fontWeight: 700 }}>{eur(c.net)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} style={{ ...ui.td, color: "#8a92a3" }}>Geen rebills verschuldigd in deze periode.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "10px" }}>Te innen = leden van wie die cyclus in de periode afliep · succes-% = geslaagd / (geslaagd + mislukt) · opgezegd vóór rebill telt niet mee als mislukt · netto winst = omzet − betaalfees − kostprijs van het gratis product dat in die cyclus verzonden is</div>
    </div>
  );
}

const EV = { paid: ["✓ Geslaagd", "green"], failed: ["✗ Mislukt", "red"], scheduled: ["⏳ Gepland", "amber"] };
function EventsTable({ events, total, storeHandle, periodLabel }) {
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 800, fontSize: "15px" }}>Rebills {periodLabel.toLowerCase()}</div><div style={{ fontSize: "12px", color: "#8a92a3" }}>geslaagde en mislukte afschrijvingen, plus wat vandaag nog gepland staat{total > events.length ? ` · de ${events.length} meest recente van ${total}` : ""}</div></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Tijd", "Lid", "Via", "Cyclus", "Status", "Bedrag", "Volgende"].map((h, i) => <th key={h} style={{ ...ui.th, textAlign: i === 5 ? "right" : "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {events.map((e, i) => {
              const [t, tone] = EV[e.type];
              return (
                <tr key={i}>
                  <td style={ui.td}>{fmtDT(e.at)}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal", minWidth: "180px" }}><a href={`/members?email=${encodeURIComponent(e.member.email)}`} style={{ fontWeight: 700, color: "#0f172a", textDecoration: "none" }}>{e.member.name || e.member.email || "—"}</a> <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>{e.member.email}{e.member.order ? ` · ${e.member.order}` : ""}</span></td>
                  <td style={ui.td}>{e.member.provider === "paypal" ? "PayPal" : "Stripe"}</td>
                  <td style={ui.td}>Rebill {e.cycle}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal" }}>
                    <Chip tone={tone}>{t}{e.type === "failed" && e.reason ? ` · ${e.reason}` : ""}</Chip>
                    {e.type === "paid" && e.recovered && <> <Chip tone="blue">hersteld na mislukking</Chip></>}
                    {e.type === "failed" && e.inRecovery && <> <Chip tone="blue">in herstel-flow</Chip></>}
                    {e.type === "failed" && !e.inRecovery && e.member.status === "canceled" && <> <Chip tone="gray">opgezegd</Chip></>}
                    {e.type === "failed" && !e.inRecovery && e.member.status === "active" && <> <Chip tone="green">intussen betaald</Chip></>}
                  </td>
                  <td style={{ ...ui.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(e.amount)}</td>
                  <td style={ui.td}>{e.type === "paid" ? fmtD(e.next) : e.type === "failed" ? (e.nextAttempt ? `herpoging ${fmtD(e.nextAttempt)}` : `${e.attempts} poging${e.attempts === 1 ? "" : "en"}`) : "—"}</td>
                </tr>
              );
            })}
            {events.length === 0 && <tr><td colSpan={7} style={{ ...ui.td, color: "#8a92a3" }}>Geen rebills in deze periode.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "10px" }}>Klik op een lid voor de volledige tijdlijn (Members). Mislukte rebills: Stripe probeert automatisch opnieuw; de klant krijgt mail 1 direct en mail 2 (regalo) na 3 dagen.</div>
    </div>
  );
}

function Cohorts({ week, month }) {
  const [mode, setMode] = useState("week");
  const rows = mode === "week" ? week : month;
  const label = (k) => (mode === "week" ? new Date(k).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" }) : new Date(`${k}-01`).toLocaleDateString("nl-BE", { month: "long", year: "numeric" }));
  const ncols = 5;
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
        <div><div style={{ fontWeight: 800, fontSize: "15px" }}>Cohort-retentie</div><div style={{ fontSize: "12px", color: "#8a92a3" }}>per {mode === "week" ? "week" : "maand"} van instappen · afgehaakt per cyclus (aantal en % van het cohort) · een cel is leeg, niet nul, zolang die cyclus voor het hele cohort nog niet is aangebroken</div></div>
        <div style={{ display: "flex", gap: "6px" }}><button style={ui.btn(mode === "week")} onClick={() => setMode("week")}>Per week</button><button style={ui.btn(mode === "month")} onClick={() => setMode("month")}>Per maand</button></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={ui.th}>Cohort ({mode === "week" ? "week van" : "maand"})</th><th style={{ ...ui.th, textAlign: "center" }}>Leden</th>{Array.from({ length: ncols }, (_, k) => <th key={k} style={{ ...ui.th, textAlign: "center" }}>{k === 0 ? "Proef (7 d)" : `Cyclus ${k}`}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ ...ui.td, fontWeight: 600, borderBottom: 0, padding: "5px 6px" }}>{label(r.key)}</td>
                <td style={{ ...ui.td, textAlign: "center", borderBottom: 0, padding: "5px 6px" }}><span style={{ display: "inline-block", minWidth: "60px", background: "#f1f5f9", borderRadius: "8px", padding: "8px 0", fontWeight: 700 }}>{r.size}</span></td>
                {r.cells.slice(0, ncols).map((c, k) => (
                  <td key={k} style={{ ...ui.td, textAlign: "center", borderBottom: 0, padding: "5px 6px" }}>
                    {c ? <div style={{ background: "#fee2e2", borderRadius: "8px", padding: "6px 0", minWidth: "120px", lineHeight: 1.25 }}><b style={{ display: "block", fontSize: "13px", color: "#991b1b" }}>−{c.dropped} <small style={{ fontWeight: 600, color: "#b91c1c" }}>({(c.rate * 100).toFixed(0)}%)</small></b><span style={{ fontSize: "11px", color: "#7f1d1d" }}>{c.left} over</span></div>
                      : <span style={{ color: "#c3c9d3", fontSize: "12px" }}>nog niet</span>}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={ncols + 2} style={{ ...ui.td, color: "#8a92a3" }}>Nog geen leden.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [clock, setClock] = useState("");
  useEffect(() => { const t = () => setClock(new Date().toLocaleTimeString("nl-BE", { timeZone: "Europe/Brussels" })); t(); const i = setInterval(t, 1000); return () => clearInterval(i); }, []);

  const load = (r) => {
    setData(null); setErr("");
    fetch(`/api/subscriptions?range=${r}`).then((x) => x.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Fout"))).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(range); }, [range]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.members.filter((m) => (filter === "all" || m.status === filter) && (!s || `${m.name} ${m.email} ${m.order?.name || ""} ${m.id}`.toLowerCase().includes(s)));
  }, [data, filter, q]);

  const k = data?.kpis;
  const periodLabel = RANGES.find(([x]) => x === range)?.[1] || "";
  const low = periodLabel.toLowerCase();
  const live = range === "today";
  const cmp = data?.compare;
  const cmpLabel = cmp ? (cmp.sameTime ? "vs. gisteren, zelfde tijd" : "vs. de dag ervoor") : null;
  const isHour = data?.chart?.granularity === "hour";

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "22px" }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Membership</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Health For Life · 7 dagen proef, daarna {eur(data?.price ?? 49)} per 28 dagen{data ? ` · ververst ${new Date(data.generatedAt).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}` : ""}</div></div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {RANGES.map(([x, l]) => <button key={x} style={ui.btn(range === x)} onClick={() => setRange(x)}>{l}</button>)}
          <span style={{ width: "1px", height: "20px", background: "#e2e6ec", margin: "0 6px" }} />
          <button style={ui.btn(false)} onClick={() => load(range)}>Vernieuwen</button>
        </div>
      </div>

      {err && <div style={{ ...ui.card, padding: "16px", color: "#991b1b", marginBottom: "16px" }}>{err}</div>}
      {!data && !err && <div style={{ color: "#b6bdc9", fontSize: "13px" }}>Laden… (Stripe, PayPal, Shopify en Meta worden live opgehaald)</div>}

      {k && (
        <>
          {/* ===== grafiek: rebills (blauw) binnen de totale omzet (groen) ===== */}
          <div style={{ ...ui.card, padding: "16px 16px 6px 16px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "2px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>Rebill-omzet {isHour ? "per uur" : "per dag"}</span>{cmp && <Change now={k.rebillRevenue.period} prev={cmp.rebillRevenue} />}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.4px", marginTop: "2px" }}>{eur(k.rebillRevenue.period)} <span style={{ fontSize: "13px", fontWeight: 700, color: "#16a34a" }}>· totale omzet {eur(k.revenue)}</span>{cmp && <span style={{ marginLeft: "6px" }}><Change now={k.revenue} prev={cmp.revenue} /></span>}</div>
                <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "3px" }}>🕐 Winkeltijd {clock} (Brussel) · {k.rebillRevenue.count} rebill{k.rebillRevenue.count === 1 ? "" : "s"} geslaagd · {k.failed.count} mislukt{live ? ` · ${k.due.open} gepland vandaag` : ""} · {k.frontEnd.count} front-end order{k.frontEnd.count === 1 ? "" : "s"}</div>
              </div>
              <span style={{ fontSize: "11px", color: "#8a92a3", textAlign: "right", lineHeight: 1.7 }}>
                netto rebill-winst: <b style={{ color: k.rebillNet >= 0 ? "#16a34a" : "#dc2626" }}>{eur(k.rebillNet)}</b>
                <span style={{ display: "block", color: "#a4adbd" }}><span style={{ color: "#16a34a" }}>─ totale omzet (front end + rebills)</span> · <span style={{ color: "#3b82f6" }}>─ rebills</span>{isHour ? <> · ╌ de dag ervoor{live ? " · ▲ gepland" : ""}</> : null}</span>
              </span>
            </div>
            <RebillChart chart={data.chart} live={live} />
          </div>

          {/* ===== grote tegels ===== */}
          <Grid cols={3}>
            <BigTile label={`Rebills ${low}`} value={<>{k.rebillRevenue.count}{live ? <span style={{ fontSize: "15px", color: "#64748b", fontWeight: 600 }}> / {k.due.total} gepland</span> : null}</>}>
              <Chip>✓ {k.rebillRevenue.count} geslaagd</Chip> <Chip tone={k.failed.count ? "red" : "gray"}>✗ {k.failed.count} mislukt</Chip>{live ? <> {k.due.open} nog te innen</> : null}{cmp ? <> · {cmpLabel}: {cmp.rebills}</> : null}
            </BigTile>
            <BigTile label="Totale netto winst" value={eur(k.netProfit)} valueColor={k.netProfit >= 0 ? "#16a34a" : "#dc2626"}>
              front end {eur(k.frontEnd.revenue)} + rebills {eur(k.rebillRevenue.period)} − COGS {eur(k.cogs.frontEnd + k.cogs.rebills)} − fees {eur(k.fees)} − ad spend {eur(k.spend)}{k.spendConfigured ? "" : " (Meta niet gekoppeld)"} · <b>{pct(k.profitPct)}</b> marge
            </BigTile>
            <BigTile label="Netto rebill-winst" value={eur(k.rebillNet)} valueColor={k.rebillNet >= 0 ? "#16a34a" : "#dc2626"}>
              omzet {eur(k.rebillRevenue.period)} − fees {eur(k.rebillFees)} − gratis product verzonden {eur(k.cogs.rebills)} · <b>{pct(k.rebillMargin)}</b> marge
            </BigTile>
            <BigTile label="Rebill-omzet" value={eur(k.rebillRevenue.period)}>
              {cmp ? <><Change now={k.rebillRevenue.period} prev={cmp.rebillRevenue} /> {cmpLabel} · </> : null}sinds start {eur(k.rebillRevenue.total)} ({k.rebillRevenue.totalCount})
            </BigTile>
          </Grid>

          {/* ===== kleine tegels ===== */}
          <Grid mb={20}>
            <Tile label="Succes-% rebills" value={k.failed.attempts ? pct(1 - k.failed.rate, 0) : "—"} sub={`${k.rebillRevenue.count} van ${k.failed.attempts} pogingen · ${low}`} />
            <Tile label="Mislukt" value={k.failed.count} accent={k.failed.count ? "#ef4444" : undefined} sub={`${eur(k.failed.amount)} open · ${k.failed.inRecovery} in herstel-flow · ${k.failed.recovered} hersteld`} />
            <Tile label={live ? "Vandaag te innen" : "Nog te innen"} value={k.due.open} sub={`${eur(k.due.openAmount)} · ${k.due.stripe} Stripe · ${k.due.paypal} PayPal`} />
            <Tile label="Komende 7 dagen" value={k.next7.count} sub={`${eur(k.next7.amount)} · ${k.next7.stripe} Stripe · ${k.next7.paypal} PayPal${k.next7.firstDay ? ` · eerste op ${fmtD(k.next7.firstDay)}` : ""}`} />
            <Tile label="Actieve MRR" value={eur(k.mrr)} sub={`${k.activeSubscribers} abonnees × ${eur(data.price)} / 28 d · ${k.active} betalend + ${k.trial} in proef${k.problem ? ` · ${k.problem} betaalprobleem` : ""}`} accent="#4f6df5" />
          </Grid>

          <CycleTable rows={data.cycleRows || []} periodLabel={periodLabel} />
          <EventsTable events={data.events || []} total={data.eventsTotal || 0} storeHandle={data.storeHandle} periodLabel={periodLabel} />

          <Cohorts week={data.cohortsWeek} month={data.cohortsMonth} />

          <div style={{ ...ui.card, padding: "18px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {FILTERS.map(([key, l]) => <button key={key} style={ui.btn(filter === key)} onClick={() => setFilter(key)}>{l} {key === "all" ? data.members.length : data.members.filter((m) => m.status === key).length}</button>)}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek naam, e-mail, order…" style={{ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", fontSize: "12.5px", width: "220px", outline: "none" }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Lid", "Via", "Status", "Gestart", "Proef eindigt", "Volgende afschrijving", "Cycli", "Membership", "Front-end order"].map((h) => <th key={h} style={ui.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...ui.td, whiteSpace: "normal", minWidth: "150px" }}><div style={{ fontWeight: 700 }}>{m.name || "—"}</div><div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{m.email}{m.order?.city ? ` · ${m.order.city}` : ""}</div></td>
                      <td style={ui.td}>{m.provider === "paypal" ? "PayPal" : "Card"}</td>
                      <td style={ui.td}><Pill s={m.status} cancelPending={m.cancelAtPeriodEnd} />{m.status === "canceled" && m.canceledAt && <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "3px" }}>{fmtDY(m.canceledAt)}</div>}</td>
                      <td style={ui.td}>{fmtDY(m.startedAt)}</td>
                      <td style={{ ...ui.td, color: m.status === "trial" ? "#854d0e" : "#8a92a3" }}>{fmtD(m.trialEnd)}</td>
                      <td style={ui.td}>{m.status === "canceled" ? "—" : fmtD(m.nextBilling)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.cycles}</td>
                      <td style={{ ...ui.td, fontVariantNumeric: "tabular-nums" }}>{eur(m.membershipRevenue)}</td>
                      <td style={ui.td}>{m.order ? <><a href={`https://admin.shopify.com/store/${data.storeHandle}/orders/${m.order.id}`} target="_blank" rel="noreferrer" style={{ color: "#4f6df5", fontWeight: 700, textDecoration: "none" }}>{m.order.name}</a><div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{m.order.bundle} · {eur(m.order.net)}{m.order.refunded ? ` · refund ${eur(m.order.refunded)}` : ""}</div></> : <span style={{ color: "#b6bdc9" }}>geen order</span>}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={9} style={{ ...ui.td, color: "#8a92a3" }}>Geen leden in deze selectie.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ fontSize: "11.5px", color: "#b6bdc9" }}>Live uit Stripe, PayPal, Shopify (orders met tag subscription-frontend) en Meta ({k.campaigns?.length || 0} campagnes achter deze orders). Periode {data.from} t/m {data.to} · opgehaald {new Date(data.generatedAt).toLocaleTimeString("nl-BE")}.</p>
        </>
      )}
    </div>
  );
}
