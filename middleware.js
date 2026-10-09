// middleware.js
// De checkout is een statische pagina: public/checkout/index.html (+ assets).
//   /checkout                          → /checkout/index.html   (op elk domein, ook *.vercel.app om te testen)
//   checkout.getjustjenny.com/         → /checkout/index.html
//   checkout.getjustjenny.com/grazie   → /checkout/grazie        (bedankpagina met quiz)
//   checkout.getjustjenny.com/lubrisense → /checkout/index.html  (LubriSense; ook /checkout?p=lubrisense)
// Het ledenportaal: members.getjustjenny.com/<pad> en intimate.getjustjenny.com/<pad> → /portal/<pad> (pages/portal/*).
//   API-routes (/api/portal/*) en Next-assets blijven op hun eigen pad.
// Het Operations Centre blijft gewoon op het dashboard-domein bereikbaar.

import { NextResponse } from "next/server";

// Bestanden met een extensie (foto's, pdf's, …) gaan altijd rechtstreeks naar public/
export const config = { matcher: ["/((?!_next/|api/|favicon.ico|checkout/|.*\\..*).*)"] };

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
  const lubri = onCheckoutHost && /^\/(lubrisense|magnesium)\/?$/.test(url.pathname);
  if (url.pathname === "/checkout" || url.pathname === "/checkout/" || (onCheckoutHost && url.pathname === "/") || lubri) {
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
