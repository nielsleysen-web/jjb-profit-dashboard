// components/portal/HomeStyles.js — opmaak van de Home, het nieuwe menu, de bel, de cadeau-onthulling en het ideeënformulier
export const SIDE_CSS = `
      .side{width:248px;background:#fff;border-right:1px solid #f0ece8;padding:22px 16px 16px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;flex-shrink:0;overflow-y:auto}
      .side>img{width:160px;max-width:100%;height:auto;margin:2px 0 18px 10px;display:block;align-self:flex-start}
      .mcard{position:relative;overflow:hidden;border-radius:14px;padding:14px 16px;margin:0 0 18px;background:linear-gradient(135deg,#2f4a3b,#4f7a5f);color:#fff}
      .mcard:after{content:"";position:absolute;right:-30px;bottom:-40px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.07)}
      .mc-k{font-size:10.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#cfe8d6}
      .mc-n{font-size:17px;font-weight:800;margin-top:2px}.mc-s{font-size:12px;opacity:.8}
      .mc-dot{position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;background:#9fe0b2;box-shadow:0 0 0 4px rgba(159,224,178,.2)}
      .grp{font-size:10.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#b3aba4;margin:16px 0 6px 12px}
      .side .nav{display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:12px;font-size:15px;font-weight:600;color:#55504b;margin-bottom:2px;cursor:pointer;background:none;border:0;font-family:inherit;text-align:left;width:100%}
      .side .nav:hover{background:#faf6f2}
      .side .nav .ni{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#9a928b}
      .side .nav svg{width:18px;height:18px}
      .side .nav.on{background:#fbf3ed;color:#1a1a1a}.side .nav.on .ni{background:#df8455;color:#fff;box-shadow:0 4px 10px rgba(223,132,85,.3)}
      .side .nav .cnt{margin-left:auto;font-size:11px;font-weight:800;color:#c96f43;background:#fdeee4;border-radius:999px;min-width:20px;height:20px;padding:0 6px;display:flex;align-items:center;justify-content:center}
      .side .me{margin-top:auto;padding:12px 6px 0;border-top:1px solid #f0ece8;font-size:12px;color:#8a837d;display:flex;gap:10px;align-items:center}
      .side .me .mt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.side .me b{display:block;color:#1a1a1a;font-size:14px;overflow:hidden;text-overflow:ellipsis}
      .side .me .av{width:34px;height:34px;flex-shrink:0;border-radius:50%;background:#fdeee4;color:#c96f43;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}
      .side .me .lo{width:32px;height:32px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#a39b94;border:1px solid #eee;background:#fff;cursor:pointer;padding:0;margin:0}.side .me .lo svg{width:15px;height:15px}
      .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 32px;border-bottom:1px solid #f0ece8;background:#fff;position:sticky;top:0;z-index:12;min-height:68px}
      .topbar h1{font-size:21px;margin:0}
`;

