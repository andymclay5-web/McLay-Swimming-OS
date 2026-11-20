'use strict';
// Andy, Sat 21 Nov 2026: "Phone's freezing up quite a lot ... it kind of comes and goes, so to be able to see what's
// causing it would be quite good." Proves engines/freeze-recorder.js:
//  - a 1.5s main-thread stall right after a tap is recorded, with its length, the view, the session on screen and what
//    was tapped; a short 100ms task is not;
//  - one stall is one record (the heartbeat and the browser's long-task report don't double it);
//  - it is sent to msos_client_freezes with the organisation and user, and not sent twice;
//  - it changes nothing: same view, same session, no page errors.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  const posts=[];await p.route(/\/rest\/v1\/msos_client_freezes/,async r=>{posts.push({url:r.request().url(),body:JSON.parse(r.request().postData()||'[]'),prefer:r.request().headers()['prefer']});await r.fulfill({status:201,body:''});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.freezeRecorder,{timeout:30000});await p.waitForTimeout(800);
  const before=await p.evaluate(()=>{const M=window.MSOS4;const s=M.parser.parse('MAIN SET\n8 x 100 Free Dev 10s rest',{date:'2026-11-21',dayPart:'AM',squads:['National']});s.id='freeze-sess';M.store.putSession(M.state,s);M.nav.show('board');return{view:M.state.settings.view,sel:M.state.settings.selectedSessionId}});
  await p.evaluate(()=>{const btn=document.createElement('button');btn.id='heavyBtn';btn.setAttribute('data-test-heavy','1');btn.textContent='Heavy thing';btn.addEventListener('click',()=>{const t=Date.now();while(Date.now()-t<1500){}});document.body.appendChild(btn);});
  await p.evaluate(()=>{const t=Date.now();while(Date.now()-t<100){}});await p.waitForTimeout(600);
  await p.click('#heavyBtn');await p.waitForTimeout(1200);
  const log=await p.evaluate(()=>window.MSOS4.freezeRecorder.log());
  assert.equal(log.length,1,'one stall, one record: '+JSON.stringify(log.map(x=>[x.duration_ms,x.source])));
  const f=log[0];assert.ok(f.duration_ms>=1300&&f.duration_ms<=2500,String(f.duration_ms));
  assert.equal(f.view,'board');assert.equal(f.detail.session.id,'freeze-sess');
  assert.match(f.detail.lastAction.target,/heavyBtn|data-test-heavy/,JSON.stringify(f.detail.lastAction));assert.equal(f.detail.lastAction.text,'Heavy thing');
  // signed in -> sent once
  await p.evaluate(()=>{const M=window.MSOS4;M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b'}});M.state.settings.organisationId='9d40beff-e632-414d-9daa-7ee78104ad2a';});
  await p.evaluate(()=>window.MSOS4.freezeRecorder.send());await p.waitForTimeout(500);await p.evaluate(()=>window.MSOS4.freezeRecorder.send());await p.waitForTimeout(300);
  assert.equal(posts.length,1,'sent once: '+posts.length);const row=posts[0].body[0];
  assert.equal(row.organisation_id,'9d40beff-e632-414d-9daa-7ee78104ad2a');assert.equal(row.user_id,'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b');assert.equal(row.view,'board');assert.match(posts[0].prefer,/ignore-duplicates/);
  const after=await p.evaluate(()=>({view:window.MSOS4.state.settings.view,sel:window.MSOS4.state.settings.selectedSessionId}));
  assert.deepEqual(after,before,'recording changes nothing');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('FREEZE_RECORDER_PASS',f.duration_ms+'ms',f.detail.lastAction.target);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
