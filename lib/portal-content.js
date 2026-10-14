// lib/portal-content.js — Inhoud van de Tinnitus Library en de Health Courses.
//
// Library-regel: per cyclus 1 nieuw e-book ontgrendelen. Wat al ontgrendeld is, blijft altijd beschikbaar.
// Boeken toevoegen: PDF met onraadbare naam in public/portal/library/ zetten, cover erbij, en hieronder een regel toevoegen.
//
// Cursussen: ontgrendelen X dagen na de start van het lidmaatschap. Les = { id, section, video: "<sleutel>", parts?: n,
// it:{title,desc}, en:{title,desc} }. De video-URL's per sleutel staan in lib/portal-course-videos.js (Shopify Files);
// ondertitels in public/portal/courses/<dir>/. Cursus zonder lessen = "Video in arrivo".

import { currentBrand } from "./portal-brand";

export const LIBRARY_RULES = { booksPerCycle: 1 };

// file: pad onder public/ (naam niet te raden: alleen bereikbaar via /api/portal/library na ontgrendeling)
// gift: dit boek is het welkomstcadeau: altijd gratis, telt niet mee voor de 1-per-cyclus.
export const BOOKS = [
  { slug: "neurotone-6-giorni", pages: 25, file: "/portal/library/c32582ac08bc-neurotone-6-giorni.pdf", cover: "/portal/library/neurotone-6-giorni-cover.jpg", gift: true,
    it: { title: "NeuroTone: come ottenere i migliori risultati con le gocce", desc: "La tecnica corretta, il piano di 6 giorni e le 3 abitudini che fanno agire le gocce più in fretta." },
    en: { title: "NeuroTone: how to get the best results with the drops", desc: "The right technique, the 6-day plan and the 3 habits that make the drops work faster." } },
  { slug: "proteggere-udito", pages: 23, file: "/portal/library/d52b5cf37dea-proteggere-udito.pdf", cover: "/portal/library/proteggere-udito-cover.jpg",
    it: { title: "Proteggere l'udito ogni giorno", desc: "Rumore, acqua, pressione e le abitudini che tengono le orecchie in salute. Con la routine di protezione in 1 minuto." },
    en: { title: "Protecting your hearing every day", desc: "Noise, water, pressure and the habits that keep your ears healthy. With the 1-minute protection routine." } },
  { slug: "suoni-acufene", pages: 20, file: "/portal/library/94711b37dc3e-suoni-acufene.pdf", cover: "/portal/library/suoni-acufene-cover.jpg",
    it: { title: "I suoni che peggiorano l'acufene", desc: "I 10 rumori che alzano il volume del fischio, il paradosso del silenzio, i suoni che aiutano e il diario di 7 giorni per trovare i tuoi interruttori." },
    en: { title: "The sounds that make tinnitus worse", desc: "The 10 noises that turn up the ringing, the silence paradox, the sounds that help and a 7-day diary to find your personal triggers." } },
  { slug: "per-chi-ti-sta-accanto", pages: 19, file: "/portal/library/35f1d44d4ae9-per-chi-ti-sta-accanto.pdf", cover: "/portal/library/per-chi-ti-sta-accanto-cover.jpg",
    it: { title: "Per chi ti sta accanto", desc: "La guida per il partner e la famiglia: cosa sente davvero, le frasi che aiutano e quelle che feriscono, dieci cose concrete da fare e come prendersi cura anche di sé." },
    en: { title: "For the people around you", desc: "The guide for your partner and family: what tinnitus really feels like, the words that help and the ones that hurt, ten concrete things to do and how to look after themselves too." } },
  { slug: "dormire-acufene", pages: 19, file: "/portal/library/103028c219a9-dormire-acufene.pdf", cover: "/portal/library/dormire-acufene-cover.jpg",
    it: { title: "Dormire con l'acufene", desc: "La camera giusta, la routine serale di 90 minuti, cosa fare alle 3 di notte e il piano di 7 notti per addormentarti prima e sentire il fischio più basso." },
    en: { title: "Sleeping with tinnitus", desc: "The right bedroom, the 90-minute evening routine, what to do at 3 a.m. and the 7-night plan to fall asleep sooner and hear the ringing less." } },
  { slug: "stress-acufene", pages: 19, file: "/portal/library/5167650f63e4-stress-acufene.pdf", cover: "/portal/library/stress-acufene-cover.jpg",
    it: { title: "Stress e acufene: il circolo da spezzare", desc: "Perché lo stress alza il volume del fischio, le quattro tecniche di 3 minuti, i 10 minuti di silenzio e il piano di 14 giorni per smettere di controllarlo." },
    en: { title: "Stress and tinnitus: breaking the loop", desc: "Why stress turns up the ringing, the four 3-minute techniques, the 10 minutes of silence and the 14-day plan to stop checking on it." } },
];
// LubriSense: Biblioteca dell'Intimità. Boek 1 = welkomstcadeau (gift: true, telt niet mee voor de 1-per-cyclus) én
// het "regalo a sorpresa" uit welkomstmail 1: elk LubriSense-lid krijgt het als cadeau om te openen op de Home.
export const LUBRISENSE_SURPRISE = "dopo-i-45";
export const LUBRISENSE_BOOKS = [
  { slug: "dopo-i-45", pages: 11, file: "/portal/library/0ac3fc49cc65-dopo-i-45.pdf", cover: "/portal/library/dopo-i-45-cover.jpg", gift: true,
    it: { title: "Dopo i 45: ritrova il piacere dell'intimità", desc: "Cosa cambia nel tuo corpo, perché non è colpa tua, le 5 regole per LubriSense e il piano di 7 serate per ritrovare desiderio, comfort e piacere." },
    en: { title: "After 45: rediscover the pleasure of intimacy", desc: "What changes in your body, why it isn't your fault, the 5 rules for LubriSense and the 7-evening plan to rediscover desire, comfort and pleasure." } },
  { slug: "pavimento-pelvico", pages: 11, file: "/portal/library/5a4a2339b858-pavimento-pelvico.pdf", cover: "/portal/library/pavimento-pelvico-cover.jpg",
    it: { title: "Il pavimento pelvico in 10 minuti al giorno", desc: "Trovarlo, allenarlo e usarlo: la routine di 10 minuti, il piano di 4 settimane e come portare i risultati sotto le lenzuola." },
    en: { title: "Your pelvic floor in 10 minutes a day", desc: "Find it, train it and use it: the 10-minute routine, the 4-week plan and how to bring the results into the bedroom." } },
  { slug: "parlarne-insieme", pages: 11, file: "/portal/library/fe4cfd4f1116-parlarne-insieme.pdf", cover: "/portal/library/parlarne-insieme-cover.jpg",
    it: { title: "Parlarne insieme: la conversazione che riaccende l'intimità", desc: "Come dire al tuo partner cosa cambia e cosa desideri: le frasi giuste, il momento giusto e i segnali per parlarvi anche senza parole." },
    en: { title: "Talking about it: the conversation that reignites intimacy", desc: "How to tell your partner what is changing and what you want: the right words, the right moment and signals to talk without words." } },
  { slug: "mai-piu-cistite", pages: 11, file: "/portal/library/6484cc91e6c1-mai-piu-cistite.pdf", cover: "/portal/library/mai-piu-cistite-cover.jpg",
    it: { title: "Mai più cistite dopo l'amore", desc: "Perché succede, i segnali da riconoscere e le abitudini prima, durante e dopo che ti aiutano a prevenirla. Con la checklist." },
    en: { title: "No more cystitis after sex", desc: "Why it happens, the signs to recognise and the habits before, during and after that help you prevent it. With a checklist." } },
  { slug: "30-serate-per-due", pages: 9, file: "/portal/library/d4ec6eba5a8c-30-serate-per-due.pdf", cover: "/portal/library/30-serate-per-due-cover.jpg",
    it: { title: "30 serate per due", desc: "Un mese di idee per riscoprirvi: complicità, sensi risvegliati, giochi e piccole sorprese. Una serata alla volta." },
    en: { title: "30 evenings for two", desc: "A month of ideas to rediscover each other: closeness, awakened senses, games and little surprises. One evening at a time." } },
];
export const LUBRISENSE_COURSES = [];
const isLubri = () => currentBrand().key === "lubrisense";
export const portalBooks = () => (isLubri() ? LUBRISENSE_BOOKS : BOOKS);
export const portalCourses = () => (isLubri() ? LUBRISENSE_COURSES : COURSES);
export const findBook = (slug) => portalBooks().find((b) => b.slug === slug) || null;

