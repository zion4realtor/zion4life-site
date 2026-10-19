// A finite weighted ticket pool gives new films more turns while guaranteeing older films a turn.
export function rotationTickets(published, now = Date.now()) {
  const date = Date.parse(published);
  const age = Number.isFinite(date) ? Math.max(0, now - date) / 86400000 : Infinity;
  return 1 + Math.round(3 * Math.pow(2, -age / 7));
}
export function rotateVideos(videos, saved = {}, now = Date.now(), random = Math.random) {
  const films = [...new Map(videos.map(v => [v.slug, v])).values()];
  const quotas = Object.fromEntries(films.map(v => [v.slug, rotationTickets(v.published, now)]));
  const known = new Set(Array.isArray(saved.known) ? saved.known : []);
  const counts = Object.fromEntries(films.map(v => [v.slug, known.has(v.slug) ? Math.max(0, Math.min(4, Math.floor(Number(saved.remaining?.[v.slug]) || 0))) : quotas[v.slug]]));
  const previous = new Set(Array.isArray(saved.previous) ? saved.previous : []);
  const selected = [];
  while (selected.length < Math.min(4, films.length)) {
    let pool = films.filter(v => counts[v.slug] > 0 && !selected.includes(v.slug));
    if (!pool.length) {
      Object.assign(counts, quotas);
      pool = films.filter(v => !selected.includes(v.slug));
    }
    const weights = pool.map(v => counts[v.slug] * (previous.has(v.slug) ? .35 : 1));
    let ticket = Math.max(0, Math.min(.999999999, random())) * weights.reduce((a,b) => a+b, 0);
    let index = 0;
    while (index < pool.length - 1 && (ticket -= weights[index]) >= 0) index++;
    const slug = pool[index].slug;
    selected.push(slug);
    counts[slug]--;
  }
  return { slugs: selected, state: { known: films.map(v => v.slug), remaining: counts, previous: selected } };
}
