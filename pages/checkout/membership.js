// pages/checkout/membership.js — Pagina pubblica "Health For Life Membership" (Italiaans): vantaggi, garanzia,
// gestione, prodotti, FAQ. Gelinkt vanuit de checkout ("modificare o annullare la mia membership").
// Inhoud goedgekeurd door Niels (2 okt); bewust zonder knoppen/links naar het ledenplatform.
import Head from "next/head";

const css = `
:root{--page:#f3efd8;--peach:#fde2cc;--peach2:#fdf3ea;--terra:#e0855e;--terra-d:#c96f43;--fg:#222;--muted:#5a5a5a;--green:#1fb833;--green-d:#179a2a;--fh:"Roboto",Arial,Helvetica,sans-serif;--fb:Arial,Helvetica,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--fg);font-family:var(--fb);line-height:1.5;font-size:17px;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--fh);margin:0;line-height:1.15}
a{color:var(--terra-d)}
.wrap{max-width:1080px;margin:0 auto;padding:0 22px}
.c{text-align:center}
.kicker{font-family:var(--fh);font-size:12.5px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;color:var(--terra-d)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:10px;background:var(--green);color:#fff;font-family:var(--fh);font-weight:700;font-size:18px;padding:16px 26px;text-decoration:none;box-shadow:0 3px 0 var(--green-d);cursor:pointer}
.btn.ghost{background:#fff;color:var(--fg);box-shadow:none;border:2px solid #e3d9cf}
.btn.terra{background:var(--terra);box-shadow:0 3px 0 var(--terra-d)}

/* header */
.hdr{background:#fff;border-bottom:3px solid var(--terra)}
.hdr .wrap{display:flex;align-items:center;justify-content:space-between;padding-top:14px;padding-bottom:12px;gap:14px}
.hdr img.logo{height:26px;width:auto}
.pill{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(90deg,#fdeee4,#fbe6da 50%,#fdf3ec);border-radius:12px;padding:6px 14px 6px 8px;font-size:13px;font-weight:600;white-space:nowrap}
.pill .av{display:flex}.pill .av img{width:24px;height:24px;border-radius:50%;border:2px solid #fff;object-fit:cover;margin-left:-8px}.pill .av img:first-child{margin-left:0}
.hdr .nav{display:flex;gap:18px;font-size:14.5px;font-weight:700}.hdr .nav a{color:var(--fg);text-decoration:none}

/* hero */
.hero{background:var(--peach);overflow:hidden}
.hero .wrap{display:grid;grid-template-columns:1.1fr 1fr;gap:30px;align-items:center;padding-top:50px;padding-bottom:50px}
.hero h1{font-size:46px;font-weight:900;margin:10px 0 14px}
.hero p.sub{font-size:19px;color:#333;margin:0 0 22px;max-width:520px}
.hero .cta{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.hero .note{font-size:13.5px;color:var(--muted);margin:14px 0 0}
.hero img{width:100%;max-width:520px;height:auto;display:block;margin:0 auto;filter:drop-shadow(0 18px 30px rgba(0,0,0,.12))}

/* benefits */
.ben{background:var(--peach2);padding:56px 0}
.ben h2{font-size:34px;font-weight:900;margin-bottom:34px}
.ben .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.ben .it{text-align:center}
.ben .ic{width:64px;height:64px;margin:0 auto 14px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.ben .ic svg{width:34px;height:34px;stroke:var(--terra-d);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ben b{display:block;font-family:var(--fh);font-size:16.5px;margin-bottom:4px}
.ben span{font-size:14px;color:var(--muted)}

/* signup */
.signup{padding:60px 0 20px}
.signup h2{font-size:34px;font-weight:900;margin:8px 0 10px}
.signup p{font-size:18px;color:#333;margin:0}

/* guarantee */
.guar{padding:40px 0 60px}
.guar .box{display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:center;background:linear-gradient(135deg,#fdf3ea,#fde2cc);border-radius:22px;padding:34px}
.guar img{width:100%;max-width:300px;height:auto;display:block;margin:0 auto}
.guar h2{font-size:30px;font-weight:900;margin:6px 0 14px}
.guar p{font-size:16.5px;margin:0 0 12px}

/* steps */
.steps{padding:30px 0 60px}
.steps h2{font-size:34px;font-weight:900;margin:8px 0 34px}
.steps .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.steps .card{background:#fff;border:1px solid #efe6dc;border-radius:18px;padding:22px;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.steps .num{width:40px;height:40px;border-radius:50%;background:var(--terra);color:#fff;font-family:var(--fh);font-weight:900;display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:18px}
.steps h3{font-size:18px;font-weight:700;margin-bottom:8px}
.steps p{font-size:15px;color:#333;margin:0 0 8px}
.steps ul{margin:8px 0 0;padding-left:18px;font-size:15px}

/* manage band */
.manage{background:var(--peach2);padding:48px 0}
.manage h2{font-size:30px;font-weight:900;margin-bottom:14px}
.manage p{font-size:16px;max-width:760px;margin:0 auto 10px}

/* products */
.prod{padding:60px 0}
.prod h2{font-size:34px;font-weight:900;margin:8px 0 8px}
.prod p.sub{font-size:17px;color:#333;margin:0 0 34px}
.prod .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.prod .card{background:#fff;border:1px solid #efe6dc;border-radius:18px;overflow:hidden;display:flex;flex-direction:column}
.prod .card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f7f7f7}
.prod .body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;flex:1}
.prod .brand{font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:#888;font-weight:700}
.prod h3{font-size:17px;font-weight:700}
.prod .price{font-size:15px}.prod .price s{color:#999;margin-right:8px}.prod .price b{color:var(--green-d);font-family:var(--fh)}
.prod .sh{font-size:13px;color:var(--muted)}
.prod .btn{margin-top:auto;font-size:15px;padding:12px 14px;border-radius:8px}

/* faq */
.faq{background:var(--peach2);padding:60px 0}
.faq h2{font-size:34px;font-weight:900;margin:8px 0 6px}
.faq p.sub{font-size:15.5px;color:var(--muted);margin:0 0 30px}
.faq .list{max-width:760px;margin:0 auto}
.faq details{background:#fff;border-radius:12px;padding:0 20px;margin-bottom:10px;border:1px solid #f1e6dc}
.faq summary{list-style:none;cursor:pointer;font-family:var(--fh);font-weight:700;font-size:17px;padding:17px 0;display:flex;justify-content:space-between;align-items:center;gap:14px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:22px;color:var(--terra-d);font-weight:400}
.faq details[open] summary::after{content:"–"}
.faq .a{padding:0 0 18px;font-size:15.5px;color:#333}
.faq .a ol,.faq .a ul{margin:8px 0;padding-left:20px}

/* contact / footer */
.contact{background:var(--terra);color:#fff;padding:54px 0 40px}
.contact h2{font-size:34px;font-weight:900;margin-bottom:18px}
.contact .btn{background:#fff;color:var(--terra-d);box-shadow:none}
.contact .links{display:flex;gap:26px;justify-content:center;flex-wrap:wrap;margin:30px 0 22px;font-size:14.5px}
.contact .links a{color:#fff;text-decoration:none;opacity:.95}
.contact .cards{display:flex;gap:8px;justify-content:center;margin-bottom:16px}.contact .cards img{height:24px;background:#fff;border-radius:4px;padding:2px}
.contact .fine{font-size:12px;opacity:.85;max-width:720px;margin:0 auto;line-height:1.6}

@media (max-width:860px){
  .hero .wrap{grid-template-columns:1fr;padding-top:34px;padding-bottom:30px}
  .hero h1{font-size:34px}.hero img{max-width:360px}
  .ben .grid,.steps .grid,.prod .grid{grid-template-columns:1fr 1fr}
  .guar .box{grid-template-columns:1fr;padding:24px}
  .hdr .nav{display:none}
}
@media (max-width:560px){
  .ben .grid,.steps .grid,.prod .grid{grid-template-columns:1fr}
  .ben h2,.signup h2,.steps h2,.prod h2,.faq h2,.contact h2{font-size:27px}
  .hero h1{font-size:30px}
  .pill{display:none}
}
`;

