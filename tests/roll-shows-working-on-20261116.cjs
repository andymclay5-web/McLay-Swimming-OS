'use strict';
// Andy, Mon 16 Nov 2026: "I noticed Matthew Callow's freestyle kick, his knees were bending a lot. I should be able to take
// the capture, add the thing I've noticed, and then have another coach be able to pick that up and work on it in the next
// session, because it's blatantly sitting there for them."
// Proves: a capture + note from yesterday's session shows on the NEXT session's Roll, under Matthew's name, in the coach's
// words, with the clip one tap away -- and a swimmer with nothing noted shows nothing extra.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const YESTERDAY=`WARM-UP\n400 Free\n\nMAIN SET\n4 x 100 Free kick 15 sr\n8 x 50 kick build @1.10`;
const TODAY=`WARM-UP\n400 Free\n\nMAIN SET\n10 x 100 Free @1.30`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElementsUI?.rollFocusHtml,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(({Y,T,yday,today})=>{const M=window.MSOS4;const mc={id:'athlete-matthew-callow',full_name:'Matthew Callow',squad:'Development',active:true},aw={id:'athlete-awatea',full_name:'Awatea Calman',squad:'Development',active:true};M.state.athletes=[mc,aw];
    const y=M.parser.parse(Y,{date:yday,dayPart:'PM',squads:['Development'],course:'SCM'});y.id='session-yday';M.store.putSession(M.state,y);
    const main=y.blocks.find(x=>x.type==='main_set');
    M.state.attendance=[{session_id:y.id,athlete_id:mc.id,status:'present'},{session_id:y.id,athlete_id:aw.id,status:'present'}];
    M.state.captures=[{id:'cap-knees',session_id:y.id,athlete_id:mc.id,athlete_ids:[mc.id],capture_type:'video',title:'Free kick',text_content:'Free kick',capture_note:'Knees bending a lot',block_id:main.id,created_at:new Date(Date.now()-864e5).toISOString(),audience:'shared',from_cloud:true}];
    const t=M.parser.parse(T,{date:today,dayPart:'AM',squads:['Development'],course:'SCM'});t.id='session-today';M.store.putSession(M.state,t);
    M.store.save(M.state);M.nav.show('roll');},{Y:YESTERDAY,T:TODAY,yday:daysAgo(1),today:daysAgo(0)});
  await p.waitForSelector('#rollView [data-re-roll-focus]',{timeout:10000});
  const roll=await p.evaluate(()=>document.querySelector('#rollView').innerText);if(process.env.SHOT)await p.screenshot({path:process.env.SHOT});
  assert.match(roll,/Roll ·/);assert.match(roll,/1 swimmer has something to work on/,roll);
  const mine=await p.evaluate(()=>document.querySelector('[data-re-roll-focus="athlete-matthew-callow"]')?.innerText||'');
  assert.match(mine,/Free kick — kick from the hips, not the knees/,mine);assert.match(mine,/“Knees bending a lot”/,mine);
  assert.equal(await p.evaluate(()=>document.querySelector('[data-re-roll-focus="athlete-matthew-callow"] [data-msos-capture]')?.dataset.msosCapture),'cap-knees');
  assert.equal(await p.evaluate(()=>!!document.querySelector('[data-re-roll-focus="athlete-awatea"]')),false,'nothing noted on Awatea, nothing shown');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('ROLL_SHOWS_WORKING_ON_PASS');console.log(mine);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
