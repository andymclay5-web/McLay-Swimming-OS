'use strict';
// Real coaching failure this pins: on the "Give swimmer access" modal (engines/swimmer-invite-bn.js), the
// "Generate 15-minute QR" button had no disable-during-pending guard. Reported live by the coach (Andy):
// tapping the barcode/QR button once produced a delay, and a second tap during that delay -- or the same tap
// registering twice on a touchscreen -- fired a SECOND, fully independent async chain (msos_bootstrap_owner ->
// msos_publish_swimmer_payload -> msos_create_swimmer_invite), each one minting its own one-time swimmer
// invite token and racing to update the same QR/status DOM. This is exactly the "it'll generate multiple"
// behaviour the coach described -- not a rendering glitch, a genuine double-submit. The same missing-guard
// pattern existed on the neighbouring "Revoke swimmer devices" button in the same modal.
//
// engines/swimmer-invite-bn.js is DOM/event-wiring code with no test harness that constructs a real button
// click cycle (matches the existing house style in tests/swimmer-secure-onboarding-bn.cjs, which asserts on
// this exact file's source rather than executing it), so this test pins the fix at the source level: the
// click handler must (1) bail out immediately if the button is already disabled -- so a second tap during
// the pending request is a no-op, not a second run, (2) disable the button as the very first statement inside
// the handler, before any awaited network call -- so there is no window where two taps both pass the guard,
// and (3) always re-enable the button in a `finally`, so a genuine failure (declined evidence, network error)
// still lets the coach retry.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','engines','swimmer-invite-bn.js'),'utf8');

function assertGuarded(src,selector,varName){
  // Locate the button lookup + its onclick assignment, in either order, for this specific data-attribute.
  const declRe=new RegExp(`const ${varName}=wrap\\.querySelector\\('\\[${selector}\\]'\\);`);
  assert.match(src,declRe,`${varName} must be captured as its own reference (not re-queried inline) so the same element can be re-enabled later`);

  const handlerRe=new RegExp(`${varName}\\.onclick=async\\(\\)=>\\{if\\(${varName}\\.disabled\\)return;${varName}\\.disabled=true;try\\{`);
  assert.match(src,handlerRe,`${varName}'s click handler must bail out immediately when already disabled, then disable itself as the FIRST statement before any awaited work -- otherwise two taps in quick succession (or one delayed tap plus a retry) both start an independent request chain`);

  // The handler's try block must end in a finally that re-enables the button, so a thrown error (declined
  // evidence, a failed RPC) doesn't permanently lock the coach out of retrying.
  const tryStart=src.indexOf(`${varName}.onclick=async()=>{if(${varName}.disabled)return;${varName}.disabled=true;try{`);
  assert.ok(tryStart>=0);
  const nextChunk=src.slice(tryStart,tryStart+6000);
  const finallyRe=new RegExp(`finally\\{${varName}\\.disabled=false\\}`);
  assert.match(nextChunk,finallyRe,`${varName}'s handler must re-enable the button in a finally block so a failed attempt can be retried`);
}

// 1. The reported bug: the QR-generate button.
assertGuarded(src,'data-bn-generate','genBtn');

// 2. Same missing-guard pattern existed on the neighbouring revoke button in the same modal -- fixed alongside
//    the reported bug since it's the identical failure shape in the same file.
assertGuarded(src,'data-bn-revoke','revokeBtn');

// 3. Syntax sanity -- this file is hand-edited minified JS; a stray brace from the guard edit would be a
//    silent, total breakage of the swimmer-access modal.
require('node:child_process').execFileSync(process.execPath,['--check',path.join(__dirname,'..','engines','swimmer-invite-bn.js')],{stdio:'pipe'});

console.log('SWIMMER_INVITE_DOUBLE_GENERATE_PASS');
