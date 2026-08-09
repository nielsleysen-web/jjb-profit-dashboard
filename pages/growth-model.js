// pages/growth-model.js
// Growth Model — de funnelhypothese gemeten met echte data (Meta + Shopify + launch tasks).
// Toont aannames uit het model naast de gemeten werkelijkheid, plus de checkpoints.

import { useState, useEffect } from "react";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const ui = {
  page: {
    padding: "28px 36px",
    background: "#f7f8fa",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #eceef2",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#8a92a3",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
  },
};

const CHECKPOINTS = [
  {
    date: "2026-08-29",
    label: "Aug 29 — Process check",
    text: "Count live winners, not profit. 3-4 live = the machine works. 1 live = something is broken in the pipeline, not the strategy. Also verify: are we really shipping 18/week, and is written → revenue really ~2 weeks?",
  },
  {
    date: "2026-09-15",
    label: "Sep 15 — First hit rate verdict",
    text: "~60 funnels tested. Did the measured swipe hit rate rise after raising the test gate €30 → €60? Split Own Writes vs Swipes. Before this date the hit rate numbers are noise.",
  },
  {
    date: "2026-09-30",
    label: "Sep 30 — Strategy verdict",
    text: "~90 funnels tested. Compare measured lifespan against the assumed 6 weeks (own) and 4 weeks (swipe). Lifespan weighs exactly as heavy as hit rate in the steady state.",
  },
];

const fmtEur = (v) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

const fmtDay = (d) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

