'use strict';
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
2 Rival One M11 North Canterbury 35.12
3 Aqua One M11 Aquagym 34.56
4 Rival Two W12 Jasi 33.90
Event 2 Mixed 12 & Under 50 SC Meter Backstroke
Heat 1 of 1 Finals Starts at 06:18 PM
1 Rival Three W11 Dragon 41.33
4 Aqua Two W12 Aquagym 39.22
5 Rival Four M12 Wharenui 38.77`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{
   const M=MSOS4;M.state.athletes=M.state.athletes||[];
   for(const [id,name] of [['diag-a1','Aqua One'],['diag-a2','Aqua Two']]){let a=M.state.athletes.find(x=>String(x.full_name||'').toLowerCase()===name.toLowerCase());if(!a){a={id,full_name:name,squad:'National',active:true};M.state.athletes.push(a)}a.active=true}
   M.state.meetImports=[];M.state.meetFieldDeck=null;M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.store.save(M.state);M.navigationEngine?.go?.('meet',{restore:false});
  });
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');await page.fill('[data-mfa-paste]',RAW);await page.click('[data-mfa-process]');await page.waitForSelector('[data-mfa-use]',{timeout:3000});await page.click('[data-mfa-use]');await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.click('[data-ba-event="1"]');await page.click('[data-ba-next]');await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.selectedEventNumber===2,{timeout:3000});
  await page.locator('.ba-row.aqua').first().click();await page.waitForSelector('.ba-intel',{timeout:3000});
  await page.waitForTimeout(750);
  const d=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),rect=n=>n?(()=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})():null,style=n=>n?{display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,position:getComputedStyle(n).position}:null;
   const p=q('[data-meet-program-ba]'),sticky=q('.ba-sticky'),add=q('[data-ba-add-session]'),ops=q('[data-meet-ops-av]'),intel=q('.ba-intel');
   return{programmeCount:document.querySelectorAll('[data-meet-program-ba]').length,stickyCount:document.querySelectorAll('.ba-sticky').length,addCount:document.querySelectorAll('[data-ba-add-session]').length,opsCount:document.querySelectorAll('[data-meet-ops-av]').length,intelCount:document.querySelectorAll('.ba-intel').length,programmeConnected:!!p?.isConnected,stickyConnected:!!sticky?.isConnected,addConnected:!!add?.isConnected,addDisabled:!!add?.disabled,addRect:rect(add),addStyle:style(add),opsRect:rect(ops),opsStyle:style(ops),opsInProgramme:!!ops?.closest('[data-meet-program-ba]'),intelRect:rect(intel),scrollY,programmeHTML:(p?.innerHTML||'').slice(0,800),state:{expandedKey:MSOS4.state.meetProgramBA?.expandedKey,selectedKey:MSOS4.state.meetProgramBA?.selectedKey,opsKey:MSOS4.state.meetOps?.selectedRaceKey,bridge:MSOS4.meetProgramOpsBridge?.build}};
  });
  console.log('MEET_PROGRAM_SELECTION_DIAGNOSTIC',JSON.stringify(d));
  if(!d.addCount)throw new Error('DIAGNOSTIC_ADD_SESSION_MISSING');
  await page.locator('[data-ba-add-session]').click({timeout:3000});
  await page.waitForSelector('[data-ba-session]',{timeout:3000});
  console.log('MEET_PROGRAM_SELECTION_DIAGNOSTIC_CLICK_PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
