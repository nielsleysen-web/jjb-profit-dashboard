// pages/launched.js
// Launched overview — funnels and creatives.
// Winner/Loser categorisation (Ads Manager data) comes in phase 2.

import { useState, useEffect } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
};

export default function Launched() {
  const [funnels, setFunnels] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);

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
  const launchedDesigns = designs.filter((t) => t.status === "Launched").sort((a, b) => (b.launchedDate || "").localeCompare(a.launchedDate || ""));
  const total = launchedFunnels.length + launchedCreatives.length + launchedDesigns.length;

  const Row = ({ title, image, sub, by, date }) => (
    <div style={{ ...ui.card, padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      {image && <img src={image} alt="" style={{ width: "38px", height: "38px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "2px" }}>{sub}</div>}
      </div>
      {by && <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>👤 {by}</span>}
      {date && (
        <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
          🚀 {new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
          Winner / Loser categorisation based on Ads Manager data coming soon (phase 2)
        </p>
      </div>

      {total === 0 && (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>No launched products yet.</p>
        </div>
      )}

      {launchedFunnels.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🚀 Funnels ({launchedFunnels.length})</h2>
          <div style={{ display: "grid", gap: "10px", marginBottom: "26px" }}>
            {launchedFunnels.map((t) => (
              <Row
                key={t.id}
                title={`${t.productName}${t.countryCode ? ` · ${t.countryCode}` : ""}`}
                sub={t.funnelAngle}
                by={t.assigneeName}
                date={t.launchedDate}
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
              />
            ))}
          </div>
        </>
      )}

      {launchedDesigns.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>🎨 Designs ({launchedDesigns.length})</h2>
          <div style={{ display: "grid", gap: "10px" }}>
            {launchedDesigns.map((t) => (
              <Row
                key={t.id}
                title={`${t.product?.title || "Design"}${t.batchType ? ` · ${t.batchType}` : ""}`}
                image={t.product?.image}
                sub={t.angle}
                by={t.assigneeName}
                date={t.launchedDate}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
