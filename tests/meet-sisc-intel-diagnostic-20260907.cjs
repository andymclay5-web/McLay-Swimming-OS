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
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
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
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForTimeout(500);
  const before=await page.evaluate(()=>({
    siscBuild:MSOS4.meetSiscFormat?.build||'',
    programBuild:MSOS4.meetProgramBA?.build||'',
    state:{...MSOS4.state.meetProgramBA},
    deck:(MSOS4.state.meetFieldDeck?.races||[]).map(r=>({event:r.event_number,heat:r.heat,lane:r.lane,name:r.athlete_name,id:r.athlete_id,seed:r.seed_time})),
    parsed:(MSOS4.state.meetProgramBA?.sources||[]).flatMap(src=>(src.parsed?.heats||[]).flatMap(h=>(h.rows||[]).map(r=>({event:h.event_number,heat:h.heat,lane:r.lane,name:r.name,club:r.club,aq:r.is_aquagym,source:src.source_id})))),
    pills:[...document.querySelectorAll('[data-ba-athlete]')].map(x=>({id:x.dataset.baAthlete,text:x.textContent})),
    rows:[...document.querySelectorAll('[data-ba-row]')].map(x=>({key:x.dataset.baRow,text:x.textContent,expanded:x.classList.contains('expanded')}))
  }));
  console.log('BEFORE_CLICK '+JSON.stringify(before));
  const exact=page.locator('[data-ba-athlete="sisc-matthew-callow"]');
  console.log('EXACT_PILL_COUNT '+await exact.count());
  const target=(await exact.count())?exact:page.locator('[data-ba-athlete]').filter({hasText:'Matthew'}).first();
  console.log('CLICKING '+JSON.stringify({id:await target.getAttribute('data-ba-athlete'),text:await target.innerText()}));
  await target.click();
  await page.waitForTimeout(750);
  const after=await page.evaluate(()=>({
    state:{...MSOS4.state.meetProgramBA},
    meetOps:{...MSOS4.state.meetOps},
    intelCount:document.querySelectorAll('.ba-intel').length,
    intel:[...document.querySelectorAll('.ba-intel')].map(x=>x.textContent),
    pills:[...document.querySelectorAll('[data-ba-athlete]')].map(x=>({id:x.dataset.baAthlete,text:x.textContent,active:x.classList.contains('active')})),
    rows:[...document.querySelectorAll('[data-ba-row]')].map(x=>({key:x.dataset.baRow,text:x.textContent,expanded:x.classList.contains('expanded'),hasIntel:!!x.querySelector('.ba-intel')}))
  }));
  console.log('AFTER_CLICK '+JSON.stringify(after));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
