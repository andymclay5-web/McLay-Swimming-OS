'use strict';
// Proves the boot-time evidence auto-refresh (M.cloud.pullEvidence -> M.cloud.applyEvidence,
// wired into M.boot()) can only ENRICH evidence/reference data and can never take over the live
// coaching context. This is the exact failure class flagged in the Sep 2026 product review: a
// background sync must never rewrite the session a coach is looking at, their Roll, an in-flight
// live edit, the current view, or navigation state.
//
// Scenario (matches the coaching failure, not just the helper):
//  1. coach is on Session A
//  2. Roll has been entered (attendance recorded for Session A)
//  3. Session A contains a local/live edit not present in any "cloud" copy
//  4. the mocked cloud exposes sessions/session_blocks/attendance endpoints with DIFFERENT data
//     for Session A (an older copy) plus an entirely different Session B
//  5. the background evidence refresh (the exact call M.boot() makes) completes
//  6. selected session, canonical Session A (including the live edit), Roll/attendance, view and
//     the coach's scroll/detail-context marker are all unchanged -- AND the sessions/session_blocks/
///    attendance/athletes REST endpoints were never even requested (containment at the network
//     boundary, not just "received but ignored")
//  7. new coach evidence (a PB result) DID load, and downstream stroke/target resolution can now
//     see it
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

