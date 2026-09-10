'use strict';
// Real coaching failure this pins (architecture/RUNTIME_AUDIT_20260909.md §4):
//
// 1. Taskbar flash/shape-change. UI.renderCurrent() used to call UI.renderHeader() (which itself calls
//    UI.configureRoleChrome() at its own end, rebuilding .bottom-nav/.sticky-actions from scratch) BEFORE the
//    role-based view correction ran, then call UI.configureRoleChrome() a SECOND time at the very end once the
//    corrected view was known -- so every renderCurrent() rebuilt the chrome twice, the first time against a
//    view that was about to be overridden (e.g. an assistant coach landing on 'hub', corrected to 'board').
//    Fixed by resolving the final view/role first, then calling renderHeader() (and, through it,
//    configureRoleChrome()) exactly once, already against the corrected state.
// 2. Phone pinch-zoom instability. .sticky-actions/.bottom-nav are position:fixed with hardcoded pixel bottom
//    offsets and no visualViewport handling -- the standard setup for Android Chrome's fixed-element-detaches-
//    under-pinch-zoom behavior. Fixed by tracking window.visualViewport's live offset in a CSS custom property
//    (--msos-vv-offset) that both bars' `bottom` now incorporates.
// 3. z-index inversion. v4-correct.css's <=700px mobile media query dropped .sticky-actions to z-index:40,
//    below .bottom-nav's z-index:49 (styles.css) -- on exactly the phones coaches use -- letting the nav bar
//    occlude Capture/Edit/Finish. Fixed by restoring it to styles.css's own base value (50).
//
// Part 1 exercises the real, live UI.renderCurrent()/UI.configureRoleChrome() by fully loading app.js against a
// minimal fake DOM (the same technique tests/parser-natural-cw.cjs and this session's other new tests use for
// files with no jsdom available) and spying on configureRoleChrome to count real invocations and observe the
// exact document.body.dataset.msosView value at each one -- proving the fix removes both the extra render AND
// the transient wrong-view window, not just a cosmetic duplicate call.
const assert=require('node:assert/strict');
const fs=require('node:fs');
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
const bodyNode=makeFakeNode();
global.document={querySelector:()=>makeFakeNode(),querySelectorAll:()=>[],addEventListener(){},body:bodyNode,documentElement:makeFakeNode(),createElement:()=>makeFakeNode(),readyState:'complete'};
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
global.MSOS4={};
require(path.join(root,'app.js'));
const M=global.MSOS4,UI=M.ui;
M.ensureState();

// fixture sanity: an unhandled/no-op view must still go through configureRoleChrome exactly once (no view
// dispatch fires, isolating the chrome-render-count behavior from the (unloaded, in this harness) board engine).
M.state.settings.activeRole='owner';
M.state.settings.view='xyz-fixture-sanity-view';
{
  let calls=0;const orig=UI.configureRoleChrome;
  UI.configureRoleChrome=function(...a){calls++;return orig.apply(this,a)};
  UI.renderCurrent();
  UI.configureRoleChrome=orig;
  assert.equal(calls,1,'fixture sanity: a render with no role-based view correction needed must still configure chrome exactly once');
}

// THE FIX: an assistant coach landing on 'hub' (corrected to 'board') must configure chrome exactly ONCE, and
// only ever with the CORRECTED view -- never transiently with the stale pre-correction 'hub'.
M.state.settings.activeRole='assistant';
M.state.settings.view='hub';
for(const fn of ['renderBoard','renderTV','renderHub','renderSwimmer','renderMeet','renderAthletes','renderRoll','renderTimes','renderConnection','renderGuardian'])UI[fn]=()=>{};
{
  let calls=0;const seenViews=[];const orig=UI.configureRoleChrome;
  UI.configureRoleChrome=function(...a){calls++;const r=orig.apply(this,a);seenViews.push(bodyNode.dataset.msosView);return r};
  UI.renderCurrent();
  UI.configureRoleChrome=orig;
  assert.equal(calls,1,`an assistant coach's corrected 'hub'->'board' render must configure the Board chrome exactly once, not twice -- got ${calls} calls`);
  assert.deepEqual(seenViews,['board'],`chrome must only ever be configured against the CORRECTED view -- must never transiently show 'hub' (the stale pre-correction view) even for one render pass: saw ${JSON.stringify(seenViews)}`);
}
assert.equal(M.state.settings.view,'board','the role correction itself must still take effect (assistant coaches never land on hub)');

console.log('RENDER_CURRENT_SINGLE_CHROME_PASS');

