// components/MarketingBoard.js
// Shared board component for the Marketing workflow pages.
// v2: tasks grouped by SPOC, click opens a detail popup, briefing/script links,
// Frame.io required, compact rows.

import { useState, useEffect, useRef } from "react";

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
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid #e2e6ec",
    borderRadius: "10px",
    fontSize: "13.5px",
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

const STATUSES = ["Ready to work", "In production", "QA Check", "Ready to launch", "Launched"];
const HIDDEN_STATUSES = ["Ready to launch", "Launched"];
const FORMATS = ["VSL", "UGC", "3D", "Single image", "Before & After", "Swipe"];
const TYPES = ["Net New", "Iteration"];

const STATUS_COLORS = {
  "Ready to work": { color: "#1d4ed8", bg: "#dbeafe" },
  "In production": { color: "#b45309", bg: "#fef3c7" },
  "QA Check": { color: "#7c3aed", bg: "#ede9fe" },
  "Ready to launch": { color: "#0f766e", bg: "#ccfbf1" },
  "Launched": { color: "#166534", bg: "#dcfce7" },
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

const namingConvention = (t) =>
  [t.product?.title, t.angle, fmtDate(t.deadline), firstName(t.spocName), t.type, t.format]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" | ");

const isOverdue = (deadline) => {
  if (!deadline) return false;
  return deadline < new Date().toISOString().split("T")[0];
};

