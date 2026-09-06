'use strict';
// Real coaching failure this pins: on the live Board, an ambiguous "#1" race-intent set (stroke chosen per
// swimmer from evidence, not authored) could show THREE contradicting things for the same swimmer on the same
// row at once -- a prescribed label reading "Fr" (fabricated), a target panel reading "#1 stroke needed"
// (honest: no evidence resolved), and a stroke pill reading "Auto" (also honest). All three answer the same
// underlying question ("what stroke does this swimmer's #1 resolve to right now?") but only one of the several
// independently-written resolvers (Coordinator.contextualStroke, in engines/coordinator.js) silently guessed
// 'Freestyle' when nothing resolved, instead of reporting "unresolved" like its siblings (board.js's
// strokeInfo(), race-pace.js's resolveStroke()/forItem()) already correctly do. Reported live by the coach
// (McKenzie, 4x50 #1 @ 1:30, PRE block) via a third-party review of a screenshot of the running app.
//
// This test proves the fix using Coordinator.prescription()'s OWN single return value -- the same object the
// Board reads for both the row label and the target status -- rather than mocking board.js's rendering.
const assert=require('node:assert/strict');
global.MSOSEngines={};
global.MSOSEngines.Evidence=require('../engines/evidence.js');
global.MSOSEngines.RacePace=require('../engines/race-pace.js');
global.MSOSEngines.Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Modification=require('../engines/modification.js');
const Coordinator=require('../engines/coordinator.js');
global.MSOSEngines.Coordinator=Coordinator;

const session={id:'s1',identity:{course:'SCM'}};
const mckenzie={id:'mck',full_name:'McKenzie',sex:'F'};
const baseState={athletes:[mckenzie],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],courseConversions:[],worldAquaticsBaseTimes:[],adaptationProfiles:[],adaptationOverrides:[]};
// No MSOS4.performanceEngine is installed in this bare harness, so contextualStroke's performance-context
// lookup naturally no-ops (optional chaining) -- exactly reproducing "no evidence available" in production.

// 1. The real failure shape: an ambiguous #1 race-intent item with zero resolving evidence.
const ambiguousItem={id:'i1',kind:'set',reps:4,distance:50,raw:'4x50 #1 @ 1:30',text:'4x50 #1 @ 1:30',stroke:'',cycleSeconds:90,restSeconds:null,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:{distance:100}};

const resolved=Coordinator.contextualStroke(session,ambiguousItem,mckenzie,baseState);
assert.equal(resolved,'','contextualStroke must report unresolved (not fabricate Freestyle) for an ambiguous #1 item with no evidence');

const contextItem=Coordinator.resolvePrescriptionContext(session,ambiguousItem,mckenzie,baseState);
assert.ok(!contextItem.stroke,'resolvePrescriptionContext must not inject a fabricated stroke when nothing resolved');

const rx=Coordinator.prescription(session,ambiguousItem,mckenzie,baseState);
assert.ok(!rx.item.stroke,'prescription().item.stroke must stay unresolved -- this is the exact value the Board renders as the row label');
assert.equal(rx.target.status,'missing','prescription().target must agree the target is unresolved');
assert.match(rx.target.message||'',/stroke needed/i,'prescription().target.message should explain a stroke is needed');
// Cross-check: the label and the target status must never disagree -- that internal contradiction was the bug.
assert.ok(!(rx.item.stroke && rx.target.status==='missing'),'item.stroke and target.status must never disagree: a resolved label beside an unresolved target is exactly the production contradiction this test exists to catch');

// 2. Negative control: a bare, unlabelled Kick set (no #1, no race intent) must keep defaulting to Freestyle --
//    this is a pre-existing, accepted convention (matches board.js's own aerobic-default behaviour) and must
//    not regress just because the #1 case was tightened.
const kickItem={id:'i2',kind:'set',reps:8,distance:50,raw:'8x50 Kick @ 1:10',text:'8x50 Kick @ 1:10',stroke:'',cycleSeconds:70,restSeconds:null,repPattern:[{}],repInstructions:[],cues:[],equipment:[],composition:[]};
assert.equal(Coordinator.contextualStroke(session,kickItem,mckenzie,baseState),'Freestyle','a bare unlabelled Kick set must still default to Freestyle -- unrelated to the #1 fix');

// 3. Positive control: an explicit coach override must still win outright for a #1 item, unaffected by this fix.
const overriddenState={...baseState,adaptationOverrides:[{id:'ov1',sessionId:session.id,itemId:ambiguousItem.id,athleteId:mckenzie.id,patch:{stroke:'Backstroke'},active:true}]};
assert.equal(Coordinator.contextualStroke(session,ambiguousItem,mckenzie,overriddenState),'Backstroke','a coach-set explicit stroke override must still resolve immediately, ahead of any evidence lookup');

console.log('PRESCRIPTION_STROKE_AUTHORITY_PASS');
