'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');

// Writer-map consolidation (WRITER_MAP_FINDINGS.md §9 / AUTHORITY_MAP.md "open consolidation
// target"): six shipped files each assign M.BUILD in their own top-level load, and the
// displayed/attested build identity is whichever one happened to execute last. That was only
// ever safe because engines/release-authority.js happens to sit at script position 79 of 80 in
// index.html -- nothing enforced it. A future script reorder, or a new file inserted after it
// that also stamps a build identity, would silently roll the attested build back to an earlier
// date with no test catching it. This file makes that ordering an explicit, self-maintaining
// contract instead of a load-order accident.
//
// Deliberately not touched by this fix: none of the five earlier writers (app.js, v4-correct.js,
// v4-poolside-core.js, engines/bridge.js, engines/coach-loop-ui.js) were removed or altered.
// v4-correct.js's writer legitimately reads the prior M.BUILD value first (a base-build lineage
// check, not a race) and must keep doing so. The other four are unconditional overwrites, but
// <script defer> tags execute independently -- a thrown error in one does not stop the next from
// running -- so the only writer whose correctness actually matters for the final attested state
// is whichever one is positioned last. That is enforced below.

const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const shippedFiles=[...html.matchAll(/<script[^>]*\bsrc="([^"?]+)/g)].map(m=>m[1]);
assert.ok(shippedFiles.length>10,'index.html script scan found implausibly few shipped files -- scan pattern likely broken');

// Discover every shipped file that assigns a `.BUILD` property (M.BUILD=, MSOS4.BUILD=, etc.),
// in actual document load order. Dynamic on purpose: a future file that starts stamping build
// identity is picked up automatically, with no writer list to keep in sync by hand.
const BUILD_WRITE=/\b\w+\.BUILD\s*=(?!=)/;
const writers=shippedFiles.filter(rel=>{
  const abs=path.join(ROOT,rel);
  if(!fs.existsSync(abs))return false;
  return BUILD_WRITE.test(fs.readFileSync(abs,'utf8'));
});

assert.ok(writers.length>=2,'expected multiple shipped M.BUILD writers (found '+writers.length+') -- has the writer pattern changed?');
assert.equal(
  writers[writers.length-1],
  'engines/release-authority.js',
  'engines/release-authority.js must be the LAST shipped file (in index.html document order) that '+
  'assigns .BUILD -- found "'+writers[writers.length-1]+'" loading after it instead. Either a script '+
  'was reordered, or a new build-identity writer was added after release-authority.js in index.html. '+
  'Full writer order found: '+JSON.stringify(writers)
);

// Belt and suspenders: release-authority.js's own write must not depend on anything any earlier
// writer did. Feed it the barest possible global (no prior M.BUILD, no other engine state at
// all) and confirm it still unconditionally produces a fully self-consistent build identity. This
// is what makes "last in load order" a sufficient guarantee rather than just a convention: even a
// hard failure in every other writer cannot stop this file from producing the correct final state,
// as long as it is the one that loads last.
delete require.cache[require.resolve('../engines/release-authority.js')];
global.MSOS4={};
require('../engines/release-authority.js');
const M=global.MSOS4;
assert.ok(M.BUILD,'release-authority.js must set M.BUILD even with no prior writer state');
assert.equal(M.RELEASE_ATTESTATION.build,M.BUILD,'attestation build must match M.BUILD');
assert.equal(M.RELEASE_ATTESTATION.softwareReady,true,'attestation must report software ready');
assert.equal(M.releaseAuthority.build,M.BUILD,'M.releaseAuthority marker must match the live M.BUILD');

console.log(`PASS build-identity-final-writer-order · release-authority.js confirmed last of ${writers.length} shipped .BUILD writers · self-sufficient with no prior state`);
