// components/portal/Library.js — Tinnitus Library: cadeau-banner met aftelklok + boekenkaarten (ook op de welkomstpagina)
import { useState } from "react";
import { post } from "./AuthShell";
import { fmtDate } from "../../lib/portal-i18n";

const btitle = (lang, b) => (lang === "it" ? b.it : b.en || b.it).title;
const bdesc = (lang, b) => (lang === "it" ? b.it : b.en || b.it).desc;


// Boek openen: ontgrendelen (of al ontgrendeld) → pdf in een nieuw tabblad
export async function openBook(slug, t, lang, setErr, setBusy) {
  setErr && setErr("");
  setBusy && setBusy(slug);
  const win = window.open("", "_blank"); // vóór de fetch, anders blokkeert de pop-upblokker op mobiel
  try {
    const r = await post("/api/portal/library/unlock", { slug });
    if (r.ok) { if (win) win.location = r.url; else window.location = r.url; return true; }
    if (win) win.close();
    if (r.error === "limit") setErr && setErr(t("libErrLimit", { date: fmtDate(lang, r.availableAgain, { day: "numeric", month: "long" }) }));
    else setErr && setErr(t("libErrGeneric"));
  } catch { if (win) win.close(); setErr && setErr(t("libErrGeneric")); }
  finally { setBusy && setBusy(""); }
  return false;
}

// Cadeau-banner: zichtbaar tot het cadeau is opgehaald; daarna weg (het boek staat dan "nel tuo archivio")
export function GiftBanner({ t, lang, data, reload }) {
  const g = data?.gift;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  if (!g || g.claimed || done) return null;
  const book = data.library?.books?.find((b) => b.slug === g.slug);
  if (!book || book.unlocked) return null;
  const title = btitle(lang, book);
  return (
    <div className="gift">
      <img src={book.cover} alt={title} />
      <div className="gb">
        <div className="gk">🎁 {t("giftTitle")}</div>
        <b>{t("giftSub", { title })}</b>
        <div className="gl">{t("giftNote")}</div>
        <button type="button" className="btn" disabled={!!busy} onClick={async () => { const ok = await openBook(g.slug, t, lang, setErr, setBusy); if (ok) { setDone(true); reload && reload(); } }}>{busy ? t("libOpening") : t("giftBtn")}</button>
        {err && <div className="claim-err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}

export default function Library({ t, lang, data, reload }) {
  const lib = data.library;
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  return (
    <>
      <h1>{t("libTitle")}</h1>
      <p className="sub">{t("libSub")}</p>
      <GiftBanner t={t} lang={lang} data={data} reload={reload} />
      {lib.books.length === 0 && <div className="card empty">📚<br />{t("libEmpty")}</div>}
      {lib.books.length > 0 && (
        <p className="note-s" style={{ margin: "0 0 14px" }}>
          {lib.left > 0 ? t("libLeft", { n: lib.left }) : t("libLeftNone", { date: fmtDate(lang, lib.cycleEnd, { day: "numeric", month: "long" }) })}
          {lib.bonus > 0 && <> · <b>{t("libBonus")}</b></>}
        </p>
      )}
      {err && <div className="claim-err">{err}</div>}
      <div className="bg">
        {lib.books.map((b) => {
          const title = btitle(lang, b);
          const locked = !b.available;
          return (
            <div key={b.slug} className={`card bk${locked ? " locked" : ""}`}>
              <div className="bcov"><img src={b.cover} alt={title} loading="lazy" />{b.unlocked && <span className="bdg ok">✓ {t("libUnlocked")}</span>}</div>
              <div className="bbd">
                <h3>{title}</h3>
                <p>{bdesc(lang, b)}</p>
                <div className="bm">{t("libPages", { n: b.pages })} · PDF</div>
                {locked
                  ? <span className="btn grey">{t("libLocked", { date: fmtDate(lang, b.availableAgain, { day: "numeric", month: "long" }) })}</span>
                  : <button type="button" className={`btn${b.unlocked ? " sec" : ""}`} disabled={!!busy} onClick={async () => { const ok = await openBook(b.slug, t, lang, setErr, setBusy); if (ok) reload && reload(); }}>{busy === b.slug ? t("libOpening") : b.unlocked ? t("libDownloadAgain") : t("libDownload")}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
