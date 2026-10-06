'use strict';
// 5 Oct 2026: Andy's Hub stall trace said "Stuck at: Dosage / stimulus card". Profiling that pass found
// engines/evidence.js's athleteAliases() -- a full-roster fuzzy name scan (roster x alias x alias sameName)
// -- dominating it: Modification.profile() calls it for every reference-squad candidate on every modified
// item, and identityFor() calls it on every evidence lookup, so the cost grows with roster size squared.
// Measured on a 72-swimmer roster with T400 evidence at 6x CPU throttle: ~1.8s for the Hub dosage pass
// before, ~0.4s after (cold), ~0.2s warm.
//
// The fix memoises athleteAliases per roster array + length + storage revision. This test proves:
//  1. memoised results are identical to the unmemoised computation for every roster athlete and for
//     evidence-row-shaped inputs (name-only rows, id-only rows, alias lists);
//  2. repeated calls do no further roster scanning (sameName-driven work happens once per athlete);
//  3. a storage-revision bump, a roster length change, or a new roster array invalidates the memo;
//  4. callers mutating the returned Set cannot poison later results;
//  5. fail-before: the pre-fix evidence.js re-scans the roster on every call.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const{execSync}=require('node:child_process');

const EVIDENCE=path.join(__dirname,'..','engines','evidence.js');
function load(src){const m={exports:{}};new Function('module','globalThis',src)(m,{});return m.exports;}

const FIRST=['Charlotte','Matthew','McKenzie','Amber','Conor','Ruby','Elsie','Alex','William','Luke','Coral','Ashley','Molly','Awatea','Sophie','Jordan'];
const LAST=['Murphy','Kofoed','Robertson','Kellow','Drage','Proudfoot','Fischer','Stace','Knowles','Auer','Gibson','Callow','Thompson','Sturla','Brown','Newlove'];
function makeState(n=72){const athletes=[];for(let i=0;i<n;i++)athletes.push({id:'athlete-'+i,full_name:`${FIRST[i%16]} ${LAST[(i*7)%16]}${i>=16?' '+i:''}`,squad:'National',active:true,...(i===3?{aliases:['Matt K','Matthew K']}:{})});return{athletes,settings:{storageRevision:7}};}

function countingSameNameSource(src){
  // Count real roster-scan work: every call of the name comparator used inside the roster loop.
  const marker='const sameName=(a,b)=>{';
  assert.ok(src.includes(marker),'test setup: could not find sameName in evidence.js');
  return src.replace(marker,'globalThis.__sameNameCalls=0;const sameName=(a,b)=>{globalThis.__sameNameCalls++;').replace("new Function('module','globalThis',src)","");
}
function loadCounting(src){const g={};const m={exports:{}};new Function('module','globalThis',countingSameNameSource(src))(m,g);return{api:m.exports,calls:()=>g.__sameNameCalls};}

function run(){
  const src=fs.readFileSync(EVIDENCE,'utf8');
  assert.match(src,/function computeAthleteAliases\(ath,state\)/,'evidence.js must keep the unmemoised computation as computeAthleteAliases');
  // Reference implementation: the exact unmemoised body, evaluated standalone.
  const refSrc=src.replace(/function athleteAliases\(ath,state\)\{\n[\s\S]*?\n  \}\n  function computeAthleteAliases/,'function athleteAliases(ath,state){return computeAthleteAliases(ath,state);}\n  function computeAthleteAliases');
  assert.notEqual(refSrc,src,'test setup: could not build the unmemoised reference');
  const ref=load(refSrc),memo=load(src);

  // 1: parity.
  const state=makeState();
  const inputs=[...state.athletes,{swimmer_name:'Charlotte Murphy'},{full_name:'charlotte murphy'},{athlete_id:'athlete-5'},{full_name:'Matt K'},{full_name:'Nobody Here'},{match_name:'McKenzie Drage'}];
  for(const a of inputs)assert.deepEqual([...memo.athleteAliases(a,state)].sort(),[...ref.athleteAliases(a,state)].sort(),`alias parity failed for ${JSON.stringify(a)}`);

  // 2: repeated calls do no further roster scanning.
  const c=loadCounting(src),s2=makeState();
  for(const a of s2.athletes)c.api.athleteAliases(a,s2);
  const afterFirst=c.calls();
  for(let k=0;k<20;k++)for(const a of s2.athletes)c.api.athleteAliases(a,s2);
  assert.equal(c.calls(),afterFirst,'repeat alias lookups must not re-scan the roster');

  // 3: invalidation.
  s2.settings.storageRevision=8;c.api.athleteAliases(s2.athletes[0],s2);
  assert.ok(c.calls()>afterFirst,'a storage-revision bump must invalidate the memo');
  let before=c.calls();s2.athletes.push({id:'athlete-new',full_name:'Charlotte Murphy'});
  const withDup=c.api.athleteAliases(s2.athletes[1],s2);
  assert.ok(c.calls()>before,'a roster length change must invalidate the memo');
  before=c.calls();const s3={...s2,athletes:[...s2.athletes]};c.api.athleteAliases(s3.athletes[1],s3);
  assert.ok(c.calls()>before,'a new roster array must not reuse another roster\'s memo');
  assert.deepEqual([...withDup].sort(),[...ref.athleteAliases(s2.athletes[1],s2)].sort(),'post-invalidation result must match the reference');

  // 4: caller mutation cannot poison the memo.
  const s4=makeState(),first=memo.athleteAliases(s4.athletes[0],s4);first.add('INJECTED');
  assert.ok(!memo.athleteAliases(s4.athletes[0],s4).has('INJECTED'),'mutating a returned Set must not change later results');
  console.log('EVIDENCE_ALIAS_MEMO_PASS');
}

function runFailBefore(){
  // Pre-fix evidence.js (HEAD~ of this change) re-scans on every call.
  let pre;try{pre=execSync('git show HEAD:engines/evidence.js',{cwd:path.join(__dirname,'..'),stdio:['ignore','pipe','ignore']}).toString();}catch{pre=null;}
  if(!pre||pre.includes('computeAthleteAliases')){
    // HEAD already contains the fix (after commit): reconstruct pre-fix by removing the memo wrapper.
    const src=fs.readFileSync(EVIDENCE,'utf8');
    pre=src.replace(/function athleteAliases\(ath,state\)\{\n[\s\S]*?\n  \}\n  function computeAthleteAliases/,'function athleteAliases');
  }
  const c=loadCounting(pre),s=makeState();
  for(const a of s.athletes)c.api.athleteAliases(a,s);const one=c.calls();
  for(const a of s.athletes)c.api.athleteAliases(a,s);
  assert.equal(c.calls(),one*2,'fail-before: the pre-fix code re-scans the whole roster on every call');
  assert.ok(one>s.athletes.length*s.athletes.length*0.5,`fail-before: one pass is roster-squared work (${one} name comparisons for ${s.athletes.length} swimmers)`);
  console.log('EVIDENCE_ALIAS_MEMO_FAILBEFORE_PASS');
}

try{run();runFailBefore();execSync(`node --check ${JSON.stringify(EVIDENCE)}`);}catch(e){console.error(e);process.exit(1);}
