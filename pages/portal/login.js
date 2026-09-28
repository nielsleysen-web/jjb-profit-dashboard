// pages/portal/login.js — Inloggen: e-mail + wachtwoord, of een inloglink per mail.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AuthShell, { post, onEnter } from "../../components/portal/AuthShell";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ?expired=1 (vervallen of al gebruikte inloglink) — query is pas na het laden beschikbaar
  useEffect(() => { if (router.isReady && router.query.expired) setErr("That link has expired or was already used. Enter your email and request a new one below."); }, [router.isReady]);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function login() {
    setErr("");
    if (!validEmail) return setErr("Please enter the email you used for your order.");
    if (!password) return setErr("Please enter your password, or use the email link below.");
    setBusy(true);
    const r = await post("/api/portal/auth/login", { email, password });
    setBusy(false);
    if (r.ok) return router.replace("/portal");
    if (r.error === "no_password") return setErr("You haven't chosen a password yet. Use \"Email me a login link\" below, then pick one.");
    if (r.error === "too_many") return setErr("Too many attempts. Please wait 15 minutes or use the email link.");
    setErr("That email and password don't match. Try again, or use the email link below.");
  }

  async function sendLink() {
    setErr("");
    if (!validEmail) return setErr("Enter your email first, then tap \"Email me a login link\".");
    setBusy(true);
    await post("/api/portal/auth/request-link", { email, purpose: "login" });
    setBusy(false);
    router.push(`/portal/link-sent?e=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell title="Log in" heading="Log in to your members area" sub="Enter the email you used for your order.">
      <div>
        {err && <div className="err">{err}</div>}
        <label htmlFor="e">Email</label>
        <input id="e" type="email" placeholder="example@gmail.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter(login)} />
        <div className="gap" />
        <div className="row"><label htmlFor="p">Password</label><Link href="/portal/forgot">Forgot password?</Link></div>
        <input id="p" type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter(login)} />
        <button className="btn" type="button" onClick={login} disabled={busy}>Log in →</button>
        <div className="or">or</div>
        <button className="ghost" type="button" onClick={sendLink} disabled={busy}>Email me a login link</button>
      </div>
    </AuthShell>
  );
}
