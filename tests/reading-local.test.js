import test from 'node:test';
import assert from 'node:assert/strict';
import {localReadingAudio,serveLocalReading} from '../src/reading-local.js';
const manifest={status:'ready',scope:'full-passage',translation:'WEB',voice:'Voicebox Ryan',engine:'qwen_custom_voice',date:'2026-11-11',testament:'nt',bytes:10,verseCount:4,url:'/files/reading-ryan/'+ 'a'.repeat(64)+'.mp3'};
function env(m=manifest,bytes='0123456789'){return {ASSETS:{fetch:async req=>req.url.includes('/data/reading-local/')?Response.json(m):new Response(bytes)}}}
test('local Ryan manifest accepts only the expected full passage and same-origin assets',async()=>{
 assert.equal((await localReadingAudio(env(),'2026-11-11','nt')).voice,'Voicebox Ryan');for(const override of[{date:'2026-11-10'},{voice:'Other'},{url:'https://external.com/a.mp3'},{scope:'key-verses'},{bytes:0}])assert.equal(await localReadingAudio(env({...manifest,...override}),'2026-11-11','nt'),null);
});
test('local Ryan playback supports iPhone probes, seeking, HEAD and truncation detection',async()=>{
 for(const [range,status,body]of [['bytes=0-1',206,'01'],['bytes=5-',206,'56789'],['bytes=-3',206,'789'],['bytes=10-',416,'']]){const r=await serveLocalReading(new Request('https://site/audio',{headers:{range}}),env(),manifest);assert.equal(r.status,status);assert.equal(await r.text(),body)}
 const r=await serveLocalReading(new Request('https://site/audio',{method:'HEAD'}),env(),manifest);assert.equal(r.headers.get('Content-Length'),'10');assert.equal(await r.text(),'');assert.equal((await serveLocalReading(new Request('https://site/audio'),env(manifest,'short'),manifest)).status,503);
});
