// 呼吸 recordings ("读给我听").
// build.mjs writes /data/huxi/<date>.speech.json: each language's text in pieces of a
// paragraph or so, Bible references written out to be read aloud, and a hash of the text.
// The cron records new or changed days with Workers AI (MeloTTS, binding AI), a few pieces
// each run, into the Durable Object; only the latest 30 days are kept. Pages fetch
//   /api/audio/huxi/<date>/<lang>.json              { ready, parts: [urls] }
//   /api/audio/huxi/<date>/<lang>/<hash>/<i>.wav    one piece (with Range support for Safari)
// and play the pieces one after another. MeloTTS gives 44.1 kHz WAV; the Durable Object
// keeps it as 16 kHz μ-law WAV (src/wav.js). Deepgram Aura voices give MP3, kept as is.
// Voice samples for choosing a voice: /api/audio/voices.json and /api/audio/voices/<id>.
import { json, fail, hash } from './util.js';

const MODEL = '@cf/myshell-ai/melotts';
const EN_AURA2_FROM = '2026-10-15';
const LEGACY_EN_VOICE = { model: MODEL };
// The voice each language is read in: { model, speaker } (speaker for Deepgram Aura only).
export const VOICE = {
  zh: { model: MODEL },
  en: { model: '@cf/deepgram/aura-2-en', speaker: 'helena' },
};
// Voices to try (each recorded once, on first listen, from the same few lines).
const SAMPLE = 'Recovery is revival. We must take the initiative to gain this revival, and it must reach everyone in the church. Satan’s scheme is to keep us from gaining it.';
export const VOICES = [
  { id: 'melo', model: MODEL, label: 'MeloTTS (now)' },
  ...['helena', 'harmonia', 'cora', 'athena', 'luna', 'thalia'].map((s) => ({ id: `a2-${s}`, model: '@cf/deepgram/aura-2-en', speaker: s, label: `Aura 2 · ${s}` })),
  ...['asteria', 'luna', 'stella'].map((s) => ({ id: `a1-${s}`, model: '@cf/deepgram/aura-1', speaker: s, label: `Aura 1 · ${s}` })),
];

// Bytes as an audio response, with Range support (Safari asks for ranges).
function audioResponse(request, buf, cache) {
  const type = buf[0] === 0x52 && buf[1] === 0x49 ? 'audio/wav' : 'audio/mpeg';
  const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache };
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
const KEEP_DAYS = 30;
const PER_RUN = 8; // pieces recorded per cron run (every 5 minutes; each takes a few seconds)

const keyOf = (date, lang, kind = 'huxi') => `a:${kind}/${date}/${lang}`;
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
  if ((m = url.pathname.match(/^\/api\/audio\/(?:huxi|diguan)\/(\d{4}-\d{2}-\d{2})\/(zh|en)\.json$/))) {
    const a = await db('audioGet', { key: keyOf(m[1], m[2], url.pathname.split('/')[3]) });
    const ready = !!a && a.done >= a.parts && a.parts > 0;
    const h = a ? a.hash.slice(0, 10) : '';
    return json({
      ok: true, ready, done: a?.done || 0, total: a?.parts || 0,
      parts: ready ? Array.from({ length: a.parts }, (_, i) => `/api/audio/${url.pathname.split('/')[3]}/${m[1]}/${m[2]}/${h}/${i}.wav`) : [],
    }, 200, { 'Cache-Control': 'no-store' });
  }
  if ((m = url.pathname.match(/^\/api\/audio\/(?:huxi|diguan)\/(\d{4}-\d{2}-\d{2})\/(zh|en)\/([0-9a-f]{10})\/(\d{1,3})\.wav$/))) {
    const key = keyOf(m[1], m[2], url.pathname.split('/')[3]);
    const a = await db('audioGet', { key });
    if (!a || a.hash.slice(0, 10) !== m[3]) return fail('Not found', 404);
    const r = await db.get(`${key}/${Number(m[4])}`);
    if (!r) return fail('Not found', 404);
    return audioResponse(request, new Uint8Array(await r.arrayBuffer()), 'public, max-age=31536000, immutable');
  }
  if (url.pathname === '/api/audio/voices.json') {
    return json({ ok: true, text: SAMPLE, voices: VOICES.map((v) => ({ id: v.id, label: v.label, url: `/api/audio/voices/${v.id}` })) });
  }
  if ((m = url.pathname.match(/^\/api\/audio\/voices\/([a-z0-9-]{3,20})$/))) {
    const v = VOICES.find((x) => x.id === m[1]);
    if (!v) return fail('Not found', 404);
    let r = await db.get(`v:${v.id}`);
    if (!r) {
      if (!env.AI) return fail('No voices here', 404);
      const out = await speak(env, SAMPLE, 'en', v);
      await db.put(`v:${v.id}`, out, typeof out === 'string' ? 'b64' : 'raw');
      r = await db.get(`v:${v.id}`);
    }
    return audioResponse(request, new Uint8Array(await r.arrayBuffer()), 'public, max-age=86400');
  }
  return fail('Not found', 404);
}

