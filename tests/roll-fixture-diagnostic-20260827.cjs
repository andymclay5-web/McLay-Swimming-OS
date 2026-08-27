'use strict';
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SOURCE=`WARM-UP
400 Choice
4 x 50 as 25 Drill / 25 Swim

MAIN SET
2 x 400 Freestyle — 1 Regeneration / 1 Development +20s
8 x 100 Freestyle — 1-4 Overload / 5-8 Threshold +20s
4 x 50 #1 Stroke @ 1:15 — Odd 200 Pace / Even Drill

WARM-DOWN
200 Easy`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  await page.click('#newSessionBtn');
  await page.waitForSelector('#coreRaw');
  await page.fill('#coreRaw',SOURCE);
  await page.waitForFunction(()=>document.querySelector('#coreCreate')?.disabled===false);
  await page.click('#coreCreate');
  await page.waitForFunction(()=>MSOS4.currentSession?.()&&MSOS4.session.total(MSOS4.currentSession())===2600,{timeout:5000});
  const before=await page.evaluate(()=>{const M=MSOS4,s=M.currentSession();return{sid:s?.id,squads:s?.identity?.squads,role:M.access?.role?.(),athletes:M.state.athletes?.length,revision:M.state.settings.storageRevision}});
  console.log('ROLL_DIAG_BEFORE',JSON.stringify(before));
  const injected=await page.evaluate(()=>{
   const M=MSOS4,s=M.currentSession();M.state.athletes=M.state.athletes||[];
   let a=M.state.athletes.find(x=>String(x.full_name||'').toLowerCase()==='charlotte murphy');
   if(!a){a={id:'accept-charlotte',full_name:'Charlotte Murphy',squad:'National',active:true};M.state.athletes.push(a)}
   a.active=true;a.squad='National';
   M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id||x.athlete_id!==a.id);
   M.store.save(M.state);M.ui.renderCurrent();
   return{id:a.id,revision:Number(M.state.settings.storageRevision)||0,inState:M.state.athletes.some(x=>x.id===a.id),roster:M.attendanceRoster?.athletes?.(s,M.state).map(x=>x.full_name),sid:s.id,squads:s.identity?.squads};
  });
  console.log('ROLL_DIAG_INJECTED',JSON.stringify(injected));
  await page.waitForTimeout(150);
  const afterTick=await page.evaluate(id=>{const M=MSOS4,s=M.currentSession();return{sid:s?.id,squads:s?.identity?.squads,role:M.access?.role?.(),inState:M.state.athletes?.some(x=>x.id===id),charlotte:M.state.athletes?.find(x=>x.id===id)||null,roster:M.attendanceRoster?.athletes?.(s,M.state).map(x=>({id:x.id,name:x.full_name,squad:x.squad})),revision:M.state.settings.storageRevision,lastPersistedRevision:M.storageEngine?.lastPersistedRevision}},injected.id);
  console.log('ROLL_DIAG_AFTER_TICK',JSON.stringify(afterTick));
  await page.click('[data-nav="roll"]');
  await page.waitForFunction(()=>MSOS4.state.settings.view==='roll'&&document.querySelector('#rollView')?.classList.contains('active'),{timeout:3000});
  const roll=await page.evaluate(id=>{const M=MSOS4,s=M.currentSession(),el=document.querySelector(`[data-roll="${CSS.escape(id)}:modified"]`);return{sid:s?.id,squads:s?.identity?.squads,role:M.access?.role?.(),inState:M.state.athletes?.some(x=>x.id===id),roster:M.attendanceRoster?.athletes?.(s,M.state).map(x=>({id:x.id,name:x.full_name,squad:x.squad})),button:!!el,rollText:document.querySelector('#rollView')?.innerText?.slice(0,1200)||''};},injected.id);
  console.log('ROLL_DIAG_ROLL',JSON.stringify(roll));
 }finally{await browser.close()}
})().catch(e=>{console.error(e?.stack||e);process.exit(1)});
