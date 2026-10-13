// Cloudflare Worker entry. /api/* runs code (api.js); /g/<id> serves the group page
// shell with the group's name filled in (so a shared invite link shows it); everything
// else is the static site in dist/. The cron trigger (every 5 minutes) sends reminders.
import { handleApi, runReminders } from './api.js';
import { store } from './store.js';
import { scheduleText, KINDS } from './schedule.js';

export { Store } from './store.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return (await handleApi(request, env, url)) || Response.json({ ok: false, error: 'Not found' }, { status: 404 });
      } catch (e) {
        console.error('[api]', url.pathname, e?.stack || e);
        return Response.json({ ok: false, error: '服务器出了点问题，请稍后再试' }, { status: 500 });
      }
    }
    const m = url.pathname.match(/^\/g\/([a-z0-9]{8})\/?$/);
    if (m) return groupShell(request, env, url, m[1]);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env).then((r) => console.log('[reminders]', JSON.stringify(r))));
  },
};

async function groupShell(request, env, url, id) {
  const res = await env.ASSETS.fetch(new Request(new URL('/g/', url), request));
  if (!res.ok) return res;
  let html = await res.text();
  try {
    const g = await store(env)('group', { id });
    if (g && g.status !== 'hidden') {
      const title = `${g.title}｜${g.ownerName ? `${g.ownerName}邀请你加入` : ''}${KINDS[g.kind]}`;
      const desc = scheduleText(g);
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
        .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1https://zion4life.faith/g/${id}$2`);
    }
  } catch (e) {
    console.error('[group shell]', e?.stack || e);
  }
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('ETag');
  return new Response(html, { status: 200, headers });
}
