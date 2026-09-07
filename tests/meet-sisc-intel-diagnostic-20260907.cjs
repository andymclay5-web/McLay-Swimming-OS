'use strict';
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SISC=`Moana Pool - Site License HY-TEK's MEET MANAGER 8.0 - 4:41 PM 26/08/2026 Page 1
South Island SCM Championships 2026 - 28/08/2026 to 30/08/2026
Meet Program - Friday Morning - warmup from 7.30am
Event 1 Men 12 & Over 200 SC Meter IM
Lane Name Age Team Seed Time
Heat 4 of 5 Prelims Starts at 08:27 AM
1 Konrad Artz 14 ASTCB 2:27.22
4 Matthew Callow 13 AQGCB 2:19.53
8 Matthew Robertson 16 AQGCB 2:27.73`;
const snap=()=>page.evaluate(()=>{const src=MSOS4.state.meetProgramBA?.sources?.[0];return{build:src?._sisc_format_build||'',rows:(src?.parsed?.heats||[]).flatMap(h=>(h.rows||[]).map(r=>({event:h.event_number,heat:h.heat,lane:r.lane,name:r.name,club:r.club,aq:r.is_aquagym}))),pills:[...document.querySelectorAll('[data-ba-athlete]')].map(x=>({id:x.dataset.baAthlete,text:x.textContent})),domRows:[...document.querySelectorAll('[data-ba-row]')].map(x=>({key:x.dataset.baRow,text:x.textContent}))}});
let page;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page=await context.newPage();
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{
   const M=MSOS4;M.state.athletes=M.state.athletes||[];
   let a=M.state.athletes.find(x=>String(x.full_name||'').toLowerCase()==='matthew callow');
   if(!a){a={id:'sisc-matthew-callow',full_name:'Matthew Callow',squad:'National',active:true};M.state.athletes.push(a)}else{a.active=true;a.squad='National'}
   M.state.meets=[];M.state.meetImports=[];M.state.meetFieldDeck=null;M.state.meetEntries=[];M.state.meetRaces=[];M.state.meetEvidence=[];
   M.state.meetProgramBA={sources:[],commentaries:[],meetWorkspaces:{},nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.store.save(M.state);M.navigationEngine?.go?.('meet',{restore:false});
  });
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');await page.fill('[data-mfa-paste]',SISC);await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});await page.waitForTimeout(500);
  console.log('BEFORE_MANUAL_REPAIR '+JSON.stringify(await snap()));
  const repair=await page.evaluate(()=>({result:MSOS4.meetSiscFormat?.repair?.(),parsed:MSOS4.meetSiscFormat?.parse?.(MSOS4.state.meetProgramBA?.sources?.[0]?.raw||'',MSOS4.state.meetProgramBA?.sources?.[0]?.source_id||'')?.heats?.map(h=>({event:h.event_number,heat:h.heat,rows:h.rows}))}));
  console.log('MANUAL_REPAIR_RESULT '+JSON.stringify(repair));
  console.log('IMMEDIATE_AFTER_REPAIR '+JSON.stringify(await snap()));
  await page.waitForTimeout(250);
  console.log('AFTER_250MS '+JSON.stringify(await snap()));
  MSOS4_REPAIR_MARKER=1;
  const exact=page.locator('[data-ba-athlete="sisc-matthew-callow"]');const target=(await exact.count())?exact:page.locator('[data-ba-athlete]').filter({hasText:'Matthew'}).first();
  await target.click();await page.waitForTimeout(500);
  const after=await page.evaluate(()=>({state:{...MSOS4.state.meetProgramBA},intelCount:document.querySelectorAll('.ba-intel').length,intel:[...document.querySelectorAll('.ba-intel')].map(x=>x.textContent),rows:[...document.querySelectorAll('[data-ba-row]')].map(x=>({key:x.dataset.baRow,expanded:x.classList.contains('expanded'),hasIntel:!!x.querySelector('.ba-intel')}))}));
  console.log('AFTER_CLICK '+JSON.stringify(after));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
