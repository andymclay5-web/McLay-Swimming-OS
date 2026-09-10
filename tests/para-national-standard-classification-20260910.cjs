'use strict';
// Real coaching failure this pins: Andy tried to generate Ruby Stace's (a real S13/SB13/SM13-classified para
// swimmer) swimmer-access QR and got "Swimmer access held: no upcoming verified SCM national benchmark is
// linked." That block comes from engines/swimmer-performance-ci.js's readinessFor(), via targetsFor() ->
// standardApplies() over the pathway_standards reference table.
//
// Pulled live from the production Supabase project on 2026-09-10 to confirm this is wrong, not just
// under-configured: there IS a real, upcoming (2026-09-27) NZSC national qualifying standard set for
// S13/SB13/SM13 that matches several of Ruby's actual SCM personal bests exactly (200 IM, 50 Backstroke,
// 100 Breaststroke, 200 Freestyle, etc.) -- both are reproduced verbatim below. The old standardApplies()
// discarded this real, matching row for two independent reasons:
//   1. `if(text(r?.para_class||r?.classification))return false;` blanket-rejected ANY standard carrying a
//      para classification, instead of only rejecting when it does NOT match the athlete's own class --
//      so a para swimmer could never match even her own exact-class national standard.
//   2. `courseOf(r)!==e.course` required an exact string match, so a standard using course:'BOTH' (this
//      NZSC set applies to SCM and LCM alike, the normal convention for age-group standards) could never
//      match an SCM or LCM event at all -- a second, independent way the very same real row got dropped.
//
// The fix (this commit) lets a para_class-carrying row through when it matches the athlete's own
// classification for that stroke (via M.pathway.paraClass, the same lookup app.js already uses elsewhere),
// and treats course:'BOTH' as applying to any course. This test proves both defects were real and are
// fixed, using Ruby's actual data, not a synthetic stand-in.
const assert=require('node:assert/strict');

const ruby={id:'athlete-ruby-stace',full_name:'Ruby Stace',sex:'F',date_of_birth:'2013-01-18',
  current_s_class:'S13',current_sb_class:'SB13',current_sm_class:'SM13'};

// Ruby's real SCM personal bests (results_pb_board, athlete_id='athlete-ruby-stace', pulled 2026-09-10).
const pbRows=[
  {athlete_id:ruby.id,course:'SCM',distance:200,stroke:'IM',result_seconds:209.89,result_date:'2026-08-02'},
  {athlete_id:ruby.id,course:'SCM',distance:50,stroke:'Backstroke',result_seconds:44.21,result_date:'2026-08-01'},
  {athlete_id:ruby.id,course:'SCM',distance:50,stroke:'Butterfly',result_seconds:49.37,result_date:'2026-08-01'},
  {athlete_id:ruby.id,course:'SCM',distance:100,stroke:'Breaststroke',result_seconds:112.92,result_date:'2026-08-01'},
  {athlete_id:ruby.id,course:'SCM',distance:200,stroke:'Freestyle',result_seconds:195.96,result_date:'2026-08-01'},
  {athlete_id:ruby.id,course:'SCM',distance:50,stroke:'Breaststroke',result_seconds:52.18,result_date:'2026-07-31'},
  {athlete_id:ruby.id,course:'SCM',distance:100,stroke:'IM',result_seconds:96.73,result_date:'2026-07-31'},
  {athlete_id:ruby.id,course:'SCM',distance:100,stroke:'Freestyle',result_seconds:90.03,result_date:'2026-07-31'},
  {athlete_id:ruby.id,course:'SCM',distance:100,stroke:'Backstroke',result_seconds:93.63,result_date:'2026-07-31'},
  {athlete_id:ruby.id,course:'SCM',distance:50,stroke:'Freestyle',result_seconds:37.91,result_date:'2026-07-03'},
];

