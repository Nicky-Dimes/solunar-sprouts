// art-raid.js — Solunar Sprouts: the night-raid art (PX.raid). The Gloomlings are cute-spooky shadow creatures: round, glossy
// little bodies in deep indigo and violet, big friendly glowing eyes, wobbly skirts, never scary. Plus their boss (the Gloom King:
// a big Gloomling with a wonky crown, a cape and a moon sceptre), the effects, the Moon Owl who chases the gloom away, and icons.
// Same definition as the Sprouts (art rule #1, docs/solunar-graphics-plan.md §0 / §8): every picture is a PX.Grid at k = 2 drawn
// in FINE pixels (ell / poly / stroke / dots), soft 5-step ramps lit from the upper left, 1-fine-px piece lines and one outer ink
// ring (PX.hd -> outerLine), no dither; colours are the game's own palette and ramps (PX.RAMPS) or mixes of them.
// Never touches the DOM at load (tools/check_game.js runs art files in Node): each canvas is drawn the first time it is asked
// for and cached (a fixed set of keys: about 50 canvases, under 0.5 MB). Sizes and anchors are in ART px: draw with PX.blit
// (anchor bottom-centre) or PX.artW / PX.artH. Units, shots and the owl face RIGHT (flip to face left).
//
//   PX.raid.unit(kind, pose)   kind 'blob' | 'bat' | 'wisp' | 'brute' | 'king', pose 'idle' | 'walk0' | 'walk1' | 'attack' | 'hurt'
//                              (unknown kind -> 'blob', unknown pose -> 'idle'). Anchor: bottom-centre = the feet on the ground;
//                              for the flyers (bat, wisp) the bottom-centre is the SHADOW point: the body floats `hover` art px
//                              above it inside the canvas, so blit it at the ground spot and draw the shadow there.
//   PX.raid.UNITS              { kind: { w, h, fly, name, hover, cy, top } } in art px: w x h canvas; hover = empty rows under a
//                              flyer's body; cy = the body's middle above the anchor (aim shots / tap here); top = the top of the
//                              body above the anchor (a health bar goes 2-3 px above it; the King's includes his crown).
//                                blob  18 x 16  Gloomling (small, slow)        bat   20 x 16  Gloom Bat (flies, fast; hover 4)
//                                wisp  14 x 18  Shadow Wisp (floats, throws shadow balls; hover 1: its tail fades out)
//                                brute 26 x 26  Gloom Brute (big and tough)    king  44 x 44  the Gloom King (the boss)
//   PX.raid.fx(kind)           'poof' 20 x 16 (a defeated one: a shadow puff turning to sparkles; 'poof1' / 'poof2' = optional
//                              later frames, fewer puffs and more sparkles), 'portal0' / 'portal1' 32 x 14 (the swirly shadow
//                              portal on the ground, two frames of its swirl; its middle is 7 px above the anchor),
//                              'ko' 20 x 10 (dizzy stars to blit just above a resting Sprout's head, their ring's middle 5 px
//                              above the anchor; 'ko1' = the stars a little further round: swap the two to spin them),
//                              'shadowball' 10 x 10 (a wisp's shot, middle (5, 5)), and 'shot:<element>' for every key of
//                              PSDATA.ELEMENTS (a Sprout's shot; middle = the canvas middle, flying right): leaf 9 x 7,
//                              water 9 x 7, fire 11 x 7, stone 7 x 7, sky 9 x 8, shadow 8 x 8, light 9 x 9, sweet 11 x 7,
//                              normal 8 x 8; an element added later gets a round shot in its own colour (8 x 8).
//   PX.raid.owl(pose)          'fly0' (wings up) | 'fly1' (wings down), 30 x 22: the Moon Owl (anchor: bottom-centre, its talons).
//   PX.raid.icon(kind)         16 x 16 UI icons: 'raid' (a Gloomling, for the banner), 'king' (the Gloom King), 'moon'.
//   PX.raid.KINDS / POSES / FX / OWL / ICONS list the ids above; PX.raid.shots() lists the shot ids for the elements loaded now.
// Everything returns null (and logs) if a picture fails to draw, so callers keep a simple fallback.
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.PX) return;
  const PX = window.PX, INK = PX.INK || '#222034', W = '#ffffff';

  // ---------------- colours: the game's ramps and 50/50 mixes of them ----------------
  const memo = new Map();
  function mix(a, b, k) {
    const key = a + b + k; let v = memo.get(key); if (v) return v;
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), c = s => Math.round((A >> s & 255) * (1 - k) + (B >> s & 255) * k);
    v = '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
    if (memo.size > 800) memo.clear(); memo.set(key, v); return v;
  }
  const RA = PX.RAMPS || {}, r3 = (id, d) => (RA[id] && RA[id].length === 3 ? RA[id] : d);
  const NIGHT = r3('night', ['#7d8cf0', '#4a4aa0', '#2c2c66']), PLUM = r3('plum', ['#c9a2f0', '#9a6ad0', '#5e3a8e']);
  const LILAC = r3('lilac', ['#f0e2ff', '#c8aaf0', '#8c6cc4']), PERI = r3('periwinkle', ['#d8dcff', '#9ca6f6', '#5e66c4']);
  const SUN = r3('sun', ['#fff27a', '#f6c83a', '#c7861c']), CLOUD = r3('cloud', ['#ffffff', '#dfe8fb', '#9badb7']);
  const RASP = r3('raspberry', ['#e87aa8', '#b0386e', '#6a1e48']), LEAF = r3('leaf', ['#99e550', '#6abe30', '#37946e']);
  const SKY = r3('sky', ['#9fd8ff', '#639bff', '#3f55b8']), CLAY = r3('clay', ['#f5a86a', '#df7126', '#96461c']);
  const SLATE = r3('slate', ['#b7c2cc', '#8c93a8', '#595a70']), CREAM = r3('cream', ['#fffdf2', '#f6e8c6', '#ccb28a']);
  const ROSE = r3('rose', ['#f7b6c8', '#e07ba0', '#a2477a']);
  const SAND = r3('sand', ['#f8ecc4', '#dcc690', '#a08a58']), BGUM = r3('bubblegum', ['#ffd4f2', '#ff86d2', '#c4489a']);
  const DEEP = mix(NIGHT[2], PLUM[2], 0.5);                                   // the deepest violet
  const GLOOM = [mix(NIGHT[0], PLUM[1], 0.5), mix(NIGHT[1], PLUM[2], 0.5), NIGHT[2]]; // Gloomlings and the King: blue-violet
  const BATC = [PLUM[1], PLUM[2], DEEP];                                      // Gloom Bat: plum
  const WING = [mix(NIGHT[1], PLUM[1], 0.5), DEEP, mix(NIGHT[2], INK, 0.5)];  // its wings, a step darker
  const WISPC = [mix(LILAC[1], PLUM[0], 0.5), PLUM[1], DEEP];                 // Shadow Wisp: light lilac-violet
  const BRUTE = NIGHT;                                                         // Gloom Brute: deep indigo-blue
  const TUMMY = [mix(NIGHT[0], LILAC[0], 0.5), mix(NIGHT[0], LILAC[1], 0.5), mix(NIGHT[1], LILAC[2], 0.5)];
  const KINGC = [GLOOM[0], GLOOM[1], mix(NIGHT[2], '#45283c', 0.5)];
  const EYE = ['#fffbe0', SUN[0], SUN[1]], GOLD = ['#fff6c8', SUN[1], SUN[2]];
  const TONGUE = mix(ROSE[1], PLUM[1], 0.5), BLUSH = c => mix(c, '#f07aa8', 0.5);
  const OWL = [W, mix(W, PERI[0], 0.5), PERI[1]];

  // ---------------- drawing kit (fine pixels; the same kit as art-arcade.js) ----------------
  const grid = (w, h, k) => { const g = new PX.Grid(w, h, k || 2); g.dither = false; return g; };
  const fm = fn => { const f = (x, y) => fn(x, y); f.fine = true; return f; }; // an ell mask in fine precision
  const IN = g => fm((x, y) => g.filled(x, y));
  // fn(x, y, colour, fx, fy) for every fine pixel (x, y = its centre in art px); a returned colour replaces it
  function each(g, fn) {
    const k = g.k, fw = g.fw, a = g.a;
    for (let fy = 0; fy < g.fh; fy++) for (let fx = 0; fx < fw; fx++) { const c = fn((fx + 0.5) / k, (fy + 0.5) / k, a[fy * fw + fx], fx, fy); if (c !== undefined) a[fy * fw + fx] = c; }
    return g;
  }
  // a piece drawn on its own layer with a 1-fine-px ink line round it, then laid over g
  function piece(g, draw, edge) { const t = grid(g.w, g.h, g.k); draw(t); t.outline(edge); return g.merge(t); }
  const R5 = R => (PX.ramp5 ? PX.ramp5(R) : [R[0], R[0], R[1], R[2], R[2]]);
  const soft = (R, nx, ny) => { if (PX.shadeSoft) return PX.shadeSoft(R5(R), nx, ny); const d = nx * 0.55 + ny * 0.85; return d < -0.42 ? R[0] : d > 0.55 ? R[2] : R[1]; };
  // the finishing pass: 2-fine ink lines thinned, then the one outer ink ring (PX.hd)
  const done = (g, o) => (PX.hd ? PX.hd(g, Object.assign({ epx: false, dedither: false }, o)) : (g.k > 1 && (!o || o.outer !== false) ? g.outerLine() : g));
  const inE = (x, y, cx, cy, rx, ry, rot) => { let dx = x - cx, dy = y - cy; if (rot) { const c = Math.cos(-rot), s = Math.sin(-rot), u = dx * c - dy * s; dy = dx * s + dy * c; dx = u; } return dx * dx / (rx * rx) + dy * dy / (ry * ry) <= 1; };
  const turn = (x, y, cx, cy, a) => (a ? [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)] : [x, y]);
  const FLAT = '#010203'; // a silhouette's placeholder tone: vol() shades all of it as one round volume
  // every FLAT pixel shaded as ONE soft volume round (cx, cy), lit from the upper left: a 1-fine rim light on the upper-left
  // edge, a soft bounce light on the lower-right edge and the Sprouts' 5 soft steps in between
  function vol(t, R, cx, cy, rx, ry) {
    const hi = mix(R[0], W, 0.4), lo = mix(R[2], R[1], 0.55), open = (fx, fy) => t.fget(fx, fy) === null;
    return each(t, (x, y, v, fx, fy) => {
      if (v !== FLAT) return;
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * 0.55 + ny * 0.85;
      if (d < -0.25 && (open(fx, fy - 1) || open(fx - 1, fy))) return hi;
      if (d > 0.5 && (open(fx, fy + 1) || open(fx + 1, fy))) return lo;
      return soft(R, 0, (d + 0.3 * Math.max(0, nx * nx + ny * ny - 0.45)) / 0.85); // (the bands curve round the body's edge)
    });
  }
  // a glossy highlight (an oval up-left on a round body): whatever is there, mixed toward white, brighter in its core
  function gloss(g, cx, cy, rx, ry, rot) {
    const K = g.k;
    for (let fy = Math.floor((cy - ry - 1) * K); fy <= (cy + ry + 1) * K; fy++) for (let fx = Math.floor((cx - rx - 1) * K); fx <= (cx + rx + 1) * K; fx++) {
      const c = g.fget(fx, fy); if (!c || c === INK || c[0] !== '#') continue;
      const x = (fx + 0.5) / K, y = (fy + 0.5) / K; if (!inE(x, y, cx, cy, rx, ry, rot)) continue;
      g.fset(fx, fy, mix(c, W, inE(x, y, cx - rx * 0.12, cy - ry * 0.1, rx * 0.5, ry * 0.48, rot) ? 0.72 : 0.36));
    }
  }
  // a little four-point twinkle in fine pixels
  const tw = (g, x, y, c) => { const d = 1 / g.k; return g.dots([[x, y - d], [x - d, y], [x + d, y], [x, y + d]], c || '#fff6b0').dot(x, y, W); };
  // turn the pixels below y into see-through ones (a wisp's fading tail): body tones keep their colour, ink turns violet
  function fade(g, y0, y1) {
    each(g, (x, y, v) => {
      if (!v || v[0] !== '#' || y < y0) return;
      const a = y < y1 ? 0.82 : 0.55, n = parseInt((v === INK ? DEEP : v).slice(1), 16);
      return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${v === INK ? a * 0.9 : a})`;
    });
  }

  // ---------------- faces ----------------
  // a big friendly glowing eye, made like a Sprout's (a glossy dark oval with a 2 x 2 shine up-left, a small shine down-right
  // and a glow low in the eye) inside a 1-fine-px glowing yellow rim, with a soft lilac light on the body round it.
  // rx, ry = the outer size (rim included). side -1 / 1 = the left / right eye. mood: 'open', 'brave' (a short brow slanting
  // down to the nose: determined, not cross), 'shut' (squeezed shut: a glowing > or <). pupil: an owl's eye instead (a big
  // yellow iris round a small round pupil, that share of the eye).
  function eye(g, cx, cy, rx, ry, o) {
    o = o || {};
    const side = o.side || 1, mood = o.mood || 'open';
    if (mood === 'shut') {
      const s = side < 0 ? 1 : -1;
      PX.stroke(g, [[cx - rx * 0.8 * s, cy - ry * 0.5], [cx + rx * 0.65 * s, cy + ry * 0.05], [cx - rx * 0.8 * s, cy + ry * 0.6]], 0.36, 0.36, EYE[1]);
      return;
    }
    g.ell(cx, cy, rx + 0.42, ry + 0.42, o.halo, 0, IN(g));
    g.ell(cx, cy, rx, ry, EYE);
    const shine = (x, y) => g.dot(x, y, W);
    if (o.pupil) { // an owl's eye
      const px = cx + rx * (o.look || 0), prx = rx * o.pupil;
      g.ell(px, cy + ry * 0.05, prx, ry * (o.pupil + 0.06), INK);
      shine(px - prx * 0.45, cy - ry * 0.3); shine(px + prx * 0.5, cy + ry * 0.35);
    } else {
      const ex = rx - 0.5, ey = ry - 0.5, ink = fm((x, y) => g.get(x, y) === INK);
      g.ell(cx, cy, ex, ey, INK);
      g.ell(cx + 0.1, cy + ey * 0.56, ex * 0.56, ey * 0.27, SUN[2], 0, ink); g.dot(cx + 0.1, cy + ey * 0.62, SUN[1]); // (the glow low in the eye)
      const sx = cx - ex * 0.36, sy = cy - ey * 0.5;
      if (ex >= 0.95) { shine(sx, sy); shine(sx + 0.5, sy); shine(sx, sy + 0.5); shine(sx + 0.5, sy + 0.5); } else shine(sx, sy);
      if (ex >= 1.6) { shine(sx + 1, sy); shine(sx + 1, sy + 0.5); shine(sx, sy + 1); shine(sx + 0.5, sy + 1); }
      if (ex >= 0.95) shine(cx + ex * 0.4, cy + ey * 0.32);
    }
    if (mood === 'brave' && o.brow !== false) PX.stroke(g, [[cx - side * rx * 1.05, cy - ry * 1.3 - 0.2], [cx + side * rx * 0.75, cy - ry * 1.3 - 0.75]], 0.36, 0.3, INK);
  }
  // mouths: 'smile' (default), 'open' (a D with a tongue), 'o', 'wavy' (hurt), 'grin' (the King's smug one); s = size
  function mouth(g, x, y, kind, s) {
    s = s || 1;
    const ln = (pts, r) => PX.stroke(g, pts.map(([a, b]) => [x + a * s, y + b * s]), r || 0.3, r || 0.3, INK);
    if (kind === 'open') { g.ell(x, y, 1.15 * s, 1.05 * s, INK, 0, fm((X, Y) => Y >= y - 0.25 * s)); g.ell(x + 0.1 * s, y + 0.55 * s, 0.62 * s, 0.38 * s, TONGUE); }
    else if (kind === 'o') { g.ell(x, y, 0.62 * s, 0.75 * s, INK); g.ell(x, y + 0.15 * s, 0.28 * s, 0.34 * s, TONGUE); }
    else if (kind === 'wavy') ln([[-1.1, 0.2], [-0.55, -0.25], [0, 0.2], [0.55, -0.25], [1.1, 0.2]], 0.28);
    else if (kind === 'grin') ln([[-1.2, -0.45], [-0.55, 0.3], [0.55, 0.35], [1.25, -0.3]], 0.32);
    else ln([[-0.95, -0.35], [-0.4, 0.3], [0.4, 0.3], [0.95, -0.35]]);
  }
  function cheek(g, x, y, rx, ry, c) { g.ell(x, y, rx, ry, c, 0, IN(g)); g.dot(x - rx * 0.45, y - ry * 0.45, mix(c, W, 0.5)); }
  // a little light-blue drop (hurt)
  function sweat(g, x, y, s) {
    s = s || 1;
    piece(g, t => { t.ell(x, y + 0.5 * s, 0.85 * s, 0.9 * s, ['#e4f6ff', SKY[0], SKY[1]]); t.poly([[x, y - 1.3 * s], [x - 0.72 * s, y + 0.3 * s], [x + 0.72 * s, y + 0.3 * s]], SKY[0]); });
    g.dot(x - 0.3 * s, y + 0.2 * s, W);
  }

  // ---------------- the units ----------------
  const KINDS = ['blob', 'bat', 'wisp', 'brute', 'king'], POSES = ['idle', 'walk0', 'walk1', 'attack', 'hurt'];
  const UNITS = {
    blob: { w: 18, h: 16, fly: false, name: 'Gloomling', hover: 0, cy: 7, top: 15 },
    bat: { w: 20, h: 16, fly: true, name: 'Gloom Bat', hover: 4, cy: 9, top: 15 },
    wisp: { w: 14, h: 18, fly: true, name: 'Shadow Wisp', hover: 1, cy: 10, top: 17 },
    brute: { w: 26, h: 26, fly: false, name: 'Gloom Brute', hover: 0, cy: 11, top: 23 },
    king: { w: 44, h: 44, fly: false, name: 'Gloom King', hover: 0, cy: 17, top: 40 },
  };
  // a Gloomling-family body: a dome over a wobbly skirt of round bumps, with a little smoke curl on top
  function gloomBody(g, B, R) {
    piece(g, t => {
      t.ell(B.cx, B.cy, B.rx, B.ry, FLAT, B.rot || 0, fm((x, y) => y <= B.cut));
      for (const [x, y, r] of B.bumps) t.ell(x, y, r, r, FLAT);
      if (B.curl) PX.stroke(t, B.curl, B.cr[0], B.cr[1], FLAT);
      vol(t, R, B.cx, B.cy, B.rx, B.ry);
    });
  }
  const HALO = R => mix(R[0], LILAC[0], 0.45); // (the soft light the eyes throw on the body round them)

  // Gloomling: pose tweaks (dx / dy shift, sx / sy squash and stretch, rot tilt, b = skirt bumps lifted, sway = its curl)
  const BLOB_P = {
    idle: {}, walk0: { dy: -0.1, sx: 0.95, sy: 1.03, b: [-0.6, 0.15, -0.6], sway: 0.6 }, walk1: { dy: 0.25, sx: 1.04, sy: 0.92, b: [0.15, -0.6, 0.15], sway: -0.5 },
    attack: { dx: 0.45, rot: 0.12, mood: 'brave', mouth: 'open', sway: 0.9 }, hurt: { dx: -0.3, dy: 0.4, sx: 1.03, sy: 0.9, rot: -0.11, mood: 'shut', mouth: 'wavy', sweat: 1, sway: -0.9 },
  };
  function gloomling(g, P, F) { // F = frame: { cx, cy, rx, ry, by (the skirt line), sp (bump spacing), br (bump radius), front }
    const cx = F.cx + (P.dx || 0), cy = F.cy + (P.dy || 0), sx = P.sx || 1, sy = P.sy || 1, rot = P.rot || 0, b = P.b || [0, 0, 0], sw = P.sway || 0;
    const rx = F.rx * sx, ry = F.ry * sy, top = cy - ry, at = (x, y) => turn(x, y, cx, cy, rot), k = F.rx / 7.2;
    const [qx, qy] = at(cx - 0.3 * k, top + 0.75);
    gloomBody(g, { cx, cy, rx, ry, rot, cut: F.by, bumps: [[F.cx - F.sp * sx, F.by + b[0], F.br], [F.cx, F.by + b[1], F.br * 1.05], [F.cx + F.sp * sx, F.by + b[2], F.br]],
      curl: [[qx, qy], [qx - 0.55 * k + sw * 0.2, qy - 1.0 * k], [qx - 0.2 * k + sw * 0.45, qy - 1.8 * k], [qx + 0.75 * k + sw * 0.6, qy - 2.0 * k], [qx + 1.4 * k + sw * 0.7, qy - 1.55 * k]], cr: [0.78 * k, 0.4 * k] }, GLOOM);
    const fr = F.front ? 0 : 1, fy = v => top + v * sy * k; // (face heights measured down from the top of the dome)
    for (const s of [-1, 1]) {
      const [X, Y] = at(cx + (fr ? (s < 0 ? -1.15 : 3.15) : s * 2.05) * sx * k, fy(5.45));
      eye(g, X, Y, 1.62 * k, 2.0 * k, { side: s, mood: P.mood, halo: HALO(GLOOM), look: fr ? 0.14 : 0 });
    }
    { const [X, Y] = at(cx - (fr ? 3.15 : 4.3) * k, fy(7.75)), [X2, Y2] = at(cx + (fr ? 5.35 : 4.3) * k, fy(7.65)); cheek(g, X, Y, 1.0 * k, 0.5 * k, BLUSH(GLOOM[1])); cheek(g, X2, Y2, 0.9 * k, 0.48 * k, BLUSH(GLOOM[1])); }
    { const [X, Y] = at(cx + (fr ? 1.05 : 0) * k, fy(8.2)); mouth(g, X, Y, P.mouth, k); }
    { const [X, Y] = at(cx - 3.8 * k, fy(2.4)); gloss(g, X, Y, 1.45 * k, 0.8 * k, -0.6 + rot); }
    if (P.sweat) sweat(g, cx + 6.3 * k, top + 1.6, k);
  }
  function blob(g, pose) { gloomling(g, BLOB_P[pose] || {}, { cx: 9, cy: 10.2, rx: 7.1, ry: 7.0, by: 12.8, sp: 4.35, br: 2.2 }); }

  // Gloom Bat: wings (the right wing; the left is its mirror): shoulder, tip, then a scalloped trailing edge back to the body
  const BAT_WING = [
    [[12.2, 5.0], [15.8, 3.3], [18.7, 3.1], [18.1, 6.9], [16.9, 5.9], [15.7, 7.9], [14.3, 6.8], [12.8, 8.7]], // level
    [[12.2, 5.4], [15.2, 2.2], [18.3, 1.2], [18.4, 4.6], [17.0, 3.9], [16.4, 6.0], [14.6, 5.4], [12.9, 8.4]], // up
    [[12.2, 5.0], [15.8, 5.4], [18.7, 7.4], [17.6, 10.5], [16.5, 8.9], [14.9, 10.6], [13.9, 8.9], [12.6, 9.7]], // down
    [[12.2, 5.8], [15.2, 7.0], [17.4, 9.6], [16.3, 10.9], [15.3, 9.6], [14.2, 10.7], [13.3, 9.4], [12.6, 10.0]], // drooping (hurt)
  ];
  const BAT_P = {
    idle: { wing: 0 }, walk0: { wing: 1, dy: 0.4 }, walk1: { wing: 2, dy: -0.35 },
    attack: { wing: 1, dx: 0.4, rot: 0.14, mood: 'brave', mouth: 'open' }, hurt: { wing: 3, dx: -0.4, dy: 0.5, rot: -0.14, mood: 'shut', mouth: 'wavy', sweat: 1 },
  };
  function bat(g, pose) {
    const P = BAT_P[pose] || {}, dx = P.dx || 0, dy = P.dy || 0, rot = P.rot || 0, cx = 10 + dx, cy = 7 + dy, at = (x, y) => turn(x, y, cx, cy, rot);
    const Wg = BAT_WING[P.wing || 0];
    for (const s of [-1, 1]) {
      const pts = Wg.map(([x, y]) => [10 + s * (x - 10) + dx, y + dy]);
      piece(g, t => {
        t.poly(pts, FLAT); vol(t, WING, cx + s * 4.5, cy - 1, 5, 4);
        const sh = pts[0], bone = mix(WING[0], BATC[0], 0.5);
        for (const i of [2, 3, 5]) { const n = 14; for (let j = 2; j < n; j++) { const x = sh[0] + (pts[i][0] - sh[0]) * j / n, y = sh[1] + (pts[i][1] - sh[1]) * j / n; if (t.filled(x, y)) t.dot(x, y, bone); } }
      });
    }
    piece(g, t => { // ears
      for (const [a, b2, c] of [[[7.6, 4.8], [6.8, 1.75], [9.3, 3.6]], [[10.9, 3.6], [13.1, 1.6], [12.9, 4.8]]]) t.poly([at(a[0] + dx, a[1] + dy), at(b2[0] + dx, b2[1] + dy), at(c[0] + dx, c[1] + dy)], FLAT);
      vol(t, BATC, cx, cy - 3, 4, 3);
      for (const [x, y] of [[7.55, 3.4], [12.25, 3.0]]) { const [X, Y] = at(x + dx, y + dy); t.ell(X, Y, 0.45, 0.9, BLUSH(BATC[1]), 0, IN(t)); }
    });
    piece(g, t => { t.ell(cx, cy + 0.2, 4.3, 4.0, FLAT, rot); vol(t, BATC, cx, cy, 4.3, 4.0); });
    for (const s of [-1, 1]) { const [X, Y] = at(cx + (s < 0 ? -1.3 : 2.1), cy - 0.1); eye(g, X, Y, 1.25, 1.55, { side: s, mood: P.mood, halo: HALO(BATC) }); }
    { const [X, Y] = at(cx - 2.9, cy + 1.7), [X2, Y2] = at(cx + 3.45, cy + 1.6); cheek(g, X, Y, 0.62, 0.36, BLUSH(BATC[1])); cheek(g, X2, Y2, 0.55, 0.34, BLUSH(BATC[1])); }
    { const [X, Y] = at(cx + 0.45, cy + 2.25); mouth(g, X, Y, P.mouth, 0.8); if (P.mouth !== 'open' && P.mouth !== 'wavy') g.dot(X + 0.25, Y + 0.55, W); } // (one tiny fang)
    { const [X, Y] = at(cx - 1.9, cy - 2.2); gloss(g, X, Y, 0.95, 0.55, -0.6 + rot); }
    if (P.sweat) sweat(g, cx + 4.6, cy - 4.2, 0.8);
  }

  // Shadow Wisp: a round little flame of shadow with a pointed tip trailing back, a curly fading tail and two little hands
  const WISP_P = {
    idle: { tail: 0 }, walk0: { tail: -1, dy: -0.35 }, walk1: { tail: 1, dy: 0.3 },
    attack: { tail: 0.6, mood: 'brave', mouth: 'o', arm: 1 }, hurt: { tail: -1.2, dx: -0.3, dy: 0.4, mood: 'shut', mouth: 'wavy', sweat: 1 },
  };
  function wisp(g, pose) {
    const P = WISP_P[pose] || {}, dx = P.dx || 0, dy = P.dy || 0, tl = P.tail || 0, cx = 7 + dx, cy = 7.4 + dy;
    piece(g, t => { // the hands (behind)
      t.ell(cx - 4.5, cy + 1.9, 1.15, 0.85, FLAT, 0.6);
      if (P.arm) t.ell(cx + 4.2, cy - 1.0, 0.85, 1.25, FLAT, 0.35); else t.ell(cx + 4.5, cy + 1.7, 1.15, 0.85, FLAT, -0.6);
      vol(t, WISPC, cx, cy, 5, 5);
    });
    piece(g, t => {
      t.ell(cx, cy, 4.7, 4.8, FLAT);
      PX.stroke(t, [[cx + 0.3, cy - 3.6], [cx - 0.8, cy - 4.75], [cx - 1.9, cy - 5.5]], 1.5, 0.32, FLAT);
      PX.stroke(t, [[cx + 0.3, cy + 3.4], [cx - 0.5 + tl * 0.3, cy + 5.4], [cx - 0.9 + tl * 0.7, cy + 6.9], [cx - 0.1 + tl * 1.0, cy + 7.95], [cx + 1.3 + tl * 1.0, cy + 8.05], [cx + 2.0 + tl * 0.8, cy + 7.3]], 2.9, 0.36, FLAT);
      vol(t, WISPC, cx, cy + 0.8, 5, 6.2);
    });
    fade(g, cy + 5.4, cy + 6.8);
    for (const s of [-1, 1]) eye(g, cx + (s < 0 ? -1.35 : 2.15), cy + 0.1, 1.2, 1.6, { side: s, mood: P.mood, halo: HALO(WISPC) });
    cheek(g, cx - 3.0, cy + 2.0, 0.8, 0.42, BLUSH(WISPC[1])); cheek(g, cx + 3.75, cy + 1.95, 0.7, 0.4, BLUSH(WISPC[1]));
    mouth(g, cx + 0.6, cy + 2.55, P.mouth, 0.8);
    gloss(g, cx - 2.4, cy - 2.6, 1.1, 0.6, -0.6);
    if (P.arm) { // a shadow ball forming in its raised hand
      g.ell(cx + 4.6, cy - 3.2, 1.6, 1.6, 'rgba(201,162,240,.45)', 0, fm((x, y) => !g.get(x, y)));
      piece(g, t => t.ell(cx + 4.6, cy - 3.2, 1.05, 1.05, [PLUM[0], PLUM[1], DEEP]));
      g.dot(cx + 4.25, cy - 3.6, W);
    }
    if (P.sweat) sweat(g, cx + 4.3, cy - 4.4, 0.8);
  }

  // Gloom Brute: big, round and tough (soft little horns, stubby fists, a grumpy-cute underbite), with a pale tummy
  const BRUTE_P = {
    idle: {}, walk0: { dy: -0.4, fl: -1.1, al: -0.7, ar: 0.5 }, walk1: { dy: -0.4, fr: -1.1, ar: -0.7, al: 0.5 },
    attack: { dy: 0.5, up: 1, mood: 'brave', mouth: 'open' }, hurt: { dx: -0.4, dy: 0.3, rot: -0.08, mood: 'shut', mouth: 'wavy', sweat: 1, out: 1 },
  };
  function brute(g, pose) {
    const P = BRUTE_P[pose] || {}, dx = P.dx || 0, dy = P.dy || 0, rot = P.rot || 0, cx = 13 + dx, cy = 15.4 + dy, at = (x, y) => turn(x, y, cx, cy, rot);
    piece(g, t => { // horns (behind the head)
      for (const s of [-1, 1]) PX.stroke(t, [at(cx + s * 4.3, cy - 6.4), at(cx + s * 5.3, cy - 8.7), at(cx + s * 5.5, cy - 10.6)], 1.45, 0.62, FLAT);
      vol(t, LILAC, cx - 1, cy - 9.5, 6, 2.5);
    });
    piece(g, t => { t.ell(13 + dx * 0.5 - 4.4, 23.4 + (P.fl || 0), 2.9, 1.6, FLAT); t.ell(13 + dx * 0.5 + 4.6, 23.4 + (P.fr || 0), 2.9, 1.6, FLAT); vol(t, BRUTE, cx, 20, 9, 5); });
    piece(g, t => { t.ell(cx, cy, 9.4, 8.5, FLAT, rot); vol(t, BRUTE, cx, cy, 9.4, 8.5); });
    { const [X, Y] = at(cx + 0.5, cy + 4.5); g.ell(X, Y, 5.6, 3.7, TUMMY, rot, IN(g)); }
    piece(g, t => { // fists
      if (P.up) for (const s of [-1, 1]) { PX.stroke(t, [[cx + s * 7.0, cy - 1.2], [cx + s * 8.5, cy - 5.2], [cx + s * 8.4, cy - 7.8]], 1.75, 1.55, FLAT); t.ell(cx + s * 8.3, cy - 8.7, 2.3, 2.1, FLAT); }
      else if (P.out) { t.ell(cx - 8.5, cy + 3.4, 2.7, 2.1, FLAT, 0.6); t.ell(cx + 9.2, cy + 3.0, 2.7, 2.1, FLAT, -0.6); }
      else { t.ell(cx - 9.0, cy + 1.3 + (P.al || 0), 2.3, 3.0, FLAT, 0.35); t.ell(cx + 9.2, cy + 1.5 + (P.ar || 0), 2.3, 3.0, FLAT, -0.3); }
      vol(t, BRUTE, cx, cy - 1, 11, 9);
    });
    for (const s of [-1, 1]) {
      const [X, Y] = at(cx + (s < 0 ? -2.8 : 3.0), cy - 2.5);
      eye(g, X, Y, 1.75, 2.15, { side: s, mood: P.mood, halo: HALO(BRUTE), brow: false });
      if (P.mood !== 'shut') { const tilt = P.mood === 'brave' ? 0.75 : 0.35; PX.stroke(g, [[X - s * 1.9, Y - 3.0 + tilt], [X + s * 1.5, Y - 3.0 - tilt]], 0.45, 0.4, INK); } // (inner ends lower: grumpy-cute)
    }
    { const [X, Y] = at(cx - 5.5, cy + 0.6), [X2, Y2] = at(cx + 6.0, cy + 0.5); cheek(g, X, Y, 1.25, 0.6, BLUSH(BRUTE[1])); cheek(g, X2, Y2, 1.15, 0.58, BLUSH(BRUTE[1])); }
    const [mx, my] = at(cx + 0.4, cy + 1.6);
    if (P.mouth === 'open') { mouth(g, mx, my, 'open', 1.55); for (const tx of [-0.95, 0.95]) g.poly([[mx + tx - 0.45, my + 1.5], [mx + tx + 0.45, my + 1.5], [mx + tx, my + 0.65]], W); }
    else if (P.mouth === 'wavy') mouth(g, mx, my + 0.3, 'wavy', 1.3);
    else { PX.stroke(g, [[mx - 2.6, my - 0.5], [mx - 1.3, my + 0.35], [mx + 1.3, my + 0.35], [mx + 2.6, my - 0.5]], 0.36, 0.36, INK); for (const tx of [-1.0, 1.0]) g.poly([[mx + tx - 0.42, my + 0.3], [mx + tx + 0.42, my + 0.3], [mx + tx, my - 0.6]], W); }
    { const [X, Y] = at(cx - 5.4, cy - 5.3); gloss(g, X, Y, 1.9, 1.0, -0.6 + rot); }
    if (P.sweat) sweat(g, cx + 9.4, cy - 7.4, 1);
  }

  // the Gloom King: a big Gloomling in a raspberry cape with an ermine trim, a wonky gold crown and a moon sceptre
  const KING_P = {
    idle: {}, walk0: { dx: -0.6, rot: -0.04, b: [-0.7, 0.2, -0.7, 0.2, -0.7], ct: -0.07, sb: -0.6 }, walk1: { dx: 0.6, rot: 0.04, b: [0.2, -0.7, 0.2, -0.7, 0.2], ct: 0.07, sb: 0.5 },
    attack: { up: 1, mood: 'brave', mouth: 'open', ct: 0.05 }, hurt: { dx: -0.8, dy: 0.8, sy: 0.94, rot: -0.06, mood: 'shut', mouth: 'wavy', sweat: 1, knock: 1, sb: 1.2 },
  };
  // the crown: band bottom-middle at (cx, by), tilted by rot, scale s; the right point is bent over (wonky)
  function crown(g, cx, by, rot, s) {
    const P = (u, v) => [cx + (u * Math.cos(rot) - v * Math.sin(rot)) * s, by + (u * Math.sin(rot) + v * Math.cos(rot)) * s];
    const [mx, my] = P(0, -3.6);
    piece(g, t => {
      t.poly([P(-6.6, -2), P(-5.8, -6.2), P(-3.0, -2.6), P(0, -7.6), P(3.0, -2.6), P(4.9, -5.9), P(7.9, -5.1), P(6.6, -2)], FLAT);
      t.poly([P(-7, -3.0), P(7, -3.0), P(7, 0), P(-7, 0)], FLAT);
      each(t, (x, y, v) => (v === FLAT ? soft(GOLD, (x - mx) / (7 * s), (y - my) / (4.5 * s)) : undefined));
      for (let u = -6.6; u <= 6.6; u += 0.2) { const [x, y] = P(u, -2.75); if (t.filled(x, y)) t.dot(x, y, GOLD[0]); } // the band's lit top edge
    });
    piece(g, t => { for (const [u, v] of [[-5.8, -6.4], [0, -7.9], [7.9, -5.3]]) { const [x, y] = P(u, v); t.ell(x, y, 0.8 * s, 0.8 * s, ['#ffffff', GOLD[0], SUN[1]]); } });
    { const [x, y] = P(0, -1.4); if (s >= 0.8) piece(g, t => t.ell(x, y, 1.0 * s, 0.9 * s, [ROSE[0], '#d95763', '#ac3232'])); else g.ell(x, y, 0.8, 0.7, '#d95763'); } // (no ink ring round a gem this small)
    for (const u of [-4.3, 4.3]) { const [x, y] = P(u, -1.4); g.ell(x, y, 0.62 * s, 0.6 * s, [SKY[0], SKY[1], SKY[2]]); }
    { const [x, y] = P(-0.35, -1.75); g.dot(x, y, W); }
  }
  function king(g, pose) {
    const P = KING_P[pose] || {}, dx = P.dx || 0, dy = P.dy || 0, sy = P.sy || 1, rot = P.rot || 0, b = P.b || [0, 0, 0, 0, 0];
    const cx = 22 + dx, cy = 27 + dy, rx = 16, ry = 15 * sy, top = cy - ry, at = (x, y) => turn(x, y, cx, cy, rot);
    piece(g, t => { // the cape and its ermine trim (behind the body)
      const hem = [], x0 = 22 - 19.2, x1 = 22 + 19.2;
      for (let i = 0; i <= 8; i++) { const x = x1 - (x1 - x0) * i / 8; hem.push([x, i % 2 ? 40.6 : 42.1]); }
      t.poly([[22 - 12.6 + dx * 0.5, 16.5 + dy], [22 + 12.6 + dx * 0.5, 16.5 + dy]].concat(hem), FLAT);
      vol(t, RASP, 22, 24, 18, 16);
    });
    piece(g, t => {
      for (const s of [-1, 1]) for (const [u, v, r] of [[14.0, 19.4, 2.6], [12.1, 17.6, 2.3], [15.4, 21.8, 2.2]]) t.ell(22 + s * u + dx * 0.5, v + dy, r, r * 0.86, FLAT);
      vol(t, CREAM, 22, 19, 16, 4);
      for (const [x, y] of [[8.1, 19.6], [10.4, 17.4], [7.0, 22.0], [35.9, 19.6], [33.6, 17.4], [37.0, 22.0]]) if (t.filled(x + dx * 0.5, y + dy)) t.ell(x + dx * 0.5, y + dy, 0.32, 0.55, INK);
    });
    gloomBody(g, { cx, cy, rx, ry, rot, cut: 37.6, bumps: [-9.6, -4.8, 0, 4.8, 9.6].map((u, i) => [22 + u, 38.6 + b[i], i === 0 || i === 4 ? 2.6 : 2.85]), curl: null }, KINGC);
    // the sceptre hand (in front), the sceptre and its moon orb
    const up = !!P.up, sb = P.sb || 0;
    const hand = up ? at(cx + 12.8, cy - 8.4) : at(cx + 14.0, cy + 4.0 + sb), s0 = up ? [hand[0] - 1.4, hand[1] + 4.2] : [hand[0] + 0.9, hand[1] + 5.2], s1 = up ? [hand[0] + 2.4, hand[1] - 10.4] : [hand[0] + 2.0, hand[1] - 10.6];
    piece(g, t => { // the stick: lit on its left side
      PX.stroke(t, [s0, s1], 0.62, 0.55, FLAT);
      const mid = y => s0[0] + (y - s0[1]) * (s1[0] - s0[0]) / (s1[1] - s0[1]);
      each(t, (x, y, v) => (v === FLAT ? (x < mid(y) - 0.1 ? GOLD[0] : GOLD[1]) : undefined));
    });
    const ob = [s1[0] + 0.15, s1[1] - 2.0];
    if (up) for (const [a, r] of [[0.3, 3.9], [2.2, 4.3], [4.1, 3.7], [5.4, 4.4]]) tw(g, ob[0] + Math.cos(a) * r, ob[1] + Math.sin(a) * r, LILAC[0]);
    piece(g, t => { t.ell(ob[0], ob[1], 2.35, 2.35, [PLUM[0], PLUM[1], DEEP]); t.ell(ob[0] + 0.7, ob[1] - 0.5, 1.45, 1.45, GOLD, 0, fm((x, y) => !inE(x + 0.25, y + 0.25, ob[0] + 1.45, ob[1] - 1.05, 1.35, 1.35))); });
    g.dots([[ob[0] - 1.1, ob[1] - 1.0], [ob[0] - 0.6, ob[1] - 1.5]], W);
    piece(g, t => { t.ell(hand[0], hand[1], 2.0, 1.8, FLAT); vol(t, KINGC, cx, cy, rx, ry); });
    piece(g, t => { const h2 = at(cx - 14.6, cy + 4.6); t.ell(h2[0], h2[1], 1.9, 1.7, FLAT); vol(t, KINGC, cx, cy, rx, ry); });
    // the face
    for (const s of [-1, 1]) {
      const [X, Y] = at(cx + (s < 0 ? -4.9 : 4.9), cy - 2.4);
      eye(g, X, Y, 2.75, 3.25, { side: s, mood: P.mood, halo: HALO(KINGC), brow: false });
      if (P.mood !== 'shut') { const tilt = P.mood === 'brave' ? 0.75 : 0.2; PX.stroke(g, [[X - s * 2.6, Y - 4.0 + tilt], [X + s * 1.9, Y - 4.1 - tilt]], 0.44, 0.38, INK); }
    }
    { const [X, Y] = at(cx - 9.2, cy + 2.6), [X2, Y2] = at(cx + 9.4, cy + 2.6); cheek(g, X, Y, 1.9, 0.9, BLUSH(KINGC[1])); cheek(g, X2, Y2, 1.9, 0.9, BLUSH(KINGC[1])); }
    { const [X, Y] = at(cx + 0.3, cy + 4.0); mouth(g, X, Y, P.mouth || 'grin', P.mouth === 'open' ? 1.5 : 1.6); }
    { const [X, Y] = at(cx - 8.0, cy - 8.4); gloss(g, X, Y, 2.6, 1.3, -0.6 + rot); }
    // the wonky crown, a little too small for him; knocked further askew when he is hurt
    { const [X, Y] = at(cx + 0.8, top + 1.6); if (P.knock) crown(g, X - 2.4, Y - 1.2, -0.5, 1.0); else crown(g, X, Y, -0.17 + (P.ct || 0), 1.0); }
    if (P.sweat) sweat(g, cx + 12.2, top + 5.2, 1.3);
  }
  const UNIT_DRAW = { blob, bat, wisp, brute, king };

  // ---------------- the Moon Owl ----------------
  const OWL_WING = { // the right wing (the left is its mirror): shoulder ... tip ... feather tips back to the body
    fly0: [[19.2, 9.6], [22.6, 5.2], [26.4, 2.2], [28.8, 1.3], [28.0, 4.9], [26.4, 4.5], [25.4, 7.5], [23.6, 7.1], [22.6, 10.4], [20.6, 13.0]],
    fly1: [[19.6, 9.6], [23.6, 10.2], [27.0, 12.4], [29.0, 15.6], [26.8, 15.2], [26.6, 18.0], [24.6, 16.4], [23.4, 19.0], [21.6, 16.4], [19.8, 15.8]],
  };
  function owl(g, pose) {
    const Wg = OWL_WING[pose] || OWL_WING.fly0, down = pose === 'fly1', cx = 15, cy = 12.8 + (down ? -0.4 : 0.3);
    for (const s of [-1, 1]) {
      const pts = Wg.map(([x, y]) => [15 + s * (x - 15), y + (down ? -0.4 : 0.3)]);
      piece(g, t => {
        t.poly(pts, FLAT); vol(t, PERI, 15 + s * 7, 8, 7, 6);
        const sh = pts[0], lt = mix(PERI[0], W, 0.4);
        for (const i of [3, 5, 7]) { const n = 16; for (let j = 4; j < n; j++) { const x = sh[0] + (pts[i][0] - sh[0]) * j / n, y = sh[1] + (pts[i][1] - sh[1]) * j / n; if (t.filled(x, y)) t.dot(x, y, lt); } }
      });
    }
    piece(g, t => { for (const s of [-1, 1]) t.poly([[cx + s * 3.0, cy - 5.4], [cx + s * 4.7, cy - 8.8], [cx + s * 5.4, cy - 4.4]], FLAT); vol(t, OWL, cx, cy - 6, 5, 3); });
    piece(g, t => { t.ell(cx, cy, 6.0, 6.5, FLAT); vol(t, OWL, cx, cy, 6.0, 6.5); });
    piece(g, t => { t.ell(cx - 1.95, cy - 1.7, 2.55, 2.45, CREAM); t.ell(cx + 2.15, cy - 1.7, 2.55, 2.45, CREAM); }, mix(PERI[1], PERI[2], 0.5));
    for (const s of [-1, 1]) eye(g, cx + (s < 0 ? -1.95 : 2.15), cy - 1.7, 1.6, 1.65, { side: s, halo: mix(CREAM[1], SUN[1], 0.35), look: 0.16, pupil: 0.48 });
    piece(g, t => t.poly([[cx - 0.55, cy - 0.2], [cx + 0.85, cy - 0.2], [cx + 0.2, cy + 1.55]], CLAY[1]));
    // a golden crescent moon on its chest, and a few soft breast feathers
    g.ell(cx + 0.1, cy + 3.3, 1.65, 1.65, GOLD, 0, fm((x, y) => !inE(x + 0.25, y + 0.25, cx + 0.95, cy + 2.6, 1.45, 1.45)));
    for (const [x, y] of [[cx - 3.2, cy + 2.4], [cx - 2.4, cy + 4.6], [cx + 3.1, cy + 2.6], [cx + 2.4, cy + 4.8], [cx - 0.4, cy + 5.6]]) g.dots([[x - 0.25, y], [x + 0.25, y + 0.25]], OWL[2]);
    piece(g, t => { for (const s of [-1, 1]) t.ell(cx + s * 1.7, cy + 6.6, 0.9, 0.75, CLAY); });
    gloss(g, cx - 3.4, cy - 4.2, 1.3, 0.7, -0.6);
  }

  // ---------------- effects ----------------
  const SMOKE = [mix(LILAC[0], LILAC[1], 0.5), mix(LILAC[1], GLOOM[0], 0.5), GLOOM[1]];
  function poof(g, f) { // 0: a round shadow puff with the first sparkles; 1: breaking up; 2: only sparkles and wisps left
    const puffs = [[[6.4, 9.6, 3.6], [11.6, 7.4, 4.2], [10.6, 11.4, 3.3], [14.8, 10.8, 2.8], [4.6, 12.4, 2.4]], [[5.2, 10.6, 2.6], [11.8, 6.8, 2.9], [15.6, 11.2, 2.1], [9.4, 12.4, 1.8]], [[4.6, 7.6, 1.2], [16.0, 6.4, 1.0], [11.2, 13.0, 1.1]]][f];
    piece(g, t => {
      for (const [x, y, r] of puffs) t.ell(x, y, r, r * 0.92, FLAT);
      vol(t, SMOKE, 10, 9, 8, 6);
      if (f < 2) for (const [x, y, r] of puffs) if (r > 2) t.ell(x - r * 0.32, y - r * 0.38, r * 0.34, r * 0.24, mix(SMOKE[0], W, 0.3), 0, fm((X, Y) => t.get(X, Y) !== null));
    }, GLOOM[2]);
    const st = [[[3.2, 4.0, 1.7], [16.8, 3.6, 1.4], [17.2, 13.4, 1.1]], [[3.4, 3.6, 2.0], [17.0, 3.0, 1.8], [9.0, 2.6, 1.3], [17.6, 13.6, 1.4], [2.8, 14.0, 1.1]], [[4.6, 3.4, 2.2], [15.4, 2.6, 2.0], [10.2, 8.4, 2.4], [17.2, 12.0, 1.5], [3.6, 12.8, 1.6], [9.4, 14.4, 1.0]]][f];
    for (const [x, y, r] of st) piece(g, t => { t.poly(PX.starPts(x, y, r, r * 0.42, 4), SUN[0]); t.ell(x, y, r * 0.32, r * 0.32, W); }, SUN[2]);
    for (const [x, y] of [[8.4, 1.8], [1.6, 8.6], [18.6, 8.0], [13.6, 14.8]].slice(0, f + 2)) tw(g, x, y, '#fff6b0');
  }
  function portal(g, f) { // seen from a little above: a glowing rim round a deep swirl (frame 1 = the swirl a sixth of a turn on)
    const cx = 16, cy = 7, rx = 14.6, ry = 5.5;
    each(g, (x, y) => { const d = Math.hypot((x - cx) / (rx + 1.2), (y - cy) / (ry + 1.0)); return d <= 1 && d > 0.9 ? 'rgba(201,162,240,.38)' : undefined; });
    each(g, (x, y) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = Math.hypot(nx, ny); if (d > 1) return;
      if (d > 0.84) return ny < -0.2 ? mix(LILAC[0], PLUM[0], 0.5) : ny < 0.45 ? PLUM[0] : PLUM[1];
      if (d > 0.76) return ny < 0 ? PLUM[1] : PLUM[2];
      const a = Math.atan2(ny, nx) + d * 5.2 - f * Math.PI / 3, arm = ((a % (Math.PI * 2 / 3)) + Math.PI * 2) % (Math.PI * 2 / 3);
      return d < 0.16 ? INK : arm < 0.75 ? (d < 0.5 ? GLOOM[1] : mix(GLOOM[1], PLUM[1], 0.5)) : d < 0.45 ? mix(NIGHT[2], INK, 0.5) : DEEP;
    });
    each(g, (x, y, v, fx, fy) => (v && v[0] === '#' && y > cy && !String(g.fget(fx, fy + 1) || '').startsWith('#') ? INK : undefined)); // a dark lip at the front edge
    for (const [a, s] of [[0.5, 0], [2.2, 1], [3.6, 0], [5.0, 1], [1.3, 1], [4.3, 0]]) if ((s + f) % 2 === 0) tw(g, cx + Math.cos(a) * (rx + 0.4), cy + Math.sin(a) * (ry + 0.4) - 0.5, LILAC[0]);
  }
  function ko(g, f) { // three little stars on a tilted ring (frame 1 = half a step further round)
    const cx = 10, cy = 5;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + f * Math.PI / 3 + 0.5, x = cx + Math.cos(a) * 6.6, y = cy + Math.sin(a) * 1.9, r = 2.15 + Math.sin(a) * 0.35;
      piece(g, t => { t.poly(PX.starPts(x, y, r, r * 0.45, 5), SUN[0]); each(t, (X, Y, v) => (v ? soft(['#fffbd0', SUN[0], SUN[1]], (X - x) / r, (Y - y) / r) : undefined)); }, SUN[2]);
      g.dot(x - 0.25, y - 0.25, W);
      const b = a + 1.05; g.dot(cx + Math.cos(b) * 6.6, cy + Math.sin(b) * 1.9, '#fff6b0');
    }
  }
  function shadowball(g) {
    each(g, (x, y) => { const d = Math.hypot(x - 5, y - 5); return d <= 4.6 && d > 3.4 ? (d > 4.1 ? 'rgba(201,162,240,.28)' : 'rgba(201,162,240,.5)') : undefined; });
    piece(g, t => {
      t.ell(5, 5, 3.0, 3.0, [PLUM[1], GLOOM[1], DEEP]);
      for (let a = 0; a < 4.2; a += 0.12) t.dot(5 + Math.cos(a + 0.6) * (0.4 + a * 0.45), 5 + Math.sin(a + 0.6) * (0.4 + a * 0.45), LILAC[1]); // a swirl inside
    });
    g.dots([[3.6, 3.4], [4.1, 3.4], [3.6, 3.9]], W);
  }
  // a Sprout's shot for each element (flying right, middle = the canvas middle)
  const SHOT = {
    leaf: g => { piece(g, t => { t.ell(4.6, 3.5, 3.9, 1.9, LEAF, -0.35); PX.stroke(t, [[0.9, 5.2], [1.6, 4.4]], 0.32, 0.28, LEAF[2]); }); for (let x = 1.6; x < 7.6; x += 0.25) { const y = 4.2 - (x - 1.6) * 0.38; if (g.filled(x, y)) g.dot(x, y, LEAF[2]); } g.dots([[3.2, 2.6], [3.7, 2.4]], '#e2ffb8'); },
    water: g => { piece(g, t => { t.ell(5.4, 3.5, 2.6, 2.5, ['#e4f6ff', SKY[0], SKY[1]]); t.poly([[0.8, 3.5], [4.8, 1.2], [4.8, 5.8]], SKY[0]); each(t, (x, y, v) => (v ? soft(['#e4f6ff', SKY[0], SKY[1]], (x - 4.6) / 3.6, (y - 3.5) / 2.6) : undefined)); }, SKY[2]); g.dots([[5.0, 2.2], [5.5, 2.2], [5.0, 2.7]], W); },
    fire: g => {
      piece(g, t => {
        t.ell(7.3, 3.5, 2.6, 2.5, FLAT);
        for (const [y0, y1, x1] of [[1.4, 1.3, 1.0], [2.6, 3.6, 0.6], [4.4, 5.6, 1.4]]) t.poly([[6.4, y0], [x1 + 2.4, (y0 + y1) / 2 - 0.5], [x1, y1], [x1 + 2.6, (y0 + y1) / 2 + 0.6], [6.6, y0 + 1.6]], FLAT);
        each(t, (x, y, v) => { if (!v) return; const d = Math.hypot((x - 7.6) / 3.2, (y - 3.4) / 2.3); return d < 0.45 ? '#fffbd0' : d < 0.8 ? '#fbf236' : d < 1.3 ? '#ff9a3a' : CLAY[1]; });
      }, '#ac3232');
      g.dots([[7.0, 2.6], [7.5, 2.6]], W);
    },
    stone: g => { piece(g, t => { t.ell(3.5, 3.6, 2.7, 2.5, SLATE); t.ell(4.4, 4.4, 1.2, 1.0, mix(SLATE[1], SAND[1], 0.5), 0, IN(t)); }); g.dots([[2.3, 2.4], [2.8, 2.2]], W); g.dot(4.6, 2.8, SLATE[2]); },
    sky: g => {
      piece(g, t => { PX.stroke(t, [[1.2, 1.4], [4.6, 1.5], [7.2, 2.6], [8.0, 4.2], [7.2, 5.8], [5.6, 6.4]], 0.62, 0.42, '#f4fbff'); PX.stroke(t, [[0.8, 4.2], [3.4, 4.0], [5.0, 4.6]], 0.5, 0.38, CLOUD[1]); }, SKY[1]);
      g.dot(7.0, 3.4, SKY[0]);
    },
    shadow: g => {
      each(g, (x, y) => { const d = Math.hypot(x - 4, y - 4); return d <= 3.9 && d > 3.1 ? 'rgba(201,162,240,.35)' : undefined; });
      piece(g, t => t.ell(4, 4, 2.9, 2.9, [PLUM[0], PLUM[1], DEEP], 0, fm((x, y) => !inE(x + 0.25, y + 0.25, 2.6, 3.3, 2.3, 2.3))));
      g.dot(5.6, 2.8, W); g.dot(6.1, 4.2, LILAC[0]);
    },
    light: g => { piece(g, t => { t.poly(PX.starPts(4.5, 4.6, 4.1, 1.7, 4), FLAT); each(t, (x, y, v) => (v ? soft(['#fffbd0', SUN[0], SUN[1]], (x - 4.5) / 3, (y - 4.6) / 3) : undefined)); }, SUN[2]); g.ell(4.5, 4.6, 0.8, 0.8, W); },
    sweet: g => {
      piece(g, t => { for (const s of [-1, 1]) t.poly([[5.5 + s * 2.4, 3.5], [5.5 + s * 4.8, 1.4], [5.5 + s * 4.3, 3.5], [5.5 + s * 4.8, 5.6]], ROSE[0]); each(t, (x, y, v) => (v ? (x < 3 || x > 8 ? ROSE[1] : ROSE[0]) : undefined)); });
      piece(g, t => t.ell(5.5, 3.5, 2.7, 2.4, BGUM));
      for (let a = 0; a < 5.5; a += 0.2) { const r = 0.3 + a * 0.33; g.dot(5.5 + Math.cos(a) * r, 3.5 + Math.sin(a) * r * 0.9, W); }
    },
    normal: g => { piece(g, t => { t.poly(PX.starPts(4, 4.2, 3.6, 2.2, 6), FLAT); each(t, (x, y, v) => (v ? soft(['#ffffff', '#f4f6fa', SLATE[0]], (x - 4) / 3, (y - 4) / 3) : undefined)); }, SLATE[2]); g.dots([[2.9, 3.0], [3.4, 2.8]], W); },
  };
  const SHOT_WH = { leaf: [9, 7], water: [9, 7], fire: [11, 7], stone: [7, 7], sky: [9, 8], shadow: [8, 8], light: [9, 9], sweet: [11, 7], normal: [8, 8] };
  function shotOther(g, col) { // an element added later: a round shot in its own colour
    const c = /^#[0-9a-f]{6}$/i.test(col || '') ? col : '#8c93a8';
    piece(g, t => t.ell(4, 4, 2.9, 2.9, [mix(c, W, 0.5), c, mix(c, INK, 0.35)]));
    g.dots([[2.9, 2.8], [3.4, 2.6]], W);
  }

  // ---------------- icons (16 x 16) ----------------
  const ICON = {
    raid: g => gloomling(g, {}, { cx: 8, cy: 9.6, rx: 6.5, ry: 6.5, by: 11.7, sp: 3.95, br: 2.0, front: true }),
    king: g => {
      piece(g, t => { t.ell(8, 12.2, 6.9, 6.4, FLAT, 0, fm((x, y) => y <= 14.6)); vol(t, KINGC, 8, 12.2, 6.9, 6.4); });
      for (const s of [-1, 1]) eye(g, 8 + s * 2.45, 11.3, 1.55, 1.85, { side: s, halo: HALO(KINGC), look: 0.05 });
      cheek(g, 3.3, 13.3, 0.85, 0.42, BLUSH(KINGC[1])); cheek(g, 12.7, 13.3, 0.85, 0.42, BLUSH(KINGC[1]));
      gloss(g, 3.9, 8.6, 1.1, 0.6, -0.6);
      crown(g, 8.4, 7.1, -0.16, 0.62);
    },
    moon: g => {
      piece(g, t => t.ell(7.2, 8.4, 5.9, 5.9, ['#fffbe0', SUN[0], SUN[1]], 0, fm((x, y) => !inE(x + 0.25, y + 0.25, 10.2, 6.3, 4.9, 4.9))));
      for (const [x, y, r] of [[4.2, 10.0, 0.9], [6.4, 12.4, 0.6], [3.2, 7.0, 0.5]]) g.ell(x, y, r, r * 0.85, mix(SUN[0], SUN[1], 0.5), 0, IN(g));
      g.dots([[2.4, 6.2], [2.4, 6.7], [2.9, 5.2]], W);
      piece(g, t => t.poly(PX.starPts(12.6, 11.8, 2.2, 0.9, 4), '#fff6b0'), SUN[2]);
      tw(g, 13.4, 3.0, '#fff6b0');
    },
  };

  // ---------------- cache + API ----------------
  const cache = new Map(), CAP = 120; // (a fixed set of keys: the cap is only a safety net)
  function mk(key, w, h, fn, o) {
    if (cache.has(key)) return cache.get(key);
    let c = null;
    try { if (PX.Grid) { const g = grid(w, h); fn(g); c = done(g, o).canvas(); } } catch (e) { console.error('PX.raid', key, e); c = null; }
    if (cache.size >= CAP) cache.clear();
    cache.set(key, c); return c;
  }
  const elements = () => { try { const E = window.PSDATA && window.PSDATA.ELEMENTS; return E && typeof E === 'object' ? E : null; } catch (e) { return null; } };
  const FX = ['poof', 'poof1', 'poof2', 'portal0', 'portal1', 'ko', 'ko1', 'shadowball'];
  PX.raid = {
    UNITS, KINDS, POSES, FX, OWL: ['fly0', 'fly1'], ICONS: Object.keys(ICON),
    unit(kind, pose) {
      kind = UNIT_DRAW[kind] ? kind : 'blob'; pose = POSES.indexOf(pose) >= 0 ? pose : 'idle';
      const U = UNITS[kind];
      return mk('u:' + kind + ':' + pose, U.w, U.h, g => UNIT_DRAW[kind](g, pose));
    },
    fx(kind) {
      kind = String(kind || '');
      if (kind.slice(0, 5) === 'shot:') {
        const E = elements() || {}, el = kind.slice(5), known = SHOT[el] ? el : E[el] ? el : 'normal', wh = SHOT_WH[known] || [8, 8];
        return mk('shot:' + known, wh[0], wh[1], g => (SHOT[known] ? SHOT[known](g) : shotOther(g, E[known] && E[known].color)));
      }
      if (kind === 'poof' || kind === 'poof1' || kind === 'poof2') return mk('fx:' + kind, 20, 16, g => poof(g, kind === 'poof' ? 0 : +kind.slice(4)), { outer: false });
      if (kind === 'portal0' || kind === 'portal1') return mk('fx:' + kind, 32, 14, g => portal(g, kind === 'portal1' ? 1 : 0), { outer: false, thin: false });
      if (kind === 'ko' || kind === 'ko1') return mk('fx:' + kind, 20, 10, g => ko(g, kind === 'ko1' ? 1 : 0), { outer: false });
      if (kind === 'shadowball') return mk('fx:shadowball', 10, 10, shadowball);
      return null;
    },
    owl(pose) { pose = pose === 'fly1' ? 'fly1' : 'fly0'; return mk('owl:' + pose, 30, 22, g => owl(g, pose)); },
    icon(kind) { kind = ICON[kind] ? kind : 'raid'; return mk('icon:' + kind, 16, 16, ICON[kind]); },
    // the shot ids for the elements loaded now (data.js loads after this file, so this is asked at call time)
    shots() { return Object.keys(elements() || SHOT).map(el => 'shot:' + el); },
  };
})();
