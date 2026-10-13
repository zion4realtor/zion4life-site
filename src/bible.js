// The 66 books: Chinese name, short name, English name, chapter count, and the book's name in
// bibleread.online's Bible addresses. 1,189 chapters in all. Shared by the Worker, build.mjs
// and (through /data/bible.json) the pages.
const NT = (s) => `the-${s}`;
export const BOOKS = [
  ['创世记', '创', 'Genesis', 50, 'genesis'], ['出埃及记', '出', 'Exodus', 40, 'exodus'], ['利未记', '利', 'Leviticus', 27, 'leviticus'],
  ['民数记', '民', 'Numbers', 36, 'numbers'], ['申命记', '申', 'Deuteronomy', 34, 'deuteronomy'], ['约书亚记', '书', 'Joshua', 24, 'joshua'],
  ['士师记', '士', 'Judges', 21, 'judges'], ['路得记', '得', 'Ruth', 4, 'ruth'], ['撒母耳记上', '撒上', '1 Samuel', 31, 'first-samuel'],
  ['撒母耳记下', '撒下', '2 Samuel', 24, 'second-samuel'], ['列王纪上', '王上', '1 Kings', 22, 'first-kings'], ['列王纪下', '王下', '2 Kings', 25, 'second-kings'],
  ['历代志上', '代上', '1 Chronicles', 29, 'first-chronicles'], ['历代志下', '代下', '2 Chronicles', 36, 'second-chronicles'], ['以斯拉记', '拉', 'Ezra', 10, 'ezra'],
  ['尼希米记', '尼', 'Nehemiah', 13, 'nehemiah'], ['以斯帖记', '斯', 'Esther', 10, 'esther'], ['约伯记', '伯', 'Job', 42, 'job'],
  ['诗篇', '诗', 'Psalms', 150, 'psalms'], ['箴言', '箴', 'Proverbs', 31, 'proverbs'], ['传道书', '传', 'Ecclesiastes', 12, 'ecclesiastes'],
  ['雅歌', '歌', 'Song of Songs', 8, 'song-of-songs'], ['以赛亚书', '赛', 'Isaiah', 66, 'isaiah'], ['耶利米书', '耶', 'Jeremiah', 52, 'jeremiah'],
  ['耶利米哀歌', '哀', 'Lamentations', 5, 'lamentations'], ['以西结书', '结', 'Ezekiel', 48, 'ezekiel'], ['但以理书', '但', 'Daniel', 12, 'daniel'],
  ['何西阿书', '何', 'Hosea', 14, 'hosea'], ['约珥书', '珥', 'Joel', 3, 'joel'], ['阿摩司书', '摩', 'Amos', 9, 'amos'],
  ['俄巴底亚书', '俄', 'Obadiah', 1, 'obadiah'], ['约拿书', '拿', 'Jonah', 4, 'jonah'], ['弥迦书', '弥', 'Micah', 7, 'micah'],
  ['那鸿书', '鸿', 'Nahum', 3, 'nahum'], ['哈巴谷书', '哈', 'Habakkuk', 3, 'habakkuk'], ['西番雅书', '番', 'Zephaniah', 3, 'zephaniah'],
  ['哈该书', '该', 'Haggai', 2, 'haggai'], ['撒迦利亚书', '亚', 'Zechariah', 14, 'zechariah'], ['玛拉基书', '玛', 'Malachi', 4, 'malachi'],
  ['马太福音', '太', 'Matthew', 28, NT('gospel-according-to-matthew')], ['马可福音', '可', 'Mark', 16, NT('gospel-according-to-mark')],
  ['路加福音', '路', 'Luke', 24, NT('gospel-according-to-luke')], ['约翰福音', '约', 'John', 21, NT('gospel-according-to-john')],
  ['使徒行传', '徒', 'Acts', 28, NT('acts-of-the-apostles')], ['罗马书', '罗', 'Romans', 16, NT('epistle-of-paul-to-the-romans')],
  ['哥林多前书', '林前', '1 Corinthians', 16, NT('first-epistle-of-paul-to-the-corinthians')],
  ['哥林多后书', '林后', '2 Corinthians', 13, NT('second-epistle-of-paul-to-the-corinthians')],
  ['加拉太书', '加', 'Galatians', 6, NT('epistle-of-paul-to-the-galatians')], ['以弗所书', '弗', 'Ephesians', 6, NT('epistle-of-paul-to-the-ephesians')],
  ['腓立比书', '腓', 'Philippians', 4, NT('epistle-of-paul-to-the-philippians')], ['歌罗西书', '西', 'Colossians', 4, NT('epistle-of-paul-to-the-colossians')],
  ['帖撒罗尼迦前书', '帖前', '1 Thessalonians', 5, NT('first-epistle-of-paul-to-the-thessalonians')],
  ['帖撒罗尼迦后书', '帖后', '2 Thessalonians', 3, NT('second-epistle-of-paul-to-the-thessalonians')],
  ['提摩太前书', '提前', '1 Timothy', 6, NT('first-epistle-of-paul-to-timothy')], ['提摩太后书', '提后', '2 Timothy', 4, NT('second-epistle-of-paul-to-timothy')],
  ['提多书', '多', 'Titus', 3, NT('epistle-of-paul-to-titus')], ['腓利门书', '门', 'Philemon', 1, NT('epistle-of-paul-to-philemon')],
  ['希伯来书', '来', 'Hebrews', 13, NT('epistle-to-the-hebrews')], ['雅各书', '雅', 'James', 5, NT('epistle-of-james')],
  ['彼得前书', '彼前', '1 Peter', 5, NT('first-epistle-of-peter')], ['彼得后书', '彼后', '2 Peter', 3, NT('second-epistle-of-peter')],
  ['约翰一书', '约壹', '1 John', 5, NT('first-epistle-of-john')], ['约翰二书', '约贰', '2 John', 1, NT('second-epistle-of-john')],
  ['约翰三书', '约叁', '3 John', 1, NT('third-epistle-of-john')], ['犹大书', '犹', 'Jude', 1, NT('epistle-of-jude')], ['启示录', '启', 'Revelation', 22, 'revelation'],
].map(([zh, short, en, chapters, slug], i) => ({ n: i + 1, zh, short, en, chapters, slug, ls: en.toLowerCase().replace(/ /g, '-'), name: zh }));

