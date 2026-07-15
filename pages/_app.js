import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const isAuth = localStorage.getItem("jjb_auth") === "true";
    setAuthenticated(isAuth);
    setLoading(false);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    const password = process.env.NEXT_PUBLIC_PASSWORD || "password";
    if (passwordInput === password) {
      localStorage.setItem("jjb_auth", "true");
      setAuthenticated(true);
      setPasswordInput("");
    } else {
      setError("Invalid password");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("jjb_auth");
    setAuthenticated(false);
    setPasswordInput("");
  };

  if (loading) return null;

  const isDashboard = router.pathname === "/dashboard";
  const isProductEconomics = router.pathname === "/product-economics";
  const requiresAuth = isDashboard || isProductEconomics;

  if (requiresAuth && !authenticated) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f3f4f6",
        fontFamily: "system-ui, sans-serif"
      }}>
        <form onSubmit={handleLogin} style={{
          background: "white",
          padding: "40px",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
        }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", color: "#1f2937" }}>
            Just Jenny
          </h1>
          <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#6b7280" }}>
            Profit Dashboard
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              marginBottom: "12px",
              boxSizing: "border-box"
            }}
          />
          {error && (
            <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "12px", margin: "0 0 12px 0" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer"
            }}
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      {requiresAuth && authenticated && (
        <div style={{
          width: "120px",
          background: "white",
          borderRight: "1px solid #e5e7eb",
          padding: "24px 0",
          display: "flex",
          flexDirection: "column"
        }}>
          <div style={{ paddingLeft: "16px", marginBottom: "32px" }}>
            <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "#1f2937" }}>Just Jenny</h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#6b7280" }}>Profit</p>
          </div>

          <nav style={{ flex: 1 }}>
            <Link href="/dashboard">
              <a style={{
                display: "block",
                padding: "12px 16px",
                background: isDashboard ? "#3b82f6" : "transparent",
                color: isDashboard ? "white" : "#6b7280",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "500",
                borderLeft: isDashboard ? "3px solid #3b82f6" : "3px solid transparent",
                marginBottom: "8px"
              }}>
                📊 Dashboard
              </a>
            </Link>
            <Link href="/product-economics">
              <a style={{
                display: "block",
                padding: "12px 16px",
                background: isProductEconomics ? "#3b82f6" : "transparent",
                color: isProductEconomics ? "white" : "#6b7280",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: "500",
                borderLeft: isProductEconomics ? "3px solid #3b82f6" : "3px solid transparent"
              }}>
                📦 Product Economics
              </a>
            </Link>
          </nav>

          <button
            onClick={handleLogout}
            style={{
              padding: "12px 16px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              margin: "0 16px"
            }}
          >
            Logout
          </button>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1 }}>
        <Component {...pageProps} />
      </div>

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: system-ui, sans-serif;
          background: #f9fafb;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}
