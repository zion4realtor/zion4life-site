// /api/* router.
//   /api/me, /api/auth/*                  accounts (auth.js)
//   /api/talk, /api/claims, /api/posts    留言, claims and tag managers' posts (content.js)
//   /api/dazi/*, /api/cal/*               搭子 groups and calendar feeds (dazi.js)
//   /api/inbox, /api/subs                 我的 → 消息, subscriptions (inbox.js)
//   /api/audio/*                          the 呼吸 recordings (audio.js)
//   /api/ask                              有问题想问 box
//   /api/admin/*                          Zion's management page
import { store } from './store.js';
import { json, fail, str, readBody, rateOk, langOf, tr, isEmail } from './util.js';
import { handleAuth, currentUser, isAdmin, sameOrigin } from './auth.js';
import { handleContent, siteData } from './content.js';
import { handleDazi, runReminders as dazReminders } from './dazi.js';
import { handleInbox, addMsg, announce } from './inbox.js';
import { handleAudio, makeAudio } from './audio.js';
import { sendAsk } from './mail.js';
import { KINDS } from './schedule.js';

// The cron, every 5 minutes: 搭子 reminders, new pieces for subscribers, 呼吸 recordings.
export async function runReminders(env, now = Date.now(), url = new URL('https://zion4life.faith')) {
  const out = await dazReminders(env, now, url);
  const db = store(env);
  try { out.announced = (await announce(env, db, url, now)).sent; } catch (e) { console.error('[announce]', e?.stack || e); }
  try { out.audio = await makeAudio(env, db, url, now); } catch (e) { console.error('[audio]', e?.stack || e); }
  return out;
}

export async function handleApi(request, env, url, now = Date.now()) {
  const db = store(env);
  const p = url.pathname;
  const lang = langOf(request);
  const t = tr(lang);

  if (p === '/api/me' || p.startsWith('/api/auth/')) return handleAuth(request, env, db, url, now, lang);
  if (p.startsWith('/api/talk') || p === '/api/claims' || p.startsWith('/api/posts')) return handleContent(request, env, db, url, now, lang);
  if (p.startsWith('/api/dazi') || p.startsWith('/api/cal/')) return handleDazi(request, env, db, url, now, lang);
  if (p === '/api/inbox' || p === '/api/subs') return handleInbox(request, env, db, url, now, lang);
  if (p.startsWith('/api/audio/')) return handleAudio(request, env, db, url, now);

  // 有问题想问？ Stored first (so nothing is lost), then emailed to Zion when mail is set up.
  if (p === '/api/ask' && request.method === 'POST') {
    if (!sameOrigin(request, url)) return fail('Forbidden', 403);
    const b = await readBody(request, 20000);
    if (!b || b.website) return fail(t('内容不完整', 'Something is missing'));
    const message = str(b.message, 3000);
    if (!message) return fail(t('先写下你想问的。', 'Write your question first.'));
    const user = await currentUser(db, request);
    let reply = str(b.reply, 120);
    if (reply && !isEmail(reply)) return fail(t('回信邮箱好像不对，可以不填。', 'That email looks wrong. You can leave it empty.'));
    if (!reply && user) reply = user.email;
    if (!(await rateOk(db, request, 'ask', 10, now))) return fail(t('今天发得太多了，明天再试。', 'Too many today. Please try again tomorrow.'), 429);
    const ask = { message, name: str(b.name, 40) || user?.name || '', reply, lang, page: str(b.page, 200) };
    const { id } = await db('askAdd', { ...ask, now });
    if (await sendAsk(env, ask)) await db('askMailed', { id });
    return json({ ok: true });
  }

  if (p.startsWith('/api/admin/')) return adminRoute(request, env, db, url, now);
  return null;
}

