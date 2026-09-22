// pages/checkout/grazie.js
// Bedankpagina na de Stripe-betaling. Stripe stuurt de klant hierheen (return_url) met
// ?sub=<subscription>&b=<bundel>; bij een redirect-betaalmethode (PayPal) staat ook
// redirect_status in de URL. We tonen een bevestiging — de post-purchase (upsell) komt hier later.

import { useEffect, useState } from "react";
import Head from "next/head";
import { pickBundle, MEMBERSHIP, fmtEur, PRODUCT_TITLE } from "../../lib/checkout";

const GREEN = "#5f9a7c";

export default function Grazie() {
  const [bundle, setBundle] = useState(() => pickBundle(3));
  const [status, setStatus] = useState("ok"); // ok | pending | failed
  const [sub, setSub] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setBundle(pickBundle(q.get("b")));
    setSub(q.get("sub") || "");
    const rs = q.get("redirect_status");
    if (rs === "failed") setStatus("failed");
    else if (rs === "processing") setStatus("pending");
    else setStatus("ok");
  }, []);

  return (
    <>
      <Head>
        <title>Grazie — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: "#1a1a1a", padding: "40px 16px" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", background: "#fff", borderRadius: "12px", border: "1px solid #e6e6e6", padding: "32px 28px" }}>
          {status === "failed" ? (
            <>
              <h1 style={{ fontSize: "24px", margin: "0 0 10px" }}>Pagamento non riuscito</h1>
              <p style={{ color: "#555", lineHeight: 1.6 }}>Il pagamento non è andato a buon fine. Nessun importo è stato addebitato. <a href={`/checkout?b=${bundle.qty}`} style={{ color: GREEN, fontWeight: 600 }}>Riprova</a>.</p>
            </>
          ) : (
            <>
              <div style={{ width: "56px", height: "56px", borderRadius: "999px", background: "#eaf4ee", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", marginBottom: "16px" }}>✓</div>
              <h1 style={{ fontSize: "26px", margin: "0 0 6px" }}>{status === "pending" ? "Ordine in elaborazione" : "Grazie per il tuo ordine!"}</h1>
              <p style={{ color: "#555", lineHeight: 1.6, margin: "0 0 22px" }}>
                {status === "pending"
                  ? "Stiamo confermando il pagamento. Riceverai un’email non appena l’ordine sarà confermato."
                  : "Il tuo ordine è confermato. Riceverai un’email con tutti i dettagli e il tracciamento della spedizione."}
              </p>

              <div style={{ border: "1px solid #e6e6e6", borderRadius: "10px", padding: "16px", marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", fontWeight: 600 }}>
                  <span>{bundle.label} — {PRODUCT_TITLE}</span><span>{fmtEur(bundle.price)}</span>
                </div>
                <div style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>Ordina entro le 23:00 = spedito domani ✔️</div>
              </div>

              <div style={{ background: "#f7f9f8", border: "1px solid #dfe8e3", borderRadius: "10px", padding: "16px", fontSize: "14px", lineHeight: 1.6 }}>
                <b>La tua NeuroTone Membership è attiva.</b><br />
                {MEMBERSHIP.trialDays} giorni di prova gratuita, poi {fmtEur(MEMBERSHIP.price)} ogni {MEMBERSHIP.intervalDays} giorni. Riceverai a breve l’accesso al portale, dove puoi gestire o annullare l’abbonamento in qualsiasi momento.
                {sub ? <div style={{ fontSize: "12px", color: "#737373", marginTop: "8px" }}>Rif. {sub}</div> : null}
              </div>

              {/* TODO post-purchase: hier komt straks de one-click upsell (opgeslagen betaalmethode → één klik) */}
            </>
          )}
          <p style={{ marginTop: "24px", fontSize: "13px", color: "#737373" }}>Domande? Scrivici: <a href="mailto:info@getjustjenny.com" style={{ color: GREEN }}>info@getjustjenny.com</a></p>
        </div>
      </div>
    </>
  );
}
