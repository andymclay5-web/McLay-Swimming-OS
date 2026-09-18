'use strict';
// Real failure this fixes (found 17 Sept 2026 while verifying the "distinct-rep-pattern" modification fix
// against Andy's ACTUAL session text, not a synthetic fixture -- he pasted his real POST-SET verbatim):
//
//   POST-SET
//   4 x 400
//   #1 IM
//   #2 Freestyle
//   #3 IM
//   #4 Choice
//   Rest · 20 sec
//
// This is the exact real-world case the distinct-rep-pattern set-integrity fix
// (tests/distinct-rep-pattern-set-integrity-20260917.cjs, engines/modification.js's hasDistinctRepPattern)
// was written for. But feeding Andy's REAL text through the REAL parser (not a hand-built item.pattern
// fixture) revealed that fix could never actually fire: app.js's patternCue() turns a following line into a
// real item.pattern entry only via a regex requiring a BARE leading digit (`^(\d{1,2})\s+...`) -- the sibling
// "zone" regex two tokens earlier already accepts an optional `#` prefix (`^#?(\d{1,2})...`, matching e.g.
// "#1 Regeneration"), but the plain-text "pattern" regex never got the same `#?`. Andy's own authoring
// convention -- confirmed already documented and expected elsewhere in this codebase, see CLAUDE.md 2.26
// ("#1 Stroke", natural coaching shorthand) and the "#1 Build, #2-6 @100m RP" rep-index example at CLAUDE.md
// line 740 -- uses exactly this "#N <label>" rep-index form. Without the fix, "#1 IM" / "#2 Freestyle" /
// "#3 IM" / "#4 Choice" all silently fell through into item.cues as four plain, structurally meaningless
// strings instead of item.pattern -- so hasDistinctRepPattern(item) always saw an empty pattern array and
// never fired, meaning the real bug Andy reported (Charlotte "2x400"/McKenzie "3x400" dropping whole rounds)
// was, in practice, NOT actually fixed by that modification.js change alone against his real session text.
//
// Fix: add the same `#?` optional prefix to the plain-text pattern regex, matching the sibling zone regex.
// This test proves, with the REAL parser AND the REAL modification engine, that Andy's exact real post-set
// text now: (1) parses "#1 IM" etc. into item.pattern, not cues; (2) as a result, a modified swimmer now gets
// all 4 rounds kept at a reduced distance (matching his whiteboard's "4x200"/"4x300") instead of whole rounds
// being dropped. Plus fail-before/pass-after on the parser regex itself.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const appPath=path.join(root,'app.js');
const app=fs.readFileSync(appPath,'utf8');
const START_MARKER="(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const P=M.parser={};";
const END_MARKER="\n\n(function(g){\n const M=g.MSOS4,U=M.util,S=M.session;\n const C=M.changes={};";
const start=app.indexOf(START_MARKER);
assert.ok(start>=0,'base parser section not found in app.js');
const end=app.indexOf(END_MARKER,start);
assert.ok(end>start,'base parser section end not found in app.js');

const ANDY_REAL_SESSION=`WARM-UP
400 Freestyle
300 Backstroke
200 Breaststroke
100 Freestyle

PRE-SET
4 x Dive Start
15m MAX
200 Choice
2 x 25 Dive Start
MAX
400 #1
75 Drill
25 Swim

MAIN SET
2 Rounds:
  4 x Resisted Cords
  50 Scull
  4 x 25 Small Parachute
15m MAX
  4 x 25 Big Parachute
15m MAX
  50 Scull
  200 #1 Drill

POST-SET
4 x 400
#1 IM
#2 Freestyle
#3 IM
#4 Choice
Rest · 20 sec

WARM-DOWN
Easy Choice
TOTAL 3650m`;

