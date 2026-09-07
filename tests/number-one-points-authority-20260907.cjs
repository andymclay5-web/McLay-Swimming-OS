'use strict';
const assert=require('node:assert/strict');
const athlete={id:'mck',full_name:'McKenzie Drage',sex:'F'};
const state={settings:{storageRevision:1,view:'board'},adaptationOverrides:[{athleteId:'mck',active:true,patch:{stroke:'Breaststroke'},updatedAt:new Date().toISOString()}],timedSets:[]};
const ranked=[
  {row:{id:'im'},distance:200,stroke:'IM',course:'SCM',seconds:160,score:760},
  {row:{id:'free'},distance:100,stroke:'Freestyle',course:'SCM',seconds:60,score:710},
  {row:{id:'fly'},distance:100,stroke:'Butterfly',course:'SCM',seconds:67,score:680},
  {row:{id:'breast'},distance:100,stroke:'Breaststroke',course:'SCM',seconds:78,score:620}
];
global.MSOSEngines={
  Evidence:{course:r=>r.course||'',distance:r=>r.distance||0,rowStroke:r=>r.stroke||'',seconds:r=>r.seconds||0,key:s=>String(s).toLowerCase(),stroke:s=>s,pbRows:()=>ranked.map(x=>x.row),t400Rows:()=>[]},
  RacePace:{rankedEvents:()=>ranked}
};
global.MSOS4={state,pathway:{isPara:()=>false},waPointsEngine:{tableInfo:()=>({datasetId:'2026'})},strokeBalance:{recommendStroke:()=>({stroke:'Breaststroke',source:'old heuristic'})}};
global.addEventListener=()=>{};
require('../engines/performance.js');
const P=global.MSOS4.performanceEngine;
assert.ok(P);
const session={id:'s1',identity:{course:'SCM'}};
const one=P.selectStrokeForContext(athlete,{raw:'4x50 #1 @100p'},state,session,{formOnly:false});
assert.equal(one.stroke,'Freestyle','#1 must be the highest-WA ranked stroke PB, excluding IM as a stroke choice');
assert.match(one.source,/Highest ranked WA stroke PB/);
const oneF=P.selectStrokeForContext(athlete,{raw:'4x50 #1F @100p'},state,session,{formOnly:true});
assert.equal(oneF.stroke,'Butterfly','#1F must take the highest-WA non-Freestyle stroke');
assert.notEqual(one.stroke,'Breaststroke','recent coach stroke selections must not redefine #1');
console.log('NUMBER_ONE_POINTS_AUTHORITY_20260907_PASS');
