'use strict';
const assert=require('assert');
const Standards=require('../engines/standards-records.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const molly={id:'molly',full_name:'Molly McKernan',sex:'F',date_of_birth:'2011-05-01'};
const para={id:'para',full_name:'Para Swimmer',sex:'F',date_of_birth:'2010-04-01',current_s_class:'S6',current_sb_class:'SB5',current_sm_class:'SM6'};
const paraMissing={id:'para-missing',full_name:'Para Missing',sex:'F',date_of_birth:'2010-04-01',modifications:'Para swimmer'};
const standards=[
{id:'qual-achieved',programme:'NZSC 15y Qualifier',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:65,active:true},
{id:'qual-next',programme:'NZSC 15y Fast Qualifier',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:62,active:true},
{id:'finalist',programme:'NZ Age Finalist Benchmark',standard_kind:'benchmark',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,target_seconds:59,active:true},
{id:'record',programme:'Canterbury 15y Record',standard_kind:'record',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,record_seconds:56.5,active:true},
{id:'wrong-age',programme:'NZSC 16y',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',age_min:16,age_max:16,qualifying_seconds:60,active:true},
{id:'wrong-course',programme:'NZSC LCM',standard_kind:'qualifying',course:'LCM',distance:100,stroke:'Freestyle',sex:'F',age_min:15,age_max:15,qualifying_seconds:64,active:true},
{id:'para-s6',programme:'NZ Para S6 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'OPEN',para_class:'S6',qualifying_seconds:85,world_para_points:610,active:true},
{id:'para-s7',programme:'NZ Para S7 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'OPEN',para_class:'S7',qualifying_seconds:80,active:true},
{id:'able',programme:'Able 100 Free',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Freestyle',sex:'F',qualifying_seconds:70,active:true},
{id:'para-sb5',programme:'NZ Para SB5 100 Breast',standard_kind:'qualifying',course:'SCM',distance:100,stroke:'Breaststroke',sex:'OPEN',para_class:'SB5',qualifying_seconds:110,world_para_points:600,active:true}
];
const baseTimes=[{course:'SCM',distance:100,stroke:'Freestyle',sex:'F',base_seconds:51.71,active:true}];
const s=Standards.create({standards,baseTimes,today:()=> '2026-08-18'});

test('age sex course event rules are owned here and exact',()=>{const rows=s.forEvent(molly,{course:'SCM',distance:100,stroke:'Free'},{asOfDate:'2026-08-18'});assert(rows.some(x=>x.id==='qual-next'));assert(!rows.some(x=>x.id==='wrong-age'));assert(!rows.some(x=>x.id==='wrong-course'));assert(!rows.some(x=>x.id==='para-s6'))});
test('result status separates qualifying benchmarks and records',()=>{const x=s.statusForResult(molly,{course:'SCM',distance:100,stroke:'Freestyle'},63.8,{asOfDate:'2026-08-18'});assert.equal(x.status,'ok');assert(x.achieved.some(r=>r.id==='qual-achieved'));assert.equal(x.next.id,'qual-next');assert.equal(x.records[0].id,'record');assert.equal(x.benchmarks[0].id,'finalist');assert(Math.abs(x.next.gap.seconds-1.8)<1e-9)});
test('WA points use explicit result points when present',()=>{const p=s.points(molly,{course:'SCM',distance:100,stroke:'Freestyle'},{result_seconds:63.8,wa_points:650});assert.equal(p.value,650);assert.equal(p.source,'explicit result points')});
test('WA points calculate from loaded base time only when no explicit points exist',()=>{const p=s.points(molly,{course:'SCM',distance:100,stroke:'Freestyle'},{result_seconds:63.8});assert.equal(p.value,Math.trunc(1000*Math.pow(51.71/63.8,3)));assert.equal(p.source,'loaded WA base time')});
test('real standards are translated onto the same WA points ladder',()=>{const m=s.milestones(molly,{course:'SCM',distance:100,stroke:'Freestyle'},{result_seconds:63.8,wa_points:650},{asOfDate:'2026-08-18',pointStepCount:2});const q=m.steps.find(x=>x.id==='qual-next');assert(q.points>650);assert(m.steps.some(x=>x.type==='points_step'&&x.points===675));assert(m.steps.some(x=>x.type==='record'&&x.id==='record'))});
test('para uses correct S classification and never falls back to able-bodied standard',()=>{const rows=s.forEvent(para,{course:'SCM',distance:100,stroke:'Freestyle'});assert(rows.some(x=>x.id==='para-s6'));assert(!rows.some(x=>x.id==='para-s7'));assert(!rows.some(x=>x.id==='able'))});
test('breaststroke para matching uses SB classification',()=>{const rows=s.forEvent(para,{course:'SCM',distance:100,stroke:'Breaststroke'});assert.equal(rows.length,1);assert.equal(rows[0].id,'para-sb5')});
test('para point output refuses an able-bodied WA fallback',()=>{const p=s.points(para,{course:'SCM',distance:100,stroke:'Freestyle'},{result_seconds:90});assert.equal(p.label,'World Para');assert.equal(p.value,null);assert(/classification-specific/.test(p.source))});
test('explicit World Para points are accepted without conversion',()=>{const p=s.points(para,{course:'SCM',distance:100,stroke:'Freestyle'},{result_seconds:90,world_para_points:550});assert.equal(p.value,550);assert.equal(p.label,'World Para')});
test('missing para classification is explicit',()=>{const x=s.classificationStatus(paraMissing,{stroke:'Freestyle'});assert.equal(x.status,'classification_needed');assert.equal(x.classification,null)});
test('engine does not mutate loaded standards',()=>{const before=JSON.stringify(standards);s.statusForResult(molly,{course:'SCM',distance:100,stroke:'Freestyle'},63.8,{asOfDate:'2026-08-18'});assert.equal(JSON.stringify(standards),before)});
if(fails){console.error(`\n${fails} Standards and Records regression(s) failed`);process.exit(1)}console.log('\nALL STANDARDS / RECORDS REGRESSIONS PASS');
