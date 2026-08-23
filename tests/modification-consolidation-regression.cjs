'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const board=fs.readFileSync(require.resolve('../engines/board.js'),'utf8');
assert.match(board,/function modGroupKey\(/,'Board must group identical modified prescriptions');
assert.match(board,/Coordinator\.prescription/,'Board modifications must use the coordinated prescription path');
assert.match(board,/·REC/,'Board must expose recent-coach stroke provenance');
assert.match(board,/·PB/,'Board must expose PB-ranked stroke provenance');
assert.match(board,/·IM/,'Board must expose IM-context stroke provenance');

const Evidence=require('../engines/evidence.js');
global.MSOSEngines={
  Evidence,
  Modification:{adaptItem:item=>({...item})},
  RacePace:{forItem:()=>({status:'none'})},
  Aerobic:{forItem:()=>({status:'none'})}
};
const Coordinator=require('../engines/coordinator.js');
const session={id:'s'};
const athlete={id:'a'};
const state={settings:{storageRevision:1},adaptationOverrides:[]};
const impossible={id:'bad',kind:'set',reps:1,distance:100,stroke:'Freestyle',raw:'100 @ 1:00 target 1:06',text:'100 @ 1:00 target 1:06',targetSeconds:66,cycleSeconds:60,cues:[],repInstructions:[],repPattern:[]};
let target=Coordinator.targetForItem(session,impossible,athlete,state);
assert.equal(target.status,'missing');
assert.equal(target.conflict,'target_exceeds_sendoff');
assert.match(target.message,/target exceeds cycle/i);
assert.equal(target.seconds,66);
assert.equal(target.sendOff,60);

const possible={...impossible,id:'good',targetSeconds:55};
target=Coordinator.targetForItem(session,possible,athlete,state);
assert.equal(target.status,'ok');
assert.equal(target.seconds,55);

console.log('MODIFICATION_CONSOLIDATION_REGRESSION_PASS');
