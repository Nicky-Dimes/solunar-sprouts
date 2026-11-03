// arcade.js — Solunar Sprouts: the Arcade tab (PS.scenes.arcade). Short garden mini-games for young kids on a touch screen, starring the
// player's own partner Sprout (PS.state.active(); the default look if there is none):
//   Fruit Catch   (always open) drag: the Sprout pushes a basket along the grass and catches fruit falling from the trees; a squirrel
//                 in the branches drops acorns and pinecones (it wiggles and shows "!" first, and a shadow shows where they land)
//   Sprout Pairs  (always open) memory cards with Sprouts and eggs; from the second board a sneaky fox card mixes two hidden cards
//   Star Hop      a gentle runner on a moonlit pond: tap to hop from lily pad to lily pad (tap again in the air for a second hop) and
//                 collect stars; a fall into the water costs nothing but time (a bubble carries the Sprout to the next pad)
//   Bubble Pop    tap rising bubbles to free the garden animals inside; popping the same colour again and again builds x2 / x3;
//                 never the grey rain-cloud bubbles (they cost a heart)
//   Egg Roll      drag to steer an egg rolling down the garden slope through flower gates, collecting coins; puddles cost a heart
// Fruit Catch and Sprout Pairs are open from the start; Star Hop, Bubble Pop and Egg Roll open one by one (2 stars on Level 1 of the
// game before opens the next; the hub celebrates it once, PS.S.arcade.unl). Every game has Levels 1-3 (Level n+1 opens at 2 stars on
// Level n), its own stars + best per level, coins every game and a prize for the first 3 stars on each level (a hat, paints / stickers,
// a rare egg). CLAW MACHINE (always open, no stars): Claw tokens (PS.S.arcade.tokens) come from every star earned for the first time,
// the first game of the day, 60 coins each, and a 3-token welcome gift on the first visit. Prizes: coin bags, fruit baskets, Sprout
// plushies (a paint tin of the plushie's colour), capsules (a hat or a pattern sticker) and eggs in a nest. Never more than 4 misses in
// a row (PS.S.arcade.claw.miss): the 5th grab always wins.
// Save (optional, made lazily, read defensively): PS.S.arcade = { <game id>[_2|_3]: { best, stars, plays, prize, last }, unl: { id: time },
//   tokens, day, clawGift, claw: { grabs, wins, miss, plush: { colour: n } } }.
// Art: PX.sprig / PX.critter / PX.item and art-arcade.js (PX.arcade.*), all hi-res (c.k fine px per art px; sizes in art px via
// PX.artW / artH, 5-argument draws). Each game's scale lands every fine px on whole device px; backgrounds are painted once per layout
// on a fine-pixel buffer (paintBg); the Claw Machine uses the plushies' fine pixel (g.fp, prizes at g.P / g.Q). Hub pictures are
// 160 x 60 art-px scenes at k 2 (previewOf, fitHub). Music: 'arcade' on the hub (PS.ui.music()), each game's own
// track in play. CSS is injected from here (classes .ar-*); results use the shell's .sv-res kit (with fallbacks here).
// Test hooks: window.__arcade (start, game, end, sim(sec, bot), tokens, ...), see the bottom of the file.
(function () {
  'use strict';
  if (!window.PS || !window.PX) return;
  const D = PS.D, ST = PS.state, INK = PX.INK || '#222034', TXT = '#3b2a1c';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const F_UI = '"Fredoka", ui-rounded, "SF Pro Rounded", system-ui, sans-serif', F_PX = '"Pixelify Sans", ui-monospace, Menlo, monospace';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const snd = (n, o) => { try { PX.Sound.play(n, o); } catch (e) { /* audio optional */ } };
  const music = id => { try { if (PX.Music && PX.Music.play) PX.Music.play(id); } catch (e) { /* music optional */ } };
  const tempo = k => { try { if (PX.Music && PX.Music.tempo) PX.Music.tempo(k); } catch (e) { /* optional */ } };
  const jingle = id => { try { if (PX.Music && PX.Music.jingle) { PX.Music.jingle(id); return true; } } catch (e) { /* optional */ } return false; };
  const hubMusic = () => { try { if (PS.ui.music) { PS.ui.music(); return; } } catch (e) { /* optional */ } music('arcade'); };
  const cry = (k, o) => { try { if (PX.Cry && PX.Cry.play) PX.Cry.play(k, o || {}); } catch (e) { /* optional */ } };
  const buzz = ms => { try { if (PX.buzz) PX.buzz(ms); } catch (e) { /* optional */ } };
  const save = () => { try { PS.save(); } catch (e) { /* optional */ } };
  const toast = (m, ms) => { try { PS.ui.toast(m, ms); } catch (e) { /* optional */ } };
  const unlockAudio = () => { try { PX.Sound.unlock(); } catch (e) { /* optional */ } };
  // the shell's big celebration (or a plain pop-up while the shell doesn't have one)
  function celebrate(o) {
    try { if (PS.ui.celebrate) { const p = PS.ui.celebrate(o); return p && p.then ? p : Promise.resolve(); } } catch (e) { console.error('arcade celebrate', e); }
    try { PS.ui.modal({ eyebrow: o.eyebrow || '', title: esc(o.title || ''), html: o.sub ? `<p>${esc(o.sub)}</p>` : '', sprite: o.icon || null, buttons: [{ label: o.button || 'OK', kind: 'go' }] }); } catch (e) { /* optional */ }
    return Promise.resolve();
  }

  // ---------------- the games ----------------
  // stars: score for 1 / 2 / 3 stars (tuned with the kid bots: 2 stars = a 5-year-old trying). after: the game whose Level 1 opens it.
  const GAMES = [
    { id: 'fruit', name: 'Fruit Catch', short: 'Fruit', track: 'arcade', col: '#f08a4a', c2: '#ffb27a', dk: '#b4532a', sec: 60, hearts: 3, stars: [700, 1400, 2400], countIn: true,
      how: 'Drag to catch the fruit!', blurb: 'Catch fruit, dodge acorns!' },
    { id: 'pairs', name: 'Sprout Pairs', short: 'Pairs', track: 'arcade', col: '#4fae6a', c2: '#7fd08e', dk: '#2b7a44', sec: 90, stars: [300, 600, 1000],
      how: 'Find two the same!', blurb: 'Flip cards, find pairs!' },
    { id: 'hop', name: 'Star Hop', short: 'Hop', track: 'race', col: '#7466d8', c2: '#9e92ee', dk: '#3e3494', sec: 60, stars: [1200, 2000, 2800], after: 'pairs', multi: true,
      how: 'Tap to hop! Get the stars!', blurb: 'Hop the lily pads!' },
    { id: 'bubble', name: 'Bubble Pop', short: 'Bubbles', track: 'arcade', col: '#3fa8d8', c2: '#7fcaf0', dk: '#1f6a94', sec: 60, hearts: 3, stars: [450, 880, 1100], after: 'hop', multi: true,
      how: 'Pop bubbles! Not the rain clouds!', blurb: 'Pop bubbles, free friends!' },
    { id: 'egg', name: 'Egg Roll', short: 'Egg Roll', track: 'race', col: '#e8a83a', c2: '#ffd27a', dk: '#a06a14', sec: 60, hearts: 3, stars: [800, 1900, 3300], after: 'bubble', countIn: true,
      how: 'Drag to roll through the gates!', blurb: 'Roll through the gates!' },
  ];
  // Levels 2 and 3 (Level 1 = the game above): sub (the level's name), stars, how, and knobs the game reads.
  const LV = {
    fruit: [null, { sub: 'Windy Orchard', stars: [700, 1500, 2450], wind: 1, fall: 1.1, how: 'The wind blows the fruit!' },
      { sub: 'Night Orchard', stars: [700, 1450, 2450], wind: 0.6, fall: 1.18, two: true, night: true, how: 'Two squirrels! Watch out!' }],
    pairs: [null, { sub: 'Sneaky Foxes', stars: [300, 600, 1050], peek: 0.9, how: 'A fox card mixes up cards!' },
      { sub: 'Giant Picnic', stars: [280, 560, 1000], sec: 100, peek: 1, how: 'So many cards!' }],
    hop: [null, { sub: 'Leaf Steps', stars: [1400, 2400, 3400], speed: 1.1, leaves: true, how: 'Hop up on the big leaves!' },
      { sub: 'Shooting Stars', stars: [1600, 2900, 4000], speed: 1.18, leaves: true, sink: true, shoot: true, how: 'Some pads sink. Keep hopping!' }],
    bubble: [null, { sub: 'Colour Call', stars: [500, 1050, 1350], call: true, rate: 1.1, how: 'Pop the colour the frog shows!' },
      { sub: 'Big Bubbles', stars: [450, 950, 1500], big: true, rate: 1.15, storm: 1.4, how: 'Big bubbles need two taps!' }],
    egg: [null, { sub: 'Swinging Gates', stars: [700, 1300, 2500], swing: true, speed: 1.08, how: 'The gates move!' },
      { sub: 'Moonlit Hill', stars: [650, 1150, 2200], swing: true, speed: 1.15, night: true, narrow: true, how: 'Watch out for puddles!' }],
  };
  // the first 3 stars on each level: a hat (or another hat / paints if it's owned), 2 paints or 2 stickers, a rare egg
  const PRIZES = {
    fruit: [{ t: 'hat', id: 'sunhat' }, { t: 'paint', id: 'tangerine' }, { t: 'egg', id: 'golden' }],
    pairs: [{ t: 'hat', id: 'party' }, { t: 'pattern', id: 'heart' }, { t: 'egg', id: 'blossom' }],
    hop: [{ t: 'hat', id: 'star' }, { t: 'paint', id: 'periwinkle' }, { t: 'egg', id: 'starry' }],
    bubble: [{ t: 'hat', id: 'headphones' }, { t: 'pattern', id: 'spots' }, { t: 'egg', id: 'pearl' }],
    egg: [{ t: 'hat', id: 'propeller' }, { t: 'paint', id: 'sun' }, { t: 'egg', id: 'rainbow' }],
  };
  const LEVELS = 3;
  const GBY = {}; GAMES.forEach(g => { GBY[g.id] = g; });
  function defOf(id, lv) { const b = GBY[id]; lv = clamp(lv | 0 || 1, 1, LEVELS); const o = lv > 1 && LV[id] && LV[id][lv - 1]; return Object.assign({}, b, o || {}, { lv, base: b }); }
  const BLANK = { best: 0, stars: 0, plays: 0 };
  const recKey = (id, lv) => ((lv | 0) > 1 ? id + '_' + (lv | 0) : id);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function arc() { let A = PS.S.arcade; if (!isObj(A)) A = PS.S.arcade = {}; return A; }
  const rec = (id, lv) => { const A = PS.S && PS.S.arcade, r = isObj(A) ? A[recKey(id, lv)] : null; return isObj(r) ? r : BLANK; };
  function recW(id, lv) {
    const A = arc(), key = recKey(id, lv);
    let r = A[key]; if (!isObj(r)) r = A[key] = { best: 0, stars: 0, plays: 0 };
    r.best = Math.max(0, +r.best || 0); r.stars = clamp(Math.floor(+r.stars || 0), 0, 3); r.plays = Math.max(0, Math.floor(+r.plays || 0));
    return r;
  }
  const tokens = () => { const A = PS.S && PS.S.arcade; return isObj(A) && +A.tokens > 0 ? Math.floor(+A.tokens) : 0; };
  function addTokens(n) { const A = arc(); A.tokens = Math.max(0, Math.floor(+A.tokens || 0) + (n | 0)); return A.tokens; }
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  // ---------------- sprites (made once, cached under fixed keys; missing art never crashes a game) ----------------
  // Every PX canvas is hi-res (c.k fine px per art px): sizes, anchors and hitboxes are in ART px (PX.artW / artH), draws are
  // always 5-argument. SPR holds the one-off sprites (bounded, oldest out first); the per-frame lookups below go through small
  // two-level maps keyed by constant strings, so drawing a frame builds no key strings.
  const SPR = new Map();
  function sprC(key, make) {
    if (SPR.has(key)) return SPR.get(key);
    let c = null; try { c = make(); } catch (e) { console.error('arcade art', key, e); }
    if (c && !c.width) c = null;
    if (SPR.size > 400) SPR.delete(SPR.keys().next().value);
    SPR.set(key, c); return c;
  }
  const LUT = new Map(); let lutN = 0;
  function lut(kind, id, make) {
    let m = LUT.get(kind); if (!m) LUT.set(kind, (m = new Map()));
    if (m.has(id)) return m.get(id);
    let c = null; try { c = make(); } catch (e) { console.error('arcade art', kind, id, e); }
    if (c && !c.width) c = null;
    if (++lutN > 600) { LUT.clear(); lutN = 0; } // (content-bounded in practice: a safety cap only)
    m.set(id, c); return c;
  }
  const art = (k, a) => lut(k, a, () => (PX.arcade && PX.arcade[k] ? PX.arcade[k](a) : null));
  const bigBubble = i => lut('bubbleB', i, () => (PX.arcade && PX.arcade.bubble ? PX.arcade.bubble(i, true) : null));
  const critter = id => lut('cr', id, () => PX.critter(id));
  const skyArt = (kind, v) => lut('sky' + kind, v | 0, () => (PX.arcade && PX.arcade.sky ? PX.arcade.sky(kind, v | 0) : null)); // (background painting only)
  const fruitIc = id => lut('fr', id, () => PX.item('fruit', id));
  const eggIc = id => lut('egg', id, () => PX.item('egg', id));
  const coinIc = () => lut('coin', 0, () => PX.item('coin'));
  const POSES = { idle: {}, blink: { eyes: 'blink' }, happy: { eyes: 'happy', mouth: 'open', arms: 'up' }, sad: { eyes: 'sad', mouth: 'o' }, walk0: { walk: true, frame: 0 }, walk1: { walk: true, frame: 1 },
    hold: { arms: 'hold' }, holdHappy: { arms: 'hold', eyes: 'happy', mouth: 'open' }, holdBlink: { arms: 'hold', eyes: 'blink' }, jump: { arms: 'up', mouth: 'open' }, fall: { arms: 'out', mouth: 'o' } };
  function heroLook() { try { const s = ST.active(); if (s) return ST.lookOf(s); } catch (e) { /* default */ } return PX.cloneLook(PX.DEFAULT_LOOK); }
  function makeHero() { const L = heroLook(), h = {}; for (const k in POSES) { try { h[k] = PX.sprig(L, POSES[k]); } catch (e) { h[k] = null; } } return h; }
  const bodyLook = (body, skin) => { const L = PX.cloneLook(PX.DEFAULT_LOOK); L.body = body; if (skin) L.skin = skin; return L; };
  const lookSpr = (key, look, pose) => sprC('lk:' + key + ':' + pose, () => PX.sprig(look, POSES[pose] || {}));
  const aw = c => (c ? (PX.artW ? PX.artW(c) : c.width) : 0), ah = c => (c ? (PX.artH ? PX.artH(c) : c.height) : 0);
  const keepK = (src, out) => (PX.keepK ? PX.keepK(src, out) : (src && src.k && (out.k = src.k), out));
  const SK = PX.SCENE_K || 2;

  // ---------------- scene state ----------------
  let root = null, hubEl = null, playEl = null, cv = null, ctx = null, hudEl = null, resEl = null, quitEl = null, pauseEl = null, modalRoot = null;
  let visible = false, G = null, W = 0, H = 0, DPR = 1, sizeKey = '', sizeT = 0, bgC = null, bgKey = '', errRun = 0, uiT = 0, ptrId = null;
  // The scale (CSS px per art px) lands every FINE pixel (1 / SK art px) on a whole number of device pixels: one crisp level of
  // detail for the Sprouts, the arcade art and the background (d = the fine px per art px the scale is snapped for).
  const snapZ = (z, d) => { d = d || SK; return Math.max(1, Math.ceil(z * DPR / d - 0.5)) * d / DPR; };
  // a sprite's draw scale snapped the same way (k = the sprite's fine px per art px)
  const snapS = (s, k) => { k = k || SK; return Math.max(1, Math.round(s * DPR / k)) * k / DPR; };
  const dprNow = () => Math.min(3, window.devicePixelRatio || 1);

  // ---------------- drawing helpers (CSS px; the canvas transform is the device-pixel ratio) ----------------
  function blit(c, x, y, s, ax, ay, flip) {
    if (!c) return;
    const w = aw(c) * s, h = ah(c) * s, X = x - (ax == null ? aw(c) / 2 : ax) * s, Y = y - (ay == null ? ah(c) : ay) * s;
    if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(c, -(w - (x - X)), Y, w, h); ctx.restore(); }
    else ctx.drawImage(c, X, Y, w, h);
  }
  function blitR(c, x, y, s, ax, ay, rot, sx, sy, alpha, flip) {
    if (!c) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale((flip ? -1 : 1) * (sx || 1), sy || 1); if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(c, -(ax == null ? aw(c) / 2 : ax) * s, -(ay == null ? ah(c) : ay) * s, aw(c) * s, ah(c) * s); ctx.restore();
  }
  // a soft ground shadow in the game's fine pixels (rows of whole fine px, no anti-aliased edge; no strings made per frame)
  function shadow(x, y, w, a) {
    const fp = G ? G.fpx : 1, rx = w / 2, ry = Math.max(2, w * 0.14), j0 = Math.floor((y - ry) / fp), j1 = Math.ceil((y + ry) / fp);
    ctx.globalAlpha = a || 0.22; ctx.fillStyle = '#28321e';
    for (let j = j0; j < j1; j++) { const yc = (j + 0.5) * fp - y, q = 1 - (yc * yc) / (ry * ry); if (q <= 0) continue; const hw = rx * Math.sqrt(q), a0 = Math.round((x - hw) / fp) * fp, b0 = Math.round((x + hw) / fp) * fp; if (b0 > a0) ctx.fillRect(a0, j * fp, b0 - a0, fp); }
    ctx.globalAlpha = 1;
  }
  const FONTS = new Map(); // (font strings by size, made once)
  const fontPx = size => { let f = FONTS.get(size); if (!f) { f = `700 ${size}px ${F_PX}`; if (FONTS.size > 120) FONTS.clear(); FONTS.set(size, f); } return f; };
  const F_NOTE = `600 17px ${F_UI}`, F_SMALL = `600 14px ${F_UI}`, F_SHELF = `600 15px ${F_UI}`, F_BADGE = `700 13px ${F_UI}`, F_STAMP = `700 60px ${F_PX}`;
  function bigText(text, x, y, size, col, al) {
    ctx.font = fontPx(size); ctx.textAlign = al || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.18); ctx.strokeStyle = TXT; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const NOTE_W = new Map();
  function note(text, x, y) { // a plain sentence on a cream label (for young readers)
    ctx.font = F_NOTE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let w = NOTE_W.get(text); if (w == null) { w = Math.ceil(ctx.measureText(text).width) + 28; if (NOTE_W.size > 60) NOTE_W.clear(); NOTE_W.set(text, w); }
    x = clamp(x, w / 2 + 6, W - w / 2 - 6);
    rr(x - w / 2, y - 18, w, 36, 14); ctx.fillStyle = 'rgba(255,248,230,.96)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#cdb57e'; ctx.stroke();
    ctx.fillStyle = '#5b4630'; ctx.fillText(text, x, y + 1);
  }
  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const hsh = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul((s | 0) + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ---------------- background painting (art rule #1: the same fine pixels as the Sprouts) ----------------
  // Backgrounds are painted once per layout into a buffer of SCENE_K (Pairs: 3) buffer px per art px, then drawn at a whole number of
  // device px per buffer px. Painters work in art px with u = one fine pixel: soft gradients and bands, 1-fine-px grass blades,
  // flowers, stars and rims; no art-pixel dither or checker, no hard 1-art-px lines on terrain.
  const fr = (v, u) => Math.round(v / u) * u; // (snap to the fine grid)
  function fdisc(x, cx, cy, rx, ry, col, u) { // a disc / ellipse in rows of fine pixels
    x.fillStyle = col; const j0 = Math.floor((cy - ry) / u), j1 = Math.ceil((cy + ry) / u);
    for (let j = j0; j < j1; j++) { const yc = (j + 0.5) * u - cy, q = 1 - (yc * yc) / (ry * ry); if (q <= 0) continue; const hw = rx * Math.sqrt(q), a = fr(cx - hw, u), b = fr(cx + hw, u); if (b > a) x.fillRect(a, j * u, b - a, u); }
  }
  function vgrad(x, x0, y0, w, h, cols) { const gr = x.createLinearGradient(0, y0, 0, y0 + h); cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c)); x.fillStyle = gr; x.fillRect(x0, y0, w, h); }
  // a hill line in fine columns, with a 1-fine lighter rim along its top
  function ridge(x, w, base, top, col, rim, u) { for (let i = 0; i < w; i += u) { const t = fr(top(i), u); x.fillStyle = col; x.fillRect(i, t, u, base - t); if (rim) { x.fillStyle = rim; x.fillRect(i, t, u, u); } } }
  // fine grass: little blades (1 fine px wide) in two greens, and a few tiny flowers
  function tufts(x, x0, y0, w, h, cols, seed, n, u, flowers) {
    for (let i = 0; i < n; i++) {
      const px = fr(x0 + hsh(i, seed) * w, u), py = fr(y0 + hsh(i, seed + 1) * h, u);
      if (flowers && hsh(i, seed + 2) < 0.14) { x.fillStyle = flowers[i % flowers.length]; x.fillRect(px - u, py, u, u); x.fillRect(px + u, py, u, u); x.fillRect(px, py - u, u, u); x.fillRect(px, py + u, u, u); x.fillStyle = '#fff27a'; x.fillRect(px, py, u, u); continue; }
      x.fillStyle = cols[0]; x.fillRect(px, py - 2 * u, u, 2 * u); x.fillRect(px + 2 * u, py - 2 * u, u, 2 * u);
      x.fillStyle = cols[1]; x.fillRect(px + u, py - 3 * u, u, 3 * u);
    }
  }
  function nightSky(x, w, h, seed, u) {
    for (let i = 0; i < 110; i++) {
      const sx = fr(hsh(i, seed) * w, u), sy = fr(hsh(i, seed + 1) * h, u);
      x.fillStyle = hsh(i, seed + 2) < 0.55 ? 'rgba(255,246,200,.55)' : '#fff6c8'; x.fillRect(sx, sy, u, u);
      if (i % 12 === 0) { x.fillStyle = 'rgba(255,246,200,.45)'; x.fillRect(sx - u, sy, u, u); x.fillRect(sx + u, sy, u, u); x.fillRect(sx, sy - u, u, u); x.fillRect(sx, sy + u, u, u); }
    }
  }
  // a hi-res sprite into a background buffer (middle anchor; scale 1 = one sprite fine px per buffer px on a SCENE_K buffer)
  function bgPut(x, c, cx, cy, u, s) { if (!c) return; s = s || 1; const w = aw(c) * s, h = ah(c) * s; x.drawImage(c, fr(cx - w / 2, u), fr(cy - h / 2, u), w, h); }
  // a rounded rectangle in rows of fine pixels (u = one buffer px in the painter's units)
  function rrect(x, X, Y, w, h, r, col, u) {
    x.fillStyle = col; X = fr(X, u); Y = fr(Y, u); w = fr(w, u); h = fr(h, u); r = Math.min(r, w / 2, h / 2);
    const top = fr(r, u); x.fillRect(X, Y + top, w, h - 2 * top);
    for (let y = 0; y < top; y += u) { const dy = r - (y + u / 2), ins = fr(r - Math.sqrt(Math.max(0, r * r - dy * dy)), u); x.fillRect(X + ins, Y + y, w - 2 * ins, u); x.fillRect(X + ins, Y + h - y - u, w - 2 * ins, u); }
  }
  // a framed box: a 2-fine ink ring (the sprites' outline weight), then the fill
  function rbox(x, X, Y, w, h, r, fill, u, edge) { rrect(x, X, Y, w, h, r, edge || INK, u); rrect(x, X + 2 * u, Y + 2 * u, w - 4 * u, h - 4 * u, Math.max(0, r - 2 * u), fill, u); }
  function strip(w, h, k, paint) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k)); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.setTransform(k, 0, 0, k, 0, 0); paint(x, w, h, 1 / k); c.k = k; return c; }

  // ---------------- particles + floating words (dead ones are dropped in place) ----------------
  function part(g, c, x, y, vx, vy, life, s, o) {
    if (!c || g.parts.length > 90) return;
    g.parts.push({ c, x, y, vx, vy, gr: o && o.gr != null ? o.gr : 900, life, life0: life, s, rot: 0, vr: o && o.vr != null ? o.vr : rand(-8, 8) });
  }
  function floatText(g, text, x, y, col, size) { if (g.floats.length > 12) g.floats.shift(); g.floats.push({ text, x, y, col: col || '#fff27a', size: size || 28, t: 0 }); }
  function stepFx(g, dt) {
    let n = 0;
    for (const p of g.parts) { p.life -= dt; p.vy += p.gr * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.life > 0) g.parts[n++] = p; }
    g.parts.length = n; n = 0;
    for (const f of g.floats) { f.t += dt; if (f.t < 1.0) g.floats[n++] = f; }
    g.floats.length = n;
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
  }
  function drawFx(g) {
    for (const p of g.parts) blitR(p.c, p.x, p.y, p.s, null, ah(p.c) / 2, p.rot, 1, 1, Math.min(1, p.life / Math.min(0.3, p.life0)));
    for (const f of g.floats) { ctx.globalAlpha = f.t > 0.7 ? (1 - f.t) / 0.3 : 1; bigText(f.text, clamp(f.x, 60, W - 60), f.y - f.t * 34, f.size, f.col); ctx.globalAlpha = 1; }
  }
  function sparks(g, x, y, n, col) {
    const s = sprC('spark:' + col, () => PX.fx('bigspark', col));
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + rand(-0.2, 0.2), v = rand(120, 260); part(g, s, x, y, Math.cos(a) * v, Math.sin(a) * v - 60, rand(0.35, 0.6), g.S, { gr: 300 }); }
  }
  function drops(g, x, y, n, col) {
    const s = sprC('drop:' + col, () => PX.fx('drop', col));
    for (let i = 0; i < n; i++) part(g, s, x + rand(-10, 10), y, rand(-140, 140), rand(-320, -160), rand(0.4, 0.7), g.S, { gr: 1100, vr: 0 });
  }
  function banner(text) { try { if (PS.ui.fx && PS.ui.fx.banner) PS.ui.fx.banner(text, { tone: 'info', ms: 900 }); else if (G) floatText(G, text, W / 2, H * 0.35, '#ffcc44', 36); } catch (e) { /* optional */ } }

  // =====================================================================
  // Fruit Catch
  // =====================================================================
  // The Sprout walks along the grass behind a woven basket (touch and drag anywhere). Fruit hangs from the trees for a moment (it
  // wiggles), then falls: catch it in the basket. Golden Fruit is worth lots. A squirrel on the branch wanders over, wiggles and shows
  // "!", then drops an acorn or a pinecone (a shadow shows where): it costs a heart. Catches in a row make a combo (x2 from 5, x3 from
  // 10); fruit that lands on the grass ends the combo. Two fruit showers sweep across the trees.
  const FALL_FRUIT = ['apple', 'apple', 'apple', 'sunpear', 'moonplum', 'swiftberry', 'wingseed', 'powernut', 'seakelp', 'heartyroot'];
  const isNut = k => k === 'acorn' || k === 'pinecone';
  function otherWinding(list, S) { for (const o of list) if (o !== S && o.windT > 0) return true; return false; }
  const FRUIT = {
    init(g) {
      g.items = []; g.px = -1; g.tx = -1; g.lean = 0; g.spawnT = 0.6; g.lastX = -1; g.combo = 0; g.bestCombo = 0; g.caught = 0; g.walk = 0;
      g.hearts = g.maxHearts = g.def.hearts || 3; g.happyT = 0; g.sadT = 0; g.showers = 0; g.showerN = 0; g.showerDir = 1; g.pile = [];
      g.sq = [{ x: 0.3, dir: 1, windT: 0, backT: 0, hazT: 3, ph: 0, join: 0 }];
      if (g.def.two) g.sq.push({ x: 0.72, dir: -1, windT: 0, backT: 0, hazT: 5, ph: 2.6, join: 6 });
    },
    layout(g) {
      const top = hudBottom() + 2;
      g.Z = snapZ(clamp(Math.min(W / 170, H / 250), 1.5, 3.5));
      const Z = g.Z; g.S = Z; g.fpx = Z / SK;
      g.groundY = H - Math.max(14, 7 * Z);
      g.canopyY = top + 24 * Z;
      g.sqY = g.canopyY + 3 * Z;          // the squirrels' feet, on the branch
      g.catchY = g.groundY - 14 * Z;       // the basket's rim
      g.feetY = g.catchY + 6 * Z;          // the Sprout stands in its basket (the rim just under its smile)
      g.reach = 14 * Z;
      const m = 15 * Z;
      if (g.px < 0) g.px = g.tx = W / 2;
      g.px = clamp(g.px, m, W - m); g.tx = clamp(g.tx, m, W - m);
    },
    bg(g, x, u) {
      const Z = g.Z, w = Math.ceil(W / Z), h = Math.ceil(H / Z), gy = Math.round(g.groundY / Z), cy = Math.round(g.canopyY / Z), night = !!g.def.night;
      vgrad(x, 0, 0, w, gy, night ? ['#241f46', '#2e2856', '#3c356a', '#514882'] : ['#a8dcf4', '#c2e6f4', '#def2ee', '#eaf6e6']);
      if (night) { nightSky(x, w, gy - 20, 3, u); bgPut(x, skyArt('moon'), w * 0.8, cy + 16, u); }
      else { bgPut(x, skyArt('sun'), w * 0.82, cy + 16, u); for (let i = 0; i < 3; i++) bgPut(x, skyArt('cloud', i), ((i * 0.37 + 0.15) % 1) * w, cy + 24 + i * 9, u); }
      // far hills, then the lawn: a soft lighter band, a 1-fine darker edge, fine grass blades and flowers
      ridge(x, w, gy - 11, i => gy - 12 - (9 + Math.sin(i * 0.05) * 4 + Math.sin(i * 0.13) * 2), night ? '#2f4a52' : '#b6e0a0', night ? '#3a5862' : '#c6eab2', u);
      const LW = night ? ['#4a7e58', '#548a62', '#3c6a4a', '#5e9a6c'] : ['#bfe3b4', '#cdeec3', '#a6d69a', '#e0f6d6'];
      x.fillStyle = LW[0]; x.fillRect(0, gy - 12, w, h - gy + 12); x.fillStyle = LW[1]; x.fillRect(0, gy - 12 + u, w, 2); x.fillStyle = LW[2]; x.fillRect(0, gy - 12, w, u);
      tufts(x, 0, gy - 9, w, h - gy + 9, [LW[2], LW[3]], 7, Math.floor(w * (h - gy + 12) / 12), u, night ? null : ['#ffffff', '#f7b6c8', '#c8d8ff']);
      // two tree trunks at the sides (fine bark lines, a 1-fine dark edge, a flared foot) and a branch for the squirrels
      for (const tx of [3, w - 10]) {
        const top = cy - 6, hgt = gy - cy - 4;
        fdisc(x, tx + 3.5, top + hgt, 5.2, 1.6, '#663931', u); fdisc(x, tx + 3.5, top + hgt - u, 4.6, 1.2, '#8f563b', u);
        x.fillStyle = '#8f563b'; x.fillRect(tx, top, 7, hgt); x.fillStyle = '#b47a44'; x.fillRect(tx + u, top, 1.5, hgt);
        x.fillStyle = '#663931'; x.fillRect(tx + 6, top, 1 - u, hgt); x.fillStyle = '#5c3a28'; x.fillRect(tx, top, u, hgt); x.fillRect(tx + 7 - u, top, u, hgt);
        x.fillStyle = '#7a4a32'; for (let j = 0; j < 12; j++) x.fillRect(fr(tx + 1.8 + hsh(j, tx) * 3.6, u), fr(top + 4 + hsh(j, tx + 1) * (hgt - 8), u), u, fr(1.5 + hsh(j, tx + 2) * 2.5, u));
      }
      x.fillStyle = '#8f563b'; x.fillRect(0, cy + 1, w, 2); x.fillStyle = '#b47a44'; x.fillRect(0, cy + 1, w, u); x.fillStyle = '#663931'; x.fillRect(0, cy + 3 - u, w, u);
      // the leaves across the top: soft scallops with a 1-fine dark rim, little lit leaves and round fruit
      const L = night ? ['#1f5452', '#2f8078', '#52c7a8', '#163c3c'] : ['#37946e', '#6abe30', '#99e550', '#2a7458'];
      x.fillStyle = L[1]; x.fillRect(0, 0, w, cy - 3);
      for (let i = -4; i < w + 8; i += 7) fdisc(x, i, cy - 3 - (i * 7 % 3), 5.5 + u, 5.5 + u, L[3], u);
      for (let i = -4; i < w + 8; i += 7) fdisc(x, i, cy - 3 - (i * 7 % 3), 5.5, 5.5, L[0], u);
      for (let i = 0; i < w + 8; i += 9) fdisc(x, i + 3, cy - 8 - (i % 4), 5, 5, L[1], u);
      for (let i = 0; i < w; i += 11) fdisc(x, i + 5, cy - 13 - (i % 5), 3.5, 3.5, L[2], u);
      for (let i = 0; i < Math.floor(w * cy / 20); i++) { const lx = fr(hsh(i, 15) * w, u), ly = fr(hsh(i, 16) * (cy - 6), u); x.fillStyle = L[2]; x.fillRect(lx, ly, 2 * u, u); x.fillStyle = L[0]; x.fillRect(lx + u, ly + u, 2 * u, u); }
      const FR = [['#d95763', '#a02a3a'], ['#fbe36a', '#c7a020'], ['#a46ad8', '#6a3a9a'], ['#df7126', '#a04a10']];
      for (let i = 0; i < Math.floor(w / 6); i++) { const fx = fr(hsh(i, 9) * w, u), fy = fr(4 + hsh(i, 10) * Math.max(4, cy - 12), u), C = FR[i % 4]; fdisc(x, fx + u / 2, fy + u / 2, 1.6, 1.6, C[1], u); fdisc(x, fx, fy, 1.45, 1.45, C[0], u); x.fillStyle = '#ffffff'; x.fillRect(fx - u, fy - u, u, u); }
    },
    update(g, dt) {
      const p = clamp(g.t / g.def.sec, 0, 1), Z = g.Z, fall = g.def.fall || 1;
      const mv = g.st === 'count' ? 1 / 60 : dt, prev = g.px; g.px += (g.tx - g.px) * Math.min(1, mv * 14);
      g.lean = mv > 0 ? clamp((g.px - prev) / mv / 1600, -0.2, 0.2) : 0; g.walk += Math.abs(g.px - prev);
      if (g.happyT > 0) g.happyT -= dt; if (g.sadT > 0) g.sadT -= dt;
      if (g.st === 'play') {
        for (const S of g.sq) {
          if (S.join && g.t < S.join) continue;
          if (S.windT > 0) {
            if ((S.windT -= dt) <= 0) {
              S.windT = 0;
              g.items.push({ kind: Math.random() < 0.5 ? 'acorn' : 'pinecone', x: S.x * W, y: g.sqY - 6 * Z, vy: (g.catchY - g.sqY) / (lerp(2.3, 1.6, p) / fall), t: 0, rot: 0, st: 0, vx: 0, ph: 0, hang: 0 });
              S.backT = 1.0; S.hazT = lerp(5.2, 2.9, p) * rand(0.85, 1.2) * (g.sq.length > 1 ? 1.4 : 1); snd('whoosh');
            }
          } else {
            const want = clamp(g.px / W + Math.sin(g.t * 0.9 + S.ph) * 0.2, 0.1, 0.9);
            S.dir = want > S.x + 0.02 ? 1 : want < S.x - 0.02 ? -1 : S.dir;
            if (Math.abs(want - S.x) > 0.02) S.x = clamp(S.x + S.dir * dt * (0.07 + 0.08 * p), 0.08, 0.92);
            if (S.backT > 0) S.backT -= dt;
            if (g.t > 4 && S.backT <= 0 && (S.hazT -= dt) <= 0 && !otherWinding(g.sq, S)) { S.windT = 0.8; snd('tick'); }
          }
        }
        if (g.showers < 2 && g.t > 20 + g.showers * 20) { g.showers++; g.showerN = 7; g.showerDir = g.px < W / 2 ? 1 : -1; g.spawnT = 0.6; banner('Fruit shower!'); snd('cheer'); }
        if ((g.spawnT -= dt) <= 0) {
          const shower = g.showerN > 0, m = 18 * Z;
          let x;
          if (shower) { g.showerN--; x = g.lastX + g.showerDir * Math.min(W * 0.11, 90); if (x < m || x > W - m) { g.showerDir *= -1; x = g.lastX + g.showerDir * Math.min(W * 0.11, 90); } g.spawnT = 0.32; }
          else { x = g.lastX < 0 ? W / 2 : g.lastX + rand(-0.4, 0.4) * Math.min(W, 640); g.spawnT = lerp(0.95, 0.6, p) * rand(0.85, 1.2); }
          x = clamp(x, m, W - m); g.lastX = x;
          const gold = !shower && Math.random() < (g.lv > 1 ? 0.06 : 0.04), kind = gold ? 'goldfruit' : pick(FALL_FRUIT);
          g.items.push({ kind, x, y: g.canopyY - 2 * Z, vy: (g.catchY - g.canopyY) / (lerp(2.5, 1.75, p) * (gold ? 0.85 : 1) / fall), t: 0, rot: 0, st: -1, vx: 0, ph: Math.random() * 6, hang: shower ? 0.15 : 0.4 });
        }
      }
      let n = 0;
      for (const it of g.items) {
        it.t += dt;
        if (it.st === -1) { if (it.t >= it.hang) { it.st = 0; it.t = 0; } }
        else if (it.st === 0) {
          it.y += it.vy * dt; it.rot += dt * (isNut(it.kind) ? 5 : 1);
          if (g.def.wind && !isNut(it.kind)) it.x = clamp(it.x + Math.sin(it.t * 1.7 + it.ph) * g.def.wind * 46 * dt, 12 * Z, W - 12 * Z);
          const r = 6 * Z, haz = isNut(it.kind);
          if (g.st === 'play' && it.y >= g.catchY - r && it.y <= g.catchY + 10 * Z && Math.abs(it.x - g.px) < (haz ? g.reach * 0.6 + r * 0.3 : g.reach + r * 0.7) && !(haz && g.sadT > 0)) FRUIT.grab(g, it);
          else if (it.y > g.groundY - 4 * Z) {
            it.st = 2; it.t = 0; it.y = g.groundY - 4 * Z;
            if (!haz) { if (g.st === 'play' && g.combo >= 3) floatText(g, 'Missed!', it.x, it.y - 30, '#e6f2ff', 20); if (g.st === 'play') g.combo = 0; snd('thud'); }
            else snd('bump', { pitch: 0.8 });
          }
        } else if (it.st === 3) { it.vy += 1500 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += dt * 9; }
        if (!(it.st === 1 && it.t > 0.3) && !(it.st === 2 && it.t > 0.8) && !(it.st === 3 && it.t > 1.0)) g.items[n++] = it;
      }
      g.items.length = n;
    },
    grab(g, it) {
      const Z = g.Z;
      if (isNut(it.kind)) { // bonk: it bounces off the Sprout
        it.st = 3; it.t = 0; it.vx = (it.x < g.px ? -1 : 1) * 260; it.vy = -520;
        g.hearts--; g.combo = 0; g.sadT = 1.3; g.shake = RM ? 0 : 0.3; snd('bump'); buzz(25);
        floatText(g, 'Ouch!', g.px, g.catchY - 40 * Z, '#ffb0b8', 30);
        if (g.hearts <= 0) endGame(g, 'out');
        return;
      }
      it.st = 1; it.t = 0;
      g.combo++; g.bestCombo = Math.max(g.bestCombo, g.combo); g.caught++;
      const mult = g.combo >= 10 ? 3 : g.combo >= 5 ? 2 : 1, pts = (it.kind === 'goldfruit' ? 50 : it.kind === 'apple' ? 10 : 15) * mult;
      g.score += pts; g.happyT = 0.35;
      if (g.pile.length >= 3) g.pile.shift(); g.pile.push(it.kind);
      snd(it.kind === 'goldfruit' ? 'twinkle' : 'coin', { pitch: 1 + 0.04 * Math.min(10, g.combo) });
      floatText(g, '+' + pts, it.x, g.catchY - 40 * Z, mult > 1 || it.kind === 'goldfruit' ? '#ffcc44' : '#fff27a', it.kind === 'goldfruit' ? 32 : 26);
      if (g.combo === 5 || g.combo === 10 || (g.combo > 10 && g.combo % 10 === 0)) {
        floatText(g, g.combo === 5 ? 'Combo x2!' : g.combo === 10 ? 'Combo x3!' : `${g.combo} in a row!`, W / 2, g.canopyY + 50, '#9fe8ff', 32);
        snd('cheer');
      }
      sparks(g, it.x, it.y, it.kind === 'goldfruit' ? 9 : 5, '#fff27a');
      g.hintDone = true;
    },
    down(g, x) { g.dragging = true; g.tx = clamp(x, 15 * g.Z, W - 15 * g.Z); },
    move(g, x) { if (g.dragging) g.tx = clamp(x, 15 * g.Z, W - 15 * g.Z); },
    up(g) { g.dragging = false; },
    draw(g) {
      const Z = g.Z, t = g.t, sq = critter('squirrel');
      for (const S of g.sq) {
        if (S.join && g.t < S.join) continue;
        const wind = S.windT > 0, sx = S.x * W + (wind && !RM ? Math.sin(t * 40) * 2 : 0), bob = wind || RM ? 0 : Math.abs(Math.sin(t * 6 + S.ph)) * -1.5 * Z;
        blitR(sq, sx, g.sqY + bob, Z, 9, 17, 0, 1, 1, 1, S.dir < 0);
        if (S.backT <= 0) blit(art('acorn', 's'), sx + (S.dir < 0 ? -5 : 5) * Z, g.sqY - 5 * Z + bob, Z, 4, 4.5);
        if (wind) bigText('!', sx + 10 * Z, g.sqY - 22 * Z, Math.round(20 + 5 * Z), '#ff6b7a');
      }
      for (const it of g.items) if (it.st === 0 && isNut(it.kind)) { const k = clamp((it.y - g.sqY) / (g.groundY - g.sqY), 0, 1); shadow(it.x, g.groundY - 3 * Z, (10 + 14 * k) * Z, 0.12 + 0.25 * k); }
      // the Sprout behind its basket (the last fruit it caught peeks out over the rim)
      const px = g.px, sad = g.sadT > 0, H2 = g.hero;
      const pose = sad ? 'sad' : g.happyT > 0 ? 'holdHappy' : Math.floor(t * 0.7) % 5 === 4 ? 'holdBlink' : 'hold';
      shadow(px, g.groundY, 30 * Z);
      const bob = RM ? 0 : Math.abs(Math.sin(g.walk / (9 * Z))) * -1.2 * Z;
      blitR(H2[pose] || H2.idle, px + (sad && !RM ? Math.sin(t * 40) * 2 : 0), g.feetY + bob, Z, 16, 31, g.lean * 0.6, 1, g.happyT > 0 && !RM ? 1.05 : 1, sad && !RM && Math.floor(t * 12) % 2 ? 0.5 : 1);
      for (let i = 0; i < g.pile.length; i++) blit(fruitIc(g.pile[i]), px + (i === 0 ? -7 : i === 1 ? 7 : 0) * Z, g.catchY + (i === 2 ? 9 : 8) * Z, Z, 6.5, 13);
      blitR(art('basket'), px, g.catchY, Z, 14, 0, g.lean * 0.25, 1, 1, 1);
      for (const it of g.items) {
        if (isNut(it.kind)) { blitR(art(it.kind), it.x, it.y, Z, 5.5, 6.5, it.rot, 1, 1, it.st === 2 ? 1 - it.t / 0.8 : 1); continue; }
        const s = Z, ic = fruitIc(it.kind);
        if (it.st === 1) { const k = clamp(it.t / 0.3, 0, 1); blitR(ic, lerp(it.x, px, k), lerp(it.y, g.catchY, k), s * (1 - k * 0.6), 6.5, 6.5, 0, 1, 1, 1 - k); continue; }
        if (it.kind === 'goldfruit' && it.st <= 0) blitR(art('glow', '#ffcc44'), it.x, it.y, Z, 12, 12, 0, 1, 1, 0.55 + 0.25 * Math.sin(t * 10));
        const wig = it.st === -1 && !RM ? Math.sin(it.t * 40) * 0.25 : Math.sin(it.t * 3 + it.ph) * 0.12;
        blitR(ic, it.x, it.y, s, 6.5, it.st === -1 ? 1 : 6.5, wig, 1, 1, it.st === 2 ? 1 - it.t / 0.8 : 1);
      }
      if (!g.hintDone && g.st === 'play' && g.t > 0.3) note(g.def.how, W / 2, (g.canopyY + g.catchY) / 2);
    },
    starsOf(g) { return starsByScore(g.def, g.score); },
    extra(g) { return g.bestCombo >= 3 ? `Fruit caught: <b>${g.caught}</b> &middot; best combo <b>${g.bestCombo}</b>` : `Fruit caught: <b>${g.caught}</b>`; },
  };

  // =====================================================================
  // Sprout Pairs
  // =====================================================================
  // Cards face down on a picnic blanket: flip two, find the same Sprout or egg twice. Board 1 is 12 cards (6 pairs); then 16-card boards
  // with two fox cards: flip one and the fox mixes two hidden cards (then scampers off). Level 3: 20 cards and 4 foxes. Every board shows
  // its cards for a moment first ("Look!"). Pairs in a row score more; a cleared board gives a bonus and deals the next one.
  // (only pictures that are easy to tell apart: no two pale eggs, no yellow body next to a gold skin, and so on)
  const PAIR_POOL = ['e:meadow', 'e:beach', 'e:moonlit', 'e:candy', 'e:golden', 'e:rainbow', 'e:dragon', 'e:pumpkin',
    's:mint', 's:rose', 's:sun', 's:sky', 's:plum', 's:tangerine', 's:cherry', 's:cocoa', 's:galaxy', 's:rainbow'];
  const pairOk = k => (k[0] === 'e' ? !!(D.EGGS && D.EGGS[k.slice(2)]) : !!(PX.RAMPS[k.slice(2)] || (D.SKINS && D.SKINS[k.slice(2)])));
  function cardPic(key, pose) {
    const k = key.slice(2);
    if (key[0] === 'e') return eggIc(k);
    const skin = D.SKINS && D.SKINS[k] && !PX.RAMPS[k];
    return lookSpr('pair:' + k, bodyLook(skin ? 'cloud' : k, skin ? k : null), pose);
  }
  const PAIRS = {
    init(g) { g.cards = []; g.boards = 0; g.found = 0; g.streak = 0; g.bestStreak = 0; g.open = []; g.waitT = 0; g.peekT = 0; g.nextT = 0; g.fq = null; g.cols = 0; },
    deal(g) {
      const big = g.boards >= 1 || g.lv >= 2, huge = g.lv >= 3, land = W > (H - hudBottom()) * 1.05;
      const cols = huge ? (land ? 5 : 4) : big ? 4 : land ? 4 : 3, rows = huge ? (land ? 4 : 5) : big ? 4 : land ? 3 : 4, nF = huge ? 4 : big ? 2 : 0, nP = (cols * rows - nF) / 2;
      const pool = shuffleArr(PAIR_POOL.filter(pairOk)), list = [];
      for (let i = 0; i < nP; i++) { const s = pool[i % pool.length]; list.push(s, s); }
      for (let i = 0; i < nF; i++) list.push('f:fox');
      shuffleArr(list);
      g.cols = cols; g.rows = rows; g.boards++;
      g.cards = list.map((s, i) => ({ k: s, fox: s === 'f:fox', slot: i, f: 1, face: true, done: 0, x: -1, y: -1, shake: 0, delay: i * 0.03, pic: null, picB: null, picH: null }));
      // the card pictures are built now (inside the transition for the first board), never while drawing
      for (const c of g.cards) if (!c.fox) { c.pic = cardPic(c.k, 'idle'); if (c.k[0] === 's') { c.picB = cardPic(c.k, 'blink'); c.picH = null; } }
      g.peekT = (g.boards === 1 ? 2.6 : 2.0) * (g.def.peek || 1) * (huge ? 1.15 : 1); g.open.length = 0; g.waitT = 0; g.fq = null;
      if (W) { PAIRS.layout(g); paintBg(); }
    },
    layout(g) {
      const top = hudBottom() + 46, avail = Math.max(160, H - top - 14);
      if (!g.cols) PAIRS.deal(g);
      const gap = Math.max(8, Math.min(14, W * 0.012));
      const cw = Math.min((W - 24 - gap * (g.cols - 1)) / g.cols, ((avail - gap * (g.rows - 1)) / g.rows) * 24 / 30, 170);
      // the cards (k 3 art) are drawn at Z and the Sprouts / eggs on them at 2/3 Z, so all share one fine pixel = Z / 3: whole
      // device px per fine px, and the next size up when it still fits
      const fits = z => z * 24 * g.cols + gap * (g.cols - 1) <= W - 12 && z * 30 * g.rows + gap * (g.rows - 1) <= avail && z * 24 <= 190;
      let n = Math.max(1, Math.floor(cw / 24 * DPR / 3)); if (fits((n + 1) * 3 / DPR)) n++;
      g.Z = n * 3 / DPR; g.S = g.Z * 2 / 3; g.fpx = g.Z / 3; g.BK = 3; g.cw = 24 * g.Z; g.chh = 30 * g.Z; g.gap = gap;
      g.gx = (W - (g.cw * g.cols + gap * (g.cols - 1))) / 2; g.gy = top + (avail - (g.chh * g.rows + gap * (g.rows - 1))) / 2;
    },
    slotX(g, s) { return g.gx + (s % g.cols) * (g.cw + g.gap) + g.cw / 2; },
    slotY(g, s) { return g.gy + Math.floor(s / g.cols) * (g.chh + g.gap) + g.chh / 2; },
    bg(g, x, u) {
      const Z = g.Z, w = Math.ceil(W / Z), h = Math.ceil(H / Z);
      // a soft lawn (big gentle light patches, fine blades and flowers) under a gingham picnic blanket with a stitched hem
      x.fillStyle = '#bfe3b4'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < Math.floor(w * h / 700); i++) fdisc(x, hsh(i, 23) * w, hsh(i, 24) * h, 6 + hsh(i, 25) * 8, 3 + hsh(i, 26) * 3, '#c6e8ba', u);
      tufts(x, 0, 0, w, h, ['#a6d69a', '#d8f2cc'], 21, Math.floor(w * h / 10), u, ['#ffffff', '#fff27a', '#f7b6c8']);
      const bx = fr(g.gx / Z - 6, u), by = fr(g.gy / Z - 6, u), bw = fr((g.cw * g.cols + g.gap * (g.cols - 1)) / Z + 12, u), bh = fr((g.chh * g.rows + g.gap * (g.rows - 1)) / Z + 12, u);
      x.fillStyle = 'rgba(40,70,20,.18)'; x.fillRect(bx + 1.5, by + 2.5, bw, bh);
      x.fillStyle = '#fff8e6'; x.fillRect(bx, by, bw, bh);
      x.fillStyle = 'rgba(154,106,208,.24)'; for (let i = 0; i < bw; i += 8) x.fillRect(bx + i, by, 4, bh); for (let j = 0; j < bh; j += 8) x.fillRect(bx, by + j, bw, 4);
      x.fillStyle = '#9a6ad0'; x.fillRect(bx, by, bw, u); x.fillRect(bx, by + bh - u, bw, u); x.fillRect(bx, by, u, bh); x.fillRect(bx + bw - u, by, u, bh);
      x.fillStyle = '#b896e8'; for (let i = 1.5; i < bw - 1.5; i += 1) { x.fillRect(bx + i, by + 1.2, 2 * u, u); x.fillRect(bx + i, by + bh - 1.2 - u, 2 * u, u); }
      for (let j = 1.5; j < bh - 1.5; j += 1) { x.fillRect(bx + 1.2, by + j, u, 2 * u); x.fillRect(bx + bw - 1.2 - u, by + j, u, 2 * u); }
    },
    update(g, dt) {
      const mdt = g.st === 'count' ? 1 / 60 : dt, k = 1 - Math.exp(-mdt * 12);
      let left = 0;
      for (const c of g.cards) {
        if (c.delay > 0 && mdt > 0) { c.delay -= mdt; continue; }
        const tx = PAIRS.slotX(g, c.slot), ty = PAIRS.slotY(g, c.slot);
        if (c.x < 0) { c.x = W / 2; c.y = H + g.chh; }
        c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
        const want = c.face ? 1 : 0; c.f += clamp(want - c.f, -mdt / 0.16, mdt / 0.16);
        if (c.shake > 0) c.shake -= mdt;
        if (c.done > 0) c.done += dt; else left++;
      }
      if (g.st !== 'play') return;
      if (g.peekT > 0 && (g.peekT -= dt) <= 0) { for (const c of g.cards) c.face = false; snd('select', { pitch: 0.9 }); }
      if (g.waitT > 0 && (g.waitT -= dt) <= 0) { for (const c of g.open) c.face = false; g.open.length = 0; }
      if (g.fq && (g.fq.t += dt) > 0.8) PAIRS.foxTrick(g);
      let n = 0, pairsLeft = 0; for (const c of g.cards) { if (!(c.done > 0.75)) g.cards[n++] = c; if (!c.done && !c.fox) pairsLeft++; } g.cards.length = n;
      if (!pairsLeft && left && !g.fq) for (const c of g.cards) if (!c.done && c.fox) { c.face = true; c.done = 0.001; sparks(g, PAIRS.slotX(g, c.slot), PAIRS.slotY(g, c.slot), 6, '#ffffff'); snd('whoosh'); }
      if (!left && !g.nextT && g.cards.length === 0) {
        g.nextT = 0.9; const bonus = 30 + 10 * Math.min(3, g.boards); g.score += bonus;
        floatText(g, `All done! +${bonus}`, W / 2, H * 0.42, '#ffcc44', 34); snd('cheer');
      }
      if (g.nextT > 0 && (g.nextT -= dt) <= 0) { g.nextT = 0; PAIRS.deal(g); }
    },
    foxTrick(g) {
      const fc = g.fq.card; g.fq = null;
      const pool = []; for (const c of g.cards) if (!c.done && !c.face && !c.fox) pool.push(c);
      if (pool.length >= 2) {
        const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0], b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0], s = a.slot;
        a.slot = b.slot; b.slot = s; a.shake = b.shake = 0.5; snd('whoosh');
        floatText(g, 'Mixed up!', W / 2, Math.max(hudBottom() + 30, g.gy - 14), '#ffd0a0', 28);
      }
      fc.done = 0.001; g.score += 5;
      sparks(g, PAIRS.slotX(g, fc.slot), PAIRS.slotY(g, fc.slot), 6, '#ffffff');
    },
    cardAt(g, x, y) {
      for (const c of g.cards) { if (c.done) continue; const cx = PAIRS.slotX(g, c.slot), cy = PAIRS.slotY(g, c.slot); if (Math.abs(x - cx) <= (g.cw + g.gap) / 2 && Math.abs(y - cy) <= (g.chh + g.gap) / 2) return c; }
      return null;
    },
    down(g, x, y) {
      if (g.st !== 'play' || g.peekT > 0 || g.nextT > 0 || g.fq) return;
      const hit = PAIRS.cardAt(g, x, y);
      if (!hit || hit.face) return;
      if (g.waitT > 0) { for (const c of g.open) c.face = false; g.open.length = 0; g.waitT = 0; }
      hit.face = true; snd('select', { pitch: 1.15 }); g.hintDone = true;
      if (hit.fox) {
        snd('bump', { pitch: 1.3 }); hit.shake = 0.8; g.fq = { card: hit, t: 0 }; g.streak = 0;
        for (const c of g.open) c.face = false; g.open.length = 0;
        floatText(g, 'A sneaky fox!', PAIRS.slotX(g, hit.slot), PAIRS.slotY(g, hit.slot) - g.chh * 0.6, '#ffb070', 24);
        return;
      }
      g.open.push(hit);
      if (g.open.length < 2) return;
      const a = g.open[0], b = g.open[1];
      if (a.k === b.k) {
        a.done = b.done = 0.001; g.open.length = 0;
        g.found++; g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak);
        const pts = 10 + Math.min(4, g.streak - 1) * 5; g.score += pts;
        const ax = PAIRS.slotX(g, a.slot), ay = PAIRS.slotY(g, a.slot), bx = PAIRS.slotX(g, b.slot), by = PAIRS.slotY(g, b.slot);
        floatText(g, '+' + pts, (ax + bx) / 2, (ay + by) / 2 - g.chh * 0.3, g.streak > 1 ? '#ffcc44' : '#ffffff', 30);
        sparks(g, ax, ay, 5, '#fff27a'); sparks(g, bx, by, 5, '#fff27a');
        snd('coin', { pitch: 1 + 0.08 * Math.min(5, g.streak - 1) });
        if (a.k[0] === 's') cry(a.k.slice(2), { pitch: 1.1 }); else snd('crack');
        if (g.streak >= 3) snd('cheer');
      } else { g.waitT = 0.9; g.streak = 0; a.shake = b.shake = 0.3; snd('back'); }
    },
    move() {}, up() {},
    draw(g) {
      const Z = g.Z, t = g.t;
      for (const c of g.cards) {
        if (c.delay > 0 || c.x < 0) continue;
        const sx = Math.max(0.02, Math.abs(Math.cos(c.f * Math.PI))), faceUp = c.f >= 0.5;
        const pop = c.done ? clamp(c.done / 0.3, 0, 1) : 0, sc = 1 + (RM ? 0 : 0.14 * Math.sin(pop * Math.PI)), al = c.done > 0.4 ? clamp(1 - (c.done - 0.4) / 0.35, 0, 1) : 1;
        const x = c.x + (c.shake > 0 && !RM ? Math.sin(t * 50 + c.slot) * 3 : 0), y = c.y - (c.done && !RM ? Math.sin(pop * Math.PI) * 10 : 0);
        blitR(art('card', faceUp ? (c.fox ? 'fox' : 'face') : 'back'), x, y, Z * sc, 12, 15, 0, sx, 1, al);
        if (!faceUp) continue;
        const S = g.S * sc;
        if (c.fox) blitR(critter('fox'), x, y + 8 * Z * sc, S, 9, 17, c.done ? 0.3 : 0, sx, 1, al, c.done > 0);
        else if (c.k[0] === 'e') blitR(c.pic, x, y + 10 * Z * sc, S, 10, 24, c.done && !RM ? Math.sin(t * 30) * 0.1 : 0, sx, 1, al);
        else { if (c.done && !c.picH) c.picH = cardPic(c.k, 'happy'); blitR(c.done ? c.picH : Math.floor(t * 0.8 + c.slot) % 5 === 4 ? c.picB : c.pic, x, y + 11 * Z * sc, S, 16, 31, 0, sx, 1, al); }
      }
      const ny = Math.max(hudBottom() + 24, g.gy - 26);
      if (g.st === 'play' && g.peekT > 0) note('Look! Remember them!', W / 2, ny);
      else if (g.st === 'play' && !g.found && g.boards === 1 && g.t > 0.3) note(g.def.how, W / 2, ny);
    },
    starsOf(g) { return starsByScore(g.def, g.score); },
    extra(g) { return `Pairs found: <b>${g.found}</b>` + (g.bestStreak >= 3 ? ` &middot; ${g.bestStreak} in a row!` : ''); },
  };

  // =====================================================================
  // Star Hop
  // =====================================================================
  // A moonlit pond scrolls by: the Sprout walks along lily pads by itself. Tap to hop (tap again in the air for a second, smaller hop).
  // Stars float over the gaps and on the pads; a big moon needs the double hop; stars in a row make a combo (x2 from 10, x3 from 25).
  // Missing a pad is gentle: splash, and a bubble carries the Sprout to the next pad (only time and the combo are lost).
  // Level 2: floating leaves up high with stars on them. Level 3: some pads sink a moment after you land, and shooting stars.
  // World units are art pixels (u); the Sprout's world x is g.cam, drawn at g.heroX on screen; heights are u above the water.
  const HOP_G = 420, HOP_V = 152, PADW = { s: 24, m: 32, l: 42 };
  function addStar(g, x, h, kind) { g.stars.push({ x, h, kind: kind || 'star', got: 0, ph: Math.random() * 6, vx: 0, vh: 0 }); }
  function padTopOf(P) { return P.top - P.sinkD; }
  const HOP = {
    init(g) {
      g.pads = []; g.stars = []; g.cam = 0; g.hy = 0; g.vy = 0; g.air = false; g.pad = null; g.dbl = false; g.coyote = 0;
      g.combo = 0; g.bestCombo = 0; g.got = 0; g.splashT = 0; g.splashes = 0; g.happyT = 0; g.squash = 0; g.walkD = 0; g.padN = 0; g.shootT = 6; g.hops = 0;
      for (let i = 0; i < 3; i++) g.pads.push({ x: -70 + i * 38, w: 42, top: 0, size: 'l', sink: false, sinkT: -1, sinkD: 0 });
      g.genX = 48; g.pad = g.pads[1];
    },
    layout(g) {
      g.Z = snapZ(clamp(Math.min(W / 200, H / 235), 1.5, 3.4)); g.S = g.Z; g.fpx = g.Z / SK;
      g.waterY = H - Math.max(52, (H - hudBottom()) * 0.24);
      g.heroX = Math.max(70, W * 0.28);
      HOP.fill(g, g.cam + (W - g.heroX) / g.Z + 60);
    },
    fill(g, upTo) {
      while (g.genX < upTo) {
        const p = clamp(g.t / g.def.sec, 0, 1), gx = g.genX;
        const gap = rand(lerp(9, 13, p), lerp(15, 22, p)) * (g.lv > 1 ? 1.08 : 1);
        const size = Math.random() < lerp(0.2, 0.45, p) ? 's' : Math.random() < 0.55 ? 'm' : 'l', x = gx + gap, w = PADW[size];
        if (Math.random() < 0.5) { const mid = gx + gap / 2; addStar(g, mid - 9, 18); addStar(g, mid, 27); addStar(g, mid + 9, 18); }
        if (g.padN % 4 === 3) addStar(g, gx + gap / 2, 56, 'moon');
        const pad = { x, w, top: 0, size, sink: !!g.def.sink && g.padN > 2 && Math.random() < 0.4, sinkT: -1, sinkD: 0 };
        g.pads.push(pad); g.padN++;
        if (w >= 32 && Math.random() < 0.35) for (let i = 0; i < (w >= 42 ? 3 : 2); i++) addStar(g, x + 9 + i * 11, 8);
        g.genX = x + w;
        if (g.def.leaves && g.padN > 3 && Math.random() < 0.35) {
          const lx = g.genX + rand(4, 10);
          g.pads.push({ x: lx, w: 32, top: 24, size: 'leaf', sink: false, sinkT: -1, sinkD: 0, ph: Math.random() * 6 });
          for (let i = 0; i < 2; i++) addStar(g, lx + 10 + i * 12, 33);
        }
      }
    },
    padAt(g, x, prevH, h) { for (const P of g.pads) if (x >= P.x - 3 && x <= P.x + P.w + 3) { const top = padTopOf(P); if (prevH >= top - 0.5 && h <= top) return P; } return null; },
    padOver(g, x, h) { for (const P of g.pads) if (x >= P.x - 2 && x <= P.x + P.w + 2 && Math.abs(padTopOf(P) - h) < 2) return P; return null; },
    nextPad(g) { let best = null; for (const P of g.pads) if (P.top === 0 && !P.sink && P.x + P.w > g.cam + 10 && (!best || P.x < best.x)) best = P; return best; },
    update(g, dt) {
      const p = clamp(g.t / g.def.sec, 0, 1);
      if (g.happyT > 0) g.happyT -= dt; if (g.squash > 0) g.squash -= dt;
      for (const P of g.pads) { if (P.sinkT > 0 && (P.sinkT -= dt) <= 0) P.sinkT = 0; if (P.sinkT === 0 && P.sinkD < 16) P.sinkD += dt * 12; }
      if (g.splashT > 0) { // a bubble carries the Sprout to the next pad
        g.splashT -= dt; const k = 1 - clamp(g.splashT / 1.1, 0, 1), e = k * k * (3 - 2 * k), T = g.resPad;
        g.cam = lerp(g.res0, T ? T.x + 6 : g.res0 + 30, e); g.hy = lerp(-6, T ? padTopOf(T) : 0, e) + Math.sin(k * Math.PI) * 26;
        if (g.splashT <= 0) { g.splashT = 0; g.air = false; g.pad = T; g.dbl = false; g.vy = 0; if (T) g.hy = padTopOf(T); g.squash = 0.15; snd('pop'); }
        HOP.tidy(g); return;
      }
      if (g.st === 'play') { const spd = (40 + 18 * p) * (g.def.speed || 1); g.cam += spd * dt; g.walkD += spd * dt; }
      if (g.air) {
        const prevH = g.hy; g.vy -= HOP_G * dt; g.hy += g.vy * dt; if (g.coyote > 0) g.coyote -= dt;
        if (g.vy <= 0) {
          const P = HOP.padAt(g, g.cam, prevH, g.hy);
          if (P) { g.hy = padTopOf(P); g.air = false; g.pad = P; g.dbl = false; g.squash = 0.15; snd('bloop', { pitch: 1.2 }); if (P.sink && P.sinkT < 0) P.sinkT = 0.45; }
        }
      } else {
        let P = g.pad;
        if (!P || g.cam < P.x - 2 || g.cam > P.x + P.w + 2) P = HOP.padOver(g, g.cam, g.hy);
        if (P) { g.pad = P; g.hy = padTopOf(P); } else { g.air = true; g.pad = null; g.vy = 0; g.coyote = 0.14; }
      }
      if (g.hy < -7) {
        if (g.st === 'play') {
          g.splashT = 1.1; g.res0 = g.cam; g.resPad = HOP.nextPad(g); g.combo = 0; g.splashes++; g.air = true; g.pad = null;
          snd('splash'); drops(g, g.heroX, g.waterY, 8, '#cbdbfc'); floatText(g, 'Splash!', g.heroX, g.waterY - 40, '#cbe8ff', 28);
        } else { g.hy = -7; g.vy = 0; }
      }
      // stars (and the shooting stars of Level 3)
      if (g.def.shoot && g.st === 'play' && (g.shootT -= dt) <= 0) { g.shootT = rand(6, 9); g.stars.push({ x: g.cam + 150, h: 70, kind: 'shoot', got: 0, ph: 0, vx: -32, vh: -32 }); snd('twinkle'); }
      for (const s of g.stars) {
        if (s.kind === 'shoot' && !s.got) { s.x += s.vx * dt; s.h = Math.max(26, s.h + s.vh * dt); }
        if (s.got) { s.got += dt; continue; }
        if (g.st !== 'play' || Math.abs(s.x - g.cam) > 9 || Math.abs(s.h - (g.hy + 11)) > (s.kind === 'star' ? 11 : 14)) continue;
        s.got = 0.001; g.combo++; g.got++; g.bestCombo = Math.max(g.bestCombo, g.combo);
        const mult = g.combo >= 25 ? 3 : g.combo >= 10 ? 2 : 1, pts = (s.kind === 'star' ? 10 : 50) * mult;
        g.score += pts; g.happyT = 0.3; g.hintDone = true;
        snd(s.kind === 'star' ? 'star' : 'twinkle', { pitch: 1 + 0.03 * Math.min(12, g.combo) });
        if (s.kind !== 'star' || mult > 1) floatText(g, '+' + pts, g.heroX, g.waterY - (g.hy + 34) * g.Z, s.kind === 'star' ? '#fff27a' : '#ffcc44', s.kind === 'star' ? 24 : 32);
        if (g.combo === 10 || g.combo === 25) { floatText(g, g.combo === 10 ? 'Stars x2!' : 'Stars x3!', W / 2, hudBottom() + 60, '#d8ccff', 32); snd('cheer'); }
      }
      HOP.fill(g, g.cam + (W - g.heroX) / g.Z + 60);
      HOP.tidy(g);
    },
    tidy(g) {
      const gone = g.cam - g.heroX / g.Z - 30;
      let n = 0; for (const P of g.pads) if (P.x + P.w > gone) g.pads[n++] = P; g.pads.length = n;
      n = 0; for (const s of g.stars) if (s.x > gone && !(s.got > 0.4)) g.stars[n++] = s; g.stars.length = n;
    },
    down(g) {
      if (g.st !== 'play' || g.splashT > 0) return;
      if (!g.air || g.coyote > 0) { g.vy = HOP_V; g.air = true; g.coyote = 0; g.pad = null; g.hops++; snd('bloop', { pitch: 1.5 }); g.hintDone = g.hintDone || g.hops > 1; }
      else if (!g.dbl) { g.dbl = true; g.vy = Math.max(g.vy, 0) + HOP_V * 0.82; snd('bloop', { pitch: 1.8 }); sparks(g, g.heroX, g.waterY - g.hy * g.Z, 4, '#d8ccff'); }
    },
    move() {}, up() {},
    bg(g, x, u) {
      const Z = g.Z, w = Math.ceil(W / Z), h = Math.ceil(H / Z), wy = Math.round(g.waterY / Z);
      vgrad(x, 0, 0, w, wy, ['#1e1a40', '#28224e', '#342d64', '#473e7c']);
      nightSky(x, w, wy - 20, 5, u); bgPut(x, skyArt('moon'), w * 0.78, Math.max(14, wy * 0.3), u);
      // far hills and reeds along the bank (fine stalks with soft cattail heads)
      ridge(x, w, wy, i => wy - (7 + Math.sin(i * 0.04) * 4 + Math.sin(i * 0.11) * 2), '#2a3a5a', '#34466a', u);
      for (let i = 0; i < w; i += 1.5) if (hsh(i * 2, 31) < 0.4) { const rx = fr(i, u), rh = fr(4 + hsh(i * 2, 32) * 9, u); x.fillStyle = '#22304c'; x.fillRect(rx, wy - rh, u, rh); if (rh > 8) { x.fillStyle = '#3a2a44'; x.fillRect(rx - u, wy - rh - 1, 3 * u, 2); } }
      // the pond: soft bands, the moon's broken reflection in fine streaks, a 1-fine light edge
      vgrad(x, 0, wy, w, h - wy, ['#33508a', '#2a447a', '#22386a', '#1c2e5a']);
      x.fillStyle = 'rgba(255,246,200,.3)'; const mx = w * 0.78; for (let j = wy + 2; j < h; j += 2.5) x.fillRect(fr(mx - 4 + ((j * 7) % 5), u), j, fr(8 - ((j * 3) % 4), u), u);
      x.fillStyle = '#6a88c0'; x.fillRect(0, wy, w, u); x.fillStyle = '#46649c'; x.fillRect(0, wy + u, w, u);
    },
    draw(g) {
      const Z = g.Z, wy = g.waterY, hx = g.heroX, t = g.t, cam = g.cam, fp = g.fpx;
      ctx.fillStyle = '#c8e1ff'; ctx.globalAlpha = 0.22;
      for (let i = 0; i < 14; i++) { const span = W + 80, xx = ((i * 131 - cam * Z * 0.7) % span + span) % span - 40; ctx.fillRect(Math.round(xx / fp) * fp, Math.round((wy + 6 + (i % 5) * 7 * Z) / fp) * fp, Math.round((5 + (i % 3) * 4) * Z / fp) * fp, fp); }
      // fireflies: a bright fine-pixel heart with a soft cross round it
      ctx.fillStyle = '#fff27a';
      for (let i = 0; i < 7; i++) {
        const fx = Math.round((((i * 173 - cam * Z * 0.3) % (W + 40) + W + 40) % (W + 40) - 20) / fp) * fp, fy = Math.round((wy * (0.35 + 0.08 * (i % 4)) + Math.sin(t * 1.3 + i) * 12) / fp) * fp, a = 0.45 + 0.4 * Math.sin(t * 3 + i * 2);
        ctx.globalAlpha = a * 0.45; ctx.fillRect(fx - fp, fy, fp, fp); ctx.fillRect(fx + fp, fy, fp, fp); ctx.fillRect(fx, fy - fp, fp, fp); ctx.fillRect(fx, fy + fp, fp, fp);
        ctx.globalAlpha = a; ctx.fillRect(fx, fy, fp, fp);
      }
      ctx.globalAlpha = 1;
      for (const P of g.pads) {
        const X = hx + (P.x - cam) * Z; if (X > W + 20 || X + P.w * Z < -20) continue;
        const top = wy - padTopOf(P) * Z;
        if (P.size === 'leaf') { blit(art('leaf'), X, top + (RM ? 0 : Math.sin(t * 2 + P.ph) * Z), Z, 0, 2); continue; }
        if (P.sinkT === 0) { ctx.globalAlpha = clamp(1 - P.sinkD / 16, 0.2, 1); }
        blit(art('pad', P.size), X, top, Z, 0, 2); ctx.globalAlpha = 1;
        if (P.sink && P.sinkT !== 0 && !RM) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6; ctx.fillRect(Math.round((X + P.w * Z * 0.5 + Math.sin(t * 5) * 3 * Z) / fp) * fp, Math.round((top - 3 * Z - ((t * 20) % 6) * Z) / fp) * fp, fp, fp); ctx.globalAlpha = 1; }
      }
      for (const s of g.stars) {
        const X = hx + (s.x - cam) * Z; if (X < -30 || X > W + 30) continue;
        const Y = wy - s.h * Z + (RM ? 0 : Math.sin(t * 3 + s.ph) * 1.5 * Z), moon = s.kind === 'moon', spr = moon ? art('moon') : art('star'), sc = moon ? Z * 1.5 : Z, an = moon ? 6.5 : 5.5;
        if (s.got) { const k = clamp(s.got / 0.4, 0, 1); blitR(spr, lerp(X, hx, k), lerp(Y, wy - (g.hy + 14) * Z, k), sc * (1.1 - k * 0.5), an, an, 0, 1, 1, 1 - k); continue; }
        if (s.kind === 'shoot') blit(art('trail'), X, Y, Z, 1, 23);
        if (s.kind !== 'star') blitR(art('glow', '#fff6a0'), X, Y, Z, 12, 12, 0, 1, 1, 0.38 + 0.14 * Math.sin(t * 8));
        blitR(spr, X, Y, sc, an, an, s.kind === 'star' || RM ? 0 : Math.sin(t * 4) * 0.2, 1, 1, 1);
      }
      const H2 = g.hero, fy = wy - g.hy * Z;
      if (g.splashT > 0) {
        blitR(H2.happy || H2.idle, hx, fy, Z, 16, 31, Math.sin(t * 6) * 0.1, 1, 1, 1);
        blitR(bigBubble(0), hx, fy - 12 * Z, Z * 1.5, 13, 13, 0, 1, 1, 0.85);
      } else {
        const pose = g.air ? (g.vy > 0 ? 'jump' : 'fall') : g.happyT > 0 ? 'happy' : g.st === 'play' ? (Math.floor(g.walkD / 7) % 2 ? 'walk0' : 'walk1') : 'idle';
        if (!g.air) shadow(hx, fy + Z, 22 * Z, 0.25); else { const P = HOP.padOver(g, g.cam, 0); if (P) shadow(hx, wy, Math.max(8, 22 - g.hy * 0.3) * Z, 0.18); }
        const sq = g.squash > 0 && !RM ? g.squash / 0.15 : 0;
        blitR(H2[pose] || H2.idle, hx, fy, Z, 16, 31, g.air ? clamp(-g.vy / 900, -0.15, 0.15) : 0, 1 + sq * 0.12, 1 - sq * 0.14, 1);
      }
      if (!g.hintDone && g.st === 'play' && g.t > 0.3) note(g.def.how, W / 2, Math.max(hudBottom() + 40, wy * 0.42));
    },
    starsOf(g) { return starsByScore(g.def, g.score); },
    extra(g) { return `Stars: <b>${g.got}</b>` + (g.bestCombo >= 10 ? ` &middot; ${g.bestCombo} in a row!` : ''); },
  };

  // =====================================================================
  // Bubble Pop
  // =====================================================================
  // Bubbles rise from the pond with a garden animal inside: tap one to pop it and free the animal. Popping the same colour again builds a
  // colour chain (x2 from 3, x3 from 5); the dots under the score show the chain. Golden bubbles are worth 50. Grey rain-cloud bubbles
  // cost a heart. Bubbles that float away cost nothing. Level 2: the frog holds up a colour; that colour is worth double. Level 3: big
  // bubbles need two taps and hold three animals.
  const BUB_ZOO = ['duck', 'koi', 'frog', 'bee', 'sparrow', 'hare', 'owl', 'firefly', 'otter', 'seal', 'crab', 'hedgehog', 'squirrel', 'butterfly', 'moth', 'tortoise', 'fox', 'bat', 'starfish', 'seagull'];
  const BUBC = ['#639bff', '#f07aa8', '#f08a3a', '#6abe30', '#a46ad8', '#ffcc44', '#8a90a8'];
  const BUBBLE = {
    init(g) {
      g.bubs = []; g.spawnT = 0.3; g.chain = 0; g.lastCol = -1; g.bestChain = 0; g.freed = 0; g.hearts = g.maxHearts = g.def.hearts || 3; g.sadT = 0; g.spawnCol = 0;
      g.callCol = g.def.call ? Math.floor(Math.random() * 5) : -1; g.callT = 8;
      g.zoo = BUB_ZOO.filter(k => D.ANIMALS && D.ANIMALS[k]); if (!g.zoo.length) g.zoo = ['duck'];
    },
    layout(g) { g.Z = snapZ(clamp(Math.min(W / 150, H / 230), 1.5, 3.4)); g.S = g.Z; g.fpx = g.Z / SK; g.top = hudBottom() + 4; g.pondY = H - Math.max(30, 16 * g.Z); },
    spawn(g, p) {
      const Z = g.Z, big = !!g.def.big && Math.random() < 0.18 && g.t > 2;
      const storm = !big && g.t > 3 && Math.random() < lerp(0.035, 0.09, p) * (g.def.storm || 1), gold = !big && !storm && Math.random() < 0.04;
      let col = storm ? 6 : gold ? 5 : Math.random() < 0.45 ? g.spawnCol : Math.floor(Math.random() * 5);
      if (col < 5) g.spawnCol = col;
      const s = big ? 1.5 : 1, r = 13 * Z * s, x = rand(r + 8, W - r - 8);
      const rise = (g.pondY - g.top + 30 * Z) / (lerp(7, 4.8, p) / (g.def.rate || 1));
      g.bubs.push({ x, y: g.pondY + 10 * Z, col, an: storm || gold ? '' : pick(g.zoo), big, s, hp: big ? 2 : 1, vy: rise * (gold ? 1.3 : big ? 0.8 : 1) * rand(0.9, 1.1), ph: Math.random() * 6, sway: rand(0.6, 1.2), t: 0, wob: 0, dead: false });
    },
    update(g, dt) {
      const p = clamp(g.t / g.def.sec, 0, 1);
      if (g.sadT > 0) g.sadT -= dt;
      if (g.st === 'play') {
        if ((g.spawnT -= dt) <= 0) { BUBBLE.spawn(g, p); g.spawnT = lerp(0.95, 0.58, p) / (g.def.rate || 1) * rand(0.8, 1.2); }
        if (g.def.call && (g.callT -= dt) <= 0) { g.callT = 8; const c = (g.callCol + 1 + Math.floor(Math.random() * 4)) % 5; g.callCol = c; snd('twinkle'); }
      }
      let n = 0;
      for (const b of g.bubs) {
        b.t += dt; b.y -= b.vy * dt;
        const r = 13 * g.Z * b.s; b.x = clamp(b.x + Math.sin(b.t * 1.4 + b.ph) * b.sway * (g.def.call ? 26 : 18) * dt, r, W - r);
        if (b.wob > 0) b.wob -= dt;
        if (!b.dead && b.y > g.top - 30 * g.Z * b.s) g.bubs[n++] = b;
      }
      g.bubs.length = n;
    },
    hit(g, x, y) { // the nearest bubble in reach; a rain cloud only when it is clearly the one tapped (never by brushing it)
      let best = null, bd = 1e9, rain = null, rd = 1e9;
      for (const b of g.bubs) {
        const r = 13 * g.Z * b.s, d = Math.hypot(b.x - x, b.y - y);
        if (b.dead || b.y > g.pondY + 4 * g.Z) continue;
        if (b.col === 6) { if (d < r * 0.95 && d < rd) { rd = d; rain = b; } } else if (d < r * 1.2 + 6 && d < bd) { bd = d; best = b; }
      }
      return rain && (!best || rd < bd * 0.55) ? rain : best;
    },
    down(g, x, y) {
      if (g.st !== 'play') return;
      const b = BUBBLE.hit(g, x, y); if (!b) return;
      g.hintDone = true; const Z = g.Z;
      if (b.col === 6) {
        b.dead = true; g.hearts--; g.chain = 0; g.lastCol = -1; g.sadT = 1; g.shake = RM ? 0 : 0.25;
        drops(g, b.x, b.y, 7, '#5b9bff'); floatText(g, 'Oops! Rain!', b.x, b.y - 24, '#cbe8ff', 26); snd('bump'); buzz(25);
        if (g.hearts <= 0) endGame(g, 'out');
        return;
      }
      if (b.hp > 1) { b.hp--; b.s = 1; b.wob = 0.35; snd('bloop'); floatText(g, 'Once more!', b.x, b.y - 30, '#ffffff', 22); return; }
      b.dead = true;
      let pts;
      if (b.col === 5) { pts = 50; snd('twinkle'); sparks(g, b.x, b.y, 10, '#fff27a'); }
      else {
        if (b.col === g.lastCol) g.chain++; else { g.chain = 1; g.lastCol = b.col; }
        g.bestChain = Math.max(g.bestChain, g.chain);
        const mult = g.chain >= 5 ? 3 : g.chain >= 3 ? 2 : 1;
        pts = 10 * mult * (b.big ? 3 : 1) * (b.col === g.callCol ? 2 : 1);
        if (g.chain === 3 || g.chain === 5) { floatText(g, g.chain === 3 ? 'Same colour! x2' : 'Same colour! x3', W / 2, g.top + 70, '#ffffff', 30); snd('cheer'); }
        snd('pop', { pitch: 1 + 0.05 * Math.min(8, g.chain) });
        sparks(g, b.x, b.y, 6, BUBC[b.col]);
      }
      g.score += pts; floatText(g, '+' + pts, b.x, b.y - 26, b.col === g.callCol || b.col === 5 ? '#ffcc44' : '#fff27a', pts >= 30 ? 30 : 24);
      if (b.an) { const n = b.big ? 3 : 1; for (let i = 0; i < n; i++) part(g, critter(i ? pick(g.zoo) : b.an), b.x, b.y, rand(-110, 110), rand(-380, -260), 1.1, g.S, { gr: 560, vr: rand(-2, 2) }); g.freed += n; }
    },
    move() {}, up() {},
    bg(g, x, u) {
      const Z = g.Z, w = Math.ceil(W / Z), h = Math.ceil(H / Z), py = Math.round(g.pondY / Z);
      vgrad(x, 0, 0, w, py, ['#ffd8b8', '#f8cec8', '#e8c8dc', '#c8c0ee']);
      bgPut(x, skyArt('sun'), w * 0.2, py * 0.3, u);
      for (let i = 0; i < 3; i++) bgPut(x, skyArt('cloud', 3 + (i % 3)), ((i * 0.41 + 0.3) % 1) * w, py * (0.25 + i * 0.16), u);
      ridge(x, w, py, i => py - (6 + Math.sin(i * 0.06) * 3), '#a8d49a', '#c0e4b0', u);
      // the pond: soft bands, a 1-fine light edge, little lily pads with fine rims
      vgrad(x, 0, py, w, h - py, ['#7cc0f0', '#68aee2', '#5a9ed6', '#4a8cc8']);
      x.fillStyle = '#cbe8ff'; x.fillRect(0, py, w, u); x.fillStyle = '#9cd0f4'; x.fillRect(0, py + u, w, u);
      for (let i = 0; i < w; i += 23) { const lx = i + 11.5, ly = py + 4 + (i % 3); fdisc(x, lx, ly + u, 4, 1.4, '#37946e', u); fdisc(x, lx, ly, 4, 1.4, '#6abe30', u); fdisc(x, lx - 1, ly - 0.4, 2, 0.6, '#99e550', u); }
      // cattails at both sides: fine stalks, soft brown heads with a lit edge
      for (const rx of [2, 6, w - 9, w - 5]) { x.fillStyle = '#4f9a3a'; x.fillRect(rx, py - 16, u, 18); x.fillStyle = '#6abe30'; x.fillRect(rx - u, py - 6, u, 4); fdisc(x, rx + u / 2, py - 16, 1.2, 2.2, '#8f563b', u); x.fillStyle = '#b47a44'; x.fillRect(rx - u, py - 17, u, 1.5); }
    },
    draw(g) {
      const Z = g.Z, t = g.t, fp = g.fpx;
      const frog = critter('frog'), fx = Math.max(16 * Z, W * 0.08), fyy = g.pondY + 2 * Z;
      blit(art('pad', 'm'), fx - 16 * Z, fyy, Z, 0, 2);
      blitR(frog, fx, fyy, Z, 9, 17, 0, 1, g.sadT > 0 ? 0.9 : 1, 1);
      if (g.callCol >= 0) {
        const by = fyy - 30 * Z + (RM ? 0 : Math.sin(t * 4) * 3), sx0 = Math.round((fx + 5 * Z) / fp) * fp - fp, sy0 = Math.round((by + 12 * Z) / fp) * fp;
        ctx.fillStyle = '#8f563b'; ctx.fillRect(sx0, sy0, 2 * fp, Math.max(4, Math.round((fyy - 12 * Z - by - 12 * Z) / fp) * fp)); ctx.fillStyle = '#b47a44'; ctx.fillRect(sx0, sy0, fp, Math.max(4, Math.round((fyy - 12 * Z - by - 12 * Z) / fp) * fp));
        blitR(art('bubble', g.callCol), fx + 5 * Z, by, Z, 13, 13, 0, 1, 1, 1);
        if (g.st === 'play' && g.t < 4) note('Pop this colour!', clamp(fx + 70, 90, W - 90), by - 26 * Z);
      }
      for (const b of g.bubs) {
        const wb = b.wob > 0 && !RM ? Math.sin(b.wob * 40) * 0.12 : 0, s = Z * b.s, sx2 = 1 + wb, sy2 = 1 - wb, bob = RM ? 0 : Math.sin(b.t * 2 + b.ph) * 0.06;
        if (b.an) {
          if (b.big) { blitR(critter(b.an), b.x - 5 * s, b.y + 6 * s, Z, 9, 17, bob, 1, 1, 1); blitR(critter(g.zoo[(b.ph * 10 | 0) % g.zoo.length]), b.x + 5 * s, b.y + 4 * s, Z, 9, 17, -bob, 1, 1, 1, true); }
          else blitR(critter(b.an), b.x, b.y + 8 * Z, Z, 9, 17, bob, 1, 1, 1);
        }
        blitR(b.s > 1 ? bigBubble(b.col) : art('bubble', b.col), b.x, b.y, s, 13, 13, 0, sx2, sy2, 1);
      }
      if (g.chain > 0 && g.lastCol >= 0) {
        const n = Math.min(5, g.chain), y0 = g.top + 12, x0 = 22;
        rr(x0 - 14, y0 - 14, 5 * 26 + 18, 28, 14); ctx.fillStyle = 'rgba(255,248,230,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#cdb57e'; ctx.stroke();
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x0 + i * 26, y0, 9, 0, 6.2832); ctx.fillStyle = i < n ? BUBC[g.lastCol] : 'rgba(0,0,0,.08)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = i < n ? '#5b4630' : 'rgba(0,0,0,.15)'; ctx.stroke(); }
      }
      if (!g.hintDone && g.st === 'play' && g.t > 0.3) note(g.def.how, W / 2, (g.top + g.pondY) / 2);
    },
    starsOf(g) { return starsByScore(g.def, g.score); },
    extra(g) { return `Friends freed: <b>${g.freed}</b>` + (g.bestChain >= 3 ? ` &middot; ${g.bestChain} same colour in a row!` : ''); },
  };

  // =====================================================================
  // Egg Roll
  // =====================================================================
  // An egg rolls down a grassy garden slope (the world scrolls up past it). Drag anywhere to steer it left and right: roll between the
  // two flower posts of each gate (gates in a row score more: x2 from 5, x3 from 10), pick up coins, and keep out of the muddy
  // puddles (a heart each, and the egg slows down for a moment). Bumping a post just nudges the egg aside. Level 2: the gates swing
  // from side to side. Level 3: night, narrower gates and more puddles. World y is in art pixels (u) down the hill; g.d = the egg's.
  const EGGR = {
    init(g) {
      g.objs = []; g.ex = -1; g.tx = -1; g.rot = 0; g.lean = 0; g.d = 0; g.genD = 60; g.prevGx = null; g.lastGap = 58; g.hearts = g.maxHearts = g.def.hearts || 3;
      g.gates = 0; g.run = 0; g.bestRun = 0; g.coinsGot = 0; g.hitT = 0; g.slowT = 0; g.happyT = 0; g.kind = g.lv === 3 ? 'moonlit' : g.lv === 2 ? 'candy' : 'meadow';
      g.trail = []; for (let i = 0; i < 18; i++) g.trail.push({ x: -1, d: 0 }); g.trailI = 0; g.trailT = 0;
    },
    layout(g) {
      g.Z = snapZ(clamp(Math.min(W / 170, H / 260), 1.5, 3.4)); const Z = g.Z; g.S = Z; g.fpx = Z / SK;
      g.top = hudBottom(); g.eggY = g.top + (H - g.top) * 0.28;
      const half = Math.min(W / 2 - 18 * Z, 300);
      g.L = W / 2 - half + 6 * Z; g.Rr = W / 2 + half - 6 * Z;
      if (g.ex < 0) g.ex = g.tx = W / 2;
      g.ex = clamp(g.ex, g.L, g.Rr); g.tx = clamp(g.tx, g.L, g.Rr);
      const tw = Math.ceil(W / Z), night = !!g.def.night, hL = Math.round((W / 2 - half) / Z), hR = Math.round((W / 2 + half) / Z);
      // the slope: a tile 64 art px tall (it scrolls and repeats), painted at SCENE_K in fine pixels: mown bands, blades and flowers,
      // leafy hedges down both sides with a soft scalloped edge (every repeating detail has a period that divides 64)
      g.tileC = strip(tw, 64, SK, (x, w, h, u) => {
        const LW = night ? ['#3f6e54', '#44745a', '#36624a', '#5a8c6c'] : ['#b8e0a8', '#c2e6b2', '#a6d69a', '#dcf2cc'];
        for (let y = 0; y < h; y += 16) { x.fillStyle = LW[0]; x.fillRect(0, y, w, 8); x.fillStyle = LW[1]; x.fillRect(0, y + 8, w, 8); }
        tufts(x, 0, 1.5, w, h - 2, [LW[2], LW[3]], 43, Math.floor(w * h / 14), u, night ? ['#7a9ac0', '#a8b8e0'] : ['#ffffff', '#fff27a', '#f7b6c8']);
        const HG = night ? ['#163c3c', '#1f5452', '#2f8078', '#52c7a8'] : ['#2a7458', '#37946e', '#6abe30', '#99e550'];
        for (const [a, b] of [[0, hL], [hR, w]]) {
          if (b <= a) continue; const edge = a === 0 ? b : a, dir = a === 0 ? -1 : 1;
          x.fillStyle = HG[1]; x.fillRect(a, 0, b - a, h);
          for (let y = -8; y <= h + 8; y += 8) fdisc(x, edge + dir * 2, y + 4, 4 + u, 4 + u, HG[0], u);
          for (let y = -8; y <= h + 8; y += 8) fdisc(x, edge + dir * 2, y + 4, 4, 4, HG[2], u);
          for (let y = -8; y <= h + 8; y += 8) fdisc(x, edge + dir * 3.2, y + 2.6, 2.4, 2.2, HG[3], u);
          for (let i = 0; i < Math.floor((b - a) * h / 12); i++) { const lx = fr(a + hsh(i, 44 + a) * (b - a), u), ly = fr(hsh(i, 45 + a) * h, u); x.fillStyle = HG[2]; x.fillRect(lx, ly, 2 * u, u); x.fillStyle = HG[0]; x.fillRect(lx + u, ly + u, 2 * u, u); }
        }
      });
    },
    gateX(g, o) { return g.L + o.x * (g.Rr - g.L) + (o.sw ? Math.sin(g.t * 1.5 + o.ph) * o.sw * g.Z : 0); },
    gen(g) {
      const p = clamp(g.t / g.def.sec, 0, 1), d = g.genD, night = !!g.def.night;
      const gx = rand(0.18, 0.82), w = (g.def.narrow ? 32 : 38) - 6 * p, sw = g.def.swing ? rand(10, 22) * (0.6 + p) : 0;
      g.objs.push({ k: 'gate', x: gx, d, w, sw, ph: Math.random() * 6, done: false, ok: false, i: Math.random() < 0.5 ? 0 : 1 });
      if (Math.random() < 0.55) for (let i = 1; i <= 3; i++) g.objs.push({ k: 'coin', x: clamp(gx + Math.sin(i + d) * 0.08, 0.05, 0.95), d: d + 10 + i * 9, done: false, sw: 0, ph: 0 });
      const pc = (night ? 0.5 : 0.3) + 0.2 * p, prev = g.prevGx == null ? 0.5 : g.prevGx;
      if (g.prevGx != null && Math.random() < pc) { // a puddle on the way to this gate, beside the straight line from the last gate
        const k = rand(0.35, 0.65), lineX = lerp(prev, gx, k), off = rand(0.3, 0.42);
        let px = lineX + (Math.random() < 0.5 ? -off : off); if (px < 0.06 || px > 0.94) px = lineX + (px < 0.06 ? off : -off);
        g.objs.push({ k: 'puddle', x: clamp(px, 0.06, 0.94), d: d - g.lastGap * (1 - k), done: false, sw: 0, ph: 0 });
      }
      g.prevGx = gx; g.lastGap = rand(52, 66) - 12 * p; g.genD += g.lastGap;
    },
    update(g, dt) {
      const Z = g.Z, p = clamp(g.t / g.def.sec, 0, 1);
      const mv = g.st === 'count' ? 1 / 60 : dt, prev = g.ex; g.ex += (g.tx - g.ex) * Math.min(1, mv * 10); g.lean = mv > 0 ? clamp((g.ex - prev) / mv / 1200, -0.3, 0.3) : 0;
      if (g.hitT > 0) g.hitT -= dt; if (g.slowT > 0) g.slowT -= dt; if (g.happyT > 0) g.happyT -= dt;
      const v = g.st === 'play' ? (44 + 24 * p) * (g.def.speed || 1) * (g.slowT > 0 ? 0.55 : 1) : 0, d0 = g.d;
      g.d += v * dt; g.rot += (v * dt) / 8 + g.lean * dt * 2;
      while (g.genD < g.d + (H - g.eggY) / Z + 40) EGGR.gen(g);
      if ((g.trailT -= dt) <= 0 && v > 0) { g.trailT = 0.05; const tr = g.trail[g.trailI]; tr.x = g.ex; tr.d = g.d; g.trailI = (g.trailI + 1) % g.trail.length; }
      if (g.st === 'play') for (const o of g.objs) {
        if (o.done) continue;
        if (o.k === 'gate') {
          if (o.d > d0 && o.d <= g.d) {
            o.done = true; const gx = EGGR.gateX(g, o), half = o.w * Z / 2, dx = Math.abs(g.ex - gx);
            if (dx < half - 4 * Z) {
              o.ok = true; g.gates++; g.run++; g.bestRun = Math.max(g.bestRun, g.run); g.happyT = 0.3;
              const mult = g.run >= 10 ? 3 : g.run >= 5 ? 2 : 1, pts = 20 * mult; g.score += pts;
              floatText(g, '+' + pts, gx, g.eggY - 30, mult > 1 ? '#ffcc44' : '#fff27a', 26); sparks(g, gx, g.eggY, 6, '#fff27a'); snd('star', { pitch: 1 + 0.04 * Math.min(10, g.run) });
              if (g.run === 5 || g.run === 10) { floatText(g, g.run === 5 ? 'Gates x2!' : 'Gates x3!', W / 2, g.eggY + 70, '#ffffff', 32); snd('cheer'); }
              g.hintDone = true;
            } else {
              if (g.run >= 3) floatText(g, 'Missed!', gx, g.eggY - 30, '#e6f2ff', 20);
              g.run = 0;
              if (dx < half + 5 * Z) { const s = g.ex < gx ? -1 : 1; g.ex = g.tx = clamp(g.ex + s * 10 * Z, g.L, g.Rr); snd('bump'); }
            }
          }
        } else if (o.k === 'coin') {
          if (Math.abs(o.d - g.d) < 8 && Math.abs(EGGR.gateX(g, o) - g.ex) < 11 * Z) { o.done = true; g.coinsGot++; g.score += 5; snd('coin', { pitch: 1.2 }); sparks(g, g.ex, g.eggY, 3, '#fff27a'); }
        } else if (o.k === 'puddle') {
          if (g.hitT <= 0 && Math.abs(o.d - g.d) < 6 && Math.abs(EGGR.gateX(g, o) - g.ex) < 13 * Z) {
            o.done = true; g.hearts--; g.run = 0; g.hitT = 1.3; g.slowT = 0.8; g.shake = RM ? 0 : 0.25;
            drops(g, g.ex, g.eggY, 8, '#9fd8ff'); floatText(g, 'Splash!', g.ex, g.eggY - 34, '#cbe8ff', 28); snd('splash'); buzz(25);
            if (g.hearts <= 0) endGame(g, 'out');
          }
        }
      }
      let n = 0; for (const o of g.objs) if (o.d > g.d - (g.eggY - g.top) / Z - 30) g.objs[n++] = o; g.objs.length = n;
    },
    down(g, x) { g.dragging = true; g.tx = clamp(x, g.L, g.Rr); },
    move(g, x) { if (g.dragging) g.tx = clamp(x, g.L, g.Rr); },
    up(g) { g.dragging = false; },
    bg(g, x) { x.fillStyle = g.def.night ? '#3f6e54' : '#b8e0a8'; x.fillRect(0, 0, Math.ceil(W / g.Z), Math.ceil(H / g.Z)); },
    sy(g, d) { return g.eggY + (d - g.d) * g.Z; },
    // the bunting between two posts: a fine-pixel rope that sags in the middle (runs of one row drawn as one rect)
    rope(lx, rx, ry, sag, col, dk, fp) {
      const x0 = Math.round(lx / fp) * fp, n = Math.max(2, Math.round((rx - lx) / fp)); let i0 = 0, y0 = Math.round(ry / fp) * fp;
      for (let i = 1; i <= n + 1; i++) {
        const k = Math.min(1, i / n), yy = Math.round((ry + 4 * k * (1 - k) * sag) / fp) * fp;
        if (yy !== y0 || i > n) { ctx.fillStyle = col; ctx.fillRect(x0 + i0 * fp, y0, (i - i0) * fp, fp); ctx.fillStyle = dk; ctx.fillRect(x0 + i0 * fp, y0 + fp, (i - i0) * fp, fp); i0 = i; y0 = yy; }
      }
    },
    draw(g) {
      const Z = g.Z, t = g.t, T = g.tileC, th = 64 * Z, off = ((g.d * Z) % th + th) % th, fp = g.fpx;
      if (T) for (let y = -off; y < H; y += th) ctx.drawImage(T, 0, Math.round(y / fp) * fp, aw(T) * Z, th);
      ctx.fillStyle = g.def.night ? 'rgba(160,200,170,.35)' : 'rgba(255,255,240,.45)';
      for (const tr of g.trail) { if (tr.x < 0) continue; const y = EGGR.sy(g, tr.d); if (y < g.top || y > g.eggY) continue; ctx.fillRect(Math.round((tr.x - 4 * Z) / fp) * fp, Math.round(y / fp) * fp, Math.round(8 * Z / fp) * fp, 5 * fp); }
      for (const o of g.objs) {
        const y = EGGR.sy(g, o.d); if (y < -40 * Z || y > H + 40 * Z) continue;
        const x = EGGR.gateX(g, o);
        if (o.k === 'puddle') { blit(art('puddle'), x, y, Z, 16, 7); continue; }
        if (o.k === 'coin') { if (!o.done) blitR(coinIc(), x, y + (RM ? 0 : Math.sin(t * 5 + o.d) * 1.5 * Z), Z, 4.5, 4.5, 0, RM ? 1 : Math.max(0.2, Math.abs(Math.cos(t * 4 + o.d))), 1, 1); continue; }
        const half = o.w * Z / 2, lx = x - half, rx = x + half, ry = y - 16 * Z;
        EGGR.rope(lx, rx, ry, 3 * Z, o.ok ? '#ffcc44' : '#fff8e6', o.ok ? '#c7861c' : '#cdb57e', fp);
        for (let i = 1; i < 6; i++) { const k = i / 6; blit(art('flag', i % 2 ? 0 : 1), lerp(lx, rx, k), ry + 4 * k * (1 - k) * 3 * Z + fp, Z, 2.5, 0); }
        blit(art('gate', o.i), lx, y, Z, 4.5, 23); blit(art('gate', o.i), rx, y, Z, 4.5, 23);
      }
      const ey = g.eggY, hit = g.hitT > 0 && !RM && Math.floor(t * 12) % 2;
      shadow(g.ex, ey + 11 * Z, 18 * Z, 0.25);
      blitR(eggIc(g.kind), g.ex, ey, Z, 10, 13, g.rot, 1, 1, hit ? 0.5 : 1);
      if (!g.hintDone && g.st === 'play' && g.t > 0.3) note(g.def.how, W / 2, ey + 60 * Z / 2 + 40);
    },
    starsOf(g) { return starsByScore(g.def, g.score); },
    extra(g) { return `Gates: <b>${g.gates}</b> &middot; coins: <b>${g.coinsGot}</b>` + (g.bestRun >= 5 ? ` &middot; ${g.bestRun} in a row!` : ''); },
  };

  // =====================================================================
  // Claw Machine
  // =====================================================================
  const CLAW_PRICE = 60;
  const CLAW_DEF = { id: 'claw', name: 'Claw Machine', short: 'Claw', track: 'arcade', col: '#f07aa8', c2: '#ffb0cc', dk: '#a8306a', sec: 0, claw: true, lv: 1, how: 'Move the claw, then press DROP!', blurb: 'Win plushies and prizes!' };
  const PRIZE_W = { coins: 0.2, fruit: 0.35, plush: 0.45, capsule: 0.25, egg: 0.55 };
  const PLUSH_COLS = ['mint', 'rose', 'sun', 'sky', 'plum', 'berry', 'peach', 'lilac', 'teal', 'coral', 'tangerine', 'bubblegum', 'aqua', 'lemon', 'orchid', 'cocoa', 'periwinkle', 'cherry'];
  const AREA_EGGS = ['meadow', 'beach', 'moonlit', 'candy'], FANCY = ['blossom', 'pearl', 'starry'];
  function clawRec() {
    const A = arc(); let c = A.claw; if (!isObj(c)) c = A.claw = {};
    c.grabs = Math.max(0, Math.floor(+c.grabs || 0)); c.wins = Math.max(0, Math.floor(+c.wins || 0)); c.miss = clamp(Math.floor(+c.miss || 0), 0, 99);
    if (!isObj(c.plush)) c.plush = {};
    return c;
  }
  const wpick = list => { let tot = 0; for (const x of list) tot += x[1]; let r = Math.random() * tot; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[list.length - 1][0]; };
  const colOk = c => !!(D.COLORS && D.COLORS[c] && PX.RAMPS[c]);
  function prizeSpr(p) {
    if (p.type === 'plush') return sprC('plush:' + p.c, () => PX.arcade.plush(PX.sprig(bodyLook(colOk(p.c) ? p.c : 'mint'), { eyes: 'happy', mouth: 'open' })));
    if (p.type === 'egg') return sprC('nestegg:' + p.k, () => { // an egg in a straw nest: 22 x 30 art px at k 2
      const e = PX.item('egg', p.k), n = art('nest'), K = 2, c = document.createElement('canvas'); c.width = 22 * K; c.height = 30 * K;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.setTransform(K, 0, 0, K, 0, 0);
      if (e) x.drawImage(e, 1, 0, aw(e), ah(e)); if (n) x.drawImage(n, 0, 21, aw(n), ah(n)); c.k = K; return c;
    });
    return p.type === 'coins' ? art('coinbag') : p.type === 'fruit' ? art('fruitbasket') : art('capsule', p.i % 4);
  }
  // plushies and nest eggs (k 2) at P, the k 4 prizes at Q = 2P: every prize shares the plushie Sprouts' fine pixel
  const prizeScale = (g, p) => (p.type === 'plush' || p.type === 'egg' ? g.P : g.Q);
  const prizeOf = p => p.spr || (p.spr = prizeSpr(p));
  const CTRL_KEYS = ['L', 'R', 'D'];
  const CLAW = {
    init(g) { g.prizes = []; g.cs = 'idle'; g.csT = 0; g.cx = -1; g.hold = 0; g.dragX = null; g.cab = 0; g.held = null; g.press = ''; },
    layout(g) {
      const top = hudBottom() + 6, ctrlH = clamp(H * 0.16, 92, 150);
      g.Z = snapZ(clamp(Math.min(W / 150, (H - top - ctrlH) / 112), 1.5, 5));
      const Z = g.Z;
      g.boxL = Math.max(14, W * 0.05); g.boxR = W - g.boxL;
      if (g.boxR - g.boxL > 760) { g.boxL = W / 2 - 380; g.boxR = W / 2 + 380; }
      g.floorY = H - ctrlH - 14; g.ctrlY = H - ctrlH; g.ctrlH = ctrlH;
      const availG = g.floorY - top - 4, glassH = Math.min(availG, Math.max(100 * Z, availG * 0.6)), spare = availG - glassH;
      g.top = top; g.shelf = spare > 34 * Z; g.boxT = g.shelf ? g.floorY - glassH : top + 4;
      g.railY = g.boxT + 10;
      // the plushie Sprouts (k 2) at P ~ 0.62 Z set the machine's fine pixel (fp CSS px, a whole number of device px); the claw head
      // and the k 4 prizes draw at Q = 2P; the cabinet is painted into the background buffer at that same fine pixel
      // (+0.3 rounds phones up to the next whole fine pixel, so their prizes and claw aren't tiny)
      const f = Math.max(1, Math.round(0.62 * Z * DPR / SK + 0.3)); g.fp = f / DPR; g.P = SK * g.fp; g.Q = 4 * g.fp; g.S = g.P; g.fpx = g.fp; g.cs0 = g.Q;
      g.bgPx = g.fp; g.bgU = 1; g.prizeFont = `700 ${Math.round(10 + Z * 2)}px ${F_UI}`;
      g.signH = Math.min((g.boxT - 12 - top) * 0.42, 30 * Z); g.plankY = g.boxT - 18; g.signSize = Math.round(Math.min(g.signH * 0.5, (g.boxR - g.boxL) / 9));
      g.shS = Math.max(1, Math.floor(Math.min(Z * 0.7, (g.plankY - top - g.signH - 30) / 30) * DPR / SK)) * SK / DPR; g.shelfList = null;
      g.chuteW = Math.max(32 * Z, (g.boxR - g.boxL) * 0.17); g.chuteX = g.boxL + g.chuteW / 2;
      g.minX = g.chuteX; g.maxX = g.boxR - 14 * Z;
      if (g.cx < 0) g.cx = (g.boxL + g.chuteW + g.boxR) / 2;
      g.cx = clamp(g.cx, g.minX, g.maxX);
      const x0 = g.boxL + g.chuteW + 14 * Z, x1 = g.boxR - 12 * Z, per = clamp(Math.floor((x1 - x0) / (19 * Z)), 3, 8), step = (x1 - x0) / per;
      const old = g.slots; g.slots = [];
      const OFF = [0.2, 0.8, 0.5];
      for (let r = 0; r < 3; r++) for (let i = 0; i < per; i++) g.slots.push({ x: x0 + step * (i + OFF[r]), y: g.floorY - (2 - r) * 10 * Z - 2 * Z, row: r });
      if (!old || old.length !== g.slots.length) { g.prizes = []; CLAW.refill(g, true); }
      else for (const p of g.prizes) { const sl = g.slots[p.slot]; if (sl && p.st === 'rest') { p.x = sl.x; p.y = sl.y; } }
      const bh = ctrlH - 22, bw = Math.min(W * 0.24, 170), dw = Math.min(W * 0.32, 230), cy = g.ctrlY + 10;
      g.btn = { L: [W / 2 - dw / 2 - 14 - bw, cy, bw, bh], D: [W / 2 - dw / 2, cy, dw, bh], R: [W / 2 + dw / 2 + 14, cy, bw, bh] };
    },
    newPrize() {
      const type = wpick([['coins', 26], ['fruit', 20], ['plush', 22], ['capsule', 18], ['egg', 10]]);
      const p = { type, w: PRIZE_W[type], i: Math.floor(Math.random() * 4), st: 'rest', x: 0, y: 0, vy: 0, wobT: 0, spr: null };
      if (type === 'plush') { const L = PLUSH_COLS.filter(colOk); p.c = L.length ? pick(L) : 'mint'; }
      if (type === 'egg') { const L = (Math.random() < 0.15 ? FANCY : AREA_EGGS).filter(k => D.EGGS && D.EGGS[k]); p.k = L.length ? pick(L) : 'meadow'; }
      return p;
    },
    refill(g, all) {
      const used = new Set(g.prizes.map(p => p.slot)), free = []; for (let i = 0; i < g.slots.length; i++) if (!used.has(i)) free.push(i);
      if (!all && g.prizes.length >= g.slots.length * 0.6) return;
      shuffleArr(free);
      for (const i of free) { const p = CLAW.newPrize(), sl = g.slots[i]; p.slot = i; p.x = sl.x; p.y = all ? sl.y : g.boxT + 20; if (!all) { p.st = 'fall'; p.vy = 0; } prizeOf(p); g.prizes.push(p); }
    },
    under(g, x) {
      let best = null, bd = 1e9;
      for (const p of g.prizes) { if (p.st !== 'rest') continue; const d = Math.abs(p.x - x) - p.y * 0.0001; if (d < bd) { bd = d; best = p; } }
      if (!best) return null;
      return { p: best, a: 1 - Math.abs(best.x - x) / (12 * g.Z) };
    },
    drop(g) {
      if (g.cs !== 'idle' || g.st !== 'play') return;
      if (tokens() < 1) { snd('bump'); floatText(g, 'You need a Claw token!', W / 2, g.floorY - 60, '#ffffff', 24); flashBuy(); return; }
      addTokens(-1);
      const c = clawRec(), u = CLAW.under(g, g.cx);
      let ok = false, slip = false;
      g.tgt = u && u.a > 0 ? u.p : null; g.tx = g.cx;
      if (c.miss >= 4 && u) { ok = true; g.tgt = u.p; g.tx = u.p.x; } // (the kind rule: never more than 4 misses in a row)
      else if (g.tgt) { const ch = clamp(0.26 + 0.62 * u.a - 0.25 * g.tgt.w + 0.05 * c.miss, 0.08, 0.9); ok = Math.random() < ch; slip = ok && Math.random() < 0.16 * g.tgt.w + 0.03; }
      g.win = ok && !slip; g.lift = ok || !!(g.tgt && u.a > 0.35); g.slipAt = g.win ? -1 : ok ? 0.55 : 0.18;
      c.grabs++; if (g.win) { c.wins++; c.miss = 0; } else c.miss++;
      g.paid = false; save();
      const tipY = g.tgt ? g.tgt.y - ah(prizeOf(g.tgt)) * prizeScale(g, g.tgt) + 7 * g.Z : g.floorY - 22 * g.Z;
      g.cabTo = Math.max(4 * g.Z, tipY - g.railY - 8 * g.Z - 17 * g.cs0);
      g.cs = Math.abs(g.tx - g.cx) > 1 ? 'aim' : 'down'; g.csT = 0; g.hold = 0; g.dragX = null; snd('select', { pitch: 0.8 });
    },
    update(g, dt) {
      const Z = g.Z, sp = 120 + 40 * Z, vz = 70 * Z;
      for (const p of g.prizes) {
        if (p.st === 'fall') { p.vy += 1600 * dt; p.y += p.vy * dt; const sl = g.slots[p.slot]; if (sl && p.y >= sl.y) { p.y = sl.y; p.st = 'rest'; if (p.vy > 200) snd('bump', { pitch: 1.3 }); p.vy = 0; } }
        else if (p.st === 'chute') { p.vy += 1600 * dt; p.y += p.vy * dt; }
        if (p.wobT > 0) p.wobT -= dt;
      }
      switch (g.cs) {
        case 'idle':
          if (g.hold) g.cx += g.hold * sp * dt;
          else if (g.dragX != null) g.cx += clamp(g.dragX - g.cx, -sp * 1.5 * dt, sp * 1.5 * dt);
          break;
        case 'aim': { const d = g.tx - g.cx; g.cx += clamp(d, -sp * dt, sp * dt); if (Math.abs(d) < 1) { g.cx = g.tx; g.cs = 'down'; } break; }
        case 'down': g.cab += vz * dt; if (g.cab >= g.cabTo) { g.cab = g.cabTo; g.cs = 'close'; g.csT = 0; snd('tick'); } break;
        case 'close':
          g.csT += dt;
          if (g.csT > 0.4) { if (g.lift && g.tgt) { g.held = g.tgt; g.held.st = 'held'; } else if (g.tgt) g.tgt.wobT = 0.4; g.cs = 'up'; g.cabFrom = g.cab; }
          break;
        case 'up': {
          g.cab -= vz * 0.8 * dt; const k = 1 - g.cab / Math.max(1, g.cabFrom);
          if (g.held && g.slipAt >= 0 && k >= g.slipAt) { const q = g.held; g.held = null; q.st = 'fall'; q.vy = 0; snd('bump'); floatText(g, 'Oh! It slipped!', W / 2, g.railY + 60, '#ffffff', 26); }
          if (g.cab <= 0) {
            g.cab = 0;
            if (g.held) { g.cs = 'carry'; snd('whoosh'); }
            else { g.cs = 'idle'; g.tgt = null; snd('back'); floatText(g, pick(['So close!', 'Aww! Try again!', 'Almost!']), W / 2, g.floorY - 70, '#ffe0f0', 28); CLAW.refill(g, false); }
          }
          break;
        }
        case 'carry': { const d = g.chuteX - g.cx; g.cx += clamp(d, -sp * dt, sp * dt); if (Math.abs(d) < 1) { g.cx = g.chuteX; g.cs = 'open'; g.csT = 0; } break; }
        case 'open':
          g.csT += dt;
          if (g.csT > 0.25 && g.held) { const q = g.held; g.held = null; q.st = 'chute'; q.vy = 0; snd('pop', { pitch: 0.8 }); }
          if (g.csT > 0.95) { let q = null; for (const x of g.prizes) if (x.st === 'chute') q = x; g.prizes = g.prizes.filter(x => x.st !== 'chute'); g.cs = 'idle'; if (q) CLAW.award(g, q); CLAW.refill(g, false); }
          break;
      }
      if (g.held) { g.held.x = g.cx; g.held.y = CLAW.hookY(g) + 4 * g.cs0 + ah(prizeOf(g.held)) * prizeScale(g, g.held) * 0.92; }
      g.cx = clamp(g.cx, g.minX, g.maxX);
    },
    hookY(g) { return g.railY + 8 * g.Z + g.cab; },
    // the prize itself (also used when leaving mid-grab: quiet = a toast instead of the big celebration)
    award(g, p, quiet) {
      if (g.paid) return; g.paid = true;
      const c = clawRec(), it = ST.items();
      let cel = null;
      try {
        if (p.type === 'coins') { const n = ST.addCoins(5 * Math.round((20 + Math.pow(Math.random(), 2) * 130) / 5), 'arcade'); cel = { title: `${n} coins!`, sub: 'A bag full of coins!', icon: art('coinbag'), tiles: [{ icon: coinIc(), value: '+' + n, label: 'Coins' }] }; }
        else if (p.type === 'fruit') {
          const pool = Object.keys(D.FRUITS).filter(k => k !== 'goldfruit' && k !== 'apple'), got = [pick(pool), pick(pool), Math.random() < 0.1 && D.FRUITS.goldfruit ? 'goldfruit' : 'apple'];
          for (const k of got) ST.addFruit(k, 1);
          cel = { title: '3 fruits!', sub: got.map(k => D.FRUITS[k].name).join(', ') + '. Find them in the Garden fruit tray.', icon: art('fruitbasket'), tiles: got.map(k => ({ icon: fruitIc(k), value: '+1', label: D.FRUITS[k].name })) };
        } else if (p.type === 'plush') {
          const col = colOk(p.c) ? p.c : 'mint'; it.paints[col] = (it.paints[col] | 0) + 1; c.plush[col] = (c.plush[col] | 0) + 1; PS.emit('items');
          cel = { title: `${D.COLORS[col]} Sprout plushie!`, sub: `It sits on your plushie shelf. And here is ${D.COLORS[col]} paint for a Sprout!`, icon: prizeSpr(p), tiles: [{ icon: PX.item('paint', col), value: '+1', label: D.COLORS[col] + ' paint' }] };
        } else if (p.type === 'capsule') {
          const hats = Object.keys(D.HATS || {}).filter(h => D.HATS[h].tier <= 2 && !it.hats[h]);
          if (hats.length && Math.random() < 0.45) { const h = pick(hats); it.hats[h] = true; PS.emit('items'); cel = { title: D.HATS[h].name + '!', sub: `A new ${D.HATS[h].slot === 'extra' ? 'charm' : 'hat'} for your closet. Any Sprout can wear it.`, icon: PX.item('hat', h) }; }
          else { const L = Object.keys(D.PATTERNS).filter(k => k !== 'plain'), id = pick(L); it.patterns[id] = (it.patterns[id] | 0) + 1; PS.emit('items'); cel = { title: `${D.PATTERNS[id]} sticker!`, sub: 'Give a Sprout this pattern from its page in Sprouts.', icon: PX.item('pattern', id) }; }
        } else if (p.type === 'egg') {
          const k = D.EGGS[p.k] ? p.k : 'meadow'; ST.addEgg(k, 'Claw Machine');
          cel = { title: D.EGGS[k].name + '!', sub: 'It is waiting in the Garden. Tap it to hatch!', icon: eggIc(k) };
        }
      } catch (e) { console.error('claw prize', e); }
      save();
      snd('cheer');
      if (G === g) { floatText(g, 'You got it!', W / 2, g.floorY - 70, '#ffcc44', 34); sparks(g, g.chuteX, g.floorY - 10, 10, '#fff27a'); g.shelfList = null; }
      if (!cel) return;
      if (quiet) toast(`Claw Machine prize: ${cel.title}`);
      else celebrate(Object.assign({ kind: 'gift', eyebrow: 'Claw Machine prize!', button: 'Yay!', jingle: 'item' }, cel));
    },
    abort(g) { // leaving mid-grab: a win is still paid (it was decided at DROP)
      if (!g || g.cs === 'idle') return;
      if (g.win && !g.paid) { let q = g.held || g.tgt; if (!q) for (const x of g.prizes) if (x.st === 'chute') q = x; if (q) CLAW.award(g, q, true); }
      g.cs = 'idle';
    },
    btnAt(g, x, y) { for (const k of ['L', 'D', 'R']) { const b = g.btn[k]; if (x >= b[0] - 6 && x <= b[0] + b[2] + 6 && y >= b[1] - 8 && y <= b[1] + b[3] + 8) return k; } return ''; },
    down(g, x, y) {
      const b = CLAW.btnAt(g, x, y); g.press = b;
      if (b === 'D') { CLAW.drop(g); return; }
      if (g.cs !== 'idle') return;
      if (b === 'L' || b === 'R') { g.hold = b === 'L' ? -1 : 1; g.hintDone = true; snd('tick'); return; }
      if (y > g.boxT && y < g.floorY + 10) { g.dragX = x; g.hintDone = true; }
    },
    move(g, x, y) { if (g.dragX != null && g.cs === 'idle') g.dragX = x; else if (g.hold && CLAW.btnAt(g, x, y) === '') g.hold = 0; },
    up(g) { g.hold = 0; g.dragX = null; g.press = ''; },
    // the room and the cabinet, painted once per layout at the machine's fine pixel (units: CSS px, u = one fine px)
    bg(g, x, u) {
      const Z = g.Z, L = g.boxL, Rr = g.boxR, T = g.boxT, F = g.floorY;
      vgrad(x, 0, 0, W, H, ['#4a3a78', '#5a4488', '#6c5098', '#7556a0']);
      for (let i = 0; i < W; i += 24) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(fr(i, u), 0, fr(12, u), H); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(fr(i, u), 0, u, H); }
      x.fillStyle = 'rgba(255,240,200,.3)'; for (let i = 0; i < 60; i++) x.fillRect(fr(hsh(i, 51) * W, u), fr(hsh(i, 52) * H, u), u, u);
      if (g.shelf) { // the sign plate and the plushie plank
        rbox(x, L + 10, g.top + 4, Rr - L - 20, g.signH, 14, '#fff8e6', u);
        rrect(x, L + 10 + 3 * u, g.top + 4 + 3 * u, Rr - L - 20 - 6 * u, g.signH - 6 * u, 12, '#e8d8b0', u); rrect(x, L + 10 + 4 * u, g.top + 4 + 4 * u, Rr - L - 20 - 8 * u, g.signH - 8 * u, 11, '#fff8e6', u);
        rbox(x, L + 4, g.plankY, Rr - L - 8, 10, 2, '#c4884c', u);
        x.fillStyle = '#e8b070'; x.fillRect(fr(L + 4, u) + 2 * u, fr(g.plankY, u) + 2 * u, fr(Rr - L - 8, u) - 4 * u, fr(3, u));
        x.fillStyle = '#9a6234'; x.fillRect(fr(L + 4, u) + 2 * u, fr(g.plankY + 10, u) - 3 * u, fr(Rr - L - 8, u) - 4 * u, u);
        x.fillStyle = '#a8703f'; for (let i = L + 30; i < Rr - 20; i += 47) x.fillRect(fr(i, u), fr(g.plankY + 5, u), fr(9, u), u);
      }
      // the cabinet: a pink body with a 2-fine ink ring and a 1-fine lit rim; a darker foot strip
      rbox(x, L - 10, T - 8, Rr - L + 20, H - T + 14, 18, '#ffb0cc', u);
      rrect(x, L - 10 + 3 * u, T - 8 + 3 * u, Rr - L + 20 - 6 * u, H - T + 14 - 6 * u, 18 - 3 * u, '#f07aa8', u);
      x.fillStyle = '#d0508a'; x.fillRect(fr(L - 6, u), fr(F + 8, u), fr(Rr - L + 12, u), fr(4, u));
      // the glass box: ink frame, pale glass, the pink floor, the dark chute hole and its glass wall, the metal rail
      const gx = fr(L, u), gy = fr(T + 4, u), gw = fr(Rr - L, u), gh = fr(F - T + 4, u), fy = fr(F - 12 * Z, u);
      x.fillStyle = INK; x.fillRect(gx - 2 * u, gy - 2 * u, gw + 4 * u, gh + 4 * u);
      vgrad(x, gx, gy, gw, gh, ['#f2faff', '#e4f4ff', '#d8ecfc']);
      x.fillStyle = '#fff0f6'; x.fillRect(gx, fy, gw, gy + gh - fy); x.fillStyle = '#f6d4e4'; x.fillRect(gx, fy, gw, u);
      const hx = fr(L + 4, u), hy = fr(F - 4 * Z, u);
      x.fillStyle = '#4a3a58'; x.fillRect(hx, hy, fr(g.chuteW - 8, u), gy + gh - hy); x.fillStyle = '#2e2440'; x.fillRect(hx, hy, fr(g.chuteW - 8, u), u);
      const wx = fr(L + g.chuteW - 4, u), wy = fr(F - 24 * Z, u), ww = Math.max(6 * u, fr(5, u));
      x.fillStyle = INK; x.fillRect(wx, wy, ww, gy + gh - wy); x.fillStyle = '#e4f4ff'; x.fillRect(wx + 2 * u, wy + 2 * u, ww - 4 * u, gy + gh - wy - 2 * u);
      x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(wx + 2 * u, wy + 2 * u, u, gy + gh - wy - 2 * u);
      rbox(x, L + 4, g.railY - 3, Rr - L - 8, 6, 1, '#c0c8d8', u); x.fillStyle = '#f4f6fa'; x.fillRect(fr(L + 4, u) + 2 * u, fr(g.railY - 3, u) + 2 * u, fr(Rr - L - 8, u) - 4 * u, u);
      // two small pieces drawn live but painted here once: the glass glare (over the prizes) and the claw's carriage
      const gc = document.createElement('canvas'); gc.width = Math.round(gw / u); gc.height = Math.round(gh / u);
      const gq = gc.getContext('2d'); gq.fillStyle = 'rgba(255,255,255,.22)';
      for (let j = 0; j < gc.height; j++) { const k = j / gc.height, xa = Math.round(lerp(0.62, 0.38, k) * gc.width), xb = Math.round(lerp(0.74, 0.5, k) * gc.width); gq.fillRect(xa, j, xb - xa, 1); gq.fillRect(xb + Math.round(gc.width * 0.025), j, Math.max(1, Math.round(gc.width * 0.012)), 1); }
      g.glare = { c: gc, x: gx, y: gy };
      const cc = document.createElement('canvas'); cc.width = Math.round(18 * Z / u); cc.height = Math.round(7 * Z / u);
      const cq = cc.getContext('2d'); rbox(cq, 0, 0, cc.width, cc.height, Math.round(3 * Z / u), '#ffcc44', 1);
      cq.fillStyle = '#fff27a'; cq.fillRect(3, 2, cc.width - 6, 1); cq.fillStyle = '#c7861c'; cq.fillRect(3, cc.height - 3, cc.width - 6, 1);
      g.carC = cc;
    },
    shelfList(g) {
      const c = clawRec(), keys = Object.keys(c.plush).filter(k => c.plush[k] > 0 && colOk(k)), s = g.shS, step = 26 * s;
      const fit = Math.max(1, Math.floor((g.boxR - g.boxL - 30) / step)), show = keys.slice(-fit);
      g.shelfList = show.map((k, i) => ({ spr: prizeSpr({ type: 'plush', c: k }), x: fr(g.boxL + 18 + step * (i + 0.5), g.fp), lab: c.plush[k] > 1 ? 'x' + c.plush[k] : '' }));
      g.shelfLabel = keys.length ? `My plushies: ${keys.length}` : 'My plushies (win some!)';
    },
    drawShelf(g, t) {
      const top = g.top, L = g.boxL, Rr = g.boxR, fp = g.fp, on = Math.floor(t * 3), bOn = art('bulb', 1), bOff = art('bulb', 0);
      for (let i = 0; i < 16; i++) blit((on + i) % 4 === 0 ? bOn : bOff, fr(L + 22 + (Rr - L - 44) * i / 15, fp), fr(top + 10, fp), g.P, 2.5, 2.5);
      bigText('CLAW MACHINE', W / 2, top + 4 + g.signH * 0.58, g.signSize, '#ffcc44');
      if (!g.shelfList) CLAW.shelfList(g);
      ctx.font = F_SHELF; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f4ecff'; ctx.fillText(g.shelfLabel, L + 12, top + g.signH + 26);
      const s = g.shS;
      for (const it of g.shelfList) {
        blit(it.spr, it.x, g.plankY + 2, s, 17, 33);
        if (it.lab) { ctx.font = F_BADGE; ctx.textAlign = 'center'; const tx = it.x + 26 * s * 0.32, ty = g.plankY - 24 * s; rr(tx - 13, ty - 9, 26, 18, 9); ctx.fillStyle = '#ffcc44'; ctx.fill(); ctx.strokeStyle = TXT; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = TXT; ctx.fillText(it.lab, tx, ty + 5); }
      }
    },
    draw(g) {
      const Z = g.Z, t = g.t, L = g.boxL, Rr = g.boxR, T = g.boxT, F = g.floorY, fp = g.fp;
      if (g.shelf) CLAW.drawShelf(g, t);
      const on = Math.floor(t * 4), bOn = art('bulb', 1), bOff = art('bulb', 0);
      for (let i = 0; i < 14; i++) blit((on + i) % 3 === 0 ? bOn : bOff, fr(L + (Rr - L) * (i + 0.5) / 14, fp), fr(T - 2, fp), g.P, 2.5, 2.5);
      ctx.font = g.prizeFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText('PRIZE', L + g.chuteW / 2, F - 1.5 * Z + 1);
      for (let r = 0; r < 3; r++) for (const p of g.prizes) if (p.st !== 'held' && p.st !== 'chute' && g.slots[p.slot] && g.slots[p.slot].row === r) CLAW.drawP(g, p, t);
      for (const p of g.prizes) if (p.st === 'chute') { ctx.save(); ctx.beginPath(); ctx.rect(L, T, g.chuteW, F - T - 2 * Z); ctx.clip(); CLAW.drawP(g, p, t); ctx.restore(); }
      // the carriage on the rail, the cable (2 fine px, lit on its left) and the claw
      const hy = CLAW.hookY(g), cxs = fr(g.cx, fp);
      if (g.carC) ctx.drawImage(g.carC, fr(g.cx - g.carC.width * fp / 2, fp), fr(g.railY - 3 * Z, fp), g.carC.width * fp, g.carC.height * fp);
      const c0 = fr(g.railY + 4 * Z, fp), c1 = fr(hy + 2, fp);
      if (c1 > c0) { ctx.fillStyle = '#7a8296'; ctx.fillRect(cxs - fp, c0, 2 * fp, c1 - c0); ctx.fillStyle = '#c0c8d8'; ctx.fillRect(cxs - fp, c0, fp, c1 - c0); }
      if (g.held) CLAW.drawP(g, g.held, t);
      const shut = g.cs === 'close' ? g.csT > 0.2 : g.cs === 'up' || g.cs === 'carry' || (g.cs === 'open' && g.csT < 0.2);
      blitR(art('claw', shut ? 'shut' : 'open'), g.cx, hy, g.cs0, 11, 0, g.cs === 'idle' && !RM ? Math.sin(t * 2) * 0.05 : 0, 1, 1, 1);
      if (g.cs === 'idle') { ctx.fillStyle = '#f07aa8'; ctx.globalAlpha = 0.55; for (let y = hy + 18 * g.cs0; y < F - 4; y += 14) ctx.fillRect(cxs - fp, fr(y, fp), 2 * fp, fr(6, fp)); ctx.globalAlpha = 1; }
      if (g.glare) ctx.drawImage(g.glare.c, g.glare.x, g.glare.y, g.glare.c.width * fp, g.glare.c.height * fp);
      CLAW.drawCtrl(g);
      if (!g.hintDone && g.cs === 'idle') note(tokens() ? g.def.how : 'Win stars in the games to get tokens!', W / 2, (T + F) / 2 - 10 * Z);
    },
    drawP(g, p, t) {
      const s = prizeScale(g, p), c = prizeOf(p), w = p.wobT > 0 && !RM ? Math.sin(t * 40) * 0.12 : 0;
      if (p.st === 'rest') shadow(p.x, p.y, aw(c) * s * 0.7);
      blitR(c, p.x, p.y, s, aw(c) / 2, ah(c), p.st === 'held' && !RM ? Math.sin(t * 6) * 0.08 : w, 1, 1, 1);
    },
    drawCtrl(g) {
      const busy = g.cs !== 'idle', none = tokens() < 1;
      for (const k of CTRL_KEYS) {
        const b = g.btn[k], x = b[0], y = b[1], w = b[2], h = b[3], down = g.press === k && (k !== 'D' ? g.hold : true), dim = busy || (k === 'D' && none), oy = down ? 3 : 0;
        rr(x, y + 4, w, h, 18); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
        rr(x, y + oy, w, h - 2, 18); ctx.fillStyle = k === 'D' ? (dim ? '#d8b0c4' : '#e5535f') : (dim ? '#c8c0d8' : '#ffcc44'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = TXT; ctx.stroke();
        const cx = x + w / 2, cy = y + oy + h / 2 - 1;
        if (k === 'D') { bigText('DROP', cx, cy - (none ? 8 : 0), Math.round(Math.min(h * 0.4, w * 0.24)), '#ffffff'); if (none) { ctx.font = F_SMALL; ctx.fillStyle = '#fff'; ctx.fillText('needs 1 token', cx, cy + h * 0.28); } }
        else { const a = Math.min(w, h) * 0.26, d = k === 'L' ? -1 : 1; ctx.beginPath(); ctx.moveTo(cx + d * a, cy); ctx.lineTo(cx - d * a * 0.7, cy - a); ctx.lineTo(cx - d * a * 0.7, cy + a); ctx.closePath(); ctx.fillStyle = '#5b4630'; ctx.fill(); }
      }
    },
    starsOf() { return 0; },
  };
  function flashBuy() { try { const b = hudEl && hudEl.querySelector('.ar-buy'); if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } } catch (e) { /* optional */ } }
  const MODS = { fruit: FRUIT, pairs: PAIRS, hop: HOP, bubble: BUBBLE, egg: EGGR, claw: CLAW };

  // the background buffer: g.BK buffer px per art px (SCENE_K; Pairs 3), so one buffer px = one fine px = a whole number of device px
  // (the Claw Machine paints in CSS px at its own fine pixel g.bgPx). Painters get u = one buffer px in their units.
  function paintBg() {
    const g = G, key = g.def.id + g.lv + W + 'x' + H + ':' + DPR + ':' + g.Z.toFixed(3) + ':' + (g.bgPx || 0) + ':' + (g.cols || 0) + ':' + (g.rows || 0) + ':' + hudBottom();
    if (key === bgKey) return; bgKey = key;
    const px = g.bgPx || g.Z / (g.BK || SK), unit = g.bgU || g.Z, s = unit / px, w = Math.ceil(W / px), h = Math.ceil(H / px);
    const lo = document.createElement('canvas'); lo.width = w; lo.height = h;
    const x = lo.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#bfe3b4'; x.fillRect(0, 0, w, h);
    x.setTransform(s, 0, 0, s, 0, 0);
    try { g.mod.bg(g, x, 1 / s); } catch (e) { console.error('arcade bg', e); }
    lo.cssPx = px; bgC = lo;
  }

  // =====================================================================
  // Running a game: countdown, play, the end stamp, results
  // =====================================================================
  function hudBottom() { return hudEl && !hudEl.hidden && hudEl.offsetHeight ? hudEl.offsetTop + hudEl.offsetHeight : 64; }
  function start(id, lv, force, now) {
    lv = clamp(lv | 0 || 1, 1, LEVELS);
    const claw = id === 'claw', def = claw ? CLAW_DEF : GBY[id] ? defOf(id, lv) : null;
    if (!def || (!force && !claw && !isLvOpen(id, lv))) return;
    if (!root) { try { PS.ui.go('arcade'); } catch (e) { /* ignore */ } }
    if (!root || !hubEl) return;
    let ran = false;
    const go = () => {
      if (ran) return; ran = true;
      try {
        G = { def, lv: claw ? 1 : lv, mod: MODS[id], st: claw ? 'play' : 'count', t: 0, countT: claw ? 0 : 4.2, endT: 0, score: 0, hearts: 0, maxHearts: 0, parts: [], floats: [], shake: 0, flash: 0, paused: false, stamp: null, goBanner: false, Z: 2, hero: makeHero() };
        G.mod.init(G);
        hubEl.hidden = true; playEl.hidden = false; resEl.hidden = true; quitEl.hidden = true; pauseEl.hidden = true;
        playEl.style.setProperty('--mode', def.col); playEl.style.setProperty('--mode-dk', def.dk);
        PS.ui.chrome(false); PS.ui.hold(!claw);
        buildHud(); sizeKey = ''; bgKey = ''; checkSize();
        music(def.track);
      } catch (e) { console.error('arcade start', e); G = null; showHub(); toast('Oops! That game could not start.'); }
    };
    snd('select');
    if (now) { go(); return; }
    try { if (PS.ui.wipe) { const p = PS.ui.wipe('arcade', go); if (p && p.then) p.then(go, go); setTimeout(go, 1500); return; } } catch (e) { /* optional */ }
    go();
  }
  function endGame(g, outcome) {
    if (g.st === 'end' || g.st === 'done') return;
    g.st = 'end'; g.endT = 0; g.outcome = outcome;
    const timeUp = outcome === 'time';
    g.stamp = { text: timeUp ? 'Time!' : 'All done!', col: timeUp ? '#ffcc44' : '#cbe8ff', t: 0 };
    snd(timeUp ? 'chime' : 'bump');
    g.dragging = false;
  }
  function update(dt) {
    const g = G;
    stepFx(g, dt); if (g.flash > 0) g.flash -= dt;
    if (g.stamp) g.stamp.t += dt;
    if (g.st === 'count') {
      const prev = Math.ceil(g.countT); g.countT -= dt; const now = Math.ceil(g.countT);
      if (now !== prev && now >= 1 && now <= 3) snd('countdown');
      if (g.countT <= 0) {
        g.st = 'play'; g.goT = 0.7; snd('go');
        try { if (PS.ui.fx && PS.ui.fx.banner) { PS.ui.fx.banner('GO!', { tone: 'go', ms: 650 }); g.goBanner = true; } } catch (e) { /* optional */ }
      }
      g.mod.update(g, 0);
      return;
    }
    if (g.goT > 0) g.goT -= dt;
    if (g.st === 'play') {
      g.t += dt;
      if (g.def.sec && g.t >= g.def.sec) endGame(g, 'time');
      if (g.def.sec && !g.fast && g.t > g.def.sec * 0.75) { g.fast = true; tempo(1.08); }
    }
    g.mod.update(g, dt);
    if (g.st === 'end' && (g.endT += dt) > 1.4) { g.st = 'done'; tempo(1); try { showResults(g); } catch (e) { console.error('arcade results', e); bail(); } }
  }
  const COUNT_TXT = ['0', '1', '2', '3'];
  function render() {
    const g = G;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = false;
    if (g.shake > 0) ctx.translate(Math.round(Math.sin(g.t * 70) * 4 * g.shake / 0.3), 0);
    if (bgC) ctx.drawImage(bgC, 0, 0, bgC.width * bgC.cssPx, bgC.height * bgC.cssPx); else { ctx.fillStyle = '#bfe3b4'; ctx.fillRect(0, 0, W, H); }
    g.mod.draw(g);
    drawFx(g);
    if (g.flash > 0) { ctx.fillStyle = '#fffadc'; ctx.globalAlpha = Math.min(1, g.flash / 0.25 * 0.5); ctx.fillRect(-8, 0, W + 16, H); ctx.globalAlpha = 1; }
    const cy = H * 0.45;
    if (g.st === 'count') {
      const n = Math.ceil(g.countT);
      if (n >= 4) {
        ctx.fillStyle = 'rgba(40,30,60,.28)'; ctx.fillRect(-8, 0, W + 16, H);
        bigText(g.def.name, W / 2, cy - 34 - (g.lv > 1 ? 22 : 0), Math.round(Math.min(48, W / 10)), '#ffcc44');
        if (g.lv > 1) bigText(g.lvLabel || (g.lvLabel = `Level ${g.lv}: ${g.def.sub || ''}`), W / 2, cy - 16, Math.round(Math.min(30, W / 15)), '#cbe8ff');
        note(g.def.how, W / 2, cy + 26);
      } else { const k = 1 - (g.countT - (n - 1)); bigText(COUNT_TXT[n] || '', W / 2, cy, Math.round(96 * (RM ? 1 : 1.3 - 0.3 * clamp(k * 3, 0, 1))), '#ffcc44'); note(g.def.how, W / 2, cy + 80); }
    } else if (g.goT > 0 && !g.goBanner) { ctx.globalAlpha = Math.min(1, g.goT * 2); bigText('GO!', W / 2, cy, 96, '#99e550'); ctx.globalAlpha = 1; }
    if (g.stamp) {
      const s = g.stamp, k = RM ? 1 : Math.min(1, s.t / 0.22), sc = 1 + 0.8 * (1 - k) * (1 - k);
      ctx.save(); ctx.translate(W / 2, cy); ctx.rotate(-0.08); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, 0.3 + k);
      ctx.font = F_STAMP; const w = s.w || (s.w = Math.ceil(ctx.measureText(s.text).width) + 48), h = 86;
      rr(-w / 2, -h / 2, w, h, 18); ctx.fillStyle = 'rgba(255,248,230,.94)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#cdb57e'; ctx.stroke();
      bigText(s.text, 0, 4, 58, s.col); ctx.restore();
    }
  }

  // ---------------- HUD ----------------
  const SVG_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.4 3.6 1.5-7.1L1.7 9.2l7.2-.8z"/></svg>';
  const SVG_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2s-8.6-5.3-9.9-10.6C1.2 6.9 3.6 3.6 7.1 3.6c2.1 0 3.8 1.2 4.9 2.9 1.1-1.7 2.8-2.9 4.9-2.9 3.5 0 5.9 3.3 5 7-1.3 5.3-9.9 10.6-9.9 10.6z"/></svg>';
  const SVG_LOCK = '<svg class="ar-lk" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#5b4630" stroke-width="2.6"/><rect x="3.5" y="10" width="17" height="12" rx="3.5" fill="#e3cf9d" stroke="#5b4630" stroke-width="2"/><circle cx="12" cy="15.5" r="1.8" fill="#5b4630"/></svg>';
  const SVG_LOCKOPEN = '<svg class="ar-lk" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 9.6-2" fill="none" stroke="#5b4630" stroke-width="2.6" stroke-linecap="round"/><rect x="3.5" y="10" width="17" height="12" rx="3.5" fill="#ffcc44" stroke="#5b4630" stroke-width="2"/><circle cx="12" cy="15.5" r="1.8" fill="#5b4630"/></svg>';
  let hudScore = null, hudBar = null, hudHearts = [], lastHud = '';
  function buildHud() {
    const g = G;
    if (g.def.claw) {
      hudEl.innerHTML = `<button class="ar-x" type="button" aria-label="Leave the Claw Machine">×</button>
        <div class="ar-sc ar-tok"><b><canvas data-tk class="px" data-nosnap></canvas><span>0</span></b><small>Tokens</small></div>
        <div class="ar-mid"></div>
        <button class="ar-buy" type="button" aria-label="Buy 1 Claw token for ${CLAW_PRICE} coins"><b>+1 token</b><small><canvas data-cn class="px" data-nosnap></canvas>${CLAW_PRICE}</small></button>`;
      hudScore = hudEl.querySelector('.ar-tok span'); hudBar = null; hudHearts = [];
      paintIc(hudEl.querySelector('canvas[data-tk]'), art('token')); paintIc(hudEl.querySelector('canvas[data-cn]'), coinIc());
      hudEl.querySelector('.ar-x').addEventListener('click', () => { unlockAudio(); snd('back'); leaveGame(); });
      hudEl.querySelector('.ar-buy').addEventListener('click', () => { unlockAudio(); buyToken(); });
      lastHud = ''; return;
    }
    hudEl.innerHTML = `<button class="ar-x" type="button" aria-label="Leave the game">×</button>
      <div class="ar-sc"><b>0</b><small>Score</small></div>
      <div class="ar-mid">${g.def.sec ? '<div class="ar-bar"><i></i></div>' : ''}</div>
      <div class="ar-hearts">${g.maxHearts ? SVG_HEART.repeat(g.maxHearts) : ''}</div>`;
    hudScore = hudEl.querySelector('.ar-sc b'); hudBar = hudEl.querySelector('.ar-bar i'); hudHearts = Array.from(hudEl.querySelectorAll('.ar-hearts svg'));
    hudEl.querySelector('.ar-x').addEventListener('click', () => { unlockAudio(); snd('pop'); askQuit(); });
    lastHud = '';
  }
  function updateHud() {
    if (G.def.claw) { const k = tokens() + ':' + (PS.S.coins | 0); if (k === lastHud) return; lastHud = k; hudScore.textContent = tokens(); const b = hudEl.querySelector('.ar-buy'); if (b) b.classList.toggle('poor', (PS.S.coins | 0) < CLAW_PRICE); return; }
    const g = G, left = g.def.sec ? clamp(1 - g.t / g.def.sec, 0, 1) : 0;
    const key = g.score + ':' + Math.round(left * 200) + ':' + g.hearts;
    if (key === lastHud) return; lastHud = key;
    hudScore.textContent = g.score;
    if (hudBar) { hudBar.style.width = (left * 100).toFixed(1) + '%'; hudBar.parentNode.classList.toggle('low', left < 0.2); }
    for (let i = 0; i < hudHearts.length; i++) hudHearts[i].classList.toggle('off', i >= g.hearts);
  }
  // a DOM canvas showing a sprite: its bitmap is the sprite's fine size, drawn 1:1 (PS.ui.fitCanvas); the stylesheet sets the CSS
  // size, or want (CSS px) picks the biggest whole number of device px per fine px that fits
  function paintIc(c, src, want) {
    if (!c || !src) return;
    try { if (PS.ui.fitCanvas) PS.ui.fitCanvas(c, src); } catch (e) { /* sized below */ }
    if (c.width !== src.width) c.width = src.width; if (c.height !== src.height) c.height = src.height;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, src.width, src.height);
    if (want) { const d = dprNow(), n = Math.max(1, Math.floor(want * d / Math.max(c.width, c.height))); c.style.width = (c.width * n / d) + 'px'; c.style.height = (c.height * n / d) + 'px'; }
  }
  // the cabinet pictures (and the padlock over a locked one) at a whole number of device px per fine px, centred in their screens
  function fitHub() {
    if (!hubEl || hubEl.hidden) return;
    const d = dprNow();
    hubEl.querySelectorAll('.ar-screen').forEach(sc => {
      const c = sc.querySelector('canvas[data-pre]'); if (!c || !c.width) return;
      const avail = sc.clientWidth - 10; if (avail < 40) return;
      const n = Math.max(1, Math.floor(avail * d / c.width));
      c.style.width = (c.width * n / d) + 'px'; c.style.height = (c.height * n / d) + 'px';
      const lk = sc.querySelector('canvas[data-padlock]'); if (lk && lk.width) { lk.style.width = (lk.width * n / d) + 'px'; lk.style.height = (lk.height * n / d) + 'px'; }
    });
  }
  function buyToken() {
    let ok = false; try { ok = ST.spend(CLAW_PRICE); } catch (e) { ok = false; }
    if (!ok) { snd('bump'); toast(`A token costs ${CLAW_PRICE} coins. Play games to earn coins and tokens!`); return false; }
    addTokens(1); save(); snd('coin'); lastHud = '';
    if (G && G.def.claw) floatText(G, '+1 token!', W - 90, hudBottom() + 30, '#f4ecff', 26);
    return true;
  }
  // ---------------- pause / leave ----------------
  function askQuit() { if (!G || G.st === 'done') return; G.paused = true; quitEl.hidden = false; pauseEl.hidden = true; releasePtr(true); }
  function pauseGame() { if (!G || G.st === 'done' || G.paused || G.def.claw) return; G.paused = true; pauseEl.hidden = false; releasePtr(true); }
  function resumeGame() { if (!G) return; G.paused = false; quitEl.hidden = true; pauseEl.hidden = true; }
  function leaveGame() { if (G && G.def.claw) CLAW.abort(G); quitEl.hidden = true; pauseEl.hidden = true; G = null; tempo(1); showHub(); }
  function bail() { G = null; tempo(1); showHub(); toast('Oops! That game had a hiccup.'); }

  // ---------------- results (the shell's .sv-res window) ----------------
  function starsByScore(def, s) { const S = def.stars; return s >= S[2] ? 3 : s >= S[1] ? 2 : s >= S[0] ? 1 : 0; }
  const resTile = (icon, value, label, cls) => `<div class="sv-res-tile${cls ? ' ' + cls : ''}">${icon ? `<canvas class="px" data-rt="${icon}" data-nosnap></canvas>` : ''}<b class="num">${value}</b><small>${label}</small></div>`;
  // the first 3 stars' prize on a level: prizeInfo() says what it WILL be (for the cabinet), givePrize() hands it over
  function prizeInfo(id, lv) {
    const L = PRIZES[id], P = L && L[clamp(lv | 0 || 1, 1, LEVELS) - 1]; if (!P) return null;
    try {
      const it = ST.items();
      if (P.t === 'hat') {
        let h = D.HATS && D.HATS[P.id] && !it.hats[P.id] ? P.id : null;
        if (!h) { const L2 = Object.keys(D.HATS || {}).filter(k => !it.hats[k] && D.HATS[k].tier <= 3); h = L2.length ? L2[(GAMES.findIndex(x => x.id === id) * 3 + 1) % L2.length] : null; }
        if (h) return { type: 'hat', id: h, n: 1, name: D.HATS[h].name };
        return { type: 'paint', id: 'rose', n: 2, name: `2 ${D.COLORS.rose || 'Rose'} paints` };
      }
      if (P.t === 'paint' && D.COLORS[P.id]) return { type: 'paint', id: P.id, n: 2, name: `2 ${D.COLORS[P.id]} paints` };
      if (P.t === 'pattern' && D.PATTERNS[P.id]) return { type: 'pattern', id: P.id, n: 2, name: `2 ${D.PATTERNS[P.id]} stickers` };
      if (P.t === 'egg' && D.EGGS[P.id]) return { type: 'egg', id: P.id, n: 1, name: D.EGGS[P.id].name };
    } catch (e) { /* optional */ }
    return null;
  }
  function givePrize(id, lv) {
    const P = prizeInfo(id, lv); if (!P) return null;
    try {
      const it = ST.items();
      if (P.type === 'hat') it.hats[P.id] = true;
      else if (P.type === 'paint') it.paints[P.id] = (it.paints[P.id] | 0) + P.n;
      else if (P.type === 'pattern') it.patterns[P.id] = (it.patterns[P.id] | 0) + P.n;
      else if (P.type === 'egg') ST.addEgg(P.id, `${GBY[id].name} Level ${lv}: 3 stars`);
      PS.emit('items');
      return P;
    } catch (e) { console.error('arcade prize', e); }
    return null;
  }
  const prizeIcon = P => { try { return !P ? null : P.type === 'hat' ? PX.item('hat', P.id) : P.type === 'paint' ? PX.item('paint', P.id) : P.type === 'pattern' ? PX.item('pattern', P.id) : eggIc(P.id); } catch (e) { return null; } };
  const prizeSub = P => (P.type === 'hat' ? `You won the ${P.name}! Any Sprout can wear it.` : P.type === 'egg' ? `You won a ${P.name}! It is waiting in the Garden.` : `You won ${P.name}! Use them on a Sprout's page.`);
  function showResults(g) {
    const def = g.def, lv = g.lv || 1, score = Math.round(g.score), stars = clamp(g.mod.starsOf(g) | 0, 0, 3);
    const r = recW(def.id, lv), prevBest = r.best, newBest = score > prevBest, prevStars = r.stars | 0;
    r.plays++; if (newBest) r.best = score; r.stars = Math.max(r.stars, stars); r.last = Date.now();
    const coins = 5 + stars * 5 + (lv - 1) * 5 + Math.floor((g.coinsGot || 0) / 3);
    let got = 0; try { got = ST.addCoins(coins, 'arcade'); } catch (e) { got = 0; }
    const A = arc(), today = dayKey(); let tok = Math.max(0, (r.stars | 0) - prevStars), daily = false;
    if (A.day !== today) { A.day = today; tok++; daily = true; }
    if (tok) addTokens(tok);
    let prize = null;
    if (stars === 3 && !r.prize) { prize = givePrize(def.id, lv); if (prize) r.prize = Date.now(); }
    save();
    const opened = unlockedNow();
    const lvOpened = lv < LEVELS && prevStars < 2 && r.stars >= 2 ? lv + 1 : 0;
    const win = stars > 0;
    const title = stars === 3 ? 'Amazing!' : stars === 2 ? 'Great job!' : stars === 1 ? 'Nice!' : 'Good try!';
    const tiles = [resTile(null, `<span data-count="${score}">${score}</span>`, newBest && prevBest > 0 ? 'New best!' : 'Score'),
      resTile(null, String(Math.max(score, prevBest)), 'Best'),
      resTile('coin', `<span data-coins="${got}">+${got}</span>`, 'Coins')];
    if (tok) tiles.push(resTile('token', '+' + tok, tok > 1 ? 'Claw tokens' : 'Claw token', 'ar-toktile'));
    if (prize) tiles.push(resTile('prize', prize.type === 'egg' ? 'Egg!' : prize.type === 'hat' ? 'Hat!' : 'Prize!', esc(prize.name), 'ar-prizetile'));
    const next = stars < 3 ? `Get <b>${def.stars[stars]}</b> for ${stars + 1} star${stars ? 's' : ''}!` : '';
    const extra = g.mod.extra ? g.mod.extra(g) : '';
    const canNext = lv < LEVELS && isLvOpen(def.id, lv + 1);
    resEl.className = 'ar-res sv-res';
    resEl.innerHTML = `<div class="sv-res-win ar-reswin" role="dialog" aria-label="${esc(def.name)} results">
      <div class="eyebrow">${esc(def.name)} &middot; Level ${lv}</div>
      <div class="sv-res-title${win ? '' : ' lose'}">${title}</div>
      <div class="sv-res-hero ar-bigstars">${[0, 1, 2].map(i => `<span class="ar-bstar${i < stars ? ' on' : ''}" style="animation-delay:${(0.35 + i * 0.32).toFixed(2)}s">${SVG_STAR}</span>`).join('')}</div>
      <div class="sv-res-tiles">${tiles.join('')}</div>
      ${extra ? `<p class="ar-note">${extra}</p>` : ''}
      ${next ? `<p class="ar-note">${next}</p>` : ''}
      ${tok ? `<p class="ar-note ar-toknote">${daily ? 'First game today! ' : ''}Use tokens at the <b>Claw Machine</b>.</p>` : ''}
      ${lvOpened ? `<p class="ar-note ar-opened">${SVG_LOCKOPEN}<span>Level <b>${lvOpened}</b> is open!</span></p>` : ''}
      ${opened.length ? `<p class="ar-note ar-opened">${SVG_LOCKOPEN}<span>New game: <b>${esc(opened.map(o => o.name).join(', '))}</b>!</span></p>` : ''}
      <div class="sv-res-btns${canNext && stars >= 2 ? ' three' : ''}">${canNext && stars >= 2 ? `<button class="btn go ar-next" type="button">Level ${lv + 1}</button>` : ''}<button class="btn${canNext && stars >= 2 ? '' : ' go'} ar-again" type="button">Play again</button><button class="btn ar-back" type="button">Back</button></div>
    </div>`;
    const icW = window.innerWidth <= 480 || window.innerHeight <= 900 ? 26 : 34;
    resEl.querySelectorAll('canvas[data-rt]').forEach(c => { try { const k = c.dataset.rt; paintIc(c, k === 'coin' ? coinIc() : k === 'token' ? art('token') : prizeIcon(prize), icW); } catch (e) { /* art optional */ } });
    resEl.hidden = false;
    resEl.querySelector('.ar-back').onclick = () => { unlockAudio(); snd('back'); G = null; showHub(); };
    resEl.querySelector('.ar-again').onclick = () => { unlockAudio(); G = null; resEl.hidden = true; start(def.id, lv); };
    const nb = resEl.querySelector('.ar-next'); if (nb) nb.onclick = () => { unlockAudio(); G = null; resEl.hidden = true; start(def.id, lv + 1); };
    PS.ui.chrome(true); PS.ui.hold(false);
    if (!jingle(win ? 'victory' : 'lose')) snd(win ? 'level' : 'coo');
    for (let i = 0; i < stars; i++) setTimeout(() => { if (resEl && !resEl.hidden) snd('star', { pitch: 1 + i * 0.12 }); }, 350 + i * 320);
    try {
      const cu = resEl.querySelector('[data-count]'); if (cu && PS.ui.fx && PS.ui.fx.countUp && score > 0) PS.ui.fx.countUp(cu, 0, score, 700);
      const cc = resEl.querySelector('[data-coins]'); if (cc && got > 0 && PS.ui.fx && PS.ui.fx.coinsFly) setTimeout(() => { try { if (cc.isConnected) PS.ui.fx.coinsFly(cc, 6); } catch (e) { /* optional */ } }, 500);
    } catch (e) { /* optional */ }
    if ((newBest && prevBest > 0) || prize) {
      setTimeout(() => {
        if (prize) celebrate({ kind: 'gift', eyebrow: `${def.name} · Level ${lv}`, title: '3 stars!', sub: prizeSub(prize), icon: prizeIcon(prize), jingle: 'item', button: 'Yay!' });
        else celebrate({ kind: 'star', eyebrow: `${def.name} · Level ${lv}`, title: 'New best!', sub: `${score} points!`, icon: gameIcon(def.id), button: 'Yay!' });
      }, 1500);
    }
    celebrateUnlocks(opened, 1550);
  }

  // ---------------- the hub: the Claw Machine, then a cabinet per game with its level buttons ----------------
  // The cabinet pictures: little 160 x 60 art-px scenes at k 2 (320 x 120 px), every sprite at its game scale (scale 1, the k 3 cards
  // and moon at 1.5, the k 4 claw and prizes at 2), so the whole picture shares the Sprouts' fine pixel. The hub shows them at a whole
  // number of device px per fine px (fitHub).
  const PRE_W = 160, PRE_H = 60;
  function previewOf(id) {
    return sprC('pre:' + id, () => {
      const K = 2, u = 1 / K, w = PRE_W, h = PRE_H, c = document.createElement('canvas'); c.width = w * K; c.height = h * K;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.setTransform(K, 0, 0, K, 0, 0);
      // a sprite with its bottom middle at (X, Y) (ax / ay override the anchor, in art px)
      const put = (s, X, Y, sc, flip, ax, ay) => { if (!s) return; sc = sc || 1; const W2 = aw(s) * sc, H2 = ah(s) * sc, A = (ax == null ? aw(s) / 2 : ax) * sc, B = (ay == null ? ah(s) : ay) * sc; x.save(); x.translate(fr(X, u), fr(Y, u)); if (flip) x.scale(-1, 1); x.drawImage(s, -A, -B, W2, H2); x.restore(); };
      const lawn = (y0, cols, seed) => { x.fillStyle = cols[0]; x.fillRect(0, y0, w, h - y0); x.fillStyle = cols[2]; x.fillRect(0, y0, w, u); tufts(x, 0, y0 + 2, w, h - y0 - 2, [cols[2], cols[3]], seed, Math.floor(w * (h - y0) / 10), u, ['#ffffff', '#f7b6c8', '#fff27a']); };
      if (id === 'fruit') {
        vgrad(x, 0, 0, w, 48, ['#a8dcf4', '#d0ecf2', '#eaf6e6']); bgPut(x, skyArt('cloud', 0), 104, 26, u);
        ridge(x, w, 50, i => 44 - Math.sin(i * 0.06) * 2.5, '#b6e0a0', '#c6eab2', u); lawn(49, ['#bfe3b4', '#cdeec3', '#a6d69a', '#e0f6d6'], 61);
        for (const tx of [2, 151]) { x.fillStyle = '#8f563b'; x.fillRect(tx, 6, 7, 44); x.fillStyle = '#b47a44'; x.fillRect(tx + u, 6, 1.5, 44); x.fillStyle = '#5c3a28'; x.fillRect(tx, 6, u, 44); x.fillRect(tx + 7 - u, 6, u, 44); }
        x.fillStyle = '#8f563b'; x.fillRect(0, 13, w, 2); x.fillStyle = '#b47a44'; x.fillRect(0, 13, w, u); x.fillStyle = '#663931'; x.fillRect(0, 15 - u, w, u);
        x.fillStyle = '#6abe30'; x.fillRect(0, 0, w, 9);
        for (let i = -4; i < w + 8; i += 7) fdisc(x, i, 9 - (i * 7 % 3), 4 + u, 4 + u, '#2a7458', u);
        for (let i = -4; i < w + 8; i += 7) fdisc(x, i, 9 - (i * 7 % 3), 4, 4, '#37946e', u);
        for (let i = 0; i < w; i += 11) fdisc(x, i + 5, 3 - (i % 3), 3, 3, '#99e550', u);
        put(critter('squirrel'), 122, 13, 1, true); put(art('acorn', 's'), 115, 7, 1, false, 4, 4.5);
        put(fruitIc('apple'), 44, 30); put(fruitIc('sunpear'), 92, 22); put(art('acorn'), 132, 36);
        put(PX.sprig(heroLook(), POSES.holdHappy), 68, 58); put(fruitIc('moonplum'), 68, 60); put(art('basket'), 68, 52, 1, false, 14, 0);
      } else if (id === 'pairs') {
        x.fillStyle = '#bfe3b4'; x.fillRect(0, 0, w, h); tufts(x, 0, 0, w, h, ['#a6d69a', '#d8f2cc'], 62, 600, u, ['#ffffff', '#fff27a', '#f7b6c8']);
        x.fillStyle = '#fff8e6'; x.fillRect(12, 2, 136, 56); x.fillStyle = 'rgba(154,106,208,.24)'; for (let i = 0; i < 136; i += 8) x.fillRect(12 + i, 2, 4, 56); for (let j = 0; j < 56; j += 8) x.fillRect(12, 2 + j, 136, 4);
        x.fillStyle = '#9a6ad0'; x.fillRect(12, 2, 136, u); x.fillRect(12, 58 - u, 136, u); x.fillRect(12, 2, u, 56); x.fillRect(148 - u, 2, u, 56);
        const card = (kind, cx) => put(art('card', kind), cx, 30, 1.5, false, 12, 15);
        card('face', 38); put(cardPic('s:rose', 'happy'), 38, 46.5); card('back', 80); card('face', 122); put(eggIc('golden'), 122, 45);
      } else if (id === 'hop') {
        vgrad(x, 0, 0, w, 46, ['#1e1a40', '#2c2658', '#473e7c']); nightSky(x, w, 40, 64, u); bgPut(x, skyArt('moon'), 140, 14, u);
        ridge(x, w, 46, i => 46 - (4 + Math.sin(i * 0.07) * 2.5), '#2a3a5a', '#34466a', u);
        vgrad(x, 0, 46, w, 14, ['#33508a', '#22386a']); x.fillStyle = '#6a88c0'; x.fillRect(0, 46, w, u);
        put(art('pad', 'l'), 0, 44, 1, false, 0, 0); put(art('pad', 'm'), 70, 44, 1, false, 0, 0); put(art('pad', 's'), 128, 44, 1, false, 0, 0);
        put(art('star'), 56, 30, 1, false, 5.5, 5.5); put(art('star'), 64, 22, 1, false, 5.5, 5.5); put(art('star'), 72, 30, 1, false, 5.5, 5.5);
        put(art('glow', '#fff6a0'), 108, 22, 1, false, 12, 12); put(art('moon'), 108, 22, 1.5, false, 6.5, 6.5);
        put(PX.sprig(heroLook(), POSES.jump), 24, 42);
      } else if (id === 'bubble') {
        vgrad(x, 0, 0, w, 50, ['#ffd8b8', '#f2cad4', '#d0c4ea']); bgPut(x, skyArt('sun'), 22, 14, u); bgPut(x, skyArt('cloud', 3), 120, 10, u);
        ridge(x, w, 50, i => 50 - (4 + Math.sin(i * 0.08) * 2), '#a8d49a', '#c0e4b0', u);
        vgrad(x, 0, 50, w, 10, ['#7cc0f0', '#5a9ed6']); x.fillStyle = '#cbe8ff'; x.fillRect(0, 50, w, u);
        const B = (i, an, X, Y) => { if (an) put(critter(an), X, Y + 8); put(art('bubble', i), X, Y, 1, false, 13, 13); };
        B(0, 'duck', 34, 34); B(1, 'bee', 70, 22); B(3, 'frog', 106, 34); B(6, '', 142, 22);
      } else if (id === 'egg') {
        x.fillStyle = '#b8e0a8'; x.fillRect(0, 0, w, h); x.fillStyle = '#c2e6b2'; x.fillRect(0, 8, w, 8); x.fillRect(0, 24, w, 8); x.fillRect(0, 40, w, 8);
        tufts(x, 12, 0, w - 24, h, ['#a6d69a', '#dcf2cc'], 65, 500, u, ['#ffffff', '#fff27a', '#f7b6c8']);
        for (const [a, b] of [[0, 12], [148, 160]]) { x.fillStyle = '#37946e'; x.fillRect(a, 0, b - a, h); const e = a === 0 ? b : a, d = a === 0 ? -1 : 1; for (let y = -4; y < h + 8; y += 8) { fdisc(x, e + d * 2, y, 4 + u, 4 + u, '#2a7458', u); fdisc(x, e + d * 2, y, 4, 4, '#6abe30', u); fdisc(x, e + d * 3.2, y - 1.4, 2.4, 2.2, '#99e550', u); } }
        put(art('puddle'), 128, 52, 1, false, 16, 7); put(art('puddle'), 34, 12, 1, false, 16, 7);
        const ry = 26, px0 = 58, px1 = 102;
        for (let i = 0; i <= 88; i++) { const k = i / 88, yy = fr(ry + 4 * k * (1 - k) * 3, u); x.fillStyle = '#fff8e6'; x.fillRect(px0 + i * u, yy, u, u); x.fillStyle = '#cdb57e'; x.fillRect(px0 + i * u, yy + u, u, u); }
        for (let i = 1; i < 6; i++) { const k = i / 6; put(art('flag', i % 2 ? 0 : 1), lerp(px0, px1, k), ry + 4 * k * (1 - k) * 3 + u, 1, false, 2.5, 0); }
        put(art('gate', 0), px0, 42, 1, false, 4.5, 23); put(art('gate', 0), px1, 42, 1, false, 4.5, 23);
        put(coinIc(), 80, 54, 1, false, 4.5, 4.5); put(eggIc('meadow'), 80, 40);
      } else if (id === 'claw') {
        vgrad(x, 0, 0, w, h, ['#f2faff', '#e4f4ff', '#d8ecfc']); x.fillStyle = '#fff0f6'; x.fillRect(0, 50, w, 10); x.fillStyle = '#f6d4e4'; x.fillRect(0, 50, w, u);
        x.fillStyle = INK; x.fillRect(0, 1, w, 3); x.fillStyle = '#c0c8d8'; x.fillRect(0, 1 + u, w, 2); x.fillStyle = '#f4f6fa'; x.fillRect(0, 1 + u, w, u);
        x.fillStyle = '#7a8296'; x.fillRect(100 - u, 4, 2 * u, 4); x.fillStyle = '#c0c8d8'; x.fillRect(100 - u, 4, u, 4);
        put(art('claw', 'open'), 100, 7, 2, false, 11, 0);
        put(prizeSpr({ type: 'plush', c: 'rose' }), 24, 59); put(art('coinbag'), 62, 58, 2); put(prizeSpr({ type: 'egg', k: 'golden' }), 140, 58);
        x.fillStyle = 'rgba(255,255,255,.22)'; for (let j = 0; j < h; j += u) { const k = j / h; x.fillRect(fr(lerp(0.66, 0.42, k) * w, u), j, fr(0.1 * w, u), u); }
      }
      c.k = K;
      return c;
    });
  }
  function lockedPreview(id) {
    return sprC('lockpre:' + id, () => {
      const s = previewOf(id); if (!s) return null;
      const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
      const x = c.getContext('2d'); x.drawImage(s, 0, 0, s.width, s.height); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(70,56,90,.8)'; x.fillRect(0, 0, c.width, c.height);
      return keepK(s, c);
    });
  }
  // ---------------- unlocking: the new games open one by one (2 stars on Level 1 of the game before opens the next) ----------------
  const isOpen = gm => !!gm && (!gm.after || (rec(gm.after).stars | 0) >= 2 || (rec(gm.id).plays | 0) > 0);
  const isLvOpen = (id, lv) => { const gm = GBY[id]; if (!gm || !isOpen(gm)) return false; lv = lv | 0 || 1; return lv <= 1 || (lv <= LEVELS && ((rec(id, lv - 1).stars | 0) >= 2 || (rec(id, lv).plays | 0) > 0)); };
  const topLevel = id => { let t = 1; for (let lv = 2; lv <= LEVELS; lv++) if (isLvOpen(id, lv)) t = lv; return t; };
  function unlockedNow() { // games that are open but were never celebrated: mark them (once, saved) and return them
    const out = [];
    for (const gm of GAMES) {
      if (!gm.after || !isOpen(gm)) continue;
      const A = arc(); if (!isObj(A.unl)) A.unl = {};
      if (A.unl[gm.id]) continue;
      A.unl[gm.id] = Date.now(); out.push(gm);
    }
    if (out.length) save();
    return out;
  }
  function celebrateUnlocks(list, delay) {
    if (!list || !list.length) return;
    setTimeout(() => { for (const gm of list) celebrate({ kind: 'unlock', eyebrow: 'New game unlocked!', title: gm.name, sub: gm.blurb, icon: previewOf(gm.id) || gameIcon(gm.id), jingle: 'unlock', button: 'Yay!' }); }, delay || 0);
  }
  function gameIcon(id) {
    return id === 'fruit' ? art('basket') : id === 'pairs' ? art('card', 'back') : id === 'hop' ? art('star') : id === 'bubble' ? art('bubble', 1) : id === 'egg' ? eggIc('meadow') : art('claw', 'open');
  }
  function shakeEl(b) { snd('bump'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
  function lvLockedTap(b) { shakeEl(b); toast(`Get 2 stars on Level ${(b.dataset.lv | 0) - 1} first!`); }
  function lockedTap(b) { const gm = GBY[b.dataset.g], prev = gm && GBY[gm.after]; shakeEl(b); if (prev) toast(`Get 2 stars in ${prev.name} first!`); }
  const starsRow = (n, cls) => `<span class="${cls}">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}">${SVG_STAR}</i>`).join('')}</span>`;
  function clawCab() {
    const n = tokens(), c = PS.S.arcade && PS.S.arcade.claw, wins = c && c.wins | 0;
    return `<button class="ar-cab ar-clawcab" type="button" data-g="claw" style="--c:${CLAW_DEF.col};--c2:${CLAW_DEF.c2};--cd:${CLAW_DEF.dk}" aria-label="Play the Claw Machine. You have ${n} Claw token${n === 1 ? '' : 's'}.">
      <span class="ar-awn">Claw Machine</span>
      <span class="ar-screen"><canvas data-pre="claw" data-nosnap></canvas></span>
      <span class="ar-info"><span class="ar-tokn"><canvas data-tok class="px" data-nosnap></canvas><b>${n}</b></span>
      <span class="ar-best">${n ? `Token${n === 1 ? '' : 's'} to play!` : 'Win stars to get tokens!'}${wins ? `<br><small>Prizes won: ${wins}</small>` : ''}</span><span class="ar-playb">Play</span></span>
    </button>`;
  }
  function renderHub() {
    if (PS.S && !(PS.S.arcade && PS.S.arcade.clawGift)) {
      const A = arc(); A.clawGift = 1; addTokens(3); save();
      setTimeout(() => celebrate({ kind: 'gift', eyebrow: 'Welcome to the Arcade!', title: 'The Claw Machine is here!', sub: 'Here are 3 free Claw tokens. Win more with new stars!', icon: art('token'), tiles: [{ icon: art('token'), value: '+3', label: 'Claw tokens' }], button: 'Yay!' }), 400);
    }
    let total = 0; GAMES.forEach(gm => { for (let lv = 1; lv <= LEVELS; lv++) total += rec(gm.id, lv).stars | 0; });
    const most = GAMES.length * 3 * LEVELS;
    let newest = null; GAMES.forEach(gm => { if (gm.after && isOpen(gm)) newest = gm; });
    if (newest && rec(newest.id).plays) newest = null;
    hubEl.innerHTML = `<div class="ar-head"><h1 class="ar-title">Arcade</h1><div class="ar-total" aria-label="${total} of ${most} stars">${SVG_STAR}<b>${total}</b><small>/${most}</small></div></div>
      <div class="ar-cabs">${clawCab()}${GAMES.map(gm => {
        if (!isOpen(gm)) {
          const prev = GBY[gm.after], ps = Math.min(2, rec(gm.after).stars | 0);
          return `<button class="ar-cab locked" type="button" data-g="${gm.id}" data-lock="1" aria-label="${esc(gm.name)} is locked. Get 2 stars in ${esc(prev.name)} to open it.">
          <span class="ar-awn">${esc(gm.name)}</span>
          <span class="ar-screen"><canvas data-pre="${gm.id}" data-dark="1" data-nosnap></canvas><canvas class="ar-lockic" data-padlock="1" data-nosnap></canvas></span>
          <span class="ar-info"><span class="ar-meter" aria-hidden="true">${[0, 1].map(i => `<i class="${i < ps ? 'on' : ''}">${SVG_STAR}</i>`).join('')}</span>
          <span class="ar-best ar-locktx">Get 2${SVG_STAR} in <b>${esc(prev.name)}</b> to open it</span></span>
        </button>`;
        }
        const hl = topLevel(gm.id), r = rec(gm.id, hl), P = prizeInfo(gm.id, hl);
        const lvs = [1, 2, 3].map(lv => {
          const open = isLvOpen(gm.id, lv), rl = rec(gm.id, lv);
          if (!open) return `<button class="ar-lv locked" type="button" data-g="${gm.id}" data-lv="${lv}" aria-label="Level ${lv} is locked. Get 2 stars on Level ${lv - 1}.">${SVG_LOCK}<small>Level ${lv}</small></button>`;
          return `<button class="ar-lv${lv === hl ? ' hl' : ''}${!rl.plays && lv > 1 ? ' new' : ''}" type="button" data-g="${gm.id}" data-lv="${lv}" aria-label="Play level ${lv}, ${rl.stars | 0} stars"><b>${lv}</b>${starsRow(rl.stars | 0, 'ar-lvst')}</button>`;
        }).join('');
        const prz = r.prize ? '<span class="ar-prz won">3★ prize won!</span>' : P ? `<span class="ar-prz"><span class="ar-przst">${SVG_STAR}${SVG_STAR}${SVG_STAR}</span> <b>${esc(P.name)}</b></span>` : '';
        return `<div class="ar-cab" data-g="${gm.id}" style="--c:${gm.col};--c2:${gm.c2};--cd:${gm.dk}">
          ${gm === newest ? '<span class="ar-new">NEW!</span>' : ''}
          <button class="ar-top" type="button" data-g="${gm.id}" data-lv="${hl}" aria-label="Play ${esc(gm.name)} level ${hl}"><span class="ar-awn">${esc(gm.name)}</span>
          <span class="ar-screen"><canvas data-pre="${gm.id}" data-nosnap></canvas><span class="ar-lvtag">Level ${hl}${hl > 1 && LV[gm.id] && LV[gm.id][hl - 1] ? ': ' + esc(LV[gm.id][hl - 1].sub) : ''}</span></span></button>
          <span class="ar-lvs">${lvs}</span>
          <span class="ar-info ar-info2"><span class="ar-best">${r.best ? `Best <b>${r.best}</b>` : esc(gm.blurb)}</span>${prz}</span>
        </div>`;
      }).join('')}</div>
      <p class="ar-foot">Coins every game. New stars win Claw tokens. 2 stars opens the next level and the next game!</p>`;
    hubEl.querySelectorAll('canvas[data-pre]').forEach(c => { paintIc(c, c.dataset.dark ? lockedPreview(c.dataset.pre) : previewOf(c.dataset.pre)); });
    hubEl.querySelectorAll('canvas[data-padlock]').forEach(c => { paintIc(c, art('padlock')); });
    hubEl.querySelectorAll('canvas[data-tok]').forEach(c => { paintIc(c, art('token')); });
    fitHub(); requestAnimationFrame(fitHub);
    hubEl.querySelectorAll('button.ar-cab').forEach(b => { b.onclick = () => { unlockAudio(); if (b.dataset.lock) { lockedTap(b); return; } start(b.dataset.g, 1); }; });
    hubEl.querySelectorAll('.ar-top, .ar-lv').forEach(b => { b.onclick = () => { unlockAudio(); if (b.classList.contains('locked')) { lvLockedTap(b); return; } start(b.dataset.g, b.dataset.lv | 0); }; });
  }
  function showHub() {
    releasePtr(true);
    playEl.hidden = true; resEl.hidden = true; quitEl.hidden = true; pauseEl.hidden = true; hubEl.hidden = false;
    PS.ui.chrome(true); PS.ui.hold(false);
    renderHub(); hubMusic();
    celebrateUnlocks(unlockedNow(), 350);
  }

  // ---------------- input ----------------
  const PT = { x: 0, y: 0 };
  function pt(e) { const r = cv.getBoundingClientRect(); PT.x = e.clientX - r.left; PT.y = e.clientY - r.top; return PT; }
  function releasePtr(cancel) { if (ptrId != null && G) { try { G.mod.up(G, PT.x, PT.y, cancel); } catch (e) { /* ignore */ } } ptrId = null; }
  function onDown(e) {
    if (!G || G.paused || G.st === 'done') return;
    unlockAudio(); e.preventDefault();
    if (e.isPrimary && ptrId != null) releasePtr(true); // a new first touch clears a touch the iPad lost
    const p = pt(e);
    if (G.st !== 'play' && G.st !== 'count') return;
    if (G.st === 'count' && !G.def.countIn) return;
    if (ptrId == null) ptrId = e.pointerId;
    else if (!G.def.multi) return;
    G.mod.down(G, p.x, p.y);
    if (G.def.multi) ptrId = null;
  }
  function onMove(e) { if (!G || e.pointerId !== ptrId) return; const p = pt(e); G.mod.move(G, p.x, p.y); }
  function onUp(e, cancel) { if (!G || e.pointerId !== ptrId) return; const p = pt(e); ptrId = null; if (G.st === 'play' || G.st === 'count') G.mod.up(G, p.x, p.y, cancel); }

  // ---------------- size ----------------
  function checkSize() {
    if (!G || !cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const key = Math.round(r.width) + 'x' + Math.round(r.height) + ':' + dpr + ':' + hudBottom();
    if (key === sizeKey || r.width < 10 || r.height < 10) return;
    sizeKey = key; W = r.width; H = r.height; DPR = dpr;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    G.mod.layout(G); paintBg();
  }

  // ---------------- CSS ----------------
  const CSS = `
  #scr-arcade{--mode:#9a6ad0;--mode-dk:#5e3a94;--bg1:#ffe2c4;--bg2:#d8c8f0}
  .ar-root{position:absolute;inset:0;overflow:hidden}
  .ar-hub{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:14px 14px 30px;
    background:radial-gradient(rgba(255,255,255,.4) 20%,transparent 23%) 0 0/22px 22px,linear-gradient(180deg,var(--bg1),var(--bg2))}
  .ar-head{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 16px}
  .ar-title{margin:0;font:700 42px/1 var(--f-px);color:#fff8e6;letter-spacing:.01em;text-shadow:2px 0 #5b4630,-2px 0 #5b4630,0 2px #5b4630,0 -2px #5b4630,2px 2px #5b4630,-2px 2px #5b4630,2px -2px #5b4630,-2px -2px #5b4630,0 5px rgba(91,70,48,.35)}
  .ar-total{display:flex;align-items:center;gap:4px;background:var(--panel);border:2px solid var(--line);border-bottom-width:4px;border-radius:999px;padding:4px 14px 4px 8px;color:var(--ink);font:700 21px/1 var(--f-ui)}
  .ar-total svg{width:26px;height:26px;fill:#ffcc44;stroke:#8a5a2a;stroke-width:1.6}
  .ar-total small{font-size:15px;color:var(--ink-soft)}
  .ar-cabs{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;width:100%;max-width:520px;margin:0 auto}
  @media (min-width:640px){.ar-cabs{grid-template-columns:repeat(2,minmax(0,1fr));max-width:900px}}
  @media (min-width:1000px) and (min-aspect-ratio:1/1){.ar-cabs{grid-template-columns:repeat(3,minmax(0,1fr));max-width:1180px}}
  .ar-cab{appearance:none;-webkit-appearance:none;position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:9px;align-content:start;width:100%;min-width:0;text-align:center;color:var(--ink);font:inherit;
    background:var(--panel);border:2px solid var(--line);border-bottom:6px solid var(--edge);border-radius:22px;padding:0 10px 12px;box-shadow:0 8px 18px rgba(90,60,110,.18)}
  button.ar-cab{cursor:pointer}
  button.ar-cab:active{transform:translateY(3px);border-bottom-width:3px;margin-top:3px}
  .ar-cab:focus-visible,.ar-top:focus-visible,.ar-lv:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
  .ar-awn{position:relative;display:block;margin:0 -10px 6px;padding:11px 10px 9px;border-radius:20px 20px 0 0;background:repeating-linear-gradient(90deg,var(--c) 0 24px,var(--c2) 24px 48px);
    font:700 25px/1.05 var(--f-px);color:#fff;letter-spacing:.01em;text-shadow:2px 0 var(--cd),-2px 0 var(--cd),0 2px var(--cd),0 -2px var(--cd),2px 2px var(--cd),-2px 2px var(--cd),2px -2px var(--cd),-2px -2px var(--cd)}
  .ar-awn::after{content:"";position:absolute;left:0;right:0;bottom:-9px;height:10px;background:radial-gradient(circle at 12px 0,var(--c) 11px,transparent 12px) 0 0/48px 10px repeat-x,radial-gradient(circle at 36px 0,var(--c2) 11px,transparent 12px) 0 0/48px 10px repeat-x}
  .ar-top{appearance:none;-webkit-appearance:none;display:grid;grid-template-columns:minmax(0,1fr);gap:9px;width:100%;min-width:0;background:none;border:0;padding:0;margin:0;color:inherit;font:inherit;text-align:center;cursor:pointer}
  .ar-top:active .ar-screen{transform:translateY(2px)}
  .ar-screen{position:relative;display:block;background:#d9a066;border:3px solid #8f563b;border-radius:14px;padding:5px;box-shadow:inset 0 2px 0 #eec39a}
  .ar-screen canvas{display:block;margin:0 auto;max-width:100%;image-rendering:pixelated;border-radius:6px}
  .ar-screen canvas.ar-lockic{position:absolute;left:50%;top:50%;margin:0;max-width:none;border-radius:0;transform:translate(-50%,-50%);filter:drop-shadow(0 3px 0 rgba(0,0,0,.3))}
  .ar-lvtag{position:absolute;left:10px;bottom:10px;background:rgba(255,248,230,.95);color:var(--ink);font:600 14px/1 var(--f-ui);padding:5px 9px;border-radius:999px;border:2px solid var(--line);max-width:calc(100% - 20px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ar-lvs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .ar-lv{appearance:none;-webkit-appearance:none;position:relative;min-height:62px;min-width:0;display:grid;justify-items:center;align-content:center;gap:3px;padding:5px 2px 4px;background:var(--slot);color:var(--ink);border:2px solid var(--line);border-bottom:5px solid var(--edge);border-radius:14px;font:700 27px/1 var(--f-ui);cursor:pointer}
  .ar-lv:active{transform:translateY(2px);border-bottom-width:3px}
  .ar-lv.hl{background:var(--sun);border-color:var(--sun-edge);color:#4a3210}
  .ar-lv.locked{background:#ece4d4;color:var(--ink-soft);cursor:default}
  .ar-lv.locked small{font:600 12px/1 var(--f-ui)}
  .ar-lv.locked .ar-lk{width:24px;height:24px}
  .ar-lv.shake,.ar-cab.shake{animation:arShake .4s}
  .ar-lv.new::after{content:"NEW";position:absolute;top:-10px;right:-6px;background:var(--berry);color:#fff;font:700 12px/1 var(--f-px);padding:4px 5px 3px;border:2px solid var(--berry-edge);border-radius:8px;transform:rotate(8deg)}
  .ar-lvst{display:flex;gap:0}
  .ar-lvst i{display:block;width:16px;height:16px}
  .ar-lvst svg{width:100%;height:100%;fill:rgba(91,70,48,.16);stroke:#8a5a2a;stroke-width:1.6}
  .ar-lvst i.on svg{fill:#ffcc44}
  .ar-lv.hl .ar-lvst svg{fill:rgba(255,255,255,.55)}
  .ar-lv.hl .ar-lvst i.on svg{fill:#df7126}
  .ar-info{display:flex;align-items:center;gap:8px}
  .ar-info2{flex-wrap:wrap;gap:2px 10px}
  .ar-best{flex:1;min-width:0;font:600 16px/1.2 var(--f-ui);color:var(--ink);text-align:left}
  .ar-best b{font-size:20px}
  .ar-best small{font-size:13px;color:var(--ink-soft)}
  .ar-prz{flex:0 1 auto;min-width:0;display:inline-flex;align-items:center;gap:4px;text-align:right;font:600 14px/1.2 var(--f-ui);color:var(--ink-soft)}
  .ar-prz b{color:#a8306a}
  .ar-prz.won{color:var(--accent)}
  .ar-przst{display:inline-flex}
  .ar-przst svg{width:14px;height:14px;fill:#ffcc44;stroke:#8a5a2a;stroke-width:2}
  .ar-playb{min-height:50px;min-width:88px;display:grid;place-items:center;background:var(--accent);color:#fff;border:2px solid var(--accent-edge);border-bottom-width:5px;border-radius:14px;font:700 22px/1 var(--f-px);padding:4px 12px 2px}
  .ar-tokn{display:flex;align-items:center;gap:5px;background:var(--slot);border:2px solid var(--line);border-radius:999px;padding:3px 12px 3px 5px}
  .ar-tokn canvas{width:26px;height:26px;image-rendering:pixelated}
  .ar-tokn b{font:700 24px/1 var(--f-ui);color:var(--ink)}
  .ar-cab.locked .ar-awn{background:repeating-linear-gradient(90deg,#b8aec8 0 24px,#cac2d8 24px 48px);text-shadow:2px 0 #7a7090,-2px 0 #7a7090,0 2px #7a7090,0 -2px #7a7090}
  .ar-cab.locked .ar-awn::after{background:radial-gradient(circle at 12px 0,#b8aec8 11px,transparent 12px) 0 0/48px 10px repeat-x,radial-gradient(circle at 36px 0,#cac2d8 11px,transparent 12px) 0 0/48px 10px repeat-x}
  .ar-cab.locked{cursor:default}
  .ar-meter{display:flex;gap:1px;flex:0 0 auto;background:var(--slot);border:2px solid var(--line);border-radius:999px;padding:3px 7px}
  .ar-meter i{display:block;width:24px;height:24px}
  .ar-meter svg{width:100%;height:100%;fill:rgba(91,70,48,.14);stroke:#8a5a2a;stroke-width:1.6}
  .ar-meter i.on svg{fill:#ffcc44}
  .ar-locktx{font-size:15px;line-height:1.25}
  .ar-locktx svg{display:inline-block;width:17px;height:17px;vertical-align:-3px;margin:0 1px;fill:#ffcc44;stroke:#8a5a2a;stroke-width:2}
  .ar-locktx b{font-size:inherit;color:#7a4aa8}
  .ar-new{position:absolute;top:-11px;right:-8px;z-index:2;background:var(--berry);color:#fff;font:700 20px/1 var(--f-px);padding:7px 10px 5px;border:2px solid var(--berry-edge);border-radius:10px;transform:rotate(8deg);box-shadow:0 3px 0 rgba(0,0,0,.2);animation:arNew 1.4s ease-in-out infinite}
  .ar-clawcab .ar-info{justify-content:space-between}
  @media (min-width:640px){.ar-clawcab{grid-column:1/-1;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:center;column-gap:16px}.ar-clawcab .ar-awn{grid-column:1/-1}.ar-clawcab .ar-info{flex-wrap:wrap;justify-content:flex-start}}
  @media (min-width:1000px) and (min-aspect-ratio:1/1){.ar-clawcab{grid-column:auto;grid-template-columns:minmax(0,1fr)}}
  .ar-opened{display:flex;align-items:center;justify-content:center;gap:6px}
  .ar-lk{width:24px;height:24px;flex:0 0 auto}
  @keyframes arShake{0%,100%{transform:none}20%{transform:translateX(-7px) rotate(-1.5deg)}40%{transform:translateX(6px) rotate(1.5deg)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
  @keyframes arNew{0%,100%{transform:rotate(8deg) scale(1)}50%{transform:rotate(4deg) scale(1.1)}}
  .ar-foot{margin:18px auto 0;max-width:520px;text-align:center;color:var(--ink);font:600 15px/1.35 var(--f-ui);background:rgba(255,248,230,.75);border-radius:14px;padding:8px 12px}
  .ar-play{position:absolute;inset:0;background:#bfe3b4}
  .ar-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
  .ar-hud{position:absolute;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:8px;pointer-events:none;z-index:2}
  .ar-hud>*{pointer-events:auto}
  .ar-x{width:50px;height:50px;flex:0 0 auto;border-radius:14px;border:2px solid var(--line);border-bottom:5px solid var(--edge);background:var(--panel);color:var(--ink);font:600 32px/1 var(--f-ui);padding:0;cursor:pointer}
  .ar-x:active{transform:translateY(2px);border-bottom-width:3px}
  .ar-sc{min-width:86px;display:grid;justify-items:center;background:rgba(255,248,230,.96);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:3px 12px 2px}
  .ar-sc b{font:700 25px/1 var(--f-ui);color:var(--ink);font-variant-numeric:tabular-nums}
  .ar-sc small{font:600 11px/1.15 var(--f-ui);color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em}
  .ar-mid{flex:1;min-width:0}
  .ar-bar{height:18px;border:2px solid var(--edge);border-radius:10px;background:rgba(255,248,230,.9);overflow:hidden}
  .ar-bar i{display:block;height:100%;width:100%;background:linear-gradient(#b2ec7a,#4fae3a);transition:width .25s linear}
  .ar-bar.low i{background:linear-gradient(#ffb0a0,#e5535f)}
  .ar-hearts{display:flex;gap:2px}
  .ar-hearts svg{width:32px;height:32px;fill:#e5535f;stroke:#8a2a36;stroke-width:1.6;transition:transform .2s;filter:drop-shadow(0 2px 0 rgba(0,0,0,.18))}
  .ar-hearts svg.off{fill:rgba(255,248,230,.75);stroke:#b8a888;transform:scale(.82)}
  .ar-tok b{display:flex;align-items:center;gap:4px}
  .ar-tok canvas{width:26px;height:26px;image-rendering:pixelated}
  .ar-buy{appearance:none;-webkit-appearance:none;flex:0 0 auto;min-height:54px;display:grid;justify-items:center;align-content:center;gap:2px;padding:4px 14px;background:#b88af4;color:#fff;border:2px solid #7a52b8;border-bottom-width:5px;border-radius:14px;cursor:pointer;text-shadow:0 1px 0 #5a3a90}
  .ar-buy b{font:700 19px/1 var(--f-px)}
  .ar-buy small{display:flex;align-items:center;gap:3px;font:600 14px/1 var(--f-ui)}
  .ar-buy small canvas{width:18px;height:18px;image-rendering:pixelated}
  .ar-buy.poor{background:#b0a8c0;border-color:#8a8098}
  .ar-buy.flash{animation:arShake .45s,arGlow .9s}
  @keyframes arGlow{0%,100%{box-shadow:none}40%{box-shadow:0 0 0 6px rgba(255,204,68,.85)}}
  .ar-ov{z-index:5}
  .ar-ov .card{text-align:center}
  .ar-ov h1{margin:4px 0 14px}
  .ar-ov .ar-btns{display:grid;grid-template-columns:1fr 1.3fr;gap:10px}
  .ar-ov .btn{min-height:54px;font-size:18px}
  html body .ar-res.sv-res[hidden]{display:none!important}
  :where(.ar-res.sv-res){position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(40,28,60,.55)}
  :where(.ar-res .sv-res-win){width:100%;max-width:440px;max-height:100%;overflow-y:auto;background:var(--panel);border:2px solid var(--line);border-bottom:6px solid var(--edge);border-radius:24px;padding:16px 16px 14px;text-align:center;box-shadow:0 12px 40px rgba(60,44,24,.3)}
  :where(.ar-res .sv-res-title){font:700 44px/1.05 var(--f-px);color:#ffcc44;margin:2px 0 6px;text-shadow:2px 0 #5b4630,-2px 0 #5b4630,0 2px #5b4630,0 -2px #5b4630,2px 2px #5b4630,-2px 2px #5b4630,2px -2px #5b4630,-2px -2px #5b4630}
  :where(.ar-res .sv-res-title.lose){color:#cbe8ff}
  :where(.ar-res .sv-res-hero){display:flex;align-items:flex-end;justify-content:center;gap:8px;margin:0 auto 8px}
  :where(.ar-res .sv-res-tiles){display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:8px 0 4px}
  :where(.ar-res .sv-res-tile){flex:1 1 0;min-width:84px;max-width:170px;display:grid;justify-items:center;align-content:start;gap:3px;background:var(--slot);border:2px solid var(--line);border-radius:14px;padding:7px 6px 6px}
  :where(.ar-res .sv-res-tile b){font:700 26px/1 var(--f-ui);color:var(--ink)}
  :where(.ar-res .sv-res-tile small){font:600 13px/1.2 var(--f-ui);color:var(--ink-soft)}
  :where(.ar-res .sv-res-btns){display:flex;gap:10px;margin-top:14px}
  :where(.ar-res .sv-res-btns .btn){flex:1 1 0;min-height:54px;font-size:18px}
  :where(.ar-res .sv-res-btns .btn.go){flex-grow:1.5}
  html body .ar-reswin .eyebrow{text-align:center;font:600 14px/1.2 var(--f-ui);letter-spacing:.04em;text-transform:uppercase;color:#c0612a}
  html body .ar-reswin .sv-res-tile canvas{max-width:none;image-rendering:pixelated}
  html body .ar-reswin .sv-res-btns .btn{white-space:nowrap;min-width:0}
  html body .ar-bigstars{gap:6px;min-height:96px}
  html body .ar-bigstars::before{display:none}
  .ar-bstar{display:block;width:76px;height:76px}
  .ar-bstar:nth-child(2){width:92px;height:92px;margin-bottom:10px}
  .ar-bstar svg{width:100%;height:100%;fill:rgba(91,70,48,.14);stroke:#8a5a2a;stroke-width:1.4}
  .ar-bstar.on svg{fill:#ffcc44;animation:arStar .45s cubic-bezier(.3,1.6,.5,1) both;animation-delay:inherit}
  html body .ar-reswin .ar-prizetile{background:#fff6cc}
  html body .ar-reswin .ar-toktile{background:#f0e6ff}
  .ar-note{margin:8px 0 0;font:500 16px/1.35 var(--f-ui);color:var(--ink);text-align:center}
  .ar-note b{color:var(--accent-edge)}
  @keyframes arStar{0%{transform:scale(.2) rotate(-40deg);fill:rgba(91,70,48,.14)}60%{fill:#ffcc44}100%{transform:none;fill:#ffcc44}}
  @media (max-width:480px),(max-height:900px){html body .ar-reswin{padding:10px 10px 10px}html body .ar-reswin .sv-res-title{font-size:34px;margin:0 0 2px}html body .ar-bigstars{min-height:66px;margin-bottom:2px}
    .ar-bstar{width:54px;height:54px}.ar-bstar:nth-child(2){width:66px;height:66px;margin-bottom:6px}
    html body .ar-reswin .sv-res-tiles{flex-wrap:nowrap;gap:6px;margin:4px 0 2px}html body .ar-reswin .sv-res-tile{min-width:0;padding:5px 3px 4px}html body .ar-reswin .sv-res-tile b{font-size:20px}html body .ar-reswin .sv-res-tile small{font-size:11.5px}
    .ar-note{font-size:14px;margin-top:4px;line-height:1.25}
    html body .ar-reswin .sv-res-btns{margin-top:10px;gap:6px}html body .ar-reswin .sv-res-btns .btn{min-height:50px;font-size:16px;padding:6px 6px;white-space:nowrap}}
  @media (max-width:520px){html body .ar-reswin .sv-res-btns.three{flex-wrap:wrap}html body .ar-reswin .sv-res-btns.three .ar-next{flex:1 1 100%}}
  @media (max-width:420px){.ar-lv{min-height:58px;font-size:23px}.ar-lvst i{width:14px;height:14px}.ar-prz{text-align:left;flex-basis:100%}.ar-title{font-size:36px}.ar-awn{font-size:23px}}
  @media (prefers-reduced-motion: reduce){.ar-bstar.on svg{animation:none}.ar-bar i{transition:none}button.ar-cab:active,.ar-lv:active{transform:none}.ar-new,.ar-cab.shake,.ar-lv.shake,.ar-buy.flash{animation:none}}
  `;
  function injectCSS() {
    if (document.getElementById('ar-style')) return;
    const st = document.createElement('style'); st.id = 'ar-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  // ---------------- scene ----------------
  function mount(el) {
    injectCSS();
    root = el;
    root.innerHTML = `<div class="ar-root">
      <div class="ar-hub"></div>
      <div class="ar-play" hidden>
        <canvas class="ar-cv" aria-label="The game"></canvas>
        <div class="ar-hud"></div>
        <div class="overlay ar-ov ar-quit" hidden><div class="card"><h1>Leave the game?</h1><div class="ar-btns"><button class="btn ar-leave" type="button">Leave</button><button class="btn go ar-stay" type="button">Keep playing</button></div></div></div>
        <div class="overlay ar-ov ar-pause" hidden><div class="card"><h1>Paused</h1><button class="btn go wide ar-resume" type="button">Keep playing</button></div></div>
        <div class="ar-res" hidden></div>
      </div></div>`;
    const q = s => root.querySelector(s);
    modalRoot = document.getElementById('modalRoot');
    hubEl = q('.ar-hub'); playEl = q('.ar-play'); cv = q('.ar-cv'); ctx = cv.getContext('2d'); hudEl = q('.ar-hud'); resEl = q('.ar-res'); quitEl = q('.ar-quit'); pauseEl = q('.ar-pause');
    q('.ar-leave').addEventListener('click', () => { snd('back'); leaveGame(); });
    q('.ar-stay').addEventListener('click', () => { unlockAudio(); snd('pop'); resumeGame(); });
    q('.ar-resume').addEventListener('click', () => { unlockAudio(); snd('pop'); resumeGame(); });
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', e => onUp(e, false));
    window.addEventListener('pointercancel', e => onUp(e, true));
    for (const ev of ['gesturestart', 'gesturechange']) cv.addEventListener(ev, e => e.preventDefault());
    cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden && visible && G && G.st !== 'done') pauseGame(); });
    let hubFit = 0;
    window.addEventListener('resize', () => { sizeT = 0; if (visible && !G && !hubFit) hubFit = requestAnimationFrame(() => { hubFit = 0; fitHub(); }); });
    try { PS.on('reset', () => { if (G) { G = null; if (visible) showHub(); } }); } catch (e) { /* optional */ }
  }
  function show() { visible = true; if (!G) showHub(); }
  function hide() {
    visible = false;
    if (G) { if (G.def.claw) CLAW.abort(G); G = null; releasePtr(true); tempo(1); }
    if (playEl) { playEl.hidden = true; hubEl.hidden = false; }
    PS.ui.chrome(true); PS.ui.hold(false);
  }
  function frame(dt) {
    if (!visible || !G || !cv) return;
    try {
      if ((sizeT -= dt) <= 0) { sizeT = 0.25; checkSize(); }
      if (!W) return;
      const busy = modalRoot && modalRoot.firstElementChild; // (a pop-up on top: the game waits under it)
      if (!G.paused && !busy && G.st !== 'done') update(Math.min(dt, 0.05));
      if (!G) return;
      render();
      if ((uiT -= dt) <= 0) { uiT = 0.1; updateHud(); }
      errRun = 0;
    } catch (e) {
      console.error(e);
      if (++errRun > 15) { errRun = 0; bail(); }
    }
  }
  PS.scenes = PS.scenes || {};
  PS.scenes.arcade = { mount, show, hide, frame };
  // the Arcade lays out for any screen size: let it use the whole width on an iPad
  try { document.documentElement.classList.add('sv-wide-arcade'); } catch (e) { /* (Node check: no DOM) */ }
  // test hooks (browser console): __arcade.start(id, lv) (lv 1-3; 'claw' too), __arcade.game, __arcade.end(), __arcade.isOpen(id, lv),
  // __arcade.sim(sec, bot) runs the game loop off-screen (bot(g, dt) plays) until the end stamp: { score, stars, t, st, hearts }
  window.__arcade = { start: (id, lv) => start(id, lv || 1, true), startNow: (id, lv) => start(id, lv || 1, true, true), leave: () => leaveGame(), get game() { return G; }, end: () => { if (G && !G.def.claw) endGame(G, 'time'); }, GAMES, MODS, LV, PRIZES,
    isOpen: (id, lv) => (id === 'claw' ? true : lv ? isLvOpen(id, lv) : isOpen(GBY[id])), hub: () => { if (visible && !G) renderHub(); },
    get tokens() { return tokens(); }, addTokens: n => { const v = addTokens(n); save(); return v; }, buyToken, prizeInfo, clawRec, CLAW_PRICE,
    sim(sec, bot) { const g = G; if (!g || !W) return null; const dt = 1 / 40; for (let i = 0; i < sec * 40 && G === g && g.st !== 'end' && g.st !== 'done'; i++) { if (bot && g.st === 'play') bot(g, dt); update(dt); } return { score: g.score, stars: g.mod.starsOf(g), t: +g.t.toFixed(1), st: g.st, hearts: g.hearts }; },
    get size() { return { W, H }; } };
})();
