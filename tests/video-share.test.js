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
test('swiping updates native share metadata to the new video, including language and canonical URL', async()=>{
 const element=()=>({hidden:true,textContent:'',value:0,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},addEventListener(){},querySelector(){return element();}});
 const nodes=new Map();
 const reels=['first','second'].map((slug,i)=>{
  const video={...element(),paused:true,muted:false,dataset:{src:`/video/${slug}.mp4`},hasAttribute(k){return !!this[k];},removeAttribute(k){delete this[k];},load(){},pause(){this.paused=true;},async play(){this.paused=false;}};
  const children=new Map();return {...element(),dataset:{reel:slug,shareDescription:`Summary ${i}`,shareImage:`/video/${slug}.jpg`},getAttribute(){return `Title ${i}`;},querySelector(s){if(s==='video')return video;if(!children.has(s))children.set(s,element());return children.get(s);}};
 });
 const feed={querySelectorAll:()=>reels};let observe;
 const document={documentElement:{lang:'en'},hidden:false,querySelector(s){if(s==='[data-reels]')return feed;if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},querySelectorAll:()=>[],addEventListener(){}};
 const context={document,location:{origin:'https://zion4life.faith'},history:{replaceState(){}},matchMedia:()=>({matches:false}),IntersectionObserver:class{constructor(cb){observe=cb;}observe(){}},window:{addEventListener(){}},setTimeout(){},URL};
 vm.runInNewContext(fs.readFileSync('static/js/reels.js','utf8'),context);
 observe([{isIntersecting:true,intersectionRatio:1,target:reels[1]}]);
 await Promise.resolve();
 assert.equal(nodes.get('meta[property="og:title"]').content,'Title 1');
 assert.equal(nodes.get('meta[property="og:description"]').content,'Summary 1');
 assert.equal(nodes.get('meta[property="og:image"]').content,'https://zion4life.faith/video/second.jpg');
 assert.equal(nodes.get('link[rel="canonical"]').href,'https://zion4life.faith/en/v/second/');
});
