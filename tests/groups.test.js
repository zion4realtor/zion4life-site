// Plaza and groups: schedule math, the API end to end, reminders.
// The Durable Object's SQL runs on node:sqlite; Resend is mocked.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { Store } from '../src/store.js';
import { BOOKS, TOTAL_CHAPTERS } from '../src/bible.js';
import { zonedTime, session, startedCount, sessionState, totalSessions, readingFor, icsCalendar, scheduleText, sessionsBetween } from '../src/schedule.js';
import { runReminders } from '../src/api.js';

function fakeSql() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(q, ...b) {
      const st = db.prepare(q);
      const out = /^\s*select/i.test(q) ? st.all(...b).map((r) => ({ ...r })) : (st.run(...b), []);
      return { toArray: () => out };
    },
  };
}
function makeEnv(extra = {}) {
  const s = new Store({ storage: { sql: fakeSql() } });
  return {
    STORE: { idFromName: () => 'main', get: () => ({ fetch: (url, init) => s.fetch(new Request(url, init)) }) },
    ASSETS: { fetch: async () => new Response('<html><head><title>小组｜Zion4Life</title><meta property="og:title" content="小组"></head></html>', { headers: { 'Content-Type': 'text/html' } }) },
    ...extra,
  };
}
let env, mails;
beforeEach(() => {
  env = makeEnv({ RESEND_API_KEY: 'k', FROM_EMAIL_ADDRESS: 'Zion4Life <hello@mail.zion4life.faith>' });
  mails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com')) {
      mails.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});
async function call(path, { method = 'GET', body, token, ip = '1.1.1.1' } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Member'] = token;
  const r = await worker.fetch(new Request(`https://zion4life.faith${path}`, { method, headers, body: body && JSON.stringify(body) }), env);
  const type = r.headers.get('content-type') || '';
  return { status: r.status, body: type.includes('json') ? await r.json() : await r.text(), headers: r.headers };
}
const READ = {
  kind: 'read', title: '一起读约翰福音', intro: '每周二四晚上', days: [2, 4], time: '20:00', minutes: 30,
  tz: 'Asia/Shanghai', startDate: '2026-10-13', plan: { book: 43, chapter: 1, per: 1, cont: false },
  visibility: 'public', joinMode: 'approve', max: 5, name: '老陈', contact: 'Owner@Example.com', covenant: true,
};

test('bible: 66 books, 1,189 chapters', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(TOTAL_CHAPTERS, 1189);
});

