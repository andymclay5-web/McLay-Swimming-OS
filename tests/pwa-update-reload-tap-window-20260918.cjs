'use strict';
// Real coaching failure this fixes (Andy, 18 Sept 2026, live): "I don't know where the reload now button is".
// There is no separate button -- the "tap to reload now" affordance IS the small "MSOS ... installed" toast
// banner itself (engines/pwa-update.js's armReloadTap(), wired up from P.notify()). But the banner was only
// ever visible AND tappable for 2.2 seconds -- the same generic duration M.toast() (app.js) uses for every
// throwaway toast in the app -- before it silently faded and its click listener was torn down. A coach had
// well under 2.2 seconds to notice a small banner in the corner of the screen, register what it said, and
// tap it, or it was gone -- functionally indistinguishable from there being no reload affordance at all,
// which is exactly what Andy reported live. This test proves: (1) the update toast now stays both visibly
// shown and tappable for a much longer, purpose-specific hold (P.RELOAD_TAP_HOLD_MS) instead of the old
// blanket 2200ms; (2) tapping it within that hold still reloads exactly once, same as before; (3) once the
// hold genuinely elapses, the banner does correctly stop responding (this is a longer window, not an
// unlimited one) and visually hides again; (4) the production default is a realistic, generous window (at
// least 10 seconds), not the old ~2 second one; (5) fail-before/pass-after against the exact old hardcoded
// 2200ms cutoff, reproducing Andy's exact real-world experience.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const pwaPath=path.join(repoRoot,'engines','pwa-update.js');
const realSrc=fs.readFileSync(pwaPath,'utf8');

function makeLocalStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear()};}
function makeToastEl(){const listeners={};return{
  textContent:'',classList:{show:false,add(){this.show=true;},remove(){this.show=false;}},style:{},title:'',
  addEventListener(type,fn){(listeners[type]=listeners[type]||[]).push(fn);},
  removeEventListener(type,fn){if(!listeners[type])return;listeners[type]=listeners[type].filter(f=>f!==fn);},
  click(){(listeners.click||[]).slice().forEach(fn=>fn());},
};}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

function bootFixture(){
  const toastEl=makeToastEl();
  global.document={readyState:'complete',addEventListener(){},querySelector(sel){return sel==='#toast'?toastEl:null;}};
  global.window=global;
  global.localStorage=makeLocalStorage();
  let reloaded=0;
  global.location={reload:()=>{reloaded++;}};
  const toasts=[];
  // Real app.js shared behaviour: M.toast() shows the banner and (re)arms its OWN generic 2200ms hide timer
  // on M._toast -- armReloadTap() must override that same timer, not run alongside a second, independent one.
  const M=global.MSOS4={BUILD:'v4-current-fixture-build',_toast:null,toast:msg=>{toasts.push(msg);toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(M._toast);M._toast=setTimeout(()=>toastEl.classList.remove('show'),2200);}};
  Object.defineProperty(global,'navigator',{value:{},configurable:true});
  delete require.cache[require.resolve(pwaPath)];
  require(pwaPath);
  return{M:global.MSOS4,toastEl,toasts,getReloadCount:()=>reloaded};
}

