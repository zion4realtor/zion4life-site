// Static Assets currently return full files for Range requests. Safari requires
// byte ranges for MP4 playback. Stream the requested bytes without buffering video.
export async function serveVideo(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const headers = new Headers(request.headers);
  headers.delete('Range');
  headers.delete('If-Range');
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers }));
  if (asset.status !== 200) return asset;
  const out = new Headers(asset.headers);
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'public, max-age=0, must-revalidate, no-transform');
  let size = Number(out.get('Content-Length'));
  // The binding may omit this header even though the edge adds it to responses.
  // Use build-time lengths rather than buffering a whole video into memory.
  if (!Number.isSafeInteger(size) || size <= 0) {
    const manifest = await env.ASSETS.fetch(new Request(new URL('/data/video-sizes.json', request.url)));
    if (manifest.ok) {
      const sizes = await manifest.json();
      size = sizes[new URL(request.url).pathname];
      if (Number.isSafeInteger(size) && size > 0) out.set('Content-Length', String(size));
    }
  }
  if (request.method === 'HEAD') { await asset.body?.cancel(); return new Response(null, { status: 200, headers: out }); }
  const range = request.headers.get('Range');
  const validator = request.headers.get('If-Range');
  const matches = !validator || validator === out.get('ETag') || validator === out.get('Last-Modified');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (!m[1] && !m[2]) || !matches || !Number.isSafeInteger(size) || size <= 0) return new Response(knownLength(asset.body, size), { headers: out });
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] ? (m[2] ? Math.min(Number(m[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    await asset.body?.cancel();
    out.set('Content-Range', `bytes */${size}`);
    out.set('Content-Length', '0');
    return new Response(null, { status: 416, headers: out });
  }
  out.set('Content-Range', `bytes ${start}-${end}/${size}`);
  out.set('Content-Length', String(end - start + 1));
  const reader = asset.body.getReader();
  let offset = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) { controller.error(new Error('Video range ended before its declared length')); return; }
          const from = Math.max(0, start - offset);
          const to = Math.min(value.byteLength, end + 1 - offset);
          offset += value.byteLength;
          if (to > from) controller.enqueue(value.subarray(from, to));
          if (offset > end) { controller.close(); await reader.cancel(); return; }
          if (to > from) return;
        }
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(knownLength(body, end - start + 1), { status: 206, headers: out });
}

// Workers ignores a manually set Content-Length on an arbitrary ReadableStream.
// FixedLengthStream preserves it on the actual edge response (including Safari's
// initial two-byte probe) while retaining backpressure and cancellation.
function knownLength(body, size) {
  if (!body || !Number.isSafeInteger(size) || size <= 0 || typeof FixedLengthStream === 'undefined') return body;
  const fixed = new FixedLengthStream(size);
  body.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}
