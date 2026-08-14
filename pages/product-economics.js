// pages/product-economics.js
// Product Economics — live Shopify producten, unit costs (COGS) invullen,
// direct opgeslagen in Shopify (inventoryItem.unitCost) → dashboard synct automatisch.

import { useState, useEffect, useRef } from "react";

const FEE_PERCENT = 0.029;
const FEE_FIXED = 0.3;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const ui = {
  page: {
    padding: "28px 36px",
    background: "#f7f8fa",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #eceef2",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#8a92a3",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
  },
};

const fmt = (v) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v || 0);

const calcRow = (price, cogs) => {
  const fees = price > 0 ? price * FEE_PERCENT + FEE_FIXED : 0;
  const margin = price - (cogs || 0) - fees;
  const be = margin > 0 ? price / margin : null;
  const p10 = margin - 0.1 * price > 0 ? price / (margin - 0.1 * price) : null;
  const p20 = margin - 0.2 * price > 0 ? price / (margin - 0.2 * price) : null;
  return { fees, margin, be, p10, p20 };
};

export default function ProductEconomics() {
  const [products, setProducts] = useState([]);
  const [soldMap, setSoldMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState({}); // { productId: { invItemId: "12.50" } }
  const [saving, setSaving] = useState(null);
  const isMobile = useIsMobile();
  // Handmatige product ↔ Meta-campagne-koppeling (admin)
  const [isAdmin, setIsAdmin] = useState(false);
  const [campaignAliases, setCampaignAliases] = useState({});
  const [unmatchedCampaigns, setUnmatchedCampaigns] = useState([]);
  const [linkFor, setLinkFor] = useState(null); // producttitel waarvan het koppelpaneel open staat
  const [aliasDraft, setAliasDraft] = useState([]);
  const [aliasInput, setAliasInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [prodRes, dashRes] = await Promise.all([
        fetch("/api/products-search").then((r) => r.json()),
        fetch("/api/dashboard?range=30d").then((r) => r.json()).catch(() => null),
      ]);
      if (!prodRes.success) throw new Error(prodRes.error);
      setProducts(prodRes.products);

      const sold = {};
      if (dashRes?.success) {
        for (const p of dashRes.data.products || []) sold[p.name] = p.orders;
        setIsAdmin(!!dashRes.data.isAdmin);
        setCampaignAliases(dashRes.data.campaignAliases || {});
        setUnmatchedCampaigns(dashRes.data.unmatchedCampaigns || []);
      }
      setSoldMap(sold);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Getrackte producten = minstens één variant met unitCost ingevuld
  const tracked = products.filter((p) => p.variants.some((v) => v.unitCost != null));

  const openLinkPanel = (productTitle) => {
    setLinkFor(productTitle);
    setAliasDraft(campaignAliases[productTitle] || []);
    setAliasInput("");
  };
  const saveCampaignLink = async () => {
    setLinkBusy(true);
    try {
      const r = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveCampaignLink", product: linkFor, aliases: aliasDraft }),
      }).then((x) => x.json());
      if (!r.success) throw new Error(r.error || "Could not save");
      setCampaignAliases(r.aliases || {});
      setLinkFor(null);
      loadData();
    } catch (e) {
      alert(e.message);
    }
    setLinkBusy(false);
  };
  const fmtEur = (v) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v || 0);

  const startEdit = (product) => {
    const values = {};
    for (const v of product.variants) {
      if (v.inventoryItemId) values[v.inventoryItemId] = v.unitCost != null ? String(v.unitCost) : "";
    }
    setEditing((e) => ({ ...e, [product.id]: values }));
  };

  const saveEdit = async (product) => {
    const values = editing[product.id];
    const updates = Object.entries(values)
      .filter(([, val]) => val !== "" && !isNaN(parseFloat(val)))
      .map(([inventoryItemId, val]) => ({ inventoryItemId, cost: parseFloat(val) }));

    if (updates.length === 0) {
      setEditing((e) => {
        const n = { ...e };
        delete n[product.id];
        return n;
      });
      return;
    }

    setSaving(product.id);
    try {
      const res = await fetch("/api/set-cogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      }).then((r) => r.json());

      if (!res.success && res.errors?.length) {
        alert("Some values could not be saved:\n" + res.errors.map((e) => e.message).join("\n"));
      }
      setEditing((e) => {
        const n = { ...e };
        delete n[product.id];
        return n;
      });
      await loadData();
    } catch (err) {
      alert("Saving failed: " + err.message);
    } finally {
      setSaving(null);
    }
  };

  if (loading)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#8a92a3" }}>Loading…</span>
      </div>
    );

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 14px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>Product Economics</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Unit costs are saved directly to Shopify — the dashboard uses them automatically
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: "10px 18px",
            background: "#0f172a",
            color: "#ffffff",
            border: "none",
            borderRadius: "12px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          + Add products
        </button>
      </div>

      {error && (
        <div style={{ ...ui.card, padding: "16px 20px", marginBottom: "16px", color: "#dc2626" }}>Error: {error}</div>
      )}

      {isAdmin && unmatchedCampaigns.length > 0 && (
        <div style={{ ...ui.card, padding: "12px 18px", marginBottom: "16px", background: "#fffbeb", borderColor: "#fde68a", fontSize: "12.5px", color: "#92400e", fontWeight: 600 }}>
          ⚠ {unmatchedCampaigns.length} Meta campaign(s) with spend are not linked to any product — open “🔗 Link campaigns” on the right product to fix the tracking.
        </div>
      )}

      {/* Tracked products */}
      {tracked.length === 0 ? (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            No products with unit costs yet. Click <b>+ Add products</b> to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {tracked.map((product) => {
            const isEditing = !!editing[product.id];
            return (
              <div key={product.id} style={{ ...ui.card, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {product.image ? (
                      <img src={product.image} alt="" style={{ width: "42px", height: "42px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2" }} />
                    ) : (
                      <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, color: "#94a3b8" }}>
                        {product.title.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700 }}>{product.title}</div>
                      <div style={{ fontSize: "12px", color: "#8a92a3" }}>sold 30d: {soldMap[product.title] || 0}</div>
                    </div>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setEditing((e) => { const n = { ...e }; delete n[product.id]; return n; })} style={btnGhost}>
                        Cancel
                      </button>
                      <button onClick={() => saveEdit(product)} disabled={saving === product.id} style={btnPrimary}>
                        {saving === product.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      {isAdmin && (
                        <button
                          onClick={() => openLinkPanel(product.title)}
                          title="Link Meta campaigns to this product manually"
                          style={{ ...btnGhost, color: "#4f46e5", background: (campaignAliases[product.title] || []).length ? "#eef2ff" : btnGhost.background }}
                        >
                          🔗 Link campaigns{(campaignAliases[product.title] || []).length ? ` (${(campaignAliases[product.title] || []).length})` : ""}
                        </button>
                      )}
                      <button onClick={() => startEdit(product)} style={btnGhost}>Edit COGS</button>
                    </div>
                  )}
                </div>

                <VariantTable
                  product={product}
                  editing={isEditing ? editing[product.id] : null}
                  onChange={(invId, val) =>
                    setEditing((e) => ({ ...e, [product.id]: { ...e[product.id], [invId]: val } }))
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Add products overlay */}
      {showAdd && (
        <AddProductsOverlay
          onClose={() => {
            setShowAdd(false);
            loadData();
          }}
        />
      )}

      {/* ===== Campagne-koppelpaneel (admin) ===== */}
      {linkFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setLinkFor(null)}>
          <div style={{ ...ui.card, background: "#fff", width: "100%", maxWidth: "560px", maxHeight: "84vh", overflowY: "auto", padding: "22px 24px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700 }}>🔗 Link Meta campaigns — {linkFor}</h3>
            <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "#8a92a3" }}>
              Add a keyword that appears in the campaign name (e.g. “muloria”), or link an unmatched campaign directly. All campaigns containing a keyword count towards this product on the dashboard — now and in the future.
            </p>

            {/* Huidige koppelingen */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              {aliasDraft.length === 0 && <span style={{ fontSize: "12px", color: "#a4adbd", fontStyle: "italic" }}>No manual links yet.</span>}
              {aliasDraft.map((a) => (
                <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eef2ff", color: "#4f46e5", fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px" }}>
                  {a}
                  <a onClick={() => setAliasDraft(aliasDraft.filter((x) => x !== a))} style={{ cursor: "pointer", fontWeight: 700 }}>✕</a>
                </span>
              ))}
            </div>

            {/* Keyword toevoegen */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && aliasInput.trim()) { setAliasDraft([...new Set([...aliasDraft, aliasInput.trim()])]); setAliasInput(""); } }}
                placeholder="Keyword from the campaign name…"
                style={{ flex: 1, padding: "9px 12px", border: "1px solid #d7dce3", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", outline: "none" }}
              />
              <button style={btnGhost} onClick={() => { if (aliasInput.trim()) { setAliasDraft([...new Set([...aliasDraft, aliasInput.trim()])]); setAliasInput(""); } }}>
                + Add
              </button>
            </div>

            {/* Ongekoppelde campagnes (laatste 30 dagen) */}
            {unmatchedCampaigns.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
                  Campaigns with spend, not linked to any product (last 30 days)
                </div>
                {unmatchedCampaigns.map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "7px 10px", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "9px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ fontSize: "12px", color: "#8a92a3", flexShrink: 0 }}>{fmtEur(c.spend)}</span>
                    <button
                      onClick={() => setAliasDraft([...new Set([...aliasDraft, c.name])])}
                      style={{ ...btnPrimary, padding: "4px 10px", fontSize: "11px", flexShrink: 0 }}
                    >
                      + Link
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
              <button onClick={() => setLinkFor(null)} style={btnGhost}>Cancel</button>
              <button onClick={saveCampaignLink} disabled={linkBusy} style={btnPrimary}>
                {linkBusy ? "Saving…" : "Save links"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: "8px 16px",
  background: "#0f172a",
  color: "#ffffff",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: 600,
};
const btnGhost = {
  padding: "8px 16px",
  background: "#ffffff",
  color: "#334155",
  border: "1px solid #e2e6ec",
  borderRadius: "10px",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: 600,
};

const th = { padding: "9px 10px", textAlign: "right", ...ui.label, borderBottom: "1px solid #eceef2" };
const td = { padding: "9px 10px", textAlign: "right", fontSize: "13px", color: "#334155", fontVariantNumeric: "tabular-nums" };

function VariantTable({ product, editing, onChange }) {
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
    <table style={{ width: "100%", minWidth: "640px", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>Variant</th>
          <th style={th}>Price</th>
          <th style={th}>COGS (unit cost)</th>
          <th style={th}>Fees (est.)</th>
          <th style={th}>Margin</th>
          <th style={th}>Break-even</th>
          <th style={th}>10% profit</th>
          <th style={th}>20% profit</th>
        </tr>
      </thead>
      <tbody>
        {product.variants.map((v) => {
          const editVal = editing ? editing[v.inventoryItemId] : null;
          const cogs = editing
            ? editVal !== "" && !isNaN(parseFloat(editVal)) ? parseFloat(editVal) : 0
            : v.unitCost || 0;
          const { fees, margin, be, p10, p20 } = calcRow(v.price, cogs);
          return (
            <tr key={v.id} style={{ borderBottom: "1px solid #f4f5f7" }}>
              <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "#0f172a" }}>{v.title}</td>
              <td style={td}>{fmt(v.price)}</td>
              <td style={td}>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editVal ?? ""}
                    placeholder="0.00"
                    onChange={(e) => onChange(v.inventoryItemId, e.target.value)}
                    style={{
                      width: "90px",
                      padding: "6px 8px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontSize: "13px",
                      textAlign: "right",
                    }}
                  />
                ) : v.unitCost != null ? (
                  fmt(v.unitCost)
                ) : (
                  <span style={{ color: "#cbd5e1" }}>—</span>
                )}
              </td>
              <td style={td}>{fmt(fees)}</td>
              <td style={{ ...td, fontWeight: 700, color: margin >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(margin)}</td>
              <td style={{ ...td, color: "#3b82f6", fontWeight: 600 }}>{be ? be.toFixed(2) : "—"}</td>
              <td style={{ ...td, color: "#3b82f6" }}>{p10 ? p10.toFixed(2) : "—"}</td>
              <td style={{ ...td, color: "#3b82f6" }}>{p20 ? p20.toFixed(2) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

function AddProductsOverlay({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // product
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products-search?q=${encodeURIComponent(query)}`).then((r) => r.json());
        if (res.success) setResults(res.products);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const selectProduct = (p) => {
    setSelected(p);
    const v = {};
    for (const variant of p.variants) {
      if (variant.inventoryItemId) v[variant.inventoryItemId] = variant.unitCost != null ? String(variant.unitCost) : "";
    }
    setValues(v);
  };

  const save = async () => {
    const updates = Object.entries(values)
      .filter(([, val]) => val !== "" && !isNaN(parseFloat(val)))
      .map(([inventoryItemId, val]) => ({ inventoryItemId, cost: parseFloat(val) }));
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/set-cogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      }).then((r) => r.json());
      if (!res.success && res.errors?.length) {
        alert("Error while saving:\n" + res.errors.map((e) => e.message).join("\n"));
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "8vh",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          width: "min(680px, 92vw)",
          maxHeight: "78vh",
          overflow: "auto",
          padding: "24px",
          boxShadow: "0 24px 60px rgba(15,23,42,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>
            {selected ? selected.title : "Add products"}
          </h2>
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕</button>
        </div>

        {!selected ? (
          <>
            <input
              autoFocus
              type="text"
              placeholder="Search your Shopify products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                border: "1px solid #e2e6ec",
                borderRadius: "12px",
                fontSize: "14px",
                marginBottom: "14px",
                outline: "none",
              }}
            />
            {searching && <p style={{ color: "#8a92a3", fontSize: "13px" }}>Searching…</p>}
            <div style={{ display: "grid", gap: "6px" }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 12px",
                    background: "#ffffff",
                    border: "1px solid #eef0f3",
                    borderRadius: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  {p.image ? (
                    <img src={p.image} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f1f5f9" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.title}</div>
                    <div style={{ fontSize: "12px", color: "#8a92a3" }}>
                      {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                      {p.variants.some((v) => v.unitCost != null) && " · COGS partially set"}
                    </div>
                  </div>
                  <span style={{ color: "#3b82f6", fontSize: "13px", fontWeight: 600 }}>Select →</span>
                </button>
              ))}
              {!searching && results.length === 0 && (
                <p style={{ color: "#8a92a3", fontSize: "13px", textAlign: "center", padding: "16px" }}>No products found</p>
              )}
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#64748b" }}>
              Enter the unit cost (purchase price) per variant. This is saved directly to Shopify.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "18px" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Variant</th>
                  <th style={th}>Price</th>
                  <th style={th}>Unit cost (COGS)</th>
                </tr>
              </thead>
              <tbody>
                {selected.variants.map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid #f4f5f7" }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{v.title}</td>
                    <td style={td}>{fmt(v.price)}</td>
                    <td style={td}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={values[v.inventoryItemId] ?? ""}
                        placeholder="0.00"
                        onChange={(e) => setValues((s) => ({ ...s, [v.inventoryItemId]: e.target.value }))}
                        style={{
                          width: "100px",
                          padding: "8px 10px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontSize: "13px",
                          textAlign: "right",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => setSelected(null)} style={btnGhost}>← Back</button>
              <button onClick={save} disabled={saving} style={btnPrimary}>
                {saving ? "Saving…" : "Save to Shopify"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
