import { store } from './store.js';

const API = 'https://api.weixin.qq.com/cgi-bin';
const pending = new Map();

async function cached(env, key, load) {
  const now = Date.now();
  const saved = await store(env).get(key);
  if (saved) {
    try {
      const value = await saved.json();
      if (value.expires > now + 60_000 && value.data) return value.data;
    } catch { /* refresh malformed or expired cache */ }
  }
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const value = await load();
      const expires = now + Math.max(60, Number(value.expires_in) || 7200) * 1000 - 300_000;
      await store(env).put(key, JSON.stringify({ expires, data: value.data }));
      return value.data;
    })().finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

async function wechatJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('WeChat API unavailable');
  const data = await response.json();
  if (data.errcode) throw new Error('WeChat API rejected the request');
  return data;
}

async function ticket(env) {
  const appId = env.WX_APP_ID;
  const secret = env.WX_APP_SECRET;
  if (!appId || !secret) throw new Error('WeChat sharing is not configured');
  const token = await cached(env, `wx:token:${appId}`, async () => {
    const data = await wechatJson(`${API}/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`);
    return { data: data.access_token, expires_in: data.expires_in };
  });
  return cached(env, `wx:ticket:${appId}`, async () => {
    const data = await wechatJson(`${API}/ticket/getticket?access_token=${encodeURIComponent(token)}&type=jsapi`);
    return { data: data.ticket, expires_in: data.expires_in };
  });
}

export async function handleWechatSignature(request, env, requestUrl) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const pageUrl = requestUrl.searchParams.get('url');
  let parsed;
  try { parsed = new URL(pageUrl); } catch { return Response.json({ error: 'Invalid URL' }, { status: 400 }); }
  if (parsed.origin !== 'https://zion4life.faith' || !/^\/en\/huxi\/(?:\d{4}-\d{2}-\d{2}\/)?$/.test(parsed.pathname) || parsed.hash) {
    return Response.json({ error: 'URL is not allowed' }, { status: 400 });
  }
  try {
    const jsapiTicket = await ticket(env);
    const nonceStr = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${parsed.href}`;
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
    const signature = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    return Response.json({ appId: env.WX_APP_ID, timestamp, nonceStr, signature }, {
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://zion4life.faith' },
    });
  } catch {
    return Response.json({ error: 'WeChat sharing is not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}