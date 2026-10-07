// components/creatives/CreativesList.js
// Horizontale lijstweergave voor Video Editor en Graphic Designer (vervangt het kanban-bord).
// Taken gegroepeerd per status (verticaal), per groep gesorteerd op deadline.
// Status wijzigen: rij naar een andere groep slepen of via het ⋯-menu.
// Licht/donker thema via de knop rechtsboven (onthouden per browser).

import { useState, useEffect } from "react";

export const BOARD_STATUSES = ["Task Start", "Ready To Work", "In Production", "QA Check", "Revisions", "Ready to launch"];
const STAGE_COLOR = {
  "Task Start": "#c4a484",
  "Ready To Work": "#7f9ccb",
  "In Production": "#9d8fcc",
  "QA Check": "#d2ab55",
  Revisions: "#d48e8e",
  "Ready to launch": "#72ae96",
};
const PEOPLE_COLORS = ["#5b6fb8", "#b8705b", "#4f8f78", "#8a6bb8", "#a8863f", "#4f8aa8", "#a85b7f", "#6f8f4f"];
const personColor = (email) => {
  let h = 0;
  for (const c of email || "") h = (h * 31 + c.charCodeAt(0)) % 997;
  return PEOPLE_COLORS[h % PEOPLE_COLORS.length];
};
const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";
const tint = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, "0");

const THEME_KEY = "jj-creatives-theme";
export function useCreativesTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      setDark(localStorage.getItem(THEME_KEY) === "dark");
    } catch {}
  }, []);
  const toggle = () =>
    setDark((d) => {
      try {
        localStorage.setItem(THEME_KEY, d ? "light" : "dark");
      } catch {}
      return !d;
    });
  return [dark, toggle];
}

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function dueInfo(iso) {
  if (!iso) return { rel: "No deadline", abs: "", late: false, soon: false };
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  const late = d < now;
  let rel;
  if (late) {
    const n = Math.max(0, -days);
    rel = n === 0 ? "Late today" : `${n} day${n > 1 ? "s" : ""} late`;
  } else rel = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
  const abs = d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return { rel, abs, late, soon: !late && days <= 1 };
}

const Icon = {
  chev: (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3.5l3 3 3-3" /></svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
  ),
  clip: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
  ),
};

