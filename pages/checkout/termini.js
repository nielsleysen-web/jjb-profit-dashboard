// pages/checkout/termini.js — Termini e condizioni (Just Jenny / Vena Corporate LLC), in het Italiaans.
// Statische pagina; gelinkt vanuit de checkout (tekst onder de bestelknop), de upsellpagina en de mails.
// Inhoud goedgekeurd door Niels; wijzigingen alleen na overleg. Checkout- en mailteksten blijven onaangeroerd.
import Head from "next/head";

const LOGO = "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114";
const UPDATED = "2 ottobre 2026";
const COMPANY = "Vena Corporate LLC";
const ADDRESS = "30 N Gould St, STE R, Sheridan, WY 82801, Stati Uniti d'America";
const EIN = "37-2157232";
const EMAIL = "Hello@justjennybeauty.com";
const PORTAL = "https://members.getjustjenny.com";

const css = `
:root{--page:#f3efd8;--peach:#fde2cc;--peach2:#fdf3ea;--terra:#e0855e;--fg:#222;--fh:"Roboto",Arial,Helvetica,sans-serif;--fb:Arial,Helvetica,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:var(--page);color:var(--fg);font-family:var(--fb);line-height:1.55;font-size:16px;-webkit-font-smoothing:antialiased}
.col{max-width:760px;margin:0 auto;padding:0 0 40px}
.hdr{background:#fff;padding:18px 22px 14px;border-bottom:3px solid var(--terra)}
.logo{display:block;height:26px;width:auto;margin:0 auto}
.paper{background:#fff;padding:30px 26px 36px}
h1{font-family:var(--fh);font-size:28px;font-weight:900;line-height:1.15;margin:0 0 6px}
.upd{color:#666;font-size:14px;margin:0 0 22px}
h2{font-family:var(--fh);font-size:19px;font-weight:900;margin:30px 0 10px;color:#1a1a1a;text-transform:uppercase;letter-spacing:.3px}
h3{font-family:var(--fh);font-size:16.5px;font-weight:700;margin:18px 0 6px}
p{margin:0 0 12px}
ul{margin:0 0 12px;padding-left:22px}li{margin-bottom:6px}
a{color:#c96f43;font-weight:700}
.box{background:var(--peach2);border:1px solid #f1d9c9;border-left:5px solid var(--terra);border-radius:10px;padding:16px 18px;margin:16px 0 22px}
.box p:last-child{margin:0}
.toc{background:#faf7f1;border-radius:10px;padding:14px 18px;margin:0 0 10px;font-size:14.5px}
.toc a{font-weight:600;display:inline-block;margin:2px 10px 2px 0}
.foot{text-align:center;font-size:13px;color:#666;padding:18px 22px 0}
.foot a{color:#c96f43}
@media (max-width:640px){.paper{padding:24px 18px 30px}h1{font-size:24px}}
`;

