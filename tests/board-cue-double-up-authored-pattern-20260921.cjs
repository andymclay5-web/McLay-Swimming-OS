'use strict';
// Real coaching failure this fixes (Andy, live, 21 Sept 2026, from his own screen): McKenzie's rep-condensed
// kick set (12x50 Kick @1:10 Desc 1-3, condensed for her modification) showed "8×50 Fr Kick @ 1:10 · Desc
// 1-4 / 5-8 · Desc 1—3" on the Board -- BOTH the machine-regenerated per-rep-group breakdown AND the
// coach's originally authored cue at once, concatenated together.
//
// Root cause: engines/bridge.js's preserveRepeatingDescent() (wired up earlier the same day -- see
// tests/prescription-bridge-descent-preservation-20260921.cjs) correctly restores the coach's authored
// "Desc 1-3" cue into item.cues/raw/text and marks item.authoredPatternPreserved=true, but deliberately
// never touches item.repPattern itself (still Modification.adaptItem's own regenerated per-rep-group
// breakdown for the condensed rep count). engines/board.js's cueText() independently reads BOTH
// compactPattern(item) (from repPattern) and tidyCues(item) (from item.cues) and pushed both into its
// output whenever both were present, with no awareness that one had just been corrected to replace the
// other on screen -- so the fix from earlier today, itself correct, newly exposed this display bug (before
// it, item.cues on the Board was never corrected either, so both sources showed roughly the same wrong
// text and this diff was not usually visible).
//
// Fixed: cueText() now treats item.authoredPatternPreserved as authoritative -- once the bridge has
// restored the real, authored cue, the regenerated per-rep-group pattern text is suppressed since
// item.cues already carries the one correct description. This test proves: (a) with
// authoredPatternPreserved unset (the normal, non-preserved case), the regenerated pattern text still
// renders exactly as before -- no regression to ordinary repPattern display; (b) with
// authoredPatternPreserved=true, the regenerated pattern text is suppressed and only the authored cue
// shows; (c) fail-before/pass-after against the exact reverted pre-fix source, proving this test would
// have caught the real double-up Andy saw.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const boardPath=path.join(__dirname,'..','engines','board.js');
const realSrc=fs.readFileSync(boardPath,'utf8');

function bootSandbox(boardSrc){
  const sandbox={
    scrollY:0,requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 1;},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}},
    location:{hash:'',href:'https://board-cue-double-up.test/'},
    history:{state:null,replaceState(){},pushState(){},back(){}},
    addEventListener:()=>{},removeEventListener:()=>{},console,
  };
  sandbox.globalThis=sandbox;sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),sandbox,{filename:'app.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-correct.js'),'utf8'),sandbox,{filename:'v4-correct.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-poolside-core.js'),'utf8'),sandbox,{filename:'v4-poolside-core.js'});
  sandbox.MSOSEngines={
    Evidence:{stroke:v=>String(v||'').trim()},
    Coordinator:{prescription:()=>null,suppress:()=>false},
    Modification:{adaptItem:item=>item,samePrescription:()=>true},
    RacePace:{},
  };
  vm.runInContext(boardSrc,sandbox,{filename:'board.js'});
  assert.ok(sandbox.MSOS4?.boardEngine?.cueText,'test setup error: board.js did not install boardEngine.cueText in the sandbox');
  return sandbox;
}

// A McKenzie-shaped fixture: repPattern still carries the regenerated per-rep-group breakdown (two groups
// of 4 for the condensed 8-rep delivery), item.cues carries the bridge-restored authored cue.
function makeItem({preserved}){
  return{
    id:'i1',kind:'set',reps:8,distance:50,raw:'8 x 50 Fr Kick',text:'8 x 50 Fr Kick',stroke:'Freestyle',
    cycleSeconds:70,restSeconds:null,
    repPattern:[
      {rep:1,zone:'Desc 1-4'},{rep:2,zone:'Desc 1-4'},{rep:3,zone:'Desc 1-4'},{rep:4,zone:'Desc 1-4'},
      {rep:5,zone:'Desc 5-8'},{rep:6,zone:'Desc 5-8'},{rep:7,zone:'Desc 5-8'},{rep:8,zone:'Desc 5-8'},
    ],
    repInstructions:[],cues:['Desc 1—3'],equipment:[],composition:[],raceIntent:null,
    authoredPatternPreserved:preserved,
  };
}

