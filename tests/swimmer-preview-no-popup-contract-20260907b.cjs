'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const invite=fs.readFileSync('engines/swimmer-invite-bn.js','utf8');
assert.doesNotMatch(invite,/window\.open\(/);
assert.match(invite,/data-bn-preview-frame/);
console.log('SWIMMER_PREVIEW_NO_POPUP_FINAL_PASS');
