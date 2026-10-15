// 搭子: groups that read together at set times. The kinds (饭搭子, 呼吸搭子, 投喂搭子, 细嚼搭子,
// 晨兴搭子 …) are in src/kinds.js. Times are kept in the initiator's time zone and shown to
// everyone in their own: pages get the instants, emails use the reader's saved time zone.
// Everyone has an account. Joining is a covenant (立约): you read the terms and draw your
// signature. Public groups are on the plaza; strangers may join them directly when the
// initiator allows it, otherwise only through the invite link. Hidden groups are invite-only.
import { json, fail, str, randomId, readBody, rateOk, tr, pre, SITE } from './util.js';
import { currentUser, isAdmin, sameOrigin } from './auth.js';
import { siteData } from './content.js';
import { sendMail, layout } from './mail.js';
import {
  KINDS, VENUES, validTimeZone, localDate, addDays, sessionState, session, startedCount, totalSessions, readingFor,
  scheduleText, planText, sessionLabel, sessionsBetween, lateAfter, icsFeed, icsInvite, minutesText, weekStarts, planned, scheduleAt, attendsSession, attendanceWeek, daysText,
} from './schedule.js';
import { kindPlan, kindEdit, legsOf, withLeg, progressView, planWords } from './kinds.js';
import { addMsg } from './inbox.js';

const HOUR = 3600000;
const groupUrl = (g, lang, n) => `${SITE}${pre(lang)}/g/${g.id}${n ? `/${n}` : ''}`;
const inviteUrl = (g, lang) => `${SITE}${pre(lang)}/g/${g.id}?i=${g.invite}&pv=20261014`;
const colorOf = (uid) => [...uid].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 6;
// The first session that is not over yet (the initiator can change the plan from there on).
function firstOpen(g, now, ctx) {
  const c = startedCount(g, now, ctx);
  return c && session(g, c).end > now ? c : c + 1;
}
// The pieces of the tags that 粮仓搭子 read: the build's pieces and what the tag's managers
// posted, oldest first (ctx.tagItems, used by src/kinds.js).
export async function withTagItems(db, ctx, groups) {
  const tags = [...new Set(groups.filter((g) => g.kind === 'tag').flatMap((g) => legsOf(g).map((l) => l.plan.tag)).filter(Boolean))];
  const tagItems = { ...(ctx.tagItems || {}) };
  for (const tag of tags.filter((x) => !tagItems[x])) {
    const built = Object.values(ctx.item || {}).filter((i) => i.tags.includes(tag))
      .map((i) => ({ zh: i.zh, en: i.en, url: `/${i.key.replace(':', '/')}/`, at: Date.parse(i.date || '') || 0 }));
    const posts = (await db('postsByTag', { tag, limit: 500 })).map((x) => ({ zh: x.title, en: x.title, url: `/x/${x.id}/`, at: x.created }));
    tagItems[tag] = [...built, ...posts].sort((a, b) => a.at - b.at);
  }
  return tags.length ? { ...ctx, tagItems } : ctx;
}
const FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };
const FILE_MAX = 20 * 1000000, GROUP_FILES_MAX = 200 * 1000000;

// ---------- the "发起一个搭子" form ----------
export function validateGroup(b, now, lang, ctx = {}) {
  const t = tr(lang);
  if (!b || typeof b !== 'object') return t('内容不完整', 'Something is missing');
  const kind = b.kind;
  if (!KINDS[kind]) return t('请选一种搭子', 'Pick a kind of buddy group');
  const glang = b.lang === 'en' ? 'en' : 'zh';
  const title = str(b.title, 40);
  if (!title) return t('给搭子起个名字吧', 'Give the group a name');
  const intro = str(b.intro, 300);
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  if (!days.length) return t('请选每周哪几天', 'Pick the days of the week');
  const time = str(b.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return t('请填几点开始', 'Fill in the start time');
  const minutes = Number(b.minutes);
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) return t('请选每次多长时间', 'Pick how long each time is');
  // the initiator's phone sends its own time zone; there is nothing to pick
  const tzIn = str(b.tz, 64);
  const tz = tzIn && validTimeZone(tzIn) ? tzIn : 'Asia/Shanghai';
  const startDate = str(b.startDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) return t('请填从哪天开始', 'Fill in the start date');
  const today = localDate(tz, now);
  if (startDate < addDays(today, -7) || startDate > addDays(today, 366)) return t('开始日期要在一年之内', 'The start date must be within a year');
  const plan = kindPlan(kind, b.plan, t, ctx);
  if (typeof plan === 'string') return plan;
  const v = b.venue || {};
  if (!VENUES[v.type]) return t('请选在哪里见面', 'Pick where you meet');
  const venue = { type: v.type, info: str(v.info, 300) };
  const visibility = b.visibility === 'hidden' ? 'hidden' : 'public';
  const join = visibility === 'hidden' || b.join === 'invite' ? 'invite' : 'open';
  const max = Number(b.max);
  return { kind, lang: glang, title, intro, days, time, minutes, tz, startDate, plan, venue, visibility, join, max: Number.isInteger(max) && max >= 2 && max <= 12 ? max : 6 };
}
const validSig = (s) => typeof s === 'string' && s.length < 120000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);

