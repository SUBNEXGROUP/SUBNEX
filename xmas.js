/* SUBNEX — новогоднее оформление, версия «белое и серебро» (09.11.2026).
   Снег с глубиной, тонкая гирлянда из маленьких белых огоньков, шапка на логотипе,
   снежная кромка на главных кнопках, стеклянная плашка с поздравлением.
   Работает только с START по END (включительно), потом само ничего не делает.
   Как убрать полностью: удалить строку <script src="/xmas.js..."> из index.html, collect/index.html, privacy/index.html
   (или откатить коммит — см. тег pre-xmas-2026 в git).
   Проверка: ?xmas=1 — включить вне дат, ?xmas=0 — выключить для себя. */
(function () {
  'use strict';

  var START = new Date(2026, 10, 8);   // 8 ноября 2026
  var END   = new Date(2027, 0, 8);    // до конца 7 января 2027
  /* <br class="xm-br"> — перенос строки только на телефоне, чтобы текст шёл ровно в две строки по центру */
  var BANNER_TEXT = 'Merry Christmas &amp; a Happy New Year<br class="xm-br"> from the SUBNEX team';

  var q = new URLSearchParams(location.search).get('xmas');
  var now = new Date();
  if (q === '0') return;
  if (q !== '1' && (now < START || now >= END)) return;

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia && matchMedia('(max-width: 760px)').matches;

  /* ───────── Стили ───────── */
  /* Снежная кромка кнопки: мягкий сугроб, толще слева, сходит на нет к краям. */
  var DRIFT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23FFFFFF'/%3E%3Cstop offset='1' stop-color='%23D9E1EC'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill='url(%23g)' d='M0 7.4C8 3.2 26 1.6 52 2.4 76 3.1 96 .7 124 1.6c26 .8 60 1.2 76 5.8-9 2.6-24 1.6-38 2.6-16 1.1-34 1.9-56 .5-20-1.3-44 .9-66-.5C26 9.2 9 9.6 0 7.4Z'/%3E%3C/svg%3E\")";

  var css = [
    ':root{--xm-snow:#F5F7FA;--xm-silver:#C9D1DC;--xm-ice:190,215,255;}',

    /* снег: гуще вверху экрана, к низу тает — читать и заполнять форму не мешает */
    '#xmas-snow{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:997;',
      '-webkit-mask-image:linear-gradient(to bottom,#000 0,#000 32%,rgba(0,0,0,.42) 100%);',
      'mask-image:linear-gradient(to bottom,#000 0,#000 32%,rgba(0,0,0,.42) 100%);}',

    /* гирлянда */
    '.xmas-garland{position:absolute;left:0;right:0;top:100%;height:34px;pointer-events:none;overflow:hidden;z-index:1;}',
    '.xmas-garland.is-page{top:0;z-index:996;}',
    '.xmas-garland svg{display:block;position:absolute;top:0;left:0;overflow:visible;}',
    '.xmas-garland .xm-wire{fill:none;stroke:rgba(201,209,220,.3);stroke-width:1;}',
    '.xmas-garland .xm-l{opacity:0;animation:xm-on .7s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:var(--o);}',
    '.xmas-garland .xm-glow{animation:xm-tw var(--t) ease-in-out var(--d) infinite;transform-origin:center;transform-box:fill-box;}',
    '@keyframes xm-on{from{opacity:0}to{opacity:1}}',
    '@keyframes xm-tw{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.28;transform:scale(.72)}}',

    /* снежная кромка и холодный блик на кнопках */
    '.xm-frost{position:relative;}',
    '.xm-frost::before{content:"";position:absolute;left:16px;right:16px;top:-6px;height:11px;pointer-events:none;z-index:2;',
      'background:' + DRIFT + ' center/100% 100% no-repeat;filter:drop-shadow(0 1.5px 1.5px rgba(8,20,14,.28));}',
    '.xm-frost::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 10px 14px -10px rgba(255,255,255,.5);}',

    /* стеклянная плашка */
    '.xmas-banner{display:flex;width:fit-content;align-items:center;gap:.6rem;margin:0 0 1rem;padding:.5rem 1.05rem .5rem .8rem;',
      'border-radius:100px;position:relative;z-index:2;overflow:hidden;',
      'font:500 .84rem/1.3 Poppins,Outfit,system-ui,sans-serif;color:var(--xm-snow);letter-spacing:.005em;',
      'background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.05));',
      '-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);',
      'border:1px solid rgba(255,255,255,.17);',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 10px 30px rgba(0,0,0,.3);',
      'animation:xm-in .8s cubic-bezier(.2,.7,.2,1) .05s both;}',
    '.xmas-banner svg{flex:none;width:15px;height:15px;stroke:var(--xm-silver);}',
    /* один проход блика при загрузке — и всё, дальше плашка спокойная */
    '.xmas-banner::after{content:"";position:absolute;top:0;bottom:0;left:0;width:38%;pointer-events:none;',
      'background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);',
      'transform:translateX(-130%);animation:xm-sheen 1.5s ease-out 1.1s 1 both;}',
    '@keyframes xm-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '@keyframes xm-sheen{from{transform:translateX(-130%)}to{transform:translateX(330%)}}',
    '.xmas-banner .xm-br{display:none;}',
    '.hero-copy .xmas-banner{margin-top:22px;}',
    '@media (max-width:760px){.xmas-banner{font-size:.8rem;line-height:1.4;padding:.55rem 1.1rem .55rem .9rem;gap:.7rem;border-radius:20px;',
      'margin-left:auto;margin-right:auto;text-align:center;}',
      '.xmas-banner .xm-br{display:inline;}.xmas-banner .xm-text{white-space:nowrap;}}',
    '@media (max-width:400px){.xmas-banner{font-size:.72rem;padding:.5rem .85rem .5rem .7rem;gap:.5rem;}}',

    /* шапка на логотипе: один раз «садится» при загрузке и дальше не качается */
    '.xm-hat-host{position:relative !important;}',
    '.xm-hat{position:absolute;pointer-events:none;z-index:3;transform-origin:30% 90%;transform:rotate(-22deg);',
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));animation:xm-hat .9s cubic-bezier(.3,1.5,.5,1) .35s both;}',
    '@keyframes xm-hat{from{opacity:0;transform:translateY(-9px) rotate(-38deg)}to{opacity:1;transform:rotate(-22deg)}}',

    '@media (prefers-reduced-motion:reduce){.xmas-garland .xm-l{animation:none;opacity:1;}.xmas-garland .xm-glow{animation:none;}',
      '.xmas-banner,.xmas-banner::after,.xm-hat{animation:none;}}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'xmas-style';
  style.textContent = css;
  document.head.appendChild(style);

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    document.documentElement.classList.add('xmas');
    garland();
    frost();
    hat();
    banner();
    snow();
  });

  /* ───────── Гирлянда ─────────
     Тонкая нить провисает дугами, на ней маленькие белые огоньки (каждый третий — чуть теплее).
     При загрузке огоньки зажигаются слева направо, потом медленно мерцают вразнобой. */
  function garland() {
    var nav = document.getElementById('navbar') || document.querySelector('header.top');
    var g = document.createElement('div');
    g.className = 'xmas-garland' + (nav ? '' : ' is-page');
    g.setAttribute('aria-hidden', 'true');
    var host = nav || document.body;
    if (nav) { if (getComputedStyle(nav).position === 'static') nav.style.position = 'relative'; }
    else document.body.style.position = document.body.style.position || 'relative';
    host.appendChild(g);

    var first = true, lastW = 0;
    function build() {
      var W = Math.round(g.getBoundingClientRect().width || window.innerWidth);
      if (!W || W === lastW) return;
      lastW = W;
      var small = W <= 760;
      var swags = Math.max(3, Math.round(W / (small ? 96 : 150)));
      var sw = W / swags, sag = small ? 9 : 12, y0 = 2;
      var ts = small ? [0.2, 0.5, 0.8] : [0.14, 0.38, 0.62, 0.86];
      var path = 'M0 ' + y0, lights = '', k = 0, total = swags * ts.length;
      for (var i = 0; i < swags; i++) {
        path += ' Q' + ((i + .5) * sw).toFixed(1) + ' ' + (y0 + 2 * sag) + ' ' + ((i + 1) * sw).toFixed(1) + ' ' + y0;
        for (var j = 0; j < ts.length; j++, k++) {
          var t = ts[j], x = (i + t) * sw, y = y0 + 4 * sag * t * (1 - t) + 2.6;
          var warm = k % 3 === 1;
          /* псевдослучайные, но постоянные период и сдвиг мерцания — без Math.random, чтобы при повороте экрана рисунок не прыгал */
          var dur = 3.4 + ((k * 37) % 23) / 8, del = -(((k * 53) % 41) / 7);
          lights += '<g class="xm-l" style="--o:' + (first ? (0.25 + k / total * 1.1).toFixed(2) : 0) + 's">' +
            '<g class="xm-glow" style="--t:' + dur.toFixed(2) + 's;--d:' + del.toFixed(2) + 's">' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9.5" fill="url(#' + (warm ? 'xmw' : 'xmc') + ')"/></g>' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.2" fill="' + (warm ? '#FFF6E4' : '#FFFFFF') + '"/></g>';
        }
      }
      g.innerHTML = '<svg width="' + W + '" height="34" viewBox="0 0 ' + W + ' 34"><defs>' +
        '<radialGradient id="xmc"><stop offset="0" stop-color="rgb(214,230,255)" stop-opacity=".95"/><stop offset=".35" stop-color="rgb(190,215,255)" stop-opacity=".5"/><stop offset="1" stop-color="rgb(190,215,255)" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="xmw"><stop offset="0" stop-color="rgb(255,238,206)" stop-opacity=".95"/><stop offset=".35" stop-color="rgb(255,226,170)" stop-opacity=".48"/><stop offset="1" stop-color="rgb(255,226,170)" stop-opacity="0"/></radialGradient>' +
        '</defs><path class="xm-wire" d="' + path + '"/>' + lights + '</svg>';
      first = false;
    }
    build();
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 180); });
  }

  /* ───────── Шапка Деда Мороза на логотипе ───────── */
  function hat() {
    var img = document.querySelector('.nav-logo img') || document.querySelector('.brand img');
    if (!img) return;
    var host = img.parentNode;
    host.classList.add('xm-hat-host');
    var s = img.getBoundingClientRect().width || img.width || 40;
    var hr = host.getBoundingClientRect(), ir = img.getBoundingClientRect();
    var w = Math.round(s * (mobile ? 0.66 : 0.74));
    var h = document.createElement('span');
    h.className = 'xm-hat';
    h.setAttribute('aria-hidden', 'true');
    h.style.width = w + 'px';
    h.style.left = Math.round(ir.left - hr.left + s * 0.06) + 'px';
    var top = ir.top - s * 0.34;
    if (top < 4) top = 4;   // не упираться в верх экрана
    h.style.top = Math.round(top - hr.top) + 'px';
    h.innerHTML =
      '<svg viewBox="0 0 64 56" width="100%" style="display:block;overflow:visible">' +
        '<defs>' +
          '<linearGradient id="xmh1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0626A"/><stop offset=".55" stop-color="#D93A45"/><stop offset="1" stop-color="#B3262F"/></linearGradient>' +
          '<linearGradient id="xmh2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE3EE"/></linearGradient>' +
          '<radialGradient id="xmh3" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DDE9"/></radialGradient>' +
        '</defs>' +
        '<path d="M8 42 C10 22 22 6 40 6 C50 6 56 12 58 22 C52 16 46 15 42 18 C40 26 44 34 50 42 Z" fill="url(#xmh1)"/>' +
        '<path d="M11 40 C13 23 24 9.5 39 8.6 C28 13 20 25 18.5 40 Z" fill="#FFFFFF" opacity=".2"/>' +
        '<rect x="3" y="38" width="52" height="13" rx="6.5" fill="url(#xmh2)"/>' +
        '<circle cx="58" cy="24" r="6.5" fill="url(#xmh3)"/>' +
      '</svg>';
    host.appendChild(h);
  }

  /* ───────── Снежная кромка на главных кнопках ───────── */
  function frost() {
    var els = document.querySelectorAll('.btn-green, .form-submit, .go, .cta2 a');
    for (var i = 0; i < els.length; i++) els[i].classList.add('xm-frost');
  }

  /* ───────── Стеклянная плашка в первом экране ───────── */
  function banner() {
    var spot = document.querySelector('.hero-inner .hero-tag') || document.querySelector('.hero-copy .eyebrow');
    if (!spot) return;
    var b = document.createElement('div');
    b.className = 'xmas-banner';
    b.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7"/>' +
        '<path d="M9.5 4 12 6.2 14.5 4M9.5 20l2.5-2.2 2.5 2.2M4.2 10.4l3.1-.9-.8-3.2M19.8 13.6l-3.1.9.8 3.2M4.2 13.6l3.1.9-.8 3.2M19.8 10.4l-3.1-.9.8-3.2"/>' +
      '</svg><span class="xm-text">' + BANNER_TEXT + '</span>';
    spot.parentNode.insertBefore(b, spot);
  }

  /* ───────── Снег ─────────
     Три слоя глубины: дальний (мелкий, медленный), средний и ближний (крупные размытые хлопья, их мало).
     Над формой заказа снег не рисуется — чтобы хлопья не ложились на поля ввода. */
  function snow() {
    var cv = document.createElement('canvas');
    cv.id = 'xmas-snow';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, flakes = [];

    /* заготовки: чёткая снежинка и размытое пятно, рисуются один раз */
    function sprite(soft) {
      var c = document.createElement('canvas'), S = 64;
      c.width = c.height = S;
      var x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      if (soft) { g.addColorStop(0, 'rgba(240,246,255,.85)'); g.addColorStop(.45, 'rgba(232,240,255,.4)'); g.addColorStop(1, 'rgba(232,240,255,0)'); }
      else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(250,252,255,.95)'); g.addColorStop(1, 'rgba(245,247,250,0)'); }
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      return c;
    }
    var SHARP = sprite(false), SOFT = sprite(true);

    /* [слой, сколько на компьютере, сколько на телефоне] */
    var LAYERS = [
      { n: mobile ? 38 : 84, r: [0.9, 1.6], a: [0.4, 0.65],  v: [0.22, 0.42], soft: false },
      { n: mobile ? 22 : 48, r: [1.7, 3.0], a: [0.6, 0.95],  v: [0.45, 0.8],  soft: false },
      { n: mobile ? 6  : 12, r: [5, 10],    a: [0.12, 0.24],  v: [0.9, 1.35],  soft: true  }
    ];
    function rnd(p) { return p[0] + Math.random() * (p[1] - p[0]); }
    function flake(L, top) {
      var r = rnd(L.r);
      return { L: L, x: Math.random() * W, y: top ? -r * 2 - Math.random() * 40 : Math.random() * H, r: r, vy: rnd(L.v),
        sway: Math.random() * Math.PI * 2, swayV: 0.004 + Math.random() * 0.01, swayA: 0.15 + Math.random() * 0.5, a: rnd(L.a) };
    }
    function size() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    for (var l = 0; l < LAYERS.length; l++) for (var i = 0; i < LAYERS[l].n; i++) flakes.push(flake(LAYERS[l], false));

    /* тихие зоны: карточки с формой */
    var quiet = [], qTick = 0;
    function zones() {
      quiet = [];
      var els = document.querySelectorAll('.form-card, #book');
      for (var i = 0; i < els.length; i++) {
        var b = els[i].getBoundingClientRect();
        if (b.bottom > 0 && b.top < H && b.width > 0) quiet.push(b);
      }
    }
    function calm(x, y) {   // 0 — внутри формы, 1 — далеко от неё, плавно на 26px у края
      var k = 1;
      for (var i = 0; i < quiet.length; i++) {
        var b = quiet[i], dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 26) k = Math.min(k, d / 26);
      }
      return k;
    }

    var windT = Math.random() * 10, running = true, last = 0;
    function draw(dt) {
      windT += 0.0016 * dt;
      var wind = Math.sin(windT) * 0.28;
      if (qTick-- <= 0) { zones(); qTick = 12; }
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.sway += f.swayV * dt;
        f.y += f.vy * dt;
        f.x += (Math.sin(f.sway) * f.swayA + wind * (0.4 + f.vy)) * dt;
        if (f.y - f.r * 2 > H) flakes[i] = f = flake(f.L, true);
        if (f.x > W + 12) f.x = -12; else if (f.x < -12) f.x = W + 12;
        var a = f.a * (quiet.length ? calm(f.x, f.y) : 1);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        var d = f.r * (f.L.soft ? 2.6 : 2.4);
        ctx.drawImage(f.L.soft ? SOFT : SHARP, f.x - d / 2, f.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    }
    function frame(t) {
      if (!running) return;
      var dt = last ? Math.min((t - last) / 16.67, 3) : 1;
      last = t;
      draw(dt);
      requestAnimationFrame(frame);
    }
    if (reduced) {
      /* просьба «меньше движения»: неподвижный лёгкий снег, перерисовывается только при прокрутке и повороте */
      draw(0);
      var st;
      window.addEventListener('scroll', function () { clearTimeout(st); st = setTimeout(function () { qTick = 0; draw(0); }, 120); }, { passive: true });
    } else {
      requestAnimationFrame(frame);
    }

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); qTick = 0; if (reduced) draw(0); }, 150); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else if (!running) { running = true; last = 0; if (!reduced) requestAnimationFrame(frame); }
    });
  }
})();
