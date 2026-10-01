// pages/checkout/offerta.js — post-purchase upsell "1+1 gratis" (€29,95), tussen de betaling en de bedankpagina
//
// De checkout stuurt de klant hierheen (return_url / PayPal-redirect) met dezelfde query als de bedankpagina:
//   Stripe: ?sub=sub_…&b=<bundel>&redirect_status=…   PayPal: ?pp=I-…&b=<bundel>
// Groene knop (Stripe) → POST /api/stripe/upsell: afschrijving op de bewaarde kaart + 2x NeuroTone op de order.
// PayPal → gele PayPal-knop (één tik) → /api/paypal/upsell create/capture → idem.
// "No grazie" of klaar → /checkout/grazie met dezelfde query (+ &up=1 na een upsell).
// Zonder ?sub=/?pp= draait de pagina als preview.

import { useEffect, useRef, useState } from "react";
import Head from "next/head";

const IMG = {
  logo: "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114",
  product: "/checkout/upsell/neurotone-1plus1.webp",
  ingredients: "/checkout/upsell/neurotone-ingredienti.webp",
  badges: "/checkout/upsell/badges-it.webp",
  seal: "/checkout/upsell/garanzia-90.webp",
  doctor: "/checkout/upsell/dott-ferretti.jpg",
};