export default function GrowthModel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();

  const load = async (refresh) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/growth-model${refresh ? "?refresh=1" : ""}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error);
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  if (loading)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#8a92a3" }}>Crunching Meta + Shopify data… this can take a minute on first load.</p>
      </div>
    );
  if (error)
    return (
      <div style={ui.page}>
        <p style={{ color: "#dc2626" }}>Error: {error}</p>
        <a onClick={() => load(true)} style={{ color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>Try again</a>
      </div>
    );
  if (!data) return null;

  const t = data.totals;
  const own = data.bySource["Own Write"];
  const swipe = data.bySource["Swipe"];
  const a = data.assumptions;
  const today = new Date().toISOString().split("T")[0];
  const smallN = (n) => n != null && n < 40;

  const Stat = ({ label, value, sub, accent, warn }) => (
    <div style={{ ...ui.card, padding: "18px 20px" }}>
      <div style={ui.label}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "6px", color: accent || "#0f172a" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: warn ? "#b45309" : "#8a92a3", marginTop: "4px" }}>{sub}</div>}
    </div>
  );

  const verdictChip = (f) => {
    const map = {
      winner: f.alive
        ? { text: "● LIVE WINNER", bg: "#f0fdf4", color: "#16a34a" }
        : { text: "WINNER (ended)", bg: "#f1f5f9", color: "#475569" },
      loser: { text: "LOSER", bg: "#fef2f2", color: "#dc2626" },
      testing: { text: "TESTING", bg: "#fffbeb", color: "#b45309" },
    };
    const c = map[f.verdict];
    return (
      <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: c.bg, color: c.color, whiteSpace: "nowrap" }}>
        {c.text}
      </span>
    );
  };

  const cellR = { padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "6px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>📈 Growth Model</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "#8a92a3" }}>
            Data: {fmtDay(data.windowFrom)} – {fmtDay(data.windowTo)} · built {new Date(data.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid #d7dce3", background: "#ffffff", fontWeight: 600, fontSize: "13px", cursor: refreshing ? "default" : "pointer" }}
          >
            {refreshing ? "Refreshing…" : "⟳ Refresh data"}
          </button>
        </div>
      </div>
      <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#8a92a3" }}>
        Hypothesis vs. reality — steady state = winners per week × lifespan. Winner = CPA under €{data.settings.WINNER_CPA} after the test gate
        (€{data.settings.GATE_SWIPE} swipe / €{data.settings.GATE_OWN} own write).
      </p>

      {t.missingSource > 0 && (
        <div style={{ ...ui.card, padding: "12px 16px", marginBottom: "16px", background: "#fffbeb", border: "1px solid #fde68a", fontSize: "13px", color: "#92400e" }}>
          ⚠ {t.missingSource} funnel{t.missingSource > 1 ? "s have" : " has"} no Source set on the launch task (Own Write / Swipe). Set it in the Product
          Pipeline — without it the hit rate per source can&apos;t be measured.
        </div>
      )}

      {/* Kerngetallen */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? "10px" : "16px", marginBottom: "16px" }}>
        <Stat
          label="Live winners"
          value={t.liveWinners}
          accent={t.liveWinners >= 3 ? "#16a34a" : "#b45309"}
          sub="Aug 29 target: 3-4 = the machine works"
        />
        <Stat label="Winners / week (4-wk avg)" value={t.winnersPerWeek4wkAvg} sub={`model expects ${(a.hitrate * (a.ownPerWeek + a.swipesPerWeek)).toFixed(1)} at 20% hit rate`} />
        <Stat label="Test burn (30d)" value={fmtEur(t.testburn30d)} sub="spend on losers — the portfolio cost" />
        <Stat
          label="Avg profit / live winner / day"
          value={t.avgProfitPerLiveWinnerDay != null ? fmtEur(t.avgProfitPerLiveWinnerDay) : "—"}
          sub={`model assumes ${fmtEur(a.profitPerWinnerDay)} at peak · excl. payment fees`}
        />
      </div>

      {/* Aanname vs meting per bron */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? "10px" : "16px", marginBottom: "16px" }}>
        <div style={{ ...ui.card, padding: "18px 20px" }}>
          <div style={ui.label}>Hit rate — Own Writes</div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "6px" }}>
            {own.hitrate != null ? `${own.hitrate}%` : "—"}
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#8a92a3" }}> · n={own.tested}</span>
          </div>
          <div style={{ fontSize: "12px", color: smallN(own.tested) ? "#b45309" : "#8a92a3", marginTop: "4px" }}>
            {smallN(own.tested) ? `noise until ~40 tests — no conclusions before Sep 15` : `assumption: 20% · originals already beat swipes from 13.3%`}
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "6px" }}>
            {own.winners} winners / {own.losers} losers · {own.testing} still testing · lifespan {own.avgLifespanDays != null ? `${own.avgLifespanDays}d measured` : "not yet measured"} vs {a.lifespanOwnWeeks * 7}d assumed
          </div>
        </div>
        <div style={{ ...ui.card, padding: "18px 20px" }}>
          <div style={ui.label}>Hit rate — Swipes</div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "6px" }}>
            {swipe.hitrate != null ? `${swipe.hitrate}%` : "—"}
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#8a92a3" }}> · n={swipe.tested}</span>
          </div>
          <div style={{ fontSize: "12px", color: smallN(swipe.tested) ? "#b45309" : "#8a92a3", marginTop: "4px" }}>
            {smallN(swipe.tested) ? `noise until ~40 tests — no conclusions before Sep 15` : `after gate €30→€60 the model predicts 22-24%`}
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "6px" }}>
            {swipe.winners} winners / {swipe.losers} losers · {swipe.testing} still testing · lifespan {swipe.avgLifespanDays != null ? `${swipe.avgLifespanDays}d measured` : "not yet measured"} vs {a.lifespanSwipeWeeks * 7}d assumed
          </div>
        </div>
        <div style={{ ...ui.card, padding: "18px 20px" }}>
          <div style={ui.label}>Decay & CPA</div>
          <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "6px" }}>
            {t.avgDecayPct != null ? `${t.avgDecayPct}%` : "—"}
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#8a92a3" }}> of peak</span>
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "4px" }}>
            avg daily profit as % of peak (winners ≥7 days) · model assumes {Math.round(a.decayPctOfPeak * 100)}%
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "6px" }}>
            Avg CPA winners: own {own.avgCpaWinners != null ? `€${own.avgCpaWinners}` : "—"} · swipe {swipe.avgCpaWinners != null ? `€${swipe.avgCpaWinners}` : "—"} — this number sets the optimal gate (€12 → €60, €18 → €75)
          </div>
        </div>
      </div>

      {/* Checkpoints */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? "10px" : "16px", marginBottom: "16px" }}>
        {CHECKPOINTS.map((c) => {
          const passed = today > c.date;
          const isNext = !passed && CHECKPOINTS.filter((x) => today <= x.date)[0]?.date === c.date;
          return (
            <div key={c.date} style={{ ...ui.card, padding: "16px 18px", opacity: passed ? 0.55 : 1, border: isNext ? "2px solid #2563eb" : ui.card.border }}>
              <div style={{ ...ui.label, color: isNext ? "#2563eb" : ui.label.color }}>{isNext ? "◉ NEXT — " : passed ? "✓ " : ""}{c.label}</div>
              <p style={{ margin: "8px 0 0 0", fontSize: "12.5px", color: "#475569", lineHeight: 1.55 }}>{c.text}</p>
            </div>
          );
        })}
      </div>

      {/* Funnel-tabel */}
      <div style={{ ...ui.card, padding: isMobile ? "16px 12px" : "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#334155" }}>
          Funnels — {t.funnelsTracked} with ad spend in the last {data.settings.LOOKBACK_DAYS} days
        </h2>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["Product", "Source", "Verdict", "First spend", "Last spend", "Days", "Spend", "Orders", "CPA", "Profit"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: i <= 2 ? "left" : "right", ...ui.label, borderBottom: "1px solid #eceef2" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.funnels.length ? (
                data.funnels.map((f, idx) => (
                  <tr key={f.taskId + idx} style={{ borderBottom: idx < data.funnels.length - 1 ? "1px solid #f4f5f7" : "none" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{f.name}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {f.source === "Unknown" ? <span style={{ color: "#b45309", fontSize: "12px" }}>⚠ not set</span> : f.source}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{verdictChip(f)}</td>
                    <td style={cellR}>{fmtDay(f.firstSpendDay)}</td>
                    <td style={cellR}>{fmtDay(f.lastSpendDay)}</td>
                    <td style={cellR}>{f.lifespanDays}</td>
                    <td style={cellR}>{fmtEur(f.spend)}</td>
                    <td style={cellR}>{f.orders}</td>
                    <td style={cellR}>{f.cpa != null ? `€${f.cpa.toFixed(2)}` : "—"}</td>
                    <td style={{ ...cellR, fontWeight: 700, color: f.profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmtEur(f.profit)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                    No funnels with matched ad spend yet. Campaign names must contain the product name.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ margin: "14px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Launch &amp; kill dates come straight from Meta daily spend (first / last day with spend) — nothing to log manually. CPA uses real Shopify
          orders, not the pixel. Profit = revenue − COGS − ad spend (incl. 2.5% supplier fee), excl. payment fees. Set Source on each launch task —
          that&apos;s the only manual input this page needs.
        </p>
      </div>
    </div>
  );
}
