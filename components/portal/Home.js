// components/portal/Home.js — Home van het ledenportaal (design: design/portal/home/mock-*-v3.html)
// Welkomst (tot "Ho capito"), waarde van de membership, login-streak met verrassingscadeaus, recente activiteit,
// "dove trovare tutto". Plus de gedeelde stukken: notificatiebel, cadeau-onthulling met confetti en het ideeënformulier.
import { useEffect, useRef, useState } from "react";
import { post } from "./AuthShell";
import { fmtDate, fmtMoney } from "../../lib/portal-i18n";
import { IcGift, IcBooks, IcCap, IcBox, IcBell } from "./Icons";

const ptitle = (lang, p) => (p ? (lang === "it" && p.it ? p.it.title : p.title) : "");
const btitle = (lang, b) => (b ? (lang === "it" ? b.it : b.en || b.it).title : "");
const findProduct = (data, slug) => (data.freeItems || []).find((p) => p.slug === slug);
const findBookV = (data, slug) => (data.library?.books || []).find((b) => b.slug === slug);

export function relTime(t, lang, at) {
  if (!at) return "";
  const d = new Date(at), now = new Date();
  const day = (x) => Math.floor(new Date(x.toDateString()).getTime() / 86400000);
  const diff = day(now) - day(d);
  if (diff <= 0) return t("relToday");
  if (diff === 1) return t("relYesterday");
  if (diff < 30) return t("relDays", { n: diff });
  return fmtDate(lang, at, { day: "numeric", month: "short" });
}

// ---- confetti ---------------------------------------------------------------------
const COLORS = ["#df8455", "#f2b58f", "#87b995", "#f6d36b", "#7fb2e5", "#e77c9c"];
export function Confetti({ pieces = 120 }) {
  const [items] = useState(() => Array.from({ length: pieces }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.4 + Math.random() * 1.8, rot: Math.round(Math.random() * 360),
    color: COLORS[i % COLORS.length], round: i % 3 === 0, drift: (Math.random() - 0.5) * 120,
  })));
  return (
    <div className="cf-wrap" aria-hidden="true">
      {items.map((c, i) => (
        <i key={i} className={`cf${c.round ? " r" : ""}`} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, "--rot": `${c.rot}deg`, "--dx": `${c.drift}px` }} />
      ))}
    </div>
  );
}

// ---- cadeau openen (streak 30/60/90 of verjaardag) ---------------------------------
export function RewardModal({ t, lang, data, reward, onClose }) {
  const [state, setState] = useState({ busy: true, err: "", slug: null, url: null });
  useEffect(() => {
    let alive = true;
    post("/api/portal/home", { action: "openReward", id: reward.id }).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ busy: false, err: "", slug: r.slug, url: r.url });
      else setState({ busy: false, err: t("errGeneric"), slug: null, url: null });
    }).catch(() => alive && setState({ busy: false, err: t("errGeneric"), slug: null, url: null }));
    return () => { alive = false; };
  }, [reward.id]);
  const book = state.slug ? findBookV(data, state.slug) : null;
  const name = data.member?.firstName;
  const bday = reward.kind === "birthday";
  return (
    <div className="rw-ov" role="dialog" aria-modal="true">
      {!state.busy && !state.err && <Confetti />}
      <div className="rw">
        <div className="rw-k">{bday ? t("rwKBday") : t("rwK", { n: reward.days })}</div>
        <h2>{bday ? (name ? t("rwHBday", { name }) : t("rwHBdayNoName")) : (name ? t("rwH", { name }) : t("rwHNoName"))}</h2>
        <p className="rw-s">{bday ? t("rwSubBday") : t("rwSub1")}<br />{t("rwSub2")}</p>
        {state.busy && <p className="rw-s">{t("rwOpening")}</p>}
        {state.err && <div className="claim-err">{state.err}</div>}
        {book && (
          <>
            <img className="rw-cover" src={book.cover} alt={btitle(lang, book)} />
            <div className="rw-title">{btitle(lang, book)}</div>
            <div className="rw-meta">{t("rwMeta", { n: book.pages })}</div>
            <span className="rw-keep">{t("rwKeep")}</span>
            <a className="btn rw-btn" href={state.url} target="_blank" rel="noopener noreferrer">{t("rwDl")}</a>
            <span className="rw-later">{t("rwSaved")}</span>
          </>
        )}
        <button type="button" className="rw-x" onClick={onClose} aria-label={t("rwClose")}>✕</button>
      </div>
    </div>
  );
}

