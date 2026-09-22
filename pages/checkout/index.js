// pages/checkout/index.js
// Eigen checkout op checkout.getjustjenny.com — replica van de Shopify-checkout, in het Italiaans.
// Bundel komt van de salespagina via ?b=1|2|3|5, de jjb_-tracking komt mee als query-params
// (jjb-track.js hangt ze automatisch aan de link).
//
// Betaling: Stripe Payment Element (kaart, PayPal, Apple/Google Pay) in "deferred" modus —
// bij het bevestigen maakt /api/stripe/subscribe de klant + het abonnement en betalen we
// de eerste factuur (bundel + verzending). Membership start na 7 dagen proef.

import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, ExpressCheckoutElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { pickBundle, SHIPPING, MEMBERSHIP, PROVINCES, totals, fmtEur, TRACK_KEYS, PRODUCT_TITLE } from "../../lib/checkout";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, { locale: "it" }) : null;

// Productfoto's per bundel (Shopify CDN — dezelfde als op de salespagina)
const BUNDLE_IMG = {
  1: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_aa37d423-8b7a-450f-8ea6-83c2aff726c2.png?v=1783404886&width=240",
  2: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_1.png?v=1783404885&width=240",
  3: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_2.png?v=1783404886&width=240",
  5: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3copy_1c26406e-68ad-44c1-a428-5d99f4ff1fa7.png?v=1783404886&width=240",
};

const GREEN = "#5f9a7c"; // Shopify-checkout groen (knop, accenten)

const css = `
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .ck-wrap{display:grid;grid-template-columns:minmax(0,1fr) 42%;min-height:calc(100vh - 118px)}
  .ck-main{padding:34px 8% 60px;border-right:1px solid #e6e6e6}
  .ck-side{background:#f5f5f5;padding:34px 7% 60px 40px;position:sticky;top:0;align-self:start}
  .ck-h2{font-size:21px;font-weight:600;margin:26px 0 12px}
  .ck-field{position:relative;margin-bottom:10px}
  .ck-field input,.ck-field select{width:100%;height:52px;padding:20px 14px 6px;border:1px solid #dedede;border-radius:6px;font-size:15px;background:#fff;color:#1a1a1a;outline:none;appearance:none;-webkit-appearance:none;font-family:inherit}
  .ck-field input:focus,.ck-field select:focus{border-color:${GREEN};box-shadow:0 0 0 1px ${GREEN}}
  .ck-field.err input,.ck-field.err select{border-color:#d72c0d;box-shadow:0 0 0 1px #d72c0d}
  .ck-field label{position:absolute;left:14px;top:16px;font-size:15px;color:#737373;pointer-events:none;transition:all .12s}
  .ck-field.has label,.ck-field input:focus+label,.ck-field select:focus+label{top:7px;font-size:12px}
  .ck-field .chev{position:absolute;right:14px;top:19px;color:#737373;pointer-events:none}
  .ck-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ck-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .ck-opt{display:flex;align-items:center;gap:12px;padding:16px 14px;border:1px solid #dedede;border-radius:6px;cursor:pointer;background:#fff;margin-top:-1px}
  .ck-opt.on{border-color:${GREEN};background:#f0f5f2;position:relative;z-index:1;border-radius:6px}
  .ck-opt:first-child{border-radius:6px 6px 0 0}.ck-opt:last-child{border-radius:0 0 6px 6px}
  .ck-radio{width:18px;height:18px;border-radius:50%;border:1px solid #bbb;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:#fff}
  .ck-opt.on .ck-radio{border-color:${GREEN}}
  .ck-opt.on .ck-radio::after{content:"";width:10px;height:10px;border-radius:50%;background:${GREEN}}
  .ck-btn{width:100%;height:60px;border:none;border-radius:8px;background:${GREEN};color:#fff;font-size:18px;font-weight:700;cursor:pointer;margin-top:22px;font-family:inherit}
  .ck-btn:disabled{opacity:.6;cursor:default}
  .ck-check{display:flex;align-items:center;gap:10px;font-size:14px;margin:12px 0 6px;cursor:pointer}
  .ck-check input{width:18px;height:18px;accent-color:${GREEN}}
  .ck-trust{margin:18px auto 0;max-width:470px;border:1px solid #e6e6e6;border-radius:6px;overflow:hidden;font-size:11px}
  .ck-trust .t1{background:#f2f2f2;padding:8px 12px;text-align:center;font-weight:700;font-size:13px}
  .ck-trust .t2{background:#f2f2f2;padding:0 12px 8px;text-align:center;color:#444}
  .ck-trust .t3{padding:8px 12px;text-align:center}
  .ck-trust .t3 span{background:#e9ecef;border-radius:999px;padding:4px 12px;font-weight:600;color:#2b3a33}
  .ck-summary-toggle{display:none}
  .ck-line{display:flex;justify-content:space-between;font-size:14px;margin:6px 0}
  .ck-total{display:flex;justify-content:space-between;align-items:baseline;font-size:19px;font-weight:700;margin-top:10px}
  .ck-mem{margin-top:16px;padding:12px 14px;background:#fff;border:1px solid #e3e3e3;border-radius:8px;font-size:12.5px;color:#444;line-height:1.5}
  .ck-err{background:#fff4f4;border:1px solid #f3c2bd;color:#b42318;border-radius:6px;padding:10px 12px;font-size:13.5px;margin-top:14px}
  .ck-express-note{font-size:14px;color:#555;text-align:center;margin:10px 0 14px}
  @media (max-width:900px){
    .ck-wrap{display:block}
    .ck-main{padding:14px 16px 40px;border-right:none}
    .ck-side{display:none}
    .ck-summary-toggle{display:block;background:#f5f5f5;border-top:1px solid #e6e6e6;border-bottom:1px solid #e6e6e6;padding:14px 16px;font-size:14px}
    .ck-summary-toggle .row{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
    .ck-summary-toggle .row b{font-size:18px}
    .ck-summary-toggle .who{color:${GREEN};font-weight:500}
    .ck-row3{grid-template-columns:1fr}
    .ck-row{grid-template-columns:1fr 1fr}
    .ck-sticky{position:sticky;bottom:0;background:#fff;padding:10px 0 6px;border-top:1px solid #eee;margin-top:16px}
  }
`;

