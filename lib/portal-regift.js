// lib/portal-regift.js — "Regalo" bij heractivering na een mislukte rebill (server-only)
//
// Belofte uit de mails (m5b/m6): wie na een mislukte betaling de membership hervat, krijgt
//   1. één extra e-book naar keuze (bovenop de 1-per-cyclus van de Biblioteca Tinnitus), en
//   2. 9,95 € korting op de spedizione-e-gestione-fee van één product naar keuze.
// Alleen bij reden "payment_failed" (niet bij een gewone opzegging die men zelf ongedaan maakt).
//
// Redis: portal:regift:<email> = { grantedAt, ebookUsedAt, ebookSlug, creditCents, creditUsedAt, creditFor, creditOrder }
// Geen TTL: het cadeau blijft staan tot het gebruikt is. Een nieuw cadeau wordt alleen toegekend als het vorige
// volledig gebruikt is (anders blijft het lopende cadeau gewoon staan).

import { getJson, setJson } from "./portal-store";
import { normEmail } from "./portal-auth";

export const REGIFT_CREDIT_CENTS = 995;
const key = (e) => `portal:regift:${normEmail(e)}`;

export async function getRegift(email) {
  return (await getJson(key(email)).catch(() => null)) || null;
}

// Wat er nog open staat → voor de UI en de overview
export function regiftView(g) {
  if (!g) return null;
  const ebookLeft = !g.ebookUsedAt;
  const creditLeft = !g.creditUsedAt ? g.creditCents || 0 : 0;
  if (!ebookLeft && !creditLeft) return null;
  return { grantedAt: g.grantedAt, ebookLeft, creditCents: creditLeft, credit: creditLeft / 100 };
}

// Toekennen (idempotent): bestaand, nog niet volledig gebruikt cadeau blijft staan
export async function grantReactivationGift(email) {
  const cur = await getRegift(email);
  if (cur && (!cur.ebookUsedAt || !cur.creditUsedAt)) return { granted: false, existing: true };
  await setJson(key(email), { grantedAt: new Date().toISOString(), ebookUsedAt: null, ebookSlug: null, creditCents: REGIFT_CREDIT_CENTS, creditUsedAt: null, creditFor: null, creditOrder: null });
  return { granted: true };
}

// Openstaand tegoed op de fee van een product (in centen); 0 als er niets is
export async function availableCredit(email) {
  const v = regiftView(await getRegift(email));
  return v?.creditCents || 0;
}

export async function useRegiftEbook(email, slug) {
  const g = await getRegift(email);
  if (!g || g.ebookUsedAt) return false;
  await setJson(key(email), { ...g, ebookUsedAt: new Date().toISOString(), ebookSlug: slug });
  return true;
}

export async function useRegiftCredit(email, slug, orderName) {
  const g = await getRegift(email);
  if (!g || g.creditUsedAt) return false;
  await setJson(key(email), { ...g, creditUsedAt: new Date().toISOString(), creditFor: slug, creditOrder: orderName || null });
  return true;
}