export const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0);

// Where the Recovery Version is read online, by language. The Recovery Version and the
// Life-studies are copyrighted (Living Stream Ministry), so the site links to them and never
// hosts the text. Placeholders: {n} book number (1–66), {slug} bibleread.online's Bible name
// for the book, {ls} its Life-study name, {c} chapter, {m} Life-study message.
export const BIBLE_LINKS = {
  en: 'https://bibleread.online/bible/{slug}/{c}/',
  zh: 'https://recoveryversion.com.tw/verse/{n}/{c}?verse=1',
};
// Chinese Life-study: none yet (the initiator can paste one). Set it when Zion sends one.
export const LIFE_STUDY_LINKS = {
  en: 'https://bibleread.online/life-study-of-the-bible/life-study-of-{ls}/{m}/',
  zh: '',
};

const START = [];
{
  let s = 0;
  for (const b of BOOKS) { START.push(s); s += b.chapters; }
}
// 0-based position of (book, chapter) in the whole Bible.
export const chapterIndex = (book, chapter) => START[book - 1] + chapter - 1;
export function chapterAt(index) {
  let b = BOOKS.length - 1;
  while (START[b] > index) b--;
  return { book: b + 1, chapter: index - START[b] + 1 };
}
const fill = (tpl, book, extra) => {
  const b = BOOKS[book - 1];
  return Object.entries({ n: book, slug: b.slug, ls: b.ls, ...extra }).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);
};
export function chapterLink(book, chapter, lang = 'zh') {
  return BIBLE_LINKS[lang] ? fill(BIBLE_LINKS[lang], book, { c: chapter }) : null;
}
// A Life-study message online, or null when there is no address for this language.
export function lifeStudyLink(book, message, lang = 'zh') {
  return LIFE_STUDY_LINKS[lang] ? fill(LIFE_STUDY_LINKS[lang], book, { m: message }) : null;
}
export const bookName = (book, lang) => (lang === 'en' ? BOOKS[book - 1].en : BOOKS[book - 1].zh);
// "约翰福音 第3章", "约翰福音 第3–4章", "约翰福音 第21章、使徒行传 第1章" / "John 3", "John 3–4", "John 21; Acts 1"
export function chaptersText(list, lang = 'zh') {
  const parts = [];
  for (const { book, chapter } of list) {
    const last = parts[parts.length - 1];
    if (last && last.book === book && last.to === chapter - 1) last.to = chapter;
    else parts.push({ book, from: chapter, to: chapter });
  }
  if (lang === 'en') return parts.map((p) => `${BOOKS[p.book - 1].en} ${p.from === p.to ? p.from : `${p.from}–${p.to}`}`).join('; ');
  return parts.map((p) => `${BOOKS[p.book - 1].zh} 第${p.from === p.to ? p.from : `${p.from}–${p.to}`}章`).join('、');
}
