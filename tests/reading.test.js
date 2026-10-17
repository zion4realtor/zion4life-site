import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseReading,planDay,publicationDate,readingPage,selectVerse,englishVerse,readingApi,prepareReadings } from '../src/reading.js';
const sample = (book,chapter,body) => `<html><head><title>读经一年一遍第291天-${book}</title></head><body><div>大纲范围：十八至二十章</div><p><b>第${chapter}章</b>${body}</p><hr><p>not reading material</p></body></html>`;
const old = sample('耶利米书','十八',`<sup>1</sup>First reading text.<sup><a onclick="overlib('note')">1</a></sup><sup>6</sup>Selected reading text.</p><p><b>第十九章</b><sup>1</sup>Next chapter text.`);
const nextOld = sample('耶利米书','二十','<sup>1</sup>First text.<sup>9</sup>Selected text.</p><p><b>第二十一章</b><sup>1</sup>Next text.</p><p><b>第二十二章</b><sup>1</sup>Another text.');
const nextNew = `<html><head><title>读经一年一遍第291天-希伯来书</title></head><body><p><sup>15</sup>Reading text.<sup><a onclick="overlib('note', CAPTION,'来12:15注1')">1</a></sup><sup>22</sup>Selected text.<sup>24</sup>End text.</p><hr></body></html>`;
const english = '<p id="Heb12-22" class="verse"><b>22</b>Verified English verse.</p><p id="Heb12-14" class="verse"><b>14</b>Another verified verse.</p>';
test('daily parser uses verse boundaries, not outline headings or note markers',()=>{
 const o=parseReading(old);
 assert.deepEqual(o.ranges,[{chapter:18,firstVerse:1,lastVerse:6},{chapter:19,firstVerse:1,lastVerse:1}]);
 assert.equal(o.verses.length,3);assert.equal(selectVerse(o).verse,6);assert.equal(o.verses.some(v=>v.text.includes('overlib')),false);
 const n=parseReading(nextNew);assert.deepEqual(n.ranges,[{chapter:12,firstVerse:15,lastVerse:24}]);
 assert.equal(englishVerse(english,14),'Another verified verse.');
});
test('365-day plan handles leap day and invalid dates',()=>{assert.equal(planDay('2026-10-17'),290);assert.equal(planDay('2028-02-29'),59);assert.equal(planDay('2028-03-01'),60);assert.throws(()=>planDay('2026-02-30'));assert.throws(()=>planDay('anything'))});
function environment(){const blobs=new Map();const seed=JSON.parse(fs.readFileSync('content/reading/2026-10-17.json'));const stub={fetch:async(u,init={})=>{u=new URL(u);if(u.pathname==='/blob'){const k=u.searchParams.get('key');if(init.method==='PUT'){blobs.set(k,typeof init.body==='string'?new TextEncoder().encode(init.body):new Uint8Array(init.body));return Response.json({ok:true})}return blobs.has(k)?new Response(blobs.get(k)):new Response('Not found',{status:404})}throw Error('unexpected op')}};return {blobs,env:{STORE:{idFromName:()=>1,get:()=>stub},ASSETS:{fetch:async req=>req.url.endsWith('/data/reading/2026-10-17.json')?Response.json(seed):new Response('missing',{status:404})},AI:{run:async(model,input)=>{assert.equal(model,'@cf/deepgram/aura-2-en');assert.equal(input.speaker,'helena');assert.ok(input.text.length<500);return new Uint8Array([73,68,51,1,2,3])}}}}}
test('cron prepares metadata without new key-verse audio, preserving archived MP3 ranges',async()=>{
 const {env,blobs}=environment();delete env.AI;env.AI={run:async()=>{throw Error('No audio source in this metadata fixture')}};env.AI.run=async()=>{throw Error('Unrequested key-verse audio must not be regenerated')};const previous=JSON.parse(fs.readFileSync('content/reading/2026-10-17.json'));previous.nt.englishAudio={status:'ready',scope:'key-verses',hash:'existing'};blobs.set('reading:day:2026-10-17',new TextEncoder().encode(JSON.stringify(previous)));blobs.set('reading:audio:2026-10-17:nt:existing',new Uint8Array([73,68,51,1,2,3]));const actual=globalThis.fetch;
 globalThis.fetch=async url=>{const u=String(url);if(u.includes('ebible.org'))return new Response('unavailable',{status:503});if(u.includes('/o291.html'))return new Response(nextOld);if(u.includes('/n291.html'))return new Response(nextNew);if(u.includes('58_Hebrews_12'))return new Response(english);if(u.includes('24_Jeremiah_20'))return new Response('<p id="Jer20-9" class="verse"><b>9</b>Verified source words for an exact selected verse.</p>');throw Error('Unexpected network source')};
 // Mark the following dates as recently attempted, so the test only prepares day 291.
 blobs.set('reading:attempt:2026-10-19',new TextEncoder().encode(JSON.stringify({at:Date.UTC(2026,9,17,18)})));
 blobs.set('reading:attempt:2026-10-16',new TextEncoder().encode(JSON.stringify({at:Date.UTC(2026,9,17,18)})));
 try{const result=await prepareReadings(env,Date.UTC(2026,9,17,18));assert.equal(result.prepared,1);assert.equal(result.audios,0);const req=new Request('https://x/api/reading/2026-10-17/audio/nt.mp3',{headers:{Range:'bytes=0-2'}});const audio=await readingApi(req,env,new URL(req.url));assert.equal(audio.status,206);assert.equal(audio.headers.get('Content-Type'),'audio/mpeg');assert.equal((await audio.arrayBuffer()).byteLength,3);
 const d=JSON.parse(new TextDecoder().decode(blobs.get('reading:day:2026-10-18')));assert.equal(d.status,'ready');assert.equal(d.ot.keyVerses.length+d.nt.keyVerses.length,2);assert.equal(d.ot.verses,undefined);assert.equal(d.ot.ranges.length,3);
 const cal=new Request('https://x/api/reading/calendar/2026-10.json');const dates=(await (await readingApi(cal,env,new URL(cal.url))).json()).dates;assert.deepEqual(dates,['2026-10-17','2026-10-18']);
 }finally{globalThis.fetch=actual}
});

