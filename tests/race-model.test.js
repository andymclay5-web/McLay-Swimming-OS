'use strict';
const assert=require('assert');
const Race=require('../engines/race-model.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const models=[{id:'100-free-scm-demo',name:'Loaded 100 Free SCM model',version:'1',course:'SCM',distance_m:100,stroke:'Freestyle',source:'coach-approved test fixture',segments:[{distance_m:25,fraction:.22,label:'25'},{distance_m:25,fraction:.25,label:'50'},{distance_m:25,fraction:.26,label:'75'},{distance_m:25,fraction:.27,label:'100'}]}];
const r=Race.create({models});

test('model requires explicit event-matched loaded definition',()=>{assert.equal(r.match({course:'SCM',distance:100,stroke:'Free'}).status,'ok');assert.equal(r.match({course:'LCM',distance:100,stroke:'Free'}).status,'missing')});
test('missing model returns explicit status instead of inventing even splits',()=>{const x=r.target({targetSeconds:60,course:'LCM',distance:100,stroke:'Freestyle'});assert.equal(x.status,'model_missing');assert.equal(x.segments.length,0)});
test('target applies loaded fractions and preserves exact target total',()=>{const x=r.target({targetSeconds:60,course:'SCM',distance:100,stroke:'Freestyle'});assert.equal(x.status,'ok');assert.equal(x.segments.length,4);assert(Math.abs(x.segments[0].split_seconds-13.2)<1e-9);assert(Math.abs(x.segments[3].cumulative_seconds-60)<1e-9);assert.equal(x.model.source,'coach-approved test fixture')});
test('target rejects named model used for wrong event',()=>{const x=r.target({targetSeconds:60,course:'LCM',distance:100,stroke:'Freestyle',modelId:'100-free-scm-demo'});assert.equal(x.status,'model_event_mismatch')});
test('comparison reports cumulative deltas against model without reinterpreting result meaning',()=>{const target=r.target({targetSeconds:60,course:'SCM',distance:100,stroke:'Freestyle'}),x=r.compare([{distance_m:25,elapsed_seconds:13.4},{distance_m:50,elapsed_seconds:28.5},{distance_m:75,elapsed_seconds:44.2},{distance_m:100,elapsed_seconds:60.8}],target);assert.equal(x.status,'ok');assert(Math.abs(x.segments[0].cumulative_delta_seconds-.2)<1e-9);assert(Math.abs(x.finish_delta_seconds-.8)<1e-9)});
test('invalid fraction total is rejected at load rather than silently normalized',()=>{assert.throws(()=>Race.create({models:[{id:'bad',course:'SCM',distance:100,stroke:'Free',segments:[{distance_m:50,fraction:.4},{distance_m:50,fraction:.4}]}]}),/fractions must sum to 1/)});
test('invalid segment distance total is rejected at load',()=>{assert.throws(()=>Race.create({models:[{id:'bad',course:'SCM',distance:100,stroke:'Free',segments:[{distance_m:25,fraction:.5},{distance_m:25,fraction:.5}]}]}),/distances must equal event distance/)});
test('ambiguous matching fails explicitly',()=>{const e=Race.create({models:[models[0],{...models[0],id:'other'}]});assert.equal(e.match({course:'SCM',distance:100,stroke:'Free'}).status,'ambiguous');assert.equal(e.target({targetSeconds:60,course:'SCM',distance:100,stroke:'Free'}).status,'model_ambiguous')});
if(fails){console.error(`\n${fails} Race Model regression(s) failed`);process.exit(1)}console.log('\nALL RACE MODEL REGRESSIONS PASS');
