'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const full=fs.readFileSync('.github/workflows/full-guardian.yml','utf8');
const guardianContract=fs.readFileSync('GUARDIAN_CONTRACT_20260822.md','utf8');

assert.match(full,/branches:\s*[\s\S]*'v4-\*'/,'Full Guardian must run on every v4 candidate upload');
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
console.log('PASS Guardian upload contract · one full gate covers runtime, engine, architecture, package and device-state regressions');
