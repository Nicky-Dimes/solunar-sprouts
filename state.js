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
      seen: {}, bestTier: 0, totals: { races: 0, raceWins: 0, battles: 0, battleWins: 0, coinsEarned: 0, gumballs: 0, sold: 0, playSec: 0 },
      items: { paints: {}, patterns: {}, hats: {} },
    };
  }
  // Save format version. When the save shape changes, bump this and add a step to migrate() so old saves upgrade instead of breaking.
  // migrate() must never throw: it repairs what it can (and notes it in `repairs`) so one bad entry can't cost a whole game.
  const SAVE_VERSION = 3;
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  function migrate(s, repairs) {
    repairs = repairs || [];
    if (!isObj(s) || !Array.isArray(s.sprouts)) return null;
    // v1 -> v2: Sprouts keep at most D.MAX_PARTS animal parts (the biggest ones stay); gumball items
    if (!s.v || s.v < 2) {
      for (const sp of s.sprouts) {
        if (!isObj(sp)) continue;
        const pp = isObj(sp.parts) ? sp.parts : {};
        const keep = Object.keys(pp).filter(p => p !== 'spots' && pp[p] > 0).sort((a, b) => pp[b] - pp[a]);
        for (const p of keep.slice(D.MAX_PARTS)) delete pp[p];
        sp.partOrder = keep.slice(0, D.MAX_PARTS).reverse();
      }
    }
    // v3: every field gets a sane type (older builds could only add missing fields), extras written by race/battle/garden are normalised
    const f = fresh();
    for (const k of Object.keys(f)) if (s[k] === undefined || s[k] === null) s[k] = k === 'eggs' ? [] : f[k];
    for (const k of ['eggs', 'pouch']) if (!Array.isArray(s[k])) { repairs.push(k); s[k] = []; }
    for (const k of ['fruits', 'progress', 'seen', 'totals', 'items']) if (!isObj(s[k])) { repairs.push(k); s[k] = f[k]; }
    s.coins = Math.max(0, Math.round(num(s.coins, 0)));
    s.progress.races = isObj(s.progress.races) ? s.progress.races : {}; s.progress.leagues = isObj(s.progress.leagues) ? s.progress.leagues : {};
    for (const k of ['raceExtra', 'battleExtra']) if (s.progress[k] != null && !isObj(s.progress[k])) { repairs.push(k); delete s.progress[k]; }
    if (s.garden != null && !isObj(s.garden)) { repairs.push('garden'); delete s.garden; }
    fixBattleExtra(s.progress.battleExtra, repairs);
    fixRaceExtra(s.progress.raceExtra, repairs);
    if (s.garden) for (const k of ['trees', 'ground']) {
      if (s.garden[k] != null && !isObj(s.garden[k])) { repairs.push('garden.' + k); delete s.garden[k]; continue; }
      for (const [a, list] of Object.entries(s.garden[k] || {})) if (!Array.isArray(list)) { repairs.push('garden.' + k); delete s.garden[k][a]; }
    }
    s.totals = Object.assign({}, f.totals, s.totals);
    s.items = Object.assign({ paints: {}, patterns: {}, hats: {} }, s.items);
    for (const k of ['paints', 'patterns', 'hats']) if (!isObj(s.items[k])) s.items[k] = {};
    s.pouch = s.pouch.filter(id => typeof id === 'string');
    s.eggs = s.eggs.filter(e => { if (isObj(e) && typeof e.kind === 'string') return true; repairs.push('egg'); return false; });
    for (const e of s.eggs) { if (!e.id) e.id = newId('e'); e.taps = num(e.taps, 0); if (!D.AREAS[e.area]) e.area = D.AREAS[e.kind] ? e.kind : 'meadow'; }
    s.sprouts = s.sprouts.filter(sp => { if (isObj(sp)) return true; repairs.push('sprout'); return false; });
    for (const sp of s.sprouts) {
      if (!sp.id) sp.id = newId('s'); if (typeof sp.name !== 'string' || !sp.name) sp.name = 'Sprout';
      if (!isObj(sp.stats)) sp.stats = {};
      for (const st of D.STATS) { const x = sp.stats[st]; sp.stats[st] = isObj(x) ? { lv: Math.max(0, Math.min(D.GROWTH.maxLevel, Math.round(num(x.lv, 0)))), xp: Math.max(0, num(x.xp, 0)) } : { lv: 0, xp: 0 }; }
      if (!isObj(sp.parts)) sp.parts = {}; if (!isObj(sp.absorbed)) sp.absorbed = {}; if (!isObj(sp.look)) sp.look = {};
      if (!Array.isArray(sp.partOrder)) sp.partOrder = Object.keys(sp.parts).filter(p => p !== 'spots' && sp.parts[p] > 0);
      if (sp.moveset != null && (!Array.isArray(sp.moveset) || sp.moveset.some(x => typeof x !== 'string'))) { repairs.push('moveset'); delete sp.moveset; } // chosen battle moves (optional)
      sp.record = Object.assign({ races: 0, raceWins: 0, battles: 0, battleWins: 0 }, isObj(sp.record) ? sp.record : {});
      sp.nature = num(sp.nature, 0); if (sp.stage == null) sp.stage = 0; if (!sp.form) sp.form = 'seedling';
      sp.happy = num(sp.happy, 70); if (sp.energy == null) sp.energy = 100; if (!D.AREAS[sp.area]) sp.area = 'meadow';
    }
    if (!s.v || s.v < SAVE_VERSION) s.v = SAVE_VERSION;
    return s;
  }
  // battle.js keeps its own progress in progress.battleExtra (bosses, tower, friend, snack, seen, wild). Only wrong types are fixed;
  // missing parts are fine (battle.js fills them in when it needs them).
  function fixBattleExtra(bx, repairs) {
    if (!isObj(bx)) return;
    const bad = k => repairs.push('battleExtra.' + k);
    for (const k of ['bosses', 'friend', 'seen']) if (bx[k] != null && !isObj(bx[k])) { bad(k); bx[k] = {}; }
    for (const [id, b] of Object.entries(bx.bosses || {})) if (!isObj(b)) { bad('bosses'); delete bx.bosses[id]; }
    if (bx.tower != null && !isObj(bx.tower)) { bad('tower'); bx.tower = { best: 0, runs: 0, run: null }; }
    if (bx.tower) {
      for (const k of ['best', 'runs']) if (bx.tower[k] != null && typeof bx.tower[k] !== 'number') { bad('tower'); bx.tower[k] = 0; }
      const r = bx.tower.run;
      if (r != null && (!isObj(r) || typeof r.sid !== 'string' || !(num(r.floor, 0) >= 1))) { bad('tower.run'); bx.tower.run = null; }
      else if (r && r.fighting != null && typeof r.fighting !== 'number') delete r.fighting;
    }
    if (bx.wild != null && !isObj(bx.wild)) { bad('wild'); bx.wild = {}; }
    if (bx.wild) {
      if (bx.wild.animals != null && !isObj(bx.wild.animals)) { bad('wild'); bx.wild.animals = {}; }
      if (bx.wild.areas != null && !isObj(bx.wild.areas)) { bad('wild'); bx.wild.areas = {}; }
      for (const [id, v] of Object.entries(bx.wild.animals || {})) if (!Array.isArray(v) || v.length !== 3 || v.some(x => typeof x !== 'number')) { bad('wild'); delete bx.wild.animals[id]; }
    }
    if (bx.snack != null && typeof bx.snack !== 'string') delete bx.snack;
  }
  // race.js keeps the extra/wild series, time trials (with ghost runs), the Daily Cup and hint counters in progress.raceExtra.
  function fixRaceExtra(rx, repairs) {
    if (!isObj(rx)) return;
    const bad = k => repairs.push('raceExtra.' + k);
    for (const k of ['series', 'trials', 'daily', 'hint']) if (rx[k] != null && !isObj(rx[k])) { bad(k); rx[k] = {}; }
    for (const [key, v] of Object.entries(rx.series || {})) if (!isObj(v)) { bad('series'); delete rx.series[key]; }
    for (const [key, v] of Object.entries(rx.trials || {})) {
      if (!isObj(v)) { bad('trials'); delete rx.trials[key]; continue; }
      if (v.g != null && (!Array.isArray(v.g) || v.g.some(x => typeof x !== 'number'))) { bad('trials'); delete v.g; delete v.dt; delete v.len; } // a broken ghost goes; the best time stays
    }
  }
  function parseSave(raw, repairs) { try { return raw ? migrate(JSON.parse(raw), repairs) : null; } catch (e) { return null; } }

  // ---------------- safety net: automatic daily backups + a kept copy of any save that fails to load ----------------
  // They live under their own prefixes (never a player key). SNAP: up to 3 known-good saves from different days (race-ghost
  // replays left out to save space). RESCUE: the raw text of a save that couldn't be opened, so nothing is ever overwritten blind.
  const SNAP = 'solunar:snap:v1:', RESCUE = 'solunar:rescue:v1:', SNAP_KEEP = 3;
  const dayOf = ts => new Date(ts).toDateString();
  function readSnaps(key) { try { const v = JSON.parse(localStorage.getItem(SNAP + (key || KEY))); return v && Array.isArray(v.list) ? v.list.filter(x => x && x.raw && x.at) : []; } catch (e) { return []; } }
  function snapshot(raw) {
    try {
      const list = readSnaps();
      if (list.length && dayOf(list[0].at) === dayOf(Date.now())) return; // one per day: the first good load of the day
      const obj = JSON.parse(raw), rx = obj && obj.progress && obj.progress.raceExtra;
      if (rx && isObj(rx.trials)) for (const t of Object.values(rx.trials)) if (isObj(t)) delete t.g;
      list.unshift({ at: Date.now(), raw: JSON.stringify(obj) });
      try { localStorage.setItem(SNAP + KEY, JSON.stringify({ list: list.slice(0, SNAP_KEEP) })); }
      catch (e) { try { localStorage.setItem(SNAP + KEY, JSON.stringify({ list: list.slice(0, 1) })); } catch (e2) { localStorage.removeItem(SNAP + KEY); } } // never crowd out the real save
    } catch (e) { /* optional */ }
  }
  function keepRescue(raw) { try { localStorage.setItem(RESCUE + KEY, JSON.stringify({ at: Date.now(), raw })); } catch (e) { /* storage full: the raw save is still in place until the next save */ } }
  let loadNote = null; // tells the app (once) that a save had to be repaired, restored from a daily backup, or restarted
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (raw == null) return null; // a brand-new player
    const repairs = [], s = parseSave(raw, repairs);
    if (s && !repairs.length) { snapshot(raw); return s; }
    keepRescue(raw); // keep the original text before anything overwrites it
    if (s) { loadNote = { kind: 'repaired', what: repairs }; return s; }
    for (const sn of readSnaps()) { const b = parseSave(sn.raw); if (b) { loadNote = { kind: 'snapshot', at: sn.at }; return b; } }
    loadNote = { kind: 'fresh' };
    return null;
  }
  let saveTimer = null, saveLockUntil = 0, saveFailed = false;
  // returns false (and tells the app once) when the device refuses to save
  function saveNow() {
    if (Date.now() < saveLockUntil) return true;
    try { localStorage.setItem(KEY, JSON.stringify(PS.S)); if (saveFailed) { saveFailed = false; emit('save:ok'); } return true; }
    catch (e) { if (!saveFailed) { saveFailed = true; emit('save:failed', { error: e }); } return false; }
  }
  function save() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 400); }
  // Before a reload that must not write the old in-memory game back (a restore, or removing the current player): stop saving.
  function lockSaves(ms) { saveLockUntil = Date.now() + (ms || 10000); if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }
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
    // (its daily automatic backups are kept for a while, so a removal by mistake can still be undone from Backups)
    remove(id) {
      if (players.list.length < 2) return false;
      const wasCurrent = players.current === id && !SLOT;
      if (wasCurrent) lockSaves(60000); // the reload that follows must not write this game back
      players.list = players.list.filter(p => p.id !== id);
      try { localStorage.removeItem(keyFor(id)); } catch (e) { /* blocked */ }
      if (players.current === id) players.current = players.list[0].id;
      writePlayers(players); return true;
    },
    // switching players reloads the game with the other save
    // skipMenu: after the reload, go straight into the game instead of showing the main menu again
    switchTo(id, skipMenu) {
      if (!players.list.some(p => p.id === id)) return;
      saveNow(); lockSaves(); players.current = id; players.named = true; writePlayers(players);
      if (skipMenu) { try { sessionStorage.setItem('solunar:skipMenu', '1'); } catch (e) { /* blocked */ } }
      location.reload();
    },
    // backup reminders: when each player's game was last copied or shared as a backup code (kept with the player list)
    markBackedUp(ids) { if (SLOT) return; players.backedUp = Object.assign({}, players.backedUp); for (const id of ids) players.backedUp[id] = Date.now(); writePlayers(players); },
    lastBackup: id => (players.backedUp && players.backedUp[id]) || 0,
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
      replaceCurrent(good[0].save);
      return [playersApi.current().name];
    }
    const names = [];
    for (const e of good) {
      const p = playersApi.add(e.name); names.push(p.name);
      try { localStorage.setItem(keyFor(p.id), JSON.stringify(e.save)); } catch (err) { throw new Error('This device would not let the game save.'); }
    }
    return names;
  }
  // Put a whole saved game in place of the current player's, then hold saves until the caller reloads:
  // the old game still in memory (and every save-on-exit handler) must never be written back over it.
  function replaceCurrent(saveObj) {
    try { localStorage.setItem(KEY, JSON.stringify(saveObj)); } catch (e) { throw new Error('This device would not let the game save.'); }
    PS.S = saveObj; lockSaves(10000);
  }
  // Automatic daily backups of the current player (newest first) and the kept copy of a save that failed to load.
  const autoBackups = () => readSnaps().map((sn, i) => { const s = parseSave(sn.raw); return { i, at: sn.at, ok: !!s, sprouts: s ? s.sprouts.length : 0, coins: s ? s.coins : 0 }; });
  function restoreAuto(i) { const sn = readSnaps()[i], s = sn && parseSave(sn.raw); if (!s) throw new Error('That backup could not be opened.'); replaceCurrent(s); return true; }
  function rescued() { try { const v = JSON.parse(localStorage.getItem(RESCUE + KEY)); return v && v.raw ? v : null; } catch (e) { return null; } }
  // tidy up: automatic backups of players removed more than 30 days ago
  function pruneSnaps() {
    try {
      const live = new Set(players.list.map(p => SNAP + keyFor(p.id)));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i); if (!k || !k.startsWith(SNAP) || live.has(k) || k === SNAP + KEY) continue;
        const list = readSnaps(k.slice(SNAP.length)); if (!list.length || Date.now() - list[0].at > 30 * 86400000) localStorage.removeItem(k);
      }
    } catch (e) { /* optional */ }
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
      look: { body: opts.body || pick(egg.bodies), eyes: egg.sparkle ? 'sparkle' : pick(['round', 'round', 'round', 'sparkle', 'dot', 'sleepy', 'star', 'wink', 'big']),
        pattern: Math.random() < 0.4 ? pick(['spots', 'stripes', 'twotone', 'freckles', 'heart', 'socks', 'zigzag', 'patches', 'tiger', 'moonmark']) : 'plain', patternColor: pick(D.PATTERN_COLORS), hat: 'none' },
      stats: blankStats(), parts: {}, partOrder: [], absorbed: {}, nature: 0, stage: 0, form: 'seedling', flower: null,
      happy: 70, energy: 100, record: { races: 0, raceWins: 0, battles: 0, battleWins: 0 },
    };
    if (s.look.pattern !== 'plain') s.look.patternColor = patternColorFor(s, s.look.pattern); // one you can see on this body
    if (egg.skin) s.look.skin = egg.skin;
    else if (!opts.npc && Math.random() < D.SHINY_CHANCE) s.look.shiny = true; // a rare shimmering Shiny (about 1 in 30 ordinary hatches)
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
  // a very happy Sprout (happiness 75+, from petting, snacks and new friends) learns a little faster: +10% on every XP gain
  const happyBonus = s => (s && !s.npc && (s.happy || 0) >= 75 ? 1.1 : 1);
  // gives = {stat: xp}. Returns {ups:{stat:n}, evolved}
  function gain(s, gives, opts) {
    opts = opts || {}; const ups = {}, k = (opts.mult || 1) * (opts.quiet ? 1 : happyBonus(s));
    for (const [stat, amt] of Object.entries(gives || {})) { const n = addXp(s, stat, amt > 0 ? amt * k : amt * (opts.mult || 1), opts.quiet); if (n) ups[stat] = n; }
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
  // the bonded creature a Sprout battles with: any rare creature beats ordinary animals (you paid for it, you see it), then the most-bonded
  function topAnimal(s) {
    const e = Object.entries(s.absorbed || {}).filter(([id]) => creature(id));
    if (!e.length) return null;
    e.sort((a, b) => (!!D.RARES[b[0]] - !!D.RARES[a[0]]) || (b[1] - a[1]));
    return e[0][0];
  }
  // Every animal/rare and every form has exactly 3 moves. By default a Sprout battles with its form's 3 + the best unlocked move of its
  // top animal. The player can instead pick any MAX_MOVES of the moves it has learned (s.moveset); NPCs always use the default.
  const MAX_MOVES = 4;
  function defaultMoves(s) {
    const ids = formInfo(s).moves.slice();
    const top = topAnimal(s);
    if (top) { const c = creature(top), t = tierOf(top, s.absorbed[top]); const m = c.moves[t - 1]; if (m && !ids.includes(m)) ids.push(m); }
    return ids;
  }
  // every move it can use right now: its form's 3, plus each bonded creature's unlocked moves
  function learnedMoves(s) {
    const ids = formInfo(s).moves.filter(id => D.MOVES[id]);
    for (const [aid, n] of Object.entries(s.absorbed || {})) { const c = creature(aid); if (!c) continue; c.moves.slice(0, tierOf(aid, n)).forEach(id => { if (D.MOVES[id] && !ids.includes(id)) ids.push(id); }); }
    return ids;
  }
  function movesOf(s) {
    const def = defaultMoves(s);
    if (s.npc || !Array.isArray(s.moveset) || !s.moveset.length) return def;
    const known = new Set(learnedMoves(s)), pick = s.moveset.filter((id, i, a) => known.has(id) && a.indexOf(id) === i).slice(0, MAX_MOVES);
    if (!pick.length) return def;
    for (const id of def) if (pick.length < Math.min(MAX_MOVES, known.size) && !pick.includes(id)) pick.push(id); // a move lost when it evolved: fill the gap
    return pick;
  }
  // pick the battle moves (null or the usual set = let the game choose, which then follows new forms and animals by itself)
  function setMoves(s, ids) {
    const known = new Set(learnedMoves(s)), pick = (ids || []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i).slice(0, MAX_MOVES);
    const def = defaultMoves(s);
    if (!pick.length || (pick.length === def.length && pick.every(id => def.includes(id)))) delete s.moveset; else s.moveset = pick;
    emit('sprout:update', { s }); save(); return movesOf(s);
  }
  // How well a move suits this Sprout, from its stats and types: { score, why } (why = one short line for kids, or '')
  function moveFit(s, id) {
    const m = D.MOVES[id]; if (!m) return { score: 0, why: '' };
    const L = k => s.stats[k].lv, fx = m.fx || {}, sum = L('power') + L('stamina') + L('run') + L('fly') + 4;
    const share = k => (L(k) + 1) / sum, top = ['power', 'stamina', 'run', 'fly'].sort((a, b) => L(b) - L(a))[0];
    const stab = m.el !== 'normal' && elementsOf(s).includes(m.el), nm = s.name;
    if (m.pow > 0) {
      let v = m.pow * (fx.hits || 1) * m.acc * (stab ? D.BATTLE.stab : 1) * (1 + (fx.crit || 0) * 0.6) * (0.85 + share('power') * 0.9);
      v *= 1 + (fx.drain || 0) * 0.5 * (0.6 + share('stamina')) - (fx.recoil || 0) * 0.6 + (fx.first ? 0.06 + share('run') * 0.3 : 0);
      if (fx.status) v += fx.status.chance * 25; if (fx.debuff) v += 6; if (fx.buff) v += 6;
      const why = stab ? `Same type as ${nm}: extra strong` : fx.hits > 1 ? `Hits ${fx.hits} times` : fx.drain ? `Heals ${nm} while it hits` : fx.first ? 'Always goes first' : top === 'power' && m.pow >= 60 ? `Great with ${nm}'s strong Power` : '';
      return { score: v, why };
    }
    let v = 0; const bufs = [].concat(fx.buff || []), debs = [].concat(fx.debuff || []);
    if (fx.heal) v += fx.heal * 110 * (0.6 + share('stamina') * 1.4) * (fx.once ? 0.8 : 1);
    for (const b of bufs) v += b.n * ({ atk: 22 * (0.6 + share('power') * 1.4), def: 18 * (0.6 + share('stamina') * 1.4), spd: 12 * (0.6 + share('run') * 1.4), eva: 16 * (0.6 + share('fly') * 1.4), acc: 8 }[b.stat] || 10);
    for (const b of debs) v += b.n * ({ atk: 18, def: 18, spd: 10, acc: 14, eva: 12 }[b.stat] || 10);
    if (fx.status) v += fx.status.chance * ({ stun: 40, sleep: 45, poison: 32, burn: 36 }[fx.status.type] || 30) * m.acc;
    if (fx.cleanse) v += 8;
    const b0 = bufs[0] && bufs[0].stat;
    const why = fx.heal && top === 'stamina' ? `Great for tough ${nm}: heals` : fx.heal ? `Heals ${nm}` : b0 === 'atk' ? (top === 'power' ? `Makes strong ${nm} even stronger` : 'Raises Attack')
      : b0 === 'def' ? (top === 'stamina' ? `Makes tough ${nm} even tougher` : 'Raises Defense') : b0 === 'eva' ? (top === 'fly' ? `Floaty ${nm} dodges even more` : 'Helps it dodge')
        : b0 === 'spd' ? (top === 'run' ? `Speedy ${nm} gets even faster` : 'Makes it faster') : fx.status ? `May make them ${{ stun: 'dizzy', sleep: 'sleep', poison: 'poisoned', burn: 'burned' }[fx.status.type] || 'weaker'}` : debs.length ? 'Makes them weaker' : '';
    return { score: v, why };
  }
  // the moves that suit it best: its strongest attacks (different types where it can, so something hits hard), plus its best helper move
  function bestMoves(s) {
    const all = learnedMoves(s).map(id => ({ id, m: D.MOVES[id], f: moveFit(s, id).score }));
    const atk = all.filter(x => x.m.pow > 0).sort((a, b) => b.f - a.f), sup = all.filter(x => x.m.pow <= 0).sort((a, b) => b.f - a.f);
    const pick = [], els = new Set();
    for (const x of atk) { if (pick.length >= 3) break; if (pick.length && els.has(x.m.el) && atk.some(y => !pick.includes(y.id) && !els.has(y.m.el) && y.f > x.f * 0.8)) continue; pick.push(x.id); els.add(x.m.el); }
    for (const x of atk) if (pick.length < 2 && !pick.includes(x.id)) pick.push(x.id);
    if (sup.length && pick.length < MAX_MOVES) pick.push(sup[0].id);
    for (const x of atk.concat(sup)) if (pick.length < Math.min(MAX_MOVES, all.length) && !pick.includes(x.id)) pick.push(x.id);
    return pick;
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
  const PART_RACE = { run: ['ears', 'leafears'], swim: ['fins', 'tentacles'], climb: ['horns', 'claws', 'spikes', 'vines', 'thorns'], fly: ['wings', 'batwings', 'fairywings', 'flamewings', 'dragonwings', 'petals'] };
  function raceRating(s, seg) {
    const stat = D.RACE_STAT[seg] || seg;
    let r = 1.5 + s.stats[stat].lv * 0.35;
    for (const p of PART_RACE[seg] || []) r += (s.parts[p] || 0) * 0.8;
    return r;
  }
  function staminaRating(s) { return 1.5 + s.stats.stamina.lv * 0.35 + ((s.parts.shell || 0) + (s.parts.mushcap || 0)) * 0.8; }

  // Pixel look for PX.sprig()
  function lookOf(s) {
    const PX = window.PX;
    const L = PX.cloneLook(PX.DEFAULT_LOOK);
    Object.assign(L, s.look || {});
    L.parts = Object.assign({ wings: 0, ears: 0, fins: 0, horns: 0, tail: 0, shell: 0 }, s.parts || {});
    const nk = natureKind(s);
    L.leaf = nk === 'sun' ? 'sun' : nk === 'moon' ? 'plum' : 'leaf';
    // a Starfish friend gives star spots, unless the player chose "Plain" with a sticker
    if ((s.parts || {}).spots && L.pattern === 'plain' && !L.noSpots) { L.pattern = 'star'; L.patternColor = '#f7b6c8'; }
    delete L.noSpots;
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
    // animals stay worth catching as a Sprout grows: their XP scales with the stat's level (x1 at Lv 0, x2 at Lv 20, x3.5 at Lv 50)
    const gives = {};
    for (const [st, v] of Object.entries(c.gives)) gives[st] = v > 0 && s.stats[st] ? Math.round(v * (1 + s.stats[st].lv / 20)) : v;
    const res = gain(s, gives);
    const unlocked = afterTier > beforeTier ? c.moves.slice(beforeTier, afterTier) : [];
    return { id, name: c.name, gives, ups: res.ups, grew: grew.filter(p => !lost.includes(p)), lost, unlocked, evolved: res.evolved };
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
    // pick the exact paint colour or sticker you want (the gumball machine only gives random ones)
    const CP = D.CLOSET_PRICES || {};
    if (kind === 'paint') { if (!D.COLORS[id] || !spend(CP.paint || 60)) return false; bump(items().paints, id); emit('items'); save(); return true; }
    if (kind === 'pattern') { if (!D.PATTERNS[id] || id === 'plain' || !spend(CP.pattern || 80)) return false; bump(items().patterns, id); emit('items'); save(); return true; }
    return false;
  }
  function useFruit(id) { if (!PS.S.fruits[id]) return false; PS.S.fruits[id]--; if (!PS.S.fruits[id]) delete PS.S.fruits[id]; emit('pouch'); save(); return true; }
  function addFruit(id, n) { PS.S.fruits[id] = (PS.S.fruits[id] || 0) + (n || 1); emit('pouch'); save(); }
  // throw fruit away from the tray; returns how many went
  function discardFruit(id, n) { const have = PS.S.fruits[id] || 0, k = Math.max(0, Math.min(have, Math.floor(n || 1))); if (!k) return 0; PS.S.fruits[id] = have - k; if (!PS.S.fruits[id]) delete PS.S.fruits[id]; emit('pouch'); save(); return k; }

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
  const inArea = a => (a === 'candy' ? '' : 'the ') + ((D.AREAS[a] || {}).name || 'Garden');
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
      if (canCatch()) { PS.S.pouch.push(id); PS.S.seen['animal:' + id] = true; emit('pouch'); out = { type, id, title: `A ${D.ANIMALS[id].name}!`, text: `It hopped into your pouch. It lives in ${inArea(D.ANIMALS[id].area)}.` }; }
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
      case 'egg': { const k = pick(D.AREA_ORDER); addEgg(k, 'Gumball machine'); out = { type, id: k, title: D.EGGS[k].name, text: `It's waiting in ${inArea(k)}. Tap it to hatch.` }; break; }
      case 'spookyegg': { const k = pick(D.SPOOKY_EGGS); const e = addEgg(k, 'Gumball machine'); out = { type: 'egg', id: k, title: D.EGGS[k].name + '!', text: `A spooky surprise! It's waiting in ${inArea(e.area)}.` }; break; }
      case 'goldenegg': case 'rainbowegg': { const k = type === 'goldenegg' ? 'golden' : 'rainbow'; const e = addEgg(k, 'Gumball machine'); out = { type: 'egg', id: k, title: D.EGGS[k].name + '!', text: `A special egg! It's waiting in ${inArea(e.area)}.` }; break; }
      case 'fancyegg': {
        const pool = (D.FANCY_EGGS || []).filter(k => D.EGGS[k]);
        if (!pool.length) { out = coins(irand(G.coins[0], G.coins[1])); break; }
        const k = pick(pool), e = addEgg(k, 'Gumball machine'); out = { type: 'egg', id: k, title: D.EGGS[k].name + '!', text: `A fancy egg! It's waiting in ${inArea(e.area)}.` }; break;
      }
      case 'rare': { const id = pick(Object.keys(D.RARES)); PS.S.pouch.push(id); PS.S.seen['rare:' + id] = true; emit('pouch'); out = { type, id, title: `A ${D.RARES[id].name}!`, text: 'A rare creature! It is waiting in your pouch in the Garden.' }; break; }
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
  // use one pattern sticker ('plain' is free: it removes the pattern). Re-applying the pattern it already has is free too.
  function usePattern(s, pat) {
    const it = items(); if (!s || !D.PATTERNS[pat]) return false;
    if (pat !== 'plain' && s.look.pattern === pat && !s.look.noSpots) return true;
    if (pat !== 'plain') { if (!it.patterns[pat]) return false; if (--it.patterns[pat] <= 0) delete it.patterns[pat]; }
    s.look.pattern = pat;
    if (pat === 'plain') s.look.noSpots = true; else delete s.look.noSpots;
    if (pat !== 'plain') s.look.patternColor = patternColorFor(s, pat);
    emit('sprout:update', { s }); emit('items'); save(); return true;
  }
  // a sticker colour you can actually see: not too close to the body colour, nor to the belly for belly patterns
  const rgbOf = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16) || 0);
  const colDist = (a, b) => { const A = rgbOf(a), B = rgbOf(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  function patternColorFor(s, pat) {
    const PX = window.PX, body = !s.look.skin && PX && PX.RAMPS[s.look.body] ? PX.RAMPS[s.look.body][1] : null, belly = (PX && PX.BELLY) || '#fbf3dc';
    const onBelly = pat === 'star' || pat === 'heart';
    const all = D.PATTERN_COLORS.filter(c => c !== s.look.patternColor);
    const good = all.filter(c => (!body || colDist(c, body) > 70) && (!onBelly || colDist(c, belly) > 60));
    return pick(good.length ? good : all);
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
  function moveSprout(s, area) { if (!D.AREAS[area]) return; s.area = area; delete s.home; emit('sprout:update', { s }); save(); }
  // each area has a little house where Sprouts can rest (s.home = true; no field = playing outside)
  const HOME_NAMES = { meadow: 'Mushroom House', beach: 'Beach Hut', moonlit: 'Crystal Cave', candy: 'Gingerbread House' };
  const homeName = area => HOME_NAMES[area] || 'House';
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
      const rt = seg => +Math.min(T.rating[1], base * (0.8 + sr() * 0.4)).toFixed(2); // never stronger than the tier's stated range
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
  // (battle rewards are paid in battle.js by one function, grant(), using D.BATTLE's prize settings)

  // ---------------- boot ----------------
  const PS = window.PS = {
    D, S: load() || fresh(), save, saveNow, reset, lockSaves, on, emit, clock, players: playersApi,
    get loadNote() { return loadNote; }, clearLoadNote() { loadNote = null; },
    backup: { exportBackup, decodeBackup, importBackup, autoBackups, restoreAuto, rescued },
    util: { rand, irand, pick, clamp, newId },
    state: {
      makeSprout, addXp, gain, happyBonus, totalLevels, natureKind, domStat, formInfo, movesOf, knownMoves, elementsOf, battleStats,
      learnedMoves, defaultMoves, setMoves, moveFit, bestMoves, MAX_MOVES,
      raceRating, staminaRating, lookOf, absorb, feed, pet, roughHandle, creature, tierOf, topAnimal,
      canCatch, addToPouch, takeFromPouch, addCoins, spend, buy, useFruit, addFruit, discardFruit, rollDrop,
      addEgg, hatchEgg, moveSprout, homeName, renameSprout, get, active, setActive,
      raceProgress, raceUnlocked, raceRivals, finishRace,
      leagueProgress, leagueUnlocked, makeNPC, checkEvolve, evolveTo, flowerFor, PART_RACE, esc,
      sellPrice, canSell, sellSprout, gumball, items, usePaint, usePattern, ownsHat, wear,
    },
  };
  lastNight = clock.isNight();
  pruneSnaps();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);
})();
