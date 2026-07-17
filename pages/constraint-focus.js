// pages/constraint-focus.js
// Constraint Focus — vind de main constraint, rank hypotheses op ICE-score,
// werk taken af, review op deadline (Google Agenda) en sluit af met feedback.
// Extra wachtwoord-laag bovenop de normale login. Data synct via Shopify.

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

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function ConstraintFocus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const saveTimer = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch("/api/constraint-data")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setData(res.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Autosave met debounce
  const persist = (next) => {
    setData(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/constraint-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: next }),
        }).then((r) => r.json());
        setSaveState(res.success ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
  };

  if (error)
    return (
      <div style={ui.page}>
        <div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div>
      </div>
    );

  if (!data)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#8a92a3" }}>Loading…</span>
      </div>
    );

  const activeConstraint = data.constraints.find((c) => c.status === "active") || null;
  const archivedConstraints = data.constraints.filter((c) => c.status !== "active");
  const openHypotheses = data.hypotheses
    .filter((h) => activeConstraint && h.constraintId === activeConstraint.id && h.status === "open")
    .sort((a, b) => b.impact + b.confidence + b.ease - (a.impact + a.confidence + a.ease));
  const closedHypotheses = data.hypotheses.filter(
    (h) => activeConstraint && h.constraintId === activeConstraint.id && h.status !== "open"
  );

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px 14px" : ui.page.padding }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>🎯 Constraint Focus</h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
            1 constraint → hypotheses by ICE score → tasks → review → next
          </p>
        </div>
        <span style={{ fontSize: "12px", color: saveState === "error" ? "#dc2626" : "#8a92a3" }}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "⚠ Save failed" : "✓ Saved"}
        </span>
      </div>

      {/* ===== DEEL 1: MAIN CONSTRAINT ===== */}
      <ConstraintSection
        activeConstraint={activeConstraint}
        data={data}
        persist={persist}
        isMobile={isMobile}
      />

      {/* ===== DEEL 2: HYPOTHESES ===== */}
      {activeConstraint && (
        <HypothesesSection
          constraint={activeConstraint}
          openHypotheses={openHypotheses}
          closedHypotheses={closedHypotheses}
          data={data}
          persist={persist}
          isMobile={isMobile}
        />
      )}

      {/* Archief van opgeloste constraints */}
      {archivedConstraints.length > 0 && (
        <div style={{ ...ui.card, padding: "20px 24px", marginTop: "20px" }}>
          <h2 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700 }}>Solved constraints</h2>
          {archivedConstraints.map((c) => (
            <div key={c.id} style={{ padding: "12px 0", borderBottom: "1px solid #f4f5f7" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 600 }}>✅ {c.title}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                {c.metricName}: {c.metricCurrent} → target {c.metricTarget}
              </div>
              {c.conclusion && (
                <div style={{ fontSize: "12.5px", color: "#334155", marginTop: "6px", fontStyle: "italic" }}>
                  "{c.conclusion}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= CONSTRAINT (deel 1) ================= */

function ConstraintSection({ activeConstraint, data, persist, isMobile }) {
  const [form, setForm] = useState({ title: "", description: "", metricName: "", metricCurrent: "", metricTarget: "" });
  const [editing, setEditing] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [closing, setClosing] = useState(false);

  const startEdit = () => {
    setForm({ ...activeConstraint });
    setEditing(true);
  };

  const save = () => {
    if (!form.title.trim()) return;
    if (editing) {
      persist({
        ...data,
        constraints: data.constraints.map((c) => (c.id === activeConstraint.id ? { ...c, ...form } : c)),
      });
      setEditing(false);
    } else {
      const c = { id: uid(), ...form, status: "active", createdAt: new Date().toISOString() };
      persist({ ...data, constraints: [...data.constraints, c] });
    }
    setForm({ title: "", description: "", metricName: "", metricCurrent: "", metricTarget: "" });
  };

  const solve = () => {
    persist({
      ...data,
      constraints: data.constraints.map((c) =>
        c.id === activeConstraint.id
          ? { ...c, status: "solved", conclusion, solvedAt: new Date().toISOString() }
          : c
      ),
    });
    setClosing(false);
    setConclusion("");
  };

  // Formulier (nieuwe constraint of bewerken)
  if (!activeConstraint || editing) {
    return (
      <div style={{ ...ui.card, padding: "24px", marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700 }}>
          {editing ? "Edit constraint" : "Step 1 — What is the main constraint?"}
        </h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "12.5px", color: "#8a92a3" }}>
          The one bottleneck holding back the company's growth the most right now.
        </p>
        <div style={{ display: "grid", gap: "10px" }}>
          <input
            style={ui.input}
            placeholder="Constraint — e.g. 'Low conversion rate on the product page'"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            style={{ ...ui.input, minHeight: "70px", resize: "vertical" }}
            placeholder="Analysis — why do you think this is THE constraint? What does the data show?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: "10px" }}>
            <input
              style={ui.input}
              placeholder="Metric — e.g. 'Product page CR'"
              value={form.metricName}
              onChange={(e) => setForm({ ...form, metricName: e.target.value })}
            />
            <input
              style={ui.input}
              placeholder="Now — e.g. '1.8%'"
              value={form.metricCurrent}
              onChange={(e) => setForm({ ...form, metricCurrent: e.target.value })}
            />
            <input
              style={ui.input}
              placeholder="Target — e.g. '3%'"
              value={form.metricTarget}
              onChange={(e) => setForm({ ...form, metricTarget: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={save} style={btnPrimary}>
              {editing ? "Save" : "Set constraint"}
            </button>
            {editing && (
              <button onClick={() => setEditing(false)} style={btnGhost}>Cancel</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Actieve constraint kaart
  return (
    <div style={{ ...ui.card, padding: "24px", marginBottom: "20px", border: "2px solid #0f172a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...ui.label, marginBottom: "6px" }}>Main Constraint</div>
          <h2 style={{ margin: 0, fontSize: "19px", fontWeight: 700 }}>{activeConstraint.title}</h2>
          {activeConstraint.description && (
            <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
              {activeConstraint.description}
            </p>
          )}
          {activeConstraint.metricName && (
            <div style={{ marginTop: "12px", display: "inline-flex", gap: "8px", alignItems: "center", background: "#f1f5f9", borderRadius: "10px", padding: "8px 14px", fontSize: "13px" }}>
              <b>{activeConstraint.metricName}</b>
              <span style={{ color: "#64748b" }}>{activeConstraint.metricCurrent}</span>
              <span style={{ color: "#94a3b8" }}>→</span>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>{activeConstraint.metricTarget}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button onClick={startEdit} style={btnGhost}>Edit</button>
          <button onClick={() => setClosing(true)} style={{ ...btnPrimary, background: "#16a34a" }}>
            Constraint solved ✓
          </button>
        </div>
      </div>

      {closing && (
        <div style={{ marginTop: "16px", padding: "16px", background: "#f0fdf4", borderRadius: "12px" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: 600, color: "#166534" }}>
            Conclusion — what solved it and what was the impact on the numbers?
          </p>
          <textarea
            style={{ ...ui.input, minHeight: "70px", resize: "vertical", marginBottom: "10px" }}
            placeholder="E.g. 'CR went from 1.8% to 2.9% after the new product page — revenue +31%'"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={solve} style={{ ...btnPrimary, background: "#16a34a" }}>Close</button>
            <button onClick={() => setClosing(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= HYPOTHESES (deel 2) ================= */

function ScorePicker({ label, value, onChange }) {
  return (
    <div>
      <div style={{ ...ui.label, marginBottom: "6px" }}>{label}</div>
      <div style={{ display: "flex", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            type="button"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "1px solid " + (value === n ? "#0f172a" : "#e2e6ec"),
              background: value === n ? "#0f172a" : "#ffffff",
              color: value === n ? "#ffffff" : "#64748b",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function calendarUrl(hypothesis, deadline) {
  const d = deadline.replace(/-/g, "");
  const next = new Date(`${deadline}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dEnd = next.toISOString().split("T")[0].replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `🎯 Review hypothesis: ${hypothesis.title}`,
    dates: `${d}/${dEnd}`,
    details: `Review the results of this hypothesis in the Constraint Focus dashboard:\nhttps://jjb-profit-dashboard.vercel.app/constraint-focus\n\nHypothesis: ${hypothesis.description || hypothesis.title}\n\nCheck: has the metric improved? What does the data say? Write your feedback in the dashboard and close the hypothesis.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function HypothesesSection({ constraint, openHypotheses, closedHypotheses, data, persist, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", impact: 3, confidence: 3, ease: 3 });
  const [expanded, setExpanded] = useState(null);

  const addHypothesis = () => {
    if (!form.title.trim()) return;
    const h = {
      id: uid(),
      constraintId: constraint.id,
      ...form,
      status: "open",
      tasks: [],
      deadline: "",
      feedback: "",
      createdAt: new Date().toISOString(),
    };
    persist({ ...data, hypotheses: [...data.hypotheses, h] });
    setForm({ title: "", description: "", impact: 3, confidence: 3, ease: 3 });
    setShowForm(false);
  };

  const updateH = (id, patch) => {
    persist({
      ...data,
      hypotheses: data.hypotheses.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });
  };

  const deleteH = (id) => {
    if (!confirm("Delete hypothesis?")) return;
    persist({ ...data, hypotheses: data.hypotheses.filter((h) => h.id !== id) });
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
          Step 2 — Hypotheses <span style={{ color: "#8a92a3", fontWeight: 500, fontSize: "12.5px" }}>(ranked by ICE score)</span>
        </h2>
        <button onClick={() => setShowForm(!showForm)} style={btnPrimary}>+ Hypothesis</button>
      </div>

      {/* Nieuwe hypothese */}
      {showForm && (
        <div style={{ ...ui.card, padding: "20px", marginBottom: "14px" }}>
          <div style={{ display: "grid", gap: "10px" }}>
            <input
              style={ui.input}
              placeholder="Hypothesis — e.g. 'If we show reviews above the fold, CR will increase'"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
            <textarea
              style={{ ...ui.input, minHeight: "60px", resize: "vertical" }}
              placeholder="Reasoning — why do you believe this? Which metric should it improve?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div style={{ display: "flex", gap: isMobile ? "14px" : "28px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <ScorePicker label="Impact" value={form.impact} onChange={(v) => setForm({ ...form, impact: v })} />
              <ScorePicker label="Confidence" value={form.confidence} onChange={(v) => setForm({ ...form, confidence: v })} />
              <ScorePicker label="Ease" value={form.ease} onChange={(v) => setForm({ ...form, ease: v })} />
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={ui.label}>ICE total</div>
                <div style={{ fontSize: "24px", fontWeight: 700 }}>{form.impact + form.confidence + form.ease}<span style={{ fontSize: "13px", color: "#94a3b8" }}>/15</span></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={addHypothesis} style={btnPrimary}>Add</button>
              <button onClick={() => setShowForm(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Open hypotheses, hoogste ICE bovenaan */}
      {openHypotheses.length === 0 && !showForm && (
        <div style={{ ...ui.card, padding: "32px", textAlign: "center", marginBottom: "14px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "#8a92a3" }}>
            No open hypotheses yet. Click <b>+ Hypothesis</b> to brainstorm solutions for this constraint.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "12px", marginBottom: "20px" }}>
        {openHypotheses.map((h, idx) => (
          <HypothesisCard
            key={h.id}
            h={h}
            isFocus={idx === 0}
            expanded={expanded === h.id}
            onToggle={() => setExpanded(expanded === h.id ? null : h.id)}
            updateH={updateH}
            deleteH={deleteH}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Closed hypotheses */}
      {closedHypotheses.length > 0 && (
        <div style={{ ...ui.card, padding: "20px 24px" }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: "13.5px", fontWeight: 700, color: "#64748b" }}>
            Afgesloten hypotheses
          </h3>
          {closedHypotheses.map((h) => (
            <div key={h.id} style={{ padding: "12px 0", borderBottom: "1px solid #f4f5f7" }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>
                {h.status === "validated" ? "✅" : "❌"} {h.title}
                <span style={{ color: "#94a3b8", fontWeight: 500, marginLeft: "8px", fontSize: "12px" }}>
                  ICE {h.impact + h.confidence + h.ease}/15
                </span>
              </div>
              {h.feedback && (
                <div style={{ fontSize: "12.5px", color: "#475569", marginTop: "4px", fontStyle: "italic" }}>
                  "{h.feedback}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function HypothesisCard({ h, isFocus, expanded, onToggle, updateH, deleteH, isMobile }) {
  const [taskInput, setTaskInput] = useState("");
  const [closing, setClosing] = useState(null); // "validated" | "rejected" | null
  const score = h.impact + h.confidence + h.ease;
  const doneTasks = h.tasks.filter((t) => t.done).length;

  const addTask = () => {
    if (!taskInput.trim()) return;
    updateH(h.id, { tasks: [...h.tasks, { id: uid(), text: taskInput.trim(), done: false }] });
    setTaskInput("");
  };

  return (
    <div style={{ ...ui.card, border: isFocus ? "2px solid #3b82f6" : ui.card.border, overflow: "hidden" }}>
      {/* Kop — altijd zichtbaar */}
      <div
        onClick={onToggle}
        style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px", cursor: "pointer" }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: isFocus ? "#3b82f6" : "#f1f5f9",
            color: isFocus ? "#ffffff" : "#334155",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "16px", fontWeight: 700, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: "8px", opacity: 0.8 }}>ICE</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {isFocus && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#3b82f6", background: "#eff6ff", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase" }}>
                🎯 Focus now
              </span>
            )}
            <span style={{ fontSize: "14px", fontWeight: 700 }}>{h.title}</span>
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", marginTop: "3px" }}>
            I {h.impact} · C {h.confidence} · E {h.ease}
            {h.tasks.length > 0 && ` — tasks ${doneTasks}/${h.tasks.length}`}
            {h.deadline && ` — review ${new Date(h.deadline + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
          </div>
        </div>
        <span style={{ color: "#94a3b8", fontSize: "13px", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Uitgeklapt */}
      {expanded && (
        <div style={{ padding: "0 20px 20px 20px", borderTop: "1px solid #f4f5f7" }}>
          {h.description && (
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "14px 0" }}>{h.description}</p>
          )}

          {/* ICE aanpassen */}
          <div style={{ display: "flex", gap: isMobile ? "14px" : "28px", flexWrap: "wrap", margin: "14px 0" }}>
            <ScorePicker label="Impact" value={h.impact} onChange={(v) => updateH(h.id, { impact: v })} />
            <ScorePicker label="Confidence" value={h.confidence} onChange={(v) => updateH(h.id, { confidence: v })} />
            <ScorePicker label="Ease" value={h.ease} onChange={(v) => updateH(h.id, { ease: v })} />
          </div>

          {/* Taken */}
          <div style={{ ...ui.label, margin: "16px 0 8px 0" }}>Tasks</div>
          {h.tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0" }}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  updateH(h.id, { tasks: h.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })
                }
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span style={{ fontSize: "13px", flex: 1, textDecoration: t.done ? "line-through" : "none", color: t.done ? "#94a3b8" : "#334155" }}>
                {t.text}
              </span>
              <button
                onClick={() => updateH(h.id, { tasks: h.tasks.filter((x) => x.id !== t.id) })}
                style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <input
              style={{ ...ui.input, flex: 1 }}
              placeholder="New task…"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <button onClick={addTask} style={btnGhost}>+</button>
          </div>

          {/* Review deadline + Google Agenda */}
          <div style={{ ...ui.label, margin: "18px 0 8px 0" }}>Review deadline</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={h.deadline || ""}
              onChange={(e) => updateH(h.id, { deadline: e.target.value })}
              style={{ ...ui.input, width: "auto" }}
            />
            {h.deadline && (
              <a
                href={calendarUrl(h, h.deadline)}
                target="_blank"
                rel="noreferrer"
                style={{ ...btnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                📅 Add to Google Calendar
              </a>
            )}
          </div>

          {/* Feedback */}
          <div style={{ ...ui.label, margin: "18px 0 8px 0" }}>Feedback & results</div>
          <textarea
            style={{ ...ui.input, minHeight: "80px", resize: "vertical" }}
            placeholder="Was the hypothesis correct? What do the numbers say (revenue, CR, ROAS, ...)? What was the impact on growth?"
            value={h.feedback || ""}
            onChange={(e) => updateH(h.id, { feedback: e.target.value })}
          />

          {/* Afsluiten */}
          <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
            {closing == null ? (
              <>
                <button onClick={() => setClosing("validated")} style={{ ...btnPrimary, background: "#16a34a" }}>
                  ✓ Validated — close
                </button>
                <button onClick={() => setClosing("rejected")} style={{ ...btnGhost, color: "#dc2626", borderColor: "#fecaca" }}>
                  ✗ Rejected — close
                </button>
                <button onClick={() => deleteH(h.id)} style={{ ...btnGhost, marginLeft: "auto", color: "#94a3b8" }}>
                  Delete
                </button>
              </>
            ) : (
              <div style={{ padding: "12px 16px", background: closing === "validated" ? "#f0fdf4" : "#fef2f2", borderRadius: "10px", width: "100%" }}>
                <p style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: 600 }}>
                  {h.feedback?.trim()
                    ? "Close for sure? The next hypothesis with the highest ICE score will become the new focus."
                    : "Tip: write your feedback above first, so you'll know later what this experiment delivered. Close anyway?"}
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => updateH(h.id, { status: closing, closedAt: new Date().toISOString() })}
                    style={{ ...btnPrimary, background: closing === "validated" ? "#16a34a" : "#dc2626" }}
                  >
                    Yes, close
                  </button>
                  <button onClick={() => setClosing(null)} style={btnGhost}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