const css = `
:root{--page:#f3efd8;--peach:#fde2cc;--peach2:#fdf3ea;--terra:#e0855e;--fg:#222;--red:#ff1a1a;--green:#1fb833;--green-d:#179a2a;--fh:"Roboto",Arial,Helvetica,sans-serif;--fb:Arial,Helvetica,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:var(--page);color:var(--fg);font-family:var(--fb);line-height:1.5;font-size:17px;-webkit-font-smoothing:antialiased}
.col{max-width:600px;margin:0 auto;padding:0 0 32px}
.blk{padding:26px 22px}
.white{background:#fff}.peach{background:var(--peach)}.peach2{background:var(--peach2)}
.hdr{background:#fff;padding:18px 22px 14px;border-bottom:3px solid var(--terra)}
.logo{display:block;height:26px;width:auto;margin:0 auto}
h1,h2,h3{font-family:var(--fh);margin:0;line-height:1.18}
.c{text-align:center}
.wait h1{font-size:30px;font-weight:900;margin-bottom:10px}
.wait p{color:var(--red);font-weight:700;font-size:19px;margin:0}
.deal h2{font-size:30px;font-weight:900;margin-bottom:14px}
.deal img{display:block;width:88%;max-width:380px;height:auto;margin:0 auto 10px}
.badges{display:block;width:100%;max-width:420px;height:auto;margin:0 auto}
.stock h2{font-size:30px;font-weight:900;margin-bottom:8px}
.stock .red{color:var(--red);font-family:var(--fh);font-weight:900;font-size:27px;margin:0 0 16px}
.stock p,.stock2 p{font-size:19px;margin:0 0 16px}
.cta{display:flex;width:100%;border:0;border-radius:8px;background:var(--green);color:#fff;font-family:var(--fh);font-weight:700;font-size:22px;letter-spacing:.3px;padding:17px 16px;align-items:center;justify-content:center;gap:10px;cursor:pointer;margin:18px 0 14px;box-shadow:0 3px 0 var(--green-d)}
.cta:active{transform:translateY(2px);box-shadow:none}.cta:focus-visible{outline:3px solid var(--terra);outline-offset:2px}
.cta[disabled]{opacity:.75;cursor:wait}
.ppbox{margin:18px 0 14px;min-height:48px}
.secure{display:flex;gap:7px;align-items:center;justify-content:center;font-family:var(--fh);white-space:nowrap}
.secure b{display:block;font-size:11px;font-weight:900;letter-spacing:.2px;color:#333;line-height:1.2}.secure span{display:block;font-size:9.5px;color:#444;letter-spacing:.1px;line-height:1.2}
.err{margin:0 0 12px;color:#b3261e;font-size:14.5px;font-weight:700}
.letter h3{font-size:26px;font-weight:700;margin-bottom:14px}
.letter p{font-size:16px;margin:0 0 14px}
.avatar{display:block;width:170px;height:170px;border-radius:50%;object-fit:cover;margin:8px auto 18px;border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.1)}
.letter .prod{display:block;width:72%;max-width:320px;margin:6px auto 18px;clear:both}
.stock2 .small{font-size:16px;color:#444;margin:0 0 10px;line-height:1.3}
.stock2 h2{font-size:22px;font-weight:900;margin:0 0 10px;line-height:1.2}
.stock2 .red{color:var(--red);font-family:var(--fh);font-weight:900;font-size:clamp(14px,3.6vw,22px);margin:0 0 14px;line-height:1.3;white-space:nowrap}
.free{display:flex;gap:14px;align-items:center;background:var(--peach);border:2px solid var(--terra);padding:16px;margin:4px 0 18px;text-align:left}
.free b{font-family:var(--fh);font-size:18px;line-height:1.25}
.stock2 img{display:block;width:88%;max-width:380px;margin:22px auto 10px}
.guar{display:flex;gap:22px;align-items:center;padding:34px 22px}.guar .gt{flex:1;min-width:0}.guar h2{font-size:21px;font-weight:700;margin-bottom:14px}.guar h2 span{color:var(--terra)}
.guar p{font-size:16.5px;margin:0 0 14px}.guar p:last-child{margin:0}.seal{flex:none;width:170px;height:170px}
.decl p{font-family:var(--fb);font-size:14px;text-align:center;margin:0;line-height:1.5}
.decl a{color:#3b82f6;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.done{text-align:center;padding:48px 22px}
.done h1{font-size:28px;font-weight:900;margin-bottom:10px}.done .ok{width:80px;height:80px;border-radius:50%;background:var(--green);margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
.done p{font-size:19px}
@media (min-width:640px){.pair{display:grid;grid-template-columns:1fr 1fr}.pair .blk{padding:24px 18px}.deal h2,.stock h2{font-size:24px}.stock .red{font-size:22px}.stock p{font-size:15.5px}.cta{font-size:17px;padding:14px}.wait h1{font-size:24px}.wait p{font-size:15px}
  .stock2 h2{font-size:24px}.stock2 .red{font-size:22px}.letter{overflow:hidden}.letter .avatar{float:right;width:120px;height:120px;margin:0 0 12px 18px}.letter .prod{width:320px;margin:4px auto 16px}.letter p{font-size:14.5px;margin-bottom:12px}.letter h3{font-size:22px}}
@media (max-width:640px){.guar{flex-direction:column;align-items:flex-start;gap:18px;padding:34px 22px 30px}.guar h2{font-size:30px;line-height:1.2;margin-bottom:6px}.guar p{font-size:19px;margin:0 0 20px}.guar p:last-child{margin:0 0 6px}.seal{width:230px;height:230px;align-self:center}}
`;

const LETTER = [
  "Molte persone mi scrivono preoccupate di non riuscire più a trovare le Neurotone Drops in futuro...",
  "Le Neurotone Drops contengono ingredienti studiati clinicamente come l'Astragalo e la Nitrosigina...",
  "Ingredienti che arrivano solo dalle fonti più pure, che spesso si trovano dall'altra parte del mondo.",
  "Sono orgogliosa che il team di Just Jenny non abbia badato a spese per mettere insieme questa formula...",
  "Compreso viaggiare in lungo e in largo per trovare le forme migliori di ogni ingrediente rigenerante contenuto nelle Neurotone Drops di Just Jenny.",
  "Ma l'unico rovescio della medaglia nell'usare solo le forme più pure di OGNI ingrediente delle Neurotone Drops di Just Jenny",
  "è che ogni volta che c'è un conflitto internazionale, una guerra commerciale o anche solo una brutta tempesta...",
  "Le nostre forniture di molti ingredienti chiave possono bloccarsi...",
  "E se a questo aggiungi...",
  "Che i nostri clienti ordinano sempre più flaconi di Neurotone Drops di Just Jenny alla volta...",
];
const LETTER2 = [
  "È facile capire perché sono sempre preoccupata che le Neurotone Drops di Just Jenny possano andare esaurite per diversi mesi...",
  "Ricorda: per ottenere il massimo dalle Neurotone Drops di Just Jenny è importante usarle ogni singolo giorno...",
  "Anche quando ti accorgi che riesci di nuovo ad addormentarti senza musica di sottofondo, e a seguire una conversazione normale.",
  "Dopo aver cambiato completamente il tuo udito con le Neurotone Drops di Just Jenny...",
  "L'ultima cosa che vorresti è smettere di usare le Neurotone Drops e tornare a come stavi prima, giusto?",
  "Il problema è che queste gocce non si trovano in nessun negozio",
  "E l'ultima cosa che vorrei è che tu, proprio quando senti finalmente di nuovo il silenzio...",
  "E non sei più sfinito tutto il tempo...",
  "...scopra che siamo esauriti.",
  "Questa è la cattiva notizia.",
  "La buona notizia è che, grazie alla quantità di Neurotone Drops di Just Jenny che hai appena ordinato...",
];

