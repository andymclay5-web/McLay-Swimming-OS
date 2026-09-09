'use strict';
// Real coaching failure this pins: the "Add session" intake modal (M.actions.openNewSession, v4-poolside-core.js)
// autosaves a draft of whatever the coach has typed to localStorage, keyed only by calendar DATE -- not by
// AM/PM slot. Reopening the modal restored that draft whenever the date matched, regardless of which dayPart it
// was written under. A coach who drafted a morning session, closed the modal, then opened "Add session" again
// that evening for the PM session saw the dropdown briefly default to PM -- then had it (and the authored text)
// silently overwritten back to the morning's slot and text. If the coach then manually corrected the dropdown
// back to PM, the morning's text stayed, producing a session whose identity (date/AM-PM/venue/squads) was
// tonight's but whose authored blocks were this morning's -- a session-identity/content crossover, reported
// live by the coach. Root-caused in architecture/RUNTIME_AUDIT_20260909.md §1.
//
// Fixed in v4-poolside-core.js's openNewSession: the draft is only restored when its own remembered slot still
// exists today AND is the same AM/PM window as right now; a same-dayPart draft (e.g. switching between two PM
// squads) is still legitimately resumable, but a cross-dayPart one is dropped. slot.onchange also now clears
// any authored text when the coach manually switches to a different dayPart mid-session, so a stale draft can
// never survive a dayPart change by either path.
//
// This exercises the real DOM (localStorage timing, <select> default-selection, modal lifecycle) so it runs as
// a Playwright test against the served app, matching the house convention in
// tests/training-session-load-tonight-20260907.cjs. The browser's wall clock is fixed (not real "now") so the
// test is deterministic regardless of when it actually runs -- see page.clock.setFixedTime below.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const DRAFT_KEY='mclay_swimming_os_v4_poolside_draft_e';
// A synthetic far-future date, so seeding MSOS4.calendar.data here can never collide with a real published slot.
const NZ_DATE='2099-03-10';
// Both instants land on NZ calendar date 2099-03-10 (Pacific/Auckland, NZDT +13:00 in March) -- 06:00 (AM) and
// 18:00 (PM) -- verified against the app's own nzToday()/hour formulas before writing this test.
const AM_INSTANT='2099-03-09T17:00:00Z';
const PM_INSTANT='2099-03-10T05:00:00Z';
const MORNING_TEXT='WARM-UP\n4 x 100 Free @ 1:30\nMAIN SET\n8 x 100 Threshold @ 1:30';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    // setFixedTime (not install/pauseAt) fixes Date.now()/new Date() while leaving real timers running, so app
    // boot's own setTimeout-driven hydration/guardian pass proceeds normally.
    await page.clock.setFixedTime(AM_INSTANT);
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});

    // Seed one published AM slot and one PM slot on the synthetic date. MSOS4.calendar.load() caches on first
    // call (returns immediately once C.data is truthy), so setting C.data directly here -- before the first
    // openNewSession() call -- is sufficient for both the morning and evening calls in this test.
    await page.evaluate(({date,draftKey})=>{
      MSOS4.calendar.data={dates:[{date,sessions:[
        {day_part:'AM',start_time:'05:30',end_time:'07:30',squads:['National','Development'],venue:'AquaGym',pool_course:'SCM'},
        {day_part:'PM',start_time:'17:30',end_time:'19:00',squads:['National','Development'],venue:'AquaGym',pool_course:'SCM'}
      ],events:[]}]};
      localStorage.removeItem(draftKey);
    },{date:NZ_DATE,draftKey:DRAFT_KEY});

    // --- Morning: open intake, confirm it defaults to AM, author morning-only text, close without creating ---
    await page.evaluate(()=>MSOS4.actions.openNewSession());
    await page.waitForSelector('#coreSlot',{timeout:3000});
    await page.waitForFunction(()=>document.querySelectorAll('#coreSlot option').length>0,{timeout:5000});
    const morningSlots=await page.locator('#coreSlot option').evaluateAll(opts=>opts.map(o=>({value:o.value,text:o.textContent.trim(),selected:o.selected})));
    const morningSelected=morningSlots.find(x=>x.selected)||morningSlots[0];
    assert.match(morningSelected.text,/^AM\b/i,`06:00 NZ must default the intake to the AM slot: ${JSON.stringify(morningSlots)}`);

    await page.fill('#coreRaw',MORNING_TEXT);
    await page.waitForFunction(draftKey=>{try{return JSON.parse(localStorage.getItem(draftKey)||'null')?.text?.length>0}catch{return false}},DRAFT_KEY,{timeout:3000});
    await page.click('[data-core-close]');
    await page.waitForFunction(()=>!document.querySelector('#coreSlot'),{timeout:3000});

    // --- Same calendar day, evening: reopen intake ---
    await page.clock.setFixedTime(PM_INSTANT);
    await page.evaluate(()=>MSOS4.actions.openNewSession());
    await page.waitForSelector('#coreSlot',{timeout:3000});
    await page.waitForFunction(()=>document.querySelectorAll('#coreSlot option').length>0,{timeout:5000});
    const eveningSlots=await page.locator('#coreSlot option').evaluateAll(opts=>opts.map(o=>({value:o.value,text:o.textContent.trim(),selected:o.selected})));
    const eveningSelected=eveningSlots.find(x=>x.selected)||eveningSlots[0];
    assert.match(eveningSelected.text,/^PM\b/i,`18:00 NZ must default the intake to the PM slot: ${JSON.stringify(eveningSlots)}`);

    const eveningText=await page.inputValue('#coreRaw');
    assert.equal(eveningText,'','reopening the intake in the evening must not silently repopulate the text box with this morning\'s AM draft -- that crossover produces a PM-identified session built from AM-authored blocks, the exact coaching failure reported live (architecture/RUNTIME_AUDIT_20260909.md §1)');
    assert.doesNotMatch(eveningText,/Threshold/,'the evening intake must not contain any fragment of the morning draft text');

    // --- Switching dayPart mid-session (still evening) must also clear any text the coach had already typed ---
    await page.fill('#coreRaw','1 x 200 Easy');
    const morningSlotId=morningSelected.value;
    const hasMorningSlotOption=await page.locator(`#coreSlot option[value="${morningSlotId}"]`).count();
    if(hasMorningSlotOption>0){
      await page.selectOption('#coreSlot',morningSlotId);
      const clearedText=await page.inputValue('#coreRaw');
      assert.equal(clearedText,'','manually switching the intake dropdown to a different dayPart must clear any text already authored under the previous dayPart, so a stale draft can never survive a dayPart change');
    }

    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log('SESSION_INTAKE_DRAFT_CROSSOVER_PASS');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