async function run(){
  const{M,toastEl,getReloadCount}=bootFixture();
  const P=M.pwaUpdate;

  assert.ok(P.RELOAD_TAP_HOLD_MS>=10000,
    'the production reload-tap hold must be a realistic window a coach can actually notice and react to (at least 10s), not the old ~2.2s one Andy could not catch in time');

  // Drop the hold for test speed -- identical code path as production, same pattern already used elsewhere
  // in this codebase (e.g. swimmer-invite-bn.js's GENERATE_TIMEOUT_MS) for timeout-shaped tests.
  P.RELOAD_TAP_HOLD_MS=120;
  global.fetch=()=>Promise.resolve({ok:true,text:async()=>'McLay Swimming OS Version 4 · v4-newer-fixture-build'});
  await P.check();
  assert.equal(toastEl.classList.show,true,'the update toast must be showing immediately after a genuine update is detected');

  // Well within the (shortened) hold, but already PAST the old hardcoded 2200ms's proportionally-equivalent
  // "too soon" window: the banner must still be visibly up and a tap must still reload -- the whole point of
  // this fix, proven behaviourally rather than by reading the source.
  await wait(80);
  assert.equal(toastEl.classList.show,true,'the banner must still be visibly showing while still inside its held-open window');
  toastEl.click();
  assert.equal(getReloadCount(),1,'a tap on the still-held-open banner must reload exactly once');

  // Once the hold genuinely elapses, the banner must correctly stop responding and hide again -- this is a
  // longer window, not an unlimited or leaking one. Re-arm via a second notify() on a different remote build
  // (the dedupe gate would otherwise swallow a repeat notice for the same build) with an even shorter hold.
  P.RELOAD_TAP_HOLD_MS=60;
  P.notify('v4-yet-another-fixture-build');
  assert.equal(toastEl.classList.show,true,'a fresh notify() must show the banner again');
  await wait(150);
  assert.equal(toastEl.classList.show,false,'once the hold genuinely elapses the banner must hide again, not stay open forever');
  const reloadsBeforeLateTap=getReloadCount();
  toastEl.click();
  assert.equal(getReloadCount(),reloadsBeforeLateTap,'a tap AFTER the hold has elapsed must no longer trigger a reload -- the listener must have been torn down');

  console.log('PWA_UPDATE_RELOAD_TAP_WINDOW_PASS');
}

async function runFailBefore(){
  // Fail-before: revert to the exact old hardcoded 2200ms armReloadTap (no P.RELOAD_TAP_HOLD_MS at all) and
  // reproduce Andy's exact real-world experience: waiting a bit past that old 2.2s window (a completely
  // realistic "I noticed a small banner and went to tap it" reaction gap), the tap no longer reloads.
  const fixedLine=`  function armReloadTap(){try{const el=document.querySelector('#toast');if(!el)return;const hold=P.RELOAD_TAP_HOLD_MS;clearTimeout(M._toast);M._toast=setTimeout(()=>el.classList.remove('show'),hold);el.style.cursor='pointer';el.title='Tap to reload now';const cleanup=()=>{el.removeEventListener('click',onClick);el.style.cursor='';el.title='';};const onClick=()=>{cleanup();P.apply();};el.addEventListener('click',onClick);setTimeout(cleanup,hold);}catch{}}`;
  const buggyLine=`  function armReloadTap(){try{const el=document.querySelector('#toast');if(!el)return;el.style.cursor='pointer';el.title='Tap to reload now';const cleanup=()=>{el.removeEventListener('click',onClick);el.style.cursor='';el.title='';};const onClick=()=>{cleanup();P.apply();};el.addEventListener('click',onClick);setTimeout(cleanup,2200);}catch{}}`;
  assert.ok(realSrc.includes(fixedLine),'test setup error: could not locate the fixed armReloadTap -- its wording changed in a way this test does not expect');
  const buggySrc=realSrc.replace(fixedLine,buggyLine).replace('  P.RELOAD_TAP_HOLD_MS=15000;\n','');
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=pwaPath.replace(/\.js$/,'.tapwindowfailbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const toastEl=makeToastEl();
    global.document={readyState:'complete',addEventListener(){},querySelector(sel){return sel==='#toast'?toastEl:null;}};
    global.window=global;global.localStorage=makeLocalStorage();
    let reloaded=0;
    global.location={reload:()=>{reloaded++;}};
    const M=global.MSOS4={BUILD:'v4-current-fixture-build',_toast:null,toast:msg=>{toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(M._toast);M._toast=setTimeout(()=>toastEl.classList.remove('show'),2200);}};
    Object.defineProperty(global,'navigator',{value:{},configurable:true});
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const P=global.MSOS4.pwaUpdate;
    global.fetch=()=>Promise.resolve({ok:true,text:async()=>'McLay Swimming OS Version 4 · v4-newer-fixture-build'});
    await P.check();
    assert.equal(toastEl.classList.show,true,'test setup: the buggy version must still show the toast initially');

    await wait(2260); // a realistic beat past the old hardcoded 2200ms window
    toastEl.click();
    assert.equal(reloaded,0,
      'the buggy pre-fix source must no longer reload on a tap once ~2.2s has passed -- confirms this test would have caught the exact bug Andy hit ("I don\'t know where the reload now button is")');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('PWA_UPDATE_RELOAD_TAP_WINDOW_FAILBEFORE_PASS');
}

(async()=>{
  await run();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',pwaPath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
