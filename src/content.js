// 留言, tag managers, "this is me" claims, and posts written by tag managers.
import { json, fail, str, randomId, readBody, rateOk, tr } from './util.js';
import { currentUser, isAdmin, sameOrigin } from './auth.js';
import { addMsg } from './inbox.js';

// The site's tags and static pieces, published by build.mjs as /data/*.json.
let cache = null;
export async function siteData(env, url) {
  if (cache && cache.at > Date.now() - 300000) return cache;
  const get = async (p) => {
    try {
      const r = await env.ASSETS.fetch(new Request(new URL(p, url)));
      return r.ok ? r.json() : null;
    } catch {
      return null;
    }
  };
  const [tags, items, feed] = await Promise.all([get('/data/tags.json'), get('/data/items.json'), get('/data/feed.json')]);
  cache = {
    at: Date.now(),
    tags: tags || [],
    tag: Object.fromEntries((tags || []).map((t) => [t.id, t])),
    item: Object.fromEntries((items || []).map((i) => [i.key, i])),
    feed: Object.fromEntries((feed || []).map((f) => [f.n, { zh: f.zh.title, en: f.en.title }])),
    feedCount: (feed || []).length,
  };
  return cache;
}
export const resetSiteData = () => { cache = null; };

// The tags a 留言 target belongs to: managers of these tags read its private 留言.
async function targetTags(db, data, target) {
  const [type, id] = target.split(':');
  if (type === 'tag') return data.tag[id] ? [id] : null;
  if (type === 'a' || type === 'v') return data.item[target] ? data.item[target].tags : null;
  if (type === 'x') {
    const p = await db('postGet', { id });
    return p && p.status === 'live' ? p.tags : null;
  }
  return null;
}

// Video link → how to play it. Only hosts that are safe to embed.
export function parseVideo(input) {
  const s = str(input, 500);
  if (!s) return null;
  let m;
  if ((m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/))) return { type: 'youtube', id: m[1] };
  if ((m = s.match(/(?:iframe|player)\.mediadelivery\.net\/(?:embed|play)\/(\d+)\/([0-9a-f-]{36})/i))) return { type: 'bunny', url: `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}` };
  if ((m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { type: 'iframe', url: `https://player.vimeo.com/video/${m[1]}` };
  if ((m = s.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/)) || (m = s.match(/player\.bilibili\.com\/player\.html\?.*bvid=(BV[0-9A-Za-z]{10})/))) {
    return { type: 'iframe', url: `https://player.bilibili.com/player.html?bvid=${m[1]}&autoplay=0` };
  }
  if (/^https:\/\/\S+\.mp4(\?\S*)?$/i.test(s)) return { type: 'file', url: s };
  return null;
}

