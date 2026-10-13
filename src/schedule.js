// 搭子 schedules: when each session happens and what it reads. Pure functions (the current
// time is always passed in), shared by the Worker and the tests.
//
// A group meets on some weekdays (`days`, 0 = Sunday) at `time` (HH:MM) for `minutes`,
// starting on `startDate`, all in the initiator's time zone `tz`. Session n (1, 2, 3 …) is
// the n-th meeting day on or after startDate. What a session reads depends on the kind:
//   bible  饭搭子    `per` chapters a session from (book, chapter); `cont` carries on into the next book
//   pray   呼吸搭子  the 呼吸 (daily prayer burden) of the session's date
//   feed   投喂搭子  one lesson a session from `lesson`
//   life   细嚼搭子  `per` Life-study messages a session from (book, msg), read through `link`
import { BOOKS, TOTAL_CHAPTERS, chapterIndex, chapterAt, chaptersText, chapterLink, bookName } from './bible.js';

const DAY = 86400000;
export const KINDS = {
  bible: { zh: '饭搭子', en: 'Meal buddies', what: { zh: '圣经', en: 'the Bible' }, verb: { zh: '吃饭', en: 'eat' } },
  pray: { zh: '呼吸搭子', en: 'Breath buddies', what: { zh: '当日呼吸', en: 'the day’s Breathe' }, verb: { zh: '呼吸', en: 'breathe' } },
  feed: { zh: '投喂搭子', en: 'Feeding buddies', what: { zh: '新朋友课程', en: 'lessons for new friends' }, verb: { zh: '追求', en: 'grow' } },
  life: { zh: '细嚼搭子', en: 'Chew buddies', what: { zh: '生命读经', en: 'Life-study' }, verb: { zh: '细嚼', en: 'chew' } },
};
export const VENUES = {
  phone: { zh: '电话', en: 'Phone' },
  wechat: { zh: '微信', en: 'WeChat' },
  zoom: { zh: 'Zoom', en: 'Zoom' },
  whatsapp: { zh: 'WhatsApp', en: 'WhatsApp' },
  teams: { zh: 'Teams', en: 'Teams' },
};
export const TZ_LABELS = {
  'Asia/Shanghai': ['北京时间', 'Beijing time'], 'Asia/Hong_Kong': ['香港时间', 'Hong Kong time'], 'Asia/Taipei': ['台北时间', 'Taipei time'],
  'Asia/Singapore': ['新加坡时间', 'Singapore time'], 'Asia/Tokyo': ['东京时间', 'Tokyo time'], 'Asia/Seoul': ['首尔时间', 'Seoul time'],
  'Australia/Sydney': ['悉尼时间', 'Sydney time'], 'Europe/London': ['伦敦时间', 'London time'], 'Europe/Paris': ['巴黎时间', 'Paris time'],
  'Europe/Berlin': ['柏林时间', 'Berlin time'], 'America/New_York': ['美东时间', 'US Eastern'], 'America/Chicago': ['美中时间', 'US Central'],
  'America/Denver': ['美国山地时间', 'US Mountain'], 'America/Los_Angeles': ['美西时间', 'US Pacific'], 'America/Toronto': ['多伦多时间', 'Toronto time'],
  'America/Vancouver': ['温哥华时间', 'Vancouver time'], 'Pacific/Auckland': ['奥克兰时间', 'Auckland time'],
};
export const tzLabel = (tz, lang = 'zh') => (TZ_LABELS[tz] ? TZ_LABELS[tz][lang === 'en' ? 1 : 0] : tz);
const WEEK = { zh: ['日', '一', '二', '三', '四', '五', '六'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- time zones ----------
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

// ---------- sessions ----------
// Meeting dates in the first week, in date order.
function firstWeek(g) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(g.startDate, i);
    if (g.days.includes(weekday(d))) out.push(d);
  }
  return out;
}
// How many sessions the plan has, or null when the group meets with no end.
// ctx.feedCount: number of 投喂 lessons on the site.
export function totalSessions(g, ctx = {}) {
  if (g.kind === 'bible') {
    const { book, chapter, per, cont } = g.plan;
    const start = chapterIndex(book, chapter);
    const end = cont ? TOTAL_CHAPTERS : chapterIndex(book, BOOKS[book - 1].chapters) + 1;
    return Math.max(1, Math.ceil((end - start) / per));
  }
  if (g.kind === 'feed' && ctx.feedCount) return Math.max(1, ctx.feedCount - (g.plan.lesson || 1) + 1);
  return null;
}
export function sessionDate(g, n) {
  const week = firstWeek(g);
  const k = week.length;
  return addDays(week[(n - 1) % k], 7 * Math.floor((n - 1) / k));
}
export function session(g, n) {
  const date = sessionDate(g, n);
  const start = zonedTime(date, g.time, g.tz);
  return { n, date, start, end: start + g.minutes * 60000 };
}
// How many sessions have started at instant ms (0 before the first one).
export function startedCount(g, ms, ctx = {}) {
  const today = localDate(g.tz, ms);
  const span = daysBetween(g.startDate, today);
  if (span < 0) return 0;
  const k = g.days.length;
  const weeks = Math.floor((span + 1) / 7);
  let n = weeks * k;
  for (let i = weeks * 7; i <= span; i++) {
    if (g.days.includes(weekday(addDays(g.startDate, i)))) n++;
  }
  if (n > 0 && session(g, n).start > ms) n--;
  const total = totalSessions(g, ctx);
  return total ? Math.min(n, total) : n;
}
// The session in progress (started and not yet ended), the latest started one, and the next one.
export function sessionState(g, ms, ctx = {}) {
  const total = totalSessions(g, ctx);
  const n = startedCount(g, ms, ctx);
  const last = n ? session(g, n) : null;
  const next = !total || n < total ? session(g, n + 1) : null;
  return { total, done: n, current: last && ms < last.end ? last : null, last, next, finished: !!total && n >= total && !!last && ms >= last.end };
}
// Sessions starting in [from, to).
export function sessionsBetween(g, from, to, ctx = {}) {
  const out = [];
  const total = totalSessions(g, ctx);
  for (let n = startedCount(g, from - 1, ctx) + 1; !total || n <= total; n++) {
    const s = session(g, n);
    if (s.start >= to) break;
    if (s.start >= from) out.push(s);
    if (out.length > 400) break;
  }
  return out;
}
// A check-in is on time until 3 hours after the session ends; later it is a make-up (补).
export const lateAfter = (s) => s.end + 3 * 3600000;

