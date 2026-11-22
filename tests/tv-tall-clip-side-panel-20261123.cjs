'use strict';
// 23 Nov 2026 (Andy: a capture of Matthew "wouldn't show on corner, just switched to full screen (it did show correctly
// there)"). The pool TV can't hand its video frames to the corner picture. Real tv.html, with a browser made to behave
// like that TV (pictures drawn from video come out black). Proves:
//  - a tall phone clip then plays as a panel down the right-hand side with the TV's own player, not full screen, and the
//    Board moves left to make room;
//  - the TV remembers, so the next clip goes straight to the side panel without the wait;
//  - the coach's phone is told where it went.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const errors=[];try{
  const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const d=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(src,...a){if(src instanceof HTMLVideoElement){this.fillStyle='#000';this.fillRect(0,0,this.canvas.width,this.canvas.height);return;}return d.call(this,src,...a)};});
  const cur={o:null,orev:0};
  const base={tvv:'',mode:'whole',session:{title:'Mon AM · National',distance:4000},blocks:[{id:'wu',code:'WU',title:'Warm-up',distance:400,rows:[{k:'set',id:'w1',work:'400 Free',cue:''}]}]};
  await p.route(/\/rest\/v1\/rpc\//,r=>{const n=r.request().url().split('/rpc/')[1];if(n==='msos_tv_pair_request')return r.fulfill({json:{status:'paired',label:'Pool TV'}});return r.fulfill({json:{status:'frame',rev:1,frame:base,slot:true,orev:cur.orev,overlay:cur.o}});});
  await p.routeWebSocket(/realtime/,()=>{});
  await p.goto(BASE+'tv.html');await p.waitForFunction(()=>window.MSOS_TV?.draw,{timeout:10000});
  const clipUrl=await p.evaluate(async u=>URL.createObjectURL(await (await fetch(u)).blob()),BASE+'tests/fixtures-rot90.mp4');
  const draw=(id)=>{cur.o={id,kind:'video',mode:'corner',url:clipUrl,label:'Matthew · video'};cur.orev++;return p.evaluate(({f,o})=>window.MSOS_TV.draw({...f,overlay:o}),{f:base,o:cur.o});};
  const look=()=>p.evaluate(()=>{const o=document.querySelector('#tvOverlay'),v=o.querySelector('.tvo-frame video'),r=o.getBoundingClientRect(),root=document.querySelector('#tv').getBoundingClientRect();return{cls:o.className,body:document.body.className,video:!!v,canvas:!!o.querySelector('canvas'),w:Math.round(r.width),h:Math.round(r.height),rootRight:Math.round(root.right),left:Math.round(r.left),remembered:localStorage.getItem('msos-tv-nomirror')}});
  await draw('c1');
  await p.waitForFunction(()=>document.querySelector('#tvOverlay').classList.contains('tvo-tall')&&document.querySelector('#tvOverlay .tvo-frame video'),null,{timeout:20000});await p.waitForTimeout(500);
  const first=await look();
  assert.match(first.cls,/tvo-corner/,'still the corner, not full screen: '+JSON.stringify(first));assert.match(first.cls,/tvo-tall/);assert.doesNotMatch(first.cls,/tvo-full/);
  assert.ok(first.h>first.w*1.4,'a tall panel down the side: '+JSON.stringify(first));assert.ok(first.h>600,'nearly the full height');
  assert.match(first.body,/tv-has-tall/);assert.ok(first.rootRight<=first.left+2,'the Board moved left to make room: '+JSON.stringify(first));
  assert.equal(first.remembered,'1');
  const reps=await p.evaluate(()=>window.MSOS_TV.reports||[]);assert.ok(reps.some(([st,d])=>st==='moved'&&/down the side/.test(d)),'the phone is told: '+JSON.stringify(reps));
  await draw('c2');await p.waitForTimeout(400);const second=await look();
  assert.match(second.cls,/tvo-tall/,'the next clip goes straight to the side panel: '+JSON.stringify(second));assert.equal(second.canvas,false,'no corner picture attempt');
  cur.o=null;cur.orev++;await p.evaluate(({f})=>window.MSOS_TV.draw({...f,overlay:null}),{f:base});await p.waitForTimeout(200);
  assert.doesNotMatch((await look()).body,/tv-has-tall/,'taking it off gives the Board its room back');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_TALL_CLIP_SIDE_PANEL_PASS',JSON.stringify({w:first.w,h:first.h}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
