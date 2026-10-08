// pages/members.js — Members: who is a member, since when, who logs in, who orders (fully in English).
// Source: /api/members (Redis member records + live Stripe/PayPal + Shopify portal orders).
// Brand switch (NeuroTone / LubriSense): each product has its own member portal and member records (?brand=…).
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

const BRAND_OPTS = [["neurotone", "NeuroTone"], ["lubrisense", "LubriSense"]];
const BRAND_SUB = { neurotone: "members.getjustjenny.com", lubrisense: "intimate.getjustjenny.com" };

const FILTERS = [
  ["all", "All"], ["trial", "Trial"], ["active", "Paying"], ["paused", "Paused"], ["problem", "Payment issue"], ["canceled", "Cancelled"],
  ["never", "Never logged in"], ["noclaim", "Logged in, nothing ordered"], ["ending", "Trial ends < 48 h, never logged in"], ["claimed", "Product ordered"], ["upsell", "Upsell 1+1"],
];
const COLS = [
  ["name", "Member"], ["magic", "Login link"], ["provider", "Via"], ["status", "Status"], ["trialEnd", "Trial ends"], ["membershipRevenue", "Paid"],
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

const EVENT_LABEL = { registered: "Signed up (first payment)", login: "Logged in", password_set: "Password set", claim: "Free product ordered", ebook: "E-book unlocked", rebill: "Rebill paid", cancelled: "Cancelled", reactivated: "Membership reactivated", streak_reward: "Streak gift ready", streak_saver: "Streak saver used", birthday_gift: "Birthday gift ready", suggestion: "Idea submitted", paused: "Paused by customer service", resumed: "Pause ended", cs_cancelled: "Cancelled by customer service", magic_link: "Magic link sent", secret_gift: "Secret gift earned (abandoned checkout mail)" };

// One label/value line in the side panel
const Row = ({ label, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "7px 0", borderBottom: "1px solid #f3f4f7", fontSize: 13 }}>
    <div style={{ color: "#8a92a3" }}>{label}</div>
    <div style={{ color: "#0f172a", wordBreak: "break-word" }}>{children ?? "—"}</div>
  </div>
);
const Section = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ ...ui.label, marginBottom: 4 }}>{title}</div>
    {children}
  </div>
);

