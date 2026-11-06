'use strict';
// Andy, Sat 7 Nov 2026 AM, National Board, Charlotte:
//  1. "200 fr Regeneration 15sR" -> Charlotte "100 REG @ 2:45 · Rest 15 sec", and "2 x 100 IM Development 15sR" ->
//     "100 IM DEV @ 3:00 · Rest 15 sec": the aerobic rule turned her target + rest into a send-off on a set written on
//     rest (the same thing Friday's kick on 10sR did). A set on rest stays on rest; her target time still shows.
//  2. "4 x 200 (100 Free / 100 Reverse IM) 15sR" headlined as "4×200" -- a split that adds up to the rep distance is shown.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION=`WARM-UP
4 x 200 (100 Free / 100 Reverse IM) 15sR

PRE-SET
4 x 50 Kick Build @1:00

MAIN SET
3 Rounds:
  200 fr Regeneration 15sR
  2 x 100 IM Development 15sR
  4 x 25 #1 Race Breakout @ 1:00`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland'})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOSEngines?.Coordinator?.prescription&&window.MSOS4?.boardEngine?.workLabel,{timeout:30000});await p.waitForTimeout(400);
  const r=await p.evaluate(t=>{const M=window.MSOS4,E=window.MSOSEngines,B=M.boardEngine;
    const ch={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true};M.state.athletes=[ch];
    M.state.adaptationProfiles=[{id:'p',athlete_id:ch.id,default_volume_ratio:0.6,active:true,activation_mode:'always'}];
    M.state.trainingTestTypes=[{id:'tt-t400-free',test_key:'t400_free',name:'T400 Freestyle'}];
    M.state.trainingTestResults=[{id:'t4',athlete_id:ch.id,test_type_id:'tt-t400-free',result_seconds:526.4,test_date:'2025-10-01',pool_course:'SCM',valid_for_anchor:true}];
    M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+17;
    const s=M.parser.parse(t,{id:'sat',date:'2026-11-07',dayPart:'AM',squads:['National'],course:'SCM'});s.id='sat';
    const sets=[];const walk=xs=>{for(const i of xs||[]){if(i.kind==='group')walk(i.items);else if(i.kind==='set')sets.push(i);}};s.blocks.forEach(x=>walk(x.items));
    const pr=i=>E.Coordinator.prescription(s,i,ch,M.state).item,f=re=>sets.find(i=>re.test(i.raw));
    const wu=f(/Reverse IM/),reg=f(/Regeneration/),dev=f(/Development/),kick=f(/Kick/),bo=f(/Breakout/);
    const o=i=>{const x=pr(i);return{cyc:x.cycleSeconds||null,rest:x.restSeconds,raw:x.raw,label:B.workLabel(x)};};
    return{wuSquad:B.workLabel(wu),wu:o(wu),reg:o(reg),dev:o(dev),kick:o(kick),bo:o(bo)};},SESSION);
  const j=JSON.stringify(r);
  assert.equal(r.reg.cyc,null,`REG on rest gets no send-off: ${j}`);assert.equal(r.reg.rest,15);assert.doesNotMatch(r.reg.raw,/@/);
  assert.equal(r.dev.cyc,null,`IM DEV on rest gets no send-off: ${j}`);assert.equal(r.dev.rest,15);
  assert.equal(r.wuSquad,'4×200 (100 Free / 100 Reverse IM)');assert.match(r.wu.label,/\(100 Free \/ 100 Reverse IM\)$/,j);
  assert.equal(r.kick.cyc,135,'a coach send-off on kick still becomes her 2:15 kick base');
  assert.equal(r.bo.cyc,60,'breakouts keep the squad 1:00');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_SAT_AM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
