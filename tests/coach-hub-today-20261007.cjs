'use strict';
// Andy, 7 Oct 2026, on Coach Hub with an old (24 Sep) session selected: "a page of useless info with no
// easy add or edit option ... not easy for a coach to pick up and make sense of ... supposed to say
// between seasons."
//
// Proves, in a real phone-sized browser against the real app:
//  1. Hub opens on TODAY, not the selected session: season status for today ("Between seasons" after
//     Winter 2026) with Plan next season, and today's + the next days' sessions from the timetable.
//  2. Only the coach's own squads are listed by default (squads written in the last 60 days); "Show all
//     squads" lists every timetable slot.
//  3. An unwritten slot has Write session, which opens the writer on THAT date and slot (a future date
//     too -- the writer used to list today's slots only).
//  4. A written slot shows its metres and Open / Edit; Open selects it and goes to the Board; Edit opens
//     the workout editor for it.
//  5. The selected session's full analysis is still there, collapsed under Session detail.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.coachLoopUI?.todayHtml,{timeout:15000});
    await page.waitForTimeout(600);
    const ctx=await page.evaluate(async()=>{const M=window.MSOS4;await M.calendar.load();const today=new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}),add=n=>new Date(Date.parse(`${today}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
      // an old selected session (last season) + a written session on the first day ahead with a National slot
      const mk=(id,date,part,squads,t)=>{const s=M.parser.parse(t,{date,dayPart:part,squads,course:'SCM'});s.id=id;s.identity={...s.identity,date,dayPart:part,squads};M.store.putSession(M.state,s);return s;};
      mk('hub-old','2026-09-24','AM',['National','Development'],'MAIN SET\n8 x 100 free @1:30');
      let target=null;for(let i=1;i<7&&!target;i++){const d=add(i),sl=M.calendar.slots(d).find(x=>x.squad==='National');if(sl)target={date:d,dayPart:sl.dayPart};}
      mk('hub-written',target.date,target.dayPart,['National'],'WARM UP\n400 free\nMAIN SET\n6 x 100 free @1:30');
      M.state.settings.selectedSessionId='hub-old';M.store.save(M.state);return{today,target};});
    await page.tap('[data-nav="hub"]');await page.waitForSelector('[data-hub-today]');await page.waitForTimeout(500);
    const top=await page.evaluate(()=>({season:document.querySelector('[data-hub-today]').innerText,days:document.querySelector('[data-hub-days]').innerText,detailOpen:document.querySelector('[data-loop-session-detail]')?.open,detail:document.querySelector('[data-loop-session-detail] summary')?.innerText}));
    assert.match(top.season,/Between seasons[\s\S]*Winter 2026[\s\S]*finished/,`season card: ${top.season}`);
    assert.ok(await page.$('[data-hub-today] [data-msos-plan-season]'),'Plan next season must be on the Hub');
    assert.match(top.days,/^Today/,'the day list starts with today');
    assert.match(top.days,/1,000m written|1000m written/,`the written session must show its metres: ${top.days}`);
    assert.doesNotMatch(top.days,/\bJunior\b/,'squads the coach does not write for are hidden by default');
    assert.ok(await page.$('[data-hub-team]'),'the owner can reach coach invites / sign-in from the Hub');
    assert.equal(top.detailOpen,false,'an old selected session\'s detail stays collapsed');
    assert.match(top.detail,/24 Sept AM/);

    // 2: show all squads
    await page.tap('[data-hub-squads]');await page.waitForTimeout(300);
    assert.match(await page.evaluate(()=>document.querySelector('[data-hub-days]').innerText),/Junior|Intermediate/,'Show all squads lists every timetable slot');
    await page.tap('[data-hub-squads]');await page.waitForTimeout(300);

    // 3: write for a future slot
    const futureWrite=await page.evaluate(()=>{const b=[...document.querySelectorAll('[data-hub-write]')].find(x=>x.dataset.hubWrite!==new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}));return b?{date:b.dataset.hubWrite,slot:b.dataset.hubSlot}:null;});
    assert.ok(futureWrite,'expected a Write session button for a later day');
    await page.tap(`[data-hub-write="${futureWrite.date}"][data-hub-slot="${futureWrite.slot}"]`);await page.waitForSelector('#coreSlot');await page.waitForTimeout(400);
    const w=await page.evaluate(()=>({val:document.querySelector('#coreSlot').value,truth:document.querySelector('#coreTruth').textContent}));
    assert.equal(w.val,futureWrite.slot,'the writer must preselect the tapped slot');
    assert.ok(w.truth.startsWith(futureWrite.date),`the writer must be on the tapped date (${futureWrite.date}), got: ${w.truth}`);
    await page.tap('[data-core-close]');await page.waitForTimeout(300);

    // 4: open / edit
    await page.tap('[data-hub-edit="hub-written"]');await page.waitForSelector('#sessionEditText',{timeout:5000});
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.selectedSessionId),'hub-written');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
    await page.tap('[data-nav="hub"]');await page.waitForSelector('[data-hub-open="hub-written"]');
    await page.tap('[data-hub-open="hub-written"]');await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'board','Open goes to the Board');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('COACH_HUB_TODAY_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
