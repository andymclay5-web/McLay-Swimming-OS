'use strict';
// 23 Nov 2026: Matthew's "What I'm working on" card was wiped on his phone (published as null at 07:06). Proves a card
// that can't be built is left out of the publish, so the swimmer keeps their last one, and the failure is noted in the
// diagnostics log (msos_client_freezes, source working-on-error) instead of being swallowed.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  const sent=[];await p.route(/\/rest\/v1\/rpc\/msos_publish_swimmer_payload/,async r=>{sent.push(JSON.parse(r.request().postData()||'{}'));await r.fulfill({status:200,contentType:'application/json',body:'null'})});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.swimmerInviteBN?.publishShared&&window.MSOS4?.raceElementsUI?.portalWorkingOn&&window.MSOS4?.freezeRecorder?.note,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4;const mr={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true};M.state.athletes=[mr];
    M.state.settings.organisationId='9d40beff-e632-414d-9daa-7ee78104ad2a';M.cloud.ready=()=>true;M.cloud.org=()=>'9d40beff-e632-414d-9daa-7ee78104ad2a';
    M.store.auth=()=>({access_token:'tok'});M.state.settings.teamMembership={role:'owner',active:true};
    const RE=M.raceElementsUI;const orig=RE.workingOnText;RE.workingOnText=()=>{throw new Error('boom in working on')};
    M.swimmerInviteBN.publishShared(['athlete-matthew-robertson']);await new Promise(r=>setTimeout(r,2500));RE.workingOnText=orig;
    const log=M.freezeRecorder.log().filter(x=>x.source==='working-on-error');
    return{log:log.map(x=>({ms:x.duration_ms,msg:x.detail.message,ath:x.detail.athlete}))};});
  r.sent=sent.map(x=>({who:x.p_athlete_id,keys:Object.keys(x.p_payload||{}).sort()}));
  assert.equal(r.sent.length,1,JSON.stringify(r));assert.ok(!r.sent[0].keys.includes('workingOn'),'no workingOn sent when it could not be built: '+JSON.stringify(r.sent));assert.ok(r.sent[0].keys.includes('sharedEvidence'));
  assert.equal(r.log.length,1,JSON.stringify(r.log));assert.equal(r.log[0].msg,'boom in working on');assert.equal(r.log[0].ath,'athlete-matthew-robertson');assert.equal(r.log[0].ms,0);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('WORKING_ON_NEVER_WIPED_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
