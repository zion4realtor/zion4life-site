// 呼吸 recordings ("读给我听").
// build.mjs writes /data/huxi/<date>.speech.json: each language's text in pieces of a
// paragraph or so, Bible references written out to be read aloud, and a hash of the text.
// The cron records new or changed days with Workers AI (MeloTTS, binding AI), a few pieces
// each run, into the Durable Object; only the latest 30 days are kept. Pages fetch
//   /api/audio/huxi/<date>/<lang>.json              { ready, parts: [urls] }
//   /api/audio/huxi/<date>/<lang>/<hash>/<i>.mp3    one piece (with Range support for Safari)
// and play the pieces one after another.
import { json, fail } from './util.js';

const MODEL = '@cf/myshell-ai/melotts';
const KEEP_DAYS = 30;
const PER_RUN = 4; // pieces recorded per cron run (every 5 minutes)

const keyOf = (date, lang) => `a:huxi/${date}/${lang}`;
const chinaDate = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function asset(env, url, p) {
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(p, url)));
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function handleAudio(request, env, db, url) {
  if (request.method !== 'GET') return fail('Not found', 404);
  let m;
  if ((m = url.pathname.match(/^\/api\/audio\/huxi\/(\d{4}-\d{2}-\d{2})\/(zh|en)\.json$/))) {
    const a = await db('audioGet', { key: keyOf(m[1], m[2]) });
    const ready = !!a && a.done >= a.parts && a.parts > 0;
    const h = a ? a.hash.slice(0, 10) : '';
    return json({
      ok: true, ready, done: a?.done || 0, total: a?.parts || 0,
      parts: ready ? Array.from({ length: a.parts }, (_, i) => `/api/audio/huxi/${m[1]}/${m[2]}/${h}/${i}.mp3`) : [],
    }, 200, { 'Cache-Control': 'no-store' });
  }
  if ((m = url.pathname.match(/^\/api\/audio\/huxi\/(\d{4}-\d{2}-\d{2})\/(zh|en)\/([0-9a-f]{10})\/(\d{1,3})\.mp3$/))) {
    const key = keyOf(m[1], m[2]);
    const a = await db('audioGet', { key });
    if (!a || a.hash.slice(0, 10) !== m[3]) return fail('Not found', 404);
    const r = await db.get(`${key}/${Number(m[4])}`);
    if (!r) return fail('Not found', 404);
    const buf = new Uint8Array(await r.arrayBuffer());
    const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' };
    const range = (request.headers.get('range') || '').match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : buf.length - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : buf.length - 1;
      start = Math.max(0, start);
      end = Math.min(end, buf.length - 1);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.length}` } });
      return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...head, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(buf, { headers: { ...head, 'Content-Length': String(buf.length) } });
  }
  return fail('Not found', 404);
}

// One cron run: record a few pieces of the latest days, and drop recordings older than 30 days.
export async function makeAudio(env, db, url, now = Date.now()) {
  if (!env.AI) return null;
  const days = (await asset(env, url, '/data/huxi.json')) || [];
  const today = chinaDate(now);
  let budget = PER_RUN;
  let made = 0;
  for (const d of days.filter((x) => x.date <= addDays(today, 1)).slice(0, 3)) {
    const speech = await asset(env, url, `/data/huxi/${d.date}.speech.json`);
    if (!speech) continue;
    for (const lang of ['zh', 'en']) {
      const s = speech[lang];
      if (!s || !s.chunks.length) continue;
      const key = keyOf(d.date, lang);
      let a = await db('audioGet', { key });
      if (!a || a.hash !== s.hash) {
        await db('audioStart', { key, hash: s.hash, parts: s.chunks.length, now });
        a = { done: 0, parts: s.chunks.length, tries: 0 };
      }
      while (a.done < a.parts && budget > 0 && a.tries < 6) {
        try {
          const bytes = await speak(env, s.chunks[a.done].t, lang);
          await db.put(`${key}/${a.done}`, bytes);
          await db('audioPart', { key, done: a.done + 1, bytes: bytes.length, now });
          a.done++;
          made++;
        } catch (e) {
          console.error('[audio]', key, a.done, e?.message || e);
          await db('audioFail', { key, now });
          a.tries = 99;
        }
        budget--;
      }
    }
  }
  const oldest = addDays(today, -KEEP_DAYS);
  for (const a of await db('audioList', { prefix: 'a:huxi/' })) {
    if (a.key.slice(7, 17) < oldest) await db('audioDrop', { key: a.key });
  }
  return { made };
}

async function speak(env, text, lang) {
  const out = await env.AI.run(MODEL, { prompt: text, lang: lang === 'en' ? 'en' : 'zh' });
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Uint8Array) return out;
  const b64 = typeof out === 'string' ? out : out?.audio;
  if (!b64 || typeof b64 !== 'string') throw new Error('no audio in the reply');
  return fromBase64(b64);
}

// Base64 → bytes, with a lookup table (fast enough for a few hundred KB per piece).
const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => { B64[c.charCodeAt(0)] = i; });
export function fromBase64(s) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s);
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    out[o++] = n >> 16;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
