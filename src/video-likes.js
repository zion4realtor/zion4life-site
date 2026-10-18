import { json, fail, readBody } from './util.js';
import { sameOrigin } from './auth.js';

export const LIKE_BASE = 258;
// A fresh release gets a boost; real reader likes can keep an older film visible.
export function videoScore(added, published, now = Date.now()) {
  const age = Math.max(0, now - (Date.parse(published) || 0)) / 86400000;
  return Math.log2(1 + Math.max(0, added)) + 4 * Math.pow(2, -age / 14);
}
export async function handleVideoLikes(request, env, db, url, now) {
  const method = request.method;
  if (!['GET', 'POST'].includes(method)) return fail('Method not allowed', 405);
  if (method === 'POST' && !sameOrigin(request, url)) return fail('Forbidden', 403);
  const res = await env.ASSETS.fetch(new Request(new URL('/data/video-meta.json', url)));
  if (!res.ok) return fail('Video list unavailable', 503);
  const videos = await res.json();
  const view = (row = {}) => ({ count: LIKE_BASE + (row.added || 0), added: row.added || 0 });
  if (method === 'GET' && url.pathname === '/api/video-likes') {
    const saved = Object.fromEntries((await db('videoLikes', {})).map(r => [r.target, r]));
    const stats = Object.fromEntries(videos.map(v => [`v:${v.slug}`, view(saved[`v:${v.slug}`])]));
    const featured = videos.filter(v => v.featured);
    const byNewest = (a,b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
    const newest = featured.slice().sort(byNewest).slice(0, 2);
    const newestSlugs = new Set(newest.map(v => v.slug));
    const mostLiked = featured.filter(v => !newestSlugs.has(v.slug)).slice()
      .sort((a,b) => stats[`v:${b.slug}`].count - stats[`v:${a.slug}`].count || byNewest(a,b))
      .slice(0, 2);
    const order = [...newest, ...mostLiked].map(v => v.slug);
    return json({ ok: true, base: LIKE_BASE, stats, order }, 200);
  }
  const target = decodeURIComponent(url.pathname.slice('/api/video-likes/'.length));
  if (!/^(v:[a-z0-9-]{1,100}|x:[a-z0-9]{10})$/.test(target)) return fail('Unknown video',404);
  const exists = target.startsWith('v:') ? videos.some(v => `v:${v.slug}` === target) : false;
  if (!exists) {
    const post = target.startsWith('x:') ? await db('postGet', { id: target.slice(2) }) : null;
    if (!post || post.kind !== 'video' || post.status !== 'live') return fail('Unknown video',404);
  }
  if (method === 'GET') {
    const row = (await db('videoLikes', {})).find(r => r.target === target);
    return json({ ok: true, ...view(row) },200);
  }
  const body = await readBody(request, 1000);
  if (!body || 'liked' in body || !Number.isInteger(body.amount) || body.amount < 1 || body.amount > 1000 || !/^[A-Za-z0-9_-]{20,80}$/.test(body.id || '')) return fail('Invalid applause batch');
  // Each human tap adds one; there is no per-person or daily total limit.
  // A request ID prevents a network retry from accidentally counting the same taps twice.
  const result = await db('videoLike', { target, amount:body.amount, id:body.id, now });
  return result.conflict ? fail('Request ID already used',409) : json({ ok:true,...view(result) });
}
