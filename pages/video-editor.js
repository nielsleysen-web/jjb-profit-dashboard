// pages/video-editor.js
// Marketing Creatives — Video Editor worktable.
// Kanban pipeline, ClickUp-style task view, HeyGen avatar & ElevenLabs voice sync,
// subtitle styles with visual previews, activity log & chat with @mentions.

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

const STATUSES = ["Task Start", "Ready To Work", "QA Check", "Revisions", "Ready to launch", "Launched"];
const BOARD_STATUSES = STATUSES.slice(0, 5); // Launched verhuist naar het Launched-tabblad
const MARKETS = ["Italy", "France", "Israel"];
const CODES = ["IT", "FR", "IL"];
const MARKET_TO_CODE = { Italy: "IT", France: "FR", Israel: "IL" };
const GENDERS = ["Male", "Female"];
const AGE_RANGES = ["18-25", "25-40", "40-55", "55+"];
const TYPES = ["Net New", "Iteration"];
const VIDEO_ITERATIONS = ["Hood", "Lead", "A-roll", "B-roll", "Video format"];
const VIDEO_FORMATS = ["Short Form", "VSL", "UGC Yap", "Podcast Yap", "3D Animations"];
const AROLL_OPTIONS = ["Existing", "Net New", "Keep Current"];

// Subtitle-stijlen met visuele previews (base64, geïnjecteerd bij de build)
const SUBTITLE_STYLES = [{"name": "White Text, Shadowed Background", "img": "data:image/jpeg;base64,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"}, {"name": "Documentary Text", "img": "data:image/jpeg;base64,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"}, {"name": "TikTok Style", "img": "data:image/jpeg;base64,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"}, {"name": "TikTok Explanational", "img": "data:image/jpeg;base64,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"}];

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

// Naming: PRODUCT | CREATIVE STRATEGIST | ASSIGNEE | ANGLE | NET NEW/ITERATION | DEADLINE
const namingConvention = (t) =>
  [t.product?.title, firstName(t.strategistName), firstName(t.assigneeName), t.angle, t.type, fmtDeadlineDate(t.deadline)]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

const NAMING_FROM_STATUS = "Ready To Work";
const taskTitle = (t) => {
  const hasNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const naming = namingConvention(t);
  return hasNaming && naming ? naming : t.product?.title || "New video task";
};

