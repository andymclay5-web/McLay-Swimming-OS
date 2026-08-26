'use strict';
const assert=require('node:assert/strict');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};

delete require.cache[require.resolve('../engines/reference-authority.js')];
global.MSOS4={
  state:{
    athletes:[
      {id:'athlete-elsie-knowles',full_name:'Elsie Knowles',active:true},
      {id:'athlete-other',full_name:'Other Swimmer',active:true}
    ],
    resultsPbBoard:[
      {id:'live-elsie',athlete_id:'athlete-elsie-knowles',full_name:'Elsie Knowles',course:'SCM',distance:200,stroke:'Freestyle',result_seconds:154.73},
      {id:'live-other',athlete_id:'athlete-other',full_name:'Other Swimmer',course:'SCM',distance:100,stroke:'Freestyle',result_seconds:60}
    ]
  },
  refs:{
    data:{results_pb_board:[
      {id:'fixture-elsie',athlete_id:'elsie',course:'SCM',distance:200,stroke:'Breaststroke',result_seconds:200.78}
    ]},
    get:()=>[]
  },
  util:{hash:s=>String(s).length}
};
require('../engines/reference-authority.js');
const rows=global.MSOS4.refs.get('results_pb_board');
assert.equal(rows.some(r=>r.id==='live-elsie'),false,'same swimmer leaked through under a second athlete id');
assert.equal(rows.some(r=>r.id==='fixture-elsie'),true,'authoritative reference row was lost');
assert.equal(rows.some(r=>r.id==='live-other'),true,'unrelated local swimmer was incorrectly removed');
assert.equal(global.MSOS4.refs.sameAthleteReference(rows.find(r=>r.id==='fixture-elsie'),{athlete_id:'athlete-elsie-knowles',full_name:'Elsie Knowles'}),true,'reference authority did not resolve canonical swimmer identity');
console.log('REFERENCE_AUTHORITY_IDENTITY_PASS');
