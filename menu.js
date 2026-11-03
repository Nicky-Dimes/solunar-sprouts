// menu.js — Solunar Sprouts title screen: shown at launch (each child picks who's playing) and from the player chip in the top bar.
// The garden is drawn like the game: the sky follows the game clock (a big smiling sun by day that sets behind the hills while the
// sleepy moon rises with the stars at night), the Mushroom House and big tree, everyone's partner Sprouts strolling and hopping on
// the lawn, and a few garden animals (day ones by day, night ones at night). The logo's sun is awake by day and the moon by night.
// Player cards show the partner Sprout, Sprouts, Sprout Book % and trophies. Exposes PS.ui.mainMenu(opts) and PS.ui.closeMainMenu().
(function () {
  'use strict';
  const { state } = PS;
  const E = v => state.esc(v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let root = null, raf = 0, manage = false, lastT = 0, inGame = false, calm = false;
  let walkers = [], critters = [], looksKey = '', critNight = null;

  // an 8-way text outline (the logo letters)
  const ol = (c, w) => [[w, 0], [-w, 0], [0, w], [0, -w], [w, w], [-w, w], [w, -w], [-w, -w]].map(([x, y]) => `${x}px ${y}px 0 ${c}`).join(',');
  const style = document.createElement('style');
  style.textContent = `
  .mm{position:absolute;inset:0;z-index:30;background:#6cc3f2;overflow:hidden}
  .mm-bg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .mm-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
    padding:calc(18px + env(safe-area-inset-top,0px)) 16px calc(130px + env(safe-area-inset-bottom,0px))}
  .mm-inner{max-width:420px;margin:0 auto;display:grid;gap:14px}
  @media (min-width:700px){.mm-inner{max-width:560px}}
  .mm-head{text-align:center;padding:2px 0 0}
  .mm-row{display:flex;align-items:center;justify-content:center;gap:6px}
  .mm-row canvas.mm-side{width:72px;height:72px;flex:0 0 auto;animation:mmBob 3.2s ease-in-out infinite}
  .mm-row canvas.mm-side.mm-moon{animation-delay:-1.6s}
  @keyframes mmBob{50%{transform:translateY(-5px)}}
  .mm-logo{display:flex;flex-direction:column;align-items:center;font-family:var(--f-px);font-weight:700;line-height:.9;letter-spacing:.01em;min-width:0}
  .mm-l1{display:flex;font-size:54px;text-shadow:${ol('#2a2140', 3)},0 7px 0 #2a2140,3px 7px 0 #2a2140,-3px 7px 0 #2a2140}
  .mm-l1 i{font-style:normal;display:inline-block}
  .mm-l1 i:nth-child(odd){transform:translateY(-2px)}
  .mm-l2{position:relative;margin-top:2px;font-size:60px;color:#99e550;text-shadow:${ol('#1f4a2a', 3)},0 7px 0 #1f4a2a,3px 7px 0 #1f4a2a,-3px 7px 0 #1f4a2a}
  .mm-l2::before,.mm-l2::after{content:'';position:absolute;top:-8px;left:12px;width:14px;height:9px;background:#6abe30;border:3px solid #1f4a2a;border-radius:0 100% 0 100%;transform:rotate(-28deg)}
  .mm-l2::after{left:25px;top:-11px;transform:rotate(-62deg) scaleX(-1);background:#99e550}
  .mm-tag{display:inline-block;margin-top:14px;background:var(--panel);border:2px solid var(--line);border-bottom:4px solid var(--edge);border-radius:12px;padding:4px 14px;font-weight:600;font-size:15px;color:var(--ink)}
  .mm-who{text-align:center}
  .mm-who span{display:inline-block;background:var(--panel);border:2px solid var(--edge);border-radius:12px;padding:3px 16px;font-family:var(--f-px);font-weight:700;font-size:21px;color:var(--ink);box-shadow:0 3px 0 rgba(60,40,20,.25);animation:mmPulse 1.6s ease-in-out infinite}
  @keyframes mmPulse{50%{transform:scale(1.06)}}
  .mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .mm-grid.solo{grid-template-columns:1fr}
  .mm-card{background:var(--panel);border:2px solid var(--edge);border-bottom-width:6px;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;min-width:0;box-shadow:0 4px 0 rgba(40,30,60,.18)}
  .mm-card.mm-new{border:3px dashed var(--edge);border-bottom-width:3px;background:rgba(255,248,230,.92)}
  .mm-play{flex:1;border:0;background:transparent;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 0 10px;color:var(--ink);min-width:0;min-height:120px}
  .mm-play:active{background:var(--slot-hi)}
  .mm-play:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
  .mm-tbar{display:flex;align-items:center;justify-content:center;align-self:stretch;background:linear-gradient(#8fd46a,#62a855);border-bottom:3px solid #3f7a3a;padding:6px 10px 5px;min-width:0}
  .mm-play .mm-tbar b{font-family:var(--f-px);font-weight:700;font-size:22px;line-height:1.1;color:#fff;text-shadow:${ol('#2a5a24', 1.5)},0 2px 0 #2a5a24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .mm-tbody{display:flex;flex-direction:column;align-items:center;gap:6px;padding:2px 8px 0;align-self:stretch}
  .mm-avbox{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;align-self:center;width:118px;min-height:112px;border-radius:14px;border:2px solid var(--line);
    background:linear-gradient(#cfeefc 0 60%,#a6dc8f 60% 100%);padding:2px 0 4px}
  .mm-avbox.night{background:linear-gradient(#3b3f86 0 60%,#4f8a64 60% 100%);border-color:#5a5a8a}
  .mm-av{width:96px;height:96px}
  .mm-play .mm-pname{font:700 13px var(--f-ui);color:#2f4a24;background:rgba(255,255,255,.78);border-radius:7px;padding:0 7px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mm-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;align-self:stretch}
  .mm-stat{display:flex;flex-direction:column;align-items:center;background:var(--field);border:2px solid var(--line);border-radius:11px;padding:4px 2px 3px;min-width:0}
  .mm-stat canvas{width:26px;height:26px}
  .mm-play .mm-stat b{font:700 18px/1.1 var(--f-ui);color:var(--ink)}
  .mm-play .mm-stat small{font:600 12px/1.2 var(--f-ui);color:var(--ink-soft)}
  .mm-play .mm-coins{display:flex;align-items:center;gap:5px;font:700 15px var(--f-ui);color:var(--ink)}
  .mm-coins canvas{width:18px;height:18px}
  .mm-when{background:var(--slot);border-radius:8px;padding:1px 10px;font:600 13px var(--f-ui);color:var(--ink-soft)}
  .mm-when.now{background:var(--sun);color:#4a3210}
  .mm-plus-i{display:grid;place-items:center;width:72px;height:72px;margin:18px 0 6px;border-radius:20px;border:3px dashed var(--edge);font:700 44px var(--f-px);color:var(--ink-soft)}
  .mm-new .mm-play b{font-family:var(--f-px);font-size:21px}
  .mm-new .mm-play small{font-size:14px;color:var(--ink-soft);font-weight:600}
  .mm-newform{display:grid;gap:8px;padding:14px;text-align:center;justify-items:center}
  .mm-newform canvas{width:60px;height:72px}
  .mm-newform label{font-size:21px;color:var(--ink)}
  .mm-newform .btn{width:100%;min-height:52px;font-size:19px}
  .mm-newform .field-input{font-size:20px;min-height:48px;text-align:center}
  .mm-tools{display:flex;justify-content:center;gap:4px;border-top:2px dashed var(--line);padding:2px;flex-wrap:wrap}
  .mm-tools .field-input{margin:4px 6px 0}
  .mm-foot{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .mm-foot.solo{grid-template-columns:repeat(3,minmax(0,1fr))}
  .mm-foot .mm-ib{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:68px;padding:8px 4px;font-size:14.5px}
  .mm-ib canvas{width:28px;height:28px}
  .mm-ib.mm-sound canvas{width:26px;height:22px}
  .mm-ver{text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:0 1px 0 #222034;margin:0}
  .mm-remind{display:flex;align-items:center;gap:10px;background:#fff4c2;border:2px solid #e0a800;border-bottom-width:4px;border-radius:16px;padding:8px 10px 8px 12px;font-size:14px;font-weight:600;line-height:1.3}
  .mm-remind span{flex:1}
  .mm-remind .btn{flex:0 0 auto;padding:7px 12px;font-size:15px}
  .mm-tip{background:var(--panel);border:2px dashed var(--edge);border-radius:14px;padding:8px 12px;font-size:13.5px;font-weight:600;line-height:1.35;margin:0;text-align:center}
  @media (max-width:420px){.mm-l1{font-size:44px}.mm-l2{font-size:50px}.mm-row canvas.mm-side{width:56px;height:56px}.mm-grid{gap:9px}
    .mm-avbox{width:100px;min-height:100px}.mm-av{width:84px;height:84px}.mm-play .mm-stat small{font-size:11px}.mm-stat{padding:3px 1px 2px}.mm-play .mm-stat b{font-size:16px}.mm-stat canvas{width:22px;height:22px}}
  @media (max-width:350px){.mm-l1{font-size:38px}.mm-l2{font-size:42px}.mm-row canvas.mm-side{width:44px;height:44px}}
  @media (prefers-reduced-motion: reduce){.mm-who span,.mm-row canvas.mm-side{animation:none}}
  `;
  document.head.appendChild(style);

  function ago(ts) {
    if (!ts) return 'New';
    const then = new Date(ts), now = new Date();
    if (then.toDateString() === now.toDateString()) return 'Played today';
    const days = Math.max(1, Math.round((new Date(now.toDateString()) - new Date(then.toDateString())) / 86400000));
    return days === 1 ? 'Played yesterday' : `Played ${days} days ago`;
  }
  const nightK = () => { try { return PS.clock && PS.clock.night ? clamp(Math.round(PS.clock.night() * 20) / 20, 0, 1) : 0; } catch (e) { return 0; } };
  // a small canvas sized to its picture (pixel art scales up through CSS; a hi-res picture's bitmap is its fine size)
  function put(cv, src) {
    if (!cv || !src) return;
    if (cv.width !== src.width) cv.width = src.width;
    if (cv.height !== src.height) cv.height = src.height;
    cv._pk = src.k || 1; // (app.js snaps it to whole device pixels)
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(src, 0, 0, src.width, src.height);
  }
  // HD drawing helpers (the same recipe as the Sprouts: fine shapes, 1-fine-px lines, one outer ink ring from PX.hd)
  const INK = '#222034';
  const finish = (g, o) => (PX.hd ? PX.hd(g, o) : g);
  const piece = (g0, draw) => { const t = new PX.Grid(g0.w, g0.h, g0.k); draw(t); t.outline(); g0.merge(t); return g0; };
  const arc = (g, cx, cy, rx, ry, a0, a1, col) => { const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * g.k * 1.6)); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; g.dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, col); } return g; }; // a 1-fine-px curve
  const twinkle = (g, x, y, col) => g.dots([[x, y], [x - 0.5, y], [x + 0.5, y], [x, y - 0.5], [x, y + 0.5]], col).dot(x, y, '#ffffff');

  // ---------- the logo's sun and moon: awake or asleep with the game clock ----------
  const faceC = {};
  function sunFace(awake) {
    const k = 'sun' + (awake ? 1 : 0); if (faceC[k]) return faceC[k];
    const g = new PX.Grid(24, 24);
    const ray = awake ? '#ffd23a' : '#e8c070', ink = '#4a2a20';
    piece(g, t => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); PX.stroke(t, [[12 + c * 8.6, 12 + s * 8.6], [12 + c * 10.4, 12 + s * 10.4]], 0.95, 0.55, ray); } });
    piece(g, t => t.ell(12, 12, 7.6, 7.6, awake ? ['#fff6a8', '#ffd23a', '#f0a020'] : ['#f6e6a0', '#e8c070', '#c89a48']));
    if (awake) { for (const x of [9.5, 14.5]) { g.ell(x, 11.0, 0.8, 1.2, ink); g.dots([[x - 0.25, 10.25]], '#ffffff'); } arc(g, 12, 13.2, 1.9, 1.5, 0.18 * Math.PI, 0.82 * Math.PI, ink); }
    else { for (const x of [9.2, 14.8]) arc(g, x, 10.9, 1.2, 1.0, 0.15 * Math.PI, 0.85 * Math.PI, ink); g.dots([[11.5, 15.0], [12.0, 15.0], [12.5, 15.0]], ink); }
    g.ell(7.4, 13.5, 1.2, 0.7, '#f59a8a'); g.ell(16.6, 13.5, 1.2, 0.7, '#f59a8a');
    g.dots([[7.5, 8.0], [8.0, 7.5], [8.5, 7.0], [7.5, 8.5]], awake ? '#ffffff' : '#fff6d0');
    return (faceC[k] = finish(g).canvas());
  }
  function moonFace(awake) {
    const k = 'moon' + (awake ? 1 : 0); if (faceC[k]) return faceC[k];
    const g = new PX.Grid(24, 24), ink = '#3a2a4a';
    g.ell(11, 12, 8.4, 8.4, awake ? ['#fffbe0', '#f2e2a0', '#c9b070'] : ['#e6e2f4', '#c9c2e2', '#9a90bc']);
    g.ell(16, 9.5, 6.8, 6.8, null);
    g.outline();
    if (awake) { g.ell(6.5, 11.8, 0.75, 1.15, ink); g.dot(6.25, 11.0, '#ffffff'); arc(g, 8.0, 14.6, 1.4, 1.1, 0.15 * Math.PI, 0.8 * Math.PI, ink); }
    else { arc(g, 6.4, 12.0, 1.2, 1.0, 0.15 * Math.PI, 0.85 * Math.PI, ink); g.dots([[8.25, 16.25], [8.75, 16.25], [9.25, 16.25]], ink); }
    g.ell(5.2, 15.0, 0.9, 0.55, '#f5a0b8');
    g.dots([[4.0, 9.0], [4.5, 8.0], [5.0, 7.5]], awake ? '#ffffff' : '#f4f2fb');
    finish(g);
    if (awake) { twinkle(g, 20.5, 4.5, '#fff27a'); g.dots([[21.25, 16.25], [17.25, 20.25]], '#fff27a'); }
    else g.dots([[19.0, 2.5], [19.5, 2.5], [20.0, 2.5], [20.0, 3.0], [19.5, 3.5], [19.0, 4.0], [19.0, 4.5], [19.5, 4.5], [20.0, 4.5]], '#c9c2e2');
    return (faceC[k] = g.canvas());
  }
  function paintLogo(n) {
    if (!root) return;
    const day = n < 0.5;
    root.querySelectorAll('.mm-side').forEach(c => { try { put(c, c.classList.contains('mm-moon') ? moonFace(!day) : sunFace(day)); } catch (e) { /* art optional */ } });
  }

  // ---------- Sound + Music buttons ----------
  function paintSound() {
    const b = root && root.querySelector('.mm-sound'); if (!b) return;
    const off = PS.ui.isMuted && PS.ui.isMuted();
    try { put(b.querySelector('canvas'), PS.ui.icon(off ? 'mute' : 'sound')); } catch (e) { /* icon optional */ }
    b.querySelector('span').textContent = off ? 'Sound off' : 'Sound on';
    b.setAttribute('aria-label', off ? 'Sound is off. Tap to turn it on' : 'Sound is on. Tap to turn it off');
  }
  const hasMusic = () => !!(PS.ui.setMusic || (window.PX && PX.Music));
  function musicOn() {
    try { if (PS.ui.musicOn) return !!PS.ui.musicOn(); if (PX.Music) return !PX.Music.muted; } catch (e) { /* audio optional */ }
    return true;
  }
  function setMusic(on) {
    try {
      if (PS.ui.setMusic) PS.ui.setMusic(on);
      else if (PX.Music) { PX.Music.muted = !on; if (!on && PX.Music.stop) PX.Music.stop(300); }
      if (on && PX.Music && root && !root.hidden) PX.Music.play('title');
    } catch (e) { /* audio optional */ }
  }
  function paintMusic() {
    const b = root && root.querySelector('.mm-music'); if (!b) return;
    const show = hasMusic(); b.hidden = !show;
    if (!show) return;
    const on = musicOn();
    try { put(b.querySelector('canvas'), footIcon(on ? 'music' : 'musicoff')); } catch (e) { /* icon optional */ }
    b.querySelector('span').textContent = on ? 'Music on' : 'Music off';
    b.setAttribute('aria-label', on ? 'Music is on. Tap to turn it off' : 'Music is off. Tap to turn it on');
  }

  // a gentle nudge for grown-ups when a player with Sprouts hasn't been backed up for 2 weeks (never for brand-new players)
  function remindBackup(list) {
    const el = root.querySelector('.mm-remind'); if (!el) return;
    const DAY = 86400000, now = Date.now();
    const due = list.filter(p => PS.players.summary(p.id).sprouts > 0 && now - (p.created || now) > 3 * DAY && now - PS.players.lastBackup(p.id) > 14 * DAY);
    el.hidden = !due.length || PS.players.isTesting();
    if (!el.hidden) el.querySelector('span').textContent = due.length === 1 ? `Time for a backup of ${due[0].name}'s Sprouts!` : 'Time for a backup of everyone’s Sprouts!';
  }

  // Sprout Book % and trophies for the cards: worked out for whoever is loaded now, and remembered on this device in a small
  // separate key (never inside a save) so the other players' cards can show theirs too
  const CARD_KEY = 'solunar:cards:v1';
  function cardStats(id, isCur) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(CARD_KEY) || '{}') || {}; } catch (e) { all = {}; }
    if (typeof all !== 'object' || Array.isArray(all)) all = {};
    if (isCur && PS.S) {
      let pct = null, tro = null;
      try { if (PS.book && typeof PS.book.counts === 'function') pct = PS.book.counts().pct; } catch (e) { pct = null; }
      try { if (PS.battle && typeof PS.battle.trophies === 'function') tro = (PS.battle.trophies() || []).filter(x => x && x.got).length; } catch (e) { tro = null; }
      const old = all[id] || {};
      all[id] = { pct: pct == null ? old.pct : pct, tro: tro == null ? old.tro : tro };
      if (!PS.players.isTesting()) try { localStorage.setItem(CARD_KEY, JSON.stringify(all)); } catch (e) { /* storage full: fine */ }
    }
    const r = all[id] || {};
    return { pct: typeof r.pct === 'number' ? r.pct : null, tro: typeof r.tro === 'number' ? r.tro : null };
  }
  // little pixel icons (made once): backups, players, music, and a trophy cup when the trophy art isn't there
  const footC = {};
  function footIcon(kind) {
    if (footC[kind]) return footC[kind];
    const ROWS = {
      backup: ['.kkkkkkkkkkkk.', 'kggggggggggggk', 'kggwwwwwwwwggk', 'kggwwwwwwwwggk', 'kggwwwwwwwwggk', 'kggggggggggggk', 'kggggggggggggk', 'kggkkkkkkkkggk', 'kggkWWWWWWkggk', 'kggkWWkkWWkggk', 'kggkWWkkWWkggk', '.kkkkkkkkkkkk.'],
      players: ['...kkk........', '..kpppk..kkk..', '..kpppk.kqqqk.', '...kkk..kqqqk.', '.kkgggkk.kkk..', 'kgggggggkoook.', 'kgggggggkooook', 'kgggggggkooook', '.kkkkkkk.kkkk.'],
      music: ['....kkk...', '....kyykk.', '....kykyyk', '....kyk.kk', '....kyk...', '....kyk...', '....kyk...', '.kkkkyk...', 'kyyyyyk...', 'kyyyyyk...', 'kyyyyk....', '.kkkk.....'],
      trophy: ['kkkkkkkkkk', 'kyyyyyyyyk', 'kyywyyyyyk', 'kyywyyyyyk', '.kyyyyyyk.', '..kyyyyk..', '...kyyk...', '....kk....', '...kyyk...', '..kkkkkk..'],
    };
    // (music off: the note with a red line across it)
    const R = kind === 'musicoff' ? ROWS.music.map((r, i) => { const c = Math.round(i * 8 / 11); return r.slice(0, c) + 'rr' + r.slice(c + 2); }) : ROWS[kind];
    const pal = { k: INK, g: '#62a855', w: '#fff8e6', W: '#e3cf9d', p: '#f6c8a0', q: '#f6c8a0', o: '#c9a2f0', y: '#ffcc44', r: '#e5535f' };
    return (footC[kind] = finish(PX.fromStrings(R, pal)).canvas()); // (PX.hd smooths the art-pixel steps and thins the inner lines)
  }
  function statIcon(kind, st) {
    if (kind === 'sprouts') return PS.ui.icon('sprouts');
    if (kind === 'coin') return PS.ui.icon('coin');
    if (kind === 'book') { try { if (PS.book && PS.book.icon) return PS.book.icon(); } catch (e) { /* fallback below */ } return PS.ui.icon('garden'); }
    if (kind === 'trophy') {
      try {
        if (typeof PX.trophy === 'function' && PS.battle && typeof PS.battle.trophies === 'function') {
          const L = PS.battle.trophies() || [], t = L.find(x => x && x.got) || L[0];
          if (t) { const c = PX.trophy(t.id, 1, { dim: !(st && st.tro) }); if (c) return c; }
        }
      } catch (e) { /* drawn below */ }
      return footIcon('trophy');
    }
    return PS.ui.icon('garden');
  }

  function build() {
    root = document.createElement('div');
    root.className = 'mm'; root.id = 'mainMenu'; root.hidden = true;
    // an iPhone playing in a Safari tab (not the Home Screen app) can lose its saves after a week without visits
    const safariTab = navigator.standalone === false && window.top === window;
    const L1 = [['S', '#fff27a'], ['o', '#ffe04a'], ['l', '#ffc85a'], ['u', '#ffb4a0'], ['n', '#f2b0dc'], ['a', '#d2a8f4'], ['r', '#b4b8ff']];
    root.innerHTML = `<canvas class="px mm-bg" aria-hidden="true" data-nosnap></canvas>
      <div class="mm-scroll"><div class="mm-inner">
        <header class="mm-head">
          <div class="mm-row"><canvas class="px mm-side mm-sun" width="24" height="24" aria-hidden="true"></canvas>
            <div class="mm-logo" role="img" aria-label="Solunar Sprouts"><div class="mm-l1" aria-hidden="true">${L1.map(([c, col]) => `<i style="color:${col}">${c}</i>`).join('')}</div><div class="mm-l2" aria-hidden="true">Sprouts</div></div>
            <canvas class="px mm-side mm-moon" width="24" height="24" aria-hidden="true"></canvas></div>
          <p class="mm-tag">Raise, race and battle your Sprouts!</p>
        </header>
        <div class="mm-remind" hidden><span></span><button class="btn primary" data-a="backup">Back up</button></div>
        <div class="mm-who"><span>Who's playing?</span></div>
        <div class="mm-grid"></div>
        <div class="mm-foot"><button class="btn mm-ib" data-a="backup"><canvas class="px" data-fi="backup"></canvas><span>Backups</span></button><button class="btn mm-ib" data-a="manage"><canvas class="px" data-fi="players"></canvas><span>Players</span></button><button class="btn mm-ib mm-sound" data-a="sound" type="button"><canvas class="px"></canvas><span>Sound on</span></button><button class="btn mm-ib mm-music" data-a="music" type="button"><canvas class="px"></canvas><span>Music on</span></button></div>
        ${safariTab ? '<p class="mm-tip">Grown-ups: add Solunar Sprouts to the Home Screen (Share, then Add to Home Screen) and play from its icon, so progress is kept safe.</p>' : ''}
        <p class="mm-ver"></p>
      </div></div>`;
    document.getElementById('app').appendChild(root);
    root.querySelectorAll('[data-fi]').forEach(c => { try { put(c, footIcon(c.dataset.fi)); } catch (e) { /* icon optional */ } });
    paintSound(); paintMusic();
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mmName') create(); });
  }

  function renderCards(newForm) {
    const grid = root.querySelector('.mm-grid'), list = PS.players.list(), fresh = PS.players.isFreshInstall(), cur = PS.players.current();
    grid.innerHTML = ''; grid.classList.toggle('solo', fresh);
    const looks = [], night = nightK() > 0.5;
    if (!fresh) for (const p of list) {
      const sm = PS.players.summary(p.id), isCur = !!(cur && p.id === cur.id), st = cardStats(p.id, isCur);
      const stat = (ic, v, label) => `<span class="mm-stat"><canvas class="px" data-mi="${ic}"></canvas><b class="num">${v == null ? '-' : typeof v === 'number' ? v.toLocaleString() : v}</b><small>${label}</small></span>`;
      const now = inGame && isCur;
      const card = document.createElement('div'); card.className = 'mm-card';
      card.innerHTML = `<button class="mm-play" data-play="${p.id}" aria-label="Play as ${E(p.name)}">
          <span class="mm-tbar"><b>${E(p.name)}</b></span>
          <span class="mm-tbody"><span class="mm-avbox${night ? ' night' : ''}"><canvas class="px mm-av"></canvas>${sm.partner ? `<small class="mm-pname">${E(sm.partner.name)}</small>` : ''}</span>
            <span class="mm-stats">${stat('sprouts', sm.sprouts, 'Sprouts')}${stat('book', st.pct == null ? null : st.pct + '%', 'Book')}${stat('trophy', st.tro, 'Trophies')}</span>
            <small class="mm-coins num"><canvas class="px" data-mi="coin"></canvas>${Number(sm.coins || 0).toLocaleString()}${!sm.sprouts && sm.eggs ? ' · egg waiting' : ''}</small>
            <small class="mm-when${now ? ' now' : ''}">${now ? 'Playing now' : ago(p.lastPlayed)}</small></span></button>
        ${manage ? `<div class="mm-tools"><button class="pl-link" data-rename="${p.id}">Rename</button>${list.length > 1 ? `<button class="pl-link" data-remove="${p.id}">Remove</button>` : ''}</div>` : ''}`;
      const av = card.querySelector('canvas.mm-av');
      try {
        if (sm.partner) { const L = state.lookOf(sm.partner); PS.ui.drawSproutTo(av, L, { eyes: 'happy', mouth: 'open' }); looks.push(L); }
        else { const egg = PX.item('egg', 'meadow'), K = egg.k || 1, ew = aw(egg), eh = ah(egg); av.width = 32 * K; av.height = 32 * K; av._pk = K; const g = av.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(egg, Math.round((32 - ew) / 2), 32 - eh - 2, ew, eh); g.setTransform(1, 0, 0, 1, 0, 0); }
      } catch (e) { /* art optional */ }
      card.querySelectorAll('[data-mi]').forEach(c => { try { put(c, statIcon(c.dataset.mi, st)); } catch (e) { /* icon optional */ } });
      grid.appendChild(card);
    }
    const nc = document.createElement('div'); nc.className = 'mm-card mm-new';
    if (fresh || newForm) {
      nc.innerHTML = `<div class="mm-newform"><canvas class="px" width="20" height="24"></canvas>
        <label class="px-title" for="mmName">${fresh ? "What's your name?" : 'New player'}</label>
        <input class="field-input" id="mmName" maxlength="14" autocomplete="off" placeholder="Type a name">
        <button class="btn primary" data-a="create">${fresh ? 'Start playing' : 'Create player'}</button>
        ${fresh ? '' : '<button class="pl-link" data-a="cancelnew">Cancel</button>'}</div>`;
      try { put(nc.querySelector('canvas'), PX.item('egg', 'meadow')); } catch (e) { /* art optional */ }
      if (newForm) grid.classList.add('solo');
    } else {
      nc.innerHTML = `<button class="mm-play" data-a="new"><span class="mm-plus-i">+</span><b>New player</b><small>Start a new garden</small></button>`;
    }
    grid.appendChild(nc);
    root.querySelector('[data-a="manage"] span').textContent = manage ? 'Done' : 'Players';
    root.querySelector('[data-a="manage"]').hidden = fresh;
    root.querySelector('.mm-foot').classList.toggle('solo', fresh || !hasMusic());
    root.querySelector('.mm-ver').textContent = 'Version ' + (window.SOLUNAR_VERSION || 'dev');
    remindBackup(list);
    setCast(looks);
    if (fresh || newForm) setTimeout(() => { const i = root.querySelector('#mmName'); if (i && !fresh) i.focus(); }, 50);
  }

  function choose(id) {
    PX.Sound.unlock(); PX.Sound.play('chime');
    const cur = PS.players.current();
    if (cur && id === cur.id && !PS.players.isTesting()) { PS.players.touch(); close(); PS.ui.refresh(); if (PS.ui.welcome) PS.ui.welcome(); return; }
    PS.players.switchTo(id, true);
  }
  function create() {
    const input = root.querySelector('#mmName'); const name = (input && input.value || '').trim();
    if (!name) { PS.ui.toast('Type a name first'); if (input) input.focus(); return; }
    PX.Sound.unlock(); PX.Sound.play('chime');
    if (PS.players.isFreshInstall()) { const cur = PS.players.current(); PS.players.rename(cur.id, name); PS.players.touch(); close(); PS.ui.refresh(); if (PS.ui.welcome) PS.ui.welcome(); return; }
    const p = PS.players.add(name); PS.players.switchTo(p.id, true);
  }

  function onClick(e) {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.play) { choose(t.dataset.play); return; }
    const a = t.dataset.a;
    if (a === 'new') { PX.Sound.play('pop'); renderCards(true); return; }
    if (a === 'cancelnew') { renderCards(false); return; }
    if (a === 'create') { create(); return; }
    if (a === 'backup') { PX.Sound.play('pop'); PS.ui.backupPanel(); return; }
    if (a === 'sound') { PS.ui.setMuted(!PS.ui.isMuted()); paintSound(); PS.ui.toast(PS.ui.isMuted() ? 'Sound off' : 'Sound on', 1400); return; }
    if (a === 'music') { PX.Sound.unlock(); const on = !musicOn(); setMusic(on); paintMusic(); PS.ui.toast(musicOn() ? 'Music on' : 'Music off', 1400); return; }
    if (a === 'manage') { PX.Sound.play('tick'); manage = !manage; renderCards(false); return; }
    if (t.dataset.rename) {
      const p = PS.players.list().find(x => x.id === t.dataset.rename); const tools = t.closest('.mm-tools');
      tools.innerHTML = `<input class="field-input" maxlength="14" value="${E(p.name)}" aria-label="New name for ${E(p.name)}"><button class="pl-link" data-saveName="${p.id}">Save</button>`;
      const inp = tools.querySelector('input'); inp.focus(); inp.select();
      const save = () => { PS.players.rename(p.id, inp.value); renderCards(false); PS.ui.refresh(); };
      tools.querySelector('[data-savename]').onclick = save;
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(); });
      return;
    }
    if (t.dataset.remove) {
      const id = t.dataset.remove, p = PS.players.list().find(x => x.id === id);
      PS.ui.parentGate(() => PS.ui.modal({ title: `Remove ${E(p.name)}?`, html: `<p>This deletes ${E(p.name)}'s Sprouts and progress on this device. Make a backup first if you might want them back.</p>`, row: true,
        buttons: [{ label: 'Keep' }, { label: 'Remove', kind: 'danger', onClick: () => { const wasCurrent = id === PS.players.current().id; PS.players.remove(id); if (wasCurrent) location.reload(); else renderCards(false); } }] }));
    }
  }

  // ---------- the garden scene ----------
  // Every sprite frame is fetched once when the cast is set (PX caches them), so the drawing loop never builds anything.
  const LANES = [0.5, 0.66, 0.82, 0.95]; // feet rows on the lawn, as a share of its depth (back to front)
  function defaultLook(i) {
    const L = PX.cloneLook(PX.DEFAULT_LOOK);
    if (i === 1) { L.body = 'rose'; L.hat = 'bow'; }
    if (i === 2) { L.body = 'sky'; L.pattern = 'spots'; L.patternColor = '#fbf3dc'; }
    if (i === 3) { L.body = 'lemon'; L.hat = 'leafcap'; }
    if (i === 4) { L.body = 'lilac'; L.extra = 'moon'; }
    return L;
  }
  function setCast(looks) {
    const L = looks.slice(0, 5);
    for (let i = 0; L.length < 4; i++) L.push(defaultLook(i));
    const key = JSON.stringify(L); if (key === looksKey) return; looksKey = key;
    // (each pose is built the first time it's drawn, a few a frame (frameOf), so opening the title never waits for 30 hi-res builds)
    walkers = L.map((look, i) => ({ look, fr: [null, null, null, null, null, null],
      lane: [3, 1, 2, 0, 3][i % 5], x: -1, dir: i % 2 ? -1 : 1, v: 7 + Math.random() * 4, mode: 'walk', tm: 2 + Math.random() * 4, hop: 0, hops: 0, ph: Math.random() * 3 }));
    // (back rows first, so the front Sprouts stand in front)
    walkers.sort((a, b) => a.lane - b.lane);
  }
  const POSES = [{ walk: true, frame: 0 }, { walk: true, frame: 1 }, { frame: 0 }, { frame: 1 }, { frame: 0, eyes: 'blink' }, { eyes: 'happy', mouth: 'open', arms: 'up' }];
  let buildsLeft = 0; // (sprite builds still allowed this frame)
  function frameOf(w, i) {
    const f = w.fr[i]; if (f) return f;
    if (f === null && buildsLeft > 0) { buildsLeft--; let c = false; try { c = PX.sprig(w.look, POSES[i]) || false; } catch (e) { c = false; } w.fr[i] = c; if (c) return c; }
    return w.fr[2] || w.fr[0] || null; // (another pose until this one is ready)
  }
  const DAY_PALS = ['hare', 'butterfly', 'sparrow', 'bee', 'squirrel', 'duck'];
  const NIGHT_PALS = ['owl', 'firefly', 'fox', 'moth', 'firefly', 'raccoon'];
  function setCritters(night) {
    if (critNight === night && critters.length) return; critNight = night;
    const ids = (night ? NIGHT_PALS : DAY_PALS).filter(id => PS.D.ANIMALS[id]);
    const pick = ids.slice().sort(() => Math.random() - 0.5).slice(0, 4);
    critters = pick.map((id, i) => {
      const A = PS.D.ANIMALS[id], n = (PX.critterFrames && PX.critterFrames(id)) || 1, fr = [];
      for (let k = 0; k < Math.min(4, n); k++) { try { fr.push(PX.critter(id, k)); } catch (e) { /* art optional */ } }
      return { id, fr, air: A.where === 'air', glow: id === 'firefly', x: -1, y: 0, dir: i % 2 ? -1 : 1, v: A.where === 'air' ? 6 + Math.random() * 4 : 5 + Math.random() * 3,
        lane: i % 2 ? 2 : 0, ph: Math.random() * 6, rest: 0, alt: 0.25 + Math.random() * 0.45 };
    });
  }

  // (a colour between two hex colours)
  const mix = (a, b, k) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = sh => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  const DAY_SKY = ['#6cc3f2', '#86cff5', '#a4dcf8', '#c4e9fb'], NIGHT_SKY = ['#1a1d48', '#222a5a', '#2c366c', '#3a4580'];
  const GRASS = ['#a2de76', '#8fd46a', '#83ca61', '#76bd58'];
  const aw = c => (PX.artW ? PX.artW(c) : c.width), ah = c => (PX.artH ? PX.artH(c) : c.height);
  // The scene is drawn like the game's scenes: K buffer pixels ("fine pixels") per world pixel (PX.SCENE_K), so the Sprouts,
  // animals and props keep their hi-res detail, and the land, sky, sun and moon are drawn at the same fine size (soft bands,
  // 1-fine-px edges and grass, no dither). World coordinates (Lay) stay in world pixels.
  function layoutOf(ww, wh, K) {
    const hz = Math.round(wh * 0.6), lawnTop = hz + 4, depth = wh - lawnTop;
    return { ww, wh, hz, lawnTop, depth, K, feet: i => Math.round(lawnTop + depth * LANES[i]) };
  }
  const SUN_R = 13, MOON_R = 11;
  // (the sun sets behind the hills as night comes, and the moon rises; both sit low enough to stay clear of the logo)
  const sunAt = (Lay, n) => ({ x: Math.round(Lay.ww * 0.13), y: Math.round(Lay.hz * 0.3 + n * Lay.hz * 0.85) });
  const moonAt = (Lay, n) => ({ x: Math.round(Lay.ww * 0.87), y: Math.round(Lay.hz * 0.3 + (1 - n) * Lay.hz * 0.85) });
  // the big sky sun and moon: hi-res sprites like the Sprouts (made once), no ink edge (they sit in the sky)
  const skyArt = {};
  function skySun() {
    if (skyArt.sun) return skyArt.sun;
    const N = 2 * (SUN_R + 7) + 1, c = N / 2, g = new PX.Grid(N, N), ink = '#7a4a1a';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, ca = Math.cos(a), sa = Math.sin(a), r1 = SUN_R + (i % 2 ? 4 : 6); PX.stroke(g, [[c + ca * (SUN_R + 1.6), c + sa * (SUN_R + 1.6)], [c + ca * r1, c + sa * r1]], 0.75, 0.42, '#ffd23a'); }
    g.ell(c, c, SUN_R + 1, SUN_R + 1, '#e89a1a');
    g.ell(c, c, SUN_R, SUN_R, ['#fff6a8', '#ffd23a', '#e89a1a']);
    for (const x of [c - 4.5, c + 4.5]) { g.ell(x, c + 0.2, 1.0, 1.5, ink); g.dots([[x - 0.5, c - 0.75], [x, c - 0.75], [x - 0.5, c - 0.25], [x, c - 0.25]], '#ffffff'); }
    arc(g, c, c + 1.7, 3.0, 2.4, 0.2 * Math.PI, 0.8 * Math.PI, ink);
    g.ell(c - 7.6, c + 2.4, 1.5, 0.8, '#f59a6a'); g.ell(c + 7.6, c + 2.4, 1.5, 0.8, '#f59a6a');
    g.dots([[c - 8.5, c - 6.5], [c - 8, c - 7.5], [c - 7.5, c - 8], [c - 7, c - 8.5], [c - 6, c - 9], [c - 8.5, c - 6]], '#fffbe0');
    return (skyArt.sun = finish(g, { outer: false }).canvas());
  }
  function skyMoon() {
    if (skyArt.moon) return skyArt.moon;
    const R = MOON_R + 2, N = 2 * R + 1, c = R + 0.5, g = new PX.Grid(N, N), ink = '#3a2a4a';
    g.ell(c, c, MOON_R + 1, MOON_R + 1, '#b8a868');
    g.ell(c, c, MOON_R, MOON_R, ['#fffbe0', '#f2e2a0', '#c9b070']);
    g.ell(c + 6, c - 4, MOON_R - 1, MOON_R - 1, null); // (the bite shows the real sky behind it)
    g.ell(c - 5.5, c + 4.2, 1.2, 1.0, '#d8c880'); g.ell(c - 1.5, c + 7.6, 1.0, 0.6, '#d8c880');
    arc(g, c - 6.5, c - 2.2, 1.4, 1.1, 0.12 * Math.PI, 0.88 * Math.PI, ink);
    arc(g, c - 5.2, c + 2.6, 1.0, 0.8, 0.15 * Math.PI, 0.85 * Math.PI, ink);
    g.ell(c - 8.8, c + 1.4, 0.9, 0.55, '#f5a0b8');
    return (skyArt.moon = finish(g, { outer: false }).canvas());
  }
  // drifting clouds (3 sizes): soft puffs with a pale blue underside
  function cloudSpr(i) {
    const key = 'cloud' + i; if (skyArt[key]) return skyArt[key];
    const w = 12 + (i % 3) * 5, g = new PX.Grid(w, 7);
    g.ell(w / 2, 4.7, w / 2 - 0.2, 1.9, '#ffffff'); g.ell(w * 0.36, 3.4, w * 0.2, 2.3, '#ffffff'); g.ell(w * 0.6, 2.9, w * 0.22, 2.7, '#ffffff');
    for (let fx = 0; fx < g.fw; fx++) { let n = 0; for (let fy = g.fh - 1; fy >= 0 && n < 2; fy--) if (g.fget(fx, fy)) { g.fset(fx, fy, '#dfeafc'); n++; } }
    return (skyArt[key] = finish(g, { outer: false }).canvas());
  }
  // soft round ground shadows and the firefly glow, at fine pixels (made once each)
  function shadowSpr(w, a, K) {
    const key = 'sh' + w + a; if (skyArt[key]) return skyArt[key];
    const c = document.createElement('canvas'); c.width = w * K; c.height = 2 * K; const x = c.getContext('2d');
    x.fillStyle = `rgba(34,32,52,${a})`;
    for (let fy = 0; fy < 2 * K; fy++) { const yy = (fy + 0.5) / K - 1, hw = Math.round(w / 2 * Math.sqrt(Math.max(0, 1 - yy * yy)) * K); x.fillRect(w * K / 2 - hw, fy, hw * 2, 1); }
    if (K > 1) c.k = K;
    return (skyArt[key] = c);
  }
  function fireGlow(K) {
    if (skyArt.glow) return skyArt.glow;
    const S = 9 * K, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot((x + 0.5) / K - 4.5, (y + 0.5) / K - 4.5); if (d < 4.6) { g.fillStyle = `rgba(255,240,140,${(0.55 * (1 - d / 4.6)).toFixed(2)})`; g.fillRect(x, y, 1, 1); } }
    if (K > 1) c.k = K;
    return (skyArt.glow = c);
  }
  // the still part of the garden, made again only when the size or the time of day changes (into one reused canvas, K x the world)
  function buildBg(c, Lay, n) {
    const { ww, wh, hz, lawnTop, K } = Lay, F = 1 / K, FW = ww * K, FH = wh * K;
    if (c.width !== FW) c.width = FW; if (c.height !== FH) c.height = FH;
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, FW, FH);
    g.setTransform(K, 0, 0, K, 0, 0);
    const fr = v => Math.round(v * K) / K; // (snapped to a fine pixel)
    // sky: soft bands from the 4 sky colours and the tones between them
    const base = DAY_SKY.map((col, i) => mix(col, NIGHT_SKY[i], n));
    const NB = 13, bh = (hz + 10) / NB;
    for (let i = 0; i < NB; i++) { const k = i / (NB - 1) * 3, a = Math.floor(k), y0 = fr(i * bh); g.fillStyle = mixRgb(base[a], base[Math.min(3, a + 1)], k - a); g.fillRect(0, y0, ww, wh - y0); }
    // a round disc in fine pixels, centred on (cx, cy)
    const disc = (cx, cy, r, col) => { g.fillStyle = col; const R = Math.ceil(r * K); for (let fy = -R; fy < R; fy++) { const y = (fy + 0.5) / K, hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)) * K) / K; if (hw > 0) g.fillRect(fr(cx - hw), fr(cy) + fy / K, hw * 2, F); } };
    // a faint band of far stars by night (fine dots)
    if (n > 0.04) {
      g.globalAlpha = n; g.fillStyle = mixRgb(base[1], 'rgb(203,219,252)', 0.35);
      for (let fx = 0; fx < FW; fx++) {
        const yc = hz * 0.12 + (fx + 0.5) * F * 0.25, y0 = Math.max(0, Math.floor((yc - 9) * K)), y1 = Math.min(Math.floor((hz - 8) * K), Math.ceil((yc + 9) * K));
        for (let fy = y0; fy < y1; fy++) { const d = Math.abs((fy + 0.5) * F - yc); if (d < 9 && hash(fx, fy + 7919) < 0.1 * (1 - d / 9)) g.fillRect(fx * F, fy * F, F, F); }
      }
      g.globalAlpha = 1;
    }
    const S = sunAt(Lay, n), M = moonAt(Lay, n);
    if (S.y < hz + SUN_R) {
      g.globalAlpha = 0.18; disc(S.x + 0.5, S.y + 0.5, SUN_R + 9, '#fff6c8'); g.globalAlpha = 0.28; disc(S.x + 0.5, S.y + 0.5, SUN_R + 5, '#fff6c8'); g.globalAlpha = 1;
      const sp = skySun(); g.drawImage(sp, S.x + 0.5 - aw(sp) / 2, S.y + 0.5 - ah(sp) / 2, aw(sp), ah(sp));
    }
    if (M.y < hz + MOON_R) {
      g.globalAlpha = 0.07; disc(M.x + 0.5, M.y + 0.5, MOON_R + 9, '#fff6c9'); disc(M.x + 0.5, M.y + 0.5, MOON_R + 5, '#fff6c9'); g.globalAlpha = 1;
      const mp = skyMoon(); g.drawImage(mp, M.x + 0.5 - aw(mp) / 2, M.y + 0.5 - ah(mp) / 2, aw(mp), ah(mp));
    }
    // far mountains (lit left faces, shaded right faces, snowy tops), one fine column at a time
    const tri = v => 1 - 2 * Math.abs(v - Math.floor(v) - 0.5);
    const mt = i => hz - 2 - 26 * (0.66 * Math.pow(tri(i / 74 + 0.15), 1.3) + 0.34 * Math.pow(tri(i / 31 + 0.55), 1.5));
    for (let fx = 0; fx < FW; fx++) {
      const i = (fx + 0.5) * F, top = fr(mt(i)), lit = mt(i + F) < mt(i - F) ? 0 : 1, snow = top < hz - 16, x = fx * F;
      if (snow) { g.fillStyle = '#f8fdff'; g.fillRect(x, top, F, 3); }
      const y0 = snow ? top + 3 : top; g.fillStyle = lit ? '#d4ece6' : '#b4d9d2'; g.fillRect(x, y0, F, hz + 2 - y0);
    }
    // rolling green hills with a 1-fine-px darker edge (joined up the slopes), then the lawn
    const hill = (baseY, amp, f, ph, fill, edge) => {
      const topAt = fx => { const i = (fx + 0.5) * F; return fr(baseY - Math.sin(i * f + ph) * amp - Math.sin(i * f * 2.3 + ph * 2) * amp * 0.3); };
      let prev = topAt(-1), top = topAt(0);
      for (let fx = 0; fx < FW; fx++) {
        const next = topAt(fx + 1), eh = Math.max(F, Math.max(prev, next) - top);
        g.fillStyle = edge; g.fillRect(fx * F, top, F, eh); g.fillStyle = fill; g.fillRect(fx * F, top + eh, F, wh - top - eh);
        prev = top; top = next;
      }
    };
    hill(hz - 5, 5, 0.045, 1, '#a6d98b', '#7fbf6a');
    hill(hz + 1, 2.5, 0.09, 3, '#8fd07a', '#66b35a');
    // the lawn: soft bands from light at the back to deeper at the front (the 4 grass greens and the tones between)
    const NL = 13, depth = wh - lawnTop;
    for (let i = 0; i < NL; i++) { const k = i / (NL - 1) * 3, a = Math.floor(k), y0 = fr(lawnTop + depth * i / NL); g.fillStyle = mix(GRASS[a], GRASS[Math.min(3, a + 1)], k - a); g.fillRect(0, y0, ww, wh - y0); }
    // fine grass blades along the lawn's back edge
    g.fillStyle = '#66b35a';
    for (let fx = 0; fx < FW; fx++) { const h = hash(fx, 3); if (h < 0.5) { const t = h < 0.18 ? 2 : 1; g.fillRect(fx * F, lawnTop - t * F, F, t * F); } }
    // grass tufts (three fine blades) and little flowers (a fine cross of petals round a centre)
    const NT = Math.floor(ww * depth / 90), at = i => [Math.floor(hash(i, 11) * ww), Math.floor(lawnTop + 3 + hash(i, 12) * (depth - 3)) + 1];
    g.fillStyle = '#5aa846';
    for (let i = 0; i < NT; i++) { const [x, y] = at(i); for (const [dx, dy] of [[0, -1], [-1, -2], [1, -1], [1, -2], [1, -3], [2, -1], [3, -2]]) g.fillRect(x + dx * F, y + dy * F, F, F); }
    const PET = ['#ffffff', '#fbf236', '#f7b6c8', '#c9a2f0'];
    for (let p = 0; p < 4; p++) {
      g.fillStyle = PET[p];
      for (let i = p * 3; i < NT; i += 12) { const [x, y] = at(i); for (const [dx, dy] of [[0, -5], [2, -5], [1, -6], [1, -4]]) g.fillRect(x + dx * F, y + dy * F, F, F); }
    }
    for (let p = 0; p < 4; p++) {
      g.fillStyle = p === 1 ? '#ffffff' : '#fbf236';
      for (let i = p * 3; i < NT; i += 12) { const [x, y] = at(i); g.fillRect(x + F, y - 5 * F, F, F); }
    }
    // night: a tint over the land, and the same tint over each prop (so a tall tree is tinted to its top)
    const tint = n > 0.02 ? `rgba(20,18,64,${(0.4 * n).toFixed(3)})` : null, tc = tint ? document.createElement('canvas') : null;
    if (tint) { g.fillStyle = tint; g.fillRect(0, hz - 30, ww, wh - hz + 30); }
    // the garden's props (day art, tinted at night)
    const prop = (kind, fx, y) => {
      try {
        const p = PX.prop(kind); if (!p) return null;
        const x0 = Math.round(fx * ww - aw(p) / 2), y0 = Math.round(y - ah(p));
        if (!tc) { g.drawImage(p, x0, y0, aw(p), ah(p)); return p; }
        tc.width = p.width; tc.height = p.height; const t = tc.getContext('2d');
        t.drawImage(p, 0, 0, p.width, p.height); t.globalCompositeOperation = 'source-atop'; t.fillStyle = tint; t.fillRect(0, 0, p.width, p.height); t.globalCompositeOperation = 'source-over';
        g.drawImage(tc, x0, y0, aw(p), ah(p)); return p;
      } catch (e) { return null; }
    };
    prop('bigtree', 0.09, lawnTop + 10);
    prop('fence', 0.42, lawnTop + 5); prop('fence', 0.42 + 26 / ww, lawnTop + 5);
    prop('bush', 0.27, lawnTop + 6);
    const house = prop('shroomhouse', 0.85, lawnTop + 12);
    const lamp = prop('lamp', 0.66, lawnTop + 14);
    prop('flowerbed', 0.3, lawnTop + 22); prop('mushrooms', 0.58, lawnTop + 20); prop('flowerbed', 0.95, wh - Lay.depth * 0.28);
    prop('bush', 0.04, wh - Lay.depth * 0.18); prop('tree', 0.97, lawnTop + 30);
    // night: warm glows from the lamp and the house windows
    if (tint) {
      const glow = (x, y, r, a) => { for (let k = r; k > 0; k -= 2) { g.globalAlpha = a * (1 - k / (r + 1)) * 0.5; disc(x, y, k, '#ffec96'); } g.globalAlpha = 1; };
      if (lamp) { const lx = Math.round(0.66 * ww), ly = lawnTop + 14 - ah(lamp) + 3; glow(lx + 0.5, ly + 0.5, 9, n); disc(lx + 0.5, ly + 0.5, 1.6, '#fff27a'); }
      if (house) {
        const hx = Math.round(0.85 * ww), hy = lawnTop + 12, H = (PX.HOMES && PX.HOMES.shroomhouse) || { win: [[8, -12]] };
        for (const [dx, dy] of H.win || []) { glow(hx + dx + 0.5, hy + dy + 0.5, 6, n); disc(hx + dx + 0.5, hy + dy + 0.5, 1.6, '#fff27a'); }
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }
  function mixRgb(a, b, k) {
    const p = s => s.match(/\d+/g).map(Number), A = p(a), B = p(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
  }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  let bgCv = null;
  const ST = { w: 0, h: 0, n: -1, bg: null, buf: null, lay: null, chk: -9, nk: 0, stars: null, starA: 0 };
  function drawBg(tNow) {
    const cv = bgCv || (bgCv = root.querySelector('.mm-bg')), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    // K buffer pixels per world pixel; the world zoom is picked so every fine pixel covers a whole number of screen pixels
    const K = PX.SCENE_K || 2, F = 1 / K, dpr = Math.min(2, window.devicePixelRatio || 1);
    const d = Math.max(1, Math.round((W >= 700 ? 3 : 2) * dpr / K)), PXS = d * K / dpr, ww = Math.ceil(W / PXS), wh = Math.ceil(H / PXS);
    // (the clock is asked once a second; nothing here builds strings or objects while the garden just plays)
    if (!(tNow - ST.chk < 1)) { ST.chk = tNow; ST.nk = nightK(); }
    const n = ST.nk;
    if (ST.w !== ww || ST.h !== wh || ST.n !== n) {
      const resized = ST.w !== ww || ST.h !== wh, flipped = (ST.n > 0.5) !== (n > 0.5) || ST.n < 0;
      ST.w = ww; ST.h = wh; ST.n = n; ST.lay = layoutOf(ww, wh, K);
      ST.bg = buildBg(ST.bg || document.createElement('canvas'), ST.lay, n);
      if (!ST.buf) ST.buf = document.createElement('canvas');
      if (ST.buf.width !== ww * K || ST.buf.height !== wh * K) { ST.buf.width = ww * K; ST.buf.height = wh * K; }
      if (!ST.stars) ST.stars = Array.from({ length: 44 }, () => [Math.random(), Math.random() * 0.92, Math.random() * 6]);
      if (resized) { for (const w of walkers) w.x = -1; for (const c of critters) c.x = -1; }
      if (flipped) { setCritters(n > 0.5); paintLogo(n); const box = root.querySelectorAll('.mm-avbox'); for (const b of box) b.classList.toggle('night', n > 0.5); }
    }
    const Lay = ST.lay, b = ST.buf, g = b.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(ST.bg, 0, 0);
    g.setTransform(K, 0, 0, K, 0, 0);
    const tm = calm ? 0 : tNow;
    // twinkling stars (night) and drifting clouds (day)
    if (n > 0.2) {
      g.fillStyle = '#ffffff';
      for (const s of ST.stars) {
        const tw = Math.sin(tNow * 2 + s[2]); if (tw < -0.3) continue;
        const x = Math.round(s[0] * ww * K) / K, y = Math.round(s[1] * (Lay.hz - 14) * K) / K, z = s[2] > 4 ? 2 * F : F;
        g.globalAlpha = n; g.fillRect(x, y, z, z); if (tw > 0.85) { g.fillRect(x - 2 * F, y + z / 2 - F / 2, z + 4 * F, F); g.fillRect(x + z / 2 - F / 2, y - 2 * F, F, z + 4 * F); }
      }
      g.globalAlpha = 1;
    }
    if (n < 0.8) {
      g.globalAlpha = 1 - n;
      for (let i = 0; i < 3; i++) { const cs = cloudSpr(i); g.drawImage(cs, Math.round(((tm * (1.2 + i * 0.5) + i * 83) % (ww + 60)) - 30), Math.round(Lay.hz * (0.32 + i * 0.13)) - 3, aw(cs), ah(cs)); }
      g.globalAlpha = 1;
    }
    const dt = Math.min(0.05, tNow - (lastT || tNow)); lastT = tNow;
    stepCast(dt, tNow, Lay);
    buildsLeft = 4; for (const w of walkers) if (w.fr[2] === null) frameOf(w, 2); // (everyone's standing pose first)
    // critters on the ground behind the Sprouts, fliers above them
    for (const c of critters) {
      const f = c.fr.length > 1 ? c.fr[Math.floor(tNow * 3 + c.ph) % c.fr.length] : c.fr[0]; if (!f) continue;
      if (c.glow && n > 0.3) { g.globalAlpha = n * (0.7 + Math.sin(tNow * 3 + c.ph) * 0.3); g.drawImage(fireGlow(K), Math.round(c.x) - 4, Math.round(c.y) - 10, 9, 9); g.globalAlpha = 1; }
      if (!c.air) g.drawImage(shadowSpr(11, 0.18, K), Math.round(c.x) - 5, Math.round(c.y0) - 1, 11, 2);
      PX.blit(g, f, c.x, c.y, c.dir < 0);
    }
    for (const w of walkers) {
      const fy = Lay.feet(w.lane), hopY = w.mode === 'hop' ? Math.round(Math.sin(Math.min(1, w.hop) * Math.PI) * 7) : 0;
      let f;
      if (w.mode === 'walk') f = frameOf(w, Math.floor(tNow * 6 + w.ph) % 2);
      else if (w.mode === 'hop') f = frameOf(w, 5);
      else f = frameOf(w, ((tNow + w.ph * 1.7) % 3.4) < 0.14 ? 4 : 2 + (Math.floor((tNow + w.ph) / 0.55) % 2));
      const sw = hopY > 3 ? 9 : 13; g.drawImage(shadowSpr(sw, 0.2, K), Math.round(w.x) - (sw - 1) / 2, fy - 1, sw, 2);
      if (f) PX.blit(g, f, w.x, fy - hopY, w.dir < 0, PX.SPRIG_AX, PX.SPRIG_AY);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(b, 0, 0, ww * K * d, wh * K * d);
  }
  // Sprouts stroll, stop for a look round, and now and then hop for joy; animals hop along or flutter about
  function stepCast(dt, tNow, Lay) {
    const ww = Lay.ww;
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.x < 0) w.x = Math.round(ww * (0.12 + ((i * 0.23) % 0.8)));
      if (calm) { w.mode = 'idle'; continue; }
      w.tm -= dt;
      if (w.mode === 'walk') {
        w.x += w.dir * w.v * dt;
        if (w.x > ww - 10) { w.x = ww - 10; w.dir = -1; } else if (w.x < 10) { w.x = 10; w.dir = 1; }
        if (w.tm <= 0) { const r = Math.random(); if (r < 0.35) { w.mode = 'hop'; w.hop = 0; w.hops = 1 + Math.floor(Math.random() * 3); } else { w.mode = 'idle'; w.tm = 1.2 + Math.random() * 2.5; } }
      } else if (w.mode === 'hop') {
        w.hop += dt * 2.6; w.x += w.dir * w.v * 0.5 * dt;
        if (w.hop >= 1) { w.hop = 0; if (--w.hops <= 0) { w.mode = 'idle'; w.tm = 0.6 + Math.random(); } }
      } else if (w.tm <= 0) { w.mode = 'walk'; w.tm = 2.5 + Math.random() * 4; if (Math.random() < 0.4) w.dir = -w.dir; }
    }
    for (const c of critters) {
      if (c.x < 0) { c.x = Math.round(ww * (0.2 + Math.random() * 0.6)); }
      const base = c.air ? Math.round(Lay.hz - 6 + (Lay.lawnTop + Lay.depth * 0.4 - Lay.hz) * c.alt) : Lay.feet(c.lane) - 1;
      c.y0 = base;
      if (calm) { c.y = base; continue; }
      if (c.air) {
        c.x += c.dir * c.v * dt; c.y = base + Math.sin(tNow * 2.2 + c.ph) * 4;
        if (c.x > ww + 12) { c.x = ww + 12; c.dir = -1; } else if (c.x < -12) { c.x = -12; c.dir = 1; }
      } else {
        if (c.rest > 0) { c.rest -= dt; c.y = base; continue; }
        const ph = (tNow * 2.4 + c.ph) % 1; c.x += c.dir * c.v * dt; c.y = base - Math.round(Math.sin(ph * Math.PI) * 3);
        if (c.x > ww - 8) { c.x = ww - 8; c.dir = -1; } else if (c.x < 8) { c.x = 8; c.dir = 1; }
        if (Math.random() < dt * 0.25) { c.rest = 1 + Math.random() * 2; if (Math.random() < 0.5) c.dir = -c.dir; }
      }
    }
  }
  function loop(now) { if (!root || root.hidden) { raf = 0; return; } try { drawBg(now / 1000); } catch (e) { console.error(e); } raf = requestAnimationFrame(loop); }

  function open(opts) {
    if (!root) build();
    inGame = !(opts && opts.launch);
    manage = false;
    const n = nightK(); setCritters(n > 0.5); paintLogo(n);
    renderCards(false); paintSound(); paintMusic();
    root.hidden = false; root.querySelector('.mm-scroll').scrollTop = 0; PS.ui.menuOpen = true;
    try { calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { calm = false; }
    lastT = 0; if (!raf) raf = requestAnimationFrame(loop);
    try { if (window.PX && PX.Music) PX.Music.play('title'); } catch (e) { /* audio optional */ }
  }
  function close() {
    const was = root && !root.hidden;
    if (root) root.hidden = true; PS.ui.menuOpen = false;
    if (was) try { if (PS.ui.music) PS.ui.music(); } catch (e) { /* audio optional */ }
  }

  PS.ui.mainMenu = open;
  PS.ui.closeMainMenu = close;
})();
