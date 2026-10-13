// 我的 → 消息, and subscriptions.
//   Messages go to everyone (Zion's announcements), to one person, to the subscribers of a tag
//   or of 呼吸, or to a group's members (progress changed, new files).
//   /api/inbox  GET  the signed-in person's messages (opening it marks them read)
//   /api/subs   GET  what they subscribed to · POST { topic: 'tag:<id>' | 'huxi', on }
// The cron calls announce(): pieces new on the site go to their tags' subscribers, and each
// day's 呼吸 to the 呼吸 subscribers, once.
import { json, fail, str, randomId, readBody, tr } from './util.js';
import { currentUser, sameOrigin } from './auth.js';
import { siteData } from './content.js';

export async function addMsg(db, { scope, title, body = { zh: '', en: '' }, url = '', author = null, now = Date.now() }) {
  return db('msgAdd', { id: randomId(12), scope, title, body, url, author, now });
}
const topicOk = (data, topic) => topic === 'huxi' || (topic.startsWith('tag:') && !!data.tag[topic.slice(4)]);

export async function handleInbox(request, env, db, url, now, lang) {
  const t = tr(lang);
  const p = url.pathname;
  const user = await currentUser(db, request);
  if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
  if (request.method === 'POST' && !sameOrigin(request, url)) return fail('Forbidden', 403);
  if (p === '/api/inbox' && request.method === 'GET') {
    const r = await db('inbox', { uid: user.id });
    await db('inboxSeen', { uid: user.id, now });
    return json({ ok: true, seen: r.seen, list: r.list });
  }
  if (p === '/api/subs' && request.method === 'GET') return json({ ok: true, topics: await db('subsOf', { uid: user.id }) });
  if (p === '/api/subs' && request.method === 'POST') {
    const b = (await readBody(request, 2000)) || {};
    const topic = str(b.topic, 60);
    if (!topicOk(await siteData(env, url), topic)) return fail(t('没有这个栏目', 'Nothing to subscribe to here'));
    await db('subSet', { uid: user.id, topic, on: !!b.on, now });
    return json({ ok: true, topics: await db('subsOf', { uid: user.id }) });
  }
  return null;
}

// Pieces and 呼吸 days that are new on the site → messages for their subscribers.
// The first run only records what is there already.
export async function announce(env, db, url, now = Date.now()) {
  const data = await siteData(env, url);
  let days = [];
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/data/huxi.json', url)));
    if (r.ok) days = await r.json();
  } catch { /* the site is being deployed */ }
  // a 呼吸 day goes out as soon as it is on the site, whatever its date and wherever people are
  const items = Object.values(data.item || {});
  const keys = [...items.map((i) => `i:${i.key}`), ...days.map((d) => `h:${d.date}`)];
  if (!keys.length) return { sent: 0 };
  const { fresh } = await db('announce', { keys, now });
  let sent = 0;
  for (const k of fresh) {
    if (k.startsWith('i:')) {
      const it = data.item[k.slice(2)];
      for (const tag of it.tags.filter((x) => data.tag[x])) {
        const name = data.tag[tag];
        await addMsg(db, { scope: `tag:${tag}`, now, url: `/${it.key.replace(':', '/')}/`,
          title: { zh: `「${name.zh}」有新内容`, en: `New in “${name.en}”` }, body: { zh: it.zh, en: it.en } });
        sent++;
      }
    } else {
      const d = days.find((x) => `h:${x.date}` === k);
      const [, m, day] = d.date.split('-').map(Number);
      const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      await addMsg(db, { scope: 'huxi', now, url: `/huxi/${d.date}/`,
        title: { zh: `新的呼吸：${m}月${day}日`, en: `New Breathe: ${MON[m - 1]} ${day}` }, body: { zh: d.zh.title, en: d.en.title } });
      sent++;
    }
  }
  return { sent };
}
