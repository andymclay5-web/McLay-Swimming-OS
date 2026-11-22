'use strict';
// 22 Nov 2026 (freeze recorder, Andy's phone, Sun 19:57: one Board frame spent 2.7s in the target-card job's step,
// with no single card slow): every set's target job ran its own step each frame, so several sets at once added up in
// one frame. Proves the cards from several sets share one frame budget: with 6 sets x 10 swimmers and every card made
// slow (20ms), no frame runs more than ~3 cards' worth, and every set still finishes.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland',serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.boardStateEngine?.fillPanel,{timeout:30000});await p.waitForTimeout(800);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,S=M.boardStateEngine;
    const s=M.parser.parse('MAIN SET\n'+[1,2,3,4,5,6].map(n=>`${n+3} x 100 Free Threshold 20s rest`).join('\n'),{date:new Date().toISOString().slice(0,10),dayPart:'PM',squads:['National']});s.id='pump-sess';M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
    const ath=[];for(let i=0;i<10;i++)ath.push({id:'p'+i,full_name:'Pump '+i,squad:'National',active:true,sex:'M'});M.state.athletes=ath;M.state.attendance=ath.map(a=>({session_id:s.id,athlete_id:a.id,status:'present'}));
    const C=window.MSOSEngines?.Coordinator||M.coordinator;const orig=C?.prescription;if(orig)C.prescription=(...a)=>{const t=performance.now();while(performance.now()-t<20){}return orig.apply(C,a)};
    const items=[];for(const bl of s.blocks)for(const it of bl.items||[])if(it.kind==='set'||it.reps)items.push(it);
    const frames=[];let last=performance.now(),run=true;const tick=()=>{const t=performance.now();frames.push(t-last);last=t;if(run)requestAnimationFrame(tick)};requestAnimationFrame(tick);
    const panels=items.map(it=>{const d=document.createElement('div');d.innerHTML='<div data-msos-target-matrix></div>';return d});
    const t0=performance.now();items.forEach((it,i)=>S.fillPanel(panels[i],s,it));
    await new Promise(res=>setTimeout(res,2500));run=false;if(orig)C.prescription=orig;
    return{items:items.length,slowed:!!orig,maxFrame:Math.round(Math.max(...frames.slice(1))),frames:frames.length,lastTiming:S.lastTargetTiming?{status:S.lastTargetTiming.status,cards:S.lastTargetTiming.cards}:null}});
  assert.ok(r.slowed,'the coordinator was slowed for the test');assert.equal(r.items,6);
  assert.ok(r.lastTiming&&r.lastTiming.status==='done'&&r.lastTiming.cards===10,'sets finish: '+JSON.stringify(r));
  assert.ok(r.maxFrame<80,'no frame carries several sets\' cards at once: longest frame '+r.maxFrame+'ms');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('BOARD_TARGET_JOBS_SHARE_FRAME_PASS longest frame',r.maxFrame+'ms');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
