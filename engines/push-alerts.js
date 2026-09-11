'use strict';
// Phase 5 (10 Sept 2026) -- "remote/off-site monitoring and interaction for Andy," the "add alerts, not
// just a view" option. Real coaching failure this fixes: Andy is moving into real estate and needs to be
// off the pool deck sometimes while still knowing when something needs him -- starting concretely with
// Jordan proposing a stroke change that engines/modification-edit.js's evidence gate (Phase 3) held back
// for owner review. Before this, the only way Andy would ever see that was reopening that exact
// swimmer's editor, or noticing the small red ⚑ on the Board -- nothing told him if he wasn't looking.
//
// This engine owns exactly two things: subscribing/unsubscribing THIS device to real browser Web Push
// (RFC 8030 + VAPID -- no third-party notification service, no SMS/email), and sendCoachAlert(), the one
// call site that asks the server to record an alert and fan it out. It deliberately does NOT decide WHEN
// to alert -- that stays with whichever engine owns the real event (modification-edit.js's save(), for
// the stroke-proposal case). See supabase/functions/send-coach-alert and
// supabase/20260910_remote_alerts.sql for the server side: the Edge Function is called authenticated as
// the real signed-in user (M.cloud.fetch already attaches the access token), which is deliberately the
// ONLY access control it needs -- no separate webhook secret, no database trigger.
//
// Subscribing is entirely best-effort and must never block or throw into a caller that isn't expecting
// it: an unsupported browser, a denied permission, or no network is all just "alerts unavailable on this
// device," never an app error.
(function(g){
  const M=g.MSOS4,U=M?.util;if(!M?.state||!M?.store||!M?.cloud)return;
  const P=M.pushAlerts={build:'v4-push-alerts-20260910'};
  // Public VAPID key only -- the private key never leaves the server (supabase/20260910_remote_alerts.sql's
  // app_secrets table, read only by the Edge Function's own service-role client). A VAPID public key is
  // meant to be public; it identifies this app to the push service, it does not authenticate anything.
  const VAPID_PUBLIC_KEY='BHXSLZH-6-Fhwqa0tCOPFvT8kIpfdcFxAzOfCaHLJYzuRZ9cV1OmN2KcSSFKtx288LLsbkn-Ws_G3fXtT7rt1V0';

  function urlBase64ToUint8Array(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=g.atob?g.atob(base64):Buffer.from(base64,'base64').toString('binary');
    const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }

  P.supported=()=>!!(g.navigator?.serviceWorker&&g.PushManager&&g.Notification);
  P.permission=()=>P.supported()?g.Notification.permission:'unsupported';
  // Cached, not re-derived from the live PushManager subscription on every render -- this is a status
  // LABEL for the Connection screen, and a stale "on" label for a few minutes if the browser silently
  // drops a subscription is a far smaller problem than adding a slow async permission probe to a render
  // path that already runs synchronously everywhere else in this app.
  P.enabledOnThisDevice=()=>!!M.state.settings.pushAlertsEnabled;

  // Fire-and-forget by design (see the header note): every failure path here resolves to false/null
  // rather than throwing, so a caller like the Connection screen's button handler can show a plain
  // message without a try/catch of its own, and so a future automatic call site (there isn't one yet)
  // could never crash something else by calling this.
  P.enable=async()=>{
    if(!P.supported())throw new Error('This browser does not support push notifications.');
    if(!M.cloud.ready())throw new Error('Sign in and connect to the cloud first.');
    const perm=await g.Notification.requestPermission();
    if(perm!=='granted')throw new Error('Notification permission was not granted.');
    const reg=await g.navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
    const json=sub.toJSON();
    const row={organisation_id:M.cloud.org(),user_id:M.cloud.user(),endpoint:json.endpoint,p256dh:json.keys?.p256dh||'',auth_key:json.keys?.auth||'',device_label:(g.navigator.userAgent||'').slice(0,120)};
    if(!row.organisation_id||!row.user_id)throw new Error('Organisation or account not loaded on this device yet.');
    await M.cloud.fetch('/rest/v1/push_subscriptions?on_conflict=endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
    M.state.settings.pushAlertsEnabled=true;
    M.store.save(M.state);
    return true;
  };
  P.disable=async()=>{
    M.state.settings.pushAlertsEnabled=false;
    M.store.save(M.state);
    if(!P.supported())return true;
    try{
      const reg=await g.navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(sub){
        const endpoint=sub.endpoint;
        await sub.unsubscribe().catch(()=>{});
        if(M.cloud.ready()&&endpoint)await M.cloud.fetch(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,{method:'DELETE'}).catch(()=>{});
      }
    }catch{/* best-effort */}
    return true;
  };

  // The one call site every "Andy needs to see this" event goes through. Deliberately never awaited by
  // its callers for anything but the durable coach_alerts insert -- push fan-out failures inside the Edge
  // Function are already swallowed server-side (see send-coach-alert's own comment), and a caller like
  // modification-edit.js's save() must never let an alert failure block or delay the actual save the
  // coach is waiting on.
  P.sendCoachAlert=async({sessionId=null,athleteId=null,kind,title,body}={})=>{
    if(!M.cloud.ready())return null;
    const org=M.cloud.org();if(!org)return null;
    if(!kind||!title||!body)throw new Error('sendCoachAlert requires kind, title and body.');
    return M.cloud.fetch('/functions/v1/send-coach-alert',{method:'POST',body:JSON.stringify({organisation_id:org,session_id:sessionId,athlete_id:athleteId,kind,title,body})});
  };
})(globalThis);
