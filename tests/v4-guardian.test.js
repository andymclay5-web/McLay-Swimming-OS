'use strict';

const cp=require('node:child_process');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

// The old in-process Guardian harness loaded only app.js + the retired monolith
// layers. That no longer represents the shipped product: parser, targets,
// adaptation, evidence, Board, navigation and Guardian all have explicit runtime
// owners now. Run the current non-browser product contracts instead so this gate
// exercises the same authorities that index.html ships, without recreating stale
// fallback owners inside the test process.
const suites=[
  'tests/session-truth.test.js',
  'tests/parser-natural-cw.cjs',
  'tests/engine-acceptance.cjs',
  'tests/board-evidence-regression.cjs',
  'tests/friday-session-board-regression.cjs',
  'tests/reference-data-regression.cjs',
  'tests/attendance-roster-static.cjs',
  'tests/stability-identity-bh.cjs',
  'tests/guardian-device-state-bj.cjs',
  'tests/guardian-current-runtime-bk.cjs',
  'tests/guardian-current-runtime-bl.cjs',
  'tests/guardian-runtime-order-bl.cjs',
  'tests/live-guardian-regressions-20260824.cjs',
  'tests/guardian-full-upload-contract-bj.cjs',
  'tests/release-package.test.js'
];

for(const suite of suites){
  cp.execFileSync(process.execPath,[path.join(root,suite)],{cwd:root,stdio:'inherit'});
}

console.log(`V4 Guardian current-runtime PASS · ${suites.length} contract suites`);
