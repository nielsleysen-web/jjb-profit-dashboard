// pages/funnel-assets.js
// Funnel Builder Assets — SOP's, prompts en andere naslagdocumenten voor het bouwen van funnels.
// Nieuwe asset toevoegen = een regel bij ASSETS zetten (title, description, href, icon).

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
};

// category: "Documents" | "Tools" — nieuwe categorie? Gewoon een nieuwe string gebruiken,
// de pagina maakt er automatisch een sectie voor (volgorde via CATEGORY_ORDER).
const CATEGORY_ORDER = ["Documents", "Tools"];
const ASSETS = [
  {
    category: "Documents",
    icon: "🖼️",
    title: "Sales Page Images — SOP",
    description: "Step-by-step standard operating procedure for creating and placing every image on the sales page.",
    href: "https://docs.google.com/document/d/13_lQFefaKE2BhcLPwE2Zi1f9ZL5hOCwwoHlJWB0aLpw/edit?usp=sharing",
    tag: "SOP",
  },
  {
    category: "Documents",
    icon: "✍️",
    title: "Sales Page Copy — Prompts",
    description: "The prompt collection for writing the sales page copy — use these when working outside the automated pipeline.",
    href: "https://docs.google.com/document/d/1Mv0ApyL8cFwgAB4E3i4jc7gDrufB0wgK0kNvq-hwqV4/edit?usp=sharing",
    tag: "Prompts",
  },
];

export default function FunnelAssets() {
  const isMobile = useIsMobile();

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
      <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>📁 Funnel Builder Assets</h1>
      <p style={{ margin: "4px 0 24px 0", fontSize: "13px", color: "#8a92a3" }}>
        SOPs, prompts and reference documents for building funnels. Bookmark-worthy — these are the source of truth.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const items = ASSETS.filter((a) => a.category === cat);
        return (
          <div key={cat} style={{ marginBottom: "28px" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.7px" }}>
              {cat === "Documents" ? "📄" : "🛠️"} {cat}
            </h2>
            {items.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12.5px", color: "#a4adbd", fontStyle: "italic" }}>
                Coming soon — the Advertorial HTML Builder will live here.
              </p>
            ) : (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px", maxWidth: "1100px" }}>
        {items.map((a) => (
          <a
            key={a.href}
            href={a.href}
            target="_blank"
            rel="noreferrer"
            style={{ ...ui.card, padding: "20px 22px", display: "block", textDecoration: "none", color: "inherit", transition: "box-shadow 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 20px rgba(15,23,42,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = ui.card.boxShadow)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                {a.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#0f172a" }}>{a.title}</div>
                <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#4f46e5", background: "#eef2ff", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {a.tag}
                </span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b", lineHeight: 1.55 }}>{a.description}</p>
            <div style={{ marginTop: "12px", fontSize: "12.5px", fontWeight: 700, color: "#2563eb" }}>Open document ↗</div>
          </a>
        ))}
      </div>
            )}
          </div>
        );
      })}

      <p style={{ margin: "24px 0 0 0", fontSize: "12px", color: "#a4adbd" }}>
        Need an asset added here? Ask Niels.
      </p>
    </div>
  );
}
