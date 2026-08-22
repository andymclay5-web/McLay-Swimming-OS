'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const engine=fs.readFileSync('.github/workflows/engine-acceptance.yml','utf8');
const morning=fs.readFileSync('.github/workflows/morning-board-check.yml','utf8');
const guardianContract=fs.readFileSync('GUARDIAN_CONTRACT_20260822.md','utf8');

assert.match(engine,/branches:\s*[\s\S]*'v4-\*'/,'Engine acceptance must run on every v4 candidate upload');
assert.match(engine,/guardian-device-state-bj\.cjs/,'Engine acceptance must include device-state Guardian regression');
assert.match(morning,/Complete V4 Guardian/,'Complete Guardian suite missing from release workflow');
assert.match(morning,/guardian-device-state-bj\.cjs/,'Release workflow must include device-state Guardian regression');
assert.match(guardianContract,/Known field failures must be converted into explicit regression tests/i);
console.log('PASS Guardian upload contract · every v4 candidate runs full release + device-state regression');
