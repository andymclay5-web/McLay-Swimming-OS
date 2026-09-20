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

  const guardRe=new RegExp(`${varName}\\.onclick=async\\(\\)=>\\{if\\(${varName}\\.disabled\\)return;${varName}\\.disabled=true;`);
  assert.match(src,guardRe,`${varName}'s click handler must bail out immediately when already disabled, then disable itself as the FIRST statement before any awaited work -- otherwise two taps in quick succession (or one delayed tap plus a retry) both start an independent request chain`);
  const guardEnd=src.match(guardRe).index+src.match(guardRe)[0].length;

  // 19 Sept 2026 (genBtn only, third same-day freeze fix): genBtn now runs some additional SYNCHRONOUS
  // setup (cancelling a still-running previous attempt) between disabling the button and entering its try
  // block, unlike the simpler revokeBtn. That's fine -- the double-submit guard only actually needs "no
  // await happens before the button is disabled AND before the request chain starts", not "try{ is the very
  // next token". Find where this handler's own try{ actually starts and assert nothing awaited sits in
  // between, so a real window for a double-submit still can't reopen here.
  // Search for the handler's own OUTER try{ (the one wrapping the actual request chain, starting with its
  // first real statement) rather than the first literal "try{" after the guard -- genBtn's synchronous setup
  // now includes a gen.cancel() helper with its own small try{}catch{} cleanup blocks inside it, which would
  // otherwise false-match here.
  const outerTryRe=varName==='genBtn'?/try\{writeAttempt\(/:new RegExp(`try\\{const`);
  const tryMatch=outerTryRe.exec(src.slice(guardEnd));
  assert.ok(tryMatch&&tryMatch.index<3000,`${varName}'s handler must reach its outer try{ block within a short, purely synchronous setup window`);
  const tryIndex=guardEnd+tryMatch.index;
  const setup=src.slice(guardEnd,tryIndex);
  assert.ok(!/\bawait\b/.test(setup),`${varName}'s handler must not await anything between disabling the button and entering its try block -- an await there reopens the exact double-submit window this guard exists to close`);

  // The handler's try block must end in a finally that re-enables the button, so a thrown error (declined
  // evidence, a failed RPC) doesn't permanently lock the coach out of retrying.
  const tryStart=tryIndex;
  // Window widened from 6000, then 13000 for the 19 Sept concurrency-guard comments/logic, then again 20
  // Sept for the "give access from cache, refresh in background" redesign comments (Andy: "I just want to
  // give them access ... this back and forth is wearing me down") -- the genBtn handler's own explanatory
  // comments and checkpoints keep growing past whatever window was last set, pushing the real finally{}
  // further out each time. Widened generously past the current ~13.3k measured distance to give more
  // headroom before this needs bumping again.
  const nextChunk=src.slice(tryStart,tryStart+20000);
  const finallyRe=new RegExp(`finally\\{(?:if\\(activeGeneration===gen\\)activeGeneration=null;if\\(myGeneration===gen\\)myGeneration=null;)?${varName}\\.disabled=false\\}`);
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
