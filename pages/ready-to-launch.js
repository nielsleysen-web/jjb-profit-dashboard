// pages/ready-to-launch.js
// Media Buyer worktable — everything with status "Ready to launch":
// funnels (Product Launching) and video creatives (Marketing Creatives).

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const funnelNaming = (t) =>
  [t.productName, t.countryCode, firstName(t.assigneeName), fmtDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

const creativeNaming = (t) =>
  [t.product?.title, firstName(t.strategistName), firstName(t.assigneeName), t.angle, t.type, fmtDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

const designNaming = (t) =>
  [t.product?.title, firstName(t.strategistName), firstName(t.assigneeName), t.angle, t.batchType, fmtDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

function LinkChip({ label, url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "5px 12px", borderRadius: "999px" }}>
      {label} ↗
    </a>
  );
}

function NamingBar({ naming, copied, onCopy }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "8px 12px", marginTop: "12px" }}>
      <code style={{ fontSize: "11.5px", color: "#334155", flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{naming}</code>
      <button
        onClick={onCopy}
        style={{ padding: "4px 11px", background: copied ? "#dcfce7" : "#fff", color: copied ? "#166534" : "#334155", border: "1px solid #e2e6ec", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function ReadyToLaunch() {
  const [funnels, setFunnels] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
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
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 45000);
    return () => clearInterval(iv);
  }, []);

  const markLaunched = async (api, taskId) => {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", taskId, status: "Launched" }),
    }).then((r) => r.json());
    if (!res.success) return alert(res.error);
    load();
  };

  const copy = (id, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  if (loading)
    return <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#8a92a3" }}>Loading…</span></div>;

  const readyFunnels = funnels.filter((t) => t.status === "Ready to launch").sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const readyCreatives = creatives.filter((t) => t.status === "Ready to launch").sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const readyDesigns = designs.filter((t) => t.status === "Ready to launch").sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const total = readyFunnels.length + readyCreatives.length + readyDesigns.length;

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          📣 Ready To Launch
          <span style={{ marginLeft: "10px", fontSize: "14px", fontWeight: 700, color: "#0f766e", background: "#ccfbf1", padding: "3px 12px", borderRadius: "999px", verticalAlign: "middle" }}>{total}</span>
        </h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>Funnels and creatives ready to schedule in Ads Manager</p>
      </div>

      {total === 0 && (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>Nothing ready to launch right now. 🎉</p>
        </div>
      )}

      {/* Funnels */}
      {readyFunnels.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🚀 Funnels ({readyFunnels.length})</h2>
          <div style={{ display: "grid", gap: "14px", marginBottom: "26px" }}>
            {readyFunnels.map((t) => (
              <div key={t.id} style={{ ...ui.card, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 700 }}>
                      {t.productName}
                      {t.countryCode && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "3px 9px", borderRadius: "999px" }}>{t.countryCode}</span>}
                    </div>
                    {t.funnelAngle && <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>{t.funnelAngle}</div>}
                    <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "5px" }}>
                      {t.assigneeName && <>Built by <b style={{ color: "#334155" }}>{t.assigneeName}</b></>}
                      {t.deadline && <> · deadline {new Date(t.deadline).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                    </div>
                  </div>
                  <button onClick={() => markLaunched("/api/launch-tasks", t.id)} style={{ padding: "10px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    🚀 Mark as Launched
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                  <LinkChip label="Advertorial" url={t.advertorialLink} />
                  <LinkChip label="Funnelish" url={t.funnelishLink} />
                  <LinkChip label="Alibaba" url={t.alibabaLink} />
                </div>
                <NamingBar naming={funnelNaming(t)} copied={copiedId === t.id} onCopy={() => copy(t.id, funnelNaming(t))} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Creatives */}
      {readyCreatives.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🎬 Creatives ({readyCreatives.length})</h2>
          <div style={{ display: "grid", gap: "14px" }}>
            {readyCreatives.map((t) => (
              <div key={t.id} style={{ ...ui.card, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", minWidth: 0 }}>
                    {t.product?.image && (
                      <img src={t.product.image} alt="" style={{ width: "44px", height: "44px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700 }}>
                        {t.product?.title || "Creative"}
                        {t.countryCode && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "3px 9px", borderRadius: "999px" }}>{t.countryCode}</span>}
                        {t.videoFormat && <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "3px 9px", borderRadius: "999px" }}>{t.videoFormat}</span>}
                      </div>
                      {t.angle && <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>{t.angle}</div>}
                      <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "5px" }}>
                        {t.assigneeName && <>Edited by <b style={{ color: "#334155" }}>{t.assigneeName}</b></>}
                        {t.strategistName && <> · strategist <b style={{ color: "#334155" }}>{t.strategistName}</b></>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => markLaunched("/api/creative-tasks", t.id)} style={{ padding: "10px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    🚀 Mark as Launched
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                  <LinkChip label="Final Output" url={t.finalOutputLink} />
                  <LinkChip label="Frame.io" url={t.frameioLink} />
                  <LinkChip label="Advertorial" url={t.advertorialLink} />
                </div>
                <NamingBar naming={creativeNaming(t)} copied={copiedId === t.id} onCopy={() => copy(t.id, creativeNaming(t))} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Designs */}
      {readyDesigns.length > 0 && (
        <>
          <h2 style={{ margin: "26px 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🎨 Designs ({readyDesigns.length})</h2>
          <div style={{ display: "grid", gap: "14px" }}>
            {readyDesigns.map((t) => (
              <div key={t.id} style={{ ...ui.card, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", minWidth: 0 }}>
                    {t.product?.image && (
                      <img src={t.product.image} alt="" style={{ width: "44px", height: "44px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700 }}>
                        {t.product?.title || "Design"}
                        {t.countryCode && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "3px 9px", borderRadius: "999px" }}>{t.countryCode}</span>}
                        {t.batchType && <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 700, color: "#be185d", background: "#fce7f3", padding: "3px 9px", borderRadius: "999px" }}>{t.batchType}</span>}
                      </div>
                      {t.angle && <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>{t.angle}</div>}
                      <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "5px" }}>
                        {t.assigneeName && <>Designed by <b style={{ color: "#334155" }}>{t.assigneeName}</b></>}
                        {t.strategistName && <> · strategist <b style={{ color: "#334155" }}>{t.strategistName}</b></>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => markLaunched("/api/design-tasks", t.id)} style={{ padding: "10px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    🚀 Mark as Launched
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                  <LinkChip label="Final Output" url={t.finalOutputLink} />
                  <LinkChip label="Frame.io" url={t.frameioLink} />
                  <LinkChip label="Advertorial" url={t.advertorialLink} />
                </div>
                <NamingBar naming={designNaming(t)} copied={copiedId === t.id} onCopy={() => copy(t.id, designNaming(t))} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
