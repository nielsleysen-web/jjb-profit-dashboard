// components/portal/ManageMembership.js — "Gestisci abbonamento" under Il mio abbonamento (and on the paused screen).
// Flow (as designed by the owner): menu → pause (28 days, once) | resume (now / on a date) | cancel:
// reason → one screen with an offer that fits the reason (pause / €24,95 / 15% off) → confirm → done.
// Calm, minimal styling: no emoji, thin line icons, brand-orange accents (pink on LubriSense via brandCss). Works for both portals (brandCss on MANAGE_CSS).
// Server: /api/portal/membership (lib/portal-self-service.js). Texts: lib/portal-i18n.js (mg*, pz*, rs*, cn*, o1–o6, cf*, cd*, proof*).
import { useEffect, useState } from "react";
import { post, SUPPORT_EMAIL } from "./AuthShell";
import { fmtDate, fmtMoney } from "../../lib/portal-i18n";

export const MANAGE_CSS = `
.mg{--ink:#1d1d1f;--sub:#6e6e73;--mute:#8e8e93;--line:#e8e8ea;--soft:#f5f5f4;--tint:#df8455;max-width:580px;margin:40px auto 0;text-align:center;color:var(--ink)}
.mg.first{margin-top:4px}
.mg h2{font-size:26px;font-weight:700;letter-spacing:-.4px;line-height:1.25;margin:0 0 10px}
.mg .ms{color:var(--sub);font-size:16px;line-height:1.6;margin:0 auto 28px;max-width:500px}
.mg .eyebrow{font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#c96f43;margin:0 0 10px}
.mg .plan{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 24px;text-align:left;margin:0 0 36px}
.mg .plan .pn{font-size:17px;font-weight:600}.mg .plan .pr{color:var(--sub);font-size:15px;margin:2px 0 14px}
.mg .plan .ln{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--sub);font-size:14px}
.mg .dot{width:3px;height:3px;border-radius:50%;background:#c7c7cc}
.mg .st{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:12.5px;font-weight:600;background:var(--soft);color:#3a3a3c}
.mg .st:before{content:"";width:6px;height:6px;border-radius:50%;background:#34a36b}
.mg .st.paused:before{background:#a1a1a6}.mg .st.cancelling:before,.mg .st.cancelled:before{background:#d1665a}.mg .st.trial:before{background:#3a9c8f}
.mg .offerline{margin:14px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:14px;color:var(--sub)}
.mg .list{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;text-align:left}
.mg .row{display:flex;align-items:center;gap:16px;width:100%;background:none;border:none;border-top:1px solid var(--line);padding:18px 20px;font:inherit;text-align:left;cursor:pointer;color:var(--ink);transition:background .15s}
.mg .row:first-child{border-top:none}.mg .row:hover{background:#fafafa}
.mg .row b{display:block;font-size:16px;font-weight:600}.mg .row span.d{display:block;color:var(--sub);font-size:14px;margin-top:2px}
.mg .row .tx{flex:1;min-width:0}
.mg .row.danger b{color:#b4483c}
.mg .ib{width:40px;height:40px;border-radius:12px;background:#fdf3ec;display:flex;align-items:center;justify-content:center;flex:none;color:#c96f43}
.mg .chev{color:#c7c7cc;flex:none}
.mg svg{display:block}
.mg .p{display:block;width:100%;margin:0 0 12px;padding:16px 20px;border:none;border-radius:14px;background:#df8455;color:#fff;font:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:opacity .15s}
.mg .p:hover{background:#d2773f}.mg .p[disabled],.mg .s[disabled]{opacity:.4;cursor:default}
.mg .p small,.mg .s small{display:block;font-weight:400;font-size:13.5px;margin-top:3px;opacity:.75}
.mg .s{display:block;width:100%;margin:0 0 12px;padding:15px 20px;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:14px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:border-color .15s}
.mg .s:hover{border-color:#f1d9c9}
.mg .lk{display:block;margin:4px auto 0;background:none;border:none;font:inherit;font-size:14.5px;color:var(--sub);cursor:pointer;padding:10px}
.mg .lk:hover{color:var(--ink)}
.mg .lk.back{margin-top:18px;color:var(--mute)}
.mg .halo{width:72px;height:72px;border-radius:50%;background:#fdf3ec;display:flex;align-items:center;justify-content:center;margin:6px auto 28px;color:#c96f43}
.mg .halo svg{width:30px;height:30px}
.mg.menu{max-width:none;text-align:left}.mg.menu .eyebrow{margin-left:2px}
.mg .meta{font-size:14px;color:var(--sub);margin:-8px 0 26px}.mg .meta b{color:var(--ink);font-weight:600}
.mg .note{font-size:13.5px;color:var(--mute);line-height:1.6;margin:6px auto 4px;max-width:460px}
.mg .proof{font-size:14px;color:var(--sub);margin:-6px auto 28px;max-width:460px;display:flex;align-items:center;justify-content:center;gap:10px}
.mg .proof:before,.mg .proof:after{content:"";height:1px;width:28px;background:#f1d9c9;flex:none}
.mg .opts{display:grid;gap:10px;margin:0 0 20px;text-align:left}
.mg .opt{display:flex;gap:16px;align-items:flex-start;width:100%;background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;font:inherit;text-align:left;cursor:pointer;color:var(--ink);transition:border-color .15s,background .15s}
.mg .opt:hover{border-color:#f1d9c9}.mg .opt.on{border-color:#df8455;background:#fffaf6}
.mg .opt b{display:block;font-size:16px;font-weight:600;margin-bottom:3px}.mg .opt span.d{color:var(--sub);font-size:14px;line-height:1.5}
.mg .opt input[type=date]{accent-color:#df8455;margin-top:12px;font:inherit;font-size:15px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}
.mg .rad{display:flex;align-items:center;gap:14px;width:100%;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;font:inherit;font-size:16px;text-align:left;cursor:pointer;color:var(--ink);transition:border-color .15s,background .15s}
.mg .rad:hover{border-color:#f1d9c9}
.mg .rad i{width:18px;height:18px;border-radius:50%;border:1.5px solid #c7c7cc;flex:none;position:relative;transition:border-color .15s}
.mg .rad.on{border-color:#df8455;background:#fffaf6}.mg .rad.on i{border-color:#df8455}.mg .rad.on i:after{content:"";position:absolute;inset:3px;border-radius:50%;background:#df8455}
.mg label.nl{display:block;text-align:left;color:var(--sub);font-size:14.5px;margin:22px 0 8px}
.mg textarea{width:100%;min-height:104px;font:inherit;font-size:15.5px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;resize:vertical;background:#fff;color:var(--ink);outline:none;box-sizing:border-box}
.mg textarea:focus{border-color:#f1d9c9}
.mg .box{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;text-align:left;margin:0 0 4px}
.mg .box h2{font-size:24px;margin:0 0 20px}
.mg .nxt{background:#fdf3ec;border-radius:14px;padding:16px 18px;margin:0 0 20px;display:flex;gap:14px;align-items:flex-start}
.mg .nxt .t{font-size:13px;color:var(--sub)}.mg .nxt b{display:block;font-size:17px;font-weight:600;margin:2px 0}.mg .nxt span{color:var(--sub);font-size:13.5px}
.mg .bul{list-style:none;padding:0;margin:0 0 20px}.mg .bul li{display:flex;gap:14px;margin:0 0 14px;font-size:15px;line-height:1.5;color:#3a3a3c}.mg .bul li .ic{flex:none;color:#c96f43;margin-top:1px}
.mg .hint{background:var(--soft);border-radius:12px;padding:13px 16px;font-size:14px;color:var(--sub);margin:0 0 22px;line-height:1.5}
.mg .err{background:#fbefed;color:#a2382c;border-radius:12px;padding:11px 14px;margin:0 0 14px;font-size:14.5px;text-align:left}
.mg .ok{padding:8px 0 4px}
.mg .ok .halo{color:#2f7d55;background:#eef6f1}
.mg .ok h2{margin:0 0 8px}.mg .ok p{margin:0 auto;color:var(--sub);font-size:15.5px;line-height:1.6;max-width:460px}
@media(max-width:700px){.mg h2{font-size:23px}.mg .box{padding:20px}.mg .row{padding:16px}.mg .plan{padding:18px}}
`;

