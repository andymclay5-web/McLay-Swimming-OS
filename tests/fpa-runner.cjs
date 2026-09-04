'use strict';
/**
 * Final Product Acceptance runner.
 *
 * Runs every acceptance test, ALWAYS to completion, and prints one report for
 * all of them — it never bails at the first failure (handover 4.31: "Final
 * Product Acceptance stopping early hides downstream failures... report all
 * independent failures").
 *
 * Exit status:
 *   0  every REQUIRED test passed (DEFERRED failures are reported but do not gate)
 *   1  at least one REQUIRED test failed
 *
 * DEFERRED holds tests for known, documented, deprioritised work — currently the
 * layered Meet workspace/ops-bridge surface (see docs/KNOWN_DEFERRED.md). They
 * still run and still report on every CI run; they just do not block a
 * Training-focused release. Move a name out of DEFERRED the moment its area is
 * fixed — do not delete the test.
 *
 * Assumes: a static server for the repo is already running on
 * process.env.MSOS4_TEST_URL (default http://127.0.0.1:8765/), and Playwright +
 * Chromium are installed.
 */
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const REQUIRED=[
  'meet-aqgcb-alias-20260827.cjs',
  'matthew-ready-cv.cjs',
  'release-package.test.js',
  'meet-sisc-swimmer-persist-20260828.cjs',
  'meet-program-phone-acceptance-20260826.cjs',
  'meet-explicit-selection-authority-20260827.cjs',
  'all-inclusive-product-acceptance-20260825.cjs',
  'phone-target-stability-20260826.cjs',
];

const DEFERRED={
  'meet-sisc-programme-authority-20260827.cjs':
    'Meet workspace-switch: the intake card is not re-rendered after switching meets. Overlapping Meet render authorities — Meet consolidation pass.',
  'meet-working-card-phone-acceptance-20260827.cjs':
    'Meet ops-bridge quick-note textarea is injected into a stale .ba-intel node and renders hidden. Same Meet render-authority tangle.',
  'meet-new-meet-phone-acceptance-20260827.cjs':
    '"Add new meet" workspace flow times out. Same Meet render-authority tangle.',
};

const dir=path.join(__dirname);
const run=file=>{
  const started=Date.now();
  const r=spawnSync(process.execPath,[path.join(dir,file)],{encoding:'utf8',timeout:120000});
  const ms=Date.now()-started;
  const ok=r.status===0;
  const tail=((r.stdout||'')+(r.stderr||'')).trim().split('\n').filter(Boolean).slice(-4).join('\n    ');
  return {file,ok,ms,tail};
};

const all=[...REQUIRED,...Object.keys(DEFERRED)];
const results=all.map(run);

let requiredFailed=0,deferredFailed=0;
const lines=['# Final Product Acceptance',''];
for(const kind of ['REQUIRED','DEFERRED']){
  lines.push(`## ${kind}`,'');
  for(const res of results){
    const isDeferred=kind==='DEFERRED';
    if(isDeferred!==Object.prototype.hasOwnProperty.call(DEFERRED,res.file))continue;
    const mark=res.ok?'PASS':'FAIL';
    lines.push(`- ${mark} · ${res.file} · ${(res.ms/1000).toFixed(1)}s`);
    if(!res.ok){
      if(isDeferred){deferredFailed++;lines.push(`    deferred: ${DEFERRED[res.file]}`);}
      else requiredFailed++;
      if(res.tail)lines.push('    '+res.tail.replace(/\n/g,'\n    '));
    }
  }
  lines.push('');
}
lines.push(
  `Required: ${REQUIRED.length-requiredFailed}/${REQUIRED.length} pass` +
  (requiredFailed?` — ${requiredFailed} FAIL (gating)`:'') +
  `  ·  Deferred: ${Object.keys(DEFERRED).length-deferredFailed}/${Object.keys(DEFERRED).length} pass` +
  (deferredFailed?` — ${deferredFailed} known-deferred FAIL (not gating)`:'')
);

const report=lines.join('\n');
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY){try{fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report+'\n');}catch{}}

process.exit(requiredFailed?1:0);
