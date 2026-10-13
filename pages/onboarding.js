// pages/onboarding.js — Creative Onboarding: a course for new video editors, graphic designers and creative strategists.
// Modules → lessons with a Loom video, text and resource links; everyone ticks off their own lessons.
// Admin: "Edit course" (modules, lessons, Loom links, who sees what) and "Team progress".
// Data: /api/onboarding (Shopify metaobject, shared for the whole team).

import { useEffect, useMemo, useState } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  pill: (on) => ({ padding: "7px 13px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }),
  btn: (kind) => ({ padding: "9px 14px", borderRadius: "10px", border: kind === "ghost" ? "1px solid #e2e6ec" : "none", background: kind === "primary" ? "#0f172a" : kind === "ok" ? "#16a34a" : kind === "danger" ? "#fff" : "#fff", color: kind === "primary" || kind === "ok" ? "#fff" : kind === "danger" ? "#b91c1c" : "#334155", fontWeight: 700, fontSize: "13px", cursor: "pointer" }),
  input: { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "#fff" },
};
const ROLE_SHORT = { "Video Editor": "Editors", "Graphic Designer": "Designers", "Creative Strategist": "Strategists" };
const loomEmbed = (url) => {
  const m = String(url || "").match(/loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/i) || String(url || "").match(/^([a-f0-9]{24,})$/i);
  return m ? `https://www.loom.com/embed/${m[1]}?hide_owner=true&hide_share=true&hideEmbedTopBar=true` : null;
};
const uid = () => Math.random().toString(16).slice(2, 14).padEnd(12, "0");

function Bar({ value, h = 6 }) {
  return <div style={{ height: h, background: "#eef0f4", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${Math.round((value || 0) * 100)}%`, height: "100%", background: "#16a34a", borderRadius: 999, transition: "width .3s" }} /></div>;
}
const RoleChips = ({ roles }) => (roles?.length ? <span style={{ display: "inline-flex", gap: "4px", flexWrap: "wrap" }}>{roles.map((r) => <span key={r} style={{ fontSize: "10.5px", fontWeight: 700, color: "#4f46e5", background: "#eef2ff", borderRadius: 999, padding: "1px 7px" }}>{ROLE_SHORT[r] || r}</span>)}</span> : null);

/* ---------------- learner view (Skool-style classroom) ---------------- */
const SK = { bg: "#f8f7f5", line: "#e4e4e4", ink: "#202124", sub: "#5f6368", active: "#f8e7a8", green: "#22a06b", track: "#e4e4e4" };

// Small, safe text formatting for lesson text: **bold**, ## heading, - bullets, [label](url), bare links
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function inline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
}
function renderText(text) {
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) { list.push(line.replace(/^\s*[-•]\s+/, "")); continue; }
    flush();
    if (/^##\s+/.test(line)) out.push(`<h3>${inline(line.replace(/^##\s+/, ""))}</h3>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

function ProgressPill({ value, w = "100%" }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div style={{ position: "relative", width: w, height: 22, background: SK.track, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: `${Math.max(pct, 0)}%`, background: SK.green, borderRadius: 999, transition: "width .35s" }} />
      <span style={{ position: "absolute", left: 12, top: 0, lineHeight: "22px", fontSize: 12.5, fontWeight: 700, color: pct >= 8 ? "#fff" : SK.ink }}>{pct}%</span>
    </div>
  );
}
function DoneCircle({ on, size = 34, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={on ? "Completed — click to undo" : "Mark as completed"} style={{ width: size, height: size, flex: "none", borderRadius: "50%", border: on ? "none" : `2px solid #9aa0a6`, background: on ? SK.green : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, transition: "all .15s" }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 12 12"><path d="M2.4 6.3 5 8.8l4.6-5.2" fill="none" stroke={on ? "#fff" : "#9aa0a6"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
const COVER_BG = ["linear-gradient(135deg,#1f2937,#4f46e5)", "linear-gradient(135deg,#0f766e,#22c55e)", "linear-gradient(135deg,#9d174d,#f472b6)", "linear-gradient(135deg,#7c2d12,#f59e0b)", "linear-gradient(135deg,#1e3a8a,#38bdf8)", "linear-gradient(135deg,#3f3f46,#a1a1aa)"];

function Classroom({ course, progress, onOpen }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 22 }}>
      {course.modules.map((m, i) => {
        const done = m.lessons.filter((l) => progress[l.id]).length;
        return (
          <button key={m.id} onClick={() => onOpen(m.id)} className="sk-card" style={{ textAlign: "left", padding: 0, border: `1px solid ${SK.line}`, borderRadius: 12, background: "#fff", overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
            <div style={{ aspectRatio: "16 / 9", width: "100%", background: m.cover ? `#000 url("${m.cover.replace(/"/g, "")}") center/cover no-repeat` : COVER_BG[i % COVER_BG.length], display: "flex", alignItems: "flex-end", padding: m.cover ? 0 : 18 }}>
              {!m.cover && <span style={{ color: "#fff", fontWeight: 800, fontSize: 22, lineHeight: 1.2, textShadow: "0 1px 2px rgba(0,0,0,.2)" }}>{m.title.replace(/^\d+\s*[·.-]\s*/, "")}</span>}
            </div>
            <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: SK.ink }}>{m.title}</div>
              <div style={{ fontSize: 14.5, color: SK.sub, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 42 }}>{m.description || `${m.lessons.length} lessons`}</div>
              <div style={{ marginTop: "auto", paddingTop: 6 }}><ProgressPill value={m.lessons.length ? done / m.lessons.length : 0} /></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ModuleView({ module, progress, onToggle, busy, lessonId, setLessonId, onBack, nextModule, onOpenModule }) {
  const lessons = module.lessons;
  const idx = Math.max(0, lessons.findIndex((l) => l.id === lessonId));
  const lesson = lessons[idx];
  const done = lessons.filter((l) => progress[l.id]).length;
  const embed = lesson && loomEmbed(lesson.loom);
  const next = lessons[idx + 1];
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: SK.sub, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "0 0 16px" }}>← All modules</button>
      <div className="sk-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 32, alignItems: "start" }}>
        <aside className="sk-side" style={{ position: "sticky", top: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 21, color: SK.ink, padding: "0 14px", lineHeight: 1.3 }}>{module.title}</div>
          <div style={{ padding: "12px 14px 22px" }}><ProgressPill value={lessons.length ? done / lessons.length : 0} /></div>
          {lessons.map((l) => {
            const on = l.id === lesson?.id;
            return (
              <button key={l.id} onClick={() => setLessonId(l.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "14px", margin: "0 0 4px", border: "none", borderRadius: 10, cursor: "pointer", background: on ? SK.active : "transparent", fontSize: 16.5, color: SK.ink, fontWeight: on ? 600 : 400 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                {progress[l.id] && <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="9" fill={SK.green} /><path d="M5 9.2 7.6 11.7 13 6.3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            );
          })}
        </aside>

        {lesson && (
          <article style={{ background: "#fff", border: `1px solid ${SK.line}`, borderRadius: 12, padding: "40px 48px 44px", minWidth: 0 }} className="sk-lesson">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 28 }}>
              <h2 style={{ margin: 0, fontSize: 31, fontWeight: 700, color: SK.ink, letterSpacing: "-0.3px", lineHeight: 1.2 }}>{lesson.title}</h2>
              <DoneCircle on={!!progress[lesson.id]} disabled={busy} onClick={() => onToggle(lesson.id, !progress[lesson.id])} />
            </div>
            {embed
              ? <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "#000", marginBottom: 28 }}><iframe src={embed} title={lesson.title} allowFullScreen allow="autoplay; fullscreen" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} /></div>
              : <div style={{ borderRadius: 10, background: "#f1f3f4", border: `1px dashed ${SK.line}`, padding: "34px 20px", textAlign: "center", color: SK.sub, marginBottom: 28 }}><div style={{ fontSize: 26 }}>🎬</div><div style={{ fontWeight: 700, color: SK.ink, marginTop: 4 }}>Video coming soon</div></div>}
            {lesson.description && <div className="sk-text" dangerouslySetInnerHTML={{ __html: renderText(lesson.description) }} />}
            {lesson.resources?.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontWeight: 700, fontSize: 17, color: SK.ink, marginBottom: 10 }}>Resources</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {lesson.resources.map((r, i) => (
                    <a key={i} href={r.url} target={r.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${SK.line}`, borderRadius: 10, color: SK.ink, textDecoration: "none", fontSize: 15.5 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f1f3f4", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>🔗</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{r.label}</span><span style={{ color: SK.sub }}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 36 }}>
              {next
                ? <button onClick={() => { if (!progress[lesson.id]) onToggle(lesson.id, true); setLessonId(next.id); }} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: SK.ink, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Next lesson →</button>
                : nextModule
                  ? <button onClick={() => { if (!progress[lesson.id]) onToggle(lesson.id, true); onOpenModule(nextModule.id); }} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: SK.ink, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Next module: {nextModule.title} →</button>
                  : <span style={{ fontWeight: 700, color: SK.green }}>{done === lessons.length ? "🎉 Onboarding completed" : ""}</span>}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

/* ---------------- admin: edit course ---------------- */
function RolePicker({ value, onChange, roles }) {
  return (
    <span style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: "11.5px", color: "#8a92a3" }}>Visible for:</span>
      <button onClick={() => onChange([])} style={{ ...ui.pill(!value.length), padding: "4px 10px", fontSize: "11.5px" }}>Everyone</button>
      {roles.map((r) => <button key={r} onClick={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])} style={{ ...ui.pill(value.includes(r)), padding: "4px 10px", fontSize: "11.5px" }}>{ROLE_SHORT[r] || r}</button>)}
    </span>
  );
}
function Editor({ initial, roles, onSaved }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const setM = (mi, patch) => setC((x) => ({ ...x, modules: x.modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }));
  const setL = (mi, li, patch) => setM(mi, { lessons: c.modules[mi].lessons.map((l, i) => (i === li ? { ...l, ...patch } : l)) });
  const move = (arr, i, d) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveCourse", course: c }) }).then((x) => x.json());
      if (!r.success) throw new Error(r.error || "Save failed");
      setC(r.course); onSaved(r.course); setMsg({ ok: true, t: "Saved — the team sees the new version now." });
    } catch (e) { setMsg({ ok: false, t: e.message }); }
    setSaving(false);
  };
  const small = { ...ui.btn("ghost"), padding: "5px 9px", fontSize: "12px" };
  return (
    <div>
      <div style={{ ...ui.card, padding: "18px 20px", marginBottom: "14px" }}>
        <div style={ui.label}>Course title</div>
        <input value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} style={{ ...ui.input, margin: "6px 0 12px", fontWeight: 700 }} />
        <div style={ui.label}>Welcome text (shown at the top)</div>
        <textarea value={c.intro} onChange={(e) => setC({ ...c, intro: e.target.value })} rows={3} style={{ ...ui.input, marginTop: "6px", resize: "vertical" }} />
      </div>
      {c.modules.map((m, mi) => (
        <div key={m.id} style={{ ...ui.card, padding: "18px 20px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input value={m.title} onChange={(e) => setM(mi, { title: e.target.value })} placeholder="Module title" style={{ ...ui.input, fontWeight: 800, fontSize: "14.5px" }} />
            <button style={small} title="Move up" onClick={() => setC({ ...c, modules: move(c.modules, mi, -1) })}>↑</button>
            <button style={small} title="Move down" onClick={() => setC({ ...c, modules: move(c.modules, mi, 1) })}>↓</button>
            <button style={{ ...small, color: "#b91c1c" }} onClick={() => { if (confirm(`Delete module "${m.title}" and its lessons?`)) setC({ ...c, modules: c.modules.filter((_, i) => i !== mi) }); }}>Delete</button>
          </div>
          <input value={m.description} onChange={(e) => setM(mi, { description: e.target.value })} placeholder="Short description (shown on the card)" style={{ ...ui.input, marginTop: "8px" }} />
          <input value={m.cover || ""} onChange={(e) => setM(mi, { cover: e.target.value })} placeholder="Cover image URL (optional, 16:9) — e.g. a Shopify Files link" style={{ ...ui.input, marginTop: "8px" }} />
          <div style={{ marginTop: "8px" }}><RolePicker value={m.roles || []} roles={roles} onChange={(v) => setM(mi, { roles: v })} /></div>
          <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
            {m.lessons.map((l, li) => (
              <div key={l.id} style={{ border: "1px solid #eceef2", borderRadius: "12px", padding: "12px 14px", background: "#fafbfc" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#94a3b8", width: "18px" }}>{li + 1}</span>
                  <input value={l.title} onChange={(e) => setL(mi, li, { title: e.target.value })} placeholder="Lesson title" style={{ ...ui.input, fontWeight: 700 }} />
                  <input value={l.duration} onChange={(e) => setL(mi, li, { duration: e.target.value })} placeholder="5 min" style={{ ...ui.input, width: "84px" }} />
                  <button style={small} onClick={() => setM(mi, { lessons: move(m.lessons, li, -1) })}>↑</button>
                  <button style={small} onClick={() => setM(mi, { lessons: move(m.lessons, li, 1) })}>↓</button>
                  <button style={{ ...small, color: "#b91c1c" }} onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) setM(mi, { lessons: m.lessons.filter((_, i) => i !== li) }); }}>✕</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px", marginTop: "8px", paddingLeft: "26px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input value={l.loom} onChange={(e) => setL(mi, li, { loom: e.target.value })} placeholder="Loom link — https://www.loom.com/share/…" style={{ ...ui.input, borderColor: l.loom && !loomEmbed(l.loom) ? "#fca5a5" : "#e2e6ec" }} />
                    <span style={{ fontSize: "11.5px", fontWeight: 700, whiteSpace: "nowrap", color: !l.loom ? "#94a3b8" : loomEmbed(l.loom) ? "#16a34a" : "#b91c1c" }}>{!l.loom ? "no video yet" : loomEmbed(l.loom) ? "✓ Loom ok" : "not a Loom link"}</span>
                  </div>
                  <textarea value={l.description} onChange={(e) => setL(mi, li, { description: e.target.value })} rows={5} placeholder={"Text under the video. Formatting: **bold**, ## heading, - bullet, [link](https://…)"} style={{ ...ui.input, resize: "vertical" }} />
                  <textarea value={(l.resources || []).map((r) => `${r.label} | ${r.url}`).join("\n")} rows={2} placeholder={"Resources, one per line:  Brand guide | https://…"}
                    onChange={(e) => setL(mi, li, { resources: e.target.value.split("\n").map((row) => { const [label, ...rest] = row.split("|"); return { label: (label || "").trim(), url: rest.join("|").trim() }; }).filter((r) => r.label || r.url) })}
                    style={{ ...ui.input, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: "12px" }} />
                  <RolePicker value={l.roles || []} roles={roles} onChange={(v) => setL(mi, li, { roles: v })} />
                </div>
              </div>
            ))}
            <button style={{ ...ui.btn("ghost"), justifySelf: "start" }} onClick={() => setM(mi, { lessons: [...m.lessons, { id: uid(), title: "New lesson", description: "", loom: "", duration: "", resources: [], roles: [] }] })}>+ Add lesson</button>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", position: "sticky", bottom: "12px", ...ui.card, padding: "12px 14px" }}>
        <button style={ui.btn("ghost")} onClick={() => setC({ ...c, modules: [...c.modules, { id: uid(), title: `${c.modules.length + 1} · New module`, description: "", roles: [], lessons: [] }] })}>+ Add module</button>
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: "13px", fontWeight: 600, color: msg.ok ? "#16a34a" : "#b91c1c" }}>{msg.t}</span>}
        <button style={{ ...ui.btn("primary"), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save course"}</button>
      </div>
    </div>
  );
}

/* ---------------- admin: team progress ---------------- */
function Team({ team }) {
  if (!team?.length) return <div style={{ ...ui.card, padding: "22px", color: "#64748b" }}>Nobody has started yet. Progress shows up here as soon as someone marks a lesson as done.</div>;
  return (
    <div style={{ ...ui.card, padding: "6px 20px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead><tr>{["Person", "Role", "Progress", "", "Last activity"].map((h, i) => <th key={i} style={{ ...ui.label, textAlign: "left", padding: "12px 6px", borderBottom: "1px solid #eceef2" }}>{h}</th>)}</tr></thead>
        <tbody>
          {team.map((p) => (
            <tr key={p.email}>
              <td style={{ padding: "11px 6px", borderBottom: "1px solid #f3f4f7" }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: "11.5px", color: "#8a92a3" }}>{p.email}</div></td>
              <td style={{ padding: "11px 6px", borderBottom: "1px solid #f3f4f7" }}><RoleChips roles={p.roles} /></td>
              <td style={{ padding: "11px 6px", borderBottom: "1px solid #f3f4f7", width: "30%" }}><Bar value={p.total ? p.done / p.total : 0} /></td>
              <td style={{ padding: "11px 6px", borderBottom: "1px solid #f3f4f7", fontWeight: 700, whiteSpace: "nowrap" }}>{p.done}/{p.total}{p.total && p.done === p.total ? " ✓" : ""}</td>
              <td style={{ padding: "11px 6px", borderBottom: "1px solid #f3f4f7", color: "#64748b", whiteSpace: "nowrap" }}>{p.last ? new Date(p.last).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Onboarding() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("classroom");
  const [busy, setBusy] = useState(false);
  const [moduleId, setModuleId] = useState(null);
  const [lessonId, setLessonIdState] = useState(null);
  const load = () => fetch("/api/onboarding").then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Error"))).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  // Deep link: #<moduleId> or #<moduleId>/<lessonId>
  useEffect(() => {
    if (!data) return;
    const [m, l] = (window.location.hash.slice(1) || "").split("/");
    const mod = data.course.modules.find((x) => x.id === m);
    if (mod) { setModuleId(mod.id); setLessonIdState(mod.lessons.find((x) => x.id === l)?.id || null); }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  const setHash = (m, l) => { try { history.replaceState(null, "", m ? `#${m}${l ? `/${l}` : ""}` : location.pathname); } catch {} };
  const openModule = (id) => {
    const mod = data.course.modules.find((x) => x.id === id);
    const first = mod?.lessons.find((l) => !data.progress?.[l.id]) || mod?.lessons[0];
    setModuleId(id); setLessonIdState(first?.id || null); setHash(id, first?.id); window.scrollTo({ top: 0 });
  };
  const setLessonId = (id) => { setLessonIdState(id); setHash(moduleId, id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const toggle = async (id, done) => {
    setBusy(true);
    setData((d) => { const p = { ...(d.progress || {}) }; if (done) p[id] = new Date().toISOString(); else delete p[id]; return { ...d, progress: p }; });
    try {
      const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "progress", lessonId: id, done }) }).then((x) => x.json());
      if (r.success) setData((d) => ({ ...d, progress: r.progress })); else setErr(r.error || "Could not save");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const mods = data?.course?.modules || [];
  const mod = mods.find((m) => m.id === moduleId);
  const all = mods.flatMap((m) => m.lessons);
  const doneAll = all.filter((l) => data?.progress?.[l.id]).length;
  const tabs = [["classroom", "Classroom"], ...(data?.isAdmin ? [["edit", "Edit course"], ["team", "Team progress"]] : [])];

  return (
    <div style={{ minHeight: "100vh", background: SK.bg, fontFamily: "Inter, Roboto, system-ui, -apple-system, sans-serif", color: SK.ink }}>
      <style>{`
        .sk-card{transition:box-shadow .15s, transform .15s}.sk-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08)!important;transform:translateY(-1px)}
        .sk-text{font-size:17px;line-height:1.65;color:${SK.ink}}.sk-text p{margin:0 0 16px}.sk-text h3{font-size:20px;margin:26px 0 10px}.sk-text ul{margin:0 0 16px;padding-left:24px}.sk-text li{margin:0 0 8px}.sk-text a{color:#1a73e8}
        @media (max-width: 900px){.sk-wrap{padding:20px 16px 40px!important}.sk-head{padding:14px 16px 0!important}.sk-grid{grid-template-columns:1fr!important}.sk-side{position:static!important}.sk-lesson{padding:24px 20px!important}}
      `}</style>
      <div className="sk-head" style={{ background: "#fff", borderBottom: `1px solid ${SK.line}`, padding: "18px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 9, background: "#0f172a", color: "#fff", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>JJ</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{data?.course?.title || "Creative Onboarding"}</div>
              {data && <div style={{ fontSize: 13, color: SK.sub }}>{doneAll} of {all.length} lessons completed</div>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 34, marginTop: 14 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); if (k === "classroom") { setModuleId(null); setHash(null); } if (k !== "edit") load(); }} style={{ background: "none", border: "none", padding: "10px 0 14px", fontSize: 16.5, cursor: "pointer", color: tab === k ? SK.ink : "#909090", fontWeight: tab === k ? 600 : 400, borderBottom: `3px solid ${tab === k ? SK.ink : "transparent"}` }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="sk-wrap" style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 40px 60px" }}>
        {err && <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", color: "#991b1b", marginBottom: 16 }}>{err}</div>}
        {!data && !err && <div style={{ color: SK.sub }}>Loading…</div>}
        {data && tab === "classroom" && !mod && (
          <>
            {data.course.intro && <p style={{ fontSize: 16.5, color: SK.sub, lineHeight: 1.6, margin: "0 0 26px", maxWidth: 820 }}>{data.course.intro}</p>}
            {mods.length ? <Classroom course={data.course} progress={data.progress || {}} onOpen={openModule} /> : <div style={{ color: SK.sub }}>No lessons for your role yet.</div>}
          </>
        )}
        {data && tab === "classroom" && mod && (
          <ModuleView module={mod} progress={data.progress || {}} onToggle={toggle} busy={busy} lessonId={lessonId} setLessonId={setLessonId}
            onBack={() => { setModuleId(null); setHash(null); }} nextModule={mods[mods.indexOf(mod) + 1]} onOpenModule={openModule} />
        )}
        {data && tab === "edit" && data.isAdmin && <Editor initial={data.course} roles={data.roles} onSaved={(course) => setData((d) => ({ ...d, course }))} />}
        {data && tab === "team" && data.isAdmin && <Team team={data.team} />}
      </div>
    </div>
  );
}
