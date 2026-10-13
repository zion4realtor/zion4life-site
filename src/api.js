// /api/* for the plaza and groups (广场 / 读经小组 / 祷告小组 / 喂养小组).
//
// Who is who: nobody has a password. Joining gives the phone a sign-in token (kept in
// the browser; only its hash is stored). Each member also has a mail key that lives in
// the links of their emails ("专属链接"); opening such a link signs that phone in too.
// Contacts (email / phone) are only used for reminders and are never sent to a page.
import { store } from './store.js';
import {
  KINDS, validTimeZone, sessionState, session, startedCount, scheduleText, planText, tzLabel,
  icsCalendar, sessionsBetween, sessionLabel, localDate, addDays, minutesText,
} from './schedule.js';
import { BOOKS } from './bible.js';
import { sendMail, layout } from './mail.js';

export const SITE = 'https://zion4life.faith';
const HOUR = 3600000;
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomId(n) {
  const out = [];
  while (out.length < n) {
    for (const x of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (x < 248 && out.length < n) out.push(ALPHA[x % 31]);
    }
  }
  return out.join('');
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function hash(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}
function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (error, status = 400) => json({ ok: false, error }, status);
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max) : '');

export function parseContact(v) {
  const s = str(v, 120).replace(/\s+/g, '');
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s)) return { contact: s.toLowerCase(), contactType: 'email' };
  const digits = s.replace(/[-().]/g, '');
  if (/^\+?\d{7,15}$/.test(digits)) return { contact: digits, contactType: 'phone' };
  return null;
}

// Validate the "发起小组" form. Returns the group fields, or an error message.
export function validateGroup(b, now) {
  if (!b || typeof b !== 'object') return '内容不完整';
  const kind = b.kind;
  if (!KINDS[kind]) return '请选择小组类型';
  const title = str(b.title, 40);
  if (!title) return '请给小组起个名字';
  const intro = str(b.intro, 300);
  const days = Array.isArray(b.days)
    ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (!days.length) return '请选择每周哪几天';
  const time = str(b.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return '请填写几点开始';
  const minutes = Number(b.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return '请选择每次多长时间';
  const tz = str(b.tz, 64);
  if (!validTimeZone(tz)) return '请选择时区';
  const startDate = str(b.startDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) return '请填写从哪天开始';
  const today = localDate(tz, now);
  if (startDate < addDays(today, -7) || startDate > addDays(today, 366)) return '开始日期要在一年之内';
  let plan;
  if (kind === 'read') {
    const book = Number(b.plan?.book), chapter = Number(b.plan?.chapter || 1), per = Number(b.plan?.per || 1);
    if (!Number.isInteger(book) || book < 1 || book > 66) return '请选择要读哪一卷';
    const bk = BOOKS[book - 1];
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > bk.chapters) return `${bk.name}一共${bk.chapters}章`;
    if (!Number.isInteger(per) || per < 1 || per > 10) return '请选择每次读几章';
    plan = { book, chapter, per, cont: !!b.plan?.cont };
  } else {
    const material = str(b.plan?.material, 300);
    const link = str(b.plan?.link, 300);
    if (link && !/^https?:\/\/\S+$/.test(link)) return '材料链接要以 http:// 或 https:// 开头';
    plan = { material, link };
  }
  const max = Number(b.max);
  return {
    kind, title, intro, days, time, minutes, tz, startDate, plan,
    visibility: b.visibility === 'invite' ? 'invite' : 'public',
    joinMode: b.joinMode === 'approve' ? 'approve' : 'open',
    max: Number.isInteger(max) && max >= 2 && max <= 500 ? max : null,
  };
}

const sessionView = (s) => s && { n: s.n, date: s.date, start: s.start, end: s.end, reading: s.reading, link: s.link };
export function groupView(g, now) {
  const st = sessionState(g, now);
  return {
    id: g.id, kind: g.kind, kindLabel: KINDS[g.kind], title: g.title, intro: g.intro, ownerName: g.ownerName,
    visibility: g.visibility, joinMode: g.joinMode, status: g.status, tz: g.tz, tzLabel: tzLabel(g.tz), days: g.days,
    time: g.time, minutes: g.minutes, startDate: g.startDate, plan: g.plan, max: g.max, memberCount: g.memberCount,
    scheduleText: scheduleText(g), planText: planText(g), total: st.total, done: st.done,
    current: sessionView(st.current), next: sessionView(st.next), finished: st.finished,
  };
}
const groupUrl = (gid) => `${SITE}/g/${gid}`;
const keyLink = (m) => `${SITE}/g/${m.gid}?k=${m.id}.${m.mail_key}`;
const muteLink = (m) => `${SITE}/api/mute?k=${m.id}.${m.mail_key}`;
const ipOf = (request) => request.headers.get('cf-connecting-ip') || 'local';

async function rateOk(db, request, kind, perDay, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const who = (await hash(`${ipOf(request)}|${day}|zion4life`)).slice(0, 20);
  return (await db('bump', { day, who, kind, perDay })).ok;
}
async function readBody(request, max = 2_000_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) return null;
  const text = await request.text();
  if (text.length > max) return null;
  try { return JSON.parse(text); } catch { return null; }
}
// The signed-in member of this group, or null.
async function currentMember(db, request, gid) {
  const token = request.headers.get('x-member');
  if (!token || token.length > 100) return null;
  const m = await db('memberByToken', { token: await hash(token) });
  return m && m.gid === gid && (m.status === 'active' || m.status === 'pending') ? m : null;
}
async function newDevice(db, mid) {
  const token = randomToken();
  await db('addDevice', { token: await hash(token), mid });
  return token;
}

