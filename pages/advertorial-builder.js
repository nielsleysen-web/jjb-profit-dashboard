// pages/advertorial-builder.js
// Advertorial HTML Builder — wizard voor funnel builders.
// Library (databank) → 1 Setup → 2 Paste HTML (AI-run met voortgang) → 3 Review → 4 Images → Export.
// Motor: pages/api/advertorials.js · Publieke pagina: /a/<slug>

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
  page: { padding: "24px 30px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#ffffff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  input: { width: "100%", padding: "11px 14px", border: "1px solid #d7dce3", borderRadius: "10px", fontSize: "13.5px", fontFamily: "inherit", color: "#0f172a", outline: "none", boxSizing: "border-box" },
  btn: { fontSize: "12.5px", fontWeight: 700, padding: "10px 18px", borderRadius: "10px", border: "1px solid #d7dce3", background: "#fff", cursor: "pointer", fontFamily: "inherit", color: "#334155" },
  btnDark: { fontSize: "13px", fontWeight: 700, padding: "12px 24px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontFamily: "inherit" },
  chip: { fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px", display: "inline-block" },
};

const MARKETS = [
  { value: "Italy", label: "🇮🇹 Italian — Italy" },
  { value: "France", label: "🇫🇷 French — France" },
  { value: "Israel", label: "🇮🇱 Hebrew — Israel" },
  { value: "Sweden", label: "🇸🇪 Swedish — Sweden" },
];
const SOURCE_LANGS = ["auto", "German", "English", "French", "Italian", "Dutch", "Spanish", "Swedish"];
const CATEGORY_META = {
  product: "📦 Product name",
  currency: "💶 Currency & prices",
  places: "📍 Cities & country",
  people: "👤 Person names",
  institutions: "🏥 Institutions",
  brands: "🏷️ Brands",
  units: "📏 Units & sizes",
  dates: "📅 Dates",
  numbers: "🔢 Numbers",
  other: "✨ Other",
};

const marketLabel = (m) => (MARKETS.find((x) => x.value === m) || {}).label || m;
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AdvertorialBuilder() {
  const isMobile = useIsMobile();
  const [me, setMe] = useState(null);
  const [funnelBuilders, setFunnelBuilders] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [screen, setScreen] = useState("library"); // library | wizard
  const [step, setStep] = useState(1);
  const [build, setBuild] = useState(null); // volledige buildrecord
  const [localizedHtml, setLocalizedHtml] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Setup-velden
  const [taskName, setTaskName] = useState("");
  const [builderEmail, setBuilderEmail] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [ownProductName, setOwnProductName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetMarket, setTargetMarket] = useState("Italy");

  // Stap 2/3/4-state
  const [pastedHtml, setPastedHtml] = useState("");
  const [queueStatus, setQueueStatus] = useState(null);
  const [device, setDevice] = useState("mobile");
  const [openCat, setOpenCat] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBuilder, setFilterBuilder] = useState("");
  const [filterMarket, setFilterMarket] = useState("");
  const pollRef = useRef(null);

  const api = async (body) => {
    const r = await fetch("/api/advertorials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    if (!r.success) throw new Error(r.error || "Request failed");
    return r;
  };

  const loadLibrary = async () => {
    try {
      const r = await fetch("/api/advertorials?list=1").then((x) => x.json());
      if (r.success) {
        setBuilds(r.builds || []);
        setMe(r.me);
      } else setError(r.error);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadLibrary();
    fetch("/api/launch-tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (r?.success) {
          setFunnelBuilders(r.funnelBuilders || []);
          if (r.me?.email) setBuilderEmail((prev) => prev || r.me.email);
        }
      })
      .catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  const loadBuild = async (id, full) => {
    const r = await fetch(`/api/advertorials?id=${id}${full ? "&full=1" : ""}`).then((x) => x.json());
    if (!r.success) throw new Error(r.error);
    setBuild(r.build);
    if (full) setLocalizedHtml(r.build.localizedHtml || "");
    return r.build;
  };

  /* ---------- polling tijdens de AI-run ---------- */
  const startPolling = (id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/advertorials?id=${id}&status=1`).then((x) => x.json());
        if (!r.success) return;
        setQueueStatus(r);
        if (r.status === "review") {
          clearInterval(pollRef.current);
          await loadBuild(id, true);
          setStep(3);
        }
      } catch {}
    }, 3000);
  };

  /* ---------- acties ---------- */
  const openWizard = async (entry) => {
    setError("");
    setPublishedUrl("");
    try {
      const b = await loadBuild(entry.id, true);
      setScreen("wizard");
      if (b.status === "draft-setup") setStep(2);
      else if (b.status === "processing") {
        setStep(2);
        setQueueStatus({ status: "processing", queue: b.queue });
        startPolling(b.id);
      } else setStep(3);
    } catch (e) {
      setError(e.message);
    }
  };

  const createBuild = async () => {
    setBusy(true);
    setError("");
    try {
      const fb = funnelBuilders.find((f) => f.email === builderEmail);
      const r = await api({ action: "create", taskName, builderEmail, builderName: fb?.name || me?.name, competitorName, ownProductName, sourceLanguage, targetMarket });
      await loadBuild(r.id, false);
      setStep(2);
      setScreen("wizard");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const submitHtml = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api({ action: "saveHtml", id: build.id, html: pastedHtml });
      setQueueStatus({ status: "processing", queue: { chunksTotal: r.chunks, chunksDone: 0, imagesDone: 0, active: true }, imagesTotal: r.images });
      startPolling(build.id);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const resumeRun = async () => {
    try {
      await api({ action: "resume", id: build.id });
      startPolling(build.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const decideLink = async (href, decision) => {
    try {
      await api({ action: "decideLink", id: build.id, href, decision });
      setBuild((b) => ({ ...b, links: b.links.map((l) => (l.href === href ? { ...l, decision } : l)) }));
    } catch (e) {
      setError(e.message);
    }
  };

  const editChange = async (c) => {
    const next = prompt("Edit this localisation:", c.after);
    if (next == null || next === c.after) return;
    try {
      await api({ action: "editChange", id: build.id, changeId: c.id, after: next });
      const b = await loadBuild(build.id, true);
      setBuild(b);
    } catch (e) {
      setError(e.message);
    }
  };

  const decideImage = async (url, decision, newUrl) => {
    try {
      await api({ action: "decideImage", id: build.id, url, decision, newUrl });
      setBuild((b) => ({ ...b, images: b.images.map((i) => (i.url === url ? { ...i, decision, newUrl: newUrl || "" } : i)) }));
    } catch (e) {
      setError(e.message);
    }
  };

  const uploadReplacement = async (img, file) => {
    if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) return setError("Max 3 MB per image — resize it first");
    setBusy(true);
    setError("");
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const up = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, mimeType: file.type, data }) }).then((r) => r.json());
      if (!up.success) throw new Error(up.error || "Upload failed");
      await decideImage(img.url, "replace", up.url);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api({ action: "publish", id: build.id });
      setPublishedUrl(r.url);
      await loadLibrary();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const copyUrl = (url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const downloadHtml = async () => {
    const html = localizedHtml || "";
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${build.slug}.html`;
    a.click();
  };

  /* ================= render-helpers ================= */
  const StepBar = () => {
    const steps = ["Setup", "Paste HTML", "Review", "Images"];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 0 18px 0", fontSize: "11px", fontWeight: 600, flexWrap: "wrap" }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ padding: "5px 12px", borderRadius: "999px", background: active ? "#0f172a" : done ? "#f0fdf4" : "#fff", color: active ? "#fff" : done ? "#16a34a" : "#94a3b8", border: active || done ? "none" : "1px solid #eceef2" }}>
                {done ? "✓ " : ""}{n} {label}
              </span>
              {n < steps.length && <span style={{ color: "#cbd5e1" }}>─</span>}
            </span>
          );
        })}
      </div>
    );
  };

  const ErrorBar = () =>
    error ? (
      <div style={{ ...ui.card, padding: "10px 14px", marginBottom: "14px", background: "#fef2f2", borderColor: "#fecaca", fontSize: "12.5px", color: "#b91c1c" }}>
        {error} <a onClick={() => setError("")} style={{ marginLeft: "8px", cursor: "pointer", fontWeight: 700 }}>✕</a>
      </div>
    ) : null;

  /* ================= LIBRARY ================= */
  if (screen === "library") {
    const filtered = builds.filter(
      (b) =>
        (!search || (b.taskName || "").toLowerCase().includes(search.toLowerCase())) &&
        (!filterBuilder || b.builderEmail === filterBuilder) &&
        (!filterMarket || b.targetMarket === filterMarket)
    );
    return (
      <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "4px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px" }}>🛠️ Advertorial HTML Builder</h1>
            <p style={{ margin: "3px 0 0 0", fontSize: "12.5px", color: "#8a92a3" }}>{builds.length} advertorials built · every build is saved and editable</p>
          </div>
          <button
            style={ui.btnDark}
            onClick={() => {
              setBuild(null);
              setTaskName("");
              setCompetitorName("");
              setOwnProductName("");
              setPastedHtml("");
              setPublishedUrl("");
              setQueueStatus(null);
              setStep(1);
              setScreen("wizard");
            }}
          >
            + New advertorial
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", margin: "14px 0", flexWrap: "wrap" }}>
          <input style={{ ...ui.input, maxWidth: "340px" }} placeholder="🔍 Search by task name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select style={{ ...ui.input, width: "auto" }} value={filterBuilder} onChange={(e) => setFilterBuilder(e.target.value)}>
            <option value="">All builders</option>
            {funnelBuilders.map((f) => (
              <option key={f.email} value={f.email}>{f.name}</option>
            ))}
          </select>
          <select style={{ ...ui.input, width: "auto" }} value={filterMarket} onChange={(e) => setFilterMarket(e.target.value)}>
            <option value="">All markets</option>
            {MARKETS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <ErrorBar />
        <div style={{ ...ui.card, overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr>
                {["Task name", "Builder", "Market", "Status", "Last edited", ""].map((h) => (
                  <th key={h} style={{ ...ui.label, padding: "11px 12px", textAlign: "left", borderBottom: "1px solid #eceef2" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No builds yet — hit “+ New advertorial”.</td></tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #f4f5f7" }}>
                    <td style={{ padding: "11px 12px", fontWeight: 700 }}>{b.taskName}</td>
                    <td style={{ padding: "11px 12px" }}>{b.builderName || b.builderEmail}</td>
                    <td style={{ padding: "11px 12px" }}>{marketLabel(b.targetMarket)}</td>
                    <td style={{ padding: "11px 12px" }}>
                      {b.status === "live" ? (
                        <span style={{ ...ui.chip, background: "#f0fdf4", color: "#16a34a" }}>● Live</span>
                      ) : b.status === "processing" ? (
                        <span style={{ ...ui.chip, background: "#eef2ff", color: "#4f46e5" }}>⚙ Processing</span>
                      ) : (
                        <span style={{ ...ui.chip, background: "#fffbeb", color: "#b45309" }}>Draft</span>
                      )}
                    </td>
                    <td style={{ padding: "11px 12px", color: "#64748b" }}>{fmtWhen(b.updatedAt)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {b.status === "live" && (
                        <button style={{ ...ui.btn, padding: "7px 12px", fontSize: "11.5px", marginRight: "6px" }} onClick={() => copyUrl(`${window.location.origin}/a/${b.slug}`)}>
                          {copied ? "✓ Copied" : "📋 Link"}
                        </button>
                      )}
                      <button style={{ ...ui.btn, padding: "7px 12px", fontSize: "11.5px", marginRight: "6px" }} onClick={() => openWizard(b)}>
                        {b.status === "live" ? "✎ Edit" : "▶ Continue"}
                      </button>
                      <button
                        style={{ ...ui.btn, padding: "7px 12px", fontSize: "11.5px" }}
                        onClick={async () => {
                          try {
                            await api({ action: "duplicate", id: b.id });
                            loadLibrary();
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        ⧉
                      </button>
                      {me?.admin && (
                        <button
                          style={{ ...ui.btn, padding: "7px 10px", fontSize: "11.5px", color: "#dc2626", marginLeft: "6px" }}
                          onClick={async () => {
                            if (!confirm(`Delete "${b.taskName}"? The live link stops working.`)) return;
                            try {
                              await api({ action: "delete", id: b.id });
                              loadLibrary();
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ================= WIZARD ================= */
  const pendingLinks = (build?.links || []).filter((l) => l.decision === "pending");
  const pendingImages = (build?.images || []).filter((i) => i.decision === "pending");

  return (
    <div style={{ ...ui.page, padding: isMobile ? "16px" : ui.page.padding }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "-0.4px" }}>
          🛠️ Advertorial HTML Builder
          {build && <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: "14px" }}> — {build.taskName}</span>}
        </h1>
        <button style={ui.btn} onClick={() => { clearInterval(pollRef.current); setScreen("library"); loadLibrary(); }}>← Library</button>
      </div>
      <StepBar />
      <ErrorBar />

      {/* ========== STAP 1: SETUP ========== */}
      {step === 1 && (
        <div style={{ ...ui.card, maxWidth: "680px", padding: "26px 28px" }}>
          <div style={{ marginBottom: "18px" }}>
            <span style={ui.label}>Funnel Builder</span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              {(funnelBuilders.length ? funnelBuilders : me ? [{ name: me.name, email: me.email }] : []).map((f) => (
                <div
                  key={f.email}
                  onClick={() => setBuilderEmail(f.email)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 15px 7px 7px", borderRadius: "999px", cursor: "pointer", fontSize: "13px",
                    border: builderEmail === f.email ? "2px solid #2563eb" : "1px solid #d7dce3",
                    background: builderEmail === f.email ? "#eff6ff" : "#fff",
                    fontWeight: builderEmail === f.email ? 700 : 600,
                    color: builderEmail === f.email ? "#1d4ed8" : "#64748b",
                  }}
                >
                  <span style={{ width: "26px", height: "26px", borderRadius: "999px", background: "#0e7490", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                    {(f.name || f.email).charAt(0).toUpperCase()}
                  </span>
                  {f.name || f.email}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: "18px" }}>
            <span style={ui.label}>Task name</span>
            <input style={{ ...ui.input, marginTop: "6px" }} placeholder="e.g. HepaFlush IT — advertorial v1" value={taskName} onChange={(e) => setTaskName(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 34px 1fr", gap: "8px", alignItems: "end", marginBottom: "18px" }}>
            <div>
              <span style={ui.label}>Competitor product name</span>
              <input style={{ ...ui.input, marginTop: "6px" }} placeholder="e.g. LeberVital Pro" value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} />
            </div>
            {!isMobile && <div style={{ textAlign: "center", paddingBottom: "11px", color: "#2563eb", fontWeight: 700, fontSize: "17px" }}>→</div>}
            <div>
              <span style={ui.label}>Your product name</span>
              <input style={{ ...ui.input, marginTop: "6px" }} placeholder="e.g. HepaFlush" value={ownProductName} onChange={(e) => setOwnProductName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 34px 1fr", gap: "8px", alignItems: "end", marginBottom: "8px" }}>
            <div>
              <span style={ui.label}>Source language</span>
              <select style={{ ...ui.input, marginTop: "6px" }} value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
                {SOURCE_LANGS.map((l) => (
                  <option key={l} value={l}>{l === "auto" ? "✨ Auto-detect (from pasted HTML)" : l}</option>
                ))}
              </select>
            </div>
            {!isMobile && <div style={{ textAlign: "center", paddingBottom: "11px", color: "#2563eb", fontWeight: 700, fontSize: "17px" }}>→</div>}
            <div>
              <span style={ui.label}>Target language & market</span>
              <select style={{ ...ui.input, marginTop: "6px" }} value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)}>
                {MARKETS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ fontSize: "11.5px", color: "#a4adbd", margin: "0 0 18px 0" }}>The target market drives everything: currency, cities, institutions, names, units, sizes, date & number formats.</p>
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
            <button style={{ ...ui.btnDark, opacity: taskName && competitorName && ownProductName ? 1 : 0.4 }} disabled={busy || !taskName || !competitorName || !ownProductName} onClick={createBuild}>
              {busy ? "Creating…" : "Next — Paste HTML →"}
            </button>
          </div>
        </div>
      )}

      {/* ========== STAP 2: PASTE HTML ========== */}
      {step === 2 && build && !queueStatus && (
        <div style={{ ...ui.card, maxWidth: "860px", padding: "24px 26px" }}>
          <span style={ui.label}>Paste the competitor's full page HTML</span>
          <p style={{ fontSize: "12px", color: "#8a92a3", margin: "4px 0 10px 0" }}>
            Right-click the competitor page → View page source → select all → copy → paste here. Scripts and tracking are stripped automatically.
          </p>
          <textarea
            style={{ ...ui.input, height: "320px", fontFamily: "monospace", fontSize: "11.5px", resize: "vertical" }}
            placeholder="<!DOCTYPE html> …"
            value={pastedHtml}
            onChange={(e) => setPastedHtml(e.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
            <span style={{ fontSize: "11.5px", color: "#a4adbd" }}>{pastedHtml.length.toLocaleString()} characters</span>
            <button style={{ ...ui.btnDark, opacity: pastedHtml.trim().length > 500 ? 1 : 0.4 }} disabled={busy || pastedHtml.trim().length < 500} onClick={submitHtml}>
              {busy ? "Starting…" : "Localise → " + (MARKETS.find((m) => m.value === build.targetMarket)?.label || build.targetMarket)}
            </button>
          </div>
        </div>
      )}

      {/* ========== STAP 2b: VOORTGANG ========== */}
      {step === 2 && queueStatus && (
        <div style={{ ...ui.card, maxWidth: "620px", padding: "28px", textAlign: "center" }}>
          <div style={{ fontSize: "34px", marginBottom: "8px" }}>🧠</div>
          <h2 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "4px" }}>Localising your advertorial…</h2>
          <p style={{ fontSize: "12.5px", color: "#8a92a3", marginBottom: "18px" }}>Runs on the server — you can close this tab and come back via the Library.</p>
          {(() => {
            const q = queueStatus.queue || {};
            const imagesTotal = queueStatus.imagesTotal ?? (build?.images || []).length;
            const total = (q.chunksTotal || 0) + imagesTotal;
            const done = (q.chunksDone || 0) + (q.imagesDone || 0);
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <>
                <div style={{ height: "8px", background: "#eef0f3", borderRadius: "999px", overflow: "hidden", marginBottom: "8px" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#8b5cf6", transition: "width 0.5s" }} />
                </div>
                <p style={{ fontSize: "12px", color: "#64748b" }}>
                  {q.chunksDone || 0}/{q.chunksTotal || 0} text sections · {q.imagesDone || 0}/{imagesTotal} images analysed
                </p>
                {queueStatus.error && !q.active && (
                  <div style={{ marginTop: "14px" }}>
                    <p style={{ fontSize: "12px", color: "#b91c1c", marginBottom: "8px" }}>{queueStatus.error}</p>
                    <button style={ui.btnDark} onClick={resumeRun}>↻ Resume</button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ========== STAP 3: REVIEW ========== */}
      {step === 3 && build && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
            <button style={{ ...ui.btnDark, opacity: pendingLinks.length ? 0.4 : 1 }} disabled={!!pendingLinks.length} onClick={() => setStep(4)} title={pendingLinks.length ? "Resolve the link decisions first" : ""}>
              Next — Images → {pendingLinks.length ? `(${pendingLinks.length} links left)` : ""}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "440px 1fr", gap: "14px", alignItems: "start" }}>
            <div>
              {pendingLinks.length > 0 && (
                <div style={{ ...ui.card, padding: "14px 16px", marginBottom: "12px", background: "#fffbeb", borderColor: "#fde68a" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#92400e", marginBottom: "8px" }}>⚠ Needs your decision ({pendingLinks.length})</div>
                  {pendingLinks.map((l) => (
                    <div key={l.href} style={{ fontSize: "12px", padding: "8px 10px", background: "#fff", borderRadius: "10px", marginBottom: "6px", border: "1px solid #fde68a" }}>
                      <div style={{ marginBottom: "6px", wordBreak: "break-all" }}>
                        <b>{l.text || "Link"}</b> → <span style={{ color: "#94a3b8" }}>{l.href.slice(0, 70)}</span> <span style={{ color: "#cbd5e1" }}>×{l.count}</span>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px" }} onClick={() => decideLink(l.href, "next-step")}>Set #next-step</button>
                        <button
                          style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px" }}
                          onClick={() => {
                            const u = prompt("Enter the URL for this link:");
                            if (u) decideLink(l.href, u);
                          }}
                        >
                          Own URL…
                        </button>
                        <button style={{ ...ui.btn, padding: "5px 10px", fontSize: "11px", color: "#b91c1c" }} onClick={() => decideLink(l.href, "remove")}>Remove link</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ ...ui.card, padding: "14px 16px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "10px" }}>
                  Changes — {(build.changes || []).length} applied
                  {build.removedScripts > 0 && <span style={{ ...ui.chip, background: "#fef2f2", color: "#dc2626", marginLeft: "8px" }}>🧹 {build.removedScripts} scripts removed</span>}
                </div>
                {Object.entries(CATEGORY_META).map(([cat, label]) => {
                  const items = (build.changes || []).filter((c) => c.category === cat);
                  if (!items.length) return null;
                  const low = items.filter((c) => c.confidence === "low").length;
                  const open = openCat === cat;
                  return (
                    <div key={cat} style={{ border: "1px solid #f1f5f9", borderRadius: "12px", marginBottom: "7px" }}>
                      <div onClick={() => setOpenCat(open ? "" : cat)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", cursor: "pointer" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: 700, flex: 1 }}>{label}</span>
                        {low > 0 && <span style={{ ...ui.chip, background: "#fffbeb", color: "#b45309" }}>{low} ⚠</span>}
                        <span style={{ ...ui.chip, background: "#f1f5f9", color: "#64748b" }}>{items.length}</span>
                        <span style={{ color: "#94a3b8" }}>{open ? "▾" : "▸"}</span>
                      </div>
                      {open && (
                        <div style={{ padding: "0 12px 10px 12px", fontSize: "12px", lineHeight: 1.5 }}>
                          {items.map((c) => (
                            <div key={c.id} style={{ padding: "7px 10px", background: c.confidence === "low" ? "#fefce8" : "#f8fafc", borderRadius: "8px", marginBottom: "5px", border: c.confidence === "low" ? "1px solid #fde68a" : "none" }}>
                              {c.confidence === "low" && "⚠ "}
                              <span style={{ color: "#b91c1c", textDecoration: "line-through", textDecorationColor: "rgba(185,28,28,0.4)" }}>{c.before}</span>{" → "}
                              <span style={{ color: "#15803d", fontWeight: 600 }}>{c.after}</span>
                              <span onClick={() => editChange(c)} style={{ color: "#94a3b8", cursor: "pointer", marginLeft: "6px" }}>✎</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* preview */}
            <div style={{ ...ui.card, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Live preview <span style={{ color: "#94a3b8", fontWeight: 600 }}>— {marketLabel(build.targetMarket)}</span></span>
                <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "10px", padding: "3px" }}>
                  {["mobile", "desktop"].map((d) => (
                    <button key={d} onClick={() => setDevice(d)} style={{ padding: "6px 14px", background: device === d ? "#fff" : "transparent", color: device === d ? "#0f172a" : "#64748b", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", boxShadow: device === d ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>
                      {d === "mobile" ? "📱 Mobile" : "🖥️ Desktop"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", background: "#eef1f5", borderRadius: "12px", padding: "14px 0" }}>
                <iframe
                  title="preview"
                  srcDoc={localizedHtml || "<p style='font-family:sans-serif;padding:30px;color:#94a3b8'>Loading preview…</p>"}
                  sandbox=""
                  style={{ width: device === "mobile" ? "375px" : "100%", maxWidth: device === "mobile" ? "375px" : "96%", height: "72vh", border: "1px solid #d7dce3", borderRadius: device === "mobile" ? "18px" : "10px", background: "#fff" }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========== STAP 4: IMAGES + EXPORT ========== */}
      {step === 4 && build && !publishedUrl && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <button style={ui.btn} onClick={() => setStep(3)}>← Back to review</button>
            <button style={{ ...ui.btnDark, opacity: pendingImages.length ? 0.4 : 1 }} disabled={busy || !!pendingImages.length} onClick={publish} title={pendingImages.length ? "Decide the remaining images first" : ""}>
              {busy ? "Publishing… (re-hosting images)" : `Generate HTML → ${pendingImages.length ? `(${pendingImages.length} undecided)` : ""}`}
            </button>
          </div>
          <div style={{ ...ui.card, padding: "10px 16px", marginBottom: "12px", display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", alignItems: "center" }}>
            <b>{(build.images || []).length} images found</b>
            <span style={{ ...ui.chip, background: "#fef2f2", color: "#dc2626" }}>⚠ {(build.images || []).filter((i) => i.containsText).length} contain text</span>
            <span style={{ ...ui.chip, background: "#f0fdf4", color: "#16a34a" }}>{(build.images || []).filter((i) => i.decision !== "pending").length} decided</span>
            <span style={{ color: "#a4adbd", marginLeft: "auto", fontSize: "11.5px" }}>Keep = re-hosted on your Shopify CDN at publish · Replace = upload your own</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "12px" }}>
            {(build.images || []).map((img, idx) => (
              <div key={img.url} style={{ ...ui.card, padding: "11px", borderColor: img.decision === "pending" ? "#fde68a" : "#eceef2" }}>
                <div style={{ height: "130px", borderRadius: "10px", background: "#f1f5f9", overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.newUrl || img.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  <div style={{ position: "absolute", top: "7px", left: "7px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {img.containsText && <span style={{ ...ui.chip, background: "#dc2626", color: "#fff" }}>⚠ Contains text</span>}
                    {img.isProduct && <span style={{ ...ui.chip, background: "#dc2626", color: "#fff" }}>⚠ Product shot</span>}
                    {img.kind === "background" && <span style={{ ...ui.chip, background: "#eef2ff", color: "#4f46e5" }}>CSS background</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", margin: "9px 0 3px 0" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, flex: 1 }}>Image {idx + 1}</span>
                  <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>used {img.count}×</span>
                </div>
                {img.description && <div style={{ fontSize: "11px", color: "#8a92a3", marginBottom: "6px" }}>{img.description}</div>}
                <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: "8px", color: img.decision === "pending" ? "#b45309" : "#16a34a" }}>
                  {img.decision === "pending" ? "Undecided" : img.decision === "replace" ? "✓ Replaced — on Shopify CDN" : "✓ Keep — re-hosted at publish"}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <label style={{ ...ui.btn, ...(img.decision === "pending" ? { background: "#0f172a", color: "#fff", border: "none" } : {}), flex: 1, textAlign: "center", padding: "8px 6px", fontSize: "11.5px", cursor: "pointer" }}>
                    ⬆ {img.decision === "replace" ? "Change upload" : "Upload replacement"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadReplacement(img, e.target.files?.[0])} />
                  </label>
                  <button style={{ ...ui.btn, flex: 1, padding: "8px 6px", fontSize: "11.5px" }} onClick={() => decideImage(img.url, "keep")}>
                    {img.containsText || img.isProduct ? "Keep anyway" : "Keep"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== EXPORT / SUCCES ========== */}
      {step === 4 && publishedUrl && (
        <div style={{ ...ui.card, maxWidth: "640px", padding: "28px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "6px" }}>🎉</div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Your advertorial is live</h2>
          <p style={{ fontSize: "12.5px", color: "#8a92a3", marginBottom: "16px" }}>{build.taskName} · {marketLabel(build.targetMarket)}</p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <div style={{ flex: 1, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "12.5px", fontFamily: "monospace", color: "#1d4ed8", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {publishedUrl}
            </div>
            <button style={ui.btnDark} onClick={() => copyUrl(publishedUrl)}>{copied ? "✓ Copied" : "📋 Copy link"}</button>
          </div>
          <p style={{ fontSize: "11.5px", color: "#64748b", marginBottom: "16px" }}>
            Paste this link in Funnelish. <b>Edits made later update this same link automatically.</b>
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", borderTop: "1px solid #f1f5f9", paddingTop: "14px", flexWrap: "wrap" }}>
            <a href={publishedUrl} target="_blank" rel="noreferrer" style={{ ...ui.btn, textDecoration: "none", display: "inline-block" }}>👁 Preview page</a>
            <button style={ui.btn} onClick={downloadHtml}>⬇ Download .html</button>
            <button style={ui.btn} onClick={() => setStep(3)}>✎ Back to editing</button>
            <button style={ui.btn} onClick={() => { setScreen("library"); loadLibrary(); }}>Library</button>
          </div>
        </div>
      )}
    </div>
  );
}
