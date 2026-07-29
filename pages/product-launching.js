// pages/product-launching.js
// Product Launching Department — kanban pipeline for funnel builders.
// Columns per status, task popup with fields + activity log & chat with @mentions.

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

export default function ProductLaunching() {
  const [tasks, setTasks] = useState([]);
  const [funnelBuilders, setFunnelBuilders] = useState([]);
  const [team, setTeam] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openTaskId, setOpenTaskId] = useState(null);
  const [createInStatus, setCreateInStatus] = useState(null);
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
          <button onClick={() => setCreateInStatus("Task Start")} style={btnPrimary}>+ New product</button>
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
            <div key={status} style={{ minWidth: isMobile ? "250px" : "272px", width: isMobile ? "250px" : "272px", flexShrink: 0 }}>
              {/* Kolomkop */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "0 2px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: meta.color, background: meta.bg, padding: "4px 10px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {status}
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b" }}>{columnTasks.length}</span>
              </div>

              {/* Kaarten */}
              <div style={{ display: "grid", gap: "8px" }}>
                {columnTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setOpenTaskId(t.id)}
                    style={{ ...ui.card, padding: "12px 14px", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: 700, lineHeight: 1.4 }}>{t.productName}</div>
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
                    onClick={() => setCreateInStatus(status)}
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

      {/* Task popup */}
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

      {/* Create popup */}
      {createInStatus && me?.canEdit && (
        <CreateModal
          defaultStatus={createInStatus}
          funnelBuilders={funnelBuilders}
          onClose={() => setCreateInStatus(null)}
          onCreate={async (data) => {
            const ok = await post({ action: "create", task: data });
            if (ok) setCreateInStatus(null);
          }}
        />
      )}
    </div>
  );
}

/* ================= veld-componenten ================= */

function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "10px", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f4f5f7" }}>
      <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>{label}</span>
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

/* ================= task popup ================= */