// ---------- what each session reads ----------
// ctx.feed: { [lesson]: { zh, en } } lesson titles; ctx.site: site URL for links to the site's own pages.
export function readingFor(g, n, ctx = {}) {
  const lang = g.lang === 'en' ? 'en' : 'zh';
  const p = g.plan;
  if (g.kind === 'bible') {
    const start = chapterIndex(p.book, p.chapter) + (n - 1) * p.per;
    const end = p.cont ? TOTAL_CHAPTERS : chapterIndex(p.book, BOOKS[p.book - 1].chapters) + 1;
    const chapters = [];
    for (let i = start; i < Math.min(start + p.per, end); i++) {
      const c = chapterAt(i);
      chapters.push({ ...c, url: chapterLink(c.book, c.chapter, lang), label: chaptersText([c], lang) });
    }
    return { kind: 'bible', text: chaptersText(chapters, lang), chapters, url: chapters[0]?.url || null };
  }
  if (g.kind === 'pray') {
    const date = sessionDate(g, n);
    const [, m, d] = date.split('-').map(Number);
    return { kind: 'pray', date, text: lang === 'en' ? `Breathe for ${MONTHS[m - 1]} ${d}` : `${m}月${d}日的呼吸`, url: null };
  }
  if (g.kind === 'feed') {
    const lesson = (p.lesson || 1) + n - 1;
    const t = ctx.feed?.[lesson]?.[lang];
    return { kind: 'feed', lesson, text: lang === 'en' ? `Lesson ${lesson}${t ? `: ${t}` : ''}` : `第${lesson}课${t ? `：${t}` : ''}`, url: null };
  }
  // life
  const from = (p.msg || 1) + (n - 1) * (p.per || 1);
  const to = from + (p.per || 1) - 1;
  const range = from === to ? `${from}` : `${from}–${to}`;
  const text = lang === 'en' ? `Life-study of ${bookName(p.book, 'en')}, ${from === to ? 'message' : 'messages'} ${range}` : `${bookName(p.book, 'zh')}生命读经 第${range}篇`;
  const url = p.link ? p.link.replace(/\{n\}/g, String(from)) : null;
  return { kind: 'life', from, to, text, url };
}