test('reading publishes globally at Beijing midnight, including Eastern winter dates',async()=>{
 assert.equal(publicationDate(Date.parse('2026-10-17T15:59:59Z')),'2026-10-17');
 assert.equal(publicationDate(Date.parse('2026-10-17T16:00:00Z')),'2026-10-18');
 assert.equal(publicationDate(Date.parse('2026-12-17T16:00:00Z')),'2026-12-18');
 const {env}=environment(),request=new Request('https://x/api/reading/today.json');
 const response=await readingApi(request,env,new URL(request.url)),d=await response.json();
 assert.equal(d.date,publicationDate(Date.parse(d.serverTime)));assert.equal(d.timezone,'Asia/Shanghai');assert.equal(response.headers.get('cache-control'),'no-store');
});

test('reading share metadata contains date and NT key verse before JavaScript runs',async()=>{
 const {env}=environment();const seed=JSON.parse(fs.readFileSync('content/reading/2026-10-17.json'));
 env.ASSETS.fetch=async req=>req.url.endsWith('.json')?Response.json(seed):new Response('<head><title>Old</title><meta property="og:title" content="Old"><meta property="og:description" content="Old"><meta name="description" content="Old"></head>');
 for(const pre of ['', '/en'])for(const t of ['ot','nt']){const u=new URL(`https://x${pre}/read/2026-10-17/${t}/`),r=await readingPage(new Request(u),env,u),html=await r.text();assert.ok(html.includes(pre?'2026-10-17 Daily Bible Reading':'2026年10月17日三旧一新读经'));assert.ok(html.includes(pre?seed.nt.keyVerses[0].en:seed.nt.keyVerses[0].zh));assert.equal(r.headers.get('cache-control'),'no-store')}
});
