'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

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

    await page.evaluate(()=>{
      MSOS4.state.settings.view='meet';
      MSOS4.state.settings.surfaceMode='meet';
      MSOS4.state.settings.selectedSessionId='old-august-selection-live-phone';
      MSOS4.store.save(MSOS4.state);
    });
    const rev=await page.evaluate(()=>Number(MSOS4.state.settings.storageRevision)||0);
    await page.evaluate(async r=>{if(MSOS4.storageEngine?.whenPersisted)await MSOS4.storageEngine.whenPersisted(r)},rev);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.waitForTimeout(100);

    const boot=await page.evaluate(()=>({view:MSOS4.state.settings.view,surface:MSOS4.state.settings.surfaceMode,bodyView:document.body.dataset.msosView,meetClass:document.body.classList.contains('meet-program-ba-active'),meetHidden:document.querySelector('.bottom-nav [data-nav="meet"]')?.hidden??true}));
    assert.equal(boot.view,'board','saved Meet state must be normalised to Training Board on boot');
    assert.equal(boot.surface,'training');
    assert.equal(boot.bodyView,'board');
    assert.equal(boot.meetClass,false);
    assert.equal(boot.meetHidden,true,'Meet bottom-nav entry must remain shelved after header chrome rerenders');

    // The real phone already has historical sessions, so its picker is enabled. A pristine CI profile
    // may have none. Enable only the test button here so we exercise the same published-calendar owner.
    await page.evaluate(()=>{const p=document.querySelector('#sessionSelect');p.disabled=false;p.onclick=()=>MSOS4.ui.openSessionCalendar()});
    await page.click('#sessionSelect');
    await page.waitForSelector('[data-training-calendar-month]',{timeout:5000});
    const month=await page.locator('[data-training-calendar-month]').innerText();
    assert.match(month,/September\s+2026/i,`Training calendar must open on current NZ month, not an old selected session: ${month}`);

    for(const date of ['2026-09-07','2026-09-08','2026-09-14','2026-09-21']){
      const cell=page.locator(`[data-training-calendar-date="${date}"]`);
      assert.equal(await cell.count(),1,`published September calendar must render ${date}`);
      assert.ok(await cell.locator('[data-cal-date]').count()>0,`${date} must expose published AM/PM Training slots even before a canonical workout exists`);
    }

    await page.click('[data-training-calendar-date="2026-09-07"] [data-cal-part="PM"]');
    await page.waitForSelector('[data-training-cal-choice]',{timeout:3000});
    const choices=await page.locator('[data-training-cal-choice]').allTextContents();
    assert.ok(choices.some(x=>/National\+Development/i.test(x)),`Sep 7 PM must expose National+Development published slot: ${JSON.stringify(choices)}`);
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_START_CALENDAR_PASS boot=${boot.view} month=${month} sep7plus=visible meet=shelved`);
  } finally {await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
