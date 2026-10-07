// lib/creative-naming.js — één plek voor de naming convention van video-taken.
// PRODUCT | CONCEPT | ANGLE | ICP | AWARENESS STAGE | SCRIPT STRUCTURE | FORMAT TYPE | CREATIVE STRATEGIST | EDITOR | DEADLINE
// Oudere taken hebben nog alleen het vroegere veld "angle": dat telt dan als concept.

export const AWARENESS_STAGES = ["Unaware", "Problem Aware", "Solution Aware", "Product Aware", "Most Aware"];

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export const videoConcept = (t) => t?.concept || t?.angle || "";

export function videoNaming(t) {
  return [
    t.product?.title, videoConcept(t), t.mechanism, t.icp, t.awareness, t.scriptStructure, t.formatType,
    firstName(t.strategistName), firstName(t.assigneeName), fmtDate(t.deadline),
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase())
    .join(" | ");
}

// Design-taken: PRODUCT | CONCEPT | ANGLE | ICP | AWARENESS STAGE | FORMAT TYPE | CREATIVE STRATEGIST | DESIGNER | DEADLINE
export function designNaming(t) {
  return [
    t.product?.title, videoConcept(t), t.mechanism, t.icp, t.awareness, t.formatType,
    firstName(t.strategistName), firstName(t.assigneeName), fmtDate(t.deadline),
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase())
    .join(" | ");
}
