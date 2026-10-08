// components/membership/MemberActions.js — Customer service actions on a membership:
// Pause (30/60/90 days) · Resume · Cancel (with reason, refund request, chargeback risk) · Send magic link.
// All actions go through /api/membership-actions.
import { useState } from "react";

const PAUSE_OPTIONS = [30, 60, 90];
const RISKS = ["High", "Medium", "Low"];
const RISK_TONE = { High: ["#fee2e2", "#991b1b"], Medium: ["#fef3c7", "#92400e"], Low: ["#dcfce7", "#166534"] };

const s = {
  btn: { padding: "5px 10px", borderRadius: "8px", border: "1px solid #e2e6ec", background: "#fff", color: "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap" },
  danger: { color: "#b91c1c", borderColor: "#fecaca" },
  primary: { padding: "9px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
  ghost: { padding: "9px 16px", borderRadius: "10px", border: "1px solid #e2e6ec", background: "#fff", color: "#334155", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.6px", margin: "16px 0 6px" },
  seg: (on) => ({ flex: 1, padding: "9px 0", borderRadius: "9px", border: `1px solid ${on ? "#0f172a" : "#e2e6ec"}`, background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "13px", cursor: "pointer" }),
};

async function act(body) {
  const r = await fetch("/api/membership-actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.error || "Something went wrong");
  return d.result;
}

const fmtLong = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Modal({ title, sub, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.38)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px", width: "min(460px, 100%)", padding: "22px 24px", boxShadow: "0 24px 60px rgba(15,23,42,.25)", whiteSpace: "normal", textAlign: "left", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
        <div style={{ fontWeight: 800, fontSize: "17px" }}>{title}</div>
        {sub && <div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "2px" }}>{sub}</div>}
        {children}
      </div>
    </div>
  );
}

