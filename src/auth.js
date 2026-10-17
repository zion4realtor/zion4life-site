// Accounts without passwords: type your email, get a 6-digit code, type it in. The first time,
// you also pick a nickname and (optionally) identity tags. A signed-in phone keeps an
// HttpOnly cookie for a year; only the cookie's hash is stored.
import { json, fail, str, isEmail, randomId, randomToken, randomDigits, hash, readBody, rateOk, tr } from './util.js';
import { sendMail, mailReady, layout } from './mail.js';
import { publicUser } from './store.js';
import { validTimeZone } from './schedule.js';

const COOKIE = 'yg_s';
const YEAR = 365 * 86400000;
export const IDENTITIES = {
  seeker: ['慕道朋友', 'Seeker'], newfriend: ['新朋友', 'New friend'], student: ['学生', 'Student'], working: ['上班族', 'Working'],
  parent: ['家长', 'Parent'], brother: ['弟兄', 'Brother'], sister: ['姊妹', 'Sister'], serving: ['服事者', 'Serving'], teacher: ['教师', 'Teacher'],
};
// The phone's time zone, as the page reports it ('' when missing or unknown).
const cleanTz = (v) => { const tz = str(v, 64); return tz && validTimeZone(tz) ? tz : ''; };
const cleanIds = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => Object.hasOwn(IDENTITIES, x)))] : []);
export const cleanName = (v) => str(v, 20).replace(/[<>]/g, '');

function cookieValue(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)yg_s=([A-Za-z0-9_-]{20,64})/);
  return m ? m[1] : null;
}
function setCookie(url, token, maxAgeMs) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}
// Zion: light@zion4life.faith (his account, the platform's first) and his old Hotmail.
export const ADMIN_DEFAULT = 'light@zion4life.faith,zion.chen@hotmail.com';
export const adminEmails = (env) => String(env.ADMIN_EMAILS || ADMIN_DEFAULT).toLowerCase().split(/[,\s]+/).filter(Boolean);
export const isAdmin = (env, user) => !!user && adminEmails(env).includes(user.email);

// The country Cloudflare sees the request coming from ('CN', 'US' …; '' when unknown or Tor).
export const countryOf = (request) => {
  const c = request.cf && request.cf.country;
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'T1' && c !== 'XX' ? c : '';
};

// The signed-in account for this request, or null.
export async function currentUser(db, request) {
  const token = cookieValue(request);
  if (!token) return null;
  return db('sessionUser', { token: await hash(token), country: countryOf(request) });
}

// POST requests must come from this site's own pages.
export function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

// What the page needs to know about the signed-in person.
export async function meView(env, db, user) {
  if (!user) return { user: null };
  const tags = await db('mgrTags', { uid: user.id });
  const claims = await db('claimMine', { uid: user.id });
  return {
    user: { ...publicUser(user), ids: user.ids, idsPublic: user.idsPublic, lang: user.lang, emailLangAuto: user.emailLangAuto, email: maskEmail(user.email), cal: user.cal, tz: user.tz },
    admin: isAdmin(env, user),
    manages: tags,
    claims,
    unread: (await db('unread', { uid: user.id })).n,
  };
}
// a***@example.com, so the page can show which address is signed in without exposing it in full.
export const maskEmail = (e) => e.replace(/^(.)[^@]*(@.*)$/, (_, a, b) => `${a}***${b}`);

