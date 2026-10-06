'use strict';
// Andy, 5 Oct 2026, Hub stall trace screenshot from his phone: "COACH HUB · DIDN'T FINISH LAST TIME ·
// Stuck at: Dosage / stimulus card" (build v4-coach-hub-stall-trace-20261005, storage ok), on a finished
// AM session with Charlotte, Matt K, Matt R, McKenzie and others present.
//
// Root cause: engines/dosage.js's Hub card (scopeSummary -> sessionDose per present swimmer) called the
// FULL Coordinator.prescription() for every present swimmer x every item, synchronously, on the Hub tap.
// prescription() computes race-pace / T400 / pathway targets for each call -- work the dose never reads
// (it only needs adapted reps / distance / stroke / zone). The Board computes the same targets lazily and
// cached, a few at a time; the dosage card did all of them at once, uncached.
//
// Fix: Coordinator.prescribedItem() -- the same normalize -> context -> bridge-adapt path as
// prescription(), without compute()/applyPolicy() (applyPolicy only rewrites timing, never volume).
// dosage.js uses it. Also bounded the per-rep loop against non-finite / absurd rep counts.
//
// This test proves, in a real browser against the real engines and Andy's real modification profiles:
//  1. prescribedItem() reps/distance/stroke/zone are identical to prescription().item for every item x
//     modified/unmodified swimmer across real session texts from this repo's own fixtures;
//  2. sessionDose / scopeSummary output is byte-identical to the pre-fix path (dose unchanged);
//  3. the Hub dosage pass makes ZERO full prescription() calls now (was swimmers x items);
//  4. a non-finite rep count can no longer hang the dose loop;
//  5. fail-before: with prescribedItem removed, the dose pass falls back to full prescription() calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

