// components/portal/PortalStyles.js — opmaak van het ingelogde portaal (design/portal/03-portal-en.html)
// Cadeau-banner (ook gebruikt op de welkomstpagina, zonder de rest van de portaal-opmaak)
export const GIFT_CSS = `
      .gift{position:relative;display:grid;grid-template-columns:84px 1fr;gap:18px;align-items:center;background:linear-gradient(135deg,#fffdfb,#fdf3ec);border:1px solid #f1d9c9;border-radius:16px;padding:18px 20px 18px 24px;margin:0 0 22px;box-shadow:0 8px 28px rgba(223,132,85,.12);overflow:hidden}
      .gift:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(#f2b58f,#df8455)}
      .gift img{width:84px;height:112px;object-fit:cover;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.16)}
      .gift.rg{grid-template-columns:64px 1fr}
      .rg-ic{width:64px;height:64px;border-radius:50%;background:#fff;border:1px solid #f1d9c9;display:flex;align-items:center;justify-content:center;font-size:30px}
      .rg-list{margin:8px 0 0;padding-left:18px;font-size:14.5px;line-height:1.5}.rg-list li{margin-bottom:4px}.rg-list li.done{color:#999;text-decoration:line-through}
      .rg-badge{display:inline-block;background:#e6f2ea;color:#2d6b45;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}
      .gift .gk{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#c96f43;background:#fff;border:1px solid #f1d9c9;border-radius:999px;padding:4px 10px;margin-bottom:8px}
      .gift b{display:block;font-size:16.5px;line-height:1.4;font-weight:700}
      .gift .gt{display:flex;align-items:center;gap:12px;margin:10px 0 12px;flex-wrap:wrap}
      .gift .clock{display:inline-flex;align-items:center;gap:8px;font-size:26px;font-weight:800;letter-spacing:1.5px;color:#1a1a1a;background:#fff;border:1px solid #f1d9c9;border-radius:12px;padding:6px 14px;font-variant-numeric:tabular-nums}
      .gift .clock:before{content:"⏱";font-size:18px}
      .gift .gl{font-size:13.5px;color:#777;margin:6px 0 12px}
      .gift .btn{padding:13px 22px;font-size:16px}
      .gift.ok{background:#eef6f0;border-color:#cfe3d5}.gift.ok:before{background:#87b995}.gift.exp{background:#fafafa;border-color:#e5e5e5}.gift.exp:before{background:#ddd}.gift.ok b,.gift.exp b{font-size:15.5px;color:#333;font-weight:600}
      .btn{display:inline-block;background:#df8455;color:#fff;border:none;border-radius:12px;font:inherit;font-size:17px;font-weight:800;padding:15px 24px;cursor:pointer;text-decoration:none;white-space:nowrap;text-align:center}.btn[disabled]{opacity:.55;cursor:default}
      .claim-err{background:#fdecec;color:#a33;border-radius:12px;padding:13px 16px;margin:0 0 14px;font-size:15.5px;line-height:1.5}
`;
export const GIFT_CSS_MOBILE = `.gift{grid-template-columns:64px 1fr;gap:14px;padding:14px 14px 14px 18px}.gift img{width:64px;height:86px}.gift .clock{font-size:22px}.gift b{font-size:15px}.gift .btn{width:100%}`;

