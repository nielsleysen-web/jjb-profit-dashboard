// lib/script-swipe.js — woorden met tijden (ElevenLabs Scribe) → zinnen voor Script Swipe

// ---- zinnen uit woorden (ElevenLabs Scribe: words[{text,start,end,type}]) ----
const END = /[.!?…]["»)]?$/;
export function splitSentences(words, fallbackText = "") {
  const out = [];
  let cur = [], start = null, prevEnd = null;
  const flush = () => {
    const text = cur.join("").replace(/\s+/g, " ").trim();
    if (text) out.push({ t: Math.round((start || 0) * 10) / 10, text });
    cur = []; start = null;
  };
  for (const w of words || []) {
    if (w.type === "audio_event") continue;
    const txt = String(w.text || "");
    if (w.type === "spacing") { if (cur.length) cur.push(txt); continue; }
    const gap = prevEnd != null && typeof w.start === "number" ? w.start - prevEnd : 0;
    const len = cur.join("").length;
    // lange pauze = nieuwe zin (ook zonder punt), of te lange zin afbreken op een komma
    if (cur.length && ((gap > 1.0 && len > 25) || (len > 170 && /[,;:]$/.test(cur.join("").trim())))) flush();
    if (start == null) start = typeof w.start === "number" ? w.start : 0;
    cur.push(txt);
    prevEnd = typeof w.end === "number" ? w.end : prevEnd;
    if (END.test(txt)) flush();
  }
  flush();
  if (!out.length && fallbackText) {
    fallbackText.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean).forEach((text) => out.push({ t: null, text }));
  }
  return out.map((s, i) => ({ i: i + 1, t: s.t, text: s.text, mine: "" }));
}

