'use strict';
// Andy, Sat 14 Nov 2026 19:05: "Nothing seems to happen when I hit race link". The Race links button came with
// swimmer-instant-open-cn.js, but his phone's page was an older copy that doesn't list engines/race-elements*.js, so the
// code behind the tab never loaded and it drew nothing. The tab now loads those files itself and draws.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));const loaded=[];
  // the older page: no race-elements scripts in it
  await p.route(/\/(?:index\.html)?(?:\?.*)?$/,async route=>{if(route.request().resourceType()!=='document')return route.continue();const r=await route.fetch();const html=(await r.text()).replace(/<script src="engines\/race-elements(?:-ui)?\.js[^"]*" defer><\/script>/g,'');return route.fulfill({response:r,body:html});});
  p.on('request',r=>{if(/race-elements/.test(r.url()))loaded.push(r.url());});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(600);
  assert.equal(await p.evaluate(()=>!!window.MSOS4.raceElementsUI),false,'the older page has no race-links code');
  await p.evaluate(()=>{const M=window.MSOS4;M.state.athletes=[{id:'ax',full_name:'Alexandra Hanson',squad:'Development',active:true}];M.state.resultsEventHistory=[{result_id:'r',athlete_id:'ax',result_date:new Date(Date.now()-20*864e5).toISOString().slice(0,10),course:'SCM',distance:50,stroke:'Freestyle',result_time_seconds:36.42,meet_name:'Canterbury'}];M.state.settings.selectedAthleteId='ax';M.store.save(M.state);M.nav.show('athletes');});
  await p.waitForSelector('[data-cn-tab="races"]',{timeout:10000});await p.click('[data-cn-tab="races"]');
  await p.waitForSelector('[data-re-tab]',{timeout:10000});const tab=await p.evaluate(()=>document.querySelector('[data-re-tab]').innerText);
  assert.match(tab,/RACE LINKS · Alexandra Hanson/);assert.match(tab,/50 Free SCM · 36\.42/);assert.equal(loaded.length,2,loaded.join('\n'));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('RACE_LINKS_SELF_LOAD_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
