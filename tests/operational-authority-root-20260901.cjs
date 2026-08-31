'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const live=read('engines/live-training-authority.js'),repair=read('engines/session-repair.js'),storage=read('engines/storage.js'),nav=read('engines/navigation.js');

assert.doesNotMatch(live,/2026-09-01|SEP1_SOURCE|repairSep1Session|recoveredSep1TrainingTruth/,'live authority must never contain session/date-specific repair logic');
assert.match(live,/mode:'derived-displays-only'/,'live displays must be explicitly derived-only');
assert.match(repair,/mode='explicit-only'/,'session repair must be explicit-only');
assert.doesNotMatch(repair,/DOMContentLoaded[^\n]*boot|setTimeout\(boot|readyPromise[^\n]*repairStored/,'session repair must not auto-run after hydration');
assert.doesNotMatch(storage,/renderCurrent\?\.\(|renderCurrent\(/,'storage owner must never repaint UI after hydration');
assert.match(storage,/mergeBackgroundDurable/,'storage must merge background durable data without replacing operational truth');
assert.match(storage,/liveOperationalStatePreserved/,'storage must record the operational-preservation path');
assert.match(nav,/x\.hidden=!on/,'navigation must hard-unmount inactive view surfaces');
assert.match(nav,/surfaceMode=view==='meet'\?'meet':'training'/,'navigation must own Meet vs Training surface mode');

// Dynamic proof of the storage merge contract: persisted copies may add missing archive data,
// but they cannot replace a live canonical session, its Roll, or selected-session identity.
global.document={readyState:'complete',body:{dataset:{msosView:'board'}}};
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.MSOS4={BUILD:'test',util:{now:()=>new Date().toISOString(),uid:p=>`${p}-1`},store:{save:s=>s},state:{settings:{selectedSessionId:'live',view:'board'},canonicalSessions:{live:{id:'live',blocks:[{id:'main',items:[{id:'keep'}]}]}},attendance:[{session_id:'live',athlete_id:'a',status:'present'}],athletes:[],captures:[],timedSets:[],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],coachResults:[],athleteAchievements:[],adaptationOverrides:[{id:'ov1',sessionId:'live',athleteId:'a'}],meets:[],meetEntries:[],meetRaces:[],meetEvidence:[],pending:[],presenceEvents:[]}};
require(path.join(root,'engines/storage.js'));
const M=global.MSOS4;
M.storageEngine.mergeBackgroundDurable(M.state,{settings:{selectedSessionId:'stale'},canonicalSessions:{live:{id:'live',blocks:[{id:'main',items:[{id:'stale'}]}]},archive:{id:'archive',blocks:[]}},attendance:[],athletes:[{id:'b'}],adaptationOverrides:[]});
assert.equal(M.state.settings.selectedSessionId,'live');
assert.equal(M.state.canonicalSessions.live.blocks[0].items[0].id,'keep');
assert.equal(M.state.attendance.length,1);
assert.equal(M.state.attendance[0].athlete_id,'a');
assert.ok(M.state.canonicalSessions.archive,'missing archive session should still hydrate');
console.log('OPERATIONAL_AUTHORITY_ROOT_PASS canonical-live-state-immutable hydration-additive repair-explicit surface-owned');
