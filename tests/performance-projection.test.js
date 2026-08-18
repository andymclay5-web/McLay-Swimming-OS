'use strict';
const assert=require('assert');
const Projection=require('../engines/performance-projection.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const athlete={id:'molly',full_name:'Molly McKernan'};
const calls=[];
const deps={
 entities:{resolveAthlete:ref=>ref==='molly'?athlete:null},
 pathway:{profile:(ref,opts)=>{calls.push(['pathway.profile',ref,opts]);return{status:'ok',athlete,closest:{pb:{distance:100,stroke:'Freestyle'},nextNational:{gap:{seconds:1.8}}},pbs:[{distance:100,stroke:'Freestyle',result_seconds:63.8}]}},eventAnswer:()=>({status:'ok'})},
 standards:{statusForResult:(ath,event,sec)=>{calls.push(['standards.statusForResult',ath,event,sec]);return{status:'ok',achieved:sec<=62?[{id:'nzsc',label:'NZSC',standard_kind:'qualifying',standard_seconds:62,gap:{achieved:true},points:{value:580}}]:[],next:sec>62?{id:'nzsc',label:'NZSC',standard_kind:'qualifying',standard_seconds:62,gap:{seconds:sec-62,achieved:false}}:null,nationalQualifying:sec<=62?[{id:'nzsc',label:'NZSC',standard_seconds:62,gap:{achieved:true}}]:[],records:sec<=58?[{id:'record',label:'Record',standard_seconds:58,gap:{achieved:true}}]:[]}},classificationStatus:()=>({status:'not_para'})},
 publication:{operationalMeetResults:()=>[{id:'provisional-fast',athlete_id:'molly',meet_id:'meet',race_id:'race',pool_course:'SCM',distance:100,stroke:'Freestyle',result_seconds:61.8,result_status:'finished',source_type:'poolside',permanent_eligible:false,publication_status:'operational_only'},{id:'verified',athlete_id:'molly',pool_course:'SCM',distance:100,stroke:'Freestyle',result_seconds:63.8,result_status:'finished',permanent_eligible:true,publication_status:'verified_publishable'},{id:'dq',athlete_id:'molly',pool_course:'SCM',distance:100,stroke:'Freestyle',result_seconds:57,result_status:'dq',permanent_eligible:false}],provisional:()=>({count:1})},
 raceModel:{target:spec=>{calls.push(['race.target',spec]);return spec.course==='SCM'?{status:'ok',target_seconds:spec.targetSeconds,event:{course:'SCM',distance_m:100,stroke:'Freestyle'},model:{id:'m'},segments:[{cumulative_distance_m:100,cumulative_seconds:spec.targetSeconds}]}:{status:'model_missing',segments:[]}},compare:(splits,target)=>({status:'ok',segments:splits,finish_delta_seconds:splits.at(-1)?.elapsed_seconds-target.target_seconds})}
};
const p=Projection.create(deps);

test('athlete projection keeps verified Pathway separate from provisional meet evidence',()=>{const x=p.athlete('molly',{course:'SCM',meetId:'meet'});assert.equal(x.status,'ok');assert.equal(x.verified_pathway.pbs[0].result_seconds,63.8);assert.equal(x.provisional_meet.signals.length,1);assert.equal(x.provisional_meet.signals[0].result_seconds,61.8)});
test('provisional result can carry immediate qualifier signal but remains labelled provisional',()=>{const s=p.provisionalMeetSignals('molly',{meetId:'meet'}).signals[0];assert.equal(s.status,'provisional');assert.equal(s.publication_status,'operational_only');assert.deepEqual(s.national_qualifying.map(x=>x.id),['nzsc']);assert(s.achieved.some(x=>x.id==='nzsc'))});
test('verified rows are not duplicated into provisional signal channel',()=>{const rows=p.provisionalMeetSignals('molly',{meetId:'meet'}).signals;assert(!rows.some(x=>x.result_id==='verified'))});
test('DQ provisional observation is retained by result input but not presented as a performance achievement',()=>{const rows=p.provisionalMeetSignals('molly',{meetId:'meet'}).signals;assert(!rows.some(x=>x.result_id==='dq'))});
test('projection delegates standards meaning rather than calculating qualification',()=>{calls.length=0;p.provisionalMeetSignals('molly',{});assert(calls.some(x=>x[0]==='standards.statusForResult'&&x[3]===61.8))});
test('race target is a delegated loaded model and missing model remains explicit',()=>{assert.equal(p.raceTarget('molly',{course:'SCM',distance:100,stroke:'Freestyle',targetSeconds:60}).status,'ok');assert.equal(p.raceTarget('molly',{course:'LCM',distance:100,stroke:'Freestyle',targetSeconds:60}).status,'model_missing')});
test('race comparison preserves target model result without inventing interpretation',()=>{const x=p.compareRace('molly',{course:'SCM',distance:100,stroke:'Freestyle',targetSeconds:60},[{distance_m:100,elapsed_seconds:60.5}]);assert.equal(x.comparison.status,'ok');assert(Math.abs(x.comparison.finish_delta_seconds-.5)<1e-9)});
test('missing athlete fails closed',()=>{assert.equal(p.athlete('nobody').status,'missing_athlete');assert.equal(p.raceTarget('nobody',{}).status,'missing_athlete')});
test('meetBoard excludes unresolved athlete identities',()=>{const x=p.meetBoard(['molly','nobody'],{course:'SCM'});assert.equal(x.length,1);assert.equal(x[0].athlete.id,'molly')});
test('incomplete dependency contract is rejected',()=>{assert.throws(()=>Projection.create({...deps,raceModel:{}}),/raceModel contract/)});
if(fails){console.error(`\n${fails} Performance Projection regression(s) failed`);process.exit(1)}console.log('\nALL PERFORMANCE PROJECTION REGRESSIONS PASS');
