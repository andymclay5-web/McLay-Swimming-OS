'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const RacePace=require('../engines/race-pace.js');
const Modification=require('../engines/modification.js');

const conor={id:'cf',full_name:'Conor Fischer',sex:'M'};
const state={athletes:[conor],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[],adaptationProfiles:[],adaptationOverrides:[]};
Evidence.ensureVerified(state);
const brT400=Evidence.t400Rows(conor,state,'Breaststroke');
assert.equal(brT400.length,1);
assert.equal(brT400[0].result_seconds,545.2);
// T400 proves an aerobic anchor, not a race-event rank. No PB evidence means #1 remains unknown.
assert.equal(RacePace.bestStroke(conor,state,'SCM',false),'');

state.resultsPbBoard=[
  {athlete_id:'cf',distance:100,stroke:'Breaststroke',course:'SCM',result_seconds:80,wa_points:620},
  {athlete_id:'cf',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:74,wa_points:590}
];
assert.equal(RacePace.bestStroke(conor,state,'SCM',false),'Breaststroke');

const race={id:'rp',kind:'set',reps:4,distance:50,raw:'4 x 50 #1 Stroke @ 2:30',text:'4 x 50 #1 Stroke @ 2:30',stroke:'',cycleSeconds:150,restSeconds:null,repPattern:[],cues:[],equipment:[],composition:[],raceIntent:null,repInstructions:[{rep:1,label:'Build',raceIntent:null},{rep:2,label:'100m Race Pace',raceIntent:{distance:100}},{rep:3,label:'100m Race Pace',raceIntent:{distance:100}},{rep:4,label:'100m Race Pace',raceIntent:{distance:100}}]};
const result=RacePace.forItem({id:'s',identity:{course:'SCM'}},race,conor,state,'');
assert.equal(result.status,'rep_race');
assert.equal(result.stroke,'Breaststroke');
assert.equal(result.rows.filter(x=>x.status==='ok').length,3);

const will={id:'will',full_name:'William Test'};
const willState={athletes:[will],resultsPbBoard:[
  {athlete_id:'will',distance:400,stroke:'IM',course:'SCM',result_seconds:300,wa_points:700},
  {athlete_id:'will',distance:400,stroke:'Freestyle',course:'SCM',result_seconds:260,wa_points:650},
  {athlete_id:'will',distance:100,stroke:'Butterfly',course:'SCM',result_seconds:62,wa_points:640},
  {athlete_id:'will',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:66,wa_points:610}
],resultsEventHistory:[],coachResults:[],worldAquaticsBaseTimes:[]};
assert.equal(RacePace.bestEvent(will,willState,'SCM').stroke,'IM');
assert.equal(RacePace.bestStroke(will,willState,'SCM',false),'Freestyle');
assert.equal(RacePace.bestStroke(will,willState,'SCM',true),'Butterfly');

const female={id:'female',full_name:'Female Test',sex:'F'};
const femaleState={athletes:[female],resultsPbBoard:[{athlete_id:'female',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:60}],resultsEventHistory:[],coachResults:[],worldAquaticsBaseTimes:[
  {id:'m',course:'SCM',distance:100,stroke:'Freestyle',sex:'Male',base_seconds:55,active:true},
  {id:'f',course:'SCM',distance:100,stroke:'Freestyle',sex:'Female',base_seconds:50,active:true}
]};
const femaleRank=RacePace.rankedEvents(female,femaleState,'SCM')[0];
assert.ok(femaleRank);
assert.equal(femaleRank.baseSeconds,50);
assert.equal(femaleRank.score,Math.floor(1000*Math.pow(50/60,3)));

