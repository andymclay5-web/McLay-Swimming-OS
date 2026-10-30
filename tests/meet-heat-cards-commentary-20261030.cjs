'use strict';
// Andy at a meet, Fri 30 Oct 2026: "meet scrolling is too big ... other clubs swimmers more compact, info pops up and
// can be seen with multiple swimmers open ... Timing and typing times aren't options, we're running off a scoreboard.
// Input for feedback data and option to add SR, split etc ... the earbud idea to just speak and have it all transcribed
// is still winner".
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - Page 1
2026 Canterbury Long Course Champs - 30/10/2026 to 01/11/2026
Meet Program - Session 1
Event 1 Boys 13 & Over 100 LC Meter Backstroke
Heat 6 of 8 Finals Starts at 05:40 PM
1 Rival, One M15 North Canterbury 1:03.20
5 Callow, Matthew M14 Aquagym 1:14.22
6 Cave, Thomas M15 Aquagym 1:01.50
7 Rival, Two M16 Jasi 1:02.88`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:15000});await p.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:15000});
  await p.evaluate(()=>{const M=MSOS4;if(M.awayInbox)M.awayInbox.maybePop=()=>{};M.state.athletes=[{id:'tc',full_name:'Thomas Cave',squad:'National',active:true},{id:'mc',full_name:'Matthew Callow',squad:'National',active:true}];
    M.state.meetImports=[];M.state.meetFieldDeck=null;M.state.meetProgramBA={sources:[],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'',selectedEventNumber:0};M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.store.save(M.state);
    if(M.navigationEngine?.go)M.navigationEngine.go('meet',{restore:false});else{M.state.settings.view='meet';M.ui.renderCurrent()}});
  await p.waitForSelector('[data-meet-intake-au]',{timeout:5000});await p.click('[data-mfa-paste-btn]');await p.fill('[data-mfa-paste]',RAW);await p.click('[data-mfa-process]');await p.waitForSelector('[data-mfa-use]',{timeout:3000});await p.click('[data-mfa-use]');
  await p.waitForSelector('[data-meet-program-ba] .ba-row.aqua',{timeout:5000});
  assert.equal(await p.locator('.ba-row.aqua').count(),2,'both of ours are in the heat');
  // other clubs: one thin line each
  const h=await p.evaluate(()=>[...document.querySelectorAll('.ba-row:not(.aqua) .ba-row-main')].map(n=>Math.round(n.getBoundingClientRect().height)));
  assert.ok(h.length===2&&h.every(x=>x<=30),`other clubs on one thin line: ${h}`);
  // two cards open at once
  await p.locator('.ba-row.aqua').nth(0).click();await p.waitForSelector('.ba-intel');await p.locator('.ba-row.aqua').nth(1).locator('.ba-row-main').click();await p.waitForTimeout(200);
  assert.equal(await p.locator('.ba-intel').count(),2,'two swimmers open together');
  const txt=(await p.locator('.ba-intel').first().innerText()).replace(/\s+/g,' ');
  assert.doesNotMatch(txt,/stopwatch|Backup timer/i,'no timing on the race card');assert.match(txt,/What you saw/);assert.match(txt,/Stroke rate/);assert.match(txt,/Splits/);
  // what he saw is saved to that race
  const first=p.locator('.ba-intel').first();
  await first.locator('[data-ba-eye="notes"]').fill('Great start, late breath');await first.locator('[data-ba-eye="stroke_rate_notes"]').fill('44 / 41');await first.locator('[data-ba-eye="coach_splits_text"]').fill('31.2');await p.waitForTimeout(500);
  const saved=await p.evaluate(()=>Object.values(MSOS4.state.meetOps.races).find(x=>x.notes));
  assert.equal(saved.notes,'Great start, late breath');assert.equal(saved.stroke_rate_notes,'44 / 41');assert.equal(saved.coach_splits_text,'31.2');
  // spoken heat commentary goes to the swimmer named
  const split=await p.evaluate(()=>{const P=MSOS4.meetProgramBA,h=P.allHeats()[0],races=h.rows.filter(r=>r.is_aquagym).map(row=>MSOS4.state.meetFieldDeck.races.find(r=>r.lane===row.lane));
    const m=P.splitBySwimmer(races,"Thomas got out well. Breathing too early into the wall. Matthew lost his legs at 75. Good finish though.");return races.map(r=>[r.athlete_name,(m.get(MSOS4.meetOpsEngine.keyFor(r))||[]).join(' ')]);});
  const byName=Object.fromEntries(split.map(([n,t])=>[n.includes('Cave')?'tc':'mc',t]));
  assert.equal(byName.tc,'Thomas got out well. Breathing too early into the wall.');assert.equal(byName.mc,'Matthew lost his legs at 75. Good finish though.');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('MEET_HEAT_CARDS_COMMENTARY_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
