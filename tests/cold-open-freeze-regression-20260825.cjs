'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const storage=fs.readFileSync('engines/storage.js','utf8');
assert.match(storage,/build:'v4-storage-authority-20260825-boot-readonly'/,'expected boot-readonly storage authority');
const hydrate=storage.match(/async function hydrate\(\)\{[\s\S]*?S\.readyPromise=hydrate\(\)/);assert.ok(hydrate,'hydrate not found');
assert.doesNotMatch(hydrate[0],/M\.store\.save\(M\.state\)/,'cold hydrate must never immediately full-save hydrated operational state');
assert.match(hydrate[0],/requestAnimationFrame\(\(\)=>M\.ui\?\.renderCurrent\?\.\(\)\)/,'hydrate must yield to rendering after state resolution');
console.log('COLD_OPEN_FREEZE_REGRESSION_PASS');
