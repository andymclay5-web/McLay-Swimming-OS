'use strict';
// 22 Nov 2026: the learning loop. Andy isn't timing sets until voice capture works ("what we have with ability to add
// soon"), so the Watch list (engines/watch-list.js, Coach Hub) reads what MSOS holds. Proves:
//  - the same thing noted about a swimmer 3 times over 2+ sessions shows, with those notes and a suggestion;
//    twice doesn't, and a whole-group note isn't pinned on one swimmer;
//  - key work the squad keeps doing that a training swimmer keeps missing shows, with the sessions behind it;
//  - the last two swims of an event both slower than the best before them shows, with the races;
//  - Dismiss hides it and keeps it hidden until something newer turns up; Open goes to the swimmer;
//  - reading it changes no coaching state.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.watchList&&window.MSOS4?.raceElements?.slotProfile,{timeout:30000});
  const before=await p.evaluate(()=>{const M=window.MSOS4,day=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
    M.state.athletes=[{id:'luke',full_name:'Luke Thompson',squad:'National',active:true,sex:'M'},{id:'ash',full_name:'Ashley Brown',squad:'National',active:true,sex:'F'},{id:'cor',full_name:'Coral Sturla',squad:'National',active:true,sex:'F'}];
    M.state.attendance=[];M.state.captures=[];M.state.resultsEventHistory=[];M.state.coachResults=[];M.state.watchDismissed={};
    const mk=(id,n,txt)=>{const s=M.parser.parse(txt,{date:day(n),dayPart:'PM',squads:['National']});s.id=id;M.store.putSession(M.state,s);return s};
    // 4 race-pace sessions; Ashley at 1 of them but at 3 aerobic ones (she trains, she misses race pace)
    const rp=[mk('rp1',3,'MAIN SET\n8 x 50 #1 @100p @1:30'),mk('rp2',10,'MAIN SET\n8 x 50 #1 @100p @1:30'),mk('rp3',17,'MAIN SET\n8 x 50 #1 @200p @1:30'),mk('rp4',24,'MAIN SET\n6 x 75 @200p @1:45')];
    const ae=[mk('ae1',5,'MAIN SET\n10 x 100 Free Development 15s rest'),mk('ae2',12,'MAIN SET\n10 x 100 Free Development 15s rest'),mk('ae3',19,'MAIN SET\n10 x 100 Free Development 15s rest')];
    const here=(sid,aid)=>M.state.attendance.push({session_id:sid,athlete_id:aid,status:'present'});
    for(const s of[...rp,...ae])here(s.id,'luke'),here(s.id,'cor');here('rp1','ash');for(const s of ae)here(s.id,'ash');
    // notes: Luke's breakout 3 times over 3 sessions; Coral's turns twice only; one whole-group breakout note
    const cap=(id,sid,ids,t)=>M.state.captures.push({id,session_id:sid,athlete_ids:ids,capture_type:'text',text_content:t,created_at:new Date().toISOString()});
    cap('c1','rp1',['luke'],'Breakout too early, popping up');cap('c2','ae1',['luke'],'Breakout still short off the wall');cap('c3','rp2',['luke'],'breakout better but rushed');
    cap('c4','rp1',['cor'],'Turns slow');cap('c5','ae2',['cor'],'Turns better');cap('c6','rp3',[],'Everyone: breakout before the flags');
    // races: Coral's last two 100 Free both slower than her best
    const race=(aid,n,sec)=>M.state.resultsEventHistory.push({athlete_id:aid,result_date:day(n),distance:100,stroke:'Freestyle',course:'SCM',result_time_seconds:sec,meet_name:'Test meet'});
    race('cor',60,65.0);race('cor',30,66.1);race('cor',8,65.6);race('luke',40,55.0);race('luke',9,54.2);
    M.state.settings.view='board';M.store.save(M.state);
    return{view:M.state.settings.view,sel:M.state.settings.selectedSessionId,att:M.state.attendance.length,caps:M.state.captures.length}});
  const rows=await p.evaluate(()=>window.MSOS4.watchList.compute().map(r=>({who:r.athlete.id,sig:r.signals.map(s=>({kind:s.kind,id:s.id,title:s.title,ev:s.evidence,sug:s.suggestion}))})));
  const by=Object.fromEntries(rows.map(r=>[r.who,r.sig]));
  const lukeNote=(by.luke||[]).find(s=>s.kind==='notes');assert.ok(lukeNote,'Luke breakout pattern: '+JSON.stringify(rows));
  assert.match(lukeNote.title,/Breakouts noted 3 times/);assert.equal(lukeNote.ev.length,3);assert.match(lukeNote.ev.join('|'),/popping up/);assert.match(lukeNote.sug,/Make breakouts a focus for Luke/);
  assert.ok(!(by.cor||[]).some(s=>s.kind==='notes'),'twice is not a pattern; a whole-group note is not one swimmer\'s');
  const ashEx=(by.ash||[]).find(s=>s.kind==='exposure');assert.ok(ashEx,'Ashley misses race pace: '+JSON.stringify(by.ash));assert.match(ashEx.title,/Race pace.*at 1 of the squad's 4 sessions/);
  assert.ok(!(by.luke||[]).some(s=>s.kind==='exposure'),'Luke was at it');
  const corRace=(by.cor||[]).find(s=>s.kind==='races');assert.ok(corRace,'Coral last two 100 Free slower: '+JSON.stringify(by.cor));assert.match(corRace.title,/100 Freestyle SCM: last 2 swims slower than best/);assert.match(corRace.ev[0],/1:05\.60 \(\+0\.60/);
  assert.ok(!(by.luke||[]).some(s=>s.kind==='races'),'Luke went faster');
  // Coach Hub › Watch list
  await p.evaluate(()=>{window.MSOS4.nav.show('hub');});await p.waitForSelector('[data-hub-panel="watch"]',{timeout:5000});await p.click('[data-hub-panel="watch"]');
  await p.waitForSelector('[data-wl-athlete="luke"] [data-wl-signal]',{timeout:5000});
  assert.match(await p.locator('[data-wl-athlete="luke"]').innerText(),/Breakouts noted 3 times/);
  await p.click(`[data-wl-dismiss="${lukeNote.id}"]`);await p.waitForTimeout(200);
  assert.equal(await p.locator(`[data-wl-signal="${lukeNote.id}"]`).count(),0,'dismissed');
  let again=await p.evaluate(id=>window.MSOS4.watchList.compute().some(r=>r.signals.some(s=>s.id===id)),lukeNote.id);assert.equal(again,false,'stays dismissed');
  // a newer note brings it back
  await p.evaluate(()=>{const M=window.MSOS4,s=M.parser.parse('MAIN SET\n4 x 50 Free',{date:new Date(Date.now()+864e5).toISOString().slice(0,10),dayPart:'AM',squads:['National']});s.id='next';M.store.putSession(M.state,s);M.state.captures.push({id:'c7',session_id:'next',athlete_ids:['luke'],capture_type:'text',text_content:'breakout early again',created_at:new Date().toISOString()});M.store.save(M.state)});
  again=await p.evaluate(id=>window.MSOS4.watchList.compute().some(r=>r.signals.some(s=>s.id===id)),lukeNote.id);assert.equal(again,true,'back once it happens again');
  const after=await p.evaluate(()=>({att:window.MSOS4.state.attendance.length,caps:window.MSOS4.state.captures.length}));assert.deepEqual(after,{att:before.att,caps:before.caps+1},'only the test added anything');
  await p.click('[data-wl-open="ash"]');await p.waitForFunction(()=>window.MSOS4.state.settings.view==='athletes'&&window.MSOS4.state.settings.selectedAthleteId==='ash',null,{timeout:3000});
  assert.deepEqual(errors,[],errors.join('\n'));console.log('WATCH_LIST_LEARNING_LOOP_PASS',rows.map(r=>`${r.who}:${r.sig.map(s=>s.kind).join('+')}`).join(' '));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