// Thin line icons (no emoji)
const P = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const Ic = {
  gift: <svg {...P}><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12M12 8.5S10.5 4 8 4.5 6.8 8.5 12 8.5zM12 8.5S13.5 4 16 4.5 17.2 8.5 12 8.5z" /></svg>,
  pause: <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></svg>,
  play: <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M10.5 9.2 15 12l-4.5 2.8z" /></svg>,
  close: <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="m9.5 9.5 5 5M14.5 9.5l-5 5" /></svg>,
  cal: <svg {...P}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>,
  now: <svg {...P}><path d="M13 3.5 6 13.5h5.5L11 20.5l7-10h-5.5z" /></svg>,
  cycle: <svg {...P}><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1M17.5 3.8v3.3h-3.3M6.5 20.2v-3.3h3.3" /></svg>,
  sliders: <svg {...P}><path d="M5 7h9M18 7h1M5 17h3M12 17h7" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  check: <svg {...P} width="28" height="28"><path d="m6 12.5 4 4 8-9" /></svg>,
  chev: <svg {...P} width="18" height="18"><path d="m9 6 6 6-6 6" /></svg>,
};

const REASONS = ["not_subscription", "too_expensive", "no_results", "too_much", "not_started", "other"];
const dayIso = (d) => new Date(d).toISOString().slice(0, 10);

