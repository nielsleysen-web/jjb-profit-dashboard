// pages/portal/link-sent.js — "Check your email" na het aanvragen van een inloglink.
import { useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { post } from "../../components/portal/AuthShell";

export default function LinkSent() {
  const router = useRouter();
  const email = String(router.query.e || "");
  const reset = router.query.reset === "1";
  const [again, setAgain] = useState(false);

  async function resend() {
    if (!email) return;
    await post("/api/portal/auth/request-link", { email, purpose: reset ? "reset" : "login" });
    setAgain(true);
  }

  return (
    <AuthShell title="Check your email" heading="Check your email"
      sub={<>We sent a login link to <b>{email || "your email"}</b>. It works for 20 minutes.</>}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>📩</div>
        <p style={{ margin: "0 0 6px", fontSize: 16 }}>Open the email and tap <b>Log in</b>. You'll land straight in your members area.</p>
        <p style={{ margin: 0, color: "#777", fontSize: 14.5 }}>
          Nothing after a few minutes? Check your spam folder, or{" "}
          {again ? <b style={{ color: "#2d6b45" }}>sent again ✓</b> : <a href="#" onClick={(e) => { e.preventDefault(); resend(); }} style={{ color: "#df8455", fontWeight: 700, textDecoration: "none" }}>send it again</a>}.
        </p>
      </div>
    </AuthShell>
  );
}