function runFixed(){
  const sandbox=bootSandbox(realSrc);
  const cueText=sandbox.MSOS4.boardEngine.cueText;

  // (a) Not preserved -- ordinary repPattern display must still work exactly as before.
  const notPreserved=cueText(makeItem({preserved:false}));
  assert.match(notPreserved,/Desc 1-4/,'without authoredPatternPreserved, the regenerated per-rep-group pattern must still render (no regression to ordinary display)');

  // (b) Preserved -- the regenerated pattern text must be suppressed, only the authored cue shows.
  const preserved=cueText(makeItem({preserved:true}));
  assert.doesNotMatch(preserved,/Desc 1-4/,`once the bridge has preserved the authored cue, the regenerated per-rep-group pattern must NOT also render -- got "${preserved}"`);
  assert.match(preserved,/Desc 1—3/,`the authored cue itself must still render -- got "${preserved}"`);
  assert.doesNotMatch(preserved,/·.*·/,`must not show a double-up of two competing cue descriptions joined together -- got "${preserved}"`);

  console.log('BOARD_CUE_DOUBLE_UP_AUTHORED_PATTERN_PASS');
}

function runFailBefore(){
  const fixedFn='function cueText(item){const patPreserved=!!item?.authoredPatternPreserved,pat=patPreserved?\'\':compactPattern(item),race=compactRace(item),seq=compactSequence(item),comp=composition(item),repeat=short(item?.repeatBreakdownCue||\'\'),intervals=repIntervalText(item),cues=tidyCues(item),rest=Number(item?.restSeconds)>0?`Rest · ${Number(item.restSeconds)} sec`:\'\',bits=[];if(pat)bits.push(pat);else if(race)bits.push(race);if(comp)bits.push(comp);if(repeat)bits.push(repeat);else if(seq)bits.push(seq);if(intervals)bits.push(intervals);if(cues)bits.push(cues);if(rest)bits.push(rest);if(bits.length)return[...new Set(bits.filter(Boolean))].join(\' · \');if(item?.zone||(item?.repPattern||[]).length||inlineIntent(item))return\'\';return short(item?.raw||item?.text).replace(/^\\d+\\s*[x×]\\s*\\d+(?:\\.5)?\\s*/i,\'\').replace(/^\\d+(?:\\.5)?\\s*/,\'\').replace(/^(Fr|Bk|Br|Fly|IM)\\b\\s*/,\'\').replace(/^(Pull|Upper-body)\\b\\s*/i,\'\').replace(/^·\\s*/, \'\');}';
  const buggyFn='function cueText(item){const pat=compactPattern(item),race=compactRace(item),seq=compactSequence(item),comp=composition(item),repeat=short(item?.repeatBreakdownCue||\'\'),intervals=repIntervalText(item),cues=tidyCues(item),rest=Number(item?.restSeconds)>0?`Rest · ${Number(item.restSeconds)} sec`:\'\',bits=[];if(pat)bits.push(pat);else if(race)bits.push(race);if(comp)bits.push(comp);if(repeat)bits.push(repeat);else if(seq)bits.push(seq);if(intervals)bits.push(intervals);if(cues)bits.push(cues);if(rest)bits.push(rest);if(bits.length)return[...new Set(bits.filter(Boolean))].join(\' · \');if(item?.zone||(item?.repPattern||[]).length||inlineIntent(item))return\'\';return short(item?.raw||item?.text).replace(/^\\d+\\s*[x×]\\s*\\d+(?:\\.5)?\\s*/i,\'\').replace(/^\\d+(?:\\.5)?\\s*/,\'\').replace(/^(Fr|Bk|Br|Fly|IM)\\b\\s*/,\'\').replace(/^(Pull|Upper-body)\\b\\s*/i,\'\').replace(/^·\\s*/, \'\');}';
  assert.ok(realSrc.includes(fixedFn),'test setup error: could not locate the fixed cueText in the real file -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedFn,buggyFn);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const sandbox=bootSandbox(buggySrc);
  const cueText=sandbox.MSOS4.boardEngine.cueText;
  const preserved=cueText(makeItem({preserved:true}));
  assert.match(preserved,/Desc 1-4/,`the reverted pre-fix source must reproduce the real double-up bug -- the regenerated pattern text must show again alongside the authored cue -- got "${preserved}"`);
  assert.match(preserved,/Desc 1—3/,'sanity: the buggy source must still produce the authored cue text');
  assert.ok(preserved.includes('Desc 1-4')&&preserved.includes('Desc 1—3')&&preserved.includes(' · '),`the reverted pre-fix source must reproduce the real double-up bug (both competing cue descriptions joined together, exactly what Andy saw) -- got "${preserved}", confirming this test would have caught it`);

  console.log('BOARD_CUE_DOUBLE_UP_AUTHORED_PATTERN_FAILBEFORE_PASS');
}

try{
  runFixed();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',boardPath],{stdio:'pipe'});
  console.log('BOARD_CUE_DOUBLE_UP_AUTHORED_PATTERN_ALL_PASS');
}catch(err){
  console.error(err);
  process.exit(1);
}
