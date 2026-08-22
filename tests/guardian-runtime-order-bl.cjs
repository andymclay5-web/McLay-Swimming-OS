'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const stability=fs.readFileSync('engines/stability-identity-bh.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const current=fs.readFileSync('engines/release-guardian-bl.js','utf8');
assert(!stability.includes('loadFullGuardian'),'stability must not dynamically reload an older Guardian');
const ordered=['engines/stability-identity-bh.js','engines/guardian-device-state-bj.js','engines/privacy-hardening-bk.js','engines/release-guardian-bj.js','engines/release-guardian-bl.js','engines/guardian-runtime.js'];
let last=-1;for(const file of ordered){const at=index.indexOf(file);assert(at>last,`Guardian script order wrong at ${file}`);last=at;}
assert(current.includes('v4-guardian-runtime-order-20260822bl'),'BL must own the final runtime build');
console.log('PASS guardian-runtime-order-bl');
