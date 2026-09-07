'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const WORKOUT=`WARM-UP
4 x 100 Free @ 1:30
4 x 50 Drill / Swim @ 1:00
MAIN SET
6 x 100 Free Threshold @ 1:30
8 x 50 #1 Stroke @ 1:00
WARM-DOWN
200 Easy`;

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.evaluate(()=>MSOS4.navigationEngine.go('board',{push:false,restore:false}));

    await page.click('#newSessionBtn');
    await page.waitForSelector('#newDate',{timeout:3000});
    await page.fill('#newDate','2026-09-07');
    await page.dispatchEvent('#newDate','change');
    await page.waitForFunction(()=>[...document.querySelectorAll('#newSlot option')].some(o=>o.value!=='CUSTOM'),{timeout:5000});

    const slots=await page.locator('#newSlot option').evaluateAll(opts=>opts.map(o=>({value:o.value,text:o.textContent.trim()})));
    const published=slots.filter(x=>x.value!=='CUSTOM');
    assert.ok(published.length>0,`Sep 7 must expose a published Training slot: ${JSON.stringify(slots)}`);
    assert.notEqual(await page.inputValue('#newSlot'),'CUSTOM','published Sep 7 slot should be selected by default');
    const truth=await page.locator('#slotTruth').innerText();
    assert.match(truth,/LOCKED SLOT/i,'published slot identity must be locked to calendar truth');
    assert.match(truth,/2026-09-07/);

    await page.fill('#newSource',WORKOUT);
    await page.waitForFunction(()=>document.querySelector('#newCheck')?.classList.contains('ok'),{timeout:5000});
    const check=await page.locator('#newCheck').innerText();
    assert.match(check,/m/,'canonical preview must show a distance before creation');
    await page.click('[data-create-session]');
    await page.waitForFunction(()=>!document.querySelector('#newDate'),{timeout:3000});

    const created=await page.evaluate(()=>{
      const s=MSOS4.currentSession();
      const cap=document.querySelector('[data-sticky-note]'),sticky=document.querySelector('.sticky-actions');
      const visible=n=>{if(!n)return false;const r=n.getBoundingClientRect(),cs=getComputedStyle(n);return !n.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
      return {id:s?.id||'',date:s?.identity?.date||'',part:s?.identity?.dayPart||'',source:s?.currentSource?.text||s?.source||'',view:document.body.dataset.msosView,surface:document.body.dataset.msosSurface,capture:visible(cap),sticky:visible(sticky),meetClass:document.body.classList.contains('meet-program-ba-active')};
    });
    assert.ok(created.id,'created session must become selected current session');
    assert.equal(created.date,'2026-09-07');
    assert.ok(['AM','PM'].includes(created.part),`published Sep 7 slot must carry a day part: ${created.part}`);
    assert.equal(created.view,'board');
    assert.equal(created.surface,'training');
    assert.equal(created.capture,true,'Capture must be present immediately after loading the session');
    assert.equal(created.sticky,true,'Training action bar must be present immediately after loading the session');
    assert.equal(created.meetClass,false,'Meet chrome must not contaminate newly loaded Training session');

    const sessionId=created.id;
    const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
    await page.evaluate(async r=>{if(MSOS4.storageEngine?.whenPersisted)await MSOS4.storageEngine.whenPersisted(r)},rev);
    await page.waitForTimeout(250);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.waitForFunction(id=>MSOS4.currentSession?.()?.id===id,sessionId,{timeout:5000});

    const restored=await page.evaluate(id=>({selected:MSOS4.state.settings.selectedSessionId,current:MSOS4.currentSession()?.id||'',date:MSOS4.currentSession()?.identity?.date||'',view:document.body.dataset.msosView,capture:(()=>{const n=document.querySelector('[data-sticky-note]');if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return !n.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})(),meetClass:document.body.classList.contains('meet-program-ba-active')}),sessionId);
    assert.deepEqual(restored,{selected:sessionId,current:sessionId,date:'2026-09-07',view:'board',capture:true,meetClass:false});
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_SESSION_LOAD_TONIGHT_PASS date=2026-09-07 slots=${published.length} selected=${published[0].text} reload=restored capture=visible`);
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