// ---------- words ----------
export function daysText(days, lang = 'zh') {
  const d = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (d.length === 7) return lang === 'en' ? 'Every day' : '每天';
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return lang === 'en' ? 'Weekdays' : '每周一到周五';
  return lang === 'en' ? `Every ${d.map((x) => WEEK.en[x]).join(', ')}` : `每周${d.map((x) => WEEK.zh[x]).join('、')}`;
}
export function minutesText(min, lang = 'zh') {
  if (lang === 'en') return min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min / 60} hr`;
  if (min < 60) return `${min}分钟`;
  return min % 60 ? `${Math.floor(min / 60)}小时${min % 60}分钟` : `${min / 60}小时`;
}
export const scheduleText = (g, lang = 'zh') =>
  lang === 'en'
    ? `${daysText(g.days, 'en')} at ${g.time} (${tzLabel(g.tz, 'en')}), ${minutesText(g.minutes, 'en')} each`
    : `${daysText(g.days, 'zh')} ${g.time}（${tzLabel(g.tz, 'zh')}），每次${minutesText(g.minutes, 'zh')}`;
// The plan in words, in the viewer's language.
export function planText(g, lang = 'zh', ctx = {}) {
  const p = g.plan;
  const en = lang === 'en';
  if (g.kind === 'bible') {
    const b = bookName(p.book, lang);
    const total = totalSessions(g, ctx);
    return en
      ? `${b} from chapter ${p.chapter}, ${p.per} ${p.per > 1 ? 'chapters' : 'chapter'} each time${p.cont ? ', then on to the next book' : `, ${total} ${total > 1 ? 'times' : 'time'} in all`}`
      : `从${b}第${p.chapter}章开始，每次${p.per}章${p.cont ? '，读完接着读下一卷' : `，共${total}次读完`}`;
  }
  if (g.kind === 'pray') return en ? 'The day’s Breathe each time' : '每次一起读当天的呼吸';
  if (g.kind === 'feed') return en ? `One lesson each time, from lesson ${p.lesson || 1}` : `从第${p.lesson || 1}课开始，每次一课`;
  return en
    ? `Life-study of ${bookName(p.book, 'en')} from message ${p.msg || 1}, ${p.per || 1} each time`
    : `${bookName(p.book, 'zh')}生命读经，从第${p.msg || 1}篇开始，每次${p.per || 1}篇`;
}
// "10月14日（周二）20:00 北京时间" / "Tue, Oct 14, 20:00 Beijing time"
export function sessionLabel(g, s, lang = 'zh') {
  const [, m, d] = s.date.split('-').map(Number);
  const wd = weekday(s.date);
  return lang === 'en'
    ? `${WEEK.en[wd]}, ${MONTHS[m - 1]} ${d}, ${g.time} ${tzLabel(g.tz, 'en')}`
    : `${m}月${d}日（周${WEEK.zh[wd]}）${g.time} ${tzLabel(g.tz, 'zh')}`;
}

// ---------- calendar files ----------
const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
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
export const icsJoin = (lines) => lines.map(fold).join('\r\n') + '\r\n';

// One VEVENT per session (exact UTC times), with an alert when it starts.
// events: [{ uid, start, end, title, description, url }]
export function icsFeed(name, events, now) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zion4life.faith//dazi//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`, 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  const stamp = icsTime(now);
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@zion4life.faith`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`,
      `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description)}`, `URL:${e.url}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:PT0S', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return icsJoin(lines);
}

// VTIMEZONE for tz, built from the offsets the runtime knows, covering [fromYear, toYear].
export function vtimezone(tz, fromYear, toYear) {
  const fmtOff = (min) => `${min < 0 ? '-' : '+'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}${String(Math.abs(min) % 60).padStart(2, '0')}`;
  const localStamp = (ms, off) => new Date(ms + off * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  const start = Date.UTC(fromYear, 0, 1), end = Date.UTC(toYear + 1, 0, 1);
  const transitions = [];
  let prev = tzOffset(tz, start);
  for (let t = start + 6 * 3600000; t <= end; t += 6 * 3600000) {
    const o = tzOffset(tz, t);
    if (o !== prev) {
      let lo = t - 6 * 3600000, hi = t;
      while (hi - lo > 60000) {
        const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
        if (tzOffset(tz, mid) === prev) lo = mid; else hi = mid;
      }
      transitions.push({ at: hi, from: prev, to: o });
      prev = o;
    }
  }
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
  if (!transitions.length) {
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${fmtOff(prev)}`, `TZOFFSETTO:${fmtOff(prev)}`, 'END:STANDARD');
  } else {
    const offs = transitions.map((x) => x.to);
    const hiOff = Math.max(...offs), loOff = Math.min(...offs);
    for (const type of ['DAYLIGHT', 'STANDARD']) {
      const list = transitions.filter((x) => (type === 'DAYLIGHT' ? x.to === hiOff && hiOff !== loOff : x.to === loOff || hiOff === loOff));
      if (!list.length) continue;
      const [firstT, ...rest] = list;
      lines.push(`BEGIN:${type}`, `DTSTART:${localStamp(firstT.at, firstT.from)}`, `TZOFFSETFROM:${fmtOff(firstT.from)}`, `TZOFFSETTO:${fmtOff(firstT.to)}`);
      if (rest.length) lines.push(`RDATE:${rest.map((x) => localStamp(x.at, x.from)).join(',')}`);
      lines.push(`END:${type}`);
    }
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

// A calendar invitation for one member: a weekly repeating event in the group's own time
// zone (so calendars keep the right local time across daylight saving), with an alert at
// the start. Email clients (Gmail, Outlook, Apple Mail) offer to add it to the calendar.
export function icsInvite(g, { title, description, url, organizer, attendee, method = 'REQUEST' }, now, ctx = {}) {
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const first = session(g, 1);
  const total = totalSessions(g, ctx);
  const [y] = g.startDate.split('-').map(Number);
  const yearsAhead = total ? Math.ceil((total / g.days.length) / 52) + 1 : 3;
  const local = `${first.date.replace(/-/g, '')}T${g.time.replace(':', '')}00`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zion4life.faith//dazi//ZH', 'CALSCALE:GREGORIAN', `METHOD:${method}`,
    ...vtimezone(g.tz, y - 1, y + yearsAhead),
    'BEGIN:VEVENT', `UID:dazi-${g.id}@zion4life.faith`, 'SEQUENCE:0', `DTSTAMP:${icsTime(now)}`, `DTSTART;TZID=${g.tz}:${local}`,
    `DURATION:PT${g.minutes}M`, `RRULE:FREQ=WEEKLY;BYDAY=${[...g.days].sort().map((d) => BY[d]).join(',')}${total ? `;COUNT=${total}` : ''}`,
    `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(description)}`, `URL:${url}`,
    ...(organizer ? [`ORGANIZER;CN=${icsText(organizer.name)}:mailto:${organizer.email}`] : []),
    ...(attendee ? [`ATTENDEE;CN=${icsText(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendee.email}`] : []),
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0S', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'];
  return icsJoin(lines);
}
