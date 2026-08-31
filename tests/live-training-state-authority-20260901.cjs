'use strict';
const assert=require('node:assert/strict'),path=require('node:path');

global.document={
  getElementById:()=>null,
  createElement:()=>({id:'',textContent:''}),
  head:{appendChild:()=>{}},
  addEventListener:()=>{}
};
global.MSOS4={
  BUILD:'test-build',
  util:{now:()=> '2026-09-01T06:00:00.000Z'},
  state:{
    canonicalSessions:{s:{id:'s',blocks:[{id:'main',items:[{id:'ol'},{id:'thr'}]}]}},
    attendance:[{session_id:'s',athlete_id:'mck',status:'present'}],
    adaptationOverrides:[],trainingTestResults:[],
    settings:{selectedSessionId:'s',view:'board',activeRole:'owner',activeUserAthleteId:'',assistantId:'',surfaceMode:'training',liveRevision:7}
  },
  access:{role:()=>global.MSOS4.state.settings.activeRole,sessionAllowed:()=>true},
  ui:{renderTV:()=>{global.MSOS4._tv=(global.MSOS4._tv||0)+1},renderSwimmer:()=>{}},
  live:{instanceId:'self',suppress:false}
};
require(path.resolve(__dirname,'../engines/live-training-authority.js'));
const M=global.MSOS4,L=M.live;
assert.equal(M.liveTrainingAuthority.build,'v4-live-training-authority-20260901a');
const payload=L.payload(M.state);assert.equal(payload.authority,'coach-operational');assert.equal(payload.sourceView,'board');
const stale={kind:'v4-live-state',build:'test-build',from:'stale-tab',authority:'coach-operational',sourceView:'roll',sourceRole:'owner',surfaceMode:'training',sessionId:'s',session:{id:'s',blocks:[{id:'main',items:[{id:'ol'}]}]},attendance:[],adaptationOverrides:[],trainingTestResults:[],revision:99};
assert.equal(L.apply(stale),false,'operational Board must ignore another tab/window broadcast');
assert.equal(M.state.canonicalSessions.s.blocks[0].items.length,2,'incoming stale session must not overwrite canonical Board truth');
assert.equal(M.state.attendance.length,1,'incoming stale attendance must not clear Roll on operational Board');
assert.equal(M.state.settings.selectedSessionId,'s','operational Board session selection must not be changed');
M.state.settings.view='tv';
const fresh={...stale,from:'coach-board',session:{id:'s',blocks:[{id:'main',items:[{id:'ol'},{id:'thr'},{id:'extra'}]}]},attendance:[{session_id:'s',athlete_id:'mck',status:'present'},{session_id:'s',athlete_id:'a',status:'present'}],revision:100};
assert.equal(L.apply(fresh),true,'derived TV must accept coach-operational live state');
assert.equal(M.state.canonicalSessions.s.blocks[0].items.length,3);assert.equal(M.state.attendance.length,2);assert.equal(M._tv,1);
M.state.settings.view='swimmer';M.state.settings.activeRole='swimmer';
assert.equal(L.apply({...fresh,from:'meet-screen',surfaceMode:'meet'}),false,'training derived surfaces must reject Meet broadcasts');
console.log('LIVE_TRAINING_STATE_AUTHORITY_PASS operational-board-immutable roll-preserved derived-display-follows-coach meet-isolated');
