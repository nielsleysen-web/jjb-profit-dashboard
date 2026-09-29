// pages/portal/login.js — Inloggen: e-mail + wachtwoord, of een inloglink per mail.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { post, onEnter, P, go } from "../../components/portal/AuthShell";
import { useT } from "../../lib/portal-i18n";

export default function Login() {
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ?expired=1 (vervallen of al gebruikte inloglink) — query is pas na het laden beschikbaar
  useEffect(() => { if (router.isReady && router.query.expired) setErr("errExpired"); }, [router.isReady]);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function login() {
    setErr("");
    if (!validEmail) return setErr("errEnterEmail");
    if (!password) return setErr("errEnterPw");
    setBusy(true);
    const r = await post("/api/portal/auth/login", { email, password });
    setBusy(false);
    if (r.ok) return go("/");
    setErr(r.error === "no_password" ? "errNoPw" : r.error === "too_many" ? "errTooMany" : "errBadLogin");
  }

  async function sendLink() {
    setErr("");
    if (!validEmail) return setErr("errEmailFirst");
    setBusy(true);
    await post("/api/portal/auth/request-link", { email, purpose: "login" });
    setBusy(false);
    go(`/link-sent?e=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell title={t("loginTitle")} heading={t("loginTitle")} sub={t("loginSub")} footer={t("footer")}>
      <div>
        {err && <div className="err">{t(err)}</div>}
        <label htmlFor="e">{t("email")}</label>
        <input id="e" type="email" placeholder="esempio@gmail.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter(login)} />
        <div className="gap" />
        <div className="row"><label htmlFor="p">{t("password")}</label><a href={P("/forgot")}>{t("forgotLink")}</a></div>
        <input id="p" type="password" placeholder={t("pwPlaceholder")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter(login)} />
        <button className="btn" type="button" onClick={login} disabled={busy}>{t("loginBtn")}</button>
        <div className="or">{t("or")}</div>
        <button className="ghost" type="button" onClick={sendLink} disabled={busy}>{t("emailLinkBtn")}</button>
      </div>
    </AuthShell>
  );
}