export const COURSES = [
  {
    // "Coping with Tinnitus" van Erin Martz, Ph.D. (gebruikt met toestemming). Video's: Shopify Files
    // (lib/portal-course-videos.js), lessen > 10 min in delen (parts) omdat Shopify max. 10 min per video toelaat.
    // Ondertitels (it + en): public/portal/courses/<dir>/<video>[-<deel>].<taal>.vtt. Pdf's in dezelfde map.
    slug: "convivere-acufene", dir: "acufene", unlockDays: 56, icon: "🎧", tone: "", videoLang: "en",
    it: { title: "Convivere con l'acufene", desc: "Un corso video in 7 parti di Erin Martz, Ph.D.: cos'è l'acufene, il legame con lo stress e tre gruppi di strategie (problem solving, gestione dello stress, sostegno sociale) per conviverci meglio." },
    en: { title: "Coping with Tinnitus", desc: "A 7-part video course by Erin Martz, Ph.D.: what tinnitus is, how it connects to stress and three groups of strategies (problem solving, stress management, social support) to cope with it better." },
    sections: [
      { id: "s1", it: "Introduzione al corso", en: "Introduction to this course" },
      { id: "s2", it: "L'acufene in breve", en: "A brief overview of tinnitus" },
      { id: "s3", it: "Lo stress e i due modi di affrontarlo", en: "Stress and the two main ways of coping" },
      { id: "s4", it: "Strategie di problem solving", en: "Problem-solving strategies" },
      { id: "s5", it: "Strategie per gestire lo stress", en: "Stress-management strategies" },
      { id: "s6", it: "Strategie di sostegno sociale", en: "Social support strategies" },
      { id: "s7", it: "Riepilogo", en: "Summary" },
    ],
    lessons: [
      { id: "l01", section: "s1", video: "01",
        it: { title: "Introduzione", desc: "Benvenuto nel corso: di cosa parleremo e come è organizzato." },
        en: { title: "Introduction", desc: "Welcome to the course: what it covers and how it is organised." } },
      { id: "l02", section: "s1", video: "02", story: 1,
        it: { title: "Vivere con l'acufene: storia 1", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 1", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l03", section: "s2", video: "03", parts: 2,
        it: { title: "L'acufene in breve", desc: "Una panoramica chiara: che cos'è l'acufene e cosa sappiamo oggi." },
        en: { title: "A brief overview of tinnitus", desc: "A clear overview: what tinnitus is and what we know today." } },
      { id: "l04", section: "s2", video: "04", story: 2,
        it: { title: "Vivere con l'acufene: storia 2", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 2", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l05", section: "s3", video: "05", parts: 3,
        it: { title: "Lo stress, i due modi di affrontarlo e il concetto di \"adattamento\"", desc: "Che cos'è lo stress, i due grandi gruppi di strategie per affrontarlo e perché la strategia giusta dipende dalla situazione." },
        en: { title: "Stress, the two main coping groups and the concept of fitting", desc: "What stress is, the two main groups of coping strategies and why the right strategy depends on the situation." } },
      { id: "l06", section: "s3", video: "06", story: 3,
        it: { title: "Vivere con l'acufene: storia 3", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 3", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l07", section: "s4", video: "07", parts: 2,
        it: { title: "Il problem solving per affrontare meglio l'acufene", desc: "Come usare le tecniche di problem solving per affrontare meglio le situazioni legate all'acufene." },
        en: { title: "Using problem solving to cope with tinnitus", desc: "How to use problem-solving techniques to better cope with tinnitus-related situations." } },
      { id: "l08", section: "s4", video: "08", story: 4,
        it: { title: "Vivere con l'acufene: storia 4", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 4", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l09", section: "s5", video: "09", parts: 2,
        it: { title: "Le strategie per gestire lo stress", desc: "Le strategie per gestire lo stress quando la situazione non si può cambiare." },
        en: { title: "Stress-management coping strategies", desc: "Strategies to manage stress when the situation itself can't be changed." } },
      { id: "l10", section: "s5", video: "10", story: 5,
        it: { title: "Vivere con l'acufene: storia 5", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 5", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l11", section: "s6", video: "11", parts: 2,
        it: { title: "Le strategie di sostegno sociale", desc: "Come cercare e ricevere sostegno dalle persone che ti stanno accanto." },
        en: { title: "Social support coping strategies", desc: "How to seek and receive support from the people around you." } },
      { id: "l12", section: "s6", video: "12", story: 6,
        it: { title: "Vivere con l'acufene: storia 6", desc: "Un breve video sulla vita di tutti i giorni di una persona con l'acufene." },
        en: { title: "Living with tinnitus: story 6", desc: "A short video about everyday life for a person with tinnitus." } },
      { id: "l13", section: "s7", video: "13", parts: 2,
        it: { title: "Riepilogo del corso", desc: "I punti chiave del corso, in breve." },
        en: { title: "Course summary", desc: "The key points of the course, in brief." } },
    ],
    materials: [
      { id: "m1", file: "bibliografia.pdf", it: "Bibliografia", en: "Reference list" },
      { id: "m2", file: "avvertenze-e-consenso.pdf", it: "Avvertenze e consenso", en: "Disclaimer and consent" },
      { id: "m3", file: "riconoscimenti.pdf", it: "Riconoscimenti", en: "Credits" },
    ],
  },
  {
    slug: "sleep-reset", unlockDays: 112, icon: "🌙", tone: "o",
    it: { title: "Sleep Reset per l'acufene", desc: "Un corso in 5 parti per ritrovare un sonno profondo, anche nelle notti più rumorose." },
    en: { title: "Sleep Reset for Tinnitus", desc: "A 5-part course to rebuild deep sleep, even on loud nights." },
    lessons: [],
  },
];
