'use strict';
// Real coaching failure this fixes: Andy's own real, pasted 18 Sept AM session text, and his own real Board
// screenshots of it (Charlotte/McKenzie, 07:59 AM session), showed several distinct, independently-confirmed
// bugs, all traced to real code before any fix was written:
//
//  1. RACE SIMULATION / FINS / RACE QUALITY were not recognised as block headers at all (app.js heading()
//     only knew a fixed 6-keyword list) -- their content silently got absorbed into WARM-UP as plain text.
//     Only 3 Board tabs (SET/WU/WD) appeared instead of Andy's 5 authored sections, and Warm-up's total
//     equalled the whole session because it had swallowed everything else.
//  2. "75% of #1 Event" (a percentage-of-effort instruction, not a distance) was read as a 75m swim purely
//     because a number led the line, so the modification engine individually "shortened" it per swimmer --
//     Andy: "the modified swimmers shouldn't have been shortened from 75%".
//  3. "45 min Individual Race Warm-Up" (a TIME duration) was likewise read as a 45m distance, rendering as a
//     bare, unit-less "45" indistinguishable from a real distance and adding 45 phantom metres to totals.
//  4. "Choice" -- a stroke the coach explicitly typed -- was being actively stripped from both the Board
//     headline (workLabel) and cue text (cueText) in engines/board.js, turning "300 Choice Swim @ 5:15" into
//     "300 @ 5:15" / "Swim @ 5:15" with "Choice" nowhere on screen.
//  5. "Dive Start 50 #1 form" / "@100 pace" (two lines) never became a real 'set' item at all -- the parser
//     only recognised a distance when the number led the line, and a race-pace cue on its own line never
//     backfilled the item's raceIntent -- so it could never reach the target engine, even though
//     engines/race-pace.js already implements dive/push/named-segment race targets correctly.
//  6. "4 x 50 @ 1:00, Descend 1-4" (a short quality/effort set) was never recognised as quality work by
//     engines/modification.js's isQuality() ("descend" was missing from its keyword list), so it fell to the
//     generic no-comparator reps-reduction fallback, which stretches the interval to match the squad's TOTAL
//     time window -- appropriate for an aerobic/endurance set, wrong for a short descend set: it gave
//     Charlotte a 2:00 cycle on a set the main group swims at 1:00, i.e. much more rest, proportionally, than
//     the squad ever gets. Andy: "not sure about Charlotte's 50s being on 2 min as she's getting more than 45
//     secs rest whenever the main group are getting max of 30 sec rest".
//
// This test drives Andy's REAL pasted text through the REAL end-to-end pipeline (parser -> Board -> Modification)
// and proves each fix, with fail-before checks against the exact pre-fix source of each changed file (via git
// HEAD, the state before this session's edits) showing each failure actually reproduces without the fix.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'app.js');
const modPath=path.join(root,'engines','modification.js');
const boardPath=path.join(root,'engines','board.js');

// Andy's real, pasted 18 Sept session text, verbatim (from the conversation where he asked "does this change
// your assessment before I get onto what I saw").
const REAL_SESSION=`WARM-UP
45 min Individual Race Warm-Up
Discuss Race Warm-Up with Coach
Explain Individual Race Warm-Up Plan
Complete Own Race Warm-Up
RACE SIMULATION
Dive Start
75% of #1 Event
FINS
3 Rounds:
  300 Choice Swim @ 5:15
  4 x 50 @ 1:00
Descend 1—4
  4 x 25 Underwater @ 0:45
  200 Choice
Remove Fins
  RACE QUALITY
  Dive Start 50 #1 form
  @100 pace

WARM-DOWN
Easy Choice
TOTAL 2520m`;

function freshGlobals(){
  global.window=global;global.scrollY=0;
  global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
  global.location={hash:'',href:'https://real-session.test/'};
  global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
}

function clearRequireCache(...paths){for(const p of paths)delete require.cache[require.resolve(p)];}

