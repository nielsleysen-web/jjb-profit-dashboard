// pages/graphic-designer.js
// Marketing Creatives — Graphic Designer worktable.
// Kanban pipeline, ClickUp-style task view, conditional Visual Briefing,
// activity log & chat with @mentions.

import { useState, useEffect, useRef } from "react";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const ui = {
  page: {
    padding: "24px 28px",
    background: "#f7f8fa",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    borderRadius: "14px",
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
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    border: "1px solid #e2e6ec",
    borderRadius: "9px",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
    background: "#ffffff",
  },
};

const btnPrimary = {
  padding: "9px 16px",
  background: "#0f172a",
  color: "#ffffff",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: 600,
};
const btnGhost = {
  padding: "9px 16px",
  background: "#ffffff",
  color: "#334155",
  border: "1px solid #e2e6ec",
  borderRadius: "10px",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: 600,
};

const STATUSES = ["Task Start", "Ready To Work", "QA Check", "Ready to launch", "Launched"];
const BOARD_STATUSES = STATUSES.slice(0, 4); // Launched verhuist naar het Launched-tabblad
const MARKETS = ["Italy", "France", "Israel"];
const CODES = ["IT", "FR", "IL"];
const MARKET_TO_CODE = { Italy: "IT", France: "FR", Israel: "IL" };
const GENDERS = ["Male", "Female"];
const AGE_RANGES = ["18-25", "25-40", "40-55", "55+"];
const TYPES = ["Net New", "Iteration"];
const BATCH_TYPES = ["First Creative Batch", "Net New", "Iteration"];
const ITERATION_TYPES = ["Copy", "Visual", "Format"];

const SUBTITLE_STYLES = ["White Text, Shadowed Background", "Documentary Text", "TikTok Style", "TikTok Explanational"];

const STATUS_META = {
  "Task Start": { color: "#c2410c", bg: "#ffedd5" },
  "Ready To Work": { color: "#1d4ed8", bg: "#dbeafe" },
  "QA Check": { color: "#b45309", bg: "#fef3c7" },
  "Revisions": { color: "#be123c", bg: "#ffe4e6" },
  "Ready to launch": { color: "#0f766e", bg: "#ccfbf1" },
  "Launched": { color: "#166534", bg: "#dcfce7" },
};

