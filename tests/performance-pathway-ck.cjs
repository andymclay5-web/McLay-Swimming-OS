'use strict';
const assert=require('node:assert/strict');
const athlete={id:'matt-r',full_name:'Matthew R',sex:'M',date_of_birth:'2010-06-18'};
const standards=[
  {programme:'Division II',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:16,age_max:16,distance:400,stroke:'IM',qualifying_seconds:334.50,meet_date:'2026-03-20'},
  {programme:'Canterbury SC Champs',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:15,age_max:99,distance:400,stroke:'IM',qualifying_seconds:333.20,meet_date:'2026-07-03'},
  {programme:'NZSC',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:16,age_max:16,distance:400,stroke:'IM',qualifying_seconds:305.37,meet_date:'2026-09-27'},
  {programme:'NAGS',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:15,age_max:15,distance:400,stroke:'IM',qualifying_seconds:310.74,meet_date:'2026-04-08'},
  {programme:'NAGS',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:16,age_max:16,distance:400,stroke:'IM',qualifying_seconds:305.93,meet_date:'2026-04-08'},
  {programme:'NAGS',season:'2026',active:true,standard_kind:'qualifying',course:'LCM',sex:'M',age_min:16,age_max:16,distance:400,stroke:'IM',qualifying_seconds:312.73,meet_date:'2026-04-08'},
  {programme:'NZ Championships',season:'2026',active:true,standard_kind:'qualifying',course:'SCM',sex:'M',age_min:0,age_max:99,distance:400,stroke:'IM',qualifying_seconds:304.56,meet_date:'2026-05-13'},
  {programme:'NZ Championships',season:'2026',active:true,standard_kind:'qualifying',course:'LCM',sex:'M',age_min:0,age_max:99,distance:400,stroke:'IM',qualifying_seconds:311.36,meet_date:'2026-05-13'}
];
const legacyEvent={pb:{course:'SCM',distance:400,stroke:'IM',result_seconds:313.58},qualifying:[],deeper:[
  {_label:'National SC age finalist benchmark',_kind:'finalist',_seconds:289.11,course:'SCM'},
  {_label:'National SC age medal benchmark',_kind:'medal',_seconds:274.45,course:'SCM'},
  {_label:'National SC age winner benchmark',_kind:'winner',_seconds:266.82,course:'SCM'}
]};
const Evidence={course:r=>String(r?.course||'').toUpperCase(),distance:r=>Number(r?.distance),rowStroke:r=>String(r?.stroke||''),stroke:v=>String(v||''),seconds:r=>Number(r?.qualifying_seconds??r?._seconds??r?.result_seconds)};
global.MSOSEngines={Evidence};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
  currentSession:()=>({identity:{date:'2026-08-24',course:'SCM'}}),
  refs:{get:key=>key==='pathway_standards'?standards:key==='pathway_meets'?[]:[]},
  pathway:{profile:()=>({events:[legacyEvent]}),seconds:r=>Number(r?._seconds),standardLabel:r=>r?._label||'',isPara:()=>false},
  performanceEngine:{isPara:()=>false,rankedEvents:()=>[{distance:400,stroke:'IM',course:'SCM',seconds:313.58,points:419,pointSystem:'WA'}]}
};
require('../engines/performance-pathway-ck.js');
const P=global.MSOS4.performanceEngine;
const ladder=P.pathwayLadderForEvent(athlete,{...legacyEvent,distance:400,stroke:'IM',pbSeconds:313.58,course:'SCM'},{course:'SCM',now:'2026-08-24'});
const q=(label,c='SCM')=>ladder.steps.find(s=>s.label===label&&s.kind==='qualifying'&&s.course===c);
assert.equal(q('NZSC').targetSeason,2026,'current future NZSC stays current edition');
assert.equal(q('NZSC').seconds,305.37);
assert.equal(q('NZSC').ageAtTarget,16);
assert.equal(q('NAGS').targetSeason,2027,'past NAGS projects to next edition');
assert.equal(q('NAGS').planningProxy,true);
assert.equal(q('NAGS').ageAtTarget,16);
assert.equal(q('NAGS').seconds,305.93,'SCM next-NAGS planning mark uses age-at-next-meet standard');
assert.equal(q('NAGS','LCM').seconds,312.73,'LCM next-NAGS planning mark stays available in parallel');
assert.equal(q('Division II').targetSeason,2027,'past Division II becomes next-edition planning level');
assert.equal(q('Canterbury SC Champs').targetSeason,2027,'past regional champs becomes next-edition planning level');
assert.equal(q('Canterbury SC Champs').ageAtTarget,17,'future regional level uses age at projected next edition');
assert.equal(q('NZ Championships').targetSeason,2027,'past Opens/NZ Champs becomes next-edition planning level');
const nzscFinal=ladder.steps.find(s=>s.family==='nzsc'&&s.kind==='finalist');
const nzscMedal=ladder.steps.find(s=>s.family==='nzsc'&&s.kind==='medal');
assert.ok(nzscFinal&&nzscMedal,'qualification must continue to final and medal benchmarks');
assert.equal(ladder.next.label,'NZSC','SC pathway must make current NZSC the next unachieved step before future NAGS planning');
const athletePath=P.pathwaysForAthlete(athlete,{course:'SCM',now:'2026-08-24'});
assert.equal(athletePath.events.length,1);
assert.ok(athletePath.events[0].ladder.tracks.SCM.length,'SCM track required');
assert.ok(athletePath.events[0].ladder.tracks.LCM.length,'LCM outlook required');
console.log('PERFORMANCE_PATHWAY_CK_PASS',ladder.next.label,'| NAGS SCM',q('NAGS').targetSeason,'age',q('NAGS').ageAtTarget,'| NZSC final+medal loaded');
