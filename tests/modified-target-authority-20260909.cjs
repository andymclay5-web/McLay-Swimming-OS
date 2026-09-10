'use strict';
// Real coaching failure this pins: a modified swimmer's Times-panel target could show the mainstream squad
// number instead of their own adapted target, and separately, a modified swimmer whose adaptation legitimately
// makes NO structural change (protecting a short quality/race-pace stimulus, per the coach's own modification
// philosophy) rendered on the Board with no visible explanation for why the numbers match the squad -- reported
// live by the coach: "Modified swimmers could be displayed beside the correct work but their target/time
// remained the same as the mainstream swimmer prescription... It must not merely display a swimmer's name
// beside unchanged mainstream numbers." Root-caused in architecture/RUNTIME_AUDIT_20260909.md §2.
//
// Two independent bugs, one test file, because they're the two sides of the same coaching-visible symptom:
//
// 1. engines/coordinator.js has two target functions -- prescription() adapts the item first (correct),
//    targetForItem() does not (only resolves stroke). engines/board-state.js's Times-panel `targetCard`
//    called targetForItem() directly on the raw item, so a "mainstream"-classified athlete who nonetheless
//    has an active per-item adaptationOverrides entry (a one-off coach override that doesn't trip the coarse
//    athlete-level modified/attendance/ratio classifier) got the un-adapted, mainstream number. Fixed by
//    switching that call to Coordinator.prescription(...).target, matching the order prescription() itself
//    already uses and the same convention board.js's own modCell() already followed at the initial-render
//    path (E.Coordinator.prescription?.(...)).
//
// 2. engines/modification.js's adaptItem() correctly makes zero structural change for short race-pace/quality
//    work (protecting the stimulus, per policy) and records why in `out.adaptationReason` -- but
//    engines/board.js's modCell() never rendered that reason anywhere. A coach watching a genuinely-modified
//    swimmer's short race-pace rep sit at the identical number to the mainstream squad had no way to tell
//    "correctly protected" apart from "modification pipeline did nothing." Fixed by rendering
//    `actual.adaptationReason` as a visible `.msos-mod-reason` line on every modified row that has one.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

global.MSOSEngines={};
global.MSOSEngines.Evidence=require('../engines/evidence.js');
global.MSOSEngines.RacePace=require('../engines/race-pace.js');
global.MSOSEngines.Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Modification=require('../engines/modification.js');
const Coordinator=require('../engines/coordinator.js');
global.MSOSEngines.Coordinator=Coordinator;
const Modification=global.MSOSEngines.Modification;

const session={id:'s1',identity:{course:'SCM'}};
const charlotte={id:'cm',full_name:'Charlotte Murphy',sex:'F'};
const baseState={
  athletes:[charlotte],trainingTestTypes:[],trainingTestResults:[],resultsEventHistory:[],coachResults:[],
  courseConversions:[],worldAquaticsBaseTimes:[],adaptationProfiles:[],adaptationOverrides:[],
  resultsPbBoard:[{athlete_id:'cm',distance:400,stroke:'Freestyle',course:'SCM',result_seconds:320,wa_points:600}],
};

// --- 1. The Times-panel mainstream-vs-adapted gap, reproduced against the real engines ---
const raceItem={id:'i1',kind:'set',reps:1,distance:400,raw:'1 x 400 Freestyle Race Pace',text:'1 x 400 Freestyle Race Pace',stroke:'Freestyle',cycleSeconds:null,restSeconds:null,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:{distance:400}};

const adapted=Modification.adaptItem(raceItem,charlotte,baseState,session);
assert.ok(adapted.distance<raceItem.distance,'fixture sanity: Charlotte (0.5 ratio) must actually get a shorter distance from adaptItem, or this test proves nothing');

const unadapted=Coordinator.targetForItem(session,raceItem,charlotte,baseState);
const adaptedResult=Coordinator.prescription(session,raceItem,charlotte,baseState).target;
assert.ok(unadapted.status==='ok'&&adaptedResult.status==='ok','fixture sanity: both paths must resolve a real target for this to be a meaningful comparison');
assert.notEqual(unadapted.seconds,adaptedResult.seconds,'targetForItem (unadapted) and prescription (adapted) must disagree on this fixture -- that disagreement IS the bug this test exists to catch; if they now match, targetForItem itself was changed to adapt and this fixture no longer demonstrates the gap the fix actually closed');

// The fix: board-state.js's Times-panel targetCard must read the target off Coordinator.prescription(...),
// never off the bare Coordinator.targetForItem(...) call that ignores adaptItem.
const boardState=fs.readFileSync(path.join(root,'engines','board-state.js'),'utf8');
assert.match(boardState,/E\.Coordinator\.prescription\(session,item,a,M\.state\)\.target/,'board-state.js\'s Times-panel targetCard must compute the target via Coordinator.prescription (adapted), not Coordinator.targetForItem (unadapted)');
assert.doesNotMatch(boardState,/const r=E\.Coordinator\.targetForItem\(session,item,a,M\.state\)/,'the old unadapted targetForItem call in targetCard must be gone, not left alongside the fix');

// --- 2. adaptationReason must actually reach the Board for a "correctly unchanged" modification ---
const shortQualityItem={id:'i2',kind:'set',reps:4,distance:50,raw:'4 x 50 #1 @ 1:30',text:'4 x 50 #1 @ 1:30',stroke:'Freestyle',cycleSeconds:90,restSeconds:null,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:{distance:100}};
const shortAdapted=Modification.adaptItem(shortQualityItem,charlotte,baseState,session);
assert.ok(shortAdapted.reps===shortQualityItem.reps&&shortAdapted.distance===shortQualityItem.distance,'fixture sanity: short race-pace work must be the "commonSafe" no-structural-change case for this to test the right branch');
assert.ok(text(shortAdapted.adaptationReason),'fixture sanity: adaptItem must still record a reason even when it makes no structural change');
function text(v){return String(v??'').replace(/\s+/g,' ').trim()}

const board=fs.readFileSync(path.join(root,'engines','board.js'),'utf8');
assert.match(board,/actual\?\.adaptationReason/,'board.js\'s modCell must read adaptationReason off the adapted item');
assert.match(board,/msos-mod-reason/,'board.js must render adaptationReason in a visible element (msos-mod-reason), not compute it and discard it');
const css=fs.readFileSync(path.join(root,'engines','board.css'),'utf8');
assert.match(css,/\.msos-mod-reason\{/,'board.css must style .msos-mod-reason so the reason text is actually visible, not an unstyled/invisible span');

// 3. The dead duplicate `targetCard` in board.js (zero callers, never exported) is confirmed gone -- it was
// an identical un-adapted landmine one wiring accident away from becoming live a second time.
assert.doesNotMatch(board,/function targetCard\(session,item,a\)\{const r=E\.Coordinator\.targetForItem/,'the dead, unadapted duplicate targetCard in board.js must stay removed');

console.log('MODIFIED_TARGET_AUTHORITY_PASS');
