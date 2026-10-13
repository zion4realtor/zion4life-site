// The kinds of 搭子, one entry each: names, colour and icon, the fields of the "发起一个搭子"
// form, how the plan is checked, how many sessions it has and what each session reads.
// build.mjs draws the form from `fields`; the pages fill the covenant preview from `summary`;
// the Worker uses the functions. To add a kind, add an entry here.
//
// Field types: book (one of the 66 books) · chapter (a chapter of the field before it) ·
// num (whole number, min/max) · select (options: values, or [value, {zh, en}]) · check ·
// text · url (https://, optional) · lesson (one of the 投喂 lessons on the site).
// Summary templates: {name} the field's value as shown, {name?words} words only when the
// field is on, {name#one#many} the number with a singular or plural noun (English).
import { BOOKS, TOTAL_CHAPTERS, chapterIndex, chapterAt, chaptersText, chapterLink, lifeStudyLink, bookName } from './bible.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const L2 = (zh, en) => ({ zh, en });
const DAYS6 = [1, 2, 3, 4, 5, 6].map((d) => [d, L2(`周${'一二三四五六'[d - 1]}`, `Day ${d}`)]);

export const KINDS = {
  bible: {
    zh: '饭搭子', en: 'Meal buddies', what: L2('圣经', 'the Bible'), verb: L2('吃饭', 'eat'),
    about: L2('按章读圣经（恢复本）', 'Read the Bible chapter by chapter (Recovery Version)'),
    tint: 'mint',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 12h17a8.5 7.5 0 0 1-17 0z"/><path d="M15 3.5l-3 7M19 4.5l-5 6" stroke-linecap="round"/></svg>',
    fields: [
      { name: 'book', type: 'book', label: L2('书卷', 'Book'), value: 43, pair: true },
      { name: 'chapter', type: 'chapter', label: L2('从第几章开始', 'Start at chapter'), value: 1, pair: true },
      { name: 'per', type: 'select', label: L2('每次读几章', 'Chapters each time'), options: [1, 2, 3, 4, 5], value: 1 },
      { name: 'cont', type: 'check', label: L2('这一卷读完后，接着读下一卷', 'When this book is done, go on to the next') },
    ],
    summary: L2('从{book}第{chapter}章开始，每次{per}章{cont?，读完接着读下一卷}', '{book} from chapter {chapter}, {per#chapter#chapters} each time{cont?, then on to the next book}'),
    plan(pl, t) {
      const book = int(pl.book);
      if (!(book >= 1 && book <= 66)) return t('请选哪一卷', 'Pick a book');
      const bk = BOOKS[book - 1];
      const chapter = int(pl.chapter, 1), per = int(pl.per, 1);
      if (!(chapter >= 1 && chapter <= bk.chapters)) return t(`${bk.zh}一共${bk.chapters}章`, `${bk.en} has ${bk.chapters} chapters`);
      if (!(per >= 1 && per <= 10)) return t('请选每次读几章', 'Pick how many chapters each time');
      return { book, chapter, per, cont: !!pl.cont };
    },
    total(p) {
      const end = p.cont ? TOTAL_CHAPTERS : chapterIndex(p.book, BOOKS[p.book - 1].chapters) + 1;
      return Math.max(1, Math.ceil((end - chapterIndex(p.book, p.chapter)) / p.per));
    },
    reading({ p, n, lang }) {
      const start = chapterIndex(p.book, p.chapter) + (n - 1) * p.per;
      const end = p.cont ? TOTAL_CHAPTERS : chapterIndex(p.book, BOOKS[p.book - 1].chapters) + 1;
      const chapters = [];
      for (let i = start; i < Math.min(start + p.per, end); i++) chapters.push(chapterAt(i));
      return { text: chaptersText(chapters, lang), chapters, links: chapters.map((c) => ({ label: chaptersText([c], lang), url: chapterLink(c.book, c.chapter, lang) })) };
    },
    totalText: (p, total, lang) => (p.cont ? '' : lang === 'en' ? `, ${total} ${total > 1 ? 'times' : 'time'} in all` : `，共${total}次读完`),
  },

  pray: {
    zh: '呼吸搭子', en: 'Breath buddies', what: L2('当日呼吸', 'the day’s Breathe'), verb: L2('呼吸', 'breathe'),
    about: L2('每次一起读当天的呼吸', 'Read the day’s Breathe together each time'),
    tint: 'sun',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7"/></svg>',
    fields: [],
    note: L2('每次见面，系统会推送当天的呼吸，大家一起读、一起呼吸。', 'Each time you meet, the site sends the day’s Breathe, and you read and breathe together.'),
    summary: L2('每次一起读当天的呼吸', 'The day’s Breathe each time'),
    plan: () => ({}),
    total: () => null,
    // the site's own 呼吸 of the session's date (the page shows the latest one on or before it)
    reading({ lang, date }) {
      const [, m, d] = date.split('-').map(Number);
      return { text: lang === 'en' ? `Breathe for ${MONTHS[m - 1]} ${d}` : `${m}月${d}日的呼吸`, huxi: date };
    },
  },

  feed: {
    zh: '投喂搭子', en: 'Feeding buddies', what: L2('新朋友课程', 'lessons for new friends'), verb: L2('追求', 'grow'),
    about: L2('陪新朋友，一课一课往下走', 'Walk with new friends, one lesson at a time'),
    tint: 'peach',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.6c0 5.6-7.5 10.2-7.5 10.2z"/></svg>',
    fields: [{ name: 'lesson', type: 'lesson', label: L2('从第几课开始', 'Start at lesson'), value: 1 }],
    note: L2('每次一课，读完可以做书签、写心得、打卡。', 'One lesson each time. Bookmark, write notes and check in when you finish.'),
    summary: L2('从第{lesson}课开始，每次一课', 'One lesson each time, from lesson {lesson}'),
    plan(pl, t, ctx) {
      const lesson = int(pl.lesson, 1);
      if (!ctx.feedCount) return t('投喂课程还没上架', 'The lessons are not on the site yet');
      if (!(lesson >= 1 && lesson <= ctx.feedCount)) return t(`一共${ctx.feedCount}课`, `There are ${ctx.feedCount} lessons`);
      return { lesson };
    },
    total: (p, ctx) => (ctx.feedCount ? Math.max(1, ctx.feedCount - (p.lesson || 1) + 1) : null),
    reading({ p, n, lang, ctx }) {
      const lesson = (p.lesson || 1) + n - 1;
      const title = ctx.feed?.[lesson]?.[lang];
      return { text: lang === 'en' ? `Lesson ${lesson}${title ? `: ${title}` : ''}` : `第${lesson}课${title ? `：${title}` : ''}`, lesson };
    },
  },

  life: {
    zh: '细嚼搭子', en: 'Chew buddies', what: L2('生命读经', 'Life-study'), verb: L2('细嚼', 'chew'),
    about: L2('一篇一篇细读生命读经', 'Read the Life-study slowly, message by message'),
    tint: 'lilac',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5c-2-1.6-5-2-8-1.5v13c3-.5 6-.1 8 1.5 2-1.6 5-2 8-1.5V5c-3-.5-6-.1-8 1.5z"/><path d="M12 6.5v13"/></svg>',
    fields: [
      { name: 'book', type: 'book', label: L2('哪一卷的生命读经', 'Life-study of which book'), value: 43 },
      { name: 'msg', type: 'num', label: L2('从第几篇开始', 'Start at message'), value: 1, min: 1, max: 999, pair: true },
      { name: 'per', type: 'select', label: L2('每次读几篇', 'Messages each time'), options: [1, 2, 3], value: 1, pair: true },
      { name: 'link', type: 'url', label: L2('生命读经的网址', 'Life-study link'), optional: true, edit: true,
        hint: L2('英文搭子会自动打开网上的英文生命读经，不用填。中文搭子如果有常用的生命读经网站，进到这一卷，把地址栏的链接贴在这里。', 'English groups open the Life-study online by themselves; leave this empty. For another site, go to this book there and paste the address.') },
    ],
    summary: L2('{book}生命读经，从第{msg}篇开始，每次{per}篇', 'Life-study of {book} from message {msg}, {per#message#messages} each time'),
    plan(pl, t) {
      const book = int(pl.book);
      if (!(book >= 1 && book <= 66)) return t('请选哪一卷', 'Pick a book');
      const msg = int(pl.msg, 1), per = int(pl.per, 1);
      if (!(msg >= 1 && msg <= 999)) return t('请填从第几篇开始', 'Fill in the message to start from');
      if (!(per >= 1 && per <= 5)) return t('请选每次读几篇', 'Pick how many messages each time');
      const link = checkLink(pl.link);
      if (link === false) return t('生命读经的链接要以 https:// 开头', 'The Life-study link must start with https://');
      return { book, msg, per, link };
    },
    total: () => null,
    reading({ p, n, lang }) {
      const from = (p.msg || 1) + (n - 1) * (p.per || 1);
      const to = from + (p.per || 1) - 1;
      const range = from === to ? `${from}` : `${from}–${to}`;
      const text = lang === 'en' ? `Life-study of ${bookName(p.book, 'en')}, ${from === to ? 'message' : 'messages'} ${range}` : `${bookName(p.book, 'zh')}生命读经 第${range}篇`;
      // the initiator's link (one for the book, or with {n} for the message), else the site for this language
      let links;
      if (p.link && !p.link.includes('{n}')) links = [{ label: text, url: p.link }];
      else {
        links = [];
        for (let m = from; m <= to; m++) {
          links.push({ label: lang === 'en' ? `Message ${m}` : `第${m}篇`, url: p.link ? p.link.replace(/\{n\}/g, String(m)) : lifeStudyLink(p.book, m, lang) });
        }
      }
      return { text, from, to, links };
    },
  },

  // 晨兴圣言 (Holy Word for Morning Revival): a book of weeks, six days a week.
  morning: {
    zh: '晨兴搭子', en: 'Morning revival buddies', what: L2('晨兴圣言', 'Morning Revival'), verb: L2('晨兴', 'enjoy the morning revival'),
    about: L2('一天一天读晨兴圣言', 'Read the Morning Revival day by day'),
    tint: 'sky',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 17.5h19M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v3M5.6 8.6l1.8 1.8M18.4 8.6l-1.8 1.8M8 21h8"/></svg>',
    defaults: { time: '06:30', days: [1, 2, 3, 4, 5, 6] },
    fields: [
      { name: 'set', type: 'text', label: L2('哪一本晨兴圣言', 'Which Morning Revival book'), max: 60, optional: true,
        placeholder: L2('例如：2026年秋季训练', 'e.g. 2026 Fall Training') },
      { name: 'weeks', type: 'num', label: L2('这一本一共几周', 'Weeks in the book'), value: 12, min: 1, max: 24, pair: true },
      { name: 'week', type: 'num', label: L2('从第几周开始', 'Start at week'), value: 1, min: 1, max: 24, pair: true },
      { name: 'day', type: 'select', label: L2('从哪一天开始', 'Start at day'), options: DAYS6, value: 1, pair: true },
      { name: 'per', type: 'select', label: L2('每次读几天', 'Days each time'), options: [1, 2, 3, 6], value: 1, pair: true },
      { name: 'link', type: 'url', label: L2('在网上读的网址', 'Where you read it online'), optional: true, edit: true,
        hint: L2('大家用书或手机里的晨兴圣言都可以；每次读哪一周哪一天，会写在提醒里。', 'Read from the book or an app; each reminder says which week and day.') },
    ],
    summary: L2('{set?《{set}》，}从第{week}周{day}开始，每次{per}天', '{set?{set}: }from week {week}, {day}; {per#day#days} each time'),
    plan(pl, t) {
      const set = String(pl.set ?? '').trim().slice(0, 60);
      const weeks = int(pl.weeks, 12), week = int(pl.week, 1), day = int(pl.day, 1), per = int(pl.per, 1);
      if (!(weeks >= 1 && weeks <= 24)) return t('请填这一本一共几周', 'Fill in how many weeks the book has');
      if (!(week >= 1 && week <= weeks)) return t(`这一本一共${weeks}周`, `The book has ${weeks} weeks`);
      if (!(day >= 1 && day <= 6)) return t('请选从哪一天开始', 'Pick the day to start at');
      if (![1, 2, 3, 6].includes(per)) return t('请选每次读几天', 'Pick how many days each time');
      const link = checkLink(pl.link);
      if (link === false) return t('网址要以 https:// 开头', 'The link must start with https://');
      return { set, weeks, week, day, per, link };
    },
    total: (p) => Math.max(1, Math.ceil((p.weeks * 6 - ((p.week - 1) * 6 + p.day - 1)) / p.per)),
    totalText: (p, total, lang) => (lang === 'en' ? `, ${total} ${total > 1 ? 'times' : 'time'} in all` : `，共${total}次读完`),
    reading({ p, n, lang }) {
      const first = (p.week - 1) * 6 + p.day - 1 + (n - 1) * p.per;
      const last = Math.min(first + p.per, p.weeks * 6) - 1;
      const a = { w: Math.floor(first / 6) + 1, d: (first % 6) + 1 };
      const b = { w: Math.floor(last / 6) + 1, d: (last % 6) + 1 };
      const dz = (d) => `周${'一二三四五六'[d - 1]}`;
      let text;
      if (lang === 'en') {
        text = first === last ? `Week ${a.w}, Day ${a.d}` : a.w === b.w ? `Week ${a.w}, Days ${a.d}–${b.d}` : `Week ${a.w} Day ${a.d} – Week ${b.w} Day ${b.d}`;
      } else {
        text = first === last ? `第${a.w}周 ${dz(a.d)}` : a.w === b.w ? `第${a.w}周 ${dz(a.d)}至${dz(b.d)}` : `第${a.w}周${dz(a.d)}至第${b.w}周${dz(b.d)}`;
      }
      const url = p.link ? p.link.replace(/\{w\}/g, String(a.w)).replace(/\{d\}/g, String(a.d)) : null;
      return { text, week: a.w, day: a.d, links: [{ label: text, url }] };
    },
  },
};