export async function handleAuth(request, env, db, url, now, lang) {
  const t = tr(lang);
  const p = url.pathname;

  if (p === '/api/me' && request.method === 'GET') {
    const user = await currentUser(db, request);
    return json({ ok: true, ...(await meView(env, db, user)), mail: mailReady(env) });
  }
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (!sameOrigin(request, url)) return fail('Forbidden', 403);
  const b = (await readBody(request, 20000)) || {};

  // Step 1: send a code to this email.
  if (p === '/api/auth/start') {
    const email = str(b.email, 120).toLowerCase();
    if (!isEmail(email)) return fail(t('邮箱好像不对，再看一下？', 'That email looks wrong. Check it again?'));
    if (b.website) return fail(t('内容不完整', 'Something is missing'));
    if (!mailReady(env) && !env.DEV_SHOW_CODE) {
      return fail(t('注册和登录还没开放：网站的发信还在设置中，过几天再来。', 'Sign-in is not open yet: the site’s email is still being set up. Please come back in a few days.'), 503);
    }
    const cool = env.DEV_SHOW_CODE ? 0 : 45000;
    const cooldown = (wait) => json({ ok: false, error: t(`刚刚发过了，${wait} 秒后可以再发一次。`, `A code was just sent. You can ask again in ${wait} seconds.`), retryAfter: wait }, 429, { 'Retry-After': String(wait) });
    const pending = await db('codeWait', { email, now, cool });
    if (pending.wait) return cooldown(pending.wait); // Repeated clicks must not consume today's send allowance.
    const lim = env.DEV_SHOW_CODE ? 1000 : 1; // local testing signs in over and over
    if (!(await rateOk(db, request, 'code', 12 * lim, now))) return fail(t('今天发的验证码太多了，明天再试。', 'Too many codes today. Please try again tomorrow.'), 429);
    if (!(await rateOk(db, request, 'code-email', 6 * lim, now, email))) return fail(t('这个邮箱今天收的验证码太多了，明天再试。', 'This email has had too many codes today. Please try again tomorrow.'), 429);
    const code = randomDigits(6);
    const codeHash = await hash(`${email}|${code}`);
    const r = await db('codePut', { email, hash: codeHash, expires: now + 15 * 60000, now, cool });
    if (!r.ok) return cooldown(r.wait);
    const existing = await db('userByEmail', { email });
    const L = existing?.lang || lang;
    const tt = tr(L);
    const { html, text } = layout({
      lang: L,
      title: tt('你的验证码', 'Your sign-in code'),
      big: code,
      lines: [tt('在网页上输入这 6 位数字就可以了，15 分钟内有效。', 'Type these 6 digits on the page. The code works for 15 minutes.'),
        tt('如果不是你本人在登录，不用理会这封邮件。', 'If you did not try to sign in, you can ignore this email.')],
    });
    let sent;
    try { sent = await sendMail(env, { to: email, subject: tt(`有光验证码 ${code}`, `Light sign-in code ${code}`), html, text }); }
    catch (_) { sent = { ok: false }; }
    if (!sent.ok && !env.DEV_SHOW_CODE) {
      await db('codeRestore', { email, expectedHash: codeHash, previous: r.previous });
      return fail(t('验证码没有发送成功，请重试；先前尚未过期的验证码仍可使用。', 'The code could not be sent. Please try again; an earlier unexpired code still works.'), 502);
    }
    return json({ ok: true, isNew: !existing, retryAfter: cool / 1000, ...(env.DEV_SHOW_CODE ? { devCode: code } : {}) });
  }

  // Step 2: check the code; create the account the first time; sign this phone in.
  if (p === '/api/auth/verify') {
    const email = str(b.email, 120).toLowerCase();
    const code = str(b.code, 12).replace(/\D/g, '');
    if (!isEmail(email) || code.length !== 6) return fail(t('请输入邮件里的 6 位数字。', 'Type the 6 digits from the email.'));
    if (!(await rateOk(db, request, 'verify', 40, now))) return fail(t('试的次数太多了，明天再试。', 'Too many tries. Please try again tomorrow.'), 429);
    let user = await db('userByEmail', { email });
    const name = cleanName(b.name);
    if (!user && !name) return fail(t('第一次来，请先起一个昵称。', 'First time here: pick a nickname first.'));
    const r = await db('codeCheck', { email, hash: await hash(`${email}|${code}`), now });
    if (!r.ok) {
      return fail({
        expired: t('验证码过期了，请重新获取。', 'The code has expired. Ask for a new one.'),
        tries: t('输错太多次了，请重新获取验证码。', 'Too many wrong tries. Ask for a new code.'),
        wrong: t('验证码不对，再看一下邮件？', 'That code is not right. Check the email again?'),
      }[r.reason]);
    }
    if (!user) {
      user = await db('userCreate', { id: randomId(10), email, name, ids: cleanIds(b.ids), idsPublic: !!b.idsPublic, lang: ['zh', 'en'].includes(b.deviceLang) ? b.deviceLang : lang, cal: randomToken(18), tz: cleanTz(b.tz), country: countryOf(request), now });
    } else {
      user = await db('userUpdate', { id: user.id, lang: user.emailLangAuto && ['zh', 'en'].includes(b.deviceLang) ? b.deviceLang : undefined, tz: cleanTz(b.tz) || undefined, country: countryOf(request), now });
    }
    const token = randomToken();
    await db('sessionPut', { token: await hash(token), uid: user.id, expires: now + YEAR, now });
    return json({ ok: true, ...(await meView(env, db, user)) }, 200, { 'Set-Cookie': setCookie(url, token, YEAR) });
  }

  if (p === '/api/auth/logout') {
    const token = cookieValue(request);
    if (token) await db('sessionDel', { token: await hash(token) });
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(url, 'x'.repeat(20), 0) });
  }

  // Profile: nickname, identity tags and whether others see them, email language, time zone.
  if (p === '/api/me') {
    const user = await currentUser(db, request);
    if (!user) return fail(t('请先登录', 'Please sign in first'), 401);
    const upd = { id: user.id };
    if (b.name !== undefined) {
      const name = cleanName(b.name);
      if (!name) return fail(t('昵称不能空着', 'The nickname cannot be empty'));
      upd.name = name;
    }
    if (b.ids !== undefined) upd.ids = cleanIds(b.ids);
    if (b.idsPublic !== undefined) upd.idsPublic = !!b.idsPublic;
    if (typeof b.emailLangAuto === 'boolean') upd.emailLangAuto = b.emailLangAuto;
    if (b.lang === 'zh' || b.lang === 'en') { upd.lang = b.lang; upd.emailLangAuto = false; }
    if ((upd.emailLangAuto ?? user.emailLangAuto) && ['zh', 'en'].includes(b.deviceLang)) upd.lang = b.deviceLang;
    if (cleanTz(b.tz)) upd.tz = cleanTz(b.tz);
    const u = await db('userUpdate', upd);
    return json({ ok: true, ...(await meView(env, db, u)) });
  }
  return null;
}
