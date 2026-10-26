// middleware.js
// De checkout is een statische pagina: public/checkout/index.html (+ assets).
//   /checkout                          → /checkout/index.html   (op elk domein, ook *.vercel.app om te testen)
//   checkout.getjustjenny.com/         → /checkout/index.html (A) of /checkout/b.html (B) — A/B-test, zie abVariant()
//   checkout.getjustjenny.com/grazie   → /checkout/grazie        (bedankpagina met quiz)
//   checkout.getjustjenny.com/lubrisense → /checkout/index.html  (LubriSense; ook /checkout?p=lubrisense)
//   checkout.getjustjenny.com/emorroidi → /checkout/index.html  (Emorroidi Cerotti; ook /checkout?p=emorroidi)
//   checkout.getjustjenny.com/3ds, /lubrisense/3ds, /magnesium/3ds, /emorroidi/3ds → idem, A/B-test 3D Secure voor debit/prepaid
// Het ledenportaal: members.getjustjenny.com/<pad> en intimate.getjustjenny.com/<pad> → /portal/<pad> (pages/portal/*).
//   API-routes (/api/portal/*) en Next-assets blijven op hun eigen pad.
// Het Operations Centre blijft gewoon op het dashboard-domein bereikbaar.

import { NextResponse } from "next/server";

// Bestanden met een extensie (foto's, pdf's, …) gaan altijd rechtstreeks naar public/
export const config = { matcher: ["/((?!_next/|api/|favicon.ico|checkout/|.*\\..*).*)"] };

/* A/B-test checkout NeuroTone (2026-10): env JJ_CHECKOUT_AB
     niet gezet / "50"  → 50% variant B, 50% A (een getal 0–100 = % naar B)
     "off"              → iedereen A (test uit, cookie wordt gewist, niet gemeten)
     "a"                → iedereen A, wél gemeten (cookie jj_ab=a → tag checkout-ab-a): controlegroep voor variant C
     "b"                → iedereen B
   ?ab=a / ?ab=b in de link dwingt een variant af (om te bekijken); ?ab=c = variant C (c.html, 3 offers op de checkout); de cookie jj_ab houdt een bezoeker 30 dagen in
   dezelfde variant. Alleen NeuroTone op de gewone link — /lubrisense, /magnesium, /emorroidi en de /3ds-links
   doen niet mee. */
const AB_COOKIE = "jj_ab";
function abVariant(req, onCheckoutHost) {
  const q = req.nextUrl.searchParams.get("ab");
  if (q === "a" || q === "b") return { v: q, cookie: "set" };
  if (q === "c") return { v: "c", cookie: null }; // variant C (offers op de checkout): enkel via de link ?ab=c van de nieuwe salespagina, geen cookie
  const mode = String(process.env.JJ_CHECKOUT_AB || "50").trim().toLowerCase();
  if (mode === "off") return { v: "a", cookie: req.cookies.get(AB_COOKIE) ? "clear" : null };
  if (!onCheckoutHost) return { v: "a", cookie: null }; // dashboard-domein (/checkout): standaard A, niet meetellen
  if (mode === "a" || mode === "b") return { v: mode, cookie: "set" }; // iedereen A (of B), wel gemeten (tag checkout-ab-a/-b) — bv. als controlegroep voor variant C
  const c = req.cookies.get(AB_COOKIE)?.value;
  if (c === "a" || c === "b") return { v: c, cookie: null };
  const pct = Math.max(0, Math.min(100, parseInt(mode, 10)));
  return { v: Math.random() * 100 < (Number.isFinite(pct) ? pct : 50) ? "b" : "a", cookie: "set" };
}

export function middleware(req) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const url = req.nextUrl;
  const onCheckoutHost = host.startsWith("checkout.");
  // Ledenportaal: members.… (NeuroTone) en intimate.… (LubriSense) — zelfde pagina's, brand volgt de host (lib/portal-brand.js)
  const onMembersHost = host.startsWith("members.") || host.startsWith("intimate.");

  if (onMembersHost) {
    // Nette URL's: members.getjustjenny.com/login i.p.v. /portal/login
    if (url.pathname === "/portal" || url.pathname.startsWith("/portal/")) {
      const to = url.clone();
      to.pathname = url.pathname.slice("/portal".length) || "/";
      return NextResponse.redirect(to, 308);
    }
    const to = url.clone();
    to.pathname = url.pathname === "/" ? "/portal" : `/portal${url.pathname}`;
    return NextResponse.rewrite(to);
  }

  // LubriSense: checkout.getjustjenny.com/lubrisense → zelfde checkoutpagina; checkout.js leest het product uit het pad
  // Magnesium Freeze (zonder membership): checkout.getjustjenny.com/magnesium → zelfde pagina
  // A/B-test 3DS: /3ds, /lubrisense/3ds, /magnesium/3ds en /emorroidi/3ds → zelfde checkoutpagina (checkout.js leest "/3ds" uit het pad)
  const lubri = onCheckoutHost && /^\/(?:(lubrisense|magnesium|emorroidi)(?:\/3ds)?|3ds)\/?$/.test(url.pathname);
  // A/B-test checkout NeuroTone: checkout.getjustjenny.com/ → variant A (index.html) of B (b.html), vast per bezoeker (cookie)
  const pq = (url.searchParams.get("p") || "").toLowerCase();
  const neuroRoot = ((onCheckoutHost && url.pathname === "/") || url.pathname === "/checkout" || url.pathname === "/checkout/")
    && (!pq || pq === "neurotone") && url.searchParams.get("ab") !== "3ds"; // ander product of 3DS-test → gewoon A, geen cookie
  if (neuroRoot) {
    const ab = abVariant(req, onCheckoutHost);
    const to = url.clone();
    to.pathname = ab.v === "b" ? "/checkout/b.html" : ab.v === "c" ? "/checkout/c.html" : "/checkout/index.html";
    const res = NextResponse.rewrite(to);
    if (ab.cookie === "set") res.cookies.set(AB_COOKIE, ab.v, { path: "/", maxAge: 30 * 86400, sameSite: "lax", secure: true });
    if (ab.cookie === "clear") res.cookies.set(AB_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  if (lubri || url.pathname === "/checkout" || url.pathname === "/checkout/" || (onCheckoutHost && url.pathname === "/")) {
    const to = url.clone();
    to.pathname = "/checkout/index.html";
    return NextResponse.rewrite(to);
  }
  if (onCheckoutHost && url.pathname === "/grazie") {
    const to = url.clone();
    to.pathname = "/checkout/grazie";
    return NextResponse.rewrite(to);
  }
  return NextResponse.next();
}
