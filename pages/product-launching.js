// pages/product-launching.js
// Product Launching Department — kanban pipeline for funnel builders.
// "+ Add Task" opens the full task view immediately (ClickUp-style):
// large popup, stacked fields on the left, activity log & chat on the right.

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

const STATUSES = ["Task Start", "AI Translation", "Ready For Build", "In Production", "QA Check", "First Creative Batch", "Ready to launch", "Launched"];
// Board toont t/m First Creative Batch — Ready to launch zit bij Media Buying, Launched bij het Launched-tabblad
const BOARD_STATUSES = STATUSES.slice(0, 6);
const MARKETS = ["Italy", "France", "Israel"];
const CODES = ["IT", "FR", "IL"];
const MARKET_TO_CODE = { Italy: "IT", France: "FR", Israel: "IL" };
const GENDERS = ["Male", "Female"];
const AGE_RANGES = ["18-25", "25-40", "40-55", "55+"];

const STATUS_META = {
  "Task Start": { color: "#c2410c", bg: "#ffedd5" },
  "AI Translation": { color: "#7c3aed", bg: "#ede9fe" },
  "Ready For Build": { color: "#1d4ed8", bg: "#dbeafe" },
  "In Production": { color: "#6d28d9", bg: "#ede9fe" },
  "QA Check": { color: "#b45309", bg: "#fef3c7" },
  "First Creative Batch": { color: "#be185d", bg: "#fce7f3" },
  "Ready to launch": { color: "#0f766e", bg: "#ccfbf1" },
  "Launched": { color: "#166534", bg: "#dcfce7" },
};

