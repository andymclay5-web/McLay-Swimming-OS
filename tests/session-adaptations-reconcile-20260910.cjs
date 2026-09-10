'use strict';
// Real coaching failure this pins (Andy's own voice-memo spec): a swimmer's own device can now write an
// evidence-approved stroke override straight into the cloud (session_adaptations, via
// supabase/20260910_swimmer_stroke_challenge_rpc.sql), using the exact same row shape
// app.js's C.projectAdaptationRows already writes from Andy's own app -- but until this fix, NOTHING in the
// coach app ever read session_adaptations back into M.state.adaptationOverrides, so a swimmer-approved change
// had no way to ever reach Andy's own live board, no matter how long he waited. This pins the new
// C.mergeAdaptationOverride (single-row, last-write-wins-by-updatedAt merge) and C.pullSessionAdaptations
// (scoped to one session, never touches operational state) against real fixtures: a brand-new remote override
// must be adopted; a remote row OLDER than the local one must be ignored (so a coach's later poolside edit is
// never silently clobbered by a stale swimmer approval); a remote row NEWER than the local one must win (so a
// swimmer's approval genuinely reaches the board); pullSessionAdaptations must fetch scoped to exactly one
// organisation+session and merge every returned row's v4_item_overrides array.
//
// app.js cannot be require()'d directly in Node (its IIFE touches document/window throughout and no jsdom is
// available here -- see tests/capture-default-selection-20260909.cjs for the established house convention).
// This test extracts the *exact*, unmodified source text of C.mergeAdaptationOverride and
// C.pullSessionAdaptations from the real app.js and executes them against constructed M/C/g fixtures, so it
// proves the real current source's behavior rather than a paraphrase of intent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'app.js'),'utf8');

