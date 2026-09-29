// pages/portal/link-sent.js — "Controlla la tua email" na het aanvragen van een inloglink.
import { useEffect, useState } from "react";
import AuthShell, { post } from "../../components/portal/AuthShell";
import { useT } from "../../lib/portal-i18n";

export default function LinkSent() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [reset, setReset] = useState(false);
  const [again, setAgain] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setEmail(q.get("e") || ""); setReset(q.get("reset") === "1");
  }, []);

  async function resend() {
    if (!email) return;
    await post("/api/portal/auth/request-link", { email, purpose: reset ? "reset" : "login" });
    setAgain(true);
  }

  return (
    <AuthShell title={t("sentTitle")} heading={t("sentTitle")} footer={t("footer")}
      sub={t("sentSub", { email: email || t("yourEmail") })}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>📩</div>
        <p style={{ margin: "0 0 6px", fontSize: 16 }}>{t("sentBody")}</p>
        <p style={{ margin: 0, color: "#777", fontSize: 14.5 }}>
          {t("sentHelp")}{" "}
          {again ? <b style={{ color: "#2d6b45" }}>{t("sentAgainDone")}</b> : <a href="#" onClick={(e) => { e.preventDefault(); resend(); }} style={{ color: "#df8455", fontWeight: 700, textDecoration: "none" }}>{t("sentAgain")}</a>}.
        </p>
      </div>
    </AuthShell>
  );
}
