// sprouts.js -- Solunar Sprouts: the Sprout Book. Tabs: My Sprouts (every Sprout and waiting egg, plus a detail page per Sprout:
// stats, nature, evolution path, moves, style, bonded animals, body parts, battle stats, race ratings, records, sell), and the
// collection shelves Eggs, Animals and Looks (paint, stickers, hats), each entry with its own page: found in colour with a fun
// fact, or a silhouette with how to find it. Every 10 entries gives a prize. Exposes PS.book (counts, icon, open) for the title.
// Scene: PS.scenes.sprouts = { mount, show({id} | {tab} | {entry: 'a:hare'}), hide, frame }. Styles are injected below (prefix .sp-).
(function () {
  'use strict';
  const { D, state } = PS;
  const fmt = n => Math.round(n).toLocaleString();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const CSS = `
.sp-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.sp-wrap{padding:12px 12px 28px;max-width:460px;margin:0 auto;display:grid;gap:12px}
.sp-head{padding:12px 14px;display:flex;align-items:center;gap:10px}
.sp-head h1{margin:0;font-size:26px;color:var(--ink)}
.sp-head .sp-sub{font-size:14px;color:var(--ink-soft);margin-top:2px}
.sp-head .sp-count{margin-left:auto;font-family:var(--f-ui);font-weight:700;font-size:16px;background:var(--slot);border:2px solid var(--line);border-radius:12px;padding:3px 10px}
.sp-lbl{font-family:var(--f-ui);font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft);margin:4px 4px -4px;display:flex;align-items:center;gap:8px}
.sp-lbl .n{background:var(--slot);border:2px solid var(--line);border-radius:10px;padding:0 7px;letter-spacing:0;color:var(--ink)}
.sp-list{display:grid;gap:10px}
.sp-row{display:grid;grid-template-columns:76px 1fr auto;align-items:center;gap:12px;width:100%;text-align:left;background:var(--panel);border:2px solid var(--line);border-bottom:5px solid var(--edge);
  border-radius:20px;padding:8px 12px 8px 8px;color:var(--ink)}
.sp-row:active{transform:translateY(2px);border-bottom-width:3px;margin-bottom:2px}
.sp-row:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sp-row.partner{border-color:var(--sun-edge);box-shadow:inset 0 0 0 2px var(--sun)}
.sp-pic{height:76px;border-radius:14px;background:var(--slot);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.sp-pic canvas{display:block;margin-bottom:4px}
.sp-row b{display:block;font-family:var(--f-px);font-weight:700;font-size:20px;line-height:1.1}
.sp-row small{display:block;font-size:14px;line-height:1.35;color:var(--ink-soft)}
.sp-row .sp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.sp-lv{display:grid;justify-items:center;gap:2px}
.sp-lv .num{font-size:22px;line-height:1}
.sp-lv span:not(.num){font-family:var(--f-ui);font-size:13.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft)}
.sp-tag{display:inline-block;font-family:var(--f-ui);font-weight:600;font-size:13.5px;background:var(--sun);border:2px solid var(--sun-edge);color:#4a3210;border-radius:8px;padding:0 6px;margin-left:6px;vertical-align:3px}
.sp-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:0 7px;font-family:var(--f-ui);font-weight:600;font-size:14px;line-height:18px;color:#fff;white-space:nowrap}
.sp-chip.soft{background:var(--slot);color:var(--ink);border:1px solid var(--line)}
.sp-egg{display:grid;grid-template-columns:56px 1fr auto;align-items:center;gap:12px;background:var(--panel);border:2px dashed var(--edge);border-radius:18px;padding:8px 12px 8px 8px}
.sp-egg .sp-pic{height:62px}
.sp-egg b{display:block;font-family:var(--f-px);font-weight:700;font-size:17px}
.sp-egg small{display:block;font-size:14px;color:var(--ink-soft);line-height:1.35}
.sp-empty{padding:18px;text-align:center}
.sp-empty p{margin:6px 0 12px;line-height:1.45}
.sp-acct{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.sp-dev{justify-self:center;background:none;border:0;padding:8px 12px;font-family:var(--f-ui);font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft);opacity:.75;text-decoration:underline;text-underline-offset:3px}

/* detail */
.sp-top{display:flex;align-items:center;gap:8px}
.sp-back{display:inline-flex;align-items:center;gap:6px;font-size:15px;padding:7px 12px 6px}
.sp-hero{padding:14px;display:grid;gap:10px;justify-items:center;text-align:center}
.sp-stagebox{position:relative;width:100%;height:190px;border-radius:18px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;
  background:linear-gradient(#cfeefc 0 58%, #a6dc8f 58% 100%);border:2px solid var(--line)}
.sp-stagebox.beach{background:linear-gradient(#bfe6ff 0 58%, #f2d49a 58% 100%)}
.sp-stagebox.moonlit{background:linear-gradient(#3b3f86 0 58%, #2f6b5a 58% 100%)}
.sp-stagebox.candy{background:linear-gradient(#ffe0f0 0 58%, #f7b6c8 58% 100%)}
.sp-stagebox canvas{display:block;margin-bottom:14px;cursor:pointer}
.sp-stagebox .sp-where{position:absolute;left:8px;top:8px;font-family:var(--f-ui);font-weight:600;font-size:14px;background:rgba(255,248,230,.9);border-radius:8px;padding:2px 8px;color:var(--ink)}
.sp-namebox{display:flex;align-items:center;gap:6px;width:100%;max-width:300px}
.sp-name-in{flex:1;min-width:0;font-family:var(--f-px);font-weight:700;font-size:26px;text-align:center;color:var(--ink);background:var(--field);border:2px solid var(--line);border-radius:12px;padding:4px 8px;
  -webkit-user-select:text;user-select:text;touch-action:manipulation}
.sp-name-in:focus{outline:3px solid var(--focus);outline-offset:1px}
.sp-form{font-size:15px;color:var(--ink-soft);margin-top:-4px}
.sp-form b{color:var(--ink);font-weight:600}
.sp-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.sp-acts .btn{font-size:15px}
.sp-acts .btn[disabled]{opacity:.7;cursor:default}
.sp-mood{width:100%;text-align:left}
.sp-mood small{font-family:var(--f-ui);font-size:13.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft);display:flex;justify-content:space-between}
.sp-happy{margin:5px 0 0;font-size:14px;line-height:1.3;color:var(--ink-soft)}
.sp-happy.on{color:#a2334a;font-weight:600}
.sp-shiny{display:inline-flex;align-items:center;gap:3px;border-radius:8px;padding:0 8px;font-family:var(--f-ui);font-weight:700;font-size:14px;line-height:20px;white-space:nowrap;color:#5e2f86;
  background:linear-gradient(100deg,#fff4c2 0%,#ffd6ef 30%,#d4f1ff 60%,#fff4c2 100%);background-size:250% 100%;border:1px solid #d9a0e8;animation:sp-shine 2.6s ease-in-out infinite alternate}
@keyframes sp-shine{from{background-position:0% 50%}to{background-position:100% 50%}}
@media (prefers-reduced-motion: reduce){.sp-shiny{animation:none}}

.sp-sec{padding:14px}
.sp-fold-h{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;cursor:pointer;min-height:36px}
.sp-fold-h h2{flex:1}
.sp-chev{flex:0 0 auto;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--slot);border:2px solid var(--line);font-size:14px;color:var(--ink-soft);transition:transform .15s}
.sp-fold.open .sp-chev{transform:rotate(180deg)}
.sp-fold-sum{margin-top:8px;cursor:pointer}
.sp-more{display:block;margin-top:8px;font-size:14px;font-weight:700;color:var(--accent,#c0612a)}
.sp-fold-less{all:unset;cursor:pointer;display:block;margin:12px auto 0;padding:6px 14px;font-size:14px;font-weight:700;color:var(--ink-soft)}
.sp-fold-line{margin:0;font-size:14px;color:var(--ink-soft);font-weight:600;line-height:1.4}
.sp-fold-line b{color:var(--ink)}
.sp-mchips{display:flex;flex-wrap:wrap;gap:6px}
.sp-mchip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;border-radius:10px;background:var(--field);border:2px solid var(--line);font-family:var(--f-ui);font-weight:600;font-size:14.5px}
.sp-mchip i{width:8px;height:14px;border-radius:3px;display:block}
.sp-bicons{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sp-bico{position:relative;width:40px;height:40px;border-radius:10px;background:var(--field);border:2px solid var(--line);display:grid;place-items:center}
.sp-bico canvas{width:36px;height:36px;image-rendering:pixelated;image-rendering:crisp-edges}
.sp-bico i{position:absolute;right:-6px;bottom:-6px;font-style:normal;font:700 14px/17px var(--f-ui);background:var(--sun);border:2px solid var(--sun-edge);border-radius:8px;padding:0 4px;color:#4a3210}
.sp-bmore{font-family:var(--f-ui);font-weight:700;font-size:15px;color:var(--ink-soft);padding:0 4px}
.sp-sec h2{margin:0;font-family:var(--f-px);font-weight:700;font-size:20px;color:var(--ink);display:flex;align-items:center;gap:8px}
.sp-sec h2 .sp-aside{margin-left:auto;font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink-soft)}
.sp-sec .sp-note{margin:4px 0 10px;font-size:14px;line-height:1.4;color:var(--ink-soft)}
.sp-stats{display:grid;gap:4px}
.sp-els{display:flex;gap:5px;justify-content:center;margin-top:-6px}
.sp-stat{display:grid;grid-template-columns:70px 50px 1fr;align-items:center;gap:8px}
.sp-stat .nm{font-family:var(--f-ui);font-weight:700;font-size:16px}
.sp-stat .lv{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
.sp-stat .xp{grid-column:3;font-size:14px;color:var(--ink-soft);margin-top:-7px;text-align:right;font-variant-numeric:tabular-nums}
.sp-stat .bar{height:12px}

.sp-nat{position:relative;height:18px;border-radius:9px;border:2px solid var(--line);
  background:linear-gradient(90deg,#9a6ad0 0%,#c9a2f0 37.5%,#bfe3b4 37.5%,#bfe3b4 62.5%,#fff27a 62.5%,#f6c83a 100%)}
.sp-nat i{position:absolute;top:-6px;width:10px;height:26px;margin-left:-5px;border-radius:5px;background:var(--ink);border:2px solid var(--panel)}
.sp-nat-l{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink-soft)}
.sp-nat-l canvas{width:14px;height:14px;vertical-align:-2px;margin:0 4px}
.sp-nat-now{margin:10px 0 0;font-size:14px;line-height:1.4}

.sp-evo{display:grid;grid-template-columns:1fr 18px 1fr 18px 1fr;align-items:end;gap:2px;margin-top:10px}
.sp-evo .st{display:grid;justify-items:center;gap:3px;text-align:center}
.sp-evo .st .pic{width:100%;height:84px;border-radius:14px;background:var(--slot);border:2px solid var(--line);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.sp-evo .st .pic canvas{display:block;margin-bottom:3px}
.sp-evo .st.now .pic{border-color:var(--sun-edge);box-shadow:inset 0 0 0 2px var(--sun);background:var(--panel)}
.sp-evo .st.done .pic{opacity:.75}
.sp-evo .st.next .pic{border-style:dashed}
.sp-evo .st.next .pic canvas{opacity:.55;filter:saturate(.7)}
.sp-evo .st b{font-family:var(--f-ui);font-weight:700;font-size:14.5px;line-height:1.1}
.sp-evo .st small{font-size:14px;color:var(--ink-soft);line-height:1.2}
.sp-evo .arr{align-self:center;font-family:var(--f-px);font-weight:700;color:var(--edge);text-align:center;padding-bottom:30px}
.sp-evo-bar{margin-top:12px;font-size:14px}
.sp-evo-bar .row{display:flex;justify-content:space-between;margin-bottom:5px}
.sp-evo-bar .bar{height:14px}
.sp-flowers{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.sp-flower{display:grid;justify-items:center;gap:2px;padding:7px 4px 6px;border-radius:12px;background:var(--field);border:2px solid var(--line);text-align:center}
.sp-flower canvas{width:30px;height:30px}
.sp-flower b{font-family:var(--f-ui);font-weight:600;font-size:14.5px;line-height:1.1}
.sp-flower small{font-size:14px;color:var(--ink-soft)}
.sp-flower.pick{border-color:var(--sun-edge);background:var(--panel);box-shadow:inset 0 -3px 0 var(--sun)}
.sp-flower.pick small{color:#8a5a10;font-weight:600}

.sp-moves{display:grid;gap:8px;margin-top:10px}
.sp-move{display:grid;grid-template-columns:8px 1fr auto;gap:0 10px;align-items:center;background:var(--field);border:2px solid var(--line);border-radius:14px;padding:7px 10px 7px 7px}
.sp-move>i{grid-row:span 2;align-self:stretch;border-radius:4px}
.sp-move b{font-family:var(--f-ui);font-weight:700;font-size:16px}
.sp-move small{grid-column:2/-1;font-size:13.5px;line-height:1.3;color:var(--ink-soft)}
.sp-move .pw{font-size:14px;font-weight:600;color:var(--ink-soft);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.sp-move.active{background:var(--panel);border-color:var(--sun-edge);border-bottom-width:4px}
.sp-move.locked{opacity:.55;background:var(--slot)}
.sp-move.compact{grid-template-columns:6px 1fr auto;padding:5px 10px 5px 6px;border-radius:11px}
.sp-move.compact>i{grid-row:auto}
.sp-move.compact b{font-size:14px;display:flex;align-items:center;gap:6px}
.sp-move.compact.battle{border-color:var(--sun-edge)}
.sp-inb{font-family:var(--f-ui);font-weight:600;font-size:13px;background:var(--sun);color:#4a3210;border-radius:6px;padding:0 5px;line-height:16px}
.sp-grp{margin-top:14px}
.sp-grp h3{margin:0 0 6px;font-family:var(--f-ui);font-weight:600;font-size:14.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft);display:flex;align-items:center;gap:6px}
.sp-grp h3 canvas{width:22px;height:22px}
.sp-grp .sp-moves{margin-top:0;gap:6px}
.sp-lock{font-size:14px;font-weight:600;color:#8a5a10;background:#fff1c9;border-radius:6px;padding:0 6px;white-space:nowrap}

.sp-bonds{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:10px}
.sp-bond{position:relative;display:grid;justify-items:center;gap:2px;background:var(--field);border:2px solid var(--line);border-radius:14px;padding:8px 4px 7px;text-align:center}
.sp-bond.rare{border-color:#d9a0e8;background:#fbf0ff}
.sp-bond b{font-family:var(--f-ui);font-weight:600;font-size:14.5px;line-height:1.1}
.sp-bond small{font-size:14px;color:var(--ink-soft)}
.sp-bond .cnt{position:absolute;top:-7px;right:-5px;min-width:24px;height:22px;padding:0 5px;display:grid;place-items:center;border-radius:11px;background:var(--sun);border:2px solid var(--sun-edge);font-family:var(--f-ui);font-weight:700;font-size:14px;color:#4a3210}
.sp-pips{display:flex;gap:3px}
.sp-pips i{width:8px;height:8px;border-radius:2px;background:var(--slot);border:1px solid var(--edge)}
.sp-pips i.on{background:var(--accent);border-color:var(--accent-edge)}

.sp-parts{display:grid;gap:8px;margin-top:10px}
.sp-part{display:grid;grid-template-columns:110px 1fr 66px;gap:8px;align-items:center;font-size:14px}
.sp-part b{font-weight:600}
.sp-part small{font-size:14px;color:var(--ink-soft);text-align:right}

.sp-bstats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}
.sp-bstat{display:grid;justify-items:center;background:var(--field);border:2px solid var(--line);border-radius:12px;padding:6px 2px}
.sp-bstat .num{font-size:19px;line-height:1.1}
.sp-bstat small{font-family:var(--f-ui);font-size:13.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft)}
.sp-race{display:grid;grid-template-columns:70px 1fr 38px;gap:8px;align-items:center;margin-top:8px}
.sp-race .nm{font-family:var(--f-ui);font-weight:700;font-size:15px}
.sp-race .num{font-size:14px;text-align:right}
.sp-recs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.sp-rec{background:var(--field);border:2px solid var(--line);border-radius:12px;padding:8px 10px}
.sp-rec .num{font-size:20px}
.sp-rec small{display:block;font-size:14px;color:var(--ink-soft)}
.sp-muted{font-size:14px;color:var(--ink-soft);margin:8px 0 0;line-height:1.4}

/* style: paint, stickers, closet */
.sp-dress{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px}
.sp-dress canvas{display:block;margin:-4px 0}
.sp-skin{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:0 8px 0 4px;font-family:var(--f-ui);font-weight:600;font-size:14px;line-height:20px;white-space:nowrap;
  background:#fff1c9;border:1px solid #e0b040;color:#6a4a10}
.sp-skin canvas{display:block;width:13px;height:13px}
.sp-style-top{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:104px 1fr;gap:12px;align-items:center;margin:4px -6px 0;padding:6px 6px 8px;background:var(--panel);border-radius:0 0 16px 16px}
.sp-mirror{height:112px;cursor:pointer;border-radius:16px;background:linear-gradient(#cfeefc 0 62%, #a6dc8f 62% 100%);border:2px solid var(--line);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.sp-mirror canvas{display:block;margin-bottom:6px}
.sp-style-top p{margin:0;font-size:14px;line-height:1.4;color:var(--ink-soft)}
.sp-style-top p b{color:var(--ink);font-weight:600}
.sp-srow{margin-top:14px}
.sp-srow>.sp-lbl{margin:0 2px 0}
.sp-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:8px}
.sp-tile{position:relative;display:grid;justify-items:center;align-content:start;gap:3px;min-height:92px;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;
  border-radius:14px;padding:9px 4px 7px;text-align:center;color:var(--ink)}
.sp-tile:active{transform:translateY(2px);border-bottom-width:2px;margin-bottom:2px}
.sp-tile:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sp-tile canvas{display:block;margin-bottom:3px}
.sp-tile b{font-family:var(--f-ui);font-weight:600;font-size:16px;line-height:1.1}
.sp-tile small{font-size:13.5px;line-height:1.2;color:var(--ink-soft)}
.sp-tile.on{border-color:var(--sun-edge);background:var(--panel);box-shadow:inset 0 0 0 2px var(--sun)}
.sp-tile.on small{color:#8a5a10;font-weight:600}
.sp-tile .cnt{position:absolute;top:-7px;right:-5px;min-width:26px;height:24px;padding:0 6px;display:grid;place-items:center;border-radius:12px;background:var(--sun);border:2px solid var(--sun-edge);
  font-family:var(--f-ui);font-weight:700;font-size:14.5px;color:#4a3210}
.sp-none{margin:6px 2px 0;font-size:14px;line-height:1.4;color:var(--ink-soft)}
.sp-gbcta{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:center;background:var(--field);border:2px dashed var(--line);border-radius:16px;padding:10px 12px 12px;margin-top:14px}
.sp-gbcta canvas{display:block}
.sp-gbcta p{margin:0;font-size:15px;line-height:1.35;color:var(--ink)}
.sp-gbcta .btn{grid-column:1/-1;min-height:48px}
.sp-ba{display:flex;align-items:center;justify-content:center;gap:6px;margin:2px 0 12px}
.sp-ba figure{margin:0;display:grid;justify-items:center;gap:4px}
.sp-ba .pic{width:104px;height:104px;border-radius:16px;background:var(--slot);border:2px solid var(--line);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.sp-ba .pic canvas{display:block;margin-bottom:3px}
.sp-ba .pic.after{border-color:var(--sun-edge);box-shadow:inset 0 0 0 2px var(--sun);background:var(--panel)}
.sp-ba figcaption{font-family:var(--f-ui);font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-soft)}
.sp-ba .arr{font-family:var(--f-px);font-weight:700;font-size:28px;color:var(--edge);padding-bottom:20px}
.sp-warn{background:#fff1c9;border:2px solid #f0c860;border-radius:12px;padding:8px 10px;font-size:14px;line-height:1.4}
.card p.sp-m-left{text-align:center;font-size:14px;color:var(--ink-soft);margin:0 0 4px}

/* sell */
.sp-sell{display:grid;justify-items:center;gap:6px;margin-top:4px}
.sp-sell-btn{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:8px 16px;background:transparent;border:2px dashed var(--edge);border-bottom-width:2px;color:var(--ink-soft);font-size:15px}
.sp-sell-btn:active{transform:translateY(1px);border-bottom-width:2px;margin-bottom:0}
.sp-sell-btn canvas{width:18px;height:18px}
.sp-sell-btn[disabled]{opacity:.55;cursor:default}
.sp-sell-btn[disabled]:active{transform:none}
.sp-sell p{margin:0;font-size:14px;color:var(--ink-soft)}
.m-body .sp-sell-price{display:flex;align-items:center;justify-content:center;gap:6px;font-family:var(--f-px);font-weight:600;font-size:20px;margin:0 0 8px;color:var(--ink)}
.m-body .sp-sell-price canvas{width:18px;height:18px}
.m-body p.sp-sell-say{text-align:center;font-size:16px}
/* the sell pop-ups: "Keep" is the big, easy choice; selling is small and needs a second yes */
.modal-btns .btn.sp-keep{font-size:21px;padding:15px 12px}
.modal-btns .btn.sp-sell-go{font-size:15px;padding:9px 12px;background:transparent;border:2px dashed var(--edge);border-bottom-width:2px;color:var(--ink-soft)}
.modal-btns .btn.sp-sell-go:active{transform:translateY(1px);border-bottom-width:2px;margin-bottom:0}
.modal-btns .btn.sp-sell-yes{font-size:15px;padding:9px 12px}
.modal-btns .btn.sp-sell-yes[disabled]{opacity:.45;cursor:default}
.modal-btns .btn.sp-sell-yes[disabled]:active{transform:none;border-bottom-width:5px;margin-bottom:0}

/* ---- the Sprout Book: a pinned header (progress, prize bar, tabs); the roster, the shelves and the pages scroll below ---- */
.sp-page{position:absolute;inset:0;display:flex;flex-direction:column;container-type:inline-size}
.sp-pin{flex:0 0 auto;width:100%;max-width:484px;margin:0 auto;padding:12px 12px 0;display:grid;gap:10px}
.sp-box{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 12px}
.sp-box>.sp-wrap{padding:12px 0 28px}
@container (min-width:640px){.sp-pin{max-width:760px}.sp-box>.sp-wrap.sp-wide{max-width:736px}}
@media (max-height:560px){.sp-pin .sp-bookh{display:none}}
.sp-bookh{flex-wrap:wrap;border-left:10px solid #62a855;padding:10px 12px 10px 10px;row-gap:8px}
.sp-bicon{width:48px;height:48px;flex:0 0 auto}
.sp-hmain{flex:1 1 170px;min-width:0}
.sp-pg{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}
.sp-pchip{display:inline-flex;align-items:center;gap:5px;background:var(--slot);border:2px solid var(--line);border-radius:10px;padding:2px 8px 2px 4px;font:600 14px var(--f-ui);color:var(--ink-soft)}
.sp-pchip b{color:var(--ink);font-size:15px}
.sp-pchip canvas{width:22px;height:22px;object-fit:contain}
.sp-bookh .sp-count{align-self:flex-start;background:#e9f6dc;border-color:#9ccf7a;color:#2f5a24;font-size:18px}
.sp-prize{display:flex;align-items:center;gap:6px;flex:1 1 100%;background:#fff4c2;border:2px solid #e0b040;border-radius:12px;padding:5px 8px}
.sp-p10{display:flex;gap:3px;flex:1}
.sp-p10 i{flex:1;max-width:26px;height:15px;border-radius:5px;background:#f3e2b0;border:2px solid #d8b860}
.sp-p10 i.on{background:#7ccc4e;border-color:#3f8a2a}
.sp-prize canvas{width:22px;height:22px}
.sp-prize small{font:700 14px var(--f-ui);color:#8a5a10;white-space:nowrap}
.sp-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.sp-tabs button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:62px;border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;background:var(--slot);
  padding:5px 2px;font:600 15px/1.1 var(--f-ui);color:var(--ink-soft);min-width:0}
.sp-tabs button canvas{width:30px;height:30px;object-fit:contain}
.sp-tabs button span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.sp-tabs button[aria-selected="true"]{background:var(--panel);border-color:var(--sun-edge);color:var(--ink);box-shadow:inset 0 -4px 0 var(--sun)}
.sp-tabs button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sp-sect{display:flex;align-items:center;gap:8px;margin:8px 2px -2px;font:700 18px var(--f-px);color:var(--ink)}
.sp-sect canvas{width:26px;height:26px;object-fit:contain}
.sp-sect .n{margin-left:auto;font:700 14px var(--f-ui);background:var(--slot);border:2px solid var(--line);border-radius:10px;padding:0 8px;color:var(--ink)}
.sp-sect .n.all{background:#e9f6dc;border-color:#9ccf7a;color:#2f5a24}
.sp-coll{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px}
.sp-ctile{position:relative;display:grid;justify-items:center;align-content:start;gap:3px;min-height:120px;background:var(--panel);border:2px solid var(--line);border-bottom:4px solid var(--edge);
  border-radius:16px;padding:8px 4px 7px;text-align:center;color:var(--ink);min-width:0}
.sp-ctile:active{transform:translateY(2px);border-bottom-width:2px;margin-bottom:2px}
.sp-ctile:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sp-ctile.seen,.sp-ctile.unknown{background:var(--slot);border-style:dashed;border-bottom-style:solid}
.sp-ctile b{font:600 14.5px/1.1 var(--f-ui);max-width:100%;overflow:hidden;text-overflow:ellipsis}
.sp-ctile.unknown b{color:var(--ink-soft)}
.sp-cpic{height:74px;display:flex;align-items:flex-end;justify-content:center}
.sp-cpic canvas{display:block}
.sp-no{position:absolute;top:4px;left:7px;font:700 11px var(--f-ui);font-style:normal;color:var(--ink-soft);opacity:.75}
.sp-ctile .cnt{position:absolute;top:-7px;right:-5px;min-width:24px;height:22px;padding:0 5px;display:grid;place-items:center;border-radius:11px;background:var(--sun);border:2px solid var(--sun-edge);
  font:700 13.5px var(--f-ui);color:#4a3210}
.sp-sil{filter:brightness(0) opacity(.3)}
.sp-ghost{filter:saturate(.55) opacity(.42)}
.unknown .sp-sil,.sp-sil.deep{filter:brightness(0) opacity(.15)}
.sp-pnav{display:flex;align-items:center;gap:8px}
.sp-pno{margin-left:auto;font:700 16px var(--f-ui);color:var(--ink-soft)}
.sp-arrow{min-width:58px;min-height:52px;font:700 32px/1 var(--f-ui);padding:2px 10px 6px}
.sp-paper{padding:14px;display:grid;gap:10px;justify-items:center;text-align:center;background:#fffdf3;box-shadow:inset 10px 0 0 #efe3c0}
.sp-paper.turn-n{animation:spTurnN .3s ease-out}
.sp-paper.turn-p{animation:spTurnP .3s ease-out}
@keyframes spTurnN{from{transform:perspective(900px) translateX(30px) rotateY(-14deg);opacity:.3}}
@keyframes spTurnP{from{transform:perspective(900px) translateX(-30px) rotateY(14deg);opacity:.3}}
.sp-stagebox.rare{background:linear-gradient(#e9dcff 0 58%, #f7c6e0 58% 100%)}
.sp-stagebox.legend{background:linear-gradient(#fff1bf 0 58%, #f6d27a 58% 100%)}
.sp-stagebox.look{background:linear-gradient(#fff1c9 0 58%, #e8dcb8 58% 100%)}
.sp-stagebox .sp-item{margin:0 14px 22px 0}
.sp-stagebox canvas.sp-hop{animation:spHop .45s ease-out}
@keyframes spHop{40%{transform:translateY(-16px)}}
@media (prefers-reduced-motion: reduce){.sp-paper.turn-n,.sp-paper.turn-p,.sp-stagebox canvas.sp-hop{animation:none}}
.sp-ptitle{margin:0;font-size:30px;color:var(--ink);line-height:1.1}
.sp-ichips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
.sp-ichip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 6px;border-radius:10px;background:var(--field);border:2px solid var(--line);font:600 15px var(--f-ui);color:var(--ink)}
.sp-ichip canvas{width:20px;height:20px;object-fit:contain}
.sp-ichip.gold{background:#fff1c9;border-color:#e0b040;color:#6a4a10}
.sp-fact{width:100%;text-align:left;background:#fff4c2;border:2px solid #e0b040;border-radius:16px;padding:8px 12px}
.sp-fact b{font:700 13.5px var(--f-ui);letter-spacing:.05em;text-transform:uppercase;color:#8a5a10}
.sp-fact p{margin:2px 0 0;font-size:18px;font-weight:600;line-height:1.35;color:#4a3210}
.sp-fact.locked{background:var(--slot);border-color:var(--line)}
.sp-fact.locked b,.sp-fact.locked p{color:var(--ink-soft)}
.sp-gives{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;width:100%}
.sp-give{border-radius:9px;padding:3px 10px;font:700 15px var(--f-ui);color:#fff;border:2px solid rgba(0,0,0,.15)}
.sp-give.neg{background:var(--slot)!important;color:var(--ink-soft);border-color:var(--line)}
.sp-pbtns{display:grid;gap:8px;width:100%}
.sp-pbtns .btn{min-height:52px;font-size:17px;display:flex;align-items:center;justify-content:center;gap:8px}
.sp-pbtns .btn canvas{width:26px;height:26px;object-fit:contain}
.sp-minelist{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.sp-mine{display:grid;justify-items:center;align-content:end;gap:2px;min-width:86px;min-height:88px;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:6px 8px;color:var(--ink)}
.sp-mine b{font:600 14px var(--f-ui);max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-mine:active{transform:translateY(2px);border-bottom-width:2px;margin-bottom:2px}
@media (max-width:440px){.sp-pchip .lbl{display:none}.sp-pchip{padding:2px 8px 2px 3px}.sp-bookh{padding:8px 10px 8px 8px}.sp-bookh h1{font-size:23px}}
@media (max-width:400px){.sp-bookh{border-left-width:7px}.sp-bicon{width:40px;height:40px}.sp-pchip{font-size:13px;padding:1px 6px 1px 3px}.sp-tabs button{font-size:14px}.sp-coll{grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}}
`;
  function injectCSS() { if (document.getElementById('sp-css')) return; const st = document.createElement('style'); st.id = 'sp-css'; st.textContent = CSS; document.head.appendChild(st); }

  // ---------- helpers ----------
  // A canvas sized to its picture. Hi-res pictures (src.k: 2 fine pixels per art pixel) keep their fine bitmap; the CSS size is
  // art px x scale. With no scale, a canvas that no stylesheet sizes is pinned to the art size (pin), so it doesn't show twice as big.
  function put(cv, src, scale, pin) {
    if (cv.width !== src.width) cv.width = src.width;
    if (cv.height !== src.height) cv.height = src.height;
    cv._pk = src.k || 1; // (app.js snaps it to whole device pixels)
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(src, 0, 0, src.width, src.height);
    if (scale || pin) { const s = scale || 1; cv.style.width = PX.artW(src) * s + 'px'; cv.style.height = PX.artH(src) * s + 'px'; }
    cv.classList.add('px');
  }
  function hydrate(root) {
    const jobs = [];
    root.querySelectorAll('canvas[data-sp]').forEach(cv => {
      const [k, id] = cv.dataset.sp.split(':');
      let src = null;
      if (k === 'critter') src = PX.critter(id);
      else if (k === 'egg') src = PX.item('egg', id);
      else if (k === 'flower') src = PX.item('flower', id);
      else if (k === 'legend') src = legendPic(id, 32);
      else if (k === 'icon') src = PS.ui.icon(id);
      else if (k === 'book') src = bookIcon();
      else if (STYLE_KINDS.includes(k)) src = styleArt(k, id);
      if (!src) { jobs.push([cv]); return; }
      const scale = +cv.dataset.scale || 0;
      // (no scale and no stylesheet size: the canvas's CSS size is its bitmap, so pin the art size; read before any canvas changes)
      const pin = !scale && !!src.k && !cv.style.width && cv.isConnected && Math.abs(parseFloat(getComputedStyle(cv).width) - cv.width) < 0.5;
      jobs.push([cv, src, scale, pin]);
    });
    for (const [cv, src, scale, pin] of jobs) { delete cv.dataset.sp; if (src) put(cv, src, scale, pin); }
  }
  // paint tins, pattern stickers, hats, skins and gumballs come from shop.js (PS.styleArt), which falls back to stand-ins until pixel.js has them
  const STYLE_KINDS = ['gumball', 'paint', 'pattern', 'hat', 'skin'];
  function styleArt(kind, id) {
    try { if (PS.styleArt) return PS.styleArt.item(kind, id); } catch (e) { console.error(e); }
    try { return PX.item(kind, id); } catch (e) { return null; }
  }
  const PART_NAMES = { wings: 'Wings', ears: 'Long ears', fins: 'Fins', horns: 'Horns', tail: 'Tail', shell: 'Shell', antennae: 'Antennae', claws: 'Claws', spikes: 'Spikes',
    batwings: 'Bat wings', fairywings: 'Fairy wings', flamewings: 'Flame wings', dragonwings: 'Dragon wings', unihorn: 'Unicorn horn', multitail: 'Nine tails', fluff: 'Fluff',
    tentacles: 'Tentacles', spots: 'Star spots', petals: 'Petal collar', mushcap: 'Mushroom cap', leafears: 'Leaf ears', vines: 'Vines', thorns: 'Thorns' };
  const partName = p => PART_NAMES[p] || (p.charAt(0).toUpperCase() + p.slice(1));
  // mirrors state.js PART_RACE, for the "helps" hint on body parts
  const PART_HELPS = { ears: 'Run', fins: 'Swim', tentacles: 'Swim', horns: 'Climb', claws: 'Climb', spikes: 'Climb', wings: 'Fly', batwings: 'Fly', fairywings: 'Fly', flamewings: 'Fly', dragonwings: 'Fly', shell: 'Stamina', leafears: 'Run', vines: 'Climb', thorns: 'Climb', petals: 'Fly', mushcap: 'Stamina' };
  const elChip = el => { const E = D.ELEMENTS[el] || D.ELEMENTS.normal; return `<span class="sp-chip" style="background:${E.color}">${E.label}</span>`; };
  const NATURE = { sun: 'Sun', moon: 'Moon', wild: 'Wild' };
  const creature = id => D.ANIMALS[id] || D.RARES[id];
  const areaName = a => (D.AREAS[a] || D.AREAS.meadow).name;
  // the Legend Challenges (battle.js PS.battle.legends(): easiest first, with wins and whether each is open yet)
  const LEG = () => { try { return (PS.battle && typeof PS.battle.legends === 'function' && PS.battle.legends()) || []; } catch (e) { return []; } };
  const legendOf = id => LEG().find(L => L.id === id) || null;
  // a Legend's picture: the newer ones are drawn by art-legends.js at the size asked for, the older ones are rare creatures
  function legendPic(id, box) { const L = legendOf(id); if (L && L.art === 'legend' && typeof PX.legend === 'function') { const c = PX.legend(id, 'idle', box || 32); if (c) return c; } return PX.critter(id); }

  // animated sprites: registered per render, redrawn only when their pose changes
  let anims = [];
  function animSprite(cv, look, scale, opts) {
    opts = opts || {};
    const a = { cv, look, scale, phase: opts.phase || Math.random() * 3, key: '', happyUntil: 0, flap: !!opts.flap };
    anims.push(a); drawAnim(a, 0); return a;
  }
  function drawAnim(a, t) {
    const f = Math.floor((t + a.phase) / 0.55) % 2;
    const blink = ((t + a.phase * 1.7) % 3.6) < 0.14;
    const happy = t < a.happyUntil;
    const pose = { frame: f };
    if (a.flap) pose.flap = true;
    if (happy) { pose.eyes = 'happy'; pose.mouth = 'open'; pose.arms = 'up'; }
    else if (blink) pose.eyes = 'blink';
    const key = JSON.stringify(pose);
    if (key === a.key) return;
    a.key = key;
    put(a.cv, PX.sprig(a.look, pose), a.scale);
  }
  const hasWings = s => Object.keys(s.parts || {}).some(p => /wings$/.test(p) && s.parts[p] > 0);

  // ---------- list ----------
  // view: 'list' (a tab of the book), 'page' (one book entry) or 'detail' (one of your Sprouts)
  let root, view = 'list', curId = null, visible = false, dirty = false, clock = 0, listTab = 'mine', listTop = 0, backTo = 'list';
  function mineHTML() {
    const S = PS.S, list = S.sprouts.slice().sort((a, b) => (b.id === S.activeId) - (a.id === S.activeId) || (a.born || 0) - (b.born || 0));
    const rows = list.map(s => {
      const fi = state.formInfo(s), tl = state.totalLevels(s), partner = s.id === S.activeId;
      return `<button class="sp-row ${partner ? 'partner' : ''}" data-open="${s.id}">
        <div class="sp-pic"><canvas data-anim="${s.id}"></canvas></div>
        <div><b>${esc(s.name)}${partner ? '<span class="sp-tag">Partner</span>' : ''}</b>
          <small>${esc(fi.name)} \u00b7 ${esc(areaName(s.area))}</small>${s.home ? `<small>Resting in the ${esc(state.homeName(s.area))}</small>` : ''}
          <div class="sp-chips">${state.elementsOf(s).map(elChip).join('')}${skinBadge(s)}${shinyBadge(s)}</div></div>
        <div class="sp-lv"><span class="num">${tl}</span><span>Level</span></div>
      </button>`;
    }).join('');
    const eggs = S.eggs.map(e => {
      const E = D.EGGS[e.kind] || D.EGGS.meadow, left = Math.max(0, (E.taps || 5) - (e.taps || 0));
      return `<div class="sp-egg"><div class="sp-pic"><canvas data-sp="egg:${e.kind}" data-scale="2"></canvas></div>
        <div><b>${esc(E.name)}</b><small>In the ${esc(areaName(e.area))}${e.source ? ' \u00b7 ' + esc(e.source) : ''}</small><small>${left} ${left === 1 ? 'tap' : 'taps'} to hatch</small></div>
        <button class="btn primary" data-hatch="${e.id}">Go hatch</button></div>`;
    }).join('');
    return `${S.sprouts.length ? `<div class="sp-list">${rows}</div>` : `<div class="panel sp-empty"><b class="px-title" style="font-size:20px">No Sprouts yet</b><p>Your first egg is waiting in the Garden. Tap it until it hatches.</p><button class="btn primary" data-go-garden>Go to the Garden</button></div>`}
      ${S.eggs.length ? `<div class="sp-lbl">Eggs waiting <span class="n">${S.eggs.length}</span></div><div class="sp-list">${eggs}</div>` : ''}`;
  }

  // ---------- the Sprout Book: every egg, garden animal and look, found (in colour) or still to find (a silhouette) ----------
  // A "found" entry is remembered in PS.S.seen as 'bk:<kind>:<id>' (beside the 'animal:' / 'rare:' keys the game already writes),
  // so selling a Sprout or using up a paint tin never takes a page away. "Seen" entries (a named silhouette) are ones you can
  // already go and get: shop things, gumball prizes, and animals of the areas you have been to; the rest show as "???".
  // Every PRIZE_EVERY entries pays PRIZE_COINS once; PS.S.bookPrize (optional number) remembers how many prizes were given.
  const PRIZE_EVERY = 10, PRIZE_COINS = 100;
  let IDS = null;
  function ids() {
    if (IDS) return IDS;
    const area = D.AREA_ORDER.filter(k => D.EGGS[k]), e = area.concat(Object.keys(D.EGGS).filter(k => !area.includes(k)));
    const a = [];
    for (const ar of D.AREA_ORDER) {
      const here = Object.keys(D.ANIMALS).filter(id => D.ANIMALS[id].area === ar);
      a.push(...here.filter(id => D.ANIMALS[id].kind !== 'plant'), ...here.filter(id => D.ANIMALS[id].kind === 'plant'));
    }
    a.push(...Object.keys(D.ANIMALS).filter(id => !a.includes(id)), ...Object.keys(D.RARES));
    const p = Object.keys(D.COLORS), s = Object.keys(D.PATTERNS).filter(k => k !== 'plain');
    const h = Object.keys(D.HATS).sort((x, y) => (D.HATS[x].slot === 'extra') - (D.HATS[y].slot === 'extra'));
    const g = LEG().map(L => L.id); // Legends (kind 'g'): pages on the Animals tab, after the rare creatures
    const out = { e, a, p, s, h, g, eggs: e.map(i => 'e:' + i), animals: a.map(i => 'a:' + i).concat(g.map(i => 'g:' + i)), looks: p.map(i => 'p:' + i).concat(s.map(i => 's:' + i), h.map(i => 'h:' + i)) };
    if (g.length) IDS = out; // (kept once the Battle screen has listed its Legends)
    return out;
  }
  const validEntry = (k, id) => !!(ids()[k] && ids()[k].includes(id));
  const tabOf = k => (k === 'e' ? 'eggs' : k === 'a' || k === 'g' ? 'animals' : 'looks');
  function entryName(k, id) {
    if (k === 'e') return (D.EGGS[id] || {}).name || id;
    if (k === 'a') return (creature(id) || {}).name || id;
    if (k === 'g') return (legendOf(id) || {}).name || id;
    if (k === 'p') return D.COLORS[id] || id;
    if (k === 's') return D.PATTERNS[id] || id;
    return (D.HATS[id] || {}).name || id;
  }
  const artKey = (k, id) => (k === 'e' ? 'egg:' : k === 'a' ? 'critter:' : k === 'g' ? 'legend:' : k === 'p' ? 'paint:' : k === 's' ? 'pattern:' : 'hat:') + id;
  const artScale = (k, id) => (k === 'e' ? 3 : k === 'a' ? (D.RARES[id] ? 2 : 3) : k === 'g' ? 2 : 4);
  // everything this player has found: remembered keys plus what they have right now
  function scan() {
    const S = PS.S || {}, seen = S.seen && typeof S.seen === 'object' ? S.seen : {}, it = S.items && typeof S.items === 'object' ? S.items : {};
    const f = { e: new Set(), a: new Set(), p: new Set(), s: new Set(), h: new Set(), g: new Set() }, now = [];
    for (const k in seen) {
      if (!seen[k]) continue;
      if (k.startsWith('bk:')) { const kind = k.charAt(3); if (f[kind]) f[kind].add(k.slice(5)); }
      else if (k.startsWith('animal:')) f.a.add(k.slice(7));
      else if (k.startsWith('rare:')) f.a.add(k.slice(5));
    }
    const add = (kind, id) => { if (!f[kind].has(id)) { f[kind].add(id); now.push(kind + ':' + id); } };
    for (const s of Array.isArray(S.sprouts) ? S.sprouts : []) {
      if (!s || typeof s !== 'object') continue;
      if (D.EGGS[s.kind]) add('e', s.kind);
      for (const id in (s.absorbed && typeof s.absorbed === 'object' ? s.absorbed : {})) if (creature(id)) add('a', id);
      if (s.bornWith && creature(s.bornWith)) add('a', s.bornWith);
      const L = s.look && typeof s.look === 'object' ? s.look : {};
      if (!L.skin && D.COLORS[L.body]) add('p', L.body);
      if (L.pattern && L.pattern !== 'plain' && D.PATTERNS[L.pattern]) add('s', L.pattern);
      for (const sl of ['hat', 'extra']) if (D.HATS[L[sl]]) add('h', L[sl]);
    }
    for (const id of Array.isArray(S.pouch) ? S.pouch : []) if (creature(id)) add('a', id);
    for (const L of LEG()) if (L.wins > 0) add('g', L.id); // a Legend's page is found by beating it
    for (const id in (it.paints || {})) if (D.COLORS[id]) add('p', id);
    for (const id in (it.patterns || {})) if (id !== 'plain' && D.PATTERNS[id]) add('s', id);
    for (const id in (it.hats || {})) if (it.hats[id] && D.HATS[id]) add('h', id);
    return { f, now };
  }
  // note down newly found entries, so they stay found
  function sync() {
    const S = PS.S; if (!S || !S.seen || typeof S.seen !== 'object' || Array.isArray(S.seen)) return false;
    const { now } = scan(); if (!now.length) return false;
    for (const k of now) S.seen['bk:' + k] = true;
    PS.save(); return true;
  }
  function visitedAreas() {
    const S = PS.S || {}, v = new Set(['meadow']); if (D.AREAS[S.area]) v.add(S.area);
    for (const s of S.sprouts || []) if (s && s.area) v.add(s.area);
    for (const e of S.eggs || []) if (e && e.area) v.add(e.area);
    return v;
  }
  function seenOf(k, id, vis) {
    if (k === 'a') { const A = D.ANIMALS[id]; return !A || vis.has(A.area); } // (rares sit in the Shop)
    if (k === 'e') return !D.AREAS[id] || vis.has(id) || (PS.S.eggs || []).some(e => e && e.kind === id);
    if (k === 'g') { const L = legendOf(id); return !!(L && L.unlocked); } // (a Legend you can already challenge shows its name)
    return true; // paint and stickers are in the Shop, hats in the Gumball machine
  }
  function counts(sc) {
    const I = ids(), f = (sc || scan()).f, n = k => I[k].filter(id => f[k].has(id)).length;
    const c = { eggs: n('e'), eggsAll: I.e.length, animals: n('a') + n('g'), animalsAll: I.a.length + I.g.length, paints: n('p'), paintsAll: I.p.length, stickers: n('s'), stickersAll: I.s.length, hats: n('h'), hatsAll: I.h.length };
    c.looks = c.paints + c.stickers + c.hats; c.looksAll = c.paintsAll + c.stickersAll + c.hatsAll;
    c.entries = c.eggs + c.animals + c.looks; c.total = Math.max(1, c.eggsAll + c.animalsAll + c.looksAll);
    c.pct = Math.floor(c.entries / c.total * 100);
    return c;
  }
  const prizeGot = () => Math.max(0, Math.floor(+(PS.S && PS.S.bookPrize) || 0));
  const prizeDue = c => Math.floor((c || counts()).entries / PRIZE_EVERY) > prizeGot();
  // the book on the nav bar gets a dot while a prize is waiting
  let badgeT = 0;
  function badgeSoon() {
    if (badgeT) return;
    badgeT = setTimeout(() => { badgeT = 0; try { const b = document.querySelector('#nav [data-go="sprouts"] .badge'); if (b) b.hidden = !prizeDue(); } catch (e) { /* no nav */ } }, 1200);
  }

  // ---------- fun facts (our own short one-liners, easy to read aloud) ----------
  const FACTS = {
    e: { meadow: 'Meadow Eggs smell like fresh grass after rain.', beach: 'Hold a Beach Egg up to your ear. It sounds like waves!', moonlit: 'Moonlit Eggs glow a tiny bit in the dark.',
      candy: "Candy Eggs smell sweet, but please don't lick them!", golden: 'A Golden Egg shines like a little piece of the sun.', rainbow: 'Every stripe on a Rainbow Egg is a different wish.',
      crystal: 'Tap a Crystal Egg and it rings like a tiny bell.', pumpkin: 'Pumpkin Eggs grin a little wider every night.', ghost: 'A Ghost Egg is so light it floats when nobody looks.',
      mummy: 'Mummy Eggs come wrapped up snug, like a present.', candycorn: 'Yellow, orange, white: Candy Corn Eggs have three stripes.', vampire: 'Vampire Eggs like to sleep all day long.',
      witch: 'A Witch Egg hums a spooky little tune.', dragon: 'Dragon Eggs feel warm, like a cozy cup of cocoa.', eclipse: 'Half sun, half moon: the most Solunar egg of all!',
      starry: 'Look closely: a Starry Egg has a whole night sky inside.', frost: 'A Frost Egg makes tiny snowflakes when it wiggles.', blossom: 'Blossom Eggs smell like spring flowers.',
      pearl: 'Pearl Eggs come from the bottom of the sea.' },
    a: { sparrow: 'Sparrows chirp good morning to the whole garden.', hare: 'A hare can hop farther than three Sprouts in a row.', ram: 'Rams bonk heads to say hello. Bonk!',
      tortoise: 'Tortoises carry their house everywhere they go.', fox: 'Foxes tiptoe so quietly that even the moon can\'t hear them.', bee: 'Bees do a wiggle dance to show friends where flowers are.',
      duck: 'Ducks have waterproof feathers. Rain just rolls off!', koi: 'Some koi grow longer than your arm.', owl: 'Owls can turn their heads almost all the way round.',
      firefly: 'Fireflies blink their lights to say hi to each other.', crab: 'Crabs walk sideways, and they are very good at it.', seagull: 'Seagulls love snacks. Hold on to yours!',
      otter: "Otters hold paws so they don't float apart while they nap.", seal: 'Seals can sleep in the water, floating like a log.', dolphin: 'Dolphins call each other with whistles, like names.',
      starfish: 'A starfish can grow a new arm if it loses one.', seaturtle: 'Sea turtles swim across whole oceans.', bat: 'Bats sleep upside down, holding on with their feet.',
      wolf: 'Wolves howl together like a big singing family.', moth: 'Moths smell things with their fuzzy feelers.', hedgehog: 'Baby hedgehogs are called hoglets!',
      jellyfish: 'Jellyfish have no bones at all. Wobble, wobble!', gummybear: 'Gummy Bears bounce when they fall over.', cottonsheep: 'Cotton Sheep get a little smaller when it rains.',
      lollisnail: 'A Lolli Snail leaves a sticky, sweet trail.', sugarfinch: 'Sugar Finches sneeze sprinkles. Achoo!', sodafish: 'Soda Fish blow fizzy bubbles that go pop!',
      jellyocto: 'A Jelly Octopus can give eight wobbly hugs at once.', frog: 'Frogs drink water through their skin.', squirrel: 'Squirrels hide nuts and forget where some of them are.',
      butterfly: 'Butterflies taste with their feet!', pelican: "A pelican's beak has a stretchy pouch, like a net.", seahorse: 'Seahorse dads carry the babies.',
      pufferfish: 'Pufferfish puff up like a balloon to look big.', raccoon: 'Raccoons have clever little hands that can open lids.', anglerfish: 'An anglerfish has its own night light on its head.',
      moondeer: 'Moon Deer only come out to play under a bright moon.', marshbunny: 'Marsh Bunnies turn toasty brown near a campfire.', chocomouse: 'Choco Mice leave tiny cocoa footprints.',
      sunbuddy: 'Sunny Sunflower naps when clouds cover the sun.', shroomy: 'Shroomy loves rainy days the best.', puffball: 'Make a wish and blow! Dandelion Puff loves to fly.',
      cloverkin: 'Finding a four-leaf clover is super lucky!', peapod: 'Pea Popper can pop five peas in one breath.', cactling: 'Cactlings drink one big gulp and stay full for weeks.',
      kelpie: 'Kelp can grow taller than a house, way down under the sea.', coconut: 'Coconuts can float across the sea to brand new islands.', glowcap: 'Glowcaps light the path for night walkers.',
      snapvine: 'Snapvine snaps at flies, never at friends.', moonlotus: 'Moon Lotus closes up tight when the sun comes out.', lollibloom: 'Lollibloom gets sweeter every time it rains.',
      marshroom: 'A Marshroom is soft enough to use as a pillow.', licovine: 'Licorice Vine can tie itself into a bow.', sugarlily: 'Sugar Lily floats on soda bubbles.',
      licoriceeel: 'Licorice Eels twist into loops just for fun.',
      fairy: 'Fairies leave a trail of sparkles wherever they fly.', unicorn: "A unicorn's horn shines every color of the rainbow.", kitsune: 'A kitsune grows a new tail every hundred years.',
      yeti: 'Yetis are big and fluffy, and they give the best hugs.', griffin: 'A griffin is half eagle and half lion.', dinosaur: 'Some real dinosaurs were as small as a chicken!',
      kraken: 'The Kraken is shy. It hides way down in the deep sea.', phoenix: 'A phoenix is born again from warm, glowing embers.', dragon: 'Dragons keep their treasure warm by sleeping on it.' },
    g: { golem: 'Birds love to nap in the Golem\'s mossy hands.', yeti: 'The Yeti\'s biggest snowball was as tall as a house!', griffin: 'The Griffin can fly higher than the highest cloud.',
      dinosaur: 'One swing of its tail can shake the whole jungle!', kraken: 'The Kraken has eight arms, so it can give eight hugs.', phoenix: 'When the Phoenix faints, it rises again from warm embers.',
      dragon: 'The Dragon breathes fire every third turn. Be ready!', stormwhale: 'The Storm Whale sings so loudly that the thunder sings along.',
      moonwolf: 'When the Moon Wolf howls, the stars come out to listen.', crystaltortoise: 'Its crystals grew during a thousand years of naps.',
      sunlion: 'Every morning, the Sun Lion roars the whole world awake.', starserpent: 'The First Star was shining long before the Sun and the Moon!' },
    p: { mint: 'Fresh as a mint leaf.', leaf: 'The green of a happy garden.', sky: 'The blue of a sunny sky.', peach: 'Soft and fuzzy, like a peach.', rose: 'Pink like a rose petal.',
      sun: 'Bright yellow, like sunshine.', berry: 'Juicy red, like a ripe berry.', plum: 'Deep purple, like a plum.', cloud: 'Fluffy white, like a cloud.', slate: 'Cool gray, like a river stone.',
      night: 'Dark blue, like the night sky.', clay: 'Warm orange-brown, like a flower pot.', moss: 'Soft green, like moss on a log.', cocoa: 'Brown, like a mug of cocoa.',
      lilac: 'Light purple, like lilac flowers.', teal: 'Blue-green, like a lagoon.', coral: 'Pinky orange, like coral in the sea.', lemon: 'Zesty yellow, like a lemon.',
      lime: 'Zingy green, like a lime.', ocean: 'Deep blue, like the ocean.', cherry: 'Bright red, like a cherry.', cream: 'Smooth and pale, like vanilla cream.',
      charcoal: 'Dark gray, like a storm cloud.', tangerine: 'Orange, like a tangerine.', bubblegum: 'Pink like bubblegum. Pop!', aqua: 'Clear blue, like a swimming pool.',
      sand: 'Warm tan, like beach sand.', forest: 'Dark green, like a deep forest.', periwinkle: 'Blue with a little purple, like a periwinkle flower.', orchid: 'Pink-purple, like an orchid.',
      blush: 'Soft pink, like rosy cheeks.', raspberry: 'Sweet red, like a raspberry.' },
    s: { spots: 'No two spotty Sprouts have the very same spots.', stripes: 'Stripes make a Sprout look extra speedy.', twotone: 'Two colors are better than one!',
      mask: 'A mask for a sneaky superhero Sprout.', star: 'A shiny star right on the tummy.', freckles: 'Freckles are little kisses from the sun.', heart: 'A big heart on the tummy, full of love.',
      socks: 'Cozy socks that never get lost in the wash.', zigzag: 'Zig, zag, zig, zag, like a lightning bolt!', patches: 'Patches like a snuggly quilt.', tiger: 'Rawr! Stripes like a big jungle cat.',
      moonmark: 'A little moon that shines on the forehead.' },
    h: { bow: 'A big bow makes any Sprout look ready for a party.', flower: 'This flower clip never wilts.', leafcap: 'A leaf cap keeps the rain off. Drip, drop!',
      beanie: 'Beanies keep ears cozy on chilly nights.', cap: 'Wear it backwards to look extra cool.', party: 'Party hats make every day feel like a birthday.',
      sunhat: 'A sun hat makes a shady spot wherever you go.', tophat: 'Tip your top hat to say hello!', wizard: 'This hat is full of stars and tiny spells.',
      witch: 'The pointy tip is great for catching moonbeams.', crown: 'Only the bravest Sprouts wear a crown.', star: 'A little star that follows you everywhere.',
      moon: 'A tiny moon charm for night owls.', halo: 'A glowing ring for the kindest Sprouts.', flowercrown: 'Made from flowers picked in the Meadow.',
      bandana: 'Ready for a big adventure!', headphones: 'Now your Sprout can hear the garden music.', propeller: 'Spin, spin! It almost makes you fly.', heart: 'A heart charm full of love.' },
  };
  const WHERE = { land: 'on the grass', air: 'in the air', water: 'in the water', coast: 'by the water' };
  const WHEN = { day: 'by day', night: 'at night', any: 'day and night' };
  function howTo(k, id) {
    if (k === 'a') {
      const A = D.ANIMALS[id];
      if (A) return `Lives in the ${areaName(A.area)} ${WHEN[A.time] || ''}, ${WHERE[A.where] || 'outside'}. Catch it in the Garden!`;
      const R = D.RARES[id]; return R ? `Buy it in the Shop for ${fmt(R.price)} coins. Gumballs can have one too!` : '';
    }
    if (k === 'e') {
      const E = D.EGGS[id] || {}, gum = (D.FANCY_EGGS || []).includes(id) || (D.SPOOKY_EGGS || []).includes(id) || id === 'golden' || id === 'rainbow';
      if (D.AREAS[id]) return `Win it in races, or get one from gumballs. It hatches in the ${areaName(id)}.`;
      return `${E.price ? `Buy it in the Shop for ${fmt(E.price)} coins.` : 'Win it in a League.'}${gum ? ' Gumballs can have one too!' : ''}`;
    }
    if (k === 'g') { const L = legendOf(id); return !L ? '' : L.unlocked ? `Beat it in a Legend Challenge: go to Battle, then Legends. Best for Lv ${L.rec}+.` : `${L.lock}.`; }
    if (k === 'p') return 'Buy paint in the Shop, or win it from gumballs.';
    if (k === 's') return 'Buy stickers in the Shop, or win them from gumballs.';
    return id === 'witch' ? 'Win it from the Gumball machine, or hatch a Witch Egg.' : 'Win it from the Gumball machine.';
  }

  // ---------- the book's shelves ----------
  function tileCount(k, id, S) {
    if (k === 'e') return S.sprouts.filter(s => s.kind === id).length;
    if (k === 'a') return S.sprouts.reduce((n, s) => n + (+((s.absorbed || {})[id]) || 0), 0);
    if (k === 'g') return (legendOf(id) || {}).wins || 0;
    if (k === 'p') return +((S.items.paints || {})[id]) || 0;
    if (k === 's') return +((S.items.patterns || {})[id]) || 0;
    return 0;
  }
  function tileHTML(key, i, f, vis) {
    const k = key.charAt(0), id = key.slice(2), ok = f[k].has(id), sn = ok || seenOf(k, id, vis), nm = entryName(k, id), cnt = ok ? tileCount(k, id, PS.S) : 0;
    return `<button class="sp-ctile ${ok ? '' : sn ? 'seen' : 'unknown'}" data-entry="${key}" aria-label="${sn ? esc(nm) + (ok ? '' : ', not found yet') : 'Not found yet'}"><i class="sp-no">${i + 1}</i>${cnt ? `<span class="cnt">${cnt > 99 ? '99+' : cnt}</span>` : ''}
      <span class="sp-cpic"><canvas data-sp="${artKey(k, id)}" data-scale="${artScale(k, id)}"${ok ? '' : ` class="${ghost(k, sn)}"`}></canvas></span><b>${sn ? esc(nm) : '???'}</b></button>`;
  }
  // not found yet: a silhouette, except paint and stickers you can buy, which show faintly so their colours and shapes can be told apart
  const ghost = (k, sn) => (sn && (k === 'p' || k === 's') ? 'sp-ghost' : 'sp-sil');
  function shelf(title, icon, keys, all, f, vis) {
    const got = keys.filter(key => f[key.charAt(0)].has(key.slice(2))).length;
    return `<h3 class="sp-sect"><canvas data-sp="${icon}" data-scale="0"></canvas>${esc(title)}<span class="n num${got === keys.length ? ' all' : ''}">${got}/${keys.length}</span></h3>
      <div class="sp-coll">${keys.map(key => tileHTML(key, all.indexOf(key), f, vis)).join('')}</div>`;
  }
  function eggsHTML(f, vis) {
    const all = ids().eggs, area = all.filter(k => D.AREAS[k.slice(2)]);
    return shelf('Garden eggs', 'egg:meadow', area, all, f, vis) + shelf('Special eggs', 'egg:golden', all.filter(k => !area.includes(k)), all, f, vis);
  }
  function animalsHTML(f, vis) {
    const all = ids().animals;
    return D.AREA_ORDER.map(ar => shelf(areaName(ar), 'egg:' + ar, all.filter(k => (D.ANIMALS[k.slice(2)] || {}).area === ar), all, f, vis)).join('')
      + shelf('Rare creatures', 'critter:fairy', all.filter(k => k[0] === 'a' && D.RARES[k.slice(2)]), all, f, vis)
      + (ids().g.length ? shelf('Legends', 'icon:trophy', all.filter(k => k[0] === 'g'), all, f, vis) : '');
  }
  function looksHTML(f, vis) {
    const all = ids().looks;
    return shelf('Paint colors', 'paint:rose', all.filter(k => k[0] === 'p'), all, f, vis) + shelf('Stickers', 'pattern:star', all.filter(k => k[0] === 's'), all, f, vis)
      + shelf('Hats and charms', 'hat:party', all.filter(k => k[0] === 'h'), all, f, vis);
  }
  function headHTML(c) {
    const done = c.entries >= c.total, left = PRIZE_EVERY - (c.entries % PRIZE_EVERY), fill = PRIZE_EVERY - left;
    const chip = (ic, label, a, b) => `<span class="sp-pchip" aria-label="${label} ${a} of ${b}"><canvas data-sp="${ic}" data-scale="0"></canvas><span class="lbl">${label} </span><b class="num">${a}/${b}</b></span>`;
    return `<header class="panel sp-head sp-bookh"><canvas class="sp-bicon" data-sp="book:0" data-scale="0"></canvas>
        <div class="sp-hmain"><h1 class="px-title">Sprout Book</h1>
          <div class="sp-pg">${chip('egg:meadow', 'Eggs', c.eggs, c.eggsAll)}${chip('critter:hare', 'Animals', c.animals, c.animalsAll)}${chip('hat:party', 'Looks', c.looks, c.looksAll)}</div></div>
        <span class="sp-count num">${c.pct}%</span>
        <div class="sp-prize" aria-label="${done ? 'You found everything!' : `${left} more for a prize`}"><span class="sp-p10">${Array.from({ length: PRIZE_EVERY }, (_, i) => `<i class="${done || i < fill ? 'on' : ''}"></i>`).join('')}</span><canvas data-sp="icon:coin" data-scale="0"></canvas><small>${done ? 'All found!' : `${left} more!`}</small></div>
      </header>`;
  }
  const TABS = [['mine', 'icon:sprouts', 'My Sprouts'], ['eggs', 'egg:meadow', 'Eggs'], ['animals', 'critter:hare', 'Animals'], ['looks', 'hat:party', 'Looks']];
  function listHTML() {
    sync();
    const sc = scan(), c = counts(sc), vis = visitedAreas(), book = listTab !== 'mine';
    const body = listTab === 'eggs' ? eggsHTML(sc.f, vis) : listTab === 'animals' ? animalsHTML(sc.f, vis) : listTab === 'looks' ? looksHTML(sc.f, vis) : mineHTML();
    const tab = ([id, icon, label]) => `<button role="tab" data-ltab="${id}" aria-selected="${listTab === id}"><canvas data-sp="${icon}" data-scale="0"></canvas><span>${label}</span></button>`;
    return `<div class="sp-page"><div class="sp-pin">${headHTML(c)}
        <div class="sp-tabs" role="tablist" aria-label="Sprout Book">${TABS.map(tab).join('')}</div></div>
      <div class="sp-box"><div class="sp-wrap${book ? ' sp-wide' : ''}">
      ${body}
      ${book ? '' : `<div class="sp-acct"><button class="btn" data-players>Switch player</button><button class="btn" data-backup>Backups</button></div>
      <button class="sp-dev" data-dev>Parent tools</button>`}
    </div></div></div>`;
  }

  // prizes: every 10 entries; any already passed are given once, together, in one celebration
  let prizeBusy = false;
  function checkPrize() {
    if (!PS.S || prizeBusy || !visible || view !== 'list') return;
    sync();
    const c = counts(), due = Math.floor(c.entries / PRIZE_EVERY), got = prizeGot();
    if (due <= got) { badgeSoon(); return; }
    const pages = due - got, coins = pages * PRIZE_COINS;
    PS.S.bookPrize = due;
    try { state.addCoins(coins, 'book'); } catch (e) { PS.S.coins = (PS.S.coins || 0) + coins; }
    PS.save(); badgeSoon();
    const title = pages === 1 ? 'A Sprout Book prize!' : `${pages} Sprout Book prizes!`, sub = `${c.entries} things found. Here are ${fmt(coins)} coins!`;
    const art = (fn) => { try { return fn(); } catch (e) { return null; } };
    const o = { kind: 'book', title, sub, sprite: null, icon: bookIcon(), jingle: 'newpage', button: 'Yay!',
      tiles: [{ icon: art(() => PX.item('egg', 'meadow')), value: c.eggs, label: 'Eggs' }, { icon: art(() => PX.critter('hare')), value: c.animals, label: 'Animals' },
        { icon: art(() => styleArt('hat', 'party')), value: c.looks, label: 'Looks' }, { icon: art(() => PS.ui.icon('coin')), value: '+' + fmt(coins), label: 'Coins' }] };
    prizeBusy = true;
    const done = () => { prizeBusy = false; if (visible && view === 'list') render(true); };
    try { if (typeof PS.ui.celebrate === 'function') { Promise.resolve(PS.ui.celebrate(o)).then(done, done); return; } } catch (e) { /* fall back below */ }
    try { if (PX.Music && PX.Music.jingle) PX.Music.jingle('newpage'); else PX.Sound.play('chime'); } catch (e) { /* audio optional */ }
    PS.ui.modal({ eyebrow: 'Sprout Book', title, html: `<p>${esc(sub)}</p>`, buttons: [{ label: 'Yay!', kind: 'primary' }] });
    done();
  }

  // ---------- a page of the book ----------
  let pg = { kind: 'a', id: null }, turn = 0, pgHero = null, critHero = null;
  // what a page's Sprout looks like: your partner trying the paint, sticker or hat on; or what an egg hatches into
  function previewLook(k, id) {
    const act = state.active(), base = act ? PX.cloneLook(state.lookOf(act)) : PX.cloneLook(PX.DEFAULT_LOOK);
    if (k === 'e') {
      const E = D.EGGS[id] || {}, L = PX.cloneLook(PX.DEFAULT_LOOK);
      L.body = (E.bodies || [])[0] || L.body; if (E.skin) L.skin = E.skin; if (E.sparkle) L.eyes = 'sparkle';
      if (E.hat && D.HATS[E.hat]) L[D.HATS[E.hat].slot] = E.hat;
      return L;
    }
    delete base.shiny;
    if (k === 'p') { base.body = id; delete base.skin; }
    else if (k === 's') { base.pattern = id; base.noSpots = true; if (!base.patternColor || base.patternColor === '#fbf3dc' || base.patternColor === '#ffffff') base.patternColor = '#fff27a'; }
    else if (k === 'h') { const H = D.HATS[id]; if (H) base[H.slot] = id; }
    return base;
  }
  function mineFor(k, id) {
    const L = s => s.look || {};
    if (k === 'g') return [];
    const pick = k === 'e' ? s => s.kind === id : k === 'a' ? s => (s.absorbed || {})[id] > 0 : k === 'p' ? s => L(s).body === id && !L(s).skin : k === 's' ? s => L(s).pattern === id : s => L(s).hat === id || L(s).extra === id;
    return PS.S.sprouts.filter(pick);
  }
  function chipsHTML(k, id, ok) {
    const ch = (inner, cls) => `<span class="sp-ichip${cls ? ' ' + cls : ''}">${inner}</span>`;
    if (k === 'a') {
      const A = D.ANIMALS[id], R = D.RARES[id], C = A || R; if (!C) return '';
      const time = A ? (A.time === 'night' ? ch('<canvas data-sp="icon:moon"></canvas>Night') : A.time === 'day' ? ch('<canvas data-sp="icon:sun"></canvas>Day') : ch('<canvas data-sp="icon:sun"></canvas><canvas data-sp="icon:moon"></canvas>Day and night')) : '';
      const parts = A ? [A.part] : Object.keys(R.parts || {});
      return `<div class="sp-ichips">${elChip(C.el)}${A ? ch(`<canvas data-sp="egg:${A.area}"></canvas>${esc(areaName(A.area))}`) : ch('Rare', 'gold')}${time}${parts.filter(Boolean).map(p => ch('Grows ' + esc(partName(p)))).join('')}</div>`;
    }
    if (k === 'g') {
      const L = legendOf(id); if (!L) return '';
      return `<div class="sp-ichips">${L.els.map(elChip).join('')}${ch(`Legend \u00b7 Lv ${L.lv}`, 'gold')}${ok ? ch(`Beaten ${L.wins} time${L.wins === 1 ? '' : 's'}`) : ''}${L.egg && D.EGGS[L.egg] ? ch(`<canvas data-sp="egg:${L.egg}"></canvas>First win: ${esc(D.EGGS[L.egg].name)}`) : ''}</div>`;
    }
    if (k === 'e') {
      const E = D.EGGS[id] || {};
      return `<div class="sp-ichips">${ch(`<canvas data-sp="icon:sprouts"></canvas>${E.taps || 5} taps to hatch`)}${E.skin && D.SKINS[E.skin] ? ch(`${esc(D.SKINS[E.skin].name)} skin`, 'gold') : ''}${E.hatchWith && creature(E.hatchWith) ? ch(`<canvas data-sp="critter:${E.hatchWith}"></canvas>Comes with a ${esc(creature(E.hatchWith).name)}`) : E.hatchWith === 'random' ? ch('Comes with a rare creature') : ''}</div>`;
    }
    const have = k === 'p' ? +((PS.S.items.paints || {})[id]) || 0 : k === 's' ? +((PS.S.items.patterns || {})[id]) || 0 : 0;
    const what = k === 'p' ? 'Paint' : k === 's' ? 'Sticker' : (D.HATS[id] || {}).slot === 'extra' ? 'Charm' : 'Hat';
    return `<div class="sp-ichips">${ch(what)}${have ? ch(`You have ${have}`, 'gold') : k === 'h' && ok ? ch('In your closet', 'gold') : ''}</div>`;
  }
  function givesHTML(k, id) {
    const C = k === 'a' && creature(id); if (!C || !C.gives) return '';
    const g = D.STATS.filter(st => C.gives[st]).sort((a, b) => C.gives[b] - C.gives[a]);
    return `<div class="sp-gives">${g.map(st => { const v = C.gives[st], M = D.STAT_META[st]; return `<span class="sp-give${v < 0 ? ' neg' : ''}" style="background:${M.color}">${esc(M.label)} ${v > 0 ? '+' : ''}${v}</span>`; }).join('')}</div>`;
  }
  function pageBtnsHTML(k, id, ok) {
    const b = [];
    if (k === 'a') { const A = D.ANIMALS[id]; if (A) b.push(`<button class="btn go" data-areago="${A.area}"><canvas data-sp="egg:${A.area}"></canvas>Go to the ${esc(areaName(A.area))}</button>`); else b.push('<button class="btn primary" data-shopgo="rare"><canvas data-sp="icon:shop"></canvas>Creatures in the Shop</button>'); }
    else if (k === 'e') { const E = D.EGGS[id] || {}; if (E.price) b.push('<button class="btn primary" data-shopgo="egg"><canvas data-sp="icon:shop"></canvas>Eggs in the Shop</button>'); else if (!ok) b.push('<button class="btn go" data-go-garden><canvas data-sp="icon:garden"></canvas>Go to the Garden</button>'); }
    else if (k === 'g') { const L = legendOf(id); b.push(`<button class="btn go" data-legendgo="${id}"><canvas data-sp="icon:battle"></canvas>${L && L.unlocked ? 'Challenge it!' : 'See the Legends'}</button>`); }
    else if (k === 'h') b.push('<button class="btn primary" data-gumball-go><canvas data-sp="gumball:6"></canvas>Gumball machine</button>');
    else b.push('<button class="btn primary" data-closet-go><canvas data-sp="icon:shop"></canvas>Buy paint &amp; stickers</button>');
    return `<div class="sp-pbtns">${b.join('')}</div>`;
  }
  function entryHTML(k, id, ok, sn, no) {
    const nm = sn ? entryName(k, id) : '???', A = D.ANIMALS[id];
    const bg = k === 'a' ? (A ? A.area : 'rare') : k === 'e' ? (D.AREAS[id] ? id : 'rare') : k === 'g' ? 'legend' : 'look';
    const showSprout = ok && k !== 'a' && k !== 'g';
    const hero = `<div class="sp-stagebox ${bg}"><span class="sp-where">#${no}</span>${showSprout ? `<canvas class="sp-item" data-sp="${artKey(k, id)}" data-scale="${k === 'e' ? 3 : 4}"></canvas>` : ''}<canvas data-pghero class="${ok ? '' : sn ? ghost(k, sn) : 'sp-sil deep'}" title="${ok ? 'Tap me!' : ''}"></canvas></div>`;
    const fact = (FACTS[k] || {})[id] || (k === 'a' ? (creature(id) || {}).blurb : k === 'e' ? (D.EGGS[id] || {}).desc : k === 'g' ? (legendOf(id) || {}).blurb : '') || `${entryName(k, id)} is part of your Sprout Book!`;
    const mine = ok ? mineFor(k, id) : [];
    const mineT = k === 'a' ? 'Bonded with' : k === 'e' ? 'Hatched from it' : k === 'h' ? 'Wearing it' : 'Your Sprouts with it';
    return `<section class="panel sp-paper ${turn > 0 ? 'turn-n' : turn < 0 ? 'turn-p' : ''}">${hero}
        <h2 class="sp-ptitle px-title">${esc(nm)}</h2>
        ${sn ? chipsHTML(k, id, ok) : ''}
        ${ok ? `<div class="sp-fact"><b>Fun fact</b><p>${esc(fact)}</p></div>${givesHTML(k, id)}`
        : `<div class="sp-fact locked"><b>${sn ? 'Not found yet' : 'A mystery!'}</b><p>${sn ? esc(howTo(k, id)) : 'Visit more of the garden to find out what this is!'}</p></div>${sn ? givesHTML(k, id) : ''}`}
        ${sn ? pageBtnsHTML(k, id, ok) : ''}
      </section>
      ${mine.length ? `<section class="panel sp-sec"><h2>${mineT} <span class="sp-aside">${mine.length}</span></h2><div class="sp-minelist">${mine.slice(0, 12).map(s => `<button class="sp-mine" data-open="${s.id}"><canvas data-mini="${s.id}"></canvas><b>${esc(s.name)}</b></button>`).join('')}</div></section>` : ''}
      ${ok && k === 'g' ? '<p class="sp-muted" style="text-align:center">Tap the Legend to hear it roar!</p>' : ''}
      ${ok && k !== 'a' && k !== 'g' ? `<p class="sp-muted" style="text-align:center">${k === 'e' ? 'Tap the Sprout to say hi!' : `Tap ${state.active() ? esc(state.active().name) : 'the Sprout'} to see it wiggle!`}</p>` : ''}`;
  }
  function pageHTML() {
    const list = ids()[tabOf(pg.kind)], key = pg.kind + ':' + pg.id, i = list.indexOf(key), sc = scan();
    const ok = sc.f[pg.kind].has(pg.id), sn = ok || seenOf(pg.kind, pg.id, visitedAreas());
    const back = { eggs: 'Eggs', animals: 'Animals', looks: 'Looks' }[tabOf(pg.kind)];
    return `<div class="sp-page"><div class="sp-pin"><div class="sp-pnav">
        <button class="btn sp-back" data-back>‹ ${back}</button><span class="sp-pno num">${i + 1} / ${list.length}</span>
        <button class="btn sp-arrow" data-pg="-1" aria-label="Previous page">‹</button><button class="btn sp-arrow" data-pg="1" aria-label="Next page">›</button>
      </div></div>
      <div class="sp-box"><div class="sp-wrap">${entryHTML(pg.kind, pg.id, ok, sn, i + 1)}</div></div></div>`;
  }
  function openPage(k, id, dir) {
    const sc = scrollBox();
    if (view === 'list' && sc) listTop = sc.scrollTop;
    pg = { kind: k, id }; turn = dir || 0; view = 'page'; render(false); turn = 0;
  }
  function flip(d) {
    const list = ids()[tabOf(pg.kind)], i = list.indexOf(pg.kind + ':' + pg.id), next = list[(i + d + list.length) % list.length];
    PX.Sound.play('tick');
    openPage(next.charAt(0), next.slice(2), d);
  }
  function setupPage() {
    const hero = root.querySelector('[data-pghero]'); if (!hero) return;
    const k = pg.kind, id = pg.id, ok = scan().f[k].has(id);
    try {
      if (ok && k !== 'a' && k !== 'g') { pgHero = animSprite(hero, previewLook(k, id), 4, { phase: 0 }); return; }
      if (k === 'g') { const src = legendPic(id, 40); put(hero, src, PX.artW(src) > 30 ? 4 : 5); return; }
      if (k === 'a') {
        const n = ok && PX.critterFrames ? PX.critterFrames(id) || 1 : 1, src = PX.critter(id, 0), sc = PX.artW(src) > 20 ? 4 : 5;
        put(hero, src, sc); critHero = { cv: hero, id, n, f: 0, sc };
        return;
      }
      put(hero, k === 'e' ? PX.item('egg', id) : styleArt(k === 'p' ? 'paint' : k === 's' ? 'pattern' : 'hat', id), k === 'e' ? 5 : 6);
    } catch (e) { console.error('book page', e); }
  }
  function heroTap() {
    const hero = root.querySelector('[data-pghero]'); if (!hero) return;
    const ok = scan().f[pg.kind].has(pg.id);
    if (!ok) { PX.Sound.play('tick'); return; }
    PX.buzz(8);
    if (pgHero) {
      pgHero.happyUntil = clock + 1.1;
      try { const act = state.active(); if (PX.Cry && PX.Cry.play && act && pg.kind !== 'e') { PX.Cry.play(act, { stage: act.stage || 0 }); return; } } catch (e) { /* fall back below */ }
      PX.Sound.play('coo'); return;
    }
    hero.classList.remove('sp-hop'); void hero.offsetWidth; hero.classList.add('sp-hop');
    if (pg.kind === 'g') { // a found Legend roars: its charging picture for a moment
      const id = pg.id, L = legendOf(id);
      if (L && L.art === 'legend' && typeof PX.legend === 'function') {
        try { const c = PX.legend(id, 'charge', 40); if (c) { put(hero, c, 4); clearTimeout(heroTap.t); heroTap.t = setTimeout(() => { if (hero.isConnected && pg.id === id) try { put(hero, legendPic(id, 40), 4); } catch (e) { /* stays */ } }, 1100); } } catch (e) { /* the hop is enough */ }
      }
      PX.Sound.play('thud'); return;
    }
    PX.Sound.play(pg.kind === 'a' ? 'coo' : 'pop');
  }
  // the book's own little icon (a green book with a leaf and a sun), made once
  let bookC = null;
  function bookIcon() {
    if (bookC) return bookC;
    // (drawn like the Sprouts: smooth shapes, soft shading, 1-fine-px lines and one outer ink ring)
    const g = new PX.Grid(16, 16), piece = draw => { const t = new PX.Grid(16, 16); draw(t); t.outline(); g.merge(t); };
    const fill = t => { const f = (x, y) => t.filled(x, y); f.fine = true; return f; };
    piece(t => { t.poly([[4.6, 1.2], [13.8, 1.2], [13.8, 14.8], [4.6, 14.8]], '#62a855'); t.sell(8.0, 6.0, 9.0, 11.0, ['#8fd46a', '#62a855', '#3f7a3a'], 0, fill(t)); });
    piece(t => t.poly([[2.8, 1.2], [4.8, 1.2], [4.8, 14.8], [2.8, 14.8]], '#3f7a3a'));
    g.dots([[13.25, 2.5], [13.25, 3.0], [13.25, 3.5], [13.25, 4.0], [13.25, 4.5], [13.25, 5.0], [13.25, 5.5], [13.25, 6.0], [13.25, 6.5], [13.25, 7.0], [13.25, 7.5], [13.25, 8.0], [13.25, 8.5], [13.25, 9.0], [13.25, 9.5], [13.25, 10.0], [13.25, 10.5], [13.25, 11.0], [13.25, 11.5], [13.25, 12.0], [13.25, 12.5], [13.25, 13.0], [13.25, 13.5]], '#fff8e6');
    g.dots([[3.75, 2.5], [3.75, 5.0], [3.75, 7.5], [3.75, 10.0], [3.75, 12.5]], '#62a855');
    piece(t => t.ell(9.4, 8.4, 2.6, 3.8, ['#d8f8b0', '#99e550', '#4f9e36'], 0.55));
    for (let i = 0; i <= 10; i++) { const u = i / 10; g.dot(8.0 + u * 2.7, 11.6 - u * 6.2, '#3f7a3a'); }
    piece(t => t.ell(11.6, 3.0, 1.15, 1.15, ['#fff27a', '#ffcc44', '#c7861c']));
    g.dots([[11.25, 2.5]], '#ffffff'); g.dots([[6.0, 2.5], [6.5, 2.5], [6.0, 3.0]], '#a6ec70');
    return (bookC = (PX.hd ? PX.hd(g) : g).canvas());
  }

  // ---------- detail ----------
  function statsHTML(s) {
    const rows = D.STATS.map(k => {
      const st = s.stats[k], M = D.STAT_META[k], max = st.lv >= D.GROWTH.maxLevel, need = D.GROWTH.xpForLevel(st.lv);
      const pct = max ? 100 : clamp(st.xp / need * 100, 0, 100);
      return `<div class="sp-stat"><span class="nm" style="color:${M.color}">${M.label}</span><span class="lv">Lv ${st.lv}</span>
        <div class="bar"><i style="width:${pct}%;background:${M.color}"></i></div>
        <span class="xp">${max ? 'Max level' : `${Math.floor(st.xp)} / ${need} XP to Lv ${st.lv + 1}`}</span></div>`;
    }).join('');
    return `<section class="panel sp-sec"><h2>Stats <span class="sp-aside">Total level ${state.totalLevels(s)}</span></h2>
      <p class="sp-note">Animals, fruit, races and battles give XP. Each level needs a bit more.</p><div class="sp-stats">${rows}</div></section>`;
  }
  function natureHTML(s) {
    const n = clamp(s.nature || 0, -100, 100), nk = state.natureKind(s);
    const say = nk === 'sun' ? 'It has a <b>Sun</b> nature: cheerful and bright.' : nk === 'moon' ? 'It has a <b>Moon</b> nature: cool and mysterious.' : 'Its nature is <b>Wild</b>: somewhere in between.';
    return `<section class="panel sp-sec"><h2>Nature <span class="sp-aside">${n > 0 ? '+' : ''}${Math.round(n)}</span></h2>
      <p class="sp-note">Petting, day animals and Sun Pears pull toward Sun. Night animals, Moon Plums and rough handling pull toward Moon.</p>
      <div class="sp-nat" role="img" aria-label="Nature ${Math.round(n)} from Moon -100 to Sun +100"><i style="left:${(n + 100) / 2}%"></i></div>
      <div class="sp-nat-l"><span><canvas data-sp="icon:moon"></canvas>Moon</span><span>Wild</span><span>Sun<canvas data-sp="icon:sun"></canvas></span></div>
      <p class="sp-nat-now">${say} Past ${D.EVO.sunNature} it counts as Sun; below ${D.EVO.moonNature}, Moon.</p></section>`;
  }
  function evoHTML(s) {
    const E = D.EVO, tl = state.totalLevels(s), nk = state.natureKind(s), stage = s.stage || 0;
    const budForm = stage === 1 ? s.form : stage === 2 && s.flower && D.FLOWERS[s.flower] ? D.FLOWERS[s.flower].nature + 'bud' : nk + 'bud';
    const flowerNow = stage === 2 && s.flower ? s.flower : Object.keys(D.FLOWERS).find(k => D.FLOWERS[k].area === s.area && D.FLOWERS[k].nature === nk) || 'daisy';
    const F = D.FLOWERS[flowerNow];
    const cls = i => (i < stage ? 'done' : i === stage ? 'now' : 'next');
    const sub = i => (i < stage ? 'Done' : i === stage ? 'Now' : i === 1 ? `At level ${E.budAt}` : `At level ${E.bloomAt}`);
    const names = ['Seedling', (D.FORMS[budForm] || D.FORMS.wildbud).name, F.name];
    const track = [0, 1, 2].map(i => `<div class="st ${cls(i)}"><div class="pic"><canvas data-evo="${i}"></canvas></div><b>${esc(names[i])}</b><small>${sub(i)}</small></div>`)
      .join('<div class="arr">\u203a</div>');
    let bar = '';
    if (stage < 2) {
      const goal = stage === 0 ? E.budAt : E.bloomAt, from = stage === 0 ? 0 : E.budAt;
      const pct = clamp((tl - from) / (goal - from) * 100, 0, 100);
      bar = `<div class="sp-evo-bar"><div class="row"><span>${stage === 0 ? 'Becomes a Bud' : 'Blooms'} at total level <b>${goal}</b></span><b class="num">${tl} / ${goal}</b></div>
        <div class="bar"><i style="width:${pct}%;background:var(--accent)"></i></div></div>
        <p class="sp-muted">${stage === 0 ? `Its bud follows its nature when it evolves. Right now that would be a <b>${esc(names[1])}</b>.` : ''}
        If it bloomed right now it would become a <b>${esc(F.name)}</b>. Blooms depend on where it lives and its nature.</p>`;
    } else {
      bar = `<p class="sp-muted">Fully bloomed as a <b>${esc(state.formInfo(s).name)}</b>. Its title comes from its strongest stat (${D.STAT_META[state.domStat(s)].label}).</p>`;
    }
    const trio = Object.keys(D.FLOWERS).filter(k => D.FLOWERS[k].area === s.area)
      .sort((a, b) => ['moon', 'wild', 'sun'].indexOf(D.FLOWERS[a].nature) - ['moon', 'wild', 'sun'].indexOf(D.FLOWERS[b].nature))
      .map(k => `<div class="sp-flower ${k === flowerNow ? 'pick' : ''}"><canvas data-sp="flower:${k}"></canvas><b>${esc(D.FLOWERS[k].name)}</b><small>${k === flowerNow ? (stage === 2 ? 'Its bloom' : 'Heading here') : NATURE[D.FLOWERS[k].nature] + ' nature'}</small></div>`).join('');
    return `<section class="panel sp-sec"><h2>Evolution <span class="sp-aside">Stage ${stage + 1} of 3</span></h2><div class="sp-evo">${track}</div>${bar}
      <div class="sp-lbl" style="margin:12px 0 0">${esc(areaName(s.area))} blooms</div><div class="sp-flowers">${trio}</div>
      ${stage < 2 ? `<p class="sp-muted">Moving it to another area before it blooms changes which flower it becomes.</p>` : ''}</section>`;
  }
  // ---------- fold-away sections: a short summary until tapped open ----------
  const openSecs = new Set();
  function foldSec(id, title, aside, summary, body) {
    const open = openSecs.has(id);
    return `<section class="panel sp-sec sp-fold ${open ? 'open' : ''}">
      <button class="sp-fold-h" data-fold="${id}" aria-expanded="${open}"><h2>${title}${aside ? ` <span class="sp-aside">${aside}</span>` : ''}</h2><span class="sp-chev" aria-hidden="true">\u25be</span></button>
      ${open ? `<div class="sp-fold-body">${body}</div><button class="sp-fold-less" data-fold="${id}">Show less \u25b4</button>` : `<div class="sp-fold-sum" data-fold="${id}">${summary}<span class="sp-more">Tap to see more \u25be</span></div>`}</section>`;
  }
  function moveHTML(id, o) {
    o = o || {};
    const m = D.MOVES[id]; if (!m) return '';
    const E = D.ELEMENTS[m.el] || D.ELEMENTS.normal;
    const pow = m.pow ? (m.fx.hits ? `${m.pow}\u00d7${m.fx.hits}` : m.pow) : '';
    const pw = o.locked ? `<span class="sp-lock">Unlocks at ${o.unlockAt} bonded</span>` : `${pow ? 'Pow ' + pow + ' \u00b7 ' : 'Support \u00b7 '}${Math.round(m.acc * 100)}%`;
    if (o.compact) return `<div class="sp-move compact ${o.inBattle ? 'battle' : ''} ${o.locked ? 'locked' : ''}" title="${esc(m.desc)}"><i style="background:${E.color}"></i><b>${esc(m.name)}${o.inBattle ? '<span class="sp-inb">In battle</span>' : ''}</b><span class="pw">${pw}</span></div>`;
    return `<div class="sp-move ${o.active ? 'active' : ''} ${o.locked ? 'locked' : ''}"><i style="background:${E.color}"></i><b>${esc(m.name)}</b><span class="pw">${pw}</span><small>${E.label} \u00b7 ${esc(m.desc)}</small></div>`;
  }
  function movesHTML(s) {
    const active = state.movesOf(s), known = state.knownMoves(s), fi = state.formInfo(s);
    const groups = [];
    for (const k of known) { let g = groups.find(x => x.from === k.from); if (!g) groups.push(g = { from: k.from, list: [] }); g.list.push(k); }
    const byName = {}; for (const [aid, n] of Object.entries(s.absorbed || {})) { const c = creature(aid); if (c) byName[c.name] = { aid, n }; }
    const grp = groups.map((g, i) => {
      const a = byName[g.from];
      const title = i === 0 ? `${esc(g.from)} form` : `<canvas data-sp="critter:${a ? a.aid : ''}"></canvas>${esc(g.from)}${a ? ` \u00b7 bonded ${a.n}` : ''}`;
      return `<div class="sp-grp"><h3>${title}</h3><div class="sp-moves">${g.list.map(k => moveHTML(k.id, { compact: true, locked: k.locked, unlockAt: k.unlockAt, inBattle: !k.locked && active.includes(k.id) })).join('')}</div></div>`;
    }).join('');
    const chips = active.map(id => { const m = D.MOVES[id]; if (!m) return ''; const E = D.ELEMENTS[m.el] || D.ELEMENTS.normal; return `<span class="sp-mchip"><i style="background:${E.color}"></i>${esc(m.name)}</span>`; }).join('');
    const body = `<p class="sp-note">${s.moveset ? `You picked the ${active.length} moves it uses in battle.` : `The game picks its battle moves: its ${fi.short} form's 3 moves plus the best move of its top animal.`} You can choose any ${state.MAX_MOVES || 4} moves it knows.</p>
      <div class="sp-lbl" style="margin:0 0 6px">Battle moves</div>
      <div class="sp-moves" style="margin-top:0">${active.map(id => moveHTML(id, { active: true })).join('')}</div>
      <button class="btn primary" data-pick-moves style="width:100%;margin-top:10px">Choose battle moves</button>
      <div class="sp-grp"><h3>Elements</h3><div style="display:flex;gap:5px;flex-wrap:wrap">${state.elementsOf(s).map(elChip).join('')}</div></div>
      <div class="sp-lbl" style="margin:16px 0 -6px">Every move it knows</div>
      ${grp}`;
    return foldSec('moves', 'Moves', `${known.filter(k => !k.locked).length} known`, `<div class="sp-mchips">${chips}</div>`, body);
  }
  function bondsHTML(s) {
    const e = Object.entries(s.absorbed || {}).filter(([id]) => creature(id));
    if (!e.length) return `<section class="panel sp-sec"><h2>Bonded animals</h2><p class="sp-muted">None yet. Catch animals in the Garden and drag them onto ${esc(s.name)} to bond. Each one boosts stats, grows body parts and teaches moves.</p></section>`;
    e.sort((a, b) => !!D.RARES[b[0]] - !!D.RARES[a[0]] || b[1] - a[1]);
    const tiles = e.map(([id, n]) => {
      const c = creature(id), t = state.tierOf(id, n);
      return `<div class="sp-bond ${c.rare ? 'rare' : ''}"><span class="cnt">\u00d7${n}</span><canvas data-sp="critter:${id}" data-scale="2"></canvas><b>${esc(c.name)}</b>
        <div class="sp-pips" title="${t} of 3 moves">${[0, 1, 2].map(i => `<i class="${i < t ? 'on' : ''}"></i>`).join('')}</div><small>${c.rare ? 'Rare' : t < 3 ? `Next move at ${[1, 3, 6][t]}` : 'All moves'}</small></div>`;
    }).join('');
    const icons = e.slice(0, 8).map(([id, n]) => `<span class="sp-bico" title="${esc(creature(id).name)}"><canvas data-sp="critter:${id}" data-scale="0"></canvas>${n > 1 ? `<i>\u00d7${n}</i>` : ''}</span>`).join('') + (e.length > 8 ? `<span class="sp-bmore">+${e.length - 8}</span>` : '');
    return foldSec('bonds', 'Bonded animals', `${e.reduce((a, x) => a + x[1], 0)}`, `<div class="sp-bicons">${icons}</div>`, `<div class="sp-bonds">${tiles}</div>`);
  }
  function partsHTML(s) {
    const e = Object.entries(s.parts || {}).filter(([, v]) => v > 0);
    const body = e.length ? `<div class="sp-parts">${e.map(([p, v]) => `<div class="sp-part"><b>${partName(p)}</b><div class="bar"><i style="width:${clamp(v, 0, 1) * 100}%;background:var(--plum)"></i></div><small>${PART_HELPS[p] ? '+' + PART_HELPS[p] : v >= 1 ? 'Full' : 'Growing'}</small></div>`).join('')}</div>`
      : `<p class="sp-muted">No extra parts yet. Animals grow them: wings from birds, fins from fish, horns from rams.</p>`;
    if (!e.length) return `<section class="panel sp-sec"><h2>Body parts</h2>${body}</section>`;
    return foldSec('parts', 'Body parts', `${e.length} of ${D.MAX_PARTS}`, `<p class="sp-fold-line">${e.map(([p]) => partName(p)).join(', ')}</p>`,
      `<p class="sp-note">Bigger parts help in races: ears for running, fins for swimming, horns and claws for climbing, wings for flying. A Sprout keeps up to ${D.MAX_PARTS} parts; a new one makes the oldest fall off.</p>${body}`);
  }
  function battleHTML(s) {
    const b = state.battleStats(s);
    const cell = (v, l) => `<div class="sp-bstat"><span class="num">${v}</span><small>${l}</small></div>`;
    const segs = [['run', 'Run'], ['swim', 'Swim'], ['climb', 'Climb'], ['fly', 'Fly']];
    const races = segs.map(([k, l]) => { const r = state.raceRating(s, k); return `<div class="sp-race"><span class="nm">${l}</span><div class="bar"><i style="width:${clamp(r / 15 * 100, 3, 100)}%;background:${D.STAT_META[D.RACE_STAT[k]].color}"></i></div><span class="num">${r.toFixed(1)}</span></div>`; }).join('')
      + (state.staminaRating ? (() => { const r = state.staminaRating(s); return `<div class="sp-race"><span class="nm">Stamina</span><div class="bar"><i style="width:${clamp(r / 15 * 100, 3, 100)}%;background:${D.STAT_META.stamina.color}"></i></div><span class="num">${r.toFixed(1)}</span></div>`; })() : '');
    const bstats = `<div class="sp-bstats">${cell(b.hp, 'HP')}${cell(b.atk, 'Atk')}${cell(b.def, 'Def')}${cell(b.spd, 'Spd')}${cell(Math.round(b.eva * 100) + '%', 'Dodge')}</div>`;
    return foldSec('bstats', 'Battle stats', '', bstats, `${bstats}<p class="sp-muted">Stamina gives HP and Defense, Power gives Attack, Run gives Speed, Fly gives Dodge, Swim adds Defense.</p>`)
      + foldSec('races', 'Race ratings', '', `<p class="sp-fold-line">${segs.map(([k, l]) => `${l} <b>${state.raceRating(s, k).toFixed(1)}</b>`).join(' \u00b7 ')}</p>`, `<p class="sp-note">How fast it moves on each kind of course section. Higher is faster.</p>${races}`);
  }
  function recordsHTML(s) {
    const r = s.record || {}, born = s.born ? new Date(s.born).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const rec = (v, l) => `<div class="sp-rec"><span class="num">${v}</span><small>${l}</small></div>`;
    return foldSec('records', 'Records', '', `<p class="sp-fold-line">Races won <b>${r.raceWins || 0}</b> \u00b7 Battles won <b>${r.battleWins || 0}</b></p>`, `<div class="sp-recs">
      ${rec(`${r.raceWins || 0} / ${r.races || 0}`, 'Races won')}${rec(`${r.battleWins || 0} / ${r.battles || 0}`, 'Battles won')}
      ${rec(Object.values(s.absorbed || {}).reduce((a, b) => a + b, 0), 'Animals bonded')}${rec(Math.max(0, Math.floor((Date.now() - (s.born || Date.now())) / 86400000)), 'Days old')}</div>
      ${born ? `<p class="sp-muted">Hatched ${born}${s.bornWith && creature(s.bornWith) ? `, already bonded with a ${esc(creature(s.bornWith).name)}` : ''}.</p>` : ''}`);
  }
  // ---------- style: paint tins, pattern stickers, closet ----------
  const skinOf = s => { const k = s.look && s.look.skin; return k && D.SKINS[k] ? k : null; };
  const skinBadge = s => { const k = skinOf(s); return k ? `<span class="sp-skin"><canvas data-sp="skin:${k}"></canvas>${esc(D.SKINS[k].name || k)} skin</span>` : ''; };
  // a rare shimmering Shiny (state.js sets look.shiny at hatch)
  const shinyBadge = s => (s.look && s.look.shiny === true ? '<span class="sp-shiny" title="A rare Shiny Sprout">✦ Shiny</span>' : '');
  // plain as it looks: a Sprout with Star spots shows a star unless it was made plain (look.noSpots)
  const plainNow = s => { const L = s.look || {}; return (!L.pattern || L.pattern === 'plain' || !D.PATTERNS[L.pattern]) && !((s.parts || {}).spots && !L.noSpots); };
  const patternShown = s => { try { const p = state.lookOf(s).pattern; return D.PATTERNS[p] ? p : null; } catch (e) { return null; } };
  function styleHTML(s) {
    const it = state.items(), L = s.look || {}, skin = skinOf(s);
    const paints = Object.keys(D.COLORS).filter(id => (it.paints || {})[id] > 0);
    const pats = Object.keys(D.PATTERNS).filter(id => id !== 'plain' && (it.patterns || {})[id] > 0);
    const hats = Object.keys(D.HATS).sort((a, b) => (D.HATS[a].slot === 'extra') - (D.HATS[b].slot === 'extra')).filter(id => state.ownsHat(id));
    const tile = (attr, kind, id, name, sub, on, n) => `<button class="sp-tile ${on ? 'on' : ''}" ${attr}>${n ? `<span class="cnt">×${n}</span>` : ''}
      <canvas data-sp="${kind}:${id}" data-scale="3"></canvas><b>${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
    const paintTiles = paints.map(id => tile(`data-paint="${id}"`, 'paint', id, D.COLORS[id], L.body === id && !skin ? 'On now' : '', L.body === id && !skin, it.paints[id])).join('');
    const patTiles = [tile('data-pattern="plain"', 'pattern', 'plain', 'Plain', plainNow(s) ? 'On now' : 'Free', plainNow(s))]
      .concat(pats.map(id => tile(`data-pattern="${id}"`, 'pattern', id, D.PATTERNS[id], L.pattern === id ? 'On now' : '', L.pattern === id, it.patterns[id]))).join('');
    const hatTiles = hats.map(id => { const on = L[D.HATS[id].slot] === id; return tile(`data-hat="${id}" aria-pressed="${on}"`, 'hat', id, D.HATS[id].name, on ? 'Wearing' : 'Tap to wear', on); }).join('');
    const none = !paints.length && !pats.length && !hats.length;
    const cta = `<div class="sp-gbcta"><canvas data-sp="gumball:${none ? 0 : 6}" data-scale="5"></canvas>
      <p>${none ? 'Buy the paint and stickers you like in the Shop. Hats come from the Gumball machine.' : 'Want more? Buy paint and stickers in the Shop, or win hats from the Gumball machine.'}</p>
      <button class="btn primary" data-closet-go>Buy paint &amp; stickers</button>
      <button class="btn" data-gumball-go>Go to the Gumball machine</button></div>`;
    const row = (label, tiles, empty) => `<div class="sp-srow"><div class="sp-lbl">${label}</div>${tiles ? `<div class="sp-tiles">${tiles}</div>` : `<p class="sp-none">${empty}</p>`}</div>`;
    return `<section class="panel sp-sec" id="sp-style"><h2>Style ${skin ? `<span class="sp-aside">${skinBadge(s)}</span>` : ''}</h2>
      <div class="sp-style-top"><div class="sp-mirror"><canvas data-mirror></canvas></div>
        <p>Make <b>${esc(s.name)}</b> look just right. Paint and stickers get used up. Hats and accessories stay in your closet, so swap them any time.</p></div>
      ${row('Paint', paintTiles, 'No paint tins yet.')}
      ${row('Stickers', patTiles)}
      ${row('Closet', hatTiles, 'No hats or accessories yet.')}
      ${cta}</section>`;
  }
  function sellHTML(s) {
    const ok = state.canSell(s);
    return `<div class="sp-sell"><button class="btn sp-sell-btn" data-sell ${ok ? '' : 'disabled'}><canvas data-sp="icon:coin"></canvas>Sell for ${fmt(state.sellPrice(s))} coins</button>
      ${ok ? '' : '<p>You need at least one Sprout.</p>'}</div>`;
  }
  // a Sprout look with some changes, for before/after previews
  function lookWith(s, patch) {
    const look = Object.assign({}, s.look || {}, patch);
    for (const k of Object.keys(patch)) if (patch[k] === null) delete look[k];
    return state.lookOf(Object.assign({}, s, { look }));
  }
  function beforeAfter(card, s, after) {
    const [a, b] = card.querySelectorAll('.sp-ba canvas');
    if (a) put(a, PX.sprig(state.lookOf(s), {}), 3);
    if (b) put(b, PX.sprig(after, { eyes: 'happy', mouth: 'open' }), 3);
  }
  const BA = `<div class="sp-ba"><figure><div class="pic"><canvas></canvas></div><figcaption>Now</figcaption></figure><span class="arr">›</span>
    <figure><div class="pic after"><canvas></canvas></div><figcaption>After</figcaption></figure></div>`;
  function cheer() {
    for (const a of [heroAnim, mirrorAnim]) if (a) a.happyUntil = clock + 1.3;
  }
  function confirmPaint(s, id) {
    const name = D.COLORS[id], n = (state.items().paints || {})[id] || 0, skin = skinOf(s);
    if (!name || !n) return;
    if (s.look.body === id && !skin) { PX.Sound.play('tick'); PS.ui.toast(`${s.name} is already ${name}!`); return; }
    PS.ui.modal({
      eyebrow: 'Paint', title: `Paint ${esc(s.name)} ${esc(name)}?`,
      html: `${BA}${skin ? `<p class="sp-warn">Painting covers ${esc(s.name)}'s <b>${esc(D.SKINS[skin].name)} skin</b>. The ${esc(D.SKINS[skin].name)} skin won't come back.</p>` : ''}
        <p class="sp-m-left">Uses 1 of your ${n} ${esc(name)} paint tin${n === 1 ? '' : 's'}.</p>`,
      row: true, buttons: [{ label: 'Not now' }, { label: 'Paint!', kind: 'primary', onClick: () => doStyle(s.id, x => state.usePaint(x, id), `${s.name} is ${name} now!`) }],
      mount: card => beforeAfter(card, s, lookWith(s, { body: id, skin: null })),
    });
  }
  function confirmPattern(s, id) {
    const name = D.PATTERNS[id]; if (!name) return;
    if (id === 'plain') {
      if (plainNow(s)) { PX.Sound.play('tick'); PS.ui.toast(`${s.name} is already plain.`); return; }
      const cur = D.PATTERNS[patternShown(s)] || 'old';
      PS.ui.modal({
        eyebrow: 'Stickers', title: `Make ${esc(s.name)} plain?`,
        html: `${BA}<p class="sp-m-left">It's free! The ${esc(cur)} pattern comes off. To get it back you'll need another ${esc(cur)} sticker.</p>`,
        row: true, buttons: [{ label: 'Not now' }, { label: 'Go plain', kind: 'primary', onClick: () => doStyle(s.id, x => state.usePattern(x, 'plain'), `${s.name} is plain now.`) }],
        mount: card => beforeAfter(card, s, lookWith(s, { pattern: 'plain', noSpots: true })),
      });
      return;
    }
    // the pattern it already wears: nothing to do, and no sticker gets used up
    if (s.look && s.look.pattern === id && !s.look.noSpots) { PX.Sound.play('tick'); PS.ui.toast(`${s.name} already has ${name}!`); return; }
    const n = (state.items().patterns || {})[id] || 0; if (!n) return;
    const tint = D.PATTERN_COLORS.slice(2).find(c => c !== s.look.patternColor) || '#fff27a'; // the real colour is picked at random
    PS.ui.modal({
      eyebrow: 'Sticker', title: `Give ${esc(s.name)} ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${esc(name)} pattern?`,
      html: `${BA}<p class="sp-m-left">The sticker color is a surprise! Uses 1 of your ${n} ${esc(name)} sticker${n === 1 ? '' : 's'}.</p>`,
      row: true, buttons: [{ label: 'Not now' }, { label: 'Stick it!', kind: 'primary', onClick: () => doStyle(s.id, x => state.usePattern(x, id), `${s.name} has ${name} now!`) }],
      mount: card => beforeAfter(card, s, lookWith(s, { pattern: id, patternColor: tint })),
    });
  }
  function doStyle(id, apply, msg) {
    const s = state.get(id); if (!s) return;
    if (!apply(s)) { PX.Sound.play('miss'); return; }
    PX.Sound.play('level'); PX.buzz(20); PS.ui.toast(msg); cheer();
  }
  function toggleHat(s, id) {
    const H = D.HATS[id]; if (!H || !state.ownsHat(id)) return;
    const off = s.look[H.slot] === id;
    if (!state.wear(s, id)) return;
    PX.Sound.play(off ? 'pop' : 'coo'); PX.buzz(8);
    if (!off) cheer();
  }
  // Selling is for good, so it takes two yeses. "Keep" is the big first button both times; the second "sell" button sits where
  // "Keep" was and wakes up after a moment, so a double tap or a mashed button keeps the Sprout.
  function confirmSell(s) {
    if (!state.canSell(s)) { PX.Sound.play('miss'); PS.ui.toast('You need at least one Sprout.'); return; }
    const price = state.sellPrice(s), id = s.id, name = s.name;
    PS.ui.modal({
      eyebrow: 'Sell', title: `Sell ${esc(name)}?`, sprite: s, pose: {},
      html: `<p class="sp-sell-price"><canvas data-sp="icon:coin"></canvas><span class="num">${fmt(price)}</span></p>
        <p class="sp-sell-say">${esc(name)} would leave your garden for good.</p>`,
      buttons: [{ label: `Keep ${name}`, kind: 'primary sp-keep' }, { label: `Sell for ${fmt(price)} coins`, kind: 'sp-sell-go', onClick: () => sureSell(id) }],
      mount: card => hydrate(card),
    });
  }
  function sureSell(id) {
    const s = state.get(id); if (!s || !state.canSell(s)) return;
    const price = state.sellPrice(s), name = s.name;
    PS.ui.modal({
      eyebrow: 'Sell for good', title: 'Are you sure?', sprite: s, pose: { eyes: 'sad' },
      html: `<p class="sp-sell-say"><b>${esc(name)}</b> will leave your garden for good.</p>
        <p class="sp-sell-price"><canvas data-sp="icon:coin"></canvas><span class="num">${fmt(price)}</span></p>`,
      buttons: [{ label: `Yes, sell ${name}`, kind: 'danger sp-sell-yes', onClick: () => doSell(id) }, { label: `Keep ${name}`, kind: 'primary sp-keep' }],
      mount: card => {
        hydrate(card);
        const yes = card.querySelector('.sp-sell-yes'); if (!yes) return;
        yes.disabled = true; setTimeout(() => { yes.disabled = false; }, 900);
      },
    });
  }
  function doSell(id) {
    const s = state.get(id); if (!s) return;
    const name = s.name, price = state.sellSprout(id);
    if (!price) { PX.Sound.play('miss'); PS.ui.toast('You need at least one Sprout.'); return; }
    PX.Sound.play('chime'); PX.buzz(20);
    PS.ui.toast(`${name} found a new home. +${fmt(price)} coins`, 3000);
    if (curId === id) { curId = null; view = 'list'; }
    if (visible) render(false); else dirty = true;
  }
  function scrollToStyle(smooth) {
    const sc = root.querySelector('.sp-scroll'), sec = root.querySelector('#sp-style'); if (!sc || !sec) return;
    const top = Math.max(0, sec.offsetTop - 10);
    if (smooth && sc.scrollTo) sc.scrollTo({ top, behavior: 'smooth' }); else sc.scrollTop = top;
  }

  // XP multiplier for a very happy Sprout (state.happyBonus: 1.1 at happy >= 75); 1 = no bonus
  const happyX = s => { try { const v = typeof state.happyBonus === 'function' ? +state.happyBonus(s) : 1; return v > 0 ? v : 1; } catch (e) { return 1; } };
  function detailHTML(s) {
    const fi = state.formInfo(s), partner = s.id === PS.S.activeId, hb = happyX(s);
    return `<div class="sp-scroll"><div class="sp-wrap">
      <div class="sp-top"><button class="btn sp-back" data-back>${backTo === 'page' ? '\u2039 Back' : '\u2039 All Sprouts'}</button></div>
      <section class="panel sp-hero">
        <div class="sp-stagebox ${esc(s.area)}"><span class="sp-where">${esc(areaName(s.area))}${s.home ? ` \u00b7 resting in the ${esc(state.homeName(s.area))}` : ''}</span><canvas data-hero title="Pet"></canvas></div>
        <div class="sp-namebox"><input class="sp-name-in" maxlength="12" value="${esc(s.name)}" aria-label="Name" enterkeyhint="done" autocomplete="off" spellcheck="false"></div>
        <div class="sp-form"><b>${esc(fi.name)}</b> \u00b7 Stage ${fi.stage + 1} of 3</div><div class="sp-els">${state.elementsOf(s).map(elChip).join('')}${skinBadge(s)}${shinyBadge(s)}</div>
        <div class="sp-mood">
          <small><span>Happiness</span><span>${Math.round(s.happy || 0)}</span></small><div class="bar"><i style="width:${clamp(s.happy || 0, 0, 100)}%;background:var(--berry)"></i></div>
          <p class="sp-happy ${hb > 1 ? 'on' : ''}">${hb > 1 ? `\u2665 Very happy: +${Math.round((hb - 1) * 100)}% XP` : 'Pet it and feed it to make it very happy.'}</p>
        </div>
        <div class="sp-acts">
          <button class="btn ${partner ? '' : 'primary'}" data-partner ${partner ? 'disabled' : ''}>${partner ? '\u2605 Your partner' : 'Set as partner'}</button>
          <button class="btn go" data-visit aria-label="Visit in the ${esc(areaName(s.area))}">Visit</button>
          <button class="btn sp-dress" data-jump-style><canvas data-sp="hat:party" data-scale="2"></canvas>Dress up ${esc(s.name)}</button>
        </div>
      </section>
      ${statsHTML(s)}${natureHTML(s)}${evoHTML(s)}${movesHTML(s)}${styleHTML(s)}${bondsHTML(s)}${partsHTML(s)}${battleHTML(s)}${recordsHTML(s)}
      <button class="btn sp-back" data-back style="justify-self:start">${backTo === 'page' ? '\u2039 Back' : '\u2039 All Sprouts'}</button>
      ${sellHTML(s)}
    </div></div>`;
  }

  // ---------- render ----------
  // keepScroll: true keeps the scroll where it is, a number scrolls there, false starts at the top
  function scrollBox() { return root && (root.querySelector('.sp-box') || root.querySelector('.sp-scroll')); }
  function render(keepScroll) {
    dirty = false; anims = []; pgHero = null; critHero = null;
    const sc = scrollBox(), keep = typeof keepScroll === 'number' ? keepScroll : keepScroll && sc ? sc.scrollTop : 0;
    const s = view === 'detail' ? state.get(curId) : null;
    if (view === 'detail' && !s) view = 'list';
    if (view === 'page' && !validEntry(pg.kind, pg.id)) view = 'list';
    root.innerHTML = view === 'detail' ? detailHTML(s) : view === 'page' ? pageHTML() : listHTML();
    hydrate(root);
    if (view === 'list') {
      root.querySelectorAll('canvas[data-anim]').forEach(cv => { const sp = state.get(cv.dataset.anim); if (sp) animSprite(cv, state.lookOf(sp), 2, { flap: hasWings(sp) }); });
    } else if (view === 'page') {
      setupPage();
      root.querySelectorAll('canvas[data-mini]').forEach(cv => { const sp = state.get(cv.dataset.mini); if (sp) try { put(cv, PX.sprig(state.lookOf(sp), {}), 2); } catch (e) { /* art optional */ } });
    } else {
      const hero = root.querySelector('[data-hero]');
      heroAnim = animSprite(hero, state.lookOf(s), 5, { phase: 0, flap: hasWings(s) });
      const mirror = root.querySelector('[data-mirror]');
      mirrorAnim = mirror ? animSprite(mirror, state.lookOf(s), 3, { phase: 0.3, flap: hasWings(s) }) : null;
      // evolution previews: same Sprout, drawn as each stage
      const nk = state.natureKind(s), flower = s.stage === 2 && s.flower ? s.flower : (Object.keys(D.FLOWERS).find(k => D.FLOWERS[k].area === s.area && D.FLOWERS[k].nature === nk) || 'daisy');
      root.querySelectorAll('canvas[data-evo]').forEach(cv => {
        const i = +cv.dataset.evo;
        const fake = Object.assign({}, s, { stage: i, flower: i === 2 ? flower : null, form: i === 0 ? 'seedling' : i === 1 ? (s.stage >= 1 ? s.form : nk + 'bud') : 'bloom' });
        if (i === s.stage) animSprite(cv, state.lookOf(fake), 2, { flap: hasWings(s) });
        else put(cv, PX.sprig(state.lookOf(fake), { eyes: i > s.stage ? 'closed' : undefined }), 2);
      });
    }
    const sc2 = scrollBox(); if (sc2) sc2.scrollTop = keep;
  }
  let heroAnim = null, mirrorAnim = null;
  function openDetail(id) { const sc = scrollBox(); if (view === 'list' && sc) listTop = sc.scrollTop; backTo = view === 'page' ? 'page' : 'list'; curId = id; view = 'detail'; render(false); }

  // ---------- events ----------
  function onClick(e) {
    const q = sel => e.target.closest(sel);
    let b;
    if ((b = q('[data-open]'))) { PX.Sound.play('pop'); openSecs.clear(); openDetail(b.dataset.open); return; }
    if ((b = q('[data-ltab]'))) { if (b.dataset.ltab !== listTab) { listTab = b.dataset.ltab; listTop = 0; PX.Sound.play('tick'); render(false); } return; }
    if ((b = q('[data-entry]'))) { PX.Sound.play('pop'); const key = b.dataset.entry; openPage(key.charAt(0), key.slice(2)); return; }
    if ((b = q('[data-pg]'))) { flip(+b.dataset.pg); return; }
    if (q('[data-pghero]')) { heroTap(); return; }
    if ((b = q('[data-shopgo]'))) { PX.Sound.play('pop'); PS.ui.go('shop', { tab: b.dataset.shopgo }); return; }
    if ((b = q('[data-legendgo]'))) { PX.Sound.play('pop'); if (PS.battle && typeof PS.battle.openLegend === 'function') PS.battle.openLegend(b.dataset.legendgo); else PS.ui.go('battle'); return; }
    if ((b = q('[data-areago]'))) {
      const a = b.dataset.areago; PX.Sound.play('pop');
      if (D.AREAS[a] && PS.S.area !== a) { PS.S.area = a; PS.emit('area', { area: a }); PS.save(); }
      PS.ui.go('garden'); return;
    }
    if ((b = q('[data-fold]'))) { const id = b.dataset.fold; if (openSecs.has(id)) openSecs.delete(id); else openSecs.add(id); PX.Sound.play('tick'); render(true); return; }
    if (q('[data-back]')) {
      PX.Sound.play('tick');
      if (view === 'detail' && backTo === 'page') { backTo = 'list'; view = 'page'; render(false); return; }
      backTo = 'list'; view = 'list'; render(listTop); setTimeout(checkPrize, 300); return;
    }
    if ((b = q('[data-hatch]'))) {
      const egg = PS.S.eggs.find(x => x.id === b.dataset.hatch);
      PX.Sound.play('pop');
      if (egg && egg.area !== PS.S.area && D.AREAS[egg.area]) { PS.S.area = egg.area; PS.emit('area', { area: egg.area }); PS.save(); }
      PS.ui.go('garden'); return;
    }
    if (q('[data-go-garden]')) { PS.ui.go('garden'); return; }
    if (q('[data-gumball-go]')) { PX.Sound.play('pop'); PS.ui.go('shop', { tab: 'gumball' }); return; }
    if (q('[data-closet-go]')) { PX.Sound.play('pop'); PS.ui.go('shop', { tab: 'gumball', section: 'closet' }); return; }
    if (q('[data-dev]')) { PS.ui.devPanel(); return; }
    if (q('[data-players]')) { PS.ui.playersPanel(); return; }
    if (q('[data-backup]')) { PS.ui.backupPanel(); return; }
    const s = state.get(curId); if (!s || view !== 'detail') return;
    if (q('[data-partner]')) { state.setActive(s.id); PX.Sound.play('chime'); PS.ui.toast(`${s.name} is now your partner.`); render(true); return; }
    if (q('[data-pick-moves]')) { PX.Sound.play('pop'); PS.ui.pickMoves(s, () => render(true)); return; }
    if (q('[data-visit]')) {
      PX.Sound.play('pop');
      if (PS.S.area !== s.area) { PS.S.area = s.area; PS.emit('area', { area: s.area }); PS.save(); }
      PS.ui.go('garden'); return;
    }
    if (q('[data-hero]') && heroAnim) { heroAnim.happyUntil = clock + 1.1; PX.Sound.play('coo'); PX.buzz(8); return; }
    if (q('[data-mirror]') && mirrorAnim) { mirrorAnim.happyUntil = clock + 1.1; PX.Sound.play('coo'); PX.buzz(8); return; }
    if (q('[data-jump-style]')) { PX.Sound.play('tick'); scrollToStyle(true); return; }
    if ((b = q('[data-paint]'))) { PX.Sound.play('pop'); confirmPaint(s, b.dataset.paint); return; }
    if ((b = q('[data-pattern]'))) { PX.Sound.play('pop'); confirmPattern(s, b.dataset.pattern); return; }
    if ((b = q('[data-hat]'))) { toggleHat(s, b.dataset.hat); return; }
    if (q('[data-sell]')) { PX.Sound.play('pop'); confirmSell(s); return; }
  }
  function commitName(inp) {
    const s = state.get(curId); if (!s) return;
    const v = inp.value.trim().slice(0, 12);
    if (!v) { inp.value = s.name; return; }
    if (v !== s.name) { state.renameSprout(s, v); PS.ui.toast(`Renamed to ${s.name}`); }
  }
  const markDirty = () => {
    if (!visible) { dirty = true; return; }
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('sp-name-in')) { dirty = true; return; } // don't yank the field while typing
    render(true);
    if (view === 'list') setTimeout(checkPrize, 300);
  };

  PS.scenes.sprouts = {
    mount(el) {
      injectCSS(); root = el;
      root.addEventListener('click', onClick);
      root.addEventListener('change', e => { if (e.target.classList.contains('sp-name-in')) commitName(e.target); });
      root.addEventListener('keydown', e => { if (e.target.classList.contains('sp-name-in') && e.key === 'Enter') e.target.blur(); });
      root.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('sp-name-in') && dirty) setTimeout(() => { if (visible && dirty) render(true); }, 0); });
      ['sprout:update', 'sprout:evolve', 'sprout:sold', 'items', 'egg:new', 'egg:hatch', 'reset', 'pouch'].forEach(ev => PS.on(ev, markDirty));
      ['sprout:update', 'items', 'egg:hatch', 'pouch'].forEach(ev => PS.on(ev, badgeSoon));
      // a swipe across a book page turns it
      let sx = 0, sy = 0, st = 0;
      root.addEventListener('touchstart', e => { const t = e.touches[0]; if (!t || e.touches.length > 1) { st = 0; return; } sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
      root.addEventListener('touchend', e => {
        if (!st || view !== 'page' || Date.now() - st > 700) return; st = 0;
        const t = e.changedTouches[0]; if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) flip(dx < 0 ? 1 : -1);
      }, { passive: true });
      badgeSoon();
    },
    show(params) {
      visible = true;
      if (params && params.id && state.get(params.id)) { curId = params.id; view = 'detail'; backTo = 'list'; listTop = 0; render(false); if (params.section === 'style') scrollToStyle(false); return; }
      if (params && params.entry) { const key = String(params.entry), k = key.charAt(0), id = key.slice(2); if (validEntry(k, id)) { listTab = tabOf(k); view = 'list'; listTop = 0; openPage(k, id); return; } }
      if (params && ['mine', 'eggs', 'animals', 'looks'].includes(params.tab)) listTab = params.tab;
      view = 'list'; render(false);
      setTimeout(checkPrize, 500);
    },
    hide() { visible = false; },
    frame(dt, t) {
      clock = t; for (const a of anims) drawAnim(a, t);
      const c = critHero;
      if (c && c.n > 1) { const f = Math.floor(t * 3) % c.n; if (f !== c.f) { c.f = f; try { put(c.cv, PX.critter(c.id, f), c.sc); } catch (e) { c.n = 1; } } }
    },
  };
  // for the title screen's cards and anyone who wants to open a page: PS.book.open('a', 'hare')
  PS.book = { counts: () => counts(), icon: bookIcon, sync, prizeDue: () => prizeDue(), open: (k, id) => PS.ui.go('sprouts', validEntry(k, id) ? { entry: k + ':' + id } : { tab: tabOf(k) }) };
})();
