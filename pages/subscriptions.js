// pages/subscriptions.js — Membership Dashboard (Health For Life), fully in English.
// Rebill chart (rebills within total revenue, today vs. yesterday), tiles (rebills, net profit,
// due, MRR), cohort retention and the member list
// with customer service actions (pause 30/60/90 days, resume, cancel).
// Source: /api/subscriptions (Stripe + PayPal + Shopify + Meta).

import React, { useState, useEffect, useMemo, useRef } from "react";
import { MemberActionButtons, CancellationInfo } from "../components/membership/MemberActions";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  btn: (on) => ({ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  th: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px", padding: "6px 6px", borderBottom: "1px solid #eceef2", whiteSpace: "nowrap", textAlign: "left" },
  td: { padding: "9px 6px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: "13px" },
};
const eur = (v, d = 2) => (v == null ? "—" : `€${Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (v, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const fmtD = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
const fmtDY = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

const RANGES = [["today", "Today"], ["yesterday", "Yesterday"], ["7", "7 days"], ["28", "28 days"], ["all", "Since launch"]];
const STATUS = { trial: ["Trial", "#fef9c3", "#854d0e"], active: ["Paying", "#dcfce7", "#166534"], canceled: ["Cancelled", "#f1f5f9", "#64748b"], problem: ["Payment issue", "#fee2e2", "#991b1b"], paused: ["Paused", "#e0e7ff", "#3730a3"] };
const FILTERS = [["all", "All"], ["trial", "Trial"], ["active", "Paying"], ["paused", "Paused"], ["canceled", "Cancelled"], ["problem", "Payment issues"]];

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
  return <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: "11.5px", padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>{t}{cancelPending ? " · ends" : ""}</span>;
}

const Chip = ({ children, tone = "green" }) => {
  const c = { green: ["#dcfce7", "#166534"], red: ["#fee2e2", "#991b1b"], amber: ["#fef9c3", "#854d0e"], blue: ["#dbeafe", "#1e40af"], gray: ["#f1f5f9", "#64748b"] }[tone];
  return <span style={{ display: "inline-block", background: c[0], color: c[1], fontWeight: 700, fontSize: "11.5px", padding: "2px 8px", borderRadius: "999px", whiteSpace: "nowrap" }}>{children}</span>;
};
// Change vs. the comparison value (yesterday same time / the day before)
function Change({ now, prev }) {
  if (prev == null || now == null) return null;
  if (!prev) return now > 0 ? <Chip>new</Chip> : null;
  const d = (now - prev) / prev;
  if (Math.abs(d) < 0.0005) return <Chip tone="gray">= 0.0%</Chip>;
  return <Chip tone={d >= 0 ? "green" : "red"}>{d >= 0 ? "↗" : "↘"} {Math.abs(d * 100).toFixed(1)}%</Chip>;
}
const num1 = (v) => Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 });
const fmtT = (s) => (s ? new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }) : "—");
const fmtDT = (s) => (s ? `${new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Europe/Brussels" })} ${fmtT(s)}` : "—");

/* Chart: total revenue (front end + rebills, green) with the rebills behind it (blue); for a single day the day before is dotted
   and triangles mark charges still scheduled for today. */
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
  const upto = nowHour != null ? pts.slice(0, nowHour + 1) : pts; // live: only draw up to the current hour
  const label = (l) => (isHour ? l : new Date(`${l}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
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
        {pts.map((p, i) => p.scheduled ? <path key={i} d={`M${x(i)},${y(0) - 9} l5,8 l-10,0z`} fill="#f59e0b"><title>{p.scheduled} scheduled · {eur(p.scheduledAmount)}</title></path> : null)}
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
          <div>Total revenue: <b style={{ color: "#86efac" }}>{fmt(pts[hover].total)}</b> <span style={{ color: "#94a3b8" }}>({pts[hover].orders} orders)</span></div>
          <div>Rebills: <b style={{ color: "#93c5fd" }}>{fmt(pts[hover].rebills)}</b> <span style={{ color: "#94a3b8" }}>({pts[hover].rebillCount})</span> · front end {fmt(pts[hover].frontEnd)}</div>
          {cmp && cmp[hover] && <div style={{ color: "#cbd5e1" }}>Day before: {fmt(cmp[hover].total)} · rebills {fmt(cmp[hover].rebills)}</div>}
          {pts[hover].scheduled > 0 && <div style={{ color: "#fcd34d" }}>▲ {pts[hover].scheduled} scheduled · {fmt(pts[hover].scheduledAmount)}</div>}
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

// Rebills due today (Brussels): scheduled, paid and failed — always today, whatever period is selected
const DUE = { scheduled: ["Scheduled", "amber"], processing: ["Processing", "blue"], paid: ["✓ Paid", "green"], failed: ["✗ Failed", "red"], cancelled: ["Cancelled", "gray"], paused: ["Paused", "gray"] };
function DueToday({ rows }) {
  const open = rows.filter((r) => r.type === "scheduled" || r.type === "processing");
  const n = (t) => rows.filter((r) => r.type === t).length;
  const sum = (list) => list.reduce((a, r) => a + r.amount, 0);
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontWeight: 800, fontSize: "15px" }}>Rebills due today</div>
        <div style={{ fontSize: "12px", color: "#8a92a3" }}>{rows.length} due today · {open.length} still to collect ({eur(sum(open))}){n("processing") ? ` (${n("processing")} processing)` : ""} · {n("paid")} paid · {n("failed")} failed{n("cancelled") ? ` · ${n("cancelled")} cancelled` : ""}{n("paused") ? ` · ${n("paused")} paused` : ""}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Time", "Member", "Via", "Rebill", "Status", "Amount"].map((h, i) => <th key={h} style={{ ...ui.th, textAlign: i === 5 ? "right" : "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const [t, tone] = DUE[r.type];
              return (
                <tr key={i}>
                  <td style={ui.td}>{fmtT(r.at)}</td>
                  <td style={{ ...ui.td, whiteSpace: "normal", minWidth: "180px" }}><a href={`/members?email=${encodeURIComponent(r.member.email)}&brand=${r.member.product || "neurotone"}`} style={{ fontWeight: 700, color: "#0f172a", textDecoration: "none" }}>{r.member.name || r.member.email || "—"}</a> <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>{r.member.email}{r.member.order ? ` · ${r.member.order}` : ""}</span></td>
                  <td style={ui.td}>{r.member.provider === "paypal" ? "PayPal" : "Card"}</td>
                  <td style={ui.td}>Rebill {r.cycle}</td>
                  <td style={ui.td}><Chip tone={tone}>{t}{r.type === "failed" && r.reason ? ` · ${r.reason}` : ""}{r.type === "cancelled" && r.canceledAt ? ` · ${fmtT(r.canceledAt)}` : ""}</Chip>{r.type === "paid" && r.recovered ? <> <Chip tone="blue">recovered</Chip></> : null}</td>
                  <td style={{ ...ui.td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.type === "cancelled" || r.type === "paused" ? "#a4adbd" : undefined, textDecoration: r.type === "cancelled" ? "line-through" : undefined }}>{eur(r.amount)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} style={{ ...ui.td, color: "#8a92a3" }}>No rebills due today.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* ---------- Next 14 days: renewals due per day, stacked per product ----------
   Slim capsule columns on a soft track, 2px white gaps between products, grow-in animation,
   dashed daily average, hover card. Colours validated for colour-blind separation (dataviz validator). */
const PRODUCTS = [["neurotone", "NeuroTone", "#4f6df5"], ["magnesium", "Magnesium Freeze", "#1baf7a"], ["lubrisense", "LubriSense", "#e87ba4"]];
const prodMeta = (k) => PRODUCTS.find((p) => p[0] === k) || [k, k, "#94a3b8"];
const fmtDay = (d, o = { day: "numeric", month: "short" }) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function NdStat({ label, value, sub, color }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: "12px", background: "#f7f8fb", minWidth: "120px" }}>
      <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.4px", color: color || "#0f172a", fontVariantNumeric: "tabular-nums", marginTop: "2px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{sub}</div>}
    </div>
  );
}

function NextDays({ days }) {
  const [hover, setHover] = useState(null);
  // Render in real pixels (measured width) so text and bars keep the same size on every screen
  const boxRef = useRef(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [days?.length]);
  if (!days?.length) return null;
  const extra = [...new Set(days.flatMap((d) => Object.keys(d.byProduct || {})))].filter((k) => !PRODUCTS.some((p) => p[0] === k));
  const keys = [...PRODUCTS.map((p) => p[0]), ...extra].filter((k) => days.some((d) => d.byProduct?.[k]));
  const total = days.reduce((a, d) => a + d.total, 0), amount = days.reduce((a, d) => a + d.amount, 0);
  const busiest = days.reduce((b, d) => (d.total > (b?.total || 0) ? d : b), null);
  const avg = total / days.length;
  const H = 190, TOP = 20, BOTTOM = 26;
  const ih = H - TOP - BOTTOM, slot = W / days.length, bw = Math.max(8, Math.min(26, slot * 0.46));
  const max = Math.max(1, ...days.map((d) => d.total));
  const hpx = (v) => (v / max) * ih;
  const base = TOP + ih;
  const stat = (v, l, c) => <span style={{ whiteSpace: "nowrap" }}><b style={{ color: c || "#0f172a", fontVariantNumeric: "tabular-nums" }}>{v}</b> {l}</span>;
  return (
    <div style={{ ...ui.card, padding: "16px 20px 12px", marginBottom: "20px", position: "relative" }}>
      <style>{`@keyframes ndGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px 16px", marginBottom: "6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: "14px" }}>Next 14 days <span style={{ fontWeight: 500, fontSize: "12px", color: "#8a92a3" }}>· renewals due</span></span>
          <span style={{ display: "inline-flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "#475569" }}>
            {keys.map((k) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "999px", background: prodMeta(k)[2] }} />{prodMeta(k)[1]} <b style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{days.reduce((a, d) => a + (d.byProduct?.[k] || 0), 0)}</b></span>)}
          </span>
        </div>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "12px", color: "#8a92a3" }}>
          {stat(total, "renewals")}{stat(eur(amount, 0), "potential", "#16a34a")}{busiest && busiest.total > 0 && stat(busiest.total, `on ${fmtDay(busiest.d, { weekday: "short", day: "numeric", month: "short" })}`, "#4f6df5")}
        </div>
      </div>
      {!keys.length && <div style={{ fontSize: "12.5px", color: "#8a92a3", padding: "16px 0" }}>No renewals scheduled in the next 14 days.</div>}
      <div ref={boxRef} style={{ position: "relative", display: keys.length ? "block" : "none" }}>
        <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} onMouseLeave={() => setHover(null)}>
          <defs>
            {days.map((d, i) => {
              const x = i * slot + (slot - bw) / 2, h = hpx(d.total);
              return <clipPath key={d.d} id={`nd-c-${i}`}><rect x={x} y={base - h} width={bw} height={h + 6} rx={Math.min(6, bw / 2)} /></clipPath>;
            })}
          </defs>
          {[0.5, 1].map((t) => <line key={t} x1="0" x2={W} y1={base - ih * t} y2={base - ih * t} stroke="#f1f3f6" />)}
          <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="#e2e6ec" />
          {avg > 0 && <line x1="0" x2={W} y1={base - hpx(avg)} y2={base - hpx(avg)} stroke="#a4adbd" strokeDasharray="3 4" />}
          {days.map((d, i) => {
            const x = i * slot + (slot - bw) / 2, h = hpx(d.total), cx = i * slot + slot / 2;
            const today = i === 0, on = hover === i, dim = hover != null && !on;
            const wd = new Date(`${d.d}T12:00:00Z`).getUTCDay(), weekend = wd === 0 || wd === 6;
            let y = base;
            const segs = [];
            keys.forEach((k, j) => {
              const v = d.byProduct?.[k] || 0;
              if (!v) return;
              const sh = hpx(v);
              y -= sh;
              segs.push(<rect key={k} x={x} y={y} width={bw} height={sh} fill={prodMeta(k)[2]} />);
              if (y > base - h + 0.5) segs.push(<rect key={`g${k}`} x={x} y={y - 1} width={bw} height="2" fill="#fff" />);
            });
            return (
              <g key={d.d} onMouseEnter={() => setHover(i)}>
                <rect x={i * slot + 2} y={TOP - 14} width={slot - 4} height={ih + 14} rx="8" fill={on ? "#f4f6fb" : "transparent"} />
                <g clipPath={`url(#nd-c-${i})`} style={{ opacity: dim ? 0.35 : 1, transition: "opacity .15s", transformBox: "fill-box", transformOrigin: "bottom", animation: `ndGrow .55s cubic-bezier(.2,.8,.2,1) ${i * 30}ms both` }}>{segs}</g>
                {d.total > 0 && <text x={cx} y={base - h - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={dim ? "#b6bdc9" : "#334155"} style={{ fontVariantNumeric: "tabular-nums" }}>{d.total}</text>}
                <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fontWeight={today ? 700 : 500} fill={today ? "#0f172a" : weekend ? "#b6bdc9" : "#8a92a3"}>{today ? "Today" : fmtDay(d.d, { weekday: "short", day: "numeric" })}</text>
              </g>
            );
          })}
          {avg > 0 && <text x={W} y={base - hpx(avg) - 4} textAnchor="end" fontSize="10" fill="#a4adbd">avg {num1(avg)}</text>}
        </svg>
        {hover != null && (() => {
          const d = days[hover];
          const cx = (hover + 0.5) * slot, right = cx > W * 0.66;
          return (
            <div style={{ position: "absolute", top: "8px", left: `${cx}px`, transform: `translateX(${right ? "calc(-100% - 22px)" : "22px"})`, background: "#fff", color: "#0f172a", border: "1px solid #eceef2", borderRadius: "10px", padding: "9px 12px", fontSize: "12px", lineHeight: 1.7, pointerEvents: "none", boxShadow: "0 10px 28px rgba(15,23,42,0.12)", whiteSpace: "nowrap", zIndex: 10, minWidth: "170px" }}>
              <div style={{ fontWeight: 800, marginBottom: "2px" }}>{hover === 0 ? "Today · " : ""}{fmtDay(d.d, { weekday: "long", day: "numeric", month: "short" })}</div>
              {keys.filter((k) => d.byProduct?.[k]).map((k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "14px" }}><span><span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "999px", background: prodMeta(k)[2], marginRight: "6px" }} />{prodMeta(k)[1]}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{d.byProduct[k]}</b></div>)}
              {!d.total && <div style={{ color: "#8a92a3" }}>No renewals due</div>}
              {d.total > 0 && <div style={{ borderTop: "1px solid #eceef2", marginTop: "4px", paddingTop: "4px", display: "flex", justifyContent: "space-between", gap: "14px" }}><span style={{ color: "#64748b" }}>{d.total} renewal{d.total === 1 ? "" : "s"}</span><b style={{ color: "#16a34a" }}>{eur(d.amount, 0)}</b></div>}
              {(d.trial || d.paypal) ? <div style={{ fontSize: "11px", color: "#8a92a3" }}>{d.trial ? `${d.trial} first rebill after trial` : ""}{d.trial && d.paypal ? " · " : ""}{d.paypal ? `${d.paypal} via PayPal` : ""}</div> : null}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ---------- Failed rebills, last 30 days: per decline reason and how they ended ---------- */
const REASON = {
  insufficient_funds: "Insufficient funds", generic_decline: "Generic decline", card_declined: "Card declined", do_not_honor: "Do not honor",
  authentication_required: "3DS / authentication required", expired_card: "Expired card", lost_card: "Lost card", stolen_card: "Stolen card",
  pickup_card: "Pick-up card", transaction_not_allowed: "Transaction not allowed", incorrect_cvc: "Incorrect CVC", processing_error: "Processing error",
  try_again_later: "Try again later", card_velocity_exceeded: "Card limit exceeded", withdrawal_count_limit_exceeded: "Withdrawal limit exceeded",
  invalid_account: "Invalid account", restricted_card: "Restricted card", highest_risk_level: "Blocked by Radar", fraudulent: "Fraudulent (issuer)",
  paypal: "PayPal (failed payment)", unknown: "Unknown",
};
const reasonLabel = (r) => REASON[r] || String(r).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const FOUT = [["recovered", "Recovered", "#22c55e"], ["open", "Still retrying", "#f59e0b"], ["lost", "Lost", "#ef4444"]];
// When is how much retried again: next 14 days (discount ladder for insufficient funds + Stripe's own retries)
const RETRY_KIND = [["ladder", "Discount ladder", "#f59e0b"], ["stripe", "Stripe retry", "#4f6df5"]];
function RetryStrip({ r }) {
  const max = Math.max(1, ...r.days.map((d) => d.count));
  return (
    <div style={{ borderTop: "1px solid #f0f2f5", marginTop: "18px", paddingTop: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: "13.5px" }}>Next retries</span>
          <span style={{ fontSize: "12px", color: "#8a92a3", marginLeft: "8px" }}>{r.scheduled} scheduled · {eur(r.amount, 2)}{r.later ? ` · ${r.later} after these 14 days` : ""}{r.none ? ` · ${r.none} open without a new try planned` : ""}{r.paypalOpen ? ` · ${r.paypalOpen} PayPal (PayPal retries itself)` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: "14px", fontSize: "12px", color: "#64748b" }}>
          {RETRY_KIND.map(([k, l, c]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "999px", background: c }} />{l}{k === "ladder" ? ` (${r.ladderTime})` : ""}</span>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(66px, 1fr))", gap: "6px" }}>
        {r.days.map((d, i) => {
          const on = d.count > 0;
          const tip = `${fmtDay(d.d, { weekday: "long", day: "numeric", month: "short" })}: ${d.count} retr${d.count === 1 ? "y" : "ies"}${on ? ` · ${eur(d.amount)} · ${d.ladder} discount ladder${d.labels?.length ? ` (${d.labels.join(" / ")})` : d.pcts.length ? ` (−${d.pcts.join("/−")}%)` : ""} · ${d.stripe} Stripe` : ""}${d.overdue ? ` · ${d.overdue} overdue, picked up at the next run` : ""}`;
          return (
            <div key={d.d} title={tip} style={{ position: "relative", borderRadius: "12px", padding: "8px 8px 9px", textAlign: "center", background: on ? `rgba(79,109,245,${0.05 + 0.1 * (d.count / max)})` : "#fafbfc", border: `1px solid ${i === 0 ? "#0f172a" : on ? "#dfe5fd" : "#f0f2f5"}`, lineHeight: 1.25 }}>
              <div style={{ fontSize: "10.5px", fontWeight: 600, color: i === 0 ? "#0f172a" : "#8a92a3" }}>{i === 0 ? "Today" : fmtDay(d.d, { weekday: "short" })}</div>
              <div style={{ fontSize: "10.5px", color: "#a4adbd", fontFamily: MONO }}>{fmtDay(d.d)}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: on ? "#0f172a" : "#cbd2dc", margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" }}>{on ? d.count : "·"}</div>
              {on && <div style={{ fontSize: "10.5px", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{eur(d.amount, 0)}</div>}
              {on && <div style={{ display: "flex", justifyContent: "center", gap: "3px", marginTop: "5px", flexWrap: "wrap" }}>
                {RETRY_KIND.flatMap(([k, , c]) => Array.from({ length: Math.min(d[k], 8) }, (_, j) => <span key={k + j} style={{ width: "6px", height: "6px", borderRadius: "999px", background: c }} />))}
              </div>}
              {d.overdue > 0 && <span style={{ position: "absolute", top: "-7px", right: "-5px", background: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: 700, borderRadius: "999px", padding: "1px 6px" }}>{d.overdue} late</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Retries per date: pick a day (default today) → what is/was retried and what came in ---------- */
const addD = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const RES = { paid: ["Paid", "#15803d", "#ecfdf3"], failed: ["Failed again", "#b91c1c", "#fef2f2"], scheduled: ["Scheduled", "#b45309", "#fffbeb"] };
const hhmm = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
function DayRetries({ f }) {
  const pd = f.perDay, r = f.retries || {};
  const [sel, setSel] = useState(pd.today);
  const clamp = (st) => (st < pd.first ? pd.first : addD(st, 13) > pd.last ? addD(pd.last, -13) : st);
  const [start, setStart] = useState(() => clamp(addD(pd.today, -3)));
  const tiles = Array.from({ length: 14 }, (_, i) => addD(start, i));
  const pick = (d) => { if (!d || d < pd.first || d > pd.last) return; setSel(d); if (d < start || d > addD(start, 13)) setStart(clamp(addD(d, -3))); };
  const empty = { items: [], retried: 0, retriedAmount: 0, paid: 0, paidAmount: 0, failed: 0, scheduled: 0, scheduledAmount: 0 };
  const v = pd.days[sel] || empty;
  const isToday = sel === pd.today, future = sel > pd.today;
  const max = Math.max(1, ...tiles.map((d) => { const x = pd.days[d] || empty; return x.retried + x.scheduled; }));
  const btn = { border: "1px solid #e2e6ec", background: "#fff", borderRadius: "9px", padding: "6px 11px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", color: "#334155" };
  return (
    <div style={{ borderTop: "1px solid #f0f2f5", marginTop: "18px", paddingTop: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: "13.5px" }}>Retries per day</span>
          <span style={{ fontSize: "12px", color: "#8a92a3", marginLeft: "8px" }}>{r.scheduled || 0} scheduled · {eur(r.amount || 0, 2)}{r.none ? ` · ${r.none} open without a new try planned` : ""}{r.paypalOpen ? ` · ${r.paypalOpen} PayPal (PayPal retries itself)` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button type="button" style={btn} onClick={() => setStart(clamp(addD(start, -7)))} disabled={start <= pd.first} aria-label="Earlier days">‹</button>
          <input type="date" value={sel} min={pd.first} max={pd.last} onChange={(e) => pick(e.target.value)} style={{ ...btn, fontWeight: 600, fontFamily: "inherit" }} />
          <button type="button" style={btn} onClick={() => setStart(clamp(addD(start, 7)))} disabled={addD(start, 13) >= pd.last} aria-label="Later days">›</button>
          {!isToday && <button type="button" style={{ ...btn, background: "#0f172a", color: "#fff", borderColor: "#0f172a" }} onClick={() => pick(pd.today)}>Today</button>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(58px, 1fr))", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
        {tiles.map((d) => {
          const x = pd.days[d] || empty, on = d === sel, past = d < pd.today, today = d === pd.today;
          const n = x.retried + x.scheduled;
          return (
            <button type="button" key={d} onClick={() => pick(d)} style={{ position: "relative", borderRadius: "12px", padding: "8px 6px 9px", textAlign: "center", cursor: "pointer", font: "inherit", lineHeight: 1.25,
              background: n ? `rgba(79,109,245,${0.04 + 0.1 * (n / max)})` : "#fafbfc", border: `${on ? 2 : 1}px solid ${on ? "#0f172a" : n ? "#dfe5fd" : "#f0f2f5"}`, opacity: past && !n ? 0.7 : 1 }}>
              <div style={{ fontSize: "10.5px", fontWeight: 600, color: on || today ? "#0f172a" : "#8a92a3" }}>{today ? "Today" : fmtDay(d, { weekday: "short" })}</div>
              <div style={{ fontSize: "10.5px", color: "#a4adbd", fontFamily: MONO }}>{fmtDay(d)}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: n ? "#0f172a" : "#cbd2dc", margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" }}>{n || "·"}</div>
              {x.paid > 0 && <div style={{ fontSize: "10.5px", color: "#15803d", fontWeight: 700 }}>{x.paid} paid</div>}
              {!x.paid && x.scheduled > 0 && <div style={{ fontSize: "10.5px", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{eur(x.scheduledAmount, 0)}</div>}
              {!x.paid && !x.scheduled && x.retried > 0 && <div style={{ fontSize: "10.5px", color: "#b91c1c" }}>0 paid</div>}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "16px", border: "1px solid #eef0f4", borderRadius: "14px", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "14px" }}>{fmtDay(sel, { weekday: "long", day: "numeric", month: "long" })}{isToday ? " · today" : ""}</div>
            <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "2px" }}>
              {future ? "Planned retries for this day" : isToday ? `Retried so far today and still planned · discount ladder runs at ${r.ladderTime || "10:10"}` : "What was retried on this day and what came in"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {!future && <NdStat label="Retried" value={v.retried} sub={eur(v.retriedAmount, 0)} />}
            {!future && <NdStat label="Collected" value={v.paid} sub={`${eur(v.paidAmount, 2)}${v.retried ? ` · ${pct(v.paid / v.retried, 0)}` : ""}`} color="#16a34a" />}
            {!future && <NdStat label="Failed again" value={v.failed} sub="still open or next step" color={v.failed ? "#b91c1c" : undefined} />}
            {(isToday || future) && <NdStat label={isToday ? "Still to retry today" : "Scheduled"} value={v.scheduled} sub={eur(v.scheduledAmount, 2)} color="#b45309" />}
          </div>
        </div>
        {v.items.length === 0
          ? <div style={{ fontSize: "13px", color: "#8a92a3", padding: "6px 0" }}>No retries on this day.</div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead><tr>{["Time", "Member", "Retry", "Amount", "Result"].map((h) => <th key={h} style={{ textAlign: h === "Amount" ? "right" : "left", fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", padding: "6px 8px", borderBottom: "1px solid #eef0f4" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {v.items.map((it, i) => {
                    const [rl, rc, rb] = RES[it.result] || RES.scheduled;
                    const time = it.at ? hhmm(it.at) : it.kind === "ladder" ? `≈ ${r.ladderTime || "10:10"}` : "—";
                    return (
                      <tr key={i}>
                        <td style={{ padding: "8px", borderBottom: "1px solid #f3f4f7", fontFamily: MONO, color: "#64748b", whiteSpace: "nowrap" }}>{time}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #f3f4f7" }}><div style={{ fontWeight: 700 }}>{it.name || it.email || "—"}</div>{it.name && it.email && <div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{it.email}</div>}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "7px", height: "7px", borderRadius: "999px", background: it.kind === "ladder" ? "#f59e0b" : "#4f6df5" }} />
                            {it.kind === "ladder" ? `Discount ladder${it.label ? ` · ${it.label}` : it.pct ? ` · −${it.pct}%` : ""}` : "Stripe retry"}</span>
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #f3f4f7", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{eur(it.amount, 2)}</td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap" }}>
                          <span style={{ background: rb, color: rc, fontWeight: 700, fontSize: "11px", padding: "3px 8px", borderRadius: "999px" }}>{rl}</span>
                          {it.result === "failed" && it.reason && <span style={{ fontSize: "11.5px", color: "#8a92a3", marginLeft: "8px" }}>{reasonLabel(it.reason)}</span>}
                          {it.overdue && <span style={{ fontSize: "11px", color: "#b91c1c", marginLeft: "8px", fontWeight: 700 }}>late — next run</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
        <div style={{ fontSize: "11.5px", color: "#a4adbd", marginTop: "10px" }}>Card rebills only (Stripe retries + discount ladder). PayPal retries failed rebills itself and is not included. Ladder times are approximate (daily run).</div>
      </div>
    </div>
  );
}

function FailedRebills({ f }) {
  if (!f) return null;
  const max = Math.max(1, ...f.byReason.map((b) => b.count));
  const rate = f.total ? f.recovered / f.total : null;
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", marginBottom: "14px" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "15px" }}>Failed rebills · last 30 days</div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "2px" }}>Every rebill where at least one charge failed — also the ones collected later · {f.stripe} card · {f.paypal} PayPal{f.ladder ? ` · ${f.ladder} in the discount ladder` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <NdStat label="Failed" value={f.total} sub={`${eur(f.amount, 0)} at stake`} color={f.total ? "#dc2626" : undefined} />
          <NdStat label="Recovered" value={f.recovered} sub={`${eur(f.recoveredAmount, 0)} · ${rate == null ? "—" : pct(rate, 0)}`} color="#16a34a" />
          <NdStat label="Still retrying" value={f.open} sub="open invoices" color="#b45309" />
          <NdStat label="Lost" value={f.lost} sub="voided / cancelled" />
        </div>
      </div>
      {f.byReason.length === 0 && <div style={{ fontSize: "13px", color: "#8a92a3" }}>No failed rebills in the last 30 days.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 230px) 1fr auto", columnGap: "14px", rowGap: "10px", alignItems: "center" }}>
        {f.byReason.map((b) => (
          <React.Fragment key={b.reason}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.reason}>{reasonLabel(b.reason)}</div>
            <div style={{ display: "flex", gap: "2px", height: "14px", width: `${Math.max(4, (b.count / max) * 100)}%` }} title={FOUT.map(([k, l]) => `${l}: ${b[k]}`).join(" · ")}>
              {FOUT.filter(([k]) => b[k]).map(([k, , c], i, arr) => <div key={k} style={{ flex: b[k], background: c, borderRadius: `${i === 0 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`, minWidth: "3px" }} />)}
            </div>
            <div style={{ fontSize: "12.5px", color: "#475569", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textAlign: "right" }}><b style={{ color: "#0f172a" }}>{b.count}</b>{b.recovered ? <span style={{ color: "#16a34a" }}> · {b.recovered} recovered</span> : null}{b.open ? <span style={{ color: "#b45309" }}> · {b.open} retrying</span> : null}{b.lost ? <span style={{ color: "#dc2626" }}> · {b.lost} lost</span> : null}</div>
          </React.Fragment>
        ))}
      </div>
      {f.byReason.length > 0 && <div style={{ display: "flex", gap: "16px", marginTop: "14px", fontSize: "12px", color: "#64748b" }}>{FOUT.map(([k, l, c]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: c }} />{l}</span>)}</div>}
      {f.perDay ? <DayRetries f={f} /> : f.retries && <RetryStrip r={f.retries} />}
    </div>
  );
}


export default function Subscriptions() {
  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("jj-members-open") === "1") setListOpen(true); } catch {} }, []);
  const toggleList = () => setListOpen((v) => { try { localStorage.setItem("jj-members-open", v ? "0" : "1"); } catch {} return !v; });
  const [clock, setClock] = useState("");
  useEffect(() => { const t = () => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Brussels" })); t(); const i = setInterval(t, 1000); return () => clearInterval(i); }, []);

  // Fast first paint: the shared cache (≤ 30 min old) shows right away, then a live update replaces it in the background
  const [updating, setUpdating] = useState(false);
  const seq = useRef(0);
  const load = (r, { fresh = false } = {}) => {
    const id = ++seq.current;
    const get = (q) => fetch(`/api/subscriptions?range=${r}${q}`).then((x) => x.json());
    const live = (q) => { setUpdating(true); get(q).then((d) => { if (id === seq.current) { if (d.success) setData(d); else if (fresh) setErr(d.error || "Error"); } }).catch(() => {}).finally(() => { if (id === seq.current) setUpdating(false); }); };
    setErr("");
    if (fresh) return live("&fresh=1");
    setData(null);
    get("&cached=1").then((d) => {
      if (id !== seq.current) return;
      if (!d.success) { setErr(d.error || "Error"); return; }
      setData(d);
      if (d.cached && Date.now() - Date.parse(d.cachedAt) > 60000) live("");
    }).catch((e) => { if (id === seq.current) setErr(e.message); });
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
  const cmpLabel = cmp ? (cmp.sameTime ? "vs. yesterday, same time" : "vs. the day before") : null;
  const isHour = data?.chart?.granularity === "hour";

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "22px" }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Membership</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Health For Life · 7-day trial, then {eur(data?.price ?? 49)} every 28 days{data ? ` · data from ${new Date(data.cachedAt || data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}{updating ? " · updating…" : ""}</div></div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {RANGES.map(([x, l]) => <button key={x} style={ui.btn(range === x)} onClick={() => setRange(x)}>{l}</button>)}
          <span style={{ width: "1px", height: "20px", background: "#e2e6ec", margin: "0 6px" }} />
          <button style={ui.btn(false)} onClick={() => load(range, { fresh: true })} disabled={updating}>{updating ? "Updating…" : "Refresh"}</button>
        </div>
      </div>

      {err && <div style={{ ...ui.card, padding: "16px", color: "#991b1b", marginBottom: "16px" }}>{err}</div>}
      {!data && !err && <div style={{ color: "#b6bdc9", fontSize: "13px" }}>Loading… (Stripe, PayPal, Shopify and Meta are fetched live)</div>}

      {k && (
        <>
          {/* ===== chart: rebills (blue) within total revenue (green) ===== */}
          <div style={{ ...ui.card, padding: "16px 16px 6px 16px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "2px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>Rebill revenue {isHour ? "per hour" : "per day"}</span>{cmp && <Change now={k.rebillRevenue.period} prev={cmp.rebillRevenue} />}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.4px", marginTop: "2px" }}>{eur(k.rebillRevenue.period)} <span style={{ fontSize: "13px", fontWeight: 700, color: "#16a34a" }}>· total revenue {eur(k.revenue)}</span>{cmp && <span style={{ marginLeft: "6px" }}><Change now={k.revenue} prev={cmp.revenue} /></span>}</div>
                <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "3px" }}>🕐 Store time {clock} (Brussels) · {k.rebillRevenue.count} rebill{k.rebillRevenue.count === 1 ? "" : "s"} paid · {k.failed.count} failed{live ? ` · ${k.due.open} scheduled today` : ""} · {k.frontEnd.count} front-end order{k.frontEnd.count === 1 ? "" : "s"}</div>
              </div>
              <span style={{ fontSize: "11px", color: "#8a92a3", textAlign: "right", lineHeight: 1.7 }}>
                net rebill profit: <b style={{ color: k.rebillNet >= 0 ? "#16a34a" : "#dc2626" }}>{eur(k.rebillNet)}</b>
                <span style={{ display: "block", color: "#a4adbd" }}><span style={{ color: "#16a34a" }}>─ total revenue (front end + rebills)</span> · <span style={{ color: "#3b82f6" }}>─ rebills</span>{isHour ? <> · ╌ the day before{live ? " · ▲ scheduled" : ""}</> : null}</span>
              </span>
            </div>
            <RebillChart chart={data.chart} live={live} />
          </div>

          {/* ===== large tiles ===== */}
          <Grid cols={3}>
            <BigTile label={`Rebills ${low}`} value={<>{k.rebillRevenue.count}{live ? <span style={{ fontSize: "15px", color: "#64748b", fontWeight: 600 }}> / {k.due.total} scheduled</span> : null}</>}>
              <Chip>✓ {k.rebillRevenue.count} paid</Chip> <Chip tone={k.failed.count ? "red" : "gray"}>✗ {k.failed.count} failed</Chip>{live ? <> {k.due.open} still to collect</> : null}{cmp ? <> · {cmpLabel}: {cmp.rebills}</> : null}
            </BigTile>
            <BigTile label="Total net profit" value={eur(k.netProfit)} valueColor={k.netProfit >= 0 ? "#16a34a" : "#dc2626"}>
              front end {eur(k.frontEnd.revenue)} + rebills {eur(k.rebillRevenue.period)}{k.retryRevenue?.count ? <> (incl. <b style={{ color: "#16a34a" }}>{eur(k.retryRevenue.period)}</b> recovered via retries, {k.retryRevenue.count}×)</> : null} − COGS {eur(k.cogs.frontEnd + k.cogs.rebills)} − fees {eur(k.fees)} − ad spend {eur(k.spend)}{k.spendConfigured ? "" : " (Meta not connected)"} · <b>{pct(k.profitPct)}</b> margin
            </BigTile>
            <BigTile label="Net rebill profit" value={eur(k.rebillNet)} valueColor={k.rebillNet >= 0 ? "#16a34a" : "#dc2626"}>
              revenue {eur(k.rebillRevenue.period)} − fees {eur(k.rebillFees)} − free products shipped {eur(k.cogs.rebills)} · <b>{pct(k.rebillMargin)}</b> margin
            </BigTile>
          </Grid>

          {/* ===== new subscribers · 7-day projection · cancellations ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <BigTile label={`New subscribers ${low}`} value={k.newSubscribers.period} valueColor="#4f6df5">
              {cmp ? <><Change now={k.newSubscribers.period} prev={cmp.newMembers} /> {cmpLabel}: {cmp.newMembers} · </> : null}{k.newSubscribers.trialNow} members in trial now{range !== "today" ? ` · today ${k.newSubscribers.today}` : ""}
            </BigTile>
            <BigTile label="Projection next 7 days" value={eur(k.projection.amount)} valueColor="#16a34a">
              {k.projection.existing.count} scheduled rebills ({eur(k.projection.existing.amount)}) + {k.projection.newToday.count} new subscribers from today ({eur(k.projection.newToday.amount)}) · through {fmtD(k.projection.until)}
              <div style={{ marginTop: "4px" }}>realistic: <b style={{ color: "#0f172a" }}>{eur(k.projection.expected)}</b> <span style={{ color: "#8a92a3" }}>at the current trial → paid conversion of {pct(k.projection.trialRate, 0)}{k.projection.rebillRate != null ? `, later rebills ${pct(k.projection.rebillRate, 0)}` : ""}</span></div>
            </BigTile>
            <BigTile label="Cancellations" value={<>{k.cancellations.total}<span style={{ fontSize: "15px", color: "#64748b", fontWeight: 600 }}> since launch</span></>} valueColor="#dc2626">
              <Chip tone={k.cancellations.period ? "red" : "gray"}>{k.cancellations.period} {low}</Chip>{k.cancellations.pending ? <> <Chip tone="amber">{k.cancellations.pending} ending after this cycle</Chip></> : null} · {k.cancellations.inTrial} during trial · {k.cancellations.afterRebill} after a rebill{k.cancellations.paymentFailed ? ` · ${k.cancellations.paymentFailed} due to failed payment` : ""}{k.cancellations.avgDays != null ? ` · avg. after ${num1(k.cancellations.avgDays)} days` : ""}
            </BigTile>
          </div>

          {/* ===== small tiles ===== */}
          <Grid mb={20}>
            <Tile label="Rebill success rate" value={k.failed.attempts ? pct(1 - k.failed.rate, 0) : "—"} sub={`${k.rebillRevenue.count} of ${k.failed.attempts} attempts · ${low}`} />
            <Tile label="Failed" value={k.failed.count} accent={k.failed.count ? "#ef4444" : undefined} sub={`${eur(k.failed.amount)} open · ${k.failed.inRecovery} in recovery flow · ${k.failed.recovered} recovered`} />
            <Tile label={live ? "Due today" : "Still to collect"} value={k.due.open} sub={`${eur(k.due.openAmount)} · ${k.due.stripe} Stripe · ${k.due.paypal} PayPal`} />
            <Tile label="Active MRR" value={eur(k.mrr)} sub={`${k.activeSubscribers} subscribers × ${eur(data.price)} / 28 d · ${k.active} paying + ${k.trial} in trial${k.problem ? ` · ${k.problem} payment issue${k.problem === 1 ? "" : "s"}` : ""}`} accent="#4f6df5" />
          </Grid>

          <DueToday rows={data.dueToday || []} />

          <NextDays days={data.upcoming} />

          <FailedRebills f={data.failed30} />


          <div style={{ ...ui.card, padding: "18px 22px", marginBottom: "12px" }}>
            {/* collapsible member list: header always visible, list on demand (state remembered per browser) */}
            <div role="button" tabIndex={0} aria-expanded={listOpen} onClick={() => toggleList()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleList(); } }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none", margin: "-4px 0", padding: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: "15px" }}>Members</span>
                <span style={{ fontSize: "12px", color: "#8a92a3" }}>{data.members.length} total · {data.members.filter((m) => m.status === "trial").length} in trial · {data.members.filter((m) => m.status === "active").length} paying · {data.members.filter((m) => m.status === "canceled").length} cancelled{data.members.some((m) => m.status === "problem") ? ` · ${data.members.filter((m) => m.status === "problem").length} payment issues` : ""}</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: "#334155", padding: "6px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: listOpen ? "#fff" : "#f7f8fb", whiteSpace: "nowrap" }}>
                {listOpen ? "Hide list" : "Show list"}
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: listOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </div>
            {listOpen && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", margin: "16px 0 14px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {FILTERS.map(([key, l]) => <button key={key} style={ui.btn(filter === key)} onClick={() => setFilter(key)}>{l} {key === "all" ? data.members.length : data.members.filter((m) => m.status === key).length}</button>)}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, order…" style={{ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", fontSize: "12.5px", width: "220px", outline: "none" }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Member", "Via", "Status", "Started", "Trial ends", "Next charge", "Front-end order", "Actions"].map((h) => <th key={h} style={ui.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...ui.td, whiteSpace: "normal", minWidth: "150px" }}><div style={{ fontWeight: 700 }}>{m.name || "—"}</div><div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{m.email}{m.order?.city ? ` · ${m.order.city}` : ""}</div></td>
                      <td style={ui.td}>{m.provider === "paypal" ? "PayPal" : "Card"}</td>
                      <td style={{ ...ui.td, whiteSpace: "normal", minWidth: "110px" }}><Pill s={m.status} cancelPending={m.cancelAtPeriodEnd} />{m.status === "canceled" && m.canceledAt && <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "3px" }}>{fmtDY(m.canceledAt)}</div>}{m.status === "paused" && m.pausedUntil && <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "3px" }}>until {fmtDY(m.pausedUntil)}</div>}{m.csCancellation && <CancellationInfo c={m.csCancellation} compact />}</td>
                      <td style={ui.td}>{fmtDY(m.startedAt)}</td>
                      <td style={{ ...ui.td, color: m.status === "trial" ? "#854d0e" : "#8a92a3" }}>{fmtD(m.trialEnd)}</td>
                      <td style={ui.td}>{m.status === "canceled" ? "—" : m.status === "paused" ? (m.pausedUntil ? `after ${fmtD(m.pausedUntil)}` : "paused") : fmtD(m.nextBilling)}</td>
                      <td style={ui.td}>{m.order ? <><a href={`https://admin.shopify.com/store/${data.storeHandle}/orders/${m.order.id}`} target="_blank" rel="noreferrer" style={{ color: "#4f6df5", fontWeight: 700, textDecoration: "none" }}>{m.order.name}</a><div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{m.order.bundle} · {eur(m.order.net)}{m.order.refunded ? ` · refund ${eur(m.order.refunded)}` : ""}</div></> : <span style={{ color: "#b6bdc9" }}>no order</span>}</td>
                      <td style={ui.td}><MemberActionButtons m={m} onChanged={() => setTimeout(() => load(range), 1500)} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={8} style={{ ...ui.td, color: "#8a92a3" }}>No members in this selection.</td></tr>}
                </tbody>
              </table>
            </div>
            </>}
          </div>
          <p style={{ fontSize: "11.5px", color: "#b6bdc9" }}>Live from Stripe, PayPal, Shopify (orders tagged subscription-frontend) and Meta ({k.campaigns?.length || 0} campaigns behind these orders). Period {data.from} to {data.to} · data from {new Date(data.cachedAt || data.generatedAt).toLocaleTimeString("en-GB")}{data.cached ? " (shared cache)" : ""}.</p>
        </>
      )}
    </div>
  );
}
