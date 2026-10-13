// Accounts, 留言, tag managers, 搭子 (groups), reminders and calendars, end to end through the Worker.
// The Durable Object's SQL runs on node:sqlite; static files come from dist/; Resend is mocked.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { Store, OPS, migrate } from '../src/store.js';
import { runReminders } from '../src/api.js';
import { resetSiteData, parseVideo } from '../src/content.js';
import { BOOKS, TOTAL_CHAPTERS, chapterLink, lifeStudyLink } from '../src/bible.js';
import { zonedTime, session, startedCount, sessionState, totalSessions, readingFor, scheduleText, planText, sessionLabel, sessionsBetween, icsInvite, vtimezone } from '../src/schedule.js';
import { KINDS, kindsForPage } from '../src/kinds.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
before(() => { execFileSync('node', ['build.mjs'], { cwd: ROOT }); });

function fakeSql() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(q, ...b) {
      const st = db.prepare(q);
      const out = /^\s*(select|with|pragma)/i.test(q) ? st.all(...b).map((r) => ({ ...r })) : (st.run(...b), []);
      return { toArray: () => out };
    },
  };
}
const assets = {
  async fetch(req) {
    const u = new URL(req.url);
    let f = path.join(ROOT, 'dist', decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return new Response('not found', { status: 404 });
    const type = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return new Response(fs.readFileSync(f), { headers: { 'Content-Type': type } });
  },
};
let env, mails;
beforeEach(() => {
  resetSiteData();
  const s = new Store({ storage: { sql: fakeSql() } });
  env = {
    STORE: { idFromName: () => 'main', get: () => ({ fetch: (url, init) => s.fetch(new Request(url, init)) }) },
    ASSETS: assets,
    RESEND_API_KEY: 'k', FROM_EMAIL_ADDRESS: '有光 <hello@zion4life.faith>', ADMIN_EMAILS: 'zion.chen@hotmail.com',
  };
  mails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com')) {
      mails.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});
async function call(p, { method, body, cookie, ip = '1.1.1.1', lang = 'zh' } = {}) {
  const headers = { 'cf-connecting-ip': ip, 'x-lang': lang, origin: 'https://zion4life.faith' };
  if (body) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const r = await worker.fetch(new Request(`https://zion4life.faith${p}`, { method: method || (body ? 'POST' : 'GET'), headers, body: body && JSON.stringify(body) }), env);
  const type = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, body: type.includes('json') ? await r.json() : await r.text() };
}
// Sign up (or in) and return the session cookie.
async function signIn(email, name, extra = {}) {
  const s = await call('/api/auth/start', { body: { email } });
  assert.equal(s.body.ok, true, JSON.stringify(s.body));
  const code = mails.at(-1).subject.match(/(\d{6})/)[1];
  const v = await call('/api/auth/verify', { body: { email, code, name, ...extra } });
  assert.equal(v.body.ok, true, JSON.stringify(v.body));
  return v.headers.get('set-cookie').split(';')[0];
}
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
function groupBody(over = {}) {
  const now = new Date();
  return {
    kind: 'bible', lang: 'zh', title: '一起读约翰福音', intro: '每周二四', days: [0, 1, 2, 3, 4, 5, 6], time: '00:00', minutes: 30,
    tz: 'UTC', startDate: now.toISOString().slice(0, 10), plan: { book: 43, chapter: 1, per: 1 },
    venue: { type: 'wechat', info: '微信号 abc123' }, visibility: 'public', join: 'open', max: 4, sig: SIG, ...over,
  };
}

test('bible: 66 books, 1,189 chapters, Recovery Version and Life-study links', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(TOTAL_CHAPTERS, 1189);
  // the addresses Zion gave, for John 3 and Life-study of John message 3
  assert.equal(chapterLink(43, 3, 'en'), 'https://bibleread.online/bible/the-gospel-according-to-john/3/');
  assert.equal(chapterLink(43, 3, 'zh'), 'https://recoveryversion.com.tw/verse/43/3?verse=1');
  assert.equal(lifeStudyLink(43, 3, 'en'), 'https://bibleread.online/life-study-of-the-bible/life-study-of-john/3/');
  assert.equal(lifeStudyLink(43, 3, 'zh'), 'https://www.lsmchinese.org/lifestudy/john03.html');
  assert.equal(lifeStudyLink(1, 5, 'zh'), 'https://www.lsmchinese.org/lifestudy/ot/gen005.html', 'Genesis has three digits');
  assert.equal(lifeStudyLink(10, 20, 'zh'), 'https://www.lsmchinese.org/lifestudy/ot/sam20.html', '1–2 Samuel are one series');
  assert.equal(chapterLink(9, 1, 'en'), 'https://bibleread.online/bible/first-samuel/1/');
  assert.equal(chapterLink(22, 2, 'en'), 'https://bibleread.online/bible/song-of-songs/2/');
  assert.equal(chapterLink(57, 1, 'en'), 'https://bibleread.online/bible/the-epistle-of-paul-to-philemon/1/');
  assert.equal(chapterLink(66, 22, 'en'), 'https://bibleread.online/bible/revelation/22/');
  assert.equal(lifeStudyLink(46, 1, 'en'), 'https://bibleread.online/life-study-of-the-bible/life-study-of-1-corinthians/1/');
  assert.equal(new Set(BOOKS.map((b) => b.slug)).size, 66);
});

