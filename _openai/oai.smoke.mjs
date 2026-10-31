// Browser checks for ChatGPT Ads lead_created on subnex.co.uk (collect page + main page).
// Everything external is mocked: Supabase RPC, postcodes.io, Web3Forms, Google tag, OpenAI Pixel script.
// Run: node oai.smoke.mjs <site-dir>
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.argv[2];
const PIXEL = 'TEST_PIXEL_LOCAL';
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (p === '/site.js') body = Buffer.from(body.toString().replace(/var OAI_PIXEL_ID = '[^']*';/, `var OAI_PIXEL_ID = '${PIXEL}';`));
  s.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' });
  s.end(body);
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;

// Stub of oaiq.min.js: replays the queue and records every call.
const PIXEL_STUB = `(function(){var log=window.__oai=window.__oai||[];var q=(window.oaiq&&window.oaiq.q)||[];
window.oaiq=function(){log.push(JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments))));};
q.forEach(function(a){window.oaiq.apply(null,a);});})();`;

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const results = [];
const check = (name, ok, got) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  → ' + JSON.stringify(got)}`); };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

async function page(ctx, opts) {
  const pg = await ctx.newPage();
  const st = { booking: null, pixelLoads: 0 };
  await pg.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes('bzrcdn.openai.com/sdk/oaiq.min.js')) { st.pixelLoads++; return route.fulfill({ body: PIXEL_STUB, contentType: 'text/javascript' }); }
    if (u.includes('googletagmanager.com')) return route.fulfill({ body: '', contentType: 'text/javascript' });
    if (u.includes('fonts.g')) return route.fulfill({ body: '' });
    if (u.includes('api.postcodes.io')) return route.fulfill({ json: { result: { latitude: 51.48, longitude: -3.18 } } });
    if (u.includes('/rpc/subnex_area_check')) return route.fulfill({ json: { valid: true, served: true, district: 'CF10', days: ['Monday'], mode: 'weekly' } });
    if (u.includes('/rpc/subnex_booking_days')) return route.fulfill({ json: { ok: true, days: [] } });
    if (u.includes('/rpc/subnex_oai_revoke')) { st.revoke = JSON.parse(route.request().postData()).p_ids; return route.fulfill({ json: { ok: true, dropped: 1, already_sent: 0 } }); }
    if (u.includes('/rpc/subnex_web_booking')) {
      st.booking = JSON.parse(route.request().postData()).p_data;
      return opts.app === 'error' ? route.fulfill({ status: 400, json: { message: 'EMAIL_INVALID' } }) : route.fulfill({ json: opts.app });
    }
    if (u.includes('api.web3forms.com')) return route.fulfill({ status: opts.mail === false ? 500 : 200, json: { success: opts.mail !== false } });
    return route.fulfill({ body: '' });
  });
  pg.on('dialog', d => { st.alert = d.message(); d.dismiss(); });
  return { pg, st };
}

async function fillCollect(pg, url) {
  await pg.goto(BASE + url);
  await pg.fill('#postcode', 'CF10 1AA');
  await pg.fill('#address', '12 Test Street, Cardiff');
  await pg.fill('#name', 'Jane Test');
  await pg.fill('#email', ' Jane.Test@Example.com ');
  await pg.fill('#phone', '07700 900123');
  await pg.click('.bags button[data-v="1-5"]');
  await pg.click('#go');
  await pg.waitForFunction(() => document.getElementById('done').style.display === 'block' || document.getElementById('go').textContent.includes('Try again'), null, { timeout: 8000 });
  await pg.waitForTimeout(400);
}
const measures = pg => pg.evaluate(() => (window.__oai || []).filter(a => a[0] === 'measure'));
const gConversions = pg => pg.evaluate(() => (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === 'conversion').length);
const consentCtx = async v => browser.newContext({ storageState: v ? { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: 'subnex_consent', value: v }] }] } : undefined });

const NEW = id => ({ ok: true, new: true, lead_event_id: id, booked: false, picked: false });
const AD = '/collect/?utm_source=chatgpt&utm_medium=cpc&gclid=G-KEEP&oppref=opp_TEST-123';

