import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorChineseAudio, serveChineseAudio, recordingSource } from '../src/reading-chinese.js';
function fixture(){const blobs=new Map();return {blobs,env:{STORE:{idFromName:()=>1,get:()=>({fetch:async(input,init={})=>{const u=new URL(input),key=u.searchParams.get('key');if(init.method==='PUT'){const bytes=typeof init.body==='string'?new TextEncoder().encode(init.body):new Uint8Array(init.body);blobs.set(key,bytes);return Response.json({ok:true,bytes:bytes.length})}return blobs.has(key)?new Response(blobs.get(key)):new Response('',{status:404})}})}}}}
const source='https://dropbox.com/s/cr5e8xptfi42pwe/nt-oneyear-293.mp3?raw=1';
const mp3=new Uint8Array(4096);mp3.set([73,68,51]);
test('Chinese recording is permanently copied, reused without origin, and supports iPhone byte ranges',async()=>{
 const {env,blobs}=fixture(),original=globalThis.fetch;let downloads=0;
 globalThis.fetch=async url=>{downloads++;assert.equal(String(url),'https://dl.dropboxusercontent.com/s/cr5e8xptfi42pwe/nt-oneyear-293.mp3');return new Response(mp3,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(mp3.length)}})};
 try{const saved=await mirrorChineseAudio(env,'2026-10-20','nt',source);assert.equal(saved.status,'ready');assert.equal(saved.bytes,4096);assert.ok([...blobs.keys()].some(k=>k.startsWith('reading:zh:audio:')));globalThis.fetch=async()=>{throw Error('Origin unavailable')};
 for(const [range,size,status] of [['bytes=0-1',2,206],['bytes=-128',128,206],['bytes=4000-',96,206],['bytes=5000-',0,416]]){const r=await serveChineseAudio(new Request('https://site/audio',{headers:{range}}),env,'2026-10-20','nt',source);assert.equal(r.status,status);assert.equal((await r.arrayBuffer()).byteLength,size)}
 const head=await serveChineseAudio(new Request('https://site/audio',{method:'HEAD'}),env,'2026-10-20','nt',source);assert.equal(head.headers.get('Content-Length'),'4096');assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(downloads,1);
 }finally{globalThis.fetch=original}
});
test('Chinese mirror rejects HTML and partial files instead of caching an invalid player source',async()=>{
 const original=globalThis.fetch;try{for(const response of [new Response('<html>Error</html>',{headers:{'Content-Type':'text/html'}}),new Response(mp3,{status:206}),new Response(mp3,{headers:{'Content-Length':'99999'}})]){const {env,blobs}=fixture();globalThis.fetch=async()=>response;await assert.rejects(mirrorChineseAudio(env,'2026-10-20','ot',source));assert.ok(![...blobs.keys()].some(k=>k.startsWith('reading:zh:audio:')))}}finally{globalThis.fetch=original}
 assert.throws(()=>recordingSource('http://127.0.0.1/x.mp3'));assert.throws(()=>recordingSource('https://example.com/not-approved.mp3'));
});
