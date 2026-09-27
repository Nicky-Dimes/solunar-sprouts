// battle.js — Battle: league hub, turn-based 1v1 fights, results, plus Legend Challenges (boss fights), the Battle Tower,
// pass-and-play Friend Battles and battle snacks.
// Owns PS.scenes.battle. CSS is injected from here (classes prefixed .b-).
// The rules engine (makeFighter / resolveRound / aiChoose) is pure and has no DOM, so it can run headless
// for balance sims: window.__battle.engine.sim(sprout, leagueId, index, n), .simBoss(sprout, bossId, n), .simTower(sprout, n),
// .estimate(sprout, spec, n) (the same kid-level estimate the pre-battle screens show).
// Every battle prize is decided by prize() and paid by grant(), once, the moment a battle is decided.
// New save data lives only in PS.S.progress.battleExtra (created lazily by extra(); old saves simply don't have it yet).
(function () {
  'use strict';
  const PS = window.PS, D = PS.D, ST = PS.state;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

  // ======================================================================
  // Content tables (battle-only)
  // ======================================================================
  // Legend Challenges. Stats are those of a balanced Sprout of total level `lv`, scaled by hpK / atkK / defK / spdK.
  // Every boss follows the same readable rhythm: `calm` normal turns, then it CHARGES (big warning), then it unleashes
  // its giant attack. Using a Guard / Heal / Boost move (or a snack) on the giant-attack turn blocks most of it.
  const BOSSES = [
    { id: 'yeti', name: 'Yeti', title: 'the Snow Giant', area: 'snow', unlock: { league: 'thorn' }, lv: 27, hpK: 1.65, atkK: 1.28, defK: 1, spdK: 0.75, smart: 0.7,
      els: ['water', 'stone'], moves: ['frostbite', 'snowball', 'curl'], calm: 2, sup: { move: 'avalanche', mult: 1.35, name: 'Giant Snowball' },
      charge: 'The Yeti is rolling a GIANT snowball!', warn: 'Giant snowball coming!', coins: 140, xp: 20, rec: 35,
      blurb: 'A big, fluffy giant from the snowy peaks. It throws snowballs as big as houses.' },
    { id: 'griffin', name: 'Griffin', title: 'Queen of the Sky', area: 'peak', unlock: { league: 'tide' }, lv: 42, hpK: 1.65, atkK: 1.28, defK: 1, spdK: 1.1, smart: 0.75,
      els: ['sky'], moves: ['talon', 'skyroar', 'silverwind'], calm: 2, sup: { move: 'stormdive', mult: 1.35, name: 'Thunder Dive' },
      charge: 'The Griffin flies high above the clouds!', warn: 'Thunder Dive coming!', coins: 260, xp: 30, rec: 50,
      blurb: 'Half eagle, all courage. She dives out of the clouds like lightning.' },
    { id: 'dinosaur', name: 'Dinosaur', title: 'the Ancient King', area: 'jungle', unlock: { league: 'moon' }, lv: 58, hpK: 1.5, atkK: 1.35, defK: 1.05, spdK: 0.8, smart: 0.8,
      els: ['stone'], moves: ['stomp', 'roar', 'ancientroll'], calm: 2, sup: { move: 'meteortail', mult: 1.3, name: 'Meteor Tail' },
      charge: 'The Dinosaur stomps and stomps! The ground is shaking!', warn: 'Meteor Tail coming!', coins: 450, xp: 42, rec: 62,
      blurb: 'An ancient giant from the time before flowers. Its tail swing shakes the whole jungle.' },
    { id: 'kraken', name: 'Kraken', title: 'Lord of the Deep', area: 'abyss', unlock: { league: 'sugar' }, lv: 76, hpK: 1.6, atkK: 1.3, defK: 1, spdK: 0.95, smart: 0.8,
      els: ['water', 'shadow'], moves: ['whirlpool', 'crush', 'ink'], calm: 2, sup: { move: 'abysswave', mult: 1.3, name: 'Tidal Wave' },
      charge: 'The Kraken pulls the sea back... a HUGE wave is coming!', warn: 'Tidal wave coming!', coins: 700, xp: 55, rec: 84,
      blurb: 'Eight arms, one big appetite. It lives where the storm meets the sea.' },
    { id: 'phoenix', name: 'Phoenix', title: 'the Undying Flame', area: 'sunfire', unlock: { boss: 'kraken' }, lv: 86, hpK: 1.15, atkK: 1.45, defK: 1, spdK: 1.05, smart: 0.85,
      els: ['fire', 'light'], moves: ['flamewing', 'sunbeam', 'warmglow'], calm: 2, sup: { move: 'sunflare', mult: 1.3, name: 'Sun Flare' }, revive: 0.4,
      charge: 'The Phoenix glows brighter and brighter!', warn: 'Sun Flare coming!', coins: 900, xp: 65, rec: 105,
      blurb: 'Reborn from its own flames. Beat it once and it rises again, so save some strength!' },
    { id: 'dragon', name: 'Dragon', title: 'the Last Legend', area: 'volcano', unlock: { league: 'legend' }, lv: 108, hpK: 1.3, atkK: 1.5, defK: 1.05, spdK: 1, smart: 0.9,
      els: ['fire', 'sky'], moves: ['ember', 'dragonscale', 'flamewing'], calm: 1, sup: { move: 'dragonbreath', mult: 1.25, name: 'Dragon Fire' },
      charge: 'The Dragon takes a DEEP breath!', warn: 'Dragon Fire coming!', coins: 1200, xp: 80, rec: 120, egg: 'dragon',
      blurb: 'The rarest of them all. It breathes fire every third turn, so be ready!' },
  ];
  const BOSS = Object.fromEntries(BOSSES.map(b => [b.id, b]));
  // Battle Tower: floor f has an opponent of total level lv(f). HP carries over, +heal between floors.
  const TOWER = {
    unlock: 'pebble', heal: 0.4,
    lv: f => Math.round(2 + f * 4.2),
    mult: f => Math.min(1, 0.8 + f * 0.04) * (f > 55 ? 1 + (f - 55) * 0.03 : 1),
    smart: f => Math.min(0.95, 0.35 + f * 0.03),
    coins: f => Math.max(8, Math.round(0.085 * Math.pow(TOWER.lv(f), 1.9))),
    xp: f => (0.75 * TOWER.lv(f) + 5) * 0.5,
  };
  // Wild Battles: fight the real animals of each island. lv: [little, big, alpha] level ranges, spread across the area's animals
  // in data order. An animal's stats lean toward what it `gives` (a Sparrow is a dodgy flier, a Ram hits hard).
  const WILD = {
    areas: [
      { id: 'meadow', unlock: null, lv: [[2, 10], [14, 24], [28, 40]] },
      { id: 'beach', unlock: 'thorn', lv: [[18, 26], [32, 44], [50, 64]] },
      { id: 'moonlit', unlock: 'tide', lv: [[30, 40], [48, 60], [70, 86]] },
      { id: 'candy', unlock: 'moon', lv: [[44, 54], [64, 78], [95, 112]] },
    ],
    steps: [{ name: 'Little', mult: 0.7, smart: 0.3, scale: 1, moves: 2 }, { name: 'Big', mult: 0.95, smart: 0.55, scale: 1 }, { name: 'Alpha', mult: 1.1, smart: 0.8, scale: 1 }], // garden-sized animals (bosses stay giant)
    coins: lv => Math.max(6, Math.round(0.09 * Math.pow(lv, 1.9))),
    xp: lv => (0.75 * lv + 5) * 0.6,
  };
  const STAT_FRUITS = ['swiftberry', 'wingseed', 'seakelp', 'powernut', 'heartyroot'];
  const FRIEND = { coinsWin: 12, coinsLose: 6, coinsDraw: 9, xp: 2.8, perDay: 5 }; // xp: base XP (× the battle XP split = 10)
  const SNACK = '__snack';
  const SNACK_HEAL = { goldfruit: 0.5 }; // share of max HP; everything else heals TUNE.snackHeal
  const NPC_NAMES = ['Biscuit', 'Nova', 'Ziggy', 'Mochi', 'Pickle', 'Tango', 'Comet', 'Sprocket', 'Dot', 'Echo', 'Fern', 'Gizmo', 'Jinx', 'Kiwi', 'Lumen', 'Marble',
    'Noodle', 'Orbit', 'Puddle', 'Quill', 'Rascal', 'Tofu', 'Umi', 'Vesper', 'Waffle', 'Yuzu', 'Zephyr', 'Bean', 'Cricket', 'Dizzy', 'Ember', 'Flick'];

  // ======================================================================
  // Rules engine (pure)
  // ======================================================================
  // Tunables that are not in data.js (yet). dmg = pow × (atk/def)^ratioExp × dmgK × (lvBase + level/dmgLv) × STAB × type × crit × rand
  const TUNE = {
    dmgK: 0.104, lvBase: 1.5, dmgLv: 45, ratioExp: 0.65, rand: [0.9, 1.1],
    accStage: [0.6, 0.7, 0.85, 1, 1.15, 1.3, 1.45], // hit-chance multiplier for (acc stage − eva stage), −3..+3
    npcMult: [0.75, 0.92, 1, 1, 1, 1, 1, 1, 1, 1],   // opponent HP/Attack scale per league (keeps Pebble gentle for a fresh Sprout)
    poisonFrac: 1 / 10, burnFrac: 1 / 12, dotTurns: 4, sleepTurns: [1, 3],
    typeCap: [0.5, 2],
    healFade: 0.75, healFloor: 0.25, // each heal a fighter uses is weaker than the last (stops heal-stalling)
    aiSmart: [0.2, 0.45, 0.6, 0.72, 0.85, 0.95, 0.95, 0.96, 0.97, 0.98], // per league index (Pebble → Champion)
    tireAt: 14, tireFrac: 1 / 10,                    // from this round on, both lose HP each round (no endless stalls)
    braceMult: 0.3, bossDot: 0.3, bossTireAt: 22,    // bosses: blocked giant attacks deal 30%; poison/burn/tiring hurt bosses 30% as much
    snackHeal: 0.3,
  };
  const SURE = new Set(['slowslam']); // "Never misses" (ignores Dodge)
  // One set of kid words everywhere in battle: Dodge (not Evasion) and Aim (not Accuracy)
  const STAT_NAME = { atk: 'Attack', def: 'Defense', spd: 'Speed', eva: 'Dodge', acc: 'Aim' };
  const STAT_SHORT = STAT_NAME; // plate tags use the same words
  const kidWords = t => String(t).replace(/\bEvasion\b/g, 'Dodge').replace(/\bevasion\b/g, 'dodge').replace(/\baccuracy\b/gi, 'Aim');
  const STATUS_SHORT = { poison: 'Poison', burn: 'Burn', sleep: 'Asleep', stun: 'Stunned' };
  const arr = v => (!v ? [] : Array.isArray(v) ? v : [v]);
  const sm = n => D.BATTLE.stageMult[clamp(Math.round(n), -3, 3) + 3];

  // healed / dealt / dealtStrong (super-effective damage) / dealtWeak / bigHits (unblocked giant attacks taken) feed the
  // "why did we lose?" tips on the results screen.
  function baseFighter(side) {
    return { side, st: { atk: 0, def: 0, spd: 0, eva: 0, acc: 0 }, status: null, statusT: 0, stun: false, used: {}, heals: 0,
      boss: null, charging: false, bc: 0, braced: false, snack: null, revived: false, healed: 0, dealt: 0, dealtStrong: 0, dealtWeak: 0, strongEl: null, bigHits: 0 };
  }
  // mult: the league's strength scale (HP, Attack, Defense). k: an optional per-opponent tweak from data.js ({hp, atk, def}).
  function makeFighter(s, side, mult, k, noLook) {
    const bs = Object.assign({}, ST.battleStats(s));
    if (mult && mult !== 1) { bs.hp = Math.round(bs.hp * mult); bs.atk = Math.round(bs.atk * mult); bs.def = Math.round(bs.def * mult); }
    if (k) { if (k.hp) bs.hp = Math.round(bs.hp * k.hp); if (k.atk) bs.atk = Math.round(bs.atk * k.atk); if (k.def) bs.def = Math.round(bs.def * k.def); }
    let look = null; if (!noLook) try { look = ST.lookOf(s); } catch (e) { look = null; }
    return Object.assign(baseFighter(side), {
      s, name: s.name, npc: !!s.npc, look, moves: ST.movesOf(s).filter(id => D.MOVES[id]), els: bs.els.slice(), lv: bs.level,
      max: bs.hp, hp: bs.hp, atk: bs.atk, def: bs.def, spd: bs.spd, eva: bs.eva,
    });
  }
  // A boss is a fighter with no Sprout behind it: stats of a balanced Sprout of level B.lv, scaled.
  function makeBoss(id) {
    const B = BOSS[id], L = B.lv;
    const f = Object.assign(baseFighter('o'), {
      s: null, name: B.name, npc: true, look: null, critter: id, boss: B, moves: B.moves.filter(m => D.MOVES[m]), els: B.els.slice(), lv: L,
      atk: Math.round((12 + 0.44 * L) * B.atkK), def: Math.round((10 + 0.4 * L) * B.defK), spd: Math.round((10 + 0.4 * L) * B.spdK), eva: 0,
    });
    f.max = f.hp = Math.round((40 + 2 * L) * B.hpK);
    return f;
  }
  const wildList = area => Object.keys(D.ANIMALS).filter(k => D.ANIMALS[k].area === area);
  // level order inside an area: gentler creatures (smaller total gives) get the lower levels, so new additions don't all land at the top
  const giveSum = id => Object.values(D.ANIMALS[id].gives || {}).reduce((t, v) => t + Math.abs(v), 0);
  const wildRank = area => wildList(area).map((id, i) => [id, giveSum(id) + i * 0.001]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
  function wildLv(id, step) {
    const A = D.ANIMALS[id], W = WILD.areas.find(a => a.id === A.area) || WILD.areas[0], list = wildRank(A.area), i = Math.max(0, list.indexOf(id)), [a, b] = W.lv[step];
    return Math.round(a + (b - a) * (list.length > 1 ? i / (list.length - 1) : 0));
  }
  // A wild animal fighter: its own 3 moves and element, stats from a Sprout-like spread of level L that leans toward its gives.
  function makeWild(id, step) {
    const A = D.ANIMALS[id], S = WILD.steps[step], L = wildLv(id, step), B = D.BATTLE;
    const w = { swim: 1, fly: 1, run: 1, power: 1, stamina: 1.2 };
    for (const [st, v] of Object.entries(A.gives || {})) if (v > 0 && w[st]) w[st] += v / 5;
    const wt = Object.values(w).reduce((a, b) => a + b, 0), lv = {};
    for (const st of D.STATS) lv[st] = Math.min(D.GROWTH.maxLevel, Math.round(L * w[st] / wt));
    const m = S.mult;
    // a Little one only knows its first moves, but always at least one attack (else it could never win on its own)
    const all = A.moves.filter(x => D.MOVES[x]), moves = all.slice(0, S.moves || 3);
    if (!moves.some(x => D.MOVES[x].pow > 0)) moves[moves.length - 1] = all.find(x => D.MOVES[x].pow > 0) || 'tackle';
    const f = Object.assign(baseFighter('o'), {
      s: null, name: `${S.name} ${A.name}`, npc: true, look: null, critter: id, wild: { id, step }, moves, els: [A.el || 'normal'], lv: L,
      atk: Math.round((B.atkBase + lv.power * B.atkPerPower) * m), def: Math.round((B.defBase + lv.stamina * B.defPerStamina + lv.swim * B.defPerSwim) * m),
      spd: Math.round(B.spdBase + lv.run * B.spdPerRun), eva: Math.min(B.evaMax, lv.fly * B.evaPerFly),
    });
    f.max = f.hp = Math.round((B.hpBase + lv.stamina * B.hpPerStamina + L * B.hpPerLevel) * m);
    return f;
  }
  const effAtk = f => f.atk * sm(f.st.atk - (f.status === 'burn' ? 1 : 0));
  const effDef = f => f.def * sm(f.st.def);
  const effSpd = f => f.spd * sm(f.st.spd) * (f.status === 'sleep' ? 0.5 : 1);
  // Defender's first element (its form) counts fully; a second element (from its top animal) counts half.
  function typeMult(el, defEls) {
    let m = 1; const E = D.ELEMENTS[el];
    defEls.forEach((d, i) => {
      const k = i === 0 ? 1 : 0.5;
      if (E && E.strong.includes(d)) m *= 1 + (D.BATTLE.strong - 1) * k;
      else if (D.ELEMENTS[d] && D.ELEMENTS[d].strong.includes(el)) m *= 1 - (1 - D.BATTLE.weak) * k;
    });
    return clamp(m, TUNE.typeCap[0], TUNE.typeCap[1]);
  }
  const stabOf = (f, mv) => (mv.el !== 'normal' && f.els.includes(mv.el) ? D.BATTLE.stab : 1);
  const targetsFoe = mv => mv.pow > 0 || !!mv.fx.debuff || !!mv.fx.status;
  // moves that block a boss's giant attack: anything that only helps yourself (guard, heal, boost), and snacks
  const isBrace = id => id === SNACK || (!!D.MOVES[id] && D.MOVES[id].pow === 0 && !targetsFoe(D.MOVES[id]));
  const canAct = f => !f.stun && !(f.status === 'sleep' && f.statusT > 0);
  function hitChance(a, t, id) {
    const mv = D.MOVES[id];
    if (!mv || !targetsFoe(mv)) return 1;
    if (SURE.has(id)) return 1;
    return clamp(mv.acc * (1 - t.eva) * TUNE.accStage[clamp(a.st.acc - t.st.eva, -3, 3) + 3], 0.05, 1);
  }
  function baseDamage(a, t, mv) { // expected damage per hit, no crit / random
    const ratio = Math.pow(effAtk(a) / Math.max(1, effDef(t)), TUNE.ratioExp);
    return mv.pow * ratio * TUNE.dmgK * (TUNE.lvBase + a.lv / TUNE.dmgLv) * stabOf(a, mv) * typeMult(mv.el, t.els);
  }
  function rollDamage(a, t, mv, rng) {
    const crit = rng() < D.BATTLE.critBase + (mv.fx.crit || 0);
    const r = TUNE.rand[0] + rng() * (TUNE.rand[1] - TUNE.rand[0]);
    return { n: Math.max(1, Math.round(baseDamage(a, t, mv) * (crit ? D.BATTLE.critMult : 1) * r)), crit, tm: typeMult(mv.el, t.els) };
  }
  const healFactor = f => Math.max(TUNE.healFloor, Math.pow(TUNE.healFade, f.heals));
  const usable = (f, id) => (id === SNACK ? !!(f.snack && !f.snack.used) : !!D.MOVES[id] && !(D.MOVES[id].fx.once && f.used[id]));
  const priority = id => (id === SNACK ? 2 : D.MOVES[id] && D.MOVES[id].fx.first ? 1 : 0);
  const dotMul = f => (f.boss ? TUNE.bossDot : 1);

  function snap(b) {
    const one = f => ({ hp: f.hp, status: f.status, stun: f.stun, st: Object.assign({}, f.st), charging: f.charging });
    return { p: one(b.p), o: one(b.o), tired: !!b.tired };
  }
  // opts: npcMult, k (per-opponent tweak), smart, rng, boss (boss id: the 'o' side is that boss instead of sO), wild, tireAt,
  // friend (pass-and-play: a double knock-out is a draw), sim (headless: no looks, no event snapshots)
  function newBattle(sP, sO, opts) {
    opts = opts || {};
    const o = opts.boss ? makeBoss(opts.boss) : opts.wild ? makeWild(opts.wild.id, opts.wild.step) : makeFighter(sO, 'o', opts.npcMult, opts.k, opts.sim);
    const b = { p: makeFighter(sP, 'p', 1, null, opts.sim), o, turn: 0, over: false, winner: null, tie: false, tired: false, friend: !!opts.friend, sim: !!opts.sim, rng: opts.rng || Math.random,
      smart: opts.smart == null ? (o.boss ? o.boss.smart : o.wild ? WILD.steps[o.wild.step].smart : 0.6) : opts.smart, tireAt: opts.tireAt || (o.boss ? TUNE.bossTireAt : TUNE.tireAt) };
    b.p.foe = b.o; b.o.foe = b.p;
    return b;
  }
  // A boss that can be reborn (Phoenix) comes back once instead of fainting.
  function revive(f, E) {
    if (f.hp > 0) return true;
    if (!f.boss || !f.boss.revive || f.revived) return false;
    f.revived = true; f.hp = Math.round(f.max * f.boss.revive); f.status = null; f.statusT = 0; f.stun = false; f.charging = false; f.bc = 0;
    f.st = { atk: 0, def: 0, spd: 0, eva: 0, acc: 0 };
    E('revive', f, { text: `${f.name} rose again from its flames!` });
    return true;
  }
  // After anything that can knock a fighter out: a reborn boss rises again, otherwise whoever is at 0 HP faints.
  // Both at 0 at once is a tie. Against the computer the player's Sprout hangs on with 1 HP and wins (kid-friendly);
  // in a Friend Battle it's a draw (winner null).
  function settle(b, E, tired) {
    const P = b.p, O = b.o;
    if (O.hp <= 0) revive(O, E);
    if (P.hp <= 0) revive(P, E);
    const pd = P.hp <= 0, od = O.hp <= 0;
    if (!pd && !od) return false;
    const out = f => E('faint', f, { text: tired ? `${f.name} is too tired to go on!` : `${f.name} fainted!` });
    b.over = true; b.tiredEnd = !!tired;
    if (pd && od) {
      b.tie = true;
      if (b.friend) { out(O); out(P); b.winner = null; E('note', null, { draw: true, text: "Both are down at the same time. It's a draw!" }); }
      else { out(O); P.hp = 1; b.winner = 'p'; E('hang', P, { text: `Both are worn out... but ${P.name} hangs on with 1 HP!` }); }
      return true;
    }
    const f = pd ? P : O; out(f); b.winner = f.foe.side;
    return true;
  }

  // Resolve one round. Returns a list of events (each carries a state snapshot taken right after it happened).
  function resolveRound(b, pMove, oMove) {
    const ev = [], P = b.p, O = b.o, rng = b.rng;
    const E = (type, who, x) => { const e = Object.assign({ type, who: who ? who.side : null }, x || {}); if (!b.sim) e.snap = snap(b); ev.push(e); return e; };
    b.turn++;
    // a boss either acts normally, charges up (telegraphed), or unleashes its giant attack
    let oPlan = null;
    if (O.boss) { if (O.charging) oPlan = 'super'; else if (O.bc >= O.boss.calm) oPlan = 'charge'; }
    P.braced = canAct(P) && isBrace(pMove); O.braced = false;
    let first = [P, pMove], second = [O, oMove];
    const pp = priority(pMove), po = oPlan ? -1 : priority(oMove);
    if (po > pp || (po === pp && (effSpd(O) > effSpd(P) || (effSpd(O) === effSpd(P) && rng() < 0.5)))) { first = [O, oMove]; second = [P, pMove]; }
    for (const [a, id] of [first, second]) {
      const t = a.foe;
      if (a === O && oPlan) bossAct(b, a, t, oPlan, E); else act(b, a, t, id, E);
      if (settle(b, E)) return ev;
    }
    if (O.boss && !oPlan) O.bc++;
    // end of round: poison / burn hurt both fighters first, then we see who is still standing (so the order never picks the winner)
    for (const f of [first[0], second[0]]) {
      if (f.status !== 'poison' && f.status !== 'burn') continue;
      const n = Math.max(1, Math.round(f.max * (f.status === 'poison' ? TUNE.poisonFrac : TUNE.burnFrac) * dotMul(f)));
      f.hp = Math.max(0, f.hp - n);
      E('dot', f, { n, kind: f.status, text: f.status === 'poison' ? `${f.name} is hurt by poison.` : `${f.name} is hurt by its burn.` });
      if (f.hp > 0 && --f.statusT <= 0 && f.status) { const k = f.status; f.status = null; E('cure', f, { text: k === 'poison' ? `${f.name}'s poison wore off.` : `${f.name}'s burn healed.` }); }
    }
    if (settle(b, E)) return ev;
    // long battles: from round tireAt on, both lose a little HP every round (no endless stalls)
    if (b.turn >= b.tireAt) {
      const firstTire = !b.tired;
      if (firstTire) { b.tired = true; E('note', null, { tired: true, text: 'Both are getting tired! Now they lose a little HP every turn.' }); }
      let i = 0;
      for (const f of [first[0], second[0]]) {
        const n = Math.max(1, Math.round(f.max * TUNE.tireFrac * dotMul(f))); f.hp = Math.max(0, f.hp - n);
        E('dot', f, { n, kind: 'tired', text: i++ || firstTire ? '' : 'Both are tired and lose some HP.' });
      }
      if (settle(b, E, true)) return ev;
    }
    return ev;
  }

  function act(b, a, t, id, E) {
    const rng = b.rng;
    if (a.stun) { a.stun = false; E('skip', a, { kind: 'stun', text: `${a.name} is stunned and can't move!` }); return; }
    if (a.status === 'sleep') {
      if (a.statusT > 0) { a.statusT--; E('skip', a, { kind: 'sleep', text: `${a.name} is fast asleep.` }); return; }
      a.status = null; E('wake', a, { text: `${a.name} woke up!` });
    }
    if (id === SNACK) { // battle snack: heals, never misses, goes first
      const sn = a.snack; if (!sn || sn.used) { E('note', a, { text: 'No snack left!' }); return; }
      sn.used = true;
      const h = Math.min(a.max - a.hp, Math.round(a.max * sn.heal));
      a.hp += h; a.healed += h;
      E('snack', a, { n: h, fruit: sn.fruit, text: `${a.name} ate the ${sn.name}. Yum!` });
      if (sn.cleanse && (a.status || a.stun)) { a.status = null; a.statusT = 0; a.stun = false; E('cleanse', a, { text: `${a.name} feels refreshed.` }); }
      return;
    }
    const mv = D.MOVES[id], fx = mv.fx;
    a.used[id] = (a.used[id] || 0) + 1;
    E('use', a, { move: id, text: `${a.name} used ${mv.name}!` });
    if (targetsFoe(mv) && rng() > hitChance(a, t, id)) {
      E('miss', a, { move: id, target: t.side, text: t.eva > 0.08 || t.st.eva > 0 ? `${t.name} dodged it!` : 'It missed!' });
      return;
    }
    let dealt = 0;
    if (mv.pow > 0) {
      const n = fx.hits || 1; let hits = 0, anyCrit = false, tm = 1;
      for (let i = 0; i < n && t.hp > 0; i++) {
        const r = rollDamage(a, t, mv, rng);
        t.hp = Math.max(0, t.hp - r.n); dealt += r.n; hits++; tm = r.tm; anyCrit = anyCrit || r.crit;
        a.dealt += r.n; if (r.tm > 1) { a.dealtStrong += r.n; a.strongEl = mv.el; } else if (r.tm < 1) a.dealtWeak += r.n;
        E('hit', t, { by: a.side, move: id, el: mv.el, n: r.n, crit: r.crit, tm: r.tm, i, of: n, text: r.crit && n === 1 ? 'A critical hit!' : '' });
      }
      const bits = [];
      if (n > 1) bits.push(`Hit ${hits} time${hits > 1 ? 's' : ''}!`);
      if (n > 1 && anyCrit) bits.push('Critical!');
      if (tm > 1) bits.push("It's super effective!"); else if (tm < 1) bits.push("It's not very effective...");
      if (bits.length) E('note', t, { text: bits.join(' ') });
    }
    if (fx.drain && dealt) { const h = Math.min(a.max - a.hp, Math.max(1, Math.round(dealt * fx.drain))); if (h > 0) { a.hp += h; a.healed += h; E('heal', a, { n: h, text: `${a.name} drained some energy.` }); } }
    if (fx.recoil && dealt) { const r = Math.max(1, Math.round(dealt * fx.recoil)); a.hp = Math.max(0, a.hp - r); E('recoil', a, { n: r, text: `${a.name} is hurt by the recoil.` }); }
    if (fx.cleanse && (a.status || a.stun)) { a.status = null; a.statusT = 0; a.stun = false; E('cleanse', a, { text: `${a.name} feels refreshed.` }); }
    if (fx.heal) {
      const k = healFactor(a), h = Math.min(a.max - a.hp, Math.round(a.max * fx.heal * k));
      if (a.hp < a.max) a.heals++;
      if (h > 0) { a.hp += h; a.healed += h; E('heal', a, { n: h, text: k < 0.6 ? `${a.name} recovered a little HP. Healing is wearing thin.` : `${a.name} recovered HP.` }); }
      else if (!fx.buff) E('note', a, { text: `${a.name}'s HP is already full.` });
    }
    for (const bf of arr(fx.buff)) stage(a, bf.stat, bf.n, E);
    if (t.hp > 0) for (const db of arr(fx.debuff)) stage(t, db.stat, -db.n, E);
    if (fx.status && t.hp > 0) {
      const S = fx.status, has = S.type === 'stun' ? t.stun : !!t.status;
      if (!has && rng() < S.chance) {
        if (S.type === 'stun') { t.stun = true; E('status', t, { st: 'stun', text: `${t.name} is stunned!` }); }
        else {
          t.status = S.type;
          t.statusT = S.type === 'sleep' ? (t.boss ? 1 : TUNE.sleepTurns[0] + Math.floor(rng() * (TUNE.sleepTurns[1] - TUNE.sleepTurns[0] + 1))) : TUNE.dotTurns;
          E('status', t, { st: S.type, text: S.type === 'sleep' ? `${t.name} fell asleep!` : S.type === 'poison' ? `${t.name} was poisoned! Poison hurts each turn.`
            : `${t.name} was burned! Burns hurt each turn and make attacks weaker.` }); // (burn: Attack counts one step lower, see effAtk)
        }
      } else if (mv.pow === 0 && !fx.debuff) E('note', t, { text: has ? 'But it failed!' : 'It had no effect.' });
    }
  }
  // boss special turns: 'charge' (the warning) and 'super' (the giant attack). Stunning or sleeping boss loses its charge.
  function bossAct(b, a, t, plan, E) {
    const B = a.boss, rng = b.rng;
    if (!canAct(a)) {
      const why = a.stun ? 'stunned' : 'asleep';
      if (a.stun) a.stun = false; else a.statusT--;
      if (plan === 'super') { a.charging = false; a.bc = 0; E('skip', a, { kind: a.status === 'sleep' ? 'sleep' : 'stun', text: `${a.name} is ${why}! Its giant attack fizzled out!` }); }
      else E('skip', a, { kind: a.status === 'sleep' ? 'sleep' : 'stun', text: why === 'stunned' ? `${a.name} is stunned and can't move!` : `${a.name} is fast asleep.` });
      return;
    }
    if (a.status === 'sleep') { a.status = null; E('wake', a, { text: `${a.name} woke up!` }); }
    if (plan === 'charge') { a.charging = true; E('charge', a, { text: B.charge, warn: B.warn }); return; }
    a.charging = false; a.bc = 0;
    const mv = D.MOVES[B.sup.move];
    E('use', a, { move: B.sup.move, giant: true, text: `${a.name} used ${B.sup.name.toUpperCase()}!` });
    const tm = typeMult(mv.el, t.els);
    const n = Math.max(1, Math.round(baseDamage(a, t, mv) * B.sup.mult * (0.95 + rng() * 0.1) * (t.braced ? TUNE.braceMult : 1)));
    t.hp = Math.max(0, t.hp - n); a.dealt += n; if (tm > 1) { a.dealtStrong += n; a.strongEl = mv.el; } if (!t.braced) t.bigHits++;
    E('hit', t, { by: a.side, move: B.sup.move, el: mv.el, n, crit: false, tm, i: 0, of: 1, giant: true, braced: t.braced, text: '' });
    E('note', t, { text: t.braced ? `${t.name} was ready and blocked most of it!` : `Ouch! ${t.name} took the whole blast!` });
  }
  function stage(f, stat, n, E) {
    const before = f.st[stat], after = clamp(before + n, -3, 3);
    const nm = `${f.name}'s ${STAT_NAME[stat]}`;
    if (after === before) { E('stage', f, { stat, n: 0, text: `${nm} won't go any ${n > 0 ? 'higher' : 'lower'}!` }); return; }
    f.st[stat] = after; const d = after - before, big = Math.abs(d) >= 2 ? (Math.abs(d) >= 3 ? 'hugely ' : 'sharply ') : '';
    E('stage', f, { stat, n: d, text: `${nm} ${big}${d > 0 ? 'rose' : 'fell'}!` });
  }

  // ---------------- AI ----------------
  function scoreMove(me, foe, id, turn) {
    const mv = D.MOVES[id], fx = mv.fx, hpK = me.hp / me.max, miss = 1 - hpK;
    let s = 0;
    if (mv.pow > 0) {
      const est = baseDamage(me, foe, mv) * (fx.hits || 1) * hitChance(me, foe, id);
      s += Math.min(1.1, est / Math.max(1, foe.hp)) * 100;
      if (est >= foe.hp) s += 60;
      s += Math.min(40, est / foe.max * 60);
      if (fx.first && est >= foe.hp * 0.9) s += 40;
      if (fx.drain) s += miss * est / me.max * 60;
      if (fx.recoil) s -= est * fx.recoil / Math.max(1, me.hp) * 60;
    }
    if (fx.heal) {
      const h = Math.min(miss, fx.heal * healFactor(me));
      s += miss >= 0.45 ? h * 190 : h * 40;
      if (fx.once && miss < 0.5) s -= 60;
    }
    if (fx.cleanse && (me.status || me.stun)) s += 30;
    for (const bf of arr(fx.buff)) {
      const room = 3 - me.st[bf.stat]; if (room <= 0) continue;
      const w = { atk: 22, def: 16, spd: 10, eva: 16, acc: me.st.acc < 0 ? 16 : 5 }[bf.stat] || 10;
      s += Math.min(room, bf.n) * w * (turn <= 2 ? 1.3 : 0.7) * (hpK > 0.5 ? 1 : 0.35) * (me.st[bf.stat] >= 2 ? 0.3 : 1);
    }
    for (const db of arr(fx.debuff)) {
      const room = 3 + foe.st[db.stat]; if (room <= 0) continue;
      const w = { atk: 18, def: 18, spd: 9, eva: 8, acc: 16 }[db.stat] || 10;
      s += Math.min(room, db.n) * w * (turn <= 3 ? 1.1 : 0.6) * (foe.st[db.stat] <= -2 ? 0.3 : 1);
    }
    if (fx.status && mv.pow === 0) s += (fx.status.type === 'stun' ? foe.stun : foe.status) ? -20 : fx.status.chance * hitChance(me, foe, id) * 60;
    else if (fx.status) s += (foe.status ? 0 : fx.status.chance * 12);
    return s;
  }
  function aiChoose(b, me, smart) {
    const rng = b.rng, foe = me.foe;
    const opts = me.moves.filter(id => usable(me, id));
    if (!opts.length) return me.moves[0];
    // (used by the balance sims to play the player's side) snack when low, block a boss's giant attack when it's coming
    if (me.snack && !me.snack.used && me.hp / me.max < 0.4 && rng() < smart) return SNACK;
    if (foe.boss && foe.charging) {
      const br = opts.filter(isBrace);
      if (br.length && rng() < 0.5 + smart * 0.5) { let best = br[0], bs = -1e9; for (const id of br) { const sc = scoreMove(me, foe, id, b.turn + 1) + rng(); if (sc > bs) { bs = sc; best = id; } } return best; }
    }
    if (rng() < (1 - smart) * 0.5) return opts[Math.floor(rng() * opts.length)];
    let best = opts[0], bs = -1e9;
    for (const id of opts) {
      const sc = scoreMove(me, foe, id, b.turn + 1) * (1 + (rng() - 0.5) * 1.4 * (1 - smart));
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }

  // ---------------- generated opponents (Tower) ----------------
  function srng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hashStr = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // A Sprout-shaped opponent of total level lv (so battleStats / movesOf / lookOf work). Deterministic for a seed.
  function genNPC(seed, lv, o) {
    o = o || {};
    const r = srng(seed), pick = a => a[Math.floor(r() * a.length)];
    const area = o.area || pick(D.AREA_ORDER);
    const pool = Object.keys(D.ANIMALS).filter(k => D.ANIMALS[k].area === area);
    const absorbed = {};
    const nA = lv < 12 ? 1 : lv < 45 ? 2 : 3;
    for (let i = 0; i < nA; i++) { const k = pick(pool); absorbed[k] = Math.min(6, (absorbed[k] || 0) + 1 + Math.floor(lv / 25 + r() * 2)); }
    if (o.rare && D.RARES[o.rare]) absorbed[o.rare] = 1;
    const eggB = (D.EGGS[area] || D.EGGS.meadow).bodies;
    const s = { id: 'npc-g' + seed, npc: true, name: o.name || pick(NPC_NAMES.concat(D.NAMES)), area,
      look: { body: pick(eggB), eyes: 'brave', pattern: r() < 0.5 ? pick(['spots', 'stripes', 'twotone', 'freckles', 'heart', 'socks', 'mask']) : 'plain', patternColor: pick(D.PATTERN_COLORS),
        hat: o.hat || (r() < 0.3 ? pick(['cap', 'beanie', 'bow', 'party', 'leafcap', 'flower']) : 'none') },
      stats: Object.fromEntries(D.STATS.map(k => [k, { lv: 0, xp: 0 }])), parts: {}, absorbed: {}, nature: Math.round((r() * 2 - 1) * 70),
      stage: 0, form: 'seedling', flower: null, happy: 80, energy: 100, record: {} };
    const w = { swim: 1, fly: 1, run: 1, power: 1, stamina: 1.2 };
    for (const [aid, n] of Object.entries(absorbed)) {
      const c = ST.creature(aid); if (!c) continue; s.absorbed[aid] = n;
      for (const [st, v] of Object.entries(c.gives)) if (v > 0) w[st] += v / 10 * n;
      if (c.rare) Object.assign(s.parts, c.parts); else if (c.part) s.parts[c.part] = Math.min(1, n * D.GROWTH.partPerAbsorb);
    }
    const wt = Object.values(w).reduce((a, b) => a + b, 0);
    let spill = 0;
    for (const st of D.STATS) { const v = Math.round(lv * w[st] / wt); s.stats[st].lv = Math.min(D.GROWTH.maxLevel, v); spill += Math.max(0, v - D.GROWTH.maxLevel); }
    for (const st of D.STATS) { if (spill <= 0) break; const add = Math.min(spill, D.GROWTH.maxLevel - s.stats[st].lv); s.stats[st].lv += add; spill -= add; }
    const tl = D.STATS.reduce((a, k) => a + s.stats[k].lv, 0);
    if (tl >= D.EVO.budAt) { s.stage = 1; s.form = ST.natureKind(s) + 'bud'; }
    if (tl >= D.EVO.bloomAt) { s.stage = 2; s.flower = ST.flowerFor(area, ST.natureKind(s)); s.form = 'bloom'; }
    return s;
  }
  function towerNPC(seed, f) {
    const star = f % 5 === 0;
    const areas = D.AREA_ORDER, area = areas[Math.floor((f - 1) / 3) % areas.length];
    const rare = star && f >= 15 ? Object.keys(D.RARES)[(seed + f) % Object.keys(D.RARES).length] : null;
    return genNPC(seed * 31 + f * 977, TOWER.lv(f), { area, hat: star ? 'crown' : null, rare });
  }

  // League opponents come from state.makeNPC, which doesn't cap stats. Real Sprouts max out at 50 per stat, so the late leagues
  // move any extra into the other stats (total level unchanged). The original six leagues never go over 50, so they're untouched.
  function leagueNPC(leagueId, index) {
    const s = ST.makeNPC(leagueId, index), M = D.GROWTH.maxLevel; let spill = 0;
    for (const st of D.STATS) if (s.stats[st].lv > M) { spill += s.stats[st].lv - M; s.stats[st].lv = M; }
    for (const st of D.STATS.slice().sort((a, b) => s.stats[b].lv - s.stats[a].lv)) { if (spill <= 0) break; const add = Math.min(spill, M - s.stats[st].lv); s.stats[st].lv += add; spill -= add; }
    return s;
  }
  // One builder for every kind of opponent, used by the real battles and by the estimates, so they always agree.
  // spec: {kind:'league', id, i} | {kind:'wild', id, step} | {kind:'boss', id} | {kind:'tower', seed, floor, hp}
  // (spec.npc: an already-built opponent Sprout, so a batch of sims builds it once)
  function foeBattle(sP, spec, opts) {
    opts = Object.assign({}, opts);
    if (spec.kind === 'league') {
      const li = D.LEAGUES.findIndex(l => l.id === spec.id), o = D.LEAGUES[li].opponents[spec.i];
      const k = typeof o.k === 'number' ? { hp: o.k, atk: o.k } : o.k || null; // data.js: HP and Attack × k
      return newBattle(sP, spec.npc || leagueNPC(spec.id, spec.i), Object.assign(opts, { npcMult: TUNE.npcMult[li], k, smart: TUNE.aiSmart[li] }));
    }
    if (spec.kind === 'wild') return newBattle(sP, null, Object.assign(opts, { wild: { id: spec.id, step: spec.step } }));
    if (spec.kind === 'boss') return newBattle(sP, null, Object.assign(opts, { boss: spec.id }));
    const f = spec.floor, b = newBattle(sP, spec.npc || towerNPC(spec.seed, f), Object.assign(opts, { npcMult: TOWER.mult(f), smart: TOWER.smart(f) }));
    b.p.hp = Math.max(1, Math.round(b.p.max * (Number.isFinite(spec.hp) ? clamp(spec.hp, 0, 1) : 1))); // at least 1 HP
    return b;
  }
  const leagueBattle = (sP, id, i, opts) => foeBattle(sP, { kind: 'league', id, i }, opts);
  // Honest matchup estimate: n quick fights with kid-level play for the player (no snack). Seeded, so the same Sprout
  // against the same opponent always gets the same answer.
  const KID = 0.5;
  function estimate(sP, spec, n, seed) {
    n = n || 36; const rng = srng(seed == null ? 12345 : seed);
    const fixed = spec.kind === 'league' ? Object.assign({ npc: leagueNPC(spec.id, spec.i) }, spec) : spec.kind === 'tower' ? Object.assign({ npc: towerNPC(spec.seed, spec.floor) }, spec) : spec;
    let w = 0, turns = 0;
    for (let i = 0; i < n; i++) {
      const b = foeBattle(sP, fixed, { rng, sim: true });
      while (!b.over && b.turn < 60) resolveRound(b, aiChoose(b, b.p, KID), aiChoose(b, b.o, b.smart));
      w += b.winner === 'p'; turns += b.turn;
    }
    return { win: w / n, turns: turns / n };
  }
  // ---------------- headless sim (balance) ----------------
  function simBattle(sP, sO, oppSmart, pSmart, maxTurns, npcMult) {
    const b = newBattle(sP, sO, { npcMult });
    while (!b.over && b.turn < (maxTurns || 40)) resolveRound(b, aiChoose(b, b.p, pSmart), aiChoose(b, b.o, oppSmart));
    return { won: b.winner === 'p', turns: b.turn, hpLeft: b.p.hp / b.p.max };
  }
  function sim(sP, leagueId, index, n, pSmart) {
    const spec = { kind: 'league', id: leagueId, i: index, npc: leagueNPC(leagueId, index) };
    let w = 0, turns = 0; n = n || 300;
    for (let i = 0; i < n; i++) { const b = foeBattle(sP, spec); while (!b.over && b.turn < 40) resolveRound(b, aiChoose(b, b.p, pSmart == null ? 0.85 : pSmart), aiChoose(b, b.o, b.smart)); w += b.winner === 'p'; turns += b.turn; }
    return { win: +(w / n).toFixed(2), turns: +(turns / n).toFixed(1) };
  }
  const simSnack = () => ({ fruit: 'apple', name: 'Heart Apple', heal: TUNE.snackHeal, used: false });
  function simBoss(sP, bossId, n, pSmart, snack) {
    let w = 0, turns = 0, blocked = 0, supers = 0; n = n || 200; pSmart = pSmart == null ? 0.85 : pSmart;
    for (let i = 0; i < n; i++) {
      const b = newBattle(sP, null, { boss: bossId });
      if (snack) b.p.snack = simSnack();
      while (!b.over && b.turn < 60) {
        const ev = resolveRound(b, aiChoose(b, b.p, pSmart), aiChoose(b, b.o, b.smart));
        for (const e of ev) if (e.giant && e.type === 'hit') { supers++; if (e.braced) blocked++; }
      }
      w += b.winner === 'p'; turns += b.turn;
    }
    return { win: +(w / n).toFixed(2), turns: +(turns / n).toFixed(1), blocked: supers ? +(blocked / supers).toFixed(2) : null };
  }
  function simTower(sP, n, pSmart, snack) {
    const floors = []; n = n || 60; pSmart = pSmart == null ? 0.85 : pSmart;
    for (let i = 0; i < n; i++) {
      let f = 1, hp = 1, sn = snack ? simSnack() : null; const seed = 1000 + i;
      for (; f < 120; f++) {
        const b = newBattle(sP, towerNPC(seed, f), { npcMult: TOWER.mult(f), smart: TOWER.smart(f) });
        b.p.hp = Math.max(1, Math.round(b.p.max * hp)); if (sn) b.p.snack = sn;
        while (!b.over && b.turn < 40) resolveRound(b, aiChoose(b, b.p, pSmart), aiChoose(b, b.o, b.smart));
        if (b.winner !== 'p') break;
        hp = Math.min(1, b.p.hp / b.p.max + TOWER.heal);
      }
      floors.push(f - 1);
    }
    floors.sort((a, b) => a - b);
    return { avg: +(floors.reduce((a, b) => a + b, 0) / n).toFixed(1), median: floors[Math.floor(n / 2)], best: floors[n - 1], worst: floors[0] };
  }

  function simWild(sP, id, step, n, pSmart) {
    let w = 0, turns = 0; n = n || 200;
    for (let i = 0; i < n; i++) { const b = newBattle(sP, null, { wild: { id, step } }); while (!b.over && b.turn < 40) resolveRound(b, aiChoose(b, b.p, pSmart == null ? 0.85 : pSmart), aiChoose(b, b.o, b.smart)); w += b.winner === 'p'; turns += b.turn; }
    return { win: +(w / n).toFixed(2), turns: +(turns / n).toFixed(1), lv: wildLv(id, step) };
  }

  const engine = { TUNE, BOSSES, TOWER, WILD, makeWild, wildLv, wildList, simWild, makeFighter, makeBoss, newBattle, resolveRound, aiChoose, scoreMove, typeMult, hitChance, baseDamage, isBrace,
    simBattle, sim, simBoss, simTower, genNPC, towerNPC, leagueNPC, foeBattle, leagueBattle, estimate, srng, SNACK, KID };
  window.__battle = { engine };

  // ======================================================================
  // Save helpers (new, optional fields only)
  // ======================================================================
  // PS.S.progress.battleExtra = { bosses:{id:{wins,tries,best}}, tower:{best,runs,run}, friend:{day,paid,played}, snack, seen:{},
  //                             wild:{animals:{id:[littleWins,bigWins,alphaWins]}, areas:{areaId:true when every Alpha is beaten}} }
  function extra() {
    const p = PS.S.progress || (PS.S.progress = { races: {}, leagues: {} });
    let e = p.battleExtra;
    if (!e || typeof e !== 'object') e = p.battleExtra = {};
    if (!e.bosses || typeof e.bosses !== 'object') e.bosses = {};
    if (!e.tower || typeof e.tower !== 'object') e.tower = {};
    const T = e.tower; if (typeof T.best !== 'number') T.best = 0; if (typeof T.runs !== 'number') T.runs = 0; if (T.run === undefined) T.run = null;
    if (!e.friend || typeof e.friend !== 'object') e.friend = {};
    if (!e.seen || typeof e.seen !== 'object') e.seen = {};
    if (!e.wild || typeof e.wild !== 'object') e.wild = {};
    if (!e.wild.animals || typeof e.wild.animals !== 'object') e.wild.animals = {};
    if (!e.wild.areas || typeof e.wild.areas !== 'object') e.wild.areas = {};
    return e;
  }
  const bossRec = id => Object.assign({ wins: 0, tries: 0, best: null }, extra().bosses[id]);
  function bossUnlocked(B) {
    const u = B.unlock || {};
    if (u.league) return ST.leagueProgress(u.league).cleared;
    if (u.boss) return bossRec(u.boss).wins > 0;
    return true;
  }
  function unlockText(B) {
    const u = B.unlock || {};
    if (u.league) return `Clear the ${(D.LEAGUES.find(l => l.id === u.league) || {}).name || 'league'} to unlock`;
    if (u.boss) return `Beat the ${BOSS[u.boss].name} to unlock`;
    return '';
  }
  const towerUnlocked = () => ST.leagueProgress(TOWER.unlock).cleared;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // ======================================================================
  // UI
  // ======================================================================
  if (typeof document === 'undefined' || !document.createElement) return; // headless (balance sims)
  PS.scenes = PS.scenes || {};
  const PX = window.PX;
  const INK = '#222034';
  const LEAGUE_AREA = { pebble: 'meadow', thorn: 'meadow', tide: 'beach', moon: 'moonlit', sugar: 'candy', mythic: 'peak', starfall: 'moonlit', titan: 'volcano', champion: 'tower' };
  const safe = (fn, fb) => { try { const v = fn(); return v == null ? fb : v; } catch (e) { return fb; } };
  const sfx = n => safe(() => PX.Sound.play(n));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const elColor = el => (D.ELEMENTS[el] || D.ELEMENTS.normal).color;
  const elLabel = el => (D.ELEMENTS[el] || D.ELEMENTS.normal).label;
  const eggKind = k => (D.EGGS[k] ? k : 'golden'); // (an egg id that isn't in data.js yet pays a Golden Egg instead)
  const eggName = k => (D.EGGS[k] || {}).name || 'Egg';
  const aOrAn = w => (/^[aeiou]/i.test(w) ? 'an' : 'a'); // "an Eclipse Egg", "an Owl"
  const areaName = a => (D.AREAS[a] ? D.AREAS[a].name : 'Garden');
  const SIDES = ['p', 'o'];
  // prefers-reduced-motion: no screen shake, and soft instead of bright full-screen flashes
  const RM = safe(() => window.matchMedia('(prefers-reduced-motion: reduce)'), null);
  const calm = () => !!(RM && RM.matches);
  // remove dead items from an array in place (no new array every frame)
  function keep(a, alive) { let j = 0; for (let i = 0; i < a.length; i++) if (alive(a[i])) a[j++] = a[i]; a.length = j; }
  const partAlive = p => p.life > 0, popAlive = p => p.t < p.life;
  const ambAlive = p => p.life > 0 && p.x > -20 && p.x < WW + 30 && p.y < WH + 6 && p.y > -10;

  // ---------------- matchup estimates (pre-battle "Easy / Fair / Tough / Very tough") ----------------
  // A quick seeded sim with kid-level play, cached per Sprout (its levels, moves and elements) and opponent.
  const estCache = new Map();
  const sproutSig = s => `${s.id}:${D.STATS.map(k => s.stats[k].lv).join(',')}:${ST.movesOf(s).join(',')}:${ST.elementsOf(s).join(',')}`;
  const specKey = sp => (sp.kind === 'league' ? `L:${sp.id}:${sp.i}` : sp.kind === 'wild' ? `W:${sp.id}:${sp.step}` : sp.kind === 'boss' ? `B:${sp.id}` : `T:${sp.seed}:${sp.floor}:${Math.round((sp.hp == null ? 1 : sp.hp) * 20)}`);
  function matchup(s, spec, n) {
    n = n || 36;
    const key = `${sproutSig(s)}|${specKey(spec)}|${n}`;
    let e = estCache.get(key);
    if (!e) { e = safe(() => estimate(s, spec, n, hashStr(key)), { win: 0.5, turns: 10 }); if (estCache.size > 300) estCache.clear(); estCache.set(key, e); }
    return e;
  }
  const ODDS = [{ min: 0.8, word: 'Easy', c: 'easy' }, { min: 0.55, word: 'Fair', c: 'fair' }, { min: 0.25, word: 'Tough', c: 'tough' }, { min: -1, word: 'Very tough', c: 'vtough' }];
  const oddsOf = w => ODDS.find(o => w >= o.min);
  // one short reason, from the types first (what a kid can act on), then levels and healing
  function matchReason(s, spec, win) {
    const b = safe(() => foeBattle(s, spec, { sim: true }), null); if (!b) return '';
    const P = b.p, O = b.o, good = win >= 0.55, me = esc(P.name), foe = esc(O.boss ? 'The ' + O.name : O.name), gap = O.lv - P.lv;
    const atk = f => f.moves.map(id => D.MOVES[id]).filter(m => m && m.pow > 0);
    const hit = atk(P).find(m => typeMult(m.el, O.els) > 1), hurt = atk(O).find(m => typeMult(m.el, P.els) > 1);
    const weak = atk(P).length && atk(P).every(m => typeMult(m.el, O.els) < 1);
    const hitText = () => { const on = O.els.find(d => (D.ELEMENTS[hit.el] || { strong: [] }).strong.includes(d)) || O.els[0]; return `${foe} is ${elLabel(on)} — ${elLabel(hit.el)} moves hit it hard!`; };
    if (good && hit) return hitText();
    if (!good && hurt) return `Watch out: ${foe}'s ${elLabel(hurt.el)} moves hit ${me} hard.`;
    if (!good && weak) return `${me}'s moves are weak against ${elLabel(O.els[0])}.`;
    if (!good && gap >= 5) return `${foe} is ${gap} levels higher.`;
    if (O.boss) return good ? 'Block its giant attack and you can win!' : 'Legends are really strong. Train more first?';
    if (!good && O.moves.some(id => D.MOVES[id] && D.MOVES[id].fx.heal)) return `${foe} can heal itself.`;
    if (good && gap <= -5) return `${me} is ${-gap} levels higher.`;
    if (hit) return hitText();
    return good ? 'A fair fight. Good luck!' : `${foe} is strong. Train a bit more first?`;
  }
  function oddsHtml(s, spec) {
    const e = matchup(s, spec), o = oddsOf(e.win), lvl = ODDS.indexOf(o);
    return `<div class="b-odds ${o.c}"><span class="b-pips" aria-hidden="true">${ODDS.map((x, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>
      <div><b>${o.word}</b><span>${matchReason(s, spec, e.win)}</span></div></div>`;
  }

  // ======================================================================
  // Rewards: prize() says what a battle pays (the previews show these same numbers) and grant() pays it exactly once,
  // the moment the battle is decided, so closing the app during the victory dance never loses a prize.
  // The results card only shows what grant() actually paid.
  // ======================================================================
  const BT = D.BATTLE, XP_SPLIT = BT.xpSplit || { power: 1.2, stamina: 1, run: 0.6, fly: 0.4, swim: 0.4 };
  const LOSE_XP = BT.loseXpShare == null ? 0.35 : BT.loseXpShare, WIN_STEP = BT.winCoinStep == null ? 0.25 : BT.winCoinStep, CLEAR = BT.clearCoins || 3;
  // won: true / false ('draw' for a Friend Battle draw). x: the battle (V) or the same fields for a preview.
  function prize(kind, x, won) {
    const xk = won === true ? 1 : LOSE_XP, lose = BT.loseCoinsShare;
    if (kind === 'league') return { coins: won ? x.L.coins * (1 + x.index * WIN_STEP) : x.L.coins * lose, xp: x.L.xp * xk };
    if (kind === 'boss') return { coins: x.boss.coins * (won ? 1 : lose), xp: x.boss.xp * xk };
    if (kind === 'wild') { const L = wildLv(x.wild.id, x.wild.step); return { coins: WILD.coins(L) * (won ? 1 : lose), xp: WILD.xp(L) * xk }; }
    if (kind === 'tower') return { coins: won ? TOWER.coins(x.floor) : 0, xp: TOWER.xp(x.floor) * xk }; // tower coins go into the prize bag
    if (kind === 'friend') return { coins: won === 'draw' ? FRIEND.coinsDraw : won ? FRIEND.coinsWin : FRIEND.coinsLose, xp: FRIEND.xp };
    return { coins: 0, xp: 0 };
  }
  const leagueClearCoins = L => L.coins * CLEAR;
  const alphaBonus = L => WILD.coins(L) * 2, pouchFullCoins = L => 20 + L * 2;
  const xpCum = [0];
  const cumXp = lv => { while (xpCum.length <= lv) xpCum.push(xpCum[xpCum.length - 1] + D.GROWTH.xpForLevel(xpCum.length - 1)); return xpCum[lv]; };
  const xpOf = s => D.STATS.reduce((t, k) => t + (s.stats[k] ? cumXp(s.stats[k].lv) + (s.stats[k].xp || 0) : 0), 0);
  // coins + XP (spread over the stats) + the battle record. Returns what was really paid (XP is measured, so any
  // happy bonus is included and XP past the max level isn't counted).
  function payout(s, coins, xp, why, won, count) {
    const x0 = xpOf(s), happy = typeof ST.happyBonus === 'function' && safe(() => ST.happyBonus(s), 1) > 1;
    const got = coins > 0 ? ST.addCoins(coins, why) : 0;
    const gives = {}; for (const k of Object.keys(XP_SPLIT)) gives[k] = xp * XP_SPLIT[k];
    const r = ST.gain(s, gives) || {};
    if (count !== false) {
      s.record = s.record || {}; s.record.battles = (s.record.battles || 0) + 1; PS.S.totals.battles = (PS.S.totals.battles || 0) + 1;
      if (won) { s.record.battleWins = (s.record.battleWins || 0) + 1; PS.S.totals.battleWins = (PS.S.totals.battleWins || 0) + 1; }
    }
    return { coins: got, xp: Math.max(0, Math.round(xpOf(s) - x0)), ups: r.ups || {}, evolved: r.evolved, happy, maxed: ST.totalLevels(s) >= D.STATS.length * D.GROWTH.maxLevel };
  }

  const CSS = `
.b-hub,.b-fight{font-variant-ligatures:none}
.b-hub .label,.b-snackrow .label{font-family:var(--f-ui);font-weight:700;font-size:14px;letter-spacing:0;text-transform:none;color:var(--ink)}
.b-res .eyebrow,.b-pass .eyebrow{font-family:var(--f-ui);font-weight:700;font-size:14px;letter-spacing:0;text-transform:none}
.b-mv .n.sm{font-size:14.5px}
.b-hub{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:12px 12px 24px}
.b-hub .panel{padding:12px 14px;margin-bottom:12px}
.b-top{display:flex;align-items:flex-end;justify-content:space-between;margin:2px 4px 10px}
.b-top h1{font-family:var(--f-px);font-weight:700;font-size:26px;margin:0;color:var(--ink)}
.b-top .b-rec{font-family:var(--f-ui);font-weight:700;font-size:15px;color:var(--ink)}
.b-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:0 0 12px}
.b-tab{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:62px;padding:5px 1px 4px;border-radius:14px;border:2px solid var(--line);border-bottom-width:5px;background:var(--panel);font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink);min-width:0}
.b-tab canvas{width:32px;height:32px}
.b-tab[aria-selected="true"]{background:var(--sun);border-color:var(--sun-edge);color:#4a3210}
.b-tab:active{transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
.b-tab .dot{position:absolute;top:2px;right:3px;font-family:var(--f-ui);font-size:12.5px;line-height:15px;padding:0 4px;border-radius:6px;background:var(--berry);color:#fff;border:1px solid #fff;font-weight:700}
.b-ph{display:grid;grid-template-columns:76px 1fr auto;gap:10px;align-items:center}
.b-psprite{width:76px;height:76px;background:var(--slot);border-radius:16px;border:2px solid var(--line)}
.b-pname{font-size:22px;color:var(--ink)}
.b-pform{font-size:15px;color:var(--ink);margin:1px 0 4px}
.b-chips{display:flex;flex-wrap:wrap;gap:4px}
.b-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:1px 7px 1px 4px;font-family:var(--f-ui);font-weight:700;font-size:13px;color:#fff;background:var(--c);border:2px solid rgba(34,32,52,.25)}
.b-chip canvas{width:12px;height:12px;background:#fffdf6;border-radius:50%;padding:1px;box-sizing:content-box}
.b-mlist{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.b-mrow{display:grid;grid-template-columns:16px 1fr;gap:2px 6px;align-items:center;background:color-mix(in srgb,var(--c) 14%,#fffdf6);border:2px solid color-mix(in srgb,var(--c) 55%,#e3cf9d);border-radius:12px;padding:5px 8px;text-align:left}
.b-mrow canvas{width:14px;height:14px;grid-row:span 2}
.b-mrow b{font-family:var(--f-ui);font-weight:700;font-size:15px;line-height:1.1;color:var(--ink)}
.b-mrow small{font-size:14px;color:var(--ink);line-height:1.2}
.b-how{font-size:14px;line-height:1.4;color:var(--ink-soft);margin:10px 2px 0}
.b-lg header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.b-lname{font-size:20px;color:var(--ink)}
.b-lsub{font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink);margin-top:2px}
.b-lsub.done{color:var(--accent)}
.b-rw{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:var(--f-ui);font-weight:700;font-size:13.5px;color:var(--ink)}
.b-rw span{display:inline-flex;align-items:center;gap:4px;background:var(--slot);border-radius:8px;padding:2px 7px}
.b-rw canvas{width:12px;height:12px}
.b-rw canvas.egg{width:12px;height:14px}
.b-opps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.b-opp{position:relative;display:flex;flex-direction:column;align-items:center;gap:0;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:4px 2px 6px}
.b-opp canvas{width:56px;height:56px}
.b-opp b{font-family:var(--f-ui);font-weight:700;font-size:15px;line-height:1.1}
.b-opp small{font-size:14px;color:var(--ink)}
.b-opp.next{border-color:var(--sun-edge);background:#fff6d6;box-shadow:0 0 0 2px var(--sun) inset}
.b-opp.beaten{background:#eef8e6;border-color:#9cd08a}
.b-opp[disabled]{opacity:.5}
.b-opp .b-tick{position:absolute;top:4px;right:4px;width:18px;height:18px}
.b-lg.locked .b-opps{filter:grayscale(1) brightness(.9);opacity:.55}
.b-lockline{display:flex;align-items:center;gap:6px;margin-top:8px;font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink)}
.b-lockline canvas{width:14px;height:16px}
.b-empty{text-align:center;padding:30px 20px}
.b-empty p{font-size:16px}
.b-areas{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0 0 10px}
.b-area{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 2px 4px;border-radius:12px;border:2px solid var(--line);border-bottom-width:4px;background:var(--field);font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink)}
.b-area canvas{width:36px;height:36px}
.b-area small{font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink)}
.b-area.on{background:#eef8e6;border-color:var(--accent);box-shadow:0 0 0 2px #99e550 inset}
.b-area.locked canvas{filter:brightness(0) opacity(.4)}
.b-area.locked{color:var(--ink-soft)}
.b-area .done{position:absolute;top:2px;right:3px;width:14px;height:14px}
.b-wgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.b-wc{position:relative;display:flex;flex-direction:column;align-items:center;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:3px 2px 6px;min-width:0}
.b-wc:active{transform:translateY(3px);border-bottom-width:1px;margin-bottom:3px}
.b-wc canvas{width:48px;height:48px}
.b-wc b{font-family:var(--f-ui);font-weight:700;font-size:15px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.b-wc small{font-size:14px;color:var(--ink);line-height:1.2}
.b-wc.done{background:#fff6d6;border-color:var(--sun-edge)}
.b-stars{display:flex;gap:2px;margin:2px 0 1px}
.b-stars canvas{width:14px;height:14px}
.b-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 6px}
.b-stp{display:flex;flex-direction:column;align-items:center;gap:0;border-radius:12px;border:2px solid var(--line);border-bottom-width:4px;background:var(--field);padding:5px 2px;font-family:var(--f-ui);font-weight:700;font-size:16px;color:var(--ink)}
.b-stp small{font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink)}
.b-stp.on{background:#eef8e6;border-color:var(--accent);box-shadow:0 0 0 2px #99e550 inset}
.b-stp[disabled]{opacity:.45}
.b-champ{display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#fff1bf,#ffe08a);border:2px solid var(--sun-edge);border-bottom-width:5px;border-radius:18px;padding:8px 12px;margin:0 0 12px}
.b-champ canvas{width:48px;height:48px}
.b-champ b{font-family:var(--f-px);font-size:20px;color:#4a3210;display:block}
.b-champ small{font-size:14px;color:#6a4a10;line-height:1.3;display:block}
.b-intro{font-size:15px;line-height:1.4;color:var(--ink);margin:-2px 4px 10px}
.b-intro b{color:var(--ink)}
.b-legs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.b-leg{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:6px 6px 9px;border-radius:18px;border:2px solid var(--px-ink);border-bottom-width:5px;background:linear-gradient(180deg,var(--c1),var(--c2));color:#fff;overflow:hidden}
.b-leg:active:not(.locked){transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
.b-leg canvas.big{width:96px;height:96px;margin:-2px 0 -4px}
.b-leg b{font-family:var(--f-px);font-weight:700;font-size:20px;line-height:1;text-shadow:0 2px 0 rgba(34,32,52,.6)}
.b-leg .t{font-family:var(--f-ui);font-weight:700;font-size:14px;opacity:.95;text-shadow:0 1px 0 rgba(34,32,52,.6);margin-top:1px}
.b-leg .st{margin-top:6px;display:inline-flex;align-items:center;gap:4px;font-family:var(--f-ui);font-weight:700;font-size:14px;line-height:18px;border-radius:8px;padding:2px 8px;background:rgba(255,248,230,.95);color:var(--ink);border:1px solid rgba(34,32,52,.4)}
.b-leg .st canvas{width:16px;height:16px}
.b-leg .st.win{background:#eef8e6;color:#1f6232}
.b-leg .st.new{background:var(--sun);color:#4a3210}
.b-leg.locked{filter:grayscale(.85) brightness(.8)}
.b-leg.locked canvas.big{filter:brightness(0) opacity(.55)}
.b-leg .lk{font-family:var(--f-ui);font-weight:700;font-size:14px;line-height:1.2;margin-top:5px;background:rgba(34,32,52,.55);border-radius:8px;padding:3px 6px}
.b-tw{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:start}
.b-tw canvas.art{width:84px;height:132px}
.b-tw h2{font-family:var(--f-px);font-weight:700;font-size:22px;margin:0;color:var(--ink)}
.b-tw .best{display:inline-flex;align-items:center;gap:5px;font-family:var(--f-ui);font-weight:700;font-size:15px;background:#fff1bf;border:2px solid var(--sun-edge);border-radius:10px;padding:2px 9px;margin:4px 0 6px;color:#4a3210}
.b-tw p{margin:0 0 6px;font-size:15px;line-height:1.35;color:var(--ink)}
.b-treats{display:grid;gap:4px;margin:8px 0 2px}
.b-treat{display:flex;align-items:center;gap:7px;background:var(--slot);border-radius:10px;padding:4px 8px;font-size:14px;font-weight:600;color:var(--ink)}
.b-treat b{font-family:var(--f-ui);font-size:14px;min-width:64px;font-weight:700}
.b-treat canvas{width:16px;height:16px}
.b-treat canvas.egg{width:14px;height:17px}
.b-btns{display:grid;gap:8px;margin-top:12px}
.b-runbox{background:#eef4ff;border:2px solid #9fb8e8;border-radius:14px;padding:8px 10px;margin-top:10px;display:grid;grid-template-columns:48px 1fr;gap:8px;align-items:center}
.b-runbox canvas{width:48px;height:48px}
.b-runbox b{font-family:var(--f-ui);font-size:17px;color:var(--ink);font-weight:700}
.b-runbox small{display:block;font-size:14px;color:var(--ink);line-height:1.3}
.b-runbox.paused{background:#fff6d6;border-color:var(--sun-edge)}
.b-fr .vs{display:flex;align-items:center;justify-content:center;gap:4px;margin:4px 0 8px}
.b-fr .vs canvas{width:84px;height:84px}
.b-fr .vs b{font-family:var(--f-px);font-weight:700;font-size:26px;color:#c0612a}
.b-fr h2{font-family:var(--f-px);font-weight:700;font-size:22px;margin:0 0 4px;text-align:center;color:var(--ink)}
.b-fr p{margin:0 0 6px;font-size:15px;line-height:1.4;color:var(--ink);text-align:center}
.b-fr ol{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:6px;counter-reset:s}
.b-fr ol li{display:grid;grid-template-columns:24px 1fr;gap:8px;font-size:15px;line-height:1.35;counter-increment:s;color:var(--ink)}
.b-fr ol li::before{content:counter(s);display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:var(--sun);border:2px solid var(--sun-edge);font-family:var(--f-ui);font-weight:700;font-size:13px;color:#4a3210}
.b-snackrow{margin:10px 0 2px;text-align:left}
.b-snackrow .label span{text-transform:none;letter-spacing:0;font-family:var(--f-ui);font-weight:600;color:var(--accent)}
.b-snacks{display:flex;gap:6px;overflow-x:auto;padding:4px 1px 4px;-webkit-overflow-scrolling:touch;touch-action:pan-x}
.b-sn{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-width:52px;height:54px;border-radius:12px;border:2px solid var(--line);border-bottom-width:4px;background:var(--field);font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink)}
.b-sn canvas{width:26px;height:26px}
.b-sn small{font-size:13px;line-height:1;color:var(--ink);font-weight:700}
.b-sn.on{background:#eef8e6;border-color:var(--accent);box-shadow:0 0 0 2px #99e550 inset}
.b-snone{font-size:14px;color:var(--ink-soft);margin:2px 0 0}
.b-mini{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:4px 0 8px}
.b-mini span{font-family:var(--f-ui);font-weight:700;font-size:14px;background:var(--slot);border-radius:8px;padding:2px 8px}
.b-odds{display:flex;align-items:center;gap:9px;margin:8px 0 6px;padding:6px 10px;border-radius:12px;border:2px solid var(--oc);background:color-mix(in srgb,var(--oc) 16%,#fffdf6);text-align:left}
.b-odds b{display:block;font-family:var(--f-ui);font-weight:700;font-size:17px;line-height:1.15;color:var(--ink)}
.b-odds div span{display:block;font-size:14px;line-height:1.3;color:var(--ink)}
.b-odds .b-pips{display:flex;align-items:flex-end;gap:2px;flex:0 0 auto}
.b-pips i{display:block;width:6px;border-radius:2px;background:#e3dccb;border:1px solid rgba(34,32,52,.35)}
.b-pips i:nth-child(1){height:8px}.b-pips i:nth-child(2){height:12px}.b-pips i:nth-child(3){height:16px}.b-pips i:nth-child(4){height:20px}
.b-pips i.on{background:var(--oc)}
.b-odds.easy,.b-ow.easy{--oc:#6abe30}.b-odds.fair,.b-ow.fair{--oc:#f6c83a}.b-odds.tough,.b-ow.tough{--oc:#df7126}.b-odds.vtough,.b-ow.vtough{--oc:#e5535f}
.b-ow{font-family:var(--f-ui);font-weight:700;border-radius:6px;padding:0 5px;background:var(--oc);color:#fff;text-shadow:0 1px 0 rgba(34,32,52,.4)}
.b-why{background:#fff6d6;border:2px solid var(--sun-edge);border-radius:12px;padding:7px 10px;margin:2px 0 8px;text-align:left;font-size:15px;line-height:1.35;color:var(--ink)}
.b-why b{display:block;font-family:var(--f-ui);font-weight:700}
.b-why span{display:block}.b-why i{font-style:normal;font-weight:700;color:var(--accent)}
.b-alt{display:grid;grid-template-columns:44px 1fr;gap:4px 8px;align-items:center;background:#eef8e6;border:2px solid var(--accent);border-radius:12px;padding:6px 8px 8px;margin:0 0 8px;text-align:left}
.b-alt canvas{width:44px;height:44px}
.b-alt b{display:block;font-family:var(--f-ui);font-weight:700;font-size:16px;color:var(--ink)}
.b-alt small{display:block;font-size:14px;line-height:1.3;color:var(--ink)}
.b-alt .btn{grid-column:1 / -1}
.b-happy{font-family:var(--f-ui);font-weight:700;font-size:12.5px;border-radius:6px;padding:0 5px;margin-left:4px;background:#f7b6c8;color:#6a1f3e}

.b-fight{position:absolute;inset:0;display:flex;flex-direction:column;background:#222034}
.b-arena{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.b-cv{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
.b-plate{position:absolute;width:min(48%,210px);background:rgba(255,248,230,.96);border:2px solid var(--edge);border-bottom-width:4px;border-radius:14px;padding:5px 9px 5px;box-shadow:0 3px 0 rgba(34,32,52,.25);pointer-events:none;transition:opacity .3s}
.b-plate.o{top:10px;left:10px}
.b-plate.p{right:10px;bottom:12px}
.b-own{font-family:var(--f-ui);font-weight:700;font-size:13px;letter-spacing:0;text-transform:none;color:#c0612a;line-height:1.15}
.b-prow{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.b-prow b{font-family:var(--f-ui);font-weight:700;font-size:17px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.b-pels{display:flex;gap:2px;flex:0 0 auto;margin-right:auto;align-self:center}
.b-pels canvas{width:14px;height:14px;display:block}
.b-prow .b-lv{font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink);white-space:nowrap}
.b-hp{display:flex;align-items:center;gap:5px;margin-top:3px}
.b-hp em{font-family:var(--f-ui);font-style:normal;font-weight:700;font-size:12.5px;color:#fff;background:#c0612a;border-radius:4px;padding:0 3px;line-height:15px}
.b-hpbar{flex:1;height:10px;background:#3a3350;border:2px solid var(--px-ink);border-radius:3px;overflow:hidden;position:relative}
.b-hpbar i{position:absolute;left:0;top:0;bottom:0;width:100%;background:#6abe30;box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.18)}
.b-hpbar i.mid{background:#f6c83a}.b-hpbar i.low{background:#e5535f}
.b-hpbar::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(34,32,52,.28) 7px 8px)}
.b-prow2{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-top:3px;min-height:16px}
.b-hpn{white-space:nowrap;flex:0 0 auto}
.b-hpn{font-family:var(--f-ui);font-weight:700;font-size:15px;color:var(--ink)}
.b-tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px}
.b-tag{font-family:var(--f-ui);font-weight:700;font-size:12.5px;line-height:16px;border-radius:4px;padding:0 5px;color:#fff;border:1px solid rgba(34,32,52,.4)}
.b-tag.up{background:#2b8243}.b-tag.down{background:#3f55b8}
.b-tag.poison{background:#9a6ad0}.b-tag.burn{background:#df5a26}.b-tag.sleep{background:#5b6ee1}.b-tag.stun{background:#e0a800;color:#3a2a00}
.b-tag.tired{background:#8c93a8}
.b-tag.charge{background:#e5535f;animation:bBlink .6s steps(2) infinite}
.b-plate.o.boss{left:10px;right:10px;width:auto;background:linear-gradient(180deg,#3a2a4a,#2a1e38);border-color:#fbf236;color:#fff;padding:5px 10px 6px}
.b-plate.boss .b-prow b{color:#fff27a;font-size:20px;letter-spacing:.02em;font-family:var(--f-px)}
.b-plate.boss .b-lv{color:#f6d2ad}
.b-plate.boss .b-sub{font-family:var(--f-ui);font-weight:700;font-size:14px;color:#dfe8fb;margin-top:-1px}
.b-plate.boss .b-hpbar{height:14px}
.b-plate.boss .b-hpbar i{background:#e5535f}.b-plate.boss .b-hpbar i.mid{background:#df7126}.b-plate.boss .b-hpbar i.low{background:#ac3232}
.b-plate.boss .b-hpn{color:#fff}
.b-plate.boss .b-hp em{background:#fbf236;color:#4a3210}
.b-fight.boss .b-run{top:92px}
.b-plate.boss .b-sub{display:inline;margin-left:4px}
.b-run{position:absolute;top:10px;right:10px;font-family:var(--f-ui);font-weight:700;font-size:14px;border-radius:10px;border:2px solid rgba(255,255,255,.55);background:rgba(34,32,52,.45);color:#fff;padding:5px 9px}
.b-run.armed{background:#e5535f;border-color:#fff}
.b-snack{position:absolute;right:10px;bottom:98px;display:flex;align-items:center;gap:6px;font-family:var(--f-ui);font-weight:700;font-size:16px;border-radius:14px;border:2px solid var(--accent-edge);border-bottom-width:5px;background:#eef8e6;color:#1f6232;padding:4px 10px 4px 6px}
.b-snack canvas{width:26px;height:26px}
.b-snack:active:not([disabled]){transform:translateY(3px);border-bottom-width:2px}
.b-snack[disabled]{opacity:.5}
.b-snack.brace{box-shadow:0 0 0 3px #fbf236;animation:bGlow .8s ease-in-out infinite}
.b-warn{position:absolute;left:12px;right:12px;top:128px;text-align:center;background:#e5535f;border:3px solid #fbf236;border-radius:14px;padding:6px 10px 7px;color:#fff;box-shadow:0 4px 0 rgba(34,32,52,.45);pointer-events:none;animation:bWarn .9s ease-in-out infinite}
.b-warn b{display:block;font-family:var(--f-px);font-weight:700;font-size:20px;line-height:1.1;text-transform:uppercase;letter-spacing:.02em;text-shadow:0 2px 0 #8a2433}
.b-warn span{display:block;font-size:15px;font-weight:700;line-height:1.25;margin-top:2px}
@keyframes bWarn{50%{transform:scale(1.03)}}
@keyframes bGlow{50%{box-shadow:0 0 0 5px #fff27a}}
.b-panel{flex:0 0 auto;background:var(--panel);border-top:3px solid var(--edge);padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px}
.b-log{position:relative;height:58px;overflow:hidden;background:var(--field);border:2px solid var(--line);border-radius:12px;padding:6px 26px 6px 10px;font-family:var(--f-ui);font-weight:600;font-size:17px;line-height:1.25;color:var(--ink)}
.b-log i{position:absolute;right:9px;bottom:5px;font-style:normal;font-size:11px;color:var(--ink-soft);animation:bBlink 1s steps(2) infinite}
@keyframes bBlink{50%{opacity:0}}
.b-moves{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:58px 58px;gap:8px}
.b-log.long{font-size:15px;line-height:1.3}
.b-mv{position:relative;display:grid;grid-template-columns:20px 1fr;grid-template-rows:auto auto;column-gap:7px;align-items:center;text-align:left;height:58px;min-height:0;padding:6px 9px 6px 8px;border-radius:14px;
  background:color-mix(in srgb,var(--c) 18%,#fffdf6);border:2px solid color-mix(in srgb,var(--c) 70%,#222034);border-bottom-width:5px;color:var(--ink);-webkit-touch-callout:none}
.b-mv:active:not([disabled]){transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
.b-mv canvas{grid-row:span 2;width:20px;height:20px}
.b-mv .n{font-family:var(--f-ui);font-weight:700;font-size:16px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b-mv .d{font-family:var(--f-ui);font-weight:600;font-size:14px;color:var(--ink);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b-mv .eff{position:absolute;top:-9px;right:6px;font-family:var(--f-ui);font-weight:700;font-size:12.5px;line-height:16px;padding:0 5px;border-radius:6px;border:1px solid var(--px-ink)}
.b-mv .eff.good{background:#99e550;color:#1f4a10}.b-mv .eff.bad{background:#dfe8fb;color:#595a70}
.b-mv .eff.brace{background:#fbf236;color:#4a3210;right:auto;left:6px}
.b-mv.brace{box-shadow:0 0 0 3px #fbf236;animation:bGlow .8s ease-in-out infinite}
.b-mv[disabled]{opacity:.45}
.b-moves.wait .b-mv{opacity:.55;pointer-events:none}
.b-info{font-size:14px;line-height:1.3;color:var(--ink-soft);height:37px;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;padding:0 2px}
.b-info.long{font-size:14px;line-height:1.3;height:37px;-webkit-line-clamp:2}
.b-info b{font-family:var(--f-ui);font-weight:700;color:var(--ink)}

.b-res{position:absolute;inset:0;background:rgba(34,32,52,.55);display:flex;flex-direction:column;align-items:center;padding:16px;z-index:10;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.b-res .card,.b-pass .card{margin:auto}
@media (max-height:720px){.b-res canvas.hero{width:84px;height:84px}.b-res .card{padding-top:14px}.b-pass canvas{width:96px;height:96px}}
.b-res .card{text-align:center;animation:bPop .35s ease-out}
@keyframes bPop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}
.b-res canvas.hero{width:112px;height:112px;display:block;margin:-6px auto 0}
.b-res canvas.duo{width:84px;height:84px}
.b-res h1{margin:2px 0 4px}
.b-res .sub{font-size:15px;color:var(--ink);margin:0 0 10px}
.b-rrows{display:grid;gap:6px;margin:8px 0 4px;text-align:left}
.b-rrow{display:flex;align-items:center;gap:8px;background:var(--slot);border-radius:12px;padding:7px 10px;font-size:15.5px;font-weight:600}
.b-rrow canvas{width:18px;height:18px;flex:0 0 auto}
.b-rrow canvas.egg{width:20px;height:24px}
.b-rrow canvas.crit{width:32px;height:32px}
.b-rrow b{font-family:var(--f-ui);font-size:17px;margin-left:auto;font-weight:700}
.b-rrow.gold{background:#fff1bf;border:2px solid var(--sun-edge)}
.b-rrow.blue{background:#eef4ff;border:2px solid #9fb8e8}
.b-ups{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:6px 0 2px}
.b-ups span{font-family:var(--f-ui);font-weight:700;font-size:14px;color:#fff;border-radius:8px;padding:2px 8px}
.b-hpline{display:flex;align-items:center;gap:8px;margin:4px 0 2px;font-family:var(--f-ui);font-weight:700;font-size:14px;color:var(--ink)}
.b-hpline .b-hpbar{height:12px}
.b-pass{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;align-items:center;overflow:auto;padding:18px;background:#3a2a4a;background-image:radial-gradient(rgba(255,255,255,.08) 22%,transparent 24%);background-size:22px 22px}
.b-pass .card{text-align:center;animation:bPop .3s ease-out}
.b-pass canvas{width:128px;height:128px;display:block;margin:-4px auto 2px}
.b-pass h1{font-size:30px;font-family:var(--f-ui);font-weight:700}
.b-res h1.num{font-family:var(--f-ui);font-weight:700}
@media (prefers-reduced-motion: reduce){.b-res .card,.b-pass .card{animation:none}.b-log i,.b-warn,.b-mv.brace,.b-snack.brace,.b-tag.charge{animation:none}}
`;

  // ---------------- small pixel icons ----------------
  const ICON = {};
  function icons() {
    if (ICON.ok) return ICON; ICON.ok = true;
    const G = PX.Grid;
    let g = new G(9, 9); g.px([[1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [7, 2]], '#ffffff'); g.px([[1, 5], [2, 6], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3]], '#ffffff');
    const t = new G(11, 11); t.ell(5.5, 5.5, 5, 5, ['#99e550', '#6abe30', '#37946e']); t.outline(); for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (g.get(x, y)) t.set(x + 1, y + 1, '#ffffff'); ICON.tick = t.canvas();
    g = new G(9, 11); g.rect(2, 1, 5, 1, '#8c93a8'); g.rect(1, 2, 1, 3, '#8c93a8'); g.rect(7, 2, 1, 3, '#8c93a8'); g.rect(1, 5, 7, 5, '#f6c83a'); g.px([[4, 7], [4, 8]], '#8a6f30'); ICON.lock = g.canvas();
    ICON.coin = safe(() => PX.item('coin'), null) || safe(() => PS.ui.icon('coin'), null);
    ICON.bigcoin = safe(() => PX.item('bigcoin'), null) || ICON.coin;
    // tab icons (16x16)
    g = new G(16, 16); g.poly([[1.5, 4.5], [5, 9], [8, 2.5], [11, 9], [14.5, 4.5], [13.2, 13], [2.8, 13]], '#f6c83a'); g.rect(3, 11, 10, 2, '#c7861c'); g.outline();
    g.px([[8, 7], [8, 8]], '#e5535f'); g.px([[5, 11], [11, 11]], '#639bff'); g.px([[4, 7], [7, 5]], '#fff27a'); g.px([[1, 3], [8, 1], [14, 3]], '#fff27a'); ICON.crown = g.canvas();
    g = new G(16, 16); g.rect(4, 6, 8, 9, '#b7c2cc'); g.rect(3, 4, 10, 2, '#8c93a8'); g.px([[3, 3], [5, 3], [7, 3], [9, 3], [11, 3], [12, 3]], '#8c93a8'); g.rect(7, 0, 1, 4, '#595a70'); g.rect(8, 0, 4, 2, '#e5535f'); g.outline();
    g.px([[6, 8], [9, 8], [6, 9], [9, 9]], '#3f3f74'); g.rect(7, 12, 2, 3, '#8f563b'); g.px([[4, 11], [11, 7], [5, 13]], '#8c93a8'); ICON.tower = g.canvas();
    g = new G(16, 16); g.ell(4.8, 10.5, 3.8, 3.8, ['#a6f2d3', '#52c7a8', '#2f8078']); g.ell(11.2, 10.5, 3.8, 3.8, ['#f7b6c8', '#e07ba0', '#a2477a']); g.px([[7, 3], [9, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [7, 5], [8, 5], [9, 5], [8, 6]], '#e5535f'); g.outline();
    g.px([[3, 10], [6, 10], [10, 10], [13, 10]], INK); g.px([[4, 12], [5, 12], [11, 12], [12, 12]], INK); ICON.friends = g.canvas();
    ICON.league = safe(() => PS.ui.icon('battle'), null);
    g = new G(16, 16); g.ell(8, 11, 3.8, 3.2, ['#c48a5c', '#8f563b', '#5a3322']); for (const [x, y] of [[3, 6.5], [6, 3.6], [10, 3.6], [13, 6.5]]) g.ell(x, y, 1.7, 2, ['#c48a5c', '#8f563b', '#5a3322']); g.outline(); g.px([[7, 10], [5, 3], [9, 3]], '#f6d2ad'); ICON.paw = g.canvas();
    ICON.staron = PX.fromStrings(['...k...', '..kyk..', 'kkkykkk', 'kyyWyyk', '.kyyyk.', '.kykyk.', 'kk...kk'], { k: INK, y: '#fbf236', W: '#ffffff' }).canvas();
    ICON.staroff = PX.fromStrings(['...k...', '..kgk..', 'kkkgkkk', 'kgggggk', '.kgggk.', '.kgkgk.', 'kk...kk'], { k: '#8c93a8', g: '#e3dccb' }).canvas();
    // particles
    const dot = (c, s) => { const d = new G(s || 2, s || 2); d.rect(0, 0, s || 2, s || 2, c); return d.canvas(); };
    ICON.bubble = PX.fromStrings(['.a.', 'a.a', '.a.'], { a: '#cbeeff' }).canvas();
    ICON.pebble = PX.fromStrings(['gg', 'gG'], { g: '#b7c2cc', G: '#595a70' }).canvas();
    ICON.rock = PX.fromStrings(['.gg.', 'gggG', 'gGGG', '.GG.'], { g: '#b7c2cc', G: '#8c7a5e' }).canvas();
    ICON.up = PX.fromStrings(['..c..', '.ccc.', 'ccccc', '..c..', '..c..'], { c: '#99e550' }).canvas();
    ICON.down = PX.fromStrings(['..c..', '..c..', 'ccccc', '.ccc.', '..c..'], { c: '#9fd8ff' }).canvas();
    ICON.plus = PX.fromStrings(['.c.', 'ccc', '.c.'], { c: '#c3f08a' }).canvas();
    ICON.sweat = PX.fromStrings(['.c', 'cc'], { c: '#9fd8ff' }).canvas();
    ICON.fireball = PX.fromStrings(['.oyo.', 'oyWyo', 'yWWWy', 'oyWyo', '.oyo.'], { o: '#df5a26', y: '#fbf236', W: '#ffffff' }).canvas();
    ICON.orb = PX.fromStrings(['.pp.', 'pPPp', 'pPPp', '.pp.'], { p: '#5e3a8e', P: '#c9a2f0' }).canvas();
    ICON.wind = PX.fromStrings(['wwww..', '..wwww'], { w: '#ffffff' }).canvas();
    ICON.drop = PX.fromStrings(['.b.', 'bwb', 'bbb'], { b: '#639bff', w: '#cbeeff' }).canvas();
    ICON.star = PX.fromStrings(['..y..', '.yyy.', 'yyWyy', '.yyy.', '.y.y.'], { y: '#fbf236', W: '#ffffff' }).canvas();
    ICON.sprinkle = [['#e5535f'], ['#639bff'], ['#99e550'], ['#fbf236'], ['#f7b6c8']].map(c => PX.fromStrings(['cc'], { c: c[0] }).canvas());
    ICON.shield = PX.fromStrings(['.bbbbb.', 'bwwwwwb', 'bwWWWwb', 'bwWWWwb', '.bwWwb.', '..bwb..', '...b...'], { b: '#3f55b8', w: '#9fd8ff', W: '#ffffff' }).canvas();
    ICON.dot = dot;
    ICON.splash = dot('#cbdbfc', 1);
    // element hit effects (hitFx)
    ICON.petals = [fxs('leaf'), PX.fromStrings(['.p', 'pP'], { p: '#f7b6c8', P: '#e07ba0' }).canvas(), PX.fromStrings(['gg', '.G'], { g: '#99e550', G: '#37946e' }).canvas()];
    ICON.droplet = PX.fromStrings(['.a.', 'aba', '.a.'], { a: '#639bff', b: '#cbeeff' }).canvas();
    ICON.embers = [dot('#ff9a3a', 1), dot('#fbf236', 1), dot('#df5a26', 2), PX.fromStrings(['y', 'o'], { y: '#fbf236', o: '#df5a26' }).canvas()];
    ICON.chips = [PX.fromStrings(['gG', 'G.'], { g: '#d8c8a8', G: '#8c7a5e' }).canvas(), PX.fromStrings(['.g', 'gG'], { g: '#b7c2cc', G: '#595a70' }).canvas(), dot('#a8946e', 1), dot('#6a5a40', 2)];
    ICON.streak = PX.fromStrings(['..wwWW', 'wwww..'], { w: '#ffffff', W: '#dcecfa' }).canvas();
    ICON.wisps = [PX.fromStrings(['.p', 'pq', 'q.'], { p: '#c9a2f0', q: '#9a6ad0' }).canvas(), PX.fromStrings(['p.', 'qp', '.q'], { p: '#c9a2f0', q: '#5e3a8e' }).canvas()];
    ICON.twinkle = [fxs('spark', '#ffffff'), fxs('bigspark', '#fbf236'), fxs('spark', '#fff27a')];
    ICON.clouds = [
      PX.fromStrings(['...wwww....', '.wwwwwwww..', 'wwwwwwwwwww', '.WWWWWWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
      PX.fromStrings(['..www..', 'wwwwwww', '.WWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
      PX.fromStrings(['.....www.......', '..wwwwwwwww....', '.wwwwwwwwwwwww.', 'wwwwwwwwwwwwwww', '.WWWWWWWWWWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
    ];
    ICON.darkclouds = ICON.clouds.map(c => tint(c, '#4a5478', 0.85));
    return ICON;
  }
  function tint(c, col, a) {
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d');
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, o.width, o.height); return o;
  }
  // pixel tower art for the hub (28x44)
  let towerArt = null;
  function towerPic() {
    if (towerArt) return towerArt;
    const G = PX.Grid, g = new G(28, 44), S = ['#dfe4ee', '#b7c2cc', '#8c93a8', '#595a70'];
    g.rect(6, 12, 16, 31, S[1]); g.rect(4, 8, 20, 5, S[2]);
    for (const x of [4, 9, 14, 19]) g.rect(x, 5, 3, 3, S[2]);
    g.rect(13, 0, 1, 6, S[3]); g.rect(14, 0, 7, 3, '#e5535f'); g.rect(14, 3, 4, 1, '#e5535f');
    g.outline();
    for (let y = 14; y < 43; y += 3) for (let x = 7 + ((y / 3) % 2 ? 2 : 0); x < 21; x += 5) g.px([[x, y]], S[2]);
    for (let y = 13; y < 43; y++) { g.set(7, y, S[0]); g.set(20, y, S[2]); }
    const win = (x, y, lit) => { g.rect(x, y, 3, 4, lit ? '#fbf236' : '#3f3f74'); g.set(x + 1, y - 1, lit ? '#fbf236' : '#3f3f74'); if (lit) g.set(x, y + 3, '#f6c83a'); };
    win(9, 17, false); win(16, 17, true); win(12, 25, true); win(9, 32, true); win(16, 32, false);
    g.rect(11, 38, 6, 5, '#8f563b'); g.rect(12, 37, 4, 1, '#8f563b'); g.set(15, 40, '#fbf236'); g.px([[16, 1], [15, 1]], '#f07a84');
    towerArt = g.canvas(); return towerArt;
  }
  const fxs = (k, c) => safe(() => PX.fx(k, c), null);
  function elParticles(el) {
    const I = icons();
    switch (el) {
      case 'leaf': return { spr: [fxs('leaf'), fxs('spark', '#99e550'), fxs('leaf')], g: 40 };
      case 'water': return { spr: [I.bubble, fxs('drop', '#9fd8ff'), fxs('drop', '#639bff')], g: -10 };
      case 'fire': return { spr: [fxs('spark', '#ff9a3a'), fxs('spark', '#fbf236'), fxs('bigspark', '#df5a26')], g: -40 };
      case 'stone': return { spr: [I.pebble, I.dot('#8c7a5e'), I.dot('#b7c2cc')], g: 120 };
      case 'sky': return { spr: [fxs('feather'), fxs('spark', '#ffffff'), fxs('spark', '#9fd8ff')], g: 20 };
      case 'shadow': return { spr: [fxs('spark', '#9a6ad0'), fxs('bigspark', '#5e3a8e'), I.dot('#c9a2f0')], g: -20 };
      case 'light': return { spr: [fxs('bigspark', '#fbf236'), fxs('spark', '#ffffff'), fxs('spark', '#fff27a')], g: 0 };
      case 'sweet': return { spr: [fxs('spark', '#f7b6c8'), fxs('heart'), fxs('spark', '#e07ba0')], g: 30 };
      default: return { spr: [fxs('spark', '#ffffff'), fxs('bigspark', '#ffffff'), I.dot('#dfe8fb')], g: 60 };
    }
  }

  // ---------------- DOM ----------------
  let root, hubEl, fightEl, resEl, passEl, arenaEl, cv, ctx, logEl, movesEl, infoEl, runBtn, snackBtn, warnEl, plateEls = {};
  const lo = document.createElement('canvas'), lx = lo.getContext('2d');
  const bgC = document.createElement('canvas'), bgx = bgC.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1, PXS = 4, SC = 12, WPX = 4, WW = 100, WH = 120, bgKey = -1, sizeDirty = true, sizeCheckT = 0;
  // SC = device pixels per world pixel (always a whole number, so pixel art stays crisp); WPX = CSS px per world pixel
  let V = null; // live battle view
  let hubT = 0, hubFrame = 0, hubSprite = null, hubTab = 'leagues';
  let snackSel;  // fruit id chosen as a battle snack (undefined = not chosen yet this session)

  function mount(el) {
    root = el;
    if (!document.getElementById('b-style')) { const st = document.createElement('style'); st.id = 'b-style'; st.textContent = CSS; document.head.appendChild(st); }
    root.innerHTML = `
      <div class="b-hub"></div>
      <div class="b-fight" hidden>
        <div class="b-arena">
          <canvas class="b-cv"></canvas>
          <div class="b-plate o"></div>
          <div class="b-plate p"></div>
          <div class="b-warn" hidden></div>
          <button class="b-snack" type="button" hidden><canvas class="px" width="13" height="13"></canvas><span>Snack</span></button>
          <button class="b-run" type="button">Give up</button>
        </div>
        <div class="b-panel">
          <div class="b-log" aria-live="polite"><span></span><i hidden>&#9660;</i></div>
          <div class="b-moves"></div>
          <div class="b-info"></div>
        </div>
        <div class="b-res" hidden></div>
        <div class="b-pass" hidden></div>
      </div>`;
    hubEl = root.querySelector('.b-hub'); fightEl = root.querySelector('.b-fight'); resEl = root.querySelector('.b-res'); passEl = root.querySelector('.b-pass');
    arenaEl = root.querySelector('.b-arena'); cv = root.querySelector('.b-cv'); ctx = cv.getContext('2d');
    logEl = root.querySelector('.b-log'); movesEl = root.querySelector('.b-moves'); infoEl = root.querySelector('.b-info');
    runBtn = root.querySelector('.b-run'); snackBtn = root.querySelector('.b-snack'); warnEl = root.querySelector('.b-warn');
    plateEls = { o: root.querySelector('.b-plate.o'), p: root.querySelector('.b-plate.p') };
    let armedAt = 0;
    runBtn.onclick = () => {
      if (!V || V.b.over || V.granted || V.phase === 'end' || V.phase === 'results') return; // the fight is already decided
      const label = V.mode === 'friend' ? 'End battle' : 'Give up';
      if (Date.now() - armedAt > 3000) {
        armedAt = Date.now(); runBtn.textContent = V.mode === 'tower' ? 'Tap again (keep half the bag)' : `Tap again to ${label.toLowerCase()}`; runBtn.classList.add('armed');
        setTimeout(() => { if (V) runBtn.textContent = V.mode === 'friend' ? 'End battle' : 'Give up'; runBtn.classList.remove('armed'); armedAt = 0; }, 3000); return;
      }
      sfx('miss');
      const wasTower = V.mode === 'tower', bag = wasTower ? towerRun() && towerRun().pot : 0;
      forfeit(); renderHub();
      if (wasTower && bag) PS.ui.toast(`Tower run over. You kept ${Math.round(bag / 2)} coins.`, 3000);
    };
    snackBtn.onclick = () => {
      if (!V || V.phase !== 'choose') return;
      const f = V.b[chooser()]; if (!usable(f, SNACK)) return;
      if (f.hp >= f.max && !(f.foe.boss && f.foe.charging)) { sfx('miss'); infoEl.innerHTML = `<b>${esc(f.name)} is full!</b> Save the snack for when HP is low.`; return; }
      choose(SNACK);
    };
    const skip = () => { if (V && (V.phase === 'play' || V.phase === 'intro' || V.phase === 'end')) V.fast = true; };
    arenaEl.addEventListener('pointerdown', e => { if (e.target !== runBtn && !snackBtn.contains(e.target)) skip(); });
    logEl.addEventListener('pointerdown', skip);
    window.addEventListener('resize', () => { sizeDirty = true; });
    if (window.ResizeObserver) safe(() => new ResizeObserver(() => { sizeDirty = true; }).observe(arenaEl));
  }

  function show(params) {
    params = params || {};
    if (!V) { fightEl.hidden = true; hubEl.hidden = false; renderHub(); }
    if (params.league != null && params.index != null) startBattle(params.league, params.index);
  }
  function hide() { if (V) forfeit(true); } // leaving the screen some other way only pauses a Tower floor
  function forfeit(pause) { // leave mid-battle: no reward, restore shell. Giving up on a Tower floor ends the run (half the bag).
    if (V && V.mode === 'tower' && !V.granted && !pause) towerEnd('lost'); // (a decided floor was already paid by grant())
    V = null; resEl.hidden = true; passEl.hidden = true; fightEl.hidden = true; hubEl.hidden = false;
    PS.ui.chrome(true); PS.ui.hold(false);
  }

  // ---------------- hub ----------------
  const partner = () => ST.active();
  function chip(el) {
    return `<span class="b-chip" style="--c:${elColor(el)}"><canvas class="px" data-el="${el}" width="7" height="7"></canvas>${elLabel(el)}</span>`;
  }
  function paintIcons(scope) {
    scope.querySelectorAll('canvas[data-el]').forEach(c => { const s = safe(() => PX.item('element', c.dataset.el), null); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-coin]').forEach(c => { const s = c.dataset.coin === 'big' ? icons().bigcoin : icons().coin; if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-egg]').forEach(c => { const s = safe(() => PX.item('egg', c.dataset.egg), null); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-icon]').forEach(c => { const s = icons()[c.dataset.icon]; if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-fruit]').forEach(c => { const s = safe(() => PX.item('fruit', c.dataset.fruit), null); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-critter]').forEach(c => { const s = critterBox(c.dataset.critter, +(c.dataset.box || 32)); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
  }
  // a rare critter centred on its feet in a square canvas (so it scales by whole pixels)
  const boxCache = {};
  function critterBox(id, box) {
    const key = id + box; if (boxCache[key]) return boxCache[key];
    const c = safe(() => PX.critter(id), null); if (!c) return null;
    const o = document.createElement('canvas'); o.width = box; o.height = box;
    o.getContext('2d').drawImage(c, Math.floor((box - c.width) / 2), box - c.height - Math.floor((box - c.height) / 4));
    return (boxCache[key] = o);
  }
  function moveKind(mv) {
    const fx = mv.fx;
    if (mv.pow > 0) return `Pow ${mv.pow}${fx.hits ? ' ×' + fx.hits : ''}`;
    if (fx.heal) return 'Heal';
    if (fx.buff) return 'Boost';
    if (fx.debuff) return 'Weaken';
    if (fx.status) return 'Status';
    return 'Support';
  }
  function moveSource(s, id) {
    if (ST.formInfo(s).moves.includes(id)) return ST.formInfo(s).short;
    const top = ST.topAnimal(s); return top ? ST.creature(top).name : '';
  }
  const TABS = [['leagues', 'Leagues', 'league'], ['wild', 'Wild', 'paw'], ['legends', 'Legends', 'crown'], ['tower', 'Tower', 'tower'], ['friends', 'Friends', 'friends']];
  function tabBadge(id) {
    const X = extra();
    if (id === 'legends') return BOSSES.some(B => bossUnlocked(B) && !X.seen['boss:' + B.id]);
    if (id === 'tower') return towerUnlocked() && !X.seen.tower;
    if (id === 'wild') return WILD.areas.some(W => wildOpen(W) && !X.seen['wild:' + W.id]);
    return false;
  }
  function renderHub() {
    if (!hubEl) return;
    const s = partner();
    if (!s) {
      hubEl.innerHTML = `<div class="b-top"><h1>Battle</h1></div><div class="panel b-empty"><p>You need a Sprout to battle.</p><p>Hatch your first egg in the Garden.</p><button class="btn primary b-goG">Go to the Garden</button></div>`;
      hubEl.querySelector('.b-goG').onclick = () => PS.ui.go('garden');
      hubSprite = null; return;
    }
    const X = extra();
    if (hubTab === 'legends') { let ch = false; for (const B of BOSSES) if (bossUnlocked(B) && !X.seen['boss:' + B.id]) { X.seen['boss:' + B.id] = true; ch = true; } if (ch) PS.save(); }
    if (hubTab === 'tower' && towerUnlocked() && !X.seen.tower) { X.seen.tower = true; PS.save(); }
    if (hubTab === 'wild') { let ch = false; for (const W of WILD.areas) if (wildOpen(W) && !X.seen['wild:' + W.id]) { X.seen['wild:' + W.id] = true; ch = true; } if (ch) PS.save(); }
    let h = `<div class="b-top"><h1>Battle</h1><span class="b-rec">${PS.S.totals.battleWins || 0} wins</span></div>
      <div class="b-tabs" role="tablist">${TABS.map(([id, label, ic]) => `<button class="b-tab" type="button" role="tab" data-tab="${id}" aria-selected="${hubTab === id}"><canvas class="px" data-icon="${ic}"></canvas>${label}${tabBadge(id) ? '<span class="dot">NEW</span>' : ''}</button>`).join('')}</div>`;
    if (hubTab !== 'friends') h += partnerHtml(s);
    h += hubTab === 'wild' ? wildHtml() : hubTab === 'legends' ? legendsHtml() : hubTab === 'tower' ? towerHtml() : hubTab === 'friends' ? friendsHtml() : leaguesHtml();
    hubEl.innerHTML = h;
    paintIcons(hubEl);
    hubEl.querySelectorAll('.b-tab').forEach(b => b.onclick = () => { if (hubTab === b.dataset.tab) return; sfx('tick'); hubTab = b.dataset.tab; renderHub(); hubEl.scrollTop = 0; });
    hubSprite = hubEl.querySelector('.b-psprite'); hubFrame = -1;
    if (hubSprite) {
      PS.ui.drawSproutTo(hubSprite, s);
      hubEl.querySelector('.b-change').onclick = () => { sfx('pop'); PS.ui.pickSprout({ title: 'Choose a fighter', eyebrow: 'Battle', extra: x => ST.movesOf(x).map(id => D.MOVES[id].name).join(', '), onPick: x => { ST.setActive(x.id); renderHub(); } }); };
    }
    if (hubTab === 'wild') bindWild(); else if (hubTab === 'legends') bindLegends(); else if (hubTab === 'tower') bindTower(); else if (hubTab === 'friends') bindFriends(); else bindLeagues();
  }
  function partnerHtml(s) {
    const fi = ST.formInfo(s), bs = ST.battleStats(s), mv = ST.movesOf(s), rec = s.record || {};
    return `<section class="panel b-partner"><div class="b-ph"><canvas class="px b-psprite" width="32" height="32"></canvas>
        <div><div class="label">Your fighter</div><div class="px-title b-pname">${esc(s.name)}</div><div class="b-pform">${esc(fi.name)} · Lv ${bs.level} · ${rec.battleWins || 0}–${(rec.battles || 0) - (rec.battleWins || 0)}</div>
        <div class="b-chips">${bs.els.map(chip).join('')}</div></div>
        <button class="btn b-change" type="button">Change</button></div>
        <div class="b-mlist">${mv.map(id => { const m = D.MOVES[id]; return `<div class="b-mrow" style="--c:${elColor(m.el)}"><canvas class="px" data-el="${m.el}"></canvas><b>${m.name}</b><small>${moveKind(m)} · ${esc(moveSource(s, id))}</small></div>`; }).join('')}</div>
        <p class="b-how">Moves come from its form (3) and its strongest animal (1). Evolve or bond with animals to change them.</p>
      </section>`;
  }
  function leaguesHtml() {
    const done = D.LEAGUES.filter(L => ST.leagueProgress(L.id).cleared).length, last = D.LEAGUES[D.LEAGUES.length - 1];
    let h = ST.leagueProgress(last.id).cleared
      ? `<div class="b-champ"><canvas class="px" data-icon="crown"></canvas><div><b>Grand Champion!</b><small>You cleared all ${D.LEAGUES.length} leagues. Rematch anyone to keep training!</small></div></div>`
      : `<p class="b-intro"><b>${done} of ${D.LEAGUES.length} leagues cleared.</b> Beat the ${esc(last.name)} to become the Grand Champion!</p>`;
    D.LEAGUES.forEach((L, li) => {
      const open = ST.leagueUnlocked(L.id), p = ST.leagueProgress(L.id), n = p.beaten.filter(Boolean).length;
      const nextI = p.beaten.findIndex(x => !x);
      const lockName = L.unlock ? (D.LEAGUES.find(x => x.id === L.unlock) || {}).name : '';
      h += `<section class="panel b-lg ${open ? '' : 'locked'}" data-li="${li}"><header><div><div class="px-title b-lname">${L.name}</div>
          <div class="b-lsub ${p.cleared ? 'done' : ''}">${p.cleared ? 'Cleared' : open ? `${n} of 3 beaten` : 'Locked'}</div></div>
          <div class="b-rw"><span><canvas class="px" data-coin="1"></canvas>${Math.round(prize('league', { L, index: 0 }, true).coins)} a win</span><span>Clear: <canvas class="px" data-coin="1"></canvas>${leagueClearCoins(L)} + <canvas class="px egg" data-egg="${eggKind(L.egg)}"></canvas></span></div></header>
        <div class="b-opps">${L.opponents.map((o, i) => {
          const can = open && (i === 0 || p.beaten[i - 1] || p.beaten[i]);
          const cls = p.beaten[i] ? 'beaten' : can && i === nextI ? 'next' : '';
          return `<button class="b-opp ${cls}" type="button" data-i="${i}" ${can ? '' : 'disabled'}><canvas class="px" width="32" height="32"></canvas><b>${esc(o.name)}</b><small>Lv ${ST.battleStats(leagueNPC(L.id, i)).level}</small>${p.beaten[i] ? '<canvas class="px b-tick" data-icon="tick"></canvas>' : ''}</button>`;
        }).join('')}</div>
        ${open ? '' : `<div class="b-lockline"><canvas class="px" data-icon="lock"></canvas>Clear the ${lockName} to unlock</div>`}
      </section>`;
    });
    return h;
  }
  function bindLeagues() {
    hubEl.querySelectorAll('.b-lg').forEach(sec => {
      const L = D.LEAGUES[+sec.dataset.li];
      sec.querySelectorAll('.b-opp').forEach(btn => {
        const i = +btn.dataset.i, npc = leagueNPC(L.id, i);
        safe(() => PS.ui.drawSproutTo(btn.querySelector('canvas'), ST.lookOf(npc), { eyes: 'brave' }));
        btn.onclick = () => { sfx('pop'); preview(L, i); };
      });
    });
  }
  function matchupHint(s, npc) {
    const me = ST.movesOf(s).map(id => D.MOVES[id]).filter(m => m.pow > 0), foeEls = ST.elementsOf(npc), myEls = ST.elementsOf(s);
    const good = me.filter(m => typeMult(m.el, foeEls) > 1).map(m => m.name);
    const threat = ST.movesOf(npc).map(id => D.MOVES[id]).filter(m => m.pow > 0 && typeMult(m.el, myEls) > 1).map(m => m.name);
    const bits = [];
    if (good.length) bits.push(`<b>${good.join(', ')}</b> ${good.length > 1 ? 'are' : 'is'} super effective.`);
    if (threat.length) bits.push(`Watch out for <b>${threat.join(', ')}</b>.`);
    return bits.join(' ') || 'No big type advantage either way.';
  }
  function preview(L, i) {
    const s = partner(); if (!s) return;
    const npc = leagueNPC(L.id, i), bs = ST.battleStats(npc), p = ST.leagueProgress(L.id);
    const coins = Math.round(prize('league', { L, index: i }, true).coins);
    PS.ui.modal({
      eyebrow: `${L.name} · ${i + 1} of 3`, title: npc.name, sprite: npc, pose: { eyes: 'brave', mouth: 'grin', arms: 'up' },
      html: `<p style="text-align:center;margin-top:-4px">${esc(ST.formInfo(npc).name)} · Lv ${bs.level}</p>
        <div class="chips-list" style="justify-content:center">${bs.els.map(chip).join('')}</div>
        ${oddsHtml(s, { kind: 'league', id: L.id, i })}
        <p><b>Moves:</b> ${ST.movesOf(npc).map(id => D.MOVES[id].name).join(', ')}</p>
        <p>${matchupHint(s, npc)}</p>
        <p>Win: <b>${coins} coins</b>${!p.cleared && p.beaten.filter(Boolean).length === 2 && !p.beaten[i] ? ` + league prize <b>${leagueClearCoins(L)} coins</b> and ${aOrAn(eggName(eggKind(L.egg)))} <b>${eggName(eggKind(L.egg))}</b>` : ''}.</p>
        ${snackRow()}`,
      buttons: [{ label: `Battle with ${s.name}!`, kind: 'go', onClick: () => { setTimeout(() => startBattle(L.id, i), 0); } }, { label: 'Not yet' }],
      mount(card) { paintIcons(card); bindSnacks(card); },
    });
  }

  // ---------------- snacks (pre-battle picker) ----------------
  const snackHeal = id => SNACK_HEAL[id] || TUNE.snackHeal;
  // The chosen snack, only while there is one left. Never swaps to a different fruit behind the player's back: if the
  // chosen fruit runs out it's "No snack" (and the choice comes back once they have that fruit again).
  function currentSnack() {
    const F = PS.S.fruits || {};
    if (snackSel === undefined) { // first time this session: the remembered choice; never chosen yet: a Heart Apple if there is one
      const pref = extra().snack;
      snackSel = pref === null ? null : pref && D.FRUITS[pref] ? pref : 'apple';
    }
    return snackSel && F[snackSel] > 0 && D.FRUITS[snackSel] ? snackSel : null;
  }
  function snackRow() {
    const F = PS.S.fruits || {}, list = Object.keys(F).filter(k => F[k] > 0 && D.FRUITS[k]);
    if (!list.length) return `<div class="b-snackrow"><div class="label">Battle snack</div><p class="b-snone">No fruit to bring. Pick fruit from the trees in the Garden!</p></div>`;
    const cur = currentSnack();
    return `<div class="b-snackrow"><div class="label">Bring a snack? <span>Eat it in battle to heal once</span></div><div class="b-snacks">
      <button class="b-sn ${!cur ? 'on' : ''}" type="button" data-sn="">None</button>
      ${list.map(k => `<button class="b-sn ${cur === k ? 'on' : ''}" type="button" data-sn="${k}" aria-label="${esc(D.FRUITS[k].name)}"><canvas class="px" data-fruit="${k}"></canvas><small>×${F[k]}</small></button>`).join('')}</div></div>`;
  }
  function bindSnacks(card) {
    card.querySelectorAll('.b-sn').forEach(btn => btn.onclick = () => {
      snackSel = btn.dataset.sn || null; extra().snack = snackSel; PS.save(); sfx('tick');
      card.querySelectorAll('.b-sn').forEach(x => x.classList.toggle('on', x === btn));
      if (snackSel) PS.ui.toast(`${D.FRUITS[snackSel].name}: heals ${Math.round(snackHeal(snackSel) * 100)}% once. Only used if you eat it.`, 2400);
    });
  }
  function snackFor(fruit) {
    if (!fruit || !(PS.S.fruits || {})[fruit] || !D.FRUITS[fruit]) return null;
    return { fruit, name: D.FRUITS[fruit].name, heal: snackHeal(fruit), cleanse: fruit === 'goldfruit', used: false };
  }

  // ---------------- Wild hub ----------------
  let wildArea = null;
  const wildOpen = W => !W.unlock || ST.leagueProgress(W.unlock).cleared;
  const wildRec = id => { const r = extra().wild.animals[id]; return Array.isArray(r) ? [0, 1, 2].map(i => +r[i] || 0) : [0, 0, 0]; };
  const wildNext = id => { const r = wildRec(id), i = r.findIndex(n => !n); return i < 0 ? 2 : i; };
  const areaStars = area => wildList(area).reduce((a, id) => a + wildRec(id).filter(Boolean).length, 0);
  const starsHtml = id => `<span class="b-stars">${wildRec(id).map(n => `<canvas class="px" data-icon="${n ? 'staron' : 'staroff'}"></canvas>`).join('')}</span>`;
  function wildHtml() {
    const X = extra();
    let W = WILD.areas.find(a => a.id === wildArea);
    if (!W || !wildOpen(W)) { W = WILD.areas.slice().reverse().find(wildOpen) || WILD.areas[0]; wildArea = W.id; }
    const tabs = WILD.areas.map(a => { const open = wildOpen(a), list = wildList(a.id), c = list[Math.min(list.length - 1, 4)];
      return `<button class="b-area ${a.id === W.id ? 'on' : ''} ${open ? '' : 'locked'}" type="button" data-area="${a.id}"><canvas class="px" data-critter="${c}" data-box="24"></canvas>${D.AREAS[a.id].name.replace(' Grove', '').replace(' Isle', '')}<small>${open ? `${areaStars(a.id)}/${list.length * 3}★` : 'Locked'}</small>${X.wild.areas[a.id] ? '<canvas class="px done" data-icon="tick"></canvas>' : ''}</button>`; }).join('');
    const list = wildRank(W.id); // easiest first, so levels climb across the grid
    const cards = list.map(id => { const A = D.ANIMALS[id], r = wildRec(id), n = wildNext(id), all = r[2] > 0;
      return `<button class="b-wc ${all ? 'done' : ''}" type="button" data-id="${id}"><canvas class="px" data-critter="${id}" data-box="24"></canvas><b>${esc(A.name)}</b>${starsHtml(id)}<small>${all ? 'Alpha beaten!' : `${WILD.steps[n].name} · Lv ${wildLv(id, n)}`}</small></button>`; }).join('');
    return `<p class="b-intro"><b>Wild Battles:</b> battle the real animals of each island! Beat the <b>Little</b> one, then the <b>Big</b> one, then the <b>Alpha</b>. The first time you beat an animal, it joins your pouch.</p>
      <div class="b-areas">${tabs}</div>
      <section class="panel b-lg"><header><div><div class="px-title b-lname">Wild ${D.AREAS[W.id].name}</div><div class="b-lsub ${X.wild.areas[W.id] ? 'done' : ''}">${X.wild.areas[W.id] ? 'Every Alpha beaten!' : `${areaStars(W.id)} of ${list.length * 3} stars`}</div></div>
        <div class="b-rw"><span>All Alphas: <canvas class="px egg" data-egg="${W.id}"></canvas></span></div></header>
        <div class="b-wgrid">${cards}</div></section>`;
  }
  function bindWild() {
    hubEl.querySelectorAll('.b-area').forEach(b => b.onclick = () => {
      const W = WILD.areas.find(a => a.id === b.dataset.area);
      if (!wildOpen(W)) { sfx('miss'); PS.ui.toast(`Clear the ${(D.LEAGUES.find(l => l.id === W.unlock) || {}).name} to unlock the Wild ${D.AREAS[W.id].name}.`, 2800); return; }
      if (wildArea === W.id) return; sfx('tick'); wildArea = W.id; renderHub();
    });
    hubEl.querySelectorAll('.b-wc').forEach(b => b.onclick = () => { sfx('pop'); previewWild(b.dataset.id); });
  }
  const WHERE_VERB = { land: 'hops out', air: 'swoops down', water: 'splashes up', coast: 'scuttles over' };
  function wildIntro(id, step) {
    const A = D.ANIMALS[id], v = WHERE_VERB[A.where] || 'appears';
    return step === 2 ? `The Alpha ${A.name} ${v}! It looks tough!` : step === 1 ? `A big wild ${A.name} ${v}!` : `A little wild ${A.name} ${v}!`;
  }
  function wildPrize(id, step) {
    const r = wildRec(id), L = wildLv(id, step), bits = [`<b>${Math.round(prize('wild', { wild: { id, step } }, true).coins)} coins</b>`];
    if (!r.some(Boolean)) bits.push(ST.canCatch() ? `the <b>${D.ANIMALS[id].name}</b> joins your pouch` : `bonus coins (your pouch is full, so it can't join)`);
    if (step === 2 && !r[2]) bits.push(`an <b>Alpha bonus</b> of ${alphaBonus(L)} coins`);
    return 'Win: ' + bits.join(' + ') + '.';
  }
  function previewWild(id) {
    const s = partner(); if (!s) return;
    const A = D.ANIMALS[id], r = wildRec(id); let step = wildNext(id);
    const html = () => {
      const f = makeWild(id, step);
      const good = ST.movesOf(s).map(m => D.MOVES[m]).filter(m => m.pow > 0 && typeMult(m.el, f.els) > 1).map(m => m.name);
      const threat = f.moves.map(m => D.MOVES[m]).filter(m => m.pow > 0 && typeMult(m.el, ST.elementsOf(s)) > 1).map(m => m.name);
      return `<p style="text-align:center;margin-top:-4px">${esc(A.blurb)}</p>
        <div class="chips-list" style="justify-content:center">${chip(A.el || 'normal')}</div>
        <div class="b-steps">${WILD.steps.map((S, i) => { const ok = i === 0 || r[i - 1] > 0; return `<button class="b-stp ${i === step ? 'on' : ''}" type="button" data-step="${i}" ${ok ? '' : 'disabled'}>${S.name}<small>${ok ? `Lv ${wildLv(id, i)}${r[i] ? ' · ★' : ''}` : `Beat ${WILD.steps[i - 1].name}`}</small></button>`; }).join('')}</div>
        ${oddsHtml(s, { kind: 'wild', id, step })}
        <p><b>Moves:</b> ${f.moves.map(m => D.MOVES[m].name).join(', ')}</p>
        ${good.length ? `<p><b>${good.join(', ')}</b> ${good.length > 1 ? 'are' : 'is'} super effective.</p>` : ''}${threat.length ? `<p>Watch out for <b>${threat.join(', ')}</b>.</p>` : ''}
        <p>${wildPrize(id, step)}</p>`;
    };
    PS.ui.modal({
      eyebrow: `Wild ${D.AREAS[A.area].name}`, title: `${A.name}`, sprite: critterBox(id, 32),
      html: `<div class="b-wprev">${html()}</div>${snackRow()}`,
      buttons: [{ label: `Battle!`, kind: 'go', onClick: () => { const st = step; setTimeout(() => startWild(id, st), 0); } }, { label: 'Not yet' }],
      mount(card) {
        const box = card.querySelector('.b-wprev');
        const bind = () => { paintIcons(box); box.querySelectorAll('.b-stp').forEach(b => b.onclick = () => { step = +b.dataset.step; sfx('tick'); box.innerHTML = html(); bind(); }); };
        paintIcons(card); bind(); bindSnacks(card);
      },
    });
  }

  // ---------------- Legends hub ----------------
  const THEME_CARD = { snow: ['#9fc4e8', '#5a78b0'], peak: ['#639bff', '#3f55b8'], jungle: ['#f5a86a', '#4f7a2a'], abyss: ['#34406e', '#141a30'], sunfire: ['#f6b04a', '#c8401e'], volcano: ['#a8321e', '#2a0f1e'] };
  function legendsHtml() {
    const cards = BOSSES.map(B => {
      const open = bossUnlocked(B), r = bossRec(B.id), [c1, c2] = THEME_CARD[B.area] || ['#8c93a8', '#595a70'];
      const prize = B.egg ? `<canvas class="px" data-egg="${B.egg}" style="width:12px;height:14px"></canvas>` : '<canvas class="px" data-icon="crown"></canvas>';
      const status = !open ? `<div class="lk">${unlockText(B)}</div>`
        : r.wins ? `<span class="st win"><canvas class="px" data-icon="tick"></canvas>Beaten${r.wins > 1 ? ' ×' + r.wins : ''}</span>`
          : `<span class="st new">Win: ${prize}${B.egg ? 'Egg!' : 'Joins you!'}</span>`;
      return `<button class="b-leg ${open ? '' : 'locked'}" type="button" data-boss="${B.id}" style="--c1:${c1};--c2:${c2}" ${open ? '' : 'aria-disabled="true"'}>
        <canvas class="px big" data-critter="${B.id}"></canvas><b>${B.name}</b><span class="t">${B.title}</span>
        ${open ? `<span class="t">Best for Lv ${B.rec}+</span>` : ''}${status}</button>`;
    }).join('');
    return `<p class="b-intro"><b>Legend Challenges:</b> giant creatures with huge HP. When a Legend <b>charges up</b>, use a Guard, Heal or Boost move to block its giant attack!</p><div class="b-legs">${cards}</div>`;
  }
  function bindLegends() {
    hubEl.querySelectorAll('.b-leg').forEach(btn => btn.onclick = () => {
      const B = BOSS[btn.dataset.boss];
      if (!bossUnlocked(B)) { sfx('miss'); PS.ui.toast(unlockText(B) + '.'); return; }
      sfx('pop'); previewBoss(B);
    });
  }
  function previewBoss(B) {
    const s = partner(); if (!s) return;
    const r = bossRec(B.id), f = makeBoss(B.id), coins = Math.round(prize('boss', { boss: B }, true).coins);
    const win = !r.wins ? (B.egg ? `${aOrAn(eggName(B.egg))} <b>${eggName(B.egg)}</b> + <b>${coins} coins</b>` : `the <b>${B.name}</b> joins you (${D.RARES[B.id] ? 'a rare creature for your Sprouts' : 'a friend'}) + <b>${coins} coins</b>`) : `<b>${coins} coins</b>`;
    const threat = B.moves.concat(B.sup.move).map(id => D.MOVES[id]).filter(m => m.pow > 0 && typeMult(m.el, ST.elementsOf(s)) > 1).map(m => m.name);
    const good = ST.movesOf(s).map(id => D.MOVES[id]).filter(m => m.pow > 0 && typeMult(m.el, B.els) > 1).map(m => m.name);
    PS.ui.modal({
      eyebrow: 'Legend Challenge', title: `${B.name}, ${B.title}`, sprite: critterBox(B.id, 32),
      html: `<p style="text-align:center;margin-top:-4px">${esc(B.blurb)}</p>
        <div class="b-mini"><span>HP ${f.max}</span><span>Best for Lv ${B.rec}+</span>${r.tries ? `<span>Won ${r.wins} of ${r.tries}</span>` : ''}</div>
        <div class="chips-list" style="justify-content:center">${B.els.map(chip).join('')}</div>
        ${oddsHtml(s, { kind: 'boss', id: B.id })}
        <p><b>Giant attack:</b> every ${B.calm + 2}${B.calm + 2 === 3 ? 'rd' : 'th'} turn it charges up, then uses <b>${B.sup.name}</b>. When you see the warning, pick a move with a yellow <b>BLOCK</b> tag (Guard, Heal or Boost) or eat your snack!</p>
        ${B.revive ? `<p><b>Rebirth:</b> the first time it faints, it comes back with ${Math.round(B.revive * 100)}% HP.</p>` : ''}
        <p><b>Moves:</b> ${B.moves.map(id => D.MOVES[id].name).join(', ')}</p>
        ${good.length ? `<p><b>${good.join(', ')}</b> ${good.length > 1 ? 'are' : 'is'} super effective.</p>` : ''}${threat.length ? `<p>Watch out: <b>${threat.join(', ')}</b> is strong against ${esc(s.name)}.</p>` : ''}
        <p>Win: ${win}.</p>${snackRow()}`,
      buttons: [{ label: `Challenge with ${s.name}!`, kind: 'go', onClick: () => { setTimeout(() => startBoss(B.id), 0); } }, { label: 'Not yet' }],
      mount(card) { paintIcons(card); bindSnacks(card); },
    });
  }

  // ---------------- Tower hub ----------------
  const towerRun = () => { const run = extra().tower.run; return run && typeof run === 'object' ? run : null; };
  function treatFor(f) {
    if (f % 5) return null;
    if (f === 5) return { kind: 'fruit', text: '2 power fruits', icon: 'powernut' };
    if (f === 10) return { kind: 'bag', text: 'Big coin bag' };
    if (f === 15) return { kind: 'gold', text: 'Golden Fruit', icon: 'goldfruit' };
    if (f % 10 === 0) return { kind: 'egg', text: `Coin bag + ${f >= 40 ? 35 : f >= 30 ? 30 : 25}% egg chance`, egg: f >= 40 ? 'rainbow' : 'golden', chance: f >= 40 ? 0.35 : f >= 30 ? 0.3 : 0.25 };
    return { kind: 'gold2', text: 'Golden Fruit + 2 fruits', icon: 'goldfruit' };
  }
  function treatIcon(t) {
    if (!t) return '';
    if (t.kind === 'bag') return '<canvas class="px" data-coin="big"></canvas>';
    if (t.kind === 'egg') return `<canvas class="px egg" data-egg="${t.egg}"></canvas>`;
    return `<canvas class="px" data-fruit="${t.icon}"></canvas>`;
  }
  function towerHtml() {
    const T = extra().tower, run = towerRun(), open = towerUnlocked();
    const rs = run ? ST.get(run.sid) : null;
    const nextTreat = [5, 10, 15, 20, 25, 30, 40].find(f => f > (run ? run.floor - 1 : 0)) || 50;
    let h = `<section class="panel b-tw-p"><div class="b-tw"><canvas class="px art" data-icon="towerart"></canvas><div>
      <h2>Battle Tower</h2><span class="best"><canvas class="px" data-icon="crown" style="width:16px;height:16px"></canvas>Best: ${T.best ? 'Floor ' + T.best : 'none yet'}</span>
      <p>Beat one Sprout after another, higher and higher! You heal a little between floors. Stop any time to take your prize bag.</p></div></div>`;
    if (!open) {
      h += `<div class="b-lockline"><canvas class="px" data-icon="lock"></canvas>Clear the ${(D.LEAGUES.find(l => l.id === TOWER.unlock) || {}).name} to unlock</div></section>`;
      return h;
    }
    if (run && rs) {
      const info = `${esc(rs.name)} · HP ${Math.round(run.hp * 100)}% · Prize bag: ${run.pot} coins${run.snack && !run.snackUsed && snackFor(run.snack) ? ` · Snack: ${esc(D.FRUITS[run.snack].name)}` : ' · No snack'}`;
      h += towerPaused(run)
        ? `<div class="b-runbox paused"><canvas class="px b-runsp" width="32" height="32"></canvas><div><b>Floor ${run.floor}: battle paused</b>
          <small>${info}</small><small>Finish this floor first. Then you can stop and take the bag.</small></div></div>
          <div class="b-btns"><button class="btn wide go b-tcont" type="button">Back to Floor ${run.floor}!</button></div>`
        : `<div class="b-runbox"><canvas class="px b-runsp" width="32" height="32"></canvas><div><b>Floor ${run.floor} next</b>
          <small>${info}</small></div></div>
          <div class="b-btns"><button class="btn wide go b-tcont" type="button">Climb to Floor ${run.floor}!</button><button class="btn wide b-tstop" type="button">Stop and take ${run.pot} coins</button></div>`;
    } else {
      h += `<div class="b-btns"><button class="btn wide go b-tstart" type="button">Start climbing!</button></div>`;
    }
    h += `<div class="label" style="margin-top:12px">Treats every 5 floors</div><div class="b-treats">${[5, 10, 15, 20, 30].map(f => { const t = treatFor(f); return `<div class="b-treat"><b>Floor ${f}${f === 30 ? '+' : ''}</b>${treatIcon(t)}${t.text}${f === nextTreat ? ' <span style="margin-left:auto;color:var(--accent)">next!</span>' : ''}</div>`; }).join('')}</div>
      <p class="b-how">Floor coins go in your prize bag. If your Sprout faints, you keep half the bag.</p></section>`;
    return h;
  }
  function bindTower() {
    const art = hubEl.querySelector('canvas[data-icon="towerart"]'); if (art) { const c = towerPic(); art.width = c.width; art.height = c.height; PS.ui.paint(art, c); }
    const run = towerRun(), rs = run ? ST.get(run.sid) : null;
    if (run && !rs) { const pay = towerEnd(towerPaused(run) ? 'lost' : 'stop'); PS.ui.toast(`Your tower climber left, so the climb ended.${pay ? ` You got ${pay} coins.` : ''}`); renderHub(); return; }
    const sp = hubEl.querySelector('.b-runsp'); if (sp && rs) PS.ui.drawSproutTo(sp, rs, { eyes: 'brave' });
    const st = hubEl.querySelector('.b-tstart');
    if (st) st.onclick = () => { sfx('pop'); previewTower(); };
    const ct = hubEl.querySelector('.b-tcont');
    if (ct) ct.onclick = () => { sfx('pop'); startTowerFloor(); };
    const sb = hubEl.querySelector('.b-tstop');
    if (sb) sb.onclick = () => { sfx('pop'); const pot = towerEnd('stop'); sfx('level'); PS.ui.toast(`You took ${pot} coins home!`); renderHub(); };
  }
  function previewTower() {
    const s = partner(); if (!s) return;
    PS.ui.modal({
      eyebrow: 'Battle Tower', title: `Climb with ${esc(s.name)}?`, sprite: s, pose: { eyes: 'brave', mouth: 'grin', arms: 'up' },
      html: `<p>Each floor has a stronger Sprout. HP carries over and ${esc(s.name)} heals ${Math.round(TOWER.heal * 100)}% after each win.</p>
        <p>Floor 1 is Lv ${TOWER.lv(1)}, floor 10 is Lv ${TOWER.lv(10)}. You can bring one snack for the whole climb.</p>${snackRow()}`,
      buttons: [{ label: 'Start climbing!', kind: 'go', onClick: () => { setTimeout(() => { towerBegin(s); startTowerFloor(); }, 0); } }, { label: 'Not yet' }],
      mount(card) { paintIcons(card); bindSnacks(card); },
    });
  }
  function towerBegin(s) {
    const T = extra().tower;
    T.run = { sid: s.id, floor: 1, hp: 1, pot: 0, seed: Math.floor(Math.random() * 1e6), snack: currentSnack() || null, snackUsed: false, started: Date.now() };
    T.runs = (T.runs || 0) + 1; PS.save();
  }
  // end the current run: 'stop' pays the whole bag, 'lost' pays half. Returns coins paid.
  function towerEnd(how) {
    const T = extra().tower, run = towerRun(); if (!run) return 0;
    const pay = how === 'lost' ? Math.round(run.pot / 2) : run.pot;
    T.run = null; PS.save();
    if (pay) ST.addCoins(pay, 'tower');
    return pay;
  }
  // run.fighting = the floor being fought right now: set when a floor starts, deleted when it is won (losing ends the run).
  // The climber's HP is saved to run.hp after every round (and run.snackUsed when the snack is eaten). If fighting is still
  // set while no Tower battle is on, the game was closed mid-floor (iOS may do that on its own): the climb is paused there,
  // nothing is lost, and the only way on is to fight that floor again from the saved HP (the opponent starts fresh).
  // The bag can't be taken until that floor is finished, so closing the app never beats the half-the-bag rule.
  const towerPaused = run => !!(run && run.fighting && !(V && V.mode === 'tower'));

  // ---------------- Friends hub ----------------
  function friendsHtml() {
    const others = otherPlayers(), F = extra().friend, left = F.day === today() ? Math.max(0, FRIEND.perDay - (F.paid || 0)) : FRIEND.perDay;
    return `<section class="panel b-fr"><h2>Friend Battle</h2><div class="vs"><canvas class="px b-fa" width="32" height="32"></canvas><b>VS</b><canvas class="px b-fb" width="32" height="32"></canvas></div>
      <p>Two players, one phone! Each player secretly picks a move, then passes the phone.</p>
      <ol><li>Pick your Sprout.</li><li>Pick ${others.length ? "a friend's Sprout (from another player on this phone) or another of yours" : 'another of your Sprouts for your friend'}.</li><li>Take turns. No peeking!</li></ol>
      <div class="b-btns"><button class="btn wide go b-fstart" type="button">Start a friend battle</button></div>
      <p class="b-how" style="text-align:center">Just for fun: nobody's Sprouts lose anything. ${left ? `You get a few coins for playing (${left} more today).` : 'No more coins today, but you can keep playing!'}</p></section>`;
  }
  function otherPlayers() {
    const cur = safe(() => PS.players.current(), null), list = safe(() => PS.players.list(), []) || [];
    return list.filter(p => !cur || p.id !== cur.id);
  }
  function bindFriends() {
    const s = partner(), a = hubEl.querySelector('.b-fa'), b = hubEl.querySelector('.b-fb');
    if (a && s) PS.ui.drawSproutTo(a, s, { eyes: 'brave', arms: 'up', mouth: 'grin' });
    if (b) { const L = PX.cloneLook(PX.DEFAULT_LOOK); L.body = 'rose'; b.width = 32; b.height = 32; const c = PX.sprig(L, { eyes: 'brave', arms: 'up', mouth: 'grin' }); const x = b.getContext('2d'); x.save(); x.translate(32, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); x.restore(); }
    const st = hubEl.querySelector('.b-fstart'); if (st) st.onclick = () => { sfx('pop'); friendSetup(); };
  }
  // a list modal like PS.ui.pickSprout but for any items. items: [{name, sub, draw(canvas), onPick, disabled}]
  function pickList(opts) {
    PS.ui.modal({
      eyebrow: opts.eyebrow || '', title: opts.title, html: (opts.note ? `<p>${opts.note}</p>` : '') + '<div class="pick-list"></div>', buttons: [{ label: opts.cancel || 'Cancel' }],
      mount(card, close) {
        const box = card.querySelector('.pick-list');
        for (const it of opts.items) {
          const b = document.createElement('button'); b.className = 'pick-item'; b.type = 'button'; if (it.disabled) b.disabled = true;
          b.innerHTML = `<canvas class="px" width="32" height="32"></canvas><span><b>${esc(it.name)}</b>${it.sub ? `<small>${it.sub}</small>` : ''}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}`;
          safe(() => it.draw(b.querySelector('canvas')));
          b.onclick = () => { close(); setTimeout(() => it.onPick(), 0); };
          box.appendChild(b);
        }
      },
    });
  }
  const sproutSub = s => `${esc(ST.formInfo(s).name)} · Lv ${ST.totalLevels(s)}`;
  function friendSetup() {
    const mine = PS.S.sprouts;
    if (!mine.length) { PS.ui.toast('Hatch a Sprout first!'); return; }
    const me = safe(() => PS.players.current(), null), meName = me && me.name ? me.name : 'Player 1';
    pickList({
      eyebrow: 'Friend Battle · Step 1', title: `${esc(meName)}, pick your Sprout`,
      items: mine.slice().sort((a, b) => (b.id === PS.S.activeId) - (a.id === PS.S.activeId) || ST.totalLevels(b) - ST.totalLevels(a))
        .map(s => ({ name: s.name, sub: sproutSub(s), tag: s.id === PS.S.activeId ? 'Partner' : '', draw: c => PS.ui.drawSproutTo(c, s), onPick: () => friendPickFoe(s, meName) })),
    });
  }
  function friendPickFoe(sA, meName) {
    const others = otherPlayers();
    const items = others.map(p => {
      const list = safe(() => PS.players.sproutsOf(p.id), []) || [];
      const top = list[0];
      return { name: p.name, sub: list.length ? `${list.length} Sprout${list.length > 1 ? 's' : ''}` : 'No Sprouts yet', disabled: !list.length,
        draw: c => { if (top) PS.ui.drawSproutTo(c, top); }, onPick: () => friendPickFoeSprout(sA, meName, p.name, list) };
    });
    items.push({ name: 'Two of my Sprouts', sub: 'Your friend borrows one of yours', draw: c => { const s = PS.S.sprouts.find(x => x.id !== sA.id) || sA; PS.ui.drawSproutTo(c, s); },
      onPick: () => friendPickFoeSprout(sA, meName, 'Player 2', PS.S.sprouts, true) });
    if (!others.length) { friendPickFoeSprout(sA, meName, 'Player 2', PS.S.sprouts, true); return; }
    pickList({ eyebrow: 'Friend Battle · Step 2', title: 'Who is your friend?', note: 'Pick another player on this phone.', items });
  }
  function friendPickFoeSprout(sA, meName, foeName, list, own) {
    pickList({
      eyebrow: 'Friend Battle · Step ' + (own && !otherPlayers().length ? 2 : 3), title: own ? 'Pick a Sprout for your friend' : `${esc(foeName)}, pick your Sprout`,
      note: own ? 'Your friend will play with this one.' : '',
      items: list.map(s => ({ name: s.name, sub: sproutSub(s) + (s.id === sA.id && own ? ' · mirror match!' : ''), draw: c => PS.ui.drawSproutTo(c, s), onPick: () => startFriend(sA, s, meName, foeName, !!own) })),
    });
  }

  // ---------------- battle start ----------------
  function launch(cfg) {
    PS.ui.closeModal && PS.ui.closeModal();
    PS.ui.hold(true); PS.ui.chrome(false);
    hubEl.hidden = true; fightEl.hidden = false; resEl.hidden = true; passEl.hidden = true;
    const b = cfg.b;
    V = Object.assign({
      phase: 'intro', t: 0, fast: false, queue: [], step: null, done: false, granted: false, res: null, spec: null,
      disp: snap(b), hpShown: { p: b.p.hp, o: b.o.hp }, parts: [], pops: [], rings: [], beams: [], amb: [], clouds: [], crowd: [],
      a: { p: fresh(), o: fresh() }, log: { full: '', shown: 0, drawn: -1, drawnFull: null }, lastMove: null, quake: 0, quakeA: 0, flashT: 0, flashA: 0.7, flashC: '#ffffff', banner: null, bolt: null, boltT: 3 + Math.random() * 4,
    }, cfg);
    V.a.p.enter = 1; V.a.o.enter = 1; V.seed = Math.floor(Math.random() * 1e9);
    for (let i = 0; i < 4; i++) V.clouds.push({ x: Math.random() * 140 - 20, y: 2 + Math.random() * 16, k: i % 3, v: 1.5 + Math.random() * 2 });
    fightEl.classList.toggle('boss', !!V.boss);
    resize(); bgKey = -1;
    makeCrowd();
    renderPlates(true); renderMoves(); setInfo(null); renderSnack();
    runBtn.textContent = V.mode === 'friend' ? 'End battle' : 'Give up'; runBtn.classList.remove('armed'); runBtn.hidden = false;
    queue(cfg.intro);
    sfx('go');
    resize(true); render(); // draw the new scene now, so the previous battle's last frame never flashes up
  }
  // Every battle is built by foeBattle() from a spec, the same way the pre-battle estimates build theirs.
  function startBattle(leagueId, index) {
    const s = partner(); if (!s) return;
    const li = D.LEAGUES.findIndex(l => l.id === leagueId), L = D.LEAGUES[li];
    const npc = leagueNPC(leagueId, index), spec = { kind: 'league', id: leagueId, i: index };
    const b = foeBattle(s, Object.assign({ npc }, spec));
    b.p.snack = snackFor(currentSnack());
    launch({ mode: 'league', b, L, li, index, s, npc, spec, area: LEAGUE_AREA[leagueId] || npc.area || 'meadow',
      intro: [{ kind: 'intro', text: `${npc.name} of the ${L.name} wants to battle!`, dur: 1.4 }, { kind: 'go', text: `Go, ${s.name}!`, dur: 0.9 }] });
  }
  function startBoss(id) {
    const s = partner(), B = BOSS[id]; if (!s || !B || !bossUnlocked(B)) return;
    const spec = { kind: 'boss', id }, b = foeBattle(s, spec);
    b.p.snack = snackFor(currentSnack());
    const X = extra(); X.bosses[id] = Object.assign(bossRec(id), { tries: bossRec(id).tries + 1 }); PS.save();
    launch({ mode: 'boss', b, s, boss: B, spec, area: B.area,
      intro: [{ kind: 'bossin', text: `A wild legend appears: ${B.name}, ${B.title}!`, dur: 2.2 }, { kind: 'go', text: `Be brave, ${s.name}!`, dur: 0.9 }] });
  }
  function startWild(id, step) {
    const s = partner(), A = D.ANIMALS[id]; if (!s || !A) return;
    const spec = { kind: 'wild', id, step }, b = foeBattle(s, spec);
    b.p.snack = snackFor(currentSnack());
    launch({ mode: 'wild', b, s, wild: { id, step }, spec, area: D.AREAS[A.area] ? A.area : 'meadow',
      intro: [{ kind: 'wildin', text: wildIntro(id, step), dur: 1.6 }, { kind: 'go', text: `Go, ${s.name}!`, dur: 0.8 }] });
  }
  function startTowerFloor() {
    const run = towerRun(); if (!run) return;
    const s = ST.get(run.sid); if (!s) { towerEnd('stop'); renderHub(); return; }
    const f = run.floor, npc = towerNPC(run.seed, f), spec = { kind: 'tower', seed: run.seed, floor: f, hp: run.hp };
    const b = foeBattle(s, Object.assign({ npc }, spec)); // starts from run.hp (after a pause: the HP saved in the last round)
    if (run.snack && !run.snackUsed) b.p.snack = snackFor(run.snack);
    const resumed = run.fighting === f;
    run.fighting = f; PS.save(); // deleted when this floor is won; still set after a restart = the climb is paused here (towerPaused)
    const star = f % 5 === 0;
    launch({ mode: 'tower', b, s, npc, floor: f, run, spec, area: 'tower',
      intro: [{ kind: 'floor', text: resumed ? `Floor ${f}: back to the battle with ${npc.name}!` : star ? `Floor ${f}: a star challenger, ${npc.name}!` : `Floor ${f}: ${npc.name} is waiting!`, dur: 1.5 }, { kind: 'go', text: `Go, ${s.name}!`, dur: 0.8 }] });
  }
  function startFriend(sA, sB, nameA, nameB, own) {
    const b = newBattle(sA, sB, { smart: 0, friend: true });
    if (b.o.name === b.p.name) b.o.name = b.o.name + ' 2';
    const area = D.AREAS[sA.area] ? sA.area : 'meadow';
    launch({ mode: 'friend', b, s: sA, sB, own, area, fr: { names: { p: nameA, o: nameB }, turn: 'p', picks: {} },
      intro: [{ kind: 'intro', text: `${nameA}'s ${b.p.name} vs ${nameB}'s ${b.o.name}!`, dur: 1.6 }, { kind: 'go', text: 'Ready? Fight!', dur: 0.8 }] });
  }
  const fresh = () => ({ lunge: 0, hop: 0, shake: 0, flash: 0, alpha: 1, drop: 0, pose: null, poseT: 0, emote: null, emoteT: 0, enter: 0, dodge: 0, charge: 0, blinkAt: 2 + Math.random() * 3 });

  // Only call from frame() (a render follows right away, so a resized canvas is never shown blank).
  // The picture is frozen while the results card is up: showing the HUD again shrinks the arena, and re-laying out
  // the scene behind the card looked like a glitch. The canvas has an exact CSS size, so a smaller arena just crops it.
  function resize(force) {
    if (!arenaEl) return;
    if (!force && cssW && V && V.phase === 'results') return;
    const r = arenaEl.getBoundingClientRect(); if (!r.width || !r.height) return;
    const d = clamp(window.devicePixelRatio || 1, 1, 3);
    if (!force && Math.abs(r.width - cssW) < 0.5 && Math.abs(r.height - cssH) < 0.5 && d === dpr) return;
    cssW = r.width; cssH = r.height; dpr = d;
    PXS = clamp(Math.round(cssW / 125), 3, 5); // smaller pixels = more detail
    while (PXS > 3 && cssH / PXS < 96) PXS--;
    SC = Math.max(1, Math.round(PXS * dpr)); WPX = SC / dpr;
    cv.width = Math.ceil(cssW * dpr); cv.height = Math.ceil(cssH * dpr);
    cv.style.width = cv.width / dpr + 'px'; cv.style.height = cv.height / dpr + 'px'; // 1 canvas pixel = 1 device pixel (no resampling)
    WW = Math.ceil(cv.width / SC); WH = Math.ceil(cv.height / SC);
    lo.width = WW; lo.height = WH; bgC.width = WW; bgC.height = WH; bgKey = -1;
    if (V) makeCrowd();
  }
  // fighter feet positions (world px)
  const HY = () => Math.round(WH * 0.38);
  const bossScale = () => (WW >= 110 && WH >= 150 ? 3 : 2);
  function spot(side) {
    if (side === 'o' && V && V.boss) return { x: Math.round(WW * 0.66), y: Math.round(clamp(WH * 0.62, HY() + 34, WH - 58)) };
    return side === 'o' ? { x: Math.round(WW * 0.71), y: Math.round(clamp(WH * 0.53, HY() + 16, WH - 50)) } : { x: Math.round(WW * 0.29), y: Math.round(WH - Math.max(10, WH * 0.1)) };
  }
  const critScale = () => (V && V.boss ? bossScale() : V && V.wild ? WILD.steps[V.wild.step].scale : 1);
  const fighterH = side => (side === 'o' && V && V.boss ? Math.round(22 * bossScale()) : side === 'o' && V && V.wild ? Math.round(15 * critScale()) : 24);
  const topOf = side => { const s = spot(side); return { x: s.x, y: s.y - Math.round(fighterH(side) * 0.62) }; };

  // ---------------- plates & moves ----------------
  const STAGE_KEYS = ['atk', 'def', 'spd', 'eva', 'acc'];
  function renderPlates(full) {
    for (const side of SIDES) {
      const f = V.b[side], d = V.disp[side], el = plateEls[side];
      if (full || !el.firstChild) {
        const boss = side === 'o' && V.boss;
        el.className = 'b-plate ' + side + (boss ? ' boss' : '');
        // element icons next to the name, so kids can see the types at a glance
        const els = f.els.map(e => `<canvas class="px" data-el="${e}" role="img" aria-label="${elLabel(e)}"></canvas>`).join('');
        el.innerHTML = `${V.mode === 'friend' ? `<div class="b-own">${esc(V.fr.names[side])}'s</div>` : ''}<div class="b-prow"><b>${esc(f.name)}${boss ? ` <small class="b-sub">${esc(V.boss.title)}</small>` : ''}</b><span class="b-pels">${els}</span><span class="b-lv">${boss ? 'Legend · ' : V.mode === 'tower' && side === 'o' ? `Floor ${V.floor} · ` : ''}Lv ${f.lv}</span></div>
          <div class="b-hp"><em>HP</em><div class="b-hpbar"><i></i></div></div>
          <div class="b-prow2"><span class="b-hpn"></span><span class="b-tags"></span></div>`;
        paintIcons(el);
        el._bar = el.querySelector('.b-hpbar i'); el._n = el.querySelector('.b-hpn'); el._tags = el.querySelector('.b-tags'); el._last = ''; el._hs = null;
      }
      let tags = '';
      if (d.charging) tags += '<span class="b-tag charge">Charging!</span>';
      if (V.disp.tired) tags += '<span class="b-tag tired">Tired</span>';
      if (d.status) tags += `<span class="b-tag ${d.status}">${STATUS_SHORT[d.status]}</span>`;
      if (d.stun) tags += '<span class="b-tag stun">Stunned</span>';
      for (const k of STAGE_KEYS) {
        const n = k === 'atk' && d.status === 'burn' ? clamp(d.st.atk - 1, -3, 3) : d.st[k]; // a burn makes attacks weaker: show it
        if (n) tags += `<span class="b-tag ${n > 0 ? 'up' : 'down'}">${STAT_SHORT[k]}${n > 0 ? '&#9650;' : '&#9660;'}${Math.abs(n)}</span>`;
      }
      if (tags !== el._last) { el._tags.innerHTML = tags; el._last = tags; }
    }
    const warn = !!(V.boss && V.disp.o.charging && V.phase !== 'end' && V.phase !== 'results');
    if (warn && warnEl.hidden) { warnEl.innerHTML = `<b>${esc(V.boss.warn)}</b><span>Pick a move with a yellow BLOCK tag${V.b.p.snack && !V.b.p.snack.used ? ', or eat your snack' : ''}!</span>`; }
    warnEl.hidden = !warn;
    snackBtn.style.bottom = plateEls.p.offsetHeight + 22 + 'px'; // always just above the player's plate
    if (V.boss) { // keep Give up and the warning just under the boss plate, whatever its height
      const pb = plateEls.o.offsetTop + plateEls.o.offsetHeight;
      if (pb > 20) { runBtn.style.top = pb + 6 + 'px'; warnEl.style.top = pb + 44 + 'px'; }
    } else { runBtn.style.top = ''; warnEl.style.top = ''; }
    updateBars();
  }
  function updateBars() { // runs every frame: only touches the DOM when the shown HP really changes
    for (const side of SIDES) {
      const f = V.b[side], el = plateEls[side]; if (!el._bar) continue;
      const hs = Math.round(V.hpShown[side] * 4); if (el._hs === hs) continue; el._hs = hs;
      const k = clamp(V.hpShown[side] / f.max, 0, 1);
      el._bar.style.width = (k * 100).toFixed(1) + '%'; el._bar.className = k > 0.5 ? '' : k > 0.2 ? 'mid' : 'low';
      const t = `${Math.max(0, Math.round(V.hpShown[side]))} / ${f.max}`; if (el._n.textContent !== t) el._n.textContent = t;
    }
  }
  const chooser = () => (V.mode === 'friend' ? V.fr.turn : 'p');
  function renderMoves() {
    const side = chooser(), f = V.b[side], foe = f.foe;
    const bracing = foe.boss && foe.charging;
    movesEl.innerHTML = '';
    f.moves.forEach(id => {
      const m = D.MOVES[id], tm = m.pow > 0 ? typeMult(m.el, foe.els) : 1, br = bracing && isBrace(id);
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'b-mv' + (br ? ' brace' : ''); btn.style.setProperty('--c', elColor(m.el));
      const used = m.fx.once && f.used[id];
      btn.innerHTML = `<canvas class="px" data-el="${m.el}"></canvas><span class="n${m.name.length > 13 ? ' sm' : ''}">${m.name}</span><span class="d">${used ? 'Used up' : `${elLabel(m.el)} · ${moveKind(m)}`}</span>${br ? '<span class="eff brace">BLOCK</span>' : ''}${tm > 1 ? '<span class="eff good">Strong!</span>' : tm < 1 ? '<span class="eff bad">Weak</span>' : ''}`;
      if (used) btn.disabled = true;
      let timer = 0, long = false;
      btn.addEventListener('pointerdown', () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; setInfo(id); PX.buzz && PX.buzz(8); }, 380); });
      const cancel = () => clearTimeout(timer);
      btn.addEventListener('pointerup', cancel); btn.addEventListener('pointerleave', cancel); btn.addEventListener('pointercancel', cancel);
      btn.addEventListener('contextmenu', e => e.preventDefault());
      btn.addEventListener('mouseenter', () => setInfo(id));
      btn.addEventListener('focus', () => setInfo(id));
      btn.addEventListener('click', () => { if (long) { long = false; return; } choose(id); });
      movesEl.appendChild(btn);
    });
    paintIcons(movesEl);
    movesEl.classList.toggle('wait', V.phase !== 'choose');
    renderSnack();
  }
  function renderSnack() {
    const f = V && V.b[chooser()], sn = f && f.snack;
    snackBtn.hidden = !sn || sn.used;
    if (snackBtn.hidden) return;
    const c = snackBtn.querySelector('canvas'), s = safe(() => PX.item('fruit', sn.fruit), null);
    if (s && c.dataset.f !== sn.fruit) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); c.dataset.f = sn.fruit; }
    snackBtn.disabled = V.phase !== 'choose';
    snackBtn.classList.toggle('brace', !!(f.foe.boss && f.foe.charging && V.phase === 'choose'));
    snackBtn.setAttribute('aria-label', `Eat snack: ${sn.name}`);
  }
  function setInfo(id) {
    infoEl.classList.remove('long');
    if (!id) {
      infoEl.innerHTML = V && V.mode === 'friend' && V.phase === 'choose' ? `<b>${esc(V.fr.names[V.fr.turn])}'s turn.</b> Hold a move to read what it does.`
        : V && V.lastMove ? '' : 'Tap a move to use it. Hold a move to read what it does.';
      return;
    }
    const m = D.MOVES[id], fx = m.fx, bits = [];
    if (m.pow > 0) bits.push(`Power ${m.pow}${fx.hits ? ` × ${fx.hits} hits` : ''}`);
    if (m.pow > 0 || fx.debuff || fx.status) bits.push(SURE.has(id) ? 'Never misses' : `Aim ${Math.round(m.acc * 100)}%`);
    if (fx.first) bits.push('Goes first');
    if (fx.heal && V && V.b[chooser()].heals) bits.push('Heals less each time');
    if (V && V.boss && isBrace(id)) bits.push('Blocks giant attacks');
    infoEl.innerHTML = `<b>${m.name}</b> (${elLabel(m.el)}): ${esc(kidWords(m.desc))} <span>${bits.join(' · ')}</span>`;
    infoEl.classList.toggle('long', infoEl.textContent.length > 92);
  }

  // ---------------- turn flow ----------------
  function choose(id) {
    if (!V || V.phase !== 'choose') return;
    const side = chooser(), f = V.b[side]; if (!usable(f, id)) return;
    sfx('pop');
    V.lastMove = id;
    if (V.mode === 'friend') {
      V.fr.picks[side] = id;
      if (side === 'p') { V.fr.turn = 'o'; showPass('o'); return; }
      resolveNow(V.fr.picks.p, V.fr.picks.o); V.fr.picks = {}; V.fr.turn = 'p';
      return;
    }
    resolveNow(id, aiChoose(V.b, V.b.o, V.b.smart));
  }
  function resolveNow(pid, oid) {
    const ev = resolveRound(V.b, pid, oid);
    // a snack that was actually eaten comes out of the fruit stash now
    for (const e of ev) if (e.type === 'snack') {
      const f = V.b[e.who];
      if (f.s && !f.npc && PS.S.sprouts.includes(f.s)) ST.useFruit(e.fruit);
      if (V.mode === 'tower' && e.who === 'p' && towerRun()) { towerRun().snackUsed = true; PS.save(); }
    }
    // the outcome is known now: no more giving up, and the prize is paid right away (the animation plays after)
    if (V.b.over) { runBtn.hidden = true; grant(); }
    else if (V.mode === 'tower') { const run = towerRun(); if (run && run.fighting === V.floor) { run.hp = V.b.p.hp / V.b.p.max; PS.save(); } } // (a paused climb resumes from here)
    V.phase = 'play'; movesEl.classList.add('wait'); setInfo(null); renderSnack();
    queue(ev.map(e => ({ kind: 'ev', ev: e, text: e.text, dur: evDur(e) })));
  }
  function evDur(e) {
    switch (e.type) {
      case 'use': return e.giant ? 1 : D.MOVES[e.move].pow > 0 ? 0.55 : 0.5;
      case 'hit': return e.giant ? 1.1 : e.of > 1 ? 0.32 : 0.6;
      case 'faint': return 1.2;
      case 'dot': return e.kind === 'tired' ? 0.35 : 0.7;
      case 'skip': return 0.9;
      case 'charge': return 1.7;
      case 'revive': return 1.8;
      case 'snack': return 0.9;
      case 'hang': return 1.5;
      case 'note': return e.tired || e.draw ? 1.3 : 0.7;
      default: return 0.7;
    }
  }
  function queue(steps) { V.queue.push(...steps); }
  function nextStep() {
    const st = V.queue.shift();
    if (!st) { onQueueEmpty(); return; }
    V.step = st; st.t = 0;
    if (st.text) { V.log.full = st.text; V.log.shown = 0; }
    st.need = Math.max(st.dur, st.text ? st.text.length / 55 + 0.55 : 0);
    begin(st);
  }
  function toChoose() {
    V.phase = 'choose';
    if (V.mode === 'friend') { showPass(V.fr.turn); return; }
    renderMoves(); renderPlates(false); setLog(`What will ${V.b.p.name} do?`); setInfo(null);
  }
  function onQueueEmpty() {
    V.step = null;
    V.fast = false;
    if (V.phase === 'intro') { toChoose(); return; }
    if (V.phase === 'play') {
      if (V.b.over) { endBattle(); return; }
      toChoose(); return;
    }
    if (V.phase === 'end') showResults();
  }
  function setLog(t) { V.log.full = t; V.log.shown = 0; }
  // pass-and-play hand-over screen: hides the moves until the right player is holding the phone
  function showPass(side) {
    V.phase = 'pass';
    const who = V.fr.names[side], other = V.fr.names[side === 'p' ? 'o' : 'p'], f = V.b[side];
    const first = V.b.turn === 0 && side === 'p';
    passEl.innerHTML = `<div class="card"><canvas class="px" width="32" height="32"></canvas><div class="eyebrow">Friend Battle · Round ${V.b.turn + 1}</div>
      <h1>${first ? `${esc(who)} goes first!` : `Pass the phone to ${esc(who)}!`}</h1><p class="sub">${esc(other)}, no peeking at the moves!</p>
      <button class="btn wide go" type="button">I'm ${esc(who)}. Show my moves!</button></div>`;
    PS.ui.drawSproutTo(passEl.querySelector('canvas'), f.s || f.look, { eyes: 'brave', mouth: 'grin', arms: 'up' });
    passEl.hidden = false;
    passEl.querySelector('button').onclick = () => {
      sfx('pop'); passEl.hidden = true; V.phase = 'choose';
      renderMoves(); renderPlates(false); setLog(`${who}: what will ${f.name} do?`); setInfo(null);
    };
  }

  // start the visuals for one step
  function begin(st) {
    if (st.kind === 'intro') { sfx('whoosh'); if (V.mode === 'friend') banner('FIGHT!', `${V.fr.names.p} vs ${V.fr.names.o}`, '#fbf236'); return; }
    if (st.kind === 'bossin') { sfx('thud'); V.a.o.enter = 1; V.a.o.drop = 1; banner(V.boss.name.toUpperCase(), V.boss.title, '#fbf236', 2.2); return; }
    if (st.kind === 'wildin') { sfx('whoosh'); banner(V.b.o.name.toUpperCase(), 'Wild ' + D.AREAS[D.ANIMALS[V.wild.id].area].name, V.wild.step === 2 ? '#ff9a3a' : '#fff27a'); V.a.o.hop = 1; return; }
    if (st.kind === 'floor') { sfx('whoosh'); banner(`FLOOR ${V.floor}`, V.floor % 5 === 0 ? 'Star challenger!' : '', '#fff27a'); return; }
    if (st.kind === 'go') { V.a.p.pose = { arms: 'up', mouth: 'open', eyes: 'happy' }; V.a.p.poseT = 0.8; V.a.p.hop = 1; if (V.mode === 'friend') { V.a.o.pose = { arms: 'up', mouth: 'open', eyes: 'brave' }; V.a.o.poseT = 0.8; V.a.o.hop = 1; } return; }
    if (st.kind === 'victory' || st.kind === 'defeat') return;
    const e = st.ev, who = e.who, A = who ? V.a[who] : null;
    V.disp = e.snap; renderPlates(false);
    const top = topOf;
    switch (e.type) {
      case 'use': {
        const m = D.MOVES[e.move];
        if (e.giant) { A.lunge = 1; A.charge = 0; quake(0.5, 3); sfx('crack'); st.shoot = { from: who, el: m.el, t: 0.35, giant: true }; banner(V.boss.sup.name.toUpperCase() + '!', '', '#ff9a3a', 1.1); break; }
        if (m.pow > 0) { A.lunge = 1; A.pose = { arms: 'out', mouth: 'open', eyes: 'brave' }; A.poseT = 0.5; sfx('whoosh'); st.shoot = { from: who, el: m.el, t: 0.12 }; }
        else { A.hop = 1; A.pose = { arms: 'up', mouth: 'grin' }; A.poseT = 0.5; sfx('chime'); burst(top(who), m.el, 8, 26); if (V.boss && who === 'p' && V.disp.o.charging) rise(top(who), icons().shield, 1); }
        break;
      }
      case 'hit': {
        A.flash = 0.18; A.shake = 0.3; A.pose = { eyes: 'sad', mouth: 'o' }; A.poseT = 0.45;
        const p = top(who);
        if (e.giant) {
          burst(p, e.el, e.braced ? 14 : 30, e.braced ? 50 : 80); ring(p.x, p.y, e.braced ? '#9fd8ff' : '#ffffff', 22); ring(p.x, p.y, elColor(e.el), 30, 0.1);
          quake(e.braced ? 0.4 : 0.8, e.braced ? 2 : 4); flash(e.braced ? '#9fd8ff' : '#ffffff', 0.3);
          if (e.braced) { V.parts.push({ x: p.x, y: p.y - 2, vx: 0, vy: -4, g: 0, life: 1, spr: icons().shield, big: true }); }
          pop(p.x, p.y - 12, `-${e.n}`, e.braced ? '#9fd8ff' : '#ff9a3a', e.braced ? 30 : 42, e.braced ? 'BLOCKED!' : 'OUCH!');
          sfx(e.braced ? 'chime' : 'thud'); safe(() => PX.buzz(e.braced ? 20 : 60));
        } else {
          burst(p, e.el, e.of > 1 ? 3 : 6, e.crit ? 60 : 44); hitFx(p, e.el, e.crit || e.tm > 1, e.by === 'p' ? 1 : -1, e.of > 1);
          ring(p.x, p.y, e.crit ? '#fbf236' : '#ffffff', e.crit ? 16 : 11);
          if (e.crit) { quake(0.25, 2); flash('#ffffff', 0.12); } else if (e.tm > 1) quake(0.15, 1);
          pop(p.x, p.y - 12, `-${e.n}`, e.crit ? '#fbf236' : e.tm > 1 ? '#ffb347' : '#ffffff', e.crit ? 34 : e.tm > 1 ? 30 : 26, e.crit ? 'CRIT' : e.tm > 1 ? 'SUPER' : '');
          sfx(e.crit ? 'snap' : 'thud'); if (who === 'p' || V.mode === 'friend') safe(() => PX.buzz(e.crit ? 25 : 12));
        }
        cheer(0.5);
        break;
      }
      case 'miss': {
        const t = V.a[e.target]; t.dodge = 1; const p = top(e.target); pop(p.x, p.y - 10, 'Miss!', '#dfe8fb', 24); sfx('miss');
        break;
      }
      case 'heal': { rise(top(who), ICON.plus || icons().plus, 10); pop(top(who).x, top(who).y - 12, `+${e.n}`, '#99e550', 26); A.pose = { eyes: 'happy', mouth: 'smile', arms: 'up' }; A.poseT = 0.5; sfx('chime'); break; }
      case 'snack': {
        const fr = safe(() => PX.item('fruit', e.fruit), null); if (fr) V.parts.push({ x: top(who).x, y: top(who).y - 6, vx: 0, vy: -10, g: 0, life: 0.8, spr: fr });
        rise(top(who), fxs('heart'), 6); pop(top(who).x, top(who).y - 12, `+${e.n}`, '#99e550', 28, 'YUM!');
        A.pose = { eyes: 'happy', mouth: 'open', arms: 'up' }; A.poseT = 0.7; A.emote = 'munch'; A.emoteT = 0.8; A.hop = 1; sfx('munch'); setTimeout(() => sfx('chime'), 160);
        break;
      }
      case 'recoil': { A.shake = 0.25; A.flash = 0.12; pop(top(who).x, top(who).y - 12, `-${e.n}`, '#ffffff', 22); sfx('thud'); break; }
      case 'stage': {
        if (e.n) { rise(top(who), e.n > 0 ? icons().up : icons().down, 8, e.n < 0); if (e.n > 0) { A.hop = 1; } sfx(e.n > 0 ? 'level' : 'miss'); }
        break;
      }
      case 'status': {
        const col = { poison: '#9a6ad0', burn: '#df5a26', sleep: '#5b6ee1', stun: '#fbf236' }[e.st];
        burst(top(who), e.st === 'burn' ? 'fire' : e.st === 'poison' ? 'shadow' : 'light', 10, 30);
        A.emote = e.st === 'sleep' ? 'zz' : e.st === 'stun' ? 'swirl' : '!'; A.emoteT = 1;
        pop(top(who).x, top(who).y - 14, STATUS_SHORT[e.st] + '!', col, 22); sfx('crack');
        break;
      }
      case 'skip': { A.emote = e.kind === 'sleep' ? 'zz' : 'swirl'; A.emoteT = 1; A.shake = e.kind === 'stun' ? 0.3 : 0; A.charge = 0; break; }
      case 'wake': { A.emote = '!'; A.emoteT = 0.8; A.hop = 1; break; }
      case 'charge': {
        A.charge = 1; A.emote = '!'; A.emoteT = 1.6; quake(1.2, 1); sfx('whoosh'); setTimeout(() => sfx('crack'), 250);
        banner('WATCH OUT!', V.boss.warn, '#ff5a4a', 1.6);
        break;
      }
      case 'revive': {
        A.fainting = 0; A.flash = 0.5; A.hop = 1; burst(top(who), 'fire', 30, 70); ring(top(who).x, top(who).y, '#fbf236', 30); flash('#fff27a', 0.4); quake(0.6, 2);
        banner('REBORN!', `${V.b[who].name} rose from the flames`, '#fbf236', 1.6); sfx('evolve');
        break;
      }
      case 'dot': {
        if (e.kind === 'tired') { rise(top(who), icons().sweat, 3); A.shake = 0.12; }
        else { burst(top(who), e.kind === 'burn' ? 'fire' : 'shadow', 8, 22); A.flash = 0.12; A.shake = 0.25; }
        pop(top(who).x, top(who).y - 12, `-${e.n}`, e.kind === 'poison' ? '#c9a2f0' : e.kind === 'burn' ? '#ffb347' : '#dfe8fb', e.kind === 'tired' ? 18 : 22);
        break;
      }
      case 'cure': case 'cleanse': { rise(top(who), fxs('spark', '#ffffff'), 8); sfx('chime'); break; }
      case 'faint': { A.fainting = 0.001; A.charge = 0; A.pose = { eyes: 'closed', mouth: 'o' }; A.poseT = 99; sfx('thud'); if (who === 'o' && V.boss) { quake(0.9, 3); burst(top('o'), V.boss.els[0], 26, 60); } break; }
      case 'hang': { // a tie against the computer: the player's Sprout wobbles back up with 1 HP
        A.fainting = 0; A.hop = 1; A.shake = 0.3; A.emote = '!'; A.emoteT = 1.2; A.pose = { eyes: 'brave', mouth: 'grin', arms: 'up' }; A.poseT = 1.3;
        rise(top(who), fxs('heart'), 5); pop(top(who).x, top(who).y - 12, '1 HP', '#fbf236', 28, 'HANG ON!'); sfx('chime');
        break;
      }
      case 'note':
        if (e.tired) { for (const s of SIDES) { rise(top(s), icons().sweat, 4); V.a[s].shake = 0.2; } banner('TIRED!', 'Both lose HP every turn now', '#9fd8ff', 1.6); sfx('whoosh'); }
        else if (e.draw) banner('DRAW!', '', '#9fd8ff', 1.6);
        break;
    }
  }

  function endBattle() {
    const won = V.b.winner === 'p', draw = !V.b.winner;
    V.phase = 'end'; V.won = won; runBtn.hidden = true; snackBtn.hidden = true; warnEl.hidden = true;
    if (!draw) { const W = V.a[V.b.winner]; W.win = true; W.emote = 'heart'; W.emoteT = 99; }
    for (const c of V.crowd) c.cheer = true;
    let text = won ? `${V.b.p.name} won the battle!` : `${V.b.p.name} lost the battle...`;
    if (V.mode === 'friend') text = draw ? "It's a draw! Good game!" : `${V.fr.names[V.b.winner]}'s ${V.b[V.b.winner].name} wins!`;
    else if (V.mode === 'boss' && won) text = `${V.b.p.name} beat the ${V.boss.name}!`;
    else if (V.mode === 'wild' && won) text = `${V.b.p.name} beat the ${V.b.o.name}!`;
    if (!draw && (won || V.mode === 'friend')) banner(V.mode === 'friend' ? 'WINNER!' : 'VICTORY!', '', '#fbf236', 1.8);
    queue([{ kind: won || V.mode === 'friend' ? 'victory' : 'defeat', text, dur: 1.8 }]);
    sfx(won || V.mode === 'friend' ? 'level' : 'miss');
  }

  function showResults() {
    if (V.done) return; V.done = true; V.phase = 'results';
    if (!V.granted) grant(); // (normally already paid, the moment the battle was decided)
    const res = V.res || { rows: '', pay: null };
    if (V.mode === 'wild') resultsWild(res); else if (V.mode === 'boss') resultsBoss(res); else if (V.mode === 'tower') resultsTower(res); else if (V.mode === 'friend') resultsFriend(res); else resultsLeague(res);
    paintIcons(resEl);
    resEl.hidden = false;
    PS.ui.chrome(true); PS.ui.hold(false);
    if (!V.won && V.mode !== 'friend' && V.mode !== 'tower') suggestSprout();
  }
  // Pays the battle's prize exactly once (V.granted), the moment the outcome is known. The rows it builds are shown later
  // by the results card, so the card always shows what was really paid.
  function grant() {
    if (!V || V.granted || !V.b.over) return;
    V.granted = true;
    try { V.res = GRANT[V.mode](V.b.winner === 'p'); } catch (e) { console.error(e); V.res = null; }
    PS.save();
  }
  const rowHtml = (icon, label, val, cls) => `<div class="b-rrow${cls ? ' ' + cls : ''}">${icon}${label}${val == null ? '' : `<b>${val}</b>`}</div>`;
  const COIN = '<canvas class="px" data-coin="1"></canvas>', BIGCOIN = '<canvas class="px" data-coin="big"></canvas>', PLUS = '<canvas class="px" data-icon="plus"></canvas>';
  const xpText = pay => (pay.xp || !pay.maxed ? `+${pay.xp}` : 'Max level!');
  const xpRow = pay => rowHtml(PLUS, `Training XP${pay.happy ? ' <span class="b-happy">Happy bonus!</span>' : ''}`, xpText(pay));
  const eggRow = (kind, egg, lead) => `<div class="b-rrow gold"><canvas class="px egg" data-egg="${kind}"></canvas><span>${lead} It's waiting in the ${areaName(egg.area)}.</span></div>`;
  const GRANT = {
    league(won) {
      const { L, index, s } = V, pz = prize('league', V, won), pay = payout(s, pz.coins, pz.xp, 'battle', won), p = ST.leagueProgress(L.id);
      let rows = rowHtml(COIN, 'Coins', `+${pay.coins}`) + xpRow(pay);
      if (won) {
        p.beaten[index] = true;
        if (!p.cleared && p.beaten.every(Boolean)) {
          p.cleared = true;
          const bonus = ST.addCoins(leagueClearCoins(L), 'league'), kind = eggKind(L.egg), egg = ST.addEgg(kind, L.name);
          PS.S.bestTier = Math.max(PS.S.bestTier || 0, Math.min(3, Math.ceil((D.LEAGUES.indexOf(L) + 1) / 2)));
          rows += rowHtml(COIN, `${L.name} cleared!`, `+${bonus}`, 'gold') + eggRow(kind, egg, `New ${eggName(kind)}!`);
        }
      }
      PS.S.progress.leagues[L.id] = p;
      return { pay, rows };
    },
    boss(won) {
      const { boss: B, s } = V, X = extra(), r = bossRec(B.id), first = won && !r.wins;
      if (won) { r.wins++; if (!r.best || V.b.turn < r.best) r.best = V.b.turn; }
      X.bosses[B.id] = r;
      const pz = prize('boss', V, won), pay = payout(s, pz.coins, pz.xp, 'legend', won);
      let rows = '';
      if (first) {
        if (B.egg) { const kind = eggKind(B.egg), egg = ST.addEgg(kind, `${B.name} Legend`); rows += eggRow(kind, egg, `${aOrAn(eggName(kind)) === 'an' ? 'An' : 'A'} ${eggName(kind)}!`); }
        else { PS.S.pouch.push(B.id); PS.S.seen['rare:' + B.id] = true; PS.emit('pouch'); rows += `<div class="b-rrow gold"><canvas class="px crit" data-critter="${B.id}"></canvas><span>The ${B.name} joined you! It's in your pouch. Give it to a Sprout in the Garden.</span></div>`; }
      }
      rows += rowHtml(COIN, 'Coins', `+${pay.coins}`) + xpRow(pay);
      return { pay, rows, first };
    },
    wild(won) {
      const { s } = V, { id, step } = V.wild, A = D.ANIMALS[id], L = wildLv(id, step), X = extra();
      const rec = wildRec(id), firstAny = won && !rec.some(Boolean), firstStep = won && !rec[step];
      if (won) rec[step]++;
      X.wild.animals[id] = rec;
      const pz = prize('wild', V, won), pay = payout(s, pz.coins, pz.xp, 'wild', won);
      let rows = '';
      if (firstAny) {
        if (ST.addToPouch(id)) rows += `<div class="b-rrow gold"><canvas class="px" data-critter="${id}" data-box="24" style="width:48px;height:48px"></canvas><span>The ${esc(A.name)} joined you! It's in your pouch. Give it to a Sprout in the Garden.</span></div>`;
        else { const c = ST.addCoins(pouchFullCoins(L), 'wild'); rows += `<div class="b-rrow gold">${BIGCOIN}<span>Your pouch is full, so the ${esc(A.name)} left you coins instead.</span><b>+${c}</b></div>`; }
      }
      if (firstStep && step === 2) rows += rowHtml('<canvas class="px" data-icon="staron"></canvas>', 'Alpha bonus!', `+${ST.addCoins(alphaBonus(L), 'wild')}`, 'gold');
      const area = A.area;
      if (won && !X.wild.areas[area] && wildList(area).every(k => wildRec(k)[2] > 0)) {
        X.wild.areas[area] = true;
        const egg = ST.addEgg(area, `Wild ${areaName(area)}`);
        rows += `<div class="b-rrow gold"><canvas class="px egg" data-egg="${area}"></canvas><span>You beat every Alpha in the ${areaName(area)}! ${aOrAn(eggName(area)) === 'an' ? 'An' : 'A'} ${eggName(area)} is waiting in the ${areaName(egg.area)}.</span></div>`;
      }
      rows += rowHtml(COIN, 'Coins', `+${pay.coins}`) + xpRow(pay);
      return { pay, rows, firstStep };
    },
    tower(won) {
      const { s, floor: f } = V, T = extra().tower, run = towerRun(), pz = prize('tower', V, won), pay = payout(s, 0, pz.xp, 'tower', won);
      if (won && run) {
        delete run.fighting;
        run.pot += pz.coins;
        const record = f > (T.best || 0); if (record) T.best = f;
        const hpNext = Math.min(1, V.b.p.hp / V.b.p.max + TOWER.heal);
        run.hp = hpNext; run.floor = f + 1;
        let rows = rowHtml(COIN, 'Into the prize bag', `+${pz.coins}`);
        const t = treatFor(f); if (t) rows += giveTreat(t, f, run);
        rows += rowHtml(BIGCOIN, 'Prize bag', run.pot, 'blue') + xpRow(pay);
        return { pay, rows, record, hpNext, pot: run.pot };
      }
      const pot = run ? run.pot : 0, paid = towerEnd('lost');
      return { pay, rows: rowHtml(BIGCOIN, 'You keep half the bag', `+${paid}`, 'gold') + xpRow(pay), pot };
    },
    friend() {
      const { b, fr, s } = V, win = b.winner, F = extra().friend;
      if (F.day !== today()) { F.day = today(); F.paid = 0; }
      F.played = (F.played || 0) + 1;
      if ((F.paid || 0) >= FRIEND.perDay) return { rows: '<div class="b-rrow">No more coins today, but that was fun!</div>' };
      F.paid = (F.paid || 0) + 1;
      const pz = prize('friend', V, win === null ? 'draw' : win === 'p'), pay = payout(s, pz.coins, pz.xp, 'friend', win === 'p', false);
      return { pay, rows: rowHtml(COIN, `Coins for ${esc(fr.names.p)}`, `+${pay.coins}`) + rowHtml(PLUS, `A little XP for ${esc(b.p.name)}`, xpText(pay)) };
    },
  };

  // ---------------- after a loss: why, one tip, and maybe a better Sprout ----------------
  // an animal that teaches an attack of this element (the first one in the data, e.g. water -> Duck)
  const teacherCache = {};
  function teacherOf(el) {
    if (!(el in teacherCache)) teacherCache[el] = Object.keys(D.ANIMALS).find(k => D.ANIMALS[k].el === el && D.ANIMALS[k].moves.some(m => D.MOVES[m] && D.MOVES[m].el === el && D.MOVES[m].pow > 0)) || null;
    return teacherCache[el];
  }
  function typeTip(foeEl) {
    const beat = Object.keys(D.ELEMENTS).filter(k => D.ELEMENTS[k].strong.includes(foeEl)), who = beat.map(teacherOf).find(Boolean);
    return beat.length ? `${beat.map(elLabel).join(' and ')} moves beat ${elLabel(foeEl)}.${who ? ` Bond with ${aOrAn(D.ANIMALS[who].name)} ${D.ANIMALS[who].name} to learn one!` : ''}` : '';
  }
  // One short reason from what really happened in this battle, and one training tip.
  function lossWhy() {
    const b = V.b, P = b.p, O = b.o, me = esc(P.name), foe = esc(O.boss || O.wild ? 'The ' + O.name : O.name), gap = O.lv - P.lv;
    const lvTip = 'Race, play in the Garden and win easier battles to level up, then come back!';
    if (O.boss && P.bigHits) return { why: `${foe}'s giant attack hit ${me} hard.`, tip: 'When it charges up, pick a move with the yellow BLOCK tag!' };
    if (gap >= 10) return { why: `${foe} is ${gap} levels higher than ${me}.`, tip: lvTip };
    if (O.dealtStrong > 0 && O.dealtStrong >= O.dealt * 0.4) return { why: `${foe}'s ${elLabel(O.strongEl)} moves hit ${me} hard.`, tip: typeTip(O.els[0]) || lvTip };
    if (O.healed >= O.max * 0.5) return { why: `${foe} healed a lot.`, tip: 'Use your strongest moves every turn, so its healing can\'t keep up.' };
    if (P.dealt > 0 && P.dealtWeak >= P.dealt * 0.5) return { why: `${me}'s moves were weak against ${elLabel(O.els[0])}.`, tip: typeTip(O.els[0]) || lvTip };
    if (gap >= 5) return { why: `${foe} is ${gap} levels higher than ${me}.`, tip: lvTip };
    if (b.tiredEnd) return { why: `${me} got too tired first.`, tip: 'Heal moves and a snack help in long battles.' };
    return { why: 'That was close!', tip: P.snack ? 'Try again. Eat your snack when HP gets low!' : 'Try again, and bring a snack to heal once.' };
  }
  function lossHtml() {
    const w = safe(lossWhy, null); if (!w) return '';
    return `<div class="b-why"><b>${w.why}</b><span><i>Tip:</i> ${w.tip}</span></div><div class="b-alt" hidden></div>`;
  }
  // Is one of the player's other Sprouts a clearly better match for this foe? Checked just after the card shows.
  function suggestSprout() {
    const v = V, spec = v && v.spec, cur = v && v.s; if (!spec || !cur) return;
    setTimeout(() => {
      const box = resEl.querySelector('.b-alt'); if (V !== v || !box || resEl.hidden) return;
      const mine = matchup(cur, spec).win; let best = null;
      const others = PS.S.sprouts.filter(x => x !== cur).sort((a, b) => ST.totalLevels(b) - ST.totalLevels(a)).slice(0, 8);
      for (const s of others) { const e = matchup(s, spec, 24); if (e.win >= Math.max(0.5, mine + 0.25) && (!best || e.win > best.win)) best = { s, win: e.win }; }
      if (!best) return;
      const o = oddsOf(best.win), name = esc(best.s.name);
      box.innerHTML = `<canvas class="px" width="32" height="32"></canvas><div><b>Try ${name}?</b><small>${name} has a better chance: <span class="b-ow ${o.c}">${o.word}</span></small></div>
        <button class="btn wide go" type="button">Battle with ${name}!</button>`;
      PS.ui.drawSproutTo(box.querySelector('canvas'), best.s, { eyes: 'brave', mouth: 'grin', arms: 'up' });
      box.hidden = false;
      box.querySelector('button').onclick = () => { sfx('pop'); ST.setActive(best.s.id); rematch(v); };
    }, 60);
  }
  // start the same fight again (with whoever is the partner now)
  function rematch(v) {
    V = null; resEl.hidden = true;
    if (v.mode === 'league') startBattle(v.L.id, v.index); else if (v.mode === 'wild') startWild(v.wild.id, v.wild.step); else if (v.mode === 'boss') startBoss(v.boss.id);
  }
  const turnsText = n => `${n} turn${n > 1 ? 's' : ''}`;
  const upsBlock = res => { const u = Object.entries((res.pay && res.pay.ups) || {}).map(([k, n]) => `<span style="background:${D.STAT_META[k].color}">${D.STAT_META[k].label} +${n} Lv</span>`).join(''); return u ? `<div class="b-ups">${u}</div>` : ''; };
  const winSub = (s, foe) => (V.b.tie ? `${esc(s.name)} hung on with 1 HP and won the tie!` : `${esc(s.name)} beat ${foe} in ${turnsText(V.b.turn)}.`);
  function backToHub(then) { V = null; resEl.hidden = true; passEl.hidden = true; fightEl.hidden = true; hubEl.hidden = false; renderHub(); if (then) then(); }
  function bindRes(map) {
    resEl.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { sfx('pop'); const fn = map[b.dataset.a]; if (fn) fn(); else backToHub(); });
  }
  function resultsLeague(res) {
    const { L, index, s, won } = V;
    const nextOk = won && index < 2;
    const nextL = won && index === 2 ? D.LEAGUES[V.li + 1] : null;
    resEl.innerHTML = `<div class="card">
      <div class="eyebrow">${L.name} · ${esc(V.npc.name)}</div>
      <canvas class="px hero" width="32" height="32"></canvas>
      <h1>${won ? 'Victory!' : 'So close!'}</h1>
      <p class="sub">${won ? winSub(s, esc(V.npc.name)) : `${esc(V.npc.name)} won this time.`}</p>
      ${won ? '' : lossHtml()}
      <div class="b-rrows">${res.rows}</div>${upsBlock(res)}
      <div class="modal-btns">
        ${nextOk ? `<button class="btn wide go" data-a="next">Next: ${esc(L.opponents[index + 1].name)}</button>` : ''}
        ${nextL && ST.leagueUnlocked(nextL.id) ? `<button class="btn wide go" data-a="league">Next: ${nextL.name}</button>` : ''}
        ${!won ? '<button class="btn wide primary" data-a="retry">Try again</button>' : ''}
        <button class="btn wide" data-a="hub">Back to leagues</button>
      </div></div>`;
    PS.ui.drawSproutTo(resEl.querySelector('canvas.hero'), s, won ? { arms: 'up', eyes: 'happy', mouth: 'open' } : { eyes: 'sad', mouth: 'flat' });
    const lid = L.id;
    bindRes({
      next: () => { V = null; resEl.hidden = true; startBattle(lid, index + 1); },
      retry: () => { V = null; resEl.hidden = true; startBattle(lid, index); },
      league: () => backToHub(() => preview(nextL, 0)),
    });
  }
  function resultsBoss(res) {
    const { boss: B, s, won } = V;
    resEl.innerHTML = `<div class="card">
      <div class="eyebrow">Legend Challenge · ${B.name}</div>
      <canvas class="px hero" width="32" height="32"></canvas>
      <h1>${won ? (res.first ? 'Legendary!' : 'Victory!') : 'So close!'}</h1>
      <p class="sub">${won ? winSub(s, `the ${B.name}`) : `The ${B.name} won this time.`}</p>
      ${won ? '' : lossHtml()}
      <div class="b-rrows">${res.rows}</div>${upsBlock(res)}
      <div class="modal-btns">${!won ? '<button class="btn wide primary" data-a="retry">Try again</button>' : ''}<button class="btn wide" data-a="hub">Back to Legends</button></div></div>`;
    const hero = resEl.querySelector('canvas.hero');
    if (won) PS.ui.drawSproutTo(hero, s, { arms: 'up', eyes: 'happy', mouth: 'open' }); else { const c = critterBox(B.id, 32); hero.width = 32; hero.height = 32; PS.ui.paint(hero, c); }
    const id = B.id;
    bindRes({ retry: () => { V = null; resEl.hidden = true; previewBossAgain(id); } });
  }
  function resultsWild(res) {
    const { s, won } = V, { id, step } = V.wild, A = D.ANIMALS[id], area = A.area;
    const list = wildRank(area), nextId = list[(list.indexOf(id) + 1) % list.length];
    resEl.innerHTML = `<div class="card"><div class="eyebrow">Wild ${areaName(area)} · ${esc(V.b.o.name)}</div><canvas class="px hero" width="32" height="32"></canvas>
      <h1>${won ? (step === 2 && res.firstStep ? 'Alpha beaten!' : 'Victory!') : 'So close!'}</h1>
      <p class="sub">${won ? winSub(s, `the ${esc(V.b.o.name)}`) : `The ${esc(V.b.o.name)} won this time.`}</p>
      ${won ? starsHtml(id).replace('b-stars', 'b-stars" style="justify-content:center') : lossHtml()}
      <div class="b-rrows">${res.rows}</div>${upsBlock(res)}
      <div class="modal-btns">
        ${won && step < 2 ? `<button class="btn wide go" data-a="up">Next: ${WILD.steps[step + 1].name} ${esc(A.name)} (Lv ${wildLv(id, step + 1)})</button>` : ''}
        ${!won ? '<button class="btn wide primary" data-a="retry">Try again</button>' : ''}
        ${won && nextId !== id ? `<button class="btn wide" data-a="nextA">Next animal: ${esc(D.ANIMALS[nextId].name)}</button>` : ''}
        <button class="btn wide" data-a="hub">Back to Wild</button></div></div>`;
    const hero = resEl.querySelector('canvas.hero');
    if (won) PS.ui.drawSproutTo(hero, s, { arms: 'up', eyes: 'happy', mouth: 'open' }); else { const c = critterBox(id, 32); hero.width = 32; hero.height = 32; PS.ui.paint(hero, c); }
    bindRes({
      up: () => { V = null; resEl.hidden = true; startWild(id, step + 1); },
      retry: () => { V = null; resEl.hidden = true; startWild(id, step); },
      nextA: () => { hubTab = 'wild'; backToHub(() => previewWild(nextId)); },
    });
  }
  function previewBossAgain(id) { fightEl.hidden = true; hubEl.hidden = false; hubTab = 'legends'; renderHub(); previewBoss(BOSS[id]); }
  function resultsTower(res) {
    const { s, won, floor: f } = V, T = extra().tower;
    let title, sub, btns;
    if (won && res.hpNext != null) {
      const hp = Math.round(res.hpNext * 100);
      title = res.record && f > 1 ? 'New record!' : `Floor ${f} cleared!`;
      sub = `${esc(s.name)} heals ${Math.round(TOWER.heal * 100)}% for the next floor.`;
      btns = `<div class="b-hpline">HP<div class="b-hpbar"><i style="width:${hp}%" class="${res.hpNext > 0.5 ? '' : res.hpNext > 0.2 ? 'mid' : 'low'}"></i></div>${hp}%</div>
        <div class="modal-btns"><button class="btn wide go" data-a="next">Climb to Floor ${f + 1}!</button><button class="btn wide" data-a="stop">Stop and take ${res.pot} coins</button></div>`;
    } else {
      title = 'Great climb!';
      sub = `${esc(s.name)} reached Floor ${f}${res.pot ? ` (the bag had ${res.pot} coins)` : ''}. Best ever: Floor ${T.best || 0}.`;
      btns = `<div class="modal-btns"><button class="btn wide primary" data-a="again">Climb again</button><button class="btn wide" data-a="hub">Back to the Tower</button></div>`;
    }
    resEl.innerHTML = `<div class="card"><div class="eyebrow">Battle Tower · Floor ${f}</div><canvas class="px hero" width="32" height="32"></canvas>
      <h1 class="${/\d/.test(title) ? 'num' : ''}">${title}</h1><p class="sub">${sub}</p>${won ? '' : lossHtml()}<div class="b-rrows">${res.rows}</div>${upsBlock(res)}${btns}</div>`;
    PS.ui.drawSproutTo(resEl.querySelector('canvas.hero'), s, won ? { arms: 'up', eyes: 'happy', mouth: 'open' } : { eyes: 'happy', mouth: 'smile' });
    bindRes({
      next: () => { V = null; resEl.hidden = true; startTowerFloor(); },
      stop: () => { const pot = towerEnd('stop'); sfx('level'); backToHub(() => PS.ui.toast(`You took ${pot} coins home!`)); },
      again: () => { hubTab = 'tower'; backToHub(() => previewTower()); },
    });
  }
  function giveTreat(t, f, run) {
    if (t.kind === 'fruit') { const a = STAT_FRUITS[Math.floor(Math.random() * STAT_FRUITS.length)], b = STAT_FRUITS[Math.floor(Math.random() * STAT_FRUITS.length)]; ST.addFruit(a, 1); ST.addFruit(b, 1); return `<div class="b-rrow gold"><canvas class="px" data-fruit="${a}"></canvas><span>Treat: ${a === b ? `2 ${D.FRUITS[a].name}s` : `${D.FRUITS[a].name} and ${D.FRUITS[b].name}`}!</span></div>`; }
    if (t.kind === 'gold' || t.kind === 'gold2') {
      ST.addFruit('goldfruit', 1); let extraF = '';
      if (t.kind === 'gold2') { const a = STAT_FRUITS[Math.floor(Math.random() * STAT_FRUITS.length)]; ST.addFruit(a, 1); ST.addFruit('apple', 1); extraF = `, a ${D.FRUITS[a].name} and a Heart Apple`; }
      return `<div class="b-rrow gold"><canvas class="px" data-fruit="goldfruit"></canvas><span>Treat: a Golden Fruit${extraF}!</span></div>`;
    }
    const bag = TOWER.coins(f) * 3; run.pot += bag;
    let h = `<div class="b-rrow gold"><canvas class="px" data-coin="big"></canvas>Treat: big coin bag<b>+${bag}</b></div>`;
    if (t.kind === 'egg' && Math.random() < t.chance) { const egg = ST.addEgg(t.egg, `Battle Tower floor ${f}`); h += eggRow(t.egg, egg, `Lucky! ${aOrAn(eggName(t.egg)) === 'an' ? 'An' : 'A'} ${eggName(t.egg)}!`); }
    return h;
  }
  function resultsFriend(res) {
    const { b, fr } = V, win = b.winner, draw = !win;
    resEl.innerHTML = `<div class="card"><div class="eyebrow">Friend Battle</div>
      <div style="display:flex;justify-content:center;gap:6px"><canvas class="px duo" data-side="p" width="32" height="32"></canvas><canvas class="px duo" data-side="o" width="32" height="32"></canvas></div>
      <h1>${draw ? "It's a draw!" : `${esc(fr.names[win])} wins!`}</h1><p class="sub">${draw ? `Both were knocked out at the same time after ${turnsText(b.turn)}.` : `${esc(b[win].name)} won in ${turnsText(b.turn)}.`} Good game, ${esc(fr.names.p)} and ${esc(fr.names.o)}!</p>
      <div class="b-rrows">${res.rows}</div>${upsBlock(res)}
      <div class="modal-btns"><button class="btn wide go" data-a="rematch">Rematch!</button><button class="btn wide" data-a="hub">Done</button></div></div>`;
    resEl.querySelectorAll('canvas.duo').forEach(c => { const side = c.dataset.side, f = b[side]; PS.ui.drawSproutTo(c, f.s || f.look, draw || side === win ? { arms: 'up', eyes: 'happy', mouth: 'open' } : { eyes: 'sad', mouth: 'flat' }); if (side === 'o') c.style.transform = 'scaleX(-1)'; });
    const sA = V.s, sB = V.sB, nA = fr.names.p, nB = fr.names.o, own = V.own;
    bindRes({ rematch: () => { V = null; resEl.hidden = true; startFriend(sA, sB, nA, nB, own); } });
  }

  // ---------------- particles & pops ----------------
  function burst(p, el, n, speed) {
    const P = elParticles(el);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random() * 0.6) * speed;
      V.parts.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + (Math.random() - 0.5) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: P.g, life: 0.4 + Math.random() * 0.35, spr: P.spr[i % P.spr.length] });
    }
  }
  function rise(p, spr, n, down) {
    for (let i = 0; i < n; i++) V.parts.push({ x: p.x + (Math.random() - 0.5) * 22, y: p.y + 6 + Math.random() * 8, vx: 0, vy: down ? 14 + Math.random() * 8 : -(16 + Math.random() * 10), g: 0, life: 0.5 + Math.random() * 0.4, delay: i * 0.04, spr });
  }
  // A little element-coloured splash where a move lands: leaf petals drift, water droplets arc and fall, fire embers
  // rise and flicker, stone chips bounce down, sky wind streaks rush past, shadow wisps curl up, light sparkles twinkle,
  // sweet sprinkles pop out. dir: +1 when the attacker is on the left. small: one hit of a multi-hit move.
  function hitFx(p, el, strong, dir, small) {
    const I = icons(), r = Math.random, n = small ? 3 : strong ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, v = 18 + r() * 26;
      const q = { x: p.x + (r() - 0.5) * 8, y: p.y + (r() - 0.5) * 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 0.45 + r() * 0.3, spr: null };
      switch (el) {
        case 'leaf': q.spr = I.petals[i % I.petals.length]; q.vy = -Math.abs(q.vy) * 0.7; q.g = 36; q.spin = 1 + i * 1.9; q.life += 0.35; break;
        case 'water': q.spr = i % 2 ? I.drop : I.droplet; q.vx *= 0.8; q.vy = -30 - r() * 40; q.g = 260; break;
        case 'fire': q.spr = I.embers[i % I.embers.length]; q.vx *= 0.5; q.vy = -22 - r() * 30; q.g = -30; q.blink = 1 + i; q.life += 0.2; break;
        case 'stone': q.spr = I.chips[i % I.chips.length]; q.vy = -40 - r() * 34; q.g = 330; break;
        case 'sky': q.spr = I.streak; q.x -= dir * 10; q.vx = dir * (80 + r() * 50); q.vy = (r() - 0.5) * 12; q.life = 0.3 + r() * 0.2; break;
        case 'shadow': q.spr = I.wisps[i % I.wisps.length]; q.vx *= 0.4; q.vy = -12 - r() * 14; q.spin = 1 + i * 2.3; q.life += 0.3; break;
        case 'light': q.spr = I.twinkle[i % I.twinkle.length]; q.vx *= 0.6; q.vy *= 0.6; q.blink = 1 + i; q.life += 0.15; break;
        case 'sweet': q.spr = i % 4 === 3 ? fxs('heart') : I.sprinkle[i % I.sprinkle.length]; q.vy = -34 - r() * 30; q.g = 190; break;
        default: q.spr = I.twinkle[0];
      }
      V.parts.push(q);
    }
  }
  function pop(x, y, text, color, size, tag) { V.pops.push({ x, y, text, color, size, tag, t: 0, life: 0.95 }); }
  function ring(x, y, color, r, delay) { V.rings.push({ x, y, color, r, t: -(delay || 0), life: 0.32 }); }
  function quake(t, a) { if (calm()) return; V.quakeA = V.quake > 0 ? Math.max(V.quakeA, a) : a; V.quake = Math.max(V.quake, t); }
  function flash(c, t) { V.flashC = c; V.flashT = t; V.flashL = t; V.flashA = calm() ? 0.15 : 0.7; } // reduced motion: a soft tint, not a bright flash
  function banner(text, sub, color, life) { V.banner = { text, sub, color, t: 0, life: life || 1.4 }; }
  function cheer(chance) { for (const c of V.crowd) if (Math.random() < chance) c.hop = 1; }

  // ---------------- crowd ----------------
  const CROWD = {
    meadow: ['sparrow', 'hare', 'bee', 'fox', 'squirrel', 'frog', 'butterfly', 'duck'], beach: ['crab', 'seagull', 'otter', 'seal', 'starfish', 'pelican'],
    moonlit: ['bat', 'owl', 'moth', 'hedgehog', 'raccoon', 'moondeer', 'wolf'], candy: ['gummybear', 'cottonsheep', 'lollisnail', 'sugarfinch', 'marshbunny', 'chocomouse'],
  };
  function makeCrowd() {
    if (!V) return;
    const T = THEMES[V.area] || THEMES.meadow;
    V.crowd = [];
    if (!T.crowd) return;
    let pool = T.crowd === 'mix' ? [].concat(...Object.values(CROWD)) : CROWD[V.area] || CROWD.meadow;
    pool = pool.filter(k => D.ANIMALS[k]);
    // Same animals every time for this battle (a resize only moves them), garden-sized (1:1 like the Garden and the wild
    // animals), and never standing in front of the horizon props or right behind the opponent.
    const r = srng(V.seed || 1), hy = HY(), wall = T.far === 'walls', busy = [];
    for (const [kind, fx0] of wall ? [] : T.props || []) {
      const c = safe(() => PX.prop(kind, T.theme || 'day'), null); if (!c) continue;
      const x = fx0 < 0 ? fx0 + c.width / 2 : fx0 > 1 ? WW - c.width / 2 + 4 : Math.round(WW * fx0 - (kind === 'rock' ? 0 : 10));
      if (c.height >= 24) busy.push([x - c.width * 0.35 - 4, x + c.width * 0.35 + 4]); // tall props (trees): keep their trunks clear
    }
    const ox = spot('o').x; if (!wall) busy.push([ox - 12, ox + 12]);
    const want = wall ? (WW >= 150 ? 6 : 5) : (WW >= 150 ? 4 : 3), picks = [];
    for (let x = 12; x < WW - 8 && picks.length < 16; x += 3) if (!busy.some(([a, b]) => x >= a && x <= b) && !picks.some(p => Math.abs(p - x) < 18)) picks.push(x);
    const k = Math.min(want, picks.length), xs = [];
    for (let i = 0; i < k; i++) { const x = picks[k > 1 ? Math.round(i * (picks.length - 1) / (k - 1)) : Math.floor(picks.length / 2)]; if (!xs.includes(x)) xs.push(x); } // spread evenly
    xs.forEach((x, i) => {
      const kind = pool[Math.floor(r() * pool.length)];
      V.crowd.push({ kind, x, y: wall ? hy - 17 : hy + 5 + (i % 2) * 2, flip: x > WW / 2, hop: 0, ph: r() * 6, cheer: false });
    });
    V.crowd.sort((a, b) => a.y - b.y);
  }

  // ---------------- update ----------------
  function update(dt) {
    V.t += dt;
    const speed = V.fast ? 4 : 1;
    // step timing
    if (!V.step && V.queue.length) nextStep();
    if (V.step) {
      const st = V.step; st.t += dt * speed;
      if (st.shoot && st.t >= st.shoot.t && !st.shoot.done) { st.shoot.done = true; shoot(st.shoot.from, st.shoot.el, st.shoot.giant); }
      if (st.t >= st.need) { V.step = null; if (V.queue.length) nextStep(); else onQueueEmpty(); }
    }
    if (!V) return;
    // typewriter
    if (V.log.shown < V.log.full.length) V.log.shown = Math.min(V.log.full.length, V.log.shown + dt * 55 * speed * (V.fast ? 3 : 1));
    // hp bars ease toward display snapshot
    for (const side of SIDES) {
      const target = V.disp[side].hp, cur = V.hpShown[side];
      if (cur !== target) { const d = target - cur, stepv = Math.max(Math.abs(d) * 6 * dt * speed, 30 * dt * speed); V.hpShown[side] = Math.abs(d) <= stepv ? target : cur + Math.sign(d) * stepv; }
    }
    updateBars();
    // anims
    const ds = dt * speed;
    for (const side of SIDES) {
      const A = V.a[side];
      dec(A, 'lunge', side === 'o' && V.boss ? 1.4 : 2.2, ds); dec(A, 'hop', 3, ds); dec(A, 'shake', 1, ds); dec(A, 'flash', 1, ds); dec(A, 'poseT', 1, ds); dec(A, 'emoteT', 1, ds);
      dec(A, 'dodge', 2.2, ds); dec(A, 'enter', V.boss && side === 'o' ? 1.1 : 1.6, ds); dec(A, 'drop', 1.1, ds);
      if (A.fainting) A.fainting = Math.min(1, A.fainting + dt * speed * 1.1);
      if (A.poseT <= 0 && !A.win) A.pose = null;
      if (A.emoteT <= 0) A.emote = null;
      if (V.t > A.blinkAt) A.blinkAt = V.t + 2.5 + Math.random() * 3;
    }
    if (V.boss && V.a.o.enter <= 0 && !V.a.o.landed) { V.a.o.landed = true; quake(0.6, 3); sfx('thud'); burst({ x: spot('o').x, y: spot('o').y - 2 }, 'stone', 18, 40); }
    // ambient status fx
    for (const side of SIDES) {
      const d = V.disp[side], sp = spot(side), w = side === 'o' && V.boss ? 40 : side === 'o' && V.wild ? 24 : 16;
      if (V.a[side].fainting) continue;
      if (d.status === 'poison' && Math.random() < dt * 3) V.parts.push({ x: sp.x + (Math.random() - 0.5) * w, y: sp.y - 8 - Math.random() * 10, vx: 0, vy: -12, g: 0, life: 0.7, spr: icons().bubble });
      if (d.status === 'burn' && Math.random() < dt * 4) V.parts.push({ x: sp.x + (Math.random() - 0.5) * w, y: sp.y - 4 - Math.random() * 12, vx: 0, vy: -16, g: 0, life: 0.5, spr: fxs('spark', Math.random() < 0.5 ? '#ff9a3a' : '#fbf236') });
      // a charging boss pulls sparks inward
      if (d.charging && V.boss && side === 'o' && live() && Math.random() < dt * 22) {
        const tp = topOf('o'), a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 16, P = elParticles(V.boss.els[0]);
        V.parts.push({ x: tp.x + Math.cos(a) * r, y: tp.y + Math.sin(a) * r * 0.7, vx: -Math.cos(a) * r * 2.2, vy: -Math.sin(a) * r * 1.5, g: 0, life: 0.42, spr: P.spr[Math.floor(Math.random() * P.spr.length)] });
      }
    }
    for (const p of V.parts) { if (p.delay > 0) { p.delay -= dt; continue; } p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.spin) p.x += Math.sin(V.t * 14 + p.spin) * 0.6; }
    keep(V.parts, partAlive); // (in place: no new arrays every frame)
    for (const p of V.pops) p.t += dt;
    keep(V.pops, popAlive);
    for (const r of V.rings) r.t += dt * speed;
    keep(V.rings, popAlive);
    for (const bm of V.beams) bm.t += dt * speed;
    keep(V.beams, popAlive);
    if (V.quake > 0) V.quake = Math.max(0, V.quake - dt);
    if (V.flashT > 0) V.flashT = Math.max(0, V.flashT - dt);
    if (V.banner) { V.banner.t += dt; if (V.banner.t > V.banner.life) V.banner = null; }
    for (const c of V.clouds) { c.x += c.v * dt; if (c.x > WW + 20) { c.x = -30; c.y = 2 + Math.random() * Math.max(4, HY() - 14); } }
    for (const c of V.crowd) { if (c.hop > 0) c.hop = Math.max(0, c.hop - dt * 2.4); else if (c.cheer && Math.random() < dt * 2.5) c.hop = 1; else if (!c.cheer && Math.random() < dt * 0.08) c.hop = 1; }
    ambient(dt);
    const T = THEMES[V.area] || THEMES.meadow;
    if (T.lightning && live()) { V.boltT -= dt; if (V.boltT <= 0) { V.boltT = 4 + Math.random() * 6; V.bolt = { t: 0, x: Math.round(WW * (0.15 + Math.random() * 0.7)), seed: Math.floor(Math.random() * 1e5) }; if (!calm()) flash('#dfe8fb', 0.18); setTimeout(() => sfx('thud'), 300); } }
    if (V.bolt) { V.bolt.t += dt; if (V.bolt.t > 0.35) V.bolt = null; }
  }
  // weather & theme particles (drawn in front)
  function ambient(dt) {
    const T = THEMES[V.area] || THEMES.meadow, k = T.amb, night = safe(() => PS.clock.night(), 0);
    const add = addAmb, r = Math.random;
    if (k === 'petals' && r() < dt * 1.6) add({ x: -4, y: r() * WH * 0.7, vx: 14 + r() * 10, vy: 5 + r() * 5, sway: r() * 6, life: 12, c: r() < 0.5 ? '#f7b6c8' : '#ffffff', w: 2, h: 1 });
    if ((k === 'fireflies' || (k === 'petals' && night > 0.6)) && r() < dt * 1.4) add({ x: r() * WW, y: HY() + r() * (WH - HY()) * 0.8, vx: (r() - 0.5) * 6, vy: -2 - r() * 3, sway: r() * 6, life: 4, c: '#e2ff96', blink: true, w: 1, h: 1 });
    if (k === 'sprinkles' && r() < dt * 3) add({ x: r() * WW, y: -2, vx: (r() - 0.5) * 4, vy: 16 + r() * 8, life: 14, c: ['#e5535f', '#639bff', '#99e550', '#fbf236', '#ffffff'][Math.floor(r() * 5)], w: r() < 0.5 ? 2 : 1, h: r() < 0.5 ? 1 : 2 });
    if (k === 'snow' && r() < dt * 14) add({ x: r() * (WW + 20) - 10, y: -2, vx: -3 + r() * 2, vy: 10 + r() * 10, sway: r() * 6, life: 20, c: r() < 0.7 ? '#ffffff' : '#dfe8fb', w: r() < 0.3 ? 2 : 1, h: r() < 0.3 ? 2 : 1 });
    if (k === 'embers' && r() < dt * 9) add({ x: r() * WW, y: WH + 2, vx: (r() - 0.5) * 6, vy: -(14 + r() * 18), sway: r() * 6, life: 12, c: r() < 0.5 ? '#ff9a3a' : r() < 0.5 ? '#fbf236' : '#df5a26', w: 1, h: 1, fade: true });
    if (k === 'rain' && r() < dt * 40) add({ x: r() * (WW + 30), y: -4, vx: -22, vy: 110 + r() * 30, life: 3, c: '#9fb8e8', w: 1, h: 3, rain: true });
    if (k === 'wind' && r() < dt * 2.5) add({ x: -12, y: r() * WH * 0.8, vx: 60 + r() * 30, vy: 0, life: 4, c: '#ffffff', w: 6 + Math.floor(r() * 6), h: 1, alpha: 0.6 });
    if (k === 'leaves' && r() < dt * 1.2) add({ x: WW + 4, y: r() * WH * 0.6, vx: -(10 + r() * 8), vy: 6 + r() * 5, sway: r() * 6, life: 14, c: r() < 0.5 ? '#6abe30' : '#99e550', w: 2, h: 1 });
    if (k === 'dust' && r() < dt * 1) add({ x: r() * WW, y: HY() + r() * 20, vx: 3, vy: -2, life: 5, c: '#fff6c8', w: 1, h: 1, blink: true });
    for (const p of V.amb) {
      p.life -= dt; p.x += (p.vx + (p.sway ? Math.sin(V.t * 2 + p.sway) * 6 : 0)) * dt; p.y += p.vy * dt;
      if (p.rain && p.y > WH * 0.4 + ((p.x * 7) % (WH * 0.6))) { p.life = 0; if (Math.random() < 0.3) V.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, g: 0, life: 0.12, spr: icons().splash }); }
    }
    keep(V.amb, ambAlive);
  }
  function addAmb(p) { if (V.amb.length < 90) V.amb.push(p); }
  function dec(A, k, r, ds) { if (A[k] > 0) A[k] = Math.max(0, A[k] - ds * r); }
  // element-flavoured projectiles
  function shoot(from, el, giant) {
    const a = from === 'o' && (V.boss || V.wild) ? topOf('o') : { x: spot(from).x + (from === 'p' ? 10 : -10), y: spot(from).y - 16 };
    const b = topOf(from === 'p' ? 'o' : 'p');
    const ax = a.x, ay = a.y, bx = b.x, by = b.y, P = elParticles(el), I = icons();
    const n = giant ? 26 : 9, life = giant ? 0.3 : 0.22;
    const push = (spr, i, k, extra) => V.parts.push(Object.assign({ x: ax + (Math.random() - 0.5) * (giant ? 16 : 4), y: ay + (Math.random() - 0.5) * (giant ? 12 : 4), vx: (bx - ax) / life, vy: (by - ay) / life, g: 0, life, delay: k * (giant ? 0.3 : 0.12), spr }, extra || {}));
    if (el === 'light' || (giant && el === 'fire')) V.beams.push({ ax, ay, bx, by, t: 0, life: giant ? 0.45 : 0.28, w: giant ? 5 : 2, c: el === 'fire' ? ['#fbf236', '#ff9a3a', '#df5a26'] : ['#ffffff', '#fff27a', '#f6c83a'] });
    for (let i = 0; i < n; i++) {
      const k = i / n;
      switch (el) {
        case 'fire': push(i % 3 === 0 ? I.fireball : P.spr[i % P.spr.length], i, k); break;
        case 'water': push(i % 2 ? I.drop : P.spr[i % P.spr.length], i, k, { vy: (by - ay) / life - 70, g: 560 }); break;
        case 'stone': push(i % 3 === 0 ? I.rock : P.spr[i % P.spr.length], i, k, { vy: (by - ay) / life - 90, g: 760 }); break;
        case 'shadow': push(i % 2 ? I.orb : P.spr[i % P.spr.length], i, k, { spin: i * 1.7 }); break;
        case 'sky': push(i % 2 ? I.wind : P.spr[i % P.spr.length], i, k); break;
        case 'leaf': push(P.spr[i % P.spr.length], i, k, { spin: i * 2.1 }); break;
        case 'sweet': push(i % 3 === 0 ? fxs('heart') : I.sprinkle[i % I.sprinkle.length], i, k, { spin: i }); break;
        case 'light': push(i % 2 ? I.star : P.spr[i % P.spr.length], i, k); break;
        default: push(i % 3 === 0 ? I.star : P.spr[i % P.spr.length], i, k);
      }
    }
  }

  // ---------------- render ----------------
  // far: hills | sea | mountains | peaks | volcano | jungle | stormsea | walls. ground: grass | sand | glow | candy | snow | cloud | rock | basalt | redrock | tiles | fern
  // fixed: ignores day/night. crowd: animals watching. amb: weather particles.
  const THEMES = {
    meadow: { sky: ['#8ecff4', '#a0d7f6', '#b3e0f8', '#c8e9f9'], far: 'hills', hillF: ['#86c08e', '#b2dfb0'], hillN: ['#5fa060', '#8fcf86'], gr: ['#99e550', '#7fd23e', '#6abe30', '#37946e'], pad: ['#c3f08a', '#8fcf86', '#4f9a52'], dots: ['#f7b6c8', '#fbf236', '#ffffff'], props: [['bigtree', -6, 2], ['bush', 0.45, 0], ['tree', 1.02, 1]], clouds: true, ground: 'grass', amb: 'petals', crowd: true },
    beach: { sky: ['#7cc6f2', '#96d2f5', '#b0def8', '#cdebfa'], far: 'sea', sea: ['#639bff', '#4f86e8', '#cbdbfc'], gr: ['#fbecc8', '#f6e2b8', '#f0d29a', '#d9a066'], pad: ['#fff4dc', '#ead3a0', '#c9a66a'], dots: ['#ffffff', '#f7b6c8', '#e0a672'], props: [['palm', -2, 2], ['umbrella', 0.47, 0], ['shells', 0.93, 0]], clouds: true, ground: 'sand', crowd: true },
    moonlit: { sky: ['#1a1840', '#232258', '#2c2c66', '#3a3a80'], far: 'hills', hillF: ['#27345a', '#324570'], hillN: ['#1f4a4c', '#2a5f60'], gr: ['#3f9d89', '#378f7d', '#2f8078', '#1f5452'], pad: ['#6fd0b4', '#3fa590', '#1f5452'], dots: ['#c9a2f0', '#9fd8ff', '#fff27a'], props: [['glowtree', -4, 2], ['glowshroom', 0.46, 0], ['crystal', 1.0, 1]], stars: true, moon: true, theme: 'night', ground: 'glow', amb: 'fireflies', crowd: true },
    candy: { sky: ['#f7b6c8', '#fac4d4', '#fcd5e1', '#ffe6ee'], far: 'hills', hillF: ['#e79ac0', '#f5bfd8'], hillN: ['#c77bc0', '#dea0d8'], gr: ['#fff0f7', '#ffd9ea', '#ffc3dc', '#f08cbc'], pad: ['#ffffff', '#ffd0e4', '#e07ba0'], dots: ['#639bff', '#99e550', '#fbf236', '#df7126'], props: [['lollitree', -4, 2], ['gumdrops', 0.45, 0], ['candycane', 1.0, 1]], clouds: true, theme: 'candy', ground: 'candy', amb: 'sprinkles', crowd: true },
    snow: { sky: ['#8fb8e6', '#a6c8ee', '#bed8f4', '#d6e8fa'], far: 'mountains', mtnB: ['#c4d4ee', '#a8bce0'], mtnF: ['#8aa0c8', '#6b84b0'], cap: ['#ffffff', '#dfe8fb'], gr: ['#ffffff', '#f2f7fd', '#dfe8fb', '#9badb7'], pad: ['#ffffff', '#d6e4f4', '#8aa0c8'], dots: ['#9fd8ff', '#ffffff', '#cbdbfc'], pines: true, clouds: true, fixed: true, ground: 'snow', amb: 'snow', sun: 'pale' },
    peak: { sky: ['#3f6fd8', '#5b8ef0', '#82acf8', '#aeccfc'], far: 'peaks', mtnB: ['#b4bcd8', '#9098bc'], mtnF: ['#7a82a8', '#5a6288'], cap: ['#ffffff', '#dfe8fb'], gr: ['#ffffff', '#f4f8ff', '#e2ecfb', '#a8bce0'], pad: ['#ffffff', '#e6eefc', '#a8bce0'], dots: ['#ffffff', '#cbdbfc'], clouds: true, fixed: true, ground: 'cloud', amb: 'wind', sun: true },
    jungle: { sky: ['#f08a4a', '#f5a86a', '#f9c890', '#fbe0b4'], far: 'jungle', gr: ['#a8c84a', '#98b840', '#86a636', '#5a7a2a'], pad: ['#e0cc90', '#b8a468', '#7a6a40'], dots: ['#f6c83a', '#df7126', '#ffffff'], props: [['palm', -2, 2], ['palm', 1.02, 1]], fixed: true, ground: 'fern', amb: 'leaves', sun: 'big' },
    abyss: { sky: ['#141a30', '#1c2440', '#26305a', '#34406e'], far: 'stormsea', sea: ['#2e4a8a', '#223a70', '#8ab0e8'], gr: ['#5a6680', '#4e5a74', '#445066', '#2a3044'], pad: ['#7a88a4', '#5a6680', '#2a3044'], dots: ['#6e8ac8', '#9fb8e8'], props: [['rock', 0.06, 0], ['rock', 0.95, 1]], fixed: true, ground: 'rock', amb: 'rain', lightning: true, darkClouds: true, theme: 'night' },
    volcano: { sky: ['#1a0a18', '#3a1024', '#6a1a2a', '#a8321e'], far: 'volcano', cone: ['#4a2a3a', '#2e1a2a', '#1e1020'], lava: ['#fbf236', '#ff9a3a', '#df5a26'], gr: ['#4a3a4a', '#3e3040', '#342838', '#1e1624'], pad: ['#6a5260', '#4a3a4a', '#221828'], dots: ['#df5a26', '#ff9a3a'], props: [['rock', 0.05, 0], ['rock', 0.97, 1]], fixed: true, ground: 'basalt', amb: 'embers', theme: 'night' },
    sunfire: { sky: ['#c8401e', '#e0622a', '#f08a3a', '#f8b85a'], far: 'volcano', cone: ['#8a4a3a', '#6a3428', '#4a2018'], lava: ['#fbf236', '#ff9a3a', '#df5a26'], gr: ['#e8a870', '#d8945c', '#c47e4a', '#8a4a2a'], pad: ['#f6d2ad', '#e0a672', '#a8653a'], dots: ['#fbf236', '#8a4a2a'], props: [['rock', 0.05, 0], ['rock', 0.97, 1]], fixed: true, ground: 'redrock', amb: 'embers', sun: 'big' },
    tower: { sky: ['#2c2c66', '#3a4aa8', '#5b6ee1', '#8a9ce8'], far: 'walls', wall: ['#c8d0dc', '#9aa4b8', '#6e7690', '#4a4e64'], gr: ['#d8c8a8', '#ccb898', '#c0aa88', '#8a7a5e'], pad: ['#f4e9cc', '#d8c8a8', '#8a7a5e'], dots: ['#8a7a5e'], stars: true, fixed: true, ground: 'tiles', amb: 'dust', crowd: 'mix', torches: true },
  };
  const NIGHT_SKY = ['#10102a', '#171740', '#1f1d4a', '#2c2c66'];
  const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return n >>> 0; };
  function mix(a, b, k) {
    if (!k) return a;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(lerp(pa >> 16, pb >> 16, k)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k)), bl = Math.round(lerp(pa & 255, pb & 255, k));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function ellipse(g, cx, cy, rx, ry, fill, rim, shade) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
      px(g, cx - w, cy + y, w * 2 + 1, 1, y > ry * 0.35 ? shade : y < -ry * 0.4 ? rim : fill);
      px(g, cx - w - 1, cy + y, 1, 1, INK); px(g, cx + w + 1, cy + y, 1, 1, INK);
    }
    const w0 = Math.round(rx * 0.15); px(g, cx - w0, cy - ry - 1, w0 * 2 + 1, 1, INK); px(g, cx - w0, cy + ry + 1, w0 * 2 + 1, 1, INK);
    for (let x = -rx; x <= rx; x++) { const yy = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)))); px(g, cx + x, cy - yy - 1, 1, 1, INK); px(g, cx + x, cy + yy + 1, 1, 1, INK); }
  }
  function disc(g, cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); px(g, cx - w, cy + y, w * 2 + 1, 1, c); } }
  // faceted mountain range: lit left faces, shaded right faces, snow caps on the tall peaks
  function range(g, hy, base, amp, per, ph, cols, cap) {
    const hAt = x => { const t = (((x + ph) / per) % 1 + 1) % 1, tri = 1 - Math.abs(t * 2 - 1); return base + amp * tri * (0.75 + 0.25 * Math.sin((x + ph) * 0.9 / per * 6.28)) + Math.sin(x * 0.37 + ph) * 1.2; };
    for (let x = 0; x < WW; x++) {
      const h = Math.round(hAt(x)), up = hAt(x + 1) >= hAt(x), top = hy - h;
      px(g, x, top, 1, h, up ? cols[0] : cols[1]);
      px(g, x, top, 1, 1, INK);
      if (cap) { const d = h - (base + amp * 0.62); if (d > 0) px(g, x, top + 1, 1, Math.round(d * 0.8) + 1, up ? cap[0] : cap[1]); }
    }
  }
  function pine(g, x, y, h, cols, snowy) {
    px(g, x, y - 3, 1, 3, '#5a3322');
    for (let i = 0; i < h; i++) { const w = Math.round((i % 5) * 0.9 + i * 0.28) + 1, yy = y - 3 - h + i; px(g, x - w, yy, w * 2 + 1, 1, i % 5 === 0 && snowy ? '#ffffff' : (i % 5 < 2 ? cols[0] : cols[1])); px(g, x - w - 1, yy, 1, 1, INK); px(g, x + w + 1, yy, 1, 1, INK); }
    px(g, x, y - 4 - h, 1, 1, INK);
  }
  function volcanoCone(g, hy, T, cx, H, small) {
    const [c0, c1, c2] = T.cone, lava = T.lava;
    for (let x = Math.floor(cx - H * 1.1); x <= cx + H * 1.1; x++) {
      const d = Math.abs(x - cx), h = Math.round(H - Math.max(0, d - (small ? 2 : 5)) * 0.95);
      if (h <= 0) continue;
      px(g, x, hy - h, 1, h, x < cx - 2 ? c0 : x > cx + 3 ? c2 : c1); px(g, x, hy - h, 1, 1, INK);
    }
    const cw = small ? 2 : 5;
    px(g, cx - cw, hy - H, cw * 2 + 1, 1, lava[1]); px(g, cx - 1, hy - H, 3, 1, lava[0]);
    if (!small) for (const [sx, dir] of [[cx - 3, -1], [cx + 2, 1]]) { let x = sx; for (let i = 1; i < H * 0.7; i++) { if (i % 3 === 0) x += dir; px(g, x, hy - H + i, 1, 1, i % 4 ? lava[2] : lava[1]); } }
    const smoke = small ? ['#8a7a8a', '#6a5a6a'] : ['#5a4a5a', '#3e3040'];
    for (const [dx, dy, r] of small ? [[1, -4, 2], [3, -8, 3]] : [[1, -5, 3], [5, -11, 4], [2, -19, 5]]) { disc(g, cx + dx, hy - H + dy, r, smoke[1]); disc(g, cx + dx - 1, hy - H + dy - 1, r - 1, smoke[0]); }
  }
  function drawBg(night) {
    const T = THEMES[V.area] || THEMES.meadow, g = bgx, hy = HY();
    if (T.fixed) night = 0;
    const k = T.theme === 'night' ? night * 0.4 : night * 0.85;
    g.clearRect(0, 0, WW, WH);
    // stepped sky with dithered band edges
    const bandH = Math.ceil(hy / 4);
    for (let i = 0; i < 4; i++) px(g, 0, i * bandH, WW, bandH + 1, mix(T.sky[i], NIGHT_SKY[i], k));
    for (let i = 1; i < 4; i++) { const c = mix(T.sky[i], NIGHT_SKY[i], k), y = i * bandH; for (let x = (i % 2); x < WW; x += 2) { px(g, x, y - 1, 1, 1, c); px(g, x + 1, y - 2, 1, 1, c); } }
    // stars & moon / sun
    if (T.stars || night > 0.35) {
      const sa = T.stars ? 1 : clamp((night - 0.35) / 0.4, 0, 1);
      for (let i = 0; i < 40; i++) { const h = hash(i * 7 + 3); if (h % 3 && sa < 0.7) continue; px(g, h % WW, (h >>> 8) % Math.max(1, hy - 6), 1, 1, (h >>> 3) % 4 ? '#cbdbfc' : '#ffffff'); }
    }
    if (T.moon || (night > 0.5 && !T.fixed)) { const mx = Math.round(WW * 0.5), my = Math.round(hy * 0.32); for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) px(g, mx + x, my + y, 1, 1, (x - 2) * (x - 2) + (y + 1) * (y + 1) <= 9 ? mix(T.sky[0], NIGHT_SKY[0], k) : '#fff6c8'); }
    else if (T.sun === 'big') { const sx = Math.round(WW * 0.3), sy = Math.round(hy * 0.55); disc(g, sx, sy, 11, mix(T.sky[3], '#ffffff', 0.25)); disc(g, sx, sy, 8, '#fff27a'); disc(g, sx - 2, sy - 2, 4, '#fffcd0'); }
    else if (T.sun === 'pale') { const sx = Math.round(WW * 0.16), sy = Math.round(hy * 0.28); disc(g, sx, sy, 4, '#fffcd0'); disc(g, sx, sy, 2, '#ffffff'); }
    else if ((T.sun || !T.fixed) && !T.moon && night < 0.5 && V.area !== 'candy' && T.far !== 'walls') { const sx = Math.round(WW * 0.14), sy = Math.round(hy * 0.3); for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) px(g, sx + x, sy + y, 1, 1, x * x + y * y <= 4 ? '#fff27a' : '#fbe36a'); }
    // far band
    switch (T.far) {
      case 'sea': case 'stormsea': {
        const storm = T.far === 'stormsea', top = storm ? 12 : 7;
        if (storm) for (const [x0, w, h] of [[0.12, 5, 16], [0.2, 3, 10], [0.83, 6, 20], [0.9, 3, 9]]) { const x = Math.round(WW * x0); for (let i = 0; i < h; i++) { const ww = Math.max(1, Math.round(w * (i / h))); px(g, x - ww, hy - top - h + i, ww * 2 + 1, 1, i < 2 ? '#3a4668' : '#2a3450'); } }
        for (let y = hy - top; y < hy; y++) px(g, 0, y, WW, 1, mix(y < hy - top + 2 ? T.sea[1] : T.sea[0], '#1a2a5a', k * 0.6));
        for (let x = 0; x < WW; x++) { const h = hash(x * 13); if (h % (storm ? 4 : 7) === 0) px(g, x, hy - top + 1 + (h >>> 4) % (top - 1), storm ? 3 : 2, 1, mix(T.sea[2], '#6070a0', k * 0.6)); }
        px(g, 0, hy - top, WW, 1, mix(storm ? '#8ab0e8' : '#e8f4ff', '#40507a', k * 0.6));
        break;
      }
      case 'mountains': case 'peaks': {
        range(g, hy, T.far === 'peaks' ? 20 : 12, T.far === 'peaks' ? 34 : 30, 62, 17, T.mtnB, T.cap);
        range(g, hy, T.far === 'peaks' ? 10 : 4, T.far === 'peaks' ? 24 : 22, 44, 41, T.mtnF, T.cap);
        if (T.far === 'peaks') for (let x = -6; x < WW + 6; x += 7) { const h = hash(x + 99); disc(g, x, hy - 3 - (h % 3), 5 + (h >>> 5) % 3, '#ffffff'); disc(g, x + 1, hy + 1, 5, '#e2ecfb'); }
        break;
      }
      case 'volcano': {
        range(g, hy, 3, 10, 38, 5, [mix(T.cone[0], T.sky[3], 0.4), mix(T.cone[1], T.sky[3], 0.4)]);
        volcanoCone(g, hy, T, Math.round(WW * 0.58), Math.min(Math.round(hy * 0.72), 52));
        for (let x = 0; x < WW; x++) if (hash(x * 5) % 3 === 0) px(g, x, hy - 1, 1, 1, T.lava[2]);
        break;
      }
      case 'jungle': {
        volcanoCone(g, hy, { cone: ['#b07a70', '#96645c', '#7a5048'], lava: ['#fbf236', '#ff9a3a', '#df5a26'] }, Math.round(WW * 0.72), Math.min(Math.round(hy * 0.5), 30), true);
        for (let x = 0; x < WW; x++) { const h = 7 + Math.round(3 * Math.abs(Math.sin(x * 0.19)) + 2 * Math.sin(x * 0.05 + 1)); px(g, x, hy - h, 1, 1, INK); px(g, x, hy - h + 1, 1, h, x % 9 < 4 ? '#3f8a4a' : '#2f6a3a'); if (hash(x * 3) % 5 === 0) px(g, x, hy - h + 1, 1, 1, '#6abe30'); }
        break;
      }
      case 'walls': {
        const W = T.wall, top = hy - 16;
        for (let x = 0; x < WW; x += 6) px(g, x, top - 3, 4, 3, W[1]);
        px(g, 0, top, WW, 16, W[1]);
        for (let y = top; y < hy; y += 3) { px(g, 0, y, WW, 1, W[2]); for (let x = ((y - top) / 3) % 2 ? 0 : 4; x < WW; x += 8) px(g, x, y, 1, 3, W[2]); }
        px(g, 0, top, WW, 1, W[0]);
        for (let x = 0; x < WW; x += 6) { px(g, x, top - 3, 4, 1, W[0]); px(g, x - 1, top - 3, 1, 3, INK); px(g, x + 4, top - 3, 1, 3, INK); px(g, x - 1, top - 4, 6, 1, INK); }
        V.torches = [];
        const cols = ['#e5535f', '#f6c83a', '#639bff', '#6abe30'];
        for (let i = 0, x = 10; x < WW - 6; x += 24, i++) {
          px(g, x - 3, top + 5, 7, 11, W[3]); px(g, x - 2, top + 4, 5, 1, W[3]); px(g, x - 1, top + 3, 3, 1, W[3]);
          const bx = x + 12; if (bx < WW - 4) { px(g, bx - 2, top + 1, 5, 9, cols[i % 4]); px(g, bx - 2, top + 10, 2, 1, cols[i % 4]); px(g, bx + 1, top + 10, 2, 1, cols[i % 4]); px(g, bx, top + 3, 1, 3, '#ffffff'); px(g, bx - 3, top + 1, 1, 10, INK); px(g, bx + 3, top + 1, 1, 10, INK); }
          V.torches.push({ x: x + 6, y: top + 6 });
        }
        break;
      }
      default: {
        for (let x = 0; x < WW; x++) {
          const h1 = 7 + Math.round(3 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.19 + 1.3)), h2 = 3 + Math.round(2 * Math.sin(x * 0.11 + 0.5) + 1.5 * Math.sin(x * 0.27));
          px(g, x, hy - h1, 1, 1, mix(T.hillF[0], NIGHT_SKY[3], k * 0.7)); px(g, x, hy - h1 + 1, 1, h1, mix(T.hillF[1], NIGHT_SKY[3], k * 0.7));
          px(g, x, hy - h2, 1, 1, mix(T.hillN[0], '#1a1d40', k * 0.6)); px(g, x, hy - h2 + 1, 1, h2, mix(T.hillN[1], '#1a1d40', k * 0.6));
        }
      }
    }
    // ground with soft perspective bands
    const gk = k * 0.55, G = c => mix(c, '#10102a', gk);
    px(g, 0, hy, WW, 1, G(T.gr[3]));
    for (let y = hy + 1; y < WH; y++) {
      const d = (y - hy) / (WH - hy), band = Math.floor(Math.sqrt(y - hy) * 2.2) % 2;
      px(g, 0, y, WW, 1, G(d < 0.12 ? T.gr[2] : band ? T.gr[1] : T.gr[0]));
    }
    for (let i = 0; i < WW * WH / 45; i++) {
      const h = hash(i * 31 + 7), x = h % WW, y = hy + 2 + (h >>> 8) % Math.max(1, WH - hy - 2), c = (h >>> 5) % 11;
      if (c < 6) px(g, x, y, 1, 1, G(T.gr[3]));
      else if (c < 8) { px(g, x, y, 1, 1, G(T.gr[2])); px(g, x + 1, y - 1, 1, 1, G(T.gr[2])); }
      else if (c === 9) px(g, x, y, 1, 1, mix(T.dots[(h >>> 12) % T.dots.length], '#10102a', gk * 0.6));
    }
    groundDetail(g, T, hy, G);
    // props on the horizon
    if (T.pines) { pine(g, 6, hy + 4, 18, ['#3f8a6a', '#2a6a52'], true); pine(g, 15, hy + 2, 12, ['#3f8a6a', '#2a6a52'], true); pine(g, WW - 7, hy + 5, 20, ['#3f8a6a', '#2a6a52'], true); pine(g, Math.round(WW * 0.46), hy + 1, 9, ['#4a9a78', '#2f7a5e'], true); }
    for (const [kind, fx0, flip] of T.props || []) {
      const c = safe(() => PX.prop(kind, T.theme || (night > 0.5 ? 'night' : 'day')), null); if (!c) continue;
      const x = fx0 < 0 ? fx0 + c.width / 2 : fx0 > 1 ? WW - c.width / 2 + 4 : Math.round(WW * fx0 - (kind === 'rock' ? 0 : 10));
      const y = kind === 'shells' || kind === 'gumdrops' ? hy + 8 : kind === 'rock' ? hy + 10 : hy + 3;
      g.save(); if (night > 0.3 && T.theme !== 'night') g.filter = `brightness(${1 - night * 0.35})`; else if (V.area === 'volcano' || V.area === 'abyss') g.filter = 'brightness(0.6)';
      PX.blit(g, c, x, y, flip === 1); g.restore();
    }
    // arena pads
    for (const side of ['o', 'p']) {
      const s = spot(side), big = side === 'o' && V.boss, wild = side === 'o' && V.wild, rx = big ? 32 : wild ? 12 : side === 'o' ? 18 : 22, ry = big ? 6 : wild ? 3 : side === 'o' ? 4 : 5;
      ellipse(g, s.x, s.y - 1, rx, ry, G(T.pad[1]), G(T.pad[0]), G(T.pad[2]));
      if (T.ground === 'tiles') { for (let a = 0; a < 6.28; a += 0.8) px(g, Math.round(s.x + Math.cos(a) * rx * 0.6), Math.round(s.y - 1 + Math.sin(a) * ry * 0.5), 1, 1, T.pad[2]); }
    }
    if (night > 0.02 && T.theme !== 'night' && !T.fixed) { g.fillStyle = `rgba(20,18,64,${0.18 * night})`; g.fillRect(0, hy, WW, WH - hy); }
  }
  function groundDetail(g, T, hy, G) {
    const n = Math.round(WW * (WH - hy) / 60);
    for (let i = 0; i < n; i++) {
      const h = hash(i * 131 + 17), x = h % WW, y = hy + 3 + (h >>> 9) % Math.max(1, WH - hy - 4), d = (y - hy) / (WH - hy), v = (h >>> 3) % 7;
      switch (T.ground) {
        case 'grass': if (v < 3) { const c = G(T.gr[3]); px(g, x, y, 1, 1, c); px(g, x - 1, y - 1, 1, 1, c); px(g, x + 1, y - 1, 1, 1, c); if (d > 0.4) px(g, x, y - 2, 1, 1, c); } else if (v === 3) { px(g, x, y, 1, 1, G('#ffffff')); px(g, x, y - 1, 1, 1, G(T.dots[(h >>> 11) % 2])); } break;
        case 'fern': if (v < 3) { const c = G(T.gr[3]); for (let j = 0; j < 3; j++) { px(g, x - j, y - j, 1, 1, c); px(g, x + j, y - j, 1, 1, c); } px(g, x, y - 3, 1, 1, c); } else if (v === 3) px(g, x, y, 3, 2, G('#8a6a40')); break;
        case 'sand': if (v < 3) px(g, x, y, 3 + (h >>> 13) % 4, 1, G('#fff8e6')); else if (v === 3) { px(g, x, y, 2, 1, '#f7b6c8'); px(g, x, y + 1, 2, 1, '#e07ba0'); } break;
        case 'glow': if (v === 0) { px(g, x, y, 1, 1, '#a6f2d3'); } break;
        case 'candy': if (v < 2) px(g, x, y, 2, 1, ['#e5535f', '#639bff', '#99e550', '#fbf236'][(h >>> 12) % 4]); break;
        case 'snow': if (v < 2) px(g, x, y, 3 + (h >>> 13) % 5, 1, '#dfe8fb'); else if (v === 2) { px(g, x, y, 1, 1, '#ffffff'); px(g, x - 1, y, 1, 1, '#cbdbfc'); px(g, x + 1, y, 1, 1, '#cbdbfc'); } break;
        case 'cloud': if (v === 2) px(g, x, y, 4, 1, '#c8d8f4'); break;
        case 'rock': if (v === 0) { const w = 3 + (h >>> 12) % 4; px(g, x - w, y, w * 2, 2, '#6e8ac8'); px(g, x - w + 1, y, 2, 1, '#9fb8e8'); } else if (v < 3) px(g, x, y, 2, 1, '#2a3044'); break;
        case 'basalt': if (v < 2) { let cx = x, cy = y; for (let j = 0; j < 7; j++) { px(g, cx, cy, 1, 1, j % 3 ? T.lava[2] : T.lava[1]); cx += (hash(h + j) % 3) - 1; cy += (j % 2); } } else if (v === 2) px(g, x, y, 2, 1, '#221828'); break;
        case 'redrock': if (v < 2) { let cx = x; for (let j = 0; j < 5; j++) { px(g, cx, y + (j % 2), 1, 1, '#8a4a2a'); cx++; } } else if (v === 2) px(g, x, y, 2, 2, '#f6d2ad'); break;
      }
    }
    if (T.ground === 'cloud') { // rows of puffy cloud tops, bigger nearer the front
      for (let row = 0, y = hy + 5; y < WH + 6; row++, y += 7 + row * 3) {
        const r = 3 + row, step = r * 2 + 3;
        for (let x = (row % 2) * Math.round(step / 2) - r; x < WW + r; x += step) { disc(g, x + 1, y + 1, r, '#c8d8f4'); disc(g, x, y, r, '#ffffff'); disc(g, x - 1, y - Math.ceil(r / 2), Math.max(1, r - 2), '#ffffff'); }
      }
    }
    if (T.ground === 'tiles') {
      const vx = WW / 2, vy = hy - 60, c = T.gr[3];
      for (let i = 1; i < 9; i++) { const y = Math.round(hy + (WH - hy) * Math.pow(i / 9, 1.5)); px(g, 0, y, WW, 1, c); }
      for (let i = -8; i <= 8; i++) { const bx = vx + i * 22; for (let y = hy + 1; y < WH; y++) { const t = (y - vy) / (WH - vy); px(g, Math.round(vx + (bx - vx) * t), y, 1, 1, c); } }
    }
  }

  const tintCache = new WeakMap();
  function whiteOf(c) {
    let w = tintCache.get(c); if (w) return w;
    w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const x = w.getContext('2d');
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height);
    tintCache.set(c, w); return w;
  }
  // big boss sprite (whole-pixel scaled) and its glowing charge aura
  const bigCache = {};
  function bigCritter(id, S, f) {
    const key = id + S + ':' + (f || 0); if (bigCache[key]) return bigCache[key];
    const c = PX.critter(id, f || 0), o = document.createElement('canvas'); o.width = c.width * S; o.height = c.height * S;
    const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height);
    return (bigCache[key] = o);
  }
  const auraCache = {};
  function auraOf(c, col, key) {
    if (auraCache[key]) return auraCache[key];
    const o = document.createElement('canvas'); o.width = c.width + 6; o.height = c.height + 6; const x = o.getContext('2d');
    const w = whiteOf(c); for (const [dx, dy] of [[0, 3], [6, 3], [3, 0], [3, 6], [1, 1], [5, 1], [1, 5], [5, 5]]) x.drawImage(w, dx, dy);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, o.width, o.height);
    x.globalCompositeOperation = 'destination-out'; x.drawImage(c, 3, 3);
    return (auraCache[key] = o);
  }
  function poseFor(side) {
    const A = V.a[side], f = V.b[side], d = V.disp[side];
    if (A.pose) return A.pose;
    if (A.win) return { arms: 'up', eyes: 'happy', mouth: 'open', frame: Math.floor(V.t * 4) % 2 };
    if (d.status === 'sleep') return { eyes: 'closed', mouth: 'flat' };
    if (d.stun) return { eyes: 'sad', mouth: 'o' };
    if (V.phase === 'end' && V.b.winner !== side) return { eyes: 'closed', mouth: 'o' };
    if (d.hp / f.max < 0.25) return { eyes: 'sad', mouth: 'flat' };
    if (V.boss && side === 'p' && d.hp / f.max >= 0.25 && V.disp.o.charging) return { eyes: 'brave', mouth: 'o' };
    if (A.blinkAt - V.t < 0.13) return { eyes: 'blink' };
    return {};
  }
  function sprigFor(side) {
    const f = V.b[side], A = V.a[side], P = poseFor(side), k = `${P.eyes || ''}|${P.mouth || ''}|${P.arms || ''}|${P.frame || 0}`;
    const m = A.memo || (A.memo = {});
    return m[k] || (m[k] = safe(() => PX.sprig(f.look, P), null));
  }
  const live = () => V && (V.phase === 'choose' || V.phase === 'play' || V.phase === 'intro' || V.phase === 'pass');
  function drawFighter(side) {
    const f = V.b[side], A = V.a[side], sp = spot(side), dir = side === 'p' ? 1 : -1, boss = side === 'o' && V.boss, crit = side === 'o' && !!f.critter;
    let spr, ax, ay, flip;
    const pf = crit && !boss && D.ANIMALS[f.critter] && D.ANIMALS[f.critter].kind === 'plant' && !A.fainting ? [0, 1, 0, 1, 0, 2][Math.floor(V.t * 3) % 6] : 0; // living plants sway and blink
    if (crit) { spr = safe(() => bigCritter(f.critter, critScale(), pf), null); if (!spr) return; ax = Math.floor(spr.width / 2); ay = spr.height; flip = true; }
    else { if (!f.look) return; spr = sprigFor(side); if (!spr) return; ax = PX.SPRIG_AX || 16; ay = spr.height - 1; flip = side === 'p'; }
    let x = sp.x, y = sp.y;
    const bob = V.phase !== 'end' && !A.fainting && Math.floor(V.t * (boss ? 1.3 : 2) + (side === 'o' ? 1 : 0)) % 2 ? -1 : 0;
    y += bob;
    if (crit && !boss && D.ANIMALS[f.critter] && (D.ANIMALS[f.critter].where === 'water' || D.ANIMALS[f.critter].where === 'air') && !A.fainting) y -= 3 + Math.round(Math.sin(V.t * 3) * 2); // swimmers and fliers hover
    if (A.enter > 0) { if (boss) y -= Math.round(ease(A.enter) * WH); else { x -= dir * Math.round((1 - ease(1 - A.enter)) * (WW * 0.55)); y -= Math.round(Math.abs(Math.sin(A.enter * Math.PI * 3)) * 4 * A.enter); } }
    const reach = boss ? 20 : 12;
    if (A.lunge > 0) { const k = 1 - A.lunge, l = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; x += dir * Math.round(reach * l); y -= Math.round((boss ? 8 : 4) * Math.sin(Math.PI * clamp(k / 0.5, 0, 1))); }
    if (A.hop > 0) y -= Math.round(6 * Math.sin(Math.PI * (1 - A.hop)));
    if (A.win) y -= Math.round(Math.abs(Math.sin(V.t * 7)) * (boss ? 3 : 5));
    if (A.dodge > 0) x -= dir * Math.round(7 * Math.sin(Math.PI * (1 - A.dodge)));
    if (A.shake > 0) x += Math.round(Math.sin(V.t * 70) * 2);
    if (boss && V.disp.o.charging && !A.fainting && live() && !calm()) x += Math.round(Math.sin(V.t * 40));
    let alpha = 1;
    if (A.fainting) { alpha = 1 - ease(A.fainting); y += Math.round(ease(A.fainting) * (boss ? 14 : 7)); }
    if (alpha <= 0.02) return;
    // shadow
    const sw = crit ? spr.width * 0.36 : 9;
    const sh = A.fainting ? 0 : clamp(Math.round((sp.y - y) / (boss ? 6 : 1)), 0, 8);
    lx.fillStyle = 'rgba(34,32,52,.25)'; lx.fillRect(Math.round(x - sw + sh), sp.y - 1, Math.round(sw * 2 + 1 - sh * 2), 2);
    lx.globalAlpha = alpha;
    // glowing aura while a boss charges its giant attack
    if (boss && V.disp.o.charging && !A.fainting && live()) {
      const au = auraOf(spr, '#fbf236', 'a' + f.critter + bossScale()), au2 = auraOf(spr, '#df5a26', 'b' + f.critter + bossScale());
      PX.blit(lx, Math.floor(V.t * 8) % 2 ? au : au2, x, y + 3, flip, ax + 3, ay + 3);
    }
    PX.blit(lx, spr, x, y, flip, ax, ay);
    if (A.flash > 0 && Math.floor(A.flash * 30) % 2 === 0) PX.blit(lx, whiteOf(spr), x, y, flip, ax, ay);
    lx.globalAlpha = 1;
    const em = A.emote || (V.disp[side].status === 'sleep' ? 'zz' : V.disp[side].stun ? 'swirl' : null);
    if (em && !A.fainting) { const e = safe(() => PX.emote(em), null); if (e) PX.blit(lx, e, x + (crit ? -Math.round(spr.width * 0.3) : 7), y - (crit ? spr.height - 4 : 26) - (Math.floor(V.t * 3) % 2), false, 0, e.height); }
  }
  function drawCrowd() {
    for (const c of V.crowd) {
      const spr = safe(() => PX.critter(c.kind), null); if (!spr) continue;
      const bob = Math.floor(V.t * 1.5 + c.ph) % 2 ? 0 : -1, hop = c.hop > 0 ? Math.round(Math.sin(Math.PI * (1 - c.hop)) * 5) : 0;
      PX.blit(lx, spr, c.x, c.y + bob - hop, c.flip);
    }
  }
  function drawRing(r) {
    if (r.t < 0) return;
    const k = r.t / r.life, rad = 2 + ease(k) * r.r;
    lx.globalAlpha = 1 - k; lx.fillStyle = r.color;
    const n = Math.max(12, Math.round(rad * 3));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; lx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad * 0.7), 1, 1); }
    lx.globalAlpha = 1;
  }
  function drawBeam(bm) {
    const k = bm.t / bm.life, grow = clamp(k * 4, 0, 1), fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    const ex = lerp(bm.ax, bm.bx, grow), ey = lerp(bm.ay, bm.by, grow), len = Math.hypot(ex - bm.ax, ey - bm.ay), n = Math.ceil(len);
    lx.globalAlpha = fade;
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n), x = Math.round(lerp(bm.ax, ex, t)), y = Math.round(lerp(bm.ay, ey, t)), w = bm.w + (Math.floor(V.t * 30 + i) % 3 === 0 ? 1 : 0);
      lx.fillStyle = bm.c[2]; lx.fillRect(x, y - w, 1, w * 2 + 1);
      lx.fillStyle = bm.c[1]; lx.fillRect(x, y - w + 1, 1, Math.max(1, w * 2 - 1));
      lx.fillStyle = bm.c[0]; lx.fillRect(x, y - Math.floor(w / 2), 1, Math.max(1, w));
    }
    lx.globalAlpha = 1;
  }
  function drawBolt(b) {
    let x = b.x, y = 0; const r = srng(b.seed), hy = HY();
    lx.globalAlpha = 1 - b.t / 0.35; lx.fillStyle = '#ffffff';
    while (y < hy - 6) { const nx = x + Math.round((r() - 0.5) * 6), ny = y + 3 + Math.round(r() * 3); for (let i = 0; i <= ny - y; i++) lx.fillRect(Math.round(lerp(x, nx, i / (ny - y))), y + i, 1, 1); x = nx; y = ny; }
    lx.globalAlpha = 1;
  }
  function render() {
    if (!cssW) return;
    const night = safe(() => PS.clock.night(), 0), T = THEMES[V.area] || THEMES.meadow;
    // (the area only changes in launch(), which resets bgKey)
    const key = (T.fixed ? 0 : Math.round(night * 30)) + (V.boss ? 40 : 0) + (V.wild ? V.wild.step + 1 : 0) * 100 + WW * 1e3 + WH * 1e6;
    if (key !== bgKey) { bgKey = key; drawBg(night); }
    lx.clearRect(0, 0, WW, WH);
    lx.drawImage(bgC, 0, 0);
    const nk = T.fixed ? 0 : night;
    if (T.clouds && nk < 0.8) { lx.globalAlpha = 1 - nk * 0.7; for (const c of V.clouds) lx.drawImage(icons().clouds[c.k], Math.round(c.x), Math.round(c.y)); lx.globalAlpha = 1; }
    if (T.darkClouds) for (const c of V.clouds) lx.drawImage(icons().darkclouds[c.k], Math.round(c.x), Math.round(c.y * 0.6));
    if (T.stars) for (let i = 0; i < 6; i++) { const h = hash(i * 97 + 1), on = Math.floor(V.t * 1.5 + i) % 3 === 0; if (on) px(lx, h % WW, (h >>> 7) % Math.max(1, HY() - 8), 1, 1, '#ffffff'); }
    if (V.bolt) drawBolt(V.bolt);
    if (T.torches && V.torches) for (const t of V.torches) { const f = Math.floor(V.t * 10 + t.x) % 3; px(lx, t.x - 1, t.y + 2, 3, 3, '#8f563b'); px(lx, t.x - 1, t.y - 1 - (f === 1 ? 1 : 0), 3, 3, '#df5a26'); px(lx, t.x, t.y - 2 - f % 2, 1, 3, '#fbf236'); if (f === 2) px(lx, t.x + (f - 1), t.y - 4, 1, 1, '#ff9a3a'); }
    drawCrowd();
    drawFighter('o'); drawFighter('p');
    for (const bm of V.beams) drawBeam(bm);
    for (const p of V.parts) {
      if (p.delay > 0 || !p.spr) continue;
      if (p.blink && ((V.t * 18 + p.blink) | 0) % 3 === 0) continue; // embers flicker, sparkles twinkle
      lx.globalAlpha = clamp(p.life * 3, 0, 1);
      lx.drawImage(p.spr, Math.round(p.x - p.spr.width / 2), Math.round(p.y - p.spr.height / 2));
    }
    lx.globalAlpha = 1;
    for (const r of V.rings) drawRing(r);
    for (const p of V.amb) {
      if (p.blink && Math.floor(V.t * 3 + p.x) % 3 === 0) continue;
      lx.globalAlpha = p.alpha || (p.fade ? clamp(p.life / 3, 0, 1) : 1); lx.fillStyle = p.c; lx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
    }
    lx.globalAlpha = 1;
    if (V.flashT > 0) { lx.globalAlpha = clamp(V.flashT / (V.flashL || 0.3), 0, 1) * (V.flashA || 0.7); lx.fillStyle = V.flashC; lx.fillRect(0, 0, WW, WH); lx.globalAlpha = 1; }
    if (V.boss && V.disp.o.charging && live()) { lx.globalAlpha = calm() ? 0.1 : 0.1 + 0.08 * Math.sin(V.t * 8); lx.fillStyle = '#e5535f'; lx.fillRect(0, 0, WW, WH); lx.globalAlpha = 1; } // reduced motion: steady, no pulsing
    // upscale (with screen shake)
    let qx = 0, qy = 0;
    if (V.quake > 0) { const a = Math.max(1, Math.round(V.quakeA * Math.min(1, V.quake * 2))); qx = Math.round((Math.random() * 2 - 1) * a); qy = Math.round((Math.random() * 2 - 1) * a); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, cv.width, cv.height);
    const sc = SC; // whole-pixel scale: shaking shifts the picture and repeats its edge row/column into the gap (never stretches it)
    ctx.drawImage(lo, qx * sc, qy * sc, WW * sc, WH * sc);
    if (qx > 0) ctx.drawImage(lo, 0, 0, 1, WH, 0, qy * sc, qx * sc, WH * sc);
    if (qx < 0) ctx.drawImage(lo, WW - 1, 0, 1, WH, (WW + qx) * sc, qy * sc, -qx * sc, WH * sc);
    if (qy > 0) ctx.drawImage(lo, 0, 0, WW, 1, qx * sc, 0, WW * sc, qy * sc);
    if (qy < 0) ctx.drawImage(lo, 0, WH - 1, WW, 1, qx * sc, (WH + qy) * sc, WW * sc, -qy * sc);
    // crisp text layer
    ctx.setTransform(dpr, 0, 0, dpr, qx * SC, qy * SC);
    for (const p of V.pops) {
      const k = p.t / p.life, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, up = ease(Math.min(1, k * 2.2)) * 14;
      const s = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : k < 0.2 ? 1.1 - (k - 0.12) / 0.08 * 0.1 : 1;
      ctx.globalAlpha = a;
      const tx = Math.round(p.x * WPX), ty = Math.round((p.y - up) * WPX);
      bigText(p.text, tx, ty, Math.round(p.size * s), p.color);
      if (p.tag) bigText(p.tag, tx, Math.round(ty - p.size * 0.95), 13, p.color);
      ctx.globalAlpha = 1;
    }
    if (V.banner) {
      const b = V.banner, k = b.t / b.life, a = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1, s = k < 0.1 ? 0.5 + k / 0.1 * 0.6 : k < 0.16 ? 1.1 - (k - 0.1) / 0.06 * 0.1 : 1;
      const y = cssH * (V.boss ? 0.47 : 0.36), size = Math.round(Math.min(40, cssW / Math.max(6, b.text.length * 0.62)) * s);
      ctx.globalAlpha = a;
      bigText(b.text, Math.round(cssW / 2), Math.round(y), size, b.color);
      if (b.sub) bigText(b.sub, Math.round(cssW / 2), Math.round(y) + 24, 16, '#ffffff');
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // log typewriter
    const nShown = Math.floor(V.log.shown);
    if (nShown !== V.log.drawn || V.log.full !== V.log.drawnFull) {
      if (V.log.full !== V.log.drawnFull) logEl.classList.toggle('long', V.log.full.length > 62);
      V.log.drawn = nShown; V.log.drawnFull = V.log.full; logEl.firstChild.textContent = V.log.full.slice(0, nShown);
    }
    const noMore = !(V.phase === 'play' || V.phase === 'intro' || V.phase === 'end') || V.log.shown < V.log.full.length;
    if (logEl.lastChild.hidden !== noMore) logEl.lastChild.hidden = noMore;
  }
  // Readable canvas text: the pixel font only for big words without digits (its 2/8 and 5/S look alike);
  // everything else in rounded Fredoka, a little larger, with a thinner outline so small letters stay open.
  function bigText(text, x, y, size, col) {
    const pixel = size >= 24 && !/\d/.test(text);
    if (!pixel) size = Math.max(15, Math.round(size * 1.08));
    ctx.font = pixel ? `700 ${size}px "Pixelify Sans", monospace` : `700 ${size}px "Fredoka", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = pixel ? Math.max(4, size / 6) : Math.max(3, Math.round(size / 5.5)); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  function frame(dt) {
    if (V) {
      // The hand-over screen covers the arena completely, and the results card freezes it (its last frame stays
      // behind the dimmed card): no need to redraw the full-resolution canvas 60 times a second.
      if (V.phase === 'pass' || V.phase === 'results') return;
      sizeCheckT -= dt;
      if (sizeDirty || sizeCheckT <= 0) { sizeDirty = false; sizeCheckT = 0.5; resize(); }
      update(dt);
      if (V) render();
      return;
    }
    // hub: idle bob of the partner sprite
    if (hubSprite && hubEl && !hubEl.hidden) {
      hubT += dt; const f = Math.floor(hubT * 1.6) % 4;
      if (f !== hubFrame) { hubFrame = f; const s = partner(); if (s) PS.ui.drawSproutTo(hubSprite, s, f === 3 ? { eyes: 'blink' } : { frame: f % 2 }); }
    }
  }

  PS.scenes.battle = { mount, show, hide, frame };
  Object.assign(window.__battle, { start: startBattle, startWild, startBoss, startTowerFloor, towerBegin, towerEnd, startFriend, renderHub, forfeit, extra, choose,
    tab: t => { hubTab = t; renderHub(); } });
  Object.defineProperty(window.__battle, 'V', { get: () => V });
})();
