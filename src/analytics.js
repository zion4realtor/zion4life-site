// Google Analytics 4 without loading anything from Google on the page.
// Every page sends a small beacon to /api/hit (our own site, so it works in mainland China);
// this Worker forwards it to GA4's Measurement Protocol from Cloudflare, outside China.
// Turned on by two settings: GA_MEASUREMENT_ID ("G-…", in wrangler.jsonc vars) and
// GA_API_SECRET (a Secret Zion sets in the Cloudflare dashboard). Without both, hits are dropped.
// No IP address is sent: the visitor's country, region and city come from Cloudflare.
// Query strings never reach Google (they hold 搭子 invite codes) except utm_* tags.

const MP = 'https://www.google-analytics.com/mp/collect';

// The events a page may send, and the extra parameters each one may carry.
export const EVENTS = {
  page_view: [],
  time_on_page: [],               // visible time on a page, sent when it is hidden or left
  generate_lead: [],              // 有问题想问 sent (mark as a key event in GA)
  sign_up: [],                    // a new account
  login: [],
  create_group: ['kind'],         // a 搭子 started
  join_group: ['group_id', 'kind'],
  share: ['method'],
  play_video: ['line'],
  listen_audio: [],               // 呼吸 读给我听
};

const BOT = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python|go-http|httpclient|java\/|okhttp|axios|node-fetch|preview/i;

const s100 = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 100) : '');
const prune = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '' || (o[k] && typeof o[k] === 'object' && !Object.keys(prune(o[k])).length)) delete o[k];
  return o;
};

export async function handleHit(request, env, ctx, url) {
  const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return done();
  const id = env.GA_MEASUREMENT_ID;
  const secret = env.GA_API_SECRET;
  if (!id || !secret) return done();
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return done();
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return done();
  let b;
  try {
    const text = await request.text();
    if (text.length > 4000) return done();
    b = JSON.parse(text);
  } catch {
    return done();
  }
  let hits;
  try {
    hits = buildHits(b, { ua, cf: request.cf || {}, host: url.host, now: Date.now() });
  } catch (e) {
    console.error('[ga]', e?.message || e);
    return done();
  }
  if (!hits.length) return done();
  const endpoint = `${MP}?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`;
  const send = async () => {
    // campaign_details (where the visit came from) goes first, so it applies to the page view
    for (const body of hits) {
      try {
        const r = await fetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
        // TEMP diagnostic while checking the first hits arrive (remove after)
        console.log('[ga] sent', body.events.map((e) => e.name).join(','), r.status, String(secret).length);
        if (!r.ok) console.error('[ga]', r.status);
      } catch (e) {
        console.error('[ga]', e?.message || e);
      }
    }
  };
  if (ctx && ctx.waitUntil) ctx.waitUntil(send());
  else await send();
  return done();
}

// The page's beacon → the Measurement Protocol requests to send (pure, for tests).
// Beacon: { cid, sid, ns (1 = first hit of a new visit), loc, ref, title, lang, scr, e: [{ n, p, ms }] }
export function buildHits(b, { ua = '', cf = {}, host, now = Date.now() }) {
  if (!b || typeof b !== 'object') return [];
  const loc = cleanLoc(b.loc, host);
  if (!loc) return [];
  const cid = typeof b.cid === 'string' && /^\d{1,12}\.\d{9,11}$/.test(b.cid) ? b.cid : `${Math.floor(Math.random() * 2147483647)}.${Math.floor(now / 1000)}`;
  const sid = typeof b.sid === 'string' && /^\d{9,11}$/.test(b.sid) ? Number(b.sid) : Math.floor(now / 1000);
  const ref = cleanRef(b.ref, host);
  const lang = typeof b.lang === 'string' ? b.lang.toLowerCase().slice(0, 20) : '';
  const events = [];
  for (const ev of (Array.isArray(b.e) ? b.e : []).slice(0, 5)) {
    if (!ev || !Object.hasOwn(EVENTS, ev.n)) continue;
    const params = {
      session_id: sid,
      engagement_time_msec: ev.n === 'time_on_page' ? Math.max(1, Math.min(1800000, Math.round(Number(ev.ms) || 0))) : 1,
      page_location: loc.href.slice(0, 100),
      page_title: s100(b.title),
      language: lang,
    };
    if (ev.n === 'page_view' && ref) params.page_referrer = ref.slice(0, 100);
    const p = ev.p && typeof ev.p === 'object' ? ev.p : {};
    for (const k of EVENTS[ev.n]) if (s100(p[k])) params[k] = s100(p[k]);
    events.push({ name: ev.n, params: prune(params) });
  }
  if (!events.length) return [];
  const base = { client_id: cid, user_location: where(cf), device: device(ua, lang, b.scr) };
  prune(base);
  const out = [];
  if (b.ns) {
    const src = source(loc.url, b.ref, ua, host);
    if (src) out.push({ ...base, timestamp_micros: now * 1000 - 1000, events: [{ name: 'campaign_details', params: src }] });
  }
  out.push({ ...base, timestamp_micros: now * 1000, events });
  return out;
}

