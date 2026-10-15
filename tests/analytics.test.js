// Visit counts: the page beacon (/api/hit) → Google Analytics Measurement Protocol (src/analytics.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { buildHits, source, device } from '../src/analytics.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'zion4life.faith';
const WX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003129) NetType/WIFI Language/zh_CN';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const beacon = (over = {}) => ({ cid: '123456789.1760300000', sid: '1760300000', ns: 1, loc: `https://${HOST}/g/abcd1234?i=SECRETINVITE&utm_source=newsletter`, ref: '', title: '一起吃饭｜有光', lang: 'zh-CN', scr: '390x844', e: [{ n: 'page_view' }], ...over });

test('page view: our page only, invite codes never sent, location from Cloudflare, no IP', () => {
  const hits = buildHits(beacon(), { ua: WX, cf: { country: 'CN', regionCode: 'GD', city: 'Shenzhen' }, host: HOST, now: 1760300000000 });
  assert.equal(hits.length, 2, 'campaign_details first, then the page view');
  assert.equal(hits[0].events[0].name, 'campaign_details');
  assert.deepEqual(hits[0].events[0].params, { source: 'newsletter', medium: 'referral' });
  assert.ok(hits[0].timestamp_micros < hits[1].timestamp_micros);
  const h = hits[1];
  assert.equal(h.client_id, '123456789.1760300000');
  assert.deepEqual(h.user_location, { country_id: 'CN', region_id: 'CN-GD', city: 'Shenzhen' });
  assert.equal(h.ip_override, undefined);
  assert.equal(h.device.category, 'mobile');
  assert.equal(h.device.browser, 'WeChat');
  assert.equal(h.device.operating_system, 'iOS');
  assert.equal(h.device.operating_system_version, '17.4');
  const ev = h.events[0];
  assert.equal(ev.name, 'page_view');
  assert.equal(ev.params.page_location, `https://${HOST}/g/abcd1234?utm_source=newsletter`);
  assert.doesNotMatch(JSON.stringify(hits), /SECRETINVITE/);
  assert.equal(ev.params.session_id, 1760300000);
  assert.equal(ev.params.engagement_time_msec, 1);
  assert.equal(ev.params.language, 'zh-cn');
});

test('other sites, unknown events and junk are dropped', () => {
  assert.deepEqual(buildHits(beacon({ loc: 'https://evil.example/' }), { ua: CHROME, host: HOST }), []);
  assert.deepEqual(buildHits(beacon({ e: [{ n: 'purchase' }] }), { ua: CHROME, host: HOST }), []);
  assert.deepEqual(buildHits(null, { ua: CHROME, host: HOST }), []);
  const h = buildHits(beacon({ ns: 0, e: [{ n: 'join_group', p: { group_id: 'abcd1234', kind: 'bible', email: 'x@y.z' } }] }), { ua: CHROME, host: HOST });
  assert.equal(h.length, 1, 'no campaign_details after the first hit of a visit');
  assert.deepEqual(Object.keys(h[0].events[0].params).sort(), ['engagement_time_msec', 'group_id', 'kind', 'language', 'page_location', 'page_title', 'session_id']);
  const t = buildHits(beacon({ ns: 0, e: [{ n: 'time_on_page', ms: 99999999 }] }), { ua: CHROME, host: HOST });
  assert.equal(t[0].events[0].params.engagement_time_msec, 1800000, 'capped at 30 minutes');
});

test('where a visit came from', () => {
  const u = new URL(`https://${HOST}/`);
  assert.deepEqual(source(u, 'https://www.google.com/', CHROME, HOST), { source: 'google', medium: 'organic' });
  assert.deepEqual(source(u, 'https://m.baidu.com/s?wd=x', CHROME, HOST), { source: 'baidu', medium: 'organic' });
  assert.deepEqual(source(u, 'https://www.xiaohongshu.com/explore', CHROME, HOST), { source: 'xiaohongshu', medium: 'social' });
  assert.deepEqual(source(u, 'https://friend.blog/post', CHROME, HOST), { source: 'friend.blog', medium: 'referral' });
  assert.deepEqual(source(u, '', WX, HOST), { source: 'wechat', medium: 'social' });
  assert.equal(source(u, `https://${HOST}/pray/`, CHROME, HOST), null, 'our own pages are not a source');
  assert.equal(source(u, '', CHROME, HOST), null, 'direct');
});

test('devices', () => {
  assert.equal(device(CHROME).category, 'desktop');
  assert.equal(device(CHROME).operating_system, 'Windows');
  assert.equal(device(CHROME).browser, 'Chrome');
  const hw = device('Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-AN00) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/99.0.4844.88 HuaweiBrowser/14.0.0.320 Mobile Safari/537.36');
  assert.equal(hw.operating_system, 'HarmonyOS');
  assert.equal(hw.browser, 'Huawei Browser');
  assert.equal(hw.model, 'NOH-AN00');
  assert.equal(hw.brand, 'Huawei');
  assert.equal(device(WX).model, 'iPhone');
  assert.equal(device('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1').category, 'tablet');
});

test('/api/hit: silent without settings, forwards to Google with them, ignores bots', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { calls.push({ u: String(u), body: JSON.parse(o.body) }); return new Response(null, { status: 204 }); };
  try {
    const hit = (env, ua = WX) => worker.fetch(new Request(`https://${HOST}/api/hit`, { method: 'POST', headers: { 'User-Agent': ua, Origin: `https://${HOST}` }, body: JSON.stringify(beacon({ ns: 0 })) }), env);
    let r = await hit({});
    assert.equal(r.status, 204);
    assert.equal(calls.length, 0, 'nothing sent until GA_MEASUREMENT_ID and GA_API_SECRET are set');
    const env = { GA_MEASUREMENT_ID: 'G-TEST123', GA_API_SECRET: 'sec' };
    r = await hit(env, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    assert.equal(r.status, 204);
    assert.equal(calls.length, 0, 'bots are not counted');
    r = await hit(env);
    assert.equal(r.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].u, 'https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=sec');
    assert.equal(calls[0].body.events[0].name, 'page_view');
    r = await worker.fetch(new Request(`https://${HOST}/api/hit`, { method: 'POST', headers: { 'User-Agent': WX }, body: 'not json' }), env);
    assert.equal(r.status, 204);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('every page loads the async Google tag for city-aware page views with a Worker fallback', () => {
  const js = fs.readFileSync(path.join(ROOT, 'static/js/site.js'), 'utf8');
  assert.match(js, /https:\/\/www\.googletagmanager\.com\/gtag\/js/);
  assert.match(js, /send_page_view: false/);
  assert.match(js, /window\.gtag\('event', 'page_view'/);
  assert.match(js, /sendBeacon\('\/api\/hit'/);
  assert.match(js, /script\.onerror = fallback/);
});
