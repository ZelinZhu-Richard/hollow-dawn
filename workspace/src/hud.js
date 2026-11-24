// HOLLOW DAWN — HUD. All DOM lives inside #hud and is built once; update() only
// writes to the DOM when a displayed value actually changes.

const CSS = `
.hd{position:absolute;inset:0;overflow:hidden;font-family:var(--display);color:var(--bone);line-height:1;--m:22px;
  text-shadow:0 1px 0 rgba(4,6,14,.9),0 0 10px rgba(4,6,14,.55);-webkit-font-smoothing:antialiased}
.hd *,.hd *::before,.hd *::after{box-sizing:border-box}
.hd i,.hd u,.hd b,.hd em{font-style:normal;text-decoration:none}
.hd-lbl{font:600 10px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.hd-num{font-weight:800;font-variant-numeric:tabular-nums;line-height:.86}
.hd-panel{background:linear-gradient(180deg,rgba(11,16,32,.74),rgba(7,10,20,.6))}

/* ---- full-screen feedback layers */
.hd-vig,.hd-lowhp{position:absolute;inset:0;opacity:0;pointer-events:none}
.hd-vig{background:radial-gradient(ellipse at center,transparent 36%,rgba(179,32,42,.78) 100%);will-change:opacity}
.hd-lowhp{background:radial-gradient(ellipse at center,transparent 50%,rgba(210,50,63,.5) 100%)}
.hd.low .hd-lowhp{animation:hd-pulse 1s ease-in-out infinite}
.hd-dirs{position:absolute;left:50%;top:50%;width:0;height:0}
.hd-dir{position:absolute;left:0;top:0;width:0;height:0;opacity:0;will-change:transform,opacity}
.hd-dir i{position:absolute;left:-58px;top:-172px;width:116px;height:24px;
  background:linear-gradient(180deg,var(--blood),rgba(210,50,63,.15));
  clip-path:polygon(0 100%,50% 0,100% 100%,86% 100%,50% 36%,14% 100%)}

/* ---- top left: score */
.hd-tl{position:absolute;left:var(--m);top:var(--m)}
.hd-score{padding:13px 30px 13px 18px;min-width:176px;box-shadow:inset 2px 0 0 var(--ember);
  clip-path:polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%)}
.hd-score-n{font-size:46px;margin:7px 0 10px;letter-spacing:.01em}
.hd-kd{display:flex;gap:18px;border-top:1px solid var(--line);padding-top:9px}
.hd-kd span{display:flex;align-items:baseline;gap:7px}
.hd-kd b{font-size:21px;font-weight:700;font-variant-numeric:tabular-nums}

/* ---- top centre: phase clock + compass */
.hd-tc{position:absolute;left:50%;top:var(--m);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:7px}
.hd-clock{position:relative;display:flex;align-items:center;gap:14px;padding:10px 24px 14px;min-width:330px;
  clip-path:polygon(0 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px))}
.hd-orb{position:relative;width:28px;height:28px;flex:none}
.hd-orb::before{content:"";position:absolute;inset:0;border-radius:50%;border:1px dashed rgba(255,122,60,.7);animation:hd-spin 16s linear infinite;transition:opacity .8s}
.hd-orb i{position:absolute;inset:6px;border-radius:50%;background:var(--ember);box-shadow:0 0 14px rgba(255,122,60,.85);transition:background .8s,box-shadow .8s,transform .8s,inset .8s}
.hd-clock.night .hd-orb::before{opacity:0}
.hd-clock.night .hd-orb i{inset:3px;background:transparent;box-shadow:inset -7px -3px 0 0 var(--bone);transform:rotate(-24deg)}
.hd-phase{display:grid;gap:5px;min-width:96px}
.hd-phase-n{font-size:25px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.hd-time{font-size:42px;margin-left:auto;min-width:92px;text-align:right}
.hd-clock.warn .hd-time{color:var(--ember);animation:hd-blink .9s steps(2,jump-none) infinite}
.hd-threat{display:none;padding-left:14px;border-left:1px solid var(--line);text-align:right}
.hd-clock.night .hd-threat{display:grid;gap:5px}
.hd-threat .hd-num{font-size:30px;color:var(--toxic);text-shadow:0 0 12px rgba(155,229,100,.45),0 1px 0 rgba(4,6,14,.9)}
.hd-threat .hd-lbl{color:var(--toxic);opacity:.8;white-space:nowrap}
.hd-pbar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--line)}
.hd-pbar i{display:block;height:100%;background:var(--ember);transform-origin:left center;transform:scaleX(0);transition:background .8s}
.hd-clock.night .hd-pbar i{background:var(--toxic)}
.hd-compass{position:relative;width:320px;height:26px;overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 24%,#000 76%,transparent);mask-image:linear-gradient(90deg,transparent,#000 24%,#000 76%,transparent)}
.hd-compass-in{position:absolute;left:0;top:7px;height:19px;width:0;will-change:transform}
.hd-ct{position:absolute;top:0;width:1px;height:4px;background:var(--dim)}
.hd-ct.maj{height:7px;background:var(--bone)}
.hd-ct span{position:absolute;top:9px;left:0;transform:translateX(-50%);font:600 10px/1 var(--mono);letter-spacing:.06em;color:var(--dim)}
.hd-ct.card span{color:var(--bone);font-size:11px;font-weight:700}
.hd-ct.n span{color:var(--ember)}
.hd-compass-notch{position:absolute;left:50%;top:0;width:0;height:0;border:4px solid transparent;border-top:5px solid var(--ember);transform:translateX(-50%)}
.hd-compass-drop{position:absolute;left:0;top:13px;width:9px;height:9px;margin-left:-4.5px;display:none;background:var(--ember);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);animation:hd-blink 1s steps(2,jump-none) infinite}
.hd-compass-drop.on{display:block}

/* ---- top right: minimap */
.hd-tr{position:absolute;right:var(--m);top:var(--m);display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.hd-map{width:170px;height:170px;clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px)}
.hd-map canvas{display:block;width:170px;height:170px}
.hd-zone{color:var(--bone);display:flex;align-items:center;gap:7px}
.hd-zone::before{content:"";width:5px;height:5px;background:var(--ember);transform:rotate(45deg)}

/* ---- bottom left: vitals */
.hd-bl{position:absolute;left:var(--m);bottom:var(--m);width:310px}
.hd-hp-row{display:flex;align-items:flex-end;gap:14px}
.hd-hp{font-size:68px;min-width:98px;transition:color .2s}
.hd.low .hd-hp{color:var(--blood)}
.hd-hp-col{flex:1;display:grid;gap:6px;padding-bottom:5px}
.hd-bar{position:relative;height:10px;background:rgba(8,11,22,.7);transform:skewX(-22deg);overflow:hidden;box-shadow:0 0 0 1px var(--line)}
.hd-bar i,.hd-bar u{position:absolute;inset:0;transform-origin:left center;transform:scaleX(1)}
.hd-bar i{background:var(--bone);transition:transform .1s linear,background .2s}
.hd-bar u{background:var(--blood);transition:transform .5s .22s ease-out}
.hd-bar.hp{height:13px}
.hd-bar.hp::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 2px),rgba(7,10,20,.9) calc(10% - 2px) 10%)}
.hd.low .hd-bar.hp i{background:var(--blood)}
.hd.low .hd-bar.hp u{background:rgba(232,228,216,.5)}
.hd-sub{display:grid;grid-template-columns:1fr 62px;align-items:center;gap:10px}
.hd-sub .hd-lbl{font-size:9px;white-space:nowrap}
.hd-sub .hd-lbl b{color:var(--bone);font-weight:700}
.hd-bar.arm{height:5px}.hd-bar.arm i{background:#7fb7e6}
.hd-bar.sta{height:4px}.hd-bar.sta i{background:var(--ember)}
.hd-bar.sta.out i{background:var(--blood)}

/* ---- bottom right: weapon */
.hd-br{position:absolute;right:var(--m);bottom:var(--m);text-align:right;display:grid;justify-items:end;gap:7px;min-width:230px}
.hd-wname{font-size:19px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding-bottom:7px;border-bottom:1px solid var(--line);box-shadow:0 2px 0 -1px var(--ember);min-width:190px}
.hd-ammo{display:flex;align-items:baseline;justify-content:flex-end;gap:9px}
.hd-mag{font-size:78px;transition:color .15s}
.hd-res{font-size:28px;font-weight:700;color:var(--dim);font-variant-numeric:tabular-nums}
.hd-res i{margin-right:7px;opacity:.6}
.hd-br.low .hd-mag{color:var(--ember)}
.hd-br.empty .hd-mag{color:var(--blood)}
.hd-br.dry .hd-mag{animation:hd-shake .18s linear}
.hd-br.melee .hd-res,.hd-br.melee .hd-swatch{display:none}
.hd-atype{display:flex;align-items:center;gap:8px}
.hd-swatch{width:14px;height:6px;transform:skewX(-22deg);background:var(--steel)}
.hd-rel{width:190px;height:3px;background:var(--line);opacity:0;transition:opacity .15s}
.hd-rel i{display:block;height:100%;background:var(--bone);transform-origin:left center;transform:scaleX(0)}
.hd-br.reloading .hd-rel{opacity:1}
.hd-br.reloading .hd-mag{opacity:.45}
.hd-spin{display:none;grid-template-columns:auto 150px;align-items:center;gap:10px}
.hd-br.gat .hd-spin{display:grid}
.hd-bar.spin{height:7px}.hd-bar.spin i{background:var(--ember);transition:none}
.hd-br.hot .hd-bar.spin i{background:#ffd9a8;box-shadow:0 0 10px var(--ember)}
.hd-br.hot .hd-spin .hd-lbl{color:var(--ember)}

/* ---- bottom centre: hotbar + inventory */
.hd-bc{position:absolute;left:50%;bottom:var(--m);transform:translateX(-50%);display:grid;justify-items:center;gap:9px}
.hd-hot{display:flex;gap:5px}
.hd-slot{position:relative;width:106px;height:42px;padding:8px 8px 0 22px;background:linear-gradient(180deg,rgba(11,16,32,.74),rgba(7,10,20,.6));
  clip-path:polygon(0 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%);box-shadow:inset 0 2px 0 var(--line);
  transition:transform .14s ease-out,box-shadow .14s,opacity .14s}
.hd-slot i{position:absolute;left:8px;top:8px;font:700 10px/1 var(--mono);color:var(--dim)}
.hd-slot b{display:block;font-size:14px;font-weight:700;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:clip;color:var(--dim)}
.hd-slot em{display:block;margin-top:5px;font:600 9px/1 var(--mono);letter-spacing:.12em;color:var(--dim);opacity:.8}
.hd-slot.empty{opacity:.4}
.hd-slot.on{transform:translateY(-5px);box-shadow:inset 0 2px 0 var(--ember),inset 0 14px 18px -14px rgba(255,122,60,.55)}
.hd-slot.on b{color:var(--bone)}.hd-slot.on i{color:var(--ember)}
.hd-inv{display:flex;gap:18px;align-items:baseline}
.hd-chip{display:flex;align-items:baseline;gap:6px}
.hd-chip kbd{font:700 9px/1 var(--mono);color:var(--ink);background:var(--dim);padding:2px 4px;text-shadow:none}
.hd-chip b{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;min-width:12px;text-align:right}
.hd-chip.zero b{color:var(--dim)}

/* ---- centre: crosshair, hit marker, ring, prompt */
.hd-cross{position:absolute;left:50%;top:50%;width:0;height:0;--g:8px;transition:opacity .15s}
.hd-cross i{position:absolute;background:var(--bone);box-shadow:0 0 0 1px rgba(4,6,14,.5);transition:transform .05s linear}
.hd-cross .t{left:-1px;bottom:0;width:2px;height:9px;transform:translateY(calc(var(--g) * -1))}
.hd-cross .b{left:-1px;top:0;width:2px;height:9px;transform:translateY(var(--g))}
.hd-cross .l{top:-1px;right:0;width:9px;height:2px;transform:translateX(calc(var(--g) * -1))}
.hd-cross .r{top:-1px;left:0;width:9px;height:2px;transform:translateX(var(--g))}
.hd-cross u{position:absolute;left:-1px;top:-1px;width:2px;height:2px;background:var(--ember)}
.hd-cross.melee i{display:none}
.hd-cross.melee u{left:-2.5px;top:-2.5px;width:5px;height:5px;border-radius:50%;background:var(--bone);box-shadow:0 0 0 1px rgba(4,6,14,.5)}
.hd-cross.dim{opacity:.35}
.hd-hitm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;transform:rotate(45deg);will-change:transform,opacity}
.hd-hitm i{position:absolute;background:var(--bone);box-shadow:0 0 6px rgba(232,228,216,.7)}
.hd-hitm i:nth-child(1){left:-1px;bottom:7px;width:2px;height:10px}
.hd-hitm i:nth-child(2){left:-1px;top:7px;width:2px;height:10px}
.hd-hitm i:nth-child(3){top:-1px;right:7px;width:10px;height:2px}
.hd-hitm i:nth-child(4){top:-1px;left:7px;width:10px;height:2px}
.hd-hitm.kill i{background:var(--blood);box-shadow:0 0 9px var(--blood)}
.hd-ring{position:absolute;left:50%;top:50%;margin:-36px 0 0 -36px;opacity:0;transition:opacity .15s;overflow:visible}
.hd-ring.on{opacity:1}
.hd-ring circle{fill:none;stroke-width:3}
.hd-ring .trk{stroke:rgba(232,228,216,.16)}
.hd-ring .arc{stroke:var(--bone);stroke-dasharray:188.5;stroke-dashoffset:188.5;stroke-linecap:butt}
.hd-ring.heal .arc{stroke:var(--toxic);filter:drop-shadow(0 0 5px rgba(155,229,100,.6))}
.hd-ringlbl{position:absolute;left:50%;top:calc(50% + 46px);transform:translateX(-50%);opacity:0;transition:opacity .15s;color:var(--bone);white-space:nowrap}
.hd-ringlbl.on{opacity:1}
.hd-ringlbl.heal{color:var(--toxic)}
.hd-prompt{position:absolute;left:50%;top:63%;transform:translate(-50%,8px);opacity:0;display:flex;align-items:center;gap:11px;
  padding:8px 18px 8px 8px;background:var(--panel);clip-path:polygon(0 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%);
  transition:opacity .14s,transform .14s ease-out;white-space:nowrap}
.hd-prompt.on{opacity:1;transform:translate(-50%,0)}
.hd-prompt kbd{font:700 13px/1 var(--mono);color:var(--ink);background:var(--ember);padding:6px 8px;text-shadow:none;min-width:26px;text-align:center}
.hd-prompt span{font-size:19px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}

/* ---- pooled popups */
.hd-feed{position:absolute;left:calc(50% + 64px);top:calc(50% - 12px);width:0;height:0}
.hd-fi{position:absolute;left:0;top:0;white-space:nowrap;display:flex;align-items:baseline;gap:8px;
  translate:0 calc(var(--i,0) * -25px);transition:translate .16s ease-out,opacity .3s}
.hd-fi b{font-size:24px;font-weight:800;color:var(--ember);font-variant-numeric:tabular-nums}
.hd-fi span{font:700 11px/1 var(--mono);letter-spacing:.2em;color:var(--bone)}
.hd-fi.head b{color:#ff5a5a}.hd-fi.head span{color:#ff8d8d}
.hd-toasts{position:absolute;right:var(--m);top:232px;width:0;height:0}
.hd-ti{position:absolute;right:0;top:0;white-space:nowrap;display:flex;align-items:center;gap:8px;padding:7px 12px 7px 14px;
  background:var(--panel);box-shadow:inset -2px 0 0 var(--ember);
  clip-path:polygon(9px 0,100% 0,100% 100%,0 100%,0 9px);
  translate:0 calc(var(--i,0) * 31px);transition:translate .16s ease-out,opacity .3s}
.hd-ti b{font:700 12px/1 var(--mono);color:var(--ember)}
.hd-ti b:empty{display:none}
.hd-ti span{font:600 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.hd-fi.out,.hd-ti.out{opacity:0}
.hd-fi.off,.hd-ti.off{opacity:0;visibility:hidden;transition:none}

/* ---- announcements */
.hd-ann{position:absolute;left:50%;top:21%;transform:translateX(-50%);text-align:center;opacity:0;display:grid;justify-items:center;gap:14px;white-space:nowrap}
.hd-ann.show{animation:hd-ann 3.2s cubic-bezier(.2,.7,.2,1) both}
.hd-ann-t{font-size:clamp(46px,7.4vw,104px);font-weight:800;letter-spacing:.05em;text-transform:uppercase;line-height:.86;
  text-shadow:0 2px 0 rgba(4,6,14,.9),0 0 34px rgba(4,6,14,.7)}
.hd-ann-rule{width:min(420px,60vw);height:1px;background:linear-gradient(90deg,transparent,var(--bone) 20%,var(--bone) 80%,transparent);transform-origin:center}
.hd-ann.show .hd-ann-rule{animation:hd-rule 3.2s ease-out both}
.hd-ann-s{font:600 13px/1 var(--mono);letter-spacing:.36em;text-transform:uppercase;color:var(--ember);padding-left:.36em}
.hd-ann.night .hd-ann-s{color:var(--toxic)}
.hd-ann.night .hd-ann-rule{background:linear-gradient(90deg,transparent,var(--toxic) 20%,var(--toxic) 80%,transparent)}
.hd-ann.dawn .hd-ann-t,.hd-ann.drop .hd-ann-t{color:var(--ember)}
.hd-ann.drop .hd-ann-s{color:var(--bone)}

/* ---- game over */
.hd-over{position:absolute;inset:0;display:none;place-items:center;pointer-events:auto;
  background:radial-gradient(110% 80% at 50% 120%,rgba(210,50,63,.34),transparent 60%),linear-gradient(180deg,rgba(7,10,20,.6),rgba(7,10,20,.93))}
.hd-over.on{display:grid;animation:hd-fade .7s .35s ease-out both}
.hd-over-card{width:min(820px,90vw);display:grid;gap:24px}
.hd-over-eyebrow{font:600 12px/1 var(--mono);letter-spacing:.32em;text-transform:uppercase;color:var(--blood)}
.hd-over-title{font-size:clamp(60px,11vw,136px);font-weight:800;line-height:.84;text-transform:uppercase;letter-spacing:.01em}
.hd-over-title span{color:transparent;-webkit-text-stroke:1.5px var(--bone);text-shadow:none}
.hd-over-sub{font-size:20px;color:var(--dim);letter-spacing:.04em}
.hd-over-stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hd-over-stats div{padding:18px 18px 16px 0;display:grid;gap:10px}
.hd-over-stats div+div{padding-left:18px;border-left:1px solid var(--line)}
.hd-over-stats b{font-size:58px;font-weight:800;line-height:.86;font-variant-numeric:tabular-nums}
.hd-over-stats .sc b{color:var(--ember)}
.hd-over-foot{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.hd-go{pointer-events:auto;cursor:pointer;font:700 20px/1 var(--display);letter-spacing:.2em;text-transform:uppercase;color:var(--ink);
  background:var(--ember);border:0;padding:18px 34px;clip-path:polygon(0 0,100% 0,100% 68%,94% 100%,0 100%);transition:transform .12s,background .12s;text-shadow:none}
.hd-go:hover{background:#ffa06e;transform:translateY(-2px)}
.hd-go:focus-visible{outline:2px solid var(--bone);outline-offset:4px}
.hd.dead .hd-cross,.hd.dead .hd-prompt,.hd.dead .hd-ring,.hd.dead .hd-ringlbl,.hd.dead .hd-feed,.hd.dead .hd-ann{display:none}

@keyframes hd-pulse{0%,100%{opacity:.2}50%{opacity:.95}}
@keyframes hd-spin{to{transform:rotate(360deg)}}
@keyframes hd-blink{0%{opacity:1}100%{opacity:.35}}
@keyframes hd-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes hd-fade{from{opacity:0}to{opacity:1}}
@keyframes hd-ann{0%{opacity:0;transform:translateX(-50%) scale(1.14)}9%{opacity:1;transform:translateX(-50%) scale(1)}84%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) translateY(-10px) scale(.99)}}
@keyframes hd-rule{0%{transform:scaleX(0)}16%{transform:scaleX(1)}100%{transform:scaleX(1)}}

@media (max-height:780px),(max-width:1180px){.hd-tl,.hd-tr,.hd-bl,.hd-br,.hd-bc,.hd-tc{zoom:.82}.hd-toasts{top:196px}}
@media (max-width:860px){.hd-bc .hd-inv{display:none}.hd-tl{display:none}}
/* narrow / portrait viewports (side panes): clock to the left, hotbar lifted clear of vitals and ammo */
@media (max-width:700px){
  .hd{--m:14px}
  .hd-tc{left:var(--m);transform:none;align-items:flex-start;zoom:.7}
  .hd-clock{min-width:0}
  .hd-compass{display:none}
  .hd-tr{zoom:.68}
  .hd-bl,.hd-br{zoom:.68}
  .hd-bc{bottom:200px;zoom:.62}
  .hd-toasts{top:150px}
  .hd-prompt{zoom:.8}
  .hd-over-stats{grid-template-columns:repeat(2,1fr)}
  .hd-over-stats b{font-size:44px}
  .hd-over-stats div:nth-child(3){border-left:0;padding-left:0}
  .hd-over-stats div:nth-child(n+3){border-top:1px solid var(--line)}
}
@media (prefers-reduced-motion:reduce){
  .hd *,.hd *::before,.hd *::after{animation:none!important;transition:none!important}
  .hd-ann.show{opacity:1}
  .hd.low .hd-lowhp{opacity:.55}
}
`;