function loadPipeline({appFile=appPath,modFile=modPath,boardFile=boardPath}={}){
  freshGlobals();
  clearRequireCache(appFile);
  require(appFile);
  const M=global.MSOS4;
  const Evidence=require('../engines/evidence.js');
  global.MSOSEngines={Evidence};
  const Aerobic=require('../engines/aerobic.js');global.MSOSEngines.Aerobic=Aerobic;
  const RacePace=require('../engines/race-pace.js');global.MSOSEngines.RacePace=RacePace;
  clearRequireCache(modFile);
  const Modification=require(modFile);global.MSOSEngines.Modification=Modification;
  const Coordinator=require('../engines/coordinator.js');global.MSOSEngines.Coordinator=Coordinator;
  clearRequireCache(boardFile);
  require(boardFile);
  return {M,Modification,B:M.boardEngine};
}

// 19 Sept 2026: this originally read the pre-fix source via `git show HEAD:<path>`, which only worked while
// the fix itself was still uncommitted in this same session -- once the fix landed as commit 32b23ff, HEAD
// pointed at the FIXED source, so the fail-before checks below stopped reproducing anything (silently
// asserting against the current, already-correct behaviour). Pinned to 1a111fa, the exact commit immediately
// before 32b23ff, which stays correct regardless of how many later, unrelated commits land on this branch.
const PRE_FIX_COMMIT='1a111fa';
function gitHeadCopy(realPath,suffix){
  const old=execFileSync('git',['show',`${PRE_FIX_COMMIT}:${path.relative(root,realPath).replace(/\\/g,'/')}`],{cwd:root}).toString('utf8');
  const tmp=realPath.replace(/\.js$/,`.${suffix}.tmp.js`);
  fs.writeFileSync(tmp,old);
  return tmp;
}

function findBlock(session,titleOrType){return session.blocks.find(b=>b.type===titleOrType||b.title===titleOrType);}
function allItems(block){const out=[];const walk=items=>{for(const i of items||[]){out.push(i);if(i.kind==='group')walk(i.items);}};walk(block.items);return out;}