test('schedule: sessions, time zones, the kinds of reading', () => {
  const g = { id: 'abcdefgh', kind: 'bible', lang: 'zh', days: [2, 4], time: '20:00', minutes: 30, tz: 'Asia/Shanghai', startDate: '2026-10-13', plan: { book: 43, chapter: 1, per: 1, cont: false } };
  assert.equal(new Date(zonedTime('2026-10-13', '20:00', 'Asia/Shanghai')).toISOString(), '2026-10-13T12:00:00.000Z');
  assert.equal(new Date(zonedTime('2026-11-02', '20:00', 'America/New_York')).toISOString(), '2026-11-03T01:00:00.000Z');
  assert.equal(session(g, 3).date, '2026-10-20');
  assert.equal(readingFor(g, 3).text, '约翰福音 第3章');
  assert.equal(readingFor({ ...g, lang: 'en' }, 3).text, 'John 3');
  assert.equal(readingFor({ ...g, lang: 'en' }, 3).links[0].url, 'https://bibleread.online/bible/the-gospel-according-to-john/3/');
  assert.equal(readingFor(g, 3).links[0].url, 'https://recoveryversion.com.tw/verse/43/3?verse=1');
  assert.equal(totalSessions(g), 21);
  assert.equal(startedCount(g, Date.parse('2026-10-21T00:00:00Z')), 3);
  assert.equal(sessionState(g, Date.parse('2026-10-13T12:10:00Z')).current.n, 1);
  // shown in each reader's own time zone: 20:00 in Beijing is 08:00 the same day in New York
  const at = Date.parse('2026-10-14T00:00:00Z');
  assert.equal(scheduleText(g, 'en', 'Asia/Shanghai', at), 'Every Tue, Thu at 20:00, 30 min each (Beijing time)');
  assert.equal(scheduleText(g, 'zh', 'America/New_York', at), '每周二、四 08:00，每次30分钟（美东时间）');
  assert.equal(scheduleText({ ...g, time: '09:00', tz: 'America/New_York' }, 'zh', 'Asia/Shanghai', at), '每周二、四 21:00，每次30分钟（北京时间）');
  assert.equal(scheduleText({ ...g, time: '21:00', tz: 'America/New_York' }, 'zh', 'Asia/Shanghai', at), '每周三、五 09:00，每次30分钟（北京时间）', 'the day moves too');
  assert.equal(sessionLabel(g, session(g, 1), 'en', 'America/New_York'), 'Tue, Oct 13, 08:00 US Eastern');
  assert.equal(planText(g, 'zh'), '从约翰福音第1章开始，每次1章，共21次读完');
  assert.equal(planText(g, 'en'), 'John from chapter 1, 1 chapter each time, 21 times in all');
  const pray = { ...g, kind: 'pray', plan: {} };
  assert.equal(readingFor(pray, 2).huxi, '2026-10-15');
  assert.equal(readingFor(pray, 2).text, '10月15日的呼吸');
  assert.equal(totalSessions(pray), null);
  const feed = { ...g, kind: 'feed', plan: { lesson: 2 } };
  assert.equal(totalSessions(feed, { feedCount: 3 }), 2);
  assert.equal(readingFor(feed, 1, { feed: { 2: { zh: '第二课', en: 'Two' } } }).text, '第2课：第二课');
  const life = { ...g, kind: 'life', lang: 'en', plan: { book: 43, msg: 5, per: 2, link: 'https://example.org/ls/{n}' } };
  assert.equal(readingFor(life, 2).text, 'Life-study of John, messages 7–8');
  assert.deepEqual(readingFor(life, 2).links.map((l) => l.url), ['https://example.org/ls/7', 'https://example.org/ls/8']);
  const lifeAuto = { ...life, plan: { ...life.plan, link: '' } };
  assert.equal(readingFor(lifeAuto, 1).links[0].url, 'https://bibleread.online/life-study-of-the-bible/life-study-of-john/5/');
  assert.equal(readingFor({ ...lifeAuto, lang: 'zh' }, 1).links[0].url, 'https://www.lsmchinese.org/lifestudy/john05.html');
  // 晨兴: weeks of six days
  const morning = { ...g, kind: 'morning', plan: { set: '2026年秋季训练', weeks: 12, week: 1, day: 1, per: 1, link: '' } };
  assert.equal(totalSessions(morning), 72);
  assert.equal(readingFor(morning, 1).text, '第1周 周一');
  assert.equal(readingFor(morning, 7).text, '第2周 周一');
  assert.equal(readingFor({ ...morning, lang: 'en' }, 72).text, 'Week 12, Day 6');
  const m3 = { ...morning, plan: { ...morning.plan, day: 5, per: 3 } };
  assert.equal(readingFor(m3, 1).text, '第1周周五至第2周周一');
  assert.equal(readingFor({ ...m3, lang: 'en' }, 2).text, 'Week 2, Days 2–4');
  assert.equal(planText(morning, 'zh'), '《2026年秋季训练》，从第1周周一开始，每次1天，共72次读完');
  assert.equal(planText({ ...morning, plan: { ...morning.plan, set: '' } }, 'en'), 'From week 1, Day 1; 1 day each time, 72 times in all');
  assert.equal(readingFor({ ...morning, plan: { ...morning.plan, link: 'https://example.org/mr/{w}/{d}' } }, 8).links[0].url, 'https://example.org/mr/2/2');
  assert.equal(readingFor(morning, 1).full, '《2026年秋季训练》第1周 周一', 'reminders say which book');
  // a stemofjesse.org day page: every day links to its own week and day
  const soj = 'https://www.stemofjesse.org/doku/doku.php/%E6%99%A8%E5%85%B4%E5%9C%A3%E8%A8%80:2026:2026.01.%E5%9B%BD%E9%99%85%E5%8D%8E%E8%AF%AD%E7%89%B9%E4%BC%9A:%E7%AC%AC%E4%B8%80%E5%91%A8:%E5%91%A8%E4%B8%80';
  assert.equal(decodeURI(readingFor({ ...morning, plan: { ...morning.plan, link: soj } }, 69).links[0].url), 'https://www.stemofjesse.org/doku/doku.php/晨兴圣言:2026:2026.01.国际华语特会:第十二周:周三');
  // no link at all: the reminder still says the book, week and day
  assert.deepEqual(readingFor({ ...morning, lang: 'en', plan: { ...morning.plan, set: '2026 Spring Elders’ Conference' } }, 2).links, [{ label: '2026 Spring Elders’ Conference, Week 1, Day 2', url: null }]);
  // the initiator changes the plan: from time 5 read John 3 again, and after John read Acts
  const legs = { ...g, legs: [{ from: 5, plan: { book: 43, chapter: 3, per: 1, cont: false } }] };
  assert.equal(readingFor(legs, 4).text, '约翰福音 第4章');
  assert.equal(readingFor(legs, 5).text, '约翰福音 第3章');
  assert.equal(readingFor(legs, 6).text, '约翰福音 第4章');
  assert.equal(totalSessions(legs), 4 + 19);
  const next = { ...legs, legs: [...legs.legs, { from: 30, plan: { book: 44, chapter: 1, per: 1, cont: false } }] };
  assert.equal(readingFor(next, 23).text, '约翰福音 第21章');
  assert.equal(readingFor(next, 25), null, 'a gap between the two plans');
  assert.equal(readingFor(next, 30).text, '使徒行传 第1章');
  assert.equal(totalSessions(next), 29 + 28);
  assert.deepEqual(sessionsBetween(next, session(next, 23).start, session(next, 31).start).map((x) => x.n), [23, 30], 'no reminders in a gap');
  assert.equal(planText(next, 'zh', {}, 30), '从使徒行传第1章开始，每次1章，共28次读完');
  // every kind is complete: names, form fields, a summary, the functions
  for (const [key, k] of Object.entries(KINDS)) {
    for (const x of ['zh', 'en', 'tint', 'icon']) assert.ok(k[x], `${key}.${x}`);
    for (const x of ['what', 'verb', 'about', 'summary']) assert.ok(k[x].zh && k[x].en, `${key}.${x}`);
    for (const x of ['plan', 'total', 'reading']) assert.equal(typeof k[x], 'function', `${key}.${x}`);
  }
  assert.ok(kindsForPage('zh').morning.fields.length >= 5);
  assert.deepEqual(sessionsBetween(g, Date.parse('2026-10-13T00:00:00Z'), Date.parse('2026-10-16T00:00:00Z')).map((s) => s.n), [1, 2]);
});

