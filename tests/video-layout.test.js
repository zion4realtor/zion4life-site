import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
before(()=>execFileSync('node',['build.mjs']));
test('home shortcuts precede featured videos in both languages',()=>{
 for(const pre of ['', 'en/']){
  const h=fs.readFileSync(`dist/${pre}index.html`,'utf8');
  assert.ok(h.indexOf('data-home-fresh="community"')<h.indexOf('data-home-fresh="videos"'));
 }
});
test('removed layout samples have no pages, tag links or search entries',()=>{
 const removed=['cong-nali-lai','diyici-chifan','jianzheng-xuesheng-1','jianzheng-geren-1'];
 const items=fs.readFileSync('dist/data/items.json','utf8');
 for(const slug of removed){
  assert.ok(!items.includes(slug));
  for(const pre of ['', 'en/'])for(const type of ['a','v'])assert.equal(fs.existsSync(`dist/${pre}${type}/${slug}/index.html`),false);
 }
 for(const tag of JSON.parse(fs.readFileSync('content/tags.json'))){
  for(const pre of ['', 'en/']){
   const h=fs.readFileSync(`dist/${pre}t/${tag.id}/index.html`,'utf8');
   assert.ok(!h.includes('class="tag-s"'));
   for(const slug of removed)assert.ok(!h.includes(slug));
  }
 }
});
test('portrait reactions follow the complete stage, and video library has drawn banner',()=>{
 const h=fs.readFileSync('dist/v/o-glorious-divine-love/index.html','utf8');
 assert.match(h,/<\/div><\/div><div class="video-reactions">/);
 for(const pre of ['', 'en/']){
  const h=fs.readFileSync(`dist/${pre}t/video/index.html`,'utf8');
  assert.ok(h.includes('video-library-banner.svg'));
 }
});