// ---------- what pages see ----------
function sessionView(g, s, ctx) {
  if (!s) return null;
  return { n: s.n, date: s.date, start: s.start, end: s.end, reading: readingFor(g, s.n, ctx) };
}
// A group as the viewer may see it. Venue details and signatures are for members only.
function groupView(g, lang, ctx, viewer) {
  const st = sessionState(g, ctx.now, ctx);
  const member = viewer?.member;
  const at = (st.current || st.next || st.last)?.n || 1;
  return {
    id: g.id, kind: g.kind, lang: g.lang, title: g.title, intro: g.intro, status: g.status, visibility: g.visibility, join: g.join,
    schedule: scheduleAt(g, startedCount(g, ctx.now, ctx) + 1), attendanceWeek: attendanceWeek(g, ctx.now), minutes: scheduleAt(g, startedCount(g, ctx.now, ctx) + 1).minutes, startDate: g.startDate, first: session(g, 1).start, week: weekStarts(g, ctx.now, ctx), plan: g.plan, max: g.max,
    owner: g.members.find((m) => m.role === 'owner')?.name || '',
    planText: planText(g, lang, ctx, at),
    // what the initiator has already set to come later (接着读)
    later: legsOf(g).filter((l) => l.from > at).map((l) => ({ from: l.from, text: planWords(g.kind, l.plan, lang, ctx) })),
    venue: { type: g.venue.type, info: member ? g.venue.info : undefined },
    members: g.members.map((m) => ({ key: viewer?.owner ? m.uid : undefined, name: m.name, ids: m.ids, role: m.role, c: colorOf(m.uid), me: !!viewer?.uid && m.uid === viewer.uid, signed: member ? m.signed : undefined, sig: member ? m.sig : undefined })),
    total: st.total, done: st.done, finished: st.finished,
    current: sessionView(g, st.current, ctx), next: sessionView(g, st.next, ctx), last: sessionView(g, st.last, ctx),
  };
}
// The small card on the plaza and in "我的搭子".
function cardView(g, lang, ctx, uid) {
  const st = sessionState(g, ctx.now, ctx);
  const nx = st.current || st.next;
  return {
    id: g.id, kind: g.kind, lang: g.lang, title: g.title, join: g.join, visibility: g.visibility, status: g.status, max: g.max,
    minutes: scheduleAt(g, nx?.n || st.last?.n || 1).minutes, planText: planText(g, lang, ctx, nx?.n || st.last?.n || 1),
    seats: g.members.map((m) => ({ i: [...m.name][0] || '·', c: colorOf(m.uid), me: !!uid && m.uid === uid })),
    next: nx ? { n: nx.n, start: nx.start, live: !!st.current, reading: readingFor(g, nx.n, ctx)?.text || '' } : null,
    finished: st.finished, mine: !!uid && g.members.some((m) => m.uid === uid), myRole: g.myRole,
  };
}

