// pages/funnel-assets.js
// Assets — eigen menu-item. Dynamisch beheerd via /api/assets:
// - Iedereen ziet alleen de assets waar hij/zij toegang toe heeft
//   (access "all" = heel het team, "restricted" = aangeduide personen).
// - Admin: assets toevoegen/bewerken/verwijderen + per asset personen aanduiden.

import { useState, useEffect } from "react";

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
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  btn: { padding: "8px 14px", borderRadius: "9px", border: "1px solid #d7dce3", background: "#fff", fontSize: "12px", fontWeight: 700, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  btnDark: { padding: "9px 16px", borderRadius: "9px", border: "none", background: "#0f172a", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  input: { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #d7dce3", borderRadius: "9px", fontSize: "12.5px", fontFamily: "inherit", outline: "none" },
};

const CATEGORY_ICONS = { Documents: "📄", Tools: "🛠️", "Marketing Creatives": "🎨" };
const EMPTY_FORM = { id: "", category: "Documents", icon: "📄", title: "", description: "", href: "", tag: "", access: "all", allowedEmails: [] };

export default function FunnelAssets() {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null); // { assets, categories, isAdmin, team }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); // null = geen formulier, anders asset-form
  const [accessFor, setAccessFor] = useState(null); // asset-id waarvan het toegangspaneel open staat

  const load = async () => {
    try {
      const r = await fetch("/api/assets").then((x) => x.json());
      if (r.success) setData(r);
      else setError(r.error || "Could not load assets");
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const post = async (body) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
      if (!r.success) throw new Error(r.error || "Something went wrong");
      setData((d) => ({ ...d, assets: r.assets }));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const saveAccess = (asset, access, allowedEmails) => post({ action: "save", asset: { ...asset, access, allowedEmails } });

  if (!data) {
    return (
      <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
        <p style={{ color: "#8a92a3", fontSize: "13px" }}>{error || "Loading assets…"}</p>
      </div>
    );
  }

  const { assets, categories, isAdmin, team } = data;

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>📁 Assets</h1>
          <p style={{ margin: "4px 0 24px 0", fontSize: "13px", color: "#8a92a3" }}>
            SOPs, prompts, tools and creative source files. You only see the assets you have access to.
          </p>
        </div>
        {isAdmin && (
          <button style={ui.btnDark} onClick={() => setForm({ ...EMPTY_FORM })}>+ Add asset</button>
        )}
      </div>

      {error && (
        <div style={{ ...ui.card, padding: "10px 14px", marginBottom: "14px", background: "#fef2f2", borderColor: "#fecaca", fontSize: "12.5px", color: "#b91c1c" }}>
          {error} <a onClick={() => setError("")} style={{ marginLeft: "8px", cursor: "pointer", fontWeight: 700 }}>✕</a>
        </div>
      )}

      {/* ---------- Asset toevoegen/bewerken (admin) ---------- */}
      {isAdmin && form && (
        <div style={{ ...ui.card, padding: "18px 20px", marginBottom: "22px", maxWidth: "640px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>{form.id ? "Edit asset" : "New asset"}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <input style={ui.input} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input style={ui.input} placeholder="Tag (e.g. SOP, Prompts, Tool)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            <select style={ui.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, icon: CATEGORY_ICONS[e.target.value] || form.icon })}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input style={ui.input} placeholder="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          </div>
          <input style={{ ...ui.input, marginBottom: "10px" }} placeholder="Link — https://… (or /internal-tool)" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} />
          <textarea style={{ ...ui.input, marginBottom: "12px", resize: "vertical" }} rows={2} placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button style={{ ...ui.btnDark, marginRight: "8px" }} disabled={busy} onClick={async () => { await post({ action: "save", asset: form }); setForm(null); }}>
            {busy ? "Saving…" : "Save asset"}
          </button>
          <button style={ui.btn} onClick={() => setForm(null)}>Cancel</button>
        </div>
      )}

      {categories.map((cat) => {
        const items = assets.filter((a) => a.category === cat);
        if (items.length === 0 && !isAdmin) return null;
        return (
          <div key={cat} style={{ marginBottom: "28px" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.7px" }}>
              {CATEGORY_ICONS[cat] || "📁"} {cat}
            </h2>
            {items.length === 0 ? (
              <p style={{ margin: 0, fontSize: "12.5px", color: "#a4adbd", fontStyle: "italic" }}>No assets here yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px", maxWidth: "1100px" }}>
                {items.map((a) => (
                  <div key={a.id} style={{ ...ui.card, padding: "20px 22px", display: "flex", flexDirection: "column" }}>
                    <a
                      href={a.href}
                      target={a.href.startsWith("/") ? "_self" : "_blank"}
                      rel="noreferrer"
                      style={{ textDecoration: "none", color: "inherit", flex: 1 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                          {a.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#0f172a" }}>{a.title}</div>
                          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#4f46e5", background: "#eef2ff", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {a.tag || "Asset"}
                          </span>
                          {isAdmin && a.access === "restricted" && (
                            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#b45309", background: "#fffbeb", padding: "2px 8px", borderRadius: "999px", marginLeft: "6px" }}>
                              🔒 {(a.allowedEmails || []).length} people
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b", lineHeight: 1.55 }}>{a.description}</p>
                      <div style={{ marginTop: "10px", fontSize: "12.5px", fontWeight: 700, color: "#2563eb" }}>
                        {a.href.startsWith("/") ? "Open tool →" : "Open ↗"}
                      </div>
                    </a>

                    {/* ---------- Admin: toegang + beheer ---------- */}
                    {isAdmin && (
                      <div style={{ borderTop: "1px solid #f1f5f9", marginTop: "12px", paddingTop: "10px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px" }} onClick={() => setAccessFor(accessFor === a.id ? null : a.id)}>
                            {a.access === "restricted" ? "🔒 Access" : "🌐 Everyone"}
                          </button>
                          <button style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px" }} onClick={() => { setForm({ ...EMPTY_FORM, ...a }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>✎ Edit</button>
                          <button
                            style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px", color: "#dc2626" }}
                            onClick={() => { if (confirm(`Delete "${a.title}"?`)) post({ action: "delete", assetId: a.id }); }}
                          >
                            🗑
                          </button>
                        </div>
                        {accessFor === a.id && (
                          <div style={{ marginTop: "10px", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "10px 12px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, marginBottom: "8px", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={a.access !== "restricted"}
                                onChange={(e) => saveAccess(a, e.target.checked ? "all" : "restricted", a.allowedEmails || [])}
                              />
                              Everyone on the team
                            </label>
                            {a.access === "restricted" && (
                              <div style={{ maxHeight: "170px", overflowY: "auto" }}>
                                {(team || []).map((u) => {
                                  const list = (a.allowedEmails || []).map((e) => e.toLowerCase());
                                  const checked = list.includes((u.email || "").toLowerCase());
                                  return (
                                    <label key={u.email} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", padding: "3px 0", cursor: "pointer" }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const next = e.target.checked
                                            ? [...(a.allowedEmails || []), u.email]
                                            : (a.allowedEmails || []).filter((x) => x.toLowerCase() !== (u.email || "").toLowerCase());
                                          saveAccess(a, "restricted", next);
                                        }}
                                      />
                                      {u.name} <span style={{ color: "#a4adbd", fontSize: "11px" }}>{(u.roles || []).join(", ")}</span>
                                    </label>
                                  );
                                })}
                                {(team || []).length === 0 && <p style={{ margin: 0, fontSize: "11.5px", color: "#a4adbd" }}>No active team members found.</p>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p style={{ margin: "24px 0 0 0", fontSize: "12px", color: "#a4adbd" }}>
        {isAdmin ? "🔒 Access shows who can see a restricted asset — team members never see assets they don't have access to." : "Need an asset added here? Ask Niels."}
      </p>
    </div>
  );
}
