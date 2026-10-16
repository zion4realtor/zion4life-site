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
