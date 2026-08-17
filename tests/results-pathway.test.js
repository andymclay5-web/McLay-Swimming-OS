'use strict';
const assert=require('assert');
const Evidence=require('../engines/evidence-retrieval.js');
const Pathway=require('../engines/results-pathway.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}

const evidence=Evidence.create({sources:[{id:'verified-results',priority:100,trust:'verified',data:{
 athletes:[
  {id:'molly',full_name:'Molly McKernan',sex:'F',date_of_birth:'2011-05-01',active:true},
  {id:'para',full_name:'Para Swimmer',sex:'F',date_of_birth:'2010-04-01',current_s_class:'S6',current_sb_class:'SB5',current_sm_class:'SM6',active:true},
  {id:'para-missing',full_name:'Para Missing',sex:'F',date_of_birth:'2010-04-01',modifications:'Para swimmer',active:true}
 ],
 coach_results:[
  {id:'m100-jan',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:68,result_date:'2026-01-10'},
  {id:'m100-pb',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:63.8,result_date:'2026-03-10',wa_points:650},
  {id:'m100-latest',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:64.2,result_date:'2026-07-10'},
  {id:'m200-jan',athlete_id:'molly',distance:200,stroke:'Freestyle',pool_course:'SCM',result_seconds:145,result_date:'2026-01-10'},
  {id:'m200-pb',athlete_id:'molly',distance:200,stroke:'Freestyle',pool_course:'SCM',result_seconds:140,result_date:'2026-07-11'},
  {id:'m50back',athlete_id:'molly',distance:50,stroke:'Backstroke',pool_course:'SCM',result_seconds:35,result_date:'2026-07-11'},
  {id:'m100-lcm',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'LCM',result_seconds:66,result_date:'2026-06-01'},
  {id:'p100free',athlete_id:'para',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:90,result_date:'2026-06-01',world_para_points:550},
  {id:'p100br',athlete_id:'para',distance:100,stroke:'Breaststroke',pool_course:'SCM',result_seconds:120,result_date:'2026-06-01'},
  {id:'pm100',athlete_id:'para-missing',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:100,result_date:'2026-06-01'}
 ]
}}]});

const standards=[
 {id:'n100-achieved',programme:'NZ National 15y Qualifier A',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:65,progression_order:1,active:true},
 {id:'n100-next',programme:'NZ National 15y Qualifier B',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:62,progression_order:2,active:true},
 {id:'n100-wrong-age',programme:'NZ National 16y Qualifier',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:16,age_max:16,qualifying_seconds:61,active:true},
 {id:'n100-wrong-sex',programme:'NZ National Boys Qualifier',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'M',age_min:15,age_max:15,qualifying_seconds:60,active:true},
 {id:'regional100',programme:'Canterbury Regional Qualifier',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:64,progression_order:3,active:true},
 {id:'medal100',programme:'NZ National Medal Benchmark',standard_kind:'benchmark',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,target_seconds:59,active:true},
 {id:'n200-next',programme:'NZ National 15y 200 Free Qualifier',standard_kind:'qualifying',course:'SCM',distance:200,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:135,active:true},
 {id:'n50back-next',programme:'NZ National 15y 50 Back Qualifier',standard_kind:'qualifying',course:'SCM',distance:50,stroke:'Backstroke',sex:'F',age_min:15,age_max:15,qualifying_seconds:34,active:true},
 {id:'para-s6',programme:'NZ National Para S6 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'OPEN',para_class:'S6',qualifying_seconds:85,active:true},
 {id:'para-s7',programme:'NZ National Para S7 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'OPEN',para_class:'S7',qualifying_seconds:80,active:true},
 {id:'para-able',programme:'NZ National Able 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',qualifying_seconds:70,active:true},
 {id:'para-sb5',programme:'NZ National Para SB5 100 Breast',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Breaststroke',sex:'OPEN',para_class:'SB5',qualifying_seconds:110,active:true}
];
const baseTimes=[
 {id:'base100f',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',base_seconds:51.71,active:true},
 {id:'base200f',course:'SCM',distance:200,stroke:'Freestyle',sex:'F',base_seconds:111.0,active:true},
 {id:'base50backf',course:'SCM',distance:50,stroke:'Backstroke',sex:'F',base_seconds:26.0,active:true}
];
const p=Pathway.create({evidence,standards,baseTimes,today:()=> '2026-08-18'});

test('PBs are selected from Evidence Retrieval by event and course',()=>{
 const rows=p.pbRows('molly',{course:'SCM'});const free100=rows.find(x=>x.distance===100&&x.stroke==='Freestyle');assert.equal(free100.result_seconds,63.8);assert.equal(rows.filter(x=>x.distance===100&&x.stroke==='Freestyle').length,1);assert(!rows.some(x=>x.course==='LCM'));
});

test('age, sex, course and event matching exclude inapplicable standards',()=>{
 const pb=p.pbRows('molly',{course:'SCM'}).find(x=>x.distance===100&&x.stroke==='Freestyle'),matched=p.standardsFor(p.athlete('molly'),pb,{asOfDate:'2026-08-18'});assert(matched.some(x=>x.id==='n100-next'));assert(!matched.some(x=>x.id==='n100-wrong-age'));assert(!matched.some(x=>x.id==='n100-wrong-sex'));
});

test('event pathway reports achieved target, next national target and deeper benchmark separately',()=>{
 const a=p.athlete('molly'),pb=p.pbRows('molly',{course:'SCM'}).find(x=>x.distance===100&&x.stroke==='Freestyle'),ev=p.event(a,pb,{asOfDate:'2026-08-18'});assert.equal(ev.nextNational.row.id,'n100-next');assert(Math.abs(ev.nextNational.gap.seconds-1.8)<1e-9);assert.equal(ev.nextNational.gap.achieved,false);assert(ev.achievedNational.some(x=>x.id==='n100-achieved'));assert(ev.deeper.some(x=>x.id==='medal100'));assert(ev.qualifying.some(x=>x.id==='regional100'));
});

test('profile exposes closest and furthest unachieved national events',()=>{
 const profile=p.profile('molly',{course:'SCM',asOfDate:'2026-08-18'});assert.equal(profile.status,'ok');assert.equal(profile.closest.pb.distance,100);assert.equal(profile.closest.pb.stroke,'Freestyle');assert.equal(profile.furthest.pb.distance,200);assert.equal(profile.summary.closestEvent,'SCM 100 Freestyle');assert.equal(profile.summary.furthestEvent,'SCM 200 Freestyle');
});

test('explicit WA points are retained and next 25-point ladder steps are calculated from loaded base time',()=>{
 const ev=p.eventAnswer('molly',{course:'SCM',distance:100,stroke:'Freestyle',asOfDate:'2026-08-18'}).event;assert.equal(ev.points.value,650);assert.equal(ev.points.source,'result');assert.equal(ev.pointSteps[0].points,675);assert.equal(ev.pointSteps[1].points,700);assert(ev.pointSteps[0].seconds<ev.pb.result_seconds);
});

test('WA points can be calculated from base time when explicit points are absent',()=>{
 const ev=p.eventAnswer('molly',{course:'SCM',distance:200,stroke:'Freestyle',asOfDate:'2026-08-18'}).event;const expected=Math.trunc(1000*Math.pow(111/140,3));assert.equal(ev.points.value,expected);assert.equal(ev.points.source,'loaded WA base time');
});

test('trend reports evidence facts without inventing a coaching conclusion',()=>{
 const ev=p.eventAnswer('molly',{course:'SCM',distance:100,stroke:'Freestyle',asOfDate:'2026-08-18'}).event;assert.equal(ev.trend.count,3);assert.equal(ev.trend.first,68);assert.equal(ev.trend.latest,64.2);assert.equal(ev.trend.pb,63.8);assert(Math.abs(ev.trend.improvementToPb-4.2)<1e-9);assert(Math.abs(ev.trend.latestVsPb-0.4)<1e-9);
});

test('para pathway matches S classification and rejects able-bodied and wrong-class standards',()=>{
 const profile=p.profile('para',{course:'SCM',asOfDate:'2026-08-18'}),free=profile.events.find(x=>x.pb.stroke==='Freestyle');assert.equal(profile.status,'ok');assert.equal(free.nextNational.row.id,'para-s6');assert(!free.qualifying.some(x=>x.id==='para-s7'));assert(!free.qualifying.some(x=>x.id==='para-able'));assert.equal(free.points.value,550);assert.equal(free.points.label,'World Para');
});

test('breaststroke para pathway uses SB classification rather than S classification',()=>{
 const ev=p.eventAnswer('para',{course:'SCM',distance:100,stroke:'Breaststroke',asOfDate:'2026-08-18'}).event;assert(ev);assert.equal(ev.nextNational.row.id,'para-sb5');
});

test('para swimmer without S/SB/SM evidence is explicitly classification-needed',()=>{
 const profile=p.profile('para-missing',{course:'SCM'});assert.equal(profile.status,'classification_needed');assert.equal(profile.classificationNeeded,true);assert.equal(profile.events.length,0);
});

test('course-specific profile never substitutes LCM PB into SCM pathway',()=>{
 const scm=p.profile('molly',{course:'SCM'}),lcm=p.profile('molly',{course:'LCM'});assert(scm.pbs.some(x=>x.distance===100&&x.result_seconds===63.8));assert(!scm.pbs.some(x=>x.result_seconds===66));assert.equal(lcm.pbs.length,1);assert.equal(lcm.pbs[0].result_seconds,66);
});

test('missing athlete and missing event return explicit statuses',()=>{
 assert.equal(p.profile('nobody',{course:'SCM'}).status,'missing_athlete');assert.equal(p.eventAnswer('molly',{course:'SCM',distance:1500,stroke:'Freestyle'}).status,'missing_event');
});

test('pathway calculations do not mutate Evidence Retrieval rows',()=>{
 const before=JSON.stringify(evidence.results('molly',{}));p.profile('molly',{course:'SCM',asOfDate:'2026-08-18'});assert.equal(JSON.stringify(evidence.results('molly',{})),before);
});

if(fails){console.error(`\n${fails} Results/Pathway regression(s) failed`);process.exit(1)}
console.log('\nALL RESULTS / PATHWAY REGRESSIONS PASS');
