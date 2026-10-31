/* SUBNEX — общий код страниц сайта: согласие на cookie (Consent Mode v2), метки рекламы, конверсия заявки,
   текст «в какие дни мы собираем в вашем районе». Подключается после встроенного блока gtag в <head>.
   Google Ads: аккаунт 270-513-0393, конверсия «Book a collection» (ADS_ID / ADS_LABEL ниже). */
(function () {
  var ADS_ID = 'AW-18364438238';
  var ADS_LABEL = 'pSLACN_C3JQdEN6t7LRE';
  var KEY = 'subnex_consent';
  var GRANTED = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };
  /* ChatGPT Ads (OpenAI) — Pixel ID из Ads Manager → Conversions. Пусто = Pixel не грузится вообще.
     Скрипт OpenAI грузится ТОЛЬКО после «Accept» в баннере cookie. Событие — lead_created, только для новой
     заявки в обслуживаемом районе (сервер отдаёт new:true + lead_event_id). Тот же id уходит с сервера
     (Conversions API, миграция 100) — OpenAI оставляет одно событие. */
  var OAI_PIXEL_ID = 'Y5LYCUtwkb364pVTgAgeaQ';   // источник «SUBNEX Website» (Ads Manager → Conversions). Больше нигде на сайте.
  var OAI_SENT = 'subnex_oai_sent';   // id, уже отправленные Pixel'ем из этого браузера
  var OAI_IDS = 'subnex_oai_ids';     // id всех новых заявок из этого браузера — для отзыва согласия
  var API = 'https://hgnihlkiccfbrejbpojp.supabase.co/rest/v1/rpc/';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbmlobGtpY2NmYnJlamJwb2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTU2MDMsImV4cCI6MjA5OTI3MTYwM30.AqPTMYqWt_Kc1IZX5pkB9MvrGL1IXr_PAVlH9I0g3ZQ';

  window.dataLayer = window.dataLayer || [];
  var gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (ADS_ID) gtag('config', ADS_ID, { allow_enhanced_conversions: true });

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }

  /* ── OpenAI Pixel: официальный загрузчик, только при согласии. ── */
  function loadOai() {
    if (!OAI_PIXEL_ID || stored() !== 'granted' || window.oaiq) return;
    (function (w, d, s, u) {
      if (w.oaiq) return;
      var q = function () { q.q.push(arguments); };
      q.q = [];
      w.oaiq = q;
      var js = d.createElement(s);
      js.async = true;
      js.src = u;
      var f = d.getElementsByTagName(s)[0];
      f.parentNode.insertBefore(js, f);
    })(window, document, 'script', 'https://bzrcdn.openai.com/sdk/oaiq.min.js');
    window.oaiq('init', { pixelId: OAI_PIXEL_ID, debug: /[?&]oai_debug=1/.test(location.search) });
    // Pixel хранит свой отказ (cookie __oaiq_consent) после отзыва; без этого вызова новое «Accept» его не снимает.
    window.oaiq('consent', true);
  }
  loadOai();
  function sha(s) {
    if (!s || !window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return null; });
  }
  function oaiPhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (/^00/.test(d)) d = d.slice(2); else if (/^0/.test(d)) d = '44' + d.slice(1);
    d = d.replace(/^0+/, '');
    return d.length >= 8 && d.length <= 15 ? d : '';
  }
  function readIds(k) { try { var a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function sentIds() { return readIds(OAI_SENT); }
  function remember(k, id) { var a = readIds(k); if (a.indexOf(id) < 0) a.push(id); try { localStorage.setItem(k, JSON.stringify(a.slice(-20))); } catch (e) {} }

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
    box.innerHTML = '<p>We use cookies to see how people find us and to measure our adverts with Google and OpenAI. ' +
      'If you accept and book, hashed contact details and your postcode are shared with them for this. ' +
      '<a href="/privacy/">Privacy</a></p>' +
      '<div class="sx-b"><button type="button" class="sx-ok">Accept</button>' +
      '<button type="button" class="sx-no">Reject</button></div>';
    document.body.appendChild(box);
    document.documentElement.classList.add('sx-cookie-open');
    function done(v) {
      store(v);
      if (v === 'granted') { gtag('consent', 'update', GRANTED); loadOai(); }
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
    /* oppref (клик из ChatGPT Ads) передаётся без изменений; слишком длинный не обрезаем, а не берём. */
    var opp = q.get('oppref');
    if (opp && opp.length <= 300) ad.oppref = opp;
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
    ad: function () {
      /* Нет oppref в адресе, но Pixel сохранил его при прошлом заходе (cookie есть только при согласии). */
      if (!ad.oppref && stored() === 'granted') { var c = cookie('__oppref'); if (c && c.length <= 300) ad.oppref = c; }
      return ad;
    },
    /* Согласие и браузерная ссылка OpenAI — сервер шлёт Conversions API только при consent = granted. */
    oai: function () {
      var g = stored() === 'granted';
      return { consent: stored() || 'unset', obref: g ? cookie('__obref') || null : null };
    },
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
    /* Заявка принята: событие для Google Analytics и конверсия Google Ads (без изменений),
       плюс ChatGPT Ads lead_created — только если сервер подтвердил НОВУЮ заявку (res.new === true). */
    lead: function (email, phone, res) {
      try { this.oaiLead(email, phone, res); } catch (e) {}
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
    },
    oaiLead: function (email, phone, res) {
      var id = res && res.new === true && typeof res.lead_event_id === 'string' ? res.lead_event_id : '';
      if (!id || stored() !== 'granted') return false;
      remember(OAI_IDS, id);                               // сервер мог поставить событие в очередь — помним для отзыва
      if (!OAI_PIXEL_ID) return false;
      if (sentIds().indexOf(id) >= 0) return false;        // уже отправляли этот id в этом браузере
      remember(OAI_SENT, id);
      loadOai();
      Promise.all([sha(String(email || '').trim().toLowerCase()), sha(oaiPhone(phone))]).then(function (h) {
        var user = { country: 'GB' };
        if (h[0]) user.email_sha256 = h[0];
        if (h[1]) user.phone_number_sha256 = h[1];
        if (stored() !== 'granted') return;                 // согласие отозвали, пока считался хэш
        window.oaiq('init', { pixelId: OAI_PIXEL_ID, user: user });
        window.oaiq('measure', 'lead_created', { type: 'customer_action' }, { event_id: id });
      });
      return true;
    },
    /* Отзыв согласия (/privacy/ → «Change your cookie choice»): Pixel выключается и стирает свои cookie,
       сервер снимает ещё не отправленные события этих заявок. Уже переданное в OpenAI отозвать нельзя. */
    revokeOai: function () {
      try { if (window.oaiq) window.oaiq('consent', false); } catch (e) {}
      ['__oppref', '__obref'].forEach(function (n) {
        ['', '; domain=.' + location.hostname.replace(/^www\./, ''), '; domain=' + location.hostname].forEach(function (d) {
          document.cookie = n + '=; Max-Age=0; path=/' + d;
        });
      });
      var ids = readIds(OAI_IDS);
      try { localStorage.removeItem(OAI_IDS); } catch (e) {}
      if (!ids.length || !window.fetch) return Promise.resolve({ dropped: 0 });
      return Promise.race([
        fetch(API + 'subnex_oai_revoke', { method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
          body: JSON.stringify({ p_ids: ids }) }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
        new Promise(function (res) { setTimeout(function () { res(null); }, 3000); })
      ]);
    }
  };
})();
