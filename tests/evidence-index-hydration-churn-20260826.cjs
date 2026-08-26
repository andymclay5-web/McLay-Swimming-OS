'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');

globalThis.MSOSEngines={Evidence:{
  key:v=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,''),
  rowName:r=>r?.full_name||'',
  seconds:r=>Number(r?.result_seconds),
  distance:r=>Number(r?.distance),
  rowStroke:r=>r?.stroke||'',
  course:r=>r?.pool_course||'',
  pbRows:()=>[],
  t400Rows:()=>[],
  stroke:v=>String(v||''),
  isT400:()=>false,
  t400Stroke:()=>''
}};
require(path.join('..','engines','evidence-index.js'));
const X=globalThis.MSOSEvidenceIndex;
assert.equal(typeof X?.build,'function','Evidence index did not load');
assert.equal(typeof X?.stats,'function','Evidence index build counter is unavailable');
const athletes=Array.from({length:17},(_,i)=>({id:`ath-${i+1}`,full_name:`Athlete ${i+1}`}));
const resultsPbBoard=Array.from({length:8580},(_,i)=>({
  id:`pb-${i}`,
  athlete_id:athletes[i%athletes.length].id,
  full_name:athletes[i%athletes.length].full_name,
  distance:[50,100,200,400][i%4],
  stroke:['Freestyle','Backstroke','Breaststroke','Butterfly'][i%4],
  pool_course:'SCM',
  result_seconds:25+(i%300)/10
}));
const state={athletes,resultsPbBoard,resultsEventHistory:[],coachResults:[],trainingTestResults:[],trainingTestTypes:[],_refs:{},_evidenceBridge:{hydratedAt:'2026-08-26T00:00:00.000Z',contentRevision:7}};
const first=X.build(state),before=X.stats().buildCount;
for(let i=0;i<100;i++){
  state._evidenceBridge.hydratedAt=`2026-08-26T00:00:${String(i%60).padStart(2,'0')}.${String(i).padStart(3,'0')}Z`;
  const again=X.build(state);
  assert.strictEqual(again,first,`hydratedAt-only churn rebuilt evidence index at iteration ${i}`);
}
assert.equal(X.stats().buildCount,before,'hydratedAt-only churn increased evidence-index build count');
state._evidenceBridge.contentRevision++;
const changed=X.build(state);
assert.notStrictEqual(changed,first,'contentRevision change did not rebuild evidence index');
assert.equal(X.stats().buildCount,before+1,'contentRevision change did not increment evidence-index build count exactly once');
console.log(`EVIDENCE_INDEX_HYDRATION_CHURN_PASS rows=${resultsPbBoard.length} timestampChanges=100 builds=${X.stats().buildCount}`);
