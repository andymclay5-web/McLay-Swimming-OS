'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.cloud||!M?.store)return;
  const C=M.cloudSessionEngine={build:'v4-cloud-session-20260820z',authStatus:{status:'idle',error:'',at:''}};
  const text=v=>String(v??'').trim();
  const config=()=>M.store.config?.()||{};
  const auth=()=>M.store.auth?.()||{};
  const org=()=>M.cloud.org?.()||M.state?.settings?.organisationId||'';
  function jwtExp(token){try{const p=String(token||'').split('.')[1];if(!p)return 0;const s=p.replace(/-/g,'+').replace(/_/g,'/'),pad=s+'='.repeat((4-s.length%4)%4);return Number(JSON.parse(atob(pad))?.exp)||0}catch{return 0}}
  function saveAuth(next){return M.store.saveAuth?.(next)??(()=>{try{localStorage.setItem(M.AUTH_KEY,JSON.stringify(next||{}));return true}catch{return false}})()}
  C.canRead=()=>{const cfg=config(),a=auth();return !!(text(cfg.supabaseUrl)&&text(cfg.supabaseAnonKey)&&text(org())&&(text(a.access_token)||text(a.refresh_token)));};
  C.sessionState=()=>{const a=auth(),exp=Number(a.expires_at)||jwtExp(a.access_token);return{hasAccess:!!a.access_token,hasRefresh:!!a.refresh_token,expiresAt:exp||0,expired:!!(exp&&exp<=Date.now()/1000),organisationId:org()};};
  // 27 Nov 2026 (Andy, 5:21 am: "Not sent to the cloud · 34 waiting"). He had changed his password on the PC, which
  // signs every other device out; the phone's renewal was refused ("Refresh Token Not Found") and every cloud call
  // retried it -- 30+ renewals a second until Supabase rate-limited the phone. One renewal at a time; a sign-in the
  // cloud has ended is remembered (no more tries until this phone signs in again) and said on screen; a rate limit
  // waits 30 s.
  C.signedOut=null;C._backoffUntil=0;C._inflight=null;
  C.isSignedOut=()=>{const a=auth();return !!(C.signedOut&&a.refresh_token&&C.signedOut.refresh===a.refresh_token)};
    async function ensureFreshOnce({force=false}={}){const cfg=config(),a=auth(),now=Math.floor(Date.now()/1000),exp=Number(a.expires_at)||jwtExp(a.access_token);if(!force&&a.access_token&&(!exp||exp>now+90)){C.authStatus={status:'ready',error:'',at:new Date().toISOString()};return a;}if(!cfg.supabaseUrl||!cfg.supabaseAnonKey)throw Object.assign(new Error('Cloud connection is not configured'),{code:'cloud_config'});if(!a.refresh_token){if(a.access_token&&!force&&!exp)return a;const e=Object.assign(new Error('PB/result connection needs sign-in'),{code:'auth_required'});C.authStatus={status:'error',error:e.message,at:new Date().toISOString()};throw e;}C.authStatus={status:'refreshing',error:'',at:new Date().toISOString()};try{const res=await fetch(`${String(cfg.supabaseUrl).replace(/\/$/,'')}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:cfg.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:a.refresh_token})});const body=await res.json().catch(()=>({}));if(!res.ok||!body?.access_token){const why=String(body?.error_code||body?.msg||body?.error_description||'');if(res.status===429)C._backoffUntil=Date.now()+30000;else if(res.status===400&&/refresh_token_not_found|session_not_found|session_expired|not found/i.test(why)){C.signedOut={refresh:a.refresh_token,at:new Date().toISOString(),why};try{M.freezeRecorder?.note?.('signed-out',{why})}catch{}try{M.cloud?.renderSyncWarn?.()}catch{}}const e=Object.assign(new Error(body?.msg||body?.message||`Sign-in refresh failed (${res.status})`),{status:res.status,code:'auth_refresh'});throw e;}const next={...a,...body,expires_at:body.expires_at||Math.floor(Date.now()/1000)+Number(body.expires_in||3600)};saveAuth(next);C.authStatus={status:'ready',error:'',at:new Date().toISOString()};return next;}catch(err){C.authStatus={status:'error',error:String(err?.message||err),at:new Date().toISOString()};throw err;}}
  C.ensureFresh=async(opts={})=>{const a=auth(),cfg=config(),now=Math.floor(Date.now()/1000),exp=Number(a.expires_at)||jwtExp(a.access_token);
    if(!opts.force&&a.access_token&&(!exp||exp>now+90))return ensureFreshOnce(opts);
    if(C.isSignedOut()){const e=Object.assign(new Error('Signed out on this device -- sign in again'),{code:'signed_out',status:401});C.authStatus={status:'error',error:e.message,at:new Date().toISOString()};throw e;}
    if(cfg.supabaseUrl&&a.refresh_token&&Date.now()<C._backoffUntil)throw Object.assign(new Error('Sign-in renewal is waiting (rate limit)'),{code:'auth_backoff'});
    if(C._inflight)return C._inflight;
    C._inflight=ensureFreshOnce(opts).finally(()=>{C._inflight=null});return C._inflight;};
  const authError=err=>Number(err?.status)===401||/jwt|token|auth|unauthor/i.test(String(err?.message||''));
  C.fetch=async(path,opts={})=>{await C.ensureFresh();try{return await M.cloud.fetch(path,opts)}catch(err){if(!authError(err))throw err;await C.ensureFresh({force:true});return M.cloud.fetch(path,opts);}};
  C.fetchPages=async(path,pageSize=1000,maxRows=8000)=>{const rows=[];for(let from=0;from<maxRows;from+=pageSize){const sep=path.includes('?')?'&':'?',page=await C.fetch(`${path}${sep}limit=${pageSize}&offset=${from}`);if(!Array.isArray(page))break;rows.push(...page);if(page.length<pageSize)break;}return rows;};
  C.status=()=>{if(C.authStatus.status==='error')return{status:'error',message:C.authStatus.error||'PB/result connection unavailable'};if(!C.canRead()){const s=C.sessionState();return{status:'unavailable',message:s.organisationId?'PB/result sign-in required':'PB/result organisation not selected'};}return{status:C.authStatus.status==='refreshing'?'loading':'ready',message:C.authStatus.status==='refreshing'?'Refreshing PB/result connection…':'PB/result connection ready'};};
})(globalThis);
