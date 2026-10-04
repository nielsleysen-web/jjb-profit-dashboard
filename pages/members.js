// pages/members.js — Members: wie is lid, sinds wanneer, wie logt in, wie bestelt (Finance/Admin).
// Bron: /api/members (Redis-ledenrecords + live Stripe/PayPal + Shopify-portaalorders).
import { useState, useEffect, useMemo } from "react";

const ui = {
  page: { padding: "28px 36px", background: "#f7f8fa", minHeight: "100vh", fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a" },
  card: { background: "#fff", borderRadius: "16px", border: "1px solid #eceef2", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" },
  label: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px" },
  btn: (on) => ({ padding: "7px 12px", borderRadius: "999px", border: "1px solid #e2e6ec", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#334155", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  th: { fontSize: "11px", fontWeight: 600, color: "#8a92a3", textTransform: "uppercase", letterSpacing: "0.7px", padding: "6px 6px", borderBottom: "1px solid #eceef2", whiteSpace: "nowrap", textAlign: "left", cursor: "pointer", userSelect: "none" },
  td: { padding: "8px 6px", borderBottom: "1px solid #f3f4f7", whiteSpace: "nowrap", verticalAlign: "middle", fontSize: "12.5px" },
  input: { padding: "8px 12px", borderRadius: "10px", border: "1px solid #e2e6ec", fontSize: "13px", minWidth: "260px" },
};
const eur = (v) => (v == null ? "—" : `€ ${Number(v).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtD = (s) => (s ? new Date(s).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" }) : "—");
const fmtDT = (s) => (s ? new Date(s).toLocaleString("nl-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (s) => { if (!s) return "nooit"; const d = Math.floor((Date.now() - Date.parse(s)) / 86400000); return d === 0 ? "vandaag" : d === 1 ? "gisteren" : `${d} d geleden`; };
const STATUS = { trial: ["Proef", "#fef9c3", "#854d0e"], active: ["Betalend", "#dcfce7", "#166534"], canceled: ["Opgezegd", "#f1f5f9", "#64748b"], problem: ["Betaalprobleem", "#fee2e2", "#991b1b"], paused: ["Gepauzeerd", "#f1f5f9", "#64748b"] };
const Pill = ({ s, stop }) => { const [t, bg, fg] = STATUS[s] || [s, "#f1f5f9", "#64748b"]; return <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: "11px", padding: "3px 8px", borderRadius: "999px" }}>{t}{stop ? " · stopt" : ""}</span>; };
const Dot = ({ on, title }) => <span title={title} style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: on ? "#22c55e" : "#e2e6ec", marginRight: 6, verticalAlign: "middle" }} />;

const FILTERS = [
  ["all", "Alle"], ["trial", "Proef"], ["active", "Betalend"], ["problem", "Betaalprobleem"], ["canceled", "Opgezegd"],
  ["never", "Nooit ingelogd"], ["noclaim", "Ingelogd, niets besteld"], ["ending", "Proef eindigt < 48 u, nooit ingelogd"], ["claimed", "Product besteld"], ["upsell", "Upsell 1+1"],
];
const COLS = [
  ["name", "Lid"], ["provider", "Via"], ["status", "Status"], ["startedAt", "Sinds"], ["days", "Dagen"], ["cycle", "Cyclus"], ["trialEnd", "Proef eindigt"], ["nextBilling", "Volgende rebill"],
  ["rebills", "Rebills"], ["membershipRevenue", "Betaald"], ["welcomeOpenedAt", "Welkomstlink"], ["firstLoginAt", "1e login"], ["lastLoginAt", "Laatste login"], ["loginCount", "Logins"], ["lastSeenAt", "Laatst actief"],
  ["claims", "Producten"], ["lastClaimAt", "Laatste product"], ["ebooks", "E-books"], ["upsell", "Upsell"], ["regift", "Regalo"],
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
  if (["trial", "active", "problem", "canceled"].includes(f)) return m.status === f;
  if (f === "never") return !m.firstLoginAt;
  if (f === "noclaim") return !!m.firstLoginAt && m.claims === 0;
  if (f === "ending") return m.status === "trial" && !m.firstLoginAt && m.trialEnd && Date.parse(m.trialEnd) - now < 2 * 86400000;
  if (f === "claimed") return m.claims > 0;
  if (f === "upsell") return !!m.upsell;
  return true;
}

function toCsv(rows) {
  const head = ["email", "naam", "via", "status", "sinds", "dagen", "cyclus", "proef_eindigt", "volgende_rebill", "rebills", "betaald", "welkomstlink", "eerste_login", "laatste_login", "logins", "laatst_actief", "producten", "laatste_product", "ebooks", "upsell", "eerste_order"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((m) => [m.email, m.name, m.provider, m.status, m.startedAt, m.days, m.cycle, m.trialEnd, m.nextBilling, m.rebills, m.membershipRevenue, m.welcomeOpenedAt, m.firstLoginAt, m.lastLoginAt, m.loginCount, m.lastSeenAt, m.claims, m.lastClaimAt, m.ebooks, m.upsell?.order || "", m.firstOrder].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

const EVENT_LABEL = { registered: "Aangemeld (eerste betaling)", login: "Ingelogd", password_set: "Wachtwoord gekozen", claim: "Gratis product besteld", ebook: "E-book ontgrendeld", rebill: "Rebill betaald", cancelled: "Opgezegd", reactivated: "Membership hervat", streak_reward: "Streak-cadeau klaargezet", streak_saver: "Streak saver gebruikt", birthday_gift: "Verjaardagscadeau klaargezet", suggestion: "Idee ingestuurd" };

function Detail({ email, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); fetch(`/api/members?email=${encodeURIComponent(email)}`).then((r) => r.json()).then(setD).catch(() => setD({ success: false })); }, [email]);
  const m = d?.member;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(560px, 100%)", background: "#fff", overflowY: "auto", padding: "24px 26px", boxShadow: "-8px 0 30px rgba(0,0,0,.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div><div style={{ fontWeight: 800, fontSize: 18 }}>{m ? [m.firstName, m.lastName].filter(Boolean).join(" ") || email : email}</div><div style={{ fontSize: 12.5, color: "#8a92a3" }}>{email}</div></div>
          <button style={ui.btn(false)} onClick={onClose}>Sluiten</button>
        </div>
        {!d && <div style={{ color: "#8a92a3" }}>Laden…</div>}
        {d && !d.success && <div style={{ color: "#991b1b" }}>Niet gevonden.</div>}
        {m && (
          <>
            <div style={{ ...ui.card, padding: "14px 16px", marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
              <div><b>Via:</b> {m.provider} · <b>abonnement:</b> {m.subscriptionId || "—"} · <b>eerste order:</b> {m.shopifyOrder || "—"} · <b>bundel:</b> {m.bundle ? `${m.bundle} flacon(i)` : "—"}</div>
              <div><b>Gestart:</b> {fmtDT(m.startedAt)} · <b>proef t/m:</b> {fmtD(m.trialEnds)} · <b>volgende rebill:</b> {fmtD(m.nextChargeAt)}</div>
              <div><b>Status (record):</b> {m.status} {m.cancelledAt ? `· opgezegd ${fmtDT(m.cancelledAt)}` : ""} {m.reactivatedAt ? `· hervat ${fmtDT(m.reactivatedAt)}` : ""}</div>
              <div><b>Laatste betaling:</b> {fmtDT(m.lastPaymentAt)} {m.lastPaymentAmount != null ? `(${eur(m.lastPaymentAmount)})` : ""} · <b>rebills:</b> {m.rebills || 0} · <b>totaal rebills:</b> {eur(m.totalPaid || 0)}</div>
              <div><b>Adres:</b> {m.address ? `${m.address.address1 || ""}, ${m.address.zip || ""} ${m.address.city || ""}${m.address.province ? ` (${m.address.province})` : ""}` : "—"} · <b>tel:</b> {m.phone || "—"}</div>
              <div><b>Welkomstlink geopend:</b> {fmtDT(m.welcomeOpenedAt)} · <b>wachtwoord:</b> {m.hasPassword ? `ja (${fmtDT(m.passwordSetAt)})` : "nee"}</div>
              <div><b>Eerste login:</b> {fmtDT(m.firstLoginAt)} · <b>laatste:</b> {fmtDT(m.lastLoginAt)} · <b>logins:</b> {m.loginCount || 0} · <b>laatst actief:</b> {fmtDT(m.lastSeenAt)}{m.streak ? <> · <b>login-streak:</b> {m.streak.current} (beste {m.streak.best})</> : null}{m.birthday ? <> · <b>verjaardag:</b> {m.birthday.split("-").reverse().join("/")}</> : null}</div>
              <div><b>E-books ontgrendeld:</b> {m.ebooks?.length ? m.ebooks.join(", ") : "geen"} · <b>welkomstcadeau:</b> {m.giftClaimedAt ? fmtDT(m.giftClaimedAt) : "niet opgehaald"}</div>
              {m.regift && <div><b>Regalo heractivering:</b> toegekend {fmtDT(m.regift.grantedAt)} · e-book {m.regift.ebookUsedAt ? `gebruikt (${m.regift.ebookSlug})` : "nog open"} · tegoed {m.regift.creditUsedAt ? `gebruikt op ${m.regift.creditFor} (${m.regift.creditOrder})` : "nog open"}</div>}
            </div>
            <div style={ui.label}>Tijdlijn</div>
            <div style={{ marginTop: 8 }}>
              {(d.log || []).length === 0 && <div style={{ color: "#8a92a3", fontSize: 13 }}>Nog geen gebeurtenissen gelogd (logging start vanaf 2 okt).</div>}
              {(d.log || []).map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, padding: "7px 0", borderBottom: "1px solid #f3f4f7", fontSize: 12.5 }}>
                  <div style={{ color: "#8a92a3", fontVariantNumeric: "tabular-nums" }}>{fmtDT(e.at)}</div>
                  <div><b>{EVENT_LABEL[e.type] || e.type}</b>{e.method ? ` · ${e.method}` : ""}{e.slug ? ` · ${e.slug}` : ""}{e.order ? ` · ${e.order}` : ""}{e.amount != null ? ` · ${eur(e.amount)}` : ""}{e.gift ? " · 🎁" : ""}{e.regift ? " · regalo" : ""}{e.provider ? ` · ${e.provider}` : ""}</div>
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

  const load = () => { setData(null); setErr(""); fetch("/api/members").then((r) => r.json()).then((d) => (d.success ? setData(d) : setErr(d.error || "Fout"))).catch((e) => setErr(e.message)); };
  useEffect(load, []);
  // Deep link vanuit het Membership Dashboard: /members?email=… opent meteen de tijdlijn van dat lid
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
        <div><h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Members</h1><div style={{ fontSize: "12.5px", color: "#8a92a3", marginTop: "3px" }}>Wie is lid, sinds wanneer, wie logt in, wie bestelt · ledenportaal + Stripe/PayPal + Shopify{data?.generatedAt ? ` · bijgewerkt ${fmtDT(data.generatedAt)}` : ""}</div></div>
        <div style={{ display: "flex", gap: 8 }}><button style={ui.btn(false)} onClick={load}>Vernieuwen</button><button style={ui.btn(true)} onClick={download} disabled={!rows.length}>Export CSV ({rows.length})</button></div>
      </div>
      {err && <div style={{ ...ui.card, padding: 14, color: "#991b1b", marginBottom: 14 }}>{err}</div>}
      {!data && !err && <div style={{ color: "#8a92a3" }}>Laden… (Stripe, PayPal en Shopify worden live opgehaald)</div>}
      {S && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Tile label="Leden" value={S.total} sub={`${S.trial} proef · ${S.active} betalend · ${S.problem} betaalprobleem · ${S.canceled} opgezegd`} onClick={() => setFilter("all")} on={filter === "all"} />
            <Tile label="Nooit ingelogd" value={S.neverLoggedIn} sub="hebben het portaal nog nooit gezien" accent="#ef4444" onClick={() => setFilter("never")} on={filter === "never"} />
            <Tile label="Ingelogd, niets besteld" value={S.loggedInNoClaim} sub="wel binnen geweest, geen gratis product" accent="#f59e0b" onClick={() => setFilter("noclaim")} on={filter === "noclaim"} />
            <Tile label="Proef eindigt < 48 u" value={S.trialEndingNoLogin} sub="én nooit ingelogd — nu mailen" accent="#ef4444" onClick={() => setFilter("ending")} on={filter === "ending"} />
            <Tile label="Product besteld" value={S.withClaim} sub={`${S.withEbook} met e-book · ${S.withUpsell} met upsell 1+1`} accent="#22c55e" onClick={() => setFilter("claimed")} on={filter === "claimed"} />
          </div>
          {!S.liveSource && <div style={{ ...ui.card, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: "#854d0e", background: "#fef9c3" }}>Live Stripe/PayPal-status kon niet geladen worden; status komt nu uit het ledenrecord (webhooks).</div>}
          <div style={{ ...ui.card, padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              {FILTERS.map(([k, l]) => <button key={k} style={ui.btn(filter === k)} onClick={() => setFilter(k)}>{l}</button>)}
              <input style={{ ...ui.input, marginLeft: "auto" }} placeholder="Zoek op naam, e-mail of ordernummer…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{COLS.map(([k, l]) => th(k, l))}</tr></thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.email} onClick={() => setOpen(m.email)} style={{ cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={ui.td}><div style={{ fontWeight: 700 }}>{m.name || "—"}</div><div style={{ fontSize: 11.5, color: "#8a92a3" }}>{m.email}{m.firstOrder ? ` · ${m.firstOrder}` : ""}</div></td>
                      <td style={ui.td}>{m.provider}</td>
                      <td style={ui.td}><Pill s={m.status} stop={m.cancelAtPeriodEnd} /></td>
                      <td style={ui.td}>{fmtD(m.startedAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.days}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.cycle === 0 ? "proef" : m.cycle}</td>
                      <td style={ui.td}>{fmtD(m.trialEnd)}</td>
                      <td style={ui.td}>{m.status === "canceled" ? <span style={{ color: "#8a92a3" }}>opgezegd {fmtD(m.canceledAt)}</span> : fmtD(m.nextBilling)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.rebills}</td>
                      <td style={ui.td}>{eur(m.membershipRevenue)}</td>
                      <td style={ui.td}><Dot on={!!m.welcomeOpenedAt} />{m.welcomeOpenedAt ? fmtD(m.welcomeOpenedAt) : m.hasPassword ? "ww gezet" : "nee"}</td>
                      <td style={ui.td}>{fmtD(m.firstLoginAt)}</td>
                      <td style={ui.td} title={fmtDT(m.lastLoginAt)}>{ago(m.lastLoginAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.loginCount}</td>
                      <td style={ui.td} title={fmtDT(m.lastSeenAt)}>{ago(m.lastSeenAt)}</td>
                      <td style={ui.td}><Dot on={m.claims > 0} />{m.claims}{m.claimSlugs.length ? <span style={{ color: "#8a92a3", fontSize: 11 }}> · {m.claimSlugs.slice(0, 2).join(", ")}{m.claimSlugs.length > 2 ? "…" : ""}</span> : ""}</td>
                      <td style={ui.td}>{fmtD(m.lastClaimAt)}</td>
                      <td style={{ ...ui.td, textAlign: "center" }}>{m.ebooks}{m.giftClaimed ? " 🎁" : ""}</td>
                      <td style={ui.td}>{m.upsell ? `✓ ${m.upsell.order}` : "—"}</td>
                      <td style={ui.td}>{m.regift ? (m.regift.used ? "gebruikt" : `${m.regift.ebookLeft ? "e-book " : ""}${m.regift.credit ? `€${m.regift.credit}` : ""}`.trim()) : "—"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ ...ui.td, color: "#8a92a3" }}>Geen leden in deze selectie.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: "#8a92a3", marginTop: 10 }}>Logins en "laatst actief" worden bijgehouden sinds 2 oktober 2026; eerdere activiteit is niet beschikbaar. Klik op een lid voor de volledige tijdlijn.</div>
          </div>
        </>
      )}
      <Suggestions />
      {open && <Detail email={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Ideeën/verzoeken die leden via "Hai un'idea…?" in het portaal insturen
function Suggestions() {
  const [list, setList] = useState(null);
  useEffect(() => { fetch("/api/members?suggestions=1").then((r) => r.json()).then((d) => setList(d.success ? d.suggestions : [])).catch(() => setList([])); }, []);
  return (
    <div style={{ ...ui.card, padding: "18px 22px", marginTop: "20px" }}>
      <div style={{ fontWeight: 800, fontSize: "15px" }}>💡 Ideeën van leden</div>
      <div style={{ fontSize: "12px", color: "#8a92a3", marginBottom: "10px" }}>ingestuurd via "Hai un'idea per la tua area membri?" onderaan het portaal · nieuwste eerst</div>
      {list === null && <div style={{ color: "#b6bdc9", fontSize: "13px" }}>Laden…</div>}
      {list && list.length === 0 && <div style={{ color: "#8a92a3", fontSize: "13px" }}>Nog geen ideeën ingestuurd.</div>}
      {list && list.map((s, i) => (
        <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px solid #f1f3f6" : "none", fontSize: "13.5px" }}>
          <div style={{ color: "#8a92a3", fontSize: "12px", marginBottom: "3px" }}>{new Date(s.at).toLocaleString("nl-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · <b style={{ color: "#0f172a" }}>{s.name || s.email}</b> · {s.email}{s.page ? ` · ${s.page}` : ""}</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
}
