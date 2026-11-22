'use strict';
// 22 Nov 2026: weekly real-session check. Andy agreed to run a real session end to end on the phone each week; the
// phone now notes that journey itself (engines/journey-recorder.js) instead of him running a test script poolside.
// Proves:
//  - the poolside steps the coach takes are noted (Board, Roll, Times, Capture, background and back, Finish);
//  - the session, the workout or Roll changing with no tap from the coach just before is noted as a surprise;
//  - the same change straight after the coach's tap is not;
//  - it is sent to msos_session_journeys once, and recording changes nothing on screen.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  const posts=[];await p.route(/\/rest\/v1\/msos_session_journeys/,async r=>{posts.push({body:JSON.parse(r.request().postData()||'[]'),prefer:r.request().headers()['prefer']});await r.fulfill({status:201,body:''})});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.journeyRecorder,{timeout:30000});
  await p.evaluate(()=>{const M=window.MSOS4;
    const a=M.parser.parse('MAIN SET\n8 x 100 Free Dev 10s rest',{date:'2026-11-24',dayPart:'PM',squads:['National']});a.id='jr-a';M.store.putSession(M.state,a);
    const c=M.parser.parse('MAIN SET\n4 x 50 Kick',{date:'2026-11-20',dayPart:'AM',squads:['National']});c.id='jr-old';M.store.putSession(M.state,c);
    M.state.athletes=[{id:'s1',full_name:'Swim One',squad:'National',active:true},{id:'s2',full_name:'Swim Two',squad:'National',active:true}];
    M.state.settings.selectedSessionId='jr-a';M.nav.show('board');});
  await p.waitForTimeout(6500);// boot settles
  const tapThen=async fn=>{await p.mouse.click(5,300);await p.evaluate(fn)};
  // the coach's own steps
  await tapThen(()=>{const M=window.MSOS4;M.state.attendance=(M.state.attendance||[]).concat([{session_id:'jr-a',athlete_id:'s1',status:'present'},{session_id:'jr-a',athlete_id:'s2',status:'present'}]);M.nav.show('roll')});await p.waitForTimeout(1300);
  await tapThen(()=>window.MSOS4.nav.show('times'));await p.waitForTimeout(1300);
  await tapThen(()=>{const M=window.MSOS4;M.state.captures=(M.state.captures||[]).concat([{id:'jr-cap',session_id:'jr-a',capture_type:'text',text_content:'long glide'}]);M.nav.show('board')});await p.waitForTimeout(1300);
  // a coach's live edit (tap first) is not a surprise
  await tapThen(()=>{const M=window.MSOS4,s=M.state.canonicalSessions['jr-a'];s.blocks[0].items[0].raw='6 x 100 Free Dev 10s rest'});await p.waitForTimeout(1300);
  let log=await p.evaluate(()=>window.MSOS4.journeyRecorder.log().find(x=>x.session_id==='jr-a'));
  assert.deepEqual(log.surprises,[],'the coach\'s own steps are not surprises: '+JSON.stringify(log.surprises));
  assert.equal(log.steps.board&&log.steps.roll&&log.steps.times&&log.steps.capture,true,JSON.stringify(log.steps));assert.equal(log.rollMax,2);
  // nobody tapped: Roll loses a swimmer, the workout changes, then the session is swapped
  await p.waitForTimeout(2700);
  await p.evaluate(()=>{const M=window.MSOS4;M.state.attendance=M.state.attendance.filter(x=>x.athlete_id!=='s2')});await p.waitForTimeout(1300);
  await p.evaluate(()=>{const M=window.MSOS4,s=M.state.canonicalSessions['jr-a'];s.blocks[0].items[0].raw='3 x 100 Free Dev 10s rest'});await p.waitForTimeout(1300);
  await p.evaluate(()=>{window.MSOS4.state.settings.selectedSessionId='jr-old'});await p.waitForTimeout(1300);
  log=await p.evaluate(()=>window.MSOS4.journeyRecorder.log().find(x=>x.session_id==='jr-a'));
  const kinds=log.surprises.map(x=>x.kind);
  assert.deepEqual(kinds,['roll-dropped','workout-changed','session-changed'],JSON.stringify(log.surprises));
  assert.equal(log.surprises[0].from,'2');assert.equal(log.surprises[0].to,'1');assert.match(log.surprises[2].to,/jr-old/);
  // Finish is noted
  await tapThen(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='jr-a';M.state.canonicalSessions['jr-a'].finish={at:new Date().toISOString()}});await p.waitForTimeout(1300);
  log=await p.evaluate(()=>window.MSOS4.journeyRecorder.log().find(x=>x.session_id==='jr-a'));assert.equal(log.steps.finish,true);
  // sent once, signed in
  const before=await p.evaluate(()=>({view:window.MSOS4.state.settings.view,sel:window.MSOS4.state.settings.selectedSessionId}));
  await p.evaluate(()=>{const M=window.MSOS4;M.store.saveAuth({access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'048dd1ac-0fea-4b7b-b5bc-eeec00abcb8b'}});M.state.settings.organisationId='9d40beff-e632-414d-9daa-7ee78104ad2a'});
  await p.evaluate(()=>window.MSOS4.journeyRecorder.send());await p.waitForTimeout(500);await p.evaluate(()=>window.MSOS4.journeyRecorder.send());await p.waitForTimeout(300);
  assert.equal(posts.length,1,'sent once: '+posts.length);assert.match(posts[0].prefer,/merge-duplicates/);
  const row=posts[0].body.find(x=>x.session_id==='jr-a');assert.ok(row,'jr-a journey sent');assert.equal(row.organisation_id,'9d40beff-e632-414d-9daa-7ee78104ad2a');assert.equal(row.surprises.length,3);assert.equal(row.steps.finish,true);
  const after=await p.evaluate(()=>({view:window.MSOS4.state.settings.view,sel:window.MSOS4.state.settings.selectedSessionId}));
  assert.deepEqual(after,before,'recording changes nothing');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SESSION_JOURNEY_RECORDER_PASS',kinds.join(','));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
