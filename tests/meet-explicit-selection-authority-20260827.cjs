'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>window.MSOS4?.meetWorkspaceEngine?.build,{timeout:5000});
  await page.evaluate(()=>{
    const M=MSOS4,north='north-real',south='south-real';
    M.state.meets=[{id:north,title:'2026 NCSC Best Time Ribbon Carnival'},{id:south,title:'SISC Champs'}];M.state.settings.currentMeetId=north;
    M.state.meetFieldDeck={source_id:'north-source',meet_id:north,title:'2026 NCSC Best Time Ribbon Carnival',races:[{event_number:6,event:'50 Butterfly',distance:50,stroke:'Butterfly',heat:4,lane:4,athlete_id:'elsie',athlete_name:'Elsie Knowles'}]};
    M.state.meetProgramBA={sources:[{source_id:'north-source',meet_id:north,raw:'2026 NCSC Best Time Ribbon Carnival - 21/08/2026 to 22/08/2026\nMeet Program - Session 1'}],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'north-source',selectedEventNumber:6,meetWorkspaces:{}};
    M.state.meetOps={races:{northProof:{notes:'north'}},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
    M.state.meetProgramBA.meetWorkspaces[north]={meet_id:north,title:'2026 NCSC Best Time Ribbon Carnival',deck:structuredClone(M.state.meetFieldDeck),program:{sources:structuredClone(M.state.meetProgramBA.sources),commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'north-source',selectedEventNumber:6},ops:structuredClone(M.state.meetOps)};
    M.state.meetProgramBA.meetWorkspaces[south]={meet_id:south,title:'SISC Champs',deck:null,program:{sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0},ops:{races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''}};
    M.store.save(M.state);
    if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent?.()||M.ui.renderMeet?.()}
  });
  await page.waitForSelector('[data-meet-workspace-cy]',{state:'visible',timeout:5000});
  await page.locator('[data-mwm-meet="south-real"]').click();
  await page.waitForFunction(()=>MSOS4.state.settings.currentMeetId==='south-real',{timeout:3000});
  await page.waitForTimeout(250);
  const s=await page.evaluate(()=>({id:MSOS4.state.settings.currentMeetId,deck:MSOS4.state.meetFieldDeck,sources:MSOS4.state.meetProgramBA.sources.length,north:MSOS4.state.meetOps?.races?.northProof}));
  assert.equal(s.id,'south-real','explicit SISC selection must remain authoritative');
  assert.equal(s.deck,null,'SISC must remain intentionally empty before its programme is added');
  assert.equal(s.sources,0,'North programme sources must not leak into SISC');
  assert.equal(s.north,undefined,'North race state must not leak into SISC');
  console.log('MEET_EXPLICIT_SELECTION_AUTHORITY_PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
