'use strict';
// Andy, Tue 17 Nov 2026: "I like the idea of having the captures all in one place like it is on the roll, but it does make
// the roll too long when you're trying to take it. So the roll needs to be for marking off attendance ... they need to be
// listed on the actual swimmers page ... and then when we take videos and captures, we're sort of drawn back to it."
// (Replaces roll-shows-working-on-20261116.cjs, the 16 Nov version that put the focus on the Roll.) Proves:
//  1. The Roll is attendance only -- no focus notes under the swimmers.
//  2. Capture with Matthew picked shows what he is working on (Free kick -- kick from the hips, "Knees bending a lot");
//     tapping it starts the note with that focus, so the new clip files under the same work.
//  3. Pick two swimmers, or one with nothing noted, and the strip is not there.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const YESTERDAY=`WARM-UP\n400 Free\n\nMAIN SET\n4 x 100 Free kick 15 sr\n8 x 50 kick build @1.10`;
const TODAY=`WARM-UP\n400 Free\n\nMAIN SET\n10 x 100 Free @1.30`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElements?.focusCards&&window.MSOS4?.captureUI,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(({Y,T,yday,today})=>{const M=window.MSOS4;const mc={id:'athlete-matthew-callow',full_name:'Matthew Callow',squad:'Development',active:true},aw={id:'athlete-awatea',full_name:'Awatea Calman',squad:'Development',active:true};M.state.athletes=[mc,aw];
    const y=M.parser.parse(Y,{date:yday,dayPart:'PM',squads:['Development'],course:'SCM'});y.id='session-yday';M.store.putSession(M.state,y);
    const main=y.blocks.find(x=>x.type==='main_set');
    M.state.captures=[{id:'cap-knees',session_id:y.id,athlete_id:mc.id,athlete_ids:[mc.id],capture_type:'video',title:'Free kick',text_content:'Free kick',capture_note:'Knees bending a lot',block_id:main.id,created_at:new Date(Date.now()-864e5).toISOString(),audience:'shared',from_cloud:true}];
    const t=M.parser.parse(T,{date:today,dayPart:'AM',squads:['Development'],course:'SCM'});t.id='session-today';M.store.putSession(M.state,t);
    M.state.attendance=[{session_id:y.id,athlete_id:mc.id,status:'present'},{session_id:y.id,athlete_id:aw.id,status:'present'},{session_id:t.id,athlete_id:mc.id,status:'present'},{session_id:t.id,athlete_id:aw.id,status:'present'}];
    M.store.save(M.state);M.nav.show('roll');},{Y:YESTERDAY,T:TODAY,yday:daysAgo(1),today:daysAgo(0)});
  // 1. the Roll is for attendance
  await p.waitForFunction(()=>/Roll ·/.test(document.querySelector('#rollView')?.innerText||''),{timeout:10000});
  const roll=await p.evaluate(()=>document.querySelector('#rollView').innerText);
  assert.doesNotMatch(roll,/kick from the hips|Knees bending|something to work on/,roll);
  // 2. capture with Matthew: drawn back to what he is working on
  await p.evaluate(()=>{const M=window.MSOS4;M.nav.show('board');M.actions.openCapture({athleteIds:['athlete-matthew-callow']});});
  await p.waitForSelector('#modalHost .modal [data-capture-athlete]',{timeout:10000});
  await p.evaluate(()=>{for(const i of document.querySelectorAll('#modalHost [data-capture-athlete]')){const want=i.dataset.captureAthlete==='athlete-matthew-callow';if(i.checked!==want){i.checked=want;i.dispatchEvent(new Event('change',{bubbles:true}));}}});
  await p.waitForSelector('#modalHost [data-capture-focus]',{timeout:5000});
  const strip=await p.evaluate(()=>document.querySelector('#modalHost [data-capture-focus]').innerText);if(process.env.SHOT)await p.screenshot({path:process.env.SHOT});
  assert.match(strip,/🎯 Matthew is working on/,strip);assert.match(strip,/free kick — kick from the hips, not the knees/i,strip);assert.match(strip,/“Knees bending a lot”/,strip);
  await p.click('#modalHost [data-capture-focus-pick="0"]');
  assert.match(await p.inputValue('#modalHost #captureText'),/^free kick — kick from the hips, not the knees: /i);
  // 3. two swimmers picked: no single focus to show
  await p.evaluate(()=>{const i=document.querySelector('#modalHost [data-capture-athlete="athlete-awatea"]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForFunction(()=>!document.querySelector('#modalHost [data-capture-focus]'),{timeout:5000});
  //    ... and Awatea alone has nothing noted
  await p.evaluate(()=>{const i=document.querySelector('#modalHost [data-capture-athlete="athlete-matthew-callow"]');i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>!!document.querySelector('#modalHost [data-capture-focus]')),false);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CAPTURE_DRAWS_TO_FOCUS_PASS');console.log(strip);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
