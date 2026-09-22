// pages/checkout/grazie.js
// Bedankpagina na de Stripe-betaling — opgebouwd zoals de Shopify-orderstatuspagina:
// trust-balk, enquête (quiz), ordernummer, "Confermato", artikelen + totalen, klantgegevens.
// Stripe stuurt de klant hierheen (return_url) met ?sub=<subscription>&b=<bundel>;
// bij PayPal staat ook redirect_status in de URL.
// Zonder ?sub= draait de pagina als preview met voorbeeldgegevens.
// TODO post-purchase: hier komt later de one-click upsell.

import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { pickBundle, SHIPPING, MEMBERSHIP, fmtEur, PRODUCT_TITLE } from "../../lib/checkout";

// Enquête (post-purchase quiz). Antwoorden → Google Sheet via /api/checkout-quiz.
// Vragen aanpassen kan hier; de volgorde moet gelijk blijven aan de kolommen in de Sheet.
const QUIZ_INTRO = {
  title: "Rispondi alle seguenti domande (3 min) e potrai vincere un premio del valore di 10.000 €",
  sub: "Le vostre risposte non saranno condivise con terze parti.",
  done: "Grazie per le tue risposte!",
};
const QUIZ = [
  "Come stanno andando i tuoi acufeni in questo momento? Come li vivi?",
  "Cosa ti accorgi di evitare o di trovare difficile proprio a causa di questo?",
  "Quando di notte non riesci a dormire e pensi a questo problema, qual è la cosa peggiore che ti passa per la testa?",
  "Ti è mai capitato di evitare certe occasioni sociali a causa dei tuoi acufeni? Se sì, perché?",
  "Cosa hai trovato online su questo problema e cosa ne pensi di quelle informazioni?",
  "Secondo te, qual era la vera causa di questo problema?",
  "Cosa avevi già provato prima e perché non ha funzionato?",
  "Cosa ti ha spinto, alla fine, ad agire subito invece di aspettare ancora?",
  "Rispondi con sincerità: cosa ti ha quasi impedito di ordinare questo prodotto?",
  "Ma cosa ti ha convinto, alla fine, a provarlo comunque?",
  "Se funzionasse, qual è la prima cosa che vorresti cambiare?",
];

// Korte willekeurige ID (18 hex-tekens), zoals de SID's die al in de Sheet staan
const newSid = () => Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const GREEN = "#5f9a7c";
const PURPLE = "#5433eb";

const BUNDLE_IMG = {
  1: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_aa37d423-8b7a-450f-8ea6-83c2aff726c2.png?v=1783404886&width=240",
  2: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_1.png?v=1783404885&width=240",
  3: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3_2.png?v=1783404886&width=240",
  5: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Artboard3copy_1c26406e-68ad-44c1-a428-5d99f4ff1fa7.png?v=1783404886&width=240",
};

const BRAND = { amex: "American Express", visa: "Visa", mastercard: "Mastercard", maestro: "Maestro", discover: "Discover", jcb: "JCB", unionpay: "UnionPay", diners: "Diners Club" };
const WALLET = { apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };

const PREVIEW = {
  paid: true,
  created: Math.floor(Date.now() / 1000),
  qty: 3,
  shipping: "insured",
  amountPaid: 5390,
  email: "mario.rossi@example.it",
  name: "Mario Rossi",
  phone: "3331234567",
  address: { line1: "Via Roma 1", line2: "", postal_code: "20121", city: "Milano", state: "MI" },
  payment: { type: "card", brand: "visa", last4: "4242" },
  order: { name: "#0000", statusPageUrl: "#", tax: 0 },
};

