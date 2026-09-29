// pages/portal/welcome.js — Eerste bezoek via de inloglink: wachtwoord kiezen of overslaan.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthShell, { go } from "../../components/portal/AuthShell";
import PasswordForm from "../../components/portal/PasswordForm";

export default function Welcome() {
  const router = useRouter();
  const [name, setName] = useState("");
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((j) => {
      if (!j.ok) return go("/login?expired=1");
      if (j.member.hasPassword) return go("/");
      setName(j.member.firstName || "");
    }).catch(() => go("/login"));
  }, []);

  return (
    <AuthShell title="Welcome" heading={name ? `Welcome, ${name}!` : "Welcome!"}
      sub="You're logged in. Choose a password so you can log in next time without a link.">
      <PasswordForm labels={{ first: "Choose a password", second: "Repeat password", button: "Save password & continue →" }}
        onDone={() => go("/")}
        skip={{ label: "Skip for now, I'll use email links", onClick: () => go("/") }} />
    </AuthShell>
  );
}
