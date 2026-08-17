// pages/attribution.js
// Ad Attribution — first-party tracking dashboard in Ads Manager-stijl.
// Tabs Campaigns / Ad sets / Ads, checkbox-selectie filtert het volgende niveau,
// totaalrij onderaan. Purchases/Revenue/ROAS/AOV = first-party (jjb-track, exact
// ad-ID); Budget/Spend/Clicks/CPM/Checkouts = Meta.
// Standaard alleen "tracked" campagnes (≥1 first-party attributed order) — de
// campagnes met de nieuwe tracking-installatie. Toggle toont alles.

import { useState, useEffect, useRef } from "react";

const ui = {
  page: { padding: "24px 28px", background: "#f0f2f5", minHeight: "100vh", fontFamily: '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif', color: "#1c2b33" },
  panel: { background: "#fff", borderRadius: "8px", border: "1px solid #dadde1", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" },
  statlabel: { fontSize: "11px", fontWeight: 600, color: "#65676b", textTransform: "uppercase", letterSpacing: "0.5px" },
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
  { key: 1, label: "Today" },
  { key: 7, label: "Last 7 days" },
  { key: 14, label: "Last 14 days" },
  { key: 30, label: "Last 30 days" },
];

const eur = (v) => "€" + (v || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const roasColor = (r) => (r >= 1.5 ? "#31a24c" : r >= 1 ? "#f7981c" : "#e41e3f");

export default function Attribution() {
  const isMobile = useIsMobile();
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState("campaign"); // campaign | adset | ad
  const [selC, setSelC] = useState([]); // geselecteerde campagne-ID's
  const [selS, setSelS] = useState([]); // geselecteerde adset-ID's
  const [onlyTracked, setOnlyTracked] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const load = async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/attribution?days=${days}`).then((x) => x.json());
      if (!r.success) throw new Error(r.error || "Could not load attribution data");
      setData(r);
      setError("");
    } catch (e) {
      if (!silent) setError(e.message);
    }
    setLoading(false);
    inFlight.current = false;
  };

  useEffect(() => {
    load();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (loading && !data)
    return <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#65676b" }}>Loading attribution…</span></div>;

  const orders = data?.orders || [];
  const ads = data?.ads || {};
  const budgets = data?.budgets || { campaigns: {}, adsets: {} };

  /* ---------- hiërarchie opbouwen: campagnes → adsets → ads ---------- */
  const emptyMetrics = () => ({ spend: 0, impressions: 0, clicks: 0, checkouts: 0, purchases: 0, revenue: 0 });
  const campaigns = {};
  const ensure = (map, id, name) => {
    if (!map[id]) map[id] = { id, name: name || "", ...emptyMetrics(), children: {} };
    if (name && !map[id].name) map[id].name = name;
    return map[id];
  };

  // 1. Meta-insights per ad (spend, clicks, ...)
  for (const [adId, a] of Object.entries(ads)) {
    const c = ensure(campaigns, a.campaignId || "unknown", a.campaignName);
    const s = ensure(c.children, a.adsetId || "unknown", a.adsetName);
    const ad = ensure(s.children, adId, a.adName);
    for (const lvl of [c, s, ad]) {
      lvl.spend += a.spend || 0;
      lvl.impressions += a.impressions || 0;
      lvl.clicks += a.outboundClicks || 0;
      lvl.checkouts += a.checkouts || 0;
    }
  }
  // 2. First-party purchases/revenue uit de orders
  const attributed = orders.filter((o) => o.adId || o.fbclid || o.fbc);
  const unattributed = orders.filter((o) => !(o.adId || o.fbclid || o.fbc));
  for (const o of attributed) {
    if (!o.campaignId && !o.adId) continue; // wel facebook, maar geen ID's (oude ads zonder parameters)
    const c = ensure(campaigns, o.campaignId || "unknown", o.utmCampaign);
    const s = ensure(c.children, o.adsetId || "unknown", "");
    const ad = ensure(s.children, o.adId || "unknown", o.utmContent);
    for (const lvl of [c, s, ad]) {
      lvl.purchases += 1;
      lvl.revenue += o.value || 0;
    }
  }

  // "Tracked" = campagnes met ≥1 first-party attributed order (nieuwe tracking-installatie)
  const trackedIds = new Set(Object.values(campaigns).filter((c) => c.purchases > 0).map((c) => c.id));
  let visC = Object.values(campaigns).filter((c) => (onlyTracked ? trackedIds.has(c.id) : true));

  const pickedC = selC.length ? visC.filter((c) => selC.includes(c.id)) : visC;
  const allSets = pickedC.flatMap((c) => Object.values(c.children).map((s) => ({ ...s, campaignName: c.name })));
  const pickedS = selS.length ? allSets.filter((s) => selS.includes(s.id)) : allSets;
  const allAds = pickedS.flatMap((s) => Object.values(s.children).map((a) => ({ ...a, adsetName: s.name, campaignName: s.campaignName })));

  const items = tab === "campaign" ? visC : tab === "adset" ? allSets : allAds;
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);

  /* ---------- kerncijfers ---------- */
  const attributedRevenue = attributed.reduce((s, o) => s + (o.value || 0), 0);
  const totalRevenue = orders.reduce((s, o) => s + (o.value || 0), 0);
  const totalSpend = visC.reduce((s, c) => s + c.spend, 0);
  const attributionRate = orders.length ? Math.round((attributed.length / orders.length) * 100) : 0;

  /* ---------- helpers ---------- */
  const budgetLabel = (it) => {
    if (tab === "campaign") return budgets.campaigns[it.id] ? `${budgets.campaigns[it.id]} (CBO)` : "Ad set budget";
    if (tab === "adset") return budgets.adsets[it.id] || "Campaign budget";
    return "—";
  };
  const toggleSel = (id) => {
    if (tab === "campaign") {
      setSelC((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
      setSelS([]);
    } else if (tab === "adset") {
      setSelS((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    }
  };
  const nameClick = (id) => {
    if (tab === "campaign") {
      if (!selC.includes(id)) setSelC((p) => [...p, id]);
      setSelS([]);
      setTab("adset");
    } else if (tab === "adset") {
      if (!selS.includes(id)) setSelS((p) => [...p, id]);
      setTab("ad");
    }
  };

  const chip = (active) => ({ padding: "7px 14px", borderRadius: "6px", border: active ? "1px solid #1b74e4" : "1px solid #ced0d4", background: active ? "#e7f3ff" : "#fff", color: active ? "#1b74e4" : "#1c2b33", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
  const tabStyle = (t) => ({ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px 12px 16px", fontSize: "13.5px", fontWeight: 600, color: tab === t ? "#1b74e4" : "#65676b", cursor: "pointer", borderBottom: tab === t ? "3px solid #1b74e4" : "3px solid transparent" });
  const th = { padding: "9px 10px", textAlign: "right", fontSize: "11.5px", fontWeight: 600, color: "#65676b", background: "#f5f6f7", borderBottom: "1px solid #dadde1", borderRight: "1px solid #ebedf0", whiteSpace: "nowrap" };
  const td = { padding: "10px 10px", textAlign: "right", borderBottom: "1px solid #ebedf0", borderRight: "1px solid #f3f4f6", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: "12.5px" };
  const badge = (count, clear) =>
    count > 0 ? (
      <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#1b74e4", background: "#e7f3ff", padding: "2px 8px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
        {count} selected <b style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); clear(); }}>✕</b>
      </span>
    ) : null;

  /* ---------- totalen van de zichtbare rijen ---------- */
  const tot = sorted.reduce(
    (t, it) => ({ spend: t.spend + it.spend, impressions: t.impressions + it.impressions, clicks: t.clicks + it.clicks, checkouts: t.checkouts + it.checkouts, purchases: t.purchases + it.purchases, revenue: t.revenue + it.revenue }),
    emptyMetrics()
  );
  const totRoas = tot.spend > 0 ? tot.revenue / tot.spend : 0;

  const metricCells = (it) => {
    const roas = it.spend > 0 ? it.revenue / it.spend : 0;
    return (
      <>
        <td style={td}>{eur(it.spend)}</td>
        <td style={td}>{Math.round(it.clicks).toLocaleString()}</td>
        <td style={td}>{it.clicks > 0 ? eur(it.spend / it.clicks) : "—"}</td>
        <td style={{ ...td, fontWeight: 700 }}>{it.purchases}</td>
        <td style={td}>{it.purchases > 0 ? eur(it.spend / it.purchases) : "—"}</td>
        <td style={{ ...td, fontWeight: 700 }}>{eur(it.revenue)}</td>
        <td style={{ ...td, fontWeight: 700, color: it.spend > 0 ? roasColor(roas) : "#8a8d91" }}>{it.spend > 0 ? roas.toFixed(2) : "—"}</td>
        <td style={td}>{it.impressions > 0 ? eur((it.spend / it.impressions) * 1000) : "—"}</td>
        <td style={td}>{it.impressions > 0 ? `${((it.clicks / it.impressions) * 100).toFixed(2)}%` : "—"}</td>
        <td style={td}>{it.purchases > 0 ? eur(it.revenue / it.purchases) : "—"}</td>
        <td style={td}>{Math.round(it.checkouts)}</td>
      </>
    );
  };

  return (
    <div style={{ ...ui.page, padding: isMobile ? "14px" : ui.page.padding }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>🎯 Ad Attribution</h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "12.5px", color: "#65676b" }}>
            First-party tracking — purchases & revenue matched to the exact ad ·{" "}
            {data?.capiEnabled ? <b style={{ color: "#31a24c" }}>CAPI: on</b> : "CAPI: off (WeTracked parallel phase)"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {RANGES.map((r) => (
            <button key={r.key} style={chip(days === r.key)} onClick={() => setDays(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ ...ui.panel, padding: "12px 16px", marginBottom: "14px", color: "#e41e3f", fontSize: "12.5px" }}>{error}</div>}

      {/* Kerncijfers */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <div style={{ ...ui.panel, padding: "14px 18px" }}>
          <div style={ui.statlabel}>Attribution rate</div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px", color: attributionRate >= 70 ? "#31a24c" : attributionRate >= 40 ? "#f7981c" : "#e41e3f" }}>{attributionRate}%</div>
          <span style={{ fontSize: "12px", color: "#8a8d91" }}>{attributed.length} of {orders.length} orders matched</span>
        </div>
        <div style={{ ...ui.panel, padding: "14px 18px" }}>
          <div style={ui.statlabel}>Attributed revenue</div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{eur(attributedRevenue)}</div>
          <span style={{ fontSize: "12px", color: "#8a8d91" }}>of {eur(totalRevenue)} total tracked</span>
        </div>
        <div style={{ ...ui.panel, padding: "14px 18px" }}>
          <div style={ui.statlabel}>Amount spent</div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{eur(totalSpend)}</div>
          <span style={{ fontSize: "12px", color: "#8a8d91" }}>{visC.length} campaign(s) shown</span>
        </div>
        <div style={{ ...ui.panel, padding: "14px 18px" }}>
          <div style={ui.statlabel}>Blended ROAS</div>
          <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{totalSpend > 0 ? (attributedRevenue / totalSpend).toFixed(2) : "—"}</div>
          <span style={{ fontSize: "12px", color: "#8a8d91" }}>attributed revenue / spend</span>
        </div>
      </div>

      <div style={{ ...ui.panel, overflow: "hidden" }}>
        {/* Tabs zoals Ads Manager */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #dadde1", padding: "6px 8px 0 8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={tabStyle("campaign")} onClick={() => setTab("campaign")}>
            <span style={{ width: "22px", height: "22px", borderRadius: "4px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: tab === "campaign" ? "#e7f3ff" : "#e4e6eb" }}>▦</span>
            Campaigns {badge(selC.length, () => { setSelC([]); setSelS([]); })}
          </div>
          <div style={tabStyle("adset")} onClick={() => setTab("adset")}>
            <span style={{ width: "22px", height: "22px", borderRadius: "4px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: tab === "adset" ? "#e7f3ff" : "#e4e6eb" }}>▤</span>
            Ad sets {badge(selS.length, () => setSelS([]))}
          </div>
          <div style={tabStyle("ad")} onClick={() => setTab("ad")}>
            <span style={{ width: "22px", height: "22px", borderRadius: "4px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", background: tab === "ad" ? "#e7f3ff" : "#e4e6eb" }}>▣</span>
            Ads
          </div>
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, color: "#65676b", cursor: "pointer", padding: "0 10px" }}>
            <input type="checkbox" checked={onlyTracked} onChange={(e) => { setOnlyTracked(e.target.checked); setSelC([]); setSelS([]); }} style={{ accentColor: "#1b74e4" }} />
            Only tracked campaigns
          </label>
        </div>

        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1280px" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: "320px" }}>{tab === "campaign" ? "Campaign" : tab === "adset" ? "Ad set" : "Ad"}</th>
                <th style={th}>Budget</th>
                <th style={th}>Amount spent</th>
                <th style={th}>Uniq. outbound clicks</th>
                <th style={th}>Cost / outb. click</th>
                <th style={th}>Purchases</th>
                <th style={th}>Cost / purchase</th>
                <th style={th}>Revenue</th>
                <th style={th}>ROAS</th>
                <th style={th}>CPM</th>
                <th style={th}>Outb. CTR</th>
                <th style={th}>AOV</th>
                <th style={th}>Checkouts init.</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="13" style={{ padding: "36px", textAlign: "center", color: "#8a8d91", fontSize: "13px", borderBottom: "1px solid #ebedf0" }}>
                    {onlyTracked
                      ? "No tracked campaigns in this period yet — they appear as soon as an order comes in through an ad with the new URL parameters. (Uncheck “Only tracked campaigns” to see all Meta campaigns.)"
                      : "No campaigns with spend in this period."}
                  </td>
                </tr>
              ) : (
                <>
                  {sorted.map((it) => {
                    const canSelect = tab !== "ad";
                    const set = tab === "campaign" ? selC : selS;
                    const sub = tab === "adset" ? it.campaignName : tab === "ad" ? [it.campaignName, it.adsetName].filter(Boolean).join(" › ") : "";
                    return (
                      <tr key={it.id}>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            {canSelect ? (
                              <input type="checkbox" checked={set.includes(it.id)} onChange={() => toggleSel(it.id)} style={{ accentColor: "#1b74e4", marginTop: "2px", cursor: "pointer" }} />
                            ) : (
                              <span style={{ width: "13px" }} />
                            )}
                            <div style={{ minWidth: 0 }}>
                              <span
                                style={{ color: "#1b74e4", fontWeight: 600, cursor: canSelect ? "pointer" : "default" }}
                                onClick={() => canSelect && nameClick(it.id)}
                                title={canSelect ? "Click: select + open next level" : ""}
                              >
                                {it.name || `(${tab} ${it.id})`}
                              </span>
                              {sub && <div style={{ fontSize: "11px", color: "#8a8d91", marginTop: "1px" }}>{sub}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={td}>{budgetLabel(it)}</td>
                        {metricCells(it)}
                      </tr>
                    );
                  })}
                  {/* Totaalrij */}
                  <tr>
                    <td style={{ ...td, textAlign: "left", background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>
                      Results from {sorted.length} {tab === "campaign" ? "campaign(s)" : tab === "adset" ? "ad set(s)" : "ad(s)"}
                    </td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>—</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{eur(tot.spend)}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{Math.round(tot.clicks).toLocaleString()}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.clicks > 0 ? eur(tot.spend / tot.clicks) : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.purchases}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.purchases > 0 ? eur(tot.spend / tot.purchases) : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{eur(tot.revenue)}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1", color: tot.spend > 0 ? roasColor(totRoas) : "#8a8d91" }}>{tot.spend > 0 ? totRoas.toFixed(2) : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.impressions > 0 ? eur((tot.spend / tot.impressions) * 1000) : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.impressions > 0 ? `${((tot.clicks / tot.impressions) * 100).toFixed(2)}%` : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{tot.purchases > 0 ? eur(tot.revenue / tot.purchases) : "—"}</td>
                    <td style={{ ...td, background: "#f5f6f7", fontWeight: 700, borderTop: "2px solid #dadde1" }}>{Math.round(tot.checkouts)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ padding: "10px 14px", margin: 0, fontSize: "12px", color: "#8a8d91", borderTop: "1px solid #ebedf0" }}>
          {unattributed.length > 0 && <>⚪ {unattributed.length} order(s) without attribution ({eur(unattributed.reduce((s, o) => s + (o.value || 0), 0))}) — organic, direct, or ads without URL parameters · </>}
          Purchases/Revenue/ROAS/AOV = first-party (jjb-track, exact ad ID) · Budget/Spend/Clicks/CPM/Checkouts = Meta · Last scan:{" "}
          {data?.lastScanAt ? new Date(data.lastScanAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </p>
      </div>
    </div>
  );
}
