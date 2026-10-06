// lib/portal-brand.js — Eén ledenportaal-code voor meerdere producten ("brands").
//
//   members.getjustjenny.com   → NeuroTone   (Health For Life Membership) — zoals altijd
//   intimate.getjustjenny.com  → LubriSense  (Intimate Care Membership)
//
// Hoe het werkt (server):
//   - Elke /api/portal/*-route draait in withPortalBrand(handler): het brand volgt uit de host.
//   - Webhooks/cron die voor een ander product werken gebruiken runWithBrand("lubrisense", fn).
//   - currentBrand() geeft binnen die context het actieve brand terug (AsyncLocalStorage, volgt alle awaits).
//   - lib/portal-store.js zet Redis-sleutels "portal:…" automatisch om naar het prefix van het brand
//     ("lportal:…" voor LubriSense) → leden, inloglinks, bestellingen en cadeaus zijn volledig gescheiden,
//     ook als iemand van beide producten lid is.
//   - lib/klaviyo.js zet de brandnaam voor elk event ("LubriSense Portal Login Link", …) zodat elk product
//     zijn eigen Klaviyo-flows en mails heeft.
//
// Client: brandFromHost(window.location.host) (zie lib/portal-i18n.js → usePortalBrand).

import { AsyncLocalStorage } from "async_hooks";

export const BRANDS = {
  neurotone: {
    key: "neurotone",
    productKey: "neurotone",
    portalUrl: (process.env.PORTAL_URL || "https://members.getjustjenny.com").replace(/\/$/, ""),
    redisPrefix: "portal:",
    eventPrefix: "",
    propPrefix: "jj_",
  },
  lubrisense: {
    key: "lubrisense",
    productKey: "lubrisense",
    portalUrl: (process.env.LUBRISENSE_PORTAL_URL || "https://intimate.getjustjenny.com").replace(/\/$/, ""),
    redisPrefix: "lportal:",
    eventPrefix: "LubriSense ",
    propPrefix: "jj_lubrisense_",
  },
};

export const brandKeyFromHost = (host) => (/^intimate\./i.test(String(host || "")) ? "lubrisense" : "neurotone");

const als = new AsyncLocalStorage();

export const currentBrand = () => als.getStore() || BRANDS.neurotone;
export const getBrand = (key) => BRANDS[key] || BRANDS.neurotone;

export function runWithBrand(key, fn) {
  return als.run(getBrand(key), fn);
}

// Brand van een request: host (intimate.* = LubriSense). Op andere hosts (preview/test) kan ?brand=lubrisense.
export function brandKeyFromReq(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (/^intimate\./i.test(String(host))) return "lubrisense";
  const q = String(req.query?.brand || "").toLowerCase();
  if (q && BRANDS[q] && !/getjustjenny\.com$/i.test(String(host))) return q;
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)jj_brand=(\w+)/);
  if (m && BRANDS[m[1]] && !/getjustjenny\.com$/i.test(String(host))) return m[1];
  return "neurotone";
}

export function withPortalBrand(handler) {
  return (req, res) => runWithBrand(brandKeyFromReq(req), () => handler(req, res));
}

// Redis-sleutel naar het actieve brand omzetten ("portal:…" → "lportal:…")
export function brandKey(key) {
  const b = currentBrand();
  if (b.redisPrefix === "portal:" || typeof key !== "string" || !key.startsWith("portal:")) return key;
  return b.redisPrefix + key.slice("portal:".length);
}