function PauseModal({ m, onClose, onDone }) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const until = new Date(Date.now() + days * 86400000);
  const go = async () => {
    setBusy(true); setErr("");
    try { await act({ action: "pause", provider: m.provider, subscriptionId: m.id, email: m.email, days }); onDone(`Membership paused until ${fmtLong(until)}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Pause membership" sub={`${m.name || m.email} · ${m.provider === "paypal" ? "PayPal" : "Stripe"}`} onClose={onClose}>
      <div style={s.label}>Pause for</div>
      <div style={{ display: "flex", gap: "8px" }}>{PAUSE_OPTIONS.map((d) => <button key={d} style={s.seg(days === d)} onClick={() => setDays(d)}>{d} days</button>)}</div>
      <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", lineHeight: 1.55, marginTop: "16px", color: "#334155" }}>
        Resumes automatically on <b>{fmtLong(until)}</b>. No charges until then, and the member area stays closed during the pause.
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: "13px", marginTop: "12px" }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
        <button style={s.ghost} onClick={onClose} disabled={busy}>Close</button>
        <button style={s.primary} onClick={go} disabled={busy}>{busy ? "Pausing…" : `Pause ${days} days`}</button>
      </div>
    </Modal>
  );
}

function CancelModal({ m, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(null);
  const [risk, setRisk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const ready = reason.trim() && refund !== null && risk;
  const go = async () => {
    if (!ready) { setErr("Please fill in all fields."); return; }
    setBusy(true); setErr("");
    try { await act({ action: "cancel", provider: m.provider, subscriptionId: m.id, email: m.email, reason, refundRequested: refund, chargebackRisk: risk }); onDone("Membership cancelled"); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Cancel membership" sub={`${m.name || m.email} · ${m.provider === "paypal" ? "PayPal" : "Stripe"}`} onClose={onClose}>
      <div style={s.label}>Date</div>
      <div style={{ fontSize: "13.5px", padding: "9px 12px", background: "#f8fafc", borderRadius: "9px", color: "#334155" }}>{today}</div>
      <div style={s.label}>Cancellation reason</div>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why does the customer want to cancel?" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e6ec", borderRadius: "9px", padding: "9px 12px", fontFamily: "inherit", fontSize: "13.5px", resize: "vertical", outline: "none" }} />
      <div style={s.label}>Refund request</div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={s.seg(refund === true)} onClick={() => setRefund(true)}>Yes</button>
        <button style={s.seg(refund === false)} onClick={() => setRefund(false)}>No</button>
      </div>
      <div style={s.label}>Chargeback risk</div>
      <div style={{ display: "flex", gap: "8px" }}>{RISKS.map((r) => <button key={r} style={s.seg(risk === r)} onClick={() => setRisk(r)}>{r}</button>)}</div>
      <div style={{ background: "#fef2f2", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", lineHeight: 1.5, marginTop: "16px", color: "#991b1b" }}>
        This cancels the subscription right away in {m.provider === "paypal" ? "PayPal" : "Stripe"}. No refund is issued automatically.
      </div>
      {err && <div style={{ color: "#b91c1c", fontSize: "13px", marginTop: "12px" }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
        <button style={s.ghost} onClick={onClose} disabled={busy}>Close</button>
        <button style={{ ...s.primary, background: ready ? "#b91c1c" : "#e5a3a3" }} onClick={go} disabled={busy}>{busy ? "Cancelling…" : "Cancel membership"}</button>
      </div>
    </Modal>
  );
}

// Buttons for one member row: Pause / Resume / Cancel (hidden once cancelled)
export function MemberActionButtons({ m, onChanged }) {
  const [open, setOpen] = useState(null); // pause | cancel
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!m?.id || m.status === "canceled") return <span style={{ color: "#c3c9d3" }}>—</span>;
  const done = (msg) => { setOpen(null); setNote(msg); onChanged && onChanged(); };
  const resume = async () => {
    if (!confirm(`Resume ${m.name || m.email}'s membership now? Billing starts again.`)) return;
    setBusy(true);
    try { await act({ action: "resume", provider: m.provider, subscriptionId: m.id, email: m.email }); done("Membership resumed"); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  return (
    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
      {m.status === "paused"
        ? <button style={s.btn} onClick={resume} disabled={busy}>{busy ? "…" : "Resume"}</button>
        : <button style={s.btn} onClick={() => setOpen("pause")}>Pause</button>}
      <button style={{ ...s.btn, ...s.danger }} onClick={() => setOpen("cancel")}>Cancel</button>
      {note && <span style={{ fontSize: "11.5px", color: "#16a34a" }}>✓</span>}
      {open === "pause" && <PauseModal m={m} onClose={() => setOpen(null)} onDone={done} />}
      {open === "cancel" && <CancelModal m={m} onClose={() => setOpen(null)} onDone={done} />}
    </span>
  );
}

// Small summary of what CS recorded when cancelling
export function CancellationInfo({ c, compact }) {
  if (!c) return null;
  const [bg, fg] = RISK_TONE[c.chargebackRisk] || ["#f1f5f9", "#64748b"];
  const chip = (txt, b, f) => <span style={{ display: "inline-block", background: b, color: f, fontWeight: 700, fontSize: "10.5px", padding: "2px 7px", borderRadius: "999px", marginRight: "4px", whiteSpace: "nowrap" }}>{txt}</span>;
  return (
    <div style={{ marginTop: compact ? "4px" : 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "normal" }} title={c.reason}>
      {chip(c.refundRequested ? "Refund requested" : "No refund", c.refundRequested ? "#fef3c7" : "#f1f5f9", c.refundRequested ? "#92400e" : "#64748b")}
      {chip(`Chargeback risk: ${c.chargebackRisk}`, bg, fg)}
      {!compact && <div style={{ marginTop: "6px", color: "#334155", fontSize: "12.5px", lineHeight: 1.5 }}><b>Reason:</b> {c.reason}<br /><span style={{ color: "#8a92a3" }}>Cancelled on {c.date}{c.by ? ` by ${c.by}` : ""}</span></div>}
    </div>
  );
}

// "Send magic link" — sends the customer a fresh login link for the member portal
export function MagicLinkButton({ email, small, brand }) {
  const [state, setState] = useState("idle"); // idle | busy | sent | error
  const [err, setErr] = useState("");
  const send = async (e) => {
    e.stopPropagation();
    if (state === "busy") return;
    setState("busy"); setErr("");
    try { await act({ action: "magicLink", email, brand }); setState("sent"); setTimeout(() => setState("idle"), 4000); }
    catch (x) { setErr(x.message); setState("error"); }
  };
  const label = state === "busy" ? "Sending…" : state === "sent" ? "✓ Sent" : "Send magic link";
  return (
    <button onClick={send} title={err || "Email the customer a new login link for the member portal (valid 20 minutes)"} style={{ ...s.btn, padding: small ? "4px 9px" : "7px 12px", color: state === "sent" ? "#16a34a" : state === "error" ? "#b91c1c" : "#334155", borderColor: state === "error" ? "#fecaca" : "#e2e6ec" }}>
      {state === "error" ? "Failed, retry" : label}
    </button>
  );
}
