// sprouts.js -- Solunar Sprouts roster: every Sprout and waiting egg, plus a detail page per Sprout
// (stats, nature, evolution path, moves, bonded animals, body parts, battle stats, race ratings, records).
// Scene: PS.scenes.sprouts = { mount, show({id}), hide, frame }. Styles are injected below (prefix .sp-).
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
.sp-head .sp-sub{font-size:13px;color:var(--ink-soft);margin-top:2px}
.sp-head .sp-count{margin-left:auto;font-family:var(--f-px);font-weight:700;font-size:15px;background:var(--slot);border:2px solid var(--line);border-radius:12px;padding:3px 10px}
.sp-lbl{font-family:var(--f-px);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin:4px 4px -4px;display:flex;align-items:center;gap:8px}
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
.sp-row small{display:block;font-size:13px;line-height:1.35;color:var(--ink-soft)}
.sp-row .sp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.sp-lv{display:grid;justify-items:center;gap:2px}
.sp-lv .num{font-size:22px;line-height:1}
.sp-lv span:not(.num){font-family:var(--f-px);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft)}
.sp-tag{display:inline-block;font-family:var(--f-px);font-weight:600;font-size:11px;background:var(--sun);border:2px solid var(--sun-edge);color:#4a3210;border-radius:8px;padding:0 6px;margin-left:6px;vertical-align:3px}
.sp-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:0 7px;font-family:var(--f-px);font-weight:600;font-size:12px;line-height:18px;color:#fff;white-space:nowrap}
.sp-chip.soft{background:var(--slot);color:var(--ink);border:1px solid var(--line)}
.sp-egg{display:grid;grid-template-columns:56px 1fr auto;align-items:center;gap:12px;background:var(--panel);border:2px dashed var(--edge);border-radius:18px;padding:8px 12px 8px 8px}
.sp-egg .sp-pic{height:62px}
.sp-egg b{display:block;font-family:var(--f-px);font-weight:700;font-size:17px}
.sp-egg small{display:block;font-size:13px;color:var(--ink-soft);line-height:1.35}
.sp-empty{padding:18px;text-align:center}
.sp-empty p{margin:6px 0 12px;line-height:1.45}
.sp-acct{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.sp-dev{justify-self:center;background:none;border:0;padding:8px 12px;font-family:var(--f-px);font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);opacity:.75;text-decoration:underline;text-underline-offset:3px}

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
.sp-stagebox .sp-where{position:absolute;left:8px;top:8px;font-family:var(--f-px);font-weight:600;font-size:12px;background:rgba(255,248,230,.9);border-radius:8px;padding:2px 8px;color:var(--ink)}
.sp-namebox{display:flex;align-items:center;gap:6px;width:100%;max-width:300px}
.sp-name-in{flex:1;min-width:0;font-family:var(--f-px);font-weight:700;font-size:26px;text-align:center;color:var(--ink);background:var(--field);border:2px solid var(--line);border-radius:12px;padding:4px 8px;
  -webkit-user-select:text;user-select:text;touch-action:manipulation}
.sp-name-in:focus{outline:3px solid var(--focus);outline-offset:1px}
.sp-form{font-size:15px;color:var(--ink-soft);margin-top:-4px}
.sp-form b{color:var(--ink);font-weight:600}
.sp-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.sp-acts .btn{font-size:15px}
.sp-acts .btn[disabled]{opacity:.7;cursor:default}
.sp-mood{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;text-align:left}
.sp-mood small{font-family:var(--f-px);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);display:flex;justify-content:space-between}

