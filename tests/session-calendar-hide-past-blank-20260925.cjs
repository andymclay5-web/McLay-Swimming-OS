'use strict';
// 25 Sept 2026 (Andy, live): "Needs to be clearer on the session picker with past sessions. I should only see
// past sessions I've actually ran and finished, and remove all the empty sessions. I dont even know if i can
// see past sessions it might just open create a new session on that slot... It's confusing as all scheduled
// sessions show." Fixed in engines/navigation.js's UI.openSessionCalendar (the LIVE calendar wired to the
// "Select Training session" button -- confirmed via `grep -o "navigation\.js" index.html sw.js`, and confirmed
// it wins over app.js's own older UI.openSessionCalendar because navigation.js loads after app.js and
// reassigns the same property) via a new hasSessionEvidence() helper (reusing app.js's own, already-trusted
// M.analysis.summary()) plus two filters applied where byDate/scheduleByDate are first built. See the full
// root-cause comment directly above UI.openSessionCalendar in engines/navigation.js.
//
// This file has two layers, matching this project's established pattern for this exact function (Playwright
// against the real local server, since UI.openSessionCalendar is DOM/fetch-heavy and not usable from a plain
// Node/vm harness):
//   1. A pure logic-level fail-before/pass-after (no browser) that regex-extracts the three lines that ARE
//      the fix straight out of the live source (drift guard -- fails loudly if that shape ever moves) and
//      evals them against fixture data, proving the OLD unconditional shape reproduces the exact reported bug
//      (a blank past session shows, a past-only published slot shows) and the NEW shape fixes both.
//   2. A full end-to-end Playwright check against the real running app, with a synthetic monthly_calendar.json
//      response (via page.route) so the assertions never depend on real seed data or the real published
//      calendar's current content, and with dates computed at run time from the app's own nzToday()/addDays
//      math -- never hardcoded -- so this test does not go stale the way tests/training-start-calendar-live-
//      20260907.cjs's hardcoded dates just did (see that file's 25 Sept comment).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

