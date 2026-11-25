'use strict';
// 25 Nov 2026 (Andy, T400 tonight: "you set it up the whole lot doing a certain stroke, but I'd like it to be set up as
// freestyle, but have the option to change the strokes for individuals quite easily"). Proves on the Times page:
//  - everyone starts on Freestyle; one tap on a swimmer's stroke box switches just that swimmer;
//  - the clock shows each swimmer's stroke, and the saved tests are each swimmer's own stroke, dated the session's date;
//  - a mis-tapped finish can be undone;
//  - switching a swimmer back to Free uses the page's stroke again.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.timing?.t400StrokeFor,{timeout:30000});await p.waitForTimeout(800);
  const setup=()=>p.evaluate(()=>{const M=window.MSOS4;
    const s=M.parser.parse('MAIN SET\n400 T400',{date:'2026-11-25',dayPart:'PM',squads:['National'],course:'SCM'});s.id='t4-sess';M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
    M.state.athletes=[['a','Amy'],['bo','Bo'],['cy','Cy']].map(([id,n])=>({id,full_name:n+' Test',squad:'National',active:true}));
    M.state.attendance=M.state.athletes.map(a=>({session_id:s.id,athlete_id:a.id,status:'present'}));M.state.trainingTestResults=[];
    M.state.settings.t400Stroke='Freestyle';M.state.settings.t400Live=null;M.state.settings.v4TimingMode='t400';M.nav.show('times');M.ui.renderCurrent();});
  for(let k=0;k<3;k++){try{await setup();break}catch(e){if(!/context was destroyed|navigation/i.test(String(e.message)))throw e;await p.waitForFunction(()=>window.MSOS4?.timing?.t400StrokeFor,{timeout:30000});await p.waitForTimeout(1500)}}
  await p.waitForSelector('[data-v4-t400-own="bo"]',{timeout:8000});
  assert.deepEqual(await p.$$eval('[data-v4-t400-own]',s=>s.map(x=>x.value)),['Freestyle','Freestyle','Freestyle'],'everyone starts on Free');
  await p.selectOption('[data-v4-t400-own="bo"]','IM');
  await p.waitForFunction(()=>document.querySelector('[data-v4-t400-own="bo"]')?.value==='IM');
  assert.equal(await p.$eval('[data-v4-t400-own="a"]',x=>x.value),'Freestyle','only Bo changed');
  await p.click('#v4LoadT400');await p.waitForSelector('#v4StartT400');
  // change Cy after the clock is loaded: still easy
  await p.selectOption('[data-v4-t400-own="cy"]','Backstroke');await p.waitForFunction(()=>/Back/.test(document.querySelector('[data-v4-t400-finish="cy"]')?.textContent||''));
  assert.match(await p.textContent('.v4-t400-live .eyebrow'),/Mixed strokes/);
  await p.click('#v4StartT400');
  // the stopwatch runs on real time: move its start back 5 minutes
  await p.evaluate(()=>{window.MSOS4.correct.t400Live.start_epoch-=300000;});
  await p.click('[data-v4-t400-finish="a"]');await p.waitForSelector('[data-v4-t400-finish="a"].complete');
  await p.click('[data-v4-t400-finish="cy"]');await p.waitForSelector('[data-v4-t400-finish="cy"].complete');
  await p.click('#v4UndoT400');await p.waitForSelector('[data-v4-t400-finish="cy"]:not(.complete)');
  assert.ok(await p.$('[data-v4-t400-finish="a"].complete'),'undo only takes back the last tap');
  await p.click('[data-v4-t400-finish="bo"]');await p.click('[data-v4-t400-finish="cy"]');
  await p.waitForFunction(()=>(window.MSOS4.state.trainingTestResults||[]).length===3,null,{timeout:5000});
  const rows=await p.evaluate(()=>window.MSOS4.state.trainingTestResults.map(r=>({id:r.athlete_id,stroke:r.stroke,date:r.result_date,sec:r.result_seconds,course:r.pool_course,type:(window.MSOS4.state.trainingTestTypes||[]).find(t=>t.id===r.test_type_id)?.test_key})));
  const by=Object.fromEntries(rows.map(r=>[r.id,r]));
  assert.equal(by.a.stroke,'Freestyle');assert.equal(by.bo.stroke,'IM');assert.equal(by.cy.stroke,'Backstroke');
  assert.match(by.bo.type,/t400_im/);assert.match(by.a.type,/t400.*free/);
  for(const r of rows){assert.equal(r.date,'2026-11-25','dated the session date: '+JSON.stringify(r));assert.ok(r.sec>290&&r.sec<330,'about 5 minutes: '+r.sec);assert.equal(r.course,'SCM')}
  // the roster now shows each swimmer's new T400 in their own stroke
  await p.waitForSelector('[data-v4-t400-own="bo"]');
  const shown=await p.$$eval('.v4-timing-roster .time-row',rs=>rs.map(r=>r.innerText.replace(/\s+/g,' ')));
  assert.ok(shown.every(t=>!/No T400/.test(t)),'each anchor found in their own stroke: '+JSON.stringify(shown));
  // back to Free -> follows the page again
  await p.selectOption('[data-v4-t400-own="bo"]','Freestyle');
  assert.equal(await p.evaluate(()=>window.MSOS4.timing.t400StrokeFor(window.MSOS4.state,window.MSOS4.currentSession(),'bo','Breaststroke')),'Breaststroke');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('T400_OWN_STROKE_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
