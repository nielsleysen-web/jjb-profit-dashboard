// pages/launched.js
// Launched overview — funnels and creatives.
// Klik op een rij → volledige taakdetails (alle info van de product pipeline /
// graphic designer / video editor taak, incl. links en activity log). Read-only.
// Winner/Loser categorisation (Ads Manager data) comes in phase 2.

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
};

/* Welke velden we per taaktype tonen in het detailvenster (lege velden worden overgeslagen) */
const FUNNEL_FIELDS = [
  { key: "productName", label: "Product Name" },
  { key: "product", label: "Shopify Product", get: (t) => t.product?.title },
  { key: "marketCountry", label: "Market", get: (t) => (t.marketCountry ? `${t.marketCountry}${t.countryCode ? ` (${t.countryCode})` : ""}` : "") },
  { key: "funnelAngle", label: "Funnel Angle" },
  { key: "source", label: "Source" },
  { key: "gender", label: "Gender" },
  { key: "ageRange", label: "Age Range" },
  { key: "assigneeName", label: "Funnel Builder" },
  { key: "deadline", label: "Deadline" },
  { key: "advertorialLink", label: "Advertorial", type: "url" },
  { key: "funnelWorkspaceLink", label: "Funnel Workspace", type: "url" },
  { key: "funnelishLink", label: "Funnelish", type: "url" },
  { key: "alibabaLink", label: "Alibaba", type: "url" },
  { key: "finalCampaignLink", label: "Final Campaign", type: "url" },
  { key: "launchedDate", label: "Launched", type: "date" },
];

const CREATIVE_FIELDS = [
  { key: "product", label: "Product", get: (t) => t.product?.title },
  { key: "angle", label: "Angle" },
  { key: "market", label: "Market", get: (t) => (t.market ? `${t.market}${t.countryCode ? ` (${t.countryCode})` : ""}` : "") },
  { key: "videoFormat", label: "Video Format" },
  { key: "type", label: "Type" },
  { key: "videoIteration", label: "Iteration" },
  { key: "gender", label: "Gender" },
  { key: "ageRange", label: "Age Range" },
  { key: "strategistName", label: "Creative Strategist" },
  { key: "assigneeName", label: "Video Editor" },
  { key: "deadline", label: "Deadline" },
  { key: "aRoll", label: "A-roll" },
  { key: "aRollAvatarName", label: "Avatar" },
  { key: "voiceName", label: "Voice" },
  { key: "subtitles", label: "Subtitles" },
  { key: "scriptLink", label: "Script", type: "url" },
  { key: "advertorialLink", label: "Advertorial", type: "url" },
  { key: "referenceAd", label: "Reference Ad", type: "url" },
  { key: "inspirationLink", label: "Inspiration", type: "url" },
  { key: "aRollLink", label: "A-roll Link", type: "url" },
  { key: "frameioLink", label: "Frame.io", type: "url" },
  { key: "finalOutputLink", label: "Final Output", type: "url" },
  { key: "launchedDate", label: "Launched", type: "date" },
];

const DESIGN_FIELDS = [
  { key: "product", label: "Product", get: (t) => t.product?.title },
  { key: "angle", label: "Angle" },
  { key: "market", label: "Market", get: (t) => (t.market ? `${t.market}${t.countryCode ? ` (${t.countryCode})` : ""}` : "") },
  { key: "batchType", label: "Batch Type" },
  { key: "iterationType", label: "Iteration Type" },
  { key: "gender", label: "Gender" },
  { key: "ageRange", label: "Age Range" },
  { key: "strategistName", label: "Creative Strategist" },
  { key: "assigneeName", label: "Graphic Designer" },
  { key: "deadline", label: "Deadline" },
  { key: "advertorialLink", label: "Advertorial", type: "url" },
  { key: "referenceAd", label: "Reference Ad", type: "url" },
  { key: "topCompetitorCreative1", label: "Competitor creative 1", type: "url" },
  { key: "topCompetitorCreative2", label: "Competitor creative 2", type: "url" },
  { key: "topCompetitorCreative3", label: "Competitor creative 3", type: "url" },
  { key: "topCompetitorCreative4", label: "Competitor creative 4", type: "url" },
  { key: "topCompetitorCreative5", label: "Competitor creative 5", type: "url" },
  { key: "visualBriefing", label: "Visual Briefing", type: "html" },
  { key: "creativeCopy", label: "Creative Copy (notes)", type: "long" },
  { key: "frameioLink", label: "Frame.io", type: "url" },
  { key: "finalOutputLink", label: "Final Output", type: "url" },
  { key: "launchedDate", label: "Launched", type: "date" },
];

