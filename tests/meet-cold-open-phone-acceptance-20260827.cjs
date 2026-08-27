'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 8 Mixed 13 & Over 100 SC Meter Freestyle
Heat 2 of 2 Finals Starts at 07:40 PM
2 Rival One M15 North Canterbury 1:02.20
3 Aqua One M15 Aquagym 1:00.44
4 Rival Two M16 Jasi 59.88`;

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{
   const M=MSOS4;M.state.athletes=M.state.athletes||[];
   let a=M.state.athletes.find(x=>x.id==='meet-cold-a1');
   if(!a){a={id:'meet-cold-a1',full_name:'Aqua One',squad:'National',active:true};M.state.athletes.push(a)}
   Object.assign(a,{full_name:'Aqua One',squad:'National',active:true});
   M.state.meetImports=[];M.state.meetFieldDeck=null;
   M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
   if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
  });
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',RAW);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.locator('.ba-row.aqua').first().click();
  await page.waitForSelector('[data-mpo-quick-note]',{timeout:3000});
  const revision=await page.evaluate(()=>{MSOS4.state.settings.view='meet';MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},revision);

  // Exact field path: browser/PWA reopens with Meet already restored. No navigationEngine.go after reload.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.waitForFunction(()=>MSOS4.state?.settings?.view==='meet',{timeout:5000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForFunction(()=>window.MSOS4?.meetProgramColdOpen?.build?.includes('cold-open'),{timeout:3000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-meet-program-ba] .ba-seed').length===3,{timeout:3000});
  assert.equal(await page.locator('[data-meet-board-az]:visible').count(),0,'legacy Guardian Meet deck must stay hidden on direct cold restore');
  assert.equal(await page.locator('[data-meet-ops-av]:visible').count(),0,'legacy meet-ops card must stay hidden on direct cold restore');
  await page.locator('.ba-row.aqua').first().click();
  await page.waitForSelector('[data-mpo-quick-note]',{timeout:3000});
  const text=await page.locator('.ba-row.aqua.expanded .ba-intel').innerText();
  assert.match(text,/Quick note/);
  assert.match(text,/Voice commentary/);
  assert.match(text,/Capture/);
  assert.match(text,/Backup stopwatch/);
  assert.doesNotMatch(text,/Talk through race/);
  assert.deepEqual(errors,[],'no page errors on direct cold-open Meet restore');
  console.log('MEET_COLD_OPEN_PHONE_ACCEPTANCE_PASS direct-restore programme=single seed=visible note=primary voice=primary capture=primary stopwatch=secondary');
 }finally{await browser.close()}
})().catch(err=>{console.error(err?.stack||err);process.exit(1)});
