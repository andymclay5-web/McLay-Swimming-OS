'use strict';
// Real coaching failure this pins: the sticky Capture button (and every other call site with no athlete
// context -- bindSticky's data-sticky-note/voice/video) opened the Capture modal with EVERY present swimmer's
// checkbox pre-checked. A coach saving a note without noticing the pre-checked list attached it to the whole
// present squad instead of the one swimmer (or the group) it was meant for -- reported live as "Capture
// defaulting to all swimmers." Root-caused in architecture/RUNTIME_AUDIT_20260909.md §4: app.js's
// A.openCapture defaulted its `selected` Set to present.map(a=>a.id) whenever ctx carried no explicit
// athleteIds/athleteId. Fixed to default to an empty selection (a GROUP-level note, matching the existing
// "Group only" button's own empty-selection semantics) instead of "everyone individually selected" -- a caller
// that DOES specify athletes (a modified-swimmer row, the swimmer's own feedback button) is unaffected.
//
// app.js cannot be require()'d directly in Node (its IIFE touches `document`/`window` throughout and no jsdom
// is available here, per house convention -- see tests/modified-target-authority-20260909.cjs). This test
// extracts the *exact*, unmodified source expressions for `explicit` and `selected` from the real
// A.openCapture definition and executes them against constructed ctx/present/M fixtures, so it proves the real
// current source's behavior rather than a paraphrase of intent.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

const src=fs.readFileSync(path.join(root,'app.js'),'utf8');

const SELECTED_MARKER='selected=new Set(';
const selectedMarkerIndex=src.indexOf(SELECTED_MARKER);
assert.ok(selectedMarkerIndex>=0,'A.openCapture\'s `selected=new Set(...)` assignment must exist in app.js');
assert.equal(src.indexOf(SELECTED_MARKER,selectedMarkerIndex+1),-1,'expected exactly one `selected=new Set(` in app.js -- if a second one was added, this test is extracting the wrong one');

// Extract the exact argument text passed to `new Set(...)`, honoring nested parens.
function extractParenArg(source,openIndex){
  let i=openIndex,depth=1;const start=i;
  for(;i<source.length;i++){const c=source[i];if(c==='(')depth++;else if(c===')'){depth--;if(depth===0)break;}}
  if(depth!==0)throw new Error('unbalanced parens while extracting new Set(...) argument');
  return source.slice(start,i);
}
const selectedExpr=extractParenArg(src,selectedMarkerIndex+SELECTED_MARKER.length);

// Extract the `explicit=...` expression immediately preceding it in the same comma list.
const EXPLICIT_MARKER='explicit=';
const explicitStart=src.lastIndexOf(EXPLICIT_MARKER,selectedMarkerIndex);
assert.ok(explicitStart>=0&&explicitStart<selectedMarkerIndex,'the `explicit=` assignment feeding `selected` must precede it in A.openCapture');
let explicitExpr=src.slice(explicitStart+EXPLICIT_MARKER.length,selectedMarkerIndex).replace(/\/\*[\s\S]*?\*\//g,'').trim();
assert.ok(explicitExpr.endsWith(','),'expected `explicit=...,selected=new Set(...` (allowing an inline /*...*/ comment in between) -- the comma-separated const-list shape A.openCapture is written in');
explicitExpr=explicitExpr.slice(0,-1);

const computeExplicit=new Function('ctx',`return ${explicitExpr}`);
const computeSelected=new Function('explicit','present','M',`return new Set(${selectedExpr})`);

const athletes=[{id:'cm'},{id:'md'},{id:'jf'}];
const M={state:{athletes}};
const presentAll=athletes; // everyone attending is "present" for these fixtures

// --- fixture sanity: explicit extraction still matches the documented ctx.athleteIds / ctx.athleteId contract ---
assert.deepEqual(computeExplicit({athleteIds:['cm','md']}),['cm','md'],'fixture sanity: explicit ctx.athleteIds must pass through unchanged');
assert.deepEqual(computeExplicit({athleteId:'cm'}),['cm'],'fixture sanity: a single ctx.athleteId must become a one-element list');
assert.equal(computeExplicit({}),null,'fixture sanity: no athlete context in ctx must resolve to null (the "nothing specified" signal `selected` branches on)');

// --- THE FIX: no explicit athlete context (the sticky Capture button's call shape, ctx={type:'note'} etc) must
// default to an EMPTY selection -- a GROUP-level note -- never to every present swimmer pre-checked. ---
const explicitNone=computeExplicit({type:'note'});
const selectedNone=computeSelected(explicitNone,presentAll,M);
assert.equal(selectedNone.size,0,`Capture opened with no athlete context must default to nobody selected (GROUP note), not ${selectedNone.size} of ${presentAll.length} present swimmers pre-checked -- this is the exact "Capture defaulting to all swimmers" bug`);

// --- A caller that DOES specify athletes (a modified-swimmer row, the swimmer's own feedback button) must be
// unaffected by the fix -- their explicit selection still wins. ---
const explicitOne=computeExplicit({athleteIds:['md']});
const selectedOne=computeSelected(explicitOne,presentAll,M);
assert.deepEqual([...selectedOne],['md'],'a call site that explicitly names an athlete must still get exactly that athlete pre-selected');

// --- An explicit id that is not a real athlete in M.state.athletes must still be filtered out, as before. ---
const explicitGhost=computeExplicit({athleteIds:['md','ghost-id']});
const selectedGhost=computeSelected(explicitGhost,presentAll,M);
assert.deepEqual([...selectedGhost],['md'],'an explicit athleteId that does not exist in M.state.athletes must be dropped, matching existing behavior');

console.log('CAPTURE_DEFAULT_SELECTION_PASS');
