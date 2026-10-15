import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAudio, handleAudio } from '../src/audio.js';

test('October 16 drip pages pair images and language-specific narration; older pages have no player', async () => {
  for (const lang of ['zh', 'en']) {
    const prefix = lang === 'en' ? 'en/' : '';
    const html = fs.readFileSync(`dist/${prefix}a/diguan-muyang-2026-10-16/index.html`, 'utf8');
    assert.ok(html.indexOf('data-audio ') < html.indexOf('<img src="/files/drip-'));
    assert.ok(html.includes(`drip-shepherding-2026-10-16-${lang}.jpg`));
    assert.ok(html.includes('data-audio-kind="diguan"'));
    assert.ok(html.includes('data-sub="tag:breathe"'));
    assert.ok(html.includes('data-talk="a:diguan-muyang-2026-10-16"'));
    assert.ok(html.includes(`${prefix ? '' : '/en'}/a/diguan-muyang-2026-10-16/`));
    assert.ok(!fs.readFileSync(`dist/${prefix}a/diguan-muyang-2026-10-14/index.html`, 'utf8').includes('data-audio '));
  }
  const speech = JSON.parse(fs.readFileSync('dist/data/diguan/2026-10-16.speech.json'));
  assert.doesNotMatch(speech.zh.chunks.map((c) => c.t).join(''), /[a-z]/i);
  assert.match(speech.en.chunks.map((c) => c.t).join(''), /corporate warrior/);
  const rows = new Map(), blobs = new Map(), calls = [];
  const db = async (op, arg) => {
    if (op === 'audioGet') return rows.get(arg.key);
    if (op === 'audioStart') rows.set(arg.key, { ...arg, done: 0, tries: 0 });
    if (op === 'audioPart') rows.get(arg.key).done = arg.done;
    if (op === 'audioFail') throw new Error('Recording failed');
    if (op === 'audioList') return [];
  };
  db.put = async (key, data) => { blobs.set(key, data); return { bytes: data.length }; };
  db.get = async (key) => blobs.has(key) ? new Response(blobs.get(key)) : null;
  const env = {
    AI: { run: async (model, input) => { calls.push({ model, input }); return new Uint8Array([73, 68, 51, 4]); } },
    ASSETS: { fetch: async (req) => {
      const p = new URL(req.url).pathname;
      if (p === '/data/huxi.json') return Response.json([]);
      return new Response(fs.readFileSync('dist' + p));
    } },
  };
  const now = Date.parse('2026-10-16T12:00:00Z');
  for (let i = 0; i < 5; i++) await makeAudio(env, db, 'https://test.example', now);
  assert.ok(calls.some((c) => c.model === '@cf/deepgram/aura-2-en' && c.input.speaker === 'helena'));
  assert.ok(calls.filter((c) => c.input.lang === 'zh').every((c) => !/[a-z]/i.test(c.input.prompt)));
  assert.ok([...rows.keys()].every((key) => key.startsWith('a:diguan/')));
  for (const lang of ['zh', 'en']) {
    const url = new URL(`https://test.example/api/audio/diguan/2026-10-16/${lang}.json`);
    const manifest = await (await handleAudio(new Request(url), env, db, url)).json();
    assert.equal(manifest.ready, true);
    assert.ok(manifest.parts.every((p) => p.startsWith('/api/audio/diguan/')));
    const audioURL = new URL(manifest.parts[0], url);
    const result = await handleAudio(new Request(audioURL, { headers: { Range: 'bytes=0-1' } }), env, db, audioURL);
    assert.equal(result.status, 206);
    assert.equal((await result.arrayBuffer()).byteLength, 2);
  }
});
