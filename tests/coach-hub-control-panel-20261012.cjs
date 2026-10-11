'use strict';
// Andy, 12 Oct 2026 (voice): Coach Hub is the control panel -- "where you go to retrieve, to find, to input" --
// "buttons for each action ... and the information behind that button, rather than being all sprawled down that
// screen"; Input data "real clear where and how you enter the data", flexible ("John 454.2, da-di-da"), photo or
// typed, date defaults to today; T400s and race results drive the app, other test sets are a tracked log; a time
// said in a poolside note ("William T400 4:24.2, new PB") is offered to save with a PB check; Reports is its own
// screen of report buttons; Swimmers shows who has the app; assistant coaches get a smaller Hub.
// Proves in a real phone-sized browser (no cloud: the swimmer-access list is stubbed).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.inputData?.render&&window.MSOS4?.hubPanels?.renderReports&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(800);
    await page.evaluate(()=>{const M=window.MSOS4;const roster=[['william','William Callow','National'],['charlotte','Charlotte Murphy','National'],['mkofoed','Matthew Kofoed','National'],['mrob','Matthew Robertson','National'],['elsie','Elsie Knowles','Development'],['luke','Luke Thompson','National']];
      M.state.athletes=roster.map(([id,full_name,squad])=>({id,full_name,squad,active:true}));
      M.timing.saveT400('william',270,{id:'s0',identity:{course:'SCM',date:'2026-09-01'}},M.state,'2026-09-01','Freestyle');M.store.save(M.state);});

    // A. Hub home is buttons; every panel opens on its own screen with a way back.
    await page.evaluate(()=>window.MSOS4.nav.show('hub'));await page.waitForSelector('[data-hub-home]');
    const home=await page.evaluate(()=>[...document.querySelectorAll('[data-hub-home] .hub-btn b')].map(b=>b.textContent.trim()));
    for(const want of ['Today','Write session','Input data','Reports & analysis','Swimmers','TV Board','Season plan','Meet','Coach chat','Coaches & devices','Data & references'])assert.ok(home.some(x=>x.startsWith(want)),`hub button ${want}: ${home}`);
    assert.equal(await page.evaluate(()=>!!document.querySelector('#hubView [data-loop-hub-diagnostics]')),false,'no sprawled session page on the home screen');
    await page.tap('[data-hub-panel="today"]');await page.waitForSelector('[data-hub-back]');
    assert.ok(await page.$('#hubView [data-hub-days]'),'Today shows the day list');
    await page.tap('[data-hub-back]');await page.waitForSelector('[data-hub-home]');

    // B. Input data: T400s typed loosely, checked before saving.
    await page.tap('[data-hub-panel="input"]');await page.waitForSelector('[data-id-card="t400"]');
    assert.match(await page.textContent('#hubView'),/AFFECTS TRAINING TARGETS[\s\S]*T400s[\s\S]*Race results[\s\S]*RECORDED AND TRACKED[\s\S]*Other test sets/);
    assert.equal(await page.inputValue('[data-id-card="t400"] [data-id-f="date"]'),await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'})),'date defaults to today');
    await page.fill('[data-id-card="t400"] [data-id-text]','William 4:24.2\nCharlotte Murphy 5:41.2 IM\nMatthew 454.2, Elsie 5:02');
    await page.tap('[data-id-read="t400"]');await page.waitForSelector('[data-id-card="t400"] [data-id-row]');
    const rows=await page.evaluate(()=>[...document.querySelectorAll('[data-id-card="t400"] [data-id-row]')].map(r=>({who:r.querySelector('[data-id-r="athleteId"]').value,time:r.querySelector('[data-id-r="time"]').value,stroke:r.querySelector('[data-id-r="stroke"]').value,ticked:r.querySelector('[data-id-r="include"]').checked,note:r.querySelector('.id-row-note').textContent})));
    assert.equal(rows.length,4,JSON.stringify(rows));
    assert.deepEqual(rows.map(r=>r.who),['william','charlotte','','elsie']);
    assert.equal(rows[2].ticked,false,'a first name shared by two swimmers is never guessed');assert.match(rows[2].note,/2 swimmers match "Matthew"/);
    assert.equal(rows[1].stroke,'IM');assert.match(rows[0].note,/PB · 5\.80s faster than 4:30/);
    await page.tap('[data-id-save="t400"]');await page.waitForTimeout(400);
    const saved=await page.evaluate(()=>(window.MSOS4.state.trainingTestResults||[]).filter(r=>r.source_label==='Input data · MSOS').map(r=>[r.athlete_id,r.result_seconds,r.stroke]));
    assert.deepEqual(saved.map(x=>x[0]).sort(),['charlotte','elsie','william']);
    assert.ok(saved.some(x=>x[0]==='william'&&Math.abs(x[1]-264.2)<0.01));
    assert.match(await page.textContent('[data-id-card="t400"]'),/Saved 3 T400s/);

    // C. Race results: event in the line, saved through the data registry.
    await page.fill('[data-id-card="race"] [data-id-text]','Luke Thompson 200 free 2:03.07');
    await page.tap('[data-id-read="race"]');await page.waitForSelector('[data-id-card="race"] [data-id-row]');
    await page.tap('[data-id-save="race"]');await page.waitForTimeout(800);
    const race=await page.evaluate(()=>(window.MSOS4.state.resultsEventHistory||[]).find(r=>/Luke/.test(r.athlete_name||r.swimmer_name||'')||r.athlete_id==='luke'));
    assert.ok(race,'race result saved');assert.equal(Number(race.distance),200);assert.ok(Math.abs(Number(race.result_seconds)-123.07)<0.01);

    // D. A time in a poolside note is offered with a PB check; nothing saves without a tap.
    const before=await page.evaluate(()=>(window.MSOS4.state.trainingTestResults||[]).length);
    await page.evaluate(()=>window.MSOS4.inputData.offerFromNote({text_content:'William T400 4:20.1 new PB',athlete_ids:[]}));
    await page.waitForSelector('[data-id-offer]');
    assert.match(await page.textContent('[data-id-offer]'),/William Callow[\s\S]*T400 Freestyle[\s\S]*4:20\.1[\s\S]*Fastest T400 on record/);
    assert.equal(await page.evaluate(()=>(window.MSOS4.state.trainingTestResults||[]).length),before,'not saved until tapped');
    await page.tap('[data-id-offer-save="0"]');await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>(window.MSOS4.state.trainingTestResults||[]).length),before+1);
    await page.tap('[data-id-offer] footer [data-id-offer-close]');

    // E. Reports: one screen of report buttons; each shows straight away.
    await page.evaluate(()=>window.MSOS4.coachLoopUI.openHubPanel('reports'));await page.waitForSelector('[data-hp-reports]');
    for(const k of ['session','week','season','tests','times','swimmer']){await page.tap(`[data-hp-report="${k}"]`);await page.waitForSelector(`[data-hp-out="${k}"]`);assert.doesNotMatch(await page.textContent(`[data-hp-out="${k}"]`),/could not be built/,k);}
    await page.tap('[data-hp-report="tests"]');await page.waitForSelector('[data-hp-out="tests"]');
    assert.match(await page.textContent('[data-hp-out="tests"]'),/T400s · these set training targets[\s\S]*William Callow[\s\S]*4:20\.1/);

    // F. Swimmers: who has the app (owner list stubbed -- no cloud here).
    await page.evaluate(()=>{const M=window.MSOS4;M.swimmerInviteBN=M.swimmerInviteBN||{};M.swimmerInviteBN.rpc=async n=>n==='msos_owner_swimmer_access'?[{athlete_id:'mrob',devices:1,last_seen_at:new Date().toISOString(),has_account:false,last_published_at:null,open_invites:0}]:0;M.coachLoopUI.openHubPanel('swimmers');});
    await page.waitForFunction(()=>/Swimmers with the app[\s\S]*Matthew Robertson/.test(document.querySelector('#hubView')?.textContent||''),{timeout:5000});
    assert.match(await page.textContent('#hubView'),/Matthew Robertson[\s\S]*1 QR device[\s\S]*seen today/);

    // G. Assistant coach: a Hub with their buttons only, and only their squads.
    const asst=await page.evaluate(()=>{const M=window.MSOS4;M.state.settings.assistantSquads=['Development'];M.access.setRole('assistant',{assistantId:'kaleb'});M.coachLoopUI.openHubPanel(null);M.nav.show('hub');M.ui.renderCurrent();
      return{view:M.state.settings.view,nav:[...document.querySelectorAll('.bottom-nav button')].map(x=>x.textContent.trim()),buttons:[...document.querySelectorAll('[data-hub-home] .hub-btn b')].map(b=>b.textContent.trim())};});
    assert.equal(asst.view,'hub');assert.ok(asst.nav.some(x=>/Coach Hub/.test(x)));
    for(const no of ['Input data','TV Board','Season plan','Coaches & devices','Data & references'])assert.ok(!asst.buttons.some(x=>x.startsWith(no)),`assistant must not see ${no}: ${asst.buttons}`);
    for(const yes of ['Today','Write session','Reports & analysis','Swimmers','Meet','Coach chat'])assert.ok(asst.buttons.some(x=>x.startsWith(yes)),`assistant sees ${yes}`);
    await page.evaluate(()=>window.MSOS4.coachLoopUI.openHubPanel('swimmers'));await page.waitForTimeout(300);
    const t=await page.textContent('#hubView');assert.match(t,/Elsie Knowles/);assert.doesNotMatch(t,/William Callow|Swimmers with the app/,'only their squads, no app management');
    await page.evaluate(()=>{const M=window.MSOS4;M.access.setRole('owner');M.state.settings.assistantSquads=[];});

    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('COACH_HUB_CONTROL_PANEL_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