function makeUtil(){return{text:v=>String(v??'').replace(/\s+/g,' ').trim(),lines:v=>String(v??'').replace(/\r/g,'').split('\n'),hash:s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)},stableId:(prefix,...parts)=>`${prefix}-${parts.map(x=>String(x??'').trim().toLowerCase()).join('|')}`,now:()=>'2026-09-17T07:00:00.000Z',deepFreeze:o=>o,clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),blockType:v=>{const s=String(v??'').trim().toLowerCase();if(/warm.?up/.test(s))return'warm_up';if(/pre.?set/.test(s))return'pre_set';if(/main/.test(s))return'main_set';if(/post.?set|reinforcement/.test(s))return'post_set';if(/warm.?down|cool.?down/.test(s))return'warm_down';if(/test/.test(s))return'test';return'other'},blockTitle:t=>({warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'})[t]||'Block'}}
function makeSession(U){const S={};S.empty=(identity={},source='')=>({schema:4,id:identity.id||'s',identity:{...identity},originalPlan:{text:String(source).trim()},currentSource:{text:String(source).trim()},blocks:[],changes:[],finish:null,metadata:{},updatedAt:U.now()});S.itemDistance=item=>!item?0:item.kind==='set'?Math.max(0,Number(item.reps)||1)*Math.max(0,Number(item.distance)||0):item.kind==='group'?Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+S.itemDistance(x),0):0;S.blockDistance=b=>(b?.items||[]).reduce((n,x)=>n+S.itemDistance(x),0);S.total=s=>(s?.blocks||[]).reduce((n,b)=>n+S.blockDistance(b),0);return S}

function loadParser(appSlice){
  const U=makeUtil(),S=makeSession(U);
  global.MSOS4={util:U,session:S};
  vm.runInThisContext(appSlice,{filename:'app-parser-section.js'});
  delete require.cache[require.resolve(path.join(root,'engines','parser-semantics.js'))];
  require(path.join(root,'engines','parser-semantics.js'));
  return global.MSOS4.parser;
}

function findPostSet400(parsed){
  const postSet=parsed.blocks.find(b=>b.type==='post_set');
  return postSet&&postSet.items.find(x=>x.kind==='set'&&Number(x.distance)===400);
}

function run(){
  const P=loadParser(app.slice(start,end));
  const parsed=P.parse(ANDY_REAL_SESSION,{id:'andy-real-4x400'});
  const item=findPostSet400(parsed);
  assert.ok(item,'could not find the 4x400 post-set item in Andy\'s real session text');
  assert.equal(item.reps,4);
  assert.equal(item.distance,400);
  assert.equal((item.cues||[]).some(c=>/^#1 IM$/i.test(c)),false,'"#1 IM" must no longer be dumped into cues as an unstructured string');
  const labels=(item.pattern||[]).map(x=>x.text);
  assert.deepEqual(labels,['IM','Freestyle','IM','Choice'],`the 4 per-round labels must land in item.pattern in order: got ${JSON.stringify(labels)}`);

  // End-to-end: feed the REAL parsed item into the REAL modification engine and confirm Andy's actual reported
  // bug (whole rounds dropped) is now actually fixed for his actual session text, not just a hand-built fixture.
  delete require.cache[require.resolve(path.join(root,'engines','evidence.js'))];
  const Evidence=require(path.join(root,'engines','evidence.js'));
  global.MSOSEngines={Evidence};
  delete require.cache[require.resolve(path.join(root,'engines','aerobic.js'))];
  global.MSOSEngines.Aerobic=require(path.join(root,'engines','aerobic.js'));
  delete require.cache[require.resolve(path.join(root,'engines','modification.js'))];
  const Modification=require(path.join(root,'engines','modification.js'));

  const cm={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
  const modSession={id:'andy-real-4x400',identity:{course:'SCM',squads:['National']}};
  const baseState={athletes:[cm],adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[],trainingTestResults:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[]};
  const out=Modification.adaptItem(item,cm,baseState,modSession);
  assert.equal(out.reps,4,'Charlotte must keep all 4 rounds from Andy\'s real session text -- none silently dropped');
  assert.equal(out.distance,200,'Charlotte\'s per-round distance must shorten (400->200) instead of dropping rounds');
  assert.match(out.adaptationReason||'',/distinct per-round pattern/i);

  console.log('HASH_PREFIXED_REP_PATTERN_PASS');
}

function runFailBefore(){
  const fixedRegex="m=t.match(/^#?(\\d{1,2})\\s+(?!x\\b)(.+)$/i);";
  const buggyRegex="m=t.match(/^(\\d{1,2})\\s+(?!x\\b)(.+)$/i);";
  const slice=app.slice(start,end);
  assert.ok(slice.includes(fixedRegex),'test setup error: could not locate the fixed patternCue() regex -- its wording changed in a way this test does not expect');
  const buggySlice=slice.replace(fixedRegex,buggyRegex);
  assert.notEqual(buggySlice,slice,'test setup error: could not construct the reverted buggy source');

  const P=loadParser(buggySlice);
  const parsed=P.parse(ANDY_REAL_SESSION,{id:'andy-real-4x400-buggy'});
  const item=findPostSet400(parsed);
  assert.ok(item,'fixture sanity: 4x400 item must still be found pre-fix');
  assert.equal((item.pattern||[]).length,0,'pre-fix source must fail to capture the "#1 IM" style lines into item.pattern -- confirms this test would have caught the exact gap found while verifying the real fix');
  assert.ok((item.cues||[]).some(c=>/^#1 IM$/i.test(c)),'pre-fix source must have dumped "#1 IM" into cues as an unstructured string instead');

  console.log('HASH_PREFIXED_REP_PATTERN_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',appPath],{stdio:'pipe'});
}catch(err){
  console.error(err);
  process.exit(1);
}
