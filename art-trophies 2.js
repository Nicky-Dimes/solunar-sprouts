// art-trophies.js — Solunar Sprouts: trophy and medal art, drawn in code in the garden's pixel style (DawnBringer-ish colours),
// at the Sprouts' level of detail: 2 fine pixels per art pixel, a 1-fine-pixel ink line between pieces, one outer ink ring
// round the silhouette (1 art pixel, like a Sprout's), soft 5-step shading lit from the upper left, finished by PX.hd.
//   PX.trophy(id, scale, { dim }) -> a NEW <canvas> of 32 x 32 art pixels times a whole-number scale (the bitmap has k = 2 fine
//   pixels per art pixel and carries c.k: draw it with PX.artW / PX.artH or PX.blit). dim: a flat silhouette, for a trophy
//   not won yet. Unknown ids give null.
//   Ids: 'l-<league id>' (a gold cup with the league's emblem on a coloured base), 'g-<legend id>' (a gold medal on a ribbon,
//   one per Legend Challenge: all 12, the newer six with emblems of their own), 't-<floor>' (a little Battle Tower statue: bronze, silver, gold or crystal). PX.TROPHY_IDS lists them.
// Nothing is drawn when this file loads (tools/check_game.js runs art files in Node): a trophy is drawn the first time it is
// asked for, and only those 1x pictures are kept (at most two per id: plain and dim).
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.PX) return;
  const PX = window.PX, INK = PX.INK || '#222034';

  // ---------------- colours ----------------
  const GOLD = ['#fff6b0', '#f6c83a', '#c8861c'], GOLD_IN = '#a8661a', GOLD_LIP = ['#fffbe0', '#ffe27a', '#e8ae3a'];
  const R = {
    stone: ['#e4ecfc', '#9badb7', '#696a6a'], leaf: ['#c8f59a', '#6abe30', '#37946e'], sea: ['#bfe6ff', '#639bff', '#306082'],
    night: ['#cbdbfc', '#5b6ee1', '#3f3f74'], candy: ['#ffd4f2', '#d77bba', '#a2477a'], sun: ['#ffe2b4', '#df7126', '#8a4a1c'],
    dusk: ['#e6ccff', '#9a6ad0', '#76428a'], sky: ['#ccfcff', '#5fcde4', '#306082'], ember: ['#ffc4ac', '#d95763', '#ac3232'],
    royal: ['#ffd8e4', '#c0406a', '#7a2048'], snow: ['#ffffff', '#cbdbfc', '#8a9cc8'], fern: ['#e2ff96', '#99e550', '#4b692f'],
    storm: ['#e4ecfc', '#6e7aa0', '#3a4466'], cave: ['#e6ccff', '#7a5ac0', '#4a3478'], lion: ['#fff1bf', '#f6a83a', '#c45c0c'], cosmos: ['#c8c8f8', '#3a3a8a', '#1c1c48'],
  };
  const WOOD = ['#eec39a', '#b47c4a', '#663931'], CREAM = ['#fffdf2', '#f6e8c6', '#ccb28a'], DOOR = '#45283c';
  const METAL = { bronze: ['#ffd2a0', '#d88a4a', '#8f563b'], silver: ['#ffffff', '#c8d0e0', '#8a94ae'], gold: GOLD, crystal: ['#ffffff', '#b8f0ff', '#5fa8e0'] };

  // ---------------- the trophy list ----------------
  // [emblem, colour] per league / legend; [metal, floor] per Tower trophy.
  const LEAGUE = {
    pebble: ['pebble', 'stone'], thorn: ['thorn', 'leaf'], tide: ['wave', 'sea'], moon: ['moon', 'night'], sugar: ['candy', 'candy'],
    legend: ['star', 'sun'], mythic: ['eclipse', 'dusk'], starfall: ['comet', 'sky'], titan: ['peak', 'ember'], champion: ['crown', 'royal'],
  };
  const LEGEND = {
    yeti: ['snow', 'snow'], griffin: ['wing', 'sky'], dinosaur: ['bone', 'fern'], kraken: ['tentacle', 'dusk'], phoenix: ['feather', 'sun'], dragon: ['flame', 'ember'],
    golem: ['mossrock', 'leaf'], stormwhale: ['fluke', 'storm'], moonwolf: ['paw', 'night'], crystaltortoise: ['crystals', 'cave'], sunlion: ['sunmane', 'lion'], starserpent: ['firststar', 'cosmos'],
  };
  const TOWER = { 5: 'bronze', 15: 'silver', 30: 'gold', 50: 'crystal' };

  // a piece: drawn on its own layer, outlined in ink, then laid over what is already there (gives inner lines between parts)
  function piece(g, draw) { const t = new PX.Grid(g.w, g.h, g.k); t.dither = false; draw(t); t.outline(INK); g.merge(t); }
  // a soft gloss streak, one art pixel wide but stepped in fine pixels (no art-pixel staircase): through pts, on filled pixels only
  function gloss(g, pts, col) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * g.k * 2);
      for (let j = 0; j <= n; j++) { const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n; for (const dx of [0, 1 / g.k]) if (g.filled(x + dx, y)) g.dot(x + dx, y, col); }
    }
  }
  const stroke = (t, pts, r0, r1, c) => PX.stroke(t, pts, r0, r1, c);
  const box = (t, x0, y0, x1, y1, c) => t.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c);

  // ---------------- emblems: drawn round (x, y), about 8 art px across at s = 1 ----------------
  const EMB = {
    pebble(t, P) { let [x, y] = P(0, 2.2); t.ell(x, y, 3.8, 1.9, R.stone); [x, y] = P(0.3, -0.5); t.ell(x, y, 2.8, 1.5, R.stone); [x, y] = P(0, -2.7); t.ell(x, y, 1.7, 1.1, R.stone); },
    thorn(t, P) { stroke(t, [P(-3.4, 3.4), P(2.6, -2.6)], 0.4, 0.4, R.leaf[2]); const [x, y] = P(-0.4, -0.2); t.ell(x, y, 3.8, 1.9, R.leaf[1], -0.78); t.ell(x - 1, y - 0.3, 1.4, 0.6, R.leaf[0], -0.78); t.poly([P(0.8, 1.6), P(2.9, 2.2), P(1.4, 2.7)], R.leaf[2]); },
    wave(t, P) { box(t, ...P(-4, 1.4), ...P(4, 3.4), R.sea[1]); stroke(t, [P(-3.6, 1.6), P(-2, 0), P(-0.4, -1.9), P(1.4, -3), P(3.2, -2.4), P(2.3, -1.1), P(1.4, 0.6)], 1, 0.75, R.sea[1]); stroke(t, [P(-0.9, -1.4), P(1, -2.5), P(2.5, -2.3)], 0.32, 0.32, '#ffffff'); },
    moon(t, P) { const [x, y] = P(-0.4, 0); t.ell(x, y, 3.8, 3.8, '#fff27a'); t.ell(x + 1.8, y - 1.1, 3, 3, null); t.ell(x - 2, y + 0.8, 0.7, 0.7, '#fffbd0'); const [a, b] = P(2.8, 2.4); t.set(a, b, '#ffffff'); },
    candy(t, P) { stroke(t, [P(0, 1.4), P(0, 4.2)], 0.45, 0.45, CREAM[1]); const [x, y] = P(0, -1); t.ell(x, y, 3.3, 3.3, R.candy[1]); stroke(t, [P(0, -1), P(1.2, -1.8), P(0.4, -3.1), P(-1.4, -2.6), P(-2.2, -0.8), P(-1.2, 1.1), P(1, 1.2), P(2.4, -0.4)], 0.32, 0.32, '#ffffff'); },
    star(t, P) { const [x, y] = P(0, 0.3); t.poly(PX.starPts(x, y, 4.4, 2, 5), '#fff27a'); t.poly(PX.starPts(x - 0.4, y - 0.4, 1.7, 0.8, 5), '#ffffff'); },
    eclipse(t, P) { const [x, y] = P(0, 0); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; t.ell(x + Math.cos(a) * 3.7, y + Math.sin(a) * 3.7, 0.7, 0.7, '#fbf236'); } t.ell(x, y, 3, 3, '#fbf236'); t.ell(x + 0.7, y - 0.4, 2.4, 2.4, '#3f3f74'); },
    comet(t, P) { stroke(t, [P(-3.8, 3.4), P(0.2, -0.2)], 0.25, 0.9, '#cbdbfc'); stroke(t, [P(-3.4, 1), P(-0.4, -1)], 0.2, 0.5, '#9fd8ff'); const [x, y] = P(1.2, -1.2); t.poly(PX.starPts(x, y, 3.2, 1.4, 5), '#fff27a'); },
    peak(t, P) { t.poly([P(-4.2, 3.4), P(-1.2, -3), P(0.6, -0.8), P(2, -2.4), P(4.2, 3.4)], R.ember[2]); t.poly([P(-1.2, -3), P(-2.5, -0.3), P(-1.3, -0.9), P(-0.3, 0), P(0.6, -0.8)], '#ffffff'); t.poly([P(0.6, -0.8), P(4.2, 3.4), P(1.8, 3.4)], '#663931'); },
    crown(t, P) { t.poly([P(-3.8, 2.8), P(-4, -2), P(-1.8, 0), P(0, -3.3), P(1.8, 0), P(4, -2), P(3.8, 2.8)], '#fff27a'); box(t, ...P(-3.8, 1.5), ...P(3.8, 2.8), '#e8ae3a'); for (const a of [-2.3, 0, 2.3]) { const [x, y] = P(a, 0.7); t.ell(x, y, 0.6, 0.6, R.royal[1]); } },
    snow(t, P) { const [x, y] = P(0, 0); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2, dx = Math.cos(a) * 3.9, dy = Math.sin(a) * 3.9; stroke(t, [[x - dx, y - dy], [x + dx, y + dy]], 0.42, 0.42, '#ffffff'); } t.ell(x, y, 1.1, 1.1, '#cbdbfc'); },
    wing(t, P) { for (const [a, b, rx, rot] of [[-0.6, -1.8, 3.8, -0.5], [0, 0.2, 3.4, -0.2], [0.6, 2, 2.8, 0.1]]) { const [x, y] = P(a, b); t.ell(x, y, rx, 1.25, '#ffffff', rot); } const [x, y] = P(-3.2, 0); t.ell(x, y, 1.5, 2.6, '#f6e8c6'); },
    bone(t, P) { stroke(t, [P(-2.2, 2.2), P(2.2, -2.2)], 0.8, 0.8, CREAM[1]); for (const [a, b] of [[-2.9, 1.6], [-1.6, 2.9], [2.9, -1.6], [1.6, -2.9]]) { const [x, y] = P(a, b); t.ell(x, y, 1.05, 1.05, CREAM[1]); } stroke(t, [P(-1.2, 0.6), P(0.6, -1.2)], 0.22, 0.22, '#ffffff'); },
    tentacle(t, P) { stroke(t, [P(-2.6, 3.6), P(-2.4, 0.6), P(-0.8, -1.8), P(1.6, -2.6), P(3, -1.2), P(2.2, 0.4), P(0.8, -0.2)], 1.3, 0.45, R.candy[1]); for (const [a, b] of [[-1.7, 1.2], [-0.4, -0.8], [1.4, -1.6]]) { const [x, y] = P(a, b); t.ell(x, y, 0.5, 0.5, R.candy[0]); } },
    feather(t, P) { const [x, y] = P(0, 0); t.ell(x, y, 4.2, 1.9, '#ff9a3a', -0.9); t.ell(x - 0.3, y + 0.3, 2.6, 1, '#fff27a', -0.9); stroke(t, [P(-3.4, 3.6), P(2.4, -2.6)], 0.22, 0.22, '#d95763'); },
    mossrock(t, P) { // a round stone with a mossy cap and a little sprout
      let [x, y] = P(0, 1.4); t.ell(x, y, 4.2, 3.1, R.stone); [x, y] = P(0, -0.8); t.ell(x, y, 3.8, 1.6, R.fern[1]);
      for (const a of [-2.7, -0.9, 0.9, 2.7]) { [x, y] = P(a, 0.25); t.ell(x, y, 0.85, 0.75, R.fern[1]); }
      for (const a of [-1.3, 1.3]) { [x, y] = P(a, 2); t.ell(x, y, 0.42, 0.55, INK); }
      stroke(t, [P(0, -1.6), P(0.2, -3.6)], 0.3, 0.3, R.leaf[2]); [x, y] = P(-1, -3.8); t.ell(x, y, 1.2, 0.6, R.leaf[1], -0.5); [x, y] = P(1.4, -4); t.ell(x, y, 1.3, 0.65, R.leaf[1], 0.5);
      [x, y] = P(-1.8, -0.8); t.ell(x, y, 0.55, 0.55, '#f7b6c8'); [x, y] = P(1.6, -0.6); t.ell(x, y, 0.5, 0.5, '#f7b6c8');
    },
    fluke(t, P) { // a whale's tail rising out of the sea, with a splash
      let [x, y] = P(0, 3.3); t.ell(x, y, 4.2, 1.1, '#9fd8ff');
      stroke(t, [P(0, 3), P(0, 0.4), P(0, -0.9)], 0.9, 0.55, R.sea[1]);
      [x, y] = P(-1.9, -2); t.ell(x, y, 2.5, 1, R.sea[1], 0.64); [x, y] = P(1.9, -2); t.ell(x, y, 2.5, 1, R.sea[1], -0.64);
      [x, y] = P(-2.2, -2.5); t.ell(x, y, 1.1, 0.4, R.sea[0], 0.64); [x, y] = P(-3.6, 1.8); t.ell(x, y, 0.5, 0.6, '#ffffff'); [x, y] = P(3.5, 1.6); t.ell(x, y, 0.5, 0.6, '#ffffff');
    },
    paw(t, P) { // a big wolf paw print under a tiny crescent
      let [x, y] = P(0, 1.5); t.ell(x, y, 2.4, 2, '#ffffff');
      for (const [a, b] of [[-2.7, -0.9], [-1, -2.6], [1, -2.6], [2.7, -0.9]]) { [x, y] = P(a, b); t.ell(x, y, 0.95, 1.15, '#ffffff'); }
      [x, y] = P(0, 1.3); t.ell(x, y, 1.1, 0.8, '#fff27a');
    },
    crystals(t, P) { // three crystals: a lit left face on each
      for (const [a, h, w, c, lt] of [[-2.3, 4.8, 1.25, '#c8aaf0', '#f0e2ff'], [2.3, 4.4, 1.2, '#f7b6c8', '#ffd4f2'], [0, 7, 1.55, '#5ee2f2', '#ccfcff']]) {
        const pt = (u, v) => P(a + u, 3.2 - v);
        t.poly([pt(-w, 0), pt(-w, h * 0.62), pt(0, h), pt(w, h * 0.62), pt(w, 0)], c); t.poly([pt(-w, 0), pt(-w, h * 0.62), pt(0, h), pt(-w * 0.2, h * 0.6), pt(-w * 0.25, 0)], lt);
      }
    },
    sunmane(t, P) { // a sun with a lion's mane of rays
      const [x, y] = P(0, 0); t.poly(PX.starPts(x, y, 4.5, 2.7, 10), '#ff9a3a'); t.ell(x, y, 2.7, 2.7, '#fff27a'); t.ell(x - 0.6, y - 0.7, 1, 0.9, '#fffbd0');
    },
    firststar(t, P) { // the First Star: a big four-pointed sparkle with two little ones twinkling beside it
      let [x, y] = P(0, 0.2); t.poly(PX.starPts(x, y, 4.4, 1.25, 4), '#fff27a'); t.ell(x, y, 1.25, 1.25, '#ffffff');
      for (const [a, b, r] of [[-3, -2.8, 1.5], [3, 2.9, 1.3]]) { [x, y] = P(a, b); t.poly(PX.starPts(x, y, r, r * 0.38, 4), '#9fd8ff'); }
    },
    flame(t, P) { const [x, y] = P(0, 1.2); t.ell(x, y, 3, 2.6, '#df7126'); t.poly([P(-2.8, 0.6), P(-0.7, -2.6), P(0.2, -1.3), P(1.1, -4.3), P(2.8, 0.6)], '#df7126'); t.ell(x, y + 0.4, 1.5, 1.5, '#fbf236'); t.poly([P(-1.3, 1), P(0.2, -1.5), P(1.3, 1)], '#fbf236'); },
  };
  const AT = (x, y, s) => (a, b) => [x + a * s, y + b * s];
  function emblem(g, kind, x, y, s) { piece(g, t => (EMB[kind] || EMB.star)(t, AT(x, y, s))); }

  // ---------------- the three shapes ----------------
  function cup(g, C, em) { // a league: a two-handled gold cup on a coloured base
    piece(g, t => { for (const d of [-1, 1]) { t.ell(16 + d * 9.6, 10, 3.4, 4, GOLD[1]); t.ell(16 + d * 9.6, 10, 1.6, 2.2, null); } });
    piece(g, t => { box(t, 7.5, 26.5, 24.5, 30, C[1]); box(t, 7.5, 28.8, 24.5, 30, C[2]); box(t, 11, 27.2, 21, 28, C[0]); });
    piece(g, t => { t.poly([[10.5, 23.5], [21.5, 23.5], [23, 26.5], [9, 26.5]], GOLD[1]); t.poly([[18.5, 23.5], [21.5, 23.5], [23, 26.5], [19.5, 26.5]], GOLD[2]); });
    piece(g, t => { t.poly([[14.2, 18], [17.8, 18], [17.1, 23.5], [14.9, 23.5]], GOLD[1]); t.ell(16, 20.6, 2.6, 1.1, GOLD[1]); t.poly([[16.6, 18], [17.8, 18], [17.1, 23.5], [16.4, 23.5]], GOLD[2]); });
    piece(g, t => t.ell(16, 6.2, 10, 12.4, GOLD, 0, (x, y) => y >= 4));
    piece(g, t => { t.ell(16, 4.2, 10.3, 2, GOLD_LIP[1]); t.ell(16, 4.4, 8.6, 1.1, GOLD_IN); });
    emblem(g, em, 16, 11.6, 1.05);
    gloss(g, [[8.1, 8], [8.3, 11.5], [9.2, 14], [10.2, 15.6]], '#fffbe6');
  }
  function medal(g, C, em) { // a Legend: a gold medal on a two-colour ribbon
    piece(g, t => { t.poly([[8, 1], [13.5, 1], [17.2, 11.6], [12.6, 12.8]], C[1]); t.poly([[11, 1], [13.5, 1], [17.2, 11.6], [15, 12.2]], C[2]); });
    piece(g, t => { t.poly([[18.5, 1], [24, 1], [19.4, 12.8], [14.8, 11.6]], CREAM[0]); t.poly([[21.2, 1], [24, 1], [19.4, 12.8], [17.6, 12.2]], CREAM[2]); });
    piece(g, t => { for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7 + Math.PI / 14; t.ell(16 + Math.cos(a) * 9.4, 19.6 + Math.sin(a) * 9.4, 1.2, 1.2, GOLD[2]); } t.ell(16, 19.6, 9.4, 9.4, GOLD); });
    piece(g, t => t.ell(16, 19.6, 6.8, 6.8, C));
    emblem(g, em, 16, 19.8, 1);
    gloss(g, [[11.4, 13.2], [10.1, 14.6], [9.3, 16.4], [9.2, 17.8]], '#fffbe6');
  }
  function tower(g, M) { // a Battle Tower floor: a little tower statue with a star on top, on a wooden base
    piece(g, t => { box(t, 6.5, 26.5, 25.5, 30, WOOD[1]); box(t, 6.5, 29, 25.5, 30, WOOD[2]); box(t, 6.5, 26.5, 25.5, 27.2, WOOD[0]); });
    piece(g, t => box(t, 12, 27.6, 20, 29.2, GOLD[1]));
    piece(g, t => {
      t.poly([[10.5, 12.5], [21.5, 12.5], [22.6, 26.5], [9.4, 26.5]], M[1]);
      t.poly([[18.6, 12.5], [21.5, 12.5], [22.6, 26.5], [19.2, 26.5]], M[2]);
      t.poly([[11.4, 12.5], [12.6, 12.5], [12.2, 26.5], [10.8, 26.5]], M[0]);
    });
    piece(g, t => { box(t, 9, 10, 23, 13, M[1]); for (const x of [9, 14.5, 20]) box(t, x, 7.5, x + 3, 10.4, M[1]); box(t, 20, 7.5, 23, 13, M[2]); });
    g.ell(16, 23.2, 2.1, 2.1, DOOR, 0, (x, y) => y <= 26); g.rect(14, 23, 4, 4, DOOR); g.rect(14, 15, 1, 2, DOOR); g.rect(17, 15, 1, 2, DOOR);
    piece(g, t => { t.poly(PX.starPts(16, 4.2, 4, 1.8, 5), '#fbf236'); t.poly(PX.starPts(15.6, 3.8, 1.5, 0.7, 5), '#ffffff'); });
  }

  // ---------------- PX.trophy ----------------
  const SPEC = {};
  for (const [k, v] of Object.entries(LEAGUE)) SPEC['l-' + k] = g => cup(g, R[v[1]], v[0]);
  for (const [k, v] of Object.entries(LEGEND)) SPEC['g-' + k] = g => medal(g, R[v[1]], v[0]);
  for (const [f, m] of Object.entries(TOWER)) SPEC['t-' + f] = g => tower(g, METAL[m]);
  PX.TROPHY_IDS = Object.keys(SPEC);
  PX.TOWER_TROPHY_FLOORS = Object.keys(TOWER).map(Number);
  const base = {}; // id + dim -> the 1x picture (at most 2 per id)
  function draw1x(id, dim) {
    const key = id + (dim ? ':d' : ''); if (base[key]) return base[key];
    const S = SPEC[id]; if (!S || !PX.Grid || !PX.stroke) return null;
    const g = new PX.Grid(32, 32); g.dither = false;
    S(g);
    if (PX.hd) PX.hd(g, { outer: false }); // smooth any art-pixel staircase, thin long 2-fine-pixel ink lines
    if (dim) { // a flat silhouette: one fill, the ink edge (fine pixels touching the outside) kept as a darker line
      const FW = g.fw, on = (fx, fy) => !!g.fget(fx, fy), edge = (fx, fy) => !on(fx - 1, fy) || !on(fx + 1, fy) || !on(fx, fy - 1) || !on(fx, fy + 1);
      g.a = g.a.map((c, i) => (c ? (c === INK && edge(i % FW, (i / FW) | 0) ? '#4a3a40' : '#8a7868') : null));
      if (g.k > 1) g.outerLine('#4a3a40');
    } else if (g.k > 1) g.outerLine(); // the silhouette's outer ring: 1 art pixel of ink in all, the same weight as a Sprout's
    return (base[key] = g.canvas());
  }
  PX.trophy = function (id, scale, o) {
    if (typeof document === 'undefined') return null;
    let b; try { b = draw1x(id, !!(o && o.dim)); } catch (e) { console.error('PX.trophy', id, e); return null; }
    if (!b) return null;
    const k = Math.max(1, Math.round(scale || 1)), c = document.createElement('canvas');
    c.width = b.width * k; c.height = b.height * k;
    const x = c.getContext && c.getContext('2d'); if (!x) return c;
    x.imageSmoothingEnabled = false; x.drawImage(b, 0, 0, c.width, c.height);
    return PX.keepK ? PX.keepK(b, c) : c;
  };
})();
