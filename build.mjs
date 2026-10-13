// build.mjs: builds zion4life.faith into dist/. No dependencies; run `node build.mjs`.
// Content lives in content/ (see README.md). Static files in static/ are copied as is.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './src/bible.js';
import { TZ_LABELS, KINDS as GROUP_KINDS } from './src/schedule.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content');
const STATIC = path.join(ROOT, 'static');
const DIST = path.join(ROOT, 'dist');

const site = readJSON('site.json');
const NAV = [
  ['/read/', '文章'],
  ['/watch/', '视频'],
  ['/pray/', '祷告'],
  ['/square/', '广场'],
];
const KINDS = { message: '福音信息', testimony: '见证' };
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// ---------- helpers ----------
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, rel), 'utf8'));
}
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
export function parseDoc(text) {
  const m = text.replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (/^".*"$/.test(v)) v = v.slice(1, -1);
    meta[k] = v;
  }
  return { meta, body: m[2] };
}
function inline(s) {
  let h = esc(s);
  h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img src="${u}" alt="${a}" loading="lazy">`);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) =>
    `<a href="${u}"${/^https?:/.test(u) ? ' rel="noopener" target="_blank"' : ''}>${t}</a>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return h;
}
// Join wrapped lines: no space between Chinese characters, one space between Latin words.
function joinLines(lines) {
  return lines.reduce((acc, l) => {
    l = l.trim();
    if (!acc) return l;
    const a = acc.slice(-1), b = l[0];
    return acc + (/[\x21-\x7e]/.test(a) && /[\x21-\x7e]/.test(b) ? ' ' : '') + l;
  }, '');
}
// Simple Markdown: ## headings, paragraphs, > verse (last line "—— 出处"), - lists, 1. lists, ---, **bold**, links, images.
export function md(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  const special = /^(#{2,4}\s|>|[-*]\s|\d+[.、]\s|---+\s*$)/;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) {
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++;
    } else if (/^---+\s*$/.test(l)) {
      out.push('<hr>');
      i++;
    } else if (l.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      let cite = '';
      if (q.length > 1 && /^(——|—|--)/.test(q[q.length - 1].trim())) cite = q.pop().trim().replace(/^(——|—|--)\s*/, '');
      out.push(`<blockquote class="verse"><p>${q.map(inline).join('<br>')}</p>${cite ? `<cite>${inline(cite)}</cite>` : ''}</blockquote>`);
    } else if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ''));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
    } else if (/^\d+[.、]\s*/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+[.、]\s*/.test(lines[i])) items.push(lines[i++].replace(/^\d+[.、]\s*/, ''));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
    } else {
      const p = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !special.test(lines[i])) p.push(lines[i++]);
      out.push(`<p>${inline(joinLines(p))}</p>`);
    }
  }
  return out.join('\n');
}
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
function readMinutes(text) {
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 380 + words / 200));
}
function dateParts(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { y, mo, d, md: `${mo}月${d}日`, full: `${y}年${mo}月${d}日`, wd: WEEK[wd], wdShort: WEEK[wd].replace('星期', '周') };
}
function duration(min) {
  if (min >= 60) {
    const h = Math.floor(min / 60), r = min % 60;
    return r ? `约 ${h} 小时 ${r} 分钟` : `约 ${h} 小时`;
  }
  return `${min} 分钟`;
}
// The audience is mostly in China, so "today" at build time is China's date.
// The page script then switches to the visitor's own date if it differs.
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

// ---------- content ----------
function loadDir(dir) {
  const full = path.join(CONTENT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => {
    const { meta, body } = parseDoc(fs.readFileSync(path.join(full, f), 'utf8'));
    return { ...meta, slug: f.replace(/\.md$/, ''), html: md(body) };
  });
}
const articles = loadDir('articles')
  .filter((a) => !a.hidden)
  .map((a) => ({ ...a, minutes: readMinutes(plain(a.html)) }))
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));
const prayers = loadDir('pray')
  .map((p) => ({ ...p, date: p.date || p.slug, excerpt: plain(p.html.split('\n')[0]).slice(0, 80) }))
  .sort((a, b) => b.date.localeCompare(a.date));
const videos = readJSON('videos.json').sort((a, b) => String(b.date).localeCompare(String(a.date)));

