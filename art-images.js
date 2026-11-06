// art-images.js — Solunar Sprouts: the family's refined art (img/<kind>/<id>.png, cut from their AI-refined sheets by the dev page
// pocket-sprout/_slice.html; Legends live in art-legends.js). Once a picture has loaded, the matching PX function draws it, fitted
// into the same canvas and the same spot today's code art fills (its visible box, feet on the same row), so every screen's
// layout, hitboxes, anchors and animations work unchanged. Until a picture loads, or in Node (tools/check_game.js), the code art
// stays. Sprouts are still drawn by pixel.js (they mix colours, parts and hats).
//
//   critters  PX.critter(kind, frame), PX.critterSwim(kind, frame), PX.critterPicture(kind, S) (S x bigger, for battles)
//   eggs      PX.item('egg', kind)          fruit   PX.item('fruit', kind)
//   props     PX.prop(kind, theme)          (green plants only for the 'day' theme: night and candy plants keep their own colours)
//   trophies  PX.trophy(id, scale, { dim }) raid    PX.raid.unit(kind, pose), PX.raid.owl(pose)
//   hats      PX.sprig(look, pose) wearing a hat or extra (see 'hats on Sprouts'), PX.item('hat', id) (closet icons)
//   PX.picture(kind, id) -> the loaded Image (or null): art-sprouts-hd.js puts the hat pictures on its smooth Sprouts
// HD (opt-in, the same switch as art-sprouts-hd.js: localStorage['solunar:hd'] === '1' or hd=1 in the address): every fitted
// picture also gets the "blend" pass below (smooth inside, solid edges, the game's dark outline), so it sits with the smooth
// Sprouts. Off (the default), pictures are drawn exactly as before.
(function () {
  'use strict';
  if (!window.PX || typeof window.Image !== 'function' || typeof document === 'undefined') return;
  const HD = (() => { try { if (/[?&]hd=1(?:&|$)/.test(location.search || '')) return true; return localStorage.getItem('solunar:hd') === '1'; } catch (e) { return false; } })();
  const D = window.PSDATA || {};
  const PROPS = ['tree', 'bigtree', 'bush', 'flowerbed', 'mushrooms', 'shroomhouse', 'stump', 'fern', 'palm', 'beachhut', 'crystalcave', 'gingerhouse', 'lollitree', 'lamp', 'fence', 'rock', 'holidaytree', 'gift', 'giftblue', 'giftpink', 'snowman', 'snowtree'];
  const PLANTY = { tree: 1, bigtree: 1, bush: 1, flowerbed: 1, fern: 1 }; // (recoloured by theme in pixel.js)
  const LIST = {
    critters: Object.keys(D.ANIMALS || {}).concat(Object.keys(D.RARES || {})),
    eggs: Object.keys(D.EGGS || {}), fruit: Object.keys(D.FRUITS || {}), props: PROPS,
    trophies: (PX.TROPHY_IDS || []).slice(), raid: ['blob', 'bat', 'wisp', 'brute', 'king', 'owl'], hats: Object.keys(D.HATS || {}),
  };
  const IMG = {}, made = new Map(); // 'kind/id' -> Image (once loaded); key -> canvas (bounded below)
  const drop = pre => { for (const k of [...made.keys()]) if (k.startsWith(pre)) made.delete(k); };
  for (const [kind, ids] of Object.entries(LIST)) for (const id of ids) {
    const im = new window.Image(), key = kind + '/' + id;
    im.onload = () => { IMG[key] = im; drop(key + '|'); if (kind === 'hats') drop('sprig|'); };
    im.src = 'img/' + key + '.png';
  }
  const remember = (key, c) => { if (made.size > 600) made.delete(made.keys().next().value); made.set(key, c); return c; };

  // the visible box of a canvas (fine pixels): where today's art actually sits inside its canvas
  const boxes = new WeakMap();
  function visibleBox(c) {
    if (boxes.has(c)) return boxes.get(c);
    let b = { x0: 0, y0: 0, x1: c.width - 1, y1: c.height - 1 };
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) b = { x0, y0, x1, y1 };
    } catch (e) { /* keep the whole canvas */ }
    boxes.set(c, b); return b;
  }
  // a canvas the size of `base` with the picture fitted into base's visible box (scaled by S), standing on its bottom edge
  function fitted(base, im, S, opt) {
    S = S || 1; opt = opt || {};
    const c = document.createElement('canvas'); c.width = base.width * S; c.height = base.height * S; if (base.k) c.k = base.k;
    const x = c.getContext('2d'), b = visibleBox(base), bw = (b.x1 - b.x0 + 1) * S, bh = (b.y1 - b.y0 + 1) * S;
    const grow = opt.grow || 1, s = Math.min(bw * grow / im.naturalWidth, bh * grow / im.naturalHeight), w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
    const cx = (b.x0 + b.x1 + 1) / 2 * S, X = Math.round(cx - w / 2 + (opt.dx || 0) * S), Y = opt.middle ? Math.round((b.y0 + b.y1 + 1) / 2 * S - h / 2) : (b.y1 + 1) * S - h + Math.round((opt.dy || 0) * S);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (opt.squash) { x.save(); x.translate(X + w / 2, Y + h); x.scale(1 + opt.squash, 1 - opt.squash); x.drawImage(im, -w / 2, -h, w, h); x.restore(); }
    else x.drawImage(im, X, Y, w, h);
    let out = c;
    if (HD) { try { out = blendPass(c); } catch (e) { out = c; } }
    if (opt.tint) { const ox = out.getContext('2d'); ox.globalCompositeOperation = 'source-atop'; ox.fillStyle = opt.tint; ox.fillRect(0, 0, out.width, out.height); ox.globalCompositeOperation = 'source-over'; }
    return out;
  }
  // The "blend" pass (HD only; the approved prototype is outlineOnly() in _blend-sample.html): the picture stays smooth inside, its
  // soft edge becomes solid, colours get a slight saturation lift, and the game's dark outline (2 fine px of ink #222034) goes round
  // the silhouette. The picture first shrinks just enough to leave 2 fine px free at the top and sides (it keeps standing on the
  // bottom), so the outline never has to overwrite a picture that touches the edge (the owl's ears).
  const INK3 = [34, 32, 52];
  function blendPass(src, opt) {
    opt = opt || {}; const W = src.width, H = src.height, c = document.createElement('canvas'); c.width = W; c.height = H; if (src.k) c.k = src.k;
    const x = c.getContext('2d'), P = 2, s = Math.min((W - 2 * P) / W, (H - P) / H);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, Math.round((W - W * s) / 2), Math.round(H - H * s), Math.round(W * s), Math.round(H * s));
    const img = x.getImageData(0, 0, W, H), d = img.data, on = new Uint8Array(W * H), sat = opt.sat || 1.12, con = opt.con || 1.06;
    for (let i = 0; i < W * H; i++) on[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    for (let i = 0; i < W * H; i++) {
      if (!on[i]) { d[i * 4 + 3] = 0; continue; }
      const a = d[i * 4 + 3] / 255; let r = d[i * 4] / a, g = d[i * 4 + 1] / a, b = d[i * 4 + 2] / a; // (undo the soft edge's fade)
      const m = (r + g + b) / 3;
      r = (m + (r - m) * sat - 128) * con + 128; g = (m + (g - m) * sat - 128) * con + 128; b = (m + (b - m) * sat - 128) * con + 128;
      d[i * 4] = Math.max(0, Math.min(255, r)); d[i * 4 + 1] = Math.max(0, Math.min(255, g)); d[i * 4 + 2] = Math.max(0, Math.min(255, b)); d[i * 4 + 3] = 255;
    }
    // the outline: the picture's outermost ring of pixels becomes ink, then one more ring of ink goes round it
    for (let i = 0; i < W * H; i++) { if (!on[i]) continue; const X = i % W, Y = (i / W) | 0; if (X === 0 || Y === 0 || X === W - 1 || Y === H - 1 || !on[i - 1] || !on[i + 1] || !on[i - W] || !on[i + W]) { d[i * 4] = INK3[0]; d[i * 4 + 1] = INK3[1]; d[i * 4 + 2] = INK3[2]; } }
    for (let i = 0; i < W * H; i++) { if (on[i]) continue; const X = i % W, Y = (i / W) | 0; if ((X > 0 && on[i - 1]) || (X < W - 1 && on[i + 1]) || (Y > 0 && on[i - W]) || (Y < H - 1 && on[i + W])) { d[i * 4] = INK3[0]; d[i * 4 + 1] = INK3[1]; d[i * 4 + 2] = INK3[2]; d[i * 4 + 3] = 255; } }
    x.putImageData(img, 0, 0); return c;
  }

  // ---------------- critters ----------------
  const critter0 = PX.critter;
  if (critter0) {
    PX.critter = function (kind, frame) {
      const base = critter0(kind, frame), im = IMG['critters/' + kind]; if (!im || !base) return base;
      const key = 'critters/' + kind + '|' + (frame | 0); if (made.has(key)) return made.get(key);
      let c = null; try { c = fitted(base, im, 1, { dy: frame === 1 || frame === 3 ? -0.5 : 0 }); } catch (e) { c = null; } // (a little bob on a plant's sway frames)
      return c ? remember(key, c) : base;
    };
    // the same picture S x bigger, drawn from the full-size picture (sharp in battles) instead of enlarging the small one
    PX.critterPicture = function (kind, S, frame) {
      const im = IMG['critters/' + kind]; if (!im) return null; const base = critter0(kind, frame); if (!base) return null;
      const key = 'critters/' + kind + '|big' + S + ':' + (frame | 0); if (made.has(key)) return made.get(key);
      let c = null; try { c = fitted(base, im, S, { dy: frame === 1 || frame === 3 ? -0.5 : 0 }); } catch (e) { c = null; }
      return c ? remember(key, c) : null;
    };
  }
  const swim0 = PX.critterSwim;
  if (swim0) {
    // a swimmer cut at the waterline (same recipe as pixel.js critterSwim, on the picture)
    PX.critterSwim = function (kind, frame) {
      if (!IMG['critters/' + kind]) return swim0(kind, frame);
      const key = 'critters/' + kind + '|swim' + (frame | 0); if (made.has(key)) return made.get(key);
      try {
        const c = PX.critter(kind, frame), K = c.k || 1, w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
        let top = h, bot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { top = Math.min(top, y); bot = Math.max(bot, y); }
        const cut = Math.max(top + 3 * K, Math.round((top + (bot - top) * 0.62) / K) * K); let x0 = w, x1 = 0;
        for (let y = cut - 2 * K; y < cut; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        const o = document.createElement('canvas'); o.width = w; o.height = cut + 2 * K; if (c.k) o.k = c.k; const x = o.getContext('2d'); x.drawImage(c, 0, 0, w, cut, 0, 0, w, cut);
        x.fillStyle = '#ffffff'; for (let i = Math.max(0, x0 - 2 * K); i <= Math.min(w - 1, x1 + 2 * K); i++) if ((i - x0 + 40) % 7 !== 6) x.fillRect(i, cut, 1, 1);
        x.fillStyle = '#cbe8ff'; for (let i = Math.max(0, x0 - K); i <= Math.min(w - 1, x1 + K); i++) x.fillRect(i, cut + 1, 1, 1);
        x.fillStyle = '#9fd8ff'; for (let i = Math.max(0, x0); i <= Math.min(w - 1, x1); i++) if ((i - x0) % 6 < 4) x.fillRect(i, cut + 2, 1, K > 1 ? K : 1);
        return remember(key, o);
      } catch (e) { return swim0(kind, frame); }
    };
  }

  // ---------------- eggs and fruit ----------------
  const item0 = PX.item;
  if (item0) PX.item = function (type, id) {
    const base = item0(type, id), folder = type === 'egg' ? 'eggs' : type === 'fruit' ? 'fruit' : type === 'hat' ? 'hats' : null, im = folder && IMG[folder + '/' + id];
    if (!im || !base) return base;
    const key = folder + '/' + id + '|'; if (made.has(key)) return made.get(key);
    let c = null; try { c = fitted(base, im, 1, { middle: type !== 'egg' }); } catch (e) { c = null; }
    return c ? remember(key, c) : base;
  };

  // ---------------- garden props ----------------
  const prop0 = PX.prop;
  if (prop0) PX.prop = function (kind, theme) {
    const base = prop0(kind, theme), im = IMG['props/' + kind], th = theme || 'day';
    if (!im || !base || (PLANTY[kind] && th !== 'day')) return base;
    const key = 'props/' + kind + '|' + th; if (made.has(key)) return made.get(key);
    let c = null; try { c = fitted(base, im, 1); } catch (e) { c = null; }
    return c ? remember(key, c) : base;
  };

  // ---------------- trophies ----------------
  const trophy0 = PX.trophy;
  if (trophy0) PX.trophy = function (id, scale, o) {
    const base = trophy0(id, scale, o), im = IMG['trophies/' + id], dim = !!(o && o.dim);
    if (!im || !base) return base;
    const key = 'trophies/' + id + '|' + (scale || 1) + (dim ? 'd' : ''); if (made.has(key)) return made.get(key);
    let c = null; try { c = fitted(trophy0(id, scale, null) || base, im, 1, dim ? { tint: 'rgba(92, 70, 52, 0.9)' } : null); } catch (e) { c = null; } // (not won yet: a soft silhouette)
    return c ? remember(key, c) : base;
  };

  // ---------------- night raid shadows ----------------
  const R = PX.raid;
  if (R && R.unit) {
    const unit0 = R.unit.bind(R), owl0 = R.owl ? R.owl.bind(R) : null;
    const POSE = { idle: {}, walk0: { squash: 0.04 }, walk1: { dy: -1 }, attack: { dx: 1.5, squash: -0.05 }, hurt: { tint: 'rgba(255, 255, 255, 0.45)' } };
    R.unit = function (kind, pose) {
      const base = unit0(kind, pose), im = IMG['raid/' + kind]; if (!im || !base) return base;
      const p = POSE[pose] ? pose : 'idle', key = 'raid/' + kind + '|' + p; if (made.has(key)) return made.get(key);
      let c = null; try { c = fitted(unit0(kind, 'idle') || base, im, 1, POSE[p]); } catch (e) { c = null; } // (fitted to the idle pose's box: poses only move it)
      return c ? remember(key, c) : base;
    };
    if (owl0) R.owl = function (pose) {
      const base = owl0(pose), im = IMG['raid/owl']; if (!im || !base) return base;
      const p = pose === 'fly1' ? 'fly1' : 'fly0', key = 'raid/owl|' + p; if (made.has(key)) return made.get(key);
      let c = null; try { c = fitted(owl0('fly0') || base, im, 1, p === 'fly1' ? { squash: -0.06, dy: 1 } : null); } catch (e) { c = null; } // (wings down: a little lower and taller)
      return c ? remember(key, c) : base;
    };
  }
  // ---------------- hats on Sprouts ----------------
  // A Sprout wearing a hat (or an extra) whose picture has loaded: today's Sprout is drawn as usual, the code hat's pixels are found
  // by drawing the same Sprout without it, those pixels go back to what is under the hat, and the picture is fitted into the code
  // hat's box. The box comes from the real drawing each time, so it follows every colour, stage, pose, part and flower.
  // (This pixel-diff swap only suits pixel Sprouts: with HD on, art-sprouts-hd.js replaces PX.sprig after this and never calls it;
  // it draws the hat pictures on its smooth Sprouts itself, from PX.picture.)
  const sprig0 = PX.sprig;
  const HIDES = { beanie: 1, tophat: 1, wizard: 1, sunhat: 1, cap: 1, witch: 1, propeller: 1 }; // (hats that hide the leaves: pixel.js HIDES_LEAVES)
  const data = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  if (sprig0) PX.sprig = function (L, P) {
    const base = sprig0(L, P); if (!L || !base) return base;
    const slots = ['hat', 'extra'].filter(sl => L[sl] && L[sl] !== 'none' && IMG['hats/' + L[sl]]); if (!slots.length) return base;
    const key = 'sprig|' + JSON.stringify(L) + '|' + JSON.stringify(P || {}); if (made.has(key)) return made.get(key);
    try {
      const W = base.width, H = base.height, o = document.createElement('canvas'); o.width = W; o.height = H; if (base.k) o.k = base.k;
      const x = o.getContext('2d'); x.drawImage(base, 0, 0);
      const img = x.getImageData(0, 0, W, H), od = img.data, db = data(base), put = [];
      for (const sl of slots) {
        const id = L[sl], bareL = Object.assign({}, L, { [sl]: 'none' }), bare = sprig0(bareL, P), dn = data(bare);
        let leaf = null; // (a hat that hides the leaves: what is under it is leaves, which stay hidden)
        if (sl === 'hat' && HIDES[id]) { const alt = sprig0(Object.assign({}, bareL, { leaf: L.leaf === 'rose' ? 'sky' : 'rose' }), P), da = data(alt); leaf = i => da[i] !== dn[i] || da[i + 1] !== dn[i + 1] || da[i + 2] !== dn[i + 2]; }
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let i = 0, p = 0; p < W * H; p++, i += 4) {
          if (!db[i + 3] || (db[i] === dn[i] && db[i + 1] === dn[i + 1] && db[i + 2] === dn[i + 2] && db[i + 3] === dn[i + 3])) continue;
          const px = p % W, py = (p / W) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
          if (leaf && leaf(i)) { od[i + 3] = 0; continue; }
          od[i] = dn[i]; od[i + 1] = dn[i + 1]; od[i + 2] = dn[i + 2]; od[i + 3] = dn[i + 3];
        }
        if (x1 >= 0) put.push({ im: IMG['hats/' + id], x0, y0, x1, y1 });
      }
      x.putImageData(img, 0, 0);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      for (const q of put) { // the picture, fitted into the code hat's box (a touch bigger, so no old edge peeks out), sitting on its bottom
        const bw = q.x1 - q.x0 + 1, bh = q.y1 - q.y0 + 1, s = Math.min(bw * 1.06 / q.im.naturalWidth, bh * 1.06 / q.im.naturalHeight), w = Math.round(q.im.naturalWidth * s), h = Math.round(q.im.naturalHeight * s);
        x.drawImage(q.im, Math.round((q.x0 + q.x1 + 1) / 2 - w / 2), q.y1 + 1 - h, w, h);
      }
      return remember(key, o);
    } catch (e) { return base; }
  };
  PX.hasPicture = (kind, id) => !!IMG[kind + '/' + id];
  PX.picture = (kind, id) => IMG[kind + '/' + id] || null;
})();
