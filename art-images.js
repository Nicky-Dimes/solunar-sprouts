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
(function () {
  'use strict';
  if (!window.PX || typeof window.Image !== 'function' || typeof document === 'undefined') return;
  const D = window.PSDATA || {};
  const PROPS = ['tree', 'bigtree', 'bush', 'flowerbed', 'mushrooms', 'shroomhouse', 'stump', 'fern', 'palm', 'beachhut', 'crystalcave', 'gingerhouse', 'lollitree', 'lamp', 'fence', 'rock'];
  const PLANTY = { tree: 1, bigtree: 1, bush: 1, flowerbed: 1, fern: 1 }; // (recoloured by theme in pixel.js)
  const LIST = {
    critters: Object.keys(D.ANIMALS || {}).concat(Object.keys(D.RARES || {})),
    eggs: Object.keys(D.EGGS || {}), fruit: Object.keys(D.FRUITS || {}), props: PROPS,
    trophies: (PX.TROPHY_IDS || []).slice(), raid: ['blob', 'bat', 'wisp', 'brute', 'king', 'owl'],
  };
  const IMG = {}, made = new Map(); // 'kind/id' -> Image (once loaded); key -> canvas (bounded below)
  const drop = pre => { for (const k of [...made.keys()]) if (k.startsWith(pre)) made.delete(k); };
  for (const [kind, ids] of Object.entries(LIST)) for (const id of ids) {
    const im = new window.Image(), key = kind + '/' + id;
    im.onload = () => { IMG[key] = im; drop(key + '|'); };
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
    if (opt.tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = opt.tint; x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over'; }
    return c;
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
    const base = item0(type, id), folder = type === 'egg' ? 'eggs' : type === 'fruit' ? 'fruit' : null, im = folder && IMG[folder + '/' + id];
    if (!im || !base) return base;
    const key = folder + '/' + id + '|'; if (made.has(key)) return made.get(key);
    let c = null; try { c = fitted(base, im, 1, { middle: type === 'fruit' }); } catch (e) { c = null; }
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
  PX.hasPicture = (kind, id) => !!IMG[kind + '/' + id];
})();