// Zion's page: questions, claims, tag managers, groups, 留言, posts, accounts.
async function adminRoute(request, env, db, url, now) {
  const p = url.pathname;
  const user = await currentUser(db, request);
  if (!isAdmin(env, user)) return fail(user ? '这个账号不是管理员' : '请先登录', user ? 403 : 401);
  if (request.method === 'POST' && !sameOrigin(request, url)) return fail('Forbidden', 403);
  let m;

  if (p === '/api/admin/overview' && request.method === 'GET') {
    const data = await siteData(env, url);
    const [asks, claims, managers, groups, talk, posts, users, count, sent] = await Promise.all([
      db('asks', {}), db('claims', {}), db('mgrList', {}), db('dzAll', {}), db('talkRecent', {}), db('postsAll', {}), db('adminPeople', { now }), db('userCount', {}),
      db('msgsAll', {}),
    ]);
    return json({
      ok: true,
      tags: data.tags.map((x) => ({ id: x.id, zh: x.zh, en: x.en, person: !!x.person })),
      asks, claims: claims.map((c) => ({ id: c.id, tag: c.tag, note: c.note, name: c.name, email: c.email, ids: c.ids, created: c.created })),
      managers: managers.map((x) => ({ tag: x.tag, uid: x.uid, name: x.name, email: x.email })),
      groups: groups.map((g) => ({
        id: g.id, kind: g.kind, kindLabel: KINDS[g.kind].zh, lang: g.lang, title: g.title, visibility: g.visibility, join: g.join, status: g.status,
        members: g.members.length, max: g.max, owner: g.members.find((x) => x.role === 'owner')?.name || '', created: g.created,
        days: g.days, time: g.time, minutes: g.minutes, tz: g.tz, startDate: g.startDate,
        people: g.members.map((x) => ({ uid: x.uid, name: x.name, role: x.role, joined: x.joined })),
      })),
      talk, posts,
      // Zion's own page: full emails, for the admin only
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, ids: u.ids, idsPublic: u.idsPublic, lang: u.lang, tz: u.tz, country: u.country,
        created: u.created, seen: u.seen, groups: u.groups, subs: u.subs, manages: u.manages, checks: u.checks, devices: u.devices })), userCount: count.n,
      sent: sent.map((x) => ({ id: x.id, title: x.title_zh, body: x.body_zh, created: x.created })),
    });
  }
  if (request.method !== 'POST') return fail('Not found', 404);
  const b = (await readBody(request, 40000)) || {};

  // a message to every account (我的 → 消息); English is optional
  if (p === '/api/admin/broadcast') {
    const title = { zh: str(b.title, 80), en: str(b.titleEn, 120) };
    const body = { zh: str(b.body, 3000), en: str(b.bodyEn, 4000) };
    if (!title.zh || !body.zh) return fail('请写标题和内容');
    const link = str(b.url, 300);
    if (link && !/^(https:\/\/\S+|\/\S*)$/.test(link)) return fail('链接要以 https:// 或 / 开头');
    await addMsg(db, { scope: 'all', title, body, url: link, author: user.id, now });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/admin\/claims\/([a-z0-9]{10})$/))) {
    const r = await db('claimSet', { id: m[1], status: b.status === 'approved' ? 'approved' : 'declined', now });
    return r.ok ? json({ ok: true }) : fail('这个申请已经处理过了');
  }
  if (p === '/api/admin/managers') {
    const data = await siteData(env, url);
    const tag = str(b.tag, 40);
    if (!data.tag[tag]) return fail('没有这个标签');
    const u = await db('userByEmail', { email: str(b.email, 120).toLowerCase() });
    if (!u) return fail('这个邮箱还没有注册。请对方先在网站上注册，再来添加。');
    await db('mgrAdd', { tag, uid: u.id, now });
    return json({ ok: true });
  }
  if (p === '/api/admin/managers/delete') {
    await db('mgrDel', { tag: str(b.tag, 40), uid: str(b.uid, 12) });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/admin\/dazi\/([a-z0-9]{8})$/))) {
    if (!['active', 'closed', 'removed'].includes(b.status)) return fail('状态不对');
    await db('dzUpdate', { id: m[1], status: b.status });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/admin\/talk\/([a-z0-9]{10})\/hide$/))) {
    await db('talkStatus', { id: m[1], status: 'hidden' });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/admin\/posts\/([a-z0-9]{10})$/))) {
    await db('postStatus', { id: m[1], status: b.status === 'live' ? 'live' : 'removed' });
    return json({ ok: true });
  }
  return fail('Not found', 404);
}
