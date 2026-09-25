// shop.js -- Solunar Sprouts shop: rare creatures, rare eggs and fruit, bought with coins earned in races, battles and the garden.
// Scene: PS.scenes.shop = { mount, show, hide, frame }. Styles are injected below (prefix .sh-).
(function () {
  'use strict';
  const { D, state } = PS;
  const fmt = n => Math.round(n).toLocaleString();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
.sh-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.sh-wrap{padding:12px 12px 28px;max-width:460px;margin:0 auto}
.sh-head{padding:10px 12px 12px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px}
.sh-head .sh-logo{width:40px;height:40px}
.sh-head h1{margin:0;font-size:26px;color:var(--ink)}
.sh-head .sh-sub{font-size:13px;color:var(--ink-soft);line-height:1.2;margin-top:2px}
.sh-wallet{display:flex;align-items:center;gap:7px;background:var(--slot);border:2px solid var(--line);border-bottom-width:4px;border-radius:14px;padding:5px 11px 5px 9px;font-size:19px;color:var(--ink)}
.sh-wallet canvas{width:20px;height:20px}
.sh-wallet.bump{animation:bump .35s}
.sh-earn{grid-column:1/-1;display:flex;gap:10px;align-items:flex-start;background:var(--field);border:2px dashed var(--line);border-radius:14px;padding:8px 10px;font-size:13px;line-height:1.4;color:var(--ink-soft)}
.sh-earn b{color:var(--ink);font-weight:600}
.sh-earn canvas{flex:0 0 auto;width:22px;height:22px;margin-top:1px}
.sh-tabs{position:sticky;top:0;z-index:3;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 0 8px;background:var(--ground)}
.sh-tab{display:flex;flex-direction:column;align-items:center;gap:2px;border:2px solid var(--line);border-bottom-width:4px;border-radius:16px;background:var(--slot);
  padding:6px 4px 5px;font-family:var(--f-px);font-weight:600;font-size:14px;color:var(--ink-soft);min-height:62px}
.sh-tab canvas{height:30px;width:auto}
.sh-tab[aria-selected="true"]{background:var(--panel);border-color:var(--sun-edge);color:var(--ink);box-shadow:inset 0 -4px 0 var(--sun)}
.sh-tab:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sh-intro{font-size:14px;line-height:1.4;color:var(--ink-soft);margin:2px 4px 10px}
.sh-list{display:grid;gap:12px}
.sh-list.fruit{grid-template-columns:1fr 1fr;gap:10px}
.sh-card{background:var(--panel);border:2px solid var(--line);border-bottom:5px solid var(--edge);border-radius:20px;padding:12px;display:grid;grid-template-columns:92px 1fr;gap:2px 12px;align-items:start}
.sh-info{min-width:0;align-self:center}
.sh-art{position:relative;display:grid;place-items:center;height:92px;border-radius:16px;background:var(--slot);border:2px solid var(--line)}
.sh-art canvas{display:block;animation:sh-bob 1.2s steps(1) infinite}
.sh-card:nth-child(2n) .sh-art canvas{animation-delay:-.6s}
@keyframes sh-bob{50%{transform:translateY(-3px)}}
@media (prefers-reduced-motion: reduce){.sh-art canvas{animation:none}}
.sh-own{position:absolute;top:-8px;right:-8px;min-width:26px;height:26px;padding:0 6px;display:grid;place-items:center;border-radius:13px;background:var(--sun);border:2px solid var(--sun-edge);
  font-family:var(--f-px);font-weight:700;font-size:13px;color:#4a3210}
.sh-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:2px}
.sh-title h3{margin:0;font-family:var(--f-px);font-weight:700;font-size:21px;line-height:1.05;color:var(--ink)}
.sh-blurb{margin:4px 0 0;font-size:14px;line-height:1.35;color:var(--ink-soft)}
.sh-facts{grid-column:1/-1;margin:10px 0 0;display:grid;gap:7px}
.sh-fact{display:grid;grid-template-columns:64px 1fr;gap:8px;align-items:start;font-size:14px;line-height:1.35}
.sh-fact dt{font-family:var(--f-px);font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);padding-top:3px}
.sh-fact dd{margin:0;display:flex;flex-wrap:wrap;gap:4px 5px;align-items:center}
.sh-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:1px 7px;font-family:var(--f-ui);font-weight:600;font-size:12.5px;line-height:18px;color:#fff;white-space:nowrap}
.sh-chip.neg{background:#f6dcd6!important;color:#8a2a33}
.sh-chip.soft{background:var(--slot);color:var(--ink);border:1px solid var(--line)}
.sh-chip i{display:inline-block;width:8px;height:8px;border-radius:50%;background:currentColor}
.sh-move{display:inline-flex;align-items:center;gap:5px;background:var(--field);border:2px solid var(--line);border-radius:9px;padding:0 7px;font-size:13px;font-weight:600;line-height:20px}
.sh-move i{width:9px;height:9px;border-radius:3px;display:inline-block}
.sh-bond{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.sh-bond canvas{width:26px;height:26px}
.sh-buy{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:10px;border-top:2px dashed var(--line)}
.sh-status{flex:1;font-size:13px;line-height:1.3;color:var(--ink-soft)}
.sh-status b{color:var(--ink);font-weight:600}
.sh-status .short{color:#a3402f;font-weight:600}
.sh-price{display:inline-flex;align-items:center;gap:6px;font-size:17px;padding:7px 12px 6px;white-space:nowrap}
.sh-price canvas{width:18px;height:18px}
.sh-price.short{background:var(--slot);border-color:var(--line);color:var(--ink-soft)}
.sh-card.mini{grid-template-columns:1fr;text-align:center;padding:10px 10px 10px;gap:0}
.sh-card.mini .sh-art{height:72px}
.sh-card.mini .sh-title{justify-content:center;margin-top:8px}
.sh-card.mini .sh-title h3{font-size:17px}
.sh-card.mini .sh-blurb{font-size:13px;min-height:2.7em}
.sh-card.mini .sh-gives{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:6px}
.sh-card.mini .sh-buy{flex-direction:column;gap:6px;margin-top:10px;padding-top:8px}
.sh-card.mini .sh-price{width:100%;justify-content:center}
.sh-card.mini .sh-status{text-align:center}
.sh-foot{margin:14px 4px 0;font-size:13px;line-height:1.4;color:var(--ink-soft);text-align:center}
.sh-m-price{display:flex;align-items:center;justify-content:center;gap:6px;font-family:var(--f-px);font-weight:600;font-size:18px;margin:0 0 8px;color:var(--ink)}
.sh-m-price canvas{width:18px;height:18px}
.sh-m-left{text-align:center;font-size:13px;color:var(--ink-soft);margin:-4px 0 10px}
.sh-m-note{background:var(--field);border:2px solid var(--line);border-radius:12px;padding:8px 10px;font-size:14px;line-height:1.4}
.sh-spark{position:absolute;width:10px;height:10px;pointer-events:none;image-rendering:pixelated;animation:sh-spark 1.1s ease-out forwards}
@keyframes sh-spark{0%{transform:translate(0,0) scale(.4);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1.2);opacity:0}}
@media (prefers-reduced-motion: reduce){.sh-spark{display:none}}
`;
  function injectCSS() { if (document.getElementById('sh-css')) return; const st = document.createElement('style'); st.id = 'sh-css'; st.textContent = CSS; document.head.appendChild(st); }

  // ---------- helpers ----------
  // copy a sprite into a canvas at an integer scale, sized from the sprite itself
  function put(cv, src, scale) {
    cv.width = src.width; cv.height = src.height;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(src, 0, 0);
    if (scale) { cv.style.width = src.width * scale + 'px'; cv.style.height = src.height * scale + 'px'; }
    cv.classList.add('px');
  }
  const fitScale = (src, box) => Math.max(1, Math.floor(box / Math.max(src.width, src.height)));
  // pad a sprite to a square so the modal's square sprite box doesn't stretch it
  function square(src) {
    const n = Math.max(src.width, src.height), c = document.createElement('canvas'); c.width = n; c.height = n;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, Math.floor((n - src.width) / 2), n - src.height); return c;
  }
  // <canvas data-sh="coin"> and friends are painted after innerHTML
  function hydrate(root) {
    root.querySelectorAll('canvas[data-sh]').forEach(cv => {
      const [k, id] = cv.dataset.sh.split(':');
      let src = null;
      if (k === 'coin') src = PS.ui.icon('coin');
      else if (k === 'critter') src = PX.critter(id);
      else if (k === 'egg') src = PX.item('egg', id);
      else if (k === 'fruit') src = PX.item('fruit', id);
      else if (k === 'icon') src = PS.ui.icon(id);
      if (!src) return;
      put(cv, src, +cv.dataset.scale || 0);
      delete cv.dataset.sh;
    });
  }
  const coin = () => '<canvas data-sh="coin"></canvas>';
  const PART_NAMES = { wings: 'Wings', ears: 'Long ears', fins: 'Fins', horns: 'Horns', tail: 'Tail', shell: 'Shell', antennae: 'Antennae', claws: 'Claws', spikes: 'Spikes',
    batwings: 'Bat wings', fairywings: 'Fairy wings', flamewings: 'Flame wings', dragonwings: 'Dragon wings', unihorn: 'Unicorn horn', multitail: 'Nine tails', fluff: 'Fluff',
    tentacles: 'Tentacles', spots: 'Star spots' };
  const partName = p => PART_NAMES[p] || (p.charAt(0).toUpperCase() + p.slice(1));
  const statChip = (st, v) => { const M = D.STAT_META[st]; return `<span class="sh-chip ${v < 0 ? 'neg' : ''}" style="background:${M.color}">${v > 0 ? '+' : '\u2212'}${Math.abs(v)} ${M.label}</span>`; };
  const elChip = el => { const E = D.ELEMENTS[el] || D.ELEMENTS.normal; return `<span class="sh-chip" style="background:${E.color}">${E.label}</span>`; };
  const natureChip = n => !n ? '' : `<span class="sh-chip soft">${n > 0 ? 'Sun' : 'Moon'} nature ${n > 0 ? '+' : '\u2212'}${Math.abs(n)}</span>`;
  const moveChip = id => { const m = D.MOVES[id]; if (!m) return ''; const E = D.ELEMENTS[m.el] || D.ELEMENTS.normal; return `<span class="sh-move" title="${esc(m.desc)}"><i style="background:${E.color}"></i>${esc(m.name)}</span>`; };
  const pouchCount = id => PS.S.pouch.filter(x => x === id).length;
  const eggCount = id => PS.S.eggs.filter(e => e.kind === id).length;

  // ---------- catalogue ----------
  function itemInfo(kind, id) {
    if (kind === 'rare') { const r = D.RARES[id]; return { name: r.name, price: r.price, src: PX.critter(id) }; }
    if (kind === 'egg') { const e = D.EGGS[id]; return { name: e.name, price: e.price, src: PX.item('egg', id) }; }
    const f = D.FRUITS[id]; return { name: f.name, price: f.price, src: PX.item('fruit', id) };
  }
  function buyRow(kind, id, price, owned) {
    const short = price - PS.S.coins;
    const status = short > 0 ? `<span class="short">${fmt(short)} coins short</span>${owned ? `<br>${owned}` : ''}` : (owned || 'You can afford this');
    return `<div class="sh-buy"><div class="sh-status">${status}</div>
      <button class="btn ${short > 0 ? 'short' : 'primary'} sh-price" data-buy="${kind}:${id}" aria-label="Buy for ${fmt(price)} coins">${coin()}<span class="num">${fmt(price)}</span></button></div>`;
  }
  function rareCard(id) {
    const r = D.RARES[id], n = pouchCount(id), E = D.ELEMENTS[r.el] || D.ELEMENTS.normal;
    const gives = Object.entries(r.gives).map(([k, v]) => statChip(k, v)).join('');
    const parts = Object.keys(r.parts).map(p => `<span class="sh-chip soft">${partName(p)}</span>`).join('');
    return `<article class="sh-card">
      <div class="sh-art" style="background:color-mix(in srgb, ${E.color} 16%, var(--slot))"><canvas data-sh="critter:${id}" data-scale="3"></canvas>${n ? `<span class="sh-own" title="In your pouch">${n}</span>` : ''}</div>
      <div class="sh-info"><div class="sh-title"><h3>${esc(r.name)}</h3>${elChip(r.el)}</div>
      <p class="sh-blurb">${esc(r.blurb)}</p></div>
      <dl class="sh-facts">
        <div class="sh-fact"><dt>Boosts</dt><dd>${gives}${natureChip(r.nature)}</dd></div>
        <div class="sh-fact"><dt>Grows</dt><dd>${parts}</dd></div>
        <div class="sh-fact"><dt>Moves</dt><dd>${r.moves.map(moveChip).join('')}</dd></div>
      </dl>
      ${buyRow('rare', id, r.price, n ? `<b>${n}</b> waiting in your pouch` : '')}
    </article>`;
  }
  function eggCard(id) {
    const e = D.EGGS[id], n = eggCount(id);
    let bond = '';
    if (e.hatchWith === 'random') bond = `<span class="sh-bond">A random rare creature</span>`;
    else if (e.hatchWith) bond = `<span class="sh-bond"><canvas data-sh="critter:${e.hatchWith}"></canvas>${esc(D.RARES[e.hatchWith].name)}</span>`;
    const extra = id === 'golden' ? ' Also won from Master races and the Legend League.' : '';
    return `<article class="sh-card">
      <div class="sh-art"><canvas data-sh="egg:${id}" data-scale="3"></canvas>${n ? `<span class="sh-own" title="Waiting in the Garden">${n}</span>` : ''}</div>
      <div class="sh-info"><div class="sh-title"><h3>${esc(e.name)}</h3>${e.sparkle ? '<span class="sh-chip" style="background:#e0a800">Sparkly</span>' : ''}</div>
      <p class="sh-blurb">${esc(e.desc || '')}${extra}</p></div>
      <dl class="sh-facts">
        ${e.bonus ? `<div class="sh-fact"><dt>Bonus</dt><dd><span class="sh-chip soft">+${e.bonus} XP in every stat</span></dd></div>` : ''}
        ${bond ? `<div class="sh-fact"><dt>Bonded</dt><dd>${bond}</dd></div>` : ''}
        <div class="sh-fact"><dt>Hatch</dt><dd>Tap it ${e.taps} times in the Garden</dd></div>
      </dl>
      ${buyRow('egg', id, e.price, n ? `<b>${n}</b> waiting in the Garden` : '')}
    </article>`;
  }
  function fruitCard(id) {
    const f = D.FRUITS[id], n = PS.S.fruits[id] || 0;
    const gives = Object.entries(f.gives || {}).map(([k, v]) => statChip(k, v));
    if (id === 'goldfruit') gives.splice(0, gives.length, `<span class="sh-chip soft">+15 XP to all 5 stats</span>`);
    if (f.nature) gives.push(natureChip(f.nature));
    if (f.happy) gives.push(`<span class="sh-chip soft">+${f.happy} happy</span>`);
    const short = f.price - PS.S.coins;
    return `<article class="sh-card mini">
      <div class="sh-art"><canvas data-sh="fruit:${id}" data-scale="4"></canvas>${n ? `<span class="sh-own" title="You have ${n}">${n}</span>` : ''}</div>
      <div class="sh-title"><h3>${esc(f.name)}</h3></div>
      <p class="sh-blurb">${esc(f.desc)}</p>
      <div class="sh-gives">${gives.join('')}</div>
      <div class="sh-buy">
        <button class="btn ${short > 0 ? 'short' : 'primary'} sh-price" data-buy="fruit:${id}" aria-label="Buy for ${fmt(f.price)} coins">${coin()}<span class="num">${fmt(f.price)}</span></button>
        <div class="sh-status">${short > 0 ? `<span class="short">${fmt(short)} short</span>` : n ? `You have <b>${n}</b>` : 'None yet'}</div>
      </div>
    </article>`;
  }

  const TABS = [
    { id: 'rare', label: 'Creatures', icon: () => PX.critter('dragon'), intro: 'Rare creatures bond with a Sprout just like wild animals, but far stronger: big stat boosts, new body parts and three powerful moves at once.' },
    { id: 'egg', label: 'Rare eggs', icon: () => PX.item('egg', 'rainbow'), intro: 'Rare eggs hatch special Sprouts with a head start. Some hatch already bonded with a rare creature.' },
    { id: 'fruit', label: 'Fruit', icon: () => PX.item('fruit', 'apple'), intro: 'Fruit trains one stat a little and keeps Sprouts happy. Sun Pears and Moon Plums nudge their nature.' },
  ];

  // ---------- scene ----------
  let root, tab = 'rare', dirty = false, visible = false;
  function listHTML() {
    if (tab === 'rare') return `<div class="sh-list">${Object.keys(D.RARES).map(rareCard).join('')}</div>`;
    if (tab === 'egg') return `<div class="sh-list">${D.SHOP_EGGS.filter(id => D.EGGS[id]).map(eggCard).join('')}</div>`;
    return `<div class="sh-list fruit">${Object.keys(D.FRUITS).map(fruitCard).join('')}</div>`;
  }
  function render() {
    dirty = false;
    const sc = root.querySelector('.sh-scroll'), keep = sc ? sc.scrollTop : 0;
    const T = TABS.find(x => x.id === tab);
    root.innerHTML = `<div class="sh-scroll"><div class="sh-wrap">
      <header class="panel sh-head">
        <canvas class="sh-logo" data-sh="icon:shop" data-scale="0"></canvas>
        <div><h1 class="px-title">Shop</h1><div class="sh-sub">Rare friends, eggs and snacks</div></div>
        <div class="sh-wallet" title="Your coins">${coin()}<span class="num">${fmt(PS.S.coins)}</span></div>
        <div class="sh-earn"><canvas data-sh="icon:race" data-scale="0"></canvas><div><b>Earn coins</b> by racing and battling. Higher tiers pay much more. Coins also drop in the Garden.</div></div>
      </header>
      <div class="sh-tabs" role="tablist">${TABS.map(x => `<button class="sh-tab" role="tab" data-tab="${x.id}" aria-selected="${x.id === tab}"><canvas data-tabicon="${x.id}"></canvas>${x.label}</button>`).join('')}</div>
      <p class="sh-intro">${T.intro}</p>
      ${listHTML()}
      <p class="sh-foot">Everything you buy goes to the Garden. Rare creatures wait in your pouch, eggs sit in the grass, and fruit goes in your fruit basket.</p>
    </div></div>`;
    hydrate(root);
    root.querySelectorAll('canvas[data-tabicon]').forEach(cv => put(cv, TABS.find(x => x.id === cv.dataset.tabicon).icon()));
    root.querySelector('.sh-scroll').scrollTop = keep;
  }
  function refreshWallet(bump) {
    const w = root && root.querySelector('.sh-wallet'); if (!w) return;
    w.querySelector('.num').textContent = fmt(PS.S.coins);
    if (bump) { w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
  }

  // ---------- buying ----------
  function whatHappens(kind, id) {
    if (kind === 'rare') return `It goes into your pouch. In the Garden, drag it onto a Sprout to bond. That Sprout gets its boosts, grows its parts and learns all three of its moves.`;
    if (kind === 'egg') { const e = D.EGGS[id]; return `It will appear in the ${esc(D.AREAS[PS.S.area].name)} in the Garden. Tap it ${e.taps} times to hatch a new Sprout.`; }
    return `It goes in your fruit basket in the Garden. Feed it to any Sprout.`;
  }
  function confirmBuy(kind, id) {
    const info = itemInfo(kind, id), coins = PS.S.coins;
    if (coins < info.price) {
      PX.Sound.play('miss');
      PS.ui.toast(`You need ${fmt(info.price - coins)} more coins for the ${info.name}.`, 2800);
      return;
    }
    const buttons = [];
    if (kind === 'fruit') {
      const maxN = Math.floor(coins / info.price);
      buttons.push({ label: `Buy 1 for ${fmt(info.price)}`, kind: 'primary', onClick: () => doBuy(kind, id, 1) });
      if (maxN >= 5) buttons.push({ label: `Buy 5 for ${fmt(info.price * 5)}`, kind: 'go', onClick: () => doBuy(kind, id, 5) });
      buttons.push({ label: 'Not now' });
    } else {
      buttons.push({ label: 'Not now' }, { label: 'Buy it', kind: 'primary', onClick: () => doBuy(kind, id, 1) });
    }
    PS.ui.modal({
      eyebrow: kind === 'rare' ? 'Rare creature' : kind === 'egg' ? 'Rare egg' : 'Fruit', title: `Buy the ${esc(info.name)}?`, sprite: square(info.src),
      html: `<p class="sh-m-price">${coin()}<span class="num">${fmt(info.price)}</span></p>
        <p class="sh-m-left">You have ${fmt(coins)}. You'd have ${fmt(coins - info.price)} left.</p>
        <p class="sh-m-note">${whatHappens(kind, id)}</p>`,
      row: kind !== 'fruit', buttons, mount: card => hydrate(card),
    });
  }
  function doBuy(kind, id, n) {
    const info = itemInfo(kind, id);
    let got = 0;
    for (let i = 0; i < (n || 1); i++) { if (state.buy(kind, id)) got++; else break; }
    if (!got) { PX.Sound.play('miss'); PS.ui.toast('Not enough coins.'); return; }
    PX.Sound.play('level'); PX.buzz(25);
    let title, body, area = PS.S.area;
    if (kind === 'rare') {
      title = `You got a ${esc(info.name)}!`;
      body = `<p>The ${esc(info.name)} is in your pouch in the Garden. Drag it onto a Sprout to bond with it.</p><p>Bonding is permanent, so pick the Sprout you want it to shape.</p>`;
    } else if (kind === 'egg') {
      const egg = PS.S.eggs[PS.S.eggs.length - 1]; area = egg ? egg.area : area;
      title = `You got a ${esc(info.name)}!`;
      body = `<p>The ${esc(info.name)} is waiting in the ${esc(D.AREAS[area].name)} in the Garden. Tap it ${D.EGGS[id].taps} times to hatch it.</p>`;
    } else {
      title = got > 1 ? `${got} \u00d7 ${esc(info.name)}!` : `One ${esc(info.name)}!`;
      body = `<p>${got > 1 ? 'They are' : 'It is'} in your fruit basket in the Garden. Feed ${got > 1 ? 'them' : 'it'} to a Sprout there. You now have ${PS.S.fruits[id] || got}.</p>`;
    }
    PS.ui.modal({
      eyebrow: 'Bought', title, sprite: square(info.src), html: body,
      buttons: [
        { label: 'Go to the Garden', kind: 'go', onClick: () => { if (area !== PS.S.area) { PS.S.area = area; PS.emit('area', { area }); PS.save(); } PS.ui.go('garden'); } },
        { label: 'Keep shopping' },
      ],
      mount: card => celebrate(card),
    });
    if (visible) render();
  }
  // a little burst of pixel sparkles around the modal sprite
  function celebrate(card) {
    card.style.position = 'relative';
    const sp = card.querySelector('.m-sprite'); if (!sp) return;
    const cx = sp.offsetLeft + sp.offsetWidth / 2, cy = sp.offsetTop + sp.offsetHeight / 2;
    const cols = ['#fbf236', '#f7b6c8', '#9fd8ff', '#99e550', '#ffffff'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = 70 + Math.random() * 30, c = document.createElement('canvas');
      put(c, PX.fx(i % 3 ? 'spark' : 'bigspark', cols[i % cols.length]));
      c.className = 'px sh-spark';
      c.style.cssText = `left:${cx - 5}px;top:${cy - 5}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;animation-delay:${(i % 4) * 0.05}s`;
      card.appendChild(c);
      setTimeout(() => c.remove(), 1400);
    }
  }

  // ---------- wiring ----------
  function onClick(e) {
    const t = e.target.closest('[data-tab]');
    if (t) { if (t.dataset.tab !== tab) { tab = t.dataset.tab; PX.Sound.play('tick'); render(); root.querySelector('.sh-scroll').scrollTop = 0; } return; }
    const b = e.target.closest('[data-buy]');
    if (b) { PX.Sound.play('pop'); const [k, id] = b.dataset.buy.split(':'); confirmBuy(k, id); }
  }
  const markDirty = () => { if (visible) render(); else dirty = true; };
  PS.scenes.shop = {
    mount(el) {
      injectCSS(); root = el;
      root.addEventListener('click', onClick);
      PS.on('coins', e => { if (visible) { render(); refreshWallet(e.n > 0); } else dirty = true; });
      PS.on('pouch', markDirty); PS.on('egg:new', markDirty); PS.on('egg:hatch', markDirty);
      PS.on('reset', markDirty);
      render();
    },
    show(params) {
      visible = true;
      if (params && params.tab && TABS.some(x => x.id === params.tab)) { tab = params.tab; dirty = true; }
      if (dirty) render();
    },
    hide() { visible = false; },
    frame() {},
  };
})();
