'use strict';
// End-to-end verification that an assistant coach's device role (Jordan's scenario) survives every
// real lifecycle event a coaching device goes through, without ever touching another device, and
// that an assistant with no assigned squad fails closed rather than silently seeing everything.
// This is a VERIFICATION pass, not a rewrite: per the product review, the current capability model
// (engines/access-authority.js) should already achieve this -- the point is to prove it against the
// real running app, not a hand-built stub, and to record exactly what was checked.
//
// Checked, in order:
//  1. role + assigned squads survive a full page reload (real re-hydration from storage, not a mock)
//  2. role + assigned squads survive background/resume (visibilitychange hidden -> visible)
//  3. role + assigned squads survive navigation between views
//  4. role + assigned squads survive the boot-time cloud evidence refresh (M.cloud.pullEvidence/
//     applyEvidence -- the exact call M.boot() makes, see tests/evidence-refresh-authority-20260904.cjs)
//  5. role + assigned squads survive an explicit session switch (M.selectSession)
//  6. an incoming live-sync message from a different device/tab cannot change this device's role
//     (architectural: settings.activeRole/assistantSquads/assistantId are never part of any Supabase
//     table -- confirmed against C.PULL_TABLES/C.CORE_WRITE_TABLES below -- and L.apply explicitly
//     restores role/view/activeUserAthleteId/assistantId after applying any incoming message)
//  7. throughout all of the above, an assistant assigned to National can see/select National but
//     never Development (positive squad-scoping, not just "it still says assistant")
//  8. an assistant with an EMPTY assigned-squad list sees nothing -- fails closed, not open
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

// 6 (static half): confirm role/assistant fields are architecturally never staged to Supabase --
// if they were, a second device really could inherit this device's role through cloud sync.
{
  const appJs=fs.readFileSync(path.resolve(__dirname,'..','app.js'),'utf8');
  const pullMatch=appJs.match(/C\.PULL_TABLES=\[([^\]]*)\]/);
  const writeMatch=appJs.match(/C\.CORE_WRITE_TABLES=\[([^\]]*)\]/);
  assert.ok(pullMatch&&writeMatch,'could not locate C.PULL_TABLES/C.CORE_WRITE_TABLES in app.js');
  for(const list of [pullMatch[1],writeMatch[1]])
    for(const forbidden of ['settings','device_role','role','assistant'])
      assert.doesNotMatch(list,new RegExp(`'${forbidden}'`),`no cloud table may carry device role/settings -- found '${forbidden}' in a cloud table list`);
}

