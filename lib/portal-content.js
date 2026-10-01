// lib/portal-content.js — Inhoud van de Tinnitus Library en de Health Courses.
//
// Library-regel: per cyclus 1 nieuw e-book ontgrendelen. Wat al ontgrendeld is, blijft altijd beschikbaar.
// Boeken toevoegen: PDF met onraadbare naam in public/portal/library/ zetten, cover erbij, en hieronder een regel toevoegen.
//
// Cursussen: ontgrendelen X dagen na de start van het lidmaatschap (voorlopig alles vergrendeld; de
// cursus "Primi passi con NeuroTone" (dag 0) is eruit tot er content is). Video's komen van Vimeo
// (lessons: [{ id, it:{title}, en:{title}, vimeo: "https://player.vimeo.com/video/..." }]).

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
];
export const findBook = (slug) => BOOKS.find((b) => b.slug === slug) || null;

export const COURSES = [
  {
    slug: "quiet-ear-method", unlockDays: 56, icon: "🎧", tone: "",
    it: { title: "Health 4 Life: il metodo Quiet Ear", desc: "Un corso in 8 parti per proteggere il tuo udito: sonno, stress, alimentazione e le abitudini quotidiane che tengono basso il fischio." },
    en: { title: "Health 4 Life: The Quiet Ear Method", desc: "An 8-part course on protecting your hearing for good: sleep, stress, diet and the daily habits that keep the ringing down." },
    lessons: [],
  },
  {
    slug: "sleep-reset", unlockDays: 112, icon: "🌙", tone: "o",
    it: { title: "Sleep Reset per l'acufene", desc: "Un corso in 5 parti per ritrovare un sonno profondo, anche nelle notti più rumorose." },
    en: { title: "Sleep Reset for Tinnitus", desc: "A 5-part course to rebuild deep sleep, even on loud nights." },
    lessons: [],
  },
];
