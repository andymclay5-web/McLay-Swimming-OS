'use strict';
// 23 Nov 2026 (Andy at the pool: "whenever ... I go from corner of the board to the full board, it restarts the video.
// We want it to just carry on playing" / "some function to fast forward, rewind the actual clip"). Real tv.html. Proves:
//  - a clip moved corner -> full screen -> corner carries on from where it was, it does not start again;
//  - the coach's back 10s / forward 10s / pause-play reach the clip, each tap acting once.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const errors=[];try{
  const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));
  const cur={o:null,orev:0};
  const base={tvv:'',mode:'whole',session:{title:'Mon AM · National',distance:4000},blocks:[{id:'wu',code:'WU',title:'Warm-up',distance:400,rows:[{k:'set',id:'w1',work:'400 Free',cue:''}]}]};
  await p.route(/\/rest\/v1\/rpc\//,r=>{const n=r.request().url().split('/rpc/')[1];if(n==='msos_tv_pair_request')return r.fulfill({json:{status:'paired',label:'Pool TV'}});return r.fulfill({json:{status:'frame',rev:1,frame:base,slot:true,orev:cur.orev,overlay:cur.o}});});
  await p.routeWebSocket(/realtime/,()=>{});
  await p.goto(BASE+'tv.html');await p.waitForFunction(()=>window.MSOS_TV?.draw,{timeout:10000});
  // a blob link (the test server can't serve part of a file, so the browser couldn't skip within it; the cloud can)
  const clipUrl=await p.evaluate(async u=>URL.createObjectURL(await (await fetch(u)).blob()),BASE+'tests/fixtures-rot90.mp4');
  const ov=(mode,ctl)=>({id:'ov1',kind:'video',mode,url:clipUrl,label:'Matthew · video',ctl});
  const draw=(mode,ctl)=>{cur.o=ov(mode,ctl);cur.orev++;return p.evaluate(({f,o})=>window.MSOS_TV.draw({...f,overlay:o}),{f:base,o:cur.o});};
  const vid=()=>p.evaluate(()=>{const v=window.MSOS_TV.mirror&&!window.MSOS_TV.mirror.stop?window.MSOS_TV.mirror.video:document.querySelector('#tvOverlay .tvo-frame video');return v?{t:v.currentTime,paused:v.paused,dur:v.duration,full:document.querySelector('#tvOverlay').classList.contains('tvo-full')}:null});
  await draw('corner');await p.waitForFunction(()=>{const m=window.MSOS_TV.mirror;return m&&m.video&&m.video.currentTime>0.6},null,{timeout:15000});
  await p.evaluate(()=>{const v=window.MSOS_TV.mirror.video;v.pause();v.currentTime=1.2});await p.waitForTimeout(200);
  await draw('full');await p.waitForFunction(()=>{const v=document.querySelector('#tvOverlay .tvo-frame video');return v&&v.readyState>=1},null,{timeout:10000});await p.waitForTimeout(600);
  const afterFull=await vid();assert.equal(afterFull.full,true);assert.ok(afterFull.t>=1.0,'full screen carries on from 1.2s, not from the start: '+JSON.stringify(afterFull));
  await p.evaluate(()=>{const v=document.querySelector('#tvOverlay .tvo-frame video');v.pause();v.currentTime=0.5});await p.waitForTimeout(200);
  await draw('full',{n:1,cmd:'fwd'});await p.waitForTimeout(300);const fwd=await vid();assert.ok(fwd.t>=Math.min(fwd.dur-0.3,1.5),'forward 10s (clamped to the clip): '+JSON.stringify(fwd));
  await draw('full',{n:1,cmd:'fwd'});await p.waitForTimeout(200);const again=await vid();assert.ok(Math.abs(again.t-fwd.t)<0.05,'the same tap acts once');
  await draw('full',{n:2,cmd:'back'});await p.waitForTimeout(300);const back=await vid();assert.ok(back.t<0.2,'back 10s: '+JSON.stringify(back));
  await p.evaluate(()=>document.querySelector('#tvOverlay .tvo-frame video').play());await p.waitForTimeout(300);
  await draw('full',{n:3,cmd:'toggle'});await p.waitForTimeout(200);assert.equal((await vid()).paused,true,'pause');
  await p.evaluate(()=>{const v=document.querySelector('#tvOverlay .tvo-frame video');v.currentTime=1.1});await p.waitForTimeout(200);
  await draw('corner',{n:3,cmd:'toggle'});await p.waitForFunction(()=>{const m=window.MSOS_TV.mirror;return m&&!m.stop&&m.video.readyState>=1},null,{timeout:10000});await p.waitForTimeout(600);
  const backCorner=await vid();assert.equal(backCorner.full,false);assert.ok(backCorner.t>=0.9,'back to the corner carries on too: '+JSON.stringify(backCorner));
  // YouTube: the same player stays when it changes size (it isn't loaded again), and skip goes to the player
  await p.route(/youtube\.com\/embed/,r=>r.fulfill({contentType:'text/html',body:'<html><body>yt<script>addEventListener("message",e=>parent.postMessage({echo:e.data},"*"))</script></body></html>'}));
  const yt=(mode,ctl)=>{cur.o={id:'ov2',kind:'youtube',mode,url:'https://www.youtube.com/watch?v=abcdefghijk',youtube:'abcdefghijk',label:'YouTube',ctl};cur.orev++;return p.evaluate(({f,o})=>window.MSOS_TV.draw({...f,overlay:o}),{f:base,o:cur.o});};
  await yt('corner');await p.waitForSelector('#tvOverlay iframe');await p.evaluate(()=>{document.querySelector('#tvOverlay iframe').dataset.same='1'});
  await yt('full');await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>document.querySelector('#tvOverlay iframe')?.dataset.same),'1','the YouTube player is kept, not restarted');
  assert.equal(await p.evaluate(()=>document.querySelector('#tvOverlay').classList.contains('tvo-full')),true);
  await p.evaluate(()=>{window.__cmds=[];addEventListener('message',e=>{if(e.data&&e.data.echo)window.__cmds.push(e.data.echo)});window.MSOS_TV.yt.t=42;window.MSOS_TV.yt.state=1;});
  await yt('full',{n:1,cmd:'back'});await yt('full',{n:2,cmd:'toggle'});await p.waitForTimeout(500);
  const cmds=await p.evaluate(()=>window.__cmds.map(x=>{try{return JSON.parse(x)}catch{return{}}}).filter(x=>x.event==='command').map(x=>[x.func,x.args]));
  assert.deepEqual(cmds,[['seekTo',[32,true]],['pauseVideo',[]]],'YouTube gets back 10s then pause: '+JSON.stringify(cmds));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_VIDEO_CARRIES_ON_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
