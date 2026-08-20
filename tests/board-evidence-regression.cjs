'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const RacePace=require('../engines/race-pace.js');
const Modification=require('../engines/modification.js');

const conor={id:'cf',full_name:'Conor Fischer'};
const state={athletes:[conor],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[],adaptationProfiles:[],adaptationOverrides:[]};
Evidence.ensureVerified(state);
const brT400=Evidence.t400Rows(conor,state,'Breaststroke');
assert.equal(brT400.length,1);
assert.equal(brT400[0].result_seconds,545.2);
assert.equal(RacePace.bestStroke(conor,state,'SCM',false),'Breaststroke');

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

const board=fs.readFileSync(require.resolve('../engines/board.js'),'utf8');
assert.match(board,/boardTargetAnchor/);
assert.match(board,/if\(!changed&&!needsTarget\)continue/);
assert.match(board,/Modified swimmers are shown beside their own work/);
const bridge=fs.readFileSync(require.resolve('../engines/bridge.js'),'utf8');
assert.match(bridge,/storageEngine\?\.readyPromise/);
assert.match(bridge,/hydrate\(\{force:true\}\)/);
assert.match(bridge,/pathwayEvidence/);
assert.match(bridge,/resultsPbBoard/);
const storage=fs.readFileSync(require.resolve('../engines/storage.js'),'utf8');
assert.match(storage,/saveUi/);
assert.match(storage,/mclay_swimming_os_v4_ui/);
const boardState=fs.readFileSync(require.resolve('../engines/board-state.js'),'utf8');
assert.match(boardState,/stopImmediatePropagation/);
assert.match(boardState,/boardExpandedTargetId/);
assert.doesNotMatch(boardState,/M\.store\?\.save/);

const easy={id:'easy',kind:'set',reps:1,distance:200,raw:'200 Easy',text:'200 Easy',stroke:'',cycleSeconds:null,restSeconds:null,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[]};
const charlotte={id:'cm',full_name:'Charlotte Murphy'};
const modState={athletes:[charlotte],adaptationProfiles:[],adaptationOverrides:[]};
const adjusted=Modification.adaptItem(easy,charlotte,modState,{id:'s',identity:{course:'SCM'}});
assert.equal(adjusted.distance,100);
assert.match(adjusted.raw,/^100\s+Easy$/);
assert.doesNotMatch(adjusted.raw,/200 Easy/);

console.log('BOARD_EVIDENCE_REGRESSION_PASS');
