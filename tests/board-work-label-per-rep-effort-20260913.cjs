'use strict';
// Real coaching failure this fixes (Andy's own report, 13 Sept 2026): "there's also the 3x50 max when only
// the 3rd one was max". Andy authored "3x50 1 build, 1@200pace, 1 max @ 1:30" -- a per-rep breakdown where
// only the THIRD rep is max effort, the other two are build / 200-pace -- but the Board's bold work-label
// headline read "3×50 MAX @ 1:30", claiming the whole set was max effort.
//
// Root cause in engines/board.js's workLabel(): `if(/\bMAX\b/i.test(raw)&&!/MAX/i.test(label))label+=' MAX'`
// only ever checked whether the literal word "MAX" appeared ANYWHERE in the item's raw text, with no regard
// for whether it described the whole set (correct -- e.g. "8 x 25 MAX Sprint") or only one rep out of several
// in an explicit comma-separated per-rep list (wrong -- exactly Andy's case). Fixed by adding
// isPerRepEffortList(raw), which recognises the shape Andy actually types: after stripping the leading
// "R x D" header, at least two of the remaining comma-separated segments each open with their own bare rep
// count ("1 build", "1@200pace", "1 max") -- a shape that only occurs when a coach is assigning efforts per
// rep, never when describing the set as a whole -- and suppresses the blanket MAX suffix in that case. The
// per-rep detail itself is not lost: it was already, and remains, visible as the row's cue subtitle (via
// cueText(), unchanged by this fix).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

global.window=global;
global.scrollY=0;
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
global.location={hash:'',href:'https://work-label-max.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');

global.MSOSEngines={};
global.MSOSEngines.Evidence=require('../engines/evidence.js');
global.MSOSEngines.RacePace=require('../engines/race-pace.js');
global.MSOSEngines.Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Modification=require('../engines/modification.js');
global.MSOSEngines.Coordinator=require('../engines/coordinator.js');
require('../engines/board.js');

function checkLabels(M){
  const source=`MAIN SET
3 Rounds:
  3x50 1 build, 1@200pace, 1 max @ 1:30
  450 (200 IM, 100 #1, 150 fr`;
  const session=M.parser.parse(source,{id:'per-rep-max-test',course:'SCM'});
  const main=session.blocks.find(b=>b.type==='main_set');
  assert.ok(main,'main set block missing');
  const group=main.items.find(i=>i.kind==='group');
  assert.ok(group,'3-round group missing');
  const item=group.items.find(i=>i.kind==='set'&&i.reps===3&&i.distance===50);
  assert.ok(item,'the 3x50 build/200pace/max set is missing from the parsed session');

  const label=M.boardEngine.workLabel(item);
  assert.doesNotMatch(label,/\bMAX\b/,`the 3x50 per-rep breakdown (only rep 3 is max) must not summarise the whole set as MAX, got ${JSON.stringify(label)}`);
  assert.match(label,/^3×50(?:\s|$)/,`work label must still show the 3×50 headline, got ${JSON.stringify(label)}`);
  assert.match(label,/1:30/,`work label must still keep the authored @ 1:30 send-off, got ${JSON.stringify(label)}`);

  const cue=M.boardEngine.cueText(item);
  assert.match(cue,/max/i,`the per-rep detail naming which rep is max must still be visible somewhere on the row (cue subtitle), got ${JSON.stringify(cue)}`);
  assert.match(cue,/build/i,'the per-rep detail must still name the build rep');
  assert.match(cue,/200pace/i,'the per-rep detail must still name the 200pace rep');

  // Regression guard: a genuine whole-set MAX (no per-rep comma breakdown) must keep showing MAX.
  const wholeSetSession=M.parser.parse('MAIN SET\n8 x 25 MAX Sprint',{id:'whole-set-max-test',course:'SCM'});
  const wholeSetItem=wholeSetSession.blocks[0].items[0];
  const wholeSetLabel=M.boardEngine.workLabel(wholeSetItem);
  assert.match(wholeSetLabel,/\bMAX\b/,`a genuine whole-set MAX set ("8 x 25 MAX Sprint") must still show MAX on the Board, got ${JSON.stringify(wholeSetLabel)}`);
}