// Real upcoming NZSC national para standards (pathway_standards, pulled 2026-09-10) -- note course:'BOTH'
// and a populated para_class, the two fields the old standardApplies() unconditionally rejected on.
const standards=[
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:50,stroke:'Backstroke',qualifying_seconds:45.56,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'SB13',distance:50,stroke:'Breaststroke',qualifying_seconds:52.46,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:50,stroke:'Butterfly',qualifying_seconds:47.3,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:50,stroke:'Freestyle',qualifying_seconds:41.58,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:100,stroke:'Backstroke',qualifying_seconds:102.8,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'SB13',distance:100,stroke:'Breaststroke',qualifying_seconds:116.02,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:100,stroke:'Butterfly',qualifying_seconds:106.19,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:100,stroke:'Freestyle',qualifying_seconds:98.25,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:200,stroke:'Freestyle',qualifying_seconds:205.07,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'SM13',distance:200,stroke:'IM',qualifying_seconds:230.98,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
  {programme:'NZSC',course:'BOTH',sex:'F',age_min:13,age_max:99,para_class:'S13',distance:400,stroke:'Freestyle',qualifying_seconds:425.35,meet_date:'2026-09-27',standard_kind:'qualifying',active:true},
];

const Evidence={
  course:r=>String(r?.course||'').toUpperCase(),
  distance:r=>Number(r?.distance),
  rowStroke:r=>String(r?.stroke||''),
  stroke:v=>String(v||''),
  seconds:r=>Number(r?.result_seconds??r?.qualifying_seconds),
  points:()=>null,
  pbRows:ath=>pbRows.filter(r=>r.athlete_id===ath.id),
  merge:(a,b)=>[...(a||[]),...(b||[])],
};

global.MSOSEngines={Evidence};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[ruby]},
  refs:{get:key=>key==='pathway_standards'?standards:key==='pathway_meets'?[]:[],merge:()=>{},save:async()=>{}},
  currentSession:()=>({identity:{date:'2026-09-10',course:'SCM'}}),
  // The one real M.pathway dependency this bug touches -- mirrors app.js's real P.paraClass exactly.
  pathway:{paraClass:(ath,stroke)=>{const s=Evidence.stroke(stroke);return String(s==='Breaststroke'?ath?.current_sb_class:s==='IM'?ath?.current_sm_class:ath?.current_s_class||'');}},
  performanceEngine:{scoreSystem:()=>'WPS',rankedEvents:()=>[],invalidate:()=>{}},
  ui:{},cloud:{ready:()=>false},engineBridge:{canAttemptCloudRead:()=>false,pathwayPbCache:new Map()},
};

require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM;
const readiness=X.readinessFor(ruby,{course:'SCM'});

assert.ok(readiness.model.events.length>0,'Ruby\'s real SCM PBs must still build a performance model');
assert.equal(readiness.ok,true,`Ruby must pass readiness now that her real NZSC S13/SB13/SM13 standards are recognised, got issues: ${JSON.stringify(readiness.issues)}`);
assert.deepEqual(readiness.issues,[],'no readiness issues should remain for a fully-classified para swimmer with real upcoming standards linked');

const im200=readiness.model.events.find(e=>e.distance===200&&e.stroke==='IM');
assert.ok(im200?.next,'200 IM must carry a linked next target');
assert.equal(im200.next.label,'NZSC','200 IM target must be the real NZSC SM13 standard');
assert.equal(im200.next.seconds,230.98,'200 IM target must be the exact SM13 qualifying time, not a mismatched class or dropped row');

const back50=readiness.model.events.find(e=>e.distance===50&&e.stroke==='Backstroke');
assert.ok(back50?.next,'50 Backstroke must carry a linked next target from the S13 (not SB13/SM13) standard');
assert.equal(back50.next.seconds,45.56);

const breast100=readiness.model.events.find(e=>e.distance===100&&e.stroke==='Breaststroke');
assert.ok(breast100?.next,'100 Breaststroke must carry a linked next target from the SB13 (not S13/SM13) standard');
assert.equal(breast100.next.seconds,116.02);

console.log('PARA_NATIONAL_STANDARD_CLASSIFICATION_PASS', `${readiness.model.events.filter(e=>e.next).length}/${readiness.model.events.length} events with a linked national target`);
