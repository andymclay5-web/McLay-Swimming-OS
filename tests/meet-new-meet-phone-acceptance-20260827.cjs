'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

const NORTH=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 NCSC Best Time Ribbon Carnival - 21/08/2026 to 22/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
2 North Rival M11 Nth Canterbury 35.12
3 Aqua One M11 Aquagym 34.56
4 North Rival Two W12 Jasi 33.90`;

const SOUTH1=`Swimming Canterbury West Coast HY-TEK's MEET MANAGER 8.0 - Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 11 Mixed 13 & Over 100 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 09:00 AM
2 South Rival M15 Nth Canterbury 1:05.20
3 Aqua Two W15 Aquagym 1:02.44
4 South Rival Two W14 Jasi 1:01.88`;

const SOUTH2=`Swimming Canterbury West Coast HY-TEK's MEET MANAGER 8.0 - Page 2
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 2
Event 12 Mixed 13 & Over 100 SC Meter Backstroke
Heat 1 of 1 Finals Starts at 05:00 PM
2 South Rival Three M15 Nth Canterbury 1:16.20
3 Aqua One M15 Aquagym 1:13.44
4 South Rival Four W14 Jasi 1:12.88`;

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
  await page.waitForFunction(()=>window.MSOS4?.meetWorkspaceEngine?.build,{timeout:5000});

  await page.evaluate(()=>{
   const M=MSOS4;
   M.state.athletes=M.state.athletes||[];
   for(const [id,name] of [['new-meet-a1','Aqua One'],['new-meet-a2','Aqua Two']]){
    let a=M.state.athletes.find(x=>x.id===id||String(x.full_name||'').toLowerCase()===name.toLowerCase());
    if(!a){a={id,full_name:name,squad:'National',active:true};M.state.athletes.push(a)}
    a.active=true;a.squad='National';
   }
   // Deliberate legacy/demo meet rows. They must not become real Meet tabs.
   M.state.meets=[
    {id:'demo-meet-a',title:'Meet A',createdAt:'2026-08-01T00:00:00Z'},
    {id:'demo-meet-b',title:'Meet B',createdAt:'2026-08-01T00:00:01Z'}
   ];
   M.state.settings.currentMeetId='demo-meet-a';
   M.state.meetEntries=[];M.state.meetRaces=[];M.state.meetEvidence=[];
   M.state.meetImports=[];M.state.meetFieldDeck=null;
   M.state.meetProgramBA={sources:[],commentaries:[],meetWorkspaces:{},nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
   M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
   M.store.save(M.state);
   if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
  });

  // North Canterbury is entered through the real source -> review -> use path.
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',NORTH);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  await page.waitForSelector('[data-meet-workspace-cy]',{timeout:5000});
  await page.waitForFunction(()=>MSOS4.meetWorkspaceEngine?.managedRows?.().length===1,{timeout:5000});

  assert.equal(await page.locator('[data-mwm-meet]').count(),1,'only the real North Canterbury workspace should be shown');
  assert.match(await page.locator('[data-mwm-meet]').first().innerText(),/NCSC Best Time Ribbon Carnival/i);
  assert.equal(await page.getByText('Meet A',{exact:true}).count(),0,'legacy Meet A must not appear as a real meet tab');
  assert.equal(await page.getByText('Meet B',{exact:true}).count(),0,'legacy Meet B must not appear as a real meet tab');
  assert.equal(await page.locator('[data-mwm-new]').count(),1,'New meet must be visible beside the current meet');
  assert.equal(await page.locator('[data-ba-add-session]').count(),1,'Add session remains a separate within-meet action');
  assert.match(await page.locator('.ba-event').innerText(),/North Rival/);
  assert.match(await page.locator('.ba-event').innerText(),/34\.56/);

  const northId=await page.evaluate(()=>MSOS4.state.settings.currentMeetId);
  assert.ok(northId&&northId!=='demo-meet-a','North programme must be adopted into a real meet container');
  await page.evaluate(()=>{
    const M=MSOS4;M.state.meetOps.races.northProof={race_key:'northProof',notes:'north workspace note',status:'draft'};M.store.save(M.state);
  });

  // Create South Islands as a separate meet using the actual phone control.
  await page.click('[data-mwm-new]');
  await page.waitForSelector('[data-mwm-create]',{timeout:3000});
  await page.fill('[data-mwm-title]','2026 South Island Championships');
  await page.fill('[data-mwm-date]','2026-08-28');
  await page.fill('[data-mwm-venue]','Christchurch');
  await page.selectOption('[data-mwm-course]','SCM');
  await page.click('[data-mwm-create]');
  await page.waitForFunction(()=>MSOS4.meetWorkspaceEngine?.managedRows?.().length===2&&/South Island Championships/i.test(MSOS4.meet?.current?.()?.title||''),{timeout:5000});
  await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
  assert.equal(await page.locator('[data-mwm-meet]').count(),2,'North Canterbury and South Islands must both be selectable');
  assert.match(await page.locator('[data-mwm-meet].active').innerText(),/South Island Championships/i);
  assert.equal(await page.locator('[data-meet-program-ba]').count(),0,'a new meet must begin without North Canterbury programme leakage');
  const blankSouth=await page.evaluate(()=>({deck:MSOS4.state.meetFieldDeck,sources:MSOS4.state.meetProgramBA?.sources?.length||0,north:MSOS4.state.meetOps?.races?.northProof}));
  assert.equal(blankSouth.deck,null);
  assert.equal(blankSouth.sources,0);
  assert.equal(blankSouth.north,undefined,'North Meet ops must not leak into South Islands');

  // Add South Session 1, then prove Add session still means another session in South Islands.
  await page.click('[data-mfa-paste-btn]');
  await page.fill('[data-mfa-paste]',SOUTH1);
  await page.click('[data-mfa-process]');
  await page.waitForSelector('[data-mfa-use]',{timeout:3000});
  await page.click('[data-mfa-use]');
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  assert.match(await page.locator('.ba-event').innerText(),/South Rival/);
  assert.match(await page.locator('.ba-event').innerText(),/1:02\.44/);
  assert.equal(await page.locator('[data-ba-add-session]').count(),1);

  await page.click('[data-ba-add-session]');
  await page.waitForSelector('[data-ba-session]',{timeout:3000});
  await page.fill('[data-ba-session]',SOUTH2);
  await page.click('[data-ba-add]');
  await page.waitForFunction(()=>MSOS4.state.meetProgramBA?.sources?.length===2&&MSOS4.state.meetProgramBA?.selectedEventNumber===12,{timeout:5000});
  assert.equal(await page.locator('[data-ba-source]').count(),2,'South Islands must hold Session 1 and Session 2 independently of North Canterbury');
  assert.match(await page.locator('.ba-event').innerText(),/South Rival Three/);
  await page.evaluate(()=>{
    const M=MSOS4;M.state.meetOps.races.southProof={race_key:'southProof',notes:'south workspace note',status:'draft'};M.store.save(M.state);
  });

  const southId=await page.evaluate(()=>MSOS4.state.settings.currentMeetId);
  assert.notEqual(southId,northId);

  // Switch to North: its programme and ops must return, South must disappear.
  await page.locator(`[data-mwm-meet="${northId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,northId,{timeout:5000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  assert.match(await page.locator('.ba-event').innerText(),/North Rival/);
  assert.doesNotMatch(await page.locator('.ba-event').innerText(),/South Rival/);
  let isolation=await page.evaluate(()=>({north:MSOS4.state.meetOps?.races?.northProof?.notes,south:MSOS4.state.meetOps?.races?.southProof,sources:MSOS4.state.meetProgramBA?.sources?.length||0}));
  assert.equal(isolation.north,'north workspace note');
  assert.equal(isolation.south,undefined);
  assert.equal(isolation.sources,1);

  // Switch back to South and retain its two sessions and ops.
  await page.locator(`[data-mwm-meet="${southId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,southId,{timeout:5000});
  await page.waitForSelector('[data-meet-program-ba]',{timeout:5000});
  isolation=await page.evaluate(()=>({south:MSOS4.state.meetOps?.races?.southProof?.notes,north:MSOS4.state.meetOps?.races?.northProof,sources:MSOS4.state.meetProgramBA?.sources?.length||0}));
  assert.equal(isolation.south,'south workspace note');
  assert.equal(isolation.north,undefined);
  assert.equal(isolation.sources,2);

  // Persist, cold reload, then prove both meet workspaces remain independently switchable.
  const rev=await page.evaluate(()=>{MSOS4.meetWorkspaceEngine.snapshotCurrent();MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
  await page.evaluate(async r=>{await MSOS4.storageEngine.whenPersisted(r)},rev);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.evaluate(()=>{const M=MSOS4;if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await page.waitForSelector('[data-meet-workspace-cy]',{timeout:5000});
  assert.equal(await page.locator('[data-mwm-meet]').count(),2,'both real meets must survive cold reload');
  assert.equal(await page.getByText('Meet A',{exact:true}).count(),0);
  assert.equal(await page.getByText('Meet B',{exact:true}).count(),0);

  await page.locator(`[data-mwm-meet="${northId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,northId,{timeout:5000});
  assert.match(await page.locator('.ba-event').innerText(),/North Rival/);
  assert.equal(await page.evaluate(()=>MSOS4.state.meetOps?.races?.northProof?.notes),'north workspace note');

  await page.locator(`[data-mwm-meet="${southId}"]`).click();
  await page.waitForFunction(id=>MSOS4.state.settings.currentMeetId===id,southId,{timeout:5000});
  assert.equal(await page.evaluate(()=>MSOS4.state.meetProgramBA?.sources?.length||0),2);
  assert.equal(await page.evaluate(()=>MSOS4.state.meetOps?.races?.southProof?.notes),'south workspace note');

  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join('\n')}`);
  assert.equal(consoleErrors.length,0,`console errors: ${consoleErrors.join('\n')}`);
  console.log('MEET_NEW_MEET_PHONE_PASS meets=2 north=restored southSessions=2 reload=both isolated=true');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
