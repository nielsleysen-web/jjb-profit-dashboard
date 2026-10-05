// pages/members.js — Members: who is a member, since when, who logs in, who orders (fully in English).
// Source: /api/members (Redis member records + live Stripe/PayPal + Shopify portal orders).
// Customer service can resend the portal login link ("Send magic link") per member.
import { useState, useEffect, useMemo } from "react";
import { MagicLinkButton, CancellationInfo } from "../components/membership/MemberActions";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  btn: (on) => ({ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  th: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px", padding: "6px 6px", borderBottom: "1px solid #eceef2", whiteSpace: "nowrap", textAlign: "left", cursor: "pointer", userSelect: "none" },
  td: { padding: "8px 6px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: "12.5px" },
  input: { padding: "8px 12px", borderRadius: "10px", border: "1px solid #e2e6ec", fontSize: "13px", minWidth: "260px" },
};
const eur = (v) => (v == null ? "—" : `€${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtD = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");
const fmtDT = (s) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (s) => { if (!s) return "never"; const d = Math.floor((Date.now() - Date.parse(s)) / 86400000); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} d ago`; };
const STATUS = { trial: ["Trial", "#fef9c3", "#854d0e"], active: ["Paying", "#dcfce7", "#166534"], canceled: ["Cancelled", "#f1f5f9", "#64748b"], problem: ["Payment issue", "#fee2e2", "#991b1b"], paused: ["Paused", "#e0e7ff", "#3730a3"] };
const Pill = ({ s, stop }) => { const [t, bg, fg] = STATUS[s] || [s, "#f1f5f9", "#64748b"]; return <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: "11px", padding: "3px 8px", borderRadius: "999px" }}>{t}{stop ? " · ends" : ""}</span>; };
const Dot = ({ on, title }) => <span title={title} style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: on ? "#22c55e" : "#e2e6ec", marginRight: 6, verticalAlign: "middle" }} />;

const FILTERS = [
  ["all", "All"], ["trial", "Trial"], ["active", "Paying"], ["paused", "Paused"], ["problem", "Payment issue"], ["canceled", "Cancelled"],
  ["never", "Never logged in"], ["noclaim", "Logged in, nothing ordered"], ["ending", "Trial ends < 48 h, never logged in"], ["claimed", "Product ordered"], ["upsell", "Upsell 1+1"],
];
const COLS = [
  ["name", "Member"], ["magic", "Login link"], ["provider", "Via"], ["status", "Status"], ["startedAt", "Since"], ["days", "Days"], ["cycle", "Cycle"], ["trialEnd", "Trial ends"], ["nextBilling", "Next rebill"],
  ["rebills", "Rebills"], ["membershipRevenue", "Paid"], ["welcomeOpenedAt", "Welcome link"], ["firstLoginAt", "1st login"], ["lastLoginAt", "Last login"], ["loginCount", "Logins"], ["lastSeenAt", "Last active"],
  ["claims", "Products"], ["lastClaimAt", "Last product"], ["ebooks", "E-books"], ["upsell", "Upsell"], ["regift", "Regalo"],
];

