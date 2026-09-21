'use strict';
// Real coaching failure this fixes: Andy typed a real session with the IM stroke written as "IM" the normal
// way -- "6x100 IM desc 1-3 15sr" and "450 (200 IM, 100 #1, 150 fr" -- but his phone's own autocorrect
// silently turned the standalone word "im" into the contraction "I'm" before it ever reached the parser (a
// very common mobile-keyboard behaviour, not a typo Andy made on purpose). The parser's stroke recognizer
// (v4-poolside-core.js's cueStroke) only ever matched the literal letters "IM" together; "I'm" has an
// apostrophe between the I and the m, so it never matched at all. A pre-existing narrow fix
// (v4-poolside-core.js's normaliseText, the "Nx10p i'm" -> "N x 100 IM" replace) covers exactly one
// historical typo shape and does nothing for "<number> I'm" in general, so this exact autocorrect
// substitution slipped straight through as literal, unrecognised text -- Andy saw "I'm" verbatim on his
// Board instead of the IM stroke being resolved, in both his warm-up set and his main-set breakdown line.
//
// Fixed two ways in v4-poolside-core.js: (1) normaliseText now also replaces any "<digit> I'm" with
// "<digit> IM" (scoped to right after a distance number so it only fires in swim-notation context, never a
// genuine English contraction in free-text notes), and (2) cueStroke's IM-matching regex also recognises the
// bare "I'm" token, so a cue line hit by the same autocorrect substitution isn't silently dropped either.
const assert=require('node:assert/strict');

global.window=global;
global.scrollY=0;
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
global.location={hash:'',href:'https://im-typo.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');

// Andy's own real, as-typed session text (his phone's autocorrect already baked "I'm" in before he ever saw
// it) -- the warm-up 6x100 line and the main-set 450 breakdown line are the two he specifically reported.
const source=`WARM-UP
600 choice
6x100 I'm desc 1-3 15sr
Desc 1-3

MAIN SET
3 Rounds:
  3x50 1 build, 1@200pace, 1 max @ 1:30
  450 (200 I'm, 100 #1, 150 fr

POST-SET
3x400 choice
TOTAL 4800m`;

