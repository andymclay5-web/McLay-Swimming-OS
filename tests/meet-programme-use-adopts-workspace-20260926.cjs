'use strict';
// 26 Sept 2026 (Andy, live, urgent -- night before NZSC champs session 1): "the whole meet tabs gone.... Need
// to be able to at least load programs to it." After un-shelving Meet (tests/meet-unshelved-20260926.cjs),
// investigating this report turned up a second, independent, real bug in engines/meet-workspace-cy.js's
// bindIntakeHandoff(): pasting/uploading a real HY-TEK programme, reviewing it and tapping "Use this
// programme tonight" never actually created a usable Meet tab. MSOS4.meetWorkspaceEngine.managedRows() stayed
// empty forever, silently, with no console error -- the exact "I can load a programme but nothing usable ever
// appears" failure Andy would have hit tonight even with the tab itself restored.
//
// Root cause: the handler listened on the CAPTURE phase, then queued a microtask assuming the [data-mfa-use]
// button's own click handler (which sets M.state.meetFieldDeck, in engines/meet-field-au.js) would already
// have run by the time that microtask executed. Confirmed by direct instrumentation that for a real/trusted
// click this is false -- the queued microtask ran with meetFieldDeck still unset. Fixed by listening on the
// BUBBLE phase instead, which the DOM's own event-dispatch order guarantees runs after the target's handler,
// with no timing assumption left to get wrong. A second gap in the same handler (fixed alongside it) was that
// it only refreshed the tab switcher, not the whole Meet screen, so a stale previously-open meet's "LIVE MEET
// DECK" hero kept showing even after a different programme had been correctly adopted underneath.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execSync}=require('node:child_process');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const WS_PATH=path.join(__dirname,'..','engines','meet-workspace-cy.js');

const NORTH=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 NCSC Best Time Ribbon Carnival - 21/08/2026 to 22/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
2 North Rival M11 Nth Canterbury 35.12
3 Aqua One M11 Aquagym 34.56
4 North Rival Two W12 Jasi 33.90`;

async function runProgrammeUseFlow(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.evaluate(()=>{
      const M=MSOS4;
      M.state.athletes=M.state.athletes||[];
      let a=M.state.athletes.find(x=>x.id==='new-meet-a1'||String(x.full_name||'').toLowerCase()==='aqua one');
      if(!a){a={id:'new-meet-a1',full_name:'Aqua One',squad:'National',active:true};M.state.athletes.push(a)}
      a.active=true;a.squad='National';
      // A stale previously-open "demo" meet, exactly like the real acceptance fixture -- proves the fix
      // also refreshes the whole Meet screen, not just the tab bar.
      M.state.meets=[{id:'demo-meet-a',title:'Meet A',createdAt:'2026-08-01T00:00:00Z'}];
      M.state.settings.currentMeetId='demo-meet-a';
      M.state.meetEntries=[];M.state.meetRaces=[];M.state.meetEvidence=[];
      M.state.meetImports=[];M.state.meetFieldDeck=null;
      M.state.meetProgramBA={sources:[],commentaries:[],meetWorkspaces:{},nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};
      M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};
      M.store.save(M.state);
      if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}
    });
    await page.waitForSelector('[data-meet-intake-au]',{timeout:5000});
    await page.click('[data-mfa-paste-btn]');
    await page.fill('[data-mfa-paste]',NORTH);
    await page.click('[data-mfa-process]');
    await page.waitForSelector('[data-mfa-use]',{timeout:3000});
    await page.click('[data-mfa-use]');
    // The real reported symptom is exactly this: nothing ever satisfies this wait, silently, forever.
    await page.waitForFunction(()=>MSOS4.meetWorkspaceEngine?.managedRows?.().length===1,{timeout:6000});
    const state=await page.evaluate(()=>{
      const M=MSOS4;
      return {
        managedRows:M.meetWorkspaceEngine.managedRows(),
        currentMeetId:M.state.settings.currentMeetId,
        heroTitle:document.querySelector('#meetView .meet-hero h1')?.textContent||null,
      };
    });
    assert.equal(state.managedRows.length,1,'FIX: loading a real programme and tapping "Use this programme tonight" must create exactly one managed meet workspace');
    assert.match(state.managedRows[0].title,/NCSC Best Time Ribbon Carnival/i,'the created meet must carry the real programme title, not a generic placeholder');
    assert.notEqual(state.currentMeetId,'demo-meet-a','the newly loaded programme must become the current meet, not leave the stale demo meet selected');
    assert.equal(state.heroTitle,state.managedRows[0].title,'FIX: the Live Meet Deck hero must refresh to the newly-adopted meet, not keep showing a stale previously-open meet');
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    return {errors};
  } finally {await browser.close()}
}

(async()=>{
  // FAIL-BEFORE: reconstruct the exact pre-fix code shape (capture phase + only renderSwitcher(), no
  // M.ui.renderMeet() refresh) and confirm it reproduces the silent-forever-empty symptom, before restoring
  // the real fixed file.
  const currentSrc=fs.readFileSync(WS_PATH,'utf8');
  const fixedBlock=`  function bindIntakeHandoff(){\n    document.addEventListener('click',e=>{\n      if(!e.target?.closest?.('[data-mfa-use]'))return;\n      queueMicrotask(()=>{\n        if(M.state?.settings?.view!=='meet'||!M.state?.meetFieldDeck?.races?.length)return;\n        adoptLoadedProgramme();\n        save();\n        M.ui.renderMeet?.();\n      });\n    },false);\n  }`;
  assert.ok(currentSrc.includes(fixedBlock),'engines/meet-workspace-cy.js\'s bindIntakeHandoff must currently match the fixed shape -- refusing to run against an unexpected state');
  const preFixBlock=`  function bindIntakeHandoff(){\n    document.addEventListener('click',e=>{\n      if(!e.target?.closest?.('[data-mfa-use]'))return;\n      queueMicrotask(()=>{\n        if(M.state?.settings?.view!=='meet'||!M.state?.meetFieldDeck?.races?.length)return;\n        adoptLoadedProgramme();\n        renderSwitcher();\n        save();\n      });\n    },true);\n  }`;
  fs.writeFileSync(WS_PATH,currentSrc.replace(fixedBlock,preFixBlock));
  try{
    execSync('node --check engines/meet-workspace-cy.js',{cwd:path.join(__dirname,'..')});
    let failedAsExpected=false;
    try{
      await runProgrammeUseFlow();
    }catch(e){
      if(/Timeout.*exceeded|managedRows/i.test(String(e.message||e)))failedAsExpected=true;
      else throw e;
    }
    assert.ok(failedAsExpected,'FAIL-BEFORE: the pre-fix capture-phase handler must reproduce the "programme never adopts" bug (a timeout waiting for managedRows().length===1)');
    console.log('MEET_PROGRAMME_USE_FAILBEFORE_PASS');
  } finally {
    fs.writeFileSync(WS_PATH,currentSrc);
  }
  execSync('node --check engines/meet-workspace-cy.js',{cwd:path.join(__dirname,'..')});

  const {errors}=await runProgrammeUseFlow();
  console.log('MEET_PROGRAMME_USE_PASS', JSON.stringify({errors}));
  console.log('MEET_PROGRAMME_USE_ALL_PASS');
})().catch(e=>{
  console.error(e.stack||e);process.exit(1);
});
