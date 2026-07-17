import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";

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

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/daily-overview", label: "Daily Overview", icon: "📅" },
  { href: "/product-economics", label: "Product Economics", icon: "📦" },
  { href: "/constraint-focus", label: "Constraint Focus", icon: "🎯" },
];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const isMobile = useIsMobile();

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

  const requiresAuth = NAV_ITEMS.some((item) => router.pathname === item.href);

  if (requiresAuth && !authenticated) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f7f8fa",
        fontFamily: "Inter, system-ui, sans-serif"
      }}>
        <form onSubmit={handleLogin} style={{
          background: "white",
          padding: "40px",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "400px",
          border: "1px solid #eceef2",
          boxShadow: "0 4px 24px rgba(15,23,42,0.06)"
        }}>
          <h1 style={{ margin: "0 0 6px 0", fontSize: "22px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>
            Just Jenny
          </h1>
          <p style={{ margin: "0 0 24px 0", fontSize: "13px", color: "#8a92a3" }}>
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
              padding: "11px 14px",
              border: "1px solid #e2e6ec",
              borderRadius: "10px",
              fontSize: "14px",
              marginBottom: "12px",
              boxSizing: "border-box",
              outline: "none"
            }}
          />
          {error && (
            <p style={{ color: "#dc2626", fontSize: "13px", margin: "0 0 12px 0" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "#0f172a",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 600,
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
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", background: "#f7f8fa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      {/* Navigatie: sidebar op desktop, bovenbalk op mobiel */}
      {requiresAuth && authenticated && (isMobile ? (
        <div style={{
          background: "white",
          borderBottom: "1px solid #eceef2",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          position: "sticky",
          top: 0,
          zIndex: 50
        }}>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>Just Jenny</h2>
          <nav style={{ display: "flex", gap: "4px", overflowX: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {NAV_ITEMS.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <a style={{
                    padding: "7px 10px",
                    background: active ? "#0f172a" : "transparent",
                    color: active ? "#ffffff" : "#64748b",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "9px",
                    whiteSpace: "nowrap",
                    flexShrink: 0
                  }}>
                    {item.icon} {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>
          <button
            onClick={handleLogout}
            style={{
              padding: "7px 10px",
              background: "#ffffff",
              color: "#dc2626",
              border: "1px solid #fecaca",
              borderRadius: "9px",
              fontSize: "11.5px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        <div style={{
          width: "200px",
          background: "white",
          borderRight: "1px solid #eceef2",
          padding: "24px 12px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0
        }}>
          <div style={{ paddingLeft: "12px", marginBottom: "28px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Just Jenny</h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#8a92a3" }}>Profit Dashboard</p>
          </div>
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
            {NAV_ITEMS.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <a style={{
                    display: "block",
                    padding: "10px 12px",
                    background: active ? "#0f172a" : "transparent",
                    color: active ? "#ffffff" : "#64748b",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "10px"
                  }}>
                    {item.icon} {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 12px",
              background: "#ffffff",
              color: "#dc2626",
              border: "1px solid #fecaca",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </div>
      ))}
      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Component {...pageProps} />
      </div>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Inter, system-ui, sans-serif;
          background: #f7f8fa;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}