function checkParse(M){
  const session=M.parser.parse(source,{id:'im-typo-test',course:'SCM'});
  const wu=session.blocks.find(b=>b.type==='warm_up');
  assert.ok(wu,'warm-up block missing');
  const warmSet=wu.items.find(i=>i.kind==='set'&&i.reps===6&&i.distance===100);
  assert.ok(warmSet,'6x100 warm-up set missing');
  assert.equal(warmSet.stroke,'IM',`warm-up 6x100 set must resolve stroke to IM, got ${JSON.stringify(warmSet.stroke)} -- raw: ${JSON.stringify(warmSet.raw)}`);
  assert.doesNotMatch(String(warmSet.raw||''),/i['’]m/i,'warm-up set raw text still contains the literal "I\'m" typo -- normaliseText did not correct it');

  const main=session.blocks.find(b=>b.type==='main_set');
  assert.ok(main,'main set block missing');
  const group=main.items.find(i=>i.kind==='group');
  assert.ok(group,'main set 3-round group missing');
  const breakdown=group.items.find(i=>i.kind==='set'&&i.reps===1&&i.distance===450);
  assert.ok(breakdown,'450 breakdown set missing from main set group');
  assert.equal(breakdown.stroke,'IM',`main-set 450 breakdown must resolve stroke to IM, got ${JSON.stringify(breakdown.stroke)} -- raw: ${JSON.stringify(breakdown.raw)}`);
  assert.doesNotMatch(String(breakdown.raw||''),/i['’]m/i,'main-set 450 breakdown raw text still contains the literal "I\'m" typo -- normaliseText did not correct it');
}

checkParse(global.MSOS4);

// Fail-before/pass-after: revert v4-poolside-core.js's two IM-typo fixes to their exact original shape in a
// scratch copy, boot a SEPARATE fake global namespace against it, and confirm the same checks correctly fail.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const realPath=path.join(__dirname,'..','v4-poolside-core.js');
const realSrc=fs.readFileSync(realPath,'utf8');

const normaliseTextFix=`      line=line.replace(/\\b(\\d{1,2})\\s*x\\s*10p\\s+i[’']?m\\b/gi,'$1 x 100 IM');
      // Real coaching failure this fixes: Andy typed "IM" while entering a real session ("6x100 IM desc
      // 1-3 15sr", "450 (200 IM, 100 #1, 150 fr") and his phone's own autocorrect silently turned the
      // standalone word "im" into the contraction "I'm" before it ever reached this parser -- a very common
      // mobile-keyboard behaviour, not a typo Andy made on purpose. The line-100 fix above only covers one
      // specific historical typo shape ("Nx10p i'm"); it never matches "<number> I'm" in general, so this
      // exact autocorrect substitution slipped straight through as literal, unrecognised text and showed up
      // verbatim on the Board instead of being read as the IM stroke. Scoped to right after a digit (the
      // distance) so it only fires in this swim-notation context, never touching a genuine English
      // contraction that happened to appear in free-text session notes.
      line=line.replace(/(\\d)\\s+i[’']m\\b/gi,'$1 IM');\n`;
const normaliseTextOriginal=`      line=line.replace(/\\b(\\d{1,2})\\s*x\\s*10p\\s+i[’']?m\\b/gi,'$1 x 100 IM');\n`;
assert.ok(realSrc.includes(normaliseTextFix),'test setup error: could not locate the normaliseText IM-typo fix in the real file -- its wording changed in a way this test does not expect');

const cueStrokeFix=`    // "i['’]m" alongside the plain "IM" token: a mobile keyboard autocorrecting the standalone word
    // "im" into the contraction "I'm" (see the matching fix in normaliseText above) can also land inside a
    // cue line (e.g. a race-intent annotation), not only the main set line -- recognised here too so a cue
    // naming the IM stroke isn't silently dropped just because of the same autocorrect substitution.
    const t=txt(line);if(/\\b(?:individual\\s+medley|medley|IM|i[’']m)\\b/i.test(t))return'IM';`;
const cueStrokeOriginal=`    const t=txt(line);if(/\\b(?:individual\\s+medley|medley|IM)\\b/i.test(t))return'IM';`;
assert.ok(realSrc.includes(cueStrokeFix),'test setup error: could not locate the cueStroke IM-typo fix in the real file -- its wording changed in a way this test does not expect');

const buggySrc=realSrc.replace(normaliseTextFix,normaliseTextOriginal).replace(cueStrokeFix,cueStrokeOriginal);
assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

// Boot the buggy source in its own isolated sandbox (separate MSOS4 namespace) rather than reusing the
// process-wide require cache, so it does not disturb the already-verified real module's state.
const sandbox={
  window:{},scrollY:0,requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 1;},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}},
  location:{hash:'',href:'https://im-typo-buggy.test/'},
  history:{state:null,replaceState(){},pushState(){},back(){}},
  addEventListener:()=>{},removeEventListener:()=>{},console,
};
sandbox.globalThis=sandbox;sandbox.window=sandbox;
vm.createContext(sandbox);
// Re-run app.js and v4-correct.js fresh inside the sandbox so MSOS4 starts clean, then the buggy
// v4-poolside-core.js on top -- mirrors exactly how the real boot chain layers these three files.
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),sandbox,{filename:'app.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-correct.js'),'utf8'),sandbox,{filename:'v4-correct.js'});
vm.runInContext(buggySrc,sandbox,{filename:'v4-poolside-core.buggy.js'});

let threw=false,threwMessage='';
try{checkParse(sandbox.MSOS4);}catch(err){threw=true;threwMessage=err.message;}
assert.ok(threw,'the buggy pre-fix source (no IM-typo normalisation) must fail checkParse -- confirms the check would have caught the real, reported bug');
assert.match(threwMessage,/stroke to IM/,'the buggy source should fail specifically on the stroke-resolution assertion');

require('node:child_process').execFileSync(process.execPath,['--check',realPath],{stdio:'pipe'});

console.log('IM_AUTOCORRECT_TYPO_PASS');
