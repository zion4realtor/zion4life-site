// Small helpers shared by the API modules.
export const SITE = 'https://zion4life.faith';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
export const fail = (error, status = 400) => json({ ok: false, error }, status);

// Trimmed string of at most `max` characters, or '' when not a string.
export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const isEmail = (s) => typeof s === 'string' && s.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s);

export function randomId(n) {
  const out = [];
  while (out.length < n) {
    for (const x of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (x < 248 && out.length < n) out.push(ALPHA[x % 31]);
    }
  }
  return out.join('');
}
export function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomDigits(n) {
  const out = [];
  while (out.length < n) {
    for (const x of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (x < 250 && out.length < n) out.push(String(x % 10));
    }
  }
  return out.join('');
}
export async function hash(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}

export async function readBody(request, max = 200_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) return null;
  const text = await request.text();
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export const ipOf = (request) => request.headers.get('cf-connecting-ip') || 'local';
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// Count an action per visitor (hashed IP) per day; false once perDay is reached.
export async function rateOk(db, request, kind, perDay, now, extra = '') {
  const day = dayOf(now);
  const who = (await hash(`${ipOf(request)}|${extra}|${day}|youguang`)).slice(0, 24);
  return (await db('bump', { day, who, kind, perDay })).ok;
}

// The language the visitor reads the site in (the page sends X-Lang).
export const langOf = (request) => (request.headers.get('x-lang') === 'en' ? 'en' : 'zh');
// t('中文', 'English') in the visitor's language.
export const tr = (lang) => (zh, en) => (lang === 'en' ? en : zh);
// Path prefix for a language: Chinese pages at the root, English under /en.
export const pre = (lang) => (lang === 'en' ? '/en' : '');
