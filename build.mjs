// build.mjs: builds 有光 (zion4life.faith) into dist/. No dependencies; run `node build.mjs`.
// Two languages: Chinese at the root, English under /en/. Content lives in content/ (see README.md).
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
const LANGS = ['zh', 'en'];
const site = readJSON('site.json');
const TAGS = readJSON('tags.json');
const TAG = Object.fromEntries(TAGS.map((t) => [t.id, t]));
const TINTS = { aqua: 'var(--t-aqua)', mint: 'var(--t-mint)', sky: 'var(--t-sky)', lilac: 'var(--t-lilac)', peach: 'var(--t-peach)', sun: 'var(--t-sun)' };

// ---------- words on the page ----------
const S = {
  zh: {
    tabs: ['粮仓', '呼吸', '搭子', '我的'],
    today: '今日呼吸', dazi: '搭子', daziSub: '一起吃饭、一起呼吸', newest: '最新：',
    back: '回粮仓', count: (n) => (n ? `${n} 样粮食` : '还没上架'),
    all: '全部', reads: '文章', videos: '视频', kind: { page: '单页', article: '文章', video: '视频' },
    min: (m) => (m >= 60 ? `约 ${m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分钟` : `${m / 60} 小时`}` : `${m} 分钟`),
    readMin: (m) => `约 ${m} 分钟读完`,
    empty: '这一格还空着，粮食正在路上。', sample: '示例',
    sampleNote: '排版示例：正文是占位内容，正式内容到了会替换。',
    fallback: '这篇还没有中文版，先显示英文原文。',
    shareArticle: '如果这篇对你有帮助，也发给你关心的人。', shareVideo: '把这段视频发给你关心的人。',
    shareBtn: '分享给朋友', shareWx: '在微信里，点右上角“···”，就能发送给朋友或分享到朋友圈。',
    more: '继续吃', play: '播放', soon: '视频即将上线', lineTip: '播放不了的话，换一条线路试试。',
    huxi: '呼吸', huxiSub: '每天打开这个链接，都是当天的内容。', huxiShare: '把这个链接发给弟兄姊妹，他们每天打开，看到的都是当天的呼吸。',
    huxiDayShare: '把这一天的呼吸发给弟兄姊妹。', past: '往期', todayLink: '看今天的呼吸',
    week: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'], weekShort: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    md: (m, d) => `${m}月${d}日`, full: (y, m, d) => `${y}年${m}月${d}日`,
    me: '我的', meSub: '你的搭子、打卡和留言，都会在这里。',
    signupT: '注册和登录正在建造中', signupP: '开放以后，用邮箱就能注册，不用记密码。你加入的搭子、打过的卡、留过的言都会跟着你，换手机也在。',
    myGroups: '我的搭子',
    askT: '有问题想问？', askP: '写下来，我们会认真看。想收到回复的话，留一个邮箱。',
    askMsg: '想问什么，都可以写在这里', askName: '怎么称呼你（可以不填）', askReply: '回信邮箱（可以不填）', askSend: '发送',
    askDone: '收到了，谢谢你。我们会认真看。',
    plazaT: '搭子广场', plazaP: '约上两三个人，定好时间，一起坚持。',
    copyright: (y) => `© ${y} ${site.owner}`,
    notFound: '找不到这个页面', notFoundP: '链接可能输错了，或者内容已经换了位置。', home: '回到粮仓',
  },
  en: {
    tabs: ['Granary', 'Breathe', 'Buddies', 'Me'],
    today: 'Breathe today', dazi: 'Buddies', daziSub: 'Eat together, breathe together', newest: 'New: ',
    back: 'Back to the Granary', count: (n) => (n ? `${n} ${n > 1 ? 'things' : 'thing'} to eat` : 'Nothing here yet'),
    all: 'All', reads: 'Reads', videos: 'Videos', kind: { page: 'One page', article: 'Read', video: 'Video' },
    min: (m) => (m >= 60 ? `about ${m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`}` : `${m} min`),
    readMin: (m) => `${m} min read`,
    empty: 'This shelf is still empty. Food is on the way.', sample: 'Sample',
    sampleNote: 'Layout sample: the text is a placeholder and will be replaced with the real content.',
    fallback: 'This piece has no English version yet, so the Chinese original is shown.',
    shareArticle: 'If this helped you, send it to someone you care about.', shareVideo: 'Send this video to someone you care about.',
    shareBtn: 'Share', shareWx: 'In WeChat, tap "···" at the top right to send it to a friend or to Moments.',
    more: 'Keep eating', play: 'Play', soon: 'Video coming soon', lineTip: 'If it will not play, try another line.',
    huxi: 'Breathe', huxiSub: 'Open this link any day and you see that day.', huxiShare: 'Send this link to brothers and sisters. Each day they open it, they see that day.',
    huxiDayShare: 'Send this day to brothers and sisters.', past: 'Earlier days', todayLink: 'See today',
    week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], weekShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    md: (m, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`,
    full: (y, m, d) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}`,
    me: 'Me', meSub: 'Your buddies, check-ins and messages live here.',
    signupT: 'Sign-up is being built', signupP: 'Soon you can sign up with just your email, no password to remember. Your buddy groups, check-ins and messages will follow you, even on a new phone.',
    myGroups: 'My buddy groups',
    askT: 'Have a question?', askP: 'Write it here and we will read it carefully. Leave an email if you would like a reply.',
    askMsg: 'Ask anything here', askName: 'Your name (optional)', askReply: 'Email for a reply (optional)', askSend: 'Send',
    askDone: 'Got it, thank you. We will read it carefully.',
    plazaT: 'Buddies', plazaP: 'Buddy groups are being rebuilt with full English support. For now, the plaza is in Chinese.',
    copyright: (y) => `© ${y} ${site.owner}`,
    notFound: 'Page not found', notFoundP: 'The link may be mistyped, or the page has moved.', home: 'Back to the Granary',
  },
};

