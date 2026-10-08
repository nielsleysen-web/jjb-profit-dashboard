// lib/checkout-bonus.js — "1 flacone in omaggio" uit de abandoned-checkout-mail 2 (NeuroTone én LubriSense).
// De checkout (?bonus=1) zet via /api/checkout/started de sleutel checkout:bonus:<email> (30 dagen).
// Bij het aanmaken van de Shopify-order (Stripe-webhook en PayPal) komt er dan een gratis regel "1x NeuroTone" bij;
// de sleutel wordt pas gewist nadat de order gelukt is (bij een herhaalde webhook blijft het omaggio dus staan).
import { redis, storeConfigured } from "./portal-store";
import { getProduct } from "./checkout";

const key = (email) => `checkout:bonus:${String(email || "").trim().toLowerCase()}`;

// Geeft het product van het omaggio terug ("neurotone" | "lubrisense"), of false
export async function hasCheckoutBonus(email) {
  if (!email || !storeConfigured()) return false;
  try { const v = await redis(["GET", key(email)]); return v ? (v === "1" ? "neurotone" : String(v)) : false; } catch { return false; }
}
export async function clearCheckoutBonus(email) {
  if (!email || !storeConfigured()) return;
  try { await redis(["DEL", key(email)]); } catch {}
}
// Gratis orderregel: 1x van het product aan € 0,00 (kostprijs telt mee in de COGS van het dashboard)
export const bonusLineItem = (productKey) => ({ variantId: getProduct(productKey).bundles[1].variantId, quantity: 1, priceSet: { shopMoney: { amount: "0.00", currencyCode: "EUR" } } });