function Field({ id, label, value, onChange, type = "text", error, autoComplete, inputMode, maxLength, children }) {
  const has = value !== "" && value != null;
  return (
    <div className={`ck-field${has ? " has" : ""}${error ? " err" : ""}`}>
      {children ? (
        <>
          {children}
          <label htmlFor={id}>{label}</label>
          <span className="chev">⌄</span>
        </>
      ) : (
        <>
          <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} placeholder=" " />
          <label htmlFor={id}>{label}</label>
        </>
      )}
    </div>
  );
}

function Summary({ bundle, ship, compact }) {
  const t = totals(bundle, ship);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: compact ? "12px" : "22px" }}>
        <div style={{ position: "relative", width: "64px", height: "64px", border: "1px solid #e3e3e3", borderRadius: "8px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <img src={BUNDLE_IMG[bundle.qty]} alt="" style={{ maxWidth: "58px", maxHeight: "58px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <span style={{ position: "absolute", top: "-8px", right: "-8px", background: "#1a1a1a", color: "#fff", borderRadius: "999px", fontSize: "12px", fontWeight: 700, width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>{PRODUCT_TITLE}</div>
          <div style={{ fontSize: "13px", color: "#737373" }}>{bundle.qty}</div>
        </div>
        <div style={{ fontSize: "14px", fontWeight: 500 }}>{fmtEur(bundle.price)}</div>
      </div>
      <div className="ck-line"><span>Subtotale</span><span>{fmtEur(t.subtotal)}</span></div>
      <div className="ck-line"><span>Spedizione</span><span>{t.shipping ? fmtEur(t.shipping) : "GRATIS"}</span></div>
      <div className="ck-total"><span>Totale</span><span><span style={{ fontSize: "12px", color: "#737373", fontWeight: 400, marginRight: "6px" }}>EUR</span>{fmtEur(t.total)}</span></div>
      <div className="ck-mem">
        <b>Incluso: NeuroTone Membership</b> — {MEMBERSHIP.trialDays} giorni di prova gratuita, poi {fmtEur(MEMBERSHIP.price)} ogni {MEMBERSHIP.intervalDays} giorni. Oggi paghi solo {fmtEur(t.total)}. Annulla quando vuoi dal tuo portale.
      </div>
    </div>
  );
}

/* ---------------- het formulier (binnen <Elements>) ---------------- */
function CheckoutForm({ bundle, track, shipCode, setShipCode, preview }) {
  const stripe = useStripe();
  const elements = useElements();
  const ship = SHIPPING[shipCode] || SHIPPING.insured;
  const t = totals(bundle, ship);

  const [f, setF] = useState({ email: "", firstName: "", lastName: "", address1: "", address2: "", zip: "", city: "", province: "", phone: "", smsOptIn: false });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [payReady, setPayReady] = useState(false);
  const formRef = useRef(null);

  // Bedrag in het Payment Element mee laten bewegen met de verzendkeuze
  useEffect(() => {
    if (elements) elements.update({ amount: t.total });
  }, [elements, t.total]);

  const validate = () => {
    const e = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 1;
    if (!f.firstName.trim()) e.firstName = 1;
    if (!f.lastName.trim()) e.lastName = 1;
    if (!f.address1.trim()) e.address1 = 1;
    if (!/^\d{5}$/.test(f.zip.trim())) e.zip = 1;
    if (!f.city.trim()) e.city = 1;
    if (!f.province) e.province = 1;
    setErrors(e);
    if (Object.keys(e).length) {
      const first = formRef.current?.querySelector(".ck-field.err input, .ck-field.err select");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus();
      return false;
    }
    return true;
  };

  const submit = async (ev) => {
    ev?.preventDefault?.();
    if (busy || !stripe || !elements) return;
    setMsg("");
    if (!validate()) return;
    setBusy(true);
    try {
      // 1. Payment Element valideren
      const { error: subErr } = await elements.submit();
      if (subErr) throw new Error(subErr.message || "Controlla i dati di pagamento");

      // 2. klant + abonnement + eerste factuur aanmaken
      const r = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, bundle: bundle.qty, shipping: ship.code, track }),
      }).then((x) => x.json());
      if (r.error) {
        if (r.fields) setErrors(Object.fromEntries(r.fields.map((k) => [k, 1])));
        throw new Error(r.error);
      }

      // 3. betalen (redirect alleen als de betaalmethode dat vereist, bv. PayPal)
      const returnUrl = `${window.location.origin}/checkout/grazie?sub=${encodeURIComponent(r.subscriptionId)}&b=${bundle.qty}`;
      const confirmParams = {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            name: `${f.firstName} ${f.lastName}`.trim(),
            email: f.email.trim(),
            phone: f.phone.trim() || undefined,
            address: { line1: f.address1, line2: f.address2 || undefined, postal_code: f.zip, city: f.city, state: f.province, country: "IT" },
          },
        },
      };
      const result =
        r.type === "setup"
          ? await stripe.confirmSetup({ elements, clientSecret: r.clientSecret, confirmParams, redirect: "if_required" })
          : await stripe.confirmPayment({ elements, clientSecret: r.clientSecret, confirmParams, redirect: "if_required" });
      if (result.error) throw new Error(result.error.message || "Pagamento non riuscito");
      window.location.href = returnUrl + "&ok=1";
    } catch (e) {
      setMsg(e.message || "Si è verificato un errore. Riprova.");
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      {/* Express checkout (Apple Pay / Google Pay / PayPal) — toont alleen wat beschikbaar is */}
      <div style={{ marginTop: "8px" }}>
        <div className="ck-express-note">Check-out rapido</div>
        <ExpressCheckoutElement
          options={{ buttonType: { applePay: "buy", googlePay: "buy", paypal: "buynow" }, buttonHeight: 48, layout: { maxColumns: 3, overflow: "auto" }, paymentMethods: { link: "never" } }}
          onConfirm={async (event) => {
            // Express wallets vullen adres/e-mail zelf in; daarna dezelfde server-flow
            setMsg("");
            setBusy(true);
            try {
              const ba = event.billingDetails || {};
              const sa = event.shippingAddress || {};
              const nameParts = String(sa.name || ba.name || "").split(" ");
              const body = {
                email: ba.email || f.email,
                firstName: nameParts[0] || f.firstName,
                lastName: nameParts.slice(1).join(" ") || f.lastName,
                address1: sa.address?.line1 || ba.address?.line1 || f.address1,
                address2: sa.address?.line2 || "",
                zip: sa.address?.postal_code || ba.address?.postal_code || f.zip,
                city: sa.address?.city || ba.address?.city || f.city,
                province: sa.address?.state || ba.address?.state || f.province,
                phone: ba.phone || f.phone,
                bundle: bundle.qty,
                shipping: ship.code,
                track,
              };
              const r = await fetch("/api/stripe/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
              if (r.error) throw new Error(r.error);
              const returnUrl = `${window.location.origin}/checkout/grazie?sub=${encodeURIComponent(r.subscriptionId)}&b=${bundle.qty}`;
              const result = await stripe.confirmPayment({ elements, clientSecret: r.clientSecret, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
              if (result.error) throw new Error(result.error.message);
              window.location.href = returnUrl + "&ok=1";
            } catch (e) {
              setMsg(e.message || "Pagamento non riuscito");
              setBusy(false);
            }
          }}
          onShippingAddressChange={(ev) => ev.resolve({ shippingRates: [{ id: ship.code, displayName: ship.title, amount: ship.price }] })}
          onClick={(ev) => ev.resolve({ emailRequired: true, phoneNumberRequired: false, shippingAddressRequired: true, allowedShippingCountries: ["IT"], shippingRates: [{ id: ship.code, displayName: ship.title, amount: ship.price }] })}
        />
        <p style={{ fontSize: "14px", color: "#555", textAlign: "center", margin: "14px 0 0" }}>⚠️ Attenzione: scorte limitate! Effettua il tuo ordine prima dell’esaurimento delle scorte.</p>
      </div>

      <h2 className="ck-h2">Contatti</h2>
      <Field id="email" label="Email" type="email" value={f.email} onChange={set("email")} error={errors.email} autoComplete="email" inputMode="email" />

      <h2 className="ck-h2">Consegna</h2>
      <div className="ck-field has">
        <select id="country" value="IT" onChange={() => {}} disabled style={{ color: "#1a1a1a", background: "#fff" }}>
          <option value="IT">Italia</option>
        </select>
        <label htmlFor="country">Paese / Regione</label>
        <span className="chev">⌄</span>
      </div>
      <div className="ck-row">
        <Field id="firstName" label="Nome" value={f.firstName} onChange={set("firstName")} error={errors.firstName} autoComplete="given-name" />
        <Field id="lastName" label="Cognome" value={f.lastName} onChange={set("lastName")} error={errors.lastName} autoComplete="family-name" />
      </div>
      <Field id="address1" label="Indirizzo" value={f.address1} onChange={set("address1")} error={errors.address1} autoComplete="address-line1" />
      <Field id="address2" label="Interno, scala, ecc. (facoltativo)" value={f.address2} onChange={set("address2")} autoComplete="address-line2" />
      <div className="ck-row3">
        <Field id="zip" label="CAP" value={f.zip} onChange={(v) => set("zip")(v.replace(/\D/g, "").slice(0, 5))} error={errors.zip} autoComplete="postal-code" inputMode="numeric" maxLength={5} />
        <Field id="city" label="Città" value={f.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
        <Field id="province" label="Provincia" value={f.province} error={errors.province}>
          <select id="province" value={f.province} onChange={(e) => set("province")(e.target.value)} autoComplete="address-level1">
            <option value=""></option>
            {PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </Field>
      </div>
      <Field id="phone" label="Telefono (facoltativo)" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" />
      <label className="ck-check">
        <input type="checkbox" checked={f.smsOptIn} onChange={(e) => set("smsOptIn")(e.target.checked)} />
        Inviami SMS con notizie e offerte
      </label>

      <div style={{ fontSize: "17px", fontWeight: 700, margin: "18px 0 10px" }}>Ordina entro le 23:00 = spedito domani ✔️</div>
      <div>
        {Object.values(SHIPPING).map((o) => (
          <div key={o.code} className={`ck-opt${shipCode === o.code ? " on" : ""}`} onClick={() => setShipCode(o.code)}>
            <span className="ck-radio" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: 600 }}>{o.title}</div>
              <div style={{ fontSize: "13.5px", color: "#555" }}>{o.sub}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700 }}>{o.price ? fmtEur(o.price) : "GRATIS"}</div>
          </div>
        ))}
      </div>

      <h2 className="ck-h2" style={{ marginTop: "30px", marginBottom: "4px" }}>Pagamento</h2>
      <div style={{ fontSize: "14px", color: "#555", marginBottom: "12px" }}>Nessun risultato in 90 giorni? Rimborso garantito!</div>
      <div style={{ border: "1px solid #dedede", borderRadius: "8px", padding: "14px", background: "#fafafa" }}>
        {preview && (
          <div style={{ fontSize: "13px", color: "#8a6d1f", background: "#fff8e6", border: "1px solid #f3dfa6", borderRadius: "6px", padding: "10px 12px" }}>
            Anteprima \u2014 il pagamento non \u00e8 ancora collegato. Carta e PayPal appariranno qui.
          </div>
        )}
        <PaymentElement
          onReady={() => setPayReady(true)}
          options={{
            layout: { type: "accordion", defaultCollapsed: false, radios: true, spacedAccordionItems: false },
            fields: { billingDetails: { name: "auto", email: "never", phone: "never", address: "never" } },
            wallets: { applePay: "never", googlePay: "never" }, // zitten al in de express-knoppen bovenaan
            terms: { card: "never", paypal: "never" },
          }}
        />
      </div>
      <p style={{ fontSize: "12.5px", color: "#555", margin: "12px 0 0", lineHeight: 1.5 }}>
        Confermando l’ordine attivi anche la <b>NeuroTone Membership</b>: {MEMBERSHIP.trialDays} giorni di prova gratuita, poi {fmtEur(MEMBERSHIP.price)} ogni {MEMBERSHIP.intervalDays} giorni con lo stesso metodo di pagamento. Puoi annullare in qualsiasi momento.
      </p>

      {msg && <div className="ck-err">{msg}</div>}

      <div className="ck-sticky">
        <button type="submit" className="ck-btn" disabled={busy || !stripe || !payReady}>
          {busy ? "Elaborazione…" : "Sì! Confermo l’ordine!"}
        </button>
      </div>
      <p style={{ marginTop: "26px", fontSize: "14px" }}><a href="https://www.getjustjenny.com/policies/privacy-policy" style={{ color: GREEN }}>Informativa sulla privacy</a></p>
    </form>
  );
}