function runLogicLevelFailBeforePassAfter(){
  const src=fs.readFileSync(path.join(__dirname,'..','engines','navigation.js'),'utf8');

  const evidenceMatch=src.match(/const hasSessionEvidence=session=>\{[\s\S]*?\n  \};/);
  assert.ok(evidenceMatch,'engines/navigation.js must still define hasSessionEvidence in its known shape (source drifted -- update this test\'s extraction regex)');
  const byDateMatch=src.match(/const byDate=\{\};for\(const s of allowed\)\{const d=s\.identity\?\.date;if\(!d\)continue;if\(d<todayStr&&s\.id!==current\?\.id&&!hasSessionEvidence\(s\)\)continue;\(byDate\[d\]=byDate\[d\]\|\|\[\]\)\.push\(s\)\}/);
  assert.ok(byDateMatch,'engines/navigation.js\'s byDate-building line must still contain the past+no-evidence filter (source drifted -- update this test\'s extraction regex)');
  const scheduleByDateMatch=src.match(/const scheduleByDate=\{\};for\(const d of published\.dates\|\|\[\]\)\{if\(d\?\.date&&d\.date>=todayStr\)\(scheduleByDate\[d\.date\]=d\.sessions\|\|\[\]\)\}/);
  assert.ok(scheduleByDateMatch,'engines/navigation.js\'s scheduleByDate-building line must still contain the past-date filter (source drifted -- update this test\'s extraction regex)');

  const buildHasEvidence=summaryLookup=>{
    const M={analysis:{summary:s=>summaryLookup[s.id]||null}};
    return new Function('M','session',`${evidenceMatch[0]}\nreturn hasSessionEvidence(session);`).bind(null,M);
  };
  const buildByDate=(allowed,todayStr,current,hasSessionEvidence)=>new Function('allowed','todayStr','current','hasSessionEvidence',`${byDateMatch[0]}\nreturn byDate;`)(allowed,todayStr,current,hasSessionEvidence);
  const buildScheduleByDate=(published,todayStr)=>new Function('published','todayStr',`${scheduleByDateMatch[0]}\nreturn scheduleByDate;`)(published,todayStr);

  // hasSessionEvidence(): unit coverage of every input shape it must distinguish.
  const blankSummary={finished:false,attendance:{here:0},evidence:{captures:0,timedSets:0,changes:0}};
  const finishedSummary={finished:true,attendance:{here:0},evidence:{captures:0,timedSets:0,changes:0}};
  const attendanceSummary={finished:false,attendance:{here:2},evidence:{captures:0,timedSets:0,changes:0}};
  const captureSummary={finished:false,attendance:{here:0},evidence:{captures:1,timedSets:0,changes:0}};
  const timedSetSummary={finished:false,attendance:{here:0},evidence:{captures:0,timedSets:3,changes:0}};
  const changeSummary={finished:false,attendance:{here:0},evidence:{captures:0,timedSets:0,changes:1}};
  assert.equal(buildHasEvidence({a:blankSummary})({id:'a'}),false,'a session with no finish, attendance, captures, timed sets or changes must NOT count as evidence');
  assert.equal(buildHasEvidence({a:finishedSummary})({id:'a'}),true,'a finished session must count as evidence');
  assert.equal(buildHasEvidence({a:attendanceSummary})({id:'a'}),true,'a session with roll marked present/modified/late must count as evidence');
  assert.equal(buildHasEvidence({a:captureSummary})({id:'a'}),true,'a session with a capture must count as evidence');
  assert.equal(buildHasEvidence({a:timedSetSummary})({id:'a'}),true,'a session with a timed set must count as evidence');
  assert.equal(buildHasEvidence({a:changeSummary})({id:'a'}),true,'a session with an in-session change must count as evidence');
  assert.equal(buildHasEvidence({})({id:'missing'}),false,'a session M.analysis.summary cannot resolve must NOT count as evidence');
  assert.equal(buildHasEvidence({a:blankSummary})({}),false,'a session with no id must NOT count as evidence');

  const todayStr='2026-09-25';
  const allowed=[
    {id:'past-blank',identity:{date:'2026-09-17'}},
    {id:'past-evidenced',identity:{date:'2026-09-19'}},
    {id:'past-blank-but-current',identity:{date:'2026-09-21'}},
    {id:'today-blank',identity:{date:'2026-09-25'}},
    {id:'future-blank',identity:{date:'2026-09-27'}},
  ];
  const hasSessionEvidenceReal=s=>({'past-evidenced':true}[s.id])||false;
  const current={id:'past-blank-but-current'};
  const published=[
    {date:'2026-09-15',sessions:[{day_part:'AM'}]},
    {date:'2026-09-30',sessions:[{day_part:'PM'}]},
  ];

  // NEW (live, extracted) shape: proves the fix.
  const newByDate=buildByDate(allowed,todayStr,current,hasSessionEvidenceReal);
  assert.ok(!newByDate['2026-09-17'],'FIX: a blank past session with no evidence and not currently selected must be dropped from byDate');
  assert.ok(newByDate['2026-09-19']?.length===1,'FIX: an evidenced past session must be kept in byDate');
  assert.ok(newByDate['2026-09-21']?.length===1,'FIX: the currently-selected session must be kept in byDate even if blank and past');
  assert.ok(newByDate['2026-09-25']?.length===1,'FIX: a blank TODAY session must be kept in byDate (today is unaffected)');
  assert.ok(newByDate['2026-09-27']?.length===1,'FIX: a blank FUTURE session must be kept in byDate (future is unaffected)');
  const newScheduleByDate=buildScheduleByDate({dates:published},todayStr);
  assert.ok(!newScheduleByDate['2026-09-15'],'FIX: a published-schedule-only entry for a past date must be dropped from scheduleByDate');
  assert.ok(newScheduleByDate['2026-09-30'],'FIX: a published-schedule-only entry for a future date must be kept in scheduleByDate');

  // OLD (pre-fix, hand-reconstructed per the navigation.js root-cause comment's own description: every
  // canonical session and every published date was included with no date/evidence awareness at all) shape:
  // proves these exact assertions reproduce Andy's reported bug when the fix is absent.
  const oldByDate={};for(const s of allowed){const d=s.identity?.date;if(!d)continue;(oldByDate[d]=oldByDate[d]||[]).push(s)}
  assert.ok(oldByDate['2026-09-17'],'FAIL-BEFORE: pre-fix code shows a blank/never-run past session -- this reproduces "remove all the empty sessions"');
  const oldScheduleByDate={};for(const d of published){if(d?.date)(oldScheduleByDate[d.date]=d.sessions||[])}
  assert.ok(oldScheduleByDate['2026-09-15'],'FAIL-BEFORE: pre-fix code shows a past published-schedule-only slot -- tapping it would run the create-new-session flow, reproducing "it might just open create a new session on that slot"');

  console.log('SESSION_CALENDAR_HIDE_PAST_BLANK_LOGIC_PASS');
}

