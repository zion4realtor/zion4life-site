import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateVideos, rotationTickets } from '../static/js/video-rotation.js';
const now = Date.parse('2026-10-19T12:00:00Z');
const films = Array.from({length:10},(_,i)=>({slug:`film-${i}`,published:i===0?'2026-10-19':'2020-01-01'}));
test('new releases receive up to four tickets; old and undated films keep one',()=>{
 assert.equal(rotationTickets('2026-10-19',now),4);
 assert.equal(rotationTickets('2020-01-01',now),1);
 assert.equal(rotationTickets('',now),1);
});
test('finite ticket rotation reaches every old film even with adversarial random draws',()=>{
 let state={},seen=new Set();
 for(let i=0;i<4;i++){
  const result=rotateVideos(films,state,now,()=>0);state=result.state;
  assert.equal(new Set(result.slugs).size,4);
  result.slugs.forEach(s=>seen.add(s));
 }
 assert.equal(seen.size,10);
});
test('new films receive more appearances over repeated rounds, while all older films appear',()=>{
 let seed=17,state={},counts=Object.fromEntries(films.map(v=>[v.slug,0]));
 const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(let i=0;i<500;i++) { const r=rotateVideos(films,state,now,random);state=r.state;r.slugs.forEach(s=>counts[s]++); }
 assert.ok(counts['film-0'] > counts['film-1']*2);
 assert.ok(Object.values(counts).every(n=>n>0));
});
test('library changes, short libraries and damaged saved state are safe',()=>{
 let r=rotateVideos(films.slice(0,2),{},now);assert.equal(r.slugs.length,2);
 r=rotateVideos([films[2]],r.state,now);assert.deepEqual(r.slugs,['film-2']);
 assert.deepEqual(rotateVideos([],r.state,now).slugs,[]);
 assert.equal(rotateVideos(films,{known:'bad',remaining:{'film-0':-8}},now).slugs.length,4);
});
