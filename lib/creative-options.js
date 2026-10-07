// lib/creative-options.js — gedeelde keuzelijsten voor video- en design-taken (Shopify metaobject "creative-options").
// icp: per product · scriptStructure: video · formatType: video · formatTypeDesign: design
// Wat iemand intypt komt automatisch in de lijst; verwijderen kan via action "optionRemove" op de taken-API's.

export const OPTION_LISTS = { icp: "icp", scriptStructure: "scriptStructure", formatType: "formatType", formatTypeDesign: "formatTypeDesign" };

export const productKey = (title) => String(title || "").trim().toLowerCase() || "_none";

export function normOptions(o) {
  return {
    icp: o?.icp && typeof o.icp === "object" ? o.icp : {},
    scriptStructure: Array.isArray(o?.scriptStructure) ? o.scriptStructure : [],
    formatType: Array.isArray(o?.formatType) ? o.formatType : [],
    formatTypeDesign: Array.isArray(o?.formatTypeDesign) ? o.formatTypeDesign : [],
  };
}

export function addOption(opts, list, value, product) {
  const v = String(value || "").trim();
  if (!v || !OPTION_LISTS[list]) return false;
  const arr = list === "icp" ? (opts.icp[productKey(product)] = opts.icp[productKey(product)] || []) : opts[list];
  if (arr.some((x) => x.toLowerCase() === v.toLowerCase())) return false;
  arr.push(v);
  arr.sort((a, b) => a.localeCompare(b));
  return true;
}

export function removeOption(opts, list, value, product) {
  const v = String(value || "").toLowerCase();
  if (!OPTION_LISTS[list]) return;
  if (list === "icp") { const k = productKey(product); opts.icp[k] = (opts.icp[k] || []).filter((x) => x.toLowerCase() !== v); }
  else opts[list] = opts[list].filter((x) => x.toLowerCase() !== v);
}
