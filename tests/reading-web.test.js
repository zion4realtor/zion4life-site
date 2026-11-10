import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWebChapter,webTranscript,splitSpeech,mp3Frames,ensureWebAudio} from '../src/reading-web.js';
const html=`<ul class='tnav'><li>navigation</li></ul><div class='chapterlabel'>1</div><span class="verse" id="V1">1</span>First verse <a href="#FN1" class="notemark">*<span class="popup">NOT TO BE READ</span></a> continues.<span class="verse" id="V2">2</span>Second verse.<span class="verse" id="V3">3</span>Third verse.<ul class='tnav'><li>navigation</li></ul><div class="footnote">NOT TO BE READ</div>`;
test('WEB parser excludes both navigation bars and footnotes, keeping every verse',()=>{const verses=parseWebChapter(html);assert.equal(verses.size,3);assert.equal(verses.get(1),'First verse continues.');assert.equal(verses.get(3),'Third verse.');assert.throws(()=>parseWebChapter('<div>No verses</div>'))});
test('full transcript honors exact range, spans chapters and cannot silently omit a verse',async()=>{const part={bookEn:'Jeremiah',ranges:[{chapter:18,firstVerse:2,lastVerse:3},{chapter:19,firstVerse:1,lastVerse:2}]};const s=await webTranscript(part,async()=>new Response(html));assert.equal(s.verseCount,4);assert.deepEqual(s.verses.map(v=>[v.chapter,v.verse]),[[18,2],[18,3],[19,1],[19,2]]);assert.equal(s.text,'Jeremiah chapter 18. Second verse. Third verse. Jeremiah chapter 19. First verse continues. Second verse.');assert.equal(s.chunks.join(' '),s.text);await assert.rejects(()=>webTranscript({bookEn:'Jeremiah',ranges:[{chapter:18,firstVerse:1,lastVerse:4}]},async()=>new Response(html)),/missing/)});
test('speech chunks preserve long verses exactly within the voice request limit',()=>{const s=Array.from({length:800},(_,i)=>`word${i}`).join(' ')+'. End of reading.';const chunks=splitSpeech(s);assert.ok(chunks.length>2);assert.ok(chunks.every(c=>c.length<=1800));assert.equal(chunks.join(' '),s)});
function frame(marker){const b=new Uint8Array(144);b.set([255,243,100,196]);if(marker)b.set(new TextEncoder().encode(marker),13);return b}
test('merged MP3 strips per-piece ID3 and first-piece duration headers without losing audio frames',()=>{const id3=new Uint8Array([73,68,51,4,0,0,0,0,0,0]);const b=new Uint8Array(id3.length+3*144);b.set(id3);b.set(frame('Info'),10);b.set(frame(),154);b.set(frame(),298);const result=mp3Frames(b);assert.equal(result.length,288);assert.deepEqual([...result.slice(0,4)],[255,243,100,196]);assert.throws(()=>mp3Frames(new Uint8Array([1,2,3])),/No MP3/)});
test('server prepares complete WEB text but never invokes Cloudflare speech',async()=>{
 const blobs=new Map(),calls=[];
 const transcript={text:'One. Two.',chunks:['One.','Two.'],verseCount:2,ranges:[{chapter:18,firstVerse:1,lastVerse:2}]};
 const env={ASSETS:{fetch:async r=>r.url.includes('/data/reading-local/')?new Response('',{status:404}):Response.json(transcript)},AI:{run:async()=>{calls.push('AI');throw Error('Cloud speech forbidden')}},STORE:{idFromName:()=>1,get:()=>({fetch:async(u,init={})=>{const key=new URL(u).searchParams.get('key');if(init.method==='PUT'){blobs.set(key,init.body);return Response.json({ok:true})}return blobs.has(key)?new Response(blobs.get(key)):new Response('',{status:404})}})}};
 const d={date:'2026-11-11',ot:{bookEn:'Jeremiah',ranges:transcript.ranges,englishAudio:{status:'pending'}}};
 const result=await ensureWebAudio(env,d,'ot',8);assert.equal(result.used,0);assert.equal(result.complete,false);assert.equal(calls.length,0);assert.equal(d.ot.englishAudio.voice,'Voicebox Ryan');assert.ok(blobs.has('reading:web:transcript:2026-11-11:ot:v1'));
});


test('speech splitting retains standalone punctuation and adjacent quotations without text loss',()=>{
 const samples=['First sentence. . . Then more words! "Again?" Yes.', '"First!""Second?" End.', '... A leading pause. ! Another sentence.'];
 for(const source of samples){for(const limit of [20,40,1800]){const chunks=splitSpeech(source,limit);assert.equal(chunks.join(' '),source);assert.ok(chunks.every(c=>c.length<=limit))}}
});

test('November 7 Ezekiel 6-9 regression preserves the complete verified reading',async()=>{
 const fs=await import('node:fs');const transcript=JSON.parse(fs.readFileSync(new URL('../static/data/reading-web/2026-11-07-ot.json',import.meta.url)));
 assert.equal(transcript.verseCount,70);assert.equal(splitSpeech(transcript.text).join(' '),transcript.text);
});