const board=fs.readFileSync(require.resolve('../engines/board.js'),'utf8');
// Board should keep a modified swimmer visible when either the prescription changed OR the line carries timing/stroke interaction.
assert.match(board,/function timingIntent\(/);
assert.match(board,/if\(!changed&&!showTiming\)continue/);
assert.match(board,/showTiming\?strokePill/);
assert.match(board,/function modified\(/);
assert.match(board,/msos-mod-target/);
assert.match(board,/data-msos-ath/);
const bridge=fs.readFileSync(require.resolve('../engines/bridge.js'),'utf8');
assert.match(bridge,/storageEngine\?\.readyPromise/);
assert.match(bridge,/refs\?\.boot/);
assert.match(bridge,/mergeReferenceEvidence/);
assert.match(bridge,/resultsPbBoard/);
assert.doesNotMatch(bridge,/pathwayEvidence\(\)/);
const storage=fs.readFileSync(require.resolve('../engines/storage.js'),'utf8');
assert.match(storage,/saveUi/);
assert.match(storage,/mclay_swimming_os_v4_ui/);
assert.match(storage,/if\(state!==M\.state\)/);
assert.match(storage,/if\(!S\.ready\)/);
assert.match(storage,/localRicher/);
const startupGate=fs.readFileSync(require.resolve('../engines/startup-gate.js'),'utf8');
assert.match(startupGate,/storageEngine/);
assert.match(startupGate,/boardExpandedTargetId=''/);
assert.match(startupGate,/Loading saved session/);
const guardianRuntime=fs.readFileSync(require.resolve('../engines/guardian-runtime.js'),'utf8');
assert.match(guardianRuntime,/startupRunSuppressed/);
assert.match(guardianRuntime,/deferred:true/);
const referenceBridge=fs.readFileSync(require.resolve('../engines/reference-bridge.js'),'utf8');
assert.match(referenceBridge,/world_aquatics_base_times:'worldAquaticsBaseTimes'/);
assert.match(referenceBridge,/results_pb_board:'resultsPbBoard'/);
const evidenceIndex=fs.readFileSync(require.resolve('../engines/evidence-index.js'),'utf8');
assert.match(evidenceIndex,/E\.pbRows=/);
assert.match(evidenceIndex,/pbById/);
const t400Capture=fs.readFileSync(require.resolve('../engines/t400-capture.js'),'utf8');
assert.match(t400Capture,/liveState=state===M\.state/);
assert.match(t400Capture,/if\(liveState\)/);
const boardState=fs.readFileSync(require.resolve('../engines/board-state.js'),'utf8');
assert.match(boardState,/stopImmediatePropagation/);
assert.match(boardState,/boardExpandedTargetId/);
assert.match(boardState,/insertAdjacentHTML/);
assert.match(boardState,/data-msos-fast-stroke/);
assert.match(boardState,/function openPanel\(btn\)\{[^\n]*saveUi\(\)[^\n]*insertAdjacentHTML/);
assert.doesNotMatch(boardState,/function openPanel\(btn\)\{[^\n]*saveData\(\)/);
assert.match(boardState,/function setStroke\(session,item,ath,value\)\{[^\n]*saveData\(\)/);
const navigation=fs.readFileSync(require.resolve('../engines/navigation.js'),'utf8');
assert.match(navigation,/saveUi/);
assert.doesNotMatch(navigation,/M\.store\?*\.save|M\.store\.save/);
const performance=fs.readFileSync(require.resolve('../engines/performance.js'),'utf8');
assert.match(performance,/bestEvent/);
assert.match(performance,/bestFormStroke/);
assert.match(performance,/selectStrokeForContext/);
assert.match(performance,/E\.RacePace\.rankedEvents/);
assert.doesNotMatch(performance,/M\.pathway\?\.event/);
const raceSource=fs.readFileSync(require.resolve('../engines/race-pace.js'),'utf8');
assert.match(raceSource,/baseCache/);
assert.match(raceSource,/FEMALE/);
const repair=fs.readFileSync(require.resolve('../engines/session-repair.js'),'utf8');
assert.match(repair,/sourceVerifiedMismatch/);
assert.match(repair,/old\?\.currentSource\?\.text/);
assert.match(repair,/repairStored\(\{all=false\}/);
const balance=fs.readFileSync(require.resolve('../engines/stroke-balance.js'),'utf8');
assert.match(balance,/incidentalFree/);
assert.match(balance,/weeklyEmphasis/);
assert.match(balance,/recommendStroke/);
assert.match(balance,/Date\.now\(\)/);
const reporting=fs.readFileSync(require.resolve('../engines/reporting.js'),'utf8');
assert.match(reporting,/Stroke focus/);
assert.match(reporting,/T400 \/ tests/);
assert.match(reporting,/registerField/);
assert.match(reporting,/spec\.days===undefined/);

const easy={id:'easy',kind:'set',reps:1,distance:200,raw:'200 Easy',text:'200 Easy',stroke:'',cycleSeconds:null,restSeconds:null,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[]};
const charlotte={id:'cm',full_name:'Charlotte Murphy'};
const modState={athletes:[charlotte],adaptationProfiles:[],adaptationOverrides:[]};
const adjusted=Modification.adaptItem(easy,charlotte,modState,{id:'s',identity:{course:'SCM'}});
assert.equal(adjusted.distance,100);
