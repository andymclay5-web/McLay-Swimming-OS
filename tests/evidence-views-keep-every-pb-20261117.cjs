'use strict';
// Andy, Tue 17 Nov 2026, on Luke Thompson: "Here Luke's pb is 1.57 as we can see but showing 2 min and that's what
// pace sets go off". Root: the cloud results views (results_pb_board, results_event_history) have no `id` column, and
// the evidence pull merged them by id -> every row in the club collapsed onto one key and only the last survived.
// Luke's official 1:57.94 SCM 200 Free (SI SCM Champs, 30 Aug) was thrown away and race pace fell back to the
// coach_results best, 2:00.11. Real rows from the cloud, 17 Nov 2026.
// Proves: the pull keeps every PB row; race pace uses 1:57.94 SCM; the LCM PB stays its own row; a second pull with
// the same row count but a faster time still reaches race pace (no stale cache).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const luke={id:'athlete-luke-thompson',full_name:'Luke Thompson',squad:'National',sex:'M',active:true};
const pb=(course,secs,text,date,meet)=>({organisation_id:ORG,athlete_id:luke.id,full_name:'Luke Thompson',squad:'National',sex:'M',current_s_class:null,current_sb_class:null,current_sm_class:null,course,distance:200,stroke:'Freestyle',pb_time:text,pb_seconds:secs,pb_date:date,meet_name:meet,source_file:'x',club_rank:1});
const other={...pb('SCM',125.5,'2:05.50','2026-08-30','South Island SCM Championships 2026'),athlete_id:'athlete-thomas-cave',full_name:'Thomas Cave'};
const BOARD=[pb('LCM',122.76,'2:02.76','2026-03-14','2026 South Island Long Course Championships'),pb('SCM',117.94,'1:57.94','2026-08-30','South Island SCM Championships 2026'),other];
const HIST=[{organisation_id:ORG,result_id:'r1',athlete_id:luke.id,full_name:'Luke Thompson',course:'SCM',distance:200,stroke:'Freestyle',result_date:'2026-09-30',round:'Final',result_time_text:'1:57.94',result_time_seconds:117.94},{organisation_id:ORG,result_id:'r2',athlete_id:luke.id,full_name:'Luke Thompson',course:'SCM',distance:200,stroke:'Freestyle',result_date:'2026-09-30',round:'Heat',result_time_text:'1:58.21',result_time_seconds:118.21}];
const CR=[{id:'result-v373-afb2809ccc30ead4f5243ffc',athlete_id:luke.id,swimmer_name:'Luke Thompson',course:'SCM',distance:200,stroke:'Freestyle',result_date:'2026-07-03',meet_name:'2026 SCWC Short Course Championships',result_seconds:120.11,result_time_text:'2:00.11'}];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.cloud?.applyEvidence&&window.MSOSEngines?.RacePace,{timeout:30000});await p.waitForTimeout(500);
  const out=await p.evaluate(({luke,BOARD,HIST,CR})=>{const M=window.MSOS4,RP=window.MSOSEngines.RacePace;M.state.athletes=[luke,{id:'athlete-thomas-cave',full_name:'Thomas Cave',squad:'National',active:true}];
    M.state.resultsPbBoard=[];M.state.resultsEventHistory=[];M.state.coachResults=[];
    // what a phone held before the 19 Oct imports: only the coach_results 2:00.11
    M.cloud.applyEvidence({tables:{coach_results:CR,results_pb_board:[],results_event_history:[]}});
    const before=RP.pb(luke,M.state,{course:'SCM',distance:200,stroke:'Freestyle'});
    M.cloud.applyEvidence({tables:{coach_results:CR,results_pb_board:BOARD,results_event_history:HIST}});
    const after=RP.pb(luke,M.state,{course:'SCM',distance:200,stroke:'Freestyle'}),lcm=RP.pb(luke,M.state,{course:'LCM',distance:200,stroke:'Freestyle'});
    const counts=[M.state.resultsPbBoard.length,M.state.resultsEventHistory.length];
    // next pull: same number of rows, Luke has gone faster -> must not be held back by a cache keyed on counts
    const faster=BOARD.map(r=>r.athlete_id===luke.id&&r.course==='SCM'?{...r,pb_seconds:116.5,pb_time:'1:56.50'}:r);
    M.cloud.applyEvidence({tables:{coach_results:CR,results_pb_board:faster,results_event_history:HIST}});
    const next=RP.pb(luke,M.state,{course:'SCM',distance:200,stroke:'Freestyle'});
    const sec=x=>Number(x?.seconds??x?.pb_seconds??x?.result_seconds??x?.result_time_seconds??x?.time_seconds);
    return{before:sec(before),after:sec(after),lcm:sec(lcm),next:sec(next),counts};},{luke,BOARD,HIST,CR});
  assert.equal(out.before,120.11,JSON.stringify(out));
  assert.deepEqual(out.counts,[3,2],'every PB row and every history row is kept: '+JSON.stringify(out));
  assert.equal(out.after,117.94,'race pace goes off his official 1:57.94: '+JSON.stringify(out));
  assert.equal(out.lcm,122.76,'LCM PB stays its own row');
  assert.equal(out.next,116.5,'a faster PB with the same row count reaches race pace: '+JSON.stringify(out));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('EVIDENCE_VIEWS_KEEP_EVERY_PB_PASS',JSON.stringify(out));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
