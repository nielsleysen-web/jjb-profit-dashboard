// components/portal/Reactivate.js — Scherm voor een gedeactiveerd lid (opgezegd of mislukte rebill).
// Vervangt de hele portaalinhoud: alleen betaalgegevens wijzigen + membership hervatten is mogelijk.
// Stripe: Stripe Elements (kaart) → SetupIntent → /api/portal/reactivate {action:"stripe"} (+3DS indien nodig).
// PayPal: knop → /api/portal/reactivate {action:"paypal"} → redirect naar PayPal → terug op /riattiva?pp=1.
import { useEffect, useRef, useState } from "react";
import { post, SUPPORT_EMAIL } from "./AuthShell";

export const REACT_CSS = `
.rx{max-width:560px;margin:0 auto}
.rx .badge{display:inline-flex;align-items:center;gap:8px;background:#fdeee4;color:#c96f43;border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px;letter-spacing:.3px;text-transform:uppercase;margin-bottom:14px}
.rx h1{margin:0 0 8px}
.rx .why{font-size:16px;color:#444;margin:0 0 22px;line-height:1.5}
.rx .lost{background:#fff;border:1px solid #ecdccf;border-radius:14px;padding:16px 18px;margin-bottom:18px}
.rx .lost b{display:block;margin-bottom:8px}
.rx .lost ul{margin:0;padding-left:18px;color:#555;font-size:15px;line-height:1.6}
.rx .pay{background:#fff;border:1px solid #e6e8ec;border-radius:14px;padding:18px}
.rx .pay h4{margin:0 0 4px;font-size:12.5px;letter-spacing:.6px;text-transform:uppercase;color:#888}
.rx .pay .price{font-size:22px;font-weight:800;margin:0 0 14px}.rx .pay .price span{font-size:14px;color:#777;font-weight:500}
.rx .cardbox{border:1px solid #d9dde3;border-radius:10px;padding:12px 14px;background:#fff;margin:8px 0 14px}
.rx .btn{width:100%}
.rx .pp-btn{background:#ffc439;color:#003087}
.rx .fine{font-size:12.5px;color:#777;margin:12px 0 0;text-align:center;line-height:1.5}
.rx .err{background:#fdecea;color:#b3261e;border-radius:10px;padding:10px 14px;margin:0 0 12px;font-size:14px}
.rx .ok{background:#eef8f1;border:1px solid #cfe6d6;border-radius:14px;padding:22px;text-align:center}
.rx .ok h2{margin:8px 0 6px}
.rx .alt{margin-top:18px;text-align:center;font-size:14px;color:#666}
`;

