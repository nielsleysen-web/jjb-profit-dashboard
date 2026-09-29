// pages/portal/verify.js — Landingspagina van de inloglink. Gebruikt de token pas na het laden
// (POST), zodat voorvertoningen/mailscanners de eenmalige link niet ongeldig maken.
import { useEffect, useState } from "react";
import AuthShell, { post, go } from "../../components/portal/AuthShell";
import { useT } from "../../lib/portal-i18n";

export default function Verify() {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const tok = new URLSearchParams(window.location.search).get("t") || "";
    if (!tok) return go("/login?expired=1");
    post("/api/portal/auth/verify", { t: tok }).then((r) => {
      if (r.ok) go(r.next || "/");
      else if (r.error === "expired") go("/login?expired=1");
      else setFailed(true);
    }).catch(() => setFailed(true));
  }, []);

  return (
    <AuthShell title={t("verifyTitle")} heading={failed ? t("verifyFailTitle") : t("verifyTitle")} footer={t("footer")}
      sub={failed ? t("verifyFailSub") : t("verifySub")}>
      <div style={{ textAlign: "center", fontSize: 44 }}>{failed ? "⚠️" : "🔑"}</div>
      {failed && <button className="btn" type="button" onClick={() => go("/login")}>{t("verifyBack")}</button>}
    </AuthShell>
  );
}
