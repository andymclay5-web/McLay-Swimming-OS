'use strict';
const assert=require('node:assert/strict');
const E=require('../engines/evidence.js');
global.MSOSEngines={Evidence:E};
const A=require('../engines/aerobic.js');

const ath={id:'mck',full_name:'McKenzie Drage'};
const state={
  athletes:[ath],
  trainingTestTypes:[{id:'t400',test_key:'T400 Freestyle'}],
  trainingTestResults:[
    {id:'old-fast',athlete_id:'mck',test_type_id:'t400',result_seconds:441,result_date:'2026-03-01',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'},
    {id:'current',athlete_id:'mck',test_type_id:'t400',result_seconds:480,result_date:'2026-08-20',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}
  ]
};
let rows=E.t400Rows(ath,state,'Freestyle');
assert.equal(rows[0].id,'current','most recent dated valid T400 must own the aerobic anchor, not fastest-ever test');
assert.equal(E.seconds(rows[0]),480);

const item={id:'aer',kind:'set',reps:2,distance:200,stroke:'Freestyle',zone:'Regeneration',restSeconds:10,raw:'2 x 200 Freestyle Regeneration 10 seconds rest'};
let out=A.forItem({id:'s'},item,ath,state,'');
assert.equal(out.status,'ok');
assert.ok(out.seconds>270&&out.seconds<280,`expected current ~8:00 T400 to drive 200 Regeneration around 4:34, got ${out.seconds}`);
assert.equal(out.sendOff,285,'10 sec authored rest should produce a 4:45 send-off from the recalculated 200 target');

const undated={...state,trainingTestResults:[
  {id:'undated-slower',athlete_id:'mck',test_type_id:'t400',result_seconds:500,stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'},
  {id:'undated-faster',athlete_id:'mck',test_type_id:'t400',result_seconds:470,stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}
]};
rows=E.t400Rows(ath,undated,'Freestyle');
assert.equal(rows[0].id,'undated-faster','legacy undated evidence retains previous fastest-valid fallback ordering');

const invalidNew={...state,trainingTestResults:[...state.trainingTestResults,{id:'new-invalid',athlete_id:'mck',test_type_id:'t400',result_seconds:520,result_date:'2026-08-30',stroke:'Freestyle',distance:400,valid_for_anchor:false,source_type:'training_test'}]};
rows=E.t400Rows(ath,invalidNew,'Freestyle');
assert.equal(rows[0].id,'current','invalidated newer tests must not become anchors');
console.log('T400_CURRENT_ANCHOR_PASS latest-dated-valid-test owns aerobic target; undated fallback preserved');
