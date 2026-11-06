'use strict';
// Andy, Fri 6 Nov 2026 AM, National Board, Charlotte:
//  1. Squad "8 x 50 (4 Kick / 4 Drill) 10sR" -> Charlotte "5×50 Kick @ 2:15 · Rest 10 sec". Her 2:10-2:20 kick base
//     replaces a coach send-off; this set was on rest, so she keeps 10 s rest. Her reps keep the written split
//     (4 × 50 (2 Kick / 2 Drill)), and the Board shows the split instead of "8×50 Kick".
//  2. "3 Rounds: 4 x 50 @1:15" (build / middle 20m MAX / first 15m MAX / easy) -> Charlotte @1:20, "makes no sense".
//     Reps with MAX efforts keep the squad send-off (as the 3 Nov max 50s do); the makeable send-off is for steady work.
//     She still gets a makeable send-off on steady work (charlotte-makeable-send-off-20261029).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION=`WARM-UP
400 Choice
8 x 50 (4 Kick / 4 Drill) 10sR
4 x 100 IM Desc 1-4 10sR

PRE-SET
3 Rounds:
  4 x 50 @1:15
1 Build
2 Middle 20m MAX
3 First 15m MAX
4 Easy
  200 IM

MAIN SET
8 x 12.5 MAX @1:00
4 x 50 MAX @3:15`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland'})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOSEngines?.Coordinator?.makeableCycle&&window.MSOS4?.boardEngine?.workLabel,{timeout:30000});await p.waitForTimeout(400);
  const r=await p.evaluate(t=>{const M=window.MSOS4,E=window.MSOSEngines,B=M.boardEngine;
    const ch={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true};M.state.athletes=[ch];
    M.state.adaptationProfiles=[{id:'p',athlete_id:ch.id,default_volume_ratio:0.6,active:true,activation_mode:'always'}];
    M.state.trainingTestTypes=[{id:'tt-t400-free',test_key:'t400_free',name:'T400 Freestyle'}];
    M.state.trainingTestResults=[{id:'t4',athlete_id:ch.id,test_type_id:'tt-t400-free',result_seconds:526.4,test_date:'2025-10-01',pool_course:'SCM',valid_for_anchor:true}];
    M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+13;
    const s=M.parser.parse(t,{id:'fri',date:'2026-11-06',dayPart:'AM',squads:['National'],course:'SCM'});s.id='fri';
    const sets=[];const walk=xs=>{for(const i of xs||[]){if(i.kind==='group')walk(i.items);else if(i.kind==='set')sets.push(i);}};s.blocks.forEach(x=>walk(x.items));
    const pr=i=>E.Coordinator.prescription(s,i,ch,M.state).item;
    const kick=sets.find(i=>/Kick/.test(i.raw)),fifty=sets.find(i=>i.cycleSeconds===75),max=sets.find(i=>/MAX @3:15/.test(i.raw));
    const k=pr(kick),f=pr(fifty),m=pr(max);
    return{squadLabel:B.workLabel(kick),k:{reps:k.reps,cyc:k.cycleSeconds||null,rest:k.restSeconds,raw:k.raw,label:B.workLabel(k)},f:{cyc:f.cycleSeconds,raw:f.raw},m:{cyc:m.cycleSeconds}};},SESSION);
  assert.equal(r.k.cyc,null,`kick on rest gets no send-off: ${JSON.stringify(r)}`);assert.equal(r.k.rest,10);
  assert.equal(r.k.reps,4);assert.match(r.k.raw,/\(2 Kick \/ 2 Drill\)/);assert.match(r.k.label,/^4×50 (?:Fr )?\(2 Kick \/ 2 Drill\)$/);
  assert.equal(r.squadLabel,'8×50 (4 Kick / 4 Drill)');
  assert.equal(r.f.cyc,75,'quality 50s stay on the squad 1:15');assert.match(r.f.raw,/1:15/);
  assert.equal(r.m.cyc,195);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_FRI_AM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