async function runE2E(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    // Fixed synthetic monthly_calendar.json so this test never depends on real seed/published data drifting --
    // one past-only and one future-only published slot, no matching canonical session for either.
    let calPayload=null;
    await page.route('**/monthly_calendar.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(calPayload)}));

    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});

    const setup=await page.evaluate(()=>{
      const nzToday=()=>{const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`};
      const addDays=(dateStr,n)=>{const [y,m,d]=dateStr.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`};
      const todayStr=nzToday();
      const dates={
        scheduleOnlyPast:addDays(todayStr,-10),
        pastBlank:addDays(todayStr,-8),
        pastEvidenced:addDays(todayStr,-6),
        currentPastBlank:addDays(todayStr,-4),
        todayBlank:todayStr,
        futureBlank:addDays(todayStr,2),
        scheduleOnlyFuture:addDays(todayStr,5),
      };
      const ymOf=d=>{const [y,m]=d.split('-').map(Number);return y*12+(m-1)};
      const startYm=ymOf(todayStr);

      const mk=(id,date,dayPart,extra={})=>({id,identity:{date,dayPart,squads:['National'],venue:'Test Pool',title:'Training'},blocks:[],...extra});
      window.MSOS4.state.canonicalSessions=window.MSOS4.state.canonicalSessions||{};
      const sessions=[
        mk('e2e-past-blank',dates.pastBlank,'AM'),
        mk('e2e-past-evidenced',dates.pastEvidenced,'PM',{finish:{throughBlockId:null,observations:'done'}}),
        mk('e2e-current-past-blank',dates.currentPastBlank,'AM'),
        mk('e2e-today-blank',dates.todayBlank,'PM'),
        mk('e2e-future-blank',dates.futureBlank,'AM'),
      ];
      for(const s of sessions)window.MSOS4.state.canonicalSessions[s.id]=s;
      window.MSOS4.state.settings=window.MSOS4.state.settings||{};
      window.MSOS4.state.settings.selectedSessionId='e2e-current-past-blank';

      window.__MSOS4_TEST_CAL_PAYLOAD__={
        coverage_start:addDays(todayStr,-30),
        coverage_end:addDays(todayStr,30),
        dates:[
          {date:dates.scheduleOnlyPast,sessions:[{day_part:'AM',start_time:'05:30',end_time:'07:00',squads:['National'],venue:'Test Pool'}]},
          {date:dates.scheduleOnlyFuture,sessions:[{day_part:'PM',start_time:'16:00',end_time:'18:00',squads:['National'],venue:'Test Pool'}]},
        ],
      };
      return {dates,startYm};
    });
    calPayload=await page.evaluate(()=>window.__MSOS4_TEST_CAL_PAYLOAD__);

    await page.evaluate(()=>MSOS4.ui.openSessionCalendar());
    await page.waitForSelector('[data-training-calendar-month]',{timeout:5000});

    const {dates,startYm}=setup;
    let shownYm=startYm;
    const gotoDate=async dateStr=>{
      const [y,m]=dateStr.split('-').map(Number),targetYm=y*12+(m-1);
      while(shownYm<targetYm){await page.click('[data-cal-next]');shownYm++}
      while(shownYm>targetYm){await page.click('[data-cal-prev]');shownYm--}
    };
    const pillLocator=async(dateStr,part)=>{await gotoDate(dateStr);return page.locator(`[data-training-calendar-date="${dateStr}"] [data-cal-date="${dateStr}"][data-cal-part="${part}"]`)};

    assert.equal(await (await pillLocator(dates.scheduleOnlyPast,'AM')).count(),0,'a past date with ONLY a published-schedule slot (no real session) must show no pill -- must not be able to tap into create-new-session');
    assert.equal(await (await pillLocator(dates.pastBlank,'AM')).count(),0,'a past date with only a blank/never-run canonical session must show no pill');
    const evidencedPill=await pillLocator(dates.pastEvidenced,'PM');
    assert.equal(await evidencedPill.count(),1,'a past date with a genuinely evidenced (finished) session must still show its pill');
    const currentPill=await pillLocator(dates.currentPastBlank,'AM');
    assert.equal(await currentPill.count(),1,'the currently-selected session must always show its pill, even if blank and in the past');
    assert.equal(await (await pillLocator(dates.todayBlank,'PM')).count(),1,'a blank session on TODAY must still show its pill -- only past dates are filtered');
    assert.equal(await (await pillLocator(dates.futureBlank,'AM')).count(),1,'a blank FUTURE session must still show its pill -- only past dates are filtered');
    const futureSchedulePill=await pillLocator(dates.scheduleOnlyFuture,'PM');
    assert.equal(await futureSchedulePill.count(),1,'a FUTURE published-schedule-only slot must still show its pill -- only past dates are filtered');

    // The evidenced past pill must open straight to the real session -- this is the single most important
    // proof against Andy's report ("I dont even know if i can see past sessions it might just open create a
    // new session on that slot"). Since this date/part has exactly one real session and no competing
    // published slot, openDayPicker's own single-open-entry shortcut fires immediately (kind:'open', see
    // engines/navigation.js's openDayPicker) rather than showing an intermediate picker list, so the proof is
    // the app actually switching to that real session, not a piece of picker-label text.
    // (Re-fetch rather than reuse the `evidencedPill` locator captured above: each later gotoDate() redraws
    // the modal's cells from scratch, so only the currently-displayed month's elements exist in the DOM.)
    await (await pillLocator(dates.pastEvidenced,'PM')).click();
    await page.waitForFunction(()=>!document.querySelector('#modalHost .modal'),{timeout:3000});
    const afterOpen=await page.evaluate(()=>({selected:MSOS4.state.settings.selectedSessionId,view:MSOS4.state.settings.view}));
    assert.equal(afterOpen.selected,'e2e-past-evidenced','tapping the evidenced past session pill must select that real session, not launch a create flow');
    assert.equal(afterOpen.view,'board','tapping the evidenced past session pill must land back on the board, same as opening any other real session');

    // UI.modal() replaces #modalHost wholesale and choosing a session closes it outright, so reopen a fresh
    // calendar for the next check.
    await page.evaluate(()=>MSOS4.ui.openSessionCalendar());
    await page.waitForSelector('[data-training-calendar-month]',{timeout:5000});
    shownYm=startYm;
    await gotoDate(dates.scheduleOnlyFuture);
    await (await pillLocator(dates.scheduleOnlyFuture,'PM')).click();
    await page.waitForSelector('[data-training-cal-choice]',{timeout:3000});
    const choiceText=await page.locator('[data-training-cal-choice]').first().innerText();
    assert.match(choiceText,/Published schedule.*Create session/,`a future published-schedule-only slot's day-picker entry must still offer to create a session: ${choiceText}`);

    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log('SESSION_CALENDAR_HIDE_PAST_BLANK_E2E_PASS');
  } finally {await browser.close()}
}

(async()=>{
  runLogicLevelFailBeforePassAfter();
  await runE2E();
  console.log('SESSION_CALENDAR_HIDE_PAST_BLANK_ALL_PASS');
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
