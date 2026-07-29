// pages/ready-to-launch.js
// Media Buyer worktable — every product with status "Ready to launch",
// with everything needed to schedule the launch in Ads Manager.

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
};

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
const fmtDeadlineDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const namingConvention = (t) =>
  [t.productName, t.countryCode, firstName(t.assigneeName), fmtDeadlineDate(t.deadline)]
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

export default function ReadyToLaunch() {
  const [tasks, setTasks] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const load = () =>
    fetch("/api/launch-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
        setMe(res.me);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const iv = setInterval(load, 45000);
    return () => clearInterval(iv);
  }, []);

  const markLaunched = async (taskId) => {
    const res = await fetch("/api/launch-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", taskId, status: "Launched" }),
    }).then((r) => r.json());
    if (!res.success) return alert(res.error);
    setTasks(res.tasks);
  };

  const copyNaming = (t) => {
    navigator.clipboard?.writeText(namingConvention(t)).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  if (loading)
    return <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#8a92a3" }}>Loading…</span></div>;
  if (error)
    return <div style={ui.page}><div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div></div>;

  const ready = tasks
    .filter((t) => t.status === "Ready to launch")
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          📣 Ready To Launch
          <span style={{ marginLeft: "10px", fontSize: "14px", fontWeight: 700, color: "#0f766e", background: "#ccfbf1", padding: "3px 12px", borderRadius: "999px", verticalAlign: "middle" }}>{ready.length}</span>
        </h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>Everything you need to schedule these launches in Ads Manager</p>
      </div>

      {ready.length === 0 ? (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>Nothing ready to launch right now. 🎉</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {ready.map((t) => (
            <div key={t.id} style={{ ...ui.card, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>
                    {t.productName}
                    {t.countryCode && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "3px 9px", borderRadius: "999px" }}>{t.countryCode}</span>}
                  </div>
                  {t.funnelAngle && <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>{t.funnelAngle}</div>}
                  <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "5px" }}>
                    {t.assigneeName && <>Built by <b style={{ color: "#334155" }}>{t.assigneeName}</b></>}
                    {t.deadline && <> · deadline {new Date(t.deadline).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                  </div>
                </div>
                <button onClick={() => markLaunched(t.id)} style={{ padding: "10px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  🚀 Mark as Launched
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                <LinkChip label="Advertorial" url={t.advertorialLink} />
                <LinkChip label="Funnelish" url={t.funnelishLink} />
                <LinkChip label="Alibaba" url={t.alibabaLink} />
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "8px 12px", marginTop: "12px" }}>
                <code style={{ fontSize: "11.5px", color: "#334155", flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{namingConvention(t)}</code>
                <button
                  onClick={() => copyNaming(t)}
                  style={{ padding: "4px 11px", background: copiedId === t.id ? "#dcfce7" : "#fff", color: copiedId === t.id ? "#166534" : "#334155", border: "1px solid #e2e6ec", borderRadius: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                >
                  {copiedId === t.id ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
