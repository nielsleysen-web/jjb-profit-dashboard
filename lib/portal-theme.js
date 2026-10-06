// lib/portal-theme.js — Huisstijl per portaal (client-safe, geen server-imports).
//
//   members.getjustjenny.com   → NeuroTone   (warm oranje + groen)  — de bestaande opmaak, ongewijzigd
//   intimate.getjustjenny.com  → LubriSense  (roze/pruim, zoals de LubriSense-verpakkingen)
//
// De opmaak van het portaal staat in CSS-strings (AuthShell, PortalStyles, HomeStyles). Voor LubriSense worden
// de merk-kleuren in die CSS vervangen; succes/fout-kleuren (groen/rood) blijven gelijk.
// Teksten: zie BRAND_TEXT hieronder (wordt toegepast door useT() in lib/portal-i18n.js).

export function portalBrandKey() {
  if (typeof window === "undefined") return "neurotone";
  const host = window.location.host || "";
  if (/^intimate\./i.test(host)) return "lubrisense";
  if (/getjustjenny\.com$/i.test(host)) return "neurotone";
  // Testen op een andere host (preview/lokaal): ?brand=lubrisense, onthouden in een cookie (ook voor de API)
  try {
    const q = new URLSearchParams(window.location.search).get("brand");
    if (q === "lubrisense" || q === "neurotone") {
      document.cookie = `jj_brand=${q}; Path=/; Max-Age=86400; SameSite=Lax`;
      return q;
    }
    const m = document.cookie.match(/(?:^|;\s*)jj_brand=(\w+)/);
    if (m && m[1] === "lubrisense") return "lubrisense";
  } catch {}
  return "neurotone";
}

// NeuroTone-kleur → LubriSense-kleur
const LUBRI_COLORS = {
  "#df8455": "#c2477a", // accent (knoppen, actieve tab)
  "#d2773f": "#a93a68", // accent hover
  "#c96f43": "#a83a66", // accent tekst
  "#f2b58f": "#eeb0c8", // licht accent
  "#fdeee4": "#fbe8f0", // accent-achtergrond
  "#fbf3ed": "#fbf1f5",
  "#fdf3ec": "#fdf1f6",
  "#f1d9c9": "#efd2df", // accent-rand
  "#fffaf6": "#fff8fb",
  "#faf6f2": "#faf5f8",
  "#fcf9f6": "#fcf8fa",
  "#fffdfb": "#fffcfd",
  "#87b995": "#d38aa9", // focus-ring / cadeau ok-balk
  "#2f4a3b": "#4a2338", // donkere membershipkaart
  "#4f7a5f": "#7a3a5c",
  "#cfe8d6": "#f3d3e2",
  "#3f6650": "#5e2c48",
  "#9fe0b2": "#f5a8c8",
  "#faf8f6": "#fbf8fa", // pagina-achtergrond
};

// Zelfde voor rgba()-tinten van de merkkleuren (schaduwen, gloed)
const LUBRI_RGB = { "223,132,85": "194,71,122", "135,185,149": "211,138,169", "159,224,178": "245,168,200", "253,238,228": "251,232,240" };

export function brandCss(css, brand) {
  if (brand !== "lubrisense" || !css) return css;
  return css
    .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => LUBRI_COLORS[hex.toLowerCase()] || hex)
    .replace(/rgba\((\d+),(\d+),(\d+),/g, (m, r, g, b) => (LUBRI_RGB[`${r},${g},${b}`] ? `rgba(${LUBRI_RGB[`${r},${g},${b}`]},` : m));
}

// Teksten die per portaal anders zijn (letterlijke vervanging in alle portaalteksten)
export const BRAND_TEXT = {
  lubrisense: {
    it: [
      ["Biblioteca Tinnitus", "Biblioteca dell'Intimità"],
      ["Health For Life Membership", "Intimate Care Membership"],
      ["Health For Life", "Intimate Care"],
      ["Health 4 Life", "Intimate Care"],
      ["NeuroTone Drops", "LubriSense"],
      ["NeuroTone", "LubriSense"],
    ],
    en: [
      ["The Tinnitus Library", "The Intimacy Library"],
      ["Tinnitus Library", "Intimacy Library"],
      ["Health For Life Membership", "Intimate Care Membership"],
      ["Health For Life", "Intimate Care"],
      ["Health 4 Life", "Intimate Care"],
      ["NeuroTone Drops", "LubriSense"],
      ["NeuroTone", "LubriSense"],
    ],
  },
};

export function brandText(s, brand, lang) {
  const list = BRAND_TEXT[brand]?.[lang] || BRAND_TEXT[brand]?.it;
  if (!list || typeof s !== "string") return s;
  return list.reduce((out, [a, b]) => out.split(a).join(b), s);
}
