'use strict';
// Andy, 17 Oct 2026: Emma joined (her iPhone signed in, accepted the invite and downloaded 307 sessions -- live logs),
// but the copy of MSOS she then used showed nothing: iPhone home-screen icon, Safari and a mail app's browser each keep
// their own sign-in, and the join link was single-use, so the second copy could never be signed in. (Same as Jordan,
// 15 Oct.) msos-coach-join now signs an already-accepted coach in again (while the link is unexpired and the coach is
// still active on the team) and says rejoin:true. Proves the app then reloads the coach's access instead of trying to
// accept the invite a second time, and brings the sessions in. Also: an invite email with a space instead of a dot
// ("…@aquagymswimclub co.nz", the first attempt today) is caught when Andy creates the invite.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1'});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.teamAccess?.joinWithInvite&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,calls=[];M.store.saveAuth({});M.state.settings.organisationId='';
    const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});const real=window.fetch;
    window.fetch=async(u,o={})=>{u=String(u);calls.push(u.replace(/^https?:\/\/[^/]+/,''));
      if(/msos-coach-join/.test(u))return J({email:'smithemma98@outlook.com',token_hash:'h',display_name:'Emma',assigned_squads:['National'],rejoin:true,organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a'});
      if(/auth\/v1\/verify/.test(u))return J({access_token:'tok-e',refresh_token:'r',expires_in:3600,user:{id:'991df39d',email:'smithemma98@outlook.com'}});
      if(/rpc\/mclay_my_membership/.test(u))return J([{organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a',role:'assistant_coach',display_name:'Emma',assigned_squads:['National','Development'],active:true}]);
      if(/rpc\/mclay_accept_assistant_invite/.test(u))return J({message:'Invite already used'},400);
      return real(u,o);};
    M.cloud.turnOnSync=async()=>({ok:true});
    const res=await M.teamAccess.joinWithInvite('0123456789abcdef0123456789abcdef');
    let bad='';try{await M.teamAccess.createInvite({email:'assistantcoach@aquagymswimclub co.nz',squads:['National']});}catch(e){bad=e.message;}
    window.fetch=real;
    return{role:M.access.role(),squads:M.state.settings.assistantSquads,org:M.state.settings.organisationId,signedIn:M.teamAccess.isSignedIn(),accepted:calls.some(c=>/accept_assistant_invite/.test(c)),membership:calls.some(c=>/mclay_my_membership/.test(c)),bad};});
  assert.equal(r.signedIn,true,'this copy of the app is signed in');
  assert.equal(r.accepted,false,'does not try to join a second time');
  assert.equal(r.membership,true,'reloads the coach\'s access instead');
  assert.equal(r.role,'assistant');assert.deepEqual(r.squads,['National','Development']);assert.equal(r.org,'9d40beff-e632-414d-9daa-7ee78104ad2a');
  assert.match(r.bad,/isn't a complete email address/,'a broken invite email is caught when the invite is made');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('COACH_REJOIN_SECOND_COPY_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
