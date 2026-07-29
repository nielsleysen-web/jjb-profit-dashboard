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

const STATUSES = ["Task Start", "AI Translation", "Ready For Build", "QA Check", "First Creative Batch", "Ready to launch", "Launched"];
const BOARD_STATUSES = STATUSES.slice(0, 6); // Launched verhuist naar het Launched-tabblad
const MARKETS = ["Italy", "France", "Israel"];
const CODES = ["IT", "FR", "IL"];
const MARKET_TO_CODE = { Italy: "IT", France: "FR", Israel: "IL" };

const STATUS_META = {
  "Task Start": { color: "#c2410c", bg: "#ffedd5" },
  "AI Translation": { color: "#7c3aed", bg: "#ede9fe" },
  "Ready For Build": { color: "#1d4ed8", bg: "#dbeafe" },
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

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 12px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>🚀 Product Pipeline</h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            Product Launching Department — {tasks.filter((t) => t.status !== "Launched").length} active tasks
          </p>
        </div>
        {me?.canEdit && (
          <button onClick={() => createTask("Task Start")} disabled={creating} style={btnPrimary}>
            {creating ? "Creating…" : "+ New product"}
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
                    }}
                  >
                    <div style={{ fontSize: "12.5px", fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word" }}>{taskTitle(t)}</div>
                    {t.funnelAngle && (
                      <div style={{ fontSize: "11.5px", color: "#8a92a3", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.funnelAngle}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                      {t.countryCode && (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#334155", background: "#f1f5f9", padding: "2px 7px", borderRadius: "999px" }}>
                          {t.countryCode}
                        </span>
                      )}
                      {t.readyForAI === "YES" && (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", background: "#ede9fe", padding: "2px 7px", borderRadius: "999px" }}>
                          AI
                        </span>
                      )}
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

      {/* Grote taakweergave */}
      {openTask && (
        <TaskModal
          t={openTask}
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

function TaskModal({ t, me, funnelBuilders, team, post, onClose, isMobile }) {
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const naming = namingConvention(t);
  const showNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf(NAMING_FROM_STATUS);
  const canEdit = me?.canEdit;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [t.activity?.length]);

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
                <select value={t.status} disabled={!me?.canStatus} onChange={(e) => post({ action: "status", taskId: t.id, status: e.target.value })} style={{ ...selectStyle, marginTop: "4px", fontWeight: 700 }}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
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
                  <input
                    type="datetime-local"
                    style={{ ...selectStyle, marginTop: "4px" }}
                    value={isoToLocalInput(t.deadline)}
                    onChange={(e) => save("deadline", localInputToIso(e.target.value))}
                  />
                ) : (
                  <div style={{ fontSize: "13.5px", fontWeight: 700, marginTop: "6px", color: isOverdue(t.deadline, t.status) ? "#dc2626" : "#0f172a" }}>
                    {t.deadline ? fmtDeadline(t.deadline) : "—"}
                  </div>
                )}
              </div>
            </div>

            {/* ===== Sectie: Product ===== */}
            <Section title="📦 Product">
              <Field label="Product Name" last>
                <TextField value={t.productName} disabled={!canEdit} onSave={(v) => save("productName", v)} placeholder="e.g. CircuMax Patches" />
              </Field>
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
              <Field label="Country Code" last>
                {canEdit ? (
                  <select value={t.countryCode || ""} onChange={(e) => save("countryCode", e.target.value)} style={selectStyle}>
                    <option value="">—</option>
                    {CODES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.countryCode || "—"}</span>
                )}
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
              <Field label="Alibaba Link" last>
                <TextField value={t.alibabaLink} disabled={!canEdit} onSave={(v) => save("alibabaLink", v)} type="url" placeholder="https://…" />
              </Field>
            </Section>

            {/* ===== Sectie: AI Translation ===== */}
            <Section title="🤖 AI Translation">
              <Field label="Ready for AI Translation" last>
                {canEdit ? (
                  <select value={t.readyForAI || "NO"} onChange={(e) => save("readyForAI", e.target.value)} style={selectStyle}>
                    <option>NO</option>
                    <option>YES</option>
                  </select>
                ) : (
                  <span style={{ fontSize: "13px" }}>{t.readyForAI || "NO"}</span>
                )}
              </Field>
              <div style={{ padding: "10px 0 2px 0" }}>
                <div style={{ ...ui.label, marginBottom: "6px" }}>Sales Page Copy</div>
                {t.aiCopy ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px" }}>
                    <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "200px", overflowY: "auto" }}>{t.aiCopy}</pre>
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(t.aiCopy)}`}
                      download={`${naming || t.productName}.txt`}
                      style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", fontWeight: 700, color: "#3b82f6" }}
                    >
                      ⬇ Download .txt
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                    The AI-generated sales page copy will appear here once the ChatGPT automation is connected (phase 2).
                  </p>
                )}
              </div>
            </Section>

            {/* ===== Sectie: Funnel Name + Funnelish Link (final output) ===== */}
            <Section title="🏷 Funnel Name">
              {showNaming && naming ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
                  <code style={{ fontSize: "12px", color: "#0f172a", fontWeight: 600, flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{naming}</code>
                  <button onClick={copyNaming} style={{ ...btnGhost, padding: "5px 12px", fontSize: "11.5px", flexShrink: 0, background: copied ? "#dcfce7" : "#fff", color: copied ? "#166534" : "#334155" }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                  The funnel name is generated automatically once the status reaches "AI Translation".
                </p>
              )}
              <Field label="Funnelish Link" last>
                <TextField value={t.funnelishLink} disabled={!canEdit} onSave={(v) => save("funnelishLink", v)} type="url" placeholder="Final output of the funnel builder — https://…" />
              </Field>
              {t.launchedDate && (
                <div style={{ marginTop: "10px", fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
                  🚀 Launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </Section>

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

          {/* Tag-knoppen + input onderaan vastgepind */}
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