function Detail({ email, row, brand, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); fetch(`/api/members?email=${encodeURIComponent(email)}&brand=${brand}`).then((r) => r.json()).then(setD).catch(() => setD({ success: false })); }, [email, brand]);
  const m = d?.member;
  const r = row || {};
  const addr = m?.address ? [m.address.address1, [m.address.zip, m.address.city].filter(Boolean).join(" "), m.address.province ? `(${m.address.province})` : ""].filter(Boolean).join(", ") : null;
  const paused = m?.pausedUntil && Date.parse(m.pausedUntil) > Date.now();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px, 100%)", background: "#fff", overflowY: "auto", padding: "24px 26px", boxShadow: "-8px 0 30px rgba(0,0,0,.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{m ? [m.firstName, m.lastName].filter(Boolean).join(" ") || email : r.name || email}</div>
            <div style={{ fontSize: 12.5, color: "#8a92a3", marginBottom: 6 }}>{email}</div>
            {r.status && <Pill s={r.status} stop={r.cancelAtPeriodEnd} />}
          </div>
          <span style={{ display: "flex", gap: 8, marginRight: 56 }}><MagicLinkButton email={email} brand={brand} /><button style={ui.btn(false)} onClick={onClose}>Close</button></span>
        </div>
        {!d && <div style={{ color: "#8a92a3" }}>Loading…</div>}
        {d && !d.success && <div style={{ color: "#991b1b" }}>Not found.</div>}
        {m && (
          <>
            {m.csCancellation && (
              <div style={{ ...ui.card, padding: "14px 16px", marginBottom: 18, background: "#fffafa", borderColor: "#fde2e2" }}>
                <div style={{ ...ui.label, marginBottom: 8 }}>Cancellation (customer service)</div>
                <CancellationInfo c={m.csCancellation} />
              </div>
            )}

            <Section title="Membership">
              <Row label="Via">{m.provider === "paypal" ? "PayPal" : m.provider === "stripe" ? "Card (Stripe)" : m.provider}</Row>
              <Row label="Subscription">{m.subscriptionId || "—"}</Row>
              <Row label="First order">{m.shopifyOrder || "—"}{m.bundle ? ` · ${m.bundle} bottle${m.bundle === 1 ? "" : "s"}` : ""}</Row>
              <Row label="Started">{fmtDT(m.startedAt)}</Row>
              <Row label="Trial until">{fmtD(m.trialEnds || r.trialEnd)}</Row>
              <Row label="Next rebill">{r.status === "canceled" ? "—" : fmtD(r.nextBilling || m.nextChargeAt)}</Row>
              {paused && <Row label="Paused until">{fmtD(m.pausedUntil)} ({m.pausedDays} days)</Row>}
              <Row label="Rebills">{r.rebills ?? m.rebills ?? 0}</Row>
              <Row label="Paid (rebills)">{eur(r.membershipRevenue ?? m.totalPaid ?? 0)}</Row>
              <Row label="Last payment">{m.lastPaymentAt ? `${fmtDT(m.lastPaymentAt)}${m.lastPaymentAmount != null ? ` (${eur(m.lastPaymentAmount)})` : ""}` : "—"}</Row>
              {m.cancelledAt && <Row label="Cancelled">{fmtDT(m.cancelledAt)}</Row>}
              {m.reactivatedAt && <Row label="Reactivated">{fmtDT(m.reactivatedAt)}</Row>}
            </Section>

            <Section title="Contact">
              <Row label="Email">{email}</Row>
              <Row label="Phone">{m.phone || "—"}</Row>
              <Row label="Address">{addr || "—"}</Row>
            </Section>

            <Section title="Portal activity">
              <Row label="Welcome link opened">{fmtDT(m.welcomeOpenedAt)}</Row>
              <Row label="Password">{m.hasPassword ? (m.passwordSetAt ? `Yes (${fmtDT(m.passwordSetAt)})` : "Yes") : "No"}</Row>
              <Row label="First login">{fmtDT(m.firstLoginAt)}</Row>
              <Row label="Last login">{m.lastLoginAt ? `${fmtDT(m.lastLoginAt)} (${ago(m.lastLoginAt)})` : "Never"}</Row>
              <Row label="Logins">{m.loginCount || 0}</Row>
              <Row label="Last active">{m.lastSeenAt ? `${fmtDT(m.lastSeenAt)} (${ago(m.lastSeenAt)})` : "—"}</Row>
              <Row label="Login streak">{m.streak ? `${m.streak.current} (best ${m.streak.best})` : "—"}</Row>
              {m.birthday && <Row label="Birthday">{m.birthday.split("-").reverse().slice(0, 2).join("/")}</Row>}
            </Section>

            <Section title="Products & rewards">
              <Row label="Free products">{r.claims ? `${r.claims} · ${r.claimSlugs.join(", ")}` : "None yet"}</Row>
              <Row label="Last product">{fmtD(r.lastClaimAt)}</Row>
              <Row label="E-books unlocked">{m.ebooks?.length ? m.ebooks.join(", ") : "None"}</Row>
              <Row label="Welcome gift">{m.giftClaimedAt ? fmtDT(m.giftClaimedAt) : "Not claimed"}</Row>
              <Row label="Upsell 1+1">{r.upsell ? `Yes · ${r.upsell.order}` : "No"}</Row>
              {m.regift && <Row label="Reactivation regalo">Granted {fmtDT(m.regift.grantedAt)} · e-book {m.regift.ebookUsedAt ? `used (${m.regift.ebookSlug})` : "still open"} · credit {m.regift.creditUsedAt ? `used on ${m.regift.creditFor} (${m.regift.creditOrder})` : "still open"}</Row>}
            </Section>

            <Section title="Timeline">
              {(d.log || []).length === 0 && <div style={{ color: "#8a92a3", fontSize: 13 }}>No events logged yet (logging started on 2 Oct).</div>}
              {(d.log || []).map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "7px 0", borderBottom: "1px solid #f3f4f7", fontSize: 12.5 }}>
                  <div style={{ color: "#8a92a3", fontVariantNumeric: "tabular-nums" }}>{fmtDT(e.at)}</div>
                  <div><b>{EVENT_LABEL[e.type] || e.type}</b>{e.method ? ` · ${e.method}` : ""}{e.days ? ` · ${e.days} days` : ""}{e.reason ? ` · "${e.reason}"` : ""}{e.chargebackRisk ? ` · risk ${e.chargebackRisk}` : ""}{e.by ? ` · by ${e.by}` : ""}{e.slug ? ` · ${e.slug}` : ""}{e.order ? ` · ${e.order}` : ""}{e.amount != null ? ` · ${eur(e.amount)}` : ""}{e.gift ? " · 🎁" : ""}{e.regift ? " · regalo" : ""}{e.provider ? ` · ${e.provider}` : ""}</div>
                </div>
              ))}
            </Section>
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
  const [brand, setBrand] = useState("neurotone");
  const now = Date.now();

  const load = () => { setData(null); setErr(""); fetch(`/api/members?brand=${brand}`).then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Error"))).catch((e) => setErr(e.message)); };
  useEffect(load, [brand]); // eslint-disable-line react-hooks/exhaustive-deps
  // Remember the last chosen product (per browser); ?brand=lubrisense in the URL wins
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("brand");
    let saved = null; try { saved = localStorage.getItem("jj-members-brand"); } catch {}
    const b = BRAND_OPTS.some(([k]) => k === u) ? u : BRAND_OPTS.some(([k]) => k === saved) ? saved : null;
    if (b && b !== "neurotone") setBrand(b);
  }, []);
  const pickBrand = (b) => { setBrand(b); setOpen(null); setFilter("all"); try { localStorage.setItem("jj-members-brand", b); } catch {} };
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
  const download = () => { const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `members-${brand}-${filter}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); };
  const th = (k, label) => <th key={k} style={ui.th} onClick={() => setSort(([pk, d]) => [k, pk === k ? -d : -1])}>{label}{sort[0] === k ? (sort[1] > 0 ? " ↑" : " ↓") : ""}</th>;

  return (
    <div style={ui.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Members</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Who is a member, since when, who logs in, who orders · {BRAND_SUB[brand]} + Stripe/PayPal + Shopify{data?.generatedAt ? ` · updated ${fmtDT(data.generatedAt)}` : ""}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", border: "1px solid #e2e6ec", borderRadius: "999px", padding: 3, background: "#fff", marginRight: 6 }}>
            {BRAND_OPTS.map(([k, l]) => <button key={k} onClick={() => pickBrand(k)} style={{ padding: "6px 14px", borderRadius: "999px", border: "none", background: brand === k ? "#0f172a" : "transparent", color: brand === k ? "#fff" : "#334155", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>{l}</button>)}
          </div>
          <button style={ui.btn(false)} onClick={load}>Refresh</button><button style={ui.btn(true)} onClick={download} disabled={!rows.length}>Export CSV ({rows.length})</button>
        </div>
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
                      <td style={ui.td} onClick={(e) => e.stopPropagation()}><MagicLinkButton email={m.email} small brand={brand} /></td>
                      <td style={ui.td}>{m.provider}</td>
                      <td style={ui.td}><Pill s={m.status} stop={m.cancelAtPeriodEnd} />{m.status === "paused" && m.pausedUntil ? <div style={{ fontSize: 11, color: "#8a92a3", marginTop: 3 }}>until {fmtD(m.pausedUntil)}</div> : null}</td>
                      <td style={ui.td}>{fmtD(m.trialEnd)}</td>
                      <td style={ui.td}>{eur(m.membershipRevenue)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ ...ui.td, color: "#8a92a3" }}>{data?.members?.length ? "No members in this selection." : `No ${BRAND_OPTS.find(([k]) => k === brand)?.[1]} members yet.`}</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: "#8a92a3", marginTop: 10 }}>Click a member for all details: portal activity, products, rewards and the full timeline.</div>
          </div>
        </>
      )}
      <Suggestions brand={brand} />
      {open && <Detail email={open} brand={brand} row={data?.members?.find((x) => x.email === open)} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Ideas/requests members submit via "Hai un'idea…?" in the portal
function Suggestions({ brand }) {
  const [list, setList] = useState(null);
  useEffect(() => { setList(null); fetch(`/api/members?suggestions=1&brand=${brand}`).then((r) => r.json()).then((d) => setList(d.success ? d.suggestions : [])).catch(() => setList([])); }, [brand]);
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
