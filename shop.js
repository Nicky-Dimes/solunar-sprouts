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
.sh-sec{font-size:22px;margin:22px 2px 2px;color:#96461c}
.sh-sec-sub{margin:0 2px 10px;font-size:14px;color:var(--ink-soft);font-weight:600}
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

/* gumball machine */
.sh-tabs.four{grid-template-columns:repeat(4,1fr);gap:5px}
.sh-tabs.four .sh-tab{font-size:13px;padding:6px 2px 5px}
.sh-gb{display:grid;gap:12px}
.sh-gb-stage{position:relative;height:300px;overflow:hidden;border-radius:22px;border:2px solid var(--line);border-bottom:5px solid var(--edge);
  background:radial-gradient(circle at 50% 40%, #fffbe9 0 38%, transparent 39%), linear-gradient(#ffeec4, #fde3a7)}
.sh-gb-stage::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.6) 18%, transparent 20%);background-size:26px 26px;opacity:.7}
.sh-gb-floor{position:absolute;left:0;right:0;bottom:0;height:34px;background:var(--slot);border-top:3px solid var(--edge)}
.sh-gb-machine{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:block}
.sh-gb-stage.shake .sh-gb-machine{animation:sh-gb-shake .16s steps(2) infinite}
@keyframes sh-gb-shake{50%{transform:translateX(calc(-50% + 2px))}}
.sh-gb-ball{position:absolute;padding:0;border:0;background:none;display:block;touch-action:manipulation;z-index:2}
.sh-gb-ball::before{content:"";position:absolute;inset:-16px}
.sh-gb-ball canvas{display:block}
.sh-gb-ball.small{left:calc(50% - 21px);top:213px;--drop:25px;--bx:108px}
.sh-gb-ball.mega{left:calc(50% - 32px);top:202px;--drop:15px;--bx:104px}
.sh-gb-ball.mega .gb{filter:drop-shadow(0 0 7px rgba(255,236,110,.95)) drop-shadow(0 0 2px #ffffff)}
.sh-gb-ball .tw{position:absolute;display:block;animation:sh-gb-tw 1.1s steps(2) infinite;pointer-events:none}
.sh-gb-ball .tw:nth-of-type(2){animation-delay:-.35s}.sh-gb-ball .tw:nth-of-type(3){animation-delay:-.7s}
@keyframes sh-gb-tw{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.5)}}
.sh-gb-ball.opening .tw{display:none}
.sh-gb-ball.rolling{animation:sh-gb-roll .95s cubic-bezier(.3,.6,.4,1) forwards;pointer-events:none}
.sh-gb-ball.ready,.sh-gb-ball.opening{transform:translate(var(--bx),var(--drop))}
.sh-gb-ball.ready .gb{animation:sh-gb-wait .9s ease-in-out infinite}
.sh-gb-ball.opening .gb{animation:sh-gb-pop .32s ease-out forwards}
@keyframes sh-gb-roll{
  0%{transform:translate(0,-6px) scale(.3) rotate(0)}
  14%{transform:translate(0,0) scale(1) rotate(0)}
  30%{transform:translate(6px,var(--drop)) rotate(60deg)}
  62%{transform:translate(calc(var(--bx) * .82),var(--drop)) rotate(400deg)}
  76%{transform:translate(calc(var(--bx) * .94),calc(var(--drop) - 12px)) rotate(560deg)}
  90%{transform:translate(var(--bx),var(--drop)) rotate(680deg)}
  100%{transform:translate(var(--bx),var(--drop)) rotate(720deg)}}
@keyframes sh-gb-wait{0%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}55%{transform:translateY(0) scale(1.08,.92)}70%{transform:translateY(-3px)}}
@keyframes sh-gb-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1.8);opacity:0}}
.sh-gb-tap{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);white-space:nowrap;background:var(--ink);color:var(--panel);font-family:var(--f-px);font-weight:700;font-size:16px;
  border-radius:10px;padding:4px 10px;pointer-events:none;animation:sh-gb-hint 1s ease-in-out infinite}
