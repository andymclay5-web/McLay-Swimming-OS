'use strict';
// Andy, 10 Oct 2026, screenshot of Write session from Coach Hub: "should have a plan session option or
// template to write the individual session here. The plan season needs to show where season plan is
// visible."
//
// Proves in a real phone-sized browser:
//  1. The session writer offers "Session template" (the five block headings) and "Last <day> <AM/PM>"
//     (a copy of the most recent earlier session for the same squad, weekday and slot), each filling the box
//     and updating the live brief.
//  2. Once a season plan exists, the brief says when it starts and its button reads "View season plan".
//  3. Opening the planner with a season in place SHOWS the season (blocks, every week) instead of the
//     wizard; "Plan a new season" still opens the four steps.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.sessionMethodology?.lastSameSlot&&window.MSOS4?.seasonPlanner,{timeout:20000});
    await page.waitForTimeout(500);
    // A previous Tuesday PM National session (6 Oct) to copy from.
    await page.evaluate(()=>{const M=window.MSOS4;const t='WARM UP\n400 free\nMAIN SET\n3 x (4 x 50 #1 @100p @1:30\n200 easy)\nWARM DOWN\n200 easy';const s=M.parser.parse(t,{date:'2026-10-06',dayPart:'PM',squads:['National'],course:'SCM'});s.id='prev-tue-pm';s.identity={...s.identity,date:'2026-10-06',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));
    await page.waitForSelector('[data-msos-starters]');
    // Pick the Tue PM National slot.
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForTimeout(300);
    const btns=await page.evaluate(()=>[...document.querySelectorAll('[data-msos-start]')].map(b=>b.textContent));
    assert.deepEqual(btns,['Draft from brief','Session template','Last Tuesday PM (2026-10-06)'],`starters: ${btns}`);
    await page.tap('[data-msos-start="template"]');await page.waitForTimeout(500);
    assert.match(await page.inputValue('#coreRaw'),/^WARM UP[\s\S]*PRE SET[\s\S]*MAIN SET[\s\S]*POST SET[\s\S]*WARM DOWN/);
    page.once('dialog',d=>d.accept());
    await page.tap('[data-msos-start="last"]');await page.waitForTimeout(700);
    const v=await page.inputValue('#coreRaw');
    assert.match(v,/4 x 50 #1 @100p @1:30/,'Last session must fill the box with that session');
    assert.doesNotMatch(v,/TOTAL/);
    assert.match(await page.evaluate(()=>document.querySelector('#modalHost [data-msos-brief]').innerText),/on brief/,'the brief re-checks the copied session');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // 2 + 3: create a season starting next Monday, then check brief + overview.
    await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));}});
    const html=await page.evaluate(()=>window.MSOS4.sessionMethodology.briefHtml({id:'x',identity:{date:'2026-10-10',dayPart:'AM',squads:['National']},blocks:[]}));
    const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}));
    if(today<'2026-10-12')assert.match(html,/Summer 2026\/27<\/b> starts 12 Oct[\s\S]*View season plan/,'before the season starts the brief names it and offers View season plan');
    else assert.match(html,/View season plan|Summer 2026\/27/);
    await page.evaluate(()=>window.MSOS4.dataAdminUI.openPlanner());await page.waitForSelector('[data-season-overview]',{timeout:5000});
    const ov=await page.evaluate(()=>document.querySelector('#dataView').innerText);
    assert.match(ov,/SEASON PLAN[\s\S]*Summer 2026\/27[\s\S]*27 weeks/);
    assert.match(ov,/Base Skills[\s\S]*13 weeks[\s\S]*Under Water[\s\S]*Dives & Turns[\s\S]*Finish & Breath Control[\s\S]*Taper & Race/);
    await page.tap('[data-pn-new]');await page.waitForSelector('#pnName');
    assert.ok(await page.$('[data-pn-view]'),'the wizard links back to the current season plan');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('SESSION_STARTERS_SEASON_OVERVIEW_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
