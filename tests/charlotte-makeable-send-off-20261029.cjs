'use strict';
// Andy, Thu 29 Oct 2026, Board: "Charlotte's still not making sense". Two parts:
//  1. Sets with no target kept the squad send-off whether or not she could make it -- 100 Minimum SC @1:45 and
//     50 Build @1:00 for a swimmer whose T400 is 8:46 (about 2:10 per 100). Her own T400 now moves a send-off out to
//     one she can make with 10 s (50s) / 15 s (100s+) rest; it never shortens a coach send-off, never touches kick or
//     race-pace work, and a squad swimmer is untouched.
//  2. "Charlotte · 50 @1:00 Build" was the squad's work repeated: "@ 1:00" vs "@1:00" read as a change.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland'})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOSEngines?.Coordinator?.makeableCycle,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{const M=window.MSOS4,E=window.MSOSEngines;
    const ch={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true},sq={id:'athlete-squad',full_name:'Squad Swimmer',squad:'National',active:true};
    M.state.athletes=[ch,sq];
    M.state.adaptationProfiles=[{id:'p',athlete_id:ch.id,profile_label:'Just over ½ session',default_volume_ratio:0.6,active:true,activation_mode:'always'}];
    M.state.trainingTestTypes=[{id:'tt-t400-free',test_key:'t400_free',name:'T400 Freestyle'}];
    M.state.trainingTestResults=[{id:'t4',athlete_id:ch.id,test_type_id:'tt-t400-free',result_seconds:526.4,test_date:'2025-10-01',pool_course:'SCM',valid_for_anchor:true},{id:'t5',athlete_id:sq.id,test_type_id:'tt-t400-free',result_seconds:290,test_date:'2026-09-01',pool_course:'SCM',valid_for_anchor:true}];
    const t='PRE SET\n50 Build @1:00\n50 Kick @1:00\n50 Easy @3:00\n\nMAIN SET\n4 x 50 @200 Pace @1:00';
    const s=M.parser.parse(t,{id:'c',date:'2026-10-29',dayPart:'AM',squads:['National'],course:'SCM'});s.id='c';s.identity={...s.identity,course:'SCM'};
    const items=s.blocks.flatMap(x=>x.items).filter(i=>i.kind==='set');const pr=(a,i)=>E.Coordinator.prescription(s,i,a,M.state).item;
    return{build:pr(ch,items[0]).cycleSeconds,buildRaw:pr(ch,items[0]).raw,kick:E.Coordinator.makeableCycle(s,items[1],ch,M.state),longer:pr(ch,items[2]).cycleSeconds,squad:pr(sq,items[0]).cycleSeconds,race:E.Coordinator.makeableCycle(s,items[3],ch,M.state),
      same:E.Modification.samePrescription({reps:1,distance:50,raw:'50 Build @1:00',cycleSeconds:60},{reps:1,distance:50,raw:'50 Build @ 1:00',cycleSeconds:60})};});
  assert.equal(r.build,80,`50 Build @1:00 -> a send-off she can make: ${JSON.stringify(r)}`);assert.match(r.buildRaw,/@ ?1:20/);
  assert.equal(r.kick,null,'kick send-offs stay with their own owner');assert.equal(r.race,null,'race-pace send-offs stay with the race-pace policy');
  assert.equal(r.longer,180,'a longer coach send-off is never shortened');assert.equal(r.squad,60,'a squad swimmer keeps the coach send-off');
  assert.equal(r.same,true,'"@ 1:00" and "@1:00" are the same work');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_MAKEABLE_SEND_OFF_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
