'use strict';
// Andy, Mon 9 Nov 2026: "Kaleb entered a session and took the roll but I can't see it?" (and Fri 6 Nov the same). Kaleb's
// phone was signed in but had no club on it: it never synced or checked his role, ran as the owner, and its only cloud
// calls were refused owner-only swimmer-page publishes. A signed-in phone with no club now reads its own membership row
// on opening, takes the club and his assistant role from it, and stops acting as the owner.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const ROW={organisation_id:ORG,role:'assistant_coach',display_name:'Kaleb',email:'kaleb@x.nz',active:true,assigned_squads:['National','Development'],permissions:{edit_sessions:true,mark_attendance:true}};
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const asked=[],ownerCalls=[],sent=[];
  await p.route(/\/(rest|auth|storage)\/v1\//,async route=>{const u=route.request().url();
    if(/organisation_members\?/.test(u)){asked.push(u);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/user_id=eq\.u-kaleb/.test(u)?[ROW]:[])});}
    if(/msos_publish_swimmer_payload|msos_owner_swimmer_access/.test(u)){ownerCalls.push(u);return route.fulfill({status:400,contentType:'application/json',body:'{"message":"Owner access required"}'});}
    if(/\/rest\/v1\/sessions\?/.test(u)&&route.request().method()==='POST'){sent.push(...[].concat(JSON.parse(route.request().postData()||'[]')));return route.fulfill({status:201,contentType:'application/json',body:'[]'});}
    if(/mclay_my_membership/.test(u))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([ROW])});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.teamAccess?.findMyClub,{timeout:30000});await p.waitForTimeout(400);
  await p.evaluate(()=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-kaleb',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-kaleb',email:'kaleb@x.nz'}});
    M.state.settings.organisationId='';M.state.settings.activeRole='owner';
    const ses=M.parser.parse('MAIN SET\n8 x 100 Free 15sR',{date:'2026-11-09',dayPart:'PM',squads:['National']});ses.id='kaleb-mon-pm';M.store.putSession(M.state,ses);
    M.cloud.queue('sessions',M.cloud.projectSession(ses));M.store.save(M.state);});
  const before=await p.evaluate(()=>({role:window.MSOS4.access.role(),ready:window.MSOS4.cloud.ready()}));
  assert.deepEqual(before,{role:'owner',ready:false},'Kaleb\'s phone as it was: signed in, no club, running as owner');
  // opening the app again finds the club
  await p.waitForTimeout(1500);await p.reload();await p.waitForFunction(()=>window.MSOS4?.state?.settings?.organisationId,{timeout:20000});
  const r=await p.evaluate(()=>{const M=window.MSOS4;return{org:M.state.settings.organisationId,role:M.access.role(),squads:M.state.settings.assistantSquads,ready:M.cloud.ready(),actor:M.teamAccess.actor()};});
  assert.equal(r.org,ORG);assert.equal(r.role,'assistant');assert.deepEqual(r.squads,['National','Development']);assert.equal(r.ready,true);assert.equal(r.actor.role,'assistant');
  assert.ok(asked.length>=1,'looked up its own membership row');
  const queued=await p.evaluate(()=>{const M=window.MSOS4,q=(M.state.pending||[]).find(x=>x.table==='sessions'&&x.record?.id==='kaleb-mon-pm');return q?{saved:q.record.organisation_id,sent:M.cloud.recordFor(q).organisation_id}:null;});
  if(queued)assert.deepEqual(queued,{saved:'',sent:ORG},'the session he saved before the club was known goes with the club');
  else{const row=sent.find(x=>x.id==='kaleb-mon-pm');assert.ok(row,`sent once the club was found: ${JSON.stringify(sent.map(x=>x.id))}`);assert.equal(row.organisation_id,ORG,'the session he saved before the club was known is sent with the club');}
  // a phone with no membership row is left alone
  const none=await p.evaluate(async()=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-x',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-nobody',email:'n@x.nz'}});M.state.settings.organisationId='';const row=await M.teamAccess.findMyClub();return{row,org:M.state.settings.organisationId};});
  assert.deepEqual(none,{row:null,org:''});
  assert.deepEqual(errors,[],errors.join('\n'));console.log('COACH_PHONE_FINDS_CLUB_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