test('calendar invitation: weekly repeat in the group’s own time zone with daylight saving', () => {
  const g = { id: 'abcdefgh', kind: 'bible', lang: 'en', days: [2, 4], time: '20:00', minutes: 30, tz: 'America/New_York', startDate: '2026-10-13', plan: { book: 43, chapter: 1, per: 1 } };
  const ics = icsInvite(g, { title: 'Meal buddies·John', description: 'x', url: 'https://zion4life.faith/en/g/abcdefgh/now', organizer: { name: 'Light', email: 'hello@zion4life.faith' }, attendee: { name: 'Sam', email: 'sam@example.com' } }, Date.parse('2026-10-12T00:00:00Z'));
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261013T200000/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=21/);
  assert.match(ics, /BEGIN:DAYLIGHT[\s\S]*TZOFFSETTO:-0400/);
  assert.match(ics, /BEGIN:STANDARD[\s\S]*TZOFFSETTO:-0500/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.deepEqual(vtimezone('Asia/Shanghai', 2026, 2027).filter((l) => l.startsWith('TZOFFSET')), ['TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800']);
});

test('sign-in with an emailed code; profile; sign out', async () => {
  const s = await call('/api/auth/start', { body: { email: 'Sam@Example.com' } });
  assert.equal(s.body.isNew, true);
  const code = mails[0].subject.match(/(\d{6})/)[1];
  assert.match(mails[0].html, new RegExp(code));
  const noName = await call('/api/auth/verify', { body: { email: 'sam@example.com', code } });
  assert.equal(noName.body.ok, false, 'first time needs a nickname');
  const wrong = await call('/api/auth/verify', { body: { email: 'sam@example.com', code: code === '000000' ? '111111' : '000000', name: '小山' } });
  assert.equal(wrong.body.ok, false);
  const ok = await call('/api/auth/verify', { body: { email: 'sam@example.com', code, name: '小山', ids: ['student', 'hacker'], idsPublic: true } });
  assert.equal(ok.body.ok, true);
  assert.deepEqual(ok.body.user.ids, ['student']);
  assert.equal(ok.body.user.email, 's***@example.com');
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const me = await call('/api/me', { cookie });
  assert.equal(me.body.user.name, '小山');
  const again = await call('/api/auth/verify', { body: { email: 'sam@example.com', code, name: 'x' } });
  assert.equal(again.body.ok, false, 'a code works once');
  await call('/api/auth/start', { body: { email: 'kim@example.com' } });
  const quick = await call('/api/auth/start', { body: { email: 'kim@example.com' } });
  assert.equal(quick.status, 429, 'not twice within 45 seconds');
  const upd = await call('/api/me', { body: { name: '山山', ids: ['teacher'], lang: 'en' }, cookie });
  assert.equal(upd.body.user.name, '山山');
  await call('/api/auth/logout', { body: {}, cookie });
  assert.equal((await call('/api/me', { cookie })).body.user, null);
});

