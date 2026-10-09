'use strict';
// Andy, 6 Oct 2026, screenshot of an empty October session calendar: "The base schedule hasn't changed,
// but should remain default unless modified like the season plans and weekly plans."
//
// Root cause: monthly_calendar.json ended 4 Oct (coverage_end) and app.js / navigation.js only knew
// dated published entries, so every date after it had no sessions to open or create.
//
// Proves, in a real phone-sized browser against the real app:
//  1. The standard timetable is seeded from the last ORDINARY published week (Tue: National AM 05:20,
//     Development+Fitness AM 05:30, PM squads; Sat: National 05:30 + Development/Intermediate 06:00 --
//     not the combined pre-Nationals 26 Sep Saturday; Sunday off).
//  2. Dates after the published calendar get those sessions in M.calendar.slots() and in the session
//     calendar grid; dates the published calendar covers are unchanged (29 Sep stays the Nationals week).
//  3. Add session's picker lists today's standard sessions (was "No published session").
//  4. Editing the timetable (Data & References) changes every future week; it persists in state.
//  5. navigation.js has no calendar fetch of its own (one calendar owner).
//  6. An imported calendar covering a date still wins over the standard timetable.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const nav=fs.readFileSync(path.join(__dirname,'..','engines','navigation.js'),'utf8');
  assert.doesNotMatch(nav,/fetch\(url/,'navigation.js must not fetch its own calendar copy');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.standardTimetable,{timeout:15000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(async()=>{const M=window.MSOS4;await M.calendar.load();const T=M.standardTimetable,rows=T.get();const day=d=>M.calendar.slots(d).map(x=>`${x.dayPart} ${x.start} ${x.squad}`);
      return{rows,tue:day('2026-10-13'),sat:day('2026-10-17'),sun:day('2026-10-18'),nationals:day('2026-09-29'),off:day('2026-10-04'),entry:M.calendar.dateEntry('2026-10-13')};});
    const sat=r.rows.find(x=>x.day==='Saturday'),sun=r.rows.find(x=>x.day==='Sunday');
    assert.deepEqual(sat.sessions.map(s=>`${s.day_part} ${s.start_time} ${s.squads.join('+')}`),['AM 05:30 National','AM 06:00 Development+Intermediate'],'Saturday must come from the last ordinary Saturday, not the combined pre-Nationals one');
    assert.equal(sun.sessions.length,0,'Sunday stays off');
    assert.ok(r.tue.includes('AM 05:20 National')&&r.tue.includes('PM 18:30 Junior'),`Tuesday after the published calendar must have the standard sessions: ${r.tue}`);
    assert.equal(r.sun.length,0);
    assert.equal(r.entry.source,'standard_timetable');
    assert.ok(r.nationals.includes('AM 05:30 Fitness'),'a published (Nationals-week) date keeps its published sessions');
    assert.equal(r.off.length,0,'a published OFF day stays off');

    // Calendar grid shows future standard sessions.
    await page.evaluate(()=>window.MSOS4.ui.openSessionCalendar());await page.waitForTimeout(600);
    const pills=await page.evaluate(()=>document.querySelector('#modalHost').innerText);
    assert.match(pills,/AM[\s\S]*PM/,'the session calendar must show AM/PM pills for standard-timetable dates');
    await page.evaluate(()=>window.MSOS4.actions.closeModal());

    // Add session picker.
    await page.tap('#newSessionBtn');await page.waitForTimeout(700);
    const opts=await page.evaluate(()=>[...document.querySelectorAll('#coreSlot option')].length);
    const today=await page.evaluate(()=>new Date().toLocaleDateString('en-US',{timeZone:'Pacific/Auckland',weekday:'long'}));
    if(today!=='Sunday')assert.ok(opts>0,'Add session must list today\'s standard sessions');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // Edit through Data & References.
    await page.evaluate(()=>window.MSOS4.nav.show('data',{restoreScroll:false}));
    await page.waitForSelector('[data-tt-row]');
    const n=await page.$$eval('[data-tt-row]',x=>x.length);
    await page.tap('#ttAdd');await page.waitForTimeout(200);
    const last=`[data-tt-row="${n}"]`;
    await page.selectOption(`${last} [data-tt="day"]`,'Sunday');await page.selectOption(`${last} [data-tt="day_part"]`,'AM');
    await page.fill(`${last} [data-tt="start_time"]`,'07:00');await page.fill(`${last} [data-tt="end_time"]`,'08:00');await page.fill(`${last} [data-tt="squads"]`,'National');
    await page.tap('#ttSave');await page.waitForTimeout(300);
    const after=await page.evaluate(async()=>{const M=window.MSOS4;await M.calendar.load();return{sun:M.calendar.slots('2026-10-18').map(x=>`${x.dayPart} ${x.start} ${x.squad}`),stored:M.state.standardTimetable.find(x=>x.day==='Sunday').sessions.length,edited:!!M.state.standardTimetableMeta.editedAt};});
    assert.deepEqual(after.sun,['AM 07:00 National'],'an edited timetable must change every future week');
    assert.equal(after.stored,1);assert.equal(after.edited,true);

    // Imported calendar wins where it covers.
    const imp=await page.evaluate(async()=>{const M=window.MSOS4,D=M.dataRegistry;const cal={schema_version:1,status:'published',coverage_start:'2026-10-12',coverage_end:'2026-10-18',dates:[{date:'2026-10-18',status:'off',sessions:[],events:[]},{date:'2026-10-13',status:'training',sessions:[{day_part:'PM',start_time:'17:00',end_time:'18:00',squads:['National'],venue:'Pioneer'}],events:[]}]};
      const pre=D.preview('calendar',D.parseText(JSON.stringify(cal)),{version:'t',effectiveFrom:'2026-10-12',source:'test'});await D.commit(pre);await M.calendar.load();
      return{tue:M.calendar.slots('2026-10-13').map(x=>`${x.dayPart} ${x.start} ${x.squad} ${x.venue}`),sun:M.calendar.slots('2026-10-18').length,next:M.calendar.slots('2026-10-20').length};});
    assert.deepEqual(imp.tue,['PM 17:00 National Pioneer'],`an imported calendar must win on its dates: ${imp.tue}`);
    assert.equal(imp.sun,0,'an imported OFF day stays off');
    assert.ok(imp.next>0,'dates after the imported calendar fall back to the standard timetable');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('STANDARD_TIMETABLE_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
