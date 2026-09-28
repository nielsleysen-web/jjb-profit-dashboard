// pages/portal/forgot.js — Wachtwoord vergeten → inloglink per mail, daarna nieuw wachtwoord kiezen.
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AuthShell, { post, onEnter } from "../../components/portal/AuthShell";

export default function Forgot() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Please enter the email you used for your order.");
    setBusy(true);
    await post("/api/portal/auth/request-link", { email, purpose: "reset" });
    setBusy(false);
    router.push(`/portal/link-sent?reset=1&e=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell title="Forgot your password?" heading="Forgot your password?"
      sub="No problem. Enter your email and we'll send you a link to log in and choose a new one."
      below={<p className="help"><Link href="/portal/login">← Back to log in</Link></p>}>
      <div>
        {err && <div className="err">{err}</div>}
        <label htmlFor="e">Email</label>
        <input id="e" type="email" placeholder="example@gmail.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter(send)} />
        <button className="btn" type="button" onClick={send} disabled={busy}>Send me the link →</button>
      </div>
    </AuthShell>
  );
}