export default function Termini() {
  return (
    <>
      <Head>
        <title>Termini e condizioni — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>
      <div className="col">
        <div className="hdr"><img className="logo" src={LOGO} alt="Just Jenny" /></div>
        <div className="paper">
          <h1>Termini e condizioni</h1>
          <p className="upd">Ultimo aggiornamento: {UPDATED}</p>

          <div className="toc">
            <a href="#panoramica">Panoramica</a><a href="#legge">Legge applicabile</a><a href="#membership">Health For Life Membership</a><a href="#garanzia">Garanzia 90 giorni</a><a href="#prodotti">Prodotti</a><a href="#sms">SMS</a><a href="#condizioni">Condizioni generali</a><a href="#contatti">Contatti</a>
          </div>

          <h2 id="panoramica">Panoramica</h2>
          <p>Questo sito web, il checkout e l'area membri Just Jenny sono gestiti da <b>{COMPANY}</b>, {ADDRESS} (EIN {EIN}). In tutto il sito, i termini «noi», «ci» e «nostro» si riferiscono a {COMPANY}, che opera con il marchio <b>Just Jenny</b>. Just Jenny mette a tua disposizione questo sito, comprese tutte le informazioni, gli strumenti e i servizi disponibili, a condizione che tu accetti tutti i termini, le condizioni, le politiche e le comunicazioni qui riportati.</p>
          <p>Visitando il nostro sito e/o acquistando qualcosa da noi, utilizzi il nostro «Servizio» e accetti di essere vincolato/a dai seguenti termini e condizioni («Termini di servizio», «Termini»), inclusi i termini, le condizioni e le politiche aggiuntivi qui richiamati e/o disponibili tramite collegamento ipertestuale. Questi Termini di servizio si applicano a tutti gli utenti del sito, inclusi, a titolo esemplificativo, visitatori, fornitori, clienti, commercianti e/o autori di contenuti.</p>
          <p>Ti invitiamo a leggere attentamente questi Termini di servizio prima di accedere al nostro sito o di utilizzarlo. Accedendo a qualsiasi parte del sito o utilizzandola, accetti di essere vincolato/a da questi Termini di servizio. Se non accetti tutti i termini e le condizioni di questo accordo, non puoi accedere al sito né utilizzare alcun servizio. Qualora questi Termini di servizio siano considerati un'offerta, l'accettazione è espressamente limitata a questi Termini di servizio.</p>
          <p>Qualsiasi nuova funzionalità o strumento aggiunto al negozio attuale sarà anch'esso soggetto ai Termini di servizio. Puoi consultare la versione più recente dei Termini di servizio in qualsiasi momento su questa pagina. Ci riserviamo il diritto di aggiornare, modificare o sostituire qualsiasi parte di questi Termini di servizio pubblicando aggiornamenti e/o modifiche sul nostro sito. È tua responsabilità controllare periodicamente questa pagina. L'uso continuato del sito o l'accesso allo stesso dopo la pubblicazione di eventuali modifiche costituisce accettazione di tali modifiche.</p>
          <p>Il nostro negozio è ospitato sulla piattaforma e-commerce di Shopify Inc. I pagamenti sono elaborati da fornitori di servizi di pagamento terzi, tra cui Stripe e PayPal; i tuoi dati di pagamento sono trasmessi in forma crittografata direttamente a tali fornitori.</p>

          <h2 id="legge">Legge applicabile e foro competente</h2>
          <p>La validità, l'interpretazione, l'esecuzione e l'adempimento del presente accordo, nonché qualsiasi accordo separato con cui ti forniamo i Servizi, sono regolati dalle leggi degli Stati Uniti d'America, ove applicabili, e in subordine dalle leggi dello Stato del Wyoming, senza riguardo ai principi sul conflitto di leggi. Qualsiasi controversia derivante da questi Termini e condizioni sarà sottoposta a un tribunale competente dello Stato del Wyoming, Stati Uniti d'America.</p>
          <p>Nulla in questi Termini limita i diritti inderogabili che potrebbero spettarti in base alla legislazione del tuo paese di residenza.</p>

          <h2 id="membership">Termini della Health For Life Membership</h2>
          <div className="box">
            <p><b>In breve:</b> la Health For Life Membership inizia con una prova gratuita di <b>7 giorni</b>. Se non annulli prima della fine della prova, il tuo metodo di pagamento sarà addebitato di <b>49,00 €</b> ogni <b>28 giorni</b>, fino a quando non annulli. Puoi annullare in qualsiasi momento dall'area membri o scrivendo a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Ti inviamo un promemoria via e-mail <b>3 giorni prima</b> di ogni addebito.</p>
          </div>

          <h3>Programma in abbonamento</h3>
          <p>Quando la Health For Life Membership viene aggiunta al tuo ordine, ti iscrivi a un programma in abbonamento con rinnovo automatico.</p>

          <h3>Prova gratuita e addebiti ricorrenti</h3>
          <p>La tua membership inizia con una prova gratuita di 7 giorni. Salvo annullamento prima della fine della prova, autorizzi Just Jenny ad addebitare automaticamente sul metodo di pagamento utilizzato per l'ordine originale l'importo di 49,00 € ogni 28 giorni, fino a quando non annulli.</p>

          <h3>Vantaggi della membership</h3>
          <p>Finché la tua membership è attiva, puoi accedere ai vantaggi riservati ai membri, tra cui: a ogni ciclo di fatturazione un prodotto idoneo per il benessere dell'udito gratuito, pagando soltanto il contributo di spedizione e gestione indicato per ciascun articolo; la Biblioteca Tinnitus con e-book scaricabili; offerte riservate ai membri; assistenza dedicata e altri vantaggi messi a disposizione da Just Jenny.</p>
          <p>I prodotti idonei e i vantaggi sono accessibili tramite l'<a href={PORTAL} target="_blank" rel="noopener">Area Membri</a>. L'idoneità dei prodotti, le quantità, la disponibilità, i contributi di spedizione e gestione e le altre condizioni sono indicati nell'area membri al momento della selezione.</p>

          <h3>Gestione della membership</h3>
          <p>Puoi accedere all'<a href={PORTAL} target="_blank" rel="noopener">Area Membri</a> per: visualizzare e gestire la tua membership; aggiornare i tuoi dati di pagamento; modificare o annullare la tua membership; accedere ai vantaggi disponibili; richiedere i prodotti idonei gratuiti e pagare gli eventuali contributi di spedizione e gestione.</p>

          <h3>Annullamento</h3>
          <p>Puoi annullare la tua membership in qualsiasi momento tramite l'Area Membri oppure inviando un'e-mail a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Per evitare l'addebito ricorrente successivo, l'annullamento deve essere completato prima della data del prossimo addebito programmato.</p>
          <p>L'annullamento della membership interrompe gli addebiti futuri, ma non annulla né rimborsa automaticamente ordini o addebiti già elaborati.</p>

          <h3>Descrizione sull'estratto conto</h3>
          <p>Gli addebiti della membership compaiono sul tuo estratto conto con la descrizione <b>JUST JENNY</b>, la stessa (o sostanzialmente simile) utilizzata per il tuo acquisto originale.</p>

          <h3>Promemoria di addebito</h3>
          <p>Ti inviamo un promemoria via e-mail 3 giorni prima di ogni addebito della membership. Resti comunque responsabile della gestione o dell'annullamento della tua membership prima della data di addebito applicabile.</p>

          <h3>Rimborsi della membership</h3>
          <p>Una volta elaborato un addebito ricorrente della membership, la quota relativa a quel periodo di fatturazione non è rimborsabile, salvo quanto diversamente previsto dalla legge applicabile o approvato ai sensi delle politiche di rimborso di Just Jenny.</p>

          <h3>Autorizzazione</h3>
          <p>Selezionando l'opzione membership e completando l'acquisto, confermando l'ordine nel checkout, dichiari di aver letto e accettato i presenti Termini della Health For Life Membership. Autorizzi Just Jenny ad addebitare sul metodo di pagamento selezionato 49,00 € ogni 28 giorni al termine della prova gratuita di 7 giorni, fino a quando non annulli.</p>
          <p>Per domande sulla tua membership, scrivi a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

          <h2 id="garanzia">Garanzia soddisfatti o rimborsati di 90 giorni</h2>
          <p>La garanzia soddisfatti o rimborsati di 90 giorni si applica esclusivamente ai prodotti <b>non aperti</b>, con sigillo integro, restituiti entro 90 giorni dalla data dell'ordine. I prodotti consumabili che sono stati aperti non possono essere restituiti né rimborsati, per motivi di igiene e sicurezza. Per avviare una richiesta di rimborso, scrivi a <a href={`mailto:${EMAIL}`}>{EMAIL}</a> indicando il numero d'ordine: riceverai le istruzioni per la restituzione. Il rimborso viene elaborato sul metodo di pagamento originale dopo la ricezione e la verifica dei prodotti restituiti.</p>

          <h2 id="prodotti">Prodotti</h2>
          <p>NeuroTone Drops è un prodotto per il benessere e non è un medicinale né un dispositivo medico; non è destinato a diagnosticare, trattare, curare o prevenire alcuna malattia. In caso di disturbi persistenti, consulta il tuo medico.</p>
          <p>Alcuni prodotti o servizi possono essere disponibili esclusivamente online tramite il sito. Tali prodotti o servizi possono avere quantità limitate e sono soggetti a restituzione o sostituzione esclusivamente in conformità alla nostra Garanzia soddisfatti o rimborsati di cui sopra. Abbiamo fatto il possibile per mostrare nel modo più accurato i colori e le immagini dei nostri prodotti; non possiamo garantire che la visualizzazione sul tuo schermo sia esatta. Ci riserviamo il diritto, senza esserne obbligati, di limitare la vendita dei nostri prodotti o Servizi a qualsiasi persona, area geografica o giurisdizione, caso per caso, e di limitare le quantità dei prodotti o servizi offerti. Tutte le descrizioni e i prezzi dei prodotti sono soggetti a modifica in qualsiasi momento senza preavviso, a nostra esclusiva discrezione. Ci riserviamo il diritto di interrompere la vendita di qualsiasi prodotto in qualsiasi momento. Qualsiasi offerta di prodotti o servizi presente su questo sito è nulla ove vietata.</p>

          <h2 id="sms">Comunicazioni via SMS</h2>
          <p>Fornendo il tuo numero di telefono e acconsentendo a ricevere messaggi, autorizzi Just Jenny a inviarti SMS informativi e promozionali (ad esempio aggiornamenti sugli ordini, promemoria e offerte). Il consenso non è una condizione per l'acquisto. La frequenza dei messaggi varia; possono applicarsi i costi previsti dal tuo operatore. Puoi annullare l'iscrizione in qualsiasi momento rispondendo STOP a un messaggio o scrivendo a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

          <h2 id="condizioni">Condizioni generali</h2>

          <h3>1. Condizioni del negozio online</h3>
          <p>Accettando questi Termini di servizio, dichiari di aver raggiunto la maggiore età nel tuo paese di residenza, oppure di aver raggiunto la maggiore età e di averci dato il consenso a consentire a eventuali minori a tuo carico di utilizzare questo sito. Non puoi utilizzare i nostri prodotti per scopi illegali o non autorizzati, né, nell'uso del Servizio, violare le leggi della tua giurisdizione (incluse, a titolo esemplificativo, le leggi sul diritto d'autore). Non devi trasmettere worm, virus o codice di natura distruttiva. Una violazione di qualsiasi Termine comporterà l'immediata cessazione dei Servizi.</p>

          <h3>2. Condizioni generali</h3>
          <p>Ci riserviamo il diritto di rifiutare il servizio a chiunque, per qualsiasi motivo e in qualsiasi momento. Comprendi che i tuoi contenuti (esclusi i dati della carta di credito) possono essere trasferiti in forma non crittografata e comportare (a) trasmissioni su varie reti e (b) modifiche per conformarsi e adattarsi ai requisiti tecnici delle reti o dei dispositivi connessi. I dati della carta di credito sono sempre crittografati durante il trasferimento in rete. Accetti di non riprodurre, duplicare, copiare, vendere, rivendere o sfruttare qualsiasi parte del Servizio, l'uso del Servizio o l'accesso al Servizio, senza la nostra espressa autorizzazione scritta. I titoli utilizzati in questo accordo sono inseriti solo per comodità e non limitano né influenzano in altro modo questi Termini.</p>

          <h3>3. Accuratezza, completezza e aggiornamento delle informazioni</h3>
          <p>Non siamo responsabili se le informazioni rese disponibili su questo sito non sono accurate, complete o aggiornate. Il materiale presente su questo sito è fornito solo a titolo informativo generale e non deve essere utilizzato come unica base per prendere decisioni senza consultare fonti di informazione primarie, più accurate, più complete o più aggiornate. Qualsiasi affidamento sul materiale di questo sito è a tuo rischio. Questo sito può contenere informazioni storiche, che per loro natura non sono aggiornate e sono fornite solo come riferimento. Ci riserviamo il diritto di modificare i contenuti di questo sito in qualsiasi momento, senza alcun obbligo di aggiornare le informazioni. È tua responsabilità monitorare le modifiche al nostro sito.</p>

          <h3>4. Modifiche al Servizio e ai prezzi</h3>
          <p>I prezzi dei nostri prodotti sono soggetti a modifica senza preavviso. Ci riserviamo il diritto di modificare o interrompere il Servizio (o qualsiasi sua parte o contenuto) in qualsiasi momento senza preavviso. Non saremo responsabili nei tuoi confronti o nei confronti di terzi per qualsiasi modifica, variazione di prezzo, sospensione o interruzione del Servizio.</p>

          <h3>5. Accuratezza dei dati di fatturazione e dell'account</h3>
          <p>Ci riserviamo il diritto di rifiutare qualsiasi ordine. Possiamo, a nostra esclusiva discrezione, limitare o annullare le quantità acquistate per persona, per nucleo familiare o per ordine. Tali restrizioni possono includere ordini effettuati con lo stesso account cliente, la stessa carta di credito e/o lo stesso indirizzo di fatturazione e/o spedizione. Qualora modifichiamo o annulliamo un ordine, potremo tentare di avvisarti contattando l'indirizzo e-mail, l'indirizzo di fatturazione o il numero di telefono forniti al momento dell'ordine. Ci riserviamo il diritto di limitare o vietare ordini che, a nostro esclusivo giudizio, sembrano effettuati da rivenditori o distributori. Accetti di fornire informazioni di acquisto e di account attuali, complete e accurate per tutti gli acquisti effettuati nel nostro negozio e di aggiornare tempestivamente i tuoi dati, inclusi l'indirizzo e-mail, i dati della carta e le date di scadenza, affinché possiamo completare le tue transazioni e contattarti se necessario.</p>

          <h3>6. Strumenti opzionali</h3>
          <p>Potremmo darti accesso a strumenti di terzi sui quali non esercitiamo alcun monitoraggio, controllo o contributo. Riconosci e accetti che forniamo l'accesso a tali strumenti «così come sono» e «secondo disponibilità», senza garanzie, dichiarazioni o condizioni di alcun tipo e senza alcuna approvazione. Non avremo alcuna responsabilità derivante dall'uso di strumenti opzionali di terzi, il cui utilizzo è interamente a tuo rischio e discrezione. Eventuali nuovi servizi e/o funzionalità offerti in futuro tramite il sito saranno anch'essi soggetti a questi Termini di servizio.</p>

          <h3>7. Collegamenti a terzi</h3>
          <p>Alcuni contenuti, prodotti e servizi disponibili tramite il nostro Servizio possono includere materiali di terzi. I collegamenti a terzi presenti su questo sito possono indirizzarti a siti non affiliati a noi. Non siamo responsabili dell'esame o della valutazione dei contenuti o dell'accuratezza di tali siti e non garantiamo né ci assumiamo alcuna responsabilità per materiali, prodotti o servizi di terzi. Non siamo responsabili di danni relativi all'acquisto o all'uso di beni, servizi, risorse o contenuti in relazione a siti di terzi. Ti invitiamo a leggere attentamente le politiche dei terzi prima di effettuare qualsiasi transazione. Reclami, richieste o domande relativi a prodotti di terzi devono essere rivolti al terzo.</p>

          <h3>8. Commenti, feedback e altri contributi</h3>
          <p>Se, su nostra richiesta o spontaneamente, ci invii idee creative, suggerimenti, proposte, piani o altri materiali, online, via e-mail, per posta o in altro modo (collettivamente «commenti»), accetti che possiamo in qualsiasi momento, senza restrizioni, modificare, copiare, pubblicare, distribuire, tradurre e utilizzare in qualsiasi mezzo i commenti che ci invii. Non abbiamo alcun obbligo di mantenere riservati i commenti, di corrispondere un compenso o di rispondere. Possiamo, senza esserne obbligati, monitorare, modificare o rimuovere contenuti che a nostra esclusiva discrezione riteniamo illeciti, offensivi, minacciosi, diffamatori, osceni o comunque discutibili, o che violano la proprietà intellettuale di terzi o questi Termini. Accetti che i tuoi commenti non violino alcun diritto di terzi e non contengano materiale illecito, abusivo o osceno, né virus o altro malware. Sei l'unico responsabile dei commenti che pubblichi e della loro accuratezza.</p>

          <h3>9. Dati personali</h3>
          <p>L'invio di dati personali tramite il negozio è regolato dalla nostra <a href="https://getjustjenny.com/policies/privacy-policy" target="_blank" rel="noopener">Informativa sulla privacy</a>.</p>

          <h3>10. Errori, inesattezze e omissioni</h3>
          <p>Occasionalmente il nostro sito o il Servizio possono contenere errori tipografici, inesattezze o omissioni relativi a descrizioni dei prodotti, prezzi, promozioni, offerte, spese di spedizione, tempi di consegna e disponibilità. Ci riserviamo il diritto di correggere eventuali errori, inesattezze o omissioni e di modificare o aggiornare le informazioni o annullare ordini qualora le informazioni siano inesatte, in qualsiasi momento e senza preavviso (anche dopo l'invio dell'ordine). Non ci assumiamo alcun obbligo di aggiornare, modificare o chiarire le informazioni presenti nel Servizio, incluse le informazioni sui prezzi, salvo quanto richiesto dalla legge.</p>

          <h3>11. Usi vietati</h3>
          <p>Oltre agli altri divieti previsti da questi Termini di servizio, ti è vietato utilizzare il sito o i suoi contenuti: (a) per scopi illeciti; (b) per sollecitare altri a compiere atti illeciti; (c) per violare normative, regole o leggi internazionali, federali, regionali o locali; (d) per violare i nostri diritti di proprietà intellettuale o quelli di terzi; (e) per molestare, abusare, insultare, danneggiare, diffamare, denigrare, intimidire o discriminare in base a genere, orientamento sessuale, religione, etnia, razza, età, origine nazionale o disabilità; (f) per fornire informazioni false o fuorvianti; (g) per caricare o trasmettere virus o altro codice dannoso; (h) per raccogliere o tracciare i dati personali di altri; (i) per attività di spam, phishing, pharming, pretexting, spidering, crawling o scraping; (j) per scopi osceni o immorali; o (k) per interferire con le funzionalità di sicurezza del Servizio o di altri siti o di Internet, o per eluderle. Ci riserviamo il diritto di interrompere il tuo utilizzo del Servizio in caso di violazione degli usi vietati.</p>

          <h3>12. Esclusione di garanzie; limitazione di responsabilità</h3>
          <p>Non garantiamo che l'uso del nostro servizio sarà ininterrotto, puntuale, sicuro o privo di errori, né che i risultati ottenibili dall'uso del servizio saranno accurati o affidabili. Accetti che di tanto in tanto potremo rimuovere il servizio per periodi di tempo indefiniti o annullarlo in qualsiasi momento, senza preavviso. Accetti espressamente che l'uso del servizio, o l'impossibilità di utilizzarlo, è a tuo esclusivo rischio. Il servizio e tutti i prodotti e servizi forniti tramite esso sono (salvo quanto espressamente dichiarato da noi) forniti «così come sono» e «secondo disponibilità», senza dichiarazioni, garanzie o condizioni di alcun tipo, espresse o implicite, incluse le garanzie implicite di commerciabilità, qualità, idoneità a uno scopo particolare, durata, titolo e non violazione. In nessun caso Just Jenny, {COMPANY}, i nostri amministratori, dirigenti, dipendenti, affiliati, agenti, appaltatori, fornitori, prestatori di servizi o licenzianti saranno responsabili per lesioni, perdite, reclami o danni diretti, indiretti, incidentali, punitivi, speciali o consequenziali di qualsiasi tipo, inclusi, a titolo esemplificativo, mancati profitti, mancati ricavi, mancati risparmi, perdita di dati, costi di sostituzione o danni simili, derivanti dall'uso del servizio o di qualsiasi prodotto acquistato tramite il servizio, anche se avvisati della loro possibilità. Poiché alcune giurisdizioni non consentono l'esclusione o la limitazione della responsabilità per danni consequenziali o incidentali, in tali giurisdizioni la nostra responsabilità sarà limitata nella misura massima consentita dalla legge.</p>

          <h3>13. Manleva</h3>
          <p>Accetti di manlevare, difendere e tenere indenni Just Jenny, {COMPANY} e le nostre società controllanti, controllate, affiliate, partner, dirigenti, amministratori, agenti, appaltatori, licenzianti, fornitori di servizi, subappaltatori, fornitori e dipendenti da qualsiasi reclamo o richiesta, incluse le ragionevoli spese legali, avanzati da terzi a causa o in conseguenza della tua violazione di questi Termini di servizio o dei documenti in essi incorporati per riferimento, o della tua violazione di qualsiasi legge o dei diritti di terzi.</p>

          <h3>14. Separabilità</h3>
          <p>Qualora una disposizione di questi Termini di servizio sia ritenuta illecita, nulla o inapplicabile, tale disposizione sarà comunque applicabile nella misura massima consentita dalla legge applicabile e la parte inapplicabile sarà considerata separata da questi Termini di servizio, senza che ciò pregiudichi la validità e l'applicabilità delle restanti disposizioni.</p>

          <h3>15. Risoluzione</h3>
          <p>Gli obblighi e le responsabilità delle parti sorti prima della data di risoluzione sopravvivono alla risoluzione di questo accordo a tutti gli effetti. Questi Termini di servizio sono efficaci salvo e fino alla risoluzione da parte tua o nostra. Puoi risolvere questi Termini in qualsiasi momento comunicandoci che non desideri più utilizzare i nostri Servizi o cessando di utilizzare il sito. Se a nostro esclusivo giudizio non rispetti, o sospettiamo che tu non rispetti, qualsiasi termine o disposizione di questi Termini, potremo risolvere questo accordo in qualsiasi momento senza preavviso; resterai responsabile di tutti gli importi dovuti fino alla data di risoluzione inclusa, e potremo negarti l'accesso ai nostri Servizi (o a parte di essi).</p>

          <h3>16. Intero accordo</h3>
          <p>Il mancato esercizio o la mancata applicazione da parte nostra di qualsiasi diritto o disposizione di questi Termini di servizio non costituisce rinuncia a tale diritto o disposizione. Questi Termini di servizio e qualsiasi politica o regola operativa pubblicata da noi su questo sito o in relazione al Servizio costituiscono l'intero accordo tra te e noi e regolano l'uso del Servizio, sostituendo qualsiasi accordo, comunicazione o proposta precedente o contemporanea, orale o scritta, tra te e noi (incluse eventuali versioni precedenti dei Termini di servizio). Eventuali ambiguità nell'interpretazione di questi Termini non saranno interpretate a sfavore della parte che li ha redatti.</p>

          <h3>17. Modifiche ai Termini di servizio</h3>
          <p>Puoi consultare la versione più recente dei Termini di servizio in qualsiasi momento su questa pagina. Ci riserviamo il diritto, a nostra esclusiva discrezione, di aggiornare, modificare o sostituire qualsiasi parte di questi Termini pubblicando aggiornamenti e modifiche sul nostro sito. È tua responsabilità controllare periodicamente il nostro sito. L'uso continuato del sito o del Servizio dopo la pubblicazione di eventuali modifiche costituisce accettazione di tali modifiche.</p>

          <h2 id="contatti">Contatti</h2>
          <p>Le domande sui Termini di servizio e sulla tua membership vanno inviate a <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
          <p>{COMPANY} · {ADDRESS} · EIN {EIN}</p>
        </div>
        <p className="foot">© {new Date().getFullYear()} Just Jenny · <a href={PORTAL}>Area Membri</a> · <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      </div>
    </>
  );
}
