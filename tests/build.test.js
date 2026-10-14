// node --test: the Markdown converter, and that the built site has what shared links need, in both languages.
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

test('build output: both languages, tags, tiles fill whole rows', () => {
  execFileSync('node', ['build.mjs'], { cwd: ROOT });
  const pages = ['index.html', 'en/index.html', 'huxi/index.html', 'en/huxi/index.html', 'me/index.html', 'en/me/index.html',
    'dazi/index.html', 'en/dazi/index.html', 'dazi/new/index.html', 'en/dazi/new/index.html', 'g/index.html', 'en/g/index.html',
    'x/index.html', 'en/x/index.html', 'write/index.html', 'admin/index.html', 't/mystery/index.html',
    'data/tags.json', 'data/items.json', 'data/bible.json', 'data/feed.json', 'data/feed/1.json', 'data/huxi.json',
    'en/t/mystery/index.html', 'a/rensheng-aomi/index.html', 'en/a/rensheng-aomi/index.html', 'v/fule-rensheng/index.html', '404.html', 'sitemap.xml'];
  for (const p of pages) assert.ok(fs.existsSync(path.join(ROOT, 'dist', p)), p);
  for (const p of ['index.html', 'en/index.html']) {
    const html = dist(p);
    let cells = 0;
    for (const m of html.matchAll(/<a class="(tile[^"]*)"/g)) cells += /\bbig\b/.test(m[1]) ? 4 : /\bw2\b/.test(m[1]) ? 2 : 1;
    assert.equal(cells % 3, 0, `${p}: tiles leave a gap in the last row`);
    assert.match(html, /data-ask/, 'question box');
  }
  assert.match(dist('en/index.html'), /<html lang="en">/);
  assert.match(dist('en/a/rensheng-aomi/index.html'), /The Mystery of Life/);
  // /huxi/ shows the newest day for everyone, with no clock check in the page
  const newest = JSON.parse(dist('data/huxi.json'))[0];
  assert.match(dist('huxi/index.html'), new RegExp(`<article class="hx" data-huxi-today data-date="${newest.date}"`));
  assert.match(dist('index.html'), new RegExp(`data-huxi-today data-date="${newest.date}"`));
  assert.doesNotMatch(dist('huxi/index.html'), /id="huxi-data"/);
  // the link preview says the date and 活力排祷告负担; the page can go on the home screen as an app
  assert.match(dist('huxi/index.html'), new RegExp(`<meta property="og:title" content="\\d{4}年\\d{1,2}月\\d{1,2}日 活力排祷告负担">`));
  assert.match(dist('huxi/index.html'), /<link rel="manifest" href="\/huxi\/app.webmanifest">/);
  assert.match(dist('huxi/index.html'), /data-a2hs[^]*data-os="ios"[^]*data-os="android"/);
  const app = JSON.parse(dist('en/huxi/app.webmanifest'));
  assert.equal(app.start_url, '/en/huxi/');
  assert.equal(app.display, 'standalone');
  // 留言 on tag, article and video pages; the post shell has its marker; the plaza has no title on top
  assert.match(dist('t/lgh/index.html'), /data-talk="tag:lgh"/);
  assert.match(dist('t/lgh/index.html'), /data-tag-tools="lgh" data-person/);
  assert.match(dist('a/rensheng-aomi/index.html'), /data-talk="a:rensheng-aomi"/);
  assert.match(dist('x/index.html'), /<!--POST-->/);
  assert.doesNotMatch(dist('dazi/index.html'), /class="banner"/);
  assert.match(dist('en/dazi/new/index.html'), /Meal buddies/);
  const items = JSON.parse(dist('data/items.json'));
  assert.ok(items.some((i) => i.key === 'a:rensheng-aomi' && i.tags.includes('mystery')));
  // Nothing may load from Google or public CDNs: those are blocked or slow in mainland China.
  for (const f of ['index.html', 'en/index.html', 'huxi/index.html', 'dazi/index.html', 'g/index.html', 'a/rensheng-aomi/index.html']) {
    assert.doesNotMatch(dist(f), /googleapis|gstatic|jsdelivr|unpkg|cdnjs|google-analytics|googletagmanager/, f);
  }
  // Old addresses keep working.
  const redirects = dist('_redirects');
  for (const from of ['/read/:slug/', '/pray/', '/square/', '/watch/:slug/']) assert.ok(redirects.includes(from), from);
});
