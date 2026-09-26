// pixel.js — shared pixel-art engine for the Sprig Hollow prototypes.
// Sprites are built from shapes on a small grid, auto-outlined in ink, and cached as tiny canvases.
// Style matches the "My Inventory" app: DawnBringer-32 colours, 1px #222034 outline, 3-tone shading.
(function () {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const INK = '#222034';

  const PAL = {
    k: '#222034', w: '#ffffff', W: '#cbdbfc', l: '#9badb7', D: '#847e87', g: '#696a6a', G: '#595652', x: '#323c39',
    d: '#45283c', n: '#663931', b: '#8f563b', o: '#df7126', t: '#d9a066', s: '#eec39a', y: '#fbf236', L: '#99e550',
    e: '#6abe30', E: '#37946e', f: '#4b692f', v: '#524b24', h: '#8f974a', H: '#8a6f30', i: '#3f3f74', c: '#306082',
    B: '#5b6ee1', u: '#639bff', a: '#5fcde4', p: '#76428a', r: '#ac3232', R: '#d95763', m: '#d77bba',
  };
  // [light, mid, dark]
  const RAMPS = {
    leaf: ['#99e550', '#6abe30', '#37946e'],
    mint: ['#a6f2d3', '#52c7a8', '#2f8078'],
    sky: ['#9fd8ff', '#639bff', '#3f55b8'],
    peach: ['#f6d2ad', '#e0a672', '#a8653a'],
    rose: ['#f7b6c8', '#e07ba0', '#a2477a'],
    sun: ['#fff27a', '#f6c83a', '#c7861c'],
    berry: ['#f07a84', '#d24552', '#8a2433'],
    plum: ['#c9a2f0', '#9a6ad0', '#5e3a8e'],
    cloud: ['#ffffff', '#dfe8fb', '#9badb7'],
    slate: ['#b7c2cc', '#8c93a8', '#595a70'],
    night: ['#7d8cf0', '#4a4aa0', '#2c2c66'],
    clay: ['#f5a86a', '#df7126', '#96461c'],
    moss: ['#c3d66a', '#8f974a', '#4b692f'],
    cocoa: ['#c48a5c', '#8f563b', '#5a3322'],
    lilac: ['#f0e2ff', '#c8aaf0', '#8c6cc4'],
    teal: ['#7ee4d4', '#2aa8a0', '#1a6670'],
    coral: ['#ffc4ac', '#f7806a', '#c04a4c'],
    lemon: ['#fffcd0', '#f6ee6a', '#bcb030'],
    lime: ['#e2ff96', '#aee034', '#62961c'],
    ocean: ['#6ea4ec', '#2e5cb4', '#1c3272'],
    cherry: ['#ff8080', '#e42a2e', '#901630'],
    cream: ['#fffdf2', '#f6e8c6', '#ccb28a'],
    charcoal: ['#80808e', '#4e4e5c', '#33333f'],
    tangerine: ['#ffd488', '#ff9a22', '#c45c0c'],
    bubblegum: ['#ffd4f2', '#ff86d2', '#c4489a'],
    aqua: ['#ccfcff', '#5ee2f2', '#2896b8'],
  };
  const BELLY = '#fbf3dc';

  // ---------------- Grid raster ----------------
  function inEll(px, py, cx, cy, rx, ry, rot) {
    let dx = px - cx, dy = py - cy;
    if (rot) { const c = Math.cos(-rot), s = Math.sin(-rot); const x = dx * c - dy * s, y = dx * s + dy * c; dx = x; dy = y; }
    return { in: (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1, nx: dx / rx, ny: dy / ry };
  }
  function shadeOf(ramp, nx, ny) { const d = nx * 0.55 + ny * 0.85; return d < -0.42 ? ramp[0] : d > 0.55 ? ramp[2] : ramp[1]; }
  // Same 3-tone shading, but with a 1px checker dither where two tones meet (only on shapes big enough to carry it).
  function shadeDith(ramp, nx, ny, x, y, w) {
    const d = nx * 0.55 + ny * 0.85, odd = (x + y) & 1;
    if (Math.abs(d + 0.42) < w) return odd ? ramp[0] : ramp[1];
    if (Math.abs(d - 0.55) < w) return odd ? ramp[1] : ramp[2];
    return d < -0.42 ? ramp[0] : d > 0.55 ? ramp[2] : ramp[1];
  }
  const specCache = new Map();
  const specOf = c => { let s = specCache.get(c); if (!s) { s = mixHex(c, '#ffffff', 0.6); specCache.set(c, s); } return s; };
  class Grid {
    // dither: soften tone steps on big ramp ellipses. spec: add a small glossy highlight to big ramp ellipses (opt-in).
    constructor(w, h) { this.w = w; this.h = h; this.a = new Array(w * h).fill(null); this.dither = true; this.spec = false; }
    get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.a[y * this.w + x]; }
    set(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.a[y * this.w + x] = c; }
    ell(cx, cy, rx, ry, col, rot, mask) {
      const r = Math.max(rx, ry) + 1, ramp = Array.isArray(col), mn = Math.min(rx, ry);
      const dw = ramp && this.dither && mn >= 3.2 ? Math.min(0.1, 0.55 / mn) : 0;
      const sp = ramp && this.spec && mn >= 2.6 && col[0][0] === '#' && col !== SKIN_SENT ? specOf(col[0]) : null, sr = sp ? Math.max(0.12, 0.75 / mn) : 0;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const q = inEll(x + 0.5, y + 0.5, cx, cy, rx, ry, rot);
        if (!q.in) continue;
        if (mask && !mask(x, y)) continue;
        if (!ramp) { this.set(x, y, col); continue; }
        if (sp && Math.hypot(q.nx + 0.42, q.ny + 0.5) < sr) { this.set(x, y, sp); continue; }
        this.set(x, y, dw ? shadeDith(col, q.nx, q.ny, x, y, dw) : shadeOf(col, q.nx, q.ny));
      }
      return this;
    }
    rect(x, y, w, h, col) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, col); return this; }
    poly(pts, col) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5, py = y + 0.5; let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, col);
      }
      return this;
    }
    px(list, col) { for (const [x, y] of list) this.set(x, y, col); return this; }
    str(rows, x0, y0, map) { rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.') continue; this.set(x0 + x, y0 + y, (map && map[ch]) || PAL[ch] || ch); } }); return this; }
    outline(col) {
      col = col || INK; const add = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
      for (const [x, y] of add) this.set(x, y, col);
      return this;
    }
    merge(o) { for (let i = 0; i < this.a.length; i++) if (o.a[i] !== null) this.a[i] = o.a[i]; return this; }
    filled(x, y) { const c = this.get(x, y); return c !== null && c !== INK; }
    canvas() {
      const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
      const x = c.getContext('2d');
      for (let y = 0; y < this.h; y++) for (let i = 0; i < this.w; i++) { const col = this.a[y * this.w + i]; if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } }
      return c;
    }
  }
  function fromStrings(rows, map) { const g = new Grid(rows[0].length, rows.length); g.str(rows, 0, 0, map); return g; }

  // ---------------- Shape helpers ----------------
  // thick line through points; radius eases r0 -> r1 along the path
  function stroke(g, pts, r0, r1, col) {
    let len = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); len += d; }
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = seg[i - 1], n = Math.max(1, Math.ceil(d / 0.3));
      for (let s = 0; s <= n; s++) { const t = s / n, r = r0 + (r1 - r0) * ((acc + d * t) / (len || 1)); g.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, col); }
      acc += d;
    }
    return g;
  }
  // 1px line (Bresenham), no outline intended
  function line(g, x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { g.set(x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return g;
  }
  function starPts(cx, cy, ro, ri, n, rot) { const p = []; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = (rot || -Math.PI / 2) + i * Math.PI / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
  const mirX = (pts, W) => pts.map(([x, y]) => [W - x, y]);
  // draw a shape on its own, ink-outline it, then lay it over G (gives separation lines between overlapping pieces)
  function piece(G, draw) { const t = new Grid(G.w, G.h); draw(t); t.outline(); G.merge(t); return G; }
  const inside = g => (x, y) => g.filled(x, y);
  // recolour every filled (non-ink) pixel inside an ellipse with ramp shading — gives 3-tone to poly shapes
  function shade(g, cx, cy, rx, ry, ramp, rot) { return g.ell(cx, cy, rx, ry, ramp, rot || 0, inside(g)); }
  // copy b under a (only where a is empty); returns set of indices that came from b
  function under(a, b) { const s = new Set(); for (let i = 0; i < a.a.length; i++) if (a.a[i] === null && b.a[i] !== null) { a.a[i] = b.a[i]; s.add(i); } return s; }
  const RAMP_X = {
    cream: ['#fffbf0', '#f4e6c8', '#c8b08a'],
    crab: ['#ff9a7a', '#e8543a', '#a02c2a'],
    gold: ['#fffbd0', '#f6c83a', '#b87818'],
    glowY: ['#fffbd0', '#fbf236', '#c8b020'],
    bark: ['#c48a5c', '#8f563b', '#5a3322'],
  };
  // gumball colours (red, orange, yellow, green, aqua, blue, purple, pink) as [light, mid, dark]
  const GUM = [
    ['#ffb0b0', '#ec3a48', '#9a1c30'], ['#ffd098', '#ff8e1e', '#bc5410'], ['#fffab0', '#fcd82c', '#c49c14'], ['#c8f494', '#5cc83a', '#2c8434'],
    ['#b4f6ff', '#34cce2', '#1a84a4'], ['#b4ccff', '#4a78f0', '#2a44ac'], ['#e4c4ff', '#a45ee2', '#6a34a6'], ['#ffd0f0', '#ff6cc0', '#bc3888'],
  ];

  // ---------------- Flowers (shared by bloom crowns and flower icons; art fits within ±5 of centre) ----------------
  const FLO = {
    sunflower(g, x, y) {
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; g.ell(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2, 1.25, RAMPS.sun, a); }
      g.ell(x, y, 2.3, 2.3, RAMP_X.bark);
    },
    sunflowerD(g, x, y) { g.px([[x - 1, y - 1], [x + 1, y], [x - 1, y + 1], [x, y - 2 + 1]].filter(([a, b]) => g.filled(a, b)), '#c48a5c'); g.set(x - 1, y - 2, '#fff27a'); },
    bluebell(g, x, y) {
      const S = '#37946e', BR = ['#c0ccff', '#6b82e8', '#3f45a8'];
      g.ell(x - 1.8, y + 3.8, 1.8, 0.8, RAMPS.leaf, 0.5); g.ell(x + 1.8, y + 3.8, 1.8, 0.8, RAMPS.leaf, -0.5);
      stroke(g, [[x, y + 5], [x, y - 1]], 0.6, 0.6, S);
      stroke(g, [[x, y], [x - 2.6, y - 1.4]], 0.5, 0.5, S); stroke(g, [[x, y], [x + 2.6, y - 1.4]], 0.5, 0.5, S);
      const bell = (bx, by) => { g.ell(bx, by, 1.8, 1.9, BR); g.poly([[bx - 1.8, by + 0.4], [bx + 1.8, by + 0.4], [bx + 2.2, by + 2.3], [bx - 2.2, by + 2.3]], BR[1]); };
      bell(x - 2.8, y + 0.2); bell(x + 2.8, y + 0.2); bell(x, y - 3.2);
    },
    bluebellD(g, x, y) {
      for (const [bx, by] of [[x - 3, y + 2], [x + 2, y + 2], [x - 1, y - 1]]) { g.px([[bx, by], [bx + 1, by]].filter(([a, b]) => g.filled(a, b)), '#3f45a8'); g.px([[bx - 1, by], [bx + 2, by]].filter(([a, b]) => g.filled(a, b)), '#c0ccff'); }
      g.px([[x - 4, y - 1], [x + 1, y - 1], [x - 2, y - 4]].filter(([a, b]) => g.filled(a, b)), '#eef2ff');
    },
    daisy(g, x, y) {
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.ell(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2, 0.95, ['#ffffff', '#f4f4fb', '#b8c0d8'], a); }
      g.ell(x, y, 1.7, 1.7, RAMPS.sun);
    },
    daisyD(g, x, y) { for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 6, px = Math.floor(x + Math.cos(a) * 3.9), py = Math.floor(y + Math.sin(a) * 3.9); if (g.filled(px, py) && g.get(px, py) !== '#f6c83a') g.set(px, py, '#cbd3e8'); } },
    hibiscus(g, x, y) {
      const HR = ['#ffb0bc', '#ec4c64', '#a0223a'];
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.ell(x + Math.cos(a) * 2.3, y + Math.sin(a) * 2.3, 2.55, 2.4, HR); }
      g.ell(x, y, 1.3, 1.3, '#8a2433');
    },
    hibiscusD(g, x, y) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; for (const r of [1.6, 2.6]) { const px = Math.floor(x + Math.cos(a) * r), py = Math.floor(y + Math.sin(a) * r); if (g.filled(px, py)) g.set(px, py, '#c02a4a'); } }
      g.px([[x, y - 1], [x + 1, y - 2], [x + 2, y - 3]], '#fbf3dc'); g.px([[x + 2, y - 4], [x + 3, y - 3]], '#fbf236');
    },
    sealily(g, x, y) {
      const AQ = ['#d8fff8', '#8ee0d8', '#4a9aa8'], WH = ['#ffffff', '#eafcff', '#a8d8e0'];
      g.ell(x, y + 3.7, 4.6, 1.1, ['#6abe30', '#37946e', '#2f6048']);
      const pet = (ang, R) => { const a = ang * Math.PI / 180; g.ell(x + Math.cos(a) * 2.4, y + 2.3 + Math.sin(a) * 2.4, 2.6, 1.3, R, a); };
      pet(-165, AQ); pet(-15, AQ); pet(-128, WH); pet(-52, WH); pet(-90, WH);
    },
    sealilyD(g, x, y) { g.px([[x, y - 2], [x - 4, y + 1], [x + 3, y + 1]].filter(([a, b]) => g.filled(a, b)), '#5fcde4'); g.set(x - 1, y + 2, '#fbf236'); g.set(x, y + 2, '#fbf236'); },
    beachrose(g, x, y) {
      g.ell(x - 3.4, y + 3, 2.1, 1, RAMPS.leaf, 0.5); g.ell(x + 3.4, y + 3, 2.1, 1, RAMPS.leaf, -0.5);
      g.ell(x, y, 4.1, 3.7, ['#ffc4b0', '#f47e68', '#b8483e']);
    },
    beachroseD(g, x, y) {
      g.px([[x, y - 1], [x - 1, y - 1], [x - 2, y], [x - 2, y + 1], [x - 1, y + 2], [x, y + 2], [x + 1, y + 2], [x + 2, y + 1], [x + 2, y], [x + 2, y - 1], [x + 1, y - 2], [x, y - 3], [x - 1, y - 3], [x - 2, y - 3]].filter(([a, b]) => g.filled(a, b)), '#c4524a');
      g.px([[x, y], [x + 1, y]], '#ffd8c8'); g.px([[x - 3, y - 2], [x - 3, y - 1]].filter(([a, b]) => g.filled(a, b)), '#ffe4d8');
    },
    primrose(g, x, y) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.ell(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2.2, 2.2, ['#fffde8', '#fbf09a', '#d4b84a']); }
      g.ell(x, y, 1.2, 1.2, '#f6a83a');
    },
    primroseD(g, x, y) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, px = Math.floor(x + Math.cos(a) * 4.4), py = Math.floor(y + Math.sin(a) * 4.4); g.set(px, py, INK); }
      g.set(x, y, '#6abe30');
    },
    moonflower(g, x, y) { g.ell(x, y, 4.5, 4.3, ['#ffffff', '#ece6ff', '#b8a8e8']); },
    moonflowerD(g, x, y) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; for (const r of [1.5, 2.5, 3.4]) { const px = Math.floor(x + 0.5 + Math.cos(a) * r), py = Math.floor(y + 0.5 + Math.sin(a) * r); if (g.filled(px, py)) g.set(px, py, '#c9b4f0'); } }
      g.px([[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]], '#fff6b0');
      g.px([[x - 6, y - 3], [x + 5, y - 4], [x + 5, y + 3], [x - 6, y + 3]], '#fff27a');
    },
    nightshade(g, x, y) {
      g.poly(starPts(x, y, 5, 2.2, 5), '#7a44b8'); shade(g, x, y, 5.2, 5.2, ['#b58ae8', '#7a44b8', '#4a2478']);
    },
    nightshadeD(g, x, y) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; for (const r of [1.6, 2.6]) { const px = Math.floor(x + Math.cos(a) * r), py = Math.floor(y + Math.sin(a) * r); if (g.filled(px, py)) g.set(px, py, '#3a1c60'); } }
      g.px([[x - 1, y - 1], [x, y - 1]], '#fff27a'); g.px([[x - 1, y], [x, y]], '#f6c83a');
    },
    candytulip(g, x, y) {
      const T = new Grid(g.w, g.h);
      T.ell(x, y + 0.9, 3.6, 3.3, '#fff'); T.poly([[x - 3.6, y + 1], [x - 3.4, y - 3.6], [x - 1.5, y - 1.2], [x, y - 4.4], [x + 1.5, y - 1.2], [x + 3.4, y - 3.6], [x + 3.6, y + 1]], '#fff');
      for (let j = 0; j < T.h; j++) for (let i = 0; i < T.w; i++) if (T.get(i, j)) {
        const st = ((i - j) % 4 + 4) % 4, dx = (i + 0.5 - x) / 3.6;
        g.set(i, j, st < 2 ? (dx > 0.45 ? '#b8304a' : '#e8445a') : (dx > 0.45 ? '#f0c8d8' : dx < -0.4 ? '#ffffff' : '#fff0f4'));
      }
    },
    cottonrose(g, x, y) {
      const P = ['#fff0f8', '#ffc8e0', '#e090b8'], V = ['#faf2ff', '#dcc8f8', '#a890d8'];
      g.ell(x - 2.4, y + 0.6, 2.3, 2.2, P); g.ell(x + 2.4, y + 0.6, 2.3, 2.2, P); g.ell(x, y + 2.3, 2.4, 2, V);
      g.ell(x - 1.4, y - 2.1, 2.2, 2.1, V); g.ell(x + 1.5, y - 2.2, 2.2, 2.1, P); g.ell(x, y, 2, 1.8, P);
    },
    cottonroseD(g, x, y) { g.px([[x - 1, y], [x, y - 1], [x + 1, y]], '#e090b8'); g.px([[x - 3, y - 3], [x + 1, y - 4], [x - 4, y]].filter(([a, b]) => g.filled(a, b)), '#ffffff'); },
    sugarblossom(g, x, y) {
      g.ell(x + 0.5, y + 0.5, 3.4, 0.7, '#8f563b', -0.5);
      const bl = (bx, by) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.ell(bx + Math.cos(a) * 1.35, by + Math.sin(a) * 1.35, 1.2, 1.2, ['#fff0f6', '#ffb8d4', '#e07ba0']); } };
      bl(x - 2.3, y - 1.6); bl(x + 2.5, y - 2.1); bl(x + 0.3, y + 2.3);
    },
    sugarblossomD(g, x, y) { for (const [bx, by] of [[x - 2.3, y - 1.6], [x + 2.5, y - 2.1], [x + 0.3, y + 2.3]]) { g.set(Math.floor(bx), Math.floor(by), '#d24552'); } g.px([[x - 6, y - 4], [x + 5, y + 2]], '#ffd6e8'); },
  };
  function flowerArt(g, id, x, y) { (FLO[id] || FLO.primrose)(g, x, y); }
  function flowerDetail(g, id, x, y) { const d = FLO[(FLO[id] ? id : 'primrose') + 'D']; if (d) d(g, Math.floor(x), Math.floor(y)); }

  // ---------------- The Sprig ----------------
  const DEFAULT_LOOK = {
    body: 'mint', leaf: 'leaf', belly: BELLY, cheek: '#f4a3b8',
    pattern: 'plain', patternColor: '#fbf3dc', eyes: 'round', eyeColor: '#5b6ee1',
    hat: 'none', extra: 'none',
    parts: { wings: 0, ears: 0, fins: 0, horns: 0, tail: 0, shell: 0 },
  };
  function cloneLook(l) { return JSON.parse(JSON.stringify(l || DEFAULT_LOOK)); }
  const BUD_RAMP = { sun: RAMPS.sun, moon: ['#b8a8ff', '#7a5ad8', '#43308e'], wild: RAMPS.leaf };

  // blend two #rrggbb colours (k=0 -> a, k=1 -> b)
  function mixHex(a, b, k) {
    try {
      const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b);
      return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
    } catch (e) { return a; }
  }

  // ---------------- Special skins ----------------
  // A skinned body is drawn with this sentinel ramp, then every sentinel pixel is repainted by position + tone.
  const SKIN_SENT = ['#0b0a01', '#0b0a02', '#0b0a03'];
  const RBW = [
    ['#ffd4dc', '#ffe0bc', '#fff8c4', '#dcf8c4', '#cceeff', '#e8d8ff'],
    ['#ff9aaa', '#ffbc78', '#fbe46a', '#a4e27a', '#7ccff4', '#bc9cf0'],
    ['#d0607a', '#d88a40', '#c8a632', '#5aa84c', '#4a90c8', '#8062c0'],
  ];
  const CRY = [
    ['#f6feff', '#eaf8ff', '#f6f0ff', '#eefaff', '#fcf8ff', '#e2f2ff'],
    ['#c8ecfa', '#bfe2f8', '#d8ccf8', '#a8d4f2', '#e2d8ff', '#a2c8ee'],
    ['#8ab8e0', '#94a8e8', '#a898e0', '#7aa8d8', '#b0a0e8', '#6a98d0'],
  ];
  const GOLD = ['#ffffff', '#fff6a8', '#fcd850', '#e8a42a', '#a8680e'];
  const PUMPKIN = ['#ffc47a', '#f7922e', '#c8581c'], GHOST = ['#ffffff', '#efeaff', '#c9bdf0'], WRAP = ['#fffaf0', '#ece0c4', '#c4ae88'];
  const CORN = [['#ffffff', '#fff4e2', '#dccab0'], ['#ffc27a', '#ff9a22', '#d0660c'], ['#fff3a0', '#ffd23a', '#d8a018']];
  const VAMP = [['#6e5a96', '#4a3a6c', '#2e2448'], ['#fbf8ff', '#ebe4f6', '#c4b8d8']], WITCH = [['#c89af0', '#8e56c8', '#5a2e8a'], ['#d8f6a8', '#a2dc6a', '#62a848']];
  // f(x, y, tone, dx, dy, toneAt) -> colour. dx/dy = offset from the body centre in sprig-body units.
  const SKINS = {
    gold(x, y, t, dx, dy) {
      if (t === 2) return GOLD[4];
      if (t === 0) return Math.abs(dx + dy + 8.6) < 0.75 || Math.abs(dx + dy + 11.2) < 0.5 ? GOLD[0] : GOLD[1];
      return dy > 1.2 && dy < 4.6 ? GOLD[3] : GOLD[2];
    },
    rainbow(x, y, t, dx, dy) { const b = Math.floor((dy + dx * 0.45 + 60) / 2.6) % 6; return RBW[t][b]; },
    crystal(x, y, t, dx, dy, at, k) {
      const facet = (ax, ay) => { const a = Math.atan2(ay, ax), r = Math.hypot(ax / 7.2, ay / 6.8), o = r > 0.58; return (Math.floor((a + Math.PI) / (Math.PI / 3) + (o ? 0.5 : 0)) % 6) + (o ? 6 : 0); };
      const f = facet(dx, dy);
      for (const [ox, oy] of [[1, 0], [0, 1]]) if (at(x + ox, y + oy) >= 0 && facet(dx + ox / k, dy + oy / k) !== f) return '#ffffff';
      return CRY[t][(f * 5) % 6];
    },
    ember(x, y, t) {
      if (t === 2) return RAMPS.berry[2];
      const row = Math.floor(y / 3);
      if (y % 3 === 2 && (x + (row % 2) * 2) % 4 !== 0) return '#9a2c3c';
      return RAMPS.berry[t];
    },
    // ---- Halloween skins (cute, not scary) ----
    pumpkin(x, y, t, dx, dy) {
      const w = Math.sqrt(Math.max(0.15, 1 - (dy / 8.4) * (dy / 8.4))), u = Math.abs(dx / w);
      if (Math.abs(u - 3.3) < 0.5 || Math.abs(u - 6.7) < 0.45) return t === 0 ? PUMPKIN[1] : PUMPKIN[2];
      return PUMPKIN[t];
    },
    ghost(x, y, t) { return GHOST[t]; },
    mummy(x, y, t, dx, dy, at, k, base) {
      if (faceZone(dx, dy, -0.35)) return mixHex(base[Math.min(1, t)], '#5a4030', 0.14);
      if (faceZone(dx, dy, 0.3)) return WRAP[2];
      const f = ((((x >> 1) - y) % 3) + 3) % 3;
      if (f === 0) return mixHex(base[Math.min(2, t + 1)], '#5a4030', 0.3);
      if (t === 2) return WRAP[2];
      return f === 1 ? WRAP[1] : WRAP[0];
    },
    candycorn(x, y, t, dx, dy) { const e = dy + ((x + y) & 1 ? 0.3 : -0.3); return (e < -3.4 ? CORN[0] : e < 2.4 ? CORN[1] : CORN[2])[t]; },
    vampire(x, y, t, dx, dy) {
      if (faceZone(dx, dy, 0) && dy > -4.4 + Math.max(0, 1.3 - Math.abs(dx) * 0.7)) return VAMP[1][t];
      const ax = Math.abs(dx);
      if (dy > 1.1 && dy < 4.2 && ax > 3.4 && ax < 3.4 + (4.2 - dy) * 1.1) return ax < 4.4 + (4.2 - dy) * 0.3 ? '#e8506a' : '#b02846';
      return VAMP[0][t];
    },
    witch(x, y, t, dx, dy) {
      if (faceZone(dx, dy, 0)) return WITCH[1][t];
      const h = (x * 73 + y * 151) % 23;
      if (h === 0 || (h === 11 && t < 2)) return t === 2 ? '#f6c83a' : '#fff27a';
      return WITCH[0][t];
    },
  };
  // the face stays readable on patterned skins: an oval around the eyes and mouth (sprig-body units)
  const faceZone = (dx, dy, grow) => (dx / (6.2 + grow)) ** 2 + ((dy + 0.9) / (3.5 + grow)) ** 2 < 1;
  const SKIN_IDS = Object.keys(SKINS);
  const SPOOKY_SKINS = ['pumpkin', 'ghost', 'mummy', 'candycorn', 'vampire', 'witch'];
  const SKIN_BELLY = { ember: '#fff0c4', pumpkin: '#ffe2b0', ghost: '#ffffff', candycorn: '#fff8e0', vampire: '#f4eeff', witch: '#f0e2ff', mummy: null };
  function applySkin(g, skin, cx, cy, k, base) {
    const f = SKINS[skin]; if (!f) return;
    base = base || RAMPS.cream;
    const tone = new Map();
    for (let i = 0; i < g.a.length; i++) { const t = SKIN_SENT.indexOf(g.a[i]); if (t >= 0) tone.set(i, t); }
    const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? -1 : tone.has(y * g.w + x) ? tone.get(y * g.w + x) : -1);
    const out = [];
    for (const [i, t] of tone) { const x = i % g.w, y = (i / g.w) | 0; out.push([i, f(x, y, t, (x + 0.5 - cx) / k, (y + 0.5 - cy) / k, at, k, base)]); }
    for (const [i, c] of out) g.a[i] = c;
  }

  // ---------------- Hats & extras (shared by buildSprig and the hat icons; sprig 32x32 coordinates) ----------------
  const HAT_IDS = ['crown', 'beanie', 'tophat', 'flower', 'bow', 'leafcap', 'party', 'wizard', 'sunhat', 'cap', 'witch'];
  const EXTRA_IDS = ['halo', 'star', 'moon'];
  const HIDES_LEAVES = { beanie: 1, tophat: 1, wizard: 1, sunhat: 1, cap: 1, witch: 1 };
  // striped cone from base-left / base-right to tip; stripes spiral a little, 3-tone across the cone
  function cone(h, bl, br, tp, ramps, n) {
    const T = new Grid(h.w, h.h); T.poly([bl, br, tp], '#fff');
    const mx = (bl[0] + br[0]) / 2, my = (bl[1] + br[1]) / 2, ax = tp[0] - mx, ay = tp[1] - my, al2 = ax * ax + ay * ay, sx = br[0] - bl[0], sy = br[1] - bl[1], sl2 = sx * sx + sy * sy;
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (T.get(x, y)) {
      const px = x + 0.5 - mx, py = y + 0.5 - my, u = clamp((px * ax + py * ay) / al2, 0, 1), rel = ((px * sx + py * sy) / sl2) / Math.max(0.1, (1 - u) * 0.5);
      const R2 = ramps[((Math.floor(u * n + rel * 0.3 + 8) % ramps.length) + ramps.length) % ramps.length];
      h.set(x, y, R2[rel < -0.4 ? 0 : rel > 0.4 ? 2 : 1]);
    }
    return h;
  }
  function hatArt(h, hat, crowned, bloom) {
    switch (hat) {
      case 'crown': h.poly([[11, 14.5], [11, 9], [13.5, 11.5], [16, 8], [18.5, 11.5], [21, 9], [21, 14.5]], '#f6c83a').rect(11, 13, 10, 1, '#c7861c'); h.px([[15, 12], [16, 12]], '#d95763'); h.px([[12, 11], [16, 9]], '#fff27a'); if (crowned) h.poly([[13.5, 12], [16, 9.5], [18.5, 12]], null); break;
      case 'beanie': h.ell(16, 16.2, 7.8, 4.6, RAMPS.berry, 0, (x, y) => y <= 15).rect(9, 15, 14, 2, '#fbf3dc'); h.ell(16, 10.2, 1.8, 1.8, '#ffffff'); break;
      case 'tophat': h.rect(10, 14, 12, 2, '#3f3f74').rect(12, 7, 8, 7, '#4a4aa0').rect(12, 12, 8, 1, '#d95763').px([[13, 8], [13, 9]], '#7d8cf0'); break;
      case 'flower': if (!bloom) h.px([[22, 13], [21, 14], [23, 14], [22, 15]], '#f7b6c8').px([[22, 14]], '#fbf236'); break;
      case 'bow': h.poly([[16.5, 14], [21, 11.5], [21, 16.5]], '#9a6ad0').poly([[15.5, 14], [11, 11.5], [11, 16.5]], '#9a6ad0').px([[15, 13], [16, 13], [15, 14], [16, 14]], '#c9a2f0'); break;
      case 'leafcap': h.ell(16, 15.5, 8, 3.2, RAMPS.leaf, 0, (x, y) => y <= 15).px([[16, 11], [16, 12]], '#37946e'); break;
      case 'party': {
        // centred cone on a Seedling; tipped over to the left of a bud/bloom (like the crown, it leaves the flower visible)
        const [bl, br, tp, pp] = crowned ? [[7.8, 17], [15, 14.4], [7.2, 5.4], [8, 6]] : [[11.6, 15.2], [20.4, 15.2], [16, 5.2], [16, 6]];
        cone(h, bl, br, tp, [['#ffb8dc', '#f26aa8', '#b83a78'], ['#fffab0', '#fbe036', '#c8a018']], 4.4);
        piece(h, t => t.ell(pp[0], pp[1], 1.8, 1.8, ['#d8fcff', '#5fdcf0', '#2a98b8']));
        h.set(pp[0] - 1, pp[1] - 1, '#ffffff');
        break;
      }
      case 'witch': {
        const WT = ['#a47ae0', '#6c3eb0', '#43206e'];
        piece(h, t => { t.poly([[11.2, 14.6], [20.8, 14.6], [19, 9.6], [18.2, 6], [21.8, 3.2], [16.4, 4.2], [13.6, 9.6]], WT[1]); shade(t, 14.4, 10.4, 6.6, 6.6, WT); });
        for (let x = 0; x < 32; x++) for (const y of [12, 13]) if (WT.includes(h.get(x, y))) h.set(x, y, y === 12 ? '#ff9a22' : '#d0660c');
        h.px([[15, 12], [16, 12], [17, 12], [15, 13], [17, 13]], '#fbf236'); h.set(16, 13, '#6c3eb0');
        piece(h, t => t.ell(16, 15.4, 8.4, 1.7, WT));
        h.px([[14, 9], [14, 10], [15, 7]].filter(([x, y]) => WT.includes(h.get(x, y))), '#c8a8f4');
        break;
      }
      case 'wizard': {
        const WZ = ['#8aa8ff', '#4a5ed8', '#2c3490'];
        piece(h, t => { t.poly([[11.2, 14.6], [20.8, 14.6], [19.4, 9.2], [22.6, 5], [16.8, 7], [13.4, 10.4]], WZ[1]); shade(t, 14.6, 11.6, 6.6, 6, WZ); });
        piece(h, t => t.ell(16, 15.4, 7.1, 1.55, WZ));
        h.px([[15, 11], [14, 12], [16, 12], [15, 13], [19, 9], [18, 13], [20, 6]], '#fbf236'); h.set(15, 12, '#ffffff');
        break;
      }
      case 'sunhat': {
        const ST = ['#fff6c8', '#f0d284', '#c8a050'];
        piece(h, t => t.ell(16, 15.3, 7.1, 1.9, ST));
        piece(h, t => t.ell(16, 13.8, 4.4, 3.8, ST, 0, (x, y) => y <= 14));
        for (let y = 9; y < 18; y++) for (let x = 8; x < 24; x++) if (h.get(x, y) === ST[1] && (x + y * 2) % 4 === 0) h.set(x, y, '#e0bc6a');
        h.rect(12, 13, 8, 1, '#e8445a'); h.px([[19, 12], [20, 12], [20, 13], [21, 13]], '#f07a8a'); h.set(19, 13, '#b8304a');
        h.px([[12, 11], [13, 10]], '#ffffff');
        break;
      }
      case 'cap': {
        const CP = ['#9fd8ff', '#639bff', '#3f55b8'];
        piece(h, t => t.poly([[16, 14.2], [23, 14.8], [23, 16.6], [16, 16.6]], CP[2]));
        piece(h, t => t.ell(14.6, 16.2, 6, 5, CP, 0, (x, y) => y <= 15));
        h.px([[14, 11], [14, 12], [14, 13], [14, 14]].filter(([x, y]) => h.get(x, y) && h.get(x, y) !== INK), CP[2]);
        h.px([[12, 13], [11, 13], [12, 14], [11, 14], [13, 14]].filter(([x, y]) => h.get(x, y) && h.get(x, y) !== INK), '#ffffff');
        h.set(18, 15, '#9fd8ff'); h.set(19, 15, '#9fd8ff');
        break;
      }
    }
    return h;
  }
  function extraArt(h, extra, crowned) {
    const ey = crowned ? -4 : 0;
    switch (extra) {
      case 'halo': h.ell(16, 6.5 + ey, 5, 1.6, '#fbf236').ell(16, 6.5 + ey, 3.3, 0.7, null); break;
      case 'star': h.px([[16, 5], [15, 6], [16, 6], [17, 6], [16, 7]].map(([x, y]) => [x + (crowned ? 7 : 0), y + (crowned ? 1 : 0)]), '#fbf236'); break;
      case 'moon': h.px([[15, 5], [14, 6], [14, 7], [15, 8], [16, 8]].map(([x, y]) => [x + (crowned ? 9 : 0), y + (crowned ? 1 : 0)]), '#c9a2f0'); break;
    }
    return h;
  }

  // pose: { frame:0|1 (idle bob / walk step), walk, flap, arms:'down'|'up'|'out'|'paddle'|'hold', eyes:'blink'|'happy'|'closed'|'sad'|..., mouth:'smile'|'open'|'o'|'flat'|'grin' }
  // part values 0..1: <0.5 small, <0.9 medium, >=0.9 big
  function buildSprig(L, P) {
    L = L || DEFAULT_LOOK; P = P || {};
    const g = new Grid(32, 32), B = new Grid(32, 32); // B = layer behind everything
    const skin = L.skin && SKINS[L.skin] ? L.skin : null; // skinned bodies draw with a sentinel ramp, repainted after outline
    const R = skin ? SKIN_SENT : (RAMPS[L.body] || RAMPS.mint), LR = RAMPS[L.leaf] || RAMPS.leaf, pt = L.parts || {};
    const pc2 = L.patternColor || '#fbf3dc';
    const sz = v => (v >= 0.9 ? 1.15 : v >= 0.5 ? 0.97 : 0.8);
    const hatHidesLeaves = !!HIDES_LEAVES[L.hat];
    const flap = P.flap ? (P.frame ? -1.6 : 1.2) : 0;
    const W = (ox, oy, kx, ky, pts) => pts.map(([x, y]) => [ox + x * kx, oy + y * ky + (y < -5 ? flap : 0)]);
    const both = (G, pts, col) => { G.poly(pts, col); G.poly(mirX(pts, 32), col); };
    // --- far behind (layer B): big wings, fan tails, back spikes, fluff collar ---
    if (pt.dragonwings > 0) {
      const k = sz(pt.dragonwings), w = W(9.5, 17.5, Math.min(k, 1), k * 0.95, [[0, -1.5], [-2.6, -8], [-6, -12.6], [-8.4, -12], [-8.6, -8], [-6.8, -7], [-8.6, -3.4], [-6.4, -3], [-7, 1.2], [-4.6, 0], [-3.4, 3.4], [0, 2]]);
      const D = new Grid(32, 32); both(D, w, '#d24552');
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (D.get(x, y) && (x < 5 || x > 26) && (x + y) % 2) D.set(x, y, '#e05a6a');
      for (const i of [4, 6, 8]) { line(D, 9, 16, w[i][0], w[i][1], '#8a2433'); line(D, 22, 16, 31 - w[i][0], w[i][1], '#8a2433'); }
      for (const [a, b] of [[0, 1], [1, 2], [2, 3]]) { line(D, w[a][0], w[a][1], w[b][0], w[b][1], '#f07a84'); line(D, 31 - w[a][0], w[a][1], 31 - w[b][0], w[b][1], '#f07a84'); }
      under(B, D);
    }
    if (pt.batwings > 0) {
      const k = sz(pt.batwings), w = W(9.5, 18.5, Math.min(k, 1), k, [[0, -1], [-2.5, -5], [-7.8, -7.6], [-8.2, -4], [-7, -1], [-6.6, 2], [-5, 0.8], [-3.6, 3.6], [-2.2, 1.8], [0, 3]]);
      const D = new Grid(32, 32); both(D, w, '#4f4270'); shade(D, 16, 12, 16, 12, ['#76669e', '#4f4270', '#342a52']);
      for (const i of [2, 4, 7]) { line(D, 9, 18, w[i][0], w[i][1], '#2a2040'); line(D, 22, 18, 32 - w[i][0], w[i][1], '#2a2040'); }
      under(B, D);
    }
    if (pt.flamewings > 0) {
      const k = sz(pt.flamewings);
      for (const s of [-1, 1]) {
        [[168, 6, RAMPS.clay], [198, 8, RAMPS.clay], [228, 8.6, RAMPS.sun], [252, 6.4, RAMPS.sun]].forEach(([deg, len, ramp]) => {
          let a = deg * Math.PI / 180 + (flap ? flap * 0.07 : 0); const L2 = len * k;
          let dx = Math.cos(a), dy = Math.sin(a); if (s > 0) dx = -dx;
          piece(B, t => t.ell(16 + s * 6.5 + dx * L2 * 0.55, 19 + dy * L2 * 0.55, L2 * 0.55, 1.7 * k, ramp, Math.atan2(dy, dx)));
        });
      }
    }
    if (pt.fairywings > 0) {
      const k = sz(pt.fairywings), FR = ['#ffffff', '#dcefff', '#b4c8f4'];
      for (const s of [-1, 1]) {
        B.ell(16 + s * (6.6 + 3.3 * k), 15.5 - 2.2 * k + flap * 0.6, 2.5 * k, 4.3 * k, FR, s * -0.8);
        B.ell(16 + s * (6.8 + 2.6 * k), 22.4, 1.9 * k, 2.8 * k, FR, s * -0.3);
      }
    }
    if (pt.multitail > 0) {
      const k = sz(pt.multitail);
      const km = Math.min(k, 1);
      for (const [deg, len] of [[-82, 13], [-48, 12.4], [-14, 11]]) { const a = deg * Math.PI / 180, l2 = len * km; piece(B, t => t.ell(19.5 + Math.cos(a) * l2 * 0.52, 25 + Math.sin(a) * l2 * 0.52, l2 * 0.5, 2.5 * k, RAMP_X.cream, a)); }
    }
    if (pt.spikes > 0) {
      const k = sz(pt.spikes);
      for (const deg of [-160, -134, -108, -72, -46, -20]) {
        const a = deg * Math.PI / 180, rim = t => [16 + 8 * Math.cos(t), 22 + 7.4 * Math.sin(t)];
        B.poly([rim(a - 0.26), rim(a + 0.26), [16 + (8.3 + 4.4 * k) * Math.cos(a), 22 + (7.7 + 4.4 * k) * Math.sin(a)]], R[2]);
      }
    }
    if (pt.fluff > 0) {
      const k = sz(pt.fluff);
      for (const deg of [-170, -138, -106, -74, -42, -10, 20, 160]) { const a = deg * Math.PI / 180; B.ell(16 + (8.4 + 1.2 * k) * Math.cos(a), 22 + (7.8 + 1.2 * k) * Math.sin(a), 2.7 * k, 2.5 * k, RAMPS.cloud); }
    }
    // --- behind (main layer) ---
    if (pt.wings > 0) { const k = sz(pt.wings); const fl = P.flap ? (P.frame ? 0.35 : -0.25) : 0; g.ell(6.2, 19, 2.7 * k, 4.9 * k, RAMPS.cloud, -0.6 - fl); g.ell(25.8, 19, 2.7 * k, 4.9 * k, RAMPS.cloud, 0.6 + fl); }
    if (pt.shell > 0) { const k = pt.shell >= 0.9 ? 1.08 : pt.shell >= 0.5 ? 1 : 0.94; g.ell(16, 22.6, 10.2 * k, 8.4 * k, RAMPS.moss); }
    if (pt.tail > 0) { const k = sz(pt.tail); g.ell(24.6 + k, 26.4 - k, 3.6 * k, 2.1 * k, R, -0.7); g.ell(26.8 + 1.8 * k, 24.4 - 1.4 * k, 1.5 * k, 1.5 * k, LR[1]); }
    if (pt.ears > 0) { const k = sz(pt.ears); g.ell(10.4 - k, 13.6 - 1.2 * k, 1.9, 4.6 * k, R, -0.42); g.ell(21.6 + k, 13.6 - 1.2 * k, 1.9, 4.6 * k, R, 0.42); }
    if (pt.fins > 0) { const k = sz(pt.fins); g.ell(7 - k * 0.6, 19, 2 * k, 3.4 * k, RAMPS.sky, -0.55); g.ell(25 + k * 0.6, 19, 2 * k, 3.4 * k, RAMPS.sky, 0.55); }
    if (pt.horns > 0) { const k = sz(pt.horns); const hc = '#eec39a'; g.poly([[10.5, 16.5], [13.8, 15.2], [10 - k, 10.5 - 2 * k]], hc); g.poly([[21.5, 16.5], [18.2, 15.2], [22 + k, 10.5 - 2 * k]], hc); }
    if (pt.antennae > 0) { const k = sz(pt.antennae); g.ell(11 - 3.2 * k, 15 - 6 * k, 1.3, 1.3, RAMPS.sun); g.ell(21 + 3.2 * k, 15 - 6 * k, 1.3, 1.3, RAMPS.sun); }
    // feet or tentacles
    const tent = pt.tentacles > 0;
    if (tent) {
      const k = sz(pt.tentacles), wig = P.frame ? 0.7 : 0;
      for (const s of [-1, 1]) {
        const o = 16 + s * 5.5, n = 16 + s * 2.2, w2 = wig * s;
        stroke(g, [[o, 25], [o + s * 2.4 * k + w2, 28.4], [o + s * 4.8 * k, 29.3], [o + s * 6.6 * k, 27.8], [o + s * 6 * k - w2 * 0.5, 25.8]], 1.8, 0.9, R[1]);
        stroke(g, [[n, 27], [n + s * 0.8 - w2 * 0.6, 29.4], [n + s * 2.6 * k, 29.6], [n + s * 3.4 * k, 28.4]], 1.7, 0.9, R[1]);
      }
    } else {
      const fl = P.walk && P.frame ? -1 : 0, fr = P.walk && !P.frame ? -1 : 0, fc = L.pattern === 'socks' ? pc2 : R[2];
      if (skin === 'ghost') { const wv = P.frame ? 0.5 : 0; for (const [x, dy2] of [[10.4, wv], [16, -wv], [21.6, wv]]) g.ell(x, 28.4 + dy2, 2.4, 1.9, R); }
      else { g.ell(12.4, 29.2 + fl, 2.8, 1.8, fc); g.ell(19.6, 29.2 + fr, 2.8, 1.8, fc); }
    }
    // body
    const bodyMask = new Set();
    g.ell(16, 22, 8.3, 7.7, R, 0, (x, y) => { bodyMask.add(x + ',' + y); return true; });
    // pattern on body
    const onBody = (x, y) => bodyMask.has(x + ',' + y);
    const pc = L.patternColor;
    if (L.pattern === 'spots') g.px([[10, 16], [11, 16], [10, 17], [21, 17], [21, 18], [20, 17], [9, 24], [22, 24], [22, 25], [13, 15], [18, 14]].filter(([x, y]) => onBody(x, y)), pc);
    if (L.pattern === 'stripes') g.px([[12, 15], [12, 16], [15, 14], [16, 14], [15, 15], [16, 15], [19, 15], [19, 16], [9, 18], [22, 18]].filter(([x, y]) => onBody(x, y)), pc);
    if (L.pattern === 'twotone' && !skin) for (const k of bodyMask) { const [x, y] = k.split(',').map(Number); if (y <= 18) g.set(x, y, pc); }
    if (L.pattern === 'mask') for (const k of bodyMask) { const [x, y] = k.split(',').map(Number); if (y >= 19 && y <= 21 && x >= 10 && x <= 21) g.set(x, y, pc); }
    if (L.pattern === 'freckles') g.px([[8, 21], [9, 20], [10, 21], [23, 21], [22, 20], [21, 21], [9, 23], [22, 23]].filter(([x, y]) => onBody(x, y)), pc2);
    // belly (ember skin: warm cream dragon belly)
    const bellyCol = skin && skin in SKIN_BELLY ? SKIN_BELLY[skin] : (L.belly || BELLY);
    if (bellyCol) g.ell(16, 26, 4.8, 2.9, bellyCol, 0, onBody);
    if (skin === 'ember') for (let y = 23; y < 30; y += 2) for (let x = 10; x < 22; x++) if (g.get(x, y) === bellyCol) g.set(x, y, '#f6d68a');
    // soft shading under the belly (dithered one row up) and a glossy highlight on the head
    if (bellyCol) {
      const isB = (x, y) => { const c = g.get(x, y); return c === bellyCol || c === '#f6d68a'; };
      const bsh = mixHex(bellyCol, skin ? '#b08a60' : R[2], 0.28), bpts = [];
      for (let y = 23; y < 30; y++) for (let x = 10; x < 22; x++) if (isB(x, y) && (!isB(x, y + 1) || (!isB(x, y + 2) && (x + y) & 1) || (!isB(x + 1, y) && x > 18))) bpts.push([x, y]);
      g.px(bpts, bsh);
      if (!skin) g.px([[11, 16], [12, 16], [10, 17]].filter(([x, y]) => g.get(x, y) === R[0]), mixHex(R[0], '#ffffff', 0.55));
    }
    if (L.pattern === 'star') g.px([[15, 25], [16, 25], [15, 26], [16, 26], [14, 26], [17, 26], [15, 24], [16, 24], [15, 27], [16, 27]], pc === BELLY ? '#f6c83a' : pc);
    if (L.pattern === 'heart') g.px([[13, 25], [14, 25], [17, 25], [18, 25], [13, 26], [14, 26], [15, 26], [16, 26], [17, 26], [18, 26], [14, 27], [15, 27], [16, 27], [17, 27], [15, 28], [16, 28]].filter(([x, y]) => onBody(x, y)), pc2 === (L.belly || BELLY) || pc2 === BELLY ? '#e8608a' : pc2);
    // front fluff tufts
    if (pt.fluff > 0) { const k = sz(pt.fluff); for (const s of [-1, 1]) { g.ell(16 + s * 7.4, 27.2, 2.3 * k, 1.9 * k, RAMPS.cloud); g.ell(16 + s * 6.6, 15.8, 1.8 * k, 1.5 * k, RAMPS.cloud); } }
    // arms (or pincers)
    let arms = P.arms || 'down';
    if (arms === 'paddle') arms = P.frame ? 'up' : 'out';
    let hands;
    if (arms === 'up') { g.ell(7.4, 17.6, 1.7, 2.8, R, 0.45); g.ell(24.6, 17.6, 1.7, 2.8, R, -0.45); hands = [6, 15, -0.35, -1]; }
    else if (arms === 'out') { g.ell(6.4, 21.2, 2.8, 1.7, R); g.ell(25.6, 21.2, 2.8, 1.7, R); hands = [4, 20.4, -1, -0.45]; }
    else if (arms === 'hold') { g.ell(10, 23.5, 2, 1.7, R); g.ell(22, 23.5, 2, 1.7, R); hands = [9.6, 23, -0.2, -1]; }
    else { const s = P.walk ? (P.frame ? 0.5 : -0.5) : 0; g.ell(7.9, 23 + s, 1.8, 2.6, R); g.ell(24.1, 23 - s, 1.8, 2.6, R); hands = [6.4, 24.2 + s, -0.6, -0.8]; }
    if (pt.claws > 0) {
      const k = sz(pt.claws), C = new Grid(32, 32);
      for (const s of [-1, 1]) {
        const cx = s < 0 ? hands[0] : 32 - hands[0], cy = hands[1], dy = hands[3];
        const ddx = s < 0 ? hands[2] : -hands[2], n = Math.hypot(ddx, dy), ux = ddx / n, uy = dy / n, px = -uy, py = ux, r = 2.7 * k;
        C.ell(cx, cy, r, r * 0.92, RAMP_X.crab);
        C.poly([[cx + ux * 0.1, cy + uy * 0.1], [cx + ux * 3.8 * k + px * 1.9 * k, cy + uy * 3.8 * k + py * 1.9 * k], [cx + ux * 3.8 * k - px * 1.2 * k, cy + uy * 3.8 * k - py * 1.2 * k]], null);
      }
      g.merge(C);
    }
    // sprout / bud / bloom
    if (!hatHidesLeaves && L.bloom) {
      g.rect(15, 11, 2, 4, '#37946e');
      g.ell(13, 13.4, 2.1, 1, RAMPS.leaf, 0.45); g.ell(19, 13.4, 2.1, 1, RAMPS.leaf, -0.45);
      flowerArt(g, L.bloom, 16, 6.5);
    } else if (!hatHidesLeaves && L.bud) {
      const BR = BUD_RAMP[L.bud] || BUD_RAMP.wild;
      g.rect(15, 10, 2, 5, '#37946e');
      g.ell(12.9, 12.9, 2.3, 1.1, LR, 0.45); g.ell(19.1, 12.9, 2.3, 1.1, LR, -0.45);
      g.ell(16, 6.8, 2.9, 3.4, BR); g.poly([[13.7, 6], [18.3, 6], [16, 1.6]], BR[1]); g.ell(16, 6.8, 2.9, 3.4, BR, 0, (x, y) => y >= 5);
      g.poly([[12.8, 7.6], [14.4, 9.8], [16, 8.6], [17.6, 9.8], [19.2, 7.6], [18.2, 10.8], [13.8, 10.8]], '#6abe30');
    } else if (!hatHidesLeaves) {
      g.rect(15, 12, 2, 3, skin === 'pumpkin' ? '#7a4a2a' : LR[2]);
      g.ell(12.6, 11.4, 3.1, 1.6, LR, 0.42); g.ell(19.4, 11.4, 3.1, 1.6, LR, -0.42);
    }
    // unicorn horn (front)
    let horn = null;
    if (pt.unihorn > 0) { const k = sz(pt.unihorn); horn = new Grid(32, 32); horn.poly([[14, 17.8], [18, 17.8], [16.4, 17.8 - 10.5 * k]], '#fff8fc'); }
    const behind = under(g, B);
    g.outline();
    // ---------- details after outline ----------
    const onlyB = (x, y) => behind.has(y * 32 + x);
    if (pt.dragonwings > 0) { const k = sz(pt.dragonwings); const tx = Math.floor(9.5 - 6 * Math.min(k, 1)), ty = Math.floor(17.5 - 12.6 * k * 0.95 + flap); for (const X of [tx, 31 - tx]) if (g.get(X, ty - 1) === INK) g.set(X, ty - 1, '#fbf3dc'); }
    if (pt.fairywings > 0) {
      for (const i of behind) { const x = i % 32, y = (i / 32) | 0; if (g.get(x - 1, y) === INK || g.get(x + 1, y) === INK || g.get(x, y - 1) === INK || g.get(x, y + 1) === INK) g.set(x, y, '#c4b0f0'); }
      const k = sz(pt.fairywings);
      for (const s of [-1, 1]) { g.set(Math.floor(16 + s * (6.6 + 3.3 * k)), Math.floor(15.5 - 2.2 * k), '#f7b6c8'); g.set(Math.floor(16 + s * (6.8 + 2.6 * k)), 22, '#f7b6c8'); }
    }
    if (pt.flamewings > 0) for (const i of behind) { const x = i % 32, y = (i / 32) | 0; const c = g.get(x, y); if ((c === '#df7126' || c === '#f6c83a') && (x + y * 2) % 5 === 0) g.set(x, y, '#fff27a'); }
    if (pt.multitail > 0) { const km = Math.min(sz(pt.multitail), 1); for (const i of behind) { const x = i % 32, y = (i / 32) | 0; const c = g.get(x, y); if (!RAMP_X.cream.includes(c)) continue; const d = Math.hypot(x + 0.5 - 19.5, y + 0.5 - 25); if (d > 8.4 * km) g.set(x, y, d > 9.8 * km ? '#df7126' : '#f6a83a'); } }
    if (pt.spikes > 0) for (const i of behind) { const x = i % 32, y = (i / 32) | 0; const c = g.get(x, y); if (c === R[2] && Math.hypot(x + 0.5 - 16, (y + 0.5 - 22) * 1.08) > 10.4 && (x + y) % 2) g.set(x, y, R[1]); }
    if (pt.ears > 0) { const k = sz(pt.ears); g.ell(10.4 - k, 13.6 - 1.2 * k, 0.7, 3.2 * k, L.cheek, -0.42, (x, y) => g.filled(x, y)); g.ell(21.6 + k, 13.6 - 1.2 * k, 0.7, 3.2 * k, L.cheek, 0.42, (x, y) => g.filled(x, y)); }
    if (pt.shell > 0) g.px([[7, 20], [7, 21], [24, 20], [24, 21], [8, 27], [23, 27]].filter(([x, y]) => g.filled(x, y) && !onBody(x, y)), '#4b692f');
    if (pt.antennae > 0) { const k = sz(pt.antennae); const tx = Math.round(11 - 3.2 * k), ty = Math.round(15 - 6 * k) + 1; line(g, 11, 15, tx + 1, ty, INK); line(g, 20, 15, 32 - tx - 2, ty, INK); g.set(Math.floor(11 - 3.2 * k - 0.6), Math.floor(15 - 6 * k - 0.6), '#ffffff'); g.set(Math.floor(21 + 3.2 * k - 0.6), Math.floor(15 - 6 * k - 0.6), '#ffffff'); }
    if (tent) { const k = sz(pt.tentacles); for (const s of [-1, 1]) for (const [x, y] of [[16 + s * (5.5 + 3.4 * k), 29], [16 + s * (5.5 + 5.6 * k), 28], [16 + s * (2.2 + 1.6 * k), 30]]) { const X = Math.floor(x), Y = Math.floor(y); if (g.filled(X, Y) && !onBody(X, Y)) g.set(X, Y, L.belly || BELLY); } }
    if (pt.claws > 0) { const s0 = hands; const cx = Math.floor(s0[0] - 1), cy = Math.floor(s0[1] - 1); if (g.filled(cx, cy)) g.set(cx, cy, '#ffc8b0'); if (g.filled(31 - cx, cy)) g.set(31 - cx, cy, '#ffc8b0'); }
    if (horn) {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (horn.get(x, y)) { if ((x + y) % 3 === 0) horn.set(x, y, '#e2b8f0'); else if ((x + y) % 3 === 1 && x >= 16) horn.set(x, y, '#f7d0e4'); }
      horn.outline(); g.merge(horn);
    }
    if (!hatHidesLeaves && L.bloom) flowerDetail(g, L.bloom, 16, 6.5);
    else if (!hatHidesLeaves && L.bud) {
      const BR = BUD_RAMP[L.bud] || BUD_RAMP.wild;
      g.px([[16, 4], [16, 5], [16, 6], [15, 7]].filter(([x, y]) => g.filled(x, y)), BR[2]); g.px([[14, 5], [14, 6]].filter(([x, y]) => g.filled(x, y)), BR[0]);
      if (L.bud === 'wild') g.px([[15, 2], [16, 2], [15, 3], [16, 3], [15, 4], [17, 4]].filter(([x, y]) => g.filled(x, y)), '#e07ba0');
      if (L.bud === 'moon') g.px([[19, 3], [12, 5]], '#dcd0ff');
      if (L.bud === 'sun') g.px([[19, 3], [12, 5]], '#fff27a');
    }
    else if (!hatHidesLeaves) { g.px([[12, 11], [13, 11]].filter(([x, y]) => g.filled(x, y)), LR[2]); g.px([[18, 11], [19, 11]].filter(([x, y]) => g.filled(x, y)), LR[2]); g.px([[11, 10], [20, 10]].filter(([x, y]) => g.filled(x, y)), mixHex(LR[0], '#ffffff', 0.4)); }
    void onlyB;
    // socks: shade the sole of each foot
    if (L.pattern === 'socks' && !tent) { const sd = mixHex(pc2, INK, 0.3); for (let y = 26; y < 32; y++) for (let x = 8; x < 24; x++) if (g.get(x, y) === pc2 && !onBody(x, y) && g.get(x, y + 1) === INK) g.set(x, y, sd); }
    // special skin: repaint every sentinel (body-ramp) pixel
    if (skin) applySkin(g, skin, 16, 22, 1, RAMPS[L.body] || RAMPS.mint);
    // face
    let eyes = P.eyes || L.eyes;
    const k = INK, w = '#ffffff', eyeShine = mixHex(L.eyeColor || '#5b6ee1', INK, 0.25);
    const eye = (x0, sd) => {
      const a = x0, b = x0 + 1;
      switch (eyes) {
        case 'happy': g.px([[a, 20], [b, 20]], k); g.px([[a - 1, 21], [b + 1, 21]], k); break;
        case 'closed': g.px([[a, 21], [b, 21]], k); g.px([[a - 1, 20], [b + 1, 20]], k); break;
        case 'blink': g.px([[a, 21], [b, 21]], k); break;
        case 'sleepy': g.px([[a, 20], [b, 20], [a, 21], [b, 21]], k); g.px([[a - 1, 20], [b + 1, 20]], k); break;
        case 'dot': g.px([[sd < 0 ? b : a, 20], [sd < 0 ? b : a, 21]], k); break;
        case 'sparkle': g.px([[a, 19], [b, 19], [a, 20], [b, 20]], k); g.px([[a, 21], [b, 21]], L.eyeColor || '#5b6ee1'); g.set(a, 19, w); g.set(b, 21, w); g.px([[a - 1, 20], [b + 1, 20]], k); break;
        default:
          g.px([[a, 19], [b, 19], [a, 20], [b, 20], [a, 21], [b, 21]], k); g.set(a, 19, w); g.set(b, 21, eyeShine);
          if (eyes === 'brave') { if (sd < 0) g.px([[a - 1, 17], [a, 17], [b, 18]], k); else g.px([[b + 1, 17], [b, 17], [a, 18]], k); }
          if (eyes === 'sad') { if (sd < 0) g.px([[a - 1, 18], [a, 17], [b, 17]], k); else g.px([[b + 1, 18], [b, 17], [a, 17]], k); }
      }
    };
    // Dark bodies (night, plum, cocoa…) swallow ink eyes: give them pale eye patches and a muzzle so the face reads.
    const bodyMid = ((RAMPS[L.body] || RAMPS.mint)[1]).slice(1), lum = (parseInt(bodyMid.slice(0, 2), 16) * 0.3 + parseInt(bodyMid.slice(2, 4), 16) * 0.59 + parseInt(bodyMid.slice(4, 6), 16) * 0.11) / 255;
    if (!skin && lum < 0.42) {
      const pale = '#e8ecff', onFace = (x, y) => g.filled(x, y);
      for (const x0 of [12, 18]) for (let y = 18; y <= 22; y++) for (let x = x0 - 1; x <= x0 + 2; x++) {
        const corner = (y === 18 || y === 22) && (x === x0 - 1 || x === x0 + 2);
        if (!corner && onFace(x, y)) g.set(x, y, pale);
      }
      g.ell(16, 23, 2.6, 1.3, pale, 0, onFace);
    }
    eye(12, -1); eye(18, 1);
    g.px([[10, 22], [11, 22]], L.cheek); g.px([[20, 22], [21, 22]], L.cheek);
    switch (P.mouth || 'smile') {
      case 'open': g.px([[14, 22], [17, 22], [15, 23], [16, 23]], k); g.px([[15, 22], [16, 22]], '#d95763'); break;
      case 'o': g.px([[15, 22], [16, 22], [15, 23], [16, 23]], k); break;
      case 'flat': g.px([[15, 23], [16, 23]], k); break;
      case 'grin': g.px([[14, 22], [15, 23], [16, 23], [17, 22]], k); g.px([[15, 22], [16, 22]], w); break;
      default: g.px([[14, 22], [15, 23], [16, 23], [17, 22]], k);
    }
    if (skin === 'vampire' && (P.mouth || 'smile') !== 'o' && (P.mouth || 'smile') !== 'flat') g.px([[14, 23], [17, 23]], '#ffffff');
    if (skin === 'ghost') { // a see-through, wispy lower half
      const pale = new Set(GHOST.concat(['#ffffff']));
      for (let y = 26; y < 32; y++) for (let x = 0; x < 32; x++) {
        const c = g.get(x, y); if (!c) continue;
        const a = y >= 28 ? 0.62 : 0.82;
        if (pale.has(c)) { const [r, gg, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); g.set(x, y, `rgba(${r},${gg},${b},${(x + y) & 1 ? a : a + 0.12})`); }
        else if (c === INK) g.set(x, y, `rgba(110,92,170,${y >= 28 ? 0.55 : 0.85})`);
      }
    }
    // hat & extras on their own outlined layer
    const h = new Grid(32, 32);
    const crowned = !hatHidesLeaves && (L.bloom || L.bud);
    hatArt(h, L.hat, crowned, L.bloom);
    extraArt(h, L.extra, crowned);
    h.outline(); g.merge(h);
    return g;
  }
  const cache = new Map();
  function sprig(L, P) {
    const key = JSON.stringify(L) + '|' + JSON.stringify(P || {});
    let c = cache.get(key);
    if (!c) {
      try { c = buildSprig(L, P).canvas(); } catch (e) { console.error('PX.sprig', e); c = buildSprig(DEFAULT_LOOK, {}).canvas(); }
      cache.set(key, c); if (cache.size > 600) cache.delete(cache.keys().next().value);
    }
    return c;
  }
  // canvas is SPRIG_W x SPRIG_H (32x32); anchor: feet bottom at (16, 31)
  const SPRIG_W = 32, SPRIG_H = 32, SPRIG_AX = 16, SPRIG_AY = 31;

  // ---------------- Emote bubbles ----------------
  const ICONS = {
    heart: ['RR.RR', 'RRRRR', 'RRRRR', '.RRR.', '..R..'],
    '!': ['..o..', '..o..', '..o..', '.....', '..o..'],
    '?': ['.BBB.', '...B.', '..B..', '.....', '..B..'],
    note: ['..pp.', '..p.p', '..p..', 'ppp..', 'pp...'],
    zz: ['BBBB.', '..B..', '.B...', 'BBBB.', '.....'],
    swirl: ['.rrr.', 'r...r', 'r.r.r', 'r..r.', '.rr..'],
    sparkle: ['..o..', '.ooo.', 'ooooo', '.ooo.', '..o..'],
    munch: ['.....', 'RRRRR', 'R...R', 'RRRRR', '.....'],
  };
  const emoteCache = {};
  function emote(kind) {
    if (emoteCache[kind]) return emoteCache[kind];
    const g = new Grid(11, 11);
    g.rect(1, 1, 9, 7, '#ffffff').rect(2, 0, 7, 1, '#ffffff').rect(2, 8, 7, 1, '#ffffff').rect(0, 2, 1, 5, '#ffffff').rect(10, 2, 1, 5, '#ffffff');
    g.px([[4, 9], [5, 9], [4, 10]], '#ffffff');
    const ic = ICONS[kind] || ICONS['!'];
    g.str(ic, 3, 2);
    // outline only the bubble silhouette
    const o = new Grid(13, 13); for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) o.set(x + 1, y + 1, g.get(x, y));
    o.outline();
    return (emoteCache[kind] = o.canvas());
  }

  // ---------------- Critters ----------------
  // Regular animals: 18x18. Rares: 26x26. Facing right; feet/ground on the bottom row. Anchor bottom-centre.
  const critterCache = {};
  const MK = g => (x, y) => g.filled(x, y);
  const CR = {
    // ----- meadow -----
    sparrow(g) {
      const brown = ['#d9a066', '#b8743a', '#8f563b'];
      g.poly([[3, 10], [0.5, 8], [1, 12]], '#8f563b');
      g.ell(7.5, 11, 4.6, 3.6, brown); g.ell(11.5, 7.6, 2.9, 2.7, brown);
      g.poly([[14, 7], [16.5, 8], [14, 9]], '#f6c83a');
      g.px([[7, 15], [9, 15], [7, 16], [9, 16]], '#df7126');
      g.outline();
      g.ell(7.6, 12.5, 2.6, 1.5, '#eec39a', 0, MK(g)); g.ell(6.2, 10.4, 2.6, 1.3, '#663931', 0.3, MK(g));
      g.px([[12, 7]], INK); g.set(13, 9, '#f4a3b8');
    },
    hare(g) {
      g.ell(10.4, 4.2, 1, 3, RAMPS.cloud, -0.2); g.ell(12.6, 4.4, 1, 3, RAMPS.cloud, 0.25);
      g.ell(7, 12, 4.6, 3.3, RAMPS.cloud); g.ell(11.4, 8.8, 2.8, 2.6, RAMPS.cloud); g.ell(2.6, 11, 1.5, 1.5, '#ffffff');
      g.ell(6, 15.4, 2, 1, '#dfe8fb'); g.ell(11, 15.2, 1.2, 1.2, '#dfe8fb');
      g.outline();
      g.px([[10, 3], [10, 4], [13, 4], [13, 5]], '#f7b6c8'); g.px([[12, 8]], INK); g.px([[14, 9]], '#e07ba0'); g.set(12, 10, '#f7b6c8');
    },
    ram(g) {
      for (const [cx, cy, r] of [[4.5, 10.5, 3], [7.5, 9, 3.2], [10.5, 10.5, 3], [6, 12.6, 3], [9.4, 12.6, 3]]) g.ell(cx, cy, r, r, RAMPS.cloud);
      g.ell(13, 9.2, 2, 2.6, RAMPS.slate);
      g.rect(5, 14, 1, 3, '#595a70'); g.rect(9, 14, 1, 3, '#595a70');
      g.outline();
      g.px([[11, 6], [12, 5], [13, 5], [14, 6], [14, 7], [13, 7]], '#d9a066'); g.px([[12, 6]], '#f6d2ad'); g.px([[14, 8]], INK);
    },
    tortoise(g) {
      g.ell(14, 11.6, 2, 1.7, ['#c3f08a', '#99e550', '#6abe30']);
      g.ell(4, 14.6, 1.4, 1.4, '#99e550'); g.ell(10.5, 14.6, 1.4, 1.4, '#99e550');
      g.ell(7.4, 12, 5.8, 4.4, RAMPS.moss, 0, (x, y) => y <= 13);
      g.outline();
      g.px([[5, 10], [6, 10], [8, 9], [9, 9], [10, 11], [4, 12], [7, 12]], '#c3d66a'); g.px([[15, 11]], INK);
    },
    fox(g) {
      const O = RAMPS.clay, cr = '#fbf3dc';
      g.ell(3.8, 9.6, 2.5, 4.4, O, 0.5);
      g.ell(8.6, 11.8, 4.6, 3.1, O);
      g.rect(6, 13, 2, 4, O[2]); g.rect(10, 13, 2, 4, O[1]);
      g.ell(12.8, 7.8, 3, 2.8, O);
      g.poly([[13.5, 7.6], [17, 9.2], [13.5, 10.6]], O[1]);
      g.poly([[10.2, 7], [10.8, 2.8], [13, 5.6]], O[1]); g.poly([[12.8, 5.4], [14.8, 2.8], [15.2, 7]], O[1]);
      g.outline();
      for (let y = 0; y < 18; y++) for (let x = 0; x < 6; x++) if (g.filled(x, y) && y <= 6) g.set(x, y, cr);
      g.px([[6, 16], [7, 16], [10, 16], [11, 16], [6, 15], [7, 15], [10, 15], [11, 15]], '#45283c');
      g.ell(14.8, 9.8, 2, 1, cr, 0, MK(g)); g.ell(11, 12.6, 1.8, 1.5, cr, 0, MK(g));
      g.px([[13, 7]], INK); g.px([[16, 9]], INK); g.px([[11, 4], [11, 5], [14, 4], [14, 5]], '#663931');
    },
    bee(g) {
      const WG = ['#ffffff', '#e4f4ff', '#a8c8e8'], body = new Set();
      g.ell(7.4, 5, 2.2, 3, WG, -0.4); g.ell(10.6, 4.8, 2, 2.8, WG, 0.35);
      g.poly([[3.4, 10.6], [0.8, 11.6], [3.4, 12.6]], '#45283c');
      g.ell(9, 11, 6, 4.2, RAMPS.sun, 0, (x, y) => { body.add(x + ',' + y); return true; });
      g.px([[7, 15], [7, 16], [11, 15], [11, 16]], '#45283c');
      g.outline();
      for (const k of body) { const [x, y] = k.split(',').map(Number); if ((x === 6 || x === 7 || x === 10) && g.filled(x, y)) g.set(x, y, '#45283c'); }
      g.px([[13, 10]], INK); g.set(13, 9, INK); g.px([[14, 12]], '#f4a3b8'); g.px([[15, 12]], INK);
      g.px([[14, 6], [14, 5], [15, 4], [16, 6], [17, 5]], INK); g.px([[15, 3], [17, 4]], '#45283c');
    },
    duck(g) {
      const grey = ['#eef0f6', '#c0c6d4', '#8c93a8'], brown = ['#e0a070', '#b86a3a', '#7a3e22'], green = ['#6ad0a0', '#2f9a6a', '#1f5a48'];
      g.poly([[3.4, 9.6], [0.8, 7.4], [1.4, 10.6], [4, 12]], grey[1]);
      g.px([[7, 15], [7, 16], [8, 16], [10, 15], [10, 16], [11, 16]], '#df7126');
      g.ell(8, 11.6, 5.4, 3.4, grey);
      g.ell(11.8, 11.2, 2.6, 2.8, brown);
      g.rect(12, 8, 2, 2, green[1]);
      g.ell(12.8, 6.6, 2.6, 2.5, green);
      g.poly([[14.6, 6.8], [17.2, 7.4], [17.2, 8.6], [14.6, 8.8]], '#f6c83a');
      g.outline();
      g.px([[12, 9], [13, 9]], '#ffffff');
      g.ell(6.6, 11.2, 3, 1.6, '#9aa2b4', 0.1, MK(g)); g.px([[8, 11], [9, 11]], '#5b6ee1');
      g.px([[13, 6]], INK); g.set(1, 8, INK);
    },
    koi(g) {
      const W = ['#ffffff', '#f4f0ec', '#c8c0c0'], O = ['#ffb070', '#f07830', '#b84a1c'];
      g.poly([[4.5, 10.6], [0.8, 6.4], [2.4, 10.8], [0.8, 15.2]], O[1]);
      g.poly([[7, 8.4], [9.4, 5.4], [11.6, 8.2]], O[1]);
      g.ell(9.8, 11, 6, 3.3, W);
      g.ell(9, 14.2, 1.6, 0.9, O[1], 0.5);
      g.outline();
      g.ell(8, 10, 2.1, 1.5, O[1], 0, MK(g)); g.ell(12.8, 9.4, 1.4, 1, '#e8404a', 0, MK(g)); g.ell(5.6, 12, 1.2, 1, O[0], 0, MK(g));
      g.px([[14, 10]], INK); g.px([[16, 11]], '#b84a1c'); g.px([[2, 8], [2, 13]], O[0]);
    },
    owl(g) {
      const Bn = ['#c8a07a', '#8a6848', '#5a4030'], F = '#f0e0c4';
      g.poly([[4, 6], [3.8, 1.6], [7.2, 4.4]], Bn[1]); g.poly([[14, 6], [14.2, 1.6], [10.8, 4.4]], Bn[1]);
      g.ell(9, 10.4, 5.6, 5.8, Bn);
      g.ell(3.6, 11.4, 1.6, 3.6, Bn, 0.15); g.ell(14.4, 11.4, 1.6, 3.6, Bn, -0.15);
      g.px([[7, 16], [8, 16], [10, 16], [11, 16]], '#f6c83a');
      g.outline();
      g.ell(9, 8, 4.4, 2.8, F, 0, MK(g));
      for (const cx of [7, 11]) { g.ell(cx, 8, 1.8, 1.8, '#fbf236', 0, MK(g)); g.px([[cx - 1, 7], [cx, 7], [cx - 1, 8], [cx, 8]], INK); g.set(cx - 1, 7, '#ffffff'); }
      g.px([[8, 10], [9, 10]], '#df7126');
      g.ell(9, 13.2, 3, 2.3, F, 0, MK(g)); g.px([[8, 12], [10, 12], [7, 14], [9, 14], [11, 14]], '#c8a07a');
    },
    firefly(g) {
      const body = ['#8c7ab0', '#5a4a78', '#3a2a50'];
      g.ell(9, 6.4, 2.6, 3.2, ['#ffffff', '#e0ecff', '#a8b8d8'], -0.5);
      g.ell(5.8, 11, 3.6, 3.2, RAMP_X.glowY);
      g.ell(10.4, 10.2, 2.8, 2.4, body);
      g.ell(13.4, 9.4, 2.4, 2.3, RAMPS.berry);
      g.outline();
      g.px([[14, 9]], INK); g.set(13, 8, '#ffffff');
      g.px([[14, 6], [15, 5], [15, 4], [13, 6], [12, 5]], INK);
      g.px([[9, 13], [9, 14], [11, 13], [12, 14]], '#3a2a50');
      g.px([[4, 10], [5, 10], [4, 11]], '#ffffff');
      for (const deg of [150, 190, 230, 115, 270]) { const a = deg * Math.PI / 180, x = Math.floor(5.8 + Math.cos(a) * 5.3), y = Math.floor(11 + Math.sin(a) * 5); if (g.get(x, y) === null) g.set(x, y, '#fff27a'); }
    },
    // ----- beach -----
    crab(g) {
      const Rr = RAMP_X.crab;
      for (const s of [0, 1]) {
        const X = x => (s ? 17 - x : x);
        g.px([[X(4), 12], [X(3), 13], [X(2), 14], [X(2), 15], [X(5), 13], [X(4), 14], [X(4), 15], [X(4), 16]], Rr[2]);
      }
      g.ell(8.5, 11.4, 5.4, 3.4, Rr);
      stroke(g, [[4.4, 10.6], [2.8, 9]], 0.8, 0.8, Rr[1]); stroke(g, [[12.6, 10.6], [14.2, 9]], 0.8, 0.8, Rr[1]);
      const C = new Grid(18, 18);
      for (const cx of [2.6, 14.4]) { C.ell(cx, 7, 2.4, 2.2, Rr); C.poly([[cx, 7], [cx - 1.4, 3.6], [cx + 1.2, 3.6]], null); }
      piece(g, t => t.merge(C));
      g.rect(6, 5, 1, 4, Rr[1]); g.rect(11, 5, 1, 4, Rr[1]);
      g.ell(6.5, 3.6, 1.4, 1.4, '#ffffff'); g.ell(11.5, 3.6, 1.4, 1.4, '#ffffff');
      g.outline();
      g.px([[6, 3], [6, 4], [11, 3], [11, 4]], INK); g.px([[7, 12], [8, 13], [9, 12]], INK); g.px([[5, 12], [11, 12]], '#ffc0b0'); g.px([[6, 10], [7, 10]], '#ffc8b0');
    },
    seagull(g) {
      const W = RAMPS.cloud, S = ['#c8d0dc', '#9aa4b8', '#646c88'];
      g.rect(7, 14, 1, 3, '#df7126'); g.rect(10, 14, 1, 3, '#df7126');
      g.ell(8.4, 11, 5, 3.4, W);
      g.ell(11.6, 9, 2, 2.2, W); g.ell(12.4, 6.8, 2.7, 2.6, W);
      g.poly([[3, 9], [11, 9.2], [10, 12.6], [0.8, 11.4]], S[1]);
      g.poly([[14.6, 6.6], [17.4, 7.2], [17.2, 8.3], [14.6, 8.3]], '#f6c83a');
      g.outline();
      g.px([[1, 11], [2, 11], [2, 10], [3, 10]], '#323c39'); g.px([[5, 10], [6, 10], [7, 10]], S[0]);
      g.px([[16, 8]], '#d24552'); g.px([[13, 6]], INK);
    },
    otter(g) {
      g.ell(2.8, 13.8, 2.8, 1.1, '#663931', 0.35);
      g.ell(7.6, 11.8, 5, 3.3, RAMPS.cocoa); g.ell(12.2, 9, 2.9, 2.7, RAMPS.cocoa); g.ell(10.4, 6.2, 0.9, 0.9, '#8f563b');
      g.ell(6, 15.2, 1.4, 1, '#5a3322'); g.ell(10, 15.2, 1.4, 1, '#5a3322');
      g.ell(13.6, 12.6, 1.2, 1, RAMPS.slate);
      g.outline();
      g.ell(13.4, 10, 1.6, 1.1, '#eec39a', 0, MK(g)); g.ell(7.5, 13, 3, 1.5, '#c48a5c', 0, MK(g));
      g.px([[12, 8]], INK); g.px([[14, 9]], INK); g.set(11, 10, '#f4a3b8');
    },
    seal(g) {
      const S = ['#d8dee8', '#a4acc0', '#6a7290'];
      g.poly([[3.5, 12.4], [0.8, 10], [1.2, 13], [0.8, 15.8]], S[2]);
      g.ell(8.6, 13, 6.4, 3.2, S);
      g.ell(13, 10, 3.2, 3, S);
      g.ell(10.5, 15.4, 2.2, 1, S[2], 0.2);
      g.outline();
      g.ell(15, 11.2, 1.6, 1.1, '#eef0f6', 0, MK(g)); g.px([[16, 10]], INK); g.px([[13, 9], [13, 10]], INK); g.set(13, 9, '#ffffff'); g.set(14, 9, INK);
      g.px([[15, 12], [16, 12]], '#8890a8'); g.set(12, 11, '#f4a3b8');
      g.ell(8, 15, 4.6, 0.9, '#e8ecf2', 0, MK(g)); g.px([[6, 11], [8, 10], [5, 13], [10, 11]], S[2]);
    },
    dolphin(g) {
      const Bl = ['#a8d8f8', '#5f98d8', '#34569e'];
      g.poly([[4.4, 11.8], [0.8, 10.6], [2.4, 13.4], [1.8, 16.2]], Bl[2]);
      g.poly([[7.4, 7], [8, 3.6], [10.6, 6.6]], Bl[1]);
      g.ell(4.8, 12.2, 3, 1.6, Bl, -0.15);
      g.ell(9.6, 9.8, 5.6, 3.3, Bl, -0.4);
      g.ell(15.6, 6.8, 1.9, 1, Bl[1], -0.4);
      g.ell(9.6, 12.8, 1.8, 0.9, Bl[2], 0.7);
      g.outline();
      g.ell(10.6, 11.4, 4.4, 1.3, '#e4f2ff', -0.4, MK(g)); g.ell(5, 13.2, 2, 0.6, '#e4f2ff', -0.15, MK(g));
      g.px([[13, 7]], INK); g.px([[15, 9], [16, 8]], Bl[2]); g.px([[9, 7], [10, 7]], Bl[0]);
    },
    starfish(g) {
      g.poly(starPts(9, 10.4, 7.4, 3.3, 5), '#f08a6a');
      g.outline();
      shade(g, 9, 10.4, 7.6, 7.6, ['#ffb898', '#f08a6a', '#c0503a']);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) if (g.filled(x, y) && (x * 3 + y * 5) % 7 === 0) g.set(x, y, '#ffe0c8');
      g.px([[7, 9], [7, 10], [10, 9], [10, 10]], INK); g.set(7, 9, '#ffffff'); g.set(10, 9, '#ffffff');
      g.px([[6, 11], [11, 11]], '#ff9ab0'); g.px([[8, 11], [9, 11]], INK);
    },
    seaturtle(g) {
      const Sh = ['#b8e070', '#5fa850', '#2f6a48'], Sk = ['#d8f0b0', '#9ccc78', '#5a8a4a'];
      g.poly([[9, 11], [12.6, 11.6], [8.6, 16.4], [6.2, 15.8]], Sk[1]);
      g.ell(2.8, 12.2, 1.9, 1, Sk[1], 0.3);
      g.ell(14.4, 9.2, 2.4, 2, Sk);
      g.ell(8, 9.8, 5.4, 3.8, Sh);
      g.outline();
      g.px([[6, 8], [7, 7], [8, 7], [9, 8], [9, 9], [8, 10], [7, 10], [6, 9]], Sh[2]); g.px([[7, 8], [8, 8], [7, 9]], Sh[0]);
      g.px([[4, 9], [11, 9], [12, 10], [10, 11], [5, 11], [4, 11]], Sh[2]);
      g.ell(8, 12.8, 5, 0.7, '#e8e0a0', 0, MK(g));
      g.px([[15, 8]], INK); g.px([[16, 10]], Sk[2]); g.px([[8, 14], [9, 13]], Sk[0]);
    },
    // ----- moonlit -----
    bat(g) {
      const Bd = ['#b8a8d8', '#8a78b0', '#5a4a78'];
      const wl = [[7, 8.5], [3, 5.2], [0.8, 6], [1.2, 10.4], [2.6, 9.4], [3.4, 12], [5, 10.8], [6.4, 13]];
      g.poly(wl, '#6a5a90'); g.poly(mirX(wl, 18), '#6a5a90');
      g.poly([[6.4, 7.2], [6.2, 2.8], [8.6, 5.6]], Bd[1]); g.poly(mirX([[6.4, 7.2], [6.2, 2.8], [8.6, 5.6]], 18), Bd[1]);
      g.ell(9, 9.8, 3.2, 3.6, Bd);
      g.px([[8, 14], [9, 14]], Bd[2]);
      g.outline();
      for (const [x1, y1] of [[1, 6], [2, 9], [3, 11]]) { line(g, 6, 9, x1, y1, '#44365e'); line(g, 11, 9, 17 - x1, y1, '#44365e'); }
      g.ell(9, 11, 1.6, 1.6, Bd[0], 0, MK(g));
      g.px([[7, 9], [10, 9]], '#fff27a'); g.px([[8, 11], [9, 11]], INK); g.set(8, 12, '#ffffff'); g.px([[6, 5], [11, 5]], '#e07ba0');
    },
    wolf(g) {
      const Wg = ['#c8d0e8', '#8890b0', '#50587a'], L2 = '#eef2fb';
      g.ell(3, 13.6, 2.8, 1.6, Wg, -0.35);
      g.ell(7.2, 12.8, 4.2, 3.6, Wg);
      g.ell(11, 10, 2.8, 4, Wg);
      g.rect(10, 13, 3, 4, Wg[1]);
      g.ell(12.2, 6.4, 2.9, 2.6, Wg);
      g.poly([[13.4, 5.6], [17.2, 7], [17, 8.4], [13.4, 8.6]], Wg[1]);
      g.poly([[10, 5], [10.2, 1.6], [12.2, 4]], Wg[1]); g.poly([[12.4, 4], [13.8, 1.6], [14.2, 5.2]], Wg[1]);
      g.ell(5.8, 16, 1.8, 0.8, Wg[1]);
      g.outline();
      g.ell(11.8, 10.6, 1.2, 2.6, L2, 0, MK(g)); g.ell(15.4, 7.8, 1.6, 0.7, L2, 0, MK(g));
      g.px([[16, 7]], INK); g.px([[13, 6]], '#fff27a'); g.set(13, 5, INK);
      g.px([[11, 3], [13, 3]], '#44365e'); g.px([[10, 16], [12, 16]], L2); g.px([[1, 13], [2, 13]], L2);
    },
    moth(g) {
      const Wg = ['#f8f0ff', '#d4c0ec', '#9a84c0'], Fz = ['#fffbf0', '#f0e4c8', '#c0a888'];
      for (const s of [-1, 1]) { const X = x => 9 + s * (9 - x); piece(g, t => t.ell(X(5.4), 12.2, 2.9, 2.6, Wg, s * -0.4)); piece(g, t => t.ell(X(4.6), 7.4, 4, 3.6, Wg, s * 0.35)); }
      g.ell(9, 10.8, 2.3, 4.2, Fz); g.ell(9, 6.6, 2.7, 2.3, Fz);
      g.outline();
      for (const cx of [4, 13]) { g.px([[cx, 7], [cx + 1, 7], [cx, 8], [cx + 1, 8]], '#9a6ad0'); g.set(cx, 7, '#fff27a'); }
      g.px([[5, 12], [12, 12]], '#b8a0d8'); g.px([[2, 6], [15, 6]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
      g.px([[8, 10], [9, 12], [8, 14]], '#d8c8a8');
      g.px([[7, 6], [10, 6]], INK); g.px([[7, 7], [10, 7]], '#f4a3b8');
      g.px([[7, 3], [6, 2], [5, 1], [5, 3], [7, 1], [10, 3], [11, 2], [12, 1], [12, 3], [10, 1]], '#5a4a78');
    },
    hedgehog(g) {
      const Sp = ['#b08868', '#7a5238', '#4a2e20'], Fc = ['#fff0dc', '#f0c8a0', '#b8845a'];
      for (let deg = 160; deg <= 350; deg += 24) {
        const a = deg * Math.PI / 180, rim = t => [8.6 + 4.6 * Math.cos(t), 11.2 + 3.8 * Math.sin(t)];
        g.poly([rim(a - 0.3), rim(a + 0.3), [8.6 + 7.4 * Math.cos(a), 11.2 + 6.4 * Math.sin(a)]], Sp[2]);
      }
      g.ell(8.6, 11.4, 5.6, 4.4, Sp);
      g.ell(12.8, 12, 3.2, 3, Fc); g.ell(15.2, 12.8, 1.6, 1.2, Fc[1]); g.ell(11.4, 8.8, 1, 1, Fc[1]);
      g.px([[6, 16], [7, 16], [11, 16], [12, 16]], Fc[2]);
      g.outline();
      for (let y = 0; y < 18; y++) for (let x = 0; x < 11; x++) { const c = g.get(x, y); if ((c === Sp[1] || c === Sp[0] || c === Sp[2]) && (x + y) % 3 === 0) g.set(x, y, Sp[0]); }
      g.px([[13, 11]], INK); g.px([[16, 12]], INK); g.set(13, 13, '#f4a3b8');
    },
    jellyfish(g) {
      const J = ['#ffe0f8', '#f0a0e0', '#b060c0'];
      g.ell(9, 7.6, 5.8, 5, J, 0, (x, y) => y <= 8);
      for (const cx of [4.2, 6.8, 9, 11.2, 13.8]) g.ell(cx, 9, 1.3, 1, J[1]);
      g.outline();
      for (const [x0, ph, col] of [[5, 0, J[1]], [7, 1.5, '#c9a2f0'], [10, 3, '#c9a2f0'], [12, 4.5, J[1]]]) for (let y = 11; y <= 16; y++) g.set(x0 + Math.round(Math.sin(y * 1.1 + ph) * 0.8), y, col);
      g.px([[8, 11], [9, 11], [8, 12], [9, 13], [8, 14]], J[0]);
      g.px([[6, 6], [6, 7], [11, 6], [11, 7]], INK); g.px([[5, 8], [12, 8]], '#ff9ac0'); g.px([[8, 8], [9, 8]], INK);
      g.px([[5, 4], [6, 3], [7, 3]], '#ffffff');
      g.px([[2, 3], [16, 5], [1, 10], [16, 12]], '#fff0ff');
    },
    // ----- candy -----
    gummybear(g) {
      const G = ['#ffa8b0', '#e84858', '#a01c38'];
      g.ell(5.6, 3.6, 1.5, 1.5, G); g.ell(12.4, 3.6, 1.5, 1.5, G);
      g.ell(9, 6.2, 3.9, 3.2, G);
      g.ell(9, 11.6, 3.9, 3.6, G);
      g.ell(4.8, 10.4, 1.3, 2, G, 0.45); g.ell(13.2, 10.4, 1.3, 2, G, -0.45);
      g.ell(6.6, 15, 1.8, 1.6, G); g.ell(11.4, 15, 1.8, 1.6, G);
      g.outline();
      g.ell(9, 12.2, 2.2, 2, G[0], 0, MK(g)); g.ell(9, 7.6, 1.5, 1, '#ffc8cc', 0, MK(g));
      g.px([[6, 4], [7, 4], [6, 5], [6, 10], [6, 11]], '#fff0f2');
      g.px([[7, 6], [10, 6]], INK); g.px([[8, 7], [9, 7]], '#a01c38');
    },
    cottonsheep(g) {
      const P = ['#fff4fa', '#ffc8e0', '#e08cb8'], Fc = ['#fff0dc', '#f0d0b0', '#b8906a'];
      g.rect(5, 13, 1, 4, '#8a6a8a'); g.rect(10, 13, 1, 4, '#8a6a8a');
      for (const [cx, cy, r] of [[3.6, 8.6, 2.2], [4.5, 10.8, 3], [7.5, 8.8, 3.2], [10.6, 10.2, 3], [6, 12.6, 3], [9.4, 12.8, 3]]) g.ell(cx, cy, r, r, P);
      g.ell(13.2, 9.4, 2.2, 2.8, Fc); g.ell(11.8, 7.8, 1.4, 0.8, Fc[1], -0.4);
      g.ell(13, 6.6, 1.7, 1.3, P);
      g.outline();
      g.px([[14, 9]], INK); g.px([[15, 11]], '#f4a3b8'); g.px([[7, 10], [4, 12], [10, 13]], '#9fd8ff'); g.px([[9, 9], [6, 14]], '#fff27a');
    },
    lollisnail(g) {
      g.ell(9.6, 14.6, 6.8, 2, RAMPS.mint);
      g.ell(14.6, 12, 1.8, 2.6, RAMPS.mint);
      stroke(g, [[14, 10], [13.2, 6.8]], 0.5, 0.5, RAMPS.mint[1]); stroke(g, [[15.4, 10], [16.2, 7]], 0.5, 0.5, RAMPS.mint[1]);
      g.ell(13.2, 6.2, 1.1, 1.1, '#ffffff'); g.ell(16.3, 6.4, 1.1, 1.1, '#ffffff');
      g.ell(7.4, 9, 4.8, 4.8, '#fff8fb');
      g.outline();
      for (let t = 0; t < 2.2 * Math.PI * 2; t += 0.04) { const r = 0.3 + t * 0.3, x = Math.floor(7.4 + r * Math.cos(t)), y = Math.floor(9 + r * Math.sin(t)); if (r < 4.5 && g.filled(x, y)) g.set(x, y, '#e8445a'); }
      for (let y = 0; y < 18; y++) for (let x = 0; x < 13; x++) if (g.get(x, y) === '#fff8fb' && Math.hypot(x + 0.5 - 7.4, y + 0.5 - 9) > 3.5 && x + y > 16) g.set(x, y, '#f4d0dc');
      g.px([[13, 6], [16, 6]], INK); g.px([[15, 13]], INK); g.px([[16, 12]], '#f4a3b8');
    },
    sugarfinch(g) {
      const P = ['#ffd8e8', '#f490c0', '#b8508a'];
      g.poly([[3.6, 10.6], [0.8, 8.4], [0.8, 12.2], [3.6, 12.8]], '#9fd8ff');
      g.px([[7, 15], [7, 16], [9, 15], [9, 16]], '#df7126');
      g.ell(8, 11.2, 4.8, 3.8, P);
      g.ell(11.8, 7.6, 3, 2.8, P);
      g.poly([[10.2, 5.4], [10.4, 2.2], [12.4, 4.8]], P[1]);
      g.poly([[14.4, 7.2], [16.8, 8], [14.4, 9]], '#fff27a');
      g.outline();
      g.ell(6.4, 11, 2.8, 1.8, ['#c8fff0', '#a6f2d3', '#52c7a8'], 0.3, MK(g));
      g.ell(8.8, 13.2, 2.8, 1.3, '#fff4f8', 0, MK(g));
      g.px([[8, 8], [10, 10], [5, 13], [11, 12]], '#fbf236'); g.px([[9, 9], [12, 11]], '#5fcde4'); g.px([[6, 9]], '#99e550');
      g.px([[12, 7]], INK); g.px([[13, 9]], '#ff8ab0'); g.px([[1, 9], [1, 11]], '#5fcde4');
    },
    sodafish(g) {
      const S = ['#c8fff0', '#5fdcc8', '#2f8f98'];
      g.poly([[4.4, 10.8], [1, 7.2], [2.2, 10.8], [1, 14.4]], '#f07a9a');
      g.poly([[7, 8.4], [7.6, 5], [8.8, 7], [10, 4.6], [11, 7], [12.2, 5.2], [12.4, 8.4]], '#e8445a');
      g.ell(9.8, 11, 5.8, 3.6, S);
      g.ell(8.6, 14.4, 1.5, 0.8, '#f07a9a', 0.5);
      g.outline();
      g.ell(10, 12.8, 4, 1.2, S[0], 0, MK(g));
      g.px([[8, 11], [10, 12], [6, 10], [11, 9], [12, 13]], '#ffffff');
      g.px([[13, 10]], INK); g.set(13, 9, INK); g.px([[15, 11]], '#2f8f98'); g.px([[8, 6], [10, 5]], '#ff9ab0');
      const Bb = new Grid(18, 18); Bb.rect(15, 3, 2, 2, '#e8fcff'); Bb.rect(16, 7, 1, 1, '#e8fcff'); Bb.outline('#2f8f98');
      for (let i = 0; i < Bb.a.length; i++) if (Bb.a[i] && !g.a[i]) g.a[i] = Bb.a[i];
      g.set(15, 3, '#ffffff');
    },
    jellyocto(g) {
      const J = ['#f4d8ff', '#c08ae8', '#7a4ab0'];
      for (const [bx, s, far] of [[4.8, -1, 1], [7.6, -1, 0], [10.4, 1, 0], [13.2, 1, 1]]) {
        const sp = far ? 1.6 : 0.8;
        stroke(g, [[bx, 9.6], [bx + s * 0.6 * sp, 12.6], [bx + s * 1.6 * sp, 14.8], [bx + s * (2.4 * sp + 0.6), 13.6]], 1.4, 0.8, J[1]);
      }
      g.ell(9, 6.8, 5.2, 4.8, J);
      g.outline();
      g.px([[5, 4], [6, 3], [5, 5], [7, 3]], '#ffffff');
      g.px([[7, 6], [7, 7], [10, 6], [10, 7]], INK); g.set(7, 6, '#ffffff'); g.set(10, 6, '#ffffff');
      g.px([[5, 8], [12, 8]], '#ff9ac0'); g.px([[8, 9], [9, 9]], INK);
      for (const [x, y] of [[4, 12], [7, 13], [11, 13], [14, 12], [3, 14], [15, 14]]) if (g.filled(x, y)) g.set(x, y, J[0]);
    },
    // ----- meadow (more) -----
    frog(g) {
      const G = ['#b4ec6c', '#5cb43a', '#2f7a4a'], P = '#eef6b8';
      g.ell(4.6, 12.8, 3.2, 2.9, G);
      g.ell(4.6, 15.8, 3.2, 0.9, G[2]);
      g.ell(9.4, 12.4, 5.4, 3.6, G);
      g.ell(12.6, 15.6, 1.8, 0.9, G[1]);
      g.ell(12.4, 9.6, 4.4, 2.9, G);
      piece(g, t => { t.ell(10.4, 6.8, 2, 2, G); t.ell(14.4, 6.8, 2, 2, G); });
      g.outline();
      g.ell(11.8, 13.4, 3.6, 2, P, 0, (x, y) => g.filled(x, y) && y >= 12);
      for (const cx of [10, 14]) { g.px([[cx - 1, 6], [cx, 6], [cx + 1, 6], [cx - 1, 7], [cx, 7], [cx + 1, 7]], '#fbfbe0'); g.px([[cx, 6], [cx + 1, 6], [cx, 7], [cx + 1, 7]], INK); g.set(cx, 6, '#ffffff'); g.px([[cx - 1, 5], [cx, 5], [cx + 1, 5]].filter(([x, y]) => g.filled(x, y)), G[0]); }
      g.px([[12, 11], [13, 11], [14, 11], [15, 11], [16, 10]], INK); g.set(11, 10, '#f4a3b8');
      g.px([[5, 11], [7, 10], [3, 13]].filter(([x, y]) => g.filled(x, y)), G[2]); g.px([[9, 9], [8, 10]].filter(([x, y]) => g.filled(x, y)), G[0]);
    },
    squirrel(g) {
      const O = ['#f2b474', '#c8742e', '#86461c'], cr = '#fbe8c8';
      piece(g, t => { t.ell(4.4, 9.8, 3.6, 5.4, O, 0.12); t.ell(6.4, 3.6, 2.8, 2.2, O, 0.5); });
      g.ell(9.8, 12.4, 3.8, 3.4, O);
      g.ell(7.8, 15.6, 2.4, 1, O[2]); g.ell(12.4, 15.6, 1.4, 1, O[1]);
      g.ell(12.8, 8.4, 3, 2.7, O);
      g.ell(15.2, 9.6, 1.5, 1.2, O[1]);
      g.poly([[10.8, 6.8], [11.2, 3.2], [13.4, 6]], O[1]);
      g.outline();
      g.ell(12, 13, 1.8, 2.4, cr, 0, MK(g)); g.ell(15, 10.4, 1.5, 0.8, cr, 0, MK(g));
      g.px([[3, 7], [3, 8], [3, 9], [4, 10], [4, 11], [4, 4], [5, 3], [6, 3]].filter(([x, y]) => g.filled(x, y)), O[0]);
      g.px([[5, 13], [6, 12], [2, 11]].filter(([x, y]) => g.filled(x, y)), O[2]);
      g.px([[12, 5]], '#663931'); g.px([[13, 8], [13, 7]], INK); g.set(13, 7, '#ffffff'); g.set(14, 7, INK); g.px([[16, 9]], INK); g.set(14, 10, '#f4a3b8');
    },
    butterfly(g) {
      const Or = ['#ffd890', '#f6983a', '#c8601c'], Ye = ['#fff8b4', '#fbd84a', '#d0a02a'], Bd = ['#7a5a70', '#45283c', '#2a1830'];
      for (const s of [-1, 1]) {
        const X = x => 9 + s * (9 - x);
        piece(g, t => t.ell(X(5.6), 12.2, 2.7, 2.5, Ye, s * -0.5));
        piece(g, t => t.ell(X(4.8), 7, 4.3, 3.6, Or, s * 0.45));
      }
      g.ell(9, 10.6, 1.1, 4, Bd); g.ell(9, 5.9, 1.6, 1.5, Bd);
      g.outline();
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { const c = g.get(x, y); if ((c === Or[0] || c === Or[1] || c === Or[2]) && Math.hypot(Math.abs(x + 0.5 - 9) - 6.4, (y + 0.5 - 4.2) * 1.25) < 2.1) g.set(x, y, Bd[1]); }
      g.px([[2, 5], [15, 5], [4, 3], [13, 3]].filter(([x, y]) => g.get(x, y) === Bd[1]), '#ffffff');
      g.px([[6, 8], [11, 8]].filter(([x, y]) => g.filled(x, y)), Ye[0]); g.px([[5, 12], [12, 12]].filter(([x, y]) => g.filled(x, y)), Or[1]);
      g.px([[8, 5], [10, 5]], '#ffffff'); g.px([[8, 3], [7, 2], [6, 1], [10, 3], [11, 2], [12, 1]], INK); g.px([[5, 1], [13, 1]], '#45283c');
    },
    // ----- beach (more) -----
    pelican(g) {
      const W = RAMPS.cloud, Gy = ['#c8d0dc', '#9aa4b8', '#646c88'], Bk = '#f6c83a', Pc = ['#ffd49a', '#f6a04a', '#c8661c'];
      g.poly([[3.2, 10], [0.8, 8.4], [1, 11.8]], Gy[1]);
      g.rect(6, 14, 1, 2, '#f6a04a'); g.rect(9, 14, 1, 2, '#f6a04a');
      g.ell(7, 11.2, 4.8, 3.2, W);
      g.ell(10, 7.6, 1.5, 3, W, 0.35);
      g.ell(10.8, 4.8, 2.4, 2.2, W);
      g.ell(14.2, 8.2, 2.8, 1.7, Pc, 0.2);
      g.poly([[12.4, 4.2], [17.4, 5.8], [17.2, 7], [12.4, 6.6]], Bk);
      g.poly([[3, 9.4], [10.4, 9], [9.4, 12.8], [1.4, 12]], Gy[1]);
      g.outline();
      g.px([[1, 11], [2, 11], [2, 10]], '#323c39'); g.px([[4, 10], [5, 10], [6, 10]], Gy[0]); g.px([[8, 12], [7, 12]], Gy[2]);
      g.px([[13, 6], [14, 6], [15, 6], [16, 6]], '#c7861c'); g.set(17, 6, '#df7126');
      g.px([[11, 4]], INK); g.set(10, 3, '#fff27a'); g.set(9, 3, '#fff27a'); g.px([[14, 8], [15, 8]], Pc[0]);
    },
    seahorse(g) {
      const S = ['#fff08a', '#f6b83a', '#c8721c'], F = ['#fffbe0', '#ffe8a0', '#e0b060'];
      g.ell(5.8, 8.6, 1.7, 2.4, F, 0.25);
      g.poly([[7.6, 3.6], [8, 0.8], [9.8, 2.8]], S[1]);
      stroke(g, [[9, 12], [8.4, 14.4], [9.4, 16], [11.4, 15.8], [12, 14.2], [10.8, 13.4]], 1.8, 0.6, S[1]);
      g.ell(9.8, 9.4, 3.1, 3.9, S, 0.15);
      g.ell(10, 4.8, 2.6, 2.4, S);
      stroke(g, [[11.6, 5.6], [14.8, 6.4]], 0.9, 0.8, S[1]); g.ell(15.3, 6.4, 1, 1.1, S[1]);
      g.outline();
      g.ell(11.4, 9.8, 1.3, 3, F[0], 0.15, MK(g));
      for (const y of [8, 10, 12]) if (g.filled(11, y)) { g.set(11, y, F[2]); if (g.filled(12, y)) g.set(12, y, F[2]); }
      g.px([[7, 6], [6, 9], [7, 12]].filter(([x, y]) => g.filled(x, y)), S[2]);
      g.px([[5, 7], [5, 9]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
      g.px([[10, 4], [11, 4]], INK); g.set(10, 4, '#ffffff'); g.set(11, 3, INK); g.set(12, 6, '#f4a3b8'); g.set(8, 2, S[0]);
    },
    pufferfish(g) {
      const Y = ['#fffbd8', '#f6e08a', '#c8a84a'];
      for (let deg = 0; deg < 360; deg += 30) {
        if (deg === 0 || deg === 180) continue;
        const a = deg * Math.PI / 180, rim = t => [9.8 + 5.2 * Math.cos(t), 9.4 + 4.8 * Math.sin(t)];
        g.poly([rim(a - 0.2), rim(a + 0.2), [9.8 + 7.2 * Math.cos(a), 9.4 + 6.8 * Math.sin(a)]], '#e8c870');
      }
      g.poly([[4.8, 9.4], [0.8, 6.4], [1.8, 9.4], [0.8, 12.6]], '#f0c860');
      g.ell(9.8, 9.4, 5.6, 5.2, Y);
      g.outline();
      g.ell(10.2, 12.4, 3.8, 1.9, '#ffffff', 0, MK(g));
      g.ell(8.2, 10.6, 1.5, 0.9, '#f0c860', 0.4, MK(g));
      g.px([[6, 6], [8, 5], [5, 9], [10, 6], [7, 8]].filter(([x, y]) => g.filled(x, y)), '#c89a48');
      g.px([[12, 7], [13, 7], [12, 8], [13, 8]], INK); g.set(12, 7, '#ffffff');
      g.px([[15, 10], [15, 11]], INK); g.set(14, 9, '#f4a3b8'); g.set(2, 8, '#fff0a0');
    },
    // ----- moonlit (more) -----
    raccoon(g) {
      const Gr = ['#d4d8e4', '#9098ac', '#5a6076'], Dk = '#3a3a4c', Lt = '#f0f2f8';
      const T = new Grid(18, 18); T.ell(3.8, 10.2, 2.3, 4.6, Gr, 0.55);
      g.rect(6, 14, 2, 3, Dk); g.rect(11, 14, 2, 3, Dk);
      g.ell(8.6, 12, 4.6, 3.2, Gr);
      g.ell(12.8, 8.6, 3.2, 2.8, Gr);
      g.poly([[14.4, 8.2], [17.2, 9.6], [14.4, 11]], Gr[0]);
      g.ell(10.8, 5.6, 1.3, 1.5, Gr[1]); g.ell(14.2, 5.4, 1.3, 1.5, Gr[1]);
      const tail = under(g, T);
      g.outline();
      for (const i of tail) { const x = i % 18, y = (i / 18) | 0; if (!g.filled(x, y)) continue; const u = (x + 0.5 - 3.8) * Math.sin(0.55) - (y + 0.5 - 10.2) * Math.cos(0.55); if (Math.floor(u / 1.6 + 10) % 2 || u < -3.2) g.set(x, y, Dk); }
      g.px([[10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [11, 8], [12, 8], [13, 8], [14, 8]].filter(([x, y]) => g.filled(x, y)), Dk);
      g.px([[11, 6], [12, 6], [13, 6], [14, 6]], Lt); g.px([[15, 8], [15, 9], [16, 9], [11, 9], [12, 9], [14, 9]].filter(([x, y]) => g.filled(x, y)), Lt);
      g.set(13, 7, '#ffffff');
      g.px([[16, 9]], INK); g.px([[11, 5], [14, 5]].filter(([x, y]) => g.filled(x, y)), Dk); g.set(13, 10, '#f4a3b8');
      g.px([[7, 16], [12, 16]], '#23232e');
    },
    anglerfish(g) {
      const A = ['#8a7ad8', '#54449e', '#342a6a'];
      g.poly([[4.4, 9.6], [0.8, 6.2], [1.8, 9.6], [0.8, 13.2]], A[2]);
      g.poly([[6.6, 6.4], [7.4, 3.6], [9.6, 5.6]], A[1]);
      g.ell(9.8, 9.4, 5.8, 4.8, A);
      g.ell(12.4, 12.2, 3.8, 1.9, A[2], -0.25);
      stroke(g, [[10.6, 5.2], [11.8, 2.4], [13.6, 1.4]], 0.5, 0.5, A[0]);
      g.ell(15, 2.2, 1.5, 1.5, RAMP_X.glowY);
      g.outline();
      g.px([[10, 11], [11, 11], [12, 11], [13, 11], [14, 11], [15, 10], [16, 10]], INK);
      g.px([[11, 10], [13, 10], [15, 9]].filter(([x, y]) => g.filled(x, y)), '#ffffff'); g.px([[12, 12], [14, 12]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
      g.px([[12, 7], [13, 7], [12, 8], [13, 8]], '#fbf236'); g.set(13, 8, INK); g.set(12, 7, '#ffffff');
      g.px([[6, 8], [8, 11], [6, 11], [9, 7]].filter(([x, y]) => g.filled(x, y)), A[0]);
      g.set(14, 2, '#ffffff');
      for (const [x, y] of [[17, 1], [17, 4], [13, 0], [13, 4]]) if (!g.get(x, y)) g.set(x, y, '#fff27a');
    },
    moondeer(g) {
      const M = ['#f6f0ff', '#cbbce8', '#8e80b8'];
      g.rect(5, 13, 1, 4, M[2]); g.rect(7, 13, 1, 4, M[1]); g.rect(10, 13, 1, 4, M[2]); g.rect(12, 13, 1, 4, M[1]);
      g.ell(3.6, 9.4, 1.2, 1, M[0]);
      g.ell(8.6, 11.2, 4.8, 2.8, M);
      g.ell(12.2, 8.4, 1.6, 3, M, 0.35);
      g.ell(13.4, 5.8, 2.3, 2.1, M);
      g.ell(15.4, 6.8, 1.6, 1.1, M);
      g.ell(11, 4.6, 1.9, 0.9, M[1], -0.5);
      g.outline();
      const An = new Grid(18, 18); An.px([[12, 3], [12, 2], [11, 1], [14, 3], [14, 2], [15, 1]], '#fff0c0'); An.outline();
      for (let i = 0; i < An.a.length; i++) if (An.a[i] && !g.a[i]) g.a[i] = An.a[i];
      g.px([[12, 3], [14, 3]].filter(([x, y]) => g.get(x, y) === '#fff0c0'), '#e0c88a');
      g.px([[5, 10], [7, 9], [9, 10], [8, 12], [11, 9]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
      g.px([[14, 5]], INK); g.set(13, 5, '#ffffff'); g.px([[17, 6]], '#8e80b8'); g.set(15, 7, '#f4a3b8'); g.set(10, 4, '#f7b6c8');
      g.px([[5, 16], [7, 16], [10, 16], [12, 16]], '#5e5080');
    },
    // ----- candy (more) -----
    marshbunny(g) {
      const P = ['#ffffff', '#ffe6f0', '#e4a8c4'];
      g.ell(9.6, 4, 1.3, 3.6, P, -0.25); g.ell(12.6, 4.2, 1.3, 3.6, P, 0.3);
      g.ell(2.8, 11.6, 1.8, 1.8, '#fff4f8');
      g.ell(7.6, 11.8, 5.2, 4.2, P);
      g.ell(11.8, 9.2, 3.4, 3.1, P);
      g.ell(6, 15.6, 2.2, 1, P[1]); g.ell(11, 15.5, 1.4, 1.1, P[1]);
      g.outline();
      g.px([[9, 2], [9, 3], [10, 4], [12, 3], [13, 4], [13, 5]].filter(([x, y]) => g.filled(x, y)), '#ffb8d0');
      g.px([[13, 8]], INK); g.set(13, 7, INK); g.px([[15, 9]], '#f07aa0'); g.set(12, 10, '#ffb8d0'); g.set(14, 10, INK);
      g.px([[5, 10], [8, 9], [4, 13], [9, 12]].filter(([x, y]) => g.filled(x, y)), '#ffd0e4'); g.px([[6, 9], [7, 8]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
    },
    chocomouse(g) {
      const C = ['#b8805a', '#7e4c30', '#4e2c1c'];
      piece(g, t => t.ell(9.4, 7.4, 1.8, 1.8, C));
      g.ell(8, 12.2, 4.8, 3.6, C);
      g.ell(6, 15.8, 1.6, 0.8, '#f4a3b8'); g.ell(11, 15.8, 1.3, 0.8, '#f4a3b8');
      g.ell(12.4, 10.4, 3, 2.8, C);
      g.poly([[13.6, 9.6], [17, 11.6], [13.6, 12.6]], C[1]);
      piece(g, t => t.ell(11.8, 6.8, 2.2, 2.2, C));
      g.outline();
      g.ell(11.8, 6.8, 1.1, 1.1, '#f4a3b8', 0, MK(g));
      g.px([[2, 13], [1, 12], [1, 11], [2, 10], [3, 9]], '#b0605a');
      g.px([[16, 11]], '#f4a3b8'); g.set(17, 11, '#ff7aa0');
      g.px([[13, 9], [13, 10]], INK); g.set(13, 9, '#ffffff'); g.set(14, 11, '#e07ba0');
      g.ell(8.4, 13.4, 3, 1.4, '#a8704a', 0, MK(g));
      g.px([[5, 10], [8, 9], [10, 11], [6, 12]].filter(([x, y]) => g.filled(x, y)), '#fbf236'); g.px([[7, 10], [4, 12], [9, 13]].filter(([x, y]) => g.filled(x, y)), '#5fcde4'); g.px([[6, 9], [11, 13]].filter(([x, y]) => g.filled(x, y)), '#ff8ab0'); g.px([[9, 10]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
    },
    licoriceeel(g) {
      stroke(g, [[1.4, 12.8], [3.6, 10.4], [6.2, 11.8], [8.8, 10.8], [10.8, 8.8]], 1.1, 1.9, '#fff');
      g.poly([[1.8, 12.6], [0.4, 15.4], [3.4, 14]], '#d24552');
      g.ell(13.2, 7.8, 3.2, 2.6, '#d24552');
      g.outline();
      const Rd = ['#ff8a90', '#e0303e', '#901c30'], Bk = ['#6a5a70', '#3a2e44', '#2a2034'];
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        const c = g.get(x, y); if (!c || c === INK) continue;
        const R2 = c === '#fff' ? (Math.floor((x - y * 0.6 + 20) / 1.5) % 2 ? Bk : Rd) : Rd;
        const top = g.get(x, y - 1) === INK, bot = g.get(x, y + 1) === INK;
        g.set(x, y, top && !bot ? R2[0] : bot && !top ? R2[2] : R2[1]);
      }
      g.px([[13, 6], [14, 6], [13, 7], [14, 7]], '#ffffff'); g.px([[14, 6], [14, 7]], INK);
      g.px([[14, 9], [15, 9], [16, 8]], INK); g.set(12, 9, '#ff9ab0');
    },
    // ----- rares (26x26) -----
    dragon(g) {
      const Rd = RAMPS.berry, Bl = ['#fff0c0', '#f6d27a', '#c8a04a'];
      const W = new Grid(26, 26);
      W.poly([[9.4, 12], [6, 5], [2.6, 2], [1.2, 5.4], [3, 7.2], [1.4, 9.4], [3.8, 10.4], [2.6, 13.4], [6.4, 13.6], [7.2, 15]], '#b8304a');
      shade(W, 6, 6, 9, 9, ['#e05a6a', '#b8304a', '#7a1c30']);
      for (const [x, y] of [[2, 2], [1, 5], [2, 9], [3, 13]]) line(W, 8, 12, x, y, '#7a1c30');
      W.poly([[13, 11], [14.8, 4], [17, 2.4], [17.2, 6.4], [15.6, 10]], '#8a2433');
      for (const [x, y] of [[12.6, 12.4], [9.8, 13.8], [7.2, 16]]) g.poly([[x - 1.4, y + 1], [x + 1, y + 1.4], [x - 1.2, y - 2.2]], Bl[1]);
      stroke(g, [[8, 19], [4.4, 21], [2, 19.2], [1.8, 16.4]], 2.2, 0.9, Rd[1]);
      g.poly([[1.8, 17.4], [0.8, 14], [3.6, 15.4]], Rd[1]);
      g.ell(9, 22, 2.4, 2.6, Rd); g.ell(15, 22.2, 2, 2.4, Rd);
      g.ell(11.6, 17.6, 5.4, 4.8, Rd);
      g.ell(15.6, 12.8, 2.4, 3.4, Rd, 0.3);
      g.ell(18.4, 8.8, 3.6, 3.2, Rd); g.ell(21.4, 10.2, 2.6, 1.9, Rd);
      g.poly([[16.2, 6.4], [14.2, 2], [17.6, 5.2]], '#fbf3dc'); g.poly([[18.6, 5.8], [19.2, 1.6], [20.2, 5.8]], '#fbf3dc');
      g.ell(16.6, 18.8, 1.4, 2, Rd, -0.3);
      under(g, W);
      g.outline();
      g.ell(13.6, 19, 2.8, 3.6, Bl, 0, (x, y) => g.filled(x, y) && g.get(x, y) !== '#b8304a');
      for (let y = 16; y < 23; y += 2) for (let x = 11; x < 17; x++) if (g.get(x, y) === Bl[1] || g.get(x, y) === Bl[0]) g.set(x, y, Bl[2]);
      g.px([[19, 8], [19, 9]], INK); g.set(20, 8, INK); g.set(19, 8, '#ffffff'); g.px([[23, 9]], '#8a2433'); g.px([[21, 11], [22, 11]], '#8a2433'); g.set(18, 11, '#ffb0b8');
      g.px([[10, 15], [8, 18], [13, 14]].filter(([x, y]) => g.filled(x, y)), Rd[0]);
      g.px([[22, 12], [21, 13]], '#ffffff');
    },
    unicorn(g) {
      const Wt = ['#ffffff', '#eef0fb', '#b8bcd8'];
      g.ell(4.4, 14.4, 2.2, 4.6, '#f7a6c8', 0.45);
      for (const x of [7, 10, 15, 18]) g.rect(x, 18, 2, 7, x === 10 || x === 18 ? Wt[2] : Wt[1]);
      g.ell(12.6, 16, 7, 4, Wt);
      g.poly([[15, 15], [16.6, 7], [20.6, 8], [20.4, 16]], Wt[1]);
      g.ell(20, 8.4, 3, 2.8, Wt); g.ell(22.4, 10.4, 2, 1.8, Wt);
      g.poly([[17.8, 6.6], [18.2, 3], [19.8, 5.6]], Wt[1]);
      g.ell(16.6, 6.8, 1.9, 1.9, RAMPS.rose); g.ell(15.4, 9.6, 1.9, 2.1, RAMPS.sun); g.ell(14.8, 12.6, 1.7, 2, RAMPS.sky); g.ell(18, 5, 1.5, 1.3, RAMPS.plum);
      g.poly([[19.4, 5.6], [21.2, 5.4], [22.8, 1.4]], '#fff4d0');
      g.outline();
      for (let y = 0; y < 26; y++) for (let x = 0; x < 9; x++) if (g.filled(x, y)) { const b = ((x - y * 0.5) | 0) % 3; g.set(x, y, ['#f7a6c8', '#fff27a', '#9fd8ff'][(b + 3) % 3]); }
      g.px([[20, 3], [21, 2]], '#f6c83a'); g.set(20, 5, '#f6c83a');
      g.px([[21, 8], [21, 9]], INK); g.set(20, 8, INK); g.set(21, 8, '#ffffff'); g.set(22, 11, '#ffc0d8'); g.set(24, 10, Wt[2]);
      g.px([[7, 24], [8, 24], [10, 24], [11, 24], [15, 24], [16, 24], [18, 24], [19, 24]], '#c9a2f0');
      g.px([[10, 14], [11, 14], [12, 13]], '#ffffff'); g.px([[16, 6], [15, 9]], '#ffffff');
    },
    kitsune(g) {
      const Wt = ['#ffffff', '#f4ecdc', '#c8b89a'];
      const T = new Grid(26, 26);
      for (const deg of [258, 226, 194, 162]) { const a = deg * Math.PI / 180; piece(T, t => t.ell(10 + Math.cos(a) * 5.4, 19 + Math.sin(a) * 5.4, 5.8, 2.4, Wt, a)); }
      g.ell(12.4, 19.2, 4.6, 4.6, Wt);
      g.ell(15.4, 16.4, 2.8, 4.6, Wt);
      g.rect(14, 20, 2, 5, Wt[1]); g.rect(17, 20, 2, 5, Wt[1]);
      g.ell(17, 9.8, 3.8, 3.4, Wt);
      g.poly([[18.6, 9.6], [23.4, 11.2], [23, 12.4], [18.6, 12.8]], Wt[1]);
      g.poly([[13.8, 8.2], [14.2, 2.6], [16.8, 6.4]], Wt[1]); g.poly([[17.4, 6.4], [19.6, 2.6], [20.4, 8]], Wt[1]);
      const tails = under(g, T);
      g.outline();
      for (const i of tails) { const x = i % 26, y = (i / 26) | 0; if (!g.filled(x, y)) continue; const d = Math.hypot(x + 0.5 - 10, y + 0.5 - 19); if (d > 9.2) g.set(x, y, '#df7126'); else if (d > 8) g.set(x, y, '#f6c83a'); }
      g.px([[15, 4], [15, 5], [19, 4], [19, 5]], '#d24552');
      g.px([[19, 9], [20, 9]], INK); g.px([[21, 9]], '#d24552'); g.px([[16, 7], [17, 6], [17, 7]], '#d24552');
      g.px([[23, 11]], INK); g.px([[14, 24], [15, 24], [17, 24], [18, 24]], '#d24552');
      const F = new Grid(26, 26); F.ell(22.4, 5.4, 1.6, 1.8, ['#e8fcff', '#9fd8ff', '#5b6ee1']); F.poly([[20.9, 5], [23.9, 5], [22.8, 1.6]], '#9fd8ff'); F.outline('#3f55b8');
      for (let i = 0; i < F.a.length; i++) if (F.a[i] && !g.a[i]) g.a[i] = F.a[i];
      g.set(22, 5, '#ffffff');
    },
    yeti(g) {
      const F = ['#ffffff', '#e4ecf8', '#a8b8d8'], Fc = ['#c8e0ff', '#8cb0e8', '#5a78c0'];
      g.poly([[8, 5.6], [5.4, 1.8], [9.6, 3.8]], '#eec39a'); g.poly(mirX([[8, 5.6], [5.4, 1.8], [9.6, 3.8]], 26), '#eec39a');
      g.ell(9, 22.8, 3, 1.8, F[2]); g.ell(17, 22.8, 3, 1.8, F[2]);
      g.ell(4.2, 15.4, 2.6, 5, F, 0.2); g.ell(21.8, 15.4, 2.6, 5, F, -0.2);
      g.ell(13, 16.4, 8.2, 6.6, F);
      g.ell(13, 9.4, 6.6, 5.6, F);
      for (let deg = 0; deg < 360; deg += 30) { const a = deg * Math.PI / 180; g.ell(13 + Math.cos(a) * 8, 13.6 + Math.sin(a) * 8.4, 1.8, 1.8, F); }
      g.ell(13, 10.6, 4.4, 3.4, Fc);
      g.outline();
      g.px([[10, 9], [10, 10], [15, 9], [15, 10]], INK); g.set(10, 9, '#ffffff'); g.set(15, 9, '#ffffff');
      g.px([[12, 12], [13, 12]], INK); g.px([[11, 12], [14, 12]], '#ffffff'); g.px([[9, 11], [16, 11]], '#f4a3b8');
      for (const [x, y] of [[7, 18], [18, 19], [12, 21], [5, 14], [20, 14], [10, 16], [15, 17]]) if (g.filled(x, y)) g.set(x, y, F[2]);
      g.px([[8, 23], [9, 23], [16, 23], [17, 23]], Fc[1]);
    },
    griffin(g) {
      const Ln = ['#f6d2a0', '#d8a060', '#9a6a38'], Wg = ['#e8d0b0', '#b88a5a', '#7a5238'];
      for (const [deg, len] of [[278, 8.6], [252, 10.4], [226, 10], [200, 8]]) { const a = deg * Math.PI / 180; piece(g, t => t.ell(11.6 + Math.cos(a) * len * 0.55, 13 + Math.sin(a) * len * 0.55, len * 0.55, 2, Wg, a)); }
      stroke(g, [[6, 18], [3, 15], [2.4, 12.4]], 0.8, 0.7, Ln[2]); g.ell(2.4, 11.2, 1.4, 1.6, Wg[2]);
      g.ell(7.4, 21, 2.4, 3.2, Ln); g.ell(8, 23.4, 2, 1.2, Ln);
      g.ell(11, 18.2, 6, 4.4, Ln);
      g.rect(15, 20, 2, 5, '#f6c83a'); g.rect(18, 20, 2, 5, '#f6c83a');
      g.ell(16.4, 15.6, 3.4, 4.4, RAMPS.cloud);
      g.ell(18.4, 9.4, 3.6, 3.4, RAMPS.cloud);
      g.poly([[20.8, 8.4], [24.4, 9.6], [23.8, 12.6], [21, 11.8]], '#f6c83a');
      g.outline();
      g.px([[20, 8], [20, 9]], INK); g.set(19, 8, INK); g.px([[17, 7], [18, 7], [19, 7]], '#9badb7');
      g.px([[23, 12], [24, 11]], '#c7861c'); g.px([[15, 24], [16, 24], [18, 24], [19, 24]], '#c7861c');
      for (const [deg, len] of [[200, 8], [226, 10], [252, 10.4], [278, 8.6]]) { const a = deg * Math.PI / 180; for (let r = 5; r < len - 1; r += 1) { const x = Math.floor(11.6 + Math.cos(a) * r), y = Math.floor(13 + Math.sin(a) * r); if (g.get(x, y) === Wg[1]) g.set(x, y, Wg[0]); } }
    },
    dinosaur(g) {
      const Gn = ['#b8f070', '#6abe30', '#37946e'];
      for (const [cx, cy, deg] of [[6.8, 15, 215], [9, 12.6, 240], [12, 11.4, 262], [14.8, 11.6, 285]]) {
        const a = deg * Math.PI / 180, px = -Math.sin(a), py = Math.cos(a);
        g.poly([[cx + px * 1.5, cy + py * 1.5], [cx - px * 1.5, cy - py * 1.5], [cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4]], '#f6a83a');
      }
      stroke(g, [[8, 19], [4, 20.4], [1.8, 18]], 2.6, 1, Gn[1]);
      g.ell(9.6, 21.8, 2.6, 3, Gn); g.ell(15.6, 22, 2.4, 2.8, Gn);
      g.ell(12, 17, 6, 5, Gn);
      g.ell(17.6, 9.8, 4.4, 3.6, Gn); g.ell(19.8, 11.6, 3.6, 2, Gn);
      g.ell(17.6, 17, 1.4, 1, Gn[1], 0.6);
      g.outline();
      for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) if (g.get(x, y) === '#f6a83a' && (x + y) % 2) g.set(x, y, '#fff27a');
      g.ell(14, 19, 3, 3.2, '#f4f0b0', 0, MK(g)); g.px([[13, 18], [15, 20]], '#e0d890');
      g.px([[8, 16], [10, 18], [6, 19], [11, 15]].filter(([x, y]) => g.filled(x, y)), Gn[2]);
      g.px([[19, 8], [19, 9]], INK); g.set(19, 8, '#ffffff'); g.set(20, 8, INK);
      g.px([[22, 10]], Gn[2]); g.px([[18, 12], [19, 13], [20, 13], [21, 12]], INK); g.set(20, 12, '#ffffff'); g.set(17, 11, '#f4a3b8');
    },
    kraken(g) {
      const K = ['#e08ad0', '#a04ab0', '#5e2a78'];
      const arms = [[5.6, -1, 1.6, -3], [8.2, -1, 1, 1], [11.4, -1, 0.4, 2], [14.6, 1, 0.4, 2], [17.8, 1, 1, 1], [20.4, 1, 1.6, -3]];
      for (const [bx, s, sp, lift] of arms) stroke(g, [[bx, 14], [bx + s * 1.4 * sp, 18], [bx + s * 3 * sp, 21.4 + Math.min(0, lift) * 0.2], [bx + s * (4.2 * sp + 1), 22.4 + lift * 0.3], [bx + s * (4.8 * sp + 2.2), 20.6 + lift * 0.4]], 1.9, 0.9, K[1]);
      g.ell(5.4, 5.2, 2.4, 1.4, K, -0.6); g.ell(20.6, 5.2, 2.4, 1.4, K, 0.6);
      g.ell(13, 9, 7, 7.2, K);
      g.outline();
      for (const cx of [10, 16]) { g.ell(cx, 10, 1.9, 2.1, '#fff27a', 0, MK(g)); g.px([[cx - 1, 9], [cx, 9], [cx - 1, 10], [cx, 10], [cx - 1, 11], [cx, 11]], INK); g.set(cx - 1, 9, '#ffffff'); }
      g.px([[12, 13], [13, 13]], INK); g.px([[8, 12], [18, 12]], '#ff9ac0');
      g.px([[11, 4], [14, 3], [16, 5], [9, 6], [13, 6]], K[0]); g.px([[10, 3], [11, 3]], '#ffffff');
      for (let y = 15; y < 26; y++) for (let x = 0; x < 26; x++) if (g.filled(x, y) && (x * 7 + y * 3) % 5 === 0) g.set(x, y, '#f8c8f0');
    },
    phoenix(g) {
      const Or = ['#ffd070', '#f07a2a', '#b83a2a'], Fi = ['#fffbd0', '#f6c83a', '#df7126'];
      for (const [deg, len, R2] of [[182, 10, Or], [146, 11, Or], [164, 12, Fi]]) { const a = deg * Math.PI / 180; piece(g, t => t.ell(9 + Math.cos(a) * len * 0.5, 18 + Math.sin(a) * len * 0.5, len * 0.5, 1.7, R2, a)); }
      for (const [deg, len, R2] of [[280, 8.6, Fi], [256, 10.6, Or], [232, 10.4, Fi], [208, 8.4, Or]]) { const a = deg * Math.PI / 180; piece(g, t => t.ell(12 + Math.cos(a) * len * 0.55, 12.4 + Math.sin(a) * len * 0.55, len * 0.55, 1.9, R2, a)); }
      g.rect(12, 20, 1, 4, '#f6c83a'); g.rect(15, 20, 1, 4, '#f6c83a'); g.px([[11, 24], [12, 24], [13, 24], [14, 24], [15, 24], [16, 24]], '#df7126');
      g.ell(13.4, 16, 4.4, 4.6, Or);
      g.ell(17, 9.6, 3, 3, Or);
      g.poly([[15, 7.4], [13.6, 2.4], [16.4, 5.4]], Fi[1]); g.poly([[16.6, 6.6], [17.6, 1.6], [18.6, 6.2]], Fi[1]);
      g.poly([[19.4, 9], [22.8, 10], [19.4, 11.4]], '#fff27a');
      g.outline();
      g.ell(14.4, 17.6, 2.4, 2.8, '#fff27a', 0, MK(g));
      for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) { const c = g.get(x, y); if ((c === Or[1] || c === Fi[1]) && (x * 2 + y) % 5 === 0) g.set(x, y, '#fff27a'); }
      g.px([[18, 9]], INK); g.set(18, 8, INK); g.set(19, 10, '#d24552');
      for (const [x, y, c] of [[2, 10, '#fff27a'], [4, 24, '#f6a83a'], [23, 4, '#fff27a'], [1, 16, '#f6a83a'], [21, 16, '#fff27a']]) if (!g.get(x, y)) g.set(x, y, c);
    },
    fairy(g) {
      const Sk = ['#fff0e0', '#f6d2ad', '#d8a070'], Dr = ['#ffd8f0', '#f7a6d8', '#c06aa8'], Wi = ['#ffffff', '#d8f0ff', '#a8c8f0'], Hr = ['#fff8a0', '#f6d23a', '#c7961c'];
      const W = new Grid(26, 26);
      W.ell(7, 8.6, 3.8, 5, Wi, -0.6); W.ell(19, 8.6, 3.8, 5, Wi, 0.6); W.ell(7.6, 16, 2.6, 3.2, Wi, 0.4); W.ell(18.4, 16, 2.6, 3.2, Wi, -0.4);
      stroke(g, [[18.2, 13], [21, 7.6]], 0.5, 0.5, '#fbf3dc');
      g.poly(starPts(21.6, 5.8, 2.6, 1.1, 5), '#fff27a');
      g.rect(11, 20, 1, 3, Sk[1]); g.rect(14, 20, 1, 3, Sk[1]); g.rect(10, 23, 2, 2, Dr[2]); g.rect(14, 23, 2, 2, Dr[2]);
      g.poly([[10.2, 13], [15.8, 13], [18.4, 21], [7.6, 21]], Dr[1]); shade(g, 13, 17, 6, 5, Dr);
      g.ell(9.2, 15.2, 1, 2, Sk, 0.5); g.ell(17.4, 13.4, 1, 2, Sk, -0.6);
      g.ell(13, 3.2, 1.8, 1.6, Hr); g.ell(13, 8.2, 5, 4.8, Hr);
      g.ell(13, 10.2, 3.8, 3, Sk);
      const wing = under(g, W);
      g.outline();
      for (const i of wing) { const x = i % 26, y = (i / 26) | 0; if (g.get(x - 1, y) === INK || g.get(x + 1, y) === INK || g.get(x, y - 1) === INK || g.get(x, y + 1) === INK) g.set(x, y, '#c4b0f0'); }
      g.px([[6, 8], [19, 8], [7, 16], [18, 16]], '#f7b6c8');
      g.px([[11, 10], [11, 11], [14, 10], [14, 11]], INK); g.set(11, 10, '#ffffff'); g.set(14, 10, '#ffffff');
      g.px([[10, 12], [15, 12]], '#f4a3b8'); g.px([[12, 12], [13, 12]], '#c06aa8');
      g.px([[10, 7], [11, 7], [9, 8]].filter(([x, y]) => g.filled(x, y)), Hr[0]);
      g.px([[9, 18], [12, 16], [15, 19], [11, 20]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
      g.set(21, 5, '#ffffff');
      for (const [x, y] of [[3, 3], [24, 11], [2, 21], [23, 20], [5, 23]]) if (!g.get(x, y)) g.set(x, y, '#fff27a');
    },
  };
  function critter(kind) {
    if (critterCache[kind]) return critterCache[kind];
    const D = window.PSDATA || {}, rare = !!(D.RARES && D.RARES[kind]) || ['dragon', 'unicorn', 'kitsune', 'yeti', 'griffin', 'dinosaur', 'kraken', 'phoenix', 'fairy'].includes(kind);
    let c;
    if (CR[kind]) { const g = new Grid(rare ? 26 : 18, rare ? 26 : 18); g.spec = true; try { CR[kind](g); c = g.canvas(); } catch (e) { console.error('PX.critter', kind, e); } }
    return (critterCache[kind] = c || genericCritter(kind));
  }
  // Fallback critter for unknown ids: shaped by where it lives, tinted by its element.
  const EL_RAMP = { leaf: 'leaf', water: 'sky', fire: 'clay', stone: 'slate', sky: 'cloud', shadow: 'night', light: 'sun', sweet: 'rose', normal: 'peach' };
  function genericCritter(id) {
    const D = window.PSDATA || {}, a = (D.ANIMALS && D.ANIMALS[id]) || (D.RARES && D.RARES[id]) || null;
    const rare = !!(a && a.rare), S = rare ? 26 : 18, k = S / 18;
    const g = new Grid(S, S), R = RAMPS[EL_RAMP[a ? a.el : 'normal']] || RAMPS.peach, where = a ? a.where : 'land';
    if (where === 'water') {
      g.poly([[3 * k, 6 * k], [6 * k, 10 * k], [3 * k, 14 * k]], R[2]); g.ell(10 * k, 10 * k, 6 * k, 4 * k, R);
      g.outline(); g.set(Math.round(13 * k), Math.round(9 * k), INK);
    } else if (where === 'air') {
      g.ell(8 * k, 11 * k, 4.6 * k, 3.6 * k, R); g.ell(12 * k, 7.5 * k, 2.9 * k, 2.7 * k, R); g.ell(6.5 * k, 9.5 * k, 3 * k, 2 * k, R[0], -0.5);
      g.poly([[14.5 * k, 7 * k], [17 * k, 8 * k], [14.5 * k, 9 * k]], '#f6c83a');
      g.outline(); g.set(Math.round(12.5 * k), Math.round(7 * k), INK);
    } else {
      g.ell(8 * k, 11.5 * k, 5 * k, 3.6 * k, R); g.ell(13 * k, 8 * k, 3.2 * k, 3 * k, R); g.ell(11.6 * k, 4.8 * k, 1.1 * k, 1.6 * k, R[2]);
      g.rect(Math.round(5 * k), Math.round(14 * k), Math.max(1, Math.round(k)), S - 1 - Math.round(14 * k), R[2]); g.rect(Math.round(10 * k), Math.round(14 * k), Math.max(1, Math.round(k)), S - 1 - Math.round(14 * k), R[2]);
      g.outline(); g.set(Math.round(14 * k), Math.round(7.5 * k), INK);
    }
    return g.canvas();
  }
  // Swimming version: top ~60% of the critter with a ripple line. Anchor bottom-centre = water surface.
  const swimCache = {};
  function critterSwim(kind) {
    if (swimCache[kind]) return swimCache[kind];
    const c = critter(kind), w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let top = h, bot = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { top = Math.min(top, y); bot = Math.max(bot, y); }
    const cut = Math.max(top + 3, Math.round(top + (bot - top) * 0.62));
    let x0 = w, x1 = 0;
    for (let y = cut - 2; y < cut; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const o = document.createElement('canvas'); o.width = w; o.height = cut + 2;
    const x = o.getContext('2d'); x.drawImage(c, 0, 0, w, cut, 0, 0, w, cut);
    x.fillStyle = '#ffffff'; for (let i = Math.max(0, x0 - 2); i <= Math.min(w - 1, x1 + 2); i++) if ((i - x0) % 4 !== 3) x.fillRect(i, cut, 1, 1);
    x.fillStyle = '#9fd8ff'; for (let i = Math.max(0, x0); i <= Math.min(w - 1, x1); i++) if ((i - x0) % 4 < 2) x.fillRect(i, cut + 1, 1, 1);
    x.fillStyle = '#cbe8ff'; x.fillRect(Math.max(0, x0 - 1), cut - 1, 1, 1); x.fillRect(Math.min(w - 1, x1 + 1), cut - 1, 1, 1);
    return (swimCache[kind] = o);
  }

  // ---------------- Items (fruit 13x13, egg 20x24, coin 9x9, bigcoin 11x11, xp 9x9, element 7x7, flower 12x12) ----------------
  const itemCache = {};
  function item(kind, id) {
    const key = kind + ':' + id; if (itemCache[key]) return itemCache[key];
    let g;
    try { g = (ITEM[kind] || ITEM.unknown)(id); } catch (e) { console.error('PX.item', kind, id, e); g = ITEM.unknown(); }
    return (itemCache[key] = g instanceof Grid ? g.canvas() : g);
  }
  function eggShape(g, ramp) {
    const pts = [];
    for (let y = 0; y < 24; y++) for (let x = 0; x < 20; x++) {
      const dy = (y + 0.5 - 13) / 10, wf = dy < 0 ? 1 + 0.2 * dy : 1 - 0.04 * dy, dx = (x + 0.5 - 10) / (7.4 * wf);
      if (dx * dx + dy * dy <= 1) { g.set(x, y, ramp === SKIN_SENT ? shadeOf(ramp, dx, dy) : shadeDith(ramp, dx, dy, x, y, 0.07)); pts.push([x, y, dx, dy]); }
    }
    return pts;
  }
  const FRUIT_ART = {
    apple(g) {
      g.ell(4.6, 6.4, 2.7, 2.6, RAMPS.berry); g.ell(8.4, 6.4, 2.7, 2.6, RAMPS.berry); g.poly([[2, 7], [11, 7], [6.5, 11.8]], RAMPS.berry[1]);
      g.rect(6, 2, 1, 3, '#663931'); g.ell(8.6, 2.6, 1.7, 0.9, '#6abe30', -0.4);
      g.outline(); shade(g, 6.5, 7, 5, 5, RAMPS.berry); g.rect(6, 2, 1, 3, '#663931'); g.ell(8.6, 2.6, 1.7, 0.9, '#6abe30', -0.4, MK(g));
      g.px([[3, 5], [3, 6], [4, 5]], '#ffffff');
    },
    sunpear(g) {
      g.ell(6.5, 8.6, 3.9, 3.4, RAMPS.sun); g.ell(6.5, 5.2, 2.3, 2.6, RAMPS.sun); g.rect(6, 1, 1, 2, '#663931'); g.ell(8.4, 2, 1.5, 0.8, '#6abe30', -0.3);
      g.outline(); g.px([[4, 6], [4, 7], [5, 4]], '#ffffff'); g.px([[8, 9], [9, 9]], '#f6a83a');
    },
    moonplum(g) {
      g.ell(6.5, 7.2, 4.1, 4.3, RAMPS.plum); g.rect(6, 1, 1, 2, '#663931');
      g.outline(); g.px([[4, 5], [3, 6], [3, 7], [3, 8], [4, 9]], '#ece0ff'); g.px([[8, 5], [9, 7]], '#fff27a'); g.px([[7, 4], [7, 5], [7, 6], [7, 7]].filter(([x, y]) => g.filled(x, y)), '#7a52b0');
    },
    swiftberry(g) {
      g.ell(4.3, 8.4, 2.5, 2.5, RAMPS.clay); g.ell(8.7, 8.4, 2.5, 2.5, RAMPS.clay); g.ell(6.5, 5.2, 2.5, 2.5, RAMPS.clay);
      g.poly([[6.5, 3.6], [4, 1.4], [6.5, 2.4], [9, 1.2]], '#6abe30');
      g.outline(); g.px([[3, 7], [7, 7], [5, 4]], '#ffffff'); g.px([[10, 10], [7, 10]], '#96461c');
    },
    wingseed(g) {
      g.ell(3, 5.6, 2.4, 1.4, RAMPS.cloud, -0.6); g.ell(10, 5.6, 2.4, 1.4, RAMPS.cloud, 0.6);
      g.ell(6.5, 8, 2.6, 3.2, ['#f0d8a0', '#c89050', '#8a5a2a']); g.poly([[5.2, 5.4], [6.5, 2.6], [7.8, 5.4]], '#c89050');
      g.outline(); g.px([[5, 6], [5, 7]], '#fff0c8'); g.px([[2, 5], [10, 5]], '#c9a2f0'); g.px([[3, 4], [9, 4]], '#ffffff');
    },
    seakelp(g) {
      stroke(g, [[4.6, 11.4], [3.6, 8.6], [5.2, 5.6], [4.2, 2.6]], 1.3, 0.9, '#52c7a8');
      stroke(g, [[7.6, 11.4], [8.6, 8.6], [7.4, 6]], 1.2, 0.9, '#37946e');
      g.ell(10.4, 3.4, 1.2, 1.2, '#dff6ff');
      g.outline(); g.px([[4, 5], [3, 8], [4, 10]].filter(([x, y]) => g.filled(x, y)), '#a6f2d3'); g.px([[8, 10], [8, 8]].filter(([x, y]) => g.filled(x, y)), '#6abe30'); g.set(10, 3, '#ffffff');
    },
    powernut(g) {
      g.ell(6.5, 8.2, 3.4, 3.6, ['#f5c080', '#d98a3a', '#96561c']); g.poly([[6.5, 11.8], [5.6, 10.6], [7.4, 10.6]], '#96561c');
      g.ell(6.5, 5, 4.3, 2.4, RAMP_X.bark, 0, (x, y) => y <= 5.6); g.rect(6, 1, 1, 2, '#5a3322');
      g.outline(); g.px([[4, 4], [6, 4], [8, 4], [5, 3], [7, 3], [9, 4]].filter(([x, y]) => g.filled(x, y)), '#5a3322'); g.px([[4, 7], [4, 8]], '#ffe0b0'); g.px([[8, 9]], '#d24552');
    },
    heartyroot(g) {
      g.ell(4.6, 3.6, 1, 2.2, RAMPS.leaf, -0.4); g.ell(6.5, 3, 1, 2.4, RAMPS.leaf); g.ell(8.4, 3.6, 1, 2.2, RAMPS.leaf, 0.4);
      g.ell(6.5, 8, 3.8, 3.2, ['#fff4f8', '#e8b0d0', '#a2477a'], 0); g.px([[6, 11], [6, 12]], '#a2477a');
      g.outline(); for (let y = 5; y < 8; y++) for (let x = 2; x < 11; x++) if (g.filled(x, y) && y <= 6) g.set(x, y, '#b85a98');
      g.px([[4, 8], [4, 9]], '#ffffff');
    },
    goldfruit(g) {
      g.ell(6.5, 7.2, 4.3, 4, RAMP_X.gold); g.rect(6, 1, 1, 2, '#663931'); g.ell(8.6, 2.3, 1.7, 0.9, '#6abe30', -0.4);
      g.outline(); g.px([[4, 5], [4, 6], [5, 5]], '#ffffff'); g.px([[8, 9]], '#fff27a'); g.px([[0, 2], [12, 6], [1, 11]], '#fff27a'); g.px([[11, 1]], '#ffffff');
    },
  };
  const EGG_ART = {
    meadow(g) {
      const e = eggShape(g, ['#fffdf4', '#f4ecd4', '#c8bc98']);
      const on = MK(g);
      g.ell(7, 9, 2.2, 2.2, '#6abe30', 0, on); g.ell(13, 16, 2.8, 2.4, '#6abe30', 0, on); g.ell(13.5, 7, 1.4, 1.4, '#99e550', 0, on); g.ell(6, 17, 1.5, 1.3, '#99e550', 0, on);
      g.outline(); g.px([[6, 8], [12, 15]], '#99e550'); g.px([[5, 6], [5, 7], [6, 5]], '#ffffff'); void e;
    },
    beach(g) {
      const e = eggShape(g, ['#fff8e0', '#f4dca8', '#c8a468']);
      for (const [x, y, dx] of e) { const w = 13 + Math.round(Math.sin(x * 0.9) * 1.1); if (y === w - 1) g.set(x, y, '#ffffff'); else if (y >= w && y <= w + 2) g.set(x, y, dx > 0.5 ? '#3f7fc0' : '#5fa8e8'); else if (y > w + 2 && y <= w + 4) g.set(x, y, '#9fd8ff'); }
      g.outline(); g.px([[7, 19], [8, 19], [7, 20]], '#f7b6c8'); g.px([[5, 6], [5, 7], [6, 5]], '#ffffff'); g.px([[12, 8], [9, 5]], '#e8c888');
    },
    moonlit(g) {
      eggShape(g, ['#8c9cf0', '#4a4aa0', '#2c2c66']);
      for (let y = 0; y < 24; y++) for (let x = 0; x < 20; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 11) < 3.2 && Math.hypot(x + 0.5 - 9.6, y + 0.5 - 10) >= 2.8) g.set(x, y, '#fff27a');
      g.outline(); g.px([[13, 7], [5, 17], [14, 16], [11, 20], [6, 6]], '#ffffff'); g.px([[13, 12], [12, 13], [13, 13], [14, 13], [13, 14]], '#dcd0ff'); g.px([[4, 11]], '#9fd8ff');
    },
    candy(g) {
      const e = eggShape(g, ['#fff4fa', '#ffd0e4', '#e090b8']);
      for (const [x, y, dx] of e) if ((((x + y) % 6) + 6) % 6 < 2) g.set(x, y, dx > 0.45 ? '#c8487a' : '#f06a98');
      g.outline(); g.px([[5, 6], [5, 7], [6, 5]], '#ffffff'); g.px([[9, 10], [13, 18]], '#5fcde4'); g.px([[12, 6], [7, 16]], '#fbf236'); g.px([[10, 14]], '#99e550');
    },
    // ---- Halloween eggs ----
    pumpkin(g) {
      const e = eggShape(g, PUMPKIN);
      for (const [x, y, dx, dy] of e) { const u = Math.abs(dx / Math.sqrt(Math.max(0.12, 1 - dy * dy))); if (Math.abs(u - 0.4) < 0.09 || Math.abs(u - 0.8) < 0.07) g.set(x, y, dx > 0.2 ? '#a84a1a' : '#d0661c'); }
      g.rect(9, 0, 2, 4, '#7a4a2a'); g.ell(13, 2.2, 2.4, 1.1, RAMPS.leaf, -0.3);
      g.outline();
      g.px([[5, 7], [5, 8], [6, 6]], '#ffe4b8'); g.set(9, 0, '#a8703a'); g.px([[12, 2], [13, 2]], '#99e550'); g.px([[7, 3], [6, 2], [6, 1]].filter(([x, y]) => !g.get(x, y)), '#6abe30');
    },
    ghost(g) {
      eggShape(g, GHOST);
      g.outline('#6e5ca8');
      g.px([[7, 11], [7, 12], [12, 11], [12, 12]], INK); g.set(7, 11, '#8a7ad0'); g.set(12, 11, '#8a7ad0');
      g.px([[9, 14], [10, 14], [9, 15], [10, 15]], INK); g.set(9, 14, '#e07ba0');
      g.px([[5, 13], [6, 13], [13, 13], [14, 13]], '#f7b6c8'); g.px([[5, 6], [5, 7], [6, 5]], '#ffffff');
      for (const [x, y] of [[1, 7], [0, 8], [1, 9], [18, 15], [19, 16], [18, 17], [17, 2], [16, 1]]) if (!g.get(x, y)) g.set(x, y, '#d8ccff');
    },
    mummy(g) {
      const e = eggShape(g, WRAP);
      for (const [x, y] of e) { const f = (((x * 0.55 - y) % 3.1) + 3.1) % 3.1; if (f < 0.6) g.set(x, y, '#8a7456'); else if (f < 1.1) g.set(x, y, WRAP[2]); }
      for (const [x, y] of e) if (y >= 10 && y <= 13 && x >= 4 && x <= 15) g.set(x, y, y === 10 || y === 13 ? WRAP[2] : '#6a5644');
      g.outline();
      for (const cx of [7, 12]) { g.px([[cx - 1, 11], [cx, 11], [cx - 1, 12], [cx, 12]], '#ffffff'); g.set(cx, 12, INK); g.set(cx - 1, 12, INK); }
      g.px([[16, 17], [17, 18], [17, 19], [18, 20]].filter(([x, y]) => !g.get(x, y)), WRAP[1]); g.px([[5, 6], [6, 5]], '#ffffff');
    },
    candycorn(g) {
      const T = ['#0a0a01', '#0a0a02', '#0a0a03'], e = eggShape(g, T);
      for (const [x, y] of e) { const i = T.indexOf(g.get(x, y)); if (i < 0) continue; const b = y + ((x + y) & 1 ? 0.4 : -0.4); g.set(x, y, (b < 9 ? CORN[0] : b < 16 ? CORN[1] : CORN[2])[i]); }
      g.outline(); g.px([[5, 6], [5, 7], [6, 5]], '#ffffff'); g.px([[5, 11], [5, 12]], '#ffe0a8');
    },
    vampire(g) {
      const e = eggShape(g, VAMP[0]);
      g.outline();
      g.ell(13.6, 6.6, 1.9, 1.9, ['#fffbd0', '#fff27a', '#e8c840']); g.ell(14.6, 5.8, 1.5, 1.5, VAMP[0][1]);
      const bat = ['k...k.k...k', 'kk..kkk..kk', 'kkkkkkkkkkk', '.kkk.k.kkk.', '..k.....k..'];
      bat.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'k') g.set(5 + i, 10 + j, '#c9a2f0'); });
      g.px([[9, 11], [11, 11]], '#fff27a');
      for (const [x, y] of e) { const d = Math.abs(x + 0.5 - 10); if (y >= 17 && y <= 22 && d > 2.2 && y < 23 - (d - 2.2) * 0.5 && y > 16 + (7 - d) * 0.9) g.set(x, y, d < 3.8 ? '#e8506a' : '#b02846'); }
      g.px([[5, 6], [5, 7], [6, 5]], '#9a88c8'); g.px([[4, 15], [15, 16], [7, 4]], '#fff27a');
    },
    witch(g) {
      const e = eggShape(g, WITCH[0]);
      for (const [x, y] of [[6, 12], [13, 16], [8, 19], [14, 9]]) g.px([[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => g.filled(a, b)), '#fff27a');
      g.px([[11, 13], [5, 17], [15, 20], [9, 7]].filter(([a, b]) => g.filled(a, b)), '#ffffff');
      const H = new Grid(20, 24); H.poly([[6.6, 4.4], [13.4, 4.4], [12.2, 1.6], [14.6, 0.2], [10.6, 0.8], [8.4, 3]], '#6c3eb0'); H.rect(8, 3, 4, 1, '#ff9a22'); H.ell(10, 4.6, 6, 1.1, '#43206e'); H.outline();
      g.outline(); g.merge(H); g.set(10, 3, '#fbf236'); g.px([[5, 7], [6, 6]], '#e4d0ff'); void e;
    },
    golden(g) {
      const e = eggShape(g, RAMP_X.gold);
      for (const [x, y] of e) { const z = 13 + (x % 4 < 2 ? x % 2 : 1 - x % 2); if (y === z || y === z + 3) g.set(x, y, '#fff27a'); }
      g.outline(); g.px([[9, 14], [10, 14], [9, 15], [10, 15]], '#d24552'); g.px([[5, 15], [14, 15]], '#5fcde4');
      g.px([[5, 6], [5, 7], [6, 5], [4, 8], [4, 9]], '#ffffff');
      g.px([[1, 4], [0, 5], [2, 5], [1, 6]], '#fff27a'); g.px([[18, 17], [17, 18], [19, 18], [18, 19]], '#fff27a'); g.px([[16, 2]], '#ffffff');
    },
    rainbow(g) {
      const e = eggShape(g, RAMPS.cloud);
      const Lc = ['#ffb0b8', '#ffc890', '#fff8a0', '#c8f090', '#a8ecf8', '#d8b8f8'], Mc = ['#f07a84', '#f6a83a', '#fbf236', '#99e550', '#5fcde4', '#9a6ad0'], Dc = ['#d24552', '#df7126', '#c7a81c', '#4fae3a', '#3f8fc0', '#6a3a9e'];
      for (const [x, y, dx] of e) { const b = Math.max(0, Math.min(5, Math.floor((y - 3 + x * 0.3) / 3.3))); g.set(x, y, dx < -0.55 ? Lc[b] : dx > 0.5 ? Dc[b] : Mc[b]); }
      g.outline(); g.px([[5, 6], [5, 7], [6, 5], [4, 9]], '#ffffff'); g.px([[1, 3], [18, 20]], '#fff27a');
    },
    crystal(g) {
      const e = eggShape(g, ['#f4feff', '#c8ecfa', '#8ab8e0']);
      const pal = ['#e8fbff', '#bfe2f8', '#d8ccf8', '#a8d0f0', '#f4f0ff', '#9cc4ec'];
      const facet = (x, y) => { const a = Math.atan2(y + 0.5 - 12, x + 0.5 - 10), r = Math.hypot((x + 0.5 - 10) / 7, (y + 0.5 - 12) / 9.5); return Math.floor((a + Math.PI) / (Math.PI / 3) + (r > 0.55 ? 0.5 : 0)) % 6 + (r > 0.55 ? 6 : 0); };
      for (const [x, y] of e) { const f = facet(x, y); g.set(x, y, pal[f % 6]); }
      for (const [x, y] of e) { const f = facet(x, y); if ((g.filled(x + 1, y) && facet(x + 1, y) !== f) || (g.filled(x, y + 1) && facet(x, y + 1) !== f)) g.set(x, y, '#ffffff'); }
      g.outline(); g.px([[1, 6], [0, 7], [2, 7], [1, 8]], '#ffffff'); g.px([[17, 15], [18, 16]], '#c9a2f0'); g.px([[15, 3]], '#9fd8ff');
    },
    dragon(g) {
      const e = eggShape(g, RAMPS.berry);
      for (const [x, y] of e) { const row = Math.floor(y / 3); if (y % 3 === 2 && ((x + (row % 2) * 2) % 4) !== 0) g.set(x, y, '#9a2c3c'); }
      g.poly([[5.6, 6.4], [8.2, 4.2], [4, 1.4]], '#fbe0a0'); g.poly([[14.4, 6.4], [11.8, 4.2], [16, 1.4]], '#fbe0a0'); g.poly([[8.8, 4], [11.2, 4], [10, 1.2]], '#f6c83a');
      g.outline(); g.px([[5, 6], [5, 7], [6, 5]], '#ffb0b8'); g.px([[8, 12], [10, 16], [6, 18]], '#f6c83a');
    },
  };
  const EL_ICON = {
    leaf: [['....kkk', '..kkLLk', '.kLLLek', 'kLLeeEk', 'kLeeEk.', 'keEEk..', 'kkkk...'], { L: '#99e550', e: '#6abe30', E: '#37946e' }],
    water: [['...k...', '..kak..', '.kwauk.', 'kaauuBk', 'kauuuBk', 'kuuuBBk', '.kkkkk.'], { a: '#9fd8ff', u: '#639bff', B: '#3f55b8', w: '#ffffff' }],
    fire: [['..k....', '.kok.k.', '.koykok', 'kooyyok', 'koyyyok', 'kroyyrk', '.kkkkk.'], { y: '#fff27a', o: '#f6a83a', r: '#d24552' }],
    stone: [['.......', '..kkk..', '.kllmk.', 'klllmmk', 'klmmmdk', 'kmmmddk', '.kkkkk.'], { l: '#d8c8a8', m: '#a8946e', d: '#6a5a40' }],
    sky: [['.......', '..kkk..', '.kwwwkk', 'kwwwwwk', 'kwwaaak', '.kkkkk.', '.......'], { w: '#ffffff', a: '#9fd8ff' }],
    shadow: [['..kkk..', '.kppk..', 'kppk...', 'kpPk...', 'kpPPk.k', '.kqPPqk', '..kkkk.'], { p: '#c9a2f0', P: '#9a6ad0', q: '#5e3a8e' }],
    light: [['...k...', '..kyk..', '.kyyyk.', 'kyywyok', '.kyook.', '..kok..', '...k...'], { y: '#fff27a', o: '#f6c83a', w: '#ffffff' }],
    sweet: [['.kk.kk.', 'kRRkRmk', 'kwRRmmk', 'kRRmmMk', '.kmmMk.', '..kMk..', '...k...'], { R: '#f7b6c8', m: '#e07ba0', M: '#a2477a', w: '#ffffff' }],
    normal: [['..kkk..', '.klllk.', 'klwllmk', 'kllllmk', 'klllmmk', '.kmmmk.', '..kkk..'], { l: '#dfe3ea', m: '#8c93a8', w: '#ffffff' }],
  };
  const ITEM = {
    unknown() { const g = new Grid(9, 9); g.ell(4.5, 4.5, 3.6, 3.6, RAMPS.slate); g.outline(); return g; },
    coin() { const c = new Grid(9, 9); c.ell(4.5, 4.5, 3.5, 3.5, RAMPS.sun); c.outline(); c.px([[4, 3], [4, 4], [4, 5]], '#c7861c'); c.px([[3, 2], [2, 3]], '#ffffff'); return c; },
    bigcoin() {
      const c = new Grid(11, 11);
      for (let i = 0; i < 3; i++) { const cy = 8.2 - i * 2.4; c.rect(1, Math.round(cy), 9, 2, '#c7861c'); c.ell(5.5, cy, 4.4, 1.7, RAMPS.sun); }
      c.outline(); c.px([[3, 3], [4, 3]], '#ffffff'); c.px([[5, 3]], '#fff27a'); c.px([[2, 6], [2, 8]], '#fff27a'); c.set(10, 0, '#ffffff');
      return c;
    },
    xp() {
      const c = new Grid(9, 9); c.ell(4.5, 4.5, 3.9, 3.9, ['#c3f08a', '#6abe30', '#37946e']); c.outline();
      c.px([[4, 2], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [5, 5], [3, 6], [5, 6]], '#f4fff0'); c.set(2, 2, '#ffffff');
      return c;
    },
    fruit(id) { const g = new Grid(13, 13); (FRUIT_ART[id] || FRUIT_ART.apple)(g); return g; },
    egg(id) { const g = new Grid(20, 24); (EGG_ART[id] || EGG_ART.meadow)(g); return g; },
    element(id) { const e = EL_ICON[id] || EL_ICON.normal; return fromStrings(e[0], e[1]); },
    flower(id) { const g = new Grid(12, 12); flowerArt(g, id, 6, 6); g.outline(); flowerDetail(g, id, 6, 6); return g; },
    // 7x7 shiny gumball; id = colour index 0..7
    gumball(id) {
      const n = (((parseInt(id, 10) || 0) % 8) + 8) % 8, R2 = GUM[n], g = new Grid(7, 7);
      g.ell(3.5, 3.5, 2.6, 2.6, R2); g.outline(); g.set(2, 2, '#ffffff'); return g;
    },
    // 13x13 paint tin in a body colour, paint dripping over the rim
    paint(id) {
      const R2 = RAMPS[id] || RAMPS.mint, M = ['#dfe4ee', '#aab2c2', '#6e7690'], g = new Grid(13, 13);
      g.rect(2, 5, 9, 6, M[1]); g.ell(6.5, 10.6, 4.5, 1.5, M[1]);
      g.ell(6.5, 5, 4.5, 1.7, '#f4f6fa');
      g.outline();
      for (let y = 5; y < 13; y++) for (let x = 0; x < 13; x++) if (g.get(x, y) === M[1]) { if (x <= 3) g.set(x, y, M[0]); else if (x >= 9) g.set(x, y, M[2]); }
      g.ell(6.5, 5, 3.6, 1.1, R2[1], 0, MK(g)); g.set(4, 4, R2[0]); g.set(5, 4, R2[0]);
      for (const [x, y0, n] of [[3, 6, 3], [5, 6, 1], [7, 6, 4], [9, 6, 2]]) for (let y = y0; y < y0 + n; y++) g.set(x, y, y === y0 + n - 1 ? R2[2] : x < 5 ? R2[0] : R2[1]);
      g.px([[4, 6], [8, 6], [6, 6]], R2[1]);
      g.px([[1, 4], [1, 3], [2, 2], [3, 1], [4, 1], [5, 0], [6, 0], [7, 0], [8, 1], [9, 1], [10, 2], [11, 3], [11, 4]], '#595a70');
      return g;
    },
    // 13x13 round sticker showing a body pattern
    pattern(id) {
      const g = new Grid(13, 13), C = '#fbf3dc';
      g.ell(6.5, 6.5, 4.7, 4.7, RAMPS.mint);
      const on = MK(g), put = (pts, c) => g.px(pts.filter(([x, y]) => on(x, y)), c);
      switch (id) {
        case 'spots': put([[4, 4], [5, 4], [4, 5], [8, 5], [8, 6], [9, 5], [5, 8], [6, 8], [9, 9]], C); break;
        case 'stripes': for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) if ((x + y) % 4 === 0) put([[x, y]], C); break;
        case 'twotone': for (let y = 0; y < 7; y++) for (let x = 0; x < 13; x++) put([[x, y]], C); break;
        case 'mask': for (let y = 5; y < 8; y++) for (let x = 0; x < 13; x++) put([[x, y]], C); break;
        case 'star': g.poly(starPts(6.5, 6.9, 3.8, 1.6, 5), '#f6c83a'); g.px([[6, 5]], '#fff27a'); break;
        case 'freckles': put([[3, 6], [4, 5], [5, 6], [8, 6], [9, 5], [10, 6], [6, 3]], '#a8653a'); put([[4, 8], [5, 8], [8, 8], [9, 8]], '#f4a3b8'); break;
        case 'heart': g.px([[4, 4], [5, 4], [7, 4], [8, 4], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [5, 8], [6, 8], [7, 8], [6, 9]], '#e8608a'); g.px([[4, 5]], '#ffb0c8'); break;
        case 'socks': piece(g, t => t.str(['......ppp', '......www', '......www', '.....wwww', '...wwwwww', '...ppwwwp'], 0, 3, { p: '#f07aa8', w: '#ffffff' })); g.px([[5, 8], [6, 8], [7, 8]], '#dfe8fb'); break;
        default: break;
      }
      g.outline('#ffffff'); g.outline();
      return g;
    },
    // 16x14 icon of a hat or extra (same art as on the Sprig)
    hat(id) {
      const h = new Grid(32, 32);
      if (EXTRA_IDS.includes(id)) extraArt(h, id, false); else hatArt(h, id, false, null);
      h.outline();
      return cropCentre(h, 16, 14);
    },
    // 13x13 orb in a special skin
    skin(id) {
      const g = new Grid(13, 13);
      g.ell(6.5, 6.5, 5.3, 5.3, SKIN_SENT); g.outline();
      applySkin(g, SKINS[id] ? id : 'gold', 6.5, 6.5, 0.62, id === 'mummy' ? RAMPS.sun : RAMPS.cream);
      g.px([[4, 3], [3, 4]], '#ffffff');
      return g;
    },
  };
  // copy the filled bounding box of g, centred, into a w x h grid (clipped if larger)
  function cropCentre(g, w, h) {
    let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const o = new Grid(w, h); if (x1 < 0) return o;
    const ox = Math.floor((w - (x1 - x0 + 1)) / 2) - x0, oy = Math.floor((h - (y1 - y0 + 1)) / 2) - y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = g.get(x, y); if (c) o.set(x + ox, y + oy, c); }
    return o;
  }

  // ---------------- Gumball machine (40x60, anchor bottom-centre 20,60) ----------------
  const gumCache = {};
  function buildGumballMachine(frame) {
    const W = 40, H = 60, g = new Grid(W, H), cx = 20;
    const RED = ['#ff8a8a', '#e0303c', '#961c30'], MET = ['#ffffff', '#c8d0dc', '#7a8498'], GL = ['#f4fbff', '#dcf0fc', '#b4d8ee'];
    const gcy = 19.4, grx = 12.4, gry = 12;
    // glass globe + gumballs
    const inGlobe = (x, y) => inEll(x + 0.5, y + 0.5, cx, gcy, grx, gry).in;
    g.ell(cx, gcy, grx, gry, GL);
    // pile of 4x4 gumballs in hex rows (they interlock exactly), shaded light top-left / dark bottom-right
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const BALL = [[1, 0, 0], [2, 0, 1], [0, 1, 0], [1, 1, 3], [2, 1, 1], [3, 1, 1], [0, 2, 1], [1, 2, 1], [2, 2, 1], [3, 2, 2], [1, 3, 2], [2, 3, 2]];
    let bag = [];
    const nextCol = () => { if (!bag.length) { bag = [0, 1, 2, 3, 4, 5, 6, 7]; for (let i = 7; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); };
    for (let r = 0; r < 6; r++) {
      const y0 = 27 - r * 3;
      for (let c = -1; c < 9; c++) {
        const x0 = 6 + (r % 2) * 2 + c * 4;
        if (!inEll(x0 + 2, y0 + 2, cx, gcy, grx - 0.4, gry - 0.4).in) continue;
        const n = nextCol();
        for (const [dx, dy, t] of BALL) if (inGlobe(x0 + dx, y0 + dy)) g.set(x0 + dx, y0 + dy, t === 3 ? mixHex(GUM[n][0], '#ffffff', 0.6) : GUM[n][t]);
      }
    }
    // lid + knob
    piece(g, t => { t.ell(cx, 8.6, 7.4, 2.8, RED, 0, (x, y) => y <= 8); t.rect(13, 8, 14, 2, RED[1]); t.rect(13, 9, 14, 1, RED[2]); });
    piece(g, t => t.ell(cx, 4.4, 2.2, 1.9, RED));
    // collar + body + base
    piece(g, t => { t.ell(cx, 31.4, 9, 2.2, RED); });
    const cyl = (t, cols, x0c, half) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t.get(x, y)) { const u = (x + 0.5 - x0c) / half; t.set(x, y, u < -0.55 ? cols[0] : u > 0.45 ? cols[2] : cols[1]); } };
    piece(g, t => { t.poly([[11.4, 33], [28.6, 33], [30.6, 53.4], [9.4, 53.4]], RED[1]); cyl(t, RED, cx, 10); });
    piece(g, t => { t.poly([[7.4, 53], [32.6, 53], [34, 58.6], [6, 58.6]], '#b02438'); cyl(t, ['#e0505e', '#b02438', '#781426'], cx, 13); });
    // coin plate + slot
    piece(g, t => t.rect(16, 34, 8, 3, MET[1]));
    // crank disk + handle (frames 0,1,2 = 0, 1/3, 2/3 turn)
    const ang = ((frame | 0) % 3) * (2 * Math.PI / 3), dcx = cx, dcy = 41.6;
    const kx = dcx + Math.cos(ang) * 5.2, ky = dcy + Math.sin(ang) * 5.2;
    piece(g, t => t.ell(dcx, dcy, 4.3, 4.3, MET));
    // chute
    piece(g, t => t.rect(16, 49, 8, 3, frame === 3 ? '#3a2438' : MET[1]));
    piece(g, t => t.ell(kx, ky, 1.9, 1.9, RED));
    g.outline();
    // details
    g.px([[17, 35], [22, 35]], '#595a70'); g.px([[18, 35], [19, 35], [20, 35], [21, 35]], INK); g.set(16, 34, MET[0]); g.set(17, 34, MET[0]);
    line(g, dcx, dcy, dcx + Math.cos(ang) * 3.2, dcy + Math.sin(ang) * 3.2, MET[2]); g.set(Math.floor(dcx), Math.floor(dcy), INK);
    g.set(Math.floor(kx - 0.7), Math.floor(ky - 0.7), RED[0]);
    if (frame === 3) {
      g.px([[17, 50], [18, 50], [19, 50], [20, 50], [21, 50], [22, 50]], '#23162a');
      const F = new Grid(W, H); F.rect(16, 52, 8, 2, MET[1]); F.rect(16, 52, 8, 1, MET[0]); F.outline();
      for (let i = 0; i < F.a.length; i++) if (F.a[i]) g.a[i] = F.a[i];
    } else {
      g.px([[16, 49], [17, 49], [18, 49], [19, 49], [20, 49], [21, 49], [22, 49], [23, 49]], MET[0]);
      g.px([[16, 51], [17, 51], [18, 51], [19, 51], [20, 51], [21, 51], [22, 51], [23, 51]], MET[2]);
      g.px([[19, 50], [20, 50]], '#595a70');
    }
    // glass highlight
    for (let deg = 196; deg <= 250; deg += 6) { const a = deg * Math.PI / 180, x = Math.floor(cx + Math.cos(a) * (grx - 2.6)), y = Math.floor(gcy + Math.sin(a) * (gry - 2.6)); if (inGlobe(x, y)) g.set(x, y, '#ffffff'); }
    g.px([[13, 12], [14, 12], [13, 13]], '#ffffff'); g.px([[28, 26], [29, 25]], '#ffffff');
    g.px([[18, 3], [19, 3]], RED[0]); g.px([[14, 7], [15, 7]], RED[0]);
    g.px([[12, 36], [12, 37], [12, 38], [12, 40], [12, 41]].filter(([x, y]) => g.filled(x, y)), '#ffb0b0');
    return g;
  }
  function gumballMachine(frame) {
    const f = ((frame | 0) % 4 + 4) % 4;
    if (gumCache[f]) return gumCache[f];
    let c;
    try { c = buildGumballMachine(f).canvas(); } catch (e) { console.error('PX.gumballMachine', e); const g = new Grid(40, 60); g.ell(20, 19, 12, 12, RAMPS.cloud); g.rect(11, 32, 18, 26, RAMPS.berry[1]); g.outline(); c = g.canvas(); }
    return (gumCache[f] = c);
  }

  // ---------------- Fruit (12x12, centre 6,6) ----------------
  const fruitCache = {};
  function fruit(kind) {
    if (fruitCache[kind]) return fruitCache[kind];
    const g = new Grid(13, 13);
    if (kind === 'sun') {
      const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.6 : 5.4, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([6.5 + Math.cos(a) * r, 6.8 + Math.sin(a) * r]); }
      g.poly(pts, '#f6c83a'); g.outline(); g.px([[5, 5], [5, 6], [6, 5]], '#fff27a'); g.px([[8, 8], [7, 9]], '#c7861c');
    } else if (kind === 'moon') {
      g.ell(6.5, 6.5, 4.6, 4.6, RAMPS.plum); g.ell(8.8, 5, 3.6, 3.6, null); g.outline(); g.px([[3, 5], [3, 6]], '#c9a2f0');
    } else {
      g.ell(6.5, 7.2, 4.3, 4, RAMPS.berry); g.rect(6, 1, 1, 2, '#663931'); g.ell(8.6, 2.3, 1.7, 0.9, '#6abe30', -0.4);
      g.outline(); g.px([[4, 5], [4, 6]], '#ffffff');
    }
    return (fruitCache[kind] = g.canvas());
  }

  // ---------------- Tiny FX sprites ----------------
  const fxCache = {};
  function fx(kind, color) {
    const key = kind + color; if (fxCache[key]) return fxCache[key];
    let g;
    if (kind === 'heart') g = fromStrings(['.kk.kk.', 'kRRkRRk', 'kRRRRRk', '.kRRRk.', '..kRk..', '...k...']);
    else if (kind === 'spark') g = fromStrings(['.c.', 'ccc', '.c.'], { c: color || '#fbf236' });
    else if (kind === 'bigspark') g = fromStrings(['..c..', '..c..', 'ccwcc', '..c..', '..c..'], { c: color || '#fbf236' });
    else if (kind === 'drop') g = fromStrings(['c', 'c'], { c: color || '#cbdbfc' });
    else if (kind === 'leaf') g = fromStrings(['.e', 'e.'], {});
    else if (kind === 'shell') g = fromStrings(['ww', 'wW'], {});
    else if (kind === 'feather') g = fromStrings(['ww.', '.ww'], {});
    else g = fromStrings(['c'], { c: color || '#fff' });
    return (fxCache[key] = g.canvas());
  }

  // ---------------- Props for gardens (anchor bottom-centre) ----------------
  const propCache = {};
  const hsh = (x, y, s) => { let h = Math.imul(x + 31 * (s || 0), 374761393) ^ Math.imul(y + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // leafy texture: small lit leaves with a shadow under them, one tone off the local shade
  function foliage(g, R, dens, s) {
    const inR = c => c === R[0] || c === R[1] || c === R[2], out = [];
    for (let y = 1; y < g.h - 1; y++) for (let x = 1; x < g.w - 1; x++) {
      const c = g.get(x, y); if (!inR(c) || hsh(x, y, s) > dens) continue;
      if (!inR(g.get(x, y + 1)) || !inR(g.get(x - 1, y)) || !inR(g.get(x + 1, y)) || !inR(g.get(x, y - 1))) continue;
      const i = R.indexOf(c);
      out.push([x, y, R[Math.max(0, i - 1)]], [x, y + 1, R[Math.min(2, i + 1)]], [x + 1, y + 1, R[Math.min(2, i + 1)]]);
    }
    for (const [x, y, c] of out) if (inR(g.get(x, y))) g.set(x, y, c);
  }
  // bark: broken vertical grain lines on the given trunk colours
  function bark(g, cols, dark, s) { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (cols.includes(g.get(x, y)) && hsh(x, y >> 2, s) < 0.2 && g.get(x - 1, y) !== INK) g.set(x, y, dark); }
  function prop(kind, theme) {
    theme = theme || 'day';
    const key = kind + theme; if (propCache[key]) return propCache[key];
    let g;
    const leafR = theme === 'candy' ? ['#ffc3dc', '#f08cbc', '#b8508a'] : theme === 'night' ? ['#52c7a8', '#2f8078', '#1f5452'] : ['#99e550', '#6abe30', '#37946e'];
    switch (kind) {
      case 'tree':
        g = new Grid(30, 38); g.dither = false;
        g.poly([[12.5, 38], [13.5, 22], [16.5, 22], [17.5, 38]], '#8f563b'); g.rect(13, 22, 1, 16, '#a8653a');
        g.ell(15, 15, 10.5, 9, leafR); g.ell(7.5, 20, 6.2, 5, leafR); g.ell(22.5, 20, 6.2, 5, leafR); g.ell(15, 7.5, 7, 5.6, leafR);
        g.outline();
        foliage(g, leafR, 0.05, 3); bark(g, ['#8f563b'], '#663931', 1);
        g.px([[10, 11], [11, 10], [19, 13], [8, 19], [21, 18], [14, 6]], leafR[0]);
        g.px([[9, 10], [10, 9], [13, 5]].filter(([x, y]) => g.filled(x, y)), mixHex(leafR[0], '#ffffff', 0.45));
        g.px([[12, 37], [18, 37], [11, 36]].filter(([x, y]) => !g.get(x, y)), leafR[1]);
        break;
      case 'bigtree':
        g = new Grid(46, 52); g.dither = false;
        g.poly([[19.5, 52], [20.5, 31], [25.5, 31], [26.5, 52]], '#8f563b'); g.rect(21, 31, 1, 21, '#a8653a'); g.rect(25, 34, 1, 18, '#663931');
        g.ell(23, 21, 15.5, 12.5, leafR); g.ell(11.5, 28, 9, 6.8, leafR); g.ell(34.5, 28, 9, 6.8, leafR); g.ell(23, 10.5, 10.5, 7.8, leafR);
        g.outline();
        foliage(g, leafR, 0.045, 5); bark(g, ['#8f563b'], '#663931', 2);
        g.px([[14, 16], [15, 15], [16, 15], [27, 19], [28, 18], [7, 26], [8, 25], [31, 25], [20, 6], [21, 6], [22, 5]], leafR[0]);
        g.px([[13, 15], [14, 14], [19, 5], [6, 25]].filter(([x, y]) => g.filled(x, y)), mixHex(leafR[0], '#ffffff', 0.45));
        g.px([[18, 30], [19, 30], [29, 31], [30, 31], [12, 33], [36, 33]], leafR[2]);
        g.px([[23, 40], [23, 41], [22, 44]].filter(([x, y]) => g.filled(x, y)), '#5a3322'); g.set(24, 42, '#5a3322');
        g.px([[18, 51], [19, 51], [27, 51], [28, 51], [17, 50]].filter(([x, y]) => !g.get(x, y)), leafR[1]);
        break;
      case 'bush':
        g = new Grid(20, 12);
        g.ell(6, 7, 5, 4.4, leafR); g.ell(14, 7, 5, 4.4, leafR); g.ell(10, 5, 5.4, 4.6, leafR);
        g.outline(); foliage(g, leafR, 0.14, 7);
        g.px([[5, 5], [11, 3], [15, 6], [8, 8]], '#f7b6c8'); g.px([[12, 7], [7, 4]], '#fbf236'); g.px([[5, 4], [11, 2]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
        break;
      case 'bench':
        g = new Grid(22, 13);
        g.rect(1, 1, 20, 2, '#b8743a').rect(1, 4, 20, 2, '#b8743a').rect(1, 7, 20, 2, '#d9a066').rect(2, 9, 2, 3, '#663931').rect(18, 9, 2, 3, '#663931').rect(2, 3, 1, 4, '#663931').rect(19, 3, 1, 4, '#663931');
        g.outline();
        for (let x = 1; x < 21; x++) { g.set(x, 1, '#d9a066'); g.set(x, 4, '#d9a066'); g.set(x, 7, '#f0c890'); if (x % 7 === 3) { g.set(x, 2, '#8f563b'); g.set(x + 2, 5, '#8f563b'); g.set(x + 1, 8, '#b8743a'); } }
        g.px([[2, 9], [18, 9]], '#8f563b');
        break;
      case 'lamp':
        g = new Grid(9, 26);
        g.rect(4, 8, 1, 17, '#595a70').rect(2, 24, 5, 1, '#595a70').rect(2, 2, 5, 1, '#595a70').rect(2, 3, 5, 5, theme === 'night' ? '#fff27a' : '#fbf3dc').rect(3, 1, 3, 1, '#595a70');
        g.outline();
        break;
      case 'house':
        g = new Grid(22, 21);
        g.poly([[5, 20], [6, 10], [16, 10], [17, 20]], '#fbf3dc');
        g.ell(11, 10, 10, 7, theme === 'candy' ? RAMPS.plum : RAMPS.berry, 0, (x, y) => y <= 10);
        g.outline();
        g.rect(9, 15, 4, 5, '#8f563b'); g.px([[11, 17]], '#fbf236'); g.px([[14, 13]], theme === 'night' ? '#fff27a' : '#9fd8ff');
        g.px([[6, 6], [7, 6], [11, 4], [12, 4], [11, 5], [15, 7], [16, 7]], '#ffffff');
        break;
      case 'rock':
        g = new Grid(14, 9);
        g.ell(7, 5.5, 6, 3.6, RAMPS.slate); g.ell(10.6, 6.6, 2.6, 1.8, RAMPS.slate); g.outline();
        g.px([[4, 3], [5, 3], [3, 4]], '#dfe8fb'); g.px([[7, 4], [8, 5], [8, 6]], '#6e7690'); g.px([[9, 2], [10, 2], [11, 2], [10, 3]], theme === 'night' ? '#2f8078' : theme === 'candy' ? '#f7b6c8' : '#6abe30'); g.set(10, 2, theme === 'night' ? '#52c7a8' : theme === 'candy' ? '#ffffff' : '#99e550');
        break;
      case 'ball':
        g = new Grid(8, 8);
        g.ell(4, 4, 3.4, 3.4, '#ffffff'); g.rect(1, 1, 2, 6, '#d24552'); g.rect(5, 1, 2, 6, '#639bff'); g.ell(4, 4, 3.4, 3.4, null, 0, () => false);
        // re-clip stripes to the circle
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!inEll(x + 0.5, y + 0.5, 4, 4, 3.4, 3.4).in) g.set(x, y, null);
        g.outline(); g.px([[3, 2]], '#ffffff');
        break;
      case 'egg':
        g = new Grid(20, 24);
        g.ell(10, 13, 7.6, 10, RAMPS.cloud);
        g.ell(7, 10, 2.2, 2.2, '#52c7a8', 0, (x, y) => g.filled(x, y)); g.ell(13, 17, 2.8, 2.4, '#52c7a8', 0, (x, y) => g.filled(x, y)); g.ell(13.5, 7, 1.4, 1.4, '#52c7a8', 0, (x, y) => g.filled(x, y));
        g.outline();
        break;
      case 'flowerbed': {
        g = new Grid(22, 11);
        const cols = theme === 'night' ? ['#c9a2f0', '#9fd8ff', '#ffffff', '#fff27a', '#c9a2f0'] : theme === 'candy' ? ['#ffc3dc', '#fff27a', '#a6f2d3', '#c9a2f0', '#9fd8ff'] : ['#f7b6c8', '#fbf236', '#ffffff', '#9fd8ff', '#d95763'];
        g.ell(11, 8.4, 10, 2.4, RAMP_X.bark, 0, (x, y) => y >= 6);
        for (let i = 0; i < 6; i++) g.ell(2.6 + i * 3.4, 6.6, 1.6, 1, leafR, i % 2 ? 0.4 : -0.4);
        const heads = [[3, 3.6], [6.6, 2.6], [10.2, 3.8], [13.8, 2.4], [17.4, 3.6], [19.6, 5]];
        heads.forEach(([x, y], i) => { g.rect(Math.floor(x), Math.floor(y) + 1, 1, 6 - Math.floor(y), leafR[2]); g.ell(x + 0.5, y, 1.5, 1.4, cols[i % cols.length]); });
        g.outline();
        heads.forEach(([x, y], i) => g.set(Math.floor(x), Math.floor(y), i % 2 ? '#f6c83a' : '#fff6d0'));
        g.px([[4, 9], [9, 9], [15, 9]], '#5a3322');
        break;
      }
      case 'dock':
        g = new Grid(26, 12);
        g.rect(3, 5, 2, 6, '#5a3322'); g.rect(12, 5, 2, 6, '#5a3322'); g.rect(21, 5, 2, 6, '#5a3322');
        g.rect(1, 2, 24, 3, theme === 'candy' ? '#f0c890' : '#b8743a');
        g.outline();
        g.rect(1, 2, 24, 1, theme === 'candy' ? '#ffe4b8' : '#d9a066');
        for (let x = 4; x < 25; x += 5) g.px([[x, 2], [x, 3], [x, 4]], theme === 'candy' ? '#c89a60' : '#8f563b');
        g.px([[2, 3], [7, 3], [12, 3], [17, 3], [22, 3]], '#595652');
        g.px([[3, 9], [12, 9], [21, 9]], '#7a4a2e'); g.px([[4, 6], [13, 6], [22, 6]], '#8f563b');
        break;
      case 'palm': {
        g = new Grid(28, 42);
        const TR = ['#e0b070', '#b8843a', '#7a5228'];
        for (let i = 0; i <= 14; i++) { const t = i / 14; g.ell(12 + 4 * t * t, 39.6 - t * 27, 2 - t * 0.4, 1.4, TR); }
        const fr = [[[16, 11], [12, 12.4], [9, 15.6]], [[16, 11], [20, 12], [23, 15.4]], [[16, 11], [11, 9], [6, 9.6], [3, 12.6]], [[16, 11], [21, 8.4], [24.6, 9], [26, 12]], [[16, 11], [12, 7], [7.6, 5.6], [4.6, 7.2]], [[16, 11], [19.4, 6], [23, 4.8], [25, 6.4]], [[16, 11], [15, 6.4], [13.2, 3]]];
        for (const f of fr) piece(g, t => stroke(t, f, 1.9, 0.7, leafR[1]));
        for (const f of fr) for (let i = 1; i < f.length; i++) line(g, f[i - 1][0], f[i - 1][1] - 0.6, f[i][0], f[i][1] - 0.6, leafR[0]);
        g.ell(14.6, 13.6, 1.4, 1.4, RAMP_X.bark); g.ell(17.4, 13.8, 1.4, 1.4, RAMP_X.bark); g.ell(16, 15, 1.3, 1.3, RAMP_X.bark);
        g.outline();
        for (let y = 16; y < 41; y += 3) for (let x = 0; x < 28; x++) if (g.get(x, y) === TR[1] || g.get(x, y) === TR[0]) g.set(x, y, TR[2]);
        g.px([[14, 13], [17, 13]], '#c48a5c'); g.set(16, 11, leafR[2]);
        break;
      }
      case 'sandcastle': {
        g = new Grid(24, 20);
        const S = theme === 'candy' ? ['#fff0f8', '#ffd0e4', '#e090b8'] : ['#fff0c0', '#f2d49a', '#c8a060'];
        g.rect(2, 12, 20, 7, S[1]); g.rect(3, 7, 5, 6, S[1]); g.rect(16, 7, 5, 6, S[1]); g.rect(9, 5, 6, 8, S[1]);
        for (const x of [3, 5, 7, 16, 18, 20]) g.rect(x, 6, 1, 1, S[1]);
        for (const x of [9, 11, 13]) g.rect(x, 4, 1, 1, S[1]);
        g.px([[11, 1], [11, 2], [11, 3]], '#8f563b'); g.px([[12, 1], [13, 1], [12, 2]], '#d24552');
        g.outline();
        for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) { const c = g.get(x, y); if (c !== S[1]) continue; if (g.get(x + 1, y) === INK) g.set(x, y, S[2]); else if (g.get(x, y - 1) === INK || g.get(x - 1, y) === INK) g.set(x, y, S[0]); }
        g.rect(11, 14, 2, 5, '#8f563b'); g.px([[11, 13], [12, 13]], '#8f563b'); g.px([[5, 9], [18, 9], [11, 8], [12, 8]], '#8f563b');
        g.px([[4, 16], [8, 17], [16, 15], [19, 17]], S[2]); g.px([[7, 17]], '#f7b6c8');
        break;
      }
      case 'umbrella': {
        g = new Grid(22, 28);
        const st = theme === 'candy' ? ['#f07a9a', '#fff4f8'] : theme === 'night' ? ['#9a6ad0', '#fbf3dc'] : ['#e8404a', '#ffffff'];
        g.rect(10, 8, 2, 19, '#fbf3dc');
        g.ell(11, 10, 10, 7, st[0], 0, (x, y) => y <= 9);
        g.px([[10, 2], [11, 2]], '#f6c83a');
        g.outline();
        for (let y = 0; y < 10; y++) for (let x = 0; x < 22; x++) if (g.filled(x, y) && y >= 3) { const a = Math.atan2(y + 0.5 - 11, x + 0.5 - 11), sct = Math.floor((a + Math.PI) / (Math.PI / 6)); const dark = x > 15; g.set(x, y, sct % 2 ? (dark ? '#c8c8d8' : st[1]) : (dark ? '#a02c3a' : st[0])); }
        g.px([[5, 5], [6, 4]], '#ffffff'); g.px([[11, 8], [11, 12], [11, 18], [11, 24]], '#d9c9a8');
        for (let x = 1; x < 21; x += 3) if (g.get(x, 10) === null) g.set(x, 10, st[0]);
        break;
      }
      case 'shells':
        g = new Grid(14, 7);
        g.ell(4, 4.6, 2.8, 2.4, ['#ffd0dc', '#f7a6c0', '#c86a8a'], 0, (x, y) => y <= 5); g.rect(3, 5, 2, 1, '#f7a6c0');
        g.ell(10.2, 4.4, 2, 1.7, RAMP_X.cream); g.poly([[11.6, 3.4], [13, 3.4], [12, 5]], '#f4e6c8');
        g.px([[7, 5], [6, 5], [8, 5], [7, 4]], '#f08a6a');
        g.outline();
        g.px([[3, 3], [3, 4], [5, 3], [5, 4]], '#c86a8a'); g.px([[9, 4], [10, 3], [10, 4]], '#c8b08a');
        break;
      case 'rockpool':
        g = new Grid(24, 10);
        g.ell(12, 3.6, 3, 1.6, RAMPS.slate);
        g.ell(12, 6, 8.5, 2.8, ['#b8f0f8', '#5fcde4', '#306082']);
        g.ell(3.6, 6.2, 3, 2.6, RAMPS.slate); g.ell(20.4, 6.2, 3, 2.4, RAMPS.slate); g.ell(8, 8, 2.6, 1.3, RAMPS.slate); g.ell(16, 8.2, 2.8, 1.2, RAMPS.slate);
        g.outline();
        g.px([[13, 6], [12, 7], [14, 7], [13, 5], [12, 6], [14, 6]].slice(0, 5), '#f08a6a'); g.px([[9, 5], [10, 5], [17, 5]], '#ffffff'); g.px([[3, 5], [19, 5]], '#dfe8fb'); g.px([[6, 4]], '#6abe30');
        break;
      case 'glowtree': {
        g = new Grid(40, 48); g.dither = false;
        const CR2 = theme === 'candy' ? ['#c878c0', '#8a3a8a', '#5a1c5a'] : ['#4a70b8', '#2c3c78', '#1c2450'];
        g.poly([[16.5, 48], [17.5, 30], [22.5, 30], [23.5, 48]], '#3a2a50'); g.rect(18, 30, 1, 18, '#524b6e');
        g.poly([[17.5, 36], [12, 31], [13, 30], [18.5, 34]], '#3a2a50');
        g.ell(20, 20, 13.5, 11, CR2); g.ell(10, 27, 8, 6, CR2); g.ell(30, 27, 8, 6, CR2); g.ell(20, 10, 9, 7, CR2);
        g.outline();
        foliage(g, CR2, 0.045, 9); bark(g, ['#3a2a50'], '#2a1c3a', 3);
        g.px([[13, 14], [14, 13], [15, 13], [24, 17], [25, 16], [7, 24], [8, 23], [28, 23], [18, 5], [19, 5]], CR2[0]);
        const fruits = [[12, 18], [22, 12], [28, 20], [17, 25], [8, 28], [31, 29], [24, 27], [16, 9]];
        fruits.forEach(([x, y], i) => { const c = i % 3 === 2 ? '#9ff8ff' : '#fff27a'; g.px([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], c); g.set(x, y, '#ffffff'); g.set(x + 1, y + 1, i % 3 === 2 ? '#5fcde4' : '#f6c83a'); for (const [dx, dy] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) if (g.filled(x + dx, y + dy)) g.set(x + dx, y + dy, CR2[0]); });
        for (const [x, y] of [[3, 16], [37, 18], [8, 5], [33, 8], [2, 34]]) g.set(x, y, '#fff27a');
        break;
      }
      case 'glowshroom': {
        g = new Grid(14, 15);
        const GR = theme === 'candy' ? ['#ffe0f4', '#f78ad0', '#b8508a'] : ['#c8fff8', '#5fe8e0', '#2f8f98'];
        g.rect(4, 8, 3, 6, '#f0e8d8'); g.rect(10, 11, 2, 3, '#f0e8d8');
        g.ell(5.5, 7.4, 4.6, 3.8, GR, 0, (x, y) => y <= 7.5); g.ell(11, 10.8, 2.8, 2.4, GR, 0, (x, y) => y <= 10.5);
        g.outline();
        g.px([[3, 5], [6, 4], [7, 6], [10, 9]], '#ffffff'); g.px([[4, 12], [10, 12]], '#c8bca8'); g.px([[4, 7], [5, 7], [6, 7]], GR[2]);
        for (const [x, y] of [[0, 3], [12, 5], [13, 8], [1, 10], [9, 2]]) if (!g.get(x, y)) g.set(x, y, GR[0]);
        break;
      }
      case 'crystal': {
        g = new Grid(14, 21);
        const CX = theme === 'candy' ? ['#ffe8f4', '#f7a6d0', '#c0508a'] : theme === 'day' ? ['#e8fcff', '#8ee0f0', '#3f8fc0'] : ['#f0e0ff', '#c09af0', '#7a50c0'];
        g.poly([[5, 18], [5, 6], [7, 2], [9, 6], [9, 18]], CX[1]);
        g.poly([[1.6, 18], [2, 11], [3.6, 8.4], [5.2, 11], [5.2, 18]], CX[1]);
        g.poly([[9, 18], [9, 12], [10.8, 9.6], [12.4, 12], [12.4, 18]], CX[1]);
        g.ell(7, 18.4, 6.4, 1.6, RAMPS.slate);
        g.outline();
        for (let y = 0; y < 18; y++) for (let x = 0; x < 14; x++) if (g.get(x, y) === CX[1]) { if (x === 6 || x === 2 || x === 9) g.set(x, y, CX[0]); else if (x === 8 || x === 4 || x === 11 || x === 12) g.set(x, y, CX[2]); }
        g.px([[6, 4], [6, 5], [6, 7]], '#ffffff'); g.px([[0, 4], [12, 5], [13, 2]], '#ffffff'); g.px([[10, 7]], CX[0]);
        break;
      }
      case 'lantern': {
        g = new Grid(11, 28);
        const lit = theme === 'day' ? ['#fff8e0', '#ffe08a', '#e0a040'] : ['#fffbd0', '#fbd23a', '#df7126'];
        g.rect(5, 11, 1, 14, '#595a70'); g.rect(3, 25, 5, 2, '#595a70');
        g.rect(3, 3, 5, 1, '#595a70'); g.rect(4, 2, 3, 1, '#595a70'); g.rect(4, 11, 3, 1, '#595a70');
        g.ell(5.5, 7.4, 3.2, 3.4, lit);
        g.outline();
        g.px([[4, 5], [4, 6], [4, 7], [4, 8], [4, 9], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9]], lit[2]); g.px([[5, 6], [5, 7]], '#ffffff');
        g.px([[2, 25], [8, 25]].filter(([x, y]) => g.filled(x, y)), '#8c93a8');
        for (const [x, y] of [[0, 4], [10, 6], [0, 10], [10, 11]]) if (!g.get(x, y)) g.set(x, y, lit[0]);
        break;
      }
      case 'lollitree': {
        g = new Grid(28, 42);
        const LC = theme === 'night' ? ['#c9a2f0', '#fff4f8', '#7d8cf0'] : ['#f07a9a', '#fff4f8', '#9fd8ff'];
        g.rect(13, 18, 2, 23, '#fbf3dc');
        g.ell(14, 11, 10.2, 9.6, '#fff');
        g.ell(11.6, 21.6, 2, 1.2, '#9a6ad0', 0.4); g.ell(16.4, 21.6, 2, 1.2, '#9a6ad0', -0.4); g.ell(14, 21.6, 1, 1, '#c9a2f0');
        g.outline();
        for (let y = 0; y < 22; y++) for (let x = 0; x < 28; x++) if (g.get(x, y) === '#fff') {
          const dx = x + 0.5 - 14, dy = y + 0.5 - 11, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          const band = Math.floor(((a / (2 * Math.PI)) * 3 + r * 0.32) % 3 + 3) % 3;
          const c = LC[band]; g.set(x, y, (dx + dy > 9 && band !== 1) ? (band === 0 ? '#c0506a' : '#5f98d0') : c);
        }
        for (let y = 23; y < 41; y++) for (let x = 13; x < 15; x++) if ((x + y) % 4 < 2) g.set(x, y, '#f07a9a');
        g.px([[8, 6], [9, 5], [8, 7]], '#ffffff');
        break;
      }
      case 'candycane':
        g = new Grid(12, 26);
        stroke(g, [[8, 23.4], [8, 7], [7.6, 4.4], [6, 3], [4, 3], [2.8, 4.4], [2.8, 6.6]], 1.55, 1.55, '#ffffff');
        g.outline();
        for (let y = 0; y < 26; y++) for (let x = 0; x < 12; x++) if (g.get(x, y) === '#ffffff' && ((x + y) % 4 + 4) % 4 < 2) g.set(x, y, '#e8404a');
        for (let y = 6; y < 25; y++) if (g.get(9, y) === '#ffffff') g.set(9, y, '#d8d8e8'); else if (g.get(9, y) === '#e8404a') g.set(9, y, '#a02c3a');
        break;
      case 'cupcake': {
        g = new Grid(26, 25);
        const Wr = theme === 'night' ? ['#c8b0f8', '#9a7ae8', '#6a4ab8'] : ['#b8e8ff', '#7ac8f0', '#3f8fc0'], Fr = ['#fff0f8', '#ffc3dc', '#e08cb8'];
        g.poly([[4, 14], [22, 14], [20, 23.6], [6, 23.6]], Wr[1]);
        g.ell(13, 12.6, 10, 4.4, Fr); for (const [x, r] of [[5.6, 1.6], [10, 1.8], [15.4, 1.6], [20, 1.6]]) g.ell(x, 16, r, r + 0.4, Fr[1]);
        g.ell(13, 8, 6.4, 3.2, Fr); g.ell(13, 4.8, 3.4, 2, Fr);
        g.ell(14.4, 2.6, 1.6, 1.6, RAMPS.berry);
        g.outline();
        for (let y = 17; y < 24; y++) for (let x = 0; x < 26; x++) if (g.get(x, y) === Wr[1] && x % 3 === 0) g.set(x, y, Wr[2]);
        g.rect(11, 18, 4, 6, '#8f563b'); g.px([[11, 17], [12, 17], [13, 17], [14, 17]].slice(1, 3), '#8f563b'); g.px([[14, 21]], '#fbf236');
        g.px([[6, 18], [7, 18], [6, 19], [7, 19], [18, 18], [19, 18], [18, 19], [19, 19]], '#fff27a');
        g.px([[7, 11], [11, 9], [16, 10], [19, 12], [10, 13], [14, 6], [5, 13]].filter(([x, y]) => g.filled(x, y)), '#5fcde4'); g.px([[9, 11], [17, 8], [13, 12], [21, 13]].filter(([x, y]) => g.filled(x, y)), '#fbf236'); g.px([[12, 4], [15, 12]].filter(([x, y]) => g.filled(x, y)), '#99e550');
        g.px([[14, 2]], '#ffffff');
        break;
      }
      case 'gumdrops':
        g = new Grid(20, 10);
        g.ell(10, 9, 4.2, 6.6, ['#c8f0a0', '#6abe30', '#37946e'], 0, (x, y) => y <= 8);
        g.ell(4.4, 9, 3.4, 5, RAMPS.berry, 0, (x, y) => y <= 8); g.ell(15.6, 9, 3.4, 5.2, RAMPS.sun, 0, (x, y) => y <= 8);
        g.outline();
        g.px([[3, 6], [5, 5], [9, 4], [11, 6], [10, 3], [15, 5], [17, 7], [14, 7]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
        break;
      case 'fence': {
        g = new Grid(26, 14);
        const WD = theme === 'candy' ? ['#ffffff', '#fbe4f0', '#e8a2c4'] : theme === 'night' ? ['#8a90b8', '#626890', '#44486a'] : ['#e4b27a', '#c08040', '#8f563b'];
        for (const x of [2, 12, 22]) { g.rect(x, 3, 3, 10, WD[1]); g.set(x + 1, 2, WD[1]); }
        g.rect(0, 5, 26, 2, WD[1]); g.rect(0, 9, 26, 2, WD[1]);
        g.outline();
        for (const x of [2, 12, 22]) { for (let y = 2; y < 13; y++) { if (g.filled(x, y)) g.set(x, y, WD[0]); if (g.filled(x + 2, y)) g.set(x + 2, y, WD[2]); } g.set(x + 1, 6, WD[2]); g.set(x + 1, 10, WD[2]); }
        for (let x = 0; x < 26; x++) { if (g.get(x, 5) === WD[1]) g.set(x, 5, WD[0]); if (g.get(x, 9) === WD[1]) g.set(x, 9, WD[0]); if (g.get(x, 6) === WD[1] && x % 5 === 1) g.set(x, 6, WD[2]); }
        if (theme === 'candy') { for (let y = 0; y < 14; y++) for (let x = 0; x < 26; x++) if (g.filled(x, y) && g.get(x, y) !== WD[2] && (x + y) % 4 === 0) g.set(x, y, '#f07a9a'); }
        else { g.px([[6, 6], [17, 10]].filter(([x, y]) => g.filled(x, y)), WD[2]); if (theme === 'day') g.px([[13, 12], [14, 12], [3, 12]].filter(([x, y]) => g.filled(x, y)), '#6abe30'); }
        break;
      }
      case 'stump': {
        g = new Grid(18, 13);
        const BK = ['#b8804e', '#8f563b', '#5a3322'], RG = ['#fbe0b0', '#e8c088', '#c89a60'];
        g.ell(3, 11.4, 2.2, 1.2, BK); g.ell(15, 11.4, 2.2, 1.2, BK);
        g.rect(3, 5, 12, 7, BK[1]); g.ell(9, 11.2, 6, 1.6, BK[1]);
        g.ell(9, 5, 6, 2.4, RG);
        g.outline();
        for (let y = 5; y < 13; y++) for (let x = 0; x < 18; x++) { const c = g.get(x, y); if (c !== BK[1] && c !== BK[0] && c !== BK[2]) continue; if (g.get(x - 1, y) === INK) g.set(x, y, BK[0]); else if (g.get(x + 1, y) === INK || x > 12) g.set(x, y, BK[2]); else if ((x === 6 || x === 10) && y > 6) g.set(x, y, BK[2]); }
        g.px([[7, 5], [8, 5], [9, 5], [10, 5], [11, 4], [6, 4]].filter(([x, y]) => g.filled(x, y)), RG[2]); g.px([[8, 4], [9, 4], [10, 4]].filter(([x, y]) => g.filled(x, y)), RG[1]); g.set(9, 5, '#a07040'); g.px([[5, 4], [6, 3]].filter(([x, y]) => g.filled(x, y)), '#fff4d8');
        g.px([[13, 9], [13, 8]], '#ec4c64'); g.set(12, 9, '#ec4c64'); g.set(14, 9, '#ec4c64'); g.set(13, 10, '#fbf3dc'); g.set(13, 8, '#ffffff');
        g.px([[4, 8], [4, 9]], '#6abe30'); g.set(5, 7, '#99e550');
        break;
      }
      case 'mushrooms': {
        g = new Grid(14, 11);
        const CP = theme === 'night' ? ['#c8fff8', '#5fe8e0', '#2f8f98'] : theme === 'candy' ? ['#ffd8ec', '#f78ad0', '#b8508a'] : ['#ff9aa0', '#e8404a', '#a02c3a'];
        g.rect(3, 6, 2, 4, '#f4ead8'); g.rect(9, 4, 2, 6, '#f4ead8'); g.rect(12, 8, 1, 2, '#f4ead8');
        g.ell(4, 6, 3.2, 2.4, CP, 0, (x, y) => y <= 6); g.ell(10, 4.2, 3.8, 3, CP, 0, (x, y) => y <= 4); g.ell(12.4, 8, 1.6, 1.4, CP, 0, (x, y) => y <= 8);
        g.outline();
        g.px([[9, 2], [11, 3], [8, 4], [3, 5], [5, 4]].filter(([x, y]) => g.filled(x, y)), theme === 'night' ? '#ffffff' : '#fff8f0');
        g.px([[4, 9], [10, 9], [11, 8]].filter(([x, y]) => g.filled(x, y)), '#c8bca8');
        g.px([[1, 10], [6, 10], [7, 10]].filter(([x, y]) => !g.get(x, y)), theme === 'candy' ? '#f7b6c8' : theme === 'night' ? '#2f8078' : '#6abe30');
        break;
      }
      case 'driftwood': {
        g = new Grid(24, 9);
        const DW = ['#e0d4bc', '#b8a888', '#86785e'];
        stroke(g, [[2, 6], [9, 5.6], [16, 6], [21.5, 5.2]], 1.9, 1.5, DW[1]);
        stroke(g, [[12, 5], [14.6, 2.2]], 0.8, 0.6, DW[1]);
        g.outline();
        for (let y = 0; y < 9; y++) for (let x = 0; x < 24; x++) { const c = g.get(x, y); if (c !== DW[1]) continue; if (g.get(x, y - 1) === INK) g.set(x, y, DW[0]); else if (g.get(x, y + 1) === INK) g.set(x, y, DW[2]); else if ((x * 3 + y) % 7 === 0) g.set(x, y, DW[2]); }
        g.px([[8, 6], [9, 6]], '#5a4a3a'); g.set(8, 5, DW[2]);
        g.px([[3, 8], [17, 8]].filter(([x, y]) => !g.get(x, y)), '#e2c47e');
        break;
      }
      case 'surfboard': {
        g = new Grid(10, 25);
        const SB = theme === 'night' ? ['#c9a2f0', '#9a6ad0', '#5e3a8e'] : ['#9fe8ff', '#4fb8e8', '#2a78b8'];
        g.ell(5, 7, 3.2, 6, SB); g.rect(2, 7, 7, 14, SB[1]); g.ell(5, 20, 3.2, 2.4, SB[1]);
        g.outline();
        for (let y = 0; y < 25; y++) for (let x = 0; x < 10; x++) { const c = g.get(x, y); if (!c || c === INK) continue; if (x === 5) g.set(x, y, '#ffffff'); else if (x <= 3 && g.get(x - 1, y) === INK) g.set(x, y, SB[0]); else if (x >= 7) g.set(x, y, SB[2]); else if (y > 7) g.set(x, y, SB[1]); }
        g.px([[4, 11], [6, 11], [4, 12], [6, 12]], '#f6c83a'); g.set(3, 4, '#ffffff');
        g.rect(1, 21, 8, 1, null); g.rect(1, 22, 8, 3, null);
        g.px([[1, 21], [2, 21], [3, 21], [4, 21], [5, 21], [6, 21], [7, 21], [8, 21]], '#e2c47e'); g.px([[0, 21], [9, 21]], '#d9bd7c');
        break;
      }
      case 'bucket': {
        g = new Grid(16, 13);
        const BU = ['#9fd8ff', '#639bff', '#3f55b8'];
        g.poly([[2, 5], [10, 5], [9, 12], [3, 12]], BU[1]);
        g.ell(6, 5, 4, 1.3, BU[0]);
        stroke(g, [[12.4, 12], [12.4, 6]], 0.6, 0.6, '#f6c83a'); g.ell(12.4, 4.6, 1.6, 2, '#e8404a');
        g.outline();
        for (let y = 5; y < 13; y++) for (let x = 0; x < 11; x++) { const c = g.get(x, y); if (c !== BU[1]) continue; if (g.get(x - 1, y) === INK) g.set(x, y, BU[0]); else if (g.get(x + 1, y) === INK) g.set(x, y, BU[2]); }
        g.px([[4, 5], [5, 5], [6, 5], [7, 5]], '#e2c47e'); g.px([[5, 4], [6, 4]], '#f3dc9c');
        g.px([[1, 3], [2, 2], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 2], [10, 3]], '#595a70');
        g.px([[3, 8], [7, 9]], '#ffffff'); g.set(12, 4, '#ff9aa0');
        break;
      }
      case 'moonstone': {
        g = new Grid(14, 21);
        const ST2 = ['#b8bcd8', '#8a8eb0', '#5a5e80'];
        g.poly([[3, 20], [2.4, 8], [4, 3], [7, 1.4], [10, 3], [11.4, 8], [11, 20]], ST2[1]);
        g.ell(7, 19.6, 6, 1.4, '#3f6a60');
        g.outline();
        shade(g, 5.4, 8, 6, 10, ST2);
        const RU = theme === 'candy' ? '#f78ad0' : '#7ff0ff';
        g.px([[7, 6], [7, 7], [7, 8], [6, 9], [8, 9], [7, 10], [7, 11], [6, 12], [8, 12], [7, 13]], RU); g.set(7, 5, '#ffffff');
        g.px([[4, 5], [5, 4], [4, 6]].filter(([x, y]) => g.filled(x, y)), '#dfe2f4');
        g.px([[3, 16], [4, 17], [10, 15], [9, 17], [3, 18], [10, 18]].filter(([x, y]) => g.filled(x, y)), '#4f8a6a');
        for (const [x, y] of [[0, 4], [13, 7], [12, 2]]) if (!g.get(x, y)) g.set(x, y, RU);
        break;
      }
      case 'fern': {
        g = new Grid(20, 13);
        const FR = theme === 'night' ? ['#6ad0a8', '#2f8f78', '#1f5a50'] : theme === 'candy' ? ['#c8fff0', '#7ee4c4', '#3fa890'] : ['#99e550', '#5cb43a', '#2f7a4a'];
        const fronds = [[[10, 12], [5, 7], [1.6, 7.6]], [[10, 12], [6.4, 4], [3.4, 2.6]], [[10, 12], [10, 4.4], [10.4, 1.4]], [[10, 12], [13.6, 4], [16.6, 2.6]], [[10, 12], [15, 7], [18.4, 7.6]]];
        for (const f of fronds) piece(g, t => stroke(t, f, 1.7, 0.8, FR[1]));
        for (const f of fronds) { line(g, f[0][0], f[0][1] - 1, f[1][0], f[1][1] - 0.6, FR[0]); line(g, f[1][0], f[1][1] - 0.6, f[2][0], f[2][1] - 0.5, FR[0]); }
        for (let y = 0; y < 13; y++) for (let x = 0; x < 20; x++) if (g.get(x, y) === FR[1] && g.get(x, y + 1) === INK && (x + y) & 1) g.set(x, y, FR[2]);
        g.px([[9, 12], [10, 12], [11, 12]].filter(([x, y]) => g.filled(x, y)), FR[2]);
        if (theme === 'night') g.px([[2, 7], [4, 2], [10, 1], [16, 2], [18, 7]].filter(([x, y]) => g.filled(x, y)), '#b8fff0');
        break;
      }
      case 'towel': {
        g = new Grid(22, 9);
        const TW = theme === 'night' ? ['#c9a2f0', '#9fd8ff'] : ['#f07a84', '#fff4dc'];
        g.poly([[1.4, 7.8], [4, 1.2], [21, 1.2], [18.6, 7.8]], TW[1]);
        g.outline();
        for (let y = 0; y < 9; y++) for (let x = 0; x < 22; x++) if (g.get(x, y) === TW[1] && Math.floor((x - y * 0.4) / 3) % 2 === 0) g.set(x, y, TW[0]);
        for (let x = 0; x < 22; x++) if (g.filled(x, 7)) g.set(x, 7, mixHex(g.get(x, 7), INK, 0.2));
        g.px([[2, 8], [5, 8], [8, 8], [12, 8], [16, 8]].filter(([x, y]) => !g.get(x, y)), '#fff4dc');
        g.px([[16, 2], [17, 2], [16, 3]], '#ffffff');
        break;
      }
      // ---- pet storage houses (one per area; ~44x42, anchor bottom-centre; door/window spots in PX.HOMES) ----
      case 'shroomhouse': {
        g = new Grid(44, 42);
        const CR3 = ['#fffbf0', '#f4e6c8', '#c8b08a'], CAP = ['#ff8a90', '#e8404a', '#a02c3a'];
        piece(g, t => { t.poly([[10, 41.6], [11.4, 21], [32.6, 21], [34, 41.6]], CR3[1]); for (let y = 0; y < 42; y++) for (let x = 0; x < 44; x++) if (t.get(x, y)) t.set(x, y, x < 15 ? CR3[0] : x > 29 ? CR3[2] : CR3[1]); });
        piece(g, t => t.ell(22, 21, 21.4, 14.4, CAP, 0, (x, y) => y <= 22));
        g.rect(4, 22, 36, 1, '#c86a5a'); g.rect(9, 23, 26, 1, '#b8a07a');
        for (const [x, y, r] of [[13, 12, 2.6], [24, 9, 3.2], [33, 15, 2.2], [7, 18, 1.6], [19, 17, 1.8], [36, 20, 1.3], [29, 5, 1.6]]) g.ell(x, y, r, r * 0.8, ['#ffffff', '#fbf0f0', '#e8d0d0'], 0, (x2, y2) => CAP.includes(g.get(x2, y2)));
        piece(g, t => { t.ell(22, 33, 4, 4, '#8f563b', 0, (x, y) => y <= 33); t.rect(18, 33, 8, 9, '#8f563b'); });
        for (let y = 29; y < 42; y++) { if (g.get(20, y) === '#8f563b') g.set(20, y, '#663931'); if (g.get(23, y) === '#8f563b') g.set(23, y, '#663931'); if (g.get(19, y) === '#8f563b') g.set(19, y, '#a8703a'); }
        g.px([[24, 36], [24, 37]], '#fbf236');
        piece(g, t => { t.ell(30.5, 29.5, 2.8, 2.8, '#9fd8ff'); });
        g.px([[30, 28], [30, 29], [30, 30], [30, 31], [28, 29], [29, 29], [31, 29], [32, 29]].filter(([x, y]) => g.get(x, y) === '#9fd8ff'), '#8f563b'); g.set(29, 28, '#ffffff');
        g.rect(27, 33, 8, 2, '#8f563b'); g.px([[28, 32], [30, 32], [32, 32], [34, 32]], '#f7b6c8'); g.px([[29, 32], [33, 32]], '#6abe30'); g.set(31, 32, '#fbf236');
        g.px([[12, 38], [13, 36], [14, 39], [31, 39], [32, 37]].filter(([x, y]) => g.filled(x, y)), '#6abe30');
        g.px([[9, 41], [8, 41], [35, 41], [36, 41], [7, 40]].filter(([x, y]) => !g.get(x, y)), '#6abe30');
        g.px([[8, 14], [9, 12], [11, 10]].filter(([x, y]) => CAP.includes(g.get(x, y))), '#ffb0b4');
        break;
      }
      case 'beachhut': {
        g = new Grid(42, 42);
        const PL = ['#d8f4ff', '#9fd8ff', '#5f98d0'], ST3 = ['#fff0b0', '#f0d284', '#c8a050'];
        piece(g, t => { t.rect(7, 20, 28, 22, PL[1]); });
        for (let y = 20; y < 42; y++) for (let x = 7; x < 35; x++) if (g.get(x, y) === PL[1]) { if ((x - 7) % 4 === 3) g.set(x, y, PL[2]); else if ((x - 7) % 8 < 3) g.set(x, y, '#ffffff'); if (x > 31) g.set(x, y, PL[2]); }
        piece(g, t => { t.poly([[1.4, 23.6], [21, 3.4], [40.6, 23.6]], ST3[1]); shade(t, 17, 12, 16, 13, ST3); });
        for (let y = 4; y < 24; y++) for (let x = 0; x < 42; x++) if (ST3.includes(g.get(x, y)) && (x + y * 2) % 5 === 0) g.set(x, y, ST3[2]);
        for (let x = 2; x < 41; x += 3) if (g.get(x, 23) && g.get(x, 23) !== INK) g.set(x, 24, ST3[2]);
        piece(g, t => { t.rect(17, 28, 8, 14, '#f07a84'); });
        for (let y = 28; y < 42; y++) { if (g.get(18, y) === '#f07a84') g.set(18, y, '#ff9aa8'); if (g.get(24, y) === '#f07a84') g.set(24, y, '#c8485a'); }
        g.px([[23, 35]], '#fbf236');
        piece(g, t => t.rect(9, 27, 5, 5, '#9fd8ff')); piece(g, t => t.rect(28, 27, 5, 5, '#9fd8ff'));
        g.px([[9, 27], [28, 27], [10, 27]], '#ffffff'); g.px([[11, 27], [11, 28], [11, 29], [11, 30], [11, 31], [30, 27], [30, 28], [30, 29], [30, 30], [30, 31]], '#5f98d0');
        g.ell(12, 36.5, 2.4, 2.4, '#ffffff'); g.set(12, 36, '#5f98d0'); g.set(12, 37, '#5f98d0'); g.px([[10, 36], [14, 37], [12, 34], [12, 39]], '#e8404a');
        g.px([[30, 35], [29, 36], [30, 36], [31, 36], [30, 37], [29, 38], [31, 38]], '#f08a6a');
        g.px([[21, 2], [20, 1]], '#d24552'); g.set(21, 1, '#d24552'); g.set(20, 2, INK);
        break;
      }
      case 'crystalcave': {
        g = new Grid(46, 42);
        const RK = ['#9a9ec0', '#6a6e96', '#44466a'], CXa = ['#f0e0ff', '#c09af0', '#7a50c0'], CXb = ['#e0ffff', '#7ff0ff', '#2a98b8'];
        const spire = (pts, C) => piece(g, t => { t.poly(pts, C[1]); for (let y = 0; y < 42; y++) for (let x = 0; x < 46; x++) if (t.get(x, y)) { const xs = pts.map(p => p[0]), mid = (Math.min(...xs) + Math.max(...xs)) / 2; t.set(x, y, x < mid - 0.5 ? C[0] : x > mid + 0.5 ? C[2] : C[1]); } });
        spire([[12, 22], [13, 9], [15.5, 5], [17.5, 10], [18, 22]], CXa);
        spire([[26, 22], [27, 12], [29, 8.5], [31, 12], [32, 22]], CXb);
        spire([[19, 20], [20.5, 3], [23, 0.4], [25, 3], [26, 20]], CXa);
        piece(g, t => t.ell(23, 30, 22, 13, RK, 0, (x, y) => y <= 41));
        for (let y = 0; y < 42; y++) for (let x = 0; x < 46; x++) if (RK.includes(g.get(x, y)) && (x * 5 + y * 3) % 11 === 0) g.set(x, y, RK[2]);
        piece(g, t => { t.ell(23, 34, 6, 6, '#241a36', 0, (x, y) => y <= 34); t.rect(17, 34, 13, 8, '#241a36'); });
        for (let y = 29; y < 42; y++) for (let x = 17; x < 30; x++) if (g.get(x, y) === '#241a36' && y > 36 && (x + y) & 1) g.set(x, y, '#3a2a58');
        g.px([[20, 40], [21, 39], [26, 40], [25, 41], [23, 38]], '#7ff0ff'); g.px([[22, 41], [23, 41], [24, 41]], '#c8fff8');
        piece(g, t => t.ell(35, 30.5, 2.4, 2.4, '#7ff0ff')); g.set(34, 29, '#ffffff');
        g.px([[6, 27], [7, 26], [9, 25], [38, 26], [40, 28], [11, 38], [36, 37]].filter(([x, y]) => g.filled(x, y)), '#4f8a6a');
        g.px([[6, 28], [8, 26], [39, 27]].filter(([x, y]) => g.filled(x, y)), '#6ad0a8');
        g.px([[14, 7], [20, 5], [28, 11]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
        break;
      }
      case 'gingerhouse': {
        g = new Grid(42, 42);
        const GB = ['#f0b880', '#c8844a', '#8a5028'];
        piece(g, t => t.rect(6, 20, 30, 22, GB[1]));
        for (let y = 20; y < 42; y++) for (let x = 6; x < 36; x++) if (g.get(x, y) === GB[1]) { if (x < 9) g.set(x, y, GB[0]); else if (x > 32) g.set(x, y, GB[2]); }
        piece(g, t => t.rect(29, 6, 4, 9, '#8a5028'));
        piece(g, t => { t.poly([[1.4, 23.4], [21, 4], [40.6, 23.4]], '#6a3a2a'); shade(t, 17, 12, 16, 13, ['#8a5040', '#6a3a2a', '#48241c']); });
        for (let x = 1; x < 41; x++) for (let y = 4; y < 25; y++) { const c = g.get(x, y); if (c && c !== INK && g.get(x, y + 1) === INK) { g.set(x, y, '#ffffff'); if (x % 3 === 0 && y + 1 < 42 && g.get(x, y + 1) === INK) g.set(x, y + 1, '#ffffff'); break; } }
        for (let y = 4; y < 24; y++) { const r = 21 - (y - 4) * 19.6 / 19.4; for (const x of [Math.round(r), Math.round(42 - r)]) if (g.filled(x, y)) g.set(x, y, '#ffffff'); }
        g.px([[29, 6], [30, 6], [31, 6], [32, 6]], '#ffffff');
        for (const [x, y, c] of [[14, 16, '#e8404a'], [21, 11, '#99e550'], [27, 17, '#fff27a'], [18, 19, '#5fcde4'], [24, 20, '#f07aa0'], [10, 21, '#fff27a'], [32, 21, '#99e550']]) if (g.filled(x, y)) { g.set(x, y, c); if (g.filled(x + 1, y)) g.set(x + 1, y, c); }
        piece(g, t => { t.ell(21, 32, 4, 3.6, '#f7b6c8', 0, (x, y) => y <= 32); t.rect(17, 32, 8, 10, '#f7b6c8'); });
        for (let y = 28; y < 42; y++) { if (g.get(18, y) === '#f7b6c8') g.set(18, y, '#ffd8e8'); if (g.get(24, y) === '#f7b6c8') g.set(24, y, '#e07ba0'); }
        g.set(23, 36, '#fff27a');
        piece(g, t => t.rect(9, 27, 5, 5, '#9fd8ff')); piece(g, t => t.rect(28, 27, 5, 5, '#9fd8ff'));
        for (const x0 of [8, 27]) { for (let x = x0; x < x0 + 7; x++) { g.set(x, 26, '#ffffff'); g.set(x, 32, '#ffffff'); } g.set(x0 + 3, 29, '#ffffff'); g.set(x0 + 2, 29, '#ffffff'); g.set(x0 + 4, 29, '#ffffff'); }
        for (let y = 23; y < 42; y += 2) { if (g.filled(6, y)) g.set(6, y, (y >> 1) % 2 ? '#e8404a' : '#ffffff'); if (g.filled(35, y)) g.set(35, y, (y >> 1) % 2 ? '#e8404a' : '#ffffff'); }
        g.px([[12, 36], [11, 37], [13, 37], [30, 36], [29, 37], [31, 37]], '#ffffff');
        break;
      }
      case 'donut': {
        g = new Grid(22, 13);
        const DO = ['#f6c890', '#d8964e', '#a06430'], IC = theme === 'night' ? ['#e4d0ff', '#c09af0', '#8a6ad0'] : ['#ffd8ec', '#ff8ac4', '#d0508c'];
        g.ell(11, 7.4, 10, 4.8, DO);
        g.outline();
        g.ell(11, 6.4, 8.6, 3.6, IC, 0, (x, y) => g.filled(x, y));
        for (const x of [4, 8, 13, 17]) if (g.get(x, 9) && g.get(x, 9) !== INK) g.set(x, 9, IC[1]);
        g.ell(11, 6.6, 2.9, 1.6, '#5a3322'); g.ell(11, 7.4, 2.4, 0.9, DO[1], 0, (x, y) => g.get(x, y) === '#5a3322' && y >= 7); g.px([[9, 6], [10, 6], [11, 6], [12, 6]].filter(([x, y]) => g.get(x, y) === '#5a3322'), INK);
        g.px([[5, 5], [8, 4], [14, 4], [16, 6], [7, 7], [15, 8], [11, 3], [4, 7]].filter(([x, y]) => g.filled(x, y)), '#fff27a'); g.px([[6, 6], [13, 8], [10, 8], [17, 5]].filter(([x, y]) => g.filled(x, y)), '#5fcde4'); g.px([[9, 4], [12, 8], [18, 7]].filter(([x, y]) => g.filled(x, y)), '#99e550');
        g.px([[5, 4], [6, 4]].filter(([x, y]) => g.filled(x, y)), '#ffffff');
        break;
      }
      case 'lollipop': {
        g = new Grid(12, 25);
        const LP = theme === 'night' ? ['#c9a2f0', '#7d8cf0'] : [['#f07a9a', '#ffe070'], ['#9fd8ff', '#f7b6c8']][0];
        g.rect(5, 10, 2, 14, '#fff4f8');
        g.ell(6, 6, 5.2, 5.2, '#fff');
        g.outline();
        for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (g.get(x, y) === '#fff') { const dx = x + 0.5 - 6, dy = y + 0.5 - 6, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy); const b = Math.floor(((a / (2 * Math.PI)) * 2 + r * 0.62) % 2 + 2) % 2; g.set(x, y, b ? '#ffffff' : (dx + dy > 4 ? mixHex(LP[0], INK, 0.25) : LP[0])); }
        for (let y = 12; y < 24; y++) if ((y % 4) < 2) g.set(6, y, '#f7b6c8');
        g.px([[3, 3], [4, 2]], '#ffffff'); g.set(3, 4, '#ffe4ee');
        break;
      }
      case 'icecream': {
        g = new Grid(14, 22);
        const S1 = theme === 'night' ? ['#e4d0ff', '#c09af0', '#8a6ad0'] : ['#ffe0ec', '#ffb0cc', '#e07ba0'], S2 = ['#fff8e0', '#f6e0a0', '#d8b060'], S3 = ['#c8f8e8', '#7ee4c4', '#3fa890'];
        g.poly([[3, 11], [11, 11], [7, 21.4]], '#e8b060');
        g.ell(7, 10, 4.4, 2.6, S2); g.ell(7, 7, 3.8, 3, S1); g.ell(7, 3.6, 2.8, 2.4, S3);
        g.set(7, 0, '#e8404a'); g.set(8, 0, '#e8404a');
        g.outline();
        for (let y = 11; y < 22; y++) for (let x = 0; x < 14; x++) if (g.get(x, y) === '#e8b060' && ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0)) g.set(x, y, '#b87830');
        g.px([[5, 2], [5, 6], [4, 9]].filter(([x, y]) => g.filled(x, y)), '#ffffff'); g.px([[9, 7], [6, 11], [8, 4]].filter(([x, y]) => g.filled(x, y)), '#f07a84'); g.set(9, 11, '#5fcde4');
        break;
      }
      default:
        g = new Grid(12, 10); g.ell(6, 6, 5, 3.6, leafR); g.outline();
    }
    return (propCache[key] = g.canvas());
  }

  // Draw a sprite canvas into ctx anchored at bottom-centre (x,y in the same pixel space), optional flip.
  function blit(ctx, c, x, y, flip, ax, ay) {
    ax = ax == null ? Math.floor(c.width / 2) : ax; ay = ay == null ? c.height : ay;
    x = Math.round(x); y = Math.round(y);
    if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(c, -(c.width - ax), y - ay); ctx.restore(); }
    else ctx.drawImage(c, x - ax, y - ay);
  }

  // ---------------- Chiptune feedback sounds ----------------
  const Sound = (() => {
    let ac = null, muted = false;
    function ctx() { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } return ac; }
    function tone(f0, f1, dur, type, vol, delay) {
      const a = ctx(); if (!a || muted) return;
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator(), gn = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(dur, vol, freq) {
      const a = ctx(); if (!a || muted) return;
      const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
      let v = 0; for (let i = 0; i < n; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v * (1 - i / n); }
      const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
      const gn = a.createGain(); gn.gain.value = vol || 0.15; s.connect(f); f.connect(gn); gn.connect(a.destination); s.start();
    }
    const fx = {
      pop: () => tone(660, 990, 0.07, 'square', 0.04),
      coo: () => { const b = 520 + Math.random() * 200; tone(b, b * 1.5, 0.1, 'square', 0.035); tone(b * 1.5, b * 2, 0.08, 'square', 0.03, 0.08); },
      chime: () => { tone(988, 988, 0.08, 'square', 0.04); tone(1319, 1319, 0.16, 'square', 0.035, 0.07); },
      level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.04, i * 0.07)); },
      munch: () => noise(0.05, 0.18, 700),
      splash: () => { noise(0.3, 0.2, 1500); },
      crack: () => { noise(0.05, 0.3, 2400); tone(800, 300, 0.05, 'square', 0.03); },
      thud: () => tone(180, 60, 0.1, 'triangle', 0.12),
      whoosh: () => noise(0.3, 0.1, 600),
      tick: () => tone(1500, 1500, 0.025, 'square', 0.025),
      go: () => tone(1047, 1047, 0.3, 'square', 0.05),
      miss: () => tone(260, 180, 0.12, 'square', 0.04),
      evolve: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.14, 'square', 0.035, i * 0.09)); },
      snap: () => { noise(0.06, 0.25, 3000); tone(1800, 900, 0.04, 'square', 0.02); },
    };
    return {
      play(n) { try { fx[n] && fx[n](); } catch (e) { /* audio optional */ } },
      unlock() { try { const a = ctx(); if (a && a.state === 'suspended') a.resume(); } catch (e) {} },
      get muted() { return muted; }, set muted(v) { muted = !!v; },
    };
  })();
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms || 10); } catch (e) {} }

  window.PX = { PAL, RAMPS, INK, BELLY, Grid, fromStrings, inEll, shadeOf, sprig, buildSprig, SPRIG_AX, SPRIG_AY, emote, critter, critterSwim, item, fruit, fx, prop, blit, SPRIG_W, SPRIG_H, FLOWER_IDS: Object.keys(FLO).filter(k => !k.endsWith('D')), stroke, line, starPts, DEFAULT_LOOK, cloneLook, clamp, lerp, Sound, buzz,
    gumballMachine, gumballColors: GUM.map(r => r[1]),
    // pet houses: door (bottom centre) and window centres, relative to the bottom-centre anchor
    HOMES: { shroomhouse: { door: [0, 0], win: [[8, -12]], w: 36, h: 40 }, beachhut: { door: [0, 0], win: [[-10, -13], [9, -13]], w: 30, h: 38 },
      crystalcave: { door: [0, 0], win: [[12, -12]], w: 42, h: 30 }, gingerhouse: { door: [0, 0], win: [[-10, -13], [9, -13]], w: 32, h: 36 } }, GUMBALL_W: 40, GUMBALL_H: 60, SKIN_IDS, SPOOKY_SKINS, HAT_IDS, EXTRA_IDS, PATTERN_IDS: ['spots', 'stripes', 'twotone', 'mask', 'star', 'freckles', 'heart', 'socks'] };
})();
