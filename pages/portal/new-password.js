// pages/portal/new-password.js — Na "password dimenticata": nieuw wachtwoord kiezen.
import { useEffect } from "react";
import AuthShell, { go } from "../../components/portal/AuthShell";
import PasswordForm from "../../components/portal/PasswordForm";
import { useT } from "../../lib/portal-i18n";

export default function NewPassword() {
  const { t } = useT();
  useEffect(() => {
    fetch("/api/portal/me").then((r) => r.json()).then((j) => { if (!j.ok) go("/login?expired=1"); }).catch(() => {});
  }, []);
  return (
    <AuthShell title={t("newPwTitle")} heading={t("newPwTitle")} sub={t("newPwSub")} footer={t("footer")}>
      <PasswordForm t={t} labels={{ first: t("newPw"), second: t("repeatNewPw"), button: t("saveNewPw") }} onDone={() => go("/")} />
    </AuthShell>
  );
}