test('no mail set up: sign-in says so instead of failing silently', async () => {
  delete env.RESEND_API_KEY;
  const r = await call('/api/auth/start', { body: { email: 'a@example.com' } });
  assert.equal(r.status, 503);
});

test('留言: public for everyone, private only for the author, the tag’s managers and Zion', async () => {
  const sam = await signIn('sam@example.com', '小山');
  const li = await signIn('li@example.com', '李光宏', { ids: ['teacher'] });
  const zion = await signIn('zion.chen@hotmail.com', 'Zion');
  const anon = await call('/api/talk?target=tag:lgh');
  assert.deepEqual(anon.body.comments, []);
  await call('/api/talk', { body: { target: 'tag:lgh', body: '谢谢您的分享' }, cookie: sam });
  await call('/api/talk', { body: { target: 'tag:lgh', body: '想私下问一个问题', pub: false }, cookie: sam });
  assert.equal((await call('/api/talk?target=tag:lgh')).body.comments.length, 1, 'strangers see the public one only');
  assert.equal((await call('/api/talk?target=tag:lgh', { cookie: li })).body.comments.length, 1, 'not a manager yet');
  // 李光宏 claims his tag; Zion approves
  const claim = await call('/api/claims', { body: { tag: 'lgh', note: '我是本人' }, cookie: li });
  assert.equal(claim.body.ok, true);
  assert.equal((await call('/api/claims', { body: { tag: 'mystery' }, cookie: li })).body.ok, false, 'only person tags can be claimed');
  const ov = await call('/api/admin/overview', { cookie: zion });
  assert.equal(ov.body.claims.length, 1);
  assert.equal((await call('/api/admin/overview', { cookie: sam })).status, 403);
  await call(`/api/admin/claims/${ov.body.claims[0].id}`, { body: { status: 'approved' }, cookie: zion });
  const seen = await call('/api/talk?target=tag:lgh', { cookie: li });
  assert.equal(seen.body.comments.length, 2, 'the manager now reads the private one');
  const priv = seen.body.comments.find((c) => !c.pub);
  await call('/api/talk', { body: { target: 'tag:lgh', body: '你好，欢迎来问', replyTo: priv.id }, cookie: li });
  const samView = await call('/api/talk?target=tag:lgh', { cookie: sam });
  const thread = samView.body.comments.find((c) => c.id === priv.id);
  assert.equal(thread.replies[0].badge, 'self', '本人 badge on a person tag');
  assert.equal((await call('/api/talk?target=tag:lgh')).body.comments.length, 1, 'the reply stays private');
  assert.ok(!JSON.stringify(samView.body).includes('@example.com'), 'emails never reach a page');
  // 留言 on an article; unknown targets refused
  assert.equal((await call('/api/talk', { body: { target: 'a:rensheng-aomi', body: '好文章' }, cookie: sam })).body.ok, true);
  assert.equal((await call('/api/talk', { body: { target: 'a:nope', body: 'x' }, cookie: sam })).status, 404);
  // the author can remove their own
  const mine = (await call('/api/talk?target=a:rensheng-aomi', { cookie: sam })).body.comments[0];
  assert.equal((await call(`/api/talk/${mine.id}/hide`, { body: {}, cookie: sam })).body.ok, true);
});

