// pages/api/checkout-config.js
// Publieke instellingen voor de checkout-pagina (public/checkout). Zo staan er geen sleutels
// in de (publieke) repo: alles komt uit de Vercel-omgevingsvariabelen.
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  pk_test_… of pk_live_…
//   STRIPE_PAYPAL=1                     PayPal tonen (eerst aanzetten in Stripe → Betaalmethoden)
//   META_PIXEL_ID                       optioneel: Meta Pixel op de checkout
//   PAYPAL_CLIENT_ID (+ PAYPAL_ENV)     PayPal-knoppen (rechtstreeks, buiten Stripe)

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    stripePk: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    paypal: process.env.STRIPE_PAYPAL === "1",
    pixelId: process.env.META_PIXEL_ID || "",
    paypalClientId: process.env.PAYPAL_CLIENT_SECRET ? process.env.PAYPAL_CLIENT_ID || "" : "",
  });
}
