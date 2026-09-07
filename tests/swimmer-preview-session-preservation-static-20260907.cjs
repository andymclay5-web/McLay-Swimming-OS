'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const invite=fs.readFileSync('engines/swimmer-invite-bn.js','utf8');
assert.doesNotMatch(invite,/window\.open\(/,'preview must not open a second browser window/tab');
assert.match(invite,/selectedSessionBefore/,'preview must snapshot the live Training session identity');
assert.match(invite,/data-bn-preview-shell/,'preview must stay inside MSOS');
assert.match(invite,/data-bn-preview-close/,'preview must have an explicit return-to-coach control');
assert.match(invite,/window\.scrollTo\(scrollX,scrollY\)/,'closing preview must restore coach scroll position');
console.log('SWIMMER_PREVIEW_SESSION_PRESERVATION_PASS inline-no-background no-popup scroll-return session-guard');