// --- Part 2: bindViewportStability must wire up window.visualViewport and drive --msos-vv-offset. ---
const appSrc=fs.readFileSync(path.join(root,'app.js'),'utf8');
function extractBalancedFunctionBody(source,marker){
  const markerIndex=source.indexOf(marker);
  if(markerIndex<0)throw new Error(`${marker} not found in app.js`);
  let i=markerIndex+marker.length,depth=1;const start=i;
  for(;i<source.length;i++){const c=source[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  if(depth!==0)throw new Error(`${marker} body was not closed (unbalanced braces)`);
  return source.slice(start,i);
}
const bindViewportStabilityBody=extractBalancedFunctionBody(appSrc,'function bindViewportStability(){');
const bindViewportStability=new Function('g','document',bindViewportStabilityBody);

assert.match(appSrc,/bindSticky\(\);bindViewportStability\(\);/,'M.boot must call bindViewportStability() alongside bindSticky() so the viewport listener is actually wired up at startup');

// No visualViewport in this environment (older WebView) -- must degrade silently, never throw.
assert.doesNotThrow(()=>bindViewportStability({},{documentElement:{style:{setProperty(){}}}}),'bindViewportStability must no-op safely when window.visualViewport is unavailable');

// With a visualViewport present, it must compute the live offset and register live-updating listeners.
{
  const setCalls=[];
  const fakeRoot={style:{setProperty:(k,v)=>setCalls.push([k,v])}};
  const listeners={};
  const fakeVv={height:600,offsetTop:0,addEventListener:(evt,fn)=>{listeners[evt]=fn}};
  const fakeG={visualViewport:fakeVv,innerHeight:800};
  bindViewportStability(fakeG,{documentElement:fakeRoot});
  assert.ok(setCalls.length>=1,'bindViewportStability must set the --msos-vv-offset custom property immediately on load');
  assert.equal(setCalls[0][0],'--msos-vv-offset','the custom property name must be --msos-vv-offset (matching what styles.css consumes)');
  assert.equal(setCalls[0][1],'200px','with a layout viewport of 800px and a visible viewport of 600px starting at offsetTop 0, the pinch-zoomed-away gap must be reported as 200px');
  assert.ok(typeof listeners.resize==='function'&&typeof listeners.scroll==='function','bindViewportStability must listen for both resize and scroll on visualViewport, since either can change the offset during a pinch-zoom/pan');
  // Simulate the viewport zooming back out to full size -- the offset must recompute to 0, not stick at 200px.
  fakeVv.height=800;
  listeners.resize();
  assert.equal(setCalls.at(-1)[1],'0px','when the visual viewport returns to full size, --msos-vv-offset must recompute to 0px, not remain stuck at the old pinch-zoomed value');
}

console.log('VIEWPORT_STABILITY_PASS');

// --- Part 3: CSS must consume --msos-vv-offset, and the z-index inversion must stay fixed. ---
const stylesCss=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const v4CorrectCss=fs.readFileSync(path.join(root,'v4-correct.css'),'utf8');

assert.match(stylesCss,/\.sticky-actions\{[^}]*bottom:calc\(70px \+ var\(--msos-vv-offset,0px\)\)/,'.sticky-actions must position its bottom edge using --msos-vv-offset, not a bare hardcoded 70px');
assert.match(stylesCss,/\.bottom-nav\{[^}]*bottom:var\(--msos-vv-offset,0px\)/,'.bottom-nav must position its bottom edge using --msos-vv-offset, not a bare hardcoded 0');

const bottomNavZ=Number((stylesCss.match(/\.bottom-nav\{[^}]*z-index:(\d+)/)||[])[1]);
assert.ok(Number.isFinite(bottomNavZ),'.bottom-nav base z-index must be found in styles.css');
const mobileStickyZ=Number((v4CorrectCss.match(/@media \(max-width:700px\)\{[\s\S]*?\.sticky-actions\{z-index:(\d+)\}/)||[])[1]);
assert.ok(Number.isFinite(mobileStickyZ),'v4-correct.css\'s <=700px media query must still set an explicit .sticky-actions z-index (documenting the historical inversion this test guards against)');
assert.ok(mobileStickyZ>=bottomNavZ,`on mobile (<=700px), .sticky-actions (z-index:${mobileStickyZ}) must stay at or above .bottom-nav (z-index:${bottomNavZ}) so the nav bar can never occlude Capture/Edit/Finish -- this is the exact inversion architecture/RUNTIME_AUDIT_20260909.md §4 found`);

console.log('CHROME_ZINDEX_VIEWPORT_CSS_PASS');