test('schedule: sessions, time zones, reading plan', () => {
  const g = { ...READ, id: 'abcdefgh', days: [2, 4] };
  // 2026-10-13 is a Tuesday; 20:00 Beijing = 12:00 UTC
  assert.equal(new Date(zonedTime('2026-10-13', '20:00', 'Asia/Shanghai')).toISOString(), '2026-10-13T12:00:00.000Z');
  // New York across the DST change (Nov 1 2026): 20:00 EDT = 00:00Z, 20:00 EST = 01:00Z
  assert.equal(new Date(zonedTime('2026-10-31', '20:00', 'America/New_York')).toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(new Date(zonedTime('2026-11-02', '20:00', 'America/New_York')).toISOString(), '2026-11-03T01:00:00.000Z');
  assert.equal(session(g, 1).date, '2026-10-13');
  assert.equal(session(g, 2).date, '2026-10-15');
  assert.equal(session(g, 3).date, '2026-10-20');
  assert.equal(session(g, 3).reading, '约翰福音 第3章');
  assert.equal(totalSessions(g), 21);
  const before = Date.parse('2026-10-13T11:59:00Z');
  assert.equal(startedCount(g, before), 0);
  assert.equal(startedCount(g, Date.parse('2026-10-13T12:00:00Z')), 1);
  assert.equal(startedCount(g, Date.parse('2026-10-21T00:00:00Z')), 3);
  const st = sessionState(g, Date.parse('2026-10-13T12:10:00Z'));
  assert.equal(st.current.n, 1);
  assert.equal(st.next.n, 2);
  assert.equal(startedCount(g, Date.parse('2027-06-01T00:00:00Z')), 21, 'capped at the plan length');
  assert.ok(sessionState(g, Date.parse('2027-06-01T00:00:00Z')).finished);
  assert.equal(scheduleText(g), '每周二、四 20:00（北京时间），每次30分钟');
  // two chapters a session, carrying on into Acts
  const g2 = { ...g, plan: { book: 43, chapter: 21, per: 2, cont: true } };
  assert.equal(readingFor(g2, 1).text, '约翰福音 第21章、使徒行传 第1章');
  assert.equal(readingFor(g2, 2).text, '使徒行传 第2–3章');
  // a start date that is not a meeting day
  const g3 = { ...g, startDate: '2026-10-14' };
  assert.equal(session(g3, 1).date, '2026-10-15');
  // the sessions starting in a window
  assert.deepEqual(sessionsBetween(g, Date.parse('2026-10-13T00:00:00Z'), Date.parse('2026-10-16T00:00:00Z')).map((s) => s.n), [1, 2]);
});

test('calendar file: one event per remaining session, folded lines, reminders', () => {
  const g = { ...READ, id: 'abcdefgh' };
  const ics = icsCalendar(g, 'https://zion4life.faith/g/abcdefgh', Date.parse('2026-10-01T00:00:00Z'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 21);
  assert.match(ics, /DTSTART:20261013T120000Z/);
  assert.match(ics, /TRIGGER:-PT10M/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('create, plaza, apply, approve, check in, records', async () => {
  const created = await call('/api/groups', { method: 'POST', body: READ });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const { id, token: owner } = created.body;
  assert.match(id, /^[a-z0-9]{8}$/);
  assert.equal(mails.length, 1, 'owner welcome email');
  assert.match(mails[0].html, /\/g\/[a-z0-9]{8}\?k=/);
  assert.ok(mails[0].attachments[0].content.length > 100, 'calendar attached');

  const plaza = await call('/api/plaza?kind=read');
  assert.equal(plaza.body.groups.length, 1);
  assert.equal(plaza.body.groups[0].ownerName, '老陈');
  assert.equal(plaza.body.groups[0].invite, undefined, 'invite code is not public');
  assert.ok(!JSON.stringify(plaza.body).includes('example.com'), 'contacts never leave the server');

  // a stranger applies (approval needed)
  const applied = await call(`/api/groups/${id}/join`, { method: 'POST', body: { name: '小李', contact: '13800138000', note: '想一起读', covenant: true }, ip: '2.2.2.2' });
  assert.equal(applied.body.status, 'pending');
  const li = applied.body.token;
  let view = await call(`/api/groups/${id}`, { token: li });
  assert.equal(view.body.me.status, 'pending');
  assert.equal(view.body.records, undefined, 'pending members do not see the records');
  assert.ok(mails.some((m) => m.subject.includes('有人申请加入')), 'owner told about the application');

  // owner approves
  view = await call(`/api/groups/${id}`, { token: owner });
  const pending = view.body.members.find((x) => x.status === 'pending');
  assert.equal(pending.note, '想一起读');
  assert.ok(!JSON.stringify(view.body.members).includes('13800138000'));
  const ok = await call(`/api/groups/${id}/manage`, { method: 'POST', token: owner, body: { action: 'approve', mid: pending.id } });
  assert.equal(ok.body.ok, true);

  // someone with the invite link joins directly
  const inv = view.body.invite.split('?i=')[1];
  const joined = await call(`/api/groups/${id}/join`, { method: 'POST', body: { name: '王姊妹', contact: 'wang@example.com', covenant: true, invite: inv }, ip: '3.3.3.3' });
  assert.equal(joined.body.status, 'active');
  // the same email again is refused, and the link is re-sent
  const again = await call(`/api/groups/${id}/join`, { method: 'POST', body: { name: '王', contact: 'WANG@example.com', covenant: true, invite: inv }, ip: '3.3.3.3' });
  assert.equal(again.body.ok, false);
  assert.ok(mails.some((m) => m.subject.startsWith('你的专属链接')));

  // check in before the first session: refused; after it starts: fine
  const early = await call(`/api/groups/${id}/checkin`, { method: 'POST', token: li, body: { n: 5, text: '…' } });
  assert.equal(early.body.ok, false);
  // backdate: move the start so session 1 has begun
  const r = await call(`/api/groups/${id}`, { token: li });
  assert.equal(r.body.me.status, 'active');
});

test('check-ins, voice notes and members-only records', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const body = { ...READ, startDate: today, days: [0, 1, 2, 3, 4, 5, 6], time: '00:00', tz: 'UTC', joinMode: 'open' };
  const { id, token: owner } = (await call('/api/groups', { method: 'POST', body })).body;
  const mate = (await call(`/api/groups/${id}/join`, { method: 'POST', body: { name: '小李', contact: 'li@example.com', covenant: true }, ip: '4.4.4.4' })).body.token;
  const audio = Buffer.from('fake audio bytes').toString('base64');
  const c = await call(`/api/groups/${id}/checkin`, { method: 'POST', token: mate, body: { n: 1, text: '神爱世人', audio: { mime: 'audio/webm;codecs=opus', data: audio } } });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  const v = await call(`/api/groups/${id}`, { token: owner });
  const rec = v.body.records.find((x) => x.n === 1);
  assert.equal(rec.reading, '约翰福音 第1章');
  assert.equal(rec.checkins[0].text, '神爱世人');
  const a = await call(`/api/audio/${rec.checkins[0].audio}?t=${encodeURIComponent(owner)}`);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('content-type'), 'audio/webm');
  const stranger = await call(`/api/audio/${rec.checkins[0].audio}?t=nope`);
  assert.equal(stranger.status, 404);
  const outside = await call(`/api/groups/${id}`);
  assert.equal(outside.body.records, undefined);
  assert.equal(outside.body.counts[0].count, 1);
});

test('invite-only groups are not on the plaza and need the link', async () => {
  const { id } = (await call('/api/groups', { method: 'POST', body: { ...READ, visibility: 'invite', kind: 'pray', plan: { material: '为家人祷告' } } })).body;
  assert.equal((await call('/api/plaza')).body.groups.length, 0);
  const v = await call(`/api/groups/${id}`);
  assert.equal(v.body.needInvite, true);
  const j = await call(`/api/groups/${id}/join`, { method: 'POST', body: { name: 'x', contact: 'x@example.com', covenant: true } });
  assert.equal(j.body.ok, false);
});

test('email link signs a new phone in; mute link turns reminders off', async () => {
  const { id } = (await call('/api/groups', { method: 'POST', body: READ })).body;
  const link = mails[0].html.match(/\/g\/[a-z0-9]{8}\?k=([a-z0-9]+\.[a-z0-9]+)/)[1];
  const claimed = await call(`/api/groups/${id}/claim`, { method: 'POST', body: { k: link } });
  assert.ok(claimed.body.token);
  const v = await call(`/api/groups/${id}`, { token: claimed.body.token });
  assert.equal(v.body.me.role, 'owner');
  const bad = await call(`/api/groups/${id}/claim`, { method: 'POST', body: { k: link.replace(/.$/, 'x') } });
  assert.equal(bad.body.ok, false);
  const mute = await call(`/api/mute?k=${link}`);
  assert.match(mute.body, /已经关闭/);
});

test('reminders go out once per session, 5–20 minutes ahead', async () => {
  const now = Date.now();
  const start = new Date(now + 12 * 60000);
  const pad = (x) => String(x).padStart(2, '0');
  const body = {
    ...READ, tz: 'UTC', days: [start.getUTCDay()], time: `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}`,
    startDate: start.toISOString().slice(0, 10),
  };
  await call('/api/groups', { method: 'POST', body });
  mails = [];
  const r1 = await runReminders(env, now);
  assert.equal(r1.sent, 1);
  assert.match(mails[0].subject, /约翰福音 第1章/);
  assert.match(mails[0].html, /\?k=/);
  const r2 = await runReminders(env, now + 60000);
  assert.equal(r2.sent, 0, 'not twice');
});

test('group page shell carries the group name for link previews', async () => {
  const { id } = (await call('/api/groups', { method: 'POST', body: READ })).body;
  const page = await call(`/g/${id}`);
  assert.match(page.body, /<title>一起读约翰福音｜老陈邀请你加入饭搭子<\/title>/);
});

test('validation messages', async () => {
  const bad = await call('/api/groups', { method: 'POST', body: { ...READ, days: [] } });
  assert.equal(bad.body.error, '请选择每周哪几天');
  const ch = await call('/api/groups', { method: 'POST', body: { ...READ, plan: { book: 43, chapter: 30, per: 1 } } });
  assert.equal(ch.body.error, '约翰福音一共21章');
  const noCov = await call('/api/groups', { method: 'POST', body: { ...READ, covenant: false } });
  assert.equal(noCov.body.error, '请勾选立约');
});