for (const p of prayers) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(`content/pray/${p.slug}.md: date must be YYYY-MM-DD`);
}
for (const v of videos) {
  if (!KINDS[v.kind]) throw new Error(`videos.json ${v.slug}: kind must be ${Object.keys(KINDS).join(' or ')}`);
}

// ---------- assets ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(STATIC, DIST, { recursive: true });
const ver = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(STATIC, rel))).digest('hex').slice(0, 10);
const CSS = `/css/site.css?v=${ver('css/site.css')}`;
const SERIF = `/css/serif.css?v=${ver('css/serif.css')}`;
const JS = `/js/site.js?v=${ver('js/site.js')}`;
const GROUPS_JS = `/js/groups.js?v=${ver('js/groups.js')}`;

// ---------- layout ----------
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 20a9 9 0 0 1 18 0z" fill="var(--dawn)"/><rect x="3" y="22" width="26" height="2.4" rx="1.2" fill="currentColor"/></svg>`;

function page({ title, desc = site.description, url, body, active = '', noindex = false, head = '', scripts = [] }) {
  const full = title ? `${title}｜${site.name}` : `${site.name}｜${site.nameZh}`;
  const canonical = site.url + url;
  const nav = NAV.map(([href, label]) =>
    `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title || site.nameZh)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/img/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#15322C">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="${SERIF}">
<link rel="stylesheet" href="${CSS}">
${head}</head>
<body>
<header class="top"><div class="wrap top-in">
<a class="brand" href="/">${MARK}<span>${esc(site.name)}</span></a>
<nav class="nav" aria-label="栏目">${nav}</nav>
</div></header>
${body}
<footer class="foot"><div class="wrap">
<a class="brand brand-foot" href="/">${MARK}<span>${esc(site.name)}</span></a>
<p class="foot-line">${esc(site.footerLine)}</p>
<nav class="foot-nav" aria-label="栏目">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}</nav>
<p class="foot-copy">© ${new Date().getFullYear()} ${esc(site.name)}</p>
</div></footer>
<div class="toast" role="status" aria-live="polite" hidden></div>
<script src="${JS}" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>\n`).join('')}</body>
</html>
`;
}
function write(url, html) {
  const file = path.join(DIST, url === '/' ? 'index.html' : url.replace(/^\//, '').replace(/\/$/, '') + '/index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
const sampleTag = (x) => (x.sample ? ' <span class="tag">示例</span>' : '');
const jsonScript = (id, data) =>
  `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function shareBox(text, shareUrl, title) {
  return `<div class="share" data-share data-url="${esc(site.url + shareUrl)}" data-title="${esc(title)}">
<p>${esc(text)}</p>
<button class="btn btn-life" type="button" data-share-btn>分享给朋友</button>
<p class="share-wx" hidden>在微信里，点右上角“···”，就能发送给朋友或分享到朋友圈。</p>
</div>`;
}
function articleList(list) {
  return `<ul class="list">${list.map((a) => `<li><a href="/read/${a.slug}/">
<h3>${esc(a.title)}${sampleTag(a)}</h3>
${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
<span class="meta">约 ${a.minutes} 分钟读完</span>
</a></li>`).join('')}</ul>`;
}
function poster(v, big = false) {
  return `<span class="poster${big ? ' poster-big' : ''}" aria-hidden="true">
<span class="poster-sun"></span>
<span class="poster-dur">${duration(v.minutes).replace('约 ', '')}</span>
<span class="poster-title">${esc(v.title)}</span>
${big ? `<span class="poster-play">${v.sources.length ? '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>' : ''}</span>` : ''}
</span>`;
}
function videoMeta(v) {
  return [v.speaker ? `${v.speaker}` : '', duration(v.minutes)].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
}
function videoTile(v) {
  return `<a class="vtile" href="/watch/${v.slug}/">${poster(v)}
<span class="vtile-meta">${videoMeta(v)}${sampleTag(v)}</span></a>`;
}
function videoGroups(list, scroll) {
  return Object.entries(KINDS).map(([k, label]) => {
    const vs = list.filter((v) => v.kind === k);
    if (!vs.length) return '';
    return `<div class="vgroup"><h3>${label}</h3><div class="${scroll ? 'vscroll' : 'vgrid'}">${vs.map(videoTile).join('')}</div></div>`;
  }).join('');
}

// ---------- prayer ----------
// prayer entries the page script may switch to: everything from two days ago onward (covers time zones and entries written ahead).
const recentPrayers = prayers.filter((p) => p.date >= shiftDate(TODAY, -2));
function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const todayPrayer = prayers.find((p) => p.date <= TODAY) || prayers[prayers.length - 1];

function prayerDay(p, live) {
  const d = dateParts(p.date);
  return `<article class="p-day"${live ? ` data-pray-today data-date="${p.date}"` : ''}>
<div class="p-date"><span class="p-md" data-f="md">${d.md}</span><span class="p-wd" data-f="wd">${d.wd}</span></div>
<h2 class="p-title"><span data-f="title">${esc(p.title)}</span>${sampleTag(p)}</h2>
<div class="prose" data-f="html">${p.html}</div>
</article>`;
}
function archive(current) {
  return `<section class="p-archive"><h2>往期祷告</h2><ul class="arch">${prayers.map((p) => {
    const d = dateParts(p.date);
    const hide = p.date > TODAY || p.date === current;
    return `<li data-arch="${p.date}"${hide ? ' hidden' : ''}><a href="/pray/${p.date}/"><time datetime="${p.date}">${d.md} ${d.wdShort}</time><span>${esc(p.title)}</span></a></li>`;
  }).join('')}</ul></section>`;
}

// ---------- pages ----------
const urls = [];
function emit(url, opts) {
  write(url, page({ ...opts, url }));
  if (!opts.noindex) urls.push(url);
}

// Home
{
  const hero = articles.find((a) => a.slug === site.heroArticle) || articles[0];
  const tp = todayPrayer;
  const tpd = tp && dateParts(tp.date);
  const body = `<main>
<section class="hero">
<div class="hero-glow" aria-hidden="true"></div>
<div class="sun" aria-hidden="true"></div>
<div class="wrap hero-in">
<h1 class="hero-q">${site.heroQuestion.map((s) => `<span>${esc(s)}</span>`).join('')}</h1>
<p class="hero-lead">${esc(site.heroLead)}</p>
${hero ? `<a class="btn btn-dawn" href="/read/${hero.slug}/">读《${esc(hero.title)}》</a>` : ''}
</div>
</section>

${tp ? `<section class="band band-mist">
<div class="wrap">
<div class="sec-head"><h2>每日祷告</h2><a href="/pray/#archive">往期</a></div>
<a class="today" href="/pray/" data-pray-today data-date="${tp.date}">
<span class="today-date"><b data-f="md">${tpd.md}</b><span data-f="wd">${tpd.wd}</span></span>
<strong class="today-title" data-f="title">${esc(tp.title)}</strong>
<span class="today-ex" data-f="excerpt">${esc(tp.excerpt)}</span>
<span class="today-go">打开今日祷告</span>
</a>
</div>
${jsonScript('pray-data', recentPrayers.map((p) => ({ date: p.date, ...pick(dateParts(p.date), 'md', 'wd'), title: p.title, excerpt: p.excerpt })))}
</section>` : ''}

<section class="band">
<div class="wrap">
<div class="sec-head"><h2>文章</h2><a href="/read/">全部</a></div>
${articleList(articles.slice(0, 5))}
</div>
</section>

${videos.length ? `<section class="band band-mist">
<div class="wrap">
<div class="sec-head"><h2>视频</h2><a href="/watch/">全部</a></div>
${videoGroups(videos, true)}
</div>
</section>` : ''}

<section class="band">
<div class="wrap">
<div class="sec-head"><h2>小组广场</h2><a href="/square/">进入</a></div>
<p class="lead-p">约上两三个人，定好时间，一起读经、祷告。到了时间提醒你，读完还能打卡、写心得。</p>
<div class="kind-row">${Object.entries(GROUP_KINDS).map(([k, l]) => `<a class="gtag gtag-${k}" href="/square/?kind=${k}">${l}</a>`).join('')}</div>
<p class="btn-row"><a class="btn btn-life" href="/square/new/">发起一个小组</a><a class="btn btn-line" href="/square/">看看广场</a></p>
</div>
</section>
</main>`;
  emit('/', { title: '', body });
}
function pick(o, ...keys) {
  return Object.fromEntries(keys.map((k) => [k, o[k]]));
}

// Articles
emit('/read/', {
  title: '文章',
  active: '/read/',
  body: `<main class="wrap page">
<h1 class="page-title">文章</h1>
<p class="page-lead">一篇几分钟，适合在手机上慢慢读。</p>
${articleList(articles)}
</main>`,
});
for (const a of articles) {
  const d = dateParts(a.date);
  const others = articles.filter((x) => x.slug !== a.slug).slice(0, 4);
  emit(`/read/${a.slug}/`, {
    title: a.title,
    desc: a.summary || plain(a.html).slice(0, 90),
    active: '/read/',
    noindex: !!a.sample,
    body: `<main class="wrap article">
<article>
<h1 class="a-title">${esc(a.title)}</h1>
<div class="a-meta"><time datetime="${a.date}">${d.full}</time><span>约 ${a.minutes} 分钟读完</span></div>
${a.sample ? '<p class="sample-note">排版示例：正文是占位文字，正式内容到了会替换。</p>' : ''}
<div class="prose">
${a.html}
</div>
</article>
${shareBox('如果这篇文章对你有帮助，也发给你关心的人。', `/read/${a.slug}/`, a.title)}
${others.length ? `<section class="more"><h2>继续读</h2>${articleList(others)}</section>` : ''}
</main>`,
  });
}

// Prayer: /pray/ always shows today's entry; /pray/<date>/ shows one day.
if (prayers.length) {
  emit('/pray/', {
    title: '每日祷告',
    desc: '每天打开这个链接，都是当天的祷告。',
    active: '/pray/',
    body: `<main class="wrap page pray">
<h1 class="page-title">每日祷告</h1>
<p class="page-lead">每天打开这个链接，都是当天的祷告。</p>
${prayerDay(todayPrayer, true)}
${shareBox('把这个链接发给弟兄姊妹，他们每天打开，看到的都是当天的祷告。', '/pray/', '每日祷告')}
<div id="archive">${archive(todayPrayer.date)}</div>
${jsonScript('pray-data', recentPrayers.map((p) => ({ date: p.date, ...pick(dateParts(p.date), 'md', 'wd'), title: p.title, html: p.html, sample: !!p.sample })))}
</main>`,
  });
  for (const p of prayers) {
    const d = dateParts(p.date);
    emit(`/pray/${p.date}/`, {
      title: `${d.md}祷告`,
      desc: p.title,
      active: '/pray/',
      noindex: !!p.sample,
      body: `<main class="wrap page pray">
<p class="back"><a href="/pray/">看今天的祷告</a></p>
${prayerDay(p, false)}
${shareBox('把这一天的祷告发给弟兄姊妹。', `/pray/${p.date}/`, `${d.md}祷告`)}
${archive(p.date)}
</main>`,
    });
  }
}

// Videos
emit('/watch/', {
  title: '视频',
  active: '/watch/',
  body: `<main class="wrap page">
<h1 class="page-title">视频</h1>
<p class="page-lead">福音信息和生命见证，有长有短。</p>
${videoGroups(videos, false)}
</main>`,
});
for (const v of videos) {
  const others = videos.filter((x) => x.slug !== v.slug && x.kind === v.kind).slice(0, 4);
  const sources = (v.sources || []).map((s, i) => ({ ...s, label: s.label || `线路${i + 1}` }));
  emit(`/watch/${v.slug}/`, {
    title: v.title,
    desc: v.summary || v.title,
    active: '/watch/',
    noindex: !!v.sample,
    body: `<main class="wrap page watch">
<div class="player" data-player>
<button class="player-start" type="button"${sources.length ? '' : ' disabled'} aria-label="${sources.length ? '播放' : '视频即将上线'}">${poster(v, true)}</button>
${sources.length ? '' : '<p class="player-soon">视频即将上线</p>'}
${jsonScript(`src-${v.slug}`, sources)}
</div>
${sources.length > 1 ? `<div class="lines" role="group" aria-label="播放线路">${sources.map((s, i) => `<button type="button" data-line="${i}"${i ? '' : ' aria-pressed="true"'}>${esc(s.label)}</button>`).join('')}</div>` : ''}
<h1 class="w-title">${esc(v.title)}${sampleTag(v)}</h1>
<div class="a-meta">${videoMeta(v)}</div>
${v.summary ? `<p class="w-sum">${esc(v.summary)}</p>` : ''}
${sources.length > 1 ? '<p class="w-note">播放不了的话，换一条线路试试。</p>' : ''}
${shareBox('把这段视频发给你关心的人。', `/watch/${v.slug}/`, v.title)}
${others.length ? `<section class="more"><h2>更多${KINDS[v.kind]}</h2><div class="vgrid">${others.map(videoTile).join('')}</div></section>` : ''}
</main>`,
  });
}

// ---------- plaza and groups (the data comes from /api/*, rendered by static/js/groups.js) ----------
const KIND_INFO = {
  read: ['读经小组', '定好一卷圣经，按次往下读。'],
  pray: ['祷告小组', '定好时间，一起为人为事祷告。'],
  feed: ['喂养小组', '陪伴新朋友，一起追求、一起成长。'],
};
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

emit('/square/', {
  title: '小组广场',
  desc: '读经小组、祷告小组、喂养小组：约上几个人，定好时间，一起坚持。',
  active: '/square/',
  scripts: [GROUPS_JS],
  body: `<main class="wrap page" data-page="square">
<h1 class="page-title">小组广场</h1>
<p class="page-lead">约上两三个人，定好时间，一起坚持。看到合适的小组可以申请加入，也可以自己发起一个。</p>
<p class="btn-row"><a class="btn btn-life" href="/square/new/">发起一个小组</a></p>
<section id="mine" class="mine" hidden><h2 class="sub-h">我的小组</h2><div class="glist" data-mine></div></section>
<div class="tabs" role="tablist" aria-label="小组类型">
<button type="button" role="tab" data-kind="" aria-selected="true">全部</button>
${Object.entries(GROUP_KINDS).map(([k, l]) => `<button type="button" role="tab" data-kind="${k}" aria-selected="false">${l}</button>`).join('')}
</div>
<div class="glist" data-plaza aria-live="polite"><p class="muted">正在载入……</p></div>
</main>`,
});

const bookOptions = BOOKS.map((b) => `<option value="${b.n}" data-ch="${b.chapters}"${b.n === 43 ? ' selected' : ''}>${b.name}</option>`).join('');
const tzOptions = Object.entries(TZ_LABELS).map(([tz, label]) => `<option value="${tz}">${label}</option>`).join('');
const chip = (name, value, label, checked = false, type = 'checkbox') =>
  `<label class="chip"><input type="${type}" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;

emit('/square/new/', {
  title: '发起一个小组',
  active: '/square/',
  noindex: true,
  scripts: [GROUPS_JS],
  body: `<main class="wrap page" data-page="new">
<p class="back"><a href="/square/">回到广场</a></p>
<h1 class="page-title">发起一个小组</h1>
<p class="page-lead">填好下面几项，会生成一个邀请链接。朋友点开链接、留下称呼和联系方式，就算立约加入了。</p>
<form class="form" data-new novalidate>
<fieldset>
<legend>小组类型</legend>
<div class="kind-pick">
${Object.entries(KIND_INFO).map(([k, [l, d]], i) => `<label class="kind-opt"><input type="radio" name="kind" value="${k}"${i ? '' : ' checked'}><span class="gtag gtag-${k}">${l}</span><small>${d}</small></label>`).join('')}
</div>
</fieldset>

<fieldset>
<legend>名称和介绍</legend>
<label class="field"><span>小组名称</span><input name="title" maxlength="40" required placeholder="例如：一起读约翰福音"></label>
<label class="field"><span>简单介绍<em>可以不写</em></span><textarea name="intro" maxlength="300" rows="3" placeholder="例如：每次读完分享一两句，不需要什么基础。"></textarea></label>
</fieldset>

<fieldset data-for="read">
<legend>读什么</legend>
<div class="row2">
<label class="field"><span>书卷</span><select name="book">${bookOptions}</select></label>
<label class="field"><span>从第几章开始</span><select name="chapter"></select></label>
</div>
<label class="field"><span>每次读几章</span><select name="per">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} 章</option>`).join('')}</select></label>
<label class="check"><input type="checkbox" name="cont"><span>这一卷读完后，接着读下一卷</span></label>
</fieldset>

<fieldset data-for="pray feed" hidden>
<legend>每次的内容</legend>
<label class="field"><span>内容或材料<em>以后可以随时更新</em></span><textarea name="material" maxlength="300" rows="3" placeholder="例如：为家中还没有信主的亲人祷告"></textarea></label>
<label class="field"><span>材料链接<em>可以不填</em></span><input name="link" type="url" inputmode="url" maxlength="300" placeholder="https://"></label>
</fieldset>

<fieldset>
<legend>什么时候</legend>
<div class="field"><span>每周哪几天</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => chip('days', d, `周${WEEK_SHORT[d]}`)).join('')}</div></div>
<div class="row2">
<label class="field"><span>几点开始</span><input name="time" type="time" value="20:00" required></label>
<label class="field"><span>每次多长</span><select name="minutes">${[15, 20, 30, 45, 60, 90, 120].map((m) => `<option value="${m}"${m === 30 ? ' selected' : ''}>${m < 60 ? `${m} 分钟` : `${m / 60} 小时`.replace('1.5 小时', '1 小时 30 分钟')}</option>`).join('')}</select></label>
</div>
<div class="row2">
<label class="field"><span>从哪天开始</span><input name="startDate" type="date" required></label>
<label class="field"><span>按哪里的时间</span><select name="tz">${tzOptions}</select></label>
</div>
<p class="hint">组员在世界各地都没关系，每个人看到的都是自己手机上的时间。</p>
</fieldset>

<fieldset>
<legend>谁能加入</legend>
<div class="radios">
<label class="check"><input type="radio" name="visibility" value="public" checked><span>放在广场上，别人可以看到、申请加入</span></label>
<label class="check"><input type="radio" name="visibility" value="invite"><span>不公开，只有收到邀请链接的人能加入</span></label>
</div>
<div class="radios" data-for-public>
<p class="field-label">广场上的人想加入时</p>
<label class="check"><input type="radio" name="joinMode" value="approve" checked><span>要我同意</span></label>
<label class="check"><input type="radio" name="joinMode" value="open"><span>直接加入</span></label>
</div>
<label class="field"><span>最多几个人</span><select name="max">${[3, 5, 8, 12, 20, 50].map((n) => `<option value="${n}"${n === 12 ? ' selected' : ''}>${n} 人</option>`).join('')}<option value="">不限</option></select></label>
</fieldset>

<fieldset>
<legend>你的信息</legend>
<label class="field"><span>你的称呼</span><input name="name" maxlength="20" required placeholder="例如：陈弟兄、小李" autocomplete="nickname"></label>
<label class="field"><span>邮箱或手机号</span><input name="contact" maxlength="120" required placeholder="用来发提醒" autocomplete="email" inputmode="email"></label>
<p class="hint">联系方式只用来发提醒，任何人都看不到。填邮箱可以收到提醒邮件；手机号的短信提醒以后开通，现在可以先把时间加进手机日历。</p>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
</fieldset>

<section class="covenant-card" aria-live="polite">
<h2>小组的约</h2>
<p data-summary></p>
<label class="check"><input type="checkbox" name="covenant"><span data-covenant-text>我愿意按上面的约定，坚定持续地和组员一起读经。</span></label>
</section>
<p class="form-error" data-error role="alert" hidden></p>
<button class="btn btn-life btn-block" type="submit">发起小组</button>
</form>
</main>`,
});