// ---- notificaties ---------------------------------------------------------------------
const N_ICON = { reward: "🎁", birthday: "🎂", free: "🎁", guide: "📚", streak: "🔥", saver: "🛟", shipped: "📦" };
const N_ROUTE = { reward: "home", birthday: "home", free: "free", guide: "library", streak: "home", saver: "home", shipped: "orders" };

function notifText(t, lang, data, n) {
  switch (n.type) {
    case "reward": return [t("nReward"), t("nRewardSub", { n: n.days })];
    case "birthday": return [t("nBirthday"), t("nBirthdaySub")];
    case "free": return [t("nFree"), t("nFreeSub")];
    case "guide": return [t("nGuide"), t("nGuideSub")];
    case "streak": return [t("nStreak", { n: n.streak }), n.daysToGift ? t("nStreakSub", { d: n.daysToGift }) : t("nStreakSubDone")];
    case "saver": return [t("nSaver"), t("nSaverSub")];
    case "shipped": return [t("nShipped", { product: ptitle(lang, findProduct(data, n.slug)) || n.order }), t("nShippedSub")];
    default: return ["", ""];
  }
}

export function Bell({ t, lang, data, nav }) {
  const home = data?.home;
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!home) return null;
  const unread = read ? 0 : home.unread;
  const toggle = () => {
    const next = !open; setOpen(next);
    if (next && home.unread > 0 && !read) { setRead(true); post("/api/portal/home", { action: "readNotifications" }).catch(() => {}); }
  };
  return (
    <div className="bell-w" ref={ref}>
      <button type="button" className="bell" onClick={toggle} aria-label={t("notifTitle")}>
        <IcBell />{unread > 0 && <span className="bn">{unread}</span>}
      </button>
      {open && (
        <div className="np">
          <div className="np-hd"><b>{t("notifTitle")}</b>{home.unread > 0 && <span className="np-mr">{t("notifMarkAll")} ✓</span>}</div>
          {home.notifications.length === 0 && <div className="np-empty">{t("notifEmpty")}</div>}
          {home.notifications.map((n) => {
            const [title, sub] = notifText(t, lang, data, n);
            return (
              <button type="button" key={n.id} className={`np-it${n.unread ? " new" : ""}`} onClick={() => { setOpen(false); nav(N_ROUTE[n.type] || "home"); }}>
                <span className="np-ic">{N_ICON[n.type] || "•"}</span>
                <span className="np-tx"><b>{title}</b><span>{sub}</span></span>
                <span className="np-tm">{relTime(t, lang, n.at)}{n.unread && <i />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- ideeën / verzoeken ----------------------------------------------------------------
export function SuggestLink({ t, page }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState({ busy: false, err: "", done: false });
  async function send() {
    if (text.trim().length < 3) return setState({ busy: false, err: t("sgErr"), done: false });
    setState({ busy: true, err: "", done: false });
    const r = await post("/api/portal/home", { action: "suggest", text, page }).catch(() => ({ ok: false }));
    if (r.ok) { setState({ busy: false, err: "", done: true }); setText(""); }
    else setState({ busy: false, err: t("errGeneric"), done: false });
  }
  return (
    <>
      <p className="sg-link"><button type="button" onClick={() => { setOpen(true); setState({ busy: false, err: "", done: false }); }}>{t("sgLink")}</button></p>
      {open && (
        <div className="rw-ov" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="rw sg">
            <h2>{t("sgTitle")}</h2>
            {state.done ? <p className="rw-s" style={{ marginTop: 14 }}>{t("sgThanks")}</p> : (
              <>
                <p className="rw-s">{t("sgSub")}</p>
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("sgPh")} rows={5} maxLength={2000} />
                {state.err && <div className="claim-err">{state.err}</div>}
                <div className="sg-act">
                  <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t("sgCancel")}</button>
                  <button type="button" className="btn" onClick={send} disabled={state.busy}>{state.busy ? "…" : t("sgSend")}</button>
                </div>
              </>
            )}
            <button type="button" className="rw-x" onClick={() => setOpen(false)} aria-label={t("rwClose")}>✕</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---- de Home -----------------------------------------------------------------------------
export default function Home({ t, lang, data, nav, reload }) {
  const h = data.home;
  const m = data.member;
  const [welcome, setWelcome] = useState(!!h?.welcome);
  const [reminder, setReminder] = useState(!!h?.streak?.reminder);
  const [reward, setReward] = useState(null);
  if (!h) return null;
  const since = data.membership?.since || m.startedAt;

  const dismiss = () => { setWelcome(false); post("/api/portal/home", { action: "dismissWelcome" }).catch(() => {}); };
  const remindOn = () => { setReminder(true); post("/api/portal/home", { action: "reminder", on: true }).catch(() => {}); };

  const itemLabel = (i) => {
    if (i.type === "product") return [ptitle(lang, findProduct(data, i.slug)), t("vFreeProduct")];
    const b = findBookV(data, i.slug);
    const kind = { welcome: "vWelcomeGift", library: "vLibrary", streak: "vSurprise", birthday: "vBirthday" }[i.kind] || "vLibrary";
    return [btitle(lang, b), t(kind)];
  };

  const s = h.streak;
  const fill = s ? Math.min(100, (s.current / 90) * 100) : 0;
  const ready = h.rewards || [];

  return (
    <div className="hm">
      {welcome && (
        <div className="card welcome">
          <div className="wl">
            <div className="wk">{t("welcomeK")}</div>
            <h2>{m.firstName ? t("welcomeH", { name: m.firstName }) : t("welcomeHNoName")}</h2>
            <p>{t("welcomeP")}</p>
            <button type="button" className="wx" onClick={dismiss}>{t("gotIt")}</button>
          </div>
          <div className="wg">
            {[["free", IcGift, "navFree", "wFreeSub"], ["library", IcBooks, "navLibrary", "wLibSub"], ["courses", IcCap, "navCourses", "wCourseSub"], ["orders", IcBox, "navOrders", "wOrdersSub"]].map(([id, Ic, lab, sub]) => (
              <button type="button" key={id} className="wt" onClick={() => nav(id)}><span className="wi"><Ic /></span><span><b>{t(lab)}</b><small>{t(sub)}</small></span></button>
            ))}
          </div>
        </div>
      )}

      {/* klaarstaande cadeaus (streak / verjaardag) */}
      {ready.map((r) => (
        <div key={r.id} className="card ready">
          <span className="rd-g">{r.kind === "birthday" ? "🎂" : "🎁"}</span>
          <div className="rd-t"><b>{r.kind === "birthday" ? t("bdReady") : t("stReady")}</b><span>{r.kind === "birthday" ? t("bdReadySub") : t("stReadySub", { n: r.days })}</span></div>
          <button type="button" className="btn" onClick={() => setReward(r)}>{t("stOpen")}</button>
        </div>
      ))}

      {/* waarde */}
      <div className="card val">
        <div>
          <div className="vk">{t("valK")}</div>
          <div className="vbig">{fmtMoney(lang, h.value.total)}</div>
          <div className="vsince">{t("valSince", { date: fmtDate(lang, since, { day: "numeric", month: "long" }) })}</div>
        </div>
        {h.value.items.length > 0 ? (
          <div className="vitems">
            {h.value.items.map((i, k) => {
              const [title, kind] = itemLabel(i);
              return (
                <div key={k} className="vit">
                  <span className="vth"><img src={i.image} alt="" loading="lazy" /></span>
                  <span><b>{title}</b><small>{kind}{i.at ? ` · ${fmtDate(lang, i.at, { day: "numeric", month: "short" })}` : ""}</small><span className="vv">{fmtMoney(lang, i.value)}</span></span>
                </div>
              );
            })}
          </div>
        ) : <div className="vempty">{t("valEmpty")}</div>}
      </div>

      {/* login-streak */}
      {s && (
        <div className="card streak">
          <div className="sl"><span className="sk">{t("stK")}</span><span className="num"><b>{s.current}</b> {s.current === 1 ? t("stDay1") : t("stDays")}</span></div>
          <div className="prog">
            <div className="track"><i style={{ width: `${fill}%` }} />
              {s.milestones.map((ms, k) => (
                <span key={ms.day} className={`m${!ms.reached && ms.day === s.nextGift ? " on" : ""}${ms.reached ? " done" : ""}`} style={{ left: `${((k + 1) / 3) * 100}%` }}><IcGift w={2} /></span>
              ))}
            </div>
            <div className="marks">
              <span style={{ left: 0 }}>{t("stToday")}</span>
              {s.milestones.map((ms, k) => (
                <span key={ms.day} style={{ left: `${((k + 1) / 3) * 100}%` }}>
                  {ms.day === s.nextGift && s.daysToGift ? (s.daysToGift === 1 ? t("stToGo1", { n: ms.day }) : t("stToGo", { n: ms.day, d: s.daysToGift })) : t("stDay", { n: ms.day })}
                </span>
              ))}
            </div>
          </div>
          <div className="sr">
            <span>{s.saverAvail > 0 ? <>🛟 <b>{t("stSaver")}</b> {t("stSaverLeft")}</> : <>🛟 {t("stSaverNone")}</>}</span>
            {reminder ? <span className="ok">{t("stRemindOn")}</span> : <button type="button" className="lnk" onClick={remindOn}>{t("stRemind")}</button>}
          </div>
        </div>
      )}

      {/* recente activiteit */}
      {h.activity.length > 0 && (
        <>
          <div className="sect"><h3>{t("actTitle")}</h3><button type="button" className="lnk" onClick={() => nav("orders")}>{t("actAll")}</button></div>
          <div className="card acts">
            {h.activity.map((a, k) => {
              const p = findProduct(data, a.slug), b = findBookV(data, a.slug);
              let ic = "🎁", g = false, title = "", sub = null;
              if (a.type === "shipped") { ic = "📦"; g = true; title = t("aShipped", { product: ptitle(lang, p) }); sub = <>{t("aShippedSub")}{a.trackingUrl && <> · <a className="lnk" href={a.trackingUrl} target="_blank" rel="noopener noreferrer">{t("aTrack")}</a></>}</>; }
              else if (a.type === "claim") { title = t("aClaim"); sub = a.value ? t("aClaimSub", { amount: fmtMoney(lang, a.value) }) : ptitle(lang, p); }
              else if (a.type === "ebook") { ic = "📖"; title = t("aEbook"); sub = btitle(lang, b); }
              else if (a.type === "surprise") { ic = "🎉"; title = t("aSurprise"); sub = btitle(lang, b); }
              else if (a.type === "reactivated") { ic = "💚"; g = true; title = t("aReact"); sub = t("aReactSub"); }
              else if (a.type === "joined") { ic = "💚"; g = true; title = t("aJoined"); sub = t("aJoinedSub"); }
              return (
                <div key={k} className="ac">
                  <span className={`aico${g ? " g" : ""}`}>{ic}</span>
                  <div><b>{title}</b><span>{sub}</span></div>
                  <em>{relTime(t, lang, a.at)}</em>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* dove trovare tutto */}
      <div className="sect"><h3>{t("whereTitle")}</h3></div>
      <div className="grid6">
        {[["free", "🎁", "navFree", "whFree"], ["library", "📚", "navLibrary", "whLib"], ["courses", "🎓", "navCourses", "whCourses"], ["membership", "💚", "navMember", "whMember"], ["orders", "📦", "navOrders", "whOrders"], ["settings", "⚙️", "navSettings", "whSettings"]].map(([id, ic, lab, sub]) => (
          <button type="button" key={id} className="card tile" onClick={() => nav(id)}><span className="tico">{ic}</span><b>{t(lab)}</b><span>{t(sub)}</span></button>
        ))}
      </div>

      {reward && <RewardModal t={t} lang={lang} data={data} reward={reward} onClose={() => { setReward(null); reload && reload(); }} />}
    </div>
  );
}
