// The 66 books: Chinese name, short name, OSIS code, chapter count. 1,189 chapters in all.
export const BOOKS = [
  ['创世记', '创', 'Gen', 50], ['出埃及记', '出', 'Exod', 40], ['利未记', '利', 'Lev', 27], ['民数记', '民', 'Num', 36],
  ['申命记', '申', 'Deut', 34], ['约书亚记', '书', 'Josh', 24], ['士师记', '士', 'Judg', 21], ['路得记', '得', 'Ruth', 4],
  ['撒母耳记上', '撒上', '1Sam', 31], ['撒母耳记下', '撒下', '2Sam', 24], ['列王纪上', '王上', '1Kgs', 22], ['列王纪下', '王下', '2Kgs', 25],
  ['历代志上', '代上', '1Chr', 29], ['历代志下', '代下', '2Chr', 36], ['以斯拉记', '拉', 'Ezra', 10], ['尼希米记', '尼', 'Neh', 13],
  ['以斯帖记', '斯', 'Esth', 10], ['约伯记', '伯', 'Job', 42], ['诗篇', '诗', 'Ps', 150], ['箴言', '箴', 'Prov', 31],
  ['传道书', '传', 'Eccl', 12], ['雅歌', '歌', 'Song', 8], ['以赛亚书', '赛', 'Isa', 66], ['耶利米书', '耶', 'Jer', 52],
  ['耶利米哀歌', '哀', 'Lam', 5], ['以西结书', '结', 'Ezek', 48], ['但以理书', '但', 'Dan', 12], ['何西阿书', '何', 'Hos', 14],
  ['约珥书', '珥', 'Joel', 3], ['阿摩司书', '摩', 'Amos', 9], ['俄巴底亚书', '俄', 'Obad', 1], ['约拿书', '拿', 'Jonah', 4],
  ['弥迦书', '弥', 'Mic', 7], ['那鸿书', '鸿', 'Nah', 3], ['哈巴谷书', '哈', 'Hab', 3], ['西番雅书', '番', 'Zeph', 3],
  ['哈该书', '该', 'Hag', 2], ['撒迦利亚书', '亚', 'Zech', 14], ['玛拉基书', '玛', 'Mal', 4],
  ['马太福音', '太', 'Matt', 28], ['马可福音', '可', 'Mark', 16], ['路加福音', '路', 'Luke', 24], ['约翰福音', '约', 'John', 21],
  ['使徒行传', '徒', 'Acts', 28], ['罗马书', '罗', 'Rom', 16], ['哥林多前书', '林前', '1Cor', 16], ['哥林多后书', '林后', '2Cor', 13],
  ['加拉太书', '加', 'Gal', 6], ['以弗所书', '弗', 'Eph', 6], ['腓立比书', '腓', 'Phil', 4], ['歌罗西书', '西', 'Col', 4],
  ['帖撒罗尼迦前书', '帖前', '1Thess', 5], ['帖撒罗尼迦后书', '帖后', '2Thess', 3], ['提摩太前书', '提前', '1Tim', 6],
  ['提摩太后书', '提后', '2Tim', 4], ['提多书', '多', 'Titus', 3], ['腓利门书', '门', 'Phlm', 1], ['希伯来书', '来', 'Heb', 13],
  ['雅各书', '雅', 'Jas', 5], ['彼得前书', '彼前', '1Pet', 5], ['彼得后书', '彼后', '2Pet', 3], ['约翰一书', '约壹', '1John', 5],
  ['约翰二书', '约贰', '2John', 1], ['约翰三书', '约叁', '3John', 1], ['犹大书', '犹', 'Jude', 1], ['启示录', '启', 'Rev', 22],
].map(([name, short, osis, chapters], i) => ({ n: i + 1, name, short, osis, chapters }));

export const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0);

// Where to read a chapter online. Zion will send the Recovery Version (恢复本) address;
// until then this stays empty and pages show the chapter without a link.
// Placeholders: {book} 1–66, {osis} e.g. John, {chapter}.
export const BIBLE_LINK = '';

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
export function chapterLink(book, chapter) {
  if (!BIBLE_LINK) return null;
  const b = BOOKS[book - 1];
  return BIBLE_LINK.replace('{book}', book).replace('{osis}', b.osis).replace('{chapter}', chapter);
}
// "约翰福音 第3章", "约翰福音 第3–4章", "约翰福音 第21章、使徒行传 第1章"
export function chaptersText(list) {
  const parts = [];
  for (const { book, chapter } of list) {
    const last = parts[parts.length - 1];
    if (last && last.book === book && last.to === chapter - 1) last.to = chapter;
    else parts.push({ book, from: chapter, to: chapter });
  }
  return parts.map((p) => `${BOOKS[p.book - 1].name} 第${p.from === p.to ? p.from : `${p.from}–${p.to}`}章`).join('、');
}