export default function ManageMembership({ t, lang, data, reload, nav, brand, first, onFocus }) {
  const ms = data.manage || {};
  const name = data.member?.firstName || "";
  const [step, setStep] = useState("menu");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // { icon, title, sub, undo }
  const [from, setFrom] = useState("offer"); // where "back" on the confirm screen goes

  // Sub-screens are shown on their own (the page hides the subscription details above)
  useEffect(() => { onFocus && onFocus(step !== "menu" || !!done); }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const T = (key, vars = {}) => (name ? t(key, { name, ...vars }) : t(`${key}NoName`, vars));
  const money = (cents) => fmtMoney(lang, cents / 100);
  const D = (iso, long) => (iso ? fmtDate(lang, iso, long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" }) : "");
  const plan = brand === "lubrisense" ? "Intimate Care Membership" : "Health For Life Membership";
  const days = ms.pauseDays || 28;
  const go = (s) => { setErr(""); setStep(s); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} };

  async function act(body, after) {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await post("/api/portal/membership", body).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setErr(r.error === "pause_used" ? t("pzUsed", { email: SUPPORT_EMAIL }) : t("mgErr", { email: SUPPORT_EMAIL })); return; }
    after(r);
  }
  const pause = () => act({ action: "pause" }, (r) => setDone({ icon: Ic.pause, title: t("pzDone", { date: D(r.until, true) }), sub: t("pzNote", { days }) }));
  const offer = (kind) => act({ action: "offer", kind, reason, note }, (r) => setDone({ icon: Ic.check, title: t("ofDone", { price: money(r.newCents) }), sub: t("ofDoneSub") }));
  const cancel = () => act({ action: "cancel", reason, note }, (r) => setDone({ icon: Ic.check, title: t("cdTitle"), sub: r.accessUntil ? t("cdSub", { date: D(r.accessUntil, true) }) : t("cdSubNow"), undo: !!r.accessUntil && ms.provider !== "paypal" }));
  const undo = () => act({ action: "undoCancel" }, () => { setDone(null); reload && reload(); });
  const resumeNow = () => act({ action: "resume", mode: "now" }, () => { reload && reload(); });
  const resumeDate = () => act({ action: "resume", mode: "date", date }, (r) => setDone({ icon: Ic.cal, title: t("rsDoneDate", { date: D(r.until, true) }) }));

  const Err = () => (err ? <div className="err">{err}</div> : null);
  const Back = ({ to = "menu" }) => <button type="button" className="lk back" onClick={() => go(to)}>{t("mgBack")}</button>;
  const Proof = ({ k }) => <p className="proof">{t(k)}</p>;
  const PauseBtn = ({ label, sub, primary }) => (ms.canPause
    ? <button type="button" className={primary ? "p" : "s"} disabled={busy} onClick={pause}>{label}{sub && <small>{sub}</small>}</button>
    : <p className="note" style={{ marginBottom: 12 }}>{t("pzUsed", { email: SUPPORT_EMAIL })}</p>);
  const toConfirm = () => { setFrom(step); go("confirm"); };
  const cls = `mg${first || step !== "menu" ? " first" : ""}`;

  /* ---------- done ---------- */
  if (done) {
    return (
      <div className="mg first">
        <div className="ok"><div className="halo">{done.icon}</div><h2>{done.title}</h2>{done.sub && <p>{done.sub}</p>}</div>
        <div style={{ marginTop: 28 }}>
          <Err />
          {done.undo && <><p className="note" style={{ marginBottom: 12 }}>{t("cdUndo")}</p><button type="button" className="s" disabled={busy} onClick={undo}>{t("mgUndo")}</button></>}
          <button type="button" className="lk back" onClick={() => { setDone(null); setStep("menu"); reload && reload(); }}>{t("mgDoneBtn")}</button>
        </div>
      </div>
    );
  }

  /* ---------- menu ---------- */
  if (step === "menu") {
    const st = ms.status || "active";
    const line = st === "paused" ? t("mgResumes", { date: D(ms.pausedUntil) }) : st === "cancelling" || st === "cancelled" ? (ms.accessUntil ? t("mgAccess", { date: D(ms.accessUntil) }) : "") : ms.nextCharge ? t("mgNext", { date: D(ms.nextCharge) }) : "";
    const ended = st === "cancelling" || st === "cancelled";
    const Row = ({ icon, title, desc, onClick, danger }) => (
      <button type="button" className={`row${danger ? " danger" : ""}`} onClick={onClick}>
        <span className="ib">{icon}</span><span className="tx"><b>{title}</b>{desc && <span className="d">{desc}</span>}</span><span className="chev">{Ic.chev}</span>
      </button>
    );
    return (
      <div className={`${cls} menu`}>
        <div className="plan">
          <div className="pn">{plan}</div>
          <div className="pr">{money(ms.priceCents || 4900)} · {t("mgEvery")}</div>
          <div className="ln"><span className={`st ${st}`}>{t({ trial: "stTrial", active: "stActive", paused: "stPaused", cancelling: "stCancelling", cancelled: "stCancelled" }[st] || "stActive")}</span>{line && <span>{line}</span>}</div>
          {ms.offerActive && <div className="offerline">{t("mgOfferActive", { price: money(data.member?.retentionOffer?.newCents || 2495) })}</div>}
        </div>
        <p className="eyebrow">{t("mgTitle")}</p>
        {ended
          ? <>
              <p className="ms">{t("mgCancellingNote", { date: D(ms.accessUntil, true) })}</p>
              <Err />
              {ms.canUndoCancel && <button type="button" className="p" disabled={busy} onClick={undo}>{t("mgUndo")}</button>}
            </>
          : <>
              <Err />
              <div className="list">
                {st !== "paused" && nav && <Row icon={Ic.gift} title={t("mgPerks")} desc={t("mgPerksD")} onClick={() => nav("free")} />}
                {st === "paused"
                  ? <Row icon={Ic.play} title={t("mgResume")} desc={t("mgResumeD")} onClick={() => go("resume")} />
                  : <Row icon={Ic.pause} title={t("mgPause")} desc={t("mgPauseD", { days })} onClick={() => go("pause")} />}
                <Row icon={Ic.close} title={t("mgCancel")} desc={t("mgCancelD")} onClick={() => go("reason")} />
              </div>
            </>}
      </div>
    );
  }

  /* ---------- pause ---------- */
  if (step === "pause") {
    const left = ms.nextCharge ? Math.max(0, Math.ceil((Date.parse(ms.nextCharge) - Date.now()) / 86400000)) : null;
    return (
      <div className={cls}>
        <div className="halo">{Ic.pause}</div>
        <h2>{t("pzTitle")}</h2>
        <p className="ms">{t("pzSub", { days })}</p>
        {left != null && <p className="meta"><b>{left === 0 ? t("pzNextToday") : left === 1 ? t("pzNextTomorrow") : t("pzNextIn", { n: left })}</b></p>}
        <Err />
        {ms.canPause
          ? <><button type="button" className="p" disabled={busy} onClick={pause}>{t("pzBtn", { days })}</button><p className="note">{t("pzNote", { days })} {t("pzOnce", { email: SUPPORT_EMAIL })}</p></>
          : <p className="note">{t("pzUsed", { email: SUPPORT_EMAIL })}</p>}
        <Back />
      </div>
    );
  }

  /* ---------- resume (paused) ---------- */
  if (step === "resume") {
    const min = dayIso(Date.now() + 86400000);
    const max = ms.pausedUntil ? dayIso(Date.parse(ms.pausedUntil) - 86400000) : min;
    return (
      <div className={cls}>
        <p className="eyebrow">{t("rsBadge")}</p>
        <h2>{T("rsTitle")}</h2>
        <p className="ms" style={{ marginBottom: 6 }}>{t("rsSub")}</p>
        <p className="meta" style={{ marginTop: 0 }}>{t("rsPrice", { price: money(ms.priceCents || 4900) })}</p>
        <Err />
        <div className="opts">
          <button type="button" className="opt" disabled={busy} onClick={resumeNow}><span className="ib">{Ic.now}</span><div><b>{t("rsNowT")}</b><span className="d">{t("rsNowD")}</span></div></button>
          {min <= max && (
            <div className={`opt${date ? " on" : ""}`} role="group">
              <span className="ib">{Ic.cal}</span>
              <div style={{ flex: 1 }}>
                <b>{t("rsDateT")}</b><span className="d">{t("rsDateD", { date: D(ms.pausedUntil) })}</span><br />
                <input type="date" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("rsDateT")} />
                {date && <button type="button" className="p" style={{ marginTop: 14, marginBottom: 0 }} disabled={busy} onClick={resumeDate}>{t("rsDateBtn", { date: D(`${date}T12:00:00Z`) })}</button>}
              </div>
            </div>
          )}
        </div>
        <p className="note">{t("rsFine")}</p>
        <Back />
      </div>
    );
  }

  /* ---------- cancel: reason ---------- */
  if (step === "reason") {
    return (
      <div className={cls}>
        <h2>{T("cnTitle")}</h2>
        <p className="ms">{t("cnSub")}</p>
        <div className="opts">
          {REASONS.map((r) => <button key={r} type="button" className={`rad${reason === r ? " on" : ""}`} onClick={() => setReason(r)} aria-pressed={reason === r}><i />{t(`cnR_${r}`)}</button>)}
        </div>
        <label className="nl" htmlFor="mg-note">{t("cnNoteLabel")}</label>
        <textarea id="mg-note" value={note} maxLength={1500} placeholder={t("cnNotePh")} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="p" style={{ marginTop: 22 }} disabled={!reason} onClick={() => (offerScreenUseful(reason, ms) ? go("offer") : toConfirm())}>{t("cnContinue")}</button>
        <Back />
      </div>
    );
  }

  /* ---------- cancel: offer that fits the reason ---------- */
  if (step === "offer") {
    const full = money(ms.priceCents || 4900);
    const pct = ms.offers?.pct15;
    const cheap = ms.offers?.price;
    if (reason === "not_subscription") {
      return (
        <div className={cls}>
          <div className="box">
            <p className="eyebrow">{t("o1Kicker")}</p>
            <h2>{t("o1Title")}</h2>
            {ms.nextCharge && <div className="nxt"><span className="ic" style={{ color: "#c96f43" }}>{Ic.cal}</span><div><div className="t">{t("o1Next")}</div><b>{D(ms.nextCharge)} · {full}</b><span>{t("o1Item")}</span></div></div>}
            <ul className="bul"><li><span className="ic">{Ic.cycle}</span><span>{t("o1B1")}</span></li><li><span className="ic">{Ic.gift}</span><span>{t("o1B2")}</span></li><li><span className="ic">{Ic.sliders}</span><span>{t("o1B3")}</span></li></ul>
            <div className="hint">{t("o1Note")}</div>
            <Err />
            <PauseBtn primary label={t("o1Pause", { days })} />
            <button type="button" className="lk" onClick={toConfirm}>{t("mgCancel")}</button>
          </div>
          <Back />
        </div>
      );
    }
    const screens = {
      too_expensive: { title: "o2Title", sub: ms.canPause ? t("o2Sub", { price: cheap ? money(cheap.cents) : "", full }) : t("o2SubNoPause", { price: cheap ? money(cheap.cents) : "", full }), proof: "proofCustomers",
        primary: cheap && { label: t("o2Btn", { price: money(cheap.cents) }), sub: t("o2BtnSub"), on: () => offer("price") }, pause: t("o2Pause", { days }), no: "ofNoThanks" },
      no_results: { title: "o3Title", sub: t("o3Sub", { pct: pct?.pct || 15 }), proof: "proof85", primary: pct && { label: t("o3Btn", { pct: pct.pct }), on: () => offer("pct15") }, pause: t("o3Pause", { days }), no: "ofCancelAnyway" },
      too_much: { title: "o4Title", sub: t("o4Sub", { days }), pausePrimary: { label: t("o4Btn", { days }), sub: t("o4BtnSub") }, no: "ofNoThanks" },
      not_started: { title: "o5Title", sub: t("o5Sub", { days }), pausePrimary: { label: t("o5Btn", { days }), sub: t("o5BtnSub") }, no: "ofNoThanks" },
      other: { title: "o6Title", sub: t("o6Sub", { pct: pct?.pct || 15 }), proof: "proofCustomers", primary: pct && { label: t("o6Btn", { pct: pct.pct }), sub: t("o6BtnSub"), on: () => offer("pct15") }, no: "ofNoThanks" },
    };
    const s = screens[reason] || screens.other;
    return (
      <div className={cls}>
        <h2>{T(s.title)}</h2>
        <p className="ms">{s.sub}</p>
        {s.proof && <Proof k={s.proof} />}
        <Err />
        {s.primary && <button type="button" className="p" disabled={busy} onClick={s.primary.on}>{s.primary.label}{s.primary.sub && <small>{s.primary.sub}</small>}</button>}
        {s.pausePrimary && <PauseBtn primary label={s.pausePrimary.label} sub={s.pausePrimary.sub} />}
        {s.pause && ms.canPause && <PauseBtn label={s.pause} />}
        <button type="button" className="lk" onClick={toConfirm}>{t(s.no)}</button>
        <Back />
      </div>
    );
  }

  /* ---------- confirm ---------- */
  const st = ms.status;
  const sub = st === "paused" ? t("cfSubNow") : st === "trial" ? t("cfSubTrial", { date: D(ms.nextCharge, true) }) : ms.nextCharge ? t("cfSub", { date: D(ms.nextCharge, true) }) : t("cfSubNow");
  return (
    <div className={cls}>
      <div className="halo">{Ic.close}</div>
      <h2>{t("cfTitle")}</h2>
      <p className="ms">{sub}</p>
      <Err />
      <button type="button" className="p" onClick={() => go("menu")}>{t("cfNo")}</button>
      <button type="button" className="s" disabled={busy} onClick={cancel}>{busy ? "…" : t("cfYes")}</button>
      <Back to={from} />
    </div>
  );
}

// Skip the offer screen when it would have nothing to offer (no pause left and no discount left)
function offerScreenUseful(reason, ms) {
  if (reason === "not_subscription") return true;
  const pause = !!ms.canPause, price = !!ms.offers?.price, pct = !!ms.offers?.pct15;
  return { too_expensive: price || pause, no_results: pct || pause, too_much: pause, not_started: pause, other: pct }[reason] ?? false;
}
