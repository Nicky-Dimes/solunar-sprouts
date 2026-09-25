// battle.js — Battle leagues: league hub, turn-based 1v1 fights, results.
// Owns PS.scenes.battle. CSS is injected from here (classes prefixed .b-).
// The rules engine (makeFighter / resolveRound / aiChoose) is pure and has no DOM, so it can run headless
// for balance sims: window.__battle.sim(sprout, leagueId, index, n).
(function () {
  'use strict';
  const PS = window.PS, D = PS.D, ST = PS.state;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

  // ======================================================================
  // Rules engine (pure)
  // ======================================================================
  // Tunables that are not in data.js (yet). dmg = pow × (atk/def)^ratioExp × dmgK × (lvBase + level/dmgLv) × STAB × type × crit × rand
  const TUNE = {
    dmgK: 0.104, lvBase: 1.5, dmgLv: 45, ratioExp: 0.65, rand: [0.9, 1.1],
    accStage: [0.6, 0.7, 0.85, 1, 1.15, 1.3, 1.45], // hit-chance multiplier for (acc stage − eva stage), −3..+3
    npcMult: [0.75, 0.92, 1, 1, 1, 1],               // opponent HP/Attack scale per league (keeps Pebble gentle for a fresh Sprout)
    poisonFrac: 1 / 10, burnFrac: 1 / 12, dotTurns: 4, sleepTurns: [1, 3],
    typeCap: [0.5, 2],
    healFade: 0.75, healFloor: 0.25, // each heal a fighter uses is weaker than the last (stops heal-stalling)
    aiSmart: [0.2, 0.45, 0.6, 0.72, 0.85, 0.95],
    tireAt: 14, tireFrac: 1 / 10,                      // from this round on, both lose HP each round (no endless stalls) // per league index (Pebble → Legend)
  };
  const SURE = new Set(['slowslam']); // "Never misses" (ignores evasion)
  const STAT_NAME = { atk: 'Attack', def: 'Defence', spd: 'Speed', eva: 'Evasion', acc: 'Accuracy' };
  const STAT_SHORT = { atk: 'ATK', def: 'DEF', spd: 'SPD', eva: 'EVA', acc: 'ACC' };
  const STATUS_SHORT = { poison: 'PSN', burn: 'BRN', sleep: 'SLP', stun: 'STN' };
  const arr = v => (!v ? [] : Array.isArray(v) ? v : [v]);
  const sm = n => D.BATTLE.stageMult[clamp(Math.round(n), -3, 3) + 3];

  function makeFighter(s, side, mult) {
    const bs = Object.assign({}, ST.battleStats(s));
    if (mult && mult !== 1) { bs.hp = Math.round(bs.hp * mult); bs.atk = Math.round(bs.atk * mult); bs.def = Math.round(bs.def * mult); }
    let look = null; try { look = ST.lookOf(s); } catch (e) { look = null; }
    return {
      side, s, name: s.name, npc: !!s.npc, look, moves: ST.movesOf(s).filter(id => D.MOVES[id]), els: bs.els.slice(), lv: bs.level,
      max: bs.hp, hp: bs.hp, atk: bs.atk, def: bs.def, spd: bs.spd, eva: bs.eva,
      st: { atk: 0, def: 0, spd: 0, eva: 0, acc: 0 }, status: null, statusT: 0, stun: false, used: {}, heals: 0,
    };
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
  function hitChance(a, t, id) {
    const mv = D.MOVES[id];
    if (!targetsFoe(mv)) return 1;
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
  const usable = (f, id) => !(D.MOVES[id].fx.once && f.used[id]);
  const priority = id => (D.MOVES[id].fx.first ? 1 : 0);

  function snap(b) {
    const one = f => ({ hp: f.hp, status: f.status, stun: f.stun, st: Object.assign({}, f.st) });
    return { p: one(b.p), o: one(b.o) };
  }
  function newBattle(sP, sO, opts) {
    opts = opts || {};
    const b = { p: makeFighter(sP, 'p'), o: makeFighter(sO, 'o', opts.npcMult), turn: 0, over: false, winner: null, rng: opts.rng || Math.random, smart: opts.smart == null ? 0.6 : opts.smart };
    b.p.foe = b.o; b.o.foe = b.p;
    return b;
  }

  // Resolve one round. Returns a list of events (each carries a state snapshot taken right after it happened).
  function resolveRound(b, pMove, oMove) {
    const ev = [], P = b.p, O = b.o, rng = b.rng;
    const E = (type, who, x) => { const e = Object.assign({ type, who: who ? who.side : null }, x || {}); e.snap = snap(b); ev.push(e); return e; };
    b.turn++;
    let first = [P, pMove], second = [O, oMove];
    const pp = priority(pMove), po = priority(oMove);
    if (po > pp || (po === pp && (effSpd(O) > effSpd(P) || (effSpd(O) === effSpd(P) && rng() < 0.5)))) { first = [O, oMove]; second = [P, pMove]; }
    const faintCheck = (a, t) => {
      if (t.hp <= 0) { E('faint', t, { text: `${t.name} fainted!` }); b.over = true; b.winner = a.side; return true; }
      if (a.hp <= 0) { E('faint', a, { text: `${a.name} fainted!` }); b.over = true; b.winner = t.side; return true; }
      return false;
    };
    for (const [a, id] of [first, second]) {
      const t = a.foe;
      act(b, a, t, id, E);
      if (faintCheck(a, t)) return ev;
    }
    // end of round: poison / burn
    for (const f of [first[0], second[0]]) {
      if (f.status !== 'poison' && f.status !== 'burn') continue;
      const n = Math.max(1, Math.round(f.max * (f.status === 'poison' ? TUNE.poisonFrac : TUNE.burnFrac)));
      f.hp = Math.max(0, f.hp - n);
      E('dot', f, { n, kind: f.status, text: f.status === 'poison' ? `${f.name} is hurt by poison.` : `${f.name} is hurt by its burn.` });
      if (f.hp <= 0) { E('faint', f, { text: `${f.name} fainted!` }); b.over = true; b.winner = f.foe.side; return ev; }
      if (--f.statusT <= 0) { const k = f.status; f.status = null; E('cure', f, { text: k === 'poison' ? `${f.name}'s poison wore off.` : `${f.name}'s burn healed.` }); }
    }
    if (b.turn >= TUNE.tireAt) {
      if (b.turn === TUNE.tireAt) E('note', null, { text: 'Both Sprouts are tiring out!' });
      for (const f of [first[0], second[0]]) {
        const n = Math.max(1, Math.round(f.max * TUNE.tireFrac)); f.hp = Math.max(0, f.hp - n);
        E('dot', f, { n, kind: 'tired', text: '' });
      }
      const pd = P.hp <= 0, od = O.hp <= 0;
      if (pd || od) {
        const loser = pd && od ? (P.hp / P.max <= O.hp / O.max ? P : O) : pd ? P : O;
        E('faint', loser, { text: `${loser.name} is too tired to go on!` }); b.over = true; b.winner = loser.foe.side;
      }
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
        E('hit', t, { by: a.side, move: id, el: mv.el, n: r.n, crit: r.crit, tm: r.tm, i, of: n, text: r.crit && n === 1 ? 'A critical hit!' : '' });
      }
      const bits = [];
      if (n > 1) bits.push(`Hit ${hits} time${hits > 1 ? 's' : ''}!`);
      if (n > 1 && anyCrit) bits.push('Critical!');
      if (tm > 1) bits.push("It's super effective!"); else if (tm < 1) bits.push("It's not very effective...");
      if (bits.length) E('note', t, { text: bits.join(' ') });
      if (t.hp <= 0 && a.hp > 0) { /* fainted: skip secondary effects on target */ }
    }
    if (fx.drain && dealt) { const h = Math.min(a.max - a.hp, Math.max(1, Math.round(dealt * fx.drain))); if (h > 0) { a.hp += h; E('heal', a, { n: h, text: `${a.name} drained some energy.` }); } }
    if (fx.recoil && dealt) { const r = Math.max(1, Math.round(dealt * fx.recoil)); a.hp = Math.max(0, a.hp - r); E('recoil', a, { n: r, text: `${a.name} is hurt by the recoil.` }); }
    if (fx.cleanse && (a.status || a.stun)) { a.status = null; a.statusT = 0; a.stun = false; E('cleanse', a, { text: `${a.name} feels refreshed.` }); }
    if (fx.heal) {
      const k = healFactor(a), h = Math.min(a.max - a.hp, Math.round(a.max * fx.heal * k));
      if (a.hp < a.max) a.heals++;
      if (h > 0) { a.hp += h; E('heal', a, { n: h, text: k < 0.6 ? `${a.name} recovered a little HP. Healing is wearing thin.` : `${a.name} recovered HP.` }); }
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
          t.statusT = S.type === 'sleep' ? TUNE.sleepTurns[0] + Math.floor(rng() * (TUNE.sleepTurns[1] - TUNE.sleepTurns[0] + 1)) : TUNE.dotTurns;
          E('status', t, { st: S.type, text: S.type === 'sleep' ? `${t.name} fell asleep!` : S.type === 'poison' ? `${t.name} was poisoned!` : `${t.name} was burned!` });
        }
      } else if (mv.pow === 0 && !fx.debuff) E('note', t, { text: has ? 'But it failed!' : 'It had no effect.' });
    }
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
    if (rng() < (1 - smart) * 0.5) return opts[Math.floor(rng() * opts.length)];
    let best = opts[0], bs = -1e9;
    for (const id of opts) {
      const sc = scoreMove(me, foe, id, b.turn + 1) * (1 + (rng() - 0.5) * 1.4 * (1 - smart));
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }

  // ---------------- headless sim (balance) ----------------
  function simBattle(sP, sO, oppSmart, pSmart, maxTurns, npcMult) {
    const b = newBattle(sP, sO, { npcMult });
    while (!b.over && b.turn < (maxTurns || 40)) resolveRound(b, aiChoose(b, b.p, pSmart), aiChoose(b, b.o, oppSmart));
    return { won: b.winner === 'p', turns: b.turn, hpLeft: b.p.hp / b.p.max };
  }
  function sim(sP, leagueId, index, n, pSmart) {
    const li = D.LEAGUES.findIndex(l => l.id === leagueId); const o = ST.makeNPC(leagueId, index);
    let w = 0, turns = 0; n = n || 300;
    for (let i = 0; i < n; i++) { const r = simBattle(sP, o, TUNE.aiSmart[li], pSmart == null ? 0.85 : pSmart, 40, TUNE.npcMult[li]); w += r.won; turns += r.turns; }
    return { win: +(w / n).toFixed(2), turns: +(turns / n).toFixed(1) };
  }

  const engine = { TUNE, makeFighter, newBattle, resolveRound, aiChoose, scoreMove, typeMult, hitChance, baseDamage, simBattle, sim };
  window.__battle = { engine };

  // ======================================================================
  // UI
  // ======================================================================
  if (typeof document === 'undefined' || !document.createElement) return; // headless (balance sims)
  PS.scenes = PS.scenes || {};
  const PX = window.PX;
  const INK = '#222034';
  const LEAGUE_AREA = { pebble: 'meadow', thorn: 'meadow', tide: 'beach', moon: 'moonlit', sugar: 'candy' };
  const safe = (fn, fb) => { try { const v = fn(); return v == null ? fb : v; } catch (e) { return fb; } };
  const sfx = n => safe(() => PX.Sound.play(n));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const elColor = el => (D.ELEMENTS[el] || D.ELEMENTS.normal).color;
  const elLabel = el => (D.ELEMENTS[el] || D.ELEMENTS.normal).label;

  const CSS = `
.b-hub{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:12px 12px 24px}
.b-hub .panel{padding:12px 14px;margin-bottom:12px}
.b-top{display:flex;align-items:flex-end;justify-content:space-between;margin:2px 4px 10px}
.b-top h1{font-family:var(--f-px);font-weight:700;font-size:26px;margin:0;color:var(--ink)}
.b-top .b-rec{font-family:var(--f-px);font-weight:600;font-size:13px;color:var(--ink-soft)}
.b-ph{display:grid;grid-template-columns:76px 1fr auto;gap:10px;align-items:center}
.b-psprite{width:76px;height:76px;background:var(--slot);border-radius:16px;border:2px solid var(--line)}
.b-pname{font-size:22px;color:var(--ink)}
.b-pform{font-size:14px;color:var(--ink-soft);margin:1px 0 4px}
.b-chips{display:flex;flex-wrap:wrap;gap:4px}
.b-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:1px 7px 1px 4px;font-family:var(--f-px);font-weight:600;font-size:12px;color:#fff;background:var(--c);border:2px solid rgba(34,32,52,.25)}
.b-chip canvas{width:12px;height:12px;background:#fffdf6;border-radius:50%;padding:1px;box-sizing:content-box}
.b-mlist{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.b-mrow{display:grid;grid-template-columns:16px 1fr;gap:2px 6px;align-items:center;background:color-mix(in srgb,var(--c) 14%,#fffdf6);border:2px solid color-mix(in srgb,var(--c) 55%,#e3cf9d);border-radius:12px;padding:5px 8px;text-align:left}
.b-mrow canvas{width:14px;height:14px;grid-row:span 2}
.b-mrow b{font-family:var(--f-px);font-weight:600;font-size:14px;line-height:1.1;color:var(--ink)}
.b-mrow small{font-size:11.5px;color:var(--ink-soft);line-height:1.15}
.b-how{font-size:13px;line-height:1.4;color:var(--ink-soft);margin:10px 2px 0}
.b-lg header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.b-lname{font-size:19px;color:var(--ink)}
.b-lsub{font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink-soft);margin-top:2px}
.b-lsub.done{color:var(--accent)}
.b-rw{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink)}
.b-rw span{display:inline-flex;align-items:center;gap:4px;background:var(--slot);border-radius:8px;padding:2px 7px}
.b-rw canvas{width:12px;height:12px}
.b-rw canvas.egg{width:12px;height:14px}
.b-opps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.b-opp{position:relative;display:flex;flex-direction:column;align-items:center;gap:0;background:var(--field);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:4px 2px 6px}
.b-opp canvas{width:56px;height:56px}
.b-opp b{font-family:var(--f-px);font-weight:600;font-size:14px;line-height:1.1}
.b-opp small{font-size:11.5px;color:var(--ink-soft)}
.b-opp.next{border-color:var(--sun-edge);background:#fff6d6;box-shadow:0 0 0 2px var(--sun) inset}
.b-opp.beaten{background:#eef8e6;border-color:#9cd08a}
.b-opp[disabled]{opacity:.5}
.b-opp .b-tick{position:absolute;top:4px;right:4px;width:18px;height:18px}
.b-lg.locked .b-opps{filter:grayscale(1) brightness(.9);opacity:.55}
.b-lockline{display:flex;align-items:center;gap:6px;margin-top:8px;font-family:var(--f-px);font-weight:600;font-size:13px;color:var(--ink-soft)}
.b-lockline canvas{width:14px;height:16px}
.b-empty{text-align:center;padding:30px 20px}
.b-empty p{font-size:15px}

.b-fight{position:absolute;inset:0;display:flex;flex-direction:column;background:#222034}
.b-arena{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.b-cv{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
.b-plate{position:absolute;width:min(48%,210px);background:rgba(255,248,230,.96);border:2px solid var(--edge);border-bottom-width:4px;border-radius:14px;padding:5px 9px 5px;box-shadow:0 3px 0 rgba(34,32,52,.25);pointer-events:none;transition:opacity .3s}
.b-plate.o{top:10px;left:10px}
.b-plate.p{right:10px;bottom:12px}
.b-prow{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.b-prow b{font-family:var(--f-px);font-weight:700;font-size:16px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b-prow .b-lv{font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink-soft);white-space:nowrap}
.b-hp{display:flex;align-items:center;gap:5px;margin-top:3px}
.b-hp em{font-family:var(--f-px);font-style:normal;font-weight:700;font-size:10px;color:#fff;background:#c0612a;border-radius:4px;padding:0 3px;line-height:13px}
.b-hpbar{flex:1;height:10px;background:#3a3350;border:2px solid var(--px-ink);border-radius:3px;overflow:hidden;position:relative}
.b-hpbar i{position:absolute;left:0;top:0;bottom:0;width:100%;background:#6abe30;box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.18)}
.b-hpbar i.mid{background:#f6c83a}.b-hpbar i.low{background:#e5535f}
.b-hpbar::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(34,32,52,.28) 7px 8px)}
.b-prow2{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-top:3px;min-height:16px}
.b-hpn{font-family:var(--f-px);font-weight:600;font-size:12px;color:var(--ink)}
.b-tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px}
.b-tag{font-family:var(--f-px);font-weight:700;font-size:10px;line-height:14px;border-radius:4px;padding:0 4px;color:#fff;border:1px solid rgba(34,32,52,.4)}
.b-tag.up{background:#2b8243}.b-tag.down{background:#3f55b8}
.b-tag.poison{background:#9a6ad0}.b-tag.burn{background:#df5a26}.b-tag.sleep{background:#5b6ee1}.b-tag.stun{background:#e0a800;color:#3a2a00}
.b-run{position:absolute;top:10px;right:10px;font-family:var(--f-px);font-weight:600;font-size:12px;border-radius:10px;border:2px solid rgba(255,255,255,.55);background:rgba(34,32,52,.45);color:#fff;padding:5px 9px}
.b-run.armed{background:#e5535f;border-color:#fff}
.b-panel{flex:0 0 auto;background:var(--panel);border-top:3px solid var(--edge);padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px}
.b-log{position:relative;min-height:48px;background:var(--field);border:2px solid var(--line);border-radius:12px;padding:6px 26px 6px 10px;font-family:var(--f-px);font-weight:500;font-size:16px;line-height:1.25;color:var(--ink)}
.b-log i{position:absolute;right:9px;bottom:5px;font-style:normal;font-size:11px;color:var(--ink-soft);animation:bBlink 1s steps(2) infinite}
@keyframes bBlink{50%{opacity:0}}
.b-moves{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.b-mv{position:relative;display:grid;grid-template-columns:20px 1fr;grid-template-rows:auto auto;column-gap:7px;align-items:center;text-align:left;min-height:58px;padding:6px 9px 6px 8px;border-radius:14px;
  background:color-mix(in srgb,var(--c) 18%,#fffdf6);border:2px solid color-mix(in srgb,var(--c) 70%,#222034);border-bottom-width:5px;color:var(--ink);-webkit-touch-callout:none}
.b-mv:active:not([disabled]){transform:translateY(3px);border-bottom-width:2px;margin-bottom:3px}
.b-mv canvas{grid-row:span 2;width:20px;height:20px}
.b-mv .n{font-family:var(--f-px);font-weight:700;font-size:15px;line-height:1.05}
.b-mv .d{font-family:var(--f-px);font-weight:500;font-size:11.5px;color:var(--ink-soft);line-height:1.2}
.b-mv .eff{position:absolute;top:-8px;right:6px;font-family:var(--f-px);font-weight:700;font-size:10px;line-height:14px;padding:0 5px;border-radius:6px;border:1px solid var(--px-ink)}
.b-mv .eff.good{background:#99e550;color:#1f4a10}.b-mv .eff.bad{background:#dfe8fb;color:#595a70}
.b-mv[disabled]{opacity:.45}
.b-moves.wait .b-mv{opacity:.55;pointer-events:none}
.b-info{font-size:13px;line-height:1.3;color:var(--ink-soft);min-height:34px;padding:0 2px}
.b-info b{font-family:var(--f-px);font-weight:600;color:var(--ink)}

.b-res{position:absolute;inset:0;background:rgba(34,32,52,.55);display:grid;place-items:center;padding:16px;z-index:10;overflow:auto}
.b-res .card{text-align:center;animation:bPop .35s ease-out}
@keyframes bPop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}
.b-res canvas.hero{width:112px;height:112px;display:block;margin:-6px auto 0}
.b-res h1{margin:2px 0 4px}
.b-res .sub{font-size:14px;color:var(--ink-soft);margin:0 0 10px}
.b-rrows{display:grid;gap:6px;margin:8px 0 4px;text-align:left}
.b-rrow{display:flex;align-items:center;gap:8px;background:var(--slot);border-radius:12px;padding:7px 10px;font-size:14.5px;font-weight:600}
.b-rrow canvas{width:18px;height:18px;flex:0 0 auto}
.b-rrow canvas.egg{width:20px;height:24px}
.b-rrow b{font-family:var(--f-px);font-size:16px;margin-left:auto}
.b-rrow.gold{background:#fff1bf;border:2px solid var(--sun-edge)}
.b-ups{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin:6px 0 2px}
.b-ups span{font-family:var(--f-px);font-weight:600;font-size:12px;color:#fff;border-radius:8px;padding:2px 8px}
@media (prefers-reduced-motion: reduce){.b-res .card{animation:none}.b-log i{animation:none}}
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
    // particles
    const dot = (c, s) => { const d = new G(s || 2, s || 2); d.rect(0, 0, s || 2, s || 2, c); return d.canvas(); };
    ICON.bubble = PX.fromStrings(['.a.', 'a.a', '.a.'], { a: '#cbeeff' }).canvas();
    ICON.pebble = PX.fromStrings(['gg', 'gG'], { g: '#b7c2cc', G: '#595a70' }).canvas();
    ICON.up = PX.fromStrings(['..c..', '.ccc.', 'ccccc', '..c..', '..c..'], { c: '#99e550' }).canvas();
    ICON.down = PX.fromStrings(['..c..', '..c..', 'ccccc', '.ccc.', '..c..'], { c: '#9fd8ff' }).canvas();
    ICON.plus = PX.fromStrings(['.c.', 'ccc', '.c.'], { c: '#c3f08a' }).canvas();
    ICON.sweat = PX.fromStrings(['.c', 'cc'], { c: '#9fd8ff' }).canvas();
    ICON.dot = dot;
    ICON.clouds = [
      PX.fromStrings(['...wwww....', '.wwwwwwww..', 'wwwwwwwwwww', '.WWWWWWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
      PX.fromStrings(['..www..', 'wwwwwww', '.WWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
      PX.fromStrings(['.....www.......', '..wwwwwwwww....', '.wwwwwwwwwwwww.', 'wwwwwwwwwwwwwww', '.WWWWWWWWWWWWW.'], { w: '#ffffff', W: '#dcecfa' }).canvas(),
    ];
    return ICON;
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
  let root, hubEl, fightEl, resEl, arenaEl, cv, ctx, logEl, movesEl, infoEl, runBtn, plateEls = {};
  const lo = document.createElement('canvas'), lx = lo.getContext('2d');
  const bgC = document.createElement('canvas'), bgx = bgC.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1, PXS = 4, WW = 100, WH = 120, bgKey = '';
  let V = null; // live battle view
  let hubT = 0, hubFrame = 0, hubSprite = null;

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
          <button class="b-run" type="button">Give up</button>
        </div>
        <div class="b-panel">
          <div class="b-log" aria-live="polite"><span></span><i hidden>&#9660;</i></div>
          <div class="b-moves"></div>
          <div class="b-info"></div>
        </div>
        <div class="b-res" hidden></div>
      </div>`;
    hubEl = root.querySelector('.b-hub'); fightEl = root.querySelector('.b-fight'); resEl = root.querySelector('.b-res');
    arenaEl = root.querySelector('.b-arena'); cv = root.querySelector('.b-cv'); ctx = cv.getContext('2d');
    logEl = root.querySelector('.b-log'); movesEl = root.querySelector('.b-moves'); infoEl = root.querySelector('.b-info');
    runBtn = root.querySelector('.b-run'); plateEls = { o: root.querySelector('.b-plate.o'), p: root.querySelector('.b-plate.p') };
    let armedAt = 0;
    runBtn.onclick = () => {
      if (!V || V.phase === 'results') return;
      if (Date.now() - armedAt > 3000) { armedAt = Date.now(); runBtn.textContent = 'Tap again to give up'; runBtn.classList.add('armed'); setTimeout(() => { runBtn.textContent = 'Give up'; runBtn.classList.remove('armed'); }, 3000); return; }
      sfx('miss'); forfeit(); renderHub();
    };
    const skip = () => { if (V && (V.phase === 'play' || V.phase === 'intro' || V.phase === 'end')) V.fast = true; };
    arenaEl.addEventListener('pointerdown', e => { if (e.target !== runBtn) skip(); });
    logEl.addEventListener('pointerdown', skip);
    window.addEventListener('resize', () => { if (V) resize(); });
  }

  function show(params) {
    params = params || {};
    if (!V) { fightEl.hidden = true; hubEl.hidden = false; renderHub(); }
    if (params.league != null && params.index != null) startBattle(params.league, params.index);
  }
  function hide() { if (V) forfeit(); }
  function forfeit() { // leave mid-battle: no reward, restore shell
    V = null; resEl.hidden = true; fightEl.hidden = true; hubEl.hidden = false;
    PS.ui.chrome(true); PS.ui.hold(false);
  }

  // ---------------- hub ----------------
  const partner = () => ST.active();
  function chip(el) {
    return `<span class="b-chip" style="--c:${elColor(el)}"><canvas class="px" data-el="${el}" width="7" height="7"></canvas>${elLabel(el)}</span>`;
  }
  function paintIcons(scope) {
    scope.querySelectorAll('canvas[data-el]').forEach(c => { const s = safe(() => PX.item('element', c.dataset.el), null); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-coin]').forEach(c => { const s = icons().coin; if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-egg]').forEach(c => { const s = safe(() => PX.item('egg', c.dataset.egg), null); if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
    scope.querySelectorAll('canvas[data-icon]').forEach(c => { const s = icons()[c.dataset.icon]; if (s) { c.width = s.width; c.height = s.height; PS.ui.paint(c, s); } });
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
  function renderHub() {
    if (!hubEl) return;
    const s = partner();
    if (!s) {
      hubEl.innerHTML = `<div class="b-top"><h1>Battle</h1></div><div class="panel b-empty"><p>You need a Sprout to battle.</p><p>Hatch your first egg in the Garden.</p><button class="btn primary b-goG">Go to the Garden</button></div>`;
      hubEl.querySelector('.b-goG').onclick = () => PS.ui.go('garden');
      hubSprite = null; return;
    }
    const fi = ST.formInfo(s), bs = ST.battleStats(s), mv = ST.movesOf(s);
    const rec = s.record || {};
    let h = `<div class="b-top"><h1>Battle</h1><span class="b-rec">${PS.S.totals.battleWins || 0} wins</span></div>
      <section class="panel b-partner"><div class="b-ph"><canvas class="px b-psprite" width="32" height="32"></canvas>
        <div><div class="label">Your fighter</div><div class="px-title b-pname">${esc(s.name)}</div><div class="b-pform">${esc(fi.name)} · Lv ${bs.level} · ${rec.battleWins || 0}–${(rec.battles || 0) - (rec.battleWins || 0)}</div>
        <div class="b-chips">${bs.els.map(chip).join('')}</div></div>
        <button class="btn b-change" type="button">Change</button></div>
        <div class="b-mlist">${mv.map(id => { const m = D.MOVES[id]; return `<div class="b-mrow" style="--c:${elColor(m.el)}"><canvas class="px" data-el="${m.el}"></canvas><b>${m.name}</b><small>${moveKind(m)} · ${esc(moveSource(s, id))}</small></div>`; }).join('')}</div>
        <p class="b-how">Moves come from its form (3) and its strongest animal (1). Evolve or bond with animals to change them.</p>
      </section>`;
    D.LEAGUES.forEach((L, li) => {
      const open = ST.leagueUnlocked(L.id), p = ST.leagueProgress(L.id), n = p.beaten.filter(Boolean).length;
      const nextI = p.beaten.findIndex(x => !x);
      const lockName = L.unlock ? (D.LEAGUES.find(x => x.id === L.unlock) || {}).name : '';
      h += `<section class="panel b-lg ${open ? '' : 'locked'}" data-li="${li}"><header><div><div class="px-title b-lname">${L.name}</div>
          <div class="b-lsub ${p.cleared ? 'done' : ''}">${p.cleared ? 'Cleared' : open ? `${n} of 3 beaten` : 'Locked'}</div></div>
          <div class="b-rw"><span><canvas class="px" data-coin="1"></canvas>${L.coins} a win</span><span>Clear: <canvas class="px" data-coin="1"></canvas>${L.coins * 3} + <canvas class="px egg" data-egg="${L.egg}"></canvas></span></div></header>
        <div class="b-opps">${L.opponents.map((o, i) => {
          const can = open && (i === 0 || p.beaten[i - 1] || p.beaten[i]);
          const cls = p.beaten[i] ? 'beaten' : can && i === nextI ? 'next' : '';
          return `<button class="b-opp ${cls}" type="button" data-i="${i}" ${can ? '' : 'disabled'}><canvas class="px" width="32" height="32"></canvas><b>${esc(o.name)}</b><small>Lv ${ST.battleStats(ST.makeNPC(L.id, i)).level}</small>${p.beaten[i] ? '<canvas class="px b-tick" data-icon="tick"></canvas>' : ''}</button>`;
        }).join('')}</div>
        ${open ? '' : `<div class="b-lockline"><canvas class="px" data-icon="lock"></canvas>Clear the ${lockName} to unlock</div>`}
      </section>`;
    });
    hubEl.innerHTML = h;
    paintIcons(hubEl);
    hubSprite = hubEl.querySelector('.b-psprite'); hubFrame = -1;
    PS.ui.drawSproutTo(hubSprite, s);
    hubEl.querySelector('.b-change').onclick = () => { sfx('pop'); PS.ui.pickSprout({ title: 'Choose a fighter', eyebrow: 'Battle', extra: x => ST.movesOf(x).map(id => D.MOVES[id].name).join(', '), onPick: x => { ST.setActive(x.id); renderHub(); } }); };
    hubEl.querySelectorAll('.b-lg').forEach(sec => {
      const L = D.LEAGUES[+sec.dataset.li];
      sec.querySelectorAll('.b-opp').forEach(btn => {
        const i = +btn.dataset.i, npc = ST.makeNPC(L.id, i);
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
    const npc = ST.makeNPC(L.id, i), bs = ST.battleStats(npc), p = ST.leagueProgress(L.id);
    const mine = ST.battleStats(s).level;
    const gap = bs.level - mine;
    const warn = gap >= 12 ? '<p style="color:#b43a44"><b>This looks very tough.</b> Train more first?</p>' : gap >= 5 ? '<p style="color:#a8653a">A tough fight for your Sprout.</p>' : '';
    const coins = Math.round(L.coins * (1 + i * 0.25));
    PS.ui.modal({
      eyebrow: `${L.name} · ${i + 1} of 3`, title: npc.name, sprite: npc, pose: { eyes: 'brave', mouth: 'grin', arms: 'up' },
      html: `<p style="text-align:center;margin-top:-4px">${esc(ST.formInfo(npc).name)} · Lv ${bs.level}</p>
        <div class="chips-list" style="justify-content:center">${bs.els.map(chip).join('')}</div>
        <p><b>Moves:</b> ${ST.movesOf(npc).map(id => D.MOVES[id].name).join(', ')}</p>
        <p>${matchupHint(s, npc)}</p>${warn}
        <p>Win: <b>${coins} coins</b>${!p.cleared && p.beaten.filter(Boolean).length === 2 && !p.beaten[i] ? ` + league prize <b>${L.coins * 3} coins</b> and a <b>${D.EGGS[L.egg].name}</b>` : ''}.</p>`,
      buttons: [{ label: `Battle with ${s.name}!`, kind: 'go', onClick: () => { setTimeout(() => startBattle(L.id, i), 0); } }, { label: 'Not yet' }],
      mount(card) { paintIcons(card); },
    });
  }

  // ---------------- battle start ----------------
  function startBattle(leagueId, index) {
    const s = partner(); if (!s) return;
    const li = D.LEAGUES.findIndex(l => l.id === leagueId), L = D.LEAGUES[li];
    const npc = ST.makeNPC(leagueId, index);
    const b = newBattle(s, npc, { npcMult: TUNE.npcMult[li], smart: TUNE.aiSmart[li] });
    const area = LEAGUE_AREA[leagueId] || npc.area || 'meadow';
    PS.ui.closeModal && PS.ui.closeModal();
    PS.ui.hold(true); PS.ui.chrome(false);
    hubEl.hidden = true; fightEl.hidden = false; resEl.hidden = true;
    V = {
      b, L, li, index, s, npc, area, phase: 'intro', t: 0, fast: false, queue: [], step: null, done: false,
      disp: snap(b), hpShown: { p: b.p.hp, o: b.o.hp }, parts: [], pops: [], clouds: [],
      a: { p: fresh(), o: fresh() }, log: { full: '', shown: 0 }, info: null, lastMove: null,
    };
    V.a.p.enter = 1; V.a.o.enter = 1;
    for (let i = 0; i < 4; i++) V.clouds.push({ x: Math.random() * 140 - 20, y: 2 + Math.random() * 16, k: i % 3, v: 1.5 + Math.random() * 2 });
    resize(); bgKey = '';
    renderPlates(true); renderMoves(); setInfo(null);
    runBtn.textContent = 'Give up'; runBtn.classList.remove('armed'); runBtn.hidden = false;
    queue([
      { kind: 'intro', text: `${npc.name} of the ${L.name} wants to battle!`, dur: 1.4 },
      { kind: 'go', text: `Go, ${s.name}!`, dur: 0.9 },
    ]);
    sfx('go');
  }
  const fresh = () => ({ lunge: 0, hop: 0, shake: 0, flash: 0, alpha: 1, drop: 0, pose: null, poseT: 0, emote: null, emoteT: 0, enter: 0, dodge: 0 });

  function resize() {
    if (!arenaEl) return;
    const r = arenaEl.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.width === cssW && r.height === cssH) return;
    cssW = r.width; cssH = r.height;
    PXS = clamp(Math.round(cssW / 100), 3, 5);
    while (PXS > 3 && cssH / PXS < 96) PXS--;
    WW = Math.ceil(cssW / PXS); WH = Math.ceil(cssH / PXS);
    lo.width = WW; lo.height = WH; bgC.width = WW; bgC.height = WH; bgKey = '';
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  }
  // fighter feet positions (world px)
  const HY = () => Math.round(WH * 0.38);
  function spot(side) {
    return side === 'o' ? { x: Math.round(WW * 0.71), y: Math.round(clamp(WH * 0.53, HY() + 16, WH - 50)) } : { x: Math.round(WW * 0.29), y: Math.round(WH - Math.max(10, WH * 0.1)) };
  }

  // ---------------- plates & moves ----------------
  function renderPlates(full) {
    for (const side of ['p', 'o']) {
      const f = V.b[side], d = V.disp[side], el = plateEls[side];
      if (full || !el.firstChild) {
        el.innerHTML = `<div class="b-prow"><b>${esc(f.name)}</b><span class="b-lv">Lv ${f.lv}</span></div>
          <div class="b-hp"><em>HP</em><div class="b-hpbar"><i></i></div></div>
          <div class="b-prow2"><span class="b-hpn"></span><span class="b-tags"></span></div>`;
        el._bar = el.querySelector('.b-hpbar i'); el._n = el.querySelector('.b-hpn'); el._tags = el.querySelector('.b-tags'); el._last = '';
      }
      let tags = '';
      if (d.status) tags += `<span class="b-tag ${d.status}">${STATUS_SHORT[d.status]}</span>`;
      if (d.stun) tags += '<span class="b-tag stun">STN</span>';
      for (const k of ['atk', 'def', 'spd', 'eva', 'acc']) { const n = d.st[k]; if (n) tags += `<span class="b-tag ${n > 0 ? 'up' : 'down'}">${STAT_SHORT[k]}${n > 0 ? '&#9650;' : '&#9660;'}${Math.abs(n)}</span>`; }
      if (tags !== el._last) { el._tags.innerHTML = tags; el._last = tags; }
    }
    updateBars();
  }
  function updateBars() {
    for (const side of ['p', 'o']) {
      const f = V.b[side], el = plateEls[side]; if (!el._bar) continue;
      const k = clamp(V.hpShown[side] / f.max, 0, 1), w = (k * 100).toFixed(1) + '%';
      if (el._bar.style.width !== w) { el._bar.style.width = w; el._bar.className = k > 0.5 ? '' : k > 0.2 ? 'mid' : 'low'; }
      const t = `${Math.max(0, Math.round(V.hpShown[side]))} / ${f.max}`; if (el._n.textContent !== t) el._n.textContent = t;
    }
  }
  function renderMoves() {
    const f = V.b.p, foe = V.b.o;
    movesEl.innerHTML = '';
    f.moves.forEach(id => {
      const m = D.MOVES[id], tm = m.pow > 0 ? typeMult(m.el, foe.els) : 1;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'b-mv'; btn.style.setProperty('--c', elColor(m.el));
      const used = m.fx.once && f.used[id];
      btn.innerHTML = `<canvas class="px" data-el="${m.el}"></canvas><span class="n">${m.name}</span><span class="d">${used ? 'Used up' : `${elLabel(m.el)} · ${moveKind(m)}`}</span>${tm > 1 ? '<span class="eff good">Strong!</span>' : tm < 1 ? '<span class="eff bad">Weak</span>' : ''}`;
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
  }
  function setInfo(id) {
    if (!id) { infoEl.innerHTML = V && V.lastMove ? '' : 'Tap a move to use it. Hold a move to read what it does.'; return; }
    const m = D.MOVES[id], fx = m.fx, bits = [];
    if (m.pow > 0) bits.push(`Power ${m.pow}${fx.hits ? ` × ${fx.hits} hits` : ''}`);
    if (m.pow > 0 || fx.debuff || fx.status) bits.push(SURE.has(id) ? 'Never misses' : `Accuracy ${Math.round(m.acc * 100)}%`);
    if (fx.first) bits.push('Goes first');
    if (fx.heal && V && V.b.p.heals) bits.push('Heals less each time');
    infoEl.innerHTML = `<b>${m.name}</b> (${elLabel(m.el)}): ${esc(m.desc)} <span>${bits.join(' · ')}</span>`;
  }

  // ---------------- turn flow ----------------
  function choose(id) {
    if (!V || V.phase !== 'choose') return;
    const f = V.b.p; if (!usable(f, id)) return;
    sfx('pop');
    V.lastMove = id;
    const oid = aiChoose(V.b, V.b.o, V.b.smart);
    const ev = resolveRound(V.b, id, oid);
    V.phase = 'play'; movesEl.classList.add('wait'); setInfo(null);
    queue(ev.map(e => ({ kind: 'ev', ev: e, text: e.text, dur: evDur(e) })));
  }
  function evDur(e) {
    switch (e.type) {
      case 'use': return D.MOVES[e.move].pow > 0 ? 0.55 : 0.5;
      case 'hit': return e.of > 1 ? 0.32 : 0.6;
      case 'faint': return 1.2;
      case 'dot': return e.kind === 'tired' ? 0.35 : 0.7;
      case 'skip': return 0.9;
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
  function onQueueEmpty() {
    V.step = null;
    V.fast = false;
    if (V.phase === 'intro') { V.phase = 'choose'; renderMoves(); setInfo(null); setLog(`What will ${V.b.p.name} do?`); return; }
    if (V.phase === 'play') {
      if (V.b.over) { endBattle(); return; }
      V.phase = 'choose'; renderMoves(); setLog(`What will ${V.b.p.name} do?`);
      return;
    }
    if (V.phase === 'end') showResults();
  }
  function setLog(t) { V.log.full = t; V.log.shown = 0; }

  // start the visuals for one step
  function begin(st) {
    if (st.kind === 'intro') { sfx('whoosh'); return; }
    if (st.kind === 'go') { V.a.p.pose = { arms: 'up', mouth: 'open', eyes: 'happy' }; V.a.p.poseT = 0.8; V.a.p.hop = 1; return; }
    if (st.kind === 'victory' || st.kind === 'defeat') return;
    const e = st.ev, who = e.who, A = who ? V.a[who] : null, f = who ? V.b[who] : null;
    V.disp = e.snap; renderPlates(false);
    const at = side => spot(side), top = side => ({ x: at(side).x, y: at(side).y - 16 });
    switch (e.type) {
      case 'use': {
        const m = D.MOVES[e.move];
        if (m.pow > 0) { A.lunge = 1; A.pose = { arms: 'out', mouth: 'open', eyes: 'brave' }; A.poseT = 0.5; sfx('whoosh'); st.shoot = { from: who, el: m.el, t: 0.12 }; }
        else { A.hop = 1; A.pose = { arms: 'up', mouth: 'grin' }; A.poseT = 0.5; sfx('chime'); burst(top(who), m.el, 8, 26); }
        break;
      }
      case 'hit': {
        A.flash = 0.18; A.shake = 0.3; A.pose = { eyes: 'sad', mouth: 'o' }; A.poseT = 0.45;
        const p = top(who); burst(p, e.el, e.of > 1 ? 6 : 12, e.crit ? 60 : 44);
        pop(p.x, p.y - 12, `-${e.n}`, e.crit ? '#fbf236' : e.tm > 1 ? '#ffb347' : '#ffffff', e.crit ? 34 : e.tm > 1 ? 30 : 26, e.crit ? 'CRIT' : e.tm > 1 ? 'SUPER' : '');
        sfx(e.crit ? 'snap' : 'thud'); if (who === 'p') safe(() => PX.buzz(e.crit ? 25 : 12));
        break;
      }
      case 'miss': {
        const t = V.a[e.target]; t.dodge = 1; const p = top(e.target); pop(p.x, p.y - 10, 'MISS', '#dfe8fb', 24); sfx('miss');
        break;
      }
      case 'heal': { rise(top(who), ICON.plus || icons().plus, 10); pop(top(who).x, top(who).y - 12, `+${e.n}`, '#99e550', 26); A.pose = { eyes: 'happy', mouth: 'smile', arms: 'up' }; A.poseT = 0.5; sfx('chime'); break; }
      case 'recoil': { A.shake = 0.25; A.flash = 0.12; pop(top(who).x, top(who).y - 12, `-${e.n}`, '#ffffff', 22); sfx('thud'); break; }
      case 'stage': {
        if (e.n) { rise(top(who), e.n > 0 ? icons().up : icons().down, 8, e.n < 0); if (e.n > 0) { A.hop = 1; } sfx(e.n > 0 ? 'level' : 'miss'); }
        break;
      }
      case 'status': {
        const col = { poison: '#9a6ad0', burn: '#df5a26', sleep: '#5b6ee1', stun: '#fbf236' }[e.st];
        burst(top(who), e.st === 'burn' ? 'fire' : e.st === 'poison' ? 'shadow' : 'light', 10, 30);
        A.emote = e.st === 'sleep' ? 'zz' : e.st === 'stun' ? 'swirl' : '!'; A.emoteT = 1;
        pop(top(who).x, top(who).y - 14, STATUS_SHORT[e.st], col, 22); sfx('crack');
        break;
      }
      case 'skip': { A.emote = e.kind === 'sleep' ? 'zz' : 'swirl'; A.emoteT = 1; A.shake = e.kind === 'stun' ? 0.3 : 0; break; }
      case 'wake': { A.emote = '!'; A.emoteT = 0.8; A.hop = 1; break; }
      case 'dot': {
        if (e.kind === 'tired') { rise(top(who), icons().sweat, 3); A.shake = 0.12; }
        else { burst(top(who), e.kind === 'burn' ? 'fire' : 'shadow', 8, 22); A.flash = 0.12; A.shake = 0.25; }
        pop(top(who).x, top(who).y - 12, `-${e.n}`, e.kind === 'poison' ? '#c9a2f0' : e.kind === 'burn' ? '#ffb347' : '#dfe8fb', e.kind === 'tired' ? 18 : 22);
        break;
      }
      case 'cure': case 'cleanse': { rise(top(who), fxs('spark', '#ffffff'), 8); sfx('chime'); break; }
      case 'faint': { A.fainting = 0.001; A.pose = { eyes: 'closed', mouth: 'o' }; A.poseT = 99; sfx('thud'); break; }
      case 'note': break;
    }
  }

  function endBattle() {
    const won = V.b.winner === 'p';
    V.phase = 'end'; V.won = won; runBtn.hidden = true;
    const W = V.a[won ? 'p' : 'o'];
    W.win = true; W.emote = 'heart'; W.emoteT = 99;
    queue([{ kind: won ? 'victory' : 'defeat', text: won ? `${V.b.p.name} won the battle!` : `${V.b.p.name} lost the battle...`, dur: 1.8 }]);
    sfx(won ? 'level' : 'miss');
  }

  function showResults() {
    if (V.done) return; V.done = true; V.phase = 'results';
    const { L, index, s, won } = V;
    const res = ST.finishBattle(s, L.id, index, won);
    const g = L.xp * (won ? 1 : 0.35), xp = Math.round(g * 3.6);
    let rows = `<div class="b-rrow"><canvas class="px" data-coin="1"></canvas>Coins<b>+${res.coins - (res.bonus || 0)}</b></div>
      <div class="b-rrow"><canvas class="px" data-icon="plus"></canvas>Training XP<b>+${xp}</b></div>`;
    if (res.cleared) {
      rows += `<div class="b-rrow gold"><canvas class="px" data-coin="1"></canvas>${L.name} cleared!<b>+${res.bonus}</b></div>`;
      if (res.egg) rows += `<div class="b-rrow gold"><canvas class="px egg" data-egg="${res.egg.kind}"></canvas><span>New ${D.EGGS[res.egg.kind].name}! It's waiting in the ${D.AREAS[res.egg.area] ? D.AREAS[res.egg.area].name : 'Garden'}.</span></div>`;
    }
    const ups = Object.entries(res.ups || {}).map(([k, n]) => `<span style="background:${D.STAT_META[k].color}">${D.STAT_META[k].label} +${n} Lv</span>`).join('');
    const nextOk = won && index < 2;
    const nextL = won && index === 2 ? D.LEAGUES[V.li + 1] : null;
    resEl.innerHTML = `<div class="card">
      <div class="eyebrow">${L.name} · ${esc(V.npc.name)}</div>
      <canvas class="px hero" width="32" height="32"></canvas>
      <h1>${won ? 'Victory!' : 'So close!'}</h1>
      <p class="sub">${won ? `${esc(s.name)} beat ${esc(V.npc.name)} in ${V.b.turn} turn${V.b.turn > 1 ? 's' : ''}.` : `${esc(V.npc.name)} won this time. Train, evolve or bond with animals, then try again.`}</p>
      <div class="b-rrows">${rows}</div>
      ${ups ? `<div class="b-ups">${ups}</div>` : ''}
      <div class="modal-btns">
        ${nextOk ? `<button class="btn wide go" data-a="next">Next: ${esc(L.opponents[index + 1].name)}</button>` : ''}
        ${nextL && ST.leagueUnlocked(nextL.id) ? `<button class="btn wide go" data-a="league">Next: ${nextL.name}</button>` : ''}
        ${!won ? '<button class="btn wide primary" data-a="retry">Try again</button>' : ''}
        <button class="btn wide" data-a="hub">Back to leagues</button>
      </div></div>`;
    paintIcons(resEl);
    PS.ui.drawSproutTo(resEl.querySelector('canvas.hero'), s, won ? { arms: 'up', eyes: 'happy', mouth: 'open' } : { eyes: 'sad', mouth: 'flat' });
    resEl.hidden = false;
    PS.ui.chrome(true); PS.ui.hold(false);
    resEl.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      sfx('pop');
      const a = b.dataset.a, lid = L.id;
      V = null; resEl.hidden = true;
      if (a === 'next') startBattle(lid, index + 1);
      else if (a === 'retry') startBattle(lid, index);
      else if (a === 'league') { fightEl.hidden = true; hubEl.hidden = false; renderHub(); preview(nextL, 0); }
      else { fightEl.hidden = true; hubEl.hidden = false; renderHub(); }
    });
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
  function pop(x, y, text, color, size, tag) { V.pops.push({ x, y, text, color, size, tag, t: 0, life: 0.95 }); }

  // ---------------- update ----------------
  function update(dt) {
    V.t += dt;
    const speed = V.fast ? 4 : 1;
    // step timing
    if (!V.step && V.queue.length) nextStep();
    if (V.step) {
      const st = V.step; st.t += dt * speed;
      if (st.shoot && st.t >= st.shoot.t && !st.shoot.done) { st.shoot.done = true; shoot(st.shoot.from, st.shoot.el); }
      if (st.t >= st.need) { V.step = null; if (V.queue.length) nextStep(); else onQueueEmpty(); }
    }
    // typewriter
    if (V.log.shown < V.log.full.length) V.log.shown = Math.min(V.log.full.length, V.log.shown + dt * 55 * speed * (V.fast ? 3 : 1));
    // hp bars ease toward display snapshot
    for (const side of ['p', 'o']) {
      const target = V.disp[side].hp, cur = V.hpShown[side];
      if (cur !== target) { const d = target - cur, stepv = Math.max(Math.abs(d) * 6 * dt * speed, 30 * dt * speed); V.hpShown[side] = Math.abs(d) <= stepv ? target : cur + Math.sign(d) * stepv; }
    }
    updateBars();
    // anims
    for (const side of ['p', 'o']) {
      const A = V.a[side];
      const dec = (k, r) => { if (A[k] > 0) A[k] = Math.max(0, A[k] - dt * r * speed); };
      dec('lunge', 2.2); dec('hop', 3); dec('shake', 1); dec('flash', 1); dec('poseT', 1); dec('emoteT', 1); dec('dodge', 2.2); dec('enter', 1.6);
      if (A.fainting) A.fainting = Math.min(1, A.fainting + dt * speed * 1.1);
      if (A.poseT <= 0 && !A.win) A.pose = null;
      if (A.emoteT <= 0) A.emote = null;
    }
    // ambient status fx
    for (const side of ['p', 'o']) {
      const d = V.disp[side], sp = spot(side);
      if (V.a[side].fainting) continue;
      if (d.status === 'poison' && Math.random() < dt * 3) V.parts.push({ x: sp.x + (Math.random() - 0.5) * 16, y: sp.y - 8 - Math.random() * 10, vx: 0, vy: -12, g: 0, life: 0.7, spr: icons().bubble, tint: '#c9a2f0' });
      if (d.status === 'burn' && Math.random() < dt * 4) V.parts.push({ x: sp.x + (Math.random() - 0.5) * 16, y: sp.y - 4 - Math.random() * 12, vx: 0, vy: -16, g: 0, life: 0.5, spr: fxs('spark', Math.random() < 0.5 ? '#ff9a3a' : '#fbf236') });
    }
    for (const p of V.parts) { if (p.delay > 0) { p.delay -= dt; continue; } p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    V.parts = V.parts.filter(p => p.life > 0);
    for (const p of V.pops) p.t += dt;
    V.pops = V.pops.filter(p => p.t < p.life);
    for (const c of V.clouds) { c.x += c.v * dt; if (c.x > WW + 20) { c.x = -30; c.y = 2 + Math.random() * Math.max(4, HY() - 14); } }
  }
  function shoot(from, el) {
    const a = spot(from), b = spot(from === 'p' ? 'o' : 'p'), P = elParticles(el);
    const ax = a.x + (from === 'p' ? 10 : -10), ay = a.y - 16, bx = b.x, by = b.y - 16, n = 9;
    for (let i = 0; i < n; i++) {
      const k = i / n, life = 0.22;
      V.parts.push({ x: ax + (Math.random() - 0.5) * 4, y: ay + (Math.random() - 0.5) * 4, vx: (bx - ax) / life, vy: (by - ay) / life, g: 0, life, delay: k * 0.12, spr: P.spr[i % P.spr.length] });
    }
  }

  // ---------------- render ----------------
  const THEMES = {
    meadow: { sky: ['#8ecff4', '#a0d7f6', '#b3e0f8', '#c8e9f9'], far: ['#86c08e', '#b2dfb0'], near: ['#5fa060', '#8fcf86'], gr: ['#99e550', '#7fd23e', '#6abe30', '#37946e'], pad: ['#c3f08a', '#8fcf86', '#4f9a52'], dots: ['#f7b6c8', '#fbf236', '#ffffff'], props: [['bigtree', -6, 2], ['bush', 0.45, 0], ['tree', 1.02, 1]], clouds: true },
    beach: { sky: ['#7cc6f2', '#96d2f5', '#b0def8', '#cdebfa'], sea: ['#639bff', '#4f86e8', '#cbdbfc'], gr: ['#fbecc8', '#f6e2b8', '#f0d29a', '#d9a066'], pad: ['#fff4dc', '#ead3a0', '#c9a66a'], dots: ['#ffffff', '#f7b6c8', '#e0a672'], props: [['palm', -2, 2], ['umbrella', 0.47, 0], ['shells', 0.93, 0]], clouds: true },
    moonlit: { sky: ['#1a1840', '#232258', '#2c2c66', '#3a3a80'], far: ['#27345a', '#324570'], near: ['#1f4a4c', '#2a5f60'], gr: ['#3f9d89', '#378f7d', '#2f8078', '#1f5452'], pad: ['#6fd0b4', '#3fa590', '#1f5452'], dots: ['#c9a2f0', '#9fd8ff', '#fff27a'], props: [['glowtree', -4, 2], ['glowshroom', 0.46, 0], ['crystal', 1.0, 1]], stars: true, moon: true, theme: 'night' },
    candy: { sky: ['#f7b6c8', '#fac4d4', '#fcd5e1', '#ffe6ee'], far: ['#e79ac0', '#f5bfd8'], near: ['#c77bc0', '#dea0d8'], gr: ['#fff0f7', '#ffd9ea', '#ffc3dc', '#f08cbc'], pad: ['#ffffff', '#ffd0e4', '#e07ba0'], dots: ['#639bff', '#99e550', '#fbf236', '#df7126'], props: [['lollitree', -4, 2], ['gumdrops', 0.45, 0], ['candycane', 1.0, 1]], clouds: true, theme: 'candy' },
  };
  const NIGHT_SKY = ['#10102a', '#171740', '#1f1d4a', '#2c2c66'];
  const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return n >>> 0; };
  function mix(a, b, k) {
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
  function drawBg(night) {
    const T = THEMES[V.area] || THEMES.meadow, g = bgx, hy = HY();
    const k = T.theme === 'night' ? night * 0.4 : night * 0.85;
    g.clearRect(0, 0, WW, WH);
    // stepped sky
    const bandH = Math.ceil(hy / 4);
    for (let i = 0; i < 4; i++) px(g, 0, i * bandH, WW, bandH + 1, mix(T.sky[i], NIGHT_SKY[i], k));
    // stars & moon
    if (T.stars || night > 0.35) {
      const sa = T.stars ? 1 : clamp((night - 0.35) / 0.4, 0, 1);
      for (let i = 0; i < 40; i++) { const h = hash(i * 7 + 3); if (h % 3 && sa < 0.7) continue; px(g, h % WW, (h >>> 8) % Math.max(1, hy - 6), 1, 1, (h >>> 3) % 4 ? '#cbdbfc' : '#ffffff'); }
    }
    if (T.moon || night > 0.5) { const mx = Math.round(WW * 0.5), my = Math.round(hy * 0.32); for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) px(g, mx + x, my + y, 1, 1, (x - 2) * (x - 2) + (y + 1) * (y + 1) <= 9 ? mix(T.sky[0], NIGHT_SKY[0], k) : '#fff6c8'); }
    else if (!T.moon && night < 0.5 && V.area !== 'candy') { const sx = Math.round(WW * 0.14), sy = Math.round(hy * 0.3); for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) px(g, sx + x, sy + y, 1, 1, x * x + y * y <= 4 ? '#fff27a' : '#fbe36a'); }
    // far band: hills or sea
    if (T.sea) {
      for (let y = hy - 7; y < hy; y++) px(g, 0, y, WW, 1, mix(y < hy - 5 ? T.sea[1] : T.sea[0], '#1a2a5a', k * 0.6));
      for (let x = 0; x < WW; x++) { const h = hash(x * 13); if (h % 7 === 0) px(g, x, hy - 6 + (h >>> 4) % 5, 2, 1, mix(T.sea[2], '#6070a0', k * 0.6)); }
      px(g, 0, hy - 7, WW, 1, mix('#e8f4ff', '#40507a', k * 0.6));
    } else {
      for (let x = 0; x < WW; x++) {
        const h1 = 7 + Math.round(3 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.19 + 1.3)), h2 = 3 + Math.round(2 * Math.sin(x * 0.11 + 0.5) + 1.5 * Math.sin(x * 0.27));
        px(g, x, hy - h1, 1, 1, mix(T.far[0], NIGHT_SKY[3], k * 0.7)); px(g, x, hy - h1 + 1, 1, h1, mix(T.far[1], NIGHT_SKY[3], k * 0.7));
        px(g, x, hy - h2, 1, 1, mix(T.near[0], '#1a1d40', k * 0.6)); px(g, x, hy - h2 + 1, 1, h2, mix(T.near[1], '#1a1d40', k * 0.6));
      }
    }
    // ground with soft perspective bands
    const gk = k * 0.55;
    px(g, 0, hy, WW, 1, mix(T.gr[3], '#10102a', gk));
    for (let y = hy + 1; y < WH; y++) {
      const d = (y - hy) / (WH - hy), band = Math.floor(Math.sqrt(y - hy) * 2.2) % 2;
      px(g, 0, y, WW, 1, mix(d < 0.12 ? T.gr[2] : band ? T.gr[1] : T.gr[0], '#10102a', gk));
    }
    for (let i = 0; i < WW * WH / 45; i++) {
      const h = hash(i * 31 + 7), x = h % WW, y = hy + 2 + (h >>> 8) % Math.max(1, WH - hy - 2), c = (h >>> 5) % 11;
      if (c < 6) px(g, x, y, 1, 1, mix(T.gr[3], '#10102a', gk));
      else if (c < 8) { px(g, x, y, 1, 1, mix(T.gr[2], '#10102a', gk)); px(g, x + 1, y - 1, 1, 1, mix(T.gr[2], '#10102a', gk)); }
      else if (c === 9) px(g, x, y, 1, 1, mix(T.dots[(h >>> 12) % T.dots.length], '#10102a', gk * 0.6));
    }
    // props on the horizon
    for (const [kind, fx0, flip] of T.props) {
      const c = safe(() => PX.prop(kind, T.theme || (night > 0.5 ? 'night' : 'day')), null); if (!c) continue;
      const x = fx0 < 0 ? fx0 + c.width / 2 : fx0 > 1 ? WW - c.width / 2 + 4 : Math.round(WW * fx0 - 10);
      const y = kind === 'shells' || kind === 'gumdrops' ? hy + 8 : hy + 3;
      g.save(); if (night > 0.3 && T.theme !== 'night') g.filter = `brightness(${1 - night * 0.35})`;
      PX.blit(g, c, x, y, flip === 1); g.restore();
    }
    // arena pads
    for (const side of ['o', 'p']) { const s = spot(side), rx = side === 'o' ? 18 : 22, ry = side === 'o' ? 4 : 5; ellipse(g, s.x, s.y - 1, rx, ry, mix(T.pad[1], '#10102a', gk), mix(T.pad[0], '#10102a', gk), mix(T.pad[2], '#10102a', gk)); }
    if (night > 0.02 && T.theme !== 'night') { g.fillStyle = `rgba(20,18,64,${0.18 * night})`; g.fillRect(0, hy, WW, WH - hy); }
  }

  const tintCache = new WeakMap();
  function whiteOf(c) {
    let w = tintCache.get(c); if (w) return w;
    w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const x = w.getContext('2d');
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height);
    tintCache.set(c, w); return w;
  }
  function poseFor(side) {
    const A = V.a[side], f = V.b[side], d = V.disp[side];
    if (A.pose) return A.pose;
    if (A.win) return { arms: 'up', eyes: 'happy', mouth: 'open', frame: Math.floor(V.t * 4) % 2 };
    if (d.status === 'sleep') return { eyes: 'closed', mouth: 'flat' };
    if (d.stun) return { eyes: 'sad', mouth: 'o' };
    if (V.phase === 'end' && V.b.winner !== side) return { eyes: 'closed', mouth: 'o' };
    if (d.hp / f.max < 0.25) return { eyes: 'sad', mouth: 'flat' };
    return {};
  }
  function drawFighter(side) {
    const f = V.b[side], A = V.a[side], sp = spot(side), dir = side === 'p' ? 1 : -1;
    if (!f.look) return;
    const spr = safe(() => PX.sprig(f.look, poseFor(side)), null); if (!spr) return;
    let x = sp.x, y = sp.y;
    const bob = V.phase !== 'end' && !A.fainting && Math.floor(V.t * 2 + (side === 'o' ? 1 : 0)) % 2 ? -1 : 0;
    y += bob;
    if (A.enter > 0) x -= dir * Math.round(ease(A.enter) * (WW * 0.6));
    if (A.lunge > 0) { const k = 1 - A.lunge, l = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; x += dir * Math.round(12 * l); y -= Math.round(4 * Math.sin(Math.PI * clamp(k / 0.5, 0, 1))); }
    if (A.hop > 0) y -= Math.round(6 * Math.sin(Math.PI * (1 - A.hop)));
    if (A.win) y -= Math.round(Math.abs(Math.sin(V.t * 7)) * 5);
    if (A.dodge > 0) x -= dir * Math.round(7 * Math.sin(Math.PI * (1 - A.dodge)));
    if (A.shake > 0) x += Math.round(Math.sin(V.t * 70) * 2);
    let alpha = 1;
    if (A.fainting) { alpha = 1 - ease(A.fainting); y += Math.round(ease(A.fainting) * 7); }
    if (alpha <= 0.02) return;
    // shadow
    const sh = A.fainting ? 0 : clamp(Math.round((sp.y - y)), 0, 8);
    lx.fillStyle = 'rgba(34,32,52,.22)'; lx.fillRect(x - 9 + sh, sp.y - 1, 19 - sh * 2, 2);
    lx.globalAlpha = alpha;
    const ay = spr.height - 1; // feet on the bottom row (flower heads make the canvas taller)
    PX.blit(lx, spr, x, y, side === 'p', PX.SPRIG_AX || 16, ay);
    if (A.flash > 0 && Math.floor(A.flash * 30) % 2 === 0) PX.blit(lx, whiteOf(spr), x, y, side === 'p', PX.SPRIG_AX || 16, ay);
    lx.globalAlpha = 1;
    const em = A.emote || (V.disp[side].status === 'sleep' ? 'zz' : V.disp[side].stun ? 'swirl' : null);
    if (em && !A.fainting) { const e = safe(() => PX.emote(em), null); if (e) PX.blit(lx, e, x + 7, y - 26 - (Math.floor(V.t * 3) % 2), false, 0, e.height); }
  }
  function render() {
    if (!cssW) return;
    const night = safe(() => PS.clock.night(), 0);
    const key = [V.area, WW, WH, Math.round(night * 30)].join('|');
    if (key !== bgKey) { bgKey = key; drawBg(night); }
    lx.clearRect(0, 0, WW, WH);
    lx.drawImage(bgC, 0, 0);
    const T = THEMES[V.area] || THEMES.meadow;
    if (T.clouds && night < 0.8) { lx.globalAlpha = 1 - night * 0.7; for (const c of V.clouds) lx.drawImage(icons().clouds[c.k], Math.round(c.x), Math.round(c.y)); lx.globalAlpha = 1; }
    if (T.stars) for (let i = 0; i < 6; i++) { const h = hash(i * 97 + 1), on = Math.floor(V.t * 1.5 + i) % 3 === 0; if (on) px(lx, h % WW, (h >>> 7) % Math.max(1, HY() - 8), 1, 1, '#ffffff'); }
    drawFighter('o'); drawFighter('p');
    for (const p of V.parts) {
      if (p.delay > 0 || !p.spr) continue;
      lx.globalAlpha = clamp(p.life * 3, 0, 1);
      lx.drawImage(p.spr, Math.round(p.x - p.spr.width / 2), Math.round(p.y - p.spr.height / 2));
    }
    lx.globalAlpha = 1;
    // upscale
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lo, 0, 0, WW * PXS * dpr, WH * PXS * dpr);
    // crisp text layer
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of V.pops) {
      const k = p.t / p.life, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, up = ease(Math.min(1, k * 2.2)) * 14;
      const sc = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : k < 0.2 ? 1.1 - (k - 0.12) / 0.08 * 0.1 : 1;
      ctx.globalAlpha = a;
      bigText(p.text, p.x * PXS, (p.y - up) * PXS, Math.round(p.size * sc), p.color);
      if (p.tag) bigText(p.tag, p.x * PXS, (p.y - up) * PXS - p.size * 0.95, 13, p.color);
      ctx.globalAlpha = 1;
    }
    // log typewriter
    const shown = V.log.full.slice(0, Math.floor(V.log.shown));
    const span = logEl.firstChild; if (span.textContent !== shown) span.textContent = shown;
    logEl.lastChild.hidden = !(V.phase === 'play' || V.phase === 'intro' || V.phase === 'end') || V.log.shown < V.log.full.length;
  }
  function bigText(text, x, y, size, col) {
    ctx.font = `700 ${size}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 6); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }

  function frame(dt) {
    if (V) {
      resize();
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
  Object.assign(window.__battle, { start: startBattle, renderHub, forfeit });
  Object.defineProperty(window.__battle, 'V', { get: () => V });
})();
