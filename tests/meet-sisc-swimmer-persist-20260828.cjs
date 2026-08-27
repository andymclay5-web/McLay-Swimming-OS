'use strict';
const assert=require('node:assert/strict');
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
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
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
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.store.save(M.state);
   M.navigationEngine?.go?.('meet',{restore:false});
  });
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');await page.fill('[data-mfa-paste]',SISC);await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  const matt=page.locator('[data-ba-athlete]').filter({hasText:'Matthew'}).first();await matt.click();
  await page.waitForSelector('.ba-intel',{timeout:3000});
  assert.match(await page.locator('.ba-intel').innerText(),/2:19\.53/,'Matthew seed should be visible after explicit open');
  await page.evaluate(()=>{
    const M=MSOS4,p=M.state.meetProgramBA,src=p.sources[0];
    src.parsed=M.meetProgramBA.parseProgramme(src.raw,src.source_id);
    delete src._sisc_format_build;delete src._sisc_raw_sig;
    p.selectedAthleteId='';p.expandedKey='';p.selectedKey='';
    M.meetProgramBA.render();
  });
  await page.waitForTimeout(6200);
  await page.waitForSelector('.ba-intel',{timeout:3000});
  const text=await page.locator('.ba-intel').innerText();
  assert.match(text,/Matthew Callow/i,'explicit swimmer must remain open after delayed refresh');
  assert.match(text,/Seed\s*2:19\.53/i,'seed time must remain visible after delayed refresh');
  assert.match(await matt.innerText(),/E1/,'swimmer pill must retain programme event instead of dash');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('MEET_SISC_SWIMMER_PERSIST_PASS matthew=expanded seed=2:19.53 delay=6200ms');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
