'use strict';
// Real coaching failure this fixes: Andy repeatedly reported the "Give swimmer access" QR-generate modal
// "stopping at 5/5 0s" -- frozen on the LAST evidence-job status text, with the diagnostic elapsed-seconds
// ticker (tests/swimmer-generate-qr-status-tick-20260910.cjs) itself appearing not to move. Every status
// update in this flow comes from onJob(), which only ever fired from inside completeEvidence()'s network-jobs
// loop (engines/swimmer-performance-ci.js) -- prepareAthlete() then calls buildModel() synchronously
// immediately afterwards (ranking every event against every national standard/meet for this athlete), with
// no status update of its own. Any time buildModel() takes -- slow, or if a real bug makes it far slower than
// expected on Andy's actual data -- was invisible and silently misattributed to whichever evidence job
// happened to finish last, making a stuck-in-buildModel case indistinguishable from a stuck-on-evidence case.
//
// Fixed by having prepareAthlete() fire one more onJob() call, with just a name and no index/total, right
// before buildModel() starts. engines/swimmer-invite-bn.js's generate-QR handler renders a plain,
// non-indexed onJob call as "Building <name>..." (distinct from the indexed "Checking swimmer evidence...
// (i/total * name)" text), and a second such call ("Assembling private swimmer view...") brackets the
// payload-building step that runs after prepareAthlete resolves -- so a future freeze report will name
// specifically which of these three phases (evidence fetch / pathway model / payload assembly) is stuck,
// instead of all three looking identical to "still on evidence check 5".
//
// This test proves prepareAthlete's new call fires, is named distinctly from the indexed evidence-job calls,
// and comes after them -- reusing the exact fixture shape from
// tests/swimmer-evidence-progress-callback-20260910.cjs (this file's own sibling test for the indexed calls).
//
// 19 Sept 2026 update: prepareAthlete()/completeEvidence() themselves are unchanged and still tested directly
// below, but swimmer-invite-bn.js's Generate button no longer calls them live in its critical path (Andy,
// direct: "I just want to give them access ... this back and forth is wearing me down" -- that live evidence
// refresh was the root of every freeze chased today). The rendering-side assertions further down were updated
// to match: the old per-job "Checking swimmer evidence..." progress rendering is asserted ABSENT from
// Generate now, since nothing wires onJob into a live call there any more.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const athlete={id:'ath-model-progress-fixture',full_name:'Model Progress Fixture Swimmer',date_of_birth:'2010-07-01'};

global.MSOSEngines={Evidence:{
  course:()=>'', distance:()=>0, rowStroke:()=>'', stroke:v=>String(v||''),
  seconds:()=>0, points:()=>null, pbRows:()=>[], merge:(a,b)=>[...(a||[]),...(b||[])]
}};
global.MSOS4={
  state:{settings:{pathwayCourse:'SCM'},athletes:[athlete]},
  refs:{get:()=>[],merge:()=>{},save:async()=>{}},
  currentSession:()=>({identity:{date:'2026-09-13',course:'SCM'}}),
  pathway:{defaultStandard:()=>true},
  performanceEngine:{scoreSystem:()=>'WA',rankedEvents:()=>[],invalidate:()=>{}},
  ui:{},
  cloud:{ready:()=>true,fetch:()=>Promise.resolve([])},
  engineBridge:{canAttemptCloudRead:()=>true,pathwayPbCache:{clear(){}}},
  cloudSessionEngine:{fetchPages:()=>Promise.resolve([])}, // resolves fast -- every job succeeds quickly
};

require('../engines/swimmer-performance-ci.js');
const X=global.MSOS4.swimmerPerformanceBM;