const HTML = `
<div class="hd" data-h="root" style="display:none">
  <div class="hd-vig" data-h="vig"></div>
  <div class="hd-lowhp"></div>
  <div class="hd-dirs" data-h="dirs"></div>

  <div class="hd-tl"><div class="hd-panel hd-score">
    <div class="hd-lbl">Score</div>
    <div class="hd-num hd-score-n" data-h="score">0</div>
    <div class="hd-kd"><span><b data-h="kills">0</b><i class="hd-lbl">Kills</i></span><span><b data-h="heads">0</b><i class="hd-lbl">Head</i></span></div>
  </div></div>

  <div class="hd-tc">
    <div class="hd-panel hd-clock" data-h="clock">
      <div class="hd-orb"><i></i></div>
      <div class="hd-phase"><div class="hd-phase-n" data-h="phase">DAY 1</div><div class="hd-lbl" data-h="phaseSub">to nightfall</div></div>
      <div class="hd-num hd-time" data-h="time">0:00</div>
      <div class="hd-threat"><div class="hd-num" data-h="left">0</div><div class="hd-lbl">zombies left</div></div>
      <div class="hd-pbar"><i data-h="pbar"></i></div>
    </div>
    <div class="hd-compass"><div class="hd-compass-in" data-h="compass"></div><i class="hd-compass-drop" data-h="cdrop"></i><b class="hd-compass-notch"></b></div>
  </div>

  <div class="hd-tr">
    <div class="hd-map"><canvas data-h="map" width="170" height="170"></canvas></div>
    <div class="hd-lbl hd-zone" data-h="zone">Open ground</div>
  </div>

  <div class="hd-bl"><div class="hd-hp-row">
    <div class="hd-num hd-hp" data-h="hp">100</div>
    <div class="hd-hp-col">
      <div class="hd-lbl">Vitals</div>
      <div class="hd-bar hp"><u data-h="hpGhost"></u><i data-h="hpBar"></i></div>
      <div class="hd-sub"><div class="hd-bar arm"><i data-h="armBar"></i></div><span class="hd-lbl">Arm <b data-h="arm">0</b></span></div>
      <div class="hd-sub"><div class="hd-bar sta" data-h="staWrap"><i data-h="staBar"></i></div><span class="hd-lbl">Sta</span></div>
    </div>
  </div></div>

  <div class="hd-br" data-h="wpn">
    <div class="hd-wname" data-h="wname">&nbsp;</div>
    <div class="hd-ammo"><span class="hd-num hd-mag" data-h="mag">0</span><span class="hd-res"><i>/</i><b data-h="res">0</b></span></div>
    <div class="hd-atype"><i class="hd-swatch" data-h="swatch"></i><span class="hd-lbl" data-h="atype"></span></div>
    <div class="hd-rel"><i data-h="relBar"></i></div>
    <div class="hd-spin"><span class="hd-lbl">Spin</span><div class="hd-bar spin"><i data-h="spinBar"></i></div></div>
  </div>

  <div class="hd-bc">
    <div class="hd-hot" data-h="hot"></div>
    <div class="hd-inv">
      <span class="hd-chip" data-h="chipB"><kbd>H</kbd><b data-h="invB">0</b><i class="hd-lbl">Bandage</i></span>
      <span class="hd-chip" data-h="chipM"><b data-h="invM">0</b><i class="hd-lbl">Medkit</i></span>
      <span class="hd-chip" data-h="chipS"><kbd>B</kbd><b data-h="invS">0</b><i class="hd-lbl">Scrap</i></span>
    </div>
  </div>

  <div class="hd-cross" data-h="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><u></u></div>
  <div class="hd-hitm" data-h="hitm"><i></i><i></i><i></i><i></i></div>
  <svg class="hd-ring" data-h="ring" viewBox="0 0 72 72" width="72" height="72"><circle class="trk" cx="36" cy="36" r="30"/><circle class="arc" data-h="ringArc" cx="36" cy="36" r="30" transform="rotate(-90 36 36)"/></svg>
  <div class="hd-lbl hd-ringlbl" data-h="ringLbl"></div>
  <div class="hd-prompt" data-h="prompt"><kbd data-h="promptKey">F</kbd><span data-h="promptTxt"></span></div>
  <div class="hd-feed" data-h="feed"></div>
  <div class="hd-toasts" data-h="toasts"></div>
  <div class="hd-ann" data-h="ann"><div class="hd-ann-t" data-h="annT"></div><div class="hd-ann-rule"></div><div class="hd-ann-s" data-h="annS"></div></div>

  <div class="hd-over" data-h="over"><div class="hd-over-card">
    <div class="hd-over-eyebrow">Signal lost &middot; Island 7</div>
    <div class="hd-over-title">Over<span>run</span></div>
    <div class="hd-over-sub" data-h="overSub"></div>
    <div class="hd-over-stats">
      <div><b data-h="oNights">0</b><i class="hd-lbl">Nights survived</i></div>
      <div><b data-h="oKills">0</b><i class="hd-lbl">Kills</i></div>
      <div><b data-h="oHeads">0</b><i class="hd-lbl">Headshots</i></div>
      <div class="sc"><b data-h="oScore">0</b><i class="hd-lbl">Score</i></div>
    </div>
    <div class="hd-over-foot"><button class="hd-go" data-h="again" type="button">Drop in again</button><span class="hd-lbl" data-h="oBest"></span></div>
  </div></div>
</div>
`;

