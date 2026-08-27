'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

const NORTH=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 NCSC Best Time Ribbon Carnival - 21/08/2026 to 22/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
3 Matthew Callow M13 Aquagym 34.56`;

// Deliberately matches the real South Islands export shape: no M/W field,
// AQGCB club code and a Prelims heat header.
const SISC=`Moana Pool - Site License HY-TEK's MEET MANAGER 8.0 - 4:41 PM 26/08/2026 Page 1
South Island SCM Championships 2026 - 28/08/2026 to 30/08/2026
Meet Program - Friday Morning - warmup from 7.30am
Event 1 Men 12 & Over 200 SC Meter IM
Lane Name Age Team Seed Time
Heat 4 of 5 Prelims Starts at 08:27 AM
1 Konrad Artz 14 ASTCB 2:27.22
4 Matthew Callow 13 AQGCB 2:19.53
8 Matthew Robertson 16 AQGCB 2:27.73`;

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),pageErrors=[],consoleErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.waitForFunction(()=>window.MSOS4?.meetWorkspaceEngine?.build&&window.MSOS4?.meetSiscFormat?.build,{timeout:5000});

  await page.evaluate(()=>{
   const M=MSOS4;
   M.state.athletes=M.state.athletes||[];
   for(const [id,name] of [['sisc-matthew-callow','Matthew Callow'],['sisc-matthew-robertson','Matthew Robertson']]){
    let a=M.state.athletes.find(x=>x.id===id||String(x.full_name||'').toLowerCase()===name.toLowerCase());
    if(!a){a={id,full_name:name,squad:'National',active:true};M.state.athletes.push(a)}
    a.active=true;a.squad='National';
   }
   M.state.meets=[];M.state.meetEntries=[];M.state.meetRaces=[];M.state.meetEvidence=[];
   M.state.meetImports=[];M.state.meetFieldDeck=null;
   M.state.meetProgramBA={sources:[],commentaries:[],meetWorkspaces:{},nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
   M.store.save(M.state);
   if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
  });

  // Load North Canterbury first so the test reproduces the real switch direction.
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',NORTH);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  const northId=await page.evaluate(()=>MSOS4.state.settings.currentMeetId);

  // Create South Islands and load the exact SISC-format source.
  await page.click('[data-mwm-new]');
  await page.waitForSelector('[data-mwm-create]',{timeout:3000});
  await page.fill('[data-mwm-title]','South Island SC Champs');
  await page.fill('[data-mwm-date]','2026-08-28');
  await page.fill('[data-mwm-venue]','Moana pool');
  await page.selectOption('[data-mwm-course]','SCM');
  await page.click('[data-mwm-create]');
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  const southId=await page.evaluate(()=>MSOS4.state.settings.currentMeetId);
  assert.notEqual(southId,northId);

  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',SISC);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});

  // Go North -> South again. This is the real-device path that froze/regressed.
  await page.locator(`[data-mwm-meet="${northId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,northId,{timeout:5000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});

  let topMutations=0;
  await page.evaluate(()=>{
   window.__siscTopMutations=0;
   window.__siscObs?.disconnect?.();
   const h=document.querySelector('#meetView');
   window.__siscObs=new MutationObserver(()=>window.__siscTopMutations++);
   window.__siscObs.observe(h,{childList:true,subtree:false});
  });

  await page.locator(`[data-mwm-meet="${southId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,southId,{timeout:5000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForTimeout(700);
  topMutations=await page.evaluate(()=>{window.__siscObs?.disconnect?.();return window.__siscTopMutations||0});

  const programme=page.locator('[data-meet-program-ba]');
  assert.equal(await programme.count(),1,'SISC must settle to one authoritative programme surface');
  const programmeText=await programme.innerText();
  assert.match(programmeText,/Friday Morning - warmup from 7\.30am/i,'SISC session label must remain visible');
  assert.match(programmeText,/08:27 AM/i,'SISC heat timing must be visible');
  assert.match(programmeText,/Matthew Callow/i,'AquaGym swimmer must be attached to the full programme');
  assert.match(programmeText,/2:19\.53/,'SISC seed must remain visible');

  const legacyVisible=await page.evaluate(()=>{
   const sels=['[data-meet-ops-av]','[data-meet-board-ay]','[data-meet-board-az]','[data-meet-field-deck-au]'];
   return sels.flatMap(s=>[...document.querySelectorAll(s)]).some(n=>!n.hidden&&getComputedStyle(n).display!=='none');
  });
  assert.equal(legacyVisible,false,'old LIVE MEET DECK / race queue must not be the active SISC surface');
  assert.ok(topMutations<20,`SISC switch must settle instead of render-looping; top-level mutations=${topMutations}`);

  const topOrder=await page.evaluate(()=>{
   const h=document.querySelector('#meetView'),switcher=h?.querySelector('[data-meet-workspace-cy]'),program=h?.querySelector('[data-meet-program-ba]');
   return !!switcher&&!!program&&switcher.getBoundingClientRect().top<=program.getBoundingClientRect().top;
  });
  assert.equal(topOrder,true,'meet selector must stay above the programme');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.equal(consoleErrors.length,0,`console errors: ${consoleErrors.join('\n')}`);
  console.log(`MEET_SISC_AUTHORITY_PASS programme=visible timing=08:27 legacyHidden=true topMutations=${topMutations}`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