(async()=>{
  const calls=[];
  const result=await Promise.race([
    X.prepareAthlete(athlete,{onJob:(name,i,total)=>calls.push({name,i,total})}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: did not settle')),2000)),
  ]);

  assert.ok(result?.model,'prepareAthlete must still return a built model');
  // 19 Sept 2026: three more non-indexed checkpoint calls (refs_save/t400_hydrate/cache_invalidate) now
  // fire between the indexed evidence-job calls and pathway_model -- see
  // tests/swimmer-evidence-progress-callback-20260910.cjs for their own dedicated coverage. This test only
  // cares that pathway_model is still the LAST call and still non-indexed, and that at least one genuinely
  // indexed evidence-job call happened before the run of non-indexed checkpoint calls that precede it.
  assert.ok(calls.length>=2,`expected the indexed evidence-job calls plus the new pathway_model call, got ${JSON.stringify(calls)}`);

  const last=calls[calls.length-1];
  assert.equal(last.name,'pathway_model','the final onJob call must be the new, distinctly-named pathway_model marker');
  assert.equal(last.i,undefined,'the pathway_model call must NOT carry an index -- that is what tells the UI to render it differently from an evidence-job step');
  assert.equal(last.total,undefined,'the pathway_model call must NOT carry a total -- same reasoning as the index check above');

  const indexed=calls.filter(c=>Number.isInteger(c.i)&&Number.isInteger(c.total));
  assert.ok(indexed.length>=1,'fixture sanity: at least one indexed evidence-job call must have happened before the pathway_model call');
  assert.ok(calls.indexOf(indexed[indexed.length-1])<calls.length-1,'the last indexed evidence-job call must come before the pathway_model call');

  // The rendering side: engines/swimmer-invite-bn.js must format a non-indexed onJob call distinctly from an
  // indexed one, and must also bracket the payload-assembly step (which runs after prepareAthlete resolves,
  // and was previously invisible the same way buildModel used to be) with its own status line.
  const invitePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');
  const inviteSrc=fs.readFileSync(invitePath,'utf8');
  // 19 Sept 2026 (Andy, direct: "I just want to give them access ... this back and forth is wearing me
  // down"): the live prepareAthlete()/completeEvidence() call -- and the onJob wiring that rendered its
  // per-job/per-checkpoint progress during Generate -- was deliberately removed from the Generate button's
  // critical path (every freeze chased all day traced back to that one live evidence refresh). prepareAthlete
  // itself is unchanged (asserted above, called directly) and still fires these callbacks correctly when
  // something DOES call it with an onJob -- it's just no longer Generate that does so live. Generate now
  // calls completeEvidence() only as a fire-and-forget background refresh with no onJob at all, so the old
  // "Checking swimmer evidence... (i/total)" / "Building <name>..." rendering rule genuinely has nothing left
  // to render during Generate; asserting its absence here confirms the redesign actually took effect rather
  // than silently leaving dead, misleading code behind.
  assert.ok(!/onJob:\(name,i,total\)=>\{mark\(name\);note\(i&&total\?/.test(inviteSrc),
    'swimmer-invite-bn.js should no longer wire a live per-job onJob progress callback into Generate -- that live evidence step was intentionally removed on 19 Sept');
  assert.match(inviteSrc,/note\('Assembling private swimmer view…'\);const portal=payloadFor\(a,name=>\{mark\(`payload:\$\{name\}`\);note\(/,
    'swimmer-invite-bn.js must give the payload-assembly step (payloadFor) its own status line, right before it runs, and must wire a per-sub-step callback into it');

  console.log('SWIMMER_GENERATE_QR_MODEL_PROGRESS_PASS', JSON.stringify(calls.map(c=>c.name)));

  // Fail-before/pass-after: revert both files to their exact pre-fix shape and confirm the same checks fail.
  const ciPath=path.join(__dirname,'..','engines','swimmer-performance-ci.js');
  const ciSrc=fs.readFileSync(ciPath,'utf8');
  const ciFixed="async function prepareAthlete(ath,{course=currentCourse(),onJob}={}){const completion=await completeEvidence(ath,onJob);try{onJob?.('pathway_model')}catch{}return{completion,model:buildModel(ath,course)};}";
  const ciOriginal="async function prepareAthlete(ath,{course=currentCourse(),onJob}={}){const completion=await completeEvidence(ath,onJob);return{completion,model:buildModel(ath,course)};}";
  assert.ok(ciSrc.includes(ciFixed),'test setup error: could not locate the fixed prepareAthlete in the real file -- its wording changed in a way this test does not expect');
  const ciBuggy=ciSrc.replace(ciFixed,ciOriginal);
  assert.notEqual(ciBuggy,ciSrc,'test setup error: could not construct the reverted buggy engines/swimmer-performance-ci.js');

  delete require.cache[require.resolve('../engines/swimmer-performance-ci.js')];
  const Module=require('node:module');
  const origCompile=Module.prototype._compile;
  Module.prototype._compile=function(content,filename){
    if(filename===ciPath)content=ciBuggy;
    return origCompile.call(this,content,filename);
  };
  let threw=false,threwMessage='';
  try{
    delete global.MSOS4.swimmerPerformanceBM;
    require('../engines/swimmer-performance-ci.js');
    const buggyX=global.MSOS4.swimmerPerformanceBM;
    const buggyCalls=[];
    const buggyResult=await Promise.race([
      buggyX.prepareAthlete(athlete,{onJob:(name,i,total)=>buggyCalls.push({name,i,total})}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('TEST_HARNESS_GUARD: did not settle')),2000)),
    ]);
    assert.ok(buggyResult?.model,'fixture sanity: buggy prepareAthlete must still return a model');
    const buggyLast=buggyCalls[buggyCalls.length-1];
    assert.notEqual(buggyLast?.name,'pathway_model','the buggy pre-fix prepareAthlete must NOT report a pathway_model step -- confirms this check would have caught the real, reported gap');
  }catch(err){threw=true;threwMessage=err.message;}
  finally{Module.prototype._compile=origCompile;}
  assert.ok(!threw,`buggy-source verification itself must not throw unexpectedly: ${threwMessage}`);

  require('node:child_process').execFileSync(process.execPath,['--check',ciPath],{stdio:'pipe'});
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

  console.log('SWIMMER_GENERATE_QR_MODEL_PROGRESS_FAILBEFORE_PASS');
})().catch(err=>{console.error(err);process.exit(1)});