// ---------- emails ----------
async function welcomeMail(env, g, m, pending) {
  if (m.contact_type !== 'email') return;
  const lines = pending
    ? [`你申请加入「${g.title}」，正在等发起人${g.ownerName ? ` ${g.ownerName} ` : ''}同意。同意后会发邮件告诉你。`]
    : [
      m.role === 'owner' ? `「${g.title}」建好了。把邀请链接发给朋友，他们点开就能立约加入。` : `你已经加入「${g.title}」。`,
      `时间：${scheduleText(g)}`,
      g.kind === 'read' ? `计划：${planText(g)}` : g.plan.material ? `内容：${g.plan.material}` : '',
      '附件是小组的日历，打开就能把每次的时间加进手机日历，到时候会提醒你。',
    ].filter(Boolean);
  lines.push('下面是你的专属链接，换了手机也能用它打开小组、打卡。请不要转发给别人。');
  if (m.role === 'owner') lines.push(`邀请链接（可以转发）：${groupUrl(g.id)}?i=${g.invite}`);
  const { html, text } = layout({
    title: pending ? '申请已经发出' : m.role === 'owner' ? '小组建好了' : '欢迎加入小组',
    lines,
    button: { label: '打开小组', url: keyLink(m) },
    footer: `不想再收到这个小组的邮件？<a href="${muteLink(m)}" style="color:#687176">关闭邮件提醒</a>`,
  });
  const attachments = pending ? undefined : [{
    filename: 'group.ics',
    content: base64(new TextEncoder().encode(icsCalendar(g, groupUrl(g.id), Date.now()))),
  }];
  await sendMail(env, { to: m.contact, subject: pending ? `申请加入「${g.title}」` : `「${g.title}」${m.role === 'owner' ? '建好了' : '欢迎你'}`, html, text, attachments });
}
async function ownerMail(env, db, g, title, lines) {
  const o = await db('owner', { gid: g.id });
  if (!o || o.contact_type !== 'email' || !o.notify) return;
  const { html, text } = layout({ title, lines, button: { label: '打开小组', url: keyLink(o) } });
  await sendMail(env, { to: o.contact, subject: `${title}｜${g.title}`, html, text });
}

// ---------- reminders (cron) ----------
// Each session gets one email to every member with email reminders on, 5–20 minutes ahead.
export async function runReminders(env, now = Date.now()) {
  const db = store(env);
  await db('prune', { day: new Date(now - 2 * 86400000).toISOString().slice(0, 10) });
  const groups = await db('remindable', {});
  let sent = 0;
  for (const g of groups) {
    for (const s of sessionsBetween(g, now + 5 * 60000, now + 20 * 60000)) {
      if (!(await db('claimReminder', { gid: g.id, n: s.n })).ok) continue;
      for (const m of await db('emailMembers', { gid: g.id })) {
        const lines = [`${sessionLabel(g, s)}开始，第${s.n}次，每次${minutesText(g.minutes)}。`];
        if (s.reading) lines.push(g.kind === 'read' ? `今天读：${s.reading}` : `这次的内容：${s.reading}`);
        if (s.link) lines.push(`经文：${s.link}`);
        lines.push('读完回到小组点“读完了”打卡，也可以写几句心得。');
        const { html, text } = layout({
          title: `${g.title} 快开始了`,
          lines,
          button: { label: g.kind === 'read' ? '打开今天的经文' : '打开小组', url: keyLink(m) },
          footer: `不想再收到这个小组的邮件？<a href="${muteLink(m)}" style="color:#687176">关闭邮件提醒</a>`,
        });
        await sendMail(env, { to: m.contact, subject: `【${g.title}】${s.reading || '快开始了'}`, html, text });
        sent++;
      }
    }
  }
  return { groups: groups.length, sent };
}

