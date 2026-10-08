// lib/script-swipe.js — geplakt transcript → zinnen voor Script Swipe.
// Regels: eerst per regel (Descript/Word exporteren per alinea of spreker), dan per zin (. ! ? …);
// tijdcodes zoals "00:12", "[00:12]" of "0:12 -" aan het begin van een regel en sprekerlabels ("Speaker 1:") worden weggelaten.

const TIME = /^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]?\s*[-–—:]?\s*/;
const SPEAKER = /^\s*(?:speaker|spreker|voice)\s*\d*\s*:\s*/i;
const ABBR = /(?:\b(?:dr|mr|mrs|ms|prof|dott|dott\.ssa|sig|sig\.ra|sig\.na|st|vs|etc|ecc|e\.g|i\.e|es|ca|n|nr|no|p\.es|avv|ing|geom|rag|jr|sr)\.|\b[A-Z]\.)$/i;

export function splitText(raw) {
  const out = [];
  const lines = String(raw || "").replace(/\r/g, "").split("\n").map((l) => l.replace(TIME, "").replace(SPEAKER, "").trim()).filter(Boolean);
  for (const line of lines) {
    // zin eindigt op . ! ? … (ook met sluitend aanhalingsteken/haakje) gevolgd door een spatie
    const rawParts = line.split(/(?<=[.!?…]["»)]?)\s+(?=\S)/);
    // afkortingen niet als zinseinde zien (Dr. Smith, Dott.ssa Rossi, Sig. Bianchi, initialen, e.g., ecc.)
    const parts = [];
    for (const part of rawParts) {
      const prev = parts[parts.length - 1];
      if (prev && ABBR.test(prev)) parts[parts.length - 1] = prev + " " + part;
      else parts.push(part);
    }
    for (const p of parts) {
      const t = p.replace(/\s+/g, " ").trim();
      if (!t) continue;
      // te lange zin zonder punt: op komma knippen rond 180 tekens
      if (t.length > 220) {
        let rest = t;
        while (rest.length > 220) {
          const cut = rest.lastIndexOf(", ", 200);
          if (cut < 60) break;
          out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
        }
        if (rest) out.push(rest);
      } else out.push(t);
    }
  }
  return out.slice(0, 2000).map((text, i) => ({ i: i + 1, t: null, text, mine: "" }));
}

// Segmenten met starttijd (Whisper-chunks) → zinnen; de starttijd van het segment gaat mee met de eerste zin
export function splitChunks(chunks) {
  const out = [];
  for (const c of chunks || []) {
    const parts = splitText(c.text);
    parts.forEach((p, k) => out.push({ t: k === 0 ? c.t : null, text: p.text }));
  }
  return out.slice(0, 2000).map((x, i) => ({ i: i + 1, t: x.t, text: x.text, mine: "" }));
}
