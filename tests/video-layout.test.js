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
test('video tag is a static complete library while details retain portrait reactions',()=>{
 const h=fs.readFileSync('dist/v/o-glorious-divine-love/details/index.html','utf8');
 assert.match(h,/<\/div><\/div><div class="video-reactions">/);
 const films=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const pre of ['', 'en/']){
  const h=fs.readFileSync(`dist/${pre}t/video/index.html`,'utf8');
  assert.ok(!h.includes('data-reels'));
  assert.ok(!h.includes('class="reels-page"'));
  assert.ok(!h.includes('/js/reels.js?v='));
  assert.ok(h.includes('video-library-list'));
  for(const v of films) assert.ok(h.includes(`/v/${v.slug}/`));
 }
});

test('every video entry opens the selected film in the same horizontal feed',()=>{
 const films=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const pre of ['', 'en/']) for(const film of films){
  const h=fs.readFileSync(`dist/${pre}v/${film.slug}/index.html`,'utf8');
  assert.ok(h.includes('class="reels-page"'));
  assert.ok(!h.includes('reel-byline'));
  assert.ok(!h.includes('short-byline'));
  assert.equal(h.match(/data-reel="([^"]+)"/)[1],film.slug);
  assert.equal((h.match(/data-reel="/g)||[]).length,films.length);
  assert.ok(h.includes(`/v/${film.slug}/details/#reel-comments`));
  assert.ok(!h.includes('playsinline loop'));
  const detail=fs.readFileSync(`dist/${pre}v/${film.slug}/details/index.html`,'utf8');
  assert.ok(detail.includes(`data-talk="v:${film.slug}"`));
 }
 const css=fs.readFileSync('static/css/reels.css','utf8');
 assert.ok(css.includes('scroll-snap-type:x mandatory'));
 assert.ok(css.includes('touch-action:pan-x'));
 const js=fs.readFileSync('static/js/reels.js','utf8');
 assert.ok(js.includes('muted = false'));
 assert.ok(js.includes("error.name === 'NotAllowedError'"));
 assert.ok(js.includes("video.dataset.autoplayMuted = '1'"));
 assert.ok(js.includes("active = index; manuallyPaused = false"));
});

test('new youth hymn has no subtitles and every feed has top navigation arrows',()=>{
 const films=JSON.parse(fs.readFileSync('content/videos.json'));
 const film=films.find(v=>v.slug==='southeast-youth-singing');
 assert.deepEqual(film.captionOptions,[]);
 assert.equal(film.defaultCaption,'off');
 assert.ok(!film.subtitles);
 for(const pre of ['', 'en/']){
  const h=fs.readFileSync(`dist/${pre}v/southeast-youth-singing/index.html`,'utf8');
  assert.ok(h.includes('class="reels-top-arrows"'));
  assert.equal(h.match(/data-reel="([^"]+)"/)[1],film.slug);
  const first=h.split('<video class="reel-video"')[1].split('</video>')[0];
  assert.ok(!first.includes('<track'));
 }
});

test('youth video appears under both songs and feelings',()=>{
 for(const pre of ['', 'en/'])for(const tag of ['songs','feelings']){
  const h=fs.readFileSync(`dist/${pre}t/${tag}/index.html`,'utf8');
  assert.ok(h.includes('/v/southeast-youth-singing/'));
 }
});