// A. Accepted cookies + new served request
{
  const ctx = await consentCtx('granted');
  const { pg, st } = await page(ctx, { app: NEW('ev-A') });
  await fillCollect(pg, AD);
  const m = await measures(pg);
  const log = await pg.evaluate(() => window.__oai);
  check('A pixel loaded once (consent granted)', st.pixelLoads === 1, st.pixelLoads);
  check('A init with pixelId', log.some(a => a[0] === 'init' && a[1].pixelId === PIXEL), log);
  check('A exactly one lead_created', m.length === 1 && m[0][1] === 'lead_created', m);
  check('A data type customer_action, event_id = server id', m[0] && m[0][2].type === 'customer_action' && m[0][3].event_id === 'ev-A', m);
  const ui = log.filter(a => a[0] === 'init' && a[1].user).pop();
  check('A hashed email/phone in init, no raw values', ui && ui[1].user.email_sha256 === sha('jane.test@example.com') && ui[1].user.phone_number_sha256 === sha('447700900123')
        && !JSON.stringify(log).includes('Example.com') && !JSON.stringify(log).includes('07700'), ui);
  check('A booking keeps gclid/utm + oppref + consent', st.booking.ad.gclid === 'G-KEEP' && st.booking.ad.utm_source === 'chatgpt' && st.booking.ad.oppref === 'opp_TEST-123' && st.booking.oai.consent === 'granted', st.booking);
  check('A Google conversion still fires', (await gConversions(pg)) === 1);
  // B. reload + same id replayed → no second event
  const { pg: pg2 } = await page(ctx, { app: NEW('ev-A') });
  await fillCollect(pg2, '/collect/');
  check('B reload + same event id → no second lead_created', (await measures(pg2)).length === 0, await measures(pg2));
  await ctx.close();
}
// C. Duplicate (server new:false) → no event
for (const [label, app, mail] of [
  ['C duplicate (new:false)', { ok: true, new: false, booked: false }],
  ['D out of area (served:false)', { ok: true, served: false }],
  ['E bot/old server (no new flag)', { ok: true }],
  ['F app error, email copy ok', 'error', true],
  ['G app error and email error', 'error', false],
]) {
  const ctx = await consentCtx('granted');
  const { pg, st } = await page(ctx, { app, mail });
  await fillCollect(pg, AD);
  check(`${label} → no lead_created`, (await measures(pg)).length === 0, await measures(pg));
  if (label.startsWith('G')) check('G form shows error, no thank-you', !!st.alert, st);
  await ctx.close();
}
// H. Rejected cookies → OpenAI script never requested
{
  const ctx = await consentCtx('denied');
  const { pg, st } = await page(ctx, { app: NEW('ev-H') });
  await fillCollect(pg, AD);
  check('H rejected → pixel script not loaded', st.pixelLoads === 0, st);
  check('H rejected → no oaiq, no event', !(await pg.evaluate(() => !!window.oaiq)), null);
  check('H rejected → server told consent=denied, no obref', st.booking.oai.consent === 'denied' && !st.booking.oai.obref, st.booking.oai);
  await ctx.close();
}
// I. No choice yet → nothing; then Accept → pixel loads
{
  const ctx = await consentCtx(null);
  const { pg, st } = await page(ctx, { app: NEW('ev-I') });
  await pg.goto(BASE + AD);
  await pg.waitForTimeout(300);
  check('I banner unanswered → pixel not loaded', st.pixelLoads === 0, st);
  await pg.click('.sx-cookie .sx-ok');
  await pg.waitForTimeout(300);
  check('I after Accept → pixel loaded, init once', st.pixelLoads === 1 && (await pg.evaluate(() => window.__oai.filter(a => a[0] === 'init').length)) === 1, st);
  await ctx.close();
}
// K. Withdraw consent on /privacy/ → Pixel consent(false), cookies gone, server told which ids, nothing further sent
{
  const ctx = await consentCtx('granted');
  const { pg } = await page(ctx, { app: NEW('ev-K') });
  await fillCollect(pg, AD);
  check('K before revoke: one lead_created', (await measures(pg)).length === 1);
  await ctx.addCookies([{ name: '__oppref', value: 'opp_TEST-123', url: BASE }, { name: '__obref', value: '123e4567-e89b-42d3-a456-426614174000', url: BASE }]);
  const { pg: pp, st: ps } = await page(ctx, { app: NEW('ev-x') });
  await pp.goto(BASE + '/privacy/');
  await pp.waitForTimeout(300);
  await pp.evaluate(() => { window.__keep = window.__oai; });
  const nav = pp.waitForNavigation();
  const logBefore = pp.evaluate(() => new Promise(r => { const o = window.oaiq; window.oaiq = function () { (window.__keep = window.__keep || []).push(Array.from(arguments)); sessionStorage.setItem('k', JSON.stringify(window.__keep)); return o && o.apply(null, arguments); }; r(); }));
  await logBefore;
  await pp.click('#reset');
  await nav; await pp.waitForTimeout(300);
  const calls = JSON.parse(await pp.evaluate(() => sessionStorage.getItem('k') || '[]'));
  check('K pixel told consent=false', calls.some(a => a[0] === 'consent' && a[1] === false), calls);
  check('K server told to drop ev-K', JSON.stringify(ps.revoke) === '["ev-K"]', ps.revoke);
  const ck = (await ctx.cookies(BASE)).map(c => c.name);
  check('K __oppref/__obref removed', !ck.includes('__oppref') && !ck.includes('__obref'), ck);
  check('K consent cleared, banner back', (await pp.evaluate(() => localStorage.getItem('subnex_consent'))) === null && (await pp.locator('.sx-cookie').count()) === 1);
  // L. Next booking without a new Accept: no Pixel, server not allowed to send
  const { pg: p3, st: s3 } = await page(ctx, { app: NEW('ev-L') });
  await fillCollect(p3, AD);
  check('L after revoke → pixel not loaded, no event', s3.pixelLoads === 0 && (await measures(p3)).length === 0, s3);
  check('L after revoke → server sees consent unset', s3.booking.oai.consent === 'unset' && !s3.booking.oai.obref, s3.booking.oai);
  await ctx.close();
}
// J. Main page form
{
  const ctx = await consentCtx('granted');
  const { pg, st } = await page(ctx, { app: NEW('ev-J') });
  await pg.goto(BASE + '/?utm_source=chatgpt&oppref=opp_MAIN');
  await pg.fill('#fname', 'Jane Test');
  await pg.fill('#phone', '07700 900123');
  await pg.fill('#email', 'jane@example.com');
  await pg.fill('#postcode', 'CF10 1AA');
  await pg.fill('#address', '12 Test Street, Cardiff');
  await pg.click('.qty-btn[data-value="1-5"]');
  await pg.click('#bookingForm .form-submit');
  await pg.waitForTimeout(1500);
  const m = await measures(pg);
  check('J main page: one lead_created with server id', m.length === 1 && m[0][3].event_id === 'ev-J', m);
  check('J main page: oppref + consent sent', st.booking && st.booking.ad.oppref === 'opp_MAIN' && st.booking.oai.consent === 'granted', st.booking);
  await ctx.close();
}

await browser.close();
server.close();
const fail = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
