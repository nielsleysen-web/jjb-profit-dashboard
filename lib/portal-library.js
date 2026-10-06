// lib/portal-library.js — Tinnitus Library: ontgrendelen, cadeau en downloads (server-only)
//
// Regels (LIBRARY_RULES): per cyclus 1 e-book ontgrendelen; ontgrendeld = voor altijd opnieuw te downloaden.
// Welkomstcadeau: het boek met gift:true is altijd gratis en telt niet mee voor de 1-per-cyclus.
// (De "15 minuten" uit mail 1 zijn alleen urgentie in de mail; in het portaal is er geen klok.)
//
// Redis:
//   portal:lib:<email>                 set van ontgrendelde slugs (geen TTL)
//   portal:libcycle:<email>:<cycleYMD> set van slugs die deze cyclus meetellen (45 dagen)
//   portal:gift:<email>                { claimedAt }  (geen TTL) — alleen om te weten dat het cadeau is opgehaald

import { redis, getJson, setJson } from "./portal-store";
import { normEmail } from "./portal-auth";
import { portalBooks, LIBRARY_RULES, findBook } from "./portal-content";
import { getRegift, useRegiftEbook } from "./portal-regift";
import { logEvent } from "./portal-activity";

const libKey = (e) => `portal:lib:${normEmail(e)}`;
const cycleKey = (e, cs) => `portal:libcycle:${normEmail(e)}:${new Date(cs).toISOString().slice(0, 10)}`;
const giftKey = (e) => `portal:gift:${normEmail(e)}`;

export async function getGift(email) {
  const book = portalBooks().find((b) => b.gift);
  if (!book) return null;
  const g = await getJson(giftKey(email)).catch(() => null);
  const claimed = !!g?.claimedAt;
  return { slug: book.slug, claimed, active: !claimed };
}

export async function getLibraryState(email, cycleStart) {
  const [unlocked, used, gift, regift] = await Promise.all([
    redis(["SMEMBERS", libKey(email)]).catch(() => []),
    redis(["SMEMBERS", cycleKey(email, cycleStart)]).catch(() => []),
    getGift(email),
    getRegift(email).catch(() => null),
  ]);
  // Regalo na heractivering: één extra e-book naar keuze, los van de cyclus
  const bonus = regift && !regift.ebookUsedAt ? 1 : 0;
  return { unlocked: new Set(unlocked || []), used: new Set(used || []), gift, bonus };
}

export function libraryView(state, cycleStart, cycleEnd) {
  const bonus = state.bonus || 0;
  const left = Math.max(0, LIBRARY_RULES.booksPerCycle - state.used.size) + bonus;
  const books = portalBooks().map((b) => {
    const unlocked = state.unlocked.has(b.slug);
    const giftNow = !!(b.gift && !unlocked);
    return {
      slug: b.slug, it: b.it, en: b.en, pages: b.pages, cover: b.cover, gift: !!b.gift,
      unlocked, giftNow,
      available: unlocked || giftNow || left > 0,
      availableAgain: !unlocked && !giftNow && left === 0 ? new Date(cycleEnd).toISOString() : null,
    };
  });
  // Cadeauboek al in de bibliotheek (bv. geopend als "regalo a sorpresa" op de Home) → geen cadeau-banner meer
  const gift = state.gift && state.unlocked.has(state.gift.slug) ? { ...state.gift, claimed: true, active: false } : state.gift;
  return { books, perCycle: LIBRARY_RULES.booksPerCycle, left, bonus, gift, cycleEnd: new Date(cycleEnd).toISOString() };
}

export class LibraryError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }

// Boek ontgrendelen (of al ontgrendeld) → bestandspad. Gooit LibraryError("limit") als de cyclus op is.
export async function unlockBook(email, slug, cycleStart) {
  const book = findBook(slug);
  if (!book) throw new LibraryError("unknown", 404);
  const state = await getLibraryState(email, cycleStart);
  if (state.unlocked.has(slug)) return { file: book.file, unlocked: true, viaGift: false };
  if (book.gift) {
    await redis(["SADD", libKey(email), slug]);
    await setJson(giftKey(email), { claimedAt: new Date().toISOString() });
    await logEvent(email, "ebook", { slug, gift: true });
    return { file: book.file, unlocked: true, viaGift: true };
  }
  if (state.used.size >= LIBRARY_RULES.booksPerCycle) {
    // Cyclus op → het extra e-book van het regalo (heractivering) gebruiken, als dat er is
    if (state.bonus && (await useRegiftEbook(email, slug))) {
      await redis(["SADD", libKey(email), slug]);
      await logEvent(email, "ebook", { slug, regift: true });
      return { file: book.file, unlocked: true, viaGift: false, viaRegift: true };
    }
    throw new LibraryError("limit", 403);
  }
  await redis(["SADD", libKey(email), slug]);
  await redis(["SADD", cycleKey(email, cycleStart), slug]);
  await redis(["EXPIRE", cycleKey(email, cycleStart), String(45 * 86400)]);
  await logEvent(email, "ebook", { slug });
  return { file: book.file, unlocked: true, viaGift: false };
}

export async function isUnlocked(email, slug) {
  const r = await redis(["SISMEMBER", libKey(email), slug]).catch(() => 0);
  return r === 1 || r === true;
}
