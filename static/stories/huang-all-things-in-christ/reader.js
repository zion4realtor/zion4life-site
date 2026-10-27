(() => {
 'use strict';
 const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
 const key='zion4life-huang-full-reader-v1';
 let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
 let current=0,mode='chapter',font=Number.isFinite(saved.font)?Math.min(27,Math.max(18,saved.font)):21,night=!!saved.night,timer;
 const sections=$$('.chapter'),weights=BOOK_META.map(x=>x.weight),total=weights.reduce((a,b)=>a+b,0);
 const notify=t=>{$('#status').textContent=t};
 function store(remember=true){
  const rect=sections[current].getBoundingClientRect();
  const relative=Math.min(1,Math.max(0,(110-rect.top)/Math.max(1,rect.height-150)));
  const base={...saved,font,night};
  if(remember&&$('#reader').getBoundingClientRect().top<130){base.index=current;base.relative=relative;base.mode=mode;base.time=Date.now();}
  saved=base;try{localStorage.setItem(key,JSON.stringify(base))}catch{}
 }
 function active(){
  $$('[data-chapter]').forEach(b=>{if(b.classList.contains('chapter-link'))b.setAttribute('aria-current',String(Number(b.dataset.chapter)===current))});
  $('#progress-text').textContent=`第${current+1}章 / 共8章`;
  $('#mobile-current').textContent=`· 第${current+1}章 / 共8章`;
 }
 function render(){sections.forEach((s,i)=>s.hidden=mode==='chapter'&&i!==current);document.body.classList.toggle('continuous',mode==='full');$('#chapter-mode').setAttribute('aria-pressed',String(mode==='chapter'));$('#full-mode').setAttribute('aria-pressed',String(mode==='full'));active()}
 function go(index,scroll=true){
  if(!Number.isInteger(index)||index<0||index>7)return;
  current=index;render();const toc=$('.mobile-toc');if(toc)toc.open=false;
  if(scroll)requestAnimationFrame(()=>{sections[index].scrollIntoView({block:'start',behavior:'instant'});update()});
 }
 function update(){
  if(mode==='full'){
   const found=sections.filter(s=>s.getBoundingClientRect().top<=155).at(-1);if(found){const next=Number(found.dataset.index);if(current!==next){current=next;active()}}
  }
  const rect=sections[current].getBoundingClientRect();let portion=Math.min(1,Math.max(0,(140-rect.top)/Math.max(1,rect.height-170)));
  if(rect.bottom<window.innerHeight-40)portion=1;
  const before=weights.slice(0,current).reduce((a,b)=>a+b,0),pct=Math.min(100,Math.max(0,100*(before+weights[current]*portion)/total));
  $('#progress').style.width=pct+'%';store(true);
 }
 document.addEventListener('click',event=>{
  const chapter=event.target.closest('[data-chapter]');if(chapter){go(Number(chapter.dataset.chapter));return}
 });
 $('#start-reading').onclick=()=>go(0);
 if(Number.isInteger(saved.index)&&saved.index>=0&&saved.index<8){const resume=$('#resume-reading');resume.classList.add('visible');resume.textContent=`继续第${saved.index+1}章 →`;resume.onclick=()=>{const idx=saved.index,relative=saved.relative||0;mode=saved.mode==='full'?'full':'chapter';go(idx,false);requestAnimationFrame(()=>{const r=sections[idx].getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top-110+relative*Math.max(1,r.height-150),behavior:'instant'});update()})}}
 $('#chapter-mode').onclick=()=>{mode='chapter';go(current)};
 $('#full-mode').onclick=()=>{mode='full';go(current)};
 function setFont(change){font=Math.min(27,Math.max(18,font+change));document.documentElement.style.setProperty('--reader-size',font+'px');$('#font-down').disabled=font<=18;$('#font-up').disabled=font>=27;store(false)}
 $('#font-down').onclick=()=>setFont(-1);$('#font-up').onclick=()=>setFont(1);setFont(0);
 function setTheme(){document.body.classList.toggle('theme-night',night);$('#theme').setAttribute('aria-pressed',String(night));$('#theme').textContent=night?'日读':'夜读';$('#theme').setAttribute('aria-label',night?'切换日间阅读':'切换夜间阅读');store(false)}
 $('#theme').onclick=()=>{night=!night;setTheme()};setTheme();
 $('#share-story').onclick=async()=>{
  const title='我在那加我能力者的里面，凡事都能作｜黄弟兄见证';
  const text='“现在我是摸着基督过生活。”\n'+title+'\n'+location.href.split('#')[0];
  try{if(navigator.share){await navigator.share({title,text,url:location.href.split('#')[0]});notify('已打开系统分享。')}else{await navigator.clipboard.writeText(text);notify('已复制见证与链接。')}}catch(e){if(e.name!=='AbortError')notify('可选中原文摘句，复制给需要的朋友。')}
 };
 window.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(update,160)},{passive:true});window.addEventListener('pagehide',()=>store(true));
 document.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();go(current+1)}if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();go(current-1)}});
 render();
})();
