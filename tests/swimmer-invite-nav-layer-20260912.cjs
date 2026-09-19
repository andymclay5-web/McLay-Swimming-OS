'use strict';
// Real coaching failure this pins: after fixing the missing backdrop class (see
// tests/swimmer-invite-modal-backdrop-20260912.cjs), Andy reported a second, deeper bug on the same
// "Give swimmer access" modal -- with the screen now properly locked/dimmed, tapping the on-screen "Close"
// button did nothing at all, and the only way to escape was pressing the phone's back button several times
// in a row ("only way out is back back back back").
//
// Root cause: engines/navigation.js's whole modal/back-button system works off ONE convention -- a modal
// calls `M.nav.openLayer('modal')` the instant it opens, which pushes a single browser-history entry tagged
// with a "layer". `M.nav.dismissLayer()` (which every other modal's Close button calls, e.g.
// engines/attendance-roster.js's close()) checks for that tag: if present it clears #modalHost and pops
// exactly that one history entry (history.back()); this is also what makes a single hardware/gesture back
// press close just the modal instead of navigating the whole app. engines/swimmer-invite-bn.js never called
// openLayer at all, so opening it left the coach's real navigation history completely untouched. Pressing
// back then walked back through whichever screens the coach had already visited -- with the modal still
// sitting on top the entire time -- until, by chance, a press landed on a history entry with no "layer" tag,
// which is the one specific case navigation.js's own popstate handler clears #modalHost as a side effect.
// That's why it eventually worked, and why it took several presses instead of one -- and why the modal's own
// Close button, which only ever called `wrap.remove()` with zero interaction with this system, could
// coincidentally remove the visible DOM while leaving a stray, un-popped history entry behind for every
// screen the coach opened afterwards.
//
// This file is DOM/event-wiring code with no test harness that constructs a real click/back-button cycle
// (matches the existing house style in tests/swimmer-invite-double-generate-20260907.cjs and
// tests/swimmer-invite-modal-backdrop-20260912.cjs, which assert on this exact file's source), so this test
// pins the fix at the source level: modal() must register a nav layer the moment it opens, and the Close
// button must dismiss through the exact same nav layer path every other modal in the app already uses.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const invitePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');
const inviteSrc=fs.readFileSync(invitePath,'utf8');

function checkNavLayerWiring(src){
  // 1. Opening the modal must register it as a dismissable nav layer, same as every other modal in the app.
  //    (Plain ordering check rather than a length-capped regex, since a comment of any length may sit
  //    between the two statements.)
  const appendIx=src.indexOf('host.append(wrap);');
  assert.ok(appendIx>=0,'expected to find host.append(wrap); in engines/swimmer-invite-bn.js -- modal() structure changed unexpectedly');
  const openLayerIx=src.indexOf("M.nav?.openLayer?.('modal');",appendIx);
  assert.ok(openLayerIx>appendIx&&openLayerIx-appendIx<2000,
    "modal() must call M.nav?.openLayer?.('modal') shortly after appending the wrapper -- otherwise opening this modal leaves the coach's real navigation history untouched, so a single back-press (or a Close button routed through dismissLayer) can never reliably close just this modal");

  // 2. The Close button must dismiss through the same nav layer path (dismissLayer), not a bare wrap.remove()
  //    with no interaction with the nav/history system -- that leaves an orphaned history entry behind every
  //    time the modal is closed, which is exactly what forced Andy into pressing back several times.
  // 19 Sept 2026: closeModal now also cancels this modal's own in-flight generate() attempt first (see
  // qr-generate-concurrent-attempt-guard-20260919.cjs) -- an unrelated, later fix that must not reopen the
  // orphaned-history-entry bug this test exists to pin, so the actual remove()+dismissLayer() pairing is
  // still checked exactly, just with that optional prefix allowed in front of it.
  assert.match(src,/const closeModal=\(\)=>\{(?:myGeneration\?\.cancel\?\.\(\);)?wrap\.remove\(\);M\.nav\?\.dismissLayer\?\.\(\);\};/,
    'modal() must define a closeModal helper that removes the wrapper AND calls M.nav?.dismissLayer?.() -- a bare wrap.remove() with no dismissLayer call leaves a stray, un-popped history entry behind, which is what forced multiple back-button presses to actually escape the modal');
  assert.match(src,/\[data-bn-close\]'\)\.onclick=closeModal;/,
    'the Close button must be wired to the closeModal helper (not a bare wrap.remove()) so tapping it goes through the same dismissal path as every other modal in the app');

  // 3. Exactly one place in the file ever removes the modal's DOM node -- inside closeModal itself. A second,
  //    independent wrap.remove() call anywhere else would bypass dismissLayer again and reintroduce the same
  //    orphaned-history-entry bug through a different door.
  const removeCalls=(src.match(/wrap\.remove\(\)/g)||[]).length;
  assert.equal(removeCalls,1,`expected exactly one wrap.remove() call (inside closeModal) but found ${removeCalls} -- every path that closes this modal must go through the same closeModal/dismissLayer helper`);
}

checkNavLayerWiring(inviteSrc);

// 4. Fail-before/pass-after: revert to the exact original buggy shape (no openLayer call, Close wired
//    directly to a bare wrap.remove()) in a scratch copy and confirm the same check correctly reports it.
const appendMarker='host.append(wrap);';
const statusMarker="const status=wrap.querySelector('[data-bn-status]')";
const appendAt=inviteSrc.indexOf(appendMarker);
const statusAt=inviteSrc.indexOf(statusMarker,appendAt);
assert.ok(appendAt>=0&&statusAt>appendAt,'test setup error: could not locate the append/status markers in the real file -- modal() structure changed in a way this test does not expect');
const buggySrc=(inviteSrc.slice(0,appendAt+appendMarker.length)+inviteSrc.slice(statusAt))
  .replace("const closeModal=()=>{wrap.remove();M.nav?.dismissLayer?.();};\n    wrap.querySelector('[data-bn-close]').onclick=closeModal;",
    "wrap.querySelector('[data-bn-close]').onclick=()=>wrap.remove();");
assert.notEqual(buggySrc,inviteSrc,'test setup error: could not construct the reverted buggy source -- the real file\'s modal()/closeModal wiring changed in a way this test does not expect');
assert.throws(()=>checkNavLayerWiring(buggySrc),/must call M\.nav\?\.openLayer\?\.\('modal'\)/,
  'the buggy pre-fix source (no openLayer registration, bare wrap.remove() on Close) must fail this exact check -- confirms the check would have caught the real, reported bug');

// 5. Syntax sanity -- this file is hand-edited minified JS; a stray character from the wiring edit would be
//    a silent, total breakage of the swimmer-access modal.
require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

console.log('SWIMMER_INVITE_NAV_LAYER_PASS');