/* ---------------- pagina ---------------- */
export default function Checkout() {
  const [ready, setReady] = useState(false);
  const [bundle, setBundle] = useState(() => pickBundle(3));
  const [track, setTrack] = useState({});
  const [shipCode, setShipCode] = useState("insured");
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setBundle(pickBundle(q.get("b") || q.get("bundle") || q.get("qty")));
    const tr = {};
    for (const k of TRACK_KEYS) {
      const v = q.get(k) || q.get(`jjb_${k}`) || q.get(`attributes[jjb_${k}]`);
      if (v) tr[k] = v;
    }
    if (q.get("pg")) tr.pg = q.get("pg");
    setTrack(tr);
    setReady(true);
  }, []);

  const ship = SHIPPING[shipCode] || SHIPPING.insured;
  const t = totals(bundle, ship);

  const elementsOptions = useMemo(
    () => ({
      mode: "subscription",
      amount: t.total,
      currency: "eur",
      setupFutureUsage: "off_session",
      locale: "it",
      appearance: {
        theme: "stripe",
        variables: { colorPrimary: GREEN, colorText: "#1a1a1a", borderRadius: "6px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSizeBase: "15px" },
        rules: { ".Input": { border: "1px solid #dedede", boxShadow: "none" }, ".Input:focus": { borderColor: GREEN, boxShadow: `0 0 0 1px ${GREEN}` }, ".AccordionItem": { border: "1px solid #dedede" }, ".AccordionItem--selected": { borderColor: GREEN, backgroundColor: "#f0f5f2" } },
      },
    }),
    // amount hoort niet in de deps: we updaten via elements.update() om het element niet te herladen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <>
      <Head>
        <title>Checkout — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>

      {/* Trust-balk */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "0 16px 14px" }}>
        <div className="ck-trust">
          <div className="t1">🇮🇹 Valutazione 4,8 ⭐ da oltre 14.000 clienti</div>
          <div className="t2">🚚 Spedizione gratuita &nbsp; 🔒 Ordine sicuro &nbsp; 🔄 Garanzia 90 giorni</div>
          <div className="t3"><span>🔒 Il tuo pagamento è sicuro e protetto</span></div>
        </div>
        <span style={{ position: "absolute", right: "28px", top: "36px", color: GREEN, fontSize: "22px" }}>🛍️</span>
      </div>

      {/* Mobiel: inklapbaar overzicht */}
      <div className="ck-summary-toggle">
        <div className="row" onClick={() => setShowSummary((v) => !v)}>
          <span className="who">Riepilogo ordine {showSummary ? "▴" : "▾"}</span>
          <b>{fmtEur(t.total)}</b>
        </div>
        {showSummary && <div style={{ marginTop: "14px" }}><Summary bundle={bundle} ship={ship} compact /></div>}
      </div>

      <div className="ck-wrap">
        <div className="ck-main">
          {ready ? (
            // Zonder Stripe-key draait de pagina in preview: alles zichtbaar en klikbaar,
            // alleen het betaalblok is leeg en de knop staat uit. Zo kan de funnel al getest worden.
            <Elements stripe={stripePromise || null} options={elementsOptions}>
              <CheckoutForm bundle={bundle} track={track} shipCode={shipCode} setShipCode={setShipCode} preview={!stripePromise} />
            </Elements>
          ) : null}
        </div>
        <div className="ck-side">
          <Summary bundle={bundle} ship={ship} />
        </div>
      </div>
    </>
  );
}
