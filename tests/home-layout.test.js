import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
before(()=>execFileSync('node',['build.mjs']));
test('approved home card includes each of the 16 tags once in both languages',()=>{
 const tags=JSON.parse(fs.readFileSync('content/tags.json'));
 for(const pre of ['', 'en/']){
  const html=fs.readFileSync(`dist/${pre}index.html`,'utf8');
  assert.equal((html.match(/data-home-path=/g)||[]).length,1);
  const ids=[...html.matchAll(/data-home-tag="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,16);assert.deepEqual(ids.slice().sort(),tags.map(t=>t.id).sort());
 }
});
test('every published static video has an applause button outside native player',()=>{
 const videos=JSON.parse(fs.readFileSync('content/videos.json')).filter(v=>!v.sample);
 for(const pre of ['', 'en/'])for(const v of videos){
  const html=fs.readFileSync(`dist/${pre}v/${v.slug}/index.html`,'utf8');
  assert.ok(html.includes(`data-video-like="v:${v.slug}"`));
  assert.ok(!html.includes(`data-video-like="v:${v.slug}" aria-pressed=`));
 }
});
