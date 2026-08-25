'use strict';
const assert=require('node:assert/strict');
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
 const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
  await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
  const before=await page.evaluate(()=>({role:MSOS4.access.role(),canCreate:MSOS4.access.can('session.create'),parser:typeof MSOS4.parser?.parse,openNew:typeof MSOS4.actions?.openNewSession,view:MSOS4.state.settings.view}));
  assert.equal(before.role,'owner');assert.equal(before.canCreate,true);assert.equal(before.parser,'function');assert.equal(before.openNew,'function');
  await page.click('#newSessionBtn',{timeout:3000});await page.waitForSelector('#coreRaw',{timeout:3000});await page.fill('#coreRaw',SOURCE);await page.waitForTimeout(250);
  const probe=await page.evaluate(source=>{let direct=null;try{const s=MSOS4.parser.parse(source,{id:'coherent-intake-probe',date:'2026-08-26',dayPart:'AM',title:'Probe',squads:['National'],venue:'AquaGym',course:'SCM'});direct={total:MSOS4.session.total(s),valid:MSOS4.session.validate(s),blocks:s.blocks.map(b=>[b.type,MSOS4.session.blockDistance(b)])}}catch(e){direct={error:e.stack||e.message||String(e)}}return{disabled:document.querySelector('#coreCreate')?.disabled,preview:document.querySelector('#corePreview')?.textContent,status:document.querySelector('#coreStatus')?.textContent,direct,errors:[]}},SOURCE);
  console.log('COHERENT_INTAKE_PROBE',JSON.stringify({before,probe,errors},null,2));
  assert.equal(probe.direct?.total,2600,'direct canonical parser must preserve the 2,600m acceptance session');
  assert.equal(probe.direct?.valid?.ok,true,'direct canonical session must validate');
  assert.equal(probe.disabled,false,`poolside intake did not enable Create: ${probe.preview||probe.status||'no preview'}`);
  await page.click('#coreCreate',{timeout:3000});
  await page.waitForFunction(()=>MSOS4.currentSession?.()&&MSOS4.session.total(MSOS4.currentSession())===2600,{timeout:5000});
  assert.deepEqual(errors.filter(x=>!/service worker/i.test(x)),[]);
  console.log('COHERENT_INTAKE_SMOKE_PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
