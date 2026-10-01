// lib/upsell-gate.js — Mail 1 ("Started Membership") pas versturen na de upsellpagina, zodat de ordertabel
// in die mail ook de offerta 1+1 bevat.
//
// Flow:  webhook/confirm → holdStartedMembership(ref, memberInfo)   (payload 2 uur in Redis)
//        upsellpagina:   klant kiest ja → releaseStartedMembership(ref, { upsellAdded: true })
//                        klant kiest nee / gaat door → releaseStartedMembership(ref)
//        cron (elke 10 min): alles ouder dan 30 min alsnog versturen (klant sloot de pagina)
// ref = Stripe subscription-id of PayPal subscription-id (zelfde als in de URL van de upsellpagina).

import { redis, getJson, setJson, del, storeConfigured } from "./portal-store";
import { sendStartedMembership } from "./klaviyo";
import { UPSELL } from "./checkout";

const KEY = (ref) => `portal:mail1:${ref}`;
const SET = "portal:mail1:pending";
const HOLD_MAX_MIN = 30;

const DECIDED = (ref) => `portal:mail1:${ref}:decided`;

export async function holdStartedMembership(ref, memberInfo) {
  if (!storeConfigured() || !ref) return sendStartedMembership(memberInfo); // zonder Redis: meteen sturen
  await setJson(KEY(ref), { m: memberInfo, at: Date.now() }, 2 * 3600);
  await redis(["SADD", SET, ref]);
  // Klant was al klaar op de upsellpagina vóór de webhook hier kwam → meteen versturen met die keuze
  const decided = await getJson(DECIDED(ref)).catch(() => null);
  if (decided) return releaseStartedMembership(ref, { upsellAdded: !!decided.upsellAdded });
  return { held: true };
}

export async function releaseStartedMembership(ref, { upsellAdded = false } = {}) {
  if (!storeConfigured() || !ref) return { skipped: true };
  const h = await getJson(KEY(ref));
  if (!h) {
    // Nog niet vastgehouden (webhook komt later) → keuze bewaren; of al verstuurd → niets te doen
    const sent = await redis(["EXISTS", `${KEY(ref)}:sent`]).catch(() => 0);
    if (!sent) {
      const prev = await getJson(DECIDED(ref)).catch(() => null);
      if (!prev || upsellAdded) await setJson(DECIDED(ref), { upsellAdded: upsellAdded || !!prev?.upsellAdded, at: Date.now() }, 2 * 3600);
      return { skipped: true, reason: "not_held_yet", remembered: true };
    }
    return { skipped: true, reason: "already_sent" };
  }
  // Eén keer: wie het slot pakt stuurt
  const lock = await redis(["SET", `${KEY(ref)}:sent`, "1", "NX", "EX", "86400"]);
  if (lock !== "OK") return { skipped: true, reason: "already" };
  try {
    await sendStartedMembership(h.m, { upsellAdded, upsellAmount: UPSELL.price / 100, upsellCompare: UPSELL.compare / 100, upsellTitle: UPSELL.title });
  } catch (e) {
    await del(`${KEY(ref)}:sent`).catch(() => {});
    throw e;
  }
  await del(KEY(ref)).catch(() => {});
  await del(DECIDED(ref)).catch(() => {});
  await redis(["SREM", SET, ref]).catch(() => {});
  return { sent: true, upsellAdded };
}

// Cron: vastgehouden mails ouder dan 30 minuten alsnog versturen
export async function flushHeld({ maxAgeMin = HOLD_MAX_MIN } = {}) {
  if (!storeConfigured()) return { sent: [] };
  const refs = (await redis(["SMEMBERS", SET])) || [];
  const sent = [], skipped = [];
  for (const ref of refs) {
    const h = await getJson(KEY(ref));
    if (!h) { await redis(["SREM", SET, ref]).catch(() => {}); continue; }
    if (Date.now() - h.at < maxAgeMin * 60000) { skipped.push(ref); continue; }
    try { const r = await releaseStartedMembership(ref, { upsellAdded: false }); if (r.sent) sent.push(ref); }
    catch (e) { console.warn("mail1 flush:", ref, e.message); }
  }
  return { sent, skipped };
}
