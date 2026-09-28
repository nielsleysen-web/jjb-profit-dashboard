// components/portal/AuthShell.js — Gedeelde opmaak van de inlogschermen van het ledenportaal
// (login, link verstuurd, wachtwoord vergeten, welkom, nieuw wachtwoord). Design: design/portal/01 + 06.

import Head from "next/head";

export const LOGO = "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114";
export const SUPPORT_EMAIL = "Hello@justjennybeauty.com";

export default function AuthShell({ title, heading, sub, children, below }) {
  return (
    <>
      <AuthStyles />
      <Head>
        <title>{title ? `${title} — Just Jenny` : "Just Jenny members"}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="top"><img src={LOGO} alt="Just Jenny" /></div>
      <div className="wrap">
        {heading && <h1>{heading}</h1>}
        {sub && <p className="sub">{sub}</p>}
        <div className="card">{children}</div>
        {below}
        <p className="foot">Health For Life Membership · Just Jenny<br /><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </div>
    </>
  );
}

function AuthStyles() {
  return (
    <>
      <style jsx global>{`
        *{box-sizing:border-box}
        body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a}
        .top{padding:26px 20px 0;text-align:center}
        .top img{height:30px;display:inline-block}
        .wrap{max-width:660px;margin:0 auto;padding:44px 20px 60px;text-align:center}
        h1{font-size:34px;font-weight:800;margin:0 0 10px;letter-spacing:-.3px}
        .sub{color:#666;font-size:17px;margin:0 0 34px;line-height:1.5}
        .card{border:1px solid #e6e6e6;border-radius:14px;padding:26px 28px 24px;text-align:left;box-shadow:0 2px 10px rgba(0,0,0,.04)}
        label{display:block;font-weight:700;font-size:15px;margin:0 0 8px}
        input{width:100%;font:inherit;font-size:16px;padding:14px 16px;border:1.5px solid #cfd8d3;border-radius:10px;outline:none}
        input:focus{border-color:#87b995;box-shadow:0 0 0 3px rgba(135,185,149,.25)}
        .gap{height:16px}
        .row{display:flex;justify-content:space-between;align-items:baseline}
        .row a{font-size:13px;color:#df8455;text-decoration:none;font-weight:600}
        .btn{display:block;width:100%;margin-top:18px;background:#df8455;color:#fff;border:none;border-radius:12px;font:inherit;font-size:17px;font-weight:800;padding:17px;cursor:pointer}
        .btn:hover{background:#d2773f}
        .btn[disabled],.ghost[disabled]{opacity:.6;cursor:default}
        .or{display:flex;align-items:center;gap:12px;color:#999;font-size:13px;margin:22px 0 14px}
        .or:before,.or:after{content:"";flex:1;height:1px;background:#e6e6e6}
        .ghost{display:block;width:100%;background:#fff;color:#df8455;border:2px solid #df8455;border-radius:12px;font:inherit;font-size:16px;font-weight:700;padding:14px;cursor:pointer}
        .err{background:#fdecec;color:#a33;border-radius:10px;padding:12px 14px;font-size:14.5px;margin:0 0 16px}
        .ok{background:#e6f2ea;color:#2d6b45;border-radius:10px;padding:12px 14px;font-size:14.5px;margin:0 0 16px}
        .help{margin-top:22px;font-size:14.5px}
        .help a{color:#df8455;font-weight:700;text-decoration:none}
        .foot{color:#999;font-size:12px;margin-top:60px;line-height:1.8}
        .foot a{color:#999;text-decoration:none}
        @media (max-width:520px){h1{font-size:28px}.card{padding:20px 18px 18px}.wrap{padding-top:32px}}
      `}</style>
    </>
  );
}

// Formulieren zonder <form>: zo kan een klik of Enter vóór het laden van de scripts de pagina
// nooit "gewoon" herladen (oudere telefoons). Enter in een veld = zelfde als op de knop drukken.
export const onEnter = (fn) => (e) => { if (e.key === "Enter") { e.preventDefault(); fn(e); } };

// Kleine helper voor fetch-calls vanuit de schermen
export async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, ...j };
}