export default function VideoEditor() {
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
  const isMobile = useIsMobile();

  const load = () =>
    fetch("/api/creative-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
        setStrategists(res.creativeStrategists);
        setEditors(res.videoEditors);
        setTeam(res.team);
        setMe(res.me);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const iv = setInterval(load, 45000);
    // HeyGen avatars + ElevenLabs voices (gecachet op de server)
    fetch("/api/heygen-avatars").then((r) => r.json()).then((res) => res?.success && setAvatars(res.avatars)).catch(() => {});
    fetch("/api/elevenlabs-voices").then((r) => r.json()).then((res) => res?.success && setVoices(res.voices)).catch(() => {});
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (payload) => {
    const res = await fetch("/api/creative-tasks", {
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

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 12px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>🎬 Video Editor</h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Marketing Creatives — {tasks.filter((t) => t.status !== "Launched").length} active tasks
          </p>
        </div>
        {me?.canEdit && (
          <button onClick={() => createTask("Task Start")} disabled={creating} style={btnPrimary}>
            {creating ? "Creating…" : "+ New task"}
          </button>
        )}
      </div>

      {/* Kanban */}
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", alignItems: "flex-start", paddingBottom: "16px", WebkitOverflowScrolling: "touch" }}>
        {BOARD_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          const columnTasks = tasks
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
                    style={{ ...ui.card, padding: "12px 14px", cursor: me?.canStatus ? "grab" : "pointer", opacity: dragId === t.id ? 0.4 : 1 }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      {t.product?.image && (
                        <img src={t.product.image} alt="" style={{ width: "34px", height: "34px", borderRadius: "8px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word" }}>{taskTitle(t)}</div>
                        {t.videoFormat && (
                          <div style={{ fontSize: "11px", color: "#8a92a3", marginTop: "2px" }}>{t.videoFormat}{t.type ? ` · ${t.type}` : ""}</div>
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
                        <span style={{ fontSize: "10.5px", fontWeight: 600, color: isOverdue(t.deadline, t.status) ? "#dc2626" : "#64748b", marginLeft: "auto" }}>
                          {fmtDeadline(t.deadline)}
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

/* ---------- subtitle-stijl dropdown met visuele previews ---------- */
function SubtitleDropdown({ value, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const selected = SUBTITLE_STYLES.find((s) => s.name === value) || null;

  if (disabled) return <span style={{ fontSize: "13px" }}>{value || "—"}</span>;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        style={{ ...ui.input, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {selected && <img src={selected.img} alt="" style={{ height: "22px", borderRadius: "4px", flexShrink: 0 }} />}
          <span style={{ fontWeight: 600, color: selected ? "#0f172a" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? selected.name : "Select subtitle style…"}
          </span>
        </span>
        <span style={{ color: "#94a3b8", fontSize: "10px", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "44px", left: 0, right: 0, background: "#ffffff", border: "1px solid #eceef2", borderRadius: "12px", boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: "8px", zIndex: 50, maxHeight: "320px", overflowY: "auto" }}>
            {SUBTITLE_STYLES.map((s) => (
              <div
                key={s.name}
                onClick={() => {
                  onSave(s.name);
                  setOpen(false);
                }}
                style={{ padding: "8px", borderRadius: "10px", cursor: "pointer", background: value === s.name ? "#eff6ff" : "transparent", marginBottom: "4px" }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: value === s.name ? "#1d4ed8" : "#334155", marginBottom: "5px" }}>{s.name}</div>
                <img src={s.img} alt={s.name} style={{ width: "100%", borderRadius: "8px", display: "block" }} />
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
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px", color: isOverdue(t.deadline, t.status) ? "#dc2626" : "#0f172a" }}>
                    {t.deadline ? fmtDeadline(t.deadline) : "—"}
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
                <div style={ui.label}>Assignee (Video Editor)</div>
                {canEdit ? (
                  <select
                    value={t.assigneeEmail || ""}
                    onChange={(e) => {
                      const u = editors.find((x) => x.email === e.target.value);
                      post({ action: "update", taskId: t.id, task: { assigneeEmail: e.target.value, assigneeName: u?.name || "" } });
                    }}
                    style={{ ...selectStyle, marginTop: "4px" }}
                  >
                    <option value="">— Select video editor —</option>
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

            {/* Video */}
            <Section title="🎬 Video">
              <Field label="Angle">
                <TextField value={t.angle} disabled={!canEdit} onSave={(v) => save("angle", v)} />
              </Field>
              <Field label="Advertorial Link">
                <TextField value={t.advertorialLink} disabled={!canEdit} onSave={(v) => save("advertorialLink", v)} type="url" placeholder="https://…" />
              </Field>
              <Field label="Net New / Iteration">
                <SelectField value={t.type} options={TYPES} onSave={(v) => save("type", v)} disabled={!canEdit} />
              </Field>
              {t.type === "Iteration" && (
                <Field label="Video Iteration">
                  <SelectField value={t.videoIteration} options={VIDEO_ITERATIONS} onSave={(v) => save("videoIteration", v)} disabled={!canEdit} />
                </Field>
              )}
              <Field label="Video Inspiration Link">
                <TextField value={t.inspirationLink} disabled={!canEdit} onSave={(v) => save("inspirationLink", v)} type="url" placeholder="https://…" />
              </Field>
              <Field label="Video Format" last>
                <SelectField value={t.videoFormat} options={VIDEO_FORMATS} onSave={(v) => save("videoFormat", v)} disabled={!canEdit} />
              </Field>
            </Section>

            {/* A-Roll & Voice */}
            <Section title="🧑‍🎤 A-Roll & Voice">
              <Field label="A-Roll">
                <SelectField value={t.aRoll} options={AROLL_OPTIONS} onSave={(v) => save("aRoll", v)} disabled={!canEdit} />
              </Field>
              {t.aRoll === "Existing" && (
                <Field label="Avatar (HeyGen)">
                  {canEdit ? (
                    <select
                      value={t.aRollAvatarId || ""}
                      onChange={(e) => {
                        const a = avatars.find((x) => x.id === e.target.value);
                        post({ action: "update", taskId: t.id, task: { aRollAvatarId: e.target.value, aRollAvatarName: a?.name || "" } });
                      }}
                      style={selectStyle}
                    >
                      <option value="">{avatars.length ? "— Select avatar —" : "No avatars synced — check HEYGEN_API_KEY"}</option>
                      {avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: "13px" }}>{t.aRollAvatarName || "—"}</span>
                  )}
                </Field>
              )}
              {t.aRoll === "Net New" && (
                <Field label="New A-Roll Link">
                  <TextField value={t.aRollLink} disabled={!canEdit} onSave={(v) => save("aRollLink", v)} type="url" placeholder="https://…" />
                </Field>
              )}
              <Field label="ElevenLabs Voice">
                {canEdit ? (
                  <select
                    value={t.voiceId || ""}
                    onChange={(e) => {
                      const v = voices.find((x) => x.id === e.target.value);
                      post({ action: "update", taskId: t.id, task: { voiceId: e.target.value, voiceName: v?.name || "" } });
                    }}
                    style={selectStyle}
                  >
                    <option value="">{voices.length ? "— Select voice —" : "No voices synced — check ELEVENLABS_API_KEY"}</option>
                    {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.voiceName || "—"}</span>
                )}
              </Field>
              <Field label="Type Subtitles" last>
                <SubtitleDropdown value={t.subtitles} onSave={(v) => save("subtitles", v)} disabled={!canEdit} />
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
        </div>

        {/* ===== Rechts: activity + chat ===== */}
        <div style={{ flex: 1, background: "#fafbfc", borderLeft: isMobile ? "none" : "1px solid #eceef2", borderTop: isMobile ? "1px solid #eceef2" : "none", display: "flex", flexDirection: "column", minWidth: 0, minHeight: isMobile ? "280px" : "auto", maxWidth: isMobile ? "none" : "420px" }}>
          <div style={{ padding: "16px 18px 10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eef0f3" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Activity</span>
            {!isMobile && <button onClick={onClose} style={{ ...btnGhost, padding: "5px 11px" }}>✕</button>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
            {(t.activity || []).length === 0 && <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>No activity yet.</p>}
            {(t.activity || []).map((a) =>
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
