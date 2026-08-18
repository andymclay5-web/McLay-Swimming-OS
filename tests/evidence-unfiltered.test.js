'use strict';
const assert=require('assert');
const Entities=require('../engines/entity-registry.js');
const E=require('../engines/evidence-retrieval.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const sources=[{id:'verified',priority:100,trust:'verified',data:{athletes:[{id:'a',full_name:'A Swimmer'}],coach_results:[{id:'r1',athlete_id:'a',distance:50,stroke:'Freestyle',pool_course:'SCM',result_seconds:30,result_date:'2026-01-01'},{id:'r2',athlete_id:'a',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:62,result_date:'2026-02-01'},{id:'r3',athlete_id:'a',distance:200,stroke:'Freestyle',pool_course:'LCM',result_seconds:140,result_date:'2026-03-01'}]}}];
const evidence=E.create({sources,entities:Entities.create({sources})});
test('omitted distance filter means all distances, not zero metres',()=>{const rows=evidence.results('a',{});assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.distance).sort((a,b)=>a-b),[50,100,200])});
test('null and blank numeric filters remain unset',()=>{assert.equal(evidence.results('a',{distance:null}).length,3);assert.equal(evidence.results('a',{distance:''}).length,3)});
test('explicit zero remains an actual zero filter rather than an omitted filter',()=>{assert.equal(evidence.results('a',{distance:0}).length,0)});
test('specific filters still work after null semantics fix',()=>{const rows=evidence.results('a',{distance:100,stroke:'Freestyle',course:'SCM'});assert.equal(rows.length,1);assert.equal(rows[0].id,'r2')});
if(fails){console.error(`\n${fails} unfiltered evidence regression(s) failed`);process.exit(1)}console.log('\nALL UNFILTERED EVIDENCE REGRESSIONS PASS');
