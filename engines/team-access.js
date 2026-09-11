'use strict';
// Real coaching failure this fixes (Andy's own words): "at the moment I've got the app on my phone... I'm
// sending him a text version of the session... he's writing it on the board... The desired outcome is that him
// and I both have the session on our phones." Assistant coach access previously existed only as a local,
// same-device toggle (a free-text name typed on the Connection screen) -- it never gave Jordan an actual,
// separate signed-in identity, so there was no way for his own phone to independently hold real, revocable
// access, and no way for the app to tell his edits apart from Andy's. The real invite/accept RPCs
// (mclay_create_assistant_invite, mclay_accept_assistant_invite) and the organisation_members table already
// existed on the Supabase side -- audited and confirmed working -- but nothing in the client ever called them.
// This engine is the one place that calls them: real email sign-in (passwordless one-time code, so this app
// never asks anyone to create or type a password), Andy sending a real invite, Jordan accepting it on his own
// phone, and a periodic self-check (mclay_my_membership, added alongside this file) so a later access change on
// Andy's side -- a squad reassignment, a revoke -- actually reaches Jordan's device without him doing anything.
//
// This is deliberately layered UNDER engines/access-authority.js, not a replacement for it: applyMembership()
// below still goes through M.access.setRole()/the existing local role fields, so every existing capability
// check in the app keeps working unchanged. What's new is WHERE the role/squads come from when a real,
// signed-in membership exists -- the server, not a typed name -- while the local toggle on the Connection
// screen remains as the offline/no-account fallback it always was.
(function(g){
  const M=g.MSOS4,U=M?.util;if(!M?.state||!M?.store||!M?.access)return;
  const T=M.teamAccess={build:'v4-team-access-20260911'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>U?.now?.()||new Date().toISOString();

  function cfg(){return M.store.config()||{}}
  // Pre-sign-in calls (sending/verifying the one-time code) can't use the coach app's normal authenticated
  // fetch helpers -- there is no access token yet -- so they talk to Supabase Auth directly with just the
  // anon key, exactly like swimmer-portal.js's own standalone rpc() helper already does for the same reason.
  async function authRequest(path,body){
    const c=cfg();if(!c.supabaseUrl||!c.supabaseAnonKey)throw new Error('Supabase is not configured on this device yet.');
    const res=await fetch(`${String(c.supabaseUrl).replace(/\/$/,'')}${path}`,{method:'POST',headers:{apikey:c.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
    if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||`Sign-in request failed (${res.status})`);
    return data;
  }
  // Once signed in, real RPC calls need a fresh, refresh-aware access token -- engines/cloud-session.js already
  // owns that (token refresh on expiry/401), so this reuses it rather than adding a third fetch wrapper; falls
  // back to the plain fetch if that engine somehow isn't loaded, so this file has no hard load-order dependency.
  async function authedRpc(name,body){
    const fetcher=M.cloudSessionEngine?.fetch||M.cloud?.fetch;
    if(!fetcher)throw new Error('Cloud connection is not available on this device.');
    return fetcher(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body||{})});
  }
  function firstRow(rows){return Array.isArray(rows)?rows[0]||null:rows||null}

  T.isSignedIn=()=>!!M.store.auth()?.access_token;
  T.signedInEmail=()=>text(M.store.auth()?.user?.email||'');
  // Real, per-person authorship (10 Sept 2026, Phase 2: "every edit gets tagged with who made it"). This
  // is what app.js's session-change engine (tx()) stamps onto every change and onto the session document
  // itself, and what C.reconcileSession's owner-priority merge rule below reads to decide whose edit
  // wins. Deliberately synchronous and never throws -- it must be safe to call from inside a session edit
  // on a device that has never signed in at all (a solo owner with no assistant coach yet), so it falls
  // back through local, always-available fields rather than requiring a network round trip.
  T.actor=()=>{
    const role=M.access?.role?.()||'owner';
    if(role==='assistant'){
      const m=M.state.settings.teamMembership;
      return{role:'assistant',name:text(m?.displayName)||text(M.state.settings.assistantId)||text(T.signedInEmail())||'Assistant coach'};
    }
    return{role:'owner',name:text(T.signedInEmail())||'Owner'};
  };

  T.sendSignInCode=async email=>{
    email=text(email).toLowerCase();if(!email)throw new Error('Enter an email address.');
    await authRequest('/auth/v1/otp',{email,create_user:true});
    return true;
  };
  T.verifySignInCode=async(email,code)=>{
    email=text(email).toLowerCase();code=text(code).replace(/\s+/g,'');
    if(!email)throw new Error('Enter your email address.');
    if(!code)throw new Error('Enter the sign-in code you were sent.');
    const data=await authRequest('/auth/v1/verify',{type:'email',email,token:code});
    if(!data?.access_token)throw new Error('Sign-in did not return an access token.');
    const exp=Number(data.expires_at)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600);
    M.store.saveAuth({access_token:data.access_token,refresh_token:data.refresh_token||'',expires_at:exp,user:data.user||null});
    return data.user||null;
  };
  T.signOut=()=>{
    M.store.saveAuth(null);
    M.state.settings.teamMembership=null;
    M.access.setRole('owner');
    M.store.save(M.state);
  };

  // Owner-only: creates a real, revocable invite. Andy shares the returned link/code with Jordan himself (text,
  // WhatsApp, whatever) -- there is no email-sending step here, so this has no dependency on Supabase's email
  // deliverability/rate limits, which the one-time sign-in code above already uses.
  T.createInvite=async({email,displayName='',squads=[]}={})=>{
    const org=M.cloud?.org?.();if(!org)throw new Error('Organisation not loaded on this device yet.');
    email=text(email).toLowerCase();if(!email)throw new Error("Enter the assistant coach's email address.");
    if(!Array.isArray(squads)||!squads.length)throw new Error('Choose at least one squad for this assistant coach.');
    const row=firstRow(await authedRpc('mclay_create_assistant_invite',{target_org:org,target_email:email,target_display_name:text(displayName),target_squads:squads,target_permissions:{}}));
    if(!row?.invite_token)throw new Error('The invite was not created.');
    return row;
  };
  // Called by the invited coach, once signed in with the exact email the invite was sent to (the database
  // itself enforces this match -- see mclay_accept_assistant_invite).
  T.acceptInvite=async token=>{
    token=text(token);if(!token)throw new Error('Enter the invite code Andy sent you.');
    if(!T.isSignedIn())throw new Error('Sign in with your email first, then accept the invite.');
    const row=firstRow(await authedRpc('mclay_accept_assistant_invite',{invite_token:token}));
    if(!row?.organisation_id)throw new Error('This invite could not be accepted.');
    M.state.settings.organisationId=row.organisation_id;
    applyMembership({role:row.role,display_name:row.display_name,assigned_squads:row.assigned_squads,permissions:row.permissions,active:true});
    return row;
  };
  // Fire-and-forget self-check (see the boot hook in app.js): confirms this device's role/squads/active status
  // against the real membership row rather than trusting whatever was cached at accept time, so an owner-side
  // squad change or revoke actually reaches the assistant's device once it's next online -- never a blocking
  // dependency of opening the app (local availability must not depend on cloud).
  T.refreshMembership=async()=>{
    const org=M.state.settings.organisationId;
    if(!org||!T.isSignedIn())return null;
    const row=firstRow(await authedRpc('mclay_my_membership',{target_org:org}));
    if(!row){M.state.settings.teamMembership=null;return null}
    applyMembership(row);
    return row;
  };
  // Owner-only: everyone with real access on this organisation, plus any invite still waiting to be accepted.
  T.listRoster=async()=>{
    const org=M.cloud?.org?.();if(!org)throw new Error('Organisation not loaded on this device yet.');
    return await authedRpc('mclay_coach_access_roster',{target_org:org})||[];
  };
  T.revokeAccess=async userId=>{
    const org=M.cloud?.org?.();if(!org)throw new Error('Organisation not loaded on this device yet.');
    if(!userId)throw new Error('Missing member id.');
    await authedRpc('mclay_revoke_assistant_access',{target_org:org,target_user:userId});
  };
  T.updateAccess=async({userId,displayName='',squads=[],permissions={},active=true}={})=>{
    const org=M.cloud?.org?.();if(!org)throw new Error('Organisation not loaded on this device yet.');
    if(!userId)throw new Error('Missing member id.');
    await authedRpc('mclay_update_assistant_access',{target_org:org,target_user:userId,target_display_name:text(displayName),target_squads:squads,target_permissions:permissions,target_active:active});
  };

  function applyMembership(row){
    const role=text(row.role).toLowerCase();
    const isOwner=['owner','head_coach','admin'].includes(role);
    M.state.settings.teamMembership={role,displayName:text(row.display_name),email:text(row.email),assignedSquads:Array.isArray(row.assigned_squads)?row.assigned_squads:[],permissions:row.permissions||{},active:row.active!==false,fetchedAt:now()};
    if(isOwner||row.active===false){
      // A revoked/inactive membership must never leave a device silently coasting on its last-known assistant
      // caps -- fall back to owner-less-safe: local Owner mode still exists, but the real gate is server-side
      // (every mclay_can_view_* / mclay_has_permission check), so this is a client convenience, not the
      // security boundary itself.
      M.access.setRole('owner');
    }else{
      M.access.setRole('assistant',{assistantId:text(row.display_name)||T.signedInEmail()||'assistant'});
      M.state.settings.assistantSquads=Array.isArray(row.assigned_squads)?row.assigned_squads:[];
      M.state.settings.assistantPermissions=[];
    }
    M.store.save(M.state);
  }
  T.applyMembership=applyMembership;
})(globalThis);