const PERSON_COLORS = ["#3b82f6", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be185d", "#65a30d"];
const personColor = (email) => {
  let h = 0;
  for (const c of email || "") h = (h * 31 + c.charCodeAt(0)) % 997;
  return PERSON_COLORS[h % PERSON_COLORS.length];
};

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

const fmtDeadline = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const fmtDeadlineDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const isoToLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const localInputToIso = (val) => (val ? new Date(val).toISOString() : "");
const isOverdue = (iso, status) => iso && status !== "Launched" && new Date(iso) < new Date();

// Deadline-kleur: zwart → donkerrood → donkerder rood naarmate de deadline nadert
const deadlineColor = (iso, status) => {
  if (!iso || status === "Launched") return "#64748b";
  const days = (new Date(iso) - new Date()) / 86400000;
  if (days <= 2) return "#7f1d1d";
  if (days <= 5) return "#b91c1c";
  return "#334155";
};

// Naming: PRODUCT | CREATIVE STRATEGIST | ASSIGNEE | ANGLE | NET NEW/ITERATION | DEADLINE
const namingConvention = (t) =>
  [t.product?.title, firstName(t.strategistName), firstName(t.assigneeName), t.angle, t.batchType, fmtDeadlineDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

const NAMING_FROM_STATUS = "Ready To Work";
const taskTitle = (t) => {
  const hasNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const naming = namingConvention(t);
  return hasNaming && naming ? naming : t.product?.title || "New design task";
};

export default function GraphicDesigner() {
  const [tasks, setTasks] = useState([]);
  const [strategists, setStrategists] = useState([]);
  const [editors, setEditors] = useState([]);
  const [team, setTeam] = useState([]);
  const [me, setMe] = useState(null);
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [menuId, setMenuId] = useState(null);
  // Filters
  const [fAssignee, setFAssignee] = useState("");
  const [fStrategist, setFStrategist] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fProduct, setFProduct] = useState("");
  const isMobile = useIsMobile();

  const load = () =>
    fetch("/api/design-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
        setStrategists(res.creativeStrategists);
        setEditors(res.graphicDesigners);
        setTeam(res.team);
        setMe(res.me);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const iv = setInterval(load, 45000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (payload) => {
    const res = await fetch("/api/design-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());
    if (!res.success) {
      alert(res.error || "Something went wrong");
      return null;
    }
    setTasks(res.tasks);
    return res;
  };

  const createTask = async (status) => {
    if (creating) return;
    setCreating(true);
    const res = await post({ action: "create", task: { status } });
    setCreating(false);
    if (res?.createdId) setOpenTaskId(res.createdId);
  };

  // Snel dupliceren voor kleine iteraties (⋯-menu op de kaart)
  const duplicateTask = async (taskId) => {
    setMenuId(null);
    const res = await post({ action: "duplicate", taskId });
    if (res?.createdId) setOpenTaskId(res.createdId);
  };

  const onDropTask = async (status) => {
    setDragOver(null);
    if (!dragId) return;
    const task = tasks.find((x) => x.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status } : x)));
    await post({ action: "status", taskId: task.id, status });
  };

  if (loading)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#8a92a3" }}>Loading…</span>
      </div>
    );
  if (error)
    return (
      <div style={ui.page}>
        <div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div>
      </div>
    );

  const openTask = tasks.find((t) => t.id === openTaskId) || null;

  // Filters toepassen
  const hasFilters = fAssignee || fStrategist || fDeadline || fProduct;
  const filtered = tasks.filter(
    (t) =>
      (!fAssignee || t.assigneeEmail === fAssignee) &&
      (!fStrategist || t.strategistEmail === fStrategist) &&
      (!fDeadline || (t.deadline && new Date(t.deadline) <= new Date(`${fDeadline}T23:59:59`))) &&
      (!fProduct || t.product?.title === fProduct)
  );
  const productOptions = [...new Set(tasks.map((t) => t.product?.title).filter(Boolean))].sort();
  const filterStyle = { ...ui.input, width: "auto", padding: "7px 10px", fontSize: "12px" };

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 12px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>🎨 Graphic Designer</h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Marketing Creatives — {filtered.filter((t) => t.status !== "Launched").length} active tasks{hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        {me?.canEdit && (
          <button onClick={() => createTask("Task Start")} disabled={creating} style={btnPrimary}>
            {creating ? "Creating…" : "+ New task"}
          </button>
        )}
      </div>

      {/* Filterbalk */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} style={filterStyle}>
          <option value="">All designers</option>
          {editors.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
        <select value={fStrategist} onChange={(e) => setFStrategist(e.target.value)} style={filterStyle}>
          <option value="">All strategists</option>
          {strategists.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
        <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} style={filterStyle}>
          <option value="">All products</option>
          {productOptions.map((p) => <option key={p}>{p}</option>)}
        </select>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#8a92a3" }}>Due by</span>
          <input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} style={filterStyle} />
        </span>
        {hasFilters && (
          <button
            onClick={() => { setFAssignee(""); setFStrategist(""); setFDeadline(""); setFProduct(""); }}
            style={{ ...btnGhost, padding: "7px 12px", fontSize: "11.5px", color: "#dc2626", borderColor: "#fecaca" }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Klik buiten het ⋯-menu = sluiten */}
      {menuId && <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}

      {/* Kanban */}
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", alignItems: "flex-start", paddingBottom: "16px", WebkitOverflowScrolling: "touch" }}>
        {BOARD_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          const columnTasks = filtered
            .filter((t) => t.status === status)
            .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== status) setDragOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDropTask(status);
              }}
              style={{
                minWidth: isMobile ? "250px" : "280px",
                width: isMobile ? "250px" : "280px",
                flexShrink: 0,
                borderRadius: "14px",
                padding: "4px",
                background: dragOver === status && dragId ? meta.bg : "transparent",
                outline: dragOver === status && dragId ? `2px dashed ${meta.color}` : "2px dashed transparent",
                transition: "background 0.15s, outline 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "0 2px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.bg, padding: "4px 10px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {status}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b" }}>{columnTasks.length}</span>
              </div>

              <div style={{ display: "grid", gap: "8px", minHeight: "40px" }}>
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable={!!me?.canStatus}
                    onDragStart={(e) => {
                      setDragId(t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOver(null);
                    }}
                    onClick={() => setOpenTaskId(t.id)}
                    style={{ ...ui.card, padding: "12px 14px", cursor: me?.canStatus ? "grab" : "pointer", opacity: dragId === t.id ? 0.4 : 1, position: "relative" }}
                  >
                    {me?.canEdit && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId(menuId === t.id ? null : t.id);
                          }}
                          style={{ position: "absolute", top: "6px", right: "6px", background: "none", border: "none", color: "#94a3b8", fontSize: "16px", cursor: "pointer", lineHeight: 1, padding: "2px 5px" }}
                        >
                          ⋯
                        </button>
                        {menuId === t.id && (
                          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "26px", right: "6px", background: "#fff", border: "1px solid #eceef2", borderRadius: "10px", boxShadow: "0 10px 26px rgba(15,23,42,0.16)", zIndex: 50, overflow: "hidden" }}>
                            <button onClick={() => duplicateTask(t.id)} style={{ display: "block", width: "100%", padding: "9px 16px", background: "none", border: "none", fontSize: "12px", fontWeight: 600, color: "#334155", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }}>
                              ⧉ Duplicate task
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", paddingRight: "18px" }}>
                      {t.product?.image && (
                        <img src={t.product.image} alt="" style={{ width: "34px", height: "34px", borderRadius: "8px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word" }}>{taskTitle(t)}</div>
                        {t.batchType && (
                          <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "2px" }}>{t.batchType}{t.iterationType ? ` · ${t.iterationType}` : ""}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                      {t.assigneeName && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#475569" }}>
                          <span style={{ width: "18px", height: "18px", borderRadius: "999px", background: personColor(t.assigneeEmail), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9.5px", fontWeight: 700 }}>
                            {t.assigneeName.charAt(0).toUpperCase()}
                          </span>
                          {firstName(t.assigneeName)}
                        </span>
                      )}
                      {t.deadline && (
                        <span style={{ fontSize: "10.5px", fontWeight: 700, color: deadlineColor(t.deadline, t.status), marginLeft: "auto" }}>
                          {fmtDeadline(t.deadline)}{isOverdue(t.deadline, t.status) ? " ⚠" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {me?.canEdit && (
                  <button
                    onClick={() => createTask(status)}
                    disabled={creating}
                    style={{ padding: "9px", background: "transparent", border: "1px dashed #d7dce3", borderRadius: "10px", color: "#8a92a3", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    + Add Task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openTask && (
        <TaskModal
          t={openTask}
          me={me}
          strategists={strategists}
          editors={editors}
          team={team}
          avatars={avatars}
          voices={voices}
          post={post}
          onClose={() => setOpenTaskId(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

/* ================= herbruikbare componenten ================= */

function Section({ title, children }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "14px", padding: "14px 18px", marginBottom: "14px" }}>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "6px" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, last }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: "12px", alignItems: "center", padding: "9px 0", borderBottom: last ? "none" : "1px solid #f4f5f7" }}>
      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#64748b" }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function TextField({ value, onSave, disabled, placeholder, type = "text" }) {
  const [val, setVal] = useState(value || "");
  useEffect(() => setVal(value || ""), [value]);
  if (disabled) {
    return value ? (
      type === "url" ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: "#3b82f6", fontWeight: 600 }}>Open ↗</a>
      ) : (
        <span style={{ fontSize: "13px" }}>{value}</span>
      )
    ) : (
      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
    );
  }
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <input
        style={{ ...ui.input, padding: "7px 10px" }}
        value={val}
        placeholder={placeholder || "—"}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => val !== (value || "") && onSave(val)}
        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
      />
      {type === "url" && value && (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "#3b82f6", fontWeight: 700, flexShrink: 0 }}>↗</a>
      )}
    </div>
  );
}

function SelectField({ value, options, onSave, disabled, placeholder }) {
  if (disabled) return <span style={{ fontSize: "13px" }}>{value || "—"}</span>;
  return (
    <select value={value || ""} onChange={(e) => onSave(e.target.value)} style={{ ...ui.input, padding: "7px 10px" }}>
      <option value="">{placeholder || "—"}</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function TextAreaField({ value, onSave, disabled, placeholder }) {
  const [val, setVal] = useState(value || "");
  useEffect(() => setVal(value || ""), [value]);
  if (disabled) {
    return value ? (
      <span style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{value}</span>
    ) : (
      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
    );
  }
  return (
    <textarea
      style={{ ...ui.input, minHeight: "72px", resize: "vertical" }}
      value={val}
      placeholder={placeholder || "—"}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => val !== (value || "") && onSave(val)}
    />
  );
}

/* ---------- HeyGen avatar dropdown met foto's ---------- */
function AvatarDropdown({ value, valueName, avatars, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = avatars.find((a) => a.id === value) || null;

  if (disabled) {
    return valueName ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
        {selected?.preview && <img src={selected.preview} alt="" style={{ width: "24px", height: "24px", borderRadius: "999px", objectFit: "cover" }} />}
        {valueName}
      </span>
    ) : (
      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
    );
  }

  const shown = avatars.filter((a) => !filter.trim() || a.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        style={{ ...ui.input, padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {selected?.preview && (
            <img src={selected.preview} alt="" style={{ width: "26px", height: "26px", borderRadius: "999px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 600, color: selected ? "#0f172a" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12.5px" }}>
            {selected ? selected.name : avatars.length ? "Select avatar…" : "No avatars synced — check HEYGEN_API_KEY"}
          </span>
        </span>
        <span style={{ color: "#94a3b8", fontSize: "10px", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "42px", left: 0, right: 0, background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: "8px", zIndex: 50 }}>
            {avatars.length > 6 && (
              <input
                style={{ ...ui.input, padding: "6px 10px", fontSize: "12px", marginBottom: "6px" }}
                placeholder="Search avatars…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            )}
            <div style={{ maxHeight: "280px", overflowY: "auto" }}>
              {shown.length === 0 && <p style={{ fontSize: "12px", color: "#94a3b8", margin: "6px", textAlign: "center" }}>No avatars found</p>}
              {shown.map((a) => (
                <div
                  key={a.id}
                  onClick={() => {
                    onSelect(a);
                    setOpen(false);
                    setFilter("");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", borderRadius: "9px", cursor: "pointer", background: value === a.id ? "#eff6ff" : "transparent", marginBottom: "2px" }}
                >
                  {a.preview ? (
                    <img src={a.preview} alt="" style={{ width: "34px", height: "34px", borderRadius: "999px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "34px", height: "34px", borderRadius: "999px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>🧑</div>
                  )}
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: value === a.id ? "#1d4ed8" : "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- subtitle-stijl dropdown met gedetailleerde CSS-previews ---------- */

// Nagemaakte previews van de echte subtitle-stijlen, op een mini videoframe.
function SubtitlePreview({ style, small }) {
  const frame = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(140deg, #46536a 0%, #232c3d 55%, #171e2b 100%)",
    borderRadius: small ? "5px" : "9px",
    width: small ? "92px" : "168px",
    height: small ? "28px" : "72px",
    flexShrink: 0,
    overflow: "hidden",
    textAlign: "center",
  };

  // 1. White Text, Shadowed Background — witte bold tekst op donkere schaduwband
  if (style === "White Text, Shadowed Background") {
    return (
      <span style={frame}>
        <span
          style={{
            background: "rgba(0,0,0,0.52)",
            borderRadius: "4px",
            padding: small ? "1px 7px" : "4px 10px",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: small ? "8.5px" : "9.5px",
            lineHeight: 1.4,
            fontFamily: "Inter, sans-serif",
          }}
        >
          {small ? "werden zur Qual." : <>Laufen, Stehen oder<br />Schlafen werden zur Qual.</>}
        </span>
      </span>
    );
  }

  // 2. Documentary Text — kleine cleane witte tekst met zachte schaduw, geen vlak
  if (style === "Documentary Text") {
    return (
      <span style={frame}>
        <span
          style={{
            color: "#ffffff",
            fontWeight: 500,
            fontSize: small ? "9.5px" : "11.5px",
            textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)",
            fontFamily: "Inter, sans-serif",
            letterSpacing: "0.2px",
          }}
        >
          he was 27
        </span>
      </span>
    );
  }

  // 3. TikTok Style — donkere tekst in een witte afgeronde box
  if (style === "TikTok Style") {
    return (
      <span style={frame}>
        <span
          style={{
            background: "#ffffff",
            color: "#16181d",
            fontWeight: 700,
            fontSize: small ? "8.5px" : "10.5px",
            padding: small ? "2px 8px" : "4px 11px",
            borderRadius: small ? "5px" : "7px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          would happen
        </span>
      </span>
    );
  }

  // 4. TikTok Explanational — vette caps met dikke zwarte outline + rood accentwoord
  const outline =
    "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000";
  const capsLine = (text, red, size) => (
    <span
      style={{
        display: "block",
        color: red ? "#ef2d2d" : "#ffffff",
        fontWeight: 900,
        fontSize: size,
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        lineHeight: 1.2,
        textShadow: outline,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {text}
    </span>
  );
  return (
    <span style={{ ...frame, flexDirection: "column" }}>
      {small ? (
        capsLine("INFLAMMATORY", true, "8.5px")
      ) : (
        <>
          {capsLine("SLUDGE AND", false, "9px")}
          {capsLine("INFLAMMATORY", true, "9px")}
          {capsLine("WASTE", false, "9px")}
        </>
      )}
    </span>
  );
}

function SubtitleDropdown({ value, onSave, disabled }) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return value ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
        <SubtitlePreview style={value} small /> {value}
      </span>
    ) : (
      <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        style={{ ...ui.input, padding: "5px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
          {value && <SubtitlePreview style={value} small />}
          <span style={{ fontWeight: 600, color: value ? "#0f172a" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12.5px" }}>
            {value || "Select subtitle style…"}
          </span>
        </span>
        <span style={{ color: "#94a3b8", fontSize: "10px", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "42px", left: 0, right: 0, background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: "6px", zIndex: 50 }}>
            {SUBTITLE_STYLES.map((s) => (
              <div
                key={s}
                onClick={() => {
                  onSave(s);
                  setOpen(false);
                }}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "7px 9px", borderRadius: "9px", cursor: "pointer", background: value === s ? "#eff6ff" : "transparent", marginBottom: "3px" }}
              >
                <SubtitlePreview style={s} />
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: value === s ? "#1d4ed8" : "#334155" }}>{s}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ================= grote taakweergave ================= */

function TaskModal({ t, me, strategists, editors, team, avatars, voices, post, onClose, isMobile }) {
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const chatEndRef = useRef(null);
  const debounceRef = useRef(null);
  const naming = namingConvention(t);
  const showNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const canEdit = me?.canEdit;
  const canOutput = me?.canOutput;

  // Activity: alleen tonen wat er gebeurde vanaf "Ready To Work"
  // (zolang de taak nog in opbouw is, blijft alles zichtbaar)
  const rtwEntry = (t.activity || []).find((a) => a.type === "log" && a.text.includes('changed status to "Ready To Work"'));
  const visibleActivity = rtwEntry ? (t.activity || []).filter((a) => a.at >= rtwEntry.at) : t.activity || [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [t.activity?.length]);

  // Shopify product search (basic: naam + foto)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products-search?q=${encodeURIComponent(query)}`).then((r) => r.json());
        if (res.success) setResults(res.products.slice(0, 8));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const save = (field, value) => post({ action: "update", taskId: t.id, task: { [field]: value } });

  const copyNaming = () => {
    navigator.clipboard?.writeText(naming).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const ok = await post({ action: "chat", taskId: t.id, message: chatInput });
    if (ok) setChatInput("");
  };

  const selectStyle = { ...ui.input, padding: "7px 10px" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "8px" : "3vh 3vw", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#ffffff", borderRadius: "18px", width: "min(1280px, 100%)", height: isMobile ? "96vh" : "92vh", boxShadow: "0 24px 60px rgba(15,23,42,0.35)", display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== Links: velden ===== */}
        <div style={{ flex: 1.35, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: isMobile ? "16px 18px 0 18px" : "24px 30px 0 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: STATUS_META[t.status]?.color, background: STATUS_META[t.status]?.bg, padding: "4px 12px", borderRadius: "999px", textTransform: "uppercase" }}>
                {t.status}
              </span>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                {canEdit && (
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this task?")) return;
                      const ok = await post({ action: "delete", taskId: t.id });
                      if (ok) onClose();
                    }}
                    style={{ ...btnGhost, padding: "6px 10px", color: "#dc2626", borderColor: "#fecaca" }}
                  >
                    Delete
                  </button>
                )}
                {isMobile && <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕</button>}
              </div>
            </div>
            <h2 style={{ margin: "10px 0 4px 0", fontSize: isMobile ? "18px" : "22px", fontWeight: 700, letterSpacing: "-0.5px", wordBreak: "break-word" }}>
              {taskTitle(t)}
            </h2>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "6px 18px 18px 18px" : "8px 30px 26px 30px", background: "#f7f8fa" }}>
            {/* Topblok */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px", margin: "14px 0 14px 0" }}>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Status</div>
                <select value={t.status} disabled={!me?.canStatus} onChange={(e) => post({ action: "status", taskId: t.id, status: e.target.value })} style={{ ...selectStyle, marginTop: "4px", fontWeight: 700 }}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Deadline</div>
                {canEdit ? (
                  <input type="datetime-local" style={{ ...selectStyle, marginTop: "4px" }} value={isoToLocalInput(t.deadline)} onChange={(e) => save("deadline", localInputToIso(e.target.value))} />
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px", color: deadlineColor(t.deadline, t.status) }}>
                    {t.deadline ? fmtDeadline(t.deadline) : "—"}{isOverdue(t.deadline, t.status) ? " ⚠" : ""}
                  </div>
                )}
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Creative Strategist</div>
                {canEdit ? (
                  <select
                    value={t.strategistEmail || ""}
                    onChange={(e) => {
                      const u = strategists.find((x) => x.email === e.target.value);
                      post({ action: "update", taskId: t.id, task: { strategistEmail: e.target.value, strategistName: u?.name || "" } });
                    }}
                    style={{ ...selectStyle, marginTop: "4px" }}
                  >
                    <option value="">— Select strategist —</option>
                    {strategists.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px" }}>{t.strategistName || "—"}</div>
                )}
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Assignee (Graphic Designer)</div>
                {canEdit ? (
                  <select
                    value={t.assigneeEmail || ""}
                    onChange={(e) => {
                      const u = editors.find((x) => x.email === e.target.value);
                      post({ action: "update", taskId: t.id, task: { assigneeEmail: e.target.value, assigneeName: u?.name || "" } });
                    }}
                    style={{ ...selectStyle, marginTop: "4px" }}
                  >
                    <option value="">— Select graphic designer —</option>
                    {editors.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px", color: me?.email === t.assigneeEmail ? "#3b82f6" : "#0f172a" }}>
                    {t.assigneeName || "—"}{me?.email === t.assigneeEmail ? " (you)" : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Product */}
            <Section title="📦 Product">
              {t.product ? (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", borderRadius: "10px", padding: "8px 12px" }}>
                  {t.product.image && <img src={t.product.image} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} />}
                  <span style={{ fontSize: "13.5px", fontWeight: 700, flex: 1 }}>{t.product.title}</span>
                  {canEdit && (
                    <a onClick={() => save("product", null)} style={{ color: "#94a3b8", cursor: "pointer", fontSize: "12px" }}>change</a>
                  )}
                </div>
              ) : canEdit ? (
                <>
                  <input style={ui.input} placeholder="Search your Shopify products…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  {searching && <p style={{ fontSize: "12px", color: "#8a92a3", margin: "6px 0 0 0" }}>Searching…</p>}
                  {results.length > 0 && (
                    <div style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
                      {results.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            save("product", { title: p.title, image: p.image });
                            setQuery("");
                            setResults([]);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: "#ffffff", border: "1px solid #eef0f3", borderRadius: "10px", cursor: "pointer", textAlign: "left", fontSize: "13px" }}
                        >
                          {p.image ? <img src={p.image} alt="" style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "cover" }} /> : <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f1f5f9" }} />}
                          <span style={{ fontWeight: 600 }}>{p.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: "13px", color: "#cbd5e1" }}>—</span>
              )}
            </Section>

            {/* Creative */}
            <Section title="🎨 Creative">
              <Field label="Angle">
                <TextField value={t.angle} disabled={!canEdit} onSave={(v) => save("angle", v)} />
              </Field>
              <Field label="Advertorial Link">
                <TextField value={t.advertorialLink} disabled={!canEdit} onSave={(v) => save("advertorialLink", v)} type="url" placeholder="https://…" />
              </Field>
              <Field label="Batch Type" last={t.batchType !== "Iteration"}>
                <SelectField value={t.batchType} options={BATCH_TYPES} onSave={(v) => save("batchType", v)} disabled={!canEdit} />
              </Field>
              {t.batchType === "Iteration" && (
                <Field label="Iteration Type" last>
                  <SelectField value={t.iterationType} options={ITERATION_TYPES} onSave={(v) => save("iterationType", v)} disabled={!canEdit} />
                </Field>
              )}
              {(t.batchType === "Net New" || t.batchType === "Iteration") && (
                <div style={{ padding: "10px 0 2px 0" }}>
                  <div style={{ ...ui.label, marginBottom: "6px" }}>Visual Briefing</div>
                  <TextAreaField
                    value={t.visualBriefing}
                    disabled={!canEdit}
                    onSave={(v) => save("visualBriefing", v)}
                    placeholder="Guidelines for the graphic designer — visual direction, references, do's & don'ts…"
                  />
                </div>
              )}
              {t.batchType === "First Creative Batch" && (
                <div style={{ padding: "10px 0 2px 0" }}>
                  <div style={{ ...ui.label, marginBottom: "6px" }}>Creative Copy</div>
                  {t.creativeCopy ? (
                    <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px" }}>
                      <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "200px", overflowY: "auto" }}>{t.creativeCopy}</pre>
                      <a
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(t.creativeCopy)}`}
                        download={`${naming || t.product?.title || "creative"} - copy.txt`}
                        style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#3b82f6" }}
                      >
                        ⬇ Download .txt
                      </a>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                      The creative copy from the Product Launching automation will appear here automatically (phase 2).
                    </p>
                  )}
                </div>
              )}
            </Section>

            {/* Market */}
            <Section title="🌍 Market">
              <Field label="Market">
                {canEdit ? (
                  <select
                    value={t.market || ""}
                    onChange={(e) => post({ action: "update", taskId: t.id, task: { market: e.target.value, countryCode: MARKET_TO_CODE[e.target.value] || t.countryCode } })}
                    style={selectStyle}
                  >
                    <option value="">—</option>
                    {MARKETS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.market || "—"}</span>
                )}
              </Field>
              <Field label="Country Code" last>
                <SelectField value={t.countryCode} options={CODES} onSave={(v) => save("countryCode", v)} disabled={!canEdit} />
              </Field>
            </Section>

            {/* Audience */}
            <Section title="🎯 Audience">
              <Field label="Target Gender">
                <SelectField value={t.gender} options={GENDERS} onSave={(v) => save("gender", v)} disabled={!canEdit} />
              </Field>
              <Field label="Target Age Range" last>
                <SelectField value={t.ageRange} options={AGE_RANGES} onSave={(v) => save("ageRange", v)} disabled={!canEdit} />
              </Field>
            </Section>

            {/* Output — ook invulbaar door de video editor */}
            <Section title="📤 Output">
              <Field label="Frame.io Output Link">
                <TextField value={t.frameioLink} disabled={!canEdit && !canOutput} onSave={(v) => save("frameioLink", v)} type="url" placeholder="https://f.io/…" />
              </Field>
              <Field label="Final Output Link" last>
                <TextField value={t.finalOutputLink} disabled={!canEdit && !canOutput} onSave={(v) => save("finalOutputLink", v)} type="url" placeholder="https://…" />
              </Field>
            </Section>

            {/* Creative Name */}
            <Section title="🏷 Creative Name">
              {showNaming && naming ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "10px 12px" }}>
                  <code style={{ fontSize: "12px", color: "#0f172a", fontWeight: 600, flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{naming}</code>
                  <button onClick={copyNaming} style={{ ...btnGhost, padding: "5px 12px", fontSize: "11.5px", flexShrink: 0, background: copied ? "#dcfce7" : "#fff", color: copied ? "#166534" : "#334155" }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                  The creative name is generated automatically once the status reaches "Ready To Work".
                </p>
              )}
              {t.launchedDate && (
                <div style={{ marginTop: "10px", fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                  🚀 Launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </Section>
          </div>

          {/* Save & close onderaan */}
          <div style={{ padding: isMobile ? "10px 18px" : "12px 30px", borderTop: "1px solid #eef0f3", background: "#ffffff", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...btnPrimary, padding: "10px 24px", fontSize: "13px" }}>
              💾 Save & Close
            </button>
          </div>
        </div>

        {/* ===== Rechts: activity + chat ===== */}
        <div style={{ flex: 1, background: "#fafbfc", borderLeft: isMobile ? "none" : "1px solid #eceef2", borderTop: isMobile ? "1px solid #eceef2" : "none", display: "flex", flexDirection: "column", minWidth: 0, minHeight: isMobile ? "280px" : "auto", maxWidth: isMobile ? "none" : "420px" }}>
          <div style={{ padding: "16px 18px 10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eef0f3" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Activity</span>
            {!isMobile && <button onClick={onClose} style={{ ...btnGhost, padding: "5px 11px" }}>✕</button>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
            {visibleActivity.length === 0 && <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>No activity yet.</p>}
            {visibleActivity.map((a) =>
              a.type === "chat" ? (
                <div key={a.id} style={{ padding: "8px 12px", background: a.email === me?.email ? "#eff6ff" : "#ffffff", border: "1px solid #eef0f3", borderRadius: "10px", marginBottom: "6px" }}>
                  <div style={{ fontSize: "11px", marginBottom: "2px" }}>
                    <b style={{ color: personColor(a.email) }}>{a.author}</b>
                    <span style={{ color: "#94a3b8" }}> · {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div style={{ fontSize: "12.5px", whiteSpace: "pre-wrap" }}>{a.text}</div>
                </div>
              ) : (
                <div key={a.id} style={{ display: "flex", gap: "7px", alignItems: "flex-start", padding: "4px 0", fontSize: "11.5px", color: "#8a92a3" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "999px", background: personColor(a.email), marginTop: "4px", flexShrink: 0 }} />
                  <span>
                    <b style={{ color: personColor(a.email) }}>{firstName(a.author)}</b> {a.text}
                    <span style={{ color: "#c3cad4" }}> · {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </div>
              )
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: "10px 18px 16px 18px", borderTop: "1px solid #eef0f3", background: "#fafbfc" }}>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" }}>
              {team
                .filter((u) => u.email !== me?.email)
                .slice(0, 8)
                .map((u) => (
                  <button
                    key={u.email}
                    onClick={() => setChatInput((c) => `${c}${c && !c.endsWith(" ") ? " " : ""}@${firstName(u.name)} `)}
                    style={{ fontSize: "10.5px", fontWeight: 700, color: personColor(u.email), background: "#ffffff", border: "1px solid #eceef2", borderRadius: "999px", padding: "2px 8px", cursor: "pointer" }}
                  >
                    @{firstName(u.name)}
                  </button>
                ))}
            </div>
            <div style={{ display: "flex", gap: "7px" }}>
              <input
                style={{ ...ui.input, flex: 1 }}
                placeholder="Write a comment… tag with @Name"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <button onClick={sendChat} style={btnPrimary}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