// ---------- helpers ----------
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, rel), 'utf8'));
}
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' rel="noopener" target="_blank"' : ''}>${t}</a>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return h;
}
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
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
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
  const words = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
  return Math.max(1, Math.round(cjk / 380 + words / 220));
}
function dateParts(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const L = S[lang];
  return { md: L.md(m, d), full: L.full(y, m, d), wd: L.week[wd], wdShort: L.weekShort[wd], d };
}
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const splitTags = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,，\s]+/)).map((x) => x.trim()).filter(Boolean);

// ---------- content ----------
// A piece of writing is <slug>.zh.md and/or <slug>.en.md. Shared fields (date, type, tags, sample) may sit in either.
function loadPairs(dir) {
  const full = path.join(CONTENT, dir);
  const map = new Map();
  for (const f of fs.readdirSync(full)) {
    const m = f.match(/^(.+)\.(zh|en)\.md$/);
    if (!m || f.startsWith('_')) continue;
    const { meta, body } = parseDoc(fs.readFileSync(path.join(full, f), 'utf8'));
    if (!map.has(m[1])) map.set(m[1], { slug: m[1], meta: {}, langs: {} });
    const e = map.get(m[1]);
    Object.assign(e.meta, Object.fromEntries(Object.entries(meta).filter(([k]) => !['title', 'summary'].includes(k))));
    e.langs[m[2]] = { title: meta.title || '', summary: meta.summary || '', html: md(body) };
  }
  for (const e of map.values()) {
    for (const lang of LANGS) {
      if (!e.langs[lang]) {
        const other = e.langs[lang === 'zh' ? 'en' : 'zh'];
        e.langs[lang] = { ...other, fallback: true };
      }
    }
  }
  return [...map.values()];
}
const articles = loadPairs('articles')
  .filter((a) => !a.meta.hidden)
  .map((a) => {
    const tags = splitTags(a.meta.tags);
    for (const t of tags) if (!TAG[t]) throw new Error(`content/articles/${a.slug}: unknown tag "${t}" (add it to content/tags.json)`);
    return {
      kind: a.meta.type === 'page' ? 'page' : 'article', slug: a.slug, date: String(a.meta.date || ''), tags, sample: !!a.meta.sample,
      zh: a.langs.zh, en: a.langs.en, minutes: Object.fromEntries(LANGS.map((l) => [l, readMinutes(plain(a.langs[l].html))])),
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));
const videos = readJSON('videos.json').map((v) => {
  for (const t of v.tags || []) if (!TAG[t]) throw new Error(`videos.json ${v.slug}: unknown tag "${t}"`);
  return { ...v, kind: 'video', tags: v.tags || [], sources: v.sources || [] };
}).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const items = [...articles, ...videos].sort((a, b) => String(b.date).localeCompare(String(a.date)));
const itemsOf = (tagId) => items.filter((i) => i.tags.includes(tagId));

const huxi = loadPairs('huxi').map((p) => {
  const date = String(p.meta.date || p.slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`content/huxi/${p.slug}: date must be YYYY-MM-DD`);
  const ex = (l) => plain(p.langs[l].html.split('\n')[0]).slice(0, 90);
  return { date, sample: !!p.meta.sample, zh: { ...p.langs.zh, excerpt: ex('zh') }, en: { ...p.langs.en, excerpt: ex('en') } };
}).sort((a, b) => b.date.localeCompare(a.date));
const todayHuxi = huxi.find((p) => p.date <= TODAY) || huxi[huxi.length - 1];
const recentHuxi = huxi.filter((p) => p.date >= shiftDate(TODAY, -2));

// ---------- assets ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(STATIC, DIST, { recursive: true });
const ver = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(STATIC, rel))).digest('hex').slice(0, 10);
const CSS = `/css/site.css?v=${ver('css/site.css')}`;
const FONT = `/css/wenkai.css?v=${ver('css/wenkai.css')}`;
const JS = `/js/site.js?v=${ver('js/site.js')}`;
const GROUPS_JS = `/js/groups.js?v=${ver('js/groups.js')}`;
const LOGO = fs.readFileSync(path.join(STATIC, 'logo.svg'), 'utf8').replace('<svg ', '<svg class="logo" aria-hidden="true" ');
const MASCOT = (cls = 'mascot') => `<svg class="${cls}" viewBox="0 0 100 124" aria-hidden="true"><path d="M50 3C50 3 11 51 11 80a39 39 0 0 0 78 0C89 51 50 3 50 3z" fill="var(--t-aqua)"/><ellipse cx="36" cy="40" rx="7" ry="12" transform="rotate(28 36 40)" fill="#fff" opacity=".7"/><ellipse cx="38" cy="80" rx="4.5" ry="6.5" fill="#1b2a38"/><ellipse cx="62" cy="80" rx="4.5" ry="6.5" fill="#1b2a38"/><circle cx="39.5" cy="77.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="77.5" r="1.6" fill="#fff"/><ellipse cx="29" cy="92" rx="6" ry="3.5" fill="var(--blush)"/><ellipse cx="71" cy="92" rx="6" ry="3.5" fill="var(--blush)"/><path d="M45 92q5 5 10 0" stroke="#1b2a38" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><path d="M17 13.5c0 0-3.5 3.6-3.5 5.2a3.5 3.5 0 0 0 7 0c0-1.6-3.5-5.2-3.5-5.2z"/></svg>',
  huxi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></svg>',
  dazi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 12h17a8.5 7.5 0 0 1-17 0z"/><path d="M15 3.5l-3 7M19 4.5l-5 6" stroke-linecap="round"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c1.4-3.8 4.4-5.5 8-5.5s6.6 1.7 8 5.5" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
};

// ---------- layout ----------
const pre = (lang) => (lang === 'en' ? '/en' : '');
const U = (lang, p) => pre(lang) + p;
const TABS = [['home', '/'], ['huxi', '/huxi/'], ['dazi', '/dazi/'], ['me', '/me/']];
const sampleTag = (x, lang) => (x.sample ? `<span class="tag-s">${S[lang].sample}</span>` : '');
const json = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const urls = [];

function page({ lang, title, desc, path: p, body, tab = '', noindex = false, scripts = [], only = false }) {
  const L = S[lang];
  const name = site[lang].name;
  const full = title ? `${title}｜${name}` : `${name}｜zion4life.faith`;
  const canonical = site.url + U(lang, p);
  const alt = (l) => (only ? U(l, '/') : U(l, p));
  const tabs = TABS.map(([k, href], i) =>
    `<a href="${U(lang, href)}"${tab === k ? ' aria-current="page"' : ''}>${ICON[k]}<span>${L.tabs[i]}</span></a>`).join('');
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || site[lang].description)}">
<link rel="canonical" href="${canonical}">
${only ? '' : LANGS.map((l) => `<link rel="alternate" hreflang="${l === 'zh' ? 'zh-CN' : 'en'}" href="${site.url + U(l, p)}">`).join('\n')}
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:title" content="${esc(title || name)}">
<meta property="og:description" content="${esc(desc || site[lang].description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/img/og-${lang}.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#eaf6ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c1824" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="${FONT}">
<link rel="stylesheet" href="${CSS}">
</head>
<body>
<header class="topbar"><div class="wrap topbar-in">
<a class="brand" href="${U(lang, '/')}">${LOGO}<span><b>${esc(name)}</b><small>zion4life.faith</small></span></a>
<nav class="lang" aria-label="Language"><a href="${alt('zh')}" hreflang="zh-CN"${lang === 'zh' ? ' aria-current="true"' : ''} data-lang="zh">中</a><a href="${alt('en')}" hreflang="en"${lang === 'en' ? ' aria-current="true"' : ''} data-lang="en">EN</a></nav>
</div></header>
<main class="wrap">
${body}
<footer class="foot"><b>${esc(name)}</b> zion4life.faith<br><span class="mail">${esc(site.contact)}</span><br>${esc(L.copyright(new Date().getFullYear()))}</footer>
</main>
<div class="tab-space"></div>
<nav class="tabbar" aria-label="${lang === 'zh' ? '菜单' : 'Menu'}"><div class="tabbar-in">${tabs}</div></nav>
<div class="toast" role="status" aria-live="polite" hidden></div>
<script src="${JS}" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}
function write(urlPath, html) {
  const file = path.join(DIST, urlPath === '/' ? 'index.html' : `${urlPath.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
function emit(lang, p, opts) {
  write(U(lang, p), page({ ...opts, lang, path: p }));
  if (!opts.noindex) urls.push(U(lang, p));
}

// ---------- shared pieces ----------
function itemHref(it, lang) {
  return U(lang, it.kind === 'video' ? `/v/${it.slug}/` : `/a/${it.slug}/`);
}
function card(it, lang, current) {
  const L = S[lang];
  const c = it[lang];
  const tint = TINTS[TAG[it.tags[0]]?.tint || 'aqua'];
  const others = it.tags.filter((x) => x !== current).map((x) => `<span class="other">${esc(TAG[x][lang])}</span>`).join('');
  if (it.kind === 'video') {
    return `<a class="card" href="${itemHref(it, lang)}" data-kind="videos" style="--tint:${tint}">
<span class="poster"><span class="play">${ICON.play}</span><span class="dur">${esc(L.min(it.minutes))}</span>${MASCOT()}</span>
<span class="card-body" style="display:block"><span class="kind">${L.kind.video}</span>${sampleTag(it, lang)}<h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><span class="meta">${others}</span></span></a>`;
  }
  return `<a class="card" href="${itemHref(it, lang)}" data-kind="reads" style="--tint:${tint}"><span class="card-body" style="display:block">
<span class="kind">${L.kind[it.kind]}</span>${sampleTag(it, lang)}<h3>${esc(c.title)}</h3>${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
<span class="meta"><span>${esc(L.min(it.minutes[lang]))}</span>${others}</span></span></a>`;
}
function shareBox(lang, text, sharePath, title) {
  const L = S[lang];
  return `<div class="share" data-share data-url="${esc(site.url + sharePath)}" data-title="${esc(title)}" data-copied="${lang === 'zh' ? '链接已复制，粘贴发给朋友就可以了' : 'Link copied. Paste it to a friend.'}">
<p>${esc(text)}</p><button class="btn btn-water" type="button" data-share-btn data-copy-label="${lang === 'zh' ? '复制链接' : 'Copy link'}">${L.shareBtn}</button>
<p class="share-wx" hidden>${esc(L.shareWx)}</p></div>`;
}
function askBox(lang) {
  const L = S[lang];
  return `<form class="ask" data-ask data-lang="${lang}" data-done="${esc(L.askDone)}" novalidate>
<h2>${esc(L.askT)}</h2><p>${esc(L.askP)}</p>
<textarea name="message" maxlength="3000" required placeholder="${esc(L.askMsg)}" aria-label="${esc(L.askMsg)}"></textarea>
<div class="row"><input name="name" maxlength="40" placeholder="${esc(L.askName)}" aria-label="${esc(L.askName)}" autocomplete="nickname"><input name="reply" type="email" maxlength="120" placeholder="${esc(L.askReply)}" aria-label="${esc(L.askReply)}" autocomplete="email" inputmode="email"></div>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${esc(L.askSend)}</button>
</form>`;
}
function huxiData(lang, list) {
  return list.map((p) => {
    const d = dateParts(p.date, lang);
    return { date: p.date, md: d.md, d: String(d.d), wd: d.wd, title: p[lang].title, excerpt: p[lang].excerpt, html: p[lang].html, sample: p.sample };
  });
}

// ---------- pages ----------
for (const lang of LANGS) {
  const L = S[lang];

  // 粮仓 (home): today's 呼吸, 搭子, then every tag as a tile. Tiles fill whole rows of three.
  {
    const tiles = [{ type: 'today', cells: 2 }, { type: 'dazi', cells: 1 }];
    for (const t of TAGS) tiles.push({ type: 'tag', tag: t, cells: t.size === 'big' ? 4 : t.size === 'wide' ? 2 : 1, size: t.size });
    let total = tiles.reduce((s, x) => s + x.cells, 0);
    for (let i = tiles.length - 1; total % 3 && i >= 0; i--) {
      if (tiles[i].type === 'tag' && !tiles[i].size) { tiles[i].size = 'wide'; tiles[i].cells = 2; total++; }
    }
    const tp = todayHuxi;
    const tpd = tp && dateParts(tp.date, lang);
    const html = tiles.map((x) => {
      if (x.type === 'today') {
        return `<a class="tile w2" href="${U(lang, '/huxi/')}" style="--tint:var(--t-sun)" data-ripple${tp ? ` data-huxi-today data-date="${tp.date}"` : ''}>
<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></svg>
<span class="name">${esc(L.today)}</span><span class="sub">${tp ? `<span data-f="md">${esc(tpd.md)}</span> <span data-f="title">${esc(tp[lang].title)}</span>` : ''}</span></a>`;
      }
      if (x.type === 'dazi') {
        return `<a class="tile" href="${U(lang, '/dazi/')}" style="--tint:var(--t-mint)" data-ripple><span class="name">${esc(L.dazi)}</span><span class="sub">${esc(L.daziSub)}</span></a>`;
      }
      const t = x.tag;
      const list = itemsOf(t.id);
      const cls = `tile${x.size === 'big' ? ' w2 h2 big' : x.size === 'wide' ? ' w2' : ''}${t.person ? ' person' : ''}`;
      const sub = list.length && x.size ? L.newest + list[0][lang].title : '';
      return `<a class="${cls}" href="${U(lang, `/t/${t.id}/`)}" style="--tint:${TINTS[t.tint] || TINTS.aqua}" data-ripple>${x.size === 'big' ? MASCOT() : ''}${t.person ? `<span class="avatar">${esc(t.person[lang])}</span>` : list.length ? `<span class="num">${list.length}</span>` : ''}
<span class="name">${esc(t[lang])}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</a>`;
    }).join('\n');
    emit(lang, '/', {
      title: '',
      tab: 'home',
      body: `<section class="hello"><h1>${esc(site[lang].hi)}</h1><p>${esc(site[lang].hiSub)}</p></section>
<section class="grid">${html}</section>
${json('huxi-data', huxiData(lang, recentHuxi).map(({ html: _h, ...r }) => r))}
${askBox(lang)}`,
    });
  }

  // tag pages
  for (const t of TAGS) {
    const list = itemsOf(t.id);
    const reads = list.filter((i) => i.kind !== 'video').length;
    const vids = list.length - reads;
    const chips = list.length
      ? `<div class="chips" role="group" data-filters>${[['all', list.length], ['reads', reads], ['videos', vids]].filter(([k, n]) => k === 'all' || n)
        .map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${k === 'all'}">${L[k]} ${n}</button>`).join('')}</div>`
      : '';
    emit(lang, `/t/${t.id}/`, {
      title: t[lang],
      desc: `${t[lang]}｜${site[lang].description}`,
      tab: 'home',
      body: `<section class="page" style="--tint:${TINTS[t.tint] || TINTS.aqua}">
<a class="back" href="${U(lang, '/')}">← ${esc(L.back)}</a>
<div class="banner"><h1>${esc(t[lang])}</h1><p>${esc(L.count(list.length))}</p>${MASCOT()}</div>
${chips}
${list.length ? `<div class="cards">${list.map((it) => card(it, lang, t.id)).join('\n')}</div>` : `<div class="empty">${MASCOT()}<p>${esc(L.empty)}</p></div>`}
</section>`,
    });
  }

  // articles and single pages
  for (const a of articles) {
    const c = a[lang];
    const related = items.filter((x) => x !== a && x.tags.some((t) => a.tags.includes(t))).slice(0, 4);
    emit(lang, `/a/${a.slug}/`, {
      title: c.title,
      desc: c.summary || plain(c.html).slice(0, 90),
      tab: 'home',
      noindex: a.sample,
      body: `<article class="article" style="--tint:${TINTS[TAG[a.tags[0]]?.tint] || TINTS.aqua}">
<a class="back" href="${U(lang, a.tags[0] ? `/t/${a.tags[0]}/` : '/')}">← ${esc(a.tags[0] ? TAG[a.tags[0]][lang] : L.back)}</a>
<h1 class="a-title">${esc(c.title)}</h1>
<div class="a-meta">${a.date ? `<time datetime="${a.date}">${esc(dateParts(a.date, lang).full)}</time>` : ''}<span>${esc(L.readMin(a.minutes[lang]))}</span></div>
<div class="a-tags">${a.tags.map((t) => `<a class="chiplink" style="--tint:${TINTS[TAG[t].tint]}" href="${U(lang, `/t/${t}/`)}">${esc(TAG[t][lang])}</a>`).join('')}</div>
${c.fallback ? `<p class="note-box">${esc(L.fallback)}</p>` : ''}${a.sample ? `<p class="note-box">${esc(L.sampleNote)}</p>` : ''}
<div class="prose"${c.fallback ? ` lang="${lang === 'zh' ? 'en' : 'zh-CN'}"` : ''}>
${c.html}
</div>
${shareBox(lang, L.shareArticle, U(lang, `/a/${a.slug}/`), c.title)}
${related.length ? `<section class="more"><h2 class="sec-h">${esc(L.more)}</h2><div class="cards">${related.map((x) => card(x, lang)).join('\n')}</div></section>` : ''}
</article>`,
    });
  }

  // videos
  for (const v of videos) {
    const c = v[lang];
    const sources = v.sources.map((s, i) => ({ ...s, label: s.label || (lang === 'zh' ? `线路${i + 1}` : `Line ${i + 1}`) }));
    const related = items.filter((x) => x !== v && x.tags.some((t) => v.tags.includes(t))).slice(0, 4);
    emit(lang, `/v/${v.slug}/`, {
      title: c.title,
      desc: c.summary || c.title,
      tab: 'home',
      noindex: v.sample,
      body: `<article class="article" style="--tint:${TINTS[TAG[v.tags[0]]?.tint] || TINTS.sky}">
<a class="back" href="${U(lang, v.tags[0] ? `/t/${v.tags[0]}/` : '/')}">← ${esc(v.tags[0] ? TAG[v.tags[0]][lang] : L.back)}</a>
<div class="player" data-player>
<button class="player-start" type="button"${sources.length ? '' : ' disabled'} aria-label="${sources.length ? L.play : L.soon}"><span class="poster"><span class="ptitle">${esc(c.title)}</span>${sources.length ? `<span class="play">${ICON.play}</span>` : ''}<span class="dur">${esc(L.min(v.minutes))}</span>${MASCOT()}</span></button>
${sources.length ? '' : `<p class="player-soon">${esc(L.soon)}</p>`}
${json(`src-${v.slug}`, sources)}
</div>
${sources.length > 1 ? `<div class="lines" role="group">${sources.map((s, i) => `<button type="button" data-line="${i}"${i ? '' : ' aria-pressed="true"'}>${esc(s.label)}</button>`).join('')}</div>` : ''}
<h1 class="a-title">${esc(c.title)}${sampleTag(v, lang)}</h1>
<div class="a-meta"><span>${esc(L.min(v.minutes))}</span></div>
<div class="a-tags">${v.tags.map((t) => `<a class="chiplink" style="--tint:${TINTS[TAG[t].tint]}" href="${U(lang, `/t/${t}/`)}">${esc(TAG[t][lang])}</a>`).join('')}</div>
${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
${sources.length > 1 ? `<p class="muted">${esc(L.lineTip)}</p>` : ''}
${shareBox(lang, L.shareVideo, U(lang, `/v/${v.slug}/`), c.title)}
${related.length ? `<section class="more"><h2 class="sec-h">${esc(L.more)}</h2><div class="cards">${related.map((x) => card(x, lang)).join('\n')}</div></section>` : ''}
</article>`,
    });
  }

  // 呼吸: /huxi/ always shows today's; /huxi/<date>/ shows one day
  if (huxi.length) {
    const day = (p, live) => {
      const d = dateParts(p.date, lang);
      return `<article class="day"${live ? ` data-huxi-today data-date="${p.date}"` : ''}>
<div class="day-date"><span class="d" data-f="md">${esc(d.md)}</span><span class="w" data-f="wd">${esc(d.wd)}</span></div>
<h2><span data-f="title">${esc(p[lang].title)}</span>${sampleTag(p, lang)}</h2>
<div class="prose" data-f="html">${p[lang].html}</div></article>`;
    };
    const archive = (current) => `<section class="more" id="archive"><h2 class="sec-h">${esc(L.past)}</h2><ul class="arch">${huxi.map((p) => {
      const d = dateParts(p.date, lang);
      const hide = p.date > TODAY || p.date === current;
      return `<li data-arch="${p.date}"${hide ? ' hidden' : ''}><a href="${U(lang, `/huxi/${p.date}/`)}"><time datetime="${p.date}">${esc(d.md)} ${esc(d.wdShort)}</time><span>${esc(p[lang].title)}</span></a></li>`;
    }).join('')}</ul></section>`;
    emit(lang, '/huxi/', {
      title: L.huxi,
      desc: L.huxiSub,
      tab: 'huxi',
      body: `<section class="page" style="--tint:var(--t-sun)">
<div class="banner"><h1>${esc(L.huxi)}</h1><p>${esc(L.huxiSub)}</p></div>
${day(todayHuxi, true)}
${shareBox(lang, L.huxiShare, U(lang, '/huxi/'), L.huxi)}
${archive(todayHuxi.date)}
${json('huxi-data', huxiData(lang, recentHuxi))}
</section>`,
    });
    for (const p of huxi) {
      const d = dateParts(p.date, lang);
      emit(lang, `/huxi/${p.date}/`, {
        title: `${d.md} ${L.huxi}`,
        desc: p[lang].title,
        tab: 'huxi',
        noindex: p.sample,
        body: `<section class="page" style="--tint:var(--t-sun)">
<a class="back" href="${U(lang, '/huxi/')}">← ${esc(L.todayLink)}</a>
${day(p, false)}
${shareBox(lang, L.huxiDayShare, U(lang, `/huxi/${p.date}/`), `${d.md} ${L.huxi}`)}
${archive(p.date)}
</section>`,
      });
    }
  }

  // 我的
  emit(lang, '/me/', {
    title: L.me,
    tab: 'me',
    noindex: true,
    scripts: lang === 'zh' ? [GROUPS_JS] : [],
    body: `<section class="page" data-page="me" style="--tint:var(--t-sky)">
<div class="banner"><h1>${esc(L.me)}</h1><p>${esc(L.meSub)}</p>${MASCOT()}</div>
<div class="info"><h2>${esc(L.signupT)}</h2><p>${esc(L.signupP)}</p></div>
${lang === 'zh' ? `<section class="more" id="mine" hidden><h2 class="sec-h">${esc(L.myGroups)}</h2><div class="glist" data-mine></div></section>` : ''}
${askBox(lang)}
</section>`,
  });
}

// ---------- 搭子 (group plaza; Chinese for now, rebuilt with both languages in the next step) ----------
const KIND_INFO = {
  read: [GROUP_KINDS.read, '定好一卷圣经，按次往下读。'],
  pray: [GROUP_KINDS.pray, '定好时间，一起为人为事呼吸。'],
  feed: [GROUP_KINDS.feed, '陪伴新朋友，一起追求、一起成长。'],
};
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
emit('zh', '/dazi/', {
  title: S.zh.plazaT,
  desc: S.zh.plazaP,
  tab: 'dazi',
  scripts: [GROUPS_JS],
  body: `<section class="page" data-page="square" style="--tint:var(--t-mint)">
<div class="banner"><h1>${esc(S.zh.plazaT)}</h1><p>${esc(S.zh.plazaP)}</p></div>
<p class="btn-row"><a class="btn btn-water" href="/dazi/new/">发起一个搭子</a></p>
<section id="mine" class="mine" hidden><h2 class="sub-h">我的搭子</h2><div class="glist" data-mine></div></section>
<div class="tabs" role="tablist" aria-label="搭子类型">
<button type="button" role="tab" data-kind="" aria-selected="true">全部</button>
${Object.entries(GROUP_KINDS).map(([k, l]) => `<button type="button" role="tab" data-kind="${k}" aria-selected="false">${l}</button>`).join('')}
</div>
<div class="glist" data-plaza aria-live="polite"><p class="muted">正在载入……</p></div>
</section>`,
});
emit('en', '/dazi/', {
  title: S.en.plazaT,
  tab: 'dazi',
  body: `<section class="page" style="--tint:var(--t-mint)">
<div class="banner"><h1>${esc(S.en.plazaT)}</h1><p>${esc(S.en.plazaP)}</p>${MASCOT()}</div>
<p><a class="btn btn-water" href="/dazi/">Open the plaza (Chinese)</a></p>
</section>`,
});

const bookOptions = BOOKS.map((b) => `<option value="${b.n}" data-ch="${b.chapters}"${b.n === 43 ? ' selected' : ''}>${b.name}</option>`).join('');
const tzOptions = Object.entries(TZ_LABELS).map(([tz, label]) => `<option value="${tz}">${label}</option>`).join('');
const chip = (name, value, label) => `<label class="chip"><input type="checkbox" name="${name}" value="${value}"><span>${label}</span></label>`;
write('/dazi/new/', page({
  lang: 'zh', title: '发起一个搭子', path: '/dazi/new/', tab: 'dazi', noindex: true, only: true, scripts: [GROUPS_JS],
  body: `<section class="page" data-page="new">
<a class="back" href="/dazi/">← 回搭子广场</a>
<h1 class="page-title">发起一个搭子</h1>
<p class="page-lead">填好下面几项，会生成一个邀请链接。朋友点开链接、留下称呼和联系方式，就算立约加入了。</p>
<form class="form" data-new novalidate>
<fieldset><legend>搭子类型</legend><div class="kind-pick">
${Object.entries(KIND_INFO).map(([k, [l, d]], i) => `<label class="kind-opt"><input type="radio" name="kind" value="${k}"${i ? '' : ' checked'}><span class="gtag gtag-${k}">${l}</span><small>${d}</small></label>`).join('')}
</div></fieldset>
<fieldset><legend>名称和介绍</legend>
<label class="field"><span>搭子名称</span><input name="title" maxlength="40" required placeholder="例如：一起读约翰福音"></label>
<label class="field"><span>简单介绍<em>可以不写</em></span><textarea name="intro" maxlength="300" rows="3" placeholder="例如：每次读完分享一两句，不需要什么基础。"></textarea></label>
</fieldset>
<fieldset data-for="read"><legend>读什么</legend>
<div class="row2"><label class="field"><span>书卷</span><select name="book">${bookOptions}</select></label><label class="field"><span>从第几章开始</span><select name="chapter"></select></label></div>
<label class="field"><span>每次读几章</span><select name="per">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} 章</option>`).join('')}</select></label>
<label class="check"><input type="checkbox" name="cont"><span>这一卷读完后，接着读下一卷</span></label>
</fieldset>
<fieldset data-for="pray feed" hidden><legend>每次的内容</legend>
<label class="field"><span>内容或材料<em>以后可以随时更新</em></span><textarea name="material" maxlength="300" rows="3" placeholder="例如：为家中还没有信主的亲人呼吸"></textarea></label>
<label class="field"><span>材料链接<em>可以不填</em></span><input name="link" type="url" inputmode="url" maxlength="300" placeholder="https://"></label>
</fieldset>
<fieldset><legend>什么时候</legend>
<div class="field"><span>每周哪几天</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => chip('days', d, `周${WEEK_SHORT[d]}`)).join('')}</div></div>
<div class="row2"><label class="field"><span>几点开始</span><input name="time" type="time" value="20:00" required></label>
<label class="field"><span>每次多长</span><select name="minutes">${[15, 20, 30, 45, 60, 90, 120].map((m) => `<option value="${m}"${m === 30 ? ' selected' : ''}>${m < 60 ? `${m} 分钟` : m === 90 ? '1 小时 30 分钟' : `${m / 60} 小时`}</option>`).join('')}</select></label></div>
<div class="row2"><label class="field"><span>从哪天开始</span><input name="startDate" type="date" required></label><label class="field"><span>按哪里的时间</span><select name="tz">${tzOptions}</select></label></div>
<p class="hint">搭子在世界各地都没关系，每个人看到的都是自己手机上的时间。</p>
</fieldset>
<fieldset><legend>谁能加入</legend>
<div class="radios"><label class="check"><input type="radio" name="visibility" value="public" checked><span>放在广场上，别人可以看到、申请加入</span></label>
<label class="check"><input type="radio" name="visibility" value="invite"><span>不公开，只有收到邀请链接的人能加入</span></label></div>
<div class="radios" data-for-public><p class="field-label">广场上的人想加入时</p><label class="check"><input type="radio" name="joinMode" value="approve" checked><span>要我同意</span></label><label class="check"><input type="radio" name="joinMode" value="open"><span>直接加入</span></label></div>
<label class="field"><span>最多几个人</span><select name="max">${[2, 3, 4, 5, 6, 8, 12].map((n) => `<option value="${n}"${n === 6 ? ' selected' : ''}>${n} 人</option>`).join('')}<option value="">不限</option></select></label>
</fieldset>
<fieldset><legend>你的信息</legend>
<label class="field"><span>你的称呼</span><input name="name" maxlength="20" required placeholder="例如：陈弟兄、小李" autocomplete="nickname"></label>
<label class="field"><span>邮箱或手机号</span><input name="contact" maxlength="120" required placeholder="用来发提醒" autocomplete="email" inputmode="email"></label>
<p class="hint">联系方式只用来发提醒，任何人都看不到。</p>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
</fieldset>
<section class="covenant-card" aria-live="polite"><h2>搭子的约</h2><p data-summary></p>
<label class="check"><input type="checkbox" name="covenant"><span data-covenant-text>我愿意按上面的约定，坚定持续地和搭子们一起吃饭。</span></label></section>
<p class="form-error" data-error role="alert" hidden></p>
<button class="btn btn-water btn-block" type="submit">发起搭子</button>
</form>
</section>`,
}));
write('/g/', page({ lang: 'zh', title: '搭子', path: '/g/', tab: 'dazi', noindex: true, only: true, scripts: [GROUPS_JS], body: '<section class="page" data-page="group"><div data-group aria-live="polite"><p class="muted">正在载入……</p></div></section>' }));
write('/admin/', page({
  lang: 'zh', title: '管理', path: '/admin/', noindex: true, only: true, scripts: [GROUPS_JS],
  body: `<section class="page" data-page="admin">
<h1 class="page-title">管理</h1>
<p class="page-lead">看大家发来的问题，撤下不合适的搭子。</p>
<form class="form admin-key" data-admin-key><label class="field"><span>管理密码</span><input name="key" type="password" autocomplete="current-password"></label><button class="btn btn-water" type="submit">进入</button></form>
<section data-admin-asks hidden><h2 class="sub-h">大家发来的问题</h2><div class="glist" data-ask-list></div></section>
<section data-admin-groups hidden><h2 class="sub-h">搭子</h2><div class="glist" data-admin-list></div></section>
</section>`,
}));

// 404 (both languages on one page)
fs.writeFileSync(path.join(DIST, '404.html'), page({
  lang: 'zh', title: S.zh.notFound, path: '/404', noindex: true, only: true,
  body: `<section class="page"><div class="banner"><h1>${S.zh.notFound}</h1><p>${S.zh.notFoundP}<br>${S.en.notFoundP}</p>${MASCOT()}</div>
<p class="btn-row"><a class="btn btn-water" href="/">${S.zh.home}</a><a class="btn btn-line" href="/en/">${S.en.home}</a></p></section>`,
}));

// sitemap + robots
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.url}${u}</loc></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`built ${urls.length} indexed pages: ${articles.length} articles, ${videos.length} videos, ${huxi.length} 呼吸 days, ${TAGS.length} tags, 2 languages (today ${TODAY}: ${todayHuxi?.date ?? 'none'})`);
