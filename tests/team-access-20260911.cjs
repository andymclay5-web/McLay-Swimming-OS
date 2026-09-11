'use strict';
// Real coaching failure this protects (see engines/team-access.js's own header comment): assistant coach
// access previously existed only as a local, same-device toggle -- a free-text name typed on the
// Connection screen -- so there was no real, per-person, revocable identity for someone like Jordan, and
// no way for a later access change on Andy's side (a squad reassignment, a revoke) to ever reach Jordan's
// device on its own. This test exercises the real engine (engines/team-access.js) against a scripted
// mock of the real Supabase Auth + RPC contracts (read live from Supabase before this file was written),
// not a hand-rolled stub of the engine's own logic -- so it would catch a broken email flow, a broken
// invite/accept round trip, or -- most importantly -- a revoked assistant's device silently keeping its
// old capabilities because refreshMembership failed to fall back to owner-less-safe.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'..','engines','team-access.js'),'utf8');

function buildEnv({authedFetch,cloudFetch,unauthFetch,organisationId}={}){
  const setRoleCalls=[],saveAuthCalls=[],saveCalls=[];
  let authState=null;
  const M={
    state:{settings:{organisationId:organisationId||''}},
    store:{
      config:()=>({supabaseUrl:'https://proj.supabase.test',supabaseAnonKey:'anon-key-123'}),
      auth:()=>authState||{},
      saveAuth:next=>{saveAuthCalls.push(next);authState=next;return true},
      save:s=>{saveCalls.push(s)}
    },
    access:{
      setRole:(role,opts={})=>{setRoleCalls.push({role,opts});M.state.settings.activeRole=role;return role}
    },
    cloud:{org:()=>M.state.settings.organisationId||'',fetch:cloudFetch}
  };
  if(authedFetch)M.cloudSessionEngine={fetch:authedFetch};
  const sandbox={globalThis:{MSOS4:M},fetch:unauthFetch,console};
  vm.runInNewContext(src,sandbox);
  return{T:sandbox.globalThis.MSOS4.teamAccess,M,setRoleCalls,saveAuthCalls,saveCalls};
}
function jsonRes(ok,body){return{ok,text:async()=>JSON.stringify(body)}}

