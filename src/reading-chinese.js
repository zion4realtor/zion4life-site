// Chinese reading recordings are copied to independent permanent site storage.
import { store } from './store.js';
import { hash, json } from './util.js';
const jobs=new Map();
const manifestKey=(date,t)=>`reading:zh:manifest:${date}:${t}:v1`;
export const chineseAudioURL=(date,t)=>`/api/reading/${date}/audio/zh/${t}.mp3`;
export function recordingSource(source){const u=new URL(source);if(u.protocol!=='https:')throw Error('Invalid recording source');if(['dropbox.com','www.dropbox.com','dl.dropboxusercontent.com'].includes(u.hostname)&&/^\/s\/[a-z0-9]+\/[^/]+\.mp3$/.test(u.pathname)){u.hostname='dl.dropboxusercontent.com';u.search='';return u.href}throw Error('Unsupported recording source')}
export async function chineseAudioStatus(env,date,t){const r=await store(env).get(manifestKey(date,t));return r?r.json():null}
export async function mirrorChineseAudio(env,date,t,source){
 const id=`${date}:${t}`;if(jobs.has(id))return jobs.get(id);
 const job=(async()=>{const db=store(env),url=recordingSource(source),digest=await hash(`reading-zh-v1|${url}`),audioKey=`reading:zh:audio:${digest}`;
 const saved=await chineseAudioStatus(env,date,t);if(saved?.status==='ready'&&saved.hash===digest)return saved;
 if(saved?.retryAt>Date.now())throw Error('Chinese recording retry pending');
 try{let blob=await db.get(audioKey),bytes;
 if(blob)bytes=new Uint8Array(await blob.arrayBuffer());else{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error(`Chinese recording source ${r.status}`);const expected=Number(r.headers.get('content-length'));if(expected>32*1024*1024)throw Error('Recording too large');bytes=new Uint8Array(await r.arrayBuffer());const mp3=bytes[0]===73&&bytes[1]===68&&bytes[2]===51||bytes[0]===255&&(bytes[1]&224)===224;if(bytes.length<1024||bytes.length>32*1024*1024||!mp3||expected&&expected!==bytes.length)throw Error('Invalid or incomplete MP3');const written=await db.put(audioKey,bytes);if(!written.ok||written.bytes!==bytes.length)throw Error('Recording storage failed')}
 const result={status:'ready',storage:'site',hash:digest,bytes:bytes.length,url:chineseAudioURL(date,t),source:url,savedAt:new Date().toISOString()};await db.put(manifestKey(date,t),JSON.stringify(result));return result;
 }catch(e){await db.put(manifestKey(date,t),JSON.stringify({status:'pending',storage:'site',retryAt:Date.now()+120000}));throw e}
 })();jobs.set(id,job);try{return await job}finally{jobs.delete(id)}
}
export async function serveChineseAudio(request,env,date,t,source){
 let saved;try{saved=await mirrorChineseAudio(env,date,t,source)}catch(e){console.error('[reading Chinese audio]',date,t,e.message);return json({status:'pending',error:'Recording is being saved to this site'},503,{'Retry-After':'120'})}
 const blob=await store(env).get(`reading:zh:audio:${saved.hash}`);if(!blob)return json({error:'Recording pending'},503,{'Retry-After':'60'});
 const bytes=new Uint8Array(await blob.arrayBuffer()),size=bytes.length,headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=86400','Content-Length':String(size),'X-Reading-Storage':'site'};
 const range=request.headers.get('range');if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);let start,end;if(m&&(m[1]||m[2])){start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size||!m[1]&&Number(m[2])===0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)}})}
 return new Response(request.method==='HEAD'?null:bytes,{headers});
}
