// components/portal/Course.js — Health Courses: one course with its video lessons (#courses/<slug>/<lessonId>).
// Videos: Shopify Files mp4 (lib/portal-course-videos.js), played in our own <video> player with Italian/English
// subtitle tracks (WebVTT). Long lessons are split in parts that play one after the other. Progress (which lessons
// are done) is kept per device in localStorage: "jj-course-<slug>".
import { useEffect, useState } from "react";

const store = (slug) => `jj-course-${slug}`;
export function readDone(slug) {
  try { return JSON.parse(window.localStorage.getItem(store(slug)) || "{}") || {}; } catch { return {}; }
}
function writeDone(slug, v) {
  try { window.localStorage.setItem(store(slug), JSON.stringify(v)); } catch {}
}
export const useDone = (slug) => {
  const [done, setDone] = useState({});
  useEffect(() => { setDone(readDone(slug)); }, [slug]);
  const save = (v) => { setDone(v); writeDone(slug, v); };
  return [done, save];
};

const Check = () => (<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const Doc = () => (<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 2.5h6.5L15.5 6.5v11h-10.5z M11.5 2.5v4h4 M7.5 10.5h5 M7.5 13.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>);
const Back = () => (<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>);

// One lesson = one or more video parts; the next part starts by itself. Subtitles: one <track> at a time
// (Italian by default, English on the English portal), switchable with the "Sottotitoli" buttons under the video.
const SUBS_KEY = "jj-course-subs";
function Player({ t, lang, lesson, title, onEnded }) {
  const parts = lesson.parts || [];
  const [pi, setPi] = useState(0);
  const [auto, setAuto] = useState(false);
  const [sub, setSub] = useState(lang === "en" ? "en" : "it");
  useEffect(() => { try { const v = window.localStorage.getItem(SUBS_KEY); if (["it", "en", "off"].includes(v)) setSub(v); } catch {} }, []);
  const chooseSub = (v) => { setSub(v); try { window.localStorage.setItem(SUBS_KEY, v); } catch {} };
  const part = parts[pi];
  if (!part) return <div className="crs-video crs-soon"><span>{t("videosSoon")}</span></div>;
  const ended = () => { if (pi < parts.length - 1) { setAuto(true); setPi(pi + 1); } else onEnded(); };
  return (
    <>
      <div className="crs-video">
        <video key={part.key} src={part.src} controls playsInline preload="metadata" autoPlay={auto} onEnded={ended} title={title} controlsList="nodownload" disablePictureInPicture={false} onContextMenu={(e) => e.preventDefault()}>
          {sub !== "off" && <track key={sub} kind="subtitles" srcLang={sub} label={sub === "it" ? "Italiano" : "English"} src={part.subs[sub]} default />}
        </video>
      </div>
      <div className="crs-bar2">
        {parts.length > 1 && (
          <div className="crs-parts">
            {parts.map((p, i) => (
              <button type="button" key={p.key} className={i === pi ? "on" : ""} onClick={() => { setAuto(true); setPi(i); }}>{t("partN", { n: i + 1, total: parts.length })}</button>
            ))}
          </div>
        )}
        <div className="crs-subs" role="group" aria-label={t("subtitles")}>
          <span>{t("subtitles")}</span>
          {[["it", "IT"], ["en", "EN"], ["off", t("subsOff")]].map(([v, l]) => (
            <button type="button" key={v} className={sub === v ? "on" : ""} onClick={() => chooseSub(v)} aria-pressed={sub === v}>{l}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function CourseView({ t, lang, course, lessonId, nav }) {
  const c = course;
  const txt = c[lang] || c.it;
  const { sections, lessons, materials } = c.content;
  const [done, setDone] = useDone(c.slug);
  const total = lessons.length;
  const nDone = lessons.filter((l) => done[l.id]).length;
  const firstOpen = lessons.find((l) => !done[l.id]);
  const idx = Math.max(0, lessons.findIndex((l) => l.id === (lessonId || firstOpen?.id)));
  const cur = lessons[idx];
  const lt = cur[lang] || cur.it;
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const sec = sections.find((s) => s.id === cur.section);
  const open = (id) => nav(`courses/${c.slug}/${id}`);
  const markDone = () => {
    setDone({ ...done, [cur.id]: true });
    if (next) open(next.id);
  };
  const otherLang = c.videoLang && c.videoLang !== lang;

  return (
    <div className="crs">
      <button type="button" className="crs-back" onClick={() => nav("courses")}><Back />{t("allCourses")}</button>
      <h1>{txt.title}</h1>
      <div className="crs-prog">
        <div className="crs-bar"><i style={{ width: `${total ? (nDone / total) * 100 : 0}%` }} /></div>
        <span>{t("lessonsDone", { d: nDone, total })}</span>
      </div>

      <div className="card crs-player">
        <Player key={cur.id} t={t} lang={lang} lesson={cur} title={lt.title} onEnded={() => { if (!done[cur.id]) setDone({ ...done, [cur.id]: true }); }} />
        <div className="crs-info">
          <div className="crs-k">{t("lessonOf", { n: idx + 1, total })}{sec ? ` · ${sec[lang] || sec.it}` : ""}{otherLang && <span className="crs-lang">{t("videoInEn")}</span>}</div>
          <h2>{lt.title}</h2>
          {lt.desc && <p>{lt.desc}</p>}
          <div className="crs-nav">
            {prev ? <button type="button" className="btn sec" onClick={() => open(prev.id)}>{t("prevLesson")}</button> : <span />}
            {!done[cur.id]
              ? <button type="button" className="btn" onClick={markDone}>{t("markDone")}</button>
              : next
                ? <button type="button" className="btn" onClick={() => open(next.id)}>{t("nextLesson")}</button>
                : <span className="crs-done"><Check />{t("lessonDone")}</span>}
          </div>
          {nDone === total && <div className="crs-fin">{t("courseDone")}</div>}
        </div>
      </div>

      <h3 className="crs-h">{t("lessonsTitle")}</h3>
      <div className="card crs-list">
        {sections.map((s, si) => {
          const ls = lessons.filter((l) => l.section === s.id);
          if (!ls.length) return null;
          return (
            <div key={s.id} className="crs-sec">
              <div className="crs-st"><b>{si + 1}</b>{s[lang] || s.it}</div>
              {ls.map((l) => {
                const n = lessons.indexOf(l) + 1;
                const on = l.id === cur.id;
                return (
                  <button type="button" key={l.id} className={`crs-l${on ? " on" : ""}${done[l.id] ? " dn" : ""}`} onClick={() => open(l.id)} aria-current={on ? "true" : undefined}>
                    <span className="crs-n">{done[l.id] ? <Check /> : n}</span>
                    <span className="crs-t">{(l[lang] || l.it).title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {materials.length > 0 && (
        <>
          <h3 className="crs-h">{t("materials")}</h3>
          <div className="card crs-list crs-mat">
            {materials.map((m) => (
              <a key={m.id} href={m.href} target="_blank" rel="noopener noreferrer"><Doc />{m[lang] || m.it}<span>PDF</span></a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const COURSE_CSS = `
  .crs h1{margin-bottom:12px}
  .crs-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:0;margin:0 0 16px;font:inherit;font-size:15px;font-weight:600;color:#c96f43;cursor:pointer}
  .crs-back:hover{text-decoration:underline}
  .crs-prog{display:flex;align-items:center;gap:14px;margin:0 0 22px;font-size:14.5px;color:#666}
  .crs-bar{flex:0 0 200px;height:8px;background:#eeeae6;border-radius:99px;overflow:hidden}.crs-bar i{display:block;height:100%;background:#df8455;border-radius:99px;transition:width .3s}
  .crs-player{overflow:hidden;margin-bottom:30px}
  .crs-video{position:relative;padding-top:56.25%;background:#14110f}
  .crs-video video{position:absolute;inset:0;width:100%;height:100%;background:#14110f}
  .crs-video video::cue{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.35;color:#fff;background:rgba(0,0,0,.75)}
  .crs-soon span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#d8d2cc;font-size:16px;font-weight:600}
  .crs-bar2{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 24px 0}
  .crs-parts,.crs-subs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .crs-subs{margin-left:auto}.crs-subs span{font-size:13px;color:#888;margin-right:2px}
  .crs-parts button,.crs-subs button{font:inherit;font-size:13.5px;font-weight:700;border:1.5px solid #e2dcd6;background:#fff;color:#666;border-radius:999px;padding:6px 14px;cursor:pointer}
  .crs-subs button{padding:5px 11px;font-size:13px}
  .crs-parts button.on,.crs-subs button.on{border-color:#df8455;background:#fdf3ec;color:#c96f43}
  .crs-info{padding:20px 24px 22px}
  .crs-k{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.3px;color:#c96f43;text-transform:uppercase}
  .crs-lang{font-size:12px;font-weight:700;letter-spacing:0;text-transform:none;color:#666;background:#f3efeb;border-radius:999px;padding:3px 9px}
  .crs-info h2{font-size:22px;line-height:1.3;margin:8px 0 6px}
  .crs-info p{margin:0;color:#555;font-size:15.5px;line-height:1.55}
  .crs-nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:20px}
  .crs-nav .btn{padding:12px 20px;font-size:15.5px}
  .crs-done{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:#2d6b45}
  .crs-done svg{background:#e6f2ea;border-radius:50%;padding:4px;width:22px;height:22px}
  .crs-fin{margin-top:16px;padding:12px 16px;border-radius:12px;background:#eef6f0;color:#2d6b45;font-size:15px;font-weight:600}
  .crs-h{font-size:18px;margin:0 0 12px}
  .crs-list{padding:6px 0;margin-bottom:30px}
  .crs-sec+.crs-sec{border-top:1px solid #f0ece8}
  .crs-st{display:flex;align-items:center;gap:10px;padding:14px 22px 6px;font-size:13px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:#888}
  .crs-st b{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#fdeee4;color:#c96f43;font-size:12px}
  .crs-l{display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;border-left:3px solid transparent;padding:10px 22px 10px 19px;font:inherit;font-size:15.5px;color:#1a1a1a;text-align:left;cursor:pointer}
  .crs-l:hover{background:#fcf9f6}
  .crs-l.on{background:#fdf3ec;border-left-color:#df8455;font-weight:700}
  .crs-n{flex:0 0 26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid #e2dcd6;font-size:12.5px;font-weight:700;color:#888}
  .crs-l.on .crs-n{border-color:#df8455;color:#c96f43}
  .crs-l.dn .crs-n{background:#e6f2ea;border-color:#e6f2ea;color:#2d6b45}
  .crs-t{flex:1;line-height:1.4}
  .crs-mat a{display:flex;align-items:center;gap:12px;padding:12px 22px;text-decoration:none;font-size:15.5px;color:#1a1a1a}
  .crs-mat a+a{border-top:1px solid #f0ece8}
  .crs-mat a:hover{background:#fcf9f6}
  .crs-mat a svg{color:#c96f43;flex:none}
  .crs-mat a span{margin-left:auto;font-size:12px;font-weight:700;color:#999}
  .cc .cgo{margin-top:12px;align-self:flex-start;padding:12px 20px;font-size:15.5px}
  .cc .cpr{font-size:13px;color:#888;margin-top:6px}
  @media(max-width:800px){
    .crs-bar{flex:1}.crs-info{padding:16px 16px 18px}.crs-bar2{padding:12px 16px 0}.crs-subs{margin-left:0}.crs-video video::cue{font-size:15px}.crs-info h2{font-size:19px}
    .crs-nav{gap:10px}.crs-nav .btn{width:auto;flex:1 1 auto;min-width:0;white-space:normal;padding:12px 14px;font-size:15px}.crs-nav .btn.sec{flex:0 0 auto}.crs-st{padding:12px 16px 6px}.crs-l{padding:10px 16px 10px 13px}.crs-mat a{padding:12px 16px}
    .cc .cgo{width:100%}
  }
`;