export default function Membership() {
  return (
    <>
      <Head>
        <title>Health For Life Membership — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>


<header className="hdr"><div className="wrap">
  <img className="logo" src="https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114" alt="Just Jenny" />
  <nav className="nav"><a href="#vantaggi">Vantaggi</a><a href="#come">Come funziona</a><a href="#prodotti">Prodotti</a><a href="#faq">FAQ</a></nav>
  <div className="pill"><span className="av"><img src="/checkout/assets/avatar1.jpg" alt="" /><img src="/checkout/assets/avatar2.jpg" alt="" /><img src="/checkout/assets/avatar3.jpg" alt="" /></span><b>40.000+</b>{"\u00a0"}CLIENTI SODDISFATTI</div>
</div></header>

<section className="hero"><div className="wrap">
  <div>
    <div className="kicker">Vantaggi esclusivi e tranquillità</div>
    <h1>Il tuo prodotto gratuito,<br />ogni 28 giorni.</h1>
    <p className="sub">La Health For Life Membership ti dà, a ogni ciclo, un prodotto per il benessere dell'udito <b>gratis</b> — paghi solo spedizione e gestione. Modifica o annulla quando vuoi.</p>
    
    <p className="note">7 giorni di prova gratuita, poi 49,00 € ogni 28 giorni. Nessun vincolo: annulli con un clic.</p>
  </div>
  <img src="/checkout/upsell/neurotone-ingredienti.webp" alt="NeuroTone Drops" />
</div></section>

<section className="ben" id="vantaggi"><div className="wrap">
  <h2 className="c">Vantaggi per i membri</h2>
  <div className="grid">
    <div className="it"><div className="ic"><svg viewBox="0 0 24 24"><path d="M20 12v8H4v-8"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7c-2-3-6-3-6-1s4 1 6 1zM12 7c2-3 6-3 6-1s-4 1-6 1z"/></svg></div><b>Un prodotto gratuito a ogni ciclo</b><span>Scegli nell'Area Membri; paghi solo spedizione e gestione</span></div>
    <div className="it"><div className="ic"><svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg></div><b>Garanzia 90 giorni</b><span>Soddisfatti o rimborsati su ogni nuova membership</span></div>
    <div className="it"><div className="ic"><svg viewBox="0 0 24 24"><path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4z"/><path d="M20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/></svg></div><b>Biblioteca Tinnitus</b><span>E-book gratuiti su sonno, stress e udito, uno nuovo ogni mese</span></div>
    <div className="it"><div className="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><b>Annulli quando vuoi</b><span>Dall'Area Membri o via e-mail, senza domande</span></div>
  </div>
</div></section>

<section className="signup c" id="come"><div className="wrap">
  <div className="kicker">Diventa membro Just Jenny oggi</div>
  <h2>Come iscriversi</h2>
  <p>Basta aggiungere la <b>Health For Life Membership</b> al tuo ordine di NeuroTone Drops. I primi 7 giorni sono gratis.</p>
</div></section>

<section className="guar"><div className="wrap">
  <div className="box">
    <img src="/checkout/upsell/garanzia-90.webp" alt="Garanzia 90 giorni" />
    <div>
      <div className="kicker">Sentiti al sicuro</div>
      <h2>Hai una garanzia di 90 giorni su ogni nuova membership</h2>
      <p>Ama la tua nuova membership, oppure faccelo sapere entro i primi 90 giorni: ti basta rispedirci i flaconi <b>non aperti</b> per ricevere il rimborso completo (escluse spedizione e gestione).</p>
      <p>Con <b>oltre 40.000 clienti soddisfatti</b>, siamo sicuri che <b>amerai</b> ogni nostro prodotto.</p>
    </div>
  </div>
</div></section>

<section className="steps"><div className="wrap">
  <h2 className="c">Gestire la membership è semplice</h2>
  <div className="grid">
    <div className="card"><div className="num">1</div><h3>Accedi all'Area Membri</h3><p>Il link personale è nella tua prima e-mail. Da lì vedi la tua membership, la prossima data di rinnovo e i tuoi dati di pagamento.</p></div>
    <div className="card"><div className="num">2</div><h3>Richiedi il tuo prodotto gratuito</h3><p>A ogni ciclo scegli un prodotto diverso. Paghi solo il contributo di spedizione e gestione indicato accanto all'articolo, e parte entro un giorno lavorativo.</p></div>
    <div className="card"><div className="num">3</div><h3>Modifica o annulla quando vuoi</h3><p>Hai 2 modi semplici:</p><ul><li>Dall'Area Membri, sezione <b>Membership</b></li><li>Scrivendo a <a href="mailto:Hello@justjennybeauty.com">Hello@justjennybeauty.com</a></li></ul></div>
  </div>
</div></section>

<section className="manage c"><div className="wrap">
  <h2>Gestisci la tua membership</h2>
  <p>La membership si rinnova ogni 28 giorni e l'addebito di 49,00 € avviene il giorno del rinnovo. Ti inviamo un promemoria via e-mail <b>3 giorni prima</b> di ogni addebito. Per modificare o annullare, usa l'Area Membri o scrivici <b>prima della data di rinnovo</b>.</p>
  <p><a href="/checkout/termini">Termini e condizioni</a></p>
</div></section>

<section className="prod" id="prodotti"><div className="wrap">
  <div className="c"><div className="kicker">Riservato ai membri</div><h2>Scegli il tuo prodotto gratuito</h2><p className="sub">Uno per ciclo, a tua scelta. Prezzo di listino barrato: per te costa solo la spedizione e gestione.</p></div>
  <div className="grid">
    <div className="card"><img src="/portal/products/neurotone-drops.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>NeuroTone Drops</h3><div className="price"><s>60,00 €</s><b>GRATIS</b></div><div className="sh">+ 9,95 € spedizione e gestione · 1 flacone, scorta per 4 settimane</div></div></div>
    <div className="card"><img src="/portal/products/quiet-night-led-sleep-plugs.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>Tappi per dormire Quiet Night LED</h3><div className="price"><s>119,95 €</s><b>GRATIS</b></div><div className="sh">+ 27,95 € spedizione e gestione</div></div></div>
    <div className="card"><img src="/portal/products/ear-comfort-sleep-pillow.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>Cuscino ergonomico salva-orecchio</h3><div className="price"><s>109,95 €</s><b>GRATIS</b></div><div className="sh">+ 14,95 € spedizione e gestione</div></div></div>
    <div className="card"><img src="/portal/products/ear-cleaner-hd-camera.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>Pulisci-orecchie con telecamera HD</h3><div className="price"><s>69,95 €</s><b>GRATIS</b></div><div className="sh">+ 9,95 € spedizione e gestione</div></div></div>
    <div className="card"><img src="/portal/products/motion-sensor-night-light.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>Luce notturna con sensore di movimento</h3><div className="price"><s>49,95 €</s><b>GRATIS</b></div><div className="sh">+ 9,95 € spedizione e gestione</div></div></div>
    <div className="card"><img src="/portal/products/shower-earplugs.jpg" alt="" /><div className="body"><div className="brand">Just Jenny</div><h3>Tappi per la doccia</h3><div className="price"><s>49,95 €</s><b>GRATIS</b></div><div className="sh">+ 9,95 € spedizione e gestione</div></div></div>
  </div>
</div></section>

<section className="faq" id="faq"><div className="wrap">
  <div className="c"><h2>Domande frequenti</h2><p className="sub">Le tue domande sulla membership, con risposta — perché la serenità parte dal sapere. 🎧</p></div>
  <div className="list">
    <details open><summary>Come mi iscrivo?</summary><div className="a">Iscriversi è semplice:<ol><li>Ordina NeuroTone Drops dal nostro checkout: la Health For Life Membership è inclusa nell'ordine, con 7 giorni di prova gratuita.</li><li>Dopo l'acquisto, accedi all'Area Membri con il link personale che trovi nella prima e-mail.</li><li>Richiedi il tuo primo prodotto gratuito e goditi i vantaggi riservati ai membri.</li></ol></div></details>
    <details><summary>Come gestisco la mia membership?</summary><div className="a">Puoi gestire la tua membership in due modi:<ol><li>Dall'Area Membri (membership, dati di pagamento, prodotti).</li><li>Scrivendoci a <a href="mailto:Hello@justjennybeauty.com">Hello@justjennybeauty.com</a>.</li></ol></div></details>
    <details><summary>Posso cambiare prodotto o saltare un ciclo?</summary><div className="a">Sì. A ogni ciclo scegli liberamente un prodotto diverso nell'Area Membri. Se vuoi fare una pausa, puoi annullare la membership e riattivarla quando preferisci, sempre dall'Area Membri: i tuoi dati restano salvati.</div></details>
    <details><summary>E se cambio indirizzo?</summary><div className="a">Aggiorna l'indirizzo di spedizione nell'Area Membri oppure scrivici con i nuovi dati: aggiorneremo la tua membership così che i prodotti arrivino al posto giusto.</div></details>
    <details><summary>Come funziona la garanzia soddisfatti o rimborsati di 90 giorni?</summary><div className="a">Offriamo una garanzia di 90 giorni su ogni nuova membership. Se non sei completamente soddisfatto/a, faccelo sapere entro i primi 90 giorni e rispedisci i prodotti non aperti: riceverai il rimborso completo, escluse le spese di spedizione e gestione.</div></details>
    <details><summary>Posso annullare la membership in qualsiasi momento?</summary><div className="a">Sì, puoi annullare quando vuoi dall'Area Membri o scrivendoci. Sappiamo che le esigenze cambiano, e vogliamo che sia il più semplice possibile. Per evitare il prossimo addebito, annulla prima della data di rinnovo: te la ricordiamo via e-mail 3 giorni prima.</div></details>
    <details><summary>E se ho altre domande o ho bisogno di aiuto?</summary><div className="a">Scrivici a <a href="mailto:Hello@justjennybeauty.com">Hello@justjennybeauty.com</a>: ti risponde una persona vera. Siamo qui per aiutarti ad avere la migliore esperienza possibile con Just Jenny.</div></details>
  </div>
</div></section>

<section className="contact c"><div className="wrap">
  <h2>Contattaci</h2>
  <a className="btn" href="mailto:Hello@justjennybeauty.com">✉ Scrivici un'e-mail</a>
  <div className="links"><a href="/checkout/termini">Termini e condizioni</a><a href="https://getjustjenny.com/policies/privacy-policy">Privacy</a><a href="/checkout/termini#garanzia">Garanzia e rimborsi</a></div>
  <div className="cards"><img src="/checkout/assets/cards/visa.svg" alt="Visa" /><img src="/checkout/assets/cards/mastercard.svg" alt="Mastercard" /><img src="/checkout/assets/cards/amex.svg" alt="Amex" /><img src="/checkout/assets/cards/unionpay.svg" alt="UnionPay" /></div>
  <p className="fine">© 2026 Just Jenny · Vena Corporate LLC, 30 N Gould St, STE R, Sheridan, WY 82801, USA. NeuroTone Drops è un prodotto per il benessere e non è un medicinale né un dispositivo medico.</p>
</div></section>


    </>
  );
}