function TaskModal({ t, me, funnelBuilders, team, post, onClose, isMobile }) {
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const naming = namingConvention(t);
  const showNaming = STATUSES.indexOf(t.status) >= STATUSES.indexOf("Ready For Build");
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
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: isMobile ? "1vh" : "3vh", zIndex: 100, overflowY: "auto" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#ffffff", borderRadius: "18px", width: "min(980px, 96vw)", boxShadow: "0 24px 60px rgba(15,23,42,0.3)", marginBottom: "3vh", display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== Linkerkant: velden ===== */}
        <div style={{ flex: 1.2, padding: isMobile ? "18px" : "24px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "14px" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{t.productName}</h2>
              <span style={{ display: "inline-block", marginTop: "6px", fontSize: "11px", fontWeight: 700, color: STATUS_META[t.status]?.color, background: STATUS_META[t.status]?.bg, padding: "3px 11px", borderRadius: "999px", textTransform: "uppercase" }}>
                {t.status}
              </span>
            </div>
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

          {/* Naming convention */}
          {showNaming && naming && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "8px 12px", marginBottom: "12px" }}>
              <code style={{ fontSize: "11.5px", color: "#334155", flex: 1, overflowX: "auto", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace" }}>{naming}</code>
              <button onClick={copyNaming} style={{ ...btnGhost, padding: "4px 10px", fontSize: "11px", flexShrink: 0, background: copied ? "#dcfce7" : "#fff", color: copied ? "#166534" : "#334155" }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          )}

          {/* Velden */}
          <Field label="Product Name">
            <TextField value={t.productName} disabled={!canEdit} onSave={(v) => save("productName", v)} />
          </Field>
          <Field label="Status">
            <select value={t.status} disabled={!me?.canStatus} onChange={(e) => post({ action: "status", taskId: t.id, status: e.target.value })} style={selectStyle}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Deadline">
            {canEdit ? (
              <input
                type="datetime-local"
                style={selectStyle}
                value={isoToLocalInput(t.deadline)}
                onChange={(e) => save("deadline", localInputToIso(e.target.value))}
              />
            ) : (
              <span style={{ fontSize: "13px", color: isOverdue(t.deadline, t.status) ? "#dc2626" : "#0f172a" }}>
                {t.deadline ? `${fmtDeadline(t.deadline)} (your timezone)` : "—"}
              </span>
            )}
          </Field>
          <Field label="Assignee">
            {canEdit ? (
              <select
                value={t.assigneeEmail || ""}
                onChange={(e) => {
                  const fb = funnelBuilders.find((u) => u.email === e.target.value);
                  post({ action: "update", taskId: t.id, task: { assigneeEmail: e.target.value, assigneeName: fb?.name || "" } });
                }}
                style={selectStyle}
              >
                <option value="">— Select funnel builder —</option>
                {funnelBuilders.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: "13px" }}>{t.assigneeName || "—"}</span>
            )}
          </Field>
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
          <Field label="Funnel Angle">
            <TextField value={t.funnelAngle} disabled={!canEdit} onSave={(v) => save("funnelAngle", v)} />
          </Field>
          <Field label="Advertorial Link">
            <TextField value={t.advertorialLink} disabled={!canEdit} onSave={(v) => save("advertorialLink", v)} type="url" />
          </Field>
          <Field label="Alibaba Link">
            <TextField value={t.alibabaLink} disabled={!canEdit} onSave={(v) => save("alibabaLink", v)} type="url" />
          </Field>
          <Field label="Funnelish Link">
            <TextField value={t.funnelishLink} disabled={!canEdit} onSave={(v) => save("funnelishLink", v)} type="url" />
          </Field>
          <Field label="First Creative Batch">
            <TextField value={t.firstCreativeBatch} disabled={!canEdit} onSave={(v) => save("firstCreativeBatch", v)} placeholder="Headlines via Stefan's Brain — automation coming soon" />
          </Field>
          <Field label="Ready for AI Translation">
            {canEdit ? (
              <select value={t.readyForAI || "NO"} onChange={(e) => save("readyForAI", e.target.value)} style={selectStyle}>
                <option>NO</option>
                <option>YES</option>
              </select>
            ) : (
              <span style={{ fontSize: "13px" }}>{t.readyForAI || "NO"}</span>
            )}
          </Field>

          {/* AI copy */}
          <div style={{ marginTop: "14px" }}>
            <div style={{ ...ui.label, marginBottom: "6px" }}>AI Copy</div>
            {t.aiCopy ? (
              <div style={{ background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: "10px", padding: "12px" }}>
                <pre style={{ margin: 0, fontSize: "12px", whiteSpace: "pre-wrap", fontFamily: "inherit", maxHeight: "180px", overflowY: "auto" }}>{t.aiCopy}</pre>
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
                AI-generated copy will appear here once the ChatGPT automation is connected (phase 2).
              </p>
            )}
          </div>

          {t.launchedDate && (
            <div style={{ marginTop: "12px", fontSize: "12.5px", color: "#166534", fontWeight: 600 }}>
              🚀 Launched {new Date(t.launchedDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>

        {/* ===== Rechterkant: activity log + chat ===== */}
        <div style={{ flex: 1, background: "#fafbfc", borderLeft: isMobile ? "none" : "1px solid #eceef2", borderTop: isMobile ? "1px solid #eceef2" : "none", display: "flex", flexDirection: "column", minWidth: 0, maxHeight: isMobile ? "420px" : "none" }}>
          <div style={{ padding: "16px 18px 10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Activity</span>
            {!isMobile && <button onClick={onClose} style={{ ...btnGhost, padding: "5px 11px" }}>✕</button>}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 18px", minHeight: isMobile ? "200px" : "380px", maxHeight: isMobile ? "260px" : "480px" }}>
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

          {/* Tag-knoppen + input */}
          <div style={{ padding: "10px 18px 16px 18px" }}>
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
                placeholder="Write a message… tag with @Name"
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

/* ================= create popup ================= */

function CreateModal({ defaultStatus, funnelBuilders, onClose, onCreate }) {
  const [form, setForm] = useState({
    productName: "",
    deadline: "",
    assigneeEmail: "",
    assigneeName: "",
    status: defaultStatus,
    advertorialLink: "",
    marketCountry: "",
    countryCode: "",
    funnelAngle: "",
    alibabaLink: "",
    funnelishLink: "",
    readyForAI: "NO",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.productName.trim()) {
      alert("Product Name is required");
      return;
    }
    setSaving(true);
    await onCreate({ ...form, deadline: form.deadline ? localInputToIso(form.deadline) : "" });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "4vh", zIndex: 110, overflowY: "auto" }} onClick={onClose}>
      <div style={{ background: "#ffffff", borderRadius: "18px", width: "min(560px, 94vw)", padding: "24px", boxShadow: "0 24px 60px rgba(15,23,42,0.25)", marginBottom: "4vh" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>New product</h2>
          <button onClick={onClose} style={{ ...btnGhost, padding: "6px 12px" }}>✕</button>
        </div>

        <div style={{ display: "grid", gap: "11px" }}>
          <div>
            <div style={{ ...ui.label, marginBottom: "5px" }}>Product Name *</div>
            <input style={ui.input} value={form.productName} onChange={(e) => set("productName", e.target.value)} autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Deadline (your timezone)</div>
              <input type="datetime-local" style={ui.input} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Assignee</div>
              <select
                style={ui.input}
                value={form.assigneeEmail}
                onChange={(e) => {
                  const fb = funnelBuilders.find((u) => u.email === e.target.value);
                  setForm((f) => ({ ...f, assigneeEmail: e.target.value, assigneeName: fb?.name || "" }));
                }}
              >
                <option value="">— Select funnel builder —</option>
                {funnelBuilders.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "11px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Market Country</div>
              <select style={ui.input} value={form.marketCountry} onChange={(e) => setForm((f) => ({ ...f, marketCountry: e.target.value, countryCode: MARKET_TO_CODE[e.target.value] || "" }))}>
                <option value="">—</option>
                {MARKETS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Country Code</div>
              <select style={ui.input} value={form.countryCode} onChange={(e) => set("countryCode", e.target.value)}>
                <option value="">—</option>
                {CODES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Status</div>
              <select style={ui.input} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ ...ui.label, marginBottom: "5px" }}>Funnel Angle</div>
            <input style={ui.input} value={form.funnelAngle} onChange={(e) => set("funnelAngle", e.target.value)} />
          </div>
          <div>
            <div style={{ ...ui.label, marginBottom: "5px" }}>Advertorial Link</div>
            <input style={ui.input} placeholder="https://…" value={form.advertorialLink} onChange={(e) => set("advertorialLink", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px" }}>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Alibaba Link</div>
              <input style={ui.input} placeholder="https://…" value={form.alibabaLink} onChange={(e) => set("alibabaLink", e.target.value)} />
            </div>
            <div>
              <div style={{ ...ui.label, marginBottom: "5px" }}>Funnelish Link</div>
              <input style={ui.input} placeholder="https://…" value={form.funnelishLink} onChange={(e) => set("funnelishLink", e.target.value)} />
            </div>
          </div>
          <div>
            <div style={{ ...ui.label, marginBottom: "5px" }}>Ready for AI Translation</div>
            <select style={ui.input} value={form.readyForAI} onChange={(e) => set("readyForAI", e.target.value)}>
              <option>NO</option>
              <option>YES</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={submit} disabled={saving} style={btnPrimary}>{saving ? "Creating…" : "Create task"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