// ---------- routes ----------
export async function handleApi(request, env, url, now = Date.now()) {
  const db = store(env);
  const p = url.pathname;
  const method = request.method;
  let m;

  if (p === '/api/plaza' && method === 'GET') {
    const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : undefined;
    const list = await db('plaza', { kind });
    return json({ ok: true, groups: list.map((g) => groupView(g, now)) });
  }

  if (p === '/api/mine' && method === 'POST') {
    const b = await readBody(request, 20000);
    const tokens = Array.isArray(b?.tokens) ? b.tokens.filter((t) => typeof t === 'string' && t.length < 100).slice(0, 30) : [];
    const hashes = await Promise.all(tokens.map(hash));
    const list = await db('mine', { tokens: hashes });
    return json({ ok: true, groups: list.map((g) => ({ ...groupView(g, now), myRole: g.myRole, myStatus: g.myStatus })) });
  }

  if (p === '/api/groups' && method === 'POST') {
    const b = await readBody(request, 20000);
    if (!b || b.website) return fail('内容不完整');
    const g = validateGroup(b, now);
    if (typeof g === 'string') return fail(g);
    const name = str(b.name, 20);
    if (!name) return fail('请填写你的称呼');
    const c = parseContact(b.contact);
    if (!c) return fail('请填写正确的邮箱或手机号');
    if (!b.covenant) return fail('请勾选立约');
    if (!(await rateOk(db, request, 'create', 5, now))) return fail('今天发起的小组太多了，明天再试', 429);
    g.id = randomId(8);
    g.invite = randomId(6);
    const token = randomToken();
    const owner = { id: randomId(10), name, ...c, token: await hash(token), mailKey: randomId(16) };
    await db('createGroup', { g, owner, now });
    const full = await db('group', { id: g.id });
    await welcomeMail(env, full, { id: owner.id, gid: g.id, contact: owner.contact, contact_type: owner.contactType, mail_key: owner.mailKey, role: 'owner' }, false);
    return json({ ok: true, id: g.id, token });
  }

  if ((m = p.match(/^\/api\/groups\/([a-z0-9]{8})(?:\/([a-z]+))?$/))) {
    const [, gid, action] = m;
    const g = await db('group', { id: gid });
    if (!g || g.status === 'hidden') return fail('这个小组不存在，或者已经撤下了', 404);
    return groupRoute(request, env, db, g, action || '', url, now);
  }

  if ((m = p.match(/^\/api\/audio\/([a-z0-9]{12})$/)) && method === 'GET') {
    const a = await db('audioGet', { id: m[1] });
    const t = url.searchParams.get('t') || '';
    const me = t && t.length < 100 ? await db('memberByToken', { token: await hash(t) }) : null;
    if (!a || !me || me.gid !== a.gid || me.status !== 'active') return new Response('Not found', { status: 404 });
    const bytes = Uint8Array.from(atob(a.data), (ch) => ch.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=86400' } });
  }

  if (p === '/api/mute' && method === 'GET') {
    const [mid, key] = (url.searchParams.get('k') || '').split('.');
    const mem = mid && key ? await db('memberByKey', { mid, key }) : null;
    if (mem) await db('setNotify', { mid: mem.id, notify: false });
    const body = mem
      ? `<p>已经关闭这个小组的邮件提醒。</p><p><a href="/g/${mem.gid}">回到小组</a>，可以随时重新打开。</p>`
      : '<p>链接不对，或者已经失效。</p>';
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邮件提醒</title><body style="font:17px/1.8 -apple-system,'PingFang SC',sans-serif;padding:40px 24px;max-width:520px;margin:auto">${body}</body>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (p.startsWith('/api/admin/')) return adminRoute(request, env, db, p, now);
  return null;
}

async function groupRoute(request, env, db, g, action, url, now) {
  const method = request.method;

  // Group page data
  if (action === '' && method === 'GET') {
    const me = await currentMember(db, request, g.id);
    const invite = url.searchParams.get('i') || '';
    const inviteOk = invite === g.invite;
    const view = groupView(g, now);
    if (g.visibility === 'invite' && !me && !inviteOk) {
      return json({ ok: true, needInvite: true, group: { id: g.id, kind: g.kind, kindLabel: view.kindLabel, title: g.title, ownerName: g.ownerName, status: g.status } });
    }
    const out = { ok: true, group: view, inviteOk, me: null };
    if (me) {
      out.me = { id: me.id, name: me.name, role: me.role, status: me.status, notify: !!me.notify, contactType: me.contact_type, link: keyLink(me) };
    }
    if (me?.status === 'active') {
      out.invite = `${groupUrl(g.id)}?i=${g.invite}`;
      out.members = await db('members', { gid: g.id, withPending: me.role === 'owner' });
      out.checkinMax = startedCount(g, now + 2 * HOUR);
      out.checkinSessions = [];
      for (let n = out.checkinMax; n >= Math.max(1, out.checkinMax - 13); n--) out.checkinSessions.push(sessionView(session(g, n)));
      const list = await db('checkins', { gid: g.id, fromN: Math.max(1, out.checkinMax - 40) });
      const byN = new Map();
      for (const c of list) {
        if (!byN.has(c.n)) {
          const s = session(g, c.n);
          byN.set(c.n, { n: c.n, date: s.date, start: s.start, reading: s.reading, checkins: [] });
        }
        byN.get(c.n).checkins.push({ mid: c.mid, name: c.name, text: c.text, audio: c.audio, created: c.created });
      }
      out.records = [...byN.values()];
    } else {
      out.counts = await db('checkinCounts', { gid: g.id });
    }
    return json(out);
  }

  // Calendar file for the phone's calendar app
  if (action === 'calendar' && method === 'GET') {
    return new Response(icsCalendar(g, groupUrl(g.id), now), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="zion4life-${g.id}.ics"`, 'Cache-Control': 'no-store' },
    });
  }

  if (method !== 'POST') return fail('Method not allowed', 405);
  const b = (await readBody(request)) || {};

  // Sign this phone in from an email link (?k=member.key)
  if (action === 'claim') {
    const [mid, key] = String(b.k || '').split('.');
    if (!(await rateOk(db, request, 'claim', 30, now))) return fail('稍后再试', 429);
    const mem = mid && key ? await db('memberByKey', { mid, key }) : null;
    if (!mem || mem.gid !== g.id || !['active', 'pending'].includes(mem.status)) return fail('这个链接已经失效了');
    return json({ ok: true, token: await newDevice(db, mem.id) });
  }

  // 立约加入 / 申请加入
  if (action === 'join') {
    if (b.website) return fail('内容不完整');
    if (g.status !== 'active') return fail('这个小组已经结束了');
    const inviteOk = b.invite === g.invite;
    if (g.visibility === 'invite' && !inviteOk) return fail('这个小组只能通过邀请链接加入');
    const name = str(b.name, 20);
    if (!name) return fail('请填写你的称呼');
    const c = parseContact(b.contact);
    if (!c) return fail('请填写正确的邮箱或手机号');
    if (!b.covenant) return fail('请勾选立约');
    if (!(await rateOk(db, request, 'join', 20, now))) return fail('今天操作太多了，明天再试', 429);
    const status = inviteOk || g.joinMode === 'open' ? 'active' : 'pending';
    const token = randomToken();
    const mem = { id: randomId(10), name, ...c, note: str(b.note, 200), token: await hash(token), mailKey: randomId(16) };
    const r = await db('join', { gid: g.id, m: mem, status, now });
    if (!r.ok && r.reason === 'full') return fail('小组人数已经满了');
    if (!r.ok && r.reason === 'exists') {
      const old = await db('memberByContact', { gid: g.id, contact: c.contact });
      if (old?.contact_type === 'email') {
        const { html, text } = layout({ title: `你已经在「${g.title}」里了`, lines: ['用下面的专属链接打开小组就可以。'], button: { label: '打开小组', url: keyLink(old) } });
        await sendMail(env, { to: old.contact, subject: `你的专属链接｜${g.title}`, html, text });
        return fail('这个邮箱已经在小组里了。专属链接已经重新发到你的邮箱，用它打开就可以。');
      }
      return fail('这个手机号已经在小组里了。请在加入时用的那部手机上打开小组。');
    }
    const row = { id: mem.id, gid: g.id, contact: mem.contact, contact_type: mem.contactType, mail_key: mem.mailKey, role: 'member' };
    await welcomeMail(env, g, row, status === 'pending');
    if (status === 'pending') await ownerMail(env, db, g, '有人申请加入', [`${name} 申请加入「${g.title}」。`, mem.note ? `留言：${mem.note}` : ''].filter(Boolean));
    return json({ ok: true, status, token });
  }

  const me = await currentMember(db, request, g.id);
  if (!me) return fail('请先加入小组', 403);

  // 打卡
  if (action === 'checkin') {
    if (me.status !== 'active') return fail('发起人同意之后才能打卡', 403);
    const n = Number(b.n);
    const max = startedCount(g, now + 2 * HOUR);
    if (!Number.isInteger(n) || n < 1) return fail('请选择是哪一次');
    if (n > max) return fail('还没到这一次的时间');
    const text = str(b.text, 2000);
    if (!(await rateOk(db, request, 'checkin', 80, now))) return fail('今天操作太多了，明天再试', 429);
    let audio = null;
    if (b.audio?.data) {
      const mime = String(b.audio.mime || '').split(';')[0];
      if (!/^audio\/(webm|mp4|ogg|mpeg|aac|x-m4a|wav)$/.test(mime)) return fail('这种录音格式不支持');
      if (typeof b.audio.data !== 'string' || b.audio.data.length > 1_400_000 || !/^[A-Za-z0-9+/=]+$/.test(b.audio.data)) return fail('录音太长了，请控制在两分钟以内');
      audio = randomId(12);
      await db('audioPut', { id: audio, gid: g.id, mid: me.id, mime, data: b.audio.data, now });
    }
    await db('checkin', { gid: g.id, mid: me.id, n, text, audio, now });
    return json({ ok: true });
  }

  // 自己的设置
  if (action === 'notify') {
    await db('setNotify', { mid: me.id, notify: !!b.on });
    return json({ ok: true });
  }
  if (action === 'leave') {
    if (me.role === 'owner') return fail('发起人不能退出，可以结束小组');
    await db('setMember', { gid: g.id, mid: me.id, status: 'left' });
    return json({ ok: true });
  }

  // 发起人管理
  if (action === 'manage') {
    if (me.role !== 'owner') return fail('只有发起人可以管理小组', 403);
    const act = b.action;
    if (act === 'approve' || act === 'decline' || act === 'remove') {
      const status = { approve: 'active', decline: 'declined', remove: 'removed' }[act];
      const r = await db('setMember', { gid: g.id, mid: String(b.mid || ''), status });
      if (!r.ok) return fail(r.reason === 'full' ? '小组人数已经满了' : '找不到这个人');
      if (act === 'approve' && r.member.contact_type === 'email') {
        const { html, text } = layout({
          title: `你已经加入「${g.title}」`,
          lines: [`${g.ownerName || '发起人'}同意了你的申请。`, `时间：${scheduleText(g)}`, '打开小组可以把时间加进手机日历。'],
          button: { label: '打开小组', url: keyLink(r.member) },
        });
        await sendMail(env, { to: r.member.contact, subject: `已加入「${g.title}」`, html, text });
      }
      return json({ ok: true });
    }
    if (act === 'close' || act === 'reopen') {
      await db('setGroupStatus', { id: g.id, status: act === 'close' ? 'closed' : 'active' });
      return json({ ok: true });
    }
    if (act === 'material') {
      const material = str(b.material, 300);
      const link = str(b.link, 300);
      if (link && !/^https?:\/\/\S+$/.test(link)) return fail('链接要以 http:// 或 https:// 开头');
      const r = await db('setMaterial', { id: g.id, material, link });
      return r.ok ? json({ ok: true }) : fail('读经小组的计划不能改');
    }
    return fail('不认识的操作');
  }
  return fail('Not found', 404);
}

// Site owner: take groups off the plaza (header X-Admin = ADMIN_KEY secret).
async function adminRoute(request, env, db, p, now) {
  const key = request.headers.get('x-admin') || '';
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return fail('需要管理密码', 403);
  if (p === '/api/admin/groups' && request.method === 'GET') {
    const list = await db('allGroups', {});
    return json({ ok: true, groups: list.map((g) => groupView(g, now)) });
  }
  const m = p.match(/^\/api\/admin\/groups\/([a-z0-9]{8})$/);
  if (m && request.method === 'POST') {
    const b = (await readBody(request, 2000)) || {};
    if (!['active', 'hidden', 'closed'].includes(b.status)) return fail('状态不对');
    await db('setGroupStatus', { id: m[1], status: b.status });
    return json({ ok: true });
  }
  return fail('Not found', 404);
}
