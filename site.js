/* SUBNEX — общий код страниц сайта: согласие на cookie (Consent Mode v2), метки рекламы, конверсия заявки,
   текст «в какие дни мы собираем в вашем районе». Подключается после встроенного блока gtag в <head>.
   Google Ads: когда будет аккаунт, вписать ADS_ID ('AW-…') и ADS_LABEL (метка конверсии «Book a collection»). */
(function () {
  var ADS_ID = '';
  var ADS_LABEL = '';
  var KEY = 'subnex_consent';
  var GRANTED = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };

  window.dataLayer = window.dataLayer || [];
  var gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (ADS_ID) gtag('config', ADS_ID, { allow_enhanced_conversions: true });

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /* ── Баннер cookie: показывается, пока посетитель не выбрал. Выбор запоминается в браузере. ── */
  function banner() {
    if (stored()) return;
    var css = document.createElement('style');
    css.textContent =
      '.sx-cookie{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;' +
      'background:#1C1C30;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:14px 16px;' +
      'box-shadow:0 8px 40px rgba(0,0,0,.5);font:400 14px/1.5 Inter,Arial,sans-serif;color:#E8E8F0}' +
      '.sx-cookie p{margin:0 0 10px}.sx-cookie a{color:#2ECC71}' +
      '.sx-cookie .sx-b{display:flex;gap:8px;flex-wrap:wrap}' +
      '.sx-cookie button{flex:1 1 120px;border-radius:100px;padding:10px 16px;font:700 14px Poppins,Arial,sans-serif;cursor:pointer}' +
      '.sx-cookie .sx-ok{background:#2ECC71;color:#0A1A0D;border:0}' +
      '.sx-cookie .sx-no{background:transparent;color:#E8E8F0;border:1px solid rgba(255,255,255,.25)}' +
      '@media (min-width:960px){.sx-cookie{left:16px;right:auto;margin:0;max-width:420px}}';
    document.head.appendChild(css);
    var box = document.createElement('div');
    box.className = 'sx-cookie';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie choice');
    box.innerHTML = '<p>We use cookies to see how people find us and to measure our adverts. ' +
      'Nothing is shared for other purposes. <a href="/privacy/">Privacy</a></p>' +
      '<div class="sx-b"><button type="button" class="sx-ok">Accept</button>' +
      '<button type="button" class="sx-no">Reject</button></div>';
    document.body.appendChild(box);
    document.documentElement.classList.add('sx-cookie-open');
    function done(v) {
      store(v);
      if (v === 'granted') gtag('consent', 'update', GRANTED);
      box.remove();
      document.documentElement.classList.remove('sx-cookie-open');
    }
    box.querySelector('.sx-ok').onclick = function () { done('granted'); };
    box.querySelector('.sx-no').onclick = function () { done('denied'); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner();

  /* ── Метки рекламы из адреса страницы: уходят вместе с заявкой, в браузере не хранятся. ── */
  var ad = {};
  try {
    var q = new URLSearchParams(location.search);
    ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      var v = q.get(k);
      if (v) ad[k] = v.slice(0, 300);
    });
    ad.page = location.pathname;
    if (document.referrer) {
      var r = new URL(document.referrer);
      if (r.host !== location.host) ad.referrer = r.host;
    }
  } catch (e) {}

  var DAYS = { Monday: 'Mondays', Tuesday: 'Tuesdays', Wednesday: 'Wednesdays', Thursday: 'Thursdays',
               Friday: 'Fridays', Saturday: 'Saturdays', Sunday: 'Sundays' };
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  window.SubnexSite = {
    ad: function () { return ad; },
    /* Ответ subnex_area_check → короткий текст для посетителя (британский английский). */
    areaText: function (j) {
      if (!j || !j.valid) return null;
      if (j.served === false) return { ok: false, text: 'We are not collecting in ' + j.district + ' just yet. You can still send your request and we will be in touch as soon as we reach you.' };
      var d = (j.days || []);
      if (j.mode === 'monthly' && d.length)
        return { ok: true, text: 'We collect in ' + j.district + ' once a month, on the ' + (j.week_of_month === 5 ? 'last ' : '') + d[0] + '. We will email you the exact date.' };
      if (d.length)
        return { ok: true, text: 'We collect in ' + j.district + ' on ' + list(d.map(function (x) { return DAYS[x] || x; })) + '. We will email you the exact date.' };
      return { ok: true, text: 'We collect in ' + j.district + '. We will email you the exact date.' };
    },
    /* Заявка принята: событие для Google Analytics и (когда будет аккаунт) конверсия Google Ads. */
    lead: function (email, phone) {
      try {
        gtag('event', 'generate_lead', { page: location.pathname });
        if (ADS_ID && ADS_LABEL) {
          var u = {};
          if (email) u.email = email;
          if (phone && /^\+?\d{10,15}$/.test(phone.replace(/[\s()-]/g, ''))) {
            var p = phone.replace(/[\s()-]/g, '');
            u.phone_number = p.charAt(0) === '+' ? p : '+44' + p.replace(/^0/, '');
          }
          gtag('set', 'user_data', u);
          gtag('event', 'conversion', { send_to: ADS_ID + '/' + ADS_LABEL });
        }
      } catch (e) {}
    }
  };
})();
