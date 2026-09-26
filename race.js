// race.js — Solunar Sprouts Race screen: race hub (series x 3 tiers, Daily Cup, Time Trials), the race itself, and results.
// Scene contract: PS.scenes.race = { mount(root), show(params), hide(), frame(dt, t) }.
// The race engine evolves prototypes/3-race.html: stacked lanes, camera follows the player, run/swim/climb/fly
// segments (a climb is always followed by a downhill glide), stamina + tired state, and the Cheer Ring timing tap.
//
// What lives where (search for the banner comments):
//   EXTRA SERIES   Coral Deep + Cloud Circuit. They are not in data.js, so their progress/rewards are handled here
//                  (finishExtra) with the same shape as state.finishRace. The 5 original series still go through
//                  PS.state.finishRace exactly as before.
//   ITEMS          item boxes on the track: Speed Carrot, Bubble Shield, Honey Puddle, Rainbow Star (+ rival AI).
//   DAILY CUP      one race per real day (seeded by the local date) with a twist modifier (MODS).
//   TIME TRIAL     solo run vs a ghost of your best run, bronze/silver/gold medal times (MEDAL_COINS).
// Save data: everything new lives in PS.S.progress.raceExtra = { series:{}, trials:{}, daily:{}, hint:{} }, created lazily
// by xs(). Old saves without it work unchanged (reads fall back to defaults and never write).
(function () {
  'use strict';
  const D = PS.D, ST = PS.state;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let rng0 = Math.random; // swapped for a seeded rng while computing medal times, so they never change
  const rnd = (a, b) => a + rng0() * (b - a);
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

  // =====================================================================
  // EXTRA SERIES (not in data.js). seed keeps their courses stable even if data.js gains races.
  // eggs: first-win egg per tier. mult: prize multiplier (the originals use 1 + index * 0.15).
  // =====================================================================
  const EXTRA_RACES = [
    { id: 'coral', name: 'Coral Deep', area: 'coral', extra: true, seed: 1, body: 'aqua', blurb: 'Under the sea',
      mix: { run: 1, swim: 6, climb: 1, fly: 2 }, length: 1250, unlock: { race: 'candy', tier: 0 }, eggs: ['beach', 'beach', 'moonlit'], mult: 1.45 },
    { id: 'cloud', name: 'Cloud Circuit', area: 'cloud', extra: true, seed: 2, body: 'sun', blurb: 'Sky islands',
      mix: { run: 2, climb: 3, fly: 5 }, length: 1300, unlock: { race: 'coral', tier: 0 }, eggs: ['meadow', 'candy', 'golden'], mult: 1.6 },
  ];
  const ALL = D.RACES.concat(EXTRA_RACES);
  const byId = id => ALL.find(R => R.id === id);
  // hub order: the original area series, then the new series, then the Grand Prix finale
  const HUB_ORDER = (() => {
    const o = []; D.RACES.forEach((R, i) => { if (R.id !== 'grand') o.push(i); });
    EXTRA_RACES.forEach(R => o.push(ALL.indexOf(R)));
    D.RACES.forEach((R, i) => { if (R.id === 'grand') o.push(i); });
    return o;
  })();
  // themed words for the segment pop-ups
  const SEG_POP = { coral: { fly: 'Ride the current!', climb: 'Reef climb!' }, cloud: { climb: 'Rainbow bridge!', fly: 'Glide!' } };

  // =====================================================================
  // ITEMS. Odds depend on your place (1st .. 4th): leaders get defence, stragglers get speed.
  // =====================================================================
  const ITEMS = {
    carrot: { name: 'Speed Carrot', mul: 1.4, t: 2.0, stam: 8, pop: 'Zoom!', color: '#ffa94d' },
    shield: { name: 'Bubble Shield', t: 10, pop: 'Bubble!', color: '#9fd8ff' },
    honey: { name: 'Honey Puddle', mul: 0.55, t: 1.3, pop: 'Splat!', color: '#f6c83a' },
    star: { name: 'Rainbow Star', mul: 1.65, t: 2.4, pop: 'Super star!', color: '#fbf236' },
  };
  const ITEM_ODDS = [
    { carrot: 3, shield: 3, honey: 4, star: 0 },
    { carrot: 4, shield: 3, honey: 3, star: 0.5 },
    { carrot: 4, shield: 2, honey: 2, star: 1.5 },
    { carrot: 4, shield: 2, honey: 1, star: 3 },
  ];
  const RIVAL_PICKUP = 0.7; // rivals grab a box this often ("sometimes")

  // =====================================================================
  // DAILY CUP twists
  // =====================================================================
  const MODS = {
    lowgrav: { name: 'Low Gravity', desc: 'Big, floaty jumps!', segMul: { run: 1.06, climb: 1.3, fly: 1.1 } },
    rain: { name: 'Rainy Day', desc: 'Slippery puddles. Watch out!', segMul: { run: 0.96 } },
    giant: { name: 'Giant Mode', desc: 'Everyone is HUGE today!', segMul: { run: 1.1, swim: 0.92 } },
    reverse: { name: 'Backwards Day', desc: 'The course runs the other way!' },
    night: { name: 'Night Race', desc: 'Lanterns light the way.' },
    party: { name: 'Item Party', desc: 'Lots of item boxes!', boxes: 6 },
  };
  const CUP_COINS = [60, 40, 28, 18];       // by place, x (1 + 0.5 * bestTier)
  const CUP_XP = [10, 16, 22, 32];          // by bestTier (like a tier's xp)
  const CUP_EGG_CHANCE = [0.15, 0.05, 0.05, 0.05];
  // =====================================================================
  // TIME TRIAL medals: [bronze, silver, gold] first-time coins per tier
  // =====================================================================
  const MEDAL_COINS = [[5, 10, 20], [10, 20, 40], [20, 40, 80]];
  const MEDAL_NAMES = ['Bronze', 'Silver', 'Gold'];
  const GHOST_DT = 0.25;

  // ---------------- small helpers ----------------
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(n) { n = (n | 0) * 374761393; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0); }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ramp = body => (PX.RAMPS[body] || PX.RAMPS.mint);
  const nightAmt = () => { try { return PS.clock.night(); } catch (e) { return 0; } };
  const mod = (a, n) => ((a % n) + n) % n;
  const tri = v => Math.abs(mod(v, 2) - 1);
  function safeProp(kind, theme) { try { return PX.prop ? PX.prop(kind, theme) : null; } catch (e) { return null; } }
  function safeItem(kind, id) {
    try { if (PX.item) return PX.item(kind, id); } catch (e) { /* fall through */ }
    return kind === 'egg' ? safeProp('egg') : null;
  }
  function safeCritter(kind) { try { return PX.critter(kind); } catch (e) { return null; } }
  const sprigAX = () => (PX.SPRIG_AX == null ? 16 : PX.SPRIG_AX);
  const sprigAY = () => (PX.SPRIG_AY == null ? 31 : PX.SPRIG_AY);
  function sprig(look, pose) { return PX.sprig(look, pose || {}); }
  const eggName = kind => (D.EGGS[kind] ? D.EGGS[kind].name : 'Egg');
  function pickW(odds, r) { const ks = Object.keys(odds), tot = ks.reduce((a, k) => a + odds[k], 0); let x = r * tot; for (const k of ks) { x -= odds[k]; if (x <= 0 && odds[k] > 0) return k; } return ks[0]; }

  // =====================================================================
  // Save data for the new features (PS.S.progress.raceExtra). Reads never create it.
  // =====================================================================
  function xsRead() { const p = PS.S && PS.S.progress, x = p && p.raceExtra; return x && typeof x === 'object' ? x : null; }
  function xs() {
    if (!PS.S.progress || typeof PS.S.progress !== 'object') PS.S.progress = { races: {}, leagues: {} };
    let x = PS.S.progress.raceExtra;
    if (!x || typeof x !== 'object') x = PS.S.progress.raceExtra = {};
    for (const k of ['series', 'trials', 'daily', 'hint']) if (!x[k] || typeof x[k] !== 'object') x[k] = {};
    return x;
  }
  const blankProg = () => ({ runs: 0, wins: 0, best: null });
  function prog(R, tier) {
    if (!R.extra) return ST.raceProgress(R.id, tier);
    const x = xsRead(), p = x && x.series && x.series[R.id + '-' + tier];
    return p && typeof p === 'object' ? Object.assign(blankProg(), p) : blankProg();
  }
  function unlocked(R, tier) {
    if (!R) return false;
    if (!R.extra) return ST.raceUnlocked(R.id, tier);
    if (tier > 0 && !prog(R, tier - 1).wins) return false;
    if (!R.unlock) return true;
    const U = byId(R.unlock.race); return !!U && prog(U, R.unlock.tier).wins > 0;
  }
  const seriesMult = R => (R.extra ? R.mult : 1 + D.RACES.indexOf(R) * 0.15);
  const prizeOf = (R, tier) => Math.round(D.RACE_TIERS[tier].coins * seriesMult(R));
  const eggKindOf = (R, tier) => (R.extra ? R.eggs[tier] : (tier === 2 && R.id === 'grand' ? 'golden' : (D.AREAS[R.area] ? R.area : 'meadow')));
  function trialRec(R, tier) { const x = xsRead(), t = x && x.trials && x.trials[R.id + '-' + tier]; return t && typeof t === 'object' ? t : { best: null, m: 0 }; }
  function dayKey(ms) { const d = new Date(ms || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function cupToday(key) { const x = xsRead(), d = x && x.daily; return d && d.day === (key || dayKey()) ? d : { day: key || dayKey(), best: null, runs: 0 }; }
  function msToMidnight() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n; }
  function fmtWait(ms) { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; }

  // =====================================================================
  // Themes (per series area). Colours are DawnBringer-ish to match pixel.js.
  // far2/near/ambient keys add parallax detail; style 'reef' / 'island' change how the track is drawn.
  // =====================================================================
  const TH = {
    meadow: { prop: 'day', sky: ['#8ecff4', '#a0d7f6', '#b3e0f8', '#c8e9f9'], far: 'hills', farC: ['#86c08e', '#b2dfb0'], nearC: ['#5fa060', '#8fcf86'],
      far2: 'mountains', far2C: ['#a9c3dd', '#c4d6ea', '#ffffff'], near: 'trees', birds: true, fence: 'wood',
      top: ['#99e550', '#6abe30', '#6abe30', '#37946e'], soil: '#b8743a', soilDot: '#8f563b', tuft: '#6abe30', dots: ['#f7b6c8', '#fbf236'],
      water: ['#cbdbfc', '#639bff', '#3f55b8', '#9fd8ff'], rock: ['#8c93a8', '#6b7088', '#b7c2cc', '#dfe8fb', '#8f974a'],
      cloud: ['#b9cde8', '#ffffff', '#e6effc'], puff: ['#ffffff', '#dcecfa'], crowd: ['hare', 'squirrel', 'duck', 'frog', 'sparrow', 'bee'],
      props: [['bush', 4], ['flowerbed', 2], ['rock', 2], ['tree', 1]] },
    beach: { prop: 'day', sky: ['#5cc0ee', '#7acdf2', '#98daf5', '#b9e8f9'], far: 'sea', farC: ['#2f9fd0', '#4fb8e0', '#e6fbff'], nearC: ['#e6fbff', '#5cc8ea'],
      boat: true, birds: true, fence: 'rope',
      top: ['#fff3d6', '#f6dcb0', '#f6dcb0', '#e8c48e'], soil: '#e8c48e', soilDot: '#d9a066', tuft: null, dots: ['#ffffff', '#f7b6c8'],
      water: ['#e6fbff', '#2fb3d6', '#1f7fae', '#9ff0ff'], rock: ['#d9a066', '#b8743a', '#eec39a', '#fbe7c2', '#6abe30'],
      cloud: ['#b9cde8', '#ffffff', '#e6effc'], puff: ['#ffffff', '#e0f4fc'], crowd: ['crab', 'seal', 'seagull', 'otter', 'pelican', 'starfish'],
      props: [['palm', 3], ['umbrella', 2], ['sandcastle', 2], ['shells', 2], ['rock', 1]] },
    moonlit: { prop: 'night', dark: true, sky: ['#1c1f4a', '#252a5e', '#303875', '#3d468e'], far: 'peaks', farC: ['#181a42', '#22265a'], nearC: ['#1d3550', '#27496a'],
      far2: 'aurora', near: 'pines', fireflies: true,
      top: ['#7fe0c0', '#2f8078', '#2f8078', '#1f5452'], soil: '#3a2f5c', soilDot: '#2a2248', tuft: '#52c7a8', dots: ['#c9a2f0', '#9fd8ff'],
      water: ['#c9a2f0', '#3f3f9e', '#2c2c66', '#9fd8ff'], rock: ['#595a70', '#3f3f5a', '#8c93a8', '#b7c2cc', '#52c7a8'],
      cloud: ['#5e5aa0', '#8c86d0', '#4a4a8a'], puff: null, crowd: ['owl', 'raccoon', 'hedgehog', 'moondeer', 'wolf', 'moth'],
      props: [['glowshroom', 4, 1], ['crystal', 2, 1], ['lantern', 1, 1], ['bush', 2]] },
    candy: { prop: 'candy', sky: ['#ffbfe0', '#ffcde8', '#ffdcef', '#ffebf6'], far: 'gumdrops', farC: ['#f08cbc', '#c9a2f0'], nearC: ['#52c7a8', '#a6f2d3'],
      far2: 'softserve', far2C: ['#fff0f6', '#f7b6c8', '#ffd9a8'], fence: 'cane', birds: true,
      top: ['#ffffff', '#ffc3dc', '#ffc3dc', '#f08cbc'], soil: '#c48a5c', soilDot: '#8f563b', tuft: null, dots: ['#fbf236', '#639bff', '#99e550', '#ffffff'], sprinkles: true,
      water: ['#fff6d8', '#7fe0c8', '#3fae9a', '#ffffff'], rock: ['#e07ba0', '#a2477a', '#f7b6c8', '#fff0f6', '#ffffff'], stripes: true,
      cloud: ['#e79ad0', '#ffe3f5', '#ffc9ec'], puff: ['#ffffff', '#ffe0f0'], crowd: ['gummybear', 'cottonsheep', 'marshbunny', 'chocomouse', 'sugarfinch', 'lollisnail'],
      props: [['lollitree', 3], ['candycane', 3], ['gumdrops', 3], ['cupcake', 1]] },
    coral: { prop: 'day', style: 'reef', noSun: true, rays: true, fish: true, bubbles: true, surface: true,
      sky: ['#5ccbe0', '#3fb0d2', '#2e92bf', '#2476a6'], far2: 'reefs', far2C: ['#2a80ac', '#3590b8'], far: 'reef', farC: ['#e0708a', '#f0a060', '#b07ad8', '#ffe0a0'], nearC: ['#2fa07a', '#45b88a'], near: 'kelp',
      top: ['#fff3d6', '#f4e2b0', '#f4e2b0', '#e2c98a'], soil: '#e2c98a', soilDot: '#c9a66a', tuft: null, dots: ['#ffffff', '#f7806a'],
      water: ['#bff4ff', '#2a8fb8', '#1a5f88', '#e6fbff'], rock: ['#f7806a', '#c04a4c', '#ffc4ac', '#ffe0d0', '#ff9ec4'],
      cloud: ['#7fd8ec', '#bff4ff', '#4fb8d8'], puff: null, crowd: ['seahorse', 'pufferfish', 'starfish', 'crab', 'sodafish', 'jellyocto'],
      props: [['r:kelp', 4], ['r:coral', 3], ['r:brain', 2], ['r:anemone', 2], ['r:clam', 1], ['r:chest', 0.5], ['c:starfish', 1]] },
    cloud: { prop: 'day', style: 'island', birds: true,
      sky: ['#5cb8f0', '#7fcaf6', '#a6dcfa', '#d2eefc'], far2: 'isles', far: 'cloudsea', farC: ['#ffffff', '#dceefc'], nearC: ['#ffffff', '#e6f2fc'], near: 'clouds',
      top: ['#b6f06a', '#6abe30', '#6abe30', '#37946e'], soil: '#b8a38a', soilDot: '#8f7a64', tuft: '#6abe30', dots: ['#f7b6c8', '#fbf236'],
      water: ['#dff4ff', '#8fd0ff', '#5fa8e0', '#ffffff'], rock: ['#e5535f', '#f6a91a', '#fbf236', '#6abe30', '#639bff', '#9a6ad0'],
      cloud: ['#dceefc', '#ffffff', '#f4f9ff'], puff: ['#ffffff', '#e6f2fc'], crowd: ['sparrow', 'butterfly', 'seagull', 'bee', 'cottonsheep', 'sugarfinch'],
      props: [['bush', 2], ['flowerbed', 3], ['r:windmill', 1], ['r:pillar', 1.5], ['r:balloon', 2]] },
  };
  const GRAND_ZONES = ['meadow', 'beach', 'moonlit', 'candy'];

  // =====================================================================
  // Course: generated from the series mix + length, seeded by series & tier.
  // opt (Daily Cup): { R, m, seed, reverse, boxes, segMul, mods }
  // =====================================================================
  function buildCourse(ri, tier, opt) {
    opt = opt || {};
    const R = opt.R || ALL[ri], Tr = D.RACE_TIERS[tier] || D.RACE_TIERS[0];
    const si = R.extra ? 40 + R.seed : ri;
    const rng = mulberry(opt.seed != null ? opt.seed : 9001 + si * 131 + tier * 17);
    const mix = R.mix, W = SEGS.reduce((a, k) => a + (mix[k] || 0), 0) || 1;
    const m = opt.m || mulOf((Tr.rating[0] + Tr.rating[1]) / 2);
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
    let segs = []; let x = 0, si2 = 0, ci = 0;
    const push = (type, sec) => { const len = Math.max(MIN[type], Math.round(sec * T.base[type] * m)); segs.push({ type, x0: x, x1: x + len, len }); x += len; };
    push('run', runs[0]);
    blocks.forEach((b, i) => {
      if (b === 'swim') push('swim', swims[si2++]);
      else { push('climb', climbs[ci]); push('fly', flys[ci]); ci++; }
      push('run', runs[i + 1]);
    });
    if (opt.reverse) { // same pieces, other order (every climb still leads into its glide)
      segs.reverse();
      for (let i = 0; i < segs.length - 1; i++) if (segs[i].type === 'fly' && segs[i + 1].type === 'climb') { const a = segs[i]; segs[i] = segs[i + 1]; segs[i + 1] = a; i++; }
      x = 0; for (const s of segs) { s.x0 = x; s.x1 = x + s.len; x = s.x1; }
    }
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
    const C = { ri, tier, R, segs, LEN, zones, decor: [], segMul: opt.segMul || null, mods: opt.mods || {} };
    C.after = { type: 'run', x0: LEN, x1: 1e9, len: 1e9, after: true };
    // decor in run stretches (and a little before the start line)
    const drng = mulberry(opt.seed != null ? opt.seed + 77 : 77 + si * 1009 + tier * 7);
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
    // item boxes (a row across all lanes) and the cheering crowd — separate rngs so old courses stay identical
    const brng = mulberry((opt.seed != null ? opt.seed : si * 31 + tier * 7) + 4242);
    const nb = opt.boxes || 3; C.boxes = [];
    for (let k = 1; k <= nb; k++) C.boxes.push(Math.round(clamp(LEN * k / (nb + 1) + (brng() - 0.5) * LEN * 0.08, 70, LEN - 50)));
    C.crowd = [];
    const thS = TH[themeAt(C, -10)], thF = TH[themeAt(C, LEN + 10)];
    for (let k = 0; k < 3; k++) C.crowd.push({ x: -36 - k * 15, kind: thS.crowd[Math.floor(brng() * thS.crowd.length)], flip: false, ph: brng() * 6 });
    for (let k = 0; k < 4; k++) C.crowd.push({ x: LEN + 30 + k * 15, kind: thF.crowd[Math.floor(brng() * thF.crowd.length)], flip: true, ph: brng() * 6 });
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
  // Racers & simulation (pure: also used headless for balance checks and medal times)
  // =====================================================================
  function makeRacer(d) {
    const sm = T.stamBase + T.stamPer * d.stamR;
    const mul = {}; for (const k of SEGS) mul[k] = mulOf(d.rating[k]);
    return { name: d.name, look: d.look, rating: d.rating, mul, isPlayer: !!d.isPlayer, cheer: d.cheer || null,
      color: ramp(d.look && d.look.body)[1], x: 0, si: 0, stam: sm, stamMax: sm, tired: false, boostT: 0, boostMul: 1, stumbleT: 0,
      finished: false, time: 0, projTime: 0, nextBoost: rnd(1.5, 3.5), emote: null, emoteT: 0, animT: Math.random() * 3,
      prevType: 'run', lane: 0, tiredCount: 0, cheers: { perfect: 0, good: 0, miss: 0 },
      item: null, useIn: 0, holdT: 0, itemT: 0, itemMul: 1, shieldT: 0, starT: 0, slowT: 0, slowMul: 1, slipIn: 2 + Math.random() * 3 };
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
    if (C.segMul && C.segMul[seg.type]) v *= C.segMul[seg.type];
    if (r.tired) v *= T.tired.mul;
    // cheer boost and item boost don't fully stack: the bigger one counts, the smaller adds a quarter
    const b = r.boostT > 0 ? r.boostMul : 1, it = r.itemT > 0 ? r.itemMul : 1;
    v *= Math.max(b, it) + 0.25 * (Math.min(b, it) - 1);
    if (r.stumbleT > 0) v *= T.miss.mul;
    if (r.slowT > 0) v *= r.slowMul;
    return v;
  }
  function setEmote(r, k, t) { r.emote = k; r.emoteT = t; }
  // a Rainbow Star or Bubble Shield stops the next slowdown. Returns true when blocked.
  function guard(r, ctx) {
    if (r.starT > 0) return true;
    if (r.shieldT > 0) {
      r.shieldT = 0;
      if (ctx.fx) { ring(r, '#bff4ff', 10); if (r.isPlayer) { PX.Sound.play('crack'); pop('Blocked!', '#9fd8ff', 22); } }
      return true;
    }
    return false;
  }
  function applyCheer(r, kind, ctx) {
    r.cheers[kind]++;
    if (kind === 'miss') { if (guard(r, ctx)) return; r.stumbleT = T.miss.t; if (ctx.fx) setEmote(r, '?', 0.9); return; }
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
  // ---------------- items ----------------
  function pickup(r, ctx) {
    if (r.item) return;
    if (!r.isPlayer && ctx.rng() > RIVAL_PICKUP) return;
    const place = clamp(ctx.placeOf ? ctx.placeOf(r) : 1, 0, 3);
    const odds = Object.assign({}, ITEM_ODDS[place]);
    if (ctx.C.mods && ctx.C.mods.party) odds.star += 1;
    r.item = pickW(odds, ctx.rng()); r.useIn = rnd(0.8, 3.2); r.holdT = 0;
    if (ctx.fx) {
      sparkle(r, ['#f07a84', '#fbf236', '#99e550', '#639bff', '#c9a2f0'], 8);
      if (r.isPlayer) { PX.Sound.play('chime'); PX.buzz(10); pop(ITEMS[r.item].name + '!', ITEMS[r.item].color, 20, 1.4, true); itemHint(); }
    }
  }
  function activate(r, kind, ctx) {
    r.item = null;
    const I = ITEMS[kind];
    if (kind === 'carrot') { r.itemMul = Math.max(r.itemT > 0 ? r.itemMul : 1, I.mul); r.itemT = Math.max(r.itemT, I.t); r.stam = Math.min(r.stamMax, r.stam + I.stam); }
    else if (kind === 'shield') r.shieldT = I.t;
    else if (kind === 'honey') { if (ctx.W) ctx.W.honey.push({ x: Math.round(r.x) - 5, owner: r, hit: [], t: 0 }); }
    else if (kind === 'star') {
      r.starT = I.t; r.itemMul = I.mul; r.itemT = Math.max(r.itemT, I.t); r.slowT = 0; r.stumbleT = 0;
      if (r.tired) { r.tired = false; r.stam = Math.max(r.stam, r.stamMax * 0.35); if (r.emote === 'swirl') r.emote = null; }
    }
    if (ctx.fx) {
      if (kind === 'carrot') sparkle(r, ['#ffa94d', '#fff27a'], 6);
      if (kind === 'shield') ring(r, '#9fd8ff', 8);
      if (kind === 'honey') for (let i = 0; i < 6; i++) race.parts.push({ lane: r.lane, x: r.x - 4 + rnd(-3, 3), y: -rnd(4, 10), vx: rnd(-16, 4), vy: rnd(-30, -10), g: 110, life: 0.5, spr: PX.fx('drop', '#f6c83a'), rel: true });
      if (kind === 'star') sparkle(r, ['#f07a84', '#fbf236', '#99e550', '#639bff', '#c9a2f0'], 12);
      if (r.isPlayer) {
        pop(I.pop, I.color, 26);
        if (kind === 'carrot') { PX.Sound.play('whoosh'); PX.Sound.play('go'); }
        else if (kind === 'shield') PX.Sound.play('snap');
        else if (kind === 'honey') { PX.Sound.play('munch'); PX.Sound.play('splash'); }
        else PX.Sound.play('level');
        PX.buzz(15);
      } else if (kind !== 'shield') setEmote(r, kind === 'honey' ? 'note' : '!', 0.7);
    }
  }
  function aiUse(r, ctx) {
    const k = r.item;
    if (k === 'honey') {
      const behind = ctx.W.racers.some(o => o !== r && !o.finished && o.x < r.x && r.x - o.x < 90);
      if (!behind && r.holdT < 6) { r.useIn = 0.6; r.holdT += 0.6; return; }
    }
    if (k === 'carrot' && r.boostT > 0 && r.holdT < 4) { r.useIn = 0.5; r.holdT += 0.5; return; }
    activate(r, k, ctx);
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
    if (r.itemT > 0) r.itemT = Math.max(0, r.itemT - dt);
    if (r.slowT > 0) r.slowT = Math.max(0, r.slowT - dt);
    if (r.starT > 0) r.starT = Math.max(0, r.starT - dt);
    if (r.shieldT > 0) r.shieldT = Math.max(0, r.shieldT - dt);
    if (r.tired) {
      r.stam += T.tired.regen * dt;
      if (r.stam >= r.stamMax * T.tired.until) { r.tired = false; if (r.emote === 'swirl') r.emote = null; }
    } else {
      if (r.starT <= 0) r.stam -= T.drain[seg.type] * dt;
      if (r.stam <= 0) {
        if (guard(r, ctx)) r.stam = r.stamMax * 0.35;
        else { r.stam = 0; r.tired = true; r.tiredCount++; r.emote = 'swirl'; r.emoteT = 0; if (ctx.fx && r.isPlayer) PX.Sound.play('miss'); }
      }
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
    // rainy day: run stretches are slippery for everyone
    if (C.mods.rain && seg.type === 'run' && !seg.after) {
      r.slipIn -= dt;
      if (r.slipIn <= 0) {
        r.slipIn = rnd(3.5, 6.5);
        if (!guard(r, ctx)) {
          r.slowT = 0.6; r.slowMul = 0.5;
          if (ctx.fx) { setEmote(r, '!', 0.6); for (let i = 0; i < 5; i++) race.parts.push({ lane: r.lane, x: r.x + rnd(-4, 4), y: -1, vx: rnd(-18, 18), vy: rnd(-30, -12), g: 110, life: 0.45, spr: PX.fx('drop', '#b8d4ff'), rel: true }); if (r.isPlayer) { PX.Sound.play('splash'); pop('Slip!', '#9fd8ff', 20); } }
        }
      }
    }
    if (ctx.W && r.item && !r.isPlayer) { r.useIn -= dt; if (r.useIn <= 0) aiUse(r, ctx); }
    const nx = r.x + v * dt;
    if (ctx.items && C.boxes) for (const bx of C.boxes) if (r.x < bx && nx >= bx) pickup(r, ctx);
    if (ctx.W && ctx.W.honey.length) for (const h of ctx.W.honey) {
      if (h.owner === r || h.hit.indexOf(r) >= 0 || !(r.x < h.x && nx >= h.x)) continue;
      h.hit.push(r);
      if (!guard(r, ctx)) {
        r.slowT = ITEMS.honey.t; r.slowMul = ITEMS.honey.mul;
        if (ctx.fx) { setEmote(r, '?', 0.9); if (r.isPlayer) { PX.Sound.play('thud'); pop('Sticky!', '#f6c83a', 22); } }
      }
    }
    if (nx >= C.LEN) { r.time = ctx.t - dt + dt * (C.LEN - r.x) / (nx - r.x); r.finished = true; r.x = nx; ctx.onFinish && ctx.onFinish(r); }
    else r.x = nx;
  }
  const finalTime = r => (r.finished ? r.time : r.projTime || 999);
  const cheerOf = arr => ({ p: arr[0], g: arr[1], m: arr[2] });
  function playerRatings(s) { const o = {}; for (const k of SEGS) o[k] = ST.raceRating(s, k); return o; }
  // rivals for the extra series: same recipe as state.raceRivals, own seed
  function extraRivals(R, tier) {
    const Tr = D.RACE_TIERS[tier];
    let seed = (40 + R.seed) * 97 + tier * 13; const sr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const names = D.NAMES.slice().sort(() => sr() - 0.5).slice(0, 3);
    const bodies = ['clay', 'plum', 'sky', 'rose', 'leaf', 'slate', 'sun', 'berry', 'night', 'cocoa', 'teal', 'coral'];
    return names.map((name, i) => {
      const base = Tr.rating[0] + (Tr.rating[1] - Tr.rating[0]) * (i / 2);
      const rt = () => +(base * (0.8 + sr() * 0.4)).toFixed(2);
      const parts = {}; const specialty = ['wings', 'fins', 'ears', 'horns'][Math.floor(sr() * 4)]; if (tier > 0) parts[specialty] = tier >= 2 ? 1 : 0.5;
      return { name, look: Object.assign(PX.cloneLook(PX.DEFAULT_LOOK), { body: bodies[Math.floor(sr() * bodies.length)], parts: Object.assign({ wings: 0, ears: 0, fins: 0, horns: 0, tail: 0, shell: 0 }, parts), eyes: ['round', 'brave', 'dot'][Math.floor(sr() * 3)] }),
        rating: { run: rt(), swim: rt(), climb: rt(), fly: rt(), stamina: rt() }, cheer: Tr.cheerSkill };
    });
  }
  function rivalRacers(R, tier) {
    const list = R.extra ? extraRivals(R, tier) : ST.raceRivals(R.id, tier);
    return list.map(rv => makeRacer({ name: rv.name, look: rv.look, rating: rv.rating, stamR: rv.rating.stamina, cheer: cheerOf(rv.cheer || D.RACE_TIERS[tier].cheerSkill) }));
  }
  // Headless race. who = {rating, stamR} ; skill = [perfect, good, miss] chance per ring for the player.
  function simRace(who, ri, tier, skill, items) {
    const R = ALL[ri], C = buildCourse(ri, tier);
    const pl = makeRacer({ name: 'You', look: PX.DEFAULT_LOOK, rating: who.rating, stamR: who.stamR, isPlayer: true, cheer: cheerOf(skill) });
    pl.nextBoost = T.ring.first + 1;
    const all = [pl].concat(rivalRacers(R, tier));
    all.forEach((r, i) => { r.lane = i; });
    const W = { honey: [], racers: all };
    const placeOf = r => all.slice().sort((a, b) => b.x - a.x).indexOf(r);
    const ctx = { C, t: 0, rng: Math.random, fx: false, W: items ? W : null, items: !!items, placeOf }, dt = 1 / 60;
    while (all.some(r => !r.finished) && ctx.t < 400) {
      ctx.t += dt;
      for (const r of all) stepRacer(r, dt, ctx);
      if (items && pl.item) { pl.useIn -= dt; if (pl.useIn <= 0) activate(pl, pl.item, ctx); } // the headless player uses items too
    }
    const order = all.slice().sort((a, b) => a.time - b.time);
    return { place: order.indexOf(pl), time: pl.time, tired: pl.tiredCount, winner: order[0].time, order: order.map(r => r.name + ' ' + r.time.toFixed(1)) };
  }
  function simMany(who, ri, tier, skill, n, items) {
    n = n || 200; let win = 0, t = 0, tired = 0, top2 = 0, wt = 0;
    for (let i = 0; i < n; i++) { const s = simRace(who, ri, tier, skill, items); if (s.place === 0) win++; if (s.place < 2) top2++; t += s.time; wt += s.winner; tired += s.tired; }
    return { win: +(win / n).toFixed(2), top2: +(top2 / n).toFixed(2), avgTime: +(t / n).toFixed(1), winnerTime: +(wt / n).toFixed(1), tiredPerRace: +(tired / n).toFixed(2) };
  }
  const flat = (v, st) => ({ rating: { run: v, swim: v, climb: v, fly: v }, stamR: st == null ? v : st });
  // Solo run with a fixed seed (medal times must never change between sessions)
  function simSolo(ri, tier, v, skill, seed) {
    const prev = rng0; rng0 = mulberry(seed);
    try {
      const C = buildCourse(ri, tier);
      const pl = makeRacer({ name: 'm', look: PX.DEFAULT_LOOK, rating: { run: v, swim: v, climb: v, fly: v }, stamR: v, isPlayer: true, cheer: skill ? cheerOf(skill) : null });
      pl.nextBoost = T.ring.first + 1;
      const ctx = { C, t: 0, rng: rng0, fx: false }, dt = 1 / 60;
      while (!pl.finished && ctx.t < 400) { ctx.t += dt; stepRacer(pl, dt, ctx); }
      return pl.time;
    } finally { rng0 = prev; }
  }
  const medalCache = {};
  // [bronze, silver, gold] seconds for a course: a low / mid / top rival of that tier running alone
  function medalTimes(ri, tier) {
    const key = ri + '-' + tier; if (medalCache[key]) return medalCache[key];
    const Tr = D.RACE_TIERS[tier], lo = Tr.rating[0], hi = Tr.rating[1], mid = (lo + hi) / 2;
    const up = v => Math.ceil(v * 2) / 2;
    const b = up(simSolo(ri, tier, lo, [0.05, 0.3, 0.15], 101 + key.length)), s = up(simSolo(ri, tier, mid, [0.2, 0.35, 0.1], 202)), g = up(simSolo(ri, tier, hi, [0.4, 0.35, 0.05], 303));
    return (medalCache[key] = [Math.max(b, s + 0.5), Math.max(s, g + 0.5), g]);
  }
  const medalOf = (mt, time) => (time <= mt[2] ? 3 : time <= mt[1] ? 2 : time <= mt[0] ? 1 : 0);

  // =====================================================================
  // DAILY CUP: seeded by the local date, so it's the same all day.
  // =====================================================================
  function cupBase(key) { const r = mulberry(hashStr('cup:' + key)), ids = Object.keys(MODS); return { r, ids, mod: ids[Math.floor(r() * ids.length)] }; }
  function dailyInfo(key) {
    key = key || dayKey();
    const seed = hashStr('cup:' + key), b = cupBase(key);
    const yd = dayKey(new Date(key + 'T12:00:00').getTime() - 864e5);
    let modId = b.mod; if (modId === cupBase(yd).mod) modId = b.ids[(b.ids.indexOf(modId) + 1) % b.ids.length]; // no repeat two days running
    if (DBG.cupMod && MODS[DBG.cupMod]) modId = DBG.cupMod; // testing only
    const r = mulberry(seed + 7);
    const R = ALL[Math.floor(r() * ALL.length)];
    const egg = ['meadow', 'beach', 'moonlit', 'candy'][Math.floor(r() * 4)];
    return { key, seed, R, ri: ALL.indexOf(R), mod: modId, M: MODS[modId], egg };
  }
  const cupCoins = place => Math.round(CUP_COINS[place] * (1 + 0.5 * Math.min(3, PS.S.bestTier || 0)));
  function avgRating(s, R) { const W = SEGS.reduce((a, k) => a + (R.mix[k] || 0), 0) || 1; let p = 0; for (const k of SEGS) p += ST.raceRating(s, k) * (R.mix[k] || 0) / W; return p; }
  function cupCourse(info, s) {
    return buildCourse(info.ri, 0, { R: info.R, m: mulOf(avgRating(s, info.R)), seed: info.seed, reverse: info.mod === 'reverse', boxes: info.M.boxes || 3, segMul: info.M.segMul, mods: { [info.mod]: true } });
  }
  function cupRivals(info, s) {
    const r = mulberry(info.seed + 99), pr = playerRatings(s), st = ST.staminaRating(s);
    const names = D.NAMES.slice().sort(() => r() - 0.5).slice(0, 3);
    const bodies = ['clay', 'plum', 'sky', 'rose', 'leaf', 'slate', 'sun', 'berry', 'night', 'cocoa', 'lilac', 'teal'];
    const f = [0.86, 0.97, 1.07].sort(() => r() - 0.5);
    return names.map((name, i) => {
      const rating = {}; for (const k of SEGS) rating[k] = +(pr[k] * f[i] * (0.92 + r() * 0.16)).toFixed(2);
      const look = Object.assign(PX.cloneLook(PX.DEFAULT_LOOK), { body: bodies[Math.floor(r() * bodies.length)], eyes: ['round', 'brave', 'dot'][Math.floor(r() * 3)] });
      const hats = PX.HAT_IDS || []; if (hats.length && r() < 0.5) look.hat = hats[Math.floor(r() * hats.length)];
      return makeRacer({ name, look, rating, stamR: st * f[i], cheer: cheerOf([0.25, 0.35, 0.08]) });
    });
  }

  // =====================================================================
  // DOM + CSS
  // =====================================================================
  const CSS = `
  .r-root{position:absolute;inset:0}
  .r-hub{position:absolute;inset:0;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:12px 12px 22px}
  .r-head{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:2px 4px 10px}
  .r-head h2{font-size:28px;margin:2px 0 0;color:var(--ink)}
  .r-head .r-count{font-family:var(--f-px);font-weight:600;font-size:13px;color:var(--ink-soft);background:var(--slot);border:2px solid var(--line);border-radius:10px;padding:3px 9px;white-space:nowrap}
  .r-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 12px}
  .r-tab{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:64px;font-family:var(--f-px);font-weight:700;font-size:15px;line-height:1.1;
    background:var(--panel);border:2px solid var(--line);border-bottom-width:5px;border-radius:16px;color:var(--ink-soft);padding:6px 2px 5px}
  .r-tab canvas{width:32px;height:32px}
  .r-tab[aria-selected="true"]{background:var(--sun);border-color:var(--sun-edge);color:#4a3210}
  .r-tab:active{transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
  .r-tab .r-badge{position:absolute;top:5px;right:9px;width:13px;height:13px;border-radius:50%;background:var(--berry);border:2px solid var(--panel)}
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
  .r-new{position:absolute;right:10px;top:8px;font-family:var(--f-px);font-weight:700;font-size:12px;line-height:1;background:var(--berry);color:#fff;border:2px solid var(--berry-edge);border-radius:8px;padding:3px 7px}
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
  .r-tier:focus-visible,.r-tab:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
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
  .r-medals{display:flex;gap:2px}
  .r-medals canvas{width:22px;height:28px}
  .r-medals canvas.off{opacity:.45}
  .r-empty{text-align:center;padding:22px 18px;margin-top:20px}
  .r-empty canvas{width:96px;height:96px;display:block;margin:0 auto 6px}
  .r-empty h3{font-family:var(--f-px);font-size:22px;margin:0 0 6px}
  .r-empty p{margin:0 0 14px;color:var(--ink-soft)}
  .r-foot{font-size:12px;color:var(--ink-soft);text-align:center;margin:4px 12px 0;line-height:1.4}
  .r-intro{font-size:14px;color:var(--ink-soft);text-align:center;margin:-4px 8px 12px;line-height:1.35}
  .r-twist{display:grid;grid-template-columns:52px 1fr;gap:10px;align-items:center;background:#efe4ff;border:2px solid #c9a2f0;border-radius:14px;padding:8px 10px;margin:4px 0 10px}
  .r-twist canvas{width:48px;height:48px}
  .r-twist b{display:block;font-family:var(--f-px);font-weight:700;font-size:19px;line-height:1.1;color:#4a2a78}
  .r-twist span{font-size:14px;color:#5e3a8e}
  .r-cupprize{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;font-family:var(--f-px);font-weight:700;font-size:17px;margin:0 0 10px;color:var(--ink)}
  .r-cupprize canvas{width:20px;height:20px}
  .r-cupprize .r-eggic{width:28px;height:32px}
  .r-cupprize small{font-family:var(--f-ui);font-weight:600;font-size:13px;color:var(--ink-soft)}
  .r-done{display:flex;align-items:center;justify-content:center;gap:8px;background:#eaf6df;border:2px solid #9fcf8a;border-radius:14px;padding:8px 10px;margin:0 0 10px;font-family:var(--f-px);font-weight:700;font-size:16px;color:#2b6a33;text-align:center}
  .r-next{font-family:var(--f-px);font-weight:600;font-size:14px;text-align:center;color:var(--ink-soft);margin:10px 0 0}
  .r-cupgo{min-height:60px}

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
  .r-dot.ghost{opacity:.55;border-style:dashed}
  .r-flag{position:absolute;right:0;top:-1px;width:20px;height:24px}
  .r-hrow{display:flex;align-items:center;gap:8px}
  .r-hrow .bar{flex:1;height:12px}
  .r-hrow .bar i{transition:none;background:#6abe30}
  .r-hrow .num{min-width:50px;text-align:right;font-size:16px}
  .r-quit{grid-row:span 2;width:44px;height:44px;padding:0;display:grid;place-items:center;font-size:20px;border-radius:12px}
  .r-stage{flex:1;min-height:0;position:relative;touch-action:none;overflow:hidden}
  .r-cv{position:absolute;left:0;top:0;display:block;touch-action:none}
  .r-hint{bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:3}
  .r-ihint{right:12px;left:auto;transform:none;bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:3;max-width:220px}
  .r-skip{position:absolute;left:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:3;min-height:46px}
  .r-item{position:absolute;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:3;width:86px;height:86px;padding:0;border-radius:24px;
    display:grid;place-items:center;background:rgba(255,248,230,.55);border:3px solid rgba(205,181,126,.7);border-bottom-width:7px}
  .r-item canvas{width:52px;height:52px}
  .r-stage.mirror .r-item,.r-stage.mirror .r-ihint{left:12px;right:auto}
  .r-stage.mirror .r-skip{left:auto;right:12px}
  .r-item span{position:absolute;left:0;right:0;bottom:3px;font-family:var(--f-px);font-weight:700;font-size:12px;color:#4a3210}
  .r-item.has{background:var(--sun);border-color:var(--sun-edge);animation:rPulse .9s ease-in-out infinite}
  .r-item:not(.has) canvas{opacity:.35}
  .r-item:active{transform:translateY(3px);border-bottom-width:4px}
  @keyframes rPulse{50%{transform:scale(1.07)}}
  @media (prefers-reduced-motion: reduce){.r-item.has{animation:none}}
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
  .r-bigtime{font-family:var(--f-px);font-weight:700;font-size:44px;line-height:1;text-align:center;color:var(--ink);margin:4px 0 2px}
  .r-delta{text-align:center;font-family:var(--f-px);font-weight:600;font-size:15px;margin:0 0 10px}
  .r-delta.good{color:#2b8243}.r-delta.bad{color:#b0572a}
  .r-mrow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px}
  .r-mcell{display:grid;justify-items:center;gap:2px;background:var(--slot);border-radius:12px;padding:6px 2px 5px;font-family:var(--f-px);font-weight:600;font-size:13px;color:var(--ink-soft)}
  .r-mcell canvas{width:33px;height:42px}
  .r-mcell b{font-family:var(--f-ui);font-size:14px;color:var(--ink)}
  .r-mcell.got{background:#fff1b8;box-shadow:inset 0 0 0 2px var(--sun-edge)}
  .r-mcell.new{animation:rPulse .8s ease-in-out 3}
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
  const RAINBOW = ['#e5535f', '#f6a91a', '#fbf236', '#6abe30', '#639bff', '#9a6ad0'];
  const MEDAL_RAMPS = [['#f5c49a', '#d98a4e', '#96461c'], ['#ffffff', '#cbd5e4', '#8c93a8'], ['#fff27a', '#f6c83a', '#c7861c']];
  const QMARK = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];
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
      // ---- tabs ----
      case 'tab-races': g = new G(16, 16); g.rect(3, 1, 1, 14, '#595a70'); g.rect(4, 2, 9, 7, '#ffffff'); for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) if ((x + y) % 2) g.set(4 + x, 2 + y, INK); g.outline(); break;
      case 'tab-cup':
        g = new G(16, 16); g.ell(8, 5, 5.5, 5, PX.RAMPS.sun, 0, (x, y) => y >= 1); g.rect(3, 1, 11, 2, '#f6c83a');
        g.ell(2.5, 5, 1.6, 2.2, null); g.rect(7, 9, 3, 3, '#c7861c'); g.rect(4, 12, 9, 3, '#8f563b');
        g.outline(); g.px([[5, 3], [5, 4]], '#fff9c0'); g.px([[7, 13], [8, 13], [9, 13]], '#f6c83a');
        g.px([[1, 3], [1, 4], [1, 5], [2, 6], [15, 3], [15, 4], [15, 5], [14, 6]], '#f6c83a'); break;
      case 'tab-trial':
        g = new G(16, 16); g.rect(7, 0, 3, 2, '#8c93a8'); g.rect(8, 2, 1, 1, '#8c93a8'); g.ell(8.5, 9.5, 6, 6, ['#ffffff', '#dfe8fb', '#9badb7']);
        g.outline(); g.ell(8.5, 9.5, 4.2, 4.2, '#ffffff'); g.px([[8, 6], [8, 7], [8, 8], [8, 9], [9, 9], [10, 9]], '#e5535f'); g.px([[8, 4], [4, 9], [13, 9], [8, 14]], '#9badb7'); break;
      // ---- items ----
      case 'carrot':
        g = new G(15, 15); g.poly([[6, 4], [11.5, 9.5], [1.5, 14]], '#df7126'); g.ell(11.5, 3, 1.4, 3, '#6abe30', 0.75); g.ell(12.5, 5.5, 3, 1.3, '#37946e', 0.35); g.ell(9.5, 2.5, 1.2, 2.5, '#99e550', -0.3);
        g.outline(); g.px([[6, 6], [5, 7], [4, 9], [3, 11]], '#f5a86a'); g.px([[8, 8], [6, 10]], '#96461c'); break;
      case 'shield':
        g = new G(15, 15); g.ell(7.5, 7.5, 6.4, 6.4, ['#e6f6ff', '#9fd8ff', '#5fa8e0']); g.outline(); g.ell(7.5, 7.5, 4.6, 4.6, '#cdeeff');
        g.px([[4, 4], [5, 3], [4, 5], [6, 3]], '#ffffff'); g.px([[10, 11], [11, 10]], '#ffffff'); break;
      case 'honey':
        g = new G(15, 15); g.ell(7.5, 9.5, 5.6, 4.6, ['#ffd86a', '#f6a91a', '#b8680e']); g.rect(3, 3, 9, 3, '#eec39a'); g.rect(4, 5, 7, 1, '#b8743a'); g.outline();
        g.px([[5, 8], [5, 9]], '#fff6c8'); g.px([[9, 6], [9, 7], [10, 6]], '#f6a91a'); g.px([[6, 3], [8, 3]], '#e5535f'); break;
      case 'star':
        g = new G(15, 15); g.poly(PX.starPts(7.5, 8, 7, 3.2, 5), '#fbf236'); g.ell(6, 6.5, 2.2, 2.2, '#fff9c0', 0, (x, y) => g.filled(x, y)); g.outline();
        g.px([[6, 8], [9, 8]], INK); g.px([[5, 9], [10, 9]], '#f7b6c8'); g.px([[7, 0]], '#e5535f'); g.px([[0, 5]], '#639bff'); g.px([[14, 5]], '#6abe30'); break;
      case 'itembox': g = new G(15, 15); g.rect(1, 1, 13, 13, '#ffffff'); g.str(QMARK, 5, 4, { '#': '#9a6ad0' }); g.outline(); break;
      case 'lantern': g = new G(7, 10); g.rect(2, 0, 3, 1, '#595a70'); g.rect(1, 2, 5, 6, '#fff27a'); g.rect(1, 2, 5, 1, '#8f563b'); g.rect(1, 7, 5, 1, '#8f563b'); g.outline(); g.px([[3, 4], [3, 5]], '#ffffff'); break;
      // ---- daily cup twists ----
      case 'mod-lowgrav':
        g = new G(16, 16); g.ell(8, 8, 5, 5, PX.RAMPS.plum); g.outline(); g.px([[6, 6], [7, 5]], '#e8d6ff'); g.px([[9, 10], [10, 9]], '#5e3a8e');
        for (let x = 0; x < 16; x++) { const y = Math.round(10.5 - x * 0.35); if (x < 4 || x > 11 || y > 8) g.set(x, y, '#fff27a'); } break;
      case 'mod-rain':
        g = new G(16, 16); g.ell(6, 6, 4, 3.2, ['#ffffff', '#dfe8fb', '#9badb7']); g.ell(10.5, 5.5, 4, 3.8, ['#ffffff', '#dfe8fb', '#9badb7']); g.rect(3, 7, 11, 2, '#dfe8fb'); g.outline();
        g.px([[4, 12], [4, 13], [8, 11], [8, 12], [12, 12], [12, 13], [6, 15], [10, 15]], '#639bff'); break;
      case 'mod-giant': { const c = sprig(PX.cloneLook(PX.DEFAULT_LOOK), { arms: 'up', eyes: 'happy', mouth: 'open' }); return (ICO[kind] = c); }
      case 'mod-reverse': g = new G(16, 16); g.poly([[1, 8], [7, 2], [7, 5.5], [14.5, 5.5], [14.5, 10.5], [7, 10.5], [7, 14]], '#6abe30'); g.outline(); g.px([[4, 8], [5, 7], [6, 6], [8, 7], [9, 7], [10, 7]], '#99e550'); break;
      case 'mod-night': g = new G(16, 16); g.rect(6, 1, 4, 1, '#595a70'); g.rect(7, 2, 2, 1, '#595a70'); g.rect(4, 4, 8, 9, '#fff27a'); g.rect(4, 4, 8, 2, '#8f563b'); g.rect(4, 12, 8, 2, '#8f563b'); g.outline(); g.px([[7, 7], [8, 7], [7, 8], [8, 8], [7, 9]], '#ffffff'); g.px([[6, 10], [9, 10]], '#f6c83a'); break;
      case 'mod-party': return (ICO[kind] = icon('itembox'));
      default:
        if (kind.startsWith('medal')) { // medal0..2, medalx = empty
          const k = kind.slice(5), R = k === 'x' ? ['#fbf2dc', '#e3cf9d', '#cdb57e'] : MEDAL_RAMPS[+k];
          g = new G(11, 14); g.poly([[1, 0], [4, 0], [6.5, 5], [3.5, 5]], k === 'x' ? '#e3cf9d' : '#5b6ee1'); g.poly([[10, 0], [7, 0], [4.5, 5], [7.5, 5]], k === 'x' ? '#cdb57e' : '#e5535f');
          g.ell(5.5, 9, 4.3, 4.3, R); g.outline();
          if (k !== 'x') { g.poly(PX.starPts(5.5, 9.2, 2.6, 1.1, 5), R[0]); g.px([[3, 7]], '#ffffff'); }
          break;
        }
        g = new G(4, 4);
    }
    return (ICO[kind] = g.canvas());
  }
  // rainbow-edged item box frames
  function boxFrame(t) {
    const f = Math.floor(t * 8) % 6, key = 'box' + f; if (ICO[key]) return ICO[key];
    const g = new PX.Grid(13, 13);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const edge = x === 0 || y === 0 || x === 12 || y === 12, e2 = x === 1 || y === 1 || x === 11 || y === 11;
      if (edge) g.set(x, y, INK); else if (e2) g.set(x, y, RAINBOW[(x + y + f) % 6]); else g.set(x, y, 'rgba(255,255,255,0.78)');
    }
    g.str(QMARK, 4, 3, { '#': '#ffffff' }); g.str(QMARK.map(r => r.replace(/#/g, 'k')), 4, 4, { k: '#5e3a8e' }); g.str(QMARK, 4, 3, { '#': '#9a6ad0' });
    g.px([[2, 2], [3, 2], [2, 3]], '#ffffff');
    return (ICO[key] = g.canvas());
  }
  function honeySpr() {
    if (ICO.hpud) return ICO.hpud;
    const g = new PX.Grid(15, 5); g.ell(7.5, 3, 7, 2, ['#ffe08a', '#f6a91a', '#c7861c']); g.outline(); g.px([[4, 2], [5, 2], [9, 3]], '#fff6c8');
    return (ICO.hpud = g.canvas());
  }
  const CONF = {};
  function confetti(col, k) { const key = col + k; if (CONF[key]) return CONF[key]; const c = document.createElement('canvas'); c.width = k ? 1 : 2; c.height = k ? 2 : 1; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 2, 2); return (CONF[key] = c); }
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
  // ---------------- course props drawn here (coral reef + sky islands) and start / finish gates ----------------
  const RPROP = {
    kelp() { const g = new PX.Grid(11, 30); for (let y = 29; y >= 2; y--) { const x = 5 + Math.round(Math.sin(y * 0.33) * 1.6); g.rect(x, y, 2, 1, y % 5 ? '#37946e' : '#6abe30'); if (y % 6 === 0) g.ell(x + (y % 12 ? 3 : -1.5), y, 1.8, 1, '#6abe30', 0.5); } g.outline(); g.px([[5, 20], [6, 12]], '#99e550'); return g; },
    coral() { const g = new PX.Grid(17, 16); const c = '#f7806a'; PX.stroke(g, [[8, 15], [8, 9], [4, 5], [3, 2]], 1.3, 0.9, c); PX.stroke(g, [[8, 10], [12, 6], [13, 3]], 1.2, 0.9, c); PX.stroke(g, [[8, 8], [8, 3]], 1.2, 0.9, c); PX.stroke(g, [[12, 7], [15, 7]], 1, 0.8, c); g.outline(); g.px([[3, 2], [8, 3], [13, 3], [15, 7]], '#ffc4ac'); g.px([[7, 12], [9, 6]], '#c04a4c'); return g; },
    brain() { const g = new PX.Grid(16, 9); g.ell(8, 8.5, 7, 6.5, ['#ffd08a', '#f6a94a', '#c7702a'], 0, (x, y) => y <= 8); g.outline(); for (let x = 3; x < 13; x += 3) g.px([[x, 4], [x + 1, 5], [x, 6], [x + 1, 7]], '#c7702a'); g.px([[5, 2], [6, 2]], '#ffe8c0'); return g; },
    anemone() { const g = new PX.Grid(13, 12); for (let i = 0; i < 6; i++) PX.line(g, 3 + i * 1.4, 8, 1 + i * 2.2, 2 + (i % 2) * 2, '#f7b6c8'); g.ell(6.5, 10, 4.2, 2, PX.RAMPS.plum); g.outline(); for (let i = 0; i < 6; i++) g.set(1 + i * 2.2, 2 + (i % 2) * 2, '#ffffff'); return g; },
    clam() { const g = new PX.Grid(13, 9); g.ell(6.5, 7, 6, 2.2, ['#f0e2ff', '#c8aaf0', '#8c6cc4']); g.poly([[1, 6], [3, 1.5], [10, 1.5], [12, 6], [9, 4], [4, 4]], '#c8aaf0'); g.ell(6.5, 5.5, 1.5, 1.5, '#ffffff'); g.outline(); g.px([[6, 5]], '#dfe8fb'); return g; },
    chest() { const g = new PX.Grid(15, 12); g.rect(1, 5, 13, 6, '#8f563b'); g.ell(7.5, 5, 6.5, 3.5, ['#b8743a', '#8f563b', '#663931'], 0, (x, y) => y <= 5); g.rect(1, 5, 13, 1, '#f6c83a'); g.rect(6, 4, 3, 4, '#f6c83a'); g.outline(); g.px([[7, 6]], INK); g.px([[3, 3], [10, 8]], '#fff27a'); g.px([[2, 10], [12, 10]], '#f6c83a'); return g; },
    windmill() { const g = new PX.Grid(19, 30); g.poly([[6, 29], [7.5, 11], [11.5, 11], [13, 29]], '#fbf3dc'); g.poly([[6.5, 12], [9.5, 7.5], [12.5, 12]], '#e5535f'); g.rect(8, 22, 3, 7, '#8f563b'); g.outline();
      PX.line(g, 9, 9, 2, 2, '#b8743a'); PX.line(g, 10, 9, 17, 2, '#b8743a'); PX.line(g, 9, 10, 2, 17, '#b8743a'); PX.line(g, 10, 10, 17, 17, '#b8743a'); g.rect(9, 9, 2, 2, '#f6c83a');
      g.px([[3, 3], [4, 4], [16, 3], [15, 4], [3, 16], [4, 15], [16, 16], [15, 15]], '#ffffff'); return g; },
    pillar() { const g = new PX.Grid(11, 25); g.rect(1, 0, 9, 3, '#f6c83a'); g.rect(2, 3, 7, 19, '#ffffff'); g.rect(1, 22, 9, 3, '#f6c83a'); g.outline(); for (let y = 4; y < 22; y++) g.px([[4, y], [6, y]], '#dfe8fb'); g.px([[2, 1], [3, 1]], '#fff9c0'); return g; },
    balloon() { const g = new PX.Grid(11, 26); const c = ['#f07a84', '#d24552', '#8a2433']; g.ell(5.5, 5.5, 4.6, 5.2, c); g.poly([[4, 10], [7, 10], [5.5, 12]], c[1]); g.outline(); for (let y = 13; y < 26; y++) g.set(5 + (y % 4 === 0 ? 1 : 0), y, '#8c93a8'); g.px([[3, 3], [3, 4], [4, 2]], '#ffffff'); return g; },
    arch() { // finish arch: poles + checkered banner + balloons
      const g = new PX.Grid(26, 34); g.rect(2, 7, 2, 27, '#eec39a'); g.rect(22, 7, 2, 27, '#eec39a');
      for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) g.rect(4 + x * 2, 8 + y * 2, 2, 2, (x + y) % 2 ? '#3f3f74' : '#ffffff');
      g.ell(3, 4, 2.4, 2.9, '#e5535f'); g.ell(23, 4, 2.4, 2.9, '#639bff'); g.ell(6.5, 3.5, 1.8, 2.2, '#fbf236'); g.ell(19.5, 3.5, 1.8, 2.2, '#6abe30');
      g.outline(); g.px([[2, 3], [22, 3], [6, 2], [19, 2]], '#ffffff'); return g; },
    gate() { // start gate: poles + bunting
      const g = new PX.Grid(22, 30); g.rect(1, 4, 2, 26, '#eec39a'); g.rect(19, 4, 2, 26, '#eec39a'); g.ell(2, 3, 1.6, 1.6, '#f6c83a'); g.ell(20, 3, 1.6, 1.6, '#f6c83a');
      for (let x = 3; x < 19; x++) { const sag = Math.round(Math.sin((x - 3) / 16 * Math.PI) * 3); g.set(x, 5 + sag, '#8f563b'); if ((x - 3) % 4 === 1) g.poly([[x - 1, 6 + sag], [x + 2, 6 + sag], [x + 0.5, 9.5 + sag]], RAINBOW[((x - 3) >> 2) % 6]); }
      g.outline(); return g; },
  };
  function rprop(kind) { const key = 'rp:' + kind; if (ICO[key] !== undefined) return ICO[key]; let c = null; try { c = RPROP[kind] ? RPROP[kind]().canvas() : null; } catch (e) { console.error('race prop', kind, e); } return (ICO[key] = c); }
  function propSprite(kind, th) {
    if (kind.startsWith('r:')) return rprop(kind.slice(2));
    if (kind.startsWith('c:')) return safeCritter(kind.slice(2));
    return safeProp(kind, TH[th].prop);
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
  // V = { g, W, H, GY, CH, C, camX, t, night, rain, cheer }
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
  function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.8)); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } }

  function drawSky(V, th, key, starA) {
    const { g, W, GY, camX, t } = V;
    const n = V.night || 0, skyH = GY + 6, bandH = Math.ceil(skyH / 4), sc = GY < 30 ? 0.6 : clamp(GY / 58, 1, 1.8);
    for (let i = 0; i < 4; i++) px(g, 0, i * bandH, W, i === 3 ? Math.max(bandH, (V.H || 0) - 3 * bandH) : bandH, th.sky[i]);
    for (let i = 1; i < 4; i++) { // soft dithered seams between sky bands
      const y = i * bandH; g.fillStyle = th.sky[i];
      for (let x = 0; x < W; x += 2) g.fillRect(x + (i & 1), y - 1, 1, 1);
      for (let x = 0; x < W; x += 4) g.fillRect(x + 1 + (i & 1) * 2, y - 2, 1, 1);
      g.fillStyle = th.sky[i - 1]; for (let x = 0; x < W; x += 4) g.fillRect(x + 3 - (i & 1) * 2, y, 1, 1);
    }
    // light rays under the sea
    if (th.rays) {
      g.fillStyle = '#bff4ff';
      const o = Math.floor(camX * 0.05);
      for (let k = Math.floor(o / 40) - 1; k <= Math.floor((o + W) / 40) + 1; k++) {
        const h = hash(k + 5), x0 = k * 40 + (h % 20) - o, wv = 3 + (h >> 4) % 4, al = 0.07 + 0.05 * Math.sin(t * 0.8 + k);
        g.globalAlpha = al; for (let y = 0; y < GY; y++) g.fillRect(x0 + Math.floor(y * 0.45), y, wv, 1);
      }
      g.globalAlpha = 1;
    }
    // stars (always in the Moonlit Grove; fade in at night elsewhere)
    const sa = th.dark ? 1 : th.rays ? 0 : starA;
    if (sa > 0.05) {
      const s0 = Math.floor(camX * 0.05); g.globalAlpha *= sa;
      for (let sx = 0; sx < W; sx++) { const h = hash(sx + s0 + 999); if (h % (th.dark ? 8 : 13) === 0) { const y = (h >> 6) % Math.max(4, GY - 12); px(g, sx, y, 1, 1, (h >> 3) % 5 === 0 ? '#fff27a' : '#ffffff'); if ((h >> 9) % 7 === 0 && ((t * 2 + sx) | 0) % 3 === 0) { px(g, sx - 1, y, 1, 1, '#9fd8ff'); px(g, sx + 1, y, 1, 1, '#9fd8ff'); } } }
      g.globalAlpha /= sa;
    }
    if (th.far2 === 'aurora') { // ribbons of green/purple light
      for (let sx = 0; sx < W; sx++) {
        const a = sx + camX * 0.04, y0 = Math.round(4 * sc + 3 * Math.sin(a * 0.045 + t * 0.4) + 2 * Math.sin(a * 0.11)), col = Math.sin(a * 0.02 + t * 0.2) > 0 ? '#52c7a8' : '#9a6ad0';
        g.fillStyle = col; for (let k = 0; k < 7; k++) { g.globalAlpha = 0.26 - k * 0.035; g.fillRect(sx, y0 + k, 1, 1); }
      }
      g.globalAlpha = 1;
    }
    if (th.dark || (n > 0.6 && !th.rays)) { // moon
      const mx = W - 18 - Math.floor(camX * 0.02) % 6, my = 5;
      const ma = th.dark ? 1 : clamp((n - 0.6) / 0.3, 0, 1); g.globalAlpha = ma;
      g.fillStyle = '#fbf3dc'; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) g.fillRect(mx + x, my + y, 1, 1);
      g.fillStyle = th.sky[0]; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if ((x - 2) * (x - 2) + (y + 1) * (y + 1) <= 10) g.fillRect(mx + x, my + y, 1, 1);
      g.globalAlpha = 1;
    } else if (!th.noSun && n < 0.6 && !V.rain) { // sun with twinkly rays
      const cx = W - 20, cy = GY > 70 ? 28 : Math.round(7 * sc), a = 1 - n / 0.6;
      g.globalAlpha = a * 0.45; disc(g, cx, cy, 6, '#fff6c0'); g.globalAlpha = a;
      disc(g, cx, cy, 4, '#fff27a'); px(g, cx - 2, cy - 2, 2, 1, '#ffffff');
      g.fillStyle = '#fff6c0';
      for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + t * 0.2, rr = 8 + ((k + Math.floor(t * 3)) % 2); g.fillRect(Math.round(cx + Math.cos(an) * rr), Math.round(cy + Math.sin(an) * rr), 1, 1); }
      g.globalAlpha = 1;
    }
    // far-far layer (parallax .12)
    const f2 = Math.floor(camX * 0.12), c2 = th.far2C;
    if (th.far2 === 'mountains' || th.far2 === 'softserve' || th.far2 === 'reefs' || th.far2 === 'isles') {
      for (let sx = 0; sx < W; sx++) {
        const a = sx + f2;
        if (th.far2 === 'mountains') {
          const hf = v => (5 + 17 * (1 - tri(v / 33)) * (0.55 + 0.45 * tri(v / 97 + 0.3)) + 2 * tri(v / 7)) * sc, hh = Math.round(hf(a)), top = GY - hh - 3, lit = hf(a + 1) > hf(a);
          px(g, sx, top, 1, GY - top, lit ? c2[1] : c2[0]); if (hh > 15 * sc) px(g, sx, top, 1, Math.min(4, hh - Math.round(15 * sc) + 1), c2[2]);
        } else if (th.far2 === 'softserve') {
          const P = 46, k = Math.floor(a / P), d = a - k * P - P / 2, r = 14 + hash(k + 3) % 7;
          const hh = Math.round(Math.max(0, r - Math.abs(d)) * 1.25 * sc); if (hh <= 0) continue;
          const top = GY - hh - 3, col = hash(k + 3) % 2 ? c2[0] : c2[2];
          px(g, sx, top, 1, GY - top, col); for (let y = top + 2; y < GY; y += 5) px(g, sx, y + ((a + k) % 5 === 0 ? 1 : 0), 1, 1, c2[1]);
          if (Math.abs(d) < 1 && hh > 4) px(g, sx, top - 1, 1, 1, '#e5535f');
        } else if (th.far2 === 'reefs') {
          let hh = (9 + 4 * Math.sin(a * 0.09) + 3 * Math.sin(a * 0.23 + 1)) * sc; if (mod(a, 13) < 2) hh += 5 * sc;
          const top = GY - Math.round(hh) - 2; px(g, sx, top, 1, GY - top, c2[mod(a, 29) < 3 ? 1 : 0]);
        } else if (th.far2 === 'isles') {
          const P = 58, k = Math.floor(a / P), h = hash(k + 17), w = 10 + h % 12, d = a - (k * P + 16 + (h >> 5) % 26);
          if (Math.abs(d) > w / 2) continue;
          const by = Math.round(GY - 20 * sc - (h >> 8) % 9), dep = Math.round((w / 2 - Math.abs(d)) * 0.9);
          px(g, sx, by, 1, 1, '#b6f06a'); px(g, sx, by + 1, 1, 1, '#6abe30'); px(g, sx, by + 2, 1, dep, (a & 3) ? '#c8b8a4' : '#a8967f');
          if (h % 2 && Math.abs(d) <= 2) px(g, sx, by - 3 + (Math.abs(d) >> 1), 1, 3 - (Math.abs(d) >> 1), '#37946e');
          if (d === Math.round(w / 4)) { for (let y = by + 2 + dep; y < GY; y++) px(g, sx, y, 1, 1, ((y + Math.floor(t * 8)) % 3) ? '#e6f6ff' : '#9fd8ff'); }
        }
      }
    }
    // clouds (parallax .15) — or fish schools under the sea
    const pf = puffs(key);
    if (pf.length) {
      const cx0 = Math.floor(camX * 0.15), sp = GY > 70 ? 42 : th.style === 'island' ? 50 : 70, ymax = Math.max(2, Math.min(Math.round(7 * sc) + (GY > 70 ? GY - 60 : 0), GY - 20));
      for (let k = Math.floor((cx0 - 40) / sp); k <= Math.floor((cx0 + W + 20) / sp); k++) {
        const h = hash(k + 11), spr = pf[h % 3];
        g.drawImage(spr, k * sp + (h % 30) - cx0, 2 + ((h >> 4) % ymax));
      }
    }
    if (th.surface) { // shimmering light at the water surface
      for (let sx = 0; sx < W; sx++) { const y = Math.round(1 + Math.sin((sx + camX * 0.1) * 0.21 + t * 2) * 1.2); px(g, sx, y, 1, 1, '#d8fbff'); if ((sx + Math.floor(t * 3)) % 5 === 0) px(g, sx, y + 2, 1, 1, '#9fe8f8'); }
    }
    if (th.fish) { // little schools swimming left
      const cx0 = Math.floor(camX * 0.2);
      for (let k = Math.floor((cx0 - 60) / 80); k <= Math.floor((cx0 + W + 60) / 80); k++) {
        const h = hash(k + 71), n2 = 3 + h % 3, bx = k * 80 + (h % 40) - cx0 - Math.floor(t * (4 + h % 5)) % 80, by = 10 + (h >> 6) % Math.max(4, GY - 30);
        const col = ['#ffcc44', '#ff8a6a', '#fff27a', '#c9a2f0'][h % 4], fin = ['#df7126', '#c04a4c', '#f6a91a', '#8c6cc4'][h % 4];
        for (let i = 0; i < n2; i++) {
          const fx = bx + i * 7 + (hash(k * 7 + i) % 3), fy = by + (hash(k * 13 + i) % 7) + Math.round(Math.sin(t * 2 + i) * 0.8), wag = (Math.floor(t * 6) + i) & 1;
          px(g, fx, fy, 3, 2, col); px(g, fx + 1, fy + 1, 2, 1, fin); px(g, fx, fy, 1, 1, INK); px(g, fx + 3, fy - wag + 0, 1, 1, fin); px(g, fx + 3, fy + 1 + wag - 0, 1, 1, fin);
        }
      }
    }
    if (th.bubbles) { // bubbles drifting up
      for (let k = 0; k < 16; k++) {
        const h = hash(k + 901), span = GY + 6, bx = mod((h % 700) - Math.floor(camX * 0.45), W + 10) - 5 + Math.round(Math.sin(t * 2 + k) * 1.2), by = GY + 2 - mod(Math.floor(t * (7 + h % 9)) + (h >> 6), span);
        if ((h >> 3) % 3 === 0) { px(g, bx - 1, by, 1, 1, '#d8fbff'); px(g, bx + 1, by, 1, 1, '#d8fbff'); px(g, bx, by - 1, 1, 1, '#d8fbff'); px(g, bx, by + 1, 1, 1, '#d8fbff'); }
        else px(g, bx, by, 1, 1, '#d8fbff');
      }
    }
    // far + near layers
    const hA = Math.floor(camX * 0.3), hB = Math.floor(camX * 0.55);
    const fc = th.farC, nc = th.nearC;
    const small = sc;
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
        const hh = Math.round((6 + 9 * tri(a / 23) + 3 * tri(a / 9 + 0.3)) * small);
        px(g, sx, GY - hh, 1, 1, '#5a5ab8'); px(g, sx, GY - hh + 1, 1, hh, fc[0]);
      } else if (th.far === 'gumdrops') {
        const P = 26, k = Math.floor(a / P), d = a - k * P - P / 2, r = 9 + hash(k) % 4;
        const hh = Math.round(Math.sqrt(Math.max(0, r * r - d * d)) * small * 0.9);
        if (hh > 0) { const col = fc[hash(k) % 2]; px(g, sx, GY - hh, 1, 1, '#ffffff'); px(g, sx, GY - hh + 1, 1, hh, col); if (hh > 3 && Math.abs(d) < 2) px(g, sx, GY - hh + 2, 1, 1, '#ffffff'); }
      } else if (th.far === 'reef') { // colourful coral heads and fans
        const P = 19, k = Math.floor(a / P), hk = hash(k + 9), d = a - k * P - P / 2, r = 4 + hk % 5;
        const bump = Math.round(Math.sqrt(Math.max(0, r * r - d * d)) * (hk % 3 === 0 ? 1.4 : 0.8) * small);
        if (bump > 0) {
          const col = fc[hk % 3], top = GY - bump;
          px(g, sx, top, 1, bump, col); px(g, sx, top, 1, 1, fc[3]);
          for (let y = top + 2; y < GY; y += 3) if ((a + y) % 3 === 0) px(g, sx, y, 1, 1, fc[3]);
        }
      } else if (th.far === 'cloudsea') {
        const hh = Math.round((5 + 2 * Math.sin(a * 0.1) + 2.5 * Math.abs(Math.sin(a * 0.045))) * small);
        px(g, sx, GY - hh, 1, hh, fc[0]); px(g, sx, GY - 2, 1, 2, fc[1]);
      }
      // near layer
      const h2 = Math.round((3 + 2 * Math.sin(b * 0.11 + 0.5) + 1.5 * Math.sin(b * 0.27)) * small);
      if (th.near === 'clouds') {
        const hc = Math.round((3 + 2.5 * Math.abs(Math.sin(b * 0.09)) + 1.5 * Math.abs(Math.sin(b * 0.23 + 1))) * small);
        px(g, sx, GY - hc, 1, hc, nc[0]); px(g, sx, GY - 1, 1, 1, nc[1]);
      } else if (h2 > 0) {
        let top = GY - h2;
        if (th.near === 'trees') { const P = 17, k = Math.floor(b / P), d = b - (k * P + 8 + hash(k + 1) % 4), r = 3 + hash(k + 1) % 3; if (hash(k + 1) % 3 && Math.abs(d) <= r) top -= Math.round(Math.sqrt(r * r - d * d) * 1.2 * small); }
        if (th.near === 'pines') { const P = 13, k = Math.floor(b / P), d = b - (k * P + 6), r = 3 + hash(k + 2) % 2; if (hash(k + 2) % 4 && Math.abs(d) <= r) top -= Math.round((r - Math.abs(d)) * 2.4 * small + 1); }
        px(g, sx, top, 1, 1, nc[0]); px(g, sx, top + 1, 1, GY - top - 1, nc[1]);
      }
    }
    if (th.style === 'island' && V.H > GY) { px(g, 0, GY, W, V.H - GY, nc[1]); for (let sx = 0; sx < W; sx++) if (hash(sx + hB + 7) % 9 === 0) px(g, sx, GY + 2 + hash(sx + hB) % Math.max(1, V.H - GY - 3), 1, 1, '#ffffff'); }
    if (th.near === 'kelp') { // swaying seaweed
      const o = Math.floor(camX * 0.55);
      for (let k = Math.floor(o / 9) - 1; k <= Math.floor((o + W) / 9) + 1; k++) {
        const h = hash(k + 33); if (h % 3 === 0) continue;
        const bx = k * 9 + h % 6 - o, hh = Math.round((6 + h % 10) * small);
        for (let y = 0; y < hh; y++) px(g, bx + Math.round(Math.sin(t * 1.4 + y * 0.35 + k) * 1.3 * y / hh), GY - 1 - y, 1, 1, y % 4 ? nc[1] : nc[0]);
      }
    }
    if (th.boat) { const bx = mod(Math.floor(-camX * 0.3 + t * 3), W + 60) - 30, by = GY - Math.round(8 * small); px(g, bx, by - 2, 7, 2, '#8f563b'); px(g, bx + 1, by - 1, 5, 1, '#663931'); px(g, bx + 3, by - 9, 1, 7, '#595652'); px(g, bx + 4, by - 8, 3, 5, '#ffffff'); px(g, bx + 4, by - 8, 1, 1, '#e5535f'); }
    // ambient life
    if (th.birds && n < 0.5) {
      for (let k = 0; k < 3; k++) {
        const h = hash(k + 401), bx = mod(Math.floor((h % 300) - camX * 0.2 + t * (6 + k * 2)), W + 40) - 20, by = 4 + (h >> 7) % Math.max(4, Math.round(GY * 0.35)) + Math.round(Math.sin(t + k) * 1.5), up = (Math.floor(t * 5) + k) & 1;
        g.fillStyle = th.dark ? '#9fd8ff' : '#3f3f74'; g.fillRect(bx, by, 1, 1); g.fillRect(bx - 1, by - up, 1, 1); g.fillRect(bx + 1, by - up, 1, 1); g.fillRect(bx - 2, by - 1 + up * 0, 1, 1); g.fillRect(bx + 2, by - 1, 1, 1);
      }
    }
    if (th.fireflies || (n > 0.6 && th.near === 'trees')) {
      for (let k = 0; k < 9; k++) {
        const h = hash(k + 77), fx = mod(Math.floor((h % 400) - camX * 0.6 + Math.sin(t * 0.7 + k) * 6), W), fy = GY - 4 - (h >> 5) % Math.max(4, Math.round(GY * 0.5)) + Math.round(Math.sin(t * 1.3 + k * 2) * 2);
        if ((Math.floor(t * 2) + k) % 5 === 0) continue; px(g, fx, fy, 1, 1, '#eaffa0'); g.globalAlpha = 0.35; px(g, fx - 1, fy, 3, 1, '#b6f06a'); px(g, fx, fy - 1, 1, 3, '#b6f06a'); g.globalAlpha = 1;
      }
    }
  }

  function drawGround(V) {
    const { g, W, H, GY, CH, C, camX, t } = V;
    for (let sx = 0; sx < W; sx++) {
      const wx = camX + sx, s = segAtC(C, wx), hs = hash(wx), th = TH[themeAt(C, wx)], st = th.style;
      if (s.type === 'climb') {
        const R = th.rock, e = Math.round(CH * clamp((wx - s.x0 + 1) / s.len, 0, 1)), top = GY - e;
        if (st === 'island') { // rainbow bridge: an arch of colour with sky showing below
          px(g, sx, top - 1, 1, 1, INK); px(g, sx, top, 1, 1, '#ffffff');
          for (let k = 0; k < 6; k++) px(g, sx, top + 1 + k, 1, 1, R[k]);
          px(g, sx, top + 7, 1, 1, INK);
          if (hs % 6 === 0) px(g, sx, top, 1, 1, '#fff27a');
          continue;
        }
        px(g, sx, top, 1, H - top, R[0]);
        for (let y = top + 1; y < H; y++) {
          if (st === 'reef') { // rounded coral polyps in staggered rows
            const ry = y - GY + 20, row = Math.floor(ry / 3), cx = mod(wx + (row & 1) * 2, 4), cy = mod(ry, 3);
            if (cy === 2 || cx === 3) px(g, sx, y, 1, 1, R[1]); else if (cy === 0 && cx === 0) px(g, sx, y, 1, 1, R[2]); else if (hash(wx * 7 + row * 131) % 13 === 0) px(g, sx, y, 1, 1, R[4]);
            continue;
          }
          if (th.stripes) { if (((wx + y) >> 1) % 4 === 0) px(g, sx, y, 1, 1, R[4]); else if (((wx + y) >> 1) % 4 === 1) px(g, sx, y, 1, 1, R[2]); continue; }
          const bx = (wx + (((y - GY) >> 2) & 1) * 3);
          if ((y - GY) % 4 === 3 || bx % 6 === 0) px(g, sx, y, 1, 1, R[1]);
          else if (bx % 6 === 1 && (y - GY) % 4 === 0) px(g, sx, y, 1, 1, R[2]);
        }
        px(g, sx, top, 1, 1, R[3]); px(g, sx, top - 1, 1, 1, INK);
        if (hs % 9 === 0 && e > 1) px(g, sx, top - 1, 1, 1, R[4]);
        if (st === 'reef' && hs % 5 === 0) px(g, sx, top - 2, 1, 1, R[4]);
        if (wx === s.x1 - 1) px(g, sx, top - 1, 1, H - top + 1, INK);
      } else if (s.type === 'fly') {
        if (st === 'reef') { // riding the current over the sea floor
          px(g, sx, H - 2, 1, 2, '#e2c98a'); px(g, sx, H - 3, 1, 1, '#f4e2b0');
          for (let y = GY - 2; y < H - 3; y += 3) if (mod(wx + y * 5 - Math.floor(t * 45), 19) < 3) px(g, sx, y, 1, 1, '#bff4ff');
          if (hs % 13 === 0) px(g, sx, H - 4, 1, 1, '#f7806a');
          continue;
        }
        const c = th.cloud, ct = GY + 2 + Math.round(1.2 * Math.sin(wx * 0.33) + Math.sin(wx * 0.13 + t * 0.8));
        px(g, sx, ct - 1, 1, 1, c[0]); px(g, sx, ct, 1, 1, c[1]); px(g, sx, ct + 1, 1, H - ct, c[2]);
        if (hs % 5 === 0) px(g, sx, ct + 2, 1, 1, c[1]);
        if (wx === s.x1 - 1) px(g, sx, GY - 1, 1, H - GY + 1, INK);
      } else if (s.type === 'swim') {
        const w = th.water;
        px(g, sx, GY + 1, 1, 1, w[0]); px(g, sx, GY + 2, 1, H - GY - 4, w[1]); px(g, sx, H - 2, 1, 2, w[2]);
        if (hs % 17 === 0) px(g, sx, H - 3, 1, 1, st === 'reef' ? '#f7806a' : w[2]);
        if (wx === s.x0 || wx === s.x1 - 1) px(g, sx, GY, 1, H - GY, INK);
      } else {
        const tp = th.top;
        if (st === 'island' && !s.after && wx >= 0) { // floating island: grass, earth, rocky underside that tapers at the ends
          const e = Math.min(wx - s.x0, s.x1 - 1 - wx), dep = Math.min(H - GY, 3 + Math.floor(e * 0.8));
          if (e < 0) continue;
          px(g, sx, GY, 1, 1, tp[0]); px(g, sx, GY + 1, 1, 1, tp[1]);
          for (let y = GY + 2; y < GY + dep; y++) px(g, sx, y, 1, 1, (hash(wx * 3 + y) % 5 === 0) ? th.soilDot : th.soil);
          px(g, sx, GY + dep, 1, 1, INK);
          if (e === 0) px(g, sx, GY - 1, 1, dep + 1, INK);
          if (th.tuft && hs % 6 === 0) px(g, sx, GY - 1, 1, 1, th.tuft);
          if (hs % 29 === 0) px(g, sx, GY - 1, 1, 1, th.dots[(hs >> 5) % 2]);
          if (wx === 0) px(g, sx, GY, 1, 2, '#ffffff');
          continue;
        }
        px(g, sx, GY, 1, 1, (hs % 3 === 0 && !th.sprinkles) ? tp[1] : tp[0]); px(g, sx, GY + 1, 1, 2, tp[1]); px(g, sx, GY + 3, 1, 1, tp[3]);
        px(g, sx, GY + 4, 1, H - GY - 4, th.soil);
        if (th.sprinkles) { if (hs % 4 === 0) px(g, sx, GY + 5 + (hs >> 3) % Math.max(1, H - GY - 6), 1, 1, th.dots[(hs >> 5) % th.dots.length]); if (hs % 3 === 0) px(g, sx, GY + 3, 1, 1, tp[0]); }
        else {
          if (hs % 5 === 0) px(g, sx, GY + 4 + (hs >> 3) % 2, 1, 1, th.soilDot);
          if (H - GY > 8) { // deep ground (time trial): strata, pebbles and roots
            if (hs % 11 === 0) px(g, sx, GY + 6 + (hs >> 4) % Math.max(1, H - GY - 7), 2, 1, th.soilDot);
            for (let y = GY + 9; y < H; y += 7) { const q = hash(wx * 3 + y * 17); if (q % 4 === 0) px(g, sx, y + (q >> 4) % 2, 1, 1, th.soilDot); if (q % 37 === 0) { px(g, sx, y + 2, 3, 2, th.rock[1]); px(g, sx, y + 2, 2, 1, th.rock[2]); } }
            if (th.tuft && hs % 23 === 0) for (let y = 0; y < 3 + hs % 4; y++) px(g, sx + (y >> 1), GY + 4 + y, 1, 1, th.soilDot);
          }
          if (st === 'reef' && hs % 23 === 0) px(g, sx, GY + 1, 1, 1, '#f7806a');
        }
        if (th.tuft && hs % 7 === 0) px(g, sx, GY - 1, 1, 1, th.tuft);
        if (th.tuft && hs % 19 === 0) px(g, sx, GY - 2, 1, 2, th.tuft);
        if (hs % 31 === 0) { if (th.tuft) px(g, sx, GY - 1, 1, 1, th.top[3]); px(g, sx, GY - (th.tuft ? 2 : 1), 1, 1, th.dots[(hs >> 5) % 2]); }
        if (V.rain && mod(wx, 37) < 7 && !s.after) { px(g, sx, GY, 1, 1, ((wx + Math.floor(t * 5)) % 5) ? '#9fc4ff' : '#ffffff'); }
        if (wx === 0) px(g, sx, GY, 1, 4, '#ffffff');
        if (wx === C.LEN || wx === C.LEN + 1) for (let y = 0; y < 4; y++) px(g, sx, GY + y, 1, 1, ((wx + y) & 1) ? INK : '#ffffff');
      }
    }
  }
  function drawFence(V) {
    const { g, W, GY, C, camX } = V;
    for (const s of C.segs) {
      if (s.type !== 'run' || hash(s.x0 + 5) % 3 === 0 || s.x1 < camX || s.x0 > camX + W) continue;
      const th = TH[themeAt(C, s.x0 + 1)]; if (!th.fence) continue;
      const a = s.x0 + 6, b = s.x1 - 6;
      for (let wx = Math.max(a, camX - 2); wx <= Math.min(b, camX + W + 2); wx++) {
        const sx = wx - camX, post = mod(wx - a, 12) === 0;
        if (th.fence === 'wood') { if (post) { px(g, sx, GY - 6, 1, 6, '#8f563b'); px(g, sx, GY - 7, 1, 1, '#b8743a'); } else { px(g, sx, GY - 5, 1, 1, '#b8743a'); px(g, sx, GY - 3, 1, 1, '#b8743a'); } }
        else if (th.fence === 'rope') { if (post) px(g, sx, GY - 5, 1, 5, '#b8743a'); else { const sg = Math.round(Math.sin(mod(wx - a, 12) / 12 * Math.PI) * 1.5); px(g, sx, GY - 5 + sg, 1, 1, '#eec39a'); } }
        else if (th.fence === 'cane') { if (post) { for (let y = 0; y < 7; y++) px(g, sx, GY - 1 - y, 1, 1, y % 2 ? '#e5535f' : '#ffffff'); px(g, sx + 1, GY - 7, 1, 1, '#e5535f'); } else if (mod(wx - a, 12) < 11) px(g, sx, GY - 4, 1, 1, '#f7b6c8'); }
      }
    }
  }
  function drawProps(V, glow) {
    const { g, W, GY, C, camX, t } = V;
    if (!glow) drawFence(V);
    for (const d of C.decor) {
      if (d.glow !== glow) continue;
      const sx = d.x - camX; if (sx < -30 || sx > W + 30) continue;
      const spr = propSprite(d.kind, d.th); if (!spr || spr.height > GY + 1) continue;
      PX.blit(g, spr, sx, GY + 1, d.flip);
    }
    if (glow) return;
    const gate = rprop('gate'), arch = rprop('arch');
    if (gate && gate.height <= GY + 1) { const sx = -21 - camX; if (sx > -30 && sx < W + 10) g.drawImage(gate, sx, GY + 1 - gate.height); }
    if (arch && arch.height <= GY + 1) { const sx = C.LEN - camX; if (sx > -30 && sx < W + 10) g.drawImage(arch, sx - 3, GY + 1 - arch.height); }
    else { const fx = C.LEN + 3 - camX; if (fx > -14 && fx < W + 14) PX.blit(g, icon('bigflag'), fx, GY + 1, false, 2, 26); }
    // the cheering crowd at the start and the finish
    if (C.crowd) for (const c of C.crowd) {
      const sx = c.x - camX; if (sx < -20 || sx > W + 20) continue;
      const spr = safeCritter(c.kind); if (!spr || spr.height > GY) continue;
      const hop = V.cheer && c.x > 0 ? Math.round(Math.abs(Math.sin(t * 7 + c.ph)) * 3) : (Math.sin(t * 2 + c.ph) > 0.93 ? 1 : 0);
      PX.blit(g, spr, sx, GY + 1 - hop, c.flip);
    }
  }
  function drawWorld(V) {
    const { g, W, H, C, camX } = V;
    g.clearRect(0, 0, W, H);
    const vt = viewTheme(C, camX + (V.focus == null ? W / 2 : V.focus));
    const n = V.night, starA = clamp((n - 0.3) / 0.5, 0, 1);
    drawSky(V, TH[vt.a], vt.a, starA);
    if (vt.b && vt.k > 0.02) { g.globalAlpha = vt.k; drawSky(V, TH[vt.b], vt.b, starA); g.globalAlpha = 1; }
    if (V.rain) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3; px(g, 0, 0, W, V.GY + 2, '#8a94b8'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
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
      const w = TH[themeAt(C, wx)].water, sh = (wx + Math.floor(t * 6)) % 9 === 0, crest = Math.sin(wx * 0.4 - t * 4) > 0.75;
      px(g, sx, GY + 1, 1, 1, sh ? '#ffffff' : w[0]);
      if (crest) px(g, sx, GY, 1, 1, w[0]);
      for (let y = GY + 2; y < H; y++) {
        if (y <= GY + 3 && ((sx + y) & 1)) continue; // dither so a bit of the swimmer shows through
        px(g, sx, y, 1, 1, y >= H - 2 ? w[2] : ((wx * 3 + y * 5 + Math.floor(t * 4)) % 23 === 0 ? w[3] : w[1]));
      }
      // rising bubbles
      const bh = hash(wx * 5 + 3); if (bh % 29 === 0) { const by = H - 2 - mod(Math.floor(t * 9 + bh), Math.max(1, H - GY - 3)); if (by > GY + 2) px(g, sx, by, 1, 1, w[3]); }
      if (wx === s.x0 || wx === s.x1 - 1) px(g, sx, GY, 1, H - GY, INK);
    }
    if (V.tint > 0.01) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = V.tint * 0.55; px(g, 0, 0, W, H, '#2a2a6a'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  }

  // =====================================================================
  // Scene state
  // =====================================================================
  let root = null, hubEl = null, raceEl = null, stageEl = null, cv = null, ctx = null;
  let visible = false, race = null, hubDirty = true, partnerCv = null, partnerT = 0, lastNightBucket = -1, hubTab = 'races', hubClockT = 0, hubDay = '';
  const lo = document.createElement('canvas'), lx = lo.getContext('2d');
  const bgC = document.createElement('canvas'), bg = bgC.getContext('2d');
  const fgC = document.createElement('canvas'), fg = fgC.getContext('2d');
  const dkC = document.createElement('canvas'), dk = dkC.getContext('2d');
  const silC = document.createElement('canvas'), sil = silC.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1, PXS = 4, WW = 100, WH = 150, LH = 40, GY = 34, CLIMB_H = 10, PSX = 34, NL = 4;
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
          <button class="btn r-quit" aria-label="Leave race">✕</button>
          <div class="r-hrow"><span class="label">Stamina</span><div class="bar"><i class="r-stam"></i></div><span class="num r-time">0.0s</span></div>
        </div>
        <div class="r-stage">
          <canvas class="px r-cv" aria-label="Race track. Tap when the ring meets the circle."></canvas>
          <div class="hint r-hint" hidden>Tap anywhere when the ring meets the circle!</div>
          <div class="hint r-ihint" hidden>You got an item! Tap this button to use it.</div>
          <button class="btn primary r-skip" hidden>Skip to results</button>
          <button class="r-item" hidden aria-label="Use item"><canvas class="px"></canvas><span>Item</span></button>
          <div class="overlay r-ov r-results" hidden></div>
          <div class="overlay r-ov r-leave" hidden><div class="card">
            <div class="eyebrow">Paused</div><h1>Leave this race?</h1>
            <p class="r-leave-p">You won't earn coins or XP for a race you leave.</p>
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
    $r('.r-item').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); PX.Sound.unlock(); useItem(); });
    $r('.r-skip').addEventListener('click', e => { e.stopPropagation(); skipToEnd(); });
    $r('.r-quit').addEventListener('click', () => {
      if (!race || race.state === 'done' || race.shown) return; PX.Sound.play('pop'); race.paused = true;
      $r('.r-leave-p').textContent = race.mode === 'trial' ? 'This run won’t count if you leave.' : 'You won’t earn coins or XP for a race you leave.';
      $r('.r-leave').hidden = false;
    });
    $r('.r-leave-no').addEventListener('click', () => { PX.Sound.play('pop'); $r('.r-leave').hidden = true; if (race) race.paused = false; });
    $r('.r-leave-yes').addEventListener('click', () => { PX.Sound.play('pop'); $r('.r-leave').hidden = true; abortRace(); showHub(); });
    window.addEventListener('keydown', e => {
      if (!visible || !race || race.paused || race.state !== 'run') return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tap(); }
      if (e.code === 'KeyX' || e.code === 'ArrowUp') { e.preventDefault(); useItem(); }
    });
    window.addEventListener('resize', () => { if (visible && race) resize(); if (visible && !race) hubDirty = true; });
    PS.on('sprout:update', () => { if (!race) hubDirty = true; });
    PS.on('reset', () => { hubDirty = true; });
    if (document.fonts && document.fonts.load) document.fonts.load('700 20px "Pixelify Sans"').catch(() => {});
  }

  function show(params) {
    visible = true; params = params || {};
    if (race) { abortRace(); }
    if (params.tab && ['races', 'cup', 'trial'].includes(params.tab)) hubTab = params.tab;
    showHub();
    if (params.race) { const ri = ALL.findIndex(r => r.id === params.race); if (ri >= 0) startRace(ri, params.tier || 0); }
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
    hubClockT -= dt;
    if (hubClockT <= 0) {
      hubClockT = 1;
      const dkey = dayKey(); if (dkey !== hubDay) { hubDay = dkey; hubDirty = true; }
      const nx = hubEl && hubEl.querySelector('.r-next'); if (nx) nx.textContent = `New cup in ${fmtWait(msToMidnight())}`;
    }
    if (hubDirty) renderHub();
    partnerT += dt;
    if (partnerCv && partnerT > 0.18) { partnerT = 0; drawPartner(t); }
  }

  // =====================================================================
  // HUB
  // =====================================================================
  function lockReason(R, tier) {
    if (tier > 0 && !prog(R, tier - 1).wins) return `Win ${D.RACE_TIERS[tier - 1].name} to unlock`;
    if (R.unlock) { const U = byId(R.unlock.race); return `Win ${U ? U.name : R.unlock.race} ${D.RACE_TIERS[R.unlock.tier].name} to unlock`; }
    return 'Locked';
  }
  function matchOf(s, ri, tier) {
    if (!s) return null;
    const R = ALL[ri], Tr = D.RACE_TIERS[tier];
    const p = avgRating(s, R);
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
  function medalCount() { const x = xsRead(); if (!x || !x.trials) return 0; return Object.values(x.trials).reduce((a, tr) => a + (tr && tr.m ? Math.min(3, tr.m) : 0), 0); }
  function renderHub() {
    hubDirty = false;
    const s = ST.active();
    const scroll = hubEl.scrollTop;
    const openSeries = ALL.filter(R => unlocked(R, 0)).length;
    const cup = cupToday();
    const chip = hubTab === 'races' ? `${openSeries} of ${ALL.length} open` : hubTab === 'cup' ? 'New every day' : `${medalCount()} medal${medalCount() === 1 ? '' : 's'}`;
    let html = `<div class="r-head"><div><div class="label">${hubTab === 'races' ? 'Race series' : hubTab === 'cup' ? 'Special race' : 'Beat your best'}</div><h2 class="px-title">${hubTab === 'races' ? 'Races' : hubTab === 'cup' ? 'Daily Cup' : 'Time Trial'}</h2></div><span class="r-count">${chip}</span></div>`;
    if (!s) {
      html += `<div class="card r-empty"><canvas class="px r-ecv"></canvas><h3>No racer yet</h3><p>Hatch your first egg in the Garden, then come back to race.</p><button class="btn go wide r-togarden">Go to the Garden</button></div>`;
      hubEl.innerHTML = html;
      const ec = hubEl.querySelector('.r-ecv'), egg = safeItem('egg', 'meadow'); if (egg) paintTo(ec, egg, 24, 28);
      hubEl.querySelector('.r-togarden').onclick = () => { PX.Sound.play('pop'); PS.ui.go('garden'); };
      partnerCv = null; return;
    }
    html += `<div class="r-tabs" role="tablist">${[['races', 'Races'], ['cup', 'Daily Cup'], ['trial', 'Time Trial']].map(([id, label]) =>
      `<button class="r-tab" role="tab" data-tab="${id}" aria-selected="${hubTab === id}"><canvas class="px" data-tic="tab-${id}"></canvas>${label}${id === 'cup' && cup.best == null ? '<i class="r-badge" title="Today’s cup is ready"></i>' : ''}</button>`).join('')}</div>`;
    const fi = ST.formInfo(s), rate = k => (k === 'stamina' ? ST.staminaRating(s) : ST.raceRating(s, k)).toFixed(1);
    html += `<div class="panel r-partner"><canvas class="px r-pc" width="40" height="40"></canvas><div>
      <div class="r-ptop"><div><div class="label">Your racer</div><div class="r-pname">${esc(s.name)}</div></div><button class="btn r-change">Change</button></div>
      <div class="r-pform">${esc(fi.name)} · Lv ${ST.totalLevels(s)}</div>
      <div class="r-rates">${['run', 'swim', 'climb', 'fly', 'stamina'].map(k => `<div class="r-rate"><small>${k === 'stamina' ? 'Stam' : k === 'fly' ? 'Fly' : SEG_META[k].label}</small><b>${rate(k)}</b></div>`).join('')}</div>
    </div></div>`;
    if (hubTab === 'cup') html += cupHtml(s, cup);
    else if (hubTab === 'trial') html += trialHtml(s);
    else html += racesHtml(s);
    hubEl.innerHTML = html;
    hubEl.scrollTop = scroll;
    partnerCv = hubEl.querySelector('.r-pc'); drawPartner(0);
    hubEl.querySelector('.r-change').onclick = () => {
      PX.Sound.play('pop');
      PS.ui.pickSprout({ title: "Who's racing?", eyebrow: 'Races', extra: x => `Run ${ST.raceRating(x, 'run').toFixed(1)} · Swim ${ST.raceRating(x, 'swim').toFixed(1)} · Climb ${ST.raceRating(x, 'climb').toFixed(1)} · Fly ${ST.raceRating(x, 'fly').toFixed(1)}`,
        onPick: x => { ST.setActive(x.id); hubDirty = true; } });
    };
    hubEl.querySelectorAll('.r-tab').forEach(b => { b.onclick = () => { if (hubTab === b.dataset.tab) return; PX.Sound.play('tick'); hubTab = b.dataset.tab; hubEl.scrollTop = 0; hubDirty = true; renderHub(); hubEl.scrollTop = 0; }; });
    hubEl.querySelectorAll('canvas[data-tic]').forEach(c => paintTo(c, icon(c.dataset.tic), 16, 16));
    hubEl.querySelectorAll('canvas[data-ic]').forEach(c => paintTo(c, icon(c.dataset.ic), 12, 12));
    hubEl.querySelectorAll('.r-prize canvas, .r-cupprize canvas.r-cc').forEach(c => paintTo(c, icon('coin'), 11, 11));
    hubEl.querySelectorAll('.r-eggic canvas').forEach(c => { const e = safeItem('egg', c.dataset.area); if (e) paintTo(c, e, 20, 24); });
    hubEl.querySelectorAll('.r-lock canvas').forEach(c => paintTo(c, icon('lock'), 13, 13));
    hubEl.querySelectorAll('canvas[data-medal]').forEach(c => paintTo(c, icon('medal' + c.dataset.medal), 11, 14));
    hubEl.querySelectorAll('canvas[data-mod]').forEach(c => paintTo(c, icon('mod-' + c.dataset.mod), c.dataset.mod === 'giant' ? 32 : 16, c.dataset.mod === 'giant' ? 32 : 16));
    hubEl.querySelectorAll('.r-tier').forEach(b => {
      b.onclick = () => {
        const ri = +b.dataset.ri, ti = +b.dataset.tier; if (!unlocked(ALL[ri], ti)) return;
        PX.Sound.unlock(); PX.Sound.play('go');
        if (b.dataset.mode === 'trial') startTrial(ri, ti); else startRace(ri, ti);
      };
    });
    const cg = hubEl.querySelector('.r-cupgo'); if (cg) cg.onclick = () => { PX.Sound.unlock(); PX.Sound.play('go'); startCup(); };
    // banners after layout so we know the width (integer 3x scale)
    const bw = hubEl.querySelector('.r-banner');
    const w = bw ? bw.clientWidth : 320;
    hubEl.querySelectorAll('.r-bn').forEach(c => drawBanner(c, +c.dataset.ri, w, { H: +c.dataset.h || 30 }));
    const cb = hubEl.querySelector('.r-cupbn');
    if (cb) { const info = dailyInfo(); drawBanner(cb, info.ri, w, { C: cupCourse(info, s), mod: info.mod, look: ST.lookOf(s) }); }
  }
  function seriesSub(R) {
    const order = SEGS.filter(k => R.mix[k]).sort((a, b) => R.mix[b] - R.mix[a]);
    const area = D.AREAS[R.area] ? D.AREAS[R.area].name : '';
    return `${R.id === 'grand' ? 'Every area in one long course.' : R.extra ? esc(R.blurb) : esc(area) + ' course'} · ${order.map(k => SEG_META[k].label.toLowerCase()).join(', ')}`;
  }
  function racesHtml(s) {
    let html = '<div class="r-list">';
    HUB_ORDER.forEach((ri, n) => {
      const R = ALL[ri], open = unlocked(R, 0);
      const W = SEGS.reduce((a, k) => a + (R.mix[k] || 0), 0);
      const order = SEGS.filter(k => R.mix[k]).sort((a, b) => R.mix[b] - R.mix[a]);
      const fresh = open && R.extra && !prog(R, 0).runs;
      html += `<div class="panel r-card${open ? '' : ' locked'}" data-ri="${ri}">
        <div class="r-banner"><canvas class="px r-bn" data-ri="${ri}"></canvas><span class="r-num">Series ${n + 1}</span>${open ? (fresh ? '<span class="r-new">New!</span>' : '') : `<span class="r-lockchip">Locked</span>`}</div>
        <div class="r-body">
          <div class="r-title">${esc(R.name)}</div>
          <div class="r-sub">${seriesSub(R)}</div>
          <div class="r-mixbar">${SEGS.filter(k => R.mix[k]).map(k => `<i style="width:${(R.mix[k] / W * 100).toFixed(1)}%;background:${SEG_META[k].color}"></i>`).join('')}</div>
          <div class="r-mix">${order.map(k => `<span class="r-mixchip"><canvas class="px" data-ic="${k}"></canvas>${SEG_META[k].label} <span>${Math.round(R.mix[k] / W * 100)}%</span></span>`).join('')}</div>
          <div class="r-tiers">${D.RACE_TIERS.map((Tr, ti) => tierRow(s, ri, ti)).join('')}</div>
        </div></div>`;
    });
    return html + '</div><p class="r-foot">Win a tier the first time to earn an egg. Each first win also opens the next tier. Grab item boxes on the track!</p>';
  }
  function tierRow(s, ri, ti) {
    const R = ALL[ri], Tr = D.RACE_TIERS[ti], open = unlocked(R, ti), p = prog(R, ti);
    const eggArea = eggKindOf(R, ti), eName = eggName(eggArea);
    const m = open ? matchOf(s, ri, ti) : null;
    let sub;
    if (!open) sub = esc(lockReason(R, ti));
    else if (!p.runs) sub = p.wins ? '' : `First win: <b>${eName}!</b>`;
    else sub = `Best <b>${p.best ? p.best.toFixed(1) + 's' : '—'}</b> · ${p.wins} win${p.wins === 1 ? '' : 's'}${p.wins ? '' : ` · First win: <b>${eName}!</b>`}`;
    const right = open
      ? `${!p.wins ? `<span class="r-eggic" title="First win earns an egg"><canvas class="px" data-area="${eggArea}"></canvas></span>` : ''}<span class="r-go">Race</span>`
      : `<span class="r-lock"><canvas class="px"></canvas></span>`;
    return `<button class="r-tier" data-ri="${ri}" data-tier="${ti}" ${open ? '' : 'disabled'} aria-label="${esc(R.name + ' ' + Tr.name)}${open ? '' : ' (locked)'}">
      <span><span class="r-tname">${Tr.name}${m ? `<span class="r-match" style="background:${m.c}">${m.t}</span>` : ''}</span>
      <span class="r-tsub">${sub}</span></span>
      <span class="r-right"><span class="r-prize"><canvas class="px"></canvas>${prizeOf(R, ti)}</span>${right}</span></button>`;
  }
  function cupHtml(s, cup) {
    const info = dailyInfo(), best = cup.best;
    const first = cupCoins(0), more = best != null && best > 0 ? cupCoins(0) - cupCoins(best) : 0;
    let prize;
    if (best == null) prize = `<div class="r-cupprize"><canvas class="px r-cc"></canvas>${first} coins for 1st <span class="r-eggic" title="Lucky egg"><canvas class="px" data-area="${info.egg}"></canvas></span><small>+ lucky ${esc(eggName(info.egg))} chance</small></div>`;
    else if (best === 0) prize = `<div class="r-done">You won today’s cup! Come back tomorrow.</div>`;
    else prize = `<div class="r-done">You came ${ORD[best]} today!</div><div class="r-cupprize"><canvas class="px r-cc"></canvas>Win for +${more} more coins</div>`;
    return `<div class="panel r-card">
      <div class="r-banner"><canvas class="px r-cupbn"></canvas><span class="r-num">Today</span></div>
      <div class="r-body">
        <div class="r-title">${esc(info.R.name)} Cup</div>
        <div class="r-sub">A new special race every day, just for fun and prizes.</div>
        <div class="r-twist"><canvas class="px" data-mod="${info.mod}"></canvas><div><b>${esc(info.M.name)}</b><span>${esc(info.M.desc)}</span></div></div>
        ${prize}
        <button class="btn go wide r-cupgo">${best == null ? 'Race!' : best === 0 ? 'Race for fun' : 'Try again'}</button>
        <p class="r-next">New cup in ${fmtWait(msToMidnight())}</p>
      </div></div>
      <p class="r-foot">Rivals in the Daily Cup are about as fast as your racer.</p>`;
  }
  function trialHtml(s) {
    let html = '<p class="r-intro">Race your ghost and win medals! Your best run comes back as a ghost to race.</p><div class="r-list">';
    let hidden = 0;
    HUB_ORDER.forEach(ri => {
      const R = ALL[ri]; if (!unlocked(R, 0)) { hidden++; return; }
      html += `<div class="panel r-card" data-ri="${ri}">
        <div class="r-banner"><canvas class="px r-bn" data-ri="${ri}" data-h="22"></canvas></div>
        <div class="r-body"><div class="r-title">${esc(R.name)}</div>
        <div class="r-tiers">${D.RACE_TIERS.map((Tr, ti) => trialRow(ri, ti)).join('')}</div></div></div>`;
    });
    html += '</div>';
    if (hidden) html += `<p class="r-foot">Win races to open ${hidden} more course${hidden === 1 ? '' : 's'} here.</p>`;
    return html;
  }
  function trialRow(ri, ti) {
    const R = ALL[ri], Tr = D.RACE_TIERS[ti], open = unlocked(R, ti), tr = trialRec(R, ti);
    const m = Math.min(3, tr.m || 0);
    let sub;
    if (!open) sub = esc(lockReason(R, ti));
    else {
      const mt = medalTimes(ri, ti);
      sub = tr.best ? `Best <b>${tr.best.toFixed(1)}s</b>` : 'No ghost yet';
      sub += m < 3 ? ` · ${MEDAL_NAMES[m]}: <b>${mt[m].toFixed(1)}s</b>` : ' · <b>All medals!</b>';
    }
    const medals = open ? `<span class="r-medals">${[0, 1, 2].map(k => `<canvas class="px${k < m ? '' : ' off'}" data-medal="${k < m ? k : 'x'}"></canvas>`).join('')}</span><span class="r-go">Go</span>` : `<span class="r-lock"><canvas class="px"></canvas></span>`;
    return `<button class="r-tier" data-mode="trial" data-ri="${ri}" data-tier="${ti}" ${open ? '' : 'disabled'} aria-label="Time trial ${esc(R.name + ' ' + Tr.name)}${open ? '' : ' (locked)'}">
      <span><span class="r-tname">${Tr.name}</span><span class="r-tsub">${sub}</span></span>
      <span class="r-right">${medals}</span></button>`;
  }
  const bannerCourses = {};
  function drawBanner(c, ri, cssWidth, opt) {
    opt = opt || {};
    const S = 3, W = Math.max(40, Math.floor(cssWidth / S)), H = opt.H || 30;
    c.width = W; c.height = H; c.style.width = W * S + 'px'; c.style.height = H * S + 'px';
    const C = opt.C || bannerCourses[ri] || (bannerCourses[ri] = buildCourse(ri, 0));
    const R = ALL[ri], GYb = H - 8;
    // pick a window that shows a characteristic stretch of the course
    let camX = -10;
    if (R.id === 'grand' && !opt.C) camX = Math.round(C.zones[1].x0 - W / 2);
    else { const fav = SEGS.slice().sort((a, b) => (R.mix[b] || 0) - (R.mix[a] || 0)).find(k => k !== 'run'); const sg = C.segs.find(q => q.type === (fav === 'fly' ? 'climb' : fav)); if ((R.mix.run || 0) >= Math.max(R.mix.swim || 0, R.mix.climb || 0, R.mix.fly || 0)) camX = sg ? sg.x0 - Math.round(W * 0.55) : -10; else if (sg) camX = sg.x0 - Math.round(W * 0.3); }
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const md = opt.mod || '';
    const V = { g, W, H, GY: GYb, CH: 7, C, camX, t: 0, night: md === 'night' ? 1 : nightAmt(), rain: md === 'rain' };
    drawWorld(V);
    // a little Sprout running along (rival look), feet on the ground
    const look = opt.look || Object.assign(PX.cloneLook(PX.DEFAULT_LOOK), { body: R.body || ['mint', 'sky', 'plum', 'rose', 'sun'][ri] || 'mint' });
    const spr = sprig(look, { walk: true, frame: 1, mouth: 'grin', arms: md === 'lowgrav' ? 'up' : undefined }), sx = Math.round(W * 0.28), wx = camX + sx;
    const half = md !== 'giant', sw = half ? 16 : 32, sh = half ? Math.ceil(spr.height / 2) : spr.height;
    const fy = V.GY + 1 - elevAt(V, wx) + Math.min(2, sinkAt(V, wx)) - (md === 'lowgrav' ? 7 : 0);
    g.drawImage(spr, sx - sw / 2, fy - sh + 1, sw, sh);
    const f = document.createElement('canvas'); f.width = W; f.height = H; const fvg = f.getContext('2d');
    drawWaterFront({ g: fvg, W, H, GY: GYb, CH: 7, C, camX, t: 0, tint: V.tint });
    g.drawImage(f, 0, 0);
    if (md === 'rain') { g.fillStyle = '#d0e2ff'; for (let k = 0; k < 40; k++) { const h = hash(k + 3); g.fillRect(h % W, (h >> 8) % H, 1, 2); } }
    if (md === 'night') { dkC.width = W; dkC.height = H; dk.fillStyle = 'rgba(8,8,30,0.6)'; dk.fillRect(0, 0, W, H); dk.globalCompositeOperation = 'destination-out'; disc(dk, sx, fy - 8, 13, '#000'); dk.globalCompositeOperation = 'source-over'; g.drawImage(dkC, 0, 0); PX.blit(g, icon('lantern'), sx + 8, fy - 8); }
    if (md === 'lowgrav') { g.fillStyle = '#fff27a'; [[-6, 4], [7, 8], [-2, 11]].forEach(([dx, dy]) => g.fillRect(sx + dx, fy - dy, 1, 1)); }
    if (md === 'party') for (let k = 0; k < 3; k++) PX.blit(g, boxFrame(k * 0.3), sx + 18 + k * 16, V.GY - 3 - elevAt(V, camX + sx + 18 + k * 16));
    c.style.transform = md === 'reverse' ? 'scaleX(-1)' : '';
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
    PXS = clamp(Math.round(cssW / 125), 3, 5); // smaller pixels = more detail
    while (PXS > 3 && cssH / PXS / 4 < 42) PXS--;           // keep lanes tall enough on short screens
    WW = Math.ceil(cssW / PXS); WH = Math.ceil(cssH / PXS);
    LH = Math.floor(WH / NL);
    GY = NL >= 4 ? LH - 6 : LH - 6 - Math.round(Math.max(0, LH - 64) * 0.4); // tall lanes (time trial) show deeper ground
    CLIMB_H = clamp(LH - 32, 6, NL >= 4 ? 14 : 22); PSX = Math.round(WW * 0.3);
    if (race && race.mods.giant) CLIMB_H = Math.min(CLIMB_H, 8);
    lo.width = WW; lo.height = WH; bgC.width = fgC.width = dkC.width = WW; bgC.height = fgC.height = dkC.height = LH;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    if (V) { V.GY = GY; V.CH = CLIMB_H; }
    return true;
  }
  let V = null; // world view for the race

  function startRace(ri, tier) {
    const s = ST.active();
    if (!s) { PS.ui.toast('Hatch a Sprout first'); return; }
    const R = ALL[ri];
    if (!R || !unlocked(R, tier)) return;
    const C = buildCourse(ri, tier);
    const pl = makeRacer({ name: s.name, look: ST.lookOf(s), rating: playerRatings(s), stamR: ST.staminaRating(s), isPlayer: true });
    const rv = rivalRacers(R, tier);
    begin({ mode: 'race', ri, tier, R, C, s, pl, lanes: [rv[0], pl, rv[1], rv[2]], title: R.name, sub: D.RACE_TIERS[tier].name, items: true });
  }
  function startTrial(ri, tier) {
    const s = ST.active();
    if (!s) { PS.ui.toast('Hatch a Sprout first'); return; }
    const R = ALL[ri];
    if (!R || !unlocked(R, tier)) return;
    const C = buildCourse(ri, tier);
    const pl = makeRacer({ name: s.name, look: ST.lookOf(s), rating: playerRatings(s), stamR: ST.staminaRating(s), isPlayer: true });
    const tr = trialRec(R, tier), ok = tr.best && Array.isArray(tr.g) && tr.g.length > 2;
    const gs = ok && tr.sid ? ST.get(tr.sid) : null;
    const gh = makeRacer({ name: 'Ghost', look: gs ? ST.lookOf(gs) : ST.lookOf(s), rating: playerRatings(s), stamR: 1 });
    gh.isGhost = true; gh.none = !ok; gh.color = '#cbdbfc';
    begin({ mode: 'trial', ri, tier, R, C, s, pl, lanes: [gh, pl], ghost: gh, ghostData: ok ? tr : null, title: 'Time Trial', sub: R.name + ' · ' + D.RACE_TIERS[tier].name, items: false });
  }
  function startCup() {
    const s = ST.active();
    if (!s) { PS.ui.toast('Hatch a Sprout first'); return; }
    const info = dailyInfo(), C = cupCourse(info, s);
    const pl = makeRacer({ name: s.name, look: ST.lookOf(s), rating: playerRatings(s), stamR: ST.staminaRating(s), isPlayer: true });
    const rv = cupRivals(info, s);
    begin({ mode: 'cup', ri: info.ri, tier: 0, R: info.R, C, s, pl, lanes: [rv[0], pl, rv[1], rv[2]], title: 'Daily Cup', sub: info.M.name, items: true, mods: C.mods, info });
  }
  function begin(o) {
    o.pl.nextBoost = T.ring.first;
    o.lanes.forEach((r, i) => { r.lane = i; r.x = 0; });
    NL = o.lanes.length;
    const unlockedBefore = allUnlocked();
    race = { mode: o.mode, ri: o.ri, tier: o.tier, R: o.R, Tr: D.RACE_TIERS[o.tier], C: o.C, sprout: o.s, lanes: o.lanes, racers: o.lanes.filter(r => !r.isGhost), player: o.pl, t: 0,
      state: 'count', countT: 3.6, ring: null, ringsSeen: 0, pops: [], parts: [], finishT: 0, doneT: 0, shown: false, goFlash: 0,
      paused: false, settled: false, summary: null, unlockedBefore, lastSeg: 'run',
      title: o.title, sub: o.sub, items: !!o.items, mods: o.mods || {}, info: o.info || null, honey: [], ghost: o.ghost || null, ghostData: o.ghostData || null, rec: [], mirror: !!(o.mods && o.mods.reverse), itemKey: '' };
    PS.ui.hold(true); PS.ui.chrome(false);
    hubEl.hidden = true; raceEl.hidden = false;
    $r('.r-results').hidden = true; $r('.r-leave').hidden = true; $r('.r-skip').hidden = true; $r('.r-hint').hidden = true; $r('.r-ihint').hidden = true;
    $r('.r-item').hidden = !race.items;
    stageEl.classList.toggle('mirror', race.mirror);
    $r('.r-quit').style.visibility = '';
    V = null;
    resize();
    V = { g: bg, W: WW, H: LH, GY, CH: CLIMB_H, C: race.C, camX: 0, t: 0, night: race.mods.night ? 1 : nightAmt(), focus: PSX };
    buildHud();
  }
  function allUnlocked() { const o = {}; ALL.forEach(R => D.RACE_TIERS.forEach((Tr, ti) => { o[R.id + '-' + ti] = unlocked(R, ti); })); return o; }
  function abortRace() { endRaceUI(); }
  function endRaceUI() {
    race = null; V = null; NL = 4;
    if (raceEl) { raceEl.hidden = true; $r('.r-results').hidden = true; $r('.r-leave').hidden = true; $r('.r-ihint').hidden = true; }
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
  function sparkle(r, cols, n) {
    if (!race) return;
    for (let i = 0; i < n; i++) race.parts.push({ lane: r.lane, x: r.x + rnd(-6, 6), y: -rnd(4, 22), vx: rnd(-22, 22), vy: rnd(-34, -6), g: 40, life: rnd(0.4, 0.8), spr: PX.fx(i % 2 ? 'spark' : 'bigspark', cols[i % cols.length]), rel: true });
  }
  function ring(r, col, n) {
    if (!race) return;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; race.parts.push({ lane: r.lane, x: r.x + Math.cos(a) * 6, y: -12 + Math.sin(a) * 6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, g: 0, life: 0.45, spr: PX.fx('spark', col), rel: true }); }
  }
  function confettiBurst(r, n) {
    if (!race) return;
    const cols = ['#e5535f', '#fbf236', '#6abe30', '#639bff', '#c9a2f0', '#ffffff', '#f6a91a'];
    for (let i = 0; i < n; i++) race.parts.push({ lane: r.lane, x: r.x + rnd(-20, 30), y: -rnd(20, 40), vx: rnd(-14, 14), vy: rnd(-40, -5), g: 26, life: rnd(1.2, 2.2), spr: confetti(cols[i % cols.length], i & 1), rel: true, flut: rnd(8, 20), ph: rnd(0, 6) });
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
    if (me && !seg.after) {
      const th = themeAt(race.C, r.x + 2), sp = SEG_POP[th] && SEG_POP[th][seg.type];
      pop(sp || (seg.type === 'fly' ? 'Glide!' : seg.type === 'climb' ? 'Climb!' : seg.type === 'swim' ? 'Swim!' : 'Run!'), SEG_META[seg.type].color, 22, 1.1, true);
    }
  }
  function pop(text, color, size, life, side) {
    if (!race) return;
    if (side) race.pops = race.pops.filter(p => !p.side);
    race.pops.push({ text, color, size: size || 26, t: 0, life: life || 0.9, lane: race.player.lane, side: !!side });
  }
  function itemHint() {
    const x = xsRead(); if (x && x.hint && x.hint.item >= 2) return;
    const el = $r('.r-ihint'); el.hidden = false; clearTimeout(itemHint.tm); itemHint.tm = setTimeout(() => { el.hidden = true; }, 3500);
  }
  function useItem() {
    if (!race || race.paused || race.state !== 'run' || !race.items) return;
    const p = race.player; if (!p.item || p.finished) return;
    activate(p, p.item, { C: race.C, fx: true, W: race });
    $r('.r-ihint').hidden = true;
    const x = xs(); x.hint.item = (x.hint.item || 0) + 1; PS.save();
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
  const DBG = { autoCheer: false, skill: null, autoItem: false };
  function updateGhost(dt) {
    const g = race.ghost; if (!g || g.none) return;
    const d = race.ghostData, k = race.C.LEN / (d.len || race.C.LEN), tt = race.t;
    g.animT += dt;
    if (tt >= d.best) { if (!g.finished) { g.finished = true; g.time = d.best; } g.x = race.C.LEN + Math.min(T.finishJog, (tt - d.best) * 20); return; }
    const f = tt / (d.dt || GHOST_DT), i = Math.floor(f), n = d.g.length - 1, a = d.g[Math.min(i, n)], b = d.g[Math.min(i + 1, n)];
    g.x = Math.min(race.C.LEN - 0.01, (a + (b - a) * (f - i)) * k);
  }
  function update(dt) {
    if (!race) return;
    for (const p of race.pops) p.t += dt; race.pops = race.pops.filter(p => p.t < p.life);
    for (const p of race.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.flut) { p.vx = Math.sin(p.life * 6 + p.ph) * p.flut; p.vy = Math.min(p.vy, 14); } }
    race.parts = race.parts.filter(p => p.life > 0);
    if (race.goFlash > 0) race.goFlash -= dt;
    if (race.state === 'count') {
      const prev = Math.ceil(race.countT); race.countT -= dt; const now = Math.ceil(race.countT);
      for (const r of race.lanes) r.animT += dt;
      if (now !== prev) {
        if (now >= 1 && now <= 3) PX.Sound.play('tick');
        if (now <= 0) { PX.Sound.play('go'); race.state = 'run'; race.goFlash = 0.7; if (!PS.S.seen.raceHint) $r('.r-hint').hidden = false; }
      }
      return;
    }
    race.t += dt;
    const sctx = { C: race.C, t: race.t, rng: Math.random, fx: true, onFinish, W: race, items: race.items, placeOf: r => standings().indexOf(r) };
    for (const r of race.racers) stepRacer(r, dt, sctx);
    for (const h of race.honey) h.t += dt;
    const p = race.player;
    if (race.mode === 'trial') {
      updateGhost(dt);
      while (!p.finished && race.rec.length * GHOST_DT <= race.t) race.rec.push(Math.round(p.x));
    }
    for (const r of race.racers) if (r.starT > 0 && Math.random() < 0.6) race.parts.push({ lane: r.lane, x: r.x - rnd(4, 10), y: -rnd(2, 24), vx: rnd(-20, -6), vy: rnd(-6, 6), g: 0, life: 0.4, spr: PX.fx('spark', RAINBOW[Math.floor(Math.random() * 6)]), rel: true });
    if (DBG.autoItem && p.item) useItem();
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
    // skip button once the player's place can't change (never in a time trial)
    const rivalsDone = race.racers.every(r => r.isPlayer || r.finished);
    $r('.r-skip').hidden = !(race.mode !== 'trial' && race.state === 'run' && !p.finished && rivalsDone);
    if (race.state === 'run' && race.finishT && (race.racers.every(r => r.finished) || race.t - race.finishT > 2.2)) endRace();
    if (race.state === 'done') {
      race.doneT += dt;
      if (race.doneT > (race.mode === 'trial' ? 1.6 : 1.2) && !race.shown) { race.shown = true; showResults(); }
    }
  }
  function onFinish(r) {
    const place = standings().filter(x => x.finished).indexOf(r);
    if (r === race.player) {
      race.finishT = race.t; race.ring = null;
      const win = race.mode === 'trial' ? (!race.ghost || race.ghost.none || !race.ghost.finished) : place === 0;
      PX.Sound.play(win ? 'level' : 'coo');
      if (win) setEmote(r, 'heart', 2.5);
      burst(r, 8);
      if (win || place <= 2) confettiBurst(r, win ? 46 : 22);
    }
  }
  function project(r) {
    const c = Object.assign({}, r, { cheers: { perfect: 0, good: 0, miss: 0 }, item: null }), sc = { C: race.C, t: race.t, rng: Math.random, fx: false }, dt = 1 / 30;
    while (!c.finished && sc.t < race.t + 300) { sc.t += dt; stepRacer(c, dt, sc); }
    return c.time;
  }
  function endRace() {
    for (const r of race.racers) if (!r.finished) r.projTime = project(r);
    race.state = 'done'; race.doneT = 0; race.ring = null;
    $r('.r-skip').hidden = true; $r('.r-hint').hidden = true; $r('.r-ihint').hidden = true;
  }
  function skipToEnd() {
    if (!race || race.state !== 'run' || race.mode === 'trial') return;
    PX.Sound.play('pop');
    const p = race.player;
    if (!p.finished) { p.projTime = project(p); }
    race.finishT = race.t; endRace(); race.doneT = 1.2;
  }

  // ---------- settle (rewards happen here, exactly once per race) ----------
  function finishExtra(s, R, tier, place, timeSec) {
    const Tr = D.RACE_TIERS[tier], X = xs(), key = R.id + '-' + tier;
    const p = Object.assign(blankProg(), X.series[key] || {});
    const firstWin = place === 0 && !p.wins;
    p.runs++; if (place === 0) p.wins++; if (timeSec && (!p.best || timeSec < p.best)) p.best = +timeSec.toFixed(2);
    X.series[key] = p;
    const coins = ST.addCoins(Tr.coins * R.mult * D.RACE_PLACE_SHARE[place], 'race');
    const mixTotal = Object.values(R.mix).reduce((a, b) => a + b, 0), gives = {};
    for (const [seg, w] of Object.entries(R.mix)) { const st = D.RACE_STAT[seg]; gives[st] = (gives[st] || 0) + Tr.xp * (w / mixTotal) * 2.5 * (place === 0 ? 1 : 0.6); }
    gives.stamina = (gives.stamina || 0) + Tr.xp * 0.5;
    const res = ST.gain(s, gives);
    if (s.record) { s.record.races = (s.record.races || 0) + 1; if (place === 0) s.record.raceWins = (s.record.raceWins || 0) + 1; }
    if (PS.S.totals) { PS.S.totals.races = (PS.S.totals.races || 0) + 1; if (place === 0) PS.S.totals.raceWins = (PS.S.totals.raceWins || 0) + 1; }
    let egg = null;
    if (firstWin) { egg = ST.addEgg(R.eggs[tier], `${R.name} ${Tr.name}`); PS.S.bestTier = Math.max(PS.S.bestTier || 0, tier + 1); }
    PS.save();
    return { coins, gives, ups: res.ups, evolved: res.evolved, egg, firstWin, unlockedNext: firstWin };
  }
  function finishCup(s, place) {
    const X = xs(), info = race.info, day = info.key;
    if (X.daily.day !== day) X.daily = { day, best: null, runs: 0, egg: false, total: X.daily.total || 0, wins: X.daily.wins || 0 };
    const d = X.daily, prev = d.best, firstToday = prev == null;
    d.runs = (d.runs || 0) + 1;
    let coins = 0, gives = {}, res = { ups: {}, evolved: null }, egg = null;
    if (prev == null || place < prev) {
      coins = ST.addCoins(cupCoins(place) - (prev == null ? 0 : cupCoins(prev)), 'cup');
      d.best = place;
      if (place === 0) d.wins = (d.wins || 0) + 1;
      if (!d.egg && Math.random() < CUP_EGG_CHANCE[place]) { d.egg = true; egg = ST.addEgg(info.egg, 'Daily Cup'); }
    }
    if (firstToday) {
      d.total = (d.total || 0) + 1;
      const xp = CUP_XP[Math.min(3, PS.S.bestTier || 0)], R = info.R, mixTotal = Object.values(R.mix).reduce((a, b) => a + b, 0);
      for (const [seg, w] of Object.entries(R.mix)) { const st = D.RACE_STAT[seg]; gives[st] = (gives[st] || 0) + xp * (w / mixTotal) * 2.5 * (place === 0 ? 1 : 0.6); }
      gives.stamina = (gives.stamina || 0) + xp * 0.5;
      res = ST.gain(s, gives);
    }
    if (s.record) { s.record.races = (s.record.races || 0) + 1; if (place === 0) s.record.raceWins = (s.record.raceWins || 0) + 1; }
    if (PS.S.totals) { PS.S.totals.races = (PS.S.totals.races || 0) + 1; if (place === 0) PS.S.totals.raceWins = (PS.S.totals.raceWins || 0) + 1; }
    PS.save();
    return { coins, gives, ups: res.ups, evolved: res.evolved, egg, prev, improved: prev == null || place < prev, firstToday };
  }
  function finishTrial(s, time) {
    const X = xs(), key = race.R.id + '-' + race.tier, tr = Object.assign({ best: null, m: 0, runs: 0 }, X.trials[key] || {});
    const prevBest = tr.best, newBest = !prevBest || time < prevBest;
    tr.runs = (tr.runs || 0) + 1;
    if (newBest) {
      const g = race.rec.slice(); g.push(Math.round(race.C.LEN));
      Object.assign(tr, { best: +time.toFixed(2), g, dt: GHOST_DT, len: race.C.LEN, sid: s.id });
    }
    const mt = medalTimes(race.ri, race.tier), got = medalOf(mt, time), had = Math.min(3, tr.m || 0), newMedals = [];
    let coins = 0;
    for (let k = had; k < got; k++) { coins += MEDAL_COINS[race.tier][k]; newMedals.push(k); }
    tr.m = Math.max(had, got);
    X.trials[key] = tr;
    if (coins) ST.addCoins(coins, 'trial');
    PS.save();
    return { time, prevBest, newBest, mt, got, have: tr.m, newMedals, coins };
  }
  function settle() {
    if (!race || race.settled) return race && race.summary;
    race.settled = true;
    if (race.mode === 'trial') { race.summary = finishTrial(race.sprout, race.player.time); return race.summary; }
    const order = race.racers.slice().sort((a, b) => finalTime(a) - finalTime(b));
    const place = order.indexOf(race.player), time = finalTime(race.player);
    race.order = order; race.place = place;
    if (race.mode === 'cup') race.summary = finishCup(race.sprout, place);
    else if (race.R.extra) race.summary = finishExtra(race.sprout, race.R, race.tier, place, time);
    else race.summary = ST.finishRace(race.sprout, race.R.id, race.tier, place, time);
    return race.summary;
  }
  function xpChipsHtml(sum) {
    const gives = sum.gives || {}, ups = sum.ups || {};
    return D.STATS.filter(k => gives[k] > 0.5).sort((a, b) => gives[b] - gives[a]).map(k => `<span class="r-xpchip" style="background:${D.STAT_META[k].color}">${D.STAT_META[k].label} +${Math.round(gives[k])} XP${ups[k] ? `<b>Lv ${race.sprout.stats[k].lv}!</b>` : ''}</span>`).join('');
  }
  function eggBoxHtml(sum, text) {
    if (!sum.egg) return '';
    return `<div class="r-eggbox"><canvas class="px r-eggcv"></canvas><div><b>New ${esc(eggName(sum.egg.kind))}!</b><span>${text || 'It’s waiting in the Garden.'}</span></div></div>`;
  }
  function showResults() {
    const sum = settle();
    if (race.mode === 'trial') return showTrialResults(sum);
    const order = race.order, place = race.place, p = race.player, R = race.R, Tr = race.Tr, cup = race.mode === 'cup';
    const title = place === 0 ? 'You won!' : place === 1 ? '2nd place!' : place === 2 ? '3rd place' : '4th place';
    const xpChips = xpChipsHtml(sum);
    const after = allUnlocked(), newly = Object.keys(after).filter(k => after[k] && !race.unlockedBefore[k]);
    const newNames = newly.map(k => { const i = k.lastIndexOf('-'), RR = byId(k.slice(0, i)); return RR ? `${RR.name} ${D.RACE_TIERS[+k.slice(i + 1)].name}` : k; });
    let tip = place === 0 ? '' : place === 3 && race.tier > 0 ? 'Rivals here are strong. Train in the Garden or try an easier tier.' : 'Tap right as the ring meets the circle for a PERFECT boost.';
    let rew;
    if (cup) {
      if (sum.coins > 0 || xpChips) rew = `<div class="r-rew"><div class="r-coins"><canvas class="px r-coincv"></canvas>+${sum.coins} coins</div>${xpChips ? `<div class="r-xp">${xpChips}</div>` : ''}</div>`;
      else rew = `<p class="r-note">${sum.prev === 0 ? 'You already won today’s cup. This one was just for fun!' : `Your best today is still ${ORD[sum.prev]}. Win to earn more!`}</p>`;
      tip = place === 0 ? 'A new cup with a new twist arrives tomorrow!' : 'You can try again today to win the rest of the prize.';
    } else rew = `<div class="r-rew"><div class="r-coins"><canvas class="px r-coincv"></canvas>+${sum.coins} coins</div>${xpChips ? `<div class="r-xp">${xpChips}</div>` : ''}</div>`;
    const ov = $r('.r-results');
    ov.innerHTML = `<div class="card">
      <div class="eyebrow">${cup ? 'Daily Cup · ' + esc(race.info.M.name) : esc(R.name) + ' · ' + Tr.name}</div>
      <h1>${title}</h1>
      <div class="r-rows">${order.map((r, i) => `<div class="r-row${r === p ? ' me' : ''}"><span class="pl">${ORD[i]}</span><canvas class="px" data-i="${i}"></canvas>
        <span class="nm">${esc(r.name)}<small>${r === p ? 'Your Sprout' : 'Rival'}</small></span><span class="num">${r.finished ? '' : '~'}${finalTime(r).toFixed(1)}s</span></div>`).join('')}</div>
      ${rew}
      ${eggBoxHtml(sum, cup ? 'A lucky egg from the Daily Cup! It’s in the Garden.' : '')}
      ${newNames.length ? `<p class="r-note">Unlocked: <b>${newNames.map(esc).join(', ')}</b></p>` : ''}
      ${tip ? `<p class="r-note">${tip}</p>` : ''}
      <div class="r-btns stack"><button class="btn go wide r-again">${cup ? 'Race the cup again' : 'Race again'}</button><button class="btn wide r-back">Back to races</button></div>
    </div>`;
    ov.querySelectorAll('canvas[data-i]').forEach(c => { const i = +c.dataset.i; spriteBox(c, order[i].look, i === 0 ? { eyes: 'happy', mouth: 'open', arms: 'up' } : i === 3 ? { eyes: 'sad', mouth: 'flat' } : {}, 36); c.style.height = (38 * c.height / c.width) + 'px'; });
    const cc = ov.querySelector('.r-coincv'); if (cc) paintTo(cc, icon('coin'), 11, 11);
    const ec = ov.querySelector('.r-eggcv'); if (ec) { const e = safeItem('egg', sum.egg.kind) || safeItem('egg', sum.egg.area); if (e) paintTo(ec, e, 20, 24); }
    const ri = race.ri, tier = race.tier;
    ov.querySelector('.r-back').onclick = () => { PX.Sound.play('pop'); endRaceUI(); showHub(); };
    ov.querySelector('.r-again').onclick = () => { PX.Sound.play('go'); endRaceUI(); showHub(); if (cup) startCup(); else startRace(ri, tier); };
    finishResults(place === 0 ? 'evolve' : place === 1 ? 'chime' : 'pop');
  }
  function showTrialResults(sum) {
    const R = race.R, Tr = race.Tr, gh = race.ghostData;
    const title = sum.newMedals.length ? `${MEDAL_NAMES[sum.got - 1]} medal!` : sum.newBest ? (sum.prevBest ? 'New best time!' : 'Ghost saved!') : 'Nice run!';
    let delta = '';
    if (sum.prevBest) { const d = sum.time - sum.prevBest; delta = d < 0 ? `<p class="r-delta good">${(-d).toFixed(1)}s faster than your ghost!</p>` : `<p class="r-delta bad">${d.toFixed(1)}s behind your ghost. ${d < 1.5 ? 'So close!' : 'Keep trying!'}</p>`; }
    else delta = '<p class="r-delta good">Next time, your ghost will race you!</p>';
    const cells = [0, 1, 2].map(k => `<div class="r-mcell${k < sum.have ? ' got' : ''}${sum.newMedals.includes(k) ? ' new' : ''}"><canvas class="px" data-medal="${k < sum.have ? k : 'x'}"></canvas>${MEDAL_NAMES[k]}<b>${sum.mt[k].toFixed(1)}s</b></div>`).join('');
    const ov = $r('.r-results');
    ov.innerHTML = `<div class="card">
      <div class="eyebrow">Time Trial · ${esc(R.name)} · ${Tr.name}</div>
      <h1>${title}</h1>
      <div class="r-bigtime">${sum.time.toFixed(1)}s</div>
      ${delta}
      <div class="r-mrow">${cells}</div>
      ${sum.coins ? `<div class="r-rew"><div class="r-coins"><canvas class="px r-coincv"></canvas>+${sum.coins} coins</div></div>` : ''}
      ${sum.have < 3 ? `<p class="r-note">Beat <b>${sum.mt[sum.have].toFixed(1)}s</b> for ${sum.have === 0 ? 'a' : 'the'} ${MEDAL_NAMES[sum.have]} medal. PERFECT cheers help a lot!</p>` : '<p class="r-note">You have every medal here. Can you beat your ghost again?</p>'}
      <div class="r-btns stack"><button class="btn go wide r-again">Try again</button><button class="btn wide r-back">Back to time trials</button></div>
    </div>`;
    ov.querySelectorAll('canvas[data-medal]').forEach(c => paintTo(c, icon('medal' + c.dataset.medal), 11, 14));
    const cc = ov.querySelector('.r-coincv'); if (cc) paintTo(cc, icon('coin'), 11, 11);
    const ri = race.ri, tier = race.tier;
    ov.querySelector('.r-back').onclick = () => { PX.Sound.play('pop'); endRaceUI(); hubTab = 'trial'; showHub(); };
    ov.querySelector('.r-again').onclick = () => { PX.Sound.play('go'); endRaceUI(); hubTab = 'trial'; showHub(); startTrial(ri, tier); };
    void gh;
    finishResults(sum.newMedals.length ? 'evolve' : sum.newBest ? 'chime' : 'pop');
  }
  function finishResults(snd) {
    $r('.r-results').hidden = false; $r('.r-quit').style.visibility = 'hidden'; $r('.r-item').hidden = true;
    PX.Sound.play(snd);
    // back on a menu: show the HUD (coins bump) and release held pop-ups (evolution etc.)
    PS.ui.chrome(true); PS.ui.hold(false);
  }

  // ---------- HUD ----------
  let dotEls = [], lastHud = '';
  function buildHud() {
    const rail = $r('.r-rail'), C = race.C;
    rail.innerHTML = C.segs.map(s => `<i style="width:${(s.len / C.LEN * 100).toFixed(2)}%;background:${SEG_META[s.type].color}"></i>`).join('');
    const dots = $r('.r-dots'); dots.innerHTML = ''; dotEls = [];
    race.lanes.forEach(r => { const d = document.createElement('i'); d.className = 'r-dot' + (r === race.player ? ' me' : '') + (r.isGhost ? ' ghost' : ''); d.style.background = r.color; if (r.none) d.hidden = true; dots.appendChild(d); dotEls.push(d); });
    lastHud = ''; race.itemKey = '?';
  }
  function hudPlace() {
    const p = race.player;
    if (race.mode !== 'trial') return standings().indexOf(p);
    const g = race.ghost; if (!g || g.none) return 0;
    if (p.finished && g.finished) return p.time <= g.time ? 0 : 1;
    if (g.finished) return 1; if (p.finished) return 0;
    return p.x >= g.x ? 0 : 1;
  }
  function updateHud() {
    if (!race) return;
    race.lanes.forEach((r, i) => { dotEls[i] && (dotEls[i].style.left = (clamp(r.x / race.C.LEN, 0, 1) * 100).toFixed(2) + '%'); });
    const p = race.player, pl = hudPlace();
    const tm = race.state === 'count' ? 0 : p.finished ? p.time : race.t;
    const key = pl + '|' + tm.toFixed(1);
    if (key !== lastHud) { lastHud = key; $r('.r-place').innerHTML = (pl + 1) + '<small>' + ORD[pl].slice(1) + '</small>'; $r('.r-time').textContent = tm.toFixed(1) + 's'; }
    const f = clamp(p.stam / p.stamMax, 0, 1), s = $r('.r-stam');
    s.style.width = (f * 100).toFixed(1) + '%';
    s.style.background = p.starT > 0 ? RAINBOW[Math.floor(race.t * 10) % 6] : p.tired ? '#d24552' : f < 0.3 ? '#f6c83a' : '#6abe30';
    if (race.items) {
      const k = (p.item || '') + (race.state === 'done' ? 'x' : '');
      if (k !== race.itemKey) {
        race.itemKey = k; const b = $r('.r-item');
        b.hidden = race.state === 'done' || race.shown;
        b.classList.toggle('has', !!p.item);
        paintTo(b.querySelector('canvas'), icon(p.item || 'itembox'), 15, 15);
        b.querySelector('span').textContent = p.item ? 'Use!' : 'Item';
        b.setAttribute('aria-label', p.item ? 'Use ' + ITEMS[p.item].name : 'No item yet');
      }
    }
  }

  // ---------- render ----------
  function poseOf(r) {
    const s = segAtC(race.C, r.x), P = { frame: 0 };
    if (race.state === 'count') { P.frame = Math.floor(race.countT * 3 + r.lane) % 2; P.mouth = 'grin'; return P; }
    if (r.finished) {
      const place = r.isGhost ? 1 : standings().indexOf(r);
      P.arms = 'up'; P.eyes = 'happy'; P.mouth = place === 0 ? 'open' : 'smile'; P.frame = Math.floor(r.animT * 3) % 2;
      if (r.x < race.C.LEN + T.finishJog) { P.walk = true; P.frame = Math.floor(r.x / 5) % 2; }
      return P;
    }
    if (s.type === 'run') { P.walk = true; P.frame = Math.floor(r.x / 5) % 2; }
    else if (s.type === 'swim') { P.arms = sinkAt(V, r.x) > 3 ? 'paddle' : 'down'; P.walk = P.arms === 'down'; P.frame = Math.floor(r.animT * 4) % 2; }
    else if (s.type === 'climb') { P.arms = 'up'; P.walk = true; P.frame = Math.floor(r.x / 3) % 2; }
    else { P.arms = 'out'; P.flap = true; P.frame = Math.floor(r.animT * ((r.look.parts || {}).wings ? 7 : 5)) % 2; }
    if (r.stumbleT > 0 || (r.slowT > 0 && r.starT <= 0)) { P.eyes = 'sad'; P.mouth = 'o'; }
    else if (r.tired) { P.eyes = 'closed'; P.mouth = 'o'; }
    else if (r.boostT > 0 || r.itemT > 0) { P.eyes = 'happy'; P.mouth = 'grin'; }
    return P;
  }
  function feetY(r) {
    const P = poseOf(r); let bob = 0;
    const s = segAtC(race.C, r.x);
    if (!r.finished && race.state !== 'count') {
      if (s.type === 'run' || s.type === 'climb') bob = P.frame ? -1 : 0;
      if (s.type === 'swim') bob = P.frame ? 1 : 0;
      if (s.type === 'fly') bob = P.frame ? 0 : -1;
      if (race.mods.lowgrav && s.type === 'run' && !s.after) { bob = -Math.round(Math.abs(Math.sin(r.x * 0.075 + r.lane)) * 10); P.walk = false; P.arms = bob < -6 ? 'up' : 'out'; }
      if (race.mods.lowgrav && s.type === 'fly') bob -= Math.round(2 + Math.sin(r.animT * 2) * 2);
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
  function silhouette(spr, col) {
    silC.width = spr.width; silC.height = spr.height;
    sil.clearRect(0, 0, spr.width, spr.height); sil.globalCompositeOperation = 'source-over'; sil.drawImage(spr, 0, 0);
    sil.globalCompositeOperation = 'source-in'; sil.fillStyle = col; sil.fillRect(0, 0, spr.width, spr.height); sil.globalCompositeOperation = 'source-over';
    return silC;
  }
  function blitSpr(spr, x, y, big) {
    const AX = sprigAX(), AY = sprigAY();
    if (big === 2) lx.drawImage(spr, x - AX * 2, y - AY * 2 - 1, spr.width * 2, spr.height * 2);
    else PX.blit(lx, spr, x, y, false, AX, AY);
  }
  function drawRacer(r, P, sx, fy, t) {
    const spr = sprig(r.look, P), big = race.mods.giant ? 2 : 1;
    if (r.itemT > 0 && r.starT <= 0) { // speed lines
      for (let k = 0; k < 3; k++) {
        const ln = 6 + ((Math.floor(t * 20) + k * 2) % 5), x0 = sx - 9 * big - ln - k * 2, y = fy - (5 + k * 6) * big;
        px(lx, x0, y + 1, ln, 1, 'rgba(34,32,52,0.35)'); px(lx, x0, y, ln, 1, k === 1 ? '#ffffff' : '#ffb35c');
      }
    }
    if (r.starT > 0) { // rainbow glow outline
      const s2 = silhouette(spr, RAINBOW[Math.floor(t * 12) % 6]);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) blitSpr(s2, sx + dx, fy + dy, big);
    }
    if (r.isGhost) {
      const s2 = silhouette(spr, '#cbe4ff');
      lx.globalAlpha = 0.28; blitSpr(s2, sx, fy, big); lx.globalAlpha = 0.45 + 0.08 * Math.sin(t * 5); blitSpr(spr, sx, fy, big); lx.globalAlpha = 1;
    } else blitSpr(spr, sx, fy, big);
    if (r.shieldT > 0 && (r.shieldT > 2 || Math.floor(t * 8) % 2)) { // bubble
      const cx = sx, cy = fy - 12 * big, R = 14 * big;
      lx.globalAlpha = 0.25; disc(lx, cx, cy, R, '#7fd0ff'); lx.globalAlpha = 1;
      drawCircle(lx, cx, cy, R + 1, 'rgba(34,32,52,0.55)', false); drawCircle(lx, cx, cy, R, '#5fb8f0', false); drawCircle(lx, cx, cy, R - 1, '#e6f8ff', true);
      px(lx, cx - Math.round(R * 0.55), cy - Math.round(R * 0.55), 3, 1, '#ffffff'); px(lx, cx - Math.round(R * 0.65), cy - Math.round(R * 0.4), 1, 3, '#ffffff');
    }
    if (r.slowT > 0 && r.slowMul === ITEMS.honey.mul && r.starT <= 0) { // sticky honey feet
      px(lx, sx - 5 * big, fy, 10 * big, 1, '#f6a91a'); if (Math.floor(t * 6) % 2) px(lx, sx - 2, fy + 1, 1, 1, '#f6c83a');
    }
    if (race.mods.night && !r.isGhost) PX.blit(lx, icon('lantern'), sx + 9 * big, fy - 14 * big + Math.round(Math.sin(r.animT * 4)));
  }
  function drawLaneStuff(r, y0, camX, t) {
    const C = race.C;
    for (const h of race.honey) { // honey puddles land in every other lane
      if (h.owner === r) continue;
      const sx = h.x - camX; if (sx < -10 || sx > WW + 10) continue;
      PX.blit(lx, honeySpr(), sx, y0 + GY + 2 - elevAt(V, h.x) + Math.min(1, sinkAt(V, h.x)));
    }
    if (race.items && C.boxes && !r.isGhost) for (const bx of C.boxes) {
      if (r.x >= bx) continue;
      const sx = bx - camX; if (sx < -10 || sx > WW + 10) continue;
      PX.blit(lx, boxFrame(t + bx), sx, y0 + GY - 3 - elevAt(V, bx) + Math.round(Math.sin(t * 3 + bx) * 1.5));
    }
  }
  function drawRain(y0, t, camX) {
    lx.fillStyle = '#c6dcff'; lx.globalAlpha = 0.7; const P = WW + 30;
    for (let k = 0; k < 34; k++) { const h = hash(k * 31 + 7), x = mod((h % 997) - camX - Math.floor(t * 30), P) - 10, y = mod((h >> 10) + Math.floor(t * (140 + (h % 40))), LH); lx.fillRect(x, y0 + y, 1, 3); }
    lx.globalAlpha = 1; lx.fillStyle = '#ffffff';
    for (let k = 0; k < 6; k++) { const h = hash(k * 13 + Math.floor(t * 5) * 7); if (h % 3) lx.fillRect(h % WW, y0 + GY - (h >> 8) % 2, 1, 1); }
  }
  function drawDark(r, y0, camX, sx, fy) {
    dk.clearRect(0, 0, WW, LH); dk.fillStyle = 'rgba(10,8,34,0.66)'; dk.fillRect(0, 0, WW, LH);
    const lights = [];
    if (!r.none) lights.push([sx + 4, fy - 14, 24]);
    for (const d of race.C.decor) if (d.glow || d.kind === 'lantern' || d.kind === 'lamp') { const x = d.x - camX; if (x > -20 && x < WW + 20) lights.push([x, GY - 8, 13]); }
    if (race.items && race.C.boxes) for (const bx of race.C.boxes) if (r.x < bx) { const x = bx - camX; if (x > -10 && x < WW + 10) lights.push([x, GY - 9 - elevAt(V, bx), 8]); }
    lights.push([race.C.LEN + 10 - camX, GY - 22, 20]);
    dk.globalCompositeOperation = 'destination-out';
    for (const [x, y, rr] of lights) { dk.globalAlpha = 0.5; disc(dk, x, y, rr, '#000'); dk.globalAlpha = 1; disc(dk, x, y, Math.round(rr * 0.66), '#000'); }
    dk.globalCompositeOperation = 'source-over';
    lx.drawImage(dkC, 0, y0);
  }
  function render() {
    if (!race || !cssW || !V) return;
    const t = race.t + (race.state === 'count' ? 3.6 - race.countT : 0);
    const camX = Math.round(race.player.x) - PSX;
    V.g = bg; V.W = WW; V.H = LH; V.GY = GY; V.CH = CLIMB_H; V.camX = camX; V.t = t; V.focus = PSX;
    V.rain = !!race.mods.rain; V.cheer = race.player.finished || race.player.x > race.C.LEN - 90;
    if (((t * 2) | 0) !== V.nt) { V.nt = (t * 2) | 0; V.night = race.mods.night ? 1 : nightAmt(); }
    drawWorld(V);
    drawWaterFront({ g: fg, W: WW, H: LH, GY, C: race.C, camX, t, tint: V.tint });
    lx.imageSmoothingEnabled = false; lx.fillStyle = INK; lx.fillRect(0, 0, WW, WH);
    const N = race.lanes.length;
    for (let i = 0; i < N; i++) {
      const r = race.lanes[i], y0 = i * LH, sx = Math.round(r.x) - camX;
      lx.save(); lx.beginPath(); lx.rect(0, y0, WW, LH); lx.clip();
      lx.drawImage(bgC, 0, y0);
      drawLaneStuff(r, y0, camX, t);
      const { y, P } = feetY(r);
      if (!r.none && sx > -40 && sx < WW + 40) {
        const gy = GY + 1 - elevAt(V, r.x) + sinkAt(V, r.x);
        if (race.mods.lowgrav && gy - y > 3) { const w = Math.max(3, 9 - ((gy - y) >> 1)); lx.globalAlpha = 0.3; px(lx, sx - w, y0 + gy, w * 2, 1, INK); lx.globalAlpha = 1; }
        drawRacer(r, P, sx, y0 + y, t);
      }
      lx.drawImage(fgC, 0, y0);
      for (const p of race.parts) if (p.lane === i) {
        const px_ = Math.round(p.x) - camX, py = p.rel ? y0 + y + Math.round(p.y) : y0 + Math.round(p.y);
        lx.drawImage(p.spr, px_ - (p.spr.width >> 1), py);
      }
      if (race.mods.rain) drawRain(y0, t, camX);
      if (race.mods.night) drawDark(r, y0, camX, sx, y);
      const big = race.mods.giant ? 2 : 1;
      if (r.emote && sx > -20 && sx < WW + 10) { try { PX.blit(lx, PX.emote(r.emote), sx + 8 * big, y0 + y - 12 * big - (big - 1) * 14, false, 0, 13); } catch (e) { /* optional */ } }
      lx.restore();
      if (r === race.player) { px(lx, 0, y0, WW, 1, '#fbf236'); px(lx, 0, y0 + LH - 1, WW, 1, '#fbf236'); px(lx, 0, y0, 1, LH, '#fbf236'); px(lx, WW - 1, y0, 1, LH, '#fbf236'); }
      else if (i > 0 && race.lanes[i - 1] !== race.player) px(lx, 0, y0, WW, 1, INK);
      const my = y0 + (LH >> 1) - 2;
      if (!r.none) { if (sx > WW + 4) arrow(WW - 5, my, 1, r.color); else if (sx < -6) arrow(4, my, -1, r.color); }
    }
    if (race.ring) {
      const r = race.player, y0 = r.lane * LH, { y } = feetY(r), big = race.mods.giant ? 2 : 1;
      const cx = PSX, cy = y0 + y - 12 * big, rr = Math.round(race.ring.r), d = Math.abs(race.ring.r - T.ring.target);
      drawCircle(lx, cx, cy, T.ring.target, d <= T.ring.perfect ? '#fbf236' : '#ffffff', d > T.ring.perfect);
      drawCircle(lx, cx, cy, rr + 1, INK); drawCircle(lx, cx, cy, rr - 1, INK);
      drawCircle(lx, cx, cy, rr, d <= T.ring.good ? '#fff27a' : '#ffcc44');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (race.mirror) ctx.setTransform(-1, 0, 0, 1, cv.width, 0);
    ctx.drawImage(lo, 0, 0, WW * PXS * dpr, WH * PXS * dpr);
    // text layer (css px)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = PXS, order = standings(), mx = x => (race.mirror ? cssW - x : x);
    for (let i = 0; i < race.lanes.length; i++) {
      const r = race.lanes[i], pl = order.indexOf(r);
      let label;
      if (r.isGhost) label = r.none ? 'No ghost yet' : `Ghost · ${race.ghostData.best.toFixed(1)}s`;
      else label = (race.state === 'count' || race.mode === 'trial' ? '' : ORD[pl] + ' ') + (r.isPlayer ? r.name + ' (you)' : r.name);
      chip(6, i * LH * S + 5, label, r.isPlayer, r.color, !r.isPlayer && r.item);
      const sx = Math.round(r.x) - camX, my = (i * LH + (LH >> 1)) * S;
      const dm = Math.max(1, Math.round(Math.abs(r.x - race.player.x) / 10)) + 'm';
      if (!r.none) {
        if (sx > WW + 4) tag(mx((WW - 8) * S), my, '+' + dm, race.mirror ? 'left' : 'right');
        else if (sx < -6) tag(mx(8 * S), my, '−' + dm, race.mirror ? 'right' : 'left');
      }
    }
    if (race.mode === 'trial') medalBoard(S);
    const big = race.mods.giant ? 2 : 1;
    const pY = (race.player.lane * LH + feetY(race.player).y - 30 * big) * S;
    for (const p of race.pops) {
      const k = p.t / p.life, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.globalAlpha = a;
      if (p.side) bigText(p.text, cssW * 0.7, (race.player.lane * LH + 12) * S + 12 - k * 8, p.size, p.color);
      else bigText(p.text, mx(PSX * S), Math.max(26, pY - k * 26), p.size, p.color);
      ctx.globalAlpha = 1;
    }
    const laneMid = (race.player.lane * LH + LH / 2) * S;
    if (race.state === 'count') {
      const n = Math.ceil(race.countT);
      if (n >= 4) { bigText(race.title, cssW / 2, race.player.lane * LH * S + 46, 28, '#ffcc44'); bigText(race.sub, cssW / 2, race.player.lane * LH * S + 72, 18, '#ffffff'); }
      else bigText(n >= 1 ? String(n) : 'GO!', cssW * 0.68, laneMid + 26, 72, n >= 1 ? '#ffcc44' : '#99e550');
    } else if (race.goFlash > 0) {
      ctx.globalAlpha = Math.min(1, race.goFlash * 2); bigText('GO!', cssW * 0.68, laneMid + 26, 72, '#99e550'); ctx.globalAlpha = 1;
    }
    if (race.player.tired && race.state === 'run' && !race.player.finished && Math.floor(race.t * 3) % 2) tag(10, race.player.lane * LH * S + 38, 'Tired… a PERFECT cheer wakes it up!', 'left');
  }
  function medalBoard(S) {
    const tr = trialRec(race.R, race.tier), mt = medalTimes(race.ri, race.tier), have = Math.min(3, tr.m || 0);
    const tm = race.player.finished ? race.player.time : race.t, pace = medalOf(mt, tm);
    ctx.font = '700 13px "Fredoka", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let x = cssW - 8 - 3 * 64; const y = 8;
    for (let k = 0; k < 3; k++) {
      const alive = tm <= mt[k], ic = icon('medal' + (k < have || alive ? k : 'x'));
      ctx.globalAlpha = alive || k < have ? 1 : 0.55;
      ctx.drawImage(ic, x, y, 11 * 2, 14 * 2);
      tag(x + 25, y + 15, mt[k].toFixed(1) + 's', 'left');
      x += 64;
    }
    ctx.globalAlpha = 1; void pace;
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function chip(x, y, text, me, col, item) {
    ctx.font = '600 12px "Pixelify Sans", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const w = Math.ceil(ctx.measureText(text).width) + 22 + (item ? 18 : 0), h = 20;
    roundRect(x, y, w, h, 7); ctx.fillStyle = me ? '#ffcc44' : 'rgba(255,248,230,.92)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = me ? '#d99a1a' : '#cdb57e'; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(x + 6, y + 6, 8, 8); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + 6, y + 6, 8, 8);
    ctx.fillStyle = me ? '#4a3210' : '#5b4630'; ctx.fillText(text, x + 17, y + h / 2 + 1);
    if (item) { ctx.imageSmoothingEnabled = false; ctx.drawImage(icon(item), x + w - 19, y + 2, 15, 15); }
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
    TUNING, DBG, ITEMS, MODS, EXTRA_RACES, ALL, buildCourse, simRace, simMany, flat, mulOf, tap, startRace, startTrial, startCup, skipToEnd, useItem,
    medalTimes, dailyInfo, dayKey, extraRivals, extra: () => xsRead(),
    get race() { return race; },
    giveItem(kind) { if (race && ITEMS[kind]) race.player.item = kind; },
    ff: sec => { for (let i = 0; i < sec * 60 && race; i++) update(1 / 60); },
    courseInfo() { return ALL.map((R, ri) => D.RACE_TIERS.map((Tr, ti) => { const C = buildCourse(ri, ti); return `${R.id}/${Tr.name}: ${C.LEN}px ${C.segs.map(s => s.type[0] + s.len).join(' ')}`; })).flat(); },
  };
})();
