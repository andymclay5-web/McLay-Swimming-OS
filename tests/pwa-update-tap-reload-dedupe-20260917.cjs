'use strict';
// Real coaching failure this guards against (Andy, 17 Sept 2026): "this pops up every time I open the app,
// I've shut it down and started up again heaps and every time" -- the "MSOS ... installed" update toast
// re-appeared on literally every fresh app open while the coach was still on a stale build, indistinguishable
// from the app being stuck in a genuine loop. engines/pwa-update.js's P.check() had no memory of already
// having told the coach about a given available update. This test proves: (1) the SAME remote build only
// ever triggers one toast, not one per boot; (2) a genuinely different remote build still gets its own,
// separate notice; (3) the toast is now tappable and a tap calls the exact same reload P.apply() already
// exposed, so a coach who sees the notice isn't stuck guessing whether "fully close and reopen" actually
// worked; (4) nothing here calls location.reload() on its own -- only a real tap does.
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

function bootFixture(){
  const toastEl=makeToastEl();
  global.document={readyState:'complete',addEventListener(){},querySelector(sel){return sel==='#toast'?toastEl:null;}};
  global.window=global;
  global.localStorage=makeLocalStorage();
  let reloaded=0;
  global.location={reload:()=>{reloaded++;}};
  const toasts=[];
  global.MSOS4={BUILD:'v4-current-fixture-build',toast:msg=>{toasts.push(msg);}};
  // no serviceWorker -- keeps this test focused on P.check()'s own dedupe path
  Object.defineProperty(global,'navigator',{value:{},configurable:true});
  delete require.cache[require.resolve(pwaPath)];
  require(pwaPath);
  return{M:global.MSOS4,toastEl,toasts,getReloadCount:()=>reloaded};
}

async function fetchReturning(txt){return{ok:true,text:async()=>txt};}

async function run(){
  const{M,toastEl,toasts,getReloadCount}=bootFixture();
  const P=M.pwaUpdate;

  // First check: a genuinely newer remote build must notify.
  global.fetch=()=>fetchReturning('McLay Swimming OS Version 4 · v4-newer-fixture-build');
  const ok1=await P.check();
  assert.equal(ok1,false,'P.check() must report stale when the remote build differs');
  assert.equal(toasts.length,1,'a genuinely newer build must produce exactly one toast');
  assert.match(toasts[0],/tap to reload now/i,'the toast must now invite a tap to reload, not just say "reopen when ready"');

  // Second, third, fourth check with the SAME remote build (the exact shape of Andy's report: repeated
  // boots that still see the same available update) must NOT re-toast.
  for(let i=0;i<3;i++)await P.check();
  assert.equal(toasts.length,1,`the SAME remote build must only ever notify once, not once per boot -- got ${toasts.length} toasts after 4 total checks`);

  // A tap on the toast while it's still showing must reload -- the coach-initiated escape hatch.
  toastEl.click();
  assert.equal(getReloadCount(),1,'tapping the toast must call P.apply()/reload exactly once');

  // A DIFFERENT, later remote build must still get its own, separate notice -- dedupe must not
  // permanently silence real future updates.
  global.fetch=()=>fetchReturning('McLay Swimming OS Version 4 · v4-even-newer-fixture-build');
  await P.check();
  assert.equal(toasts.length,2,'a later, genuinely different remote build must still produce a new toast');

  // Nothing in this module may call location.reload() on its own -- only a real tap does.
  assert.ok(getReloadCount()<=1,'no automatic reload may happen outside an explicit toast tap');

  console.log('PWA_UPDATE_TAP_RELOAD_DEDUPE_PASS');
}

async function runFailBefore(){
  // Fail-before: revert to the exact pre-fix P.notify (no dedupe, no tap-to-reload) and confirm the SAME
  // remote build re-toasts on every single check -- the exact bug Andy hit.
  const fixedNotify=`  P.notify=build=>{if(alreadyNotified(build))return false;markNotified(build);M.toast?.(\`MSOS \${String(build||'update').split('-').at(-1)} installed · tap to reload now, or reopen when ready\`);armReloadTap();return true;};`;
  const buggyNotify=`  P.notify=build=>M.toast?.(\`MSOS \${String(build||'update').split('-').at(-1)} installed · reopen when ready to apply\`);`;
  assert.ok(realSrc.includes(fixedNotify),'test setup error: could not locate the fixed P.notify -- its wording changed in a way this test does not expect');
  let buggySrc=realSrc.replace(fixedNotify,buggyNotify);
  assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

  const tmpPath=pwaPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(tmpPath,buggySrc);
  try{
    const toastEl=makeToastEl();
    global.document={readyState:'complete',addEventListener(){},querySelector(sel){return sel==='#toast'?toastEl:null;}};
    global.window=global;global.localStorage=makeLocalStorage();
    global.location={reload:()=>{}};
    const toasts=[];
    global.MSOS4={BUILD:'v4-current-fixture-build',toast:msg=>{toasts.push(msg);}};
    Object.defineProperty(global,'navigator',{value:{},configurable:true});
    delete require.cache[require.resolve(tmpPath)];
    require(tmpPath);
    const M=global.MSOS4,P=M.pwaUpdate;
    global.fetch=()=>fetchReturning('McLay Swimming OS Version 4 · v4-newer-fixture-build');
    await P.check();
    await P.check();
    await P.check();
    assert.equal(toasts.length,3,'the buggy pre-fix source must re-toast on every single check for the same stale build -- confirms this test would have caught Andy\'s exact report');
  }finally{
    fs.unlinkSync(tmpPath);
  }

  console.log('PWA_UPDATE_TAP_RELOAD_DEDUPE_FAILBEFORE_PASS');
}

(async()=>{
  await run();
  await runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',pwaPath],{stdio:'pipe'});
})().catch(err=>{console.error(err);process.exit(1);});
