'use strict';
// Real risk this pins (architecture/RUNTIME_AUDIT_20260909.md §7): engines/board.js's bind() used to attach a
// per-button BUBBLE-phase onclick to every [data-msos-stroke] button, duplicating engines/board-state.js's
// document-level CAPTURE-phase listener for the same selector. The capture-phase listener always runs first and
// calls e.stopImmediatePropagation(), so board.js's copy could never actually fire -- a landmine masked only by
// DOM event-phase ordering, one refactor of board-state.js's listener away from either silently reviving a
// second, out-of-sync stroke-change code path or leaving a confusing dead duplicate for the next person to
// "fix" by editing the wrong one. Removed outright, along with the setStroke() helper that had no other caller
// once its only call site was gone.
//
// This is dead-code removal with NO intended behavior change (board-state.js's capture-phase listener already
// won every time), so the test asserts the dead code is gone and the real, active implementation is intact --
// not a before/after behavioral difference.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

const board=fs.readFileSync(path.join(root,'engines','board.js'),'utf8');
const boardState=fs.readFileSync(path.join(root,'engines','board-state.js'),'utf8');

assert.doesNotMatch(board,/host\.querySelectorAll\('\[data-msos-stroke\]'\)\.forEach\(btn=>btn\.onclick=/,'engines/board.js must not re-attach a bubble-phase onclick to [data-msos-stroke] buttons -- that handler can never fire (engines/board-state.js\'s capture-phase listener always wins first) and is dead weight at best, a landmine at worst');
assert.doesNotMatch(board,/function setStroke\(/,'engines/board.js\'s own setStroke() must stay removed now that its only caller (the dead bubble-phase handler) is gone -- board-state.js\'s own setStroke is the real, active implementation');

// The real, active implementation must still be intact: a document-level CAPTURE-phase listener that recognizes
// both [data-msos-stroke] and [data-msos-fast-stroke], and a setStroke() that actually mutates
// M.state.adaptationOverrides.
assert.match(boardState,/document\.addEventListener\('click',e=>\{[\s\S]*?\},true\)/,'engines/board-state.js must still register its document-level click listener in the CAPTURE phase (the `true` third argument) -- that is what makes it the deterministic winner over any bubble-phase duplicate');
assert.match(boardState,/data-msos-fast-stroke\],#boardView \[data-msos-stroke\]/,'the capture-phase listener must still recognize both [data-msos-fast-stroke] (Times panel) and [data-msos-stroke] (Board stroke pill)');
assert.match(boardState,/function setStroke\(session,item,ath,value/,'engines/board-state.js\'s own setStroke must still exist -- it is the sole implementation actually wired to a live click path');
assert.match(boardState,/function strokeMenu\(btn\)/,'engines/board-state.js\'s strokeMenu (invoked by the capture-phase listener) must still exist');

console.log('BOARD_STROKE_BINDING_DEDUPE_PASS');
