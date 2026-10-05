'use strict';
// Andy, 5 Oct 2026: "Still freezing on coach hub button hit." Every other tab works; Coach Hub freezes
// the phone. No synthetic data volume reproduced it in a real browser harness (~110ms for 180 sessions,
// 72 athletes, 2,880 attendance rows, a 5MB legacy blob, real-shaped PB/T400 evidence), so the fix does
// not guess at one more culprit. engines/coach-loop-ui.js now runs each Hub section through runSection(),
// which writes a "started" marker to localStorage BEFORE the section and clears it AFTER. A marker left
// behind by an earlier page load means the phone froze inside that section: the next Hub open skips ONLY
// that section, says so on screen, and opens everything else. Retry clears it.
//
// This test proves, with a localStorage that persists across simulated page loads:
//  1. a normal open leaves no open markers and records per-section timings;
//  2. a section left "open" by an earlier page load is skipped on the next load (its code never runs),
//     the on-screen notice names it, and the other sections still render;
//  3. Retry clears the skip and the section runs again;
//  4. a section that throws falls back and is recorded as an error, not tripped;
//  5. planContext() parses the legacy store ONCE per call (was three times);
//  6. engines/dosage-ui.js routes its Hub card through the same breaker;
//  7. fail-before: the pre-fix source (git HEAD~ equivalent, reconstructed from this file's own
//     previous version in git) still runs the frozen section on the next open -- i.e. without the
//     breaker, the same freeze would repeat on every tap.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const{execFileSync}=require('node:child_process');

const repoRoot=path.join(__dirname,'..');
const coachLoopPath=path.join(repoRoot,'engines','coach-loop-ui.js');
const dosageUiPath=path.join(repoRoot,'engines','dosage-ui.js');
const CRUMB='msos_hub_breadcrumb_v1';

function makeStore(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m};}
function makeHubElement(){return{dataset:{},_html:'',get innerHTML(){return this._html},set innerHTML(v){this._html=v},querySelector(){return{addEventListener(){}}},querySelectorAll(){return[]}};}

