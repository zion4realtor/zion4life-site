// build.mjs: builds 有光 (zion4life.faith) into dist/. No dependencies; run `node build.mjs`.
// Two languages: Chinese at the root, English under /en/. Content lives in content/ (see README.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './src/bible.js';
import { webURL } from './src/reading-web.js';
import { VENUES } from './src/schedule.js';
import { KINDS as GROUP_KINDS, kindsForPage } from './src/kinds.js';
import { VOICES } from './src/audio.js';
import { esc, md, plain, readMinutes } from './src/md.js';
import { IDENTITIES } from './src/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content');
const STATIC = path.join(ROOT, 'static');
const DIST = path.join(ROOT, 'dist');
const LANGS = ['zh', 'en'];
const readingSeeds = fs.readdirSync(path.join(CONTENT, 'reading')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(CONTENT, 'reading', f), 'utf8')));
const site = readJSON('site.json');
const homeEditorial = readJSON('home-editorial.json');
const TAGS = readJSON('tags.json');
const TAG = Object.fromEntries(TAGS.map((t) => [t.id, t]));
const TINTS = { aqua: 'var(--t-aqua)', mint: 'var(--t-mint)', sky: 'var(--t-sky)', lilac: 'var(--t-lilac)', peach: 'var(--t-peach)', sun: 'var(--t-sun)' };

