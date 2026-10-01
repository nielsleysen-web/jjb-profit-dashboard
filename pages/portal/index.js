// pages/portal/index.js — Het ledenportaal (members.getjustjenny.com).
// Eén pagina met zijbalk; tabbladen via de URL-hash (#free, #library, #courses, #membership, #orders, #settings,
// #claim/<product>). Gegevens komen van /api/portal/overview. Design: design/portal/03-portal-en.html.
//
// Stap 2: alles tonen (producten + wat deze cyclus al besteld is, abonnement, bestellingen, instellingen).
// Stap 3: bestellen — S&H afrekenen via Stripe (opgeslagen kaart, 3D Secure) of PayPal + Shopify-order (lib/portal-claim.js).

import { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import PortalStyles from "../../components/portal/PortalStyles";
import { LOGO, SUPPORT_EMAIL, post, go, onEnter } from "../../components/portal/AuthShell";
import { useT, fmtDate, fmtMoney } from "../../lib/portal-i18n";
import Library, { GiftBanner } from "../../components/portal/Library";

const TABS = [
  { id: "free", icon: "🎁", label: "navFree" },
  { id: "library", icon: "📚", label: "navLibrary" },
  { id: "courses", icon: "🎓", label: "navCourses" },
  { id: "membership", icon: "💚", label: "navMember" },
  { id: "orders", icon: "📦", label: "navOrders" },
  { id: "settings", icon: "⚙️", label: "navSettings" },
];

const readHash = () => (typeof window === "undefined" ? "free" : (window.location.hash || "#free").slice(1) || "free");
const ptitle = (lang, p) => (lang === "it" && p.it ? p.it.title : p.title);
const ptag = (lang, p) => (lang === "it" && p.it ? p.it.tagline : p.tagline);

export default function Portal() {
  const { lang, t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [route, setRoute] = useState("free");
  const [menu, setMenu] = useState(false);

  const load = useCallback(() => {
    fetch("/api/portal/overview").then(async (r) => {
      if (r.status === 401) return go("/login");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setData(j);
    }).catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    const on = () => { setRoute(readHash()); setMenu(false); window.scrollTo(0, 0); };
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [load]);

  const nav = (r) => { if (window.location.hash !== `#${r}`) window.location.hash = r; else { setRoute(r); setMenu(false); } };
  const logout = async () => { await post("/api/portal/auth/logout"); go("/login"); };

  const [tab, arg] = route.split("/");
  const activeTab = tab === "claim" || tab === "done" ? "free" : tab;
  const m = data?.member;

  let content;
  if (error) content = <div className="center">{t("loadError")}</div>;
  else if (!data) content = <div className="center">{t("loading")}</div>;
  else if (data.ended) content = <Ended t={t} />;
  else if (tab === "claim") content = <Claim t={t} lang={lang} data={data} slug={arg} nav={nav} reload={load} />;
  else if (tab === "done") content = <Done t={t} lang={lang} data={data} name={decodeURIComponent(arg || "")} nav={nav} />;
  else if (tab === "library") content = <Library t={t} lang={lang} data={data} reload={load} />;
  else if (tab === "courses") content = <Courses t={t} lang={lang} data={data} />;
  else if (tab === "membership") content = <Membership t={t} lang={lang} data={data} />;
  else if (tab === "orders") content = <Orders t={t} lang={lang} data={data} />;
  else if (tab === "settings") content = <Settings t={t} data={data} reload={load} />;
  else content = <FreeItems t={t} lang={lang} data={data} nav={nav} reload={load} />;

  const showHelp = data && !data.ended && !["settings", "claim", "done"].includes(tab);

  return (
    <>
      <Head>
        <title>{`${t(TABS.find((x) => x.id === activeTab)?.label || "navFree")} — Just Jenny`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <PortalStyles />
      <div className="app">
        <aside className={`side${menu ? " open" : ""}`}>
          <img src={LOGO} alt="Just Jenny" />
          {TABS.map((x) => (
            <button key={x.id} type="button" className={`nav${activeTab === x.id ? " on" : ""}`} onClick={() => nav(x.id)}>
              <span className="ic">{x.icon}</span>{t(x.label)}
            </button>
          ))}
          <div className="me">
            {m && <><b>{[m.firstName, m.lastName].filter(Boolean).join(" ")}</b>{m.email}<br /></>}
            <button type="button" onClick={logout}>{t("logout")}</button>
          </div>
        </aside>
        <div className={`ov${menu ? " on" : ""}`} onClick={() => setMenu(false)} />
        <div className="main">
          <div className="mtop"><img src={LOGO} alt="Just Jenny" /><button type="button" aria-label="Menu" onClick={() => setMenu(true)}>☰</button></div>
          <div className="wrap">
            {tab !== "library" && data?.library?.left > 0 && (
              <a className="ebb" href="#library" onClick={(e) => { e.preventDefault(); nav("library"); }}>
                <span>{t("ebookBanner")}</span><b>{t("ebookBannerCta")} →</b>
              </a>
            )}
            {content}
            {showHelp && (
              <div className="card help"><div><h3>{t("helpTitle")}</h3><p>{t("helpSub")}</p></div><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Prodotti gratuiti ------------------------------------------------------
function FreeItems({ t, lang, data, nav, reload }) {
  const name = data.member.firstName;
  return (
    <>
      <h1>{name ? t("homeTitle", { name }) : t("homeTitleNoName")}</h1>
      <p className="sub">{t("homeSub")}</p>
      <GiftBanner t={t} lang={lang} data={data} reload={reload} />
      {data.freeItems.map((p) => (
        <div key={p.slug} className={`card p${p.ordered ? " ordered" : ""}`}>
          <div className="img"><img src={p.image} alt={ptitle(lang, p)} loading="lazy" /></div>
          <div>
            {p.ordered && <span className="ord">{t("orderedBadge")}</span>}
            <h3>{ptitle(lang, p)}</h3>
            <p>{ptag(lang, p)}</p>
            <div className="price"><s>{fmtMoney(lang, p.compareAt)}</s><b>{fmtMoney(lang, 0)}</b><span className="in">{t("free")}</span></div>
            <div className="sh">{t("shLabel")} <b>{fmtMoney(lang, p.shipping)}</b></div>
          </div>
          {p.ordered
            ? <span className="btn grey">{t("availableAgain", { date: fmtDate(lang, p.availableAgain, { day: "numeric", month: "long" }) })}</span>
            : <button type="button" className="btn" onClick={() => nav(`claim/${p.slug}`)}>{t("choose")}</button>}
        </div>
      ))}
    </>
  );
}

// ---- Bevestigen en bestellen ---------------------------------------------------
const CLAIM_ERR = { already_ordered: "errAlreadyOrdered", card_declined: "errCard", payment_failed: "errPayFailed", no_payment_method: "errNoPm",
  no_address: "errNoAddress", busy: "errBusy", order_failed: "errOrderFailed", ended: "errEnded" };
export const saveLastOrder = (r) => { try { sessionStorage.setItem("jj_last_order", JSON.stringify(r)); } catch {} };

function Claim({ t, lang, data, slug, nav, reload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const p = data.freeItems.find((x) => x.slug === slug);
  if (!p || p.ordered) { if (typeof window !== "undefined" && !busy) setTimeout(() => nav("free"), 0); return null; }
  const m = data.member, a = m.address || {};
  const pm = data.membership.paymentMethod;
  const isPaypal = data.membership.provider === "paypal";
  const errText = (code) => t(CLAIM_ERR[code] || "errPayFailed", { email: SUPPORT_EMAIL });

  function done(result) { saveLastOrder(result); reload(); nav(`done/${encodeURIComponent(result.orderName)}`); }

  async function confirm() {
    setErr(""); setBusy(true);
    try {
      const r = await post("/api/portal/claim", { slug });
      if (r.status === 401) return go("/login");
      if (!r.ok) { setErr(errText(r.error)); setBusy(false); if (r.error === "already_ordered") reload(); return; }
      if (r.action === "done") return done(r.result);
      if (r.action === "redirect") { window.location.assign(r.url); return; }
      if (r.action === "confirm") {
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(r.pk);
        const res = await stripe.handleNextAction({ clientSecret: r.clientSecret });
        if (res.error) { setErr(errText("card_declined")); setBusy(false); return; }
        const c = await post("/api/portal/claim-complete", { paymentIntentId: r.paymentIntentId });
        if (!c.ok) { setErr(errText(c.error)); setBusy(false); return; }
        return done(c.result);
      }
      setErr(errText("payment_failed")); setBusy(false);
    } catch { setErr(errText("payment_failed")); setBusy(false); }
  }

  return (
    <>
      <button type="button" className="back" onClick={() => nav("free")}>{t("backToFree")}</button>
      <h1>{t("claimTitle")}</h1>
      <p className="sub">{t("claimSub")}</p>
      <div className="claim">
        <div className="card sum">
          <div className="img"><img src={p.image} alt={ptitle(lang, p)} /></div>
          <div><h3>{ptitle(lang, p)}</h3><div className="price"><s>{fmtMoney(lang, p.compareAt)}</s><b>{fmtMoney(lang, 0)}</b><span className="in">{t("free")}</span></div></div>
        </div>
        <div className="card blk"><h4>{t("shipTo")}</h4>
          <div className="addr"><b>{[m.firstName, m.lastName].filter(Boolean).join(" ")}</b><br />{a.address1}<br />{[a.zip, a.city].filter(Boolean).join(" ")}{a.province ? ` (${a.province})` : ""}{m.phone ? <><br />{m.phone}</> : null}</div>
          <p className="fine" style={{ textAlign: "left", marginTop: 10 }}>{t("addrChange", { email: SUPPORT_EMAIL })}</p>
        </div>
        <div className="card blk"><h4>{t("summary")}</h4>
          <div className="tot"><span>{ptitle(lang, p)}</span><span><s>{fmtMoney(lang, p.compareAt)}</s><span className="g">{fmtMoney(lang, 0)}</span></span></div>
          <div className="tot"><span>{t("shLine")}</span><span>{fmtMoney(lang, p.shipping)}</span></div>
          <div className="tot"><span>{t("totalToday")}</span><span>{fmtMoney(lang, p.shipping)}</span></div>
        </div>
        <div className="card blk"><h4>{t("payment")}</h4><PayMethod t={t} pm={pm} provider={data.membership.provider} /></div>
        {err && <div className="claim-err">{err}</div>}
        {isPaypal
          ? <button type="button" className="btn big pp-btn" onClick={confirm} disabled={busy}>{busy ? t("processing") : t("confirmPaypal")}</button>
          : <button type="button" className="btn big" onClick={confirm} disabled={busy}>{busy ? t("processing") : t("confirmBtn")}</button>}
        <p className="fine">{isPaypal ? t("paypalNote", { amount: fmtMoney(lang, p.shipping) }) : t("chargeNote", { amount: fmtMoney(lang, p.shipping) })}</p>
      </div>
    </>
  );
}

// ---- Bevestiging na bestellen --------------------------------------------------
function Done({ t, lang, data, name, nav }) {
  let r = null;
  try { r = JSON.parse(sessionStorage.getItem("jj_last_order") || "null"); } catch {}
  if (!r || r.orderName !== name) {
    // Pagina opnieuw geladen zonder gegevens → naar "I miei ordini"
    if (typeof window !== "undefined") setTimeout(() => nav("orders"), 0);
    return null;
  }
  const p = data.freeItems.find((x) => x.slug === r.slug) || {};
  const title = ptitle(lang, p);
  const ad = r.address || {};
  const addrLine = [ad.address1, [ad.zip, ad.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <>
      <div className="crumb"><button type="button" className="back" onClick={() => nav("free")}>{t("doneCrumb")}</button> › <b>{t("doneOrder")}</b></div>
      <div className="done-hd"><h1>{t("doneTitle", { name: r.orderName })}</h1><span className="pill ok">{t("doneBadge")}</span></div>
      <p className="sub" style={{ marginTop: 8 }}>{t("doneSub", { product: title, address: addrLine })}</p>
      {r.availableAgain && <p className="note-s" style={{ margin: "0 0 18px" }}>{t("doneAgain", { date: fmtDate(lang, r.availableAgain, { day: "numeric", month: "long" }) })}</p>}
      <div className="oc">
        <div className="card blk"><h4>{t("doneItems")}</h4>
          <div className="it"><div className="img"><img src={p.image} alt="" /></div><div><b>{title}</b><div style={{ color: "#888", fontSize: 14 }}>{t("qty1")}</div></div><div className="pr"><s>{fmtMoney(lang, p.compareAt)}</s> {fmtMoney(lang, 0)}</div></div>
        </div>
        <div>
          <div className="card blk"><h4>{t("orderSummary")}</h4>
            <div className="tot"><span>{t("shLine")}</span><span>{fmtMoney(lang, r.amount)}</span></div>
            <div className="tot"><span>{t("totalLabel")}</span><span>{fmtMoney(lang, r.amount)}</span></div>
            <div style={{ color: "#777", fontSize: 14.5, marginTop: 10 }}>{t("paidWith", { method: pmText(t, r.paymentMethod, r.provider), date: fmtDate(lang, r.createdAt, { day: "numeric", month: "short", year: "numeric" }) })}</div>
          </div>
          <div className="card blk"><h4>{t("doneShipping")}</h4>
            <div className="addr">{ad.name}<br />{ad.address1}<br />{[ad.zip, ad.city].filter(Boolean).join(" ")}{ad.province ? ` (${ad.province})` : ""}<br />{t("italy")}</div>
            <div style={{ color: "#777", fontSize: 14.5, marginTop: 10 }}>{t("trackInfo")}</div>
          </div>
        </div>
      </div>
      <p style={{ marginTop: 6 }}><button type="button" className="back" onClick={() => nav("free")}>{t("backToFree")}</button></p>
    </>
  );
}

function PayMethod({ t, pm, provider }) {
  if (pm?.type === "card") return <div className="pay"><span className="cardic">{pm.brand}</span>{cap(pm.brand)} •••• {pm.last4} <span style={{ color: "#888", fontSize: 14 }}>· {t("savedCard")}</span></div>;
  if (pm?.type === "paypal" || provider === "paypal") return <div className="pay"><span className="cardic pp">PayPal</span>PayPal <span style={{ color: "#888", fontSize: 14 }}>· {pm?.email || t("paypalAccount")}</span></div>;
  return <div className="pay">{t("unknown")}</div>;
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const pmText = (t, pm, provider) => (pm?.type === "card" ? `${cap(pm.brand)} •••• ${pm.last4}` : pm?.type === "paypal" || provider === "paypal" ? "PayPal" : t("unknown"));

// ---- Corsi ---------------------------------------------------------------------
function Courses({ t, lang, data }) {
  return (
    <>
      <h1>{t("coursesTitle")}</h1>
      <p className="sub">{t("coursesSub")}</p>
      <div className="cg">
        {data.courses.map((c) => {
          const txt = c[lang] || c.it;
          const pct = c.unlockDays ? Math.min(100, Math.round((data.daysIn / c.unlockDays) * 100)) : 100;
          return (
            <div key={c.slug} className={`card cc${c.unlocked ? "" : " locked"}`}>
              <div className={`cov ${c.tone || ""}`}>{c.icon}
                {!c.unlocked && <div className="lk">{t("unlocksAfter", { n: Math.round(c.unlockDays / 28) })}<small>{t("daysToGo", { d: c.daysLeft, date: fmtDate(lang, c.unlocksAt, { day: "numeric", month: "long" }) })}</small></div>}
              </div>
              <div className="bd">
                <h3>{txt.title}</h3>
                <p>{txt.desc}</p>
                {c.unlocked
                  ? <div className="meta">✓ {t("available")} · {t("videosSoon")}</div>
                  : <><div className="bar"><i style={{ width: `${pct}%` }} /><b>{t("dayOf", { d: data.daysIn, total: c.unlockDays })}</b></div><div className="meta">{t("locked")}</div></>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---- Il mio abbonamento --------------------------------------------------------
function Membership({ t, lang, data }) {
  const ms = data.membership;
  const lp = ms.lastPayment;
  const subject = encodeURIComponent(t("changeSubject"));
  return (
    <>
      <h1>{t("memberTitle")}</h1>
      <p className="sub">Health For Life Membership</p>
      <div className="card rows">
        <div className="r"><span>{t("memberSince")}</span><b>{fmtDate(lang, ms.since) || t("unknown")}</b></div>
        <div className="r"><span>{t("lastPayment")}</span><b>{lp ? `${fmtDate(lang, lp.at)}${lp.amount != null ? ` · ${fmtMoney(lang, lp.amount)}` : ""}` : t("unknown")}</b></div>
        <div className="r"><span>{t("billingCycle")}</span><b>{t("every28")}</b></div>
        <div className="r"><span>{t("payMethod")}</span><b>{pmText(t, ms.paymentMethod, ms.provider)} &nbsp;·&nbsp; <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>{t("change")}</a></b></div>
      </div>
      <p className="note-s">{t("changeNote")}</p>
    </>
  );
}

// ---- I miei ordini ---------------------------------------------------------------
function Orders({ t, lang, data }) {
  const orders = data.orders || [];
  const byslug = Object.fromEntries(data.freeItems.map((p) => [p.slug, p]));
  return (
    <>
      <h1>{t("ordersTitle")}</h1>
      <p className="sub">{t("ordersSub")}</p>
      {data.orders === null && <div className="card empty">{t("ordersError")}</div>}
      {data.orders !== null && orders.length === 0 && <div className="card empty">{t("ordersNone")}</div>}
      {orders.map((o) => {
        const first = o.items[0] || {};
        const pp = first.portal ? byslug[first.portal] : null;
        const title = pp ? ptitle(lang, pp) : o.items.map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
        const meta = [`${t("order")} ${o.name}`, fmtDate(lang, o.createdAt, { day: "numeric", month: "short", year: "numeric" }),
          o.portal ? `${t("freeItem")} · ${t("shAmount", { amount: fmtMoney(lang, o.total) })}` : fmtMoney(lang, o.total)].join(" · ");
        return (
          <div key={o.name} className="card ol">
            <div className="img">{first.image ? <img src={first.image} alt="" loading="lazy" /> : "📦"}</div>
            <div><b>{title}</b><div className="m">{meta}</div></div>
            <div className="st">
              {o.status === "shipped" ? <span className="pill ok">{t("stShipped")}</span> : <span className="pill tr">{t("stConfirmed")}</span>}
              {o.trackingUrl
                ? <a className="btn" style={{ fontSize: 14.5, padding: "10px 16px", width: "auto" }} href={o.trackingUrl} target="_blank" rel="noopener noreferrer">{t("track")}</a>
                : <span style={{ fontSize: 13, color: "#999" }}>{t("trackLater")}</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---- Impostazioni -------------------------------------------------------------------
function Settings({ t, data, reload }) {
  const m = data.member;
  const [fn, setFn] = useState(m.firstName || "");
  const [ln, setLn] = useState(m.lastName || "");
  const [nameMsg, setNameMsg] = useState(null);
  const [cur, setCur] = useState(""), [p1, setP1] = useState(""), [p2, setP2] = useState("");
  const [pwMsg, setPwMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setNameMsg(null);
    if (!fn.trim()) return setNameMsg({ err: true, text: t("errGeneric") });
    setBusy(true);
    const r = await post("/api/portal/settings", { action: "name", firstName: fn, lastName: ln });
    setBusy(false);
    if (r.ok) { setNameMsg({ text: t("saved") }); reload(); } else setNameMsg({ err: true, text: t("errGeneric") });
  }
  async function savePw() {
    setPwMsg(null);
    if (p1.length < 8) return setPwMsg({ err: true, text: t("errPwShort") });
    if (p1 !== p2) return setPwMsg({ err: true, text: t("errPwMismatch") });
    setBusy(true);
    const r = await post("/api/portal/settings", { action: "password", current: cur, password: p1 });
    setBusy(false);
    if (r.ok) { setPwMsg({ text: t("saved") }); setCur(""); setP1(""); setP2(""); reload(); }
    else setPwMsg({ err: true, text: r.error === "wrong_current" ? t("errWrongCurrent") : r.error === "too_many" ? t("errTooMany") : t("errGeneric") });
  }

  return (
    <>
      <h1>{t("settingsTitle")}</h1>
      <p className="sub">{t("settingsSub")}</p>
      <div className="card form"><h3>{t("yourDetails")}</h3>
        {nameMsg && <div className={`msg ${nameMsg.err ? "err" : "ok"}`}>{nameMsg.text}</div>}
        <div className="two">
          <div><label htmlFor="fn">{t("firstName")}</label><input id="fn" value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={onEnter(saveName)} /></div>
          <div><label htmlFor="ln">{t("lastName")}</label><input id="ln" value={ln} onChange={(e) => setLn(e.target.value)} onKeyDown={onEnter(saveName)} /></div>
        </div>
        <label htmlFor="em">{t("emailAddress")}</label><input id="em" value={m.email} readOnly />
        <p className="note">{t("emailNote")}</p>
        <button type="button" className="btn" onClick={saveName} disabled={busy}>{t("saveChanges")}</button>
      </div>
      <div style={{ height: 16 }} />
      <div className="card form"><h3>{t("changePw")}</h3>
        {pwMsg && <div className={`msg ${pwMsg.err ? "err" : "ok"}`}>{pwMsg.text}</div>}
        {m.hasPassword && <><label htmlFor="cur">{t("currentPw")}</label><input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></>}
        <label htmlFor="p1">{t("newPw")}</label><input id="p1" type="password" autoComplete="new-password" placeholder={t("pwMin")} value={p1} onChange={(e) => setP1(e.target.value)} />
        <label htmlFor="p2">{t("repeatNewPw")}</label><input id="p2" type="password" autoComplete="new-password" placeholder={t("pwSame")} value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={onEnter(savePw)} />
        <button type="button" className="btn" onClick={savePw} disabled={busy}>{t("saveNewPw").replace(" →", "")}</button>
      </div>
      <div className="card help"><div><h3>{t("addrHelpTitle")}</h3><p>{t("addrHelpSub")}</p></div><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></div>
    </>
  );
}

function Ended({ t }) {
  return (
    <div className="card empty" style={{ marginTop: 20 }}>
      <h1 style={{ fontSize: 24 }}>{t("endedTitle")}</h1>
      <p style={{ margin: "8px 0 0" }}>{t("endedSub", { email: SUPPORT_EMAIL })}</p>
    </div>
  );
}