(async()=>{
  // --- 1: passwordless sign-in (send code / verify code) -- this app must never ask anyone for a password.
  {
    const otpCalls=[],verifyCalls=[];
    const unauthFetch=async(url,opts)=>{
      const body=JSON.parse(opts.body||'{}');
      if(url.endsWith('/auth/v1/otp')){otpCalls.push(body);return jsonRes(true,{})}
      if(url.endsWith('/auth/v1/verify')){
        verifyCalls.push(body);
        if(body.token==='000000')return jsonRes(false,{msg:'Token has expired or is invalid'});
        return jsonRes(true,{access_token:'tok-abc',refresh_token:'ref-abc',expires_in:3600,user:{id:'u-jordan',email:body.email}});
      }
      throw new Error('unexpected auth fetch '+url);
    };
    const{T,saveAuthCalls}=buildEnv({unauthFetch});
    assert.equal(T.isSignedIn(),false,'must start signed out');
    await assert.rejects(()=>T.sendSignInCode(''),/Enter an email/,'must refuse to send a code with no email');
    await T.sendSignInCode('  Jordan@Example.com  ');
    assert.equal(otpCalls.length,1);assert.equal(otpCalls[0].email,'jordan@example.com','email must be trimmed+lowercased before hitting Supabase Auth');assert.equal(otpCalls[0].create_user,true);
    await assert.rejects(()=>T.verifySignInCode('jordan@example.com',''),/Enter the sign-in code/);
    await assert.rejects(()=>T.verifySignInCode('jordan@example.com','000000'),/expired or is invalid/,'a real Supabase Auth rejection must reach the caller, not be swallowed');
    assert.equal(T.isSignedIn(),false,'a rejected code must not sign the device in');
    const user=await T.verifySignInCode('jordan@example.com','654321');
    assert.equal(user.email,'jordan@example.com');
    assert.equal(T.isSignedIn(),true);assert.equal(T.signedInEmail(),'jordan@example.com');
    // Single-owner write: cloud-session.js's saveAuth (and any other future caller) must go through
    // M.store.saveAuth so there is exactly one place a token write can happen, per the architecture rule
    // this segment deliberately enforced ("no competing sources of truth").
    assert.equal(saveAuthCalls.length,1,'auth token must be written through Store.saveAuth exactly once');
    assert.equal(saveAuthCalls[0].access_token,'tok-abc');
  }

  // --- 2: real invite creation -- owner shares a real, revocable code, never an emailed link (no
  // dependency on Supabase's email deliverability beyond the sign-in code itself).
  {
    const rpcCalls=[];
    const authedFetch=async(pathName,opts)=>{rpcCalls.push({pathName,body:JSON.parse(opts.body||'{}')});if(pathName==='/rest/v1/rpc/mclay_create_assistant_invite')return[{invite_token:'INV123',organisation_id:'org-1'}];throw new Error('unexpected rpc '+pathName)};
    const{T}=buildEnv({authedFetch,organisationId:'org-1'});
    await assert.rejects(()=>T.createInvite({email:'',squads:['National']}),/email address/);
    await assert.rejects(()=>T.createInvite({email:'jordan@example.com',squads:[]}),/at least one squad/,'an invite with no squad must be refused client-side, not silently sent with none');
    const row=await T.createInvite({email:'Jordan@Example.com',displayName:'Jordan',squads:['National']});
    assert.equal(row.invite_token,'INV123');
    assert.equal(rpcCalls.length,1);
    const sent=rpcCalls[0];
    assert.equal(sent.pathName,'/rest/v1/rpc/mclay_create_assistant_invite');
    assert.equal(sent.body.target_org,'org-1');assert.equal(sent.body.target_email,'jordan@example.com');assert.equal(sent.body.target_display_name,'Jordan');assert.deepEqual(sent.body.target_squads,['National']);
  }

  // --- 2b: authenticated RPCs must reuse the token-refresh-aware fetch (cloudSessionEngine), and only
  // fall back to the plain M.cloud.fetch if that engine somehow isn't loaded -- locking in the "no third
  // fetch wrapper" decision so a future edit can't silently start bypassing token refresh.
  {
    let usedCloudFetch=false;
    const cloudFetch=async()=>{usedCloudFetch=true;return[{invite_token:'FALLBACK'}]};
    const{T}=buildEnv({cloudFetch,organisationId:'org-1'}); // no authedFetch -> M.cloudSessionEngine absent
    const row=await T.createInvite({email:'jordan@example.com',squads:['National']});
    assert.equal(usedCloudFetch,true,'must fall back to M.cloud.fetch when cloudSessionEngine is absent');
    assert.equal(row.invite_token,'FALLBACK');
  }

  // --- 3: accepting a real invite must require being signed in, surface a real rejection, and on success
  // route through the SAME applyMembership() that access-authority.js's role model already understands --
  // never a bespoke, parallel role-setting path.
  {
    const authedFetch=async(pathName,opts)=>{
      const body=JSON.parse(opts.body||'{}');
      if(pathName==='/rest/v1/rpc/mclay_accept_assistant_invite'){
        if(body.invite_token!=='INV123')throw Object.assign(new Error('This invite is invalid or has expired'),{});
        return[{organisation_id:'org-1',role:'assistant',display_name:'Jordan',assigned_squads:['National'],permissions:{}}];
      }
      throw new Error('unexpected rpc '+pathName);
    };
    const unauthFetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');if(url.endsWith('/auth/v1/verify'))return jsonRes(true,{access_token:'tok',refresh_token:'r',expires_in:3600,user:{id:'u1',email:body.email}});throw new Error('unexpected '+url)};
    const{T,M,setRoleCalls}=buildEnv({authedFetch,unauthFetch});
    await assert.rejects(()=>T.acceptInvite('INV123'),/Sign in with your email first/,'must refuse to accept an invite before signing in');
    await T.verifySignInCode('jordan@example.com','111111');
    await assert.rejects(()=>T.acceptInvite(''),/Enter the invite code/);
    await assert.rejects(()=>T.acceptInvite('WRONG'),/invalid or has expired/,'a real acceptance failure must reach the caller');
    const row=await T.acceptInvite('INV123');
    assert.equal(row.organisation_id,'org-1');
    assert.equal(M.state.settings.organisationId,'org-1');
    assert.equal(setRoleCalls.at(-1).role,'assistant');
    assert.equal(setRoleCalls.at(-1).opts.assistantId,'Jordan');
    assert.deepEqual(M.state.settings.assistantSquads,['National']);
  }

  // --- 4: applyMembership's three branches -- the actual security-relevant logic. A revoked or inactive
  // membership must ALWAYS fall back to owner-less-safe on this device, never silently keep stale
  // assistant capabilities (the real failure a same-device toggle could never have caught, since there
  // was never a server-truth row to go stale in the first place).
  {
    const{T,M,setRoleCalls}=buildEnv();
    T.applyMembership({role:'owner',display_name:'Andy',assigned_squads:[],permissions:{},active:true});
    assert.equal(setRoleCalls.at(-1).role,'owner','an owner-role membership row must keep this device as owner');

    setRoleCalls.length=0;
    T.applyMembership({role:'assistant',display_name:'Jordan',assigned_squads:['National','Development'],permissions:{},active:true});
    assert.equal(setRoleCalls.at(-1).role,'assistant');
    assert.deepEqual(M.state.settings.assistantSquads,['National','Development']);
    assert.equal(M.state.settings.assistantPermissions.length,0); // cross-vm-realm empty arrays aren't deepStrictEqual-comparable

    setRoleCalls.length=0;
    T.applyMembership({role:'assistant',display_name:'Jordan',assigned_squads:['National'],permissions:{},active:false});
    assert.equal(setRoleCalls.at(-1).role,'owner','a revoked/inactive membership must fail back to owner-less-safe, never coast on stale assistant caps');
  }

  // --- 5: the boot-hook self-check (refreshMembership) -- must never touch the network when it isn't
  // signed in or has no organisation yet (local availability must not depend on cloud), and on a real
  // response must apply it exactly like accepting an invite does.
  {
    let rpcCalled=false;
    const authedFetch=async()=>{rpcCalled=true;return[]};
    const{T}=buildEnv({authedFetch});
    assert.equal(await T.refreshMembership(),null,'no organisationId yet -- must return null without calling the network');
    assert.equal(rpcCalled,false);
  }
  {
    const rpcCalls=[];
    const authedFetch=async(pathName,opts)=>{rpcCalls.push({pathName,body:JSON.parse(opts.body||'{}')});return[{role:'assistant',display_name:'Jordan',email:'jordan@example.com',active:true,assigned_squads:['National'],permissions:{}}]};
    const unauthFetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');return jsonRes(true,{access_token:'tok',refresh_token:'r',expires_in:3600,user:{id:'u1',email:body.email}})};
    const{T,M}=buildEnv({authedFetch,unauthFetch,organisationId:'org-1'});
    await T.verifySignInCode('jordan@example.com','222222');
    const row=await T.refreshMembership();
    assert.equal(row.role,'assistant');
    assert.equal(rpcCalls[0].pathName,'/rest/v1/rpc/mclay_my_membership');
    assert.equal(rpcCalls[0].body.target_org,'org-1');
    assert.equal(M.state.settings.teamMembership.role,'assistant');
  }
  {
    // Membership row gone entirely (e.g. the owner deleted the member outright) -- must clear local
    // membership rather than leaving a stale cached row that the UI might still trust.
    const authedFetch=async()=>[];
    const unauthFetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');return jsonRes(true,{access_token:'tok',refresh_token:'r',expires_in:3600,user:{id:'u1',email:body.email}})};
    const{T,M}=buildEnv({authedFetch,unauthFetch,organisationId:'org-1'});
    await T.verifySignInCode('jordan@example.com','333333');
    M.state.settings.teamMembership={role:'assistant',stale:true};
    const row=await T.refreshMembership();
    assert.equal(row,null);
    assert.equal(M.state.settings.teamMembership,null,'a vanished membership row must clear the cached membership, not leave it stale');
  }

  // --- 6: owner-only roster management -- correct RPC name + params for list/revoke/update, and the
  // roster must be able to carry BOTH real members and still-pending invites (mclay_coach_access_roster
  // unions both server-side; this just proves the client passes the org through correctly).
  {
    const rpcCalls=[];
    const authedFetch=async(pathName,opts)=>{rpcCalls.push({pathName,body:JSON.parse(opts.body||'{}')});
      if(pathName==='/rest/v1/rpc/mclay_coach_access_roster')return[{user_id:'u-jordan',display_name:'Jordan',active:true},{invite_token:'INVPENDING',email:'sam@example.com'}];
      if(pathName==='/rest/v1/rpc/mclay_revoke_assistant_access')return[];
      if(pathName==='/rest/v1/rpc/mclay_update_assistant_access')return[];
      throw new Error('unexpected rpc '+pathName)};
    const{T}=buildEnv({authedFetch,organisationId:'org-1'});
    const roster=await T.listRoster();
    assert.equal(roster.length,2);
    assert.ok(roster.some(r=>r.user_id==='u-jordan')&&roster.some(r=>r.invite_token==='INVPENDING'),'roster must surface both accepted members and pending invites');
    await assert.rejects(()=>T.revokeAccess(''),/Missing member id/);
    await T.revokeAccess('u-jordan');
    assert.equal(rpcCalls.at(-1).pathName,'/rest/v1/rpc/mclay_revoke_assistant_access');
    assert.equal(rpcCalls.at(-1).body.target_org,'org-1');assert.equal(rpcCalls.at(-1).body.target_user,'u-jordan');
    await T.updateAccess({userId:'u-jordan',displayName:'Jordan',squads:['National'],permissions:{},active:false});
    const upd=rpcCalls.at(-1);
    assert.equal(upd.pathName,'/rest/v1/rpc/mclay_update_assistant_access');
    assert.equal(upd.body.target_user,'u-jordan');assert.equal(upd.body.target_active,false);assert.deepEqual(upd.body.target_squads,['National']);
  }

  // --- 7: signing out must clear the token, clear cached membership, and drop this device back to
  // owner -- so a shared/borrowed device never keeps someone else's signed-in session or role.
  {
    const unauthFetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');return jsonRes(true,{access_token:'tok',refresh_token:'r',expires_in:3600,user:{id:'u1',email:body.email}})};
    const{T,M,setRoleCalls,saveAuthCalls}=buildEnv({unauthFetch});
    await T.verifySignInCode('jordan@example.com','444444');
    M.state.settings.teamMembership={role:'assistant'};
    T.signOut();
    assert.equal(T.isSignedIn(),false);
    assert.equal(saveAuthCalls.at(-1),null,'sign-out must clear the stored auth via the same single-owner Store.saveAuth path');
    assert.equal(M.state.settings.teamMembership,null);
    assert.equal(setRoleCalls.at(-1).role,'owner');
  }

  console.log('TEAM_ACCESS_PASS signin invite accept-invite apply-membership-fail-safe refresh-membership roster signout');
})().catch(e=>{console.error('SCRIPT_ERROR:',e);process.exit(1)});
