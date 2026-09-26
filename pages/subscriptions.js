// pages/subscriptions.js — Membership Dashboard (Health For Life)
// KPI's per periode (geld · rendement), stand van nu, drop-off per cyclus, cohort-retentie
// en de ledenlijst. Bron: /api/subscriptions (Stripe + PayPal + Shopify + Meta).

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
const num = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d }));
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
const Section = ({ children }) => <div style={{ ...ui.label, margin: "8px 0 8px 2px" }}>{children}</div>;
const Grid = ({ cols, children, mb = 12 }) => <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 3 ? 240 : 190}px, 1fr))`, gap: "12px", marginBottom: `${mb}px` }}>{children}</div>;

function Pill({ s, cancelPending }) {
  const [t, bg, fg] = STATUS[s] || [s, "#f1f5f9", "#64748b"];
  return <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: "11.5px", padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>{t}{cancelPending ? " · stopt" : ""}</span>;
}

function Cycles({ cycles }) {
  const base = cycles[0]?.started || 0;
  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "20px" }}>
      <div style={{ marginBottom: "10px" }}><div style={{ fontWeight: 800, fontSize: "15px" }}>Drop-off per cyclus</div><div style={{ fontSize: "12px", color: "#8a92a3" }}>alle abonnees sinds start · proef = eerste 7 dagen, daarna elke 28 dagen · Stripe + PayPal</div></div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Cyclus", "Gestart", "Cyclus afgelopen", "Afgehaakt", "Drop-off %", "Door naar volgende", "Retentie t.o.v. start"].map((h, i) => <th key={h} style={{ ...ui.th, textAlign: i === 0 || i === 6 ? "left" : "center", width: i === 6 ? "28%" : undefined }}>{h}</th>)}</tr></thead>
        <tbody>
          {cycles.map((c) => (
            <tr key={c.k}>
              <td style={{ ...ui.td, fontWeight: 600 }}>{c.label}</td>
              <td style={{ ...ui.td, textAlign: "center" }}>{c.started}</td>
              <td style={{ ...ui.td, textAlign: "center", color: "#8a92a3" }}>{c.ended}{c.pending ? <span style={{ fontSize: "11px" }}> · {c.pending} nog bezig</span> : ""}</td>
              <td style={{ ...ui.td, textAlign: "center", color: "#991b1b", fontWeight: 700 }}>−{c.dropped}</td>
              <td style={{ ...ui.td, textAlign: "center", color: "#991b1b", fontWeight: 700 }}>{pct(c.dropRate)}</td>
              <td style={{ ...ui.td, textAlign: "center" }}>{c.continued}</td>
              <td style={ui.td}><div style={{ height: "8px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden" }}><div style={{ width: `${base ? (c.continued / base) * 100 : 0}%`, height: "100%", background: "#22c55e" }} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [cogsMode, setCogsMode] = useState("fe");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

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

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "22px" }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Membership</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Health For Life · 7 dagen proef, daarna {eur(data?.price ?? 49)} per 28 dagen</div></div>
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
          <Section>{periodLabel} · geld</Section>
          <Grid>
            <Tile label="Netto winst (incl. rebills)" value={eur(k.netProfit)} sub={`omzet − COGS − fees − ad spend${k.spendConfigured ? "" : " (Meta niet gekoppeld)"}`} accent={k.netProfit >= 0 ? "#22c55e" : "#ef4444"} />
            <Tile label={`Orders ${periodLabel.toLowerCase()} (incl. rebills)`} value={k.orders.count} sub={`${eur(k.orders.amount)} · ${k.orders.frontEnd} front-end + ${k.orders.rebills} rebills`} />
            <Tile label="Rebill-omzet totaal" value={eur(k.rebillRevenue.total)} sub={`${k.rebillRevenue.totalCount} afschrijvingen sinds start · ${eur(k.rebillRevenue.period)} in deze periode`} />
            <Tile label={cogsMode === "fe" ? "COGS front-end" : "COGS front-end + rebills"} value={eur(cogsMode === "fe" ? k.cogs.frontEnd : k.cogs.frontEnd + k.cogs.rebills)} sub={cogsMode === "fe" ? `klik: + rebills ${periodLabel.toLowerCase()} → ${eur(k.cogs.frontEnd + k.cogs.rebills)}` : `${eur(k.cogs.frontEnd)} front-end + ${eur(k.cogs.rebills)} rebills (${k.orders.rebills} × ${eur(k.cogs.rebillCogsEach)})`} hint="↻ toggle" onClick={() => setCogsMode(cogsMode === "fe" ? "all" : "fe")} />
            <Tile label="CAC" value={eur(k.cac)} sub={`ad spend ${eur(k.spend)} / ${k.newMembers} nieuwe abonnees`} />
          </Grid>
          <Section>{periodLabel} · rendement</Section>
          <Grid>
            <Tile label="Subscription ROAS" value={num(k.roas)} sub={`(front-end + rebills binnen 7 d${k.roasProjected ? ", deels projectie" : ""}) / ad spend`} accent="#4f6df5" />
            <Tile label="Dag 7 LTV" value={eur(k.ltv7)} sub={`winst/klant ${eur(k.profit7)} · ${k.ltv7Projected ? "projectie op retentie cyclus 1" : "gerealiseerd"}`} />
            <Tile label="Dag 28 LTV" value={eur(k.ltv28)} sub={`winst/klant ${eur(k.profit28)} · ${k.ltv28Projected ? "projectie op retentie cyclus 1" : "gerealiseerd"}`} />
            <Tile label="Churn" value={pct(k.churn)} sub={`${k.canceledTotal} opgezegd / ${k.started} gestart · Stripe + PayPal`} accent="#ef4444" />
            <Tile label="Mislukte rebills" value={k.failed.count} sub={`${pct(k.failed.rate)} van ${k.failed.attempts} pogingen · ${eur(k.failed.amount)}`} accent={k.failed.count ? "#ef4444" : undefined} />
          </Grid>
          <Section>Stand van nu</Section>
          <Grid cols={3} mb={20}>
            <Tile label="Actieve abonnees" value={k.activeSubscribers} sub={`${k.active} betalend · ${k.trial} in proef${k.problem ? ` · ${k.problem} met betaalprobleem` : ""}`} accent="#4f6df5" />
            <Tile label="Actieve MRR" value={eur(k.mrr)} sub={`${k.active} × ${eur(data.price)} per 28 d (${eur(k.recurring28d)}) · genormaliseerd naar 30 dagen`} />
            <Tile label="Opzeggingen" value={k.cancellations.period} sub={`${periodLabel.toLowerCase()} · ${k.cancellations.total} sinds start${k.cancellations.pending ? ` · ${k.cancellations.pending} stoppen na deze cyclus` : ""}`} />
          </Grid>

          <Cycles cycles={data.cycles} />
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
