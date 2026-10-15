// 搭子 schedules: when each session happens. Pure functions (the current time is always
// passed in), shared by the Worker and the tests.
//
// A group meets on some weekdays (`days`, 0 = Sunday) at `time` (HH:MM) for `minutes`,
// starting on `startDate`, all in the initiator's time zone `tz` (taken from the initiator's
// phone). Everyone else sees the times converted to their own phone's time zone.
// Session n (1, 2, 3 …) is the n-th meeting day on or after startDate. What a session reads
// depends on the kind (src/kinds.js).
import { KINDS, kindTotal, kindReading, kindPlanText, legAt } from './kinds.js';

export { KINDS };
const DAY = 86400000;
export const VENUES = {
  phone: { zh: '电话', en: 'Phone' },
  wechat: { zh: '微信', en: 'WeChat' },
  zoom: { zh: 'Zoom', en: 'Zoom' },
  whatsapp: { zh: 'WhatsApp', en: 'WhatsApp' },
  line: { zh: 'Line', en: 'Line' },
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
const WEEK = { zh: ['日', '一', '二', '三', '四', '五', '六'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A zone's everyday name when there is one, else its id ("America/Phoenix" → "America/Phoenix").
export const tzName = (tz, lang = 'zh') => (TZ_LABELS[tz] ? TZ_LABELS[tz][lang === 'en' ? 1 : 0] : String(tz).replace(/_/g, ' '));

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
  return kindTotal(g, ctx);
}
function baseSessionDate(g, n) {
  const week = firstWeek(g);
  const k = week.length;
  return addDays(week[(n - 1) % k], 7 * Math.floor((n - 1) / k));
}
function baseSession(g, n) {
  const date = baseSessionDate(g, n);
  const start = zonedTime(date, g.time, g.tz);
  return { n, date, start, end: start + g.minutes * 60000 };
}
// Schedule revisions start at a session number; historical sessions never move.
export function scheduleLegs(g) {
  const legs = [{ from: 1, startDate: g.startDate, days: g.days, time: g.time, minutes: g.minutes, tz: g.tz }, ...(g.schedules || [])];
  return [...new Map(legs.map((leg) => [leg.from, leg])).values()].sort((a, b) => a.from - b.from);
}
export function scheduleAt(g, n) {
  return scheduleLegs(g).filter((x) => x.from <= n).at(-1);
}
export function session(g, n) {
  const leg = scheduleAt(g, n);
  return { ...baseSession(leg, n - leg.from + 1), n };
}
export const sessionDate = (g, n) => session(g, n).date;
function baseStarted(g, ms) {
  const today = localDate(g.tz, ms), span = daysBetween(g.startDate, today);
  if (span < 0) return 0;
  const weeks = Math.floor((span + 1) / 7);
  let n = weeks * g.days.length;
  for (let i = weeks * 7; i <= span; i++) if (g.days.includes(weekday(addDays(g.startDate, i)))) n++;
  if (n > 0 && baseSession(g, n).start > ms) n--;
  return n;
}
export function startedCount(g, ms, ctx = {}) {
  const legs = scheduleLegs(g);
  let n = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (baseSession(leg, 1).start > ms) break;
    n = Math.max(n, Math.min(legs[i + 1] ? legs[i + 1].from - 1 : Infinity, leg.from - 1 + baseStarted(leg, ms)));
  }
  const total = totalSessions(g, ctx);
  return total ? Math.min(n, total) : n;
}
export function attendanceWeek(g, ms = Date.now()) {
  const leg = scheduleAt(g, startedCount(g, ms) + 1);
  const startDate = [leg.startDate, localDate(leg.tz, ms)].sort().at(-1);
  return firstWeek({ ...leg, startDate }).map((date) => zonedTime(date, leg.time, leg.tz));
}
// A missing preference means every group day, including days added later.
export function attendsSession(g, member, s) {
  return !Array.isArray(member?.attendanceDays) || member.attendanceDays.includes(weekday(localDate(member.attendanceTz || g.tz, s.start)));
}

// The session in progress (started and not yet ended), the latest started one, and the next one.
// Whether session n has something to read (not a gap between two plans).
export const planned = (g, n, ctx = {}) => n >= 1 && !!legAt(g, n, ctx);
export function sessionState(g, ms, ctx = {}) {
  const total = totalSessions(g, ctx);
  const n = startedCount(g, ms, ctx);
  let ln = n;
  while (ln > 0 && !planned(g, ln, ctx) && n - ln < 400) ln--;
  const last = planned(g, ln, ctx) ? session(g, ln) : null;
  let nn = n + 1;
  while ((!total || nn <= total) && !planned(g, nn, ctx) && nn - n < 400) nn++;
  const next = (!total || nn <= total) && planned(g, nn, ctx) ? session(g, nn) : null;
  return { total, done: n, current: last && last.n === n && ms < last.end ? last : null, last, next, finished: !!total && n >= total && !!last && ms >= last.end };
}
// Sessions with something to read, starting in [from, to).
export function sessionsBetween(g, from, to, ctx = {}) {
  const out = [];
  const total = totalSessions(g, ctx);
  for (let n = startedCount(g, from - 1, ctx) + 1, i = 0; (!total || n <= total) && i < 2000; n++, i++) {
    const s = session(g, n);
    if (s.start >= to) break;
    if (s.start >= from && planned(g, n, ctx)) out.push(s);
    if (out.length > 400) break;
  }
  return out;
}
// A check-in is on time until 3 hours after the session ends; later it is a make-up (补).
export const lateAfter = (s) => s.end + 3 * 3600000;

// ---------- what each session reads ----------
// ctx.feed: { [lesson]: { zh, en } } lesson titles.
export function readingFor(g, n, ctx = {}) {
  return kindReading(g, n, sessionDate(g, n), ctx);
}

// The starts of one week of sessions: from the one on now (or the next), else the first week.
// The pages turn these into "每周三、五 09:00" in the viewer's own time zone.
export function weekStarts(g, ms, ctx = {}) {
  const c = startedCount(g, ms, ctx);
  const k = scheduleAt(g, c + 1).days.length;
  const total = totalSessions(g, ctx);
  let n = c === 0 ? 1 : session(g, c).end <= ms ? c + 1 : c;
  if (total && n + k - 1 > total) n = Math.max(1, total - k + 1);
  const out = [];
  for (let i = n; i < n + k && (!total || i <= total); i++) out.push(session(g, i).start);
  return out;
}

// ---------- words ----------
export function daysText(days, lang = 'zh') {
  const d = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (d.length === 7) return lang === 'en' ? 'Every day' : '每天';
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return lang === 'en' ? 'Weekdays' : '每周一到周五';
  if (d.length === 6 && [1, 2, 3, 4, 5, 6].every((x) => d.includes(x))) return lang === 'en' ? 'Mon to Sat' : '每周一到周六';
  return lang === 'en' ? `Every ${d.map((x) => WEEK.en[x]).join(', ')}` : `每周${d.map((x) => WEEK.zh[x]).join('、')}`;
}
export function minutesText(min, lang = 'zh') {
  if (lang === 'en') return min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min / 60} hr`;
  if (min < 60) return `${min}分钟`;
  return min % 60 ? `${Math.floor(min / 60)}小时${min % 60}分钟` : `${min / 60}小时`;
}
// "每周二、四 20:00，每次30分钟（北京时间）" in time zone tz (the person's own, when known).
export function scheduleText(g, lang = 'zh', tz = g.tz, ms = Date.now(), ctx = {}) {
  const local = weekStarts(g, ms, ctx).map((t) => {
    const d = new Date(t + tzOffset(tz, t) * 60000);
    return { wd: d.getUTCDay(), clock: d.toISOString().slice(11, 16) };
  });
  const seen = new Set();
  const list = local.filter((x) => !seen.has(x.wd) && seen.add(x.wd)).sort((a, b) => ((a.wd + 6) % 7) - ((b.wd + 6) % 7));
  const clocks = new Set(list.map((x) => x.clock));
  const en = lang === 'en';
  const when = clocks.size <= 1
    ? `${daysText(list.map((x) => x.wd), lang)}${en ? ' at ' : ' '}${list[0]?.clock || g.time}`
    : en ? `Every ${list.map((x) => `${WEEK.en[x.wd]} ${x.clock}`).join(', ')}` : `每周${list.map((x) => `${WEEK.zh[x.wd]} ${x.clock}`).join('、')}`;
  const minutes = scheduleAt(g, startedCount(g, ms, ctx) + 1).minutes;
  return en ? `${when}, ${minutesText(minutes, 'en')} each (${tzName(tz, 'en')})` : `${when}，每次${minutesText(minutes, 'zh')}（${tzName(tz, 'zh')}）`;
}
// The plan in words, in the viewer's language.
// The plan in words; with n, the plan in effect at session n.
export function planText(g, lang = 'zh', ctx = {}, n) {
  return kindPlanText(g, lang, ctx, n);
}
// "10月14日（周二）20:00 北京时间" / "Tue, Oct 14, 20:00 Beijing time", in time zone tz.
export function sessionLabel(g, s, lang = 'zh', tz = g.tz) {
  const d = new Date(s.start + tzOffset(tz, s.start) * 60000);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate(), wd = d.getUTCDay(), clock = d.toISOString().slice(11, 16);
  return lang === 'en'
    ? `${WEEK.en[wd]}, ${MONTHS[m - 1]} ${day}, ${clock} ${tzName(tz, 'en')}`
    : `${m}月${day}日（周${WEEK.zh[wd]}）${clock} ${tzName(tz, 'zh')}`;
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
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@zion4life.faith`, `SEQUENCE:${e.sequence || 0}`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`,
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
export function icsInvite(g, { title, description, url, organizer, attendee, method = 'REQUEST', occurrences }, now, ctx = {}) {
  if (occurrences) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zion4life.faith//dazi//ZH', 'CALSCALE:GREGORIAN', `METHOD:${method}`];
    for (const s of occurrences) lines.push('BEGIN:VEVENT', `UID:dazi-${g.id}-${s.n}@zion4life.faith`, `SEQUENCE:${(g.schedules || []).length}`, `DTSTAMP:${icsTime(now)}`, `DTSTART:${icsTime(s.start)}`, `DTEND:${icsTime(s.end)}`, `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(description)}`, `URL:${url}`,
      ...(organizer ? [`ORGANIZER;CN=${icsText(organizer.name)}:mailto:${organizer.email}`] : []),
      ...(attendee ? [`ATTENDEE;CN=${icsText(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendee.email}`] : []),
      'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT');
    lines.push('END:VCALENDAR');
    return icsJoin(lines);
  }
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
