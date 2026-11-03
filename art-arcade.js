// art-arcade.js — Solunar Sprouts: mini-game arcade art (Fruit Catch, Sprout Pairs, Star Hop, Bubble Pop, Egg Roll, the Claw Machine).
// Same definition as the Sprouts (art rule #1, docs/solunar-graphics-plan.md §0/§8): every sprite is a PX.Grid drawn in FINE pixels
// (ell / poly / stroke / fine dots, no art-pixel blocks or dither), soft 5-step ramps lit from the upper left, 1-fine-px piece lines
// and one outer ink ring (PX.hd / outerLine), colours from the game's ramps or 50/50 mixes.
// Sprouts, animals, fruit and eggs are NOT drawn here: the games reuse PX.sprig / PX.critter / PX.item('fruit' | 'egg' | 'coin').
// Never touches the DOM at load (tools/check_game.js runs art files in Node): every canvas is made on first use and cached here
// (a fixed set of keys, so the cache stays small). Sizes and anchors are in ART px; draw with PX.artW / artH (or PX.blit).
//
// Resolution (c.k = fine px per art px): most sprites are k = 2 like the Sprouts. A sprite the game draws bigger than the Sprout next
// to it is built finer, so its fine pixels match the Sprout's on screen: k = 3 when drawn at 1.5x (the Pairs cards next to Sprouts
// drawn at 2/3, the big moon and big bubbles), k = 4 when drawn at 2x the plushies (the Claw Machine's claw and prizes).
//   PX.arcade.basket()        28 x 15  Fruit Catch: the woven basket a Sprout pushes along (anchor: top middle (14, 0) = the rim)
//   PX.arcade.acorn(s)        11 x 13  Fruit Catch: what the squirrel drops (spin it round its middle); 's' = 8 x 9, the one it holds
//   PX.arcade.pinecone()      11 x 14
//   PX.arcade.card(kind)      24 x 30  Sprout Pairs cards (k 3): 'back' (sun-and-moon badge), 'face' (a window for the picture), 'fox'
//   PX.arcade.star()          11 x 11  Star Hop: a star to collect (middle (5.5, 5.5))
//   PX.arcade.moon()          13 x 13  Star Hop: a big crescent moon (worth more) (k 3: drawn at 1.5x)
//   PX.arcade.pad(size)       lily pads 's' 24 x 9 | 'm' 32 x 9 | 'l' 42 x 10 (anchor: left edge, top of the pad at y 2)
//   PX.arcade.leaf()          32 x 10  Star Hop: a floating leaf to hop up on (anchor: left edge, top at y 2)
//   PX.arcade.bubble(i, big)  26 x 26  Bubble Pop: a bubble, i 0..4 = sky / rose / orange / leaf / plum, 5 = gold, 6 = rain cloud
//                                      (big = the k 3 copy for bubbles drawn at 1.5x)
//   PX.arcade.gate(i)          9 x 24  Egg Roll: a flower post (i 0 / 1 = pink / yellow flower; anchor bottom middle (4, 23))
//   PX.arcade.flag(i)          5 x 4   Egg Roll: a bunting pennant (i 0 / 1 = pink / yellow; anchor top middle)
//   PX.arcade.puddle()        32 x 14  Egg Roll: a muddy puddle seen from above (middle (16, 7))
//   PX.arcade.padlock()       16 x 18  the hub's locked-cabinet padlock (k 4: shown at 2x the cabinet picture)
//   PX.arcade.sky(kind, v)    backgrounds: 'sun' / 'moon' 21 x 21, 'cloud' (v 0..2 = 22 x 9 | 30 x 11 | 38 x 13, v + 3 = sunset pink)
//   PX.arcade.glow(col)       24 x 24  a soft round glow (middle (12, 12)) behind gold fruit, moons and shooting stars
//   PX.arcade.trail()         24 x 24  a shooting star's fading trail (the star sits at the bottom left (1, 23))
// Claw Machine:
//   PX.arcade.claw(part)      22 x 18  the claw head, 'open' | 'shut' (anchor: top middle (11, 0), prong tips at y 17) (k 4)
//   PX.arcade.token()         13 x 13  a Claw token (a lilac coin with a little sun and moon)
//   PX.arcade.coinbag()       14 x 14  a sack of coins with a red tie (k 4)
//   PX.arcade.fruitbasket()   16 x 15  a little basket of three fruits (k 4)
//   PX.arcade.capsule(i)      14 x 14  a prize capsule (i 0..3 colours): clear top, coloured bottom (k 4)
//   PX.arcade.nest()          22 x 9   a straw nest (the game puts an egg in it)
//   PX.arcade.bulb(on)         5 x 5   a marquee light (on / off)
//   PX.arcade.plush(src)      34 x 34  a plushie: a Sprout sprite (PX.sprig canvas, any k) with stitches and a heart tag. NOT cached:
//                                      the caller caches it (k 2).
(function () {
  'use strict';
  if (!window.PX) return;
  const INK = PX.INK || '#222034';
  const cache = new Map();
  function mk(key, fn) {
    if (cache.has(key)) return cache.get(key);
    let c = null;
    try { const g = fn(); c = g && g.canvas && !g.getContext ? g.canvas() : g; } catch (e) { console.error('PX.arcade', key, e); c = null; }
    cache.set(key, c); return c;
  }
  const WOOD = ['#eec39a', '#d9a066', '#8f563b'], STRAW = ['#f6dca0', '#d9a066', '#a8703f'], METAL = ['#f4f6fa', '#c0c8d8', '#7a8296'];
  const GOLD = ['#fff6c8', '#ffcc44', '#c7861c'], LEAF = ['#99e550', '#6abe30', '#37946e'];
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const mix = (a, b, k) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = s => Math.round((A >> s & 255) * (1 - k) + (B >> s & 255) * k); return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1); };
  const BUB = ['#639bff', '#f07aa8', '#f08a3a', '#6abe30', '#a46ad8', '#ffcc44', '#8a90a8'];
  const R5 = R => (PX.ramp5 ? PX.ramp5(R) : [R[0], R[0], R[1], R[2], R[2]]);
  const soft = (R, nx, ny) => { if (PX.shadeSoft) return PX.shadeSoft(R5(R), nx, ny); const d = nx * 0.55 + ny * 0.85; return d < -0.42 ? R[0] : d > 0.55 ? R[2] : R[1]; };

  // ---------------- drawing kit (fine pixels) ----------------
  const grid = (w, h, k) => new PX.Grid(w, h, k || 2);
  const fm = fn => { const f = (x, y) => fn(x, y); f.fine = true; return f; }; // an ell / sell mask in fine precision
  const IN = g => fm((x, y) => g.filled(x, y));
  // fn(x, y, colour, fx, fy) for every fine pixel (x, y = its centre in art px); a returned colour replaces it (undefined = keep)
  function each(g, fn) {
    const k = g.k, fw = g.fw, a = g.a;
    for (let fy = 0; fy < g.fh; fy++) for (let fx = 0; fx < fw; fx++) { const c = fn((fx + 0.5) / k, (fy + 0.5) / k, a[fy * fw + fx], fx, fy); if (c !== undefined) a[fy * fw + fx] = c; }
    return g;
  }
  // a piece drawn on its own layer with a 1-fine-px line round it, then laid on g
  function piece(g, draw, edge) { const t = grid(g.w, g.h, g.k); draw(t); t.outline(edge); return g.merge(t); }
  // a 1-fine-px line between two art points, only over pixels already painted (ok === true: anywhere)
  function fline(g, x0, y0, x1, y1, col, ok) {
    const k = g.k, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * k * 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, fx = Math.floor((x0 + (x1 - x0) * t) * k), fy = Math.floor((y0 + (y1 - y0) * t) * k), v = g.fget(fx, fy);
      if (ok === true || (v !== null && v !== INK)) g.fset(fx, fy, col);
    }
    return g;
  }
  const inRR = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const dx = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0, dy = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0;
    return dx * dx + dy * dy <= r * r;
  };
  const shadeBox = (R, x, y, x0, y0, x1, y1) => soft(R, (x - (x0 + x1) / 2) / ((x1 - x0) / 2), (y - (y0 + y1) / 2) / ((y1 - y0) / 2));
  // a little four-point twinkle in fine pixels
  const tw = (g, x, y, c) => { const d = 1 / g.k; return g.dots([[x, y - d], [x - d, y], [x + d, y], [x, y + d]], c || '#fff6b0').dot(x, y, '#ffffff'); };
  // weave: rows of fine-edged strips (basket, fruit basket); lighter up-left, deeper down-right
  function weave(x, y, cx, half, y0, y1, bandH) {
    const W5 = R5(WOOD), band = Math.floor((y - y0) / bandH), fr = (y - y0) - band * bandH, sh = x + band * 2, cell = Math.floor(sh / 4), cf = sh - cell * 4;
    const nx = (x - cx) / half, ny = (y - (y0 + y1) / 2) / ((y1 - y0) / 2);
    let i = (cell + band) & 1; if (nx > 0.45) i++; if (nx > 0.82) i++; if (nx < -0.7) i--; if (ny > 0.55) i++;
    if (fr > bandH - 0.5) return W5[3];
    if (cf > 3.5) return W5[Math.min(4, Math.max(0, i) + 2)];
    return W5[Math.max(0, Math.min(3, i))];
  }
  // the finishing pass every sprite here goes through: 2-fine ink lines thinned, then the outer ink ring (PX.hd)
  const done = (g, o) => (PX.hd ? PX.hd(g, Object.assign({ epx: false, dedither: false }, o)) : (g.k > 1 && (!o || o.outer !== false) ? g.outerLine() : g));

  const A = {
    basket() {
      return mk('basket', () => {
        const g = grid(28, 15);
        piece(g, t => each(t, (x, y) => { if (y < 3.4 || y > 14.6) return; const half = 13 - (y - 3.4) * 2.8 / 11.2; return Math.abs(x - 14) > half ? undefined : weave(x, y, 14, half, 4, 14.6, 3); }));
        // the front lip of the rim (the back of the rim is hidden behind the Sprout standing in the basket)
        piece(g, t => {
          t.ell(14, 3.4, 13.7, 2.4, ['#fff2c8', '#e0ae78', '#a8703f'], 0, fm((x, y) => y >= 3.0));
          each(t, (x, y, v, fx, fy) => (v && !t.fget(fx, fy - 1) ? '#fff6dc' : undefined));
          for (let x = 3; x < 26; x += 2.5) t.dot(x, 4.6 + Math.abs(x - 14) * -0.06, '#b47a44');
        });
        g.dots([[4, 3.4], [4.5, 3.4], [5, 3.4], [5.5, 3.4]], '#ffffff');
        return done(g);
      });
    },
    acorn(sz) {
      const s = sz === 's';
      return mk('acorn' + (s ? 's' : ''), () => {
        const g = s ? grid(8, 9) : grid(11, 13), m = s ? 0.68 : 1, cx = g.w / 2, oy = s ? 0.2 : 0;
        piece(g, t => { t.ell(cx, oy + 8.4 * m, 3.7 * m, 4.1 * m, ['#f6d4a0', '#c88a4a', '#8f563b']); t.poly([[cx - 1.1 * m, oy + 11.6 * m], [cx + 1.1 * m, oy + 11.6 * m], [cx, oy + 12.7 * m]], '#a86a3a'); });
        piece(g, t => {
          t.ell(cx, oy + 4.5 * m, 4.6 * m, 2.6 * m, ['#c88a4a', '#8f563b', '#5c3a28']);
          each(t, (x, y, v) => (v && ((Math.floor((x + y) * 2.6) % 3 === 0) || (Math.floor((x - y + 30) * 2.6) % 3 === 0)) ? mix(v, '#d9a066', 0.5) : undefined));
        });
        piece(g, t => PX.stroke(t, [[cx, oy + 2.4 * m], [cx + 0.9 * m, 0.5]], 0.55, 0.45, '#663931'));
        g.dots(s ? [[2.2, 5.2], [2.2, 5.7]] : [[3.4, 7.4], [3.4, 7.9], [3.4, 8.4], [3.9, 6.9]], '#fff6e4');
        return done(g);
      });
    },
    pinecone() {
      return mk('pinecone', () => {
        const g = grid(11, 14);
        piece(g, t => {
          t.ell(5.5, 7.8, 4.1, 5.6, '#5c3a28');
          for (let j = 0; j < 6; j++) {
            const y = 3.4 + j * 1.75, half = Math.sqrt(Math.max(0, 1 - ((y - 7.8) / 5.6) ** 2)) * 4.1, n = Math.max(1, Math.round(half / 1.3));
            for (let i = 0; i < n; i++) { const x = 5.5 + (n === 1 ? 0 : -half + 1.1 + (i + (j & 1) * 0.4) * (2 * half - 2.2) / (n - 0.6)); t.ell(x, y, 1.45, 1.05, ['#e8bc88', '#b8743a', '#7a4a2a'], 0, IN(t)); }
          }
        });
        piece(g, t => PX.stroke(t, [[5.5, 2.4], [6.1, 0.5]], 0.55, 0.45, '#4b692f'));
        g.dots([[3.0, 5.4], [3.0, 5.9]], '#f6dca0');
        return done(g);
      });
    },
    card(kind) {
      kind = kind === 'back' || kind === 'fox' ? kind : 'face';
      return mk('card' + kind, () => {
        const g = grid(24, 30, 3), f = 1 / 3;
        each(g, (x, y) => (inRR(x, y, 1, 1, 23, 29, 2.4) ? (x > 23 - f * 1.5 || y > 29 - f * 1.5 ? '#efe2c4' : x + y < 7 ? '#fffdf4' : '#fff8e6') : undefined));
        // the panel / window's 1-fine frame
        each(g, (x, y, v) => (v && inRR(x, y, 3 - f, 3 - f, 21 + f, 27 + f, 1.7) && !inRR(x, y, 3, 3, 21, 27, 1.4) ? (kind === 'back' ? '#5e3a94' : '#d8c8a0') : undefined));
        if (kind === 'back') {
          const P = ['#b896e8', '#8a62c8', '#5e3a94'];
          each(g, (x, y) => { if (!inRR(x, y, 3, 3, 21, 27, 1.4)) return; const d = soft(P, (x - 12) / 9, (y - 15) / 12); return ((x + y) % 3 < f) || ((x - y + 60) % 3 < f) ? mix(d, P[0], 0.5) : d; });
          piece(g, t => t.ell(12, 15, 6.5, 6.5, ['#ffffff', '#fff8e6', '#e8d8b8']));
          g.ell(12, 15, 5.1, 5.1, ['#fffbb0', '#ffcc44', '#e09a1a'], 0, fm(x => x < 12));
          g.ell(12, 15, 5.1, 5.1, ['#6a6aa8', '#3f3f74', '#2a2a52'], 0, fm(x => x >= 12));
          g.ell(14.4, 13.6, 2.7, 2.7, '#fff6c8', 0, fm(x => x >= 12)); g.ell(15.7, 12.8, 2.4, 2.4, '#3f3f74', 0, fm(x => x >= 12));
          g.dots([[8.6, 12.2], [9, 11.8], [9.4, 11.5], [8.6, 12.6]], '#ffffff'); tw(g, 15.6, 17.8, '#c8ccff');
          for (const [x, y] of [[5.4, 5.4], [18.6, 5.4], [5.4, 24.6], [18.6, 24.6]]) tw(g, x, y, '#fff27a');
        } else {
          const fox = kind === 'fox', top = fox ? '#ffefe0' : '#f0f9e8', mid = fox ? '#ffdcb8' : '#dcf2c8', GR = fox ? ['#fac896', '#f5b07a', '#df7126'] : ['#c8f090', '#a6de7c', '#6abe30'];
          each(g, (x, y) => {
            if (!inRR(x, y, 3, 3, 21, 27, 1.4)) return;
            if (y < 3 + f) return '#ffffff';
            const gy = 22 + Math.sin(x * 1.9) * 0.4;
            if (y > gy) return y < gy + f ? GR[0] : y > 27 - f * 2 ? GR[2] : GR[1];
            return y < 9 ? top : y < 15 ? mix(top, mid, 0.5) : mid;
          });
          for (let x = 4; x < 20.5; x += 1.6) { g.dot(x, 21.7 + Math.sin(x * 1.9) * 0.4, GR[1]); g.dot(x + f, 21.4 + Math.sin(x * 1.9) * 0.4, GR[2]); }
          if (fox) for (const [x, y] of [[5.2, 5.4], [18.6, 5.4]]) { g.ell(x, y + 0.5, 0.8, 0.6, '#df7126'); g.dots([[x - 0.8, y - 0.4], [x, y - 0.8], [x + 0.8, y - 0.4]], '#df7126'); }
        }
        g.outline();
        g.dots([[2.2, 2.9], [2.5, 2.5], [2.9, 2.2], [3.3, 2.0]], '#ffffff');
        return done(g);
      });
    },
    star() {
      return mk('star', () => {
        const g = grid(11, 11), S = ['#fffbb0', '#fbf236', '#e0a020'];
        g.poly(PX.starPts(5.5, 6, 5.4, 2.4, 5), S[1]);
        each(g, (x, y, v) => (v ? soft(S, (x - 5.5) / 5, (y - 6) / 5) : undefined));
        g.outline();
        g.dots([[5.0, 3.0], [5.0, 3.5], [4.5, 4.5], [4.0, 5.0], [3.5, 5.5]], '#ffffff');
        return done(g);
      });
    },
    moon() {
      return mk('moon', () => {
        const g = grid(13, 13, 3);
        g.ell(6.2, 6.5, 5.4, 5.4, ['#fffbe0', '#fbe36a', '#e0b030']); g.ell(8.9, 4.5, 4.4, 4.4, null);
        g.ell(3.4, 8.0, 0.9, 0.8, '#efcf58', 0, IN(g)); g.ell(5.6, 10.5, 0.7, 0.55, '#efcf58', 0, IN(g)); g.ell(2.4, 5.6, 0.5, 0.5, '#efcf58', 0, IN(g));
        g.outline();
        g.dots([[2.0, 4.6], [2.0, 5.0], [2.0, 5.4], [2.4, 3.9]], '#ffffff'); tw(g, 11.2, 10.4, '#fff27a');
        return done(g);
      });
    },
    pad(size) {
      const w = size === 's' ? 24 : size === 'l' ? 42 : 32;
      return mk('pad' + w, () => {
        const g = grid(w, w > 40 ? 10 : 9), cx = w / 2, hh = w > 40 ? 3.9 : 3.5;
        piece(g, t => {
          t.ell(cx, 4.5, cx - 1, hh, ['#a6ec70', '#6abe30', '#37946e']);
          t.poly([[cx, 4.5], [w, 1.8], [w, 5.0]], null);
          for (const a of [Math.PI, 2.62, -2.62, 2.2, -2.2, 1.75, -1.75]) fline(t, cx, 4.5, cx + Math.cos(a) * (cx - 2.5), 4.5 + Math.sin(a) * (hh - 0.9), '#58a83c');
          for (let fx = 0; fx < t.fw; fx++) { let low = -1; for (let fy = 0; fy < t.fh; fy++) if (t.a[fy * t.fw + fx]) low = fy; if (low > 4.6 * t.k) { t.fset(fx, low, '#2f7a5a'); t.fset(fx, low - 1, '#37946e'); } }
        });
        const hx = cx - cx * 0.55;
        g.dots([[hx, 1.9], [hx + 0.5, 1.9], [hx + 1, 1.9], [hx + 1.5, 2.4]], '#e0ffb8');
        if (w > 40) {
          piece(g, t => { t.ell(7.6, 3.2, 1.6, 1.2, ['#fff0f6', '#f7b6c8', '#e07ba0'], -0.5); t.ell(10.4, 3.2, 1.6, 1.2, ['#fff0f6', '#f7b6c8', '#e07ba0'], 0.5); t.ell(9, 2.4, 1.5, 2.0, ['#fff0f6', '#f7b6c8', '#e07ba0']); });
          g.ell(9, 3.3, 0.8, 0.5, ['#fffbb0', '#fff27a', '#e0b030']); g.dot(8.5, 1.4, '#ffffff');
        }
        return done(g);
      });
    },
    leaf() {
      return mk('leaf', () => {
        const g = grid(32, 10), L = ['#d2f8a0', '#99e550', '#4f9a3a'];
        piece(g, t => {
          each(t, (x, y) => { const u = (x - 1) / 29; if (u < 0 || u > 1) return; const hw = 3.4 * Math.pow(Math.sin(Math.PI * u), 0.75); return Math.abs(y - 4.4) > hw ? undefined : soft(L, (x - 14) / 15, (y - 4.4) / 3.4); });
          for (let fx = 0; fx < t.fw; fx++) { let low = -1; for (let fy = 0; fy < t.fh; fy++) if (t.a[fy * t.fw + fx]) low = fy; if (low > 5 * t.k) t.fset(fx, low, '#37946e'); }
          fline(t, 2.4, 4.6, 29.6, 4.3, '#6abe30');
          for (const x0 of [7, 12, 17, 22, 26]) { fline(t, x0, 4.5, x0 - 2.4, 2.3, '#7ccc40'); fline(t, x0, 4.5, x0 - 2.4, 6.5, '#5aa838'); }
          PX.stroke(t, [[29.4, 4.4], [31.4, 3.8]], 0.5, 0.45, '#4f9a3a');
        });
        g.dots([[7.5, 2.3], [8, 2.0], [8.5, 2.0], [9, 2.0], [9.5, 2.0]], '#f4ffe0');
        return done(g);
      });
    },
    bubble(i, big) {
      i = Math.max(0, Math.min(6, i | 0));
      return mk('bubble' + i + (big ? 'b' : ''), () => {
        const g = grid(26, 26, big ? 3 : 2), c = BUB[i], dk = mix(c, INK, 0.45), RIM = [mix(c, '#ffffff', 0.5), c, mix(c, INK, 0.22)];
        each(g, (x, y) => {
          const dx = x - 13, dy = y - 13, d = Math.hypot(dx, dy);
          if (d > 11.6) return; if (d > 10.3) return soft(RIM, dx / d, dy / d);
          if (d > 7.4 && d < 8.4 && Math.atan2(dy, dx) > -2.8 && Math.atan2(dy, dx) < -1.9) return '#ffffff';
          return d > 9.3 ? hexA(c, 0.42) : hexA(c, i === 6 ? 0.3 : 0.15);
        });
        if (i === 6) { // a little grey rain cloud inside, with a sad face
          piece(g, t => { const C = ['#ffffff', '#d4d8e2', '#8a90a8']; t.ell(13, 11.8, 4.8, 3, C); t.ell(10, 12.6, 3.1, 2.3, C); t.ell(16.3, 12.6, 3.1, 2.5, C); t.ell(13, 13.4, 5.4, 1.6, C); }, '#6a7088');
          for (const [x, y] of [[10, 16.6], [13, 17.4], [16, 16.6]]) g.dots([[x, y], [x, y + 0.5], [x - 0.5, y + 1]], '#5b9bff');
          g.dots([[11.5, 11.5], [11.5, 12], [14.5, 11.5], [14.5, 12]], INK); g.dots([[12, 13.8], [12.5, 13.3], [13, 13.3], [13.5, 13.3], [14, 13.8]], '#5a5a6a');
        }
        if (i === 5) {
          piece(g, t => { t.poly(PX.starPts(13, 13.5, 5.5, 2.4, 5), '#fff27a'); each(t, (x, y, v) => (v ? soft(['#fffbb0', '#fff27a', '#e0a020'], (x - 13) / 5, (y - 13.5) / 5) : undefined)); }, '#c7861c');
          g.dots([[12.5, 10.5], [12.5, 11], [12, 12]], '#ffffff');
        }
        g.ell(7.6, 7.6, 1.0, 0.75, '#ffffff', -0.75);
        g.dots([[18.6, 19.4], [19.1, 18.9], [19.6, 18.4]], 'rgba(255,255,255,.85)');
        g.outline(dk); g.outerLine(dk); // (a soap bubble: its own dark-colour ring of the same weight, no black ink)
        return g;
      });
    },
    gate(i) {
      i = i ? 1 : 0;
      return mk('gate' + i, () => {
        const g = grid(9, 24), P = i ? ['#fffbc0', '#fbe36a', '#e0a020'] : ['#fff0f6', '#f7b6c8', '#d06090'];
        piece(g, t => { t.ell(4.5, 22.8, 3.8, 1.3, LEAF); for (const x of [2, 3.6, 5.4, 7]) PX.stroke(t, [[x, 23], [x + (x - 4.5) * 0.25, 21.4]], 0.35, 0.3, LEAF[1]); });
        piece(g, t => each(t, (x, y) => (x > 3 && x < 6 && y > 7.5 && y < 23 ? (x < 3.5 ? WOOD[0] : x > 5.5 ? '#a8703f' : WOOD[1]) : undefined)));
        g.dots([[4.5, 10], [4.5, 10.5], [5, 14], [5, 14.5], [4, 18], [4, 18.5]], '#b47a44');
        piece(g, t => t.ell(6.5, 12.3, 1.7, 0.8, ['#c3f08a', '#6abe30', '#37946e'], -0.6));
        piece(g, t => { for (const [x, y] of [[4.5, 1.9], [6.9, 4], [4.5, 6.1], [2.1, 4]]) t.ell(x, y, 2, 2, P); });
        piece(g, t => t.ell(4.5, 4, 1.25, 1.25, i ? ['#ffc080', '#df7126', '#a04a10'] : ['#fffbb0', '#fff27a', '#e0b030']));
        g.dot(4.0, 3.5, '#ffffff'); g.dots([[3.5, 1.0], [3.0, 1.5]], '#ffffff');
        return done(g);
      });
    },
    flag(i) {
      i = i ? 1 : 0;
      return mk('flag' + i, () => {
        const g = grid(5, 4), C = i ? ['#fff6a0', '#ffcc44', '#c7861c'] : ['#ffc0d8', '#f07aa8', '#b04878'];
        g.poly([[0.2, 0.2], [4.8, 0.2], [2.5, 3.9]], C[1]); each(g, (x, y, v) => (v ? soft(C, (x - 2.5) / 2.2, (y - 1.4) / 1.8) : undefined));
        g.outline(C[2]);
        return g;
      });
    },
    puddle() {
      return mk('puddle', () => {
        const g = grid(32, 14);
        piece(g, t => t.ell(16, 7, 15.2, 6.1, ['#c49a6a', '#8f563b', '#5c3a28']));
        g.ell(16.4, 7.2, 13.4, 4.8, ['#e0f4ff', '#7cc0f0', '#4a86c8']);
        fline(g, 8.5, 5.2, 13.5, 5.0, '#f0faff'); fline(g, 18.5, 8.8, 23.5, 9.0, '#e8f6ff'); fline(g, 11.5, 9.6, 14.5, 9.6, '#b8e0ff');
        each(g, (x, y, v) => (v && Math.abs(Math.hypot(x - 21, (y - 5.6) * 1.6) - 1.8) < 0.26 ? '#cbe8ff' : undefined));
        return done(g);
      });
    },
    padlock() {
      return mk('padlock', () => {
        const g = grid(16, 18, 4);
        piece(g, t => {
          const pts = [[3.6, 9.2]]; for (let a = 0; a <= 24; a++) { const th = Math.PI + a / 24 * Math.PI; pts.push([8 + Math.cos(th) * 4.4, 7.6 + Math.sin(th) * 5]); } pts.push([12.4, 9.2]);
          PX.stroke(t, pts, 1.05, 1.05, METAL[1]);
          each(t, (x, y, v) => (v && Math.hypot(x - 8, (y - 7.6) * 0.88) < 4.0 && y < 7.6 ? METAL[0] : v && Math.hypot(x - 8, (y - 7.6) * 0.88) > 4.85 ? '#9aa2b6' : undefined));
        });
        piece(g, t => each(t, (x, y) => (inRR(x, y, 2, 8, 14, 17.2, 1.6) ? shadeBox(['#fffbb0', '#ffcc44', '#d99a1a'], x, y, 2, 8, 14, 17.2) : undefined)));
        g.ell(8, 11.8, 1.2, 1.2, '#5b4630'); g.poly([[7.35, 12.2], [8.65, 12.2], [8.95, 14.7], [7.05, 14.7]], '#5b4630'); g.dots([[7.6, 11.4], [7.85, 11.4]], '#8a7050');
        g.dots([[3.25, 9.5], [3.25, 9.75], [3.25, 10], [3.25, 10.25], [3.5, 9.25], [3.75, 9.25]], '#ffffff');
        return done(g);
      });
    },
    sky(kind, v) {
      v = v | 0;
      return mk('sky' + kind + v, () => {
        if (kind === 'sun' || kind === 'moon') {
          const g = grid(21, 21), sun = kind === 'sun', gl = sun ? '255,240,160' : '255,246,200';
          each(g, (x, y) => { const d = Math.hypot(x - 10.5, y - 10.5); return d > 10.3 ? undefined : d > 8.9 ? `rgba(${gl},.16)` : d > 7.5 ? `rgba(${gl},.32)` : undefined; });
          piece(g, t => t.ell(10.5, 10.5, 6.8, 6.8, sun ? ['#fffbe0', '#ffe27a', '#f6c83a'] : ['#fffdf0', '#f4ecc8', '#d9cfa0']), sun ? '#f0b030' : '#c8bc88');
          if (sun) g.ell(8.4, 8.2, 1.7, 1.2, '#fffef4', -0.6);
          else { for (const [x, y, r] of [[8.4, 9.4, 1.5], [12.6, 12.6, 1.2], [11.6, 7.4, 0.8], [8.6, 13.4, 0.7]]) { g.ell(x, y, r, r * 0.85, '#e6dcb0'); g.dot(x - r * 0.5, y - r * 0.5, '#d4c896'); } g.dots([[6.4, 7.0], [6.4, 7.5], [6.9, 6.5]], '#ffffff'); }
          return g;
        }
        // a puffy cloud: soft white with a shaded underside and a thin rim (no ink: it is far away)
        const sz = v % 3, warm = v >= 3, w = [22, 30, 38][sz], h = [9, 11, 13][sz], g = grid(w, h);
        const C = warm ? ['#fffaf6', '#fff2ec', '#f2d4d8', '#e0b8c4'] : ['#ffffff', '#f8fafe', '#e2eaf6', '#c8d6ec'];
        const puffs = sz === 0 ? [[5, 5.2, 3.4], [10.5, 3.9, 3.8], [15.6, 5.0, 3.2], [11, 6.2, 4]] : sz === 1 ? [[5.4, 6.6, 3.6], [11.6, 4.4, 4.4], [18, 4.8, 3.8], [23.6, 6.4, 3], [14, 7.4, 5]] : [[5.4, 8, 3.8], [11.6, 5.4, 4.8], [18.6, 4.2, 5.2], [25.6, 5.8, 4.4], [31.6, 8, 3], [18, 9.4, 6]];
        piece(g, t => {
          for (const [x, y, r] of puffs) t.ell(x, y, r, r * 0.82, C[1]); each(t, (x, y, c) => (c && y > h - 1.2 ? null : undefined));
          each(t, (x, y, c, fx, fy) => { if (!c) return; let below = 0; for (let j = 1; j <= 4; j++) if (t.fget(fx, fy + j)) below++; return !t.fget(fx, fy - 1) || !t.fget(fx, fy - 2) ? C[0] : below < 2 ? C[2] : below < 4 ? mix(C[1], C[2], 0.5) : undefined; });
        }, C[3]);
        return g;
      });
    },
    glow(col) {
      col = /^#[0-9a-f]{6}$/i.test(col || '') ? col : '#ffcc44';
      return mk('glow' + col, () => {
        const g = grid(24, 24);
        each(g, (x, y) => { const d = Math.hypot(x - 12, y - 12) / 11.6; return d > 1 ? undefined : hexA(col, d < 0.36 ? 0.42 : d < 0.56 ? 0.28 : d < 0.78 ? 0.16 : 0.07); });
        return g;
      });
    },
    trail() {
      return mk('trail', () => {
        const g = grid(24, 24);
        each(g, (x, y) => { const along = (x - y + 22) / 44; if (along < 0.03 || along > 1) return; const dist = Math.abs(x + y - 24) / Math.SQRT2, wd = 1.15 - 0.85 * along; if (dist > wd) return; const a = Math.ceil((1 - along) * 4) / 4 * 0.8; return dist < wd * 0.45 && along < 0.5 ? `rgba(255,252,230,${a})` : `rgba(255,242,160,${a * 0.75})`; });
        return g;
      });
    },
    claw(part) {
      const shut = part === 'shut';
      return mk('claw' + (shut ? 's' : 'o'), () => {
        const g = grid(22, 18, 4);
        piece(g, t => each(t, (x, y) => (inRR(x, y, 8, 0.5, 14, 3.4, 0.6) ? shadeBox(METAL, x, y, 8, -1.4, 14, 3.4) : undefined)));
        piece(g, t => {
          const L = shut ? [[8, 6], [6, 11], [9, 16.6]] : [[8, 6], [3, 11], [4, 16.6]], Rr = L.map(([x, y]) => [22 - x, y]);
          PX.stroke(t, L, 1.4, 1.05, METAL[1]); PX.stroke(t, Rr, 1.4, 1.05, METAL[1]); PX.stroke(t, [[11, 7], [11, shut ? 14 : 12]], 1.2, 1, METAL[1]);
          each(t, (x, y, v, fx, fy) => (!v ? undefined : !t.fget(fx - 1, fy - 1) || !t.fget(fx - 2, fy) ? METAL[0] : !t.fget(fx + 1, fy + 1) || !t.fget(fx + 2, fy) ? '#9aa2b6' : undefined));
          for (const P of [L, Rr]) { const [x, y] = P[2]; t.ell(x, y - 0.4, 0.9, 0.9, ['#9aa2b6', '#7a8296', '#5a6276']); }
        });
        piece(g, t => t.ell(11, 5, 5.2, 3.2, GOLD));
        g.ell(11, 5.3, 1.1, 0.8, ['#ffcc44', '#c7861c', '#8a5a14']); g.dots([[7.75, 3.75], [8.0, 3.5], [8.25, 3.5], [8.5, 3.25], [8.75, 3.25]], '#ffffff');
        return done(g);
      });
    },
    token() {
      return mk('token', () => {
        const g = grid(13, 13);
        piece(g, t => t.ell(6.5, 6.5, 5.7, 5.7, ['#f4ecff', '#b88af4', '#7a52b8']));
        for (let a = 0; a < 12; a++) g.dot(6.5 + Math.cos(a * Math.PI / 6) * 4.9, 6.5 + Math.sin(a * Math.PI / 6) * 4.9, '#dccaff');
        piece(g, t => t.ell(6.5, 6.5, 3.7, 3.7, '#fff8e6'), '#7a52b8');
        g.ell(6.5, 6.5, 2.9, 2.9, ['#fffbb0', '#ffcc44', '#e09a1a'], 0, fm(x => x < 6.5));
        g.ell(6.5, 6.5, 2.9, 2.9, ['#6a6aa8', '#3f3f74', '#2a2a52'], 0, fm(x => x >= 6.5));
        g.ell(7.7, 5.9, 1.4, 1.4, '#fff6c8', 0, fm(x => x >= 6.5)); g.ell(8.4, 5.4, 1.25, 1.25, '#3f3f74', 0, fm(x => x >= 6.5));
        g.dots([[2.6, 4.0], [3.0, 3.4], [3.5, 3.0], [4.0, 2.6]], '#ffffff');
        return done(g);
      });
    },
    coinbag() {
      return mk('coinbag', () => {
        const g = grid(14, 14, 4), S = ['#fae4b4', '#d9a066', '#8f563b'], Au = ['#fffbb0', '#f6c83a', '#c7861c'];
        piece(g, t => { t.ell(7, 9.3, 5.6, 4.5, S[1]); t.poly([[5, 3.4], [9, 3.4], [9.8, 6.4], [4.2, 6.4]], S[1]); t.sell(5.8, 8.2, 6.6, 6.2, S, 0, IN(t)); });
        piece(g, t => { t.sell(5.9, 2.0, 1.6, 1.15, Au); t.sell(8.3, 1.7, 1.6, 1.15, Au); });
        piece(g, t => t.sell(7, 3.0, 3.0, 1.2, S));
        piece(g, t => { t.poly([[4.3, 4.7], [9.7, 4.7], [9.9, 5.9], [4.1, 5.9]], '#d95763'); t.ell(10.0, 5.6, 0.85, 0.85, ['#ff9aa0', '#d95763', '#a02a3a']); });
        fline(g, 4.6, 4.85, 9.4, 4.85, '#f28a92');
        piece(g, t => t.sell(7, 9.9, 2.1, 2.1, Au), '#a8703f');
        fline(g, 7.1, 8.9, 7.1, 10.9, '#c7861c'); g.dots([[6.25, 9.0], [6.25, 9.25]], '#ffffff');
        for (let a = 0.3; a < 2.9; a += 0.32) g.dot(7 + Math.cos(a) * 4.6, 9.4 + Math.sin(a) * 3.5, '#b47a44');
        g.dots([[3.0, 7.75], [3.0, 8.0], [3.0, 8.25], [3.0, 8.5], [3.25, 7.5], [3.5, 7.25]], '#fff6e4');
        return done(g);
      });
    },
    fruitbasket() {
      return mk('fruitbasket', () => {
        const g = grid(16, 15, 4), Y = ['#fffbc0', '#fbe36a', '#c7a020'];
        piece(g, t => t.sell(8, 4, 2.8, 2.8, ['#e8ccfa', '#a46ad8', '#6a3a9a']));
        piece(g, t => { t.ell(11.3, 6.2, 2.4, 2.5, Y[1]); t.ell(11.0, 4.3, 1.6, 1.8, Y[1]); t.sell(10.6, 5.2, 3.2, 3.6, Y, 0, IN(t)); });
        piece(g, t => t.sell(4.6, 6, 3, 3, ['#ffa8ae', '#d95763', '#a02a3a']));
        piece(g, t => { PX.stroke(t, [[8, 1.4], [8.4, 0.3]], 0.3, 0.28, '#663931'); PX.stroke(t, [[4.6, 3.2], [4.9, 2.2]], 0.28, 0.25, '#663931'); });
        piece(g, t => t.sell(5.8, 2.2, 1.2, 0.55, ['#c3f08a', '#6abe30', '#37946e'], -0.4));
        piece(g, t => each(t, (x, y) => { if (y < 7.6 || y > 14.6) return; const half = 7.2 - (y - 7.6) * 2 / 7; return Math.abs(x - 8) > half ? undefined : weave(x, y, 8, half, 8.4, 14.6, 2.1); }));
        piece(g, t => each(t, (x, y) => (y >= 7.0 && y < 8.5 && Math.abs(x - 8) < 7.4 ? (y < 7.4 ? '#f6d4a8' : y > 8.2 ? '#a8703f' : '#c48a52') : undefined)));
        g.dots([[3.25, 4.75], [3.25, 5.0], [3.5, 4.5], [3.75, 4.25]], '#ffffff'); g.dots([[7.0, 2.75], [7.25, 2.5]], '#ffffff'); g.dots([[10.25, 4.25], [10.25, 4.5]], '#ffffff');
        return done(g);
      });
    },
    capsule(i) {
      const n = Math.abs(i | 0) % 4, C = [['#ffd8e8', '#f07aa8', '#a8306a'], ['#d0eeff', '#639bff', '#30509a'], ['#e8ffc0', '#6abe30', '#37946e'], ['#fff6a0', '#f6c83a', '#c7861c']][n];
      return mk('capsule' + n, () => {
        const g = grid(14, 14, 4);
        piece(g, t => t.ell(7, 7, 5.7, 5.7, C, 0, fm((x, y) => y >= 7)));
        piece(g, t => t.ell(7, 7, 5.7, 5.7, ['#ffffff', '#e8f4ff', '#bcd4ee'], 0, fm((x, y) => y < 7)));
        g.ell(7, 5.4, 1.7, 1.2, mix(C[1], '#e8f4ff', 0.5), 0, IN(g)); g.ell(6.6, 5.1, 0.6, 0.4, mix(C[0], '#ffffff', 0.5), 0, IN(g));
        piece(g, t => t.poly([[1.3, 6.5], [12.7, 6.5], [12.7, 7.7], [1.3, 7.7]], C[2]));
        fline(g, 1.6, 6.65, 12.4, 6.65, mix(C[1], C[2], 0.5));
        g.dots([[3.0, 5.0], [3.0, 4.75], [3.25, 4.25], [3.5, 3.75], [3.75, 3.5], [4.25, 3.0], [4.5, 2.75]], '#ffffff'); tw(g, 9.6, 3.8, '#ffcc44');
        return done(g);
      });
    },
    nest() {
      return mk('nest', () => {
        const g = grid(22, 9);
        piece(g, t => {
          t.ell(11, 5.2, 10.2, 3.5, STRAW);
          for (let j = 0; j < 15; j++) { const x0 = 1.4 + j * 1.38, y0 = 2.6 + (j % 3) * 1.1, x1 = x0 + 2.5 + (j % 2), y1 = y0 + 1.5 - (j % 4) * 0.55; fline(t, x0, y0, x1, y1, j % 3 ? '#b07840' : '#fff2c0'); }
          fline(t, 0.4, 3.6, 2.4, 4.6, '#d9a066', true); fline(t, 19.4, 4.4, 21.6, 3.2, '#d9a066', true); fline(t, 6, 1.6, 7.6, 2.4, '#e0b070', true);
        });
        return done(g);
      });
    },
    bulb(on) {
      return mk('bulb' + (on ? 1 : 0), () => {
        const g = grid(5, 5);
        g.ell(2.5, 2.5, 1.9, 1.9, on ? ['#ffffff', '#fff27a', '#e0b030'] : ['#fff4f8', '#ffd0e0', '#e8a0b8']);
        g.outline(on ? '#b0701a' : '#b05080'); g.dot(1.8, 1.8, '#ffffff');
        return g;
      });
    },
    // a plushie: the sprite with a stitched seam down its tummy and a heart tag on its side (made fresh: the caller caches it)
    plush(src) {
      const K = 2, c = document.createElement('canvas'); c.width = 34 * K; c.height = 34 * K;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      if (src) { const w = PX.artW ? PX.artW(src) : src.width, h = PX.artH ? PX.artH(src) : src.height; x.drawImage(src, 1 * K, 2 * K, w * K, h * K); }
      x.fillStyle = 'rgba(255,255,255,.62)'; for (let y = 47; y < 61; y += 3) x.fillRect(34, y, 1, 2);
      x.fillStyle = '#c0a080'; x.fillRect(51, 41, 1, 5); x.fillRect(52, 45, 1, 1);
      const tag = mk('plushtag', () => {
        const g = grid(8, 8);
        piece(g, t => each(t, (px, py) => (inRR(px, py, 0.6, 0.6, 7.4, 7.4, 1.4) ? (px + py < 5 ? '#ffffff' : px + py > 11.5 ? '#efe2c4' : '#fff8e6') : undefined)));
        g.ell(2.9, 3.4, 1.35, 1.35, ['#ff9aa4', '#e5535f', '#a8303c']); g.ell(5.1, 3.4, 1.35, 1.35, ['#ff9aa4', '#e5535f', '#a8303c']);
        g.poly([[1.6, 3.9], [6.4, 3.9], [4, 6.4]], '#e5535f'); g.dots([[2.5, 3], [2.5, 3.5]], '#ffffff');
        return done(g);
      });
      if (tag) x.drawImage(tag, 25 * K, 23 * K, tag.width, tag.height);
      c.k = K;
      return c;
    },
  };
  PX.arcade = A;
})();
