import Link from "next/link";

export default function Home() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: "#f3f4f6",
      fontFamily: "system-ui, sans-serif",
      padding: "20px"
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "32px", color: "#1f2937", marginBottom: "12px" }}>
          Just Jenny
        </h1>
        <p style={{ fontSize: "16px", color: "#6b7280", marginBottom: "24px" }}>
          Profit Dashboard
        </p>
        <Link href="/dashboard">
          <a style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#3b82f6",
            color: "white",
            textDecoration: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500"
          }}>
            Go to Dashboard
          </a>
        </Link>
      </div>
    </div>
  );
}