test('tag managers post articles and videos into their tag; the Worker renders them', async () => {
  const li = await signIn('li@example.com', '李光宏');
  const zion = await signIn('zion.chen@hotmail.com', 'Zion');
  const no = await call('/api/posts', { body: { tags: ['lgh'], title: '标题', body: '正文正文正文正文正文' }, cookie: li });
  assert.equal(no.status, 403, 'not a manager yet');
  assert.equal((await call('/api/admin/managers', { body: { tag: 'lgh', email: 'li@example.com' }, cookie: zion })).body.ok, true);
  const a = await call('/api/posts', { body: { tags: ['lgh', 'life'], kind: 'article', lang: 'zh', title: '福乐的人生（文字版）', summary: '一两句', body: '## 小标题\n\n第一段。\n\n> 经文\n> —— 约翰福音 3:16' }, cookie: li });
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  const v = await call('/api/posts', { body: { tags: ['lgh'], kind: 'video', title: '一段视频', video: 'https://www.bilibili.com/video/BV1xx411c7mD' }, cookie: li });
  assert.equal(v.body.ok, true, JSON.stringify(v.body));
  assert.equal((await call('/api/posts', { body: { tags: ['stories'], title: 'x', body: '正文正文正文正文正文' }, cookie: li })).status, 403);
  const list = await call('/api/posts?tag=lgh');
  assert.equal(list.body.posts.length, 2);
  const page = await call(`/x/${a.body.id}/`);
  assert.match(page.body, /<title>福乐的人生（文字版）｜有光<\/title>/);
  assert.match(page.body, /<h2>小标题<\/h2>/);
  assert.match(page.body, /data-talk="x:/);
  const vpage = await call(`/en/x/${v.body.id}`);
  assert.match(vpage.body, /player\.bilibili\.com/);
  assert.match(vpage.body, /This piece is in Chinese/);
  assert.equal(parseVideo('https://youtu.be/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  assert.equal(parseVideo('https://evil.example.com/x'), null);
});

test('搭子: create, plaza, open join with a signature, invite-only, hidden, decline', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const sam = await signIn('sam@example.com', '小山');
  const amy = await signIn('amy@example.com', 'Amy');
  const noSig = await call('/api/dazi', { body: groupBody({ sig: '' }), cookie: owner });
  assert.equal(noSig.body.ok, false);
  const c = await call('/api/dazi', { body: groupBody(), cookie: owner });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  const id = c.body.id;
  const created = mails.find((m) => m.subject.includes('建好了'));
  assert.ok(created, 'owner gets an email');
  assert.match(Buffer.from(created.attachments[0].content, 'base64').toString(), /RRULE:FREQ=WEEKLY/);
  const plaza = await call('/api/dazi/plaza');
  assert.equal(plaza.body.groups.length, 1);
  assert.equal(plaza.body.groups[0].seats[0].i, '老');
  assert.ok(!JSON.stringify(plaza.body).includes('abc123'), 'venue details are for members only');
  const view = await call(`/api/dazi/${id}`, { cookie: sam });
  assert.equal(view.body.canJoin, true);
  assert.equal(view.body.group.venue.info, undefined);
  assert.equal(view.body.group.members[0].sig, undefined, 'signatures are for members only');
  const j = await call(`/api/dazi/${id}/join`, { body: { sig: SIG }, cookie: sam });
  assert.equal(j.body.ok, true, JSON.stringify(j.body));
  assert.ok(mails.some((m) => m.subject.startsWith('立约') && m.attachments?.length), 'covenant email with calendar invitation');
  assert.ok(mails.some((m) => m.subject.includes('小山 和「一起读约翰福音」立约了')), 'owner told');
  const inside = await call(`/api/dazi/${id}`, { cookie: sam });
  assert.equal(inside.body.group.venue.info, '微信号 abc123');
  assert.ok(inside.body.group.members.every((m) => m.sig));
  assert.match(inside.body.invite, /\/g\/[a-z0-9]{8}\?i=[a-z0-9]{6}$/);
  // invite-only: strangers cannot join; the invite link works
  await call(`/api/dazi/${id}/manage`, { body: { action: 'update', visibility: 'public', join: 'invite' }, cookie: owner });
  assert.equal((await call(`/api/dazi/${id}/join`, { body: { sig: SIG }, cookie: amy })).status, 403);
  const code = inside.body.invite.split('?i=')[1];
  assert.equal((await call(`/api/dazi/${id}?i=${code}`, { cookie: amy })).body.inviteOk, true);
  assert.equal((await call(`/api/dazi/${id}/decline`, { body: { invite: code }, cookie: amy })).body.ok, true);
  assert.ok(mails.some((m) => m.subject.includes('婉拒')));
  assert.equal((await call(`/api/dazi/${id}/join`, { body: { sig: SIG, invite: code }, cookie: amy })).body.ok, true, 'can still accept after declining');
  // hidden: off the plaza, needs the invite to even see it
  await call(`/api/dazi/${id}/manage`, { body: { action: 'update', visibility: 'hidden' }, cookie: owner });
  assert.equal((await call('/api/dazi/plaza')).body.groups.length, 0);
  assert.equal((await call(`/api/dazi/${id}`)).body.needInvite, true);
  // the group page shell carries the name for link previews
  const shell = await call(`/g/${id}`);
  assert.match(shell.body, /<title>一起读约翰福音｜老陈邀请你加入饭搭子<\/title>/);
  assert.match(shell.body, /<meta name="description" content="从约翰福音第1章开始，每次1章，共21次读完 · 每次30分钟">/, 'no clock times in the preview');
  const enShell = await call(`/en/g/${id}`);
  assert.match(enShell.body, /Meal buddies/);
  // my groups
  assert.equal((await call('/api/dazi/mine', { cookie: amy })).body.groups.length, 1);
});

test('搭子: check-ins, make-ups, notes, bookmarks, the initiator’s table, the board', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const sam = await signIn('sam@example.com', '小山');
  // started three days ago, every day at 00:00 UTC: sessions 1–4 have started
  const start = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const { body: { id } } = await call('/api/dazi', { body: groupBody({ startDate: start, kind: 'feed', plan: { lesson: 1 } }), cookie: owner });
  await call(`/api/dazi/${id}/join`, { body: { sig: SIG }, cookie: sam });
  const s1 = await call(`/api/dazi/${id}/s/1`, { cookie: sam });
  assert.equal(s1.body.session.reading.lesson, 1);
  assert.equal(s1.body.open, true);
  const late = await call(`/api/dazi/${id}/s/1`, { body: { done: true, note: '第一课的心得', marks: ['b0', 'b2'] }, cookie: sam });
  assert.equal(late.body.late, true, 'checked in days later: a make-up');
  const page = (await call(`/api/dazi/${id}`, { cookie: sam })).body;
  assert.ok(page.checkMax >= 3);
  assert.equal(page.group.week.length, 3, 'start times for the page to show in local time (a week, or what is left of a 3-lesson plan)');
  assert.equal(page.group.tz, undefined, 'pages get instants, not the initiator’s zone');
  const back = await call(`/api/dazi/${id}/s/1`, { cookie: sam });
  assert.deepEqual(back.body.mine.marks, ['b0', 'b2']);
  assert.equal(back.body.others.find((o) => o.me).note, '第一课的心得');
  assert.equal((await call(`/api/dazi/${id}/s/99`, { cookie: sam })).status, 404, 'only 3 lessons on the site');
  assert.equal((await call(`/api/dazi/${id}/s/1`)).status, 401);
  const stats = await call(`/api/dazi/${id}/stats`, { cookie: owner });
  assert.equal(stats.body.rows.find((r) => r.name === '小山').cells[0], 'late');
  assert.equal((await call(`/api/dazi/${id}/stats`, { cookie: sam })).status, 403);
  await call(`/api/dazi/${id}/board`, { body: { body: '这周我晚到十分钟' }, cookie: sam });
  const board = await call(`/api/dazi/${id}/board`, { cookie: owner });
  assert.equal(board.body.posts[0].body, '这周我晚到十分钟');
  assert.equal((await call(`/api/dazi/${id}/board`)).status, 401);
});

test('reminders go out once as each session starts; calendar feeds', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const now = Date.now();
  const at = new Date(now + 3 * 60000);
  const pad = (x) => String(x).padStart(2, '0');
  const body = groupBody({ days: [at.getUTCDay()], time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`, startDate: at.toISOString().slice(0, 10) });
  const { body: { id } } = await call('/api/dazi', { body, cookie: owner });
  mails = [];
  const r1 = await runReminders(env, now);
  assert.equal(r1.sent, 1);
  assert.match(mails[0].subject, /饭搭子·约翰福音 第1章/);
  assert.match(mails[0].html, new RegExp(`/g/${id}/1`));
  assert.equal((await runReminders(env, now + 60000)).sent, 0, 'not twice');
  const me = await call('/api/me', { cookie: owner });
  const feed = await call(`/api/cal/${me.body.user.cal}.ics`);
  assert.match(feed.body, /BEGIN:VCALENDAR/);
  assert.match(feed.body, /SUMMARY:饭搭子·约翰福音 第1章/);
  assert.match(feed.body, /TRIGGER:PT0S/);
  assert.equal((await call('/api/cal/nope-nope-nope-nope-nope.ics')).status, 404);
  const file = await call(`/api/dazi/${id}/ics`);
  assert.match(file.body, /BEGIN:VEVENT/);
});

test('validation', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const bad = async (over, msg) => {
    const r = await call('/api/dazi', { body: groupBody(over), cookie: owner });
    assert.equal(r.body.error, msg);
  };
  await bad({ days: [] }, '请选每周哪几天');
  await bad({ plan: { book: 43, chapter: 30, per: 1 } }, '约翰福音一共21章');
  await bad({ venue: { type: 'fax' } }, '请选在哪里见面');
  await bad({ kind: 'feed', plan: { lesson: 9 } }, '一共3课');
  await bad({ kind: 'morning', plan: { weeks: 6, week: 7, day: 1, per: 1 } }, '这一本一共6周');
  await bad({ kind: 'morning', plan: { weeks: 12, week: 1, day: 1, per: 1, link: 'http://x' } }, '网址要以 https:// 开头');
  await bad({ kind: 'nope' }, '请选一种搭子');
  assert.equal((await call('/api/dazi', { body: groupBody() })).status, 401);
  const en = await call('/api/dazi', { body: groupBody({ days: [] }), cookie: owner, lang: 'en' });
  assert.equal(en.body.error, 'Pick the days of the week');
});

test('搭子: the initiator changes the plan; files; members hear about both', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const sam = await signIn('sam@example.com', '小山');
  const amy = await signIn('amy@example.com', 'Amy');
  // every day at 00:00 UTC since three days ago: times 1–4 have started
  const start = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const { body: { id } } = await call('/api/dazi', { body: groupBody({ startDate: start }), cookie: owner });
  await call(`/api/dazi/${id}/join`, { body: { sig: SIG }, cookie: sam });
  const page = (await call(`/api/dazi/${id}`, { cookie: owner })).body;
  const open = page.progress.from;
  assert.equal(page.progress.plan.chapter, open, 'the form starts where the next time would');
  assert.equal(page.progress.afterPlan.book, 44, 'after John comes Acts');
  // only half of the chapter got read: read the same chapter again next time
  const again = page.progress.plan.chapter - 1;
  assert.equal((await call(`/api/dazi/${id}/manage`, { body: { action: 'progress', from: open, plan: { book: 43, chapter: again, per: 1 } }, cookie: sam })).status, 403);
  assert.equal((await call(`/api/dazi/${id}/manage`, { body: { action: 'progress', from: 1, plan: { book: 43, chapter: 1, per: 1 } }, cookie: owner })).body.ok, false, 'past times stay as they were');
  const ch = await call(`/api/dazi/${id}/manage`, { body: { action: 'progress', from: open, plan: { book: 43, chapter: again, per: 1 } }, cookie: owner });
  assert.equal(ch.body.ok, true, JSON.stringify(ch.body));
  const s = await call(`/api/dazi/${id}/s/${open}`, { cookie: sam });
  assert.equal(s.body.session.reading.text, `约翰福音 第${again}章`);
  // and after John, Acts
  const pg = (await call(`/api/dazi/${id}`, { cookie: owner })).body.progress;
  await call(`/api/dazi/${id}/manage`, { body: { action: 'progress', from: pg.afterFrom, plan: { book: 44, chapter: 1, per: 1 } }, cookie: owner });
  const after = (await call(`/api/dazi/${id}`, { cookie: sam })).body.group;
  assert.equal(after.later.at(-1).text, '从使徒行传第1章开始，每次1章，共28次读完');
  // 资料: the initiator puts in a PDF; members open it; strangers cannot
  const pdf = new Uint8Array(2500000).map((_, i) => i % 251);
  const up = await worker.fetch(new Request(`https://zion4life.faith/api/dazi/${id}/files?name=${encodeURIComponent('晨兴圣言 第一周.pdf')}`, {
    method: 'POST', headers: { cookie: owner, origin: 'https://zion4life.faith', 'content-type': 'application/pdf', 'content-length': String(pdf.length) }, body: pdf,
  }), env);
  const upj = await up.json();
  assert.equal(upj.ok, true, JSON.stringify(upj));
  const files = (await call(`/api/dazi/${id}/files`, { cookie: sam })).body.files;
  assert.equal(files[0].name, '晨兴圣言 第一周.pdf');
  assert.equal(files[0].size, pdf.length);
  const got = await worker.fetch(new Request(`https://zion4life.faith/api/dazi/${id}/files/${upj.id}`, { headers: { cookie: sam } }), env);
  assert.equal(got.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), pdf, 'the bytes come back whole (in pieces under 1 MB inside)');
  assert.equal((await call(`/api/dazi/${id}/files/${upj.id}`, { cookie: amy })).status, 403);
  const bad = await worker.fetch(new Request(`https://zion4life.faith/api/dazi/${id}/files?name=x.exe`, { method: 'POST', headers: { cookie: owner, origin: 'https://zion4life.faith', 'content-type': 'application/x-msdownload' }, body: 'MZ' }), env);
  assert.equal(bad.status, 400);
  // members got messages: two plan changes and a file
  const inbox = (await call('/api/inbox', { cookie: sam })).body.list;
  assert.equal(inbox.filter((m) => m.scope === `g:${id}`).length, 3);
  assert.equal((await call('/api/inbox', { cookie: amy })).body.list.length, 0, 'not for people outside the group');
  assert.equal((await call(`/api/dazi/${id}/files/${upj.id}/delete`, { body: {}, cookie: owner })).body.ok, true);
  assert.equal((await call(`/api/dazi/${id}/files`, { cookie: sam })).body.files.length, 0);
});

