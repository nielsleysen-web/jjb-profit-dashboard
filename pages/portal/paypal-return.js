// pages/portal/paypal-return.js — PayPal stuurt het lid hierheen na het goedkeuren van de betaling
// (?token=<PayPal-order-id>). We ronden de betaling af en tonen de bevestiging.
import { useEffect, useState } from "react";
import AuthShell, { post, go, SUPPORT_EMAIL } from "../../components/portal/AuthShell";
import { useT } from "../../lib/portal-i18n";

const ERR = { already_ordered: "errAlreadyOrdered", payment_failed: "errPayFailed", order_failed: "errOrderFailed", busy: "errBusy" };

export default function PaypalReturn() {
  const { t } = useT();
  const [err, setErr] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return go("/");
    post("/api/portal/claim-complete", { paypalOrderId: token }).then((r) => {
      if (r.status === 401) return go("/login");
      if (!r.ok) return setErr(ERR[r.error] || "errPayFailed");
      try { sessionStorage.setItem("jj_last_order", JSON.stringify(r.result)); } catch {}
      go(`/#done/${encodeURIComponent(r.result.orderName)}`);
    }).catch(() => setErr("errPayFailed"));
  }, []);
  return (
    <AuthShell title={t("ppReturnTitle")} heading={err ? t("verifyFailTitle") : t("ppReturnTitle")} footer={t("footer")}
      sub={err ? t(err, { email: SUPPORT_EMAIL }) : t("ppReturnSub")}>
      <div style={{ textAlign: "center", fontSize: 44 }}>{err ? "⚠️" : "⏳"}</div>
      {err && <button className="btn" type="button" onClick={() => go("/")}>{t("backToFree")}</button>}
    </AuthShell>
  );
}
