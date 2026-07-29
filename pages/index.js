// pages/index.js
// Landing page — Just Jenny Operations Centre

import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#f7f8fa",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eceef2",
          borderRadius: "20px",
          boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
          padding: "48px 56px",
          textAlign: "center",
          maxWidth: "420px",
          width: "100%",
        }}
      >
        <div style={{ fontSize: "34px", marginBottom: "14px" }}>🧭</div>
        <h1 style={{ margin: 0, fontSize: "30px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>
          Just Jenny
        </h1>
        <p style={{ margin: "6px 0 28px 0", fontSize: "14.5px", color: "#8a92a3" }}>Operations Centre</p>
        <Link href="/dashboard">
          <a
            style={{
              display: "inline-block",
              padding: "13px 28px",
              background: "#0f172a",
              color: "#ffffff",
              borderRadius: "12px",
              fontSize: "14.5px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Enter Operations Centre →
          </a>
        </Link>
      </div>
    </div>
  );
}