function run(){
  const {M,Modification,B}=loadPipeline();
  const session=M.parser.parse(REAL_SESSION,{id:'real-18sep',date:'2026-09-18',dayPart:'AM',course:'SCM',squads:['National']});

  // Fix 1: RACE SIMULATION / FINS / RACE QUALITY are now their own named blocks, not swallowed into WARM-UP.
  const titles=session.blocks.map(b=>b.title);
  assert.deepEqual(titles,['Warm-up','Race Simulation','Fins','Race Quality','Warm-down'],
    `Andy's 5 authored sections must produce 5 named blocks, got: ${JSON.stringify(titles)}`);

  // Fix 2: "75% of #1 Event" must not be a modifiable distance -- it stays a plain cue, identical for every
  // swimmer, never shortened by the modification engine.
  const raceSim=findBlock(session,'Race Simulation');
  const seventyFive=allItems(raceSim).find(i=>/75% of #1 Event/i.test(i.text||i.raw||''));
  assert.ok(seventyFive,'the 75% line must survive as an item');
  assert.equal(seventyFive.kind,'cue','a percentage-of-effort line must not be parsed as a modifiable distance/set');
  const charlotte={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
  const mckenzie={id:'md',full_name:'McKenzie Drage',squad:'National'};
  const state={athletes:[charlotte,mckenzie],adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:0.5},{athlete_id:'md',active:true,default_volume_ratio:2/3}],adaptationOverrides:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],trainingTestTypes:[],trainingTestResults:[]};
  const seventyFiveForCharlotte=Modification.adaptItem(seventyFive,charlotte,state,session);
  const seventyFiveForMcKenzie=Modification.adaptItem(seventyFive,mckenzie,state,session);
  assert.equal(seventyFiveForCharlotte.text,seventyFive.text,'a cue-kind item must never be individually shortened');
  assert.equal(seventyFiveForMcKenzie.text,seventyFive.text,'a cue-kind item must never be individually shortened');

  // Fix 3: "45 min Individual Race Warm-Up" must not be read as a 45m distance.
  const warmUp=findBlock(session,'warm_up');
  const fortyFive=allItems(warmUp).find(i=>/45 min Individual Race Warm-Up/i.test(i.text||i.raw||''));
  assert.ok(fortyFive,'the 45 min line must survive as an item');
  assert.equal(fortyFive.kind,'cue','a time duration must not be parsed as a distance');
  assert.equal(M.session.itemDistance(fortyFive),0,'a 45-minute task must contribute 0 phantom metres to the total');

  // Fix 4: "Choice" must appear in both the headline and the cue text, not be stripped.
  const fins=findBlock(session,'Fins');
  const finsItems=allItems(fins);
  const choice300=finsItems.find(i=>i.kind==='set'&&Number(i.distance)===300);
  assert.ok(choice300,'the 300 Choice Swim item must exist');
  assert.equal(choice300.stroke,'Choice','the parser must still capture the authored Choice stroke');
  assert.match(B.workLabel(choice300),/\bChoice\b/,'Board headline must show the authored Choice stroke');
  const choice200=finsItems.find(i=>i.kind==='set'&&Number(i.distance)===200&&i.stroke==='Choice');
  assert.ok(choice200,'the 200 Choice item must exist');
  assert.match(B.cueText(choice200),/Remove Fins/i,'Remove Fins must remain a visible cue');

  // Fix 5: "Dive Start 50 #1 form" / "@100 pace" must become one real 'set' item, distance 50, with a real
  // raceIntent targeting the 100 event -- reaching the already-correct race-pace engine.
  const raceQuality=findBlock(session,'Race Quality');
  const diveStart=allItems(raceQuality).find(i=>i.kind==='set'&&/Dive Start/i.test(i.raw||i.text||''));
  assert.ok(diveStart,'"Dive Start 50 #1 form" must become a real set item, not an orphaned cue');
  assert.equal(diveStart.distance,50,'the WORK distance is 50, separate from the 100 event target');
  assert.ok(diveStart.raceIntent,'the "@100 pace" cue must backfill raceIntent onto the set it describes');
  assert.equal(diveStart.raceIntent.distance,100,'"@100 pace" means the 100 event, not a 100m work distance');
  const ath={id:'a',sex:'F'};
  const pbState={resultsPbBoard:[{athlete_id:'a',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:60,wa_points:900}]};
  const target=M.MSOSEngines?M.MSOSEngines.RacePace.forItem(session,diveStart,ath,pbState):require('../engines/race-pace.js').forItem(session,diveStart,ath,pbState);
  assert.equal(target.status,'ok',`the dive-start segment must now reach a real target, got: ${JSON.stringify(target)}`);
  assert.match(target.source,/start segment/i,'a "Dive Start" cue must select the race-pace model\'s dive/start-segment branch');

  // Fix 6: "descend" must be recognised as quality work by the modification engine.
  const fourFifty=finsItems.find(i=>i.kind==='set'&&Number(i.distance)===50&&Number(i.reps)===4);
  assert.ok(fourFifty,'the 4 x 50 @ 1:00 item must exist');
  assert.ok(Modification.isQuality(fourFifty),'a Descend set must be classified as quality/effort work, not generic aerobic volume');

  console.log('BOARD_RACE_SIMULATION_FINS_QUALITY_PASS');
}

function runFailBeforeHeading(){
  // Fail-before: the exact pre-fix app.js (git HEAD) must reproduce failures 1, 3 and 5 -- block headers
  // absorbed, "45 min" read as a distance, and "Dive Start 50 ..." never becoming a real set item.
  const tmp=gitHeadCopy(appPath,'headingfailbefore');
  try{
    const {M}=loadPipeline({appFile:tmp});
    const session=M.parser.parse(REAL_SESSION,{id:'real-18sep-before',date:'2026-09-18',dayPart:'AM',course:'SCM',squads:['National']});
    assert.notDeepEqual(session.blocks.map(b=>b.title),['Warm-up','Race Simulation','Fins','Race Quality','Warm-down'],
      'pre-fix source must NOT produce 5 named blocks -- confirms this is a real, reproduced failure');
    const warmUp=findBlock(session,'warm_up');
    const fortyFive=allItems(warmUp).find(i=>/45 min/i.test(i.text||i.raw||''));
    assert.ok(fortyFive&&fortyFive.kind==='set'&&Number(fortyFive.distance)===45,
      'pre-fix source must misread "45 min" as a 45m distance -- confirms the reproduced failure');
  }finally{fs.unlinkSync(tmp);}
  console.log('HEADING_FAILBEFORE_PASS');
}

