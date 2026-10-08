// pages/sondaggio/[product].js — Losse enquêtepagina waar de Klaviyo-mail "Inizia il sondaggio →" naartoe linkt
// (checkout.getjustjenny.com/sondaggio/lubrisense). Zelfde vragen als op de bedankpagina (lib/quiz.js), één vraag
// per scherm, anoniem: geen bestelnummer nodig, alleen een willekeurige SID in de browser (voortgang blijft bewaard).
// Antwoorden → /api/checkout-quiz (standalone) → Google Sheet, tabblad van het product.
// Stijl volgt de mail: lichte achtergrond, rode privacy-banner, witte kaart, groene knop.

import { useEffect, useState } from "react";
import Head from "next/head";
import { getProduct } from "../../lib/checkout";
import { QUIZ_INTRO, quizFor } from "../../lib/quiz";

const newSid = () => Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const css = `
*{box-sizing:border-box}
html,body{margin:0;background:#f6f8f7;color:#4a5568;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:600px;margin:0 auto;padding:28px 14px 40px}
.priv{background:#fdecea;border:2px solid #c0392b;border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.55;color:#c0392b;font-weight:700;margin-bottom:20px}
.card{background:#fff;border:1px solid #e3e8ee;border-radius:14px;padding:32px 28px}
.card h1{font-size:22px;line-height:1.3;color:#1f2733;margin:0 0 10px;font-weight:800}
.card p{margin:0 0 16px}
.gift{background:#eef7ef;border:1px solid #cfe8d1;border-radius:10px;padding:16px 18px;font-size:15px;line-height:1.6;color:#1f2733;margin:0 0 18px}
.q{font-size:17px;font-weight:700;color:#1f2733;line-height:1.4;margin:0 0 12px}
.meta{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#8a93a0;margin-bottom:14px}
.bar{height:6px;background:#e3e8ee;border-radius:999px;overflow:hidden;margin-bottom:18px}.bar i{display:block;height:100%;background:#4caf50;border-radius:999px;transition:width .25s}
textarea{width:100%;min-height:140px;border:1px solid #cfd6de;border-radius:10px;padding:14px;font:inherit;color:#1f2733;resize:vertical;outline:none}
textarea:focus{border-color:#4caf50;box-shadow:0 0 0 3px rgba(76,175,80,.18)}
.btn{display:block;width:100%;border:0;border-radius:10px;background:#4caf50;color:#fff;font:inherit;font-size:17px;font-weight:700;padding:17px 24px;cursor:pointer;margin-top:14px}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.done{text-align:center}.done .ok{width:64px;height:64px;border-radius:50%;background:#4caf50;margin:4px auto 16px;display:flex;align-items:center;justify-content:center}
.foot{text-align:center;font-size:12px;line-height:1.7;color:#8a93a0;padding:26px 10px 0}.foot a{color:#8a93a0}
@media (max-width:480px){.card{padding:24px 18px}.card h1{font-size:20px}}
`;

export default function Sondaggio({ productKey }) {
  const product = getProduct(productKey);
  const QUIZ = quizFor(product.key);
  const key = `jjb_sondaggio_${product.key}`;
  const [st, setSt] = useState(null); // { sid, first, answers, done }
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    setSt(s && s.sid ? s : { sid: newSid(), first: Date.now(), answers: [], done: false });
  }, [key]);

  const i = st ? Math.min(st.answers.length, QUIZ.length - 1) : 0;

  const next = async () => {
    if (!st || !a.trim() || busy) return;
    setBusy(true); setErr("");
    const answers = [...st.answers, a.trim()];
    try {
      const r = await fetch("/api/checkout-quiz", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ standalone: true, product: product.key, sid: st.sid, first: st.first, answers, questions: QUIZ }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
    } catch (e) {
      setErr("Non siamo riusciti a salvare la risposta. Riprova tra un istante.");
      setBusy(false);
      return;
    }
    const nextSt = { ...st, answers, done: answers.length >= QUIZ.length };
    setSt(nextSt);
    try { localStorage.setItem(key, JSON.stringify(nextSt)); } catch {}
    setA(""); setBusy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <Head>
        <title>Sondaggio — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>
      <div className="wrap">
        <div className="priv">Le tue informazioni non saranno condivise con terze parti e non saranno collegate al tuo nome né ai dettagli del tuo acquisto. E puoi richiedere la cancellazione delle tue risposte in qualsiasi momento.</div>
        <div className="card">
          {!st ? null : st.done ? (
            <div className="done">
              <div className="ok"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></div>
              <h1>{QUIZ_INTRO.done}</h1>
              <p>Partecipi automaticamente all'estrazione di questo mese. Grazie per il tuo tempo.</p>
            </div>
          ) : (
            <>
              {st.answers.length === 0 && (
                <>
                  <h1>{QUIZ_INTRO.title}</h1>
                  <p>Ci piacerebbe capire com'è davvero vivere con questo problema, con le tue parole. Così il nostro team può migliorare il prodotto e il modo in cui informiamo e supportiamo clienti come te.</p>
                  <div className="gift">🎁 <strong>Premio di ringraziamento:</strong> ogni mese estraiamo un partecipante che riceve un premio dal valore di oltre <strong>10.000&nbsp;€</strong>. Partecipando a questo sondaggio entri automaticamente nell'estrazione di questo mese.</div>
                  <p>Ci vogliono circa <strong style={{ color: "#1f2733" }}>3 minuti</strong>, non esistono risposte sbagliate.</p>
                </>
              )}
              <div className="meta"><span>Domanda {i + 1} di {QUIZ.length}</span><span>{Math.round((i / QUIZ.length) * 100)}%</span></div>
              <div className="bar"><i style={{ width: `${(i / QUIZ.length) * 100}%` }} /></div>
              <div className="q">{QUIZ[i]}</div>
              <textarea value={a} onChange={(e) => setA(e.target.value)} placeholder="Scrivi qui la tua risposta…" maxLength={2000} />
              {err && <p style={{ color: "#c0392b", fontWeight: 700, margin: "10px 0 0" }}>{err}</p>}
              <button className="btn" onClick={next} disabled={!a.trim() || busy}>{busy ? "Un attimo…" : i >= QUIZ.length - 1 ? "Invia le risposte" : "Successivo →"}</button>
            </>
          )}
        </div>
        <div className="foot">
          Just Jenny Beauty · Via Torino 29, 20123 Milano, Italia · hello@justjennybeauty.com<br />
          <a href="https://la-tua-esperienza.vercel.app/regolamento.html" target="_blank" rel="noreferrer">Regolamento completo dell'estrazione</a>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  const key = String(params.product || "").toLowerCase();
  if (key !== "lubrisense") return { notFound: true }; // NeuroTone gebruikt la-tua-esperienza.vercel.app
  return { props: { productKey: key } };
}