export default function MarketingBoard({ status, title, icon, showHidden }) {
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const isMobile = useIsMobile();

  const load = () =>
    fetch("/api/marketing-tasks")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setTasks(res.tasks);
        setTeam(res.team);
        setMe(res.me);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (payload) => {
    const res = await fetch("/api/marketing-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());
    if (!res.success) {
      alert(res.error || "Something went wrong");
      return false;
    }
    setTasks(res.tasks);
    return true;
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

  let visible = tasks.filter((t) => t.status === status);
  if (onlyMine && me) visible = visible.filter((t) => t.spocEmail === me.email);

  // Groepeer per SPOC, gesorteerd op naam; binnen elke groep op deadline
  const groups = {};
  for (const t of visible) {
    const key = t.spocName || "Unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const groupNames = Object.keys(groups).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });
  for (const g of groupNames) {
    groups[g].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  }

  const hiddenTasks = tasks.filter((t) => HIDDEN_STATUSES.includes(t.status));
  const openTask = tasks.find((t) => t.id === openTaskId) || null;

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 14px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>
            {icon} {title}
            <span style={{ marginLeft: "10px", fontSize: "14px", fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "3px 12px", borderRadius: "999px", verticalAlign: "middle" }}>
              {visible.length}
            </span>
          </h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Grouped by SPOC{onlyMine ? " — showing only your tasks" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => setOnlyMine(!onlyMine)}
            style={{ ...btnGhost, background: onlyMine ? "#0f172a" : "#ffffff", color: onlyMine ? "#ffffff" : "#334155" }}
          >
            My tasks
          </button>
          {me?.admin && (
            <button onClick={() => { setEditTask(null); setShowForm(true); }} style={btnPrimary}>
              + New task
            </button>
          )}
        </div>
      </div>

      {/* Tasks per SPOC */}
      {visible.length === 0 ? (
        <div style={{ ...ui.card, padding: "48px", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#8a92a3", fontSize: "13.5px" }}>
            No tasks in "{status}"{onlyMine ? " assigned to you" : ""} right now. 🎉
          </p>
        </div>
      ) : (
        groupNames.map((g) => (
          <div key={g} style={{ marginBottom: "22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "999px", background: g === "Unassigned" ? "#e2e8f0" : "#0f172a", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700 }}>
                {g === "Unassigned" ? "?" : g.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                {g}{me && groups[g][0]?.spocEmail === me.email ? " (you)" : ""}
              </span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", background: "#eef2f7", padding: "1px 9px", borderRadius: "999px" }}>
                {groups[g].length}
              </span>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {groups[g].map((t) => (
                <TaskRow key={t.id} t={t} me={me} onOpen={() => setOpenTaskId(t.id)} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Verborgen taken — alleen admin, alleen op QA-pagina */}
      {showHidden && me?.admin && hiddenTasks.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <button onClick={() => setHiddenOpen(!hiddenOpen)} style={{ ...btnGhost, color: "#8a92a3" }}>
            {hiddenOpen ? "▲" : "▼"} {hiddenTasks.length} hidden task{hiddenTasks.length !== 1 ? "s" : ""} (Ready to launch / Launched)
          </button>
          {hiddenOpen && (
            <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
              {hiddenTasks.map((t) => (
                <div key={t.id} style={{ ...ui.card, padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, flex: 1, minWidth: "160px" }}>{t.product?.title} — {t.angle}</span>
                  <StatusBadge status={t.status} />
                  {t.launchedDate && (
                    <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>
                      launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <select
                    value={t.status}
                    onChange={(e) => post({ action: "status", taskId: t.id, status: e.target.value })}
                    style={{ ...ui.input, width: "auto", padding: "6px 8px", fontSize: "12px" }}
                  >
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task detail popup */}
      {openTask && (
        <TaskModal
          t={openTask}
          me={me}
          post={post}
          onClose={() => setOpenTaskId(null)}
          onEdit={() => { setEditTask(openTask); setShowForm(true); }}
          isMobile={isMobile}
        />
      )}

      {/* Create / edit form (admin) */}
      {showForm && me?.admin && (
        <TaskForm
          existing={editTask}
          team={team}
          defaultStatus={status}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            const ok = editTask
              ? await post({ action: "update", taskId: editTask.id, task: data })
              : await post({ action: "create", task: data });
            if (ok) setShowForm(false);
          }}
          onDelete={
            editTask
              ? async () => {
                  if (!confirm("Delete this task?")) return;
                  const ok = await post({ action: "delete", taskId: editTask.id });
                  if (ok) { setShowForm(false); setOpenTaskId(null); }
                }
              : null
          }
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS["Ready to work"];
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color: c.color, background: c.bg, padding: "3px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

/* ================= compacte taak-rij (klikbaar) ================= */

function TaskRow({ t, me, onOpen }) {
  const overdue = isOverdue(t.deadline) && t.status !== "Launched";
  return (
    <div
      onClick={onOpen}
      style={{ ...ui.card, padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", flexWrap: "wrap" }}
    >
      {t.product?.image ? (
        <img src={t.product.image} alt="" style={{ width: "40px", height: "40px", borderRadius: "10px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
      ) : (
        <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>🎬</div>
      )}
      <div style={{ flex: 1, minWidth: "180px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700 }}>
          {t.product?.title}
          {t.angle && <span style={{ color: "#64748b", fontWeight: 500 }}> — {t.angle}</span>}
        </div>
        <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "2px" }}>
          {t.format} · {t.type}
          {t.chat?.length > 0 && ` · 💬 ${t.chat.length}`}
        </div>
      </div>
      {t.deadline && (
        <span style={{ fontSize: "12px", fontWeight: 600, color: overdue ? "#dc2626" : "#64748b", flexShrink: 0 }}>
          📅 {fmtDate(t.deadline)}{overdue ? " ⚠" : ""}
        </span>
      )}
      <span style={{ color: "#cbd5e1", fontSize: "14px", flexShrink: 0 }}>→</span>
    </div>
  );
}

/* ================= detail popup ================= */

function LinkRow({ label, url, required }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f4f5f7" }}>
      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#64748b" }}>{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: "12.5px", fontWeight: 700, color: "#3b82f6", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Open ↗
        </a>
      ) : (
        <span style={{ fontSize: "12px", color: required ? "#dc2626" : "#cbd5e1", fontWeight: required ? 700 : 500 }}>
          {required ? "Required — missing" : "—"}
        </span>
      )}
    </div>
  );
}

function TaskModal({ t, me, post, onClose, onEdit, isMobile }) {
  const [chatInput, setChatInput] = useState("");
  const [frameioEdit, setFrameioEdit] = useState(false);
  const [frameioVal, setFrameioVal] = useState(t.frameioLink || "");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const naming = namingConvention(t);
  const overdue = isOverdue(t.deadline) && t.status !== "Launched";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [t.chat?.length]);

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

  const saveFrameio = async () => {
    const ok = await post({ action: "frameio", taskId: t.id, frameioLink: frameioVal.trim() });
    if (ok) setFrameioEdit(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: isMobile ? "2vh" : "5vh", zIndex: 100, overflowY: "auto" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#ffffff", borderRadius: "18px", width: "min(620px, 94vw)", padding: isMobile ? "18px" : "26px", boxShadow: "0 24px 60px rgba(15,23,42,0.3)", marginBottom: "5vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
          {t.product?.image ? (
            <img src={t.product.image} alt="" style={{ width: "56px", height: "56px", borderRadius: "14px", objectFit: "cover", border: "1px solid #eceef2", flexShrink: 0 }} />
          ) : (
            <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 }}>🎬</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{t.product?.title}</h2>
            {t.angle && <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748b" }}>{t.angle}</p>}
            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <StatusBadge status={t.status} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", background: "#f1f5f9", padding: "3px 10px", borderRadius: "999px" }}>{t.format}</span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: t.type === "Net New" ? "#1d4ed8" : "#b45309", background: t.type === "Net New" ? "#dbeafe" : "#fef3c7", padding: "3px 10px", borderRadius: "999px" }}>{t.type}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px", flexShrink: 0 }}>✕</button>
        </div>

        {/* Kerninfo */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "10px 14px" }}>
            <div style={ui.label}>Deadline</div>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: overdue ? "#dc2626" : "#0f172a", marginTop: "3px" }}>
              {t.deadline ? fmtDate(t.deadline) : "—"}{overdue ? " ⚠" : ""}
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "10px 14px" }}>
            <div style={ui.label}>SPOC</div>
            <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "3px", color: me?.email === t.spocEmail ? "#3b82f6" : "#0f172a" }}>
              {t.spocName || "—"}{me?.email === t.spocEmail ? " (you)" : ""}
            </div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "10px 14px" }}>
            <div style={ui.label}>Status</div>
            <select
              value={t.status}
              onChange={(e) => post({ action: "status", taskId: t.id, status: e.target.value })}
              style={{ ...ui.input, padding: "5px 8px", fontSize: "12.5px", fontWeight: 700, marginTop: "3px" }}
            >
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Links */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ ...ui.label, marginBottom: "4px" }}>Links</div>
          <LinkRow label="🔗 Landing page" url={t.landingPage} />
          <LinkRow label="📋 Briefing Link" url={t.briefingLink} />
          {/* Frame.io — door team invulbaar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#64748b" }}>🎞 Frame.io</span>
            {frameioEdit ? (
              <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                <input
                  style={{ ...ui.input, width: "200px", padding: "6px 8px", fontSize: "12px" }}
                  placeholder="https://f.io/…"
                  value={frameioVal}
                  onChange={(e) => setFrameioVal(e.target.value)}
                  autoFocus
                />
                <button onClick={saveFrameio} style={{ ...btnPrimary, padding: "6px 10px", fontSize: "11.5px" }}>Save</button>
                <button onClick={() => setFrameioEdit(false)} style={{ ...btnGhost, padding: "6px 10px", fontSize: "11.5px" }}>✕</button>
              </span>
            ) : t.frameioLink ? (
              <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                <a href={t.frameioLink} target="_blank" rel="noreferrer" style={{ fontSize: "12.5px", fontWeight: 700, color: "#7c3aed" }}>Open ↗</a>
                <a onClick={() => setFrameioEdit(true)} style={{ color: "#94a3b8", cursor: "pointer", fontSize: "11px" }}>edit</a>
              </span>
            ) : (
              <a onClick={() => setFrameioEdit(true)} style={{ fontSize: "12px", fontWeight: 700, color: "#3b82f6", cursor: "pointer" }}>
                + Add link
              </a>
            )}
          </div>
          {t.launchedDate && (
            <div style={{ fontSize: "12px", color: "#166534", fontWeight: 600, marginTop: "4px" }}>
              🚀 Launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>

        {/* Naming convention */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "9px 12px", marginBottom: "16px" }}>
          <code style={{ fontSize: "11.5px", color: "#334155", flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>
            {naming}
          </code>
          <button onClick={copyNaming} style={{ ...btnGhost, padding: "5px 11px", fontSize: "11.5px", flexShrink: 0, background: copied ? "#dcfce7" : "#ffffff", color: copied ? "#166534" : "#334155" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Chat */}
        <div style={{ ...ui.label, marginBottom: "6px" }}>💬 Feedback</div>
        <div style={{ maxHeight: "220px", overflowY: "auto", marginBottom: "8px" }}>
          {(t.chat || []).length === 0 && (
            <p style={{ fontSize: "12.5px", color: "#94a3b8", margin: "4px 0 8px 0" }}>No feedback yet.</p>
          )}
          {(t.chat || []).map((m) => (
            <div key={m.id} style={{ padding: "8px 12px", background: m.email === me?.email ? "#eff6ff" : "#f8fafc", borderRadius: "10px", marginBottom: "6px" }}>
              <div style={{ fontSize: "11px", color: "#8a92a3", marginBottom: "2px" }}>
                <b style={{ color: "#334155" }}>{m.author}</b> · {new Date(m.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: "13px", color: "#0f172a", whiteSpace: "pre-wrap" }}>{m.text}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            style={{ ...ui.input, flex: 1 }}
            placeholder="Write feedback or a note…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
          />
          <button onClick={sendChat} style={btnPrimary}>Send</button>
        </div>

        {/* Admin acties */}
        {me?.admin && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
            <button onClick={onEdit} style={btnGhost}>Edit task</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= create / edit form (admin) ================= */

function TaskForm({ existing, team, defaultStatus, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(
    existing
      ? { ...existing }
      : {
          product: null,
          angle: "",
          landingPage: "",
          briefingLink: "",
          deadline: "",
          spocEmail: "",
          spocName: "",
          type: "Net New",
          format: "UGC",
          frameioLink: "",
          status: defaultStatus || "Ready to work",
        }
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

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

  const save = async () => {
    if (!form.product?.title) {
      alert("Select a product first");
      return;
    }
    setSaving(true);
    await onSave({
      product: { title: form.product.title, image: form.product.image || null },
      angle: form.angle,
      landingPage: form.landingPage,
      briefingLink: form.briefingLink,
      deadline: form.deadline,
      spocEmail: form.spocEmail,
      spocName: form.spocName,
      type: form.type,
      format: form.format,
      frameioLink: form.frameioLink,
      status: form.status,
    });
    setSaving(false);
  };

  const preview = namingConvention(form);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "4vh", zIndex: 110, overflowY: "auto" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#ffffff", borderRadius: "18px", width: "min(640px, 94vw)", padding: "24px", boxShadow: "0 24px 60px rgba(15,23,42,0.25)", marginBottom: "4vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{existing ? "Edit task" : "New task"}</h2>
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          {/* Product */}
          <div>
            <div style={{ ...ui.label, marginBottom: "6px" }}>Product</div>
            {form.product ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", borderRadius: "10px", padding: "8px 12px" }}>
                {form.product.image && <img src={form.product.image} alt="" style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "cover" }} />}
                <span style={{ fontSize: "13.5px", fontWeight: 700, flex: 1 }}>{form.product.title}</span>
                <a onClick={() => setForm({ ...form, product: null })} style={{ color: "#94a3b8", cursor: "pointer", fontSize: "12px" }}>change</a>
              </div>
            ) : (
              <>
                <input
                  style={ui.input}
                  placeholder="Search your Shopify products…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {searching && <p style={{ fontSize: "12px", color: "#8a92a3", margin: "6px 0 0 0" }}>Searching…</p>}
                {results.length > 0 && (
                  <div style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
                    {results.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setForm({ ...form, product: { title: p.title, image: p.image } }); setQuery(""); setResults([]); }}
                        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: "#ffffff", border: "1px solid #eef0f3", borderRadius: "10px", cursor: "pointer", textAlign: "left", fontSize: "13px" }}
                      >
                        {p.image ? <img src={p.image} alt="" style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "cover" }} /> : <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f1f5f9" }} />}
                        <span style={{ fontWeight: 600 }}>{p.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <div style={{ ...ui.label, marginBottom: "6px" }}>Angle</div>
            <input style={ui.input} placeholder="e.g. Pain relief, Social proof…" value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Landing page</div>
              <input style={ui.input} placeholder="https://…" value={form.landingPage} onChange={(e) => setForm({ ...form, landingPage: e.target.value })} />
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Briefing Link</div>
              <input style={ui.input} placeholder="https://…" value={form.briefingLink} onChange={(e) => setForm({ ...form, briefingLink: e.target.value })} />
            </div>
          </div>

          <div>
            <div style={{ ...ui.label, marginBottom: "6px" }}>Frame.io link</div>
            <input style={ui.input} placeholder="https://f.io/…" value={form.frameioLink} onChange={(e) => setForm({ ...form, frameioLink: e.target.value })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Deadline</div>
              <input type="date" style={ui.input} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>SPOC</div>
              <select
                style={ui.input}
                value={form.spocEmail}
                onChange={(e) => {
                  const member = team.find((u) => u.email === e.target.value);
                  setForm({ ...form, spocEmail: e.target.value, spocName: member?.name || "" });
                }}
              >
                <option value="">— Select —</option>
                {team.map((u) => (
                  <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Net New / Iteration</div>
              <select style={ui.input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Format</div>
              <select style={ui.input} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {FORMATS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "6px" }}>Status</div>
              <select style={ui.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {preview && (
            <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "9px 12px" }}>
              <div style={{ ...ui.label, marginBottom: "4px" }}>Naming convention</div>
              <code style={{ fontSize: "12px", color: "#334155", fontFamily: "ui-monospace, monospace" }}>{preview}</code>
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
            {onDelete ? (
              <button onClick={onDelete} style={{ ...btnGhost, color: "#dc2626", borderColor: "#fecaca" }}>Delete</button>
            ) : <span />}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={onClose} style={btnGhost}>Cancel</button>
              <button onClick={save} disabled={saving} style={btnPrimary}>
                {saving ? "Saving…" : existing ? "Save changes" : "Create task"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
