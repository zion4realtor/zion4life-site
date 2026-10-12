// node --test: checks the Markdown converter and that the built site has what the shared links need.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { md } = await import('../build.mjs');
const dist = (p) => fs.readFileSync(path.join(ROOT, 'dist', p), 'utf8');

test('markdown: verse with source line, lists, Chinese line joins', () => {
  const h = md('> 第一行\n> —— 约翰福音 3:16\n\n- 甲\n- 乙\n\n第一句\n第二句');
  assert.match(h, /<blockquote class="verse"><p>第一行<\/p><cite>约翰福音 3:16<\/cite><\/blockquote>/);
  assert.match(h, /<ul><li>甲<\/li><li>乙<\/li><\/ul>/);
  assert.match(h, /<p>第一句第二句<\/p>/);
});

test('build output', () => {
  execFileSync('node', ['build.mjs'], { cwd: ROOT });
  for (const p of ['index.html', 'read/index.html', 'pray/index.html', 'watch/index.html', 'groups/index.html', '404.html', 'sitemap.xml']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist', p)), p);
  }
  const pray = dist('pray/index.html');
  assert.match(pray, /id="pray-data"/, 'today data for the daily link');
  // Nothing may load from Google or public CDNs: those are blocked or slow in mainland China.
  for (const f of ['index.html', 'pray/index.html']) {
    assert.doesNotMatch(dist(f), /googleapis|gstatic|jsdelivr|unpkg|cdnjs|google-analytics|googletagmanager/, f);
  }
});
