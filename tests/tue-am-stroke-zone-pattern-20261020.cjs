'use strict';
// Andy's Tue 20 Oct 2026 AM National session (live Board, poolside):
//  1. "no times for main set" -- MAIN SET "8 x 200" with "4 IM — Regeneration / 2 Free — Development /
//     2 Free — Overload". A rep group naming BOTH a stroke and a zone fell through app.js patternCue() as plain
//     text, so the item had no zone and no repPattern and the target engine returned nothing.
//     Fix: parsed as a per-rep zone pattern carrying each group's stroke; engines/aerobic.js times each group
//     from that stroke's own T400; the authored lines stay the displayed pattern.
//  2. Charlotte's mod showed the squad's full 24 x 50 (8 Free / 8 IM Order / 8 #1) -- "she can't do 24 x 50 in
//     the time it takes the group". A 50 can't be shortened, so the distinct-pattern branch kept the whole set.
//     Fix: each part keeps its purpose with fewer reps (her ratio, at least one per part).
//  3. An empty "WARM-DOWN" heading showed under the session title as if it were the theme.
// Drives Andy's REAL saved text (Supabase sessions.workout, session-1ivyip1) through the real pipeline, with
// fail-before checks against the pre-fix commit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const PRE_FIX_COMMIT='96410c8';
const REAL_SESSION="WARM-UP\n24 x 50\n8 Free — Minimum Stroke Count\n8 IM Order\n8 #1 — 25 Drill / 25 Swim\nRest · 10 sec\n\nPRE-SET\n3 x 150 Pull @ 2:30\n100 Minimum Stroke Count / 50 Fast\nMakeup: 100 Minimum Stroke Count / 50 Fast\n\nMAIN SET\n8 x 200\n4 IM — Regeneration\n2 Free — Development\n2 Free — Overload\nRest · 10 sec\n\nPOST-SET\n8 x 50 #1\nBands Only\nRest · 15 sec\n4x150 pull desc 1-4 20sr\n\nWARM-DOWN\n\nTOTAL 4250m";

function freshGlobals(){
  global.window=global;global.scrollY=0;
  global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
  global.location={hash:'',href:'https://real-session.test/'};
  global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
}
const rel=p=>path.join(root,p);
function oldCopy(file){const src=execFileSync('git',['show',`${PRE_FIX_COMMIT}:${file}`],{cwd:root}).toString('utf8');const tmp=rel(file).replace(/\.js$/,'.prefix20261020.tmp.js');fs.writeFileSync(tmp,src);return tmp;}
function load(files={}){
  freshGlobals();
  const f=k=>files[k]||rel(k);
  for(const k of Object.keys(require.cache))if(k.startsWith(root))delete require.cache[k];
  require(f('app.js'));const M=global.MSOS4;
  global.MSOSEngines={Evidence:require(rel('engines/evidence.js'))};
  global.MSOSEngines.Aerobic=require(f('engines/aerobic.js'));
  global.MSOSEngines.RacePace=require(rel('engines/race-pace.js'));
  global.MSOSEngines.Modification=require(f('engines/modification.js'));
  global.MSOSEngines.Coordinator=require(rel('engines/coordinator.js'));
  require(rel('engines/bridge.js'));
  require(f('engines/board.js'));
  return{M,E:global.MSOSEngines,B:M.boardEngine};
}
const CH={id:'cm',full_name:'Charlotte Murphy',squad:'National'},MR={id:'mr',full_name:'Matthew Robertson',squad:'National'};
const t400=(id,stroke,sec)=>({athlete_id:id,test_type:'T400',stroke,result_seconds:sec,pool_course:'SCM',test_date:'2026-10-01'});
const STATE={athletes:[CH,MR],adaptationProfiles:[{athlete_id:'cm',active:true,default_volume_ratio:0.6}],adaptationOverrides:[],resultsPbBoard:[],resultsEventHistory:[],coachResults:[],trainingTestTypes:[],trainingTestResults:[t400('mr','Freestyle',270),t400('mr','IM',300),t400('cm','Freestyle',330)]};
const parse=M=>M.parser.parse(REAL_SESSION,{id:'session-1ivyip1',date:'2026-10-20',dayPart:'AM',course:'SCM',squads:['National','Development']});
const block=(s,t)=>s.blocks.find(b=>b.type===t);

