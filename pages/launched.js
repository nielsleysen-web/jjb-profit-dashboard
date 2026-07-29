// pages/launched.js
// Launched overview — all launched products.
// Winner/Loser categorisation (based on Ads Manager data) comes in phase 2.

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
};

export default function Launched() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/launch-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#8a92a3" }}>Loading…</span></div>;
  if (error)
    return <div style={ui.page}><div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div></div>;

  const launched = tasks
    .filter((t) => t.status === "Launched")
    .sort((a, b) => (b.launchedDate || "").localeCompare(a.launchedDate || ""));

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          ✅ Launched
          <span style={{ marginLeft: "10px", fontSize: "14px", fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "3px 12px", borderRadius: "999px", verticalAlign: "middle" }}>{launched.length}</span>
        </h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Winner / Loser categorisation based on Ads Manager data coming soon (phase 2)
        </p>
      </div>

      {launched.length === 0 ? (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>No launched products yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {launched.map((t) => (
            <div key={t.id} style={{ ...ui.card, padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>
                  {t.productName}
                  {t.countryCode && <span style={{ marginLeft: "8px", fontSize: "10.5px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "2px 8px", borderRadius: "999px" }}>{t.countryCode}</span>}
                </div>
                {t.funnelAngle && <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "2px" }}>{t.funnelAngle}</div>}
              </div>
              {t.assigneeName && <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>👤 {t.assigneeName}</span>}
              {t.launchedDate && (
                <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
                  🚀 {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", background: "#f1f5f9", padding: "3px 10px", borderRadius: "999px" }}>
                Winner/Loser: pending
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