// Attendance weekdays are in the member's own stored time zone, never the server's.
function attendanceChoice(b, g, user, t, now) {
  const tz = b.attendanceTz || user.tz || g.tz;
  if (!validTimeZone(tz)) return t('时区不正确，请刷新重试', 'Invalid time zone. Refresh and try again.');
  if (b.attendanceDays == null) return { attendanceDays: null, attendanceTz: tz };
  if (!Array.isArray(b.attendanceDays) || !b.attendanceDays.length || b.attendanceDays.length > 7 || b.attendanceDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return t('请至少选一个参加日', 'Select at least one attendance day.');
  const days = [...new Set(b.attendanceDays)].sort();
  const available = new Set(attendanceWeek(g, now).map((ms) => new Date(`${localDate(tz, ms)}T00:00:00Z`).getUTCDay()));
  if (days.some((d) => !available.has(d))) return t('请选择小组有聚会的日期，时间可能刚刚调整过，请刷新重试', 'Choose days when the group meets. Its schedule may have changed; refresh and try again.');
  return { attendanceDays: days, attendanceTz: tz };
}

// ---------- emails ----------
function covenantLines(g, L, ctx, tz) {
  const t = tr(L);
  return [
    t(`时间：${scheduleText(g, 'zh', tz, ctx.now, ctx)}`, `When: ${scheduleText(g, 'en', tz, ctx.now, ctx)}`),
    t(`读什么：${planText(g, 'zh', ctx, firstOpen(g, ctx.now, ctx))}`, `What: ${planText(g, 'en', ctx, firstOpen(g, ctx.now, ctx))}`),
    t(`在哪里见面：${VENUES[g.venue.type].zh}${g.venue.info ? `（${g.venue.info}）` : ''}`, `Where: ${VENUES[g.venue.type].en}${g.venue.info ? ` (${g.venue.info})` : ''}`),
  ];
}
function inviteFile(g, user, L, ctx, now) {
  const t = tr(L);
  const kindName = KINDS[g.kind][L];
  return {
    filename: 'invite.ics',
    type: 'text/calendar; charset=utf-8; method=REQUEST',
    content: icsInvite(g, {
      occurrences: user.attendanceDays || g.schedules?.length ? sessionsBetween(g, now - 86400000, now + 120 * 86400000, ctx).filter((s) => attendsSession(g, user, s)) : undefined,
      title: `${kindName}·${g.title}`,
      description: t(`打开这次要读的材料：${SITE}/g/${g.id}/now\n在哪里见面：${VENUES[g.venue.type].zh}${g.venue.info ? ` ${g.venue.info}` : ''}`,
        `Open this time's reading: ${SITE}/en/g/${g.id}/now\nWhere: ${VENUES[g.venue.type].en}${g.venue.info ? ` ${g.venue.info}` : ''}`),
      url: `${SITE}${pre(L)}/g/${g.id}/now`,
      organizer: { name: '有光 Light', email: 'light@zion4life.faith' },
      attendee: { name: user.name, email: user.email },
    }, now, ctx),
  };
}
async function mailCovenant(env, g, user, owner, ctx, now) {
  const L = user.lang || 'zh';
  const t = tr(L);
  const { html, text } = layout({
    lang: L,
    title: owner ? t(`「${g.title}」建好了`, `"${g.title}" is ready`) : t(`你和「${g.title}」立约了`, `You made a covenant with "${g.title}"`),
    lines: [
      owner ? t('把邀请链接发给朋友，他们打开、签名，就立约加入了：', 'Send the invite link to friends. They open it, sign, and they are in:') : '',
      owner ? inviteUrl(g, L) : '',
      ...covenantLines(g, L, { ...ctx, now }, user.tz || g.tz),
      user.attendanceDays ? t(`我参加：${daysText(user.attendanceDays, 'zh')}（${user.attendanceTz}）`, `My days: ${daysText(user.attendanceDays, 'en')} (${user.attendanceTz})`) : '',
      t('附件是日历邀请，点“加入日历”，每次开始时手机会提醒你，点开提醒就能看到这次要读的材料。', 'The attachment is a calendar invitation. Add it, and your phone will remind you each time, with a link to that time’s reading.'),
    ],
    button: { label: t('打开搭子', 'Open the group'), url: groupUrl(g, L) },
  });
  await sendMail(env, { to: user.email, subject: owner ? t(`「${g.title}」建好了`, `"${g.title}" is ready`) : t(`立约：${g.title}`, `Covenant: ${g.title}`), html, text, attachments: [inviteFile(g, user, L, ctx, now)] });
}
async function mailOwner(env, db, g, zh, en) {
  const owner = await db('userById', { id: g.owner });
  if (!owner) return;
  const L = owner.lang || 'zh';
  const { html, text } = layout({ lang: L, title: L === 'en' ? en : zh, lines: [], button: { label: L === 'en' ? 'Open the group' : '打开搭子', url: groupUrl(g, L) } });
  await sendMail(env, { to: owner.email, subject: L === 'en' ? en : zh, html, text });
}

// ---------- reminders: every 5 minutes, email members as each session starts ----------
export async function runReminders(env, now = Date.now(), url = new URL(SITE)) {
  const { store } = await import('./store.js');
  const db = store(env);
  await db('prune', { day: new Date(now - 2 * 86400000).toISOString().slice(0, 10), now });
  const groups = await db('dzActive', {});
  const ctx = await withTagItems(db, { ...(await siteData(env, url)), now }, groups);
  let sent = 0;
  for (const g of groups) {
    for (const s of sessionsBetween(g, now - 4 * 60000, now + 6 * 60000, ctx)) {
      if (!(await db('dzSentClaim', { gid: g.id, n: s.n, now })).ok) continue;
      const r = readingFor(g, s.n, ctx);
      for (const u of await db('dzMailList', { gid: g.id })) {
        if (!attendsSession(g, u, s)) continue;
        const L = u.lang || 'zh';
        const t = tr(L);
        const { html, text } = layout({
          lang: L,
          title: t(`${g.title}：现在开始`, `${g.title}: starting now`),
          lines: [
            t(`第 ${s.n} 次，${sessionLabel(g, s, 'zh', u.tz || g.tz)}，${minutesText((s.end-s.start)/60000, 'zh')}。`, `Time ${s.n}, ${sessionLabel(g, s, 'en', u.tz || g.tz)}, ${minutesText((s.end-s.start)/60000, 'en')}.`),
            t(`这次读：${r.full}`, `This time: ${r.full}`),
            t(`在哪里见面：${VENUES[g.venue.type].zh}`, `Where: ${VENUES[g.venue.type].en}`),
            t('读完回来点“打卡”，也可以写几句心得。', 'When you finish, come back to check in and jot a few notes.'),
          ],
          button: { label: t('打开这次的材料', 'Open this time’s reading'), url: groupUrl(g, L, s.n) },
          footer: t('不想收到这个搭子的邮件？打开搭子，在“设置”里关掉提醒。', 'No more emails from this group? Open it and turn reminders off in Settings.'),
        });
        await sendMail(env, { to: u.email, subject: t(`【有光】${KINDS[g.kind].zh}·${r.full}`, `[Light] ${KINDS[g.kind].en}: ${r.full}`), html, text });
        sent++;
      }
    }
  }
  return { groups: groups.length, sent };
}

// ---------- calendar feeds ----------
function sessionEvents(g, L, ctx, from, to, member) {
  return sessionsBetween(g, from, to, ctx).filter((s) => attendsSession(g, member, s)).map((s) => {
    const r = readingFor(g, s.n, ctx);
    const url = groupUrl(g, L, s.n);
    return {
      sequence: Math.floor((g.schedules?.at(-1)?.changed || 0) / 1000), uid: `dazi-${g.id}-${s.n}`, start: s.start, end: s.end,
      title: `${KINDS[g.kind][L]}·${r.text}`,
      description: L === 'en' ? `${g.title}\nWhere: ${VENUES[g.venue.type].en}\nOpen the reading: ${url}` : `${g.title}\n在哪里见面：${VENUES[g.venue.type].zh}\n打开这次的材料：${url}`,
      url,
    };
  });
}
const icsResponse = (body, name) => new Response(body, {
  headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="${name}.ics"`, 'Cache-Control': 'no-store' },
});

// ---------- routes ----------
export async function handleDazi(request, env, db, url, now, lang) {
  const t = tr(lang);
  const p = url.pathname;
  const method = request.method;
  const data = await siteData(env, url);
  let ctx = { ...data, now };
  let m;

  // personal calendar feed: /api/cal/<key>.ics (subscribed by phone calendars, no cookie)
  if ((m = p.match(/^\/api\/cal\/([A-Za-z0-9_-]{20,40})\.ics$/)) && method === 'GET') {
    const u = await db('userByCal', { cal: m[1] });
    if (!u) return new Response('Not found', { status: 404 });
    const L = url.searchParams.get('lang') === 'en' ? 'en' : u.lang || 'zh';
    const events = [];
    const mineAll = await db('dzMine', { uid: u.id });
    ctx = await withTagItems(db, ctx, mineAll);
    for (const g of mineAll) {
      if (g.status === 'active') events.push(...sessionEvents(g, L, ctx, now - 7 * 86400000, now + 62 * 86400000, g.members.find((m) => m.uid === u.id)));
    }
    return icsResponse(icsFeed(L === 'en' ? 'Light · buddies' : '有光·搭子', events.slice(0, 600), now), 'youguang');
  }

  const user = await currentUser(db, request);
  if (method === 'POST' && !sameOrigin(request, url)) return fail('Forbidden', 403);

  if (p === '/api/dazi/plaza' && method === 'GET') {
    const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : undefined;
    const [list, plazaCount] = await Promise.all([db('dzPlaza', { kind }), db('dzPlazaCount', { kind })]);
    ctx = await withTagItems(db, ctx, list);
    return json({ ok: true, groups: list.map((g) => cardView(g, lang, ctx, user?.id)), count: plazaCount, latestPublished: Math.max(0,...list.map(g => Number(g.created)||0)), feedCount: data.feedCount });
  }
  if (p === '/api/dazi/mine' && method === 'GET') {
    if (!user) return json({ ok: true, groups: [] });
    const list = await db('dzMine', { uid: user.id });
    ctx = await withTagItems(db, ctx, list);
    return json({ ok: true, groups: list.map((g) => cardView(g, lang, ctx, user.id)) });
  }

  if (p === '/api/dazi' && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const b = (await readBody(request, 150000)) || {};
    const g = validateGroup(b, now, lang, ctx);
    if (typeof g === 'string') return fail(g);
    if (!validSig(b.sig)) return fail(t('请在约上签个名', 'Please sign the covenant'));
    if (!(await rateOk(db, request, 'dz-create', 6, now, user.id))) return fail(t('今天发起的搭子太多了，明天再试', 'That is a lot of groups for one day. Please try again tomorrow.'), 429);
    g.id = randomId(8);
    g.invite = randomId(6);
    g.owner = user.id;
    await db('dzCreate', { g, sig: b.sig, now });
    const full = await db('dzGet', { id: g.id });
    await mailCovenant(env, full, user, true, ctx, now);
    return json({ ok: true, id: g.id });
  }

  if (!(m = p.match(/^\/api\/dazi\/([a-z0-9]{8})(?:\/([a-z]+)(?:\/(\d{1,5}|[a-z0-9]{8,10})(?:\/([a-z]+))?)?)?$/))) return null;
  const [, gid, action = '', arg, sub] = m;
  const admin = isAdmin(env, user);
  const g = await db('dzGet', { id: gid, withSig: true });
  if (!g || (g.status === 'removed' && !admin)) return fail(t('这个搭子不存在，或者已经撤下了', 'This group does not exist or was taken down'), 404);
  ctx = await withTagItems(db, ctx, [g]);
  const mem = user ? g.members.find((x) => x.uid === user.id) : null;
  const isOwner = mem?.role === 'owner';
  const invite = url.searchParams.get('i') || '';
  const viewer = { uid: user?.id, member: !!mem || admin, owner: isOwner || admin };

  // the group page
  if (action === '' && method === 'GET') {
    const inviteOk = invite === g.invite;
    if (g.visibility === 'hidden' && !mem && !inviteOk && !admin) {
      return json({ ok: true, needInvite: true, group: { id: g.id, kind: g.kind, title: g.title, owner: g.members.find((x) => x.role === 'owner')?.name || '' } });
    }
    const out = { ok: true, group: groupView(g, lang, ctx, viewer), inviteOk, signedIn: !!user, me: null };
    if (mem) {
      out.me = { role: mem.role, notify: mem.notify, cal: user.cal, attendanceDays: mem.attendanceDays, attendanceTz: mem.attendanceTz };
      out.invite = inviteUrl(g, lang);
      out.myChecks = (await db('dzMyChecks', { gid: g.id, uid: user.id })).map((c) => ({ n: c.n, done: c.done, late: c.late }));
      out.checkMax = startedCount(g, now + 2 * HOUR, ctx);
      // the latest sessions that had something to read, newest first
      out.recent = [];
      for (let n = out.checkMax; n >= 1 && out.recent.length < 12 && out.checkMax - n < 400; n--) {
        const r = planned(g, n, ctx) ? readingFor(g, n, ctx) : null;
        if (r) out.recent.push({ n, text: r.text, start: session(g, n).start });
      }
      out.files = await db('dzFiles', { gid: g.id });
      if (isOwner || admin) {
        out.declined = await db('dzDeclined', { gid: g.id });
        out.progress = progressView(g, firstOpen(g, now, ctx), lang, ctx);
      }
    } else if (user) {
      const row = await db('dzMember', { gid: g.id, uid: user.id });
      out.me = row ? { status: row.status } : null;
    }
    out.canJoin = !mem && g.status === 'active' && g.members.length < g.max && (inviteOk || (g.visibility === 'public' && g.join === 'open'));
    return json(out);
  }

  // calendar file of this group's coming sessions (to import into any calendar app)
  if (action === 'ics' && method === 'GET') {
    if (g.visibility === 'hidden' && !mem && invite !== g.invite) return fail('Not found', 404);
    const L = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
    return icsResponse(icsFeed(`${KINDS[g.kind][L]}·${g.title}`, sessionEvents(g, L, ctx, now - 86400000, now + 120 * 86400000, mem), now), `youguang-${g.id}`);
  }

  // /g/<id>/now: whichever session is on now, or the next one
  if (action === 'now' && method === 'GET') {
    const st = sessionState(g, now + 2 * HOUR, ctx);
    return json({ ok: true, n: (st.last || st.next)?.n || 1 });
  }

  // 立约: join with a signature
  if (action === 'join' && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const b = (await readBody(request, 150000)) || {};
    if (g.status !== 'active') return fail(t('这个搭子已经结束了', 'This group has ended'));
    const inviteOk = str(b.invite, 12) === g.invite;
    if (!inviteOk && !(g.visibility === 'public' && g.join === 'open')) return fail(t('这个搭子只接受邀请', 'This group is by invitation only'), 403);
    if (!validSig(b.sig)) return fail(t('请在约上签个名', 'Please sign the covenant'));
    if (!(await rateOk(db, request, 'dz-join', 30, now, user.id))) return fail(t('今天操作太多了，明天再试', 'Too many tries today. Please try again tomorrow.'), 429);
    const choice = attendanceChoice(b, g, user, t, now);
    if (typeof choice === 'string') return fail(choice);
    const r = await db('dzJoin', { gid: g.id, uid: user.id, sig: b.sig, ...choice, now });
    if (!r.ok) {
      return fail({
        exists: t('你已经在这个搭子里了', 'You are already in this group'),
        full: t('人已经满了', 'The group is full'),
        removed: t('你不能再加入这个搭子', 'You cannot join this group again'),
      }[r.reason]);
    }
    await mailCovenant(env, g, { ...user, ...choice }, false, ctx, now);
    await mailOwner(env, db, g, `${user.name} 和「${g.title}」立约了`, `${user.name} joined "${g.title}"`);
    return json({ ok: true });
  }
  if (action === 'decline' && method === 'POST') {
    const b = (await readBody(request, 5000)) || {};
    if (str(b.invite, 12) !== g.invite) return fail(t('邀请链接不对', 'The invite link is not right'), 403);
    if (!(await rateOk(db, request, 'dz-decline', 20, now))) return fail(t('稍后再试', 'Please try again later'), 429);
    const r = await db('dzDecline', { gid: g.id, uid: user?.id, name: str(b.name, 20), now });
    if (!r.ok) return fail(t('你已经在这个搭子里了', 'You are already in this group'));
    await mailOwner(env, db, g, `${user?.name || str(b.name, 20) || '有一位朋友'}婉拒了「${g.title}」的邀请`, `${user?.name || str(b.name, 20) || 'Someone'} declined the invitation to "${g.title}"`);
    return json({ ok: true });
  }

  // everything below is for members
  if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
  if (!mem && !admin) return fail(t('立约以后才能看', 'Join the group to see this'), 403);

  // one session: the reading, my bookmarks / notes / check-in, and everyone's check-ins
  if (action === 's' && /^\d+$/.test(arg || '')) {
    const n = Number(arg);
    const total = totalSessions(g, ctx);
    if (n < 1 || (total && n > total)) return fail(t('没有这一次', 'There is no such time'), 404);
    if (!planned(g, n, ctx)) return fail(t('这一次没有安排读的', 'Nothing was planned for this time'), 404);
    const s = session(g, n);
    if (method === 'GET') {
      const checks = await db('dzChecks', { gid: g.id, from: n, to: n });
      const names = Object.fromEntries(g.members.map((x) => [x.uid, x]));
      return json({
        ok: true,
        group: { id: g.id, kind: g.kind, lang: g.lang, title: g.title, venue: g.venue, total, owner: isOwner },
        session: sessionView(g, s, ctx), open: s.start <= now + 2 * HOUR,
        mine: checks.find((c) => c.uid === user.id) || null,
        others: g.members.map((x) => {
          const c = checks.find((y) => y.uid === x.uid);
          return { name: x.name, c: colorOf(x.uid), me: x.uid === user.id, done: c?.done || null, late: !!c?.late, note: c?.note || '' };
        }),
        hasPrev: n > 1, hasNext: !total || n < total,
        files: (await db('dzFiles', { gid: g.id })).length,
      });
    }
    if (method === 'POST') {
      if (!mem) return fail(t('立约以后才能打卡', 'Join the group to check in'), 403);
      const b = (await readBody(request, 30000)) || {};
      const upd = { gid: g.id, uid: user.id, n, now };
      if (b.done !== undefined) {
        if (s.start > now + 2 * HOUR) return fail(t('还没到这一次的时间', 'This time has not come yet'));
        upd.done = b.done ? now : null;
        upd.late = !!b.done && now > lateAfter(s);
      }
      if (b.note !== undefined) upd.note = str(b.note, 3000);
      if (b.marks !== undefined) upd.marks = (Array.isArray(b.marks) ? b.marks : []).map((x) => str(String(x), 40)).filter(Boolean).slice(0, 60);
      await db('dzCheckPut', upd);
      return json({ ok: true, late: !!upd.late });
    }
  }

  // the initiator's table: who checked in for which session
  if (action === 'stats' && method === 'GET') {
    if (!isOwner && !admin) return fail(t('只有发起人能看统计', 'Only the initiator can see this'), 403);
    const done = startedCount(g, now, ctx);
    const from = Math.max(1, done - 39);
    const checks = await db('dzChecks', { gid: g.id, from, to: Math.max(done, 1) });
    const sessions = [];
    for (let n = from; n <= done; n++) if (planned(g, n, ctx)) sessions.push({ n, date: session(g, n).date });
    const rowsOut = g.members.map((x) => {
      const cells = sessions.map((s) => {
        const c = checks.find((y) => y.uid === x.uid && y.n === s.n);
        return c?.done ? (c.late ? 'late' : 'on') : null;
      });
      // sessions since joining, plus any earlier ones made up later
      const joined = localDate(g.tz, x.joined);
      const counted = sessions.filter((s, i) => x.role === 'owner' || s.date >= joined || cells[i]).length;
      return { name: x.name, c: colorOf(x.uid), cells, done: cells.filter(Boolean).length, of: counted };
    });
    return json({ ok: true, sessions, rows: rowsOut });
  }

  // message board
  if (action === 'board') {
    if (method === 'GET') {
      const list = await db('dzBoard', { gid: g.id });
      return json({ ok: true, posts: list.map((x) => ({ id: x.id, name: x.name, body: x.body, created: x.created, mine: x.uid === user.id, c: colorOf(x.uid) })), canDelete: isOwner || admin });
    }
    if (method === 'POST' && !arg) {
      const b = (await readBody(request, 10000)) || {};
      const body = str(b.body, 1000);
      if (!body) return fail(t('先写点什么吧。', 'Write something first.'));
      if (!(await rateOk(db, request, 'dz-board', 80, now, user.id))) return fail(t('今天发得太多了', 'Too many today'), 429);
      await db('dzBoardAdd', { id: randomId(10), gid: g.id, uid: user.id, body, now });
      return json({ ok: true });
    }
    if (method === 'POST' && arg && sub === 'delete') {
      const list = await db('dzBoard', { gid: g.id });
      const post = list.find((x) => x.id === arg);
      if (!post) return fail(t('找不到这条', 'Not found'), 404);
      if (!(post.uid === user.id || isOwner || admin)) return fail(t('不能删除', 'You cannot remove this'), 403);
      await db('dzBoardDel', { id: arg, gid: g.id });
      return json({ ok: true });
    }
  }

  // 资料: PDFs and pictures the initiator puts in the group
  if (action === 'files') {
    if (method === 'GET' && !arg) return json({ ok: true, files: await db('dzFiles', { gid: g.id }) });
    if (method === 'GET' && arg) {
      const f = await db('dzFileGet', { gid: g.id, id: arg });
      const r = f && (await db.get(`f:${f.id}`));
      if (!r) return fail(t('找不到这个资料', 'File not found'), 404);
      return new Response(r.body, { headers: {
        'Content-Type': f.type, 'Content-Length': String(f.size), 'Cache-Control': 'private, max-age=86400',
        'Content-Disposition': `${url.searchParams.get('dl') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      } });
    }
    if (!isOwner && !admin) return fail(t('只有发起人可以放资料', 'Only the initiator can add files'), 403);
    if (method === 'POST' && arg && sub === 'delete') {
      await db('dzFileDel', { gid: g.id, id: arg });
      return json({ ok: true });
    }
    if (method === 'POST' && !arg) {
      const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!FILE_TYPES[type]) return fail(t('只能放 PDF 或图片', 'Only PDFs and pictures'));
      const size = Number(request.headers.get('content-length') || 0);
      if (size > FILE_MAX) return fail(t('文件太大了，最多 20MB', 'The file is too big (20 MB at most)'), 413);
      if ((await db('dzFilesSize', { gid: g.id })).bytes + size > GROUP_FILES_MAX) return fail(t('这个搭子的资料已经放满了（200MB），先删掉一些', 'This group’s files are full (200 MB). Remove some first.'), 413);
      if (!(await rateOk(db, request, 'dz-file', 60, now, user.id))) return fail(t('今天放的资料太多了', 'Too many files today'), 429);
      const buf = await request.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > FILE_MAX) return fail(t('文件太大了，最多 20MB', 'The file is too big (20 MB at most)'), 413);
      const name = (str(url.searchParams.get('name'), 120).replace(/[\\/<>:"|?*]/g, '') || `file.${FILE_TYPES[type]}`);
      const id = randomId(10);
      await db.put(`f:${id}`, buf);
      await db('dzFileAdd', { id, gid: g.id, uid: user.id, name, type, size: buf.byteLength, now });
      await addMsg(db, { scope: `g:${g.id}`, now,
        title: { zh: `「${g.title}」有新资料`, en: `New file in "${g.title}"` }, body: { zh: name, en: name }, url: `/g/${g.id}?tab=files` });
      return json({ ok: true, id });
    }
  }

  if (method !== 'POST') return fail('Not found', 404);
  const b = (await readBody(request, 20000)) || {};

  if (action === 'attendance') {
    if (!mem) return fail(t('只有组员可以修改自己的参加日', 'Only members can change their attendance days'), 403);
    const choice = attendanceChoice(b, g, user, t, now);
    if (typeof choice === 'string') return fail(choice);
    await db('dzAttendance', { gid: g.id, uid: user.id, days: choice.attendanceDays, tz: choice.attendanceTz });
    return json({ ok: true });
  }
  if (action === 'notify') {
    await db('dzNotify', { gid: g.id, uid: user.id, on: !!b.on });
    return json({ ok: true });
  }
  if (action === 'leave') {
    if (isOwner) return fail(t('发起人不能退出，可以结束这个搭子', 'The initiator cannot leave, but can end the group'));
    await db('dzSetMember', { gid: g.id, uid: user.id, status: 'left' });
    return json({ ok: true });
  }

  // the initiator's settings
  if (action === 'manage') {
    if (!isOwner && !admin) return fail(t('只有发起人可以改', 'Only the initiator can change this'), 403);
    if (b.action === 'schedule') {
      const from = startedCount(g, now, ctx) + 1;
      if (totalSessions(g, ctx) && from > totalSessions(g, ctx)) return fail(t('本计划已经结束，请先设置接下来要读的进度', 'This plan has ended. Set the next reading plan first.'));
      const days = b.days;
      if (!Array.isArray(days) || !days.length || days.length > 7 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return fail(t('请选择聚会日期', 'Choose meeting weekdays.'));
      const tz = b.tz || g.tz, time = b.time, minutes = Number(b.minutes);
      if (!validTimeZone(tz) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') || (!Number.isInteger(minutes) || minutes < 10 || minutes > 180)) return fail(t('请检查开始时间和时长', 'Check the start time and duration.'));
      const date = b.startDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < localDate(tz, now) || date > addDays(localDate(tz, now), 366)) return fail(t('请选择今天或以后的生效日期', 'Choose today or a later effective date.'));
      const leg = { from, changed: Math.max(now, ...((g.schedules || []).map((x) => (x.changed || 0) + 1000))), days: [...new Set(days)].sort(), time, minutes, tz, startDate: date };
      const schedules = [...(g.schedules || []).filter((x) => x.from < from), leg];
      const next = session({ ...g, schedules }, from);
      if (next.start <= now || (from > 1 && next.start < session(g, from - 1).end)) return fail(t('新时间须晚于现在和上一次聚会结束时间', 'The new meeting must start after now and the previous meeting ends.'));
      await db('dzUpdate', { id: g.id, schedules });
      const updated = { ...g, schedules };
      await addMsg(db, { scope: `g:${g.id}`, now,
        title: { zh: `「${g.title}」聚会时间已调整`, en: `Meeting time changed: ${g.title}` },
        body: { zh: `从第 ${from} 次起：${scheduleText(updated, 'zh', tz, now, ctx)}。请查看日历和自己的参加日。`, en: `From session ${from}: ${scheduleText(updated, 'en', tz, now, ctx)}. Review your calendar and attendance days.` }, url: `/g/${g.id}?tab=set` });
      return json({ ok: true, from });
    }
    // 调整进度 / 接着读: from session `from` on, read `plan` (same kind)
    if (b.action === 'progress') {
      const open = firstOpen(g, now, ctx);
      const from = Number(b.from);
      if (!Number.isInteger(from) || from < open || from > open + 1000) return fail(t('只能改还没开始或正在进行的那几次', 'Only times that are not over yet can be changed'));
      const plan = kindPlan(g.kind, b.plan, t, ctx);
      if (typeof plan === 'string') return fail(plan);
      await db('dzUpdate', { id: g.id, ...withLeg(g, from, plan) });
      const when = session(g, from).date;
      await addMsg(db, { scope: `g:${g.id}`, now,
        title: { zh: `「${g.title}」调整了进度`, en: `"${g.title}": the reading plan changed` },
        body: { zh: `从第 ${from} 次（${when}）起：${planWords(g.kind, plan, 'zh', ctx)}`, en: `From time ${from} (${when}): ${planWords(g.kind, plan, 'en', ctx)}` },
        url: `/g/${g.id}` });
      return json({ ok: true });
    }
    if (b.action === 'close' || b.action === 'reopen') {
      await db('dzUpdate', { id: g.id, status: b.action === 'close' ? 'closed' : 'active' });
      return json({ ok: true });
    }
    if (b.action === 'remove') {
      const who = g.members.find((x) => x.role !== 'owner' && x.uid === str(b.key, 12));
      if (!who) return fail(t('找不到这个人', 'Member not found'));
      await db('dzSetMember', { gid: g.id, uid: who.uid, status: 'removed' });
      return json({ ok: true });
    }
    if (b.action === 'update') {
      const upd = { id: g.id };
      if (b.title !== undefined) {
        upd.title = str(b.title, 40);
        if (!upd.title) return fail(t('名字不能空着', 'The name cannot be empty'));
      }
      if (b.intro !== undefined) upd.intro = str(b.intro, 300);
      if (b.venue !== undefined) {
        if (!VENUES[b.venue?.type]) return fail(t('请选在哪里见面', 'Pick where you meet'));
        upd.venue = { type: b.venue.type, info: str(b.venue.info, 300) };
      }
      if (b.max !== undefined) {
        const max = Number(b.max);
        if (!Number.isInteger(max) || max < Math.max(2, g.members.length) || max > 12) return fail(t('人数不能少于现在的人数', 'The size cannot be below the current number of members'));
        upd.max = max;
      }
      if (b.visibility !== undefined) {
        upd.visibility = b.visibility === 'hidden' ? 'hidden' : 'public';
        upd.join = upd.visibility === 'hidden' || b.join === 'invite' ? 'invite' : 'open';
      }
      if (b.plan && typeof b.plan === 'object') {
        const plan = kindEdit(g, b.plan, t);
        if (typeof plan === 'string') return fail(plan);
        upd.plan = plan;
      }
      await db('dzUpdate', upd);
      return json({ ok: true });
    }
  }
  return fail('Not found', 404);
}