// Kleur per persoon voor het logvenster
const PERSON_COLORS = ["#3b82f6", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be185d", "#65a30d"];
const personColor = (email) => {
  let h = 0;
  for (const c of email || "") h = (h * 31 + c.charCodeAt(0)) % 997;
  return PERSON_COLORS[h % PERSON_COLORS.length];
};

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

// Deadline: opgeslagen als UTC (ISO), getoond in de tijdzone van de kijker
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

const namingConvention = (t) =>
  [t.productName, t.countryCode, firstName(t.assigneeName), fmtDeadlineDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

// Taaktitel: vanaf "AI Translation" automatisch de naming convention,
// daarvoor gewoon de product name.
const NAMING_FROM_STATUS = "AI Translation";
const taskTitle = (t) => {
  const hasNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const naming = namingConvention(t);
  return hasNaming && naming ? naming : t.productName || "New Product";
};

export default function ProductLaunching() {
  const [tasks, setTasks] = useState([]);
  const [funnelBuilders, setFunnelBuilders] = useState([]);
  const [team, setTeam] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [menuId, setMenuId] = useState(null);
  // Filters
  const [fAssignee, setFAssignee] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [fProduct, setFProduct] = useState("");
  const isMobile = useIsMobile();

  const load = () =>
    fetch("/api/launch-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
        setFunnelBuilders(res.funnelBuilders);
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
    const res = await fetch("/api/launch-tasks", {
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

  // ClickUp-stijl: taak wordt meteen aangemaakt en opent direct in de grote weergave
  const createTask = async (status) => {
    if (creating) return;
    setCreating(true);
    const res = await post({ action: "create", task: { productName: "New Product", status } });
    setCreating(false);
    if (res?.createdId) setOpenTaskId(res.createdId);
  };

  // Drag & drop: kaart naar een andere kolom slepen wijzigt de status
  // (met dezelfde meldingen en log-entries als via de dropdown)
  // Snel dupliceren voor kleine iteraties (⋯-menu op de kaart)
  const duplicateTask = async (taskId) => {
    setMenuId(null);
    const res = await post({ action: "duplicate", taskId });
    if (res?.createdId) setOpenTaskId(res.createdId);
  };
  const deleteTask = async (taskId) => {
    setMenuId(null);
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await post({ action: "delete", taskId });
  };


  const onDropTask = async (status) => {
    setDragOver(null);
    if (!dragId) return;
    const task = tasks.find((x) => x.id === dragId);
    setDragId(null);
    if (!task || task.status === status) return;
    // Optimistisch verplaatsen voor een vlot gevoel
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
  const hasFilters = fAssignee || fDeadline || fProduct;
  const filtered = tasks.filter(
    (t) =>
      (!fAssignee || t.assigneeEmail === fAssignee) &&
      (!fDeadline || (t.deadline && new Date(t.deadline) <= new Date(`${fDeadline}T23:59:59`))) &&
      (!fProduct || (t.productName || "").toLowerCase().includes(fProduct.toLowerCase()))
  );
  const filterStyle = { ...ui.input, width: "auto", padding: "7px 10px", fontSize: "12px" };

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 12px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>🚀 Product Pipeline</h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Product Launching Department — {filtered.filter((t) => t.status !== "Launched").length} active tasks{hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        {me?.canEdit && (
          <button onClick={() => createTask("Task Start")} disabled={creating} style={btnPrimary}>
            {creating ? "Creating…" : "+ New product"}
          </button>
        )}
      </div>

      {/* Filterbalk */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
        <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} style={filterStyle}>
          <option value="">All funnel builders</option>
          {funnelBuilders.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
        <input
          style={{ ...filterStyle, width: "180px" }}
          placeholder="Search product name…"
          value={fProduct}
          onChange={(e) => setFProduct(e.target.value)}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#8a92a3" }}>Due by</span>
          <input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} style={filterStyle} />
        </span>
        {hasFilters && (
          <button
            onClick={() => { setFAssignee(""); setFDeadline(""); setFProduct(""); }}
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
                minWidth: isMobile ? "250px" : "272px",
                width: isMobile ? "250px" : "272px",
                flexShrink: 0,
                borderRadius: "14px",
                padding: "4px",
                background: dragOver === status && dragId ? meta.bg : "transparent",
                outline: dragOver === status && dragId ? `2px dashed ${meta.color}` : "2px dashed transparent",
                transition: "background 0.15s, outline 0.15s",
              }}
            >
              {/* Kolomkop */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "0 2px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.bg, padding: "4px 10px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {status}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b" }}>{columnTasks.length}</span>
              </div>

              {/* Kaarten */}
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
                    style={{
                      ...ui.card,
                      padding: "12px 14px",
                      cursor: me?.canStatus ? "grab" : "pointer",
                      opacity: dragId === t.id ? 0.4 : 1,
                      position: "relative",
                    }}
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
                            {me?.admin && (<button onClick={() => deleteTask(t.id)} style={{ display: "block", width: "100%", padding: "9px 16px", background: "none", border: "none", fontSize: "12px", fontWeight: 600, color: "#dc2626", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap", borderTop: "1px solid #f1f5f9" }}>
                              🗑 Delete task
                            </button>)}
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word", paddingRight: "18px" }}>{taskTitle(t)}</div>
                    {t.funnelAngle && (
                      <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.funnelAngle}
                      </div>
                    )}
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

      {/* Grote taakweergave */}
      {openTask && (
        <TaskModal
          t={openTask}
          allTasks={tasks}
          openTaskById={setOpenTaskId}
          me={me}
          funnelBuilders={funnelBuilders}
          team={team}
          post={post}
          onClose={() => setOpenTaskId(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

/* ================= veld-componenten ================= */

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

/* ================= grote taakweergave (ClickUp-stijl) ================= */

function SelectField({ value, options, onSave, disabled, placeholder }) {
  if (disabled) return <span style={{ fontSize: "13px" }}>{value || "—"}</span>;
  return (
    <select value={value || ""} onChange={(e) => onSave(e.target.value)} style={{ ...ui.input, padding: "7px 10px" }}>
      <option value="">{placeholder || "—"}</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

/* ---------- Status dropdown met boardkleuren ---------- */
function StatusDropdown({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[value] || { color: "#334155", bg: "#f1f5f9" };
  const pill = (s, m) => (
    <span style={{ color: m.color, background: m.bg, padding: "3px 10px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>
  );
  if (disabled) return <div style={{ marginTop: "6px" }}>{pill(value, meta)}</div>;
  return (
    <div style={{ position: "relative", marginTop: "4px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e5e8ee", background: "#ffffff", cursor: "pointer" }}
      >
        {pill(value, meta)}
        <span style={{ color: "#64748b", fontSize: "11px" }}>{"▾"}</span>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 5 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "100%", background: "#ffffff", border: "1px solid #e5e8ee", borderRadius: "10px", boxShadow: "0 10px 30px rgba(15,23,42,0.14)", padding: "6px", zIndex: 6, display: "grid", gap: "2px" }}>
            {STATUSES.map((s) => {
              const m = STATUS_META[s] || { color: "#334155", bg: "#f1f5f9" };
              return (
                <button
                  key={s}
                  onClick={() => {
                    setOpen(false);
                    if (s !== value) onChange(s);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "6px 8px", background: s === value ? "#f6f8fa" : "transparent", border: "none", borderRadius: "8px", cursor: "pointer", textAlign: "left" }}
                >
                  {pill(s, m)}
                  {s === value && <span style={{ marginLeft: "auto", color: "#64748b", fontSize: "12px" }}>{"✓"}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const actStyle = { fontSize: "10.5px", fontWeight: 700, color: "#64748b", cursor: "pointer" };

/* ---------- Voicebericht-speler met waveform + transcript ---------- */
function VoiceNote({ url, transcript }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const bars = [];
  let seed = 7;
  for (let i = 0; i < (url || "").length; i++) seed = (seed * 31 + url.charCodeAt(i)) % 997;
  for (let i = 0; i < 28; i++) {
    seed = (seed * 73 + 41) % 997;
    bars.push(6 + (seed % 14));
  }
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  };
  const fmt = (s) => (isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
  return (
    <div style={{ marginTop: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f1f5f9", borderRadius: "999px", padding: "5px 14px 5px 5px", maxWidth: "290px" }}>
        <button onClick={toggle} style={{ width: "30px", height: "30px", borderRadius: "999px", background: "#0f172a", color: "#ffffff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z" /></svg>
          )}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "2px", flex: 1, height: "24px", minWidth: 0 }}>
          {bars.map((h, i) => (
            <span key={i} style={{ width: "3px", height: `${h}px`, borderRadius: "2px", background: i / bars.length <= progress ? "#0f172a" : "#a8b3c2", flexShrink: 0 }} />
          ))}
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {fmt(playing || progress > 0 ? audioRef.current?.currentTime || 0 : dur)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(isFinite(e.target.duration) ? e.target.duration : 0)}
        onTimeUpdate={(e) => {
          if (isFinite(e.target.duration) && e.target.duration > 0) setProgress(e.target.currentTime / e.target.duration);
          if (isFinite(e.target.duration) && !dur) setDur(e.target.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        style={{ display: "none" }}
      />
      {transcript && (
        <div style={{ marginTop: "5px", fontSize: "11.5px", color: "#64748b", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "8px", padding: "6px 10px", maxWidth: "290px" }}>
          <span style={{ fontWeight: 700, color: "#94a3b8", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Transcript</span>
          <div style={{ marginTop: "2px", lineHeight: 1.45 }}>{transcript}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Chat: tekst met @mentions en taak-verwijzingen ---------- */
function ChatText({ text, openTask }) {
  const nodes = [];
  const re = /\[task:([a-f0-9]+)\|([^\]]*)\]|@([A-Za-z0-9_.\-]+)/g;
  const src = text || "";
  let last = 0;
  let mm;
  let k = 0;
  while ((mm = re.exec(src)) !== null) {
    if (mm.index > last) nodes.push(<span key={k++}>{src.slice(last, mm.index)}</span>);
    if (mm[1]) {
      const refId = mm[1];
      const refTitle = mm[2] || "task";
      nodes.push(
        <a key={k++} onClick={() => openTask && openTask(refId)} style={{ color: "#4f46e5", background: "#eef2ff", padding: "1px 7px", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}>
          {"⧉"} {refTitle}
        </a>
      );
    } else {
      nodes.push(<b key={k++} style={{ color: "#2563eb" }}>@{mm[3]}</b>);
    }
    last = mm.index + mm[0].length;
  }
  if (last < src.length) nodes.push(<span key={k++}>{src.slice(last)}</span>);
  return <span>{nodes}</span>;
}

/* ---------- Chat composer: @mensen, @@taken, bestanden & voice ---------- */
function ChatComposer({ team, me, taskOptions, value, setValue, onSend, onFile, busy, dragActive, replyTo, onCancelReply, editing, onCancelEdit }) {
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [levels, setLevels] = useState([]);
  const [tab, setTab] = useState(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const cancelRef = useRef(false);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  const m = /(^|\s)(@{1,2})([^@\s]*)$/.exec(value || "");
  const tokenMode = m ? (m[2] === "@@" ? "tasks" : "people") : null;
  const mode = m ? (tab || tokenMode) : null;
  const q = m ? m[3].toLowerCase() : "";
  const people = mode === "people" ? team.filter((u) => !q || (u.name || "").toLowerCase().includes(q)).slice(0, 6) : [];
  const taskSugs = mode === "tasks" ? (taskOptions || []).filter((o) => !q || o.title.toLowerCase().includes(q)).slice(0, 6) : [];
  const replaceToken = (insert) => {
    setValue(value.slice(0, m.index + m[1].length) + insert);
    setTab(null);
  };
  const tabBtn = (active) => ({ flex: 1, padding: "5px 0", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11.5px", fontWeight: 700, background: active ? "#eef2ff" : "transparent", color: active ? "#4f46e5" : "#64748b" });
  const iconBtn = { width: "30px", height: "30px", borderRadius: "8px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#64748b" };

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        stopMeter();
        setRecording(false);
        setLevels([]);
        setRecTime(0);
        if (cancelRef.current) return;
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : "webm";
        onFile(new File(chunks, `voice-message-${Date.now()}.${ext}`, { type }));
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setRecTime(0);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const dv = (buf[i] - 128) / 128;
            sum += dv * dv;
          }
          const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          setLevels((prev) => [...prev.slice(-41), rms]);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
      timerRef.current = setInterval(() => setRecTime((s) => s + 1), 1000);
    } catch {
      alert("Microphone access was denied");
    }
  };

  const stopRecording = (cancel) => {
    cancelRef.current = !!cancel;
    recRef.current?.stop();
  };

  const fmtRec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "relative" }}>
      {mode && (people.length > 0 || taskSugs.length > 0 || tab) && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "#ffffff", border: "1px solid #e5e8ee", borderRadius: "12px", boxShadow: "0 12px 30px rgba(15,23,42,0.16)", padding: "6px", zIndex: 30, maxHeight: "250px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: "4px", padding: "2px 4px 6px 4px", borderBottom: "1px solid #f1f5f9", marginBottom: "4px" }}>
            <button onClick={() => setTab("people")} style={tabBtn(mode === "people")}>People</button>
            <button onClick={() => setTab("tasks")} style={tabBtn(mode === "tasks")}>Tasks</button>
          </div>
          {mode === "people" &&
            people.map((u) => (
              <button key={u.email} onClick={() => replaceToken(`@${firstName(u.name)} `)} style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "7px 9px", background: "none", border: "none", borderRadius: "8px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "999px", background: personColor(u.email), color: "#ffffff", fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(u.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{u.name}</span>
                {u.email === me?.email && <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>(you)</span>}
              </button>
            ))}
          {mode === "people" && people.length === 0 && <div style={{ fontSize: "11.5px", color: "#94a3b8", padding: "6px 9px" }}>No people found</div>}
          {mode === "tasks" &&
            taskSugs.map((o) => (
              <button key={o.id} onClick={() => replaceToken(`[task:${o.id}|${o.title}] `)} style={{ display: "block", width: "100%", padding: "7px 9px", background: "none", border: "none", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {"⧉"} {o.title}
              </button>
            ))}
          {mode === "tasks" && taskSugs.length === 0 && <div style={{ fontSize: "11.5px", color: "#94a3b8", padding: "6px 9px" }}>No other tasks on this board</div>}
          <div style={{ fontSize: "10px", color: "#94a3b8", padding: "4px 9px 2px 9px" }}>@ people {"·"} @@ tasks</div>
        </div>
      )}

      <div style={{ background: "#ffffff", border: dragActive ? "2px dashed #3b82f6" : "1px solid #e5e8ee", borderRadius: "14px", padding: "9px 10px 7px 10px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)", transition: "border-color 0.15s" }}>
        {replyTo && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f8fafc", borderLeft: "3px solid #6366f1", borderRadius: "6px", padding: "4px 9px", marginBottom: "7px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#6366f1" }}>Replying to {replyTo.author}</div>
              <div style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{replyTo.text}</div>
            </div>
            <a onClick={onCancelReply} style={{ cursor: "pointer", color: "#94a3b8", fontSize: "13px", flexShrink: 0 }}>{"✕"}</a>
          </div>
        )}
        {editing && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fffbeb", borderLeft: "3px solid #f59e0b", borderRadius: "6px", padding: "4px 9px", marginBottom: "7px" }}>
            <span style={{ flex: 1, fontSize: "11px", fontWeight: 700, color: "#b45309" }}>Editing message</span>
            <a onClick={onCancelEdit} style={{ cursor: "pointer", color: "#94a3b8", fontSize: "13px", flexShrink: 0 }}>{"✕"}</a>
          </div>
        )}

        {dragActive ? (
          <div style={{ padding: "13px 4px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "#1d4ed8" }}>Drop your file here</div>
        ) : recording ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 4px 8px 4px" }}>
            <button title="Cancel recording" onClick={() => stopRecording(true)} style={{ width: "26px", height: "26px", borderRadius: "999px", background: "#f1f5f9", border: "none", cursor: "pointer", color: "#475569", fontSize: "12px", flexShrink: 0 }}>{"✕"}</button>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtRec(recTime)}</span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "2px", height: "24px", overflow: "hidden", minWidth: 0 }}>
              {levels.map((lv, i) => (
                <span key={i} style={{ width: "2.5px", flexShrink: 0, height: `${Math.max(3, lv * 24)}px`, background: "#334155", borderRadius: "2px" }} />
              ))}
            </div>
            <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: "#dc2626", animation: "jjbPulse 1.1s ease-in-out infinite", flexShrink: 0 }} />
            <style>{`@keyframes jjbPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
          </div>
        ) : (
          <input
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: "13px", color: "#0f172a", padding: "2px 4px 9px 4px", boxSizing: "border-box" }}
            placeholder="Write a comment… @ to tag, @@ for a task"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !mode && onSend()}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "2px", borderTop: "1px solid #f1f5f9", paddingTop: "7px" }}>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
          <button title="Attach a file (max 3 MB)" onClick={() => fileRef.current?.click()} disabled={busy || recording} style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button title={recording ? "Stop" : "Record a voice message"} onClick={() => (recording ? stopRecording(false) : startRecording())} disabled={busy} style={{ ...iconBtn, background: recording ? "#fee2e2" : "transparent", color: recording ? "#dc2626" : "#64748b" }}>
            {recording ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          {busy && <span style={{ fontSize: "11px", color: "#8a92a3", marginLeft: "6px" }}>Uploading{"…"}</span>}
          <button title={recording ? "Stop & send" : editing ? "Save edit" : "Send"} onClick={() => (recording ? stopRecording(false) : onSend())} disabled={busy} style={{ marginLeft: "auto", width: "42px", height: "32px", borderRadius: "10px", background: "#0f172a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: busy ? 0.55 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Sales Page Copy pipeline (Stefan's Brain) ================= */
const SC_STEPS = [
  ["2", "ATF Headline", null],
  ["3", "Subheadline", null],
  ["4", "Top 4 Benefits", null],
  ["5", "Authority Headline", null],
  ["6", "Authority Column", null],
  ["7", "Headline Section 3", null],
  ["8", "Subheadline Section 3", null],
  ["9", "Column Section 3", null],
  ["10", "3 Benefits Section 3", null],
  ["11", "How To Use: Subheadline", null],
  ["12", "How To Use: Step-By-Step", ["step1_headline", "step1_column", "step2_headline", "step2_column", "step3_headline", "step3_column"]],
  ["13", "Section 5: Headline", null],
  ["14", "Section 5: Subheadline", null],
  ["15", "Section 5: Benefits", ["benefit_1", "benefit_column_1", "benefit_2", "benefit_column_2", "benefit_3", "benefit_column_3", "benefit_4", "benefit_column_4"]],
  ["16", "Section 6: Ingredients", ["ingredient_1", "ingredient_effect_1", "ingredient_2", "ingredient_effect_2", "ingredient_3", "ingredient_effect_3", "ingredient_4", "ingredient_effect_4", "ingredient_5", "ingredient_effect_5", "ingredient_6", "ingredient_effect_6"]],
  ["17", "Reviews", ["name_review_1", "text_review_1", "date_review_1", "name_review_2", "text_review_2", "date_review_2", "name_review_3", "text_review_3", "date_review_3"]],
  ["18", "Offer Section: Headline", null],
  ["19", "Offer Section: Full Column Text", ["headline", "subheadline", "subheadline_3_benefits", "benefit_1", "benefit_2", "benefit_3"]],
  ["20", "FAQ Section", ["question_1", "answer_1", "question_2", "answer_2", "question_3", "answer_3", "question_4", "answer_4", "question_5", "answer_5", "question_6", "answer_6", "question_7", "answer_7"]],
];
const SC_ROWS = [];
for (const [k, label, fields] of SC_STEPS) {
  if (!fields) SC_ROWS.push({ category: label, step: k, field: null });
  else for (const f of fields) SC_ROWS.push({ category: `${label} — ${f.replace(/_/g, " ")}`, step: k, field: f });
}
const SC_PIPE = [["1", "Research"], ["1b", "Extract JSON"], ...SC_STEPS.map(([k, l]) => [k, l]), ["validate", "Validate"], ["translate", "Translate"], ["finalize", "Deliver CSV"]];
const SC_LANGS = { Italy: "Italian", France: "French", Israel: "Hebrew" };

function SalesCopyPanel({ t, canEdit, save, selectStyle, csvName, post }) {
  const [store, setStore] = useState(null);
  const [retryStep, setRetryStep] = useState(null);
  const [showDoc, setShowDoc] = useState(false);
  const storeRef = useRef(null);
  const running = !!store?.queueActive && (!store?.updatedAt || Date.now() - Date.parse(store.updatedAt) < 240000);

  useEffect(() => {
    fetch(`/api/salescopy?taskId=${t.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setStore(res.store);
          storeRef.current = res.store;
        }
      })
      .catch(() => {});
  }, [t.id]);

  // Live meekijken: de pipeline draait server-side door, ook als de taak dicht is
  useEffect(() => {
    if (!store?.queueActive) return;
    const iv = setInterval(() => {
      fetch(`/api/salescopy?taskId=${t.id}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            storeRef.current = res.store;
            setStore(res.store);
            post({ action: "refresh" });
            // Watchdog: keten actief maar >45s geen voortgang? Automatisch opnieuw aantrappen.
            if (res.store.queueActive && res.store.updatedAt && Date.now() - Date.parse(res.store.updatedAt) > 45000) {
              fetch("/api/salescopy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: t.id, action: "startQueue" }),
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(iv);
  }, [store?.queueActive, t.id]);

  const api = async (body) => {
    const res = await fetch("/api/salescopy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: t.id, ...body }),
    }).then((r) => r.json());
    if (res.store) {
      storeRef.current = res.store;
      setStore(res.store);
    }
    return res;
  };

  const runOne = async (step) => {
    setRetryStep(step);
    const res = await api({ action: "runStep", step });
    setRetryStep(null);
    return res.success;
  };

  const firstPending = (() => {
    const st = store || {};
    if (!st.researchDoc) return "1";
    if (!st.researchJson) return "1b";
    for (const [k] of SC_STEPS) if (!st.outputs?.[k]) return k;
    if (!st.violations) return "validate";
    if (!st.translated) return "translate";
    if (!st.csvUrl) return "finalize";
    return null;
  })();

  const runPipeline = async () => {
    if (running) return;
    if (!(t.advertorialLink || "").trim() && !(storeRef.current?.advertorialText || "").trim()) {
      alert("Fill in the Advertorial Link in the Funnel section first - step 1 fetches the advertorial from that page.");
      return;
    }
    await api({ action: "startQueue" });
    setTimeout(() => post({ action: "refresh" }), 5000);
  };

  const stepState = (k) => {
    const st = store || {};
    if (retryStep === k || (running && k === firstPending)) return "running";
    if (k === "1") return st.researchDoc ? "done" : st.stepStatus?.["1"]?.startsWith("error") ? "error" : "todo";
    if (k === "1b") return st.researchJson ? "done" : st.stepStatus?.["1b"]?.startsWith("error") ? "error" : "todo";
    if (k === "validate") return st.violations ? "done" : "todo";
    if (k === "translate") return st.translated ? "done" : st.stepStatus?.["translate"]?.startsWith("error") ? "error" : "todo";
    if (k === "finalize") return st.csvUrl ? "done" : st.stepStatus?.["finalize"]?.startsWith("error") ? "error" : "todo";
    if (st.outputs?.[k]) return "done";
    if (st.stepStatus?.[k]?.startsWith("error")) return "error";
    return "todo";
  };
  const chipStyle = (state) => ({
    fontSize: "10px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "999px",
    cursor: state === "error" && canEdit ? "pointer" : "default",
    background: state === "done" ? "#dcfce7" : state === "running" ? "#dbeafe" : state === "error" ? "#fee2e2" : "#f1f5f9",
    color: state === "done" ? "#166534" : state === "running" ? "#1d4ed8" : state === "error" ? "#dc2626" : "#94a3b8",
  });

  const cellValue = (row) => {
    const out = store?.outputs || {};
    return row.field ? out[row.step]?.[row.field] || "" : out[row.step] || "";
  };
  const hasOutputs = store && Object.keys(store.outputs || {}).length > 0;
  const started = !!(store && (store.researchDoc || hasOutputs || Object.keys(store.stepStatus || {}).length > 0));
  const doneCount = SC_PIPE.filter(([k]) => stepState(k) === "done").length;

  const downloadCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const langName = store?.translatedLanguage || SC_LANGS[t.marketCountry] || "Translation";
    const lines = [["Category", "English", langName].map(esc).join(",")];
    for (const row of SC_ROWS) {
      const key = row.field ? `${row.step}.${row.field}` : row.step;
      lines.push([row.category, cellValue(row), store?.translated?.[key] || ""].map(esc).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvName} - sales page copy.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyCell = (v) => navigator.clipboard?.writeText(v);

  return (
    <Section title="🧠 Sales Page Copy">
      <Field label="Ready for AI">
        {canEdit ? (
          <select
            value={t.readyForAI || "NO"}
            onChange={(e) => {
              save("readyForAI", e.target.value);
              if (e.target.value === "YES") runPipeline();
            }}
            style={selectStyle}
          >
            <option>NO</option>
            <option>YES</option>
          </select>
        ) : (
          <span style={{ fontSize: "13px" }}>{t.readyForAI || "NO"}</span>
        )}
      </Field>

      <div style={{ padding: "10px 0 2px 0" }}>
        <div style={{ ...ui.label, marginBottom: "6px" }}>Advertorial (Dutch — input for step 1)</div>
        {t.advertorialLink ? (
          <div style={{ fontSize: "12.5px", color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "9px 12px" }}>
            ✓ Fetched automatically from the{" "}
            <a href={t.advertorialLink} target="_blank" rel="noreferrer" style={{ color: "#166534", fontWeight: 700 }}>Advertorial Link</a>{" "}
            in the Funnel section.
          </div>
        ) : (
          <div style={{ fontSize: "12.5px", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "9px 12px" }}>
            ⚠ Fill in the Advertorial Link in the Funnel section first — the pipeline reads the advertorial from that page.
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "10px 0" }}>
        {canEdit && (running || (started && !store?.csvUrl)) && (
          <button onClick={runPipeline} disabled={running} style={{ ...btnPrimary, padding: "8px 16px", fontSize: "12px", opacity: running ? 0.6 : 1 }}>
            {running ? `Running… (${doneCount}/${SC_PIPE.length})` : "▶ Resume pipeline"}
          </button>
        )}
        {running && (
          <button onClick={() => api({ action: "stopQueue" })} style={{ ...btnGhost, padding: "8px 14px", fontSize: "12px" }}>Stop</button>
        )}
        {running && (
          <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>Runs on the server - you can safely close this task.</span>
        )}
        {store?.csvUrl && (
          <a href={store.csvUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, padding: "8px 14px", fontSize: "12px", textDecoration: "none", color: "#166534", borderColor: "#bbf7d0", background: "#f0fdf4", fontWeight: 700 }}>
            📄 {store.csvName || "sales-page-copy.csv"}
          </a>
        )}
        {hasOutputs && (
          <button onClick={downloadCsv} style={{ ...btnGhost, padding: "8px 14px", fontSize: "12px" }}>⬇ Download CSV</button>
        )}
        {canEdit && hasOutputs && !running && (
          <button
            onClick={async () => {
              if (confirm("Clear all pipeline outputs? The advertorial text stays.")) await api({ action: "reset" });
            }}
            style={{ ...btnGhost, padding: "8px 14px", fontSize: "12px", color: "#dc2626", borderColor: "#fecaca" }}
          >
            Reset
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
        {SC_PIPE.map(([k, label]) => {
          const state = stepState(k);
          return (
            <span
              key={k}
              title={state === "error" ? `${store?.stepStatus?.[k] || "error"} — click to retry` : label}
              onClick={() => state === "error" && canEdit && !running && runOne(k)}
              style={chipStyle(state)}
            >
              {state === "running" ? "⏳ " : state === "done" ? "✓ " : state === "error" ? "✕ " : ""}{label}
            </span>
          );
        })}
      </div>

      {Object.entries(store?.stepStatus || {}).some(([k, v]) => String(v).startsWith("error") && !(running && k === firstPending)) && (
        <div style={{ fontSize: "12px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px" }}>
          <b>Step errors:</b>
          <div style={{ fontSize: "11px", color: "#991b1b", marginTop: "2px", fontStyle: "italic" }}>Tip: press "Resume pipeline" — it restarts from the first missing step in the right order.</div>
          {Object.entries(store.stepStatus)
            .filter(([k, v]) => String(v).startsWith("error") && !(running && k === firstPending))
            .map(([k, v]) => {
              const label = (SC_PIPE.find(([pk]) => pk === k) || [k, k])[1];
              return (
                <div key={k} style={{ marginTop: "3px", wordBreak: "break-word" }}>
                  {"•"} <b>{label}</b>: {String(v).replace(/^error:\s*/, "")}
                  {canEdit && !running && (
                    <a onClick={() => runOne(k)} style={{ marginLeft: "8px", fontWeight: 700, color: "#b91c1c", cursor: "pointer", textDecoration: "underline" }}>retry</a>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {store?.violations && (
        store.violations.length === 0 ? (
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534", background: "#dcfce7", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px" }}>
            ✓ All validator checks passed
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px" }}>
            <b>Validator — {store.violations.length} issue(s):</b>
            {store.violations.map((x, i) => (
              <div key={i} style={{ marginTop: "3px" }}>• {x}</div>
            ))}
          </div>
        )
      )}

      {canEdit && !running && (
        <div style={{ marginBottom: "10px" }}>
          <a
            onClick={async () => {
              const txt = prompt("Paste the research JSON (e.g. a test fixture). This skips steps 1 and 1B:");
              if (!txt) return;
              const res = await api({ action: "saveJson", text: txt });
              if (!res.success) alert(res.error || "Invalid JSON");
            }}
            style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", cursor: "pointer" }}
          >
            Paste research JSON manually (testing)
          </a>
        </div>
      )}

      {store?.researchDoc && (
        <div style={{ marginBottom: "10px" }}>
          <a onClick={() => setShowDoc(!showDoc)} style={{ fontSize: "12px", fontWeight: 700, color: "#3b82f6", cursor: "pointer" }}>
            {showDoc ? "▾ Hide" : "▸ View"} research document & JSON
          </a>
          {showDoc && (
            <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px", marginTop: "6px" }}>
              {store.advertorialText && (
                <details style={{ marginBottom: "10px" }}>
                  <summary style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", cursor: "pointer" }}>Fetched advertorial text</summary>
                  <pre style={{ margin: "6px 0 0 0", fontSize: "11px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "180px", overflowY: "auto" }}>{store.advertorialText}</pre>
                </details>
              )}
              <pre style={{ margin: 0, fontSize: "11px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "220px", overflowY: "auto" }}>{store.researchDoc}</pre>
              {store.researchJson && (
                <pre style={{ margin: "10px 0 0 0", fontSize: "10.5px", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", maxHeight: "180px", overflowY: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>{JSON.stringify(store.researchJson, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {hasOutputs && (
        <div style={{ border: "1px solid #eceef2", borderRadius: "10px", overflow: "hidden" }}>
          {SC_ROWS.map((row, i) => {
            const v = cellValue(row);
            return (
              <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 12px", background: i % 2 ? "#fafbfc" : "#ffffff", borderTop: i ? "1px solid #f1f5f9" : "none", alignItems: "flex-start" }}>
                <div style={{ width: "220px", flexShrink: 0, fontSize: "11px", fontWeight: 700, color: "#64748b" }}>{row.category}</div>
                <div style={{ flex: 1, fontSize: "12px", whiteSpace: "pre-wrap", minWidth: 0, color: v ? "#0f172a" : "#cbd5e1" }}>
                  {v || "—"}
                  {store?.translated?.[row.field ? `${row.step}.${row.field}` : row.step] && (
                    <div style={{ color: "#64748b", marginTop: "3px", fontStyle: "italic" }}>{store.translated[row.field ? `${row.step}.${row.field}` : row.step]}</div>
                  )}
                </div>
                {v && (
                  <a onClick={() => copyCell(v)} title="Copy" style={{ fontSize: "11px", fontWeight: 700, color: "#3b82f6", cursor: "pointer", flexShrink: 0 }}>Copy</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ---------- Deadline picker: kalender + tijdchips ---------- */
function DeadlinePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const sel = value ? new Date(value) : null;
  const today = new Date();
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const openPicker = () => {
    const d = value ? new Date(value) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  };
  const shift = (n) => setView((v) => {
    const d = new Date(v.y, v.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const pickDay = (d) => {
    const h = sel ? sel.getHours() : 18;
    const min = sel ? sel.getMinutes() : 0;
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).toISOString());
  };
  const pickHour = (h) => {
    const base = sel || new Date();
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 0).toISOString());
  };

  const first = new Date(view.y, view.m, 1);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(view.y, view.m, 1 - first.getDay() + i));
  const monthLabel = first.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const fmt = sel ? sel.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const navBtn = { width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #eceef2", background: "#ffffff", cursor: "pointer", fontSize: "12px", color: "#334155", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ position: "relative", marginTop: "4px" }}>
      <button onClick={openPicker} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #e5e8ee", background: "#ffffff", cursor: "pointer", fontSize: "13px", fontWeight: sel ? 700 : 400, color: sel ? "#0f172a" : "#94a3b8", textAlign: "left" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        {fmt || "Set deadline\u2026"}
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 80 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "292px", maxWidth: "88vw", background: "#ffffff", border: "1px solid #e5e8ee", borderRadius: "16px", boxShadow: "0 18px 44px rgba(15,23,42,0.20)", padding: "14px", zIndex: 90 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <button onClick={() => shift(-1)} style={navBtn}>{"\u2039"}</button>
              <span style={{ fontSize: "13.5px", fontWeight: 700 }}>{monthLabel}</span>
              <button onClick={() => shift(1)} style={navBtn}>{"\u203A"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "2px" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d} style={{ textAlign: "center", fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", padding: "4px 0" }}>{d}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === view.m;
                const isSel = sameDay(d, sel);
                const isToday = sameDay(d, today);
                return (
                  <button
                    key={i}
                    onClick={() => pickDay(d)}
                    style={{
                      height: "32px",
                      borderRadius: "9px",
                      border: isToday && !isSel ? "1px solid #bfdbfe" : "1px solid transparent",
                      background: isSel ? "#3b82f6" : "transparent",
                      color: isSel ? "#ffffff" : inMonth ? "#0f172a" : "#cbd5e1",
                      fontSize: "12.5px",
                      fontWeight: isSel ? 800 : 600,
                      cursor: "pointer",
                    }}
                  >
                    {String(d.getDate()).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px", margin: "12px 0 6px 0" }}>Select Time</div>
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
              {Array.from({ length: 24 }, (_, h) => {
                const isSel = sel && sel.getHours() === h && sel.getMinutes() === 0;
                return (
                  <button
                    key={h}
                    onClick={() => pickHour(h)}
                    style={{ flexShrink: 0, padding: "7px 12px", borderRadius: "10px", border: isSel ? "1.5px solid #3b82f6" : "1px solid #e5e8ee", background: isSel ? "#eff6ff" : "#ffffff", color: isSel ? "#1d4ed8" : "#334155", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
              <a onClick={() => { onChange(""); setOpen(false); }} style={{ fontSize: "11.5px", fontWeight: 700, color: "#94a3b8", cursor: "pointer" }}>Clear</a>
              <button onClick={() => setOpen(false)} style={{ padding: "7px 18px", borderRadius: "9px", border: "none", background: "#0f172a", color: "#ffffff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TaskModal({ t, me, funnelBuilders, team, post, onClose, isMobile, allTasks, openTaskById }) {
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const chatEndRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const naming = namingConvention(t);
  const showNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const canEdit = me?.canEdit;

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
    let ok;
    if (editingId) {
      ok = await post({ action: "chatEdit", taskId: t.id, messageId: editingId, message: chatInput });
    } else {
      ok = await post({ action: "chat", taskId: t.id, message: chatInput, replyTo: replyTo ? { id: replyTo.id, author: replyTo.author, text: replyTo.text } : null });
    }
    if (ok) {
      setChatInput("");
      setReplyTo(null);
      setEditingId(null);
    }
  };

  const startReply = (a) => {
    setEditingId(null);
    setReplyTo({ id: a.id, author: a.author, text: (a.text || (a.attachment ? a.attachment.kind === "audio" ? "Voice message" : a.attachment.name || "Attachment" : "")).slice(0, 140) });
  };
  const startEdit = (a) => {
    setReplyTo(null);
    setEditingId(a.id);
    setChatInput(a.text || "");
  };
  const deleteMsg = (a) => {
    if (confirm("Delete this message?")) post({ action: "chatDelete", taskId: t.id, messageId: a.id });
  };

  // Bestand of voicebericht uploaden naar Shopify Files en als chatbijlage versturen
  const sendFile = async (file) => {
    if (!file || chatBusy) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("Max file size is 3 MB");
      return;
    }
    setChatBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", data }),
      }).then((r) => r.json());
      if (!up.success) {
        alert(up.error || "Upload failed");
        return;
      }
      const kind = (file.type || "").startsWith("image/") ? "image" : (file.type || "").startsWith("audio/") ? "audio" : "file";
      const ok = await post({ action: "chat", taskId: t.id, message: chatInput, attachment: { url: up.url, name: file.name, mime: file.type || "", kind, transcript: up.transcript || "" } });
      if (ok) setChatInput("");
    } finally {
      setChatBusy(false);
    }
  };

  const taskOptions = (allTasks || []).filter((x) => x.id !== t.id).map((x) => ({ id: x.id, title: taskTitle(x) }));

  const selectStyle = { ...ui.input, padding: "7px 10px" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "8px" : "3vh 3vw", zIndex: 100 }}
      onClick={onClose}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          dragDepth.current += 1;
          setDragActive(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) sendFile(f);
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          width: "min(1280px, 100%)",
          height: isMobile ? "96vh" : "92vh",
          boxShadow: "0 24px 60px rgba(15,23,42,0.35)",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== Linkerkant: titel + velden (scrollbaar) ===== */}
        <div style={{ flex: 1.35, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Kop */}
          <div style={{ padding: isMobile ? "16px 18px 0 18px" : "24px 30px 0 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: STATUS_META[t.status]?.color, background: STATUS_META[t.status]?.bg, padding: "4px 12px", borderRadius: "999px", textTransform: "uppercase" }}>
                {t.status}
              </span>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                {me?.admin && (
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

            {/* Titel: automatisch de naming convention vanaf Ready For Build */}
            <h2 style={{ margin: "10px 0 4px 0", fontSize: isMobile ? "18px" : "23px", fontWeight: 700, letterSpacing: "-0.5px", wordBreak: "break-word" }}>
              {taskTitle(t)}
            </h2>
          </div>

          {/* Scrollbare velden */}
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "6px 18px 18px 18px" : "8px 30px 26px 30px", background: "#f7f8fa" }}>
            {/* Topblok: status / assignee / deadline */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "10px", margin: "14px 0 14px 0" }}>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Status</div>
                <StatusDropdown value={t.status} disabled={!me?.canStatus} onChange={(s) => post({ action: "status", taskId: t.id, status: s })} />
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Assignee</div>
                {canEdit ? (
                  <select
                    value={t.assigneeEmail || ""}
                    onChange={(e) => {
                      const fb = funnelBuilders.find((u) => u.email === e.target.value);
                      post({ action: "update", taskId: t.id, task: { assigneeEmail: e.target.value, assigneeName: fb?.name || "" } });
                    }}
                    style={{ ...selectStyle, marginTop: "4px" }}
                  >
                    <option value="">— Select funnel builder —</option>
                    {funnelBuilders.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px" }}>{t.assigneeName || "—"}</div>
                )}
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", padding: "10px 14px" }}>
                <div style={ui.label}>Deadline</div>
                {canEdit ? (
                  <DeadlinePicker value={t.deadline} onChange={(v) => save("deadline", v)} />
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px", color: deadlineColor(t.deadline, t.status) }}>
                    {t.deadline ? fmtDeadline(t.deadline) : "—"}{isOverdue(t.deadline, t.status) ? " ⚠" : ""}
                  </div>
                )}
              </div>
            </div>

            {/* ===== Sectie: Product (Shopify search) ===== */}
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
                            post({ action: "update", taskId: t.id, task: { product: { title: p.title, image: p.image }, productName: p.title } });
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
                <span style={{ fontSize: "13px", color: "#cbd5e1" }}>{t.productName || "—"}</span>
              )}
              <div style={{ marginTop: "8px" }}>
                <Field label="Alibaba Link" last>
                  <TextField value={t.alibabaLink} disabled={!canEdit} onSave={(v) => save("alibabaLink", v)} type="url" placeholder="https://…" />
                </Field>
              </div>
            </Section>

            {/* ===== Sectie: Market ===== */}
            <Section title="🌍 Market">
              <Field label="Market Country">
                {canEdit ? (
                  <select
                    value={t.marketCountry || ""}
                    onChange={(e) => post({ action: "update", taskId: t.id, task: { marketCountry: e.target.value, countryCode: MARKET_TO_CODE[e.target.value] || t.countryCode } })}
                    style={selectStyle}
                  >
                    <option value="">—</option>
                    {MARKETS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.marketCountry || "—"}</span>
                )}
              </Field>
              <Field label="Country Code">
                {canEdit ? (
                  <select value={t.countryCode || ""} onChange={(e) => save("countryCode", e.target.value)} style={selectStyle}>
                    <option value="">—</option>
                    {CODES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.countryCode || "—"}</span>
                )}
              </Field>
              <Field label="Target Gender">
                <SelectField value={t.gender} options={GENDERS} onSave={(v) => save("gender", v)} disabled={!canEdit} />
              </Field>
              <Field label="Target Age Range" last>
                <SelectField value={t.ageRange} options={AGE_RANGES} onSave={(v) => save("ageRange", v)} disabled={!canEdit} />
              </Field>
            </Section>

            {/* ===== Sectie: Funnel ===== */}
            <Section title="🧩 Funnel">
              <Field label="Funnel Angle">
                <TextField value={t.funnelAngle} disabled={!canEdit} onSave={(v) => save("funnelAngle", v)} />
              </Field>
              <Field label="Advertorial Link">
                <TextField value={t.advertorialLink} disabled={!canEdit} onSave={(v) => save("advertorialLink", v)} type="url" placeholder="https://…" />
              </Field>
              <Field label="Funnel Workspace Link">
                <TextField value={t.funnelWorkspaceLink} disabled={!canEdit} onSave={(v) => save("funnelWorkspaceLink", v)} type="url" placeholder="Workboard to build the sales page — https://…" />
              </Field>
              <div style={{ padding: "10px 0 2px 0" }}>
                <div style={{ ...ui.label, marginBottom: "6px" }}>Change Funnel Name To</div>
                {showNaming && naming ? (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "10px 12px" }}>
                    <code style={{ fontSize: "12px", color: "#0f172a", fontWeight: 600, flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{naming}</code>
                    <button onClick={copyNaming} style={{ ...btnGhost, padding: "5px 12px", fontSize: "11.5px", flexShrink: 0, background: copied ? "#dcfce7" : "#fff", color: copied ? "#166534" : "#334155" }}>
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                    The funnel name is generated automatically once the status reaches "AI Translation".
                  </p>
                )}
              </div>
              <Field label="Final Campaign Link" last>
                <TextField value={t.funnelishLink} disabled={!canEdit} onSave={(v) => save("funnelishLink", v)} type="url" placeholder="Final output of the funnel builder — https://…" />
              </Field>
              {t.launchedDate && (
                <div style={{ marginTop: "10px", fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                  🚀 Launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </Section>

            {/* ===== Sectie: Sales Page Copy pipeline ===== */}
            <SalesCopyPanel t={t} canEdit={canEdit} save={save} selectStyle={selectStyle} csvName={naming || t.productName || "sales-copy"} post={post} />

            {/* ===== Sectie: First Creative Batch (helemaal onderaan) ===== */}
            <Section title="🎨 First Creative Batch">
              <div style={{ padding: "2px 0" }}>
                <div style={{ ...ui.label, marginBottom: "6px" }}>Creative Batch Headlines</div>
                {t.firstCreativeBatch ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px" }}>
                    <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "200px", overflowY: "auto" }}>{t.firstCreativeBatch}</pre>
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(t.firstCreativeBatch)}`}
                      download={`${naming || t.productName} - headlines.txt`}
                      style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#3b82f6" }}
                    >
                      ⬇ Download .txt
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                    The generated headlines will appear here automatically once the Stefan's Brain automation is connected (phase 2).
                  </p>
                )}
              </div>
            </Section>
          </div>

          {/* Save & close onderaan */}
          <div style={{ padding: isMobile ? "10px 18px" : "12px 30px", borderTop: "1px solid #eef0f3", background: "#ffffff", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...btnPrimary, background: "#16a34a", padding: "10px 24px", fontSize: "13px" }}>
              💾 Save & Close
            </button>
          </div>
        </div>

        {/* ===== Rechterkant: activity log + chat over volledige hoogte ===== */}
        <div style={{ flex: 1, background: "#fafbfc", borderLeft: isMobile ? "none" : "1px solid #eceef2", borderTop: isMobile ? "1px solid #eceef2" : "none", display: "flex", flexDirection: "column", minWidth: 0, minHeight: isMobile ? "280px" : "auto", maxWidth: isMobile ? "none" : "420px" }}>
          <div style={{ padding: "16px 18px 10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eef0f3" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Activity</span>
            {!isMobile && <button onClick={onClose} style={{ ...btnGhost, padding: "5px 11px" }}>✕</button>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
            {(t.activity || []).length === 0 && (
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>No activity yet.</p>
            )}
            {(t.activity || []).map((a) =>
              a.type === "chat" ? (
                <div key={a.id} className="jjb-msg" style={{ padding: "9px 12px", background: a.email === me?.email ? "#eff6ff" : "#ffffff", border: "1px solid #eef0f3", borderRadius: "12px", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "2px", flexWrap: "wrap" }}>
                    <b style={{ fontSize: "11px", color: personColor(a.email) }}>{a.author}</b>
                    <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>{new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {a.edited && !a.deleted && <span style={{ fontSize: "10px", color: "#94a3b8" }}>(edited)</span>}
                    {a.deleted && me?.admin && <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "1px 7px", borderRadius: "999px" }}>deleted</span>}
                    <span className="jjb-acts" style={{ marginLeft: "auto", display: "flex", gap: "9px", transition: "opacity 0.15s" }}>
                      {!a.deleted && <a onClick={() => startReply(a)} style={actStyle}>Reply</a>}
                      {!a.deleted && a.email === me?.email && <a onClick={() => startEdit(a)} style={actStyle}>Edit</a>}
                      {!a.deleted && (a.email === me?.email || me?.admin) && <a onClick={() => deleteMsg(a)} style={{ ...actStyle, color: "#dc2626" }}>Delete</a>}
                    </span>
                  </div>
                  {a.replyTo && !a.deleted && (
                    <div style={{ borderLeft: "3px solid #c7d2fe", background: "#f8fafc", borderRadius: "6px", padding: "4px 9px", margin: "2px 0 6px 0" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#6366f1" }}>{a.replyTo.author}</div>
                      <div style={{ fontSize: "11px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.replyTo.text}</div>
                    </div>
                  )}
                  {a.deleted && !me?.admin ? (
                    <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>This message was deleted</div>
                  ) : (
                    <>
                      {a.text && (
                        <div style={{ fontSize: "12.5px", whiteSpace: "pre-wrap" }}><ChatText text={a.text} openTask={openTaskById} /></div>
                      )}
                      {a.attachment?.url &&
                        (a.attachment.kind === "image" ? (
                          <a href={a.attachment.url} target="_blank" rel="noreferrer">
                            <img src={a.attachment.url} alt={a.attachment.name} style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "8px", marginTop: "6px", display: "block" }} />
                          </a>
                        ) : a.attachment.kind === "audio" ? (
                          <VoiceNote url={a.attachment.url} transcript={a.attachment.transcript} />
                        ) : (
                          <a href={a.attachment.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", padding: "4px 10px", borderRadius: "8px", textDecoration: "none" }}>
                            📎 {a.attachment.name || "file"}
                          </a>
                        ))}
                    </>
                  )}
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

          {/* Tag-knoppen + input onderaan vastgepind */}
          <div style={{ padding: "10px 18px 16px 18px", borderTop: "1px solid #eef0f3", background: "#fafbfc" }}>
            <style>{`.jjb-msg .jjb-acts{opacity:0}.jjb-msg:hover .jjb-acts{opacity:1}`}</style>
            <ChatComposer team={team} me={me} taskOptions={taskOptions} value={chatInput} setValue={setChatInput} onSend={sendChat} onFile={sendFile} busy={chatBusy} dragActive={dragActive} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} editing={!!editingId} onCancelEdit={() => { setEditingId(null); setChatInput(""); }} />
          </div>
        </div>
      </div>
    </div>
  );
}
