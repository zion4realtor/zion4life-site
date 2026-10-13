// The 66 books: Chinese name, short name, English name, Recovery Version URL name, chapter count.
// 1,189 chapters in all. Shared by the Worker, build.mjs and (through /data/bible.json) the pages.
export const BOOKS = [
  ['创世记', '创', 'Genesis', 'Genesis', 50], ['出埃及记', '出', 'Exodus', 'Exodus', 40], ['利未记', '利', 'Leviticus', 'Leviticus', 27],
  ['民数记', '民', 'Numbers', 'Numbers', 36], ['申命记', '申', 'Deuteronomy', 'Deuteronomy', 34], ['约书亚记', '书', 'Joshua', 'Joshua', 24],
  ['士师记', '士', 'Judges', 'Judges', 21], ['路得记', '得', 'Ruth', 'Ruth', 4], ['撒母耳记上', '撒上', '1 Samuel', '1Samuel', 31],
  ['撒母耳记下', '撒下', '2 Samuel', '2Samuel', 24], ['列王纪上', '王上', '1 Kings', '1Kings', 22], ['列王纪下', '王下', '2 Kings', '2Kings', 25],
  ['历代志上', '代上', '1 Chronicles', '1Chronicles', 29], ['历代志下', '代下', '2 Chronicles', '2Chronicles', 36], ['以斯拉记', '拉', 'Ezra', 'Ezra', 10],
  ['尼希米记', '尼', 'Nehemiah', 'Nehemiah', 13], ['以斯帖记', '斯', 'Esther', 'Esther', 10], ['约伯记', '伯', 'Job', 'Job', 42],
  ['诗篇', '诗', 'Psalms', 'Psalms', 150], ['箴言', '箴', 'Proverbs', 'Proverbs', 31], ['传道书', '传', 'Ecclesiastes', 'Ecclesiastes', 12],
  ['雅歌', '歌', 'Song of Songs', 'SongofSongs', 8], ['以赛亚书', '赛', 'Isaiah', 'Isaiah', 66], ['耶利米书', '耶', 'Jeremiah', 'Jeremiah', 52],
  ['耶利米哀歌', '哀', 'Lamentations', 'Lamentations', 5], ['以西结书', '结', 'Ezekiel', 'Ezekiel', 48], ['但以理书', '但', 'Daniel', 'Daniel', 12],
  ['何西阿书', '何', 'Hosea', 'Hosea', 14], ['约珥书', '珥', 'Joel', 'Joel', 3], ['阿摩司书', '摩', 'Amos', 'Amos', 9],
  ['俄巴底亚书', '俄', 'Obadiah', 'Obadiah', 1], ['约拿书', '拿', 'Jonah', 'Jonah', 4], ['弥迦书', '弥', 'Micah', 'Micah', 7],
  ['那鸿书', '鸿', 'Nahum', 'Nahum', 3], ['哈巴谷书', '哈', 'Habakkuk', 'Habakkuk', 3], ['西番雅书', '番', 'Zephaniah', 'Zephaniah', 3],
  ['哈该书', '该', 'Haggai', 'Haggai', 2], ['撒迦利亚书', '亚', 'Zechariah', 'Zechariah', 14], ['玛拉基书', '玛', 'Malachi', 'Malachi', 4],
  ['马太福音', '太', 'Matthew', 'Matthew', 28], ['马可福音', '可', 'Mark', 'Mark', 16], ['路加福音', '路', 'Luke', 'Luke', 24],
  ['约翰福音', '约', 'John', 'John', 21], ['使徒行传', '徒', 'Acts', 'Acts', 28], ['罗马书', '罗', 'Romans', 'Romans', 16],
  ['哥林多前书', '林前', '1 Corinthians', '1Corinthians', 16], ['哥林多后书', '林后', '2 Corinthians', '2Corinthians', 13],
  ['加拉太书', '加', 'Galatians', 'Galatians', 6], ['以弗所书', '弗', 'Ephesians', 'Ephesians', 6], ['腓立比书', '腓', 'Philippians', 'Philippians', 4],
  ['歌罗西书', '西', 'Colossians', 'Colossians', 4], ['帖撒罗尼迦前书', '帖前', '1 Thessalonians', '1Thessalonians', 5],
  ['帖撒罗尼迦后书', '帖后', '2 Thessalonians', '2Thessalonians', 3], ['提摩太前书', '提前', '1 Timothy', '1Timothy', 6],
  ['提摩太后书', '提后', '2 Timothy', '2Timothy', 4], ['提多书', '多', 'Titus', 'Titus', 3], ['腓利门书', '门', 'Philemon', 'Philemon', 1],
  ['希伯来书', '来', 'Hebrews', 'Hebrews', 13], ['雅各书', '雅', 'James', 'James', 5], ['彼得前书', '彼前', '1 Peter', '1Peter', 5],
  ['彼得后书', '彼后', '2 Peter', '2Peter', 3], ['约翰一书', '约壹', '1 John', '1John', 5], ['约翰二书', '约贰', '2 John', '2John', 1],
  ['约翰三书', '约叁', '3 John', '3John', 1], ['犹大书', '犹', 'Jude', 'Jude', 1], ['启示录', '启', 'Revelation', 'Revelation', 22],
].map(([zh, short, en, rcv, chapters], i) => ({ n: i + 1, zh, short, en, rcv, chapters, name: zh }));

export const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0);

// Where each chapter is read online, by language. The Recovery Version is copyrighted
// (Living Stream Ministry), so the site links to it and never hosts the text.
// English: Living Stream Ministry's own online Recovery Version.
// Chinese: set when Zion sends the address he uses. Placeholders: {n} book number (1–66),
// {nn} two-digit book number, {rcv} English URL name, {c} chapter.
export const BIBLE_LINKS = {
  en: 'https://text.recoveryversion.bible/{nn}_{rcv}_{c}.htm',
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
export function chapterLink(book, chapter, lang = 'zh') {
  const tpl = BIBLE_LINKS[lang];
  if (!tpl) return null;
  const b = BOOKS[book - 1];
  return tpl.replace('{nn}', String(book).padStart(2, '0')).replace('{n}', String(book)).replace('{rcv}', b.rcv).replace('{c}', String(chapter));
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
