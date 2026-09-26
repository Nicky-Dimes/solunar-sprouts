// menu.js — Solunar Sprouts main menu: the title screen shown at launch, where each child picks who's playing.
// Also reachable in-game by tapping the player chip in the top bar. Exposes PS.ui.mainMenu(opts).
(function () {
  'use strict';
  const { state } = PS;
  const E = v => state.esc(v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let root = null, raf = 0, manage = false, walkers = [], lastT = 0, inGame = false;

  const style = document.createElement('style');
  style.textContent = `
  .mm{position:absolute;inset:0;z-index:30;background:#6cc3f2;overflow:hidden}
  .mm-bg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .mm-scroll{position:absolute;inset:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;
    padding:calc(22px + env(safe-area-inset-top,0px)) 16px calc(130px + env(safe-area-inset-bottom,0px))}
  .mm-inner{max-width:420px;margin:0 auto;display:grid;gap:14px}
  .mm-head{text-align:center;padding:4px 0 2px}
  .mm-logo{display:flex;flex-direction:column;align-items:center;font-family:var(--f-px);font-weight:700;line-height:.92;letter-spacing:.01em}
  .mm-logo span{font-size:52px;text-shadow:3px 0 #222034,-3px 0 #222034,0 3px #222034,0 -3px #222034,3px 3px #222034,-3px 3px #222034,3px -3px #222034,-3px -3px #222034,0 7px #222034,3px 7px #222034,-3px 7px #222034}
  .mm-l1{color:#fff27a}
  .mm-l2{color:#99e550}
  .mm-row{display:flex;align-items:center;justify-content:center;gap:10px}
  .mm-row canvas{width:34px;height:34px}
  .mm-tag{display:inline-block;margin-top:12px;background:var(--panel);border:2px solid var(--line);border-bottom-width:4px;border-radius:12px;padding:4px 12px;font-weight:600;font-size:14px}
  .mm-who{text-align:center}
  .mm-who span{display:inline-block;background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:3px 12px;font-family:var(--f-px);font-weight:700;font-size:18px;color:var(--ink)}
  .mm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .mm-grid.solo{grid-template-columns:1fr}
  .mm-card{background:var(--panel);border:2px solid var(--line);border-bottom:5px solid var(--edge);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
  .mm-card.mm-new{border-style:dashed;border-bottom-style:solid}
  .mm-play{flex:1;border:0;background:transparent;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 8px 12px;color:var(--ink);min-width:0}
  .mm-play:active{background:var(--slot-hi)}
  .mm-play:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
  .mm-av{width:88px;height:88px}
  .mm-play b{font-size:21px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mm-play small{font-size:13px;color:var(--ink-soft);font-weight:600;line-height:1.3}
  .mm-when{margin-top:5px;background:var(--slot);border-radius:8px;padding:1px 9px}
  .mm-plus-i{display:grid;place-items:center;width:66px;height:66px;margin:11px 0 9px;border-radius:18px;border:3px dashed var(--edge);font:700 40px var(--f-px);color:var(--ink-soft)}
  .mm-newform{display:grid;gap:8px;padding:14px;text-align:center;justify-items:center}
  .mm-newform canvas{width:60px;height:72px}
  .mm-newform label{font-size:20px;color:var(--ink)}
  .mm-newform .btn{width:100%}
  .mm-tools{display:flex;justify-content:center;gap:4px;border-top:2px dashed var(--line);padding:2px;flex-wrap:wrap}
  .mm-tools .field-input{margin:4px 6px 0}
  .mm-foot{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .mm-foot.solo{grid-template-columns:1fr}
  .mm-ver{text-align:center;font-size:13px;font-weight:600;color:#fff;text-shadow:0 1px 0 #222034;margin:0}
  `;
  document.head.appendChild(style);

  function ago(ts) {
    if (!ts) return 'New';
    const then = new Date(ts), now = new Date();
    if (then.toDateString() === now.toDateString()) return 'Played today';
    const days = Math.max(1, Math.round((new Date(now.toDateString()) - new Date(then.toDateString())) / 86400000));
    return days === 1 ? 'Played yesterday' : `Played ${days} days ago`;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function build() {
    root = document.createElement('div');
    root.className = 'mm'; root.id = 'mainMenu'; root.hidden = true;
    root.innerHTML = `<canvas class="px mm-bg" aria-hidden="true"></canvas>
      <div class="mm-scroll"><div class="mm-inner">
        <header class="mm-head">
          <div class="mm-row"><canvas class="px" data-ic="sun" width="9" height="9"></canvas><div class="mm-logo"><span class="mm-l1">Solunar</span><span class="mm-l2">Sprouts</span></div><canvas class="px" data-ic="moon" width="9" height="9"></canvas></div>
          <p class="mm-tag">Raise, race and battle your Sprouts</p>
        </header>
        <div class="mm-who"><span>Who's playing?</span></div>
        <div class="mm-grid"></div>
        <div class="mm-foot"><button class="btn" data-a="backup">Backups</button><button class="btn" data-a="manage">Manage players</button></div>
        <p class="mm-ver"></p>
      </div></div>`;
    document.getElementById('app').appendChild(root);
    root.querySelectorAll('[data-ic]').forEach(c => PS.ui.paint(c, PS.ui.icon(c.dataset.ic)));
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mmName') create(); });
  }

  function renderCards(newForm) {
    const grid = root.querySelector('.mm-grid'), list = PS.players.list(), fresh = PS.players.isFreshInstall(), cur = PS.players.current();
    grid.innerHTML = ''; grid.classList.toggle('solo', fresh);
    const looks = [];
    if (!fresh) for (const p of list) {
      const sm = PS.players.summary(p.id);
      const what = sm.sprouts ? plural(sm.sprouts, 'Sprout', 'Sprouts') : sm.eggs ? 'Egg waiting to hatch' : 'No Sprouts yet';
      const card = document.createElement('div'); card.className = 'mm-card';
      card.innerHTML = `<button class="mm-play" data-play="${p.id}" aria-label="Play as ${E(p.name)}"><canvas class="px mm-av"></canvas>
          <b class="px-title">${E(p.name)}</b><small>${what}</small><small class="num">${Number(sm.coins || 0).toLocaleString()} coins</small><small class="mm-when">${inGame && cur && p.id === cur.id ? 'Playing now' : ago(p.lastPlayed)}</small></button>
        ${manage ? `<div class="mm-tools"><button class="pl-link" data-rename="${p.id}">Rename</button>${list.length > 1 ? `<button class="pl-link" data-remove="${p.id}">Remove</button>` : ''}</div>` : ''}`;
      const av = card.querySelector('canvas');
      if (sm.partner) { const L = state.lookOf(sm.partner); PS.ui.drawSproutTo(av, L, { eyes: 'happy', mouth: 'open' }); looks.push(L); }
      else { av.width = 32; av.height = 32; const g = av.getContext('2d'), egg = PX.item ? PX.item('egg', 'meadow') : PX.prop('egg'); g.imageSmoothingEnabled = false; g.drawImage(egg, Math.round((32 - egg.width) / 2), 32 - egg.height - 2); }
      grid.appendChild(card);
    }
    const nc = document.createElement('div'); nc.className = 'mm-card mm-new';
    if (fresh || newForm) {
      nc.innerHTML = `<div class="mm-newform"><canvas class="px" width="20" height="24"></canvas>
        <label class="px-title" for="mmName">${fresh ? "What's your name?" : 'New player'}</label>
        <input class="field-input" id="mmName" maxlength="14" autocomplete="off" placeholder="Type a name">
        <button class="btn primary" data-a="create">${fresh ? 'Start playing' : 'Create player'}</button>
        ${fresh ? '' : '<button class="pl-link" data-a="cancelnew">Cancel</button>'}</div>`;
      const egg = PX.item ? PX.item('egg', 'meadow') : PX.prop('egg');
      PS.ui.paint(nc.querySelector('canvas'), egg);
      if (newForm) grid.classList.add('solo');
    } else {
      nc.innerHTML = `<button class="mm-play" data-a="new"><span class="mm-plus-i">+</span><b class="px-title">New player</b><small>Start a new garden</small></button>`;
    }
    grid.appendChild(nc);
    root.querySelector('[data-a="manage"]').textContent = manage ? 'Done' : 'Manage players';
    root.querySelector('[data-a="manage"]').hidden = fresh;
    root.querySelector('.mm-foot').classList.toggle('solo', fresh);
    root.querySelector('.mm-ver').textContent = 'Version ' + (window.SOLUNAR_VERSION || 'dev');
    setWalkers(looks);
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

  // ---------- animated background: split day/night sky, hills, and everyone's partner Sprouts strolling ----------
  function setWalkers(looks) {
    if (!looks.length) { const a = PX.cloneLook(PX.DEFAULT_LOOK), b = PX.cloneLook(PX.DEFAULT_LOOK), c = PX.cloneLook(PX.DEFAULT_LOOK); b.body = 'rose'; b.parts.ears = 1; c.body = 'sky'; c.parts.fins = 0.5; looks = [a, b, c]; }
    walkers = looks.slice(0, 6).map((L, i) => ({ L, x: 12 + i * 26 + Math.random() * 6, dir: i % 2 ? -1 : 1, v: 6 + Math.random() * 5, hop: Math.random() * 3 }));
  }
  function drawBg(tNow) {
    const cv = root.querySelector('.mm-bg'), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    const PXS = clamp(Math.round(W / 125), 3, 5), ww = Math.ceil(W / PXS), wh = Math.ceil(H / PXS);
    if (!drawBg.buf || drawBg.buf.width !== ww || drawBg.buf.height !== wh) { drawBg.buf = document.createElement('canvas'); drawBg.buf.width = ww; drawBg.buf.height = wh; drawBg.stars = Array.from({ length: 36 }, () => [Math.random(), Math.random() * 0.7]); }
    const b = drawBg.buf, g = b.getContext('2d'); g.imageSmoothingEnabled = false;
    const day = ['#6cc3f2', '#86cff5', '#a4dcf8', '#c4e9fb'], night = ['#171644', '#22205a', '#2c2c66', '#3a347a'];
    const groundY = wh - 26, bh = Math.ceil(groundY / 4);
    for (let i = 0; i < 4; i++) {
      for (let y = i * bh; y < Math.min(groundY, (i + 1) * bh); y++) {
        const split = Math.round(ww * 0.62 - y * 0.35);
        g.fillStyle = day[i]; g.fillRect(0, y, Math.max(0, split), 1);
        g.fillStyle = night[i]; g.fillRect(Math.max(0, split), y, ww - Math.max(0, split), 1);
      }
    }
    for (const [sx, sy] of drawBg.stars) { const x = Math.round(sx * ww), y = Math.round(sy * groundY); if (x > ww * 0.62 - y * 0.35 + 2 && Math.floor(tNow * 2 + sx * 9) % 5) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); } }
    const disc = (cx, cy, r, col) => { g.fillStyle = col; for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) if (a * a + c * c <= r * r + r * 0.5) g.fillRect(cx + a, cy + c, 1, 1); };
    disc(14, 16, 7, '#fbf3dc'); disc(14, 16, 5, '#fff27a');
    disc(ww - 16, 18, 6, '#e8ecff'); disc(ww - 13, 16, 5, night[0]);
    const hill = (base, amp, f, ph, fill, edge) => { for (let i = 0; i < ww; i++) { const top = Math.round(base - Math.sin(i * f + ph) * amp); g.fillStyle = edge; g.fillRect(i, top, 1, 1); g.fillStyle = fill; g.fillRect(i, top + 1, 1, wh - top); } };
    hill(groundY - 8, 5, 0.06, 1, '#8fd07a', '#66b35a');
    hill(groundY, 1.5, 0.12, 3, '#80cf6c', '#4fae3a');
    g.fillStyle = '#6abe30'; g.fillRect(0, groundY + 8, ww, wh);
    const dt = Math.min(0.05, tNow - (lastT || tNow)); lastT = tNow;
    walkers.sort((a, c) => a.x - c.x).forEach((w, i) => {
      w.x += w.dir * w.v * dt; if (w.x > ww + 18) w.x = -18; if (w.x < -18) w.x = ww + 18;
      const frame = Math.floor(tNow * 7 + i) % 2, hopY = Math.floor(tNow * 3.5 + w.hop) % 7 === 0 ? 2 : 0;
      const y = groundY + 10 + (i % 2) * 5;
      g.fillStyle = 'rgba(34,32,52,.2)'; g.fillRect(Math.round(w.x) - 6, y - 1, 13, 2);
      PX.blit(g, PX.sprig(w.L, { walk: true, frame, eyes: hopY ? 'happy' : undefined, mouth: hopY ? 'open' : 'smile' }), w.x, y - hopY, w.dir < 0, PX.SPRIG_AX, PX.SPRIG_AY);
    });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(b, 0, 0, ww * PXS * dpr, wh * PXS * dpr);
  }
  function loop(now) { if (!root || root.hidden) { raf = 0; return; } drawBg(now / 1000); raf = requestAnimationFrame(loop); }

  function open(opts) {
    if (!root) build();
    inGame = !(opts && opts.launch);
    manage = false;
    renderCards(false);
    root.hidden = false; root.querySelector('.mm-scroll').scrollTop = 0;
    lastT = 0; if (!raf) raf = requestAnimationFrame(loop);
  }
  function close() { if (root) root.hidden = true; }

  PS.ui.mainMenu = open;
  PS.ui.closeMainMenu = close;
})();