// Our own page address, with every query parameter dropped except utm_* tags.
function cleanLoc(v, host) {
  if (typeof v !== 'string') return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.host !== host || !/^https?:$/.test(u.protocol)) return null;
  const keep = new URLSearchParams();
  for (const [k, val] of u.searchParams) if (/^utm_(source|medium|campaign|term|content|id)$/.test(k)) keep.set(k, val.slice(0, 60));
  const q = keep.toString();
  return { href: `${u.origin}${u.pathname}${q ? `?${q}` : ''}`, url: u };
}
// Where the visitor came from: our own pages by path, other sites by their address only.
function cleanRef(v, host) {
  if (typeof v !== 'string' || !v) return '';
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) return '';
    return u.host === host ? `${u.origin}${u.pathname}` : `${u.origin}/`;
  } catch {
    return '';
  }
}

const SEARCH = [[/(^|\.)google\./, 'google'], [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)baidu\.com$/, 'baidu'], [/(^|\.)sogou\.com$/, 'sogou'],
  [/(^|\.)so\.com$/, '360'], [/(^|\.)sm\.cn$/, 'shenma'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo'], [/(^|\.)yandex\./, 'yandex'],
  [/(^|\.)yahoo\./, 'yahoo'], [/(^|\.)naver\.com$/, 'naver'], [/(^|\.)ecosia\.org$/, 'ecosia']];
const SOCIAL = [[/(^|\.)(weixin|wx)\.qq\.com$/, 'wechat'], [/(^|\.)weibo\.(com|cn)$/, 'weibo'], [/(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/, 'xiaohongshu'],
  [/(^|\.)douyin\.com$/, 'douyin'], [/(^|\.)zhihu\.com$/, 'zhihu'], [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'], [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/, 'x'], [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'], [/(^|\.)line\.me$/, 'line'], [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)reddit\.com$/, 'reddit'], [/(^|\.)t\.me$|(^|\.)telegram\.org$/, 'telegram'], [/(^|\.)whatsapp\.com$/, 'whatsapp']];

