'use strict';
// 26 Sept 2026 (Andy, live, urgent -- night before NZSC champs session 1): "Just went to load the prog am
// for a session 1 of nzsc champs tomorrow and the whole meet tabs gone.... Need to be able to at least load
// programs to it." engines/navigation.js's MEET_SHELVED flag (Andy's own commit ea8ad17, 7 Sept 2026) hid the
// Meet bottom-nav button entirely and forced the 'meet' view back to 'board'. Fixed by flipping that one flag
// to false -- a navigation-only change, no meet-*.js file was touched -- restoring the tab and the "Add
// programme / entries" intake screen it leads to (Choose file / Paste text -> review -> "Use this programme
// tonight", wired in engines/meet-field-au.js, unaffected by the shelving mechanism this test targets).
//
// This does NOT prove the SISC/HY-TEK programme parser itself handles Andy's real NZSC champs export --
// only that the tab, the intake screen and its buttons are reachable again with no console errors. See the
// chat response alongside this fix for that caveat.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execSync}=require('node:child_process');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const NAV_PATH=path.join(__dirname,'..','engines','navigation.js');

async function checkMeetTab(expectShelved){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    const navInfo=await page.evaluate(()=>{
      const btn=document.querySelector('.bottom-nav [data-nav="meet"]');
      return {exists:!!btn,hidden:btn?btn.hidden:null,shelvedFlag:document.body.dataset.msosMeetShelved||null};
    });
    if(expectShelved){
      // Note: whether the nav button itself ends up hidden here is timing-dependent -- app.js's own
      // UI.configureRoleChrome() unconditionally rebuilds .bottom-nav's innerHTML from navConfig() (which
      // always includes 'meet' for an owner/assistant) with no knowledge of MEET_SHELVED, and depending on
      // render order that rebuild can run AFTER navigation.js's hideShelvedMeet() and silently re-expose an
      // unhidden button -- a real, pre-existing latent race in the shelving mechanism itself, independent of
      // today's fix (it stops mattering once MEET_SHELVED is false, since hideShelvedMeet() then no-ops
      // entirely and the button is simply always shown). The reliable, race-free signal that shelving was
      // active is the view redirect: tapping/showing 'meet' must land back on 'board'.
      assert.equal(navInfo.shelvedFlag,'1','FAIL-BEFORE: body.dataset.msosMeetShelved must be set while shelved');
      await page.evaluate(()=>MSOS4.nav.show('meet'));
      await page.waitForTimeout(300);
      const bodyView=await page.evaluate(()=>document.body.dataset.msosView);
      assert.equal(bodyView,'board','FAIL-BEFORE: with MEET_SHELVED=true, showing "meet" must be redirected back to board (reproducing "the whole meet tabs gone")');
      return {errors};
    }
    assert.equal(navInfo.hidden,false,'FIX: the Meet nav button must be visible again');
    assert.equal(navInfo.shelvedFlag,null,'FIX: body.dataset.msosMeetShelved must no longer be set');
    await page.evaluate(()=>MSOS4.nav.show('meet'));
    await page.waitForTimeout(300);
    const bodyView=await page.evaluate(()=>document.body.dataset.msosView);
    assert.equal(bodyView,'meet','FIX: tapping/showing Meet must actually land on the meet view, not be redirected back to board');
    const intake=await page.evaluate(()=>{
      const h=document.querySelector('#meetView');
      return {
        hasIntakeCard:!!h?.querySelector('[data-meet-intake-au]'),
        hasChooseFile:!!h?.querySelector('[data-mfa-file]'),
        hasPasteBtn:!!h?.querySelector('[data-mfa-paste-btn]'),
        fileInputAccept:h?.querySelector('[data-mfa-file-input]')?.getAttribute('accept')||null,
      };
    });
    assert.ok(intake.hasIntakeCard,'FIX: the "Add programme / entries" intake card must render on the Meet screen');
    assert.ok(intake.hasChooseFile,'FIX: the Choose file button must be present so a programme file can be loaded');
    assert.ok(intake.hasPasteBtn,'FIX: the Paste text button must be present so a programme can be pasted in directly');
    assert.match(intake.fileInputAccept||'',/\.pdf/i,'file input must accept .pdf');
    assert.match(intake.fileInputAccept||'',/text\/plain|\.txt/i,'file input must accept plain text');
    assert.match(intake.fileInputAccept||'',/\.csv/i,'file input must accept CSV');

    // Paste-text mechanism is wired end to end (the actual SISC/HY-TEK parsing quality of Andy's real file is
    // a separate concern this test cannot verify without that file).
    await page.click('[data-mfa-paste-btn]');
    await page.waitForSelector('[data-mfa-paste]',{timeout:3000});
    await page.fill('[data-mfa-paste]','Event 1  Girls 100 LC Metre Freestyle\n1  Smith, Jane 14 National  1:02.34\n');
    await page.click('[data-mfa-process]');
    await page.waitForSelector('[data-mfa-use]',{timeout:3000});
    const reviewVisible=await page.locator('[data-mfa-use]').count();
    assert.equal(reviewVisible,1,'FIX: pasting programme text must reach the review-before-use screen without erroring, whatever the parse result');

    assert.deepEqual(errors,[],`browser errors while using the restored Meet screen: ${errors.join('\n')}`);
    return {errors};
  } finally {await browser.close()}
}

(async()=>{
  // FAIL-BEFORE: temporarily flip the real source file back to the shelved state Andy reported, confirm it
  // reproduces "the whole meet tabs gone", then restore the real (fixed) file before touching the server again.
  const currentSrc=fs.readFileSync(NAV_PATH,'utf8');
  assert.match(currentSrc,/const MEET_SHELVED=false;/,'engines/navigation.js must currently have MEET_SHELVED=false (the fix) -- refusing to run against an unexpected state');
  const shelvedSrc=currentSrc.replace('const MEET_SHELVED=false;','const MEET_SHELVED=true;');
  fs.writeFileSync(NAV_PATH,shelvedSrc);
  try{
    execSync('node --check engines/navigation.js',{cwd:path.join(__dirname,'..')});
    await checkMeetTab(true);
    console.log('MEET_UNSHELVED_FAILBEFORE_PASS');
  } finally {
    fs.writeFileSync(NAV_PATH,currentSrc);
  }
  execSync('node --check engines/navigation.js',{cwd:path.join(__dirname,'..')});

  const {errors}=await checkMeetTab(false);
  console.log('MEET_UNSHELVED_PASS', JSON.stringify({errors}));
  console.log('MEET_UNSHELVED_ALL_PASS');
})().catch(e=>{
  console.error(e.stack||e);process.exit(1);
});