function fixed(){
  const {M,E,B}=load(),s=parse(M);
  const main=block(s,'main_set').items[0];
  assert.equal(main.reps,8);assert.equal(main.distance,200);
  assert.deepEqual(main.repPattern.map(r=>[r.rep,r.stroke,r.zone]),[[1,'IM','Regeneration'],[2,'IM','Regeneration'],[3,'IM','Regeneration'],[4,'IM','Regeneration'],[5,'Freestyle','Development'],[6,'Freestyle','Development'],[7,'Freestyle','Overload'],[8,'Freestyle','Overload']]);
  assert.deepEqual(main.pattern.map(p=>[p.count,p.text]),[[4,'IM — Regeneration'],[2,'Free — Development'],[2,'Free — Overload']],'authored lines stay the displayed pattern');
  assert.equal(s.blocks.reduce((n,b)=>n+b.items.reduce((m,i)=>m+M.session.itemDistance(i),0),0),4250,'session total unchanged');

  // Main set: real per-group times, each from its own stroke's T400.
  const mr=E.Coordinator.prescription(s,main,MR,STATE);
  assert.equal(mr.target.status,'pattern',`main set must have times, got ${JSON.stringify(mr.target)}`);
  const im=mr.target.rows.find(r=>r.rep===1),fr=mr.target.rows.find(r=>r.rep===5);
  assert.equal(im.stroke,'IM');assert.match(im.source,/IM T400 5:00/);assert.ok(im.seconds>0);
  assert.equal(fr.stroke,'Freestyle');assert.match(fr.source,/Freestyle T400 4:30/);assert.ok(fr.seconds>0);
  const summary=B.targetSummary(mr.target);
  assert.match(summary,/IM REG \d/);assert.match(summary,/Fr DEV \d/);assert.match(summary,/Fr OL \d/);
  assert.equal(B.cueText(mr.item),'4 IM — REG / 2 Free — DEV / 2 Free — OL · Rest · 10 sec','display unchanged, no duplicated pattern');
  // No IM T400: Free groups still timed, IM group shows its HR/SR guide rather than nothing.
  const ch=E.Coordinator.prescription(s,main,CH,STATE);
  assert.equal(ch.item.reps,8);assert.equal(ch.item.distance,100,'Charlotte keeps 8 x 100 as before');
  assert.match(B.targetSummary(ch.target),/IM REG HR <140 · Fr DEV \d.* · Fr OL \d/);

  // Warm-up: Charlotte now gets fewer reps per part instead of the full 24 x 50.
  const wu=E.Coordinator.prescription(s,block(s,'warm_up').items[0],CH,STATE).item;
  assert.equal(wu.distance,50);assert.equal(wu.reps,15,'8/8/8 at 0.6 -> 5/5/5');
  assert.deepEqual(wu.pattern.map(p=>p.count),[5,5,5]);
  assert.match(B.cueText(wu),/^5 Free — .* \/ 5 IM Order \/ 5 #1 —/);
  // Squad is untouched.
  assert.equal(E.Coordinator.prescription(s,block(s,'warm_up').items[0],MR,STATE).item.reps,24);

  assert.ok(block(s,'warm_down')&&!block(s,'warm_down').items.length,'the empty WARM-DOWN heading still parses as its own (empty) block');
  console.log('TUE_AM_FIXED_PASS');
}

function failBefore(){
  const tmps=['app.js','engines/aerobic.js','engines/modification.js','engines/board.js'].map(f=>[f,oldCopy(f)]);
  try{
    const {M,E}=load(Object.fromEntries(tmps)),s=parse(M);
    const main=block(s,'main_set').items[0];
    assert.equal(E.Coordinator.prescription(s,main,MR,STATE).target.status,'none','pre-fix: main set had no times');
    assert.equal(E.Coordinator.prescription(s,block(s,'warm_up').items[0],CH,STATE).item.reps,24,'pre-fix: Charlotte got the full 24 x 50');
  }finally{for(const [,t] of tmps)fs.unlinkSync(t);}
  console.log('TUE_AM_FAILBEFORE_PASS');
}

function themeLine(){
  const src=fs.readFileSync(rel('engines/board.js'),'utf8');
  assert.match(src,/function themeLines\(session\)\{const STRUCT=\/\^\(\?:warm_up\|pre_set\|main_set\|post_set\|warm_down\)\$\//,'empty structural headings excluded from the theme line');
  console.log('TUE_AM_THEME_PASS');
}

fixed();failBefore();themeLine();
