// state.js — Solunar Sprouts rules + save data. Exposes window.PS (shared by every screen).
//
// CONTRACT (other modules rely on these; keep signatures stable)
//   PS.D                      content tables (data.js)
//   PS.S                      the live save object (read freely; mutate through PS.state functions where one exists)
//   PS.save()                 throttled save to localStorage (safe to call often)
//   PS.on(evt, fn) / PS.emit(evt, payload)
//       events: 'coins' {n, why} · 'sprout:update' {s} · 'levelup' {s, stat, lv} · 'sprout:evolve' {s, from, to, name}
//               'egg:new' {egg} · 'egg:hatch' {egg, s} · 'pouch' {} · 'area' {area} · 'night' {isNight}
//               'sprout:sold' {s, price} · 'items' {} (paints / pattern stickers / hats changed)
//   PS.clock.isNight() · PS.clock.night() -> 0..1 (smooth, fades at the switch) · PS.clock.msToSwitch()
//   PS.state.*  (see bottom of file)
(function () {
  'use strict';
  const D = window.PSDATA;
  // ---------------- players (one save per player) ----------------
  // The first player ('main') keeps the original storage key, so saves from before profiles existed carry over.
  const BASE = 'pocket-sprout:v1', PKEY = 'solunar:players:v1';
  const keyFor = pid => BASE + (pid && pid !== 'main' ? ':' + pid : '');
  function readPlayers() { try { const p = JSON.parse(localStorage.getItem(PKEY)); if (p && Array.isArray(p.list) && p.list.length) return p; } catch (e) { /* blocked */ } return null; }
  function writePlayers(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) { /* blocked */ } }
  let players = readPlayers();
  if (!players) { players = { list: [{ id: 'main', name: 'Player 1', created: Date.now() }], current: 'main', named: false }; writePlayers(players); }
  if (!players.list.some(p => p.id === players.current)) players.current = players.list[0].id;
  // ?save=<slot> is a testing override that never touches the players list
  const SLOT = (() => { try { return new URLSearchParams(location.search).get('save') || ''; } catch (e) { return ''; } })();
  const KEY = SLOT ? BASE + ':' + SLOT : keyFor(players.current);
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const newId = p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------- events ----------------
  const listeners = {};
  function on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); return () => { listeners[e] = listeners[e].filter(f => f !== fn); }; }
  function emit(e, p) { (listeners[e] || []).slice().forEach(f => { try { f(p || {}); } catch (err) { console.error(err); } }); }

  // ---------------- save ----------------
  function fresh() {
    return {
      v: SAVE_VERSION, created: Date.now(), coins: 60, area: 'meadow', activeId: null, clockOffset: 0,
      sprouts: [], eggs: [{ id: newId('e'), kind: 'meadow', source: 'Your first egg', area: 'meadow', taps: 0 }],
      pouch: [], fruits: { apple: 3 }, progress: { races: {}, leagues: {} },
      seen: {}, bestTier: 0, totals: { races: 0, raceWins: 0, battles: 0, battleWins: 0, coinsEarned: 0, gumballs: 0, sold: 0 },
      items: { paints: {}, patterns: {}, hats: {} },
    };
  }
  // Save format version. When the save shape changes, bump this and add a step to migrate() so old saves upgrade instead of breaking.
  const SAVE_VERSION = 2;
  function migrate(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.sprouts)) return null;
    // v1 -> v2: Sprouts keep at most D.MAX_PARTS animal parts (the biggest ones stay); gumball items
    if (!s.v || s.v < 2) {
      for (const sp of s.sprouts) {
        const keep = Object.keys(sp.parts || {}).filter(p => p !== 'spots' && sp.parts[p] > 0).sort((a, b) => sp.parts[b] - sp.parts[a]);
        for (const p of keep.slice(D.MAX_PARTS)) delete sp.parts[p];
        sp.partOrder = keep.slice(0, D.MAX_PARTS).reverse();
      }
    }
    const f = fresh();
    for (const k of Object.keys(f)) if (s[k] === undefined || s[k] === null) s[k] = k === 'eggs' ? [] : f[k];
    s.progress.races = s.progress.races || {}; s.progress.leagues = s.progress.leagues || {};
    s.totals = Object.assign({}, f.totals, s.totals);
    s.items = Object.assign({ paints: {}, patterns: {}, hats: {} }, s.items);
    for (const sp of s.sprouts) {
      sp.stats = sp.stats || {}; for (const st of D.STATS) sp.stats[st] = sp.stats[st] || { lv: 0, xp: 0 };
      sp.parts = sp.parts || {}; sp.absorbed = sp.absorbed || {}; sp.look = sp.look || {};
      if (!Array.isArray(sp.partOrder)) sp.partOrder = Object.keys(sp.parts).filter(p => p !== 'spots' && sp.parts[p] > 0);
      sp.record = Object.assign({ races: 0, raceWins: 0, battles: 0, battleWins: 0 }, sp.record);
      if (sp.nature == null) sp.nature = 0; if (sp.stage == null) sp.stage = 0; if (!sp.form) sp.form = 'seedling';
      if (sp.happy == null) sp.happy = 70; if (sp.energy == null) sp.energy = 100; if (!D.AREAS[sp.area]) sp.area = 'meadow';
    }
    if (!s.v || s.v < SAVE_VERSION) s.v = SAVE_VERSION;
    return s;
  }
  function parseSave(raw) { try { return raw ? migrate(JSON.parse(raw)) : null; } catch (e) { return null; } }
  function load() { try { return parseSave(localStorage.getItem(KEY)); } catch (e) { return null; } }
  let saveTimer = null;
  function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(PS.S)); } catch (e) { /* storage may be blocked */ } }
  function save() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 400); }
  function reset() { PS.S = fresh(); saveNow(); emit('reset'); }

  // ---------------- player management ----------------
  const playersApi = {
    list: () => players.list.slice(),
    current: () => players.list.find(p => p.id === players.current),
    isTesting: () => !!SLOT,
    named: () => !!players.named,
    summary(id) {
      const sv = id === players.current && !SLOT ? PS.S : (() => { try { return parseSave(localStorage.getItem(keyFor(id))); } catch (e) { return null; } })();
      if (!sv) return { sprouts: 0, coins: 60, eggs: 1, partner: null };
      const partner = sv.sprouts.find(x => x.id === sv.activeId) || sv.sprouts[0] || null;
      return { sprouts: sv.sprouts.length, coins: sv.coins, eggs: sv.eggs.length, partner };
    },
    add(name) {
      let base = String(name || '').trim().slice(0, 12) || 'Player ' + (players.list.length + 1), nm = base, n = 2;
      while (players.list.some(p => p.name.toLowerCase() === nm.toLowerCase())) nm = `${base} ${n++}`;
      const p = { id: newId('p'), name: nm, created: Date.now() }; players.list.push(p); writePlayers(players); return p;
    },
    rename(id, name) { const p = players.list.find(x => x.id === id); if (!p) return; p.name = String(name || '').trim().slice(0, 14) || p.name; if (id === players.current) players.named = true; writePlayers(players); },
    remove(id) {
      if (players.list.length < 2) return false;
      players.list = players.list.filter(p => p.id !== id);
      try { localStorage.removeItem(keyFor(id)); } catch (e) { /* blocked */ }
      if (players.current === id) players.current = players.list[0].id;
      writePlayers(players); return true;
    },
    // switching players reloads the game with the other save
    // skipMenu: after the reload, go straight into the game instead of showing the main menu again
    switchTo(id, skipMenu) {
      if (!players.list.some(p => p.id === id)) return;
      saveNow(); players.current = id; players.named = true; writePlayers(players);
      if (skipMenu) { try { sessionStorage.setItem('solunar:skipMenu', '1'); } catch (e) { /* blocked */ } }
      location.reload();
    },
    touch() { const p = players.list.find(x => x.id === players.current); if (p) { p.lastPlayed = Date.now(); writePlayers(players); } },
    // a brand-new install: one unnamed player who hasn't hatched anything yet
    isFreshInstall() { return players.list.length === 1 && !players.named && playersApi.summary(players.list[0].id).sprouts === 0; },
    markNamed() { players.named = true; writePlayers(players); },
    // read-only copies of another player's Sprouts on this device (e.g. for friend battles). Never write these back.
    sproutsOf(id) {
      const sv = id === players.current && !SLOT ? PS.S : (() => { try { return parseSave(localStorage.getItem(keyFor(id))); } catch (e) { return null; } })();
      return sv ? JSON.parse(JSON.stringify(sv.sprouts)) : [];
    },
  };

  // ---------------- backups (copyable codes) ----------------
  // Format: "SOLUNAR1Z:" + base64(deflate(json)), or "SOLUNAR1J:" + base64(json) where compression is unavailable.
  const toB64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(out); };
  const fromB64 = str => { const bin = atob(str); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
  async function encodeBackup(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj)), tag = 'J';
    try { if (window.CompressionStream) { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(st).arrayBuffer()); tag = 'Z'; } } catch (e) { tag = 'J'; bytes = new TextEncoder().encode(JSON.stringify(obj)); }
    return `SOLUNAR1${tag}:${toB64(bytes)}`;
  }
  async function decodeBackup(code) {
    const m = /^SOLUNAR1([JZ]):([A-Za-z0-9+/=]+)$/.exec(String(code || '').replace(/\s+/g, ''));
    if (!m) throw new Error('That does not look like a Solunar Sprouts backup code.');
    let bytes = fromB64(m[2]);
    if (m[1] === 'Z') {
      if (!window.DecompressionStream) throw new Error('This device cannot open compressed backups. Try a newer browser.');
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(st).arrayBuffer());
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || (obj.kind !== 'player' && obj.kind !== 'all')) throw new Error('This backup code is incomplete.');
    return obj;
  }
  async function exportBackup(which) {
    saveNow();
    if (which === 'all') {
      const list = players.list.map(p => ({ name: p.name, save: p.id === players.current && !SLOT ? PS.S : parseSave(localStorage.getItem(keyFor(p.id))) })).filter(x => x.save);
      return encodeBackup({ kind: 'all', at: Date.now(), players: list });
    }
    return encodeBackup({ kind: 'player', at: Date.now(), name: (playersApi.current() || {}).name || 'Player', save: PS.S });
  }
  // mode 'new': add as new player(s) · mode 'replace': overwrite the current player (single-player backups only)
  function importBackup(obj, mode) {
    const entries = obj.kind === 'all' ? obj.players : [{ name: obj.name, save: obj.save }];
    const good = entries.map(e => ({ name: e.name, save: migrate(e.save) })).filter(e => e.save);
    if (!good.length) throw new Error('This backup has no saved games in it.');
    if (mode === 'replace' && obj.kind === 'player') {
      try { localStorage.setItem(KEY, JSON.stringify(good[0].save)); } catch (e) { throw new Error('This device would not let the game save.'); }
      return [playersApi.current().name];
    }
    const names = [];
    for (const e of good) {
      const p = playersApi.add(e.name); names.push(p.name);
      try { localStorage.setItem(keyFor(p.id), JSON.stringify(e.save)); } catch (err) { throw new Error('This device would not let the game save.'); }
    }
    return names;
  }

  // ---------------- clock (switches day/night every 15 real minutes) ----------------
  const PH = D.CLOCK.phaseMinutes * 60000, FADE = D.CLOCK.fadeSeconds * 1000;
  const clock = {
    now: () => Date.now() + (PS.S ? PS.S.clockOffset || 0 : 0),
    phase: () => Math.floor(clock.now() / PH),
    isNight: () => clock.phase() % 2 === 1,
    msToSwitch: () => PH - (clock.now() % PH),
    night() { // 0 = full day, 1 = full night, blends near the switch
      const into = clock.now() % PH, left = PH - into, n = clock.isNight() ? 1 : 0;
      if (into < FADE) return n ? 0.5 + 0.5 * into / FADE : 0.5 - 0.5 * into / FADE;
      if (left < FADE) return n ? 0.5 + 0.5 * left / FADE : 0.5 - 0.5 * left / FADE;
      return n;
    },
    toggle() { PS.S.clockOffset = (PS.S.clockOffset || 0) + (PH - clock.now() % PH) + 1000; save(); emit('night', { isNight: clock.isNight() }); },
  };
  let lastNight = null;
  setInterval(() => { if (!PS.S) return; const n = clock.isNight(); if (lastNight !== null && n !== lastNight) emit('night', { isNight: n }); lastNight = n; }, 2000);

  // ---------------- sprouts ----------------
  const blankStats = () => Object.fromEntries(D.STATS.map(s => [s, { lv: 0, xp: 0 }]));
  function uniqueName() {
    const used = new Set(PS.S.sprouts.map(s => s.name));
    return D.NAMES.find(n => !used.has(n)) || ('Sprout ' + (PS.S.sprouts.length + 1));
  }
  function makeSprout(opts) {
    opts = opts || {};
    const egg = D.EGGS[opts.kind] || D.EGGS.meadow;
    const s = {
      id: newId('s'), name: opts.name || uniqueName(), area: opts.area || 'meadow', born: Date.now(), kind: opts.kind || 'meadow',
      look: { body: opts.body || pick(egg.bodies), eyes: egg.sparkle ? 'sparkle' : pick(['round', 'round', 'sparkle', 'dot', 'sleepy']),
        pattern: Math.random() < 0.4 ? pick(['spots', 'stripes', 'twotone', 'freckles', 'heart', 'socks']) : 'plain', patternColor: pick(D.PATTERN_COLORS), hat: 'none' },
      stats: blankStats(), parts: {}, partOrder: [], absorbed: {}, nature: 0, stage: 0, form: 'seedling', flower: null,
      happy: 70, energy: 100, record: { races: 0, raceWins: 0, battles: 0, battleWins: 0 },
    };
    if (egg.skin) s.look.skin = egg.skin;
    if (egg.hat && D.HATS[egg.hat]) { s.look[D.HATS[egg.hat].slot] = egg.hat; if (!s.npc && PS.S) items().hats[egg.hat] = true; }
    if (egg.bonus) D.STATS.forEach(st => addXp(s, st, egg.bonus, true));
    return s;
  }
  const xpFor = lv => D.GROWTH.xpForLevel(lv);
  function addXp(s, stat, amt, quiet) {
    const st = s.stats[stat]; if (!st || !amt) return 0;
    st.xp += amt; let ups = 0;
    while (st.lv < D.GROWTH.maxLevel && st.xp >= xpFor(st.lv)) { st.xp -= xpFor(st.lv); st.lv++; ups++; }
    if (st.lv >= D.GROWTH.maxLevel) st.xp = 0;
    if (st.xp < 0) st.xp = 0;
    if (ups && !quiet && !s.npc) emit('levelup', { s, stat, lv: st.lv });
    return ups;
  }
  // gives = {stat: xp}. Returns {ups:{stat:n}, evolved}
  function gain(s, gives, opts) {
    opts = opts || {}; const ups = {};
    for (const [stat, amt] of Object.entries(gives || {})) { const n = addXp(s, stat, amt * (opts.mult || 1), opts.quiet); if (n) ups[stat] = n; }
    const evolved = s.npc ? null : checkEvolve(s);
    if (!s.npc) { emit('sprout:update', { s }); save(); }
    return { ups, evolved };
  }
  const totalLevels = s => D.STATS.reduce((a, k) => a + s.stats[k].lv, 0);
  const natureKind = s => (s.nature >= D.EVO.sunNature ? 'sun' : s.nature <= D.EVO.moonNature ? 'moon' : 'wild');
  function domStat(s) { return D.STATS.slice().sort((a, b) => (s.stats[b].lv * 1000 + s.stats[b].xp) - (s.stats[a].lv * 1000 + s.stats[a].xp))[0]; }
  function flowerFor(area, nature) { return Object.keys(D.FLOWERS).find(k => D.FLOWERS[k].area === area && D.FLOWERS[k].nature === nature) || 'daisy'; }
  function checkEvolve(s) {
    const tl = totalLevels(s); let ev = null;
    if (s.stage === 0 && tl >= D.EVO.budAt) ev = evolveTo(s, 1);
    if (s.stage === 1 && tl >= D.EVO.bloomAt) ev = evolveTo(s, 2);
    return ev;
  }
  function evolveTo(s, stage) {
    const from = formInfo(s).name;
    s.stage = stage;
    if (stage === 1) { s.form = natureKind(s) + 'bud'; s.bud = natureKind(s); }
    if (stage === 2) { s.flower = flowerFor(s.area, natureKind(s)); s.form = 'bloom'; }
    const to = formInfo(s).name;
    const ev = { s, from, to, name: s.name, stage };
    if (!s.npc) { emit('sprout:evolve', ev); save(); }
    return ev;
  }

  // ---------------- forms, moves, looks ----------------
  function formInfo(s) {
    if (s.stage === 2 && s.flower) {
      const f = D.FLOWERS[s.flower];
      return { id: 'bloom:' + s.flower, name: `${f.name} ${D.STAT_TITLES[domStat(s)]}`, short: f.name, stage: 2, el: f.el, nature: f.nature, moves: [f.sig, ...D.BLOOM_POOL[f.nature]] };
    }
    const F = D.FORMS[s.form] || D.FORMS.seedling;
    return { id: s.form, name: F.name, short: F.name, stage: F.stage, el: F.el, nature: F.nature || null, moves: F.moves.slice() };
  }
  const creature = id => D.ANIMALS[id] || D.RARES[id];
  function tierOf(id, count) { if (!count) return 0; if (D.RARES[id]) return 3; return count >= 6 ? 3 : count >= 3 ? 2 : 1; }
  function topAnimal(s) {
    const e = Object.entries(s.absorbed || {}).filter(([id]) => creature(id));
    if (!e.length) return null;
    e.sort((a, b) => (b[1] * (D.RARES[b[0]] ? 10 : 1)) - (a[1] * (D.RARES[a[0]] ? 10 : 1)));
    return e[0][0];
  }
  // Every animal/rare and every form has exactly 3 moves. A Sprout battles with its form's 3 + the best unlocked move of its top animal.
  function movesOf(s) {
    const ids = formInfo(s).moves.slice();
    const top = topAnimal(s);
    if (top) { const c = creature(top), t = tierOf(top, s.absorbed[top]); const m = c.moves[t - 1]; if (m && !ids.includes(m)) ids.push(m); }
    return ids;
  }
  // everything it knows, with where it came from (for the roster screen)
  function knownMoves(s) {
    const out = formInfo(s).moves.map(id => ({ id, from: formInfo(s).short, active: true }));
    const active = new Set(movesOf(s));
    for (const [aid, n] of Object.entries(s.absorbed || {})) {
      const c = creature(aid); if (!c) continue;
      const t = tierOf(aid, n);
      c.moves.forEach((id, i) => out.push({ id, from: c.name, locked: i >= t, unlockAt: D.RARES[aid] ? 1 : [1, 3, 6][i], active: active.has(id) && i < t }));
    }
    return out;
  }
  function elementsOf(s) {
    const els = [formInfo(s).el]; const top = topAnimal(s);
    if (top) { const e = creature(top).el; if (e && !els.includes(e) && e !== 'normal') els.push(e); }
    return els;
  }
  function battleStats(s) {
    const B = D.BATTLE, L = k => s.stats[k].lv;
    const tl = totalLevels(s);
    return {
      hp: Math.round(B.hpBase + L('stamina') * B.hpPerStamina + tl * B.hpPerLevel),
      atk: Math.round(B.atkBase + L('power') * B.atkPerPower),
      def: Math.round(B.defBase + L('stamina') * B.defPerStamina + L('swim') * B.defPerSwim),
      spd: Math.round(B.spdBase + L('run') * B.spdPerRun),
      eva: Math.min(B.evaMax, L('fly') * B.evaPerFly),
      els: elementsOf(s), level: tl,
    };
  }
  // Race rating per segment type (roughly 1.5 fresh → 6 mid-game → 12+ late). Body parts add a little.
  const PART_RACE = { run: ['ears'], swim: ['fins', 'tentacles'], climb: ['horns', 'claws', 'spikes'], fly: ['wings', 'batwings', 'fairywings', 'flamewings', 'dragonwings'] };
  function raceRating(s, seg) {
    const stat = D.RACE_STAT[seg] || seg;
    let r = 1.5 + s.stats[stat].lv * 0.35;
    for (const p of PART_RACE[seg] || []) r += (s.parts[p] || 0) * 0.8;
    return r;
  }
  function staminaRating(s) { return 1.5 + s.stats.stamina.lv * 0.35 + (s.parts.shell || 0) * 0.8; }

  // Pixel look for PX.sprig()
  function lookOf(s) {
    const PX = window.PX;
    const L = PX.cloneLook(PX.DEFAULT_LOOK);
    Object.assign(L, s.look || {});
    L.parts = Object.assign({ wings: 0, ears: 0, fins: 0, horns: 0, tail: 0, shell: 0 }, s.parts || {});
    const nk = natureKind(s);
    L.leaf = nk === 'sun' ? 'sun' : nk === 'moon' ? 'plum' : 'leaf';
    if ((s.parts || {}).spots && L.pattern === 'plain') { L.pattern = 'star'; L.patternColor = '#f7b6c8'; }
    if (s.stage === 1) L.bud = nk;
    if (s.stage === 2 && s.flower) { L.bloom = s.flower; delete L.bud; }
    return L;
  }

  // ---------------- animals & food ----------------
  function absorb(s, id) {
    const c = creature(id); if (!c) return null;
    const beforeTier = tierOf(id, s.absorbed[id] || 0);
    s.absorbed[id] = (s.absorbed[id] || 0) + 1;
    const afterTier = tierOf(id, s.absorbed[id]);
    const grew = [];
    if (c.rare) { for (const [p, v] of Object.entries(c.parts)) if ((s.parts[p] || 0) < v) { s.parts[p] = v; grew.push(p); } }
    else if (c.part) { const b = s.parts[c.part] || 0; s.parts[c.part] = Math.min(1, b + D.GROWTH.partPerAbsorb); if (s.parts[c.part] > b) grew.push(c.part); }
    const lost = trackParts(s, c.rare ? Object.keys(c.parts) : c.part ? [c.part] : []);
    s.nature = clamp(s.nature + (c.nature || 0) * (c.rare ? 1 : 3), -100, 100);
    s.happy = clamp(s.happy + 6, 0, 100);
    const res = gain(s, c.gives);
    const unlocked = afterTier > beforeTier ? c.moves.slice(beforeTier, afterTier) : [];
    return { id, name: c.name, gives: c.gives, ups: res.ups, grew: grew.filter(p => !lost.includes(p)), lost, unlocked, evolved: res.evolved };
  }
  // The newest parts go to the end of s.partOrder (touching a part again makes it new). Past D.MAX_PARTS, the oldest drops off.
  function trackParts(s, touched) {
    const order = Array.isArray(s.partOrder) ? s.partOrder : (s.partOrder = Object.keys(s.parts).filter(p => p !== 'spots' && s.parts[p] > 0));
    for (const p of touched) { if (p === 'spots') continue; const i = order.indexOf(p); if (i >= 0) order.splice(i, 1); order.push(p); }
    for (let i = order.length - 1; i >= 0; i--) if (!(s.parts[order[i]] > 0)) order.splice(i, 1);
    const lost = [];
    while (order.length > D.MAX_PARTS) { const p = order.shift(); delete s.parts[p]; lost.push(p); }
    return lost;
  }
  function feed(s, fruitId) {
    const f = D.FRUITS[fruitId]; if (!f) return null;
    s.happy = clamp(s.happy + (f.happy || 4), 0, 100);
    s.energy = clamp(s.energy + 15, 0, 100);
    if (f.nature) s.nature = clamp(s.nature + f.nature, -100, 100);
    return gain(s, f.gives);
  }
  function pet(s) { s.happy = clamp(s.happy + D.GROWTH.petHappy, 0, 100); s.nature = clamp(s.nature + 0.6, -100, 100); save(); }
  function roughHandle(s) { s.happy = clamp(s.happy - 4, 0, 100); s.nature = clamp(s.nature - 3, -100, 100); save(); }

  // ---------------- pouch (caught animals + bought rares) ----------------
  const animalsInPouch = () => PS.S.pouch.filter(id => !D.RARES[id]).length;
  function canCatch() { return animalsInPouch() < D.GROWTH.pouchMax; }
  function addToPouch(id) { if (!D.RARES[id] && !canCatch()) return false; PS.S.pouch.push(id); PS.S.seen['animal:' + id] = true; emit('pouch'); save(); return true; }
  function takeFromPouch(index) { const id = PS.S.pouch.splice(index, 1)[0]; emit('pouch'); save(); return id; }

  // ---------------- coins & shop ----------------
  function addCoins(n, why) { n = Math.max(0, Math.round(n)); if (!n) return 0; PS.S.coins += n; PS.S.totals.coinsEarned += n; emit('coins', { n, why }); save(); return n; }
  function spend(n) { if (PS.S.coins < n) return false; PS.S.coins -= n; emit('coins', { n: -n }); save(); return true; }
  function buy(kind, id) {
    if (kind === 'fruit') { const f = D.FRUITS[id]; if (!f || !spend(f.price)) return false; PS.S.fruits[id] = (PS.S.fruits[id] || 0) + 1; emit('pouch'); save(); return true; }
    if (kind === 'rare') { const r = D.RARES[id]; if (!r || !spend(r.price)) return false; PS.S.pouch.push(id); PS.S.seen['rare:' + id] = true; emit('pouch'); save(); return true; }
    if (kind === 'egg') { const e = D.EGGS[id]; if (!e || !e.price || !spend(e.price)) return false; addEgg(id, 'Bought at the shop'); return true; }
    return false;
  }
  function useFruit(id) { if (!PS.S.fruits[id]) return false; PS.S.fruits[id]--; if (!PS.S.fruits[id]) delete PS.S.fruits[id]; emit('pouch'); save(); return true; }
  function addFruit(id, n) { PS.S.fruits[id] = (PS.S.fruits[id] || 0) + (n || 1); emit('pouch'); save(); }

  // random garden drops: returns {type:'coin'|'xp', amount, stat?}
  function rollDrop() {
    const tbl = D.DROPS, total = Object.values(tbl).reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * total, key = 'coin';
    for (const [k, d] of Object.entries(tbl)) { r -= d.weight; if (r <= 0) { key = k; break; } }
    const d = tbl[key], mult = 1 + (PS.S.bestTier || 0) * 0.5;
    if (key === 'xp') return { type: 'xp', amount: irand(d.min, d.max), stat: pick(D.STATS) };
    return { type: 'coin', big: key === 'bigcoin', amount: Math.round(irand(d.min, d.max) * mult) };
  }

  // ---------------- selling Sprouts ----------------
  function sellPrice(s) {
    const S = D.SELL; let p = S.base + totalLevels(s) * S.perLevel + (S.stage[s.stage] || 0);
    for (const id of Object.keys(s.absorbed || {})) if (D.RARES[id]) p += D.RARES[id].price * S.rareShare;
    if (s.look && s.look.skin) p += S.skin;
    return Math.round(p);
  }
  const canSell = s => !!s && PS.S.sprouts.includes(s) && PS.S.sprouts.length > 1;
  // removes the Sprout for good and pays for it. Returns the coins paid (0 = not sold: you must keep at least one Sprout)
  function sellSprout(id) {
    const s = get(id); if (!canSell(s)) return 0;
    const price = sellPrice(s);
    PS.S.sprouts.splice(PS.S.sprouts.indexOf(s), 1);
    if (PS.S.activeId === id) PS.S.activeId = PS.S.sprouts[0].id;
    PS.S.totals.sold = (PS.S.totals.sold || 0) + 1;
    addCoins(price, 'sell');
    emit('sprout:sold', { s, price }); emit('sprout:update', { s: active() }); save();
    return price;
  }

  // ---------------- gumball machine + closet (paints, pattern stickers, hats) ----------------
  function weighted(list) { const tot = list.reduce((a, x) => a + x[1], 0); let r = Math.random() * tot; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[list.length - 1][0]; }
  const items = () => PS.S.items || (PS.S.items = { paints: {}, patterns: {}, hats: {} });
  const bump = (bag, id, n) => { bag[id] = (bag[id] || 0) + (n || 1); };
  // Spends the price and gives one prize. Returns null (unknown tier), {ok:false, reason:'coins'} or
  // {ok:true, tier, color (0..7 gumball colour), type, id?, n?, title, text}
  function gumball(tier) {
    const G = D.GUMBALL[tier]; if (!G) return null;
    if (!spend(G.price)) return { ok: false, reason: 'coins' };
    const mega = tier === 'mega', it = items();
    let type = weighted(G.prizes), out = null;
    const coins = n => { const got = addCoins(n, 'gumball'); return { type: 'coins', n: got, title: `${got} coins`, text: 'Coins spill out of the gumball!' }; };
    if (type === 'hat') {
      const pool = Object.keys(D.HATS).filter(h => D.HATS[h].tier <= (mega ? 3 : 2) && !it.hats[h]);
      if (pool.length) { const h = pick(pool); it.hats[h] = true; out = { type, id: h, title: D.HATS[h].name, text: `A new ${D.HATS[h].slot === 'extra' ? 'accessory' : 'hat'} for your closet. Any Sprout can wear it.` }; }
      else type = 'coins';
    }
    if (type === 'animal') {
      const id = pick(Object.keys(D.ANIMALS));
      if (canCatch()) { PS.S.pouch.push(id); PS.S.seen['animal:' + id] = true; emit('pouch'); out = { type, id, title: `A ${D.ANIMALS[id].name}!`, text: `It hopped into your pouch. It lives in ${D.AREAS[D.ANIMALS[id].area].name}.` }; }
      else type = 'coins';
    }
    if (!out) switch (type) {
      case 'coins': out = coins(irand(G.coins[0], G.coins[1])); break;
      case 'fruit': {
        const pool = Object.keys(D.FRUITS).filter(k => k !== 'goldfruit' && k !== 'apple'), got = [pick(pool), pick(pool), pick(['apple', pick(pool)])];
        got.forEach(k => bump(PS.S.fruits, k)); emit('pouch');
        out = { type, id: got[0], n: 3, title: '3 fruits', text: got.map(k => D.FRUITS[k].name).join(', ') + '. Find them in the Garden fruit tray.' }; break;
      }
      case 'goldfruit': { const n = mega ? 2 : 1; bump(PS.S.fruits, 'goldfruit', n); emit('pouch'); out = { type, id: 'goldfruit', n, title: `${n} Golden Fruit`, text: 'XP to every stat. Find it in the Garden fruit tray.' }; break; }
      case 'paint': { const id = pick(Object.keys(D.COLORS)); bump(it.paints, id); out = { type, id, title: `${D.COLORS[id]} paint`, text: 'Paint a Sprout this color from its page in Sprouts.' }; break; }
      case 'pattern': { const id = pick(Object.keys(D.PATTERNS).filter(k => k !== 'plain')); bump(it.patterns, id); out = { type, id, title: `${D.PATTERNS[id]} sticker`, text: 'Give a Sprout this pattern from its page in Sprouts.' }; break; }
      case 'egg': { const k = pick(D.AREA_ORDER); addEgg(k, 'Gumball machine'); out = { type, id: k, title: D.EGGS[k].name, text: `It's waiting in ${D.AREAS[k].name}. Tap it to hatch.` }; break; }
      case 'spookyegg': { const k = pick(D.SPOOKY_EGGS); const e = addEgg(k, 'Gumball machine'); out = { type: 'egg', id: k, title: D.EGGS[k].name + '!', text: `A spooky surprise! It's waiting in ${D.AREAS[e.area].name}.` }; break; }
      case 'goldenegg': case 'rainbowegg': { const k = type === 'goldenegg' ? 'golden' : 'rainbow'; const e = addEgg(k, 'Gumball machine'); out = { type: 'egg', id: k, title: D.EGGS[k].name + '!', text: `A jackpot! It's waiting in ${D.AREAS[e.area].name}.` }; break; }
      case 'rare': { const id = pick(Object.keys(D.RARES)); PS.S.pouch.push(id); PS.S.seen['rare:' + id] = true; emit('pouch'); out = { type, id, title: `A ${D.RARES[id].name}!`, text: 'The jackpot! It is waiting in your pouch in the Garden.' }; break; }
      default: out = coins(irand(G.coins[0], G.coins[1]));
    }
    PS.S.totals.gumballs = (PS.S.totals.gumballs || 0) + 1;
    emit('items'); save();
    return Object.assign({ ok: true, tier, color: irand(0, 7) }, out);
  }
  // use one paint tin: new body colour (a special skin is painted over)
  function usePaint(s, color) {
    const it = items(); if (!s || !it.paints[color] || !D.COLORS[color]) return false;
    if (--it.paints[color] <= 0) delete it.paints[color];
    s.look.body = color; delete s.look.skin;
    emit('sprout:update', { s }); emit('items'); save(); return true;
  }
  // use one pattern sticker ('plain' is free: it removes the pattern)
  function usePattern(s, pat) {
    const it = items(); if (!s || !D.PATTERNS[pat]) return false;
    if (pat !== 'plain') { if (!it.patterns[pat]) return false; if (--it.patterns[pat] <= 0) delete it.patterns[pat]; }
    s.look.pattern = pat;
    if (pat !== 'plain') s.look.patternColor = pick(D.PATTERN_COLORS.filter(c => c !== s.look.patternColor));
    emit('sprout:update', { s }); emit('items'); save(); return true;
  }
  // hats are kept forever once won; id 'none' takes off whatever is in that slot ('hat' or 'extra')
  const ownsHat = id => !!items().hats[id];
  function wear(s, id, slot) {
    if (!s) return false;
    if (id === 'none') { s.look[slot || 'hat'] = 'none'; }
    else { const H = D.HATS[id]; if (!H || !ownsHat(id)) return false; s.look[H.slot] = s.look[H.slot] === id ? 'none' : id; }
    emit('sprout:update', { s }); save(); return true;
  }

  // ---------------- eggs ----------------
  function addEgg(kind, source) {
    const area = D.AREAS[kind] ? kind : PS.S.area;
    const egg = { id: newId('e'), kind, source: source || '', area, taps: 0 };
    PS.S.eggs.push(egg); emit('egg:new', { egg }); save(); return egg;
  }
  function hatchEgg(eggId) {
    const i = PS.S.eggs.findIndex(e => e.id === eggId); if (i < 0) return null;
    const egg = PS.S.eggs.splice(i, 1)[0];
    const s = makeSprout({ kind: egg.kind, area: egg.area });
    PS.S.sprouts.push(s);
    const hw = (D.EGGS[egg.kind] || {}).hatchWith;
    if (hw) { const rid = hw === 'random' ? pick(Object.keys(D.RARES)) : hw; absorb(s, rid); s.bornWith = rid; }
    if (!PS.S.activeId) PS.S.activeId = s.id;
    emit('egg:hatch', { egg, s }); save(); return s;
  }
  function moveSprout(s, area) { if (!D.AREAS[area]) return; s.area = area; emit('sprout:update', { s }); save(); }
  function renameSprout(s, name) { s.name = String(name || '').trim().slice(0, 12) || s.name; emit('sprout:update', { s }); save(); }
  const get = id => PS.S.sprouts.find(s => s.id === id);
  const active = () => get(PS.S.activeId) || PS.S.sprouts[0] || null;
  function setActive(id) { PS.S.activeId = id; save(); emit('sprout:update', { s: get(id) }); }

  // ---------------- races ----------------
  const raceKey = (id, tier) => `${id}-${tier}`;
  function raceProgress(id, tier) { return PS.S.progress.races[raceKey(id, tier)] || { runs: 0, wins: 0, best: null }; }
  function raceUnlocked(id, tier) {
    const r = D.RACES.find(x => x.id === id); if (!r) return false;
    if (tier > 0 && !raceProgress(id, tier - 1).wins) return false;
    if (!r.unlock) return true;
    return raceProgress(r.unlock.race, r.unlock.tier).wins > 0;
  }
  function raceRivals(id, tier) {
    const T = D.RACE_TIERS[tier], R = D.RACES.findIndex(x => x.id === id);
    let seed = (R + 1) * 97 + tier * 13; const sr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const names = D.NAMES.slice().sort(() => sr() - 0.5).slice(0, 3);
    const bodies = ['clay', 'plum', 'sky', 'rose', 'leaf', 'slate', 'sun', 'berry', 'night', 'cocoa'];
    return names.map((name, i) => {
      const base = T.rating[0] + (T.rating[1] - T.rating[0]) * (i / 2);
      const rt = seg => +(base * (0.8 + sr() * 0.4)).toFixed(2);
      const parts = {}; const specialty = ['wings', 'fins', 'ears', 'horns'][Math.floor(sr() * 4)]; if (tier > 0) parts[specialty] = tier >= 2 ? 1 : 0.5;
      return { name, look: Object.assign(window.PX.cloneLook(window.PX.DEFAULT_LOOK), { body: bodies[Math.floor(sr() * bodies.length)], parts: Object.assign({ wings: 0, ears: 0, fins: 0, horns: 0, tail: 0, shell: 0 }, parts), eyes: ['round', 'brave', 'dot'][Math.floor(sr() * 3)] }),
        rating: { run: rt(), swim: rt(), climb: rt(), fly: rt(), stamina: rt() }, cheer: T.cheerSkill };
    });
  }
  // place: 0 = 1st. Applies coins, XP, progress, eggs. Returns a summary for the results screen.
  function finishRace(s, id, tier, place, timeSec) {
    const T = D.RACE_TIERS[tier], ri = D.RACES.findIndex(x => x.id === id), R = D.RACES[ri];
    const key = raceKey(id, tier), p = PS.S.progress.races[key] || { runs: 0, wins: 0, best: null };
    const firstWin = place === 0 && !p.wins;
    p.runs++; if (place === 0) p.wins++; if (timeSec && (!p.best || timeSec < p.best)) p.best = +timeSec.toFixed(2);
    PS.S.progress.races[key] = p;
    const coins = addCoins(T.coins * (1 + ri * 0.15) * D.RACE_PLACE_SHARE[place], 'race');
    const mixTotal = Object.values(R.mix).reduce((a, b) => a + b, 0), gives = {};
    for (const [seg, w] of Object.entries(R.mix)) { const st = D.RACE_STAT[seg]; gives[st] = (gives[st] || 0) + T.xp * (w / mixTotal) * 2.5 * (place === 0 ? 1 : 0.6); }
    gives.stamina = (gives.stamina || 0) + T.xp * 0.5;
    const res = gain(s, gives);
    s.record.races++; if (place === 0) s.record.raceWins++;
    PS.S.totals.races++; if (place === 0) PS.S.totals.raceWins++;
    let egg = null;
    if (firstWin) { egg = addEgg(tier === 2 || id === 'grand' ? (tier === 2 && id === 'grand' ? 'golden' : R.area) : R.area, `${R.name} ${T.name}`); PS.S.bestTier = Math.max(PS.S.bestTier, tier + 1); }
    save();
    return { coins, gives, ups: res.ups, evolved: res.evolved, egg, firstWin, unlockedNext: firstWin };
  }

  // ---------------- battles ----------------
  function leagueProgress(id) { return PS.S.progress.leagues[id] || { beaten: [false, false, false], cleared: false }; }
  function leagueUnlocked(id) { const L = D.LEAGUES.find(l => l.id === id); return !!L && (!L.unlock || leagueProgress(L.unlock).cleared); }
  // Build a sprout-shaped NPC so movesOf / battleStats / lookOf work on opponents too.
  function makeNPC(leagueId, index) {
    const L = D.LEAGUES.find(l => l.id === leagueId), o = L.opponents[index];
    const s = { id: 'npc-' + leagueId + index, npc: true, name: o.name, area: o.flower ? D.FLOWERS[o.flower].area : 'meadow',
      look: Object.assign({ eyes: 'brave', pattern: 'plain', patternColor: '#fbf3dc', hat: 'none' }, o.look || {}),
      stats: blankStats(), parts: {}, absorbed: {}, nature: o.nature, stage: 0, form: 'seedling', flower: null, happy: 80, energy: 100, record: {} };
    // spread levels by the animals' strengths
    const w = { swim: 1, fly: 1, run: 1, power: 1, stamina: 1.2 };
    for (const [aid, n] of Object.entries(o.animals || {})) {
      const c = creature(aid); if (!c) continue; s.absorbed[aid] = n;
      for (const [st, v] of Object.entries(c.gives)) if (v > 0) w[st] += v / 10 * n;
      if (c.rare) Object.assign(s.parts, c.parts); else if (c.part) s.parts[c.part] = Math.min(1, n * D.GROWTH.partPerAbsorb);
    }
    const wt = Object.values(w).reduce((a, b) => a + b, 0);
    for (const st of D.STATS) s.stats[st].lv = Math.round(o.lv * w[st] / wt);
    if (o.stage >= 1) { s.stage = 1; s.form = natureKind(s) + 'bud'; }
    if (o.stage >= 2) { s.stage = 2; s.flower = o.flower; s.form = 'bloom'; }
    return s;
  }
  function finishBattle(s, leagueId, index, won) {
    const L = D.LEAGUES.find(l => l.id === leagueId), p = leagueProgress(leagueId);
    const coins = addCoins(won ? L.coins * (1 + index * 0.25) : L.coins * D.BATTLE.loseCoinsShare, 'battle');
    const g = L.xp * (won ? 1 : 0.35);
    const res = gain(s, { power: g * 1.2, stamina: g, run: g * 0.6, fly: g * 0.4, swim: g * 0.4 });
    s.record.battles++; if (won) s.record.battleWins++;
    PS.S.totals.battles++; if (won) PS.S.totals.battleWins++;
    let egg = null, cleared = false, bonus = 0;
    if (won) {
      p.beaten[index] = true;
      if (!p.cleared && p.beaten.every(Boolean)) {
        p.cleared = true; cleared = true;
        bonus = addCoins(L.coins * 3, 'league');
        egg = addEgg(L.egg, L.name);
        PS.S.bestTier = Math.max(PS.S.bestTier, Math.min(3, Math.ceil((D.LEAGUES.indexOf(L) + 1) / 2)));
      }
    }
    PS.S.progress.leagues[leagueId] = p; save();
    return { coins: coins + bonus, bonus, ups: res.ups, evolved: res.evolved, egg, cleared };
  }

  // ---------------- boot ----------------
  const PS = window.PS = {
    D, S: load() || fresh(), save, saveNow, reset, on, emit, clock, players: playersApi,
    backup: { exportBackup, decodeBackup, importBackup },
    util: { rand, irand, pick, clamp, newId },
    state: {
      makeSprout, addXp, gain, totalLevels, natureKind, domStat, formInfo, movesOf, knownMoves, elementsOf, battleStats,
      raceRating, staminaRating, lookOf, absorb, feed, pet, roughHandle, creature, tierOf, topAnimal,
      canCatch, addToPouch, takeFromPouch, addCoins, spend, buy, useFruit, addFruit, rollDrop,
      addEgg, hatchEgg, moveSprout, renameSprout, get, active, setActive,
      raceProgress, raceUnlocked, raceRivals, finishRace,
      leagueProgress, leagueUnlocked, makeNPC, finishBattle, checkEvolve, evolveTo, flowerFor, PART_RACE, esc,
      sellPrice, canSell, sellSprout, gumball, items, usePaint, usePattern, ownsHat, wear,
    },
  };
  lastNight = clock.isNight();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);
})();
