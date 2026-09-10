'use strict';
// Real coaching failure this pins: a race-pace target that could be computed immediately from PB/result evidence
// already held locally sat behind a "Loading PB / race evidence…" spinner for up to ~20 seconds on the Board and
// TV views -- reported live by the coach as target latency. Root-caused in
// architecture/RUNTIME_AUDIT_20260909.md §3: engines/board-state.js's raceEvidencePending(item) gated purely on
// the CLOUD roster-sync status (pbRosterSync.status==='idle' + engineBridge.canAttemptCloudRead()) and never
// checked whether local evidence already made that cloud round-trip unnecessary for this item. Fixed by checking
// engineBridge.localPbReferenceCount() first and resolving immediately when it is nonzero -- the same "local
// evidence wins" precedent engines/bridge.js's own whenRaceEvidenceReady() already used.
//
// engines/board-state.js cannot be require()'d directly in Node -- its IIFE guards on M.ui/E.Coordinator/etc and
// touches `document` throughout, and no jsdom is available in this environment (house convention, see
// tests/modified-target-authority-20260909.cjs). Rather than fall back to a pure source-regex check (which only
// proves the right symbols appear somewhere, not that the gating logic actually behaves correctly), this test
// extracts the *exact*, unmodified source text of raceEvidencePending and its needsPerformanceEvidence helper
// from the real file and executes them against constructed engineBridge fixtures -- so it is a real behavioral
// test of the current source, not a paraphrase of intent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

const src=fs.readFileSync(path.join(root,'engines','board-state.js'),'utf8');

function extractFunctionBody(source,name){
  const marker=`function ${name}(item){`;
  const start=source.indexOf(marker);
  if(start<0)throw new Error(`${name} not found (as a single-line, brace-free-body function) in engines/board-state.js`);
  const bodyStart=start+marker.length;
  const end=source.indexOf('}',bodyStart);
  if(end<0)throw new Error(`${name} body was not closed where expected`);
  return source.slice(bodyStart,end);
}

const needsPerformanceEvidenceBody=extractFunctionBody(src,'needsPerformanceEvidence');
const raceEvidencePendingBody=extractFunctionBody(src,'raceEvidencePending');
const needsPerformanceEvidence=new Function('item',needsPerformanceEvidenceBody);
const raceEvidencePendingRaw=new Function('item','M','needsPerformanceEvidence',raceEvidencePendingBody);
const raceEvidencePending=(item,M)=>raceEvidencePendingRaw(item,M,needsPerformanceEvidence);

const raceItem={id:'i1',raceIntent:{distance:400}};
const nonRaceItem={id:'i2',reps:4,distance:50};

// --- fixture sanity ---
assert.equal(raceEvidencePending(nonRaceItem,{engineBridge:{hydrated:true,localPbReferenceCount:()=>0,pbRosterSync:{status:'idle'},canAttemptCloudRead:()=>true}}),false,'fixture sanity: an item with no race intent must never be reported evidence-pending');

// Before the bridge has hydrated at all, a race-intent item must still be reported pending regardless of local
// evidence -- this part of the gate is unchanged by the fix.
assert.equal(raceEvidencePending(raceItem,{engineBridge:{hydrated:false,localPbReferenceCount:()=>5,pbRosterSync:{status:'idle'},canAttemptCloudRead:()=>true}}),true,'before the engine bridge has hydrated at all, a race-intent item must still be reported pending');

// THE FIX: hydrated, local evidence already available, cloud roster sync merely idle-but-attemptable -- must
// resolve immediately rather than wait on a cloud round-trip that local evidence already makes unnecessary. This
// is the exact ~20s latency bug.
assert.equal(raceEvidencePending(raceItem,{engineBridge:{hydrated:true,localPbReferenceCount:()=>3,pbRosterSync:{status:'idle'},canAttemptCloudRead:()=>true}}),false,'a race-intent item must not be reported pending once local PB/result evidence is already available, even when a cloud roster sync has not run yet');

// No local evidence at all, cloud sync idle-and-attemptable -> still pending (falls through to the cloud path,
// same as before the fix).
assert.equal(raceEvidencePending(raceItem,{engineBridge:{hydrated:true,localPbReferenceCount:()=>0,pbRosterSync:{status:'idle'},canAttemptCloudRead:()=>true}}),true,'with zero local evidence, a race-intent item must still wait for the cloud roster sync as before');

// No local evidence, cloud sync actively running -> pending.
assert.equal(raceEvidencePending(raceItem,{engineBridge:{hydrated:true,localPbReferenceCount:()=>0,pbRosterSync:{status:'running'},canAttemptCloudRead:()=>true}}),true,'a running cloud roster sync with no local evidence must still be reported pending');

// No local evidence, cloud read unavailable (offline / signed out) -> not pending; nothing more can be fetched,
// so the UI should fall back to a "no evidence" state rather than spin forever.
assert.equal(raceEvidencePending(raceItem,{engineBridge:{hydrated:true,localPbReferenceCount:()=>0,pbRosterSync:{status:'idle'},canAttemptCloudRead:()=>false}}),false,'idle sync + no possible cloud read + no local evidence must resolve to not-pending, matching existing (unchanged) behavior');

console.log('RACE_EVIDENCE_LOCAL_FIRST_PASS');
