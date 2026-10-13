// build.mjs: builds 有光 (zion4life.faith) into dist/. No dependencies; run `node build.mjs`.
// Two languages: Chinese at the root, English under /en/. Content lives in content/ (see README.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './src/bible.js';
import { VENUES } from './src/schedule.js';
import { KINDS as GROUP_KINDS, kindsForPage } from './src/kinds.js';
import { esc, md, plain, readMinutes } from './src/md.js';
import { IDENTITIES } from './src/auth.js';

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
    listen: '读给我听', listenPlay: '播放', listenPause: '暂停', listenAbout: (m) => `约 ${m} 分钟`, speed: '语速',
    subHuxi: '订阅每天的呼吸', subHuxiOn: '已订阅', subHuxiHint: '订阅以后，每天的呼吸上新，“我的”里会收到消息。',
    week: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'], weekShort: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    md: (m, d) => `${m}月${d}日`, full: (y, m, d) => `${y}年${m}月${d}日`,
    me: '我的', meSub: '你的搭子、打卡和留言，都会在这里。', loading: '正在载入……',
    talkT: '留言', postsT: '新上架',
    askT: '有问题想问？', askP: '写下来，我们会认真看。想收到回复的话，留一个邮箱。',
    askMsg: '想问什么，都可以写在这里', askName: '怎么称呼你（可以不填）', askReply: '回信邮箱（可以不填）', askSend: '发送',
    askDone: '收到了，谢谢你。我们会认真看。',
    plazaT: '搭子广场', plazaP: '约上两三个人，定好时间，一起坚持。', newT: '发起一个搭子',
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
    listen: 'Read it to me', listenPlay: 'Play', listenPause: 'Pause', listenAbout: (m) => `about ${m} min`, speed: 'Speed',
    subHuxi: 'Subscribe to Breathe', subHuxiOn: 'Subscribed', subHuxiHint: 'Subscribers get a message in “Me” each day a new Breathe comes.',
    week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], weekShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    md: (m, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`,
    full: (y, m, d) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}`,
    me: 'Me', meSub: 'Your buddies, check-ins and messages live here.', loading: 'Loading…',
    talkT: 'Messages', postsT: 'Just added',
    askT: 'Have a question?', askP: 'Write it here and we will read it carefully. Leave an email if you would like a reply.',
    askMsg: 'Ask anything here', askName: 'Your name (optional)', askReply: 'Email for a reply (optional)', askSend: 'Send',
    askDone: 'Got it, thank you. We will read it carefully.',
    plazaT: 'Buddies', plazaP: 'Two or three people, a set time, and keep going together.', newT: 'Start a buddy group',
    copyright: (y) => `© ${y} ${site.owner}`,
    notFound: 'Page not found', notFoundP: 'The link may be mistyped, or the page has moved.', home: 'Back to the Granary',
  },
};

// ---------- helpers ----------
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, rel), 'utf8'));
}
export { esc, md };
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

