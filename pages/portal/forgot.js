// pages/portal/forgot.js — Password dimenticata → inloglink per mail, daarna nieuw wachtwoord kiezen.
import { useState } from "react";
import AuthShell, { post, onEnter, P, go } from "../../components/portal/AuthShell";
import { useT } from "../../lib/portal-i18n";

export default function Forgot() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("errEnterEmail");
    setBusy(true);
    await post("/api/portal/auth/request-link", { email, purpose: "reset" });
    setBusy(false);
    go(`/link-sent?reset=1&e=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell title={t("forgotTitle")} heading={t("forgotTitle")} sub={t("forgotSub")} footer={t("footer")}
      below={<p className="help"><a href={P("/login")}>{t("backToLogin")}</a></p>}>
      <div>
        {err && <div className="err">{t(err)}</div>}
        <label htmlFor="e">{t("email")}</label>
        <input id="e" type="email" placeholder="esempio@gmail.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter(send)} />
        <button className="btn" type="button" onClick={send} disabled={busy}>{t("forgotBtn")}</button>
      </div>
    </AuthShell>
  );
}
