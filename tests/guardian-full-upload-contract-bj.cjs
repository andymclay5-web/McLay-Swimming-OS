'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const full=fs.readFileSync('.github/workflows/full-guardian.yml','utf8');
const guardianContract=fs.readFileSync('GUARDIAN_CONTRACT_20260822.md','utf8');

// One meaningful gate: main pushes and ready/non-draft PRs. Do not duplicate every v4 branch push and PR event.
assert.match(full,/push:\s*[\s\S]*branches:\s*[\s\S]*- main/,'Full Guardian must protect main');
assert.match(full,/pull_request:/,'Full Guardian must validate pull requests');
assert.match(full,/github\.event\.pull_request\.draft == false/,'Draft PR churn must not run the expensive Full Guardian job');
assert.doesNotMatch(full,/branches:\s*[\s\S]*'v4-\*'/,'Full Guardian must not duplicate every v4 branch push');
for(const required of [
  'tests/v4-guardian.test.js',
  'tests/release-package.test.js',
  'tests/engine-acceptance.cjs',
  'tests/guardian-device-state-bj.cjs',
  'architecture/architecture.test.js',
  'architecture/athlete-session.test.js',
  'architecture/athlete-report.test.js'
]) assert.ok(full.includes(required),`Full Guardian omits ${required}`);
assert.match(guardianContract,/Known field failures must be converted into explicit regression tests/i);
assert.match(guardianContract,/Test\/placeholder athletes.*forbidden in the production roster/i);
console.log('PASS Guardian upload contract · one full gate covers main + ready PRs without duplicate v4 push noise');