const css = `
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .gz-wrap{max-width:672px;margin:0 auto;padding:0 16px 60px}
  .gz-card{border:1px solid #e3e3e3;border-radius:14px;background:#fff;padding:18px 16px;margin-top:18px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .ck-trust{margin:14px auto 0;max-width:300px;border:1px solid #e6e6e6;border-radius:4px;overflow:hidden;font-size:9px}
  .ck-trust .t1{background:#f2f2f2;padding:7px 10px 3px;text-align:center;font-weight:700;font-size:11px}
  .ck-trust .t2{background:#f2f2f2;padding:0 10px 7px;text-align:center;color:#444}
  .ck-trust .t3{padding:6px 10px;text-align:center}
  .ck-trust .t3 span{background:#e9ecef;border-radius:999px;padding:3px 10px;font-weight:600;color:#2b3a33}
  .gz-q textarea{width:100%;min-height:124px;border:1px solid #d9d9d9;border-radius:10px;padding:14px 12px;font:inherit;font-size:15px;resize:vertical;outline:none;color:#1a1a1a}
  .gz-q textarea:focus{border-color:${GREEN};box-shadow:0 0 0 1px ${GREEN}}
  .gz-btn{border:none;border-radius:10px;background:${GREEN};color:#fff;font:inherit;font-size:15px;font-weight:700;padding:15px 16px;cursor:pointer}
  .gz-btn:disabled{opacity:.7;cursor:default}
  .gz-outline{border:1px solid #dcdcdc;border-radius:10px;background:#fff;color:${GREEN};font-weight:600;font-size:14.5px;padding:10px 12px;text-decoration:none;white-space:nowrap}
  .gz-track{display:inline-block;background:${PURPLE};color:#fff;border-radius:6px;padding:12px 16px;font-size:15px;font-weight:500;text-decoration:none;min-width:300px;text-align:center}
  .gz-line{display:flex;justify-content:space-between;font-size:14.5px;margin:6px 0}
  .gz-dl{border:1px solid #e3e3e3;border-radius:14px;margin-top:18px;overflow:hidden}
  .gz-dl .r{display:grid;grid-template-columns:112px 1fr;gap:12px;padding:16px;font-size:14.5px;line-height:1.45;border-top:1px solid #e3e3e3}
  .gz-dl .r:first-child{border-top:none}
  .gz-dl .k{color:#6b6b6b}
  .gz-note{background:#fff8e6;border:1px solid #f1dca7;border-radius:10px;padding:10px 12px;font-size:13px;color:#6b5314;margin-top:14px}
  @media (max-width:520px){ .gz-track{min-width:0;width:100%} .gz-dl .r{grid-template-columns:92px 1fr} }
`;

const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");

function paymentLabel(p) {
  if (!p) return "—";
  if (p.type === "card") {
    const brand = BRAND[p.brand] || (p.brand ? p.brand[0].toUpperCase() + p.brand.slice(1) : "Carta");
    return `${p.wallet && WALLET[p.wallet] ? WALLET[p.wallet] + " · " : ""}${brand} · ${p.last4}`;
  }
  if (p.type === "paypal") return "PayPal";
  if (p.type === "klarna") return "Klarna";
  return p.type;
}

function Quiz({ sub, preview }) {
  const key = `jjb_quiz_${sub || "preview"}`;
  const [st, setSt] = useState({ sid: "", first: 0, answers: [], done: false });
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);

  // Voortgang onthouden: wie de pagina ververst, gaat verder bij dezelfde vraag (zelfde rij in de Sheet)
  useEffect(() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    setSt(s && s.sid ? s : { sid: newSid(), first: Date.now(), answers: [], done: false });
  }, [key]);

  const i = Math.min(st.answers.length, QUIZ.length - 1);
  const done = st.done;

  const next = async () => {
    if (!a.trim() || busy) return;
    setBusy(true);
    const answers = [...st.answers, a.trim()];
    try {
      if (!preview) {
        await fetch("/api/checkout-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub, sid: st.sid, first: st.first, answers, questions: QUIZ }),
        });
      }
    } catch {}
    const nextSt = { ...st, answers, done: answers.length >= QUIZ.length };
    setSt(nextSt);
    try { localStorage.setItem(key, JSON.stringify(nextSt)); } catch {}
    setA("");
    setBusy(false);
  };

  if (done) {
    return (
      <div className="gz-card" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{ color: GREEN, fontSize: "20px" }}>✓</span>
        <span style={{ fontSize: "15px", fontWeight: 600 }}>{QUIZ_INTRO.done}</span>
      </div>
    );
  }

  return (
    <div className="gz-card gz-q">
      <div style={{ fontSize: "17px", fontWeight: 600, lineHeight: 1.35 }}>{QUIZ_INTRO.title}</div>
      <div style={{ fontSize: "14.5px", margin: "8px 0 22px" }}>{QUIZ_INTRO.sub}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline", marginBottom: "14px" }}>
        <div style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1.35 }}>{QUIZ[i]}</div>
        <div style={{ fontSize: "14px", color: "#333", flexShrink: 0 }}>{i + 1}/{QUIZ.length}</div>
      </div>
      <textarea value={a} onChange={(e) => setA(e.target.value)} placeholder={QUIZ[i]} maxLength={500} />
      <button className="gz-btn" onClick={next} disabled={!a.trim() || busy} style={{ marginTop: "12px" }}>
        {i >= QUIZ.length - 1 ? "Invia" : "Successivo"}
      </button>
    </div>
  );
}

