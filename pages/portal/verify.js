// pages/portal/verify.js — Landingspagina van de inloglink. Gebruikt de token pas na het laden
// (POST), zodat voorvertoningen/mailscanners de eenmalige link niet ongeldig maken.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { post, go } from "../../components/portal/AuthShell";

export default function Verify() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    const t = String(router.query.t || "");
    if (!t) return go("/login?expired=1");
    post("/api/portal/auth/verify", { t }).then((r) => {
      if (r.ok) go(r.next || "/");
      else if (r.error === "expired") go("/login?expired=1");
      else setFailed(true);
    }).catch(() => setFailed(true));
  }, [router.isReady]);

  return (
    <AuthShell title="Logging you in" heading={failed ? "Something went wrong" : "Logging you in…"}
      sub={failed ? "Please try again in a moment, or request a new login link." : "One moment, we're opening your members area."}>
      <div style={{ textAlign: "center", fontSize: 44 }}>{failed ? "⚠️" : "🔑"}</div>
      {failed && <button className="btn" type="button" onClick={() => go("/login")}>Back to log in →</button>}
    </AuthShell>
  );
}
