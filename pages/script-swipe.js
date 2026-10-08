// pages/script-swipe.js — Script Swipe: drop a competitor's video, get the script sentence by sentence,
// write your own version next to each line. Transcription: ElevenLabs Scribe (via /api/script-swipe).
// Upload goes straight from the browser to Shopify Files (staged upload), so big videos are fine.
import { useEffect, useRef, useState } from "react";
import Head from "next/head";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  btn: (on) => ({ padding: "8px 14px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }),
  input: { padding: "9px 12px", borderRadius: "10px", border: "1px solid #e2e6ec", fontSize: "13.5px", fontFamily: "inherit", outline: "none" },
};
const fmtT = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const fmtD = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");

async function api(body) {
  const r = await fetch("/api/script-swipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.error || "Something went wrong");
  return d;
}

// Browser → Shopify staged upload (progress via XHR)
function uploadToTarget(target, file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const p of target.parameters) fd.append(p.name, p.value);
    fd.append("file", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", target.url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(fd);
  });
}

function AutoTextarea({ value, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = "0px"; el.style.height = Math.max(44, el.scrollHeight + 2) + "px"; }, [value]);
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", boxSizing: "border-box", border: "1px solid transparent", borderRadius: "8px", padding: "9px 10px", font: "inherit", fontSize: "14px", lineHeight: 1.5, resize: "none", background: value ? "#f0fdf4" : "#fafafa", outline: "none" }} onFocus={(e) => (e.target.style.borderColor = "#0f172a")} onBlur={(e) => (e.target.style.borderColor = "transparent")} />;
}

