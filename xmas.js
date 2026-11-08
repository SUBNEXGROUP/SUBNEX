/* SUBNEX — новогоднее оформление: снег, гирлянда, иней на кнопках, праздничная плашка.
   Работает только с START по END (включительно), потом само ничего не делает.
   Как убрать полностью: удалить строку <script src="/xmas.js..."> из index.html, collect/index.html, privacy/index.html
   (или откатить коммит — см. тег pre-xmas-2026 в git).
   Проверка: ?xmas=1 — включить вне дат, ?xmas=0 — выключить для себя. */
(function () {
  'use strict';

  var START = new Date(2026, 10, 8);   // 8 ноября 2026
  var END   = new Date(2027, 0, 8);    // до конца 7 января 2027
  var BANNER_TEXT = 'Merry Christmas &amp; a Happy New Year from the SUBNEX team';
  var BANNER_SHORT = 'Merry Christmas from SUBNEX';   // на телефоне, в одну строку

  var q = new URLSearchParams(location.search).get('xmas');
  var now = new Date();
  if (q === '0') return;
  if (q !== '1' && (now < START || now >= END)) return;

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia && matchMedia('(max-width: 760px)').matches;

  /* ───────── Стили ───────── */
  var css = [
    ':root{--xm-red:#E5484D;--xm-gold:#F5C451;--xm-snow:#F4F7FF;}',

    /* снег */
    '#xmas-snow{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:997;}',

    /* гирлянда */
    '.xmas-garland{position:absolute;left:0;right:0;top:100%;height:26px;pointer-events:none;overflow:hidden;z-index:1;}',
    '.xmas-garland.is-page{position:absolute;top:0;z-index:996;}',
    '.xmas-garland svg{position:absolute;top:0;left:0;width:100%;height:12px;}',
    '.xmas-garland ul{list-style:none;margin:0;padding:0;position:absolute;inset:0;}',
    '.xmas-garland li{position:absolute;top:0;width:9px;margin-left:-4.5px;height:14px;margin-top:5px;border-radius:50% 50% 50% 50%/40% 40% 60% 60%;',
      'background:var(--c);box-shadow:0 0 10px 2px var(--c);animation:xm-blink 2.4s ease-in-out infinite;animation-delay:var(--d);}',
    '.xmas-garland li::before{content:"";position:absolute;top:-4px;left:2px;width:5px;height:4px;border-radius:2px;background:#3A3A55;}',
    '@keyframes xm-blink{0%,100%{opacity:1;box-shadow:0 0 12px 3px var(--c);}50%{opacity:.35;box-shadow:0 0 2px 0 var(--c);}}',

    /* иней / снежная шапка на кнопках */
    '.xm-frost{position:relative;}',
    '.xm-frost::before{content:"";position:absolute;left:22px;right:22px;top:-7px;height:13px;pointer-events:none;z-index:2;',
      'border-radius:0 0 8px 8px;',
      'background:',
        'linear-gradient(var(--xm-snow),var(--xm-snow)) 0 100%/100% 6px no-repeat,',
        'radial-gradient(10px 9px at 6% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(14px 12px at 20% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(11px 9px at 35% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(16px 13px at 52% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(12px 10px at 69% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(14px 11px at 84% 100%,var(--xm-snow) 98%,transparent),',
        'radial-gradient(10px 8px at 96% 100%,var(--xm-snow) 98%,transparent);',
      'filter:drop-shadow(0 2px 2px rgba(0,0,0,.22));}',
    '.xm-frost::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
      'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35),inset 0 6px 12px -6px rgba(255,255,255,.55);}',

    /* праздничная плашка */
    '.xmas-banner{display:inline-flex;align-items:center;gap:.6rem;margin:0 0 1rem;padding:.5rem 1.1rem;border-radius:100px;',
      'font:600 .82rem/1.3 Poppins,Outfit,sans-serif;color:#fff;letter-spacing:.01em;',
      'background:linear-gradient(90deg,rgba(229,72,77,.24),rgba(245,196,81,.18)),rgba(18,18,31,.82);',
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
      'border:1px solid rgba(245,196,81,.45);box-shadow:0 0 24px rgba(229,72,77,.18);position:relative;z-index:2;}',
    '.xmas-banner .xm-star{color:var(--xm-gold);font-size:1rem;line-height:1;animation:xm-twinkle 2.6s ease-in-out infinite;}',
    '@keyframes xm-twinkle{0%,100%{opacity:1;transform:scale(1) rotate(0)}50%{opacity:.6;transform:scale(.85) rotate(20deg)}}',
    '.xmas-banner .xm-short{display:none;}',
    '.hero-copy .xmas-banner{margin-top:22px;}',
    '@media (max-width:760px){.xmas-banner{font-size:.78rem;padding:.45rem 1rem;gap:.55rem;white-space:nowrap;}',
      '.xmas-banner .xm-long{display:none;}.xmas-banner .xm-short{display:inline;}}',

    /* шапка на логотипе */
    '.xm-hat-host{position:relative !important;}',
    '.xm-hat{position:absolute;pointer-events:none;z-index:3;transform-origin:30% 90%;transform:rotate(-22deg);',
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));animation:xm-hat 4s ease-in-out infinite;}',
    '@keyframes xm-hat{0%,100%{transform:rotate(-22deg)}50%{transform:rotate(-16deg)}}',
    '@media (prefers-reduced-motion:reduce){.xm-hat{animation:none;}}',

    '@media (prefers-reduced-motion:reduce){.xmas-garland li,.xmas-banner .xm-star{animation:none;}}'
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

  /* ───────── Гирлянда ───────── */
  function garland() {
    var nav = document.getElementById('navbar') || document.querySelector('header.top');
    var g = document.createElement('div');
    g.className = 'xmas-garland' + (nav ? '' : ' is-page');
    g.setAttribute('aria-hidden', 'true');

    var colors = ['#E5484D', '#F5C451', '#2ECC71', '#4FC3F7', '#F5C451'];
    var n = Math.max(8, Math.min(38, Math.round(window.innerWidth / 42)));
    if (n % 2) n++;   // чётное число — рисунок симметричен относительно центра
    var html = '<svg viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M0 2 ';
    for (var i = 0; i < n; i++) {
      var x1 = (i + .5) / n * 100, x2 = (i + 1) / n * 100;
      html += 'Q' + x1.toFixed(2) + ' 10 ' + x2.toFixed(2) + ' 2 ';
    }
    html += '" fill="none" stroke="#3A3A55" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg><ul>';
    for (var j = 0; j < n; j++) {
      html += '<li style="left:' + ((j + .5) / n * 100).toFixed(3) + '%;--c:' + colors[j % colors.length] + ';--d:' + (-(j * 0.37) % 2.4).toFixed(2) + 's"></li>';
    }
    g.innerHTML = html + '</ul>';

    if (nav) {
      if (getComputedStyle(nav).position === 'static') nav.style.position = 'relative';
      nav.appendChild(g);
    } else {
      document.body.style.position = document.body.style.position || 'relative';
      document.body.appendChild(g);
    }
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
        '<path d="M8 42 C10 22 22 6 40 6 C50 6 56 12 58 22 C52 16 46 15 42 18 C40 26 44 34 50 42 Z" fill="#E5484D"/>' +
        '<path d="M8 42 C10 22 22 6 40 6 C44 6 47 7 49 9 C34 10 22 22 20 42 Z" fill="#FF6B6F" opacity=".55"/>' +
        '<rect x="3" y="38" width="52" height="13" rx="6.5" fill="#F4F7FF"/>' +
        '<rect x="3" y="38" width="52" height="5" rx="2.5" fill="#FFFFFF"/>' +
        '<circle cx="58" cy="24" r="6.5" fill="#F4F7FF"/>' +
        '<circle cx="56.5" cy="22.5" r="2.4" fill="#FFFFFF"/>' +
      '</svg>';
    host.appendChild(h);
  }

  /* ───────── Иней на главных кнопках ───────── */
  function frost() {
    var els = document.querySelectorAll('.btn-green, .form-submit, .go, .cta2 a');
    for (var i = 0; i < els.length; i++) els[i].classList.add('xm-frost');
  }

  /* ───────── Праздничная плашка в первом экране ───────── */
  function banner() {
    var spot = document.querySelector('.hero-inner .hero-tag') || document.querySelector('.hero-copy .eyebrow');
    if (!spot) return;
    var b = document.createElement('div');
    b.className = 'xmas-banner';
    b.innerHTML = '<span class="xm-star" aria-hidden="true">✦</span><span class="xm-long">' + BANNER_TEXT + '</span><span class="xm-short">' + BANNER_SHORT + '</span><span class="xm-star" aria-hidden="true">✦</span>';
    spot.parentNode.insertBefore(b, spot);
    b.style.display = 'flex'; b.style.width = 'fit-content';
  }

  /* ───────── Снег ───────── */
  function snow() {
    var cv = document.createElement('canvas');
    cv.id = 'xmas-snow';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, flakes = [];
    var COUNT = reduced ? 40 : (mobile ? 70 : 150);
    var speedK = reduced ? 0.35 : 1;

    function size() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function flake(top) {
      var r = Math.random() * 2.4 + 0.8;
      return {
        x: Math.random() * W,
        y: top ? -10 : Math.random() * H,
        r: r,
        vy: (0.35 + r * 0.32 + Math.random() * 0.3) * speedK,
        sway: Math.random() * Math.PI * 2,
        swayV: 0.006 + Math.random() * 0.012,
        swayA: 0.3 + Math.random() * 0.7,
        a: 0.45 + Math.random() * 0.5
      };
    }
    size();
    for (var i = 0; i < COUNT; i++) flakes.push(flake(false));

    var wind = 0, windT = 0, running = true, last = 0;
    function frame(t) {
      if (!running) return;
      var dt = last ? Math.min((t - last) / 16.67, 3) : 1;
      last = t;
      windT += 0.002 * dt;
      wind = Math.sin(windT) * 0.35;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#F4F7FF';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.sway += f.swayV * dt;
        f.y += f.vy * dt;
        f.x += (Math.sin(f.sway) * f.swayA + wind) * dt;
        if (f.y - f.r > H) flakes[i] = f = flake(true);
        if (f.x > W + 5) f.x = -5; else if (f.x < -5) f.x = W + 5;
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
    });
  }
})();
