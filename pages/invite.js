// pages/invite.js
// Publieke uitnodigingspagina — /invite?token=…
// De genodigde ziet zijn e-mailadres en toegewezen rollen, kiest een wachtwoord
// en is daarna meteen ingelogd met de juiste toegang. Geen goedkeuring nodig.

import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  border: "1px solid #e2e6ec",
  borderRadius: "10px",
  fontSize: "14px",
  marginBottom: "12px",
  outline: "none",
  fontFamily: "inherit",
};

export default function Invite() {
  const router = useRouter();
  const { token } = router.query;
  const [info, setInfo] = useState(null); // { email, name, roles }
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setError("No invitation code found in the link.");
      setLoading(false);
      return;
    }
    fetch(`/api/auth?action=invite&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error || "Invalid invitation");
        setInfo(res);
        setName(res.name || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router.isReady, token]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Choose a password of at least 8 characters.");
    if (password !== confirm) return setError("The two passwords are not the same.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth?action=acceptInvite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error || "Something went wrong");
      setDone(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (e2) {
      setError(e2.message);
    }
    setBusy(false);
  };

  const shell = (children) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f7f8fa", fontFamily: "Inter, system-ui, -apple-system, sans-serif", padding: "24px" }}>
      <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "20px", boxShadow: "0 4px 24px rgba(15,23,42,0.06)", padding: "40px 44px", maxWidth: "430px", width: "100%" }}>
        {children}
      </div>
    </div>
  );

  if (loading) return shell(<p style={{ margin: 0, color: "#8a92a3", fontSize: "14px", textAlign: "center" }}>Loading invitation…</p>);

  if (error && !info)
    return shell(
      <>
        <div style={{ fontSize: "30px", marginBottom: "12px", textAlign: "center" }}>🔒</div>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "19px", fontWeight: 700, color: "#0f172a", textAlign: "center" }}>Invitation not valid</h1>
        <p style={{ margin: "0 0 20px 0", fontSize: "13.5px", color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>{error}</p>
        <a href="/" style={{ display: "block", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>Go to the login page →</a>
      </>
    );

  if (done)
    return shell(
      <>
        <div style={{ fontSize: "34px", marginBottom: "12px", textAlign: "center" }}>🎉</div>
        <h1 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a", textAlign: "center" }}>You're all set</h1>
        <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b", textAlign: "center" }}>Taking you to the Operations Centre…</p>
      </>
    );

  return shell(
    <>
      <div style={{ fontSize: "30px", marginBottom: "12px", textAlign: "center" }}>🧭</div>
      <h1 style={{ margin: "0 0 4px 0", fontSize: "21px", fontWeight: 700, color: "#0f172a", textAlign: "center", letterSpacing: "-0.3px" }}>
        Welcome to Just Jenny
      </h1>
      <p style={{ margin: "0 0 20px 0", fontSize: "13.5px", color: "#8a92a3", textAlign: "center" }}>Operations Centre</p>

      <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "12px", padding: "14px 16px", marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Your account</div>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#0f172a", marginBottom: "8px" }}>{info.email}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(info.roles || []).length === 0 ? (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Access will be assigned by the administrator</span>
          ) : (
            info.roles.map((r) => (
              <span key={r} style={{ fontSize: "11.5px", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", padding: "3px 10px", borderRadius: "999px" }}>{r}</span>
            ))
          )}
        </div>
      </div>

      <form onSubmit={submit}>
        <input style={inputStyle} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} type="password" placeholder="Choose a password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input style={inputStyle} type="password" placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && (
          <p style={{ margin: "0 0 12px 0", fontSize: "12.5px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "9px", padding: "9px 12px" }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: "13px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit" }}
        >
          {busy ? "Creating account…" : "Create my account →"}
        </button>
      </form>
      <p style={{ margin: "14px 0 0 0", fontSize: "11.5px", color: "#a4adbd", textAlign: "center", lineHeight: 1.6 }}>
        After this you're logged in straight away — your access is already set up.
      </p>
    </>
  );
}
