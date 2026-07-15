import { useState, useEffect } from "react";
import { useRouter } from "next/router";

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
    
    // Password check - in production this should be server-side
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

  // Check if dashboard - requires auth
  const isDashboard = router.pathname === "/dashboard";

  if (isDashboard && !authenticated) {
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
    <>
      {isDashboard && authenticated && (
        <div style={{
          background: "#f3f4f6",
          borderBottom: "1px solid #e5e7eb",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px",
          fontFamily: "system-ui, sans-serif"
        }}>
          <button
            onClick={handleLogout}
            style={{
              padding: "6px 12px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
}