function Avatar({ name, email, size = 22 }) {
  if (!name)
    return (
      <span className="cl-av cl-av-empty" style={{ width: size, height: size }}>
        –
      </span>
    );
  const c = personColor(email);
  return (
    <span className="cl-av" style={{ width: size, height: size, background: tint(c, 0.16), color: c }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * props:
 *  kind: "video" | "design"
 *  title, personLabel ("editors" | "designers")
 *  tasks, people (assignee-opties), strategists, me
 *  creating, onCreate(status), onOpen(id), onStatus(id, status), onDuplicate(id), onDelete(id)
 *  namingFor(t): naamconventie (tooltip)
 *  children: de taakweergave (modal)
 */
export default function CreativesList({
  kind,
  title,
  personLabel,
  tasks,
  people,
  strategists,
  me,
  creating,
  onCreate,
  onOpen,
  onStatus,
  onDuplicate,
  onDelete,
  namingFor,
  children,
}) {
  const [dark, toggleDark] = useCreativesTheme();
  const [q, setQ] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fStrategist, setFStrategist] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [menuId, setMenuId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // Ingeklapte statusgroepen (onthouden per pagina in deze browser)
  const COLLAPSE_KEY = `jj-creatives-collapsed-${kind}`;
  const [collapsed, setCollapsed] = useState({});
  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}")); } catch {}
  }, [COLLAPSE_KEY]);
  const toggleGroup = (status) =>
    setCollapsed((c) => {
      const next = { ...c, [status]: !c[status] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

  const active = tasks.filter((t) => BOARD_STATUSES.includes(t.status));
  const ql = q.trim().toLowerCase();
  const filtered = active.filter(
    (t) =>
      (!fPerson || t.assigneeEmail === fPerson) &&
      (!fStrategist || t.strategistEmail === fStrategist) &&
      (!fProduct || t.product?.title === fProduct) &&
      (!fDeadline || (t.deadline && new Date(t.deadline) <= new Date(`${fDeadline}T23:59:59`))) &&
      (!ql ||
        [t.concept, t.mechanism, t.icp, t.angle, t.product?.title, t.assigneeName, t.strategistName, t.countryCode, namingFor?.(t)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(ql))
  );
  const hasFilters = fPerson || fStrategist || fProduct || fDeadline || ql;
  const productOptions = [...new Set(tasks.map((t) => t.product?.title).filter(Boolean))].sort();

  const subline = (t) => {
    const parts = [t.product?.title, t.countryCode];
    if (kind === "design") parts.push([t.batchType, t.iterationType].filter(Boolean).join(" · "));
    else parts.push(t.type);
    return parts.filter(Boolean).join(" · ");
  };
  const counts = (t) => {
    const chats = (t.activity || []).filter((a) => a.type === "chat" && !a.deleted);
    return { c: chats.length, f: chats.filter((a) => a.attachment).length };
  };

  const drop = (status) => {
    setDragOver(null);
    const id = dragId;
    setDragId(null);
    const t = tasks.find((x) => x.id === id);
    if (t && t.status !== status) onStatus(id, status);
  };

  return (
    <div className={`cl ${dark ? "cl-dark" : ""}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cl-app">
        {/* Header */}
        <div className="cl-hd">
          <div>
            <h1>{title}</h1>
            <p>
              {filtered.length} active task{filtered.length === 1 ? "" : "s"}
              {hasFilters ? " (filtered)" : ""}
            </p>
          </div>
          <div className="cl-sp" />
          <label className="cl-search">
            {Icon.search}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" />
          </label>
          <button className="cl-iconbtn" onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"} aria-label="Toggle dark mode">
            {dark ? Icon.sun : Icon.moon}
          </button>
          {me?.canEdit && (
            <button className="cl-btn" onClick={() => onCreate("Task Start")} disabled={creating}>
              {creating ? "Creating…" : "+ New task"}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="cl-fr">
          <div className="cl-ppl">
            {people.map((u) => {
              const n = active.filter((t) => t.assigneeEmail === u.email).length;
              return (
                <button key={u.email} className={`cl-pc ${fPerson === u.email ? "on" : ""}`} onClick={() => setFPerson(fPerson === u.email ? "" : u.email)}>
                  <Avatar name={u.name} email={u.email} />
                  {firstName(u.name)} <b>{n}</b>
                </button>
              );
            })}
          </div>
          <select className="cl-dd" value={fProduct} onChange={(e) => setFProduct(e.target.value)}>
            <option value="">All products</option>
            {productOptions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select className="cl-dd" value={fStrategist} onChange={(e) => setFStrategist(e.target.value)}>
            <option value="">All strategists</option>
            {strategists.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name}
              </option>
            ))}
          </select>
          <label className="cl-dd cl-date">
            Due by
            <input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} />
          </label>
          {hasFilters && (
            <button
              className="cl-clear"
              onClick={() => {
                setQ("");
                setFPerson("");
                setFStrategist("");
                setFProduct("");
                setFDeadline("");
              }}
            >
              Clear filters
            </button>
          )}
          <div className="cl-sp" />
          <div className="cl-view">
            Grouped by <b>status</b> · sorted by deadline
          </div>
        </div>

        {menuId && <div className="cl-scrim" onClick={() => setMenuId(null)} />}

        {/* Groepen per status */}
        {BOARD_STATUSES.map((status) => {
          const g = filtered
            .filter((t) => t.status === status)
            .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
          const late = g.filter((t) => t.deadline && new Date(t.deadline) < new Date()).length;
          const isOver = dragOver === status && dragId;
          const isClosed = !!collapsed[status];
          return (
            <div
              key={status}
              className="cl-grp"
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (dragOver !== status) setDragOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(status);
              }}
            >
              <div className={`cl-gh ${isClosed ? "closed" : ""}`}>
                <button className="cl-chev" onClick={() => toggleGroup(status)} aria-label={isClosed ? `Show ${status}` : `Hide ${status}`} aria-expanded={!isClosed}>
                  {Icon.chev}
                </button>
                <span className="cl-dot" style={{ background: STAGE_COLOR[status] }} />
                <h3 onClick={() => toggleGroup(status)} style={{ cursor: "pointer" }}>{status}</h3>
                <span className="cl-n">{g.length}</span>
                {late > 0 && <span className="cl-late">· {late} late</span>}
                {me?.canEdit && (
                  <button className="cl-gadd" onClick={() => onCreate(status)} disabled={creating} title={`New task in ${status}`}>
                    +
                  </button>
                )}
              </div>
              {isClosed && !isOver ? null : (
              <div className={`cl-list ${isOver ? "over" : ""}`} style={{ "--acc": STAGE_COLOR[status] || "var(--card)", ...(isOver ? { borderColor: STAGE_COLOR[status] } : {}) }}>
                {(g.length === 0 || isClosed) && <div className="cl-empty">{isOver ? `Drop here to move to ${status}` : "No tasks"}</div>}
                {!isClosed && g.map((t) => {
                  const d = dueInfo(t.deadline);
                  const n = counts(t);
                  return (
                    <div
                      key={t.id}
                      className={`cl-row ${dragId === t.id ? "drag" : ""}`}
                      draggable={!!me?.canStatus}
                      onDragStart={(e) => {
                        setDragId(t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                      onClick={() => onOpen(t.id)}
                      title={namingFor?.(t) || ""}
                    >
                      <div className="cl-tk">
                        <div className="a">{t.concept || t.angle || t.product?.title || (kind === "video" ? "New video task" : "New design task")}</div>
                        <div className="b">{subline(t) || "—"}</div>
                      </div>
                      <div className="cl-who">
                        <Avatar name={t.assigneeName} email={t.assigneeEmail} />
                        <span>{t.assigneeName ? firstName(t.assigneeName) : "Unassigned"}</span>
                      </div>
                      <div className={`cl-due ${d.late ? "late" : d.soon ? "soon" : ""}`}>
                        {d.rel}
                        {d.abs && <small>{d.abs}</small>}
                      </div>
                      <div className="cl-meta">
                        <span>{Icon.chat}{n.c}</span>
                        <span>{Icon.clip}{n.f}</span>
                      </div>
                      <div className="cl-morewrap" onClick={(e) => e.stopPropagation()}>
                        {(me?.canEdit || me?.canStatus) && (
                          <button className="cl-more" onClick={() => setMenuId(menuId === t.id ? null : t.id)} aria-label="More">
                            ⋯
                          </button>
                        )}
                        {menuId === t.id && (
                          <div className="cl-menu">
                            {me?.canStatus && (
                              <>
                                <div className="cl-mh">Move to</div>
                                {BOARD_STATUSES.concat("Launched")
                                  .filter((s) => s !== t.status)
                                  .map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => {
                                        setMenuId(null);
                                        onStatus(t.id, s);
                                      }}
                                    >
                                      <span className="cl-dot" style={{ background: STAGE_COLOR[s] || "#9ca3af" }} />
                                      {s}
                                    </button>
                                  ))}
                              </>
                            )}
                            {me?.canEdit && (
                              <>
                                <div className="cl-sep" />
                                <button
                                  onClick={() => {
                                    setMenuId(null);
                                    onDuplicate(t.id);
                                  }}
                                >
                                  Duplicate task
                                </button>
                                <button
                                  className="danger"
                                  onClick={() => {
                                    setMenuId(null);
                                    onDelete(t.id);
                                  }}
                                >
                                  Delete task
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          );
        })}
        <div className="cl-foot">{personLabel ? `Drag a task to another group to change its status.` : ""}</div>
      </div>
      {/* Taakvenster: in dark mode omgekeerd zodat het mee donker wordt (beelden blijven normaal) */}
      <div className={dark ? "cl-invert" : ""}>{children}</div>
    </div>
  );
}

const CSS = `
.cl{--bg:#fafafa;--surface:#fff;--line:#efefef;--line2:#e6e6e6;--card:#d6d6da;--hover:#fcfcfc;--ink:#111;--ink2:#555;--ink3:#999;--ink4:#c4c4c4;--red:#c62828;--btn:#111;--btntx:#fff;--seg:#f0f0f0;--shadow:0 10px 30px rgba(0,0,0,.12);
  background:var(--bg);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;color-scheme:light}
.cl.cl-dark{--bg:#0f1012;--surface:#17181b;--line:#232428;--line2:#2d2e33;--card:#3b3c42;--hover:#1c1d21;--ink:#ececee;--ink2:#a6a7ad;--ink3:#74757b;--ink4:#4c4d52;--red:#f07171;--btn:#ececee;--btntx:#111;--seg:#202125;--shadow:0 10px 30px rgba(0,0,0,.5);color-scheme:dark}
.cl button{font-family:inherit}
.cl-app{max-width:1440px;margin:0 auto;padding:28px 32px 60px}
.cl-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-right:58px}
body:has(.cl-dark){background:#0f1012}
.cl-hd h1{font-size:20px;font-weight:600;letter-spacing:-.4px;margin:0;color:var(--ink)}
.cl-hd p{font-size:12px;color:var(--ink3);margin-top:3px}
.cl-sp{flex:1}
.cl-search{display:flex;align-items:center;gap:8px;border:1px solid var(--line2);background:var(--surface);border-radius:9px;padding:0 11px;width:240px;color:var(--ink3);height:34px}
.cl-search svg{width:14px;height:14px;flex-shrink:0}
.cl-search input{border:0;outline:0;background:transparent;font:inherit;font-size:12.5px;color:var(--ink);width:100%}
.cl-iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--line2);background:var(--surface);color:var(--ink2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.cl-iconbtn svg{width:16px;height:16px}
.cl-iconbtn:hover{color:var(--ink)}
.cl-btn{border:0;background:var(--btn);color:var(--btntx);border-radius:9px;padding:0 14px;height:34px;font-size:12.5px;font-weight:600;cursor:pointer}
.cl-btn:disabled{opacity:.6}
.cl-fr{display:flex;align-items:center;gap:8px;margin:22px 0 4px;flex-wrap:wrap}
.cl-ppl{display:flex;gap:6px;flex-wrap:wrap}
.cl-pc{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line2);background:var(--surface);border-radius:999px;padding:3px 11px 3px 3px;font-size:12px;color:var(--ink2);cursor:pointer}
.cl-pc.on{border-color:var(--ink);color:var(--ink)}
.cl-pc b{font-weight:600;color:var(--ink3);font-size:11px}
.cl-av{border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0}
.cl-av-empty{border:1px dashed var(--ink4);color:var(--ink4);background:transparent}
.cl-dd{border:1px solid var(--line2);background:var(--surface);color:var(--ink2);border-radius:8px;height:30px;padding:0 8px;font:inherit;font-size:12px;outline:none;cursor:pointer}
.cl-date{display:inline-flex;align-items:center;gap:6px;color:var(--ink3)}
.cl-date input{border:0;background:transparent;font:inherit;font-size:12px;color:var(--ink2);outline:none}
.cl-clear{border:0;background:transparent;color:var(--red);font-size:12px;cursor:pointer;padding:0 6px}
.cl-view{font-size:12px;color:var(--ink3)}
.cl-view b{color:var(--ink);font-weight:500}
.cl-scrim{position:fixed;inset:0;z-index:40}
.cl-grp{margin-top:22px}
.cl-gh{display:flex;align-items:center;gap:8px;padding:0 4px 9px}
.cl-gh h3{margin:0;font-size:12.5px;font-weight:600;color:var(--ink)}
.cl-chev{width:20px;height:20px;border:0;background:transparent;color:var(--ink3);display:inline-flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;padding:0;margin-left:-4px;transition:transform .15s}
.cl-chev:hover{color:var(--ink);background:var(--seg)}
.cl-chev svg{width:11px;height:11px}
.cl-gh.closed .cl-chev{transform:rotate(-90deg)}
.cl-gh.closed{padding-bottom:2px}
.cl-gh .cl-n{font-size:12px;color:var(--ink3)}
.cl-gh .cl-late{font-size:12px;color:var(--red)}
.cl-gadd{margin-left:auto;border:0;background:transparent;color:var(--ink3);font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.cl-gadd:hover{color:var(--ink);background:var(--seg)}
.cl-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cl-list{background:var(--surface);border:1px solid var(--card);border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:border-color .15s;position:relative}
/* accentlijn bovenaan elk blok in de kleur van de status */
.cl-list::before{content:"";position:absolute;inset:-1px;border-top:3px solid var(--acc);border-radius:14px;pointer-events:none;z-index:1}
.cl-list.over{border-style:dashed}
.cl-empty{padding:12px 18px;color:var(--ink4);font-size:12.5px}
.cl-row{display:grid;grid-template-columns:minmax(0,1fr) 160px 150px 90px 32px;align-items:center;gap:20px;padding:12px 14px 12px 18px;border-top:1px solid var(--line);cursor:pointer;transition:background .12s;position:relative}
.cl-row:first-child{border-top:0;border-radius:14px 14px 0 0}
.cl-row:last-child{border-radius:0 0 14px 14px}
.cl-row:only-child{border-radius:14px}
.cl-row:hover{background:var(--hover)}
.cl-row.drag{opacity:.4}
.cl-tk{min-width:0}
.cl-tk .a{font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-tk .b{font-size:11.5px;color:var(--ink3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-who{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink2);min-width:0}
.cl-who span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-due{font-size:12px;color:var(--ink2)}
.cl-due small{display:block;font-size:11px;color:var(--ink3);margin-top:1px}
.cl-due.soon{color:var(--ink);font-weight:500}
.cl-due.late{color:var(--red);font-weight:500}
.cl-meta{display:flex;gap:10px;color:var(--ink3);font-size:11.5px}
.cl-meta span{display:inline-flex;align-items:center;gap:3px}
.cl-meta svg{width:12px;height:12px}
.cl-morewrap{position:relative;display:flex;justify-content:center}
.cl-more{border:0;background:transparent;color:var(--ink4);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1}
.cl-more:hover{color:var(--ink);background:var(--seg)}
.cl-menu{position:absolute;top:26px;right:0;z-index:50;background:var(--surface);border:1px solid var(--line2);border-radius:10px;box-shadow:var(--shadow);min-width:190px;padding:5px;cursor:default}
.cl-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;text-align:left;padding:7px 9px;border-radius:7px;font-size:12.5px;color:var(--ink);cursor:pointer;white-space:nowrap}
.cl-menu button:hover{background:var(--seg)}
.cl-menu button.danger{color:var(--red)}
.cl-mh{font-size:10.5px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;padding:6px 9px 4px}
.cl-sep{height:1px;background:var(--line);margin:5px 2px}
.cl-foot{margin-top:18px;font-size:11.5px;color:var(--ink4);text-align:center}
.cl-invert > div > div{filter:invert(.9) hue-rotate(180deg)}
.cl-invert > div > div img,.cl-invert > div > div video,.cl-invert > div > div iframe{filter:invert(1) hue-rotate(180deg)}
@media (max-width:900px){
  .cl-app{padding:16px 14px 40px}
  .cl-hd{padding-right:0}
  .cl-hd h1{font-size:18px}
  .cl-search{order:6;width:100%}
  .cl-view,.cl-foot{display:none}
  .cl-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"tk due" "who meta";gap:10px 12px;padding:14px}
  .cl-tk{grid-area:tk}.cl-who{grid-area:who}.cl-due{grid-area:due;text-align:right}
  .cl-meta{grid-area:meta;justify-content:flex-end;align-items:center}
  .cl-morewrap{position:absolute;right:8px;bottom:10px}
  .cl-meta{margin-right:30px}
}
`;