function extractArrowFn(source,marker){
  const idx=source.indexOf(marker);
  assert.ok(idx>=0,`marker not found in app.js: ${marker}`);
  assert.equal(source.indexOf(marker,idx+1),-1,`expected exactly one occurrence of marker: ${marker} -- if a second was added, this test extracts the wrong one`);
  const rhsStart=idx+marker.length;
  const arrowIdx=source.indexOf('=>',rhsStart);
  assert.ok(arrowIdx>=0&&arrowIdx<rhsStart+40,`expected an arrow function immediately after: ${marker}`);
  const braceStart=source.indexOf('{',arrowIdx);
  assert.ok(braceStart>=0,`expected a '{' body after the arrow for: ${marker}`);
  let depth=0,i=braceStart;
  for(;i<source.length;i++){const c=source[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  assert.ok(depth===0,`unbalanced braces while extracting: ${marker}`);
  return source.slice(rhsStart,i+1);
}

const mergeSrc=extractArrowFn(src,'C.mergeAdaptationOverride=');
const pullSrc=extractArrowFn(src,'C.pullSessionAdaptations=');

// mergeAdaptationOverride only touches M.state.adaptationOverrides and U.clone -- give it exactly that.
const U={clone:v=>v==null?v:JSON.parse(JSON.stringify(v))};
const M={state:{adaptationOverrides:[]}};
// eslint-disable-next-line no-eval
const mergeAdaptationOverride=eval(`(${mergeSrc})`);

// --- A brand-new remote override (nothing local yet) must be adopted ----------------------------------------
const fresh={sessionId:'s1',itemId:'i1',athleteId:'ath-matthew',patch:{stroke:'Backstroke'},active:true,createdAt:'2026-09-10T09:00:00.000Z',updatedAt:'2026-09-10T09:00:00.000Z'};
assert.equal(mergeAdaptationOverride(fresh),true,'a genuinely new remote override must be adopted');
assert.equal(M.state.adaptationOverrides.length,1);
assert.equal(M.state.adaptationOverrides[0].patch.stroke,'Backstroke');

// --- A remote row OLDER than the local one must be ignored (coach's later edit must never be clobbered) ------
M.state.adaptationOverrides[0]={sessionId:'s1',itemId:'i1',athleteId:'ath-matthew',patch:{stroke:'Butterfly'},active:true,createdAt:'2026-09-10T09:00:00.000Z',updatedAt:'2026-09-10T10:00:00.000Z'}; // Andy's own later edit
const staleRemote={sessionId:'s1',itemId:'i1',athleteId:'ath-matthew',patch:{stroke:'Backstroke'},active:true,createdAt:'2026-09-10T09:00:00.000Z',updatedAt:'2026-09-10T09:30:00.000Z'}; // an older swimmer approval
assert.equal(mergeAdaptationOverride(staleRemote),false,'an older remote row must never overwrite a newer local edit');
assert.equal(M.state.adaptationOverrides[0].patch.stroke,'Butterfly','the coach\'s own later poolside edit must survive a stale swimmer-approval sync');

// --- A remote row NEWER than the local one must win (a swimmer's approval must genuinely reach the board) ----
const freshRemote={sessionId:'s1',itemId:'i1',athleteId:'ath-matthew',patch:{stroke:'Freestyle'},active:true,createdAt:'2026-09-10T09:00:00.000Z',updatedAt:'2026-09-10T11:00:00.000Z'};
assert.equal(mergeAdaptationOverride(freshRemote),true,'a genuinely newer remote row must overwrite the stale local one');
assert.equal(M.state.adaptationOverrides[0].patch.stroke,'Freestyle');

// --- Malformed/incomplete rows must be ignored, not crash or half-apply --------------------------------------
assert.equal(mergeAdaptationOverride({sessionId:'s1',itemId:'i1'}),false,'a row missing athleteId/patch must be ignored');
assert.equal(M.state.adaptationOverrides.length,1,'a malformed row must never be pushed as a phantom override');

console.log('SESSION_ADAPTATIONS_MERGE_PASS');

// ---------------------------------------------------------------------------------------------------------
// pullSessionAdaptations: fetch scoped to org+session, merge every row's v4_item_overrides, return whether
// anything actually changed. Fire-and-forget-safe: returns false (never throws) on a network error.
// ---------------------------------------------------------------------------------------------------------
(async()=>{
  const fetchedUrls=[];
  // Shadow the outer, already-mutated `M`/`mergeAdaptationOverride` with fresh ones scoped to this IIFE --
  // pullSessionAdaptations's real source closes over the identifiers `M`/`C`/`g`/`Store` by name (it is eval'd
  // verbatim from app.js), so a fresh M must be named `M`, not `M2`, for it to actually be used.
  const M={state:{settings:{organisationId:'org-1'},adaptationOverrides:[]}};
  M.performanceEngine={invalidate(){}};
  // eslint-disable-next-line no-eval
  const mergeAdaptationOverride=eval(`(${mergeSrc})`); // re-bound to this scope's M, not the outer test's M
  const C={
    ready:()=>true,
    org:()=>'org-1',
    networkError:e=>e?.networkError===true,
    mergeAdaptationOverride,
    fetch:async(u)=>{fetchedUrls.push(u);return[
      {session_id:'s1',athlete_id:'ath-matthew',updated_at:'2026-09-10T09:00:00.000Z',evidence_snapshot:{schema:4,v4_item_overrides:[{sessionId:'s1',itemId:'i1',athleteId:'ath-matthew',patch:{stroke:'Backstroke'},active:true,createdAt:'2026-09-10T09:00:00.000Z',updatedAt:'2026-09-10T09:00:00.000Z'}]}},
      {session_id:'s1',athlete_id:'ath-ruby',updated_at:'2026-09-10T09:05:00.000Z',evidence_snapshot:{schema:4,v4_item_overrides:[{sessionId:'s1',itemId:'i2',athleteId:'ath-ruby',patch:{stroke:'Breaststroke'},active:true,createdAt:'2026-09-10T09:05:00.000Z',updatedAt:'2026-09-10T09:05:00.000Z'}]}},
    ];},
  };
  const g={MSOSEngines:{Coordinator:{clearCache(){}},RacePace:{invalidate(){}}}};
  const Store={save(){}};
  // eslint-disable-next-line no-eval
  const pullSessionAdaptations=eval(`(${pullSrc})`);

  const changed=await pullSessionAdaptations('s1');
  assert.equal(changed,true,'two genuinely new remote overrides must be reported as a change');
  assert.equal(M.state.adaptationOverrides.length,2,'both athletes\' overrides must be merged from the two rows');
  assert.ok(fetchedUrls[0].includes('organisation_id=eq.org-1'),`fetch must scope to the coach's own organisation: ${fetchedUrls[0]}`);
  assert.ok(fetchedUrls[0].includes('session_id=eq.s1'),`fetch must scope to exactly the requested session: ${fetchedUrls[0]}`);

  const changedAgain=await pullSessionAdaptations('s1');
  assert.equal(changedAgain,false,'re-pulling identical rows a second time must report no change (same timestamps, nothing to merge)');

  {
    // Shadow C with a not-ready variant so the eval'd source (which refers to `C` by name) actually sees it.
    const fetchedUrls3=[];
    const C={ready:()=>false,org:()=>'org-1',networkError:e=>e?.networkError===true,mergeAdaptationOverride,fetch:async(u)=>{fetchedUrls3.push(u);return[];}};
    // eslint-disable-next-line no-eval
    const pullSessionAdaptations3=eval(`(${pullSrc})`);
    assert.equal(await pullSessionAdaptations3('s1'),false,'must never attempt a network call when the cloud is not ready (local-first: never block on cloud)');
    assert.equal(fetchedUrls3.length,0,'not-ready must short-circuit before any fetch call');
  }

  console.log('SESSION_ADAPTATIONS_PULL_PASS');
})().catch(err=>{console.error('SESSION_ADAPTATIONS_RECONCILE_FAIL',err);process.exit(1);});
