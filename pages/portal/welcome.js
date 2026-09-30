// pages/portal/welcome.js — Eerste bezoek via de inloglink: wachtwoord kiezen of overslaan. (Het welkomstcadeau staat in het portaal zelf.)
import { useEffect, useState } from "react";
import AuthShell, { go } from "../../components/portal/AuthShell";
import PasswordForm from "../../components/portal/PasswordForm";
import { useT } from "../../lib/portal-i18n";

export default function Welcome() {
  const { t } = useT();
  const [name, setName] = useState("");
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((j) => {
      if (!j.ok) return go("/login?expired=1");
      if (j.member.hasPassword) return go("/");
      setName(j.member.firstName || "");
    }).catch(() => go("/login"));
  }, []);

  return (
    <>
      <AuthShell title={t("choosePw")} heading={name ? t("welcomeTitle", { name }) : t("welcomeTitleNoName")} sub={t("welcomeSub")} footer={t("footer")}>
        <PasswordForm t={t} labels={{ first: t("choosePw"), second: t("repeatPw"), button: t("savePwContinue") }}
          onDone={() => go("/")} skip={{ label: t("skipPw"), onClick: () => go("/") }} />
      </AuthShell>
    </>
  );
}
