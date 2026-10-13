// Group schedules: when each session happens and what it reads.
// Pure functions (the current time is always passed in), shared by the Worker and tests.
//
// A group meets on some weekdays (`days`, 0 = Sunday) at `time` (HH:MM) for `minutes`,
// starting on `startDate`, all in the initiator's time zone `tz`. Session n (1, 2, 3 …)
// is the n-th meeting day on or after startDate. Reading groups read `per` chapters a
// session from (book, chapter); with `cont` they carry on into the next book.
import { BOOKS, TOTAL_CHAPTERS, chapterIndex, chapterAt, chaptersText, chapterLink } from './bible.js';

const DAY = 86400000;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const KINDS = { read: '饭搭子', pray: '呼吸搭子', feed: '投喂搭子' };
export const TZ_LABELS = {
  'Asia/Shanghai': '北京时间', 'Asia/Hong_Kong': '香港时间', 'Asia/Taipei': '台北时间', 'Asia/Singapore': '新加坡时间',
  'Asia/Tokyo': '东京时间', 'Asia/Seoul': '首尔时间', 'Australia/Sydney': '悉尼时间', 'Europe/London': '伦敦时间',
  'Europe/Paris': '巴黎时间', 'Europe/Berlin': '柏林时间', 'America/New_York': '美东时间', 'America/Chicago': '美中时间',
  'America/Denver': '美国山地时间', 'America/Los_Angeles': '美西时间', 'America/Toronto': '多伦多时间',
  'America/Vancouver': '温哥华时间', 'Pacific/Auckland': '奥克兰时间',
};
export const tzLabel = (tz) => TZ_LABELS[tz] || tz;

export function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length < 64;
  } catch {
    return false;
  }
}
const fmtCache = new Map();
// Minutes to add to UTC to get the wall clock in tz at instant ms.
export function tzOffset(tz, ms) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000);
}
// The instant when the wall clock in tz shows dateStr timeStr.
export function zonedTime(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - tzOffset(tz, wall) * 60000;
  return wall - tzOffset(tz, first) * 60000;
}
export const localDate = (tz, ms) => new Date(ms + tzOffset(tz, ms) * 60000).toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

// Meeting dates in the first week, in date order.
function firstWeek(g) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(g.startDate, i);
    if (g.days.includes(weekday(d))) out.push(d);
  }
  return out;
}
// Number of sessions in the plan, or null when the group meets with no end.
export function totalSessions(g) {
  if (g.kind !== 'read') return null;
  const { book, chapter, per, cont } = g.plan;
  const start = chapterIndex(book, chapter);
  const end = cont ? TOTAL_CHAPTERS : chapterIndex(book, BOOKS[book - 1].chapters) + 1;
  return Math.max(1, Math.ceil((end - start) / per));
}
export function readingFor(g, n) {
  if (g.kind !== 'read') return { text: g.plan.material || '', link: g.plan.link || null, chapters: [] };
  const { book, chapter, per, cont } = g.plan;
  const start = chapterIndex(book, chapter) + (n - 1) * per;
  const end = cont ? TOTAL_CHAPTERS : chapterIndex(book, BOOKS[book - 1].chapters) + 1;
  const chapters = [];
  for (let i = start; i < Math.min(start + per, end); i++) chapters.push(chapterAt(i));
  const first = chapters[0];
  return { text: chaptersText(chapters), link: first ? chapterLink(first.book, first.chapter) : null, chapters };
}
export function session(g, n) {
  const week = firstWeek(g);
  const k = week.length;
  const date = addDays(week[(n - 1) % k], 7 * Math.floor((n - 1) / k));
  const start = zonedTime(date, g.time, g.tz);
  const r = readingFor(g, n);
  return { n, date, start, end: start + g.minutes * 60000, reading: r.text, link: r.link };
}
// How many sessions have started at instant ms (0 before the first one).
export function startedCount(g, ms) {
  const today = localDate(g.tz, ms);
  const span = daysBetween(g.startDate, today);
  if (span < 0) return 0;
  const k = g.days.length;
  let n = Math.floor((span + 1) / 7) * k;
  for (let i = Math.floor((span + 1) / 7) * 7; i <= span; i++) {
    if (g.days.includes(weekday(addDays(g.startDate, i)))) n++;
  }
  if (n > 0 && session(g, n).start > ms) n--;
  const total = totalSessions(g);
  return total ? Math.min(n, total) : n;
}
// The session in progress (or that started within its own length), and the next one.
export function sessionState(g, ms) {
  const total = totalSessions(g);
  const n = startedCount(g, ms);
  const last = n ? session(g, n) : null;
  const next = !total || n < total ? session(g, n + 1) : null;
  return {
    total,
    done: n,
    current: last && ms < last.end ? last : null,
    last,
    next,
    finished: !!total && n >= total && !!last && ms >= last.end,
  };
}
// Sessions starting in [from, to).
export function sessionsBetween(g, from, to) {
  const out = [];
  const total = totalSessions(g);
  for (let n = startedCount(g, from - 1) + 1; !total || n <= total; n++) {
    const s = session(g, n);
    if (s.start >= to) break;
    if (s.start >= from) out.push(s);
    if (out.length > 50) break;
  }
  return out;
}

export function daysText(days) {
  const d = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (d.length === 7) return '每天';
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return '每周一到周五';
  return `每周${d.map((x) => WEEK[x]).join('、')}`;
}
export function minutesText(min) {
  if (min < 60) return `${min}分钟`;
  return min % 60 ? `${Math.floor(min / 60)}小时${min % 60}分钟` : `${min / 60}小时`;
}
export const scheduleText = (g) => `${daysText(g.days)} ${g.time}（${tzLabel(g.tz)}），每次${minutesText(g.minutes)}`;
export function planText(g) {
  if (g.kind !== 'read') return g.plan.material || '';
  const { book, chapter, per, cont } = g.plan;
  const b = BOOKS[book - 1];
  return `从${b.name}第${chapter}章开始，每次读${per}章${cont ? '，读完接着读下一卷' : `，共${totalSessions(g)}次读完`}`;
}
// "10月14日（周二）20:00 北京时间"
export function sessionLabel(g, s) {
  const [, m, d] = s.date.split('-').map(Number);
  return `${m}月${d}日（周${WEEK[weekday(s.date)]}）${g.time} ${tzLabel(g.tz)}`;
}

// Calendar file: one event per session (exact times, no time-zone tables needed),
// each with a reminder 10 minutes before.
export function icsCalendar(g, url, fromMs, max = 60) {
  const total = totalSessions(g);
  const first = startedCount(g, fromMs) + 1;
  const last = total ? Math.min(total, first + max - 1) : first + max - 1;
  const stamp = icsTime(fromMs);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zion4life.faith//groups//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(g.title)}`];
  for (let n = first; n <= last; n++) {
    const s = session(g, n);
    const what = s.reading ? `${g.title}：${s.reading}` : g.title;
    lines.push(
      'BEGIN:VEVENT', `UID:${g.id}-${n}@zion4life.faith`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(s.start)}`, `DTEND:${icsTime(s.end)}`,
      `SUMMARY:${icsText(what)}`, `DESCRIPTION:${icsText(`第${n}次${s.reading ? `，读${s.reading}` : ''}。打开小组：${url}`)}`, `URL:${url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(what)}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Fold lines at 75 bytes without splitting a character.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