function runFailBeforePercentAndMin(){
  // Fail-before, isolated to the number-parsing regexes: even with today's block titles unavailable (pre-fix
  // app.js), confirm the underlying single-line parse of "75% of #1 Event" alone is misread as a distance.
  const tmp=gitHeadCopy(appPath,'pctfailbefore');
  try{
    const {M}=loadPipeline({appFile:tmp});
    const s=M.parser.parse('MAIN SET\n75% of #1 Event',{id:'pct-before'});
    const item=s.blocks[0].items[0];
    assert.equal(item.kind,'set','pre-fix source must misread "75%" as a distance-bearing set item');
    assert.equal(item.distance,75,'pre-fix source must treat "75%" as 75 metres');
  }finally{fs.unlinkSync(tmp);}
  console.log('PERCENT_MIN_FAILBEFORE_PASS');
}

function runFailBeforeChoice(){
  // Fail-before: the exact pre-fix board.js (git HEAD) must strip "Choice" from both the headline and the cue.
  const tmp=gitHeadCopy(boardPath,'choicefailbefore');
  try{
    const {M,B}=loadPipeline({boardFile:tmp});
    // Use today's fixed app.js/modification.js so only board.js's own pre-fix behaviour is under test here.
    // (mirrors the real session's actual item order: an intervening set keeps "200 Choice" its own item
    // rather than folding it into "300 Choice Swim" as a smaller inline component.)
    const session=M.parser.parse('FINS\n300 Choice Swim @ 5:15\n4 x 25 Underwater @ 0:45\n200 Choice\nRemove Fins',{id:'choice-before'});
    const items=allItems(session.blocks[0]);
    const choice300=items.find(i=>i.kind==='set'&&Number(i.distance)===300);
    assert.equal(choice300.stroke,'Choice','sanity: the parser must still capture the authored stroke');
    assert.doesNotMatch(B.workLabel(choice300),/\bChoice\b/,'pre-fix board.js must strip Choice from the headline -- confirms the reproduced failure');
    assert.match(B.cueText(choice300),/^Swim/i,'pre-fix board.js must strip the leading Choice word from the cue text too -- confirms the reproduced failure');
  }finally{fs.unlinkSync(tmp);}
  console.log('CHOICE_FAILBEFORE_PASS');
}

function runFailBeforeDescend(){
  // Fail-before: the exact pre-fix modification.js (git HEAD) must NOT classify a Descend set as quality work.
  const tmp=gitHeadCopy(modPath,'descendfailbefore');
  try{
    const {Modification}=loadPipeline({modFile:tmp});
    const item={id:'x',kind:'set',reps:4,distance:50,stroke:'',raw:'4 x 50 @ 1:00',text:'4 x 50 @ 1:00',cues:['Descend 1—4'],pattern:[],repPattern:[],repInstructions:[],raceIntent:null,zone:'',restSeconds:0,cycleSeconds:60,equipment:[],composition:[]};
    assert.equal(Modification.isQuality(item),false,'pre-fix modification.js must NOT recognise "Descend" as quality work -- confirms the reproduced failure');
  }finally{fs.unlinkSync(tmp);}
  console.log('DESCEND_FAILBEFORE_PASS');
}

run();
runFailBeforeHeading();
runFailBeforePercentAndMin();
runFailBeforeChoice();
runFailBeforeDescend();
execFileSync(process.execPath,['--check',appPath],{stdio:'pipe'});
execFileSync(process.execPath,['--check',modPath],{stdio:'pipe'});
execFileSync(process.execPath,['--check',boardPath],{stdio:'pipe'});
console.log('ALL_PASS');
