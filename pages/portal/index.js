// pages/portal/index.js — Ledenportaal, startpagina.
// Stap 1 (auth): tijdelijke, eenvoudige startpagina die toont dat je ingelogd bent.
// Stap 3 vervangt dit door de echte "Free items"-pagina met zijbalk (design/portal/03-portal-en.html).
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { post, go } from "../../components/portal/AuthShell";

export default function PortalHome() {
  const router = useRouter();
  const [m, setM] = useState(null);
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((j) => (j.ok ? setM(j.member) : go("/login"))).catch(() => go("/login"));
  }, []);
  async function logout() { await post("/api/portal/auth/logout"); go("/login"); }
  if (!m) return null;
  return (
    <AuthShell title="Members area" heading={`Welcome back, ${m.firstName || "there"}`} sub="Your members area is being built. Free items, the Tinnitus Library and your courses will appear here soon.">
      <p style={{ margin: "0 0 6px" }}><b>Email:</b> {m.email}</p>
      <p style={{ margin: "0 0 6px" }}><b>Member since:</b> {m.startedAt ? new Date(m.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}</p>
      <p style={{ margin: "0 0 6px" }}><b>Password:</b> {m.hasPassword ? "set ✓" : "not set (you log in with email links)"}</p>
      <button className="ghost" type="button" onClick={logout} style={{ marginTop: 18 }}>Log out</button>
    </AuthShell>
  );
}