export default function Grazie() {
  const [q, setQ] = useState(null); // { sub, b, rs }
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const tries = useRef(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ({ sub: p.get("sub") || "", b: p.get("b"), rs: p.get("redirect_status") || "" });
  }, []);

  // Gegevens ophalen; zolang de Shopify-order er nog niet is (webhook), even opnieuw proberen
  useEffect(() => {
    if (!q) return;
    if (!q.sub) { setData({ ...PREVIEW, qty: pickBundle(q.b).qty }); return; }
    let timer;
    const load = async () => {
      try {
        const r = await fetch(`/api/stripe/order?sub=${encodeURIComponent(q.sub)}`).then((x) => x.json());
        if (r.error) { setErr(r.error); return; }
        setData(r);
        tries.current += 1;
        if ((!r.order || !r.paid) && tries.current < 12) timer = setTimeout(load, 3000);
      } catch {
        if (tries.current++ < 5) timer = setTimeout(load, 3000);
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [q]);

  const preview = q && !q.sub;
  const failed = q?.rs === "failed";
  const bundle = pickBundle(data?.qty || q?.b);
  const ship = SHIPPING[data?.shipping] || SHIPPING.insured;
  const total = data?.amountPaid ?? bundle.price + ship.price;
  const date = fmtDate(data?.created || Math.floor(Date.now() / 1000));
  const addr = data?.address || {};

  return (
    <>
      <Head>
        <title>Grazie — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>

      <div className="gz-wrap">
        <div className="ck-trust">
          <div className="t1">🇮🇹 Valutazione 4,8 ⭐ da oltre 14.000 clienti</div>
          <div className="t2">🚚 Spedizione gratuita &nbsp; 🔒 Ordine sicuro &nbsp; 🔄 Garanzia 90 giorni</div>
          <div className="t3"><span>🔒 Il tuo pagamento è sicuro e protetto</span></div>
        </div>

        {preview && <div className="gz-note">Anteprima con dati di esempio — dopo un pagamento reale qui compaiono i dati dell’ordine.</div>}

        {failed ? (
          <div className="gz-card">
            <div style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Pagamento non riuscito</div>
            <div style={{ fontSize: "15px", color: "#555", lineHeight: 1.55 }}>
              Il pagamento non è andato a buon fine. Nessun importo è stato addebitato.{" "}
              <a href={`/checkout?b=${bundle.qty}`} style={{ color: GREEN, fontWeight: 600 }}>Riprova</a>
            </div>
          </div>
        ) : err ? (
          <div className="gz-card" style={{ fontSize: "15px", lineHeight: 1.55 }}>
            <b>Grazie per il tuo ordine!</b><br />Non riusciamo a caricare i dettagli in questo momento. Riceverai un’email di conferma.
          </div>
        ) : !data ? (
          <div className="gz-card" style={{ fontSize: "15px", color: "#666" }}>Caricamento del tuo ordine…</div>
        ) : (
          <>
            <Quiz sub={q.sub} preview={preview} />

            {/* Ordernummer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "26px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{data.order?.name ? `Ordine ${data.order.name}` : "Ordine confermato"}</div>
                <div style={{ fontSize: "14px", color: "#6b6b6b", marginTop: "3px" }}>Confermato il giorno {date}</div>
              </div>
              <a className="gz-outline" href={`/checkout?b=${bundle.qty}`}>Acquista di nuovo</a>
            </div>

            {/* Status */}
            <div className="gz-card">
              <div style={{ display: "flex", gap: "10px" }}>
                <span style={{ fontSize: "16px", lineHeight: "20px", color: "#444" }}>✓</span>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600 }}>{data.paid === false || q.rs === "processing" ? "In elaborazione" : "Confermato"}</div>
                  <div style={{ fontSize: "14.5px", marginTop: "2px" }}>
                    {data.paid === false || q.rs === "processing" ? "Stiamo confermando il pagamento. Riceverai un’email a breve." : "Stiamo preparando questi articoli per la spedizione."}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6b6b6b", marginTop: "4px" }}>{date}</div>
                </div>
              </div>
              {data.order?.statusPageUrl && (
                <div style={{ marginTop: "20px" }}>
                  <a className="gz-track" href={data.order.statusPageUrl} target="_blank" rel="noopener noreferrer">Traccia ordine</a>
                </div>
              )}
            </div>

            {/* Artikelen + totalen */}
            <div className="gz-card">
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <div style={{ position: "relative", width: "64px", height: "64px", border: "1px solid #e3e3e3", borderRadius: "10px", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={BUNDLE_IMG[bundle.qty]} alt="" style={{ maxWidth: "54px", maxHeight: "54px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  <span style={{ position: "absolute", top: "-8px", right: "-8px", background: "#111", color: "#fff", borderRadius: "999px", minWidth: "21px", height: "21px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>1</span>
                </div>
                <div style={{ flex: 1, fontSize: "14.5px", paddingTop: "14px" }}>
                  <div>{PRODUCT_TITLE}</div>
                  <div style={{ color: "#6b6b6b", fontSize: "13px", marginTop: "2px" }}>{bundle.label}</div>
                </div>
                <div style={{ fontSize: "14.5px", paddingTop: "14px" }}>{fmtEur(bundle.price)}</div>
              </div>
              <div style={{ marginTop: "26px" }}>
                <div className="gz-line"><span>Subtotale</span><span>{fmtEur(bundle.price)}</span></div>
                <div className="gz-line"><span>Spedizione</span><span>{ship.price ? fmtEur(ship.price) : "Gratuita"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "14px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 700 }}>Totale</span>
                  <span><span style={{ fontSize: "12px", color: "#6b6b6b", marginRight: "6px" }}>EUR</span><b style={{ fontSize: "19px" }}>{fmtEur(total)}</b></span>
                </div>
                {data.order && typeof data.order.tax === "number" && (
                  <div style={{ fontSize: "12.5px", color: "#6b6b6b", marginTop: "8px" }}>Incluse imposte per un ammontare di {fmtEur(data.order.tax)}</div>
                )}
              </div>
            </div>

            {/* Membership — transparant voor de klant (minder chargebacks) */}
            <div className="gz-card" style={{ fontSize: "13.5px", lineHeight: 1.55, color: "#333", background: "#f7f9f8", borderColor: "#dfe8e3" }}>
              <b>{MEMBERSHIP.name} attiva</b> — {MEMBERSHIP.trialDays} giorni di prova gratuita, poi {fmtEur(MEMBERSHIP.price)} ogni {MEMBERSHIP.intervalDays} giorni. Puoi annullare in qualsiasi momento.
            </div>

            {/* Klantgegevens */}
            <div className="gz-dl">
              <div className="r"><div className="k">Contatti</div><div style={{ wordBreak: "break-all" }}>{data.email || "—"}</div></div>
              <div className="r">
                <div className="k">Spedisci a</div>
                <div>
                  {data.name && <div>{data.name.toUpperCase()}</div>}
                  {addr.line1 && <div>{addr.line1.toUpperCase()}</div>}
                  {addr.line2 && <div>{addr.line2}</div>}
                  {(addr.postal_code || addr.city) && <div>{[addr.postal_code, addr.city, addr.state].filter(Boolean).join(" ")}</div>}
                  <div>Italia</div>
                  {data.phone && <div>{data.phone}</div>}
                </div>
              </div>
              <div className="r"><div className="k">Metodo</div><div>{ship.title}</div></div>
              <div className="r">
                <div className="k">Pagamento</div>
                <div>
                  <div>{paymentLabel(data.payment)}</div>
                  <div style={{ color: "#6b6b6b", fontSize: "13px", marginTop: "2px" }}>{fmtEur(total)} EUR · {date}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <p style={{ marginTop: "24px", fontSize: "13px", color: "#737373", textAlign: "center" }}>
          Domande? Scrivici: <a href="mailto:info@getjustjenny.com" style={{ color: GREEN }}>info@getjustjenny.com</a>
        </p>
      </div>
    </>
  );
}