// Static pin: M.boot() itself must call the narrow evidence-only pull, never the broad admin
// pullShadow/applyShadow (PULL_TABLES includes sessions/attendance/captures/etc.). Without this,
// a future edit could silently rewire boot back to the broad call and the dynamic assertions below
// -- which call pullEvidence/applyEvidence by name -- would not catch it.
{
  const appJs=fs.readFileSync(path.resolve(__dirname,'..','app.js'),'utf8');
  const bootMatch=appJs.match(/M\.boot=\(\)=>\{[\s\S]*?\};\n\s*document\.addEventListener\('DOMContentLoaded'/);
  assert.ok(bootMatch,'could not locate M.boot() definition in app.js');
  const bootSrc=bootMatch[0];
  assert.match(bootSrc,/M\.cloud\.pullEvidence\(\)\.then\(p=>\{M\.cloud\.applyEvidence\(p\)/,'M.boot() must call the narrow M.cloud.pullEvidence()/applyEvidence(), not the broad admin pull');
  assert.doesNotMatch(bootSrc,/M\.cloud\.pullShadow\(\)/,'M.boot() must never call the broad M.cloud.pullShadow() automatically -- that stays a deliberate, owner-initiated action only');
}

const NEW_COACH_RESULT={id:'evid-1',athlete_id:'athlete-evidence-swimmer',organisation_id:'org-1',swimmer_name:'Evidence Swimmer',course:'SCM',distance:100,stroke:'Freestyle',result_seconds:58.2,result_date:'2026-09-01',reviewed:true,excluded_from_pb:false};
const STALE_SESSION_A={id:'session-a',organisation_id:'org-1',title:'STALE cloud copy',blocks:[{id:'stale-block',items:[{id:'stale-item',raw:'STALE FROM CLOUD'}]}]};
const CLOUD_SESSION_B={id:'session-b',organisation_id:'org-1',title:'A different session entirely',blocks:[]};

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.stack||e.message));

  const requestedTables=[];
  await page.route('**/rest/v1/**',async route=>{
    const url=route.request().url();
    const m=url.match(/\/rest\/v1\/([a-z_]+)\?/);
    if(m)requestedTables.push(m[1]);
    if(/\/rest\/v1\/coach_results/.test(url))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([NEW_COACH_RESULT])});
    if(/\/rest\/v1\/results_pb_board/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(/\/rest\/v1\/results_event_history/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    // Cloud DOES have session/attendance/roster data available -- if pullEvidence ever regresses
    // to fetch it, these responses would silently corrupt live state and this test must catch that.
    if(/\/rest\/v1\/sessions/.test(url))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([STALE_SESSION_A,CLOUD_SESSION_B])});
    if(/\/rest\/v1\/session_blocks/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(/\/rest\/v1\/attendance/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(/\/rest\/v1\/athletes/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });

  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true,{timeout:15000});

  // 1-3: coach on Session A, Roll entered, Session A has a local live edit; also seed cloud creds.
  await page.evaluate(()=>{
    const M=window.MSOS4;
    localStorage.setItem(M.CONFIG_KEY,JSON.stringify({supabaseUrl:'https://example.test',supabaseAnonKey:'test-anon-key'}));
    localStorage.setItem(M.AUTH_KEY,JSON.stringify({access_token:'test-token',user:{id:'u1'}}));
    M.state.settings.organisationId='org-1';
    if(!M.state.athletes.some(a=>a.id==='athlete-evidence-swimmer'))M.state.athletes.push({id:'athlete-evidence-swimmer',full_name:'Evidence Swimmer',sex:'M',squad:'National',active:true});
    M.state.coachResults=[];
    M.state.canonicalSessions['session-a']={id:'session-a',identity:{date:'2026-09-04',dayPart:'AM',course:'SCM'},blocks:[{id:'live-block',items:[{id:'live-item',raw:'LIVE COACHING EDIT — 8x50 Freestyle'}]}]};
    M.state.settings.selectedSessionId='session-a';
    M.state.settings.view='board';
    M.state.settings.currentBlockId='live-block'; // stand-in for scroll/detail context
    M.state.attendance=[{session_id:'session-a',athlete_id:'athlete-evidence-swimmer',status:'present'}];
    M.store.save(M.state);
  });

  const before=await page.evaluate(()=>({
    selectedSessionId:window.MSOS4.state.settings.selectedSessionId,
    sessionA:JSON.parse(JSON.stringify(window.MSOS4.state.canonicalSessions['session-a'])),
    attendance:JSON.parse(JSON.stringify(window.MSOS4.state.attendance)),
    view:window.MSOS4.state.settings.view,
    currentBlockId:window.MSOS4.state.settings.currentBlockId,
    hasSessionB:!!window.MSOS4.state.canonicalSessions['session-b'],
  }));

  // 5: the exact call M.boot() makes for the background evidence refresh.
  const after=await page.evaluate(async()=>{
    const M=window.MSOS4;
    const ready=M.cloud.ready();
    const p=await M.cloud.pullEvidence();
    M.cloud.applyEvidence(p);
    const luke=M.state.athletes.find(a=>a.id==='athlete-evidence-swimmer');
    const E=window.MSOSEngines.Evidence;
    return{
      cloudReady:ready,
      pullErrors:p.errors,
      selectedSessionId:M.state.settings.selectedSessionId,
      sessionA:JSON.parse(JSON.stringify(M.state.canonicalSessions['session-a'])),
      attendance:JSON.parse(JSON.stringify(M.state.attendance)),
      view:M.state.settings.view,
      currentBlockId:M.state.settings.currentBlockId,
      hasSessionB:!!M.state.canonicalSessions['session-b'],
      coachResultsCount:M.state.coachResults.length,
      newEvidencePresent:M.state.coachResults.some(r=>r.id==='evid-1'),
      pbRowsForEvidenceSwimmer:E.pbRows(luke,M.state).length,
    };
  });

  console.log('REQUESTED TABLES:',[...new Set(requestedTables)].sort());
  console.log('BEFORE:',JSON.stringify(before));
  console.log('AFTER:',JSON.stringify(after));
  console.log('Page errors:',pageErrors.length?pageErrors:'none');

  await browser.close();

  // 6: operational/live-coaching state must be byte-for-byte unchanged.
  assert.equal(after.cloudReady,true,'cloud must be ready for this scenario to be meaningful');
  assert.deepEqual(after.selectedSessionId,before.selectedSessionId,'selected session must not change');
  assert.deepEqual(after.sessionA,before.sessionA,'canonical Session A (incl. live edit) must be byte-for-byte unchanged');
  assert.deepEqual(after.attendance,before.attendance,'Roll/attendance must be byte-for-byte unchanged');
  assert.equal(after.view,before.view,'view must not change');
  assert.equal(after.currentBlockId,before.currentBlockId,'scroll/detail context marker must not change');
  assert.equal(after.hasSessionB,false,'cloud Session B must never be pulled into canonicalSessions by the evidence refresh');
  const touched=[...new Set(requestedTables)];
  for(const forbidden of ['sessions','session_blocks','attendance','athletes','captures','timed_sets','training_test_results','training_test_types','athlete_adaptation_profiles'])
    assert.ok(!touched.includes(forbidden),`evidence refresh must never even request /rest/v1/${forbidden} -- got ${JSON.stringify(touched)}`);

  // 7: evidence itself DID refresh and is usable.
  assert.equal(after.newEvidencePresent,true,'new coach evidence must have loaded');
  assert.ok(after.pbRowsForEvidenceSwimmer>0,'newly-loaded evidence must be visible to E.pbRows');

  console.log('EVIDENCE_REFRESH_AUTHORITY_PASS session-unchanged roll-unchanged live-edit-unchanged view-unchanged context-unchanged evidence-enriched network-scope-contained');
})().catch(e=>{console.error('SCRIPT_ERROR:',e);process.exit(1)});