const Lock = () => (
  <svg width="18" height="20" viewBox="0 0 30 34" aria-hidden="true"><rect x="2" y="14" width="26" height="18" rx="4" fill="#f58a1f" /><path d="M8 14V10a7 7 0 0 1 14 0v4" fill="none" stroke="#f58a1f" strokeWidth="4" /><path d="M10 23l3.5 3.5L20 20" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Secure = () => (
  <div className="secure"><Lock /><div><b>CRITTOGRAFIA SICURA A 256 BIT</b><span>I TUOI DATI SONO PROTETTI AL 100%</span></div></div>
);

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export default function Offerta() {
  const [q, setQ] = useState(null);         // { sub, paypal, search }
  const [info, setInfo] = useState(null);   // /api/{stripe,paypal}/order
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const ppRendered = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sub = p.get("sub") || p.get("pp") || "";
    setQ({ sub, paypal: !!p.get("pp"), search: window.location.search, failed: p.get("redirect_status") === "failed" });
  }, []);

  const grazie = (extra) => {
    if (!q) return;
    // Zonder upsell doorgaan → mail 1 mag vertrekken (bij upsell doet de server dit zelf)
    if (!extra && q.sub) { try { navigator.sendBeacon("/api/checkout/upsell-decline", new Blob([JSON.stringify({ ref: q.sub })], { type: "application/json" })); } catch {} }
    const u = new URL("/checkout/grazie", window.location.origin);
    u.search = q.search || "";
    if (extra) u.searchParams.set("up", "1");
    window.location.href = u.href;
  };

  // Mislukte betaling → meteen door naar de bedankpagina (die toont de juiste status)
  useEffect(() => { if (q?.failed) grazie(false); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Order-info (betaald? naam?) + publieke config
  useEffect(() => {
    if (!q || !q.sub) return;
    fetch("/api/checkout-config").then((r) => r.json()).then(setCfg).catch(() => setCfg({}));
    let timer, tries = 0;
    const load = async () => {
      try {
        const url = q.paypal ? `/api/paypal/order?id=${encodeURIComponent(q.sub)}` : `/api/stripe/order?sub=${encodeURIComponent(q.sub)}`;
        const r = await fetch(url).then((x) => x.json());
        if (r.error) { grazie(false); return; }
        setInfo(r);
        if (!r.paid && ++tries < 10) timer = setTimeout(load, 3000);
      } catch { if (++tries < 5) timer = setTimeout(load, 3000); }
    };
    load();
    return () => clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Na succes: even de bevestiging tonen, dan door naar de bedankpagina
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => grazie(true), 2200);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Stripe: one-click ----
  async function buyStripe() {
    if (busy) return;
    if (!q?.sub) { setDone(true); return; } // preview
    setBusy(true); setErr("");
    try {
      let r = await fetch("/api/stripe/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: q.sub }) }).then((x) => x.json());
      if (r.requires_action && r.client_secret) {
        // Bankbevestiging (3-D Secure) in de browser, daarna afronden
        await loadScript("https://js.stripe.com/v3", "stripe-js");
        const stripe = window.Stripe(cfg?.stripePk);
        const { error } = await stripe.confirmCardPayment(r.client_secret);
        if (error) throw new Error(error.message || "Conferma non riuscita.");
        r = await fetch("/api/stripe/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sub: q.sub, pi: r.pi }) }).then((x) => x.json());
      }
      if (r.error) throw new Error(r.error);
      setDone(true);
    } catch (e) {
      setErr(e.message || "Si è verificato un errore. Riprova.");
      setBusy(false);
    }
  }

  // ---- PayPal: knop renderen in beide CTA-posities ----
  useEffect(() => {
    if (!q?.paypal || !cfg?.paypalClientId || !info?.paid || ppRendered.current) return;
    ppRendered.current = true;
    loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=EUR&intent=capture&locale=it_IT&disable-funding=card,credit,paylater,sepa`, "paypal-sdk").then(() => {
      if (!window.paypal) return;
      const opts = {
        style: { layout: "horizontal", color: "gold", shape: "rect", label: "pay", height: 48, tagline: false },
        createOrder: async () => {
          setErr("");
          const r = await fetch("/api/paypal/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", pp: q.sub }) }).then((x) => x.json());
          if (r.already) { setDone(true); throw new Error("already"); }
          if (!r.id) throw new Error(r.error || "Impossibile avviare PayPal.");
          return r.id;
        },
        onApprove: async (data) => {
          setBusy(true);
          const r = await fetch("/api/paypal/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", pp: q.sub, orderId: data.orderID }) }).then((x) => x.json());
          if (r.error) { setErr(r.error); setBusy(false); return; }
          setDone(true);
        },
        onError: (e) => { if (String(e?.message) !== "already") setErr("PayPal non ha completato il pagamento. Riprova."); },
      };
      ["pp-btn-1", "pp-btn-2"].forEach((id) => { const el = document.getElementById(id); if (el) window.paypal.Buttons(opts).render(el); });
    }).catch(() => setErr("Impossibile caricare PayPal. Ricarica la pagina."));
  }, [q, cfg, info]);

  const preview = q && !q.sub;
  const ready = preview || !!info?.paid;
  const last4 = info?.payment?.last4;

  // Geen inline component (zou bij elke render opnieuw mounten en de PayPal-knop wissen)
  const cta = (id) =>
    q?.paypal && !preview ? (
      <div className="ppbox" id={id} />
    ) : (
      <button className="cta" onClick={buyStripe} disabled={busy || !ready}>{busy ? "Un attimo…" : "COMPLETA L'ACQUISTO →"}</button>
    );

  return (
    <>
      <Head>
        <title>Offerta speciale — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;0,900;1,700&display=swap" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>

      {done ? (
        <div className="col done">
          <div className="ok"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></div>
          <h1>Aggiunto al tuo ordine!</h1>
          <p>2 flaconi extra di NeuroTone (29,95 €) partiranno insieme al tuo ordine.<br />Ti portiamo al riepilogo dell’ordine…</p>
        </div>
      ) : (
        <div className="col">
          <div className="hdr"><img className="logo" src={IMG.logo} alt="Just Jenny" /></div>

          <div className="blk white wait c">
            <h1>Aspetta… il tuo ordine non è ancora completo!</h1>
            <p>Non premere il tasto "Indietro": potrebbe causare addebiti multipli sulla tua carta.</p>
          </div>

          <div className="pair">
            <div className="blk peach deal c">
              <h2>Un'offerta speciale solo per i nuovi clienti Just Jenny!</h2>
              <img src={IMG.product} alt="NeuroTone Drops 1+1 gratis" />
              <img className="badges" src={IMG.badges} alt="Soddisfazione garantita 90 giorni · Assistenza clienti 24/7 · Approvato dai dermatologi" />
            </div>
            <div className="blk peach2 stock c">
              <h2>Fai scorta di NeuroTone adesso!</h2>
              <p className="red">Compra 1 flacone, il 2° è GRATIS</p>
              <p>È il prezzo più basso in assoluto che vedrai mai per le NeuroTone Drops.</p>
              <p>Ti protegge dai futuri aumenti di prezzo e dagli esaurimenti di scorte…</p>
              <p>Risparmio: 29,95 € sul prezzo normale.</p>
              <p>Leggi di più qui sotto.</p>
              {err && <p className="err">{err}</p>}
              {cta("pp-btn-1")}
              {!q?.paypal && last4 && <p style={{ fontSize: "12.5px", color: "#555", margin: "0 0 10px" }}>Addebito di 29,95 € sulla stessa carta ····{last4}. Nessun dato da inserire.</p>}
              <Secure />
            </div>
          </div>

          <div className="blk white letter">
            <h3>Ciao, sono di nuovo la Dott.ssa Ferretti.</h3>
            <img className="avatar" src={IMG.doctor} alt="Dott.ssa Ferretti" />
            <div>
              {LETTER.map((t, i) => <p key={i}>{t}</p>)}
              <img className="prod" src={IMG.ingredients} alt="NeuroTone Drops" />
              {LETTER2.map((t, i) => <p key={i}>{t}</p>)}
            </div>
          </div>

          <div className="blk peach2 stock2 c">
            <p className="small">Solo su questa pagina privata,</p>
            <h2>puoi fare scorta di NeuroTone aggiungendo</h2>
            <p className="red">1 flacone al tuo ordine e ricevendone 1 GRATIS.<br />2 flaconi a soli 29,95 €.</p>
            <p>Risparmi così 29,95 € sul prezzo di listino originale.</p>
            <div className="free">
              <svg width="52" height="36" viewBox="0 0 52 36" fill="#222" aria-hidden="true"><rect x="0" y="6" width="30" height="20" rx="2" /><path d="M30 12h11l9 8v6H30z" /><circle cx="10" cy="29" r="5" /><circle cx="10" cy="29" r="2" fill="#fff" /><circle cx="40" cy="29" r="5" /><circle cx="40" cy="29" r="2" fill="#fff" /><text x="4" y="21" fontSize="11" fontWeight="900" fill="#fff" fontFamily="Roboto,Arial">FREE</text></svg>
              <b>In più, la spedizione aggiuntiva è GRATIS: la copriamo noi.</b>
            </div>
            <p>Approfitta ora di questa offerta esclusiva e irripetibile cliccando il pulsante verde qui sotto. È l'unica volta che vedrai questa offerta, ed è coperta dalla garanzia soddisfatti o rimborsati al 100% di 90 giorni. Quindi non hai nulla da perdere.</p>
            {err && <p className="err">{err}</p>}
            {cta("pp-btn-2")}
            <Secure />
            <img src={IMG.product} alt="NeuroTone Drops 1+1 gratis" />
            <img className="badges" src={IMG.badges} alt="" />
          </div>

          <div className="blk white guar">
            <div className="gt">
              <h2>Garanzia soddisfatti o rimborsati di 90 giorni <span>Rimborso al 100%</span></h2>
              <p>Se il fischio o il ronzio costante nelle tue orecchie non sparisce, non paghi NULLA!</p>
              <p>La tua decisione di investire nelle Neurotone Drops di Just Jenny è completamente senza rischi. E se cambi idea, ti basta chiamare o scrivere un'email all'assistenza clienti per ricevere il rimborso completo, senza domande.</p>
              <p>Nessuna complicazione. Nessun rischio. Solo risultati. Tutto garantito per 3 mesi interi.</p>
            </div>
            <img className="seal" src={IMG.seal} alt="Soddisfazione garantita 90 giorni" />
          </div>

          <div className="blk peach2 decl">
            <p><a onClick={() => grazie(false)}>No grazie. Capisco che questa è la mia unica occasione per accedere a questa offerta speciale, e accetto di perderla. Se invece, come migliaia di persone prima di me, resterò colpito dai risultati che otterrò con NeuroTone, in futuro riordinerò semplicemente a 60 € a flacone, invece dei 14,98 € a flacone che mi vengono offerti oggi. Rinuncio per sempre a questa occasione.</a></p>
          </div>
        </div>
      )}
    </>
  );
}
