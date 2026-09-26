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
    holdDelay: 0.28, rubStep: 10, walkSpeed: 10, walkPerRunLv: 0.2, gravity: 420, flutterFall: 20, flutterAt: 8, holdLift: 16,
    drainDay: 0.2, drainNight: 0.38, sleepAt: 15, regenDay: 9, regenNight: 6, happyDecay: 0.012,
    maxCritters: 2, maxDrops: 3, dropLife: 40, flutterXpMax: 3, flutterCooldown: 8, xpFlushSec: 3,
    // camera: the world is sized so it all fits at zoomMin; you start at zoomDef x zoomMin and can pinch between.
    // (1.5 css px per world px zoomed out; the default 2x = 3 css px per world px, the same close-up size as before.)
    worldW: 280, zoomMinPx: 1.5, zoomDef: 2, zoomMax: 4, edgePan: 90, smellRange: 85, maxGroundFruit: 12,
  };
  const PART_NAMES = { wings: 'wings', ears: 'long ears', fins: 'fins', horns: 'horns', tail: 'a tail', shell: 'a shell', antennae: 'antennae',
    claws: 'claws', spikes: 'spikes', fluff: 'fluff', tentacles: 'tentacles', spots: 'star spots', batwings: 'bat wings', fairywings: 'fairy wings',
    unihorn: 'a unicorn horn', multitail: 'extra tails', flamewings: 'flame wings', dragonwings: 'dragon wings' };

  // ---------------- Area themes ----------------
  // props: [kind, x as share of width, y as share of the walkable span]. Night is an overlay colour (rgb + max alpha).
  // mount/far/near: distant scenery layers. grass: 4 ground tones (light..dark) for the dithered lawn. deco: which ground details to scatter.
  const TH = {
    meadow: {
      sky: ['#6cc3f2', '#86cff5', '#a4dcf8', '#c4e9fb'], skyN: ['#1a1d48', '#222a5a', '#2c366c', '#3a4580'],
      mount: ['#d4ece6', '#b4d9d2', '#94c0bc'], snow: '#f8fdff', mountAmp: 22, mountShape: 'peak',
      far: ['#a6d98b', '#7fbf6a'], farDots: ['#79bd66', '#9ad283', '#62a456'], near: ['#8fd07a', '#66b35a'], nearDots: ['#5ea94f', '#80c56b'],
      lawn: ['#8fd46a', '#62a855'], grass: ['#a2de76', '#8fd46a', '#83ca61', '#76bd58'], blade: '#5aa846', bladeHi: '#b8ec8c', shade: '#6cb050',
      dots: ['#ffffff', '#fbf236', '#f7b6c8', '#c9a2f0'], dotC: '#df7126', sand: '#efe0b4', wet: '#d9c38e', sandEdge: '#c9b27a',
      water: ['#9fe6f7', '#5fcde4', '#3f9fd0', '#2f7fb8'], foam: '#ffffff', hl: '#d6f5fd', cloud: ['#ffffff', '#dfeafc', '#bccdf0'],
      path: ['#f2e9cf', '#e2d3ae', '#c4ae86'], night: [20, 18, 64, 0.36], dim: 0, tree: 'bigtree', house: true, deco: 'meadow', fish: '32,70,120',
      props: [['bush', 0.5, 0.0], ['fence', 0.33, 0.01], ['rock', 0.2, 0.7], ['flowerbed', 0.42, 0.9], ['bush', 0.05, 0.22], ['stump', 0.16, 0.44],
        ['flowerbed', 0.1, 0.96], ['bench', 0.28, 0.62], ['mushrooms', 0.44, 0.78], ['bush', 0.48, 0.99], ['rock', 0.05, 0.39]],
      fruitTrees: [['tree', 0.5, 0.56], ['tree', 0.06, 0.66], ['tree', 0.26, 0.88]],
    },
    beach: {
      sky: ['#48b8f0', '#6fcaf5', '#98dbf8', '#c8eefc'], skyN: ['#14214a', '#1c2d5e', '#243a70', '#2f4a82'],
      far: ['#9ccf8a', '#6fa86a'], farDots: ['#5f9a5e', '#88c07a', '#4f8a54'], near: ['#d6e9a0', '#a7c873'], nearDots: ['#b8d488', '#e6f2b8'],
      lawn: ['#f6e3a8', '#dec486'], grass: ['#faebbd', '#f6e3a8', '#f1db9b', '#ebd290'], blade: '#e2c47e', bladeHi: '#fff6d8', shade: '#e2c47e',
      dots: ['#f7b6c8', '#ffffff', '#f5a86a', '#fbf3dc'], dotC: '#e07ba0', sand: '#f3dc9c', wet: '#e0c283', sandEdge: '#d9bd7c',
      water: ['#8ee8f0', '#3fc0e0', '#2a8fd0', '#1f6fb0'], foam: '#ffffff', hl: '#d6f5fd', cloud: ['#ffffff', '#dfeafc', '#bccdf0'],
      path: null, night: [20, 18, 64, 0.36], dim: 0, tree: 'palm', surf: true, openSea: true, deco: 'beach', fish: '20,60,120',
      props: [['umbrella', 0.44, 0.04], ['sandcastle', 0.33, 0.86], ['shells', 0.08, 0.62], ['rockpool', 0.47, 0.97], ['shells', 0.34, 0.3],
        ['umbrella', 0.12, 0.93], ['driftwood', 0.2, 0.7], ['surfboard', 0.47, 0.6], ['bucket', 0.42, 0.88], ['ball', 0.28, 0.08],
        ['towel', 0.25, 0.5], ['rock', 0.47, 0.36], ['shells', 0.46, 0.76]],
      fruitTrees: [['palm', 0.06, 0.34], ['palm', 0.05, 0.8], ['palm', 0.32, 0.68]],
    },
    moonlit: {
      sky: ['#3b2f6e', '#553d86', '#7a4f98', '#a868a8'], skyN: ['#110e2e', '#19153e', '#231c50', '#2f2462'],
      mount: ['#6a6aa8', '#4c4c88', '#36366a'], snow: '#c9c4f0', mountAmp: 24, mountShape: 'spire',
      far: ['#3e5a78', '#2c4260'], farDots: ['#243850', '#34506c', '#1c2c42'], near: ['#2f6a6a', '#1f4c50'], nearDots: ['#1c4448', '#2a5e5e'],
      lawn: ['#3f8a72', '#2a6450'], grass: ['#4a977d', '#3f8a72', '#377e68', '#2f705d'], blade: '#27604e', bladeHi: '#7fe0c0', shade: '#2c6654',
      dots: ['#9fd8ff', '#c9a2f0', '#a6f2d3', '#fff6c9'], dotC: '#ffffff', sand: '#b9b3cc', wet: '#8f88a8', sandEdge: '#7a7496',
      water: ['#6a7cb8', '#4a5a98', '#36427e', '#283068'], foam: '#cbdbfc', hl: '#9fb0e8', cloud: ['#9a88c8', '#7e6cb0', '#665498'],
      path: ['#c0c0d8', '#9a9ab8', '#6a6a8e'], night: [26, 14, 60, 0.32], dim: 0.16, tree: 'glowtree', bigMoon: true, deco: 'moonlit', fish: '10,10,40',
      props: [['crystal', 0.44, 0.0], ['glowshroom', 0.16, 0.56], ['lantern', 0.37, 0.86], ['glowshroom', 0.48, 0.5], ['crystal', 0.08, 0.95], ['lantern', 0.3, 0.3],
        ['mushrooms', 0.22, 0.84], ['moonstone', 0.12, 0.4], ['fern', 0.3, 0.72], ['fern', 0.04, 0.2], ['moonstone', 0.49, 0.96]],
      fruitTrees: [['glowtree', 0.08, 0.76], ['glowtree', 0.46, 0.72]],
    },
    candy: {
      sky: ['#f6a6d0', '#f9bcdc', '#fbd2e6', '#fde6f0'], skyN: ['#2e1a4e', '#3c2260', '#4c2a72', '#5e3484'],
      mount: ['#fbe0f0', '#f4c4de', '#e0a4c8'], snow: '#ffffff', mountAmp: 14, mountShape: 'drop',
      far: ['#f7c6e0', '#e89cc4'], farStripe: '#fde6f0', farDots: ['#c9a2f0', '#fff27a', '#99e5c0'], near: ['#bff0dc', '#86d6b8'], nearDots: ['#f07aa0', '#fff4f8'],
      lawn: ['#c8f2e0', '#8fd8bc'], grass: ['#d6f7e9', '#c8f2e0', '#bcebd5', '#aee3ca'], blade: '#8fd8bc', bladeHi: '#ffffff', shade: '#a2dcc4',
      dots: ['#f07a84', '#fff27a', '#639bff', '#ffffff'], dotC: '#f08cbc', sand: '#fde6b8', wet: '#f5c890', sandEdge: '#e8b87c',
      water: ['#b8f5ec', '#8ee0e0', '#f5a6cc', '#e07ba0'], foam: '#ffffff', hl: '#ffffff', cloud: ['#ffffff', '#fbe4f2', '#f2c4e0'],
      path: ['#ffffff', '#fcd8e8', '#e8a2c4'], night: [40, 16, 70, 0.36], dim: 0, tree: 'lollitree', house: true, fizz: true, deco: 'candy', fish: '150,40,100',
      props: [['candycane', 0.5, 0.03], ['cupcake', 0.07, 0.74], ['gumdrops', 0.2, 0.9], ['gumball', 0.12, 0.46], ['candycane', 0.14, 0.98], ['gumdrops', 0.1, 0.2],
        ['donut', 0.47, 0.62], ['lollipop', 0.26, 0.72], ['lollipop', 0.47, 0.45], ['icecream', 0.3, 0.98], ['donut', 0.2, 0.6], ['gumdrops', 0.48, 0.97]],
      fruitTrees: [['lollitree', 0.36, 0.84], ['lollitree', 0.06, 0.92], ['lollitree', 0.45, 0.2]],
    },
  };
  // where fruit hangs on each tree (share of sprite width/height from the base)
  const TREE_SLOTS = {
    palm: [[-0.08, -0.74], [0.14, -0.69], [0.34, -0.76]],
    lollitree: [[-0.28, -0.72], [0.04, -0.9], [0.3, -0.66]],
    default: [[-0.27, -0.45], [0, -0.74], [0.27, -0.47]],
  };
  // spooky (Halloween) skins: sparkle colours, the little thing that floats up at night, and a faint night glow
  const SPOOKY = {
    pumpkin: { c: ['#ffb040', '#fff27a'], fx: 'wisp', glow: '255,170,60' }, ghost: { c: ['#ffffff', '#e0d8ff'], fx: 'wisp', glow: '225,215,255' },
    mummy: { c: ['#fffaf0', '#e8dcc0'], fx: 'wisp', glow: '255,240,205' }, candycorn: { c: ['#ffffff', '#ff9a22', '#ffd23a'], fx: 'wisp', glow: '255,205,110' },
    vampire: { c: ['#4a3a6c', '#e8506a', '#c9a2f0'], fx: 'bat', glow: '230,90,130' }, witch: { c: ['#8e56c8', '#9ad862', '#fff27a'], fx: 'bat', glow: '190,255,150' },
  };
  const GLOWS = { lantern: [0.5, 0.8, 9, '255,236,150'], glowshroom: [0.5, 0.6, 7, '170,240,255'], crystal: [0.5, 0.55, 7, '180,220,255'], moonstone: [0.5, 0.5, 6, '160,230,255'], mushrooms: [0.5, 0.5, 4, '170,240,255'] };

  // ---------------- seeded decoration ----------------
  let seed = 7; const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const DECO = { stars: [], waves: [], clouds: [], flies: [], fish: [], bugs: [], drift: [], floats: [], birds: [] };
  for (let i = 0; i < 60; i++) DECO.stars.push({ x: srand(), y: srand(), tw: srand() > 0.78, ph: srand() * 6 });
  for (let i = 0; i < 46; i++) DECO.waves.push({ x: srand(), y: srand(), ph: srand() * 6.28, w: 2 + Math.floor(srand() * 3) });
  for (let i = 0; i < 7; i++) DECO.clouds.push({ x: srand(), y: 0.1 + srand() * 0.45, s: i % 3, v: 0.8 + srand() * 1.4 });
  for (let i = 0; i < 11; i++) DECO.flies.push({ p: srand() * 10, a: srand(), b: srand() });
  for (let i = 0; i < 4; i++) DECO.fish.push({ a: 0.15 + srand() * 0.6, b: srand(), r: 0.08 + srand() * 0.12, v: 0.05 + srand() * 0.06, ph: srand() * 6.28, big: i === 0 });
  for (let i = 0; i < 3; i++) DECO.bugs.push({ p: srand() * 10, a: srand(), b: srand(), c: i });
  for (let i = 0; i < 3; i++) DECO.drift.push({ p: srand(), y: srand(), v: 0.03 + srand() * 0.03, ph: srand() * 6.28, c: i });
  for (let i = 0; i < 4; i++) DECO.floats.push({ a: 0.12 + i * 0.2 + srand() * 0.08, b: 0.1 + srand() * 0.8, ph: srand() * 6.28, v: 0.4 + srand() * 0.4, k: i });
  for (let i = 0; i < 3; i++) DECO.birds.push({ p: srand(), y: 0.2 + srand() * 0.4, v: 0.012 + srand() * 0.01, ph: srand() * 6 });

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
  const propSpr = (kind, theme) => spr('p:' + kind + ':' + theme, () => (kind === 'gumball' ? PX.gumballMachine(0) : PX.prop(kind, theme)), () => blob(14, 12));
  function propAt(p) { for (const q of Lw.props) if (q.kind === 'gumball' && Math.abs(p.x - q.x) < q.c.width / 2 + 2 && p.y <= q.y + 2 && p.y >= q.y - q.c.height) return q.kind; return null; }
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
  let W = 0, H = 0, DPR = 1, ww = 0, wh = 0, t = 0, visible = false, mounted = false, area = 'meadow';
  // camera (Z = CSS px per world px; cam = world px at the top-left of the screen)
  let Z = 3, ZMIN = 2, ZMAX = 6, camX = 0, camY = 0, zoomAnim = null, pinch = null, camV = { x: 0, y: 0 }, lastTapBg = null, zoomSnapT = 0;
  const touches = new Map();          // pointerId -> {x, y} (client coords) for fingers that went down on the garden
  const lastClient = { x: -1, y: -1, on: false };
  const ZKEY = 'solunar:gardenZoom2'; // (v2: the world got bigger, so old zoom levels no longer mean the same)
  let zoomPref = (() => { try { return parseFloat(localStorage.getItem(ZKEY)) || 0; } catch (e) { return 0; } })(); // as a multiple of ZMIN
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
    Lw.maxY = Math.max(Lw.minY + 30, Math.floor((H - trayH - 16) / ZMIN));
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
    // fruit trees: the area's main tree first (its 3 fruit slots are the ones old saves already have), then the others
    Lw.trees = [{ kind: th.tree, x: Lw.tree.x, y: Lw.tree.y }].concat((th.fruitTrees || []).map(([kind, fx, fy]) => {
      const c = propSpr(kind, theme), y = Math.round(Lw.minY + Lw.span * fy);
      return { kind, y, x: Math.max(Math.round(c.width / 2) + 1, Math.round(Math.min(ww * fx, shoreAt(y) - c.width / 2 - 3))) };
    }));
    Lw.slots = [];
    Lw.trees.forEach((T, ti) => {
      T.c = propSpr(T.kind, theme);
      for (const [fx, fy] of TREE_SLOTS[T.kind] || TREE_SLOTS.default) Lw.slots.push({ x: Math.round(T.x + fx * T.c.width), y: Math.round(T.y + fy * T.c.height), tree: ti });
    });
  }
  function lawnPoint() {
    for (let i = 0; i < 40; i++) {
      const y = rand(Lw.minY + 2, Lw.maxY), x = rand(8, shoreAt(y) - 8);
      if ((Lw.trees || []).some(T => Math.abs(x - T.x) < 8 && Math.abs(y - T.y) < 6)) continue;
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
  const hex2 = v => v.toString(16).padStart(2, '0');
  const mixH = (a, b, k) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => hex2(Math.round(v + (B[i] - v) * k))).join(''); };
  const U32 = new Map();
  const u32 = c => { let v = U32.get(c); if (v === undefined) { const [r, g, b] = rgb(c); v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; U32.set(c, v); } return v; };
  // hashing, ordered dither and value noise for the cached ground (only used when a background layer is repainted)
  const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.62 + vnoise(x * 2.1 + 5.3, y * 2.1 + 1.7, s + 1) * 0.38;
  // one of n tones from v (0..1), with a narrow checker dither where two tones meet
  function toneOf(v, n, x, y, w) {
    w = w || 0.13; const s = clamp(v, 0, 0.9999) * n, b = Math.floor(s), f = s - b, odd = (x + y) & 1;
    if (f < w && b > 0) return odd ? b - 1 : b;
    if (f > 1 - w && b < n - 1) return odd ? b + 1 : b;
    return b;
  }
  const sandW = y => Math.round(lerp(3, 9, clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1)));

  // ---------------- background (cached per area / size / night level) ----------------
  function paintSky(n) {
    const th = TH[area], x = skx, hz = Lw.hz; x.clearRect(0, 0, ww, wh);
    const base = th.sky.map((c, i) => mixH(c, th.skyN[i], n));
    // 7 smooth bands from the 4 theme colours, dithered where they meet
    const bands = []; for (let i = 0; i < 7; i++) { const k = i / 6 * 3, a = Math.floor(k); bands.push(mixH(base[a], base[Math.min(3, a + 1)], k - a)); }
    const bh = (hz + 12) / bands.length;
    bands.forEach((c, i) => {
      const y0 = Math.round(i * bh);
      x.fillStyle = c; x.fillRect(0, y0, ww, wh - y0);
      if (i) { x.fillStyle = bands[i - 1]; for (let j = i % 2; j < ww; j += 2) x.fillRect(j, y0, 1, 1); for (let j = (i % 2) * 2; j < ww; j += 4) x.fillRect(j, y0 + 1, 1, 1); }
    });
    // soft haze just above the horizon
    const haze = mixH(base[3], n > 0.5 ? th.skyN[3] : '#ffffff', 0.35);
    x.fillStyle = haze;
    for (let y = hz - 12; y < hz + 12; y++) { const d = clamp((y - (hz - 12)) / 14, 0, 1) * 0.6; for (let j = 0; j < ww; j++) if (bayer(j, y) < d) x.fillRect(j, y, 1, 1); }
    // stars (the twinkly ones are drawn live, above the night tint)
    const sa = th.bigMoon ? Math.max(0.5, n) : n;
    if (sa > 0.04) {
      x.globalAlpha = sa;
      // a faint band of far-off stars across the sky
      x.fillStyle = mixH(base[1], '#cbdbfc', 0.35);
      for (let j = 0; j < ww; j++) for (let y = 0; y < hz - 10; y++) { const d = Math.abs(y - (hz * 0.15 + j * 0.22)); if (d < 9 && hash2(j, y, 77) < 0.16 * (1 - d / 9)) x.fillRect(j, y, 1, 1); }
      for (const s of DECO.stars) { if (s.tw) continue; x.fillStyle = s.y > 0.5 ? '#cbdbfc' : '#ffffff'; x.fillRect(Math.round(s.x * ww), Math.round(s.y * (hz - 8)), 1, 1); }
      x.globalAlpha = 1;
    }
  }
  function paintLand() {
    const th = TH[area], X = bgx, hz = Lw.hz, wt = Lw.waterTop; X.clearRect(0, 0, ww, wh);
    const img = X.createImageData(ww, wh), P = new Uint32Array(img.data.buffer);
    const put = (i, y, c) => { if (i >= 0 && i < ww && y >= 0 && y < wh) P[y * ww + i] = u32(c); };
    const lawnTop = hz + 9, seaX = th.openSea ? shoreAt(wt) - 3 : ww, AS = AREA_IDS.indexOf(area) * 101 + 3;
    const lawnTopAt = i => Math.round(lawnTop - Math.sin(i * 0.09 + 2) * 1.2);
    // ---- distant mountains: lit left faces, shaded right faces, snow / icing on the tops ----
    const fTop = [], nTop = [];
    if (th.mount) {
      const M = th.mount, amp = th.mountAmp, base = hz - 2, sh = th.mountShape;
      const tri = v => 1 - 2 * Math.abs(v - Math.floor(v) - 0.5);
      const h = i => sh === 'spire' ? 0.62 * Math.pow(tri(i / 44 + 0.3), 1.7) + 0.38 * Math.pow(tri(i / 17 + 0.1), 2.2)
        : sh === 'drop' ? 0.7 * Math.pow(Math.abs(Math.sin(i * 0.052 + 0.4)), 0.6) + 0.3 * Math.abs(Math.sin(i * 0.12 + 1.3))
          : 0.66 * Math.pow(tri(i / 74 + 0.15), 1.3) + 0.34 * Math.pow(tri(i / 31 + 0.55), 1.5);
      const top = i => base - amp * h(i);
      const hazeC = mixH(M[1], th.sky[3], 0.45);
      for (let i = 0; i < Math.min(ww, seaX); i++) {
        const tp = Math.round(top(i)), sl = top(i + 1) - top(i - 1), snowTo = base - amp * 0.6 + hash2(i >> 2, 1, AS) * 2 + (sh === 'drop' && i % 6 < 2 ? 2 : 0);
        for (let y = Math.max(0, tp); y < lawnTop + 2; y++) {
          let c = sl < -0.15 ? M[0] : sl > 0.15 ? M[2] : ((i + y) & 1 ? M[0] : M[1]);
          if (y - tp > 3 && c === M[0] && ((i + y) & 1)) c = M[1];
          if (y < snowTo && y - tp < 6) c = sl > 0.15 ? mixH(th.snow, M[2], 0.3) : th.snow;
          if (y > base - 6 && bayer(i, y) < (y - (base - 6)) / 8) c = hazeC;
          put(i, y, c);
        }
      }
    }
    // ---- rolling hills: an ink-soft rim, a lit band under it, optional candy stripes ----
    const hillLayer = (arr, b, amp, f, ph, fill, edge, maxX, stripe) => {
      const lit = mixH(fill, '#ffffff', 0.14), fillU = u32(fill), litU = u32(lit), edgeU = u32(edge), stU = stripe ? u32(stripe) : 0;
      for (let i = 0; i < ww; i++) arr[i] = Math.round(b - Math.sin(i * f + ph) * amp - Math.sin(i * f * 2.3 + ph * 2) * amp * 0.4);
      for (let i = 0; i < Math.min(ww, maxX); i++) {
        const tp = arr[i]; if (tp >= 0 && tp < wh) P[tp * ww + i] = edgeU;
        for (let y = Math.max(0, tp + 1); y < lawnTop + 2; y++) {
          let c = fillU; const d = y - tp;
          if (d === 1 || (d === 2 && ((i + y) & 1))) c = litU;
          else if (stU && y < hz + 8 && ((i + y) >> 1) % 3 === 0) c = stU;
          P[y * ww + i] = c;
        }
      }
    };
    hillLayer(fTop, hz - 2, 6, 0.045, 1, th.far[0], th.far[1], th.openSea ? seaX - 6 : ww, th.farStripe);
    hillLayer(nTop, hz + 4, 3.5, 0.07, 3, th.near[0], th.near[1], th.openSea ? seaX : ww);
    // ---- the lawn: soft dithered patches of 4 tones, lighter toward the back ----
    const G = th.grass.map(u32), edgeU = u32(th.lawn[1]);
    for (let i = 0; i < ww; i++) {
      const tp = lawnTopAt(i); P[tp * ww + i] = edgeU;
      for (let y = tp + 1; y < wh; y++) {
        const g = (y - lawnTop) / Math.max(1, wh - lawnTop);
        const v = (fbm(i * 0.05, y * 0.085, AS) - 0.5) * 1.8 + 0.5 + (1 - g) * 0.2 - 0.08;
        P[y * ww + i] = y === tp + 1 ? G[0] : G[3 - toneOf(v, 4, i, y)];
      }
    }
    // ---- sandy shore (dry -> damp -> wet) and water in depth bands ----
    const W0 = th.water, WU = W0.map(u32);
    const shalU = u32(mixH(W0[0], th.wet, 0.42)), sandU = u32(th.sand), wetU = u32(th.wet), dampU = u32(mixH(th.sand, th.wet, 0.5)), sEdgeU = u32(th.sandEdge);
    const reflU = u32(mixH(th.openSea ? th.sky[3] : th.near[1], W0[2], th.openSea ? 0.3 : 0.5)), hlU = u32(th.hl);
    const TH3 = [0.14, 0.45, 0.78];
    for (let y = wt; y < wh; y++) {
      const s = shoreAt(y), sw = sandW(y);
      for (let i = Math.max(0, s - sw - 1); i <= s && i < ww; i++) {
        const u = (i - (s - sw)) / Math.max(1, sw);
        let c;
        if (i === s - sw - 1) { if (!((i + y) & 1)) continue; c = sEdgeU; }
        else if (u < 0.45) c = sandU; else if (u < 0.6) c = (i + y) & 1 ? dampU : sandU; else if (u < 0.8) c = dampU; else if (u < 0.9) c = (i + y) & 1 ? wetU : dampU; else c = wetU;
        P[y * ww + i] = c;
      }
      const fk = y - wt;
      for (let i = s + 1; i < ww; i++) {
        const d = (i - s) / Math.max(1, ww - s) + (vnoise(i * 0.13, y * 0.3, AS + 5) - 0.5) * 0.05;
        let tn = 0; for (const q of TH3) if (d > q) tn++;
        for (let q = 0; q < 3; q++) if (Math.abs(d - TH3[q]) < 0.022 && ((i + y) & 1)) tn = d > TH3[q] ? q : q + 1;
        let c = WU[tn];
        if (d < 0.035) c = (i + y) & 1 && d > 0.02 ? WU[0] : shalU;
        if (fk === 0) c = hlU;
        else if (fk < 7) {
          if (fk < 3 || (fk < 5 && ((i + y) & 1)) || (fk < 7 && bayer(i, y) < 0.25)) c = WU[Math.max(tn, 2)];
          if (fk >= 1 && fk <= 4 && ((i + fk) % 3 === 0 || fk === 1) && (i & 1)) c = reflU;
        }
        P[y * ww + i] = c;
      }
    }
    X.putImageData(img, 0, 0);

    // ---- details on top (fillRect) ----
    let rs = AS * 7919 + 1; const rr = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    const R = (x0, y0, w, h, c) => { X.fillStyle = c; X.fillRect(Math.round(x0), Math.round(y0), w, h); };
    const blob = (cx, cy, r, dark, mid, lit) => { // tiny round shrub / tree crown, lit from the top-left
      for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy + r * 0.6))); R(cx - w, cy + dy, w * 2 + 1, 1, mid); }
      R(cx - r + 1, cy + r - 1, r * 2 - 1, 1, dark); R(cx + r - 1, cy - 1, 1, r, dark); R(cx - r + 1, cy - r + 1, Math.max(1, r - 1), 1, lit); R(cx - r, cy - r + 2, 1, 1, lit);
    };
    // scenery on the ridges
    if (area === 'meadow') {
      for (let i = 4; i < ww; i += 5 + Math.floor(hash2(i, 2, AS) * 9)) if (hash2(i, 3, AS) > 0.3) { const r = hash2(i, 4, AS) > 0.6 ? 3 : 2; blob(i, fTop[i] + 1, r, th.farDots[2], th.farDots[0], th.farDots[1]); if (r === 3 && hash2(i, 5, AS) > 0.5) blob(i + 4, fTop[Math.min(ww - 1, i + 4)] + 2, 2, th.farDots[2], th.farDots[0], th.farDots[1]); }
      for (let i = 8; i < ww; i += 12 + Math.floor(hash2(i, 6, AS) * 18)) { if (Math.abs(i - ww * 0.42) < 16) continue; blob(i, nTop[i] + 1, 2, th.nearDots[0], th.nearDots[0], th.nearDots[1]); R(i + 3, nTop[Math.min(ww - 1, i + 3)], 1, 2, th.nearDots[0]); }
    } else if (area === 'beach') {
      for (let i = 6; i < seaX - 8; i += 16 + Math.floor(hash2(i, 2, AS) * 14)) { // little palms on the headland
        const b = fTop[i] + 1, lean = hash2(i, 3, AS) > 0.5 ? 1 : -1, c = th.farDots[2];
        for (let k = 0; k < 6; k++) R(i + (k > 3 ? lean : 0), b - k, 1, 1, '#8a7a50');
        const tx = i + lean, ty = b - 6; R(tx - 3, ty, 7, 1, c); R(tx - 4, ty + 1, 2, 1, c); R(tx + 3, ty + 1, 2, 1, c); R(tx - 1, ty - 1, 3, 1, th.farDots[1]); R(tx - 2, ty + 1, 1, 1, c); R(tx + 2, ty + 1, 1, 1, c);
      }
      for (let i = 3; i < seaX; i += 5 + Math.floor(hash2(i, 7, AS) * 6)) { R(i, nTop[i] - 1, 1, 2, th.nearDots[0]); if (hash2(i, 8, AS) > 0.5) R(i + 1, nTop[i] - 2, 1, 2, th.nearDots[0]); R(i - 1, nTop[i], 1, 1, th.nearDots[1]); }
    } else if (area === 'moonlit') {
      for (let i = 5; i < ww; i += 4 + Math.floor(hash2(i, 2, AS) * 7)) { // pines
        if (hash2(i, 3, AS) < 0.25) continue;
        const b = fTop[i] + 2, hgt = 5 + Math.floor(hash2(i, 4, AS) * 5), c = th.farDots[0];
        for (let k = 0; k < hgt; k++) { const w = Math.floor((hgt - k) / 2.2); R(i - w, b - k, w * 2 + 1, 1, k % 3 === 2 ? th.farDots[1] : c); }
        R(i, b - hgt, 1, 1, th.farDots[1]);
      }
      for (let i = 10; i < ww; i += 28 + Math.floor(hash2(i, 9, AS) * 30)) { // crystal spires on the far peaks, faintly glowing
        const y0 = Math.round(hz - 6 - hash2(i, 10, AS) * 6), h = 6 + Math.floor(hash2(i, 11, AS) * 5);
        R(i - 1, y0 - h + 2, 3, h - 2, '#8a9ae0'); R(i, y0 - h, 1, h, '#c9d4ff'); R(i + 1, y0 - h + 3, 1, h - 3, '#5a64b0'); R(i, y0 - h - 1, 1, 1, '#ffffff');
      }
      for (let i = 6; i < ww; i += 14 + Math.floor(hash2(i, 12, AS) * 16)) { blob(i, nTop[i] + 1, 2, th.nearDots[0], th.nearDots[0], th.nearDots[1]); }
    } else if (area === 'candy') {
      for (let i = 5; i < ww; i += 9 + Math.floor(hash2(i, 2, AS) * 12)) { // gumdrops on the far hills
        const c = th.farDots[Math.floor(hash2(i, 3, AS) * 3)], b = fTop[i];
        R(i - 1, b - 2, 3, 1, c); R(i - 2, b - 1, 5, 2, c); R(i - 1, b - 2, 1, 1, '#ffffff');
      }
      for (let i = 12; i < ww; i += 26 + Math.floor(hash2(i, 4, AS) * 26)) { // lollipops on the near hills
        if (Math.abs(i - ww * 0.42) < 18) continue;
        const b = nTop[i], hgt = 6 + Math.floor(hash2(i, 5, AS) * 4), c = th.nearDots[Math.floor(hash2(i, 6, AS) * 2)];
        R(i, b - hgt, 1, hgt, '#fff4f8'); R(i - 2, b - hgt - 3, 5, 3, c); R(i - 1, b - hgt - 4, 3, 1, c); R(i - 1, b - hgt - 1, 3, 1, c); R(i, b - hgt - 2, 1, 1, '#ffffff'); R(i - 1, b - hgt - 3, 1, 1, '#ffffff');
      }
    }
    // house far on the hill
    if (th.house) { const hc = propSpr('house', themeOf(area)); Lw.house = { x: Math.round(ww * 0.42), y: hz + 8, c: hc }; PX.blit(X, hc, Lw.house.x, Lw.house.y); } else Lw.house = null;
    // ---- path from the tree to the dock ----
    const pathPts = [];
    if (th.path) {
      const p0 = { x: Lw.tree.x + 9, y: Lw.tree.y + 4 }, p2 = { x: Lw.dockX0 - 3, y: Lw.dockY + 1 }, p1 = { x: (p0.x + p2.x) / 2 - 8, y: Math.max(p0.y, p2.y) + 12 };
      for (let k = 0; k <= 60; k++) { const u = k / 60, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pathPts.push({ x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y }); }
      const [pl, pm, pe] = th.path;
      if (area === 'meadow') {
        for (const q of pathPts) R(q.x - 3, q.y - 1, 7, 4, pe);
        for (const q of pathPts) R(q.x - 2, q.y - 1, 5, 3, pm);
        for (const q of pathPts) R(q.x - 1, q.y - 1, 3, 1, pl);
        for (let k = 3; k < pathPts.length - 2; k += 4) { const q = pathPts[k], o = hash2(k, 1, AS) > 0.5 ? 1 : -2; R(q.x + o, q.y + 1, 1, 1, pe); if (k % 8 === 3) R(q.x - o, q.y, 1, 1, '#fffaf0'); }
      } else {
        let acc = 0;
        for (let k = 1; k < pathPts.length; k++) {
          acc += Math.hypot(pathPts[k].x - pathPts[k - 1].x, pathPts[k].y - pathPts[k - 1].y);
          if (acc < 7) continue; acc = 0;
          const q = pathPts[k], w = 5 + (k % 3 === 0 ? 1 : 0);
          R(q.x - w / 2 + 1, q.y + 1, w, 1, th.shade);
          R(q.x - w / 2, q.y - 2, w, 3, pe); R(q.x - w / 2 + 1, q.y - 3, w - 2, 1, pe);
          R(q.x - w / 2 + 1, q.y - 2, w - 2, 2, pm); R(q.x - w / 2 + 1, q.y - 2, w - 3, 1, pl);
          if (area === 'candy') R(q.x - w / 2 + 2, q.y - 1, 1, 1, '#f7b6c8');
        }
      }
    }
    // ---- ground details, scattered by area (counts scale with the size of the land) ----
    let land = 0; for (let y = lawnTop + 4; y < wh; y++) land += Math.max(0, shoreAt(y) - sandW(y) - 6);
    const onPath = (x0, y0) => pathPts.some(q => Math.abs(q.x - x0) < 5 && Math.abs(q.y - y0) < 4);
    const spot = pad => { for (let k = 0; k < 8; k++) { const y0 = Math.round(lawnTop + 4 + rr() * (wh - lawnTop - 5)), x0 = Math.round(2 + rr() * (shoreAt(y0) - sandW(y0) - 6 - (pad || 0))); if (x0 > 1 && !onPath(x0, y0)) return [x0, y0]; } return null; };
    const scatter = (per, fn) => { const n = Math.round(land / per); for (let k = 0; k < n; k++) { const q = spot(); if (q) fn(q[0], q[1], k); } };
    const G2 = th.grass, sh = th.shade, bl = th.blade, bh = th.bladeHi;
    const tuft = (x0, y0, k) => { const n = 2 + (k % 3 === 0 ? 1 : 0); for (let b = 0; b < n; b++) { const bx0 = x0 + b * 2 - 1, h = 1 + Math.floor(hash2(x0 + b, y0, AS) * 2.6); R(bx0, y0 - h + 1, 1, h, bl); R(bx0 + (b === 0 ? -1 : b === n - 1 ? 1 : 0), y0 - h, 1, 1, bh); } };
    const flower = (x0, y0, k) => { const c = th.dots[k % 4]; R(x0, y0 + 1, 1, 1, bl); R(x0 - 1, y0, 1, 1, c); R(x0 + 1, y0, 1, 1, c); R(x0, y0 - 1, 1, 1, c); R(x0, y0 + 1, 1, 1, c); R(x0, y0, 1, 1, th.dotC); R(x0 + 1, y0 + 1, 1, 1, sh); };
    const pebble = (x0, y0, k) => { const w = k % 2 ? 2 : 3; R(x0, y0 + 1, w, 1, sh); R(x0, y0, w, 1, '#9badb7'); R(x0, y0, 1, 1, '#dfe8fb'); if (w === 3) R(x0 + 1, y0 - 1, 1, 1, '#b7c2cc'); };
    if (th.deco === 'meadow') {
      scatter(70, tuft); scatter(230, flower);
      scatter(900, (x0, y0) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) { R(x0 + dx * 2 - 1, y0 + dy * 2, 2, 2, '#4f9a3e'); R(x0 + dx * 2 - 1, y0 + dy * 2, 1, 1, '#9fdc70'); } R(x0, y0 + 2, 1, 1, bl); });
      scatter(1100, pebble);
      scatter(1600, (x0, y0) => { R(x0, y0 - 1, 1, 2, '#fbf3dc'); R(x0 - 1, y0 - 2, 3, 1, '#d95763'); R(x0, y0 - 3, 1, 1, '#d95763'); R(x0 - 1, y0 - 2, 1, 1, '#ffffff'); R(x0 + 1, y0, 1, 1, sh); });
      scatter(1300, (x0, y0) => { R(x0, y0 - 2, 1, 3, bl); R(x0 - 1, y0 - 4, 3, 2, '#ffffff'); R(x0, y0 - 5, 1, 1, '#ffffff'); R(x0 + 1, y0 - 3, 1, 1, '#dfe8fb'); });
    } else if (th.deco === 'beach') {
      scatter(95, (x0, y0) => { R(x0 - 2, y0, 4, 1, G2[3]); R(x0 + 2, y0 - 1, 2, 1, G2[3]); R(x0 - 2, y0 - 1, 3, 1, G2[0]); });
      scatter(380, (x0, y0) => R(x0, y0, 1, 1, '#fffbea'));
      scatter(700, (x0, y0, k) => { const c = th.dots[k % 4]; R(x0, y0, 2, 1, c); R(x0, y0 - 1, 1, 1, c); R(x0 + 1, y0 - 1, 1, 1, '#ffffff'); R(x0, y0 + 1, 2, 1, G2[3]); });
      scatter(2600, (x0, y0) => { R(x0, y0 - 2, 1, 5, '#f08a6a'); R(x0 - 2, y0, 5, 1, '#f08a6a'); R(x0 - 1, y0 + 1, 1, 1, '#f08a6a'); R(x0 + 1, y0 + 1, 1, 1, '#f08a6a'); R(x0, y0, 1, 1, '#ffd0b8'); });
      scatter(900, pebble);
      scatter(1500, (x0, y0) => { R(x0, y0, 1, 1, '#4b692f'); R(x0 + 1, y0 - 1, 1, 1, '#6a8a3a'); R(x0 + 2, y0, 1, 1, '#4b692f'); R(x0 + 3, y0 - 1, 1, 1, '#6a8a3a'); });
      // a trail of little footprints wandering down toward the sea
      for (let k = 0; k < 16; k++) { const y0 = Math.round(lawnTop + 30 + k * 9), x0 = Math.round(ww * 0.28 + Math.sin(k * 0.55) * 14 + k * 1.2); if (x0 > shoreAt(y0) - sandW(y0) - 4 || y0 > wh - 4) break; R(x0 + (k % 2) * 3, y0, 2, 1, G2[3]); R(x0 + (k % 2) * 3, y0 + 1, 1, 1, G2[3]); }
    } else if (th.deco === 'moonlit') {
      scatter(75, tuft);
      scatter(620, (x0, y0, k) => { R(x0, y0, 1, 1, k % 2 ? '#7fe0f0' : '#c9a2f0'); if (k % 3 === 0) R(x0 + 1, y0 + 1, 1, 1, '#4fb8a8'); });
      scatter(1200, (x0, y0) => { R(x0, y0 - 1, 1, 2, '#e0e8ff'); R(x0 - 1, y0 - 2, 3, 1, '#5fe8e0'); R(x0, y0 - 3, 1, 1, '#c8fff8'); R(x0 + 1, y0, 1, 1, sh); });
      scatter(1500, (x0, y0) => { R(x0, y0 - 2, 1, 3, '#c09af0'); R(x0 + 1, y0 - 1, 1, 2, '#7a50c0'); R(x0, y0 - 3, 1, 1, '#ffffff'); R(x0 - 1, y0, 1, 1, '#8a6ad0'); });
      scatter(1000, pebble); scatter(950, flower);
    } else if (th.deco === 'candy') {
      scatter(100, (x0, y0, k) => { const c = th.dots[k % 4]; if (k % 2) R(x0, y0, 2, 1, c); else R(x0, y0, 1, 2, c); });
      scatter(650, (x0, y0, k) => { const c = ['#f07a84', '#99e550', '#fff27a', '#c9a2f0'][k % 4]; R(x0, y0, 3, 2, c); R(x0, y0, 1, 1, '#ffffff'); R(x0 + 1, y0 + 2, 2, 1, sh); });
      scatter(750, (x0, y0) => { R(x0, y0, 1, 1, '#ffffff'); R(x0 - 1, y0, 1, 1, '#e8fff6'); R(x0 + 1, y0, 1, 1, '#e8fff6'); });
      scatter(1700, (x0, y0) => { R(x0 - 2, y0, 1, 2, '#f07a84'); R(x0 + 2, y0, 1, 2, '#f07a84'); R(x0 - 1, y0, 3, 2, '#ffffff'); R(x0, y0, 1, 1, '#f07a84'); R(x0 - 1, y0 + 2, 3, 1, sh); });
      scatter(260, tuft);
    }
    // ---- shore: pebbles and shells in the sand ----
    for (let y = wt + 4; y < wh; y += 5 + Math.floor(hash2(y, 1, AS) * 6)) { const s = shoreAt(y), x0 = s - sandW(y) + 1 + Math.floor(hash2(y, 2, AS) * Math.max(1, sandW(y) - 3)); R(x0, y, 1, 1, hash2(y, 3, AS) > 0.5 ? th.sandEdge : '#fffaf0'); }
    // ---- water: glints, then plants / reefs / an island ----
    const waterSpot = (lo, hi, avoidDock) => { for (let k = 0; k < 10; k++) { const y0 = Math.round(Lw.minY + 4 + rr() * (Lw.maxY - Lw.minY - 6)), s = shoreAt(y0), x0 = Math.round(s + 3 + (lo + rr() * (hi - lo)) * (ww - s - 6)); if (!avoidDock || Math.abs(y0 - Lw.dockY) > 7 || x0 > Lw.dockX1 + 6) return [x0, y0]; } return null; };
    for (let k = 0; k < Math.round((ww - shoreAt(Lw.minY)) * (wh - wt) / 260); k++) { const y0 = Math.round(wt + 6 + rr() * (wh - wt - 6)), s = shoreAt(y0), x0 = Math.round(s + 4 + rr() * (ww - s - 8)); R(x0, y0, 2 + Math.floor(rr() * 3), 1, mixH(W0[depthK(x0, y0) > 0.45 ? 2 : 1], th.hl, 0.45)); }
    Lw.glowPts = [];
    const reeds = (x0, y0, n, stem, tip, glow) => {
      for (let k = 0; k < n; k++) { const x1 = x0 + k * 2 - n + (k % 2), h = 4 + Math.floor(hash2(x0 + k, y0, AS) * 5); R(x1, y0 - h, 1, h, stem); if (k % 2 === 0) { R(x1, y0 - h - 2, 1, 2, tip); if (glow) Lw.glowPts.push({ x: x1, y: y0 - h - 1 }); } else R(x1 + 1, y0 - h + 1, 1, 1, stem); }
      R(x0 - n, y0 + 1, n * 2 + 1, 1, mixH(th.water[0], stem, 0.3));
    };
    if (area === 'meadow') {
      for (let k = 0; k < 4; k++) { const y0 = Math.round(Lw.minY + 12 + (k + rr() * 0.6) * (Lw.span / 4.2)); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3 + (k % 2), '#4b8a3a', '#8f563b'); }
      for (let k = 0; k < 7; k++) {
        const q = waterSpot(0.1, 0.5, true); if (!q) continue; const [x0, y0] = q, big = k % 3 === 0;
        R(x0 - (big ? 3 : 2), y0, big ? 7 : 5, 1, '#3f8a3a'); R(x0 - (big ? 2 : 1), y0 - 1, big ? 5 : 3, 1, '#6abe30'); R(x0 - (big ? 2 : 1), y0 + 1, big ? 5 : 3, 1, '#2f6a3a'); R(x0 + 1, y0, 1, 1, '#2f6a3a');
        R(x0 - (big ? 2 : 1), y0 - 1, 1, 1, '#99e550');
        if (k % 2 === 0) { R(x0 - 1, y0 - 2, 2, 1, '#f7b6c8'); R(x0 - 1, y0 - 3, 1, 1, '#ffffff'); R(x0, y0 - 2, 1, 1, '#e07ba0'); }
      }
    } else if (area === 'beach') {
      for (let k = 0; k < 7; k++) { // reef shadows, with a little coral in the shallower ones
        const q = waterSpot(0.25, 0.85, true); if (!q) continue; const [x0, y0] = q, c = mixH(th.water[2], '#123a6a', 0.35);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx / 25 + dy * dy / 4 <= 1 && ((x0 + dx + y0 + dy) & 1 || Math.abs(dx) < 3)) R(x0 + dx, y0 + dy, 1, 1, c);
        if (depthK(x0, y0) < 0.5) { R(x0 - 2, y0 - 1, 1, 2, '#f07a84'); R(x0 + 1, y0 - 2, 1, 2, '#f5a86a'); R(x0 + 3, y0 - 1, 1, 1, '#f7b6c8'); }
      }
      // a far island with a palm and a tiny lighthouse
      const ix = Math.round(ww * 0.82), iy = wt;
      R(ix - 12, iy - 1, 24, 2, th.sand); R(ix - 10, iy - 3, 20, 2, '#8cc47a'); R(ix - 7, iy - 5, 13, 2, '#9ccf8a'); R(ix - 4, iy - 6, 6, 1, '#9ccf8a'); R(ix - 12, iy + 1, 24, 1, '#ffffff');
      R(ix + 3, iy - 13, 3, 8, '#ffffff'); R(ix + 3, iy - 11, 3, 2, '#e8404a'); R(ix + 3, iy - 7, 3, 2, '#e8404a'); R(ix + 3, iy - 15, 3, 2, '#595a70'); R(ix + 2, iy - 13, 5, 1, '#595a70');
      Lw.beacon = { x: ix + 4, y: iy - 14 };
      for (let k = 0; k < 7; k++) R(ix - 5 + (k > 4 ? 1 : 0), iy - 6 - k, 1, 1, '#8a7a50');
      R(ix - 8, iy - 13, 7, 1, '#4f8a54'); R(ix - 9, iy - 12, 2, 1, '#4f8a54'); R(ix - 3, iy - 12, 2, 1, '#4f8a54'); R(ix - 6, iy - 14, 3, 1, '#6fa86a');
    } else Lw.beacon = null;
    if (area === 'moonlit') {
      for (let k = 0; k < 5; k++) { const y0 = Math.round(Lw.minY + 10 + (k + rr() * 0.6) * (Lw.span / 5.2)); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3, '#2a4a60', '#9ff8ff', true); }
      for (let k = 0; k < 5; k++) {
        const q = waterSpot(0.1, 0.55, true); if (!q) continue; const [x0, y0] = q;
        R(x0 - 2, y0, 5, 1, '#2a5a5a'); R(x0 - 1, y0 - 1, 3, 1, '#3f7a70'); R(x0 - 1, y0 + 1, 3, 1, '#1f4040');
        if (k % 2 === 0) { R(x0 - 1, y0 - 2, 3, 1, '#e0d0ff'); R(x0, y0 - 3, 1, 1, '#ffffff'); R(x0 - 1, y0 - 1, 1, 1, '#c09af0'); R(x0 + 1, y0 - 1, 1, 1, '#c09af0'); Lw.glowPts.push({ x: x0, y: y0 - 2 }); }
      }
    }
    if (area === 'candy') {
      for (let k = 0; k < 16; k++) { const q = waterSpot(0.05, 0.95, false); if (!q) continue; const [x0, y0] = q; if (k % 3) R(x0, y0, 1, 1, '#ffffff'); else { R(x0 - 1, y0, 1, 1, '#ffffff'); R(x0 + 1, y0, 1, 1, '#ffffff'); R(x0, y0 - 1, 1, 1, '#ffffff'); R(x0, y0 + 1, 1, 1, '#ffffff'); } }
      for (let k = 0; k < 3; k++) { // rock-candy crystals poking out of the soda
        const q = waterSpot(0.3, 0.8, true); if (!q) continue; const [x0, y0] = q, c = ['#f7b6c8', '#c9a2f0', '#9fd8ff'][k];
        R(x0 - 2, y0 - 3, 2, 4, c); R(x0, y0 - 5, 2, 6, c); R(x0 + 2, y0 - 2, 2, 3, c); R(x0, y0 - 5, 1, 4, '#ffffff'); R(x0 - 3, y0 + 1, 8, 1, '#ffffff');
      }
    }
    // ---- dock: planks on posts, a lamp at the end ----
    const dy = Lw.dockY, x0 = Lw.dockX0, x1 = Lw.dockX1;
    X.fillStyle = 'rgba(34,32,52,.22)'; X.fillRect(x0 + 2, dy + 1, x1 - x0, 2);
    for (const px of [x0 + 5, Math.round((x0 + x1) / 2) + 2, x1 - 1]) { R(px, dy - 1, 1, 4, '#663931'); R(px - 1, dy + 3, 3, 1, W0[0]); R(px - 2, dy + 4, 1, 1, W0[0]); R(px + 2, dy + 4, 1, 1, W0[0]); }
    R(x0 - 1, dy - 4, x1 - x0 + 3, 1, INK); R(x0 - 1, dy - 3, 1, 3, INK); R(x1 + 1, dy - 3, 1, 3, INK); R(x0 - 1, dy, x1 - x0 + 3, 1, INK);
    R(x0, dy - 3, x1 - x0 + 1, 1, '#e4b27a'); R(x0, dy - 2, x1 - x0 + 1, 2, '#b8743a'); R(x0, dy - 1, x1 - x0 + 1, 1, '#9a5f32');
    for (let i = x0 + 2; i < x1; i += 3) R(i, dy - 3, 1, 3, '#8f563b');
    for (let i = x0 + 4; i < x1; i += 6) R(i, dy - 2, 1, 1, '#595652');
    Lw.lamp = { x: x1 - 1, y: dy - 12 };
    R(x1 - 2, dy - 14, 5, 5, INK); R(x1 - 1, dy - 15, 3, 1, INK); R(x1 - 1, dy - 9, 3, 6, INK);
    R(x1, dy - 9, 1, 5, '#595a70'); R(x1 - 1, dy - 14, 3, 1, '#595a70');
    R(x1 - 1, dy - 13, 3, 3, '#f6c83a'); R(x1 - 1, dy - 13, 1, 2, '#fff27a');
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
    const oldW = ww, oldMin = Lw.minY, oldSpan = Lw.span, k0 = ZMIN ? Z / ZMIN : 0;
    W = r.width; H = r.height;
    // the whole world fits the screen at ZMIN (about TUNE.worldW world pixels across)
    // (rounded to whole device pixels, so the zoomed-out view is crisp too; wide screens get a slightly wider world)
    ZMIN = Math.max(TUNE.zoomMinPx, Math.floor(W / TUNE.worldW * DPR) / DPR);
    ZMIN = Math.ceil(ZMIN * DPR - 0.001) / DPR; ZMAX = ZMIN * TUNE.zoomMax;
    ww = Math.ceil(W / ZMIN); wh = Math.ceil(H / ZMIN);
    for (const c of [buf, skyC, bgC]) { c.width = ww; c.height = wh; }
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    layout();
    // keep everything where it was relative to the (possibly resized) world
    const fx = oldW ? ww / oldW : 1;
    for (const r2 of RT.values()) { r2.x = clamp(r2.x * fx, 6, ww + 20); r2.y = clamp(oldSpan ? Lw.minY + (r2.y - oldMin) / oldSpan * Lw.span : r2.y, Lw.minY, Lw.maxY); }
    for (const a in ground) for (const f of ground[a]) { f.x = clamp(f.x * fx, 5, ww - 5); f.y = clamp(oldSpan ? Lw.minY + (f.y - oldMin) / oldSpan * Lw.span : f.y, Lw.minY, Lw.maxY); }
    Z = snapZ(ZMIN * (k0 || zoomPref || TUNE.zoomDef));
    if (!k0) focusCamera(); else clampCam();
    return true;
  }

  // ---------------- camera ----------------
  const viewW = () => W / Z, viewH = () => H / Z;
  // crisp pixels: at rest the zoom is a whole number of device pixels per world pixel
  function snapZ(z) {
    z = clamp(z, ZMIN, ZMAX);
    let s = Math.round(z * DPR) / DPR;
    if (s < ZMIN - 0.001) s = Math.ceil(ZMIN * DPR) / DPR;
    if (s > ZMAX + 0.001) s = Math.floor(ZMAX * DPR) / DPR;
    return s;
  }
  function camLimits() {
    const trayH = trayEl ? trayEl.offsetHeight || 110 : 110;
    const maxX = Math.max(0, ww - viewW());
    // don't scroll further down than the bottom of the lawn sitting just above the tray
    const maxY = Math.max(0, Math.min(wh - viewH(), Lw.maxY + 12 - (H - trayH - 8) / Z));
    return { maxX, maxY };
  }
  function clampCam() { const L = camLimits(); camX = clamp(camX, 0, L.maxX); camY = clamp(camY, 0, L.maxY); }
  // start the view on your partner (or an egg) in this area
  function focusCamera() {
    let fx = ww * 0.42, fy = Lw.minY + Lw.span * 0.5;
    const mine = PS.S.sprouts.filter(x => x.area === area), act = ST.active();
    const s0 = mine.includes(act) ? act : mine[0], r = s0 && RT.get(s0.id);
    if (r) { fx = r.x; fy = r.y - 10; } else { const e = PS.S.eggs.find(x => x.area === area); if (e) fy = Lw.minY + Lw.span * 0.46; }
    camX = fx - viewW() * 0.45; camY = fy - viewH() * 0.52; camV.x = camV.y = 0; zoomAnim = null;
    clampCam();
  }
  const clientToWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left) / Z + camX, y: (cy - r.top) / Z + camY }; };
  const worldToScreen = (x, y) => ({ x: (x - camX) * Z, y: (y - camY) * Z }); // CSS px inside the garden
  // zoom to z keeping the world point under screen point (sx, sy) in place
  function zoomAt(z, sx, sy) {
    const wx = sx / Z + camX, wy = sy / Z + camY;
    Z = clamp(z, ZMIN * 0.85, ZMAX * 1.15);
    camX = wx - sx / Z; camY = wy - sy / Z; clampCam();
  }
  function animateZoom(to, sx, sy) { zoomAnim = { from: Z, to: snapZ(to), sx: sx == null ? W / 2 : sx, sy: sy == null ? H / 2 : sy, k: 0 }; }
  function saveZoomPref() { zoomPref = Z / ZMIN; try { localStorage.setItem(ZKEY, zoomPref.toFixed(3)); } catch (e) { /* blocked */ } }
  function updateCamera(dt) {
    if (zoomAnim) {
      zoomAnim.k = Math.min(1, zoomAnim.k + dt / 0.22);
      const e = 1 - Math.pow(1 - zoomAnim.k, 3);
      zoomAt(lerp(zoomAnim.from, zoomAnim.to, e), zoomAnim.sx, zoomAnim.sy);
      if (zoomAnim.k >= 1) { Z = zoomAnim.to; clampCam(); zoomAnim = null; saveZoomPref(); }
    }
    if (zoomSnapT > 0) { zoomSnapT -= dt; if (zoomSnapT <= 0 && !pinch && !zoomAnim) animateZoom(Z, lastClient.sx, lastClient.sy); }
    // fling
    if (!pinch && !(press && press.kind === 'bg') && (Math.abs(camV.x) > 0.5 || Math.abs(camV.y) > 0.5)) {
      camX += camV.x * dt; camY += camV.y * dt; const k = Math.pow(0.02, dt); camV.x *= k; camV.y *= k;
      const bx0 = camX, by0 = camY; clampCam(); if (camX !== bx0) camV.x = 0; if (camY !== by0) camV.y = 0;
    }
    // carrying a Sprout or an item to the edge of the screen scrolls the garden
    const carrying = drag || here.some(r => r.state === 'held');
    if (carrying && lastClient.on && !pinch) {
      const r = cv.getBoundingClientRect(), x = lastClient.x - r.left, y = lastClient.y - r.top, m = 40, sp = TUNE.edgePan / Z * ZMIN * dt;
      let dx = x < m ? -1 : x > W - m ? 1 : 0, dy = y < m + 50 ? -1 : y > H - m - (drag ? 0 : 60) ? 1 : 0;
      if (dx || dy) {
        const ox = camX, oy = camY; camX += dx * sp; camY += dy * sp; clampCam();
        if (camX !== ox || camY !== oy) { const p = clientToWorld(lastClient.x, lastClient.y); ptr.x = p.x; ptr.y = p.y; }
      }
    }
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
    if (!Array.isArray(a)) a = G.trees[area] = [];
    // old saves hold 3 slots (the main tree); slots for the other trees are appended, existing ones are never wiped
    const need = Math.max(3, (Lw.slots || []).length);
    for (let i = 0; i < need; i++) if (!a[i] || !D.FRUITS[a[i].kind]) a[i] = { kind: pick(D.TREE_FRUITS), readyAt: (a[i] && +a[i].readyAt) || 0 };
    return a;
  }
  function growK(sl) { const now = Date.now(); if (sl.readyAt <= now) return 1; return clamp(1 - (sl.readyAt - now) / (D.GROWTH.fruitRegrowSec * 1000), 0, 1); }
  function takeTreeFruit(i) {
    const sl = treeSlots()[i], kind = sl.kind, p = Lw.slots[i];
    sl.kind = pick(D.TREE_FRUITS); sl.readyAt = Date.now() + D.GROWTH.fruitRegrowSec * 1000; PS.save();
    burst(p.x, p.y, 'leaf', 6); snd('pop');
    return kind;
  }

  // ---------------- fruit on the ground (saved per area, so snacks wait for your Sprouts) ----------------
  function groundList(a) {
    if (!ground[a]) {
      const G = PS.S.garden && PS.S.garden.ground && PS.S.garden.ground[a];
      ground[a] = (Array.isArray(G) ? G : []).filter(g => D.FRUITS[g.kind]).map(g => ({ kind: g.kind, x: clamp(g.fx * ww, 5, ww - 5), y: clamp(Lw.minY + g.fy * Lw.span, Lw.minY, Lw.maxY), z: 0, vz: 0 }));
    }
    return ground[a];
  }
  function saveGround() {
    if (!ww || !Lw.span) return;
    const G = PS.S.garden || (PS.S.garden = {}); G.ground = G.ground || {};
    for (const a in ground) G.ground[a] = ground[a].map(f => ({ kind: f.kind, fx: +(f.x / ww).toFixed(3), fy: +((f.y - Lw.minY) / Lw.span).toFixed(3) }));
    PS.save();
  }
  function takeGround(f) { const gl = groundList(area), i = gl.indexOf(f); if (i < 0) return false; gl.splice(i, 1); saveGround(); return true; }
  function dropFruit(kind, x, y, z) {
    const f = { kind, x, y, z: z || 0, vz: 0 };
    groundList(area).push(f); saveGround(); snd('pop'); markSeen('drop-fruit');
    // Sprouts that are close by notice it right away
    for (const r of here) {
      if ((r.state !== 'idle' && r.state !== 'walk') || r.target || dist(r, f) > TUNE.smellRange) continue;
      r.state = 'idle'; r.timer = Math.min(r.timer, 0.3);
    }
    return f;
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
    const gl = groundList(area);
    const free = gl.filter(f => !f.claim || f.claim.until < t || f.claim.id === r.id);
    if (free.length) {
      let best = null, bd = 1e9; for (const f of free) { const d = dist(r, f); if (d < bd) { bd = d; best = f; } }
      // close snacks are sniffed out straight away; far ones get found sooner or later while wandering
      if (bd < TUNE.smellRange || Math.random() < 0.3) {
        best.claim = { id: r.id, until: t + 16 };
        goTo(r, best.x - 5 * (best.x > r.x ? 1 : -1), best.y, { type: 'fruit', f: best }); emote(r, bd < TUNE.smellRange ? '!' : '?', 1); return;
      }
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
    const skin = s.look && s.look.skin, spook = SPOOKY[skin], dark = night || TH[area].bigMoon;
    if (skin && r.state !== 'travel' && Math.random() < dt * (spook ? (dark ? 1.2 : 0.5) : 1.6)) {
      const col = spook ? pick(spook.c) : skin === 'rainbow' ? pick(['#f07a84', '#f6a83a', '#fbf236', '#99e550', '#5fcde4', '#c9a2f0']) : skin === 'gold' ? pick(['#fff27a', '#ffffff']) : skin === 'crystal' ? pick(['#ffffff', '#c8ecfa', '#d8ccf8']) : pick(['#f6a83a', '#fff27a']);
      parts.push({ x: r.x + rand(-9, 9), y: r.y - rand(6, 20) - (r.state === 'fall' ? r.z : 0), vx: 0, vy: -4, life: 0.7, type: 'spark', color: col });
    }
    // now and then at night a tiny bat or ghost wisp floats up from a spooky Sprout
    if (spook && dark && r.state !== 'travel' && Math.random() < dt * 0.18) parts.push({ x: r.x + rand(-6, 6), y: r.y - 22 - (r.state === 'fall' ? r.z : 0), vx: rand(-4, 4), vy: -7, life: 2.2, type: spook.fx, color: spook.c[0] });
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
            if (takeGround(tg.f)) { r.facing = tg.f.x > r.x ? 1 : -1; feedSprout(r, tg.f.kind); } else { r.state = 'idle'; r.timer = 0.6; }
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
    for (const p of res.lost || []) { floaterFor(r, `Shed ${PART_NAMES[p] || p}`, '#8c93a8'); burst(r.x, r.y - 16, 'leaf', 5); }
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
        html: '<ol><li>Rub it to pet it. Tap it to see its stats.</li><li>Drag fruit from the tree onto it, or onto the grass as a snack to find.</li><li>Tap animals that wander in to catch them, then drag them from your pouch onto it. They change its stats, body and moves.</li><li>Press and hold to pick it up. Drop it in the shallows to swim, or in the deep water to travel.</li><li>Pinch to zoom in and out, and drag the grass to look around.</li></ol>',
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
  function hintTree() {
    if (seen('feed') || !PS.S.sprouts.some(s => s.area === area)) return -1;
    const sl = treeSlots(); for (let i = 0; i < Lw.slots.length; i++) if (sl[i] && growK(sl[i]) >= 1) return Lw.slots[i].tree;
    return -1;
  }
  function drawTree(ti, hintT) {
    const T = Lw.trees[ti], c = T.c;
    shadow(T.x, T.y, Math.round(c.width * 0.6));
    PX.blit(bx, c, T.x, T.y);
    const sl = treeSlots(), hint = hintT === ti;
    sl.forEach((s, i) => {
      const p = Lw.slots[i]; if (!p || p.tree !== ti) return;
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
  // puffy clouds, built once per colour set (3 sizes), lit on top with a soft shaded underside
  const cloudCache = new Map();
  function cloudSpr(size) {
    const C = TH[area].cloud, key = C.join() + size;
    let c = cloudCache.get(key); if (c) return c;
    const w = [18, 26, 34][size], h = [7, 9, 11][size], g = new PX.Grid(w, h); g.dither = false;
    const puffs = size === 0 ? [[5, 4.6, 3.6], [10, 3.6, 4], [14, 4.8, 3]] : size === 1 ? [[5, 5.8, 3.8], [11, 4, 4.6], [17, 4.6, 4], [21.5, 6, 3]] : [[5, 7, 4], [11, 4.8, 5], [18, 3.8, 5.4], [25, 5.4, 4.6], [30, 7.4, 3]];
    for (const [x, y, r] of puffs) g.ell(x, y, r, r * 0.8, C[0]);
    g.rect(2, h - 3, w - 4, 2, C[0]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!g.get(x, y)) continue; if (!g.get(x, y + 1) || y >= h - 2) g.set(x, y, C[2]); else if (!g.get(x, y + 2) && (x + y) & 1) g.set(x, y, C[1]); else if (y >= h - 4 && (x + y) & 1) g.set(x, y, C[1]); }
    c = g.canvas(); cloudCache.set(key, c); return c;
  }
  function drawClouds(n) {
    const th = TH[area], a = th.bigMoon ? 0.5 : 1 - n * 0.75;
    if (a <= 0.05) return;
    bx.globalAlpha = a;
    for (const c of DECO.clouds) {
      const s = cloudSpr(c.s), span = ww + s.width + 10;
      const x = Math.round(((c.x * span + t * c.v) % span) - s.width / 2 - 5), y = Math.round(c.y * Lw.hz);
      PX.blit(bx, s, x, y);
    }
    bx.globalAlpha = 1;
  }
  function moonPos() { return { x: Math.round(ww * 0.74), y: Math.round(Lw.hz * 0.36) }; }
  function drawSunMoon(n) {
    const th = TH[area], m = moonPos();
    if (!th.bigMoon && n < 0.98) { const s = sunSprite(), sy = Math.round(m.y + 8 + n * Lw.hz * 0.9); if (n < 0.5) glow(m.x, sy - 8, 14, '255,250,210', 0.16 * (1 - n * 2)); PX.blit(bx, s, m.x, sy); }
    const mv = th.bigMoon ? 1 : n;
    if (mv > 0.02) { const s = moonSprite(th.bigMoon); PX.blit(bx, s, m.x, Math.round(m.y + s.height / 2 + (1 - mv) * Lw.hz * 0.9)); }
  }
  // tiny sprites for things bobbing on the water (built once)
  let floatC = null;
  function floatSprites() {
    if (floatC) return floatC;
    const mk = (w, h, f) => { const g = new PX.Grid(w, h); f(g); g.outline(); return g.canvas(); };
    floatC = {
      lantern: mk(7, 8, g => { g.rect(2, 1, 3, 1, '#595a70'); g.ell(3.5, 4, 2.4, 2.4, ['#fffbd0', '#fbd23a', '#df7126']); g.rect(1, 6, 5, 1, '#8f563b'); }),
      donut: mk(9, 6, g => { g.ell(4.5, 3, 3.8, 2.2, ['#ffd8ec', '#ff8ac4', '#d0508c']); g.set(4, 3, null); g.set(5, 3, null); g.set(3, 2, '#ffffff'); g.set(6, 3, '#fff27a'); g.set(2, 3, '#5fcde4'); }),
      candy: mk(10, 5, g => { g.ell(5, 2.5, 2.4, 1.6, ['#fffab0', '#fcd82c', '#c49c14']); g.poly([[1, 1], [3, 2.5], [1, 4]], '#fcd82c'); g.poly([[9, 1], [7, 2.5], [9, 4]], '#fcd82c'); g.set(4, 2, '#ffffff'); }),
      ring: mk(8, 6, g => { g.ell(4, 3, 3.2, 2, ['#c8fff0', '#5fdcc8', '#2f8f98']); g.set(4, 3, null); g.set(3, 3, null); g.set(2, 2, '#ffffff'); }),
      boat: mk(9, 9, g => { g.poly([[4.5, 0.5], [4.5, 6], [8, 6]], '#ffffff'); g.poly([[4, 1.5], [4, 6], [1.4, 6]], '#fbf3dc'); g.rect(1, 6, 8, 2, '#d24552'); g.set(1, 7, null); }),
    };
    return floatC;
  }
  function drawWater(dt, n) {
    const th = TH[area], wt = Lw.waterTop;
    // fish shadows gliding under the surface
    bx.fillStyle = `rgba(${th.fish},0.26)`;
    for (const f of DECO.fish) {
      const y = Math.round(Lw.minY + 8 + f.b * (Lw.span - 14) + Math.sin(t * f.v * 2.3 + f.ph) * 5), s = shoreAt(y), span = ww - s - 12;
      if (span < 16 || (Math.abs(y - Lw.dockY) < 4 && s + 10 < Lw.dockX1 + 4)) continue;
      const ph = t * f.v + f.ph, X = Math.round(s + 8 + clamp(f.a + Math.sin(ph) * f.r, 0.04, 0.96) * span), d = Math.cos(ph) >= 0 ? 1 : -1, L = f.big ? 4 : 3, wag = Math.floor(t * 4 + f.ph) % 2;
      bx.fillRect(X - L, y, L * 2 + 1, 2); bx.fillRect(X - L + 1, y - 1, L * 2 - 1, 1);
      bx.fillRect(X - d * (L + 1), y - wag, 1, 2); bx.fillRect(X - d * (L + 2), y - 1 + wag, 1, 2);
    }
    // shoreline foam
    bx.fillStyle = th.foam;
    for (let y = wt + 1; y < wh; y++) { const s = shoreAt(y), w = Math.sin(t * 2.2 + y * 0.45); if (w > -0.2) bx.fillRect(s + 1, y, w > 0.6 ? 2 : 1, 1); if (w > 0.85 && (y & 3) === 0) bx.fillRect(s + 3, y, 1, 1); }
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
      // a sailboat on the horizon
      const b = floatSprites().boat, sx = shoreAt(wt) + 10, span = ww - sx + 20, bxp = Math.round(sx + ((t * 1.1) % span) - 10);
      if (bxp > sx - 4) PX.blit(bx, b, bxp, wt + 2 + (Math.floor(t * 1.5) % 2 ? 0 : 1));
    }
    // sparkles
    if (Math.floor(t * 2) % 2) { bx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const y = Math.round(wt + 8 + ((i * 37 + Math.floor(t * 0.5) * 13) % Math.max(1, Lw.maxY - wt - 8))), s = shoreAt(y); bx.fillRect(Math.round(s + (ww - s) * (0.25 + i * 0.18)), y, 2, 1); } }
    // moon reflection
    const moonA = th.bigMoon ? 0.55 + 0.35 * n : n * 0.8;
    if (moonA > 0.1) {
      const m = moonPos(); bx.fillStyle = `rgba(255,246,201,${moonA})`;
      for (let y = wt + 1, i = 0; y < wt + 40 && y < wh; y += 2, i++) { if (m.x < shoreAt(y) + 2) continue; const w = 1 + ((i * 7 + Math.floor(t * 3)) % 3) + Math.max(0, 3 - i / 3); bx.fillRect(Math.round(m.x - w / 2 + Math.sin(t * 2 + i) * 1), y, Math.round(w), 1); }
    }
    // things bobbing on the water: paper lanterns (moonlit), sweets (candy)
    if (area === 'moonlit' || area === 'candy') {
      const F = floatSprites(), kinds = area === 'moonlit' ? ['lantern', 'lantern', 'lantern'] : ['donut', 'candy', 'ring', 'donut'];
      for (let i = 0; i < kinds.length; i++) {
        const f = DECO.floats[i], p = floatPos(f), s = F[kinds[i]];
        if (!p) continue;
        PX.blit(bx, s, p.x, p.y + (Math.floor(t * f.v * 2 + f.ph) % 2));
        bx.fillStyle = th.hl; bx.fillRect(p.x - Math.floor(s.width / 2) - 1, p.y + 1, 2, 1); bx.fillRect(p.x + Math.ceil(s.width / 2) - 1, p.y + 1, 2, 1);
      }
    }
    // soda fizz
    if (th.fizz) {
      if (Math.random() < dt * 9 && fizz.length < 30) { const q = waterPoint(0.05, 0.95); fizz.push({ x: q.x, y: q.y, life: rand(0.8, 1.6) }); }
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
  // drifting slowly across the open water, never over the dock
  function floatPos(f) {
    const y = Math.round(Lw.minY + 6 + f.b * (Lw.span - 10)); if (Math.abs(y - Lw.dockY) < 6) return null;
    const s = shoreAt(y), x = Math.round(s + 10 + clamp(f.a + Math.sin(t * 0.05 * f.v + f.ph) * 0.1, 0.05, 0.95) * (ww - s - 18));
    return { x, y };
  }
  // life in the air: butterflies by day, drifting petals / leaves / motes, birds far off
  const BUGS = { meadow: ['#fbf236', '#f7b6c8', '#ffffff'], candy: ['#f7b6c8', '#9fd8ff', '#fff27a'], beach: ['#ffffff', '#fbf236', '#f5a86a'] };
  const DRIFT = { meadow: ['#f7b6c8', '#99e550', '#ffffff'], moonlit: ['#c9a2f0', '#9fd8ff', '#a6f2d3'], candy: ['#f07a84', '#fff27a', '#639bff'], beach: null };
  function drawAmbient(n) {
    const day = 1 - n, bc = BUGS[area];
    if (bc && day > 0.5 && area !== 'beach') {
      for (const b of DECO.bugs) {
        const p = t * 0.22 + b.p, x = Math.round(10 + (Math.sin(p * 1.1 + b.a * 6) * 0.5 + 0.5) * (shoreAt(Lw.minY + 30) - 24)), y = Math.round(Lw.minY + 4 + (Math.sin(p * 1.7 + b.b * 6) * 0.5 + 0.5) * Lw.span * 0.75 + Math.sin(t * 5 + b.p) * 2);
        const open = Math.floor(t * 9 + b.p * 3) % 2, c = bc[b.c % bc.length];
        bx.fillStyle = c;
        if (open) { bx.fillRect(x - 2, y - 1, 2, 2); bx.fillRect(x + 1, y - 1, 2, 2); } else { bx.fillRect(x - 1, y - 2, 1, 2); bx.fillRect(x + 1, y - 2, 1, 2); }
        bx.fillStyle = INK; bx.fillRect(x, y - 1, 1, 2);
      }
    }
    const dc = DRIFT[area];
    if (dc) {
      for (const d of DECO.drift) {
        const u = (d.p + t * d.v * 0.25) % 1.2 - 0.1, x = Math.round(u * ww), y = Math.round(Lw.minY - 20 + d.y * Lw.span * 0.9 + Math.sin(t * 1.3 + d.ph) * 5 + u * 20);
        const c = dc[d.c % dc.length], f = Math.floor(t * 3 + d.ph) % 3;
        if (area === 'moonlit') { glow(x, y, 2, '200,230,255', 0.25); bx.fillStyle = c; bx.fillRect(x, y, 1, 1); continue; }
        bx.fillStyle = c; if (f === 0) bx.fillRect(x, y, 2, 1); else if (f === 1) bx.fillRect(x, y, 1, 2); else { bx.fillRect(x, y, 1, 1); bx.fillRect(x + 1, y + 1, 1, 1); }
      }
    }
    if ((area === 'beach' || area === 'meadow') && day > 0.4) {
      bx.fillStyle = area === 'beach' ? '#ffffff' : '#4a4a6a';
      for (const b of DECO.birds) {
        const u = (b.p + t * b.v) % 1.3 - 0.15, x = Math.round(u * ww), y = Math.round(b.y * Lw.hz + Math.sin(t * 0.8 + b.ph) * 2), up = Math.floor(t * 4 + b.ph) % 2;
        bx.fillRect(x - 2, y - up, 2, 1); bx.fillRect(x + 1, y - up, 2, 1); bx.fillRect(x, y, 1, 1);
      }
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
    // spooky Sprouts glow softly at night
    if (lit > 0.3) for (const r of here) { const sp = SPOOKY[r.s.look && r.s.look.skin]; if (sp && r.state !== 'travel') glow(r.x, (r.state === 'held' ? r.feetY : r.y - (r.state === 'fall' ? r.z : 0)) - 12, 10, sp.glow, 0.13 * lit); }
    // glowing reed tips and lotus buds, the lighthouse beam, floating lanterns
    for (const q of Lw.glowPts || []) { const pulse = 0.7 + Math.sin(t * 1.7 + q.x * 0.3) * 0.3; glow(q.x, q.y, 3, '160,250,255', 0.3 * lit * pulse); bx.fillStyle = '#c8fff8'; bx.fillRect(q.x, q.y, 1, 1); }
    if (Lw.beacon && Math.floor(t * 1.2) % 3 !== 2) { glow(Lw.beacon.x, Lw.beacon.y, 5, '255,242,170', 0.5 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(Lw.beacon.x - 1, Lw.beacon.y, 3, 1); }
    if (area === 'moonlit') for (let i = 0; i < 3; i++) { const p = floatPos(DECO.floats[i]); if (!p) continue; glow(p.x, p.y - 4, 6, '255,220,140', 0.28 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(p.x - 1, p.y - 5 + (Math.floor(t * DECO.floats[i].v * 2 + DECO.floats[i].ph) % 2), 2, 2); }
    // fireflies
    const count = Math.round((th.bigMoon ? 5 : 0) + 6 * n);
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
        case 'bat': { const up = Math.floor(t * 8 + p.x) % 2; bx.fillStyle = p.color; bx.fillRect(X - 2, Y - up, 2, 1); bx.fillRect(X + 1, Y - up, 2, 1); bx.fillRect(X, Y, 1, 1); break; }
        case 'wisp': { p.vx = Math.sin(t * 3 + p.y * 0.3) * 4; bx.fillStyle = p.color; bx.fillRect(X, Y, 1, 2); bx.fillRect(X + (Math.floor(t * 4) % 2 ? 1 : -1), Y + 2, 1, 1); break; }
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
    for (const f of groundList(area)) if (f.z > 0) { f.vz += TUNE.gravity * dt; f.z = Math.max(0, f.z - f.vz * dt); }
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
    const hintT = hintTree(), list = Lw.trees.map((T, ti) => ({ y: T.y, fn: () => drawTree(ti, hintT) }));
    for (const p of Lw.props) list.push({ y: p.y, fn: () => PX.blit(bx, p.c, p.x, p.y) });
    for (const o of eggsHere()) list.push({ y: o.y, fn: () => drawEgg(o) });
    const emQ = [], top = [];
    for (const r of here) { if (r.state === 'held' || r.state === 'fall') top.push(r); else list.push({ y: r.y, fn: () => drawSprout(r, emQ) }); }
    for (const c of critters) if (c.where !== 'air') list.push({ y: c.y, fn: () => drawCritter(c) });
    for (const f of groundList(area)) list.push({ y: f.y, fn: () => drawGroundFruit(f) });
    list.sort((a, b) => a.y - b.y).forEach(o => o.fn());
    drawAmbient(n);
    for (const c of critters) if (c.where === 'air') drawCritter(c);
    for (const r of top) drawSprout(r, emQ);
    // night overlay over the land (the sky already has its own night colours)
    const na = th.dim + (th.night[3] - th.dim * 0.5) * n;
    if (na > 0.01) {
      // fade in from above the tallest far peaks so snowy tops don't glow at night
      const [cr, cg, cb] = th.night, bh = th.mount ? 5 : 3, y0 = Lw.hz - (th.mount ? 10 + th.mountAmp : 14);
      for (let i = 0; i < 4; i++) { bx.fillStyle = `rgba(${cr},${cg},${cb},${na * (i + 1) / 5})`; bx.fillRect(0, y0 + i * bh, ww, bh); }
      bx.fillStyle = `rgba(${cr},${cg},${cb},${na})`; bx.fillRect(0, y0 + 4 * bh, ww, wh);
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
    const sc = Z * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = TH[area].water[3]; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(buf, Math.round(-camX * sc), Math.round(-camY * sc), ww * sc, wh * sc);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (here.some(r => r.state === 'held')) drawZoneLabels();
    ctx.font = '700 16px "Pixelify Sans", monospace';
    for (const f of floaters) {
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.life -= dt; f.y -= 10 * dt;
      if (f.life < 0.3 && Math.floor(t * 20) % 2) continue;
      const sp = worldToScreen(f.x, f.y), X = Math.round(clamp(sp.x, 80, W - 80)), Y = Math.round(clamp(sp.y, 28, H - 20));
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff8e6'; ctx.strokeText(f.text, X, Y); ctx.fillStyle = f.color; ctx.fillText(f.text, X, Y);
    }
    floaters = floaters.filter(f => f.life > 0);
  }
  function drawZoneLabels() {
    const wy = Lw.minY + Lw.span * 0.62, s = shoreAt(wy), y = Math.round(clamp(worldToScreen(0, wy).y, 90, H - 150));
    const lab = (text, wx, deep) => {
      const X = Math.round(clamp(worldToScreen(wx, 0).x, 40, W - 40)); ctx.font = '700 13px "Pixelify Sans", monospace';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = deep ? 'rgba(34,32,52,.55)' : 'rgba(255,248,230,.75)'; roundRect(X - w / 2, y - 12, w, 20, 8); ctx.fill();
      ctx.fillStyle = deep ? '#fff8e6' : '#2f6f8f'; ctx.fillText(text, X, y + 3);
    };
    lab('Swim', s + (ww - s) * 0.2, false);
    lab('Travel', s + (ww - s) * 0.72, true);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------------- input: world ----------------
  function local(e) { return clientToWorld(e.clientX, e.clientY); }
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
    if (!visible || (e.button != null && e.button > 0)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastClient.x = e.clientX; lastClient.y = e.clientY; lastClient.on = true;
    camV.x = camV.y = 0;
    // a second finger: pinch to zoom (unless the first one is carrying something)
    if (touches.size >= 2) {
      if (drag || (press && press.kind === 'sprout' && press.mode === 'hold')) return;
      press = null; beginPinch(); return;
    }
    if (press || drag || pinch) return;
    PX.Sound.unlock();
    const p = local(e); ptr.x = ptr.px = p.x; ptr.y = ptr.py = p.y; ptr.vx = 0;
    const base = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, ms: performance.now() };
    for (const o of eggsHere()) { const c = itemSpr('egg', o.e.kind); if (Math.hypot(p.x - o.x, p.y - (o.y - c.height / 2)) < Math.max(12, c.height / 2 + 2)) { closeCard(); tapEgg(o); return; } }
    for (const d of (drops[area] || []).slice().reverse()) if (Math.hypot(p.x - d.x, p.y - (d.y - 5 - d.z)) < 9) { collectDrop(d); return; }
    const sl = treeSlots();
    for (let i = 0; i < sl.length; i++) { const q = Lw.slots[i]; if (q && growK(sl[i]) >= 1 && Math.hypot(p.x - q.x, p.y - q.y) < 7.5) { press = Object.assign({ kind: 'tree', i, x0: p.x, y0: p.y }, base); return; } }
    const gl = groundList(area);
    for (let i = gl.length - 1; i >= 0; i--) { const f = gl[i]; if (Math.hypot(p.x - f.x, p.y - (f.y - 5)) < 7.5) { press = Object.assign({ kind: 'gfruit', f, x0: p.x, y0: p.y }, base); return; } }
    for (const c of critters) if (critterHit(c, p)) { catchCritter(c); return; }
    const r = sproutAt(p);
    if (r) { press = Object.assign({ kind: 'sprout', r, t0: t, x0: p.x, y0: p.y, mode: 'pending', rub: 0 }, base); return; }
    if (propAt(p) === 'gumball') { press = Object.assign({ kind: 'gumball' }, base); return; }
    press = Object.assign({ kind: 'bg', lx: e.clientX, ly: e.clientY, cam0: camX, cam0y: camY, vx: 0, vy: 0, lt: performance.now() }, base);
  }
  function beginPinch() {
    const [a, b] = [...touches.values()], r = cv.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    pinch = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: Z, wx: mx / Z + camX, wy: my / Z + camY };
    zoomAnim = null; closeCard(); markSeen('zoom');
  }
  function movePinch() {
    const [a, b] = [...touches.values()], r = cv.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, d = Math.hypot(a.x - b.x, a.y - b.y);
    Z = clamp(pinch.z0 * d / pinch.d0, ZMIN * 0.85, ZMAX * 1.15);
    camX = pinch.wx - mx / Z; camY = pinch.wy - my / Z; clampCam();
    pinch.mx = mx; pinch.my = my;
  }
  function onMove(e) {
    if (!visible) return;
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.has(e.pointerId) || (drag && drag.pid === e.pointerId) || (trayPress && trayPress.pid === e.pointerId)) { lastClient.x = e.clientX; lastClient.y = e.clientY; lastClient.on = true; }
    if (pinch) { if (touches.size >= 2) movePinch(); return; }
    if (trayPress && trayPress.pid === e.pointerId && !drag) trayPressMove(e);
    if (drag && drag.pid === e.pointerId) { moveGhost(e); updateHover(e); }
    if (!press || press.pid !== e.pointerId) return;
    const p = local(e);
    ptr.vx = lerp(ptr.vx, p.x - ptr.x, 0.5); ptr.x = p.x; ptr.y = p.y;
    if (press.kind === 'tree' || press.kind === 'gfruit') {
      if (Math.hypot(p.x - press.x0, p.y - press.y0) > 3) {
        let kind;
        if (press.kind === 'tree') kind = takeTreeFruit(press.i);
        else { if (!takeGround(press.f)) { press = null; return; } kind = press.f.kind; }
        const src = press.kind; press = null;
        startDrag(src, kind, e, -1);
      }
    } else if (press.kind === 'bg') {
      // drag the empty garden to look around
      const now = performance.now(), dtm = Math.max(1, now - press.lt), dx = e.clientX - press.lx, dy = e.clientY - press.ly;
      camX -= dx / Z; camY -= dy / Z; clampCam();
      press.vx = lerp(press.vx, -dx / Z / dtm * 1000, 0.4); press.vy = lerp(press.vy, -dy / Z / dtm * 1000, 0.4);
      press.lx = e.clientX; press.ly = e.clientY; press.lt = now;
      if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 10) press.panned = true;
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
    const wasTouch = touches.delete(e.pointerId);
    if (!touches.size) lastClient.on = false;
    if (!visible) return;
    if (pinch) {
      if (touches.size < 2) {
        const mx = pinch.mx == null ? W / 2 : pinch.mx, my = pinch.my == null ? H / 2 : pinch.my;
        pinch = null; animateZoom(Z, mx, my);
        // the finger still down keeps panning
        const rest = [...touches.entries()][0];
        if (rest) press = { kind: 'bg', pid: rest[0], sx: rest[1].x, sy: rest[1].y, lx: rest[1].x, ly: rest[1].y, ms: performance.now(), cam0: camX, cam0y: camY, vx: 0, vy: 0, lt: performance.now(), panned: true };
      }
      return;
    }
    void wasTouch;
    if (trayPress && trayPress.pid === e.pointerId) trayPressUp(e, cancelled);
    if (drag && drag.pid === e.pointerId) endDrag(e, cancelled);
    if (!press || press.pid !== e.pointerId) return;
    const pr = press; press = null;
    if (cancelled) { if (pr.kind === 'sprout' && pr.mode === 'hold' && pr.r.state === 'held') release(pr.r); return; }
    if (pr.kind === 'tree') { const kind = takeTreeFruit(pr.i); ST.addFruit(kind, 1); floater(`+1 ${D.FRUITS[kind].name}`, '#5b4630', Lw.slots[pr.i].x, Lw.slots[pr.i].y - 6); markSeen('pick'); return; }
    if (pr.kind === 'gfruit') { if (takeGround(pr.f)) { ST.addFruit(pr.f.kind, 1); floater(`+1 ${D.FRUITS[pr.f.kind].name}`, '#5b4630', pr.f.x, pr.f.y - 12); snd('pop'); } return; }
    if (pr.kind === 'sprout') {
      if (pr.mode === 'pending') tapSprout(pr.r);
      else if (pr.mode === 'hold' && pr.r.state === 'held') release(pr.r);
      return;
    }
    if (pr.kind === 'gumball') { if (Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) < 12) { snd('pop'); PS.ui.go('shop', { tab: 'gumball' }); } return; }
    if (pr.kind === 'bg') {
      const dx = e.clientX - pr.sx, dy = e.clientY - pr.sy, ms = performance.now() - pr.ms;
      // a quick sideways swipe changes area, but only when the view can't scroll that way any more
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && ms < 700 && Math.abs(camX - pr.cam0) < 1) { switchArea(dx < 0 ? 1 : -1); return; }
      if (pr.panned) { if (performance.now() - pr.lt < 90) { camV.x = clamp(pr.vx, -600, 600); camV.y = clamp(pr.vy, -600, 600); } return; }
      closeCard();
      // double-tap: zoom all the way out, or back in
      const now = performance.now();
      if (lastTapBg && now - lastTapBg.t < 330 && Math.hypot(e.clientX - lastTapBg.x, e.clientY - lastTapBg.y) < 30) {
        const r = cv.getBoundingClientRect();
        animateZoom(Z > ZMIN * 1.05 ? ZMIN : ZMIN * TUNE.zoomDef, e.clientX - r.left, e.clientY - r.top); lastTapBg = null; markSeen('zoom');
      } else lastTapBg = { t: now, x: e.clientX, y: e.clientY };
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
  function ghostWorld(e) { const g = ghostPoint(e), cr = root.getBoundingClientRect(); return clientToWorld(g.x + cr.left, g.y + cr.top); }
  function dropTarget(e) {
    const pg = ghostWorld(e); pg.y += 4 * ZMIN / Z * 1.5;
    return sproutAt(pg, 1.5) || sproutAt(local(e), 1.3);
  }
  function updateHover(e) { drag.hover = dropTarget(e); }
  function endDrag(e, cancelled) {
    const d = drag; drag = null;
    ghostEl.style.transform = 'translate(-999px,-999px)';
    if (d.el) d.el.classList.remove('g-lift');
    const target = cancelled ? null : dropTarget(e);
    if (d.src === 'pouch') { if (target) giveAnimal(target, d.idx, d.id); }
    else if (target) { if (d.src !== 'fruitinv' || ST.useFruit(d.id)) feedSprout(target, d.id); }
    else if (!cancelled || d.src !== 'fruitinv') {
      // no Sprout under it: drop the fruit on the grass for a Sprout to find (or it sinks in the water)
      const cr = root.getBoundingClientRect(), overTray = e.clientY - cr.top > H - trayEl.offsetHeight - 10;
      const q = ghostWorld(e), wx = clamp(q.x, 5, ww - 5), wy = q.y + 6, gy = clamp(wy, Lw.minY, Lw.maxY);
      const fromTray = d.src === 'fruitinv';
      if (!fromTray && overTray && !cancelled) { ST.addFruit(d.id, 1); snd('pop'); PS.ui.toast(`+1 ${D.FRUITS[d.id].name} in your fruit tray`, 1800); }
      else if (fromTray && (overTray || groundList(area).length >= TUNE.maxGroundFruit)) { if (!overTray) PS.ui.toast('That\'s a lot of snacks already! Let your Sprouts eat some first.', 2600); }
      else if (inWater(wx, gy)) {
        if (fromTray) PS.ui.toast('Drop fruit on the grass, not in the water!', 2400);
        else { burst(wx, gy - 1, 'drop', 8, '#cbdbfc'); snd('splash'); floater('Plop. It sank.', '#5b4630', wx, gy - 8); }
      } else if (!fromTray || ST.useFruit(d.id)) dropFruit(d.id, wx, gy, Math.max(0, gy - wy));
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
    if (!seen('feed')) { if (hintTree() >= 0) return 'Drag a fruit from a tree onto a Sprout'; if (Object.values(PS.S.fruits || {}).some(n => n > 0)) return 'Drag a fruit from your tray onto a Sprout'; }
    if (!seen('pet')) return 'Rub a Sprout to pet it';
    if ((drops[area] || []).length && !seen('drop')) return 'Something sparkly! Tap it';
    if (!seen('hold')) return 'Press and hold a Sprout to pick it up';
    if (!seen('swim')) return 'Drop a Sprout in the shallows to swim';
    if (!seen('travel')) return 'Drop a Sprout in the deep water to travel';
    if (!seen('zoom')) return 'Pinch with two fingers to zoom in and out';
    if (!seen('drop-fruit') && Object.keys(PS.S.fruits || {}).length) return 'Drag fruit onto the grass to leave a snack';
    if (!seen('area')) return 'Use the arrows to visit other areas';
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
    closeCard(); buildProps(); skyKey = ''; bgKey = ''; focusCamera();
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
    cv.addEventListener('wheel', e => {
      if (!visible) return; e.preventDefault();
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      zoomAnim = null; zoomAt(Z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), sx, sy);
      lastClient.sx = sx; lastClient.sy = sy; zoomSnapT = 0.18; markSeen('zoom');
    }, { passive: false });
    // iOS Safari page-zoom gestures would fight the pinch
    for (const ev of ['gesturestart', 'gesturechange']) cv.addEventListener(ev, e => e.preventDefault());
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
    PS.on('reset', () => { RT.clear(); critters = []; for (const k in drops) delete drops[k]; for (const k in ground) delete ground[k]; closeCard(); renderTray(); shownOnce = false; });
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
    here = PS.S.sprouts.filter(x => x.area === area).map(getRT);
    if (!shownOnce) { shownOnce = true; focusCamera(); }
    if (params && params.id) { const s = ST.get(params.id); if (s && s.area === area) { const r = getRT(s); openCard(r); camX = r.x - viewW() / 2; camY = r.y - viewH() * 0.45; clampCam(); } }
  }
  let shownOnce = false;
  function hide() {
    visible = false;
    if (drag) { ghostEl.style.transform = 'translate(-999px,-999px)'; if (drag.el) drag.el.classList.remove('g-lift'); drag = null; }
    if (trayPress) { clearTimeout(trayPress.timer); trayPress = null; }
    touches.clear(); pinch = null; lastClient.on = false; camV.x = camV.y = 0;
    settleAll(); flushAll(); saveGround(); closeCard(); PS.save();
  }
  function frame(dt, tt) {
    if (!visible) return;
    t = tt;
    checkSize(); if (!ww) return;
    updateCamera(dt);
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
    RT, get here() { return here; }, get critters() { return critters; }, drops, ground, Lw, get area() { return area; }, get pxs() { return Z; },
    get cam() { return { x: camX, y: camY, z: Z, zmin: ZMIN, zmax: ZMAX, ww, wh }; }, zoomAt, animateZoom, focusCamera, dropFruit, groundList, setCam(x, y) { camX = x; camY = y; clampCam(); },
    spawnCritter, spawnDrop, setArea, switchArea, eggsHere, tapEgg, treeSlots, feedSprout, giveAnimal, startTravel, askTravel, openCard, closeCard,
    toScreen: (x, y) => { const r = cv.getBoundingClientRect(), p = worldToScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; },
  };
})();
