// art-sprouts-hd.js — Solunar Sprouts in "Full Definition": smooth, glossy, kawaii Sprouts like the family's refined target
// (art-src/ai-2026-11-04/sprouts-refined-target.webp), still drawn by code so every colour, skin, marking, eye, stage, part,
// hat and pose works. It is a synchronous Canvas2D port of the smooth SVG portraits (pocket-sprout/_portraits.html: the same
// shapes, written as the same little SVG markup, then painted by the small painter at the bottom of this file), restyled to the
// target: one bold soft ink outline round each piece (body, arms and feet read as one sticker), a smooth gradient volume with a
// white sheen, big glossy eyes with a big white shine, pink blush and a small "w" smile.
//
// OPT-IN, so nothing changes for players until the parent approves: it is on only when localStorage['solunar:hd'] === '1' or
// the page address has hd=1 (art-images.js reads the same switch for its picture "blend" pass). Off, this file does nothing.
//
// Same contract as pixel.js PX.sprig: PX.sprig(look, pose) -> a canvas of 32 x 32 art px (PX.artW / artH), feet anchor
// (PX.SPRIG_AX, PX.SPRIG_AY) = (16, 31), the Sprout in the same place and about the same size, drawn smoothly at c.k = 4 fine
// px per art px (128 x 128). Also:
//   c.hdSpr = 1, c.hdLook, c.hdPose   a smooth Sprout (draw it with image smoothing on; never Scale2x or pixel-snap it)
//   PX.sprigAt(look, pose, k, opt)    the same Sprout at k fine px per art px (big heroes); opt.olw = outline width in art px
//   PX.hdUp(src, scale)               src redrawn sharp for `scale` CSS px per art px on this screen (or src itself)
//   PX.blit (wrapped)                 canvases finer than k = 2 (c.k > 2) are drawn with image smoothing on
// The family's hat pictures (img/hats, art-images.js PX.picture) sit on the smooth head, fitted into the code hat's own box.
// In Node (tools/check_game.js) this file is not loaded: pixel.js stays the fallback everywhere.
(function () {
  'use strict';
  if (!window.PX || typeof document === 'undefined' || !document.createElement || typeof Path2D !== 'function') return;
  const HD = (() => { try { if (/[?&]hd=1(?:&|$)/.test(location.search || '')) return true; return localStorage.getItem('solunar:hd') === '1'; } catch (e) { return false; } })();
  if (!HD) return;
  PX.HD = true;
  const PSD = window.PSDATA || {}, RAMPS = PX.RAMPS;
  const INK = '#222034', BELLY = '#fbf3dc', SW = 0.36, DEG = 180 / Math.PI;
  const BRX = 8.65, BRY = 7.6; // the body: a little wider and squatter than the pixel Sprout's 8.3 x 7.7, like the target
  const OLW = 0.95; // the bold outline round every piece, in art px (the target's line is about 1/18 of the body's width)

  // ---------- small helpers (as in _portraits.html) ----------
  const n = v => Math.round(v * 1000) / 1000;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };
  const lum = h => { const [r, g, b] = rgb(h); return (r * 0.3 + g * 0.59 + b * 0.11) / 255; };
  const sz = v => (v >= 0.9 ? 1.15 : v >= 0.5 ? 0.97 : 0.8);
  // the target's colours are a little more vivid than the pixel ramps: saturation lifted (lightness kept), per ramp step
  function vivid(h, k) {
    const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 1e-4) return h;
    const s0 = d / (1 - Math.abs(2 * l - 1)), s = Math.min(1, s0 * k), hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((hh % 2) - 1)), m = l - C / 2, i = Math.floor(hh) % 6;
    const v = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][i];
    return hex(v.map(t => (t + m) * 255));
  }
  const VIVID = R => [vivid(R[0], 1.12), vivid(R[1], 1.2), vivid(R[2], 1.12)];
  const OL = R => mix(R[2], INK, 0.5);
  const ell = (cx, cy, rx, ry, a, rot) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${rot ? ` transform="rotate(${n(rot * DEG)} ${n(cx)} ${n(cy)})"` : ''} ${a || ''}/>`;
  const circ = (cx, cy, r, a) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${a || ''}/>`;
  const path = (d, a) => `<path d="${d}" ${a || ''}/>`;
  const at = (x, y, rot, inner, sx) => `<g transform="translate(${n(x)} ${n(y)})${rot ? ` rotate(${n(rot * DEG)})` : ''}${sx ? ' scale(-1 1)' : ''}">${inner}</g>`;
  const mir = s => `<g transform="translate(32 0) scale(-1 1)">${s}</g>`;
  const fs = (fill, stroke, w) => `fill="${fill}" stroke="${stroke}" stroke-width="${w == null ? SW : w}" stroke-linejoin="round" stroke-linecap="round"`;
  const line = (d, col, w, extra) => path(d, `fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}`);
  const G = s => (s ? `<g ol="1">${s}</g>` : ''); // a piece with its own bold outline (round the union of its shapes)
  const NOL = 'nol="1"'; // (sparkles and glints: no outline)
  const P = pts => pts.map(p => n(p[0]) + ' ' + n(p[1]));
  const polyD = pts => 'M' + P(pts).join('L') + 'Z';
  function rpoly(pts, r) { // polygon with rounded corners (r: number or per-corner array)
    const N = pts.length; let d = '';
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], rr0 = Array.isArray(r) ? r[i] : r;
      const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), rr = Math.min(rr0, l1 / 2, l2 / 2);
      const a = [p1[0] + v1[0] / l1 * rr, p1[1] + v1[1] / l1 * rr], b = [p1[0] + v2[0] / l2 * rr, p1[1] + v2[1] / l2 * rr];
      d += (i ? 'L' : 'M') + n(a[0]) + ' ' + n(a[1]) + 'Q' + n(p1[0]) + ' ' + n(p1[1]) + ' ' + n(b[0]) + ' ' + n(b[1]);
    }
    return d + 'Z';
  }
  function smooth(pts, closed) { // Catmull-Rom through the points
    const N = pts.length, g = i => pts[closed ? (i + N) % N : Math.max(0, Math.min(N - 1, i))];
    let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
    for (let i = 0; i < (closed ? N : N - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  function spline(pts, steps) {
    const out = [], N = pts.length;
    for (let i = 0; i < N - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(N - 1, i + 2)];
      for (let j = 0; j < steps; j++) {
        const t = j / steps, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[N - 1]); return out;
  }
  function tubeD(pts, w0, w1) { // a tapering tube along a smooth curve
    const S = spline(pts, 8), A = [], B = [];
    S.forEach((p, i) => {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * i / (S.length - 1)) / 2;
      A.push([p[0] - dy / l * w, p[1] + dx / l * w]); B.push([p[0] + dy / l * w, p[1] - dx / l * w]);
    });
    const e = S[S.length - 1], s0 = S[0];
    return 'M' + P(A).join('L') + `Q${n(e[0] + (e[0] - S[S.length - 2][0]) * 1.2)} ${n(e[1] + (e[1] - S[S.length - 2][1]) * 1.2)} ` + P(B.reverse()).join('L') + `Q${n(s0[0] - (S[1][0] - s0[0]) * 1.2)} ${n(s0[1] - (S[1][1] - s0[1]) * 1.2)} ${n(A[0][0])} ${n(A[0][1])}Z`;
  }
  const leafD = (l, w) => `M${n(-l)} 0C${n(-l * 0.5)} ${n(-w * 1.3)} ${n(l * 0.45)} ${n(-w * 1.2)} ${n(l)} 0C${n(l * 0.45)} ${n(w * 1.2)} ${n(-l * 0.5)} ${n(w * 1.3)} ${n(-l)} 0Z`;
  const petalD = (l, w) => `M${n(-l)} 0C${n(-l)} ${n(-w)} ${n(l * 0.25)} ${n(-w * 1.15)} ${n(l)} 0C${n(l * 0.25)} ${n(w * 1.15)} ${n(-l)} ${n(w)} ${n(-l)} 0Z`;
  const roundPetalD = (l, w) => `M${n(-l)} 0C${n(-l)} ${n(-w * 1.1)} ${n(l)} ${n(-w * 1.25)} ${n(l)} 0C${n(l)} ${n(w * 1.25)} ${n(-l)} ${n(w * 1.1)} ${n(-l)} 0Z`;
  const sparkleD = (x, y, s) => { const q = s * 0.16; return `M${n(x)} ${n(y - s)}Q${n(x + q)} ${n(y - q)} ${n(x + s)} ${n(y)}Q${n(x + q)} ${n(y + q)} ${n(x)} ${n(y + s)}Q${n(x - q)} ${n(y + q)} ${n(x - s)} ${n(y)}Q${n(x - q)} ${n(y - q)} ${n(x)} ${n(y - s)}Z`; };
  const starPts = (cx, cy, ro, ri, k, rot) => { const p = []; for (let i = 0; i < k * 2; i++) { const r = i % 2 ? ri : ro, a = (rot == null ? -Math.PI / 2 : rot) + i * Math.PI / k; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  const heartD = (x, y, s) => `M${n(x)} ${n(y + s * 0.95)}C${n(x - s * 1.35)} ${n(y + s * 0.1)} ${n(x - s * 0.95)} ${n(y - s * 1)} ${n(x)} ${n(y - s * 0.35)}C${n(x + s * 0.95)} ${n(y - s * 1)} ${n(x + s * 1.35)} ${n(y + s * 0.1)} ${n(x)} ${n(y + s * 0.95)}Z`;

  // ---------- one drawing = one context (its gradients, clips, blurs and masks, by id) ----------
  class Ctx {
    constructor() { this.i = 0; this.defs = Object.create(null); this.blurs = {}; }
    uid() { return 'd' + (++this.i).toString(36); }
    put(o) { const id = this.uid(); this.defs[id] = o; return `url(#${id})`; }
    lg(s, x1, y1, x2, y2, ex) { return this.put({ t: 'lg', s, x1: x1 == null ? 0 : +x1, y1: y1 == null ? 0 : +y1, x2: x2 == null ? 0 : +x2, y2: y2 == null ? 1 : +y2, user: /userSpaceOnUse/.test(ex || ''), spread: ((/spreadMethod="(\w+)"/.exec(ex || '')) || [])[1] || '' }); }
    rg(s, cx, cy, r, ex) { return this.put({ t: 'rg', s, cx: cx == null ? 0.5 : +cx, cy: cy == null ? 0.5 : +cy, r: r == null ? 0.5 : +r, user: /userSpaceOnUse/.test(ex || ''), spread: ((/spreadMethod="(\w+)"/.exec(ex || '')) || [])[1] || '' }); }
    clip(inner) { return this.put({ t: 'clip', inner }); }
    blur(sd) { if (!this.blurs[sd]) this.blurs[sd] = this.put({ t: 'blur', sd }); return this.blurs[sd]; }
    mask(fill, x, y, w, h) { return this.put({ t: 'mask', fill, x, y, w, h }); }
    vol(R, cx, cy, r) { return this.rg([[0, mix(R[0], '#ffffff', 0.35)], [0.3, R[0]], [0.66, R[1]], [1, mix(R[1], R[2], 0.75)]], cx == null ? 0.36 : cx, cy == null ? 0.3 : cy, r == null ? 0.8 : r); }
  }

  // ---------- skins ----------
  const GAL = ['#5c4cb8', '#3a2e88', '#231a56'], NEB = ['#b86ad8', '#8a44b8', '#5a2a86'];
  const FROST = ['#dcf2ff', '#aad6f4', '#6f9fd8'], BLOS = ['#ffdcea', '#f7aecb', '#d97ca6'];
  const SK = {
    gold: { part: ['#fff6a8', '#fcd850', '#b87a14'], ol: '#7a4a08' },
    rainbow: { part: ['#e8d8ff', '#bc9cf0', '#8062c0'], ol: '#5a3f8a' },
    crystal: { part: ['#f6feff', '#c8ecfa', '#8ab8e0'], ol: '#4a6e9a' },
    ember: { part: RAMPS.berry, belly: '#fff0c4' },
    eclipse: { part: ['#fff2a0', '#fcc43e', '#ec982c'], partR: ['#6a76dc', '#3a3f9c', '#262a6a'], belly: '#fff4d6', bshade: '#c89060', ol: '#5a3a1a' },
    galaxy: { part: GAL, belly: '#e6dcff', bshade: '#8a78c8', dark: 1, ol: '#140e36' },
    frost: { part: FROST, belly: '#f6fbff', bshade: '#8cb4dc' },
    blossom: { part: BLOS, belly: '#fff6fa', bshade: '#d890b0' },
    pearl: { part: ['#fff8fc', '#f1e4f0', '#c8b8d8'], belly: '#fffaf6', bshade: '#b8aed0', ol: '#7a6a90' },
    pumpkin: { part: ['#ffc47a', '#f7922e', '#c8581c'], belly: '#ffe2b0' },
    ghost: { part: ['#ffffff', '#efeaff', '#c9bdf0'], belly: '#ffffff', ol: '#6e5caa' },
    candycorn: { part: ['#ffc27a', '#ff9a22', '#d0660c'], belly: '#fff8e0' },
    vampire: { part: ['#6e5a96', '#4a3a6c', '#2e2448'], belly: '#f4eeff', dark: 0, ol: '#1a1430' },
    witch: { part: ['#c89af0', '#8e56c8', '#5a2e8a'], belly: '#f0e2ff' },
    mummy: { part: ['#fffaf0', '#ece0c4', '#c4ae88'], belly: null, ol: '#6a5638' },
  };
  const TONE = { gold: ['#fcd850', '#a8680e'], rainbow: ['#fbe46a', '#8062c0'], crystal: ['#c8ecfa', '#8ab8e0'], ember: ['#d24552', '#8a2433'], pumpkin: ['#f7922e', '#c8581c'],
    ghost: ['#efeaff', '#c9bdf0'], mummy: ['#ece0c4', '#8a7456'], candycorn: ['#ff9a22', '#d0660c'], vampire: ['#4a3a6c', '#2e2448'], witch: ['#8e56c8', '#5a2e8a'],
    eclipse: ['#fcc43e', '#c86a1c'], galaxy: ['#3a2e88', '#231a56'], frost: ['#c4e4f8', '#8cbae2'], blossom: ['#fbc2da', '#e690b8'], pearl: ['#ecf0fc', '#c8cfe8'] };
  const faceIn = (x, y, grow) => ((x - 16) / (6.2 + grow)) ** 2 + ((y - 22 + 0.9) / (3.5 + grow)) ** 2 < 1;
  const BODY = ell(16, 22, BRX, BRY);

  function skinFill(c, skin, base) {
    const clip = c.clip(BODY), cl = inner => `<g clip-path="${clip}">${inner}</g>`;
    switch (skin) {
      case 'gold':
        return ell(16, 22, BRX, BRY, `fill="${c.rg([[0, '#ffffff'], [0.16, '#fff6a8'], [0.46, '#fcd850'], [0.78, '#e8a42a'], [1, '#a8680e']], 0.36, 0.3, 0.82)}"`) + cl(
          path('M6 24.3Q16 22.8 26 24.3L26 26.9Q16 25.4 6 26.9Z', `fill="#c47f14" opacity=".38" filter="${c.blur(0.4)}"`) +
          line('M8.4 21L21 8.4', '#ffffff', 0.85, `opacity=".8" filter="${c.blur(0.16)}"`) + line('M7 19.8L19.8 7', '#ffffff', 0.45, `opacity=".55" filter="${c.blur(0.12)}"`) +
          path(sparkleD(20.6, 17.4, 0.9), 'fill="#ffffff" opacity=".9"'));
      case 'rainbow': {
        const cols = ['#ff9aaa', '#ffbc78', '#fbe46a', '#a4e27a', '#7ccff4', '#bc9cf0'], dir = [0.41, 0.912], L = 14.23, s0 = [16 + dir[0] * 2.19, 22 + dir[1] * 2.19];
        const st = []; cols.forEach((col, i) => { st.push([n(i / 6 + 0.012), col], [n((i + 1) / 6 - 0.012), col]); });
        const g = c.lg(st, n(s0[0]), n(s0[1]), n(s0[0] + dir[0] * L), n(s0[1] + dir[1] * L), ' gradientUnits="userSpaceOnUse" spreadMethod="repeat"');
        return ell(16, 22, BRX, BRY, `fill="${g}"`);
      }
      case 'crystal': {
        const cols = ['#c8ecfa', '#bfe2f8', '#d8ccf8', '#a8d4f2', '#e2d8ff', '#a2c8ee'], pt = (a, r) => [16 + Math.cos(a) * 7.2 * r, 22 + Math.sin(a) * 6.8 * r];
        let s = '';
        for (let j = 0; j < 6; j++) { // outer ring, offset half a step
          const a0 = (j - 0.5) * Math.PI / 3 - Math.PI, a1 = a0 + Math.PI / 3, am = (a0 + a1) / 2;
          s += path(polyD([pt(a0, 0.58 * Math.cos(Math.PI / 6)), pt(am, 0.58), pt(a1, 0.58 * Math.cos(Math.PI / 6)), pt(a1, 1.6), pt(a0, 1.6)]), `fill="${c.lg([[0, '#ffffff'], [0.5, cols[(j * 5 + 3) % 6]], [1, mix(cols[(j * 5 + 3) % 6], '#8ab8e0', 0.5)]], 0, 0, 1, 1)}" stroke="#ffffff" stroke-width=".22" stroke-linejoin="round"`);
        }
        for (let j = 0; j < 6; j++) { // inner hexagon
          const a0 = j * Math.PI / 3 - Math.PI, a1 = a0 + Math.PI / 3;
          s += path(polyD([[16, 22], pt(a0, 0.58), pt(a1, 0.58)]), `fill="${c.lg([[0, '#f6feff'], [1, cols[(j * 5) % 6]]], 0, 0, 1, 1)}" stroke="#ffffff" stroke-width=".22" stroke-linejoin="round"`);
        }
        return ell(16, 22, BRX, BRY, 'fill="#c8ecfa"') + cl(s + path(sparkleD(11.6, 16.2, 1.1), 'fill="#ffffff"') + path(sparkleD(21.4, 25.2, 0.7), 'fill="#ffffff" opacity=".9"'));
      }
      case 'ember': {
        let s = '';
        for (let row = 0; row < 6; row++) {
          const y = 15.6 + row * 3, off = (row % 2) * 2;
          for (let x = 4 + off; x < 28; x += 4) {
            s += line(`M${x} ${y}Q${x + 2} ${y + 2.1} ${x + 4} ${y}`, '#9a2c3c', 0.42, 'opacity=".8"');
            s += line(`M${x + 0.8} ${y + 0.5}Q${x + 2} ${y + 1.5} ${x + 3.2} ${y + 0.5}`, '#f07a84', 0.2, 'opacity=".55"');
          }
        }
        return ell(16, 22, BRX, BRY, `fill="${c.vol(RAMPS.berry)}"`) + cl(s);
      }
      case 'eclipse': {
        let s = circ(12, 21.5, 8.3, `fill="${c.rg([[0, '#fffbe0'], [0.35, '#fff2a0'], [0.72, '#fcc43e'], [1, '#ec982c']], 0.42, 0.3, 0.75)}"`);
        s += circ(12, 21.5, 7.7, `fill="none" stroke="#f5922e" stroke-width="1.1" opacity=".75" filter="${c.blur(0.35)}"`);
        s += circ(12, 21.5, 8.3, `fill="none" stroke="#fff4c8" stroke-width="1.4" opacity=".7" filter="${c.blur(0.4)}"`) + circ(12, 21.5, 8.3, 'fill="none" stroke="#fff4c8" stroke-width=".4"');
        for (const [x, y, col, r] of [[22.5, 18.5, '#ffffff', 0.85], [21.9, 25.4, '#fff27a', 0.7], [20.8, 27.6, '#ffffff', 0.5], [23.6, 22.2, '#cfd6ff', 0.4]]) s += path(sparkleD(x, y, r), `fill="${col}"`);
        return ell(16, 22, BRX, BRY, `fill="${c.rg([[0, '#7d8cf0'], [0.45, '#5a66cc'], [0.8, '#3a3f9c'], [1, '#262a6a']], 0.62, 0.3, 0.8)}"`) + cl(s);
      }
      case 'galaxy': {
        let s = line('M5 13.2L27 30.8', NEB[0], 5.2, `opacity=".35" filter="${c.blur(1.1)}"`) + line('M5 13.2L27 30.8', NEB[1], 2.4, `opacity=".85" filter="${c.blur(0.5)}"`) + line('M5 13.2L27 30.8', '#e0a8f4', 0.5, `opacity=".5" filter="${c.blur(0.3)}"`);
        const cols = ['#ffffff', '#fff6b0', '#b8f0ff'];
        for (let y = 14; y < 30; y++) for (let x = 7; x < 25; x++) {
          if (((x - 15.5) / 8.3) ** 2 + ((y - 21.5) / 7.7) ** 2 > 0.9 || faceIn(x + 0.5, y + 0.5, 0.4)) continue;
          if ((x * 37 + y * 23 + ((x * y) % 5) * 7) % 19 === 0) s += circ(x + 0.5, y + 0.5, 0.2 + ((x + y) % 3) * 0.05, `fill="${cols[(x + y) % 3]}"`);
        }
        s += path(sparkleD(11.5, 17.2, 1), 'fill="#ffffff"') + path(sparkleD(21.6, 25.6, 0.9), 'fill="#ffffff"') + circ(11.5, 17.2, 1.1, `fill="#aab4ff" opacity=".5" filter="${c.blur(0.4)}"`);
        return ell(16, 22, BRX, BRY, `fill="${c.vol(GAL)}"`) + cl(s);
      }
      case 'frost': {
        const cap = []; for (let x = 6; x <= 26; x += 0.5) cap.push([x, 17 + Math.sin((x - 16) * 1.1 + 0.6) * 0.75]);
        let s = path('M6 12L26 12L' + P(cap.slice().reverse()).join('L') + 'Z', `fill="${c.lg([[0, '#ffffff'], [0.8, '#ffffff'], [1, '#eef8ff']])}"`);
        s += path(smooth(cap, false), 'fill="none" stroke="#c8e4f8" stroke-width=".3" opacity=".8"');
        const flake = (x, y, r) => { let d = ''; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; d += `M${n(x - Math.cos(a) * r)} ${n(y - Math.sin(a) * r)}L${n(x + Math.cos(a) * r)} ${n(y + Math.sin(a) * r)}`; } return line(d, '#ffffff', 0.24) + circ(x, y, 0.22, 'fill="#ffffff"'); };
        s += flake(21.9, 19.6, 0.95) + flake(10.3, 24.8, 0.9) + flake(21.8, 26.8, 0.75) + path(sparkleD(9.4, 20.4, 0.55), 'fill="#f0faff"');
        return ell(16, 22, BRX, BRY, `fill="${c.vol(FROST)}"`) + cl(s);
      }
      case 'blossom': {
        let s = '';
        for (const [x, y, r] of [[20.6, 17.4, 1.05], [11.5, 16.4, 1.05], [22.6, 25.5, 0.95], [9.4, 25.5, 0.95]]) {
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += ell(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, r * 0.46, r * 0.42, 'fill="#ffffff" stroke="#f3c6d8" stroke-width=".12"', a); }
          s += circ(x, y, r * 0.28, 'fill="#fbe236"');
        }
        return ell(16, 22, BRX, BRY, `fill="${c.vol(BLOS)}"`) + cl(s);
      }
      case 'pearl': {
        const st = [], cols = ['#f9e2ee', '#e2e8fb', '#dff3ec', '#fae8d8'];
        cols.concat([cols[0]]).forEach((col, i) => st.push([n(i / 4), col]));
        return ell(16, 22, BRX, BRY, `fill="${c.rg(st, 12.5, 17.8, 10.4, ' gradientUnits="userSpaceOnUse" spreadMethod="reflect"')}"`) +
          cl(ell(12.6, 17.4, 3.2, 2, `fill="#ffffff" opacity=".8" filter="${c.blur(0.7)}"`, -0.5));
      }
      case 'pumpkin':
        return ell(16, 22, BRX, BRY, `fill="${c.vol(SK.pumpkin.part)}"`) + cl(
          ell(16, 22, 3.3, 8.4, 'fill="none" stroke="#c8581c" stroke-width=".42" opacity=".6"') + ell(16, 22, 6.7, 8.4, 'fill="none" stroke="#c8581c" stroke-width=".42" opacity=".6"') +
          ell(15.5, 22, 3.3, 8.4, 'fill="none" stroke="#ffd08a" stroke-width=".25" opacity=".45"') + ell(15.4, 22, 6.7, 8.4, 'fill="none" stroke="#ffd08a" stroke-width=".25" opacity=".45"'));
      case 'ghost':
        return ell(16, 22, BRX, BRY, `fill="${c.vol(SK.ghost.part)}"`);
      case 'candycorn':
        return ell(16, 22, BRX, BRY, `fill="${c.lg([[0, '#fffaf0'], [0.27, '#fff4e2'], [0.31, '#ffae3a'], [0.64, '#ff9a22'], [0.68, '#ffe04a'], [1, '#ffd23a']])}"`);
      case 'vampire': {
        const face = smooth([[9.9, 21.1], [10.7, 19], [12.6, 17.8], [14.6, 17.6], [16, 18.9], [17.4, 17.6], [19.4, 17.8], [21.3, 19], [22.1, 21.1], [21.2, 23.3], [19, 24.4], [16, 24.7], [13, 24.4], [10.8, 23.3]], true);
        return ell(16, 22, BRX, BRY, `fill="${c.vol(SK.vampire.part)}"`) + cl(
          path(face, `fill="${c.rg([[0, '#ffffff'], [0.6, '#ebe4f6'], [1, '#c4b8d8']], 0.4, 0.3, 0.8)}"`) +
          path('M12.6 23.1L9.2 23.1L12.6 26.2Z', `fill="${c.lg([[0, '#b02846'], [1, '#e8506a']], 0, 0, 1, 0)}" stroke="#7a1a34" stroke-width=".2" stroke-linejoin="round"`) +
          path('M19.4 23.1L22.8 23.1L19.4 26.2Z', `fill="${c.lg([[0, '#e8506a'], [1, '#b02846']], 0, 0, 1, 0)}" stroke="#7a1a34" stroke-width=".2" stroke-linejoin="round"`));
      }
      case 'witch': {
        let s = ell(16, 21.1, 6.2, 3.5, `fill="${c.rg([[0, '#e8ffc0'], [0.6, '#a2dc6a'], [1, '#62a848']], 0.4, 0.3, 0.8)}"`);
        for (const [x, y] of [[9.2, 16.8], [20.4, 15.4], [23.2, 25.4], [10.6, 27], [13.6, 14.9], [7.6, 22.8]]) s += path(sparkleD(x, y, 0.6), 'fill="#fff27a"');
        return ell(16, 22, BRX, BRY, `fill="${c.vol(SK.witch.part)}"`) + cl(s);
      }
      case 'mummy': {
        const B0 = RAMPS[base] || RAMPS.cream;
        let s = '';
        for (let i = -8; i < 10; i++) {
          const y0 = 7 + i * 2.7;
          s += path(`M0 ${n(y0)}L34 ${n(y0 + 17)}L34 ${n(y0 + 19.3)}L0 ${n(y0 + 2.3)}Z`, `fill="${i % 2 ? '#fffaf0' : '#f2e8d2'}" stroke="#c4ae88" stroke-width=".22"`);
        }
        s += ell(16, 21.1, 6.3, 3.4, `fill="${mix(B0[1], '#5a4030', 0.18)}" stroke="#c4ae88" stroke-width=".35"`);
        return ell(16, 22, BRX, BRY, 'fill="#ece0c4"') + cl(s);
      }
    }
    return '';
  }

  // ---------- markings ----------
  function patternInk(pc, mid, dark) { if (!mid) return pc; return Math.abs(lum(pc) - lum(mid)) >= 0.15 ? pc : mix(pc, dark, 0.85); }
  function taper(x1, y1, x2, y2, w, col) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return path(`M${n(x1 + nx)} ${n(y1 + ny)}Q${n(mx + nx)} ${n(my + ny)} ${n(x2)} ${n(y2)}Q${n(mx - nx)} ${n(my - ny)} ${n(x1 - nx)} ${n(y1 - ny)}Z`, `fill="${col}"`) + circ(x1, y1, w / 2, `fill="${col}"`);
  }
  function patternBody(c, L, skin, R) { // clipped to the body, under the belly
    const pc = L.patternColor || BELLY, mid = skin ? (TONE[skin] || [])[0] : R[1], dark = skin ? (TONE[skin] || [])[1] : R[2];
    const pi = patternInk(L.pattern === 'moonmark' && pc === BELLY ? '#fff27a' : pc, mid, dark);
    const dot = (x, y, r, col) => circ(x, y, r, `fill="${col || pc}"`);
    switch (L.pattern) {
      case 'spots': return dot(10.9, 16.9, 1.05) + dot(21.2, 17.9, 1.0) + dot(9.6, 24.6, 0.62) + dot(22.5, 25.1, 0.72) + dot(13.6, 15.3, 0.55) + dot(18.6, 14.9, 0.48);
      case 'stripes': return taper(12.5, 14.2, 12.6, 17.3, 1, pc) + taper(16, 13.8, 16, 16.1, 1.1, pc) + taper(19.5, 14.2, 19.4, 17.3, 1, pc) + taper(8, 18, 9.9, 19.4, 0.9, pc) + taper(24, 18, 22.1, 19.4, 0.9, pc);
      case 'freckles': return [[8.5, 21.5], [9.5, 20.5], [10.5, 21.5], [23.5, 21.5], [22.5, 20.5], [21.5, 21.5], [9.5, 23.6], [22.5, 23.6]].map(([x, y]) => dot(x, y, 0.33)).join('');
      case 'twotone': return skin ? '' : path('M5 19.2Q10.5 17.7 16 18.9Q21.5 20 27 18.4L27 12L5 12Z', `fill="${c.rg([[0, mix(pc, '#ffffff', 0.4)], [0.6, pc], [1, mix(pc, R[2], 0.35)]], 0.35, 0.3, 0.9)}"`);
      case 'mask': return path('M8.8 19.3Q12.6 18.1 16 19.3Q19.4 18.1 23.2 19.3L23.2 21.7Q19.4 22.6 16 21.6Q12.6 22.6 8.8 21.7Z', `fill="${pc}"`);
      case 'zigzag': return line('M8.9 19.1L12.5 15.5L14.5 17.5L16 16.1L17.5 17.5L19.5 15.5L23.1 19.1', pi, 0.95);
      case 'patches': return path(smooth([[9.2, 18.2], [10.4, 16.8], [12.4, 16.1], [14.3, 16.9], [15.1, 18.8], [14.8, 21], [12.8, 22.2], [10.4, 21.9], [9.1, 20.3]], true), `fill="${pi}"`) +
        path(smooth([[16.9, 14.2], [18.6, 14.6], [20.4, 15.8], [21, 17.5], [19.6, 17.9], [18.1, 16.6], [16.9, 15.5]], true), `fill="${pi}"`) + path(smooth([[20.4, 25.2], [22.4, 24.9], [22.9, 26.3], [21.6, 27.7], [20.2, 27.4]], true), `fill="${pi}"`);
      case 'tiger': { const t = taper(7.9, 17.6, 12.1, 17.2, 1, pi) + taper(7.4, 20.5, 11, 20.6, 1, pi) + taper(8.1, 26.3, 11, 25.2, 0.95, pi) + taper(12.9, 14.3, 14.7, 16.8, 0.9, pi); return t + mir(t); }
      case 'moonmark': return path('M16.5 15.1A1.95 1.95 0 1 0 16.5 18.9A1.6 1.6 0 1 1 16.5 15.1Z', `fill="${pi}"`);
    }
    return '';
  }
  function patternBelly(L) { // drawn over the belly
    const pc = L.patternColor || BELLY;
    if (L.pattern === 'star') return path(polyD(starPts(16, 26.1, 1.95, 0.85, 5)), fs(pc === BELLY ? '#f6c83a' : pc, pc === BELLY ? '#c7861c' : mix(pc, INK, 0.35), 0.22) + ' ' + NOL);
    if (L.pattern === 'heart') { const col = pc === (L.belly || BELLY) || pc === BELLY ? '#e8608a' : pc; return path(heartD(16, 26.3, 1.55), fs(col, mix(col, INK, 0.35), 0.22) + ' ' + NOL); }
    return '';
  }

  // ---------- flowers (bloom stage), centred on (x, y) ----------
  const FLOWER = {
    sunflower(c, x, y) {
      let s = '';
      const back = c.lg([[0, '#f6c83a'], [1, '#c7861c']], 0, 0, 1, 0), front = c.lg([[0, '#fbe25a'], [0.55, '#fff27a'], [1, '#f6c83a']], 0, 0, 1, 0);
      for (let i = 0; i < 10; i++) { const a = (i + 0.5) * Math.PI / 5; s += at(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, a, path(petalD(2.1, 0.95), fs(back, '#8a5a14', 0.28))); }
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; s += at(x + Math.cos(a) * 3.0, y + Math.sin(a) * 3.0, a, path(petalD(2.1, 1.05), fs(front, '#8a5a14', 0.28)) + line(`M${-1.3} 0L1.2 0`, '#e0a02a', 0.18, 'opacity=".6"')); }
      s += circ(x, y, 2.4, fs(c.rg([[0, '#c48a5c'], [0.6, '#8f563b'], [1, '#5a3322']], 0.4, 0.35, 0.7), '#3a2014', 0.3));
      for (let i = 1; i < 30; i++) { const r = 0.4 * Math.sqrt(i), a = i * 2.39996; if (r < 2.05) s += circ(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.16, `fill="${i % 3 ? '#4a2a18' : '#d8a066'}" opacity=".8"`); }
      return s + ell(x - 0.8, y - 0.9, 0.9, 0.5, `fill="#ffffff" opacity=".3" filter="${c.blur(0.2)}"`, -0.6);
    },
    bluebell(c, x, y) {
      const S = '#37946e', BR = ['#c0ccff', '#6b82e8', '#3f45a8'];
      let s = at(x - 1.8, y + 3.8, 0.5 + Math.PI, path(leafD(1.9, 0.8), fs(c.lg([[0, '#99e550'], [1, '#6abe30']]), OL(RAMPS.leaf), 0.28))) + at(x + 1.8, y + 3.8, -0.5, path(leafD(1.9, 0.8), fs(c.lg([[0, '#99e550'], [1, '#6abe30']]), OL(RAMPS.leaf), 0.28)));
      s += line(`M${x} ${y + 5}L${x} ${y - 1.4}M${x} ${y + 0.2}Q${x - 1.2} ${y - 1.6} ${x - 2.8} ${y - 1.6}M${x} ${y + 0.2}Q${x + 1.2} ${y - 1.6} ${x + 2.8} ${y - 1.6}M${x} ${y - 1.2}L${x} ${y - 4.6}`, mix(S, INK, 0.3), 0.75) + line(`M${x} ${y + 5}L${x} ${y - 1.4}M${x} ${y + 0.2}Q${x - 1.2} ${y - 1.6} ${x - 2.8} ${y - 1.6}M${x} ${y + 0.2}Q${x + 1.2} ${y - 1.6} ${x + 2.8} ${y - 1.6}M${x} ${y - 1.2}L${x} ${y - 4.6}`, S, 0.4);
      const bell = (bx, by) => at(bx, by, 0, path('M-1.8 0.4C-1.9 -2.5 1.9 -2.5 1.8 0.4L2.25 2.3Q1.5 1.75 0.75 2.3Q0 1.75 -0.75 2.3Q-1.5 1.75 -2.25 2.3Z', fs(c.vol(BR, 0.35, 0.25), OL(BR), 0.3)) +
        ell(0, 2.05, 1.5, 0.35, `fill="${BR[2]}" opacity=".7"`) + line('M-0.9 -1.2Q-1.3 0 -1.1 1.2', '#ffffff', 0.35, 'opacity=".55"'));
      return s + bell(x - 2.8, y + 0.2) + bell(x + 2.8, y + 0.2) + bell(x, y - 3.2);
    },
    daisy(c, x, y) {
      let s = '';
      const pf = c.lg([[0, '#ffffff'], [0.7, '#f4f4fb'], [1, '#cfd6ea']], 0, 0, 1, 0);
      for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 6; s += at(x + Math.cos(a) * 3, y + Math.sin(a) * 3, a, path(roundPetalD(1.9, 0.72), fs(pf, '#9aa2c0', 0.24))); }
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; s += at(x + Math.cos(a) * 2.9, y + Math.sin(a) * 2.9, a, path(roundPetalD(2, 0.8), fs(pf, '#9aa2c0', 0.24))); }
      s += circ(x, y, 1.75, fs(c.rg([[0, '#fff9a0'], [0.5, '#f6c83a'], [1, '#d0901c']], 0.4, 0.35, 0.7), '#9a6a10', 0.28));
      for (let i = 1; i < 14; i++) { const r = 0.4 * Math.sqrt(i), a = i * 2.39996; if (r < 1.45) s += circ(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.13, 'fill="#c7861c" opacity=".7"'); }
      return s;
    },
    hibiscus(c, x, y) {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        s += at(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, a, path('M-2.2 0C-2.2 -2.2 1.6 -3.2 2.6 -0.8Q2.2 0 2.6 0.8C1.6 3.2 -2.2 2.2 -2.2 0Z', fs(c.rg([[0, '#a0223a'], [0.35, '#ec4c64'], [1, '#ffb0bc']], 0.1, 0.5, 1.0), '#6a1024', 0.28)) + line('M-1.4 0L1.6 0M-1 0L1.2 -1.1M-1 0L1.2 1.1', '#c02a4a', 0.16, 'opacity=".7"'));
      }
      s += circ(x, y, 1.2, 'fill="#8a2433"') + line(`M${x} ${y}Q${x + 1} ${y - 1.2} ${x + 2.4} ${y - 3.3}`, '#fbf3dc', 0.38);
      for (const [dx, dy] of [[2.5, -3.6], [3.1, -3.1], [2, -3.9], [2.9, -3.8]]) s += circ(x + dx, y + dy, 0.33, 'fill="#fbf236" stroke="#c89a10" stroke-width=".1"');
      return s;
    },
    sealily(c, x, y) {
      const AQ = ['#d8fff8', '#8ee0d8', '#4a9aa8'], WH = ['#ffffff', '#eafcff', '#a8d8e0'];
      let s = ell(x, y + 3.7, 4.8, 1.2, fs(c.lg([[0, '#8fd060'], [1, '#2f6048']]), '#1e4030', 0.3)) + line(`M${x} ${y + 3.7}L${x + 3.4} ${y + 3.2}`, '#2f6048', 0.2);
      const pet = (ang, R) => { const a = ang * Math.PI / 180; return at(x + Math.cos(a) * 2.4, y + 2.3 + Math.sin(a) * 2.4, a, path(petalD(2.7, 1.25), fs(c.lg([[0, R[1]], [0.6, R[0]], [1, mix(R[0], '#ffffff', 0.5)]], 0, 0, 1, 0), OL(R), 0.26))); };
      s += pet(-165, AQ) + pet(-15, AQ) + pet(-128, WH) + pet(-52, WH) + pet(-90, WH);
      return s + ell(x, y + 2.3, 1.2, 0.7, 'fill="#fbf236" stroke="#c8a018" stroke-width=".18"');
    },
    beachrose(c, x, y) {
      const RR = ['#ffc4b0', '#f47e68', '#b8483e'];
      let s = at(x - 3.4, y + 3, 0.5 + Math.PI, path(leafD(2.2, 1), fs(c.lg([[0, '#99e550'], [1, '#6abe30']]), OL(RAMPS.leaf), 0.28))) + at(x + 3.4, y + 3, -0.5, path(leafD(2.2, 1), fs(c.lg([[0, '#99e550'], [1, '#6abe30']]), OL(RAMPS.leaf), 0.28)));
      s += ell(x, y, 4.1, 3.7, fs(c.vol(RR), OL(RR), 0.3));
      s += line(`M${x + 0.2} ${y - 0.1}C${x + 1.3} ${y - 1.2} ${x - 1.2} ${y - 1.8} ${x - 1.4} ${y - 0.2}C${x - 1.6} ${y + 1.6} ${x + 1.9} ${y + 2} ${x + 2.2} ${y - 0.2}C${x + 2.5} ${y - 2.6} ${x - 1.4} ${y - 3.4} ${x - 2.9} ${y - 1.2}C${x - 3.8} ${y + 0.6} ${x - 2.2} ${y + 2.9} ${x + 0.4} ${y + 2.9}`, '#b8483e', 0.3, 'opacity=".8"');
      return s + ell(x - 1.6, y - 2.2, 1.1, 0.55, `fill="#ffffff" opacity=".45" filter="${c.blur(0.2)}"`, -0.5);
    },
    primrose(c, x, y) {
      let s = '';
      const pf = c.rg([[0, '#fbe070'], [0.35, '#fbf09a'], [1, '#fffde8']], 0.5, 0.95, 1.1);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        s += at(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, a + Math.PI / 2, path('M0 1.9C-1.4 1.6 -2.3 0.2 -2 -1.1C-1.7 -2.2 -0.6 -2.2 0 -1.5C0.6 -2.2 1.7 -2.2 2 -1.1C2.3 0.2 1.4 1.6 0 1.9Z', fs(pf, '#9a8030', 0.26)));
      }
      return s + circ(x, y, 1.2, fs('#f6a83a', '#b8641a', 0.24)) + circ(x, y, 0.45, 'fill="#6abe30"');
    },
    moonflower(c, x, y) {
      let s = circ(x, y, 5, `fill="#dcd0ff" opacity=".45" filter="${c.blur(0.7)}"`);
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.1 : 4.6; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.96]); }
      s += path(smooth(pts, true), fs(c.rg([[0, '#fff6b0'], [0.18, '#ffffff'], [0.7, '#ece6ff'], [1, '#b8a8e8']], 0.5, 0.5, 0.55), '#7a68b0', 0.3));
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += line(`M${n(x + Math.cos(a) * 1.1)} ${n(y + Math.sin(a) * 1.1)}L${n(x + Math.cos(a) * 4.1)} ${n(y + Math.sin(a) * 4.1)}`, '#c9b4f0', 0.32); }
      s += circ(x, y, 1, 'fill="#fff6b0"') + circ(x, y, 0.45, 'fill="#fbe236"');
      for (const [dx, dy, r] of [[-6, -3, 0.75], [5.2, -4, 0.85], [5, 3.2, 0.6], [-5.8, 3.2, 0.55]]) s += path(sparkleD(x + dx, y + dy, r), 'fill="#fff27a" ' + NOL);
      return s;
    },
    nightshade(c, x, y) {
      const pts = starPts(x, y, 5.1, 2.3, 5);
      let s = path(rpoly(pts, pts.map((_, i) => (i % 2 ? 0.8 : 1.1))), fs(c.rg([[0, '#4a2478'], [0.3, '#7a44b8'], [1, '#c8a0f0']], 0.5, 0.5, 0.6), '#2a1048', 0.3));
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += line(`M${n(x + Math.cos(a) * 1.2)} ${n(y + Math.sin(a) * 1.2)}L${n(x + Math.cos(a) * 3.6)} ${n(y + Math.sin(a) * 3.6)}`, '#3a1c60', 0.28, 'opacity=".75"'); }
      s += path(`M${x - 0.9} ${y + 0.4}L${x} ${y - 1.8}L${x + 0.9} ${y + 0.4}Z`, fs('#fbe236', '#b88a10', 0.2));
      return s;
    },
    candytulip(c, x, y) {
      const shape = `M${x - 3.6} ${y + 1}L${x - 3.5} ${y - 3.5}Q${x - 2.4} ${y - 2.2} ${x - 1.5} ${y - 1.3}L${x} ${y - 4.5}L${x + 1.5} ${y - 1.3}Q${x + 2.4} ${y - 2.2} ${x + 3.5} ${y - 3.5}L${x + 3.6} ${y + 1}C${x + 3.6} ${y + 5.2} ${x - 3.6} ${y + 5.2} ${x - 3.6} ${y + 1}Z`;
      const cl = c.clip(path(shape));
      let stripes = ''; for (let i = -6; i < 8; i++) stripes += path(`M${x - 6 + i * 2} ${y - 6}L${x - 5 + i * 2} ${y - 6}L${x + 3 + i * 2} ${y + 6}L${x + 2 + i * 2} ${y + 6}Z`, 'fill="#e8445a"');
      return path(shape, 'fill="#fff4f6"') + `<g clip-path="${cl}">${stripes}${path(shape, `fill="${c.rg([[0, '#ffffff', 0.55], [0.45, '#ffffff', 0], [0.8, INK, 0], [1, INK, 0.3]], 0.35, 0.3, 0.8)}"`)}</g>` + path(shape, 'fill="none" stroke="#8a1a30" stroke-width=".3" stroke-linejoin="round"');
    },
    cottonrose(c, x, y) {
      const Pk = ['#fff0f8', '#ffc8e0', '#e090b8'], V = ['#faf2ff', '#dcc8f8', '#a890d8'];
      let s = '';
      for (const [dx, dy, rx, ry, R] of [[-2.4, 0.6, 2.3, 2.2, Pk], [2.4, 0.6, 2.3, 2.2, Pk], [0, 2.3, 2.4, 2, V], [-1.4, -2.1, 2.2, 2.1, V], [1.5, -2.2, 2.2, 2.1, Pk], [0, 0, 2, 1.8, Pk]]) s += ell(x + dx, y + dy, rx, ry, fs(c.vol(R), OL(R), 0.28));
      return s + line(`M${x - 0.9} ${y}Q${x} ${y - 0.9} ${x + 0.9} ${y}`, '#e090b8', 0.3) + circ(x - 2.8, y - 2.6, 0.35, 'fill="#ffffff"');
    },
    sugarblossom(c, x, y) {
      let s = line(`M${x - 3} ${y + 2.2}Q${x} ${y + 0.6} ${x + 3.6} ${y - 1.4}`, '#5a3322', 1) + line(`M${x - 3} ${y + 2.2}Q${x} ${y + 0.6} ${x + 3.6} ${y - 1.4}`, '#a8704a', 0.55);
      const bl = (bx, by) => { let t = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; t += at(bx + Math.cos(a) * 1.3, by + Math.sin(a) * 1.3, a, path(roundPetalD(1.1, 0.95), fs(c.lg([[0, '#e07ba0'], [0.4, '#ffb8d4'], [1, '#fff0f6']], 0, 0, 1, 0), '#b05080', 0.22))); } return t + circ(bx, by, 0.5, 'fill="#d24552"') + circ(bx - 0.15, by - 0.15, 0.18, 'fill="#fbe236"'); };
      s += bl(x - 2.3, y - 1.6) + bl(x + 2.5, y - 2.1) + bl(x + 0.3, y + 2.3);
      return s + path(sparkleD(x - 6, y - 4, 0.6), 'fill="#ffd6e8" ' + NOL) + path(sparkleD(x + 5.2, y + 2.2, 0.5), 'fill="#ffd6e8" ' + NOL);
    },
  };

  // ---------- leaves, stems, buds ----------
  function leafPair(c, cx, cy, l, w, rot, LR) {
    const fill = c.lg([[0, mix(LR[0], '#ffffff', 0.3)], [0.45, LR[0]], [1, LR[1]]]);
    const one = at(cx, cy, rot, path(leafD(l, w), fs(fill, OL(LR), 0.3)) + line(`M${n(-l * 0.8)} ${n(w * 0.05)}Q0 ${n(-w * 0.2)} ${n(l * 0.85)} 0`, LR[2], 0.2, 'opacity=".7"') +
      line(`M${n(-l * 0.45)} ${n(-w * 0.5)}Q0 ${n(-w * 0.8)} ${n(l * 0.4)} ${n(-w * 0.5)}`, '#ffffff', 0.32, 'opacity=".65"'), true);
    return one + mir(one);
  }
  function stem(c, top, col, ol) { return path(tubeD([[16, 15.8], [16.1, (15.8 + top) / 2], [16, top]], 1.15, 0.95), fs(c.lg([[0, mix(col, '#ffffff', 0.25)], [1, col]], 0, 0, 1, 0), ol, 0.3)); }
  function stageArt(c, L, LR, skin) {
    const stemCol = skin === 'pumpkin' && !L.bud && !L.bloom ? '#7a4a2a' : LR[1];
    if (L.bloom) return stem(c, 10.8, '#4aa84a', '#1e5a38') + leafPair(c, 13, 13.4, 2.2, 1, 0.45, RAMPS.leaf) + (FLOWER[L.bloom] || FLOWER.primrose)(c, 16, 6.5);
    if (L.bud) {
      const BR = { sun: RAMPS.sun, moon: ['#c8b8ff', '#7a5ad8', '#43308e'], wild: RAMPS.leaf }[L.bud] || RAMPS.leaf;
      const bud = 'M16 1.5C17.3 3.2 18.95 4.6 18.95 6.9C18.95 9.1 17.6 10.3 16 10.3C14.4 10.3 13.05 9.1 13.05 6.9C13.05 4.6 14.7 3.2 16 1.5Z';
      let s = stem(c, 9.6, LR[1], OL(LR)) + leafPair(c, 12.9, 12.9, 2.4, 1.1, 0.45, LR);
      s += path(bud, fs(c.vol(BR, 0.35, 0.35, 0.85), OL(BR), 0.34));
      if (L.bud === 'wild') { const cl = c.clip(path(bud)); s += `<g clip-path="${cl}">${path('M12 5.3Q14 4.1 16 5.1Q18 4.1 20 5.3L20 0L12 0Z', `fill="${c.lg([[0, '#f7b6c8'], [1, '#e07ba0']])}"`)}</g>` + path(bud, `fill="none" stroke="${OL(BR)}" stroke-width=".34" ${NOL}`); }
      s += line('M16 1.9C17.9 4.4 17.5 7.9 15.3 9.8', BR[2], 0.24, 'opacity=".65"') + line('M14.2 5.1Q13.9 6.6 14.3 7.9', '#ffffff', 0.5, `opacity=".55" filter="${c.blur(0.12)}"`);
      s += path('M12.8 7.5Q13.9 8.7 14.4 9.7Q15.2 8.9 16 8.5Q16.8 8.9 17.6 9.7Q18.1 8.7 19.2 7.5Q19.1 9.9 18.2 10.9L13.8 10.9Q12.9 9.9 12.8 7.5Z', fs(c.lg([[0, '#99e550'], [0.6, '#6abe30'], [1, '#37946e']]), OL(RAMPS.leaf), 0.3));
      const spk = { sun: '#fff27a', moon: '#dcd0ff' }[L.bud];
      if (spk) s += path(sparkleD(19.9, 3.3, 0.85), `fill="${spk}" ${NOL}`) + path(sparkleD(12.3, 4.9, 0.6), `fill="${spk}" ${NOL}`);
      return s;
    }
    return stem(c, 11.8, stemCol, OL(LR)) + leafPair(c, 12.6, 11.4, 3.2, 1.6, 0.42, LR);
  }

  // ---------- body parts (flap / walk / frame follow pixel.js buildSprig) ----------
  function wingD(rx, ry) {
    return `M${n(rx * 0.55)} ${n(ry)}C${n(rx * 1.15)} ${n(ry * 0.2)} ${n(rx * 1.05)} ${n(-ry * 0.8)} 0 ${n(-ry)}C${n(-rx * 0.9)} ${n(-ry * 1.05)} ${n(-rx * 1.2)} ${n(-ry * 0.55)} ${n(-rx * 1.05)} ${n(-ry * 0.2)}` +
      `Q${n(-rx * 1.45)} 0 ${n(-rx * 0.95)} ${n(ry * 0.22)}Q${n(-rx * 1.3)} ${n(ry * 0.5)} ${n(-rx * 0.7)} ${n(ry * 0.56)}Q${n(-rx * 0.95)} ${n(ry * 0.9)} ${n(-rx * 0.28)} ${n(ry * 0.86)}Q${n(0)} ${n(ry * 1.2)} ${n(rx * 0.55)} ${n(ry)}Z`;
  }
  const HORN = ['#fff0dc', '#eec39a', '#b8865a'], CLOUD = RAMPS.cloud;
  function partsBack(c, pt, R, LR, L, pz) {
    let s = '';
    const flap = pz.flap ? (pz.frame ? -1.6 : 1.2) : 0;
    if (pt.dragonwings > 0) {
      const k = sz(pt.dragonwings), kx = Math.min(k, 1), ky = k * 0.95, ox = 9.5, oy = 17.5;
      const w = [[0, -1.5], [-2.6, -8], [-6, -12.6], [-8.4, -12], [-8.6, -8], [-6.8, -7], [-8.6, -3.4], [-6.4, -3], [-7, 1.2], [-4.6, 0], [-3.4, 3.4], [0, 2]].map(([x, y]) => [ox + x * kx, oy + y * ky + (y < -5 ? flap : 0)]);
      const pull = (p, t) => [p[0] + (ox - p[0]) * t, p[1] + (oy - p[1]) * t];
      const q = (p, e) => `Q${P([pull(p, 0.28)])} ${P([e])}`;
      const d = `M${P([w[0]])}Q${P([w[1]])} ${P([w[2]])}L${P([w[3]])}L${P([w[4]])}${q(w[5], w[6])}${q(w[7], w[8])}${q(w[9], w[10])}L${P([w[11]])}Z`;
      let one = path(d, fs(c.rg([[0, '#8a2433'], [0.45, '#d24552'], [1, '#f07a84']], 1, 0.9, 1.2), '#4a0e1c', 0.36));
      for (const i of [4, 6, 8]) one += line(`M9 16.2L${P([w[i]])}`, '#7a1c2c', 0.5) + line(`M9 16.2L${P([w[i]])}`, '#e05a6a', 0.14, 'opacity=".6"');
      one += line(`M${P([w[0]])}Q${P([w[1]])} ${P([w[2]])}L${P([w[3]])}`, '#f5909a', 0.3, 'opacity=".85"');
      one += path(`M${n(w[3][0] + 0.2)} ${n(w[3][1] + 0.2)}Q${n(w[3][0] - 0.4)} ${n(w[3][1] - 1.1)} ${n(w[3][0] + 0.5)} ${n(w[3][1] - 1.7)}Q${n(w[3][0] + 0.6)} ${n(w[3][1] - 0.6)} ${n(w[3][0] + 1.1)} ${n(w[3][1] + 0.2)}Z`, fs('#fbf3dc', '#4a0e1c', 0.22));
      s += G(one + mir(one));
    }
    if (pt.batwings > 0) {
      const k = sz(pt.batwings), kx = Math.min(k, 1), ox = 9.5, oy = 18.5;
      const w = [[0, -1], [-2.5, -5], [-7.8, -7.6], [-8.2, -4], [-7, -1], [-6.6, 2], [-5, 0.8], [-3.6, 3.6], [-2.2, 1.8], [0, 3]].map(([x, y]) => [ox + x * kx, oy + y * k + (y < -5 ? flap : 0)]);
      const pull = (p, t) => [p[0] + (ox - p[0]) * t, p[1] + (oy - p[1]) * t];
      const d = `M${P([w[0]])}Q${P([w[1]])} ${P([w[2]])}Q${P([pull(w[3], 0.1)])} ${P([w[4]])}Q${P([pull(w[4], 0.35)])} ${P([w[5]])}Q${P([pull(w[6], 0.3)])} ${P([w[7]])}Q${P([pull(w[8], 0.3)])} ${P([w[9]])}Z`;
      let one = path(d, fs(c.rg([[0, '#342a52'], [0.5, '#4f4270'], [1, '#8a7ab4']], 1, 0.8, 1.2), '#1a1430', 0.36));
      for (const i of [2, 4, 7]) one += line(`M9 18L${P([w[i]])}`, '#2a2040', 0.34);
      s += G(one + mir(one));
    }
    if (pt.flamewings > 0) {
      const k = sz(pt.flamewings);
      let one = circ(8, 16, 5.5 * k, `fill="#ff9a22" opacity=".28" filter="${c.blur(1.2)}"`);
      for (const [deg, len, R0] of [[168, 6, RAMPS.clay], [198, 8, RAMPS.clay], [228, 8.6, RAMPS.sun], [252, 6.4, RAMPS.sun]]) {
        const a = deg * Math.PI / 180 + flap * 0.07, L2 = len * k, dx = Math.cos(a), dy = Math.sin(a), rx = L2 * 0.55, ry = 1.7 * k;
        const d = `M${n(-rx)} 0C${n(-rx)} ${n(-ry * 1.3)} ${n(rx * 0.1)} ${n(-ry * 1.4)} ${n(rx * 0.55)} ${n(-ry * 0.5)}Q${n(rx * 0.8)} ${n(-ry * 0.3)} ${n(rx)} ${n(-ry * 0.1)}Q${n(rx * 0.7)} ${n(ry * 0.35)} ${n(rx * 0.35)} ${n(ry * 0.6)}C${n(-rx * 0.1)} ${n(ry * 1.3)} ${n(-rx)} ${n(ry * 1.2)} ${n(-rx)} 0Z`;
        one += at(16 - 6.5 + dx * L2 * 0.55, 19 + dy * L2 * 0.55, Math.atan2(dy, dx), path(d, fs(c.lg([[0, '#fffbd0'], [0.35, R0[0]], [0.75, R0[1]], [1, R0[2]]], 0, 0, 1, 0), '#8a3a10', 0.3)) + line(`M${n(-rx * 0.6)} ${n(-ry * 0.1)}Q0 ${n(-ry * 0.5)} ${n(rx * 0.5)} ${n(-ry * 0.3)}`, '#fff6c0', 0.3, 'opacity=".7"'));
      }
      s += G(one + mir(one));
    }
    if (pt.fairywings > 0) {
      const k = sz(pt.fairywings), wf = c.lg([[0, '#ffffff'], [0.5, '#e4f3ff'], [1, '#ddd0fb']], 0, 0, 1, 1);
      const wing = (cx, cy, rx, ry, rot) => at(cx, cy, rot, ell(0, 0, rx, ry, `fill="${wf}" stroke="#a894e0" stroke-width=".3"`) + line(`M0 ${n(ry * 0.85)}Q${n(rx * 0.25)} 0 0 ${n(-ry * 0.8)}M0 ${n(ry * 0.3)}Q${n(-rx * 0.5)} ${n(-ry * 0.1)} ${n(-rx * 0.55)} ${n(-ry * 0.5)}`, '#b8a4ec', 0.14, 'opacity=".8"') + ell(-rx * 0.2, -ry * 0.35, rx * 0.35, ry * 0.25, `fill="#ffffff" opacity=".7" filter="${c.blur(0.25)}"`));
      let one = wing(16 - (6.6 + 3.3 * k), 15.5 - 2.2 * k + flap * 0.6, 2.5 * k, 4.3 * k, 0.8) + wing(16 - (6.8 + 2.6 * k), 22.4, 1.9 * k, 2.8 * k, 0.3);
      one += circ(16 - (6.6 + 3.3 * k), 15.5 - 2.2 * k + flap * 0.6, 0.45, 'fill="#f7b6c8"') + circ(16 - (6.8 + 2.6 * k), 22.4, 0.38, 'fill="#f7b6c8"');
      s += G(one + mir(one)) + path(sparkleD(4, 9.5, 0.7), 'fill="#ffffff" ' + NOL) + path(sparkleD(28.5, 11.5, 0.55), 'fill="#fff6c8" ' + NOL);
    }
    if (pt.multitail > 0) {
      const k = sz(pt.multitail), km = Math.min(k, 1);
      let t = '';
      for (const [deg, len] of [[-82, 13], [-48, 12.4], [-14, 11]]) {
        const a = deg * Math.PI / 180, l2 = len * km, rx = l2 * 0.5, ry = 2.5 * k;
        const d = `M${n(-rx)} ${n(ry * 0.3)}C${n(-rx * 0.6)} ${n(-ry * 0.9)} ${n(rx * 0.4)} ${n(-ry * 1.25)} ${n(rx)} ${n(-ry * 0.1)}C${n(rx * 0.55)} ${n(ry * 1.05)} ${n(-rx * 0.5)} ${n(ry * 0.9)} ${n(-rx)} ${n(ry * 0.3)}Z`;
        t += at(19.5 + Math.cos(a) * l2 * 0.52, 25 + Math.sin(a) * l2 * 0.52, a, path(d, fs(c.lg([[0, '#f4e6c8'], [0.45, '#fffbf0'], [0.64, '#fffbf0'], [0.72, '#f6a83a'], [1, '#d8601c']], 0, 0, 1, 0), '#7a3a14', 0.34)) + line(`M${n(-rx * 0.6)} 0Q${n(rx * 0.1)} ${n(-ry * 0.5)} ${n(rx * 0.55)} ${n(-ry * 0.25)}`, '#ffffff', 0.3, 'opacity=".6"'));
      }
      s += G(t);
    }
    if (pt.spikes > 0) {
      const k = sz(pt.spikes), sf = c.rg([[0, R[1]], [0.62, R[1]], [1, R[2]]], 16, 22, 13, ' gradientUnits="userSpaceOnUse"');
      let t = '';
      for (const deg of [-160, -134, -108, -72, -46, -20]) {
        const a = deg * Math.PI / 180, rim = u => [16 + 7.6 * Math.cos(u), 22 + 7 * Math.sin(u)], b1 = rim(a - 0.28), b2 = rim(a + 0.28), tip = [16 + (8.3 + 4.4 * k) * Math.cos(a), 22 + (7.7 + 4.4 * k) * Math.sin(a)];
        t += path(`M${P([b1])}Q${P([[(b1[0] + tip[0]) / 2 + Math.cos(a - 1.3) * 0.5, (b1[1] + tip[1]) / 2 + Math.sin(a - 1.3) * 0.5]])} ${P([tip])}Q${P([[(b2[0] + tip[0]) / 2 + Math.cos(a + 1.3) * 0.5, (b2[1] + tip[1]) / 2 + Math.sin(a + 1.3) * 0.5]])} ${P([b2])}Z`, fs(sf, OL(R), 0.36));
      }
      s += G(t);
    }
    if (pt.fluff > 0) {
      const k = sz(pt.fluff);
      let t = '';
      for (const deg of [-170, -138, -106, -74, -42, -10, 20, 160]) { const a = deg * Math.PI / 180; t += ell(16 + (8.4 + 1.2 * k) * Math.cos(a), 22 + (7.8 + 1.2 * k) * Math.sin(a), 2.7 * k, 2.5 * k, fs(c.vol(CLOUD), '#7a88a4', 0.34)); }
      s += G(t);
    }
    if (pt.petals > 0) {
      const k = sz(pt.petals), PT = L.leaf === 'sun' ? ['#fff8b0', '#fbd84a', '#d0a02a'] : L.leaf === 'plum' ? ['#f4e8ff', '#c8aaf0', '#8c6cc4'] : ['#ffe4f0', '#f7a6c8', '#d0609a'];
      const pf = c.lg([[0, PT[1]], [0.6, PT[0]], [1, mix(PT[0], '#ffffff', 0.4)]], 0, 0, 1, 0);
      let t = '';
      for (const deg of [-168, -140, -112, -90, -68, -40, -12, 14, 166]) { const a = deg * Math.PI / 180, r = 8.6 + 1.3 * k; t += at(16 + Math.cos(a) * r, 21.4 + Math.sin(a) * r * 0.9, a, path(petalD(2.6 * k, 1.8 * k), fs(pf, OL(PT), 0.32))); }
      s += G(t);
    }
    if (pt.thorns > 0) {
      const k = sz(pt.thorns);
      let t = '';
      for (const deg of [-156, -126, -54, -24, 8, 172]) {
        const a = deg * Math.PI / 180, rim = u => [16 + 7.9 * Math.cos(u), 22 + 7.3 * Math.sin(u)], tip = [16 + (9 + 3.2 * k) * Math.cos(a), 22 + (9 + 3.2 * k) * 0.93 * Math.sin(a)];
        t += path(`M${P([rim(a - 0.2)])}Q${P([[(rim(a - 0.2)[0] + tip[0]) / 2, (rim(a - 0.2)[1] + tip[1]) / 2 - 0.3]])} ${P([tip])}L${P([rim(a + 0.2)])}Z`, fs(c.lg([[0, '#f0d8a8'], [1, '#b8804a']], 0, 0, 1, 1), '#6a4020', 0.3));
      }
      s += G(t);
    }
    return s;
  }
  function partsMid(c, pt, R, RR, LR, L, pz) { // behind the body, in front of the back layer
    let s = '';
    const side = fn => fn(R) + mir(fn(RR));
    if (pt.wings > 0) {
      const k = sz(pt.wings), rx = 2.7 * k, ry = 4.9 * k, wf = c.vol(CLOUD, 0.6, 0.25, 0.9), fl = pz.flap ? (pz.frame ? 0.35 : -0.25) : 0;
      const one = at(6.2, 19, -0.6 - fl, path(wingD(rx, ry), fs(wf, '#6e7c98', 0.34)) + line(`M${n(-rx * 0.95)} ${n(ry * 0.22)}Q${n(-rx * 0.2)} ${n(ry * 0.05)} ${n(rx * 0.35)} ${n(-ry * 0.2)}M${n(-rx * 0.7)} ${n(ry * 0.56)}Q${n(-rx * 0.1)} ${n(ry * 0.4)} ${n(rx * 0.4)} ${n(ry * 0.25)}`, '#aab8cc', 0.22, 'opacity=".9"') + ell(-rx * 0.2, -ry * 0.55, rx * 0.4, ry * 0.2, `fill="#ffffff" opacity=".8" filter="${c.blur(0.2)}"`, -0.3));
      s += G(one + mir(one));
    }
    if (pt.shell > 0) {
      const k = pt.shell >= 0.9 ? 1.08 : pt.shell >= 0.5 ? 1 : 0.94, M = RAMPS.moss, rx = 10.2 * k, ry = 8.4 * k;
      let lines = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.26; lines += `M${n(16 + Math.cos(a) * rx * 0.72)} ${n(22.6 + Math.sin(a) * ry * 0.72)}L${n(16 + Math.cos(a) * rx)} ${n(22.6 + Math.sin(a) * ry)}`; }
      s += G(ell(16, 22.6, rx, ry, fs(c.vol(M, 0.4, 0.25, 0.85), OL(M), 0.38)) + ell(16, 22.6, rx * 0.72, ry * 0.72, 'fill="none" stroke="#4b692f" stroke-width=".32"') + line(lines, '#4b692f', 0.3) +
        ell(16, 22.6, rx - 0.5, ry - 0.5, 'fill="none" stroke="#dce89a" stroke-width=".3" stroke-dasharray="1.2 2.6" opacity=".7"'));
    }
    if (pt.tail > 0) {
      const k = sz(pt.tail);
      let t = ell(24.6 + k, 26.4 - k, 3.6 * k, 2.1 * k, fs(c.vol(R), OL(R), 0.36), -0.7);
      const tx = 26.8 + 1.8 * k, ty = 24.4 - 1.4 * k, lf = c.lg([[0, LR[0]], [1, LR[1]]]);
      t += at(tx, ty, -1.2, path(leafD(1.5 * k, 0.8 * k), fs(lf, OL(LR), 0.28))) + at(tx, ty, -0.2, path(leafD(1.5 * k, 0.8 * k), fs(lf, OL(LR), 0.28))) + circ(tx - 0.3, ty + 0.3, 1.05 * k, fs(c.vol(LR), OL(LR), 0.3));
      s += G(t);
    }
    if (pt.ears > 0) {
      const k = sz(pt.ears);
      s += G(side(RX => at(10.4 - k, 13.6 - 1.2 * k, -0.42, path(`M0 ${n(-4.6 * k)}C1.3 ${n(-4.6 * k)} 2.05 ${n(-1.6 * k)} 1.9 ${n(0.6 * k)}C1.8 ${n(3.2 * k)} 0.9 ${n(4.6 * k)} 0 ${n(4.6 * k)}C-0.9 ${n(4.6 * k)} -1.8 ${n(3.2 * k)} -1.9 ${n(0.6 * k)}C-2.05 ${n(-1.6 * k)} -1.3 ${n(-4.6 * k)} 0 ${n(-4.6 * k)}Z`, fs(c.vol(RX, 0.35, 0.25, 0.9), OL(RX), 0.34)) +
        ell(0.1, -0.3 * k, 0.8, 3.2 * k, `fill="${c.lg([[0, mix(L.cheek || '#f4a3b8', '#ffffff', 0.35)], [1, L.cheek || '#f4a3b8']])}" opacity=".95"`))));
    }
    if (pt.leafears > 0) {
      const k = sz(pt.leafears), ex = 9.4 - k * 1.2, ey = 14 - 1.6 * k, el = 4.4 * k, lf = c.lg([[0, mix(LR[0], '#ffffff', 0.2)], [0.5, LR[0]], [1, LR[1]]], 0, 0, 1, 0);
      const one = at(ex, ey, -0.78 - Math.PI / 2, path(leafD(el, 2.1), fs(lf, OL(LR), 0.34)) + line(`M${n(-el * 0.8)} 0Q0 -0.3 ${n(el * 0.85)} 0`, LR[2], 0.22, 'opacity=".8"'));
      s += G(one + mir(one));
    }
    if (pt.fins > 0) {
      const k = sz(pt.fins), rx = 2 * k, ry = 3.4 * k, SKY = RAMPS.sky;
      let rays = ''; for (const t of [-0.8, -0.35, 0.1, 0.55]) rays += `M${n(rx * 0.5)} ${n(ry * 0.75)}L${n(Math.cos(Math.PI + t) * rx * 0.85)} ${n(Math.sin(Math.PI + t) * ry * 0.85)}`;
      const one = at(7 - k * 0.6, 19, -0.55, path(`M${n(rx * 0.6)} ${n(ry * 0.9)}C${n(rx * 1.2)} 0 ${n(rx * 0.6)} ${n(-ry)} 0 ${n(-ry)}C${n(-rx * 0.8)} ${n(-ry)} ${n(-rx * 1.25)} ${n(-ry * 0.4)} ${n(-rx * 1.05)} ${n(ry * 0.1)}Q${n(-rx * 0.7)} ${n(ry * 0.25)} ${n(-rx * 0.85)} ${n(ry * 0.55)}Q${n(-rx * 0.2)} ${n(ry * 0.6)} ${n(-rx * 0.2)} ${n(ry * 0.95)}Q${n(rx * 0.2)} ${n(ry * 0.95)} ${n(rx * 0.6)} ${n(ry * 0.9)}Z`, fs(c.vol(SKY, 0.35, 0.3, 0.9), OL(SKY), 0.34)) + line(rays, '#3f55b8', 0.2, 'opacity=".6"'));
      s += G(one + mir(one));
    }
    if (pt.horns > 0) {
      const k = sz(pt.horns), tip = [10 - k, 10.5 - 2 * k];
      const one = path(`M10.5 16.5Q${n(9 - k * 0.3)} ${n(13.4 - k * 0.4)} ${P([tip])}Q${n(12.3)} ${n(12.3 - k * 0.4)} 13.8 15.2Z`, fs(c.lg([[0, HORN[0]], [0.5, HORN[1]], [1, HORN[2]]], 0, 0, 1, 0), '#6a4a2a', 0.34)) +
        line(`M${n(10.1 - 0.2 * k)} ${n(14.6 - 0.6 * k)}Q11.4 ${n(14.2 - 0.6 * k)} ${n(12.5)} ${n(14.4 - 0.6 * k)}M${n(9.7 - 0.5 * k)} ${n(12.8 - 1.1 * k)}Q10.6 ${n(12.3 - 1.1 * k)} ${n(11.5)} ${n(12.6 - 1.1 * k)}`, '#b8865a', 0.24);
      s += G(one + mir(one));
    }
    if (pt.antennae > 0) {
      const k = sz(pt.antennae), bx = 11 - 3.2 * k, by = 15 - 6 * k;
      const one = line(`M11.2 15.4Q${n(bx + 0.4)} ${n(13.4 - k)} ${n(bx + 0.3)} ${n(by + 0.8)}`, '#3a3050', 0.5) + circ(bx, by, 2.1, `fill="#fff27a" opacity=".45" filter="${c.blur(0.5)}"`) + circ(bx, by, 1.35, fs(c.vol(RAMPS.sun), '#7a5010', 0.32)) + circ(bx - 0.45, by - 0.45, 0.35, 'fill="#ffffff"');
      s += G(one + mir(one));
    }
    return s;
  }
  // which way the arms point, and where the hands are (pixel.js buildSprig: claws hold on to them)
  function armPose(pz) {
    let arms = pz.arms || 'down';
    if (arms === 'paddle') arms = pz.frame ? 'up' : 'out';
    const sw = pz.walk ? (pz.frame ? 0.5 : -0.5) : 0;
    const hands = arms === 'up' ? [6, 15, -0.35, -1] : arms === 'out' ? [4, 20.4, -1, -0.45] : arms === 'hold' ? [9.6, 23, -0.2, -1] : [6.4, 24.2 + sw, -0.6, -0.8];
    return { arms, sw, hands, handR: arms === 'down' ? [32 - 6.4, 24.2 - sw] : [32 - hands[0], hands[1]] };
  }
  // the resting / raised / outstretched arms: part of the body sticker (no line between arm and body, like the target)
  function armShapes(c, ap, R, RR, shared) {
    const f = RX => `fill="${RX === R && shared ? shared : c.vol(RX, 0.35, 0.25, 0.9)}"`;
    if (ap.arms === 'up') return ell(7.2, 17.6, 1.9, 3.0, f(R), 0.45) + ell(24.8, 17.6, 1.9, 3.0, f(RR), -0.45);
    if (ap.arms === 'out') return ell(6.1, 21.3, 2.95, 1.85, f(R)) + ell(25.9, 21.3, 2.95, 1.85, f(RR));
    if (ap.arms === 'hold') return '';
    return ell(7.4, 23.35 + ap.sw, 2.3, 2.85, f(R)) + ell(24.6, 23.35 - ap.sw, 2.3, 2.85, f(RR));
  }
  // holding something: little paws in front of the tummy, outlined on their own
  function holdArms(c, ap, R, RR) {
    if (ap.arms !== 'hold') return '';
    return G(ell(10, 23.5, 2, 1.7, `fill="${c.vol(R, 0.35, 0.25, 0.9)}"`) + ell(22, 23.5, 2, 1.7, `fill="${c.vol(RR, 0.35, 0.25, 0.9)}"`));
  }
  function feet(c, L, R, RR, skin, pt, pz) {
    if (pt.tentacles > 0) {
      const k = sz(pt.tentacles), wig = pz.frame ? 0.7 : 0, one = (RX, s) => {
        const o = 16 + s * 5.5, m = 16 + s * 2.2, w2 = wig * s, tf = c.lg([[0, RX[0]], [0.5, RX[1]], [1, RX[2]]]);
        let t = path(tubeD([[o, 25], [o + s * 2.4 * k + w2, 28.4], [o + s * 4.8 * k, 29.3], [o + s * 6.6 * k, 27.8], [o + s * 6 * k - w2 * 0.5, 25.8]], 2, 0.6), fs(tf, OL(RX), 0.3));
        t += path(tubeD([[m, 27], [m + s * 0.8 - w2 * 0.6, 29.4], [m + s * 2.6 * k, 29.6], [m + s * 3.4 * k, 28.4]], 1.9, 0.6), fs(tf, OL(RX), 0.3));
        for (const [x, y] of [[o + s * 3.4 * k, 29.1], [o + s * 5.6 * k, 28.6], [m + s * 1.6 * k, 29.8]]) t += circ(x, y, 0.3, `fill="${L.belly || BELLY}"`);
        return t;
      };
      return G(one(R, -1) + one(RR, 1));
    }
    if (skin === 'ghost') { const wv = pz.frame ? 0.5 : 0; return G([[10.4, wv], [16, -wv], [21.6, wv]].map(([x, d]) => ell(x, 28.4 + d, 2.4, 1.9, `fill="${c.vol(SK.ghost.part)}"`)).join('')); }
    const fl = pz.walk && pz.frame ? -1 : 0, fr = pz.walk && !pz.frame ? -1 : 0;
    const one = (RX, x, dy) => {
      const pc = L.patternColor || BELLY, col = L.pattern === 'socks' ? [mix(pc, '#ffffff', 0.3), pc, mix(pc, INK, 0.3)] : RX;
      return ell(x, 29.15 + dy, 3.0, 1.85, `fill="${c.lg([[0, col[0]], [0.3, col[1]], [1, mix(col[2], INK, 0.15)]])}"`) + ell(x - 0.75, 28.5 + dy, 1.15, 0.42, `fill="#ffffff" opacity=".3" filter="${c.blur(0.2)}"`, -0.2);
    };
    return G(one(R, 12.2, fl) + one(RR, 19.8, fr));
  }
  function partsFront(c, pt, R, RR, LR, L, ap) {
    let s = '';
    if (pt.fluff > 0) { const k = sz(pt.fluff), one = ell(16 - 7.4, 27.2, 2.3 * k, 1.9 * k, fs(c.vol(CLOUD), '#7a88a4', 0.32)) + ell(16 - 6.6, 15.8, 1.8 * k, 1.5 * k, fs(c.vol(CLOUD), '#7a88a4', 0.32)); s += G(one + mir(one)); }
    if (pt.vines > 0) {
      const k = sz(pt.vines), one = () => {
        const pts = []; for (let i = 0; i <= 13; i++) { const u = i / 13; pts.push([16 - (7.6 + Math.sin(u * 8) * 1.2), 15.5 + u * 12 * Math.min(1, k + 0.1)]); }
        let t = line(smooth(pts, false), '#1e5a28', 0.75) + line(smooth(pts, false), '#4aa044', 0.4) + line(`M8.4 17.6Q${n(7 - k)} 16.4 ${n(6.6 - k)} 14.4Q${n(6.8 - k)} 13.4 ${n(7.8 - k)} 13.6`, '#1e5a28', 0.7) + line(`M8.4 17.6Q${n(7 - k)} 16.4 ${n(6.6 - k)} 14.4Q${n(6.8 - k)} 13.4 ${n(7.8 - k)} 13.6`, '#4aa044', 0.36);
        for (const i of [3, 7, 11]) t += at(pts[i][0] - 0.8, pts[i][1] - 0.4, -2.5, path(leafD(0.9, 0.5), fs('#8ee06a', '#1e5a28', 0.2)));
        return t;
      };
      s += G(one() + mir(one()));
    }
    if (pt.claws > 0) {
      const k = sz(pt.claws), r = 2.7 * k, CR = ['#ff9a7a', '#e8543a', '#a02c2a'];
      const claw = (cx, cy, dx, dy) => {
        const a = Math.atan2(dy, dx);
        return path(`M${n(cx + Math.cos(a + 0.42) * r)} ${n(cy + Math.sin(a + 0.42) * r)}A${n(r)} ${n(r * 0.92)} 0 1 1 ${n(cx + Math.cos(a - 0.42) * r)} ${n(cy + Math.sin(a - 0.42) * r)}L${n(cx + Math.cos(a) * 0.3)} ${n(cy + Math.sin(a) * 0.3)}Z`, fs(c.vol(CR), '#5a1414', 0.34)) + circ(cx - 0.9 * Math.sign(-dx || -1), cy - 0.2, 0.45, 'fill="#ffd8c8" opacity=".85"');
      };
      const h = ap.hands;
      s += G(claw(h[0], h[1], h[2], h[3]) + claw(ap.handR[0], ap.handR[1], -h[2], h[3]));
    }
    if (pt.mushcap > 0 && (!L.hat || L.hat === 'none')) {
      const k = sz(pt.mushcap), rx = 5.6 * k + 0.8, ry = 4.6 * k, CAP = ['#ff9aa0', '#e8404a', '#a02c3a'];
      let t = path(`M${n(16 - rx)} 15.9C${n(16 - rx)} ${n(15.9 - ry * 1.36)} ${n(16 + rx)} ${n(15.9 - ry * 1.36)} ${n(16 + rx)} 15.9Q16 17.1 ${n(16 - rx)} 15.9Z`, fs(c.vol(CAP, 0.38, 0.2, 0.85), '#5a0e1a', 0.36));
      for (const [x, y, rr] of [[12.6, 13.2, 0.85], [16.4, 11.5, 1.05], [19.8, 13.6, 0.75], [10.3, 14.9, 0.5], [14.6, 14.6, 0.45], [21.9, 15.2, 0.45]]) t += circ(x, y, rr * k * 0.9, 'fill="#fffaf4" stroke="#e8c8c8" stroke-width=".12"');
      s += G(t);
    }
    return s;
  }
  function unihorn(c, pt) {
    if (!(pt.unihorn > 0)) return '';
    const k = sz(pt.unihorn), tip = [16.4, 17.8 - 10.5 * k], d = `M14 17.9Q${n(14.8)} ${n(12.6 - 2 * k)} ${P([tip])}Q${n(17.4)} ${n(12.6 - 2 * k)} 18 17.9Q16 18.5 14 17.9Z`;
    const cl = c.clip(path(d));
    let bands = ''; for (let i = 0; i < 7; i++) { const y = 17.8 - i * 1.5 * k; bands += line(`M13 ${n(y + 0.9)}L20 ${n(y - 0.6)}`, i % 2 ? '#e2b8f0' : '#f7c8e0', 0.55); }
    return circ(tip[0], tip[1] + 2.5, 2.8, `fill="#ffe8f6" opacity=".4" filter="${c.blur(0.8)}"`) + G(path(d, `fill="${c.lg([[0, '#ffffff'], [0.6, '#fff8fc'], [1, '#f0dcf0']], 0, 0, 1, 0)}"`) + `<g clip-path="${cl}">${bands}${line('M15 17Q15.4 12 16.2 8', '#ffffff', 0.5, 'opacity=".8"')}</g>` + path(d, `fill="none" stroke="#8a6aa8" stroke-width=".3" stroke-linejoin="round" ${NOL}`)) + path(sparkleD(tip[0] + 1.6, tip[1] + 0.8, 0.6), 'fill="#fff6c8" ' + NOL);
  }

  // ---------- face (the target's: big glossy dark eyes, a big white shine, pink blush, a little "w" smile) ----------
  // lw: line weight for mouths, brows and line eyes (thicker when drawn small, so a 2-fine-px scene still reads the face)
  function face(c, L, pz, dark, skin, lw) {
    let s = ''; lw = lw || 1;
    const kind = pz.eyes || L.eyes || 'round', ec = L.eyeColor || '#5b6ee1';
    // dark bodies (night, plum, charcoal, galaxy...): glossy eyes get crisp white rims like the target's dark bunny; line eyes and
    // the mouth sit on soft pale patches so they still read
    const rimmed = { round: 1, big: 1, sparkle: 1, brave: 1, sad: 1, sleepy: 1 }[kind] || (kind === 'wink');
    if (dark) {
      const pale = `fill="#e8ecff" opacity=".85" filter="${c.blur(0.25)}"`;
      if (!rimmed) s += ell(12.85, 20.7, 1.95, 1.9, pale) + ell(19.15, 20.7, 1.95, 1.9, pale);
      else if (kind === 'wink') s += ell(19.15, 20.7, 1.95, 1.9, pale);
      s += ell(16, 23.05, 1.75, 1.0, pale);
    }
    const glossy = (x, y, rx, ry, o) => {
      o = o || {};
      const cl = c.clip(ell(x, y, rx, ry));
      let e = dark ? ell(x, y, rx + 0.36, ry + 0.36, 'fill="#f6f4ff"') : '';
      e += ell(x, y, rx, ry, `fill="${c.lg([[0, '#0c0a16'], [0.62, '#16132a'], [1, mix(ec, '#14122a', 0.62)]])}"`);
      e += `<g clip-path="${cl}">${ell(x, y + ry * 0.86, rx * 0.86, ry * 0.42, `fill="${ec}" opacity=".6" filter="${c.blur(0.25)}"`)}</g>`;
      if (o.spark) e += path(sparkleD(x - rx * 0.26, y - ry * 0.32, rx * 0.72), 'fill="#ffffff"');
      else e += ell(x - rx * 0.3, y - ry * 0.34, rx * 0.53, rx * 0.56, 'fill="#ffffff"', -0.3);
      e += circ(x + rx * 0.4, y + ry * 0.44, rx * 0.21, 'fill="#ffffff" opacity=".95"');
      if (o.big) e += circ(x - rx * 0.02, y - ry * 0.02, rx * 0.12, 'fill="#ffffff" opacity=".8"');
      return e;
    };
    const ln = (d, w) => line(d, INK, (w || 0.46) * lw);
    const arcUp = x => ln(`M${n(x - 1.2)} 21.25Q${n(x)} 19.45 ${n(x + 1.2)} 21.25`);
    const arcDown = x => ln(`M${n(x - 1.2)} 20.45Q${n(x)} 22.15 ${n(x + 1.2)} 20.45`);
    for (const [x, sd] of [[12.85, -1], [19.15, 1]]) {
      switch (kind) {
        case 'happy': s += arcUp(x); break;
        case 'closed': s += arcDown(x); break;
        case 'blink': s += ln(`M${n(x - 1.2)} 20.95Q${n(x)} 21.5 ${n(x + 1.2)} 20.95`); break;
        case 'sleepy': { const cl = c.clip(`<path d="M${n(x - 2)} 20.5L${n(x + 2)} 20.5L${n(x + 2)} 23L${n(x - 2)} 23Z"/>`); s += `<g clip-path="${cl}">${glossy(x, 20.8, 1.2, 1.4)}</g>` + ln(`M${n(x - 1.35)} 20.55Q${n(x)} 20.25 ${n(x + 1.35)} 20.55`, 0.4); break; }
        case 'dot': s += ell(x + (sd < 0 ? 0.3 : -0.3), 20.7, 0.66, 0.95, `fill="${INK}"`) + circ(x + (sd < 0 ? 0.08 : -0.52), 20.3, 0.24, 'fill="#ffffff"'); break;
        case 'sparkle': s += glossy(x, 20.5, 1.38, 1.8, { spark: true }) + path(sparkleD(x + 0.95, 19.05, 0.45), 'fill="#fff6b0"'); break;
        case 'big': s += glossy(x + sd * 0.12, 20.4, 1.56, 2.06, { big: true }); break;
        case 'star': s += path(rpoly(starPts(x, 20.5, 1.75, 0.82, 5), 0.18), fs(c.rg([[0, '#fffbe0'], [0.5, '#fbf236'], [1, '#f0b82a']], 0.4, 0.35, 0.7), INK, 0.34)) + circ(x - 0.45, 20.05, 0.22, 'fill="#ffffff"'); break;
        case 'wink': s += sd < 0 ? glossy(x, 20.6, 1.3, 1.74) : arcUp(x); break;
        default:
          s += glossy(x, 20.6, 1.3, 1.74);
          if (kind === 'brave') s += ln(sd < 0 ? `M${n(x - 1.45)} 18.15L${n(x + 0.9)} 18.85` : `M${n(x + 1.45)} 18.15L${n(x - 0.9)} 18.85`, 0.38);
          if (kind === 'sad') s += ln(sd < 0 ? `M${n(x - 1.35)} 18.85L${n(x + 0.9)} 18.15` : `M${n(x + 1.35)} 18.85L${n(x - 0.9)} 18.15`, 0.38);
      }
    }
    const ck = L.cheek || '#f4a3b8';
    s += ell(10.35, 22.85, 1.62, 0.86, `fill="${vivid(ck, 1.35)}" opacity=".95" filter="${c.blur(0.3)}"`) + ell(21.65, 22.85, 1.62, 0.86, `fill="${vivid(ck, 1.35)}" opacity=".95" filter="${c.blur(0.3)}"`);
    const m = pz.mouth || 'smile';
    if (m === 'open') s += path('M14.65 22.45Q16 23.05 17.35 22.45Q17.2 24.55 16 24.55Q14.8 24.55 14.65 22.45Z', fs('#8a2433', INK, 0.32 * lw)) + ell(16, 23.95, 0.78, 0.4, 'fill="#e8687a"');
    else if (m === 'o') s += ell(16, 23.05, 0.75, 0.88, fs('#3a1a2a', INK, 0.3 * lw)) + ell(16, 23.3, 0.36, 0.38, 'fill="#c0506a"');
    else if (m === 'flat') s += ln('M15.15 23.1L16.85 23.1', 0.38);
    else if (m === 'grin') s += path('M14.25 22.4Q16 23.05 17.75 22.4Q17.45 24.45 16 24.45Q14.55 24.45 14.25 22.4Z', fs('#8a2433', INK, 0.32 * lw)) + path('M14.55 22.62Q16 23.12 17.45 22.62L17.35 23.12Q16 23.55 14.65 23.12Z', 'fill="#ffffff"') + ell(16, 24, 0.7, 0.32, 'fill="#e8687a"');
    else s += ln('M14.72 22.62Q15.36 23.52 16 22.82Q16.64 23.52 17.28 22.62', 0.4);
    if (skin === 'vampire' && m !== 'o' && m !== 'flat') s += path('M14.85 22.85L15.25 23.95L15.65 23.05Z', 'fill="#ffffff"') + path('M17.15 22.85L16.75 23.95L16.35 23.05Z', 'fill="#ffffff"');
    return s;
  }

  // ---------- hats & charms (code art: used until the family's picture has loaded, and to find where each one sits) ----------
  const HIDES = { beanie: 1, tophat: 1, wizard: 1, sunhat: 1, cap: 1, witch: 1, propeller: 1 };
  function hat(c, id, crowned, bloom) {
    switch (id) {
      case 'crown': {
        const pts = crowned ? [[11, 14.6], [11, 9], [13.6, 12.1], [16, 12.9], [18.4, 12.1], [21, 9], [21, 14.6]] : [[11, 14.6], [11, 9], [13.5, 11.6], [16, 8], [18.5, 11.6], [21, 9], [21, 14.6]];
        let s = path(rpoly(pts, [0.5, 0.25, 0.4, 0.25, 0.4, 0.25, 0.5]), fs(c.lg([[0, '#fff27a'], [0.45, '#f6c83a'], [1, '#c7861c']], 0, 0, 1, 1), '#6a4406', 0.36));
        s += path('M11.2 13Q16 12.4 20.8 13L20.8 14.4Q16 13.8 11.2 14.4Z', 'fill="#c7861c" opacity=".85"') + ell(16, 13.3, 0.75, 0.6, fs('#e8445a', '#7a1020', 0.2)) + circ(15.8, 13.1, 0.2, 'fill="#ffffff"');
        for (const p of crowned ? [[11, 9], [21, 9]] : [[11, 9], [16, 8], [21, 9]]) s += circ(p[0], p[1], 0.6, fs('#fffbd0', '#6a4406', 0.2));
        return s + line('M11.9 10.5L11.9 12.4', '#ffffff', 0.35, 'opacity=".7"');
      }
      case 'beanie': return path('M8.4 15.2C8.4 10.2 23.6 10.2 23.6 15.2Z', fs(c.vol(RAMPS.berry, 0.35, 0.2, 0.9), '#4a0e1c', 0.38)) + line('M11 12.6L11 15M13.5 11.6L13.5 15M16 11.3L16 15M18.5 11.6L18.5 15M21 12.6L21 15', '#8a2433', 0.18, 'opacity=".6"') +
        path(rpoly([[8.8, 14.8], [23.2, 14.8], [23.2, 17.1], [8.8, 17.1]], 0.9), fs(c.lg([[0, '#fffdf2'], [1, '#e8dcc0']]), '#6a5638', 0.34)) + line('M10.5 15.1L10.5 16.8M12.5 15.1L12.5 16.8M14.5 15.1L14.5 16.8M16.5 15.1L16.5 16.8M18.5 15.1L18.5 16.8M20.5 15.1L20.5 16.8', '#cbbd9c', 0.25) +
        circ(16, 10, 1.85, fs(c.vol(CLOUD), '#7a88a4', 0.32));
      case 'tophat': return path('M9.6 15.2Q16 13.4 22.4 15.2Q22.6 16.4 16 16.3Q9.4 16.4 9.6 15.2Z', fs('#3f3f74', '#15142e', 0.36)) + path(rpoly([[12, 14.8], [11.7, 7], [20.3, 7], [20, 14.8]], 0.5), fs(c.lg([[0, '#6a6ac8'], [0.35, '#4a4aa0'], [1, '#2c2c66']], 0, 0, 1, 0), '#15142e', 0.36)) +
        path('M11.9 12Q16 12.5 20.1 12L20 13.4Q16 13.9 12 13.4Z', 'fill="#d95763"') + ell(16, 7.1, 4.3, 0.55, 'fill="#5a5ab4" stroke="#15142e" stroke-width=".3"') + line('M13.2 8.2L13.2 11.2', '#9aa2f4', 0.4, 'opacity=".7"');
      case 'flower': return bloom ? '' : (() => { let s = ''; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += at(22 + Math.cos(a) * 0.9, 14.2 + Math.sin(a) * 0.9, a, path(roundPetalD(0.85, 0.7), fs('#f7b6c8', '#b05080', 0.2))); } return s + circ(22, 14.2, 0.45, 'fill="#fbf236"'); })();
      case 'bow': return path('M16 14.2C14.5 12.6 11.2 10.9 10.9 12.4C10.6 13.8 10.7 15.2 11 16.2C11.6 17.4 14.6 15.5 16 14.2Z', fs(c.vol(RAMPS.plum), '#3a1c60', 0.34)) + path('M16 14.2C17.5 12.6 20.8 10.9 21.1 12.4C21.4 13.8 21.3 15.2 21 16.2C20.4 17.4 17.4 15.5 16 14.2Z', fs(c.vol(RAMPS.plum), '#3a1c60', 0.34)) +
        line('M12 13Q13.4 13.4 14.6 14M20 13Q18.6 13.4 17.4 14', '#5e3a8e', 0.2, 'opacity=".7"') + ell(16, 14.2, 1.05, 0.95, fs(c.vol(RAMPS.plum, 0.4, 0.3), '#3a1c60', 0.3));
      case 'leafcap': return path('M8 15.8C8 11.6 24 11.6 24 15.8Q16 16.8 8 15.8Z', fs(c.vol(RAMPS.leaf, 0.4, 0.2, 0.9), OL(RAMPS.leaf), 0.36)) + line('M16 12.4L16 15.9M16 13.6L12.5 14.8M16 13.6L19.5 14.8', '#37946e', 0.2, 'opacity=".8"') + line('M16 12.6Q16.2 11.4 17 10.9', '#37946e', 0.45);
      case 'party': {
        const [bl, br, tp, pp] = crowned ? [[7.8, 17], [15, 14.4], [7.2, 5.4], [7.8, 5.9]] : [[11.6, 15.2], [20.4, 15.2], [16, 5.2], [16, 5.7]];
        const d = `M${P([bl])}Q${n((bl[0] + br[0]) / 2)} ${n((bl[1] + br[1]) / 2 + 0.9)} ${P([br])}L${P([tp])}Z`, cl = c.clip(path(d));
        let stripes = ''; const ax = tp[0] - (bl[0] + br[0]) / 2, ay = tp[1] - (bl[1] + br[1]) / 2;
        for (let i = 1; i < 5; i++) { const t = i / 5, mx = (bl[0] + br[0]) / 2 + ax * t, my = (bl[1] + br[1]) / 2 + ay * t, px = -ay * 0.25, py = ax * 0.25; stripes += line(`M${n(mx - px - ay * 0.1)} ${n(my - py)}L${n(mx + px)} ${n(my + py + 0.9)}`, '#fbe036', 0.85); }
        let dots = ''; for (const t of [0.22, 0.5, 0.74]) dots += circ((bl[0] + br[0]) / 2 + ax * t + (t - 0.5) * 1.6, (bl[1] + br[1]) / 2 + ay * t, 0.28, 'fill="#ffffff" opacity=".85"');
        return path(d, `fill="${c.lg([[0, '#ffb8dc'], [0.5, '#f26aa8'], [1, '#b83a78']], 0, 0, 1, 0)}"`) + `<g clip-path="${cl}">${stripes}${dots}${path(d, `fill="${c.lg([[0, '#ffffff', 0.35], [0.4, '#ffffff', 0], [1, INK, 0.25]], 0, 0, 1, 0)}"`)}</g>` + path(d, `fill="none" stroke="#6a1a44" stroke-width=".36" stroke-linejoin="round" ${NOL}`) +
          circ(pp[0], pp[1], 1.8, fs(c.vol(['#d8fcff', '#5fdcf0', '#2a98b8']), '#1a5a70', 0.32)) + circ(pp[0] - 0.6, pp[1] - 0.6, 0.4, 'fill="#ffffff"');
      }
      case 'witch': {
        const WT = ['#a47ae0', '#6c3eb0', '#43206e'];
        return path(smooth([[11.2, 14.7], [13.4, 9.8], [15.2, 7], [17.4, 4.6], [20.4, 3.4], [21.8, 3.2], [19.4, 5.4], [18.6, 7.8], [19.2, 10.6], [20.8, 14.7]], false) + 'Z', fs(c.lg([[0, WT[0]], [0.5, WT[1]], [1, WT[2]]], 0, 0, 1, 0), '#1e0c38', 0.36)) +
          path('M12.1 12.2Q16 11.6 19.9 12.2L20.3 13.8Q16 13.2 11.7 13.8Z', fs('#ff9a22', '#8a3a0a', 0.2)) + path(rpoly([[15.1, 11.9], [16.9, 11.9], [16.9, 13.6], [15.1, 13.6]], 0.2), 'fill="none" stroke="#fbf236" stroke-width=".38"') +
          ell(16, 15.3, 8.5, 1.8, fs(c.lg([[0, WT[0]], [1, WT[2]]]), '#1e0c38', 0.36)) + line('M14 10.6Q14.6 8.6 15.8 7.2', '#c8a8f4', 0.4, 'opacity=".6"');
      }
      case 'wizard': {
        const WZ = ['#8aa8ff', '#4a5ed8', '#2c3490'];
        return path(smooth([[11.2, 14.7], [13.4, 10.4], [16.8, 7], [20.4, 5.6], [22.6, 5], [20.6, 7], [19.4, 9.4], [20.8, 14.7]], false) + 'Z', fs(c.lg([[0, WZ[0]], [0.5, WZ[1]], [1, WZ[2]]], 0, 0, 1, 0), '#101650', 0.36)) +
          ell(16, 15.3, 7.2, 1.6, fs(c.lg([[0, WZ[0]], [1, WZ[2]]]), '#101650', 0.36)) + path(rpoly(starPts(15.3, 12.2, 1.1, 0.48, 5), 0.1), 'fill="#fbf236"') + path(sparkleD(18.9, 9.4, 0.6), 'fill="#fbf236"') + path(sparkleD(18.4, 13.2, 0.5), 'fill="#fff6c8"') + path(sparkleD(20.3, 6.3, 0.5), 'fill="#fbf236"') + path('M13.4 10.8A0.9 0.9 0 1 0 14.6 12A0.7 0.7 0 1 1 13.4 10.8Z', 'fill="#fff6c8"');
      }
      case 'sunhat': {
        const ST = ['#fff6c8', '#f0d284', '#c8a050'];
        let weave = ''; for (let i = 0; i < 9; i++) weave += `M${n(12 + i)} 10.4L${n(11.5 + i)} 14.8`;
        return ell(16, 15.3, 7.3, 2, fs(c.rg([[0, ST[0]], [0.7, ST[1]], [1, ST[2]]], 0.45, 0.3, 0.7), '#7a5a20', 0.36)) + path('M11.6 14.6C11.6 9.4 20.4 9.4 20.4 14.6Q16 15.4 11.6 14.6Z', fs(c.vol(ST, 0.35, 0.2), '#7a5a20', 0.36)) + line(weave, '#d8b060', 0.16, 'opacity=".6"') +
          path('M11.8 12.9Q16 12.4 20.2 12.9L20.3 14.1Q16 13.6 11.7 14.1Z', 'fill="#e8445a"') + path('M19.4 13.4L21.4 12.2L21.2 14.6Z', fs('#f07a8a', '#8a1a30', 0.2)) + circ(19.5, 13.4, 0.5, fs('#b8304a', '#6a1020', 0.18));
      }
      case 'cap': {
        const CP = ['#9fd8ff', '#639bff', '#3f55b8'];
        return path('M16 14.4Q20 14.2 23.4 15.2Q23.6 16.6 22.4 16.8L16 16.6Z', fs(c.lg([[0, CP[1]], [1, CP[2]]]), '#1c2a6a', 0.34)) + path('M8.6 16.3C8.6 10.3 20.6 10.3 20.6 16.3Q14.6 17.1 8.6 16.3Z', fs(c.vol(CP, 0.35, 0.2, 0.9), '#1c2a6a', 0.36)) +
          line('M14.6 11.3L14.6 16.4', CP[2], 0.22, 'opacity=".7"') + circ(14.6, 11.2, 0.45, `fill="${CP[2]}"`) + path(rpoly([[10.6, 12.9], [13, 12.9], [13, 14.9], [10.6, 14.9]], 0.4), fs('#ffffff', '#9fb0d8', 0.18)) + line('M11.2 13.5L12.4 14.3M12.4 13.5L11.2 14.3', '#e8445a', 0.24);
      }
      case 'flowercrown': {
        let s = path('M8.6 17.4Q16 11.6 23.4 17.4', 'fill="none" stroke="#2f6e3a" stroke-width="1.5" stroke-linecap="round"') + path('M8.6 17.4Q16 11.6 23.4 17.4', 'fill="none" stroke="#6abe30" stroke-width=".9" stroke-linecap="round"');
        for (const [x, y, r] of [[9.8, 16.2, -2.4], [11.8, 14.9, -2.8], [14.2, 14.2, -3], [17.8, 14.2, -0.1], [20.2, 14.9, -0.35], [22.2, 16.2, -0.7]]) s += at(x, y, r, path(leafD(1.05, 0.55), fs('#99e550', '#2f6e3a', 0.2)));
        for (const [x, y, p, cc] of [[10.3, 15.5, '#f7a6c8', '#fbf236'], [13.2, 13.9, '#ffffff', '#fbf236'], [18.8, 13.9, '#c9a2f0', '#fbf236'], [21.7, 15.5, '#fff27a', '#f6a83a'], [16, 13.4, '#ffb0bc', '#fbf236']]) {
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; s += ell(x + Math.cos(a) * 0.62, y + Math.sin(a) * 0.62, 0.55, 0.48, `fill="${p}" stroke="${mix(p, INK, 0.4)}" stroke-width=".12"`, a); }
          s += circ(x, y, 0.32, `fill="${cc}"`);
        }
        return s;
      }
      case 'bandana': {
        let s = path('M8.9 16.4Q16 13.7 23.1 16.4L23.1 17.9Q16 15.5 8.9 17.9Z', fs(c.lg([[0, '#ff8a8a'], [0.5, '#e0303c'], [1, '#961c30']]), '#5a0a18', 0.34));
        s += path('M23 15.8Q25.3 13.6 26.6 13.9Q25.6 15.2 24 16.6Z', fs('#e0303c', '#5a0a18', 0.28)) + path('M23 17.4Q25 18.7 26.3 19.6Q24.7 19.8 23.2 18.3Z', fs('#961c30', '#5a0a18', 0.28)) + circ(23.3, 16.8, 0.85, fs('#e0303c', '#5a0a18', 0.28));
        for (const [x, y] of [[11, 16.4], [14, 15.4], [17.2, 15.3], [20.2, 15.8], [12.6, 16.6], [18.8, 16.4]]) s += circ(x, y, 0.24, 'fill="#ffffff"');
        return s;
      }
      case 'headphones': {
        const CUP = ['#ffb0c8', '#f0588c', '#a82a5c'];
        return line('M9.4 16.6Q9.6 12.6 16 12.8Q22.4 12.6 22.6 16.6', '#4a4e62', 1.3) + line('M9.4 16.6Q9.6 12.6 16 12.8Q22.4 12.6 22.6 16.6', '#dfe3ee', 0.75) + line('M11 14Q13 13.3 15 13.2', '#ffffff', 0.3) +
          ell(8.4, 17.8, 1.85, 2.55, fs(c.vol(CUP), '#5a1030', 0.34)) + ell(23.6, 17.8, 1.85, 2.55, fs(c.vol(CUP), '#5a1030', 0.34)) + ell(7.9, 17, 0.45, 0.8, 'fill="#ffe0ec" opacity=".85"') + ell(23.1, 17, 0.45, 0.8, 'fill="#ffe0ec" opacity=".85"');
      }
      case 'propeller': {
        const d = 'M8.2 15.4C8.2 10.4 23.8 10.4 23.8 15.4Z', cl = c.clip(path(d));
        const wedge = (a0, a1, col) => path(`M16 15.6L${n(16 + Math.cos(a0) * 12)} ${n(15.6 + Math.sin(a0) * 12)}L${n(16 + Math.cos(a1) * 12)} ${n(15.6 + Math.sin(a1) * 12)}Z`, `fill="${col}"`);
        return path(d, 'fill="#fcd82c"') + `<g clip-path="${cl}">${wedge(Math.PI, Math.PI * 1.25, '#e0303c')}${wedge(Math.PI * 1.25, Math.PI * 1.5, '#fcd82c')}${wedge(Math.PI * 1.5, Math.PI * 1.75, '#4a78f0')}${wedge(Math.PI * 1.75, Math.PI * 2, '#5cc83a')}${path(d, `fill="${c.rg([[0, '#ffffff', 0.5], [0.35, '#ffffff', 0], [0.8, INK, 0], [1, INK, 0.3]], 0.35, 0.2, 0.9)}"`)}</g>` + path(d, `fill="none" stroke="#1e1e40" stroke-width=".36" stroke-linejoin="round" ${NOL}`) +
          path(rpoly([[8.6, 14.8], [23.4, 14.8], [23.4, 16.8], [8.6, 16.8]], 0.8), fs(c.lg([[0, '#639bff'], [1, '#3f55b8']]), '#1c2a6a', 0.32)) + line('M16 11.3L16 8.6', '#6a708a', 0.5) +
          ell(13.2, 7.9, 2.7, 0.95, fs(c.lg([[0, '#ff8a8a'], [1, '#961c30']]), '#5a0a18', 0.28), -0.22) + ell(18.8, 7.9, 2.7, 0.95, fs(c.lg([[0, '#fffab0'], [1, '#c49c14']]), '#6a5006', 0.28), -0.22) + circ(16, 8, 0.85, fs('#fbf236', '#6a5006', 0.24));
      }
    }
    return '';
  }
  function extra(c, id, crowned) {
    const ey = crowned ? -4 : 0;
    switch (id) {
      case 'halo': return ell(16, 6.5 + ey, 5, 1.6, `fill="none" stroke="#fff27a" stroke-width="1.6" opacity=".5" filter="${c.blur(0.5)}"`) + ell(16, 6.5 + ey, 4.4, 1.25, 'fill="none" stroke="#c89a10" stroke-width="1.05"') + ell(16, 6.5 + ey, 4.4, 1.25, 'fill="none" stroke="#fbf236" stroke-width=".6"');
      case 'star': { const x = 16 + (crowned ? 7 : 0), y = 6.2 + (crowned ? 1 : 0); return circ(x, y, 2.2, `fill="#fff27a" opacity=".45" filter="${c.blur(0.6)}"`) + path(rpoly(starPts(x, y, 1.75, 0.8, 5), 0.2), fs(c.rg([[0, '#fffbe0'], [0.6, '#fbf236'], [1, '#e8b020']], 0.4, 0.35, 0.7), '#7a5a06', 0.28)); }
      case 'moon': { const x = 15.2 + (crowned ? 9 : 0), y = 6.6 + (crowned ? 1 : 0); return circ(x + 0.4, y, 2, `fill="#dcc8ff" opacity=".45" filter="${c.blur(0.6)}"`) + path(`M${x + 0.6} ${y - 1.8}A1.8 1.8 0 1 0 ${x + 0.6} ${y + 1.8}A1.45 1.45 0 1 1 ${x + 0.6} ${y - 1.8}Z`, fs(c.lg([[0, '#f0e2ff'], [1, '#c9a2f0']]), '#5e3a8e', 0.26)); }
      case 'heart': { const x = 16 + (crowned ? 7 : 0), y = 5.7 + (crowned ? 1 : 0); return path(heartD(x, y, 1.45), fs(c.rg([[0, '#ffc8da'], [0.5, '#f7608a'], [1, '#c83a64']], 0.35, 0.3, 0.8), '#6a1030', 0.28)) + ell(x - 0.75, y - 0.45, 0.35, 0.22, 'fill="#ffffff" opacity=".85"', -0.6); }
    }
    return '';
  }

  // ---------- the whole Sprout, as markup ----------
  const DEF = { body: 'mint', leaf: 'leaf', belly: BELLY, cheek: '#f4a3b8', pattern: 'plain', patternColor: BELLY, eyes: 'round', eyeColor: '#5b6ee1', hat: 'none', extra: 'none', parts: {} };
  // pics: { hat: true, extra: true } when the family's picture replaces the code art (drawn after the markup)
  function markup(look, pose, pics, k) {
    const L = Object.assign({}, DEF, look), pt = L.parts || {}, pz = pose || {};
    const c = new Ctx(), skin = SK[L.skin] ? L.skin : null, base = VIVID(RAMPS[L.body] || RAMPS.mint);
    const R = skin ? SK[skin].part : base, RR = skin && SK[skin].partR ? SK[skin].partR : R, LR = RAMPS[L.leaf] || RAMPS.leaf;
    const hide = !!HIDES[L.hat], capOn = pt.mushcap > 0 && (!L.hat || L.hat === 'none');
    const clip = c.clip(BODY), dark = skin ? !!SK[skin].dark : lum(base[1]) < 0.42, ap = armPose(pz);
    let out = partsBack(c, pt, R, LR, L, pz) + partsMid(c, pt, R, RR, LR, L, pz);
    const stg = hide ? '' : G(stageArt(c, L, LR, skin));
    if (!capOn) out += stg;
    const ft = feet(c, L, R, RR, skin, pt, pz);
    if (skin !== 'ghost') out += ft;
    // the body sticker: arms + round body as one shape with one outline, lit as one volume (light from up-left)
    const shared = skin ? null : c.rg([[0, mix(R[0], '#ffffff', 0.3)], [0.13, R[0]], [0.44, R[1]], [0.8, mix(R[1], R[2], 0.42)], [1, mix(R[1], R[2], 0.85)]], 13.2, 17.2, 14.6, ' gradientUnits="userSpaceOnUse"');
    let body = armShapes(c, ap, R, RR, shared);
    if (skin) body += skinFill(c, skin, L.body) + ell(16, 22, BRX, BRY, `fill="${c.rg([[0, '#ffffff', 0.45], [0.3, '#ffffff', 0], [0.62, INK, 0], [1, INK, 0.3]], 0.36, 0.3, 0.8)}"`);
    else body += ell(16, 22, BRX, BRY, `fill="${shared}"`);
    let inside = patternBody(c, L, skin, R);
    const bellyCol = skin && 'belly' in SK[skin] ? SK[skin].belly : (L.belly || BELLY);
    if (bellyCol) {
      const bsh = mix(bellyCol, skin ? (SK[skin].bshade || '#b08a60') : base[2], 0.3);
      inside += ell(16, 26, 4.8, 2.9, `fill="${c.lg([[0, mix(bellyCol, '#ffffff', 0.45)], [0.5, bellyCol], [1, bsh]])}"`) + ell(16, 26, 4.8, 2.9, `fill="none" stroke="${bsh}" stroke-width=".25" opacity=".55"`);
      if (skin === 'ember') inside += line('M11.4 25L20.6 25M11.4 27L20.6 27', '#f6d68a', 0.35, 'opacity=".8"');
    }
    // soft light: a deeper rim low down, a bounce glow along the bottom, and the target's glossy sheen up-left on the head
    inside += ell(16, 22, BRX, BRY, `fill="none" stroke="${mix(R[2], INK, 0.25)}" stroke-width="1.2" opacity=".28" filter="${c.blur(0.45)}"`);
    inside += ell(16, 22, BRX, BRY, `fill="none" stroke="${c.lg([[0, '#ffffff', 0], [0.66, '#ffffff', 0], [1, mix(R[0], '#ffffff', 0.5), 0.8]])}" stroke-width="1.2" filter="${c.blur(0.4)}"`);
    inside += path('M9.05 19.9C8.9 17 11.1 14.9 14.2 14.7C12 15.7 10.45 17.4 10.25 20.2C9.9 20.75 9.25 20.55 9.05 19.9Z', `fill="#ffffff" opacity=".78" filter="${c.blur(0.28)}"`) +
      ell(12.6, 16.6, 2.6, 1.15, `fill="#ffffff" opacity=".32" filter="${c.blur(0.5)}"`, -0.6) + ell(15.4, 15.55, 0.55, 0.36, 'fill="#ffffff" opacity=".85"', -0.2);
    if (L.shiny === true) inside += line('M18.2 14.9L22.4 19', '#ffffff', 1.5, `opacity=".55" filter="${c.blur(0.45)}"`) + path(sparkleD(19.6, 15.6, 0.75), 'fill="#ffffff"') + path(sparkleD(9.6, 24.6, 0.6), 'fill="#ffffff"');
    body += `<g clip-path="${clip}">${inside}</g>` + patternBelly(L);
    body = G(body);
    if (skin === 'ghost') body = `<g mask="${c.mask(c.lg([[0, '#ffffff'], [0.8, '#ffffff'], [1, '#ffffff', 0.4]], 0, -1, 0, 32, ' gradientUnits="userSpaceOnUse"'), -2, -2, 36, 36)}">${ft}${body}</g>`;
    out += body + partsFront(c, pt, R, RR, LR, L, ap) + holdArms(c, ap, R, RR);
    if (capOn) out += stg;
    out += unihorn(c, pt) + face(c, L, pz, dark, skin, k <= 2 ? 1.5 : k <= 3 ? 1.25 : 1);
    if (L.shiny === true) out += path(sparkleD(27, 12.5, 1.2), `fill="#fff6c8" stroke="#e0a82a" stroke-width=".14" ${NOL}`) + path(sparkleD(4.8, 15.5, 0.85), `fill="#ffffff" stroke="#e0a82a" stroke-width=".14" ${NOL}`) + path(sparkleD(27.6, 24.6, 0.7), `fill="#ffffff" stroke="#e0a82a" stroke-width=".14" ${NOL}`);
    const crowned = !hide && !!(L.bloom || L.bud);
    if (!(pics && pics.hat)) out += G(hat(c, L.hat, crowned, L.bloom));
    if (!(pics && pics.extra)) out += G(extra(c, L.extra, crowned));
    return { src: out, c, crowned };
  }

  // ---------------- the painter: that markup drawn with Canvas2D, synchronously ----------------
  // Elements: path, ellipse, circle, rect, g (transform, clip-path, mask, ol = this piece's bold outline, nol = no outline).
  // Paint: fill / stroke (a colour or url(#gradient)), stroke-width / -linejoin / -linecap / -dasharray, opacity, filter (blur).
  // Gradients follow SVG: objectBoundingBox units unless userSpaceOnUse; spreadMethod repeat / reflect. A blur is drawn as a
  // shadow (the shape off-canvas, its blurred shadow back in place), which every browser does (ctx.filter is not in Safari).
  const TAG = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g, ATT = /([a-zA-Z:-]+)="([^"]*)"/g, TR = /(\w+)\(([^)]*)\)/g;
  function parse(src) {
    const root = { t: 'g', a: {}, kids: [] }, st = [root]; let m;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(src))) {
      if (m[1]) { if (st.length > 1) st.pop(); continue; }
      const a = {}; let q; ATT.lastIndex = 0; while ((q = ATT.exec(m[3]))) a[q[1]] = q[2];
      const nd = { t: m[2], a, kids: m[4] ? null : [] };
      st[st.length - 1].kids.push(nd); if (!m[4]) st.push(nd);
    }
    return root;
  }
  const idOf = u => (u && u.startsWith('url(#') ? u.slice(5, -1) : null);
  const P2D = new Map(), BOX = new Map();
  function pathOf(d) { let p = P2D.get(d); if (!p) { if (P2D.size > 4000) P2D.clear(); p = new Path2D(d); P2D.set(d, p); } return p; }
  // a path's bounding box (for objectBoundingBox gradients): every point, control points and real arc extents included
  function boxOf(d) {
    let b = BOX.get(d); if (b) return b;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, cx = 0, cy = 0;
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    const re = /([MLQCAZHVmlqcazhv])([^MLQCAZHVmlqcazhv]*)/g; let m;
    while ((m = re.exec(d))) {
      const k = m[1].toUpperCase(), v = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
      if (k === 'A') for (let i = 0; i + 6 < v.length; i += 7) { arcPts(cx, cy, v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5], v[i + 6], add); cx = v[i + 5]; cy = v[i + 6]; }
      else if (k === 'H') for (const x of v) { add(x, cy); cx = x; }
      else if (k === 'V') for (const y of v) { add(cx, y); cy = y; }
      else for (let i = 0; i + 1 < v.length; i += 2) { add(v[i], v[i + 1]); cx = v[i]; cy = v[i + 1]; }
    }
    b = x1 >= x0 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
    if (BOX.size > 4000) BOX.clear(); BOX.set(d, b); return b;
  }
  function arcPts(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2, add) { // SVG arc endpoint -> centre form, sampled
    add(x2, y2); rx = Math.abs(rx); ry = Math.abs(ry); if (!rx || !ry) return;
    const ph = rotDeg * Math.PI / 180, cs = Math.cos(ph), sn = Math.sin(ph), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const xp = cs * dx + sn * dy, yp = -sn * dx + cs * dy, lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
    const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)));
    const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx, ccx = cs * cxp - sn * cyp + (x1 + x2) / 2, ccy = sn * cxp + cs * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry); let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    for (let i = 0; i <= 16; i++) { const t = t1 + dt * i / 16, ex = rx * Math.cos(t), ey = ry * Math.sin(t); add(ccx + cs * ex - sn * ey, ccy + sn * ex + cs * ey); }
  }
  function shapeOf(nd) {
    const a = nd.a;
    switch (nd.t) {
      case 'path': return { p: pathOf(a.d), box: boxOf(a.d) };
      case 'ellipse': { const cx = +a.cx, cy = +a.cy, rx = Math.max(0, +a.rx), ry = Math.max(0, +a.ry), p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); return { p, box: [cx - rx, cy - ry, 2 * rx, 2 * ry] }; }
      case 'circle': { const cx = +a.cx, cy = +a.cy, r = Math.max(0, +a.r), p = new Path2D(); p.arc(cx, cy, r, 0, Math.PI * 2); return { p, box: [cx - r, cy - r, 2 * r, 2 * r] }; }
      case 'rect': { const X = +a.x, Y = +a.y, w = +a.width, h = +a.height, p = new Path2D(); p.rect(X, Y, w, h); return { p, box: [X, Y, w, h] }; }
    }
    return null;
  }
  function trArgs(m) { return m[2].trim().split(/[\s,]+/).map(Number); }
  function applyT(x, s) {
    let m; TR.lastIndex = 0;
    while ((m = TR.exec(s))) {
      const v = trArgs(m);
      if (m[1] === 'translate') x.translate(v[0], v[1] || 0);
      else if (m[1] === 'rotate') { const r = v[0] * Math.PI / 180; if (v.length >= 3) { x.translate(v[1], v[2]); x.rotate(r); x.translate(-v[1], -v[2]); } else x.rotate(r); }
      else if (m[1] === 'scale') x.scale(v[0], v.length > 1 ? v[1] : v[0]);
    }
  }
  function matOf(s) {
    const M = new DOMMatrix(); let m; TR.lastIndex = 0;
    while ((m = TR.exec(s))) {
      const v = trArgs(m);
      if (m[1] === 'translate') M.translateSelf(v[0], v[1] || 0);
      else if (m[1] === 'rotate') { if (v.length >= 3) { M.translateSelf(v[1], v[2]); M.rotateSelf(v[0]); M.translateSelf(-v[1], -v[2]); } else M.rotateSelf(v[0]); }
      else if (m[1] === 'scale') M.scaleSelf(v[0], v.length > 1 ? v[1] : v[0]);
    }
    return M;
  }
  function clipOf(c, id) {
    const d = c.defs[id]; if (!d) return null; if (d.p) return d.p;
    const P = new Path2D();
    (function walk(nd, M) {
      for (const k of nd.kids || []) {
        const M2 = k.a.transform ? M.multiply(matOf(k.a.transform)) : M;
        if (k.t === 'g') walk(k, M2); else { const s = shapeOf(k); if (s) P.addPath(s.p, M2); }
      }
    })(parse(d.inner), new DOMMatrix());
    return (d.p = P);
  }
  const rgbaOf = (h, a) => { if (a == null || +a >= 1 || !h || h[0] !== '#') return h; const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${+a})`; };
  function stopsOf(d) { return d.s.map(([o, col, a]) => [Math.max(0, Math.min(1, +o)), rgbaOf(col, a)]); }
  function spreadStops(st, mode, N, centred) { // repeat / reflect, laid out over N periods either side (or N outwards)
    const out = [], lo = centred ? -N : 0, tot = centred ? 2 * N + 1 : N + 1;
    for (let i = lo; i <= N; i++) {
      const flip = mode === 'reflect' && (((i % 2) + 2) % 2 === 1), list = flip ? st.slice().reverse().map(([o, col]) => [1 - o, col]) : st;
      for (const [o, col] of list) out.push([Math.max(0, Math.min(1, (i - lo + o) / tot)), col]);
    }
    return out;
  }
  // -> { g: CanvasGradient, unit: true when it must be drawn in the box's own space (an elliptical objectBoundingBox radial) }
  function gradOf(x, c, id, box) {
    const d = c.defs[id]; if (!d || (d.t !== 'lg' && d.t !== 'rg')) return null;
    let st = stopsOf(d); const rep = d.spread === 'repeat' || d.spread === 'reflect', N = 5;
    if (d.t === 'lg') {
      let X1 = d.x1, Y1 = d.y1, X2 = d.x2, Y2 = d.y2;
      if (!d.user) { X1 = box[0] + X1 * box[2]; Y1 = box[1] + Y1 * box[3]; X2 = box[0] + X2 * box[2]; Y2 = box[1] + Y2 * box[3]; }
      if (rep) { const dx = X2 - X1, dy = Y2 - Y1; X1 -= N * dx; Y1 -= N * dy; X2 += N * dx; Y2 += N * dy; st = spreadStops(st, d.spread, N, true); }
      if (X1 === X2 && Y1 === Y2) Y2 += 1e-3;
      const g = x.createLinearGradient(X1, Y1, X2, Y2); for (const [o, col] of st) g.addColorStop(o, col);
      return { g, unit: false };
    }
    let cx = d.cx, cy = d.cy, r = d.r, unit = false;
    if (!d.user) {
      const [bx, by, bw, bh] = box;
      if (Math.abs(bw - bh) <= 0.06 * Math.max(bw, bh)) { cx = bx + cx * bw; cy = by + cy * bh; r = r * (bw + bh) / 2; } else unit = true;
    }
    if (rep) { r *= N + 1; st = spreadStops(st, d.spread, N, false); }
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1e-4, r)); for (const [o, col] of st) g.addColorStop(o, col);
    return { g, unit };
  }
  const solidOf = (c, v) => { const id = idOf(v); if (!id) return v; const d = c.defs[id]; if (!d || !d.s) return '#ffffff'; let best = d.s[0]; for (const s of d.s) if ((s[2] == null ? 1 : s[2]) >= (best[2] == null ? 1 : best[2])) best = s; return best[1]; };
  function fillUnit(x, p, box, g) {
    const [bx, by, bw, bh] = box; if (!(bw > 0 && bh > 0)) return;
    const up = new Path2D(); up.addPath(p, new DOMMatrix([1 / bw, 0, 0, 1 / bh, -bx / bw, -by / bh]));
    x.save(); x.transform(bw, 0, 0, bh, bx, by); x.fillStyle = g; x.fill(up); x.restore();
  }
  const OFF = 4096;
  function paintOne(x, c, s, val, stroke, a, op, blur) {
    let style = val, unit = false;
    const gid = idOf(val);
    if (gid) { const g = gradOf(x, c, gid, s.box); if (!g) return; style = g.g; unit = g.unit; }
    x.globalAlpha = op;
    if (stroke) {
      x.lineWidth = a['stroke-width'] == null ? 1 : +a['stroke-width']; x.lineJoin = a['stroke-linejoin'] || 'miter'; x.lineCap = a['stroke-linecap'] || 'butt';
      x.setLineDash(a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number) : []);
    }
    const go = () => { if (stroke) { x.strokeStyle = style; x.stroke(s.p); } else if (unit) fillUnit(x, s.p, s.box, style); else { x.fillStyle = style; x.fill(s.p); } };
    if (blur > 0) { // the shape is drawn far to the left; only its blurred shadow lands, back in place
      const m = x.getTransform(), sc = Math.hypot(m.a, m.b);
      x.save(); x.shadowColor = solidOf(c, val); x.shadowBlur = 2 * blur * sc; x.shadowOffsetX = OFF; x.shadowOffsetY = 0;
      x.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f); go(); x.restore();
    } else go();
    if (stroke && a['stroke-dasharray']) x.setLineDash([]);
  }
  function drawShape(x, nd, c) {
    const a = nd.a, s = shapeOf(nd); if (!s) return;
    x.save();
    if (a.transform) applyT(x, a.transform);
    const op = a.opacity == null ? 1 : +a.opacity, bd = a.filter ? c.defs[idOf(a.filter)] : null, blur = bd ? bd.sd : 0;
    const fill = a.fill == null ? '#000000' : a.fill, stroke = a.stroke && a.stroke !== 'none' ? a.stroke : null;
    if (fill !== 'none') paintOne(x, c, s, fill, false, a, op, blur);
    if (stroke) paintOne(x, c, s, stroke, true, a, op, blur);
    x.restore();
  }
  // the outline pass of a piece: every solid shape in ink, grown by the outline width (thin decorations and glows add nothing)
  function silShape(x, nd, env) {
    const a = nd.a;
    if (a.nol || a.filter || (a.opacity != null && +a.opacity < 0.9)) return;
    const hasFill = a.fill !== 'none', sw = a.stroke && a.stroke !== 'none' ? +(a['stroke-width'] || 1) : 0;
    if (!hasFill && sw < 0.6) return;
    const s = shapeOf(nd); if (!s) return;
    x.save(); if (a.transform) applyT(x, a.transform);
    x.globalAlpha = 1; x.fillStyle = x.strokeStyle = env.ink; x.lineJoin = 'round'; x.lineCap = 'round'; x.setLineDash([]);
    x.lineWidth = sw + 2 * env.olw;
    if (hasFill) x.fill(s.p);
    x.stroke(s.p);
    x.restore();
  }
  function drawKids(x, nd, c, env, sil) {
    for (const k of nd.kids || []) {
      if (k.t === 'g') drawGroup(x, k, c, env, sil);
      else if (sil) silShape(x, k, env);
      else drawShape(x, k, c);
    }
  }
  function drawGroup(x, nd, c, env, sil) {
    const a = nd.a;
    if (sil && (a['clip-path'] || a.nol)) return; // (clipped detail sits inside its piece)
    x.save();
    if (a.transform) applyT(x, a.transform);
    if (!sil && a['clip-path']) { const cp = clipOf(c, idOf(a['clip-path'])); if (cp) x.clip(cp); }
    if (!sil && a.mask) { drawMasked(x, nd, c, env); x.restore(); return; }
    if (!sil && a.ol && env.olw > 0) drawKids(x, nd, c, env, true);
    drawKids(x, nd, c, env, sil);
    x.restore();
  }
  const layers = {};
  function layerOf(W, H) { const key = W + 'x' + H; let L = layers[key]; if (!L) { L = layers[key] = document.createElement('canvas'); L.width = W; L.height = H; } return L; }
  function drawMasked(x, nd, c, env) { // (the Ghost skin: its lower half fades away)
    const W = x.canvas.width, H = x.canvas.height, L = layerOf(W, H), lx = L.getContext('2d'), md = c.defs[idOf(nd.a.mask)];
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, W, H); lx.globalCompositeOperation = 'source-over';
    const m = x.getTransform(); lx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const inner = { t: 'g', a: { ol: nd.a.ol }, kids: nd.kids };
    drawGroup(lx, inner, c, env, false);
    if (md) {
      const g = gradOf(lx, c, idOf(md.fill), [md.x, md.y, md.w, md.h]);
      if (g) { lx.globalCompositeOperation = 'destination-in'; lx.globalAlpha = 1; lx.fillStyle = g.g; lx.fillRect(md.x, md.y, md.w, md.h); lx.globalCompositeOperation = 'source-over'; }
    }
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.drawImage(L, 0, 0); x.restore();
  }

  // ---------------- the family's hat & charm pictures on the smooth head ----------------
  const picOf = id => { try { return id && id !== 'none' && PX.picture ? PX.picture('hats', id) : null; } catch (e) { return null; } };
  // where the code hat sits (art px; its outline included): the picture is fitted into the same box, standing on its bottom
  const boxCache = new Map();
  function hatBox(slot, id, crowned, bloom) {
    const key = slot + id + (crowned ? 'c' : '') + (bloom ? 'b' : ''); if (boxCache.has(key)) return boxCache.get(key);
    const K = 4, cv = document.createElement('canvas'); cv.width = cv.height = 32 * K; const x = cv.getContext('2d'); x.setTransform(K, 0, 0, K, 0, 0);
    const c = new Ctx(), src = G(slot === 'hat' ? hat(c, id, crowned, bloom) : extra(c, id, crowned));
    drawKids(x, parse(src), c, { olw: OLW, ink: INK }, false);
    let b = null;
    try {
      const d = x.getImageData(0, 0, cv.width, cv.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let X = 0; X < cv.width; X++) if (d[(y * cv.width + X) * 4 + 3] > 128) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) b = [x0 / K, y0 / K, (x1 + 1) / K, (y1 + 1) / K];
    } catch (e) { b = null; }
    boxCache.set(key, b); return b;
  }
  const RING = 0.32; // extra ink round a picture's own outline, so it matches the Sprout's line (art px)
  function drawPicture(x, im, box, k, env) {
    if (!im || !box || !im.naturalWidth) return;
    const bw = box[2] - box[0], bh = box[3] - box[1], s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight) * 1.04;
    const w = im.naturalWidth * s * k, h = im.naturalHeight * s * k, r = Math.max(1, RING * k * env.olw / OLW), pad = Math.ceil(r) + 2;
    const T = document.createElement('canvas'); T.width = Math.ceil(w) + 2 * pad; T.height = Math.ceil(h) + 2 * pad;
    const tx = T.getContext('2d'); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
    const S = document.createElement('canvas'); S.width = T.width; S.height = T.height; const sx = S.getContext('2d');
    sx.drawImage(im, pad, pad, w, h); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = env.ink; sx.fillRect(0, 0, S.width, S.height);
    const nRing = r > 3 ? 28 : 16;
    for (let i = 0; i < nRing; i++) { const a = i * 2 * Math.PI / nRing; tx.drawImage(S, Math.cos(a) * r, Math.sin(a) * r); tx.drawImage(S, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
    tx.drawImage(S, 0, 0); tx.drawImage(im, pad, pad, w, h);
    const X = Math.round(((box[0] + box[2]) / 2) * k - w / 2) - pad, Y = Math.round(box[3] * k - h) - pad;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.drawImage(T, X, Y); x.restore();
  }

  // ---------------- building, caching, and the PX hooks ----------------
  function build(look, pose, k, opt) {
    const L = look || PX.DEFAULT_LOOK, pz = pose || {}, olw = opt && opt.olw != null ? opt.olw : OLW;
    const ph = picOf(L.hat), pe = picOf(L.extra), pics = { hat: !!ph, extra: !!pe };
    const m = markup(L, pz, pics, k);
    const cv = document.createElement('canvas'); cv.width = Math.round(32 * k); cv.height = Math.round(32 * k);
    const x = cv.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const env = { olw, ink: INK };
    drawKids(x, parse(m.src), m.c, env, false);
    if (ph) drawPicture(x, ph, hatBox('hat', L.hat, m.crowned, L.bloom), k, env);
    if (pe) drawPicture(x, pe, hatBox('extra', L.extra, m.crowned, L.bloom), k, env);
    cv.k = k; cv.hdSpr = 1;
    return cv;
  }
  const sprig0 = PX.sprig, blit0 = PX.blit;
  const cache = new Map(), big = new Map(), MAX = 300, BIG_BYTES = 24e6; // (k = 4 Sprouts are 64 KB each: about 20 MB at most;
  // the bigger ones for heroes and 3x screens are kept to about 24 MB, oldest dropped first)
  let bigBytes = 0;
  const picKey = L => (picOf(L.hat) ? 'h' : '') + (picOf(L.extra) ? 'e' : '');
  function sprigAt(look, pose, k, opt) {
    const L = look || PX.DEFAULT_LOOK, Pz = pose || {};
    k = Math.max(1, Math.min(16, Math.round(k || 4)));
    const olw = opt && opt.olw != null ? +opt.olw : null, C = k === 4 && olw == null ? cache : big;
    const key = JSON.stringify(L) + '|' + JSON.stringify(Pz) + '|' + k + '|' + picKey(L) + (olw == null ? '' : '|' + olw);
    let c = C.get(key);
    if (c) { C.delete(key); C.set(key, c); return c; } // (most recently used last)
    try { c = build(L, Pz, k, opt); } catch (e) { console.error('PX.sprig (HD)', e); return sprig0 ? sprig0(L, Pz) : null; }
    try { c.hdLook = JSON.parse(JSON.stringify(L)); c.hdPose = JSON.parse(JSON.stringify(Pz)); c.hdOpt = olw == null ? null : { olw }; } catch (e) { /* plain data */ }
    C.set(key, c);
    if (C === cache) { if (C.size > MAX) C.delete(C.keys().next().value); }
    else { bigBytes += c.width * c.height * 4; while (big.size > 1 && bigBytes > BIG_BYTES) { const k0 = big.keys().next().value, o = big.get(k0); bigBytes -= o.width * o.height * 4; big.delete(k0); } }
    return c;
  }
  PX.sprig = function (L, Pz) { return sprigAt(L, Pz, 4); };
  PX.sprigAt = sprigAt;
  PX.sprigPixel = sprig0; // (today's pixel Sprout, for side-by-side reviews)
  // the same Sprout redrawn sharp for `scale` CSS px per art px on this screen (big heroes), or src when it's already sharp enough
  PX.hdUp = function (src, scale) {
    if (!src || !src.hdSpr || !src.hdLook || !(scale > 0)) return src;
    const dpr = Math.min(3, window.devicePixelRatio || 1), want = Math.min(16, Math.ceil(scale * dpr - 0.05));
    return want <= (src.k || 4) ? src : sprigAt(src.hdLook, src.hdPose, want, src.hdOpt);
  };
  // scenes draw sprites with image smoothing off (crisp pixel art); a smooth hi-res Sprout is drawn with it on, so shrinking it to
  // a scene's 2 fine px per art px averages its pixels instead of dropping every other one
  // (a scene at exactly 2 fine px per art px, as the garden, battles, races and the title are, gets the same Sprout drawn
  // natively at k = 2 and copied 1:1: no resampling each frame, and its lines land on whole fine pixels)
  if (blit0) PX.blit = function (ctx, c, x, y, flip, ax, ay) {
    if (!ctx || !c || !(c.k > 2)) return blit0(ctx, c, x, y, flip, ax, ay);
    let m = null; try { m = ctx.getTransform(); } catch (e) { m = null; }
    if (m && c.hdLook && Math.abs(m.a - 2) < 1e-3 && Math.abs(m.d - 2) < 1e-3 && !m.b && !m.c) {
      const h = c._k2 || (c._k2 = sprigAt(c.hdLook, c.hdPose, 2, c.hdOpt));
      if (h && h.k === 2) return blit0(ctx, h, x, y, flip, ax, ay);
    }
    const se = ctx.imageSmoothingEnabled, sq = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    try { blit0(ctx, c, x, y, flip, ax, ay); } finally { ctx.imageSmoothingEnabled = se; if (sq) ctx.imageSmoothingQuality = sq; }
  };
  PX.hdStats = () => ({ cached: cache.size, big: big.size, bigMB: Math.round(bigBytes / 1e5) / 10, max: MAX });
})();