const fmtDate = (v) => {
  try {
    return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(v);
  }
};
const fmtWhen = (v) => {
  try {
    return new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export default function Launched() {
  const [funnels, setFunnels] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // { kind: "funnel"|"creative"|"design", task }
  const [campEdit, setCampEdit] = useState("");   // invulveld Final Campaign Link
  const [campBusy, setCampBusy] = useState(false);
  const [campMsg, setCampMsg] = useState("");

  // Final Campaign Link is het enige veld dat je HIER nog invult (de pipeline-kaart is
  // op dit punt al van het board verdwenen) — de rest blijft read-only.
  const saveCampaignLink = async (task) => {
    setCampBusy(true);
    setCampMsg("");
    try {
      const r = await fetch("/api/launch-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", taskId: task.id, task: { finalCampaignLink: campEdit.trim() } }),
      }).then((x) => x.json());
      if (!r.success) throw new Error(r.error || "Could not save");
      const updated = { ...task, finalCampaignLink: campEdit.trim() };
      setFunnels((list) => list.map((t) => (t.id === task.id ? updated : t)));
      setDetail((d) => (d && d.task.id === task.id ? { ...d, task: updated } : d));
      setCampMsg("✓ Saved");
    } catch (e) {
      setCampMsg(e.message);
    }
    setCampBusy(false);
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/launch-tasks").then((r) => r.json()).catch(() => null),
      fetch("/api/creative-tasks").then((r) => r.json()).catch(() => null),
      fetch("/api/design-tasks").then((r) => r.json()).catch(() => null),
    ])
      .then(([f, c, d]) => {
        if (f?.success) setFunnels(f.tasks);
        if (c?.success) setCreatives(c.tasks);
        if (d?.success) setDesigns(d.tasks);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#8a92a3" }}>Loading…</span></div>;

  const launchedFunnels = funnels.filter((t) => t.status === "Launched").sort((a, b) => (b.launchedDate || "").localeCompare(a.launchedDate || ""));
  const launchedCreatives = creatives.filter((t) => t.status === "Launched").sort((a, b) => (b.launchedDate || "").localeCompare(a.launchedDate || ""));
  // Categorisatie op HERKOMST: een GD-taak die automatisch uit de Product Pipeline is
  // ontstaan (sourceLaunchTaskId) hoort bij "Funnels" — zijn info zit in het detail van
  // de funnel-rij. Alleen taken die rechtstreeks in de Graphic Designer-tab zijn
  // aangemaakt staan onder "Graphic Designer".
  const allLaunchedDesigns = designs.filter((t) => t.status === "Launched").sort((a, b) => (b.launchedDate || "").localeCompare(a.launchedDate || ""));
  const launchedDesigns = allLaunchedDesigns.filter((t) => !t.sourceLaunchTaskId);
  // Randgeval: pipeline-GD-taak is gelanceerd maar de funnel-taak zelf (nog) niet —
  // dan tonen we hem tóch onder Funnels (zijn herkomst), zodat hij nergens verdwijnt.
  const funnelIds = new Set(launchedFunnels.map((t) => t.id));
  const orphanPipelineDesigns = allLaunchedDesigns.filter((t) => t.sourceLaunchTaskId && !funnelIds.has(t.sourceLaunchTaskId));
  const linkedDesignFor = (funnelTask) => designs.find((d) => d.sourceLaunchTaskId === funnelTask.id || d.id === funnelTask.designTaskId) || null;
  const total = launchedFunnels.length + orphanPipelineDesigns.length + launchedCreatives.length + launchedDesigns.length;

  const Row = ({ title, image, sub, by, date, links, onClick }) => (
    <div
      onClick={onClick}
      style={{ ...ui.card, padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", cursor: "pointer", transition: "box-shadow 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 20px rgba(15,23,42,0.10)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = ui.card.boxShadow)}
      title="Click for full task details"
    >
      {image && <img src={image} alt="" style={{ width: "38px", height: "38px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "2px" }}>{sub}</div>}
      </div>
      {(links || []).filter((l) => l.url).map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", padding: "4px 11px", borderRadius: "999px", textDecoration: "none" }}
        >
          {l.label} ↗
        </a>
      ))}
      {by && <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>👤 {by}</span>}
      {date && (
        <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
          🚀 {fmtDate(date)}
        </span>
      )}
      <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", background: "#f1f5f9", padding: "3px 10px", borderRadius: "999px" }}>
        Winner/Loser: pending
      </span>
    </div>
  );

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          ✅ Launched
          <span style={{ marginLeft: "10px", fontSize: "14px", fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "3px 12px", borderRadius: "999px", verticalAlign: "middle" }}>{total}</span>
        </h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Click any row for the full task details · Winner / Loser categorisation coming soon (phase 2)
        </p>
      </div>

      {total === 0 && (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>No launched products yet.</p>
        </div>
      )}

      {(launchedFunnels.length > 0 || orphanPipelineDesigns.length > 0) && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🚀 Funnels ({launchedFunnels.length + orphanPipelineDesigns.length})</h2>
          <div style={{ display: "grid", gap: "10px", marginBottom: "26px" }}>
            {launchedFunnels.map((t) => (
              <Row
                key={t.id}
                title={`${t.productName}${t.countryCode ? ` · ${t.countryCode}` : ""}`}
                sub={t.funnelAngle ? `🎯 ${t.funnelAngle}` : ""}
                by={t.assigneeName}
                date={t.launchedDate}
                links={[
                  { label: "🔗 Alibaba", url: t.alibabaLink },
                  { label: "📣 Campaign", url: t.finalCampaignLink },
                ]}
                onClick={() => { setCampEdit(t.finalCampaignLink || ""); setCampMsg(""); setDetail({ kind: "funnel", task: t }); }}
              />
            ))}
            {orphanPipelineDesigns.map((t) => (
              <Row
                key={t.id}
                title={`${t.product?.title || "Design"}${t.countryCode ? ` · ${t.countryCode}` : ""}`}
                image={t.product?.image}
                sub={t.angle ? `🎯 ${t.angle}` : ""}
                by={t.assigneeName}
                date={t.launchedDate}
                onClick={() => setDetail({ kind: "design", task: t })}
              />
            ))}
          </div>
        </>
      )}

      {launchedCreatives.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🎬 Creatives ({launchedCreatives.length})</h2>
          <div style={{ display: "grid", gap: "10px", marginBottom: "26px" }}>
            {launchedCreatives.map((t) => (
              <Row
                key={t.id}
                title={`${t.product?.title || "Creative"}${t.videoFormat ? ` · ${t.videoFormat}` : ""}`}
                image={t.product?.image}
                sub={t.angle}
                by={t.assigneeName}
                date={t.launchedDate}
                onClick={() => setDetail({ kind: "creative", task: t })}
              />
            ))}
          </div>
        </>
      )}

      {launchedDesigns.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🎨 Graphic Designer ({launchedDesigns.length})</h2>
          <div style={{ display: "grid", gap: "10px" }}>
            {launchedDesigns.map((t) => (
              <Row
                key={t.id}
                title={`${t.product?.title || "Design"}${t.batchType ? ` · ${t.batchType}` : ""}`}
                image={t.product?.image}
                sub={t.angle}
                by={t.assigneeName}
                date={t.launchedDate}
                onClick={() => setDetail({ kind: "design", task: t })}
              />
            ))}
          </div>
        </>
      )}

      {/* ===== Detailvenster: alle taakinformatie, read-only ===== */}
      {detail && (() => {
        const { kind, task } = detail;
        const defs = kind === "funnel" ? FUNNEL_FIELDS : kind === "creative" ? CREATIVE_FIELDS : DESIGN_FIELDS;
        const heading = kind === "funnel" ? `🚀 ${task.productName || "Funnel task"}` : kind === "creative" ? `🎬 ${task.product?.title || "Creative task"}` : `🎨 ${task.product?.title || "Design task"}`;
        const sourceLabel = kind === "funnel" ? "Product Pipeline task" : kind === "creative" ? "Video Editor task" : "Graphic Designer task";
        const activity = (task.activity || []).filter((a) => (a.type === "log" || a.type === "chat") && !a.deleted);
        const rows = defs
          .map((d) => ({ ...d, value: d.get ? d.get(task) : task[d.key] }))
          .filter((d) => d.value != null && String(d.value).trim() !== "");
        // Funnel uit de pipeline: de gekoppelde Graphic Designer-taak toont mee in
        // hetzelfde venster — die staat niet meer als aparte rij in het overzicht.
        const linkedDesign = kind === "funnel" ? linkedDesignFor(task) : null;
        const designRows = linkedDesign
          ? DESIGN_FIELDS.map((d) => ({ ...d, value: d.get ? d.get(linkedDesign) : linkedDesign[d.key] })).filter((d) => d.value != null && String(d.value).trim() !== "")
          : [];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setDetail(null)}>
            <div style={{ ...ui.card, width: "100%", maxWidth: "680px", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {task.product?.image && <img src={task.product.image} alt="" style={{ width: "44px", height: "44px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2" }} />}
                  <div>
                    <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{heading}</h2>
                    <span style={{ fontSize: "11.5px", color: "#8a92a3", fontWeight: 600 }}>{sourceLabel} · read-only</span>
                  </div>
                </div>
                <button onClick={() => setDetail(null)} style={{ border: "1px solid #d7dce3", background: "#fff", borderRadius: "9px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#334155" }}>✕ Close</button>
              </div>

              {(() => {
                const renderField = (d) => (
                  <div key={d.key} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: "12px", padding: "8px 0", borderBottom: "1px solid #f4f5f7", fontSize: "12.5px" }}>
                    <span style={{ fontWeight: 600, color: "#64748b" }}>{d.label}</span>
                    {d.type === "url" ? (
                      <a href={d.value} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 600, overflowWrap: "anywhere" }}>Open ↗ <span style={{ color: "#a4adbd", fontWeight: 400 }}>({String(d.value).slice(0, 60)}{String(d.value).length > 60 ? "…" : ""})</span></a>
                    ) : d.type === "date" ? (
                      <span>{fmtDate(d.value)}</span>
                    ) : d.type === "html" ? (
                      <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "8px", padding: "10px", maxHeight: "220px", overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: d.value }} />
                    ) : d.type === "long" ? (
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "8px", padding: "10px", maxHeight: "220px", overflowY: "auto" }}>{d.value}</pre>
                    ) : (
                      <span style={{ overflowWrap: "anywhere" }}>{String(d.value)}</span>
                    )}
                  </div>
                );
                return (
                  <>
                    <div style={{ marginTop: "14px" }}>{rows.map(renderField)}</div>
                    {designRows.length > 0 && (
                      <div style={{ marginTop: "18px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>
                          🎨 Graphic Designer task{linkedDesign?.status ? ` · ${linkedDesign.status}` : ""}
                        </div>
                        {designRows.map(renderField)}
                      </div>
                    )}
                  </>
                );
              })()}

              {kind === "funnel" && (
                <div style={{ marginTop: "14px", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>📣 Final Campaign Link</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      value={campEdit}
                      onChange={(e) => setCampEdit(e.target.value)}
                      placeholder="https://… (link to the live campaign)"
                      style={{ flex: 1, minWidth: "220px", padding: "9px 12px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", outline: "none" }}
                    />
                    <button
                      onClick={() => saveCampaignLink(task)}
                      disabled={campBusy}
                      style={{ padding: "9px 16px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: 700, cursor: campBusy ? "default" : "pointer", opacity: campBusy ? 0.6 : 1, fontFamily: "inherit" }}
                    >
                      {campBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {campMsg && <div style={{ marginTop: "6px", fontSize: "11.5px", fontWeight: 600, color: campMsg.startsWith("✓") ? "#166534" : "#dc2626" }}>{campMsg}</div>}
                </div>
              )}

              {activity.length > 0 && (
                <div style={{ marginTop: "18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>Activity & chat ({activity.length})</div>
                  <div style={{ maxHeight: "260px", overflowY: "auto", display: "grid", gap: "6px" }}>
                    {activity.map((a) => (
                      <div key={a.id} style={{ background: a.type === "chat" ? "#eef2ff" : "#f8fafc", border: "1px solid #eef0f3", borderRadius: "9px", padding: "8px 10px", fontSize: "12px" }}>
                        <span style={{ fontWeight: 700 }}>{a.author}</span>
                        <span style={{ color: "#a4adbd", marginLeft: "6px", fontSize: "11px" }}>{fmtWhen(a.at)}</span>
                        <div style={{ marginTop: "2px", color: "#334155", whiteSpace: "pre-wrap" }}>{a.text}</div>
                        {a.attachment?.url && (
                          <a href={a.attachment.url} target="_blank" rel="noreferrer" style={{ fontSize: "11.5px", color: "#2563eb", fontWeight: 600 }}>📎 {a.attachment.name || "attachment"} ↗</a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