// ---------- 呼吸 ----------
// The Markdown HTML of a day, shaped for reading: each ## part in its own <section>, a line
// that is only (《book》 …) a source, a line only in *italics* a note, and every block that is
// read aloud numbered (data-s) so the player can show where it is.
function huxiHtml(html) {
  let n = 0;
  let out = html
    // a verse: the reference on top, then the words
    .replace(/<blockquote class="verse"><p>([^]*?)<\/p>(?:<cite>([^]*?)<\/cite>)?<\/blockquote>/g, (_, v, c) => `<blockquote class="verse">${c ? `<cite>${c}</cite>` : ''}<p class="vt">${v}</p></blockquote>`)
    .replace(/<p>([（(]《[^<]*[）)])<\/p>/g, '<p class="src">$1</p>')
    .replace(/<p>(\((?:[^<]|<\/?em>)*\))<\/p>/g, (m, x) => (/^\(<em>/.test(x) ? `<p class="src">${x}</p>` : m))
    .replace(/<p><em>([^<]*)<\/em><\/p>/g, '<p class="note">$1</p>')
    .replace(/<(h2|h3|p|blockquote)( class="(?:verse|src)")?>/g, (m, tag, attrs = '') => `<${tag}${attrs} data-s="${++n}">`);
  out = out.split(/(?=<h2 )/).map((x) => (x.startsWith('<h2 ') ? `<section class="hx-sec">${x}</section>` : x)).join('\n');
  return out;
}
// The same day as text to read aloud: [{ t: text, s: [block numbers] }], in pieces of about
// a paragraph. Block 0 is the headline and lede. References are written out ("罗十二1" →
// "罗马书十二章1节", "Rom. 12:1" → "Romans 12:1").
const EN_ABBR = {
  'Gen.': 'Genesis', 'Exo.': 'Exodus', 'Lev.': 'Leviticus', 'Num.': 'Numbers', 'Deut.': 'Deuteronomy', 'Josh.': 'Joshua', 'Judg.': 'Judges',
  'Psa.': 'Psalms', 'Prov.': 'Proverbs', 'Eccl.': 'Ecclesiastes', 'S.S.': 'Song of Songs', 'Isa.': 'Isaiah', 'Jer.': 'Jeremiah', 'Lam.': 'Lamentations',
  'Ezek.': 'Ezekiel', 'Dan.': 'Daniel', 'Obad.': 'Obadiah', 'Hab.': 'Habakkuk', 'Zeph.': 'Zephaniah', 'Hag.': 'Haggai', 'Zech.': 'Zechariah', 'Mal.': 'Malachi',
  'Matt.': 'Matthew', 'Rom.': 'Romans', 'Gal.': 'Galatians', 'Eph.': 'Ephesians', 'Phil.': 'Philippians', 'Col.': 'Colossians', 'Philem.': 'Philemon',
  'Heb.': 'Hebrews', 'Rev.': 'Revelation', 'Neh.': 'Nehemiah', 'Esth.': 'Esther', 'Chron.': 'Chronicles', 'Sam.': 'Samuel', 'Cor.': 'Corinthians',
  'Thes.': 'Thessalonians', 'Tim.': 'Timothy', 'Pet.': 'Peter',
};
const ORD = { 1: 'First', 2: 'Second', 3: 'Third' };
const ZH_SHORT = [...BOOKS].sort((a, b) => b.short.length - a.short.length);
const zhRefRe = new RegExp(`(${ZH_SHORT.map((b) => b.short).join('|')})([一二三四五六七八九十百]+|\\d+)[:：]?(\\d+)(?:[~～\\-–](\\d+))?`, 'g');
function speakRefs(text, lang) {
  if (lang === 'en') {
    return text
      .replace(/\b([123]) (Sam|Kings|Chron|Cor|Thes|Tim|Pet|John)\.?(?= \d)/g, (_, o, b) => `${ORD[o]} ${EN_ABBR[`${b}.`] || b}`)
      .replace(/\b(S\.S\.|[A-Z][a-z]+\.)(?= \d)/g, (m) => EN_ABBR[m] || m)
      .replace(/(\d+):(\d+)-(\d+)/g, '$1:$2 to $3');
  }
  return text.replace(zhRefRe, (m, short, ch, v, v2) => {
    const b = ZH_SHORT.find((x) => x.short === short);
    return `${b.zh}${ch}章${v}${v2 ? `至${v2}` : ''}节`;
  });
}
function huxiSpeech(p, lang) {
  const x = p[lang];
  const d = dateParts(p.date, lang);
  const max = lang === 'en' ? 520 : 260;
  const say = (h) => plain(h).replace(/\s+/g, ' ').trim();
  const blocks = [{ s: 0, t: lang === 'en' ? `Breathe for ${d.md}. ${x.title}. ${x.lede}` : `${d.md}的呼吸。${x.title}。${x.lede}` }];
  for (const m of x.html.matchAll(/<(h2|h3|p|blockquote)[^>]*data-s="(\d+)"[^>]*>([^]*?)<\/\1>/g)) {
    const [, tag, k, inner] = m;
    let t;
    if (tag === 'blockquote') {
      const cite = (inner.match(/<cite>([^]*?)<\/cite>/) || [])[1] || '';
      t = `${say(cite)}${lang === 'en' ? '. ' : '。'}${say(inner.replace(/<cite>[^]*?<\/cite>/, ''))}`;
    } else if (/class="src"/.test(m[0])) {
      const inside = say(inner).replace(/^[（(]|[）)]$/g, '');
      t = lang === 'en' ? `From ${inside}.` : `摘自${inside}。`;
    } else {
      t = say(inner);
      // a heading is its own sentence when read aloud
      if (tag !== 'p' && t && !/[。！？.!?：:]$/.test(t)) t += lang === 'en' ? '.' : '。';
    }
    if (t) blocks.push({ s: Number(k), t: speakRefs(t, lang) });
  }
  // pieces: whole blocks together up to `max`; a longer block split at sentence ends
  const chunks = [];
  let cur = null;
  const push = (t, s) => {
    if (cur && cur.t.length + t.length + 1 <= max) { cur.t += (lang === 'en' ? ' ' : '') + t; if (!cur.s.includes(s)) cur.s.push(s); return; }
    cur = { t, s: [s] };
    chunks.push(cur);
  };
  for (const b of blocks) {
    if (b.t.length <= max) { push(b.t, b.s); continue; }
    const sentences = b.t.match(lang === 'en' ? /[^.!?;]+[.!?;]+["”’)]*\s*|[^.!?;]+$/g : /[^。！？；]+[。！？；]+[”’）」]*|[^。！？；]+$/g) || [b.t];
    for (const st of sentences) push(st.trim(), b.s);
  }
  const hash = crypto.createHash('sha1').update(`melotts-1|${lang}|${chunks.map((c) => c.t).join('\n')}`).digest('hex');
  return { hash, chars: chunks.reduce((n, c) => n + c.t.length, 0), chunks };
}

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
    Object.assign(e.meta, Object.fromEntries(Object.entries(meta).filter(([k]) => !['title', 'summary', 'lede'].includes(k))));
    e.langs[m[2]] = { title: meta.title || '', summary: meta.summary || '', lede: meta.lede || '', html: md(body) };
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

// 呼吸 days: a headline (title), a lede, then ## sections (verses as > quotes, the burden,
// the ministry with ### headings and (source) lines). huxiHtml() shapes them for reading;
// huxiSpeech() writes the same text out to be read aloud (src/audio.js records it).
const huxi = loadPairs('huxi').map((p) => {
  const date = String(p.meta.date || p.slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`content/huxi/${p.slug}: date must be YYYY-MM-DD`);
  const one = (l) => {
    const x = p.langs[l];
    const html = huxiHtml(x.html);
    return { ...x, html, excerpt: (x.lede || plain(x.html.split('\n')[0])).slice(0, 90) };
  };
  const day = { date, sample: !!p.meta.sample, zh: one('zh'), en: one('en') };
  day.speech = { zh: huxiSpeech(day, 'zh'), en: huxiSpeech(day, 'en') };
  return day;
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
const APP_JS = `/js/app.js?v=${ver('js/app.js')}`;
const DAZI_JS = `/js/dazi.js?v=${ver('js/dazi.js')}`;
const HUXI_JS = `/js/huxi.js?v=${ver('js/huxi.js')}`;
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
<script src="${APP_JS}" defer></script>
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
    return { date: p.date, md: d.md, full: d.full, d: String(d.d), wd: d.wd, title: p[lang].title, lede: p[lang].lede, excerpt: p[lang].excerpt, html: p[lang].html, sample: p.sample };
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
<div class="banner"><h1>${esc(t[lang])}</h1><p>${esc(L.count(list.length))}</p>${t.person ? `<span class="avatar big">${esc(t.person[lang])}</span>` : MASCOT()}</div>
<div class="tag-tools" data-tag-tools="${t.id}"${t.person ? ' data-person' : ''}></div>
${chips}
<div class="cards" data-tag-posts="${t.id}" hidden></div>
${list.length ? `<div class="cards">${list.map((it) => card(it, lang, t.id)).join('\n')}</div>` : `<div class="empty" data-empty>${MASCOT()}<p>${esc(L.empty)}</p></div>`}
<section class="talk" data-talk="tag:${t.id}"></section>
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
<section class="talk" data-talk="a:${a.slug}"></section>
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
<section class="talk" data-talk="v:${v.slug}"></section>
${related.length ? `<section class="more"><h2 class="sec-h">${esc(L.more)}</h2><div class="cards">${related.map((x) => card(x, lang)).join('\n')}</div></section>` : ''}
</article>`,
    });
  }

  // 呼吸: /huxi/ always shows today's; /huxi/<date>/ shows one day
  if (huxi.length) {
    const minutes = (p) => Math.max(1, Math.round(p.speech[lang].chars / (lang === 'en' ? 14 : 4.2) / 60));
    // 读给我听: plays the day's recording (static/js/huxi.js), under the headline
    const listen = (p) => `<div class="hx-audio" data-audio data-l-play="${esc(L.listenPlay)}" data-l-pause="${esc(L.listenPause)}">
<button class="hx-play" type="button" data-play aria-label="${esc(L.listen)}"><svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg></button>
<div class="hx-a-main"><p class="hx-a-top"><b>${esc(L.listen)}</b><span data-time>${esc(L.listenAbout(minutes(p)))}</span></p>
<div class="hx-a-bar" data-bar role="slider" aria-label="${esc(L.listen)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i data-fill></i></div></div>
<button class="hx-speed" type="button" data-speed aria-label="${esc(L.speed)}">1×</button>
<p class="hx-a-msg" data-msg hidden></p></div>`;
    const day = (p, live) => {
      const d = dateParts(p.date, lang);
      const x = p[lang];
      return `<article class="hx"${live ? ' data-huxi-today' : ''} data-date="${p.date}">
<header class="hx-hero" data-s="0">
<p class="hx-date"><span data-f="full">${esc(d.full)}</span><span class="dot">·</span><span data-f="wd">${esc(d.wd)}</span></p>
<h1 class="hx-title"><span data-f="title">${esc(x.title)}</span>${sampleTag(p, lang)}</h1>
<p class="hx-lede" data-f="lede"${x.lede ? '' : ' hidden'}>${esc(x.lede)}</p>
</header>
${listen(p)}
<div class="hx-body" lang="${lang === 'en' ? 'en' : 'zh-CN'}" data-f="html">${x.html}</div>
<p class="hx-sub"><button type="button" class="btn btn-line btn-sm" data-sub="huxi" data-on="${esc(L.subHuxiOn)}" data-off="${esc(L.subHuxi)}">${esc(L.subHuxi)}</button><span class="hint">${esc(L.subHuxiHint)}</span></p>
</article>`;
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
      scripts: [HUXI_JS],
      body: `<section class="page hx-page" style="--tint:var(--t-sun)">
<p class="hx-kicker"><b>${esc(L.huxi)}</b>${esc(L.huxiSub)}</p>
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
        scripts: [HUXI_JS],
        body: `<section class="page hx-page" style="--tint:var(--t-sun)">
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
    body: `<section class="page" style="--tint:var(--t-sky)">
<div class="banner"><h1>${esc(L.me)}</h1><p>${esc(L.meSub)}</p>${MASCOT()}</div>
<div data-me><p class="muted">${esc(L.loading)}</p></div>
${askBox(lang)}
</section>`,
  });
}

// ---------- data for the pages and the Worker (/data/*.json) ----------
const feed = loadPairs('feed').map((p) => ({ n: Number(p.slug), sample: !!p.meta.sample, zh: p.langs.zh, en: p.langs.en }))
  .filter((p) => Number.isInteger(p.n) && p.n > 0).sort((a, b) => a.n - b.n);
feed.forEach((p, i) => { if (p.n !== i + 1) throw new Error(`content/feed: lessons must be numbered 01, 02, 03 … without gaps (found ${p.n})`); });
function writeData(rel, data) {
  const file = path.join(DIST, 'data', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}
writeData('tags.json', TAGS);
writeData('items.json', items.map((i) => ({ key: `${i.kind === 'video' ? 'v' : 'a'}:${i.slug}`, tags: i.tags, date: i.date, zh: i.zh.title, en: i.en.title })));
writeData('bible.json', BOOKS.map((b) => ({ n: b.n, zh: b.zh, en: b.en, ch: b.chapters })));
writeData('feed.json', feed.map((p) => ({ n: p.n, sample: p.sample, zh: { title: p.zh.title }, en: { title: p.en.title } })));
for (const p of feed) writeData(`feed/${p.n}.json`, { n: p.n, sample: p.sample, zh: { title: p.zh.title, html: p.zh.html }, en: { title: p.en.title, html: p.en.html } });
writeData('huxi.json', huxi.map((p) => ({ date: p.date, zh: { title: p.zh.title }, en: { title: p.en.title } })));
for (const p of huxi) {
  writeData(`huxi/${p.date}.json`, { date: p.date, sample: p.sample, zh: { title: p.zh.title, lede: p.zh.lede, html: p.zh.html }, en: { title: p.en.title, lede: p.en.lede, html: p.en.html } });
  writeData(`huxi/${p.date}.speech.json`, p.speech);
}

// ---------- 搭子 ----------
const DZ = {
  zh: {
    plazaH: '搭子广场', count: '此刻，广场上有 {n} 组搭子', all: '全部', mine: '我的搭子', fab: '发起一个搭子',
    newLead: '填好下面几项，签个名，就会得到一个邀请链接。',
    s1: '一起读什么', s2: '材料用哪种语言', s3: '从哪里开始', s4: '名字和介绍', s5: '什么时候', s6: '在哪里见面', s7: '谁能加入', s8: '立约',
    name: '搭子名字', namePh: '例如：周二晚上一起读约翰福音', intro: '简单介绍', introPh: '例如：每次读完说一两句，不需要什么基础。', optional: '可以不写',
    days: '每周哪几天', time: '几点开始', minutes: '每次多长', start: '从哪天开始',
    tzHint: '按你手机上的时间填。搭子在世界各地都没关系：别人打开邀请链接，看到的会自动换成他自己手机上的时间。',
    venueInfo: '号码、会议链接或微信号', venueHint: '只有立约的组员能看到。到时间了大家自己打电话、开会，网站把要读的材料送到每个人手机上。',
    vis: { public: '公开：放在广场上，大家都能看到', hidden: '隐藏：广场上看不到，只能用邀请链接加入' },
    join: { open: '注册过的会员可以直接加入', invite: '只能用我发的邀请链接加入' },
    max: '最多几个人', people: '人',
    covT: '搭子的约', covSign: '在下面签个名', clear: '重写', submit: '签名立约，发起搭子',
    week: ['日', '一', '二', '三', '四', '五', '六'], minOpts: [[15, '15 分钟'], [20, '20 分钟'], [30, '30 分钟'], [45, '45 分钟'], [60, '1 小时'], [90, '1 小时 30 分钟']],
    groupT: '搭子', sessionT: '这一次',
  },
  en: {
    plazaH: 'Buddies plaza', count: '{n} buddy groups on the plaza right now', all: 'All', mine: 'My buddy groups', fab: 'Start a buddy group',
    newLead: 'Fill in the few things below, sign, and you get an invite link.',
    s1: 'What to read together', s2: 'Language of the reading', s3: 'Where to start', s4: 'Name and a few words', s5: 'When', s6: 'Where you meet', s7: 'Who can join', s8: 'Covenant',
    name: 'Group name', namePh: 'e.g. Reading John on Tuesday nights', intro: 'A few words', introPh: 'e.g. A sentence or two after each reading. No background needed.', optional: 'optional',
    days: 'Days of the week', time: 'Start time', minutes: 'How long', start: 'Start date',
    tzHint: 'Use the time on your phone. Buddies can be anywhere: whoever opens the invite link sees the times in their own phone’s time zone.',
    venueInfo: 'Number, meeting link or WeChat ID', venueHint: 'Only members who joined can see it. You call or meet as usual; the site sends the reading to everyone’s phone.',
    vis: { public: 'Public: on the plaza for everyone to see', hidden: 'Hidden: not on the plaza, invite link only' },
    join: { open: 'Signed-up members can join directly', invite: 'Only people I send the invite link to' },
    max: 'Up to', people: 'people',
    covT: 'The covenant', covSign: 'Sign below', clear: 'Clear', submit: 'Sign and start the group',
    week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], minOpts: [[15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hr'], [90, '1 hr 30 min']],
    groupT: 'Buddies', sessionT: 'This time',
  },
};
const VENUE_ICON = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/></svg>',
  wechat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9.5 4.5c-3.9 0-7 2.6-7 5.8 0 1.8 1 3.4 2.6 4.5l-.6 2 2.4-1.2c.8.2 1.7.4 2.6.4"/><path d="M15 9.5c3.6 0 6.5 2.3 6.5 5.2 0 1.6-.9 3-2.3 4l.5 1.8-2.1-1c-.8.2-1.7.4-2.6.4-3.6 0-6.5-2.3-6.5-5.2s2.9-5.2 6.5-5.2z"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z"/></svg>',
  teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="6.5" width="11" height="11" rx="2"/><path d="M7 10h4M9 10v5"/><circle cx="18" cy="7.5" r="2"/><path d="M16 11.5h4.5v4a2.5 2.5 0 0 1-4.5 1.5"/></svg>',
};
// The "where to start" part of the form for one kind, drawn from its fields in src/kinds.js.
function planFields(key, k, lang, D, hidden) {
  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const one = (f) => {
    const id = `p-${key}-${f.name}`;
    const label = `<span>${esc(f.label[lang])}${f.optional ? `<em>${esc(D.optional)}</em>` : ''}</span>`;
    let input;
    if (f.type === 'book') input = `<select name="${id}" data-plan="book">${BOOKS.map((b) => opt(b.n, lang === 'en' ? b.en : b.zh, b.n === f.value)).join('')}</select>`;
    else if (f.type === 'chapter') input = `<select name="${id}" data-plan="${f.name}" data-chapters></select>`;
    else if (f.type === 'select') input = `<select name="${id}" data-plan="${f.name}">${f.options.map((o) => (Array.isArray(o) ? opt(o[0], o[1][lang], o[0] === f.value) : opt(o, String(o), o === f.value))).join('')}</select>`;
    else if (f.type === 'lesson') input = `<select name="${id}" data-plan="${f.name}">${feed.map((p) => opt(p.n, `${p.n}. ${p[lang].title}`, p.n === (f.value || 1))).join('')}</select>`;
    else if (f.type === 'tag') input = `<select name="${id}" data-plan="${f.name}">${TAGS.map((t) => opt(t.id, `${t[lang]}（${itemsOf(t.id).length}）`.replace(/（(\d+)）$/, lang === 'en' ? ' ($1)' : '（$1 篇）'), false)).join('')}</select>`;
    else if (f.type === 'num') input = `<input name="${id}" data-plan="${f.name}" type="number" min="${f.min}" max="${f.max}" value="${f.value}" inputmode="numeric">`;
    else if (f.type === 'url') input = `<input name="${id}" data-plan="${f.name}" type="url" inputmode="url" maxlength="300" placeholder="https://">`;
    else if (f.type === 'text') input = `<input name="${id}" data-plan="${f.name}" maxlength="${f.max || 60}"${f.placeholder ? ` placeholder="${esc(f.placeholder[lang])}"` : ''}>`;
    if (f.type === 'check') return `<label class="check"><input type="checkbox" name="${id}" data-plan="${f.name}"${f.value ? ' checked' : ''}><span>${esc(f.label[lang])}</span></label>`;
    return `<label class="field">${label}${input}</label>${f.hint ? `<p class="hint">${esc(f.hint[lang])}</p>` : ''}`;
  };
  let h = '';
  for (let i = 0; i < k.fields.length; i++) {
    const f = k.fields[i];
    if (f.pair && k.fields[i + 1]?.pair && !f.hint) { h += `<div class="row2">${one(f)}${one(k.fields[i + 1])}</div>`; i++; } else h += one(f);
  }
  if (k.note) h += `<p class="hint">${esc(k.note[lang])}</p>`;
  return `<fieldset data-for="${key}"${hidden ? ' hidden' : ''}><legend>${esc(D.s3)}</legend>${h}</fieldset>`;
}

for (const lang of LANGS) {
  const L = S[lang];
  const D = DZ[lang];
  const config = json('dazi-config', {
    kinds: kindsForPage(lang),
    tags: TAGS.map((t) => [t.id, t[lang]]),
    venues: Object.fromEntries(Object.entries(VENUES).map(([k, v]) => [k, { name: v[lang], icon: VENUE_ICON[k] }])),
    feedCount: feed.length,
    ids: Object.fromEntries(Object.entries(IDENTITIES).map(([k, v]) => [k, v[lang === 'en' ? 1 : 0]])),
  });

  // the plaza: a scene of tables with seats; no title on top
  emit(lang, '/dazi/', {
    title: L.plazaT,
    desc: L.plazaP,
    tab: 'dazi',
    scripts: [DAZI_JS],
    body: `<section class="plaza-page" data-page="plaza">
<h1 class="vh">${esc(D.plazaH)}</h1>
<div class="plaza-top"><p class="plaza-count" data-count>${esc(L.loading)}</p>
<div class="kinds" role="group" data-kinds><button type="button" data-kind="" aria-pressed="true">${esc(D.all)}</button>${Object.entries(GROUP_KINDS).map(([k, v]) => `<button type="button" data-kind="${k}" aria-pressed="false"><span class="ki">${v.icon}</span>${esc(v[lang])}</button>`).join('')}</div></div>
<div class="mine-strip" data-mine hidden><h2>${esc(D.mine)}</h2><div class="mine-row" data-mine-row></div></div>
<div class="plaza" data-plaza aria-live="polite"></div>
<a class="fab" href="${U(lang, '/dazi/new/')}"><span aria-hidden="true">＋</span>${esc(D.fab)}</a>
${config}
</section>`,
  });

  // start a group
  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  emit(lang, '/dazi/new/', {
    title: L.newT,
    tab: 'dazi',
    noindex: true,
    scripts: [DAZI_JS],
    body: `<section class="page new-group" data-page="new">
<a class="back" href="${U(lang, '/dazi/')}">← ${esc(L.plazaT)}</a>
<h1 class="page-title">${esc(L.newT)}</h1>
<p class="page-lead">${esc(D.newLead)}</p>
<form class="form" data-new novalidate>
<fieldset><legend>${esc(D.s1)}</legend><div class="kind-pick">
${Object.entries(GROUP_KINDS).map(([k, v], i) => `<label class="kind-opt" style="--tint:var(--t-${v.tint})"><input type="radio" name="kind" value="${k}"${i ? '' : ' checked'}><span class="ki">${v.icon}</span><span><b>${esc(v[lang])}</b><small>${esc(v.about[lang])}</small></span></label>`).join('')}
</div></fieldset>
<fieldset><legend>${esc(D.s2)}</legend><div class="seg">
<label><input type="radio" name="lang" value="zh"${lang === 'zh' ? ' checked' : ''}><span>中文</span></label><label><input type="radio" name="lang" value="en"${lang === 'en' ? ' checked' : ''}><span>English</span></label>
</div></fieldset>
${Object.entries(GROUP_KINDS).map(([k, v], i) => planFields(k, v, lang, D, i > 0)).join('\n')}
<fieldset><legend>${esc(D.s4)}</legend>
<label class="field"><span>${esc(D.name)}</span><input name="title" maxlength="40" required placeholder="${esc(D.namePh)}"></label>
<label class="field"><span>${esc(D.intro)}<em>${esc(D.optional)}</em></span><textarea name="intro" maxlength="300" rows="3" placeholder="${esc(D.introPh)}"></textarea></label>
</fieldset>
<fieldset><legend>${esc(D.s5)}</legend>
<div class="field"><span>${esc(D.days)}</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="chip"><input type="checkbox" name="days" value="${d}"><span>${esc(D.week[d])}</span></label>`).join('')}</div></div>
<div class="row2"><label class="field"><span>${esc(D.time)}</span><input name="time" type="time" value="20:00" required></label>
<label class="field"><span>${esc(D.minutes)}</span><select name="minutes">${D.minOpts.map(([v, l]) => opt(v, l, v === 30)).join('')}</select></label></div>
<label class="field"><span>${esc(D.start)}</span><input name="startDate" type="date" required></label>
<input type="hidden" name="tz">
<p class="hint">${esc(D.tzHint)}</p>
</fieldset>
<fieldset><legend>${esc(D.s6)}</legend>
<div class="venue-pick">${Object.entries(VENUES).map(([k, v], i) => `<label class="venue-opt"><input type="radio" name="venue" value="${k}"${i ? '' : ' checked'}><span>${VENUE_ICON[k]}${esc(v[lang])}</span></label>`).join('')}</div>
<label class="field"><span>${esc(D.venueInfo)}<em>${esc(D.optional)}</em></span><input name="venueInfo" maxlength="300"></label>
<p class="hint">${esc(D.venueHint)}</p>
</fieldset>
<fieldset><legend>${esc(D.s7)}</legend>
<div class="radios">${Object.entries(D.vis).map(([k, l], i) => `<label class="check"><input type="radio" name="visibility" value="${k}"${i ? '' : ' checked'}><span>${esc(l)}</span></label>`).join('')}</div>
<div class="radios sub" data-for-public>${Object.entries(D.join).map(([k, l], i) => `<label class="check"><input type="radio" name="join" value="${k}"${i ? '' : ' checked'}><span>${esc(l)}</span></label>`).join('')}</div>
<label class="field"><span>${esc(D.max)}</span><select name="max">${[2, 3, 4, 5, 6, 8, 10, 12].map((n) => opt(n, `${n} ${D.people}`, n === 6)).join('')}</select></label>
</fieldset>
<section class="covenant" aria-live="polite"><h2>${esc(D.covT)}</h2><div class="cov-terms" data-summary></div>
<p class="cov-sign-label">${esc(D.covSign)}</p><div class="sigpad" data-sigpad><canvas></canvas><button type="button" class="link-btn" data-sig-clear>${esc(D.clear)}</button></div></section>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="form-error" data-error role="alert" hidden></p>
<button class="btn btn-water btn-block" type="submit">${esc(D.submit)}</button>
</form>
${config}
</section>`,
  });

  // group page and session page shells (the Worker fills in the link preview)
  write(U(lang, '/g/'), page({ lang, title: D.groupT, path: '/g/', tab: 'dazi', noindex: true, scripts: [DAZI_JS],
    body: `<section class="page group-page" data-page="group"><div data-group aria-live="polite"><p class="muted">${esc(L.loading)}</p></div>${config}</section>` }));
  // posts by tag managers (the Worker puts the article in place of the marker)
  write(U(lang, '/x/'), page({ lang, title: '', path: '/x/', tab: 'home', noindex: true, body: '<!--POST-->' }));
  // the editor for tag managers
  emit(lang, '/write/', { title: lang === 'en' ? 'Write' : '写一篇', tab: 'home', noindex: true,
    body: `<section class="page" data-page="write"><div data-write><p class="muted">${esc(L.loading)}</p></div></section>` });
}

// Zion's page (Chinese only)
write('/admin/', page({
  lang: 'zh', title: '管理', path: '/admin/', noindex: true, only: true,
  body: '<section class="page" data-page="admin"><h1 class="page-title">管理</h1><div data-admin><p class="muted">正在载入……</p></div></section>',
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