const NEW_COACH_RESULT={id:'jordan-evid-1',athlete_id:'nat-1',organisation_id:'org-1',swimmer_name:'National Swimmer',course:'SCM',distance:100,stroke:'Freestyle',result_seconds:58.2,result_date:'2026-09-01',reviewed:true,excluded_from_pb:false};

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
    if(/\/rest\/v1\/results_pb_board/.test(url)||/\/rest\/v1\/results_event_history/.test(url))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });

  const seed=async()=>page.evaluate(async()=>{
    const M=window.MSOS4;
    M.state.athletes=[
      {id:'nat-1',full_name:'National Swimmer',squad:'National',active:true},
      {id:'dev-1',full_name:'Development Swimmer',squad:'Development',active:true},
    ];
    M.state.canonicalSessions['sess-nat']={id:'sess-nat',identity:{date:'2026-09-04',dayPart:'AM',course:'SCM',squads:['National']},blocks:[{id:'b1',title:'MAIN SET',type:'main',items:[{id:'i1',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4x100 Freestyle'}]}],changes:[]};
    M.state.canonicalSessions['sess-nat-2']={id:'sess-nat-2',identity:{date:'2026-09-04',dayPart:'PM',course:'SCM',squads:['National']},blocks:[{id:'b2',title:'MAIN SET',type:'main',items:[{id:'i2',kind:'set',reps:4,distance:50,stroke:'Freestyle',raw:'4x50 Freestyle'}]}],changes:[]};
    M.state.canonicalSessions['sess-dev']={id:'sess-dev',identity:{date:'2026-09-04',dayPart:'AM',course:'SCM',squads:['Development']},blocks:[{id:'b3',title:'MAIN SET',type:'main',items:[{id:'i3',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4x100 Freestyle'}]}],changes:[]};
    M.state.attendance=[{session_id:'sess-nat',athlete_id:'nat-1',status:'present'}];
    M.access.setRole('assistant',{assistantId:'jordan-assistant-coach'});
    M.state.settings.assistantSquads=['National'];
    M.state.settings.selectedSessionId='sess-nat';
    M.state.settings.view='board';
    M.store.save(M.state);
    // Wait for the actual durable IndexedDB write (Store.save debounces ~40ms), not just the
    // in-memory assignment -- otherwise a reload immediately after setup would race the write and
    // this test would be checking nothing real.
    await M.storageEngine.whenPersisted(M.state.settings.storageRevision);
  });

  const snapshot=async label=>page.evaluate(label=>{
    const M=window.MSOS4;
    const nat=M.state.athletes.find(a=>a.id==='nat-1'),dev=M.state.athletes.find(a=>a.id==='dev-1');
    return{
      label,
      role:M.access.role(),
      assistantId:M.state.settings.assistantId,
      assistantSquads:[...(M.state.settings.assistantSquads||[])],
      natAllowed:M.access.athleteAllowed(nat),
      devAllowed:M.access.athleteAllowed(dev),
      natSessionAllowed:M.access.sessionAllowed(M.state.canonicalSessions['sess-nat']),
      devSessionAllowed:M.access.sessionAllowed(M.state.canonicalSessions['sess-dev']),
      canEditSession:M.access.can('session.edit'),
      canWriteAttendance:M.access.can('attendance.write'),
      view:M.state.settings.view,
    };
  },label);

  const assertScoped=(snap,where)=>{
    assert.equal(snap.role,'assistant',`role must still be assistant ${where}`);
    assert.equal(snap.assistantId,'jordan-assistant-coach',`assistantId must survive ${where}`);
    assert.deepEqual(snap.assistantSquads,['National'],`assigned squads must survive ${where}`);
    assert.equal(snap.natAllowed,true,`National swimmer must stay visible ${where}`);
    assert.equal(snap.devAllowed,false,`Development swimmer must stay hidden ${where}`);
    assert.equal(snap.natSessionAllowed,true,`National session must stay selectable ${where}`);
    assert.equal(snap.devSessionAllowed,false,`Development session must stay blocked ${where}`);
    assert.equal(snap.canEditSession,false,`assistant must never gain session.edit ${where}`);
    assert.equal(snap.canWriteAttendance,true,`assistant must keep deck capability ${where}`);
  };

  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true,{timeout:15000});
  await seed();
  assertScoped(await snapshot('immediately after setup'),'immediately after setup');

  // 1: full page reload -- real re-hydration from storage, not a mock.
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true,{timeout:15000});
  assertScoped(await snapshot('after reload'),'after a full page reload');

  // 2: background/resume.
  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assertScoped(await snapshot('after background/resume'),'after backgrounding and resuming the tab');

  // 3: navigation between views.
  await page.evaluate(()=>{window.MSOS4.nav.show('roll',{push:false});});
  assertScoped(await snapshot('after navigating to Roll'),'after navigating to Roll');
  await page.evaluate(()=>{window.MSOS4.nav.show('times',{push:false});});
  assertScoped(await snapshot('after navigating to Times'),'after navigating to Times');
  await page.evaluate(()=>{window.MSOS4.nav.show('board',{push:false});});
  assertScoped(await snapshot('after navigating back to Board'),'after navigating back to Board');

  // 4: the boot-time cloud evidence refresh -- exact call M.boot() makes.
  await page.evaluate(()=>{
    const M=window.MSOS4;
    localStorage.setItem(M.CONFIG_KEY,JSON.stringify({supabaseUrl:'https://example.test',supabaseAnonKey:'test-anon-key'}));
    localStorage.setItem(M.AUTH_KEY,JSON.stringify({access_token:'test-token',user:{id:'u1'}}));
    M.state.settings.organisationId='org-1';
  });
  const evidenceResult=await page.evaluate(async()=>{
    const M=window.MSOS4;
    const p=await M.cloud.pullEvidence();
    M.cloud.applyEvidence(p);
    return{newEvidencePresent:M.state.coachResults.some(r=>r.id==='jordan-evid-1')};
  });
  assert.equal(evidenceResult.newEvidencePresent,true,'evidence refresh must still actually enrich evidence while role stays untouched');
  assertScoped(await snapshot('after cloud evidence refresh'),'after the boot-time cloud evidence refresh');
  for(const forbidden of ['sessions','session_blocks','attendance','athletes'])
    assert.ok(![...new Set(requestedTables)].includes(forbidden),`evidence refresh must never request /rest/v1/${forbidden} -- got ${JSON.stringify([...new Set(requestedTables)])}`);

  // 5: explicit session switch, still squad-scoped -- and switching to an unassigned squad's
  // session must be refused, not silently allowed.
  await page.evaluate(()=>window.MSOS4.selectSession('sess-nat-2'));
  const afterSwitch=await snapshot('after switching to another National session');
  assertScoped(afterSwitch,'after switching to another National session');
  assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.selectedSessionId),'sess-nat-2','session switch must actually take effect for an assigned squad');
  const blockedSwitch=await page.evaluate(()=>{try{window.MSOS4.selectSession('sess-dev');return{threw:false}}catch(e){return{threw:true,message:e.message}}});
  assert.equal(blockedSwitch.threw,true,'switching to an unassigned squad\'s session must be refused, not silently allowed');
  assertScoped(await snapshot('after a refused cross-squad session switch'),'after a refused cross-squad session switch');

  // 6: an incoming live-sync message from a different device/tab must not change this device's role.
  // Put this device in a derived view (as a kiosk/TV tab might legitimately be) so the message is
  // even eligible to apply at all, then confirm role/squad scoping survives regardless.
  await page.evaluate(()=>{window.MSOS4.state.settings.view='tv';});
  const liveResult=await page.evaluate(()=>{
    const M=window.MSOS4;
    return M.live.apply({kind:'v4-live-state',build:M.BUILD,from:'owner-board-tab',authority:'coach-operational',sourceView:'board',sourceRole:'owner',surfaceMode:'training',sessionId:'sess-nat',session:M.state.canonicalSessions['sess-nat'],attendance:[{session_id:'sess-nat',athlete_id:'nat-1',status:'present'}],adaptationOverrides:[],trainingTestResults:[],revision:1});
  });
  assert.equal(liveResult,true,'the live message itself must have been eligible to apply (sanity check on the scenario, not the assertion under test)');
  await page.evaluate(()=>{window.MSOS4.state.settings.view='board';window.MSOS4.store.save(window.MSOS4.state);});
  assertScoped(await snapshot('after receiving a live-sync message from another tab'),'after receiving a live-sync message from another device/tab');

  // 8: an assistant with NO assigned squad must fail closed -- see nothing, not everything.
  const failClosed=await page.evaluate(()=>{
    const M=window.MSOS4;
    M.state.settings.assistantSquads=[];
    M.store.save(M.state);
    const nat=M.state.athletes.find(a=>a.id==='nat-1'),dev=M.state.athletes.find(a=>a.id==='dev-1');
    return{
      role:M.access.role(),
      visibleAthletesCount:M.access.visibleAthletes().length,
      natAllowed:M.access.athleteAllowed(nat),
      devAllowed:M.access.athleteAllowed(dev),
      natSessionAllowed:M.access.sessionAllowed(M.state.canonicalSessions['sess-nat']),
    };
  });
  assert.equal(failClosed.role,'assistant','role itself should not change just because squads are empty');
  assert.equal(failClosed.visibleAthletesCount,0,'an assistant with no assigned squad must see zero athletes, not the whole roster');
  assert.equal(failClosed.natAllowed,false,'an assistant with no assigned squad must not see a swimmer just because a squad USED to be assigned');
  assert.equal(failClosed.devAllowed,false);
  assert.equal(failClosed.natSessionAllowed,false,'an assistant with no assigned squad must not see any session');

  console.log('Page errors:',pageErrors.length?pageErrors:'none');
  await browser.close();

  if(pageErrors.length)throw new Error(`Unexpected page errors: ${JSON.stringify(pageErrors)}`);

  console.log('JORDAN_ASSISTANT_ROLE_PERSISTENCE_PASS reload background-resume navigation cloud-evidence-refresh session-switch live-sync-isolation fail-closed-no-squad');
})().catch(e=>{console.error('SCRIPT_ERROR:',e);process.exit(1)});
