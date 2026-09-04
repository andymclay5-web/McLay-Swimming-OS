'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let removed=0;
const meetBtn={remove:()=>removed++},meetNav={remove:()=>removed++};
global.document={addEventListener:()=>{},getElementById:id=>id==='meetModeBtn'?meetBtn:null,querySelectorAll:q=>q.includes('[data-nav="meet"]')?[meetNav]:[]};
global.MSOS4={
  BUILD:'test-build',
  util:{now:()=> '2026-09-01T06:00:00.000Z'},
  state:{canonicalSessions:{s:{id:'s',blocks:[{id:'main',items:[{id:'ol'},{id:'thr'}]}]}},attendance:[{session_id:'s',athlete_id:'mck',status:'present'}],adaptationOverrides:[],trainingTestResults:[],settings:{selectedSessionId:'s',view:'board',activeRole:'owner',activeUserAthleteId:'',assistantId:'',surfaceMode:'training',liveRevision:7}},
  access:{role:()=>global.MSOS4.state.settings.activeRole,sessionAllowed:()=>true},
  ui:{renderTV:()=>{global.MSOS4._tv=(global.MSOS4._tv||0)+1},renderSwimmer:()=>{}},
  live:{instanceId:'self',suppress:false}
};
require(path.resolve(__dirname,'../engines/live-training-authority.js'));
const M=global.MSOS4,L=M.live;
assert.equal(M.liveTrainingAuthority.build,'v4-live-training-authority-20260901d-no-meet-chrome');
assert.equal(M.liveTrainingAuthority.mode,'derived-displays-only');
assert.equal(removed,2,'Training authority must remove Meet header/nav chrome, not merely hide it');
const payload=L.payload(M.state);assert.equal(payload.authority,'coach-operational');assert.equal(payload.sourceView,'board');
const stale={kind:'v4-live-state',build:'test-build',from:'stale-tab',authority:'coach-operational',sourceView:'roll',sourceRole:'owner',surfaceMode:'training',sessionId:'s',session:{id:'s',blocks:[{id:'main',items:[{id:'ol'}]}]},attendance:[],adaptationOverrides:[],trainingTestResults:[],revision:99};
assert.equal(L.apply(stale),false);assert.equal(M.state.canonicalSessions.s.blocks[0].items.length,2);assert.equal(M.state.attendance.length,1);assert.equal(M.state.settings.selectedSessionId,'s');
M.state.settings.view='tv';const fresh={...stale,from:'coach-board',session:{id:'s',blocks:[{id:'main',items:[{id:'ol'},{id:'thr'},{id:'extra'}]}]},attendance:[{session_id:'s',athlete_id:'mck',status:'present'},{session_id:'s',athlete_id:'a',status:'present'}],revision:100};
assert.equal(L.apply(fresh),true);assert.equal(M.state.canonicalSessions.s.blocks[0].items.length,3);assert.equal(M.state.attendance.length,2);assert.equal(M._tv,1);
// A late / out-of-order broadcast older than what the display already applied must be
// dropped before it touches state — it cannot momentarily un-update the surface (§4).
const outOfOrder={...fresh,from:'lagging-tab',session:{id:'s',blocks:[{id:'main',items:[{id:'ol'}]}]},attendance:[],revision:100-1};
assert.equal(L.apply(outOfOrder),false,'stale-revision live message must be rejected');
assert.equal(M.state.canonicalSessions.s.blocks[0].items.length,3,'stale message must not mutate the applied session');
assert.equal(M.state.attendance.length,2,'stale message must not mutate applied attendance');
assert.equal(M._tv,1,'stale message must not trigger a re-render');
M.state.settings.view='swimmer';M.state.settings.activeRole='swimmer';assert.equal(L.apply({...fresh,from:'meet-screen',surfaceMode:'meet'}),false);
const nav=fs.readFileSync(path.resolve(__dirname,'../engines/navigation.js'),'utf8');
const applyHistory=nav.match(/N\.applyHistory=state=>\{([\s\S]*?)\};\n\n  let rootBackArmed/)?.[1]||'';
assert.ok(applyHistory,'navigation history owner must exist');
assert.doesNotMatch(applyHistory,/selectedSessionId\s*=/,'Android/browser Back must never select a different session');
assert.match(nav,/v4-navigation-session-selection-authority-20260901/,'session-selection authority build missing');
console.log('LIVE_TRAINING_STATE_AUTHORITY_PASS meet-chrome-removed history-cannot-switch-session');
