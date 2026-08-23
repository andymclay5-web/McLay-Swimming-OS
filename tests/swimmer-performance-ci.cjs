'use strict';
const assert=require('node:assert/strict');
const athlete={id:'ath-fixture',full_name:'Fixture Swimmer',sex:'M',date_of_birth:'2010-07-01'};
const results=[
  {id:'r1',athlete_id:athlete.id,course:'SCM',distance:200,stroke:'IM',result_seconds:147.73,wa_points:400,result_date:'2026-03-22'},
  {id:'r2',athlete_id:athlete.id,course:'SCM',distance:200,stroke:'IM',result_seconds:149.00,wa_points:390,result_date:'2026-01-10'},
  {id:'r3',athlete_id:athlete.id,course:'SCM',distance:400,stroke:'IM',result_seconds:313.58,wa_points:419,result_date:'2026-06-14'},
  {id:'r4',athlete_id:athlete.id,course:'SCM',distance:100,stroke:'Freestyle',result_seconds:65.17,wa_points:325,result_date:'2025-08-03'},
  {id:'r5',athlete_id:athlete.id,course:'SCM',distance:50,stroke:'Butterfly',result_seconds:29.77,wa_points:367,result_date:'2026-03-21'}
];
const standards=[
  {id:'past-age-15',programme:'NAGS',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_group:'15',age_min:15,age_max:15,distance:200,stroke:'IM',qualifying_seconds:143.52,meet_date:'2026-04-08'},
  {id:'future-current-16-im2',programme:'NZSC',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_group:'16',age_min:16,age_max:16,distance:200,stroke:'IM',qualifying_seconds:140.80,meet_date:'2026-09-27'},
  {id:'future-wrong-age-im2',programme:'NZSC',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_group:'15',age_min:15,age_max:15,distance:200,stroke:'IM',qualifying_seconds:143.31,meet_date:'2026-09-27'},
  {id:'future-current-16-im4',programme:'NZSC',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_group:'16',age_min:16,age_max:16,distance:400,stroke:'IM',qualifying_seconds:305.37,meet_date:'2026-09-27'},
  {id:'future-converted',programme:'National Age Test',season:'2027',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_group:'16',age_min:16,age_max:16,distance:50,stroke:'Butterfly',qualifying_seconds:27.50,meet_date:'2027-04-11'}
];
const meets=[
  {programme:'NZSC',meet_name:'NZSC',course:'SCM',meet_date:'2026-09-27'},
  {programme:'National Age Test',meet_name:'National Age Test',course:'LCM',meet_date:'2027-04-11'}
];
const Evidence={
  course:r=>String(r?.course||r?.pool_course||'').toUpperCase(),
  distance:r=>Number(r?.distance||r?.event_distance),
  rowStroke:r=>String(r?.stroke||r?.event_stroke||''),
  stroke:v=>String(v||''),
  seconds:r=>Number(r?.result_seconds??r?.qualifying_seconds),
  points:r=>Number(r?.wa_points||r?.points),
  pbRows:ath=>results.filter(r=>r.athlete_id===ath.id),
  merge:(a,b)=>[...(a||[]),...(b||[])]
};
function rankedEvents(){
  const m=new Map();
  for(const r of results){
    if(r.athlete_id!==athlete.id)continue;
    const k=`${r.course}|${r.distance}|${r.stroke}`,old=m.get(k);
    if(!old||r.result_seconds<old.seconds)m.set(k,{course:r.course,distance:r.distance,stroke:r.stroke,seconds:r.result_seconds,points:r.wa_points,pointSystem:'WA'});
  }
  return [...m.values()].sort((a,b)=>b.points-a.points||a.seconds-b.seconds);
}
global.MSOSEngines={Evidence};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
  refs:{get:key=>key==='pathway_standards'?standards:key==='pathway_meets'?meets:[],merge:()=>{},save:async()=>{}},
  currentSession:()=>({identity:{date:'2026-08-24',course:'SCM'}}),
  pathway:{defaultStandard:r=>r.standard_kind==='qualifying'},
  performanceEngine:{scoreSystem:()=> 'WA',rankedEvents,invalidate:()=>{}},
  ui:{},cloud:{ready:()=>false},engineBridge:{canAttemptCloudRead:()=>false,pathwayPbCache:new Map()}
};
require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM,model=X.modelFor(athlete,'SCM');
assert.equal(X.uiTakeover,false,'integrity model must not replace the proven swimmer UI');
assert.equal(model.events.length,4,'all distinct SCM events must survive the model');
assert.deepEqual(model.events.map(e=>`${e.distance} ${e.stroke}`),['400 IM','200 IM','50 Butterfly','100 Freestyle'],'events must remain in performance-points order');
const im200=model.events.find(e=>e.distance===200&&e.stroke==='IM');
assert.equal(im200.next.label,'NZSC','past NAGS must not become the current next target');
assert.equal(im200.next.ageAtTarget,16,'age must be calculated at the future target meet');
assert.equal(im200.next.seconds,140.8,'age-16 standard must be selected, not age-15');
assert.ok(Math.abs(im200.next.gapSeconds-6.93)<0.001,'exact gap must use the age-16 target');
const im400=model.events.find(e=>e.distance===400&&e.stroke==='IM');
assert.equal(im400.next.label,'NZSC');
assert.equal(im400.next.seconds,305.37,'400 IM must carry the correct current target');
const fly50=model.events.find(e=>e.distance===50&&e.stroke==='Butterfly');
assert.equal(fly50.next.converted,true,'course-mismatched meet/standard presentation must be labelled converted');
assert.match(fly50.next.provenance,/SCM equivalent of LCM/);
assert.equal(X.ageOn('2010-07-01','2026-04-08'),15);
assert.equal(X.ageOn('2010-07-01','2026-09-27'),16);
assert.equal(X.checks().pastMeetNotNext,true);
console.log('SWIMMER_PERFORMANCE_CI_PASS',model.events.length,'events ·',im200.next.label,'age',im200.next.ageAtTarget,'· 400 IM',im400.next.seconds);
