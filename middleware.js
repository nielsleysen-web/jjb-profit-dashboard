// middleware.js
// De checkout is een statische pagina: public/checkout/index.html (+ assets).
//   /checkout                          → /checkout/index.html   (op elk domein, ook *.vercel.app om te testen)
//   checkout.getjustjenny.com/         → /checkout/index.html
//   checkout.getjustjenny.com/grazie   → /checkout/grazie        (bedankpagina met quiz)
// Het ledenportaal: members.getjustjenny.com/<pad> → /portal/<pad> (pages/portal/*).
//   API-routes (/api/portal/*) en Next-assets blijven op hun eigen pad.
// Het Operations Centre blijft gewoon op het dashboard-domein bereikbaar.

import { NextResponse } from "next/server";

export const config = { matcher: ["/((?!_next/|api/|favicon.ico|portal/|checkout/).*)"] };

export function middleware(req) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const url = req.nextUrl;
  const onCheckoutHost = host.startsWith("checkout.");
  const onMembersHost = host.startsWith("members.");

  if (onMembersHost) {
    const to = url.clone();
    to.pathname = url.pathname === "/" ? "/portal" : `/portal${url.pathname}`;
    return NextResponse.rewrite(to);
  }

  if (url.pathname === "/checkout" || url.pathname === "/checkout/" || (onCheckoutHost && url.pathname === "/")) {
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