function Tile({ label, value, sub, accent, onClick, on }) {
  return (
    <div onClick={onClick} style={{ ...ui.card, padding: "14px 16px", borderTop: accent ? `3px solid ${accent}` : undefined, cursor: onClick ? "pointer" : "default", outline: on ? "2px solid #0f172a" : "none" }}>
      <div style={ui.label}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px", margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: "11.5px", color: "#8a92a3", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function matches(m, f, now) {
  if (f === "all") return true;
  if (["trial", "active", "paused", "problem", "canceled"].includes(f)) return m.status === f;
  if (f === "never") return !m.firstLoginAt;
  if (f === "noclaim") return !!m.firstLoginAt && m.claims === 0;
  if (f === "ending") return m.status === "trial" && !m.firstLoginAt && m.trialEnd && Date.parse(m.trialEnd) - now < 2 * 86400000;
  if (f === "claimed") return m.claims > 0;
  if (f === "upsell") return !!m.upsell;
  return true;
}

function toCsv(rows) {
  const head = ["email", "name", "via", "status", "since", "days", "cycle", "trial_ends", "next_rebill", "rebills", "paid", "welcome_link", "first_login", "last_login", "logins", "last_active", "products", "last_product", "ebooks", "upsell", "first_order"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((m) => [m.email, m.name, m.provider, m.status, m.startedAt, m.days, m.cycle, m.trialEnd, m.nextBilling, m.rebills, m.membershipRevenue, m.welcomeOpenedAt, m.firstLoginAt, m.lastLoginAt, m.loginCount, m.lastSeenAt, m.claims, m.lastClaimAt, m.ebooks, m.upsell?.order || "", m.firstOrder].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

const EVENT_LABEL = { registered: "Signed up (first payment)", login: "Logged in", password_set: "Password set", claim: "Free product ordered", ebook: "E-book unlocked", rebill: "Rebill paid", cancelled: "Cancelled", reactivated: "Membership reactivated", streak_reward: "Streak gift ready", streak_saver: "Streak saver used", birthday_gift: "Birthday gift ready", suggestion: "Idea submitted", paused: "Paused by customer service", resumed: "Pause ended", cs_cancelled: "Cancelled by customer service", magic_link: "Magic link sent" };

function Detail({ email, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); fetch(`/api/members?email=${encodeURIComponent(email)}`).then((r) => r.json()).then(setD).catch(() => setD({ success: false })); }, [email]);
  const m = d?.member;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(560px, 100%)", background: "#fff", overflowY: "auto", padding: "24px 26px", boxShadow: "-8px 0 30px rgba(0,0,0,.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><div style={{ fontWeight: 800, fontSize: 18 }}>{m ? [m.firstName, m.lastName].filter(Boolean).join(" ") || email : email}</div><div style={{ fontSize: 12.5, color: "#8a92a3" }}>{email}</div></div>
          <span style={{ display: "flex", gap: 8, marginRight: 56 }}><MagicLinkButton email={email} /><button style={ui.btn(false)} onClick={onClose}>Close</button></span>
        </div>
        {!d && <div style={{ color: "#8a92a3" }}>Loading…</div>}
        {d && !d.success && <div style={{ color: "#991b1b" }}>Not found.</div>}
        {m && (
          <>
            <div style={{ ...ui.card, padding: "14px 16px", marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
              <div><b>Via:</b> {m.provider} · <b>subscription:</b> {m.subscriptionId || "—"} · <b>first order:</b> {m.shopifyOrder || "—"} · <b>bundle:</b> {m.bundle ? `${m.bundle} bottle${m.bundle === 1 ? "" : "s"}` : "—"}</div>
              <div><b>Started:</b> {fmtDT(m.startedAt)} · <b>trial until:</b> {fmtD(m.trialEnds)} · <b>next rebill:</b> {fmtD(m.nextChargeAt)}</div>
              <div><b>Status (record):</b> {m.status} {m.cancelledAt ? `· cancelled ${fmtDT(m.cancelledAt)}` : ""} {m.reactivatedAt ? `· reactivated ${fmtDT(m.reactivatedAt)}` : ""}{m.pausedUntil && Date.parse(m.pausedUntil) > Date.now() ? ` · paused until ${fmtD(m.pausedUntil)} (${m.pausedDays} days)` : ""}</div>
              <div><b>Last payment:</b> {fmtDT(m.lastPaymentAt)} {m.lastPaymentAmount != null ? `(${eur(m.lastPaymentAmount)})` : ""} · <b>rebills:</b> {m.rebills || 0} · <b>total rebills:</b> {eur(m.totalPaid || 0)}</div>
              <div><b>Address:</b> {m.address ? `${m.address.address1 || ""}, ${m.address.zip || ""} ${m.address.city || ""}${m.address.province ? ` (${m.address.province})` : ""}` : "—"} · <b>phone:</b> {m.phone || "—"}</div>
              <div><b>Welcome link opened:</b> {fmtDT(m.welcomeOpenedAt)} · <b>password:</b> {m.hasPassword ? `yes (${fmtDT(m.passwordSetAt)})` : "no"}</div>
              <div><b>First login:</b> {fmtDT(m.firstLoginAt)} · <b>last:</b> {fmtDT(m.lastLoginAt)} · <b>logins:</b> {m.loginCount || 0} · <b>last active:</b> {fmtDT(m.lastSeenAt)}{m.streak ? <> · <b>login streak:</b> {m.streak.current} (best {m.streak.best})</> : null}{m.birthday ? <> · <b>birthday:</b> {m.birthday.split("-").reverse().join("/")}</> : null}</div>
              <div><b>E-books unlocked:</b> {m.ebooks?.length ? m.ebooks.join(", ") : "none"} · <b>welcome gift:</b> {m.giftClaimedAt ? fmtDT(m.giftClaimedAt) : "not claimed"}</div>
              {m.regift && <div><b>Reactivation regalo:</b> granted {fmtDT(m.regift.grantedAt)} · e-book {m.regift.ebookUsedAt ? `used (${m.regift.ebookSlug})` : "still open"} · credit {m.regift.creditUsedAt ? `used on ${m.regift.creditFor} (${m.regift.creditOrder})` : "still open"}</div>}
            </div>
            {m.csCancellation && (
              <div style={{ ...ui.card, padding: "14px 16px", marginBottom: 14, background: "#fffafa", borderColor: "#fde2e2" }}>
                <div style={{ ...ui.label, marginBottom: 8 }}>Cancellation (customer service)</div>
                <CancellationInfo c={m.csCancellation} />
              </div>
            )}
            <div style={ui.label}>Timeline</div>
            <div style={{ marginTop: 8 }}>
              {(d.log || []).length === 0 && <div style={{ color: "#8a92a3", fontSize: 13 }}>No events logged yet (logging started on 2 Oct).</div>}
              {(d.log || []).map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, padding: "7px 0", borderBottom: "1px solid #f3f4f7", fontSize: 12.5 }}>
                  <div style={{ color: "#8a92a3", fontVariantNumeric: "tabular-nums" }}>{fmtDT(e.at)}</div>
                  <div><b>{EVENT_LABEL[e.type] || e.type}</b>{e.method ? ` · ${e.method}` : ""}{e.days ? ` · ${e.days} days` : ""}{e.reason ? ` · "${e.reason}"` : ""}{e.chargebackRisk ? ` · risk ${e.chargebackRisk}` : ""}{e.by ? ` · by ${e.by}` : ""}{e.slug ? ` · ${e.slug}` : ""}{e.order ? ` · ${e.order}` : ""}{e.amount != null ? ` · ${eur(e.amount)}` : ""}{e.gift ? " · 🎁" : ""}{e.regift ? " · regalo" : ""}{e.provider ? ` · ${e.provider}` : ""}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Members() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(["startedAt", -1]);
  const [open, setOpen] = useState(null);
  const now = Date.now();

  const load = () => { setData(null); setErr(""); fetch("/api/members").then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Error"))).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  // Deep link from the Membership Dashboard: /members?email=… opens that member's timeline right away
  useEffect(() => { const e = new URLSearchParams(window.location.search).get("email"); if (e) { setOpen(e.toLowerCase()); setQ(e); } }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const list = data.members.filter((m) => matches(m, filter, now) && (!s || `${m.name} ${m.email} ${m.firstOrder}`.toLowerCase().includes(s)));
    const [k, dir] = sort;
    return list.sort((a, b) => { const av = a[k] ?? "", bv = b[k] ?? ""; if (av === bv) return 0; return (av > bv ? 1 : -1) * dir; });
  }, [data, filter, q, sort, now]);

  const S = data?.summary;
  const download = () => { const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `members-${filter}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); };
  const th = (k, label) => <th key={k} style={ui.th} onClick={() => setSort(([pk, d]) => [k, pk === k ? -d : -1])}>{label}{sort[0] === k ? (sort[1] > 0 ? " ↑" : " ↓") : ""}</th>;

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Members</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Who is a member, since when, who logs in, who orders · member portal + Stripe/PayPal + Shopify{data?.generatedAt ? ` · updated ${fmtDT(data.generatedAt)}` : ""}</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={ui.btn(false)} onClick={load}>Refresh</button><button style={ui.btn(true)} onClick={download} disabled={!rows.length}>Export CSV ({rows.length})</button></div>
      </div>
      {err && <div style={{ ...ui.card, padding: 14, color: "#991b1b", marginBottom: 14 }}>{err}</div>}
      {!data && !err && <div style={{ color: "#8a92a3" }}>Loading… (Stripe, PayPal and Shopify are fetched live)</div>}
      {S && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Tile label="Members" value={S.total} sub={`${S.trial} trial · ${S.active} paying${S.paused ? ` · ${S.paused} paused` : ""} · ${S.problem} payment issue · ${S.canceled} cancelled`} onClick={() => setFilter("all")} on={filter === "all"} />
            <Tile label="Never logged in" value={S.neverLoggedIn} sub="have never opened the portal" accent="#ef4444" onClick={() => setFilter("never")} on={filter === "never"} />
            <Tile label="Logged in, nothing ordered" value={S.loggedInNoClaim} sub="visited, but no free product yet" accent="#f59e0b" onClick={() => setFilter("noclaim")} on={filter === "noclaim"} />
            <Tile label="Trial ends < 48 h" value={S.trialEndingNoLogin} sub="and never logged in, email them now" accent="#ef4444" onClick={() => setFilter("ending")} on={filter === "ending"} />
            <Tile label="Product ordered" value={S.withClaim} sub={`${S.withEbook} with e-book · ${S.withUpsell} with upsell 1+1`} accent="#22c55e" onClick={() => setFilter("claimed")} on={filter === "claimed"} />
          </div>
          {!S.liveSource && <div style={{ ...ui.card, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: "#854d0e", background: "#fef9c3" }}>Live Stripe/PayPal status could not be loaded; status now comes from the member record (webhooks).</div>}
          <div style={{ ...ui.card, padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              {FILTERS.map(([k, l]) => <button key={k} style={ui.btn(filter === k)} onClick={() => setFilter(k)}>{l}</button>)}
              <input style={{ ...ui.input, marginLeft: "auto" }} placeholder="Search by name, email or order number…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{COLS.map(([k, l]) => th(k, l))}</tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.email} onClick={() => setOpen(m.email)} style={{ cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={ui.td}><div style={{ fontWeight: 700 }}>{m.name || "—"}</div><div style={{ fontSize: 11.5, color: "#8a92a3" }}>{m.email}{m.firstOrder ? ` · ${m.firstOrder}` : ""}</div></td>
                      <td style={ui.td} onClick={(e) => e.stopPropagation()}><MagicLinkButton email={m.email} small /></td>
                      <td style={ui.td}>{m.provider}</td>
                      <td style={ui.td}><Pill s={m.status} stop={m.cancelAtPeriodEnd} />{m.status === "paused" && m.pausedUntil ? <div style={{ fontSize: 11, color: "#8a92a3", marginTop: 3 }}>until {fmtD(m.pausedUntil)}</div> : null}</td>
                      <td style={ui.td}>{fmtD(m.startedAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.days}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.cycle === 0 ? "trial" : m.cycle}</td>
                      <td style={ui.td}>{fmtD(m.trialEnd)}</td>
                      <td style={ui.td}>{m.status === "canceled" ? <span style={{ color: "#8a92a3" }}>cancelled {fmtD(m.canceledAt)}</span> : fmtD(m.nextBilling)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.rebills}</td>
                      <td style={ui.td}>{eur(m.membershipRevenue)}</td>
                      <td style={ui.td}><Dot on={!!m.welcomeOpenedAt} />{m.welcomeOpenedAt ? fmtD(m.welcomeOpenedAt) : m.hasPassword ? "password set" : "no"}</td>
                      <td style={ui.td}>{fmtD(m.firstLoginAt)}</td>
                      <td style={ui.td} title={fmtDT(m.lastLoginAt)}>{ago(m.lastLoginAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.loginCount}</td>
                      <td style={ui.td} title={fmtDT(m.lastSeenAt)}>{ago(m.lastSeenAt)}</td>
                      <td style={ui.td}><Dot on={m.claims > 0} />{m.claims}{m.claimSlugs.length ? <span style={{ color: "#8a92a3", fontSize: 11 }}> · {m.claimSlugs.slice(0, 2).join(", ")}{m.claimSlugs.length > 2 ? "…" : ""}</span> : ""}</td>
                      <td style={ui.td}>{fmtD(m.lastClaimAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.ebooks}{m.giftClaimed ? " 🎁" : ""}</td>
                      <td style={ui.td}>{m.upsell ? `✓ ${m.upsell.order}` : "—"}</td>
                      <td style={ui.td}>{m.regift ? (m.regift.used ? "used" : `${m.regift.ebookLeft ? "e-book " : ""}${m.regift.credit ? `€${m.regift.credit}` : ""}`.trim()) : "—"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ ...ui.td, color: "#8a92a3" }}>No members in this selection.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: "#8a92a3", marginTop: 10 }}>Logins and "last active" are tracked since 2 October 2026; earlier activity is not available. Click a member for the full timeline.</div>
          </div>
        </>
      )}
      <Suggestions />
      {open && <Detail email={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Ideas/requests members submit via "Hai un'idea…?" in the portal
function Suggestions() {
  const [list, setList] = useState(null);
  useEffect(() => { fetch("/api/members?suggestions=1").then((r) => r.json()).then((d) => setList(d.success ? d.suggestions : [])).catch(() => setList([])); }, []);
  return (
    <div style={{ ...ui.card, padding: "18px 22px", marginTop: "20px" }}>
      <div style={{ fontWeight: 800, fontSize: "15px" }}>💡 Ideas from members</div>
      <div style={{ fontSize: "12px", color: "#8a92a3", marginBottom: "10px" }}>submitted via "Hai un'idea per la tua area membri?" at the bottom of the portal · newest first</div>
      {list === null && <div style={{ color: "#b6bdc9", fontSize: "13px" }}>Loading…</div>}
      {list && list.length === 0 && <div style={{ color: "#8a92a3", fontSize: "13px" }}>No ideas submitted yet.</div>}
      {list && list.map((s, i) => (
        <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px solid #f1f3f6" : "none", fontSize: "13.5px" }}>
          <div style={{ color: "#8a92a3", fontSize: "12px", marginBottom: "3px" }}>{new Date(s.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · <b style={{ color: "#0f172a" }}>{s.name || s.email}</b> · {s.email}{s.page ? ` · ${s.page}` : ""}</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
}