test('我的 消息: subscriptions, managers’ posts, Zion’s announcements, unread count', async () => {
  const zion = await signIn('zion.chen@hotmail.com', 'Zion');
  const sam = await signIn('sam@example.com', '小山');
  const li = await signIn('li@example.com', '李光宏');
  await call('/api/admin/managers', { body: { tag: 'lgh', email: 'li@example.com' }, cookie: zion });
  assert.equal((await call('/api/subs', { body: { topic: 'tag:nope', on: true }, cookie: sam })).body.ok, false);
  assert.deepEqual((await call('/api/subs', { body: { topic: 'tag:lgh', on: true }, cookie: sam })).body.topics, ['tag:lgh']);
  await call('/api/subs', { body: { topic: 'huxi', on: true }, cookie: sam });
  const post = await call('/api/posts', { body: { tags: ['lgh'], kind: 'article', title: '十月的分享', body: '这是这个月的分享，一起来读。' }, cookie: li });
  assert.equal(post.body.ok, true);
  const bc = await call('/api/admin/broadcast', { body: { title: '主日下午特别聚会', body: '欢迎大家来。', url: '/huxi/' }, cookie: zion });
  assert.equal(bc.body.ok, true);
  assert.equal((await call('/api/admin/broadcast', { body: { title: 'x', body: 'y' }, cookie: sam })).status, 403);
  assert.equal((await call('/api/me', { cookie: sam })).body.unread, 2);
  const box = (await call('/api/inbox', { cookie: sam })).body.list;
  assert.deepEqual(box.map((m) => m.title.zh), ['主日下午特别聚会', '「李光宏」有新内容']);
  assert.equal(box[1].url.startsWith('/x/'), true);
  assert.equal((await call('/api/me', { cookie: sam })).body.unread, 0, 'opening the box marks them read');
  // the cron: the first run only records what is already on the site
  const r = await runReminders(env, Date.now());
  assert.equal(r.announced, 0);
  assert.equal((await call('/api/inbox', { cookie: sam })).body.list.length, 2);
});

