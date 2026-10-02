'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const calendar=require(path.join(__dirname,'..','monthly_calendar.json'));
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

    // 26 Sept 2026 (Andy, live, urgent -- night before NZSC champs session 1): "the whole meet tabs
    // gone.... Need to be able to at least load programs to it." engines/navigation.js's MEET_SHELVED flag
    // is now false -- see tests/meet-unshelved-20260926.cjs for that fix and its own fail-before/pass-after.
    // Investigating this block to update it turned up that its "saved Meet state must be normalised to
    // Training Board on boot" assertion was NEVER actually about Meet shelving in the first place: it's
    // engines/storage.js's applyUi() unconditionally forcing state.settings.view back to 'board' on every
    // single boot/hydration, regardless of what view was last saved or whether Meet is shelved at all --
    // a separate, deliberate "always land on Board on cold boot" behaviour. So boot.view/surface/bodyView
    // stay 'board' exactly as before; only meetHidden (which WAS genuinely about shelving) flips to false.
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
    assert.equal(boot.view,'board','a saved Meet state is still normalised to Training Board on cold boot -- engines/storage.js\'s applyUi() always resets to board, independent of Meet shelving');
    assert.equal(boot.surface,'training');
    assert.equal(boot.bodyView,'board');
    assert.equal(boot.meetClass,false);
    assert.equal(boot.meetHidden,false,'Meet bottom-nav entry must be visible now that Meet is unshelved, even though boot still lands on Board');

    // The real phone already has historical sessions, so its picker is enabled. A pristine CI profile
    // may have none. Enable only the test button here so we exercise the same published-calendar owner.
    await page.evaluate(()=>{const p=document.querySelector('#sessionSelect');p.disabled=false;p.onclick=()=>MSOS4.ui.openSessionCalendar()});

    // 2 Oct 2026: this test went stale twice already (7/8/14 Sept, then 26/28/29/30 Sept) from hardcoding
    // both the expected month-label string and a fixed list of "upcoming" dates -- a treadmill the test's
    // own prior comments predicted. Fixed properly this time: derive the expected month label from the
    // SAME Date computation engines/navigation.js's openSessionCalendar uses (so it can never drift out of
    // sync with the real code), and read monthly_calendar.json directly (the same file sw.js precaches and
    // the app reads) to find whatever dates are actually published from today onward, instead of assuming
    // specific ones. If the published calendar has genuinely run dry, this now fails with a clear, honest
    // message naming the data's real coverage_end -- a true finding about live data, not a test bug.
    const expectedMonth=await page.evaluate(()=>new Date().toLocaleDateString('en-NZ',{month:'long',year:'numeric'}));
    const today=await page.evaluate(()=>new Date().toISOString().slice(0,10));
    await page.click('#sessionSelect');
    await page.waitForSelector('[data-training-calendar-month]',{timeout:5000});
    const month=await page.locator('[data-training-calendar-month]').innerText();
    assert.equal(month,expectedMonth,`Training calendar must open on the current NZ month: got ${month}, expected ${expectedMonth}`);

    const upcoming=(calendar.dates||[])
      .filter(x=>x.date>=today&&x.status!=='off'&&(x.sessions||[]).length>0)
      .sort((a,b)=>a.date<b.date?-1:1);
    assert.ok(upcoming.length>0,`no published calendar entries on/after ${today} -- monthly_calendar.json's coverage_end is ${calendar.coverage_end}; the published training calendar needs extending past this point`);

    for(const entry of upcoming.slice(0,4)){
      const cell=page.locator(`[data-training-calendar-date="${entry.date}"]`);
      assert.equal(await cell.count(),1,`published calendar must render ${entry.date}`);
      assert.ok(await cell.locator('[data-cal-date]').count()>0,`${entry.date} must expose published AM/PM Training slots even before a canonical workout exists`);
    }

    // Exercise the actual click-through on whichever upcoming entry has a genuine multi-squad combined
    // slot (so the check stays meaningful even as which exact date/squads are published changes week to
    // week), building the expected label from the real squads list rather than a hardcoded squad combo.
    const multi=upcoming.map(entry=>({entry,session:(entry.sessions||[]).find(s=>(s.squads||[]).length>=2)})).find(x=>x.session);
    if(multi){
      const {entry,session}=multi;
      await page.click(`[data-training-calendar-date="${entry.date}"] [data-cal-part="${session.day_part}"]`);
      await page.waitForSelector('[data-training-cal-choice]',{timeout:3000});
      const choices=await page.locator('[data-training-cal-choice]').allTextContents();
      const expectedLabel=session.squads.join('+');
      assert.ok(choices.some(x=>x.includes(expectedLabel)),`${entry.date} ${session.day_part} must expose a published slot covering ${expectedLabel}: ${JSON.stringify(choices)}`);
    } else {
      console.log(`TRAINING_START_CALENDAR_NOTE no multi-squad upcoming slot found in ${upcoming.length} published entries -- combined-squad click-through not exercised this run`);
    }
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_START_CALENDAR_PASS boot=${boot.view} month=${month} upcoming=${upcoming.length} meet=unshelved`);
  } finally {await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
