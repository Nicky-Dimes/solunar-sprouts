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
    // camera: at zoomMin the screen shows about worldW x worldH world px (it fits worldW across or worldH down, whichever is
    // smaller, so a landscape iPad isn't zoomed right in). The garden itself is mapW x mapH that view (a big garden to explore,
    // like PVZ Garden's), and zooming all the way out (the magnifier, a double tap) shows the whole of it at once. You start at
    // zoomDef x zoomMin (the same close-up size as before) and can pinch between. Sprouts wander a little at a time (up to
    // wander px a walk) and drift back toward the heart of their garden (the house) when they're more than homeRange px from
    // it, so a small child can always find them.
    worldW: 280, worldH: 250, mapW: 2.05, mapH: 1.7, zoomMinPx: 1.5, zoomDef: 1.6, zoomMax: 4, edgePan: 90, smellRange: 85, maxGroundFruit: 12,
    wander: 80, homeRange: 190,
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
  // Layout of the big garden. Positions are [u, v]: u = share of the lawn's width at that height (0 = the left edge, 1 = the sand
  // by the water), v = share of the lawn's height (0 = the back, by the hills; 1 = the front). tree0: the main fruit tree (its 3
  // fruit slots are the ones old saves have); fruitTrees: the other fruit trees, in the order their saved slots come (new trees
  // only ever go on the end); home: the rest house; nest: where eggs wait; ponds: [u, v, rx, ry] little ponds (world px);
  // paths: [from, to, bend] between 'tree', 'home', 'dock', 'pond' or a [u, v] point; props: single pieces of scenery;
  // groups: [u, v, [[kind, dx, dy], ...]] little scenes (offsets in world px); sprinkle: [kind, weight] for the seeded scatter
  // that fills the rest (it never covers the house, trees, ponds, paths, the nest or another prop). Night is an overlay colour
  // (rgb + max alpha).
  // mount/far/near: distant scenery layers. grass: 4 ground tones (light..dark) for the lawn's soft patches. deco: which ground
  // details to scatter. Restyled Nov 2026 after the family's mockups (pocket-sprout/_ai/garden-mockups.webp): brighter, more
  // saturated ground, water and sky, and a fuller garden. dens: lawn px² per scattered prop (smaller = fuller); flowers: [petal,
  // middle] colours of the painted flower clusters; pathStyle: 'sand' (a wide sandy path) or 'dots' (a dotted trail, pathGap px
  // apart); sandW: the shore's sand width [back, front] in world px; shadowC: the colour painted under the scenery.
  const TH = {
    meadow: {
      sky: ['#1c9ff5', '#3cb3f7', '#66c7f9', '#9edcfb'], skyN: ['#1a1d48', '#222a5a', '#2c366c', '#3a4580'],
      mount: ['#c4eaf8', '#96d2ee', '#6cb4dc'], snow: '#ffffff', mountAmp: 22, mountShape: 'peak',
      far: ['#7ccd40', '#4fa82c'], farDots: ['#3f9a26', '#66c43a', '#2c7c1e'], near: ['#8ed83a', '#5fb024'], nearDots: ['#479c22', '#7fd040'],
      lawn: ['#9ee034', '#5ca61a'], grass: ['#a8e63e', '#98dc2a', '#8ad21e', '#7cc418'], blade: '#5ea818', bladeHi: '#c8f25a', shade: '#5fae18', patch: 1.6,
      dots: ['#ffffff', '#ffe23a', '#ff9ec8', '#c49cf4'], dotC: '#f6a21a', sand: '#f9e490', wet: '#ecca72', sandEdge: '#d6ae58',
      water: ['#6af0fb', '#26d2f6', '#0aa6ee', '#0a84e0'], foam: '#ffffff', hl: '#d8fbff', cloud: ['#ffffff', '#e2f0fe', '#bcd8f4'],
      path: ['#fff6c8', '#f4df98', '#d9b568'], pathStyle: 'sand', sandW: [8, 15], shadowC: '#3d8c12', singles: [0, 0, 1, 0, 2, 0, 3, 1],
      flowers: [['#ffffff', '#ffc21e'], ['#ffe23a', '#f08a1a'], ['#ff9ec8', '#ffe23a'], ['#c49cf4', '#fff27a'], ['#8cc4ff', '#ffffff'], ['#ff6a6a', '#ffe23a']],
      night: [20, 18, 64, 0.36], dim: 0, tree: 'bigtree', house: true, deco: 'meadow', fish: '32,70,120', dens: 3100,
      tree0: [0.2, 0.1], home: ['shroomhouse', 0.5, 0.44], nest: [0.68, 0.53],
      fruitTrees: [['tree', 0.86, 0.2], ['tree', 0.07, 0.52], ['tree', 0.3, 0.72], ['tree', 0.8, 0.9]],
      ponds: [[0.2, 0.9, 25, 11]], paths: [['tree', 'dock', 0.18], ['tree', 'home', -0.24], ['home', 'pond', 0.2]],
      props: [['bench', 0.34, 0.27], ['bench', 0.66, 0.26], ['bench', 0.27, 0.58], ['bench', 0.7, 0.75], ['bench', 0.47, 0.93], ['lamp', 0.4, 0.47],
        ['lamp', 0.58, 0.3], ['lamp', 0.22, 0.8], ['stump', 0.13, 0.38], ['stump', 0.9, 0.83], ['rock', 0.22, 0.34], ['rock', 0.04, 0.68], ['rock', 0.55, 0.63],
        ['rock', 0.93, 0.36], ['rock', 0.46, 0.05], ['rock', 0.72, 0.1], ['rock', 0.37, 0.7], ['rock', 0.12, 0.97], ['rock', 0.82, 0.98],
        ['tree', 0.5, 0.16], ['tree', 0.04, 0.1], ['bigtree', 0.95, 0.03], ['tree', 0.4, 0.37], ['tree', 0.16, 0.63], ['tree', 0.62, 0.87], ['bigtree', 0.93, 0.58],
        ['bush', 0.47, 0.0], ['bush', 0.5, 0.97], ['bush', 0.96, 0.44], ['flowerbed', 0.08, 0.96], ['mushrooms', 0.6, 0.64]],
      groups: [[0.74, 0.35, [['bench', -2, -10], ['bush', 14, 2], ['rock', -16, 4]]], [0.44, 0.84, [['bench', 0, 0], ['lamp', 13, -1]]],
        [0.09, 0.22, [['stump', 0, 0], ['mushrooms', 10, 4], ['rock', -10, 5]]], [0.92, 0.66, [['rock', 0, 0], ['rock', 10, 4], ['bush', -11, 3]]],
        [0.6, 0.8, [['tree', 0, 0], ['bush', 15, 5], ['rock', -15, 6]]], [0.36, 0.2, [['bush', 0, 0], ['flowerbed', 15, 3]]],
        [0.12, 0.74, [['tree', 0, 0], ['tree', 20, 7]]], [0.84, 0.48, [['bigtree', 0, 0], ['rock', 18, 4]]]],
      sprinkle: [['tree', 7], ['rock', 5], ['bigtree', 2], ['bench', 2], ['bush', 2], ['stump', 1], ['lamp', 0.8], ['flowerbed', 1], ['mushrooms', 1]],
    },
    beach: {
      sky: ['#1c9ff5', '#3cb3f7', '#66c7f9', '#a6e0fb'], skyN: ['#14214a', '#1c2d5e', '#243a70', '#2f4a82'],
      far: ['#86cc56', '#58a83a'], farDots: ['#3f8a36', '#7cc450', '#2f7a30'], near: ['#f8e6a6', '#e6c47a'], nearDots: ['#d8b066', '#fff6d0'],
      lawn: ['#fbeab4', '#e2bf76'], grass: ['#fef1c2', '#fbe8ac', '#f8e09e', '#f4d690'], blade: '#e2b866', bladeHi: '#fffbe6', shade: '#e6c070', patch: 1.2,
      dots: ['#ff9ec0', '#ffffff', '#ffb070', '#fff4dc'], dotC: '#f07aa0', sand: '#f7dc8c', wet: '#e6bd6c', sandEdge: '#d4a85a',
      water: ['#62ecf4', '#20cce8', '#0a9ade', '#0878cc'], foam: '#ffffff', hl: '#d8fbff', cloud: ['#ffffff', '#e2f0fe', '#bcd8f4'],
      path: ['#f4dcaa', '#dcac6c', '#b07c46'], pathStyle: 'dots', pathGap: 5.6, pathR: 1.9, sandW: [6, 13], shadowC: '#cf9f4c',
      night: [20, 18, 64, 0.36], dim: 0, tree: 'palm', surf: true, openSea: true, deco: 'beach', fish: '20,60,120', dens: 3200,
      tree0: [0.16, 0.1], home: ['beachhut', 0.32, 0.46], nest: [0.52, 0.52],
      fruitTrees: [['palm', 0.07, 0.32], ['palm', 0.06, 0.78], ['palm', 0.56, 0.68], ['palm', 0.84, 0.12]],
      ponds: [[0.66, 0.9, 24, 10]], paths: [['tree', 'home', -0.22], ['home', 'pond', 0.22]],
      props: [['umbrella', 0.44, 0.04], ['shells', 0.1, 0.6], ['shells', 0.34, 0.3], ['umbrella', 0.12, 0.94], ['driftwood', 0.22, 0.72], ['ball', 0.28, 0.08],
        ['towel', 0.48, 0.05], ['rock', 0.97, 0.3], ['shells', 0.96, 0.72], ['bucket', 0.7, 0.58], ['sandcastle', 0.04, 0.5],
        ['palm', 0.3, 0.17], ['palm', 0.46, 0.3], ['palm', 0.74, 0.44], ['palm', 0.2, 0.57], ['palm', 0.42, 0.78], ['palm', 0.92, 0.62], ['palm', 0.27, 0.95],
        ['rock', 0.6, 0.36], ['rock', 0.36, 0.62], ['rock', 0.8, 0.8], ['rock', 0.14, 0.42], ['sandcastle', 0.62, 0.12], ['sandcastle', 0.5, 0.41], ['umbrella', 0.76, 0.3]],
      groups: [[0.72, 0.3, [['umbrella', 0, 0], ['towel', 13, 3], ['ball', -13, 4]]], [0.24, 0.6, [['umbrella', 0, 0], ['towel', 12, 4]]],
        [0.36, 0.84, [['sandcastle', 0, 0], ['bucket', 13, 3], ['shells', -12, 4]]], [0.92, 0.48, [['rockpool', 0, 0], ['rock', 13, 4], ['shells', -11, 5]]],
        [0.9, 0.82, [['surfboard', 0, 0], ['driftwood', -15, 5]]], [0.58, 0.2, [['palm', 0, 0], ['shells', 13, 3]]],
        [0.24, 0.24, [['palm', 0, 0], ['rock', 14, 4]]], [0.8, 0.66, [['umbrella', 0, 0], ['towel', 12, 4], ['ball', -11, 5]]]],
      sprinkle: [['palm', 6], ['rock', 4], ['umbrella', 2], ['sandcastle', 1.5], ['shells', 2], ['towel', 1], ['bucket', 1], ['ball', 1], ['driftwood', 0.7], ['surfboard', 0.4]],
    },
    moonlit: {
      sky: ['#24187e', '#33229a', '#4a2eae', '#6a3ebe'], skyN: ['#110e2e', '#19153e', '#231c50', '#2f2462'],
      mount: ['#5a4cb4', '#3f3496', '#2a2274'], snow: '#c8bcff', mountAmp: 24, mountShape: 'spire',
      far: ['#1a3e62', '#102c48'], farDots: ['#0a2440', '#1c4868', '#061a30'], near: ['#14686e', '#0b4c54'], nearDots: ['#083e48', '#1a7a78'],
      lawn: ['#1e9a98', '#0e626a'], grass: ['#26a4a0', '#1c9696', '#15888c', '#0f7a82'], blade: '#0e6670', bladeHi: '#6ff0e0', shade: '#0d6670', patch: 1.5,
      dots: ['#9fe8ff', '#e0a8ff', '#a6f2d3', '#fff6a0'], dotC: '#ffffff', sand: '#a69ed6', wet: '#8078c0', sandEdge: '#6a62a8',
      water: ['#5464da', '#3a48c4', '#2c38aa', '#1e2892'], foam: '#c8d4ff', hl: '#aab8ff', cloud: ['#9a88c8', '#7e6cb0', '#665498'],
      path: ['#f8ecff', '#e2bef8', '#9c70cc'], pathStyle: 'dots', pathR: 2.15, pathGap: 6.8, sandW: [3, 7], shadowC: '#08404a', pondW: ['#8cf2ff', '#40b8f2', '#3a5ed6'],
      flowers: [['#9fd8ff', '#ffffff'], ['#e0b0ff', '#fff6c0'], ['#a6f2d3', '#ffffff'], ['#ffb8e8', '#fff27a']],
      night: [26, 14, 60, 0.32], dim: 0.07, tree: 'glowtree', bigMoon: true, deco: 'moonlit', fish: '10,10,40', dens: 3600,
      tree0: [0.2, 0.12], home: ['crystalcave', 0.46, 0.5], nest: [0.64, 0.58],
      fruitTrees: [['glowtree', 0.09, 0.66], ['glowtree', 0.84, 0.66], ['glowtree', 0.8, 0.14]],
      ponds: [[0.25, 0.88, 24, 11]], paths: [['tree', 'dock', 0.2], ['tree', 'home', -0.2], ['home', 'pond', 0.2]],
      props: [['crystal', 0.44, 0.0], ['glowshroom', 0.17, 0.5], ['lantern', 0.42, 0.9], ['glowshroom', 0.62, 0.42], ['crystal', 0.07, 0.96], ['lantern', 0.31, 0.3],
        ['mushrooms', 0.13, 0.82], ['moonstone', 0.12, 0.36], ['fern', 0.32, 0.68], ['fern', 0.04, 0.2], ['moonstone', 0.97, 0.96], ['lantern', 0.66, 0.24],
        ['glowtree', 0.48, 0.14], ['glowtree', 0.04, 0.04], ['glowtree', 0.36, 0.42], ['glowtree', 0.66, 0.84], ['glowtree', 0.95, 0.42], ['lantern', 0.56, 0.62],
        ['crystal', 0.28, 0.58], ['crystal', 0.75, 0.52], ['moonstone', 0.58, 0.04], ['glowshroom', 0.88, 0.76], ['glowshroom', 0.4, 0.76]],
      groups: [[0.84, 0.36, [['crystal', 0, 0], ['crystal', 11, 4], ['moonstone', -11, 4]]], [0.1, 0.42, [['glowshroom', 0, 0], ['mushrooms', 11, 4], ['fern', -11, 3]]],
        [0.6, 0.86, [['fern', 0, 0], ['fern', 13, 3], ['moonstone', -12, 4]]], [0.93, 0.84, [['moonstone', 0, 0], ['crystal', 11, 3]]],
        [0.54, 0.22, [['glowtree', 0, 0], ['glowshroom', 15, 4]]], [0.2, 0.74, [['crystal', 0, 0], ['crystal', 9, 3], ['glowshroom', -10, 4]]]],
      sprinkle: [['glowtree', 5], ['crystal', 3], ['glowshroom', 4], ['moonstone', 0.7], ['lantern', 0.8], ['mushrooms', 2], ['fern', 1], ['bush', 1]],
    },
    candy: {
      sky: ['#f46cc2', '#f786ce', '#faa4dc', '#fcc6ea'], skyN: ['#2e1a4e', '#3c2260', '#4c2a72', '#5e3484'],
      mount: ['#fde2f4', '#f7bce6', '#e894cc'], snow: '#ffffff', mountAmp: 14, mountShape: 'drop',
      far: ['#f8b8de', '#ea8cc6'], farStripe: '#fde6f4', farDots: ['#c9a2f0', '#fff27a', '#99e5c0'], near: ['#b6f2e8', '#7ed8cc'], nearDots: ['#f07aa0', '#fff4f8'],
      lawn: ['#d8faf4', '#8cdcd0'], grass: ['#e0fcf8', '#cef8f0', '#bef3e9', '#b0ece2'], blade: '#8cd8cc', bladeHi: '#ffffff', shade: '#9ad8d0', patch: 1.15,
      dots: ['#f07a84', '#fff27a', '#639bff', '#ffffff'], dotC: '#f08cbc', sand: '#fbe0a2', wet: '#efc488', sandEdge: '#dfae70',
      water: ['#8cf6f2', '#4ee6e8', '#f886c8', '#f45cac'], foam: '#ffffff', hl: '#ffffff', cloud: ['#ffffff', '#fce6f4', '#f4c6e2'],
      path: ['#fff0fc', '#ee9edc', '#c264b4'], pathStyle: 'dots', pathR: 2.1, pathGap: 6.8, sandW: [7, 12], shadowC: '#78cabe', bandFoam: true, pondW: ['#c8f6ff', '#7ad8f8', '#8aa0f4'],
      night: [40, 16, 70, 0.36], dim: 0, tree: 'lollitree', house: true, fizz: true, deco: 'candy', fish: '150,40,100', dens: 3600,
      tree0: [0.22, 0.1], home: ['gingerhouse', 0.56, 0.5], nest: [0.38, 0.57],
      fruitTrees: [['lollitree', 0.66, 0.86], ['lollitree', 0.07, 0.92], ['lollitree', 0.86, 0.2], ['lollitree', 0.1, 0.46]],
      ponds: [[0.33, 0.8, 23, 10]], paths: [['tree', 'dock', 0.2], ['tree', 'home', -0.18], ['home', 'pond', 0.22]],
      props: [['cupcake', 0.06, 0.72], ['gumdrops', 0.2, 0.94], ['candycane', 0.14, 0.99], ['gumdrops', 0.08, 0.2], ['donut', 0.5, 0.68],
        ['lollipop', 0.25, 0.66], ['icecream', 0.3, 0.98], ['donut', 0.22, 0.56], ['gumdrops', 0.97, 0.97], ['cupcake', 0.7, 0.4],
        ['tree', 0.04, 0.06], ['bigtree', 0.48, 0.14], ['tree', 0.94, 0.38], ['tree', 0.3, 0.36], ['bigtree', 0.82, 0.96], ['tree', 0.5, 0.86], ['tree', 0.16, 0.76],
        ['lamp', 0.66, 0.46], ['lollipop', 0.74, 0.28], ['lollipop', 0.88, 0.7], ['candycane', 0.36, 0.08], ['candycane', 0.62, 0.62], ['candycane', 0.04, 0.34]],
      groups: [[0.86, 0.56, [['gumball', 0, 0], ['cupcake', 14, 4], ['icecream', -13, 4]]], [0.44, 0.02, [['candycane', -13, 0], ['candycane', 0, 1], ['candycane', 13, 0]]],
        [0.16, 0.3, [['donut', 0, 0], ['donut', 12, 4], ['lollipop', -11, 3]]], [0.76, 0.76, [['gumdrops', 0, 0], ['gumdrops', 12, 4], ['gumdrops', -11, 5]]],
        [0.42, 0.34, [['lollipop', 0, 0], ['lollipop', 11, 4], ['lollipop', -11, 5]]], [0.62, 0.18, [['lollitree', 0, 0], ['gumdrops', 15, 4]]],
        [0.26, 0.2, [['tree', 0, 0], ['candycane', 16, 4]]]],
      sprinkle: [['tree', 4], ['bigtree', 2], ['lollipop', 4], ['candycane', 4], ['cupcake', 2], ['gumdrops', 2], ['donut', 1], ['icecream', 1], ['lamp', 0.6]],
    },
  };
  PS.gardenThemes = TH; // (the area drop-down's postcards use these colours: app.js mapPreview)
  // ---------------- holiday mode: snow on every island ----------------
  // While holiday mode is on (PS.holiday, state.js) the land is painted from the area's theme with these keys swapped in: a snowy
  // lawn (soft drifts in 4 tones), snow-capped hills and shrubs, frosted sand, a trodden-snow path and more snow on the peaks. The
  // water, sky, houses and fruit trees stay as they are, so every island still reads at a glance. HOL is checked a few times a
  // second (frame) and on the 'holiday' event (Parent tools).
  const holOn = () => { try { return !!(PS.holiday && PS.holiday.on()); } catch (e) { return false; } };
  let HOL = holOn();
  const SNOWY = {
    meadow: { lawn: ['#ffffff', '#c6d4ea'], grass: ['#ffffff', '#f2f6fc', '#e4ecf8', '#d4e0f2'], patch: 1.3, blade: '#7fa86a', bladeHi: '#ffffff', shade: '#bfcde4', shadowC: '#a8bad6',
      far: ['#e8eff8', '#b4c5dc'], farDots: ['#3f8a5a', '#ffffff', '#2a5e44'], near: ['#f5f8fd', '#c2d1e6'], nearDots: ['#4f8f5c', '#ffffff'],
      sand: '#f6efd6', wet: '#dccfa8', sandEdge: '#c8bc98', path: ['#ffffff', '#dde6f2', '#b9c8de'] },
    beach: { lawn: ['#fffdf8', '#d9cfb8'], grass: ['#fffefa', '#f9f6ee', '#f1ece0', '#e7e0d0'], patch: 1.1, blade: '#b8b090', bladeHi: '#ffffff', shade: '#d8ccb4', shadowC: '#cdbf9e',
      far: ['#eef3f9', '#b9c9de'], farDots: ['#3f7a4a', '#ffffff', '#2f6a3a'], near: ['#fbf8f1', '#d8ccb0'], nearDots: ['#c8b48a', '#ffffff'],
      sand: '#f7ecd0', wet: '#e2cc9c', sandEdge: '#cdb486', path: ['#ffffff', '#e2dccd', '#c4b89c'] },
    moonlit: { lawn: ['#eef0ff', '#9aa6d6'], grass: ['#f0f2ff', '#e2e6fb', '#d0d6f2', '#bcc4e8'], patch: 1.3, blade: '#3f8a8a', bladeHi: '#e8f0ff', shade: '#a2acd6', shadowC: '#8e98c8',
      far: ['#56659a', '#3a4676'], farDots: ['#2a5a5e', '#e4ecff', '#1c4044'], near: ['#9aaad0', '#7484b0'], nearDots: ['#2a5a5e', '#eef2ff'],
      sand: '#d6d2ea', wet: '#aaa4cc', sandEdge: '#8e88b4', path: ['#ffffff', '#e2d4fa', '#a88ad8'] },
    candy: { lawn: ['#ffffff', '#e0c6dc'], grass: ['#ffffff', '#fdf5fb', '#f6eaf4', '#ecdcec'], patch: 1.1, blade: '#c8a8c8', bladeHi: '#ffffff', shade: '#e2cde0', shadowC: '#d6bcd6',
      far: ['#fde8f4', '#ebb8d8'], farStripe: '#ffffff', near: ['#fff8fc', '#e6cde0'], sand: '#fcefd6', wet: '#efd6b0', sandEdge: '#dcb88c' },
  };
  const snowTH = {};
  // the theme the land is painted with: the area's own, or its snowy version while holiday mode is on
  const TA = a => { a = a || area; if (!HOL || !SNOWY[a]) return TH[a]; return snowTH[a] || (snowTH[a] = Object.assign({}, TH[a], SNOWY[a], { snowy: true })); };
  PS.gardenTheme = a => TA(a); // (app.js mapPreview: the area drop-down's postcards are snowy too)
  // holiday decorations: the gift's wrapping per area, and the scenery (decorative trees wear snow; the fruit trees stay green, so
  // they're easy to find)
  const GIFT_OF = { meadow: 'gift', beach: 'giftblue', moonlit: 'gift', candy: 'giftpink' };
  const SNOWMEN = { meadow: [[0.3, 0.64], [0.84, 0.36], [0.1, 0.86], [0.6, 0.12]], beach: [[0.22, 0.4], [0.7, 0.76], [0.44, 0.92], [0.86, 0.5]],
    moonlit: [[0.3, 0.2], [0.76, 0.74], [0.12, 0.58], [0.56, 0.92]], candy: [[0.14, 0.62], [0.74, 0.62], [0.46, 0.84], [0.88, 0.3]] }; // ([u, v] tries: 2 stand)
  const pk = kind => (HOL && kind === 'tree' && themeOf(area) === 'day' ? 'snowtree' : kind);
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
  const GLOWS = { glowtree: [0.5, 0.6, 14, '150,150,255'], lamp: [0.5, 0.8, 8, '255,236,150'], lantern: [0.5, 0.8, 9, '255,236,150'], glowshroom: [0.5, 0.6, 7, '170,240,255'], crystal: [0.5, 0.55, 7, '180,220,255'], moonstone: [0.5, 0.5, 6, '160,230,255'], mushrooms: [0.5, 0.5, 4, '170,240,255'] };

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
  // (the big garden: more of everything, spread over it; each is drawn only when it's on screen)
  for (let i = 0; i < 60; i++) DECO.stars.push({ x: srand(), y: srand(), tw: srand() > 0.78, ph: srand() * 6 });
  for (let i = 0; i < 90; i++) DECO.waves.push({ x: srand(), y: srand(), ph: srand() * 6.28, w: 2 + Math.floor(srand() * 3) });
  for (let i = 0; i < 7; i++) DECO.clouds.push({ x: srand(), y: 0.1 + srand() * 0.45, s: i % 3, v: 0.8 + srand() * 1.4 });
  for (let i = 0; i < 44; i++) DECO.flies.push({ p: srand() * 10, a: srand(), b: srand() });
  for (let i = 0; i < 6; i++) DECO.fish.push({ a: 0.15 + srand() * 0.6, b: srand(), r: 0.08 + srand() * 0.12, v: 0.05 + srand() * 0.06, ph: srand() * 6.28, big: i === 2 });
  for (let i = 0; i < 9; i++) DECO.bugs.push({ p: srand() * 10, a: srand(), b: srand(), c: i });
  for (let i = 0; i < 9; i++) DECO.drift.push({ p: srand(), y: srand(), v: 0.03 + srand() * 0.03, ph: srand() * 6.28, c: i });
  for (let i = 0; i < 4; i++) DECO.floats.push({ a: 0.1 + srand() * 0.8, b: 0.1 + srand() * 0.8, ph: srand() * 6.28, v: 0.4 + srand() * 0.4, k: 4 + i });
  for (let i = 0; i < 4; i++) DECO.birds.push({ p: srand(), y: 0.2 + srand() * 0.4, v: 0.012 + srand() * 0.01, ph: srand() * 6 });
  // (the restyle: more fireflies for the Moonlit Grove's twilight, added last so everything above keeps its seeded place)
  for (let i = 0; i < 40; i++) DECO.flies.push({ p: srand() * 10, a: srand(), b: srand() });
  // (holiday mode's falling snow, added last for the same reason: a fixed handful of flakes, placed across the view; see drawSnow)
  const SNOW = []; for (let i = 0; i < 22; i++) SNOW.push({ x: srand(), y: srand(), v: 0.022 + srand() * 0.02, ph: srand() * 6.28, big: srand() < 0.3 });

  // ---------------- sprites (guarded: art is still being drawn, so nothing may crash) ----------------
  const sprCache = new Map();
  // every grid built here finishes with PX.hd (one level of detail with the Sprouts: smooth fine edges, thin inner lines, one ink ring)
  const hd = (g, o) => { try { if (PX.hd) PX.hd(g, o); else if (o && o.outline) g.outline(); } catch (e) { /* art optional */ } return g; };
  function blob(w, h, col) { const g = new PX.Grid(w, h); g.ell(w / 2, h / 2, w / 2 - 1, h / 2 - 1, col || PX.RAMPS.slate); return hd(g, { outline: true }).canvas(); }
  // The family's pictures (art-images.js) load a moment after the game starts, and the garden is the first screen: a sprite made
  // while its picture (folder pf, id pid) was still on the way is remembered in picLate, made again once the picture is in, and
  // the scenery already standing in the garden takes the new one (checkPics, a few times a second while the garden is open).
  const picLate = new Map(); // sprite key -> [picture folder, id]
  function spr(key, make, fb, pf, pid) {
    let c = sprCache.get(key); if (c) return c;
    try { c = make(); } catch (e) { c = null; }
    if (!c || !c.width) { try { c = fb(); } catch (e) { c = blob(10, 10); } }
    try { if (pf && PX.hasPicture && !PX.hasPicture(pf, pid)) picLate.set(key, [pf, pid]); } catch (e) { /* pictures optional */ }
    sprCache.set(key, c); return c;
  }
  const themeOf = a => (D.AREAS[a] && D.AREAS[a].theme) || 'day';
  const critterSpr = (id, f) => spr('c:' + id + ':' + (f || 0), () => PX.critter(id, f || 0), () => blob(16, 12, PX.RAMPS.peach), 'critters', id);
  const swimSpr = (id, f) => spr('cs:' + id + ':' + (f || 0), () => (PX.critterSwim ? PX.critterSwim(id, f || 0) : null), () => critterSpr(id, f), 'critters', id);
  const itemSpr = (kind, id) => spr('i:' + kind + ':' + id, () => PX.item(kind, id), () => (kind === 'fruit' ? PX.fruit('round') : blob(11, 11, PX.RAMPS.sun)), kind === 'egg' ? 'eggs' : kind === 'fruit' ? 'fruit' : null, id);
  const propSpr = (kind, theme) => spr('p:' + kind + ':' + theme, () => (kind === 'gumball' ? PX.gumballMachine(0) : PX.prop(kind, theme)), () => blob(14, 12), kind === 'gumball' ? null : 'props', kind);
  // (called every 0.4 s from frame(); gives up after 2 minutes of garden time, by when every picture there is has loaded)
  let picChecks = 0;
  function checkPics() {
    if (!picLate.size) return;
    if (++picChecks > 300 || !PX.hasPicture) { picLate.clear(); return; }
    let scenery = false;
    for (const [key, pic] of picLate) if (PX.hasPicture(pic[0], pic[1])) { picLate.delete(key); sprCache.delete(key); if (pic[0] === 'props') scenery = true; }
    if (!scenery || !Lw.props) return;
    // (a picture is fitted into the same canvas as the code art it replaces, so sizes, hitboxes and fruit spots stay put)
    const theme = themeOf(area);
    for (const q of Lw.props) q.c = propSpr(pk(q.kind), theme);
    for (const T of Lw.trees || []) T.c = propSpr(T.kind, theme);
    if (Lw.home) Lw.home.c = propSpr(Lw.home.kind, theme);
  }
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
  let W = 0, H = 0, DPR = 1, LDPR = 1, ww = 0, wh = 0, t = 0, visible = false, mounted = false, area = 'meadow';
  // camera (Z = CSS px per world px; cam = world px at the top-left of the screen)
  let Z = 3, ZMIN = 2, ZMAX = 6, camX = 0, camY = 0, zoomAnim = null, pinch = null, camV = { x: 0, y: 0 }, lastTapBg = null, zoomSnapT = 0;
  // ZFAR: zoomed all the way out, the whole garden fits above the tray. follow: the Sprout the camera gently keeps in view (the
  // partner when you arrive, one you tapped or found); a drag or pinch lets it go. VR: the world px on screen this frame.
  let ZFAR = 1, follow = null, findEl = null, findId = '', findKey = '';
  // night raids (see 'night raids' below): the one going on (only ever in one area), and when the next may come
  let raid = null;
  const raidHere = () => !!raid && raid.area === area;
  const VR = { x0: 0, y0: 0, x1: 0, y1: 0 };
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
  const shoreAt = y => Lw.shore[clamp(Math.round(y), 0, Lw.shore.length - 1)] || ww * 0.75;
  const onDock = (x, y) => x >= Lw.dockX0 && x <= Lw.dockX1 && Math.abs(y - Lw.dockY) <= 2;
  const inWater = (x, y) => y >= Lw.waterTop + 1 && x > shoreAt(y) + 1 && !onDock(x, y);
  const depthK = (x, y) => { const s = shoreAt(y); return clamp((x - s) / Math.max(1, ww - s), 0, 1); };
  const isDeep = (x, y) => inWater(x, y) && depthK(x, y) >= 0.45;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // the little ponds on the lawn (Lw.ponds: {x, y, rx, ry}); m widens the test by m world px
  function pondAt(x, y, m) { for (const P of Lw.ponds || []) { const dx = (x - P.x) / (P.rx + (m || 0)), dy = (y - P.y) / (P.ry + (m || 0) * 0.6); if (dx * dx + dy * dy < 1) return P; } return null; }
  // the shore as a smooth line: the water starts at shoreX(y) (shoreAt is the same line rounded to whole world px per row). It
  // leans out a little toward the front and wanders gently, so the big garden's coast isn't a ruler-straight edge.
  function shoreX(y) { const k = clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1.3); return ww * (0.71 + 0.05 * k) + Math.sin(k * 6 + 0.6) * 5 + Math.sin(k * 15 + 2) * 1.5; }
  // a layout position [u, v] -> world px (u along the lawn's width at that height, v down the lawn); lawnRight: the lawn's edge
  const lawnRight = y => shoreAt(y) - sandW(y) - 4;
  const atUV = (u, v) => { const y = Math.round(Lw.minY + clamp(v, 0, 1) * Lw.span); return { x: Math.round(clamp(u, 0, 1) * lawnRight(y)), y }; };

  function layout() {
    const trayH = trayEl.offsetHeight || 110;
    // the sky keeps its height (a fifth of the screen at zoomMin); the big lawn fills the rest of the map
    Lw.hz = Math.round(H / ZMIN * 0.2);
    Lw.minY = Lw.hz + 18;
    Lw.maxY = Math.max(Lw.minY + 30, wh - 14);
    Lw.span = Lw.maxY - Lw.minY;
    // zoomed all the way out, the whole garden fits the screen above the tray (a whole number of device px per world px when
    // that's close)
    const fit = Math.min(W / ww, (H - trayH - 8) / (Lw.maxY + 12));
    let zf = Math.floor(fit * DPR) / DPR; if (zf < fit * 0.9) zf = fit;
    ZFAR = Math.max(0.3, Math.min(ZMIN, zf));
    if (Z < ZFAR - 0.001 && !pinch && !zoomAnim) Z = ZFAR;
    Lw.waterTop = Lw.hz + 2;
    Lw.shore.length = 0;
    for (let y = 0; y <= wh + 2; y++) Lw.shore[y] = Math.round(shoreX(y));
    // (the same shore as a smooth line, per world row, for drawing the foam and surf)
    Lw.sb = new Float32Array(wh + 3); for (let y = 0; y < wh + 3; y++) Lw.sb[y] = shoreB(y + 0.5);
    Lw.dockY = Math.round(Lw.minY + Lw.span * 0.3);
    Lw.dockX0 = shoreAt(Lw.dockY) - 4; Lw.dockX1 = shoreAt(Lw.dockY) + Math.round((ww - shoreAt(Lw.dockY)) * 0.36);
    hintEl.style.bottom = (trayH + 18) + 'px';
    buildProps();
    bgKey = ''; skyKey = '';
  }
  // The scenery for this area at this size: ponds, the house, the fruit trees, the nest, the paths, then the props, each kept
  // clear of what's already there (their bases never overlap, and nothing stands on a path, in a pond or in the water). The
  // scatter is seeded by the area and the world size, so a garden looks the same on every visit.
  function buildProps() {
    const th = TH[area], theme = themeOf(area), foot = [];
    // (foot: [x0, y0, x1, y1, group, tallOnly]: a tallOnly patch only keeps out scenery tall enough to hide what stands behind it)
    const free = (x0, y0, x1, y1, grp, tall) => { for (const f of foot) if (x0 < f[2] && x1 > f[0] && y0 < f[3] && y1 > f[1] && (grp == null || f[4] !== grp) && (tall || !f[5])) return false; return true; };
    Lw.ponds = (th.ponds || []).map(([u, v, rx, ry]) => { const p = atUV(u, v); return { x: p.x, y: p.y, rx, ry }; });
    for (const P of Lw.ponds) foot.push([P.x - P.rx - 4, P.y - P.ry - 6, P.x + P.rx + 4, P.y + P.ry + 4, null]);
    Lw.home = null; Lw.sign = null;
    if (th.home) {
      const [kind, u, v] = th.home, c = propSpr(kind, theme), info = (PX.HOMES && PX.HOMES[kind]) || { door: [0, 0], win: [], w: artW(c) - 8, h: artH(c) - 2 };
      const p = atUV(u, v), y = p.y, x = clamp(p.x, Math.round(artW(c) / 2) + 14, lawnRight(y) - Math.round(artW(c) / 2));
      Lw.home = { kind, x, y, c, info, w: info.w, h: info.h, door: { x: x + info.door[0], y: y + info.door[1] } };
      foot.push([x - info.w / 2 - 12, y - 14, x + info.w / 2 + 3, y + 10, null]); // (and the little sign by the door)
      // (the lawn in front of the door stays open, and no tree in the fuller garden stands where it would hide the house)
      foot.push([x - info.w / 2 - 8, y + 10, x + info.w / 2 + 8, y + 26, null]); foot.push([x - info.w / 2 - 10, y + 26, x + info.w / 2 + 10, y + 60, null, 1]);
    }
    // fruit trees: the area's main tree first (its 3 fruit slots are the ones old saves already have), then the others in the
    // order their slots are saved (new trees only ever go on the end, so every saved fruit stays on the tree it grew on)
    const t0 = atUV(...(th.tree0 || [0.2, 0.12])); Lw.tree = t0;
    Lw.trees = [{ kind: th.tree, x: t0.x, y: t0.y }].concat((th.fruitTrees || []).map(([kind, u, v]) => { const p = atUV(u, v); return { kind, x: p.x, y: p.y }; }));
    Lw.slots = [];
    Lw.trees.forEach((T, ti) => {
      T.c = propSpr(T.kind, theme); const w = artW(T.c);
      T.x = clamp(T.x, Math.round(w / 2) + 1, lawnRight(T.y) - Math.round(w / 2));
      foot.push([T.x - w * 0.32, T.y - 7, T.x + w * 0.32, T.y + 4, null]);
      for (const [fx, fy] of TREE_SLOTS[T.kind] || TREE_SLOTS.default) Lw.slots.push({ x: Math.round(T.x + fx * w), y: Math.round(T.y + fy * artH(T.c)), tree: ti });
    });
    // where eggs wait: a clear patch of lawn near the house (the heart of the garden, where Sprouts like to stay)
    const N = atUV(...(th.nest || [0.5, 0.5])); Lw.nest = N; Lw.heart = Lw.home ? { x: Lw.home.x, y: Lw.home.y + 10 } : N;
    foot.push([N.x - 48, N.y - 18, N.x + 48, N.y + 14, null]); foot.push([N.x - 48, N.y + 14, N.x + 48, N.y + 58, null, 1]); // (no tree in front hides the eggs)
    foot.push([Lw.dockX0 - 12, Lw.dockY - 8, Lw.dockX0 + 6, Lw.dockY + 6, null]); // (the dock's foot on the shore)
    buildPaths(th);
    // props: the area's own pieces, its little scenes, then the seeded scatter that fills the rest
    Lw.props = []; let i = 0;
    const add = (kind, x, y, grp) => {
      const c = propSpr(pk(kind), theme), w = artW(c); x = Math.round(x); y = Math.round(y);
      if (x - w / 2 < 2 || x + w / 2 > lawnRight(y) || y < Lw.minY - 2 || y > Lw.maxY + 2) return false;
      if (!free(x - w / 2 + 1, y - 6, x + w / 2 - 1, y + 3, grp, artH(c) > 18) || onPathNear(x, y, w / 2) || pondAt(x, y, w / 2 + 3)) return false;
      foot.push([x - w / 2, y - 6, x + w / 2, y + 3, grp == null ? null : grp]); Lw.props.push({ kind, x, y, c, i: i++ }); return true;
    };
    // holiday mode: the holiday tree stands near the house (the heart of the garden, where the Sprouts play) with room in front for
    // its daily gift, and a snowman or two stand about; they take their spots before the usual scenery
    Lw.xmas = null; Lw.gift = null;
    if (HOL) {
      const h = Lw.heart;
      for (const r of [46, 60, 76, 94, 116, 140]) {
        for (const a of [180, 0, 205, 335, 155, 25, 230, 310, 130, 50]) { const q = a * Math.PI / 180; if (add('holidaytree', h.x + Math.cos(q) * r, h.y - 8 + Math.sin(q) * r * 0.55)) { Lw.xmas = Lw.props[Lw.props.length - 1]; break; } }
        if (Lw.xmas) break;
      }
      if (!Lw.xmas) { const c = propSpr('holidaytree', theme), y = Math.round(h.y - 8), x = Math.round(clamp(h.x - 60, artW(c) / 2 + 2, lawnRight(y) - artW(c) / 2)); Lw.props.push(Lw.xmas = { kind: 'holidaytree', x, y, c, i: i++ }); }
      const X = Lw.xmas; Lw.gift = { x: X.x + 12, y: X.y + 4 };
      foot.push([X.x + 4, X.y - 4, X.x + 22, X.y + 9, null], [X.x - 22, X.y + 3, X.x + 26, X.y + 44, null, 1]); // (the gift's spot stays clear; nothing tall hides the tree)
      let sm = 0; for (const [u, v] of SNOWMEN[area] || []) { const p = atUV(u, v); if (add('snowman', p.x, p.y) && ++sm >= 2) break; }
    }
    for (const [kind, u, v] of th.props || []) { const p = atUV(u, v); add(kind, p.x, p.y); }
    (th.groups || []).forEach(([u, v, list], g) => { const p = atUV(u, v); for (const [kind, dx, dy] of list) add(kind, p.x + dx, p.y + dy, 'g' + g); });
    let land = 0; for (let y = Lw.minY; y <= Lw.maxY; y += 4) land += Math.max(0, lawnRight(y)) * 4;
    Lw.landK = clamp(land / 60000, 1, 4); // (how much bigger than the old one-screen garden: more fireflies and butterflies)
    const S = th.sprinkle || [], tot = S.reduce((a, x) => a + x[1], 0);
    if (tot) {
      let rs = (AREA_IDS.indexOf(area) + 1) * 7919 + ww * 31 + wh; const rr = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
      const want = Math.round(land / (th.dens || 11000));
      for (let n = 0, tries = 0; n < want && tries < want * 10; tries++) {
        let r = rr() * tot, kind = S[0][0]; for (const [k, wgt] of S) { r -= wgt; if (r <= 0) { kind = k; break; } }
        const y = Lw.minY + 4 + rr() * (Lw.span - 4), x = 6 + rr() * (lawnRight(y) - 12);
        if (add(kind, x, y)) n++;
      }
    }
    // (back to front, so the frame's depth sort has little to do with a garden this full)
    Lw.props.sort((a, b) => a.y - b.y || a.i - b.i);
  }
  // the paths between the main tree, the house, the dock and the pond: gentle curves (quadratic, bent sideways by `bend` of
  // their length), a point every ~2 world px in Lw.pathPts. Lw.pathGrid marks the 4-px cells they cross (props keep off).
  function buildPaths(th) {
    Lw.pathPts = []; const GW = Math.ceil(ww / 4) + 1, G = Lw.pathGrid = new Uint8Array(GW * (Math.ceil(wh / 4) + 1)); Lw.pathGW = GW;
    if (!th.path) return;
    const end = (k, o) => {
      if (Array.isArray(k)) return atUV(k[0], k[1]);
      if (k === 'tree') return { x: Lw.tree.x + 9, y: Lw.tree.y + 4 };
      if (k === 'dock') return { x: Lw.dockX0 - 3, y: Lw.dockY + 1 };
      if (k === 'home' && Lw.home) return { x: Lw.home.door.x, y: Lw.home.door.y + 4 };
      if (k === 'pond' && Lw.ponds.length) { const P = Lw.ponds[0], q = o || { x: P.x + 1, y: P.y }, a = Math.atan2((q.y - P.y) / P.ry, (q.x - P.x) / P.rx); return { x: P.x + Math.cos(a) * (P.rx + 3), y: P.y + Math.sin(a) * (P.ry + 2) }; }
      return null;
    };
    for (const [a, b, bend] of th.paths || []) {
      let p0 = end(a); const p2 = end(b, p0); if (!p0 || !p2) continue;
      if (a === 'pond') p0 = end(a, p2);
      const L = Math.hypot(p2.x - p0.x, p2.y - p0.y); if (L < 8) continue;
      const nx = -(p2.y - p0.y) / L, ny = (p2.x - p0.x) / L, k1 = L * (bend || 0), p1 = { x: (p0.x + p2.x) / 2 + nx * k1, y: (p0.y + p2.y) / 2 + ny * k1 };
      const n = Math.max(20, Math.ceil(L / 2));
      for (let k = 0; k <= n; k++) {
        const u = k / n, A = (1 - u) * (1 - u), B = 2 * u * (1 - u), C = u * u, q = { x: A * p0.x + B * p1.x + C * p2.x, y: A * p0.y + B * p1.y + C * p2.y };
        Lw.pathPts.push(q);
        for (let gy = Math.floor((q.y - 5) / 4); gy <= Math.floor((q.y + 5) / 4); gy++) for (let gx = Math.floor((q.x - 6) / 4); gx <= Math.floor((q.x + 6) / 4); gx++) if (gx >= 0 && gy >= 0 && gx < GW) G[gy * GW + gx] = 1;
      }
    }
  }
  function onPathNear(x, y, r) {
    const G = Lw.pathGrid, GW = Lw.pathGW; if (!G) return false;
    for (let gy = Math.floor((y - 3) / 4); gy <= Math.floor((y + 2) / 4); gy++) for (let gx = Math.floor((x - r) / 4); gx <= Math.floor((x + r) / 4); gx++) if (gx >= 0 && gy >= 0 && gx < GW && G[gy * GW + gx]) return true;
    return false;
  }
  // a free spot on the lawn (not on the house, a tree, a prop, a pond or in the water); near (x0, y0), up to rad px away, if given
  function lawnPoint(x0, y0, rad) {
    for (let i = 0; i < 40; i++) {
      let x, y;
      if (x0 != null) { const a = rand(0, 6.283), d = rand(rad * 0.25, rad); x = x0 + Math.cos(a) * d; y = clamp(y0 + Math.sin(a) * d * 0.7, Lw.minY + 2, Lw.maxY); }
      else { y = rand(Lw.minY + 2, Lw.maxY); x = rand(8, shoreAt(y) - 8); }
      if (x < 8 || x > shoreAt(y) - 8) continue;
      if ((Lw.trees || []).some(T => Math.abs(x - T.x) < 8 && Math.abs(y - T.y) < 6)) continue;
      if (Lw.home && Math.abs(x - Lw.home.x) < Lw.home.w / 2 + 3 && y > Lw.home.y - 12 && y < Lw.home.y + 6) continue;
      if (Lw.props.some(p => Math.abs(x - p.x) < artW(p.c) / 2 && Math.abs(y - p.y) < 4)) continue;
      if (pondAt(x, y, 4)) continue;
      return { x, y };
    }
    return x0 != null ? lawnPoint() : { x: Math.min(ww * 0.3, shoreAt(Lw.maxY - 6) - 10), y: Lw.maxY - 6 };
  }
  // where a Sprout wanders next: a short walk from where it is, drifting back toward the house when it's far from home
  function wanderPoint(r) {
    const h = Lw.heart || { x: ww * 0.4, y: Lw.minY + Lw.span * 0.5 };
    return Math.hypot(r.x - h.x, (r.y - h.y) * 1.2) > TUNE.homeRange ? lawnPoint(lerp(r.x, h.x, 0.45), lerp(r.y, h.y, 0.45), TUNE.wander * 0.6) : lawnPoint(r.x, r.y, TUNE.wander);
  }
  // a spot in the shallows (near height y0 when given, so a swim doesn't cross the whole garden)
  function shallowPoint(y0) { const y = y0 == null ? rand(Lw.minY + 3, Lw.maxY - 2) : clamp(y0 + rand(-40, 40), Lw.minY + 3, Lw.maxY - 2), s = shoreAt(y); return { x: s + 4 + rand(0, 0.3) * (ww - s - 4), y }; }
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
  // the sand between the lawn and the water: the area's width at the back and at the front (world px)
  const SAND0 = [3, 9];
  const sandWC = y => { const s = TH[area].sandW || SAND0; return lerp(s[0], s[1], clamp((y - Lw.waterTop) / Math.max(1, Lw.maxY - Lw.waterTop), 0, 1)); };
  const sandW = y => Math.round(sandWC(y));

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
  const shoreB = y => shoreX(y - 0.5) + 1;
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
  const landBuf = { V: null, N: null, tp: null, xq: null, xa: null, rv: null, rn: null, xq1: null, xa1: null };
  // the two hot loops of paintLand, as small functions of their own (so they stay fast whichever area is being painted)
  // one fine row of lawn: patches of the 7 tones from the row's blended noise RV
  function lawnRow(P, row, fy, fEnd, TP, XQ, XA, RV, T7, edgeU, g0, lipU) {
    for (let fi = 0; fi < fEnd; fi++) {
      const d = fy - TP[fi]; if (d < 0) continue;
      if (d < 3) { P[row + fi] = d === 0 ? edgeU : d === 1 ? g0 : lipU; continue; }
      const q = XQ[fi], v = RV[q] + (RV[q + 1] - RV[q]) * XA[fi];
      const s = (v < 0 ? 0 : v > 0.9999 ? 0.9999 : v) * 4, b = s | 0, f = s - b;
      P[row + fi] = T7[2 * b + (f < 0.13 && b > 0 ? -1 : f > 0.87 && b < 3 ? 1 : 0)];
    }
  }
  // one fine row of open water (below the far-shore band): depth bands, their 50/50 mixes where two meet, the shallows by the shore
  function waterRow(P, row, f0, FW, B, inv, XQ1, XA1, RN, WU, WM, shalU, shal2, bandU) {
    for (let fi = f0; fi < FW; fi++) {
      const q = XQ1[fi], d = ((fi + 0.5) * FP - B) * inv + RN[q] + (RN[q + 1] - RN[q]) * XA1[fi];
      let c = d > 0.78 ? WU[3] : d > 0.45 ? WU[2] : d > 0.14 ? WU[1] : WU[0];
      if (d > 0.118 && d < 0.162) c = WM[0]; else if (d > 0.428 && d < 0.472) c = bandU && d > 0.441 && d < 0.457 ? bandU : WM[1]; else if (d > 0.758 && d < 0.802) c = WM[2];
      if (d < 0.035) c = d > 0.02 ? shal2 : shalU;
      P[row + fi] = c;
    }
  }
  const f32 = (k, n) => (landBuf[k] && landBuf[k].length >= n ? landBuf[k] : (landBuf[k] = new Float32Array(n)));
  const i32 = (k, n) => (landBuf[k] && landBuf[k].length >= n ? landBuf[k] : (landBuf[k] = new Int32Array(n)));
  function paintLand() {
    const th = TA(), X = bgx, hz = Lw.hz, wt = Lw.waterTop, FW = ww * SK, FH = wh * SK;
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
        const snowTo = base - amp * (th.snowy ? 0.25 : 0.6) + hash2(ii >> 2, 1, AS) * 2 + (sh === 'drop' && ii % 6 < 2 ? 2 : 0); // (holiday mode: snow further down the peaks)
        const face = sl < -0.15 ? 0 : sl <= 0.15 ? 1 : sl <= 0.26 ? 2 : 3;
        for (let fy = Math.max(0, Math.round(tp * SK)); fy < (lawnTop + 2) * SK; fy++) {
          const y = fc(fy);
          let c = face === 0 ? (y - tp > 3 ? M01 : M[0]) : face === 1 ? M01 : face === 2 ? M12 : M[2];
          if (y < snowTo && y - tp < (th.snowy ? 11 : 6)) c = face >= 2 ? snowShU : snowU;
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
    // (the noise is sampled every NS world px: the patches are ~20 px across, so that's plenty, and it keeps the big garden quick
    // to paint; each fine row first blends its two sample rows into RV, then each fine pixel blends two of those)
    const NS = 2, PK = th.patch || 1.8, edgeU = u32(th.lawn[1]), lipU = mixU(G[0], T7[4], 0.5), y0v = Math.max(0, lawnTop - 3), VW = Math.ceil(ww / NS) + 2, VH = Math.ceil((wh - y0v) / NS) + 2, V = f32('V', VW * VH), RV = f32('rv', VW);
    for (let y = 0; y < VH; y++) { const yy = y * NS + y0v, g = (yy - lawnTop) / Math.max(1, wh - lawnTop), base = 0.5 + (1 - g) * 0.2 - 0.08; for (let i = 0; i < VW; i++) V[y * VW + i] = (fbm(i * NS * 0.05, yy * 0.085, AS) - 0.5) * PK + base; }
    // per fine column: the lawn's top row and where it sits between two noise samples (rows are then filled left to right)
    const TP = i32('tp', FW), XQ = i32('xq', FW), XA = f32('xa', FW); let tpMin = FH;
    for (let fi = 0; fi < FW; fi++) { const i = fc(fi), gx = clamp((i - 0.5) / NS, 0, VW - 2); TP[fi] = Math.round(lawnTopC(i - 0.5) * SK); XQ[fi] = Math.floor(gx); XA[fi] = gx - XQ[fi]; if (TP[fi] < tpMin) tpMin = TP[fi]; }
    for (let fy = tpMin; fy < FH; fy++) {
      const yw = fc(fy), gy = clamp((yw - 0.5 - y0v) / NS, 0, VH - 2), yq = Math.floor(gy), ay = gy - yq, by = 1 - ay, row = fy * FW, r0 = yq * VW;
      for (let i = 0; i < VW; i++) RV[i] = V[r0 + i] * by + V[r0 + VW + i] * ay;
      // (the sand and water are painted over everything right of the lawn's edge, so the lawn stops there)
      const fEnd = yw >= wt ? Math.min(FW, Math.floor((shoreB(yw) - sandWC(yw) - 1) * SK) + 2) : FW;
      lawnRow(P, row, fy, fEnd, TP, XQ, XA, RV, T7, edgeU, G[0], lipU);
    }
    // ---- sandy shore (dry -> damp -> wet, soft steps) and water in depth bands ----
    const W0 = th.water, WU = W0.map(u32), WM = [mixU(WU[0], WU[1], 0.5), mixU(WU[1], WU[2], 0.5), mixU(WU[2], WU[3], 0.5)];
    const shalU = u32(mixH(W0[0], th.wet, 0.42)), shal2 = mixU(shalU, WU[0], 0.5), sandU = u32(th.sand), wetU = u32(th.wet), dampU = u32(mixH(th.sand, th.wet, 0.5)), sEdgeU = u32(th.sandEdge);
    const sdU = mixU(sandU, dampU, 0.5), dwU = mixU(dampU, wetU, 0.5);
    const reflU = u32(mixH(th.openSea ? th.sky[3] : th.near[1], W0[2], th.openSea ? 0.3 : 0.5)), hlU = u32(th.hl), bandU = th.bandFoam ? u32(th.foam) : 0;
    // the depth wobble, per world px over the water's columns only (blended across each one like the lawn, through a row buffer)
    let xw0 = ww; for (let y = wt; y <= wh; y++) xw0 = Math.min(xw0, shoreAt(y)); xw0 = Math.max(0, xw0 - 4);
    const QW = ww - xw0 + 3, NH = wh - wt + 2, NW = f32('N', QW * NH), RN = f32('rn', QW), XQ1 = i32('xq1', FW), XA1 = f32('xa1', FW);
    for (let y = 0; y < NH; y++) for (let i = 0; i < QW; i++) NW[y * QW + i] = (vnoise((i + xw0) * 0.13, (y + wt) * 0.3, AS + 5) - 0.5) * 0.05;
    for (let fi = 0; fi < FW; fi++) { const gx = clamp(fc(fi) - 0.5 - xw0, 0, QW - 2); XQ1[fi] = Math.floor(gx); XA1[fi] = gx - XQ1[fi]; }
    for (let fy = wt * SK; fy < FH; fy++) {
      const y = fc(fy), B = shoreB(y), sw = sandWC(y), x0 = B - sw - 1, row = fy * FW;
      // sand: from the lawn's edge (a soft 1-fine-px darker rim) to the water
      const e = Math.floor(x0 * SK) - 1; if (e >= 0 && e < FW) P[row + e] = mixU(P[row + e], sEdgeU, 0.55);
      for (let fi = Math.max(0, e + 1); fi < Math.min(FW, Math.round(B * SK)); fi++) {
        const u = (fc(fi) - x0) / (sw + 1);
        P[row + fi] = u < 0.45 ? sandU : u < 0.6 ? sdU : u < 0.8 ? dampU : u < 0.9 ? dwU : wetU;
      }
      const fk = y - wt, fkF = fy - wt * SK, ny = clamp(y - 0.5 - wt, 0, NH - 2), nq = Math.floor(ny), na = ny - nq, nb = 1 - na, r0 = nq * QW, inv = 1 / Math.max(1, ww - B);
      for (let i = 0; i < QW; i++) RN[i] = NW[r0 + i] * nb + NW[r0 + QW + i] * na;
      if (fk >= 7) { waterRow(P, row, Math.max(0, Math.round(B * SK)), FW, B, inv, XQ1, XA1, RN, WU, WM, shalU, shal2, bandU); continue; }
      for (let fi = Math.max(0, Math.round(B * SK)); fi < FW; fi++) {
        const q = XQ1[fi], d = (fc(fi) - B) * inv + RN[q] + (RN[q + 1] - RN[q]) * XA1[fi];
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
    // ---- the surf (the mockups' bright foam): a white scalloped band at the water's edge, a pale band behind it, and two broken
    // lines of foam further out ----
    const foamU = u32(th.foam), paleU = mixU(foamU, WU[0], 0.55), lineU = mixU(foamU, WU[1], 0.25);
    for (let fy = (wt + 3) * SK; fy < FH; fy++) {
      const y = fc(fy), B = shoreB(y), row = fy * FW, sc = 0.5 + 0.5 * Math.sin(y * 0.9 + 0.4);
      const f0 = Math.round((B - 0.6) * SK), f1 = Math.round((B + 0.7 + 1.1 * sc * sc) * SK), f2 = f1 + Math.round((0.8 + 0.5 * sc) * SK);
      for (let fi = Math.max(0, f0); fi < Math.min(FW, f1); fi++) P[row + fi] = foamU;
      for (let fi = Math.max(0, f1); fi < Math.min(FW, f2); fi++) P[row + fi] = paleU;
      if (Math.sin(y * 0.27 + 2) > -0.45) { const o = B + 4.6 + Math.sin(y * 0.42 + 1) * 0.9, w = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(y * 1.3)); for (let fi = Math.max(0, Math.round(o * SK)), e = Math.min(FW, Math.round((o + w) * SK)); fi < e; fi++) P[row + fi] = lineU; }
      if (Math.sin(y * 0.21 + 0.8) > 0.05) { const o = B + 9.5 + Math.sin(y * 0.33 + 0.3) * 1.4; for (let fi = Math.max(0, Math.round(o * SK)), e = Math.min(FW, Math.round((o + 0.5) * SK)); fi < e; fi++) P[row + fi] = mixU(P[row + fi], foamU, 0.6); }
    }
    // ---- details on top, in fine pixels (world coordinates; each world px is SK x SK fine px). The big garden has thousands of
    // them, so they're written straight into the pixel buffer (one fillRect each would take far too long on an iPad); the few
    // sprites (shrubs on the ridges, the far house) go on the canvas afterwards. ----
    let rs = AS * 7919 + 1; const rr = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    const sn = v => Math.round(v * SK) * FP; // snap to the fine grid
    // a fine rect: (x0, y0) snapped to the fine grid, w x h world px
    const R = (x0, y0, w, h, c) => {
      const cu = u32(c), a = Math.round(x0 * SK), b = Math.round(y0 * SK), i1 = Math.min(FW, a + Math.max(1, Math.round(w * SK))), j1 = Math.min(FH, b + Math.max(1, Math.round(h * SK)));
      for (let j = Math.max(0, b); j < j1; j++) { const row = j * FW; for (let i = Math.max(0, a); i < i1; i++) P[row + i] = cu; }
    };
    const dot = (x0, y0, c) => { const i = Math.round(x0 * SK), j = Math.round(y0 * SK); if (i >= 0 && j >= 0 && i < FW && j < FH) P[j * FW + i] = u32(c); };
    // a fine line (wd fine px thick)
    const ln = (x0, y0, x1, y1, c, wd) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * SK)), s = wd || 1, cu = u32(c);
      for (let k = 0; k <= n; k++) {
        const u = k / n, a = Math.round((x0 + (x1 - x0) * u) * SK), b = Math.round((y0 + (y1 - y0) * u) * SK);
        for (let j = Math.max(0, b); j < Math.min(FH, b + s); j++) for (let i = Math.max(0, a); i < Math.min(FW, a + s); i++) P[j * FW + i] = cu;
      }
    };
    // a filled ellipse in fine rows
    const el = (cx, cy, rx, ry, c, ymax) => {
      const cu = u32(c);
      for (let fy = Math.max(0, Math.floor((cy - ry) * SK)); fy <= Math.min(FH - 1, Math.ceil((cy + ry) * SK)); fy++) {
        const dy = (fy + 0.5) * FP - cy; if (Math.abs(dy) >= ry || (ymax != null && (fy + 0.5) * FP > ymax)) continue;
        const hw = rx * Math.sqrt(1 - (dy / ry) * (dy / ry)), a = Math.max(0, Math.round((cx - hw) * SK)), b = Math.min(FW, Math.round((cx + hw) * SK)), row = fy * FW;
        for (let i = a; i < b; i++) P[row + i] = cu;
      }
    };
    // a small picture in fine pixels: one character per fine pixel ('.' = clear), top-left at (x0, y0)
    const stamp = (x0, y0, rows, map) => { const X0 = Math.round(x0 * SK), Y0 = Math.round(y0 * SK); rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = map[r[i]], fx = X0 + i, fy = Y0 + j; if (c && fx >= 0 && fy >= 0 && fx < FW && fy < FH) P[fy * FW + fx] = u32(c); } }); };
    // a see-through wash (k of colour c mixed into what's there)
    const wash = (x0, y0, w, h, c, k) => { const cu = u32(c), a = Math.round(x0 * SK), b = Math.round(y0 * SK); for (let j = Math.max(0, b); j < Math.min(FH, b + Math.round(h * SK)); j++) for (let i = Math.max(0, a); i < Math.min(FW, a + Math.round(w * SK)); i++) P[j * FW + i] = mixU(P[j * FW + i], cu, k); };
    // a see-through ellipse (soft shadows and glows on the ground)
    const mixEl = (cx, cy, rx, ry, c, k) => {
      const cu = u32(c);
      for (let fy = Math.max(0, Math.floor((cy - ry) * SK)); fy <= Math.min(FH - 1, Math.ceil((cy + ry) * SK)); fy++) {
        const dy = (fy + 0.5) * FP - cy; if (Math.abs(dy) >= ry) continue;
        const hw = rx * Math.sqrt(1 - (dy / ry) * (dy / ry)), a = Math.max(0, Math.round((cx - hw) * SK)), b = Math.min(FW, Math.round((cx + hw) * SK)), row = fy * FW;
        for (let i = a; i < b; i++) P[row + i] = mixU(P[row + i], cu, k);
      }
    };
    // an ellipse's outline, one fine pixel thick (ripple rings)
    const ring = (cx, cy, rx, ry, c) => { const n = Math.ceil(6.2832 * Math.max(rx, ry) * SK); for (let k = 0; k < n; k++) { const a = k / n * 6.2832; dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c); } };
    const later = []; // sprites for the canvas pass at the end
    const ball = (cx, cy, r, dark, mid, lit) => later.push(() => { const c = ballSpr(r, lit, mid, dark), w = artW(c), h = artH(c); X.drawImage(c, sn(cx - w / 2 + 0.5), sn(cy - h / 2 + 0.5), w, h); });
    // scenery on the ridges
    if (area === 'meadow') {
      for (let i = 4; i < ww; i += 5 + Math.floor(hash2(i, 2, AS) * 9)) if (hash2(i, 3, AS) > 0.3) { const r = hash2(i, 4, AS) > 0.6 ? 3 : 2; ball(i, fTop[i] + 1, r, th.farDots[2], th.farDots[0], th.farDots[1]); if (r === 3 && hash2(i, 5, AS) > 0.5) ball(i + 4, fTop[Math.min(ww - 1, i + 4)] + 2, 2, th.farDots[2], th.farDots[0], th.farDots[1]); }
      for (let i = 8; i < ww; i += 12 + Math.floor(hash2(i, 6, AS) * 18)) { if (Math.abs(i - ww * 0.32) < 16) continue; ball(i, nTop[i] + 1, 2, th.nearDots[0], th.nearDots[1], th.nearDots[1]); ln(i + 3, nTop[Math.min(ww - 1, i + 3)] + 1.5, i + 3.5, nTop[Math.min(ww - 1, i + 3)] - 0.5, th.nearDots[0]); }
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
        if (Math.abs(i - ww * 0.32) < 18) continue;
        const b = nTop[i], hgt = 6 + Math.floor(hash2(i, 5, AS) * 4), c = th.nearDots[Math.floor(hash2(i, 6, AS) * 2)];
        R(i, b - hgt, FP * 2, hgt, '#fff4f8'); R(i + 0.5, b - hgt, FP, hgt, '#e8c8d8');
        el(i + 0.5, b - hgt - 2, 2.6, 2.4, c); el(i + 0.5, b - hgt - 2, 1.4, 1.3, mixH(c, '#ffffff', 0.45)); dot(i - 0.5, b - hgt - 3.5, '#ffffff'); dot(i, b - hgt - 3.5, '#ffffff');
      }
    }
    // house far on the hill (a hi-res prop: drawn on the canvas at the end, so the scene buffer keeps its fine pixels)
    if (th.house) { const hc = propSpr('house', themeOf(area)); Lw.house = { x: Math.round(ww * 0.32), y: hz + 8, c: hc }; later.push(() => PX.blit(X, hc, Lw.house.x, Lw.house.y)); } else Lw.house = null;
    // ---- the paths between the tree, the house, the dock and the pond (buildPaths): a wide sandy path (meadow), or a trail of
    // round stepping dots like the mockups' (lilac in the grove, pink on Candy Isle, sandy footprints on the beach) ----
    const pathPts = Lw.pathPts || [];
    if (th.path && pathPts.length) {
      const [pl, pm, pe] = th.path;
      if (th.pathStyle === 'sand') {
        for (const q of pathPts) el(q.x + 0.5, q.y + 1.2, 4.4, 2.6, pe);
        for (const q of pathPts) el(q.x + 0.5, q.y + 0.95, 3.75, 2.1, pm);
        for (const q of pathPts) el(q.x + 0.2, q.y + 0.35, 2.3, 0.85, pl);
        for (let k = 3; k < pathPts.length - 2; k += 4) { const q = pathPts[k], o = hash2(k, 1, AS) > 0.5 ? 1.2 : -2.2; el(q.x + o + 0.5, q.y + 1.6, 0.65, 0.4, pe); if (k % 8 === 3) dot(q.x - o + 0.5, q.y + 0.6, '#fffaf0'); }
      } else {
        const gap = th.pathGap || 6.4, r = th.pathR || 1.9, shc = th.shadowC || th.shade;
        let acc = gap;
        for (let k = 1; k < pathPts.length; k++) {
          acc += Math.hypot(pathPts[k].x - pathPts[k - 1].x, pathPts[k].y - pathPts[k - 1].y);
          if (acc < gap) continue; acc = 0;
          const q = pathPts[k], cx = q.x + 0.5, cy = q.y + 0.5;
          mixEl(cx + 0.35, cy + r * 0.55, r + 0.3, r * 0.6, shc, 0.35);
          el(cx, cy, r, r * 0.8, pe); el(cx, cy - 0.2, r - 0.35, r * 0.8 - 0.35, pm); el(cx - r * 0.3, cy - r * 0.4, r * 0.42, r * 0.24, pl);
        }
      }
    }
    // ---- ground details, scattered by area (counts scale with the size of the land) ----
    let land = 0; for (let y = lawnTop + 4; y < wh; y++) land += Math.max(0, shoreAt(y) - sandW(y) - 6);
    const spot = pad => { for (let k = 0; k < 8; k++) { const y0 = Math.round(lawnTop + 4 + rr() * (wh - lawnTop - 5)), x0 = Math.round(2 + rr() * (shoreAt(y0) - sandW(y0) - 6 - (pad || 0))); if (x0 > 1 && !onPathNear(x0, y0, 1) && !pondAt(x0, y0, 2)) return [x0, y0]; } return null; };
    const scatter = (per, fn) => { const n = Math.round(land / per); for (let k = 0; k < n; k++) { const q = spot(); if (q) fn(q[0], q[1], k); } };
    const G2 = th.grass, sh = th.shade, bl = th.blade, bh = th.bladeHi, shc = th.shadowC || sh;
    // grass: thin fine-pixel blades leaning out from the middle, a light tip on each
    const tuft = (x0, y0, k) => {
      const n = 3 + (k % 3 === 0 ? 1 : 0);
      for (let b = 0; b < n; b++) {
        const bx0 = x0 + (b - (n - 1) / 2) * 0.9 + 0.5, h = 1.4 + hash2(x0 + b, y0, AS) * 2.4, lean = (b - (n - 1) / 2) * 0.35;
        ln(bx0, y0 + 0.5, bx0 + lean, y0 + 0.5 - h, bl); dot(bx0 + lean, y0 + 0.5 - h, bh);
      }
    };
    // a light wisp of grass (the mockups' bright strokes): two or three short fine blades in the light colour
    const wisp = (x0, y0, k) => { const n = 2 + (k % 2); for (let b = 0; b < n; b++) { const bx0 = x0 + b * 0.8 + 0.25, h = 1 + hash2(x0 + b, y0, AS + 3) * 1.8; ln(bx0, y0 + 0.5, bx0 + (b - 0.5) * 0.45, y0 + 0.5 - h, bh); } };
    const FLOWER = ['..c...', '.ccc..', 'ccdcc.', '.cccs.', '..cs..', '..g...'];
    const flower = (x0, y0, k) => stamp(x0 - 0.5, y0 - 1, FLOWER, { c: th.dots[k % 4], d: th.dotC, s: mixH(th.dots[k % 4], sh, 0.45), g: bl });
    const pebble = (x0, y0, k) => { const w = k % 2 ? 2 : 3; el(x0 + w / 2, y0 + 1.1, w / 2 + 0.2, 0.5, sh); el(x0 + w / 2, y0 + 0.5, w / 2, 0.75, '#9badb7'); el(x0 + w / 2 - 0.3, y0 + 0.2, w / 2 - 0.6, 0.35, '#b7c2cc'); dot(x0 + 0.5, y0, '#dfe8fb'); };
    const SHROOM = ['..rr..', '.rwrr.', 'rrrrrw', '.oiio.', '..ii..', '..ii.s'];
    const DANDY = ['.www.', 'wwwhw', 'wwwhh', '.whh.', '..g..', '..g..', '..g..'];
    // chunky painted flowers (the mockups' flower clusters): five round petals round a bright middle, the lower two petals a
    // shade darker, a white glint on the top one; a cluster stands on a few dark leaves with a soft shadow
    const FL = (th.flowers || [[th.dots[0], th.dotC]]).map(([p, m]) => [p, m, mixH(p, '#5a5a8a', 0.3), mixH(p, '#ffffff', 0.65)]);
    const leafD = mixH(bl, '#10200a', 0.3), leafM = mixH(bl, G2[0], 0.4);
    const bloom = (cx, cy, f, s) => {
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 1.2566; el(cx + Math.cos(a) * 1.85 * s, cy + Math.sin(a) * 1.65 * s, 1.36 * s, 1.22 * s, k === 2 || k === 3 ? f[2] : f[0]); }
      el(cx, cy, 0.9 * s, 0.8 * s, f[1]); el(cx - 0.2 * s, cy - 2.25 * s, 0.6 * s, 0.35 * s, f[3]);
    };
    const BUNCH = [null, null, [[-2.6, 0], [2.7, 1]], [[0.3, -2.7], [-3, 0.6], [3.1, 1.1]], [[0.4, -2.9], [-3.2, 0.2], [3.3, 0.6], [0, 2.6]]];
    const cluster = (x0, y0, k) => {
      const n = 2 + (k % 3), f0 = FL[k % FL.length], f1 = FL[(k + 2) % FL.length], cx = x0 + 0.5, cy = y0 + 0.5, L = BUNCH[n];
      mixEl(cx + 0.8, cy + 3.4, 6.2, 2, shc, 0.3);
      el(cx - 3.5, cy + 2.4, 2.7, 1.1, leafD); el(cx + 3.7, cy + 2.6, 2.8, 1.1, leafD); el(cx - 2.8, cy + 1.9, 1.7, 0.65, leafM); el(cx + 3.2, cy + 2.1, 1.7, 0.65, leafM);
      for (let i = 0; i < n; i++) bloom(cx + L[i][0], cy + L[i][1], i === n - 1 && k % 4 === 1 ? f1 : f0, i === 0 && n > 2 ? 0.85 : 1);
    };
    const SGL = th.singles || null;
    const single = (x0, y0, k) => { const f = FL[SGL ? SGL[k % SGL.length] : (k * 7 + 3) % FL.length]; el(x0 + 0.5, y0 + 2.4, 2, 0.75, leafD); bloom(x0 + 0.5, y0 + 0.5, f, 0.75); };
    if (th.snowy) {
      // holiday mode: soft snow drifts (a blue shadow on their low side), frosty glints, a few tufts and holly sprigs poking through,
      // pebbles with a cap of snow, and each island's own touch here and there (shells, glowing specks, gumdrops). Calm and sparse.
      const drift = (x0, y0, k) => { const w = 2.4 + (k % 3) * 1.1, cx = x0 + 0.5, cy = y0 + 0.5; mixEl(cx + 0.5, cy + 0.7, w + 0.3, 0.95, sh, 0.5); el(cx, cy, w, 0.9, '#ffffff'); el(cx - w * 0.3, cy - 0.35, w * 0.45, 0.35, mixH('#ffffff', th.grass[0], 0.5)); };
      const glint = (x0, y0, k) => { dot(x0 + 0.25, y0 + 0.25, '#ffffff'); if (k % 4 === 0) { dot(x0 - 0.25, y0 + 0.25, mixH(sh, '#ffffff', 0.5)); dot(x0 + 0.75, y0 + 0.25, mixH(sh, '#ffffff', 0.5)); } };
      const BERRY = area === 'moonlit' ? '#9fd8ff' : area === 'candy' ? '#f07aa0' : '#e8445a';
      const holly = (x0, y0, k) => {
        const cx = x0 + 0.5, cy = y0 + 0.5;
        mixEl(cx + 0.4, cy + 1.4, 3, 0.8, sh, 0.4); el(cx - 1.4, cy + 0.4, 1.6, 0.75, '#2f7a4a'); el(cx + 1.5, cy + 0.6, 1.6, 0.75, '#3f8a52'); dot(cx - 1.9, cy + 0.2, '#5aa86a');
        el(cx - 0.2, cy - 0.3, 0.6, 0.6, BERRY); el(cx + 0.7, cy + 0.1, 0.55, 0.55, BERRY); if (k % 2) el(cx + 0.1, cy + 0.5, 0.5, 0.5, BERRY); dot(cx - 0.45, cy - 0.55, '#ffffff');
      };
      const capped = (x0, y0, k) => { pebble(x0, y0, k); const w = k % 2 ? 2 : 3; el(x0 + w / 2, y0 - 0.15, w / 2 - 0.1, 0.4, '#ffffff'); };
      scatter(430, drift); scatter(300, glint); scatter(1300, tuft); scatter(2600, holly); scatter(2400, capped);
      if (area === 'beach') scatter(1600, (x0, y0, k) => { const c = th.dots[k % 4]; el(x0 + 1, y0 + 0.4, 1.1, 0.8, c); ln(x0 + 0.5, y0 + 0.5, x0 + 1.5, y0 - 0.5, mixH(c, '#ffffff', 0.5)); dot(x0 + 1.5, y0, '#ffffff'); });
      else if (area === 'moonlit') scatter(900, (x0, y0, k) => { const cx = x0 + 0.5, cy = y0 + 0.5, c = k % 3 ? '#fff27a' : '#9ff8ff'; mixEl(cx, cy, 2.4, 2.1, c, 0.22); mixEl(cx, cy, 1.2, 1.05, c, 0.5); el(cx, cy, 0.55, 0.5, '#ffffff'); });
      else if (area === 'candy') {
        const GUMS = ['#f04848', '#f8a030', '#62cc4a', '#4a90f0', '#b070e0', '#ff7ab8'];
        scatter(1500, (x0, y0, k) => { const g = GUMS[k % GUMS.length], cx = x0 + 0.5, cy = y0 + 0.5; mixEl(cx + 0.4, cy + 0.5, 2.4, 0.8, shc, 0.45); el(cx, cy, 1.9, 1.6, mixH(g, '#4a2a5a', 0.3), cy + 0.3); el(cx - 0.1, cy - 0.2, 1.7, 1.4, g, cy); el(cx - 0.1, cy - 1.05, 1.3, 0.45, '#ffffff'); dot(cx - 0.8, cy - 0.6, '#ffffff'); });
        scatter(700, (x0, y0, k) => { const c = th.dots[k % 4]; if (k % 2) ln(x0 + 0.25, y0 + 0.25, x0 + 1.5, y0 + 0.25, c, 1); else ln(x0 + 0.25, y0 + 0.25, x0 + 0.75, y0 + 1.5, c, 1); });
      }
    } else if (th.deco === 'meadow') {
      scatter(125, tuft); scatter(150, wisp); scatter(320, flower);
      scatter(1100, single); scatter(2600, cluster);
      scatter(900, (x0, y0) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) { el(x0 + dx * 1.6 + 0.5, y0 + dy * 1.6 + 1, 1.05, 0.95, '#3f8f1a'); dot(x0 + dx * 1.6, y0 + dy * 1.6 + 0.5, '#a8e858'); } ln(x0 + 0.5, y0 + 1, x0 + 0.5, y0 + 2.5, bl); });
      scatter(1400, pebble);
      scatter(2200, (x0, y0) => stamp(x0 - 1, y0 - 3, SHROOM, { r: '#e8404a', w: '#ffffff', o: '#a8303a', i: '#fbf3dc', s: sh }));
      scatter(1500, (x0, y0) => stamp(x0 - 1, y0 - 5, DANDY, { w: '#ffffff', h: '#e8f0ff', g: bl }));
    } else if (th.deco === 'beach') {
      // ripples in the sand, fine sparkles, little shells, red starfish (the mockup's), pebbles and seaweed
      scatter(120, (x0, y0) => { ln(x0 - 2, y0 + 0.5, x0 + 1.5, y0 + 0.5, G2[3]); ln(x0 + 2, y0 - 0.5, x0 + 3.5, y0 - 0.5, G2[3]); ln(x0 - 2, y0, x0 + 0.5, y0, G2[0]); });
      scatter(380, (x0, y0) => dot(x0 + 0.25, y0 + 0.25, '#fffbea'));
      scatter(650, (x0, y0, k) => { const c = th.dots[k % 4]; el(x0 + 1, y0 + 0.4, 1.1, 0.8, c); ln(x0 + 0.5, y0 + 0.5, x0 + 1.5, y0 - 0.5, mixH(c, '#ffffff', 0.5)); dot(x0 + 1.5, y0, '#ffffff'); ln(x0 + 0.3, y0 + 1.2, x0 + 1.8, y0 + 1.2, G2[3]); });
      const STAR = [['#f0483a', '#ff9a6a', '#b82a26'], ['#ff7a3a', '#ffc080', '#c8501e'], ['#f05a8a', '#ffb0c8', '#b83a62']];
      scatter(1900, (x0, y0, k) => {
        const cx = x0 + 0.5, cy = y0 + 0.5, s = k % 3 ? 1.3 : 1.55, c = STAR[k % 5 === 4 ? 2 : k % 3 === 1 ? 1 : 0], tw = (k % 5) * 0.25;
        mixEl(cx + 0.5, cy + 1.2, 3 * s, 1.1 * s, shc, 0.3);
        for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + a * 1.2566 + tw, ca = Math.cos(an), sa = Math.sin(an); for (const [d, r] of [[0.9, 1], [1.7, 0.82], [2.45, 0.62], [3.05, 0.44]]) el(cx + ca * d * s, cy + sa * d * 0.9 * s, r * s, r * 0.9 * s, a === 2 || a === 3 ? c[2] : c[0]); }
        el(cx, cy, 1.25 * s, 1.1 * s, c[0]);
        for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + a * 1.2566 + tw; dot(cx + Math.cos(an) * 1.4 * s, cy + Math.sin(an) * 1.25 * s, c[1]); }
        dot(cx - 0.25, cy - 0.25, c[1]);
      });
      scatter(2200, pebble);
      scatter(3600, (x0, y0) => { ln(x0, y0 + 0.5, x0 + 1, y0 - 0.5, '#4b692f'); ln(x0 + 1, y0 - 0.5, x0 + 2, y0 + 0.5, '#6a8a3a'); ln(x0 + 2, y0 + 0.5, x0 + 3, y0 - 0.5, '#4b692f'); });
    } else if (th.deco === 'moonlit') {
      scatter(130, tuft); scatter(190, wisp);
      scatter(620, (x0, y0, k) => { dot(x0 + 0.25, y0 + 0.25, k % 2 ? '#7fe0f0' : '#c9a2f0'); if (k % 3 === 0) dot(x0 + 1, y0 + 1, '#4fb8a8'); });
      // glowing specks: a soft halo and a bright core (gold or ice blue), a little four-point twinkle on some
      scatter(650, (x0, y0, k) => {
        const cx = x0 + 0.5, cy = y0 + 0.5, c = k % 3 ? '#fff27a' : '#9ff8ff', big = k % 3 === 0;
        mixEl(cx, cy, big ? 3.4 : 2.4, big ? 2.9 : 2.1, c, 0.2); mixEl(cx, cy, big ? 1.7 : 1.2, big ? 1.5 : 1.05, c, 0.5); el(cx, cy, 0.55, 0.5, '#ffffff');
        if (big || k % 4 === 1) { const r = big ? 2.4 : 1.6; ln(cx - r, cy, cx + r, cy, c); ln(cx, cy - r, cx, cy + r, c); }
      });
      scatter(900, single); scatter(3200, cluster);
      scatter(1200, (x0, y0) => stamp(x0 - 1, y0 - 3, ['..h...', '.cccc.', 'cccccc', '..ss..', '..ss.d', '..ss..'], { h: '#c8fff8', c: '#5fe8e0', s: '#e0e8ff', d: sh }));
      scatter(1500, (x0, y0) => stamp(x0 - 1, y0 - 3, ['..w...', '..pd..', '.ppd..', '.ppdd.', 'lppdd.', '..pd..'], { w: '#ffffff', p: '#c09af0', d: '#7a50c0', l: '#8a6ad0' }));
      scatter(1400, pebble); scatter(950, flower);
    } else if (th.deco === 'candy') {
      scatter(105, (x0, y0, k) => { const c = th.dots[k % 4]; if (k % 2) ln(x0 + 0.25, y0 + 0.25, x0 + 1.5, y0 + 0.25, c, 1); else ln(x0 + 0.25, y0 + 0.25, x0 + 0.75, y0 + 1.5, c, 1); });
      // gumdrops (the mockup's): one to three bright sugar domes, a lit top and a glint, a darker foot and a soft shadow
      const GUM = ['#f04848', '#f8a030', '#f8d838', '#62cc4a', '#4a90f0', '#b070e0', '#ff7ab8'].map(c => [c, mixH(c, '#4a2a5a', 0.35), mixH(c, '#ffffff', 0.55)]);
      const gum = (cx, cy, g, s) => {
        mixEl(cx + 0.4, cy + 0.5, 2.2 * s, 0.75 * s, shc, 0.45);
        el(cx, cy, 1.85 * s, 1.6 * s, g[1], cy + 0.3); el(cx - 0.1 * s, cy - 0.2 * s, 1.65 * s, 1.4 * s, g[0], cy);
        el(cx - 0.6 * s, cy - 0.85 * s, 0.7 * s, 0.4 * s, g[2]); dot(cx - 0.8 * s, cy - 1.05 * s, '#ffffff');
      };
      scatter(800, (x0, y0, k) => { const n = 1 + (k % 3); for (let i = 0; i < n; i++) gum(x0 + 0.5 + [0, 3, 1.4][i] * 1.75, y0 + 0.5 + [0, 0.7, 2.2][i], GUM[(k + i * 3) % GUM.length], i === 2 ? 1.45 : 1.7); });
      scatter(750, (x0, y0) => { dot(x0 + 0.25, y0 + 0.25, '#ffffff'); dot(x0 - 0.25, y0 + 0.25, '#e8fff6'); dot(x0 + 0.75, y0 + 0.25, '#e8fff6'); dot(x0 + 0.25, y0 - 0.25, '#e8fff6'); });
      scatter(1700, (x0, y0) => { el(x0 + 0.5, y0 + 2.4, 2.6, 0.5, sh); el(x0 + 0.5, y0 + 1, 2.4, 1.1, '#ffffff'); el(x0 - 1.6, y0 + 1, 0.7, 1, '#f07a84'); el(x0 + 2.6, y0 + 1, 0.7, 1, '#f07a84'); el(x0 + 0.5, y0 + 0.9, 0.6, 0.6, '#f07a84'); });
      scatter(260, tuft);
    }
    // ---- soft shadows under the scenery (painted with the ground, so the props and fruit trees stand on them) ----
    const TALL = { tree: 1, bigtree: 1, palm: 1, glowtree: 1, lollitree: 1, holidaytree: 1 }, FLAT = { towel: 1, shells: 1, rockpool: 1, gumdrops: 1, donut: 1 };
    for (const q of (Lw.props || []).concat(Lw.trees || [])) {
      if (!q.c || FLAT[q.kind]) continue;
      const w = artW(q.c);
      if (TALL[q.kind]) mixEl(q.x + 1.5, q.y - 0.4, Math.max(6, w * 0.38), 2.8, shc, 0.42);
      else mixEl(q.x + 0.8, q.y - 0.3, Math.max(3, w * 0.44), 1.8, shc, 0.34);
    }
    // ---- shore: pebbles and shells in the sand ----
    for (let y = wt + 4; y < wh; y += 5 + Math.floor(hash2(y, 1, AS) * 6)) { const s = shoreAt(y), x0 = s - sandW(y) + 1 + Math.floor(hash2(y, 2, AS) * Math.max(1, sandW(y) - 3)), c = hash2(y, 3, AS) > 0.5 ? th.sandEdge : '#fffaf0'; dot(x0 + 0.25, y + 0.25, c); dot(x0 + 0.75, y + 0.25, mixH(c, th.sand, 0.5)); }
    // ---- water: glints, then plants / reefs / an island ----
    const waterSpot = (lo, hi, avoidDock) => { for (let k = 0; k < 10; k++) { const y0 = Math.round(Lw.minY + 4 + rr() * (Lw.maxY - Lw.minY - 6)), s = shoreAt(y0), x0 = Math.round(s + 3 + (lo + rr() * (hi - lo)) * (ww - s - 6)); if (!avoidDock || Math.abs(y0 - Lw.dockY) > 7 || x0 > Lw.dockX1 + 6) return [x0, y0]; } return null; };
    for (let k = 0; k < Math.round((ww - shoreAt(Lw.minY)) * (wh - wt) / 260); k++) { const y0 = Math.round(wt + 6 + rr() * (wh - wt - 6)), s = shoreAt(y0), x0 = Math.round(s + 4 + rr() * (ww - s - 8)), w = 2 + Math.floor(rr() * 3), c = k % 3 === 0 ? '#ffffff' : mixH(W0[depthK(x0, y0) > 0.45 ? 2 : 1], th.hl, 0.5); R(x0, y0 + 0.5, w, FP, c); R(x0 + 0.5, y0, w - 1, FP, mixH(c, th.hl, 0.5)); }
    Lw.glowPts = [];
    const wk = clamp(Lw.span / 300, 1, 3); // (the big garden's lake is taller: more reeds and lily pads along it)
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
      const nr = Math.round(4 * wk); for (let k = 0; k < nr; k++) { const y0 = Math.round(Lw.minY + 12 + (k + rr() * 0.6) * (Lw.span / (nr + 0.2))); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3 + (k % 2), '#4b8a3a', '#8f563b'); }
      for (let k = 0; k < Math.round(7 * wk); k++) { // lily pads, some with a flower
        const q = waterSpot(0.1, 0.5, true); if (!q) continue; const [x0, y0] = q, big = k % 3 === 0, rx = big ? 3.4 : 2.4, cx = x0 + 0.5, cy = y0 + 0.5;
        el(cx + 0.3, cy + 0.6, rx, 1.3, '#2f6a3a'); el(cx, cy, rx, 1.35, '#3f8a3a'); el(cx - 0.3, cy - 0.35, rx - 0.7, 0.8, '#6abe30'); el(cx - rx * 0.45, cy - 0.5, 0.7, 0.35, '#99e550');
        ln(cx + 0.5, cy - 0.25, cx + rx - 0.3, cy - 0.75, '#2f6a3a');
        if (k % 2 === 0) stamp(cx - 1.5, cy - 3, ['..w...', '.pwp..', 'ppdpp.', '.ppp..'], { w: '#ffffff', p: '#f7b6c8', d: '#e07ba0' });
      }
    } else if (area === 'beach') {
      for (let k = 0; k < Math.round(7 * wk); k++) { // reef shadows, with a little coral in the shallower ones
        const q = waterSpot(0.25, 0.85, true); if (!q) continue; const [x0, y0] = q, c = mixH(th.water[2], '#123a6a', 0.35);
        el(x0 + 0.5, y0 + 0.5, 5.5, 2.4, mixH(th.water[2], c, 0.5)); el(x0 + 0.5, y0 + 0.5, 4.2, 1.7, c);
        if (depthK(x0, y0) < 0.5) { ln(x0 - 1.75, y0 + 1, x0 - 1.75, y0 - 1, '#f07a84', 2); dot(x0 - 2.25, y0 - 0.5, '#f07a84'); ln(x0 + 1.25, y0 + 0.5, x0 + 1.5, y0 - 2, '#f5a86a', 2); el(x0 + 3.5, y0 - 0.5, 0.6, 0.6, '#f7b6c8'); }
      }
      // a far island with a palm and a tiny lighthouse
      const ix = Math.round(ww * 0.88), iy = wt;
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
      const nr = Math.round(5 * wk); for (let k = 0; k < nr; k++) { const y0 = Math.round(Lw.minY + 10 + (k + rr() * 0.6) * (Lw.span / (nr + 0.2))); if (Math.abs(y0 - Lw.dockY) < 8) continue; reeds(shoreAt(y0) + 2, y0, 3, '#2a4a60', '#9ff8ff', true); }
      for (let k = 0; k < Math.round(5 * wk); k++) { // lotus pads, some with a glowing bud
        const q = waterSpot(0.1, 0.55, true); if (!q) continue; const [x0, y0] = q, cx = x0 + 0.5, cy = y0 + 0.5;
        el(cx + 0.2, cy + 0.5, 2.6, 1.1, '#1f4040'); el(cx, cy, 2.5, 1.05, '#2a5a5a'); el(cx - 0.2, cy - 0.35, 1.7, 0.55, '#3f7a70');
        if (k % 2 === 0) { stamp(cx - 1.5, cy - 3, ['..w...', '.eee..', 'peeep.', '.ppp..'], { w: '#ffffff', e: '#e0d0ff', p: '#c09af0' }); Lw.glowPts.push({ x: x0, y: y0 - 2 }); }
      }
    }
    if (area === 'candy') {
      for (let k = 0; k < Math.round(16 * wk); k++) { const q = waterSpot(0.05, 0.95, false); if (!q) continue; const [x0, y0] = q; if (k % 3) dot(x0 + 0.25, y0 + 0.25, '#ffffff'); else stamp(x0 - 0.5, y0 - 0.5, ['.w.', 'w.w', '.w.'], { w: '#ffffff' }); }
      for (let k = 0; k < Math.round(3 * wk); k++) { // rock-candy crystals poking out of the soda
        const q = waterSpot(0.3, 0.8, true); if (!q) continue; const [x0, y0] = q, c = ['#f7b6c8', '#c9a2f0', '#9fd8ff'][k % 3], dk = mixH(c, '#7a6a9a', 0.3), lt = mixH(c, '#ffffff', 0.5);
        for (const [x, top, w] of [[x0 - 2, y0 - 3, 2], [x0, y0 - 5, 2], [x0 + 2, y0 - 2, 2]]) { R(x, top + 0.5, w, y0 + 1 - top - 0.5, c); R(x + 0.5, top, w - 1, FP, c); R(x + w - FP, top + 0.5, FP, y0 + 1 - top - 0.5, dk); R(x, top + 0.5, FP, y0 + 1 - top - 1, lt); }
        R(x0, y0 - 5, FP, 4, '#ffffff'); R(x0 - 3, y0 + 1, 8, FP, '#ffffff'); R(x0 - 2.5, y0 + 1 + FP, 7, FP, mixH('#ffffff', th.water[1], 0.5));
      }
    }
    // ---- the little ponds on the lawn (the mockups': a ring of round stones round bright water with soft ripple rings), and each
    // area's own touches: lily pads (meadow), glowing stones and lotus (moonlit), a white rim and a starfish (beach), frosting
    // rings and a sugar swirl (candy) ----
    const STONES = { meadow: [['#e8dec6', '#a89878', '#fffaf0']], beach: [['#c8c4d0', '#8a8496', '#f4f2f8']],
      moonlit: [['#e0a6d8', '#8a5a9a', '#fbe4ff'], ['#a88ae8', '#5a48a0', '#e8dcff'], ['#6ccab8', '#2a7a7a', '#d4fff4'], ['#9fd8ff', '#3a70a8', '#ecf8ff']] }[area];
    (Lw.ponds || []).forEach((Pd, pi) => {
      const cx = Pd.x + 0.5, cy = Pd.y + 0.5, rx = Pd.rx, ry = Pd.ry, PW = th.pondW || W0;
      mixEl(cx + 0.6, cy + 1.6, rx + 3.6, ry + 2.6, shc, 0.4);
      if (area === 'candy') { el(cx, cy + 0.3, rx + 3, ry + 2.1, '#f2a46a'); el(cx, cy, rx + 2.4, ry + 1.6, '#ffd6a8'); el(cx, cy + 0.1, rx + 1.3, ry + 0.9, '#ffffff'); }
      else if (area === 'beach') el(cx, cy + 0.2, rx + 1.6, ry + 1.1, '#ffffff');
      else el(cx, cy + 0.3, rx + 1, ry + 0.8, mixH(PW[2], '#10204a', 0.35));
      el(cx, cy + 0.2, rx, ry, PW[0]); el(cx + 0.2, cy + 0.6, rx - 2.2, ry - 1.4, mixH(PW[0], PW[1], 0.5)); el(cx + 0.3, cy + 0.8, rx - 3.6, ry - 2.3, PW[1]);
      el(cx + 0.4, cy + 1, rx * 0.5, ry * 0.42, mixH(PW[1], PW[2], 0.5)); el(cx + 0.5, cy + 1.1, rx * 0.32, ry * 0.26, PW[2]);
      // soft ripple rings, the far inner edge in shade, a lit line along the near one, and a few glints
      ring(cx + 0.3, cy + 0.9, rx * 0.68, ry * 0.62, mixH(PW[1], '#ffffff', 0.45)); ring(cx + 0.4, cy + 1, rx * 0.4, ry * 0.36, mixH(PW[2], '#ffffff', 0.4));
      for (let fx = Math.round((cx - rx + 2) * SK); fx < Math.round((cx + rx - 2) * SK); fx++) { const x = (fx + 0.5) * FP, d = (x - cx) / rx, h = ry * Math.sqrt(Math.max(0, 1 - d * d)); dot(x, cy + 0.2 - h + 0.6, mixH(PW[0], PW[2], 0.55)); dot(x, cy + 0.2 + h - 0.8, mixH(PW[0], '#ffffff', 0.45)); }
      for (let k = 0; k < Math.round(rx / 6); k++) { const gx = cx - rx * 0.5 + rr() * rx, gy = cy - ry * 0.3 + rr() * ry * 0.8; R(gx, gy, 2, FP, mixH(PW[1], th.hl, 0.6)); R(gx + 0.5, gy - FP, 1, FP, '#ffffff'); }
      // the ring of round stones, back to front (a little bush between some of them in the meadow)
      if (STONES) {
        const ex = rx + 1.5, ey = ry + 1.1, n = Math.round(6.2832 * Math.sqrt((ex * ex + ey * ey) / 2) / (area === 'beach' ? 5.2 : 3.4)), st = [];
        for (let k = 0; k < n; k++) { const a = k / n * 6.2832 + 0.15; st.push([cx + Math.cos(a) * ex, cy + 0.2 + Math.sin(a) * ey, k]); }
        st.sort((p, q) => p[1] - q[1]);
        for (const [sx, sy, k] of st) {
          const C = STONES[k % STONES.length], r = (area === 'beach' ? 1.4 : 1.75) + hash2(k, pi, AS + 9) * 0.5;
          el(sx + 0.3, sy + 0.55, r + 0.15, r * 0.74, C[1]); el(sx, sy, r, r * 0.72, C[0]); el(sx - r * 0.32, sy - r * 0.3, r * 0.42, r * 0.24, C[2]);
          if (area === 'meadow' && k % 7 === 3) { el(sx, sy - 1.1, 2.3, 1.7, '#3f9418'); el(sx - 0.3, sy - 1.5, 1.7, 1.1, '#6cc226'); dot(sx - 0.9, sy - 2, '#b8ee5a'); }
        }
      }
      if (area === 'meadow') {
        reeds(Math.round(cx - rx + 3), Math.round(cy - 1), 3, '#4b8a3a', '#8f563b');
        for (const [ox, oy, big, fl] of [[0.25, 0.25, 1, 1], [-0.35, 0.45, 0, 0], [0.55, -0.1, 0, 1]]) {
          const lx = cx + ox * rx, ly = cy + oy * ry, prx = big ? 3.2 : 2.3;
          el(lx + 0.3, ly + 0.6, prx, 1.25, '#2f6a3a'); el(lx, ly, prx, 1.3, '#3f8a3a'); el(lx - 0.3, ly - 0.35, prx - 0.7, 0.75, '#6abe30'); el(lx - prx * 0.45, ly - 0.5, 0.7, 0.35, '#99e550');
          if (fl) stamp(lx - 1.5, ly - 3, ['..w...', '.pwp..', 'ppdpp.', '.ppp..'], { w: '#ffffff', p: '#f7b6c8', d: '#e07ba0' });
        }
      } else if (area === 'moonlit') {
        reeds(Math.round(cx + rx - 3), Math.round(cy - 1), 3, '#2a4a60', '#9ff8ff', true);
        for (const [ox, oy] of [[-0.3, 0.3], [0.3, 0.45]]) { const lx = cx + ox * rx, ly = cy + oy * ry; el(lx + 0.2, ly + 0.5, 2.6, 1.1, '#1f4040'); el(lx, ly, 2.5, 1.05, '#2a5a5a'); el(lx - 0.2, ly - 0.35, 1.7, 0.55, '#3f7a70'); stamp(lx - 1.5, ly - 3, ['..w...', '.eee..', 'peeep.', '.ppp..'], { w: '#ffffff', e: '#e0d0ff', p: '#c09af0' }); Lw.glowPts.push({ x: Math.round(lx - 0.5), y: Math.round(ly - 2.5) }); }
        // (the glowing pond: a few soft lights in the water)
        for (const [ox, oy] of [[-0.55, -0.05], [0.05, 0.1], [0.5, -0.2]]) Lw.glowPts.push({ x: Math.round(cx + ox * rx), y: Math.round(cy + oy * ry) });
      } else if (area === 'beach') {
        const sx = cx + rx * 0.35, sy = cy + ry * 0.3; for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + a * Math.PI * 2 / 5; ln(sx, sy, sx + Math.cos(an) * 2, sy + Math.sin(an) * 1.6, '#f05a3a', 2); } el(sx, sy, 0.8, 0.8, '#f05a3a');
      } else if (area === 'candy') {
        ring(cx + 0.4, cy + 0.9, rx * 0.55, ry * 0.5, '#f6a6d8'); ring(cx + 0.5, cy + 1, rx * 0.28, ry * 0.26, '#c9a2f0');
        for (let k = 0; k < Math.round(rx * 0.8); k++) { const a = rr() * 6.28, d = Math.sqrt(rr()) * 0.8, px = cx + Math.cos(a) * rx * d, py = cy + Math.sin(a) * ry * d; dot(px, py, ['#ffffff', '#fff27a', '#f6a6d8'][k % 3]); }
      }
      Pd.i = pi;
    });
    // ---- dock: planks on posts, a lamp at the end (an object: the same ink ring as the props, fine lines inside) ----
    const dy = Lw.dockY, x0 = Lw.dockX0, x1 = Lw.dockX1;
    wash(x0 + 2, dy + 1, x1 - x0, 2, INK, 0.22);
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
      X.putImageData(img, 0, 0);
    // the sprites go on top, at SK x the world
    X.setTransform(SK, 0, 0, SK, 0, 0); X.imageSmoothingEnabled = false;
    for (const f of later) f();
    X.setTransform(1, 0, 0, 1, 0, 0);
  }
  function ensureBg(n) {
    const nq = Math.round(n * 20) / 20;
    const k1 = area + ww + 'x' + wh + ':' + nq, k2 = area + ww + 'x' + wh + ':' + Lw.maxY + (HOL ? ':snow' : '');
    if (k1 !== skyKey) { skyKey = k1; paintSky(nq); }
    if (k2 !== bgKey) { bgKey = k2; paintLand(); }
  }

  // ---------------- resize ----------------
  function resize() {
    const r = root.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    // DPR: the screen's real density (iPhones are 3), for the canvas and the zoom steps, so nothing is stretched by the browser.
    // LDPR: the 2x figure the garden's size and zoom range were tuned with; it keeps the world, its props and zooms as they were.
    DPR = Math.min(3, window.devicePixelRatio || 1); LDPR = Math.min(2, DPR);
    const oldW = ww, oldMin = Lw.minY, oldSpan = Lw.span, k0 = ww ? Z / ZMIN : 0;
    W = r.width; H = r.height;
    // at ZMIN the screen shows about TUNE.worldW world pixels across (rounded to whole device pixels, so it's crisp too; wide
    // screens get a slightly wider world); the garden is mapW x mapH that view, so there is plenty to explore
    ZMIN = Math.max(TUNE.zoomMinPx, Math.floor(Math.min(W / TUNE.worldW, H / TUNE.worldH) * LDPR) / LDPR);
    ZMIN = Math.ceil(ZMIN * LDPR - 0.001) / LDPR; ZMAX = ZMIN * TUNE.zoomMax;
    ww = Math.ceil(W / ZMIN * TUNE.mapW); wh = Math.ceil(H / ZMIN * TUNE.mapH);
    // the world buffer and the ground are SK x finer than the world (the sky sizes itself in paintSky: it only needs the top)
    for (const c of [buf, bgC]) { c.width = ww * SK; c.height = wh * SK; }
    // the bitmap is exactly the CSS size x DPR device pixels (the browser never rescales it), and the canvas starts on a whole
    // device pixel even when the top bar's height is fractional
    cv.width = Math.ceil(W * DPR - 0.01); cv.height = Math.ceil(H * DPR - 0.01);
    cv.style.width = cv.width / DPR + 'px'; cv.style.height = cv.height / DPR + 'px';
    { const fx = (r.left * DPR) % 1, fy = (r.top * DPR) % 1; cv.style.transform = fx > 0.001 || fy > 0.001 ? `translate(${-(fx / DPR).toFixed(4)}px,${-(fy / DPR).toFixed(4)}px)` : ''; }
    layout();
    // keep everything where it was relative to the (possibly resized) world
    const fx = oldW ? ww / oldW : 1;
    for (const r2 of RT.values()) { r2.x = clamp(r2.x * fx, 6, ww + 20); r2.y = clamp(oldSpan ? Lw.minY + (r2.y - oldMin) / oldSpan * Lw.span : r2.y, Lw.minY, Lw.maxY); }
    for (const a in ground) for (const f of ground[a]) { f.y = clamp(oldSpan ? Lw.minY + (f.y - oldMin) / oldSpan * Lw.span : f.y, Lw.minY, Lw.maxY); f.x = clamp(f.x * fx, 5, lawnRight(f.y) - 2); }
    // (first time: the zoom you last used, if it was a close one; a garden left zoomed all the way out opens at the usual size)
    Z = snapZ(ZMIN * (k0 || (zoomPref >= 1.5 ? Math.min(zoomPref, TUNE.zoomMax) : TUNE.zoomDef)));
    if (!k0) focusCamera(); else clampCam();
    return true;
  }

  // ---------------- camera ----------------
  const viewW = () => W / Z, viewH = () => H / Z;
  // crisp pixels: at rest the zoom is a whole number of device pixels per world pixel; all the way out it's ZFAR (the whole garden)
  function snapZ(z) {
    z = clamp(z, ZFAR, ZMAX);
    if (z < ZFAR * 1.04) return ZFAR;
    // every fine pixel a whole number of device pixels (SK fine px per world px): zoom moves in steps of SK / DPR
    const step = SK / DPR;
    let s = Math.max(1, Math.round(z / step)) * step;
    if (s > ZMAX + 0.001) s = Math.max(1, Math.floor(ZMAX / step + 0.001)) * step;
    if (s < ZFAR - 0.001) s = ZFAR;
    return s;
  }
  function camLimits() {
    const trayH = trayEl ? trayEl.offsetHeight || 110 : 110;
    const maxX = Math.max(0, ww - viewW());
    // don't scroll further down than the bottom of the lawn sitting just above the tray
    const maxY = Math.max(0, Math.min(wh - viewH(), Lw.maxY + 12 - (H - trayH - 8) / Z));
    return { maxX, maxY };
  }
  // (a view wider than the garden keeps it in the middle)
  function clampCam() { const L = camLimits(), vw = viewW(); camX = vw > ww ? (ww - vw) / 2 : clamp(camX, 0, L.maxX); camY = clamp(camY, 0, L.maxY); }
  // start the view on your partner (or an egg, or the house) in this area, and keep the partner in view while it wanders
  function focusCamera() {
    let fx = Lw.heart ? Lw.heart.x : ww * 0.4, fy = Lw.heart ? Lw.heart.y - 10 : Lw.minY + Lw.span * 0.5;
    const mine = PS.S.sprouts.filter(isOut), act = ST.active();
    const s0 = mine.includes(act) ? act : mine[0], r = s0 && RT.get(s0.id);
    follow = null;
    if (r) { fx = r.x; fy = r.y - 10; follow = r.id; }
    else { const o = eggsHere()[0]; if (o) { fx = o.x; fy = o.y - 10; } else if (Lw.home && PS.S.sprouts.some(x => x.area === area)) { fx = Lw.home.x; fy = Lw.home.y - 20; } }
    camX = fx - viewW() * 0.5; camY = fy - viewH() * 0.48; camV.x = camV.y = 0; zoomAnim = null;
    clampCam();
  }
  const clientToWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left) / Z + camX, y: (cy - r.top) / Z + camY }; };
  const worldToScreen = (x, y) => ({ x: (x - camX) * Z, y: (y - camY) * Z }); // CSS px inside the garden
  // zoom to z keeping the world point under screen point (sx, sy) in place
  function zoomAt(z, sx, sy) {
    const wx = sx / Z + camX, wy = sy / Z + camY;
    Z = clamp(z, ZFAR * 0.85, ZMAX * 1.15);
    camX = wx - sx / Z; camY = wy - sy / Z; clampCam();
  }
  function animateZoom(to, sx, sy) { zoomAnim = { from: Z, to: snapZ(to), sx: sx == null ? W / 2 : sx, sy: sy == null ? H / 2 : sy, k: 0 }; }
  // glide the view (and zoom) so world point (x, y) is in the middle
  function glideTo(x, y, z) { zoomAnim = { from: Z, to: snapZ(z || Z), k: 0, c: [camX + viewW() / 2, camY + viewH() / 2, x, y] }; camV.x = camV.y = 0; }
  function saveZoomPref() { zoomPref = Z / ZMIN; try { localStorage.setItem(ZKEY, zoomPref.toFixed(3)); } catch (e) { /* blocked */ } }
  function updateCamera(dt) {
    if (zoomAnim) {
      zoomAnim.k = Math.min(1, zoomAnim.k + dt / (zoomAnim.c ? 0.45 : 0.22));
      const e = 1 - Math.pow(1 - zoomAnim.k, 3), c = zoomAnim.c;
      // (the magnifier button and the finder glide the view's centre too: c = [from x, from y, to x, to y] in world px)
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
    followCam(dt);
  }
  // the gentle follow: while nobody is touching the garden, the camera keeps the followed Sprout comfortably on screen as it
  // wanders (it lets go when you drag the view away, pinch, or the Sprout swims off)
  function followCam(dt) {
    if (!follow || pinch || zoomAnim || drag || touches.size || (press && press.kind === 'bg') || Z <= ZFAR * 1.03) return;
    const r = RT.get(follow);
    if (!r || !here.includes(r) || r.state === 'travel' || r.state === 'held' || r.state === 'enter') { follow = null; return; }
    const vw = viewW(), vh = viewH(), mx = vw * 0.2, top = 96 / Z + vh * 0.08, bot = (H - (cardEl && !cardEl.hidden ? cardEl.offsetHeight : trayEl.offsetHeight) - 24) / Z - vh * 0.06;
    const fx = r.x, fy = (r.state === 'fall' ? r.y - r.z : r.y) - 12;
    let tx = camX, ty = camY;
    if (fx < camX + mx) tx = fx - mx; else if (fx > camX + vw - mx) tx = fx - vw + mx;
    if (fy < camY + top) ty = fy - top; else if (fy > camY + bot) ty = fy - bot;
    if (tx === camX && ty === camY) return;
    const k = Math.min(1, dt * 2.2); camX += (tx - camX) * k; camY += (ty - camY) * k; clampCam();
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
      // (saved as shares of the garden's width and height, so they map onto any size of garden; one that would land in the
      // water or a pond is set down on the bank instead, never dropped)
      ground[a] = (Array.isArray(G) ? G : []).filter(g => D.FRUITS[g.kind]).map(g => {
        const y = clamp(Lw.minY + (+g.fy || 0) * Lw.span, Lw.minY, Lw.maxY), f = { kind: g.kind, x: clamp((+g.fx || 0) * ww, 5, lawnRight(y) - 2), y, z: 0, vz: 0 };
        const P = pondAt(f.x, f.y, 2); if (P) f.y = Math.min(Lw.maxY, P.y + P.ry + 4);
        return f;
      });
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
      else if (arrivals.has(s.id)) { arrivals.delete(s.id); y = clamp(ww ? camY + viewH() * rand(0.3, 0.7) : rand(Lw.minY + 4, Lw.maxY - 4), Lw.minY + 4, Lw.maxY - 4); x = ww + 8; state = 'arrive'; }
      else { const h = Lw.heart, q = h ? lawnPoint(h.x, h.y, 110) : lawnPoint(); x = q.x; y = q.y; }
      r = { id: s.id, s, x, y, z: 0, vz: 0, state, timer: rand(0.4, 2), tx: x, ty: y, facing: Math.random() < 0.5 ? 1 : -1, emote: null, emoteT: 0,
        blinkT: rand(1, 4), mood: null, target: null, flutter: false, z0: 0, eat: null, cheerT: 0, hopT: 0, feetY: y, dangle: 0, acc: {}, look: null, lookT: 0,
        flutterAt: -99, dest: null, ripT: 0, awake: t + 25, ph: Math.random() * 2 };
      if (state === 'arrive') { const q = shallowPoint(y); r.tx = q.x; r.ty = y; r.facing = -1; emote(r, '!', 1.4); }
      RT.set(s.id, r);
    }
    r.s = s; return r;
  }
  function lookFor(r) { if (!r.look || t > r.lookT) { r.look = ST.lookOf(r.s); r.lookT = t + 1.2; } return r.look; }
  function emote(r, e, dur) { r.emote = e; r.emoteT = dur || 1.6; }
  function hop(r) { r.hopT = 0.35; }
  const busy = r => ['held', 'fall', 'travel', 'arrive', 'cocoon', 'wait', 'enter', 'ko'].includes(r.state);
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
    if (raidHere()) { r.state = 'idle'; r.timer = 0.6; return; } // (the gloom is here: everyone stays together)
    const gl = groundList(area);
    const free = gl.filter(f => !f.claim || f.claim.until < t || f.claim.id === r.id);
    if (free.length) {
      let best = null, bd = 1e9; for (const f of free) { const d = dist(r, f); if (d < bd) { bd = d; best = f; } }
      // close snacks are sniffed out straight away; far ones get found sooner or later while wandering
      if (bd < TUNE.smellRange || (bd < 240 && Math.random() < 0.3)) {
        best.claim = { id: r.id, until: t + 16 };
        goTo(r, best.x - 5 * (best.x > r.x ? 1 : -1), best.y, { type: 'fruit', f: best }); emote(r, bd < TUNE.smellRange ? '!' : '?', 1); return;
      }
    }
    if (s.happy < 25 && Math.random() < 0.25) { r.state = 'idle'; r.timer = rand(1.5, 3); r.mood = 'sad'; emote(r, '?', 1.5); return; }
    const pals = here.filter(o => o !== r && !busy(o) && o.state !== 'sleep' && dist(o, r) < 130);
    const x = Math.random();
    if (pals.length && x < 0.1) { const o = pick(pals); goTo(r, o.x - 8 * (o.x > r.x ? 1 : -1), o.y, { type: 'greet', o }); return; }
    if (x < 0.6) { const swimmy = shoreAt(r.y) - r.x < 150 && Math.random() < (s.stats.swim.lv >= 1 ? 0.2 : 0.1); const q = swimmy ? shallowPoint(r.y) : wanderPoint(r); goTo(r, q.x, q.y, null); }
    else if (x < 0.76) { r.state = 'idle'; r.timer = rand(1.5, 3); emote(r, pick(['note', 'note', 'heart', 'sparkle']), 1.4); }
    else if (x < 0.86) { r.state = 'idle'; r.timer = 1.4; r.cheerT = 0.9; hop(r); }
    else { r.state = 'idle'; r.timer = rand(1, 2.5); r.facing *= -1; }
  }
  function goSleep(r, dur) { r.state = 'sleep'; r.timer = dur; r.mood = 'sleep'; emote(r, 'zz', dur); }
  function goTo(r, x, y, target) { r.state = 'walk'; r.tx = clamp(x, 6, ww - 6); r.ty = clamp(y, Lw.minY, Lw.maxY); r.target = target; }
  function startSwim(r) { r.state = 'swim'; r.timer = rand(6, 11); const q = shallowPoint(r.y); r.tx = q.x; r.ty = q.y; emote(r, 'note', 1.5); markSeen('swim'); }
  function wake(r) { if (r.state === 'sleep') { r.state = 'idle'; r.timer = 1; r.mood = null; r.emote = null; } }

  function updateSprout(r, dt, night) {
    const s = r.s;
    if (press && press.kind === 'sprout' && press.r === r && press.mode === 'pending' && t - press.t0 > TUNE.holdDelay) press.mode = pickUp(r) ? 'hold' : 'none';
    if (r.atkT > 0) r.atkT -= dt; if (r.lungeT > 0) r.lungeT -= dt; if (r.hitT > 0) r.hitT -= dt;
    // resting after a raid (dizzy stars), then up again with a sparkle
    if (r.koUntil) {
      if (Date.now() < r.koUntil) { if (r.state !== 'held' && r.state !== 'fall' && r.state !== 'travel') r.state = 'ko'; }
      else { r.koUntil = 0; if (r.state === 'ko') { r.state = 'idle'; r.timer = 1; r.cheerT = 1; hop(r); emote(r, 'sparkle', 1.4); } }
    }
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
    // a raid on: the fight moves this Sprout (updateFighter), unless you're carrying it
    if (r.inRaid && raidHere() && raid.phase === 'fight' && r.state !== 'held' && r.state !== 'fall') return;
    switch (r.state) {
      case 'idle': case 'pet':
        r.timer -= dt;
        if (r.timer <= 0) { if (r.state === 'pet') { r.state = 'idle'; r.timer = 0.6; r.mood = null; } else think(r); }
        if (wet && r.state === 'idle') startSwim(r);
        break;
      case 'walk': {
        const sp = speed * (wet ? 0.6 : 1) * (raidHere() ? 1.7 : 1); // (hurrying together when the gloom is coming)
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
        if (moveTo(speed * 0.55)) { const q = shallowPoint(r.y); r.tx = q.x; r.ty = q.y; }
        if (r.timer <= 0 || !wet) { const q = lawnPoint(shoreAt(r.y) - 30, r.y, 40); goTo(r, q.x, q.y, null); }
        break;
      case 'wait': // treading water while the player picks a destination
        r.x += Math.sin(t * 1.3 + r.y) * 0.03;
        break;
      case 'travel': {
        if (!wet && r.x < shoreAt(r.y) + 2) { r.tx = shoreAt(r.y) + 6; r.ty = r.y; moveTo(speed); }
        else { r.tx = ww + 16; r.ty = clamp(r.y + Math.sin(t * 0.8) * 0.2, Lw.minY, Lw.maxY); moveTo(speed * 1.3 + 6); r.ripT -= dt; if (r.ripT <= 0) { r.ripT = 0.25; parts.push({ x: r.x - 6 * r.facing, y: r.y - 6, vx: 0, vy: 0, life: 0.8, type: 'ripple', color: TH[area].hl }); } }
        if (r.x > ww + 12) finishMove(s, r.dest);
        break;
      }
      case 'enter': // walking home to rest
        r.tx = Lw.home ? Lw.home.door.x : r.x; r.ty = Lw.home ? Lw.home.door.y + 1 : r.y;
        if (!Lw.home || moveTo(speed * 1.3)) finishInside(r);
        break;
      case 'arrive':
        if (moveTo(speed * 1.1)) { const q = lawnPoint(shoreAt(r.y) - 40, r.y, 50); goTo(r, q.x, q.y, null); emote(r, 'sparkle', 1.4); }
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
      if (isDeep(r.x, r.y) && PS.S.sprouts.length && !raidHere()) { r.state = 'wait'; emote(r, '?', 3); askTravel(s, true); }
      else startSwim(r);
      return;
    }
    if (pondAt(r.x, r.y)) { burst(r.x, r.y - 2, 'drop', 10, '#cbdbfc'); snd('splash'); r.flutter = false; r.state = 'idle'; r.timer = 0.5; emote(r, '!', 1); const q = lawnPoint(r.x, r.y, 30); goTo(r, q.x, q.y, null); return; }
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
    if (raidHeal(r, id, 1)) return; // (in a raid the snack heals it, and it keeps fighting)
    if (r.koUntil) { r.koUntil = 0; r.state = 'idle'; } // (a snack wakes a resting Sprout)
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
    const list = PS.S.eggs.filter(e => e.area === area), n = list.length, N = Lw.nest || { x: ww * 0.4, y: Lw.minY + Lw.span * 0.46 };
    return list.map((e, i) => ({ e, x: Math.round(clamp(N.x + (i - (n - 1) / 2) * 17, 10, shoreAt(N.y) - 10)), y: Math.round(N.y + (i % 2) * 6) }));
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
    const pool = Object.keys(D.ANIMALS).filter(id => { const a = D.ANIMALS[id]; return a.area === area && !a.season && (a.time === 'any' || (a.time === 'night') === night); });
    // holiday mode: the Reindeer visits every garden (twice in the draw, so it comes by every few minutes)
    if (HOL) for (const id of Object.keys(D.ANIMALS)) if (D.ANIMALS[id].season === 'holiday') pool.push(id, id);
    return pool;
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
  function spawnCritter(want) { // (want: an animal id, for testing: __garden.spawnCritter('reindeer'))
    const pool = want && D.ANIMALS[want] ? [want] : critterPool(); if (!pool.length) return;
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
    if (PS.S.sprouts.length && critters.length < TUNE.maxCritters && t > nextCritter && !raidHere()) { spawnCritter(); nextCritter = t + rand(...D.GROWTH.critterEverySec); }
    for (const c of critters) {
      c.life -= raidHere() ? 0 : dt * (inView(c.x, c.y - 6, 0) ? 1 : 0.5); c.next -= dt; // off-screen visitors stay a little longer (and nobody leaves during a raid)
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
        else { const a = rand(0, Math.PI * 2), d = rand(4, 9); nx = clamp(c.x + Math.cos(a) * d, 8, ww - 8); ny = clamp(c.y + Math.sin(a) * d * 0.5, Lw.minY + 3, Lw.maxY); if (nx > shoreAt(ny) - 7 || pondAt(nx, ny, 3)) { nx = c.x - (c.x > ww * 0.5 ? 4 : -4); ny = c.y; } }
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
    // (somewhere on screen when it can be: the garden is big and a drop only lasts TUNE.dropLife seconds)
    const vx = camX + viewW() / 2, vy = camY + viewH() * 0.45; let q = lawnPoint(vx, vy, Math.min(viewW(), viewH()) * 0.4);
    if (!inView(q.x, q.y - 6, 4)) q = lawnPoint(vx, vy, 24);
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
    shroom: 'mushrooms glowshroom', shine: 'crystal moonstone', shells: 'shells', light: 'lantern lamp holidaytree', spin: 'umbrella', bounce: 'ball', leafy: 'tree bigtree palm glowtree lollitree',
    sand: 'sandcastle', pond: 'rockpool', sweet: 'candycane cupcake gumdrops donut lollipop icecream', snowy: 'snowman',
  })) for (const k of kinds.split(' ')) FUN_OF[k] = rec;
  // recipe -> [move, seconds, sound, pitch]; anything not listed wobbles and bumps
  const FUN = {
    tree: ['shake', 0.6, 'whoosh', 1.3], leafy: ['shake', 0.6, 'whoosh', 1.4], bush: ['shake', 0.5, 'whoosh', 1.6], flower: ['squash', 0.5, 'pop', 1.3], fence: ['shake', 0.45, 'bump', 1.4],
    clank: ['wobble', 0.6, 'bump', 0.9], rock: ['wobble', 0.6, 'thud', 1.1], stump: ['squash', 0.5, 'thud', 1.4], shroom: ['squash', 0.5, 'bloop', 1.2],
    shine: ['squash', 0.5, 'twinkle', 1], shells: ['hop', 0.5, 'twinkle', 1.3], light: ['flicker', 0.9, 'chime', 0.9], spin: ['spin', 0.9, 'whoosh', 1.8],
    bounce: ['hop', 0.6, 'bump', 0.7], sand: ['squash', 0.5, 'thud', 1.5], pond: ['squash', 0.5, 'splash', 1.2], sweet: ['squash', 0.5, 'bloop', 1.5],
    snowy: ['squash', 0.5, 'pop', 1.4], wobble: ['wobble', 0.6, 'bump', 1],
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
      case 'leafy': // a tree that bears no fruit: leaves (or sweets, or snow) shake down and sometimes a butterfly flutters out
        if (pk(q.kind) === 'snowtree') puff(8, 'dust', x, top + h * 0.3, w * 0.45, ['#ffffff', '#e8f0ff']);
        else if (q.kind === 'lollitree' || area === 'candy') puff(7, 'bit', x, top + h * 0.3, w * 0.4, SWEETS);
        else { puff(q.kind === 'glowtree' ? 5 : 7, 'leaf', x, top + h * 0.3, w * 0.4); if (q.kind === 'glowtree') puff(4, 'spark', x, top + h * 0.35, w * 0.4, ['#c8fff8', '#ffffff']); }
        if (Math.random() < 0.45) flutterOut(x, top + 3);
        break;
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
      case 'snowy': puff(6, 'dust', x, top + h * 0.35, w / 2, ['#ffffff', '#e8f0ff']); break;
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
  function funWater(x, y, key) {
    sndP('splash', 1.3); markSeen('propfun');
    parts.push({ x, y, vx: 0, vy: 0, life: 0.8, type: 'ripple', color: '#ffffff' }, { x, y, vx: 0, vy: 0, life: 0.55, type: 'ripple', color: TH[area].hl || '#d6f5fd' });
    burst(x, y - 2, 'drop', 5, '#d6f5fd');
    if (Math.random() < 0.35) jumpFish(x, y);
    if (Math.random() < 0.15) funPay((key || 'water') + ':' + area, 3, x, y - 10);
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
    const pd = pondAt(x, y, 1); if (pd) { funWater(x, y, 'pond' + (pd.i | 0)); return true; }
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
    if (Z > ZFAR * 1.03) {
      zoomBack = { z: Z, x: cx, y: cy }; follow = null;
      zoomAnim = { from: Z, to: ZFAR, k: 0, c: [cx, cy, ww / 2, (Lw.maxY + 12) / 2] }; sndP('whoosh', 0.8);
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
  // ---------------- finding your Sprouts in the big garden ----------------
  // The face button under the magnifier shows who it will find next: tap it and the view glides to that Sprout (your partner
  // first, then the others in turn), which hops and waves; the camera then keeps it in view while it wanders.
  function findList() {
    const L = here.filter(r => r.state !== 'travel' && r.state !== 'enter');
    return L.sort((a, b) => (b.s.id === PS.S.activeId) - (a.s.id === PS.S.activeId) || (a.s.id < b.s.id ? -1 : a.s.id > b.s.id ? 1 : 0));
  }
  function findNext() {
    const L = findList(); if (!L.length) return;
    const i = Math.max(0, L.findIndex(r => r.s.id === findId)), r = L[i];
    findId = L[(i + 1) % L.length].s.id; // (the next tap finds the next one)
    closeCard();
    glideTo(r.x, (r.state === 'fall' ? r.y - r.z : r.y) - 12, Math.max(Z <= ZFAR * 1.03 ? 0 : Z, ZMIN * TUNE.zoomDef));
    follow = r.id; zoomBack = null;
    if (!busy(r) && r.state !== 'eat' && r.state !== 'swim') { r.state = 'idle'; r.timer = Math.max(r.timer, 1.4); hop(r); r.cheerT = 0.9; }
    emote(r, 'heart', 1.4);
    if (!sproutCry(r)) snd('coo');
    markSeen('find'); buzz(8); syncFind(true); syncZoomBtn(true);
  }
  function syncFind(force) {
    if (!findEl) return;
    const L = findList(), show = L.length > 0 && !raidHere();
    if (findEl.hidden === show) findEl.hidden = !show;
    if (!show) return;
    let r = L.find(q => q.s.id === findId); if (!r) { r = L[0]; findId = r.s.id; }
    const key = r.s.id + ':' + L.length + ':' + r.s.stage + ':' + JSON.stringify(r.s.look || {});
    if (!force && key === findKey) return; findKey = key;
    PS.ui.drawSproutTo(findEl.querySelector('canvas'), r.s, { eyes: 'happy' });
    const n = findEl.querySelector('i'); n.textContent = L.length; n.hidden = L.length < 2;
    findEl.setAttribute('aria-label', `Find ${r.s.name}`);
  }
  function syncZoomBtn(force) {
    if (!zoomBtn) return;
    const far = (zoomAnim ? zoomAnim.to : Z) <= ZFAR * 1.03;
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
    const dc = duskSprite(), dh = dc.height / SK; bx.globalAlpha = k; if (VR.y0 < dh) { const h = Math.min(dh, VR.y1) - VR.y0; bx.drawImage(dc, VR.x0 * SK, VR.y0 * SK, (VR.x1 - VR.x0) * SK, h * SK, VR.x0, VR.y0, VR.x1 - VR.x0, h); } bx.globalAlpha = 1;
    const m = moonPos(); if (!TH[area].bigMoon) glow(m.x, Math.round(m.y + n * Lw.hz * 0.9), 18, '255,170,110', 0.18 * k);
  }
  const shoot = { life: 0, x: 0, y: 0, vx: 0, vy: 0 };
  function drawMagic(n, dt) {
    const th = TH[area], dk = duskK(n);
    // golden-hour light over the whole garden
    if (dk > 0.02) { bx.globalAlpha = 0.12 * dk; bx.fillStyle = '#ff9a5a'; bx.fillRect(VR.x0, VR.y0, VR.x1 - VR.x0, VR.y1 - VR.y0); bx.globalAlpha = 1; }
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
    if (r.state === 'sleep' || r.state === 'ko') { S.eyes = 'closed'; S.mouth = 'o'; }
    if (r.atkT > 0) { S.arms = 'out'; S.mouth = 'open'; }
    if (r.hitT > 0) { S.eyes = 'sad'; S.mouth = 'o'; }
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
    const wade = !inWater(r.x, r.y) && r.state !== 'travel' && pondAt(r.x, r.y);
    if (inWater(r.x, r.y) || (r.state === 'travel' && r.x > shoreAt(r.y) + 1) || wade) {
      const wl = Math.round(r.y - (wade ? 4 : 6)), sink = Math.floor(t * 2 + r.x * 0.1) % 2;
      bx.save(); bx.beginPath(); bx.rect(0, 0, ww + 40, wl); bx.clip(); put(r.x, r.y + sink); bx.restore();
      waterline(r.x, wl, 8 + (Math.floor(t * 3) % 2));
      emPush(r, r.x, r.y + sink - head); return;
    }
    const hopY = r.hopT > 0 ? Math.round(Math.sin((1 - r.hopT / 0.35) * Math.PI) * 4) : 0;
    const breathe = !hopY && (r.state === 'idle' || r.state === 'pet' || r.state === 'ko') && Math.floor(t * 1.4 + r.ph) % 2 ? 1 : 0; // a slow 1px breath while standing
    // (a raid: a little lunge on a bonk, a shiver when bumped)
    const ox = (r.lungeT > 0 ? 2 * r.facing : 0) + (r.hitT > 0 ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0);
    shadow(r.x, r.y, 13); put(r.x + ox, r.y - hopY - breathe);
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
    const T = Lw.trees[ti];
    drawProp(T); // (its shadow is painted with the ground: paintLand)
    const sl = treeSlots(), hint = hintT === ti, ox = T.ox || 0;
    if (ox) bx.translate(ox, 0);
    sl.forEach((s, i) => {
      const p = Lw.slots[i]; if (!p || p.tree !== ti) return;
      const k = growK(s); if (k < 0.35) return;
      const f = itemSpr('fruit', s.kind);
      if (k < 1) { const sz = Math.max(3, Math.round(artW(f) * (0.3 + 0.6 * k) * SK) * FP); bx.imageSmoothingEnabled = true; bx.drawImage(f, sn(p.x - sz / 2), sn(p.y - sz / 2), sz, sz); bx.imageSmoothingEnabled = false; return; }
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
    if (a <= 0.05 || VR.y0 > Lw.hz) return;
    bx.globalAlpha = a;
    for (const c of DECO.clouds) {
      const s = cloudSpr(c.s), w = artW(s), span = ww + w + 10;
      const x = Math.round(((c.x * span + t * c.v) % span) - w / 2 - 5), y = Math.round(c.y * Lw.hz);
      if (x + w < VR.x0 || x - w > VR.x1) continue;
      PX.blit(bx, s, x, y);
    }
    bx.globalAlpha = 1;
  }
  function moonPos() { return { x: Math.round(ww * 0.8), y: Math.round(Lw.hz * 0.36) }; } // (over the water, so it shines on it)
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
      if (y < VR.y0 - 4 || y > VR.y1 + 4 || span < 16 || (Math.abs(y - Lw.dockY) < 4 && s + 10 < Lw.dockX1 + 4)) continue;
      const ph = t * f.v + f.ph, X = Math.round(s + 8 + clamp(f.a + Math.sin(ph) * f.r, 0.04, 0.96) * span), d = Math.cos(ph) >= 0 ? 1 : -1, L = f.big ? 4 : 3, wag = Math.floor(t * 4 + f.ph) % 2;
      PX.blit(bx, fishShadowSpr(th.fish, f.big, wag), X, y + 3, d < 0, L + 3, 6);
    }
    // shoreline foam (a fine-edged wiggly line along the smooth shore)
    bx.fillStyle = th.foam;
    for (let y = Math.max(wt + 1, VR.y0), y1 = Math.min(wh, VR.y1); y < y1; y++) { const s = sn(SB[y]); if (s < VR.x0 - 3 || s > VR.x1) continue; const w = Math.sin(t * 2.2 + y * 0.45); if (w > -0.2) bx.fillRect(s, y, w > 0.6 ? 1.5 : w > 0.2 ? 1 : FP, 1); if (w > 0.85 && (y & 3) === 0) bx.fillRect(s + 2, y + FP, FP, FP); }
    // little wave marks (a fine line with a lighter fine line on top)
    for (const w of DECO.waves) {
      const y = Math.round(wt + 4 + w.y * (Lw.maxY - wt)), s = shoreAt(y), x = sn(s + 4 + w.x * (ww - s - 6) + Math.sin(t * 0.5 + w.ph) * 2);
      if (y < VR.y0 || y > VR.y1 || x < VR.x0 - 5 || x > VR.x1 || Math.sin(t * 1.3 + w.ph) < -0.3) continue;
      const deep = depthK(x, y) > 0.45;
      bx.fillStyle = deep ? th.water[1] : th.hl; bx.fillRect(x, y + FP, w.w, FP);
      if (!deep) { bx.fillStyle = '#ffffff'; bx.fillRect(x + FP, y, w.w - 1, FP); }
    }
    // surf rolling in (beach)
    if (th.surf) {
      bx.fillStyle = th.foam;
      for (let i = 0; i < 2; i++) {
        const p = (t * 0.16 + i * 0.5) % 1; if (p > 0.92) continue;
        for (let y = Math.max(wt + 3, VR.y0), y1 = Math.min(wh, VR.y1); y < y1; y++) { if ((y + i) % 2 && p < 0.7) continue; const s = SB[y] - 1, X = sn(ww - p * (ww - s - 2) + Math.sin(y * 0.5 + i * 3) * 1.5); if (X >= VR.x0 - 2 && X <= VR.x1) bx.fillRect(X, y, p > 0.6 ? 1.5 : 1, 1); }
      }
      // a sailboat on the horizon
      const b = floatSprites().boat, sx = shoreAt(wt) + 10, span = ww - sx + 20, bxp = Math.round(sx + ((t * 1.1) % span) - 10);
      if (bxp > sx - 4) PX.blit(bx, b, bxp, wt + 2 + (Math.floor(t * 1.5) % 2 ? 0 : 1));
    }
    // sparkles: a fine glint
    if (Math.floor(t * 2) % 2) { bx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const y = Math.round(wt + 8 + ((i * 37 + Math.floor(t * 0.5) * 13) % Math.max(1, Lw.maxY - wt - 8))), s = shoreAt(y), x = Math.round(s + (ww - s) * (0.25 + i * 0.18)); bx.fillRect(x - FP, y + FP, 2 + FP, FP); bx.fillRect(x + FP, y, FP, 1 + FP); } }
    // moon reflection: fine shimmering lines
    const moonA = th.bigMoon ? 0.55 + 0.35 * n : n * 0.8;
    if (moonA > 0.1 && VR.y0 < wt + 40) {
      const m = moonPos(); bx.fillStyle = '#fff6c9'; bx.globalAlpha = Math.min(1, moonA);
      for (let y = wt + 1, i = 0; y < wt + 40 && y < wh; y += 1, i++) { if (m.x < shoreAt(y) + 2) continue; const w = 1 + ((i * 7 + Math.floor(t * 3)) % 3) * 0.75 + Math.max(0, 3 - i / 4.5); bx.fillRect(sn(m.x - w / 2 + Math.sin(t * 2 + i * 0.6) * 1), y + (i & 1) * FP, sn(w), FP); }
      bx.globalAlpha = 1;
    }
    // things bobbing on the water: paper lanterns (moonlit), sweets (candy)
    if (area === 'moonlit' || area === 'candy') {
      const F = floatSprites(), kinds = area === 'moonlit' ? FLOAT_MOON : FLOAT_CANDY;
      for (let i = 0; i < kinds.length; i++) {
        const f = DECO.floats[i], p = floatPos(f), s = F[kinds[i]];
        if (!p || p.x < VR.x0 - 8 || p.x > VR.x1 + 8 || p.y < VR.y0 - 8 || p.y > VR.y1 + 4) continue;
        PX.blit(bx, s, p.x, p.y + (Math.floor(t * f.v * 2 + f.ph) % 2));
        bx.fillStyle = th.hl; bx.fillRect(p.x - Math.floor(artW(s) / 2) - 1, p.y + 1, 2, FP); bx.fillRect(p.x + Math.ceil(artW(s) / 2) - 1, p.y + 1, 2, FP);
      }
    }
    // soda fizz: tiny fine bubbles
    if (th.fizz) {
      if (Math.random() < dt * 9 && fizz.length < 30) { const y = rand(Math.max(VR.y0, Lw.minY + 2), Math.min(VR.y1, Lw.maxY - 1)), s = shoreAt(y), x = s + 3 + rand(0.05, 0.95) * (ww - s - 6); if (x > VR.x0 && x < VR.x1) fizz.push({ x, y, life: rand(0.8, 1.6) }); }
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
  const FLOAT_MOON = ['lantern', 'lantern', 'lantern', 'lantern', 'lantern', 'lantern'], FLOAT_CANDY = ['donut', 'candy', 'ring', 'donut', 'candy', 'ring', 'donut', 'candy'];
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
    // (calm on purpose, the family found the old swarm distracting: each butterfly flutters slowly round its own spot, about 2 on
    // screen, instead of sweeping across the whole big garden, which made them zip past several screen widths a second)
    if (bc && day > 0.5 && area !== 'beach') {
      const nb = Math.min(DECO.bugs.length, Math.round(2 * (Lw.landK || 1))), bw = shoreAt(Lw.minY + 30) - 24;
      for (let i = 0; i < nb; i++) {
        const b = DECO.bugs[i], x = Math.round(10 + b.a * bw + Math.sin(t * 0.4 + b.p) * 16 + Math.sin(t * 1.1 + b.p * 2) * 4), y = Math.round(Lw.minY + 4 + b.b * Lw.span * 0.75 + Math.sin(t * 0.3 + b.p * 1.3) * 9 + Math.sin(t * 5 + b.p) * 1.5);
        if (x < VR.x0 - 6 || x > VR.x1 + 6 || y < VR.y0 - 6 || y > VR.y1 + 6) continue;
        fxAt(bflySpr(bc[b.c % bc.length], Math.floor(t * 7 + b.p * 3) % 2), x - 2, y - 2);
      }
    }
    const dc = DRIFT[area];
    if (dc) {
      for (let i = 0, nd = Math.min(DECO.drift.length, Math.round(1.5 * (Lw.landK || 1))); i < nd; i++) { // (a few drifting petals: about 1 on screen)
        const d = DECO.drift[i];
        const u = (d.p + t * d.v * 0.25) % 1.2 - 0.1, x = sn(u * ww), y = sn(Lw.minY - 20 + d.y * Lw.span * 0.9 + Math.sin(t * 1.3 + d.ph) * 5 + u * 20);
        if (x < VR.x0 - 4 || x > VR.x1 + 4 || y < VR.y0 - 4 || y > VR.y1 + 4) continue;
        const c = dc[d.c % dc.length], f = Math.floor(t * 3 + d.ph) % 3;
        if (area === 'moonlit') { glow(x, y, 2, '200,230,255', 0.25); bx.fillStyle = c; bx.fillRect(x, y, FP, FP); bx.fillRect(x + FP, y, FP, FP); continue; }
        bx.fillStyle = c; petal(x, y, f);
      }
    }
    if ((area === 'beach' || area === 'meadow') && day > 0.4 && VR.y0 < Lw.hz) {
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
    if (VR.y0 < Lw.hz) for (const s of DECO.stars) if (s.tw && Math.sin(t * 2 + s.ph) > -0.2) {
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
    for (let n2 = 0; n2 < 2; n2++) for (const p of n2 ? Lw.trees || [] : Lw.props) { const g = GLOWS[p.kind]; if (!g || p.x < VR.x0 - 16 || p.x > VR.x1 + 16 || p.y < VR.y0 - 4 || p.y - 50 > VR.y1) continue; const pulse = 0.8 + Math.sin(t * 2 + p.x) * 0.2; glow(p.x, p.y - artH(p.c) * g[1], g[2], g[3], 0.3 * lit * pulse); }
    // the rest house's windows light up (brighter when someone is inside)
    if (Lw.home) {
      const H = Lw.home; let full = false; for (const s of PS.S.sprouts) if (s.area === area && s.home) { full = true; break; }
      for (const w of H.info.win || []) { glow(H.x + w[0], H.y + w[1], full ? 7 : 5, '255,236,150', (full ? 0.4 : 0.22) * lit); bx.fillStyle = full ? '#fff27a' : '#f6c83a'; bx.fillRect(H.x + w[0] - 1, H.y + w[1] - 1, 1.5, 1.5); if (full) { bx.fillStyle = '#fffbd0'; bx.fillRect(H.x + w[0] - 1, H.y + w[1] - 1, FP, FP); } }
    }
    // glowing plants
    for (const c of critters) { const gcol = PLANT_GLOW[c.id]; if (gcol) glow(c.x, c.y - (c.where === 'water' ? 5 : 9), 8, gcol, 0.3 * lit * (0.75 + Math.sin(t * 2.4 + c.ph) * 0.25)); }
    // holiday mode: the holiday tree glows warmly at dusk (its star a little brighter), and the Reindeer's red nose glows
    if (Lw.xmas && lit > 0.15) { const X = Lw.xmas, h = artH(X.c); glow(X.x, X.y - h * 0.45, 16, '255,228,150', 0.13 * lit * (0.85 + Math.sin(t * 1.1) * 0.15)); glow(X.x, X.y - h * 0.93, 5, '255,242,120', 0.3 * lit); }
    for (const c of critters) if (c.id === 'reindeer' && c.life >= 3) glow(c.x + c.facing * NOSE[0], c.y - NOSE[1], 4, '255,80,96', 0.5 * lit * (0.8 + Math.sin(t * 2.6 + c.ph) * 0.2));
    // spooky Sprouts glow softly at night
    if (lit > 0.3) for (const r of here) { const sp = SPOOKY[r.s.look && r.s.look.skin]; if (sp && r.state !== 'travel') glow(r.x, (r.state === 'held' ? r.feetY : r.y - (r.state === 'fall' ? r.z : 0)) - 12, 10, sp.glow, 0.13 * lit); }
    // glowing reed tips and lotus buds, the lighthouse beam, floating lanterns
    for (const q of Lw.glowPts || []) { if (q.x < VR.x0 - 4 || q.x > VR.x1 + 4 || q.y < VR.y0 - 4 || q.y > VR.y1 + 4) continue; const pulse = 0.7 + Math.sin(t * 1.7 + q.x * 0.3) * 0.3; glow(q.x, q.y, 3, '160,250,255', 0.3 * lit * pulse); bx.fillStyle = '#c8fff8'; bx.fillRect(q.x, q.y, FP, FP); }
    if (Lw.beacon && Math.floor(t * 1.2) % 3 !== 2) { glow(Lw.beacon.x, Lw.beacon.y, 5, '255,242,170', 0.5 * lit); bx.fillStyle = '#fff27a'; bx.fillRect(Lw.beacon.x - 1, Lw.beacon.y, 3, 1); bx.fillStyle = '#ffffff'; bx.fillRect(Lw.beacon.x - FP, Lw.beacon.y, 1, FP); }
    if (area === 'moonlit') for (let i = 0; i < FLOAT_MOON.length; i++) { const p = floatPos(DECO.floats[i]); if (!p || p.x < VR.x0 - 8 || p.x > VR.x1 + 8 || p.y < VR.y0 - 4 || p.y > VR.y1 + 8) continue; glow(p.x, p.y - 4, 6, '255,220,140', 0.28 * lit); const Y = p.y - 4.5 + (Math.floor(t * DECO.floats[i].v * 2 + DECO.floats[i].ph) % 2); bx.fillStyle = '#fff27a'; bx.fillRect(p.x, Y, 1, 1); bx.fillStyle = '#ffffff'; bx.fillRect(p.x, Y, FP, FP); }
    // fireflies: a glowing dot with a white-hot centre, drifting slowly round its own spot and glowing on and off gently
    // (calm on purpose, the family found the old swarm distracting: about 2-3 lit on screen at night, a few more in the Moonlit
    // Grove; they used to sweep across the whole big garden, zipping past several screen widths a second)
    const count = Math.round(((th.bigMoon ? 5 : 0) + 5 * n) * (Lw.landK || 1)), fw = shoreAt(Lw.minY + 20) - 12;
    for (let i = 0; i < Math.min(count, DECO.flies.length); i++) {
      const f = DECO.flies[i];
      const x = Math.round(8 + f.a * fw + Math.sin(t * 0.3 + f.p) * 9 + Math.sin(t * 0.8 + f.p * 2) * 3), y = Math.round(Lw.minY - 6 + f.b * Lw.span * 0.8 + Math.sin(t * 0.24 + f.p * 1.7) * 6 + Math.cos(t * 0.7 + f.p) * 2);
      if (x < VR.x0 - 3 || x > VR.x1 + 3 || y < VR.y0 - 3 || y > VR.y1 + 3 || Math.sin(t * 1.5 + f.p * 3) < -0.2) continue;
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

  // ---------------- holiday mode: the holiday tree, its daily gift, falling snow ----------------
  // The tree (a prop, placed by buildProps) has a few lights that fade up and down slowly, out of step, and a star that glints now
  // and then. Its gift (PS.holiday, one a day per player) waits at its foot: tap it for a surprise. giftOn: a gift is waiting
  // (checked with the hints, a few times a second).
  let giftOn = false, tellAt = 0;
  const NOSE = [7, 12]; // the Reindeer's nose, from its feet (world px; mirrored when it faces left)
  const LIGHTS = [[-0.17, 0.33], [0.15, 0.37], [-0.05, 0.46], [0.25, 0.51], [-0.29, 0.57], [0.05, 0.61], [0.33, 0.68], [-0.21, 0.71], [0.12, 0.77]];
  const LIGHT_COL = ['#ff6a6a', '#ffd84a', '#7ad0ff', '#ff9ad8', '#8ef07a'], LIGHT_RGB = ['255,106,106', '255,216,74', '122,208,255', '255,154,216', '142,240,122'];
  function treeLights(q) {
    if (RMO) return;
    const w = artW(q.c), h = artH(q.c), left = q.x - Math.floor(w / 2) + (q.ox || 0), top = q.y - h, lit = 0.4 + 0.6 * PS.clock.night();
    for (let i = 0; i < LIGHTS.length; i++) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.2 + i * 2.3); if (k < 0.4) continue;
      const x = sn(left + w * (0.5 + LIGHTS[i][0])), y = sn(top + h * LIGHTS[i][1]), c = i % LIGHT_COL.length;
      glow(x, y, 2, LIGHT_RGB[c], 0.5 * k * lit);
      bx.fillStyle = LIGHT_COL[c]; bx.fillRect(x - FP, y - FP, 2 * FP, 2 * FP);
      if (k > 0.8) { bx.fillStyle = '#ffffff'; bx.fillRect(x - FP, y - FP, FP, FP); }
    }
    if (Math.sin(t * 0.8) > 0.75) { const x = sn(left + w * 0.5), y = sn(top + h * 0.075); bx.fillStyle = '#ffffff'; bx.fillRect(x - 1.5, y, 3, FP); bx.fillRect(x, y - 1.5, FP, 3); }
  }
  const giftSpr = () => propSpr(GIFT_OF[area] || 'gift', themeOf(area));
  function drawGift() {
    const G = Lw.gift, c = giftSpr(), bob = RMO ? 0 : Math.floor(t * 1.5) % 2;
    shadow(G.x, G.y, Math.max(8, artW(c) - 3));
    PX.blit(bx, c, G.x, G.y - bob);
    // a sparkle above it (blinking until the first gift has been opened, then now and then)
    if (seen('gift') ? Math.floor(t * 1.2 + 0.5) % 4 === 0 : Math.floor(t * 3) % 2) fxAt(whiteSpark(), G.x + Math.round(artW(c) / 2) - 2, G.y - artH(c) - 3 - bob);
  }
  function giftHit(p) {
    const G = Lw.gift; if (!giftOn || !G) return false;
    const c = giftSpr(); return Math.abs(p.x - G.x) < Math.max(artW(c) / 2 + 2, hitR(7)) && p.y > G.y - artH(c) - Math.max(4, hitR(7) - 4) && p.y < G.y + 4;
  }
  // the prize's picture for the moment (the same art the shop shows for gumball prizes)
  function giftArt(r) {
    if (r.type === 'coins') return PX.item('bigcoin');
    if (r.type === 'fruit' || r.type === 'goldfruit' || r.type === 'egg') return PX.item(r.type === 'egg' ? 'egg' : 'fruit', r.id);
    if (PS.styleArt && PS.styleArt.item) return PS.styleArt.item(r.type, r.id);
    return PX.item(r.type, r.id);
  }
  function openGift() {
    const G = Lw.gift, r = PS.holiday.openGift(); giftOn = false; if (!r || !G) return;
    markSeen('gift'); buzz(20); sndP('twinkle', 1.1);
    burst(G.x, G.y - 6, 'spark', 16, '#fbf236'); burst(G.x, G.y - 6, 'spark', 10, '#ffffff'); burst(G.x, G.y - 8, 'petal', 8, '#e8445a');
    for (const q of here) if (!busy(q) && q.state !== 'sleep' && dist(q, G) < 60) { q.cheerT = 1.4; emote(q, 'heart', 1.6); q.facing = G.x > q.x ? 1 : -1; }
    let icon = null; try { icon = giftArt(r); } catch (e) { icon = null; }
    const o = { kind: 'gift', wait: true, eyebrow: 'Happy holidays!', title: r.title, sub: r.text + ' Another gift will be under the tree tomorrow!', icon, button: 'Yay!' };
    if (PS.ui.celebrate) PS.ui.celebrate(o);
    else PS.ui.modal({ eyebrow: o.eyebrow, title: ST.esc(o.title), html: `<p>${ST.esc(o.sub)}</p>`, buttons: [{ label: 'Yay!', kind: 'primary' }] });
  }
  // falling snow: calm on purpose (the family found busy skies distracting): 22 flakes spread over the view whatever the zoom, each
  // drifting down a screen in 20-45 s with a gentle sway; drawn above the night tint, so it shows at night too
  function drawSnow() {
    const vw = VR.x1 - VR.x0, vh = VR.y1 - VR.y0;
    bx.fillStyle = '#ffffff'; bx.globalAlpha = 0.85;
    for (const f of SNOW) {
      const x = sn(VR.x0 + ((((f.x + Math.sin(t * 0.35 + f.ph) * 0.015) % 1) + 1) % 1) * vw), y = sn(VR.y0 + ((f.y + t * f.v) % 1) * vh);
      if (f.big) { bx.fillRect(x - FP, y, 3 * FP, FP); bx.fillRect(x, y - FP, FP, 3 * FP); } else bx.fillRect(x, y, 2 * FP, 2 * FP);
    }
    bx.globalAlpha = 1;
  }
  // holiday mode switched on or off (the date, or Parent tools): the ground, the scenery and the tree are rebuilt; the Reindeer leaves
  function holidayCheck() {
    const h = holOn(); if (h === HOL) return;
    HOL = h; giftOn = false;
    if (!h) critters = critters.filter(c => !(D.ANIMALS[c.id] || {}).season);
    if (ww && Lw.shore.length) layout();
  }

  // ---------------- night raids ----------------
  // Now and then, on a night, the gloom comes to the garden you're looking at (if it has Sprouts playing outside). A banner warns
  // ("The gloom is coming!") with a 10 second countdown while your Sprouts hurry together; a shadow portal swirls open on the lawn
  // and the Gloomlings come out of it in waves (Gloom Bats swoop, Shadow Wisps throw shadow balls, Gloom Brutes plod; a big raid
  // may end with the Gloom King). The fight runs by itself: each Sprout fights its own way (its element's shot, a bonk for a
  // strong Sprout with horns, claws or spikes, a little heal now and then from a Sweet or Light one; wings help dodge, a shell
  // or a mushroom cap makes it sturdier); tap a Sprout, then a Gloomling, to choose its target; a snack heals a Sprout and even
  // wakes a resting one. Win: coins, XP and a cheer. Lose: the Moon Owl swoops in and chases the gloom away. Nothing is ever
  // taken: a Sprout that runs out of puff just rests for 30 seconds with dizzy stars. Raids come only at night, at most one a
  // night (PS.S.raids.night = the clock's phase of the last one), never while a new player is still learning, while something
  // is being dragged, carried or hatched, while a pop-up is up, or when a grown-up switched them off (PS.S.raidsOff).
  // (gHp / gAtk: the Gloomlings' hit points and bumps; range: how far a Sprout's shot reaches. Tuned with __garden.raidSim so a
  // family of fresh Sprouts usually wins, but with a few bumps and now and then a Sprout that needs a rest.)
  const RAID = { after: [35, 130], warn: 10, minLeft: 100, koMs: 30000, dmgK: 0.55, cd: 1.7, maxZ: 12, waveGap: 7, giveUp: 180, gap: 66, gHp: 1.35, gAtk: 1.2, range: 58 };
  // the Gloomlings: hit points and attack (x a Sprout-like level), speed (world px/s), how close they come to bump (reach)
  const GK = {
    blob: { hp: 1, atk: 1, sp: 7, reach: 11 }, bat: { hp: 0.6, atk: 0.85, sp: 15, reach: 10 }, wisp: { hp: 0.7, atk: 0.9, sp: 8, reach: 46, ranged: true },
    brute: { hp: 2.4, atk: 1.35, sp: 5, reach: 14 }, king: { hp: 7, atk: 1.6, sp: 4, reach: 19 },
  };
  // (their sizes if the raid art isn't loaded: the same as art-raid.js's PX.raid.UNITS)
  const GU = { blob: { w: 18, h: 16, hover: 0, cy: 7, top: 15, name: 'Gloomling' }, bat: { w: 20, h: 16, hover: 4, cy: 9, top: 15, name: 'Gloom Bat', fly: true },
    wisp: { w: 14, h: 18, hover: 1, cy: 10, top: 17, name: 'Shadow Wisp', fly: true }, brute: { w: 26, h: 26, hover: 0, cy: 11, top: 23, name: 'Gloom Brute' },
    king: { w: 44, h: 44, hover: 0, cy: 17, top: 40, name: 'Gloom King' } };
  const GMOVE = { bump: { name: 'Gloom Bump', el: 'shadow', pow: 32, acc: 1, fx: {} }, ball: { name: 'Shadow Ball', el: 'shadow', pow: 26, acc: 1, fx: {} }, stomp: { name: 'Gloom Stomp', el: 'shadow', pow: 40, acc: 1, fx: {} } };
  const BRAWNY = ['horns', 'claws', 'spikes', 'thorns', 'tail'], WINGED = ['wings', 'batwings', 'fairywings', 'flamewings', 'dragonwings'];
  const engine = () => { try { return window.__battle && window.__battle.engine; } catch (e) { return null; } };
  const raidSave = () => { let R = PS.S.raids; if (!R || typeof R !== 'object' || Array.isArray(R)) R = PS.S.raids = {}; return R; };
  let raidClock = 0, nextRaid = 0, raidEl = null, raidSong = null, musicBackAt = 0, zid = 0;
  // (in a balance test, raid.sim: no sounds, floaters, sparkles or rewards)
  const rsnd = (n, p) => { if (raid && !raid.sim) sndP(n, p); };
  const rfloat = (text, col, x, y) => { if (raid && !raid.sim) floater(text, col, x, y); };
  const rburst = (x, y, type, n, col) => { if (raid && !raid.sim) burst(x, y, type, n, col); };
  const outHere = () => here.filter(r => !r.s.home && r.state !== 'travel' && r.state !== 'enter' && r.state !== 'arrive' && !(r.koUntil > Date.now()));
  const aliveP = () => raid.ps.filter(u => !u.dead && !u.r.s.home && here.includes(u.r));
  const UZ = [], UP = []; // (reused lists of the fighters on each side)
  const cdOf = F => RAID.cd * clamp(36 / (18 + (F.spd || 10) * 0.6), 0.55, 1.45);
  const unitOf = z => (PX.raid && PX.raid.UNITS && PX.raid.UNITS[z.kind]) || GU[z.kind] || GU.blob;
  const elColor = el => (D.ELEMENTS[el] || D.ELEMENTS.normal || { color: '#ffffff' }).color;
  function raidTick(dt) {
    raidClock += dt;
    if (raid) {
      if (raidHere()) { raid.away = 0; updateRaid(dt); }
      // (you went to another area: the gloom waits there for you, and gives up after a few minutes)
      else if ((raid.away = (raid.away || 0) + dt) > RAID.giveUp) endRaid(true);
      return;
    }
    let night = false, ph = -1; try { night = PS.clock.isNight(); ph = PS.clock.phase(); } catch (e) { night = false; }
    if (!night) { nextRaid = 0; return; }
    if (PS.S.raids && PS.S.raids.night === ph) return; // (one a night)
    if (!nextRaid) { nextRaid = raidClock + rand(...RAID.after); return; }
    if (raidClock < nextRaid) return;
    if (PS.S.raidsOff || !canRaid()) { nextRaid = raidClock + 15; return; }
    let left = 0; try { left = PS.clock.msToSwitch() / 1000; } catch (e) { left = 0; }
    if (left < RAID.minLeft) return; // (too near morning: the next night)
    startRaid(false);
  }
  function canRaid() {
    return visible && !learning() && outHere().length > 0 && !drag && !pinch && !hatchFx.size && !hatchWait && !PS.ui.modalOpen && !PS.ui.menuOpen
      && !here.some(r => r.state === 'held' || r.state === 'fall' || r.state === 'cocoon');
  }
  const comingText = () => `The gloom is coming to ${toArea(raid.area)}!`;
  const fightText = () => (raid.king && raid.zs.some(z => z.boss && !z.dead) ? 'The Gloom King is here!' : 'Gloomlings!');
  function raidUI(title, sub, big) {
    if (raid && title) raid.ui = [title, sub, big];
    if (!raidEl) {
      raidEl = document.createElement('div'); raidEl.className = 'g-raid'; raidEl.setAttribute('role', 'status');
      raidEl.innerHTML = '<canvas class="px" width="32" height="32" aria-hidden="true"></canvas><span><b></b><small></small></span><i></i>'; root.appendChild(raidEl);
      try { const ic = PX.raid && PX.raid.icon ? PX.raid.icon('raid') : null; if (ic) PS.ui.paint(raidEl.querySelector('canvas'), ic); else raidEl.querySelector('canvas').remove(); } catch (e) { /* art optional */ }
    }
    raidEl.hidden = !title;
    raidEl.querySelector('b').textContent = title || ''; raidEl.querySelector('small').textContent = sub || ''; raidEl.querySelector('i').textContent = big == null ? '' : big;
    raidEl.classList.toggle('g-raid-big', big != null);
  }
  function raidSub(text) { if (raidEl && !raidEl.hidden) raidEl.querySelector('small').textContent = text; if (raid && raid.ui) raid.ui[1] = text; }
  function raidHold(on) { if (!raid || raid.sim) return; if (on && !raid.held) { raid.held = true; PS.ui.hold(true); } else if (!on && raid.held) { raid.held = false; PS.ui.hold(false); } }
  // where the Sprouts gather (between your partner and the middle of the group) and where the portal opens (to the side with more
  // lawn, a little way off, on open grass)
  function startRaid(sim) {
    const mine = outHere(); if (!mine.length) return false;
    const act = ST.active(), lead = mine.find(r => r.s === act) || mine[0];
    let cx = 0, cy = 0; for (const r of mine) { cx += r.x; cy += r.y; } cx /= mine.length; cy /= mine.length;
    const ry0 = clamp(lerp(cy, lead.y, 0.5), Lw.minY + 34, Lw.maxY - 18), rally = lawnPoint(clamp(lerp(cx, lead.x, 0.5), 40, lawnRight(ry0) - 40), ry0, 22);
    const side = lawnRight(rally.y) - rally.x > rally.x ? 1 : -1; let portal = null;
    for (const d of [RAID.gap, RAID.gap * 0.8, RAID.gap * 1.25]) for (const sg of [side, -side]) {
      if (portal) break;
      const p = { x: Math.round(rally.x + sg * d), y: Math.round(clamp(rally.y + rand(-12, 12), Lw.minY + 16, Lw.maxY - 6)) };
      if (p.x > 22 && p.x < lawnRight(p.y) - 18 && !pondAt(p.x, p.y, 20) && !(Lw.home && Math.abs(p.x - Lw.home.x) < Lw.home.w / 2 + 16 && Math.abs(p.y - Lw.home.y) < 20)) portal = p;
    }
    if (!portal) portal = { x: Math.round(clamp(rally.x + side * RAID.gap, 22, lawnRight(rally.y) - 18)), y: rally.y };
    raid = { area, sim: !!sim, phase: 'warn', t: RAID.warn, lastN: -1, rally, portal, side: portal.x > rally.x ? 1 : -1, openK: 0, zs: [], ps: [], shots: [], poofs: [], queue: planRaid(mine), sel: null, killed: 0, clock: 0, flash: 0, wave: 0, king: false, held: false, away: 0 };
    if (sim) return true;
    // the pictures this raid needs are drawn a couple a frame during the warning (the King's take a moment on an older iPad)
    const kinds = [...new Set(raid.queue.map(q => q.kind))], els = [...new Set(mine.map(r => { try { return ST.elementsOf(r.s)[0]; } catch (e) { return 'normal'; } }))];
    raid.warm = [];
    for (const k of kinds) for (let pi = 0; pi < POSE_ID.length; pi++) raid.warm.push(() => gloomSpr(k, pi));
    for (const id of ['portal0', 'portal1', 'poof', 'poof1', 'poof2', 'ko', 'ko1', 'shadowball'].concat(els.map(el => SHOT_ID[el] || 'shot:normal'))) raid.warm.push(() => raidFx(id));
    raid.warm.push(() => owlSpr(0), () => owlSpr(1));
    raidSave().night = PS.clock.phase(); PS.save();
    closeCard(); raidHold(true); follow = null; zoomBack = null; hintEl.style.opacity = 0;
    // everyone hurries over to the rally point (the ones further off arrive during the fight)
    mine.forEach((r, i) => { // (a little formation facing the portal, rows of three)
      if (['eat', 'pet', 'sleep', 'swim', 'wait'].includes(r.state)) { r.state = 'idle'; r.eat = null; }
      const row = Math.floor(i / 3), col = i % 3, y = clamp(rally.y + (col - 1) * 16 + (row % 2) * 6, Lw.minY + 4, Lw.maxY), x = clamp(rally.x - raid.side * (4 + row * 22 + Math.abs(col - 1) * 5), 8, lawnRight(y) - 4);
      goTo(r, x, y, { type: 'rally' }); emote(r, '!', 2);
    });
    // the camera shows the gathering place and where the portal will open
    const gap = Math.abs(portal.x - rally.x) + 150;
    glideTo((rally.x + portal.x) / 2, (rally.y + portal.y) / 2 - 14, clamp(Math.min(Z <= ZFAR * 1.03 ? ZMIN * TUNE.zoomDef : Z, W / gap), Math.max(ZFAR * 1.05, ZMIN * 1.05), ZMAX));
    raidUI(comingText(), 'Get ready...', RAID.warn);
    sndP('whoosh', 0.7); buzz(60);
    return true;
  }
  // what comes: 1-3 waves, more Gloomlings for more Sprouts, stronger ones for stronger Sprouts (a little weaker than them), wisps
  // and brutes in the later waves, and sometimes the Gloom King at the end of a big raid
  function planRaid(mine) {
    const lvs = mine.map(r => ST.totalLevels(r.s)), lv = lvs.reduce((a, b) => a + b, 0) / Math.max(1, lvs.length), best = Math.max(0, ...lvs);
    const T = mine.length, n = clamp(Math.round(1 + T * 0.85 + lv / 30 + Math.random()), 2, RAID.maxZ);
    const waves = n >= 7 ? 3 : n >= 3 ? 2 : 1, L = Math.max(1, Math.round(lv * rand(0.55, 0.8)));
    // (a small team meets them one at a time: they come further apart, and no bats in the first wave)
    const gapK = T <= 1 ? 4 : T === 2 ? 2.6 : T === 3 ? 1.7 : 1, hpK = clamp(0.55 + 0.075 * T, 0.6, 1); // (and they're a little softer)
    const q = []; let at = 1;
    for (let w = 0, i = 0; w < waves; w++) {
      const m = Math.round(n * (w + 1) / waves) - i;
      for (let j = 0; j < m; j++, i++) {
        const r = Math.random(), kind = w === 0 ? (r < 0.75 || T <= 2 ? 'blob' : 'bat') : r < 0.42 ? 'blob' : r < 0.68 ? 'bat' : r < 0.88 || lv < 14 ? 'wisp' : 'brute';
        q.push({ kind, L: Math.max(1, Math.round(L * (1 + w * 0.08))), hpK, delay: at, wave: w, waves }); at += rand(1.1, 2) * gapK;
      }
      at += RAID.waveGap;
    }
    if (waves >= 3 && mine.length >= 3 && (mine.length >= 4 || best >= 20) && Math.random() < 0.3) q.push({ kind: 'king', L: Math.max(2, Math.round(L * 1.1)), delay: at - RAID.waveGap + 3, wave: waves - 1, waves, boss: true });
    return q;
  }
  // a Sprout's fighter (the battle engine's, so stats, elements and moves count just as in battles) and its way of fighting
  function fighterOf(s, E) {
    if (E && E.makeFighter) { try { return E.makeFighter(s, 'p', 1, null, true); } catch (e) { /* the simple one below */ } }
    const b = ST.battleStats(s);
    return { side: 'p', st: { atk: 0, def: 0, spd: 0, eva: 0, acc: 0 }, status: null, s, name: s.name, moves: ST.movesOf(s).filter(id => D.MOVES[id]), els: b.els.slice(), lv: b.level, max: b.hp, hp: b.hp, atk: b.atk, def: b.def, spd: b.spd, eva: b.eva };
  }
  function bestMove(F) {
    let best = null, bs = -1;
    for (const id of F.moves || []) { const m = D.MOVES[id]; if (!m || !(m.pow > 0)) continue; const sc = m.pow * ((m.fx && m.fx.hits) || 1) * ((F.els || []).includes(m.el) ? 1.25 : 1) * (m.acc || 1); if (sc > bs) { bs = sc; best = m; } }
    return best || D.MOVES.tackle || { name: 'Tackle', el: 'normal', pow: 35, acc: 1, fx: {} };
  }
  function hitFor(a, d, mv) {
    const E = engine(); let n = 0;
    try { if (E && E.baseDamage) n = E.baseDamage(a, d, mv) * ((mv.fx && mv.fx.hits) || 1); } catch (e) { n = 0; }
    if (!(n > 0)) n = mv.pow * Math.pow(Math.max(1, a.atk) / Math.max(1, d.def), 0.65) * 0.104 * (1.5 + (a.lv || 0) / 45) * ((a.els || []).includes(mv.el) && mv.el !== 'normal' ? 1.25 : 1);
    return Math.max(1, Math.round(n * RAID.dmgK * rand(0.85, 1.15)));
  }
  function beginFight() {
    raid.phase = 'fight'; raid.clock = 0;
    const E = engine();
    raid.ps = outHere().map(r => {
      if (r.state === 'cocoon') return null; // (one being carried joins in when it's set down)
      if (['eat', 'pet', 'sleep', 'swim', 'wait'].includes(r.state)) { r.state = 'idle'; r.eat = null; }
      r.target = null;
      if (inWater(r.x, r.y)) { const q = coastPoint(r.y); r.x = q.x - 4; r.y = q.y; }
      const s = r.s, F = fighterOf(s, E), P = s.parts || {}, top = ST.domStat ? ST.domStat(s) : 'power', el = (F.els && F.els[0]) || 'normal', mv = bestMove(F);
      const bonk = (BRAWNY.some(k => (P[k] || 0) > 0) && (top === 'power' || top === 'stamina')) || (el === 'stone' && top === 'power');
      if ((P.shell || 0) + (P.mushcap || 0) > 0) F.max = Math.round(F.max * 1.2);
      return { r, F, mv, hp: F.max, max: F.max, cd: rand(0.3, 1.2), style: bonk ? 'bonk' : 'shot', el: mv.el !== 'normal' ? mv.el : el, range: bonk ? 13 : RAID.range,
        heals: el === 'sweet' || el === 'light', eva: (F.eva || 0) + (WINGED.some(k => (P[k] || 0) > 0) ? 0.12 : 0), pick: null, tgt: null, dead: 0, n: 0, bitten: 0 };
    }).filter(Boolean);
    for (const u of raid.ps) u.r.inRaid = true;
    if (raid.sim) return;
    if (raid.warm) { for (const f of raid.warm) f(); raid.warm = null; }
    raidUI(fightText(), raid.ps.length > 1 ? 'Tap a Sprout, then a Gloomling!' : 'Tap your Sprout, then a Gloomling!');
    sndP('whoosh', 1.1);
  }
  function makeGloom(q) {
    const G = GK[q.kind] || GK.blob, L = q.L, F = { side: 'o', st: { atk: 0, def: 0, spd: 0, eva: 0, acc: 0 }, status: null, name: (GU[q.kind] || GU.blob).name, els: ['shadow'], lv: L,
      atk: Math.round((11 + 0.42 * L) * G.atk * RAID.gAtk), def: Math.round(10 + 0.4 * L), spd: Math.round(10 + 0.35 * L), eva: 0 };
    F.max = F.hp = Math.round((30 + 2.2 * L) * G.hp * RAID.gHp * (q.hpK || 1));
    const p = raid.portal, a = rand(0, 6.283), z = { id: zid++, kind: GK[q.kind] ? q.kind : 'blob', G, F, hp: F.max, max: F.max, x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 1.5, rise: 1, cd: rand(0.8, 1.8),
      facing: -raid.side, hitT: 0, atkT: 0, dead: 0, kb: 0, ph: Math.random() * 6.28, boss: !!q.boss, tgt: null };
    z.U = unitOf(z); return z;
  }
  function nearestGloom(x, y) { let b = null, bd = 1e9; for (const z of raid.zs) { if (z.dead || z.rise > 0) continue; const d = Math.hypot(z.x - x, (z.y - y) * 1.4); if (d < bd) { bd = d; b = z; } } return b; }
  function updateRaid(dt) {
    raid.flash = Math.max(0, raid.flash - dt);
    const wantOpen = raid.phase === 'fight' || (raid.phase === 'warn' && raid.t < 2.5) ? 1 : 0;
    raid.openK = clamp(raid.openK + clamp(wantOpen - raid.openK, -dt * 1.2, dt * 1.6), 0, 1);
    if (raid.poofs.length) { for (const p of raid.poofs) p.t += dt; if (raid.poofs[0].t > 0.9) raid.poofs = raid.poofs.filter(p => p.t <= 0.9); }
    if (raid.phase === 'warn') {
      for (let i = 0; i < 2 && raid.warm && raid.warm.length; i++) raid.warm.shift()();
      raid.t -= dt; const n = Math.max(0, Math.ceil(raid.t));
      if (n !== raid.lastN) { raid.lastN = n; raidUI(comingText(), n > 3 ? 'Your Sprouts are getting ready...' : 'Here it comes!', n); if (n > 0) sndP(n <= 3 ? 'tick' : 'pop', 1); }
      if (raid.t < 2.5 && !raid.portalSnd) { raid.portalSnd = true; rsnd('portal'); }
      if (raid.t <= 0) beginFight();
      return;
    }
    if (raid.phase === 'fight') {
      raid.clock += dt;
      while (raid.queue.length && raid.queue[0].delay <= raid.clock) {
        const q = raid.queue.shift(), z = makeGloom(q); raid.zs.push(z);
        if (!raid.sim && q.waves > 1 && q.wave > raid.wave) { raid.wave = q.wave; raidUI(fightText(), q.wave === q.waves - 1 ? `Last wave! (${q.wave + 1} of ${q.waves})` : `Wave ${q.wave + 1} of ${q.waves}!`); }
        rburst(z.x, z.y - 4, 'spark', z.boss ? 16 : 6, '#c9a2f0'); rsnd('gloom', z.boss ? 0.7 : 1);
        if (z.boss) { raid.king = true; if (!raid.sim) { raidUI('The Gloom King is here!', 'Everyone, together!'); raid.flash = 0.25; buzz(60); } }
      }
      for (const z of raid.zs) updateGloom(z, dt);
      for (const u of raid.ps) updateFighter(u, dt);
      // fighters on the same side don't stand inside each other (a gentle push apart; carried Sprouts stay put)
      UZ.length = 0; for (const z of raid.zs) if (!z.dead && z.rise <= 0) UZ.push(z);
      UP.length = 0; for (const u of raid.ps) if (!u.dead && !u.r.s.home && u.r.state !== 'held' && u.r.state !== 'fall' && here.includes(u.r)) UP.push(u.r);
      unstack(UZ, z => (z.boss ? 14 : z.kind === 'brute' ? 9 : 6), dt);
      unstack(UP, () => 8.5, dt);
      updateShots(dt);
      let left = raid.queue.length; for (const z of raid.zs) if (!z.dead) left++;
      if (!left) winRaid();
      else if (!UP.length && !raid.ps.some(u => !u.dead && !u.r.s.home && here.includes(u.r))) loseRaid();
      else if (!raid.sim && raid.shownN !== left && raid.clock > 3 && !raid.sel) { raid.shownN = left; const W2 = raid.queue.concat(raid.zs).reduce((m, z) => Math.max(m, z.waves || 1), 1); raidSub(`${left} Gloomling${left === 1 ? '' : 's'} left` + (W2 > 1 ? ` · wave ${raid.wave + 1} of ${W2}` : '')); }
      return;
    }
    // the end: the cheer, or the Moon Owl, then the portal swirls shut
    raid.t -= dt;
    for (const z of raid.zs) if (z.dead) z.dead += dt;
    if (raid.phase === 'rescue') updateOwl(dt);
    if (raid.phase === 'win' && raid.t <= 0) { raid.phase = 'done'; raid.t = 0.8; }
    if (raid.phase === 'done' && raid.t <= 0 && raid.openK <= 0) endRaid(false);
  }
  function unstack(list, rad, dt) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], need = rad(a) + rad(b); let dx = b.x - a.x, dy = (b.y - a.y) * 1.6; const d = Math.hypot(dx, dy);
      if (d >= need) continue;
      if (d < 0.01) { dx = 0.5; dy = 1; }
      const k = Math.min(1, dt * 6) * (need - d) / 2 / Math.max(0.01, Math.hypot(dx, dy));
      a.x -= dx * k; b.x += dx * k; a.y -= dy * k / 1.6; b.y += dy * k / 1.6;
      for (const o of [a, b]) { o.y = clamp(o.y, Lw.minY, Lw.maxY); o.x = clamp(o.x, 6, lawnRight(o.y)); }
    }
  }
  function updateFighter(u, dt) {
    const r = u.r;
    if (u.dead || r.state === 'held' || r.state === 'fall' || r.s.home || !here.includes(r)) return; // (resting, carried or gone inside: not fighting)
    u.cd -= dt; if (u.bitten > 0) u.bitten -= dt;
    // a Sweet or Light Sprout now and then heals the most hurt friend instead
    if (u.heals && u.cd <= 0 && u.n % 3 === 2) {
      let hurt = null; for (const o of aliveP()) if (o.hp < o.max * 0.6 && (!hurt || o.hp / o.max < hurt.hp / hurt.max)) hurt = o;
      if (hurt) {
        const k = Math.max(2, Math.round(hurt.max * 0.15)); hurt.hp = Math.min(hurt.max, hurt.hp + k); u.cd = cdOf(u.F) * 1.2; u.n++; r.cheerT = 0.4;
        rfloat('+' + k, '#3f9a3a', hurt.r.x, headY(hurt.r) - 2); rburst(hurt.r.x, hurt.r.y - 12, 'spark', 6, '#c8ff9a'); if (!raid.sim) heartUp(hurt.r.x, hurt.r.y - 18);
        return;
      }
    }
    const dz = z => Math.hypot(z.x - r.x, (z.y - r.y) * 1.4);
    if (u.pick && u.pick.dead) u.pick = null;
    let tg = u.pick || nearestGloom(r.x, r.y);
    // (being bumped, or its pick is out of reach: it fights whatever is closest)
    if (tg && dz(tg) > u.range && u.bitten > 0) { const nz = nearestGloom(r.x, r.y); if (nz && dz(nz) <= u.range) tg = nz; }
    u.tgt = tg;
    if (!tg) { r.state = 'idle'; return; }
    r.facing = tg.x > r.x ? 1 : -1;
    const d = dz(tg);
    if (d > u.range) { // walk up (a shooter only until it's in range)
      const sp = (TUNE.walkSpeed + r.s.stats.run.lv * TUNE.walkPerRunLv) * 1.3, gx = tg.x - r.facing * (u.style === 'bonk' ? (tg.boss ? 18 : tg.kind === 'brute' ? 13 : 10) : u.range * 0.8), gy = tg.y;
      const dx = gx - r.x, dy = gy - r.y, dd = Math.hypot(dx, dy);
      if (dd > 0.8) { const k = Math.min(dd, sp * dt) / dd; r.x += dx * k; r.y += dy * k; r.state = 'walk'; } else r.state = 'idle';
      r.y = clamp(r.y, Lw.minY, Lw.maxY); r.x = clamp(r.x, 6, lawnRight(r.y));
      return;
    }
    r.state = 'idle';
    if (u.cd > 0) return;
    u.cd = cdOf(u.F); u.n++;
    const dmg = Math.round(hitFor(u.F, tg.F, u.mv) * (u.style === 'bonk' ? 1.25 : 1));
    if (u.style === 'bonk') { r.lungeT = 0.25; r.atkT = 0.25; hurtGloom(tg, dmg); rburst(tg.x - r.facing * 4, tg.y - 10, 'spark', 5, '#ffffff'); rsnd('bump', 1.3); return; }
    raid.shots.push({ kind: 'shot', el: u.el, to: tg, x0: r.x + r.facing * 7, y0: r.y - 13, x: r.x, y: r.y - 13, t: 0, dur: Math.max(0.16, d / 150), dmg, flip: tg.x < r.x });
    r.atkT = 0.22; rsnd('pop', 1.25);
  }
  function updateGloom(z, dt) {
    if (z.dead) { z.dead += dt; return; }
    if (z.rise > 0) { z.rise = Math.max(0, z.rise - dt / 0.7); return; } // climbing out of the portal
    z.cd -= dt; z.hitT = Math.max(0, z.hitT - dt); z.atkT = Math.max(0, z.atkT - dt); z.kb = Math.max(0, z.kb - dt);
    let tg = null, bd = 1e9;
    for (const u of raid.ps) { if (u.dead || u.r.s.home || !here.includes(u.r) || u.r.state === 'held') continue; const d = Math.hypot(u.r.x - z.x, (u.r.y - z.y) * 1.4); if (d < bd) { bd = d; tg = u; } }
    z.tgt = tg; if (!tg) return;
    const G = z.G, gx = tg.r.x + (z.x >= tg.r.x ? G.reach * 0.85 : -G.reach * 0.85), gy = tg.r.y, dx = gx - z.x, dy = gy - z.y, d = Math.hypot(dx, dy);
    if (Math.abs(tg.r.x - z.x) > 0.5) z.facing = tg.r.x > z.x ? 1 : -1;
    if (bd <= G.reach + 2) { if (z.cd <= 0) gloomAttack(z, tg); return; }
    if (d > 0.5) { const back = z.kb > 0, k = Math.min(d, G.sp * (back ? 0.8 : 1) * dt) / d * (back ? -1 : 1); z.x += dx * k; z.y += dy * k; }
    z.y = clamp(z.y, Lw.minY + 4, Lw.maxY); z.x = clamp(z.x, 6, lawnRight(z.y));
  }
  function gloomAttack(z, u) {
    z.cd = cdOf(z.F) * (z.boss ? 1.4 : 1.15); z.atkT = 0.35;
    if (z.G.ranged) { raid.shots.push({ kind: 'ball', to: u, x0: z.x + z.facing * 5, y0: z.y - z.U.cy, x: z.x, y: z.y - z.U.cy, t: 0, dur: Math.max(0.25, Math.hypot(u.r.x - z.x, u.r.y - z.y) / 90), dmg: hitFor(z.F, u.F, GMOVE.ball), flip: u.r.x < z.x }); rsnd('whoosh', 1.6); return; }
    const mv = z.boss ? GMOVE.stomp : GMOVE.bump;
    hurtSprout(u, hitFor(z.F, u.F, mv));
    if (z.boss) { for (const o of aliveP()) if (o !== u && Math.hypot(o.r.x - z.x, o.r.y - z.y) < 26) hurtSprout(o, Math.round(hitFor(z.F, o.F, mv) * 0.5)); if (!raid.sim) { raid.flash = 0.12; buzz(40); } rburst(z.x, z.y, 'dust', 10, '#9a8aa8'); rsnd('thud', 0.8); }
    else rsnd('bump', 0.9);
  }
  function hurtSprout(u, n) {
    if (u.dead) return;
    if (Math.random() < Math.min(0.35, u.eva || 0)) { rfloat('Missed!', '#5b4630', u.r.x, headY(u.r) - 4); if (!raid.sim) hop(u.r); return; } // (wings help it dodge)
    u.hp -= n; u.bitten = 1.5; u.r.hitT = 0.2; rfloat(String(n), '#e5535f', u.r.x + rand(-3, 3), headY(u.r) - 4);
    if (!raid.sim && Math.random() < 0.25) emote(u.r, 'swirl', 0.8);
    if (u.hp <= 0) { u.hp = 0; u.dead = 0.001; knockOut(u); }
  }
  // out of puff: it sits down for a rest with dizzy stars (a snack wakes it up)
  function knockOut(u) {
    const r = u.r; r.koUntil = Date.now() + RAID.koMs; r.state = 'ko'; r.target = null; r.mood = null; r.emote = null; r.inRaid = false;
    rburst(r.x, r.y - 10, 'spark', 10, '#fff27a'); rfloat('Needs a rest!', '#a2477a', r.x, headY(r) - 12); rsnd('thud', 1.2);
    if (raid.sel === u) raid.sel = null;
  }
  function hurtGloom(z, n) {
    if (z.dead) return;
    z.hp -= n; z.hitT = 0.15; z.kb = z.boss ? 0.05 : 0.18; rfloat(String(n), '#ffffff', z.x + rand(-3, 3), z.y - z.U.top - 4);
    if (z.hp > 0) return;
    z.hp = 0; z.dead = 0.001; raid.killed++;
    if (!raid.sim) { raid.poofs.push({ x: z.x, y: z.y, t: 0, big: z.boss || z.kind === 'brute' }); burst(z.x, z.y - z.U.cy, 'spark', z.boss ? 24 : 9, '#fff6a8'); buzz(z.boss ? 40 : 12); }
    rsnd('poof', z.boss ? 0.7 : 1);
    for (const o of raid.ps) if (o.pick === z) o.pick = null;
    if (z.boss && !raid.sim) raidUI('You beat the Gloom King!', 'Hooray!');
  }
  function updateShots(dt) {
    let j = 0;
    for (const sh of raid.shots) {
      sh.t += dt; const k = Math.min(1, sh.t / sh.dur);
      if (sh.kind === 'ball') { const u = sh.to, tx = u.r.x, ty = u.r.y - 10; sh.x = lerp(sh.x0, tx, k); sh.y = lerp(sh.y0, ty, k) - Math.sin(k * Math.PI) * 6; if (k >= 1) { if (!u.dead && here.includes(u.r) && u.r.state !== 'held') hurtSprout(u, sh.dmg); rburst(tx, ty, 'spark', 4, '#9a6ad0'); continue; } }
      else { const z = sh.to, tx = z.x, ty = z.y - z.U.cy; sh.x = lerp(sh.x0, tx, k); sh.y = lerp(sh.y0, ty, k) - Math.sin(k * Math.PI) * 3; if (k >= 1) { if (!z.dead) hurtGloom(z, sh.dmg); rburst(tx, ty, 'spark', 5, elColor(sh.el)); continue; } }
      raid.shots[j++] = sh;
    }
    raid.shots.length = j;
  }
  // a snack in a fight heals: Golden Fruit fully, a Heart Apple or Hearty Root half, other fruit a third (each extra piece fed at
  // once adds the same again). A resting Sprout wakes up and jumps back in. Returns true when it was a fighting Sprout.
  function raidHeal(r, id, n) {
    const u = raid && raid.phase === 'fight' && raid.area === area && raid.ps.find(o => o.r === r);
    if (!u) return false;
    const k = id === 'goldfruit' ? 1 : id === 'apple' || id === 'heartyroot' ? 0.5 : 0.34, before = u.dead ? 0 : u.hp;
    if (u.dead) { u.dead = 0; u.hp = 0; r.koUntil = 0; r.state = 'idle'; r.cheerT = 1; r.inRaid = true; floater('Back in!', '#3f9a3a', r.x, headY(r) - 12); }
    u.hp = Math.min(u.max, Math.max(u.hp, 1) + Math.round(u.max * k * (n || 1)));
    const got = u.hp - before;
    floater(got > 0 ? `+${got}` : 'Full!', '#3f9a3a', r.x, headY(r) - 4);
    heartUp(r.x, r.y - 22); burst(r.x, r.y - 12, 'spark', 8, '#c8ff9a'); emote(r, 'heart', 1); snd('munch'); markSeen('feed');
    return true;
  }
  function winRaid() {
    raid.phase = 'win'; raid.t = 3.2; raid.result = 'win';
    if (raid.sim) return;
    const ps = raid.ps, lv = ps.reduce((a, u) => a + ST.totalLevels(u.r.s), 0) / Math.max(1, ps.length);
    const coins = Math.round((8 + raid.killed * (3 + lv / 10)) * (raid.king ? 1.6 : 1)), got = ST.addCoins(coins, 'raid');
    for (const u of ps) {
      const s = u.r.s; if (!PS.S.sprouts.includes(s)) continue;
      ST.gain(s, { power: 1 + raid.killed, stamina: 1 + Math.ceil(raid.killed / 2) });
      if (!u.dead && here.includes(u.r) && !busy(u.r)) { u.r.cheerT = 2.6; emote(u.r, pick(['heart', 'sparkle']), 2); hop(u.r); }
    }
    raidUI('The gloom is gone!', `Hooray! +${got} coins`);
    jingle('raid-win', 'cheer'); sndP('cheer', 1); buzz(40);
    const R = raid.rally; flyCoins(R.x, R.y - 20, Math.min(8, Math.max(3, Math.round(got / 8))));
    const S = raidSave(); S.wins = (S.wins | 0) + 1; if (raid.king) S.kings = (S.kings | 0) + 1;
    // (the first win, and the first time the Gloom King is beaten, get the big moment afterwards)
    if (S.wins === 1 || (raid.king && S.kings === 1)) raid.party = { coins: got, king: raid.king, killed: raid.killed };
    PS.save();
  }
  function loseRaid() {
    raid.phase = 'rescue'; raid.t = 99; raid.sel = null; raid.result = 'lose';
    if (raid.sim) return;
    // the Moon Owl swoops down from the sky, sweeps along the gloom (each one it reaches puffs away) and flies off with the last
    const list = raid.zs.filter(z => !z.dead).sort((a, b) => (a.x - b.x) * raid.side);
    raid.owl = { x: camX + (raid.side > 0 ? -20 : viewW() + 20), y: camY + 24, face: raid.side, list, t: 0 };
    raidUI('Everyone needs a rest!', 'Here comes the Moon Owl!');
    sndP('whoosh', 0.8);
    const S = raidSave(); S.losses = (S.losses | 0) + 1; PS.save();
  }
  function updateOwl(dt) {
    const O = raid.owl; if (!O) { raid.phase = 'done'; raid.t = 0.5; return; }
    O.t += dt;
    const tg = O.list.find(z => !z.dead), gx = tg ? tg.x : O.x + O.face * 160, gy = tg ? tg.y - tg.U.cy - 4 : camY - 40, dx = gx - O.x, dy = gy - O.y, d = Math.hypot(dx, dy);
    if (d > 3) { const k = Math.min(d, (tg ? 120 : 150) * dt) / d; O.x += dx * k; O.y += dy * k; if (Math.abs(dx) > 1) O.face = dx > 0 ? 1 : -1; }
    else if (tg) { tg.dead = 0.001; raid.poofs.push({ x: tg.x, y: tg.y, t: 0, big: tg.boss }); burst(tg.x, tg.y - tg.U.cy, 'spark', 10, '#fff6a8'); sndP('poof', 1.1); buzz(10); }
    if (!tg && (O.y < camY - 30 || O.x < camX - 40 || O.x > camX + viewW() + 40)) {
      raid.owl = null; raid.phase = 'done'; raid.t = 2.2;
      raidUI('Phew!', `The Moon Owl chased the gloom away from ${toArea(raid.area)}`); jingle('raid-lose', 'chime');
    }
  }
  function endRaid(quiet) {
    const was = raid; if (!was) return;
    for (const u of was.ps) { const r = u.r; r.inRaid = false; if (!u.dead && r.state !== 'held' && r.state !== 'fall' && r.state !== 'ko') { r.state = 'idle'; r.timer = rand(0.5, 1.5); } }
    raidHold(false); raid = null; raidUI(null); hintReset = true; PS.save();
    // (the win and lose jingles hand the music back to the garden by themselves; a quiet end, or no jingle, gets it back here)
    if (raidSong) { raidSong = null; musicBackAt = quiet ? 0.01 : t + 5; }
    if (was.party && !quiet) setTimeout(() => raidParty(was.party), 400);
  }
  // the big moment for the first win (and the first Gloom King beaten)
  function raidParty(p) {
    if (!PS.ui.celebrate) return;
    let ic = null, king = null; try { ic = PX.raid && PX.raid.icon ? PX.raid.icon(p.king ? 'king' : 'raid') : null; king = p.king && PX.raid && PX.raid.unit ? PX.raid.unit('king', 'hurt') : null; } catch (e) { ic = null; }
    let coin = null; try { coin = PS.ui.icon ? PS.ui.icon('coin') : null; } catch (e) { coin = null; }
    const partner = ST.active();
    PS.ui.celebrate({ kind: 'trophy', eyebrow: 'Night raid', title: p.king ? 'You beat the Gloom King!' : 'You chased the gloom away!', sub: 'Your Sprouts were so brave. The gloom only comes at night.',
      icon: king, sprite: king ? null : partner || null, jingle: false, tiles: [{ icon: coin, value: '+' + p.coins, label: 'Coins' }, { icon: ic, value: String(p.killed), label: 'Gloomlings' }], button: 'Hooray!' });
  }
  // ---- tapping in a raid: a Sprout to choose it (again, or the grass, to let it go), then a Gloomling to send it after that one ----
  function gloomAt(p) { let b = null, bd = 1e9; for (const z of raid.zs) { if (z.dead || z.rise > 0.5) continue; const d = Math.hypot(p.x - z.x, p.y - (z.y - z.U.cy)); if (d < hitR(z.boss ? 20 : z.U.w * 0.6) && d < bd) { bd = d; b = z; } } return b; }
  function raidTarget(z) { const u = raid.sel; u.pick = z; emote(u.r, '!', 1); floater('Get it!', '#5b4630', u.r.x, headY(u.r) - 6); snd('pop'); buzz(8); }
  function raidSelect(r) {
    const u = raid.phase === 'fight' && raid.ps.find(o => o.r === r && !o.dead);
    if (!u) { if (!busy(r)) { hop(r); emote(r, '!', 0.8); } snd('coo'); return; }
    raid.sel = raid.sel === u ? null : u; hop(r); emote(r, raid.sel ? 'sparkle' : 'note', 0.8); if (!(raid.sel && sproutCry(r))) snd(raid.sel ? 'coo' : 'tick');
    raidSub(raid.sel ? `Now tap a Gloomling for ${r.s.name}!` : 'Tap a Sprout, then a Gloomling!');
  }
  // ---- raid pictures: from art-raid.js (PX.raid), cached here per kind and pose; simple stand-ins if a picture is missing ----
  const RSPR = {}, POSE_ID = ['idle', 'walk0', 'walk1', 'attack', 'hurt'];
  function gloomSpr(kind, pi) {
    const m = RSPR[kind] || (RSPR[kind] = []); let c = m[pi];
    if (c === undefined) { try { c = PX.raid && PX.raid.unit ? PX.raid.unit(kind, POSE_ID[pi]) : null; } catch (e) { c = null; } if (!c) c = gloomStandIn(kind); m[pi] = c; }
    return c;
  }
  function raidFx(id) {
    let c = RSPR['fx:' + id];
    if (c === undefined) { try { c = PX.raid && PX.raid.fx ? PX.raid.fx(id) : null; } catch (e) { c = null; } RSPR['fx:' + id] = c || null; }
    return c;
  }
  function owlSpr(f) {
    const m = RSPR.owl || (RSPR.owl = []); let c = m[f];
    if (c === undefined) { try { c = PX.raid && PX.raid.owl ? PX.raid.owl(f ? 'fly1' : 'fly0') : null; } catch (e) { c = null; } if (!c) c = owlStandIn(f); m[f] = c; }
    return c;
  }
  const SHOT_ID = {}; for (const el of Object.keys(D.ELEMENTS)) SHOT_ID[el] = 'shot:' + el;
  // a round shadow body with big glowing eyes (only if the raid art isn't there)
  function gloomStandIn(kind) {
    const U = GU[kind] || GU.blob, g = new PX.Grid(U.w, U.h), cx = U.w / 2, by = U.h - 0.5 - (U.hover || 0), rx = U.w * 0.42, ry = (U.h - (U.hover || 0)) * 0.44;
    g.ell(cx, by - ry, rx, ry, ['#8c7cd8', '#4a3a8e', '#2c2458']);
    for (const s of [-1, 1]) { g.ell(cx + s * rx * 0.36, by - ry * 1.12, Math.max(1.3, rx * 0.17), Math.max(1.5, ry * 0.24), '#fff6c8'); g.dot(cx + s * rx * 0.36 - 0.4, by - ry * 1.25, '#ffffff'); }
    return hd(g, { outline: true }).canvas();
  }
  function owlStandIn(f) {
    const g = new PX.Grid(30, 22);
    g.ell(15, 13, 7, 7.5, ['#fffbe6', '#e4dab0', '#b8a878']); for (const s of [-1, 1]) g.poly([[15 + s * 5, 9], [15 + s * 14, f ? 14 : 5], [15 + s * 6, 15]], '#d9cfa0');
    for (const s of [-1, 1]) { g.ell(15 + s * 3, 11, 2, 2, '#ffffff'); g.dot(15 + s * 3, 11, '#222034'); }
    g.poly([[14, 13], [16, 13], [15, 15]], '#f6c83a');
    return hd(g, { outline: true }).canvas();
  }
  // the raid's creatures go on top of the night's tint (so their glowing eyes stay bright), back to front
  function drawGlooms() {
    const zs = raid.zs; for (let a = 1; a < zs.length; a++) { const e = zs[a]; let b = a - 1; while (b >= 0 && zs[b].y > e.y) { zs[b + 1] = zs[b]; b--; } zs[b + 1] = e; }
    for (const z of zs) if (!z.dead && vis(z.x, z.y, 26, 50)) drawGloom(z);
  }
  function drawGloom(z) {
    if (z.dead) return; // (its poof is drawn on top)
    const pi = z.hitT > 0 ? 4 : z.atkT > 0 ? 3 : (z.rise <= 0 && (z.tgt && Math.hypot(z.tgt.r.x - z.x, z.tgt.r.y - z.y) > z.G.reach + 3)) ? 1 + (Math.floor(t * 5 + z.ph) % 2) : 0;
    const c = gloomSpr(z.kind, pi), w = artW(c), h = artH(c), flip = z.facing < 0, fly = !!z.U.fly;
    const bob = fly ? Math.round(Math.sin(t * 5 + z.ph) * 1.5) : 0, lean = z.kb > 0 ? -z.facing : 0;
    shadow(z.x, z.y, z.boss ? 30 : Math.max(8, Math.round(w * 0.6)));
    if (z.rise > 0) { bx.save(); bx.beginPath(); bx.rect(z.x - w, z.y - h - 8, w * 2, h + 8); bx.clip(); PX.blit(bx, c, z.x, z.y + Math.round(z.rise * h), flip); bx.restore(); return; } // (climbing out of the portal)
    PX.blit(bx, c, z.x + lean, z.y + bob, flip);
  }
  // the shadow portal on the ground: its two swirl frames, fading in as it opens and out as it closes
  function drawPortal() {
    const R = raid; if (!R || R.openK <= 0.01 || !vis(R.portal.x, R.portal.y, 24, 16)) return;
    const c = raidFx(Math.floor(t * 4) % 2 ? 'portal1' : 'portal0');
    bx.globalAlpha = Math.min(1, R.openK * 1.2);
    if (c) PX.blit(bx, c, R.portal.x, R.portal.y + 2);
    else { const X = R.portal.x + 0.5, Y = R.portal.y - 4; ellF(X, Y, 15, 5.5, '#2c2458'); ellF(X, Y, 11, 4, '#4a3a8e'); ellF(X, Y + 0.3, 6, 2.2, '#1c1638'); }
    bx.globalAlpha = 1;
  }
  function bar(x, y, w, k, col) {
    const X = sn(x - w / 2), Y = sn(y);
    bx.fillStyle = INK; bx.fillRect(X - FP, Y - FP, w + 2 * FP, 1 + 2 * FP);
    bx.fillStyle = '#fbf6e8'; bx.fillRect(X, Y, w, 1);
    bx.fillStyle = k > 0.5 ? col : k > 0.25 ? '#f6c83a' : '#e5535f'; bx.fillRect(X, Y, Math.max(FP, sn(w * clamp(k, 0, 1))), 1);
  }
  function ring(x, y, rx, ry, col) { bx.fillStyle = col; for (let a = 0; a < 6.283; a += 0.09) bx.fillRect(sn(x + Math.cos(a) * rx), sn(y + Math.sin(a) * ry), FP, FP); }
  // above the night's tint: glowing eyes in the dark, the portal's glow, shots, poofs, health bars, the chosen Sprout and its
  // target, and the Moon Owl
  function drawRaidTop() {
    const R = raid;
    if (R.openK > 0.02) glow(R.portal.x, R.portal.y - 5, 16, '170,120,255', 0.28 * R.openK);
    for (const z of R.zs) if (!z.dead && z.rise < 0.8 && vis(z.x, z.y, 20, 40)) glow(z.x, z.y - z.U.cy - 1, z.boss ? 14 : 7, '210,190,255', 0.14);
    for (const sh of R.shots) {
      if (sh.kind === 'ball') { const c = raidFx('shadowball'); if (c) PX.blit(bx, c, sh.x, sh.y + artH(c) / 2, sh.flip); else { glow(sh.x, sh.y, 3, '160,110,230', 0.6); bx.fillStyle = '#5e3a8e'; bx.fillRect(sn(sh.x - 1), sn(sh.y - 1), 2, 2); } continue; }
      const c = raidFx(SHOT_ID[sh.el] || 'shot:normal');
      if (c) PX.blit(bx, c, sh.x, sh.y + artH(c) / 2, sh.flip);
      else { bx.fillStyle = elColor(sh.el); bx.fillRect(sn(sh.x - 1), sn(sh.y - 1), 2, 2); bx.fillStyle = '#ffffff'; bx.fillRect(sn(sh.x - 1), sn(sh.y - 1), FP, FP); }
    }
    for (const p of R.poofs) { const c = raidFx(p.t < 0.3 ? 'poof' : p.t < 0.6 ? 'poof1' : 'poof2') || raidFx('poof'); if (c) { PX.blit(bx, c, p.x, p.y + 1); if (p.big) { PX.blit(bx, c, p.x - 9, p.y - 2); PX.blit(bx, c, p.x + 9, p.y - 2); } } }
    if (R.phase === 'fight') {
      if (R.sel && !R.sel.dead && here.includes(R.sel.r)) {
        const r = R.sel.r; ring(r.x, r.y + 0.5, 10 + Math.sin(t * 6) * 0.5, 4, '#fff27a');
        const pk = R.sel.pick; if (pk && !pk.dead) PX.blit(bx, arrowSprite(), pk.x, pk.y - pk.U.top - 5 - (Math.floor(t * 4) % 2));
      }
      for (const u of R.ps) if (!u.dead && u.hp < u.max && here.includes(u.r) && u.r.state !== 'held') bar(u.r.x, headY(u.r) - 5, 14, u.hp / u.max, '#7ad070');
      for (const z of R.zs) if (!z.dead && z.rise <= 0 && (z.hp < z.max || z.boss)) bar(z.x, z.y - z.U.top - 4, z.boss ? 28 : 14, z.hp / z.max, '#c88af0');
    }
    if (R.owl) {
      const O = R.owl, c = owlSpr(Math.floor(t * 8) % 2);
      glow(O.x, O.y - 10, 14, '255,246,201', 0.3); shadow(O.x, Math.min(Lw.maxY, O.y + 22), 12);
      PX.blit(bx, c, O.x, O.y, O.face < 0);
    }
    if (R.flash > 0) { bx.globalAlpha = Math.min(1, R.flash * 2); bx.fillStyle = '#ffffff'; bx.fillRect(VR.x0, VR.y0, VR.x1 - VR.x0, VR.y1 - VR.y0); bx.globalAlpha = 1; }
  }
  // dizzy stars over a resting Sprout (after a raid too, until it gets its breath back)
  function drawDizzy() {
    const now = Date.now();
    for (const r of here) if (r.koUntil > now && vis(r.x, r.y, 12, 40)) { const c = raidFx(Math.floor(t * 3) % 2 ? 'ko1' : 'ko'); if (c) PX.blit(bx, c, r.x, headY(r) + 3); else { bx.fillStyle = '#fff27a'; for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; bx.fillRect(sn(r.x + Math.cos(a) * 6), sn(headY(r) + Math.sin(a) * 2), 1, 1); } } }
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
    raidTick(dt);
    updateCritters(dt);
    // drops (none while the gloom is here; the ones already out wait)
    if (t > nextDrop && !raidHere()) { spawnDrop(); nextDrop = t + rand(...D.GROWTH.dropEverySec); }
    const dl = drops[area] || [];
    for (const d of dl) { if (!raidHere()) d.life -= dt; if (d.z > 0 || d.vz) { d.vz += TUNE.gravity * 0.6 * dt; d.z -= d.vz * dt; if (d.z <= 0) { d.z = 0; if (!d.bounced && d.vz > 30) { d.vz = -d.vz * 0.35; d.bounced = true; d.z = 0.01; } else d.vz = 0; } } }
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
      switch (e.k) { case 0: drawTree(e.i, hintT); break; case 1: drawProp(e.o); if (e.o === Lw.xmas) treeLights(e.o); break; case 2: drawHome(); break; case 3: drawEgg(e.o); break; case 4: drawSprout(e.o); break; case 5: drawCritter(e.o); break; case 6: drawGroundFruit(e.o); break; case 7: drawGift(); break; }
      e.o = null;
    }
  }
  // the world px on screen this frame (whole px, a little margin), clamped to the garden: only this part is drawn
  function viewRect() {
    VR.x0 = clamp(Math.floor(camX) - 2, 0, ww); VR.y0 = clamp(Math.floor(camY) - 2, 0, wh);
    VR.x1 = clamp(Math.ceil(camX + W / Z) + 2, VR.x0 + 1, ww); VR.y1 = clamp(Math.ceil(camY + H / Z) + 2, VR.y0 + 1, wh);
  }
  // is something standing at (x, y), hw px either side and up px tall, on screen?
  const vis = (x, y, hw, up) => x + hw >= VR.x0 && x - hw <= VR.x1 && y + 8 >= VR.y0 && y - up <= VR.y1;
  function render(dt) {
    const n = PS.clock.night(), th = TA();
    ensureBg(n);
    viewRect();
    const vx = VR.x0, vy = VR.y0, vw = VR.x1 - VR.x0, vh = VR.y1 - VR.y0;
    bx.setTransform(SK, 0, 0, SK, 0, 0); // world coordinates, SK buffer pixels each
    bx.imageSmoothingEnabled = false;
    const skyH = skyC.height / SK;
    if (vy < skyH) { const h = Math.min(skyH, VR.y1) - vy; bx.drawImage(skyC, vx * SK, vy * SK, vw * SK, h * SK, vx, vy, vw, h); }
    if (vy < Lw.hz + 14) { drawDusk(n); drawSunMoon(n); drawClouds(n); }
    bx.drawImage(bgC, vx * SK, vy * SK, vw * SK, vh * SK, vx, vy, vw, vh);
    drawWater(dt, n);
    const hintT = hintTree(); dlN = 0; emN = 0; topN = 0;
    for (let i = 0; i < Lw.trees.length; i++) { const T = Lw.trees[i]; if (vis(T.x, T.y, artW(T.c) / 2 + 4, artH(T.c) + 6)) dl(T.y, 0, null, i); }
    for (const p of Lw.props) if (vis(p.x, p.y, artW(p.c) / 2 + 2, artH(p.c) + 8)) dl(p.y, 1, p, 0);
    if (Lw.home && vis(Lw.home.x, Lw.home.y, Lw.home.w / 2 + 18, artH(Lw.home.c) + 4)) dl(Lw.home.y, 2, null, 0);
    for (const o of eggsHere()) if (vis(o.x, o.y, 14, 30)) dl(o.y, 3, o, 0);
    for (const r of here) { if (r.state === 'held' || r.state === 'fall') topQ[topN++] = r; else if (vis(r.x, r.y, 20, 44)) dl(r.y, 4, r, 0); }
    for (const c of critters) if (c.where !== 'air' && vis(c.x, c.y, 16, 30)) dl(c.y, 5, c, 0);
    for (const f of groundList(area)) if (vis(f.x, f.y, 8, 14 + f.z)) dl(f.y, 6, f, 0);
    if (giftOn && Lw.gift && vis(Lw.gift.x, Lw.gift.y, 10, 18)) dl(Lw.gift.y, 7, null, 0);
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
      if (vy < y0 + 4 * bh) for (let j = 0; j < nh; j++) { bx.globalAlpha = Math.min(1, na * (j + 1) / (nh + 1)); bx.fillRect(vx, y0 + j * FP, vw, FP); }
      const top = Math.max(y0 + 4 * bh, vy); if (VR.y1 > top) { bx.globalAlpha = Math.min(1, na); bx.fillRect(vx, top, vw, VR.y1 - top); }
      bx.globalAlpha = 1;
    }
    drawMagic(n, dt);
    drawLights(n);
    if (HOL && !RMO) drawSnow();
    if (raidHere()) { drawPortal(); drawGlooms(); drawRaidTop(); }
    drawDizzy();
    if (eggBits.length) drawEggBits();
    // drops sit above the night tint so they always sparkle
    for (const d of drops[area] || []) { if (n > 0.3 || th.dim) glow(d.x, d.y - 6 - d.z, 6, '255,242,170', 0.25); drawDrop(d); }
    // emote bubbles, markers and particles stay bright
    for (let i = 0; i < emN; i++) { const r = emQ[i]; emQ[i] = null; if (r.emote) PX.blit(bx, PX.emote(r.emote), r.emX + 3, r.emY, false, 2, 13); }
    const mark = drag && drag.hover ? drag.hover : sel ? RT.get(sel) : null;
    if (mark && here.includes(mark) && !busy(mark)) PX.blit(bx, arrowSprite(), mark.x, headY(mark) - 2 - (Math.floor(t * 3) % 2) - (mark.emote ? 13 : 0));
    drawParticles(dt);
    if (flashT > 0) { bx.globalAlpha = Math.min(1, flashT / 0.3) * 0.7; bx.fillStyle = '#ffffff'; bx.fillRect(vx, vy, vw, vh); bx.globalAlpha = 1; }

    // present the part on screen, then crisp text at display resolution
    const sc = Z * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = th.water[3]; ctx.fillRect(0, 0, cv.width, cv.height);
    // far out a buffer pixel is smaller than a device pixel: smooth it then (nearest would drop the thin fine lines)
    // (and while a pinch or glide is between crisp steps: a fine pixel that isn't a whole number of device pixels)
    const fpx = sc / SK; if (fpx < 0.99 || Math.abs(fpx - Math.round(fpx)) > 0.01) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
    const X0 = Math.round((vx - camX) * sc), Y0 = Math.round((vy - camY) * sc), X1 = Math.round((VR.x1 - camX) * sc), Y1 = Math.round((VR.y1 - camY) * sc);
    ctx.drawImage(buf, vx * SK, vy * SK, vw * SK, vh * SK, X0, Y0, X1 - X0, Y1 - Y0);
    ctx.imageSmoothingEnabled = false;
    // the whole garden on screen: plain lawn past its left and front edges (the water's colour is already behind on the right)
    if (X0 > 0 || Y1 < cv.height) {
      ctx.fillStyle = th.grass[2];
      if (X0 > 0) ctx.fillRect(0, 0, X0, cv.height);
      const xs = Math.max(0, X0), xw = Math.round((shoreAt(wh) - camX) * sc);
      if (Y1 < cv.height) ctx.fillRect(xs, Y1, Math.max(0, xw - xs), cv.height - Y1);
      // (the night's tint over them, like over the garden)
      if (na > 0.01) { ctx.globalAlpha = Math.min(1, na); ctx.fillStyle = th.nightC; if (X0 > 0) ctx.fillRect(0, 0, X0, cv.height); if (Y1 < cv.height) ctx.fillRect(xs, Y1, cv.width - xs, cv.height - Y1); ctx.globalAlpha = 1; }
    }
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
    if (raidHere()) { // the gloom is here: tap a Sprout, then a Gloomling (or drag to look around); nothing pops up
      // (coins, fruit and visitors already in the garden can still be picked up; nothing new comes until it's over)
      for (const d of (drops[area] || []).slice().reverse()) if (Math.hypot(p.x - d.x, p.y - (d.y - 5 - d.z)) < hitR(9)) { collectDrop(d); return; }
      const sl0 = treeSlots();
      for (let i = 0; i < sl0.length; i++) { const q = Lw.slots[i]; if (q && growK(sl0[i]) >= 1 && Math.hypot(p.x - q.x, p.y - q.y) < hitR(7.5)) { press = Object.assign({ kind: 'tree', i, x0: p.x, y0: p.y }, base); return; } }
      const gl0 = groundList(area);
      for (let i = gl0.length - 1; i >= 0; i--) { const f = gl0[i]; if (Math.hypot(p.x - f.x, p.y - (f.y - 5)) < hitR(7.5)) { press = Object.assign({ kind: 'gfruit', f, x0: p.x, y0: p.y }, base); return; } }
      for (const c of critters) if (critterHit(c, p)) { catchCritter(c); return; }
      const zt = raid.phase === 'fight' ? gloomAt(p) : null;
      if (zt && raid.sel && !raid.sel.dead) { raidTarget(zt); return; }
      const rr = sproutAt(p);
      if (rr) { press = Object.assign({ kind: 'sprout', r: rr, t0: t, x0: p.x, y0: p.y, mode: 'pending', rub: 0, raid: true }, base); return; }
      if (zt) { raidSub('Tap one of your Sprouts first, then a Gloomling!'); snd('pop'); return; }
      press = Object.assign({ kind: 'bg', prop: null, wx: p.x, wy: p.y, lx: e.clientX, ly: e.clientY, cam0: camX, cam0y: camY, vx: 0, vy: 0, lt: performance.now() }, base); return;
    }
    for (const o of eggsHere()) { const c = itemSpr('egg', o.e.kind); if (Math.hypot(p.x - o.x, p.y - (o.y - artH(c) / 2)) < Math.max(12, artH(c) / 2 + 2)) { closeCard(); tapEgg(o); return; } }
    for (const d of (drops[area] || []).slice().reverse()) if (Math.hypot(p.x - d.x, p.y - (d.y - 5 - d.z)) < 9) { collectDrop(d); return; }
    const sl = treeSlots();
    for (let i = 0; i < sl.length; i++) { const q = Lw.slots[i]; if (q && growK(sl[i]) >= 1 && Math.hypot(p.x - q.x, p.y - q.y) < 7.5) { press = Object.assign({ kind: 'tree', i, x0: p.x, y0: p.y }, base); return; } }
    const gl = groundList(area);
    for (let i = gl.length - 1; i >= 0; i--) { const f = gl[i]; if (Math.hypot(p.x - f.x, p.y - (f.y - 5)) < 7.5) { press = Object.assign({ kind: 'gfruit', f, x0: p.x, y0: p.y }, base); return; } }
    for (const c of critters) if (critterHit(c, p)) { catchCritter(c); return; }
    if (giftHit(p)) { closeCard(); openGift(); return; }
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
    zoomAnim = null; follow = null; closeCard(); markSeen('zoom');
  }
  function movePinch() {
    const [a, b] = [...touches.values()], r = cv.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, d = Math.hypot(a.x - b.x, a.y - b.y);
    Z = clamp(pinch.z0 * d / pinch.d0, ZFAR * 0.85, ZMAX * 1.15);
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
      if (!press.panned && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 10) { press.panned = true; follow = null; }
    } else if (press.kind === 'sprout') {
      if (press.mode === 'pending' && !press.raid && Math.hypot(p.x - press.x0, p.y - press.y0) > 2.5) press.mode = 'rub';
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
      if (pr.mode === 'pending') { if (pr.raid && raidHere()) raidSelect(pr.r); else tapSprout(pr.r); }
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
      if (raidHere()) { if (raid.sel) { raid.sel = null; raidSub('Tap a Sprout, then a Gloomling!'); snd('tick'); } if (Z > ZFAR * 1.03) return; } // (the grass lets the chosen Sprout go)
      closeCard();
      // the whole garden on screen: a tap on it zooms back in right there (it's a map you can tap into)
      if (Z <= ZFAR * 1.03 && pr.wx != null) { glideTo(pr.wx, pr.wy - 6, Math.max(zoomBack ? zoomBack.z : 0, ZMIN * TUNE.zoomDef)); zoomBack = null; sndP('whoosh', 1.3); lastTapBg = null; syncZoomBtn(true); return; }
      // tapping the scenery: a prop or tree reacts (a few hide a coin once a day), the sign wobbles, the lamp glows, the water splashes
      if (pr.wx != null && sceneryTap(pr)) { lastTapBg = null; return; }
      // double-tap: zoom all the way out, or back in
      const now = performance.now();
      if (lastTapBg && now - lastTapBg.t < 330 && Math.hypot(e.clientX - lastTapBg.x, e.clientY - lastTapBg.y) < 30) {
        const r = cv.getBoundingClientRect();
        if (Z > ZFAR * 1.05) follow = null;
        animateZoom(Z > ZFAR * 1.05 ? ZFAR : ZMIN * TUNE.zoomDef, e.clientX - r.left, e.clientY - r.top); lastTapBg = null; markSeen('zoom');
      } else lastTapBg = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  function tapSprout(r) {
    if (r.state === 'sleep') { snd('tick'); }
    else if (!busy(r) && r.state !== 'eat' && r.state !== 'swim') { r.state = 'idle'; r.timer = 1.4; emote(r, pick(['!', 'heart', 'note']), 1); hop(r); if (!sproutCry(r)) snd('coo'); }
    follow = r.id; // (the camera keeps it in view while its card is open and it wanders)
    openCard(r);
  }

  // ---------------- dragging (fruit / animals / tree fruit) ----------------
  function startDrag(src, id, e, idx, el) {
    closeCard();
    drag = { src, id, idx, el, pid: e.pointerId, hover: null };
    const s = src === 'pouch' ? critterSpr(id) : itemSpr('fruit', id);
    // (the bitmap is the sprite's fine size; the CSS size, the scale and drag.gw / gh are in art px)
    ghostEl.width = s.width; ghostEl.height = s.height; ghostEl._pk = s.k || 1;
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
      else if (inWater(wx, gy) || pondAt(wx, gy)) {
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
    const c = document.createElement('canvas'); c.width = s.width; c.height = s.height; c._pk = s.k || 1; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, s.width, s.height);
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
    if (raidHeal(r, k, fed)) return fed;
    if (r.koUntil) { r.koUntil = 0; r.state = 'idle'; }
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
    card.spr._pk = c.k || 1; card.spr.style.imageRendering = c.hdSpr ? 'auto' : ''; // (a smooth HD Sprout is shown smoothly; app.js skips snapping it)
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
  // the drop-down of every area under the garden's name (app.js pickMap); without it, the name steps to the next area
  function openAreas(anchor) {
    if (raidHere()) { snd('tick'); raidSub('Not now: the gloom is here!'); return; }
    if (!PS.ui.pickMap) { switchArea(1); return; }
    PS.ui.pickMap(null, area, { anchor, onPick: a => { if (D.AREAS[a] && a !== area) setArea(a, AREA_IDS.indexOf(a) < AREA_IDS.indexOf(area) ? -1 : 1); } });
  }
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
    closeCard(); buildProps(); skyKey = ''; bgKey = ''; findId = ''; focusCamera(); hintReset = true;
    // a raid stays in its own area: leaving hides its banner and lets pop-ups through, coming back brings it back
    if (raid) { if (raidHere()) { raidHold(true); if (raid.ui) raidUI(...raid.ui); glideTo((raid.rally.x + raid.portal.x) / 2, raid.rally.y - 14, Z); } else { raidHold(false); if (raidEl) raidEl.hidden = true; raid.sel = null; } }
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
.g-pill{background:var(--panel);border:2px solid var(--line);border-bottom:4px solid var(--edge);border-radius:16px;padding:4px 14px 5px;text-align:center;min-width:0;max-width:240px;flex:0 1 auto;color:var(--ink);cursor:pointer;-webkit-tap-highlight-color:transparent}
.g-pill:active{transform:translateY(2px);border-bottom-width:2px;margin-top:2px}
.g-pill b{display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--f-px);font-weight:700;font-size:18px;line-height:1.1;white-space:nowrap}
.g-pill .g-dd{width:26px;height:26px;flex:0 0 auto;box-sizing:border-box;padding:2px;border-radius:50%;background:var(--accent);border:2px solid var(--accent-edge);box-shadow:0 2px 0 var(--accent-edge);color:#fff}
.g-pill .g-ps{display:block;font-size:13px;color:var(--ink-soft);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.g-raid{position:absolute;left:50%;top:74px;transform:translateX(-50%);z-index:8;pointer-events:none;display:flex;align-items:center;gap:8px;text-align:left;background:#2e2650;color:#fff8e6;border:3px solid #1c1638;border-bottom-width:5px;border-radius:18px;padding:5px 14px 6px 8px;min-width:210px;max-width:calc(100% - 132px);box-shadow:0 6px 0 rgba(28,22,56,.22),inset 0 0 0 2px #5e3a8e;animation:gRaid .35s ease-out}
.g-raid canvas{width:32px;height:32px;flex:0 0 auto}
.g-raid span{min-width:0;flex:1}
.g-raid b{display:block;font-family:var(--f-px);font-size:18px;line-height:1.15;color:#fff27a}
.g-raid small{display:block;font:600 13.5px/1.25 var(--f-ui);color:#e8e0ff;margin-top:1px}
.g-raid i{display:none;font-style:normal;font-family:var(--f-px);font-size:40px;line-height:1;color:#fff27a;margin-left:2px;font-variant-numeric:tabular-nums}
.g-raid.g-raid-big i{display:block;animation:gTick 1s ease-in-out infinite}
@keyframes gRaid{from{transform:translate(-50%,-14px);opacity:0}to{transform:translateX(-50%);opacity:1}}
@keyframes gTick{0%{transform:scale(1.25)}30%{transform:scale(1)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.g-raid,.g-raid.g-raid-big i{animation:none}}
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
.g-find{position:absolute;top:122px;right:8px;z-index:3;width:52px;height:52px;border-radius:50%;background:var(--panel);border:2px solid var(--edge);border-bottom-width:5px;display:grid;place-items:center;padding:0;box-shadow:0 3px 0 rgba(60,44,24,.14);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.g-find:active{transform:translateY(2px);border-bottom-width:3px}
.g-find canvas{width:32px;height:32px;margin-top:-2px;pointer-events:none}
.g-find i{position:absolute;right:-5px;bottom:-5px;min-width:20px;height:20px;border-radius:10px;background:var(--sun);border:2px solid var(--sun-edge);color:#4a3210;font:700 12px/16px var(--f-ui);font-style:normal;text-align:center;padding:0 3px}
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
        <button class="g-pill" type="button" aria-haspopup="dialog"><b><span class="g-pn"></span><svg class="g-dd" viewBox="0 0 9 9" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="M1 2h1v2H1zM2 3h1v2H2zM3 4h1v2H3zM4 5h1v2H4zM5 4h1v2H5zM6 3h1v2H6zM7 2h1v2H7z"/></svg></b><span class="g-ps"></span><span class="g-dots">${AREA_IDS.map(() => '<i></i>').join('')}</span></button>
        <button class="g-arrow" data-d="1" type="button">${chev(1)}</button>
      </div>
      <button class="g-zoom" type="button" aria-label="See the whole garden"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
        <path fill="#cfeefa" d="M4 3h5v1h1v5h-1v1H4V9H3V4h1z"/><path fill="#ffffff" d="M4 4h2v1H4z"/>
        <path d="M4 1h5v2H4zM4 10h5v2H4zM1 4h2v5H1zM10 4h2v5h-2zM2 2h2v2H2zM9 2h2v2H9zM2 9h2v2H2zM9 9h2v2H9zM11 11h2v2h-2zM12 12h2v2h-2zM13 13h2v2h-2z"/>
        <path d="M4 6h5v1H4z"/><path class="g-zi-in" d="M6 4h1v5H6z"/></svg></button>
      <button class="g-find" type="button" aria-label="Find your Sprout" hidden><canvas class="px" width="32" height="32"></canvas><i hidden></i></button>
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
    pillName = q('.g-pn'); pillSub = q('.g-ps'); dotsEl = q('.g-dots');
    // the garden's name drops down a map of every area (app.js pickMap); tap one to go there
    q('.g-pill').addEventListener('click', () => { PX.Sound.unlock(); closeCard(); openAreas(q('.g-pill')); });
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
    findEl = q('.g-find');
    findEl.addEventListener('click', e => { e.stopPropagation(); PX.Sound.unlock(); findNext(); });
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
    PS.on('holiday', holidayCheck); // (Parent tools switched holiday mode)
    PS.on('reset', () => { if (raid) { raidHold(false); raid = null; raidUI(null); } RT.clear(); hatchFx.clear(); eggBits = []; critters = []; for (const k in drops) delete drops[k]; for (const k in ground) delete ground[k]; closeCard(); renderTray(); shownOnce = false; });
    mounted = true;
    renderTray();
  }
  function show(params) {
    visible = true;
    const want = (params && params.area) || PS.S.area || 'meadow';
    area = D.AREAS[want] ? want : 'meadow';
    if (PS.S.area !== area) { PS.S.area = area; PS.emit('area', { area }); }
    HOL = holOn(); tellAt = t + 2.5; // (holiday mode; its "a gift is waiting" message comes a moment after arriving)
    if (!HOL) critters = critters.filter(c => !(D.ANIMALS[c.id] || {}).season);
    resize(); lastTrayH = trayEl.offsetHeight;
    if (raidHere()) { raidHold(true); closeCard(); if (raid.ui) raidUI(...raid.ui); } else if (raidEl) raidEl.hidden = true;
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
    // (a raid waits while you're away; its "no pop-ups" hold is only for the garden, so other screens aren't held up)
    if (raid) raidHold(false);
    raidSong = null;
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
    guideNow = raidHere() ? null : guide(); // (no pointing hand while the gloom is here)
    render(dt);
    syncZoomBtn(false);
    placeTrayHand(guideNow);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.4;
      checkPics();
      // holiday mode: is it on (the date can pass midnight while the app is open), is a gift waiting, and once a day say so
      holidayCheck();
      giftOn = HOL && !!Lw.gift && PS.holiday.giftReady();
      if (giftOn && t > tellAt && !raidHere() && !PS.ui.modalOpen && !PS.ui.menuOpen && PS.holiday.tellGift()) PS.ui.toast('Happy holidays! A gift is waiting under the tree.', 3600);
      // hints pop up briefly on arrival; the holding hint, a new player's first-egg hint and the first lessons stay while they apply
      if (hintReset) { hintReset = false; hintUntil = t + 4; }
      const holding = here.some(r => r.state === 'held'), firstEgg = !PS.S.sprouts.length && PS.S.eggs.some(e => e.area === area);
      const lesson = here.length && learning() && !PS.ui.modalOpen;
      const h = raidHere() || !cardEl.hidden ? '' : holding ? 'Drop in the shallows to swim, in deep water to travel, or on the house to rest' : (firstEgg || lesson || t < hintUntil) ? hintText() : '';
      if (hintEl.textContent !== h) hintEl.textContent = h;
      hintEl.style.opacity = h ? 1 : 0;
      if (sel) renderCard();
      updatePill(); syncFind(false);
      // the raid's own music while the gloom is here (re-asserted: a screen change may have put the garden's back), the Gloom
      // King's while he's out; afterwards the jingle hands back to the garden track (or it comes back here a little later)
      if (raidHere() && (raid.phase === 'warn' || raid.phase === 'fight')) {
        const want = raid.zs.some(z => z.boss && !z.dead) ? 'raid-boss' : 'raid';
        try { if (raidSong !== want || (PX.Music && PX.Music.current !== want)) { raidSong = want; if (PX.Music) PX.Music.play(want); } } catch (e) { /* audio optional */ }
      } else if (!raid && musicBackAt && t >= musicBackAt) {
        musicBackAt = 0; try { const cur = PX.Music && PX.Music.current; if (cur === 'raid' || cur === 'raid-boss') PS.ui.music(); } catch (e) { /* audio optional */ }
      }
    }
  }

  // fast-forward raids for balancing (__garden.raidSim): the Sprouts out here fight n raids in a loop; nothing is drawn, saved or paid
  function simRaids(n) {
    {
      const mine = outHere(); if (!mine.length) return 'no Sprouts out here';
      const keep = mine.map(r => [r, r.x, r.y, r.state, r.koUntil, r.emote]), out = { raids: 0, wins: 0, kings: 0, kingWins: 0, secs: 0, kos: 0, gloom: 0 };
      for (let i = 0; i < (n || 20); i++) {
        for (const r of mine) { r.koUntil = 0; if (r.state === 'ko') r.state = 'idle'; }
        if (!startRaid(true)) break;
        beginFight();
        for (const u of raid.ps) { const q = lawnPoint(raid.rally.x, raid.rally.y, 18); u.r.x = q.x; u.r.y = q.y; u.r.koUntil = 0; }
        let T = 0; while (raid.phase === 'fight' && T < 300) { updateRaid(1 / 30); T += 1 / 30; }
        out.raids++; out.secs += T; out.gloom += raid.zs.length + raid.queue.length; out.kos += raid.ps.filter(u => u.dead).length;
        if (raid.result === 'win') out.wins++; if (raid.king) { out.kings++; if (raid.result === 'win') out.kingWins++; }
        for (const u of raid.ps) u.r.inRaid = false;
        raid = null;
      }
      for (const [r, x, y, st, ko, em] of keep) { r.x = x; r.y = y; r.state = st === 'ko' ? 'idle' : st; r.koUntil = ko; r.emote = em; r.inRaid = false; }
      out.avgSec = +(out.secs / out.raids).toFixed(1); out.avgKO = +(out.kos / out.raids).toFixed(2); out.avgGloom = +(out.gloom / out.raids).toFixed(1); delete out.secs; delete out.kos; delete out.gloom;
      return out;
    }
  }
  PS.scenes = PS.scenes || {};
  PS.scenes.garden = { mount, show, hide, frame };
  // debug hook for testing
  window.__garden = {
    RT, get here() { return here; }, get critters() { return critters; }, drops, ground, Lw, get area() { return area; }, get pxs() { return Z; },
    get cam() { return { x: camX, y: camY, z: Z, zmin: ZMIN, zmax: ZMAX, zfar: ZFAR, ww, wh }; }, zoomAt, animateZoom, focusCamera, dropFruit, groundList, setCam(x, y) { follow = null; camX = x; camY = y; clampCam(); },
    findNext, glideTo, get follow() { return follow; },
    // night raids: raidNow() starts one here (or in an area with Sprouts out), any time of day; raidWin() / raidLose() end it;
    // raidSim(n) fights n raids in fast-forward with the Sprouts out here (no rewards, nothing saved) and returns the tally
    get raid() { return raid; },
    raidNow() {
      if (raid) return 'a raid is already on';
      if (!outHere().length) { const a = AREA_IDS.find(x => PS.S.sprouts.some(s => s.area === x && !s.home)); if (!a) return 'no Sprouts outside anywhere'; setArea(a, 1); here = PS.S.sprouts.filter(isOut).map(getRT); }
      nextRaid = 0; return startRaid(false) ? 'started in ' + area : 'could not start';
    },
    raidSoon() { nextRaid = raidClock + 1; return 'the next raid check is in a second (the usual rules still apply)'; },
    raidWin() { if (!raid) return 'no raid'; if (raid.phase === 'warn') beginFight(); raid.queue.length = 0; for (const z of raid.zs) if (!z.dead) { z.rise = 0; hurtGloom(z, 99999); } return 'win'; },
    raidLose() {
      if (!raid) return 'no raid'; if (raid.phase === 'warn') beginFight();
      while (raid.queue.length) { const z = makeGloom(raid.queue.shift()); z.rise = 0; raid.zs.push(z); }
      for (const u of raid.ps) if (!u.dead) { u.hp = 0; u.dead = 0.001; knockOut(u); } return 'lose';
    },
    raidSim(n, opts) {
      if (raid) return 'a raid is on';
      const was = {}; for (const k in opts || {}) if (k in RAID) { was[k] = RAID[k]; RAID[k] = opts[k]; }
      try { return simRaids(n); } finally { Object.assign(RAID, was); }
    },
    pondAt, get layoutInfo() { return { props: Lw.props.length, trees: Lw.trees.length, slots: Lw.slots.length, ponds: Lw.ponds.length, paths: Lw.pathPts.length, landK: Lw.landK }; },
    paintBg() { const t0 = performance.now(); paintLand(); const t1 = performance.now(); paintSky(PS.clock.night()); return [Math.round(t1 - t0), Math.round(performance.now() - t1)]; },
    propHit, funProp, sceneryTap, toggleFar, get fun() { return PS.S.gardenFun; }, get parts() { return parts.length; }, get hatching() { return hatchFx.size; }, shootStar() { shoot.life = 0; nextShoot = t + 0.01; },
    spawnCritter, spawnDrop, setArea, switchArea, eggsHere, tapEgg, treeSlots, feedSprout, giveAnimal, startTravel, askTravel, openCard, closeCard,
    toScreen: (x, y) => { const r = cv.getBoundingClientRect(), p = worldToScreen(x, y); return { x: r.left + p.x, y: r.top + p.y }; },
    // holiday mode: the gift under the tree (Lw.xmas / Lw.gift), opened as if tapped; spawnCritter('reindeer') brings the Reindeer
    openGift() { if (!giftOn) return 'no gift waiting'; openGift(); return 'opened'; }, get giftOn() { return giftOn; },
  };
})();