checkLabels(global.MSOS4);

// Fail-before/pass-after: revert board.js's workLabel fix to its exact original shape in a scratch copy,
// boot a SEPARATE isolated sandbox against it, and confirm the same check correctly fails.
const boardPath=path.join(__dirname,'..','engines','board.js');
const realSrc=fs.readFileSync(boardPath,'utf8');

const fixedLine="if(/\\bMAX\\b/i.test(raw)&&!/MAX/i.test(label)&&!isPerRepEffortList(raw))label+=' MAX';";
const originalLine="if(/\\bMAX\\b/i.test(raw)&&!/MAX/i.test(label))label+=' MAX';";
assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed MAX-suffix line in the real file -- its wording changed in a way this test does not expect');
assert.ok(realSrc.includes(originalLine)===false||realSrc.indexOf(originalLine)!==realSrc.indexOf(fixedLine),'sanity check on line extraction failed');

const buggySrc=realSrc.replace(fixedLine,originalLine);
assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

// Boot a completely separate, isolated sandbox (own globalThis, own MSOS4/MSOSEngines) running the buggy
// board.js on top of otherwise-real, freshly-loaded engines -- mirrors exactly how the real boot chain layers
// these files, without disturbing the already-verified real module's state. `module`/`require` are
// deliberately left undefined in this sandbox so evidence.js/race-pace.js/aerobic.js/modification.js/
// coordinator.js's UMD wrappers take their browser branch (self-registering onto sandbox.MSOSEngines) rather
// than trying to use Node's require.
const sandbox={
  scrollY:0,requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 1;},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}},
  location:{hash:'',href:'https://work-label-max-buggy.test/'},
  history:{state:null,replaceState(){},pushState(){},back(){}},
  addEventListener:()=>{},removeEventListener:()=>{},console,
};
sandbox.globalThis=sandbox;sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),sandbox,{filename:'app.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-correct.js'),'utf8'),sandbox,{filename:'v4-correct.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-poolside-core.js'),'utf8'),sandbox,{filename:'v4-poolside-core.js'});

let threw=false,threwMessage='';
try{
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','evidence.js'),'utf8'),sandbox,{filename:'evidence.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','race-pace.js'),'utf8'),sandbox,{filename:'race-pace.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','aerobic.js'),'utf8'),sandbox,{filename:'aerobic.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','modification.js'),'utf8'),sandbox,{filename:'modification.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','coordinator.js'),'utf8'),sandbox,{filename:'coordinator.js'});
  assert.ok(sandbox.MSOSEngines?.Evidence&&sandbox.MSOSEngines?.RacePace&&sandbox.MSOSEngines?.Modification&&sandbox.MSOSEngines?.Coordinator,'test setup error: sandbox engines did not self-register onto MSOSEngines');
  vm.runInContext(buggySrc,sandbox,{filename:'board.buggy.js'});
  assert.ok(sandbox.MSOS4?.boardEngine?.workLabel,'test setup error: buggy board.js did not install boardEngine in the sandbox');
  checkLabels(sandbox.MSOS4);
}catch(err){threw=true;threwMessage=err.message;}
assert.ok(threw,'the buggy pre-fix workLabel (unconditional MAX suffix) must fail this check -- confirms the check would have caught the real, reported bug');
assert.match(threwMessage,/must not summarise the whole set as MAX/,`the buggy source should fail specifically on the blanket-MAX assertion, got: ${threwMessage}`);

require('node:child_process').execFileSync(process.execPath,['--check',boardPath],{stdio:'pipe'});

console.log('BOARD_WORK_LABEL_PER_REP_EFFORT_PASS');