export const HOME_CSS = `
      .wrap.wide{max-width:1180px}
      .lnk{background:none;border:0;padding:0;font:inherit;color:#c96f43;font-weight:700;text-decoration:none;font-size:14.5px;cursor:pointer}
      .btn.ghost{background:#fff;color:#c96f43;border:1.5px solid #f1d9c9}
      .sect{display:flex;justify-content:space-between;align-items:baseline;margin:26px 2px 12px}.sect h3{font-size:20px;margin:0}
      /* bel + notificaties */
      .bell-w{position:relative}
      .bell{position:relative;width:44px;height:44px;border-radius:12px;border:1px solid #eae6e2;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:#1a1a1a}
      .bell svg{width:21px;height:21px}
      .bell .bn{position:absolute;top:-6px;right:-6px;background:#df8455;color:#fff;font-size:11px;font-weight:800;border-radius:999px;min-width:20px;height:20px;padding:0 5px;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
      .np{position:absolute;right:0;top:54px;width:400px;max-width:calc(100vw - 24px);background:#fff;border:1px solid #eae6e2;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.18);z-index:40;overflow:hidden;max-height:70vh;overflow-y:auto}
      .np-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 12px;border-bottom:1px solid #f1ece7;position:sticky;top:0;background:#fff}.np-hd b{font-size:17px}.np-mr{font-size:13px;color:#2d6b45;font-weight:700}
      .np-empty{padding:26px 18px;color:#888;font-size:14.5px;text-align:center}
      .np-it{display:grid;grid-template-columns:38px 1fr auto;gap:12px;padding:13px 18px;border:0;border-bottom:1px solid #f6f2ee;align-items:start;background:#fff;width:100%;text-align:left;font:inherit;cursor:pointer}
      .np-it:hover{background:#fcf9f6}.np-it.new{background:#fffaf6}
      .np-ic{width:38px;height:38px;border-radius:10px;background:#f6f2ee;display:flex;align-items:center;justify-content:center;font-size:17px}
      .np-tx b{display:block;font-size:14.5px;line-height:1.35}.np-tx span{display:block;font-size:13px;color:#777;line-height:1.4;margin-top:2px}
      .np-tm{font-size:12px;color:#aaa;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;gap:6px}.np-tm i{width:8px;height:8px;border-radius:50%;background:#df8455}
      /* welkomst */
      .welcome{position:relative;overflow:hidden;margin-bottom:18px;padding:22px 24px;display:grid;grid-template-columns:300px 1fr;gap:10px 26px;background:#fff;border-color:#f1e4da}
      .welcome:before{content:"";position:absolute;inset:0 auto 0 0;width:5px;background:linear-gradient(#f2b58f,#df8455)}
      .welcome:after{content:"";position:absolute;right:-70px;top:-90px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,#fdeee4 0%,rgba(253,238,228,0) 70%)}
      .wl{position:relative;z-index:1}.wk{font-size:11.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#c96f43}
      .welcome h2{font-size:22px;margin:6px 0 6px;letter-spacing:-.3px;line-height:1.25}.welcome p{margin:0;font-size:15px;color:#666;line-height:1.5}
      .wx{display:inline-block;margin-top:14px;background:#1a1a1a;color:#fff;border:0;font:inherit;font-weight:700;font-size:13.5px;border-radius:10px;padding:9px 18px;cursor:pointer}
      .wg{position:relative;z-index:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-self:center}
      .wt{display:flex;gap:10px;align-items:center;background:#fbf7f3;border:1px solid #f1e8e0;border-radius:12px;padding:12px;font:inherit;text-align:left;cursor:pointer;color:inherit}
      .wt:hover{border-color:#f1d9c9}
      .wi{width:34px;height:34px;flex-shrink:0;border-radius:9px;background:#fff;border:1px solid #f1d9c9;color:#df8455;display:flex;align-items:center;justify-content:center}.wi svg{width:17px;height:17px}
      .wt b{display:block;font-size:14px}.wt small{display:block;font-size:12px;color:#888;line-height:1.35;margin-top:1px}
      /* cadeau klaar */
      .ready{display:flex;align-items:center;gap:16px;padding:16px 20px;margin-bottom:14px;border:2px solid #f2b58f;background:linear-gradient(90deg,#fffaf6,#fff);box-shadow:0 10px 30px rgba(223,132,85,.15)}
      .rd-g{font-size:34px;animation:wob 1.2s ease-in-out infinite}
      @keyframes wob{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
      .rd-t{flex:1}.rd-t b{display:block;font-size:17px}.rd-t span{font-size:14.5px;color:#666}
      .ready .btn{font-size:16px;padding:12px 20px}
      /* waarde */
      .val{display:grid;grid-template-columns:300px 1fr;gap:28px;align-items:center;padding:24px 28px;background:linear-gradient(120deg,#2f4a3b 0%,#3f6650 55%,#4f7a5f 100%);color:#fff;border:0;position:relative;overflow:hidden}
      .val:after{content:"";position:absolute;right:-80px;top:-90px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.05)}
      .vk{font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#cfe8d6}
      .vbig{font-size:52px;font-weight:800;letter-spacing:-1.5px;margin:6px 0 2px;line-height:1.05}
      .vsince{font-size:14.5px;opacity:.85}
      .vitems{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;position:relative;z-index:1}
      .vit{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px;display:flex;gap:12px;align-items:center}
      .vth{width:52px;height:52px;flex-shrink:0;border-radius:10px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center}.vth img{max-width:100%;max-height:100%;object-fit:cover}
      .vit b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14.5px;line-height:1.3}.vit small{display:block;font-size:12px;opacity:.7;margin-top:2px}.vv{display:inline-block;margin-top:5px;font-size:13.5px;font-weight:800;color:#bff0cd}
      .vempty{position:relative;z-index:1;font-size:15px;opacity:.9;line-height:1.5}
      /* streak */
      .streak{margin-top:14px;padding:14px 22px;display:grid;grid-template-columns:190px 1fr auto;gap:28px;align-items:center}
      .sl{display:flex;flex-direction:column;gap:2px}.sk{font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#999}
      .sl .num{font-size:14px;color:#666}.sl .num b{font-size:24px;font-weight:800;color:#1a1a1a;margin-right:4px;letter-spacing:-.3px}
      .track{position:relative;height:4px;background:#efebe7;border-radius:99px;margin:10px 10px 0}
      .track>i{position:absolute;left:0;top:0;bottom:0;background:#df8455;border-radius:99px}
      .track .m{position:absolute;top:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;border:1.5px solid #e2dbd5;display:flex;align-items:center;justify-content:center;color:#b5aaa2}
      .track .m.on{border-color:#df8455;color:#df8455}.track .m.done{background:#df8455;border-color:#df8455;color:#fff}
      .track .m svg{width:11px;height:11px}
      .marks{position:relative;height:16px;margin:12px 10px 0;font-size:11.5px;color:#999}.marks span{position:absolute;transform:translateX(-50%);white-space:nowrap}.marks span:first-child{transform:none}.marks span:last-child{transform:translateX(-100%)}
      .sr{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#666;text-align:right;align-items:flex-end}.sr b{color:#1a1a1a}.sr .lnk{font-size:13px}.sr .ok{color:#2d6b45;font-weight:700}
      /* activiteit */
      .acts{display:grid;grid-template-columns:repeat(4,1fr);padding:4px 6px}
      .ac{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:12px 14px;border-left:1px solid #f1ece7;min-width:0}.ac:first-child{border-left:0}
      .aico{width:34px;height:34px;border-radius:9px;background:#fdf3ec;display:flex;align-items:center;justify-content:center;font-size:16px}.aico.g{background:#e6f2ea}
      .ac b{display:block;font-size:14px;line-height:1.3}.ac span{font-size:12.5px;color:#888;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ac em{font-style:normal;font-size:11.5px;color:#aaa;align-self:start;margin-top:2px;white-space:nowrap}
      /* dove trovare tutto */
      .grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
      .tile{padding:16px 14px;text-align:left;font:inherit;color:inherit;cursor:pointer;display:block}
      .tile:hover{border-color:#f1d9c9}
      .tico{width:40px;height:40px;border-radius:11px;background:#fdf3ec;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:10px}
      .tile b{display:block;font-size:15.5px;margin-bottom:4px}.tile span{font-size:13px;color:#666;line-height:1.4}
      /* cadeau-onthulling + ideeënformulier */
      .rw-ov{position:fixed;inset:0;background:rgba(26,26,26,.55);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px;overflow-y:auto}
      .rw{position:relative;z-index:1;background:#fff;border-radius:24px;width:460px;max-width:100%;padding:34px 30px 28px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.3)}
      .rw-k{display:inline-block;background:#fdf3ec;border:1px solid #f1d9c9;border-radius:999px;padding:5px 12px;margin-bottom:12px;font-size:12px;font-weight:800;letter-spacing:.7px;color:#c96f43}
      .rw h2{font-size:27px;margin:0 0 6px;letter-spacing:-.4px}.rw-s{color:#555;font-size:16px;margin:0 0 18px;line-height:1.5}
      .rw-cover{width:150px;height:200px;object-fit:cover;border-radius:10px;box-shadow:0 14px 30px rgba(0,0,0,.25);transform:rotate(-3deg);margin:4px auto 18px;display:block}
      .rw-title{font-weight:800;font-size:18px}.rw-meta{margin:6px 0 0;color:#666;font-size:14.5px}
      .rw-keep{display:inline-block;background:#e6f2ea;color:#2d6b45;font-weight:800;font-size:13px;border-radius:999px;padding:4px 12px;margin:10px 0 18px}
      .rw .rw-btn{display:block;font-size:18px;padding:16px}.rw-later{display:block;margin-top:12px;color:#999;font-size:14px}
      .rw-x{position:absolute;top:14px;right:16px;background:none;border:0;font-size:18px;color:#aaa;cursor:pointer}
      .cf-wrap{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}
      .cf{position:absolute;top:-20px;width:9px;height:15px;border-radius:2px;opacity:.95;animation-name:cffall;animation-timing-function:linear;animation-iteration-count:2}
      .cf.r{width:8px;height:8px;border-radius:50%}
      @keyframes cffall{0%{transform:translate(0,-20px) rotate(var(--rot))}100%{transform:translate(var(--dx),110vh) rotate(calc(var(--rot) + 540deg))}}
      .sg{text-align:left}.sg h2{font-size:22px}.sg textarea{width:100%;font:inherit;font-size:16px;padding:13px 15px;border:1.5px solid #cfd8d3;border-radius:12px;outline:none;resize:vertical;margin-bottom:12px}
      .sg textarea:focus{border-color:#87b995;box-shadow:0 0 0 3px rgba(135,185,149,.25)}
      .sg-act{display:flex;justify-content:flex-end;gap:10px}.sg-act .btn{width:auto;font-size:16px;padding:12px 20px}
      .sg-link{text-align:center;margin:22px 0 0}.sg-link button{background:none;border:0;font:inherit;font-size:14px;color:#8a837d;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
      .sg-link button:hover{color:#c96f43}
      /* instellingen: verjaardag + herinnering */
      .bday{display:grid;grid-template-columns:110px 1fr;gap:10px}.form select{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1.5px solid #cfd8d3;border-radius:10px;background:#fff;margin-bottom:6px}
      .form .opt{font-weight:500;color:#999;font-size:13px}.form .bnote{font-size:13.5px;color:#888;margin:0 0 16px}
      .remrow{display:flex;justify-content:space-between;align-items:center;gap:14px}.remrow p{margin:0;color:#666;font-size:14.5px;line-height:1.5}
      .rem-st{display:inline-block;font-size:12.5px;font-weight:800;border-radius:999px;padding:3px 10px;margin-left:8px;background:#f1ece7;color:#888}.rem-st.on{background:#e6f2ea;color:#2d6b45}
`;

export const HOME_CSS_MOBILE = `
        .side{position:fixed;left:-280px;height:auto;bottom:0}.side.open{left:0}
        .topbar{display:none}
        .mtop .mr{display:flex;align-items:center;gap:10px}
        .np{position:fixed;left:12px;right:12px;top:64px;width:auto}
        .welcome{grid-template-columns:minmax(0,1fr);padding:18px 18px 16px}.wg{grid-template-columns:1fr 1fr}
        .val{grid-template-columns:minmax(0,1fr);gap:16px;padding:20px}.vitems{grid-template-columns:minmax(0,1fr)}.vbig{font-size:44px}
        .streak{grid-template-columns:minmax(0,1fr);gap:14px;padding:16px}.sr{text-align:left;align-items:flex-start}.marks span:nth-child(1),.marks span:nth-child(3){display:none}
        .acts{grid-template-columns:minmax(0,1fr)}.ac{border-left:0;border-top:1px solid #f1ece7}.ac:first-child{border-top:0}
        .grid6{grid-template-columns:1fr 1fr}
        .ready{flex-wrap:wrap}.ready .btn{width:100%}
        .remrow{flex-direction:column;align-items:flex-start}
        .rw{padding:28px 20px 22px}
`;
