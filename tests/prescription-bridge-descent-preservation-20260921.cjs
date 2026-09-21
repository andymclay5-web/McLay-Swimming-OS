'use strict';
// Real bug this fixes, found during the 21 Sept 2026 engine-audit/spine review (not yet reported by Andy
// live -- caught by auditing engine boundaries against architecture/AUTHORITY_MAP.md, not by a field report):
// engines/bridge.js's M.adapt.item is the ONE sanctioned way every other part of the app calls
// E.Modification.adaptItem() (app.js's mod-edit modal, v4-correct.js's lane grouping both go through it) --
// because adaptItem() alone can regenerate a descending-pattern cue ("Desc 1-3") against the swimmer's
// CONDENSED rep count instead of the coach's originally authored range, and M.adapt.item's own
// preserveRepeatingDescent() wrapper exists specifically to restore the authored text afterward (see
// bridge.js's own comment on that function).
//
// engines/coordinator.js's prescription() -- the function board-state.js's Times-panel targetCard/
// hydrateVisibleModTargets AND board.js's modCell() have all depended on for the live Board display since
// the 9 Sept modified-target-authority fix (tests/modified-target-authority-20260909.cjs) -- called
// E.Modification.adaptItem() DIRECTLY, bypassing the bridge and its cue-preservation entirely. Net effect: a
// modified swimmer's descending-pattern cue could show correctly in the mod-edit modal (which goes through
// the bridge) but wrong/regenerated on the live Board for the exact same item and athlete -- two different
// answers for the same swimmer's same set, on two different parts of the same screen.
//
// Fixed: prescription() now calls the real M.adapt.item wrapper when the engine bridge has loaded (root.MSOS4
// .adapt.item), falling back to a direct adaptItem() call only when it hasn't (e.g. this module used
// standalone, as several existing tests -- modified-target-authority-20260909.cjs,
// board-mod-reason-not-on-board-20260913.cjs -- already do without loading bridge.js at all; both keep
// passing unchanged since that fallback reproduces this function's exact pre-fix behaviour).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function text(v){return String(v??'').replace(/\s+/g,' ').trim()}

// A minimal, controlled stand-in for engines/modification.js's real adaptItem(): simulates the exact real
// shape this bug depends on -- a swimmer whose reps genuinely condense (6 -> 2, a real ~0.33 load ratio) and
// whose own regenerated cue/raw naturally re-describes the descending pattern against the NEW rep count
// ("Desc 1-2") rather than the coach's originally authored 3-rep range. Using a controlled double here (rather
// than a real modification.js fixture) keeps this test focused on the ONE thing that changed -- whether
// prescription() routes adaptItem's output through the bridge's cue-preservation step -- without also having
// to reverse-engineer modification.js's own real rep-condensation branch, which is separately covered by its
// own tests.
function makeFakeModification(){
  return{
    adaptItem(item){
      const delivered=2;
      return{...item,reps:delivered,cues:['Desc 1-2'],raw:'2 x 50 Desc 1-2',text:'2 x 50 Desc 1-2'};
    },
    samePrescription(a,b){return JSON.stringify(a)===JSON.stringify(b)},
    profile(){return{ratio:1}},
  };
}

const session={id:'s1',identity:{course:'SCM'}};
const charlotte={id:'cm',full_name:'Charlotte Murphy',sex:'F'};
const state={athletes:[charlotte],adaptationOverrides:[],adaptationProfiles:[]};
const item={id:'i1',kind:'set',reps:6,distance:50,raw:'6 x 50 Desc 1-3',text:'6 x 50 Desc 1-3',stroke:'Freestyle',cycleSeconds:60,restSeconds:null,repPattern:[],repInstructions:[],cues:['Desc 1-3'],equipment:[],composition:[],raceIntent:null};

// --- Boot a real engine bridge (the exact same stack index.html loads: app.js/v4-correct.js/
// v4-poolside-core.js provide M.adapt={}/M.targets={}, then coordinator.js, then bridge.js wires M.adapt.item
// onto it) with the controlled fake Modification standing in for the real one, in an isolated vm sandbox so
// this test's globals never leak into or collide with any other test file run in the same process. ---
function bootSandbox(coordinatorSrc){
  const sandbox={
    scrollY:0,requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 1;},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}},
    location:{hash:'',href:'https://prescription-bridge-descent.test/'},
    history:{state:null,replaceState(){},pushState(){},back(){}},
    addEventListener:()=>{},removeEventListener:()=>{},console,
  };
  sandbox.globalThis=sandbox;sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),sandbox,{filename:'app.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-correct.js'),'utf8'),sandbox,{filename:'v4-correct.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-poolside-core.js'),'utf8'),sandbox,{filename:'v4-poolside-core.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','evidence.js'),'utf8'),sandbox,{filename:'evidence.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','race-pace.js'),'utf8'),sandbox,{filename:'race-pace.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','aerobic.js'),'utf8'),sandbox,{filename:'aerobic.js'});
  sandbox.MSOSEngines.Modification=makeFakeModification();
  vm.runInContext(coordinatorSrc,sandbox,{filename:'coordinator.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','bridge.js'),'utf8'),sandbox,{filename:'bridge.js'});
  assert.ok(sandbox.MSOS4?.adapt?.item,'test setup error: bridge.js did not wire M.adapt.item into the sandbox');
  return sandbox;
}

