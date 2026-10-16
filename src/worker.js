// Cloudflare Worker entry. Requests that run code:
//   /api/hit                        visit counts, forwarded to Google Analytics (analytics.js)
//   /api/*                          the API (api.js)
//   /g/<id>, /g/<id>/<n>, /g/<id>/now   搭子 pages: the static shell with the group's name in the link preview
//   /x/<id>                          articles and videos written by tag managers, rendered here
// (and the same under /en/). Everything else is the static site in dist/.
// The cron trigger (every 5 minutes) emails attendees about 30 minutes before each 搭子 session.
import { handleApi, runReminders } from './api.js';
import { handleHit } from './analytics.js';
import { store } from './store.js';
import { siteData } from './content.js';
import { planText, minutesText, sessionState, KINDS } from './schedule.js';
import { esc, md, plain } from './md.js';
import { serveVideo } from './media.js';

export { Store } from './store.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p.startsWith('/video/') && p.endsWith('.mp4')) return serveVideo(request, env);
    if (p === '/api/hit') return handleHit(request, env, ctx, url);
    if (p.startsWith('/api/')) {
      try {
        return (await handleApi(request, env, url)) || Response.json({ ok: false, error: 'Not found' }, { status: 404 });
      } catch (e) {
        console.error('[api]', p, e?.stack || e);
        const en = request.headers.get('x-lang') === 'en';
        return Response.json({ ok: false, error: en ? 'Something went wrong on the server. Please try again.' : '服务器出了点问题，请稍后再试' }, { status: 500 });
      }
    }
    // Old cached group shells linked to /g/ without an ID. Recover to the plaza.
    if (/^\/(en\/)?g\/?$/.test(p)) return Response.redirect(`${url.origin}${p.startsWith('/en/') ? '/en' : ''}/dazi/`, 302);
    let m;
    if ((m = p.match(/^(\/en)?\/g\/([a-z0-9]{8})(?:\/(\d{1,5}|now))?\/?$/))) return groupPage(request, env, url, m[1] ? 'en' : 'zh', m[2], m[3]);
    if ((m = p.match(/^(\/en)?\/x\/([a-z0-9]{10})\/?$/))) return postPage(request, env, url, m[1] ? 'en' : 'zh', m[2]);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env).then((r) => console.log('[reminders]', JSON.stringify(r))));
  },
};

async function shell(env, url, request, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, url), request));
  if (!res.ok) return null;
  const html = await res.text();
  // The stored shells are /g/ and /x/. Language links must use the requested
  // resource URL instead, retaining its ID, session and invitation/tab parameters.
  const resource = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  return html.replace(/(<a\b[^>]*\bhref=")[^"]*("[^>]*\bdata-lang="(zh|en)"[^>]*>)/g,
    (_, before, after, lang) => `${before}${esc(`${lang === 'en' ? '/en' : ''}${resource}${url.search}`)}${after}`);

}
function fill(html, { title, desc, canonical }) {
  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
  }
  if (desc) {
    html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  }
  if (canonical) {
    html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`);
  }
  return html;
}
const page = (html, status = 200) => new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

async function groupPage(request, env, url, lang, id, n) {
  const pre = lang === 'en' ? '/en' : '';
  let html = await shell(env, url, request, `${pre}/g/`);
  if (!html) return env.ASSETS.fetch(request);
  try {
    const g = await store(env)('dzGet', { id });
    if (g && g.status !== 'removed') {
      if (n === 'now') {
        const data = await siteData(env, url);
        const st = sessionState(g, Date.now() + 2 * 3600000, { ...data });
        return Response.redirect(`${url.origin}${pre}/g/${id}/${st.done || 1}`, 302);
      }
      const owner = g.members.find((x) => x.role === 'owner')?.name || '';
      const kind = KINDS[g.kind][lang];
      const title = lang === 'en' ? `${g.title} · ${owner ? `${owner} invites you: ` : ''}${kind}` : `${g.title}｜${owner ? `${owner}邀请你加入` : ''}${kind}`;
      // no clock times here: the preview cannot know the reader's time zone; the page shows them
      const data = await siteData(env, url);
      const desc = `${planText(g, lang, data)} · ${lang === 'en' ? `${minutesText(g.minutes, 'en')} each time` : `每次${minutesText(g.minutes, 'zh')}`}`;
      html = fill(html, { title, desc, canonical: `https://zion4life.faith${pre}/g/${id}` });
    }
  } catch (e) {
    console.error('[group page]', e?.stack || e);
  }
  return page(html);
}

async function postPage(request, env, url, lang, id) {
  const pre = lang === 'en' ? '/en' : '';
  let html = await shell(env, url, request, `${pre}/x/`);
  if (!html) return env.ASSETS.fetch(request);
  const post = await store(env)('postGet', { id });
  const en = lang === 'en';
  if (!post || post.status !== 'live') {
    return page(html.replace('<!--POST-->', `<div class="empty"><p>${en ? 'This piece is not here any more.' : '这一篇已经不在了。'}</p></div>`), 404);
  }
  const data = await siteData(env, url);
  const tags = post.tags.filter((t) => data.tag[t]);
  const first = data.tag[tags[0]];
  const tint = { aqua: 'var(--t-aqua)', mint: 'var(--t-mint)', sky: 'var(--t-sky)', lilac: 'var(--t-lilac)', peach: 'var(--t-peach)', sun: 'var(--t-sun)' }[first?.tint] || 'var(--t-aqua)';
  const d = new Date(post.created);
  const date = en ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' })
    : `${d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')}`;
  const sources = post.video ? [{ ...post.video, label: en ? 'Play' : '播放' }] : [];
  const body = `<article class="article" style="--tint:${tint}">
<a class="back" href="${pre}/t/${tags[0] || ''}/">← ${esc(first ? first[lang] : en ? 'Back' : '返回')}</a>
${post.kind === 'video' ? `<div class="player" data-player><button class="player-start" type="button" aria-label="${en ? 'Play' : '播放'}"><span class="poster"><span class="ptitle">${esc(post.title)}</span><span class="play"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg></span></span></button><script type="application/json">${JSON.stringify(sources).replace(/</g, '\\u003c')}</script></div>` : ''}
<h1 class="a-title">${esc(post.title)}</h1>
<div class="a-meta"><span>${esc(post.author)}</span><time datetime="${d.toISOString().slice(0, 10)}">${esc(date)}</time></div>
<div class="a-tags">${tags.map((t) => `<a class="chiplink" href="${pre}/t/${t}/">${esc(data.tag[t][lang])}</a>`).join('')}</div>
${post.lang !== lang ? `<p class="note-box">${en ? 'This piece is in Chinese.' : '这一篇是英文的。'}</p>` : ''}
${post.summary ? `<p class="lede">${esc(post.summary)}</p>` : ''}
<div class="prose"${post.lang !== lang ? ` lang="${post.lang === 'en' ? 'en' : 'zh-CN'}"` : ''}>${md(post.body)}</div>
<div data-post-tools="${post.id}"></div>
<section class="talk" data-talk="x:${post.id}"></section>
</article>`;
  html = fill(html.replace('<!--POST-->', body), {
    title: `${post.title}｜${en ? 'Light' : '有光'}`,
    desc: post.summary || plain(md(post.body)).slice(0, 90),
    canonical: `https://zion4life.faith${pre}/x/${id}`,
  });
  return page(html);
}
