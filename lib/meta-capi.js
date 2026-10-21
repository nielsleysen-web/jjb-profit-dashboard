// lib/meta-capi.js — Meta Conversions API: Purchase-event voor membership-orders (server-side).
//
// Waarom: membership-orders lopen NIET door de Shopify-checkout, dus WeTracked/Shopify-pixel
// zien geen Purchase. De Stripe- en PayPal-webhook sturen daarom zelf een Purchase naar Meta,
// met fbc/fbp/IP/browser uit de checkout + gehashte klantgegevens (sterke match).
// De bedankpagina vuurt hetzelfde event in de browser met hetzelfde event_id → Meta dedupliceert.
//
// event_id = "jjb-<ordernummer>" (zelfde conventie als pages/api/attribution.js).
// Env: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN (of META_CAPI_TOKEN), optioneel META_TEST_EVENT_CODE

import axios from "axios";
import crypto from "crypto";
import { setJson, getJson, redis, storeConfigured } from "./portal-store";

// Resultaat per order bewaren (Redis, 30 dagen): zichtbaar in /api/meta-check?purchases=1 (orders zonder geslaagd
// server-event) — zodat een verschil tussen onze orders en Meta's aankopen niet blind blijft.
const CAPI_TTL = 30 * 86400;
export const capiKey = (orderName) => `capi:${String(orderName || "").replace("#", "")}`;
export const capiResult = (orderName) => (storeConfigured() ? getJson(capiKey(orderName)) : Promise.resolve(null));
async function remember(orderName, result) {
  if (!storeConfigured() || !orderName) return;
  try {
    await setJson(capiKey(orderName), result, CAPI_TTL);
    // Index per dag (UTC) voor het overzicht
    const day = new Date().toISOString().slice(0, 10);
    await redis(["SADD", `capi:day:${day}`, String(orderName).replace("#", "")]);
    await redis(["EXPIRE", `capi:day:${day}`, String(CAPI_TTL)]);
  } catch (e) { console.warn("meta-capi remember:", e.message); }
}

const sha = (v) => { const s = (v == null ? "" : String(v)).trim().toLowerCase(); return s ? crypto.createHash("sha256").update(s).digest("hex") : undefined; };
// Zelfde content_id als InitiateCheckout/AddPaymentInfo in de checkout (Shopify product-id NeuroTone)
export const META_CONTENT_ID = "10561889403146";
export const purchaseEventId = (orderName) => `jjb-${String(orderName || "").replace("#", "")}`;

export function capiConfigured() {
  return !!(process.env.META_PIXEL_ID && (process.env.META_CAPI_ACCESS_TOKEN || process.env.META_CAPI_TOKEN));
}

/**
 * p = { orderName, createdAt(ms|iso), value, currency, email, phone, firstName, lastName, city, zip, state, country,
 *       clientIp, userAgent, fbc, fbp, vid, sourceUrl, contents:[{id, quantity}], provider }
 * Nooit blokkerend: fouten worden gelogd, niet gegooid.
 */
export async function sendPurchase(p) {
  if (!capiConfigured()) { console.warn("meta-capi: META_PIXEL_ID / token ontbreekt — Purchase niet verstuurd"); return { sent: false }; }
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN || process.env.META_CAPI_TOKEN;
  try {
    const user_data = {
      em: p.email ? [sha(p.email)] : undefined,
      ph: p.phone ? [sha(String(p.phone).replace(/[^0-9]/g, ""))] : undefined,
      fn: p.firstName ? [sha(p.firstName)] : undefined,
      ln: p.lastName ? [sha(p.lastName)] : undefined,
      ct: p.city ? [sha(String(p.city).replace(/[^a-z]/gi, ""))] : undefined,
      st: p.state ? [sha(p.state)] : undefined,
      zp: p.zip ? [sha(String(p.zip).replace(/\s/g, ""))] : undefined,
      country: [sha((p.country || "IT").slice(0, 2))],
      external_id: p.vid ? [sha(p.vid)] : undefined,
      client_ip_address: p.clientIp || undefined,
      client_user_agent: p.userAgent || undefined,
      fbc: p.fbc || undefined,
      fbp: p.fbp || undefined,
    };
    Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);
    const t = p.createdAt ? new Date(p.createdAt).getTime() : Date.now();
    const event = {
      event_name: "Purchase",
      event_time: Math.floor(Math.min(t, Date.now()) / 1000),
      event_id: purchaseEventId(p.orderName),
      action_source: "website",
      event_source_url: p.sourceUrl || "https://checkout.getjustjenny.com/checkout/grazie",
      user_data,
      custom_data: {
        currency: p.currency || "EUR",
        value: Math.round((p.value || 0) * 100) / 100,
        order_id: p.orderName,
        content_type: "product",
        contents: p.contents && p.contents.length ? p.contents : undefined,
        content_ids: p.contents && p.contents.length ? p.contents.map((c) => c.id) : undefined,
        num_items: p.contents && p.contents.length ? p.contents.reduce((a, c) => a + (c.quantity || 1), 0) : undefined,
      },
    };
    Object.keys(event.custom_data).forEach((k) => event.custom_data[k] === undefined && delete event.custom_data[k]);
    const body = { data: [event] };
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
    const signals = { fbc: !!p.fbc, fbp: !!p.fbp, email: !!p.email, phone: !!p.phone, ip: !!p.clientIp, ua: !!p.userAgent };
    let r, lastErr;
    // Eén keer opnieuw proberen bij een netwerk-/serverfout (niet bij een afgekeurd event: dat geeft Meta als 400 terug)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await axios.post(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, body, { timeout: 15000 });
        break;
      } catch (e) {
        lastErr = e;
        const status = e.response?.status;
        if (status && status < 500) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    if (!r) throw lastErr;
    console.log(`meta-capi: Purchase ${event.event_id} (${p.provider || "?"}) → events_received ${r.data?.events_received}`);
    await remember(p.orderName, { at: new Date().toISOString(), ok: true, eventsReceived: r.data?.events_received, fbtrace: r.data?.fbtrace_id, provider: p.provider, value: event.custom_data.value, eventTime: event.event_time, signals });
    return { sent: true, eventId: event.event_id };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.warn("meta-capi Purchase:", msg);
    await remember(p.orderName, { at: new Date().toISOString(), ok: false, error: String(msg).slice(0, 300), provider: p.provider, signals: { fbc: !!p.fbc, fbp: !!p.fbp, email: !!p.email, phone: !!p.phone } });
    return { sent: false, error: e.message };
  }
}