const SHORT = { bat: 'POST', pistol: 'P9', smg: 'VESPER', shotgun: 'BRAKEMAN', rifle: 'KESTREL', sniper: 'LONGREACH', gatling: 'HURRICANE' };
const LOOT_COLOR = { weapon: '#ff7a3c', ammo: '#f2c14e', med: '#ff9aa8', armor: '#7fb7e6', scrap: 'rgba(232,228,216,0.6)' };
const DEG = 180 / Math.PI;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const BEST_KEY = 'hollowdawn.best';

export function init(game) {
  const CONFIG = game.CONFIG;
  const noop = () => {};
  const host = document.getElementById('hud');
  if (!host) return { update: noop, reset: noop, toast: noop, announce: noop };

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  host.innerHTML = HTML;

  const E = {};
  host.querySelectorAll('[data-h]').forEach((n) => { E[n.getAttribute('data-h')] = n; });
  const R = E.root;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------- cached writers
  let c = {};
  function txt(node, key, v) { if (c[key] !== v) { c[key] = v; node.textContent = v; } }
  function sx(node, key, v) {
    v = Math.round(v * 400) / 400;
    if (c[key] !== v) { c[key] = v; node.style.transform = 'scaleX(' + v + ')'; }
  }
  function cls(node, key, name, on) { if (c[key] !== on) { c[key] = on; node.classList.toggle(name, on); } }

  // ---------------------------------------------------------------- hotbar
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('div'); s.className = 'hd-slot empty';
    const n = document.createElement('i'); n.textContent = String(i + 1);
    const b = document.createElement('b'); b.textContent = '—';
    s.append(n, b); E.hot.appendChild(s);
    slots.push({ el: s, name: b, id: null, on: null });
  }
  function shortName(def, id) {
    if (SHORT[id]) return SHORT[id];
    const nm = def && def.name ? String(def.name).split(' ')[0] : id;
    return String(nm).toUpperCase();
  }

  // ---------------------------------------------------------------- compass
  const PPD = 2.4, COMPASS_W = 320;
  const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -180; d <= 540; d += 15) {
    const t = document.createElement('div');
    const m = ((d % 360) + 360) % 360;
    const label = CARD[m];
    t.className = 'hd-ct' + (label ? ' maj' : '') + (label && label.length === 1 ? ' card' : '') + (m === 0 ? ' n' : '');
    t.style.left = ((d + 180) * PPD) + 'px';
    const sp = document.createElement('span');
    sp.textContent = label || (m % 30 === 0 ? String(m) : '');
    t.appendChild(sp);
    E.compass.appendChild(t);
  }

  // ---------------------------------------------------------------- pooled popup stacks
  const IN_KF = [{ opacity: 0, scale: '1.25' }, { opacity: 1, scale: '1' }];
  const IN_OPT = { duration: 170, easing: 'cubic-bezier(.2,.8,.2,1)' };
  function makeStack(parent, n, itemCls, life) {
    const pool = [];
    for (let i = 0; i < n; i++) {
      const e = document.createElement('div'); e.className = itemCls + ' off';
      const b = document.createElement('b'), s = document.createElement('span');
      e.append(b, s); parent.appendChild(e);
      pool.push({ e, b, s, t: 0, order: 0, out: false });
    }
    return {
      push(lead, text, mod) {
        let pick = pool[0];
        for (let i = 0; i < n; i++) {
          const sl = pool[i];
          if (sl.t <= 0) { pick = sl; break; }
          if (sl.t < pick.t) pick = sl;
        }
        for (let i = 0; i < n; i++) {
          const sl = pool[i];
          if (sl !== pick && sl.t > 0) { sl.order++; sl.e.style.setProperty('--i', sl.order); }
        }
        pick.t = life; pick.order = 0; pick.out = false;
        pick.b.textContent = lead; pick.s.textContent = text;
        pick.e.className = itemCls + (mod ? ' ' + mod : '');
        pick.e.style.setProperty('--i', 0);
        if (!reduce && pick.e.animate) { try { pick.e.animate(IN_KF, IN_OPT); } catch (err) { /* ignore */ } }
      },
      update(dt) {
        for (let i = 0; i < n; i++) {
          const sl = pool[i];
          if (sl.t <= 0) continue;
          sl.t -= dt;
          if (sl.t <= 0) { sl.e.className = itemCls + ' off'; sl.e.style.setProperty('--i', 0); sl.order = 0; }
          else if (sl.t < 0.32 && !sl.out) { sl.out = true; sl.e.classList.add('out'); }
        }
      },
      clear() {
        for (let i = 0; i < n; i++) { const sl = pool[i]; sl.t = 0; sl.order = 0; sl.out = false; sl.e.className = itemCls + ' off'; sl.e.style.setProperty('--i', 0); }
      },
    };
  }
  const feed = makeStack(E.feed, 5, 'hd-fi', 1.5);
  const toasts = makeStack(E.toasts, 4, 'hd-ti', 2.8);   // four rows fit between the minimap and the ability column

  // ---------------------------------------------------------------- damage direction pool
  const DIR_LIFE = 1.3;
  const dirs = [];
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('div'); d.className = 'hd-dir';
    d.appendChild(document.createElement('i'));
    E.dirs.appendChild(d);
    dirs.push({ el: d, x: 0, z: 0, t: 0 });
  }

  // ---------------------------------------------------------------- transient state
  let dmg = 0, dmgShown = -1;
  let hitT = 0, hitLife = 0.22, hitShown = false;
  let dryT = 0;
  let annT = 0;
  const annQ = [];
  const ANN_LIFE = 3.2;
  let mapT = 0, zoneT = 0;
  const over = { on: false, t: 0, nights: 0, kills: 0, heads: 0, score: 0 };

  function toast(text) { if (text != null && text !== '') toasts.push('', String(text), ''); }

  function announce(title, sub, tone) {
    if (annQ.length >= 4) annQ.shift();
    annQ.push({ title: String(title || ''), sub: String(sub || ''), tone: tone || '' });
  }
  function showAnn(a) {
    E.annT.textContent = a.title;
    E.annS.textContent = a.sub;
    E.ann.className = 'hd-ann ' + a.tone;
    void E.ann.offsetWidth;            // restart the keyframes (rare, not per frame)
    E.ann.classList.add('show');
    annT = ANN_LIFE;
  }

  // ---------------------------------------------------------------- events
  game.on('hit', (e) => {
    const strong = !!(e && (e.killed || e.headshot));
    hitLife = strong ? 0.36 : 0.2;
    hitT = hitLife;
    cls(E.hitm, 'hitKill', 'kill', strong);
  });
  game.on('zombieKilled', (e) => {
    const hs = !!(e && e.headshot);
    const boss = !!(e && e.boss);
    const pts = (CONFIG.score.kill || 0) + (hs ? (CONFIG.score.headshot || 0) : 0) +
      (boss ? ((CONFIG.zombies.boss && CONFIG.zombies.boss.score) || 0) : 0);
    const type = boss ? String((CONFIG.boss && CONFIG.boss.name) || 'BOSS').toUpperCase()
      : (e && (e.type || (e.zombie && e.zombie.type)) ? String(e.type || e.zombie.type).toUpperCase() : 'KILL');
    feed.push('+' + pts, hs && !boss ? 'HEADSHOT' : type, hs ? 'head' : '');
  });
  game.on('playerHit', (e) => {
    const amount = e && e.amount ? e.amount : 8;
    dmg = Math.min(1, dmg + 0.25 + amount / 40);
    const sp = e && e.sourcePos;
    if (!sp) return;
    let pick = dirs[0];
    for (let i = 0; i < dirs.length; i++) {
      if (dirs[i].t <= 0) { pick = dirs[i]; break; }
      if (dirs[i].t < pick.t) pick = dirs[i];
    }
    pick.x = sp.x; pick.z = sp.z; pick.t = DIR_LIFE;
  });
  game.on('phase', (e) => {
    if (!e) return;
    if (e.phase === 'night') announce('Night ' + e.night, 'They are coming', 'night');
    else if (e.night > 0) announce('Dawn', 'You survived night ' + e.night, 'dawn');
    else announce('Day 1', 'Scavenge before nightfall', 'day');
  });
  game.on('airdropIncoming', () => announce('Supply drop inbound', 'Follow the red flare', 'drop'));
  game.on('airdropLanded', () => toast('Supply crate has landed'));
  game.on('barricadeBroken', () => toast('Barricade destroyed'));
  game.on('pickup', (e) => {
    if (!e) return;
    const name = e.name || e.id || 'Item';
    let t = String(name);
    if (e.kind === 'armor') t += ' +' + (e.amount | 0);
    else if (e.amount > 1) t += ' ×' + (e.amount | 0);
    toasts.push('+', t, '');
  });
  game.on('toast', (t) => toast(t));
  game.on('dryFire', () => { dryT = 0.2; });
  game.on('weaponSwitch', () => {
    if (!reduce && E.wname.animate) {
      try { E.wname.animate([{ opacity: 0.2, translate: '10px 0' }, { opacity: 1, translate: '0 0' }], { duration: 160, easing: 'ease-out' }); } catch (err) { /* ignore */ }
    }
  });
  game.on('gameOver', (e) => {
    const s = (e && e.stats) || game.stats || {};
    over.on = true; over.t = 0;
    over.nights = s.nightsSurvived | 0; over.kills = s.kills | 0; over.heads = s.headshots | 0; over.score = s.score | 0;
    const n = e && e.night != null ? e.night : game.night;
    E.overSub.textContent = game.phase === 'night'
      ? 'They got you on night ' + n + '.'
      : (n > 0 ? 'You fell in daylight after night ' + n + '.' : 'You fell before the first nightfall.');
    let best = 0;
    try { best = parseInt(window.localStorage.getItem(BEST_KEY), 10) || 0; } catch (err) { best = 0; }
    const isBest = over.score > best;
    if (isBest) { try { window.localStorage.setItem(BEST_KEY, String(over.score)); } catch (err) { /* ignore */ } }
    E.oBest.textContent = isBest && over.score > 0 ? 'New best run' : (best > 0 ? 'Best ' + best : '');
    E.oNights.textContent = '0'; E.oKills.textContent = '0'; E.oHeads.textContent = '0'; E.oScore.textContent = '0';
    E.over.classList.add('on');
  });
  E.again.addEventListener('click', () => { if (game.restart) game.restart(); });

  // ---------------------------------------------------------------- minimap
  const MAP = 170, MAP_R = 58;
  const mctx = E.map.getContext ? E.map.getContext('2d') : null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  E.map.width = Math.round(MAP * dpr); E.map.height = Math.round(MAP * dpr);
  const MAP_FONT = '600 8px ui-monospace, Menlo, Consolas, monospace';

  function drawMap() {
    const g = mctx, p = game.player;
    if (!g || !p || !p.position) return;
    const px = p.position.x, pz = p.position.z, yaw = p.yaw || 0;
    const half = MAP / 2, k = half / MAP_R, cull = MAP_R * 1.45, cull2 = cull * cull;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const world = game.world, loot = game.loot, zombies = game.zombies;
    const nightK = 1 - (game.dayFactor == null ? 1 : game.dayFactor);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, MAP, MAP);
    g.fillStyle = 'rgba(8,11,22,' + (0.62 + nightK * 0.16).toFixed(2) + ')';
    g.fillRect(0, 0, MAP, MAP);

    g.save();
    g.translate(half, half); g.rotate(yaw); g.scale(k, k); g.translate(-px, -pz);

    // grid
    const gs = 20;
    g.lineWidth = 1 / k; g.strokeStyle = 'rgba(232,228,216,0.07)';
    g.beginPath();
    for (let x = Math.floor((px - cull) / gs) * gs; x <= px + cull; x += gs) { g.moveTo(x, pz - cull); g.lineTo(x, pz + cull); }
    for (let z = Math.floor((pz - cull) / gs) * gs; z <= pz + cull; z += gs) { g.moveTo(px - cull, z); g.lineTo(px + cull, z); }
    g.stroke();

    // island limit
    const hs = (world && world.size ? world.size : CONFIG.world.size) / 2;
    g.strokeStyle = 'rgba(141,153,174,0.35)'; g.lineWidth = 1.5 / k;
    g.strokeRect(-hs, -hs, hs * 2, hs * 2);

    if (world) {
      // compounds
      const comps = world.compounds;
      if (comps) {
        g.fillStyle = 'rgba(232,228,216,0.05)'; g.strokeStyle = 'rgba(232,228,216,0.16)'; g.lineWidth = 1 / k;
        for (let i = 0; i < comps.length; i++) {
          const cp = comps[i]; if (!cp || !cp.center) continue;
          const dx = cp.center.x - px, dz = cp.center.z - pz, rr = (cp.radius || 20) + cull;
          if (dx * dx + dz * dz > rr * rr) continue;
          g.beginPath(); g.arc(cp.center.x, cp.center.z, cp.radius || 20, 0, 6.2832); g.fill(); g.stroke();
        }
      }
      // walls
      const cols = world.colliders;
      if (cols) {
        const minT = 1.3 / k;
        g.fillStyle = 'rgba(232,228,216,0.62)';
        g.beginPath();
        for (let i = 0; i < cols.length; i++) {
          const co = cols[i];
          if (!co || co.type !== 'wall' || !co.box) continue;
          const mn = co.box.min, mx = co.box.max;
          const cx = (mn.x + mx.x) * 0.5 - px, cz = (mn.z + mx.z) * 0.5 - pz;
          if (cx * cx + cz * cz > cull2 * 1.6) continue;
          let w = mx.x - mn.x, d = mx.z - mn.z, x0 = mn.x, z0 = mn.z;
          if (w < minT) { x0 -= (minT - w) * 0.5; w = minT; }
          if (d < minT) { z0 -= (minT - d) * 0.5; d = minT; }
          g.rect(x0, z0, w, d);
        }
        g.fill();
      }
    }

    if (loot) {
      // barricades
      const bars = loot.barricades;
      if (bars && bars.length) {
        const bw = (CONFIG.barricade.width || 2.6) * 0.5;
        g.strokeStyle = '#ff7a3c'; g.lineWidth = 2.2 / k;
        g.beginPath();
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i]; if (!b || !b.position) continue;
          const dx = b.position.x - px, dz = b.position.z - pz;
          if (dx * dx + dz * dz > cull2) continue;
          const by = b.yaw || 0, ux = Math.cos(by) * bw, uz = -Math.sin(by) * bw;
          g.moveTo(b.position.x - ux, b.position.z - uz); g.lineTo(b.position.x + ux, b.position.z + uz);
        }
        g.stroke();
      }
      // loot
      const items = loot.items;
      if (items && items.length) {
        const r = 1.5 / k;
        for (let i = 0; i < items.length; i++) {
          const it = items[i]; if (!it || !it.position) continue;
          const dx = it.position.x - px, dz = it.position.z - pz;
          if (dx * dx + dz * dz > cull2) continue;
          g.fillStyle = LOOT_COLOR[it.kind] || LOOT_COLOR.scrap;
          const rr = it.kind === 'weapon' ? r * 1.5 : r;
          g.fillRect(it.position.x - rr, it.position.z - rr, rr * 2, rr * 2);
        }
      }
    }

    // zombies
    if (zombies && zombies.list) {
      const list = zombies.list, r = 2.1 / k;
      g.fillStyle = '#9be564';
      g.beginPath();
      for (let i = 0; i < list.length; i++) {
        const zb = list[i]; if (!zb || !zb.alive || !zb.position || zb.boss) continue;
        const dx = zb.position.x - px, dz = zb.position.z - pz;
        if (dx * dx + dz * dz > cull2) continue;
        const rr = zb.type === 'brute' ? r * 1.7 : r;
        g.moveTo(zb.position.x + rr, zb.position.z);
        g.arc(zb.position.x, zb.position.z, rr, 0, 6.2832);
      }
      g.fill();
      // the Hollow King: a larger ember dot
      const bz = zombies.boss;
      if (bz && bz.alive && bz.position) {
        g.fillStyle = '#ff2e2e';
        g.beginPath(); g.arc(bz.position.x, bz.position.z, r * 2.8, 0, 6.2832); g.fill();
      }
    }
    g.restore();

    // compound names (upright)
    if (world && world.compounds) {
      const comps = world.compounds;
      g.font = MAP_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(232,228,216,0.8)';
      for (let i = 0; i < comps.length; i++) {
        const cp = comps[i]; if (!cp || !cp.center || !cp.name) continue;
        const dx = cp.center.x - px, dz = cp.center.z - pz;
        const sxp = half + (dx * cs - dz * sn) * k, syp = half + (dx * sn + dz * cs) * k;
        if (sxp < 18 || sxp > MAP - 18 || syp < 8 || syp > MAP - 8) continue;
        g.fillText(String(cp.name).toUpperCase(), sxp, syp);
      }
    }

    // airdrop marker (clamped to the rim when far)
    const ad = loot && loot.airdrop;
    if (ad && ad.position && !ad.opened) {
      const dx = ad.position.x - px, dz = ad.position.z - pz;
      let ox = (dx * cs - dz * sn) * k, oy = (dx * sn + dz * cs) * k;
      const lim = half - 11, len = Math.hypot(ox, oy);
      if (len > lim) { ox *= lim / len; oy *= lim / len; }
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
      g.strokeStyle = 'rgba(255,122,60,' + (0.25 + 0.5 * pulse).toFixed(2) + ')'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(half + ox, half + oy, 6 + pulse * 3, 0, 6.2832); g.stroke();
      g.fillStyle = '#ff7a3c';
      g.beginPath();
      g.moveTo(half + ox, half + oy - 5); g.lineTo(half + ox + 5, half + oy); g.lineTo(half + ox, half + oy + 5); g.lineTo(half + ox - 5, half + oy);
      g.closePath(); g.fill();
    }

    // boss reward chests (gold diamond, clamped to the rim when far) until opened
    const chests = loot && loot.bossChests;
    if (chests && chests.length) {
      for (let i = 0; i < chests.length; i++) {
        const ch = chests[i];
        if (!ch || !ch.position || ch.opened) continue;
        const dx = ch.position.x - px, dz = ch.position.z - pz;
        let ox = (dx * cs - dz * sn) * k, oy = (dx * sn + dz * cs) * k;
        const lim = half - 11, len = Math.hypot(ox, oy);
        if (len > lim) { ox *= lim / len; oy *= lim / len; }
        g.fillStyle = '#ffd25e';
        g.beginPath();
        g.moveTo(half + ox, half + oy - 5); g.lineTo(half + ox + 5, half + oy); g.lineTo(half + ox, half + oy + 5); g.lineTo(half + ox - 5, half + oy);
        g.closePath(); g.fill();
      }
    }

    // north tick
    const nx = half + sn * (half - 9), ny = half - cs * (half - 9);
    g.font = '700 9px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ff7a3c'; g.fillText('N', nx, ny);

    // player: view wedge + arrow (map is heading-up)
    g.fillStyle = 'rgba(232,228,216,0.10)';
    g.beginPath(); g.moveTo(half, half); g.lineTo(half - 26, half - 44); g.lineTo(half + 26, half - 44); g.closePath(); g.fill();
    g.fillStyle = '#e8e4d8'; g.strokeStyle = 'rgba(7,10,20,0.9)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(half, half - 6.5); g.lineTo(half + 4.5, half + 5); g.lineTo(half, half + 2.2); g.lineTo(half - 4.5, half + 5); g.closePath();
    g.fill(); g.stroke();

    // frame (matches the chamfered clip)
    g.strokeStyle = 'rgba(232,228,216,0.28)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(16, 0.5); g.lineTo(MAP - 0.5, 0.5); g.lineTo(MAP - 0.5, MAP - 16); g.lineTo(MAP - 16, MAP - 0.5); g.lineTo(0.5, MAP - 0.5); g.lineTo(0.5, 16);
    g.closePath(); g.stroke();
    g.strokeStyle = '#ff7a3c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(1, 16); g.lineTo(16, 1); g.stroke();
  }

  function updateZone() {
    const p = game.player, world = game.world;
    let name = 'Open ground';
    if (p && p.position && world && world.compounds) {
      const comps = world.compounds;
      let best = Infinity;
      for (let i = 0; i < comps.length; i++) {
        const cp = comps[i]; if (!cp || !cp.center) continue;
        const d = Math.hypot(cp.center.x - p.position.x, cp.center.z - p.position.z) - (cp.radius || 20);
        if (d < 4 && d < best) { best = d; name = cp.name || 'Compound'; }
      }
    }
    txt(E.zone, 'zone', name);
  }

  // ---------------------------------------------------------------- per-frame update
  function onWeaponChange(def, id) {
    const melee = !def || !def.ammoType;
    E.wname.textContent = def ? String(def.name || id).toUpperCase() : ' ';
    E.wpn.classList.toggle('melee', melee);
    E.wpn.classList.toggle('gat', id === 'gatling');
    const at = def && def.ammoType ? CONFIG.ammoTypes[def.ammoType] : null;
    E.atype.textContent = melee ? 'Melee' : (at ? at.name : def.ammoType);
    if (at) E.swatch.style.background = at.color;
    c.mag = null; c.res = null; c.magLow = null; c.magEmpty = null; c.rl = null; c.relBar = null; c.spin = null; c.hot = null;
    E.wpn.classList.remove('low', 'empty', 'reloading', 'hot');
    if (melee) { E.mag.textContent = '—'; c.mag = '—'; }
  }

  function update(dt) {
    const st = game.state;
    const show = st !== 'menu';
    if (c.show !== show) { c.show = show; R.style.display = show ? '' : 'none'; }
    if (!show) return;

    const p = game.player, w = game.weapons, z = game.zombies, l = game.loot;
    const dead = st === 'dead';
    cls(R, 'dead', 'dead', dead);

    // ---- vitals
    let yaw = 0;
    if (p) {
      yaw = p.yaw || 0;
      const mh = p.maxHealth || CONFIG.player.maxHealth || 100;
      const h = p.health == null ? mh : p.health;
      const hp = Math.max(0, Math.ceil(h));
      txt(E.hp, 'hp', hp);
      const hf = clamp01(h / mh);
      sx(E.hpBar, 'hpBar', hf); sx(E.hpGhost, 'hpGhost', hf);
      cls(R, 'low', 'low', hp < 30 && !dead);
      const ar = Math.max(0, Math.round(p.armor || 0));
      txt(E.arm, 'arm', ar);
      sx(E.armBar, 'armBar', clamp01(ar / (CONFIG.player.maxArmor || 100)));
      const sta = p.stamina == null ? 1 : clamp01(p.stamina);
      sx(E.staBar, 'staBar', sta);
      cls(E.staWrap, 'staOut', 'out', sta < 0.15);
    }

    // ---- weapon
    const cur = w && w.current ? w.current : null;
    const def = cur ? (cur.def || (CONFIG.weapons && CONFIG.weapons[cur.id])) : null;
    const wid = cur ? cur.id : '';
    if (c.wid !== wid) { c.wid = wid; onWeaponChange(def, wid); }
    const melee = !def || !def.ammoType;
    const reloading = !!(w && w.reloading);
    if (def && !melee) {
      const mag = cur.mag | 0;
      txt(E.mag, 'mag', mag);
      txt(E.res, 'res', (w.ammo && w.ammo[def.ammoType]) | 0);
      cls(E.wpn, 'magLow', 'low', mag > 0 && mag <= (def.mag || 1) * 0.25);
      cls(E.wpn, 'magEmpty', 'empty', mag === 0);
      cls(E.wpn, 'rl', 'reloading', reloading);
      if (reloading) sx(E.relBar, 'relBar', clamp01(w.reloadProgress || 0));
      if (wid === 'gatling') {
        const spin = clamp01(w.spin || 0);
        sx(E.spinBar, 'spin', spin);
        cls(E.wpn, 'hot', 'hot', spin >= 0.99);
      }
    }
    if (dryT > 0) { dryT -= dt; cls(E.wpn, 'dry', 'dry', dryT > 0); }

    // ---- hotbar + inventory
    if (w && w.slots) {
      const ci = w.currentIndex;
      for (let i = 0; i < 5; i++) {
        const s = w.slots[i], sl = slots[i];
        const id = s ? s.id : '';
        if (sl.id !== id) {
          sl.id = id;
          sl.name.textContent = id ? shortName(s.def, id) : '—';
          sl.el.classList.toggle('empty', !id);
        }
        const on = ci === i;
        if (sl.on !== on) { sl.on = on; sl.el.classList.toggle('on', on); }
      }
    }
    if (l && l.inventory) {
      const inv = l.inventory;
      const nb = inv.bandage | 0, nm = inv.medkit | 0, ns = inv.scrap | 0;
      txt(E.invB, 'invB', nb); cls(E.chipB, 'zB', 'zero', nb === 0);
      txt(E.invM, 'invM', nm); cls(E.chipM, 'zM', 'zero', nm === 0);
      txt(E.invS, 'invS', ns); cls(E.chipS, 'zS', 'zero', ns < (CONFIG.barricade.cost || 1));
    }

    // ---- phase clock
    const night = game.phase === 'night';
    const dur = game.phaseDuration || 1;
    const remain = Math.max(0, dur - (game.phaseTime || 0));
    const secs = Math.ceil(remain);
    if (c.secs !== secs) {
      c.secs = secs;
      const s = secs % 60;
      E.time.textContent = ((secs / 60) | 0) + ':' + (s < 10 ? '0' : '') + s;
    }
    const pk = (night ? 'N' : 'D') + (game.night | 0);
    if (c.pk !== pk) {
      c.pk = pk;
      E.phase.textContent = night ? 'Night ' + game.night : 'Day ' + ((game.night | 0) + 1);
      E.phaseSub.textContent = night ? 'until dawn' : 'to nightfall';
      E.clock.classList.toggle('night', night);
    }
    sx(E.pbar, 'pbar', clamp01((game.phaseTime || 0) / dur));
    cls(E.clock, 'warn', 'warn', !night && remain <= 10 && st === 'playing');
    if (night && z) txt(E.left, 'left', (z.aliveCount | 0) + (z.remainingToSpawn | 0));

    // ---- score
    const stats = game.stats;
    if (stats) { txt(E.score, 'score', stats.score | 0); txt(E.kills, 'kills', stats.kills | 0); txt(E.heads, 'heads', stats.headshots | 0); }

    // ---- compass
    let heading = (-yaw * DEG) % 360; if (heading < 0) heading += 360;
    const cx = Math.round((COMPASS_W / 2 - (heading + 180) * PPD) * 2) / 2;
    if (c.cx !== cx) { c.cx = cx; E.compass.style.transform = 'translateX(' + cx + 'px)'; }
    const ad = l && l.airdrop;
    let dropX = -1;
    if (ad && ad.position && !ad.opened && p && p.position) {
      const bearing = Math.atan2(ad.position.x - p.position.x, -(ad.position.z - p.position.z)) * DEG;
      let rel = (bearing - heading) % 360; if (rel > 180) rel -= 360; if (rel < -180) rel += 360;
      const lim = COMPASS_W / 2 / PPD * 0.74;
      if (rel > lim) rel = lim; else if (rel < -lim) rel = -lim;
      dropX = Math.round(COMPASS_W / 2 + rel * PPD);
    }
    if (c.dropX !== dropX) {
      c.dropX = dropX;
      E.cdrop.classList.toggle('on', dropX >= 0);
      if (dropX >= 0) E.cdrop.style.transform = 'translateX(' + dropX + 'px)';
    }

    // ---- crosshair
    cls(E.cross, 'xMelee', 'melee', melee);
    const healing = !!(l && l.healing);
    cls(E.cross, 'xDim', 'dim', reloading || healing);
    if (w && !melee) {
      const fov = ((game.camera && game.camera.fov) || CONFIG.player.fov) * Math.PI / 360;
      let gap = Math.tan(w.spread || 0) / Math.tan(fov) * (window.innerHeight * 0.5);
      gap = Math.round(Math.min(140, Math.max(2, gap)) * 2) / 2 + 2;
      if (c.gap !== gap) { c.gap = gap; E.cross.style.setProperty('--g', gap + 'px'); }
    }
    if (hitT > 0) {
      hitT -= dt;
      const k = Math.max(0, hitT / hitLife);
      E.hitm.style.opacity = k > 0.5 ? '1' : (k * 2).toFixed(2);
      E.hitm.style.transform = 'rotate(45deg) scale(' + (0.9 + (1 - k) * 0.5).toFixed(3) + ')';
      hitShown = true;
    } else if (hitShown) { hitShown = false; E.hitm.style.opacity = '0'; }

    // ---- progress ring (heal beats reload)
    const ringMode = healing ? 'heal' : (reloading && !melee ? 'reload' : '');
    if (c.ringMode !== ringMode) {
      c.ringMode = ringMode;
      E.ring.setAttribute('class', 'hd-ring' + (ringMode ? ' on ' + ringMode : ''));
      E.ringLbl.className = 'hd-lbl hd-ringlbl' + (ringMode ? ' on ' + ringMode : '');
      if (ringMode) E.ringLbl.textContent = ringMode === 'heal' ? 'Patching up' : 'Reloading';
    }
    if (ringMode) {
      const prog = clamp01(ringMode === 'heal' ? (l.healProgress || 0) : (w.reloadProgress || 0));
      const off = Math.round(188.5 * (1 - prog) * 2) / 2;
      if (c.ringOff !== off) { c.ringOff = off; E.ringArc.style.strokeDashoffset = String(off); }
    }

    // ---- pickup prompt
    const pr = !dead && l && l.prompt ? String(l.prompt) : '';
    if (c.prompt !== pr) {
      c.prompt = pr;
      if (pr) {
        const m = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(pr);
        E.promptKey.textContent = m ? m[1] : 'F';
        E.promptTxt.textContent = m ? m[2] : pr;
      }
      E.prompt.classList.toggle('on', !!pr);
    }

    // ---- damage feedback
    if (dmg > 0) dmg = Math.max(0, dmg - dt * 0.9);
    const dv = Math.round(dmg * 50) / 50;
    if (dmgShown !== dv) { dmgShown = dv; E.vig.style.opacity = String(Math.min(1, dv * 0.95)); }
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      if (d.t <= 0) continue;
      d.t -= dt;
      if (d.t <= 0 || !p || !p.position) { d.t = 0; d.el.style.opacity = '0'; continue; }
      const dx = d.x - p.position.x, dz = d.z - p.position.z;
      const fwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
      const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      d.el.style.transform = 'rotate(' + Math.atan2(right, fwd).toFixed(3) + 'rad)';
      d.el.style.opacity = Math.min(1, d.t / (DIR_LIFE * 0.5)).toFixed(2);
    }

    // ---- popups
    feed.update(dt); toasts.update(dt);
    if (annT > 0) { annT -= dt; if (annT <= 0) E.ann.classList.remove('show'); }
    if (annT <= 0 && annQ.length && !dead) showAnn(annQ.shift());

    // ---- minimap (throttled) + zone label
    mapT -= dt;
    if (mapT <= 0) { mapT = 0.066; drawMap(); }
    zoneT -= dt;
    if (zoneT <= 0) { zoneT = 0.5; updateZone(); }

    // ---- game over count-up
    if (over.on && over.t < 1) {
      over.t = Math.min(1, over.t + dt / 1.1);
      const k = reduce ? 1 : 1 - Math.pow(1 - over.t, 3);
      if (reduce) over.t = 1;
      txt(E.oNights, 'oN', Math.round(over.nights * k));
      txt(E.oKills, 'oK', Math.round(over.kills * k));
      txt(E.oHeads, 'oH', Math.round(over.heads * k));
      txt(E.oScore, 'oS', Math.round(over.score * k));
    }
  }

  function reset() {
    const wasShown = c.show;
    c = {};
    c.show = wasShown;
    dmg = 0; dmgShown = -1; hitT = 0; hitShown = false; dryT = 0; annT = 0; annQ.length = 0;
    mapT = 0; zoneT = 0;
    over.on = false; over.t = 0;
    E.over.classList.remove('on');
    E.ann.className = 'hd-ann';
    E.vig.style.opacity = '0';
    E.hitm.style.opacity = '0';
    E.hitm.classList.remove('kill');
    E.prompt.classList.remove('on');
    E.cdrop.classList.remove('on');
    E.wpn.classList.remove('dry');
    R.classList.remove('dead', 'low');
    E.cross.classList.remove('melee', 'dim');
    E.staWrap.classList.remove('out');
    E.clock.classList.remove('warn');
    E.chipB.classList.remove('zero'); E.chipM.classList.remove('zero'); E.chipS.classList.remove('zero');
    E.ring.setAttribute('class', 'hd-ring');
    E.ringLbl.className = 'hd-lbl hd-ringlbl';
    for (let i = 0; i < dirs.length; i++) { dirs[i].t = 0; dirs[i].el.style.opacity = '0'; }
    for (let i = 0; i < slots.length; i++) { slots[i].id = null; slots[i].on = null; slots[i].el.classList.remove('on'); }
    feed.clear(); toasts.clear();
  }

  return { update, reset, toast, announce };
}