function boot(store,coachSrcPath=coachLoopPath){
  for(const f of ['app.js','v4-correct.js','v4-poolside-core.js'])delete require.cache[require.resolve(path.join(repoRoot,f))];
  delete require.cache[require.resolve(coachSrcPath)];
  global.window=global;global.scrollY=0;
  global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
  global.localStorage=store;
  const hubEl=makeHubElement();
  global.document={addEventListener(){},querySelector(sel){return sel==='#hubView'?hubEl:null;},querySelectorAll(){return[];},body:{dataset:{}}};
  global.location={hash:'',href:'https://hub-test.local/'};
  global.history={state:null,replaceState(){},pushState(){},back(){}};
  global.addEventListener=()=>{};global.removeEventListener=()=>{};
  require(path.join(repoRoot,'app.js'));
  require(path.join(repoRoot,'v4-correct.js'));
  require(path.join(repoRoot,'v4-poolside-core.js'));
  require(coachSrcPath);
  const M=global.MSOS4;
  const session={id:'sess-1',kind:'session',identity:{date:'2026-10-05',dayPart:'PM',squads:['National'],course:'SCM'},blocks:[{id:'b1',title:'MAIN SET',type:'main_set',items:[{id:'i1',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 Free Threshold'}]}],metadata:{}};
  M.state.canonicalSessions={[session.id]:session};
  M.state.settings.selectedSessionId=session.id;
  for(const k of ['athletes','attendance','captures','meets','meetRaces','athleteReflections'])M.state[k]=M.state[k]||[];
  M.state.weeklyPlans=[];M.state.seasonPlans=[];
  M.state.settings.storageRevision=1;
  let legacyCalls=0;const realLegacy=M.store.legacy;M.store.legacy=(...a)=>{legacyCalls++;return realLegacy.apply(M.store,a);};
  return{M,hubEl,legacyCalls:()=>legacyCalls};
}
const crumb=store=>JSON.parse(store.getItem(CRUMB)||'{}');

function run(){
  // 1: normal open.
  const store=makeStore();
  let b=boot(store);
  b.M.coachLoopUI.renderCoachHub();
  let c=crumb(store);
  assert.deepEqual(c.open,{},'a completed Hub open must leave no section marked open');
  assert.ok(!c.renderOpen,'a completed Hub open must clear the whole-render marker');
  for(const name of ['plan','summary','mix','meet','carry'])assert.ok(Number.isFinite(c.timings?.[name]),`section ${name} must record a timing`);
  assert.ok(!/SKIPPED TO KEEP THE PHONE RESPONSIVE/.test(b.hubEl.innerHTML),'no skip notice on a clean open');
  // 5: single legacy parse per planContext call.
  assert.equal(b.legacyCalls(),1,'planContext must read the legacy store once per Hub open, not three times');

  // 2: simulate the phone freezing inside "plan" on a previous page load: the marker was written, never cleared.
  const frozen=crumb(store);frozen.open={plan:{at:'2026-10-05T13:39:00+13:00',build:'v4-test'}};frozen.renderOpen='2026-10-05T13:39:00+13:00';store.setItem(CRUMB,JSON.stringify(frozen));
  b=boot(store); // fresh page load, same persisted storage
  b.M.coachLoopUI.renderCoachHub();
  assert.equal(b.legacyCalls(),0,'the section that froze last time must NOT run again on the next open');
  c=crumb(store);
  assert.ok(c.tripped?.plan,'the frozen section must be recorded as tripped');
  assert.deepEqual(c.open,{},'no section may be left open after this open');
  assert.match(b.hubEl.innerHTML,/SKIPPED TO KEEP THE PHONE RESPONSIVE/,'the skip must be shown on screen, not hidden');
  assert.match(b.hubEl.innerHTML,/Season \/ week plan link/,'the notice must name the skipped section in coach language');
  assert.match(b.hubEl.innerHTML,/SESSION MAKEUP/,'the rest of the Hub must still render');
  assert.match(b.hubEl.innerHTML,/400m planned/,'unrelated sections still compute real values');
  assert.match(b.hubEl.innerHTML,/data-loop-hub-retry/,'a Retry control must be offered');
  assert.ok(Number.isFinite(c.timings?.mix),'other sections still ran and were timed');

  // 3: Retry clears the skip; the section runs again.
  b.M.coachLoopUI.resetTripped();
  b.hubEl.dataset.loopHubRenderedAt='0';b.M.state.settings.storageRevision=2;
  b.M.coachLoopUI.renderCoachHub();
  assert.equal(b.legacyCalls(),1,'after Retry the previously skipped section runs again');
  assert.ok(!crumb(store).tripped?.plan,'Retry must clear the tripped record');

  // 4: a throwing section falls back and is recorded as an error, not tripped.
  const out=b.M.coachLoopUI.runSection('meet',()=>{throw new Error('boom');},()=>'fallback');
  assert.equal(out,'fallback');
  c=crumb(store);
  assert.equal(c.errors?.meet,'boom');
  assert.ok(!c.tripped?.meet,'an exception is not a freeze and must not trip the section');
  assert.deepEqual(c.open,{},'a throwing section must still clear its open marker');

  // 6: dosage-ui uses the breaker for its Hub card.
  const dosageSrc=fs.readFileSync(dosageUiPath,'utf8');
  assert.match(dosageSrc,/guard\('dosage',sessionCard,''\)/,'dosage-ui.js must run its Hub card through coachLoopUI.runSection');
  console.log('COACH_HUB_SECTION_BREAKER_PASS');
}

function runFailBefore(){
  // Reconstruct the pre-fix renderCoachHub section lines and confirm the same "froze last time" state
  // does NOT stop the frozen section re-running -- i.e. the freeze would repeat on every tap.
  const src=fs.readFileSync(coachLoopPath,'utf8');
  const start=src.indexOf("    const emptyCtx=");
  const end=src.indexOf("    const tripped=trippedSections(),diag=hubDiagnostics();");
  assert.ok(start>0&&end>start,'test setup: could not locate the guarded section block');
  const preFix=`    const ctx=planContext(s),sum=M.analysis?.summary?.(s,M.state)||{},mix=sessionMix(s),meet=upcomingMeet(ctx,s),carry=ctx.carry||recentCarry(s),psy=intentRows(ctx,s),zoneRows=topRows(mix.zones,mix.total),strokeRows=topRows(mix.strokes,mix.total),moveRows=topRows(mix.movement,mix.total),planned=Number(M.session?.total?.(s)||mix.total)||0,delivered=Number(sum?.delivered?.total??s.finish?.actualDistance??planned)||0;
    const entries=meet?.id&&M.meet?.visibleEntries?M.meet.visibleEntries(meet.id):[];
    const tripped=[],diag={timings:{},errors:{}};`;
  const buggy=src.slice(0,start)+preFix+src.slice(end+"    const tripped=trippedSections(),diag=hubDiagnostics();".length);
  const tmp=coachLoopPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmp,buggy);
  try{
    execFileSync(process.execPath,['--check',tmp],{stdio:'pipe'});
    const store=makeStore();
    store.setItem(CRUMB,JSON.stringify({open:{plan:{at:'2026-10-05T13:39:00+13:00',build:'v4-test'}}}));
    const b=boot(store,tmp);
    b.M.coachLoopUI.renderCoachHub();
    assert.ok(b.legacyCalls()>0,'fail-before: without the breaker the section that froze last time runs again on the next tap');
  }finally{fs.unlinkSync(tmp);}
  console.log('COACH_HUB_SECTION_BREAKER_FAILBEFORE_PASS');
}

try{
  run();
  runFailBefore();
  execFileSync(process.execPath,['--check',coachLoopPath],{stdio:'pipe'});
  execFileSync(process.execPath,['--check',dosageUiPath],{stdio:'pipe'});
}catch(err){console.error(err);process.exit(1);}
