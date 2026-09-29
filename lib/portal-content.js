// lib/portal-content.js — Inhoud van de Tinnitus Library en de Health Courses.
//
// Library-regel: per cyclus 1 nieuw e-book downloaden. Wat al gedownload is, blijft altijd beschikbaar.
// Boeken toevoegen: PDF in public/portal/library/<slug>.pdf zetten en hieronder een regel toevoegen.
//
// Cursussen: ontgrendelen X dagen na de start van het lidmaatschap. Video's komen van Vimeo
// (lessons: [{ id, it:{title}, en:{title}, vimeo: "https://player.vimeo.com/video/..." }]).

export const LIBRARY_RULES = { booksPerCycle: 1 };

export const BOOKS = [
  // { slug: "dormire-meglio", pages: 24, file: "/portal/library/dormire-meglio.pdf",
  //   it: { title: "Dormire meglio con l'acufene" }, en: { title: "Sleep Better With Tinnitus" } },
];

export const COURSES = [
  {
    slug: "primi-passi-neurotone", unlockDays: 0, icon: "📖", tone: "p",
    it: { title: "Primi passi con NeuroTone", desc: "Come usare le gocce, cosa aspettarti nei primi 30 giorni e le 3 abitudini che le fanno agire più in fretta." },
    en: { title: "Getting Started With NeuroTone", desc: "How to use the drops, what to expect in the first 30 days, and the 3 habits that make them work faster." },
    lessons: [],
  },
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