export async function handleContent(request, env, db, url, now, lang) {
  const t = tr(lang);
  const p = url.pathname;
  const method = request.method;
  const data = await siteData(env, url);
  const user = await currentUser(db, request);
  const admin = isAdmin(env, user);
  const myTags = user ? await db('mgrTags', { uid: user.id }) : [];
  let m;

  if (method === 'POST' && !sameOrigin(request, url)) return fail('Forbidden', 403);

  // ---------- 留言 ----------
  if (p === '/api/talk' && method === 'GET') {
    const target = str(url.searchParams.get('target'), 60);
    const tags = await targetTags(db, data, target);
    if (!tags) return fail(t('找不到这个页面', 'Page not found'), 404);
    const managers = await db('mgrList', {});
    const mgrOf = new Set(managers.filter((x) => tags.includes(x.tag)).map((x) => x.uid));
    const moderator = admin || tags.some((x) => myTags.includes(x));
    const list = await db('talkList', { target });
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    const visible = (c) => {
      const root = c.reply_to ? byId[c.reply_to] : c;
      if (!root) return false;
      if (root.pub) return true;
      return !!user && (moderator || root.uid === user.id);
    };
    const personTag = tags.length === 1 && data.tag[tags[0]]?.person;
    const view = (c) => ({
      id: c.id, name: c.name, body: c.body, pub: !!(c.reply_to ? byId[c.reply_to]?.pub : c.pub), created: c.created,
      mine: !!user && c.uid === user.id,
      badge: mgrOf.has(c.uid) ? (personTag ? 'self' : 'manager') : null,
    });
    const roots = list.filter((c) => !c.reply_to && visible(c)).map((c) => ({
      ...view(c), replies: list.filter((r) => r.reply_to === c.id).map(view),
      canReply: !!user && (c.pub || moderator || c.uid === user.id),
    }));
    return json({ ok: true, comments: roots.reverse(), moderator, signedIn: !!user });
  }
  if (p === '/api/talk' && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const b = (await readBody(request, 20000)) || {};
    const target = str(b.target, 60);
    const tags = await targetTags(db, data, target);
    if (!tags) return fail(t('找不到这个页面', 'Page not found'), 404);
    const body = str(b.body, 2000);
    if (!body) return fail(t('先写点什么吧。', 'Write something first.'));
    if (!(await rateOk(db, request, 'talk', 60, now, user.id))) return fail(t('今天留言太多了，明天再来。', 'That is a lot of messages today. Please come back tomorrow.'), 429);
    let replyTo = null;
    let pub = b.pub !== false;
    if (b.replyTo) {
      const root = await db('talkGet', { id: str(b.replyTo, 20) });
      if (!root || root.target !== target || root.reply_to || root.status !== 'live') return fail(t('找不到要回复的留言', 'That message is gone'));
      const moderator = admin || tags.some((x) => myTags.includes(x));
      if (!root.pub && !(moderator || root.uid === user.id)) return fail(t('不能回复这条留言', 'You cannot reply to this message'), 403);
      replyTo = root.id;
      pub = !!root.pub;
    }
    await db('talkAdd', { id: randomId(10), target, uid: user.id, body, pub, replyTo, now });
    return json({ ok: true });
  }
  if ((m = p.match(/^\/api\/talk\/([a-z0-9]{10})\/hide$/)) && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const c = await db('talkGet', { id: m[1] });
    if (!c) return fail(t('找不到这条留言', 'Message not found'), 404);
    const tags = (await targetTags(db, data, c.target)) || [];
    if (!(admin || c.uid === user.id || tags.some((x) => myTags.includes(x)))) return fail(t('不能删除这条留言', 'You cannot remove this message'), 403);
    await db('talkStatus', { id: c.id, status: 'hidden' });
    return json({ ok: true });
  }

  // ---------- "this tag is me" ----------
  if (p === '/api/claims' && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const b = (await readBody(request, 5000)) || {};
    const tag = str(b.tag, 40);
    if (!data.tag[tag]?.person) return fail(t('这个标签不能认领', 'This tag cannot be claimed'));
    const r = await db('claimAdd', { id: randomId(10), tag, uid: user.id, note: str(b.note, 300), now });
    if (!r.ok) return fail(r.reason === 'already' ? t('你已经是这个标签的管理员了。', 'You already manage this tag.') : t('已经提交过了，正在等网站确认。', 'Already sent. Waiting for the site to confirm.'));
    return json({ ok: true });
  }

  // ---------- posts by tag managers ----------
  if (p === '/api/posts' && method === 'GET') {
    if (url.searchParams.get('latest-by-tag') === '1') {
      const rows = await db('postsLatestByTag', {});
      const overview = Object.fromEntries(rows.map((x) => [x.tag, {
        count: Number(x.count) || 0, updated: Number(x.updated) || 0, title: x.title || '', lang: x.lang || 'zh',
      }]));
      return json({ ok: true, latest: Object.fromEntries(Object.entries(overview).map(([tag, x]) => [tag, x.updated])), overview });
    }
    const tag = str(url.searchParams.get('tag'), 40);
    if (!data.tag[tag]) return fail(t('找不到这个标签', 'Tag not found'), 404);
    const posts = await db('postsByTag', { tag });
    return json({ ok: true, posts: posts.map(({ uid, ...x }) => ({ ...x, mine: !!user && uid === user.id })), canPost: admin || myTags.includes(tag) });
  }
  if ((m = p.match(/^\/api\/posts\/([a-z0-9]{10})$/)) && method === 'GET') {
    const post = await db('postGet', { id: m[1] });
    if (!post || post.status !== 'live') return fail(t('找不到这篇', 'Not found'), 404);
    const canEdit = !!user && (admin || post.uid === user.id);
    const { uid, ...rest } = post;
    return json({ ok: true, post: rest, canEdit });
  }
  if (p === '/api/posts' && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const b = (await readBody(request, 120000)) || {};
    const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map((x) => str(x, 40)).filter((x) => data.tag[x]))].slice(0, 6);
    if (!tags.length) return fail(t('请至少选一个标签', 'Pick at least one tag'));
    if (!admin) {
      if (!tags.some((x) => myTags.includes(x))) return fail(t('只能发到你管理的标签里', 'You can only post to tags you manage'), 403);
      if (tags.some((x) => data.tag[x].person && !myTags.includes(x))) return fail(t('不能发到别人的个人标签里', 'You cannot post to someone else’s tag'), 403);
    }
    const kind = b.kind === 'video' ? 'video' : 'article';
    const title = str(b.title, 80);
    if (!title) return fail(t('请写一个标题', 'Write a title'));
    const body = str(b.body, 60000);
    const video = kind === 'video' ? parseVideo(b.video) : null;
    if (kind === 'video' && !video) return fail(t('视频链接认不出来：支持 YouTube、B站、Vimeo、Bunny 和 .mp4 链接。', 'That video link is not recognized: YouTube, Bilibili, Vimeo, Bunny and .mp4 links work.'));
    if (kind === 'article' && body.length < 10) return fail(t('正文太短了', 'The text is too short'));
    let id = str(b.id, 10);
    const isNew = !id;
    if (id) {
      const old = await db('postGet', { id });
      if (!old || !(admin || old.uid === user.id)) return fail(t('不能修改这篇', 'You cannot edit this'), 403);
    } else {
      if (!(await rateOk(db, request, 'post', 30, now, user.id))) return fail(t('今天发得太多了', 'Too many posts today'), 429);
      id = randomId(10);
    }
    await db('postPut', { id, uid: user.id, tags, kind, lang: b.lang === 'en' ? 'en' : 'zh', title, summary: str(b.summary, 200), body, video, now });
    // tell the tags' subscribers (我的 → 消息)
    if (isNew) {
      for (const tag of tags) {
        await addMsg(db, { scope: `tag:${tag}`, now, url: `/x/${id}/`, author: user.id,
          title: { zh: `「${data.tag[tag].zh}」有新内容`, en: `New in “${data.tag[tag].en}”` }, body: { zh: title, en: title } });
      }
    }
    return json({ ok: true, id });
  }
  if ((m = p.match(/^\/api\/posts\/([a-z0-9]{10})\/delete$/)) && method === 'POST') {
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const post = await db('postGet', { id: m[1] });
    if (!post || !(admin || post.uid === user.id)) return fail(t('不能删除这篇', 'You cannot remove this'), 403);
    await db('postStatus', { id: post.id, status: 'removed' });
    return json({ ok: true });
  }
  return null;
}