function fixtureTexts(){
  const out=[];
  for(const f of ['board-race-simulation-fins-quality-20260918.cjs','friday-session-board-regression.cjs','sep1-board-parser-cleanup-20260901.cjs','hash-prefixed-rep-pattern-20260917.cjs','dosage-structural-default-20260918.cjs']){
    const p=path.join(__dirname,f);if(!fs.existsSync(p))continue;const s=fs.readFileSync(p,'utf8');
    for(const m of s.matchAll(/`([^`$]{40,6000})`/g)){const t=m[1];if(t.split('\n').length>=3&&/\d+\s*[x×]\s*\d+/i.test(t))out.push(t);}
  }
  out.push(`WARM-UP
500 (300 Free / 200 Reverse IM)
12 x 50 #1 Stroke
PRE SET
3 x 200 Pull Desc Stroke Count
5 x 50 Kick Build @1:00
MAIN SET
2 x 400 Free Regeneration 10s rest
8 x 12.5 MAX @0:45
6 x 25 #1 Stroke @1:00
8 x 100 Free Threshold 30s rest
4 x 50 #1 Stroke @2:30 @100p
1 x 100 #1 Stroke MAX
POST SET
8 x 75 fins
WARM DOWN
200 easy`);
  return[...new Set(out)];
}

// Andy's real athlete_adaptation_profiles rows (live Supabase, 5 Oct 2026), volume/cycle fields only.
const PROFILES=[['athlete-amber-proudfoot','Amber Proudfoot',0.6666667,1.2],['athlete-charlotte-murphy','Charlotte Murphy',0.6,1.15],['athlete-matthew-kofoed','Matthew Kofoed',0.6666667,1.2],['athlete-mckenzie-drage','McKenzie Drage',0.6666667,1.5],['athlete-conor-fischer','Conor Fischer',0.5,1.15],['athlete-matthew-robertson','Matthew Robertson',null,null],['athlete-elsie-knowles','Elsie Knowles',null,null]];

async function runScenario(page,texts,{removePrescribedItem=false}={}){
  return page.evaluate(({texts,PROFILES,removePrescribedItem})=>{
    const M=window.MSOS4,E=window.MSOSEngines,D=M.dosageEngine;
    const savedPI=E.Coordinator.prescribedItem;if(removePrescribedItem)delete E.Coordinator.prescribedItem;
    // Fresh storage revision per scenario so the dose memo can never carry results between the two paths.
    M.state.settings.storageRevision=(Number(M.state.settings.storageRevision)||0)+1000;
    M.state.athletes=PROFILES.map(([id,n])=>({id,full_name:n,squad:'National',active:true}));
    M.state.adaptationProfiles=PROFILES.filter(x=>x[2]).map(([id,,r,c])=>({id:'adapt-'+id,athlete_id:id,default_volume_ratio:String(r),default_cycle_multiplier:String(c),active:true,activation_mode:'always',rep_strategy:'Reduce repetitions first while retaining every key block.'}));
    const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'];
    M.state.coachResults=[];for(const [id] of PROFILES)for(const st of strokes)for(const d of [50,100,200,400])if(!(st==='IM'&&d===50))M.state.coachResults.push({id:`cr-${id}-${st}-${d}`,athlete_id:id,result_date:'2026-08-01',course:'SCM',distance:d,stroke:st,result_seconds:d*0.7,reviewed:true,excluded_from_pb:false});
    const realPrescription=E.Coordinator.prescription;let fullCalls=0;E.Coordinator.prescription=function(...a){fullCalls++;return realPrescription.apply(this,a);};
    const mismatches=[],doses=[];let itemsChecked=0;
    const walk=(its,fn)=>{for(const it of its||[]){if(it?.kind==='group')walk(it.items,fn);else if(it?.kind==='set')fn(it);}};
    try{
      for(let i=0;i<texts.length;i++){
        let s;try{s=M.parser.parse(texts[i],{date:'2026-10-05',dayPart:'AM',squads:['National'],course:'SCM'});}catch{continue}
        s.id='dvt'+i;M.state.canonicalSessions[s.id]=s;
        M.state.attendance=PROFILES.map(([id],j)=>({id:`at${i}-${j}`,session_id:s.id,athlete_id:id,status:j<5?'modified':'present'}));
        if(!removePrescribedItem&&typeof savedPI==='function'){
          for(const b of s.blocks||[])walk(b.items,item=>{for(const a of M.state.athletes){itemsChecked++;const full=realPrescription(s,item,a,M.state).item,vol=savedPI(s,item,a,M.state);for(const k of ['reps','distance','stroke','zone','kind'])if(JSON.stringify(full?.[k])!==JSON.stringify(vol?.[k]))mismatches.push({i,raw:item.raw,ath:a.full_name,k,full:full?.[k],vol:vol?.[k]});}});
        }
        const before=fullCalls;const scope=D.scopeSummary(s,M.state,{delivered:false});
        // memo: an identical second pass in the same revision does no adapt work at all
        const adaptReal=window.MSOS4.adapt?.item;let adaptCalls=0;if(adaptReal)window.MSOS4.adapt.item=function(...a){adaptCalls++;return adaptReal.apply(this,a);};
        const again=D.scopeSummary(s,M.state,{delivered:false});if(adaptReal)window.MSOS4.adapt.item=adaptReal;
        doses.push({i,scope:JSON.stringify(scope),again:JSON.stringify(again),repeatAdaptCalls:adaptCalls,fullCalls:fullCalls-before,swimmers:scope.individual.length});
      }
      // 4: a non-finite rep count must not hang the loop.
      const bad={id:'bad',identity:{date:'2026-10-05',dayPart:'AM',squads:['National'],course:'SCM'},blocks:[{id:'bb',title:'MAIN SET',type:'main_set',items:[{id:'bi',kind:'set',reps:Infinity,distance:50,stroke:'Freestyle',raw:'bad reps'},{id:'bj',kind:'set',reps:1e9,distance:50,stroke:'Freestyle',raw:'absurd reps'}]}]};
      const t0=performance.now();const bd=D.session(bad,M.state,{delivered:false});const badMs=performance.now()-t0;
      return{itemsChecked,mismatches:mismatches.slice(0,10),nMismatch:mismatches.length,doses,badMs,badWarn:bd.repCountWarnings||0};
    }finally{E.Coordinator.prescription=realPrescription;if(removePrescribedItem)E.Coordinator.prescribedItem=savedPI;}
  },{texts,PROFILES,removePrescribedItem});
}

(async()=>{
  const texts=fixtureTexts();
  assert.ok(texts.length>=3,'expected several real fixture session texts');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOSEngines?.Coordinator&&window.MSOS4?.dosageEngine,{timeout:15000});
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>typeof window.MSOSEngines.Coordinator.prescribedItem),'function','Coordinator must expose prescribedItem');

    const fixed=await runScenario(page,texts);
    assert.ok(fixed.itemsChecked>50,`expected a meaningful number of item x swimmer checks, got ${fixed.itemsChecked}`);
    assert.equal(fixed.nMismatch,0,`prescribedItem must match prescription().item volume fields exactly: ${JSON.stringify(fixed.mismatches)}`);
    const withSwimmers=fixed.doses.filter(d=>d.swimmers>0);
    assert.ok(withSwimmers.length>=3,'expected dose runs with present swimmers');
    for(const d of fixed.doses){assert.equal(d.again,d.scope,'a repeated dose pass must return identical results');assert.equal(d.repeatAdaptCalls,0,`a repeated dose pass in the same storage revision must reuse memoised doses (session ${d.i} re-adapted ${d.repeatAdaptCalls} items)`);}
    for(const d of fixed.doses)assert.equal(d.fullCalls,0,`dosage pass must make zero full prescription() calls (session ${d.i} made ${d.fullCalls})`);
    assert.ok(fixed.badMs<1000,`non-finite/absurd reps must not hang the dose loop (took ${fixed.badMs}ms)`);
    assert.equal(fixed.badWarn,2,'both bad rep counts must be flagged, not silently looped');

    // 2 + 5: fail-before path (no prescribedItem -> old full-prescription path) gives identical doses but
    // makes swimmers x items full prescription() calls.
    const old=await runScenario(page,texts,{removePrescribedItem:true});
    assert.equal(old.doses.length,fixed.doses.length);
    for(let k=0;k<fixed.doses.length;k++)assert.equal(fixed.doses[k].scope,old.doses[k].scope,`dose output must be identical to the pre-fix path (session ${fixed.doses[k].i})`);
    const oldCalls=old.doses.reduce((n,d)=>n+d.fullCalls,0);
    assert.ok(oldCalls>100,`fail-before: the pre-fix path makes full prescription() calls for every swimmer x item (got ${oldCalls})`);
    // Reports ran the identical per-swimmer report twice per paint; same spec + revision now reuses it,
    // and any save (revision bump) recomputes.
    const rr=await page.evaluate(()=>{const M=window.MSOS4,R=M.reportingEngine,spec={scope:'squad',days:7,course:'SCM'};
      M.state.settings.storageRevision=(Number(M.state.settings.storageRevision)||0)+1;const a=R.run(spec),b=R.run({...spec});
      M.state.settings.storageRevision++;const c=R.run(spec);return{same:a===b,fresh:c!==a,rows:a.rows.length};});
    assert.ok(rr.same,'an identical report spec in the same storage revision must reuse the computed report');
    assert.ok(rr.fresh,'a storage revision bump must recompute the report');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log(`DOSAGE_VOLUME_WITHOUT_TARGETS_PASS items=${fixed.itemsChecked} oldFullCalls=${oldCalls} newFullCalls=0`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
