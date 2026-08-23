'use strict';
const assert=require('node:assert/strict');

const para={id:'c',full_name:'Charlotte Murphy',current_s_class:'S6',current_sb_class:'SB6',current_sm_class:'SM6'};
const able={id:'a',full_name:'Able Swimmer'};
const rows=[
  {id:'im',athlete_id:'c',distance:200,stroke:'IM',course:'SCM',result_seconds:183,world_para_points:760,wa_points:100},
  {id:'bk',athlete_id:'c',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:82,world_para_points:720,wa_points:999},
  {id:'br',athlete_id:'c',distance:100,stroke:'Breaststroke',course:'SCM',result_seconds:99,wa_points:1000},
  {id:'af',athlete_id:'a',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:60,wa_points:600}
];
const Evidence={
  key:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,''),
  course:r=>String(r.course||'').toUpperCase(),
  distance:r=>Number(r.distance),
  rowStroke:r=>r.stroke,
  seconds:r=>Number(r.result_seconds),
  pbRows:ath=>rows.filter(r=>r.athlete_id===ath.id),
  stroke:v=>v
};
global.MSOSEngines={Evidence,RacePace:{rankedEvents:ath=>rows.filter(r=>r.athlete_id===ath.id&&r.wa_points).map(r=>({row:r,distance:r.distance,stroke:r.stroke,course:r.course,seconds:r.result_seconds,score:r.wa_points,pointSource:'WA'}))}};
global.MSOS4={
  state:{settings:{},adaptationOverrides:[]},
  pathway:{
    isPara:a=>!!a.current_s_class,
    paraClass:(a,st)=>st==='Breaststroke'?a.current_sb_class:st==='IM'?a.current_sm_class:a.current_s_class,
    points:(a,r)=>a.current_s_class?(r.world_para_points?{value:r.world_para_points,label:'World Para',source:'result'}:{value:null,label:'World Para',source:'classification-specific point model required'}):(r.wa_points?{value:r.wa_points,label:'WA',source:'result'}:{value:null,label:'WA'})
  },
  waPointsEngine:{tableInfo:()=>({}),equivalentTime:()=>null}
};
require('../engines/performance.js');
const P=global.MSOS4.performanceEngine;

assert.equal(P.scoreSystem(para),'WPS');
assert.equal(P.scoreSystem(able),'WA');
const ranked=P.rankedEvents(para,global.MSOS4.state,'SCM');
assert.deepEqual(ranked.map(r=>[r.stroke,r.points]),[['IM',760],['Backstroke',720]],'Para ranking must use WPS and ignore WA-only rows');
assert.equal(P.bestEvent(para,global.MSOS4.state,'SCM').stroke,'IM');
const breast=P.rows(para,global.MSOS4.state,'SCM').find(r=>r.stroke==='Breaststroke');
assert.equal(breast.points,null,'WA-only para result must not be relabelled as WPS');
assert.equal(breast.pointSystem,'WPS');
assert.equal(breast.paraClass,'SB6');
assert.equal(P.modeledEvent(para,global.MSOS4.state,{course:'SCM',distance:200,stroke:'Backstroke'}),null,'Para event suggestions must not use the WA equivalent-time model');
assert.equal(P.rankedEvents(able,global.MSOS4.state,'SCM')[0].pointSystem,'WA');
console.log('PERFORMANCE_WPS_REGRESSION_PASS');
