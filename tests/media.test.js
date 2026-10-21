import test from 'node:test';
import assert from 'node:assert/strict';
import { serveVideo } from '../src/media.js';
const bytes = new TextEncoder().encode('0123456789');
function fixture() {
  return { ASSETS: { fetch: async (request) => {
    assert.equal(request.headers.has('Range'), false);
    return new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,3));c.enqueue(bytes.slice(3,7));c.enqueue(bytes.slice(7));c.close();}}), {headers:{'Content-Type':'video/mp4','Content-Length':'10',ETag:'"video"'}});
  } } };
}
test('MP4 byte ranges: Safari probe, seeking, open and suffix ranges, invalid ranges and validators', async () => {
  for (const [range,status,text,contentRange] of [
    ['bytes=0-1',206,'01','bytes 0-1/10'],['bytes=4-7',206,'4567','bytes 4-7/10'],['bytes=7-',206,'789','bytes 7-9/10'],['bytes=-3',206,'789','bytes 7-9/10'],['bytes=8-99',206,'89','bytes 8-9/10'],['bytes=10-',416,'','bytes */10'],['bytes=-0',416,'','bytes */10'],['bytes=6-2',416,'','bytes */10'],['bytes=0-1,3-4',200,'0123456789',null],
  ]) {
    const r=await serveVideo(new Request('https://example.com/video/test.mp4',{headers:{Range:range}}),fixture());
    assert.equal(r.status,status,range);assert.equal(r.headers.get('Content-Range'),contentRange);assert.equal(await r.text(),text);assert.equal(Number(r.headers.get('Content-Length')),text.length);
  }
  for(const tag of ['"video"','"old"']) {
    const r=await serveVideo(new Request('https://example.com/video/test.mp4',{headers:{Range:'bytes=0-1','If-Range':tag}}),fixture());assert.equal(r.status,tag==='"video"'?206:200);await r.text();
  }
  const r=await serveVideo(new Request('https://example.com/video/test.mp4',{method:'HEAD'}),fixture());assert.equal(r.headers.get('Accept-Ranges'),'bytes');assert.equal(await r.text(),'');
});

test('MP4 ranges use build manifest when the asset binding omits Content-Length', async () => {
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/video-sizes.json'
    ? Response.json({'/video/test.mp4':bytes.length})
    : new Response(bytes,{headers:{'Content-Type':'video/mp4'}})}};
  const r=await serveVideo(new Request('https://example.com/video/test.mp4',{headers:{Range:'bytes=0-1'}}),env);
  assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-1/10');assert.equal(await r.text(),'01');
});

test('Workers range bodies use a fixed length and stop reading after the requested bytes', async () => {
  const Original = globalThis.FixedLengthStream;
  const lengths = [];
  let cancelled = false;
  globalThis.FixedLengthStream = class {
    constructor(length) {
      lengths.push(length);
      let written = 0;
      const stream = new TransformStream({
        transform(chunk, controller) { written += chunk.byteLength; assert.ok(written <= length); controller.enqueue(chunk); },
        flush() { assert.equal(written, length); },
      });
      this.readable = stream.readable; this.writable = stream.writable;
    }
  };
  try {
    const env = {ASSETS:{fetch:async()=>new Response(new ReadableStream({
      pull(c) { c.enqueue(bytes); }, cancel() { cancelled = true; },
    }),{headers:{'Content-Type':'video/mp4','Content-Length':'10'}})}};
    const r=await serveVideo(new Request('https://example.com/video/test.mp4',{headers:{Range:'bytes=0-1'}}),env);
    assert.equal(r.status,206);
    assert.equal(r.headers.get('Content-Length'),'2');
    assert.equal(await r.text(),'01');
    assert.deepEqual(lengths,[2]);
    assert.equal(cancelled,true);
  } finally { if(Original)globalThis.FixedLengthStream=Original;else delete globalThis.FixedLengthStream; }
});

test('a truncated asset fails instead of silently completing a partial MP4 range', async () => {
 const env={ASSETS:{fetch:async()=>new Response(bytes.slice(0,3),{headers:{'Content-Length':'10'}})}};
 const r=await serveVideo(new Request('https://example.com/video/test.mp4',{headers:{Range:'bytes=0-8'}}),env);
 await assert.rejects(r.arrayBuffer(),/ended before/);
});

test('video share entry redirects old links per slug without loops, preserves language, and rejects missing videos',async()=>{
 const {serveVideoPage}=await import('../src/media.js');
 const env={ASSETS:{fetch:async req=>{
  assert.equal(req.headers.has('If-None-Match'),false);
  return new Response('only this video',{headers:{'Content-Type':'text/html'}});
 }}};
 for(const pre of ['', '/en'])for(const slug of ['prayer-and-job-search','atlanta-baptisms']){
  for(const query of ['', '?share=video2', '?share=v3-other']){
   const r=await serveVideoPage(new Request(`https://example.com${pre}/v/${slug}/${query}`,{headers:{'If-None-Match':'old'}}),env);
   assert.equal(r.status,302);assert.equal(r.headers.get('Location'),`https://example.com${pre}/v/${slug}/?share=v3-${slug}`);
  }
  const r=await serveVideoPage(new Request(`https://example.com${pre}/v/${slug}/?share=v3-${slug}`),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(await r.text(),'only this video');
 }
 const missing={ASSETS:{fetch:async()=>new Response('missing',{status:404})}};
 assert.equal((await serveVideoPage(new Request('https://example.com/v/missing/'),missing)).status,404);
});