test('读给我听: the cron records 呼吸 days piece by piece; pieces play with Range', async () => {
  const calls = [];
  env.AI = { run: async (model, input) => { calls.push([model, input.lang, input.prompt.length]); return { audio: Buffer.from(`ID3-${input.prompt.slice(0, 4)}`.repeat(50)).toString('base64') }; } };
  const days = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data/huxi.json'), 'utf8'));
  const date = days[0].date;
  const speech = JSON.parse(fs.readFileSync(path.join(ROOT, `dist/data/huxi/${date}.speech.json`), 'utf8'));
  assert.ok(speech.zh.chunks.length > 3 && speech.en.chunks.length > 3);
  assert.match(speech.zh.chunks.map((c) => c.t).join(''), /以弗所书四章16节/, 'references are written out to be read');
  assert.match(speech.en.chunks.map((c) => c.t).join(' '), /Ephesians 4:16/);
  let m = (await call(`/api/audio/huxi/${date}/zh.json`)).body;
  assert.equal(m.ready, false);
  for (let i = 0; i < 40 && !m.ready; i++) {
    await runReminders(env, Date.parse(`${date}T12:00:00Z`));
    m = (await call(`/api/audio/huxi/${date}/zh.json`)).body;
  }
  assert.equal(m.ready, true);
  assert.equal(m.parts.length, speech.zh.chunks.length);
  assert.equal(calls[0][0], '@cf/myshell-ai/melotts');
  const part = await worker.fetch(new Request(`https://zion4life.faith${m.parts[0]}`, { headers: { range: 'bytes=0-9' } }), env);
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-type'), 'audio/mpeg');
  assert.equal(new TextDecoder().decode(await part.arrayBuffer()), `ID3-${speech.zh.chunks[0].t.slice(0, 4)}`.slice(0, 10));
  const n = calls.length;
  await runReminders(env, Date.parse(`${date}T12:00:00Z`));
  const en = (await call(`/api/audio/huxi/${date}/en.json`)).body;
  assert.ok(calls.length === n || !en.ready, 'nothing is recorded twice');
});

