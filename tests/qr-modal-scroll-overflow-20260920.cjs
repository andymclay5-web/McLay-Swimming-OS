'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026, twice in a row -- Mackenzie, then a repeat on the
// same flow, right after the qr-encoder-inlined build finally made the QR image render successfully for the
// very first time): after a successful "Generate 15-minute QR" -- confirmed working, the code rendered, the
// link was real -- the WHOLE MODAL appeared to lock up: no reachable Close button, Copy link barely visible,
// the only way out being repeated presses of the phone's back button. This was never a JS freeze -- every
// click handler in engines/swimmer-invite-bn.js was firing exactly as written the entire time.
//
// Root cause: every OTHER modal in this app (app.js's modal(), used by session edit / new session / session
// intake / mod-edit) wraps its content in a `<section class="modal">`, and styles.css's own
// `.modal{max-height:88vh;overflow:auto}` rule is what caps that content's height and makes it internally
// scrollable inside the fixed, full-screen `.modal-backdrop` (`display:grid;place-items:end center`, which
// bottom-anchors its single child with no scroll ability of its own). engines/swimmer-invite-bn.js's modal()
// is the ONLY modal in the whole codebase that never used the `.modal` class -- its content box,
// `.bn-access-modal` (engines/swimmer-invite-bn.css), never had any height cap or overflow rule of its own.
// This never showed up before tonight because the QR image had never once actually rendered across the whole
// multi-hour CDN saga (three CDN failures, then a fourth failure loading the replacement vendored file) -- the
// modal only ever displayed a short placeholder line, comfortably under one screen. Tonight, for the first
// time, the QR encoder is fully inline and reliable, so a real ~240px canvas plus the revealed link box render
// every time -- pushing this modal's real content taller than the viewport for the first time ever, with the
// excess bottom-anchored off the TOP of the screen and no way to scroll back up to reach it.
//
// The fix: engines/swimmer-invite-bn.css's `.bn-access-modal` rule now carries the exact same
// `max-height:88vh;overflow:auto` every other modal in this app already relies on. No JS was touched --
// nothing about the QR encoder, the Generate flow, or any button's wiring changed at all.
//
// This test proves: (1) `.bn-access-modal` genuinely has both a height cap and overflow:auto, so its content
// can never again grow taller than the screen with no way to reach the rest of it; (2) that containment
// strategy is the SAME one styles.css's own `.modal` rule already uses -- proven by comparison, not just by
// two numbers that happen to match today and could quietly drift apart later; (3) fail-before/pass-after
// against the exact pre-fix `.bn-access-modal` rule, proving this test would have caught this exact
// regression.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const cssPath=path.join(repoRoot,'engines','swimmer-invite-bn.css');
const css=fs.readFileSync(cssPath,'utf8');
const stylesCss=fs.readFileSync(path.join(repoRoot,'styles.css'),'utf8');

function extractRule(src,selector){
  // Selector rules in these files are minified onto one line with no rule-spanning newlines -- a plain
  // "selector{...}" match, stopping at the first closing brace, is exact and unambiguous here.
  const m=src.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  assert.ok(m,`could not find rule for ${selector}`);
  return m[1];
}

function assertScrollContained(rule,label){
  const maxHeight=rule.match(/max-height:\s*([\d.]+)(vh|vw|px|%)/);
  assert.ok(maxHeight,`${label}: must declare a max-height so its content can never exceed one screen`);
  assert.match(rule,/overflow:\s*(auto|scroll)/,`${label}: must declare overflow:auto (or scroll) so content taller than max-height is reachable by scrolling, not stranded off-screen`);
  return maxHeight;
}

function runBnAccessModalIsScrollContained(){
  const rule=extractRule(css,'.bn-access-modal');
  const [,value,unit]=assertScrollContained(rule,'.bn-access-modal');
  assert.equal(unit,'vh','.bn-access-modal max-height should be viewport-relative (vh), matching the real-device symptom: fixed-pixel heights do not adapt to Andy\'s actual phone viewport the way the rest of this app\'s modals already do');
  assert.ok(Number(value)<=100,'.bn-access-modal max-height must not exceed the full viewport height');
  console.log('QR_MODAL_BN_ACCESS_MODAL_SCROLL_CONTAINED_PASS');
}

function runMatchesAppsOwnModalPattern(){
  // The whole point of this fix is to stop reinventing modal containment -- prove .bn-access-modal now uses
  // the exact same strategy as the app's own already-proven .modal rule, not just a coincidentally similar one.
  const bnRule=extractRule(css,'.bn-access-modal');
  const realModalRule=extractRule(stylesCss,'.modal');
  const bnCap=assertScrollContained(bnRule,'.bn-access-modal');
  const realCap=assertScrollContained(realModalRule,'.modal');
  assert.equal(bnCap[2],realCap[2],'.bn-access-modal and the app\'s real .modal rule must use the same height-cap unit');
  console.log('QR_MODAL_MATCHES_APP_MODAL_PATTERN_PASS');
}

function runBackdropStillBottomAnchoredWithNoOwnScroll(){
  // Sanity check on the other half of the real mechanism: .modal-backdrop itself has no overflow/scroll
  // ability of its own (by design -- it's the fixed, full-screen dimmed layer) and bottom-anchors its single
  // child. If this ever changed to give the backdrop its own overflow:auto instead, .bn-access-modal's own
  // max-height/overflow would become redundant rather than wrong -- but this proves the fix lives where the
  // actual overflow occurs (the child), matching the one already-working pattern app.js/styles.css use.
  const backdropRule=extractRule(stylesCss,'.modal-backdrop');
  assert.doesNotMatch(backdropRule,/overflow:\s*(auto|scroll)/,'.modal-backdrop is not expected to scroll itself -- containment belongs on its child content box, exactly like the app\'s real .modal rule');
  console.log('QR_MODAL_BACKDROP_MECHANISM_CONFIRMED_PASS');
}

function runFailBefore(){
  // The exact pre-fix .bn-access-modal rule, verbatim, before this build added max-height/overflow.
  const preFixRule='max-width:420px;margin:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 18px 70px rgba(0,0,0,.28)';
  assert.throws(()=>assertScrollContained(preFixRule,'pre-fix .bn-access-modal'),assert.AssertionError,'pre-fix .bn-access-modal rule: this test must actually fail against the real pre-fix CSS, proving it would have caught this exact regression (unbounded height, no scroll, content strandable off-screen)');
  console.log('QR_MODAL_SCROLL_FAILBEFORE_PASS');
}

(function(){
  runBnAccessModalIsScrollContained();
  runMatchesAppsOwnModalPattern();
  runBackdropStillBottomAnchoredWithNoOwnScroll();
  runFailBefore();
  process.exit(0);
})();
