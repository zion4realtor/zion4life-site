// Making the 呼吸 recordings small enough for phones. Workers AI returns 44.1 kHz 16-bit WAV
// (about 5 MB a minute); this turns it into 16 kHz 8-bit μ-law WAV (about 1 MB a minute),
// which phone browsers play. It runs inside the Durable Object, which has time for it.

// Base64 → bytes (the platform's own when it has one).
const B64 = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => { B64[c.charCodeAt(0)] = i; });
export function fromBase64(s) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s.replace(/\s+/g, ''));
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64[s.charCodeAt(i)] << 18) | (B64[s.charCodeAt(i + 1)] << 12) | (B64[s.charCodeAt(i + 2)] << 6) | B64[s.charCodeAt(i + 3)];
    out[o++] = n >> 16;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

// The PCM inside a WAV file: { rate, channels, bits, samples (Int16Array, first channel) }.
export function readWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let at = 12, fmt = null, data = null;
  while (at + 8 <= bytes.length) {
    const id = tag(at), size = dv.getUint32(at + 4, true);
    if (id === 'fmt ') fmt = { format: dv.getUint16(at + 8, true), channels: dv.getUint16(at + 10, true), rate: dv.getUint32(at + 12, true), bits: dv.getUint16(at + 22, true) };
    if (id === 'data') { data = { at: at + 8, size: Math.min(size, bytes.length - at - 8) }; break; }
    at += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) return null;
  const frames = Math.floor(data.size / (2 * fmt.channels));
  const samples = new Int16Array(frames);
  for (let i = 0, p = data.at; i < frames; i++, p += 2 * fmt.channels) samples[i] = dv.getInt16(p, true);
  return { rate: fmt.rate, channels: fmt.channels, samples };
}

// G.711 μ-law.
const EXP = new Uint8Array(256);
for (let i = 1; i < 256; i++) EXP[i] = Math.floor(Math.log2(i));
function mulaw(s) {
  let sign = 0;
  if (s < 0) { sign = 0x80; s = -s; }
  if (s > 32635) s = 32635;
  s += 0x84;
  const e = EXP[(s >> 7) & 0xff];
  return ~(sign | (e << 4) | ((s >> (e + 3)) & 0x0f)) & 0xff;
}

// 16-bit PCM at any rate → 8-bit μ-law WAV at `rate` (averaging the samples each output covers).
export function toMulawWav(pcm, rate = 16000) {
  const step = pcm.rate > rate ? pcm.rate / rate : 1;
  const outRate = pcm.rate > rate ? rate : pcm.rate;
  const n = Math.floor(pcm.samples.length / step);
  const body = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = a; j < b; j++) sum += pcm.samples[j];
    body[i] = mulaw(Math.round(sum / (b - a)));
  }
  const pad = n & 1;
  const out = new Uint8Array(58 + n + pad);
  const dv = new DataView(out.buffer);
  const put = (at, s) => { for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 50 + n + pad, true); put(8, 'WAVE');
  put(12, 'fmt '); dv.setUint32(16, 18, true);
  dv.setUint16(20, 7, true); dv.setUint16(22, 1, true); dv.setUint32(24, outRate, true); dv.setUint32(28, outRate, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); dv.setUint16(36, 0, true);
  put(38, 'fact'); dv.setUint32(42, 4, true); dv.setUint32(46, n, true);
  put(50, 'data'); dv.setUint32(54, n, true);
  out.set(body, 58);
  return out;
}

// What Workers AI gave (WAV, or already compressed audio) → what to store.
export function shrinkAudio(bytes) {
  const pcm = readWav(bytes);
  return pcm ? toMulawWav(pcm) : bytes;
}