// ---------- words on the page ----------
const S = {
  zh: {
    tabs: ['粮仓', '呼吸', '搭子', '我的'],
    today: '今日呼吸', todayFocus: '今日祷告负担', todayOpen: '打开今日呼吸', dazi: '搭子', daziSub: '查看公开群组和最新组队', newest: '最新：',
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
    huxi: '呼吸', huxiSub: '什么时候打开这个链接，都是最新的一篇。', huxiShare: '把这个链接发给弟兄姊妹，他们什么时候打开，看到的都是最新的呼吸。',
    huxiDayShare: '把这一天的呼吸发给弟兄姊妹。', past: '往期', todayLink: '看今天的呼吸', huxiBurden: '活力排祷告负担',
    listen: '读给我听', listenPlay: '播放', listenPause: '暂停', listenAbout: (m) => `约 ${m} 分钟`, speed: '语速',
    subHuxi: '订阅每天的呼吸', subHuxiOn: '已订阅', subHuxiHint: '订阅以后，呼吸一上新，“我的”里马上会收到消息，每日早晨 4 点更新当日负担。',
    week: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'], weekShort: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    md: (m, d) => `${m}月${d}日`, full: (y, m, d) => `${y}年${m}月${d}日`,
    me: '我的', meSub: '你的搭子、打卡和留言，都会在这里。', loading: '正在载入……',
    talkT: '留言', postsT: '新上架',
    askT: '有问题或建议？', askP: '可以问我们，也欢迎告诉我们你希望网站怎样改进。想收到回复，请留邮箱。',
    askMsg: '想问什么，都可以写在这里', askName: '怎么称呼你（可以不填）', askReply: '回信邮箱（可以不填）', askSend: '发送',
    askDone: '收到了，谢谢你。我们会认真看。',
    plazaT: '搭子广场', plazaP: '约上两三个人，定好时间，一起坚持。', newT: '发起一个搭子',
    copyright: (y) => `© ${y} ${site.owner}`,
    notFound: '找不到这个页面', notFoundP: '链接可能输错了，或者内容已经换了位置。', home: '回到粮仓',
  },
  en: {
    tabs: ['Granary', 'Breathe', 'Buddies', 'Me'],
    today: 'Breathe today', todayFocus: 'Today’s prayer burden', todayOpen: 'Open today’s Breathe', dazi: 'Buddies', daziSub: 'See public groups and new teams', newest: 'Latest',
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
    huxi: 'Breathe', huxiSub: 'Open this link any time and you see the newest day.', huxiShare: 'Send this link to brothers and sisters. Whenever they open it, they see the newest Breathe.',
    huxiDayShare: 'Send this day to brothers and sisters.', past: 'Earlier days', todayLink: 'See today', huxiBurden: 'Vital Groups Prayer Burden',
    listen: 'Read it to me', listenPlay: 'Play', listenPause: 'Pause', listenAbout: (m) => `about ${m} min`, speed: 'Speed',
    subHuxi: 'Subscribe to Breathe', subHuxiOn: 'Subscribed', subHuxiHint: 'Subscribers get a message in “Me” as soon as a new Breathe is up, with the next day’s prayer burden updated daily at 4:00 PM Eastern Time.',
    week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], weekShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    md: (m, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`,
    full: (y, m, d) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}`,
    me: 'Me', meSub: 'Your buddies, check-ins and messages live here.', loading: 'Loading…',
    talkT: 'Messages', postsT: 'Just added',
    askT: 'Questions or ideas?', askP: 'Ask us anything, or suggest how the site could be better. Leave an email if you would like a reply.',
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
  const hash = crypto.createHash('sha1').update(`melotts-ulaw16k-loud|${lang}|${chunks.map((c) => c.t).join('\n')}`).digest('hex');
  return { hash, chars: chunks.reduce((n, c) => n + c.t.length, 0), chunks };
}

function dripListen(lang) {
  const L = S[lang];
  return `<div class="hx-audio" data-audio data-l-play="${esc(L.listenPlay)}" data-l-pause="${esc(L.listenPause)}">
<button class="hx-play" type="button" data-play aria-label="${esc(L.listen)}"><svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg></button>
<div class="hx-a-main"><p class="hx-a-top"><b>${esc(L.listen)}</b><span data-time>${lang === 'zh' ? '中文朗读' : 'Aura 2 · Helena'}</span></p>
<div class="hx-a-bar" data-bar role="slider" aria-label="${esc(L.listen)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i data-fill></i></div></div>
<button class="hx-speed" type="button" data-speed aria-label="${esc(L.speed)}">1×</button>
<p class="hx-a-msg" data-msg hidden></p></div>`;
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
    const tags = [...new Set([...splitTags(a.meta.tags), ...(/^diguan-muyang-\d{4}-\d{2}-\d{2}$/.test(a.slug) ? ['breathe', 'feelings', 'eat'] : [])])];
    for (const t of tags) if (!TAG[t]) throw new Error(`content/articles/${a.slug}: unknown tag "${t}" (add it to content/tags.json)`);
    return {
      kind: a.meta.type === 'page' ? 'page' : 'article', slug: a.slug, date: String(a.meta.date || ''), tags, sample: !!a.meta.sample,
      zh: a.langs.zh, en: a.langs.en, minutes: Object.fromEntries(LANGS.map((l) => [l, readMinutes(plain(a.langs[l].html))])),
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));
const videos = readJSON('videos.json').map((v) => {
  for (const t of v.tags || []) if (!TAG[t]) throw new Error(`videos.json ${v.slug}: unknown tag "${t}"`);
  return { ...v, kind: 'video', tags: [...new Set([...(v.tags || []), 'video'])], sources: v.sources || [] };
}).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const items = [...articles, ...videos].sort((a, b) => String(b.date).localeCompare(String(a.date)));
const itemsOf = (tagId) => items.filter((i) => i.tags.includes(tagId));
const homeItems = items.filter((i) => !i.tagOnly);
const homeItemsOf = (tagId) => homeItems.filter((i) => i.tags.includes(tagId));

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
// /huxi/ shows the newest day to everyone, wherever they are, as soon as it is published
const todayHuxi = huxi[0];

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
const TAG_ICON = {
  mystery: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/>',
  goodnews: '<path d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/><path d="M7 9h2M15 9h2"/>',
  eat: '<path d="M5 11.5c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5v1a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path d="M12 5V3m0 0c1.8 0 3-1 3-2"/>',
  stories: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/>',
  breathe: '<path d="M3 8h10a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h7"/>',
  life: '<path d="M12 21V9M12 14c-4 0-7-2.5-7-6 4 0 7 2.5 7 6ZM12 11c0-4 2.8-7 7-7 0 4.2-3 7-7 7Z"/>',
  students: '<path d="M4 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
  family: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2"/><circle cx="19" cy="10" r="2"/><path d="M6 20v-2a6 6 0 0 1 12 0v2M1.5 19v-1a3.5 3.5 0 0 1 5-3.2M22.5 19v-1a3.5 3.5 0 0 0-5-3.2"/>',
  feelings: '<path d="M12 20s-8-4.7-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.3-8 10-8 10Z"/><path d="M8.5 11h.1m6.8 0h.1M9.5 14.5c1.5 1.2 3.5 1.2 5 0"/>',
  qa: '<path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M10 9a2 2 0 1 1 3.4 1.4c-.9.8-1.4 1.1-1.4 2.1m0 2h.01"/>',
  love: '<path d="M12 20s-8-4.7-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.3-8 10-8 10Z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"/>',
  newfriends: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 8h5m-2.5-2.5v5M17 15.5a5 5 0 0 1 4 4.5"/>',
  songs: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
};

// ---------- layout ----------
const pre = (lang) => (lang === 'en' ? '/en' : '');
const U = (lang, p) => pre(lang) + p;
const TABS = [['home', '/'], ['huxi', '/huxi/'], ['dazi', '/dazi/'], ['me', '/me/']];
const sampleTag = (x, lang) => (x.sample ? `<span class="tag-s">${S[lang].sample}</span>` : '');
const json = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const urls = [];

function page({ lang, title, desc, path: p, body, tab = '', noindex = false, scripts = [], only = false, head = '', styles = [], wide = false }) {
  const L = S[lang];
  const name = site[lang].name;
  const full = title ? `${title}｜${name}` : `${name}｜zion4life.faith`;
  const canonical = site.url + U(lang, p);
  const alt = (l) => (only ? U(l, '/') : U(l, p));
  const tabs = TABS.map(([k, href], i) =>
    `<a href="${U(lang, href)}"${tab === k ? ' aria-current="page"' : ''}>${ICON[k]}<span>${L.tabs[i]}</span></a>`).join('');
  const socialPoster = videos.find(v => v.poster && U(lang, `/v/${v.slug}/`) === U(lang,p))?.poster;
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
<meta property="og:image" content="${site.url}${socialPoster || `/img/og-${lang}.png?v=20261015`}">
<meta property="og:image:secure_url" content="${site.url}${socialPoster || `/img/og-${lang}.png?v=20261015`}">
<meta property="og:image:type" content="${socialPoster ? 'image/jpeg' : 'image/png'}">
<meta property="og:image:width" content="${socialPoster ? 540 : 1200}">
<meta property="og:image:height" content="${socialPoster ? 360 : 630}">
<meta property="og:image:alt" content="${esc(lang === 'en' ? 'In Your light, we see light · Light' : '在祂的光中，我们看见光 · 有光')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${site.url}${socialPoster || `/img/og-${lang}.png?v=20261015`}">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#eaf6ff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c1824" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${head}
<link rel="stylesheet" href="${FONT}">
<link rel="stylesheet" href="${CSS}">
${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<link rel="stylesheet" href="/css/reading.css?v=${ver('css/reading.css')}">
<script src="/js/reading.js?v=${ver('js/reading.js')}" defer></script>
${p.startsWith('/read/') ? `<link rel="manifest" href="${U(lang, '/read/app.webmanifest')}"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${lang === 'zh' ? '吃饭' : 'Daily Bible'}">` : ''}
</head>
<body>
<header class="topbar"><div class="wrap topbar-in">
<a class="brand" href="${U(lang, '/')}">${LOGO}<span><b>${esc(name)}</b><small>zion4life.faith</small></span></a>
<nav class="lang" aria-label="Language"><a href="${alt('zh')}" hreflang="zh-CN"${lang === 'zh' ? ' aria-current="true"' : ''} data-lang="zh">中</a><a href="${alt('en')}" hreflang="en"${lang === 'en' ? ' aria-current="true"' : ''} data-lang="en">EN</a></nav>
</div></header>
<main class="wrap${wide ? ' wide' : ''}">
${['/t/eat/','/t/life/'].includes(p) ? `<section class="calendar" id="reading-calendar" data-reading-calendar><header><b>${lang === 'zh' ? '三旧一新 · 读经日历' : 'Bible reading calendar'}</b><div class="calendar-nav"><button data-calendar-step="-1" type="button" aria-label="${lang === 'zh' ? '上个月' : 'Previous month'}">←</button><span data-calendar-month></span><button data-calendar-step="1" type="button" aria-label="${lang === 'zh' ? '下个月' : 'Next month'}">→</button></div></header><div class="calendar-grid" data-calendar-grid></div></section>` : ''}${body}
<footer class="foot"><b>${esc(name)}</b> zion4life.faith<br><span class="mail">${esc(site.contact)}</span><br>${esc(L.copyright(new Date().getFullYear()))} · Atlanta USA</footer>
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
function videoLike(slug, lang, title) {
  const sharePath = U(lang, `/v/${slug}/`);
  const shareUrl = site.url + sharePath;
  return `<div class="video-reactions"><button type="button" class="video-share" data-video-share data-share-url="${esc(shareUrl)}" data-share-title="${esc(title)}" aria-label="${lang === 'zh' ? '分享转发这段视频' : 'Share this video'}" title="${lang === 'zh' ? '分享转发' : 'Share'}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/></svg><span>${lang === 'zh' ? '分享' : 'Share'}</span></button><button type="button" class="video-like" data-video-like="v:${slug}" aria-label="${lang === 'zh' ? '点赞，可连续点击' : 'Like, tap again to add more'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg><span data-like-label>${lang === 'zh' ? '点赞' : 'Like'}</span><b data-like-count title="258">258</b></button><span class="like-error" role="status"></span></div>`;
}
function card(it, lang, current) {
  const L = S[lang];
  const c = it[lang];
  const tint = TINTS[TAG[it.tags[0]]?.tint || 'aqua'];
  const others = it.tags.filter((x) => x !== current).map((x) => `<span class="other">${esc(TAG[x][lang])}</span>`).join('');
  const readTime = it.slug === 'rensheng-aomi' ? '' : `<span>${esc(L.min(it.minutes[lang]))}</span>`;
  const tagThumb = `/tags/${current || it.tags[0]}.jpg`;
  const dripThumb = /^diguan-muyang-/.test(it.slug) && ['png', 'jpg']
    .map((ext) => `/files/drip-shepherding-${it.date}-${lang}.${ext}`)
    .find((src) => fs.existsSync(path.join(STATIC, src.slice(1))));
  const thumb = it.poster || dripThumb || tagThumb;
  if (it.kind === 'video') {
    return `<a class="card" href="${itemHref(it, lang)}" data-kind="videos" style="--tint:${tint}">
<span class="poster"><img src="${thumb}" alt="" loading="lazy" width="1200" height="675"><span class="play">${ICON.play}</span><span class="dur">${esc(L.min(it.minutes))}</span></span>
<span class="card-body" style="display:block"><span class="kind">${L.kind.video}</span>${sampleTag(it, lang)}<h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><span class="meta">${others}</span></span></a>`;
  }
  return `<a class="card" href="${itemHref(it, lang)}" data-kind="reads" style="--tint:${tint}"><span class="poster card-thumb"><img src="${thumb}" alt="" loading="lazy" width="1200" height="675"></span><span class="card-body" style="display:block">
<span class="kind">${L.kind[it.kind]}</span>${sampleTag(it, lang)}<h3>${esc(c.title)}</h3>${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
<span class="meta">${readTime}${others}</span></span></a>`;
}
function shareBox(lang, text, sharePath, title, extra = '') {
  const L = S[lang];
  return `<div class="share" data-share data-url="${esc(site.url + sharePath)}" data-title="${esc(title)}" data-copied="${lang === 'zh' ? '链接已复制，粘贴发给朋友就可以了' : 'Link copied. Paste it to a friend.'}">
<p>${esc(text)}</p><button class="btn btn-water" type="button" data-share-btn data-copy-label="${lang === 'zh' ? '复制链接' : 'Copy link'}">${L.shareBtn}</button>
<p class="share-wx" hidden>${esc(L.shareWx)}</p>${extra}</div>`;
}
// "Put it on the home screen": steps for iPhone and Android (and WeChat, which cannot do it
// itself). site.js shows the steps for the phone in hand, and a one-tap button where the
// browser offers one.
const PHONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/><path d="M12 7v6M9.5 10.5 12 13l2.5-2.5"/></svg>';
const HOME_SCREEN = {
  zh: `<details class="a2hs" data-a2hs>
<summary>${PHONE_ICON}<span>放到手机桌面，像 APP 一样一点就开</span></summary>
<div class="a2hs-in">
<p class="a2hs-lead">桌面上会多一个「有光」图标。以后一点开它，就直接是最新的活力排祷告负担。</p>
<p class="a2hs-go" data-a2hs-go hidden><button class="btn btn-water btn-sm" type="button" data-a2hs-btn>一键放到桌面</button></p>
<div class="a2hs-step a2hs-wx" data-a2hs-wx hidden><b>在微信里打开的</b><p>微信里没法直接放到桌面。先点右上角「···」，选「在浏览器打开」（苹果手机是「在 Safari 中打开」），再按下面的步骤做。</p></div>
<div class="a2hs-step" data-os="ios"><b>苹果手机（iPhone）</b><ol>
<li>用 <b>Safari</b> 浏览器打开这个页面。</li>
<li>点屏幕下方的「分享」按钮（一个方框，箭头朝上）。新版 iOS 要先点右下角「···」，再点「分享」。</li>
<li>往上滑，点「添加到主屏幕」。</li>
<li>点右上角「添加」。</li></ol></div>
<div class="a2hs-step" data-os="android"><b>安卓手机（华为、小米、OPPO、vivo、三星等）</b><ol>
<li>用手机自带的浏览器或 Chrome 打开这个页面。</li>
<li>点右上角「⋮」，或屏幕下方的菜单「≡」。</li>
<li>选「添加到主屏幕」或「添加到桌面」（有的手机叫「发送到桌面」「添加快捷方式」）。</li>
<li>点「添加」。桌面上没出现的话，到手机「设置 → 应用 → 这个浏览器 → 权限」里打开「桌面快捷方式」，再试一次。</li></ol></div>
</div></details>`,
  en: `<details class="a2hs" data-a2hs>
<summary>${PHONE_ICON}<span>Put it on your home screen, like an app</span></summary>
<div class="a2hs-in">
<p class="a2hs-lead">A “Light” icon appears on your home screen. Tap it any time to open the newest Vital Groups Prayer Burden.</p>
<p class="a2hs-go" data-a2hs-go hidden><button class="btn btn-water btn-sm" type="button" data-a2hs-btn>Add to home screen</button></p>
<div class="a2hs-step a2hs-wx" data-a2hs-wx hidden><b>Opened in WeChat?</b><p>WeChat cannot do this itself. Tap “···” at the top right, choose “Open in Browser” (on iPhone, “Open in Safari”), then follow the steps below.</p></div>
<div class="a2hs-step" data-os="ios"><b>iPhone</b><ol>
<li>Open this page in <b>Safari</b>.</li>
<li>Tap the Share button at the bottom (a square with an arrow pointing up). On the newest iOS, tap “···” at the bottom right first, then “Share”.</li>
<li>Scroll up and tap “Add to Home Screen”.</li>
<li>Tap “Add” at the top right.</li></ol></div>
<div class="a2hs-step" data-os="android"><b>Android</b><ol>
<li>Open this page in Chrome or your phone’s own browser.</li>
<li>Tap “⋮” at the top right, or the menu “≡” at the bottom.</li>
<li>Choose “Add to Home screen” (on some phones “Add to desktop” or “Add shortcut”).</li>
<li>Tap “Add”. If no icon appears, allow home-screen shortcuts for the browser in Settings → Apps → the browser → Permissions, then try again.</li></ol></div>
</div></details>`,
};

// Reading instructions are independent of the prayer page.
const READING_HOME_SCREEN = {
  zh: `<details class="a2hs" data-a2hs>
<summary>${PHONE_ICON}<span>放到手机桌面，像 APP 一样一点就开</span></summary>
<div class="a2hs-in">
<p class="a2hs-lead">把“今日读经”固定链接放到桌面，每天一点开就是当天的经文与录音；往期保留在读经日历里。北京时间每天 0 点更新，所有设备同步。 <a href="/read/today/ot/">打开今日读经固定链接 ↗</a></p>
<p class="a2hs-go" data-a2hs-go hidden><button class="btn btn-water btn-sm" type="button" data-a2hs-btn>一键放到桌面</button></p>
<div class="a2hs-step a2hs-wx" data-a2hs-wx hidden><b>在微信里打开的</b><p>微信里没法直接放到桌面。先点右上角「···」，选「在浏览器打开」（苹果手机是「在 Safari 中打开」），再按下面的步骤做。</p></div>
<div class="a2hs-step" data-os="ios"><b>苹果手机（iPhone）</b><ol>
<li>用 <b>Safari</b> 浏览器打开这个页面。</li>
<li>点屏幕下方的「分享」按钮（一个方框，箭头朝上）。新版 iOS 要先点右下角「···」，再点「分享」。</li>
<li>往上滑，点「添加到主屏幕」。</li>
<li>点右上角「添加」。</li></ol></div>
<div class="a2hs-step" data-os="android"><b>安卓手机（华为、小米、OPPO、vivo、三星等）</b><ol>
<li>用手机自带的浏览器或 Chrome 打开这个页面。</li>
<li>点右上角「⋮」，或屏幕下方的菜单「≡」。</li>
<li>选「添加到主屏幕」或「添加到桌面」（有的手机叫「发送到桌面」「添加快捷方式」）。</li>
<li>点「添加」。桌面上没出现的话，到手机「设置 → 应用 → 这个浏览器 → 权限」里打开「桌面快捷方式」，再试一次。</li></ol></div>
</div></details>`,
  en: `<details class="a2hs" data-a2hs>
<summary>${PHONE_ICON}<span>Put it on your home screen, like an app</span></summary>
<div class="a2hs-in">
<p class="a2hs-lead">Add the Today link to your home screen for the current reading and audio. Past readings remain in the calendar. Updated daily at midnight Beijing time, for all devices. <a href="/en/read/today/ot/">Open the Today link ↗</a></p>
<p class="a2hs-go" data-a2hs-go hidden><button class="btn btn-water btn-sm" type="button" data-a2hs-btn>Add to home screen</button></p>
<div class="a2hs-step a2hs-wx" data-a2hs-wx hidden><b>Opened in WeChat?</b><p>WeChat cannot do this itself. Tap “···” at the top right, choose “Open in Browser” (on iPhone, “Open in Safari”), then follow the steps below.</p></div>
<div class="a2hs-step" data-os="ios"><b>iPhone</b><ol>
<li>Open this page in <b>Safari</b>.</li>
<li>Tap the Share button at the bottom (a square with an arrow pointing up). On the newest iOS, tap “···” at the bottom right first, then “Share”.</li>
<li>Scroll up and tap “Add to Home Screen”.</li>
<li>Tap “Add” at the top right.</li></ol></div>
<div class="a2hs-step" data-os="android"><b>Android</b><ol>
<li>Open this page in Chrome or your phone’s own browser.</li>
<li>Tap “⋮” at the top right, or the menu “≡” at the bottom.</li>
<li>Choose “Add to Home screen” (on some phones “Add to desktop” or “Add shortcut”).</li>
<li>Tap “Add”. If no icon appears, allow home-screen shortcuts for the browser in Settings → Apps → the browser → Permissions, then try again.</li></ol></div>
</div></details>`,
};

function askBox(lang, compact = false) {
  const L = S[lang];
  const opening = compact ? `<details class="ask-fold"><summary><span class="ask-fold-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14.5h5"/></svg></span><span class="ask-fold-copy"><strong>${lang === 'zh' ? '有问题，或想提建议？' : 'Questions or ideas?'}</strong><small>${lang === 'zh' ? '欢迎提问，也欢迎告诉我网站可以怎样改进' : 'Ask a question or suggest a site improvement'}</small></span><span class="ask-fold-action"><span>${lang === 'zh' ? '留言' : 'Write'}</span><b aria-hidden="true">＋</b></span></summary>` : '';
  const closing = compact ? '</details>' : '';
  return `${opening}<form class="ask" data-ask data-lang="${lang}" data-done="${esc(L.askDone)}" novalidate>
<h2>${esc(L.askT)}</h2><p>${esc(L.askP)}</p>
<textarea name="message" maxlength="3000" required placeholder="${esc(L.askMsg)}" aria-label="${esc(L.askMsg)}"></textarea>
<div class="row"><input name="name" maxlength="40" placeholder="${esc(L.askName)}" aria-label="${esc(L.askName)}" autocomplete="nickname"><input name="reply" type="email" maxlength="120" placeholder="${esc(L.askReply)}" aria-label="${esc(L.askReply)}" autocomplete="email" inputmode="email"></div>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${esc(L.askSend)}</button>
</form>${closing}`;
}
// ---------- pages ----------
for (const lang of LANGS) {
  const L = S[lang];

  // 粮仓 (home): today's 呼吸 and 搭子 stay pinned; tag tiles follow newest content date.
  {
    const tp = todayHuxi;
    const tpd = tp && dateParts(tp.date, lang);
    const todayTile = `<a class="today-tile" href="${U(lang, '/huxi/')}" data-ripple${tp ? ` data-huxi-today data-date="${tp.date}"` : ''}>
<span class="today-orbit" aria-hidden="true"></span><span class="today-top"><span class="today-label">${esc(L.todayFocus)}</span>${tp ? `<time class="today-date" data-f="md" datetime="${tp.date}">${esc(tpd.md)}</time>` : ''}</span>
<span class="today-title" data-f="title" data-fit-title>${tp ? esc(tp[lang].title) : esc(L.today)}</span>
<span class="today-bottom"><span>${esc(L.todayOpen)}</span><span class="today-arrow" aria-hidden="true">↗</span></span></a>`;
    const daziTile = `<a class="dazi-tile" href="${U(lang, '/dazi/') }" data-ripple><span class="dazi-top"><span class="dazi-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.3A4.7 4.7 0 0 1 8.2 13h1.6a4.7 4.7 0 0 1 4.7 4.7V19M16 5.5a3 3 0 0 1 0 5.8M17 13h.8a3.7 3.7 0 0 1 3.7 3.7V19"/></svg></span><span class="dazi-kicker">${lang === 'zh' ? '同行操练' : 'GROW TOGETHER'}</span></span><span class="dazi-name">${esc(L.dazi)}</span><span class="dazi-about">${lang === 'zh' ? '读经 · 祷告 · 彼此关心' : 'Read · Pray · Care together'}</span><span class="dazi-countline" data-dazi-countline hidden><b data-dazi-count></b><span>${lang === 'zh' ? '个公开小组' : 'public groups'}</span></span><span class="dazi-latest" data-dazi-summary>${lang === 'zh' ? '看看大家正在一起操练什么' : 'See what others are practicing together'}</span><span class="dazi-link">${lang === 'zh' ? '找一个搭子' : 'Find a buddy'} <span aria-hidden="true">↗</span></span></a>`;
    const pathDefs = [{ id:'all', title:lang === 'zh' ? '认识信仰，也照顾生活' : 'Faith for the whole of life', note:lang === 'zh' ? '从一个问题、一段故事、一首诗歌开始。' : 'Begin with a question, a story, or a song.', tags:TAGS.map(t => t.id) }];
    const tagMap = new Map(TAGS.map((tag) => [tag.id, tag]));
    const pathHTML = pathDefs.map((group, index) => {
      const pathTags = group.tags.map((id) => {
        const tag = tagMap.get(id);
        const list = homeItemsOf(id);
        const lastDate = list[0]?.date || '';
        const timestamp = lastDate ? Date.parse(`${lastDate}T00:00:00Z`) : 0;
        return `<a class="path-tag" href="${U(lang, `/t/${id}/`)}" data-home-tag="${id}" data-home-static-count="${list.length}" data-home-updated="${timestamp}"><span>${esc(tag[lang])}</span><small data-home-count>${list.length}</small></a>`;
      }).join('');
      const groupItems = group.tags.flatMap((id) => homeItemsOf(id).map((it) => ({ ...it, homeTag: id }))).sort((a, b) => b.date.localeCompare(a.date));
      const latest = groupItems[0];
      const count = group.tags.length;
      const recentTitle = latest ? latest[lang].title : (lang === 'zh' ? '内容正在整理中' : 'New content is on the way');
      return `<section class="home-path home-library" data-home-path="${group.id}" data-path-updated="${latest ? Date.parse(`${latest.date}T00:00:00Z`) : 0}"><div class="path-heading"><span class="path-index" aria-hidden="true">${ICON.sun || '✦'}</span><div><h3>${group.title}</h3><p>${group.note}</p></div><span class="path-total">${count} ${lang === 'zh' ? '个主题' : (count === 1 ? 'topic' : 'topics')}</span></div><div class="path-tags">${pathTags}</div><a class="path-update" href="${latest ? itemHref(latest, lang) : U(lang, `/t/${group.tags[0]}/`)}" data-path-link><span>${lang === 'zh' ? '最近上新' : 'LATEST'}</span><b data-path-summary>${esc(recentTitle)}</b><span aria-hidden="true">↗</span></a></section>`;
    }).join('');
    const featuredVideos = videos.filter(v => v.spotlight)
      .sort((a, b) => (Date.parse(b.publishedAt || b.date) || 0) - (Date.parse(a.publishedAt || a.date) || 0))
;
    const hasHymnFeature = featuredVideos.some(v => v.lyricsUrl);
    const spotlight = `<section class="lgh-feature" data-home-fresh="videos" data-updated="${Math.max(0,...featuredVideos.map(v => Date.parse(v.publishedAt || v.date) || 0))}" aria-labelledby="lgh-feature-title"><div class="lgh-feature-heading"><span class="lgh-eyebrow">${hasHymnFeature ? (lang === 'zh' ? '精选 · 故事与诗歌' : 'FEATURED · STORIES & SONGS') : (lang === 'zh' ? '李光弘 · 人生不止 KPI' : 'LIVINGSTONE LEE · MORE TO LIFE')}</span><h2 id="lgh-feature-title">${hasHymnFeature ? (lang === 'zh' ? '在故事与歌声里，遇见生命的盼望。' : 'Stories and songs for a life of hope.') : (lang === 'zh' ? '忙着生活，也别忘了自己。' : 'There’s more to life than keeping up.')}</h2><p>${hasHymnFeature ? (lang === 'zh' ? '听见真实的人生，也在诗歌中感受爱。' : 'Real-life reflections and a hymn about divine love.') : (lang === 'zh' ? '从一个小问题开始，听见生活的另一种可能。' : 'A small question. A different way to see everyday life.')}</p></div><div class="lgh-feature-grid">${featuredVideos.map((v,i) => `<a class="lgh-film"${i >= 4 ? ' hidden' : ''} data-feature-video="${v.slug}" href="${U(lang, `/v/${v.slug}/`)}"><div class="lgh-film-image"><img src="${v.poster}" alt="${esc(v.featureLabel?.[lang] || (lang === 'zh' ? '李光弘讲话画面' : 'Livingstone Lee speaking'))}" width="540" height="360"><span class="lgh-film-play">${ICON.play}</span><span class="feature-likes" data-feature-likes="v:${v.slug}">♡ 258</span><span class="lgh-duration">${Math.floor(v.seconds/60)}:${String(Math.round(v.seconds%60)).padStart(2,'0')}</span></div><div class="lgh-film-copy"><span>${esc(v.featureLabel?.[lang] || (lang === 'zh' ? '福乐人生 · 精选片段' : 'THE BLESSED LIFE · EXCERPT'))} ${String(i+1).padStart(2,'0')}</span><h3>${esc(v[lang].title)}</h3><p>${esc(v[lang].summary)}</p><b>${esc(v.featureAction?.[lang] || (lang === 'zh' ? '听这一段' : 'Watch this moment'))} ↗</b></div></a>`).join('')}</div><a class="lgh-more" href="${U(lang, hasHymnFeature ? '/t/video/' : '/t/lgh/')}">${hasHymnFeature ? (lang === 'zh' ? '继续浏览粮仓内容' : 'Explore more from the Granary') : (lang === 'zh' ? '认识李光弘，看看更多内容' : 'Meet Livingstone Lee and explore more')} →</a></section>`;
    const recentItems = homeItems.slice(0, 4).map((it) => {
      const tag = tagMap.get(it.tags[0]);
      const c = it[lang];
      return `<a class="recent-row" href="${itemHref(it, lang)}"><span class="recent-date">${esc(it.date)}</span><span class="recent-text"><b>${esc(c.title)}</b><small>${esc(c.summary || tag?.[lang] || '')}</small></span><span class="recent-kind">${it.kind === 'video' ? (lang === 'zh' ? '视频' : 'VIDEO') : (lang === 'zh' ? '文章' : 'READ')}<i aria-hidden="true">↗</i></span></a>`;
    }).join('');
    emit(lang, '/', {
      title: '',
      tab: 'home',
      body: `<section class="hello home-hello"><span class="hello-kicker">${esc(homeEditorial[lang].eyebrow)}</span><h1>${esc(homeEditorial[lang].title)}</h1><p>${esc(homeEditorial[lang].subtitle)}</p></section>
<div class="home-fresh-sections" data-home-fresh-sections><section class="home-command" data-home-fresh="community" data-updated="${tp?Date.parse(tp.date):0}" aria-label="${lang==='zh'?'每日读经与搭子':'Daily reading and buddies'}"><div class="home-daily">${`<a class="daily-preview" data-reading-home href="${U(lang, '/read/today/ot/')}"><small data-reading-label>${lang === 'zh' ? '今日吃饭 · 三旧一新' : 'DAILY BIBLE READING'}</small><h2>${lang === 'zh' ? '每天一点<br>享受主话' : 'A little<br>every day'}</h2><p data-reading-summary>${lang === 'zh' ? '读经 · 听经 · 记在心里' : 'Read · Listen · Remember'}</p><p>${lang === 'zh' ? '读经 · 听经' : 'Read & listen'} →</p></a>`}</div><div class="home-companion">${daziTile}</div></section>${spotlight}</div>
<section class="home-discover" aria-labelledby="home-discover-title"><div class="home-section-head"><span class="home-eyebrow">${lang === 'zh' ? '照着你的需要开始' : 'FIND YOUR NEXT STEP'}</span><h2 id="home-discover-title">${lang === 'zh' ? '一个入口，看见所有主题' : 'Every topic, one place to begin'}</h2><p>${lang === 'zh' ? '照着此刻的需要，找到愿意读下去的那一篇。' : 'Find something to read, hear, or carry into your day.'}</p></div><div class="home-paths" data-home-grid>${pathHTML}</div></section>
<section class="home-recent" aria-labelledby="home-recent-title"><div class="home-section-head recent-head"><div><span class="home-eyebrow">${lang === 'zh' ? '新鲜上架' : 'FRESH FROM THE GRANARY'}</span><h2 id="home-recent-title">${lang === 'zh' ? '最近更新' : 'Recently added'}</h2></div><a href="${U(lang, '/t/mystery/')}" class="recent-more">${lang === 'zh' ? '浏览粮仓' : 'Explore'} ↗</a></div><div class="recent-list">${recentItems}</div></section>
${askBox(lang, true)}`,
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
<div class="banner${t.id === 'video' ? ' video-library-banner' : ''}" style="--banner-image:url('${t.id === 'video' ? '/img/video-library-banner.svg' : `/tags/${t.id}.jpg`}')"><h1>${esc(t[lang])}</h1>${t.id === 'video' ? `<p class="video-library-lede">${lang === 'zh' ? '故事、分享与诗歌。' : 'Stories, reflections and songs.'}</p>` : ''}<p>${t.id === 'video' ? (lang === 'zh' ? `${list.length} 段视频` : `${list.length} videos`) : esc(L.count(list.length))}</p>${t.person ? `<span class="avatar big">${esc(t.person[lang])}</span>` : ''}</div>
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
    const mystery = a.slug === 'rensheng-aomi';
    const dripShepherding = /^diguan-muyang-\d{4}-\d{2}-\d{2}$/.test(a.slug);
    const dripAudio = dripShepherding && a.date >= '2026-10-16';
    const dripImage = ['png', 'jpg'].map((ext) => `/files/drip-shepherding-${a.date}-${lang}.${ext}`)
      .find((src) => fs.existsSync(path.join(STATIC, src.slice(1))));
    if (dripShepherding && !dripImage) throw new Error(`Missing drip image: ${a.date} ${lang}`);
    const mysteryPdf = lang === 'zh'
      ? { file: '/files/mystery-of-human-life.zh.pdf', pages: ['/files/mystery-zh-1.jpg', '/files/mystery-zh-2.jpg'] }
      : { file: '/files/mystery-of-human-life.en.pdf', pages: ['/files/mystery-en-1.jpg', '/files/mystery-en-2.jpg'] };
    const related = items.filter((x) => !x.tagOnly && x !== a && !x.sample && (dripShepherding ? /^diguan-muyang-/.test(x.slug) : x.tags.some((t) => a.tags.includes(t)))).slice(0, 4);
    emit(lang, `/a/${a.slug}/`, {
      title: c.title,
      desc: mystery ? c.title : c.summary || plain(c.html).slice(0, 90),
      tab: 'home',
      noindex: a.sample,
      scripts: dripAudio ? [HUXI_JS] : [],
      body: `<article class="article${mystery ? ' mystery-article' : ''}${dripShepherding ? ' drip-article' : ''}" style="--tint:${TINTS[TAG[a.tags[0]]?.tint] || TINTS.aqua}">
<a class="back" href="${U(lang, mystery ? '/' : a.tags[0] ? `/t/${a.tags[0]}/` : '/')}">← ${esc(mystery ? L.home : a.tags[0] ? TAG[a.tags[0]][lang] : L.back)}</a>
<h1 class="a-title">${esc(c.title)}</h1>
${mystery ? '' : `<div class="a-meta">${a.date ? `<time datetime="${a.date}">${esc(dateParts(a.date, lang).full)}</time>` : ''}<span>${esc(L.readMin(a.minutes[lang]))}</span></div>
<div class="a-tags">${a.tags.map((t) => `<a class="chiplink" style="--tint:${TINTS[TAG[t].tint]}" href="${U(lang, `/t/${t}/`)}">${esc(TAG[t][lang])}</a>`).join('')}</div>`}
${c.fallback ? `<p class="note-box">${esc(L.fallback)}</p>` : ''}${a.sample ? `<p class="note-box">${esc(L.sampleNote)}</p>` : ''}
${dripShepherding ? `<section class="drip-page" ${dripAudio ? `data-date="${a.date}" data-audio-kind="diguan"` : ''} aria-label="${esc(c.title)}">
<div class="drip-subscribe"><button type="button" class="btn btn-line btn-sm" data-sub="tag:breathe" data-on="${lang === 'zh' ? '已订阅滴灌牧养' : 'Subscribed to Drip Shepherding'}" data-off="${lang === 'zh' ? '订阅滴灌牧养' : 'Subscribe to Drip Shepherding'}">${lang === 'zh' ? '订阅滴灌牧养' : 'Subscribe to Drip Shepherding'}</button><span class="hint">${lang === 'zh' ? '订阅后，新内容会通知到“我的”。' : 'New content updates arrive in “Me”.'}</span></div>
${dripAudio ? dripListen(lang) : ''}
<a class="drip-image-link" href="${dripImage}" target="_blank" rel="noopener" aria-label="${lang === 'zh' ? '打开整页图片' : 'Open full page image'}"><img src="${dripImage}" alt="${esc(c.title)}" fetchpriority="high"></a>
</section>
${shareBox(lang, L.shareArticle, U(lang, `/a/${a.slug}/`), c.title)}
<section class="talk" data-talk="a:${a.slug}"></section>
${related.length ? `<section class="more"><h2 class="sec-h">${esc(L.more)}</h2><div class="cards">${related.map((x) => card(x, lang)).join('\n')}</div></section>` : ''}` : mystery ? `<section class="mystery-pdf" aria-label="${esc(c.title)}">
<div class="mystery-pdf-actions"><a class="btn btn-water" href="${mysteryPdf.file}" target="_blank" rel="noopener">${lang === 'zh' ? '打开 PDF 阅读' : 'Open PDF'}</a><a class="btn btn-line" href="${mysteryPdf.file}" download>${lang === 'zh' ? '下载 PDF' : 'Download PDF'}</a></div>
<div class="mystery-doc-pages">${mysteryPdf.pages.map((src, i) => `<a href="${mysteryPdf.file}" target="_blank" rel="noopener" aria-label="${lang === 'zh' ? `打开 PDF 第 ${i + 1} 页` : `Open PDF page ${i + 1}`}"><img src="${src}" alt="${esc(c.title)} — ${lang === 'zh' ? `第 ${i + 1} 页` : `page ${i + 1}`}" loading="lazy"></a>`).join('')}</div>
</section>` : `<div class="prose"${c.fallback ? ` lang="${lang === 'zh' ? 'en' : 'zh-CN'}"` : ''}>${c.html}</div>
${shareBox(lang, L.shareArticle, U(lang, `/a/${a.slug}/`), c.title)}
<section class="talk" data-talk="a:${a.slug}"></section>
${related.length ? `<section class="more"><h2 class="sec-h">${esc(L.more)}</h2><div class="cards">${related.map((x) => card(x, lang)).join('\n')}</div></section>` : ''}`}
</article>`,
    });
  }

  // Related videos: shared topics first, then the same series; never the current video.
  const videoSuggestions = (v, end = false) => {
    const related = videos.filter(x => x.slug !== v.slug && !x.sample && x.sources?.length)
      .map((x, order) => ({ x, order, score: x.tags.filter(t => v.tags.includes(t)).length * 3 + (v.shortGroup && x.shortGroup === v.shortGroup ? 2 : 0) }))
      .sort((a,b) => b.score - a.score || a.order - b.order).slice(0, end ? 4 : 5).map(y => y.x);
    if (!related.length || v.sample) return '';
    const heading = lang === 'zh' ? '接着看，你可能也喜欢' : 'Keep watching';
    const cards = related.map(x => `<a class="${end ? 'end-card' : 'recommend-card'}" href="${U(lang, `/v/${x.slug}/`)}"><img src="${esc(x.poster || x.sources[0]?.poster || '')}" alt="" loading="lazy"><b>${esc(x[lang].title)}</b>${end ? '' : `<small>${esc(L.min(x.minutes))} · ${lang === 'zh' ? '相关视频' : 'Related video'}</small>`}</a>`).join('');
    return end ? `<div class="end-recommend" data-video-end hidden><h2>${heading}</h2><div class="end-grid">${cards}</div><button class="end-replay" data-video-replay type="button">↻ ${lang === 'zh' ? '再看一遍' : 'Watch again'}</button></div>` : `<section class="recommend" aria-label="${heading}"><div class="recommend-head"><h2>${heading}</h2><div class="recommend-controls"><button type="button" data-video-scroll="-1" aria-label="${lang === 'zh' ? '上一组视频' : 'Previous videos'}">←</button><button type="button" data-video-scroll="1" aria-label="${lang === 'zh' ? '下一组视频' : 'Next videos'}">→</button></div></div><div class="recommend-rail">${cards}</div></section>`;
  };


  // Bible reading: approved short daily selections and links to the complete source.
  const readingBody = (d, testament) => {
    const en = lang === 'en', pre = en ? '/en' : '', t = d?.[testament], ot = testament === 'ot';
    const date = d?.date || '', token = date || 'today';
    const label = t ? `${en ? t.bookEn : t.bookZh} ${t.ranges.map(x => `${x.chapter}:${x.firstVerse}–${x.lastVerse}`).join(' · ')}` : '';
    const verses = t?.keyVerses || [];
    const todayDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const isToday = !d || date === todayDate;
    const footerReadingLink = isToday
      ? '<a href="' + pre + '/t/eat/#reading-calendar">' + (en ? 'Bible reading calendar' : '读经日历') + ' ↗</a>'
      : '<a href="' + pre + '/read/today/ot/">' + (en ? 'Today’s reading' : '今日读经') + ' ↗</a>';
    return `<article class="reading" data-reading-page data-reading-date="${date}" data-testament="${testament}"><div class="reading-kicker"><span data-reading-kicker>${en ? 'EAT' : '吃饭'}${d ? ` · ${en ? 'DAY' : '第'} ${d.planDay}${en ? '' : ' 天'}` : ''}</span><time data-reading-date-label>${date}</time></div><h1>${en ? 'Daily Bible reading' : '三旧一新，天天吃饭'}</h1><nav class="reading-tabs"><a href="/read/${token}/${testament}/" ${en ? '' : 'aria-current="page"'} data-reading-lang="zh">中文</a><a href="/en/read/${token}/${testament}/" ${en ? 'aria-current="page"' : ''} data-reading-lang="en">English</a></nav><nav class="reading-tabs"><a href="${pre}/read/${token}/ot/" ${ot ? 'aria-current="page"' : ''} data-reading-testament="ot">${en ? 'Old Testament' : '旧约'}</a><a href="${pre}/read/${token}/nt/" ${ot ? '' : 'aria-current="page"'} data-reading-testament="nt">${en ? 'New Testament' : '新约'}</a></nav><div class="reading-audio"><b>${en ? 'Listen to today’s reading' : '读给我听'}</b><audio controls preload="none" data-reading-audio ${!en && t?.audioUrl ? `src="${esc(t.audioUrl)}"` : 'hidden'}></audio><span class="reading-status" data-reading-audio-status>${en ? 'Preparing today’s complete reading…' : ''}</span></div><h2 data-reading-range>${esc(label)}</h2><div data-reading-verses>${verses.map(v => `<section class="memory-section"><div class="memory-heading"><span>${en ? 'REMEMBER THE WORD' : '今日金句 · 记在心里'}</span><button type="button" data-memory-toggle aria-pressed="false">${en ? 'Practice' : '遮住试背'}</button></div><p class="memory-ref">${esc(en ? v.reference : v.referenceZh)}</p><p class="reading-verse" data-memory-text>${esc(en ? v.en : v.zh)}</p></section>`).join('')}</div><div class="reading-error" data-reading-error hidden></div><div class="reading-note">${en ? 'Selected from today’s reading. Open the source for the full reading.' : '金句选自当天阅读范围，完整经文请打开原文。'}<br><a data-reading-source href="${esc(en ? (verses[0]?.sourceEn || 'https://text.recoveryversion.bible/') : (t?.sourceUrl || 'https://line.twgbr.org/recoveryversion/oneyear/'))}" target="_blank" rel="noopener">${en ? 'Read in Recovery Version ↗' : '打开今日完整经文 ↗'}</a><br>${en ? `<a data-reading-web-source href="${t ? esc(webURL(t,t.ranges[0].chapter)) : 'https://worldenglish.bible/'}" target="_blank" rel="noopener">Read in World English Bible (WEB) ↗</a><br><span class="reading-editions">Audio: World English Bible (WEB) · Key verses: Recovery Version.<br>We have not obtained permission to publish a full-length Recovery Version narration from LSM, so the audio uses the World English Bible.</span>` : '台湾福音书房'}</div><div class="reading-links"><a href="${pre}/t/eat/#reading-calendar">${en ? 'Eat' : '吃饭'}</a><a href="${pre}/t/life/#reading-calendar">${en ? 'Life' : '生命'}</a>${footerReadingLink}</div>${READING_HOME_SCREEN[lang]}</article>`;
  };
  for (const testament of ['ot','nt']) {
    emit(lang, `/read/shell/${testament}/`, { title:lang === 'zh' ? '三旧一新' : 'Daily Bible reading', tab:'home', noindex:true, body:readingBody(null,testament) });
    emit(lang, `/read/today/${testament}/`, { title:lang === 'zh' ? '今日三旧一新' : 'Today’s Bible reading', tab:'home', noindex:true, body:readingBody(null,testament) });
    for (const d of readingSeeds) for (const token of [d.date, String(d.planDay)]) emit(lang, `/read/${token}/${testament}/`, { title:`${d.date} ${lang === 'zh' ? '三旧一新' : 'Daily Bible reading'}`, desc:lang === 'zh' ? '当天读经、金句与录音' : 'Daily reading, key verses and audio',tab:'home',body:readingBody(d,testament) });
  }

  // videos
  for (const v of videos) {
    const c = v[lang];
    const sources = v.sources.map((s, i) => ({ ...s, ...(s.type === 'file' ? { subtitles: s.subtitles || v.subtitles || [] } : {}), label: s.label || (lang === 'zh' ? `线路${i + 1}` : `Line ${i + 1}`) }));
    if (v.short || v.spotlight) {
      const group = v.shortGroup ? videos.filter(x => x.shortGroup === v.shortGroup) : [v];
      const i = group.indexOf(v), next = group.length > 1 ? group[(i+1)%group.length] : null;
      const backTag = v.tags[0];
      const subscribeTag = v.subscribeTag === false ? '' : (v.subscribeTag || (v.spotlight ? 'lgh' : ''));
      const captionOptions = v.captionOptions || ['en', 'zh', 'off'];
      const defaultCaption = typeof v.defaultCaption === 'object' ? v.defaultCaption[lang] : (v.defaultCaption || 'en');
      const captionLabel = (key) => key === 'en' ? 'English' : key === 'zh' ? '中文' : (lang === 'zh' ? '关' : 'Off');
      const shortKicker = v.shortKicker?.[lang] || (lang === 'zh' ? '福乐人生 · 精选片段' : 'THE BLESSED LIFE · EXCERPT');
      const byline = v.byline?.[lang] || (lang === 'zh' ? '李光弘 · 中文原声 · 英文字幕' : 'Livingstone Lee · Chinese audio · English subtitles');
      const sourceNote = v.sourceNote?.[lang] || (lang === 'zh' ? '选自李光弘1998年《福乐人生》。保留原始录像画幅和中文原声。中文原声保留；英文字幕由本站根据讲述内容翻译、校订。' : 'From The Blessed Life, a 1998 talk by Livingstone Lee. Original picture format and Chinese audio preserved. English subtitles translated and edited for Light.');
      const downloadPath = v.downloadable === false ? '' : (v.downloadPath || (v.shortGroup === 'livingstone-lee' ? `/video/${v.slug}-share.mp4` : ''));
      const download = downloadPath ? `<div class="video-download"><a class="btn btn-line" href="${downloadPath}" download>${lang === 'zh' ? '保存视频' : 'Save video'}</a><p>${lang === 'zh' ? '下载后可以从手机相册或文件中转发。' : 'Download, then share it from Photos or Files.'}</p></div>` : '';
      const subscribe = subscribeTag ? `<div class="video-subscribe drip-subscribe"><button type="button" class="btn btn-line btn-sm" data-sub="tag:${subscribeTag}" data-on="${lang === 'zh' ? '已订阅' : 'Subscribed'}" data-off="${lang === 'zh' ? '订阅更新' : 'Subscribe to updates'}">${lang === 'zh' ? '订阅更新' : 'Subscribe to updates'}</button><span class="hint">${lang === 'zh' ? '新视频上架后，在“我的”里通知你。' : 'New videos arrive in “Me”.'}</span></div>` : '';
      const nextLink = next ? `<a class="short-next" href="${U(lang,`/v/${next.slug}/`)}"><span>${lang === 'zh' ? '接着听下一段' : 'UP NEXT'}<b>${esc(next[lang].title)}</b></span><span>→</span></a>` : '';
      const captionControls = captionOptions.length ? `<div class="short-captions" role="group" aria-label="${lang === 'zh' ? '字幕选择' : 'Subtitles'}"><span>${lang === 'zh' ? '字幕' : 'Subtitles'}</span>${captionOptions.map((key) => `<button type="button" data-caption="${key}" aria-pressed="${String(key === defaultCaption)}">${captionLabel(key)}</button>`).join('')}</div>` : '';
      const hymnLyrics = v.lyrics ? `<section class="hymn-lyrics-panel" aria-label="${lang === 'zh' ? '诗歌歌词' : 'Hymn lyrics'}"><h2>${esc(c.title)}</h2><div class="lyrics-stanza">${v.lyrics[lang].slice(0,1).map(stanza => `<p>${stanza.map(line => esc(line)).join('<br>')}</p>`).join('')}</div><details class="lyrics-more"><summary>${lang === 'zh' ? '展开全部歌词' : 'Show full lyrics'}</summary><div class="lyrics-stanza">${v.lyrics[lang].slice(1).map(stanza => `<p>${stanza.map(line => esc(line)).join('<br>')}</p>`).join('')}</div></details></section>` : '';
      const shortQuotes = v.quotes?.[lang]?.length ? `<blockquote class="short-quotes">${v.quotes[lang].map(q => `<p>${esc(q)}</p>`).join('')}</blockquote>` : '';
      const hymnLinks = v.fullSongUrl ? `<section class="hymn-links" aria-label="${lang === 'zh' ? '完整诗歌' : 'Full hymn'}"><a class="hymn-full" href="${v.fullSongUrl}" target="_blank" rel="noopener noreferrer">${lang === 'zh' ? '想要听整首' : 'Listen to the full hymn'} <span aria-hidden="true">↗</span></a></section>` : '';
      emit(lang, `/v/${v.slug}/`, { title:c.title, desc:c.summary, tab:'home',
        body:`${subscribe}<article class="short-watch${v.orientation === 'portrait' ? ' is-portrait' : ''}" data-caption-choice="${defaultCaption}"><div class="short-top"><a href="${U(lang,`/t/${backTag}/`)}">← ${esc(TAG[backTag]?.[lang] || L.back)}</a><span>${esc(shortKicker)}${group.length > 1 ? ` · ${i+1}/${group.length}` : ''}</span></div><div class="short-stage"><div class="player" data-player data-short="${v.slug}"><button class="player-start" aria-label="${L.play}" type="button"><img src="${v.poster || sources[0]?.poster || ''}" alt="" width="540" height="960"><span class="short-play">${ICON.play}</span><span class="short-tap">${lang === 'zh' ? '点一下，播放视频' : 'Tap to watch'}</span></button>${json(`src-${v.slug}`,sources)}${videoSuggestions(v,true)}</div></div>${v.sample ? '' : videoLike(v.slug,lang,c.title)}<div class="short-copy"><div class="short-byline">${esc(byline)}</div><h1>${esc(c.title)}</h1>${v.slug === 'why-am-i-here' ? `<nav class="video-tag-links" aria-label="${lang === 'zh' ? '相关标签' : 'Related topics'}">${v.tags.map(id=>`<a href="${U(lang,`/t/${id}/`)}">${esc(TAG[id][lang])}</a>`).join('')}</nav>` : ''}${captionControls}<p class="short-summary">${esc(c.summary)}</p>${shortQuotes}${hymnLyrics}${hymnLinks}${shareBox(lang,lang === 'zh' ? '想分享这段视频？' : 'Want to share this video?',U(lang,`/v/${v.slug}/`),c.title)}${download}${nextLink}<div class="short-note" role="status" hidden></div></div></article>${videoSuggestions(v)}<section class="talk video-talk" data-talk="v:${v.slug}"></section>` });
      continue;
    }
    const related = items.filter((x) => !x.tagOnly && x !== v && x.tags.some((t) => v.tags.includes(t))).slice(0, 4);
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
${videoSuggestions(v,true)}
</div>
${v.sample ? '' : videoLike(v.slug,lang,c.title)}
${sources.length > 1 ? `<div class="lines" role="group">${sources.map((s, i) => `<button type="button" data-line="${i}"${i ? '' : ' aria-pressed="true"'}>${esc(s.label)}</button>`).join('')}</div>` : ''}
<h1 class="a-title">${esc(c.title)}${sampleTag(v, lang)}</h1>
<div class="a-meta"><span>${esc(L.min(v.minutes))}</span></div>
<div class="a-tags">${v.tags.map((t) => `<a class="chiplink" style="--tint:${TINTS[TAG[t].tint]}" href="${U(lang, `/t/${t}/`)}">${esc(TAG[t][lang])}</a>`).join('')}</div>
${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
${sources.length > 1 ? `<p class="muted">${esc(L.lineTip)}</p>` : ''}
${shareBox(lang, L.shareVideo, U(lang, `/v/${v.slug}/`), c.title)}
${videoSuggestions(v)}
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
    // above the day: 呼吸, the day's date and what it is (the date is not repeated in the box)
    const kicker = (p) => `<p class="hx-kicker"><b>${esc(L.huxi)}</b><span>${esc(dateParts(p.date, lang).full)}</span><span>${esc(L.huxiBurden)}</span></p>`;
    const day = (p, live) => {
      const x = p[lang];
      return `<article class="hx"${live ? ' data-huxi-today' : ''} data-date="${p.date}">
<header class="hx-hero" data-s="0">
<h1 class="hx-title"><span data-f="title">${esc(x.title)}</span>${sampleTag(p, lang)}</h1>
<p class="hx-lede" data-f="lede"${x.lede ? '' : ' hidden'}>${esc(x.lede)}</p>
</header>
${listen(p)}
<div class="hx-body" lang="${lang === 'en' ? 'en' : 'zh-CN'}" data-f="html">${x.html}</div>
<p class="hx-sub"><button type="button" class="btn btn-line btn-sm" data-sub="huxi" data-on="${esc(L.subHuxiOn)}" data-off="${esc(L.subHuxi)}">${esc(L.subHuxi)}</button><span class="hint">${esc(L.subHuxiHint)}</span></p>
<section class="talk hx-prayer-talk" data-talk="huxi:${p.date}"></section>
</article>`;
    };
    // the page title and link preview: the day's date and 活力排祷告负担, then the headline and lede
    const heading = (p) => `${dateParts(p.date, lang).full}${lang === 'en' ? ' · ' : ' '}${L.huxiBurden}`;
    const preview = (p) => {
      const t = `${p[lang].title}${lang === 'en' ? '. ' : '。'}${p[lang].lede || ''}`.trim();
      return t.length > (lang === 'en' ? 200 : 100) ? `${t.slice(0, lang === 'en' ? 197 : 99)}…` : t;
    };
    // on the phone's home screen it opens like an app, always at /huxi/ (the newest day)
    const appHead = `<link rel="manifest" href="${U(lang, '/huxi/app.webmanifest')}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(site[lang].name)}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`;
    const homeScreen = HOME_SCREEN[lang];
    const archive = (current) => `<section class="more" id="archive"><h2 class="sec-h">${esc(L.past)}</h2><ul class="arch">${huxi.map((p) => {
      const d = dateParts(p.date, lang);
      const hide = p.date === current;
      return `<li data-arch="${p.date}"${hide ? ' hidden' : ''}><a href="${U(lang, `/huxi/${p.date}/`)}"><time datetime="${p.date}">${esc(d.md)} ${esc(d.wdShort)}</time><span>${esc(p[lang].title)}</span></a></li>`;
    }).join('')}</ul></section>`;
    emit(lang, '/huxi/', {
      title: heading(todayHuxi),
      desc: preview(todayHuxi),
      tab: 'huxi',
      scripts: [HUXI_JS],
      head: appHead,
      body: `<section class="page hx-page" style="--tint:var(--t-sun)">
${kicker(todayHuxi)}
${day(todayHuxi, true)}
${shareBox(lang, L.huxiShare, U(lang, '/huxi/'), heading(todayHuxi), homeScreen)}
${archive(todayHuxi.date)}
</section>`,
    });
    for (const p of huxi) {
      emit(lang, `/huxi/${p.date}/`, {
        title: heading(p),
        desc: preview(p),
        tab: 'huxi',
        noindex: p.sample,
        scripts: [HUXI_JS],
        head: appHead,
        body: `<section class="page hx-page" style="--tint:var(--t-sun)">
<a class="back" href="${U(lang, '/huxi/')}">← ${esc(L.todayLink)}</a>
${kicker(p)}
${day(p, false)}
${shareBox(lang, L.huxiDayShare, U(lang, `/huxi/${p.date}/`), heading(p))}
${archive(p.date)}
</section>`,
      });
    }
  }

  // voices to choose from for 读给我听 (not linked from anywhere)
  emit(lang, '/huxi/voices/', {
    title: lang === 'en' ? 'Choose a voice' : '挑一个声音',
    tab: 'huxi',
    noindex: true,
    body: `<section class="page"><h1 class="page-title">${lang === 'en' ? 'Choose a voice' : '挑一个英文声音'}</h1>
<p class="page-lead">${lang === 'en' ? 'The same lines in each voice. The first play of each takes a few seconds.' : '同样几句英文，用不同的声音读。每个第一次点开要等几秒钟。'}</p>
<ul class="voices">${VOICES.map((v) => `<li><b>${esc(v.label)}</b><audio controls preload="none" src="/api/audio/voices/${v.id}"></audio></li>`).join('')}</ul></section>`,
  });

  // 我的
  emit(lang, '/me/', {
    title: L.me,
    tab: 'me',
    noindex: true,
    body: `<section class="page" style="--tint:var(--t-sky)">
<div class="me-light-banner"><img class="me-light-scene" src="/img/me-light-banner.svg" alt="" aria-hidden="true"><div class="me-light-copy"><span class="me-light-eyebrow">${lang === 'zh' ? '有光 · 每天相伴' : 'LIGHT · DAY BY DAY'}</span><h1>${esc(L.me)}</h1><p class="me-light-line">${lang === 'zh' ? '循着光，一起前行。' : 'Following the light, together.'}</p><p class="me-light-description">${esc(L.meSub)}</p></div></div>
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
writeData('video-meta.json', videos.filter(v => !v.sample).map(v => ({ slug:v.slug, published:v.publishedAt || v.date, featured:!!v.spotlight })));
writeData('items.json', homeItems.map((i) => ({ key: `${i.kind === 'video' ? 'v' : 'a'}:${i.slug}`, tags: i.tags, date: i.date, zh: i.zh.title, en: i.en.title })));
writeData('bible.json', BOOKS.map((b) => ({ n: b.n, zh: b.zh, en: b.en, ch: b.chapters })));
writeData('feed.json', feed.map((p) => ({ n: p.n, sample: p.sample, zh: { title: p.zh.title }, en: { title: p.en.title } })));
for (const p of feed) writeData(`feed/${p.n}.json`, { n: p.n, sample: p.sample, zh: { title: p.zh.title, html: p.zh.html }, en: { title: p.en.title, html: p.en.html } });
// the 呼吸 app on the home screen: opens at /huxi/ (the newest day), the whole site in the app
for (const lang of LANGS) {
  const manifest = {
    name: site[lang].name, short_name: site[lang].name, lang: lang === 'en' ? 'en' : 'zh-CN',
    start_url: U(lang, '/huxi/'), scope: '/', display: 'standalone', background_color: '#eaf6ff', theme_color: '#eaf6ff',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
  };
  fs.writeFileSync(path.join(DIST, U(lang, '/huxi/app.webmanifest').slice(1)), JSON.stringify(manifest, null, 2));
}
// Daily reading shortcut always retains its stable Today URL.
for (const lang of LANGS) {
  const file = path.join(DIST, U(lang, '/read/app.webmanifest').slice(1));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    id: U(lang, '/read/'), name: lang === 'zh' ? '有光 · 每日读经' : 'Light · Daily Bible',
    short_name: lang === 'zh' ? '吃饭' : 'Daily Bible', lang: lang === 'zh' ? 'zh-CN' : 'en',
    start_url: U(lang, '/read/today/ot/?autoplay=1'), scope:'/', display:'standalone',
    background_color:'#eaf6ff', theme_color:'#eaf6ff',
    icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png'}]
  }, null, 2));
}
// Image articles keep a separate, language-specific transcript for narration.
const dripDays = articles.filter((a) => /^diguan-muyang-/.test(a.slug) && a.date >= '2026-10-16');
writeData('diguan.json', dripDays.map((a) => ({ date: a.date })));
for (const a of dripDays) {
  const speech = {};
  for (const lang of LANGS) {
    const paragraphs = plain(a[lang].html).split(/\n+/).map((t) => t.trim()).filter(Boolean);
    if (lang === 'zh' && paragraphs.some((t) => /[A-Za-z]/.test(t))) throw new Error('Chinese drip narration must contain only Chinese: ' + a.slug);
    const sentences = paragraphs.flatMap((t) => (t.match(lang === 'zh' ? /[^。！？]+[。！？]*|$/g : /[^.!?]+[.!?]*|$/g) || []).filter(Boolean));
    const chunks = [];
    for (const t of sentences) {
      const last = chunks.at(-1);
      if (last && last.t.length + t.length < (lang === 'zh' ? 260 : 520)) last.t += ' ' + t;
      else chunks.push({ t, s: [] });
    }
    speech[lang] = { chunks, chars: chunks.reduce((n, c) => n + c.t.length, 0), hash: crypto.createHash('sha1').update(JSON.stringify(chunks)).digest('hex') };
  }
  writeData(`diguan/${a.date}.speech.json`, speech);
}
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
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.5 11.2c0 4.3-3.8 7.7-8.5 7.7-.9 0-1.8-.1-2.6-.4l-4.1 2 .9-3.8c-1.7-1.4-2.7-3.3-2.7-5.5 0-4.3 3.8-7.7 8.5-7.7s8.5 3.4 8.5 7.7z"/><path d="M8 11h.01M12 11h.01M16 11h.01" stroke-width="2.6" stroke-linecap="round"/></svg>',
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

  // The courtyard is presentation only; group, covenant and calendar flows stay shared.
  emit(lang, '/dazi/', {
    title: lang === 'zh' ? '搭子广场' : 'Buddies plaza',
    desc: lang === 'zh' ? '约上两三个人，定好时间，一起坚持。' : 'Two or three friends. A set time. Keep going together.',
    tab: 'dazi',
    scripts: [DAZI_JS],
    styles: [`/css/plaza.css?v=${ver('css/plaza.css')}`],
    body: `<section class="plaza-page" data-page="plaza">
<section class="plaza-hero"><div class="plaza-heading-row"><div><p class="plaza-eyebrow">${lang === 'zh' ? '留一个位置，一起走下去' : 'A place to belong. Companions for the journey.'}</p><h1>${esc(D.plazaH)}</h1></div><a class="plaza-start" href="${U(lang, '/dazi/new/')}"><span aria-hidden="true">＋</span>${lang === 'zh' ? '发起搭子' : 'Start a group'}</a></div>
<p class="plaza-lede">${lang === 'zh' ? '两三个人，一个约定，一起坚持。' : 'A few friends. A regular time. Together.'}</p>
<details class="plaza-help"><summary>${lang === 'zh' ? '怎么参与 · 读物与提醒' : 'How it works · readings & reminders'}</summary>
<p>${lang === 'zh' ? '选一个小组，看看一起读什么、何时相聚、在哪里见面。登录后，在“搭子的约”上签名加入，就有了固定同行的伙伴。' : 'Choose a group to see what the group reads, when it meets, and how to meet. Sign in and sign the group’s covenant to join.'}</p>
<p>${lang === 'zh' ? '网站按小组进度提供当次读物或链接。到约定时间，通过电话、微信、Zoom 等约好的方式相聚；时间会按每个人的手机自动换算。' : 'The site provides readings or links for each session. Meet through the agreed phone call, WeChat, Zoom, or other service. Times automatically display in each person’s local time zone.'}</p>
<p>${lang === 'zh' ? '加入后，可在小组“日历”中订阅或下载日历。添加到手机日历并开启提醒后，可从提醒中的链接打开当次材料。提醒方式取决于手机和日历设置。' : 'After joining, subscribe to or download the group calendar from its Calendar tab. Add it to your phone calendar and enable reminders; the event link opens that session’s reading. Alerts depend on your phone and calendar settings.'}</p>
</details></section>
<div class="plaza-top"><p class="plaza-count" data-count>${esc(L.loading)}</p>
<div class="kinds" role="group" data-kinds><button type="button" data-kind="" aria-pressed="true">${esc(D.all)}</button>${Object.entries(GROUP_KINDS).map(([k, v]) => `<button type="button" data-kind="${k}" aria-pressed="false"><span class="ki">${v.icon}</span>${esc(v[lang])}</button>`).join('')}<label class="vacant-filter"><input type="checkbox" data-plaza-vacant>${lang === 'zh' ? '只看空位' : 'Open seats'}</label></div></div>

<div class="mine-strip" data-mine hidden><h2>${esc(D.mine)}</h2><div class="mine-row" data-mine-row></div></div>
<div class="plaza" data-plaza aria-live="polite"></div>
<dialog class="table-popup" data-table-popup aria-labelledby="plaza-popup-title"><button type="button" class="popup-close" data-popup-close aria-label="${lang === 'zh' ? '关闭说明' : 'Close details'}">×</button><div data-popup-body></div></dialog>

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
<details class="new-group-guide"><summary>${lang === 'zh' ? '发起后，网站怎样帮助大家同行？' : 'How does the site help your group after you start?'}</summary><p>${lang === 'zh' ? '设定好读物、进度、时间和见面方式，签名立约后，把邀请链接发给伙伴。网站会按进度提供每次的材料或链接，并按每位成员的手机显示当地时间。加入后，可提醒伙伴订阅小组日历、开启提醒；聚会安排有变化时，也请及时通知大家。' : 'Choose your reading, pace, meeting time, and meeting method. After signing the covenant, share the invitation link with your companions. The site provides each session’s reading or link and shows times in each member’s local time zone. Encourage members to subscribe to the group calendar and enable reminders, and let everyone know when arrangements change.'}</p></details>
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
  lang: 'zh', title: '管理', path: '/admin/', noindex: true, only: true, wide: true,
  body: '<section class="page" data-page="admin"><h1 class="page-title">管理</h1><div data-admin><p class="muted">正在载入……</p></div></section>',
}));

// 404 (both languages on one page)
fs.writeFileSync(path.join(DIST, '404.html'), page({
  lang: 'zh', title: S.zh.notFound, path: '/404', noindex: true, only: true,
  body: `<section class="page"><div class="banner"><h1>${S.zh.notFound}</h1><p>${S.zh.notFoundP}<br>${S.en.notFoundP}</p>${MASCOT()}</div>
<p class="btn-row"><a class="btn btn-water" href="/">${S.zh.home}</a><a class="btn btn-line" href="/en/">${S.en.home}</a></p></section>`,
}));

// Exact video lengths for byte ranges when the asset binding omits Content-Length.
const videoSizes = {};
const videoDir = path.join(STATIC, 'video');
if (fs.existsSync(videoDir)) for (const name of fs.readdirSync(videoDir)) {
  if (name.endsWith('.mp4')) videoSizes[`/video/${name}`] = fs.statSync(path.join(videoDir, name)).size;
}
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'data/video-sizes.json'), JSON.stringify(videoSizes));

// sitemap + robots
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.url}${u}</loc></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`built ${urls.length} indexed pages: ${articles.length} articles, ${videos.length} videos, ${huxi.length} 呼吸 days, ${TAGS.length} tags, 2 languages (newest 呼吸: ${todayHuxi?.date ?? 'none'})`);