function int(v, d) {
  const n = Number(v ?? d);
  return Number.isInteger(n) ? n : NaN;
}
// '' when empty, the link when it is an https:// address, false otherwise.
function checkLink(v) {
  const link = String(v ?? '').trim().slice(0, 300);
  if (!link) return '';
  return /^https:\/\/\S+$/.test(link) ? link : false;
}

// A field's value as words: book names, day names, plain numbers and text.
function shown(field, v, lang) {
  if (field.type === 'book') return bookName(Number(v), lang);
  if (field.type === 'select') {
    const o = field.options.find((x) => (Array.isArray(x) ? x[0] : x) === Number(v));
    return Array.isArray(o) ? o[1][lang] : String(v);
  }
  return v == null ? '' : String(v);
}
// Fill a summary template (see the top of this file). `show(name)` gives a field's words,
// `on(name)` whether it is set. static/js/dazi.js follows the same rules for the form preview.
export function fillSummary(tpl, show, on, lang) {
  const one = (s) => s.replace(/\{(\w+)(?:#([^#{}]*)#([^{}]*))?\}/g, (_, k, a, b) => {
    const v = show(k);
    return a !== undefined && lang === 'en' ? `${v} ${Number(v) === 1 ? a : b}` : v;
  });
  // one pass, so a value is never read as a template
  return tpl.replace(/\{(\w+)\?((?:[^{}]|\{[^{}]*\})*)\}|\{\w+(?:#[^#{}]*#[^{}]*)?\}/g, (m, k, inner) => (k !== undefined ? (on(k) ? one(inner) : '') : one(m)));
}

// ---------- what the rest of the code uses ----------
export function kindTotal(g, ctx = {}) {
  return KINDS[g.kind].total(g.plan, ctx);
}
export function kindReading(g, n, date, ctx = {}) {
  const lang = g.lang === 'en' ? 'en' : 'zh';
  return { kind: g.kind, links: [], ...KINDS[g.kind].reading({ p: g.plan, n, lang, ctx, date }) };
}
export function kindPlanText(g, lang = 'zh', ctx = {}) {
  const k = KINDS[g.kind];
  const byName = Object.fromEntries(k.fields.map((f) => [f.name, f]));
  const p = g.plan || {};
  const text = fillSummary(k.summary[lang], (n) => (byName[n] ? shown(byName[n], p[n], lang) : ''), (n) => !!p[n], lang);
  const total = k.totalText ? k.totalText(p, kindTotal(g, ctx), lang) : '';
  const out = text + total;
  return lang === 'en' ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
// The initiator changes a field marked `edit` (a link) later. Returns the new plan or a message.
export function kindEdit(g, b, t) {
  const plan = { ...g.plan };
  for (const f of KINDS[g.kind].fields.filter((x) => x.edit)) {
    if (b[f.name] === undefined) continue;
    const link = checkLink(b[f.name]);
    if (link === false) return t('网址要以 https:// 开头', 'The link must start with https://');
    plan[f.name] = link;
  }
  return plan;
}
// Check the plan part of the form. Returns the plan, or a message for the person.
export function kindPlan(kind, pl, t, ctx = {}) {
  return KINDS[kind].plan(pl && typeof pl === 'object' ? pl : {}, t, ctx);
}
// What build.mjs and the pages need to know, in one language.
export function kindsForPage(lang) {
  return Object.fromEntries(Object.entries(KINDS).map(([key, k]) => [key, {
    name: k[lang], what: k.what[lang], verb: k.verb[lang], about: k.about[lang], tint: k.tint, icon: k.icon,
    summary: k.summary[lang], defaults: k.defaults || null,
    fields: k.fields.map((f) => ({ name: f.name, type: f.type, options: f.options ? f.options.map((o) => (Array.isArray(o) ? [o[0], o[1][lang]] : [o, String(o)])) : undefined })),
    edit: k.fields.filter((f) => f.edit).map((f) => ({ name: f.name, type: f.type, label: f.label[lang] })),
  }]));
}
