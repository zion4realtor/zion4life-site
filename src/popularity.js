// Low-volume page-view aggregates, isolated from the site's primary Store Durable Object.
// Stores only a day bucket and a normalized public path; never a visitor ID, IP, or query string.
export const POPULARITY_SHARDS = 16;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PATH = /^\/$|^\/(?:a|v|t)\/[a-z0-9-]+\/$|^\/(?:dazi|huxi|read|updates|key-verses|shared)\/$/;

export async function recordPageView(env, day, path) {
  if (!env.PAGE_STATS || !DAY.test(day) || !PATH.test(path)) return;
  const shard = Math.floor(Math.random() * POPULARITY_SHARDS);
  const stub = env.PAGE_STATS.get(env.PAGE_STATS.idFromName(String(shard)));
  const response = await stub.fetch('https://page-stats/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day, path }),
  });
  if (!response.ok) throw new Error(`page stats write failed: ${response.status}`);
}

export async function readPageViews(env, { since, pruneBefore }) {
  if (!env.PAGE_STATS || !DAY.test(since) || !DAY.test(pruneBefore)) return [];
  const reports = await Promise.all(Array.from({ length: POPULARITY_SHARDS }, async (_, i) => {
    const stub = env.PAGE_STATS.get(env.PAGE_STATS.idFromName(String(i)));
    const response = await stub.fetch('https://page-stats/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since, pruneBefore }),
    });
    if (!response.ok) throw new Error(`page stats report failed: ${response.status}`);
    return response.json();
  }));
  const totals = new Map();
  for (const report of reports) for (const item of report.rows || []) totals.set(item.path, (totals.get(item.path) || 0) + item.views);
  return [...totals].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views);
}

export class Popularity {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS page_view (day TEXT NOT NULL, path TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, path))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS page_view_day ON page_view(day)');
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const url = new URL(request.url);
    if (url.pathname === '/record') {
      if (!DAY.test(body.day || '') || !PATH.test(body.path || '')) return Response.json({ error: 'Invalid page view' }, { status: 400 });
      this.sql.exec('INSERT INTO page_view (day, path, views) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1', body.day, body.path);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/report') {
      if (!DAY.test(body.since || '') || !DAY.test(body.pruneBefore || '')) return Response.json({ error: 'Invalid date range' }, { status: 400 });
      this.sql.exec('DELETE FROM page_view WHERE day < ?', body.pruneBefore);
      const rows = this.sql.exec('SELECT path, SUM(views) AS views FROM page_view WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 250', body.since).toArray();
      return Response.json({ rows });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
