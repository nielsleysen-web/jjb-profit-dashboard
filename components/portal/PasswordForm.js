// components/portal/PasswordForm.js — wachtwoord kiezen (eerste bezoek) of vernieuwen (reset).
import { useState } from "react";
import { post, onEnter } from "./AuthShell";

export default function PasswordForm({ labels, onDone, skip }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    if (p1.length < 8) return setErr("Your password needs at least 8 characters.");
    if (p1 !== p2) return setErr("The two passwords don't match. Please type them again.");
    setBusy(true);
    const r = await post("/api/portal/auth/set-password", { password: p1 });
    setBusy(false);
    if (r.ok) return onDone();
    if (r.status === 401) return setErr("Your login has expired. Please request a new link.");
    setErr("Something went wrong. Please try again.");
  }

  return (
    <div>
      {err && <div className="err">{err}</div>}
      <label htmlFor="p1">{labels.first}</label>
      <input id="p1" type="password" placeholder="At least 8 characters" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} onKeyDown={onEnter(save)} />
      <div className="gap" />
      <label htmlFor="p2">{labels.second}</label>
      <input id="p2" type="password" placeholder="Same password again" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={onEnter(save)} />
      <button className="btn" type="button" onClick={save} disabled={busy}>{labels.button}</button>
      {skip && <><div className="or">or</div><button className="ghost" type="button" onClick={skip.onClick}>{skip.label}</button></>}
    </div>
  );
}