// One cron run: record a few pieces of the latest days, and drop recordings older than 30 days.
export async function makeAudio(env, db, url, now = Date.now()) {
  if (!env.AI) return null;
  const days = [];
  for (const kind of ['huxi', 'diguan']) {
    const list = (await asset(env, url, `/data/${kind}.json`)) || [];
    days.push(...list.filter((x) => x.date <= addDays(chinaDate(now), 1)).slice(0, 3).map((d) => ({ ...d, kind })));
  }
  const today = chinaDate(now);
  let budget = PER_RUN;
  let made = 0;
  for (const d of days.filter((x) => x.date <= addDays(today, 1))) {
    const speech = await asset(env, url, `/data/${d.kind}/${d.date}.speech.json`);
    if (!speech) continue;
    for (const lang of ['zh', 'en']) {
      const s = speech[lang];
      if (!s || !s.chunks.length) continue;
      const key = keyOf(d.date, lang, d.kind);
      const v = lang === 'en' && d.date < EN_AURA2_FROM ? LEGACY_EN_VOICE : VOICE[lang];
      // the text and the voice together: either changing records the day again
      const h = await hash(`${s.hash}|${v.model}|${v.speaker || ''}`);
      let a = await db('audioGet', { key });
      if (!a || a.hash !== h) {
        await db('audioStart', { key, hash: h, parts: s.chunks.length, now });
        a = { done: 0, parts: s.chunks.length, tries: 0 };
      }
      while (a.done < a.parts && budget > 0 && a.tries < 6) {
        try {
          const out = await speak(env, s.chunks[a.done].t, lang, v);
          const saved = await db.put(`${key}/${a.done}`, out, typeof out === 'string' ? 'b64' : 'raw');
          await db('audioPart', { key, done: a.done + 1, bytes: saved.bytes || 0, now });
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
  for (const a of [...await db('audioList', { prefix: 'a:huxi/' }), ...await db('audioList', { prefix: 'a:diguan/' })]) {
    if (a.key.split('/')[1] < oldest) await db('audioDrop', { key: a.key });
  }
  return { made };
}

// The recording as bytes, or as the base64 text Workers AI sends (the Durable Object decodes it).
async function speak(env, text, lang, voice = VOICE[lang]) {
  const input = voice.model === MODEL ? { prompt: text, lang: lang === 'en' ? 'en' : 'zh' } : { text, speaker: voice.speaker, encoding: 'mp3' };
  const out = await env.AI.run(voice.model, input);
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof Uint8Array) return out;
  if (out instanceof Response) return new Uint8Array(await out.arrayBuffer());
  const b64 = typeof out === 'string' ? out : out?.audio;
  if (!b64 || typeof b64 !== 'string') throw new Error('no audio in the reply');
  return b64;
}
