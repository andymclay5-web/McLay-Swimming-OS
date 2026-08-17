'use strict';
const assert=require('assert');
const Learning=require('../engines/learning.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const L=Learning.create();
const baseSession=(id,alignment='aligned',edits=0,completion=1)=>({sessionId:id,dose:{alignment:{status:alignment},dose:{'aerobic:development':600},classifiedQualityDistance:600},delivery:{completion,deliveredDistance:completion*1000,currentDistance:1000},lifecycle:{byType:{edit:edits}}});

test('session learning translates explicit primary-missing fact into a review question, not a fabricated cause',()=>{
 const out=L.session(baseSession('s1','primary_missing'));assert.equal(out.length,1);assert.equal(out[0].level,'attention');assert(/planned primary dose/.test(out[0].message));assert(/intentionally/.test(out[0].question));assert.equal(out[0].inference,false);assert.deepEqual(out[0].evidence[0].ids,['s1']);
});

test('low completion is reported as fact plus question, not blame',()=>{
 const out=L.session(baseSession('s1','aligned',0,.72)),x=out.find(f=>f.id==='session-completion-s1');assert(x);assert(/72%/.test(x.message));assert(/planned|time-driven|coaching response/i.test(x.question));assert.equal(x.inference,false);
});

test('multiple live edits in one session surface a planning question',()=>{
 const out=L.session(baseSession('s1','aligned',4,1)),x=out.find(f=>f.id==='session-edits-s1');assert(x);assert(/4 live edits/.test(x.message));assert(/planning assumption/.test(x.question));
});

test('period pattern requires repeated evidence, not a single occurrence',()=>{
 const one=[baseSession('s1','primary_not_dominant')],two=[...one,baseSession('s2','primary_not_dominant')];assert(!L.period({attendance:{}},one).some(x=>x.id==='period-primary-not-dominant'));const x=L.period({attendance:{}},two).find(x=>x.id==='period-primary-not-dominant');assert(x);assert(/2 sessions/.test(x.message));assert.deepEqual(new Set(x.evidence[0].ids),new Set(['s1','s2']));
});

test('repeated heavily edited sessions become a pattern with evidence IDs',()=>{
 const rows=[baseSession('s1','aligned',3),baseSession('s2','aligned',4),baseSession('s3','aligned',1)],x=L.period({attendance:{}},rows).find(x=>x.id==='period-live-edit-pattern');assert(x);assert(/2 sessions/.test(x.message));assert.deepEqual(new Set(x.evidence[0].ids),new Set(['s1','s2']));
});

test('low period attendance is exposure context, not programme-effect conclusion',()=>{
 const rows=[baseSession('s1')],x=L.period({attendance:{rate:.6,here:6,eligible:10}},rows).find(x=>x.id==='period-attendance-exposure');assert(x);assert.equal(x.level,'context');assert(/60%/.test(x.message));assert(/separate programme effect from uneven exposure/.test(x.question));
});

test('athlete low attendance uses cautious inference wording',()=>{
 const report={athlete:{id:'a',full_name:'A'},attendance:{here:3,marked:6,rate:.5},pathway:null},x=L.athlete(report).find(x=>x.id==='athlete-exposure-a');assert(x);assert.equal(x.inference,true);assert(/Could limited exposure/.test(x.question));
});

test('classification-needed pathway blocks comparison explicitly',()=>{
 const report={athlete:{id:'p',full_name:'Para'},attendance:{},pathway:{status:'classification_needed'}},x=L.athlete(report).find(x=>x.id==='athlete-classification-p');assert(x);assert(/classification evidence is incomplete/.test(x.message));assert(/S\/SB\/SM/.test(x.question));
});

test('closest national opportunity is evidence-linked and does not say swimmer will qualify',()=>{
 const report={athlete:{id:'a',full_name:'A'},attendance:{},pathway:{status:'ok',closest:{pb:{course:'SCM',distance:100,stroke:'Freestyle'},nextNational:{gap:{seconds:1.2,percentage:1.9}}}}},x=L.athlete(report).find(x=>x.id==='athlete-closest-a');assert(x);assert(/1.20s/.test(x.message));assert(/1.90%/.test(x.message));assert(!/will qualify|should qualify|guarantee/i.test(x.message));
});

test('recent dose context is explicitly marked inference/context only',()=>{
 const report={athlete:{id:'a',full_name:'A'},attendance:{},pathway:null},sessions=[{sessionId:'s1',dose:{dose:{'aerobic:threshold':500}}},{sessionId:'s2',dose:{dose:{'aerobic:threshold':300,race_pace:100}}}],x=L.athlete(report,{recentSessionReports:sessions}).find(x=>x.id==='athlete-dose-context-a');assert(x);assert.equal(x.inference,true);assert(/800m/.test(x.message));assert(/does not prove/.test(x.question));
});

test('coach edit-rate pattern distinguishes upstream planning defaults from responsive coaching',()=>{
 const rows=[baseSession('s1','aligned',3),baseSession('s2','aligned',2),baseSession('s3','aligned',1)],coach={sessions:3,lifecycleActions:{edit:6},period:{attendance:{}}},x=L.coach(coach,rows).find(x=>x.id==='coach-edit-rate');assert(x);assert(/2.0 per supplied session/.test(x.message));assert(/responsive coaching/.test(x.question));
});

test('Learning Engine is read-only',()=>{
 const report=baseSession('s1','primary_missing',3,.7),before=JSON.stringify(report);L.session(report);assert.equal(JSON.stringify(report),before);
});

if(fails){console.error(`\n${fails} Learning regression(s) failed`);process.exit(1)}
console.log('\nALL LEARNING REGRESSIONS PASS');