.sp-sec{padding:14px}
.sp-sec h2{margin:0;font-family:var(--f-px);font-weight:700;font-size:20px;color:var(--ink);display:flex;align-items:center;gap:8px}
.sp-sec h2 .sp-aside{margin-left:auto;font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink-soft)}
.sp-sec .sp-note{margin:4px 0 10px;font-size:13px;line-height:1.4;color:var(--ink-soft)}
.sp-stats{display:grid;gap:4px}
.sp-els{display:flex;gap:5px;justify-content:center;margin-top:-6px}
.sp-stat{display:grid;grid-template-columns:70px 50px 1fr;align-items:center;gap:8px}
.sp-stat .nm{font-family:var(--f-px);font-weight:700;font-size:15px}
.sp-stat .lv{font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
.sp-stat .xp{grid-column:3;font-size:11px;color:var(--ink-soft);margin-top:-7px;text-align:right;font-variant-numeric:tabular-nums}
.sp-stat .bar{height:12px}

.sp-nat{position:relative;height:18px;border-radius:9px;border:2px solid var(--line);
  background:linear-gradient(90deg,#9a6ad0 0%,#c9a2f0 37.5%,#bfe3b4 37.5%,#bfe3b4 62.5%,#fff27a 62.5%,#f6c83a 100%)}
.sp-nat i{position:absolute;top:-6px;width:10px;height:26px;margin-left:-5px;border-radius:5px;background:var(--ink);border:2px solid var(--panel)}
.sp-nat-l{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink-soft)}
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
.sp-evo .st b{font-family:var(--f-px);font-weight:700;font-size:13px;line-height:1.1}
.sp-evo .st small{font-size:11px;color:var(--ink-soft);line-height:1.2}
.sp-evo .arr{align-self:center;font-family:var(--f-px);font-weight:700;color:var(--edge);text-align:center;padding-bottom:30px}
.sp-evo-bar{margin-top:12px;font-size:14px}
.sp-evo-bar .row{display:flex;justify-content:space-between;margin-bottom:5px}
.sp-evo-bar .bar{height:14px}
.sp-flowers{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.sp-flower{display:grid;justify-items:center;gap:2px;padding:7px 4px 6px;border-radius:12px;background:var(--field);border:2px solid var(--line);text-align:center}
.sp-flower canvas{width:30px;height:30px}
.sp-flower b{font-family:var(--f-px);font-weight:600;font-size:13px;line-height:1.1}
.sp-flower small{font-size:11px;color:var(--ink-soft)}
.sp-flower.pick{border-color:var(--sun-edge);background:var(--panel);box-shadow:inset 0 -3px 0 var(--sun)}
.sp-flower.pick small{color:#8a5a10;font-weight:600}

.sp-moves{display:grid;gap:8px;margin-top:10px}
.sp-move{display:grid;grid-template-columns:8px 1fr auto;gap:0 10px;align-items:center;background:var(--field);border:2px solid var(--line);border-radius:14px;padding:7px 10px 7px 7px}
.sp-move>i{grid-row:span 2;align-self:stretch;border-radius:4px}
.sp-move b{font-family:var(--f-px);font-weight:700;font-size:15px}
.sp-move small{grid-column:2/-1;font-size:12.5px;line-height:1.3;color:var(--ink-soft)}
.sp-move .pw{font-size:12px;font-weight:600;color:var(--ink-soft);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.sp-move.active{background:var(--panel);border-color:var(--sun-edge);border-bottom-width:4px}
.sp-move.locked{opacity:.55;background:var(--slot)}
.sp-move.compact{grid-template-columns:6px 1fr auto;padding:5px 10px 5px 6px;border-radius:11px}
.sp-move.compact>i{grid-row:auto}
.sp-move.compact b{font-size:14px;display:flex;align-items:center;gap:6px}
.sp-move.compact.battle{border-color:var(--sun-edge)}
.sp-inb{font-family:var(--f-ui);font-weight:600;font-size:10.5px;background:var(--sun);color:#4a3210;border-radius:6px;padding:0 5px;line-height:16px}
.sp-grp{margin-top:14px}
.sp-grp h3{margin:0 0 6px;font-family:var(--f-px);font-weight:600;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);display:flex;align-items:center;gap:6px}
.sp-grp h3 canvas{width:22px;height:22px}
.sp-grp .sp-moves{margin-top:0;gap:6px}
.sp-lock{font-size:11px;font-weight:600;color:#8a5a10;background:#fff1c9;border-radius:6px;padding:0 6px;white-space:nowrap}

.sp-bonds{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:10px}
.sp-bond{position:relative;display:grid;justify-items:center;gap:2px;background:var(--field);border:2px solid var(--line);border-radius:14px;padding:8px 4px 7px;text-align:center}
.sp-bond.rare{border-color:#d9a0e8;background:#fbf0ff}
.sp-bond b{font-family:var(--f-px);font-weight:600;font-size:13px;line-height:1.1}
.sp-bond small{font-size:11px;color:var(--ink-soft)}
.sp-bond .cnt{position:absolute;top:-7px;right:-5px;min-width:24px;height:22px;padding:0 5px;display:grid;place-items:center;border-radius:11px;background:var(--sun);border:2px solid var(--sun-edge);font-family:var(--f-px);font-weight:700;font-size:12px;color:#4a3210}
.sp-pips{display:flex;gap:3px}
.sp-pips i{width:8px;height:8px;border-radius:2px;background:var(--slot);border:1px solid var(--edge)}
.sp-pips i.on{background:var(--accent);border-color:var(--accent-edge)}

.sp-parts{display:grid;gap:8px;margin-top:10px}
.sp-part{display:grid;grid-template-columns:110px 1fr 52px;gap:8px;align-items:center;font-size:14px}
.sp-part b{font-weight:600}
.sp-part small{font-size:12px;color:var(--ink-soft);text-align:right}

.sp-bstats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}
.sp-bstat{display:grid;justify-items:center;background:var(--field);border:2px solid var(--line);border-radius:12px;padding:6px 2px}
.sp-bstat .num{font-size:19px;line-height:1.1}
.sp-bstat small{font-family:var(--f-px);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-soft)}
.sp-race{display:grid;grid-template-columns:70px 1fr 38px;gap:8px;align-items:center;margin-top:8px}
.sp-race .nm{font-family:var(--f-px);font-weight:700;font-size:14px}
.sp-race .num{font-size:14px;text-align:right}
.sp-recs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.sp-rec{background:var(--field);border:2px solid var(--line);border-radius:12px;padding:8px 10px}
.sp-rec .num{font-size:20px}
.sp-rec small{display:block;font-size:12px;color:var(--ink-soft)}
.sp-muted{font-size:14px;color:var(--ink-soft);margin:8px 0 0;line-height:1.4}

/* style: paint, stickers, closet */
.sp-dress{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px}
.sp-dress canvas{display:block;margin:-4px 0}
.sp-skin{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:0 8px 0 4px;font-family:var(--f-px);font-weight:600;font-size:12px;line-height:20px;white-space:nowrap;
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
.sp-tile b{font-family:var(--f-px);font-weight:600;font-size:15px;line-height:1.1}
.sp-tile small{font-size:12.5px;line-height:1.2;color:var(--ink-soft)}
.sp-tile.on{border-color:var(--sun-edge);background:var(--panel);box-shadow:inset 0 0 0 2px var(--sun)}
.sp-tile.on small{color:#8a5a10;font-weight:600}
.sp-tile .cnt{position:absolute;top:-7px;right:-5px;min-width:26px;height:24px;padding:0 6px;display:grid;place-items:center;border-radius:12px;background:var(--sun);border:2px solid var(--sun-edge);
  font-family:var(--f-px);font-weight:700;font-size:13px;color:#4a3210}
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
.sp-ba figcaption{font-family:var(--f-px);font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft)}
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
.sp-sell-price{display:flex;align-items:center;justify-content:center;gap:6px;font-family:var(--f-px);font-weight:600;font-size:18px;margin:0 0 8px;color:var(--ink)}
.sp-sell-price canvas{width:18px;height:18px}
`;
  function injectCSS() { if (document.getElementById('sp-css')) return; const st = document.createElement('style'); st.id = 'sp-css'; st.textContent = CSS; document.head.appendChild(st); }

  // ---------- helpers ----------
  function put(cv, src, scale) {
    if (cv.width !== src.width) cv.width = src.width;
    if (cv.height !== src.height) cv.height = src.height;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(src, 0, 0);
    if (scale) { cv.style.width = src.width * scale + 'px'; cv.style.height = src.height * scale + 'px'; }
    cv.classList.add('px');
  }
  function hydrate(root) {
    root.querySelectorAll('canvas[data-sp]').forEach(cv => {
      const [k, id] = cv.dataset.sp.split(':');
      let src = null;
      if (k === 'critter') src = PX.critter(id);
      else if (k === 'egg') src = PX.item('egg', id);
      else if (k === 'flower') src = PX.item('flower', id);
      else if (k === 'icon') src = PS.ui.icon(id);
      else if (STYLE_KINDS.includes(k)) src = styleArt(k, id);
      if (src) put(cv, src, +cv.dataset.scale || 0);
      delete cv.dataset.sp;
    });
  }
  // paint tins, pattern stickers, hats, skins and gumballs come from shop.js (PS.styleArt), which falls back to stand-ins until pixel.js has them
  const STYLE_KINDS = ['gumball', 'paint', 'pattern', 'hat', 'skin'];
  function styleArt(kind, id) {
    try { if (PS.styleArt) return PS.styleArt.item(kind, id); } catch (e) { console.error(e); }
    try { return PX.item(kind, id); } catch (e) { return null; }
  }
  const PART_NAMES = { wings: 'Wings', ears: 'Long ears', fins: 'Fins', horns: 'Horns', tail: 'Tail', shell: 'Shell', antennae: 'Antennae', claws: 'Claws', spikes: 'Spikes',
    batwings: 'Bat wings', fairywings: 'Fairy wings', flamewings: 'Flame wings', dragonwings: 'Dragon wings', unihorn: 'Unicorn horn', multitail: 'Nine tails', fluff: 'Fluff',
    tentacles: 'Tentacles', spots: 'Star spots' };
  const partName = p => PART_NAMES[p] || (p.charAt(0).toUpperCase() + p.slice(1));
  // mirrors state.js PART_RACE, for the "helps" hint on body parts
  const PART_HELPS = { ears: 'Run', fins: 'Swim', tentacles: 'Swim', horns: 'Climb', claws: 'Climb', spikes: 'Climb', wings: 'Fly', batwings: 'Fly', fairywings: 'Fly', flamewings: 'Fly', dragonwings: 'Fly', shell: 'Stamina' };
  const elChip = el => { const E = D.ELEMENTS[el] || D.ELEMENTS.normal; return `<span class="sp-chip" style="background:${E.color}">${E.label}</span>`; };
  const NATURE = { sun: 'Sun', moon: 'Moon', wild: 'Wild' };
  const creature = id => D.ANIMALS[id] || D.RARES[id];
  const areaName = a => (D.AREAS[a] || D.AREAS.meadow).name;

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
  let root, view = 'list', curId = null, visible = false, dirty = false, clock = 0;
  function listHTML() {
    const S = PS.S, list = S.sprouts.slice().sort((a, b) => (b.id === S.activeId) - (a.id === S.activeId) || (a.born || 0) - (b.born || 0));
    const rows = list.map(s => {
      const fi = state.formInfo(s), tl = state.totalLevels(s), partner = s.id === S.activeId;
      return `<button class="sp-row ${partner ? 'partner' : ''}" data-open="${s.id}">
        <div class="sp-pic"><canvas data-anim="${s.id}"></canvas></div>
        <div><b>${esc(s.name)}${partner ? '<span class="sp-tag">Partner</span>' : ''}</b>
          <small>${esc(fi.name)} \u00b7 ${esc(areaName(s.area))}</small>${s.home ? `<small>Resting in the ${esc(state.homeName(s.area))}</small>` : ''}
          <div class="sp-chips">${state.elementsOf(s).map(elChip).join('')}${skinBadge(s)}</div></div>
        <div class="sp-lv"><span class="num">${tl}</span><span>Level</span></div>
      </button>`;
    }).join('');
    const eggs = S.eggs.map(e => {
      const E = D.EGGS[e.kind] || D.EGGS.meadow, left = Math.max(0, (E.taps || 5) - (e.taps || 0));
      return `<div class="sp-egg"><div class="sp-pic"><canvas data-sp="egg:${e.kind}" data-scale="2"></canvas></div>
        <div><b>${esc(E.name)}</b><small>In the ${esc(areaName(e.area))}${e.source ? ' \u00b7 ' + esc(e.source) : ''}</small><small>${left} ${left === 1 ? 'tap' : 'taps'} to hatch</small></div>
        <button class="btn primary" data-hatch="${e.id}">Go hatch</button></div>`;
    }).join('');
    return `<div class="sp-scroll"><div class="sp-wrap">
      <header class="panel sp-head"><canvas data-sp="icon:sprouts" data-scale="0" style="width:44px;height:44px"></canvas>
        <div><h1 class="px-title">Your Sprouts</h1><div class="sp-sub">Tap a Sprout to see everything about it</div></div>
        <span class="sp-count">${S.sprouts.length}</span></header>
      ${S.sprouts.length ? `<div class="sp-list">${rows}</div>` : `<div class="panel sp-empty"><b class="px-title" style="font-size:20px">No Sprouts yet</b><p>Your first egg is waiting in the Garden. Tap it until it hatches.</p><button class="btn primary" data-go-garden>Go to the Garden</button></div>`}
      ${S.eggs.length ? `<div class="sp-lbl">Eggs waiting <span class="n">${S.eggs.length}</span></div><div class="sp-list">${eggs}</div>` : ''}
      <div class="sp-acct"><button class="btn" data-players>Switch player</button><button class="btn" data-backup>Backups</button></div>
      <button class="sp-dev" data-dev>Parent tools</button>
    </div></div>`;
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
    return `<section class="panel sp-sec"><h2>Moves</h2>
      <p class="sp-note">In battle it uses its ${fi.short} form's 3 moves plus the best unlocked move of its top animal.</p>
      <div class="sp-lbl" style="margin:0 0 6px">Battle moves</div>
      <div class="sp-moves" style="margin-top:0">${active.map(id => moveHTML(id, { active: true })).join('')}</div>
      <div class="sp-grp"><h3>Elements</h3><div style="display:flex;gap:5px;flex-wrap:wrap">${state.elementsOf(s).map(elChip).join('')}</div></div>
      <div class="sp-lbl" style="margin:16px 0 -6px">Every move it knows</div>
      ${grp}</section>`;
  }
  function bondsHTML(s) {
    const e = Object.entries(s.absorbed || {}).filter(([id]) => creature(id));
    if (!e.length) return `<section class="panel sp-sec"><h2>Bonded animals</h2><p class="sp-muted">None yet. Catch animals in the Garden and drag them onto ${esc(s.name)} to bond. Each one boosts stats, grows body parts and teaches moves.</p></section>`;
    e.sort((a, b) => !!D.RARES[b[0]] - !!D.RARES[a[0]] || b[1] - a[1]);
    const tiles = e.map(([id, n]) => {
      const c = creature(id), t = state.tierOf(id, n);
      return `<div class="sp-bond ${c.rare ? 'rare' : ''}"><span class="cnt">\u00d7${n}</span><canvas data-sp="critter:${id}" data-scale="2"></canvas><b>${esc(c.name)}</b>
        <div class="sp-pips" title="${t} of 3 moves">${[0, 1, 2].map(i => `<i class="${i < t ? 'on' : ''}"></i>`).join('')}</div><small>${c.rare ? 'Rare' : t < 3 ? `Next move at ${[1, 3, 6][t]}` : 'All moves'}</small></div>`;
    }).join('');
    return `<section class="panel sp-sec"><h2>Bonded animals <span class="sp-aside">${e.reduce((a, x) => a + x[1], 0)}</span></h2><div class="sp-bonds">${tiles}</div></section>`;
  }
  function partsHTML(s) {
    const e = Object.entries(s.parts || {}).filter(([, v]) => v > 0);
    const body = e.length ? `<div class="sp-parts">${e.map(([p, v]) => `<div class="sp-part"><b>${partName(p)}</b><div class="bar"><i style="width:${clamp(v, 0, 1) * 100}%;background:var(--plum)"></i></div><small>${PART_HELPS[p] ? '+' + PART_HELPS[p] : v >= 1 ? 'Full' : 'Growing'}</small></div>`).join('')}</div>`
      : `<p class="sp-muted">No extra parts yet. Animals grow them: wings from birds, fins from fish, horns from rams.</p>`;
    return `<section class="panel sp-sec"><h2>Body parts</h2>${e.length ? '<p class="sp-note">Bigger parts help in races: ears for running, fins for swimming, horns and claws for climbing, wings for flying.</p>' : ''}${body}</section>`;
  }
  function battleHTML(s) {
    const b = state.battleStats(s);
    const cell = (v, l) => `<div class="sp-bstat"><span class="num">${v}</span><small>${l}</small></div>`;
    const segs = [['run', 'Run'], ['swim', 'Swim'], ['climb', 'Climb'], ['fly', 'Fly']];
    const races = segs.map(([k, l]) => { const r = state.raceRating(s, k); return `<div class="sp-race"><span class="nm">${l}</span><div class="bar"><i style="width:${clamp(r / 15 * 100, 3, 100)}%;background:${D.STAT_META[D.RACE_STAT[k]].color}"></i></div><span class="num">${r.toFixed(1)}</span></div>`; }).join('')
      + (state.staminaRating ? (() => { const r = state.staminaRating(s); return `<div class="sp-race"><span class="nm">Stamina</span><div class="bar"><i style="width:${clamp(r / 15 * 100, 3, 100)}%;background:${D.STAT_META.stamina.color}"></i></div><span class="num">${r.toFixed(1)}</span></div>`; })() : '');
    return `<section class="panel sp-sec"><h2>Battle stats</h2>
      <div class="sp-bstats">${cell(b.hp, 'HP')}${cell(b.atk, 'Atk')}${cell(b.def, 'Def')}${cell(b.spd, 'Spd')}${cell(Math.round(b.eva * 100) + '%', 'Eva')}</div>
      <p class="sp-muted">Stamina gives HP and Defense, Power gives Attack, Run gives Speed, Fly gives Evasion, Swim adds Defense.</p></section>
      <section class="panel sp-sec"><h2>Race ratings</h2><p class="sp-note">How fast it moves on each kind of course section. Higher is faster.</p>${races}</section>`;
  }
  function recordsHTML(s) {
    const r = s.record || {}, born = s.born ? new Date(s.born).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const rec = (v, l) => `<div class="sp-rec"><span class="num">${v}</span><small>${l}</small></div>`;
    return `<section class="panel sp-sec"><h2>Records</h2><div class="sp-recs">
      ${rec(`${r.raceWins || 0} / ${r.races || 0}`, 'Races won')}${rec(`${r.battleWins || 0} / ${r.battles || 0}`, 'Battles won')}
      ${rec(Object.values(s.absorbed || {}).reduce((a, b) => a + b, 0), 'Animals bonded')}${rec(Math.max(0, Math.floor((Date.now() - (s.born || Date.now())) / 86400000)), 'Days old')}</div>
      ${born ? `<p class="sp-muted">Hatched ${born}${s.bornWith && creature(s.bornWith) ? `, already bonded with a ${esc(creature(s.bornWith).name)}` : ''}.</p>` : ''}</section>`;
  }
  // ---------- style: paint tins, pattern stickers, closet ----------
  const skinOf = s => { const k = s.look && s.look.skin; return k && D.SKINS[k] ? k : null; };
  const skinBadge = s => { const k = skinOf(s); return k ? `<span class="sp-skin"><canvas data-sp="skin:${k}"></canvas>${esc(D.SKINS[k].name)} skin</span>` : ''; };
  const plainNow = s => !s.look || !s.look.pattern || s.look.pattern === 'plain' || !D.PATTERNS[s.look.pattern];
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
      <p>${none ? 'Win paint, stickers and hats from the Gumball machine in the Shop.' : 'Want more? The Gumball machine in the Shop has more paint, stickers and hats.'}</p>
      <button class="btn ${none ? 'primary' : ''}" data-gumball-go>Go to the Gumball machine</button></div>`;
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
      PS.ui.modal({
        eyebrow: 'Stickers', title: `Make ${esc(s.name)} plain?`,
        html: `${BA}<p class="sp-m-left">It's free! The ${esc(D.PATTERNS[s.look.pattern])} pattern comes off. To get it back you'll need another ${esc(D.PATTERNS[s.look.pattern])} sticker.</p>`,
        row: true, buttons: [{ label: 'Not now' }, { label: 'Go plain', kind: 'primary', onClick: () => doStyle(s.id, x => state.usePattern(x, 'plain'), `${s.name} is plain now.`) }],
        mount: card => beforeAfter(card, s, lookWith(s, { pattern: 'plain' })),
      });
      return;
    }
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
  function confirmSell(s) {
    if (!state.canSell(s)) { PX.Sound.play('miss'); PS.ui.toast('You need at least one Sprout.'); return; }
    const price = state.sellPrice(s), id = s.id;
    PS.ui.modal({
      eyebrow: 'Sell', title: `Sell ${esc(s.name)} for ${fmt(price)} coins?`, sprite: s, pose: {},
      html: `<p class="sp-sell-price"><canvas data-sp="icon:coin"></canvas><span class="num">${fmt(price)}</span></p>
        <p>${esc(s.name)} will leave your garden for good. This can't be undone.</p>`,
      row: true, buttons: [{ label: `Keep ${s.name}`, kind: 'primary' }, { label: 'Sell', kind: 'danger', onClick: () => doSell(id) }],
      mount: card => hydrate(card),
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

  function detailHTML(s) {
    const fi = state.formInfo(s), partner = s.id === PS.S.activeId;
    return `<div class="sp-scroll"><div class="sp-wrap">
      <div class="sp-top"><button class="btn sp-back" data-back>\u2039 All Sprouts</button></div>
      <section class="panel sp-hero">
        <div class="sp-stagebox ${esc(s.area)}"><span class="sp-where">${esc(areaName(s.area))}${s.home ? ` \u00b7 resting in the ${esc(state.homeName(s.area))}` : ''}</span><canvas data-hero title="Pet"></canvas></div>
        <div class="sp-namebox"><input class="sp-name-in" maxlength="12" value="${esc(s.name)}" aria-label="Name" enterkeyhint="done" autocomplete="off" spellcheck="false"></div>
        <div class="sp-form"><b>${esc(fi.name)}</b> \u00b7 Stage ${fi.stage + 1} of 3</div><div class="sp-els">${state.elementsOf(s).map(elChip).join('')}${skinBadge(s)}</div>
        <div class="sp-mood">
          <div><small><span>Happiness</span><span>${Math.round(s.happy || 0)}</span></small><div class="bar"><i style="width:${clamp(s.happy || 0, 0, 100)}%;background:var(--berry)"></i></div></div>
          <div><small><span>Energy</span><span>${Math.round(s.energy || 0)}</span></small><div class="bar"><i style="width:${clamp(s.energy || 0, 0, 100)}%;background:var(--sun-edge)"></i></div></div>
        </div>
        <div class="sp-acts">
          <button class="btn ${partner ? '' : 'primary'}" data-partner ${partner ? 'disabled' : ''}>${partner ? '\u2605 Your partner' : 'Set as partner'}</button>
          <button class="btn go" data-visit aria-label="Visit in the ${esc(areaName(s.area))}">Visit</button>
          <button class="btn sp-dress" data-jump-style><canvas data-sp="hat:party" data-scale="2"></canvas>Dress up ${esc(s.name)}</button>
        </div>
      </section>
      ${statsHTML(s)}${natureHTML(s)}${evoHTML(s)}${movesHTML(s)}${styleHTML(s)}${bondsHTML(s)}${partsHTML(s)}${battleHTML(s)}${recordsHTML(s)}
      <button class="btn sp-back" data-back style="justify-self:start">\u2039 All Sprouts</button>
      ${sellHTML(s)}
    </div></div>`;
  }

  // ---------- render ----------
  function render(keepScroll) {
    dirty = false; anims = [];
    const sc = root.querySelector('.sp-scroll'), keep = keepScroll && sc ? sc.scrollTop : 0;
    const s = view === 'detail' ? state.get(curId) : null;
    if (view === 'detail' && !s) view = 'list';
    root.innerHTML = view === 'detail' ? detailHTML(s) : listHTML();
    hydrate(root);
    if (view === 'list') {
      root.querySelectorAll('canvas[data-anim]').forEach(cv => { const sp = state.get(cv.dataset.anim); if (sp) animSprite(cv, state.lookOf(sp), 2, { flap: hasWings(sp) }); });
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
    const sc2 = root.querySelector('.sp-scroll'); if (sc2) sc2.scrollTop = keep;
  }
  let heroAnim = null, mirrorAnim = null;
  function openDetail(id) { curId = id; view = 'detail'; render(false); }

  // ---------- events ----------
  function onClick(e) {
    const q = sel => e.target.closest(sel);
    let b;
    if ((b = q('[data-open]'))) { PX.Sound.play('pop'); openDetail(b.dataset.open); return; }
    if (q('[data-back]')) { PX.Sound.play('tick'); view = 'list'; render(false); return; }
    if ((b = q('[data-hatch]'))) {
      const egg = PS.S.eggs.find(x => x.id === b.dataset.hatch);
      PX.Sound.play('pop');
      if (egg && egg.area !== PS.S.area && D.AREAS[egg.area]) { PS.S.area = egg.area; PS.emit('area', { area: egg.area }); PS.save(); }
      PS.ui.go('garden'); return;
    }
    if (q('[data-go-garden]')) { PS.ui.go('garden'); return; }
    if (q('[data-gumball-go]')) { PX.Sound.play('pop'); PS.ui.go('shop', { tab: 'gumball' }); return; }
    if (q('[data-dev]')) { PS.ui.devPanel(); return; }
    if (q('[data-players]')) { PS.ui.playersPanel(); return; }
    if (q('[data-backup]')) { PS.ui.backupPanel(); return; }
    const s = state.get(curId); if (!s || view !== 'detail') return;
    if (q('[data-partner]')) { state.setActive(s.id); PX.Sound.play('chime'); PS.ui.toast(`${s.name} is now your partner.`); render(true); return; }
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
  };

  PS.scenes.sprouts = {
    mount(el) {
      injectCSS(); root = el;
      root.addEventListener('click', onClick);
      root.addEventListener('change', e => { if (e.target.classList.contains('sp-name-in')) commitName(e.target); });
      root.addEventListener('keydown', e => { if (e.target.classList.contains('sp-name-in') && e.key === 'Enter') e.target.blur(); });
      root.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('sp-name-in') && dirty) setTimeout(() => { if (visible && dirty) render(true); }, 0); });
      ['sprout:update', 'sprout:evolve', 'sprout:sold', 'items', 'egg:new', 'egg:hatch', 'reset'].forEach(ev => PS.on(ev, markDirty));
    },
    show(params) {
      visible = true;
      if (params && params.id && state.get(params.id)) { curId = params.id; view = 'detail'; render(false); if (params.section === 'style') scrollToStyle(false); return; }
      view = 'list'; render(false);
    },
    hide() { visible = false; },
    frame(dt, t) { clock = t; for (const a of anims) drawAnim(a, t); },
  };
})();
