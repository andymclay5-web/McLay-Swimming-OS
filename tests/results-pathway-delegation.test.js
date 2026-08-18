'use strict';
const assert=require('assert');
const Pathway=require('../engines/results-pathway.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function fixture(){
 const calls=[];
 const athlete={id:'molly',full_name:'Molly McKernan',sex:'F',date_of_birth:'2011-05-01'};
 const pb={id:'pb',athlete_id:'molly',course:'SCM',pool_course:'SCM',distance:100,stroke:'Freestyle',result_seconds:63.8,result_date:'2026-08-01'};
 const evidence={resolveAthlete:ref=>ref==='molly'?athlete:null,results:ref=>ref==='molly'?[pb]:[]};
 const standard={id:'nzsc',programme:'NZSC',standard_kind:'qualifying',label:'NZSC',standard_seconds:62,gap:{seconds:1.8,percentage:2.9,achieved:false}};
 const rules={
  normalizeCourse:v=>{calls.push(['normalizeCourse',v]);return String(v||'').toUpperCase()},
  normalizeStroke:v=>{calls.push(['normalizeStroke',v]);return /free/i.test(v)?'Freestyle':String(v||'')},
  normalizeEvent:r=>{calls.push(['normalizeEvent',r]);return{course:String(r.course||r.pool_course||'').toUpperCase(),distance:Number(r.distance??r.distance_m),stroke:/free/i.test(r.stroke)?'Freestyle':r.stroke}},
  isParaAthlete:a=>{calls.push(['isParaAthlete',a]);return false},
  paraClassification:(...args)=>{calls.push(['paraClassification',...args]);return''},
  matches:(...args)=>{calls.push(['matches',...args]);return true},
  forEvent:(...args)=>{calls.push(['forEvent',...args]);return[standard]},
  baseTime:(...args)=>{calls.push(['baseTime',...args]);return{base_seconds:51.71}},
  points:(...args)=>{calls.push(['points',...args]);return{value:532,label:'WA',source:'loaded WA base time',baseSeconds:51.71}},
  pointSteps:(...args)=>{calls.push(['pointSteps',...args]);return[{points:550,seconds:63}]},
  statusForResult:(...args)=>{calls.push(['statusForResult',...args]);return{status:'ok',matched:[standard],achieved:[],next:standard,records:[],qualifying:[standard],benchmarks:[],pathway:[],nationalQualifying:[standard],nextNational:standard,achievedNational:[]}},
  milestones:(...args)=>{calls.push(['milestones',...args]);return{status:'ok',current:{value:532,label:'WA'},steps:[{id:'nzsc',points:580}]}}
 };
 return{p:Pathway.create({evidence,standardsEngine:rules}),calls,athlete,pb};
}

test('Pathway accepts an injected Standards Records contract',()=>{const {p}=fixture();assert(p);assert.equal(p.rules.points instanceof Function,true)});
test('PB event normalization delegates to Standards Records',()=>{const {p,calls}=fixture();const rows=p.pbRows('molly',{course:'SCM'});assert.equal(rows[0].stroke,'Freestyle');assert(calls.some(x=>x[0]==='normalizeCourse'));assert(calls.some(x=>x[0]==='normalizeEvent'))});
test('standardsFor delegates event applicability to Standards Records',()=>{const {p,calls,athlete,pb}=fixture(),rows=p.standardsFor(athlete,pb,{asOfDate:'2026-08-18'});assert.equal(rows[0]._seconds,62);assert(calls.some(x=>x[0]==='forEvent'))});
test('points and point steps delegate rather than recalculating in Pathway',()=>{const {p,calls,athlete,pb}=fixture();assert.equal(p.points(athlete,pb).value,532);assert.equal(p.pointSteps(athlete,pb)[0].points,550);assert(calls.some(x=>x[0]==='points'));assert(calls.some(x=>x[0]==='pointSteps'))});
test('event delegates qualification and milestone meaning to Standards Records',()=>{const {p,calls,athlete,pb}=fixture(),ev=p.event(athlete,pb,{asOfDate:'2026-08-18'});assert.equal(ev.nextNational.row.id,'nzsc');assert.equal(ev.milestones.steps[0].id,'nzsc');assert(calls.some(x=>x[0]==='statusForResult'));assert(calls.some(x=>x[0]==='milestones'))});
test('Pathway still owns PB selection and trend over verified Evidence Retrieval rows',()=>{const {p}=fixture(),profile=p.profile('molly',{course:'SCM',asOfDate:'2026-08-18'});assert.equal(profile.status,'ok');assert.equal(profile.pbs[0].result_seconds,63.8);assert.equal(profile.events[0].trend.pb,63.8)});
test('incomplete Standards Records contract fails closed',()=>{const evidence={resolveAthlete:()=>null,results:()=>[]};assert.throws(()=>Pathway.create({evidence,standardsEngine:{}}),/complete Standards Records contract/)});
if(fails){console.error(`\n${fails} Results Pathway delegation regression(s) failed`);process.exit(1)}console.log('\nALL RESULTS / PATHWAY DELEGATION REGRESSIONS PASS');
