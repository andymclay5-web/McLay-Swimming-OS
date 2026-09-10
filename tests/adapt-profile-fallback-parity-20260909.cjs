'use strict';
// Real coaching failure this pins (architecture/RUNTIME_AUDIT_20260909.md §11): app.js's own A.profile carries a
// hardcoded fallback table of fixed-ratio athletes (used only when no explicit adaptationProfiles row exists for
// that swimmer). It had drifted out of sync with the roster's actual fixed-ratio swimmers -- Charlotte Murphy at
// .60 instead of the coach-confirmed .50, Conor Fischer missing entirely (so a missing-profile-row lookup for him
// would silently return ratio 1, i.e. NO volume reduction for an athlete who needs one), and three names that
// match nobody on the current roster ("Sophie Newlove", "Ruby McCarthy", "Matthew Robertson").
//
// This table is normally NOT the live one a coach ever sees: v4-correct.js loads after app.js and overwrites
// M.adapt.profile in place (M.adapt.item's internal calls to A.profile resolve dynamically against the same
// shared object, so v4-correct.js's corrected table wins for as long as it keeps loading after app.js and keeps
// unconditionally overwriting the property). That is exactly what makes app.js's own copy a landmine rather than
// a live bug: it is wrong right now, but only silent because of load-order, one script reorder or one defensive
// "if(!M.adapt.profile)" guard in v4-correct.js away from becoming the athlete-facing behavior. The fix brings
// app.js's own table back in line with the canonical one (also mirrored in engines/modification.js's FIXED and
// engines/morning-coaching.js's fallbacks and v4-correct.js's own corrected copy), rather than deleting it, so
// the fallback is safe standing on its own.
//
// This test loads ONLY app.js (no v4-correct.js) against a minimal fake DOM -- the established full-file-load
// technique (see tests/board-chrome-stability-20260909.cjs) -- so it observes app.js's OWN A.profile table
// directly, unshadowed by v4-correct.js's override, which is the only way to actually exercise the landmine.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

function makeFakeNode(){
  return {
    textContent:'',innerHTML:'',disabled:false,hidden:false,value:'',
    dataset:{},
    style:{setProperty(){},getPropertyValue:()=>''},
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    onclick:null,
    addEventListener(){},removeEventListener(){},
    querySelector:()=>makeFakeNode(),
    querySelectorAll:()=>[],
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    closest:()=>null,remove(){},appendChild(){},insertAdjacentHTML(){},
  };
}
global.document={querySelector:()=>makeFakeNode(),querySelectorAll:()=>[],addEventListener(){},body:makeFakeNode(),documentElement:makeFakeNode(),createElement:()=>makeFakeNode(),readyState:'complete'};
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
global.MSOS4={};
require(path.join(root,'app.js'));
const M=global.MSOS4;

const athlete=name=>({id:name,full_name:name});
const noRow={adaptationProfiles:[]};

// THE FIX: Charlotte Murphy's fixed-ratio fallback must be the coach-confirmed .50, not the drifted .60 -- a
// wrong ratio here means every condensed session app.js's own fallback ever computed for her (if this table were
// ever live) would overshoot her prescribed volume by 20%.
assert.equal(M.adapt.profile(athlete('Charlotte Murphy'),noRow).ratio,.5,'Charlotte Murphy\'s fallback ratio must be .50, matching the canonical table (engines/modification.js, engines/morning-coaching.js, v4-correct.js), not the drifted .60');

// THE FIX: Conor Fischer must have a fixed-ratio fallback at all -- the drifted table omitted him entirely,
// meaning a missing-profile-row lookup for him would silently return ratio 1 (full volume, no reduction) rather
// than his coach-confirmed .50.
assert.equal(M.adapt.profile(athlete('Conor Fischer'),noRow).ratio,.5,'Conor Fischer must get the coach-confirmed .50 fallback ratio, not silently fall through to ratio 1 (no reduction) because his name was missing from the table');

// The other real, current fixed-ratio athletes must also resolve correctly.
assert.equal(M.adapt.profile(athlete('McKenzie Drage'),noRow).ratio,2/3,'McKenzie Drage fallback ratio must be 2/3');
assert.equal(M.adapt.profile(athlete('Amber Proudfoot'),noRow).ratio,2/3,'Amber Proudfoot fallback ratio must be 2/3 (from the named table entry, not a startsWith("amber") guess)');
assert.equal(M.adapt.profile(athlete('Matthew Kofoed'),noRow).ratio,2/3,'Matthew Kofoed fallback ratio must be 2/3');
assert.equal(M.adapt.profile(athlete('Ruby Stace'),noRow).ratio,2/3,'Ruby Stace fallback ratio must be 2/3');

// The stale names from the drifted table must no longer resolve to a fixed ratio -- they match nobody on the
// current roster, and a coincidental future athlete with one of these exact names must not silently inherit a
// stale ratio that was never actually programmed for them.
assert.equal(M.adapt.profile(athlete('Sophie Newlove'),noRow).ratio,1,'Sophie Newlove is not on the current fixed-ratio roster and must default to ratio 1 (no forced reduction), not the stale .75');
assert.equal(M.adapt.profile(athlete('Ruby McCarthy'),noRow).ratio,1,'Ruby McCarthy is not on the current fixed-ratio roster and must default to ratio 1');
assert.equal(M.adapt.profile(athlete('Matthew Robertson'),noRow).ratio,1,'Matthew Robertson is not on the current fixed-ratio roster and must default to ratio 1');

// An explicit adaptationProfiles row must still win over any fallback, for both a fixed-ratio athlete and a
// stranger to the table -- the fallback table must never override real coach-entered data.
assert.equal(M.adapt.profile(athlete('Charlotte Murphy'),{adaptationProfiles:[{athlete_id:'Charlotte Murphy',default_volume_ratio:.8,active:true}]}).ratio,.8,'an explicit profile row must still override the fixed-ratio fallback');

console.log('ADAPT_PROFILE_FALLBACK_PARITY_PASS');
