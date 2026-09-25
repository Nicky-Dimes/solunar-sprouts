// garden.js — Solunar Sprouts Garden screen.
// Four areas (Meadow, Beach, Moonlit Grove, Candy Isle), each with a body of water on the right. Eggs to hatch, Sprouts with a
// little AI (wander, swim, eat, greet), critters to catch, coin/XP drops, a fruit tree, a pouch + fruit tray, and travel
// between areas by swimming. One low-res world buffer is drawn per frame and scaled up with no smoothing; floaters are drawn
// crisp at display resolution on top.
(function () {
  'use strict';
  const D = PS.D, ST = PS.state;
  const { clamp, rand, pick } = PS.util;
  const lerp = (a, b, k) => a + (b - a) * k;
  const INK = '#222034';
  const AREA_IDS = D.AREA_ORDER;
  const snd = n => { try { PX.Sound.play(n); } catch (e) { /* audio optional */ } };
  const buzz = ms => { try { PX.buzz(ms); } catch (e) { /* optional */ } };
  const seen = k => !!(PS.S.seen && PS.S.seen['g:' + k]);
  const markSeen = k => { if (!seen(k)) { PS.S.seen['g:' + k] = true; PS.save(); } };
  const areaName = a => D.AREAS[a].name;
  const toArea = a => (a === 'candy' ? '' : 'the ') + areaName(a);

  // ---------------- Tuning (garden feel only; growth numbers come from D.GROWTH) ----------------
  const TUNE = {
    holdDelay: 0.28, rubStep: 10, walkSpeed: 9, walkPerRunLv: 0.2, gravity: 420, flutterFall: 16, flutterAt: 8, holdLift: 16,
    drainDay: 0.2, drainNight: 0.38, sleepAt: 15, regenDay: 9, regenNight: 6, happyDecay: 0.012,
    maxCritters: 2, maxDrops: 3, dropLife: 40, flutterXpMax: 3, flutterCooldown: 8, xpFlushSec: 3,
  };
  const PART_NAMES = { wings: 'wings', ears: 'long ears', fins: 'fins', horns: 'horns', tail: 'a tail', shell: 'a shell', antennae: 'antennae',
    claws: 'claws', spikes: 'spikes', fluff: 'fluff', tentacles: 'tentacles', spots: 'star spots', batwings: 'bat wings', fairywings: 'fairy wings',
    unihorn: 'a unicorn horn', multitail: 'extra tails', flamewings: 'flame wings', dragonwings: 'dragon wings' };

  // ---------------- Area themes ----------------
  // props: [kind, x as share of width, y as share of the walkable span]. Night is an overlay colour (rgb + max alpha).
  const TH = {
    meadow: {
      sky: ['#6cc3f2', '#86cff5', '#a4dcf8', '#c4e9fb'], skyN: ['#1a1d48', '#222a5a', '#2c366c', '#3a4580'],
      far: ['#a6d98b', '#7fbf6a'], near: ['#8fd07a', '#66b35a'], lawn: ['#8fd46a', '#62a855'], low: '#84cb62', tuft: '#5fae4a', tuftStyle: 'grass',
      dots: ['#ffffff', '#fbf236', '#f7b6c8', '#c9a2f0'], dotC: '#df7126', sand: '#efe0b4', wet: '#d9c38e', sandEdge: '#c9b27a',
      water: ['#9fe6f7', '#5fcde4', '#3f9fd0', '#2f7fb8'], foam: '#ffffff', hl: '#d6f5fd', cloud: ['#ffffff', '#cbdbfc'],
      path: ['#efe4c8', '#c9b99a'], night: [20, 18, 64, 0.36], dim: 0, tree: 'bigtree', house: true,
      props: [['bush', 0.44, 0.0], ['rock', 0.07, 0.64], ['flowerbed', 0.36, 0.88], ['bush', 0.05, 0.22]],
    },
    beach: {
      sky: ['#48b8f0', '#6fcaf5', '#98dbf8', '#c8eefc'], skyN: ['#14214a', '#1c2d5e', '#243a70', '#2f4a82'],
      far: ['#9ccf8a', '#6fa86a'], near: ['#d6e9a0', '#a7c873'], lawn: ['#f6e3a8', '#dec486'], low: '#f0d898', tuft: '#e2c47e', tuftStyle: 'ripple',
      dots: ['#f7b6c8', '#ffffff', '#f5a86a', '#fbf3dc'], dotC: '#e07ba0', sand: '#f3dc9c', wet: '#e0c283', sandEdge: '#d9bd7c',
      water: ['#8ee8f0', '#3fc0e0', '#2a8fd0', '#1f6fb0'], foam: '#ffffff', hl: '#d6f5fd', cloud: ['#ffffff', '#cbdbfc'],
      path: null, night: [20, 18, 64, 0.36], dim: 0, tree: 'palm', surf: true, openSea: true,
      props: [['umbrella', 0.44, 0.04], ['sandcastle', 0.33, 0.86], ['shells', 0.08, 0.62], ['rockpool', 0.47, 0.95]],
    },
    moonlit: {
      sky: ['#3b2f6e', '#553d86', '#7a4f98', '#a868a8'], skyN: ['#110e2e', '#19153e', '#231c50', '#2f2462'],
      far: ['#3e5a78', '#2c4260'], near: ['#2f6a6a', '#1f4c50'], lawn: ['#3f8a72', '#2a6450'], low: '#377d68', tuft: '#2a6450', tuftStyle: 'grass',
      dots: ['#9fd8ff', '#c9a2f0', '#a6f2d3', '#fff6c9'], dotC: '#ffffff', sand: '#b9b3cc', wet: '#8f88a8', sandEdge: '#7a7496',
      water: ['#5a6aa8', '#3a4a88', '#2a3570', '#1c2458'], foam: '#cbdbfc', hl: '#9fb0e8', cloud: ['#8a78b8', '#6a5a98'],
      path: ['#6a6a8a', '#4a4a6a'], night: [26, 14, 60, 0.32], dim: 0.16, tree: 'glowtree', bigMoon: true,
      props: [['crystal', 0.44, 0.0], ['glowshroom', 0.07, 0.6], ['lantern', 0.37, 0.86], ['glowshroom', 0.48, 0.5]],
    },
    candy: {
      sky: ['#f6a6d0', '#f9bcdc', '#fbd2e6', '#fde6f0'], skyN: ['#2e1a4e', '#3c2260', '#4c2a72', '#5e3484'],
      far: ['#f7c6e0', '#e89cc4'], farStripe: '#fde6f0', near: ['#bff0dc', '#86d6b8'], lawn: ['#c8f2e0', '#8fd8bc'], low: '#bdeed6', tuft: '#f08cbc', tuftStyle: 'sprinkle',
      dots: ['#f07a84', '#fff27a', '#639bff', '#ffffff'], dotC: '#f08cbc', sand: '#fde6b8', wet: '#f5c890', sandEdge: '#e8b87c',
      water: ['#b8f5ec', '#8ee0e0', '#f5a6cc', '#e07ba0'], foam: '#ffffff', hl: '#ffffff', cloud: ['#ffffff', '#f7c6e0'],
      path: ['#ffffff', '#f7b6c8'], night: [40, 16, 70, 0.36], dim: 0, tree: 'lollitree', house: true, fizz: true,
      props: [['candycane', 0.44, 0.02], ['cupcake', 0.07, 0.62], ['gumdrops', 0.37, 0.88]],
    },
  };
  // where fruit hangs on each tree (share of sprite width/height from the base)
  const TREE_SLOTS = {
    palm: [[-0.08, -0.74], [0.14, -0.69], [0.34, -0.76]],
    lollitree: [[-0.28, -0.72], [0.04, -0.9], [0.3, -0.66]],
    default: [[-0.27, -0.45], [0, -0.74], [0.27, -0.47]],
  };
  const GLOWS = { lantern: [0.5, 0.8, 9, '255,236,150'], glowshroom: [0.5, 0.6, 7, '170,240,255'], crystal: [0.5, 0.55, 7, '180,220,255'] };

  // ---------------- seeded decoration ----------------
  let seed = 7; const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const DECO = { tufts: [], flowers: [], stars: [], waves: [], clouds: [], flies: [] };
  for (let i = 0; i < 50; i++) DECO.tufts.push({ x: srand(), y: srand() });
  for (let i = 0; i < 30; i++) DECO.flowers.push({ x: srand(), y: srand(), c: i % 4 });
  for (let i = 0; i < 44; i++) DECO.stars.push({ x: srand(), y: srand(), tw: srand() > 0.78, ph: srand() * 6 });
  for (let i = 0; i < 18; i++) DECO.waves.push({ x: srand(), y: srand(), ph: srand() * 6.28, w: 2 + Math.floor(srand() * 3) });
  for (let i = 0; i < 4; i++) DECO.clouds.push({ x: srand(), y: 0.12 + srand() * 0.42, s: srand() > 0.5 ? 1 : 0, v: 0.8 + srand() * 1.4 });
  for (let i = 0; i < 9; i++) DECO.flies.push({ p: srand() * 10, a: srand(), b: srand() });

  // ---------------- sprites (guarded: art is still being drawn, so nothing may crash) ----------------
  const sprCache = new Map();
  function blob(w, h, col) { const g = new PX.Grid(w, h); g.ell(w / 2, h / 2, w / 2 - 1, h / 2 - 1, col || PX.RAMPS.slate); g.outline(); return g.canvas(); }
  function spr(key, make, fb) {
    let c = sprCache.get(key); if (c) return c;
    try { c = make(); } catch (e) { c = null; }
    if (!c || !c.width) { try { c = fb(); } catch (e) { c = blob(10, 10); } }
    sprCache.set(key, c); return c;
  }
  const themeOf = a => (D.AREAS[a] && D.AREAS[a].theme) || 'day';
  const critterSpr = id => spr('c:' + id, () => PX.critter(id), () => blob(16, 12, PX.RAMPS.peach));
  const swimSpr = id => spr('cs:' + id, () => (PX.critterSwim ? PX.critterSwim(id) : null), () => critterSpr(id));
  const itemSpr = (kind, id) => spr('i:' + kind + ':' + id, () => PX.item(kind, id), () => (kind === 'fruit' ? PX.fruit('round') : blob(11, 11, PX.RAMPS.sun)));
  const propSpr = (kind, theme) => spr('p:' + kind + ':' + theme, () => PX.prop(kind, theme), () => blob(14, 12));
  const dropSpr = d => (d.type === 'xp' ? itemSpr('xp', d.stat) : itemSpr(d.big ? 'bigcoin' : 'coin', ''));
  let cocoonC = null, arrowC = null, sunC = null, moonC = null, bigMoonC = null;
  function cocoonSprite() {
    if (cocoonC) return cocoonC;
    const g = new PX.Grid(26, 28); g.ell(13, 15, 10.5, 12.5, ['#ffffff', '#fbf3dc', '#eec39a']); g.outline();
    g.px([[9, 8], [10, 7], [8, 10]], '#ffffff'); g.px([[16, 18], [17, 17], [11, 21], [18, 12]], '#e3cf9d');
    return (cocoonC = g.canvas());
  }
  function arrowSprite() {
    if (arrowC) return arrowC;
    const g = new PX.Grid(9, 7); g.poly([[1, 1], [8, 1], [4.5, 6]], '#ffcc44'); g.outline(); g.px([[3, 2], [4, 2]], '#fff27a');
    return (arrowC = g.canvas());
  }
  function sunSprite() { if (sunC) return sunC; const g = new PX.Grid(17, 17); g.ell(8.5, 8.5, 7.5, 7.5, '#fbf3dc'); g.ell(8.5, 8.5, 5.5, 5.5, '#fff27a'); return (sunC = g.canvas()); }
  function moonSprite(big) {
    if (big ? bigMoonC : moonC) return big ? bigMoonC : moonC;
    const n = big ? 23 : 15, c = n / 2, g = new PX.Grid(n, n);
    g.ell(c, c, c - 1, c - 1, ['#fffbe6', '#f4ecc8', '#d9cfa0']);
    const k = n / 15; g.px([[Math.round(5 * k), Math.round(5 * k)], [Math.round(6 * k), Math.round(5 * k)], [Math.round(9 * k), Math.round(8 * k)], [Math.round(6 * k), Math.round(10 * k)], [Math.round(10 * k), Math.round(4 * k)]], '#d9cfa0');
    const cv = g.canvas(); if (big) bigMoonC = cv; else moonC = cv; return cv;
  }

  // ---------------- module state ----------------
  let root, cv, ctx, buf, bx, skyC, skx, bgC, bgx, pillName, pillSub, dotsEl, trayEl, pouchStrip, fruitStrip, pouchCnt, hintEl, cardEl, ghostEl, gctx, labelsEl;
  const card = {};
  let W = 0, H = 0, DPR = 1, PXS = 4, ww = 0, wh = 0, t = 0, visible = false, mounted = false, area = 'meadow';
  const Lw = { shore: [], props: [] };
  const RT = new Map();              // sprout id -> runtime (position, state, timers)
  const arrivals = new Set();        // sprouts that just swam here: they enter from the water
  const spawnAt = new Map();         // sprout id -> {x,y} for freshly hatched Sprouts
  let critters = [], parts = [], floaters = [], fizz = [];
  const drops = {}, ground = {};     // per area
  let here = [];                     // runtimes of Sprouts in the viewed area (rebuilt each frame)
  let nextCritter = 0, nextDrop = 0, skyKey = '', bgKey = '', saveT = 0, uiT = 0, flushT = 0, cleanT = 0, sel = null, trayDirty = false;
  const lanes = new Map();
  const ptr = { x: 0, y: 0, vx: 0, px: 0, py: 0 };
  let press = null, drag = null, trayPress = null;
  const egw = new Map();             // egg id -> wobble timer

  // ---------------- geometry ----------------
  const shoreAt = y => Lw.shore[clamp(Math.round(y), 0, Lw.shore.length - 1)] || ww * 0.6;
  const onDock = (x, y) => x >= Lw.dockX0 && x <= Lw.dockX1 && Math.abs(y - Lw.dockY) <= 2;
  const inWater = (x, y) => y >= Lw.waterTop + 1 && x > shoreAt(y) + 1 && !onDock(x, y);
  const depthK = (x, y) => { const s = shoreAt(y); return clamp((x - s) / Math.max(1, ww - s), 0, 1); };
  const isDeep = (x, y) => inWater(x, y) && depthK(x, y) >= 0.45;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function layout() {
    const trayH = trayEl.offsetHeight || 110;
    Lw.hz = Math.round(wh * 0.2);
    Lw.minY = Lw.hz + 18;
    Lw.maxY = Math.max(Lw.minY + 30, Math.floor((H - trayH - 16) / PXS));
    Lw.span = Lw.maxY - Lw.minY;
    Lw.waterTop = Lw.hz + 2;
    Lw.shore.length = 0;
    for (let y = 0; y <= wh + 2; y++) {
      const k = clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1.3);
      Lw.shore[y] = Math.round(ww * (0.55 + 0.09 * k) + Math.sin(k * 5.5 + 0.6) * 2.2);
    }
    Lw.dockY = Math.round(Lw.minY + Lw.span * 0.3);
    Lw.dockX0 = shoreAt(Lw.dockY) - 4; Lw.dockX1 = shoreAt(Lw.dockY) + Math.round((ww - shoreAt(Lw.dockY)) * 0.4);
    Lw.tree = { x: Math.round(ww * 0.2), y: Math.round(Lw.minY + Lw.span * 0.14) };
    hintEl.style.bottom = (trayH + 18) + 'px';
    buildProps();
    bgKey = ''; skyKey = '';
  }
  function buildProps() {
    const th = TH[area], theme = themeOf(area);
    Lw.props = th.props.map(([kind, fx, fy]) => {
      const c = propSpr(kind, theme), y = Math.round(Lw.minY + Lw.span * fy);
      const x = Math.round(Math.min(ww * fx, shoreAt(y) - c.width / 2 - 3));
      return { kind, x: Math.max(Math.round(c.width / 2) + 1, x), y, c };
    });
    const tc = treeSpr(), sl = TREE_SLOTS[th.tree] || TREE_SLOTS.default;
    Lw.slots = sl.map(([fx, fy]) => ({ x: Math.round(Lw.tree.x + fx * tc.width), y: Math.round(Lw.tree.y + fy * tc.height) }));
  }
  const treeSpr = () => propSpr(TH[area].tree, themeOf(area));
  function lawnPoint() {
    for (let i = 0; i < 40; i++) {
      const y = rand(Lw.minY + 2, Lw.maxY), x = rand(8, shoreAt(y) - 8);
      if (Math.abs(x - Lw.tree.x) < 7 && Math.abs(y - Lw.tree.y) < 5) continue;
      if (Lw.props.some(p => Math.abs(x - p.x) < p.c.width / 2 && Math.abs(y - p.y) < 4)) continue;
      return { x, y };
    }
    return { x: ww * 0.3, y: Lw.maxY - 6 };
  }
  function shallowPoint() { const y = rand(Lw.minY + 3, Lw.maxY - 2), s = shoreAt(y); return { x: s + 4 + rand(0, 0.3) * (ww - s - 4), y }; }
  function waterPoint(lo, hi) { const y = rand(Lw.minY + 2, Lw.maxY - 1), s = shoreAt(y); return { x: s + 3 + rand(lo, hi) * (ww - s - 6), y }; }
  function coastPoint(y0) { const y = y0 == null ? rand(Lw.minY + 4, Lw.maxY - 2) : clamp(y0, Lw.minY + 2, Lw.maxY - 1); return { x: shoreAt(y) - rand(1, 4.5), y }; }

  // ---------------- colours ----------------
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mixHex = (a, b, k) => { const A = rgb(a), B = rgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')'; };

  // ---------------- background (cached per area / size / night level) ----------------
  function paintSky(n) {
    const th = TH[area], x = skx, hz = Lw.hz; x.clearRect(0, 0, ww, wh);
    const bands = th.sky.map((c, i) => mixHex(c, th.skyN[i], n));
    const bh = Math.ceil((hz + 12) / bands.length);
    bands.forEach((c, i) => {
      x.fillStyle = c; x.fillRect(0, i * bh, ww, i === bands.length - 1 ? wh : bh);
      if (i) { x.fillStyle = bands[i - 1]; for (let j = i % 2; j < ww; j += 2) x.fillRect(j, i * bh, 1, 1); }
    });
    const sa = th.bigMoon ? Math.max(0.5, n) : n;
    if (sa > 0.04) {
      x.globalAlpha = sa;
      for (const s of DECO.stars) { if (s.tw) continue; x.fillStyle = s.y > 0.5 ? '#cbdbfc' : '#ffffff'; x.fillRect(Math.round(s.x * ww), Math.round(s.y * (hz - 8)), 1, 1); }
      x.globalAlpha = 1;
    }
  }
  function paintLand() {
    const th = TH[area], x = bgx, hz = Lw.hz; x.clearRect(0, 0, ww, wh);
    const seaX = th.openSea ? shoreAt(Lw.waterTop) - 3 : ww;
    const hill = (base, amp, f, ph, fill, edge, maxX, stripe) => {
      for (let i = 0; i < Math.min(ww, maxX); i++) {
        const top = Math.round(base - Math.sin(i * f + ph) * amp - Math.sin(i * f * 2.3 + ph * 2) * amp * 0.4);
        x.fillStyle = edge; x.fillRect(i, top, 1, 1); x.fillStyle = fill; x.fillRect(i, top + 1, 1, wh - top);
        if (stripe) { x.fillStyle = stripe; for (let y = top + 2; y < hz + 8; y++) if (((i + y) >> 1) % 3 === 0) x.fillRect(i, y, 1, 1); }
      }
    };
    hill(hz - 2, 6, 0.045, 1, th.far[0], th.far[1], th.openSea ? seaX - 6 : ww, th.farStripe);
    hill(hz + 4, 3.5, 0.07, 3, th.near[0], th.near[1], th.openSea ? seaX : ww);
    const lawnTop = hz + 9;
    for (let i = 0; i < ww; i++) { const top = Math.round(lawnTop - Math.sin(i * 0.09 + 2) * 1.2); x.fillStyle = th.lawn[1]; x.fillRect(i, top, 1, 1); x.fillStyle = th.lawn[0]; x.fillRect(i, top + 1, 1, wh - top); }
    const lowBand = Math.round(lawnTop + (wh - lawnTop) * 0.55);
    x.fillStyle = th.low; x.fillRect(0, lowBand, ww, wh - lowBand);
    x.fillStyle = th.lawn[0]; for (let j = 0; j < ww; j += 2) x.fillRect(j, lowBand, 1, 1);
    // house far on the hill
    if (th.house) { const hc = propSpr('house', themeOf(area)); Lw.house = { x: Math.round(ww * 0.42), y: hz + 8, c: hc }; PX.blit(x, hc, Lw.house.x, Lw.house.y); } else Lw.house = null;
    // path from the tree to the dock
    if (th.path) {
      for (let i = 0; i < 6; i++) {
        const k = i / 5, px = Math.round(lerp(Lw.tree.x + 10, Lw.dockX0 - 4, k)), py = Math.round(lerp(Lw.tree.y + 6, Lw.dockY + 2, k) + Math.sin(k * 5) * 2);
        x.fillStyle = th.path[1]; x.fillRect(px - 2, py, 5, 2); x.fillStyle = th.path[0]; x.fillRect(px - 2, py - 1, 5, 2); x.fillRect(px - 1, py - 2, 3, 1);
      }
    }
    // tufts & little flowers (or ripples / sprinkles)
    const top = lawnTop + 4, span = wh - top;
    for (const f of DECO.tufts) {
      const X = Math.round(f.x * ww), Y = Math.round(top + f.y * span); if (X > shoreAt(Y) - 8) continue;
      x.fillStyle = th.tuft;
      if (th.tuftStyle === 'ripple') { x.fillRect(X - 1, Y, 3, 1); x.fillRect(X + 2, Y - 1, 1, 1); }
      else if (th.tuftStyle === 'sprinkle') { x.fillStyle = th.dots[(X + Y) % 4]; x.fillRect(X, Y, 2, 1); }
      else { x.fillRect(X - 1, Y - 1, 1, 1); x.fillRect(X, Y, 1, 1); x.fillRect(X + 1, Y - 1, 1, 1); x.fillRect(X, Y - 2, 1, 1); }
    }
    for (const f of DECO.flowers) {
      const X = Math.round(f.x * ww), Y = Math.round(top + f.y * span); if (X > shoreAt(Y) - 9) continue;
      x.fillStyle = th.dots[f.c]; x.fillRect(X - 1, Y, 1, 1); x.fillRect(X + 1, Y, 1, 1); x.fillRect(X, Y - 1, 1, 1); x.fillRect(X, Y + 1, 1, 1);
      x.fillStyle = th.dotC; x.fillRect(X, Y, 1, 1);
    }
    // sandy shore + water
    const W0 = th.water;
    for (let y = Lw.waterTop; y < wh; y++) {
      const s = shoreAt(y), k = clamp((y - Lw.waterTop) / 30, 0, 1), sw = Math.round(lerp(2, 6, k));
      x.fillStyle = th.sandEdge; if (y % 2 === 0 || k > 0.5) x.fillRect(s - sw - 1, y, 1, 1);
      x.fillStyle = th.sand; x.fillRect(s - sw, y, sw, 1);
      x.fillStyle = th.wet; x.fillRect(s - 1, y, 2, 1);
      for (let i = s + 1; i < ww; i++) {
        const d = (i - s) / Math.max(1, ww - s), far = y < Lw.waterTop + 3;
        let c = d < 0.16 ? 0 : d < 0.45 ? 1 : 2;
        if (far) c = y === Lw.waterTop ? 0 : 3;
        else if (Math.abs(d - 0.16) < 0.03 && (i + y) % 2) c = 1;
        else if (Math.abs(d - 0.45) < 0.03 && (i + y) % 2) c = 2;
        else if (d > 0.8 && (i + y) % 2 && y < Lw.waterTop + 8) c = 3;
        x.fillStyle = W0[c]; x.fillRect(i, y, 1, 1);
      }
    }
    // dock: planks on posts, a lamp at the end
    const dy = Lw.dockY, x0 = Lw.dockX0, x1 = Lw.dockX1;
    x.fillStyle = 'rgba(34,32,52,.22)'; x.fillRect(x0 + 2, dy + 1, x1 - x0, 2);
    for (const px of [x0 + 5, Math.round((x0 + x1) / 2) + 2, x1 - 1]) { x.fillStyle = '#663931'; x.fillRect(px, dy - 1, 1, 4); x.fillStyle = W0[0]; x.fillRect(px - 1, dy + 3, 3, 1); }
    x.fillStyle = INK; x.fillRect(x0 - 1, dy - 4, x1 - x0 + 3, 1); x.fillRect(x0 - 1, dy - 3, 1, 3); x.fillRect(x1 + 1, dy - 3, 1, 3); x.fillRect(x0 - 1, dy, x1 - x0 + 3, 1);
    x.fillStyle = '#d9a066'; x.fillRect(x0, dy - 3, x1 - x0 + 1, 1);
    x.fillStyle = '#b8743a'; x.fillRect(x0, dy - 2, x1 - x0 + 1, 2);
    x.fillStyle = '#8f563b'; for (let i = x0 + 2; i < x1; i += 3) x.fillRect(i, dy - 3, 1, 3);
    Lw.lamp = { x: x1 - 1, y: dy - 12 };
    x.fillStyle = INK; x.fillRect(x1 - 2, dy - 14, 5, 5); x.fillRect(x1 - 1, dy - 15, 3, 1); x.fillRect(x1 - 1, dy - 9, 3, 6);
    x.fillStyle = '#595a70'; x.fillRect(x1, dy - 9, 1, 5); x.fillRect(x1 - 1, dy - 14, 3, 1);
    x.fillStyle = '#f6c83a'; x.fillRect(x1 - 1, dy - 13, 3, 3); x.fillStyle = '#fff27a'; x.fillRect(x1 - 1, dy - 13, 1, 2);
  }
  function ensureBg(n) {
    const nq = Math.round(n * 20) / 20;
    const k1 = area + ww + 'x' + wh + ':' + nq, k2 = area + ww + 'x' + wh + ':' + Lw.maxY;
    if (k1 !== skyKey) { skyKey = k1; paintSky(nq); }
    if (k2 !== bgKey) { bgKey = k2; paintLand(); }
  }

  // ---------------- resize ----------------
  function resize() {
    const r = root.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    PXS = clamp(Math.round(W / 100), 3, 5);
    ww = Math.ceil(W / PXS); wh = Math.ceil(H / PXS);
    for (const c of [buf, skyC, bgC]) { c.width = ww; c.height = wh; }
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    layout();
    for (const r2 of RT.values()) { r2.x = clamp(r2.x, 6, ww + 20); r2.y = clamp(r2.y, Lw.minY, Lw.maxY); }
    return true;
  }
  let lastTrayH = 0;
  function checkSize() {
    if (!root) return;
    const w = root.clientWidth, h = root.clientHeight, th = trayEl.offsetHeight;
    if (w !== Math.round(W) || h !== Math.round(H) || !ww) resize();
    else if (th !== lastTrayH) layout();
    lastTrayH = th;
  }

  // ---------------- tree fruit (saved so it can't be farmed by reloading) ----------------
  function treeSlots() {
    const G = PS.S.garden || (PS.S.garden = {});
    if (!G.trees) G.trees = {};
    let a = G.trees[area];
    if (!Array.isArray(a) || a.length !== 3) a = G.trees[area] = [0, 1, 2].map(() => ({ kind: pick(D.TREE_FRUITS), readyAt: 0 }));
    return a;
  }
  function growK(sl) { const now = Date.now(); if (sl.readyAt <= now) return 1; return clamp(1 - (sl.readyAt - now) / (D.GROWTH.fruitRegrowSec * 1000), 0, 1); }
  function takeTreeFruit(i) {
    const sl = treeSlots()[i], kind = sl.kind, p = Lw.slots[i];
    sl.kind = pick(D.TREE_FRUITS); sl.readyAt = Date.now() + D.GROWTH.fruitRegrowSec * 1000; PS.save();
    burst(p.x, p.y, 'leaf', 6); snd('pop');
    return kind;
  }

  // ---------------- particles & floaters ----------------
  function burst(x, y, type, n, color) {
    for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), sp = rand(10, 38); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 16, life: rand(0.6, 1.1), type, color, grav: true }); }
  }
  function heartUp(x, y) { parts.push({ x: x + rand(-3, 3), y, vx: rand(-3, 3), vy: -16, life: 1.1, type: 'heart' }); }
  function floater(text, color, x, y, delay) { floaters.push({ text, color: color || '#5b4630', x, y, life: 1.7, delay: delay || 0 }); }
  function floaterFor(r, text, color) {
    const at = Math.max(t, lanes.get(r.id) || 0); lanes.set(r.id, at + 0.5);
    floater(text, color, r.x, headY(r) - 10, at - t);
  }

  // ---------------- sprout runtime ----------------
  function getRT(s) {
    let r = RT.get(s.id);
    if (!r) {
      let x, y, state = 'idle';
      const sp = spawnAt.get(s.id);
      if (sp) { x = sp.x; y = sp.y; spawnAt.delete(s.id); }
      else if (arrivals.has(s.id)) { arrivals.delete(s.id); y = rand(Lw.minY + 4, Lw.maxY - 4); x = ww + 8; state = 'arrive'; }
      else { const q = lawnPoint(); x = q.x; y = q.y; }
      r = { id: s.id, s, x, y, z: 0, vz: 0, state, timer: rand(0.4, 2), tx: x, ty: y, facing: Math.random() < 0.5 ? 1 : -1, emote: null, emoteT: 0,
        blinkT: rand(1, 4), mood: null, target: null, flutter: false, z0: 0, eat: null, cheerT: 0, hopT: 0, feetY: y, dangle: 0, acc: {}, look: null, lookT: 0,
        flutterAt: -99, dest: null, ripT: 0, awake: t + 25 };
      if (state === 'arrive') { const q = shallowPoint(); r.tx = q.x; r.ty = y; r.facing = -1; emote(r, '!', 1.4); }
      RT.set(s.id, r);
    }
    r.s = s; return r;
  }
  function lookFor(r) { if (!r.look || t > r.lookT) { r.look = ST.lookOf(r.s); r.lookT = t + 1.2; } return r.look; }
  function emote(r, e, dur) { r.emote = e; r.emoteT = dur || 1.6; }
  function hop(r) { r.hopT = 0.35; }
  const busy = r => ['held', 'fall', 'travel', 'arrive', 'cocoon', 'wait'].includes(r.state);
  function headY(r) { const base = r.state === 'held' ? r.feetY : r.state === 'fall' ? r.y - r.z : r.y; return base - (r.s.stage === 2 ? 30 : 23); }
  function addXp(r, stat, amt) { r.acc[stat] = (r.acc[stat] || 0) + amt; }
  function flushXp(r) {
    const g = {}; let any = false;
    for (const k in r.acc) if (r.acc[k] > 0) { g[k] = r.acc[k]; any = true; }
    r.acc = {};
    if (any && PS.S.sprouts.includes(r.s)) ST.gain(r.s, g);
  }
  function flushAll() { for (const r of RT.values()) flushXp(r); }

  function think(r) {
    const s = r.s, night = PS.clock.isNight();
    r.mood = null;
    const gl = ground[area] || [];
    const free = gl.filter(f => !f.claim || f.claim.until < t || f.claim.id === r.id);
    if (free.length) {
      let best = null, bd = 1e9; for (const f of free) { const d = dist(r, f); if (d < bd) { bd = d; best = f; } }
      best.claim = { id: r.id, until: t + 12 };
      goTo(r, best.x - 5 * (best.x > r.x ? 1 : -1), best.y, { type: 'fruit', f: best }); emote(r, '!', 0.8); return;
    }
    if (s.happy < 25 && Math.random() < 0.25) { r.state = 'idle'; r.timer = rand(1.5, 3); r.mood = 'sad'; emote(r, '?', 1.5); return; }
    const pals = here.filter(o => o !== r && !busy(o) && o.state !== 'sleep');
    const x = Math.random();
    if (pals.length && x < 0.1) { const o = pick(pals); goTo(r, o.x - 8 * (o.x > r.x ? 1 : -1), o.y, { type: 'greet', o }); return; }
    if (x < 0.6) { const swimmy = Math.random() < (s.stats.swim.lv >= 1 ? 0.2 : 0.1); const q = swimmy ? shallowPoint() : lawnPoint(); goTo(r, q.x, q.y, null); }
    else if (x < 0.76) { r.state = 'idle'; r.timer = rand(1.5, 3); emote(r, pick(['note', 'note', 'heart', 'sparkle']), 1.4); }
    else if (x < 0.86) { r.state = 'idle'; r.timer = 1.4; r.cheerT = 0.9; hop(r); }
    else { r.state = 'idle'; r.timer = rand(1, 2.5); r.facing *= -1; }
  }
  function goSleep(r, dur) { r.state = 'sleep'; r.timer = dur; r.mood = 'sleep'; emote(r, 'zz', dur); }
  function goTo(r, x, y, target) { r.state = 'walk'; r.tx = clamp(x, 6, ww - 6); r.ty = clamp(y, Lw.minY, Lw.maxY); r.target = target; }
  function startSwim(r) { r.state = 'swim'; r.timer = rand(6, 11); const q = shallowPoint(); r.tx = q.x; r.ty = q.y; emote(r, 'note', 1.5); markSeen('swim'); }
  function wake(r) { if (r.state === 'sleep') { r.state = 'idle'; r.timer = 1; r.mood = null; r.emote = null; } }

  function updateSprout(r, dt, night) {
    const s = r.s;
    if (press && press.kind === 'sprout' && press.r === r && press.mode === 'pending' && t - press.t0 > TUNE.holdDelay) press.mode = pickUp(r) ? 'hold' : 'none';
    if (r.state === 'sleep') wake(r); // sleeping is switched off for now
    s.happy = clamp(s.happy - TUNE.happyDecay * dt, 0, 100);
    r.blinkT -= dt; if (r.blinkT < -0.14) r.blinkT = rand(2, 5);
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) r.emote = null; }
    if (r.cheerT > 0) r.cheerT -= dt;
    if (r.hopT > 0) r.hopT -= dt;
    const speed = TUNE.walkSpeed + s.stats.run.lv * TUNE.walkPerRunLv;
    const wet = inWater(r.x, r.y);
    if (wet && (r.state === 'swim' || r.state === 'walk' || r.state === 'wait' || r.state === 'arrive')) addXp(r, 'swim', D.GROWTH.swimXpPerSec * dt);
    const moveTo = (sp) => { const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy); if (Math.abs(dx) > 0.5) r.facing = dx > 0 ? 1 : -1; if (d < 1) return true; const k = Math.min(d, sp * dt) / d; r.x += dx * k; r.y += dy * k; return false; };
    switch (r.state) {
      case 'idle': case 'pet':
        r.timer -= dt;
        if (r.timer <= 0) { if (r.state === 'pet') { r.state = 'idle'; r.timer = 0.6; r.mood = null; } else think(r); }
        if (wet && r.state === 'idle') startSwim(r);
        break;
      case 'walk': {
        const sp = speed * (wet ? 0.6 : 1);
        if (moveTo(sp)) {
          const tg = r.target; r.target = null;
          if (tg && tg.type === 'fruit') {
            const gl = ground[area] || [], i = gl.indexOf(tg.f);
            if (i >= 0) { gl.splice(i, 1); r.facing = tg.f.x > r.x ? 1 : -1; feedSprout(r, tg.f.kind); } else { r.state = 'idle'; r.timer = 0.6; }
          } else if (tg && tg.type === 'greet' && !busy(tg.o)) {
            const o = tg.o; r.facing = o.x > r.x ? 1 : -1; r.state = 'idle'; r.timer = 1.6; emote(r, 'heart', 1.4); hop(r);
            if (o.state === 'idle' || o.state === 'walk') { o.state = 'idle'; o.timer = 1.6; o.facing = -r.facing; emote(o, pick(['heart', 'note']), 1.4); }
            if (o.state === 'sleep') { emote(r, '?', 1.2); }
            snd('coo');
          } else if (wet) startSwim(r);
          else { r.state = 'idle'; r.timer = rand(0.8, 2.2); }
        } else if (!wet) addXp(r, 'run', D.GROWTH.walkXpPerSec * dt);
        break;
      }
      case 'swim':
        r.timer -= dt;
        if (moveTo(speed * 0.55)) { const q = shallowPoint(); r.tx = q.x; r.ty = q.y; }
        if (r.timer <= 0 || !wet) { const q = lawnPoint(); goTo(r, q.x, q.y, null); }
        break;
      case 'wait': // treading water while the player picks a destination
        r.x += Math.sin(t * 1.3 + r.y) * 0.03;
        break;
      case 'travel': {
        if (!wet && r.x < shoreAt(r.y) + 2) { r.tx = shoreAt(r.y) + 6; r.ty = r.y; moveTo(speed); }
        else { r.tx = ww + 16; r.ty = clamp(r.y + Math.sin(t * 0.8) * 0.2, Lw.minY, Lw.maxY); moveTo(speed * 0.8 + 4); r.ripT -= dt; if (r.ripT <= 0) { r.ripT = 0.25; parts.push({ x: r.x - 6 * r.facing, y: r.y - 6, vx: 0, vy: 0, life: 0.8, type: 'ripple', color: TH[area].hl }); } }
        if (r.x > ww + 12) finishMove(s, r.dest);
        break;
      }
      case 'arrive':
        if (moveTo(speed * 0.6)) { const q = lawnPoint(); goTo(r, q.x, q.y, null); emote(r, 'sparkle', 1.4); }
        break;
      case 'eat':
        r.timer -= dt; if (Math.random() < dt * 5) snd('munch');
        if (r.timer <= 0) { r.eat = null; r.state = 'idle'; r.timer = 0.8; r.mood = 'happy'; hop(r); setTimeout(() => { if (r.mood === 'happy') r.mood = null; }, 700); if (inWater(r.x, r.y)) startSwim(r); }
        break;
      case 'held':
        r.x = clamp(ptr.x, 5, ww - 5); r.feetY = clamp(ptr.y + 10, 14, wh);
        r.dangle = lerp(r.dangle, clamp(-ptr.vx * 0.5, -2, 2), 0.2); ptr.vx *= 0.85;
        break;
      case 'fall':
        if (r.flutter) { r.z -= TUNE.flutterFall * dt; if (Math.random() < dt * 4) parts.push({ x: r.x + rand(-6, 6), y: r.y - r.z - 12, vx: 0, vy: 5, life: 0.8, type: 'feather' }); }
        else { r.vz += TUNE.gravity * dt; r.z -= r.vz * dt; }
        if (r.z <= 0) land(r);
        break;
      case 'sleep':
        r.timer -= dt; s.energy = clamp(s.energy + (night ? TUNE.regenNight : TUNE.regenDay) * dt, 0, 100);
        if (r.timer <= 0 && s.energy > 60) { r.state = 'idle'; r.timer = 1; r.mood = null; r.cheerT = 0.8; emote(r, 'sparkle', 1.2); }
        else if (r.timer <= 0) r.timer = 2;
        if (!r.emote) emote(r, 'zz', 3);
        break;
      case 'cocoon':
        r.timer -= dt;
        if (Math.random() < dt * 14) { const a = rand(0, 6.28); parts.push({ x: r.x + Math.cos(a) * 16, y: r.y - 12 + Math.sin(a) * 16, vx: -Math.cos(a) * 16, vy: -Math.sin(a) * 16, life: 0.9, type: 'spark', color: '#fff27a' }); }
        if (r.timer <= 0) { r.state = 'idle'; r.timer = 2; r.cheerT = 2; hop(r); emote(r, 'sparkle', 2); r.lookT = 0; burst(r.x, r.y - 12, 'spark', 30, '#fff27a'); burst(r.x, r.y - 12, 'spark', 12, '#ffffff'); buzz(40); }
        break;
    }
    if (!['held', 'fall', 'travel', 'arrive'].includes(r.state)) { r.x = clamp(r.x, 6, ww - 6); r.y = clamp(r.y, Lw.minY, Lw.maxY); }
  }

  // ---------------- sprout actions ----------------
  function petSprout(r, isTap) {
    if (busy(r) || r.state === 'eat') return;
    if (r.state === 'sleep') { wake(r); emote(r, '!', 1); hop(r); snd('pop'); return; }
    ST.pet(r.s);
    heartUp(r.x, r.y - 24);
    if (r.state !== 'swim') { r.state = 'pet'; r.timer = 0.8; }
    r.mood = 'happy'; if (isTap) hop(r);
    snd(Math.random() < 0.5 ? 'coo' : 'pop'); emote(r, 'heart', 1.2); markSeen('pet'); buzz(6);
  }
  function pickUp(r) {
    if (!['idle', 'walk', 'pet', 'swim', 'sleep'].includes(r.state)) return false;
    if (inWater(r.x, r.y)) { burst(r.x, r.y - 3, 'drop', 8, '#cbdbfc'); snd('splash'); }
    r.state = 'held'; r.mood = null; r.target = null; r.feetY = r.y; emote(r, '!', 1.2); snd('coo'); buzz(15); markSeen('hold');
    closeCard();
    return true;
  }
  function safeHeight(s) { const p = s.parts || {}; const wingy = Math.max(p.wings || 0, p.batwings || 0, p.fairywings || 0, p.flamewings || 0, p.dragonwings || 0); return Math.round((Lw.minY - 14) * 0.72) + s.stats.fly.lv * 2 + wingy * 20; }
  function heldGround(r) { return clamp(r.feetY + TUNE.holdLift, Lw.minY, Lw.maxY); }
  function release(r) {
    const gy = heldGround(r);
    r.z = Math.max(0, gy - r.feetY); r.z0 = r.z; r.y = gy; r.vz = 0;
    r.flutter = r.z > TUNE.flutterAt && r.z <= safeHeight(r.s); r.state = 'fall';
    if (r.flutter) emote(r, '!', 1);
  }
  function land(r) {
    r.z = 0;
    const s = r.s;
    if (inWater(r.x, r.y)) {
      burst(r.x, r.y - 2, 'drop', 14, '#cbdbfc'); snd('splash'); r.flutter = false;
      if (isDeep(r.x, r.y) && PS.S.sprouts.length) { r.state = 'wait'; emote(r, '?', 3); askTravel(s, true); }
      else startSwim(r);
      return;
    }
    snd('thud');
    if (r.flutter) {
      if (t - r.flutterAt > TUNE.flutterCooldown) { const xp = clamp(Math.round(r.z0 / 10), 1, TUNE.flutterXpMax); ST.gain(s, { fly: xp }); floaterFor(r, `+${xp} Fly`, D.STAT_META.fly.color); r.flutterAt = t; }
      emote(r, 'sparkle', 1);
    } else if (r.z0 > safeHeight(s)) {
      ST.roughHandle(s); emote(r, 'swirl', 2); r.mood = 'sad'; floaterFor(r, 'Ouch!', '#a2477a'); buzz(30);
    }
    r.flutter = false; r.state = 'idle'; r.timer = 1; burst(r.x, r.y, 'dust', 5, '#e8dcc0');
  }
  function feedSprout(r, id) {
    const res = ST.feed(r.s, id); if (!res) return;
    wake(r);
    r.state = 'eat'; r.timer = 1.5; r.eat = id; r.mood = null; r.target = null; emote(r, 'heart', 1.5); snd('munch'); markSeen('feed');
    const f = D.FRUITS[id];
    for (const [st, v] of Object.entries(f.gives || {})) floaterFor(r, `+${v} ${D.STAT_META[st].label}`, D.STAT_META[st].color);
    if (f.nature) floaterFor(r, f.nature > 0 ? 'Sun +' : 'Moon +', f.nature > 0 ? '#c7861c' : '#76428a');
    heartUp(r.x, r.y - 24);
  }
  function giveAnimal(r, idx, id) {
    let i = idx; if (PS.S.pouch[i] !== id) i = PS.S.pouch.indexOf(id); if (i < 0) return;
    ST.takeFromPouch(i);
    const res = ST.absorb(r.s, id); if (!res) return;
    wake(r); r.lookT = 0;
    if (r.state !== 'swim') { r.state = 'pet'; r.timer = 1.2; }
    r.cheerT = 1.1; hop(r); emote(r, 'heart', 1.6);
    const main = Object.entries(res.gives).sort((a, b) => b[1] - a[1])[0];
    burst(r.x, r.y - 12, 'spark', 18, main ? D.STAT_META[main[0]].color : '#fbf236');
    for (const [st, v] of Object.entries(res.gives)) floaterFor(r, `${v > 0 ? '+' : ''}${v} ${D.STAT_META[st].label}`, v > 0 ? D.STAT_META[st].color : '#8c93a8');
    for (const p of res.grew) floaterFor(r, `Grew ${PART_NAMES[p] || p}!`, '#5b4630');
    for (const m of res.unlocked) floaterFor(r, `Learned ${(D.MOVES[m] || { name: m }).name}!`, '#c0612a');
    snd('chime'); markSeen('give'); buzz(12);
  }

  // ---------------- travel ----------------
  function askTravel(s, fromWater) {
    let chosen = false;
    PS.ui.modal({
      eyebrow: 'Travel by swimming', title: `Where should ${s.name} swim?`, sprite: s, pose: { arms: 'up', eyes: 'happy', mouth: 'open' },
      html: `<p>${s.name} will swim across the water and live in that area. You can swim back any time.</p><div class="g-dest"></div>`,
      buttons: [{ label: fromWater ? 'Just swim here' : 'Stay here' }],
      onClose: () => { const r = RT.get(s.id); if (!chosen && r && r.state === 'wait') startSwim(r); },
      mount(cardEl2, close) {
        const box = cardEl2.querySelector('.g-dest');
        for (const a of AREA_IDS) {
          const A = D.AREAS[a], n = PS.S.sprouts.filter(x => x.area === a).length;
          const b = document.createElement('button'); b.className = 'g-destbtn g-a-' + a; b.disabled = a === s.area;
          b.innerHTML = `<b>${A.name}</b><small>${a === s.area ? 'Lives here now' : `${A.water} · ${n} Sprout${n === 1 ? '' : 's'}`}</small>`;
          b.onclick = () => { chosen = true; snd('pop'); close(); startTravel(s, a); };
          box.appendChild(b);
        }
      },
    });
  }
  function startTravel(s, dest) {
    if (!D.AREAS[dest] || s.area === dest) return;
    const r = RT.get(s.id);
    if (!visible || s.area !== area || !r) { finishMove(s, dest); return; }
    r.state = 'travel'; r.dest = dest; r.target = null; r.mood = null; emote(r, 'note', 1.6); snd('whoosh');
    if (sel === s.id) closeCard();
  }
  function finishMove(s, dest) {
    const r = RT.get(s.id); if (r) flushXp(r);
    ST.moveSprout(s, dest); RT.delete(s.id); arrivals.add(s.id);
    PS.ui.toast(`${s.name} swam to ${toArea(dest)}`, 2800);
    markSeen('travel'); updatePill();
  }

  // ---------------- eggs ----------------
  function eggsHere() {
    const list = PS.S.eggs.filter(e => e.area === area), n = list.length;
    const midY = Lw.minY + Lw.span * 0.46, mid = Math.round((8 + shoreAt(midY) - 8) / 2) + 6;
    return list.map((e, i) => ({ e, x: Math.round(clamp(mid + (i - (n - 1) / 2) * 17, 10, shoreAt(midY) - 10)), y: Math.round(midY + (i % 2) * 6) }));
  }
  function eggNeed(e) { return (D.EGGS[e.kind] || D.EGGS.meadow).taps || 5; }
  function tapEgg(o) {
    const e = o.e; e.taps = (e.taps || 0) + 1; egw.set(e.id, 0.5); snd('crack'); buzz(12);
    const c = itemSpr('egg', e.kind); burst(o.x, o.y - c.height / 2, 'shell', 4);
    markSeen('egg');
    if (e.taps >= eggNeed(e)) hatch(o); else PS.save();
  }
  function hatch(o) {
    const c = itemSpr('egg', o.e.kind);
    const first = PS.S.sprouts.length === 0;
    const s = ST.hatchEgg(o.e.id); if (!s) return;
    spawnAt.set(s.id, { x: o.x, y: o.y });
    const r = getRT(s); r.state = 'idle'; r.timer = 1.6; hop(r); emote(r, '!', 1.4); r.cheerT = 1.4;
    setTimeout(() => { if (RT.get(s.id) === r) emote(r, 'heart', 2); }, 1400);
    burst(o.x, o.y - c.height / 2, 'shell', 14); burst(o.x, o.y - 16, 'spark', 16, '#fbf236'); burst(o.x, o.y - 16, 'spark', 8, '#ffffff');
    snd('evolve'); buzz(40);
    floaterFor(r, `Hi, ${s.name}!`, '#c0612a');
    PS.ui.toast(`It hatched! Say hi to ${s.name}.`, 3000);
    nextCritter = t + 10; updatePill();
    if (first) {
      setTimeout(() => PS.ui.modal({
        eyebrow: 'It hatched!', title: `Say hi to ${s.name}`, sprite: s,
        html: '<ol><li>Rub it to pet it. Tap it to see its stats.</li><li>Drag fruit from the tree onto it.</li><li>Tap animals that wander in to catch them, then drag them from your pouch onto it. They change its stats, body and moves.</li><li>Press and hold to pick it up. Drop it in the shallows to swim, or in the deep water to travel.</li></ol>',
        buttons: [{ label: 'Let\'s play', kind: 'primary' }],
      }), 900);
    }
  }

  // ---------------- critters ----------------
  function critterPool() {
    const night = PS.clock.isNight();
    return Object.keys(D.ANIMALS).filter(id => { const a = D.ANIMALS[id]; return a.area === area && (a.time === 'any' || (a.time === 'night') === night); });
  }
  function spawnCritter() {
    const pool = critterPool(); if (!pool.length) return;
    const fresh = pool.filter(id => !critters.some(c => c.id === id));
    const id = pick(fresh.length ? fresh : pool), a = D.ANIMALS[id];
    let p;
    if (a.where === 'water') p = waterPoint(0.1, 0.85);
    else if (a.where === 'coast') p = coastPoint();
    else if (a.where === 'air') p = { x: rand(10, ww - 10), y: rand(Lw.minY - 4, Lw.minY + Lw.span * 0.55) };
    else p = lawnPoint();
    const c = { id, where: a.where, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, hopT: 1, next: rand(0.6, 1.6), life: D.GROWTH.critterLifeSec, facing: Math.random() < 0.5 ? 1 : -1, ph: rand(0, 6), by: p.y, vx: rand(6, 10) * (Math.random() < 0.5 ? 1 : -1) };
    critters.push(c);
    if (a.where === 'water') { burst(p.x, p.y - 2, 'drop', 6, '#cbdbfc'); } else burst(p.x, p.y - 4, 'spark', 8, '#ffffff');
  }
  function updateCritters(dt) {
    if (PS.S.sprouts.length && critters.length < TUNE.maxCritters && t > nextCritter) { spawnCritter(); nextCritter = t + rand(...D.GROWTH.critterEverySec); }
    for (const c of critters) {
      c.life -= dt; c.next -= dt;
      if (c.where === 'air') {
        c.x += c.vx * dt; c.y = c.by + Math.sin(t * 2 + c.ph) * 4;
        if (c.x < 8 || c.x > ww - 8) { c.vx *= -1; c.x = clamp(c.x, 8, ww - 8); }
        c.facing = c.vx > 0 ? 1 : -1;
        if (c.next <= 0) { c.by = clamp(c.by + rand(-8, 8), Lw.minY - 6, Lw.minY + Lw.span * 0.6); c.next = rand(1.5, 3); }
        continue;
      }
      if (c.hopT < 1) { c.hopT = Math.min(1, c.hopT + dt / (c.where === 'water' ? 1.6 : 0.38)); c.x = lerp(c.fx, c.tx, c.hopT); c.y = lerp(c.fy, c.ty, c.hopT); }
      else if (c.next <= 0) {
        let nx, ny;
        if (c.where === 'water') { const q = waterPoint(0.1, 0.85); nx = lerp(c.x, q.x, 0.4); ny = lerp(c.y, q.y, 0.3); if (!inWater(nx, ny)) { nx = c.x; ny = c.y; } }
        else if (c.where === 'coast') { const q = coastPoint(c.y + rand(-4, 4)); nx = q.x; ny = q.y; }
        else { const a = rand(0, Math.PI * 2), d = rand(4, 9); nx = clamp(c.x + Math.cos(a) * d, 8, ww - 8); ny = clamp(c.y + Math.sin(a) * d * 0.5, Lw.minY + 3, Lw.maxY); if (nx > shoreAt(ny) - 7) { nx = c.x - 4; ny = c.y; } }
        c.fx = c.x; c.fy = c.y; c.tx = nx; c.ty = ny; c.hopT = 0; if (Math.abs(nx - c.x) > 0.3) c.facing = nx >= c.x ? 1 : -1; c.next = rand(1.6, 3.2);
      }
    }
    for (const c of critters) if (c.life <= 0) { if (c.where === 'water') { burst(c.x, c.y - 2, 'drop', 6, '#cbdbfc'); } else burst(c.x, c.y - 5, 'spark', 5, '#ffffff'); }
    critters = critters.filter(c => c.life > 0);
  }
  function critterHit(c, p) { const cy = c.where === 'air' ? c.y - 5 : c.where === 'water' ? c.y - 3 : c.y - 6; return Math.hypot(p.x - c.x, p.y - cy) < 11; }
  function catchCritter(c) {
    const a = D.ANIMALS[c.id];
    if (!ST.canCatch()) { PS.ui.toast('Your pouch is full. Give an animal to a Sprout first.', 2800); snd('miss'); c.next = 0; return; }
    if (!ST.addToPouch(c.id)) return;
    critters.splice(critters.indexOf(c), 1);
    burst(c.x, c.y - 4, 'spark', 12, '#fbf236');
    floater(`Caught a ${a.name}!`, '#5b4630', c.x, c.y - 14);
    snd('chime'); buzz(10); markSeen('catch');
    nextCritter = Math.max(nextCritter, t + rand(...D.GROWTH.critterEverySec) * 0.6);
    for (const r of here) if (!busy(r) && r.state !== 'sleep' && dist(r, c) < 30) { emote(r, '!', 1); r.facing = c.x > r.x ? 1 : -1; }
  }

  // ---------------- drops ----------------
  function spawnDrop() {
    const list = drops[area] || (drops[area] = []);
    if (list.length >= TUNE.maxDrops) return;
    const any = PS.S.sprouts.length > 0;
    let d = ST.rollDrop(), tries = 0;
    while (d.type === 'xp' && !any && tries++ < 6) d = ST.rollDrop();
    if (d.type === 'xp' && !any) d = { type: 'coin', amount: 3 };
    const q = lawnPoint();
    list.push(Object.assign(d, { x: q.x, y: q.y, z: 16, vz: 0, life: TUNE.dropLife, bounced: false }));
    snd('tick');
  }
  function collectDrop(d) {
    const list = drops[area]; list.splice(list.indexOf(d), 1);
    burst(d.x, d.y - 5, 'spark', 10, d.type === 'xp' ? D.STAT_META[d.stat].color : '#fff27a');
    if (d.type === 'coin') {
      const n = ST.addCoins(d.amount, 'drop'); floater(`+${n} coins`, '#c7861c', d.x, d.y - 14); snd('chime');
    } else {
      let best = null, bd = 1e9;
      for (const r of here) { if (r.state === 'travel') continue; const dd = dist(r, d); if (dd < bd) { bd = dd; best = r; } }
      const s = best ? best.s : ST.active();
      if (!s) { const n = ST.addCoins(3, 'drop'); floater(`+${n} coins`, '#c7861c', d.x, d.y - 14); return; }
      ST.gain(s, { [d.stat]: d.amount });
      const m = D.STAT_META[d.stat];
      floater(`+${d.amount} ${m.label} XP${best ? '' : ' to ' + s.name}`, m.color, d.x, d.y - 14);
      if (best && !busy(best)) { emote(best, 'sparkle', 1.2); best.cheerT = 0.8; }
      snd('level');
    }
    markSeen('drop'); buzz(8);
  }

  // ---------------- drawing helpers ----------------
  function shadow(x, y, w) { const X = Math.round(x - w / 2), Y = Math.round(y); bx.fillStyle = 'rgba(34,32,52,.2)'; bx.fillRect(X + 1, Y - 2, w - 2, 1); bx.fillRect(X, Y - 1, w, 2); bx.fillRect(X + 1, Y + 1, w - 2, 1); }
  function glow(x, y, r, col, a) {
    x = Math.round(x); y = Math.round(y);
    for (const [rr, aa] of [[r, a * 0.45], [Math.round(r * 0.55), a]]) {
      bx.fillStyle = `rgba(${col},${aa})`;
      for (let dy = -rr; dy <= rr; dy++) { const w = Math.round(Math.sqrt(rr * rr - dy * dy)); bx.fillRect(x - w, y + dy, w * 2 + 1, 1); }
    }
  }
  function waterline(x, wl, half) {
    bx.fillStyle = '#ffffff'; bx.fillRect(Math.round(x) - half, wl, half * 2 + 1, 1);
    bx.fillStyle = TH[area].hl; bx.fillRect(Math.round(x) - half - 2, wl + 1, 2, 1); bx.fillRect(Math.round(x) + half + 1, wl + 1, 2, 1);
  }
  function pose(r) {
    const S = { frame: 0, mouth: 'smile' };
    if (r.blinkT < 0) S.eyes = 'blink';
    if (r.mood === 'happy') { S.eyes = 'happy'; S.mouth = 'open'; }
    if (r.mood === 'sad') { S.eyes = 'sad'; S.mouth = 'flat'; }
    if (r.state === 'walk') { S.walk = true; S.frame = Math.floor(t * 7) % 2; }
    if (r.cheerT > 0) { S.arms = 'up'; S.eyes = 'happy'; S.mouth = 'open'; }
    if (r.state === 'held') { S.arms = 'out'; S.mouth = 'o'; delete S.eyes; }
    if (r.state === 'fall') { S.arms = r.flutter ? 'up' : 'out'; S.flap = r.flutter; S.frame = Math.floor(t * 12) % 2; S.mouth = 'open'; }
    if (r.state === 'eat') { S.arms = 'hold'; S.mouth = Math.floor(t * 8) % 2 ? 'open' : 'smile'; }
    if (r.state === 'sleep') { S.eyes = 'closed'; S.mouth = 'o'; }
    if (r.state === 'swim' || r.state === 'travel' || r.state === 'arrive' || r.state === 'wait') { S.arms = 'paddle'; S.frame = Math.floor(t * (r.state === 'wait' ? 3 : 5)) % 2; }
    return S;
  }
  function drawSprout(r, emQ) {
    const look = lookFor(r), c = PX.sprig(look, pose(r)), flip = r.facing < 0;
    const put = (x, y, extra) => PX.blit(bx, extra ? PX.sprig(look, Object.assign(pose(r), extra)) : c, x, y, flip, PX.SPRIG_AX, PX.SPRIG_AY);
    const head = r.s.stage === 2 ? 30 : 23;
    if (r.state === 'held') { shadow(r.x, heldGround(r), 9); put(r.x + Math.round(r.dangle), r.feetY); emQ.push([r, r.x, r.feetY - head]); return; }
    if (r.state === 'fall') { shadow(r.x, r.y, 11); put(r.x, r.y - r.z); emQ.push([r, r.x, r.y - r.z - head]); return; }
    if (r.state === 'cocoon') {
      const k = 1 - r.timer / 2.6;
      shadow(r.x, r.y, 13); put(r.x, r.y, { eyes: 'closed', mouth: 'o' });
      bx.save(); bx.globalAlpha = Math.min(1, Math.round(k * 4) / 4 + 0.2); PX.blit(bx, cocoonSprite(), r.x, r.y + 1); bx.restore();
      return;
    }
    if (inWater(r.x, r.y) || (r.state === 'travel' && r.x > shoreAt(r.y) + 1)) {
      const wl = Math.round(r.y - 6), sink = Math.floor(t * 2 + r.x * 0.1) % 2;
      bx.save(); bx.beginPath(); bx.rect(0, 0, ww + 40, wl); bx.clip(); put(r.x, r.y + sink); bx.restore();
      waterline(r.x, wl, 8 + (Math.floor(t * 3) % 2));
      emQ.push([r, r.x, r.y + sink - head]); return;
    }
    const hopY = r.hopT > 0 ? Math.round(Math.sin((1 - r.hopT / 0.35) * Math.PI) * 4) : 0;
    shadow(r.x, r.y, 13); put(r.x, r.y - hopY);
    if (r.state === 'eat' && r.eat) bx.drawImage(itemSpr('fruit', r.eat), Math.round(r.x - 5), Math.round(r.y - 11 - hopY), 9, 9);
    emQ.push([r, r.x, r.y - hopY - head]);
  }
  function drawTree() {
    const T = Lw.tree, c = treeSpr();
    shadow(T.x, T.y, Math.round(c.width * 0.6));
    PX.blit(bx, c, T.x, T.y);
    const sl = treeSlots(), hint = PS.S.sprouts.some(s => s.area === area) && !seen('feed');
    sl.forEach((s, i) => {
      const p = Lw.slots[i]; if (!p) return;
      const k = growK(s); if (k < 0.35) return;
      const f = itemSpr('fruit', s.kind);
      if (k < 1) { const sz = Math.max(3, Math.round(f.width * (0.3 + 0.6 * k))); bx.drawImage(f, Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz); return; }
      if (hint && Math.floor(t * 3) % 2) { bx.fillStyle = '#ffffff'; bx.fillRect(p.x - 9, p.y - 1, 1, 2); bx.fillRect(p.x + 8, p.y - 1, 1, 2); bx.fillRect(p.x - 1, p.y - 9, 2, 1); bx.fillRect(p.x - 1, p.y + 8, 2, 1); }
      bx.drawImage(f, Math.round(p.x - f.width / 2), Math.round(p.y - f.height / 2 + (Math.floor(t * 2 + i) % 2)));
    });
  }
  function drawEgg(o) {
    const c = itemSpr('egg', o.e.kind), wt = egw.get(o.e.id) || 0;
    const need = eggNeed(o.e), taps = o.e.taps || 0;
    const wob = wt > 0 ? (Math.floor(t * 30) % 2 ? 1 : -1) : (Math.floor(t * 1.5 + o.x) % 4 === 0 ? 1 : 0);
    const ex = o.x + wob;
    shadow(o.x, o.y, Math.round(c.width * 0.75));
    PX.blit(bx, c, ex, o.y + 1);
    // cracks grow with taps
    const cw = c.width, ch = c.height, top = o.y + 1 - ch, left = ex - Math.floor(cw / 2);
    const cracks = [[[0.4, 0.14], [0.45, 0.19], [0.4, 0.24], [0.45, 0.29], [0.5, 0.33]], [[0.62, 0.5], [0.67, 0.46], [0.72, 0.5], [0.77, 0.46]], [[0.22, 0.46], [0.27, 0.5], [0.32, 0.46], [0.37, 0.5]], [[0.5, 0.62], [0.55, 0.66], [0.5, 0.7], [0.56, 0.74]]];
    const shown = Math.min(cracks.length, Math.floor(taps / need * (cracks.length + 1)));
    bx.fillStyle = INK;
    for (let i = 0; i < shown; i++) for (const [fx, fy] of cracks[i]) bx.fillRect(left + Math.round(fx * cw), top + Math.round(fy * ch), 1, 1);
    if ((D.EGGS[o.e.kind] || {}).sparkle && Math.floor(t * 2 + o.x) % 3 === 0) { bx.fillStyle = '#ffffff'; bx.fillRect(left + cw - 2, top + 2, 1, 3); bx.fillRect(left + cw - 3, top + 3, 3, 1); }
    if (!taps && Math.floor(t * 3) % 2) { bx.fillStyle = '#ffffff'; const cx = o.x, cy = top + ch / 2; bx.fillRect(cx - cw / 2 - 4, cy, 2, 1); bx.fillRect(cx + cw / 2 + 2, cy, 2, 1); bx.fillRect(cx, top - 4, 1, 2); }
  }
  function drawCritter(c) {
    if (c.life < 3 && Math.floor(t * 10) % 2) return;
    const a = D.ANIMALS[c.id], flip = c.facing < 0;
    if (c.where === 'water') {
      const bob = Math.floor(t * 2 + c.ph) % 2;
      if (PX.critterSwim) { const s = swimSpr(c.id); PX.blit(bx, s, c.x, c.y + bob, flip, Math.floor(s.width / 2), s.height); } // already cut at the waterline
      else {
        const s = critterSpr(c.id), wl = Math.round(c.y - 3);
        bx.save(); bx.beginPath(); bx.rect(0, 0, ww, wl); bx.clip(); PX.blit(bx, s, c.x, c.y + 3 + bob, flip, Math.floor(s.width / 2), s.height - 1); bx.restore();
        waterline(c.x, wl, Math.max(4, Math.round(s.width / 2) - 1));
      }
    } else {
      const s = critterSpr(c.id);
      if (c.where === 'air') { const fl = Math.floor(t * 8 + c.ph) % 2; shadow(c.x, Math.min(Lw.maxY, c.y + 22), 5); PX.blit(bx, s, c.x, c.y - fl, flip, Math.floor(s.width / 2), s.height - 1); }
      else { const hopY = c.hopT < 1 ? Math.round(Math.sin(c.hopT * Math.PI) * (c.where === 'coast' ? 2 : 4)) : 0; shadow(c.x, c.y, Math.max(7, s.width - 8)); PX.blit(bx, s, c.x, c.y - hopY, flip, Math.floor(s.width / 2), s.height - 1); }
    }
    if (!seen('catch') && Math.floor(t * 3) % 2) { const Y = Math.round(c.y) - (a.where === 'water' ? 12 : 21); bx.fillStyle = '#ffffff'; bx.fillRect(Math.round(c.x) - 1, Y, 3, 1); bx.fillRect(Math.round(c.x), Y - 1, 1, 3); }
  }
  function drawDrop(d) {
    if (d.life < 6 && Math.floor(t * 8) % 2) return;
    const s = dropSpr(d), bob = d.z > 0 ? 0 : Math.round(Math.sin(t * 3 + d.x) * 1);
    shadow(d.x, d.y, Math.max(5, s.width - 2));
    PX.blit(bx, s, d.x, d.y - 2 - bob - d.z);
    if (Math.floor(t * 4 + d.x) % 5 === 0) { bx.fillStyle = '#ffffff'; bx.fillRect(Math.round(d.x + s.width / 2), Math.round(d.y - s.height - 2), 1, 1); }
  }
  function drawGroundFruit(f) { const s = itemSpr('fruit', f.kind); shadow(f.x, f.y, 7); PX.blit(bx, s, f.x, f.y + 1 - f.z); }
  function drawClouds(n) {
    const th = TH[area], a = th.bigMoon ? 0.5 : 1 - n * 0.75;
    if (a <= 0.05) return;
    bx.globalAlpha = a;
    for (const c of DECO.clouds) {
      const x = Math.round(((c.x * (ww + 30) + t * c.v) % (ww + 30)) - 15), y = Math.round(c.y * Lw.hz), s = c.s;
      bx.fillStyle = th.cloud[1]; bx.fillRect(x - 6 - s * 2, y + 1, 13 + s * 4, 2);
      bx.fillStyle = th.cloud[0]; bx.fillRect(x - 6 - s * 2, y - 1, 13 + s * 4, 2); bx.fillRect(x - 3 - s, y - 3, 7 + s * 2, 2); bx.fillRect(x - 1, y - 4, 3 + s * 2, 1);
    }
    bx.globalAlpha = 1;
  }
  function moonPos() { return { x: Math.round(ww * 0.74), y: Math.round(Lw.hz * 0.36) }; }
  function drawSunMoon(n) {
    const th = TH[area], m = moonPos();
    if (!th.bigMoon && n < 0.98) { const s = sunSprite(); PX.blit(bx, s, m.x, Math.round(m.y + 8 + n * Lw.hz * 0.9)); }
    const mv = th.bigMoon ? 1 : n;
    if (mv > 0.02) { const s = moonSprite(th.bigMoon); PX.blit(bx, s, m.x, Math.round(m.y + s.height / 2 + (1 - mv) * Lw.hz * 0.9)); }
  }
  function drawWater(dt, n) {
    const th = TH[area], wt = Lw.waterTop;
    // shoreline foam
    bx.fillStyle = th.foam;
    for (let y = wt + 1; y < wh; y++) { const s = shoreAt(y), w = Math.sin(t * 2.2 + y * 0.45); if (w > -0.2) bx.fillRect(s + 1, y, w > 0.6 ? 2 : 1, 1); }
    // little wave marks
    for (const w of DECO.waves) {
      const y = Math.round(wt + 4 + w.y * (Lw.maxY - wt)), s = shoreAt(y), x = Math.round(s + 4 + w.x * (ww - s - 6) + Math.sin(t * 0.5 + w.ph) * 2);
      if (Math.sin(t * 1.3 + w.ph) < -0.3) continue;
      bx.fillStyle = depthK(x, y) > 0.45 ? th.water[1] : th.hl; bx.fillRect(x, y, w.w, 1);
    }
    // surf rolling in (beach)
    if (th.surf) {
      bx.fillStyle = th.foam;
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.16 + i * 0.5) % 1; if (p > 0.92) continue;
        for (let y = wt + 3; y < wh; y++) { if ((y + i) % 2 && p < 0.7) continue; const s = shoreAt(y), X = Math.round(ww - p * (ww - s - 2) + Math.sin(y * 0.5 + i * 3) * 1.5); bx.fillRect(X, y, p > 0.6 ? 2 : 1, 1); }
      }
    }
    // sparkles
    if (Math.floor(t * 2) % 2) { bx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { const y = Math.round(wt + 8 + ((i * 37 + Math.floor(t * 0.5) * 13) % Math.max(1, Lw.maxY - wt - 8))), s = shoreAt(y); bx.fillRect(Math.round(s + (ww - s) * (0.3 + i * 0.22)), y, 2, 1); } }
    // moon reflection
    const moonA = th.bigMoon ? 0.55 + 0.35 * n : n * 0.8;
    if (moonA > 0.1) {
      const m = moonPos(); bx.fillStyle = `rgba(255,246,201,${moonA})`;
      for (let y = wt + 1, i = 0; y < wt + 34 && y < wh; y += 2, i++) { if (m.x < shoreAt(y) + 2) continue; const w = 1 + ((i * 7 + Math.floor(t * 3)) % 3) + Math.max(0, 3 - i / 3); bx.fillRect(Math.round(m.x - w / 2 + Math.sin(t * 2 + i) * 1), y, Math.round(w), 1); }
    }
    // soda fizz
    if (th.fizz) {
      if (Math.random() < dt * 9) { const q = waterPoint(0.05, 0.95); fizz.push({ x: q.x, y: q.y, life: rand(0.8, 1.6) }); }
      for (const f of fizz) {
        f.life -= dt; f.y -= 5 * dt; f.x += Math.sin(t * 6 + f.y) * 0.1;
        const X = Math.round(f.x), Y = Math.round(f.y);
        if (!inWater(X, Y)) { f.life = 0; continue; }
        bx.fillStyle = '#ffffff';
        if (f.life > 0.4) { bx.fillRect(X, Y - 1, 1, 1); bx.fillRect(X - 1, Y, 1, 1); bx.fillRect(X + 1, Y, 1, 1); bx.fillRect(X, Y + 1, 1, 1); } else bx.fillRect(X, Y, 1, 1);
      }
      fizz = fizz.filter(f => f.life > 0);
    }
  }
  function drawLights(n) {
    const th = TH[area], lit = th.bigMoon ? 0.45 + 0.55 * n : n;
    if (lit < 0.08) return;
    const m = moonPos();
    // twinkling stars and the moon above the dark overlay
    for (const s of DECO.stars) if (s.tw && Math.sin(t * 2 + s.ph) > -0.2) { bx.fillStyle = `rgba(255,255,255,${lit})`; const X = Math.round(s.x * ww), Y = Math.round(s.y * (Lw.hz - 8)); bx.fillRect(X, Y, 1, 1); if (Math.sin(t * 2 + s.ph) > 0.8) { bx.fillRect(X - 1, Y, 3, 1); bx.fillRect(X, Y - 1, 1, 3); } }
    if (th.bigMoon || n > 0.9) glow(m.x, m.y + (th.bigMoon ? 11 : 7), th.bigMoon ? 16 : 11, '255,246,201', 0.12 * lit);
    // lamps, windows, glowing props
    if (Lw.lamp) { glow(Lw.lamp.x, Lw.lamp.y, 7, '255,236,150', 0.35 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(Lw.lamp.x - 1, Lw.lamp.y - 1, 3, 3); }
    if (Lw.house) { const hc = Lw.house.c, X = Lw.house.x - Math.floor(hc.width / 2) + Math.round(hc.width * 0.64), Y = Lw.house.y - hc.height + Math.round(hc.height * 0.62); glow(X, Y, 5, '255,236,150', 0.4 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(X - 1, Y - 1, 2, 2); }
    for (const p of Lw.props) { const g = GLOWS[p.kind]; if (!g) continue; const pulse = 0.8 + Math.sin(t * 2 + p.x) * 0.2; glow(p.x, p.y - p.c.height * g[1], g[2], g[3], 0.3 * lit * pulse); }
    // fireflies
    const count = Math.round((th.bigMoon ? 4 : 0) + 5 * n);
    for (let i = 0; i < Math.min(count, DECO.flies.length); i++) {
      const f = DECO.flies[i], p = t * 0.25 + f.p;
      const x = Math.round(8 + (Math.sin(p * 1.3 + f.a * 6) * 0.5 + 0.5) * (shoreAt(Lw.minY + 20) - 12)), y = Math.round(Lw.minY - 6 + (Math.sin(p * 1.9 + f.b * 6) * 0.5 + 0.5) * Lw.span * 0.8);
      if (Math.sin(t * 3 + f.p * 3) < -0.3) continue;
      glow(x, y, 2, '255,242,122', 0.35); bx.fillStyle = '#fff27a'; bx.fillRect(x, y, 1, 1);
    }
  }
  function drawParticles(dt) {
    for (const p of parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += 70 * dt;
      if (p.type === 'feather') p.vx = Math.sin(t * 6 + p.y) * 8;
      if (p.life < 0.25 && Math.floor(t * 20) % 2) continue;
      const X = Math.round(p.x), Y = Math.round(p.y);
      switch (p.type) {
        case 'heart': bx.drawImage(PX.fx('heart'), X - 3, Y - 3); break;
        case 'spark': bx.drawImage(PX.fx('spark', p.color), X - 1, Y - 1); break;
        case 'shell': bx.drawImage(PX.fx('shell'), X, Y); break;
        case 'leaf': bx.drawImage(PX.fx('leaf'), X, Y); break;
        case 'drop': bx.drawImage(PX.fx('drop', p.color), X, Y); break;
        case 'feather': bx.drawImage(PX.fx('feather'), X, Y); break;
        case 'dust': bx.fillStyle = p.color; bx.fillRect(X, Y, 1, 1); break;
        case 'ripple': { const w = Math.round(3 + (0.8 - p.life) * 10); bx.fillStyle = p.color; bx.fillRect(X - w, Y, 2, 1); bx.fillRect(X + w - 1, Y, 2, 1); break; }
      }
    }
    parts = parts.filter(p => p.life > 0);
  }

  // ---------------- update + render ----------------
  function update(dt) {
    const night = PS.clock.isNight();
    here = PS.S.sprouts.filter(s => s.area === area).map(getRT);
    for (const r of here) updateSprout(r, dt, night);
    updateCritters(dt);
    // drops
    if (t > nextDrop) { spawnDrop(); nextDrop = t + rand(...D.GROWTH.dropEverySec); }
    const dl = drops[area] || [];
    for (const d of dl) { d.life -= dt; if (d.z > 0 || d.vz) { d.vz += TUNE.gravity * 0.6 * dt; d.z -= d.vz * dt; if (d.z <= 0) { d.z = 0; if (!d.bounced && d.vz > 30) { d.vz = -d.vz * 0.35; d.bounced = true; d.z = 0.01; } else d.vz = 0; } } }
    if (dl.some(d => d.life <= 0)) drops[area] = dl.filter(d => d.life > 0);
    // ground fruit falls to the grass
    for (const f of ground[area] || []) if (f.z > 0) { f.vz += TUNE.gravity * dt; f.z = Math.max(0, f.z - f.vz * dt); }
    for (const [id, v] of egw) { if (v > 0) egw.set(id, v - dt); }
    // periodic XP flush + save
    flushT -= dt; if (flushT <= 0) { flushT = TUNE.xpFlushSec; flushAll(); }
    saveT -= dt; if (saveT <= 0) { saveT = 6; PS.save(); }
    cleanT -= dt; if (cleanT <= 0) { cleanT = 5; for (const id of RT.keys()) if (!ST.get(id)) RT.delete(id); }
  }
  function render(dt) {
    const n = PS.clock.night(), th = TH[area];
    ensureBg(n);
    bx.imageSmoothingEnabled = false;
    bx.drawImage(skyC, 0, 0);
    drawSunMoon(n);
    drawClouds(n);
    bx.drawImage(bgC, 0, 0);
    drawWater(dt, n);
    const list = [{ y: Lw.tree.y, fn: drawTree }];
    for (const p of Lw.props) list.push({ y: p.y, fn: () => PX.blit(bx, p.c, p.x, p.y) });
    for (const o of eggsHere()) list.push({ y: o.y, fn: () => drawEgg(o) });
    const emQ = [], top = [];
    for (const r of here) { if (r.state === 'held' || r.state === 'fall') top.push(r); else list.push({ y: r.y, fn: () => drawSprout(r, emQ) }); }
    for (const c of critters) if (c.where !== 'air') list.push({ y: c.y, fn: () => drawCritter(c) });
    for (const f of ground[area] || []) list.push({ y: f.y, fn: () => drawGroundFruit(f) });
    list.sort((a, b) => a.y - b.y).forEach(o => o.fn());
    for (const c of critters) if (c.where === 'air') drawCritter(c);
    for (const r of top) drawSprout(r, emQ);
    // night overlay over the land (the sky already has its own night colours)
    const na = th.dim + (th.night[3] - th.dim * 0.5) * n;
    if (na > 0.01) {
      const [cr, cg, cb] = th.night, y0 = Lw.hz - 14;
      for (let i = 0; i < 4; i++) { bx.fillStyle = `rgba(${cr},${cg},${cb},${na * (i + 1) / 5})`; bx.fillRect(0, y0 + i * 3, ww, 3); }
      bx.fillStyle = `rgba(${cr},${cg},${cb},${na})`; bx.fillRect(0, y0 + 12, ww, wh);
    }
    drawLights(n);
    // drops sit above the night tint so they always sparkle
    for (const d of drops[area] || []) { if (n > 0.3 || th.dim) glow(d.x, d.y - 6 - d.z, 6, '255,242,170', 0.25); drawDrop(d); }
    // emote bubbles, markers and particles stay bright
    for (const [r, x, y] of emQ) if (r.emote) PX.blit(bx, PX.emote(r.emote), x + 3, y, false, 2, 13);
    const mark = drag && drag.hover ? drag.hover : sel ? RT.get(sel) : null;
    if (mark && here.includes(mark) && !busy(mark)) PX.blit(bx, arrowSprite(), mark.x, headY(mark) - 2 - (Math.floor(t * 3) % 2) - (mark.emote ? 13 : 0));
    drawParticles(dt);

    // present, then crisp text at display resolution
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, ww * PXS * DPR, wh * PXS * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (here.some(r => r.state === 'held')) drawZoneLabels();
    ctx.font = '700 16px "Pixelify Sans", monospace';
    for (const f of floaters) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.life -= dt; f.y -= 10 * dt;
      if (f.life < 0.3 && Math.floor(t * 20) % 2) continue;
      const X = Math.round(clamp(f.x * PXS, 80, W - 80)), Y = Math.round(Math.max(28, f.y * PXS));
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff8e6'; ctx.strokeText(f.text, X, Y); ctx.fillStyle = f.color; ctx.fillText(f.text, X, Y);
    }
    floaters = floaters.filter(f => f.life > 0);
  }
  function drawZoneLabels() {
    const y = Math.round((Lw.minY + Lw.span * 0.62) * PXS), s = shoreAt(Lw.minY + Lw.span * 0.62);
    const lab = (text, wx, deep) => {
      const X = Math.round(wx * PXS); ctx.font = '700 13px "Pixelify Sans", monospace';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = deep ? 'rgba(34,32,52,.55)' : 'rgba(255,248,230,.75)'; roundRect(X - w / 2, y - 12, w, 20, 8); ctx.fill();
      ctx.fillStyle = deep ? '#fff8e6' : '#2f6f8f'; ctx.fillText(text, X, y + 3);
    };
    lab('Swim', s + (ww - s) * 0.2, false);
    lab('Travel', s + (ww - s) * 0.72, true);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------------- input: world ----------------
  function local(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / PXS, y: (e.clientY - r.top) / PXS }; }
  function sproutAt(p, k) {
    let best = null, bd = 1e9;
    for (const r of here) {
      if (r.state === 'travel' || r.state === 'arrive' || r.state === 'held' || r.state === 'cocoon') continue;
      const hx = r.x, hy = (r.state === 'fall' ? r.y - r.z : r.y) - 10, d = Math.hypot(p.x - hx, p.y - hy);
      if (d < 12 * (k || 1) && d < bd) { bd = d; best = r; }
    }
    return best;
  }
  function onDown(e) {
    if (!visible || press || drag || (e.button != null && e.button > 0)) return;
    PX.Sound.unlock();
    const p = local(e); ptr.x = ptr.px = p.x; ptr.y = ptr.py = p.y; ptr.vx = 0;
    const base = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, ms: performance.now() };
    for (const o of eggsHere()) { const c = itemSpr('egg', o.e.kind); if (Math.hypot(p.x - o.x, p.y - (o.y - c.height / 2)) < Math.max(12, c.height / 2 + 2)) { closeCard(); tapEgg(o); return; } }
    for (const d of (drops[area] || []).slice().reverse()) if (Math.hypot(p.x - d.x, p.y - (d.y - 5 - d.z)) < 9) { collectDrop(d); return; }
    const sl = treeSlots();
    for (let i = 0; i < sl.length; i++) { const q = Lw.slots[i]; if (q && growK(sl[i]) >= 1 && Math.hypot(p.x - q.x, p.y - q.y) < 7.5) { press = Object.assign({ kind: 'tree', i, x0: p.x, y0: p.y }, base); return; } }
    const gl = ground[area] || [];
    for (let i = gl.length - 1; i >= 0; i--) { const f = gl[i]; if (Math.hypot(p.x - f.x, p.y - (f.y - 5)) < 7.5) { press = Object.assign({ kind: 'gfruit', f, x0: p.x, y0: p.y }, base); return; } }
    for (const c of critters) if (critterHit(c, p)) { catchCritter(c); return; }
    const r = sproutAt(p);
    if (r) { press = Object.assign({ kind: 'sprout', r, t0: t, x0: p.x, y0: p.y, mode: 'pending', rub: 0 }, base); return; }
    press = Object.assign({ kind: 'bg' }, base);
  }
  function onMove(e) {
    if (!visible) return;
    if (trayPress && trayPress.pid === e.pointerId && !drag) trayPressMove(e);
    if (drag && drag.pid === e.pointerId) { moveGhost(e); updateHover(e); }
    if (!press || press.pid !== e.pointerId) return;
    const p = local(e);
    ptr.vx = lerp(ptr.vx, p.x - ptr.x, 0.5); ptr.x = p.x; ptr.y = p.y;
    if (press.kind === 'tree' || press.kind === 'gfruit') {
      if (Math.hypot(p.x - press.x0, p.y - press.y0) > 3) {
        let kind;
        if (press.kind === 'tree') kind = takeTreeFruit(press.i);
        else { const gl = ground[area] || [], i = gl.indexOf(press.f); if (i < 0) { press = null; return; } gl.splice(i, 1); kind = press.f.kind; }
        const src = press.kind; press = null;
        startDrag(src, kind, e, -1);
      }
    } else if (press.kind === 'sprout') {
      if (press.mode === 'pending' && Math.hypot(p.x - press.x0, p.y - press.y0) > 2.5) press.mode = 'rub';
      if (press.mode === 'rub') {
        press.rub += Math.hypot(p.x - ptr.px, p.y - ptr.py);
        while (press.rub > TUNE.rubStep) { press.rub -= TUNE.rubStep; petSprout(press.r, false); }
        if (Math.hypot(p.x - press.r.x, p.y - (press.r.y - 10)) > 22) press = null;
      }
    }
    ptr.px = p.x; ptr.py = p.y;
  }
  function onUp(e, cancelled) {
    if (!visible) return;
    if (trayPress && trayPress.pid === e.pointerId) trayPressUp(e, cancelled);
    if (drag && drag.pid === e.pointerId) endDrag(e, cancelled);
    if (!press || press.pid !== e.pointerId) return;
    const pr = press; press = null;
    if (cancelled) { if (pr.kind === 'sprout' && pr.mode === 'hold' && pr.r.state === 'held') release(pr.r); return; }
    if (pr.kind === 'tree') { const kind = takeTreeFruit(pr.i); ST.addFruit(kind, 1); floater(`+1 ${D.FRUITS[kind].name}`, '#5b4630', Lw.slots[pr.i].x, Lw.slots[pr.i].y - 6); markSeen('pick'); return; }
    if (pr.kind === 'gfruit') { const gl = ground[area] || [], i = gl.indexOf(pr.f); if (i >= 0) { gl.splice(i, 1); ST.addFruit(pr.f.kind, 1); floater(`+1 ${D.FRUITS[pr.f.kind].name}`, '#5b4630', pr.f.x, pr.f.y - 12); snd('pop'); } return; }
    if (pr.kind === 'sprout') {
      if (pr.mode === 'pending') tapSprout(pr.r);
      else if (pr.mode === 'hold' && pr.r.state === 'held') release(pr.r);
      return;
    }
    if (pr.kind === 'bg') {
      const dx = e.clientX - pr.sx, dy = e.clientY - pr.sy, ms = performance.now() - pr.ms;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && ms < 700) { switchArea(dx < 0 ? 1 : -1); return; }
      if (Math.hypot(dx, dy) < 10) closeCard();
    }
  }
  function tapSprout(r) {
    if (r.state === 'sleep') { snd('tick'); }
    else if (!busy(r) && r.state !== 'eat' && r.state !== 'swim') { r.state = 'idle'; r.timer = 1.4; emote(r, pick(['!', 'heart', 'note']), 1); hop(r); snd('coo'); }
    openCard(r);
  }

  // ---------------- dragging (fruit / animals / tree fruit) ----------------
  function startDrag(src, id, e, idx, el) {
    closeCard();
    drag = { src, id, idx, el, pid: e.pointerId, hover: null };
    const s = src === 'pouch' ? critterSpr(id) : itemSpr('fruit', id);
    ghostEl.width = s.width; ghostEl.height = s.height;
    gctx.imageSmoothingEnabled = false; gctx.clearRect(0, 0, s.width, s.height); gctx.drawImage(s, 0, 0);
    const sc = Math.max(2, Math.floor(56 / Math.max(s.width, s.height)));
    ghostEl.style.width = s.width * sc + 'px'; ghostEl.style.height = s.height * sc + 'px';
    drag.gw = s.width * sc; drag.gh = s.height * sc;
    if (el) el.classList.add('g-lift');
    moveGhost(e); snd('pop');
  }
  function ghostPoint(e) { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top - 44 }; }
  function moveGhost(e) { const g = ghostPoint(e); ghostEl.style.transform = `translate(${Math.round(g.x - drag.gw / 2)}px, ${Math.round(g.y - drag.gh / 2)}px)`; }
  function dropTarget(e) {
    const r = cv.getBoundingClientRect(), g = ghostPoint(e), cr = root.getBoundingClientRect();
    const pg = { x: (g.x + cr.left - r.left) / PXS, y: (g.y + cr.top - r.top) / PXS + 4 };
    return sproutAt(pg, 1.5) || sproutAt(local(e), 1.3);
  }
  function updateHover(e) { drag.hover = dropTarget(e); }
  function endDrag(e, cancelled) {
    const d = drag; drag = null;
    ghostEl.style.transform = 'translate(-999px,-999px)';
    if (d.el) d.el.classList.remove('g-lift');
    const target = cancelled ? null : dropTarget(e);
    if (d.src === 'pouch') { if (target) giveAnimal(target, d.idx, d.id); }
    else if (d.src === 'fruitinv') { if (target && ST.useFruit(d.id)) feedSprout(target, d.id); }
    else if (target) feedSprout(target, d.id);
    else {
      // fruit picked in the world: drop it on the grass (Sprouts walk over to eat it) or it sinks
      const g = ghostPoint(e), cr = root.getBoundingClientRect(), r = cv.getBoundingClientRect();
      const wx = clamp((g.x + cr.left - r.left) / PXS, 5, ww - 5), wy = (g.y + cr.top - r.top) / PXS + 6, gy = clamp(wy, Lw.minY, Lw.maxY);
      if (inWater(wx, gy)) { burst(wx, gy - 1, 'drop', 8, '#cbdbfc'); snd('splash'); floater('Plop. It sank.', '#5b4630', wx, gy - 8); }
      else (ground[area] || (ground[area] = [])).push({ kind: d.id, x: wx, y: gy, z: Math.max(0, gy - wy), vz: 0 });
    }
    if (trayDirty) renderTray();
  }

  // ---------------- tray (pouch + fruit) ----------------
  function renderTray() {
    if (!mounted) return;
    if (drag) { trayDirty = true; return; }
    trayDirty = false;
    const animals = PS.S.pouch.filter(id => !D.RARES[id]).length;
    pouchCnt.textContent = `${animals}/${D.GROWTH.pouchMax}`;
    pouchCnt.classList.toggle('g-full', animals >= D.GROWTH.pouchMax);
    pouchStrip.innerHTML = '';
    if (!PS.S.pouch.length) pouchStrip.innerHTML = '<span class="g-empty">Tap animals in the garden to catch them</span>';
    PS.S.pouch.forEach((id, i) => {
      const c = ST.creature(id); if (!c) return;
      pouchStrip.appendChild(slotEl(critterSpr(id), { src: 'pouch', id, i }, c.name, D.RARES[id] ? 'g-rare' : ''));
    });
    fruitStrip.innerHTML = '';
    const fr = Object.entries(PS.S.fruits || {}).filter(([k, n]) => n > 0 && D.FRUITS[k]);
    if (!fr.length) fruitStrip.innerHTML = '<span class="g-empty">Tap fruit on the tree to pick it</span>';
    for (const [k, n] of fr) fruitStrip.appendChild(slotEl(itemSpr('fruit', k), { src: 'fruitinv', id: k, i: -1 }, D.FRUITS[k].name, '', n));
  }
  function slotEl(s, data, label, cls, count) {
    const b = document.createElement('button'); b.className = 'g-slot ' + (cls || ''); b.type = 'button';
    b.setAttribute('aria-label', `${label}${count ? ' x' + count : ''}. Drag onto a Sprout.`);
    const c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0);
    const sc = Math.max(1, Math.floor(38 / Math.max(s.width, s.height))); c.style.width = s.width * sc + 'px'; c.style.height = s.height * sc + 'px';
    b.appendChild(c);
    if (count) { const n = document.createElement('i'); n.className = 'g-n'; n.textContent = count; b.appendChild(n); }
    b.addEventListener('pointerdown', e => {
      if (!visible || drag || (e.button != null && e.button > 0)) return;
      PX.Sound.unlock();
      trayPress = { el: b, data, pid: e.pointerId, x0: e.clientX, y0: e.clientY, mouse: e.pointerType === 'mouse', timer: setTimeout(() => { if (trayPress && trayPress.el === b && !drag) beginTrayDrag(trayPress.last || e); }, 320) };
      trayPress.last = e;
    });
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  }
  function beginTrayDrag(e) {
    const tp = trayPress; if (!tp) return; clearTimeout(tp.timer); trayPress = null;
    startDrag(tp.data.src, tp.data.id, { pointerId: tp.pid, clientX: e.clientX, clientY: e.clientY }, tp.data.i, tp.el);
  }
  function trayPressMove(e) {
    const tp = trayPress; tp.last = { clientX: e.clientX, clientY: e.clientY };
    const dx = e.clientX - tp.x0, dy = e.clientY - tp.y0;
    if (tp.mouse ? Math.hypot(dx, dy) > 6 : (dy < -7 && Math.abs(dy) > Math.abs(dx))) beginTrayDrag(e);
    else if (!tp.mouse && Math.abs(dx) > 9) { clearTimeout(tp.timer); trayPress = null; } // it's a scroll
  }
  function trayPressUp(e, cancelled) {
    const tp = trayPress; clearTimeout(tp.timer); trayPress = null;
    if (cancelled || Math.hypot(e.clientX - tp.x0, e.clientY - tp.y0) > 8) return;
    const { src, id } = tp.data;
    snd('tick');
    if (src === 'pouch') {
      const c = ST.creature(id), g = Object.entries(c.gives).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${D.STAT_META[k].label}`).join(', ');
      PS.ui.toast(`${c.name}: ${g}. Drag it onto a Sprout.`, 3000);
    } else { const f = D.FRUITS[id]; PS.ui.toast(`${f.name}: ${f.desc} Drag it onto a Sprout.`, 3000); }
  }

  // ---------------- info card ----------------
  function openCard(r) { sel = r.id; renderCard(); cardEl.hidden = false; hintEl.style.opacity = 0; }
  function closeCard() { if (!cardEl || cardEl.hidden) { sel = null; return; } cardEl.hidden = true; sel = null; }
  function stateText(r) {
    switch (r.state) { case 'sleep': return 'Sleeping'; case 'swim': case 'wait': return 'Swimming'; case 'eat': return 'Eating'; case 'walk': return 'Wandering'; default: return r.s.happy > 75 ? 'Very happy' : r.s.happy < 30 ? 'A bit sad' : 'Content'; }
  }
  function renderCard() {
    const r = sel && RT.get(sel);
    if (!r || r.s.area !== area || !PS.S.sprouts.includes(r.s)) { closeCard(); return; }
    const s = r.s, fi = ST.formInfo(s);
    const pz = Math.floor(t * 1.2) % 2 ? { eyes: 'happy', mouth: 'open' } : {};
    const c = PX.sprig(ST.lookOf(s), pz);
    if (card.spr.width !== c.width || card.spr.height !== c.height) { card.spr.width = c.width; card.spr.height = c.height; }
    card.spr.style.width = c.width * 2 + 'px'; card.spr.style.height = c.height * 2 + 'px';
    const x = card.spr.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0);
    card.name.textContent = s.name;
    card.sub.textContent = `${fi.name} · Lv ${ST.totalLevels(s)} · ${stateText(r)}`;
    card.tag.hidden = s.id !== PS.S.activeId;
    D.STATS.forEach((k, i) => {
      const st = s.stats[k], row = card.stats[i];
      row.lv.textContent = st.lv;
      row.bar.style.width = Math.round(clamp(st.xp / D.GROWTH.xpForLevel(st.lv), 0, 1) * 100) + '%';
    });
    card.happy.style.width = Math.round(s.happy) + '%';
    card.energy.style.width = Math.round(s.energy) + '%';
    card.partner.disabled = s.id === PS.S.activeId;
    card.partner.textContent = s.id === PS.S.activeId ? 'Partner' : 'Set partner';
  }
  function cardAction(a) {
    const r = sel && RT.get(sel); if (!r) return;
    const s = r.s; snd('pop');
    if (a === 'close') closeCard();
    if (a === 'travel') { if (busy(r)) return; closeCard(); askTravel(s, false); }
    if (a === 'partner') { ST.setActive(s.id); PS.ui.toast(`${s.name} is your partner now. Partners race and battle.`, 2800); renderCard(); }
    if (a === 'details') { closeCard(); PS.ui.go('sprouts', { id: s.id }); }
  }

  // ---------------- top bar, hint ----------------
  function updatePill() {
    if (!mounted) return;
    const A = D.AREAS[area], n = PS.S.sprouts.filter(s => s.area === area).length, e = PS.S.eggs.filter(x => x.area === area).length;
    pillName.textContent = A.name;
    pillSub.textContent = `${n} Sprout${n === 1 ? '' : 's'}${e ? ` · ${e} egg${e === 1 ? '' : 's'}` : ''} · ${A.water}`;
    [...dotsEl.children].forEach((d, i) => { d.className = AREA_IDS[i] === area ? 'on' : PS.S.eggs.some(x => x.area === AREA_IDS[i]) ? 'egg' : ''; });
    root.querySelectorAll('.g-arrow').forEach(b => { const a = AREA_IDS[(AREA_IDS.indexOf(area) + (+b.dataset.d) + AREA_IDS.length) % AREA_IDS.length]; b.setAttribute('aria-label', 'Go to ' + areaName(a)); });
  }
  function hintText() {
    const eggs = PS.S.eggs.filter(e => e.area === area);
    const mine = PS.S.sprouts.filter(s => s.area === area);
    if (eggs.length) { const e = eggs[0], left = eggNeed(e) - (e.taps || 0); return e.taps ? `Keep tapping! ${left} more` : 'Tap the egg to hatch it'; }
    if (!PS.S.sprouts.length) { const e = PS.S.eggs[0]; return e ? `Your egg is waiting in ${toArea(e.area)}` : 'Get an egg from the Shop'; }
    if (!mine.length) return `No Sprouts live here yet. Send one swimming from another area.`;
    if (here.some(r => r.state === 'held')) return 'Drop in the shallows to swim, or in the deep water to travel';
    if (critters.length && ST.canCatch() && !seen('catch')) return 'An animal! Tap it to catch it';
    if (PS.S.pouch.length && !seen('give')) return 'Drag an animal from your pouch onto a Sprout';
    if (!seen('feed')) return 'Drag a fruit from the tree onto a Sprout';
    if (!seen('pet')) return 'Rub a Sprout to pet it';
    if ((drops[area] || []).length && !seen('drop')) return 'Something sparkly! Tap it';
    if (!seen('hold')) return 'Press and hold a Sprout to pick it up';
    if (!seen('swim')) return 'Drop a Sprout in the shallows to swim';
    if (!seen('travel')) return 'Drop a Sprout in the deep water to travel';
    if (!seen('area')) return 'Swipe or use the arrows to visit other areas';
    return '';
  }
  function switchArea(dir) { const i = AREA_IDS.indexOf(area); setArea(AREA_IDS[(i + dir + AREA_IDS.length) % AREA_IDS.length], dir); }
  function settleAll() {
    press = null;
    for (const r of here) {
      if (r.state === 'travel') { finishMove(r.s, r.dest); continue; }
      if (r.state === 'held' || r.state === 'fall') { r.y = r.state === 'held' ? heldGround(r) : clamp(r.y, Lw.minY, Lw.maxY); r.z = 0; r.state = inWater(r.x, r.y) ? 'swim' : 'idle'; r.timer = 1; }
      if (r.state === 'eat' || r.state === 'cocoon' || r.state === 'arrive') { r.state = 'idle'; r.eat = null; r.timer = 1; }
      if (r.state === 'wait') r.state = 'swim';
    }
  }
  function setArea(a, dir) {
    if (!D.AREAS[a]) a = 'meadow';
    if (a === area) return;
    settleAll(); flushAll();
    area = a; PS.S.area = a; PS.save(); PS.emit('area', { area: a });
    critters = []; fizz = []; parts = []; floaters = [];
    nextCritter = t + rand(...D.GROWTH.critterEverySec) * 0.35;
    here = PS.S.sprouts.filter(s => s.area === area).map(getRT);
    closeCard(); buildProps(); skyKey = ''; bgKey = '';
    cv.classList.remove('g-in-l', 'g-in-r'); void cv.offsetWidth; cv.classList.add(dir < 0 ? 'g-in-l' : 'g-in-r');
    updatePill(); snd('whoosh'); markSeen('area');
  }

  // ---------------- CSS ----------------
  const CSS = `
.g-root{position:absolute;inset:0;overflow:hidden;background:#8fd46a}
.g-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;image-rendering:pixelated;image-rendering:crisp-edges}
.g-cv.g-in-r{animation:gInR .28s ease-out}.g-cv.g-in-l{animation:gInL .28s ease-out}
@keyframes gInR{from{opacity:.3;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes gInL{from{opacity:.3;transform:translateX(-18px)}to{opacity:1;transform:none}}
.g-top{position:absolute;top:8px;left:8px;right:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;pointer-events:none;z-index:3}
.g-top>*{pointer-events:auto}
.g-arrow{flex:0 0 auto;width:44px;height:44px;border-radius:14px;background:var(--panel);border:2px solid var(--edge);border-bottom-width:4px;display:grid;place-items:center;padding:0;color:var(--ink)}
.g-arrow:active{transform:translateY(2px);border-bottom-width:2px;margin-top:2px}
.g-arrow svg{width:18px;height:18px}
.g-pill{background:var(--panel);border:2px solid var(--line);border-bottom:4px solid var(--edge);border-radius:16px;padding:4px 14px 5px;text-align:center;min-width:0;max-width:230px;flex:0 1 auto}
.g-pill b{display:block;font-family:var(--f-px);font-weight:700;font-size:18px;line-height:1.1;white-space:nowrap}
.g-pill span{display:block;font-size:12px;color:var(--ink-soft);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-dots{display:flex;gap:5px;justify-content:center;margin-top:3px}
.g-dots i{width:7px;height:7px;border-radius:2px;background:var(--line)}
.g-dots i.on{background:var(--sun-edge)}.g-dots i.egg{background:var(--berry)}
.g-tray{position:absolute;left:8px;right:8px;bottom:8px;padding:6px 8px 7px;z-index:3;display:grid;gap:3px}
.g-row{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:6px}
.g-rl{font-family:var(--f-px);font-weight:600;font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;line-height:1.15}
.g-rl span{display:block;font-family:var(--f-ui);font-weight:700;color:var(--ink);font-size:13px;letter-spacing:0;text-transform:none}
.g-rl span.g-full{color:var(--berry)}
.g-strip{display:flex;gap:7px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x;scrollbar-width:none;padding:3px 6px 5px 2px;min-height:50px;align-items:center;overscroll-behavior-x:contain}
.g-strip::-webkit-scrollbar{display:none}
.g-slot{flex:0 0 auto;position:relative;width:44px;height:44px;border-radius:12px;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;display:grid;place-items:center;padding:0;touch-action:pan-x;cursor:grab;-webkit-touch-callout:none}
.g-slot canvas{image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none;display:block}
.g-slot.g-rare{background:#fff4c2;border-color:#e0a800;box-shadow:inset 0 0 0 2px #fff27a}
.g-slot.g-lift{opacity:.35}
.g-slot .g-n{position:absolute;right:-5px;bottom:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--ink);color:var(--panel);font:700 11px/18px var(--f-ui);font-style:normal;text-align:center;padding:0 4px}
.g-empty{font-size:13px;color:var(--ink-soft);font-weight:600;padding-left:2px;white-space:nowrap}
.g-ghost{position:absolute;left:0;top:0;pointer-events:none;z-index:30;transform:translate(-999px,-999px);image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 4px 0 rgba(34,32,52,.25))}
.g-hint{z-index:3;width:max-content;max-width:calc(100% - 40px)}
.g-card{position:absolute;left:8px;right:8px;bottom:8px;z-index:6;padding:10px 12px 12px;animation:gUp .2s ease-out;box-shadow:0 -6px 24px rgba(60,44,24,.25)}
@keyframes gUp{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}
.g-ch{display:flex;align-items:center;gap:10px}
.g-ch canvas{image-rendering:pixelated;image-rendering:crisp-edges;flex:0 0 auto;margin:-6px 0 -4px}
.g-cid{flex:1;min-width:0}
.g-cname{font-size:22px;display:flex;align-items:center;gap:8px}
.g-tag{font-family:var(--f-px);font-weight:600;font-size:11px;background:var(--sun);border:2px solid var(--sun-edge);color:#4a3210;border-radius:8px;padding:0 6px;line-height:16px}
.g-csub{font-size:13px;color:var(--ink-soft);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-x{width:40px;height:40px;border-radius:12px;border:2px solid var(--line);background:var(--slot);display:grid;place-items:center;padding:0;flex:0 0 auto;align-self:flex-start}
.g-cstats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0 6px}
.g-st{font-family:var(--f-px);font-weight:600;font-size:11px;text-align:center;line-height:1.2}
.g-st b{display:block;font-family:var(--f-ui);font-size:15px;color:var(--ink)}
.g-mb{height:6px;border-radius:3px;background:var(--slot);border:1px solid var(--line);overflow:hidden;margin-top:2px}
.g-mb i{display:block;height:100%;width:0}
.g-cmood{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 8px;align-items:center;font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink-soft);margin-bottom:10px}
.g-cmood .bar{height:9px}
.g-cbtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.g-cbtns .btn{padding:9px 6px;font-size:15px;min-height:44px}
.g-cbtns .btn[disabled]{opacity:.6}
.g-dest{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.g-destbtn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:9px 10px;background:var(--field);min-height:56px}
.g-destbtn b{font-family:var(--f-px);font-size:16px}
.g-destbtn small{font-size:12px;color:var(--ink-soft);font-weight:600}
.g-destbtn[disabled]{opacity:.5}
.g-a-meadow{background:#e6f6d6}.g-a-beach{background:#fdf1cf}.g-a-moonlit{background:#e6def7}.g-a-candy{background:#fde4f0}
`;
  function injectCSS() { if (document.getElementById('g-style')) return; const st = document.createElement('style'); st.id = 'g-style'; st.textContent = CSS; document.head.appendChild(st); }

  // ---------------- scene contract ----------------
  const chev = d => `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${d < 0 ? '<path d="M5 1h2v1H6v1H5v1H4v1h1v1h1v1h1v1H5V7H4V6H3V5H2V4h1V3h1V2h1z"/>' : '<path d="M2 1h2v1h1v1h1v1h1v1H6v1H5v1H4v1H2V7h1V6h1V5h1V4H4V3H3V2H2z"/>'}</svg>`;
  function mount(el) {
    root = el; injectCSS(); root.classList.add('g-root');
    root.innerHTML = `
      <canvas class="g-cv" aria-label="The garden. Tap and drag to care for your Sprouts."></canvas>
      <div class="g-top">
        <button class="g-arrow" data-d="-1" type="button">${chev(-1)}</button>
        <div class="g-pill"><b></b><span></span><div class="g-dots">${AREA_IDS.map(() => '<i></i>').join('')}</div></div>
        <button class="g-arrow" data-d="1" type="button">${chev(1)}</button>
      </div>
      <div class="hint g-hint" style="opacity:0"></div>
      <footer class="panel g-tray">
        <div class="g-row"><div class="g-rl">Pouch<span class="g-pc">0/8</span></div><div class="g-strip g-pouch"></div></div>
        <div class="g-row"><div class="g-rl">Fruit</div><div class="g-strip g-fruit"></div></div>
      </footer>
      <section class="panel g-card" hidden aria-label="Sprout info">
        <div class="g-ch"><canvas width="32" height="32"></canvas>
          <div class="g-cid"><div class="g-cname px-title"><span class="g-nm"></span><span class="g-tag" hidden>Partner</span></div><div class="g-csub"></div></div>
          <button class="g-x" data-a="close" type="button" aria-label="Close"><svg width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor"><path d="M0 0h2v1h1v1h1V1h1V0h2v2H6v1H5v1h1v1h1v2H5V6H4V5H3v1H2v1H0V5h1V4h1V3H1V2H0z"/></svg></button>
        </div>
        <div class="g-cstats">${D.STATS.map(k => `<div class="g-st" style="color:${D.STAT_META[k].color}">${D.STAT_META[k].label}<b>0</b><div class="g-mb"><i style="background:${D.STAT_META[k].color}"></i></div></div>`).join('')}</div>
        <div class="g-cmood"><span>Happy</span><div class="bar"><i class="g-hp" style="background:#e07ba0"></i></div><span>Energy</span><div class="bar"><i class="g-en" style="background:#6abe30"></i></div></div>
        <div class="g-cbtns"><button class="btn" data-a="travel" type="button">Travel</button><button class="btn" data-a="partner" type="button">Set partner</button><button class="btn primary" data-a="details" type="button">Details</button></div>
      </section>
      <canvas class="g-ghost" width="18" height="18"></canvas>`;
    const q = s => root.querySelector(s);
    cv = q('.g-cv'); ctx = cv.getContext('2d');
    buf = document.createElement('canvas'); bx = buf.getContext('2d');
    skyC = document.createElement('canvas'); skx = skyC.getContext('2d');
    bgC = document.createElement('canvas'); bgx = bgC.getContext('2d');
    pillName = q('.g-pill b'); pillSub = q('.g-pill span'); dotsEl = q('.g-dots');
    trayEl = q('.g-tray'); pouchStrip = q('.g-pouch'); fruitStrip = q('.g-fruit'); pouchCnt = q('.g-pc');
    hintEl = q('.g-hint'); cardEl = q('.g-card'); ghostEl = q('.g-ghost'); gctx = ghostEl.getContext('2d');
    card.spr = q('.g-ch canvas'); card.name = q('.g-nm'); card.tag = q('.g-tag'); card.sub = q('.g-csub');
    card.stats = [...root.querySelectorAll('.g-st')].map(el2 => ({ lv: el2.querySelector('b'), bar: el2.querySelector('.g-mb i') }));
    card.happy = q('.g-hp'); card.energy = q('.g-en'); card.partner = q('[data-a="partner"]');
    cardEl.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) cardAction(b.dataset.a); });
    root.querySelectorAll('.g-arrow').forEach(b => b.addEventListener('click', () => { PX.Sound.unlock(); closeCard(); switchArea(+b.dataset.d); }));
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', e => onUp(e, false));
    window.addEventListener('pointercancel', e => onUp(e, true));
    for (const s of [pouchStrip, fruitStrip]) s.addEventListener('touchmove', e => { if (drag || trayPress) { if (drag) e.preventDefault(); } }, { passive: false });
    window.addEventListener('resize', () => { if (visible) resize(); });
    PS.on('pouch', renderTray);
    PS.on('sprout:update', () => { if (visible) { updatePill(); if (sel) renderCard(); } });
    PS.on('sprout:evolve', e => {
      const r = RT.get(e.s.id); if (!r) return; r.lookT = 0;
      if (!visible || e.s.area !== area || r.state === 'held' || r.state === 'travel') return;
      r.state = 'cocoon'; r.timer = 2.6; r.emote = null; r.mood = null; snd('whoosh');
    });
    PS.on('levelup', e => {
      if (!visible) return; const r = RT.get(e.s.id); if (!r || e.s.area !== area) return;
      const m = D.STAT_META[e.stat]; floaterFor(r, `${m.label} Lv ${e.lv}!`, m.color); snd('level'); burst(r.x, r.y - 14, 'spark', 10, '#fbf236');
      if (!busy(r) && r.state !== 'sleep') r.cheerT = 1.1;
    });
    PS.on('night', () => { skyKey = ''; for (const c of critters) { const a = D.ANIMALS[c.id]; if (a.time !== 'any' && (a.time === 'night') !== PS.clock.isNight()) c.life = Math.min(c.life, 3); } });
    PS.on('egg:new', () => updatePill());
    PS.on('reset', () => { RT.clear(); critters = []; for (const k in drops) delete drops[k]; for (const k in ground) delete ground[k]; closeCard(); renderTray(); });
    mounted = true;
    renderTray();
  }
  function show(params) {
    visible = true;
    const want = (params && params.area) || PS.S.area || 'meadow';
    area = D.AREAS[want] ? want : 'meadow';
    if (PS.S.area !== area) { PS.S.area = area; PS.emit('area', { area }); }
    resize(); lastTrayH = trayEl.offsetHeight;
    renderTray(); updatePill();
    if (nextCritter < t) nextCritter = t + 6;
    if (nextDrop < t) nextDrop = t + rand(...D.GROWTH.dropEverySec) * 0.4;
    if (params && params.id) { const s = ST.get(params.id); if (s && s.area === area) { here = PS.S.sprouts.filter(x => x.area === area).map(getRT); openCard(getRT(s)); } }
  }
  function hide() {
    visible = false;
    if (drag) { ghostEl.style.transform = 'translate(-999px,-999px)'; if (drag.el) drag.el.classList.remove('g-lift'); drag = null; }
    if (trayPress) { clearTimeout(trayPress.timer); trayPress = null; }
    settleAll(); flushAll(); closeCard(); PS.save();
  }
  function frame(dt, tt) {
    if (!visible) return;
    t = tt;
    checkSize(); if (!ww) return;
    update(dt);
    render(dt);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.4;
      const h = cardEl.hidden ? hintText() : '';
      if (hintEl.textContent !== h) hintEl.textContent = h;
      hintEl.style.opacity = h ? 1 : 0;
      if (sel) renderCard();
      updatePill();
    }
  }

  PS.scenes = PS.scenes || {};
  PS.scenes.garden = { mount, show, hide, frame };
  // debug hook for testing
  window.__garden = {
    RT, get here() { return here; }, get critters() { return critters; }, drops, ground, Lw, get area() { return area; }, get pxs() { return PXS; },
    spawnCritter, spawnDrop, setArea, switchArea, eggsHere, tapEgg, treeSlots, feedSprout, giveAnimal, startTravel, askTravel, openCard, closeCard,
    toScreen: (x, y) => { const r = cv.getBoundingClientRect(); return { x: r.left + x * PXS, y: r.top + y * PXS }; },
  };
})();