.sh-gb-tap::after{content:"";position:absolute;left:50%;top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:var(--ink)}
@keyframes sh-gb-hint{50%{transform:translate(-50%,-4px)}}
.sh-gb-ball:not(.ready) .sh-gb-tap{display:none}
.sh-gb-say{margin:-2px 4px 0;text-align:center;font-family:var(--f-px);font-weight:600;font-size:17px;line-height:1.25;color:var(--ink);min-height:1.25em}
.sh-gb-buys{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sh-gb-opt{display:grid;gap:5px;align-content:start}
.sh-gb-buy{display:grid;justify-items:center;align-content:center;gap:5px;width:100%;min-height:128px;padding:10px 6px 8px;font-size:18px}
.sh-gb-buy canvas{display:block}
.sh-gb-buy .sh-gb-pr{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.55);border-radius:10px;padding:2px 10px 1px}
.sh-gb-buy .sh-gb-pr canvas{width:18px;height:18px}
.sh-gb-buy .num{font-size:19px}
.btn.sh-gb-mega{background:linear-gradient(#efe0ff,#c9a2f0);border-color:#7a52b0;color:#3a2160}
.sh-gb-buy[disabled]{background:var(--slot);border-color:var(--line);color:var(--ink-soft);cursor:default}
.sh-gb-buy[disabled]:active{transform:none;border-bottom-width:5px;margin-bottom:0}
.sh-gb-buy[disabled] canvas{opacity:.55}
.sh-gb-why{margin:0;text-align:center;font-size:14px;line-height:1.3;color:var(--ink-soft)}
.sh-gb-why b{color:#a3402f}
.sh-gb-inside{background:var(--field);border:2px dashed var(--line);border-radius:16px;padding:10px 12px 12px}
.sh-gb-inside h3{margin:0 0 8px;font-family:var(--f-px);font-weight:700;font-size:17px;color:var(--ink)}
.sh-gb-prizes{display:flex;flex-wrap:wrap;gap:6px}
.sh-gb-prize{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:2px solid var(--line);border-radius:12px;padding:3px 9px 3px 5px;font-size:14px;font-weight:600;color:var(--ink)}
.sh-gb-prize canvas{height:24px;width:auto}
.sh-gb-inside p{margin:9px 0 0;font-size:14px;line-height:1.4;color:var(--ink-soft)}
.sh-gb-inside p b{color:var(--ink);font-weight:600}
@media (prefers-reduced-motion: reduce){.sh-gb-ball.rolling{animation-duration:.01s}.sh-gb-ball.ready .gb,.sh-gb-ball .tw,.sh-gb-tap,.sh-gb-stage.shake .sh-gb-machine{animation:none}}
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
      else if (k === 'bigcoin') src = PX.item('bigcoin');
      else if (k === 'fx') src = PX.fx('bigspark', '#' + id);
      else if (ART.kinds.includes(k)) src = ART.item(k, id);
      if (!src) return;
      put(cv, src, +cv.dataset.scale || 0);
      delete cv.dataset.sh;
    });
  }
  const coin = () => '<canvas data-sh="coin"></canvas>';

  // ---------- gumball + closet art ----------
  // Uses the artist's sprites when pixel.js has them: PX.gumballMachine(frame), PX.gumballColors, PX.item('gumball'|'paint'|'pattern'|'hat'|'skin', id).
  // Until then these stand-ins keep everything drawable. PX.item() answers kinds it doesn't know with its 9x9 grey dot, so that size means "not drawn yet".
  // Shared with sprouts.js as PS.styleArt.
  const ART = (() => {
    const GB = ['#e5535f', '#f6a83a', '#fbf236', '#6abe30', '#5fcde4', '#639bff', '#9a6ad0', '#f7b6c8'];
    const MORE_RAMPS = { // body colours pixel.js may not have ramps for yet
      lilac: ['#ecdcff', '#c9a2f0', '#8a6ab8'], teal: ['#8fe8d8', '#2fa89a', '#1f6a66'], coral: ['#ffc0aa', '#f57a5c', '#b04a3a'], lemon: ['#fffbc0', '#fbf236', '#c8b020'],
      lime: ['#dcf88a', '#a8e030', '#5a9a20'], ocean: ['#8fc4f4', '#3a78c8', '#224a8a'], cherry: ['#ff94a2', '#e0283c', '#8a1428'], cream: ['#fffbf0', '#f4e6c8', '#c8b08a'],
      charcoal: ['#9a9aa8', '#4a4a58', '#26262e'], tangerine: ['#ffc478', '#f68a1e', '#b0561a'], bubblegum: ['#ffdcf0', '#ff90cc', '#d0508a'], aqua: ['#ccfcff', '#6ae8f0', '#2aa0b8'],
    };
    const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const mix = (a, b, k) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * k).toString(16).padStart(2, '0')).join('');
    const ramp3 = c => [mix(c, '#ffffff', 0.45), c, mix(c, '#222034', 0.35)];
    const colors = () => (Array.isArray(PX.gumballColors) && PX.gumballColors.length ? PX.gumballColors : GB);
    const bodyRamp = id => (PX.RAMPS && PX.RAMPS[id]) || MORE_RAMPS[id] || ['#dfe3ea', '#9badb7', '#595a70'];
    const G = (w, h) => new PX.Grid(w, h);
    const drawn = c => !!(c && c.width && !(c.width === 9 && c.height === 9));
    function fromPX(kind, id) { try { const c = PX.item(kind, id); return drawn(c) ? c : null; } catch (e) { return null; } }
    // paint a shape into a scratch grid and copy it onto g only where g already has colour `on`
    function stamp(g, on, draw) { const t = G(g.w, g.h); draw(t); for (let i = 0; i < g.a.length; i++) if (t.a[i] && g.a[i] === on) g.a[i] = t.a[i]; }
    const layer = (g, draw) => { const t = G(g.w, g.h); draw(t); t.outline(); g.merge(t); };

    const STICK = '#fffdf6', PINK = '#e07ba0';
    const PATTERN = {
      plain: g => stamp(g, STICK, t => t.ell(6.5, 6.5, 3, 3, '#f4e9cc').ell(6.5, 6.5, 2, 2, null)),
      spots: g => stamp(g, STICK, t => { for (const [x, y] of [[4, 4.5], [8.8, 4.2], [4.6, 8.8], [9, 8.6], [6.8, 6.6]]) t.ell(x, y, 1.3, 1.3, PINK); }),
      stripes: g => stamp(g, STICK, t => t.rect(0, 3, 13, 1, PINK).rect(0, 6, 13, 1, PINK).rect(0, 9, 13, 1, PINK)),
      twotone: g => stamp(g, STICK, t => t.rect(0, 7, 13, 6, PINK)),
      mask: g => stamp(g, STICK, t => t.rect(0, 5, 13, 3, PINK).px([[4, 6], [8, 6]], '#222034')),
      star: g => stamp(g, STICK, t => t.poly(PX.starPts(6.5, 6.9, 4.4, 1.9, 5), '#f6c83a')),
      freckles: g => stamp(g, STICK, t => t.px([[3, 6], [4, 7], [2, 8], [9, 6], [8, 7], [10, 8], [6, 4]], '#c48a5c')),
      heart: g => stamp(g, STICK, t => t.ell(5, 5.4, 1.9, 1.9, '#e5535f').ell(8, 5.4, 1.9, 1.9, '#e5535f').poly([[3.1, 5.8], [9.9, 5.8], [6.5, 10]], '#e5535f')),
      socks: g => stamp(g, STICK, t => t.rect(0, 8, 13, 1, '#ffffff').rect(0, 9, 13, 4, PINK)),
    };
    // hats from the sprite itself: draw a Sprout with and without it and keep the pixels that changed
    function hatFromSprig(id, slot) {
      const base = PX.cloneLook(PX.DEFAULT_LOOK); base.hat = 'none'; base.extra = 'none';
      const on = PX.cloneLook(base); on[slot] = id;
      const A = PX.sprig(on, {}), B = PX.sprig(base, {}), w = A.width, h = A.height;
      if (B.width !== w || B.height !== h) return null;
      const a = A.getContext('2d').getImageData(0, 0, w, h).data, b = B.getContext('2d').getImageData(0, 0, w, h).data;
      const g = G(w, h); let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (a[i + 3] < 128 || (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3])) continue;
        if (a[i] === 0x22 && a[i + 1] === 0x20 && a[i + 2] === 0x34) continue; // ink: re-outlined below
        g.set(x, y, '#' + [a[i], a[i + 1], a[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      if (x1 < 0 || (x1 - x0 + 1) * (y1 - y0 + 1) < 4) return null;
      g.outline();
      const out = G(16, 14), ox = Math.round((x0 + x1 + 1) / 2) - 8, oy = Math.round((y0 + y1 + 1) / 2) - 7;
      for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) out.set(x, y, g.get(x + ox, y + oy));
      return out.canvas();
    }
    const HAND = { // hats the Sprout sprite can't draw yet
      party: g => { layer(g, t => { t.poly([[3.5, 13], [12.5, 13], [8, 2.5]], '#5fcde4'); t.px([[7, 6], [9, 9], [6, 11], [10, 12], [8, 4]], '#f7b6c8'); t.px([[8, 8], [6, 9], [9, 11]], '#fbf236'); }); layer(g, t => t.ell(8, 2, 1.6, 1.6, '#fbf236')); },
      wizard: g => { layer(g, t => t.poly([[4, 11.5], [12, 11.5], [11.5, 1], [8.5, 4]], '#9a6ad0').px([[7, 7], [6, 8], [7, 8], [8, 8], [7, 9]], '#fbf236')); layer(g, t => t.ell(8, 11.8, 7.4, 1.6, '#5e3a8e')); },
      sunhat: g => { layer(g, t => t.ell(8, 10.2, 7.4, 2.4, ['#fbe0a0', '#e8b860', '#b08030'])); layer(g, t => t.ell(8, 8, 4.2, 4, ['#fbe0a0', '#e8b860', '#b08030'], 0, (x, y) => y <= 9).rect(4, 7, 9, 2, '#e5535f')); },
      cap: g => { layer(g, t => t.ell(12, 11, 3.8, 1.4, '#3f55b8')); layer(g, t => t.ell(7, 10, 5.6, 5, ['#9fd8ff', '#639bff', '#3f55b8'], 0, (x, y) => y <= 10).px([[7, 5]], '#fbf236')); },
      generic: g => layer(g, t => t.ell(8, 10, 6, 5, ['#b7c2cc', '#8c93a8', '#595a70'], 0, (x, y) => y <= 11)),
    };
    const SKIN = { gold: ['#fffbd0', '#f6c83a', '#b87818'], crystal: ['#f4feff', '#c8ecfa', '#8ab8e0'], ember: ['#ffb070', '#e8543a', '#8a2433'] };
    const STAND = {
      gumball(i) { const g = G(7, 7); g.ell(3.5, 3.5, 2.6, 2.6, ramp3(colors()[(+i || 0) % colors().length])); g.outline(); g.set(2, 2, '#ffffff'); return g.canvas(); },
      paint(id) {
        const R = bodyRamp(id), g = G(13, 13);
        g.rect(2, 4, 9, 8, '#b7c2cc').rect(2, 4, 2, 8, '#dfe8fb').rect(9, 4, 2, 8, '#8c93a8');
        g.rect(2, 6, 9, 4, R[1]).rect(2, 6, 2, 4, R[0]).rect(9, 6, 2, 4, R[2]);
        g.ell(6.5, 3.4, 4.5, 1.6, R[1]); g.outline();
        g.px([[4, 3], [5, 3]], R[0]); g.px([[7, 5], [5, 4]], R[1]); g.px([[3, 10]], '#ffffff');
        return g.canvas();
      },
      pattern(id) { const g = G(13, 13); g.ell(6.5, 6.5, 5.6, 5.6, STICK); (PATTERN[id] || PATTERN.plain)(g); g.outline(); g.px([[4, 2], [3, 3]], '#ffffff'); return g.canvas(); },
      hat(id) {
        const H = D.HATS[id];
        let c = null; try { if (H && !HAND[id]) c = hatFromSprig(id, H.slot); } catch (e) { c = null; }
        if (c) return c;
        const g = G(16, 14); (HAND[id] || HAND.generic)(g); return g.canvas();
      },
      skin(id) {
        const g = G(13, 13); g.poly(PX.starPts(6.5, 7, 6.2, 2.8, 5), '#ffffff');
        if (id === 'rainbow') { const band = ['#f07a84', '#f6a83a', '#fbf236', '#99e550', '#5fcde4', '#9a6ad0']; for (let i = 0; i < g.a.length; i++) if (g.a[i]) g.a[i] = band[Math.min(5, Math.floor((i / 13 | 0) / 2.1))]; }
        else { const R = SKIN[id] || SKIN.gold; g.ell(6.5, 7, 6.5, 6.5, R, 0, (x, y) => g.filled(x, y)); }
        g.outline(); g.px([[5, 5], [6, 4]], '#ffffff'); return g.canvas();
      },
    };
    const cache = {};
    function item(kind, id) {
      const own = fromPX(kind, id); if (own) return own;
      const key = kind + ':' + id; if (cache[key]) return cache[key];
      let c = null; try { c = STAND[kind] ? STAND[kind](id) : null; } catch (e) { console.error('styleArt', kind, id, e); }
      return (cache[key] = c || PX.item('unknown'));
    }
    // stand-in machine, 40x60: frame 0 idle, 1 & 2 crank turning, 3 chute door open
    function standMachine(frame) {
      const RED = ['#f07a84', '#d24552', '#8a2433'], MET = ['#ffffff', '#dfe8fb', '#9badb7'], g = G(40, 60);
      layer(g, t => t.rect(8, 55, 7, 3, RED[2]).rect(25, 55, 7, 3, RED[2]));
      layer(g, t => { t.poly([[9, 35], [31, 35], [33, 56], [7, 56]], RED[1]); t.ell(20, 44, 16, 14, RED, 0, (x, y) => t.filled(x, y)); });
      layer(g, t => t.ell(20, 19, 15, 14.5, '#eaf7ff'));
      const balls = [[13, 28], [18, 29], [23, 29], [28, 27], [11, 24], [16, 25], [21, 25], [26, 24], [30, 22], [14, 20], [19, 21], [24, 20], [10, 19], [28, 18], [17, 16], [22, 16]];
      const glass = (x, y) => g.get(x, y) === '#eaf7ff';
      balls.forEach(([x, y], i) => { const R = ramp3(colors()[(i * 3) % colors().length]); g.ell(x, y, 2.4, 2.4, R, 0, glass); g.set(x - 1, y - 1, R[0]); });
      g.px([[11, 9], [10, 10], [9, 11], [9, 12], [12, 8], [13, 7]], '#ffffff');
      layer(g, t => t.rect(15, 2, 10, 4, RED[1]).rect(15, 2, 3, 4, RED[0]).rect(22, 2, 3, 4, RED[2]));
      layer(g, t => t.rect(10, 32, 20, 3, MET[1]).rect(10, 32, 20, 1, MET[0]));
      layer(g, t => t.ell(20, 42, 5, 5, MET));
      const ang = [-Math.PI / 2, 0, Math.PI / 2, -Math.PI / 2][frame] || -Math.PI / 2, hx = 20 + Math.cos(ang) * 6, hy = 42 + Math.sin(ang) * 6;
      layer(g, t => { PX.stroke(t, [[20, 42], [hx, hy]], 1.1, 1.1, '#595a70'); t.ell(hx, hy, 2, 2, ['#fff27a', '#f6c83a', '#c7861c']); });
      if (frame === 3) layer(g, t => t.rect(15, 47, 10, 6, '#45283c').rect(14, 53, 12, 2, MET[2]));
      else layer(g, t => t.rect(15, 47, 10, 6, MET[1]).rect(15, 47, 10, 1, MET[0]).rect(18, 51, 4, 1, MET[2]));
      return g.canvas();
    }
    const mcache = {};
    function machine(frame) {
      frame = frame | 0;
      if (typeof PX.gumballMachine === 'function') { try { const c = PX.gumballMachine(frame); if (c && c.width) return c; } catch (e) { /* fall back */ } }
      return mcache[frame] || (mcache[frame] = standMachine(frame));
    }
    // small 16x20 machine for the tab button
    let tab = null;
    function tabIcon() {
      if (tab) return tab;
      const g = G(16, 20), RED = ['#f07a84', '#d24552', '#8a2433'];
      layer(g, t => t.poly([[3, 12], [13, 12], [14, 19], [2, 19]], RED[1]));
      layer(g, t => t.ell(8, 7, 6.2, 6, '#eaf7ff'));
      [[5, 9], [8, 10], [11, 9], [6, 6], [10, 6], [8, 4]].forEach(([x, y], i) => g.ell(x, y, 1.3, 1.3, colors()[(i * 3) % colors().length], 0, (a, b) => g.get(a, b) === '#eaf7ff'));
      g.set(5, 3, '#ffffff');
      layer(g, t => t.rect(6, 15, 4, 2, '#45283c'));
      return (tab = g.canvas());
    }
    return { kinds: ['gumball', 'paint', 'pattern', 'hat', 'skin'], item, machine, tabIcon, colors };
  })();
  PS.styleArt = ART;
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
    else if (e.hatchWith) bond = `<span class="sh-bond"><canvas data-sh="critter:${e.hatchWith}"></canvas>${esc(PS.state.creature(e.hatchWith).name)}</span>`;
    const extra = id === 'golden' ? ' Also won from Master races and the Legend League.' : '';
    return `<article class="sh-card">
      <div class="sh-art"><canvas data-sh="egg:${id}" data-scale="3"></canvas>${n ? `<span class="sh-own" title="Waiting in the Garden">${n}</span>` : ''}</div>
      <div class="sh-info"><div class="sh-title"><h3>${esc(e.name)}</h3>${e.sparkle ? '<span class="sh-chip" style="background:#e0a800">Sparkly</span>' : ''}${e.spooky ? '<span class="sh-chip" style="background:#df7126">Spooky</span>' : ''}</div>
      <p class="sh-blurb">${esc(e.desc || '')}${extra}</p></div>
      <dl class="sh-facts">
        ${e.bonus ? `<div class="sh-fact"><dt>Bonus</dt><dd><span class="sh-chip soft">+${e.bonus} XP in every stat</span></dd></div>` : ''}
        ${bond ? `<div class="sh-fact"><dt>Bonded</dt><dd>${bond}</dd></div>` : ''}
        ${e.skin && D.SKINS[e.skin] ? `<div class="sh-fact"><dt>Skin</dt><dd><span class="sh-chip soft">${esc(D.SKINS[e.skin].name)}</span></dd></div>` : ''}
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
    { id: 'gumball', label: 'Gumballs', icon: () => ART.tabIcon(), intro: 'Turn the crank and win a surprise! Every gumball has a prize inside.' },
  ];

  // ---------- gumball machine ----------
  // gb.phase: idle -> crank -> rolling -> ready (waiting for a tap) -> opening -> shown (prize modal) -> idle.
  // The prize is already in the save when the crank starts (state.gumball pays out), so leaving mid-way loses nothing.
  const gb = { phase: 'idle', tier: 'small', res: null, frame: 0 };
  const GB_SCALE = 4, CRANK = [1, 2, 1, 2, 0, 3], CRANK_MS = 150, ROLL_MS = 950;
  const PRIZE_KINDS = [
    ['bigcoin', 'Coins'], ['fruit:apple', 'Fruit'], ['paint:coral', 'Paint'], ['pattern:heart', 'Stickers'], ['hat:party', 'Hats'],
    ['critter:hare', 'Animals'], ['egg:meadow', 'Eggs'], ['critter:unicorn', 'Rare creatures'],
  ];
  function gbSay() {
    if (gb.phase === 'crank') return 'Crank, crank, crank…';
    if (gb.phase === 'rolling') return 'Here it comes!';
    if (gb.phase === 'ready') return `Tap your ${gb.tier === 'mega' ? 'mega ' : ''}gumball to open it!`;
    if (gb.phase === 'opening' || gb.phase === 'shown') return 'Pop!';
    return PS.S.coins < D.GUMBALL.small.price ? 'Win races and battles to earn coins!' : 'Pick a gumball below.';
  }
  function gbBallHTML() {
    if (!['rolling', 'ready', 'opening'].includes(gb.phase) || !gb.res) return '';
    const big = gb.tier === 'mega';
    const tw = big ? [[-12, 4, 'fff27a'], [58, -4, 'ffffff'], [50, 50, 'f7b6c8']].map(([x, y, c]) => `<canvas class="tw" data-sh="fx:${c}" data-scale="3" style="left:${x}px;top:${y}px"></canvas>`).join('') : '';
    return `<button class="sh-gb-ball ${big ? 'mega' : 'small'} ${gb.phase}" data-gb-open aria-label="Open your gumball">
      <canvas class="gb" data-sh="gumball:${gb.res.color}" data-scale="${big ? 9 : 6}"></canvas>${tw}<span class="sh-gb-tap">Tap me!</span></button>`;
  }
  function gbBuysHTML() {
    const busy = gb.phase !== 'idle';
    return ['small', 'mega'].map(tier => {
      const G = D.GUMBALL[tier], short = G.price - PS.S.coins, big = tier === 'mega';
      const why = short > 0 ? `You need <b>${fmt(short)}</b> more coins` : busy ? 'Open your gumball first' : big ? 'Bigger, shinier prizes!' : 'A little surprise';
      return `<div class="sh-gb-opt"><button class="btn ${big ? 'sh-gb-mega' : 'primary'} sh-gb-buy" data-gumball="${tier}" ${short > 0 || busy ? 'disabled' : ''} aria-label="${esc(G.name)} for ${fmt(G.price)} coins">
        <canvas data-sh="gumball:${big ? 6 : 0}" data-scale="${big ? 6 : 4}"></canvas><span>${esc(G.name)}</span>
        <span class="sh-gb-pr">${coin()}<span class="num">${fmt(G.price)}</span></span></button>
        <p class="sh-gb-why">${why}</p></div>`;
    }).join('');
  }
  function gumballHTML() {
    const prizes = PRIZE_KINDS.map(([k, l]) => `<span class="sh-gb-prize"><canvas data-sh="${k}"></canvas>${l}</span>`).join('');
    return `<div class="sh-gb">
      <div class="sh-gb-stage ${gb.phase === 'crank' ? 'shake' : ''}"><div class="sh-gb-floor"></div><canvas class="px sh-gb-machine" data-gb-machine></canvas>${gbBallHTML()}</div>
      <p class="sh-gb-say" aria-live="polite">${gbSay()}</p>
      <div class="sh-gb-buys">${gbBuysHTML()}</div>
      <div class="sh-gb-inside"><h3>What's inside?</h3><div class="sh-gb-prizes">${prizes}</div>
        <p><b>Mega gumballs</b> hold bigger prizes: more hats, more eggs and a better chance of a rare creature.</p></div>
    </div>`;
  }
  function drawMachine() {
    const cv = root && root.querySelector('[data-gb-machine]'); if (!cv) return;
    put(cv, ART.machine(gb.frame), GB_SCALE);
  }
  // refresh just the machine area (keeps the page and its scroll position still)
  function refreshGumball() {
    if (!root || tab !== 'gumball') return;
    const stage = root.querySelector('.sh-gb-stage'); if (!stage) return;
    stage.classList.toggle('shake', gb.phase === 'crank');
    const ball = stage.querySelector('.sh-gb-ball'), want = gbBallHTML();
    if (!want && ball) ball.remove();
    else if (want && !ball) { stage.insertAdjacentHTML('beforeend', want); hydrate(stage); }
    else if (ball) ball.className = `sh-gb-ball ${gb.tier === 'mega' ? 'mega' : 'small'} ${gb.phase}`;
    drawMachine();
    root.querySelector('.sh-gb-say').textContent = gbSay();
    const buys = root.querySelector('.sh-gb-buys'); buys.innerHTML = gbBuysHTML(); hydrate(buys);
  }
  // scroll so the machine sits just under the sticky tabs (the buttons fit below it on a phone)
  function showMachine(smooth) {
    const sc = root && root.querySelector('.sh-scroll'), intro = root && root.querySelector('.sh-intro'), tabs = root && root.querySelector('.sh-tabs');
    if (!sc || !intro || !tabs || tab !== 'gumball') return;
    const top = Math.max(0, intro.offsetTop - tabs.offsetHeight - 2);
    if (Math.abs(sc.scrollTop - top) < 4) return;
    if (smooth && sc.scrollTo) sc.scrollTo({ top, behavior: 'smooth' }); else sc.scrollTop = top;
  }
  function buyGumball(tier) {
    if (gb.phase !== 'idle') return;
    const G = D.GUMBALL[tier]; if (!G) return;
    if (PS.S.coins < G.price) { PX.Sound.play('miss'); PS.ui.toast(`You need ${fmt(G.price - PS.S.coins)} more coins for a ${G.name.toLowerCase()}.`, 2800); return; }
    holdNews(true); // "New egg!" toasts wait for the reveal instead of spoiling the surprise
    const res = state.gumball(tier);
    if (!res || !res.ok) { holdNews(false); PX.Sound.play('miss'); PS.ui.toast('Not enough coins.'); return; }
    Object.assign(gb, { phase: 'crank', tier, res, frame: 0 });
    PX.buzz(10);
    refreshGumball();
    showMachine(true);
    CRANK.forEach((f, i) => setTimeout(() => {
      gb.frame = f;
      if (f === 3) { gb.phase = 'rolling'; PX.Sound.play('pop'); } else PX.Sound.play('tick');
      refreshGumball();
    }, CRANK_MS * (i + 1)));
    setTimeout(() => { if (gb.phase !== 'rolling') return; gb.phase = 'ready'; PX.Sound.play('thud'); PX.buzz(15); refreshGumball(); }, CRANK_MS * CRANK.length + ROLL_MS);
  }
  function openGumball() {
    if (gb.phase !== 'ready' || !gb.res) return;
    gb.phase = 'opening';
    PX.Sound.play('crack'); PX.buzz(25);
    const stage = root.querySelector('.sh-gb-stage'), ball = stage && stage.querySelector('.sh-gb-ball');
    refreshGumball();
    if (stage && ball) {
      const sr = stage.getBoundingClientRect(), br = ball.getBoundingClientRect();
      burst(stage, br.left - sr.left + br.width / 2, br.top - sr.top + br.height / 2, gb.tier === 'mega' ? 22 : 14, gb.tier === 'mega' ? 90 : 60);
    }
    setTimeout(showPrize, 420);
  }
  function prizeArt(r) {
    try {
      if (r.type === 'coins') return PX.item('bigcoin');
      if (r.type === 'fruit' || r.type === 'goldfruit') return PX.item('fruit', r.id);
      if (r.type === 'animal' || r.type === 'rare') return PX.critter(r.id);
      if (r.type === 'egg') return PX.item('egg', r.id);
      if (ART.kinds.includes(r.type)) return ART.item(r.type, r.id);
    } catch (e) { console.error(e); }
    return ART.item('gumball', r.color);
  }
  let held = false;
  function holdNews(on) { if (on === held || !PS.ui.hold) return; held = on; PS.ui.hold(on); }
  function showPrize() {
    holdNews(false);
    const r = gb.res; if (!r) { gb.phase = 'idle'; refreshGumball(); return; }
    gb.phase = 'shown';
    const jackpot = r.type === 'rare' || (r.type === 'egg' && (r.id === 'golden' || r.id === 'rainbow'));
    PX.Sound.play(jackpot ? 'evolve' : 'level');
    const partner = state.active();
    const buttons = [{ label: 'Yay!', kind: 'primary' }];
    if (r.type === 'paint' || r.type === 'pattern' || r.type === 'hat') {
      buttons.push({ label: partner ? `Style ${partner.name}` : 'Open Sprouts', onClick: () => PS.ui.go('sprouts', partner ? { id: partner.id, section: 'style' } : {}) });
    } else if (['egg', 'animal', 'rare', 'fruit', 'goldfruit'].includes(r.type)) {
      buttons.push({ label: 'Go to the Garden', onClick: () => {
        const egg = r.type === 'egg' ? PS.S.eggs.filter(e => e.kind === r.id).slice(-1)[0] : null;
        if (egg && D.AREAS[egg.area] && egg.area !== PS.S.area) { PS.S.area = egg.area; PS.emit('area', { area: egg.area }); PS.save(); }
        PS.ui.go('garden');
      } });
    }
    PS.ui.modal({
      eyebrow: jackpot ? 'Jackpot!' : gb.tier === 'mega' ? 'Mega gumball prize' : 'Gumball prize',
      title: esc(r.title), sprite: square(prizeArt(r)), html: `<p>${esc(r.text)}</p>`,
      buttons, mount: card => celebrate(card),
      onClose: () => { gb.phase = 'idle'; gb.res = null; gb.frame = 0; refreshGumball(); },
    });
  }

  // ---------- scene ----------
  let root, tab = 'rare', dirty = false, visible = false;
  function listHTML() {
    if (tab === 'rare') return `<div class="sh-list">${Object.keys(D.RARES).map(rareCard).join('')}</div>`;
    if (tab === 'egg') {
      const ids = D.SHOP_EGGS.filter(id => D.EGGS[id]), rare = ids.filter(id => !D.EGGS[id].spooky), spooky = ids.filter(id => D.EGGS[id].spooky);
      return `<div class="sh-list">${rare.map(eggCard).join('')}</div>` + (spooky.length ? `<h2 class="sh-sec px-title">Spooky eggs</h2><p class="sh-sec-sub">Halloween Sprouts! Pumpkins, ghosts, mummies and more.</p><div class="sh-list">${spooky.map(eggCard).join('')}</div>` : '');
    }
    if (tab === 'gumball') return gumballHTML();
    return `<div class="sh-list fruit">${Object.keys(D.FRUITS).map(fruitCard).join('')}</div>`;
  }
  function render() {
    dirty = false;
    const sc = root.querySelector('.sh-scroll'), keep = sc ? sc.scrollTop : 0;
    const T = TABS.find(x => x.id === tab);
    root.innerHTML = `<div class="sh-scroll"><div class="sh-wrap">
      <header class="panel sh-head">
        <canvas class="sh-logo" data-sh="icon:shop" data-scale="0"></canvas>
        <div><h1 class="px-title">Shop</h1><div class="sh-sub">Rare friends, eggs, snacks and gumballs</div></div>
        <div class="sh-wallet" title="Your coins">${coin()}<span class="num">${fmt(PS.S.coins)}</span></div>
        <div class="sh-earn"><canvas data-sh="icon:race" data-scale="0"></canvas><div><b>Earn coins</b> by racing and battling. Higher tiers pay much more. Coins also drop in the Garden.</div></div>
      </header>
      <div class="sh-tabs four" role="tablist">${TABS.map(x => `<button class="sh-tab" role="tab" data-tab="${x.id}" aria-selected="${x.id === tab}"><canvas data-tabicon="${x.id}"></canvas>${x.label}</button>`).join('')}</div>
      <p class="sh-intro">${T.intro}</p>
      ${listHTML()}
      <p class="sh-foot">${tab === 'gumball' ? 'Paint, stickers and hats go to your closet: use them on any Sprout\'s page in Sprouts. Eggs, animals and fruit go to the Garden.'
        : 'Everything you buy goes to the Garden. Rare creatures wait in your pouch, eggs sit in the grass, and fruit goes in your fruit basket.'}</p>
    </div></div>`;
    hydrate(root);
    root.querySelectorAll('canvas[data-tabicon]').forEach(cv => put(cv, TABS.find(x => x.id === cv.dataset.tabicon).icon()));
    drawMachine();
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
    burst(card, sp.offsetLeft + sp.offsetWidth / 2, sp.offsetTop + sp.offsetHeight / 2, 14, 70);
  }
  // n sparkles flying out from (cx, cy) inside a positioned box
  function burst(box, cx, cy, n, dist) {
    const cols = ['#fbf236', '#f7b6c8', '#9fd8ff', '#99e550', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = dist + Math.random() * 30, c = document.createElement('canvas');
      put(c, PX.fx(i % 3 ? 'spark' : 'bigspark', cols[i % cols.length]));
      c.className = 'px sh-spark';
      c.style.cssText = `left:${cx - 5}px;top:${cy - 5}px;z-index:3;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;animation-delay:${(i % 4) * 0.05}s`;
      box.appendChild(c);
      setTimeout(() => c.remove(), 1400);
    }
  }

  // ---------- wiring ----------
  function onClick(e) {
    const t = e.target.closest('[data-tab]');
    if (t) { if (t.dataset.tab !== tab) { tab = t.dataset.tab; PX.Sound.play('tick'); render(); root.querySelector('.sh-scroll').scrollTop = 0; showMachine(false); } return; }
    const b = e.target.closest('[data-buy]');
    if (b) { PX.Sound.play('pop'); const [k, id] = b.dataset.buy.split(':'); confirmBuy(k, id); return; }
    const g = e.target.closest('[data-gumball]');
    if (g) { if (!g.disabled) buyGumball(g.dataset.gumball); return; }
    if (e.target.closest('[data-gb-open]')) openGumball();
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
      const jump = params && params.tab && TABS.some(x => x.id === params.tab);
      if (jump) { tab = params.tab; dirty = true; }
      if (dirty) render();
      if (jump) { root.querySelector('.sh-scroll').scrollTop = 0; showMachine(false); }
    },
    hide() { visible = false; holdNews(false); },
    frame() {},
  };
})();
