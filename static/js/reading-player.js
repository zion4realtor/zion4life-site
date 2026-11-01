// A reading-only controller: prayer styling, independent audio and saved preferences.
(function(){
 'use strict';
 const bar=document.querySelector('[data-reading-player]');if(!bar)return;
 const en=document.documentElement.lang==='en',root=bar.closest('[data-reading-page]');
 const audio=bar.querySelector('[data-reading-audio]'),play=bar.querySelector('[data-reading-play]'),track=bar.querySelector('[data-reading-seek]'),fill=bar.querySelector('[data-reading-fill]'),time=bar.querySelector('[data-reading-time]'),speed=bar.querySelector('[data-reading-speed]'),status=bar.querySelector('[data-reading-audio-status]');
 const rates=[1,1.25,1.5,0.8];let rate=1,pendingSeek=null,dragging=false,listened=false;
 try{const saved=Number(localStorage.getItem('yg-reading-rate'));if(rates.includes(saved))rate=saved}catch{}
 speed.textContent=rate+'×';audio.playbackRate=rate;
 const fmt=s=>{s=Math.max(0,Math.floor(s||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
 function show(){const total=Number.isFinite(audio.duration)?audio.duration:0,current=audio.currentTime||0,pct=total?Math.min(100,current/total*100):0;fill.style.width=pct+'%';track.setAttribute('aria-valuenow',String(Math.round(pct)));track.setAttribute('aria-valuetext',total?`${fmt(current)} / ${fmt(total)}`:fmt(current));time.textContent=total?`${fmt(current)} / ${fmt(total)}`:(audio.getAttribute('src')?(en?'Tap to play':'点击播放'):'0:00')}
 function state(){const on=!audio.paused&&!audio.ended&&!audio.error;bar.classList.toggle('on',on);play.setAttribute('aria-label',on?(en?'Pause':'暂停'):(en?'Play reading':'读给我听'));if(on)bar.classList.add('is-started');if('mediaSession'in navigator)try{navigator.mediaSession.playbackState=on?'playing':'paused'}catch{}}
 function say(text){status.textContent=text;status.hidden=!text}
 function source(){pendingSeek=null;bar.classList.remove('on','is-started');play.disabled=!audio.getAttribute('src');audio.playbackRate=rate;show();state()}
 new MutationObserver(source).observe(audio,{attributes:true,attributeFilter:['src']});
 new MutationObserver(()=>{status.hidden=!status.textContent.trim()}).observe(status,{childList:true,subtree:true,characterData:true});
 async function start(){if(!audio.getAttribute('src'))return;say('');if(audio.error)audio.load();if(audio.ended)audio.currentTime=0;audio.playbackRate=rate;try{await audio.play();if(!listened&&window.ygTrack){listened=true;window.ygTrack('listen_audio')}}catch(e){if(e.name!=='AbortError')say(en?'Tap play to retry the recording.':'录音暂时无法播放，请点播放重试。');state()}}
 play.addEventListener('click',()=>audio.paused?start():audio.pause());
 for(const event of ['play','pause','ended'])audio.addEventListener(event,state);
 for(const event of ['timeupdate','durationchange','loadedmetadata'])audio.addEventListener(event,()=>{if(pendingSeek!==null&&Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=pendingSeek*audio.duration;pendingSeek=null}show()});
 audio.addEventListener('ended',()=>bar.classList.remove('is-started'));
 audio.addEventListener('error',()=>{bar.classList.remove('on');state();say(en?'The recording could not load. Tap play to try again.':'录音暂时无法载入，请点播放重试。')});
 function seek(f){f=Math.max(0,Math.min(1,f));if(!audio.getAttribute('src'))return;if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=f*audio.duration;show()}else{pendingSeek=f;audio.preload='metadata';audio.load()}}
 function at(x){const box=track.getBoundingClientRect();if(box.width)seek((x-box.left)/box.width)}
 track.addEventListener('pointerdown',e=>{if(e.button||!audio.getAttribute('src'))return;e.preventDefault();dragging=true;track.setPointerCapture(e.pointerId);track.focus();at(e.clientX)});
 track.addEventListener('pointermove',e=>{if(dragging)at(e.clientX)});
 track.addEventListener('pointerup',e=>{if(dragging)at(e.clientX);dragging=false});
 track.addEventListener('pointercancel',()=>{dragging=false});
 track.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const total=audio.duration;if(!Number.isFinite(total)||total<=0)return;const next=e.key==='Home'?0:e.key==='End'?total:audio.currentTime+(['ArrowRight','ArrowUp'].includes(e.key)?10:-10);seek(next/total)});
 speed.addEventListener('click',()=>{rate=rates[(rates.indexOf(rate)+1)%rates.length];audio.playbackRate=rate;speed.textContent=rate+'×';try{localStorage.setItem('yg-reading-rate',String(rate))}catch{}});
 if('mediaSession'in navigator){const actions={play:start,pause:()=>audio.pause(),seekbackward:()=>seek((audio.currentTime-10)/audio.duration),seekforward:()=>seek((audio.currentTime+10)/audio.duration),seekto:d=>{if(Number.isFinite(audio.duration)&&audio.duration>0)seek(d.seekTime/audio.duration)}};for(const [name,action]of Object.entries(actions))try{navigator.mediaSession.setActionHandler(name,action)}catch{}}
 source();
})();
