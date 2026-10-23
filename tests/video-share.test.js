import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {esc} from '../src/md.js';
before(()=>execFileSync('node',['build.mjs']));
test('each video has its own server-rendered share title, summary and poster in both languages',()=>{
 const videos=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const lang of ['zh','en'])for(const v of videos)for(const suffix of ['','details/']){
  const html=fs.readFileSync(`dist/${lang==='en'?'en/':''}v/${v.slug}/${suffix}index.html`,'utf8');
  assert.ok(html.includes(`<meta name="description" content="${esc(v[lang].summary)}">`),`${lang} ${v.slug} ${suffix}`);
  assert.ok(html.includes(`<meta property="og:description" content="${esc(v[lang].summary)}">`));
  assert.ok(html.includes(`<meta name="twitter:description" content="${esc(v[lang].summary)}">`));
  assert.ok(html.includes(`<meta property="og:image" content="https://zion4life.faith${v.poster}">`));
  assert.ok(html.includes(`<link rel="image_src" href="https://zion4life.faith${v.poster}">`));
 }
});

test('every playback document owns one film and every share button points to that same film',()=>{
 const videos=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const lang of ['zh','en'])for(const v of videos){
  const pre=lang==='en'?'/en':'';
  const h=fs.readFileSync(`dist${pre}/v/${v.slug}/index.html`,'utf8');
  assert.equal((h.match(/data-reel="/g)||[]).length,1);
  assert.ok(h.includes(`data-reel="${v.slug}"`));
  assert.ok(h.includes(`data-share-url="https://zion4life.faith${pre}/v/${v.slug}/?share=v3-${v.slug}"`));
  assert.ok(h.includes(`data-src="${esc(v.sources.find(s=>s.type==='file').url)}"`));
 }
});
function player(previous,next){
 const handlers=new Map(), videoHandlers=new Map(),buttons=[];let navigation;
 const el=()=>({hidden:true,textContent:'',value:0,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},querySelector(){return el();},addEventListener(){}});
 const video={...el(),dataset:{src:'/video/own.mp4'},hasAttribute(k){return !!this[k];},removeAttribute(k){delete this[k];},load(){},pause(){},async play(){},addEventListener(k,fn){videoHandlers.set(k,fn);}};
 const children=new Map();
 const reel={...el(),dataset:{reel:'own'},querySelector(s){if(s==='video')return video;if(!children.has(s))children.set(s,el());return children.get(s);}};
 const feed={dataset:{previous,next,position:'1',total:'15'},querySelectorAll:()=>[reel],addEventListener(k,fn){handlers.set(k,fn);}};
 for(const delta of [-1,1])buttons.push({...el(),dataset:{reelStep:String(delta)},addEventListener(k,fn){this.click=fn;}});
 const doc={documentElement:{lang:'zh-CN'},hidden:false,querySelector:s=>s==='[data-reels]'?feed:el(),querySelectorAll:()=>buttons,addEventListener(){}};
 const context={document:doc,location:{assign(url){navigation=url;}},history:{replaceState(){throw new Error('Share identity must never be rewritten');}},matchMedia:()=>({matches:false}),IntersectionObserver:class{observe(){}},window:{addEventListener(){}},setTimeout(){}};
 vm.runInNewContext(fs.readFileSync('static/js/reels.js','utf8'),context);
 return {handlers,videoHandlers,buttons,get navigation(){return navigation;}};
}
test('all videos navigate to matching documents on arrows, swipes and completion without rewriting share identity',()=>{
 const films=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const pre of ['', '/en'])for(let i=0;i<films.length;i++){
  const url=j=>`${pre}/v/${films[(j+films.length)%films.length].slug}/?share=v3-${films[(j+films.length)%films.length].slug}`;
  const prev=url(i-1),next=url(i+1);
  for(const action of ['previous','next','left','right','ended']){
   const p=player(prev,next);
   if(action==='previous')p.buttons[0].click();
   if(action==='next')p.buttons[1].click();
   if(action==='ended')p.videoHandlers.get('ended')();
   if(action==='left'||action==='right'){
    p.handlers.get('touchstart')({touches:[{clientX:150,clientY:100}],target:{closest:()=>null}});
    p.handlers.get('touchend')({changedTouches:[{clientX:action==='left'?50:250,clientY:105}],preventDefault(){}});
   }
   assert.equal(p.navigation,action==='previous'||action==='right'?prev:next,`${pre} ${films[i].slug} ${action}`);
  }
 }
});

test('playback and detail captions default to the page language when that track exists',()=>{
 const videos=JSON.parse(fs.readFileSync('content/videos.json'));
 for(const lang of ['zh','en'])for(const v of videos){
  const pre=lang==='en'?'en/':'';
  const tracks=v.sources.find(source=>source.type==='file')?.subtitles||v.subtitles||[];
  const expected=tracks.some(track=>track.lang.split('-')[0]===lang)?lang:'off';
  const playback=fs.readFileSync(`dist/${pre}v/${v.slug}/index.html`,'utf8');
  const defaults=[...playback.matchAll(/<track\b[^>]*\bdefault[^>]*>/g)].map(match=>match[0]);
  assert.equal(defaults.length,expected==='off'?0:1,`${lang} ${v.slug}`);
  if(expected!=='off')assert.ok(defaults[0].includes(`srclang="${lang}"`));
  const detail=fs.readFileSync(`dist/${pre}v/${v.slug}/details/index.html`,'utf8');
  if(detail.includes('data-caption-choice='))assert.ok(detail.includes(`data-caption-choice="${expected}"`),`${lang} ${v.slug} detail`);
 }
});