export default function Reactivate({ t, lang, data, reload }) {
  const reason = data.deactivatedReason; // "payment_failed" | "cancelled" | "paused"
  const provider = data.membership?.provider;
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState(provider === "paypal" ? "paypal" : "card"); // card | paypal
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const stripeRef = useRef(null), elRef = useRef(null), cardRef = useRef(null), secretRef = useRef(null);

  useEffect(() => { fetch("/api/checkout-config").then((r) => r.json()).then(setCfg).catch(() => setCfg({})); }, []);

  // PayPal-terugkeer (?pp=1&subscription_id=I-…) afronden
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("subscription_id");
    if (p.get("pp") !== "1" || !id) return;
    setBusy(true);
    post("/api/portal/reactivate", { action: "paypal_confirm", id }).then((r) => {
      if (r.ok) { setDone(true); window.history.replaceState(null, "", window.location.pathname); setTimeout(() => reload && reload(), 1800); }
      else setErr(t(errKey(r.error)));
      setBusy(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stripe Elements kaartveld
  useEffect(() => {
    if (mode !== "card" || !cfg?.stripePk || stripeRef.current || done) return;
    let cancelled = false;
    (async () => {
      const r = await post("/api/portal/reactivate", { action: "setup" });
      if (!r.ok || cancelled) { if (!r.ok) setErr(t(errKey(r.error))); return; }
      secretRef.current = r.clientSecret;
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(cfg.stripePk, { locale: lang === "it" ? "it" : "en" });
      if (cancelled) return;
      stripeRef.current = stripe;
      const elements = stripe.elements();
      const card = elements.create("card", { hidePostalCode: true, style: { base: { fontSize: "16px", color: "#1a1a1a", "::placeholder": { color: "#9aa0a6" } } } });
      card.mount(cardRef.current);
      elRef.current = card;
    })();
    return () => { cancelled = true; };
  }, [mode, cfg, done]); // eslint-disable-line react-hooks/exhaustive-deps

  async function payCard() {
    if (busy || !stripeRef.current || !elRef.current) return;
    setBusy(true); setErr("");
    try {
      const { setupIntent, error } = await stripeRef.current.confirmCardSetup(secretRef.current, { payment_method: { card: elRef.current, billing_details: { email: data.member.email, name: [data.member.firstName, data.member.lastName].filter(Boolean).join(" ") || undefined } } });
      if (error) throw new Error(error.message);
      let r = await post("/api/portal/reactivate", { action: "stripe", paymentMethodId: setupIntent.payment_method });
      if (!r.ok && r.requires_action && r.clientSecret) {
        const res = await stripeRef.current.confirmCardPayment(r.clientSecret);
        if (res.error) throw new Error(res.error.message);
        r = await post("/api/portal/reactivate", { action: "stripe_confirm", subscriptionId: r.subscriptionId });
      }
      if (!r.ok) throw new Error(t(errKey(r.error)));
      setDone(true);
      setTimeout(() => reload && reload(), 1800);
    } catch (e) {
      setErr(e.message || t("errPayFailed"));
      setBusy(false);
    }
  }

  async function payPaypal() {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await post("/api/portal/reactivate", { action: "paypal" });
    if (r.ok && r.url) { window.location.href = r.url; return; }
    setErr(t(errKey(r.error))); setBusy(false);
  }

  // Gepauzeerd door customer service: geen betaalscherm, alleen uitleg + einddatum
  if (reason === "paused") {
    const until = data.pausedUntil ? new Date(data.pausedUntil).toLocaleDateString(lang === "it" ? "it-IT" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
    return (
      <div className="rx">
        <div className="badge">⏸ {t("rxBadge")}</div>
        <h1>{t("rxTitlePaused")}</h1>
        <p className="why">{t("rxWhyPaused", { date: until })}</p>
        <p className="fine" style={{ textAlign: "left" }}>{t("rxPausedHelp", { email: SUPPORT_EMAIL })}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rx"><div className="ok"><div style={{ fontSize: 40 }}>🎉</div><h2>{t("rxDoneTitle")}</h2><p style={{ margin: 0, color: "#444" }}>{t("rxDoneSub")}</p></div></div>
    );
  }

  return (
    <div className="rx">
      <div className="badge">⏸ {t("rxBadge")}</div>
      <h1>{reason === "payment_failed" ? t("rxTitleFailed") : t("rxTitleCancelled")}</h1>
      <p className="why">{reason === "payment_failed" ? t("rxWhyFailed") : t("rxWhyCancelled")}</p>
      <div className="lost"><b>{t("rxLostTitle")}</b><ul><li>{t("rxLost1")}</li><li>{t("rxLost2")}</li><li>{t("rxLost3")}</li></ul></div>

      <div className="pay">
        <h4>{t("rxPayTitle")}</h4>
        <div className="price">{t("rxPrice")} <span>{t("rxPriceNote")}</span></div>
        {err && <div className="err">{err}</div>}
        {mode === "card" ? (
          <>
            <div className="cardbox"><div ref={cardRef} /></div>
            <button type="button" className="btn" disabled={busy || !cfg?.stripePk} onClick={payCard}>{busy ? t("processing") : t("rxBtnCard")}</button>
            {cfg?.paypalClientId && <div className="alt"><a href="#paypal" onClick={(e) => { e.preventDefault(); setMode("paypal"); }}>{t("rxUsePaypal")}</a></div>}
          </>
        ) : (
          <>
            <button type="button" className="btn pp-btn" disabled={busy} onClick={payPaypal}>{busy ? t("processing") : t("rxBtnPaypal")}</button>
            {cfg?.stripePk && <div className="alt"><a href="#card" onClick={(e) => { e.preventDefault(); stripeRef.current = null; setMode("card"); }}>{t("rxUseCard")}</a></div>}
          </>
        )}
        <p className="fine">{t("rxFine", { email: SUPPORT_EMAIL })}</p>
      </div>
    </div>
  );
}

function errKey(code) {
  return { card_declined: "errCardDeclined", payment_failed: "errPayFailed", payment_method: "errPayFailed", active: "rxAlreadyActive", server: "errPayFailed", stripe: "errPayFailed", paypal: "errPayFailed", unauthorized: "errPayFailed" }[code] || "errPayFailed";
}
