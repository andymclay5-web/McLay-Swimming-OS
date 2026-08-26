'use strict';
const assert=require('node:assert/strict');

const athlete={id:'im1',full_name:'IM Primary'};
const rows=[
  {id:'im',athlete_id:'im1',distance:200,stroke:'IM',course:'SCM',result_seconds:125,wa_points:700},
  {id:'fr',athlete_id:'im1',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:58,wa_points:650},
  {id:'bk',athlete_id:'im1',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:66,wa_points:620}
];
const Evidence={
  key:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,''),
  course:r=>String(r.course||'').toUpperCase(),
  distance:r=>Number(r.distance),
  rowStroke:r=>r.stroke,
  seconds:r=>Number(r.result_seconds),
  pbRows:ath=>rows.filter(r=>r.athlete_id===ath.id),
  t400Rows:()=>[],
  stroke:v=>v
};
global.MSOSEngines={Evidence,RacePace:{rankedEvents:ath=>rows.filter(r=>r.athlete_id===ath.id).map(r=>({row:r,distance:r.distance,stroke:r.stroke,course:r.course,seconds:r.result_seconds,score:r.wa_points,pointSource:'WA'})).sort((a,b)=>b.score-a.score)}};
let deepCalls=0;
global.MSOS4={
  state:{settings:{view:'board'},adaptationOverrides:[]},
  pathway:{isPara:()=>false,points:(_a,r)=>({value:r.wa_points,label:'WA',source:'result'})},
  waPointsEngine:{tableInfo:()=>({}),equivalentTime:()=>null},
  strokeBalance:{recommendStroke:()=>{deepCalls++;return{stroke:'Breaststroke',source:'deep weekly balance',confidence:'high'};}}
};
require('../engines/performance.js');
const P=global.MSOS4.performanceEngine,session={id:'s1',identity:{course:'SCM'}};
const deck=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,0,'Board target resolution must not invoke deep weekly stroke-balance analysis');
assert.equal(deck.stroke,'Freestyle','Deck fast path should use highest-ranked usable stroke PB when no recent coach override exists');
assert.match(deck.source,/deck fast path/i);

global.MSOS4.state.settings.view='athletes';
P.invalidate(global.MSOS4.state);
const deep=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,1,'Non-deck performance context should retain deep stroke-balance analysis');
assert.equal(deep.stroke,'Breaststroke');
console.log('DECK_FAST_STROKE_RESOLUTION_PASS');