write('/g/', page({
  title: '小组',
  url: '/g/',
  active: '/square/',
  noindex: true,
  scripts: [GROUPS_JS],
  body: `<main class="wrap page" data-page="group">
<div data-group aria-live="polite"><p class="muted">正在载入小组……</p></div>
</main>`,
}));

write('/admin/', page({
  title: '管理',
  url: '/admin/',
  noindex: true,
  scripts: [GROUPS_JS],
  body: `<main class="wrap page" data-page="admin">
<h1 class="page-title">管理小组</h1>
<p class="page-lead">撤下不合适的小组：撤下后广场和小组页面都看不到。</p>
<form class="form admin-key" data-admin-key><label class="field"><span>管理密码</span><input name="key" type="password" autocomplete="current-password"></label><button class="btn btn-life" type="submit">进入</button></form>
<div class="glist" data-admin-list></div>
</main>`,
}));

// 404
write('/404', page({
  title: '找不到这个页面',
  url: '/404',
  noindex: true,
  body: `<main class="wrap page">
<h1 class="page-title">找不到这个页面</h1>
<p class="page-lead">链接可能输错了，或者内容已经换了位置。</p>
<p><a class="btn btn-life" href="/">回到首页</a></p>
</main>`,
}));
fs.renameSync(path.join(DIST, '404/index.html'), path.join(DIST, '404.html'));
fs.rmdirSync(path.join(DIST, '404'));

// sitemap + robots
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.url}${u}</loc></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`built ${urls.length} pages: ${articles.length} articles, ${videos.length} videos, ${prayers.length} prayer days (today ${TODAY}: ${todayPrayer?.date ?? 'none'})`);
