// Locally generated Voicebox Ryan recordings, published as same-origin static assets.
export async function localReadingAudio(env,date,testament){
 const r=await env.ASSETS.fetch(new Request(`https://zion4life.faith/data/reading-local/${date}-${testament}.json`));if(!r.ok)return null;
 let m;try{m=await r.json()}catch{return null}
 if(m.status!=='ready'||m.scope!=='full-passage'||m.translation!=='WEB'||m.voice!=='Voicebox Ryan'||m.engine!=='qwen_custom_voice'||m.date!==date||m.testament!==testament||!/^\/files\/reading-ryan\/[a-f0-9]{64}\.mp3$/.test(m.url)||!Number.isSafeInteger(m.bytes)||m.bytes<=0||!Number.isSafeInteger(m.verseCount)||m.verseCount<=0)return null;
 return m;
}
export async function serveLocalReading(request,env,manifest){
 const asset=await env.ASSETS.fetch(new Request(`https://zion4life.faith${manifest.url}`));if(!asset.ok)return new Response('Recording unavailable',{status:503});
 const bytes=new Uint8Array(await asset.arrayBuffer()),size=bytes.length;if(size!==manifest.bytes)return new Response('Incomplete recording',{status:503});
 const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(size),'Cache-Control':'public, max-age=3600','X-Reading-Voice':'Voicebox Ryan'};
 const range=request.headers.get('range');if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);let start,end;if(m&&(m[1]||m[2])){start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size||(!m[1]&&Number(m[2])===0))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`}})}
 return new Response(request.method==='HEAD'?null:bytes,{headers});
}
