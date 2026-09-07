'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const invite=fs.readFileSync('engines/swimmer-invite-bn.js','utf8');
const portal=fs.readFileSync('swimmer-portal.js','utf8');
assert.doesNotMatch(invite,/window\.open\(/);
assert.match(invite,/iframe data-bn-preview-frame/);
assert.match(invite,/Training stays on the same session/);
assert.match(portal,/window\.parent&&window\.parent!==window/);
console.log('SWIMMER_PREVIEW_NO_POPUP_CONTRACT_PASS');