function NewScript({ onDone, enabled }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [state, setState] = useState(null); // { step, pct }
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const busy = !!state;

  const go = async () => {
    if (busy || (!file && !url.trim())) return;
    setErr("");
    try {
      let resourceUrl = null;
      if (file) {
        setState({ step: "Uploading video…", pct: 0 });
        const { target } = await api({ action: "stage", filename: file.name, mimeType: file.type || "video/mp4", size: file.size });
        await uploadToTarget(target, file, (pct) => setState({ step: "Uploading video…", pct }));
        resourceUrl = target.resourceUrl;
      }
      setState({ step: "Transcribing… (about 10–60 s)", pct: null });
      const d = await api({ action: "transcribe", resourceUrl, url: file ? "" : url.trim(), name: name.trim() || (file ? file.name.replace(/\.[^.]+$/, "") : "") });
      setState(null); setFile(null); setUrl(""); setName("");
      onDone(d.script);
    } catch (e) { setErr(e.message); setState(null); }
  };

  return (
    <div style={{ ...ui.card, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>New script</div>
      {!enabled && <div style={{ fontSize: 12.5, color: "#991b1b", marginBottom: 10 }}>ELEVENLABS_API_KEY is not set in Vercel, transcription is unavailable.</div>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setUrl(""); } }}
        onClick={() => document.getElementById("ss-file").click()}
        style={{ border: `2px dashed ${drag ? "#0f172a" : "#d6dbe3"}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", color: "#64748b", fontSize: 13.5, cursor: "pointer", background: drag ? "#f1f5f9" : "#fff" }}
      >
        {file ? <span style={{ color: "#0f172a", fontWeight: 600 }}>{file.name} · {(file.size / 1048576).toFixed(1)} MB</span> : <span>Drop a video here (mp4, mov, webm, mp3…) or click to choose</span>}
        <input id="ss-file" type="file" accept="video/*,audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUrl(""); } e.target.value = ""; }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 0", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#8a92a3" }}>or</span>
        <input style={{ ...ui.input, flex: 1, minWidth: 220 }} placeholder="Public video URL (direct .mp4 link)" value={url} onChange={(e) => { setUrl(e.target.value); if (e.target.value) setFile(null); }} />
        <input style={{ ...ui.input, width: 220 }} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <button style={ui.btn(true)} onClick={go} disabled={busy || !enabled || (!file && !url.trim())}>{busy ? state.step : "Transcribe"}</button>
      </div>
      {state?.pct != null && <div style={{ height: 6, background: "#e5e7eb", borderRadius: 999, marginTop: 10, overflow: "hidden" }}><div style={{ width: `${state.pct}%`, height: "100%", background: "#0f172a", transition: "width .2s" }} /></div>}
      {err && <div style={{ color: "#991b1b", fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  );
}

export default function ScriptSwipe() {
  const [list, setList] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);   // script object
  const [saved, setSaved] = useState("");   // "Saved", "Saving…"
  const dirty = useRef(false);
  const timer = useRef(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 900); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  const load = () => fetch("/api/script-swipe").then((r) => r.json()).then((d) => { if (d.success) { setList(d.scripts); setEnabled(d.elevenlabs); } else setErr(d.error || "Error"); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const openScript = async (id) => {
    setErr("");
    try { const r = await fetch(`/api/script-swipe?id=${id}`).then((x) => x.json()); if (!r.success) throw new Error(r.error); setOpen(r.script); setSaved(""); }
    catch (e) { setErr(e.message); }
  };

  // Autosave 1.2 s after the last keystroke
  const schedule = (next) => {
    setOpen(next); dirty.current = true; setSaved("Unsaved changes");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { setSaved("Saving…"); await api({ action: "save", id: next.id, name: next.name, sentences: next.sentences.map((s) => ({ i: s.i, mine: s.mine })) }); dirty.current = false; setSaved("Saved"); load(); }
      catch (e) { setSaved("Save failed: " + e.message); }
    }, 1200);
  };
  useEffect(() => { const h = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, []);

  const setMine = (i, v) => schedule({ ...open, sentences: open.sentences.map((s) => (s.i === i ? { ...s, mine: v } : s)) });
  const copyMine = async () => { const txt = open.sentences.map((s) => s.mine).filter(Boolean).join("\n"); try { await navigator.clipboard.writeText(txt); setSaved("Copied our version to clipboard"); } catch {} };
  const del = async (id) => { if (!window.confirm("Delete this script?")) return; await api({ action: "delete", id }); if (open?.id === id) setOpen(null); load(); };
  const done = open ? open.sentences.filter((s) => s.mine).length : 0;

  return (
    <div style={ui.page}>
      <Head><title>Script Swipe</title></Head>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Script Swipe</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: 3 }}>Drop a competitor's video, get the script line by line, write our version next to it</div></div>
      </div>
      {err && <div style={{ ...ui.card, padding: 14, color: "#991b1b", marginBottom: 14 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "300px 1fr", gap: 16, alignItems: "start" }}>
        <div>
          <NewScript enabled={enabled} onDone={(s) => { setOpen(s); setSaved(""); load(); }} />
          <div style={{ ...ui.card, padding: "14px 16px" }}>
            <div style={{ ...ui.label, marginBottom: 8 }}>Scripts</div>
            {list === null && <div style={{ color: "#8a92a3", fontSize: 13 }}>Loading…</div>}
            {list && list.length === 0 && <div style={{ color: "#8a92a3", fontSize: 13 }}>No scripts yet.</div>}
            {list && list.map((s) => (
              <div key={s.id} onClick={() => openScript(s.id)} style={{ padding: "9px 10px", borderRadius: 10, cursor: "pointer", background: open?.id === s.id ? "#f1f5f9" : "transparent", marginBottom: 2 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: "#8a92a3" }}>{s.count} lines · {s.done || 0} rewritten · {fmtD(s.updatedAt || s.createdAt)}{s.language ? ` · ${s.language}` : ""}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...ui.card, padding: "18px 20px", minHeight: 300 }}>
          {!open ? (
            <div style={{ color: "#8a92a3", fontSize: 14, padding: "40px 0", textAlign: "center" }}>Pick a script on the left, or drop a new video.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <input value={open.name} onChange={(e) => schedule({ ...open, name: e.target.value })} style={{ ...ui.input, fontWeight: 800, fontSize: 16, flex: 1, minWidth: 220, border: "1px solid transparent", background: "transparent" }} onFocus={(e) => (e.target.style.borderColor = "#e2e6ec")} onBlur={(e) => (e.target.style.borderColor = "transparent")} />
                <span style={{ fontSize: 12, color: saved.startsWith("Save failed") ? "#991b1b" : "#8a92a3" }}>{saved}</span>
                <a href={open.source} target="_blank" rel="noreferrer" style={ui.btn(false)}>▶ Open video</a>
                <button style={ui.btn(false)} onClick={copyMine} disabled={!done}>Copy our version</button>
                <form method="POST" action="/api/script-swipe" style={{ display: "inline" }} onSubmit={(e) => { e.preventDefault(); fetch("/api/script-swipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "csv", id: open.id }) }).then((r) => r.blob()).then((bl) => { const a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = `${open.name.replace(/[^\w\-]+/g, "_")}.csv`; a.click(); }); }}>
                  <button style={ui.btn(false)} type="submit">Export CSV</button>
                </form>
                <button style={{ ...ui.btn(false), color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => del(open.id)}>Delete</button>
              </div>
              <div style={{ fontSize: 12, color: "#8a92a3", marginBottom: 10 }}>{open.sentences.length} lines · {done} rewritten{open.language ? ` · spoken language: ${open.language}` : ""} · changes save automatically</div>
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "34px 48px 1fr 1fr", gap: "0 10px", alignItems: "start" }}>
                {!narrow && <div style={ui.label}>#</div>}{!narrow && <div style={ui.label}>Time</div>}<div style={ui.label}>Original</div><div style={ui.label}>Our version</div>
                {open.sentences.map((s) => (
                  <RowFragment key={s.i} s={s} narrow={narrow} onChange={(v) => setMine(s.i, v)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RowFragment({ s, narrow, onChange }) {
  const cell = { padding: "8px 0", borderTop: "1px solid #f1f3f6" };
  return (
    <>
      {!narrow && <div style={{ ...cell, fontSize: 12.5, color: "#8a92a3", paddingTop: 17 }}>{s.i}</div>}
      {!narrow && <div style={{ ...cell, fontSize: 12.5, color: "#8a92a3", paddingTop: 17, fontVariantNumeric: "tabular-nums" }}>{fmtT(s.t)}</div>}
      <div style={{ ...cell, fontSize: 14, lineHeight: 1.5, paddingTop: 17, paddingRight: 6 }}>{narrow && <span style={{ color: "#8a92a3", fontSize: 12 }}>{s.i} · {fmtT(s.t)} </span>}{s.text}</div>
      <div style={cell}><AutoTextarea value={s.mine} onChange={onChange} placeholder="Write our version…" /></div>
    </>
  );
}
