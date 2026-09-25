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
    assert.match(month,/September\s+2026/i,`Training calendar must open on the current NZ month: ${month}`);

    // 25 Sept 2026: these four dates were originally chosen as upcoming when this test was authored (7/8/14
    // Sept), but this sandbox's wall clock keeps advancing between sessions and they are now in the PAST --
    // and engines/navigation.js's own 25 Sept fix (see tests/session-calendar-hide-past-blank-20260925.cjs)
    // deliberately stops showing a published-but-never-created slot for any past date, since a coach tapping
    // a past date should never be dropped into a "create a new session" flow. So a past date here would now
    // correctly render NO [data-cal-date] pill at all, which is a sign this fix is working, not a bug -- but
    // it breaks this test's own "published schedule shows before a workout exists" claim, which is about
    // FUTURE/upcoming dates. Moved to dates just after today (still within the coverage window in
    // monthly_calendar.json) so the claim being tested stays about the future, where it belongs. Like the
    // "must be September" assertion above, this remains wall-clock-sensitive by nature (a real published
    // schedule a coach is browsing) and will need its own dates nudged forward again in future.
    for(const date of ['2026-09-26','2026-09-28','2026-09-29','2026-09-30']){
      const cell=page.locator(`[data-training-calendar-date="${date}"]`);
      assert.equal(await cell.count(),1,`published September calendar must render ${date}`);
      assert.ok(await cell.locator('[data-cal-date]').count()>0,`${date} must expose published AM/PM Training slots even before a canonical workout exists`);
    }

    await page.click('[data-training-calendar-date="2026-09-28"] [data-cal-part="PM"]');
    await page.waitForSelector('[data-training-cal-choice]',{timeout:3000});
    const choices=await page.locator('[data-training-cal-choice]').allTextContents();
    assert.ok(choices.some(x=>/National\+Development/i.test(x)),`Sep 28 PM must expose a published slot covering National+Development: ${JSON.stringify(choices)}`);
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_START_CALENDAR_PASS boot=${boot.view} month=${month} sep7plus=visible meet=shelved`);
  } finally {await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
