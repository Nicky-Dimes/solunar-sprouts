// race.js — Solunar Sprouts Race screen: race hub (5 series x 3 tiers), the race itself, and results.
// Scene contract: PS.scenes.race = { mount(root), show(params), hide(), frame(dt, t) }.
// The race engine evolves prototypes/3-race.html: 4 stacked lanes, camera follows the player, run/swim/climb/fly
// segments (a climb is always followed by a downhill glide), stamina + tired state, and the Cheer Ring timing tap.
// Only rewards come from PS.state.finishRace (called exactly once per race).
(function () {
  'use strict';
  const D = PS.D, ST = PS.state;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ORD = ['1st', '2nd', '3rd', '4th'];
  const SEGS = ['run', 'swim', 'climb', 'fly'];
  const SEG_META = {
    run: { label: 'Run', color: '#6abe30' }, swim: { label: 'Swim', color: '#639bff' },
    climb: { label: 'Climb', color: '#a0a6ba' }, fly: { label: 'Glide', color: '#c9a2f0' },
  };
  const INK = '#222034';

  // =====================================================================
  // TUNING — every race-feel number lives here (economy lives in data.js / state.js).
  // =====================================================================
  const TUNING = {
    base: { run: 38, swim: 28, climb: 16, fly: 46 },       // world px/s at multiplier 1
    speedLo: 0.55, speedK: 0.09, speedMin: 0.5, speedMax: 2.2, // mult = clamp(lo + k * rating)
    stamBase: 50, stamPer: 8,                               // max stamina = stamBase + stamPer * staminaRating
    drain: { run: 2.9, swim: 4.4, climb: 5.2, fly: 1.0 },   // stamina per second
    tired: { mul: 0.55, regen: 9, until: 0.3 },             // tired speed mult; regen/s; recover at 30 % of max
    ring: { every: [3.5, 5], first: 2.2, r0: 28, target: 13, shrink: 13, endR: 6, perfect: 1.6, good: 4.5 },
    perfect: { mul: 1.45, t: 2.8, stam: 12 },
    good: { mul: 1.25, t: 2.0, stam: 6 },
    miss: { mul: 0.45, t: 0.5 },
    // Course length: an evenly matched race (player ≈ tier's mid rival rating) lasts about
    // targetSec * (series.length / 1100) ^ targetExp seconds. Mix weights are shares of that time.
    targetSec: 41, targetExp: 0.9,
    minRunSec: 1.4,
    finishJog: 16,
  };
  const T = TUNING;
  const mulOf = rating => clamp(T.speedLo + T.speedK * rating, T.speedMin, T.speedMax);

  // ---------------- small helpers ----------------
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(n) { n = (n | 0) * 374761393; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ramp = body => (PX.RAMPS[body] || PX.RAMPS.mint);
  const nightAmt = () => { try { return PS.clock.night(); } catch (e) { return 0; } };
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function safeProp(kind, theme) { try { return PX.prop ? PX.prop(kind, theme) : null; } catch (e) { return null; } }
  function safeItem(kind, id) {
    try { if (PX.item) return PX.item(kind, id); } catch (e) { /* fall through */ }
    return kind === 'egg' ? safeProp('egg') : null;
  }
  const sprigAX = () => (PX.SPRIG_AX == null ? 16 : PX.SPRIG_AX);
  const sprigAY = () => (PX.SPRIG_AY == null ? 31 : PX.SPRIG_AY);
  function sprig(look, pose) { return PX.sprig(look, pose || {}); }

  // =====================================================================
  // Themes (per series area). Colours are DawnBringer-ish to match pixel.js.
  // =====================================================================
  const TH = {
    meadow: { prop: 'day', sky: ['#8ecff4', '#a0d7f6', '#b3e0f8', '#c8e9f9'], far: 'hills', farC: ['#86c08e', '#b2dfb0'], nearC: ['#5fa060', '#8fcf86'],
      top: ['#99e550', '#6abe30', '#6abe30', '#37946e'], soil: '#b8743a', soilDot: '#8f563b', tuft: '#6abe30', dots: ['#f7b6c8', '#fbf236'],
      water: ['#cbdbfc', '#639bff', '#3f55b8', '#9fd8ff'], rock: ['#8c93a8', '#6b7088', '#b7c2cc', '#dfe8fb', '#8f974a'],
      cloud: ['#b9cde8', '#ffffff', '#e6effc'], puff: ['#ffffff', '#dcecfa'],
      props: [['bush', 4], ['flowerbed', 2], ['rock', 2], ['tree', 1]] },
    beach: { prop: 'day', sky: ['#5cc0ee', '#7acdf2', '#98daf5', '#b9e8f9'], far: 'sea', farC: ['#2f9fd0', '#4fb8e0', '#e6fbff'], nearC: ['#e6fbff', '#5cc8ea'],
      top: ['#fff3d6', '#f6dcb0', '#f6dcb0', '#e8c48e'], soil: '#e8c48e', soilDot: '#d9a066', tuft: null, dots: ['#ffffff', '#f7b6c8'],
      water: ['#e6fbff', '#2fb3d6', '#1f7fae', '#9ff0ff'], rock: ['#d9a066', '#b8743a', '#eec39a', '#fbe7c2', '#6abe30'],
      cloud: ['#b9cde8', '#ffffff', '#e6effc'], puff: ['#ffffff', '#e0f4fc'],
      props: [['palm', 3], ['umbrella', 2], ['sandcastle', 2], ['shells', 2], ['rock', 1]] },
    moonlit: { prop: 'night', dark: true, sky: ['#1c1f4a', '#252a5e', '#303875', '#3d468e'], far: 'peaks', farC: ['#181a42', '#22265a'], nearC: ['#1d3550', '#27496a'],
      top: ['#7fe0c0', '#2f8078', '#2f8078', '#1f5452'], soil: '#3a2f5c', soilDot: '#2a2248', tuft: '#52c7a8', dots: ['#c9a2f0', '#9fd8ff'],
      water: ['#c9a2f0', '#3f3f9e', '#2c2c66', '#9fd8ff'], rock: ['#595a70', '#3f3f5a', '#8c93a8', '#b7c2cc', '#52c7a8'],
      cloud: ['#5e5aa0', '#8c86d0', '#4a4a8a'], puff: null,
      props: [['glowshroom', 4, 1], ['crystal', 2, 1], ['lantern', 1, 1], ['bush', 2]] },
    candy: { prop: 'candy', sky: ['#ffbfe0', '#ffcde8', '#ffdcef', '#ffebf6'], far: 'gumdrops', farC: ['#f08cbc', '#c9a2f0'], nearC: ['#52c7a8', '#a6f2d3'],
      top: ['#ffffff', '#ffc3dc', '#ffc3dc', '#f08cbc'], soil: '#c48a5c', soilDot: '#8f563b', tuft: null, dots: ['#fbf236', '#639bff', '#99e550', '#ffffff'], sprinkles: true,
      water: ['#fff6d8', '#7fe0c8', '#3fae9a', '#ffffff'], rock: ['#e07ba0', '#a2477a', '#f7b6c8', '#fff0f6', '#ffffff'], stripes: true,
      cloud: ['#e79ad0', '#ffe3f5', '#ffc9ec'], puff: ['#ffffff', '#ffe0f0'],
      props: [['lollitree', 3], ['candycane', 3], ['gumdrops', 3], ['cupcake', 1]] },
  };
  const GRAND_ZONES = ['meadow', 'beach', 'moonlit', 'candy'];

  // =====================================================================
  // Course: generated from the series mix + length, seeded by series & tier.
  // =====================================================================
  function buildCourse(ri, tier) {
    const R = D.RACES[ri], Tr = D.RACE_TIERS[tier], rng = mulberry(9001 + ri * 131 + tier * 17);
    const mix = R.mix, W = SEGS.reduce((a, k) => a + (mix[k] || 0), 0) || 1;
    const m = mulOf((Tr.rating[0] + Tr.rating[1]) / 2);
    const dur = T.targetSec * Math.pow(R.length / 1100, T.targetExp);
    const time = k => dur * (mix[k] || 0) / W;
    let nS = mix.swim ? clamp(Math.round(time('swim') / 6), 1, 5) : 0;
    let nC = (mix.climb || mix.fly) ? clamp(Math.round((time('climb') + time('fly')) / 9), 1, 4) : 0;
    while (nS + nC > 1 && time('run') / (nS + nC + 1) < T.minRunSec) { if (nS >= nC) nS--; else nC--; }
    const blocks = [];
    for (let i = 0; i < nS; i++) blocks.push('swim');
    for (let i = 0; i < nC; i++) blocks.push('cf');
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    for (let pass = 0; pass < 4; pass++) for (let i = 1; i < blocks.length; i++) if (blocks[i] === blocks[i - 1]) {
      const j = blocks.findIndex((b, k) => b !== blocks[i] && k !== i - 1 && (k === 0 || blocks[k - 1] !== blocks[i]) && (k + 1 >= blocks.length || blocks[k + 1] !== blocks[i]));
      if (j >= 0) [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
    const split = (total, n, jit, ends) => {
      if (!n) return [];
      const w = []; for (let i = 0; i < n; i++) w.push(1 - jit + 2 * jit * rng());
      if (ends && n > 1) { w[0] *= 1.35; w[n - 1] *= 1.2; }
      const s = w.reduce((a, b) => a + b, 0); return w.map(v => total * v / s);
    };
    const runs = split(time('run'), blocks.length + 1, 0.35, true);
    const swims = split(time('swim'), nS, 0.25), climbs = split(time('climb') || 1.5, nC, 0.25), flys = split(time('fly') || 1.5, nC, 0.25);
    const MIN = { run: 34, swim: 50, climb: 26, fly: 60 };
    const segs = []; let x = 0, si = 0, ci = 0;
    const push = (type, sec) => { const len = Math.max(MIN[type], Math.round(sec * T.base[type] * m)); segs.push({ type, x0: x, x1: x + len, len }); x += len; };
    push('run', runs[0]);
    blocks.forEach((b, i) => {
      if (b === 'swim') push('swim', swims[si++]);
      else { push('climb', climbs[ci]); push('fly', flys[ci]); ci++; }
      push('run', runs[i + 1]);
    });
    const LEN = x;
    // theme zones
    let zones;
    if (R.id === 'grand') {
      const bounds = [];
      for (let k = 1; k < 4; k++) {
        const want = LEN * k / 4; let best = null;
        for (const s of segs) if (s.type === 'run' && s.x0 > 0) { const mid = Math.round((s.x0 + s.x1) / 2); if (!best || Math.abs(mid - want) < Math.abs(best - want)) best = mid; }
        bounds.push(best == null ? Math.round(want) : best);
      }
      zones = GRAND_ZONES.map((th, k) => ({ th, x0: k ? bounds[k - 1] : -1e9, x1: k < 3 ? bounds[k] : 1e9 }));
    } else zones = [{ th: R.area in TH ? R.area : 'meadow', x0: -1e9, x1: 1e9 }];
    const C = { ri, tier, R, segs, LEN, zones, decor: [] };
    C.after = { type: 'run', x0: LEN, x1: 1e9, len: 1e9, after: true };
    // decor in run stretches (and a little before the start line)
    const drng = mulberry(77 + ri * 1009 + tier * 7);
    const places = [{ x0: -120, x1: -8 }].concat(segs.filter(s => s.type === 'run').map(s => ({ x0: s.x0 + 10, x1: s.x1 - 10 })), [{ x0: LEN + 30, x1: LEN + 200 }]);
    for (const p of places) {
      let px = p.x0 + Math.floor(drng() * 18);
      while (px < p.x1) {
        if (Math.abs(px - LEN) > 16 && Math.abs(px) > 10) {
          const th = TH[themeAt(C, px)], tot = th.props.reduce((a, q) => a + q[1], 0);
          let r = drng() * tot, pick = th.props[0];
          for (const q of th.props) { r -= q[1]; if (r <= 0) { pick = q; break; } }
          C.decor.push({ x: px, kind: pick[0], glow: !!pick[2], th: themeAt(C, px), flip: drng() < 0.4 });
        }
        px += 34 + Math.floor(drng() * 46);
      }
    }
    return C;
  }
  function themeAt(C, x) { const z = C.zones; for (let i = 0; i < z.length; i++) if (x < z[i].x1) return z[i].th; return z[z.length - 1].th; }
  // background theme for the view: crossfades near a zone edge (Grand Prix)
  function viewTheme(C, x) {
    const z = C.zones; if (z.length === 1) return { a: z[0].th, b: null, k: 0 };
    const F = 60;
    for (let i = 0; i < z.length - 1; i++) {
      const e = z[i].x1;
      if (x < e - F) return { a: z[i].th, b: null, k: 0 };
      if (x < e + F) return { a: z[i].th, b: z[i + 1].th, k: (x - (e - F)) / (2 * F) };
    }
    return { a: z[z.length - 1].th, b: null, k: 0 };
  }
  function segAtC(C, x) { if (x < 0) return C.segs[0]; const s = C.segs; for (let i = 0; i < s.length; i++) if (x < s[i].x1) return s[i]; return C.after; }

  // =====================================================================
  // Racers & simulation (pure: also used headless for balance checks)
  // =====================================================================
  function makeRacer(d) {
    const sm = T.stamBase + T.stamPer * d.stamR;
    const mul = {}; for (const k of SEGS) mul[k] = mulOf(d.rating[k]);
    return { name: d.name, look: d.look, rating: d.rating, mul, isPlayer: !!d.isPlayer, cheer: d.cheer || null,
      color: ramp(d.look && d.look.body)[1], x: 0, si: 0, stam: sm, stamMax: sm, tired: false, boostT: 0, boostMul: 1, stumbleT: 0,
      finished: false, time: 0, projTime: 0, nextBoost: rnd(1.5, 3.5), emote: null, emoteT: 0, animT: Math.random() * 3,
      prevType: 'run', lane: 0, tiredCount: 0, cheers: { perfect: 0, good: 0, miss: 0 } };
  }
  function segOf(C, r) {
    if (r.x < 0) return C.segs[0];
    while (r.si < C.segs.length && r.x >= C.segs[r.si].x1) r.si++;
    return r.si < C.segs.length ? C.segs[r.si] : C.after;
  }
  function curSpeed(C, r) {
    if (r.finished) return r.x < C.LEN + T.finishJog ? 20 : 0;
    const seg = segOf(C, r);
    let v = T.base[seg.type] * r.mul[seg.type];
    if (r.tired) v *= T.tired.mul; if (r.boostT > 0) v *= r.boostMul; if (r.stumbleT > 0) v *= T.miss.mul;
    return v;
  }
  function setEmote(r, k, t) { r.emote = k; r.emoteT = t; }
  function applyCheer(r, kind, ctx) {
    r.cheers[kind]++;
    if (kind === 'miss') { r.stumbleT = T.miss.t; if (ctx.fx) setEmote(r, '?', 0.9); return; }
    const c = T[kind];
    r.boostMul = Math.max(r.boostT > 0 ? r.boostMul : 1, c.mul); r.boostT = Math.max(r.boostT, c.t);
    r.stam = Math.min(r.stamMax, r.stam + c.stam);
    if (kind === 'perfect' && r.tired) { r.tired = false; r.stam = Math.max(r.stam, 16); }
    if (r.emote === 'swirl' && !r.tired) r.emote = null;
    if (ctx.fx) {
      if (r.isPlayer) setEmote(r, kind === 'perfect' ? 'sparkle' : 'heart', 0.8);
      else if (kind === 'perfect') setEmote(r, '!', 0.6);
      burst(r, kind === 'perfect' ? 7 : 3);
    }
  }
  function stepRacer(r, dt, ctx) {
    const C = ctx.C;
    r.animT += dt;
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) r.emote = r.tired ? 'swirl' : null; }
    if (r.finished) { r.x = Math.min(C.LEN + T.finishJog, r.x + 20 * dt); return; }
    const seg = segOf(C, r);
    if (seg.type !== r.prevType) { if (ctx.fx) onSegEnter(r, seg); r.prevType = seg.type; }
    const v = curSpeed(C, r);
    r.boostT = Math.max(0, r.boostT - dt); r.stumbleT = Math.max(0, r.stumbleT - dt);
    if (r.tired) {
      r.stam += T.tired.regen * dt;
      if (r.stam >= r.stamMax * T.tired.until) { r.tired = false; if (r.emote === 'swirl') r.emote = null; }
    } else {
      r.stam -= T.drain[seg.type] * dt;
      if (r.stam <= 0) { r.stam = 0; r.tired = true; r.tiredCount++; r.emote = 'swirl'; r.emoteT = 0; if (ctx.fx && r.isPlayer) PX.Sound.play('miss'); }
    }
    if (r.cheer) {
      r.nextBoost -= dt;
      if (r.nextBoost <= 0) {
        r.nextBoost = rnd(T.ring.every[0], T.ring.every[1]);
        const u = ctx.rng(), c = r.cheer;
        const kind = u < c.p ? 'perfect' : u < c.p + c.g ? 'good' : u < c.p + c.g + c.m ? 'miss' : null;
        if (kind) applyCheer(r, kind, ctx);
      }
    }
    const nx = r.x + v * dt;
    if (nx >= C.LEN) { r.time = ctx.t - dt + dt * (C.LEN - r.x) / (nx - r.x); r.finished = true; r.x = nx; ctx.onFinish && ctx.onFinish(r); }
    else r.x = nx;
  }
  const finalTime = r => (r.finished ? r.time : r.projTime || 999);
  const cheerOf = arr => ({ p: arr[0], g: arr[1], m: arr[2] });
  function playerRatings(s) { const o = {}; for (const k of SEGS) o[k] = ST.raceRating(s, k); return o; }
  function rivalRacers(id, tier) {
    return ST.raceRivals(id, tier).map(rv => makeRacer({ name: rv.name, look: rv.look, rating: rv.rating, stamR: rv.rating.stamina, cheer: cheerOf(rv.cheer || D.RACE_TIERS[tier].cheerSkill) }));
  }
  // Headless race. who = {rating, stamR} ; skill = [perfect, good, miss] chance per ring for the player.
  function simRace(who, ri, tier, skill) {
    const R = D.RACES[ri], C = buildCourse(ri, tier);
    const pl = makeRacer({ name: 'You', look: PX.DEFAULT_LOOK, rating: who.rating, stamR: who.stamR, isPlayer: true, cheer: cheerOf(skill) });
    pl.nextBoost = T.ring.first + 1;
    const all = [pl].concat(rivalRacers(R.id, tier));
    const ctx = { C, t: 0, rng: Math.random, fx: false }, dt = 1 / 60;
    while (all.some(r => !r.finished) && ctx.t < 400) { ctx.t += dt; for (const r of all) stepRacer(r, dt, ctx); }
    const order = all.slice().sort((a, b) => a.time - b.time);
    return { place: order.indexOf(pl), time: pl.time, tired: pl.tiredCount, winner: order[0].time, order: order.map(r => r.name + ' ' + r.time.toFixed(1)) };
  }
  function simMany(who, ri, tier, skill, n) {
    n = n || 200; let win = 0, t = 0, tired = 0, top2 = 0, wt = 0;
    for (let i = 0; i < n; i++) { const s = simRace(who, ri, tier, skill); if (s.place === 0) win++; if (s.place < 2) top2++; t += s.time; wt += s.winner; tired += s.tired; }
    return { win: +(win / n).toFixed(2), top2: +(top2 / n).toFixed(2), avgTime: +(t / n).toFixed(1), winnerTime: +(wt / n).toFixed(1), tiredPerRace: +(tired / n).toFixed(2) };
  }
  const flat = (v, st) => ({ rating: { run: v, swim: v, climb: v, fly: v }, stamR: st == null ? v : st });

  // =====================================================================
  // DOM + CSS
  // =====================================================================
  const CSS = `
  .r-root{position:absolute;inset:0}
  .r-hub{position:absolute;inset:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:12px 12px 22px}
  .r-head{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:2px 4px 10px}
  .r-head h2{font-size:28px;margin:2px 0 0;color:var(--ink)}
  .r-head .r-count{font-family:var(--f-px);font-weight:600;font-size:13px;color:var(--ink-soft);background:var(--slot);border:2px solid var(--line);border-radius:10px;padding:3px 9px;white-space:nowrap}
  .r-partner{display:grid;grid-template-columns:80px 1fr;gap:10px;align-items:center;padding:10px 12px 10px 10px;margin-bottom:14px}
  .r-partner .r-pc{width:80px;height:80px;background:var(--slot);border-radius:16px;box-shadow:inset 0 -3px 0 var(--line)}
  .r-ptop{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .r-pname{font-family:var(--f-px);font-weight:700;font-size:21px;line-height:1;color:var(--ink)}
  .r-pform{font-size:13px;color:var(--ink-soft);margin:2px 0 7px;line-height:1.2}
  .r-change{min-height:44px;font-size:15px;padding:6px 12px}
  .r-rates{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
  .r-rate{background:var(--field);border:2px solid var(--line);border-radius:9px;padding:2px 0 1px;text-align:center;line-height:1.05}
  .r-rate small{display:block;font-family:var(--f-px);font-weight:600;font-size:10px;letter-spacing:.04em;color:var(--ink-soft);text-transform:uppercase}
  .r-rate b{font-family:var(--f-ui);font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
  .r-card{margin-bottom:14px;overflow:hidden}
  .r-banner{position:relative;background:var(--slot);border-bottom:3px solid var(--line);line-height:0;overflow:hidden}
  .r-banner canvas{display:block;margin:0 auto}
  .r-card.locked .r-banner canvas{filter:grayscale(.75) brightness(.95);opacity:.75}
  .r-num{position:absolute;left:10px;top:8px;font-family:var(--f-px);font-weight:700;font-size:12px;line-height:1;background:var(--panel);border:2px solid var(--edge);border-radius:8px;padding:3px 7px;color:var(--ink)}
  .r-lockchip{position:absolute;right:10px;top:8px;display:flex;align-items:center;gap:5px;font-family:var(--f-px);font-weight:600;font-size:12px;line-height:1;background:var(--ink);color:var(--panel);border-radius:8px;padding:4px 8px}
  .r-body{padding:10px 12px 12px}
  .r-title{font-family:var(--f-px);font-weight:700;font-size:23px;line-height:1.05;color:var(--ink)}
  .r-sub{font-size:13px;color:var(--ink-soft);margin:2px 0 8px;line-height:1.3}
  .r-mixbar{display:flex;height:8px;border-radius:5px;overflow:hidden;border:2px solid var(--line);margin-bottom:6px}
  .r-mixbar i{display:block;height:100%}
  .r-mix{display:flex;flex-wrap:wrap;gap:5px}
  .r-mixchip{display:inline-flex;align-items:center;gap:4px;font-family:var(--f-px);font-weight:600;font-size:12px;background:var(--slot);border-radius:8px;padding:2px 8px 2px 4px;color:var(--ink)}
  .r-mixchip canvas{width:18px;height:18px}
  .r-mixchip span{color:var(--ink-soft);font-weight:500}
  .r-tiers{display:grid;gap:7px;margin-top:10px}
  .r-tier{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;min-height:58px;width:100%;text-align:left;background:var(--field);
    border:2px solid var(--line);border-bottom-width:5px;border-radius:15px;padding:6px 10px 6px 12px;color:var(--ink)}
  .r-tier:not([disabled]):active{transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
  .r-tier:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
  .r-tier[disabled]{background:var(--slot);border-style:dashed;border-bottom-width:2px;cursor:default;margin-bottom:3px}
  .r-tier[disabled] .r-tname,.r-tier[disabled] .r-prize{opacity:.55}
  .r-tname{font-family:var(--f-px);font-weight:700;font-size:18px;line-height:1.05;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .r-tsub{font-size:12px;color:var(--ink-soft);line-height:1.3;margin-top:2px}
  .r-tsub b{color:var(--ink);font-weight:600}
  .r-match{font-family:var(--f-px);font-weight:600;font-size:11px;letter-spacing:.03em;border-radius:7px;padding:2px 6px;color:#fff;line-height:1.2}
  .r-right{display:flex;align-items:center;gap:8px}
  .r-prize{display:flex;align-items:center;gap:4px;font-family:var(--f-ui);font-weight:700;font-size:16px;font-variant-numeric:tabular-nums}
  .r-prize canvas{width:18px;height:18px}
  .r-eggic{display:grid;place-items:center;width:30px;height:34px;background:#fff1b8;border:2px solid var(--sun-edge);border-radius:9px}
  .r-eggic canvas{width:20px;height:24px}
  .r-go{font-family:var(--f-px);font-weight:700;font-size:15px;background:var(--accent);color:#fff;border-radius:10px;padding:8px 10px;box-shadow:inset 0 -3px 0 var(--accent-edge)}
  .r-lock{width:26px;height:26px;display:grid;place-items:center}
  .r-lock canvas{width:22px;height:22px}
  .r-empty{text-align:center;padding:22px 18px;margin-top:20px}
  .r-empty canvas{width:96px;height:96px;display:block;margin:0 auto 6px}
  .r-empty h3{font-family:var(--f-px);font-size:22px;margin:0 0 6px}
  .r-empty p{margin:0 0 14px;color:var(--ink-soft)}
  .r-foot{font-size:12px;color:var(--ink-soft);text-align:center;margin:4px 12px 0;line-height:1.4}

  .r-race{position:absolute;inset:0;display:flex;flex-direction:column;background:${INK}}
  .r-hud{flex:none;display:grid;grid-template-columns:auto 1fr auto;gap:5px 10px;align-items:center;
    padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px 12px;background:var(--panel);border-bottom:4px solid var(--edge);position:relative;z-index:2}
  .r-place{grid-row:span 2;font-family:var(--f-px);font-weight:700;font-size:30px;line-height:1;min-width:62px;text-align:center;
    background:var(--sun);border:2px solid var(--sun-edge);border-bottom-width:5px;border-radius:14px;padding:6px 8px 4px;color:#4a3210}
  .r-place small{font-size:15px;margin-left:1px}
  .r-track{position:relative;height:22px}
  .r-rail{position:absolute;left:6px;right:22px;top:7px;height:8px;border:2px solid var(--line);border-radius:5px;overflow:hidden;display:flex;background:var(--slot)}
  .r-rail i{display:block;height:100%;opacity:.8}
  .r-dots{position:absolute;left:6px;right:22px;top:0;height:22px}
  .r-dot{position:absolute;top:5px;width:12px;height:12px;margin-left:-6px;border:2px solid ${INK};border-radius:3px}
  .r-dot.me{top:2px;width:16px;height:18px;margin-left:-8px;border-radius:4px;z-index:2;box-shadow:0 0 0 2px var(--sun)}
  .r-flag{position:absolute;right:0;top:-1px;width:20px;height:24px}
  .r-hrow{display:flex;align-items:center;gap:8px}
  .r-hrow .bar{flex:1;height:12px}
  .r-hrow .bar i{transition:none;background:#6abe30}
  .r-hrow .num{min-width:50px;text-align:right;font-size:16px}
  .r-quit{grid-row:span 2;width:44px;height:44px;padding:0;display:grid;place-items:center;font-size:20px;border-radius:12px}
  .r-stage{flex:1;min-height:0;position:relative;touch-action:none;overflow:hidden}
  .r-cv{position:absolute;left:0;top:0;display:block;touch-action:none}
  .r-hint{bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:3}
  .r-skip{position:absolute;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:3;min-height:46px}
  .r-ov{z-index:40}
  .r-ov .card{max-height:calc(100% - 8px);overflow-y:auto;touch-action:pan-y;padding:16px 16px 14px}
  .r-ov .card h1{font-size:28px;margin:4px 0 4px}
  .r-rows{display:grid;gap:4px;margin:6px 0 10px}
  .r-row{display:grid;grid-template-columns:34px 38px 1fr auto;align-items:center;gap:8px;background:var(--slot);border-radius:12px;padding:1px 12px 1px 8px;min-height:42px}
  .r-row.me{background:#fff1b8;box-shadow:inset 0 0 0 2px var(--sun-edge)}
  .r-row .pl{font-family:var(--f-px);font-weight:700;font-size:17px;text-align:center}
  .r-row canvas{width:38px;height:38px}
  .r-row .nm{font-family:var(--f-px);font-weight:600;font-size:16px;line-height:1.1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .r-row .nm small{display:block;white-space:nowrap;font-family:var(--f-ui);font-size:11px;color:var(--ink-soft);font-weight:500}
  .r-row .num{font-size:15px}
  .r-rew{background:#eaf6df;border:2px dashed #9fcf8a;border-radius:14px;padding:9px 10px;margin:0 0 10px;display:grid;gap:7px}
  .r-coins{display:flex;align-items:center;justify-content:center;gap:7px;font-family:var(--f-px);font-weight:700;font-size:20px;color:var(--ink)}
  .r-coins canvas{width:22px;height:22px}
  .r-xp{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}
  .r-xpchip{font-family:var(--f-px);font-weight:600;font-size:12px;border-radius:8px;padding:3px 8px;color:#fff;line-height:1.2}
  .r-xpchip b{background:#fff27a;color:#4a3210;border-radius:5px;padding:0 4px;margin-left:4px}
  .r-eggbox{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center;background:#fff1b8;border:2px solid var(--sun-edge);border-radius:14px;padding:8px 10px;margin:0 0 10px}
  .r-eggbox canvas{width:40px;height:48px}
  .r-eggbox b{font-family:var(--f-px);font-size:17px;display:block;line-height:1.1}
  .r-eggbox span{font-size:13px;color:var(--ink-soft)}
  .r-note{font-size:13px;color:var(--ink-soft);margin:0 0 10px;text-align:center;line-height:1.35}
  .r-note b{color:var(--accent)}
  .r-btns{display:grid;grid-template-columns:1fr 1.3fr;gap:10px}
  .r-btns .btn{min-height:52px}
  .r-btns.stack{grid-template-columns:1fr;gap:8px}
  .r-ov p{text-wrap:pretty}
  `;
  function injectCSS() {
    if (document.getElementById('r-style')) return;
    const st = document.createElement('style'); st.id = 'r-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  // ---------------- tiny pixel icons ----------------
  const ICO = {};
  function icon(kind) {
    if (ICO[kind]) return ICO[kind];
    const G = PX.Grid; let g;
    switch (kind) {
      case 'run': g = PX.fromStrings(['.........', '.gg..gg..', '..gg..gg.', '...gg..gg', '..gg..gg.', '.gg..gg..', '.........'], { g: '#6abe30' }); g.outline(); break;
      case 'swim': g = PX.fromStrings(['.........', '..bb...bb', '.b..b.b..', 'b....b...', '.........', '..bb...bb', '.b..b.b..', 'b....b...'], { b: '#639bff' }); break;
      case 'climb': g = new G(11, 10); g.poly([[0.5, 9.5], [5.5, 1], [10.5, 9.5]], '#8c93a8'); g.poly([[3.6, 4.4], [5.5, 1], [7.4, 4.4]], '#ffffff'); g.outline(); break;
      case 'fly': g = new G(11, 9); g.ell(5.5, 5, 4.6, 2.4, PX.RAMPS.plum, -0.35); g.ell(3.5, 3.4, 2.4, 1.6, '#ffffff', -0.35); g.outline(); break;
      case 'lock': g = new G(11, 12); g.rect(2, 5, 7, 6, '#f6c83a'); g.rect(3, 1, 1, 4, '#8c93a8'); g.rect(7, 1, 1, 4, '#8c93a8'); g.rect(4, 0, 3, 1, '#8c93a8'); g.outline(); g.px([[5, 7], [5, 8]], '#8a5a14'); break;
      case 'flag':
        g = new G(10, 12); g.rect(1, 1, 1, 10, '#eec39a');
        for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) g.rect(2 + x * 2, 1 + y * 2, 2, 2, (x + y) % 2 ? '#3f3f74' : '#ffffff');
        g.outline(); break;
      case 'bigflag':
        g = new G(14, 26); g.rect(2, 3, 1, 22, '#eec39a'); g.ell(2.5, 2.5, 1.3, 1.3, '#f6c83a');
        for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) g.rect(3 + x * 2, 4 + y * 2, 2, 2, (x + y) % 2 ? '#3f3f74' : '#ffffff');
        g.outline(); break;
      case 'coin': { const c = safeItem('coin'); if (c) return (ICO[kind] = c); g = new G(9, 9); g.ell(4.5, 4.5, 4, 4, PX.RAMPS.sun); break; }
      default: g = new G(4, 4);
    }
    return (ICO[kind] = g.canvas());
  }
  function puffs(th) {
    const key = 'puff:' + th; if (ICO[key]) return ICO[key];
    const p = TH[th].puff; if (!p) return (ICO[key] = []);
    const m = { w: p[0], W: p[1] };
    return (ICO[key] = [
      PX.fromStrings(['...wwww....', '.wwwwwwww..', 'wwwwwwwwwww', '.WWWWWWWWW.'], m).canvas(),
      PX.fromStrings(['..www..', 'wwwwwww', '.WWWWW.'], m).canvas(),
      PX.fromStrings(['.....www.......', '..wwwwwwwww....', '.wwwwwwwwwwwww.', 'wwwwwwwwwwwwwww', '.WWWWWWWWWWWWW.'], m).canvas(),
    ]);
  }
  function paintTo(cv, src, w, h) {
    cv.width = w || src.width; cv.height = h || src.height;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(src, Math.floor((cv.width - src.width) / 2), Math.floor((cv.height - src.height) / 2));
  }
  // a sprout sprite fitted into a small square canvas (canvas can be taller for flower heads)
  function spriteBox(cv, look, pose, size) {
    const src = sprig(look, pose); size = size || 36;
    cv.width = size; cv.height = size + Math.max(0, src.height - 32);
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    PX.blit(x, src, size / 2, cv.height - 2, false, sprigAX(), sprigAY());
  }

  // =====================================================================
  // World drawing (shared by the race view and the hub banners)
  // V = { g, W, H, GY, CH, C, camX, t, night }
  // =====================================================================
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function elevAt(V, x) {
    const s = segAtC(V.C, x);
    if (s.type === 'climb') return Math.round(V.CH * clamp((x - s.x0) / s.len, 0, 1));
    if (s.type === 'fly') return Math.round(V.CH * (1 - clamp((x - s.x0) / s.len, 0, 1)));
    return 0;
  }
  const SINK = 5;
  function sinkAt(V, x) { const s = segAtC(V.C, x); if (s.type !== 'swim') return 0; return Math.round(Math.min(SINK, (x - s.x0) * 0.5, (s.x1 - x) * 0.5)); }

  function drawSky(V, th, key, starA) {
    const { g, W, GY, camX, t } = V;
    const bandH = Math.ceil((GY + 6) / 4);
    for (let i = 0; i < 4; i++) px(g, 0, i * bandH, W, bandH, th.sky[i]);
    // stars (always in the Moonlit Grove; fade in at night elsewhere)
    const sa = th.dark ? 1 : starA;
    if (sa > 0.05) {
      const s0 = Math.floor(camX * 0.05); g.globalAlpha *= sa;
      for (let sx = 0; sx < W; sx++) { const h = hash(sx + s0 + 999); if (h % (th.dark ? 8 : 13) === 0) { const y = (h >> 6) % Math.max(4, GY - 12); px(g, sx, y, 1, 1, (h >> 3) % 5 === 0 ? '#fff27a' : '#ffffff'); if ((h >> 9) % 7 === 0 && ((t * 2 + sx) | 0) % 3 === 0) { px(g, sx - 1, y, 1, 1, '#9fd8ff'); px(g, sx + 1, y, 1, 1, '#9fd8ff'); } } }
      g.globalAlpha /= sa;
    }
    if (th.dark) { // moon
      const mx = W - 18 - Math.floor(camX * 0.02) % 6, my = 5;
      g.fillStyle = '#fbf3dc'; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) g.fillRect(mx + x, my + y, 1, 1);
      g.fillStyle = th.sky[0]; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if ((x - 2) * (x - 2) + (y + 1) * (y + 1) <= 10) g.fillRect(mx + x, my + y, 1, 1);
    }
    // clouds (parallax .15)
    const pf = puffs(key);
    if (pf.length) {
      const cx0 = Math.floor(camX * 0.15);
      for (let k = Math.floor((cx0 - 40) / 70); k <= Math.floor((cx0 + W + 20) / 70); k++) {
        const h = hash(k + 11), spr = pf[h % 3];
        g.drawImage(spr, k * 70 + (h % 30) - cx0, 2 + ((h >> 4) % Math.max(2, Math.min(7, GY - 20))));
      }
    }
    // far + near layers
    const hA = Math.floor(camX * 0.3), hB = Math.floor(camX * 0.55);
    const fc = th.farC, nc = th.nearC;
    const small = GY < 30 ? 0.6 : 1;
    for (let sx = 0; sx < W; sx++) {
      const a = sx + hA, b = sx + hB;
      if (th.far === 'hills') {
        const hh = Math.round((8 + 3 * Math.sin(a * 0.07) + 2 * Math.sin(a * 0.19 + 1.3)) * small);
        px(g, sx, GY - hh, 1, 1, '#6aa878'); px(g, sx, GY - hh + 1, 1, hh, fc[1]);
      } else if (th.far === 'sea') {
        const hz = GY - Math.round(8 * small);
        px(g, sx, hz, 1, GY - hz, fc[0]); px(g, sx, hz, 1, 1, fc[2]);
        if (hash(a * 3 + Math.floor(t * 2)) % 11 === 0) px(g, sx, hz + 2 + hash(a) % 4, 1, 1, fc[2]);
        const isl = ((a % 150) + 150) % 150; if (isl > 20 && isl < 44) { const ih = Math.round(Math.sqrt(144 - (isl - 32) * (isl - 32)) / 3); if (ih > 0) px(g, sx, hz - ih, 1, ih, fc[1]); }
      } else if (th.far === 'peaks') {
        const tri = v => Math.abs(((v % 2) + 2) % 2 - 1);
        const hh = Math.round((6 + 9 * tri(a / 23) + 3 * tri(a / 9 + 0.3)) * small);
        px(g, sx, GY - hh, 1, 1, '#5a5ab8'); px(g, sx, GY - hh + 1, 1, hh, fc[0]);
      } else if (th.far === 'gumdrops') {
        const P = 26, k = Math.floor(a / P), d = a - k * P - P / 2, r = 9 + hash(k) % 4;
        const hh = Math.round(Math.sqrt(Math.max(0, r * r - d * d)) * small * 0.9);
        if (hh > 0) { const col = fc[hash(k) % 2]; px(g, sx, GY - hh, 1, 1, '#ffffff'); px(g, sx, GY - hh + 1, 1, hh, col); if (hh > 3 && Math.abs(d) < 2) px(g, sx, GY - hh + 2, 1, 1, '#ffffff'); }
      }
      const h2 = Math.round((3 + 2 * Math.sin(b * 0.11 + 0.5) + 1.5 * Math.sin(b * 0.27)) * small);
      if (h2 > 0) { px(g, sx, GY - h2, 1, 1, nc[0]); px(g, sx, GY - h2 + 1, 1, h2, nc[1]); }
    }
  }

  function drawGround(V) {
    const { g, W, H, GY, CH, C, camX, t } = V;
    for (let sx = 0; sx < W; sx++) {
      const wx = camX + sx, s = segAtC(C, wx), hs = hash(wx), th = TH[themeAt(C, wx)];
      if (s.type === 'climb') {
        const R = th.rock, e = Math.round(CH * clamp((wx - s.x0 + 1) / s.len, 0, 1)), top = GY - e;
        px(g, sx, top, 1, H - top, R[0]);
        for (let y = top + 1; y < H; y++) {
          if (th.stripes) { if (((wx + y) >> 1) % 4 === 0) px(g, sx, y, 1, 1, R[4]); else if (((wx + y) >> 1) % 4 === 1) px(g, sx, y, 1, 1, R[2]); continue; }
          const bx = (wx + (((y - GY) >> 2) & 1) * 3);
          if ((y - GY) % 4 === 3 || bx % 6 === 0) px(g, sx, y, 1, 1, R[1]);
          else if (bx % 6 === 1 && (y - GY) % 4 === 0) px(g, sx, y, 1, 1, R[2]);
        }
        px(g, sx, top, 1, 1, R[3]); px(g, sx, top - 1, 1, 1, INK);
        if (hs % 9 === 0 && e > 1) px(g, sx, top - 1, 1, 1, R[4]);
        if (wx === s.x1 - 1) px(g, sx, top - 1, 1, H - top + 1, INK);
      } else if (s.type === 'fly') {
        const c = th.cloud, ct = GY + 2 + Math.round(1.2 * Math.sin(wx * 0.33) + Math.sin(wx * 0.13 + t * 0.8));
        px(g, sx, ct - 1, 1, 1, c[0]); px(g, sx, ct, 1, 1, c[1]); px(g, sx, ct + 1, 1, H - ct, c[2]);
        if (hs % 5 === 0) px(g, sx, ct + 2, 1, 1, c[1]);
        if (wx === s.x1 - 1) px(g, sx, GY - 1, 1, H - GY + 1, INK);
      } else if (s.type === 'swim') {
        const w = th.water;
        px(g, sx, GY + 1, 1, 1, w[0]); px(g, sx, GY + 2, 1, H - GY - 4, w[1]); px(g, sx, H - 2, 1, 2, w[2]);
        if (wx === s.x0 || wx === s.x1 - 1) px(g, sx, GY, 1, H - GY, INK);
      } else {
        const tp = th.top;
        px(g, sx, GY, 1, 1, tp[0]); px(g, sx, GY + 1, 1, 2, tp[1]); px(g, sx, GY + 3, 1, 1, tp[3]);
        px(g, sx, GY + 4, 1, H - GY - 4, th.soil);
        if (th.sprinkles) { if (hs % 4 === 0) px(g, sx, GY + 5 + (hs >> 3) % Math.max(1, H - GY - 6), 1, 1, th.dots[(hs >> 5) % th.dots.length]); if (hs % 3 === 0) px(g, sx, GY + 3, 1, 1, tp[0]); }
        else if (hs % 5 === 0) px(g, sx, GY + 4 + (hs >> 3) % 2, 1, 1, th.soilDot);
        if (th.tuft && hs % 7 === 0) px(g, sx, GY - 1, 1, 1, th.tuft);
        if (hs % 31 === 0) { if (th.tuft) px(g, sx, GY - 1, 1, 1, th.top[3]); px(g, sx, GY - (th.tuft ? 2 : 1), 1, 1, th.dots[(hs >> 5) % 2]); }
        if (wx === 0) px(g, sx, GY, 1, 4, '#ffffff');
        if (wx === C.LEN || wx === C.LEN + 1) for (let y = 0; y < 4; y++) px(g, sx, GY + y, 1, 1, ((wx + y) & 1) ? INK : '#ffffff');
      }
    }
  }
  function drawProps(V, glow) {
    const { g, W, GY, C, camX } = V;
    for (const d of C.decor) {
      if (d.glow !== glow) continue;
      const sx = d.x - camX; if (sx < -30 || sx > W + 30) continue;
      const spr = safeProp(d.kind, TH[d.th].prop); if (!spr || spr.height > GY + 1) continue;
      PX.blit(g, spr, sx, GY + 1, d.flip);
    }
    if (!glow) { const fx = C.LEN + 3 - camX; if (fx > -14 && fx < W + 14) PX.blit(g, icon('bigflag'), fx, GY + 1, false, 2, 26); }
  }
  function drawWorld(V) {
    const { g, W, H, C, camX } = V;
    g.clearRect(0, 0, W, H);
    const vt = viewTheme(C, camX + (V.focus == null ? W / 2 : V.focus));
    const n = V.night, starA = clamp((n - 0.3) / 0.5, 0, 1);
    drawSky(V, TH[vt.a], vt.a, starA);
    if (vt.b && vt.k > 0.02) { g.globalAlpha = vt.k; drawSky(V, TH[vt.b], vt.b, starA); g.globalAlpha = 1; }
    drawGround(V);
    drawProps(V, false);
    const dark = vt.k > 0.5 ? TH[vt.b].dark : TH[vt.a].dark;
    const amt = n * (dark ? 0.22 : 0.5);
    if (amt > 0.01) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = amt; px(g, 0, 0, W, H, '#4a4a9a'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    V.tint = amt;
    drawProps(V, true);
  }
  function drawWaterFront(V) {
    const { g, W, H, GY, C, camX, t } = V;
    g.clearRect(0, 0, W, H);
    for (let sx = 0; sx < W; sx++) {
      const wx = camX + sx, s = segAtC(C, wx); if (s.type !== 'swim') continue;
      const w = TH[themeAt(C, wx)].water, sh = (wx + Math.floor(t * 6)) % 9 === 0;
      px(g, sx, GY + 1, 1, 1, sh ? '#ffffff' : w[0]);
      for (let y = GY + 2; y < H; y++) {
        if (y <= GY + 3 && ((sx + y) & 1)) continue; // dither so a bit of the swimmer shows through
        px(g, sx, y, 1, 1, y >= H - 2 ? w[2] : ((wx * 3 + y * 5 + Math.floor(t * 4)) % 23 === 0 ? w[3] : w[1]));
      }
      if (wx === s.x0 || wx === s.x1 - 1) px(g, sx, GY, 1, H - GY, INK);
    }
    if (V.tint > 0.01) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = V.tint * 0.55; px(g, 0, 0, W, H, '#2a2a6a'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  }

  // =====================================================================
  // Scene state
  // =====================================================================
  let root = null, hubEl = null, raceEl = null, stageEl = null, cv = null, ctx = null;
  let visible = false, race = null, hubDirty = true, partnerCv = null, partnerT = 0, lastNightBucket = -1;
  const lo = document.createElement('canvas'), lx = lo.getContext('2d');
  const bgC = document.createElement('canvas'), bg = bgC.getContext('2d');
  const fgC = document.createElement('canvas'), fg = fgC.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1, PXS = 4, WW = 100, WH = 150, LH = 40, GY = 34, CLIMB_H = 10, PSX = 34;
  const $r = sel => root.querySelector(sel);

  function mount(el) {
    injectCSS();
    root = el;
    root.innerHTML = `<div class="r-root">
      <div class="r-hub"></div>
      <div class="r-race" hidden>
        <div class="r-hud">
          <div class="r-place">1<small>st</small></div>
          <div class="r-track" aria-hidden="true"><div class="r-rail"></div><div class="r-dots"></div><canvas class="px r-flag" width="10" height="12"></canvas></div>
          <button class="btn r-quit" aria-label="Leave race">\u2715</button>
          <div class="r-hrow"><span class="label">Stamina</span><div class="bar"><i class="r-stam"></i></div><span class="num r-time">0.0s</span></div>
        </div>
        <div class="r-stage">
          <canvas class="px r-cv" aria-label="Race track. Tap when the ring meets the circle."></canvas>
          <div class="hint r-hint" hidden>Tap anywhere when the ring meets the circle!</div>
          <button class="btn primary r-skip" hidden>Skip to results</button>
          <div class="overlay r-ov r-results" hidden></div>
          <div class="overlay r-ov r-leave" hidden><div class="card">
            <div class="eyebrow">Paused</div><h1>Leave this race?</h1>
            <p>You won't earn coins or XP for a race you leave.</p>
            <div class="r-btns"><button class="btn danger r-leave-yes">Leave</button><button class="btn go r-leave-no">Keep racing</button></div>
          </div></div>
        </div>
      </div></div>`;
    hubEl = $r('.r-hub'); raceEl = $r('.r-race'); stageEl = $r('.r-stage'); cv = $r('.r-cv'); ctx = cv.getContext('2d');
    paintTo($r('.r-flag'), icon('flag'));
    stageEl.addEventListener('pointerdown', e => {
      if (e.target.closest('button, .r-ov')) return;
      e.preventDefault(); PX.Sound.unlock(); tap();
    });
    $r('.r-skip').addEventListener('click', e => { e.stopPropagation(); skipToEnd(); });
    $r('.r-quit').addEventListener('click', () => { if (!race || race.state === 'done' || race.shown) return; PX.Sound.play('pop'); race.paused = true; $r('.r-leave').hidden = false; });
    $r('.r-leave-no').addEventListener('click', () => { PX.Sound.play('pop'); $r('.r-leave').hidden = true; if (race) race.paused = false; });
    $r('.r-leave-yes').addEventListener('click', () => { PX.Sound.play('pop'); $r('.r-leave').hidden = true; abortRace(); showHub(); });
    window.addEventListener('keydown', e => {
      if (!visible || !race || race.paused || race.state !== 'run') return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tap(); }
    });
    window.addEventListener('resize', () => { if (visible && race) resize(); if (visible && !race) hubDirty = true; });
    PS.on('sprout:update', () => { if (!race) hubDirty = true; });
    PS.on('reset', () => { hubDirty = true; });
    if (document.fonts && document.fonts.load) document.fonts.load('700 20px "Pixelify Sans"').catch(() => {});
  }

  function show(params) {
    visible = true; params = params || {};
    if (race) { abortRace(); }
    showHub();
    if (params.race) { const ri = D.RACES.findIndex(r => r.id === params.race); if (ri >= 0) startRace(ri, params.tier || 0); }
  }
  function hide() {
    visible = false;
    if (race) {
      // left mid-race (e.g. another screen took over): settle if the player already crossed the line, otherwise abort.
      if (!race.settled && race.player.finished) { try { settle(); } catch (e) { console.error(e); } }
      endRaceUI();
    }
  }
  function frame(dt, t) {
    if (race) {
      if (!race.paused) update(dt);
      render(); updateHud();
      return;
    }
    const nb = Math.round(nightAmt() * 8);
    if (nb !== lastNightBucket) { lastNightBucket = nb; hubDirty = true; }
    if (hubDirty) renderHub();
    partnerT += dt;
    if (partnerCv && partnerT > 0.18) { partnerT = 0; drawPartner(t); }
  }

  // =====================================================================
  // HUB
  // =====================================================================
  function tierPrize(ri, tier) { return Math.round(D.RACE_TIERS[tier].coins * (1 + ri * 0.15)); }
  function lockReason(ri, tier) {
    const R = D.RACES[ri];
    if (tier > 0 && !ST.raceProgress(R.id, tier - 1).wins) return `Win ${D.RACE_TIERS[tier - 1].name} to unlock`;
    if (R.unlock) { const U = D.RACES.find(x => x.id === R.unlock.race); return `Win ${U ? U.name : R.unlock.race} ${D.RACE_TIERS[R.unlock.tier].name} to unlock`; }
    return 'Locked';
  }
  function matchOf(s, ri, tier) {
    if (!s) return null;
    const R = D.RACES[ri], Tr = D.RACE_TIERS[tier], W = SEGS.reduce((a, k) => a + (R.mix[k] || 0), 0);
    let p = 0; for (const k of SEGS) p += ST.raceRating(s, k) * (R.mix[k] || 0) / W;
    const mid = (Tr.rating[0] + Tr.rating[1]) / 2, top = Tr.rating[1];
    const ratio = mulOf(p) / mulOf(mid), vsTop = mulOf(p) / mulOf(top);
    if (vsTop >= 1.12) return { t: 'Easy', c: '#2b8243' };
    if (ratio >= 1.0) return { t: 'Good match', c: '#5a9a2e' };
    if (ratio >= 0.9) return { t: 'Tough', c: '#c7861c' };
    return { t: 'Very tough', c: '#c0443f' };
  }
  function showHub() {
    raceEl.hidden = true; hubEl.hidden = false;
    hubDirty = true; renderHub();
  }
  function renderHub() {
    hubDirty = false;
    const s = ST.active();
    const scroll = hubEl.scrollTop;
    const unlockedSeries = D.RACES.filter(R => ST.raceUnlocked(R.id, 0)).length;
    let html = `<div class="r-head"><div><div class="label">Race series</div><h2 class="px-title">Races</h2></div><span class="r-count">${unlockedSeries} of ${D.RACES.length} open</span></div>`;
    if (!s) {
      html += `<div class="card r-empty"><canvas class="px r-ecv"></canvas><h3>No racer yet</h3><p>Hatch your first egg in the Garden, then come back to race.</p><button class="btn go wide r-togarden">Go to the Garden</button></div>`;
      hubEl.innerHTML = html;
      const ec = hubEl.querySelector('.r-ecv'), egg = safeItem('egg', 'meadow'); if (egg) paintTo(ec, egg, 24, 28);
      hubEl.querySelector('.r-togarden').onclick = () => { PX.Sound.play('pop'); PS.ui.go('garden'); };
      partnerCv = null; return;
    }
    const fi = ST.formInfo(s), rate = k => (k === 'stamina' ? ST.staminaRating(s) : ST.raceRating(s, k)).toFixed(1);
    html += `<div class="panel r-partner"><canvas class="px r-pc" width="40" height="40"></canvas><div>
      <div class="r-ptop"><div><div class="label">Your racer</div><div class="r-pname">${esc(s.name)}</div></div><button class="btn r-change">Change</button></div>
      <div class="r-pform">${esc(fi.name)} \u00b7 Lv ${ST.totalLevels(s)}</div>
      <div class="r-rates">${['run', 'swim', 'climb', 'fly', 'stamina'].map(k => `<div class="r-rate"><small>${k === 'stamina' ? 'Stam' : k === 'fly' ? 'Fly' : SEG_META[k].label}</small><b>${rate(k)}</b></div>`).join('')}</div>
    </div></div>`;
    html += '<div class="r-list">';
    D.RACES.forEach((R, ri) => {
      const open = ST.raceUnlocked(R.id, 0);
      const W = SEGS.reduce((a, k) => a + (R.mix[k] || 0), 0);
      const order = SEGS.filter(k => R.mix[k]).sort((a, b) => R.mix[b] - R.mix[a]);
      const area = D.AREAS[R.area] ? D.AREAS[R.area].name : '';
      html += `<div class="panel r-card${open ? '' : ' locked'}" data-ri="${ri}">
        <div class="r-banner"><canvas class="px r-bn" data-ri="${ri}"></canvas><span class="r-num">Series ${ri + 1}</span>${open ? '' : `<span class="r-lockchip">Locked</span>`}</div>
        <div class="r-body">
          <div class="r-title">${esc(R.name)}</div>
          <div class="r-sub">${R.id === 'grand' ? 'Every area in one long course.' : esc(area) + ' course'} \u00b7 ${order.map(k => SEG_META[k].label.toLowerCase()).join(', ')}</div>
          <div class="r-mixbar">${SEGS.filter(k => R.mix[k]).map(k => `<i style="width:${(R.mix[k] / W * 100).toFixed(1)}%;background:${SEG_META[k].color}"></i>`).join('')}</div>
          <div class="r-mix">${order.map(k => `<span class="r-mixchip"><canvas class="px" data-ic="${k}"></canvas>${SEG_META[k].label} <span>${Math.round(R.mix[k] / W * 100)}%</span></span>`).join('')}</div>
          <div class="r-tiers">${D.RACE_TIERS.map((Tr, ti) => tierRow(s, ri, ti)).join('')}</div>
        </div></div>`;
    });
    html += '</div><p class="r-foot">Win a tier the first time to earn that area\'s egg. Each first win also opens the next tier.</p>';
    hubEl.innerHTML = html;
    hubEl.scrollTop = scroll;
    partnerCv = hubEl.querySelector('.r-pc'); drawPartner(0);
    hubEl.querySelector('.r-change').onclick = () => {
      PX.Sound.play('pop');
      PS.ui.pickSprout({ title: "Who's racing?", eyebrow: 'Races', extra: x => `Run ${ST.raceRating(x, 'run').toFixed(1)} \u00b7 Swim ${ST.raceRating(x, 'swim').toFixed(1)} \u00b7 Climb ${ST.raceRating(x, 'climb').toFixed(1)} \u00b7 Fly ${ST.raceRating(x, 'fly').toFixed(1)}`,
        onPick: x => { ST.setActive(x.id); hubDirty = true; } });
    };
    hubEl.querySelectorAll('canvas[data-ic]').forEach(c => paintTo(c, icon(c.dataset.ic), 12, 12));
    hubEl.querySelectorAll('.r-prize canvas').forEach(c => paintTo(c, icon('coin'), 11, 11));
    hubEl.querySelectorAll('.r-eggic canvas').forEach(c => { const e = safeItem('egg', c.dataset.area); if (e) paintTo(c, e, 20, 24); });
    hubEl.querySelectorAll('.r-lock canvas').forEach(c => paintTo(c, icon('lock'), 13, 13));
    hubEl.querySelectorAll('.r-tier').forEach(b => {
      b.onclick = () => { const ri = +b.dataset.ri, ti = +b.dataset.tier; if (!ST.raceUnlocked(D.RACES[ri].id, ti)) return; PX.Sound.unlock(); PX.Sound.play('go'); startRace(ri, ti); };
    });
    // banners after layout so we know the width (integer 3x scale)
    const bw = hubEl.querySelector('.r-banner');
    const w = bw ? bw.clientWidth : 320;
    hubEl.querySelectorAll('.r-bn').forEach(c => drawBanner(c, +c.dataset.ri, w));
  }
  function tierRow(s, ri, ti) {
    const R = D.RACES[ri], Tr = D.RACE_TIERS[ti], open = ST.raceUnlocked(R.id, ti), p = ST.raceProgress(R.id, ti);
    const eggArea = ti === 2 && R.id === 'grand' ? 'golden' : (D.AREAS[R.area] ? R.area : 'meadow');
    const eggName = ti === 2 && R.id === 'grand' ? 'Golden Egg' : (D.EGGS[R.area] ? D.EGGS[R.area].name : 'Egg');
    const m = open ? matchOf(s, ri, ti) : null;
    let sub;
    if (!open) sub = esc(lockReason(ri, ti));
    else if (!p.runs) sub = p.wins ? '' : `First win: <b>${eggName}!</b>`;
    else sub = `Best <b>${p.best ? p.best.toFixed(1) + 's' : '\u2014'}</b> \u00b7 ${p.wins} win${p.wins === 1 ? '' : 's'}${p.wins ? '' : ` \u00b7 First win: <b>${eggName}!</b>`}`;
    const right = open
      ? `${!p.wins ? `<span class="r-eggic" title="First win earns an egg"><canvas class="px" data-area="${eggArea}"></canvas></span>` : ''}<span class="r-go">Race</span>`
      : `<span class="r-lock"><canvas class="px"></canvas></span>`;
    return `<button class="r-tier" data-ri="${ri}" data-tier="${ti}" ${open ? '' : 'disabled'} aria-label="${esc(R.name + ' ' + Tr.name)}${open ? '' : ' (locked)'}">
      <span><span class="r-tname">${Tr.name}${m ? `<span class="r-match" style="background:${m.c}">${m.t}</span>` : ''}</span>
      <span class="r-tsub">${sub}</span></span>
      <span class="r-right"><span class="r-prize"><canvas class="px"></canvas>${tierPrize(ri, ti)}</span>${right}</span></button>`;
  }
  const bannerCourses = {};
  function drawBanner(c, ri, cssWidth) {
    const S = 3, W = Math.max(40, Math.floor(cssWidth / S)), H = 30;
    c.width = W; c.height = H; c.style.width = W * S + 'px'; c.style.height = H * S + 'px';
    const C = bannerCourses[ri] || (bannerCourses[ri] = buildCourse(ri, 0));
    const R = D.RACES[ri];
    // pick a window that shows a characteristic stretch of the course
    let camX = -10;
    if (R.id === 'grand') camX = Math.round(C.zones[1].x0 - W / 2);
    else { const fav = SEGS.slice().sort((a, b) => (R.mix[b] || 0) - (R.mix[a] || 0)).find(k => k !== 'run'); const sg = C.segs.find(q => q.type === (fav === 'fly' ? 'climb' : fav)); if (R.mix.run >= Math.max(R.mix.swim || 0, R.mix.climb || 0, R.mix.fly || 0)) camX = sg ? sg.x0 - Math.round(W * 0.55) : -10; else if (sg) camX = sg.x0 - Math.round(W * 0.3); }
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const V = { g, W, H, GY: 22, CH: 7, C, camX, t: 0, night: nightAmt() };
    drawWorld(V);
    // a little Sprout running along (rival look), feet on the ground
    const look = PX.cloneLook(PX.DEFAULT_LOOK); look.body = ['mint', 'sky', 'plum', 'rose', 'sun'][ri] || 'mint';
    const spr = sprig(look, { walk: true, frame: 1, mouth: 'grin' }), sx = Math.round(W * 0.28), wx = camX + sx;
    const small = document.createElement('canvas'); small.width = 16; small.height = Math.ceil(spr.height / 2);
    const sg2 = small.getContext('2d'); sg2.imageSmoothingEnabled = false; sg2.drawImage(spr, 0, 0, 16, small.height);
    const fy = V.GY + 1 - Math.round(elevAt(V, wx) * 1) + Math.min(2, sinkAt(V, wx));
    g.drawImage(small, sx - 8, fy - small.height + 1);
    const f = document.createElement('canvas'); f.width = W; f.height = H; const fvg = f.getContext('2d');
    drawWaterFront({ g: fvg, W, H, GY: 22, CH: 7, C, camX, t: 0, tint: V.tint });
    g.drawImage(f, 0, 0);
  }
  function drawPartner(t) {
    if (!partnerCv) return;
    const s = ST.active(); if (!s) return;
    const look = ST.lookOf(s), f = Math.floor(t * 5) % 2;
    const src = sprig(look, { walk: true, frame: f, mouth: 'grin' });
    const extra = Math.max(0, src.height - 32);
    if (partnerCv.height !== 40 + extra) { partnerCv.height = 40 + extra; partnerCv.style.height = (80 + extra * 2) + 'px'; }
    const g = partnerCv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 40, partnerCv.height);
    g.fillStyle = '#e3cf9d'; g.fillRect(10, partnerCv.height - 3, 20, 2);
    PX.blit(g, src, 20, partnerCv.height - 3 - f, false, sprigAX(), sprigAY());
  }

  // =====================================================================
  // RACE
  // =====================================================================
  function resize() {
    const r = stageEl.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    cssW = r.width; cssH = r.height;
    PXS = clamp(Math.round(cssW / 100), 3, 5);
    while (PXS > 3 && cssH / PXS / 4 < 42) PXS--;           // keep lanes tall enough on short screens
    WW = Math.ceil(cssW / PXS); WH = Math.ceil(cssH / PXS);
    LH = Math.floor(WH / 4); GY = LH - 6; CLIMB_H = clamp(LH - 32, 6, 14); PSX = Math.round(WW * 0.3);
    lo.width = WW; lo.height = WH; bgC.width = fgC.width = WW; bgC.height = fgC.height = LH;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    return true;
  }
  let V = null; // world view for the race

  function startRace(ri, tier) {
    const s = ST.active();
    if (!s) { PS.ui.toast('Hatch a Sprout first'); return; }
    const R = D.RACES[ri];
    if (!ST.raceUnlocked(R.id, tier)) return;
    const C = buildCourse(ri, tier);
    const pl = makeRacer({ name: s.name, look: ST.lookOf(s), rating: playerRatings(s), stamR: ST.staminaRating(s), isPlayer: true });
    pl.nextBoost = T.ring.first;
    const rv = rivalRacers(R.id, tier);
    const lanes = [rv[0], pl, rv[1], rv[2]];
    lanes.forEach((r, i) => { r.lane = i; r.x = 0; });
    const unlockedBefore = allUnlocked();
    race = { ri, tier, R, Tr: D.RACE_TIERS[tier], C, sprout: s, lanes, racers: lanes.slice(), player: pl, t: 0,
      state: 'count', countT: 3.6, ring: null, ringsSeen: 0, pops: [], parts: [], finishT: 0, doneT: 0, shown: false, goFlash: 0,
      paused: false, settled: false, summary: null, unlockedBefore, lastSeg: 'run' };
    PS.ui.hold(true); PS.ui.chrome(false);
    hubEl.hidden = true; raceEl.hidden = false;
    $r('.r-results').hidden = true; $r('.r-leave').hidden = true; $r('.r-skip').hidden = true; $r('.r-hint').hidden = true;
    $r('.r-quit').style.visibility = '';
    resize();
    V = { g: bg, W: WW, H: LH, GY, CH: CLIMB_H, C, camX: 0, t: 0, night: nightAmt(), focus: PSX };
    buildHud();
  }
  function allUnlocked() { const o = {}; D.RACES.forEach(R => D.RACE_TIERS.forEach((Tr, ti) => { o[R.id + '-' + ti] = ST.raceUnlocked(R.id, ti); })); return o; }
  function abortRace() { endRaceUI(); }
  function endRaceUI() {
    race = null; V = null;
    if (raceEl) { raceEl.hidden = true; $r('.r-results').hidden = true; $r('.r-leave').hidden = true; }
    PS.ui.chrome(true); PS.ui.hold(false);
  }

  // ---------- update ----------
  function standings() {
    return race.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished) return -1; if (b.finished) return 1;
      if (a.projTime && b.projTime) return a.projTime - b.projTime;
      return b.x - a.x;
    });
  }
  function burst(r, n) {
    if (!race) return;
    for (let i = 0; i < n; i++) race.parts.push({ lane: r.lane, x: r.x + rnd(-8, 8), y: -rnd(6, 20), vx: rnd(-10, 10), vy: rnd(-26, -8), g: 30, life: rnd(0.4, 0.8),
      spr: PX.fx(i % 3 ? 'spark' : 'bigspark', i % 2 ? '#fbf236' : '#ffffff'), rel: true });
  }
  function onSegEnter(r, seg) {
    if (!race || race.C.segs.indexOf(seg) < 0 && !seg.after) return;
    const me = r.isPlayer;
    if (seg.type === 'swim') {
      const w = TH[themeAt(race.C, r.x)].water;
      for (let i = 0; i < 7; i++) race.parts.push({ lane: r.lane, x: r.x + rnd(-5, 5), y: GY, vx: rnd(-14, 14), vy: rnd(-40, -20), g: 110, life: 0.6, spr: PX.fx('drop', w[0]) });
      if (me) PX.Sound.play('splash');
    }
    if (seg.type === 'fly' && me) PX.Sound.play('whoosh');
    if (seg.type === 'run' && r.prevType === 'fly' && me) PX.Sound.play('thud');
    if (seg.type === 'climb' && me) PX.Sound.play('tick');
    if (me && !seg.after) pop(seg.type === 'fly' ? 'Glide!' : seg.type === 'climb' ? 'Climb!' : seg.type === 'swim' ? 'Swim!' : 'Run!', SEG_META[seg.type].color, 22, 1.1, true);
  }
  function pop(text, color, size, life, side) {
    if (side) race.pops = race.pops.filter(p => !p.side);
    race.pops.push({ text, color, size: size || 26, t: 0, life: life || 0.9, lane: race.player.lane, side: !!side });
  }
  function resolveRing(kind) {
    const p = race.player; race.ring = null; race.ringsSeen++;
    p.nextBoost = rnd(T.ring.every[0], T.ring.every[1]) - (T.ring.r0 - T.ring.target) / T.ring.shrink;
    applyCheer(p, kind, { fx: true });
    if (kind === 'perfect') { pop('PERFECT!', '#fbf236', 28); PX.Sound.play('chime'); PX.buzz(12); }
    else if (kind === 'good') { pop('GOOD', '#99e550', 24); PX.Sound.play('pop'); }
    else { pop('MISS', '#f07a84', 22); PX.Sound.play('miss'); }
    if (kind !== 'miss' || race.ringsSeen >= 3) hideHint();
  }
  function hideHint() {
    $r('.r-hint').hidden = true;
    if (!PS.S.seen.raceHint) { PS.S.seen.raceHint = true; PS.save(); }
  }
  function tap() {
    if (!race || race.paused || race.state !== 'run' || !race.ring) return;
    const d = Math.abs(race.ring.r - T.ring.target);
    resolveRing(d <= T.ring.perfect ? 'perfect' : d <= T.ring.good ? 'good' : 'miss');
  }
  const DBG = { autoCheer: false, skill: null };
  function update(dt) {
    if (!race) return;
    for (const p of race.pops) p.t += dt; race.pops = race.pops.filter(p => p.t < p.life);
    for (const p of race.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    race.parts = race.parts.filter(p => p.life > 0);
    if (race.goFlash > 0) race.goFlash -= dt;
    if (race.state === 'count') {
      const prev = Math.ceil(race.countT); race.countT -= dt; const now = Math.ceil(race.countT);
      for (const r of race.racers) r.animT += dt;
      if (now !== prev) {
        if (now >= 1 && now <= 3) PX.Sound.play('tick');
        if (now <= 0) { PX.Sound.play('go'); race.state = 'run'; race.goFlash = 0.7; if (!PS.S.seen.raceHint) $r('.r-hint').hidden = false; }
      }
      return;
    }
    race.t += dt;
    const sctx = { C: race.C, t: race.t, rng: Math.random, fx: true, onFinish };
    for (const r of race.racers) stepRacer(r, dt, sctx);
    const p = race.player;
    if (race.state === 'run' && !p.finished) {
      if (!race.ring) { p.nextBoost -= dt; if (p.nextBoost <= 0) race.ring = { r: T.ring.r0 }; }
      else {
        race.ring.r -= T.ring.shrink * dt;
        const d = Math.abs(race.ring.r - T.ring.target);
        if (DBG.skill) { // debug: simulated tapper
          if (!race.ring.plan) { const u = Math.random(), k = DBG.skill; race.ring.plan = u < k[0] ? 'perfect' : u < k[0] + k[1] ? 'good' : u < k[0] + k[1] + k[2] ? 'miss' : 'none'; }
          const pl = race.ring.plan;
          if ((pl === 'perfect' && d <= T.ring.perfect * 0.6) || (pl === 'good' && race.ring.r < T.ring.target - T.ring.perfect - 1 && d <= T.ring.good)) tap();
          else if (pl === 'miss' && race.ring.r < T.ring.target + T.ring.good + 3) tap();
        } else if (DBG.autoCheer && d <= T.ring.perfect * 0.6) tap();
        if (race.ring && race.ring.r < T.ring.endR) resolveRing('miss');
      }
    } else if (race.ring && p.finished) race.ring = null;
    // skip button once the player's place can't change
    const rivalsDone = race.racers.every(r => r.isPlayer || r.finished);
    $r('.r-skip').hidden = !(race.state === 'run' && !p.finished && rivalsDone);
    if (race.state === 'run' && race.finishT && (race.racers.every(r => r.finished) || race.t - race.finishT > 2.2)) endRace();
    if (race.state === 'done') {
      race.doneT += dt;
      if (race.doneT > 1.2 && !race.shown) { race.shown = true; showResults(); }
    }
  }
  function onFinish(r) {
    const place = standings().filter(x => x.finished).indexOf(r);
    if (r === race.player) {
      race.finishT = race.t; race.ring = null;
      PX.Sound.play(place === 0 ? 'level' : 'coo');
      if (place === 0) setEmote(r, 'heart', 2.5);
      burst(r, 8);
    }
  }
  function project(r) {
    const c = Object.assign({}, r, { cheers: { perfect: 0, good: 0, miss: 0 } }), sc = { C: race.C, t: race.t, rng: Math.random, fx: false }, dt = 1 / 30;
    while (!c.finished && sc.t < race.t + 300) { sc.t += dt; stepRacer(c, dt, sc); }
    return c.time;
  }
  function endRace() {
    for (const r of race.racers) if (!r.finished) r.projTime = project(r);
    race.state = 'done'; race.doneT = 0; race.ring = null;
    $r('.r-skip').hidden = true; $r('.r-hint').hidden = true;
  }
  function skipToEnd() {
    if (!race || race.state !== 'run') return;
    PX.Sound.play('pop');
    const p = race.player;
    if (!p.finished) { p.projTime = project(p); }
    race.finishT = race.t; endRace(); race.doneT = 1.2;
  }

  // ---------- settle + results ----------
  function settle() {
    if (!race || race.settled) return race && race.summary;
    race.settled = true;
    const order = race.racers.slice().sort((a, b) => finalTime(a) - finalTime(b));
    const place = order.indexOf(race.player), time = finalTime(race.player);
    race.order = order; race.place = place;
    race.summary = ST.finishRace(race.sprout, race.R.id, race.tier, place, time);
    return race.summary;
  }
  function showResults() {
    const sum = settle(), order = race.order, place = race.place, p = race.player, R = race.R, Tr = race.Tr;
    const title = place === 0 ? 'You won!' : place === 1 ? '2nd place!' : place === 2 ? '3rd place' : '4th place';
    const gives = sum.gives || {}, ups = sum.ups || {};
    const xpChips = D.STATS.filter(k => gives[k] > 0.5).sort((a, b) => gives[b] - gives[a]).map(k => `<span class="r-xpchip" style="background:${D.STAT_META[k].color}">${D.STAT_META[k].label} +${Math.round(gives[k])} XP${ups[k] ? `<b>Lv ${race.sprout.stats[k].lv}!</b>` : ''}</span>`).join('');
    const after = allUnlocked(), newly = Object.keys(after).filter(k => after[k] && !race.unlockedBefore[k]);
    const newNames = newly.map(k => { const [id, ti] = k.split('-'); const RR = D.RACES.find(x => x.id === id); return `${RR.name} ${D.RACE_TIERS[+ti].name}`; });
    let eggHtml = '';
    if (sum.egg) {
      const E = D.EGGS[sum.egg.kind] || { name: 'Egg' };
      eggHtml = `<div class="r-eggbox"><canvas class="px r-eggcv"></canvas><div><b>New ${esc(E.name)}!</b><span>It's waiting in the Garden.</span></div></div>`;
    }
    const tip = place === 0 ? '' : place === 3 && race.tier > 0 ? 'Rivals here are strong. Train in the Garden or try an easier tier.' : 'Tap right as the ring meets the circle for a PERFECT boost.';
    const ov = $r('.r-results');
    ov.innerHTML = `<div class="card">
      <div class="eyebrow">${esc(R.name)} \u00b7 ${Tr.name}</div>
      <h1>${title}</h1>
      <div class="r-rows">${order.map((r, i) => `<div class="r-row${r === p ? ' me' : ''}"><span class="pl">${ORD[i]}</span><canvas class="px" data-i="${i}"></canvas>
        <span class="nm">${esc(r.name)}<small>${r === p ? 'Your Sprout' : 'Rival'}</small></span><span class="num">${r.finished ? '' : '~'}${finalTime(r).toFixed(1)}s</span></div>`).join('')}</div>
      <div class="r-rew"><div class="r-coins"><canvas class="px r-coincv"></canvas>+${sum.coins} coins</div>${xpChips ? `<div class="r-xp">${xpChips}</div>` : ''}</div>
      ${eggHtml}
      ${newNames.length ? `<p class="r-note">Unlocked: <b>${newNames.map(esc).join(', ')}</b></p>` : ''}
      ${tip ? `<p class="r-note">${tip}</p>` : ''}
      <div class="r-btns stack"><button class="btn go wide r-again">Race again</button><button class="btn wide r-back">Back to races</button></div>
    </div>`;
    ov.querySelectorAll('canvas[data-i]').forEach(c => { const i = +c.dataset.i; spriteBox(c, order[i].look, i === 0 ? { eyes: 'happy', mouth: 'open', arms: 'up' } : i === 3 ? { eyes: 'sad', mouth: 'flat' } : {}, 36); c.style.height = (38 * c.height / c.width) + 'px'; });
    paintTo(ov.querySelector('.r-coincv'), icon('coin'), 11, 11);
    const ec = ov.querySelector('.r-eggcv'); if (ec) { const e = safeItem('egg', sum.egg.kind) || safeItem('egg', sum.egg.area); if (e) paintTo(ec, e, 20, 24); }
    const ri = race.ri, tier = race.tier;
    ov.querySelector('.r-back').onclick = () => { PX.Sound.play('pop'); endRaceUI(); showHub(); };
    ov.querySelector('.r-again').onclick = () => { PX.Sound.play('go'); endRaceUI(); showHub(); startRace(ri, tier); };
    ov.hidden = false; $r('.r-quit').style.visibility = 'hidden';
    PX.Sound.play(place === 0 ? 'evolve' : place === 1 ? 'chime' : 'pop');
    // back on a menu: show the HUD (coins bump) and release held pop-ups (evolution etc.)
    PS.ui.chrome(true); PS.ui.hold(false);
  }

  // ---------- HUD ----------
  let dotEls = [], lastHud = '';
  function buildHud() {
    const rail = $r('.r-rail'), C = race.C;
    rail.innerHTML = C.segs.map(s => `<i style="width:${(s.len / C.LEN * 100).toFixed(2)}%;background:${SEG_META[s.type].color}"></i>`).join('');
    const dots = $r('.r-dots'); dots.innerHTML = ''; dotEls = [];
    race.lanes.forEach(r => { const d = document.createElement('i'); d.className = 'r-dot' + (r === race.player ? ' me' : ''); d.style.background = r.color; dots.appendChild(d); dotEls.push(d); });
    lastHud = '';
  }
  function updateHud() {
    if (!race) return;
    race.lanes.forEach((r, i) => { dotEls[i] && (dotEls[i].style.left = (clamp(r.x / race.C.LEN, 0, 1) * 100).toFixed(2) + '%'); });
    const p = race.player, pl = standings().indexOf(p);
    const tm = race.state === 'count' ? 0 : p.finished ? p.time : race.t;
    const key = pl + '|' + tm.toFixed(1);
    if (key !== lastHud) { lastHud = key; $r('.r-place').innerHTML = (pl + 1) + '<small>' + ORD[pl].slice(1) + '</small>'; $r('.r-time').textContent = tm.toFixed(1) + 's'; }
    const f = clamp(p.stam / p.stamMax, 0, 1), s = $r('.r-stam');
    s.style.width = (f * 100).toFixed(1) + '%';
    s.style.background = p.tired ? '#d24552' : f < 0.3 ? '#f6c83a' : '#6abe30';
  }

  // ---------- render ----------
  function poseOf(r) {
    const s = segAtC(race.C, r.x), P = { frame: 0 };
    if (race.state === 'count') { P.frame = Math.floor(race.countT * 3 + r.lane) % 2; P.mouth = 'grin'; return P; }
    if (r.finished) {
      const place = standings().indexOf(r);
      P.arms = 'up'; P.eyes = 'happy'; P.mouth = place === 0 ? 'open' : 'smile'; P.frame = Math.floor(r.animT * 3) % 2;
      if (r.x < race.C.LEN + T.finishJog) { P.walk = true; P.frame = Math.floor(r.x / 5) % 2; }
      return P;
    }
    if (s.type === 'run') { P.walk = true; P.frame = Math.floor(r.x / 5) % 2; }
    else if (s.type === 'swim') { P.arms = sinkAt(V, r.x) > 3 ? 'paddle' : 'down'; P.walk = P.arms === 'down'; P.frame = Math.floor(r.animT * 4) % 2; }
    else if (s.type === 'climb') { P.arms = 'up'; P.walk = true; P.frame = Math.floor(r.x / 3) % 2; }
    else { P.arms = 'out'; P.flap = true; P.frame = Math.floor(r.animT * ((r.look.parts || {}).wings ? 7 : 5)) % 2; }
    if (r.stumbleT > 0) { P.eyes = 'sad'; P.mouth = 'o'; }
    else if (r.tired) { P.eyes = 'closed'; P.mouth = 'o'; }
    else if (r.boostT > 0) { P.eyes = 'happy'; P.mouth = 'grin'; }
    return P;
  }
  function feetY(r) {
    const P = poseOf(r); let bob = 0;
    const s = segAtC(race.C, r.x);
    if (!r.finished && race.state !== 'count') {
      if (s.type === 'run' || s.type === 'climb') bob = P.frame ? -1 : 0;
      if (s.type === 'swim') bob = P.frame ? 1 : 0;
      if (s.type === 'fly') bob = P.frame ? 0 : -1;
    } else if (r.finished && r.x >= race.C.LEN + T.finishJog) bob = P.frame ? -2 : 0;
    return { y: GY + 1 - elevAt(V, r.x) + sinkAt(V, r.x) + bob, P };
  }
  const circCache = {};
  function circle(r) {
    if (circCache[r]) return circCache[r];
    const pts = []; let x = r, y = 0, err = 1 - r;
    while (x >= y) { pts.push([x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]); y++; if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; } }
    const seen = new Set(), out = [];
    for (const p of pts) { const k = p[0] + ',' + p[1]; if (!seen.has(k)) { seen.add(k); out.push(p); } }
    out.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    return (circCache[r] = out);
  }
  function drawCircle(g, cx, cy, r, col, dotted) {
    if (r < 1) return; g.fillStyle = col; const pts = circle(r);
    for (let i = 0; i < pts.length; i++) { if (dotted && (i >> 1) % 2) continue; g.fillRect(cx + pts[i][0], cy + pts[i][1], 1, 1); }
  }
  function arrow(x, y, dir, col) {
    const rows = [1, 2, 3, 2, 1];
    rows.forEach((w, j) => { for (let k = 0; k < w; k++) { const xx = dir > 0 ? x + k : x - k; px(lx, xx, y + j, 1, 1, col); } });
    rows.forEach((w, j) => { const xx = dir > 0 ? x + w : x - w; px(lx, xx, y + j, 1, 1, INK); });
    px(lx, x, y - 1, 1, 1, INK); px(lx, x, y + 5, 1, 1, INK);
  }
  function render() {
    if (!race || !cssW || !V) return;
    const t = race.t + (race.state === 'count' ? 3.6 - race.countT : 0);
    const camX = Math.round(race.player.x) - PSX;
    V.g = bg; V.W = WW; V.H = LH; V.GY = GY; V.CH = CLIMB_H; V.camX = camX; V.t = t; V.focus = PSX;
    if (((t * 2) | 0) !== V.nt) { V.nt = (t * 2) | 0; V.night = nightAmt(); }
    drawWorld(V);
    drawWaterFront({ g: fg, W: WW, H: LH, GY, C: race.C, camX, t, tint: V.tint });
    lx.fillStyle = INK; lx.fillRect(0, 0, WW, WH);
    const AX = sprigAX(), AY = sprigAY();
    for (let i = 0; i < 4; i++) {
      const r = race.lanes[i], y0 = i * LH, sx = Math.round(r.x) - camX;
      lx.save(); lx.beginPath(); lx.rect(0, y0, WW, LH); lx.clip();
      lx.drawImage(bgC, 0, y0);
      const { y, P } = feetY(r);
      if (sx > -20 && sx < WW + 20) PX.blit(lx, sprig(r.look, P), sx, y0 + y, false, AX, AY);
      lx.drawImage(fgC, 0, y0);
      for (const p of race.parts) if (p.lane === i) {
        const px_ = Math.round(p.x) - camX, py = p.rel ? y0 + y + Math.round(p.y) : y0 + Math.round(p.y);
        lx.drawImage(p.spr, px_ - (p.spr.width >> 1), py);
      }
      if (r.emote && sx > -20 && sx < WW + 10) { try { PX.blit(lx, PX.emote(r.emote), sx + 8, y0 + y - 12, false, 0, 13); } catch (e) { /* optional */ } }
      lx.restore();
      if (r === race.player) { px(lx, 0, y0, WW, 1, '#fbf236'); px(lx, 0, y0 + LH - 1, WW, 1, '#fbf236'); px(lx, 0, y0, 1, LH, '#fbf236'); px(lx, WW - 1, y0, 1, LH, '#fbf236'); }
      else if (i > 0 && race.lanes[i - 1] !== race.player) px(lx, 0, y0, WW, 1, INK);
      const my = y0 + (LH >> 1) - 2;
      if (sx > WW + 4) arrow(WW - 5, my, 1, r.color);
      else if (sx < -6) arrow(4, my, -1, r.color);
    }
    if (race.ring) {
      const r = race.player, y0 = r.lane * LH, { y } = feetY(r);
      const cx = PSX, cy = y0 + y - 12, rr = Math.round(race.ring.r), d = Math.abs(race.ring.r - T.ring.target);
      drawCircle(lx, cx, cy, T.ring.target, d <= T.ring.perfect ? '#fbf236' : '#ffffff', d > T.ring.perfect);
      drawCircle(lx, cx, cy, rr + 1, INK); drawCircle(lx, cx, cy, rr - 1, INK);
      drawCircle(lx, cx, cy, rr, d <= T.ring.good ? '#fff27a' : '#ffcc44');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lo, 0, 0, WW * PXS * dpr, WH * PXS * dpr);
    // text layer (css px)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = PXS, order = standings();
    for (let i = 0; i < 4; i++) {
      const r = race.lanes[i], pl = order.indexOf(r);
      chip(6, i * LH * S + 5, (race.state === 'count' ? '' : ORD[pl] + ' ') + (r.isPlayer ? r.name + ' (you)' : r.name), r.isPlayer, r.color);
      const sx = Math.round(r.x) - camX, my = (i * LH + (LH >> 1)) * S;
      const dm = Math.max(1, Math.round(Math.abs(r.x - race.player.x) / 10)) + 'm';
      if (sx > WW + 4) tag((WW - 8) * S, my, '+' + dm, 'right');
      else if (sx < -6) tag(8 * S, my, '\u2212' + dm, 'left');
    }
    const pY = (race.player.lane * LH + feetY(race.player).y - 30) * S;
    for (const p of race.pops) {
      const k = p.t / p.life, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.globalAlpha = a;
      if (p.side) bigText(p.text, cssW * 0.72, (race.player.lane * LH + 12) * S + 12 - k * 8, p.size, p.color);
      else bigText(p.text, PSX * S, pY - k * 26, p.size, p.color);
      ctx.globalAlpha = 1;
    }
    const laneMid = (race.player.lane * LH + LH / 2) * S;
    if (race.state === 'count') {
      const n = Math.ceil(race.countT);
      if (n >= 4) { bigText(race.R.name, cssW / 2, race.player.lane * LH * S + 46, 28, '#ffcc44'); bigText(race.Tr.name, cssW / 2, race.player.lane * LH * S + 72, 18, '#ffffff'); }
      else bigText(n >= 1 ? String(n) : 'GO!', cssW * 0.68, laneMid + 26, 72, n >= 1 ? '#ffcc44' : '#99e550');
    } else if (race.goFlash > 0) {
      ctx.globalAlpha = Math.min(1, race.goFlash * 2); bigText('GO!', cssW * 0.68, laneMid + 26, 72, '#99e550'); ctx.globalAlpha = 1;
    }
    if (race.player.tired && race.state === 'run' && !race.player.finished && Math.floor(race.t * 3) % 2) tag(10, race.player.lane * LH * S + 38, 'Tired\u2026 a PERFECT cheer wakes it up!', 'left');
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function chip(x, y, text, me, col) {
    ctx.font = '600 12px "Pixelify Sans", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const w = Math.ceil(ctx.measureText(text).width) + 22, h = 20;
    roundRect(x, y, w, h, 7); ctx.fillStyle = me ? '#ffcc44' : 'rgba(255,248,230,.92)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = me ? '#d99a1a' : '#cdb57e'; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(x + 6, y + 6, 8, 8); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 6, y + 6, 8, 8);
    ctx.fillStyle = me ? '#4a3210' : '#5b4630'; ctx.fillText(text, x + 17, y + h / 2 + 1);
  }
  function tag(x, y, text, align) {
    ctx.font = '600 12px "Pixelify Sans", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = align;
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText(text, x, y); ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y);
  }
  function bigText(text, x, y, size, col) {
    ctx.font = `700 ${size}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 7); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  PS.scenes = PS.scenes || {};
  PS.scenes.race = { mount, show, hide, frame };

  // debug / balance hook
  window.__race = {
    TUNING, DBG, buildCourse, simRace, simMany, flat, mulOf, tap, startRace, skipToEnd,
    get race() { return race; },
    ff: sec => { for (let i = 0; i < sec * 60 && race; i++) update(1 / 60); },
    courseInfo() { return D.RACES.map((R, ri) => D.RACE_TIERS.map((Tr, ti) => { const C = buildCourse(ri, ti); return `${R.id}/${Tr.name}: ${C.LEN}px ${C.segs.map(s => s.type[0] + s.len).join(' ')}`; })).flat(); },
  };
})();
