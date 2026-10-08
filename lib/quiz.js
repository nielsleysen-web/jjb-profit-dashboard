// lib/quiz.js — Enquête na aankoop (bedankpagina + losse pagina /sondaggio/<product>), per product.
// Vragen aanpassen kan hier; de volgorde moet gelijk blijven aan de kolommen in de Google Sheet
// (NeuroTone = eerste tabblad, LubriSense = tabblad "LubriSense"; zie pages/api/checkout-quiz.js).

export const QUIZ_INTRO = {
  title: "Rispondi alle seguenti domande (3 min) e potrai vincere un premio del valore di 10.000 €",
  sub: "Le vostre risposte non saranno condivise con terze parti.",
  done: "Grazie per le tue risposte!",
};

export const QUIZ_LUBRISENSE = [
  "Come sta andando in questo momento la tua secchezza intima? Come la vivi?",
  "Cosa ti accorgi di evitare o di trovare difficile proprio a causa di questo problema?",
  "Quando di notte non riesci a dormire e pensi a questo problema, qual è la cosa peggiore che ti passa per la testa?",
  "Ci sono situazioni che eviti attivamente a causa di questo problema? Se sì, come fai?",
  "Cosa hai trovato online su questo problema e cosa ne pensi di quelle informazioni?",
  "Secondo te, qual era la vera causa di questo problema?",
  "Cosa avevi già provato prima e perché non ha funzionato?",
  "Cosa ti ha spinto, alla fine, ad agire subito invece di aspettare ancora?",
  "Rispondi con sincerità: cosa ti ha quasi impedito di ordinare questo prodotto?",
  "Ma cosa ti ha convinto, alla fine, a provarlo comunque?",
  "Se funzionasse, qual è la prima cosa che vorresti che cambiasse nella tua vita?",
];
export const QUIZ_NEUROTONE = [
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


export const QUIZZES = { neurotone: QUIZ_NEUROTONE, lubrisense: QUIZ_LUBRISENSE };
export const quizFor = (product) => QUIZZES[String(product || "").toLowerCase()] || QUIZ_NEUROTONE;
