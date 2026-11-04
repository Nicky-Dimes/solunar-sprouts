// art-legends.js — Solunar Sprouts: the six newer Legend Challenge bosses (battle.js BOSSES with art: 'legend').
//   PX.legend(id, frame, box) -> a <canvas> of box x box art pixels (bitmap k = 2 fine pixels per art pixel, c.k = 2: draw it with
//   PX.artW / PX.artH or PX.blit), the creature standing on the bottom row, centred, facing RIGHT (battle.js flips it to face the
//   player). box: 78 (the default: the battle size at bossScale 3), 52 (bossScale 2) or 32 (cards, previews, results, Sprout Book).
//   Every size is DRAWN at that size (never an enlarged small picture), so a Legend has the Sprouts' one level of detail
//   everywhere: 1-fine-pixel lines between pieces, one outer ink ring (1 art px, like a Sprout's), soft 5-step shading lit from the
//   upper left, glossy eyes like a Sprout's, colours from the game's ramps (or 50/50 mixes), finished by PX.hd.
//   Frames: 'idle', 'blink' (eyes shut), 'attack' (lunging at you), 'charge' (powering up its giant attack). Unknown ids give null.
//   PX.LEGEND_IDS / PX.LEGEND_FRAMES list them.
// Each creature is drawn in a 64 x 64 design box (feet at y 63) and scaled by s = box / 64 while it is drawn.
// Nothing is drawn when this file loads (tools/check_game.js runs art files in Node); pictures are made on first use and kept in a
// small bounded cache (battle.js builds a battle's four frames inside the screen wipe).
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.PX) return;
  const PX = window.PX, INK = PX.INK || '#222034', W = '#ffffff';
  const RM = PX.RAMPS || {};
  const RP = k => RM[k] || ['#ffffff', '#c8c8d8', '#808090'];

  // ---------------- colour helpers ----------------
  const memo = new Map();
  function mix(a, b, k) {
    const key = a + b + k; let v = memo.get(key); if (v) return v;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = sh => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    v = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
    if (memo.size > 600) memo.clear(); memo.set(key, v); return v;
  }
  const blend = (a, b) => [mix(a[0], b[0], 0.5), mix(a[1], b[1], 0.5), mix(a[2], b[2], 0.5)];
  const deeper = R => [R[1], mix(R[1], R[2], 0.5), R[2]];      // the same ramp one step into the shade (far limbs)
  const glowing = R => [mix(R[0], W, 0.5), R[0], R[1]];       // the same ramp lit up (charging)
  const BLUSH = '#f4a3b8';

  // ---------------- drawing in design units ----------------
  // a pen on grid t at scale s: every coordinate and radius is in design units (64 = the box)
  function pen(t, s) {
    const S = v => v * s, L = list => list.map(q => [q[0] * s, q[1] * s]);
    const filled = () => { const f = (x, y) => t.filled(x, y); f.fine = true; return f; };
    const p = {
      t, s,
      ell(x, y, rx, ry, c, rot, m) { t.ell(S(x), S(y), Math.max(0.3, S(rx)), Math.max(0.3, S(ry)), c, rot || 0, m); return p; },
      poly(list, c) { t.poly(L(list), c); return p; },
      stroke(list, r0, r1, c) { PX.stroke(t, L(list), Math.max(0.3, S(r0)), Math.max(0.3, S(r1 == null ? r0 : r1)), c); return p; },
      // shade: recolour what is already filled with a soft ramp lit from the upper left (the ramp's volume is this ellipse)
      shade(x, y, rx, ry, R, rot) { t.ell(S(x), S(y), S(rx), S(ry), R, rot || 0, filled()); return p; },
      // on: paint only over filled pixels (spots, bellies, glows)
      on(x, y, rx, ry, c, rot) { t.ell(S(x), S(y), Math.max(0.3, S(rx)), Math.max(0.3, S(ry)), c, rot || 0, filled()); return p; },
      // ellIf: an ellipse limited by test(designX, designY) (crescents, half shapes)
      ellIf(x, y, rx, ry, c, test, rot) { const m = (ax, ay) => test((ax + 0.25) / s, (ay + 0.25) / s); m.fine = true; t.ell(S(x), S(y), Math.max(0.3, S(rx)), Math.max(0.3, S(ry)), c, rot || 0, m); return p; },
      // a line one fine pixel wide at every size (mouths, cracks, strands); only: just over filled pixels
      line(list, c, only) {
        const K = t.k || 1;
        for (let i = 1; i < list.length; i++) {
          const x0 = list[i - 1][0] * s, y0 = list[i - 1][1] * s, x1 = list[i][0] * s, y1 = list[i][1] * s, n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * K * 2));
          for (let j = 0; j <= n; j++) { const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n; if (!only || t.filled(x, y)) t.dot(x, y, c); }
        }
        return p;
      },
      // a thicker ink line that keeps its weight at every size (mouth lines of big faces): r in ART px
      ink(list, r, c) { PX.stroke(t, L(list), r || 0.34, r || 0.34, c || INK); return p; },
      dot(x, y, c) { t.dot(S(x), S(y), c); return p; },
      // a 4-point twinkle in fine pixels (a white core and arms of colour c); big: longer arms
      tw(x, y, c, big) {
        const K = t.k || 1, fx = Math.floor(x * s * K), fy = Math.floor(y * s * K), n = big ? 2 : 1;
        t.fset(fx, fy, W); for (let i = 1; i <= n; i++) for (const [a, b] of [[i, 0], [-i, 0], [0, i], [0, -i]]) t.fset(fx + a, fy + b, i === n && big ? mix(c, W, 0.4) : c);
        return p;
      },
    };
    return p;
  }
  // a piece: drawn on its own layer, outlined in ink, then laid over what is there (the 1-fine-pixel line between parts)
  function piece(g, s, draw) { const t = new PX.Grid(g.w, g.h, g.k); t.dither = false; draw(pen(t, s), t); t.outline(INK); g.merge(t); }
  // a Sprout-style glossy eye: dark oval, a glow of colour low in it, a big shine up-left, a small one down-right.
  // shut: a soft closed arc; happy: an upside-down arc (^); brave: a slanted brow above it (dir: which way the face looks)
  function eye(p, x, y, rx, ry, glow, o) {
    o = o || {};
    if (o.shut) { p.ink([[x - rx * 1.05, y + ry * 0.05], [x - rx * 0.5, y + ry * 0.42], [x + rx * 0.5, y + ry * 0.42], [x + rx * 1.05, y + ry * 0.05]]); return; }
    if (o.happy) { p.ink([[x - rx * 1.05, y + ry * 0.5], [x - rx * 0.55, y - ry * 0.15], [x, y - ry * 0.35], [x + rx * 0.55, y - ry * 0.15], [x + rx * 1.05, y + ry * 0.5]]); return; }
    p.ell(x, y, rx, ry, INK);
    if (o.lit) { p.ell(x, y + ry * 0.1, rx * 0.72, ry * 0.75, mix(glow, W, 0.35)); p.ell(x, y + ry * 0.2, rx * 0.4, ry * 0.4, W); }
    else { p.ell(x + rx * 0.05, y + ry * 0.55, rx * 0.6, ry * 0.3, mix(glow, INK, 0.25)); p.ell(x + rx * 0.05, y + ry * 0.62, rx * 0.28, ry * 0.13, mix(glow, W, 0.4)); }
    p.ell(x - rx * 0.32, y - ry * 0.4, Math.max(0.55, rx * 0.36), Math.max(0.55, ry * 0.28), W);
    p.dot(x + rx * 0.42, y + ry * 0.3, W);
    if (o.brave) p.ink(o.brave > 0 ? [[x - rx * 1.1, y - ry * 1.35], [x + rx * 0.9, y - ry * 0.95]] : [[x + rx * 1.1, y - ry * 1.35], [x - rx * 0.9, y - ry * 0.95]], 0.3);
  }
  function blush(p, x, y, rx, ry) { p.on(x, y, rx, ry, BLUSH); p.dot(x - rx * 0.45, y - ry * 0.3, mix(BLUSH, W, 0.5)); }
  // an open mouth: a dark D (or round O) with a pink tongue
  function mouth(p, x, y, w, h, round) {
    if (round) { p.ell(x, y, w, h, INK); p.ell(x, y + h * 0.3, w * 0.5, h * 0.45, '#7a3048'); return; }
    p.ellIf(x, y, w, h, INK, (u, v) => v >= y - h * 0.1); p.ellIf(x, y + h * 0.45, w * 0.55, h * 0.4, '#e8607a', (u, v) => v >= y + h * 0.15);
  }
  // a little 5-petal flower (pink petals, a sunny middle)
  function flower(p, x, y, r, R) { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; p.ell(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.5, R[0]); } p.ell(x, y, r * 0.38, r * 0.38, '#fbf236'); }

  // ---------------- the Legends ----------------
  const ART = {
    // ----- Golem, the Mossy Guardian (leaf + stone): a round mossy boulder with a little stone head, flowers and a sprout -----
    golem(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const ST = blend(RP('slate'), RP('sand')), STd = deeper(ST), MS = RP('moss'), LF = RP('leaf'), FL = RP('rose');
      const hy = atk ? 3 : chg ? -1 : 0; // the head dips when it punches, lifts when it charges
      // back arm (behind the body)
      piece(g, s, p => {
        if (chg) { p.ell(14, 33, 5.8, 5.6, STd[1]); p.stroke([[13, 32], [9.5, 24], [9.5, 17]], 4.6, 5, STd[1]); p.ell(10, 12, 6, 5.8, STd[1]); p.shade(11, 21, 8, 14, STd); }
        else { p.ell(13.5, 34, 6, 6, STd[1]); p.stroke([[12.5, 35], [9.5, 44], [9, 49]], 4.8, 5.6, STd[1]); p.ell(9, 54.5, 6.8, 6.4, STd[1]); p.shade(11, 44, 9, 15, STd); }
      });
      piece(g, s, p => { p.ell(21, 57.5, 7, 5.6, STd[1]); p.shade(21, 57, 7, 6, STd); }); // back foot
      // the body: a big round boulder, lichen spots and fine cracks
      piece(g, s, p => {
        p.ell(30, 40, 21, 18, ST[1]); p.shade(30, 39, 21.5, 18.5, ST);
        for (const [x, y, rx] of [[18, 46, 2.2], [37, 50, 1.8], [24, 53, 1.4], [43, 44, 1.5]]) p.on(x, y, rx, rx * 0.7, mix(ST[0], MS[0], 0.5));
        if (big) { p.line([[25, 47], [27, 50], [26, 53]], ST[2], true); p.line([[40, 51], [42, 54]], ST[2], true); p.line([[14, 40], [16, 43]], ST[2], true); }
      });
      // moss blanket over the top, with a scalloped edge and a few hanging vines
      piece(g, s, p => {
        p.ell(29, 27.5, 19.5, 10.5, MS[1]);
        for (let i = 0; i < 8; i++) { const x = 11.5 + i * 4.9, y = 31.5 + Math.sin(i * 1.9) * 1.6; p.ell(x, y, 3.1, 2.9, MS[1]); }
        p.shade(28, 26, 22, 13, MS);
        if (big) { p.line([[15, 33], [14.5, 37], [15.5, 40]], LF[2], true); p.line([[34, 34], [34.5, 37.5]], LF[2], true); }
      });
      for (const [x, y] of big ? [[19, 25.5], [31, 21.5], [25.5, 30.5], [12.5, 29]] : [[20, 25], [31, 22]]) piece(g, s, p => flower(p, x, y, big ? 3.2 : 3.6, FL));
      // a raised front arm goes behind the head (charging)
      if (chg) piece(g, s, p => { p.ell(47, 35, 6, 6, ST[1]); p.stroke([[48, 34], [53, 25], [55, 17]], 5, 5.2, ST[1]); p.ell(56, 12, 6, 5.8, ST[1]); p.shade(52, 24, 8, 14, ST); });
      // the head: a smooth round stone with a mossy tuft and a little sprout on top
      piece(g, s, p => { p.ell(45, 21.5 + hy, 12, 10.5, ST[1]); p.shade(45, 21 + hy, 12.5, 11, ST); });
      piece(g, s, p => { p.stroke([[45, 12 + hy], [45.4, 6.5 + hy]], 0.75, 0.65, LF[2]); p.ell(42, 6 + hy, 3.2, 1.7, LF, -0.5); p.ell(48.6, 5.4 + hy, 3.4, 1.8, LF, 0.45); });
      piece(g, s, p => { p.ell(44.5, 13 + hy, 8, 3.6, MS[1]); p.ell(39, 14.2 + hy, 3, 2.4, MS[1]); p.ell(50, 13.8 + hy, 3.3, 2.3, MS[1]); p.shade(44.5, 12.5 + hy, 9, 4.5, MS); });
      // front foot and front arm (in front)
      piece(g, s, p => { p.ell(38, 58.5, 7.5, 5.2, ST[1]); p.shade(38, 58, 7.5, 5.6, ST); });
      piece(g, s, p => {
        if (atk) { p.ell(46.5, 37.5, 6, 6, ST[1]); p.stroke([[47, 37.5], [53, 36], [55.5, 35]], 5, 5.2, ST[1]); p.ell(57.5, 34.5, 6, 6, ST[1]); p.shade(52, 35, 11, 7, ST); }
        else if (!chg) { p.ell(47, 36, 6, 6, ST[1]); p.stroke([[48, 37], [51.5, 45], [53, 50]], 5, 5.6, ST[1]); p.ell(54.5, 55.5, 7, 6.4, ST[1]); p.shade(50, 46, 9, 14, ST); }
      });
      // face
      { const p = pen(g, s), y = 21 + hy;
        if (f === 'blink') { eye(p, 41, y, 2.3, 2.9, LF[0], { shut: true }); eye(p, 49.5, y, 2.3, 2.9, LF[0], { shut: true }); }
        else { const o = chg ? { lit: true } : atk ? { brave: 1 } : {}; eye(p, 41, y, 2.3, 2.9, LF[0], o); eye(p, 49.5, y, 2.3, 2.9, LF[0], o); }
        blush(p, 38.3, y + 4.6, 1.8, 0.9); blush(p, 52.2, y + 4.6, 1.8, 0.9);
        if (atk || chg) mouth(p, 45.2, y + 5.4, chg ? 1.9 : 2.3, chg ? 2.1 : 1.7, chg);
        else p.ink([[43.3, y + 4.7], [44.4, y + 5.5], [46, y + 5.5], [47.1, y + 4.7]]);
        if (chg) for (const [x, yy] of [[4, 6], [15, 4], [62, 8], [62, 22]]) p.tw(x, yy, '#c3f08a', big);
      }
    },

    // ----- Storm Whale, the Cloud Singer (water + sky): a big blue whale floating on a cloud, with a striped belly -----
    stormwhale(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const WB = blend(RP('sky'), RP('ocean')), BL = RP('cloud'), CL = chg ? blend(RP('slate'), RP('periwinkle')) : RP('cloud'), CLb = chg ? deeper(RP('slate')) : blend(RP('cloud'), RP('periwinkle'));
      const tilt = atk ? 3 : 0;
      // a cloud bank behind
      piece(g, s, p => { p.ell(9, 52, 7.5, 6, CLb[1]); p.ell(18.5, 49, 8.5, 6.5, CLb[1]); p.ell(56, 50, 7, 5.5, CLb[1]); p.shade(30, 49, 30, 8, CLb); });
      // tail and flukes
      piece(g, s, p => {
        p.stroke([[17, 35], [10, 30], [7, 22], [7, 17]], 5.4, 2.2, WB[1]);
        p.ell(3.6, 13.6, 4.8, 2.4, WB[1], -0.75); p.ell(10.6, 12.2, 5.2, 2.5, WB[1], 0.55);
        p.shade(8, 20, 9, 14, WB);
      });
      // the body: a long round whale, head on the right, a pale striped belly and freckles on the back
      piece(g, s, p => {
        p.ell(34, 34 + tilt * 0.4, 25, 14.5, WB[1], -0.06); p.ell(47, 32 + tilt * 0.6, 14.2, 14.5, WB[1]);
        p.shade(37, 31, 27, 17, WB);
        p.on(38, 46 + tilt * 0.5, 23, 9.5, BL[1], -0.05);
        for (let i = 0; i < (big ? 5 : 3); i++) { const y = 40.5 + i * (big ? 1.7 : 2.6) + tilt * 0.5; p.line([[18 + i * 1.4, y], [36, y + 1.1], [52 - i * 2.2, y - 0.6]], BL[2], true); }
        for (const [x, y] of [[24, 24], [29, 21.5], [35, 20.5], [31, 26], [20, 28]]) p.on(x, y + tilt * 0.2, 1.1, 0.8, WB[0]);
      });
      // the flipper
      piece(g, s, p => { p.ell(34, 47.5 + tilt * 0.4, 7.2, 2.8, WB[1], 0.62); p.shade(32, 46, 7, 4, WB); });
      // a spout: a puff of rain when calm, a tall fountain when it charges
      if (chg) piece(g, s, p => { p.stroke([[44, 19], [44, 9], [44.5, 3.5]], 1.8, 1.1, '#9fd8ff'); p.ell(40, 4.5, 3.6, 2.2, '#9fd8ff', 0.4); p.ell(49, 4, 3.6, 2.2, '#9fd8ff', -0.4); p.shade(44, 8, 8, 9, RP('aqua')); });
      else piece(g, s, p => { p.ell(41.6, 15.4, 1.2, 1.6, '#9fd8ff'); p.ell(44.6, 14, 1.3, 1.9, '#9fd8ff'); p.ell(47.6, 15.4, 1.2, 1.6, '#9fd8ff'); p.shade(44.6, 14.5, 4.5, 3, RP('aqua')); });
      // clouds in front (it swims through them)
      piece(g, s, p => {
        for (const [x, y, rx, ry] of [[12, 58, 8.5, 5], [24, 59.5, 9.5, 4.2], [37.5, 58.5, 10, 5], [51.5, 59, 9, 4.5], [18, 55.5, 5, 3.6], [31, 55, 6, 4], [45, 55, 6.5, 4.4], [57, 56, 5, 3.4]]) p.ell(x, y, rx, ry, CL[1]);
        p.shade(34, 55, 31, 9, CL);
      });
      if (chg) for (const [x0, y0, d] of [[8, 47, 1], [58, 45, -1]]) piece(g, s, p => p.poly([[x0, y0], [x0 + d * 3.2, y0 + 3.6], [x0 + d * 1.6, y0 + 3.9], [x0 + d * 3.4, y0 + 7.8], [x0 - d * 0.6, y0 + 3.2], [x0 + d * 1, y0 + 3]], '#fbf236'));
      // face
      { const p = pen(g, s), ey = 30.5 + tilt * 0.6;
        if (f === 'blink' || chg) eye(p, 49, ey, 2.4, 3, '#5fcde4', chg ? { happy: true } : { shut: true });
        else eye(p, 49, ey, 2.4, 3, '#5fcde4', atk ? { brave: 1 } : {});
        blush(p, 46.5, ey + 5.4, 2, 1);
        if (atk) { p.poly([[51.5, 36.6 + tilt], [62, 33 + tilt], [62, 42.6 + tilt], [52.5, 40 + tilt]], INK); p.ell(58, 40.8 + tilt, 3.4, 1.5, '#e8607a'); p.dot(61, 34.4 + tilt, W); }
        else if (chg) mouth(p, 57, 37.5, 1.6, 1.8, true);
        else p.ink([[52.5, 37.2], [55.5, 38.1], [58.5, 37.6], [60.8, 35.8]]);
        if (big && !chg) { p.tw(28, 12, '#cbdbfc'); p.tw(60, 15, '#cbdbfc'); }
        if (chg) for (const [x, y] of [[30, 6], [56, 10], [22, 15]]) p.tw(x, y, '#9fd8ff', big);
      }
    },

    // ----- Moon Wolf, the Silver Howl (shadow + light): a silver-blue wolf with starry fur and a golden crescent on its brow -----
    moonwolf(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const FU = chg ? glowing(RP('periwinkle')) : RP('periwinkle'), FD = deeper(blend(RP('periwinkle'), RP('night'))), RU = RP('cloud'), MO = RP('sun'), EAR = RP('lilac');
      const dy = atk ? 3 : 0, hx = atk ? 4 : 0, hy = atk ? 6 : chg ? -3 : 0;
      // tail (behind)
      piece(g, s, p => {
        p.stroke([[17, 40 + dy], [9, 35], [5.5, 26], [8.5, 16]], 3.6, 6, FU[1]); p.ell(9.5, 13.5, 5.2, 5.6, FU[1]);
        p.shade(9, 24, 9, 17, FU); p.on(10, 12, 4.4, 4.2, RU[0]); p.on(8.6, 17.5, 3.6, 2.4, RU[1]);
        if (big) { p.tw(7, 27, '#fff6b0'); p.tw(11.5, 21, '#fff6b0'); }
      });
      // far legs (in shade)
      piece(g, s, p => {
        p.stroke([[22, 46 + dy], [22.5, 55], [21.5, 61]], 3, 2.6, FD[1]); p.ell(22.5, 61.4, 3.4, 1.8, FD[1]);
        if (atk) { p.stroke([[42, 44 + dy], [49, 51], [55, 57]], 3, 2.6, FD[1]); p.ell(56.5, 57.8, 3.4, 1.9, FD[1]); }
        else { p.stroke([[43, 45], [44.5, 54], [44.5, 61]], 3, 2.6, FD[1]); p.ell(45.5, 61.4, 3.4, 1.8, FD[1]); }
        p.shade(33, 52, 22, 11, FD);
      });
      // body and chest
      piece(g, s, p => {
        p.ell(29, 41 + dy, 16.5, 10.2, FU[1]); p.ell(41, 37 + dy, 8.6, 10.6, FU[1]);
        p.shade(31, 38 + dy, 19, 13, FU);
        if (big) for (const [x, y] of [[22, 36], [30, 40], [16, 43], [35, 34]]) p.tw(x, y + dy, '#fff6b0');
      });
      // near legs
      piece(g, s, p => {
        p.ell(18, 46 + dy, 6.4, 7.6, FU[1]); p.stroke([[16.5, 50 + dy], [15.5, 57], [14.5, 61]], 3.4, 3, FU[1]); p.ell(15.5, 61.3, 4, 2, FU[1]);
        if (atk) { p.stroke([[38, 44 + dy], [46, 50], [53, 54]], 3.4, 3, FU[1]); p.ell(55, 55, 4.2, 2.2, FU[1], 0.3); }
        else { p.stroke([[38, 44], [37.5, 54], [37.5, 61]], 3.4, 3, FU[1]); p.ell(38.5, 61.3, 4, 2, FU[1]); }
        p.shade(28, 52, 22, 12, FU);
      });
      // chest ruff
      piece(g, s, p => { for (const [x, y, r] of [[45, 37, 5], [41.5, 42, 4.4], [46.5, 43, 3.6], [43, 46.5, 3]]) p.ell(x + hx * 0.3, y + dy, r, r * 1.05, RU[1]); p.shade(44, 40 + dy, 7, 9, RU); });
      // ears, head and muzzle
      const H = [47 + hx, 23 + hy];
      piece(g, s, p => {
        if (chg) { p.poly([[H[0] - 9, H[1] - 1], [H[0] - 12, H[1] - 12], [H[0] - 3.5, H[1] - 6.5]], FU[1]); p.poly([[H[0] - 3, H[1] - 7], [H[0] - 3.5, H[1] - 19], [H[0] + 3.5, H[1] - 8]], FU[1]); }
        else { p.poly([[H[0] - 7, H[1] - 5], [H[0] - 5.5, H[1] - 19], [H[0] + 0.5, H[1] - 8]], FU[1]); p.poly([[H[0] - 0.5, H[1] - 8], [H[0] + 4.5, H[1] - 20], [H[0] + 7, H[1] - 6]], FU[1]); }
        p.shade(H[0], H[1] - 10, 10, 10, FU);
        if (!chg) { p.on(H[0] - 4.6, H[1] - 11, 1.3, 3.6, EAR[1], -0.12); p.on(H[0] + 3.7, H[1] - 12, 1.3, 3.6, EAR[1], 0.35); }
      });
      piece(g, s, p => {
        p.ell(H[0], H[1], 9.4, 8.4, FU[1]); for (const [a, b] of [[-8.6, 3], [-9.4, -1], [-7.5, 6.4]]) p.ell(H[0] + a, H[1] + b, 2.4, 1.6, FU[1], 0.4);
        p.shade(H[0] - 0.5, H[1] - 0.5, 10.5, 9.5, FU);
      });
      piece(g, s, p => {
        if (chg) { p.ell(H[0] + 6, H[1] - 6.5, 6, 3.6, RU[1], -0.95); p.shade(H[0] + 6, H[1] - 6.5, 6.5, 4, RU, -0.95); p.ell(H[0] + 9.2, H[1] - 11.4, 1.7, 1.4, INK); }
        else { p.ell(H[0] + 8.5, H[1] + 4, 6, 3.7, RU[1], atk ? 0.25 : 0.05); p.shade(H[0] + 8.5, H[1] + 4, 6.5, 4, RU); p.ell(H[0] + 14, H[1] + (atk ? 4.5 : 2.6), 1.8, 1.4, INK); }
      });
      // the golden crescent on its brow (it glows when it howls)
      piece(g, s, p => {
        const cx = H[0] - 1.2, cy = H[1] - 5.5, r = chg ? 3.6 : 2.7;
        p.ellIf(cx, cy, r, r, MO[1], (u, v) => Math.hypot(u - cx - r * 0.55, v - cy + r * 0.35) > r * 0.86); p.shade(cx, cy, r + 0.5, r + 0.5, MO);
      });
      { const p = pen(g, s), ey = H[1] - (chg ? 1.5 : 0.5);
        if (f === 'blink' || chg) { eye(p, H[0] - 2.8, ey, 2.1, 2.6, '#fbf236', { shut: true }); eye(p, H[0] + 3.4, ey + 0.2, 1.8, 2.4, '#fbf236', { shut: true }); }
        else { const o = atk ? { brave: 1 } : {}; eye(p, H[0] - 2.8, ey, 2.1, 2.6, '#fbf236', o); eye(p, H[0] + 3.4, ey + 0.2, 1.8, 2.4, '#fbf236', o); }
        blush(p, H[0] - 5, ey + 4.6, 1.7, 0.85);
        if (chg) mouth(p, H[0] + 6.6, H[1] - 3.2, 1.6, 1.8, true);
        else if (atk) { mouth(p, H[0] + 9.5, H[1] + 7.6, 3, 2); p.poly([[H[0] + 7.6, H[1] + 7.4], [H[0] + 8.6, H[1] + 7.4], [H[0] + 8.1, H[1] + 9]], W); }
        else p.ink([[H[0] + 6.2, H[1] + 6.4], [H[0] + 8.6, H[1] + 7.1], [H[0] + 11.2, H[1] + 6.5]]);
        if (chg) for (const [x, y] of [[61, 6], [52, 2.5], [30, 6], [62, 16]]) p.tw(x, y, '#fff6b0', big);
      }
    },

    // ----- Crystal Tortoise, the Ancient Shell (stone + water): a big gentle tortoise whose shell grew sparkly crystals -----
    crystaltortoise(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const SK = RP('teal'), SKd = deeper(SK), SH = blend(RP('cocoa'), RP('slate')), SHd = deeper(SH), NAIL = RP('cream');
      const C1 = chg ? glowing(RP('aqua')) : RP('aqua'), C2 = chg ? glowing(RP('lilac')) : RP('lilac'), C3 = chg ? glowing(RP('rose')) : RP('rose');
      // far legs and tail
      piece(g, s, p => { p.ell(24, 56, 5.4, 6.8, SKd[1]); p.ell(43, 56, 5.4, 6.8, SKd[1]); p.poly([[11, 44], [2.5, 48.5], [11, 50.5]], SKd[1]); p.shade(26, 54, 22, 9, SKd); });
      // neck and head (behind the shell rim)
      const hx = atk ? 4 : 0, hy = atk ? 2 : chg ? -1 : 0;
      piece(g, s, p => {
        p.stroke([[48, 43], [53 + hx * 0.5, 39 + hy], [56 + hx, 35 + hy]], 4.6, 4.2, SK[1]); p.ell(57 + hx, 30 + hy, 7.2, 6.2, SK[1]);
        p.shade(55 + hx, 33 + hy, 9, 9, SK);
        if (big) for (const [x, y] of [[54, 38], [50.5, 41.5]]) p.line([[x - 1.5 + hx * 0.4, y + hy], [x + 1.5 + hx * 0.4, y - 1 + hy]], SK[2], true);
      });
      // the shell: a big dome with plates
      piece(g, s, p => {
        p.ellIf(30, 41, 24, 18, SH[1], (u, v) => v <= 45.5); p.shade(29, 37, 25, 18, SH);
        const plate = (x, y, rx, ry) => { p.on(x, y, rx, ry, SH[2]); p.on(x - 0.3, y - 0.3, rx - (big ? 0.7 : 1.1), ry - (big ? 0.7 : 1.1), SH[1]); p.on(x - rx * 0.25, y - ry * 0.3, rx * 0.45, ry * 0.35, SH[0]); };
        plate(30, 36, 6, 5); plate(18, 39, 4.6, 4.6); plate(42, 39, 4.6, 4.6); plate(24, 29.5, 4.4, 3.6); plate(36.5, 29.5, 4.4, 3.6); plate(11.5, 43, 3, 2.6); plate(48.5, 43, 3, 2.6);
      });
      piece(g, s, p => { p.ell(30, 46, 25.5, 3.6, SHd[1]); p.shade(30, 45.5, 25.5, 4.4, SHd); if (big) for (let x = 9; x < 52; x += 4.3) p.line([[x, 44.5], [x + 0.4, 47.6]], SHd[2], true); });
      // crystals growing from the shell (light facet left, dark facet right)
      const crystal = (x, yb, w, h, R, lean) => piece(g, s, p => {
        const tx = x + lean, ty = yb - h;
        p.poly([[x - w, yb], [x - w + lean * 0.65, yb - h * 0.68], [tx, ty], [x + w + lean * 0.65, yb - h * 0.68], [x + w, yb]], R[1]);
        p.poly([[x - w, yb], [x - w + lean * 0.65, yb - h * 0.68], [tx, ty], [x - w * 0.15 + lean * 0.7, yb - h * 0.62], [x - w * 0.2, yb]], R[0]);
        p.poly([[x + w * 0.45, yb], [x + w * 0.45 + lean * 0.7, yb - h * 0.64], [tx, ty], [x + w + lean * 0.65, yb - h * 0.68], [x + w, yb]], R[2]);
        if (big) p.line([[x - w * 0.6 + lean * 0.3, yb - h * 0.25], [x - w * 0.55 + lean * 0.55, yb - h * 0.55]], W, true);
      });
      crystal(15.5, 33, 2.4, 9, C3, -1.6); crystal(21, 28, 3.2, 14, C1, -1); crystal(27.5, 24.5, 3.6, 18, C2, 0); crystal(34, 25.5, 3, 14, C1, 1.2); crystal(39.5, 30, 2.6, 10, C3, 1.8);
      if (big) { crystal(24.5, 30, 1.8, 7, C2, -0.6); crystal(31.5, 29.5, 1.8, 6, C3, 0.5); }
      // near legs with cream toenails (the front one stomps when it charges)
      const fy = chg ? -5 : 0;
      piece(g, s, p => { p.ell(14, 56, 6, 7.2, SK[1]); p.ell(48, 56 + fy, 6.4, 7.2, SK[1]); p.shade(14, 54, 7, 9, SK); p.shade(48, 54 + fy, 7.5, 9, SK); });
      piece(g, s, p => { for (const [x, y] of [[10.6, 62], [14, 62.4], [17.4, 62]]) p.ell(x, y, 1.3, 0.9, NAIL[1]); for (const [x, y] of [[44.4, 62], [48, 62.4], [51.6, 62]]) p.ell(x, y + fy, 1.3, 0.9, NAIL[1]); });
      if (chg) piece(g, s, p => { for (const [x, d] of [[42, -1], [54, 1]]) p.poly([[x, 63], [x + d * 2.6, 58.5], [x + d * 1.4, 58.2], [x + d * 3.2, 54.5], [x + d * 0.4, 59], [x + d * 1.6, 59.3]], C1[0]); });
      // face: a kind, sleepy old face
      { const p = pen(g, s), ex = 58.5 + hx, ey = 29.5 + hy;
        if (f === 'blink' || chg) eye(p, ex, ey, 1.9, 2.3, '#5ee2f2', chg ? { happy: true } : { shut: true });
        else { eye(p, ex, ey, 1.9, 2.3, '#5ee2f2', atk ? { brave: 1 } : {}); if (!atk) p.ink([[ex - 2.1, ey - 1.6], [ex, ey - 2.3], [ex + 2.1, ey - 1.6]], 0.3); }
        blush(p, ex - 2.6, ey + 3.4, 1.6, 0.8);
        if (atk || chg) mouth(p, 61 + hx, 33.6 + hy, 1.7, 1.6, chg);
        else p.ink([[59.5 + hx, 33.4 + hy], [61.2 + hx, 34 + hy], [62.6 + hx, 33.2 + hy]]);
        if (big || chg) for (const [x, y] of chg ? [[10, 18], [28, 3], [44, 12], [37, 8]] : [[30, 9], [19, 17]]) p.tw(x, y, chg ? '#ccfcff' : '#f0e2ff', chg && big);
      }
    },

    // ----- Sun Lion, King of the Sun (light + fire): a golden lion whose mane is a ring of sun rays -----
    sunlion(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const GO = blend(RP('sun'), RP('tangerine')), GOd = deeper(GO), MA = chg ? glowing(RP('tangerine')) : RP('tangerine'), MB = chg ? glowing(RP('clay')) : RP('clay'), CR = RP('cream'), NOSE = '#a8653a';
      const lean = atk ? 3 : 0, hx = atk ? 3 : 0, hy = atk ? 2 : 0;
      // tail with a flame tuft (behind)
      piece(g, s, p => { p.stroke([[15, 41], [8, 37], [4.5, 29], [6, 22]], 1.6, 1.3, GO[1]); p.shade(8, 32, 6, 10, GO); });
      piece(g, s, p => { p.ell(6.5, 18.5, 3.6, 4.2, MA[1]); p.poly([[3.4, 17], [3.5, 11.5], [5.5, 14.5], [7, 10], [8.4, 14.2], [10, 12.5], [9.6, 18]], MA[1]); p.shade(6.5, 15.5, 5, 7, MA); p.on(6.8, 19, 1.8, 2.2, MA[0]); });
      // far legs (shade)
      piece(g, s, p => {
        p.stroke([[23, 48], [23, 55], [22.5, 61]], 3, 2.7, GOd[1]); p.ell(23.5, 61.4, 3.4, 1.8, GOd[1]);
        if (atk) { p.stroke([[42, 46], [49, 50], [56, 52]], 3, 2.7, GOd[1]); p.ell(57.5, 52.6, 3.2, 2, GOd[1], 0.4); }
        else { p.stroke([[43, 48], [44, 55], [44, 61]], 3, 2.7, GOd[1]); p.ell(45, 61.4, 3.4, 1.8, GOd[1]); }
        p.shade(34, 54, 22, 10, GOd);
      });
      // body
      piece(g, s, p => { p.ell(28.5, 42 + lean * 0.3, 16.5, 9.6, GO[1], atk ? -0.08 : 0); p.shade(28, 39, 18, 12, GO); p.on(30, 47.5 + lean * 0.3, 11, 3, mix(GO[0], CR[1], 0.5)); });
      // near legs with cream paws
      piece(g, s, p => {
        p.ell(18, 46, 6.4, 7.6, GO[1]); p.stroke([[16.5, 50], [15.5, 57], [15, 61]], 3.4, 3, GO[1]); p.ell(16, 61.4, 4, 2, CR[1]);
        if (atk) { p.stroke([[37, 45], [45, 48], [52, 47]], 3.4, 3, GO[1]); p.ell(54, 46.6, 3.6, 2.4, CR[1], -0.2); }
        else { p.stroke([[37.5, 45], [37.5, 54], [37.5, 61]], 3.4, 3, GO[1]); p.ell(38.5, 61.4, 4, 2, CR[1]); }
        p.shade(27, 50, 22, 13, GO);
      });
      // the sun-ray mane: two rings of rays round the head
      const M = [45.5 + hx, 23.5 + hy], RO = chg ? 21 : 18.5;
      piece(g, s, p => {
        p.poly(PX.starPts(M[0], M[1], RO, RO * 0.66, 12, -Math.PI / 2), MB[1]); p.shade(M[0], M[1], RO, RO, MB);
        p.poly(PX.starPts(M[0], M[1], RO * 0.86, RO * 0.6, 12, -Math.PI / 2 + Math.PI / 12), MA[1]); p.ell(M[0], M[1], RO * 0.66, RO * 0.66, MA[1]);
        p.shade(M[0], M[1], RO * 0.9, RO * 0.9, MA);
        if (big) for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + Math.PI / 12 + i * Math.PI / 6; p.line([[M[0] + Math.cos(a) * RO * 0.5, M[1] + Math.sin(a) * RO * 0.5], [M[0] + Math.cos(a) * RO * 0.72, M[1] + Math.sin(a) * RO * 0.72]], MA[0], true); }
      });
      // ears, head, muzzle
      piece(g, s, p => { p.ell(M[0] - 5, M[1] - 7.2, 2.6, 2.6, GO[1]); p.ell(M[0] + 5.4, M[1] - 7.4, 2.6, 2.6, GO[1]); p.shade(M[0], M[1] - 7, 8, 3.5, GO); p.on(M[0] - 5, M[1] - 7, 1.3, 1.3, CR[2]); p.on(M[0] + 5.4, M[1] - 7.2, 1.3, 1.3, CR[2]); });
      piece(g, s, p => { p.ell(M[0] + 1.5, M[1] + 0.5, 8.8, 8.2, GO[1]); p.shade(M[0] + 1, M[1], 9.5, 9, GO); });
      piece(g, s, p => { p.ell(M[0] + 8.4, M[1] + 4.6, 5.4, 3.9, CR[1]); p.shade(M[0] + 8.4, M[1] + 4.4, 6, 4.2, CR); });
      { const p = pen(g, s), ex = M[0], ey = M[1] - 0.6;
        p.poly([[ex + 10.5, ey + 2.6], [ex + 13.6, ey + 2.6], [ex + 12, ey + 4.6]], NOSE);
        if (f === 'blink' || chg) { eye(p, ex - 0.6, ey, 2, 2.6, '#ff9a22', chg ? { happy: true } : { shut: true }); eye(p, ex + 5.2, ey + 0.2, 1.8, 2.4, '#ff9a22', chg ? { happy: true } : { shut: true }); }
        else { const o = atk ? { brave: 1 } : {}; eye(p, ex - 0.6, ey, 2, 2.6, '#ff9a22', o); eye(p, ex + 5.2, ey + 0.2, 1.8, 2.4, '#ff9a22', o); }
        blush(p, ex - 3.2, ey + 4.3, 1.7, 0.85);
        if (atk || chg) mouth(p, ex + 10.2, ey + 7.2, chg ? 3 : 2.6, chg ? 2.6 : 2.1);
        else { p.ink([[ex + 12, ey + 4.6], [ex + 12, ey + 5.8]], 0.28); p.ink([[ex + 9.6, ey + 6.5], [ex + 12, ey + 5.8], [ex + 14, ey + 6.4]]); }
        if (big) for (const [x, y] of [[ex + 9, ey + 5.2], [ex + 10.2, ey + 6.2], [ex + 7.8, ey + 6.2]]) p.dot(x, y, CR[2]);
        if (chg) for (const [x, y] of [[20, 4], [62, 6], [62, 36], [24, 22]]) p.tw(x, y, '#fff27a', big);
      }
    },

    // ----- Star Serpent, the First Star (sky + light): a night-sky serpent coiled on itself, its neck rising to a face with the
    //       First Star on its brow; a thin line of starlight runs down its back -----
    starserpent(g, s, f) {
      const atk = f === 'attack', chg = f === 'charge', big = s >= 0.7;
      const BD = blend(RP('night'), RP('ocean')), BE = RP('lemon'), F1 = RP('aqua'), F2 = RP('lilac'), STAR = ['#fffcd0', '#fff27a', '#f6c83a'];
      const hx = atk ? 3 : 0, hy = atk ? 5 : chg ? 1 : 0, H = [44 + hx, 15.5 + hy];
      // the back of the coil (behind) rising into the neck; the front of the coil (in front) ending in the tail tip
      const back = [[9, 50], [16, 45.5], [28, 43.5], [40, 44], [49, 45.5], [54.5, 41], [55, 33], [50.5 + hx * 0.3, 26.5 + hy * 0.4], [44 + hx * 0.6, 22.5 + hy * 0.7], [41.5 + hx, 18.5 + hy]];
      const front = [[9, 50], [9.5, 56.5], [18, 61], [31, 62], [44, 60.5], [53, 57], [59, 52]];
      const L = list => list.map(q => [q[0] * s, q[1] * s]);
      const glowLine = (p, list, i0, i1) => { for (let i = i0 + 1; i <= i1; i++) p.line([list[i - 1], list[i]], BE[1], true); };
      // aurora fins along the back and up the neck (behind everything)
      piece(g, s, p => {
        const fins = [[15, 41.5, -2.2], [24, 39.5, -1.75], [33.5, 39.4, -1.55], [43, 40.2, -1.35], [59.5, 39, 0.1], [58.8, 31, -0.35], [54.5 + hx * 0.4, 23.5 + hy * 0.5, -0.75]];
        fins.forEach(([x, y, a], i) => p.ell(x, y, 3.3, 1.5, i % 2 ? F2[1] : F1[1], a));
        p.shade(38, 34, 24, 12, F1);
      });
      piece(g, s, p => { PX.stroke(p.t, L(back), 4.9 * s, 4.5 * s, BD[1]); p.shade(34, 34, 28, 18, BD); if (big) glowLine(p, back, 0, 8); });
      // horns, then the head with its snout
      piece(g, s, p => { p.poly([[H[0] - 4.5, H[1] - 3.5], [H[0] - 8, H[1] - 9.5], [H[0] - 2, H[1] - 5.5]], F2[1]); p.poly([[H[0] + 1, H[1] - 5], [H[0] + 1.5, H[1] - 11], [H[0] + 4.5, H[1] - 4.5]], F1[1]); p.shade(H[0] - 2, H[1] - 7, 7, 5, F2); });
      piece(g, s, p => {
        p.ell(H[0], H[1], 7.4, 6, BD[1]); p.ell(H[0] + 7.4, H[1] + 2.2, 5.4, 3.6, BD[1], atk ? 0.2 : 0.08);
        p.shade(H[0] + 2, H[1] - 0.5, 10, 7.5, BD); p.on(H[0] + 7.6, H[1] + 4.4, 4.6, 1.3, BE[1], 0.08);
      });
      // the front of the coil
      piece(g, s, p => {
        PX.stroke(p.t, L(front), 4.9 * s, 0.9 * s, BD[1]); p.shade(32, 52, 30, 12, BD);
        p.on(32, 62.5, 24, 2.2, mix(BD[0], BE[0], 0.5));
        if (big) glowLine(p, front, 0, 5);
      });
      // the First Star on its brow (it blazes when it charges)
      const r = chg ? 6 : 4.6, sx = H[0] - 2, sy = H[1] - 8.5 - (chg ? 1 : 0);
      piece(g, s, p => { p.poly(PX.starPts(sx, sy, r, r * 0.47, 5), STAR[1]); p.shade(sx, sy, r, r, STAR); p.on(sx - r * 0.12, sy - r * 0.04, r * 0.32, r * 0.32, W); });
      { const p = pen(g, s), ex = H[0] + 1, ey = H[1] - 0.6;
        // whiskers flowing from the snout
        if (big) { p.line([[H[0] + 11, H[1] + 3.8], [H[0] + 13.8, H[1] + 7], [H[0] + 15.2, H[1] + 11], [H[0] + 14, H[1] + 14.5]], BE[0]); p.line([[H[0] + 9.6, H[1] + 5], [H[0] + 10.6, H[1] + 8.8], [H[0] + 9.5, H[1] + 12]], BE[0]); }
        if (big) for (const [x, y] of [[13, 54.5], [26, 59.5], [39, 59], [50.5, 54.5], [21.5, 44], [37, 44.3], [53, 37]]) p.tw(x, y, '#cbdbfc');
        if (f === 'blink' || chg) eye(p, ex, ey, 1.9, 2.3, '#fbf236', chg ? { happy: true } : { shut: true });
        else eye(p, ex, ey, 1.9, 2.3, '#fbf236', atk ? { brave: 1 } : {});
        blush(p, ex - 2.4, ey + 3.6, 1.6, 0.8);
        if (atk) mouth(p, H[0] + 9.4, H[1] + 5.4, 3, 1.9); else if (chg) mouth(p, H[0] + 9, H[1] + 4.6, 1.4, 1.5, true);
        else p.ink([[H[0] + 6.5, H[1] + 4.5], [H[0] + 9, H[1] + 5.1], [H[0] + 11.8, H[1] + 4.3]]);
        if (chg) for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4 + Math.PI / 8, d = a % 2 ? 9.5 : 8.5; p.tw(sx + Math.cos(t) * d, Math.max(1.5, sy + Math.sin(t) * d * 0.9), '#fff27a', big && a % 2 === 0); }
        else if (big) { p.tw(sx + 7.5, sy + 0.5, '#fff6b0'); p.tw(sx - 7, sy + 2.5, '#fff6b0'); }
      }
    },
  };

  // ---------------- PX.legend ----------------
  const FRAMES = ['idle', 'blink', 'attack', 'charge'];
  PX.LEGEND_IDS = Object.keys(ART);
  PX.LEGEND_FRAMES = FRAMES.slice();
  const cache = new Map(); // id|frame|box -> canvas (bounded: the oldest go first)

  // The family's refined Legend art: img/legends/<id>.png, cut from their AI-refined sheets (pocket-sprout/_slice.html) and sized so
  // a battle (box 78 = 156 fine px) draws it 1:1. Once a picture has loaded, PX.legend draws it for every frame and size; until
  // then, or in Node (tools/check_game.js), the code art below stands in (the original six fall back to their rare-creature art).
  const IMG_IDS = ['golem', 'yeti', 'griffin', 'dinosaur', 'kraken', 'phoenix', 'dragon', 'stormwhale', 'moonwolf', 'crystaltortoise', 'sunlion', 'starserpent'];
  const FACES_LEFT = { crystaltortoise: 1, sunlion: 1, starserpent: 1 }; // (mirrored so every Legend faces right, like the code art)
  const IMG = {};
  if (typeof window.Image === 'function') for (const id of IMG_IDS) {
    const im = new window.Image();
    im.onload = () => { IMG[id] = im; for (const k of [...cache.keys()]) if (k.startsWith(id + '|')) cache.delete(k); };
    im.src = 'img/legends/' + id + '.png';
  }
  PX.LEGEND_IMG_IDS = IMG_IDS.slice();
  PX.legendHasImage = id => IMG_IDS.includes(id);
  function pictureLegend(im, id, f, b) {
    const c = document.createElement('canvas'), F = b * 2; c.width = F; c.height = F; c.k = 2; // (b art px at 2 fine px each)
    const x = c.getContext('2d'), s = Math.min(1, F / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
    x.imageSmoothingEnabled = s < 1; x.imageSmoothingQuality = 'high';
    const X = Math.round((F - w) / 2), Y = F - h; // centred, standing on the bottom edge (where the battle puts the ground)
    if (FACES_LEFT[id]) { x.save(); x.translate(F, 0); x.scale(-1, 1); x.drawImage(im, F - X - w, Y, w, h); x.restore(); } else x.drawImage(im, X, Y, w, h);
    if (f === 'charge') { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255, 236, 160, 0.28)'; x.fillRect(0, 0, F, F); x.globalCompositeOperation = 'source-over'; } // (powering up: a warm glow)
    return c;
  }
  PX.legend = function (id, frame, box) {
    const im = IMG[id];
    if (!ART[id] && !im) return null;
    if ((!im && !PX.Grid) || typeof document === 'undefined') return null;
    const f = FRAMES.includes(frame) ? frame : 'idle', b = Math.max(16, Math.min(160, Math.round(box || 78))), key = id + '|' + f + '|' + b;
    if (cache.has(key)) return cache.get(key);
    if (im) { let pc = null; try { pc = pictureLegend(im, id, f, b); } catch (e) { pc = null; } if (pc) { if (cache.size >= 40) cache.delete(cache.keys().next().value); cache.set(key, pc); return pc; } }
    const fn = ART[id]; if (!fn) return null;
    let c = null;
    try {
      const g = new PX.Grid(b, b); g.dither = false;
      fn(g, b / 64, f);
      if (PX.hd) PX.hd(g); else if (g.outerLine) g.outerLine();
      c = g.canvas();
    } catch (e) { console.error('PX.legend', id, f, e); return null; }
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    cache.set(key, c);
    return c;
  };
})();