test('粮仓搭子 reads a tag piece by piece; Zion’s account is the first one', async () => {
  const owner = await signIn('owner@example.com', '老陈');
  const tags = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data/items.json'), 'utf8'));
  const tag = tags[0].tags[0];
  const c = await call('/api/dazi', { body: groupBody({ kind: 'tag', plan: { tag, start: 1 } }), cookie: owner });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  const g = (await call(`/api/dazi/${c.body.id}`, { cookie: owner })).body.group;
  const first = (g.current || g.next).reading;
  assert.ok(first.links[0].url.startsWith('/'), 'links to the piece on this site');
  assert.equal((await call('/api/dazi', { body: groupBody({ kind: 'tag', plan: { tag: 'nope' } }), cookie: owner })).body.error, '请选一个标签');
  // a new database makes Zion's account first, as admin
  const sql = fakeSql();
  new Store({ storage: { sql } }, { ADMIN_EMAILS: 'light@zion4life.faith,zion.chen@hotmail.com' });
  assert.deepEqual(sql.exec('SELECT email, name FROM user').toArray(), [{ email: 'light@zion4life.faith', name: 'Zion' }]);
});

test('starting the database again keeps everything stored (the old-table cleanup drops nothing new)', () => {
  const sql = fakeSql();
  migrate(sql);
  OPS.audioStart(sql, { key: 'a:huxi/2026-10-12/zh', hash: 'h', parts: 3, now: 1 });
  OPS.subSet(sql, { uid: 'u', topic: 'huxi', on: true, now: 1 });
  OPS.msgAdd(sql, { id: 'm', scope: 'all', title: { zh: 't', en: 't' }, now: 1 });
  OPS.dzFileAdd(sql, { id: 'f', gid: 'g', uid: 'u', name: 'x.pdf', type: 'application/pdf', size: 1, now: 1 });
  migrate(sql);
  assert.equal(OPS.audioGet(sql, { key: 'a:huxi/2026-10-12/zh' }).parts, 3);
  assert.deepEqual(OPS.subsOf(sql, { uid: 'u' }), ['huxi']);
  assert.equal(OPS.msgsAll(sql, {}).length, 1);
  assert.equal(OPS.dzFiles(sql, { gid: 'g' }).length, 1);
});
