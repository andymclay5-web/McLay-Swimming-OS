'use strict';
// Real coaching failure this pins: Andy's own live report -- opening "Give swimmer access" (the QR-generate
// modal, engines/swimmer-invite-bn.js), he could still tap around the rest of the app behind it as if no
// modal were open at all, and tapping the modal's own "Close" button appeared to do nothing ("freezes the
// whole screen"). Root cause, confirmed by grepping every modal-constructing file in the repo: EVERY other
// modal in the app (app.js x5, attendance-roster.js, modification-edit.js, capture-ui.js, and a dozen
// meet-*.js files) stamps its overlay wrapper with the real, styled `modal-backdrop` class -- defined once in
// styles.css as `position:fixed;z-index:90;inset:0;background:rgba(3,25,36,.48);display:grid;place-items:end
// center;padding:12px` -- but swimmer-invite-bn.js alone stamped its wrapper with `modal-overlay`, a class
// name with NO matching CSS rule anywhere in the codebase. With no matching rule the wrapper rendered as a
// plain, unstyled block appended in the page's NORMAL scroll flow instead of a fixed, full-screen, dimmed
// overlay -- nothing blocked touches to the page behind it (exactly "I can move around as usual"), and
// removing that in-flow block on Close reflows/scrolls the page in a way that can look like nothing happened
// rather than the modal cleanly disappearing.
//
// This file is DOM/event-wiring code with no test harness that constructs a real click cycle (matches the
// existing house style in tests/swimmer-invite-double-generate-20260907.cjs, which asserts on this exact
// file's source rather than executing it), so this test pins the fix three ways: (1) the wrapper is stamped
// with the one real, styled class, (2) that class actually has a full-screen/fixed CSS rule backing it in
// styles.css -- so a future rename to yet another undefined class would still be caught, and (3) no OTHER
// bespoke overlay class has quietly reappeared anywhere in the engine files, which would reproduce the exact
// same silent-no-backdrop failure under a different name.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const invitePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');
const stylesPath=path.join(__dirname,'..','styles.css');
const inviteSrc=fs.readFileSync(invitePath,'utf8');
const stylesSrc=fs.readFileSync(stylesPath,'utf8');

function checkModalBackdropWiring(src,styles){
  // 1. The swimmer-access modal wrapper must use the same real overlay class every other modal in the app
  //    uses -- not a bespoke, undefined one.
  const classMatch=src.match(/wrap\.className=(['"])([^'"]+)\1;wrap\.dataset\.bnAccess/);
  assert.ok(classMatch,'expected to find wrap.className=...;wrap.dataset.bnAccess in engines/swimmer-invite-bn.js -- modal() structure changed unexpectedly');
  const cls=classMatch[2];
  assert.equal(cls,'modal-backdrop',`swimmer-access modal wrapper must use the real 'modal-backdrop' overlay class (matching every other modal in the app), not '${cls}' -- otherwise it renders as a plain in-page block with no fixed positioning or dimmed backdrop, letting the coach interact with the rest of the app right through it`);

  // 2. That class must actually be backed by a real fixed/full-screen CSS rule -- confirms the class isn't
  //    merely correctly SPELLED but still undefined (would silently reproduce the identical bug).
  const ruleMatch=styles.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
  assert.ok(ruleMatch,`styles.css has no CSS rule for '.${cls}' at all -- a correctly-named but undefined class would still leave the modal with no overlay styling`);
  const rule=ruleMatch[1];
  assert.match(rule,/position:fixed/,`.${cls}'s CSS rule must set position:fixed so the modal sits above the page instead of in normal scroll flow`);
  assert.match(rule,/inset:0/,`.${cls}'s CSS rule must cover the full viewport (inset:0) so it actually blocks interaction with the page behind it`);
}

checkModalBackdropWiring(inviteSrc,stylesSrc);

// 3. Fail-before/pass-after: revert to the exact original buggy source (the undefined 'modal-overlay' class)
//    in a scratch copy and confirm the same check correctly reports the bug.
const buggySrc=inviteSrc.replace("wrap.className='modal-backdrop';wrap.dataset.bnAccess","wrap.className='modal-overlay';wrap.dataset.bnAccess");
assert.notEqual(buggySrc,inviteSrc,'test setup error: could not construct the reverted buggy source -- the real file\'s wrap.className assignment text changed in a way this test does not expect');
assert.throws(()=>checkModalBackdropWiring(buggySrc,stylesSrc),/must use the real 'modal-backdrop' overlay class/,'the buggy pre-fix source (modal-overlay) must fail this exact check -- confirms the check would have caught the real, reported bug');

// 4. No other engine/root file has quietly introduced a second bespoke, undefined overlay class -- every
//    modal-constructing file in the app must use the one real 'modal-backdrop' class name.
const glob=require('node:child_process').execFileSync('sh',['-c',"grep -rlo \"class=\\\"modal-backdrop\\\"\\|className='modal-backdrop'\" --include=*.js .."],{cwd:__dirname,encoding:'utf8'});
assert.ok(glob.includes('swimmer-invite-bn.js'),'swimmer-invite-bn.js should now be among the files using the real modal-backdrop class');
const rootDir=path.join(__dirname,'..');
const suspiciousFiles=require('node:child_process').execFileSync('sh',['-c',"grep -rlo \"className='modal-[a-z-]*'\\|class=\\\"modal-[a-z-]*\\\"\" --include=*.js . | sort -u"],{cwd:rootDir,encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const f of suspiciousFiles){
  const content=fs.readFileSync(path.join(rootDir,f),'utf8');
  const bespoke=content.match(/className=(['"])(modal-[a-z-]+)\1/g)||[];
  for(const m of bespoke){
    const name=m.match(/modal-[a-z-]+/)[0];
    assert.ok(name==='modal-backdrop',`${f} uses an overlay class '${name}' other than the real 'modal-backdrop' -- verify styles.css actually defines it as a fixed/full-screen overlay, or this reproduces the same silent-no-backdrop bug under a new name`);
  }
}

// 5. Syntax sanity -- this file is hand-edited minified JS; a stray character from the class-name edit would
//    be a silent, total breakage of the swimmer-access modal.
require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});

console.log('SWIMMER_INVITE_MODAL_BACKDROP_PASS');
