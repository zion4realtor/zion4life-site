// Daily metadata and short selected quotations only. Never store complete chapters.
import { BOOKS } from './bible.js';
import { store } from './store.js';
import { json } from './util.js';
import { esc } from './md.js';
import { ensureWebAudio, webAudioProgress, webURL } from './reading-web.js';

const ORIGIN = 'https://zion4life.faith';
const key = date => `reading:day:${date}`;
const dayMS = 86400000;
const inflight = new Map();
export function publicationDate(now=Date.now()){return new Date(Number(now)+8*3600000).toISOString().slice(0,10)}
export function planDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+d) || d.toISOString().slice(0,10)!==date) throw new Error('Invalid date');
  const y=d.getUTCFullYear(), m=d.getUTCMonth(), n=d.getUTCDate();
  let day=Math.round((Date.UTC(y,m,n)-Date.UTC(y,0,1))/dayMS)+1;
  if (y%4===0&&(y%100!==0||y%400===0)&&(m>1||(m===1&&n===29))) day--;
  return day;
}
const decode = s => s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&nbsp;/g,' ').replace(/&ldquo;|&rdquo;/g,'“').replace(/&lsquo;|&rsquo;/g,'’').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
const plain = s => decode(s.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
function cn(s){if(/^\d+$/.test(s))return +s;let n=0,c=0;for(const x of s){if('一二三四五六七八九'.includes(x))c='一二三四五六七八九'.indexOf(x)+1;else if(x==='十'){n+=(c||1)*10;c=0}else if(x==='百'){n+=(c||1)*100;c=0}}return n+c}
export function parseReading(raw) {
  const name=raw.match(/<title>[^<]*?天[-－]([^<]+)/i)?.[1]?.trim();
  const book=BOOKS.find(b=>b.zh===name);if(!book)throw new Error('Unrecognized source book');
  let chapter=+(raw.match(/CAPTION\s*,\s*['"][^\d'"]*(\d+):/i)?.[1]||0);
  let body=raw.split(/<body[^>]*>/i)[1];if(!body)throw new Error('Missing source body');
  body=body.split(/<hr\b/i)[0].replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<sup>\s*<a\b[\s\S]*?<\/sup>/gi,'');
  const tokens=[...body.matchAll(/<b>\s*第([一二三四五六七八九十百\d]+)章\s*<\/b>|<sup>\s*(\d+)\s*<\/sup>/g)];
  const verses=[];
  for(let i=0;i<tokens.length;i++){const m=tokens[i];if(m[1]){chapter=cn(m[1]);continue}if(!chapter)throw new Error('Unknown chapter');const text=plain(body.slice(m.index+m[0].length,tokens[i+1]?.index??body.length));if(text)verses.push({chapter,verse:+m[2],text})}
  if(!verses.length)throw new Error('No verified verses');
  const ranges=[];for(const v of verses){const last=ranges.at(-1);if(last?.chapter===v.chapter)last.lastVerse=v.verse;else ranges.push({chapter:v.chapter,firstVerse:v.verse,lastVerse:v.verse})}
  return {bookZh:book.zh,bookEn:book.en,bookNumber:book.n,ranges,verses,audioUrl:decode(raw.match(/data-wimpybutton="([^"]+)"/i)?.[1]||'')};
}
const FAMILIAR={Jeremiah:['18:6','20:9','20:11','23:29','24:7','29:11','29:13','31:3','31:31','32:27','33:3'],Hebrews:['12:2','12:14','12:22','12:28','12:29','13:5','13:6','13:8','13:15','13:16','13:20'],James:['1:5','1:17','1:22','2:17','3:17','4:7','4:8','5:16'],Genesis:['1:1','1:26','1:27','2:7','3:15','12:2','15:6','28:15','50:20'],Matthew:['1:21','1:23','4:4','5:8','5:14','6:33','7:7','11:28','16:24','28:19'],John:['1:1','1:4','1:12','1:14','3:16','4:24','6:35','7:38','8:12','10:10','11:25','14:6','15:5','16:33'],Revelation:['1:8','2:10','3:20','7:17','12:11','19:7','21:4','22:17']};
export function selectVerse(part){const preferred=FAMILIAR[part.bookEn]||[];for(const ref of preferred){const v=part.verses.find(v=>`${v.chapter}:${v.verse}`===ref);if(v)return v}return [...part.verses].sort((a,b)=>score(b.text)-score(a.text)||a.verse-b.verse)[0]}
function score(s){return ['爱','信','生命','平安','喜乐','祷告','恩典','救','盼望','耶和华','耶稣','主','心'].reduce((n,w)=>n+(s.includes(w)?2:0),0)-(s.length>100?3:0)}
export function englishURL(part,chapter){return `https://text.recoveryversion.bible/${String(part.bookNumber).padStart(2,'0')}_${part.bookEn.replace(/\s/g,'')}_${chapter}.htm`}
export function englishVerse(raw,verse){const m=[...raw.matchAll(/<p\b[^>]*id="[^"]*-(\d+)"[^>]*>([\s\S]*?)<\/p>/g)].find(m=>+m[1]===verse);if(!m)throw new Error('English verse missing');return plain(m[2].replace(/<b>[\s\S]*?<\/b>/,''))}
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Source ${r.status}`);return r.text()}
async function readBlob(db,k){const r=await db.get(k);return r? r.json():null}
export async function readingData(env,date){planDay(date);const db=store(env);let data=await readBlob(db,key(date));if(data?.status==='ready')return data;const seed=await env.ASSETS.fetch(new Request(`${ORIGIN}/data/reading/${date}.json`));if(seed.ok){data=await seed.json();return data}return null}
async function prepare(env,date){const db=store(env),day=planDay(date),out={date,planDay:day,tags:['eat','life'],status:'ready',checkedAt:new Date().toISOString()};for(const [t,letter] of [['ot','o'],['nt','n']]){const sourceUrl=`https://line.twgbr.org/recoveryversion/oneyear/${letter}${String(day).padStart(3,'0')}.html`;const p=parseReading(await fetchText(sourceUrl)),v=selectVerse(p);const sourceEn=englishURL(p,v.chapter),en=englishVerse(await fetchText(sourceEn),v.verse);const words=en.split(/\s+/),isExcerpt=words.length>25||v.text.length>70;const ref=`${v.chapter}:${v.verse}`;out[t]={bookZh:p.bookZh,bookEn:p.bookEn,bookNumber:p.bookNumber,ranges:p.ranges,sourceUrl,audioUrl:p.audioUrl,englishAudio:{status:'pending',scope:'full-passage',translation:'WEB',voice:'Aura 2 Helena'},keyVerses:[{reference:`${p.bookEn} ${ref}${isExcerpt?' (excerpt)':''}`,referenceZh:`${p.bookZh} ${ref}${isExcerpt?'（节选）':''}`,zh:v.text.slice(0,70)+(v.text.length>70?'…':''),en:words.slice(0,25).join(' ')+(words.length>25?'…':''),sourceEn,testament:t}]}}
 await db.put(key(date),JSON.stringify(out));const index=(await readBlob(db,'reading:index'))||[];if(!index.includes(date))await db.put('reading:index',JSON.stringify([...index,date].sort()));return out}
export async function prepareReadings(env,now=Date.now()) {
 const db=store(env),dates=[0,1,2,-1].map(n=>publicationDate(now+n*dayMS));let prepared=0,audios=0;
 for(const date of dates){let d=await readingData(env,date);if(!d&&prepared<1){if(inflight.has(date))continue;const attempt=await readBlob(db,`reading:attempt:${date}`);if(attempt&&now-attempt.at<10*60000)continue;inflight.set(date,true);await db.put(`reading:attempt:${date}`,JSON.stringify({at:now}));try{d=await prepare(env,date);prepared++}catch(e){console.error('[reading prepare]',date,e.message)}finally{inflight.delete(date)}}if(!d)continue;for(const t of ['ot','nt']){if(audios>=8)break;if(d[t]?.englishAudio?.status==='ready'&&d[t].englishAudio.scope==='full-passage'&&d[t].englishAudio.translation==='WEB')continue;try{const result=await ensureWebAudio(env,d,t,8-audios);audios+=result.used;await db.put(key(date),JSON.stringify(d));}catch(e){console.error('[reading WEB]',date,t,e.message)}}}
 return {prepared,audios};
}
export async function readingApi(request,env,url){if(url.pathname==='/api/reading/today.json'){const now=Date.now(),date=publicationDate(now);return json({date,planDay:planDay(date),timezone:'Asia/Shanghai',serverTime:new Date(now).toISOString()})}let m;if((m=url.pathname.match(/^\/api\/reading\/(\d{4}-\d{2}-\d{2})\/audio\/(ot|nt)\.mp3$/))){let d;try{d=await readingData(env,m[1])}catch{return json({error:'Invalid date'},400)}const a=d?.[m[2]]?.englishAudio;if(a?.status!=='ready')return json({error:'Recording pending'},404);const blob=await store(env).get(a.scope==='full-passage'&&a.translation==='WEB'?`reading:web:audio:${a.hash}`:`reading:audio:${m[1]}:${m[2]}:${a.hash}`);if(!blob)return json({error:'Recording pending'},404);const bytes=new Uint8Array(await blob.arrayBuffer()),range=request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/),headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600'};if(range){const start=+range[1],end=Math.min(range[2]?+range[2]:bytes.length-1,bytes.length-1);if(start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});return new Response(bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`}})}return new Response(bytes,{headers})}
 if((m=url.pathname.match(/^\/api\/reading\/(\d{4}-\d{2}-\d{2})\/transcript\/(ot|nt)\.json$/))){try{planDay(m[1]);const r=await store(env).get(`reading:web:transcript:${m[1]}:${m[2]}:v1`);return r?json(await r.json()):json({status:'pending'},404)}catch{return json({error:'Invalid date'},400)}}
 if((m=url.pathname.match(/^\/api\/reading\/(\d{4}-\d{2}-\d{2})\.json$/))){try{const data=await readingData(env,m[1]);if(data)for(const t of ['ot','nt']){data[t].webSources=data[t].ranges.map(r=>webURL(data[t],r.chapter));if(data[t]?.englishAudio?.translation==='WEB'&&data[t].englishAudio.status==='ready')continue;const progress=await webAudioProgress(env,m[1],t);if(progress)data[t].englishAudio=progress}return data?json(data):json({status:'pending',date:m[1]},404)}catch{return json({error:'Invalid date'},400)}}
 if((m=url.pathname.match(/^\/api\/reading\/calendar\/(\d{4})-(\d{2})\.json$/))){const y=+m[1],month=+m[2];if(y<2026||y>2100||month<1||month>12)return json({error:'Invalid month'},400);const index=(await readBlob(store(env),'reading:index'))||[];const seedResponse=await env.ASSETS.fetch(new Request(`${ORIGIN}/data/reading-index.json`));const seeds=seedResponse.ok?await seedResponse.json():['2026-10-17'];const dates=[...new Set([...seeds,...index])].filter(date=>date.startsWith(`${m[1]}-${m[2]}-`));return json({dates})}return json({error:'Not found'},404)}
export async function readingPage(request,env,url){
 const m=url.pathname.match(/^(\/en)?\/read\/(today|\d{4}-\d{2}-\d{2})\/(ot|nt)\/?$/);if(!m)return null;
 const live=m[2]==='today',date=live?publicationDate():m[2];try{planDay(date)}catch{return new Response('Invalid date',{status:400})}
 const pre=m[1]||'',t=m[3],direct=await env.ASSETS.fetch(new Request(url.toString()));
 const r=direct.ok?direct:await env.ASSETS.fetch(new Request(`${url.origin}${pre}/read/shell/${t}/`));if(!r.ok)return r;
 let html=await r.text();if(!live)html=html.replace('data-reading-date=""',`data-reading-date="${date}"`).replace(/\/read\/(today|shell)\//g,`/read/${date}/`);
 const [y,month,day]=date.split('-'),title=pre?`${date} Daily Bible Reading`:`${y}年${+month}月${+day}日三旧一新读经`;
 const data=await readingData(env,date),verses=data?.nt?.keyVerses||[];
 const description=verses.map(v=>`${pre?v.reference:v.referenceZh} ${pre?v.en:v.zh}`).join(' ');
 html=html.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`)
 .replace(/(<meta property="og:title" content=")[^"]*/,`$1${esc(title)}`)
 .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g,`$1${esc(description)}`)
 .replace(/(<meta property="og:url" content=")[^"]*/,`$1${esc(url.origin+url.pathname)}`)
 .replace(/(<link rel="canonical" href=")[^"]+/,`$1${esc(url.origin+url.pathname)}`);
 html=html.replace('</head>',`<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"></head>`);
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