// The source of a new visit, for GA's traffic reports: utm tags, else the referring site,
// else the app it was opened in (WeChat and others send no referrer). Nothing = direct.
export function source(u, ref, ua, host) {
  const q = u.searchParams;
  if (q.get('utm_source')) {
    return prune({ source: s100(q.get('utm_source')), medium: s100(q.get('utm_medium') || 'referral'), campaign: s100(q.get('utm_campaign') || ''), term: s100(q.get('utm_term') || ''), content: s100(q.get('utm_content') || ''), campaign_id: s100(q.get('utm_id') || '') });
  }
  let rh = '';
  try { rh = typeof ref === 'string' && ref ? new URL(ref).hostname.toLowerCase() : ''; } catch {}
  if (rh && rh !== String(host).split(':')[0]) {
    for (const [re, name] of SEARCH) if (re.test(rh)) return { source: name, medium: 'organic' };
    for (const [re, name] of SOCIAL) if (re.test(rh)) return { source: name, medium: 'social' };
    return { source: rh.replace(/^www\./, ''), medium: 'referral' };
  }
  if (/MicroMessenger/i.test(ua)) return { source: 'wechat', medium: 'social' };
  if (/xiaohongshu|discover\/\d/i.test(ua)) return { source: 'xiaohongshu', medium: 'social' };
  if (/Weibo/i.test(ua)) return { source: 'weibo', medium: 'social' };
  if (/\bQQ\/\d/i.test(ua)) return { source: 'qq', medium: 'social' };
  if (/FBAN|FBAV/i.test(ua)) return { source: 'facebook', medium: 'social' };
  if (/\bLine\//i.test(ua)) return { source: 'line', medium: 'social' };
  return null;
}

// Country, region and city as Cloudflare saw them (never the IP address).
function where(cf) {
  const country = typeof cf.country === 'string' && /^[A-Z]{2}$/.test(cf.country) && cf.country !== 'T1' ? cf.country : '';
  if (!country) return {};
  const region = typeof cf.regionCode === 'string' && /^[A-Z0-9]{1,3}$/i.test(cf.regionCode) ? `${country}-${cf.regionCode.toUpperCase()}` : '';
  return { country_id: country, region_id: region, city: s100(cf.city || '') };
}

// Phone / tablet / computer, system and browser, read from the user agent.
export function device(ua, lang, scr) {
  const cat = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua) ? 'tablet'
    : /Mobi|iPhone|iPod|Android|HarmonyOS|OpenHarmony/i.test(ua) ? 'mobile' : 'desktop';
  let os = '', osv = '';
  let m;
  if (/HarmonyOS|OpenHarmony/i.test(ua)) { os = 'HarmonyOS'; osv = (ua.match(/(?:HarmonyOS|OpenHarmony)[ /]?([\d.]+)/i) || [])[1] || ''; }
  else if ((m = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)*)/))) { os = 'iOS'; osv = m[1].replace(/_/g, '.'); }
  else if ((m = ua.match(/Android ([\d.]+)/))) { os = 'Android'; osv = m[1]; }
  else if ((m = ua.match(/Windows NT ([\d.]+)/))) { os = 'Windows'; osv = m[1]; }
  else if ((m = ua.match(/Mac OS X (\d+(?:[_.]\d+)*)/))) { os = 'Macintosh'; osv = m[1].replace(/_/g, '.'); }
  else if (/CrOS/.test(ua)) os = 'Chrome OS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const BROWSERS = [[/MicroMessenger\/([\d.]+)/, 'WeChat'], [/MQQBrowser\/([\d.]+)/, 'QQ Browser'], [/\bQQ\/([\d.]+)/, 'QQ'], [/UCBrowser\/([\d.]+)/, 'UC Browser'],
    [/Quark\/([\d.]+)/, 'Quark'], [/HuaweiBrowser\/([\d.]+)/, 'Huawei Browser'], [/MiuiBrowser\/([\d.]+)/, 'Mi Browser'], [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Weibo/, 'Weibo'], [/EdgA?\/([\d.]+)|EdgiOS\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Firefox\/([\d.]+)|FxiOS\/([\d.]+)/, 'Firefox'],
    [/CriOS\/([\d.]+)|Chrome\/([\d.]+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari'], [/Safari/, 'Safari']];
  let model = '', brand = '';
  if ((m = ua.match(/\b(iPhone|iPad|iPod)\b/))) { model = m[1]; brand = 'Apple'; }
  else if (os === 'Macintosh') { model = 'Macintosh'; brand = 'Apple'; }
  else if ((m = ua.match(/Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build\/[^;)]*)?[;)]/i)) && m[1] !== 'K' && !/^(Linux|U|wv|Mobile|HarmonyOS|OpenHarmony)$/i.test(m[1])) model = m[1].trim();
  else if (os === 'HarmonyOS' && (m = ua.match(/; ([A-Z]{3}-[A-Z0-9]{3,5})[;)]/))) model = m[1];
  if (!brand) {
    if (/HONOR/i.test(ua)) brand = 'Honor';
    else if (/HUAWEI|HarmonyOS|OpenHarmony/i.test(ua) || /^[A-Z]{3}-[A-Z]{1,2}\d{2}$/.test(model)) brand = 'Huawei';
    else if (/^SM-/i.test(model) || /SamsungBrowser/.test(ua)) brand = 'Samsung';
    else if (/Xiaomi|Redmi|MiuiBrowser/i.test(ua)) brand = 'Xiaomi';
  }
  let br = '', brv = '';
  for (const [re, name] of BROWSERS) {
    if ((m = ua.match(re))) { br = name; brv = m.slice(1).find(Boolean) || ''; break; }
  }
  return {
    category: cat,
    language: lang || undefined,
    screen_resolution: typeof scr === 'string' && /^\d{2,5}x\d{2,5}$/.test(scr) ? scr : undefined,
    operating_system: os || undefined,
    operating_system_version: osv.slice(0, 20) || undefined,
    model: model.slice(0, 40) || undefined,
    brand: brand || undefined,
    browser: br || undefined,
    browser_version: brv.slice(0, 20) || undefined,
  };
}
