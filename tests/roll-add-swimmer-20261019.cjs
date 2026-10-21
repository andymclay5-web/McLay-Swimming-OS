'use strict';
// Andy, 19 Oct 2026: "add swimmer needs to be on the actual role ... adding just for today like a new swimmer, or we're
// adding them to the role ... Izzy from Ashburton ... on our role. Permanently, but showing that she's from Ashburton ...
// other Ashburton kids ... keep track of that."
// Real app, Roll screen. Proves:
//  1. "＋ Add swimmer" finds an existing swimmer (also by club) and marks them Here.
//  2. A new swimmer "Just today": kept on record (a visitor with their home club), Here on this Roll -- and NOT on the
//     next session's Roll of that squad.
//  3. A new swimmer "Regular" from Ashburton: on this Roll and on every later Roll of the squad, with an "Ashburton" badge.
//  4. Both are sent to the team cloud with visitor / regular / home club (and an older copy never blanks those fields).
//  5. An assistant coach's "Regular" goes up as a regular visitor (assistants add visitors; the head coach manages the
//     club list) -- still on the Roll every time.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.attendanceRoster?.addNewSwimmer&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
  await p.evaluate(ORG=>{const M=window.MSOS4;M.state.settings.organisationId=ORG;M.cloud.sendSoon=()=>{};M.state.pending=[];
    M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true},{id:'tom',full_name:'Tom Reid',squad:'National',active:true,is_visitor:true,membership_type:'visitor',visitor_home_club:'Ashburton'}];
    const mk=(id,date)=>{const s=M.parser.parse('MAIN SET\n8 x 100 Free',{date,dayPart:'PM',squads:['National']});s.id=id;s.identity={...s.identity,date,dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);};
    mk('mon','2026-10-19');mk('tue','2026-10-20');M.state.settings.selectedSessionId='mon';M.state.attendance=[];M.store.save(M.state);M.nav.show('roll');},ORG);
  await p.waitForSelector('[data-roll-add-ath]');
  // 1. existing swimmer, found by club
  await p.click('[data-roll-add-ath]');await p.fill('#rosterSearch','ashburton');await p.waitForSelector('[data-roster-ath="tom"]');
  assert.match(await p.textContent('[data-roster-ath="tom"]'),/Tom Reid[\s\S]*Ashburton[\s\S]*visitor/);await p.click('[data-roster-ath="tom"]');
  // 2. new, just today
  await p.click('[data-roll-add-ath]');await p.evaluate(()=>{document.querySelector('.roster-new').open=true;});await p.fill('[data-new-name]','Sam Trial');await p.click('[data-new-kind="today"]');
  // 3. new, regular from Ashburton
  await p.click('[data-roll-add-ath]');await p.evaluate(()=>{document.querySelector('.roster-new').open=true;});await p.fill('[data-new-name]','Izzy Clarke');await p.fill('[data-new-club]','Ashburton');await p.click('[data-new-kind="regular"]');
  // duplicate name is refused, with a pointer
  await p.click('[data-roll-add-ath]');await p.evaluate(()=>{document.querySelector('.roster-new').open=true;});await p.fill('[data-new-name]','Izzy Clarke');await p.click('[data-new-kind="today"]');
  assert.match(await p.textContent('[data-new-msg]'),/already a swimmer/);await p.click('[data-roster-close]');
  const mon=await p.evaluate(()=>[...document.querySelectorAll('#rollView .roll-row')].map(r=>r.textContent.replace(/\s+/g,' ')));
  assert.ok(mon.some(t=>/Sam Trial today only/.test(t)),`Sam on today's Roll as a visitor: ${mon}`);assert.ok(mon.some(t=>/Izzy Clarke Ashburton/.test(t)),'Izzy with her club');
  const here=await p.evaluate(()=>window.MSOS4.attendanceRoster.present().map(a=>a.full_name).sort());assert.deepEqual(here,['Izzy Clarke','Sam Trial','Tom Reid'],'all three Here');
  // tomorrow's Roll: Izzy yes, Sam and Tom (visitors) no
  const tue=await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='tue';M.ui.renderRoll();return M.attendanceRoster.athletes().map(a=>a.full_name).sort();});
  assert.deepEqual(tue,['Ashley Brown','Izzy Clarke'],'a regular is on every Roll; a visitor only on the one they came to');
  // 4. sent to the team
  const sent=await p.evaluate(()=>window.MSOS4.state.pending.filter(x=>x.table==='athletes').map(x=>window.MSOS4.cloud.recordFor(x)));
  const sam=sent.find(x=>x.full_name==='Sam Trial'),izzy=sent.find(x=>x.full_name==='Izzy Clarke');
  assert.equal(sam.is_visitor,true);assert.equal(sam.membership_type,'visitor');
  assert.equal(izzy.membership_type,'regular');assert.equal(izzy.primary_club_name,'Ashburton');assert.equal(izzy.squad,'National');assert.equal(izzy.organisation_id,'9d40beff-e632-414d-9daa-7ee78104ad2a');
  const plain=await p.evaluate(()=>window.MSOS4.cloud.projectAthlete({id:'ash',full_name:'Ashley Brown',squad:'National'}));
  assert.ok(!('is_visitor' in plain)&&!('primary_club_name' in plain)&&!('membership_type' in plain),'an older copy without these fields never blanks them');
  assert.ok(await p.evaluate(()=>window.MSOS4.state.pending.some(x=>x.table==='attendance'&&x.record?.athlete_id&&/athlete/.test(x.record.athlete_id))),'their Roll tick is sent too');
  // 5. an assistant's regular
  const asst=await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];M.state.settings.selectedSessionId='tue';
    const a=M.attendanceRoster.addNewSwimmer(M.currentSession(),{name:'Kim Lee',club:'',squad:'National',kind:'regular'});M.state.settings.activeRole='owner';return{a,onRollNext:M.attendanceRoster.athletes(M.state.canonicalSessions.mon).some(x=>x.id===a.id)};});
  assert.equal(asst.a.is_visitor,true,'assistant adds a visitor');assert.equal(asst.a.membership_type,'regular');assert.equal(asst.onRollNext,true,'a regular visitor is on the Roll every time');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('ROLL_ADD_SWIMMER_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
