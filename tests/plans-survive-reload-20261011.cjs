'use strict';
// Andy, 11 Oct 2026 (Board for Mon 12 Oct AM National showed "TODAY'S BRIEF No plan covers this session yet",
// twice): "the plans not set. I've done a season plan and confirmed the weekly."
// Root cause: on a normal page load the app is already live when storage hydration runs, so only operational
// keys were restored; the season plan, weekly plan, which dataset was active, and the standard timetable were
// dropped on every reload and the old Winter 2026 seed took their place (later saves wrote that back).
// Proves in a real browser across real reloads:
//  A. A committed season + weekly plan, and an edited standard week, survive a reload; the brief comes from
//     the season plan.
//  B. A phone already hit by the bug (active versions lost, seed in place, but the committed datasets still in
//     the registry's own store) gets its last committed plans back on the next load.
//  C. The Board shows one brief banner, not two.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=async()=>{await page.waitForFunction(()=>window.MSOS4?.sessionMethodology?.brief&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.seasonPlanner,{timeout:25000});await page.waitForTimeout(1500);};
  const probe=()=>page.evaluate(()=>{const M=window.MSOS4,s={id:'p',identity:{date:'2026-10-12',dayPart:'AM',squads:['National'],start:'05:30',end:'07:15'},blocks:[]},b=M.sessionMethodology.brief(s);return{src:b.source,season:b.seasonName||'',week:b.weekFocus||'',active:Object.keys(M.state.dataRegistry?.active||{}).sort(),seasons:(M.state.seasonPlans||[]).map(x=>x.name)};});
  try{
    await page.goto(BASE,{waitUntil:'load'});await ready();
    await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;
      const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));}
      M.state.standardTimetableMeta={...(M.state.standardTimetableMeta||{}),editedBy:'test-marker'};M.store.save(M.state);await new Promise(r=>setTimeout(r,1500));});
    const before=await probe();assert.equal(before.src,'season');
    // A
    await page.reload({waitUntil:'load'});await ready();
    const a=await probe();
    assert.deepEqual(a,before,'season and weekly plan survive a reload');
    assert.match(a.season,/Summer 2026\/27/);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.standardTimetableMeta?.editedBy),'test-marker','standard timetable edits survive a reload');
    // B: simulate a phone already hit by the old bug.
    await page.evaluate(async()=>{const M=window.MSOS4;M.state.dataRegistry.active={};M.state.dataRegistry.versions=[];M.state.seasonPlans=[{id:'seed',name:'Winter 2026 · National / Development',start_date:'2026-05-11',end_date:'2026-09-28',squads:['National','Development']}];M.state.weeklyPlans=[];M.store.save(M.state);await new Promise(r=>setTimeout(r,1500));});
    await page.reload({waitUntil:'load'});await ready();
    await page.waitForFunction(()=>(window.MSOS4.dataRegistry.lastRecovered||[]).length>0,{timeout:8000});
    const b=await probe();
    assert.equal(b.src,'season',`the last committed plans come back: ${JSON.stringify(b)}`);assert.match(b.season,/Summer 2026\/27/);
    assert.deepEqual(b.active,['season_plan','weekly_plan']);
    // C: one banner on the Board for a session that day.
    await page.evaluate(()=>{const M=window.MSOS4;const s=M.parser.parse('WARM UP\n600 Reg\nMAIN SET\n6 x 100 Dev 10sR',{date:'2026-10-12',dayPart:'AM',squads:['National']});s.id='banner-test';s.identity={...s.identity,date:'2026-10-12',dayPart:'AM',squads:['National'],start:'05:30',end:'07:15'};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;M.nav.show('board');M.ui.renderBoard();M.ui.renderBoard();});
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#boardView [data-methodology-banner]').length),1,'one brief banner');
    assert.doesNotMatch(await page.textContent('#boardView [data-methodology-banner]'),/No plan covers/);
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('PLANS_SURVIVE_RELOAD_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
