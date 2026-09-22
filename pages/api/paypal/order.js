// pages/api/paypal/order.js
// Gegevens voor de bedankpagina bij een PayPal-bestelling: GET /api/paypal/order?id=I-XXXX

import { paypalConfigured, pp, unpackCustom, findOrderForPaypal } from "../../../lib/paypal";
import { BUNDLES, SHIPPING } from "../../../lib/checkout";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!paypalConfigured()) return res.status(500).json({ error: "PayPal non configurato" });
  const id = String(req.query.id || "");
  if (!/^I-[A-Z0-9]{6,}$/.test(id)) return res.status(400).json({ error: "Riferimento non valido" });
  try {
    const sub = await pp("get", `/v1/billing/subscriptions/${id}`);
    const created = Math.floor(new Date(sub.create_time || Date.now()).getTime() / 1000);
    if (Date.now() / 1000 - created > 30 * 86400) return res.status(404).json({ error: "Non trovato" });
    const meta = unpackCustom(sub.custom_id);
    const bundle = BUNDLES[meta.qty] || BUNDLES[3];
    const ship = SHIPPING[meta.ship] || SHIPPING.insured;
    const s = sub.subscriber || {};
    const a = s.shipping_address?.address || {};
    let order = null;
    try {
      const o = await findOrderForPaypal(id);
      if (o) order = { name: o.name, statusPageUrl: o.statusPageUrl, tax: Math.round(parseFloat(o.totalTaxSet?.shopMoney?.amount || "0") * 100) };
    } catch (e) { console.warn("paypal/order shopify:", e.message); }
    return res.status(200).json({
      paid: sub.status === "ACTIVE",
      created,
      qty: bundle.qty,
      shipping: ship.code,
      amountPaid: Math.round(parseFloat(sub.billing_info?.last_payment?.amount?.value || (bundle.price + ship.price) / 100) * 100),
      email: s.email_address || "",
      name: s.shipping_address?.name?.full_name || [s.name?.given_name, s.name?.surname].filter(Boolean).join(" "),
      phone: "",
      address: a.address_line_1 ? { line1: a.address_line_1, line2: a.address_line_2 || "", postal_code: a.postal_code, city: a.admin_area_2, state: a.admin_area_1 } : null,
      payment: { type: "paypal" },
      order,
    });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: "Non trovato" });
    console.error("paypal/order:", e.message);
    return res.status(500).json({ error: "Errore" });
  }
}
