'use strict';
// Andy, 5 Oct 2026: "I still need to see clear how to enter the season plan ... for next time ... at the
// moment I'm showing all last season's data. But now we need to be able to move on to the planning phase.
// And that needs to be clear and direct and easy to follow."
//
// Proves, in a real phone-sized browser against the real app:
//  1. Between seasons, Coach Hub no longer presents last season's week as current: Season says
//     "Between seasons" with when the last season finished and a "Plan next season" button; This week
//     says no week is planned; Today does not borrow last season's day focus.
//  2. "Plan next season" opens a four-step guided flow (season & meet -> standard week -> phases ->
//     check & create) and nothing is committed before "Create season plan".
//  3. Creating commits through the existing season planner (season row + weekly rows active), and Hub then
//     shows the new season for a session in its weeks, and "starts <date>" for a session before it.
//  4. Leaving through the bottom nav returns Data & References to its normal page.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

// 7 Oct 2026: Coach Hub now opens on today; the selected session's season/week cards live under the
// collapsed Session detail, so open it before reading them.
const cards=page=>page.evaluate(()=>{const d=document.querySelector('#hubView [data-loop-session-detail]');if(d)d.open=true;return[...document.querySelectorAll('#hubView .loop-context-grid article')].map(a=>a.innerText.replace(/\s+/g,' ').trim());});
async function session(page,id,date,squads){await page.evaluate(({id,date,squads})=>{const M=window.MSOS4;const s=M.parser.parse('MAIN SET\n8 x 100 Free Threshold @1:30',{date,dayPart:'PM',squads,course:'SCM'});s.id=id;M.state.canonicalSessions[id]=s;M.state.settings.selectedSessionId=id;M.store.save(M.state);},{id,date,squads});}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.seasonPlanner&&window.MSOS4?.dataAdminUI?.openPlanner,{timeout:15000});
    await page.waitForTimeout(800);
    // A session after the seeded Winter 2026 season ended (28 Sept 2026).
    await session(page,'pn-s1','2026-10-05',['National','Development']);
    await page.tap('[data-nav="hub"]');await page.waitForTimeout(700);
    let c=await cards(page);
    assert.match(c[0],/Between seasons/,`Season card must say Between seasons, got: ${c[0]}`);
    assert.match(c[0],/finished/,'Season card must say when the last season finished');
    assert.ok(await page.$('#hubView [data-msos-plan-season]'),'Hub must offer Plan next season');
    assert.match(c[1],/No week planned for this week/,`This week must not show last season's week, got: ${c[1]}`);
    assert.doesNotMatch(c[2],/Kick \/ Skills|Rainbow Set|Pull \/ Swim/,'Today must not borrow last season\'s day focus');

    const before=await page.evaluate(()=>({s:(window.MSOS4.state.seasonPlans||[]).length,w:(window.MSOS4.state.weeklyPlans||[]).length}));
    await page.tap('#hubView [data-msos-plan-season]');await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'data');
    assert.match(await page.evaluate(()=>document.querySelector('#dataView').innerText),/Plan next season[\s\S]*Season & target meet[\s\S]*Standard week[\s\S]*Phases[\s\S]*Check & create/);
    // Step 1 validation: no meet date -> stays on step 1.
    await page.tap('[data-pn-next="1"]');await page.waitForTimeout(200);
    assert.ok(await page.$('#pnMeetDate'),'missing meet date must keep the coach on step 1');
    await page.fill('#pnName','Summer 2026/27');await page.fill('#pnStart','2026-10-12');await page.fill('#pnMeetName','NZ Age Group Champs');await page.fill('#pnMeetDate','2027-03-15');
    await page.tap('[data-pn-next="1"]');await page.waitForTimeout(300);
    assert.match(await page.evaluate(()=>document.querySelector('#dataView').innerText),/normal week every week repeats/);
    await page.tap('[data-pn-next="2"]');await page.waitForTimeout(300);
    const phases=await page.evaluate(()=>[...document.querySelectorAll('.pn-phase b')].map(x=>x.textContent));
    assert.deepEqual(phases,['Base Skills','Under Water','Dives & Turns','Finish & Breath Control','Taper & Race']);
    await page.tap('[data-pn-next="3"]');await page.waitForTimeout(300);
    const mid=await page.evaluate(()=>({s:(window.MSOS4.state.seasonPlans||[]).length,w:(window.MSOS4.state.weeklyPlans||[]).length}));
    assert.deepEqual(mid,before,'nothing may be committed before Create season plan');
    await page.tap('#pnCreate');await page.waitForTimeout(1500);
    assert.match(await page.evaluate(()=>document.querySelector('#dataView').innerText),/Summer 2026\/27 is set[\s\S]*23 weeks/);
    const after=await page.evaluate(()=>({names:(window.MSOS4.state.seasonPlans||[]).map(x=>x.name),weeks:(window.MSOS4.state.weeklyPlans||[]).filter(w=>/^2026-1[0-2]|^2027/.test(w.week_start||'')).length}));
    assert.ok(after.names.includes('Summer 2026/27'),'the new season row must be active');
    assert.ok(after.weeks>=46,`expected the new weekly rows for both squads, got ${after.weeks}`);

    // Hub inside the new season, and before it starts.
    await session(page,'pn-s2','2026-10-13',['National']);
    await page.tap('[data-pn-exit="hub"]');await page.waitForTimeout(700);
    c=await cards(page);
    assert.match(c[0],/Summer 2026\/27/,`Hub must show the new season for a session in it, got: ${c[0]}`);
    assert.match(c[1],/Base Skills/,`This week must show the new season's week, got: ${c[1]}`);
    await page.evaluate(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='pn-s1';M.store.save(M.state);M.ui.renderCurrent();});await page.waitForTimeout(600);
    c=await cards(page);
    assert.match(c[0],/Between seasons[\s\S]*Summer 2026\/27 starts 12 Oct/,`before the first week Hub must say when it starts, got: ${c[0]}`);

    // 4: bottom nav leaves plan mode.
    await page.tap('#hubView [data-msos-plan-season]');await page.waitForTimeout(400);
    await page.tap('[data-nav="board"]');await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.MSOS4.dataAdminUI.isPlanMode()),false,'leaving via the bottom nav must exit plan mode');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('PLAN_NEXT_SEASON_FLOW_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
