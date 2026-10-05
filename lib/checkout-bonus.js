// lib/checkout-bonus.js — "1 flacone in omaggio" uit de abandoned-checkout-mail 2.
// De checkout (?bonus=1) zet via /api/checkout/started de sleutel checkout:bonus:<email> (30 dagen).
// Bij het aanmaken van de Shopify-order (Stripe-webhook en PayPal) komt er dan een gratis regel "1x NeuroTone" bij;
// de sleutel wordt pas gewist nadat de order gelukt is (bij een herhaalde webhook blijft het omaggio dus staan).
import { redis, storeConfigured } from "./portal-store";
import { BUNDLES } from "./checkout";

const key = (email) => `checkout:bonus:${String(email || "").trim().toLowerCase()}`;

export async function hasCheckoutBonus(email) {
  if (!email || !storeConfigured()) return false;
  try { return !!(await redis(["GET", key(email)])); } catch { return false; }
}
export async function clearCheckoutBonus(email) {
  if (!email || !storeConfigured()) return;
  try { await redis(["DEL", key(email)]); } catch {}
}
// Gratis orderregel: 1x NeuroTone aan € 0,00 (kostprijs telt mee in de COGS van het dashboard)
export const bonusLineItem = () => ({ variantId: BUNDLES[1].variantId, quantity: 1, priceSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } } });
