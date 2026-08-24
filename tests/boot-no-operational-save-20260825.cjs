'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const boot=app.match(/M\.boot=\(\)=>\{[\s\S]*?\};\n document\.addEventListener\('DOMContentLoaded'/);
assert.ok(boot,'boot function not found');
assert.doesNotMatch(boot[0],/M\.store\.save\(M\.state\)/,'cold boot must never full-save operational state');
assert.match(boot[0],/M\.storageEngine\?\.saveUi\?\.\(M\.state\)/,'cold boot may persist only lightweight UI selection metadata');
console.log('BOOT_NO_OPERATIONAL_SAVE_PASS');
