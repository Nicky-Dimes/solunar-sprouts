// app.js — Solunar Sprouts shell: screen switching, HUD, one shared animation loop, modals, toasts, sprout picker, dev tools.
//
// SCENE CONTRACT: each screen module registers
//   PS.scenes.<name> = { mount(rootEl), show(params), hide(), frame(dt, t) }
// mount() runs once, the first time the screen is shown. frame() runs every animation frame while the screen is visible.
// Full-screen play (a race or battle in progress) calls PS.ui.chrome(false) to hide the HUD and nav, and PS.ui.hold(true)
// so evolution/egg pop-ups wait; call chrome(true) and hold(false) when the player is back on a menu.
(function () {
  'use strict';
  const { D, state } = PS;
  const $ = id => document.getElementById(id);
  PS.scenes = PS.scenes || {};
  let current = null, mounted = {}, t = 0;

  // ---------------- tiny pixel icons for the chrome ----------------
  // Drawn like the Sprouts (one level of detail everywhere): 2 fine pixels per art pixel, smooth shapes (ell / sell / poly /
  // stroke), soft 5-step shading lit from the upper left, 1-fine-pixel inner lines, fine detail with dot / dots, and one outer
  // ink ring from PX.hd. Each kind is made once (a few small canvases; callers only read them).
  const iconC = {};
  const INK = '#222034', GOLD = ['#fff27a', '#f6c83a', '#c7861c'], LEAF = ['#a6ec70', '#6abe30', '#37946e'];
  const IN = g => { const f = (x, y) => g.filled(x, y); f.fine = true; return f; }; // (a fine mask: only where the grid is filled)
  const piece = (g0, draw) => { const t = new PX.Grid(g0.w, g0.h, g0.k); draw(t); t.outline(); g0.merge(t); return g0; }; // its own 1-fine-px outline
  const finish = (g, o) => (PX.hd ? PX.hd(g, o) : g);
  function icon(kind) {
    const have = iconC[kind]; if (have) return have;
    let c = null;
    try { c = drawIcon(kind); } catch (e) { console.error('icon', kind, e); }
    if (!c) { const g = new PX.Grid(9, 9); g.ell(4.5, 4.5, 3.5, 3.5, ['#dfe3ea', '#8c93a8', '#595a70']); g.outline(); c = finish(g).canvas(); }
    return (iconC[kind] = c);
  }
  function drawIcon(kind) {
    const G = PX.Grid, g = new G(16, 16);
    switch (kind) {
      case 'garden': // a round fruit tree: soft canopy, bark, two shiny apples
        g.poly([[6.9, 15.4], [7.3, 9.4], [8.7, 9.4], [9.1, 15.4]], '#8f563b'); g.poly([[5.6, 15.4], [7.2, 14.2], [8.8, 14.2], [10.4, 15.4]], '#8f563b');
        g.ell(8, 6.4, 5.7, 4.7, LEAF[1]); g.ell(4.3, 8.4, 2.9, 2.3, LEAF[1]); g.ell(11.7, 8.4, 2.9, 2.3, LEAF[1]);
        g.sell(8, 7.0, 6.6, 5.6, LEAF, 0, IN(g));
        g.outline();
        g.dots([[7.6, 10.5], [7.6, 11.5], [7.6, 12.5], [8.1, 13.0]], '#b07850');
        g.dots([[5.0, 4.6], [5.5, 4.6], [5.0, 5.1], [9.6, 3.6], [10.1, 3.6], [3.5, 7.6], [4.0, 7.6], [11.5, 6.1], [12.0, 6.1]], '#c8f490');
        for (const [x, y] of [[10.6, 7.8], [5.6, 6.0]]) { g.ell(x, y, 1.15, 1.1, ['#ff8a90', '#e23e4a', '#9a2232']); g.dot(x - 0.5, y - 0.5, '#ffffff'); }
        g.outerLine(); return g.canvas();
      case 'race': { // a waving checkered flag
        g.poly([[3.0, 2.0], [3.9, 2.0], [3.9, 15.4], [3.0, 15.4]], '#8c93a8'); g.dots([[3.0, 3], [3.0, 4], [3.0, 5], [3.0, 6], [3.0, 7], [3.0, 8], [3.0, 9], [3.0, 10], [3.0, 11], [3.0, 12], [3.0, 13], [3.0, 14]], '#d8dee8');
        const wave = x => Math.sin((x - 4) * 0.75) * 0.7, top = [], bot = [];
        for (let x = 4; x <= 13.6; x += 0.4) { top.push([x, 2.4 + wave(x)]); bot.unshift([x, 9.4 + wave(x)]); }
        const F = new G(16, 16); F.poly(top.concat(bot), '#ffffff');
        for (let fy = 0; fy < F.fh; fy++) for (let fx = 0; fx < F.fw; fx++) if (F.fget(fx, fy)) {
          const x = (fx + 0.5) / F.k, y = (fy + 0.5) / F.k - wave(x), cx = Math.floor((x - 4) / 1.6), cy = Math.floor((y - 2.4) / 1.75);
          const dark = (cx + cy) & 1, sh = wave(x + 0.6) > wave(x) ? 0 : 1;
          F.fset(fx, fy, dark ? (sh ? INK : '#3a3858') : (sh ? '#dfe8fb' : '#ffffff'));
        }
        g.merge(F); g.ell(3.45, 1.6, 1.05, 1.05, GOLD);
        g.outline(); g.dot(3.1, 1.2, '#ffffff'); g.outerLine(); return g.canvas();
      }
      case 'battle': { // two crossed swords (silver and gold)
        const sword = (t, m, blade, edge, guard) => {
          const X = x => (m ? 16 - x : x);
          PX.stroke(t, [[X(5.4), 10.6], [X(12.6), 3.4]], 0.95, 0.8, blade); t.poly([[X(12.0), 2.8], [X(14.0), 2.0], [X(13.2), 4.0]], blade);
          PX.stroke(t, [[X(2.9), 9.6], [X(6.4), 13.1]], 0.55, 0.55, guard); PX.stroke(t, [[X(4.4), 11.6], [X(2.6), 13.4]], 0.6, 0.6, '#8f563b'); t.ell(X(2.2), 13.8, 0.85, 0.85, guard);
          for (let i = 0; i < 7; i++) t.dot(X(6.4 + i), 9.2 - i, edge);
        };
        const A = new G(16, 16); sword(A, false, '#dfe8fb', '#ffffff', '#f6c83a'); A.outline();
        const B = new G(16, 16); sword(B, true, '#fcd850', '#fff6b0', '#d24552'); B.outline();
        g.merge(A); g.merge(B); g.outerLine(); return g.canvas();
      }
      case 'shop': { // the round pink money pouch: frilly top, tie band, a gold coin
        const PR = ['#ffc8dc', '#e07ba0', '#a2477a'];
        piece(g, t => { t.ell(8, 9.9, 5.7, 5.0, PR[1]); t.poly([[5.9, 6.0], [10.1, 6.0], [9.2, 3.8], [6.8, 3.8]], PR[1]); t.sell(7.4, 9.0, 6.6, 6.4, PR, 0, IN(t)); });
        piece(g, t => t.sell(8, 2.7, 2.7, 1.35, ['#fff0f6', PR[0], PR[1]]));
        piece(g, t => t.poly([[5.6, 4.0], [10.4, 4.0], [10.4, 5.2], [5.6, 5.2]], '#b8508a'));
        piece(g, t => t.sell(8, 10.5, 2.5, 2.5, GOLD));
        g.dots([[8, 9.5], [8, 10.0], [8, 10.5], [8, 11.0], [8, 11.5]], '#c7861c'); g.dot(7.0, 9.4, '#ffffff'); g.dots([[3.4, 8.4], [3.4, 8.9], [3.9, 7.9]], '#ffe4f0'); g.dot(6.6, 4.3, '#e88ab8');
        g.outerLine(); return g.canvas();
      }
      case 'arcade': { // an arcade stick: plum base, red ball, sunny button
        const PB = ['#c9a2f0', '#9a6ad0', '#5e3a8c'];
        const B = new G(16, 16); B.poly([[2.0, 10.0], [14.0, 10.0], [14.4, 14.4], [1.6, 14.4]], PB[1]); B.sell(6.4, 11.0, 9.6, 5.0, PB, 0, IN(B)); B.outline();
        g.merge(B); piece(g, t => t.poly([[5.4, 4.4], [6.6, 4.4], [6.7, 10.6], [5.3, 10.6]], '#8c93a8'));
        piece(g, t => t.sell(6, 4.0, 2.8, 2.6, ['#ff9a9a', '#e5535f', '#962b36']));
        piece(g, t => t.sell(11, 10.9, 1.9, 1.3, GOLD));
        g.dots([[5.0, 2.8], [5.5, 2.8], [5.0, 3.3]], '#ffffff'); g.dot(10.4, 10.4, '#ffffff'); g.dots([[3.0, 11.0], [3.5, 11.0], [4.0, 11.0]], '#e8d8ff');
        g.outerLine(); return g.canvas();
      }
      case 'sprouts': return navSprout();
      case 'coin': { // a gold coin: soft round shading, an engraved slot with a lit edge, a shine
        const c = new G(9, 9); c.ell(4.5, 4.5, 3.5, 3.5, GOLD); c.outline();
        c.dots([[4.25, 3.0], [4.25, 3.5], [4.25, 4.0], [4.25, 4.5], [4.25, 5.0], [4.25, 5.5], [4.25, 6.0]], '#c7861c');
        c.dots([[4.75, 3.0], [4.75, 3.5], [4.75, 4.0], [4.75, 4.5], [4.75, 5.0], [4.75, 5.5], [4.75, 6.0]], '#fff27a');
        c.dots([[2.75, 2.75], [3.25, 2.25], [2.75, 3.25]], '#ffffff');
        return finish(c).canvas();
      }
      case 'sun': { // a small sun: soft disc and eight little rays (the clock by day)
        const c = new G(9, 9);
        piece(c, t => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), q = i % 2 ? 3.2 : 3.45; t.poly([[4.5 + Math.cos(a - 0.36) * 2.2, 4.5 + Math.sin(a - 0.36) * 2.2], [4.5 + ca * q, 4.5 + sa * q], [4.5 + Math.cos(a + 0.36) * 2.2, 4.5 + Math.sin(a + 0.36) * 2.2]], '#f6c83a'); } });
        piece(c, t => t.ell(4.5, 4.5, 2.35, 2.35, GOLD));
        c.dots([[3.5, 3.5], [4.0, 3.25], [3.25, 4.0]], '#ffffff');
        return finish(c).canvas();
      }
      case 'moon': { // a lilac crescent (the clock by night)
        const c = new G(9, 9); c.ell(4.2, 4.7, 3.45, 3.45, ['#e8d8ff', '#c9a2f0', '#9a6ad0']); c.ell(6.1, 3.3, 2.7, 2.7, null); c.outline();
        c.dots([[2.0, 4.5], [2.0, 5.0], [2.25, 5.5]], '#f4ecff');
        return finish(c).canvas();
      }
      case 'sound': case 'mute': { // a little speaker, with sound waves or a red cross
        const c = new G(13, 11);
        piece(c, t => { t.poly([[1.2, 3.9], [3.8, 3.9], [3.8, 7.1], [1.2, 7.1]], '#dfe8fb'); t.poly([[3.6, 4.0], [7.0, 1.3], [7.0, 9.7], [3.6, 7.0]], '#dfe8fb'); });
        finish(c, { shade: 0.16 });
        c.dots([[2.0, 4.6], [2.0, 5.1], [5.0, 3.4], [5.5, 3.0], [6.0, 2.6]], '#ffffff');
        if (kind === 'sound') { const w = (r, s) => { const p = []; for (let a = -s; a <= s + 1e-6; a += s / 6) p.push([7.6 + Math.cos(a) * r, 5.5 + Math.sin(a) * r]); PX.stroke(c, p, 0.5, 0.5, INK); }; w(2.0, 0.75); w(4.0, 0.8); }
        else { const X = new G(13, 11); PX.stroke(X, [[8.6, 3.6], [11.6, 7.4]], 0.6, 0.6, '#d24552'); PX.stroke(X, [[11.6, 3.6], [8.6, 7.4]], 0.6, 0.6, '#d24552'); X.outline(); c.merge(X); }
        return c.canvas();
      }
      case 'music': case 'nomusic': { // two little notes on a beam, or crossed out (same size as the speaker)
        const c = new G(13, 11);
        piece(c, t => {
          t.ell(3.3, 8.2, 2.0, 1.45, '#dfe8fb', -0.35); t.ell(9.6, 7.2, 2.0, 1.45, '#dfe8fb', -0.35);
          t.poly([[4.4, 2.8], [5.3, 2.8], [5.3, 8.1], [4.4, 8.1]], '#dfe8fb'); t.poly([[10.7, 1.6], [11.6, 1.6], [11.6, 7.1], [10.7, 7.1]], '#dfe8fb');
          t.poly([[4.4, 2.6], [11.6, 1.0], [11.6, 2.8], [4.4, 4.4]], '#dfe8fb');
        });
        finish(c, { shade: 0.16 });
        c.dots([[2.4, 7.6], [2.9, 7.3], [8.7, 6.6], [9.2, 6.3]], '#ffffff');
        if (kind === 'nomusic') { const X = new G(13, 11); PX.stroke(X, [[1.6, 1.4], [11.4, 9.6]], 0.6, 0.6, '#d24552'); X.outline(); c.merge(X); }
        return c.canvas();
      }
      case 'trophy': { // a gold cup with handles on a little wooden stand
        piece(g, t => { t.poly([[4.4, 12.3], [11.6, 12.3], [12.3, 14.6], [3.7, 14.6]], '#8f563b'); t.sell(7.0, 12.0, 6.5, 3.6, ['#c28569', '#8f563b', '#663931'], 0, IN(t)); });
        piece(g, t => t.poly([[7.1, 8.6], [8.9, 8.6], [8.7, 12.4], [7.3, 12.4]], '#c7861c'));
        piece(g, t => { PX.stroke(t, [[4.2, 3.2], [2.2, 3.4], [2.0, 5.2], [4.4, 6.6]], 0.55, 0.55, '#f6c83a'); PX.stroke(t, [[11.8, 3.2], [13.8, 3.4], [14.0, 5.2], [11.6, 6.6]], 0.55, 0.55, '#f6c83a'); });
        piece(g, t => { t.poly([[3.4, 2.0], [12.6, 2.0], [12.0, 6.6], [10.0, 9.0], [6.0, 9.0], [4.0, 6.6]], '#f6c83a'); t.sell(7.0, 4.0, 7.0, 6.2, GOLD, 0, IN(t)); });
        g.dots([[4.0, 2.75], [4.5, 2.75], [5.0, 2.75], [5.5, 2.75], [6.0, 2.75], [6.5, 2.75], [7.0, 2.75], [7.5, 2.75], [8.0, 2.75], [8.5, 2.75], [9.0, 2.75], [9.5, 2.75], [10.0, 2.75], [10.5, 2.75], [11.0, 2.75], [11.5, 2.75]], '#fff6b0');
        g.dots([[5.25, 3.5], [5.25, 4.0], [5.25, 4.5], [5.5, 5.0], [5.75, 5.5], [6.25, 6.0]], '#ffffff');
        return finish(g).canvas();
      }
      case 'heart': {
        piece(g, t => { t.ell(5.4, 6.2, 3.1, 3.0, '#e5535f'); t.ell(10.6, 6.2, 3.1, 3.0, '#e5535f'); t.poly([[2.45, 7.0], [13.55, 7.0], [8, 13.6]], '#e5535f'); t.sell(7.2, 6.8, 7.0, 7.2, ['#ff9a9a', '#e5535f', '#962b36'], 0, IN(t)); });
        g.dots([[4.0, 4.5], [4.5, 4.0], [5.0, 4.0], [4.0, 5.0]], '#ffffff'); g.dot(5.5, 4.0, '#ffd8d8');
        return finish(g).canvas();
      }
      case 'gift': { // a red present with a sunny ribbon and bow
        piece(g, t => t.poly([[2.2, 6.6], [13.8, 6.6], [13.8, 14.4], [2.2, 14.4]], '#e5535f'));
        piece(g, t => t.poly([[1.3, 4.4], [14.7, 4.4], [14.7, 7.0], [1.3, 7.0]], '#f77a84'));
        piece(g, t => t.poly([[7.0, 4.4], [9.0, 4.4], [9.0, 14.4], [7.0, 14.4]], '#fff27a'));
        piece(g, t => { t.ell(5.7, 2.9, 2.2, 1.35, '#fff27a', 0.4); t.ell(10.3, 2.9, 2.2, 1.35, '#fff27a', -0.4); });
        piece(g, t => t.ell(8, 3.7, 1.05, 0.95, '#f6c83a'));
        finish(g, { shade: 0.14 });
        g.dots([[2.5, 4.9], [3.0, 4.9], [3.5, 4.9], [2.75, 7.5], [2.75, 8.0], [2.75, 8.5]], '#ffd0d4'); g.dots([[7.5, 5.0], [7.5, 5.5], [7.5, 8.0], [7.5, 8.5], [7.5, 9.0]], '#fff9c4');
        return g.canvas();
      }
    }
    return null;
  }
  // the Sprouts tab: the hi-res Sprout drawn at the same pixel size as the other 16 x 16 tab icons (half its own size: each
  // 2 x 2 block becomes one fine pixel, ink wins so its lines stay, other colours blend), with the same outer ink ring
  function navSprout() {
    if (PX.sprigAt) { // HD Sprouts (art-sprouts-hd.js): the smooth Sprout at half size (16 art px at k = 4), its outline drawn
      // twice as bold first so that, halved, it matches the other tab icons' line
      const big = PX.sprigAt(PX.cloneLook(PX.DEFAULT_LOOK), { eyes: 'happy', mouth: 'open' }, 8, { olw: 1.6 }), c = document.createElement('canvas');
      c.width = c.height = 64; c.k = 4; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(big, 0, 0, 64, 64);
      return c;
    }
    const src = PX.sprig(PX.cloneLook(PX.DEFAULT_LOOK), { eyes: 'happy', mouth: 'open' }), k = src.k || 1;
    if (k !== 2 || src.width !== 64) return src;
    const d = src.getContext('2d').getImageData(0, 0, 64, 64).data, g = new PX.Grid(16, 16), hex = v => (v < 16 ? '0' : '') + v.toString(16);
    for (let fy = 0; fy < 32; fy++) for (let fx = 0; fx < 32; fx++) {
      let r = 0, gg = 0, b = 0, n = 0, ink = false;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((fy * 2 + dy) * 64 + fx * 2 + dx) * 4; if (d[i + 3] < 128) continue;
        if (d[i] === 0x22 && d[i + 1] === 0x20 && d[i + 2] === 0x34) ink = true;
        r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
      }
      if (ink) g.fset(fx, fy, INK); else if (n >= 2) g.fset(fx, fy, '#' + hex(Math.round(r / n)) + hex(Math.round(gg / n)) + hex(Math.round(b / n)));
    }
    g.outerLine();
    return g.canvas();
  }
  // copy a sprite into a canvas element at its own (fine) size; a CSS size, or the snapper (watchCanvases), shows it crisp
  function paint(canvas, src) {
    // a smooth HD Sprout (art-sprouts-hd.js, c.k = 4) shown bigger than its bitmap is drawn again, sharp, for its CSS size
    if (src.hdSpr && PX.hdUp) { const w = parseFloat(canvas.style.width) || (canvas.isConnected ? canvas.getBoundingClientRect().width : 0); if (w > 0) src = PX.hdUp(src, w / PX.artW(src)); }
    if (src.k && (canvas.width !== src.width || canvas.height !== src.height)) fitCanvas(canvas, src);
    canvas._pk = src.k || 1; canvas._hdSrc = src.hdSpr ? src : null;
    smoothCanvas(canvas, src);
    const x = canvas.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, canvas.width, canvas.height); x.drawImage(src, 0, 0, canvas.width, canvas.height);
  }
  // pictures finer than 2 fine px per art px (HD Sprouts) are smooth art: shown with the browser's smoothing, never pixel-snapped
  function smoothCanvas(canvas, src) {
    if (!PX.HD) return; // (HD off: everything is drawn exactly as before, incl. the arcade's finer k = 3 / 4 art)
    if ((src.k || 1) > 2) canvas.style.imageRendering = 'auto';
    else if (canvas.style.imageRendering === 'auto') canvas.style.imageRendering = '';
  }
  // draw a sprout (or any look) into a canvas element; pose optional
  function drawSproutTo(canvas, sOrLook, pose) {
    const L = sOrLook && sOrLook.stats ? state.lookOf(sOrLook) : sOrLook, src = PX.sprig(L, pose || {});
    if (!src.k) { canvas.width = 32; canvas.height = 32; }
    fitCanvas(canvas, src); paint(canvas, src);
  }
  // size a canvas's bitmap to a sprite (hi-res sprites have k x more pixels). Canvases sized by CSS keep their size; one
  // that was only sized by its width/height attributes gets that size pinned in CSS so it doesn't grow on screen.
  function fitCanvas(canvas, src) {
    const aw = PX.artW ? PX.artW(src) : src.width, ah = PX.artH ? PX.artH(src) : src.height;
    canvas._pk = src.k || 1; // (the snapper below keeps whole device pixels per art pixel for a hi-res picture)
    if (src.k && canvas.isConnected && !canvas.style.width) {
      const cs = getComputedStyle(canvas), w = parseFloat(cs.width), h = parseFloat(cs.height);
      if (Math.abs(w - canvas.width) < 0.5 && Math.abs(h - canvas.height) < 0.5) { canvas.style.width = (canvas.width === aw ? aw : w) + 'px'; canvas.style.height = (canvas.height === ah ? ah : h) + 'px'; }
    }
    if (canvas.width !== src.width) canvas.width = src.width;
    if (canvas.height !== src.height) canvas.height = src.height;
  }

  // ---------------- HUD ----------------
  let chipKey = '';
  function refreshPlayerChip() {
    const p = PS.players.current(), partner = state.active();
    const key = (p ? p.name : '') + '|' + (partner ? JSON.stringify(state.lookOf(partner)) : '-');
    if (key === chipKey) return; chipKey = key;
    $('playerName').textContent = PS.players.isTesting() ? 'Test save' : (p ? p.name : 'Player');
    drawSproutTo($('playerAvatar'), partner || PX.cloneLook(PX.DEFAULT_LOOK), partner ? {} : { eyes: 'happy' });
  }
  function refresh() {
    refreshPlayerChip();
    $('coinText').textContent = (coinFreeze == null ? PS.S.coins : coinFreeze).toLocaleString();
    const night = PS.clock.isNight(), ms = PS.clock.msToSwitch(), m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
    // (the word sits in its own span: a phone hides it, the sun or moon icon says it, so the player's name keeps its room)
    const ct = $('clockText'); if (!ct.firstElementChild) ct.innerHTML = '<span class="ck-w"></span><span class="ck-t"></span>';
    ct.firstElementChild.textContent = night ? 'Night ' : 'Day '; ct.lastElementChild.textContent = `${m}:${String(s).padStart(2, '0')}`;
    const want = night ? 'moon' : 'sun';
    if ($('clockIcon').dataset.k !== want) { paint($('clockIcon'), icon(want)); $('clockIcon').dataset.k = want; }
    document.querySelector('[data-go="garden"] .badge').hidden = !PS.S.eggs.length;
    if (booted) { try { menuMusic(); goalTick(); dailyTick(); } catch (e) { console.error(e); reportError(e, 'goals'); } }
  }
  let booted = false;

  // ---------------- iPad & laptop guards ----------------
  // Safari lets you press-and-hold or drag a canvas off the screen as a picture, pinch-zoom the page and select text with a
  // double tap; none of that belongs in the game (the garden handles its own pinch on its canvas with pointer events).
  const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  document.addEventListener('dragstart', e => e.preventDefault());
  document.addEventListener('selectstart', e => { if (!typing(e.target)) e.preventDefault(); });
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('focusout', e => { if (typing(e.target)) setTimeout(() => { if (!typing(document.activeElement) && (window.scrollX || window.scrollY)) window.scrollTo(0, 0); }, 50); });

  // ---------------- navigation ----------------
  function go(name, params) {
    const sc = PS.scenes[name];
    closeDrop(true); // (the garden's area drop-down belongs to the screen it was opened on)
    if (current && PS.scenes[current] && PS.scenes[current].hide) PS.scenes[current].hide();
    document.querySelectorAll('.screen').forEach(el => { el.hidden = el.dataset.screen !== name; });
    document.querySelectorAll('#nav button').forEach(b => { if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const prev = current; current = name;
    const root = $('scr-' + name);
    // the new screen fades in (menus also rise a little: app.css .scr-in); only when the screen really changes
    if (root && prev !== name) { root.classList.remove('scr-in'); void root.offsetWidth; root.classList.add('scr-in'); }
    if (sc && !mounted[name]) { mounted[name] = true; try { sc.mount(root); } catch (e) { console.error(e); reportError(e, name); root.innerHTML = `<div class="card" style="margin:20px auto">This screen failed to load.</div>`; } }
    // hub music first, so a scene's own show() can start its own track straight after (a race, a battle, a mini-game)
    music();
    if (sc && sc.show) { try { sc.show(params || {}); } catch (e) { console.error(e); reportError(e, name); } }
    if (!sc) root.innerHTML = `<div style="padding:24px"><div class="card">Coming soon.</div></div>`;
  }
  let chromeOn = true, held = false, heldToast = null;
  function chrome(on) {
    chromeOn = !!on;
    if (!chromeOn) { const el = $('toast'); if (el && +el.style.opacity > 0) { el.style.opacity = 0; toastT = 0; } } // a race or battle starts: clear any message on screen
    document.getElementById('app').classList.toggle('chrome-off', !chromeOn); window.dispatchEvent(new Event('resize')); if (chromeOn && !held && heldToast) { const h = heldToast; heldToast = null; toast(h[0], h[1]); } }
  function hold(on) { held = !!on; if (!held) { pumpModals(); if (heldToast && chromeOn) { const h = heldToast; heldToast = null; toast(h[0], h[1]); } } }

  // ---------------- toast ----------------
  let toastT = 0;
  function toast(msg, ms) {
    if (held || !chromeOn) { heldToast = [msg, ms]; return; } // don't cover a race or battle; show the latest one afterwards
    const el = $('toast'); el.textContent = msg; el.style.opacity = 1; toastT = (ms || 2400) / 1000;
  }

  // ---------------- modals (queued) ----------------
  // opts: { eyebrow, title, html, sprite: sprout|look|canvas, pose, buttons:[{label, kind:'primary'|'go'|'danger'|'', onClick(close)}], row, dismiss:true }
  const queue = []; let open = null;
  // A tap that opens a pop-up when the finger lifts is followed by the browser's own click at the same spot, which would land on
  // the new pop-up. A click whose press began before the pop-up opened isn't meant for it (keyboard clicks have detail 0).
  let pressN = 0;
  for (const tp of ['pointerdown', 'touchstart']) document.addEventListener(tp, () => { pressN++; }, { capture: true, passive: true });
  function modal(opts) { queue.push(opts); pumpModals(); }
  function pumpModals() {
    if (open || !queue.length) return;
    // (while a race or battle holds pop-ups, only a moment that scene asked for itself, a celebrate() without wait, may show)
    const qi = held ? queue.findIndex(q => q.force) : 0;
    if (qi < 0) return;
    const o = queue.splice(qi, 1)[0]; open = o;
    if (o.cel) { try { showCelebrate(o); } catch (e) { console.error(e); reportError(e, 'celebrate'); $('modalRoot').innerHTML = ''; open = null; o.done(); pumpModals(); } return; }
    if (o.evo) { // (if the scene can't run: the plain pop-up it replaced)
      try { showEvolution(o); } catch (e) { console.error(e); reportError(e, 'evolve'); $('modalRoot').innerHTML = ''; open = null; queue.unshift(evoModal(o.evo)); pumpModals(); }
      return;
    }
    const root = $('modalRoot');
    root.innerHTML = `<div class="overlay" role="dialog" aria-modal="true"><div class="card modal-card">
      ${o.sprite ? '<canvas class="px m-sprite" width="32" height="32"></canvas>' : ''}
      ${o.eyebrow ? `<div class="eyebrow">${o.eyebrow}</div>` : ''}
      ${o.title ? `<h1>${o.title}</h1>` : ''}
      <div class="m-body">${o.html || ''}</div>
      <div class="modal-btns ${o.row ? 'row' : ''}"></div></div></div>`;
    const openN = pressN, openT = performance.now();
    root.querySelector('.overlay').addEventListener('click', e => { if (e.detail && pressN === openN && performance.now() - openT < 700) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    const cv = root.querySelector('.m-sprite');
    if (cv) { if (o.sprite instanceof HTMLCanvasElement) { fitCanvas(cv, o.sprite); paint(cv, o.sprite); } else drawSproutTo(cv, o.sprite, o.pose || { eyes: 'happy', mouth: 'open', arms: 'up' }); }
    const close = () => { root.innerHTML = ''; open = null; if (o.onClose) o.onClose(); pumpModals(); };
    const btns = o.buttons && o.buttons.length ? o.buttons : [{ label: 'OK', kind: 'primary' }];
    const box = root.querySelector('.modal-btns');
    btns.forEach(b => { const el = document.createElement('button'); el.className = 'btn wide ' + (b.kind || ''); el.textContent = b.label; el.onclick = () => { PX.Sound.play('pop'); if (b.onClick) { const keep = b.onClick(close); if (keep === true) return; } close(); }; box.appendChild(el); });
    if (o.dismiss !== false) root.querySelector('.overlay').addEventListener('click', e => { if (e.target.classList.contains('overlay')) close(); });
    if (o.mount) o.mount(root.querySelector('.card'), close);
  }
  function closeModal() { if (!open) return; if (open.kill) { open.kill(); return; } $('modalRoot').innerHTML = ''; open = null; pumpModals(); } // (a celebrate or evolution closes itself, so its promise resolves)

  // ---------------- sprout picker ----------------
  // opts: { title, eyebrow, note, filter(s)->true|string(reason disabled), extra(s)->html, onPick(s) }
  function pickSprout(opts) {
    const list = PS.S.sprouts;
    if (!list.length) { modal({ title: 'No Sprouts yet', html: '<p>Hatch your first egg in the Garden.</p>', buttons: [{ label: 'Go to the Garden', kind: 'primary', onClick: () => go('garden') }] }); return; }
    modal({
      eyebrow: opts.eyebrow || '', title: opts.title || 'Choose a Sprout', html: (opts.note ? `<p>${opts.note}</p>` : '') + '<div class="pick-list"></div>',
      buttons: [{ label: 'Cancel' }],
      mount(card, close) {
        const box = card.querySelector('.pick-list');
        const sorted = list.slice().sort((a, b) => (b.id === PS.S.activeId) - (a.id === PS.S.activeId) || state.totalLevels(b) - state.totalLevels(a));
        for (const s of sorted) {
          const ok = opts.filter ? opts.filter(s) : true;
          const b = document.createElement('button'); b.className = 'pick-item'; if (ok !== true && ok !== undefined) b.disabled = true;
          b.innerHTML = `<canvas class="px"></canvas><span><b>${PS.state.esc(s.name)}</b><small>${state.formInfo(s).name} · Lv ${state.totalLevels(s)} · ${D.AREAS[s.area].name}</small>${opts.extra ? `<small>${opts.extra(s)}</small>` : ''}${typeof ok === 'string' ? `<small>${ok}</small>` : ''}</span>${s.id === PS.S.activeId ? '<span class="tag">Partner</span>' : ''}`;
          drawSproutTo(b.querySelector('canvas'), s);
          b.onclick = () => { close(); opts.onPick(s); };
          box.appendChild(b);
        }
      },
    });
  }

  // ---------------- battle move picker ----------------
  // Pick which of its learned moves a Sprout takes into battle (up to state.MAX_MOVES). Each move shows why it suits this Sprout
  // (from its stats and types); "Best picks" chooses for you; "Let the game choose" goes back to the automatic set.
  function pickMoves(s, onDone) {
    if (!s) return;
    const MAX = state.MAX_MOVES, name = PS.state.esc(s.name), learned = state.learnedMoves(s);
    let chosen = state.movesOf(s).filter(id => learned.includes(id));
    const src = {}; for (const k of state.knownMoves(s)) if (!k.locked && !src[k.id]) src[k.id] = k.from;
    const later = []; // moves it can still learn from animals it has bonded with
    for (const [aid, n] of Object.entries(s.absorbed || {})) { const c = state.creature(aid); if (!c || D.RARES[aid]) continue; c.moves.forEach((id, i) => { const at = [1, 3, 6][i]; if (n < at && D.MOVES[id] && !learned.includes(id)) later.push({ id, left: at - n, animal: c.name }); }); }
    const card = (id, on) => {
      const m = D.MOVES[id], f = state.moveFit(s, id), E = D.ELEMENTS[m.el] || D.ELEMENTS.normal;
      return `<button class="mv-card${on ? ' on' : ''}" data-mv-id="${id}" type="button"><canvas class="px" data-el="${m.el}" width="7" height="7"></canvas>
        <span><b>${PS.state.esc(m.name)}</b><small>${m.pow > 0 ? `Pow ${m.pow}${m.fx.hits > 1 ? ' ×' + m.fx.hits : ''}` : 'Helper'} · ${E.label}${src[id] ? ' · ' + PS.state.esc(src[id]) : ''}</small>${f.why ? `<i>${PS.state.esc(f.why)}</i>` : ''}</span>${on ? '<em>✓</em>' : ''}</button>`;
    };
    modal({ eyebrow: 'Battle moves', title: `${name}'s moves`, sprite: s, row: true,
      html: `<p>Pick ${MAX} moves for battles. Tap a move to add it or take it out.</p><div class="mv-slots"></div>
        <div class="mv-tools"><button class="btn" type="button" data-mv="best">★ Best picks for ${name}</button><button class="pl-link" type="button" data-mv="auto">Let the game choose</button></div>
        <div class="label">Moves ${name} knows (${learned.length})</div><div class="mv-list"></div>
        ${later.length ? `<div class="label" style="margin-top:12px">Still to learn</div><div class="mv-later">${later.slice(0, 6).map(x => `<div><b>${PS.state.esc(D.MOVES[x.id].name)}</b> · bond with a ${PS.state.esc(x.animal)} ${x.left} more time${x.left > 1 ? 's' : ''}</div>`).join('')}</div>` : ''}`,
      buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: () => {
        const now = state.setMoves(s, chosen); PX.Sound.play('chime');
        toast(`${s.name} will battle with ${now.map(id => D.MOVES[id].name).join(', ')}.`, 3200); if (onDone) setTimeout(onDone, 0);
      } }],
      mount(el, close) {
        const draw = () => {
          el.querySelector('.mv-slots').innerHTML = Array.from({ length: MAX }, (_, i) => chosen[i] ? card(chosen[i], true) : '<div class="mv-empty">Empty</div>').join('');
          el.querySelector('.mv-list').innerHTML = learned.filter(id => !chosen.includes(id)).map(id => card(id, false)).join('') || '<p class="bk-ver" style="margin:0">It uses every move it knows.</p>';
          el.querySelectorAll('canvas[data-el]').forEach(c => paint(c, PX.item('element', c.dataset.el)));
        };
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-mv-id],[data-mv]'); if (!b) return;
          if (b.dataset.mv === 'best') { chosen = state.bestMoves(s); PX.Sound.play('pop'); draw(); return; }
          if (b.dataset.mv === 'auto') { state.setMoves(s, null); PX.Sound.play('pop'); toast(`The game will choose ${s.name}'s moves.`, 2600); close(); if (onDone) setTimeout(onDone, 0); return; }
          const id = b.dataset.mvId, i = chosen.indexOf(id);
          if (i >= 0) { if (chosen.length > 1) chosen.splice(i, 1); else toast('Keep at least one move.'); }
          else if (chosen.length < MAX) chosen.push(id);
          else { toast(`${MAX} moves is the most. Tap one at the top to take it out.`, 2600); return; }
          PX.Sound.play('tick'); draw();
        });
        draw();
      },
    });
  }

  // ---------------- global reactions ----------------
  // freezeCoins(true) holds the HUD coin total (e.g. while a gumball rolls, so the prize isn't spoiled); false shows the real total
  let coinFreeze = null;
  function bumpCoins() { const p = $('coinPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); PX.Sound.play('tick'); }
  function freezeCoins(on) {
    if (on) { if (coinFreeze == null) coinFreeze = PS.S.coins; return; }
    if (coinFreeze == null) return;
    const was = coinFreeze; coinFreeze = null; refresh(); if (PS.S.coins > was) bumpCoins();
  }
  PS.on('coins', e => { refresh(); if (e.n > 0 && coinFreeze == null && chromeOn) bumpCoins(); }); // no tick under a race or battle
  // saving problems are rare but serious: tell a grown-up once, with the fix
  let saveWarned = false;
  function saveWarning(why) {
    if (saveWarned) return; saveWarned = true;
    modal({ eyebrow: 'For grown-ups', title: 'Progress isn’t saving', html: `<p>${why} Until it's fixed, new progress may be lost when the game closes.</p><p>Make a backup code now (Backups), then check that the phone has free storage and that website data isn't blocked for this app.</p>`,
      buttons: [{ label: 'Make a backup code', kind: 'primary', onClick: () => { setTimeout(backupPanel, 0); } }, { label: 'OK' }] });
  }
  PS.on('save:failed', () => saveWarning('This device just refused to save the game.'));
  PS.on('save:ok', () => { saveWarned = false; });
  // why a Sprout changed the way it did (the evolution scene says it at the end)
  function evoWhy(s, stg) {
    try {
      const nk = state.natureKind(s);
      return (stg == null ? s.stage : stg) === 1 ? `Its ${nk === 'sun' ? 'sunny' : nk === 'moon' ? 'moonlit' : 'wild'} nature shaped its bud.`
        : `It bloomed as a ${D.FLOWERS[s.flower].name} because it lives in the ${D.AREAS[s.area].name} and has a ${nk} nature.`;
    } catch (e) { return ''; }
  }
  function evoModal(e) { // the plain pop-up (only if the scene can't run)
    const s = e.s, fi = state.formInfo(s), mv = (fi.moves || []).map(id => (D.MOVES[id] || {}).name).filter(Boolean).join(', ');
    return { eyebrow: 'Evolution', title: `${E(e.name || s.name)} became a ${E(e.to || fi.name)}!`, sprite: s, html: `<p>${E(evoWhy(s, e.stage))}</p>${mv ? `<p><b>New moves:</b> ${E(mv)}</p>` : ''}`, buttons: [{ label: 'Wonderful', kind: 'primary' }] };
  }
  PS.on('sprout:evolve', e => { if (e && e.s && !e.s.npc) { queue.push({ evo: e }); pumpModals(); } }); // (the evolution scene: showEvolution)
  PS.on('egg:new', e => { refresh(); const eg = D.EGGS[e.egg.kind] || D.EGGS.meadow, ar = D.AREAS[e.egg.area] || D.AREAS.meadow; toast(`New ${eg.name}! It's waiting in the ${ar.name}.`, 3200); });
  // a hatch: the garden plays its own little moment; the very first Sprout, a Shiny, or the first from a special egg also gets the big one
  PS.on('egg:hatch', e => {
    const s = e && e.s, egg = e && e.egg; if (!s || s.npc) return;
    const shiny = !!(s.look && s.look.shiny), kind = egg && egg.kind, special = kind && !D.AREAS[kind] && D.EGGS[kind];
    const first = PS.S.sprouts.length === 1, J = journey(), hk = J.hatched && typeof J.hatched === 'object' ? J.hatched : (J.hatched = {});
    const firstKind = special && !hk[kind]; if (kind) hk[kind] = 1; PS.save();
    if (!shiny && !first && !firstKind) return;
    goalT = performance.now() + 2500; // (a goal reached by this hatch is paid after the moment, where it can be seen)
    setTimeout(() => celebrate({ kind: 'hatch', wait: true, eyebrow: shiny ? 'A Shiny Sprout!' : 'It hatched!', title: `Hi, ${s.name}!`, sprite: s, cry: true,
      sub: shiny ? `${s.name} is Shiny! It shimmers like the moon.` : special ? `Your first Sprout from a ${D.EGGS[kind].name}!` : `${s.name} is yours to look after. Say hi!`, button: 'Hi!' }), first ? 600 : 1400); // (the very first: before the garden's own "Say hi" pop-up, which then queues after it)
  });
  // something new to play or collect (any screen can send it): PS.emit('unlock', { title, sub, eyebrow, icon:<canvas>, sprite, tiles })
  PS.on('unlock', e => { if (e && e.title) celebrate({ kind: e.kind || 'unlock', wait: true, eyebrow: e.eyebrow || 'Unlocked!', title: e.title, sub: e.sub || '', icon: e.icon || null, sprite: e.sprite || null, tiles: e.tiles, button: e.button || 'Hooray!' }); });
  PS.on('levelup', e => { if (current !== 'race' && current !== 'battle') toast(`${e.s.name}: ${D.STAT_META[e.stat].label} Lv ${e.lv}`); });
  PS.on('night', e => { toast(e.isNight ? 'Night has fallen. Night creatures are out.' : 'Good morning! The sun is up.', 3000); refresh(); if (current === 'garden' && chromeOn && !held && !open) music(); });

  // ---------------- parent gate (keeps kids out of the testing tools and erase buttons) ----------------
  // One right answer opens grown-up actions for 2 minutes, and putting the app away closes them again
  // (a Home Screen app can stay open for days, so "until reload" would leave them open to the kids).
  const PARENT_MS = 120000; let parentUntil = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) parentUntil = 0; });
  function parentGate(then) {
    if (Date.now() < parentUntil) { then(); return; }
    const a = 6 + Math.floor(Math.random() * 7), b = 4 + Math.floor(Math.random() * 6);
    let tries = 0;
    modal({ eyebrow: 'Grown-ups only', title: 'Parent check', html: `<p>What is ${a} × ${b}?</p><input class="field-input" id="pgAns" inputmode="numeric" autocomplete="off" aria-label="Answer">`,
      row: true, buttons: [{ label: 'Cancel' }, { label: 'Continue', kind: 'primary', onClick: () => {
        const v = parseInt(($('pgAns') || {}).value, 10);
        if (v === a * b) { parentUntil = Date.now() + PARENT_MS; setTimeout(then, 0); return; }
        if (++tries >= 3) { toast('Ask a grown-up to help with this one.'); return; }
        toast('That is not quite right.'); return true;
      } }] });
  }

  // ---------------- testing tools (parent only) ----------------
  function devPanel() {
    const T = PS.S.totals || {}, mins = Math.round((T.playSec || 0) / 60), n = v => Number(v || 0).toLocaleString();
    const played = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    const RD = PS.S.raids || {}, raids = (RD.wins | 0) + (RD.losses | 0) ? ` · ${n(RD.wins)} of ${n((RD.wins | 0) + (RD.losses | 0))} night raids won` : '';
    const stats = `<p class="bk-ver" style="margin-top:0"><b>Play stats</b> (this player, kept on this device): played ${played} since this was added · ${n(T.races)} races (${n(T.raceWins)} won) · ${n(T.battles)} battles (${n(T.battleWins)} won)${raids} · ${n(T.coinsEarned)} coins earned · ${n(T.gumballs)} gumballs · ${n(PS.S.sprouts.length)} Sprouts</p>`;
    parentGate(() => modal({
      eyebrow: 'Parent tools', title: 'Testing shortcuts', html: stats + '<p>Shortcuts for testing the whole game quickly. They skip the normal grind, so keep them away from the kids.</p><div class="dev-grid"></div>',
      buttons: [{ label: 'Close' }],
      mount(card, close) {
        const grid = card.querySelector('.dev-grid');
        const add = (label, fn) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = () => { fn(); refresh(); PX.Sound.play('chime'); }; grid.appendChild(b); };
        add('+1,000 coins', () => state.addCoins(1000, 'dev'));
        add('+10,000 coins', () => state.addCoins(10000, 'dev'));
        add('Partner +300 XP', () => { const s = state.active(); if (s) state.gain(s, Object.fromEntries(D.STATS.map(k => [k, 300]))); else toast('Hatch a Sprout first'); });
        add('Toggle day/night', () => PS.clock.toggle());
        // night raids (garden.js): one now, any time of day, in the garden; and the grown-up switch (PS.S.raidsOff)
        add('Night raid now', () => { close(); go('garden'); setTimeout(() => { const r = window.__garden && window.__garden.raidNow ? window.__garden.raidNow() : ''; if (/^no |could not/.test(r)) toast('A raid needs a Sprout playing outside in the garden.', 3000); }, 450); });
        add(`Night raids: ${PS.S.raidsOff ? 'OFF' : 'ON'} (tap to turn ${PS.S.raidsOff ? 'on' : 'off'})`, () => {
          PS.S.raidsOff = !PS.S.raidsOff; PS.save(); close();
          toast(PS.S.raidsOff ? 'The gloom won\'t come to the garden any more.' : 'The gloom may come to the garden at night again.', 3200);
        });
        add('Get a Meadow egg', () => state.addEgg('meadow', 'Parent tools'));
        add('Get a Golden egg', () => state.addEgg('golden', 'Parent tools'));
        add('Get a surprise shop egg', () => { const k = PS.util.pick(D.SHOP_EGGS.filter(id => D.EGGS[id])); state.addEgg(k, 'Parent tools'); });
        // opens every tier of every series (Master stays unwon, so its first-win egg can still be earned)
        add('Unlock all races', () => {
          const rs = PS.scenes.race; let done = false;
          if (rs && typeof rs.unlockAll === 'function') { try { rs.unlockAll(); done = true; } catch (e) { console.error(e); } }
          if (!done) for (const r of D.RACES) for (let i = 0; i < 2; i++) { const k = r.id + '-' + i; PS.S.progress.races[k] = Object.assign({ runs: 1, best: null }, PS.S.progress.races[k], { wins: Math.max(1, (PS.S.progress.races[k] || {}).wins || 0) }); }
          PS.save(); toast('All races unlocked');
        });
        add('Unlock all leagues', () => { for (const L of D.LEAGUES) PS.S.progress.leagues[L.id] = { beaten: [true, true, true], cleared: true }; PS.save(); toast('All leagues unlocked'); });
        const who = (PS.players.current() || {}).name || 'this player';
        const r = document.createElement('button'); r.className = 'btn danger'; r.style.gridColumn = '1 / -1'; r.textContent = `Erase ${who}'s game`;
        let armed = 0; r.onclick = () => { if (Date.now() - armed > 3000) { armed = Date.now(); r.textContent = `Tap again to erase ${who}'s game`; return; } PS.reset(); close(); location.reload(); };
        grid.appendChild(r);
      },
    }));
  }

  // ---------------- players ----------------
  const E = v => PS.state.esc(v);
  const MUTE_KEY = 'solunar:muted';
  function setMuted(on) { PX.Sound.muted = !!on; try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (e) { /* this session only */ } if (!on) PX.Sound.play('pop'); }
  // ---------------- backups ----------------
  function copyText(text, ta, onCopied, msg) {
    const done = () => { toast(msg || 'Backup code copied. Paste it somewhere safe, like Notes or an email to yourself.', 3600); if (onCopied) onCopied(); };
    const fallback = () => { if (ta) { ta.focus(); ta.select(); } toast('Select the code and copy it.'); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  const ago = ts => { const d = Math.round((new Date(new Date().toDateString()) - new Date(new Date(ts).toDateString())) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const when = ts => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  async function shareText(text, name) {
    try {
      const file = new File([text], `solunar-sprouts-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`, { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Solunar Sprouts backup' }); return true; }
      if (navigator.share) { await navigator.share({ title: 'Solunar Sprouts backup', text }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return true; }
    return false;
  }
  function backupPanel() {
    const cur = PS.players.current(), many = PS.players.list().length > 1, last = PS.players.lastBackup(cur.id);
    const autos = PS.backup.autoBackups().filter(a => a.ok), rescue = PS.backup.rescued();
    modal({ eyebrow: 'Keep progress safe', title: 'Backups',
      html: `<p>A backup code holds a whole saved game. Keep a copy somewhere safe (Notes, Files or an email). If a phone is lost, reset or replaced, paste the code into the game to get everything back.</p>
        <p class="bk-ver" style="margin-top:0">${last ? `${E(cur.name)} was last backed up ${ago(last)}.` : `${E(cur.name)} hasn't been backed up yet.`}</p>
        <div class="bk-actions"><button class="btn primary" id="bkMe">Back up ${E(cur.name)}</button>${many ? '<button class="btn" id="bkAll">Back up all players</button>' : ''}</div>
        <div id="bkOut" hidden><textarea class="field-input bk-code" id="bkCode" readonly rows="4" aria-label="Backup code"></textarea>
          <div class="bk-actions"><button class="btn primary" id="bkCopy">Copy code</button><button class="btn" id="bkShare">Save or share</button></div></div>
        <div class="label" style="margin-top:16px">Restore from a backup</div>
        <textarea class="field-input bk-code" id="bkIn" rows="3" placeholder="Paste a backup code here" aria-label="Backup code to restore"></textarea>
        <div class="bk-actions"><button class="btn" id="bkNew">Restore as new player</button><button class="btn danger" id="bkReplace">Replace ${E(cur.name)}'s game</button></div>
        ${autos.length ? `<div class="label" style="margin-top:16px">Automatic backups on this device</div>
          <p class="bk-ver" style="margin-top:2px">The game keeps ${E(cur.name)}'s game from the last few days it was played, in case something goes wrong.</p>
          <div class="bk-auto">${autos.map(a => `<div class="bk-row"><span><b>${E(when(a.at))}</b><small>${a.sprouts} Sprout${a.sprouts === 1 ? '' : 's'} · ${Number(a.coins).toLocaleString()} coins</small></span><button class="btn" data-auto="${a.i}">Restore</button></div>`).join('')}</div>` : ''}
        ${rescue ? `<p class="bk-ver">A copy of a saved game that couldn't be opened was kept from ${E(when(rescue.at))}. <button class="pl-link" id="bkRescue">Copy it</button> to send it for help.</p>` : ''}
        <p class="bk-ver">Version ${E(window.SOLUNAR_VERSION || 'dev')}</p>`,
      buttons: [{ label: 'Done' }],
      mount(card) {
        let code = '', codeName = cur.name, which = 'player';
        const backedUp = () => PS.players.markBackedUp(which === 'all' ? PS.players.list().map(p => p.id) : [cur.id]);
        const show = async w => {
          try { which = w; code = await PS.backup.exportBackup(w); codeName = w === 'all' ? 'all-players' : cur.name; card.querySelector('#bkOut').hidden = false; card.querySelector('#bkCode').value = code; }
          catch (e) { toast('Could not make a backup on this device.'); }
        };
        card.querySelector('#bkMe').onclick = () => show('player');
        if (many) card.querySelector('#bkAll').onclick = () => show('all');
        card.querySelector('#bkCode').addEventListener('copy', backedUp); // copied by hand (the fallback when the clipboard is blocked)
        card.querySelector('#bkCopy').onclick = () => copyText(code, card.querySelector('#bkCode'), backedUp);
        card.querySelector('#bkShare').onclick = async () => { if (await shareText(code, codeName)) backedUp(); else copyText(code, card.querySelector('#bkCode'), backedUp); };
        card.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => {
          const a = autos.find(x => x.i === +b.dataset.auto); if (!a) return;
          parentGate(() => modal({ title: `Go back to ${E(when(a.at))}?`, html: `<p>${E(cur.name)}'s game will go back to how it was on ${E(when(a.at))}. Anything played since then will be replaced.</p>`, row: true,
            buttons: [{ label: 'Cancel' }, { label: 'Restore', kind: 'danger', onClick: () => { try { PS.backup.restoreAuto(a.i); toast('Restored.', 2000); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message, 3600); } } }] }));
        });
        const rb = card.querySelector('#bkRescue'); if (rb) rb.onclick = () => copyText(rescue.raw, null, null, 'Copied. Paste it into an email or message to whoever helps with the game.');
        const restore = async mode => {
          const txt = card.querySelector('#bkIn').value.trim();
          if (!txt) { toast('Paste a backup code first.'); return; }
          let obj; try { obj = await PS.backup.decodeBackup(txt); } catch (e) { toast(e.message || 'That backup code did not work.', 3600); return; }
          if (mode === 'replace' && obj.kind === 'all') { toast('That code holds several players. Use "Restore as new player".', 3600); return; }
          const go2 = () => { try { const names = PS.backup.importBackup(obj, mode); toast(`Restored ${names.join(', ')}.`, 3000); setTimeout(() => { if (mode === 'replace') location.reload(); else { const last = PS.players.list().slice(-1)[0]; PS.players.switchTo(last.id); } }, 700); } catch (e) { toast(e.message, 3600); } };
          if (mode === 'replace') parentGate(() => modal({ title: `Replace ${E(cur.name)}'s game?`, html: `<p>${E(cur.name)}'s current Sprouts will be replaced by the backup.</p>`, row: true, buttons: [{ label: 'Cancel' }, { label: 'Replace', kind: 'danger', onClick: go2 }] }));
          else go2();
        };
        card.querySelector('#bkNew').onclick = () => restore('new');
        card.querySelector('#bkReplace').onclick = () => restore('replace');
      },
    });
  }

  // ---------------- installed-app support: offline cache + updates ----------------
  let updateReady = false, hiddenAt = 0;
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.top !== window || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) return;
    if (!window.SOLUNAR_VERSION || window.SOLUNAR_VERSION === 'dev') return; // only the built site ships a service worker
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || updateReady) return; // first install, or already handled
      updateReady = true; PS.saveNow();
      modal({ eyebrow: 'Update', title: 'A new version is ready', html: '<p>Solunar Sprouts has been updated. Your progress is saved and will carry over.</p>', row: true,
        buttons: [{ label: 'Later' }, { label: 'Update now', kind: 'primary', onClick: () => location.reload() }] });
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); PS.saveNow(); return; }
    if (updateReady && hiddenAt && Date.now() - hiddenAt > 20000 && !held && chromeOn && !open && !queue.length) location.reload(); // apply a pending update when the app is reopened (never under an open panel)
  });
  function askPersistentStorage() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* optional */ } }

  // ---------------- crisp pixel icons ----------------
  // Pixel art only looks right when every art pixel covers a whole number of screen pixels. Many icons are sized "by eye" in the
  // stylesheets (a 32px Sprout shown at 34 or 76 CSS px, a 26px critter squeezed into 22), which doubles some pixel rows and not
  // others. This snaps every small pixel-art canvas to the nearest whole-pixel scale for this screen (1x, 2x or 3x), preferring
  // a slightly smaller size over a bigger one so layouts don't overflow. Big scene canvases draw at device resolution and are skipped.
  // Hi-res pictures (2 fine pixels per art pixel; paint / fitCanvas mark the canvas with _pk) snap so each fine pixel is whole
  // device pixels when that keeps the size within 15%; otherwise (e.g. a 3x iPhone) each art pixel is whole device pixels, so
  // nothing grows or shrinks by a third. In a box smaller than the bitmap (1x screens) a hi-res picture is halved, never grown.
  const snapQ = new Set(); let snapRaf = 0;
  const pxOf = v => (typeof v === 'string' && /px$/.test(v) ? parseFloat(v) : 0);
  function queueSnap(c) { snapQ.add(c); if (!snapRaf) { snapRaf = 1; Promise.resolve().then(flushSnap); } } // before the next paint
  function flushSnap() {
    snapRaf = 0;
    const dpr = window.devicePixelRatio || 1, todo = [];
    for (const c of snapQ) { // read everything first (one style pass), then write
      if (!c.isConnected || !c.width || !c.height || c.width > 400 || c.height > 400 || (c.width === 300 && c.height === 150) || 'nosnap' in c.dataset) continue; // (400: hi-res sprites are twice their art size; 300 x 150 is a canvas nothing has sized yet, e.g. a scene before its first frame)
      // smooth HD Sprouts (c.k > 2) aren't pixel art: they keep their size and are shown smoothly. (The garden's Sprout card is
      // painted by garden.js without the tag: with HD on, a 128-px bitmap there is an HD Sprout.)
      if (PX.HD && !c._pk && c.width === 128 && c.height === 128 && c.closest && c.closest('.g-ch')) { c._pk = 4; c.style.imageRendering = 'auto'; }
      if (PX.HD && c._pk > 2) continue;
      const cs = getComputedStyle(c); if (!/pixelated|crisp/.test(cs.imageRendering)) continue;
      const mine = c.dataset.sw && c.style.width === c.dataset.sw && c.style.height === c.dataset.sh;
      let rw = mine ? +c.dataset.rw : pxOf(c.style.width) || pxOf(cs.width), rh = mine ? +c.dataset.rh : pxOf(c.style.height) || pxOf(cs.height);
      if (!rw && !rh) continue;
      const k = Math.min(rw ? rw / c.width : Infinity, rh ? rh / c.height : Infinity), phys = k * dpr;
      const lo = Math.max(1, Math.floor(phys)), hi = Math.max(1, Math.ceil(phys));
      let n = Math.abs(phys - lo) / phys <= 1.25 * Math.abs(hi - phys) / phys || lo === hi ? lo : hi;
      if (phys < 0.75) n = 1 / Math.max(1, Math.round(1 / phys)); // a hi-res sprite in a small box (1x screens): halve it, don't let it grow
      else if (c._pk > 1 && Math.abs(n - phys) / phys > 0.15) { const m = Math.max(1, Math.round(phys * c._pk)) / c._pk; if (Math.abs(m - phys) < Math.abs(n - phys)) n = m; }
      const w = c.width * n / dpr, h = c.height * n / dpr;
      if (mine && Math.abs(w - pxOf(c.style.width)) < 0.01 && Math.abs(h - pxOf(c.style.height)) < 0.01) continue;
      todo.push([c, rw || w, rh || h, w, h]);
    }
    snapQ.clear();
    for (const [c, rw, rh, w, h] of todo) { c.dataset.rw = rw; c.dataset.rh = rh; c.style.width = c.dataset.sw = w + 'px'; c.style.height = c.dataset.sh = h + 'px'; }
  }
  function watchCanvases() {
    const add = n => { if (n.nodeType !== 1) return; if (n.tagName === 'CANVAS') queueSnap(n); else n.querySelectorAll && n.querySelectorAll('canvas').forEach(queueSnap); };
    new MutationObserver(list => { for (const m of list) { if (m.type === 'attributes') { if (m.target.tagName === 'CANVAS') queueSnap(m.target); else add(m.target); } else m.addedNodes.forEach(add); } })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height', 'class', 'hidden'] });
    add(document.body);
    window.addEventListener('resize', () => add(document.body));
  }

  // ---------------- loop ----------------
  let last = performance.now(), hudT = 0, looping = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const sc = PS.scenes[current];
    if (sc && sc.frame && mounted[current] && !PS.ui.menuOpen) { try { sc.frame(dt, t); } catch (e) { console.error(e); reportError(e, current); } } // the main menu covers the screen: don't draw it twice
    // (the loop must never stop: one bad frame would freeze every screen on its last picture)
    try {
      hudT -= dt; if (hudT <= 0) { hudT = 0.5; refresh(); }
      if (!PS.ui.menuOpen && PS.S.totals) PS.S.totals.playSec = (PS.S.totals.playSec || 0) + dt; // time played (parent tools; stays on the device)
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
    } catch (e) { console.error(e); reportError(e, 'hud'); }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // ---------------- errors: shown on screen (briefly, once per kind) so a grown-up can screenshot them for fixing ----------------
  // PS.ui.reportError(error, where): a dark bar above the bottom tabs for 15 s (tap to hide); the same message at most once a minute.
  const errSeen = {};
  function reportError(e, where) {
    try {
      const msg = String((e && (e.message || e.reason)) || e || 'error').slice(0, 160);
      const at = e && e.stack ? (String(e.stack).split('\n').find(l => /\.js:\d+/.test(l)) || '').replace(/^.*\/([^/]+\.js:\d+):\d+\)?.*$/, '$1') : '';
      const key = msg + at; if (errSeen[key] && Date.now() - errSeen[key] < 60000) return; errSeen[key] = Date.now();
      let el = document.getElementById('errBar');
      if (!el) { el = document.createElement('div'); el.id = 'errBar'; el.className = 'sv-err'; el.setAttribute('role', 'alert'); el.onclick = () => { el.hidden = true; }; document.body.appendChild(el); }
      el.textContent = `Oops! Something went wrong (${where || 'game'}): ${msg}${at ? ' · ' + at : ''} · ${window.SOLUNAR_VERSION || 'dev'} · tap to hide`;
      el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 15000);
    } catch (x) { /* never let the reporter break anything */ }
  }
  window.addEventListener('error', ev => { if (ev && ev.target && ev.target !== window && !ev.error && !ev.message) return; reportError(ev.error || ev.message, 'page'); }); // (not a picture or font that failed to load)
  window.addEventListener('unhandledrejection', ev => reportError(ev.reason, 'page'));

  // boot(): the "Loading…" splash (index.html) goes first, whatever happens next; a step that fails is reported on screen and the
  // game keeps going (the frame loop always starts). Boot never waits for fonts or pictures.
  function boot() {
    const splash = document.getElementById('bootSplash'); if (splash) splash.remove();
    try { bootSteps(); }
    catch (e) { console.error(e); reportError(e, 'boot'); try { booted = true; bootDone = true; if (!current) go('garden'); } catch (x) { console.error(x); } }
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  }
  function bootSteps() {
    watchCanvases();
    document.getElementById('nav').style.setProperty('--nav-n', document.querySelectorAll('#nav button').length); // (one column per tab: app.css)
    document.querySelectorAll('#nav button').forEach(b => { paint(b.querySelector('canvas'), icon(b.dataset.go)); b.onclick = () => { PX.Sound.unlock(); PX.Sound.play('tick'); go(b.dataset.go); }; });
    paint($('coinIcon'), icon('coin'));
    document.addEventListener('pointerdown', () => PX.Sound.unlock()); // every tap: iOS can stop the audio after a call or a trip to another app
    $('coinPill').addEventListener('click', () => toast(`You have ${PS.S.coins.toLocaleString()} coins. Earn more in races and battles.`));
    $('clockPill').addEventListener('click', () => toast('Day and night switch every 15 minutes. Some creatures only come out at night.', 3200));
    const gc = $('goalChip'); if (gc) gc.onclick = () => { PX.Sound.unlock(); PX.Sound.play('tick'); if (goalNow) goalNow.go(); };
    booted = true;
    refresh();
    go('garden');
    if (!looping) { looping = true; requestAnimationFrame(frame); }
    registerServiceWorker();
    document.addEventListener('pointerdown', askPersistentStorage, { once: true });
    // sound: a device-wide on/off (iPads have no mute switch), and the audio sleeps while the app is put away
    try { PX.Sound.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* default on */ }
    document.addEventListener('visibilitychange', () => { try { if (document.hidden) { if (PX.Sound.suspend) PX.Sound.suspend(); } else if (PX.Sound.resume) PX.Sound.resume(); } catch (e) { /* optional */ } });
    // can this device save at all? (blocked website data, a full phone…)
    try { localStorage.setItem('solunar:probe', '1'); localStorage.removeItem('solunar:probe'); } catch (e) { saveWarning('This device is blocking the game from saving.'); }
    // a save that had to be repaired or brought back from an automatic backup: tell a grown-up what happened
    const ln = PS.loadNote;
    if (ln) {
      const who = E(PS.players.isTesting() ? 'This' : ((PS.players.current() || {}).name || 'This player') + '’s');
      const html = ln.kind === 'repaired' ? `<p>${who} saved game had a small problem, so the game fixed it. Everything else is safe.</p>`
        : ln.kind === 'snapshot' ? `<p>${who} saved game couldn't be opened, so the game brought back its automatic backup from ${E(when(ln.at))}.</p>`
          : `<p>${who} saved game couldn't be opened and there was no automatic backup yet, so a new game started. If you have a backup code, restore it in Backups.</p>`;
      modal({ eyebrow: 'For grown-ups', title: 'We looked after a saved game', html: html + '<p>A copy of the old save was kept. You can find it in Backups.</p>',
        buttons: [{ label: 'Open Backups', onClick: () => { setTimeout(backupPanel, 0); } }, { label: 'OK', kind: 'primary' }] });
      PS.clearLoadNote();
    }
    const welcome = () => {
      if (PS.S.seen.welcome) return;
      PS.S.seen.welcome = true; PS.save();
      modal({ eyebrow: 'Welcome', title: 'Solunar Sprouts', sprite: PX.cloneLook(PX.DEFAULT_LOOK), html:
        '<p>Raise Sprouts: little seedling creatures that grow into whatever you shape them to be.</p><p><b>Tap your egg to hatch it!</b></p>',
        buttons: [{ label: 'Start', kind: 'primary' }] });
    };
    PS.ui.welcome = welcome;
    // the title menu: a Music button beside Sound (added each time it opens; see addMusicButton), and its own tune
    if (PS.ui.mainMenu && !PS.ui.mainMenu._sv) { const mm = PS.ui.mainMenu; PS.ui.mainMenu = function () { const r = mm.apply(this, arguments); try { addMusicButton(); menuMusic(); } catch (e) { console.error(e); } return r; }; PS.ui.mainMenu._sv = true; }
    let skipMenu = false;
    try { skipMenu = sessionStorage.getItem('solunar:skipMenu') === '1'; sessionStorage.removeItem('solunar:skipMenu'); } catch (e) { /* blocked */ }
    if (PS.players.isTesting() || skipMenu || !PS.ui.mainMenu) { PS.players.touch && PS.players.touch(); welcome(); }
    else PS.ui.mainMenu({ launch: true });
    $('playerChip').onclick = () => { PX.Sound.play('tick'); PS.ui.mainMenu(); };
    bootDone = true; // (after the title menu had its chance to open: the daily gift waits for it to close)
  }

  // ---------------- shared moments: celebrate, wipe, fx, hub music ----------------
  // Every screen uses these (callers guard them: `PS.ui.celebrate ? PS.ui.celebrate(o) : PS.ui.modal(…)`), so big moments look
  // and sound the same everywhere. Everything is made per moment and thrown away after (no caches), nothing here delays the boot,
  // and prefers-reduced-motion is kept: fades and count-ups stay, big motion (rays, petals, bars, flying coins) goes.
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const audio = fn => { try { if (window.PX && PX.Music) fn(PX.Music, PX.Cry); } catch (e) { /* sound is optional */ } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // a pixel-art canvas shown crisp: its CSS size is the bitmap times a whole number, as close to `want` CSS px tall as fits
  function crispScale(c, want, dev) {
    if (c._hdSrc && c._pk > 2) { // a smooth HD Sprout: the size a 2-fine-px Sprout gets here (so layouts stay), then drawn sharp for it
      const dp = dev ? window.devicePixelRatio || 1 : 1, aw = PX.artW(c._hdSrc), ah = PX.artH(c._hdSrc), m = Math.max(1, Math.floor(want * dp / (ah * 2)));
      c.style.width = (aw * 2 * m / dp) + 'px'; c.style.height = (ah * 2 * m / dp) + 'px'; c.dataset.nosnap = '';
      paint(c, c._hdSrc); return;
    }
    const dpr = dev ? window.devicePixelRatio || 1 : 1, w = Math.max(1, c.width), h = Math.max(1, c.height), n = Math.max(1, Math.floor(want * dpr / h));
    c.style.width = (w * n / dpr) + 'px'; c.style.height = (h * n / dpr) + 'px'; c.dataset.nosnap = '';
  }
  // hub music for the screen being shown: the title menu has its own tune, the Garden follows the game clock, the Arcade has its
  // own, every other hub plays the town theme. Scenes call PS.ui.music() when they come back to their menu after a race, battle or
  // match; go() calls it on every screen change (before the scene's show(), which may start its own track).
  function music() {
    audio(M => {
      if (PS.ui.menuOpen) { M.play('title'); return; }
      M.play(current === 'garden' ? (PS.clock.isNight() ? 'garden-night' : 'garden-day') : current === 'arcade' ? 'arcade' : 'town');
    });
  }
  let menuWas = null; // (the title menu opening or closing changes the music: checked with the top bar, twice a second)
  function menuMusic() { const m = !!PS.ui.menuOpen; if (m !== menuWas) { const first = menuWas === null; menuWas = m; if (!first || m) music(); } }

  // PS.ui.celebrate(o) -> Promise, resolved when it closes. A full-screen reward moment: a twilight sky, slowly turning sun rays,
  // petals, leaves and star sparkles, a big Sprout or icon popping in on a little grassy hill, a Pixelify title, up to 4 reward
  // tiles and one button.
  // o = { kind:'trophy'|'unlock'|'hatch'|'evolve'|'legend'|'gift'|'star'|'levelup'|'generic', eyebrow, title, sub (plain text),
  //       sprite: a Sprout or a look (PX.sprig), icon:<canvas>, jingle (id, or false for none; a default per kind), cry:true,
  //       tiles:[{icon:<canvas>|null, value:'+200', label:'Coins'}], button:'Great!', hold:800 (taps ignored that long),
  //       wait:true (wait for hold(false) like a normal pop-up), onClose }
  // It queues behind an open pop-up but not behind hold(): a scene that calls it (race or battle results) wants it now. It sits
  // above every scene canvas (z-index 9000).
  const CEL_JINGLE = { trophy: 'trophy', unlock: 'unlock', hatch: 'hatch', evolve: 'evolved', legend: 'rare', gift: 'daily', star: 'star', levelup: 'levelup', generic: 'item' };
  function celebrate(o) {
    o = Object.assign({}, o);
    return new Promise(done => { queue.push({ cel: o, force: !o.wait, done }); pumpModals(); });
  }
  function heroCanvas(o, want) {
    if (o.sprite && typeof o.sprite === 'object' && !o.sprite.getContext) { const c = document.createElement('canvas'); c.className = 'px'; drawSproutTo(c, o.sprite, o.pose || { eyes: 'happy', mouth: 'open', arms: 'up' }); crispScale(c, want, true); return c; }
    if (o.icon && o.icon.getContext) { const c = document.createElement('canvas'); c.className = 'px'; fitCanvas(c, o.icon); paint(c, o.icon); crispScale(c, Math.min(want, 168), !!o.icon.k); return c; }
    return null;
  }
  function showCelebrate(item) {
    const o = item.cel, root = $('modalRoot'), rm = reduced(), kind = CEL_JINGLE[o.kind] ? o.kind : 'generic';
    const tiles = Array.isArray(o.tiles) ? o.tiles.filter(Boolean).slice(0, 4) : [];
    root.innerHTML = `<div class="sv-cel k-${kind}${rm ? ' rm' : ''}" role="dialog" aria-modal="true">
      <div class="sv-cel-rays" aria-hidden="true"></div><canvas class="sv-cel-fx" aria-hidden="true"></canvas>
      <div class="sv-cel-box"><div class="sv-cel-hero"></div>
        ${o.eyebrow ? `<div class="sv-cel-eb">${E(o.eyebrow)}</div>` : ''}
        ${o.title ? `<h1 class="sv-cel-title">${E(o.title)}</h1>` : ''}${o.sub ? `<p class="sv-cel-sub">${E(o.sub)}</p>` : ''}
        ${tiles.length ? `<div class="sv-res-tiles">${tiles.map(tl => `<div class="sv-res-tile">${tl.icon ? '<canvas class="px"></canvas>' : ''}<b class="num">${E(tl.value == null ? '' : tl.value)}</b><small>${E(tl.label || '')}</small></div>`).join('')}</div>` : ''}
        <button class="btn go sv-cel-ok" type="button">${E(o.button || 'Great!')}</button></div></div>`;
    const layer = root.firstElementChild, hero = layer.querySelector('.sv-cel-hero'), okBtn = layer.querySelector('.sv-cel-ok');
    const want = Math.max(96, Math.min(window.innerHeight * 0.3, 288));
    try { const c = heroCanvas(o, want); if (c) hero.appendChild(c); else hero.remove(); } catch (e) { console.error(e); hero.remove(); }
    // the tile icons share one zoom (one level of detail): about 3 CSS px per art pixel with whole device pixels per fine pixel,
    // a step smaller while the tallest would pass 48 CSS px; each sits on the same line so the numbers below line up
    const tIc = tiles.map(tl => (tl && tl.icon && tl.icon.getContext ? tl.icon : null)), dpr = window.devicePixelRatio || 1;
    const tallest = Math.max(0, ...tIc.map(ic => (ic ? PX.artH(ic) : 0)));
    let A = Math.max(2, 2 * Math.round(1.5 * dpr)); while (A > 2 && tallest * A / dpr > 48) A -= 2; // (device px per art pixel)
    layer.querySelectorAll('.sv-res-tile').forEach((el, i) => {
      const tl = tiles[i], c = el.querySelector('canvas'), b = el.querySelector('b'), ic = tIc[i];
      if (c && ic) {
        fitCanvas(c, ic); paint(c, ic); c.dataset.nosnap = '';
        const w = PX.artW(ic) * A / dpr, h = PX.artH(ic) * A / dpr;
        c.style.width = w + 'px'; c.style.height = h + 'px'; c.style.marginTop = (tallest * A / dpr - h) + 'px';
      }
      const m = /^([+]?)(\d[\d,]*)$/.exec(String(tl.value == null ? '' : tl.value).trim()), to = m ? +m[2].replace(/,/g, '') : 0;
      if (to > 0) { b.textContent = m[1] + '0'; setTimeout(() => countUp(b, 0, to, 700, { prefix: m[1], sound: /coin/i.test(tl.label || '') }), 450 + i * 140); }
    });
    const jg = o.jingle === undefined ? CEL_JINGLE[kind] : o.jingle;
    if (jg) audio(M => M.jingle(jg));
    if (o.cry && o.sprite && typeof o.sprite === 'object') setTimeout(() => audio((M, C) => { if (C) C.play(o.sprite, { stage: o.sprite.stage | 0 }); }), rm ? 0 : 320);
    let fx = null, closed = false;
    const close = () => {
      if (closed) return; closed = true; if (fx) fx.stop();
      if (layer.isConnected) root.innerHTML = '';
      if (open === item) open = null;
      try { if (o.onClose) o.onClose(); } catch (e) { console.error(e); }
      item.done(); pumpModals();
    };
    const holdMs = o.hold == null ? 800 : Math.max(0, +o.hold || 0), t0 = performance.now();
    if (holdMs) { okBtn.classList.add('wait'); setTimeout(() => okBtn.classList.remove('wait'), holdMs); }
    // a tap anywhere continues, once the first moment has played (so a mashed button doesn't skip it)
    layer.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() - t0 < holdMs) return; PX.Sound.play('pop'); close(); });
    item.kill = close;
    if (!rm) fx = celFx(layer, hero.isConnected ? hero : okBtn, close);
  }
  // petals, little leaves and stars bursting from the picture, and star sparkles twinkling round it, on the moment's own canvas
  // while they last (then it's emptied). Returns { stop }. onGone runs if the moment was taken off the page from outside.
  function celFx(layer, anchor, onGone) {
    const cv = layer.querySelector('.sv-cel-fx'); let raf = 0;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; cv.width = 0; cv.height = 0; };
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = layer.clientWidth, H = layer.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const x = cv.getContext('2d'), lr = layer.getBoundingClientRect(), hr = anchor.getBoundingClientRect();
    const cx = hr.left - lr.left + hr.width / 2, cy = hr.top - lr.top + hr.height / 2, R = Math.max(hr.width, hr.height) * 0.62 + 10;
    const COLS = ['#ffd65a', '#f7b6c8', '#fff8e6', '#8fc8f0', '#c9a2f0', '#ff9a6a', '#99e550'];
    const bits = Array.from({ length: 40 }, (_, i) => { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 400 + Math.random() * 460; return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, s: 4 + Math.random() * 3, c: COLS[i % COLS.length], k: i % 5 === 0 ? 2 : i % 4 === 0 ? 1 : 0, d: 0.08 + Math.random() * 0.25 }; });
    const sparks = Array.from({ length: 12 }, (_, i) => ({ a: i / 12 * 6.283 + Math.random() * 0.3, r: R * (0.8 + Math.random() * 0.35), p: Math.random(), s: 3 + Math.random() * 3 }));
    let lastT = performance.now(), age = 0;
    const tick = now => {
      raf = 0;
      if (!layer.isConnected) { stop(); if (onGone) onGone(); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; age += dt;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
      let alive = 0;
      for (const b of bits) {
        if (age < b.d) { alive++; continue; }
        b.vy += 760 * dt; b.vx *= 1 - 1.1 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
        if (b.y > H + 20) continue;
        alive++; x.save(); x.translate(b.x, b.y); x.rotate(b.r);
        if (b.k === 1) { x.scale(Math.cos(b.r * 1.7), 1); x.fillStyle = '#6abe30'; x.beginPath(); x.ellipse(0, 0, 3.5, 7, 0, 0, 6.283); x.fill(); x.fillStyle = '#37946e'; x.fillRect(-0.6, -6, 1.2, 12); }
        else if (b.k === 2) { const z = b.s + 1; x.fillStyle = '#ffd65a'; x.fillRect(-z, -1.5, z * 2, 3); x.fillRect(-1.5, -z, 3, z * 2); x.fillStyle = '#fff8e6'; x.fillRect(-1.5, -1.5, 3, 3); } // a little star
        else { x.scale(1, Math.cos(b.r * 1.3)); x.fillStyle = b.c; x.beginPath(); x.ellipse(0, 0, b.s, b.s * 0.62, 0, 0, 6.283); x.fill(); } // a petal
        x.restore();
      }
      if (age < 2.4) { // four-point star sparkles twinkling round the picture
        alive++; x.fillStyle = '#fff6c8';
        for (const s of sparks) { const k = Math.sin(Math.max(0, age * 5 - s.p * 6)); if (k <= 0) continue; const sx = cx + Math.cos(s.a) * s.r, sy = cy + Math.sin(s.a) * s.r, z = s.s * k; x.fillRect(sx - z, sy - 1, z * 2, 2); x.fillRect(sx - 1, sy - z, 2, z * 2); }
      }
      if (alive) raf = requestAnimationFrame(tick); else { cv.width = 0; cv.height = 0; }
    };
    raf = requestAnimationFrame(tick);
    return { stop };
  }

  // PS.ui.wipe(kind, mid) -> Promise. Covers the whole game, calls mid() once it's fully covered (swap scenes there; it may return
  // a promise, waited for up to 3 s), then reveals. kind: 'plain' (a round sunset iris closing to the middle and opening again),
  // 'battle' / 'race' (8 sliding bars), 'boss' (two berry flashes, then a swirl of wedges), 'arcade' (pixel tiles popping in, corner
  // to corner). PS.ui.wipe(mid) = plain. Wipes asked for together run one after another.
  let wipeChain = Promise.resolve();
  function wipe(kind, mid) {
    if (typeof kind === 'function') { mid = kind; kind = 'plain'; }
    const run = () => runWipe(String(kind || 'plain'), mid), p = wipeChain.then(run, run);
    wipeChain = p.catch(() => {});
    return p;
  }
  async function runWipe(kind, mid) {
    const rm = reduced(), app = $('app'), el = document.createElement('canvas'), INK = '#2a2440', GOLD = '#ffcc44';
    const W = Math.max(1, app.clientWidth), H = Math.max(1, app.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
    el.className = 'sv-wipe'; el.setAttribute('aria-hidden', 'true'); el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
    app.appendChild(el);
    const x = el.getContext('2d'), ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const TS = 48, cols = Math.ceil(W / TS), rows = Math.ceil(H / TS), RR = Math.hypot(W, H) / 2 + 8;
    const draw = (p, fade) => {
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.fillStyle = INK;
      if (fade) { x.globalAlpha = Math.max(0, Math.min(1, p)); x.fillRect(0, 0, W, H); x.globalAlpha = 1; return; }
      if (kind === 'boss') { // six wedges that grow while the whole thing turns
        const rot = p * Math.PI * 1.5, sw = p * Math.PI / 3 + (p >= 1 ? 0.02 : 0);
        for (let j = 0; j < 6; j++) { const a = rot + j * Math.PI / 3; x.beginPath(); x.moveTo(W / 2, H / 2); x.arc(W / 2, H / 2, RR, a, a + sw); x.closePath(); x.fill(); }
      } else if (kind === 'battle' || kind === 'race') { // 8 bars, from the left and the right in turn
        const bh = Math.ceil(H / 8);
        for (let i = 0; i < 8; i++) { const q = Math.max(0, Math.min(1, p * 1.25 - i * 0.03)), w = W * q; x.fillRect(i % 2 ? W - w : 0, i * bh, w, bh + 1); }
      } else if (kind === 'arcade') { // square tiles that grow from the top-left corner to the bottom-right
        const span = cols + rows;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const q = Math.max(0, Math.min(1, p * 1.7 - (r + c) / span * 0.7)); if (!q) continue;
          const s = Math.ceil(TS * q) + (q >= 1 ? 1 : 0); x.fillRect(c * TS + (TS - s) / 2, r * TS + (TS - s) / 2, s, s);
        }
      } else { // a round iris closing to the middle with a sunny rim, like the sun going down
        const r = RR * (1 - p);
        x.fillRect(0, 0, W, H);
        if (r > 0.5) { x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(W / 2, H / 2, r, 0, 6.2832); x.fill(); x.globalCompositeOperation = 'source-over'; x.strokeStyle = GOLD; x.lineWidth = 6; x.beginPath(); x.arc(W / 2, H / 2, r + 3, 0, 6.2832); x.stroke(); }
      }
    };
    const anim = (ms, f) => new Promise(res => { const a0 = performance.now(); const step = now => { const k = Math.min(1, (now - a0) / ms); try { f(k); } catch (e) { /* keep going */ } if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    try {
      if (rm) await anim(160, k => draw(k, true));
      else {
        if (kind === 'boss') await anim(330, k => { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, el.width, el.height); if (k < 0.25 || (k > 0.5 && k < 0.75)) { x.fillStyle = 'rgba(229,83,95,.85)'; x.fillRect(0, 0, el.width, el.height); } });
        await anim(kind === 'battle' || kind === 'race' || kind === 'arcade' ? 380 : kind === 'boss' ? 560 : 300, k => draw(ease(k)));
      }
      draw(1, rm);
      try { const r = typeof mid === 'function' ? mid() : null; if (r && typeof r.then === 'function') await Promise.race([r, sleep(3000)]); } catch (e) { console.error(e); reportError(e, 'wipe'); }
      await sleep(rm ? 40 : 90);
      if (rm) await anim(180, k => draw(1 - k, true));
      else await anim(kind === 'boss' ? 340 : 300, k => draw(1 - ease(k)));
    } finally { el.width = 0; el.height = 0; el.remove(); }
  }

  // ---- PS.ui.fx: small reward helpers ----
  // countUp(el, from, to, ms=700, {prefix, sound}) -> Promise: the number in el rolls up (a coin tick every 80 ms unless sound:false)
  function countUp(el, from, to, ms, o) {
    o = o || {};
    return new Promise(res => {
      if (!el) { res(); return; }
      from = +from || 0; to = +to || 0; ms = ms == null ? 700 : Math.max(0, +ms || 0);
      const pre = o.prefix || '', fmt = n => pre + Math.round(n).toLocaleString(), a0 = performance.now();
      if (!ms || from === to) { el.textContent = fmt(to); res(); return; }
      let tk = 0;
      const step = now => {
        const k = Math.min(1, (now - a0) / ms);
        el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (o.sound !== false && k < 1 && now - tk > 80) { tk = now; PX.Sound.play('coin'); }
        if (k < 1 && el.isConnected) requestAnimationFrame(step); else { el.textContent = fmt(to); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  // coinsFly(fromElOrXY, n=8) -> Promise: coins fly from an element (or {x,y} / [x,y] in page px) to the top bar's coin pill, which
  // bumps. With the top bar hidden (a race or battle) it does nothing; with reduced motion the pill just bumps.
  function coinsFly(from, n) {
    n = Math.max(1, Math.min(12, n == null ? 8 : n | 0));
    return new Promise(res => {
      const pill = $('coinPill'), app = $('app'), pr = pill ? pill.getBoundingClientRect() : null;
      if (!pr || !pr.width || !chromeOn) { res(); return; }
      if (reduced()) { bumpCoins(); res(); return; }
      const ar = app.getBoundingClientRect();
      let fx0 = ar.left + ar.width / 2, fy0 = ar.top + ar.height / 2;
      if (from && from.getBoundingClientRect) { const r = from.getBoundingClientRect(); fx0 = r.left + r.width / 2; fy0 = r.top + r.height / 2; }
      else if (Array.isArray(from)) { fx0 = +from[0]; fy0 = +from[1]; }
      else if (from && typeof from.x === 'number') { fx0 = from.x; fy0 = from.y; }
      fx0 -= ar.left; fy0 -= ar.top;
      const src = icon('coin'), S = PX.artW(src) * 2, tx = pr.left - ar.left + 14 - S / 2, ty = pr.top - ar.top + pr.height / 2 - S / 2;
      const layer = document.createElement('div'); layer.className = 'sv-fly'; app.appendChild(layer);
      const coins = Array.from({ length: n }, (_, i) => {
        const c = document.createElement('canvas'); c.className = 'px'; c.width = src.width; c.height = src.height; c.dataset.nosnap = '';
        c.getContext('2d').drawImage(src, 0, 0, src.width, src.height); c.style.width = c.style.height = S + 'px'; c.style.opacity = 0; layer.appendChild(c);
        const sx = fx0 - S / 2 + (Math.random() - 0.5) * 40, sy = fy0 - S / 2 + (Math.random() - 0.5) * 26;
        return { c, d: i * 40, sx, sy, mx: (sx + tx) / 2 + (Math.random() - 0.5) * 80, my: Math.min(sy, ty) - 60 - Math.random() * 60 };
      });
      const a0 = performance.now(); let landed = 0;
      const step = now => {
        let busy = 0;
        for (const k of coins) {
          if (k.done) continue;
          const u = (now - a0 - k.d) / 500;
          if (u < 0) { busy++; continue; }
          if (u >= 1) { k.done = true; k.c.remove(); landed++; if (landed === 1 || landed === n) bumpCoins(); continue; }
          busy++;
          const e = u * (0.55 + 0.45 * u), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c2 = e * e;
          k.c.style.opacity = 1; k.c.style.transform = `translate3d(${a * k.sx + b * k.mx + c2 * tx}px,${a * k.sy + b * k.my + c2 * ty}px,0)`;
        }
        if (busy && layer.isConnected) requestAnimationFrame(step); else { layer.remove(); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  // banner(text, {tone:'go'|'info'|'warn'|'moon', ms:1300}) -> Promise: a big band across the middle ("GO!", "Round 2!")
  function banner(text, o) {
    o = o || {};
    return new Promise(res => {
      const el = document.createElement('div'), tone = ['go', 'info', 'warn', 'moon'].includes(o.tone) ? o.tone : 'go';
      el.className = `sv-bnr t-${tone}${/\d/.test(String(text)) ? ' num' : ''}${reduced() ? ' rm' : ''}`; el.setAttribute('role', 'status'); // (.num: Pixelify's 2 and 8 look alike)
      el.innerHTML = `<b>${E(text)}</b>`; $('app').appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 280); }, Math.max(300, +o.ms || 1300));
    });
  }

  // ---------------- evolution: a scene of its own (replaces the old "became a …" pop-up) ----------------
  // "Whoa! Sprig is changing!" -> glowing silhouettes of the old and new forms swap faster and faster (2 to 12 a second) -> a warm
  // flash -> the new form in colour with petals, its voice and a jingle -> why it changed that way, and its new moves. Queued like a
  // pop-up (it waits until a race or battle is over). A tap skips ahead after 1.5 s once this player has seen that change before
  // (remembered in the optional PS.S.journey.evo).
  function showEvolution(item) {
    // (one feed can grow a seedling straight into a bloom: two scenes, so each is drawn and named for its own stage, not today's)
    const e = item.evo, s = e.s, rm = reduced(), root = $('modalRoot'), stg = e.stage == null ? s.stage : e.stage | 0, nk = state.natureKind(s);
    const fi = state.formInfo(stg >= 2 ? s : Object.assign({}, s, { stage: 1, form: s.stage === 1 ? s.form : nk + 'bud' }));
    const newL = state.lookOf(s); if (stg < 2) { delete newL.bloom; newL.bud = nk; }
    const oldL = Object.assign({}, newL);
    if (stg >= 2) { delete oldL.bloom; oldL.bud = nk; } else delete oldL.bud; // (the form it had before: a bud, or a seedling)
    const J = journey(), seenEvo = J.evo && typeof J.evo === 'object' ? J.evo : (J.evo = {}), key = stg + ':' + (s.form || '') + ':' + (s.flower || ''), seen = !!seenEvo[key];
    seenEvo[key] = 1; PS.save();
    const oldName = e.name || s.name, why = evoWhy(s, stg);
    const sayDone = `${oldName} became a ${fi.name}!${stg >= 2 ? ' It is fully grown!' : ''}${why ? ' ' + why : ''}`;
    const moves = (fi.moves || []).map(id => D.MOVES[id]).filter(Boolean).map(m => `<span class="chip-el" style="background:${(D.ELEMENTS[m.el] || D.ELEMENTS.normal).color}">${E(m.name)}</span>`).join('');
    root.innerHTML = `<div class="sv-cel sv-evo${rm ? ' rm' : ''}" role="dialog" aria-modal="true">
      <div class="sv-cel-rays" aria-hidden="true"></div><canvas class="sv-cel-fx" aria-hidden="true"></canvas><div class="sv-evo-flash" aria-hidden="true"></div>
      <div class="sv-cel-box"><div class="sv-cel-hero sv-evo-hero"><canvas class="px"></canvas></div>
        <h1 class="sv-cel-title" hidden>${E(fi.name)}!</h1>
        <p class="sv-evo-say">Whoa! ${E(oldName)} is changing!</p>
        <div class="sv-evo-moves" hidden>${moves ? `<small>New moves</small>${moves}` : ''}</div>
        <button class="btn go sv-cel-ok" type="button" hidden>Wonderful!</button></div></div>`;
    const layer = root.firstElementChild, hero = layer.querySelector('.sv-evo-hero'), cv = hero.querySelector('canvas'), say = layer.querySelector('.sv-evo-say');
    let A = null, B = null;
    try { A = PX.sprig(oldL, { eyes: 'happy' }); B = PX.sprig(newL, { eyes: 'happy', mouth: 'open', arms: 'up' }); } catch (err) { console.error(err); }
    const evoWant = Math.max(96, Math.min(window.innerHeight * 0.32, 300)), hdEvo = !!(A && A.hdSpr && PX.hdUp);
    let evoCss = 0;
    if (hdEvo) { // smooth HD Sprouts: the size 2-fine-px Sprouts get here, both forms drawn sharp for it (no pixel snapping)
      const dpr = window.devicePixelRatio || 1; evoCss = 64 * Math.max(1, Math.floor(evoWant * dpr / 64)) / dpr;
      A = PX.hdUp(A, evoCss / 32); if (B) B = PX.hdUp(B, evoCss / 32);
    }
    const W = Math.max(A ? A.width : 64, B ? B.width : 64), H = Math.max(A ? A.height : 64, B ? B.height : 64); // (fine pixels: the sprites are hi-res)
    cv.width = W; cv.height = H;
    if (hdEvo) { cv.style.width = cv.style.height = evoCss + 'px'; cv.style.imageRendering = 'auto'; cv.dataset.nosnap = ''; }
    else crispScale(cv, evoWant, true);
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const drawForm = (src, glow) => {
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H); if (!src) return;
      try { x.drawImage(src, 0, 0, src.width, src.height, Math.round((W - src.width) / 2), H - src.height, src.width, src.height); } catch (err) { return; }
      if (glow) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#fff6c8'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
    };
    audio(M => M.play('evolve'));
    let raf = 0, fx = null, phase = 0, closed = false, endT = 0;
    const t0 = performance.now(), FLASH = rm ? 1200 : 4000;
    const finish = () => { // the new form, in colour
      if (phase >= 2) return; phase = 2; endT = performance.now();
      layer.querySelector('.sv-evo-flash').classList.add('on');
      PX.Sound.play('evolve');
      audio((M, C) => { music(); M.jingle('evolved'); if (C) setTimeout(() => { try { C.play(s, { stage: s.stage }); } catch (err) { /* optional */ } }, 250); });
      say.textContent = sayDone;
      layer.classList.add('done'); layer.querySelector('.sv-cel-title').hidden = false; layer.querySelector('.sv-evo-moves').hidden = !moves;
      const ok = layer.querySelector('.sv-cel-ok'); ok.hidden = false; ok.classList.add('wait'); setTimeout(() => ok.classList.remove('wait'), 700);
      if (!rm) fx = celFx(layer, hero, close);
    };
    const close = () => {
      if (closed) return; closed = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (fx) fx.stop();
      cv.width = 0; cv.height = 0;
      if (layer.isConnected) root.innerHTML = '';
      if (open === item) open = null;
      if (phase < 2) music();
      pumpModals();
    };
    const tick = now => {
      raf = 0;
      if (!layer.isConnected) { close(); return; }
      const tt = now - t0;
      if (phase < 2) {
        if (tt >= FLASH) finish();
        else if (tt < 1000 || rm) drawForm(A, false);
        else { if (!phase) { phase = 1; layer.classList.add('glow'); } const u = (tt - 1000) / 3000, cyc = 6 * u + 15 * u * u; drawForm(Math.floor(cyc * 2) % 2 ? B : A, true); }
      }
      if (phase >= 2) { drawForm(B, false); return; } // (the last picture stays: no need to keep drawing it)
      raf = requestAnimationFrame(tick);
    };
    item.kill = close;
    raf = requestAnimationFrame(tick);
    layer.addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      const now = performance.now();
      if (phase < 2) { if (seen && now - t0 > 1500) finish(); return; }
      if (now - endT < 700) return;
      PX.Sound.play('pop'); close();
    });
  }

  // ---------------- next goal: a small pill in the top bar (icon only on a phone); tap it to go there ----------------
  // A short script first (the first-session loop), then the next challenge from the Battle screen (PS.battle.nextChallenge). Each
  // scripted goal pays a few coins once (coins fly from the chip). Saved in the optional PS.S.journey = { done:{id:time}, pet, fed,
  // evo, hatched } (made when first needed; a game from before this update starts with the goals it already reached marked done, unpaid).
  const nextCh = () => { try { return PS.battle && typeof PS.battle.nextChallenge === 'function' ? PS.battle.nextChallenge() : null; } catch (e) { return null; } };
  function firstTrophy() {
    try { if (PS.battle && typeof PS.battle.trophies === 'function') { const list = PS.battle.trophies(); if (Array.isArray(list)) return list.some(tr => tr && tr.got); } } catch (e) { /* the league list below */ }
    const L = D.LEAGUES && D.LEAGUES[0]; return !!(L && (PS.S.progress.leagues[L.id] || {}).cleared);
  }
  const GOALS = [
    { id: 'hatch', label: 'Hatch your egg!', ic: 'egg', to: 'garden', coins: 50, done: () => PS.S.sprouts.length > 0 },
    { id: 'pet', label: 'Pet your Sprout!', ic: 'heart', to: 'garden', coins: 30, done: J => !!J.pet },
    { id: 'feed', label: 'Feed it a fruit!', ic: 'fruit', to: 'garden', coins: 30, done: J => !!J.fed },
    { id: 'race', label: 'Win a race!', ic: 'race', to: 'race', coins: 80, done: () => (PS.S.totals.raceWins || 0) > 0 },
    { id: 'battle', label: 'Win a battle!', ic: 'battle', to: 'battle', coins: 80, ch: true, done: () => (PS.S.totals.battleWins || 0) > 0 },
    { id: 'bud', label: 'Grow a bud!', ic: 'garden', to: 'garden', coins: 120, done: () => PS.S.sprouts.some(s => s.stage > 0) },
    { id: 'trophy', label: 'Win a trophy!', ic: 'trophy', to: 'battle', coins: 150, ch: true, done: () => firstTrophy() },
  ];
  const goalDone = (g, J) => { try { return !!g.done(J); } catch (e) { return false; } };
  function journey() {
    let J = PS.S.journey;
    if (!J || typeof J !== 'object' || Array.isArray(J)) {
      J = PS.S.journey = { done: {} };
      const T = PS.S.totals || {}, old = PS.S.sprouts.length > 1 || (T.battles || 0) + (T.races || 0) > 0;
      if (old) for (const g of GOALS) if (g.id === 'pet' || g.id === 'feed' || goalDone(g, J)) J.done[g.id] = 1;
      PS.save();
    }
    if (!J.done || typeof J.done !== 'object' || Array.isArray(J.done)) J.done = {};
    return J;
  }
  PS.on('sprout:pet', () => { try { const J = journey(); if (!J.pet) { J.pet = 1; PS.save(); } } catch (e) { /* optional */ } });
  PS.on('sprout:fed', () => { try { const J = journey(); if (!J.fed) { J.fed = 1; PS.save(); } } catch (e) { /* optional */ } });
  const chLabel = c => { const l = String(c && c.label || '').trim(); return !l ? '' : /[!?.]$/.test(l) ? l : `${l}!`; };
  function goalIcon(ic) {
    try { if (ic === 'egg') return PX.item('egg', (PS.S.eggs[0] || {}).kind || 'meadow'); if (ic === 'fruit') return PX.item('fruit', 'apple'); } catch (e) { /* the shell's own */ }
    return icon(ic === 'egg' || ic === 'fruit' ? 'garden' : ic);
  }
  let goalNow = null, goalKey = '', goalT = 0;
  function goalTick(force) {
    const el = $('goalChip'); if (!el || !PS.S || !PS.S.totals) return;
    if (!force && performance.now() < goalT) return; goalT = performance.now() + 1500;
    const J = journey(); let g = GOALS.find(q => !J.done[q.id]) || null;
    // a goal reached: pay it once, then move on (not under a pop-up or the title menu, so the moment is seen)
    if (g && goalDone(g, J) && chromeOn && !held && !open && !queue.length && !PS.ui.menuOpen) {
      J.done[g.id] = Date.now(); PS.save();
      if (g.coins) { state.addCoins(g.coins, 'goal'); coinsFly(el, 6); }
      toast(`Goal done! +${g.coins} coins`, 2600); PX.Sound.play('chime');
      g = GOALS.find(q => !J.done[q.id]) || null;
    }
    let show = null;
    if (g) { const c = g.ch ? nextCh() : null; show = { label: (c && chLabel(c)) || g.label, ic: g.ic, go: c && typeof c.go === 'function' ? () => c.go() : () => go(g.to) }; }
    else { const c = nextCh(); if (c && chLabel(c)) show = { label: chLabel(c), ic: 'battle', go: () => c.go() }; }
    goalNow = show;
    const k = show ? show.label + '|' + show.ic : '';
    if (k === goalKey) return; goalKey = k;
    el.hidden = !show; if (!show) return;
    el.querySelector('span').textContent = show.label; el.setAttribute('aria-label', 'Next goal: ' + show.label);
    try { const src = goalIcon(show.ic), c = el.querySelector('canvas'); fitCanvas(c, src); paint(c, src); } catch (e) { /* no icon */ }
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  // ---------------- welcome back + a daily gift ----------------
  // The first time the game is opened on a new day: "Welcome back, NAME!" with a gift from the partner Sprout that takes turns
  // (coins, an egg, a Golden Fruit). After 6 hours away on the same day, just a hello. No streaks, no "you missed a day". Saved in the
  // optional PS.S.daily = { gift: time, at: time, n }. (Not for test saves, so test runs start clean; &daily forces it there.)
  // It waits until the game is really being played: boot finished (the title menu opens at the end of boot), the title menu is closed
  // and a player is picked, the Garden is on screen, and nothing else is up (no pop-up; no race or battle holding pop-ups). One gift
  // however many days were missed; it checks again when the app comes back after an hour away.
  let dailyDone = false, bootDone = false;
  document.addEventListener('visibilitychange', () => { if (!document.hidden && hiddenAt && Date.now() - hiddenAt > 3600e3) dailyDone = false; });
  function dailyTick() {
    if (dailyDone || !bootDone || PS.ui.menuOpen || current !== 'garden' || open || queue.length || held || !chromeOn || !PS.players.current()) return;
    dailyDone = true;
    if (!PS.S.sprouts.length || (PS.players.isTesting() && !/[?&]daily\b/.test(location.search))) return;
    const now = Date.now(), d = PS.S.daily && typeof PS.S.daily === 'object' && !Array.isArray(PS.S.daily) ? PS.S.daily : (PS.S.daily = {});
    const day = ts => new Date(ts || 0).toDateString(), away = now - (+d.at || 0), gift = day(d.gift) !== day(now);
    d.at = now; PS.save();
    const who = PS.players.isTesting() ? 'friend' : ((PS.players.current() || {}).name || 'friend');
    if (!gift) { if (away > 6 * 3600e3) toast(`Welcome back, ${who}!`, 2800); return; }
    const n = (+d.n || 0) % 3; d.gift = now; d.n = n + 1;
    let tile;
    if (n === 1) { const egg = state.addEgg(D.AREAS[PS.S.area] ? PS.S.area : 'meadow', 'Daily gift'); let ic = null; try { ic = PX.item('egg', egg.kind); } catch (e) { /* no icon */ } tile = { icon: ic, value: '+1', label: (D.EGGS[egg.kind] || D.EGGS.meadow).name }; }
    else if (n === 2 && D.FRUITS.goldfruit) { state.addFruit('goldfruit', 1); let ic = null; try { ic = PX.item('fruit', 'goldfruit'); } catch (e) { /* no icon */ } tile = { icon: ic, value: '+1', label: D.FRUITS.goldfruit.name }; }
    else { state.addCoins(150, 'daily'); tile = { icon: icon('coin'), value: '+150', label: 'Coins' }; }
    PS.save();
    const eggs = PS.S.eggs.length, partner = state.active();
    celebrate({ kind: 'gift', wait: true, eyebrow: 'Daily gift', title: `Welcome back, ${who}!`,
      sub: eggs ? `${eggs === 1 ? 'An egg is' : eggs + ' eggs are'} waiting in the Garden. Here's a present!` : `${partner ? partner.name : 'Your garden'} missed you! Here's a present!`,
      sprite: partner || null, icon: partner ? null : icon('gift'), tiles: [tile], button: 'Thank you!', hold: 900 });
  }

  // ---------------- music on/off (the title menu shows it beside Sound; PX.Music.muted is kept per device by audio.js) ----------------
  function setMusic(on) { try { if (window.PX && PX.Music) { PX.Music.muted = !on; if (on) music(); } } catch (e) { /* optional */ } }
  const musicOn = () => { try { return !(window.PX && PX.Music && PX.Music.muted); } catch (e) { return true; } };
  // the title menu (menu.js) has a Sound button; a Music button is added beside it here, unless menu.js already has one
  function addMusicButton() {
    const snd = document.querySelector('.mm-sound'); if (!snd || !snd.parentElement) return;
    let b = snd.parentElement.querySelector('.mm-music, [data-a="music"]');
    if (!b) {
      b = snd.cloneNode(true); b.classList.remove('mm-sound'); b.classList.add('mm-music', 'sv-music'); b.removeAttribute('data-a'); b.dataset.sv = 'music';
      snd.after(b);
      b.addEventListener('click', ev => { ev.stopPropagation(); setMusic(!musicOn()); PX.Sound.play('tick'); paintMusic(b); toast(musicOn() ? 'Music on' : 'Music off', 1400); });
    }
    if (b.dataset.sv === 'music') paintMusic(b);
  }
  function paintMusic(b) {
    const on = musicOn(), c = b.querySelector('canvas'), sp = b.querySelector('span');
    if (c) paint(c, icon(on ? 'music' : 'nomusic'));
    if (sp) sp.textContent = on ? 'Music on' : 'Music off';
    b.setAttribute('aria-label', on ? 'Music is on. Tap to turn it off' : 'Music is off. Tap to turn it on');
  }

  // ---------------- garden areas: the drop-down map (tap the garden's name) ----------------
  // mapPreview(area) -> a little postcard of a garden area: 150 x 84 art px at k = 2 (the game's own fine pixels, so it matches
  // the garden): its sky by the game clock, far hills, lawn, shore and water, its rest house, its tree and one of its props, drawn
  // at their real size. Colours come from the garden's themes (PS.gardenThemes, garden.js). Made per call; nothing is kept.
  // pickMap(mapId, area, { anchor, onPick }) -> the drop-down under the garden's name: every area as a postcard with who lives
  // there (Sprout faces, an egg when one is waiting). Tap one to go there (onPick(areaId)); tap outside, the X or the name again
  // to close. (Solunar has no map skins, so mapId is ignored; the signature is PVZ Garden's.)
  const PV_PROPS = { meadow: ['flowerbed', 'bush'], beach: ['umbrella', 'sandcastle'], moonlit: ['lantern', 'crystal'], candy: ['candycane', 'cupcake'] };
  const PV_HOME = { meadow: 'shroomhouse', beach: 'beachhut', moonlit: 'crystalcave', candy: 'gingerhouse' };
  const PV_TREE = { meadow: 'tree', beach: 'palm', moonlit: 'glowtree', candy: 'lollitree' };
  const hexMix = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16) || 0), A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  function mapPreview(id) {
    const W = 150, H = 84, K = 2, FP = 1 / K, c = document.createElement('canvas'); c.width = W * K; c.height = H * K; c.k = K;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.setTransform(K, 0, 0, K, 0, 0);
    const th = (PS.gardenThemes && PS.gardenThemes[id]) || {}, A = D.AREAS[id] || D.AREAS.meadow, theme = A.theme || 'day';
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    // a round disc in fine rows (no blurry edge: the same fine pixels as the sprites)
    const disc = (cx, cy, r, col) => { g.fillStyle = col; for (let fy = Math.floor((cy - r) * K); fy < Math.ceil((cy + r) * K); fy++) { const dy = (fy + 0.5) / K - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy)); const a = Math.round((cx - hw) * K), b = Math.round((cx + hw) * K); if (b > a) g.fillRect(a / K, fy / K, (b - a) / K, FP); } };
    let n = 0; try { n = PS.clock.night(); } catch (e) { n = 0; }
    const sky = (th.sky || ['#6cc3f2', '#86cff5', '#a4dcf8', '#c4e9fb']).map((col, i) => hexMix(col, (th.skyN || [])[i] || col, n));
    // the sky: 7 soft bands from its 4 colours (a fine row of the in-between colour where two meet)
    for (let i = 0; i < 7; i++) { const k = i / 6 * 3, a = Math.floor(k), col = hexMix(sky[a], sky[Math.min(3, a + 1)], k - a), y0 = i * 6; R(0, y0, W, 40 - y0, col); if (i) R(0, y0, W, FP, hexMix(col, sky[Math.max(0, a)], 0.5)); }
    const moonish = n > 0.5 || th.bigMoon;
    if (moonish) {
      g.fillStyle = '#ffffff'; for (let i = 0; i < 18; i++) { const x = (i * 37 + 11) % W, y = (i * 23 + 5) % 30; if (x < 104 || x > 136 || y > 24) g.fillRect(x + (i & 1) * FP, y, FP, FP); }
      for (const [r, col] of [[6.5, '#d9cfa0'], [6, '#f4ecc8'], [5, '#fffbe6']]) disc(120, 13, r, col);
      R(117.5, 10.5, 1.5, 1.5, '#e4dab0'); R(121, 14.5, 1, 1, '#e4dab0');
    } else {
      g.globalAlpha = 0.25; disc(120, 13, 10, '#fffbe0'); g.globalAlpha = 1;
      for (const [r, col] of [[6.5, '#fbf3dc'], [6, '#fdf6c0'], [5, '#fff27a']]) disc(120, 13, r, col);
      R(117.5, 10.5, 2, 1.5, '#fffbd0');
    }
    // far and near hills: smooth tops a fine pixel at a time, a 1-fine-px darker rim with a lit band under it
    const far = th.far || ['#a6d98b', '#7fbf6a'], near = th.near || far, grass = th.grass || ['#a2de76', '#8fd46a', '#83ca61', '#76bd58'];
    const hill = (base, amp, f, ph, fill, edge) => { for (let fx = 0; fx < W * K; fx++) { const x = (fx + 0.5) / K, top = Math.round((base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.4) * K) / K; R(fx * FP, top, FP, H - top, fill); R(fx * FP, top, FP, FP, edge); R(fx * FP, top + FP, FP, 1, hexMix(fill, '#ffffff', 0.14)); } };
    hill(33, 2.4, 0.07, 1, far[0], far[1]);
    hill(39, 1.4, 0.11, 3, near[0], near[1]);
    // the lawn: lighter at the back, soft patches, fine blades
    R(0, 43, W, H - 43, grass[1]); R(0, 43, W, 1.5, grass[0]); R(0, 44.5, W, FP, hexMix(grass[0], grass[1], 0.5));
    for (const [x, y, rx, ry, k] of [[24, 60, 18, 5, 2], [70, 72, 22, 6, 0], [100, 56, 14, 4, 3], [40, 79, 16, 4, 3]]) { g.fillStyle = grass[k]; for (let fy = Math.floor((y - ry) * K); fy <= (y + ry) * K; fy++) { const dy = (fy + 0.5) / K - y, hw = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))); if (hw > 0.5) g.fillRect(Math.round((x - hw) * K) / K, fy / K, Math.round(hw * 2 * K) / K, FP); } }
    for (let i = 0; i < 46; i++) { const x = (i * 53 + 7) % 104 + 2, y = 47 + (i * 29 % 36); R(x, y, FP, 1.5, th.blade || '#5aa846'); R(x, y - FP, FP, FP, th.bladeHi || '#b8ec8c'); }
    // shore and water on the right (sand, a damp edge, foam, then deeper bands), as in the garden
    const water = th.water || ['#9fe6f7', '#5fcde4', '#3f9fd0', '#2f7fb8'], sx = y => 108 + (y - 36) * 0.22 + Math.sin(y * 0.35) * 0.8;
    for (let fy = 36 * K; fy < H * K; fy++) {
      const y = (fy + 0.5) / K, s = Math.round(sx(y) * K) / K, top = fy / K;
      R(s - 3, top, 2, FP, th.sand || '#efe0b4'); R(s - 1, top, 1, FP, th.wet || '#d9c38e');
      R(s, top, 5, FP, water[0]); R(s + 5, top, 9, FP, water[1]); R(s + 14, top, W - s - 14, FP, water[2]); R(s + 5, top, FP, FP, hexMix(water[0], water[1], 0.5)); R(s + 14, top, FP, FP, hexMix(water[1], water[2], 0.5));
      if ((fy & 3) < 3) R(s, top, FP, FP, th.foam || '#ffffff');
    }
    R(108, 36, W - 108, FP, th.hl || '#d6f5fd');
    for (const [x, y, w] of [[128, 48, 3], [138, 60, 4], [124, 70, 3], [142, 76, 3], [133, 41, 2]]) { R(x, y, w, FP, th.hl || '#d6f5fd'); R(x + FP, y - FP, w - 1, FP, '#ffffff'); }
    // its house, tree and props at their real size (fine pixels kept), back to front
    const put = (kind, x, by) => { try { const p = PX.prop(kind, theme); if (p) g.drawImage(p, Math.round(x - PX.artW(p) / 2), by - PX.artH(p), PX.artW(p), PX.artH(p)); } catch (e) { /* art optional */ } };
    const pp = PV_PROPS[id] || PV_PROPS.meadow;
    put(PV_TREE[id] || 'tree', 92, 70); put(pp[1], 74, 82); put(PV_HOME[id] || 'shroomhouse', 42, 80); put(pp[0], 14, 84);
    // the night: a soft tint over the land (the sky has its own night colours)
    const nt = th.night || [20, 18, 64, 0.36], na = (th.dim || 0) + (nt[3] - (th.dim || 0) * 0.5) * n;
    if (na > 0.01) { g.fillStyle = `rgba(${nt[0]},${nt[1]},${nt[2]},${Math.min(0.6, na).toFixed(3)})`; g.fillRect(0, 30, W, H - 30); }
    return c;
  }
  let drop = null;
  function closeDrop(quiet) {
    if (!drop) return; const d = drop; drop = null;
    document.removeEventListener('keydown', d.key);
    if (!quiet) PX.Sound.play('back');
    d.el.classList.add('am-out'); setTimeout(() => d.el.remove(), 170);
  }
  function pickMap(mapId, area, o) {
    o = o || {};
    if (drop) { closeDrop(); return; } // (the name tapped again: close it)
    const cur = D.AREAS[area] ? area : PS.S.area, app = $('app'), el = document.createElement('div');
    el.className = 'am-drop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Garden areas');
    el.innerHTML = `<div class="am-back"></div><div class="am-panel"><div class="am-head"><b class="px-title">Where to?</b>
      <button class="am-x" type="button" aria-label="Close"><svg width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="M0 0h2v1h1v1h1V1h1V0h2v2H6v1H5v1h1v1h1v2H5V6H4V5H3v1H2v1H0V5h1V4h1V3H1V2H0z"/></svg></button></div><div class="am-grid"></div></div>`;
    const grid = el.querySelector('.am-grid');
    for (const a of D.AREA_ORDER) {
      const A = D.AREAS[a], mine = PS.S.sprouts.filter(s => s.area === a), eggs = PS.S.eggs.filter(e => e.area === a);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'am-card' + (a === cur ? ' on' : '') + ' am-' + a;
      const who = mine.length ? `${mine.length} Sprout${mine.length === 1 ? '' : 's'}` : 'No Sprouts yet';
      b.setAttribute('aria-label', `${A.name}: ${who}${eggs.length ? `, ${eggs.length} egg${eggs.length === 1 ? '' : 's'}` : ''}${a === cur ? '. You are here' : ''}`);
      b.innerHTML = `<span class="am-pic"><canvas class="px am-pv"></canvas>${a === cur ? '<i class="am-here">Here</i>' : ''}${eggs.length ? '<canvas class="px am-egg"></canvas>' : ''}</span>
        <b class="px-title am-name">${E(A.name)}</b><span class="am-who"></span>`;
      const pv = b.querySelector('.am-pv'); try { const src = mapPreview(a); fitCanvas(pv, src); paint(pv, src); } catch (e) { console.error(e); }
      const eg = b.querySelector('.am-egg'); if (eg) { try { const src = PX.item('egg', eggs[0].kind); fitCanvas(eg, src); paint(eg, src); } catch (e) { eg.remove(); } }
      const row = b.querySelector('.am-who');
      // the Sprouts who live there (the partner first), as little faces: a pre-reader finds "where my Sprout is" at a glance
      const faces = mine.slice().sort((x, y) => (y.id === PS.S.activeId) - (x.id === PS.S.activeId)).slice(0, mine.length > 5 ? 4 : 5);
      for (const s of faces) { const fc = document.createElement('canvas'); fc.className = 'px am-face'; row.appendChild(fc); try { drawSproutTo(fc, s, { eyes: 'happy' }); } catch (e) { fc.remove(); } }
      if (mine.length > faces.length) { const m = document.createElement('i'); m.className = 'am-more'; m.textContent = '+' + (mine.length - faces.length); row.appendChild(m); }
      if (!mine.length) { const m = document.createElement('i'); m.className = 'am-none'; m.textContent = who; row.appendChild(m); }
      b.onclick = () => { PX.Sound.play(a === cur ? 'tick' : 'select'); closeDrop(true); if (a !== cur && o.onPick) { try { o.onPick(a); } catch (e) { console.error(e); reportError(e, 'areas'); } } };
      grid.appendChild(b);
    }
    const close = () => closeDrop();
    el.querySelector('.am-back').addEventListener('pointerdown', e => { e.preventDefault(); close(); });
    el.querySelector('.am-x').onclick = close;
    app.appendChild(el);
    // drop it from under the garden's name (the pill), or from the top of the screen
    const ar = app.getBoundingClientRect(), anc = o.anchor && o.anchor.getBoundingClientRect ? o.anchor.getBoundingClientRect() : null;
    el.querySelector('.am-panel').style.top = Math.round((anc ? anc.bottom : $('hud').getBoundingClientRect().bottom + 60) - ar.top + 6) + 'px';
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    drop = { el, key };
    PX.Sound.play('whoosh');
  }

  PS.ui = { reportError, boot, go, toast, modal, celebrate, wipe, music, setMusic, musicOn, fx: { countUp, coinsFly, banner }, pickMap, mapPreview, closeDrop: () => closeDrop(true), closeModal, pickSprout, pickMoves, chrome, hold, refresh, devPanel, playersPanel: () => PS.ui.mainMenu(), backupPanel, parentGate, icon, paint, drawSproutTo, fitCanvas, freezeCoins, setMuted, isMuted: () => !!PX.Sound.muted, get current() { return current; }, get modalOpen() { return !!open || queue.length > 0 || !!drop; }, get dropOpen() { return !!drop; } };
})();
