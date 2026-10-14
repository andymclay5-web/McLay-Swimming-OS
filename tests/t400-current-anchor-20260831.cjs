'use strict';
// 31 Aug 2026 (PR #117) made the newest valid T400 the aerobic anchor. 15 Oct 2026 Andy reversed that: "the fastest
// time 400 of that stroke, not the latest" (Ashley Brown was being paced off a slow latest test). This file now
// guards the current rule: the FASTEST valid T400 for the stroke owns the aerobic anchor; same time -> newer test;
// a test marked not valid is never used. See also tests/t400-fastest-anchor-20261015.cjs (real app, real data).
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
assert.equal(rows[0].id,'old-fast','the fastest valid T400 owns the aerobic anchor, not a newer slower test');
assert.equal(E.seconds(rows[0]),441);

const item={id:'aer',kind:'set',reps:2,distance:200,stroke:'Freestyle',zone:'Regeneration',restSeconds:10,raw:'2 x 200 Freestyle Regeneration 10 seconds rest'};
let out=A.forItem({id:'s'},item,ath,state,'');
assert.equal(out.status,'ok');
assert.ok(out.seconds>246&&out.seconds<256,`expected the 7:21 fastest T400 to drive 200 Regeneration around 4:11, got ${out.seconds}`);
assert.equal(out.sendOff,265,'10 sec authored rest should produce a 4:25 send-off from the 200 target');
const slowOnly=A.forItem({id:'s'},item,ath,{...state,trainingTestResults:[state.trainingTestResults[1]]},'');
assert.ok(slowOnly.seconds-out.seconds>15,'the slower test alone gives a clearly slower target (proves the anchor choice matters)');

const tie={...state,trainingTestResults:[...state.trainingTestResults,{id:'new-same',athlete_id:'mck',test_type_id:'t400',result_seconds:441,result_date:'2026-09-01',stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}]};
rows=E.t400Rows(ath,tie,'Freestyle');
assert.equal(rows[0].id,'new-same','same time twice -> the newer test');

const undated={...state,trainingTestResults:[
  {id:'undated-slower',athlete_id:'mck',test_type_id:'t400',result_seconds:500,stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'},
  {id:'undated-faster',athlete_id:'mck',test_type_id:'t400',result_seconds:470,stroke:'Freestyle',distance:400,valid_for_anchor:true,source_type:'training_test'}
]};
rows=E.t400Rows(ath,undated,'Freestyle');
assert.equal(rows[0].id,'undated-faster','undated tests: fastest valid');

const invalidFast={...state,trainingTestResults:[...state.trainingTestResults,{id:'fast-invalid',athlete_id:'mck',test_type_id:'t400',result_seconds:400,result_date:'2026-08-30',stroke:'Freestyle',distance:400,valid_for_anchor:false,source_type:'training_test'}]};
rows=E.t400Rows(ath,invalidFast,'Freestyle');
assert.equal(rows[0].id,'old-fast','a test marked not valid never becomes the anchor, however fast');
console.log('T400_CURRENT_ANCHOR_PASS fastest valid test owns the aerobic target; invalid tests excluded');
