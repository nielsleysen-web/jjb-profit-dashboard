// pages/portal/new-password.js — Na "wachtwoord vergeten": nieuw wachtwoord kiezen.
import { useEffect } from "react";
import { useRouter } from "next/router";
import AuthShell, { go } from "../../components/portal/AuthShell";
import PasswordForm from "../../components/portal/PasswordForm";

export default function NewPassword() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((j) => { if (!j.ok) go("/login?expired=1"); }).catch(() => {});
  }, []);
  return (
    <AuthShell title="Choose a new password" heading="Choose a new password" sub="You're logged in via your email link. Pick a new password for next time.">
      <PasswordForm labels={{ first: "New password", second: "Repeat new password", button: "Save new password →" }} onDone={() => go("/")} />
    </AuthShell>
  );
}
