// garden.js — Solunar Sprouts Garden screen.
// Four areas (Meadow, Beach, Moonlit Grove, Candy Isle), each with a body of water on the right. Eggs to hatch, Sprouts with a
// little AI (wander, swim, eat, greet), critters to catch, coin/XP drops, a fruit tree, a pouch + fruit tray, and travel
// between areas by swimming. One world buffer is drawn per frame at PX.SCENE_K buffer pixels per world pixel (so the hi-res
// sprites keep their fine pixels) and scaled up with no smoothing; floaters are drawn crisp at display resolution on top.
// Art rule (Nov 2026): one level of detail everywhere. Scenery, ground details and effects are drawn in fine pixels (1 / SK of a
// world pixel), with soft bands instead of checker dither, so nothing looks chunkier than the Sprouts standing on it.
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
  // music, jingles and Sprout voices (audio.js). All optional: the garden works without them. audio.js's stand-in (before its
  // engine loads) is one shared no-op, so "the jingle function isn't the stop function" means the real engine is there.
  const audioReady = () => !!(PX.Music && PX.Music.jingle && PX.Music.jingle !== PX.Music.stop);
  const jingle = (id, fb) => { try { if (audioReady()) { PX.Music.jingle(id); return; } } catch (e) { /* audio optional */ } if (fb) snd(fb); };
  const cryReady = () => !!(PX.Cry && PX.Cry.play && !(PX.Music && PX.Cry.play === PX.Music.stop));
  const cry = (s, o) => { try { if (cryReady() && s) PX.Cry.play(s, o || {}); } catch (e) { /* audio optional */ } };
  // newer sound names (audio.js) with an older pixel.js sound to use until that engine is there
  const OLD_SFX = { bump: 'thud', bloop: 'pop', twinkle: 'chime', coin: 'chime', star: 'chime' };
  const sndP = (n, p) => { try { PX.Sound.play(!audioReady() && OLD_SFX[n] ? OLD_SFX[n] : n, { pitch: p || 1 }); } catch (e) { /* audio optional */ } };
  const RMO = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  // a sprite's size in world px (a finer art pass can teach PX.artW / PX.artH about its sprites; until then it's the canvas size)
  const artW = c => (PX.artW ? PX.artW(c) : c.width), artH = c => (PX.artH ? PX.artH(c) : c.height);
  // scene resolution: buffer pixels per world pixel (the world keeps its coordinates; FP = one fine pixel in world px)
  const SK = (PX && PX.SCENE_K) || 1, FP = 1 / SK;
  // a hi-res art canvas drawn at its art size (never the 3-argument drawImage: it would draw twice too big)
  const fxAt = (c, x, y) => bx.drawImage(c, x, y, artW(c), artH(c));

  // ---------------- Tuning (garden feel only; growth numbers come from D.GROWTH) ----------------
  const TUNE = {
    holdDelay: 0.28, rubStep: 10, walkSpeed: 10, walkPerRunLv: 0.2, gravity: 420, flutterFall: 20, flutterAt: 8, holdLift: 16,
    drainDay: 0.2, drainNight: 0.38, sleepAt: 15, regenDay: 9, regenNight: 6, happyDecay: 0.012,
    maxCritters: 2, maxDrops: 3, dropLife: 40, flutterXpMax: 3, flutterCooldown: 8, xpFlushSec: 3,
    // camera: the world is sized so it all fits at zoomMin; you start at zoomDef x zoomMin and can pinch between.
    // (1.5 css px per world px zoomed out; the default 2x = 3 css px per world px, the same close-up size as before.)
    // (zoomMin fits worldW across or worldH down, whichever is smaller, so a landscape iPad isn't zoomed right in)
    worldW: 280, worldH: 250, zoomMinPx: 1.5, zoomDef: 2, zoomMax: 4, edgePan: 90, smellRange: 85, maxGroundFruit: 12,
  };
  const PART_NAMES = { wings: 'wings', ears: 'long ears', fins: 'fins', horns: 'horns', tail: 'a tail', shell: 'a shell', antennae: 'antennae',
    claws: 'claws', spikes: 'spikes', fluff: 'fluff', tentacles: 'tentacles', spots: 'star spots', batwings: 'bat wings', fairywings: 'fairy wings',
    unihorn: 'a unicorn horn', multitail: 'extra tails', flamewings: 'flame wings', dragonwings: 'dragon wings',
    petals: 'a petal collar', mushcap: 'a mushroom cap', leafears: 'leaf ears', vines: 'vines', thorns: 'thorns' };
  // living plants: rooted ones sway in place and now and then pop up and move; the others waddle about in little scoots
  const ROOTED = { sunbuddy: 1, cloverkin: 1, snapvine: 1, lollibloom: 1, cactling: 1, peapod: 1 };
  const PLANT_GLOW = { glowcap: '160,250,255', moonlotus: '230,205,255' };
  const PLANT_COL = { sunbuddy: '#fbd84a', shroomy: '#e8404a', puffball: '#ffffff', cloverkin: '#99e550', cactling: '#f07aa0', kelpie: '#9cd06a', coconut: '#c48a5c',
    glowcap: '#9ff8f0', snapvine: '#e8506a', moonlotus: '#e4c8f8', lollibloom: '#f07aa0', marshroom: '#ffe6f0', licovine: '#e0303e', sugarlily: '#ffd8ec' };
  const isPlant = id => !!(D.ANIMALS[id] && D.ANIMALS[id].kind === 'plant');
  const FRAME_SEQ = [0, 1, 0, 1, 0, 2];
  const plantFrame = c => (PX.critterFrames && PX.critterFrames(c.id) > 1 ? FRAME_SEQ[Math.floor(t * 3 + c.ph * 3) % FRAME_SEQ.length] : 0);

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
        ['flowerbed', 0.1, 0.96], ['bench', 0.28, 0.62], ['mushrooms', 0.5, 0.8], ['bush', 0.48, 0.99], ['rock', 0.05, 0.39]],
      home: ['shroomhouse', 0.42, 0.72],
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
        ['towel', 0.44, 0.46], ['rock', 0.47, 0.36], ['shells', 0.46, 0.76]],
      home: ['beachhut', 0.14, 0.52],
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
      props: [['crystal', 0.44, 0.0], ['glowshroom', 0.16, 0.56], ['lantern', 0.44, 0.9], ['glowshroom', 0.48, 0.5], ['crystal', 0.08, 0.95], ['lantern', 0.3, 0.3],
        ['mushrooms', 0.16, 0.9], ['moonstone', 0.12, 0.4], ['fern', 0.3, 0.72], ['fern', 0.04, 0.2], ['moonstone', 0.49, 0.96]],
      home: ['crystalcave', 0.3, 0.9],
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
      home: ['gingerhouse', 0.5, 0.83],
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
  // (more fireflies for the night sky; added last so everything above keeps its old seeded place)
  for (let i = 0; i < 6; i++) DECO.flies.push({ p: srand() * 10, a: srand(), b: srand() });

  // ---------------- sprites (guarded: art is still being drawn, so nothing may crash) ----------------
  const sprCache = new Map();
  // every grid built here finishes with PX.hd (one level of detail with the Sprouts: smooth fine edges, thin inner lines, one ink ring)
  const hd = (g, o) => { try { if (PX.hd) PX.hd(g, o); else if (o && o.outline) g.outline(); } catch (e) { /* art optional */ } return g; };
  function blob(w, h, col) { const g = new PX.Grid(w, h); g.ell(w / 2, h / 2, w / 2 - 1, h / 2 - 1, col || PX.RAMPS.slate); return hd(g, { outline: true }).canvas(); }
  function spr(key, make, fb) {
    let c = sprCache.get(key); if (c) return c;
    try { c = make(); } catch (e) { c = null; }
    if (!c || !c.width) { try { c = fb(); } catch (e) { c = blob(10, 10); } }
    sprCache.set(key, c); return c;
  }
  const themeOf = a => (D.AREAS[a] && D.AREAS[a].theme) || 'day';
  const critterSpr = (id, f) => spr('c:' + id + ':' + (f || 0), () => PX.critter(id, f || 0), () => blob(16, 12, PX.RAMPS.peach));
  const swimSpr = (id, f) => spr('cs:' + id + ':' + (f || 0), () => (PX.critterSwim ? PX.critterSwim(id, f || 0) : null), () => critterSpr(id, f));
  const itemSpr = (kind, id) => spr('i:' + kind + ':' + id, () => PX.item(kind, id), () => (kind === 'fruit' ? PX.fruit('round') : blob(11, 11, PX.RAMPS.sun)));
  const propSpr = (kind, theme) => spr('p:' + kind + ':' + theme, () => (kind === 'gumball' ? PX.gumballMachine(0) : PX.prop(kind, theme)), () => blob(14, 12));
  function propAt(p) { for (const q of Lw.props) if (q.kind === 'gumball' && Math.abs(p.x - q.x) < artW(q.c) / 2 + 2 && p.y <= q.y + 2 && p.y >= q.y - artH(q.c)) return q.kind; return null; }
  // hit radius in world px that stays at least ~22 screen px across, however far out the view is zoomed
  const hitR = r => Math.max(r, 11 / Z);
  // the scenery (a prop or a fruit tree) under a point: the front-most one whose picture covers it (small ones get a finger-sized box)
  function propHit(p) {
    let best = null, by = -1e9;
    const m = 11 / Z;
    for (let n = 0; n < 2; n++) for (const q of n ? Lw.trees || [] : Lw.props) {
      if (!q || !q.c || q.kind === 'gumball') continue;
      const w = artW(q.c), h = artH(q.c);
      if (Math.abs(p.x - q.x) < Math.max(w / 2 + 1, m) && p.y >= q.y - Math.max(h, 2 * m) && p.y <= q.y + 3 && q.y > by) { by = q.y; best = q; }
    }
    return best;
  }
  const dropSpr = d => (d.type === 'xp' ? itemSpr('xp', d.stat) : itemSpr(d.big ? 'bigcoin' : 'coin', ''));
  let cocoonC = null, arrowC = null, sunC = null, moonC = null, bigMoonC = null;
  function cocoonSprite() {
    if (cocoonC) return cocoonC;
    const g = new PX.Grid(26, 28); g.ell(13, 15, 10.5, 12.5, ['#ffffff', '#fbf3dc', '#eec39a']);
    // silk threads wound round it (fine strokes) and a soft shine up-left
    for (const [y0, k] of [[9, 0.3], [14.5, -0.25], [20, 0.2]]) for (let x = 4; x <= 22; x += 0.5) { const y = y0 + (x - 13) * k + Math.sin(x * 0.7) * 0.4; if (g.filled(x, y)) g.dot(x, y, '#e3cf9d'); }
    g.ell(8.6, 8.8, 1.6, 2.4, '#ffffff', -0.5); g.dots([[11, 6.5], [11.5, 6.5]], '#ffffff');
    return (cocoonC = hd(g, { outline: true }).canvas());
  }
  function arrowSprite() {
    if (arrowC) return arrowC;
    const g = new PX.Grid(9, 7); g.poly([[1, 1], [8, 1], [4.5, 6]], '#ffcc44'); g.poly([[5.2, 1], [8, 1], [4.5, 6]], '#e0a830');
    g.dots([[2.5, 1.5], [3, 1.5], [3.5, 1.5], [4, 1.5], [3.25, 2], [3.75, 2.5]], '#fff27a');
    return (arrowC = hd(g, { outline: true }).canvas());
  }
  function sunSprite() {
    if (sunC) return sunC;
    const g = new PX.Grid(17, 17); g.ell(8.5, 8.5, 7.5, 7.5, '#fbf3dc'); g.ell(8.5, 8.5, 6.5, 6.5, '#fdf6c0'); g.ell(8.5, 8.5, 5.5, 5.5, '#fff27a'); g.ell(7.2, 7.2, 2.4, 2, '#fffbd0');
    return (sunC = hd(g, { outer: false }).canvas());
  }
  function moonSprite(big) {
    if (big ? bigMoonC : moonC) return big ? bigMoonC : moonC;
    const n = big ? 23 : 15, c = n / 2, g = new PX.Grid(n, n);
    g.ell(c, c, c - 1, c - 1, ['#fffbe6', '#f4ecc8', '#d9cfa0']);
    // soft round craters (a fine lit rim on the lower right of each)
    const k = n / 15; for (const [x, y, r] of [[6, 5.6, 1.15], [9.6, 8.6, 0.85], [6.6, 10.6, 0.7], [10.6, 4.6, 0.55]]) { g.ell(x * k, y * k, r * k, r * k * 0.85, '#e4dab0'); g.ell(x * k - 0.25, y * k - 0.25, r * k * 0.7, r * k * 0.6, '#d9cfa0'); }
    const cv = hd(g, { outer: false }).canvas(); if (big) bigMoonC = cv; else moonC = cv; return cv;
  }
  // the guide's pointing hand: a white glove with a sunny cuff, index finger pointing down; fingertip at (4.5, 11.5) of 11x12
  let handC = null;
  function handSprite() {
    if (handC) return handC;
    return (handC = hd(PX.fromStrings([
      '.kkkkkkk...', '.kyyyyyk...', '.kooooook..', 'kwwwwwwwWk.', 'kwkwkwwwWWk', 'kwwwwwwwWWk',
      '.kwwwwwwWk.', '..kkwwWkk..', '...kwwWk...', '...kwwWk...', '...kwwWk...', '....kkk....'], { y: '#ffcc44', o: '#d99a1a' }), {}).canvas());
  }
  // sparkle colours for special skins (pixel.js knows every skin; the fallbacks cover older art files)
  const FX_FALLBACK = { gold: ['#fff27a', '#ffffff'], rainbow: ['#f07a84', '#f6a83a', '#fbf236', '#99e550', '#5fcde4', '#c9a2f0'], crystal: ['#ffffff', '#c8ecfa', '#d8ccf8'], ember: ['#f6a83a', '#fff27a'], shiny: ['#ffffff', '#fff6c8'] };
  const fxColors = k => (PX.SKIN_FX && PX.SKIN_FX[k]) || FX_FALLBACK[k] || (SPOOKY[k] && SPOOKY[k].c) || ['#ffffff', '#fff27a'];

  // ---------------- module state ----------------
  let root, cv, ctx, buf, bx, skyC, skx, bgC, bgx, pillName, pillSub, dotsEl, trayEl, pouchStrip, fruitStrip, pouchCnt, hintEl, cardEl, ghostEl, gctx, labelsEl, handEl, guideNow = null;
  const card = {};
  let W = 0, H = 0, DPR = 1, ww = 0, wh = 0, t = 0, visible = false, mounted = false, area = 'meadow';
  // camera (Z = CSS px per world px; cam = world px at the top-left of the screen)
  let Z = 3, ZMIN = 2, ZMAX = 6, camX = 0, camY = 0, zoomAnim = null, pinch = null, camV = { x: 0, y: 0 }, lastTapBg = null, zoomSnapT = 0;
  let zoomBack = null, zoomBtn = null, cryAt = -9, lampT = -9, signT = -9, nextShoot = 0, hatchWait = 0;
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
  // Sprouts can rest inside the area's house (s.home = true); they don't walk around the garden while inside
  const entering = new Set();        // walking to the door right now (still drawn until they pop in)
  const isOut = s => s.area === area && (!s.home || entering.has(s.id));
  let hintUntil = 0, hintReset = true;

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
    // (the same shore as a smooth line, per world row, for drawing the foam and surf)
    Lw.sb = new Float32Array(wh + 3); for (let y = 0; y < wh + 3; y++) Lw.sb[y] = shoreB(y + 0.5);
    Lw.dockY = Math.round(Lw.minY + Lw.span * 0.3);
    Lw.dockX0 = shoreAt(Lw.dockY) - 4; Lw.dockX1 = shoreAt(Lw.dockY) + Math.round((ww - shoreAt(Lw.dockY)) * 0.4);
    Lw.tree = { x: Math.round(ww * 0.2), y: Math.round(Lw.minY + Lw.span * 0.14) };
    hintEl.style.bottom = (trayH + 18) + 'px';
    buildProps();
    bgKey = ''; skyKey = '';
  }
  function buildProps() {
    const th = TH[area], theme = themeOf(area);
    Lw.home = null; Lw.sign = null;
    if (th.home) {
      const [kind, fx, fy] = th.home, c = propSpr(kind, theme), y = Math.round(Lw.minY + Lw.span * fy), info = (PX.HOMES && PX.HOMES[kind]) || { door: [0, 0], win: [], w: artW(c) - 8, h: artH(c) - 2 };
      const x = Math.max(Math.round(artW(c) / 2) + 1, Math.round(Math.min(ww * fx, shoreAt(y) - artW(c) / 2 - 3)));
      Lw.home = { kind, x, y, c, info, w: info.w, h: info.h, door: { x: x + info.door[0], y: y + info.door[1] } };
    }
    const H = Lw.home;
    Lw.props = th.props.map(([kind, fx, fy], i) => {
      const c = propSpr(kind, theme), y = Math.round(Lw.minY + Lw.span * fy);
      const x = Math.round(Math.min(ww * fx, shoreAt(y) - artW(c) / 2 - 3));
      return { kind, x: Math.max(Math.round(artW(c) / 2) + 1, x), y, c, i };
    }).filter(p => !H || Math.abs(p.x - H.x) > (artW(p.c) + H.w) / 2 - 2 || p.y < H.y - H.h + 4 || p.y - artH(p.c) > H.y - 2);
    // fruit trees: the area's main tree first (its 3 fruit slots are the ones old saves already have), then the others
    Lw.trees = [{ kind: th.tree, x: Lw.tree.x, y: Lw.tree.y }].concat((th.fruitTrees || []).map(([kind, fx, fy]) => {
      const c = propSpr(kind, theme), y = Math.round(Lw.minY + Lw.span * fy);
      return { kind, y, x: Math.max(Math.round(artW(c) / 2) + 1, Math.round(Math.min(ww * fx, shoreAt(y) - artW(c) / 2 - 3))) };
    }));
    Lw.slots = [];
    Lw.trees.forEach((T, ti) => {
      T.c = propSpr(T.kind, theme);
      for (const [fx, fy] of TREE_SLOTS[T.kind] || TREE_SLOTS.default) Lw.slots.push({ x: Math.round(T.x + fx * artW(T.c)), y: Math.round(T.y + fy * artH(T.c)), tree: ti });
    });
  }
  function lawnPoint() {
    for (let i = 0; i < 40; i++) {
      const y = rand(Lw.minY + 2, Lw.maxY), x = rand(8, shoreAt(y) - 8);
      if ((Lw.trees || []).some(T => Math.abs(x - T.x) < 8 && Math.abs(y - T.y) < 6)) continue;
      if (Lw.home && Math.abs(x - Lw.home.x) < Lw.home.w / 2 + 3 && y > Lw.home.y - 12 && y < Lw.home.y + 6) continue;
      if (Lw.props.some(p => Math.abs(x - p.x) < artW(p.c) / 2 && Math.abs(y - p.y) < 4)) continue;
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
  // hashing and value noise for the cached ground (only used when a background layer is repainted)
  const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.62 + vnoise(x * 2.1 + 5.3, y * 2.1 + 1.7, s + 1) * 0.38;
  const sandW = y => Math.round(lerp(3, 9, clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1)));

  // ---------------- background (cached per area / size / night level) ----------------
  // the sky, at SK x the world (soft bands instead of checker dither; stars are fine pixels). Only the part above the land is drawn.
  function paintSky(n) {
    const th = TH[area], hz = Lw.hz, sh = hz + 14, x = skx;
    if (skyC.width !== ww * SK || skyC.height !== sh * SK) { skyC.width = ww * SK; skyC.height = sh * SK; }
    x.setTransform(SK, 0, 0, SK, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, ww, sh);
    const base = th.sky.map((c, i) => mixH(c, th.skyN[i], n));
    // 7 smooth bands from the 4 theme colours; where two meet, two fine rows step softly from one to the next
    const bands = []; for (let i = 0; i < 7; i++) { const k = i / 6 * 3, a = Math.floor(k); bands.push(mixH(base[a], base[Math.min(3, a + 1)], k - a)); }
    const bh = (hz + 12) / bands.length;
    bands.forEach((c, i) => {
      const y0 = Math.round(i * bh);
      x.fillStyle = c; x.fillRect(0, y0, ww, sh - y0);
      if (i) { x.fillStyle = mixH(bands[i - 1], c, 0.5); x.fillRect(0, y0, ww, FP); x.fillStyle = mixH(bands[i - 1], c, 0.75); x.fillRect(0, y0 + FP, ww, FP); }
    });
    // soft haze just above the horizon: a fine-row ramp of see-through haze (8 steps)
    x.fillStyle = mixH(base[3], n > 0.5 ? th.skyN[3] : '#ffffff', 0.35);
    for (let y = hz - 12; y < hz + 12; y += FP) { const d = Math.round(clamp((y - (hz - 12)) / 14, 0, 1) * 0.6 * 8) / 8; if (d <= 0) continue; x.globalAlpha = d; x.fillRect(0, y, ww, FP); }
    x.globalAlpha = 1;
    // stars (the twinkly ones are drawn live, above the night tint)
    const sa = th.bigMoon ? Math.max(0.5, n) : n;
    if (sa > 0.04) {
      x.globalAlpha = sa;
      // a faint band of far-off stars across the sky, one fine pixel each
      x.fillStyle = mixH(base[1], '#cbdbfc', 0.35);
      const fw = ww * SK, fh = (hz - 10) * SK;
      for (let j = 0; j < fw; j++) for (let y = 0; y < fh; y++) { const d = Math.abs(y / SK - (hz * 0.15 + j / SK * 0.22)); if (d < 9 && hash2(j, y, 78) < 0.09 * (1 - d / 9)) x.fillRect(j * FP, y * FP, FP, FP); }
      for (const s of DECO.stars) {
        if (s.tw) continue;
        const X = Math.round(s.x * ww * SK) * FP, Y = Math.round(s.y * (hz - 8) * SK) * FP;
        if (s.y > 0.5) { x.fillStyle = '#cbdbfc'; x.fillRect(X, Y, FP, FP); continue; }
        // a brighter star: a fine dot with a soft fine cross round it
        x.fillStyle = '#ffffff'; x.fillRect(X, Y, FP, FP);
        x.globalAlpha = sa * 0.45; x.fillRect(X - FP, Y, FP, FP); x.fillRect(X + FP, Y, FP, FP); x.fillRect(X, Y - FP, FP, FP); x.fillRect(X, Y + FP, FP, FP); x.globalAlpha = sa;
      }
      x.globalAlpha = 1;
    }
  }
  // the shore as a smooth line for drawing (the game's shoreAt() is the same line rounded to whole world px per row): the water
  // starts at shoreB(y) for a point at height y
  const shoreB = y => { const k = clamp((y - 0.5 - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1.3); return ww * (0.55 + 0.09 * k) + Math.sin(k * 5.5 + 0.6) * 2.2 + 1; };
  const sandWC = y => lerp(3, 9, clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1));
  // u32 colour mix (paintLand works on raw pixels)
  const mixU = (A, B, k) => {
    const r = A & 255, g = (A >>> 8) & 255, b = (A >>> 16) & 255;
    return ((255 << 24) | (Math.round(b + (((B >>> 16) & 255) - b) * k) << 16) | (Math.round(g + (((B >>> 8) & 255) - g) * k) << 8) | Math.round(r + ((B & 255) - r) * k)) >>> 0;
  };
  // little scenery sprites for the ground (soft-shaded balls: shrubs, tree crowns), cached by size and colours
  const bgSpr = new Map();
  function ballSpr(r, lit, mid, dark) {
    const key = r + lit + mid + dark; let c = bgSpr.get(key); if (c) return c;
    const n = Math.ceil(r * 2 + 2), g = new PX.Grid(n, n);
    g.ell(n / 2, n / 2, r + 0.25, r, [lit, mid, dark]); PX.hd(g, { outer: false });
    c = g.canvas(); if (bgSpr.size > 120) bgSpr.clear(); bgSpr.set(key, c); return c;
  }
  const landBuf = { V: null, N: null, tp: null, xq: null, xa: null };
  const f32 = (k, n) => (landBuf[k] && landBuf[k].length >= n ? landBuf[k] : (landBuf[k] = new Float32Array(n)));
  const i32 = (k, n) => (landBuf[k] && landBuf[k].length >= n ? landBuf[k] : (landBuf[k] = new Int32Array(n)));
  function paintLand() {
    const th = TH[area], X = bgx, hz = Lw.hz, wt = Lw.waterTop, FW = ww * SK, FH = wh * SK;
    X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; X.clearRect(0, 0, FW, FH);
    // (the small noise buffers are kept between paints; the big pixel buffer is let go once it is on the canvas)
    const img = X.createImageData(FW, FH), P = new Uint32Array(img.data.buffer);
    const lawnTop = hz + 9, seaX = th.openSea ? shoreAt(wt) - 3 : ww, AS = AREA_IDS.indexOf(area) * 101 + 3;
    const lawnTopC = i => lawnTop - Math.sin(i * 0.09 + 2) * 1.2;
    const fc = fi => (fi + 0.5) / SK; // fine pixel centre -> world px
    // ---- distant mountains: lit left faces, shaded right faces, snow / icing on the tops (soft steps, no dither) ----
    const fTop = [], nTop = [];
    if (th.mount) {
      const M = th.mount.map(u32), amp = th.mountAmp, base = hz - 2, sh = th.mountShape;
      const M01 = mixU(M[0], M[1], 0.5), M12 = mixU(M[1], M[2], 0.5), hazeU = u32(mixH(th.mount[1], th.sky[3], 0.45)), snowU = u32(th.snow), snowShU = u32(mixH(th.snow, th.mount[2], 0.3));
      const tri = v => 1 - 2 * Math.abs(v - Math.floor(v) - 0.5);
      const h = i => sh === 'spire' ? 0.62 * Math.pow(tri(i / 44 + 0.3), 1.7) + 0.38 * Math.pow(tri(i / 17 + 0.1), 2.2)
        : sh === 'drop' ? 0.7 * Math.pow(Math.abs(Math.sin(i * 0.052 + 0.4)), 0.6) + 0.3 * Math.abs(Math.sin(i * 0.12 + 1.3))
          : 0.66 * Math.pow(tri(i / 74 + 0.15), 1.3) + 0.34 * Math.pow(tri(i / 31 + 0.55), 1.5);
      const top = i => base - amp * h(i);
      for (let fi = 0; fi < Math.min(ww, seaX) * SK; fi++) {
        const i = fc(fi), ii = Math.floor(i), tp = top(i), sl = top(i + 1) - top(i - 1);
        const snowTo = base - amp * 0.6 + hash2(ii >> 2, 1, AS) * 2 + (sh === 'drop' && ii % 6 < 2 ? 2 : 0);
        const face = sl < -0.15 ? 0 : sl <= 0.15 ? 1 : sl <= 0.26 ? 2 : 3;
        for (let fy = Math.max(0, Math.round(tp * SK)); fy < (lawnTop + 2) * SK; fy++) {
          const y = fc(fy);
          let c = face === 0 ? (y - tp > 3 ? M01 : M[0]) : face === 1 ? M01 : face === 2 ? M12 : M[2];
          if (y < snowTo && y - tp < 6) c = face >= 2 ? snowShU : snowU;
          if (y > base - 6) c = mixU(c, hazeU, Math.min(1, Math.round((y - (base - 6)) / 8 * 6) / 6));
          P[fy * FW + fi] = c;
        }
      }
    }
    // ---- rolling hills: a 1-fine-px darker rim, a lit band under it, optional candy stripes ----
    const hillLayer = (arr, b, amp, f, ph, fill, edge, maxX, stripe) => {
      const lit = mixH(fill, '#ffffff', 0.14), fillU = u32(fill), litU = u32(lit), midU = mixU(litU, fillU, 0.5), edgeU = u32(edge), stU = stripe ? u32(stripe) : 0;
      const topC = i => b - Math.sin(i * f + ph) * amp - Math.sin(i * f * 2.3 + ph * 2) * amp * 0.4;
      for (let i = 0; i < ww; i++) arr[i] = Math.round(topC(i)); // (whole world px: scenery stands on these)
      for (let fi = 0; fi < Math.min(ww, maxX) * SK; fi++) {
        const tp = Math.round(topC(fc(fi) - 0.5) * SK); if (tp >= 0 && tp < FH) P[tp * FW + fi] = edgeU;
        for (let fy = Math.max(0, tp + 1); fy < (lawnTop + 2) * SK; fy++) {
          const d = fy - tp;
          P[fy * FW + fi] = d <= 2 ? litU : d === 3 ? midU : stU && fy < (hz + 8) * SK && ((fi + fy) >> 2) % 3 === 0 ? stU : fillU;
        }
      }
    };
    hillLayer(fTop, hz - 2, 6, 0.045, 1, th.far[0], th.far[1], th.openSea ? seaX - 6 : ww, th.farStripe);
    hillLayer(nTop, hz + 4, 3.5, 0.07, 3, th.near[0], th.near[1], th.openSea ? seaX : ww);
    // ---- the lawn: soft patches of 4 tones (and their 50/50 mixes where two meet), lighter toward the back ----
    // the patch noise is worked out per world px and blended across each one, so patch edges are smooth fine-pixel curves
    const G = th.grass.map(u32), T7 = [G[3], mixU(G[3], G[2], 0.5), G[2], mixU(G[2], G[1], 0.5), G[1], mixU(G[1], G[0], 0.5), G[0]];
    const edgeU = u32(th.lawn[1]), lipU = mixU(G[0], T7[4], 0.5), y0v = Math.max(0, lawnTop - 3), VW = ww + 1, VH = wh - y0v + 1, V = f32('V', VW * VH);
    for (let y = 0; y < VH; y++) for (let i = 0; i < VW; i++) { const yy = y + y0v, g = (yy - lawnTop) / Math.max(1, wh - lawnTop); V[y * VW + i] = (fbm(i * 0.05, yy * 0.085, AS) - 0.5) * 1.8 + 0.5 + (1 - g) * 0.2 - 0.08; }
    // per fine column: the lawn's top row and where it sits between two noise samples (rows are then filled left to right)
    const TP = i32('tp', FW), XQ = i32('xq', FW), XA = f32('xa', FW); let tpMin = FH;
    for (let fi = 0; fi < FW; fi++) { const i = fc(fi), gx = clamp(i - 0.5, 0, ww - 1); TP[fi] = Math.round(lawnTopC(i - 0.5) * SK); XQ[fi] = Math.floor(gx); XA[fi] = gx - XQ[fi]; if (TP[fi] < tpMin) tpMin = TP[fi]; }
    for (let fy = tpMin; fy < FH; fy++) {
      const gy = clamp(fc(fy) - 0.5 - y0v, 0, VH - 2), yq = Math.floor(gy), ay = gy - yq, by = 1 - ay, row = fy * FW, r0 = yq * VW;
      for (let fi = 0; fi < FW; fi++) {
        const d = fy - TP[fi]; if (d < 0) continue;
        if (d < 3) { P[row + fi] = d === 0 ? edgeU : d === 1 ? G[0] : lipU; continue; }
        const j = r0 + XQ[fi], ax = XA[fi], v = (V[j] + (V[j + 1] - V[j]) * ax) * by + (V[j + VW] + (V[j + VW + 1] - V[j + VW]) * ax) * ay;
        const s = (v < 0 ? 0 : v > 0.9999 ? 0.9999 : v) * 4, b = s | 0, f = s - b;
        P[row + fi] = T7[2 * b + (f < 0.13 && b > 0 ? -1 : f > 0.87 && b < 3 ? 1 : 0)];
      }
    }
    // ---- sandy shore (dry -> damp -> wet, soft steps) and water in depth bands ----
    const W0 = th.water, WU = W0.map(u32), WM = [mixU(WU[0], WU[1], 0.5), mixU(WU[1], WU[2], 0.5), mixU(WU[2], WU[3], 0.5)];
    const shalU = u32(mixH(W0[0], th.wet, 0.42)), shal2 = mixU(shalU, WU[0], 0.5), sandU = u32(th.sand), wetU = u32(th.wet), dampU = u32(mixH(th.sand, th.wet, 0.5)), sEdgeU = u32(th.sandEdge);
    const sdU = mixU(sandU, dampU, 0.5), dwU = mixU(dampU, wetU, 0.5);
    const reflU = u32(mixH(th.openSea ? th.sky[3] : th.near[1], W0[2], th.openSea ? 0.3 : 0.5)), hlU = u32(th.hl);
    // the depth wobble, per world px (blended across each one like the lawn)
    const NH = wh - wt + 2, NW = f32('N', VW * NH);
    for (let y = 0; y < NH; y++) for (let i = 0; i < VW; i++) NW[y * VW + i] = (vnoise(i * 0.13, (y + wt) * 0.3, AS + 5) - 0.5) * 0.05;
    for (let fy = wt * SK; fy < FH; fy++) {
      const y = fc(fy), B = shoreB(y), sw = sandWC(y), x0 = B - sw - 1, row = fy * FW;
      // sand: from the lawn's edge (a soft 1-fine-px darker rim) to the water
      const e = Math.floor(x0 * SK) - 1; if (e >= 0 && e < FW) P[row + e] = mixU(P[row + e], sEdgeU, 0.55);
      for (let fi = Math.max(0, e + 1); fi < Math.min(FW, Math.round(B * SK)); fi++) {
        const u = (fc(fi) - x0) / (sw + 1);
        P[row + fi] = u < 0.45 ? sandU : u < 0.6 ? sdU : u < 0.8 ? dampU : u < 0.9 ? dwU : wetU;
      }
      const fk = y - wt, fkF = fy - wt * SK, ny = clamp(y - 0.5 - wt, 0, NH - 2), nq = Math.floor(ny), na = ny - nq, nb = 1 - na, r0 = nq * VW, inv = 1 / Math.max(1, ww - B);
      for (let fi = Math.max(0, Math.round(B * SK)); fi < FW; fi++) {
        const j = r0 + XQ[fi], xa = XA[fi];
        const d = (fc(fi) - B) * inv + (NW[j] + (NW[j + 1] - NW[j]) * xa) * nb + (NW[j + VW] + (NW[j + VW + 1] - NW[j + VW]) * xa) * na;
        const tn = (d > 0.14 ? 1 : 0) + (d > 0.45 ? 1 : 0) + (d > 0.78 ? 1 : 0);
        let c = WU[tn];
        if (d > 0.118 && d < 0.162) c = WM[0]; else if (d > 0.428 && d < 0.472) c = WM[1]; else if (d > 0.758 && d < 0.802) c = WM[2];
        if (d < 0.035) c = d > 0.02 ? shal2 : shalU;
        if (fkF === 0) c = hlU;
        else if (fkF === 1) c = mixU(hlU, WU[Math.max(tn, 2)], 0.5);
        else if (fk < 7) {
          const dk = WU[Math.max(tn, 2)];
          c = fk < 3 ? dk : fk < 5 ? mixU(c, dk, 0.5) : mixU(c, dk, 0.25);
          // the far shore reflected near the horizon: fine streaks
          if (fkF >= 2 && fkF <= 9 && !(fkF & 1) && (fkF === 2 ? fi % 3 < 2 : (fi + fkF * 3) % 7 < 3)) c = reflU;
        }
        P[row + fi] = c;
      }
    }
    X.putImageData(img, 0, 0);

    // ---- details on top, in fine pixels (world coordinates, SK buffer px each) ----
    X.setTransform(SK, 0, 0, SK, 0, 0);
    let rs = AS * 7919 + 1; const rr = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    const sn = v => Math.round(v * SK) * FP; // snap to the fine grid
    const R = (x0, y0, w, h, c) => { X.fillStyle = c; X.fillRect(sn(x0), sn(y0), w, h); };
    const dot = (x0, y0, c) => R(x0, y0, FP, FP, c);
    // a fine line (wd fine px thick)
    const ln = (x0, y0, x1, y1, c, wd) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * SK)), s = (wd || 1) * FP; X.fillStyle = c;
      for (let k = 0; k <= n; k++) { const u = k / n; X.fillRect(sn(x0 + (x1 - x0) * u), sn(y0 + (y1 - y0) * u), s, s); }
    };
    // a filled ellipse in fine rows
    const el = (cx, cy, rx, ry, c, ymax) => {
      X.fillStyle = c;
      for (let fy = Math.floor((cy - ry) * SK); fy <= Math.ceil((cy + ry) * SK); fy++) {
        const dy = (fy + 0.5) * FP - cy; if (Math.abs(dy) >= ry || (ymax != null && (fy + 0.5) * FP > ymax)) continue;
        const hw = rx * Math.sqrt(1 - (dy / ry) * (dy / ry)), a = Math.round((cx - hw) * SK), b = Math.round((cx + hw) * SK);
        if (b > a) X.fillRect(a * FP, fy * FP, (b - a) * FP, FP);
      }
    };
    // a small picture in fine pixels: one character per fine pixel ('.' = clear), top-left at (x0, y0)
    const stamp = (x0, y0, rows, map) => { const X0 = sn(x0), Y0 = sn(y0); rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c) { X.fillStyle = c; X.fillRect(X0 + i * FP, Y0 + j * FP, FP, FP); } } }); };
    const ball = (cx, cy, r, dark, mid, lit) => { const c = ballSpr(r, lit, mid, dark), w = artW(c), h = artH(c); X.drawImage(c, sn(cx - w / 2 + 0.5), sn(cy - h / 2 + 0.5), w, h); };
    // scenery on the ridges
    if (area === 'meadow') {
      for (let i = 4; i < ww; i += 5 + Math.floor(hash2(i, 2, AS) * 9)) if (hash2(i, 3, AS) > 0.3) { const r = hash2(i, 4, AS) > 0.6 ? 3 : 2; ball(i, fTop[i] + 1, r, th.farDots[2], th.farDots[0], th.farDots[1]); if (r === 3 && hash2(i, 5, AS) > 0.5) ball(i + 4, fTop[Math.min(ww - 1, i + 4)] + 2, 2, th.farDots[2], th.farDots[0], th.farDots[1]); }
      for (let i = 8; i < ww; i += 12 + Math.floor(hash2(i, 6, AS) * 18)) { if (Math.abs(i - ww * 0.42) < 16) continue; ball(i, nTop[i] + 1, 2, th.nearDots[0], th.nearDots[1], th.nearDots[1]); ln(i + 3, nTop[Math.min(ww - 1, i + 3)] + 1.5, i + 3.5, nTop[Math.min(ww - 1, i + 3)] - 0.5, th.nearDots[0]); }
    } else if (area === 'beach') {
      for (let i = 6; i < seaX - 8; i += 16 + Math.floor(hash2(i, 2, AS) * 14)) { // little palms on the headland
        const b = fTop[i] + 1, lean = hash2(i, 3, AS) > 0.5 ? 1 : -1, c = th.farDots[2], tx = i + lean + 0.5, ty = b - 6;
        ln(i + 0.5, b + 0.5, i + 0.5, b - 3, '#8a7a50', 2); ln(i + 0.5, b - 3, tx, ty, '#8a7a50', 2); dot(i + 0.5, b - 1.5, '#6a5a38'); dot(i + 0.5, b - 3.5, '#6a5a38');
        for (const [dx, dy] of [[-3.5, 1.5], [3.5, 1.5], [-2.5, -0.5], [2.5, -0.5], [-4.5, 2.5], [4.5, 2.5]]) ln(tx, ty, tx + dx, ty + dy, c);
        ln(tx - 3, ty + 0.5, tx + 3, ty + 0.5, c); el(tx, ty, 1.6, 0.9, th.farDots[1]); dot(tx - 0.5, ty - 0.5, mixH(th.farDots[1], '#ffffff', 0.4));
      }
      for (let i = 3; i < seaX; i += 5 + Math.floor(hash2(i, 7, AS) * 6)) { ln(i + 0.25, nTop[i] + 1, i, nTop[i] - 1, th.nearDots[0]); if (hash2(i, 8, AS) > 0.5) ln(i + 1.25, nTop[i] + 0.5, i + 1.5, nTop[i] - 2, th.nearDots[0]); dot(i - 0.5, nTop[i] + 0.5, th.nearDots[1]); }
    } else if (area === 'moonlit') {
      for (let i = 5; i < ww; i += 4 + Math.floor(hash2(i, 2, AS) * 7)) { // pines
        if (hash2(i, 3, AS) < 0.25) continue;
        const b = fTop[i] + 2, hgt = 5 + Math.floor(hash2(i, 4, AS) * 5), c = th.farDots[0], lit = th.farDots[1];
        for (let fk = 0; fk < hgt * SK; fk++) { const w = (hgt - fk / SK) / 2.2, y = b - fk / SK; R(i - w, y, Math.max(FP, sn(2 * w + 1)), FP, c); if (fk % (3 * SK) === 2 * SK) R(i - w, y, Math.max(FP, sn(w + 0.5)), FP, lit); }
        dot(i + 0.25, b - hgt - FP, lit);
      }
      for (let i = 10; i < ww; i += 28 + Math.floor(hash2(i, 9, AS) * 30)) { // crystal spires on the far peaks, faintly glowing
        const y0 = Math.round(hz - 6 - hash2(i, 10, AS) * 6), h = 6 + Math.floor(hash2(i, 11, AS) * 5);
        R(i - 1, y0 - h + 2, 3, h - 2, '#8a9ae0'); R(i - 0.5, y0 - h + 1, 2, 1, '#8a9ae0'); R(i, y0 - h, 1, h, '#c9d4ff'); R(i + 1, y0 - h + 3, 1, h - 3, '#5a64b0');
        R(i, y0 - h, FP, h, '#e8eeff'); dot(i + 0.25, y0 - h - FP, '#ffffff');
      }
      for (let i = 6; i < ww; i += 14 + Math.floor(hash2(i, 12, AS) * 16)) ball(i, nTop[i] + 1, 2, th.nearDots[0], th.nearDots[1], th.nearDots[1]);
    } else if (area === 'candy') {
      for (let i = 5; i < ww; i += 9 + Math.floor(hash2(i, 2, AS) * 12)) { // gumdrops on the far hills
        const c = th.farDots[Math.floor(hash2(i, 3, AS) * 3)], b = fTop[i];
        el(i + 0.5, b + 1, 2.5, 3, c, b + 1); el(i - 0.3, b - 0.9, 0.8, 0.45, '#ffffff');
      }
      for (let i = 12; i < ww; i += 26 + Math.floor(hash2(i, 4, AS) * 26)) { // lollipops on the near hills
        if (Math.abs(i - ww * 0.42) < 18) continue;
        const b = nTop[i], hgt = 6 + Math.floor(hash2(i, 5, AS) * 4), c = th.nearDots[Math.floor(hash2(i, 6, AS) * 2)];
        R(i, b - hgt, FP * 2, hgt, '#fff4f8'); R(i + 0.5, b - hgt, FP, hgt, '#e8c8d8');
        el(i + 0.5, b - hgt - 2, 2.6, 2.4, c); el(i + 0.5, b - hgt - 2, 1.4, 1.3, mixH(c, '#ffffff', 0.45)); dot(i - 0.5, b - hgt - 3.5, '#ffffff'); dot(i, b - hgt - 3.5, '#ffffff');
      }
    }
    // house far on the hill (a hi-res prop: the scene buffer keeps its fine pixels)
    if (th.house) { const hc = propSpr('house', themeOf(area)); Lw.house = { x: Math.round(ww * 0.42), y: hz + 8, c: hc }; PX.blit(X, hc, Lw.house.x, Lw.house.y); } else Lw.house = null;
    // ---- path from the tree to the dock ----
    const pathPts = [];
    if (th.path) {
      const p0 = { x: Lw.tree.x + 9, y: Lw.tree.y + 4 }, p2 = { x: Lw.dockX0 - 3, y: Lw.dockY + 1 }, p1 = { x: (p0.x + p2.x) / 2 - 8, y: Math.max(p0.y, p2.y) + 12 };
      for (let k = 0; k <= 60; k++) { const u = k / 60, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; pathPts.push({ x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y }); }
      const [pl, pm, pe] = th.path;
      if (area === 'meadow') {
        for (const q of pathPts) el(q.x + 0.5, q.y + 1, 3.6, 2.15, pe);
        for (const q of pathPts) el(q.x + 0.5, q.y + 0.9, 3.1, 1.75, pm);
        for (const q of pathPts) el(q.x + 0.3, q.y + 0.1, 1.6, 0.55, pl);
        for (let k = 3; k < pathPts.length - 2; k += 4) { const q = pathPts[k], o = hash2(k, 1, AS) > 0.5 ? 1 : -2; el(q.x + o + 0.5, q.y + 1.5, 0.6, 0.35, pe); if (k % 8 === 3) dot(q.x - o + 0.5, q.y + 0.5, '#fffaf0'); }
      } else {
        let acc = 0;
        for (let k = 1; k < pathPts.length; k++) {
          acc += Math.hypot(pathPts[k].x - pathPts[k - 1].x, pathPts[k].y - pathPts[k - 1].y);
          if (acc < 7) continue; acc = 0;
          const q = pathPts[k], w = 5 + (k % 3 === 0 ? 1 : 0), cx = q.x + 0.5;
          el(cx + 0.5, q.y + 1.3, w / 2, 0.8, th.shade);
          el(cx, q.y - 0.6, w / 2, 1.95, pe); el(cx, q.y - 0.75, w / 2 - FP, 1.95 - FP * 1.5, pm); el(cx - 0.4, q.y - 1.6, w / 2 - 1.3, 0.55, pl);
          if (area === 'candy') { dot(cx - 1, q.y - 0.5, '#f7b6c8'); dot(cx + 0.5, q.y - 1, '#9fd8ff'); }
        }
      }
    }
    // ---- ground details, scattered by area (counts scale with the size of the land) ----
    let land = 0; for (let y = lawnTop + 4; y < wh; y++) land += Math.max(0, shoreAt(y) - sandW(y) - 6);
    const onPath = (x0, y0) => pathPts.some(q => Math.abs(q.x - x0) < 5 && Math.abs(q.y - y0) < 4);
    const spot = pad => { for (let k = 0; k < 8; k++) { const y0 = Math.round(lawnTop + 4 + rr() * (wh - lawnTop - 5)), x0 = Math.round(2 + rr() * (shoreAt(y0) - sandW(y0) - 6 - (pad || 0))); if (x0 > 1 && !onPath(x0, y0)) return [x0, y0]; } return null; };
    const scatter = (per, fn) => { const n = Math.round(land / per); for (let k = 0; k < n; k++) { const q = spot(); if (q) fn(q[0], q[1], k); } };
    const G2 = th.grass, sh = th.shade, bl = th.blade, bh = th.bladeHi;
    // grass: thin fine-pixel blades leaning out from the middle, a light tip on each
    const tuft = (x0, y0, k) => {
      const n = 3 + (k % 3 === 0 ? 1 : 0);
      for (let b = 0; b < n; b++) {
        const bx0 = x0 + (b - (n - 1) / 2) * 0.9 + 0.5, h = 1.4 + hash2(x0 + b, y0, AS) * 2.4, lean = (b - (n - 1) / 2) * 0.35;
        ln(bx0, y0 + 0.5, bx0 + lean, y0 + 0.5 - h, bl); dot(bx0 + lean, y0 + 0.5 - h, bh);
      }
    };
    const FLOWER = ['..c...', '.ccc..', 'ccdcc.', '.cccs.', '..cs..', '..g...'];
    const flower = (x0, y0, k) => stamp(x0 - 0.5, y0 - 1, FLOWER, { c: th.dots[k % 4], d: th.dotC, s: mixH(th.dots[k % 4], sh, 0.45), g: bl });
    const pebble = (x0, y0, k) => { const w = k % 2 ? 2 : 3; el(x0 + w / 2, y0 + 1.1, w / 2 + 0.2, 0.5, sh); el(x0 + w / 2, y0 + 0.5, w / 2, 0.75, '#9badb7'); el(x0 + w / 2 - 0.3, y0 + 0.2, w / 2 - 0.6, 0.35, '#b7c2cc'); dot(x0 + 0.5, y0, '#dfe8fb'); };
    const SHROOM = ['..rr..', '.rwrr.', 'rrrrrw', '.oiio.', '..ii..', '..ii.s'];
    const DANDY = ['.www.', 'wwwhw', 'wwwhh', '.whh.', '..g..', '..g..', '..g..'];
    if (th.deco === 'meadow') {
      scatter(70, tuft); scatter(230, flower);
      scatter(900, (x0, y0) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) { el(x0 + dx * 1.6 + 0.5, y0 + dy * 1.6 + 1, 1.05, 0.95, '#4f9a3e'); dot(x0 + dx * 1.6, y0 + dy * 1.6 + 0.5, '#9fdc70'); } ln(x0 + 0.5, y0 + 1, x0 + 0.5, y0 + 2.5, bl); });
      scatter(1100, pebble);
      scatter(1600, (x0, y0) => stamp(x0 - 1, y0 - 3, SHROOM, { r: '#d95763', w: '#ffffff', o: '#a8404a', i: '#fbf3dc', s: sh }));
      scatter(1300, (x0, y0) => stamp(x0 - 1, y0 - 5, DANDY, { w: '#ffffff', h: '#dfe8fb', g: bl }));
    } else if (th.deco === 'beach') {
      scatter(95, (x0, y0) => { ln(x0 - 2, y0 + 0.5, x0 + 1.5, y0 + 0.5, G2[3]); ln(x0 + 2, y0 - 0.5, x0 + 3.5, y0 - 0.5, G2[3]); ln(x0 - 2, y0, x0 + 0.5, y0, G2[0]); });
      scatter(380, (x0, y0) => dot(x0 + 0.25, y0 + 0.25, '#fffbea'));
      scatter(700, (x0, y0, k) => { const c = th.dots[k % 4]; el(x0 + 1, y0 + 0.4, 1.1, 0.8, c); ln(x0 + 0.5, y0 + 0.5, x0 + 1.5, y0 - 0.5, mixH(c, '#ffffff', 0.5)); dot(x0 + 1.5, y0, '#ffffff'); ln(x0 + 0.3, y0 + 1.2, x0 + 1.8, y0 + 1.2, G2[3]); });
      scatter(2600, (x0, y0) => { const cx = x0 + 0.5, cy = y0 + 0.5; for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + a * Math.PI * 2 / 5; ln(cx, cy, cx + Math.cos(an) * 2.4, cy + Math.sin(an) * 2.2, '#f08a6a', 2); } el(cx, cy, 1, 1, '#f08a6a'); dot(cx - 0.25, cy - 0.25, '#ffd0b8'); });
      scatter(900, pebble);
      scatter(1500, (x0, y0) => { ln(x0, y0 + 0.5, x0 + 1, y0 - 0.5, '#4b692f'); ln(x0 + 1, y0 - 0.5, x0 + 2, y0 + 0.5, '#6a8a3a'); ln(x0 + 2, y0 + 0.5, x0 + 3, y0 - 0.5, '#4b692f'); });
      // a trail of little footprints wandering down toward the sea
      for (let k = 0; k < 16; k++) { const y0 = Math.round(lawnTop + 30 + k * 9), x0 = Math.round(ww * 0.28 + Math.sin(k * 0.55) * 14 + k * 1.2); if (x0 > shoreAt(y0) - sandW(y0) - 4 || y0 > wh - 4) break; const fx = x0 + (k % 2) * 3; el(fx + 0.8, y0 + 0.6, 0.9, 0.55, G2[3]); el(fx + 0.5, y0 + 1.5, 0.55, 0.4, G2[3]); }
    } else if (th.deco === 'moonlit') {
      scatter(75, tuft);
      scatter(620, (x0, y0, k) => { dot(x0 + 0.25, y0 + 0.25, k % 2 ? '#7fe0f0' : '#c9a2f0'); if (k % 3 === 0) dot(x0 + 1, y0 + 1, '#4fb8a8'); });
      scatter(1200, (x0, y0) => stamp(x0 - 1, y0 - 3, ['..h...', '.cccc.', 'cccccc', '..ss..', '..ss.d', '..ss..'], { h: '#c8fff8', c: '#5fe8e0', s: '#e0e8ff', d: sh }));
      scatter(1500, (x0, y0) => stamp(x0 - 1, y0 - 3, ['..w...', '..pd..', '.ppd..', '.ppdd.', 'lppdd.', '..pd..'], { w: '#ffffff', p: '#c09af0', d: '#7a50c0', l: '#8a6ad0' }));
      scatter(1000, pebble); scatter(950, flower);
    } else if (th.deco === 'candy') {
      scatter(100, (x0, y0, k) => { const c = th.dots[k % 4]; if (k % 2) ln(x0 + 0.25, y0 + 0.25, x0 + 1.5, y0 + 0.25, c, 1); else ln(x0 + 0.25, y0 + 0.25, x0 + 0.75, y0 + 1.5, c, 1); });
      scatter(650, (x0, y0, k) => { const c = ['#f07a84', '#99e550', '#fff27a', '#c9a2f0'][k % 4]; el(x0 + 1.7, y0 + 2.3, 1.6, 0.5, sh); el(x0 + 1.5, y0 + 1.2, 1.6, 1.25, c); el(x0 + 1, y0 + 0.6, 0.6, 0.35, '#ffffff'); });
      scatter(750, (x0, y0) => { dot(x0 + 0.25, y0 + 0.25, '#ffffff'); dot(x0 - 0.25, y0 + 0.25, '#e8fff6'); dot(x0 + 0.75, y0 + 0.25, '#e8fff6'); dot(x0 + 0.25, y0 - 0.25, '#e8fff6'); });
      scatter(1700, (x0, y0) => { el(x0 + 0.5, y0 + 2.4, 2.6, 0.5, sh); el(x0 + 0.5, y0 + 1, 2.4, 1.1, '#ffffff'); el(x0 - 1.6, y0 + 1, 0.7, 1, '#f07a84'); el(x0 + 2.6, y0 + 1, 0.7, 1, '#f07a84'); el(x0 + 0.5, y0 + 0.9, 0.6, 0.6, '#f07a84'); });
      scatter(260, tuft);
    }
    // ---- shore: pebbles and shells in the sand ----
    for (let y = wt + 4; y < wh; y += 5 + Math.floor(hash2(y, 1, AS) * 6)) { const s = shoreAt(y), x0 = s - sandW(y) + 1 + Math.floor(hash2(y, 2, AS) * Math.max(1, sandW(y) - 3)), c = hash2(y, 3, AS) > 0.5 ? th.sandEdge : '#fffaf0'; dot(x0 + 0.25, y + 0.25, c); dot(x0 + 0.75, y + 0.25, mixH(c, th.sand, 0.5)); }
    // ---- water: glints, then plants / reefs / an island ----
    const waterSpot = (lo, hi, avoidDock) => { for (let k = 0; k < 10; k++) { const y0 = Math.round(Lw.minY + 4 + rr() * (Lw.maxY - Lw.minY - 6)), s = shoreAt(y0), x0 = Math.round(s + 3 + (lo + rr() * (hi - lo)) * (ww - s - 6)); if (!avoidDock || Math.abs(y0 - Lw.dockY) > 7 || x0 > Lw.dockX1 + 6) return [x0, y0]; } return null; };
    for (let k = 0; k < Math.round((ww - shoreAt(Lw.minY)) * (wh - wt) / 260); k++) { const y0 = Math.round(wt + 6 + rr() * (wh - wt - 6)), s = shoreAt(y0), x0 = Math.round(s + 4 + rr() * (ww - s - 8)), w = 2 + Math.floor(rr() * 3), c = mixH(W0[depthK(x0, y0) > 0.45 ? 2 : 1], th.hl, 0.45); R(x0, y0 + 0.5, w, FP, c); R(x0 + 0.5, y0, w - 1, FP, mixH(c, th.hl, 0.5)); }
    Lw.glowPts = [];
    const reeds = (x0, y0, n, stem, tip, glow) => {
      for (let k = 0; k < n; k++) {
        const x1 = x0 + k * 2 - n + (k % 2), h = 4 + Math.floor(hash2(x0 + k, y0, AS) * 5), xs = x1 + 0.25, top = y0 - h;
        ln(xs, y0, xs + (k % 2 ? 0.5 : -0.25), top, stem, 2);
        if (k % 2 === 0) { el(xs, top - 1, 0.6, 1.3, tip); dot(xs - 0.25, top - 1.75, mixH(tip, '#ffffff', 0.45)); if (glow) Lw.glowPts.push({ x: x1, y: top - 1 }); }
        else ln(xs + 0.5, top + 1, xs + 1.5, top + 0.5, stem);
      }
      R(x0 - n, y0 + 1, n * 2 + 1, FP, mixH(th.water[0], stem, 0.3)); R(x0 - n + 0.5, y0 + 1.5, n * 2, FP, mixH(th.water[0], th.hl, 0.4));
    };
    if (area === 'meadow') {
      for (let k = 0; k < 4; k++) { const y0 = Math.round(Lw.minY + 12 + (k + rr() * 0.6) * (Lw.span / 4.2)); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3 + (k % 2), '#4b8a3a', '#8f563b'); }
      for (let k = 0; k < 7; k++) { // lily pads, some with a flower
        const q = waterSpot(0.1, 0.5, true); if (!q) continue; const [x0, y0] = q, big = k % 3 === 0, rx = big ? 3.4 : 2.4, cx = x0 + 0.5, cy = y0 + 0.5;
        el(cx + 0.3, cy + 0.6, rx, 1.3, '#2f6a3a'); el(cx, cy, rx, 1.35, '#3f8a3a'); el(cx - 0.3, cy - 0.35, rx - 0.7, 0.8, '#6abe30'); el(cx - rx * 0.45, cy - 0.5, 0.7, 0.35, '#99e550');
        ln(cx + 0.5, cy - 0.25, cx + rx - 0.3, cy - 0.75, '#2f6a3a');
        if (k % 2 === 0) stamp(cx - 1.5, cy - 3, ['..w...', '.pwp..', 'ppdpp.', '.ppp..'], { w: '#ffffff', p: '#f7b6c8', d: '#e07ba0' });
      }
    } else if (area === 'beach') {
      for (let k = 0; k < 7; k++) { // reef shadows, with a little coral in the shallower ones
        const q = waterSpot(0.25, 0.85, true); if (!q) continue; const [x0, y0] = q, c = mixH(th.water[2], '#123a6a', 0.35);
        el(x0 + 0.5, y0 + 0.5, 5.5, 2.4, mixH(th.water[2], c, 0.5)); el(x0 + 0.5, y0 + 0.5, 4.2, 1.7, c);
        if (depthK(x0, y0) < 0.5) { ln(x0 - 1.75, y0 + 1, x0 - 1.75, y0 - 1, '#f07a84', 2); dot(x0 - 2.25, y0 - 0.5, '#f07a84'); ln(x0 + 1.25, y0 + 0.5, x0 + 1.5, y0 - 2, '#f5a86a', 2); el(x0 + 3.5, y0 - 0.5, 0.6, 0.6, '#f7b6c8'); }
      }
      // a far island with a palm and a tiny lighthouse
      const ix = Math.round(ww * 0.82), iy = wt;
      el(ix, iy + 0.2, 12.2, 1.6, th.sand); el(ix, iy - 1.8, 10.2, 1.8, '#8cc47a'); el(ix - 1, iy - 4, 6.8, 1.6, '#9ccf8a'); el(ix - 1.5, iy - 5.2, 3.2, 0.9, mixH('#9ccf8a', '#ffffff', 0.25));
      R(ix - 12, iy + 1, 24, FP, '#ffffff'); R(ix - 10, iy + 1 + FP, 20, FP, mixH('#ffffff', th.water[1], 0.5));
      R(ix + 3, iy - 13, 3, 8, '#ffffff'); R(ix + 5, iy - 13, 1, 8, '#dfe8fb'); R(ix + 3, iy - 11, 3, 2, '#e8404a'); R(ix + 3, iy - 7, 3, 2, '#e8404a'); R(ix + 5, iy - 11, 1, 2, '#b8303a'); R(ix + 5, iy - 7, 1, 2, '#b8303a');
      R(ix + 3, iy - 15, 3, 2, '#595a70'); R(ix + 2, iy - 13, 5, FP * 2, '#595a70'); R(ix + 3.5, iy - 15.5, 2, FP, '#595a70');
      Lw.beacon = { x: ix + 4, y: iy - 14 };
      ln(ix - 4.75, iy - 5.5, ix - 4.5, iy - 9, '#8a7a50', 2); ln(ix - 4.5, iy - 9, ix - 3.75, iy - 12.5, '#8a7a50', 2);
      const ptx = ix - 3.5, pty = iy - 13;
      for (const [dx, dy] of [[-4, 1.5], [4, 1.5], [-3, -0.5], [3, -0.5], [-5, 2.5], [5, 2.5]]) ln(ptx, pty, ptx + dx, pty + dy, '#4f8a54');
      el(ptx, pty, 1.8, 0.9, '#6fa86a'); dot(ptx - 0.5, pty - 0.5, '#9fd88a');
    } else Lw.beacon = null;
    if (area === 'moonlit') {
      for (let k = 0; k < 5; k++) { const y0 = Math.round(Lw.minY + 10 + (k + rr() * 0.6) * (Lw.span / 5.2)); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3, '#2a4a60', '#9ff8ff', true); }
      for (let k = 0; k < 5; k++) { // lotus pads, some with a glowing bud
        const q = waterSpot(0.1, 0.55, true); if (!q) continue; const [x0, y0] = q, cx = x0 + 0.5, cy = y0 + 0.5;
        el(cx + 0.2, cy + 0.5, 2.6, 1.1, '#1f4040'); el(cx, cy, 2.5, 1.05, '#2a5a5a'); el(cx - 0.2, cy - 0.35, 1.7, 0.55, '#3f7a70');
        if (k % 2 === 0) { stamp(cx - 1.5, cy - 3, ['..w...', '.eee..', 'peeep.', '.ppp..'], { w: '#ffffff', e: '#e0d0ff', p: '#c09af0' }); Lw.glowPts.push({ x: x0, y: y0 - 2 }); }
      }
    }
    if (area === 'candy') {
      for (let k = 0; k < 16; k++) { const q = waterSpot(0.05, 0.95, false); if (!q) continue; const [x0, y0] = q; if (k % 3) dot(x0 + 0.25, y0 + 0.25, '#ffffff'); else stamp(x0 - 0.5, y0 - 0.5, ['.w.', 'w.w', '.w.'], { w: '#ffffff' }); }
      for (let k = 0; k < 3; k++) { // rock-candy crystals poking out of the soda
        const q = waterSpot(0.3, 0.8, true); if (!q) continue; const [x0, y0] = q, c = ['#f7b6c8', '#c9a2f0', '#9fd8ff'][k], dk = mixH(c, '#7a6a9a', 0.3), lt = mixH(c, '#ffffff', 0.5);
        for (const [x, top, w] of [[x0 - 2, y0 - 3, 2], [x0, y0 - 5, 2], [x0 + 2, y0 - 2, 2]]) { R(x, top + 0.5, w, y0 + 1 - top - 0.5, c); R(x + 0.5, top, w - 1, FP, c); R(x + w - FP, top + 0.5, FP, y0 + 1 - top - 0.5, dk); R(x, top + 0.5, FP, y0 + 1 - top - 1, lt); }
        R(x0, y0 - 5, FP, 4, '#ffffff'); R(x0 - 3, y0 + 1, 8, FP, '#ffffff'); R(x0 - 2.5, y0 + 1 + FP, 7, FP, mixH('#ffffff', th.water[1], 0.5));
      }
    }
    // ---- dock: planks on posts, a lamp at the end (an object: the same ink ring as the props, fine lines inside) ----
    const dy = Lw.dockY, x0 = Lw.dockX0, x1 = Lw.dockX1;
    X.fillStyle = 'rgba(34,32,52,.22)'; X.fillRect(x0 + 2, dy + 1, x1 - x0, 2);
    for (const px of [x0 + 5, Math.round((x0 + x1) / 2) + 2, x1 - 1]) { R(px, dy - 1, 1, 4, '#663931'); R(px, dy - 1, FP, 4, '#8f563b'); R(px - 1, dy + 3, 3, FP, W0[0]); R(px - 1.5, dy + 3.5, 1, FP, W0[0]); R(px + 1.5, dy + 3.5, 1, FP, W0[0]); }
    R(x0 - 1, dy - 4, x1 - x0 + 3, 1, INK); R(x0 - 1, dy - 3, 1, 3, INK); R(x1 + 1, dy - 3, 1, 3, INK); R(x0 - 1, dy, x1 - x0 + 3, 1, INK);
    R(x0, dy - 3, x1 - x0 + 1, 1, '#e4b27a'); R(x0, dy - 2, x1 - x0 + 1, 2, '#b8743a'); R(x0, dy - 1, x1 - x0 + 1, 1, '#9a5f32');
    R(x0, dy - 3, x1 - x0 + 1, FP, '#f2cc98'); R(x0, dy - 2 - FP, x1 - x0 + 1, FP, mixH('#e4b27a', '#b8743a', 0.5)); R(x0, dy - FP, x1 - x0 + 1, FP, '#8a5028');
    for (let i = x0 + 2; i < x1; i += 3) { R(i + 0.5, dy - 3, FP, 3, '#8f563b'); R(i + 1, dy - 3, FP, 3, mixH('#e4b27a', '#b8743a', 0.3)); }
    for (let i = x0 + 4; i < x1; i += 6) dot(i + 0.25, dy - 1.75, '#595652');
    Lw.lamp = { x: x1 - 1, y: dy - 12 };
    R(x1 - 2, dy - 14, 5, 5, INK); R(x1 - 1, dy - 15, 3, 1, INK); R(x1 - 1, dy - 9, 3, 6, INK);
    R(x1, dy - 9, 1, 5, '#595a70'); R(x1, dy - 9, FP, 5, '#7a7c94'); R(x1 - 1, dy - 14, 3, 1, '#595a70'); R(x1 - 1, dy - 14, 3, FP, '#7a7c94');
    R(x1 - 1, dy - 13, 3, 3, '#f6c83a'); R(x1 - 1, dy - 13, 1.5, 2, '#fff27a'); dot(x1 - 1, dy - 13, '#ffffff'); R(x1 + 1.5, dy - 13, FP, 3, '#e0a830');
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
    ZMIN = Math.max(TUNE.zoomMinPx, Math.floor(Math.min(W / TUNE.worldW, H / TUNE.worldH) * DPR) / DPR);
    ZMIN = Math.ceil(ZMIN * DPR - 0.001) / DPR; ZMAX = ZMIN * TUNE.zoomMax;
    ww = Math.ceil(W / ZMIN); wh = Math.ceil(H / ZMIN);
    // the world buffer and the ground are SK x finer than the world (the sky sizes itself in paintSky: it only needs the top)
    for (const c of [buf, bgC]) { c.width = ww * SK; c.height = wh * SK; }
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
    // prefer a whole number of device pixels per fine pixel (every fine pixel the same size); the zoomed-out view keeps ZMIN
    const s2 = Math.round(z * DPR / SK) * SK / DPR;
    if (s2 >= ZMIN - 0.001 && s2 <= ZMAX + 0.001 && Math.abs(s2 - z) <= 0.5 / DPR + 0.001) s = s2;
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
    const mine = PS.S.sprouts.filter(isOut), act = ST.active();
    const s0 = mine.includes(act) ? act : mine[0], r = s0 && RT.get(s0.id);
    if (r) { fx = r.x; fy = r.y - 10; } else { const e = PS.S.eggs.find(x => x.area === area); if (e) fy = Lw.minY + Lw.span * 0.46; else if (Lw.home && PS.S.sprouts.some(x => x.area === area)) { fx = Lw.home.x; fy = Lw.home.y - 20; } }
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
      zoomAnim.k = Math.min(1, zoomAnim.k + dt / (zoomAnim.c ? 0.4 : 0.22));
      const e = 1 - Math.pow(1 - zoomAnim.k, 3), c = zoomAnim.c;
      // (the magnifier button glides the view's centre too: c = [from x, from y, to x, to y] in world px)
      if (c) { Z = lerp(zoomAnim.from, zoomAnim.to, e); camX = lerp(c[0], c[2], e) - viewW() / 2; camY = lerp(c[1], c[3], e) - viewH() / 2; clampCam(); }
      else zoomAt(lerp(zoomAnim.from, zoomAnim.to, e), zoomAnim.sx, zoomAnim.sy);
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
    // (capped: a flurry of taps can't pile up hundreds of particles on an iPad)
    for (let i = 0; i < n && parts.length < 260; i++) { const a = rand(0, Math.PI * 2), sp = rand(10, 38); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 16, life: rand(0.6, 1.1), type, color, grav: true }); }
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
        flutterAt: -99, dest: null, ripT: 0, awake: t + 25, ph: Math.random() * 2 };
      if (state === 'arrive') { const q = shallowPoint(); r.tx = q.x; r.ty = y; r.facing = -1; emote(r, '!', 1.4); }
      RT.set(s.id, r);
    }
    r.s = s; return r;
  }
  function lookFor(r) { if (!r.look || t > r.lookT) { r.look = ST.lookOf(r.s); r.lookT = t + 1.2; } return r.look; }
  function emote(r, e, dur) { r.emote = e; r.emoteT = dur || 1.6; }
  function hop(r) { r.hopT = 0.35; }
  const busy = r => ['held', 'fall', 'travel', 'arrive', 'cocoon', 'wait', 'enter'].includes(r.state);
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
    if (r.popT > 0) r.popT -= dt;
    const skin = s.look && s.look.skin, spook = SPOOKY[skin], dark = night || TH[area].bigMoon, shiny = !skin && s.look && s.look.shiny;
    if ((skin || shiny) && r.state !== 'travel' && Math.random() < dt * (spook ? (dark ? 1.2 : 0.5) : shiny ? 0.9 : 1.6)) {
      const col = pick(fxColors(shiny ? 'shiny' : skin));
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
      case 'enter': // walking home to rest
        r.tx = Lw.home ? Lw.home.door.x : r.x; r.ty = Lw.home ? Lw.home.door.y + 1 : r.y;
        if (!Lw.home || moveTo(speed * 1.3)) finishInside(r);
        break;
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
  // a Sprout's voice when it's tapped or petted (at most one every half second; each Sprout waits 2.5 s before it speaks again)
  function sproutCry(r) {
    if (!r || !r.s || !cryReady() || t - cryAt < 0.5 || t - (r.cryT == null ? -9 : r.cryT) < 2.5) return false;
    cryAt = t; r.cryT = t; cry(r.s, { stage: r.s.stage | 0 }); return true;
  }
  function petSprout(r, isTap) {
    if (busy(r) || r.state === 'eat') return;
    if (r.state === 'sleep') { wake(r); emote(r, '!', 1); hop(r); snd('pop'); return; }
    ST.pet(r.s);
    heartUp(r.x, r.y - 24);
    if (r.state !== 'swim') { r.state = 'pet'; r.timer = 0.8; }
    r.mood = 'happy'; if (isTap) hop(r);
    if (!sproutCry(r)) snd(Math.random() < 0.5 ? 'coo' : 'pop'); emote(r, 'heart', 1.2); markSeen('pet'); buzz(6);
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
    if (overHome(r.x, r.feetY - 4)) { r.x = Lw.home.door.x; r.y = Lw.home.door.y + 1; r.state = 'idle'; goInside(r.s, true); return; }
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

  // ---------------- the rest house (pet storage) ----------------
  function overHome(x, y) { const H = Lw.home; return !!H && Math.abs(x - H.x) < H.w / 2 && y > H.y - H.h && y < H.y + 3; }
  function goInside(s, now) {
    const r = RT.get(s.id);
    if (r && ['travel', 'arrive', 'cocoon', 'wait', 'fall'].includes(r.state)) { PS.ui.toast(`${s.name} is busy right now.`, 1800); return false; }
    s.home = true; PS.save();
    if (!r || !Lw.home) { RT.delete(s.id); updatePill(); return true; }
    entering.add(s.id); r.target = null; r.eat = null; r.mood = null;
    if (now) finishInside(r); else { r.state = 'enter'; emote(r, 'heart', 1.2); }
    return true;
  }
  function finishInside(r) {
    const H = Lw.home;
    if (H) { burst(H.door.x, H.door.y - 6, 'spark', 10, '#fff27a'); floater(`${r.s.name} is resting`, '#5b4630', H.door.x, H.door.y - H.h - 4); }
    snd('pop'); flushXp(r); entering.delete(r.id); RT.delete(r.id);
    if (sel === r.id) closeCard();
    markSeen('home'); updatePill();
  }
  function comeOut(s) {
    delete s.home; entering.delete(s.id); PS.save();
    const H = Lw.home; if (!H) { updatePill(); return; }
    RT.delete(s.id); spawnAt.set(s.id, { x: H.door.x, y: H.door.y + 1 });
    const r = getRT(s); hop(r); emote(r, 'sparkle', 1.4); r.cheerT = 0.8;
    goTo(r, H.door.x + rand(-22, 22), H.door.y + rand(8, 18), null);
    burst(H.door.x, H.door.y - 6, 'spark', 10, '#ffffff'); snd('coo'); updatePill();
  }
  function openHome() {
    const H = Lw.home; if (!H) return;
    closeCard(); markSeen('home');
    const name = ST.homeName(area);
    PS.ui.modal({
      eyebrow: name, title: 'Who wants to rest?', buttons: [{ label: 'Done', kind: 'primary' }],
      html: `<p>Tap a Sprout to send it inside to rest, or call it back out to play. Resting Sprouts can still race and battle.</p><div class="g-home"></div>`,
      mount(card) {
        const box = card.querySelector('.g-home');
        const render = () => {
          box.innerHTML = '';
          const mine = PS.S.sprouts.filter(s => s.area === area);
          for (const [title, inside] of [['Playing outside', false], ['Resting inside', true]]) {
            const list = mine.filter(s => !!s.home === inside), h = document.createElement('h3'); h.className = 'g-hh'; h.textContent = `${title} (${list.length})`; box.appendChild(h);
            if (!list.length) { const p = document.createElement('p'); p.className = 'g-hempty'; p.textContent = inside ? 'Nobody is resting right now.' : 'Everyone is inside.'; box.appendChild(p); }
            for (const s of list) {
              const b = document.createElement('button'); b.className = 'pick-item'; b.type = 'button';
              b.innerHTML = `<canvas class="px"></canvas><span><b>${ST.esc(s.name)}</b><small>${ST.formInfo(s).name} · Lv ${ST.totalLevels(s)}${s.id === PS.S.activeId ? ' · Partner' : ''}</small></span><span class="tag">${inside ? 'Play' : 'Rest'}</span>`;
              PS.ui.drawSproutTo(b.querySelector('canvas'), s, inside ? { eyes: 'closed', mouth: 'o' } : { eyes: 'happy', mouth: 'open' });
              b.onclick = () => { if (inside) comeOut(s); else if (!goInside(s, false)) return; snd('pop'); render(); };
              box.appendChild(b);
            }
          }
        };
        render();
      },
    });
  }
  // 3x5 digits for the little sign by the door
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  function drawHome() {
    const H = Lw.home; shadow(H.x, H.y, H.w + 4); PX.blit(bx, H.c, H.x, H.y);
    // sign: how many Sprouts are resting inside
    let n = 0; for (const s of PS.S.sprouts) if (s.area === area && s.home && !entering.has(s.id)) n++;
    n = Math.min(99, n);
    const w = (n > 9 ? 2 : 1) * 4 + 3, sx0 = Math.round(H.x - H.w / 2 - w - 1), sx = sx0 + (t - signT < 0.6 && !RMO ? (Math.floor(t * 24) % 2 ? 1 : -1) : 0), sy = H.y - 12, wood = WOOD[area] || WOOD.meadow;
    const S = Lw.sign || (Lw.sign = { x: 0, y: 0, w: 0 }); S.x = sx0; S.y = sy; S.w = w;
    fxAt(signSpr(n, wood), sx - 1, sy - 1);
  }
  // the little sign as a sprite (built once per number and wood): smoothed corners, fine wood grain, one ink ring
  const WOOD = { candy: ['#fff4f8', '#f7b6c8'], moonlit: ['#9a9ab8', '#6a6a8e'], meadow: ['#e4b27a', '#b8743a'] };
  const signCache = new Map();
  function signSpr(n, wood) {
    let a = signCache.get(wood); if (!a) signCache.set(wood, (a = []));
    if (a[n]) return a[n];
    const str = String(n), w = str.length * 4 + 3, g = new PX.Grid(w + 2, 15), m = Math.floor(w / 2);
    g.rect(m, 8, 3, 7, INK); g.rect(0, 0, w + 2, 9, INK);
    g.rect(m + 1, 8, 1, 6, wood[1]); g.rect(1, 1, w, 7, wood[0]); g.rect(1, 7, w, 1, wood[1]);
    [...str].forEach((d, k) => { const bits = DIGITS[+d]; for (let i = 0; i < 15; i++) if (bits[i] === '1') g.set(3 + k * 4 + (i % 3), 2 + Math.floor(i / 3), INK); });
    // (the digits keep their full stroke: a 3 x 5 glyph thinned to 1 fine px stops reading as a number)
    hd(g, { thin: false });
    // fine grain on the board and post, and a soft lit top edge
    for (let x = 1.5; x < w + 0.5; x += 0.5) { if (g.get(x, 1.25) === wood[0]) g.dot(x, 1, mixH(wood[0], '#ffffff', 0.35)); if (g.get(x, 6.75) === wood[0] && (x * 2) % 3 < 1) g.dot(x, 6.5, mixH(wood[0], wood[1], 0.5)); }
    g.dots([[m + 1, 9], [m + 1, 11]], mixH(wood[0], wood[1], 0.5));
    return (a[n] = g.canvas());
  }

  // ---------------- eggs ----------------
  function eggsHere() {
    const list = PS.S.eggs.filter(e => e.area === area), n = list.length;
    const midY = Lw.minY + Lw.span * 0.46, mid = Math.round((8 + shoreAt(midY) - 8) / 2) + 6;
    return list.map((e, i) => ({ e, x: Math.round(clamp(mid + (i - (n - 1) / 2) * 17, 10, shoreAt(midY) - 10)), y: Math.round(midY + (i % 2) * 6) }));
  }
  function eggNeed(e) { return (D.EGGS[e.kind] || D.EGGS.meadow).taps || 5; }
  // the last tap: the egg shakes and glows for a moment, then bursts open (a white flash, shell bits) and the Sprout pops out
  const hatchFx = new Map();         // egg id -> { o, k } while an egg is bursting open
  const HATCH_SEC = 1.0;
  let eggBits = [], flashT = 0;
  function tapEgg(o) {
    const e = o.e; if (hatchFx.has(e.id)) return;
    e.taps = (e.taps || 0) + 1; egw.set(e.id, 0.5); buzz(12);
    // the egg's waiting tune plays while it's tapped (audio.js brings the garden's music back after the 'hatch' jingle)
    if (!hatchWait && audioReady()) { try { PX.Music.play('hatch-wait'); } catch (err) { /* audio optional */ } }
    hatchWait = t || 0.001;
    const need = eggNeed(e);
    sndP('crack', 1 + Math.min(1, e.taps / need) * 0.5);
    const c = itemSpr('egg', e.kind); burst(o.x, o.y - artH(c) / 2, 'shell', 4);
    markSeen('egg');
    if (e.taps >= need) { hatchFx.set(e.id, { o, k: 0 }); sndP('whoosh', 1.4); buzz(20); }
    PS.save();
  }
  // the hub track again if the waiting tune is still playing (an egg left half-tapped, or a hatch the shell celebrates)
  function musicBack() { try { if (PX.Music && PX.Music.current === 'hatch-wait' && PS.ui.music) PS.ui.music(); } catch (e) { /* audio optional */ } }
  function tickHatch(dt) {
    if (hatchWait && !hatchFx.size && t - hatchWait > 10) { hatchWait = 0; musicBack(); }
    if (hatchFx.size) for (const [id, h] of hatchFx) {
      h.k += dt;
      if (Math.random() < dt * 16) burst(h.o.x + rand(-7, 7), h.o.y - rand(4, 22), 'spark', 1, Math.random() < 0.5 ? '#fff6a8' : '#ffffff');
      if (h.k >= HATCH_SEC) { hatchFx.delete(id); if (PS.S.eggs.some(e => e.id === id)) hatch(h.o); }
    }
    if (!eggBits.length) { if (flashT > 0) flashT -= dt; return; }
    for (const p of eggBits) { p.vy += 170 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= dt; if (p.y > p.gy && p.vy > 0) { p.y = p.gy; p.vy *= -0.3; p.vx *= 0.5; p.va *= 0.4; } }
    if (eggBits.some(p => p.life <= 0)) eggBits = eggBits.filter(p => p.life > 0);
    if (flashT > 0) flashT -= dt;
  }
  // (leaving the garden or the area mid-burst finishes it at once)
  function finishHatches() { for (const [id, h] of hatchFx) { hatchFx.delete(id); if (PS.S.eggs.some(e => e.id === id)) hatch(h.o, true); } }
  // shell bits: little crisp shards that flip between two shapes as they tumble (no rotation, so they stay pixel-sharp)
  const bitCache = new Map();
  function bitSpr(col, f) {
    let a = bitCache.get(col); if (!a) { if (bitCache.size > 24) bitCache.clear(); bitCache.set(col, (a = [])); }
    if (a[f]) return a[f];
    const g = new PX.Grid(6, 6);
    if (f) { g.poly([[1, 2], [3.4, 1.2], [5, 2.4], [4.4, 4.2], [1.6, 4.6]], col); g.dots([[1.5, 2.5], [2, 2.5], [2.5, 2]], '#ffffff'); }
    else { g.poly([[2, 1], [4.2, 1.6], [4.6, 4.4], [3, 5], [1.4, 3.6]], col); g.dots([[2.5, 1.5], [2.5, 2], [2.5, 2.5]], '#ffffff'); }
    return (a[f] = hd(g, { outline: true }).canvas());
  }
  function drawEggBits() {
    for (const p of eggBits) {
      if (p.life < 0.3 && Math.floor(t * 20) % 2) continue;
      fxAt(bitSpr(p.col, Math.floor(p.a) & 1), Math.round(p.x) - 3, Math.round(p.y) - 3);
    }
  }
  const popScale = k => (k < 0.6 ? Math.max(0.05, 1.2 * Math.sin(k / 0.6 * Math.PI / 2)) : 1.2 - 0.2 * Math.sin((k - 0.6) / 0.4 * Math.PI / 2));
  // the egg's own colour for its shell bits (read once per hatch)
  function eggColor(c) {
    try { const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.62), 1, 1).data; if (d[3] > 200) return '#' + hex2(d[0]) + hex2(d[1]) + hex2(d[2]); } catch (e) { /* not readable */ }
    return '#fbf3dc';
  }
  function hatch(o, quiet) {
    const c = itemSpr('egg', o.e.kind), kind = o.e.kind;
    const first = PS.S.sprouts.length === 0;
    // the shell (app.js 'egg:hatch') celebrates a Shiny, the very first Sprout and the first from each special egg, so the garden
    // doesn't add a second hello then. Worked out before hatching: the shell marks the egg kind as hatched straight away.
    const J = PS.S.journey, hk = J && J.hatched && typeof J.hatched === 'object' ? J.hatched : null;
    const firstKind = !D.AREAS[kind] && !!D.EGGS[kind] && !(hk && hk[kind]);
    const s = ST.hatchEgg(o.e.id); if (!s) return;
    const ex = o.x, ey = o.y - artH(c) / 2, cols = [eggColor(c), '#ffffff'];
    for (let i = 0; i < 7; i++) { const a = -Math.PI * (0.08 + 0.84 * i / 6), sp = rand(38, 66); eggBits.push({ x: ex + rand(-2, 2), y: ey + rand(-3, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 24, a: rand(0, 6), va: rand(-12, 12), life: 1.3, gy: o.y + rand(-1, 4), col: cols[i % 2] }); }
    if (!quiet && !RMO) flashT = 0.3;
    spawnAt.set(s.id, { x: o.x, y: o.y });
    const r = getRT(s); r.state = 'idle'; r.timer = 1.6; r.popT = RMO ? 0 : 0.45; emote(r, '!', 1.4); r.cheerT = 1.4;
    setTimeout(() => { if (RT.get(s.id) === r) emote(r, 'heart', 2); }, 1400);
    burst(o.x, ey, 'shell', 10); burst(o.x, o.y - 16, 'spark', 16, '#fbf236'); burst(o.x, o.y - 16, 'spark', 8, '#ffffff');
    sndP('pop', 0.8); buzz(40);
    const shiny = !!(s.look && s.look.shiny);
    if (shiny) { burst(o.x, o.y - 16, 'spark', 24, '#ffffff'); burst(o.x, o.y - 16, 'spark', 12, '#fff6c8'); }
    floaterFor(r, shiny ? `A Shiny ${s.name}!` : `Hi, ${s.name}!`, '#c0612a');
    cry(s, { stage: 0 }); r.cryT = t;
    nextCritter = t + (first ? 25 : 10); updatePill();
    const shellParty = !!PS.ui.celebrate && (shiny || first || firstKind);
    hatchWait = 0;
    if (shellParty) { setTimeout(musicBack, 4000); if (first) setTimeout(() => { hintReset = true; }, 3000); return; }
    setTimeout(() => jingle('hatch', 'evolve'), quiet ? 0 : 150);
    if (!first) { PS.ui.toast(shiny ? `A Shiny Sprout! It shimmers. Say hi to ${s.name}!` : `It hatched! Say hi to ${s.name}.`, 3200); return; }
    // (a shell without the celebrate screen) the first time, a short hello; then the pointing hand teaches one thing at a time
    setTimeout(() => PS.ui.modal({
      eyebrow: 'It hatched!', title: `Say hi to ${s.name}`, sprite: s,
      html: `<p>${ST.esc(s.name)} is yours to look after. Follow the pointing hand to learn how!</p>`,
      buttons: [{ label: 'Let\'s play', kind: 'primary', onClick: () => { hintReset = true; } }],
    }), quiet ? 300 : 1100);
  }

  // ---------------- critters ----------------
  function critterPool() {
    const night = PS.clock.isNight();
    return Object.keys(D.ANIMALS).filter(id => { const a = D.ANIMALS[id]; return a.area === area && (a.time === 'any' || (a.time === 'night') === night); });
  }
  // is a world point on screen right now (clear of the top bar and the tray)? m = margin in world px
  function inView(x, y, m) {
    const trayH = trayEl ? trayEl.offsetHeight || 110 : 110;
    return x > camX + m && x < camX + viewW() - m && y > camY + 76 / Z + m && y < camY + (H - trayH - 12) / Z - m;
  }
  function critterSpot(a) {
    if (a.where === 'water') return waterPoint(0.1, 0.85);
    if (a.where === 'coast') return coastPoint();
    if (a.where === 'air') return { x: rand(10, ww - 10), y: rand(Lw.minY - 4, Lw.minY + Lw.span * 0.55) };
    return lawnPoint();
  }
  // animals show up where the player is looking when they can (a kid shouldn't have to hunt off-screen for a 30-second visitor)
  function spawnCritter() {
    const pool = critterPool(); if (!pool.length) return;
    const fresh = pool.filter(id => !critters.some(c => c.id === id)), ids = (fresh.length ? fresh : pool).slice().sort(() => Math.random() - 0.5);
    let id = ids[0], p = null;
    for (const cand of ids) {
      for (let i = 0; i < 10 && !p; i++) { const q = critterSpot(D.ANIMALS[cand]); if (inView(q.x, q.y - 6, 10)) p = q; }
      if (p) { id = cand; break; }
    }
    const a = D.ANIMALS[id];
    if (!p) p = critterSpot(a);
    const c = { id, where: a.where, x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, hopT: 1, next: rand(0.6, 1.6), life: D.GROWTH.critterLifeSec, facing: Math.random() < 0.5 ? 1 : -1, ph: rand(0, 6), by: p.y, vx: rand(6, 10) * (Math.random() < 0.5 ? 1 : -1) };
    if (a.kind === 'plant') { c.plant = true; c.rooted = !!ROOTED[id]; if (a.where === 'air') c.vx *= 0.45; }
    critters.push(c);
    if (a.where === 'water') { burst(p.x, p.y - 2, 'drop', 6, '#cbdbfc'); } else if (c.plant && a.where !== 'air') { burst(p.x, p.y - 2, 'dust', 6, '#b8946a'); burst(p.x, p.y - 6, 'spark', 5, PLANT_COL[id] || '#ffffff'); } else burst(p.x, p.y - 4, 'spark', 8, '#ffffff');
  }
  function updateCritters(dt) {
    // first session: no visitors until the new Sprout has been petted and fed, then the first one comes quickly
    if (PS.S.sprouts.length && !seen('catch') && (!seen('pet') || !seen('feed')) && here.length) nextCritter = Math.max(nextCritter, t + 4);
    if (PS.S.sprouts.length && critters.length < TUNE.maxCritters && t > nextCritter) { spawnCritter(); nextCritter = t + rand(...D.GROWTH.critterEverySec); }
    for (const c of critters) {
      c.life -= dt * (inView(c.x, c.y - 6, 0) ? 1 : 0.5); c.next -= dt; // off-screen visitors stay a little longer
      if (c.where === 'air') {
        c.x += c.vx * dt; c.y = c.by + (c.plant ? Math.sin(t * 1.1 + c.ph) * 6 : Math.sin(t * 2 + c.ph) * 4);
        if (c.plant && Math.random() < dt * 1.2) parts.push({ x: c.x + rand(-4, 4), y: c.y - rand(8, 14), vx: rand(3, 8), vy: rand(-5, -2), life: rand(1.4, 2.4), type: 'seed', color: '#ffffff' });
        if (c.x < 8 || c.x > ww - 8) { c.vx *= -1; c.x = clamp(c.x, 8, ww - 8); }
        c.facing = c.vx > 0 ? 1 : -1;
        if (c.next <= 0) { c.by = clamp(c.by + rand(-8, 8), Lw.minY - 6, Lw.minY + Lw.span * 0.6); c.next = rand(1.5, 3); }
        continue;
      }
      if (c.hopT < 1) { c.hopT = Math.min(1, c.hopT + dt / (c.where === 'water' ? 1.6 : c.plant ? (c.rooted ? 0.5 : 0.55) : 0.38)); c.x = lerp(c.fx, c.tx, c.hopT); c.y = lerp(c.fy, c.ty, c.hopT); if (c.hopT >= 1 && c.rooted) burst(c.x, c.y - 1, 'dust', 4, '#b8946a'); }
      else if (c.next <= 0) {
        let nx, ny;
        if (c.where === 'water') { const q = waterPoint(0.1, 0.85); nx = lerp(c.x, q.x, 0.4); ny = lerp(c.y, q.y, 0.3); if (!inWater(nx, ny)) { nx = c.x; ny = c.y; } }
        else if (c.where === 'coast') { const q = coastPoint(c.y + rand(-4, 4)); nx = q.x; ny = q.y; }
        else { const a = rand(0, Math.PI * 2), d = rand(4, 9); nx = clamp(c.x + Math.cos(a) * d, 8, ww - 8); ny = clamp(c.y + Math.sin(a) * d * 0.5, Lw.minY + 3, Lw.maxY); if (nx > shoreAt(ny) - 7) { nx = c.x - 4; ny = c.y; } }
        if (c.plant && c.where === 'land' && !c.rooted) { nx = lerp(c.x, nx, 0.6); ny = lerp(c.y, ny, 0.6); } // little scoots
        c.fx = c.x; c.fy = c.y; c.tx = nx; c.ty = ny; c.hopT = 0; if (Math.abs(nx - c.x) > 0.3) c.facing = nx >= c.x ? 1 : -1;
        c.next = c.rooted ? rand(3.5, 6.5) : c.plant && c.where === 'land' ? rand(0.9, 1.8) : rand(1.6, 3.2);
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
    if (a.kind === 'plant') { burst(c.x, c.y - 6, 'petal', 10, PLANT_COL[c.id] || '#f7b6c8'); burst(c.x, c.y - 4, 'leaf', 5); floater(`Picked a ${a.name}!`, '#3f7a3a', c.x, c.y - 14); }
    else floater(`Caught a ${a.name}!`, '#5b4630', c.x, c.y - 14);
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

  // ---------------- garden fun: tap the scenery ----------------
  // Everything reacts to a tap (squash, wobble, spin, shake or hop, plus its own bits and a sound): trees drop a ripe fruit, the
  // pond splashes and a fish jumps, flowers puff petals, the fence rattles, chimneys puff, the house sign wobbles, lamps glow.
  // A few things hide a coin or two, once a day each (PS.S.gardenFun = { day, got: { key: 1 }, coins }, made when first needed;
  // at most FUN_CAP coins a day from the whole garden).
  const FUN_CAP = 60;
  const FUN_OF = {};
  for (const [rec, kinds] of Object.entries({
    bush: 'bush fern', flower: 'flowerbed', fence: 'fence', clank: 'bench driftwood surfboard bucket towel', rock: 'rock', stump: 'stump',
    shroom: 'mushrooms glowshroom', shine: 'crystal moonstone', shells: 'shells', light: 'lantern', spin: 'umbrella', bounce: 'ball',
    sand: 'sandcastle', pond: 'rockpool', sweet: 'candycane cupcake gumdrops donut lollipop icecream',
  })) for (const k of kinds.split(' ')) FUN_OF[k] = rec;
  // recipe -> [move, seconds, sound, pitch]; anything not listed wobbles and bumps
  const FUN = {
    tree: ['shake', 0.6, 'whoosh', 1.3], bush: ['shake', 0.5, 'whoosh', 1.6], flower: ['squash', 0.5, 'pop', 1.3], fence: ['shake', 0.45, 'bump', 1.4],
    clank: ['wobble', 0.6, 'bump', 0.9], rock: ['wobble', 0.6, 'thud', 1.1], stump: ['squash', 0.5, 'thud', 1.4], shroom: ['squash', 0.5, 'bloop', 1.2],
    shine: ['squash', 0.5, 'twinkle', 1], shells: ['hop', 0.5, 'twinkle', 1.3], light: ['flicker', 0.9, 'chime', 0.9], spin: ['spin', 0.9, 'whoosh', 1.8],
    bounce: ['hop', 0.6, 'bump', 0.7], sand: ['squash', 0.5, 'thud', 1.5], pond: ['squash', 0.5, 'splash', 1.2], sweet: ['squash', 0.5, 'bloop', 1.5],
    wobble: ['wobble', 0.6, 'bump', 1],
  };
  const FUN_GLOW = { light: '255,236,150', shine: '190,225,255' };
  const SWEETS = ['#f07aa0', '#fff09a', '#9fe8ff', '#c9a2f0', '#ffffff'];
  const SMOKE = 'rgba(236,236,240,0.85)';
  function funDay() {
    const d = new Date(), k = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    let G = PS.S.gardenFun;
    if (!G || typeof G !== 'object' || G.day !== k || !G.got || typeof G.got !== 'object') G = PS.S.gardenFun = { day: k, got: {}, coins: 0 };
    return G;
  }
  function flyCoins(x, y, n) {
    try { if (PS.ui.fx && PS.ui.fx.coinsFly) { const r = cv.getBoundingClientRect(), p = worldToScreen(x, y); PS.ui.fx.coinsFly([r.left + p.x, r.top + p.y], n); } } catch (e) { /* optional */ }
  }
  // pay n coins once a day for this key (while today's garden total is under FUN_CAP); returns what was given
  function funPay(key, n, x, y) {
    const G = funDay(); if (G.got[key]) return 0;
    n = Math.min(n, FUN_CAP - (+G.coins || 0)); if (n <= 0) return 0;
    G.got[key] = 1; G.coins = (+G.coins || 0) + n;
    const got = ST.addCoins(n, 'garden'); floater(`+${got} coins`, '#c7861c', x, y, 0.15); setTimeout(() => sndP('coin', 1), 160);
    flyCoins(x, y, Math.min(5, got)); burst(x, y + 6, 'spark', 8, '#fff27a'); PS.save();
    return got;
  }
  // n particles of a kind round (x, y) going up (only when tapped; the list is capped)
  function puff(n, type, x, y, spread, color, o) {
    for (let i = 0; i < n && parts.length < 180; i++) {
      const p = { x: x + rand(-spread, spread), y: y + rand(-1.5, 1.5), vx: rand(-14, 14), vy: rand(-30, -12), life: rand(0.7, 1.2), type, color: Array.isArray(color) ? pick(color) : color, grav: type !== 'smoke' && type !== 'bfly' };
      if (o) Object.assign(p, o);
      parts.push(p);
    }
  }
  function flutterOut(x, y) { if (parts.length < 180) parts.push({ x, y, vx: (Math.random() < 0.5 ? -1 : 1) * rand(14, 22), vy: -8, life: 2, type: 'bfly', color: pick(BUGS[area] || BUGS.meadow) }); }
  function jumpFish(x, y) { parts.push({ x: x - 4, y: y - 2, vx: rand(12, 18) * (Math.random() < 0.5 ? -1 : 1), vy: -48, life: 0.95, type: 'fish', color: pick(['#f6a83a', '#ff7a5a', '#c9a2f0', '#5fcde4']), grav: true }); }
  function funProp(q) {
    if (!q || !q.c) return;
    const isTree = (Lw.trees || []).includes(q), rec = isTree ? 'tree' : FUN_OF[q.kind] || 'wobble', R = FUN[rec] || FUN.wobble;
    const key = area + ':' + (isTree ? 'tree' + Lw.trees.indexOf(q) : q.kind + (q.i | 0));
    const w = artW(q.c), h = artH(q.c), top = q.y - h, x = q.x, th = TH[area];
    q.fa = RMO ? null : R[0]; q.f0 = t; q.fd = R[1]; q.gc = FUN_GLOW[rec] || (q.kind === 'glowshroom' ? '170,240,255' : null);
    sndP(R[2], R[3]); buzz(6); markSeen('propfun');
    const find = (n, msg) => { if (funPay(key, n, x, top - 6) && msg) floater(msg, '#5b4630', x, top - 6 - Math.max(10, 22 / Z), 0.4); };
    switch (rec) {
      case 'tree': {
        if (q.kind === 'lollitree') puff(8, 'bit', x, top + h * 0.3, w * 0.4, SWEETS);
        else { puff(q.kind === 'glowtree' ? 5 : 8, 'leaf', x, top + h * 0.3, w * 0.4); if (q.kind === 'glowtree') puff(5, 'spark', x, top + h * 0.35, w * 0.4, ['#c8fff8', '#ffffff']); }
        // shake a ripe fruit down onto the grass
        const ti = Lw.trees.indexOf(q), sl = treeSlots();
        if (groundList(area).length < TUNE.maxGroundFruit) for (let i = 0; i < Lw.slots.length; i++) {
          const s0 = Lw.slots[i]; if (!s0 || s0.tree !== ti || !sl[i] || growK(sl[i]) < 1) continue;
          const kind = takeTreeFruit(i), fy = clamp(q.y + rand(2, 7), Lw.minY, Lw.maxY);
          dropFruit(kind, clamp(s0.x + rand(-4, 4), 5, shoreAt(fy) - 4), fy, Math.max(4, fy - s0.y)); markSeen('shake');
          break;
        }
        break;
      }
      case 'bush': puff(6, 'leaf', x, top + h * 0.3, w / 2); if (Math.random() < 0.4) flutterOut(x, top + 2); break;
      case 'flower': puff(8, 'petal', x, top + h * 0.35, w / 2, th.dots); if (Math.random() < 0.6) flutterOut(x, top + 1); break;
      case 'rock': puff(3, 'dust', x, q.y - 1, w / 2, '#c8c0b0'); find(3, 'A hidden coin!'); break;
      case 'stump': puff(4, 'leaf', x, top + 1, w / 3); find(3, 'A hidden coin!'); break;
      case 'shroom': puff(6, 'dust', x, top + 2, w / 2, q.kind === 'glowshroom' ? ['#c9f2ff', '#e0d0ff', '#ffffff'] : ['#ffe0e8', '#ffffff'], { vy: -rand(8, 18), grav: false }); break;
      case 'shine': puff(6, 'spark', x, top + h * 0.4, w / 2, '#ffffff'); find(3, 'Moon money!'); break;
      case 'shells': puff(4, 'spark', x, top + h * 0.4, w / 2, ['#ffffff', '#ffd8ec']); find(3, 'A pearl coin!'); break;
      case 'light': puff(4, 'spark', x, top + h * 0.4, 2, '#fff27a'); break;
      case 'sand': puff(7, 'dust', x, top + h * 0.5, w / 2, ['#f3dc9c', '#e0c283']); find(4, 'Buried treasure!'); break;
      case 'pond':
        parts.push({ x, y: q.y - 3, vx: 0, vy: 0, life: 0.8, type: 'ripple', color: '#ffffff' }, { x, y: q.y - 3, vx: 0, vy: 0, life: 0.55, type: 'ripple', color: '#d6f5fd' });
        burst(x, top + h * 0.5, 'drop', 4, '#bfeeff');
        if (Math.random() < 0.6) jumpFish(x, top + h * 0.5);
        if (Math.random() < 0.3) find(3, 'A shiny coin!');
        break;
      case 'sweet': puff(7, 'bit', x, top + h * 0.4, w / 2, SWEETS); find(2, 'A sweet coin!'); break;
      default: puff(3, 'dust', x, q.y - 1, w / 2, '#d8cbb0');
    }
  }
  // the rest house: knock knock, and a puff from the chimney (sparkles from the crystal cave)
  function knockHome() {
    sndP('bump', 1.5); setTimeout(() => sndP('bump', 1.6), 150);
    const H = Lw.home; if (!H) return;
    if (H.kind === 'crystalcave') puff(6, 'spark', H.x, H.y - H.h + 2, H.w / 3, ['#c8ecfa', '#ffffff', '#d8ccf8']);
    else puff(5, 'smoke', H.x + Math.round(H.w * 0.22), H.y - H.h - 2, 2, SMOKE, { vx: rand(-3, 3) });
  }
  // the water: a splash and ripples (sometimes a fish jumps; now and then there's a coin, once a day per area)
  function funWater(x, y) {
    sndP('splash', 1.3); markSeen('propfun');
    parts.push({ x, y, vx: 0, vy: 0, life: 0.8, type: 'ripple', color: '#ffffff' }, { x, y, vx: 0, vy: 0, life: 0.55, type: 'ripple', color: TH[area].hl || '#d6f5fd' });
    burst(x, y - 2, 'drop', 5, '#d6f5fd');
    if (Math.random() < 0.35) jumpFish(x, y);
    if (Math.random() < 0.15) funPay('water:' + area, 3, x, y - 10);
  }
  // a tap on the scenery (the finger lifted without dragging): returns true when something reacted
  function sceneryTap(pr) {
    const x = pr.wx, y = pr.wy, S = Lw.sign, L = Lw.lamp, HB = Lw.house;
    if (S && x >= S.x - 2 && x <= S.x + S.w + 2 && y >= S.y - 2 && y <= S.y + 14) { signT = t; sndP('bump', 1.2); puff(3, 'dust', S.x + S.w / 2, S.y + 13, 3, '#d8cbb0'); markSeen('propfun'); return true; }
    if (L && Math.hypot(x - L.x, y - (L.y + 3)) < hitR(6)) { lampT = t; sndP('chime', 1.2); puff(5, 'spark', L.x, L.y, 2, ['#fff27a', '#ffffff']); markSeen('propfun'); return true; }
    if (pr.prop) { funProp(pr.prop); return true; }
    if (HB && HB.c && Math.abs(x - HB.x) < artW(HB.c) / 2 && y <= HB.y && y >= HB.y - artH(HB.c)) {
      sndP('bump', 1.4); setTimeout(() => sndP('bump', 1.5), 150); markSeen('propfun');
      puff(5, 'smoke', HB.x + Math.round(artW(HB.c) * 0.2), HB.y - artH(HB.c) - 1, 2, SMOKE, { vx: rand(-3, 3) });
      return true;
    }
    if (inWater(x, y)) { funWater(x, y); return true; }
    return false;
  }
  // scenery with its tap animation (still props are just blitted: no allocations)
  function drawProp(q) {
    const k = q.fa ? (t - q.f0) / q.fd : 1;
    if (k >= 1 || k < 0) { if (q.fa) { q.fa = null; q.ox = 0; } PX.blit(bx, q.c, q.x, q.y); return; }
    const e = 1 - k;
    let sx = 1, sy = 1, rot = 0, ox = 0, oy = 0;
    switch (q.fa) {
      case 'squash': { const s2 = Math.sin(k * Math.PI * 3) * 0.16 * e; sx = 1 + s2; sy = 1 - s2; break; }
      case 'wobble': rot = Math.sin(k * Math.PI * 5) * 0.13 * e; break;
      case 'spin': { sx = Math.cos(k * Math.PI * 4); if (Math.abs(sx) < 0.12) sx = sx < 0 ? -0.12 : 0.12; break; }
      case 'shake': ox = (Math.floor(t * 30) % 2 ? 1 : -1) * (e > 0.5 ? 2 : 1); break;
      case 'hop': { oy = -Math.round(Math.sin(Math.min(1, k * 1.5) * Math.PI) * 7); if (k > 0.66) { const s2 = Math.sin((k - 0.66) / 0.34 * Math.PI) * 0.14; sx = 1 + s2; sy = 1 - s2; } break; }
      case 'flicker': { const s2 = Math.sin(k * Math.PI * 4) * 0.07 * e; sx = 1 + s2; sy = 1 - s2; break; }
    }
    q.ox = ox;
    if (sx === 1 && sy === 1 && !rot) PX.blit(bx, q.c, q.x + ox, q.y + oy);
    else { bx.save(); bx.translate(q.x + ox, q.y + oy); if (rot) bx.rotate(rot); bx.scale(sx, sy); PX.blit(bx, q.c, 0, 0); bx.restore(); }
    if (q.gc) { const fl = (Math.floor(t * 14) % 3 ? 1 : 0.45) * e; glow(q.x, q.y - artH(q.c) * 0.5, 9, q.gc, 0.32 * fl); }
  }
  // the magnifier button: the whole garden at once, then back to where you were looking
  function toggleFar() {
    if (!ww || pinch) return;
    const cx = camX + viewW() / 2, cy = camY + viewH() / 2;
    if (Z > ZMIN * 1.03) {
      zoomBack = { z: Z, x: cx, y: cy };
      zoomAnim = { from: Z, to: ZMIN, k: 0, c: [cx, cy, ww / 2, cy] }; sndP('whoosh', 0.8);
    } else {
      let b = zoomBack;
      if (!b) {
        const mine = PS.S.sprouts.filter(isOut), act = ST.active(), s0 = mine.includes(act) ? act : mine[0], r = s0 && RT.get(s0.id);
        b = { z: ZMIN * TUNE.zoomDef, x: r ? r.x : ww * 0.42, y: r ? r.y - 10 : Lw.minY + Lw.span * 0.5 };
      }
      zoomBack = null;
      zoomAnim = { from: Z, to: snapZ(Math.max(b.z, ZMIN * 1.5)), k: 0, c: [cx, cy, b.x, b.y] }; sndP('whoosh', 1.3);
    }
    camV.x = camV.y = 0; markSeen('zoom'); buzz(6); syncZoomBtn(true);
  }
  function syncZoomBtn(force) {
    if (!zoomBtn) return;
    const far = (zoomAnim ? zoomAnim.to : Z) <= ZMIN * 1.03;
    if (!force && zoomBtn.classList.contains('g-far') === far) return;
    zoomBtn.classList.toggle('g-far', far); zoomBtn.setAttribute('aria-label', far ? 'Zoom back in' : 'See the whole garden');
  }

  // ---------------- solunar magic: sunrise and sunset glow, shooting stars on a clear night ----------------
  // how warm the sky is: it rises over the last 2.5 minutes of the day and through the switch, and fades over the first minutes of morning
  function duskK(n) {
    let k = n > 0.02 && n < 0.98 ? 1 - Math.abs(n - 0.5) * 2 : 0;
    try {
      if (!PS.clock.isNight()) { const ms = PS.clock.msToSwitch(), into = D.CLOCK.phaseMinutes * 60000 - ms; k = Math.max(k, 1 - ms / 150000, 1 - into / 150000); }
    } catch (e) { /* clock optional */ }
    return clamp(k, 0, 1) * (TH[area].bigMoon ? 0.5 : 1);
  }
  // the warm band above the horizon: soft fine-row bands, stronger toward the hills (cached per area and size)
  let duskC = null, duskKey = '';
  function duskSprite() {
    const key = area + ww + ':' + Lw.hz;
    if (duskC && duskKey === key) return duskC;
    duskKey = key; if (!duskC) duskC = document.createElement('canvas');
    const h = Lw.hz + 12; duskC.width = ww * SK; duskC.height = h * SK;
    const X = duskC.getContext('2d');
    const warm = area === 'candy' ? ['#ff9ec8', '#ffae86', '#fff0a8'] : area === 'moonlit' ? ['#c878c8', '#f0907a', '#ffd08a'] : ['#f08a9a', '#ff9e5e', '#ffd27a'];
    for (let fy = 0; fy < h * SK; fy++) {
      const u = (fy + 0.5) / (h * SK), d = Math.min(1, Math.round(Math.pow(u, 2.2) * 1.05 * 10) / 10); if (d <= 0) continue;
      // (the colour steps blend over a few fine rows instead of jumping)
      const c = u > 0.86 ? warm[2] : u > 0.82 ? mixH(warm[1], warm[2], 0.5) : u > 0.58 ? warm[1] : u > 0.54 ? mixH(warm[0], warm[1], 0.5) : warm[0];
      X.globalAlpha = d; X.fillStyle = c; X.fillRect(0, fy, ww * SK, 1);
    }
    X.globalAlpha = 1;
    return duskC;
  }
  function drawDusk(n) {
    const k = duskK(n); if (k < 0.02) return;
    const dc = duskSprite(); bx.globalAlpha = k; bx.drawImage(dc, 0, 0, ww, dc.height / SK); bx.globalAlpha = 1;
    const m = moonPos(); if (!TH[area].bigMoon) glow(m.x, Math.round(m.y + n * Lw.hz * 0.9), 18, '255,170,110', 0.18 * k);
  }
  const shoot = { life: 0, x: 0, y: 0, vx: 0, vy: 0 };
  function drawMagic(n, dt) {
    const th = TH[area], dk = duskK(n);
    // golden-hour light over the whole garden
    if (dk > 0.02) { bx.globalAlpha = 0.12 * dk; bx.fillStyle = '#ff9a5a'; bx.fillRect(0, 0, ww, wh); bx.globalAlpha = 1; }
    // a shooting star now and then on a clear night
    const lit = th.bigMoon ? 0.45 + 0.55 * n : n;
    if (lit > 0.7 && !RMO) {
      if (shoot.life <= 0 && t > nextShoot) {
        if (nextShoot) { shoot.life = 0.9; shoot.x = rand(0.08, 0.6) * ww; shoot.y = rand(3, Lw.hz * 0.4); shoot.vx = rand(70, 100); shoot.vy = rand(18, 30); }
        nextShoot = t + rand(8, 18);
      }
      if (shoot.life > 0) {
        shoot.life -= dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt;
        const a = Math.min(1, shoot.life * 3) * lit; bx.fillStyle = '#ffffff';
        // a fine streak: a bright head, a tail that thins and fades
        for (let i = 0; i < 12; i++) { bx.globalAlpha = a * (1 - i / 12); bx.fillRect(sn(shoot.x - shoot.vx * i * 0.007), sn(shoot.y - shoot.vy * i * 0.007), i < 2 ? 1 : FP, i ? FP : 1); }
        bx.globalAlpha = 1;
      }
    } else shoot.life = 0;
    // an egg about to hatch glows brighter and brighter (above the night tint, so it shines in the dark too)
    if (hatchFx.size) for (const h of hatchFx.values()) { const hk = Math.min(1, h.k / HATCH_SEC); glow(h.o.x, h.o.y - 9, Math.round(8 + 10 * hk), '255,246,180', 0.2 + 0.35 * hk); }
    // the dock lamp glows bright for a moment when tapped (day or night)
    if (Lw.lamp && t - lampT < 1.6) { const k = 1 - (t - lampT) / 1.6, L = Lw.lamp; glow(L.x, L.y, 10, '255,236,150', 0.5 * k); lampLit(L); }
  }

  // ---------------- drawing helpers ----------------
  // the dock lamp's glass when it shines (fine: a bright core, a white glint)
  function lampLit(L) { bx.fillStyle = '#fff27a'; bx.fillRect(L.x - 1, L.y - 1, 3, 3); bx.fillStyle = '#fffbd0'; bx.fillRect(L.x - 1, L.y - 1, 1.5, 2); bx.fillStyle = '#ffffff'; bx.fillRect(L.x - 1, L.y - 1, FP, FP); }
  // fine-pixel drawing on the world buffer (world coordinates; sn snaps to the fine grid)
  const sn = v => Math.round(v * SK) * FP;
  // a filled ellipse in fine rows (soil mounds, puffs of smoke)
  function ellF(cx, cy, rx, ry, c) {
    bx.fillStyle = c;
    for (let fy = Math.floor((cy - ry) * SK); fy <= Math.ceil((cy + ry) * SK); fy++) {
      const dy = (fy + 0.5) * FP - cy; if (Math.abs(dy) >= ry) continue;
      const hw = rx * Math.sqrt(1 - (dy / ry) * (dy / ry)), a = Math.round((cx - hw) * SK), b = Math.round((cx + hw) * SK);
      if (b > a) bx.fillRect(a * FP, fy * FP, (b - a) * FP, FP);
    }
  }
  // a soft oval shadow under something standing at (x, y), w world px wide (fine rows, so its edge is as smooth as the Sprouts')
  const SH_ROWS = (() => { const n = 4 * SK, a = []; for (let j = 0; j < n; j++) { const dy = (j + 0.5) / n * 2 - 1; a.push(Math.sqrt(Math.max(0, 1 - dy * dy * 0.92))); } return a; })();
  function shadow(x, y, w) {
    const cx = x + 0.5, Y0 = Math.round(y) - 2, hw = w / 2; bx.fillStyle = 'rgba(34,32,52,.2)';
    for (let j = 0; j < SH_ROWS.length; j++) { const h = Math.round(hw * SH_ROWS[j] * SK) * FP; if (h > 0) bx.fillRect(sn(cx) - h, Y0 + j * FP, h * 2, FP); }
  }
  // a soft round light: two discs (faint, then brighter in the middle) built once per size and colour at fine resolution, drawn
  // with an alpha (no colour strings made per frame)
  const glowCache = new Map();
  function glowSpr(r, col) {
    let m = glowCache.get(col); if (!m) { if (glowCache.size > 40) glowCache.clear(); glowCache.set(col, (m = [])); }
    let c = m[r]; if (c) return c;
    const n = (2 * r + 1) * SK; c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), mid = n / 2;
    for (const [rr, aa] of [[r + 0.5, 0.45], [Math.round(r * 0.55) + 0.5, 1]]) {
      x.fillStyle = `rgba(${col},${aa})`; const R = rr * SK;
      for (let fy = 0; fy < n; fy++) { const dy = fy + 0.5 - mid; if (Math.abs(dy) >= R) continue; const w = Math.round(Math.sqrt(R * R - dy * dy)); x.fillRect(Math.round(mid) - w, fy, w * 2, 1); }
    }
    m[r] = c; return c;
  }
  function glow(x, y, r, col, a) {
    if (!(a > 0.004)) return;
    r = Math.max(1, Math.round(r)); const c = glowSpr(r, col), s = 2 * r + 1;
    bx.globalAlpha = Math.min(1, a); bx.drawImage(c, sn(x + 0.5) - s / 2, sn(y + 0.5) - s / 2, s, s); bx.globalAlpha = 1;
  }
  // the water's edge across a swimmer: a fine white line with soft ripples either side
  function waterline(x, wl, half) {
    const X = Math.round(x);
    bx.fillStyle = '#ffffff'; bx.fillRect(X - half, wl, half * 2 + 1, FP);
    bx.fillStyle = TH[area].hl; bx.fillRect(X - half - FP, wl + FP, half * 2 + 1 + 2 * FP, FP); bx.fillRect(X - half - 2.5, wl + 1, 2, FP); bx.fillRect(X + half + 1.5, wl + 1, 2, FP);
  }
  function pose(r) {
    const S = { frame: 0, mouth: 'smile' };
    if (r.blinkT < 0) S.eyes = 'blink';
    if (r.mood === 'happy') { S.eyes = 'happy'; S.mouth = 'open'; }
    if (r.mood === 'sad') { S.eyes = 'sad'; S.mouth = 'flat'; }
    if (r.state === 'walk' || r.state === 'enter') { S.walk = true; S.frame = Math.floor(t * 7) % 2; }
    if (r.cheerT > 0) { S.arms = 'up'; S.eyes = 'happy'; S.mouth = 'open'; }
    if (r.state === 'held') { S.arms = 'out'; S.mouth = 'o'; delete S.eyes; }
    if (r.state === 'fall') { S.arms = r.flutter ? 'up' : 'out'; S.flap = r.flutter; S.frame = Math.floor(t * 12) % 2; S.mouth = 'open'; }
    if (r.state === 'eat') { S.arms = 'hold'; S.mouth = Math.floor(t * 8) % 2 ? 'open' : 'smile'; }
    if (r.state === 'sleep') { S.eyes = 'closed'; S.mouth = 'o'; }
    if (r.state === 'swim' || r.state === 'travel' || r.state === 'arrive' || r.state === 'wait') { S.arms = 'paddle'; S.frame = Math.floor(t * (r.state === 'wait' ? 3 : 5)) % 2; }
    return S;
  }
  function drawSprout(r) {
    const look = lookFor(r), c = PX.sprig(look, pose(r)), flip = r.facing < 0;
    const put = (x, y, extra) => {
      const c2 = extra ? PX.sprig(look, Object.assign(pose(r), extra)) : c;
      // a just-hatched Sprout pops in (grows past full size, then settles)
      if (r.popT > 0) { const k = popScale(1 - r.popT / 0.45); bx.save(); bx.translate(Math.round(x), Math.round(y)); bx.scale(k, k); PX.blit(bx, c2, 0, 0, flip, PX.SPRIG_AX, PX.SPRIG_AY); bx.restore(); return; }
      PX.blit(bx, c2, x, y, flip, PX.SPRIG_AX, PX.SPRIG_AY);
    };
    const head = r.s.stage === 2 ? 30 : 23;
    if (r.state === 'held') { shadow(r.x, heldGround(r), 9); put(r.x + Math.round(r.dangle), r.feetY); emPush(r, r.x, r.feetY - head); return; }
    if (r.state === 'fall') { shadow(r.x, r.y, 11); put(r.x, r.y - r.z); emPush(r, r.x, r.y - r.z - head); return; }
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
      emPush(r, r.x, r.y + sink - head); return;
    }
    const hopY = r.hopT > 0 ? Math.round(Math.sin((1 - r.hopT / 0.35) * Math.PI) * 4) : 0;
    const breathe = !hopY && (r.state === 'idle' || r.state === 'pet') && Math.floor(t * 1.4 + r.ph) % 2 ? 1 : 0; // a slow 1px breath while standing
    shadow(r.x, r.y, 13); put(r.x, r.y - hopY - breathe);
    if (r.state === 'eat' && r.eat) { const hf = heldFruit(r.eat); bx.drawImage(hf, Math.round(r.x - 5) - 0.5, Math.round(r.y - 11 - hopY) - 0.5, artW(hf) === 13 ? 9 : 10, artW(hf) === 13 ? 9 : 10); }
    emPush(r, r.x, r.y - hopY - head);
  }
  // a fruit in a Sprout's hands while it eats: the fruit art shrunk to 9 px once (smoothly, so no line is dropped the way a
  // nearest-pixel shrink each frame would), then given back a crisp edge and the same ink ring as every sprite
  const heldCache = new Map();
  function heldFruit(id) {
    let c = heldCache.get(id); if (c) return c;
    const f = itemSpr('fruit', id), n = 9 * SK, tmp = document.createElement('canvas'); tmp.width = tmp.height = n;
    const x = tmp.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(f, 0, 0, n, n);
    try {
      const d = x.getImageData(0, 0, n, n).data, g = new PX.Grid(10, 10), o = SK / 2 | 0, op = (i, j) => i >= 0 && j >= 0 && i < n && j < n && d[(j * n + i) * 4 + 3] >= 120;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (op(i, j)) { const k = (j * n + i) * 4, edge = !op(i - 1, j) || !op(i + 1, j) || !op(i, j - 1) || !op(i, j + 1); g.fset(i + o, j + o, edge ? INK : '#' + hex2(d[k]) + hex2(d[k + 1]) + hex2(d[k + 2])); }
      g.outerLine(); c = g.canvas();
    } catch (e) { c = f; } // (unreadable: the full-size fruit)
    if (heldCache.size > 30) heldCache.clear(); heldCache.set(id, c); return c;
  }
  function hintTree() {
    if (seen('feed') || !PS.S.sprouts.some(s => s.area === area)) return -1;
    const sl = treeSlots(); for (let i = 0; i < Lw.slots.length; i++) if (sl[i] && growK(sl[i]) >= 1) return Lw.slots[i].tree;
    return -1;
  }
  function drawTree(ti, hintT) {
    const T = Lw.trees[ti], c = T.c;
    shadow(T.x, T.y, Math.round(artW(c) * 0.6));
    drawProp(T);
    const sl = treeSlots(), hint = hintT === ti, ox = T.ox || 0;
    if (ox) bx.translate(ox, 0);
    sl.forEach((s, i) => {
      const p = Lw.slots[i]; if (!p || p.tree !== ti) return;
      const k = growK(s); if (k < 0.35) return;
      const f = itemSpr('fruit', s.kind);
      if (k < 1) { const sz = Math.max(3, Math.round(artW(f) * (0.3 + 0.6 * k) * SK) * FP); bx.drawImage(f, sn(p.x - sz / 2), sn(p.y - sz / 2), sz, sz); return; }
      if (hint && Math.floor(t * 3) % 2) twinkle4(p.x, p.y, 8.5);
      bx.drawImage(f, Math.round(p.x - artW(f) / 2), Math.round(p.y - artH(f) / 2 + (Math.floor(t * 2 + i) % 2)), artW(f), artH(f));
    });
    if (ox) bx.translate(-ox, 0);
  }
  // the cracks that grow with each tap (share of the egg's width / height)
  // the crack lines in fine pixels (offsets from the egg's top-left), worked out once per egg size
  const crackCache = new Map();
  function crackPts(cw, ch) {
    const key = cw * 1000 + ch; let a = crackCache.get(key); if (a) return a;
    a = EGG_CRACKS.map(cr => {
      const out = [], seen = new Set();
      for (let j = 1; j < cr.length; j++) {
        const x0 = cr[j - 1][0] * cw * SK, y0 = cr[j - 1][1] * ch * SK, x1 = cr[j][0] * cw * SK, y1 = cr[j][1] * ch * SK, n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) { const fx = Math.round(x0 + (x1 - x0) * s / n), fy = Math.round(y0 + (y1 - y0) * s / n), k = fx * 1000 + fy; if (!seen.has(k)) { seen.add(k); out.push([fx * FP, fy * FP]); } }
      }
      return out;
    });
    crackCache.set(key, a); return a;
  }
  // a little four-point twinkle of fine lines round (x, y), r world px out (the 'look here' marks)
  // the game's white sparkle sprite (one lookup, no key strings per frame)
  let sparkW = null;
  const whiteSpark = () => sparkW || (sparkW = PX.fx('spark', '#ffffff'));
  function twinkle4(x, y, r) {
    bx.fillStyle = '#ffffff'; const X = sn(x), Y = sn(y);
    bx.fillRect(X - r, Y - 1, FP, 2); bx.fillRect(X + r - FP, Y - 1, FP, 2); bx.fillRect(X - 1, Y - r, 2, FP); bx.fillRect(X - 1, Y + r - FP, 2, FP);
  }
  const EGG_CRACKS = [[[0.4, 0.14], [0.45, 0.19], [0.4, 0.24], [0.45, 0.29], [0.5, 0.33]], [[0.62, 0.5], [0.67, 0.46], [0.72, 0.5], [0.77, 0.46]], [[0.22, 0.46], [0.27, 0.5], [0.32, 0.46], [0.37, 0.5]], [[0.5, 0.62], [0.55, 0.66], [0.5, 0.7], [0.56, 0.74]]];
  function drawEgg(o) {
    const c = itemSpr('egg', o.e.kind), wt = egw.get(o.e.id) || 0;
    const need = eggNeed(o.e), taps = o.e.taps || 0, cw = artW(c), ch = artH(c);
    const hf = hatchFx.get(o.e.id), hk = hf ? Math.min(1, hf.k / HATCH_SEC) : 0;
    const wob = hf ? (RMO ? 0 : Math.round(Math.sin(t * 55) * (1 + hk * 1.6))) : wt > 0 ? (Math.floor(t * 30) % 2 ? 1 : -1) : (Math.floor(t * 1.5 + o.x) % 4 === 0 ? 1 : 0);
    const ex = o.x + wob, lift = wt > 0.3 && !RMO ? 1 : 0;
    shadow(o.x, o.y, Math.round(cw * 0.75));
    PX.blit(bx, c, ex, o.y + 1 - lift);
    // cracks grow with taps (all of them while it bursts, with light leaking through)
    const top = o.y + 1 - lift - ch, left = ex - Math.floor(cw / 2);
    const shown = hf ? EGG_CRACKS.length : Math.min(EGG_CRACKS.length, Math.floor(taps / need * (EGG_CRACKS.length + 1)));
    // (the cracks are 1-fine-px lines, with light leaking through them while it bursts)
    const CR = crackPts(cw, ch);
    bx.fillStyle = INK;
    for (let i = 0; i < shown; i++) for (const q of CR[i]) bx.fillRect(left + q[0], top + q[1], FP, FP);
    if (hf && Math.floor(t * 12) % 2) { bx.fillStyle = '#fff6a8'; for (const cr of EGG_CRACKS) bx.fillRect(left + sn(cr[1][0] * cw), top + sn(cr[1][1] * ch) + FP, FP, FP); }
    if ((D.EGGS[o.e.kind] || {}).sparkle && Math.floor(t * 2 + o.x) % 3 === 0) fxAt(whiteSpark(), left + cw - 3, top + 2);
    if (!taps && Math.floor(t * 3) % 2) { bx.fillStyle = '#ffffff'; const cx = o.x, cy = top + ch / 2; bx.fillRect(cx - cw / 2 - 4, cy, 2, FP); bx.fillRect(cx + cw / 2 + 2, cy, 2, FP); bx.fillRect(cx, top - 4, FP, 2); }
  }
  function drawCritter(c) {
    if (c.life < 3 && Math.floor(t * 10) % 2) return;
    const a = D.ANIMALS[c.id], flip = c.facing < 0;
    if (c.where === 'water') {
      const bob = Math.floor(t * 2 + c.ph) % 2;
      if (PX.critterSwim) { const s = swimSpr(c.id, c.plant ? plantFrame(c) : 0); PX.blit(bx, s, c.x, c.y + bob, flip, Math.floor(artW(s) / 2), artH(s)); } // already cut at the waterline
      else {
        const s = critterSpr(c.id), wl = Math.round(c.y - 3);
        bx.save(); bx.beginPath(); bx.rect(0, 0, ww, wl); bx.clip(); PX.blit(bx, s, c.x, c.y + 3 + bob, flip, Math.floor(artW(s) / 2), artH(s) - 1); bx.restore();
        waterline(c.x, wl, Math.max(4, Math.round(artW(s) / 2) - 1));
      }
    } else {
      const s = critterSpr(c.id, c.plant ? plantFrame(c) : 0);
      if (c.plant && c.where !== 'air') { // rooted plants pop up to move, walkers waddle; a little soil mound where they stand
        const hopY = c.hopT < 1 ? Math.round(Math.sin(c.hopT * Math.PI) * (c.rooted ? 5 : 1)) : 0, wob = c.hopT < 1 && !c.rooted ? (Math.floor(c.hopT * 6) % 2) : 0;
        shadow(c.x, c.y, Math.max(7, artW(s) - 8));
        if (c.rooted && !hopY) { const X = Math.round(c.x) + 0.5, Y = Math.round(c.y); ellF(X, Y - 0.6, 4.6, 1.1, '#8f6a4a'); ellF(X - 0.2, Y - 1.2, 3.4, 0.8, '#b8946a'); ellF(X - 1, Y - 1.5, 1.4, 0.35, '#d4b48a'); }
        PX.blit(bx, s, c.x + (wob ? c.facing : 0), c.y - hopY, flip, Math.floor(artW(s) / 2), artH(s) - 1);
        // the Pea Popper puffs its cheeks and pops a pea now and then
        if (c.id === 'peapod' && !hopY && plantFrame(c) === 1 && t > (c.peaT || 0)) { c.peaT = t + 0.9; parts.push({ x: c.x + c.facing * 8, y: c.y - 10, vx: c.facing * 46, vy: -3, life: 0.7, type: 'spark', color: '#8ee04a' }); }
      } else if (c.where === 'air') { const fl = Math.floor(t * 8 + c.ph) % 2; shadow(c.x, Math.min(Lw.maxY, c.y + 22), 5); PX.blit(bx, s, c.x, c.y - fl, flip, Math.floor(artW(s) / 2), artH(s) - 1); }
      else { const hopY = c.hopT < 1 ? Math.round(Math.sin(c.hopT * Math.PI) * (c.where === 'coast' ? 2 : 4)) : 0; shadow(c.x, c.y, Math.max(7, artW(s) - 8)); PX.blit(bx, s, c.x, c.y - hopY, flip, Math.floor(artW(s) / 2), artH(s) - 1); }
    }
    if (!seen('catch') && Math.floor(t * 3) % 2) { const Y = Math.round(c.y) - (a.where === 'water' ? 12 : 21), X = Math.round(c.x); fxAt(whiteSpark(), X - 1, Y - 1); }
  }
  function drawDrop(d) {
    if (d.life < 6 && Math.floor(t * 8) % 2) return;
    const s = dropSpr(d), bob = d.z > 0 ? 0 : Math.round(Math.sin(t * 3 + d.x) * 1);
    shadow(d.x, d.y, Math.max(5, artW(s) - 2));
    PX.blit(bx, s, d.x, d.y - 2 - bob - d.z);
    if (Math.floor(t * 4 + d.x) % 5 === 0) { const X = Math.round(d.x + artW(s) / 2), Y = Math.round(d.y - artH(s) - 2); bx.fillStyle = '#ffffff'; bx.fillRect(X, Y, FP, FP); bx.fillRect(X - FP, Y + FP, FP * 3, FP); bx.fillRect(X, Y + 2 * FP, FP, FP); }
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
    g.ell(w / 2, h - 2.4, w / 2 - 1.6, 1.6, C[0]);
    // soft fine steps of shade from the underside up (no dither): the 5-step ramp of the cloud's 3 colours
    const S5 = PX.ramp5 ? PX.ramp5(C) : [C[0], C[0], C[1], C[1], C[2]], FW = g.fw, FH = g.fh, kk = g.k || 1;
    for (let fx = 0; fx < FW; fx++) {
      let below = 0;
      for (let fy = FH - 1; fy >= 0; fy--) {
        if (!g.a[fy * FW + fx]) { below = 0; continue; }
        below++; const up = fy / kk, d = below / kk + Math.max(0, h - 3.5 - up) * 0.35;
        g.a[fy * FW + fx] = d <= 0.75 ? S5[4] : d <= 1.5 ? S5[3] : d <= 2.5 ? S5[2] : d <= 3.5 ? S5[1] : S5[0];
      }
    }
    c = hd(g, { outer: false, epx: false }).canvas(); cloudCache.set(key, c); return c;
  }
  function drawClouds(n) {
    const th = TH[area], a = th.bigMoon ? 0.5 : 1 - n * 0.75;
    if (a <= 0.05) return;
    bx.globalAlpha = a;
    for (const c of DECO.clouds) {
      const s = cloudSpr(c.s), span = ww + artW(s) + 10;
      const x = Math.round(((c.x * span + t * c.v) % span) - artW(s) / 2 - 5), y = Math.round(c.y * Lw.hz);
      PX.blit(bx, s, x, y);
    }
    bx.globalAlpha = 1;
  }
  function moonPos() { return { x: Math.round(ww * 0.74), y: Math.round(Lw.hz * 0.36) }; }
  function drawSunMoon(n) {
    const th = TH[area], m = moonPos();
    if (!th.bigMoon && n < 0.98) { const s = sunSprite(), sy = Math.round(m.y + 8 + n * Lw.hz * 0.9); if (n < 0.5) glow(m.x, sy - 8, 14, '255,250,210', 0.16 * (1 - n * 2)); PX.blit(bx, s, m.x, sy); }
    const mv = th.bigMoon ? 1 : n;
    if (mv > 0.02) { const s = moonSprite(th.bigMoon); PX.blit(bx, s, m.x, Math.round(m.y + artH(s) / 2 + (1 - mv) * Lw.hz * 0.9)); }
  }
  // tiny sprites for things bobbing on the water (built once)
  let floatC = null;
  function floatSprites() {
    if (floatC) return floatC;
    const mk = (w, h, f) => { const g = new PX.Grid(w, h); f(g); return hd(g, { outline: true }).canvas(); };
    floatC = {
      lantern: mk(7, 8, g => { g.rect(2, 1, 3, 1, '#595a70'); g.ell(3.5, 4, 2.4, 2.4, ['#fffbd0', '#fbd23a', '#df7126']); g.rect(1, 6, 5, 1, '#8f563b'); }),
      donut: mk(9, 6, g => { g.ell(4.5, 3, 3.8, 2.2, ['#ffd8ec', '#ff8ac4', '#d0508c']); g.ell(4.5, 3.1, 1.1, 0.6, null); g.dots([[3, 2], [3.5, 2], [6, 3.5], [2.5, 3.5], [5.5, 2], [3.5, 4]], '#ffffff'); g.dots([[6.5, 3], [2, 3]], '#fff27a'); g.dots([[5, 4], [3, 3]], '#5fcde4'); }),
      candy: mk(10, 5, g => { g.poly([[1, 1], [3, 2.5], [1, 4]], '#fcd82c'); g.poly([[9, 1], [7, 2.5], [9, 4]], '#e8bc20'); g.ell(5, 2.5, 2.4, 1.6, ['#fffab0', '#fcd82c', '#c49c14']); g.dots([[4, 1.75], [4.5, 1.75]], '#ffffff'); }),
      ring: mk(8, 6, g => { g.ell(4, 3, 3.2, 2, ['#c8fff0', '#5fdcc8', '#2f8f98']); g.ell(4, 3.1, 1.1, 0.6, null); g.dots([[2, 2], [2.5, 2]], '#ffffff'); }),
      boat: mk(9, 9, g => { g.poly([[4.5, 0.5], [4.5, 6], [8, 6]], '#ffffff'); g.poly([[4, 1.5], [4, 6], [1.4, 6]], '#fbf3dc'); g.poly([[1, 6], [8.6, 6], [7.6, 8], [2, 8]], '#d24552'); g.poly([[1.5, 7], [8.1, 7], [7.6, 8], [2, 8]], '#a83442'); }),
    };
    return floatC;
  }
  // ---- little effect sprites, built once (fine pixels; the same finish as the Sprouts) ----
  // a grid from a picture in fine pixels (one character per fine pixel, '.' clear): w and h are in fine pixels
  function fineGrid(rows, map) {
    const g = new PX.Grid(Math.ceil(rows[0].length / SK), Math.ceil(rows.length / SK));
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c) g.fset(i, j, c); } });
    return g;
  }
  const effCache = new Map();
  // effCache: kind -> Map(colour -> [frames]) (no key strings per frame)
  function effSpr(kind, col, f, make) {
    let m = effCache.get(kind); if (!m) effCache.set(kind, (m = new Map()));
    let a = m.get(col); if (!a) { if (m.size > 32) m.clear(); m.set(col, (a = [])); }
    return a[f] || (a[f] = make());
  }
  // a butterfly, wings open or closed (origin 2 left of and 2 above its body)
  const bflySpr = (c, open) => effSpr('bfly', c, open ? 1 : 0, () => {
    const d = mixH(c, INK, 0.25), map = { c, d, k: INK, w: mixH(c, '#ffffff', 0.5) };
    return fineGrid(open
      ? ['..........', '.cc....cc.', 'cwcc..ccwc', 'cccckkcccc', '.ddckkcdd.', '..dd..dd..', '..........', '..........']
      : ['..........', '...c..c...', '..cwkkwc..', '..cckkcc..', '..ddkkdd..', '...d..d...', '..........', '..........'], map).canvas();
  });
  // a far bird (or a little bat), wings up or down (origin 2 left of and 1 above its body)
  const birdSpr = (c, up) => effSpr('bird', c, up ? 1 : 0, () => fineGrid(up
    ? ['c........c', '.cc....cc.', '...cccc...', '....cc....', '..........', '..........']
    : ['..........', '..........', '....cc....', '..cccccc..', '.c......c.', 'c........c'], { c }).canvas());
  // a jumping fish (anchor: body centre), tail flicked up or down
  const fishSpr = (c, up) => effSpr('fish', c, up ? 1 : 0, () => {
    const g = new PX.Grid(10, 7);
    g.poly(up ? [[3, 3.6], [0.8, 1.6], [1.4, 4.4]] : [[3, 3.4], [1.4, 2.6], [0.8, 5.4]], mixH(c, INK, 0.2));
    g.ell(5.6, 3.5, 2.9, 1.5, [mixH(c, '#ffffff', 0.45), c, mixH(c, INK, 0.3)]);
    g.dots([[7, 3], [7.5, 3]], '#ffffff'); g.dot(7.5, 3.5, INK);
    return hd(g, { outline: true }).canvas();
  });
  // a fish's shadow gliding under the water (see-through, so no outline), tail wagging
  const fishShadowSpr = (rgb, big, wag) => effSpr('fsh', rgb, (big ? 2 : 0) + wag, () => {
    const L = big ? 4 : 3, g = new PX.Grid(2 * L + 6, 6), col = `rgba(${rgb},0.26)`;
    g.ell(L + 3.5, 3, L + 0.6, 1.5, col);
    g.poly([[3.2, 3], [0.6, 1.2 + wag * 0.8], [1, 4.6 + wag * 0.6]], col);
    return g.canvas();
  });
  const FXC = new Map();
  // PX.fx sprites, cached here by kind and colour (so no lookup strings are made per particle per frame)
  function fxOf(kind, col) {
    let m = FXC.get(kind); if (!m) FXC.set(kind, (m = new Map()));
    let c = m.get(col); if (!c) { if (m.size > 48) m.clear(); c = PX.fx(kind, col); m.set(col, c); }
    return c;
  }
  function drawWater(dt, n) {
    const th = TH[area], wt = Lw.waterTop, SB = Lw.sb;
    // fish shadows gliding under the surface
    for (const f of DECO.fish) {
      const y = Math.round(Lw.minY + 8 + f.b * (Lw.span - 14) + Math.sin(t * f.v * 2.3 + f.ph) * 5), s = shoreAt(y), span = ww - s - 12;
      if (span < 16 || (Math.abs(y - Lw.dockY) < 4 && s + 10 < Lw.dockX1 + 4)) continue;
      const ph = t * f.v + f.ph, X = Math.round(s + 8 + clamp(f.a + Math.sin(ph) * f.r, 0.04, 0.96) * span), d = Math.cos(ph) >= 0 ? 1 : -1, L = f.big ? 4 : 3, wag = Math.floor(t * 4 + f.ph) % 2;
      PX.blit(bx, fishShadowSpr(th.fish, f.big, wag), X, y + 3, d < 0, L + 3, 6);
    }
    // shoreline foam (a fine-edged wiggly line along the smooth shore)
    bx.fillStyle = th.foam;
    for (let y = wt + 1; y < wh; y++) { const s = sn(SB[y]), w = Math.sin(t * 2.2 + y * 0.45); if (w > -0.2) bx.fillRect(s, y, w > 0.6 ? 1.5 : w > 0.2 ? 1 : FP, 1); if (w > 0.85 && (y & 3) === 0) bx.fillRect(s + 2, y + FP, FP, FP); }
    // little wave marks (a fine line with a lighter fine line on top)
    for (const w of DECO.waves) {
      const y = Math.round(wt + 4 + w.y * (Lw.maxY - wt)), s = shoreAt(y), x = sn(s + 4 + w.x * (ww - s - 6) + Math.sin(t * 0.5 + w.ph) * 2);
      if (Math.sin(t * 1.3 + w.ph) < -0.3) continue;
      const deep = depthK(x, y) > 0.45;
      bx.fillStyle = deep ? th.water[1] : th.hl; bx.fillRect(x, y + FP, w.w, FP);
      if (!deep) { bx.fillStyle = '#ffffff'; bx.fillRect(x + FP, y, w.w - 1, FP); }
    }
    // surf rolling in (beach)
    if (th.surf) {
      bx.fillStyle = th.foam;
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.16 + i * 0.5) % 1; if (p > 0.92) continue;
        for (let y = wt + 3; y < wh; y++) { if ((y + i) % 2 && p < 0.7) continue; const s = SB[y] - 1, X = sn(ww - p * (ww - s - 2) + Math.sin(y * 0.5 + i * 3) * 1.5); bx.fillRect(X, y, p > 0.6 ? 1.5 : 1, 1); }
      }
      // a sailboat on the horizon
      const b = floatSprites().boat, sx = shoreAt(wt) + 10, span = ww - sx + 20, bxp = Math.round(sx + ((t * 1.1) % span) - 10);
      if (bxp > sx - 4) PX.blit(bx, b, bxp, wt + 2 + (Math.floor(t * 1.5) % 2 ? 0 : 1));
    }
    // sparkles: a fine glint
    if (Math.floor(t * 2) % 2) { bx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const y = Math.round(wt + 8 + ((i * 37 + Math.floor(t * 0.5) * 13) % Math.max(1, Lw.maxY - wt - 8))), s = shoreAt(y), x = Math.round(s + (ww - s) * (0.25 + i * 0.18)); bx.fillRect(x - FP, y + FP, 2 + FP, FP); bx.fillRect(x + FP, y, FP, 1 + FP); } }
    // moon reflection: fine shimmering lines
    const moonA = th.bigMoon ? 0.55 + 0.35 * n : n * 0.8;
    if (moonA > 0.1) {
      const m = moonPos(); bx.fillStyle = '#fff6c9'; bx.globalAlpha = Math.min(1, moonA);
      for (let y = wt + 1, i = 0; y < wt + 40 && y < wh; y += 1, i++) { if (m.x < shoreAt(y) + 2) continue; const w = 1 + ((i * 7 + Math.floor(t * 3)) % 3) * 0.75 + Math.max(0, 3 - i / 4.5); bx.fillRect(sn(m.x - w / 2 + Math.sin(t * 2 + i * 0.6) * 1), y + (i & 1) * FP, sn(w), FP); }
      bx.globalAlpha = 1;
    }
    // things bobbing on the water: paper lanterns (moonlit), sweets (candy)
    if (area === 'moonlit' || area === 'candy') {
      const F = floatSprites(), kinds = area === 'moonlit' ? FLOAT_MOON : FLOAT_CANDY;
      for (let i = 0; i < kinds.length; i++) {
        const f = DECO.floats[i], p = floatPos(f), s = F[kinds[i]];
        if (!p) continue;
        PX.blit(bx, s, p.x, p.y + (Math.floor(t * f.v * 2 + f.ph) % 2));
        bx.fillStyle = th.hl; bx.fillRect(p.x - Math.floor(artW(s) / 2) - 1, p.y + 1, 2, FP); bx.fillRect(p.x + Math.ceil(artW(s) / 2) - 1, p.y + 1, 2, FP);
      }
    }
    // soda fizz: tiny fine bubbles
    if (th.fizz) {
      if (Math.random() < dt * 9 && fizz.length < 30) { const q = waterPoint(0.05, 0.95); fizz.push({ x: q.x, y: q.y, life: rand(0.8, 1.6) }); }
      let j = 0;
      for (const f of fizz) {
        f.life -= dt; f.y -= 5 * dt; f.x += Math.sin(t * 6 + f.y) * 0.1;
        const X = sn(f.x), Y = sn(f.y);
        if (!inWater(X, Y)) f.life = 0;
        if (f.life <= 0) continue;
        fizz[j++] = f;
        bx.fillStyle = '#ffffff';
        if (f.life > 0.4) { bx.fillRect(X, Y - FP, FP, FP); bx.fillRect(X - FP, Y, FP, FP); bx.fillRect(X + FP, Y, FP, FP); bx.fillRect(X, Y + FP, FP, FP); } else bx.fillRect(X, Y, FP, FP);
      }
      fizz.length = j;
    }
  }
  const FLOAT_MOON = ['lantern', 'lantern', 'lantern'], FLOAT_CANDY = ['donut', 'candy', 'ring', 'donut'];
  // drifting slowly across the open water, never over the dock
  function floatPos(f) {
    const y = Math.round(Lw.minY + 6 + f.b * (Lw.span - 10)); if (Math.abs(y - Lw.dockY) < 6) return null;
    const s = shoreAt(y), x = Math.round(s + 10 + clamp(f.a + Math.sin(t * 0.05 * f.v + f.ph) * 0.1, 0.05, 0.95) * (ww - s - 18));
    const P = floatPos.p || (floatPos.p = { x: 0, y: 0 }); P.x = x; P.y = y; return P;
  }
  // life in the air: butterflies by day, drifting petals / leaves / motes, birds far off
  const BUGS = { meadow: ['#fbf236', '#f7b6c8', '#ffffff'], candy: ['#f7b6c8', '#9fd8ff', '#fff27a'], beach: ['#ffffff', '#fbf236', '#f5a86a'] };
  const DRIFT = { meadow: ['#f7b6c8', '#99e550', '#ffffff'], moonlit: ['#c9a2f0', '#9fd8ff', '#a6f2d3'], candy: ['#f07a84', '#fff27a', '#639bff'], beach: null };
  // a drifting petal in 3 turns (fine pixels)
  function petal(x, y, f) {
    if (f === 0) { bx.fillRect(x, y, 1.5, FP); bx.fillRect(x + FP, y + FP, 1, FP); }
    else if (f === 1) { bx.fillRect(x, y, FP, 1.5); bx.fillRect(x + FP, y + FP, FP, 1); }
    else { bx.fillRect(x, y, 1, FP); bx.fillRect(x + FP, y + FP, 1, FP); bx.fillRect(x + 1, y + 1, FP, FP); }
  }
  function drawAmbient(n) {
    const day = 1 - n, bc = BUGS[area];
    if (bc && day > 0.5 && area !== 'beach') {
      for (const b of DECO.bugs) {
        const p = t * 0.22 + b.p, x = Math.round(10 + (Math.sin(p * 1.1 + b.a * 6) * 0.5 + 0.5) * (shoreAt(Lw.minY + 30) - 24)), y = Math.round(Lw.minY + 4 + (Math.sin(p * 1.7 + b.b * 6) * 0.5 + 0.5) * Lw.span * 0.75 + Math.sin(t * 5 + b.p) * 2);
        fxAt(bflySpr(bc[b.c % bc.length], Math.floor(t * 9 + b.p * 3) % 2), x - 2, y - 2);
      }
    }
    const dc = DRIFT[area];
    if (dc) {
      for (const d of DECO.drift) {
        const u = (d.p + t * d.v * 0.25) % 1.2 - 0.1, x = sn(u * ww), y = sn(Lw.minY - 20 + d.y * Lw.span * 0.9 + Math.sin(t * 1.3 + d.ph) * 5 + u * 20);
        const c = dc[d.c % dc.length], f = Math.floor(t * 3 + d.ph) % 3;
        if (area === 'moonlit') { glow(x, y, 2, '200,230,255', 0.25); bx.fillStyle = c; bx.fillRect(x, y, FP, FP); bx.fillRect(x + FP, y, FP, FP); continue; }
        bx.fillStyle = c; petal(x, y, f);
      }
    }
    if ((area === 'beach' || area === 'meadow') && day > 0.4) {
      const c = area === 'beach' ? '#ffffff' : '#4a4a6a';
      for (const b of DECO.birds) {
        const u = (b.p + t * b.v) % 1.3 - 0.15, x = Math.round(u * ww), y = Math.round(b.y * Lw.hz + Math.sin(t * 0.8 + b.ph) * 2), up = Math.floor(t * 4 + b.ph) % 2;
        fxAt(birdSpr(c, up), x - 2, y - 1.5);
      }
    }
  }
  function drawLights(n) {
    const th = TH[area], lit = th.bigMoon ? 0.45 + 0.55 * n : n;
    if (lit < 0.08) return;
    const m = moonPos();
    // twinkling stars and the moon above the dark overlay (fine dots with a fine cross when they flash)
    bx.fillStyle = '#ffffff'; bx.globalAlpha = Math.min(1, lit);
    for (const s of DECO.stars) if (s.tw && Math.sin(t * 2 + s.ph) > -0.2) {
      const X = Math.round(s.x * ww * SK) * FP, Y = Math.round(s.y * (Lw.hz - 8) * SK) * FP, b = Math.sin(t * 2 + s.ph);
      bx.fillRect(X, Y, FP, FP);
      if (b > 0.5) { bx.fillRect(X - FP, Y, FP * 3, FP); bx.fillRect(X, Y - FP, FP, FP * 3); }
      if (b > 0.9) { bx.fillRect(X - 2 * FP, Y, FP * 5, FP); bx.fillRect(X, Y - 2 * FP, FP, FP * 5); }
    }
    bx.globalAlpha = 1;
    if (th.bigMoon || n > 0.9) glow(m.x, m.y + (th.bigMoon ? 11 : 7), th.bigMoon ? 16 : 11, '255,246,201', 0.12 * lit);
    // lamps, windows, glowing props
    if (Lw.lamp) { glow(Lw.lamp.x, Lw.lamp.y, 7, '255,236,150', 0.35 * lit); lampLit(Lw.lamp); }
    if (Lw.house) { const hc = Lw.house.c, X = Lw.house.x - Math.floor(artW(hc) / 2) + Math.round(artW(hc) * 0.64), Y = Lw.house.y - artH(hc) + Math.round(artH(hc) * 0.62); glow(X, Y, 5, '255,236,150', 0.4 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(X - 1, Y - 1, 1.5, 1.5); bx.fillStyle = '#fffbd0'; bx.fillRect(X - 1, Y - 1, FP, FP); }
    for (const p of Lw.props) { const g = GLOWS[p.kind]; if (!g) continue; const pulse = 0.8 + Math.sin(t * 2 + p.x) * 0.2; glow(p.x, p.y - artH(p.c) * g[1], g[2], g[3], 0.3 * lit * pulse); }
    // the rest house's windows light up (brighter when someone is inside)
    if (Lw.home) {
      const H = Lw.home; let full = false; for (const s of PS.S.sprouts) if (s.area === area && s.home) { full = true; break; }
      for (const w of H.info.win || []) { glow(H.x + w[0], H.y + w[1], full ? 7 : 5, '255,236,150', (full ? 0.4 : 0.22) * lit); bx.fillStyle = full ? '#fff27a' : '#f6c83a'; bx.fillRect(H.x + w[0] - 1, H.y + w[1] - 1, 1.5, 1.5); if (full) { bx.fillStyle = '#fffbd0'; bx.fillRect(H.x + w[0] - 1, H.y + w[1] - 1, FP, FP); } }
    }
    // glowing plants
    for (const c of critters) { const gcol = PLANT_GLOW[c.id]; if (gcol) glow(c.x, c.y - (c.where === 'water' ? 5 : 9), 8, gcol, 0.3 * lit * (0.75 + Math.sin(t * 2.4 + c.ph) * 0.25)); }
    // spooky Sprouts glow softly at night
    if (lit > 0.3) for (const r of here) { const sp = SPOOKY[r.s.look && r.s.look.skin]; if (sp && r.state !== 'travel') glow(r.x, (r.state === 'held' ? r.feetY : r.y - (r.state === 'fall' ? r.z : 0)) - 12, 10, sp.glow, 0.13 * lit); }
    // glowing reed tips and lotus buds, the lighthouse beam, floating lanterns
    for (const q of Lw.glowPts || []) { const pulse = 0.7 + Math.sin(t * 1.7 + q.x * 0.3) * 0.3; glow(q.x, q.y, 3, '160,250,255', 0.3 * lit * pulse); bx.fillStyle = '#c8fff8'; bx.fillRect(q.x, q.y, FP, FP); }
    if (Lw.beacon && Math.floor(t * 1.2) % 3 !== 2) { glow(Lw.beacon.x, Lw.beacon.y, 5, '255,242,170', 0.5 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(Lw.beacon.x - 1, Lw.beacon.y, 3, 1); bx.fillStyle = '#ffffff'; bx.fillRect(Lw.beacon.x - FP, Lw.beacon.y, 1, FP); }
    if (area === 'moonlit') for (let i = 0; i < 3; i++) { const p = floatPos(DECO.floats[i]); if (!p) continue; glow(p.x, p.y - 4, 6, '255,220,140', 0.28 * lit); const Y = p.y - 4.5 + (Math.floor(t * DECO.floats[i].v * 2 + DECO.floats[i].ph) % 2); bx.fillStyle = '#fff27a'; bx.fillRect(p.x, Y, 1, 1); bx.fillStyle = '#ffffff'; bx.fillRect(p.x, Y, FP, FP); }
    // fireflies: a glowing dot with a white-hot centre
    const count = Math.round((th.bigMoon ? 6 : 0) + 10 * n);
    for (let i = 0; i < Math.min(count, DECO.flies.length); i++) {
      const f = DECO.flies[i], p = t * 0.25 + f.p;
      const x = Math.round(8 + (Math.sin(p * 1.3 + f.a * 6) * 0.5 + 0.5) * (shoreAt(Lw.minY + 20) - 12)), y = Math.round(Lw.minY - 6 + (Math.sin(p * 1.9 + f.b * 6) * 0.5 + 0.5) * Lw.span * 0.8);
      if (Math.sin(t * 3 + f.p * 3) < -0.3) continue;
      glow(x, y, 2, '255,242,122', 0.35); bx.fillStyle = '#fff27a'; bx.fillRect(x, y, 1, 1); bx.fillStyle = '#fffbd0'; bx.fillRect(x, y, FP, FP);
    }
  }
  function drawParticles(dt) {
    let j = 0;
    for (const p of parts) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += 70 * dt;
      if (p.type === 'feather') p.vx = Math.sin(t * 6 + p.y) * 8;
      if (p.life > 0) parts[j++] = p;
      if (p.life < 0.25 && Math.floor(t * 20) % 2) continue;
      const X = Math.round(p.x), Y = Math.round(p.y);
      switch (p.type) {
        case 'heart': fxAt(fxOf('heart'), X - 3, Y - 3); break;
        case 'spark': fxAt(fxOf('spark', p.color), X - 1, Y - 1); break;
        case 'shell': fxAt(fxOf('shell'), X, Y); break;
        case 'leaf': fxAt(fxOf('leaf'), X, Y); break;
        case 'drop': fxAt(fxOf('drop', p.color), X, Y); break;
        case 'feather': fxAt(fxOf('feather'), X, Y); break;
        case 'dust': bx.fillStyle = p.color; if (p.life > 0.6) bx.fillRect(X, Y, 1, 1); else bx.fillRect(X, Y, FP, FP); break;
        case 'seed': p.vx = 4 + Math.sin(t * 3 + p.y * 0.2) * 4; bx.fillStyle = p.color; bx.fillRect(X, Y, 1, FP); bx.fillRect(X + FP, Y - FP, FP, FP); bx.fillStyle = '#c8d0e0'; bx.fillRect(X - FP, Y + FP, FP, FP); bx.fillRect(X - 1, Y + 1, FP, FP); break;
        case 'petal': bx.fillStyle = p.color; petal(X, Y, Math.floor(t * 8 + p.x) % 2); break;
        case 'bat': fxAt(birdSpr(p.color, Math.floor(t * 8 + p.x) % 2), X - 2, Y - 1.5); break;
        case 'wisp': { p.vx = Math.sin(t * 3 + p.y * 0.3) * 4; bx.fillStyle = p.color; bx.fillRect(X, Y, 1, 1.5); bx.fillRect(X + FP, Y + 1.5, FP, FP); bx.fillRect(X + (Math.floor(t * 4) % 2 ? 1 : -FP), Y + 2, FP, FP); break; }
        case 'smoke': { const z = p.life > 0.85 ? 2 : p.life > 0.45 ? 3 : 4; ellF(X + 0.5, Y + 0.5, z / 2, z / 2, p.color); break; }
        case 'bit': bx.fillStyle = p.color; bx.fillRect(X + FP, Y, 1, 2); bx.fillRect(X, Y + FP, 2, 1); break;
        case 'bfly': p.vy = Math.sin(t * 7 + p.x * 0.3) * 10 - 6; fxAt(bflySpr(p.color, Math.floor(t * 12 + p.x) % 2), X - 2, Y - 2); break;
        case 'fish': PX.blit(bx, fishSpr(p.color, p.vy < 0), X, Y, p.vx < 0, 4.5, 3.5); break;
        case 'ripple': { const w = Math.round(3 + (0.8 - p.life) * 10); bx.fillStyle = p.color; bx.fillRect(X - w, Y + FP, 1.5, FP); bx.fillRect(X + w - 0.5, Y + FP, 1.5, FP); bx.fillRect(X - w + 1, Y, 1, FP); bx.fillRect(X + w - 1, Y, 1, FP); break; }
      }
    }
    parts.length = j;
  }

  // ---------------- update + render ----------------
  function update(dt) {
    const night = PS.clock.isNight();
    here = PS.S.sprouts.filter(isOut).map(getRT);
    for (const r of here) updateSprout(r, dt, night);
    // carrying a snack or an animal: nearby Sprouts stop to look at it (easier to drop onto, and it's cute)
    if (drag && lastClient.on) {
      const g = ghostWorld({ clientX: lastClient.x, clientY: lastClient.y });
      for (const r of here) {
        if (busy(r) || r.state === 'eat' || r.state === 'swim' || Math.hypot(r.x - g.x, r.y - g.y) > 70) continue;
        if (r.state !== 'idle' && r.state !== 'pet') { r.state = 'idle'; r.target = null; }
        r.timer = Math.max(r.timer, 0.6); r.facing = g.x > r.x ? 1 : -1;
        if (!(t < r.watchT)) { emote(r, drag.src === 'pouch' ? '!' : 'heart', 1.2); r.watchT = t + 3; }
      }
    }
    updateCritters(dt);
    // drops
    if (t > nextDrop) { spawnDrop(); nextDrop = t + rand(...D.GROWTH.dropEverySec); }
    const dl = drops[area] || [];
    for (const d of dl) { d.life -= dt; if (d.z > 0 || d.vz) { d.vz += TUNE.gravity * 0.6 * dt; d.z -= d.vz * dt; if (d.z <= 0) { d.z = 0; if (!d.bounced && d.vz > 30) { d.vz = -d.vz * 0.35; d.bounced = true; d.z = 0.01; } else d.vz = 0; } } }
    if (dl.some(d => d.life <= 0)) drops[area] = dl.filter(d => d.life > 0);
    // ground fruit falls to the grass
    for (const f of groundList(area)) if (f.z > 0) { f.vz += TUNE.gravity * dt; f.z = Math.max(0, f.z - f.vz * dt); }
    for (const [id, v] of egw) { if (v > 0) egw.set(id, v - dt); }
    tickHatch(dt);
    // periodic XP flush + save
    flushT -= dt; if (flushT <= 0) { flushT = TUNE.xpFlushSec; flushAll(); }
    saveT -= dt; if (saveT <= 0) { saveT = 6; PS.save(); }
    cleanT -= dt; if (cleanT <= 0) { cleanT = 5; for (const id of RT.keys()) { const s2 = ST.get(id); if (!s2 || (s2.home && !entering.has(id))) RT.delete(id); } }
  }
  // the depth-sorted draw list, emote queue and on-top list are reused every frame (no closures or arrays made per frame)
  const DL = [], emQ = [], topQ = []; let dlN = 0, emN = 0, topN = 0;
  function dl(y, k, o, i) { let e = DL[dlN]; if (!e) e = DL[dlN] = { y: 0, k: 0, o: null, i: 0 }; e.y = y; e.k = k; e.o = o; e.i = i; dlN++; }
  function emPush(r, x, y) { r.emX = x; r.emY = y; emQ[emN++] = r; }
  function drawList(hintT) {
    for (let a = 1; a < dlN; a++) { const e = DL[a]; let b = a - 1; while (b >= 0 && DL[b].y > e.y) { DL[b + 1] = DL[b]; b--; } DL[b + 1] = e; } // (insertion sort: a few dozen items)
    for (let a = 0; a < dlN; a++) {
      const e = DL[a];
      switch (e.k) { case 0: drawTree(e.i, hintT); break; case 1: drawProp(e.o); break; case 2: drawHome(); break; case 3: drawEgg(e.o); break; case 4: drawSprout(e.o); break; case 5: drawCritter(e.o); break; case 6: drawGroundFruit(e.o); break; }
      e.o = null;
    }
  }
  function render(dt) {
    const n = PS.clock.night(), th = TH[area];
    ensureBg(n);
    bx.setTransform(SK, 0, 0, SK, 0, 0); // world coordinates, SK buffer pixels each
    bx.imageSmoothingEnabled = false;
    bx.drawImage(skyC, 0, 0, ww, skyC.height / SK);
    drawDusk(n);
    drawSunMoon(n);
    drawClouds(n);
    bx.drawImage(bgC, 0, 0, ww, wh);
    drawWater(dt, n);
    const hintT = hintTree(); dlN = 0; emN = 0; topN = 0;
    for (let i = 0; i < Lw.trees.length; i++) dl(Lw.trees[i].y, 0, null, i);
    for (const p of Lw.props) dl(p.y, 1, p, 0);
    if (Lw.home) dl(Lw.home.y, 2, null, 0);
    for (const o of eggsHere()) dl(o.y, 3, o, 0);
    for (const r of here) { if (r.state === 'held' || r.state === 'fall') topQ[topN++] = r; else dl(r.y, 4, r, 0); }
    for (const c of critters) if (c.where !== 'air') dl(c.y, 5, c, 0);
    for (const f of groundList(area)) dl(f.y, 6, f, 0);
    drawList(hintT);
    drawAmbient(n);
    for (const c of critters) if (c.where === 'air') drawCritter(c);
    for (let i = 0; i < topN; i++) { drawSprout(topQ[i]); topQ[i] = null; }
    // night overlay over the land (the sky already has its own night colours)
    const na = th.dim + (th.night[3] - th.dim * 0.5) * n;
    if (na > 0.01) {
      // fade in from above the tallest far peaks so snowy tops don't glow at night
      // (in fine rows, so the fade is soft; one solid colour per area, faded with the alpha)
      const bh = th.mount ? 5 : 3, y0 = Lw.hz - (th.mount ? 10 + th.mountAmp : 14), nh = 4 * bh * SK;
      bx.fillStyle = th.nightC || (th.nightC = `rgb(${th.night[0]},${th.night[1]},${th.night[2]})`);
      for (let j = 0; j < nh; j++) { bx.globalAlpha = Math.min(1, na * (j + 1) / (nh + 1)); bx.fillRect(0, y0 + j * FP, ww, FP); }
      bx.globalAlpha = Math.min(1, na); bx.fillRect(0, y0 + 4 * bh, ww, wh); bx.globalAlpha = 1;
    }
    drawMagic(n, dt);
    drawLights(n);
    if (eggBits.length) drawEggBits();
    // drops sit above the night tint so they always sparkle
    for (const d of drops[area] || []) { if (n > 0.3 || th.dim) glow(d.x, d.y - 6 - d.z, 6, '255,242,170', 0.25); drawDrop(d); }
    // emote bubbles, markers and particles stay bright
    for (let i = 0; i < emN; i++) { const r = emQ[i]; emQ[i] = null; if (r.emote) PX.blit(bx, PX.emote(r.emote), r.emX + 3, r.emY, false, 2, 13); }
    const mark = drag && drag.hover ? drag.hover : sel ? RT.get(sel) : null;
    if (mark && here.includes(mark) && !busy(mark)) PX.blit(bx, arrowSprite(), mark.x, headY(mark) - 2 - (Math.floor(t * 3) % 2) - (mark.emote ? 13 : 0));
    drawParticles(dt);
    if (flashT > 0) { bx.globalAlpha = Math.min(1, flashT / 0.3) * 0.7; bx.fillStyle = '#ffffff'; bx.fillRect(0, 0, ww, wh); bx.globalAlpha = 1; }

    // present, then crisp text at display resolution
    const sc = Z * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = TH[area].water[3]; ctx.fillRect(0, 0, cv.width, cv.height);
    // far out a buffer pixel is smaller than a device pixel: smooth it then (nearest would drop the thin fine lines)
    if (sc < SK - 0.01) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
    const X0 = Math.round(-camX * sc), Y0 = Math.round(-camY * sc);
    ctx.drawImage(buf, X0, Y0, Math.round((ww - camX) * sc) - X0, Math.round((wh - camY) * sc) - Y0);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (here.some(r => r.state === 'held')) drawZoneLabels();
    drawCritterArrows();
    if (guideNow && guideNow.mode !== 'tray') drawHand(guideNow);
    ctx.font = '700 17px "Fredoka", sans-serif';
    let fj = 0;
    for (const f of floaters) {
      if (f.delay > 0 || f.life - dt > 0) floaters[fj++] = f;
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.life -= dt; f.y -= 10 * dt;
      if (f.life < 0.3 && Math.floor(t * 20) % 2) continue;
      const sp = worldToScreen(f.x, f.y), X = Math.round(clamp(sp.x, 80, W - 80)), Y = Math.round(clamp(sp.y, 88, H - 20)); // below the area sign, so rewards are never hidden
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff8e6'; ctx.strokeText(f.text, X, Y); ctx.fillStyle = f.color; ctx.fillText(f.text, X, Y);
    }
    floaters.length = fj;
  }
  function drawZoneLabels() {
    const wy = Lw.minY + Lw.span * 0.62, s = shoreAt(wy), y = Math.round(clamp(worldToScreen(0, wy).y, 90, H - 150));
    const lab = (text, wx, deep) => {
      const X = Math.round(clamp(worldToScreen(wx, 0).x, 40, W - 40)); ctx.font = '700 14px "Fredoka", sans-serif';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = deep ? 'rgba(34,32,52,.55)' : 'rgba(255,248,230,.75)'; roundRect(X - w / 2, y - 12, w, 20, 8); ctx.fill();
      ctx.fillStyle = deep ? '#fff8e6' : '#2f6f8f'; ctx.fillText(text, X, y + 3);
    };
    lab('Swim', s + (ww - s) * 0.2, false);
    lab('Travel', s + (ww - s) * 0.72, true);
    if (Lw.home) { const H = Lw.home, p = worldToScreen(H.x, H.y - H.h - 6), X = Math.round(clamp(p.x, 40, W - 40)), Y = Math.round(clamp(p.y, 70, H0() - 150)); ctx.font = '700 14px "Fredoka", sans-serif'; const w = ctx.measureText('Rest').width + 14; ctx.fillStyle = 'rgba(255,248,230,.85)'; roundRect(X - w / 2, Y - 12, w, 20, 8); ctx.fill(); ctx.fillStyle = '#8f563b'; ctx.fillText('Rest', X, Y + 3); }
  }
  const H0 = () => H;
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------------- input: world ----------------
  function local(e) { return clientToWorld(e.clientX, e.clientY); }
  function sproutAt(p, k) {
    let best = null, bd = 1e9;
    for (const r of here) {
      if (r.state === 'travel' || r.state === 'arrive' || r.state === 'held' || r.state === 'cocoon' || r.state === 'enter') continue;
      const hx = r.x, hy = (r.state === 'fall' ? r.y - r.z : r.y) - 10, d = Math.hypot(p.x - hx, p.y - hy);
      if (d < 12 * (k || 1) && d < bd) { bd = d; best = r; }
    }
    return best;
  }
  function onDown(e) {
    if (!visible || (e.button != null && e.button > 0)) return;
    // a new first finger means no other finger is down: forget any that never reported lifting (iPad can drop a pointerup)
    if (e.pointerType === 'touch' && e.isPrimary) {
      if (touches.size) { touches.clear(); pinch = null; }
      if (press && press.pid !== e.pointerId) { if (press.kind === 'sprout' && press.mode === 'hold' && press.r.state === 'held') release(press.r); press = null; }
      if (drag && drag.pid !== e.pointerId) endDrag(e, true);
    }
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
    for (const o of eggsHere()) { const c = itemSpr('egg', o.e.kind); if (Math.hypot(p.x - o.x, p.y - (o.y - artH(c) / 2)) < Math.max(12, artH(c) / 2 + 2)) { closeCard(); tapEgg(o); return; } }
    for (const d of (drops[area] || []).slice().reverse()) if (Math.hypot(p.x - d.x, p.y - (d.y - 5 - d.z)) < 9) { collectDrop(d); return; }
    const sl = treeSlots();
    for (let i = 0; i < sl.length; i++) { const q = Lw.slots[i]; if (q && growK(sl[i]) >= 1 && Math.hypot(p.x - q.x, p.y - q.y) < 7.5) { press = Object.assign({ kind: 'tree', i, x0: p.x, y0: p.y }, base); return; } }
    const gl = groundList(area);
    for (let i = gl.length - 1; i >= 0; i--) { const f = gl[i]; if (Math.hypot(p.x - f.x, p.y - (f.y - 5)) < 7.5) { press = Object.assign({ kind: 'gfruit', f, x0: p.x, y0: p.y }, base); return; } }
    for (const c of critters) if (critterHit(c, p)) { catchCritter(c); return; }
    const r = sproutAt(p);
    if (r) { press = Object.assign({ kind: 'sprout', r, t0: t, x0: p.x, y0: p.y, mode: 'pending', rub: 0 }, base); return; }
    if (propAt(p) === 'gumball') { press = Object.assign({ kind: 'gumball' }, base); return; }
    if (overHome(p.x, p.y)) { press = Object.assign({ kind: 'home' }, base); return; }
    press = Object.assign({ kind: 'bg', prop: propHit(p), wx: p.x, wy: p.y, lx: e.clientX, ly: e.clientY, cam0: camX, cam0y: camY, vx: 0, vy: 0, lt: performance.now() }, base);
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
    if (pr.kind === 'home') { if (Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) < 12) { knockHome(); openHome(); } return; }
    if (pr.kind === 'gumball') { if (Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) < 12) { snd('pop'); PS.ui.go('shop', { tab: 'gumball' }); } return; }
    if (pr.kind === 'bg') {
      const dx = e.clientX - pr.sx, dy = e.clientY - pr.sy, ms = performance.now() - pr.ms;
      // a quick sideways swipe changes area, but only when the view can't scroll that way any more
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && ms < 700 && Math.abs(camX - pr.cam0) < 1) { switchArea(dx < 0 ? 1 : -1); return; }
      if (pr.panned) { if (performance.now() - pr.lt < 90) { camV.x = clamp(pr.vx, -600, 600); camV.y = clamp(pr.vy, -600, 600); } return; }
      closeCard();
      // tapping the scenery: a prop or tree reacts (a few hide a coin once a day), the sign wobbles, the lamp glows, the water splashes
      if (pr.wx != null && sceneryTap(pr)) { lastTapBg = null; return; }
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
    else if (!busy(r) && r.state !== 'eat' && r.state !== 'swim') { r.state = 'idle'; r.timer = 1.4; emote(r, pick(['!', 'heart', 'note']), 1); hop(r); if (!sproutCry(r)) snd('coo'); }
    openCard(r);
  }

  // ---------------- dragging (fruit / animals / tree fruit) ----------------
  function startDrag(src, id, e, idx, el) {
    closeCard();
    drag = { src, id, idx, el, pid: e.pointerId, hover: null };
    const s = src === 'pouch' ? critterSpr(id) : itemSpr('fruit', id);
    // (the bitmap is the sprite's fine size; the CSS size, the scale and drag.gw / gh are in art px)
    ghostEl.width = s.width; ghostEl.height = s.height;
    gctx.imageSmoothingEnabled = false; gctx.clearRect(0, 0, s.width, s.height); gctx.drawImage(s, 0, 0, s.width, s.height);
    const aw = artW(s), ah = artH(s), sc = Math.max(2, Math.floor(56 / Math.max(aw, ah)));
    ghostEl.style.width = aw * sc + 'px'; ghostEl.style.height = ah * sc + 'px';
    drag.gw = aw * sc; drag.gh = ah * sc;
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
    const c = document.createElement('canvas'); c.width = s.width; c.height = s.height; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, s.width, s.height);
    const aw = artW(s), ah = artH(s), sc = Math.max(1, Math.floor(38 / Math.max(aw, ah))); c.style.width = aw * sc + 'px'; c.style.height = ah * sc + 'px';
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
    } else openFruit(id);
  }

  // ---------------- fruit panel: tap a fruit in the tray to feed one or more to a Sprout here, or throw some away ----------------
  function feedMany(r, k, n) {
    if (n <= 1) { if (!ST.useFruit(k)) return 0; feedSprout(r, k); return 1; } // one: the usual snack
    let fed = 0;
    for (let i = 0; i < n; i++) { if (!ST.useFruit(k)) break; ST.feed(r.s, k); fed++; }
    if (!fed) return 0;
    const f = D.FRUITS[k]; // a big meal: one long munch, with the totals
    wake(r); r.state = 'eat'; r.timer = Math.min(3, 1.2 + fed * 0.25); r.eat = k; r.mood = null; r.target = null; emote(r, 'heart', 1.5); snd('munch'); markSeen('feed');
    for (const [st, v] of Object.entries(f.gives || {})) floaterFor(r, `+${v * fed} ${D.STAT_META[st].label}`, D.STAT_META[st].color);
    if (f.nature) floaterFor(r, f.nature > 0 ? 'Sun +' : 'Moon +', f.nature > 0 ? '#c7861c' : '#76428a');
    heartUp(r.x, r.y - 24); heartUp(r.x + 4, r.y - 20);
    return fed;
  }
  function openFruit(k) {
    const f = D.FRUITS[k]; if (!f) return;
    const have = () => (PS.S.fruits || {})[k] || 0;
    const eaters = () => here.filter(r => !busy(r) && PS.S.sprouts.includes(r.s));
    const list = eaters(), selR = sel && RT.get(sel);
    let who = (selR && list.includes(selR) ? selR : list.find(r => r.s.id === PS.S.activeId) || list[0] || null), n = 1, armed = 0;
    closeCard();
    const gains = m => Object.entries(f.gives || {}).map(([st, v]) => `<span class="chip-el" style="background:${D.STAT_META[st].color}">+${v * m} ${D.STAT_META[st].label}</span>`).join('')
      + (f.happy ? `<span class="chip-el" style="background:#e07ba0">+${f.happy * m} happy</span>` : '') + (f.nature ? `<span class="chip-el" style="background:${f.nature > 0 ? '#c7861c' : '#76428a'}">${f.nature > 0 ? 'Sun' : 'Moon'} +${Math.abs(f.nature) * m}</span>` : '');
    PS.ui.modal({
      eyebrow: 'Fruit', title: ST.esc(f.name), sprite: itemSpr('fruit', k),
      html: `<p>${ST.esc(f.desc)} You have <b class="g-fr-have">${have()}</b>.</p>
        ${list.length ? `${list.length > 1 ? '<div class="label">Who gets it?</div><div class="g-fr-who"></div>' : ''}
          <div class="g-fr-n"><button class="btn" type="button" data-fn="-1" aria-label="One less">−</button><b class="g-fr-count num">1</b><button class="btn" type="button" data-fn="1" aria-label="One more">+</button><button class="btn" type="button" data-fn="all">All</button></div>
          <div class="chips-list g-fr-gain"></div>`
        : `<p class="bk-ver">No Sprouts are out playing here. Visit an area with a Sprout to feed it, or throw fruit away.</p>
          <div class="g-fr-n"><button class="btn" type="button" data-fn="-1" aria-label="One less">−</button><b class="g-fr-count num">1</b><button class="btn" type="button" data-fn="1" aria-label="One more">+</button><button class="btn" type="button" data-fn="all">All</button></div>`}`,
      buttons: (list.length ? [{ label: 'Feed', kind: 'go', onClick: () => {
        if (!who || busy(who) || !PS.S.sprouts.includes(who.s)) { PS.ui.toast('That Sprout is busy right now.'); return true; }
        const fed = feedMany(who, k, Math.min(n, have())); if (!fed) return true;
        PS.ui.toast(fed > 1 ? `${who.s.name} ate ${fed} ${f.name}s! Yum!` : `${who.s.name} ate the ${f.name}. Yum!`, 2400);
      } }] : []).concat([{ label: 'Throw away', kind: 'danger', onClick: () => {
        if (Date.now() - armed > 3000) { armed = Date.now(); relabel(true); return true; }
        const gone = ST.discardFruit(k, Math.min(n, have())); snd('pop');
        PS.ui.toast(gone > 1 ? `Threw away ${gone} ${f.name}s.` : `Threw away the ${f.name}.`, 2200);
      } }, { label: 'Close' }]),
      mount(card) {
        const btns = [...card.querySelectorAll('.modal-btns button')], feedB = list.length ? btns[0] : null, tossB = btns[list.length ? 1 : 0];
        function relabel(ask) {
          const m = Math.min(n, have()), nm = who ? who.s.name : '';
          card.querySelector('.g-fr-count').textContent = m; card.querySelector('.g-fr-have').textContent = have();
          if (feedB) feedB.textContent = m > 1 ? `Feed ${nm} ×${m}` : `Feed ${nm}`;
          tossB.textContent = ask ? `Tap again to throw away ${m}` : m > 1 ? `Throw away ${m}` : 'Throw away';
          const g = card.querySelector('.g-fr-gain'); if (g) g.innerHTML = gains(m);
          card.querySelectorAll('.g-fr-who button').forEach(b => b.classList.toggle('on', !!who && b.dataset.sid === who.s.id));
        }
        openFruit.relabel = relabel;
        const whoBox = card.querySelector('.g-fr-who');
        if (whoBox) for (const r of list) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'g-fr-pick'; b.dataset.sid = r.s.id;
          b.innerHTML = `<canvas class="px"></canvas><span>${ST.esc(r.s.name)}</span>`; PS.ui.drawSproutTo(b.querySelector('canvas'), r.s, { eyes: 'happy', mouth: 'open' });
          b.onclick = () => { who = RT.get(r.s.id) || r; snd('tick'); relabel(false); }; whoBox.appendChild(b);
        }
        card.querySelectorAll('[data-fn]').forEach(b => b.onclick = () => {
          const v = b.dataset.fn; n = v === 'all' ? have() : Math.max(1, Math.min(have(), n + +v)); armed = 0; snd('tick'); relabel(false);
        });
        relabel(false);
      },
    });
    function relabel(ask) { if (openFruit.relabel) openFruit.relabel(ask); }
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
    card.spr.style.width = artW(c) * 2 + 'px'; card.spr.style.height = artH(c) * 2 + 'px';
    const x = card.spr.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0, c.width, c.height);
    card.name.textContent = s.name;
    card.sub.textContent = `${fi.name} · Lv ${ST.totalLevels(s)} · ${stateText(r)}`;
    card.tag.hidden = s.id !== PS.S.activeId;
    D.STATS.forEach((k, i) => {
      const st = s.stats[k], row = card.stats[i];
      row.lv.textContent = st.lv;
      row.bar.style.width = Math.round(clamp(st.xp / D.GROWTH.xpForLevel(st.lv), 0, 1) * 100) + '%';
    });
    card.happy.style.width = Math.round(s.happy) + '%';
    const hb = ST.happyBonus && ST.happyBonus(s) > 1, hbText = hb ? '♥ +10% XP' : 'Pet me!';
    if (card.hb.textContent !== hbText) { card.hb.textContent = hbText; card.hb.classList.toggle('on', hb); }
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
    const rest = PS.S.sprouts.filter(s => s.area === area && s.home).length;
    pillName.textContent = A.name;
    pillSub.textContent = `${n} Sprout${n === 1 ? '' : 's'}${rest ? ` · ${rest} resting` : ''}${e ? ` · ${e} egg${e === 1 ? '' : 's'}` : ''} · ${A.water}`;
    [...dotsEl.children].forEach((d, i) => { d.className = AREA_IDS[i] === area ? 'on' : PS.S.eggs.some(x => x.area === AREA_IDS[i]) ? 'egg' : ''; });
    root.querySelectorAll('.g-arrow').forEach(b => { const a = AREA_IDS[(AREA_IDS.indexOf(area) + (+b.dataset.d) + AREA_IDS.length) % AREA_IDS.length]; b.setAttribute('aria-label', 'Go to ' + areaName(a)); });
  }
  function hintText() {
    const eggs = PS.S.eggs.filter(e => e.area === area);
    const mine = PS.S.sprouts.filter(isOut);
    if (eggs.length) { const e = eggs[0], left = eggNeed(e) - (e.taps || 0); return left <= 0 ? 'Here it comes!' : e.taps ? `Keep tapping! ${left} more` : 'Tap the egg to hatch it'; }
    if (!PS.S.sprouts.length) { const e = PS.S.eggs[0]; return e ? `Your egg is waiting in ${toArea(e.area)}` : 'Get an egg from the Shop'; }
    if (!mine.length) return PS.S.sprouts.some(s => s.area === area) ? `Everyone is resting in the ${ST.homeName(area)}. Tap it to call them out.` : `No Sprouts live here yet. Send one swimming from another area.`;
    if (here.some(r => r.state === 'held')) return 'Drop in the shallows to swim, or in the deep water to travel';
    // the first-session lessons, in order: pet, feed, catch, give (the pointing hand shows each one)
    if (!seen('pet')) return 'Rub your Sprout with your finger to pet it';
    if (!seen('feed')) { if (hintTree() >= 0) return 'Drag a fruit from the tree onto your Sprout'; if (Object.values(PS.S.fruits || {}).some(n => n > 0)) return 'Drag a fruit from your tray onto your Sprout'; }
    if (ST.canCatch() && !seen('catch')) return critters.length ? 'An animal! Tap it to catch it' : 'Animals visit the garden. Watch for one!';
    if (PS.S.pouch.length && !seen('give')) return 'Drag the animal from your pouch onto your Sprout';
    if ((drops[area] || []).length && !seen('drop')) return 'Something sparkly! Tap it';
    if (!seen('hold')) return 'Press and hold a Sprout to pick it up';
    if (!seen('swim')) return 'Drop a Sprout in the shallows to swim';
    if (!seen('travel')) return 'Drop a Sprout in the deep water to travel';
    if (!seen('zoom')) return 'Pinch with two fingers to zoom in and out';
    if (!seen('drop-fruit') && Object.keys(PS.S.fruits || {}).length) return 'Drag fruit onto the grass to leave a snack';
    if (!seen('area')) return 'Use the arrows to visit other areas';
    if (!seen('home') && Lw.home) return `Tap the ${ST.homeName(area)} to let Sprouts rest inside`;
    return '';
  }
  // ---------------- first-session guide: one lesson at a time, with a pointing hand (many players can't read yet) ----------------
  const learning = () => !seen('pet') || !seen('feed') || !seen('catch') || !seen('give');
  // returns what to point at: {mode:'tap'|'rub'|'drag', x, y, x2?, y2?} in world px, {mode:'tray', el} for a tray slot, or null
  function guide() {
    if (!cardEl || !cardEl.hidden || drag || pinch || here.some(r => r.state === 'held') || PS.ui.modalOpen) return null;
    const eggs = eggsHere();
    if (!PS.S.sprouts.length) { const o = eggs[0]; if (!o) return null; const c = itemSpr('egg', o.e.kind); return { mode: 'tap', x: o.x, y: o.y - artH(c) + 3 }; }
    if (!learning()) return null;
    const r = here.find(q => !busy(q) && q.state !== 'eat' && inView(q.x, q.y - 10, 0));
    if (!seen('pet')) return r ? { mode: 'rub', x: r.x, y: r.y - 12 } : null;
    if (!seen('feed')) {
      const sl = treeSlots();
      if (r) for (let i = 0; i < Lw.slots.length; i++) { const q = Lw.slots[i]; if (q && sl[i] && growK(sl[i]) >= 1 && inView(q.x, q.y, 4)) return { mode: 'drag', x: q.x, y: q.y + 2, x2: r.x, y2: r.y - 10 }; }
      return Object.values(PS.S.fruits || {}).some(n => n > 0) ? { mode: 'tray', el: fruitStrip.querySelector('.g-slot') } : null;
    }
    if (!seen('catch') && ST.canCatch()) { const c = critters.find(q => inView(q.x, q.y - 6, 0)); return c ? { mode: 'tap', x: c.x, y: c.y - (c.where === 'water' ? 7 : 12) } : null; }
    if (!seen('give') && PS.S.pouch.length) return { mode: 'tray', el: pouchStrip.querySelector('.g-slot') };
    return null;
  }
  // drawn at display resolution so it stays big and crisp at any zoom (HS css px per hand pixel); gd is in world px
  const HS = 4;
  function drawHand(gd) {
    let x = gd.x, y = gd.y, lift = 0;
    if (gd.mode === 'tap') lift = Math.abs(Math.sin(t * 4)) * 14;
    if (gd.mode === 'rub') x += Math.sin(t * 6) * 6;
    let carry = false;
    if (gd.mode === 'drag') { // press on the fruit, glide to the Sprout, let go
      const k = (t * 0.5) % 1; if (k > 0.88) return;
      const e = clamp((k - 0.18) / 0.62, 0, 1), ee = e * e * (3 - 2 * e);
      x = lerp(gd.x, gd.x2, ee); y = lerp(gd.y, gd.y2, ee); carry = k > 0.18;
    }
    const p = worldToScreen(x, y), hs = handSprite();
    ctx.imageSmoothingEnabled = false;
    if (carry) { const f = itemSpr('fruit', 'apple'), fz = Math.max(2, Math.round(Z)); ctx.globalAlpha = 0.75; ctx.drawImage(f, Math.round(p.x - artW(f) * fz / 2), Math.round(p.y - artH(f) * fz - 8), artW(f) * fz, artH(f) * fz); ctx.globalAlpha = 1; }
    ctx.drawImage(hs, Math.round(p.x - 5 * HS), Math.round(p.y - 11.5 * HS - lift), artW(hs) * HS, artH(hs) * HS);
  }
  // the same hand as a little overlay on a tray slot, sliding up towards the garden ("drag it up")
  function placeTrayHand(gd) {
    if (!handEl) return;
    const el = gd && gd.mode === 'tray' && gd.el;
    hintEl.classList.toggle('g-hint-up', !!el); // make room for the hand above the tray
    if (!el) { if (!handEl.hidden) handEl.hidden = true; return; }
    const r = root.getBoundingClientRect(), b = el.getBoundingClientRect(), up = ((t * 0.7) % 1) * 46;
    handEl.style.transform = `translate(${Math.round(b.left - r.left + b.width / 2 - 20)}px, ${Math.round(b.top - r.top - 34 - up)}px)`;
    handEl.style.opacity = up > 38 ? 0.3 : 1; handEl.hidden = false;
  }
  // animals that wandered in off-screen: a bouncing arrow at the edge points the way
  function drawCritterArrows() {
    if (!critters.length || pinch) return;
    const trayH = trayEl.offsetHeight || 110, top = 86, bot = H - trayH - 24;
    for (const c of critters) {
      if (inView(c.x, c.y - 6, -4)) continue;
      const p = worldToScreen(c.x, c.y - 6), X = clamp(p.x, 22, W - 22), Y = clamp(p.y, top, bot), a = Math.atan2(p.y - Y, p.x - X), b = Math.sin(t * 6) * 3;
      const cx = X + Math.cos(a) * b, cy = Y + Math.sin(a) * b;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.closePath();
      ctx.fillStyle = '#ffcc44'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    }
  }
  function switchArea(dir) { const i = AREA_IDS.indexOf(area); setArea(AREA_IDS[(i + dir + AREA_IDS.length) % AREA_IDS.length], dir); }
  function settleAll() {
    press = null;
    for (const r of here) {
      if (r.state === 'enter') { finishInside(r); continue; }
      if (r.state === 'travel') { finishMove(r.s, r.dest); continue; }
      if (r.state === 'held' || r.state === 'fall') { r.y = r.state === 'held' ? heldGround(r) : clamp(r.y, Lw.minY, Lw.maxY); r.z = 0; r.state = inWater(r.x, r.y) ? 'swim' : 'idle'; r.timer = 1; }
      if (r.state === 'eat' || r.state === 'cocoon' || r.state === 'arrive') { r.state = 'idle'; r.eat = null; r.timer = 1; }
      if (r.state === 'wait') r.state = 'swim';
    }
  }
  function setArea(a, dir) {
    if (!D.AREAS[a]) a = 'meadow';
    if (a === area) return;
    finishHatches(); eggBits = []; flashT = 0; zoomBack = null;
    settleAll(); flushAll();
    area = a; PS.S.area = a; PS.save(); PS.emit('area', { area: a });
    critters = []; fizz = []; parts = []; floaters = [];
    nextCritter = t + rand(...D.GROWTH.critterEverySec) * 0.35;
    here = PS.S.sprouts.filter(isOut).map(getRT);
    closeCard(); buildProps(); skyKey = ''; bgKey = ''; focusCamera(); hintReset = true;
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
.g-pill span{display:block;font-size:13px;color:var(--ink-soft);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-dots{display:flex;gap:5px;justify-content:center;margin-top:3px}
.g-dots i{width:7px;height:7px;border-radius:2px;background:var(--line)}
.g-dots i.on{background:var(--sun-edge)}.g-dots i.egg{background:var(--berry)}
.g-tray{position:absolute;left:8px;right:8px;bottom:8px;padding:6px 8px 7px;z-index:3;display:grid;gap:3px}
.g-row{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:6px}
.g-rl{font-family:var(--f-ui);font-weight:600;font-size:13.5px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;line-height:1.15}
.g-rl span{display:block;font-family:var(--f-ui);font-weight:700;color:var(--ink);font-size:13px;letter-spacing:0;text-transform:none}
.g-rl span.g-full{color:var(--berry)}
.g-strip{display:flex;gap:7px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x;scrollbar-width:none;padding:3px 6px 5px 2px;min-height:50px;align-items:center;overscroll-behavior-x:contain}
.g-strip::-webkit-scrollbar{display:none}
.g-slot{flex:0 0 auto;position:relative;width:44px;height:44px;border-radius:12px;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;display:grid;place-items:center;padding:0;touch-action:pan-x;cursor:grab;-webkit-touch-callout:none}
.g-slot canvas{image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none;display:block}
.g-slot.g-rare{background:#fff4c2;border-color:#e0a800;box-shadow:inset 0 0 0 2px #fff27a}
.g-slot.g-lift{opacity:.35}
.g-slot .g-n{position:absolute;right:-5px;bottom:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--ink);color:var(--panel);font:700 13px/18px var(--f-ui);font-style:normal;text-align:center;padding:0 4px}
.g-empty{font-size:13px;color:var(--ink-soft);font-weight:600;padding-left:2px;white-space:nowrap}
.g-ghost{position:absolute;left:0;top:0;pointer-events:none;z-index:30;transform:translate(-999px,-999px);image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 4px 0 rgba(34,32,52,.25))}
.g-hint{z-index:3;width:max-content;max-width:calc(100% - 40px)}
.g-fr-who{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.g-fr-pick{display:flex;align-items:center;gap:4px;border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;background:var(--field);padding:2px 10px 2px 2px;font:600 15px var(--f-ui);color:var(--ink)}
.g-fr-pick.on{background:#fff4c2;border-color:var(--sun-edge)}
.g-fr-pick canvas{width:40px;height:40px}
.g-fr-n{display:flex;align-items:center;gap:8px;margin:4px 0 8px}
.g-fr-n .btn{min-width:48px;padding:8px 10px;font-size:18px}
.g-fr-n .btn[data-fn="all"]{font-size:15px}
.g-fr-count{min-width:36px;text-align:center;font-size:24px}
.g-hint.g-hint-up{transform:translate(-50%,-58px)}
.g-hand{position:absolute;left:0;top:0;width:44px;height:48px;z-index:7;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 2px 0 rgba(34,32,52,.3))}
.g-card{position:absolute;left:8px;right:8px;bottom:8px;z-index:6;padding:10px 12px 12px;animation:gUp .2s ease-out;box-shadow:0 -6px 24px rgba(60,44,24,.25)}
@keyframes gUp{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}
.g-ch{display:flex;align-items:center;gap:10px}
.g-ch canvas{image-rendering:pixelated;image-rendering:crisp-edges;flex:0 0 auto;margin:-6px 0 -4px}
.g-cid{flex:1;min-width:0}
.g-cname{font-size:22px;display:flex;align-items:center;gap:8px}
.g-tag{font-family:var(--f-ui);font-weight:600;font-size:13.5px;background:var(--sun);border:2px solid var(--sun-edge);color:#4a3210;border-radius:8px;padding:0 6px;line-height:16px}
.g-csub{font-size:13px;color:var(--ink-soft);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-x{width:40px;height:40px;border-radius:12px;border:2px solid var(--line);background:var(--slot);display:grid;place-items:center;padding:0;flex:0 0 auto;align-self:flex-start}
.g-cstats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0 6px}
.g-st{font-family:var(--f-ui);font-weight:600;font-size:13.5px;text-align:center;line-height:1.2}
.g-st b{display:block;font-family:var(--f-ui);font-size:15px;color:var(--ink)}
.g-mb{height:6px;border-radius:3px;background:var(--slot);border:1px solid var(--line);overflow:hidden;margin-top:2px}
.g-mb i{display:block;height:100%;width:0}
.g-cmood{display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink-soft);margin-bottom:10px}
.g-hb{font-size:13.5px;white-space:nowrap}.g-hb.on{color:#c0407a}
.g-cmood .bar{height:9px}
.g-cbtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.g-cbtns .btn{padding:9px 6px;font-size:15px;min-height:44px}
.g-cbtns .btn[disabled]{opacity:.6}
.g-dest{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.g-destbtn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:9px 10px;background:var(--field);min-height:56px}
.g-destbtn b{font-family:var(--f-ui);font-size:16.5px}
.g-destbtn small{font-size:13px;color:var(--ink-soft);font-weight:600}
.g-destbtn[disabled]{opacity:.5}
.g-home{display:grid;gap:6px;margin-top:4px;max-height:52vh;overflow-y:auto}
.g-hh{font-family:var(--f-ui);font-size:16px;margin:6px 0 0}
.g-hempty{font-size:13px;color:var(--ink-soft);margin:0}
.g-zoom{position:absolute;top:60px;right:8px;z-index:3;width:52px;height:52px;border-radius:50%;background:var(--panel);border:2px solid var(--edge);border-bottom-width:5px;display:grid;place-items:center;padding:0;color:var(--ink);box-shadow:0 3px 0 rgba(60,44,24,.14);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.g-zoom:active{transform:translateY(2px);border-bottom-width:3px}
.g-zoom svg{width:30px;height:30px;display:block}
.g-zoom .g-zi-in{display:none}.g-zoom.g-far .g-zi-in{display:inline}
.g-zoom.g-far{background:#fff4c2;border-color:var(--sun-edge)}
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
      <button class="g-zoom" type="button" aria-label="See the whole garden"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
        <path fill="#cfeefa" d="M4 3h5v1h1v5h-1v1H4V9H3V4h1z"/><path fill="#ffffff" d="M4 4h2v1H4z"/>
        <path d="M4 1h5v2H4zM4 10h5v2H4zM1 4h2v5H1zM10 4h2v5h-2zM2 2h2v2H2zM9 2h2v2H9zM2 9h2v2H2zM9 9h2v2H9zM11 11h2v2h-2zM12 12h2v2h-2zM13 13h2v2h-2z"/>
        <path d="M4 6h5v1H4z"/><path class="g-zi-in" d="M6 4h1v5H6z"/></svg></button>
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
        <div class="g-cmood"><span>Happy</span><div class="bar"><i class="g-hp" style="background:#e07ba0"></i></div><span class="g-hb"></span></div>
        <div class="g-cbtns"><button class="btn" data-a="travel" type="button">Travel</button><button class="btn" data-a="partner" type="button">Set partner</button><button class="btn primary" data-a="details" type="button">Details</button></div>
      </section>
      <canvas class="g-ghost" width="18" height="18"></canvas>
      <canvas class="g-hand" width="11" height="12" hidden aria-hidden="true"></canvas>`;
    const q = s => root.querySelector(s);
    cv = q('.g-cv'); ctx = cv.getContext('2d');
    buf = document.createElement('canvas'); bx = buf.getContext('2d');
    skyC = document.createElement('canvas'); skx = skyC.getContext('2d');
    bgC = document.createElement('canvas'); bgx = bgC.getContext('2d');
    pillName = q('.g-pill b'); pillSub = q('.g-pill span'); dotsEl = q('.g-dots');
    trayEl = q('.g-tray'); pouchStrip = q('.g-pouch'); fruitStrip = q('.g-fruit'); pouchCnt = q('.g-pc');
    hintEl = q('.g-hint'); cardEl = q('.g-card'); ghostEl = q('.g-ghost'); gctx = ghostEl.getContext('2d');
    handEl = q('.g-hand'); { const hs = handSprite(), hx = handEl.getContext('2d'); handEl.width = hs.width; handEl.height = hs.height; hx.imageSmoothingEnabled = false; hx.drawImage(hs, 0, 0, hs.width, hs.height); }
    card.spr = q('.g-ch canvas'); card.name = q('.g-nm'); card.tag = q('.g-tag'); card.sub = q('.g-csub');
    card.stats = [...root.querySelectorAll('.g-st')].map(el2 => ({ lv: el2.querySelector('b'), bar: el2.querySelector('.g-mb i') }));
    card.happy = q('.g-hp'); card.hb = q('.g-hb'); card.partner = q('[data-a="partner"]');
    cardEl.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) cardAction(b.dataset.a); });
    root.querySelectorAll('.g-arrow').forEach(b => b.addEventListener('click', () => { PX.Sound.unlock(); closeCard(); switchArea(+b.dataset.d); }));
    zoomBtn = q('.g-zoom');
    zoomBtn.addEventListener('click', e => { e.stopPropagation(); PX.Sound.unlock(); closeCard(); toggleFar(); });
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
    PS.on('reset', () => { RT.clear(); hatchFx.clear(); eggBits = []; critters = []; for (const k in drops) delete drops[k]; for (const k in ground) delete ground[k]; closeCard(); renderTray(); shownOnce = false; });
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
    here = PS.S.sprouts.filter(isOut).map(getRT);
    if (!shownOnce) { shownOnce = true; focusCamera(); }
    hintReset = true;
    if (params && params.id) { const s = ST.get(params.id); if (s && s.area === area && s.home && Lw.home) { camX = Lw.home.x - viewW() / 2; camY = Lw.home.y - 20 - viewH() * 0.45; clampCam(); } else if (s && s.area === area) { const r = getRT(s); openCard(r); camX = r.x - viewW() / 2; camY = r.y - viewH() * 0.45; clampCam(); } }
  }
  let shownOnce = false;
  function hide() {
    visible = false;
    if (drag) { ghostEl.style.transform = 'translate(-999px,-999px)'; if (drag.el) drag.el.classList.remove('g-lift'); drag = null; }
    if (trayPress) { clearTimeout(trayPress.timer); trayPress = null; }
    touches.clear(); pinch = null; lastClient.on = false; camV.x = camV.y = 0;
    finishHatches(); eggBits = []; flashT = 0;
    if (hatchWait) { hatchWait = 0; setTimeout(musicBack, 0); }
    settleAll(); flushAll(); saveGround(); closeCard(); PS.save();
  }
  function frame(dt, tt) {
    if (!visible) return;
    t = tt;
    checkSize(); if (!ww) return;
    updateCamera(dt);
    update(dt);
    guideNow = guide();
    render(dt);
    syncZoomBtn(false);
    placeTrayHand(guideNow);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.4;
      // hints pop up briefly on arrival; the holding hint, a new player's first-egg hint and the first lessons stay while they apply
      if (hintReset) { hintReset = false; hintUntil = t + 4; }
      const holding = here.some(r => r.state === 'held'), firstEgg = !PS.S.sprouts.length && PS.S.eggs.some(e => e.area === area);
      const lesson = here.length && learning() && !PS.ui.modalOpen;
      const h = !cardEl.hidden ? '' : holding ? 'Drop in the shallows to swim, in deep water to travel, or on the house to rest' : (firstEgg || lesson || t < hintUntil) ? hintText() : '';
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
    paintBg() { const t0 = performance.now(); paintLand(); const t1 = performance.now(); paintSky(PS.clock.night()); return [Math.round(t1 - t0), Math.round(performance.now() - t1)]; },
    propHit, funProp, sceneryTap, toggleFar, get fun() { return PS.S.gardenFun; }, get parts() { return parts.length; }, get hatching() { return hatchFx.size; }, shootStar() { shoot.life = 0; nextShoot = t + 0.01; },
    spawnCritter, spawnDrop, setArea, switchArea, eggsHere, tapEgg, treeSlots, feedSprout, giveAnimal, startTravel, askTravel, openCard, closeCard,
    toScreen: (x, y) => { const r = cv.getBoundingClientRect(), p = worldToScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; },
  };
})();
