'use strict';
// Proves engines/attendance-roster.js's addSquad() cannot silently roll back a live edit to the
// canonical session it is committing into.
//
// The real coaching failure: openSquadPicker() captures `session` once, when the coach taps
// "+ Add squad" on the Roll. The modal can stay open for a while (scanning the squad list). If the
// canonical session changes underneath in the meantime -- a live-sync apply from another device
// (engines/live-training-authority.js), or any other edit to the same session -- and the coach then
// taps a squad, the old addSquad() cloned from the STALE captured `session` and committed it via
// Store.putSession, which is an unconditional whole-session overwrite (no merge, no revision check:
// see app.js `Store.putSession=(state,session)=>{state.canonicalSessions[session.id]=U.clone(session);...}`).
// That silently threw away the interim edit -- exactly the "background/other-surface write clobbers
// live coaching state" failure class this pass is meant to eliminate, just triggered from a coach's
// own device instead of a background sync.
//
// Scenario:
//  1. coach is on Session A with an existing live edit already applied (block content X)
//  2. coach opens the squad picker -- this captures a snapshot of Session A at that moment
//  3. while the picker is open, Session A's canonical content changes again (content Y) -- standing
//     in for a live-sync apply from another device, or any other writer touching the same session
//  4. coach taps a squad -- addSquad() runs with the STALE snapshot from step 2
//  5. the squad must be added, AND the interim edit from step 3 must survive untouched
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

// Static pin: addSquad must re-resolve the live canonical session (M.state.canonicalSessions[...])
// immediately before cloning, not just clone whatever `session` object it was called with. Without
// this, a future edit could reintroduce the stale-clone-and-replace bug in a way the dynamic
// assertions below -- which drive addSquad through its real M/U/Store wiring -- would still pass
// only by coincidence of call order, so pin the source shape directly.
{
  const src=fs.readFileSync(path.resolve(__dirname,'..','engines','attendance-roster.js'),'utf8');
  const fnMatch=src.match(/function addSquad\(session,squad\)\{[\s\S]*?\n {2}\}/);
  assert.ok(fnMatch,'could not locate addSquad() in engines/attendance-roster.js');
  const fnSrc=fnMatch[0];
  assert.match(fnSrc,/M\.state\?\.canonicalSessions\?\.\[session\.id\]/,'addSquad() must re-resolve the live canonical session by id before cloning, not trust the (possibly stale) session object it was called with');
  assert.match(fnSrc,/cloneCurrent\?\(live\)|cloneCurrent\(live\)/,'addSquad() must clone the re-resolved live session, not the stale argument');
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.stack||e.message));

  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true,{timeout:15000});

  // 1: coach on Session A, with a live edit already in the canonical record.
  await page.evaluate(()=>{
    const M=window.MSOS4;
    M.state.canonicalSessions['session-a']={
      id:'session-a',
      identity:{date:'2026-09-04',dayPart:'AM',course:'SCM',squads:['National']},
      blocks:[{id:'live-block',title:'MAIN SET',type:'main',items:[{id:'live-item',kind:'set',reps:8,distance:50,stroke:'Freestyle',raw:'LIVE COACHING EDIT — 8x50 Freestyle'}]}],
      changes:[],
      updatedAt:'t0',
    };
    M.state.settings.selectedSessionId='session-a';
    M.store.save(M.state);
  });

  // 2: coach opens the squad picker -- capture the same snapshot openSquadPicker() would close over.
  const staleSessionSnapshot=await page.evaluate(()=>JSON.parse(JSON.stringify(window.MSOS4.state.canonicalSessions['session-a'])));

  // 3: while the picker sits open, Session A's canonical content changes again (interim edit).
  await page.evaluate(()=>{
    const M=window.MSOS4;
    const live=M.state.canonicalSessions['session-a'];
    live.blocks[0].items[0].raw='INTERIM EDIT arrived while squad picker was open';
    live.updatedAt='t1';
    M.store.save(M.state);
  });

  // 4: coach taps a squad -- this is the exact call openSquadPicker()'s click handler makes,
  // using the stale snapshot captured in step 2.
  const result=await page.evaluate(stale=>{
    const M=window.MSOS4;
    const ok=M.attendanceRoster.addSquad(stale,'Development');
    return{ok,session:JSON.parse(JSON.stringify(M.state.canonicalSessions['session-a']))};
  },staleSessionSnapshot);

  console.log('RESULT:',JSON.stringify(result));
  console.log('Page errors:',pageErrors.length?pageErrors:'none');

  await browser.close();

  // 5: squad added AND the interim edit survived -- addSquad only ever layers on top of live truth.
  assert.equal(result.ok,true,'addSquad must succeed');
  assert.ok(result.session.identity.squads.includes('Development'),'squad must be added to the live session');
  assert.equal(result.session.blocks[0].items[0].raw,'INTERIM EDIT arrived while squad picker was open','addSquad must never roll back a live edit that arrived after the squad picker captured its session snapshot');

  console.log('ATTENDANCE_ROSTER_ADD_SQUAD_LIVE_EDIT_PASS squad-added interim-edit-preserved');
})().catch(e=>{console.error('SCRIPT_ERROR:',e);process.exit(1)});
