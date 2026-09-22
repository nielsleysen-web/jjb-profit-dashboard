// pages/api/validate-code.js
// POST { code } → controleert een Stripe-kortingscode (promotion code) voor de checkout.
// Kortingscodes maak je in Stripe → Producten → Coupons → Promotiecode.

import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" }) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!stripe) return res.status(200).json({ valid: false });
  try {
    const code = String((req.body || {}).code || "").trim().slice(0, 60);
    if (!code) return res.status(200).json({ valid: false });
    const codes = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    const pc = codes.data[0];
    if (!pc || !pc.coupon || !pc.coupon.valid) return res.status(200).json({ valid: false });
    return res.status(200).json({
      valid: true,
      code: pc.code,
      percent_off: pc.coupon.percent_off || null,
      amount_off: pc.coupon.amount_off || null,
      duration: pc.coupon.duration, // once | repeating | forever
    });
  } catch (e) {
    console.error("validate-code:", e.message);
    return res.status(200).json({ valid: false });
  }
}
