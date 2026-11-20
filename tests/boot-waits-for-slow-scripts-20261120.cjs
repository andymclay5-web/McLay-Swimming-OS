'use strict';
// 20 Nov 2026: Full Guardian (jordan-assistant-role-persistence) failed now and then with
// "TypeError: UI.renderBoard is not a function" at boot. Stored data was ready while board.js was still downloading,
// and the startup gate rendered straight away. On a phone with a slow pool network that is a real boot.
// Proves: with v4-poolside-core.js (the base Board) held back 1.5s, the app boots with no page error and the Board renders once it arrives.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland',serviceWorkers:'block'});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(let run=0;run<3;run++){
    await p.unroute('**/v4-poolside-core.js*').catch(()=>{});
    await p.route('**/v4-poolside-core.js*',async r=>{await new Promise(res=>setTimeout(res,4000));await r.continue();});
    await p.goto(BASE);
    await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&typeof window.MSOS4?.ui?.renderBoard==='function',{timeout:30000});
    await p.waitForFunction(()=>(document.querySelector('#boardView')?.innerText||'').trim().length>0,{timeout:15000});
  }
  assert.deepEqual(errors,[],errors.join('\n'));console.log('BOOT_WAITS_FOR_SLOW_SCRIPTS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