// --- 1. The real fix, exercised against the real coordinator.js + real bridge.js ---
const realCoordinatorSrc=fs.readFileSync(path.join(__dirname,'..','engines','coordinator.js'),'utf8');
const fixedSandbox=bootSandbox(realCoordinatorSrc);
const fixedResult=fixedSandbox.MSOSEngines.Coordinator.prescription(session,item,charlotte,state);

assert.ok(fixedResult.item.cues.some(c=>text(c)==='Desc 1-3'),`the live Board's own prescription() must preserve the coach's authored "Desc 1-3" cue via the bridge, got cues=${JSON.stringify(fixedResult.item.cues)}`);
assert.ok(!fixedResult.item.cues.some(c=>/Desc\s+1-2/i.test(c)),`the wrongly-regenerated "Desc 1-2" cue must not survive once routed through the bridge, got cues=${JSON.stringify(fixedResult.item.cues)}`);
assert.equal(fixedResult.item.raw,'2 x 50 Desc 1-3','the headline raw/text must also read back the authored 3-rep pattern, not the regenerated 2-rep one');
assert.equal(fixedResult.item.authoredPatternPreserved,true,'preserveRepeatingDescent must mark the item as having had its authored pattern restored');

console.log('PRESCRIPTION_BRIDGE_DESCENT_PRESERVATION_PASS');

// --- 2. Fail-before: the exact pre-fix coordinator.js (adaptItem called directly, bypassing the bridge) must
// reproduce the real bug -- proving this test would have caught it. Same real bridge.js, same fake
// Modification, only coordinator.js's one line reverted. ---
const fixedLine='const intent=normalizeIntent(item),contextual=resolvePrescriptionContext(session,intent,ath,state),adapt=root.MSOS4?.adapt?.item,modified=adapt?adapt(contextual,ath,state,session):E.Modification.adaptItem(contextual,ath,state,session),';
const buggyLine='const intent=normalizeIntent(item),contextual=resolvePrescriptionContext(session,intent,ath,state),modified=E.Modification.adaptItem(contextual,ath,state,session),';
assert.ok(realCoordinatorSrc.includes(fixedLine),'test setup error: could not locate the fixed prescription() line in the real file -- its wording changed in a way this test does not expect');
const buggyCoordinatorSrc=realCoordinatorSrc.replace(fixedLine,buggyLine);
assert.notEqual(buggyCoordinatorSrc,realCoordinatorSrc,'test setup error: could not construct the reverted buggy source');

const buggySandbox=bootSandbox(buggyCoordinatorSrc);
const buggyResult=buggySandbox.MSOSEngines.Coordinator.prescription(session,item,charlotte,state);
assert.ok(buggyResult.item.cues.some(c=>/Desc\s+1-2/i.test(c))&&!buggyResult.item.cues.some(c=>text(c)==='Desc 1-3'),`the reverted pre-fix source must reproduce the real bug (wrong regenerated cue, authored one lost), got cues=${JSON.stringify(buggyResult.item.cues)} -- if this no longer reproduces, this test would not have caught the original bug`);
assert.notEqual(buggyResult.item.authoredPatternPreserved,true,'the reverted pre-fix source must not have the bridge\'s preservation marker at all');

console.log('PRESCRIPTION_BRIDGE_DESCENT_PRESERVATION_FAILBEFORE_PASS');

// --- 3. Confirm the two other tests that already exercise coordinator.js WITHOUT loading bridge.js (so their
// M.adapt.item is never wired) are untouched by this fix -- prescription() must fall back to a direct
// adaptItem() call in that shape, identical to its pre-fix behaviour, not throw or change result. ---
global.MSOSEngines={};
global.MSOSEngines.Evidence=require('../engines/evidence.js');
global.MSOSEngines.RacePace=require('../engines/race-pace.js');
global.MSOSEngines.Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Modification=makeFakeModification();
const NodeCoordinator=require('../engines/coordinator.js');
global.MSOSEngines.Coordinator=NodeCoordinator;
const noBridgeResult=NodeCoordinator.prescription(session,item,charlotte,state);
assert.ok(noBridgeResult.item.cues.some(c=>/Desc\s+1-2/i.test(c)),'without a loaded bridge (global.MSOS4.adapt.item absent), prescription() must fall back to the direct adaptItem() call unchanged -- this must not throw, and must not silently apply preservation it has no bridge to source');

console.log('PRESCRIPTION_BRIDGE_DESCENT_PRESERVATION_NOBRIDGE_FALLBACK_PASS');

require('node:child_process').execFileSync(process.execPath,['--check',path.join(__dirname,'..','engines','coordinator.js')],{stdio:'pipe'});