export default function PortalStyles() {
  return (
    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0;background:#faf8f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:17px}
      a{color:inherit}
      .app{display:flex;min-height:100vh}
      .side{width:250px;background:#fff;border-right:1px solid #eee;padding:22px 16px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;flex-shrink:0}
      .side img{width:170px;max-width:100%;height:auto;margin:6px 0 28px 12px;display:block;align-self:flex-start}
      .side .nav{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:12px;text-decoration:none;font-size:16.5px;font-weight:600;color:#444;margin-bottom:4px;cursor:pointer;background:none;border:0;font-family:inherit;text-align:left;width:100%}
      .side .nav.on{background:#fdeee4;color:#1a1a1a}
      .side .nav .ic{width:24px;text-align:center;font-size:18px}
      .side .me{margin-top:auto;padding:14px 14px 4px;border-top:1px solid #eee;font-size:14px;color:#666;overflow-wrap:anywhere}.side .me b{display:block;color:#1a1a1a;font-size:15px}
      .side .me button{background:none;border:0;padding:0;margin:8px 0 0;font:inherit;font-size:14px;color:#df8455;font-weight:700;cursor:pointer}
      .mtop{display:none;background:#fff;border-bottom:1px solid #eee;padding:12px 16px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:5}
      .mtop img{width:150px;max-width:60%;height:auto;display:block}.mtop button{background:none;border:1px solid #ddd;border-radius:10px;font-size:22px;padding:4px 10px;cursor:pointer}
      .main{flex:1;min-width:0}
      .wrap{max-width:860px;margin:0 auto;padding:36px 28px 60px}
      .ebb{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-10px 0 22px;padding:11px 16px;border-radius:12px;background:linear-gradient(90deg,#fdeee4,#fff7f1);border:1px solid #f3d5c2;color:#1a1a1a;text-decoration:none;font-size:15px}
      .ebb b{color:#c96f43;white-space:nowrap;font-weight:700}.ebb:hover{border-color:#df8455}
      h1{font-size:30px;font-weight:800;margin:0 0 6px}.sub{color:#444;margin:0 0 24px;font-size:19px;line-height:1.45}
      .card{background:#fff;border:1px solid #eae6e2;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
      .p{display:grid;grid-template-columns:140px 1fr auto;gap:20px;align-items:center;padding:18px 22px 18px 18px;margin-bottom:14px}
      .p .img{height:112px;border-radius:12px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .p .img img,.claim .sum .img img,.ol .img img{width:100%;height:100%;object-fit:contain;display:block;background:#fff}
      .p h3{font-size:20px;margin:0 0 4px}.p p{margin:0 0 8px;color:#555;font-size:15.5px;line-height:1.5}
      .price{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap}.price s{color:#999;font-size:16px}.price b{color:#2d6b45;font-size:22px}.price .in{font-size:13px;font-weight:800;color:#2d6b45;background:#e6f2ea;border-radius:999px;padding:3px 9px}
      .sh{font-size:14.5px;color:#555}.sh b{color:#1a1a1a}
      .p.ordered{background:#fafafa;border-color:#e5e5e5}.p.ordered .img,.p.ordered h3,.p.ordered p,.p.ordered .price,.p.ordered .sh{opacity:.55}
      .ord{display:inline-block;font-size:13.5px;font-weight:800;color:#2d6b45;background:#e6f2ea;border-radius:999px;padding:5px 11px;margin-bottom:8px}
      .btn{display:inline-block;background:#df8455;color:#fff;border:none;border-radius:12px;font:inherit;font-size:17px;font-weight:800;padding:15px 24px;cursor:pointer;text-decoration:none;white-space:nowrap;text-align:center}
      .btn:hover{background:#d2773f}
      .btn.grey,.btn.grey:hover{background:#ececec;color:#666;cursor:default;white-space:normal}
      .btn[disabled]{opacity:.55;cursor:default}
      .empty{padding:26px 24px;text-align:center;color:#666;font-size:16px;line-height:1.55}
      .cg{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
      .cc{overflow:hidden;display:flex;flex-direction:column}
      .cc .cov{position:relative;height:170px;background:linear-gradient(135deg,#2f4a3b,#87b995);display:flex;align-items:center;justify-content:center;font-size:64px}
      .cc .cov.o{background:linear-gradient(135deg,#c96f43,#f2b58f)}.cc .cov.p{background:linear-gradient(135deg,#fdeee4,#f6d6c1)}
      .cc .cov .lk{position:absolute;inset:0;background:rgba(20,20,20,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;text-align:center;padding:10px}
      .cc .cov .lk small{display:block;font-weight:600;font-size:13px;opacity:.9;margin-top:4px}
      .cc .bd{padding:18px 20px 20px;display:flex;flex-direction:column;flex:1}
      .cc h3{font-size:20px;margin:0 0 8px}.cc p{margin:0 0 16px;color:#555;font-size:15px;line-height:1.5;flex:1}
      .cc .bar{height:26px;background:#eeeae6;border-radius:99px;overflow:hidden;position:relative}.cc .bar i{display:block;height:100%;background:#f2b58f;border-radius:99px}.cc .bar b{position:absolute;left:14px;top:0;line-height:26px;font-size:13px;color:#1a1a1a}
      .cc .meta{font-size:13px;color:#888;margin-top:8px}.cc.locked .bd h3{color:#555}
      .back{display:inline-block;color:#df8455;font-weight:700;text-decoration:none;font-size:15px;margin-bottom:14px;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}
      .claim{max-width:640px}
      .claim .sum{display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:center;padding:18px 20px;margin-bottom:16px}
      .claim .sum .img{height:96px;border-radius:12px;background:#fff;overflow:hidden}
      .claim .sum h3{font-size:20px;margin:0 0 4px}.claim .sum .price{margin:0}
      .claim .blk{padding:20px 22px;margin-bottom:16px}
      .claim .blk h4{font-size:13px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#888;margin:0 0 10px}
      .claim .addr{font-size:16.5px;line-height:1.55}
      .claim .tot{display:flex;justify-content:space-between;gap:12px;font-size:16.5px;padding:8px 0;border-bottom:1px solid #f1ece7}.claim .tot:last-of-type{border-bottom:0;font-weight:800;font-size:18px;padding-top:12px}
      .claim .tot s{color:#999;margin-right:8px;font-weight:400}.claim .tot .g{color:#2d6b45}
      .claim .pay{display:flex;align-items:center;gap:12px;font-size:16px;padding:12px 14px;border:1.5px solid #cfd8d3;border-radius:12px;flex-wrap:wrap}
      .claim .pay .cardic{min-width:42px;height:28px;border-radius:5px;background:#1a1f71;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 6px;text-transform:uppercase}
      .claim .pay .cardic.pp{background:#ffc439;color:#003087}
      .claim .btn.big{width:100%;font-size:18px;padding:18px;display:block}
      .claim .fine{font-size:14.5px;color:#666;text-align:center;margin-top:12px;line-height:1.5}
      .ol{display:grid;grid-template-columns:72px 1fr auto;gap:16px;align-items:center;padding:16px 20px;margin-bottom:12px}
      .ol .img{width:72px;height:72px;border-radius:12px;background:#fdf3ec;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:26px}
      .ol b{font-size:17px}.ol .m{color:#777;font-size:14.5px;margin-top:3px}
      .ol .st{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
      .rows{padding:6px 24px}.rows .r{display:flex;justify-content:space-between;gap:16px;padding:15px 0;border-bottom:1px solid #f1ece7;font-size:16.5px}.rows .r:last-child{border-bottom:0}.rows .r span{color:#666}.rows .r b{text-align:right}
      .rows .r a{color:#df8455;font-weight:800;text-decoration:none}
      .pill{display:inline-block;font-size:12.5px;font-weight:800;border-radius:999px;padding:4px 11px;text-transform:uppercase;letter-spacing:.4px}.pill.tr{background:#fef9c3;color:#854d0e}.pill.ok{background:#e6f2ea;color:#2d6b45}
      .form{padding:24px}.form label{display:block;font-weight:700;font-size:15px;margin:0 0 7px}.form input{width:100%;font:inherit;font-size:16px;padding:13px 15px;border:1.5px solid #cfd8d3;border-radius:10px;outline:none;margin-bottom:16px;background:#fff}.form input:focus{border-color:#87b995;box-shadow:0 0 0 3px rgba(135,185,149,.25)}
      .form input[readonly]{background:#f7f5f3;color:#666}
      .form h3{margin:0 0 16px;font-size:19px}.form .note{font-size:14px;color:#777;margin:-8px 0 16px}
      .form .msg{font-size:14.5px;border-radius:10px;padding:11px 14px;margin:0 0 14px}.form .msg.err{background:#fdecec;color:#a33}.form .msg.ok{background:#e6f2ea;color:#2d6b45}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
      .help{margin-top:28px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px}.help h3{margin:0 0 3px;font-size:18px}.help p{margin:0;color:#666;font-size:14.5px}.help a{background:#fdeee4;font-weight:700;padding:11px 16px;border-radius:999px;text-decoration:none;font-size:15px;white-space:nowrap}
      .note-s{color:#777;font-size:14.5px;margin:12px 4px 0;line-height:1.5}
      .claim-err{background:#fdecec;color:#a33;border-radius:12px;padding:13px 16px;margin:0 0 14px;font-size:15.5px;line-height:1.5}
      .btn.pp-btn{background:#ffc439;color:#003087}.btn.pp-btn:hover{background:#f2b927}
      .crumb{font-size:14px;color:#888;margin-bottom:18px}.crumb .back{margin:0;color:#888;font-weight:600;font-size:14px}.crumb b{color:#1a1a1a}
      .done-hd{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.done-hd h1{margin:0}
      .oc{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start;margin-top:8px}
      .oc .blk{padding:20px 22px;margin-bottom:16px}.oc .blk h4{font-size:15px;font-weight:800;margin:0 0 14px}
      .oc .it{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;padding:8px 0}
      .oc .it .img{width:64px;height:64px;border-radius:10px;background:#fff;overflow:hidden}.oc .it .img img{width:100%;height:100%;object-fit:contain}
      .oc .it .pr{font-weight:800;font-size:17px;color:#2d6b45;white-space:nowrap}.oc .it .pr s{color:#999;font-weight:400;font-size:14px;margin-right:6px}
      .oc .tot{display:flex;justify-content:space-between;font-size:16px;padding:8px 0;border-bottom:1px solid #f1ece7}.oc .tot:last-of-type{border-bottom:0;font-weight:800;font-size:18px}
      .oc .addr{font-size:16px;line-height:1.55;color:#333}
      .center{min-height:60vh;display:flex;align-items:center;justify-content:center;color:#777;text-align:center;padding:20px}
      .ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:15}.ov.on{display:block}
      ${GIFT_CSS}
      .bg{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
      .bk{overflow:hidden;display:flex;flex-direction:column}
      .bk .bcov{position:relative;background:#f3ede8;display:flex;justify-content:center;padding:18px 18px 0}.bk .bcov img{width:150px;height:200px;object-fit:cover;border-radius:8px 8px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.12)}
      .bk .bdg{position:absolute;top:12px;left:12px;font-size:12.5px;font-weight:800;border-radius:999px;padding:5px 11px;background:#e6f2ea;color:#2d6b45;white-space:nowrap}.bk .bdg.gift{background:#fdeee4;color:#c96f43}
      .bk .bbd{padding:18px 20px 20px;display:flex;flex-direction:column;flex:1}.bk h3{font-size:19px;margin:0 0 8px;line-height:1.3}.bk p{margin:0 0 10px;color:#555;font-size:15px;line-height:1.5;flex:1}
      .bk .bm{font-size:13.5px;color:#888;margin-bottom:12px}.bk.locked .bcov img{opacity:.6;filter:grayscale(.4)}
      .btn.sec{background:#fff;color:#df8455;border:2px solid #df8455}.btn.sec:hover{background:#fdf3ec}
      @media(max-width:800px){
        ${GIFT_CSS_MOBILE}
        .bg{grid-template-columns:1fr}
        .side{position:fixed;left:-270px;top:0;bottom:0;z-index:20;transition:left .2s;box-shadow:0 0 30px rgba(0,0,0,.15)}.side.open{left:0}
        .mtop{display:flex}.wrap{padding:22px 16px 50px}h1{font-size:25px}.sub{font-size:17px}.ebb{margin:0 0 16px;font-size:14px;padding:10px 12px}
        .p{grid-template-columns:1fr;gap:12px}.p .img{height:220px}.btn{width:100%}
        .cg{grid-template-columns:1fr}.two{grid-template-columns:1fr}.help{flex-direction:column;align-items:flex-start}
        .rows .r{flex-direction:column;gap:3px}.rows .r b{text-align:left}
        .claim .sum{grid-template-columns:1fr}.claim .sum .img{height:190px}
        .oc{grid-template-columns:1fr}
        .ol{grid-template-columns:72px 1fr}.ol .st{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center;flex-wrap:wrap}
      }
    `}</style>
  );
}
