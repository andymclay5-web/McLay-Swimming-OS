'use strict';
// Andy, Wed 21 Oct 2026 PM National (real Board, finished session):
//  1. MAIN "4 x 50 #1 @ 1:15": Charlotte "2×50 #1 @ 9:05", Ruby "@ 7:00". T400 evidence (a 400m time) carried no
//     distance, so performancePlan() treated the whole T400 as the work time of ONE 50 (8:46 + 15s = 9:05).
//  2. WARM-UP "12 x 50 Kick @ 1:10 Desc 1-3": modified swimmers read "Desc 1-4 / 5-7 / 5-7 · Desc 1-3 · 12 x 50 Kick
//     @ 1:10 Desc 1-3" -- a repeating descent in 3s was regenerated as if it spanned the whole set, and the bridge
//     added the squad's set line as a cue.
//  3. PRE-SET "#1-2 Drill / #3 @200 Pace": target row said "#1-2 Build", and the cue line repeated itself.
//  4. "1 ROUNDS".
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const rel=p=>path.join(root,p);

function load(){
  global.window=global;global.scrollY=0;global.requestAnimationFrame=f=>{f&&f();return 1;};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
  global.location={hash:'',href:'https://x.test/'};global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
  for(const k of Object.keys(require.cache))if(k.startsWith(root))delete require.cache[k];
  require(rel('app.js'));const M=global.MSOS4;
  global.MSOSEngines={Evidence:require(rel('engines/evidence.js'))};
  global.MSOSEngines.Aerobic=require(rel('engines/aerobic.js'));
  global.MSOSEngines.RacePace=require(rel('engines/race-pace.js'));
  global.MSOSEngines.Modification=require(rel('engines/modification.js'));
  global.MSOSEngines.Coordinator=require(rel('engines/coordinator.js'));
  require(rel('engines/bridge.js'));require(rel('engines/board.js'));
  return{M,E:global.MSOSEngines,B:M.boardEngine};
}
const {M,E,B}=load();
const CH={id:'cm',full_name:'Charlotte Murphy',squad:'National'};
const squad=[['s1',290],['s2',300],['s3',310],['s4',315]];
const t4=(id,sec,stroke='Freestyle')=>({athlete_id:id,test_type:'T400',stroke,result_seconds:sec,pool_course:'SCM',test_date:'2026-08-15'});
const state={athletes:[CH,...squad.map(([id])=>({id,full_name:'Squad '+id,squad:'National'}))],adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:0.6}],adaptationOverrides:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],trainingTestTypes:[],trainingTestResults:[t4('cm',526.4),...squad.map(([id,s])=>t4(id,s))],attendance:squad.map(([id])=>({session_id:'wed',athlete_id:id,status:'present'}))};

// 1. Evidence-based quality 50s: send-off is per-50 work, never the whole T400.
const s=M.parser.parse('MAIN SET\n4 x 50 @ 1:15\n#1—2 Smooth Build\n#3—4 Controlled Aerobic Power',{id:'wed',date:'2026-10-21',dayPart:'PM',course:'SCM',squads:['National']});
const fifty=s.blocks[0].items[0];
const ev=E.Modification.relativeEvidence(fifty,CH,state,s);
assert.equal(ev?.kind,'t400');assert.equal(ev.distance,400,'T400 evidence says it is a 400m time');
const out=E.Modification.adaptItem(fifty,CH,state,s);
assert.ok(Number(out.cycleSeconds)>0&&Number(out.cycleSeconds)<=180,`Charlotte's 50s must be on a sensible cycle, got ${out.cycleSeconds}s (${out.adaptationReason})`);
assert.doesNotMatch(out.adaptationReason||'',/8:46 expected work/,'per-50 work is not her whole T400');

// 2. A repeating descent is kept as written, and the set line never becomes a cue.
const k=M.parser.parse('WARM-UP\n12 x 50 Kick @ 1:10 Desc 1-3',{id:'k',course:'SCM'}).blocks[0].items[0];
const kOut=M.adapt.item(k,CH,state,s);
assert.ok(kOut.reps<12,'Charlotte does fewer reps');
const cue=B.cueText(kOut);
assert.equal(cue,'Desc 1-3',`kick cue should read just "Desc 1-3", got "${cue}"`);
// a descend across the whole set is still renumbered for fewer reps
const whole=M.parser.parse('MAIN SET\n6 x 100 @ 1:40 Desc 1-6',{id:'w',course:'SCM'}).blocks[0].items[0];
const wOut=E.Modification.adaptItem(whole,CH,state,s);
assert.doesNotMatch(String(wOut.raw),/Desc 1-6/,'a whole-set descent is renumbered when reps drop');

// 3 + 4. Board display (source-level: these are pure rendering rules).
const src=fs.readFileSync(rel('engines/board.js'),'utf8');
assert.match(src,/labels\.length===1\?labels\[0\]:'Build'/,'race rows use the authored label (Drill)');
assert.match(src,/raceShown&&\/\^#/,'#-lines already in the race summary are not repeated');
assert.match(src,/ROUND\$\{r===1\?'':'S'\}/,'"1 ROUND", not "1 ROUNDS"');
console.log('WED_PM_MODS_20261021_PASS');
