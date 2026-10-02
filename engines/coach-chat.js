'use strict';
// 2 Oct 2026 (Andy, verbatim): "a chat thing within the app where we can communicate to the whole group.
// The assistant coaches communicate to each other or me. A kind of a Slack style communication or
// messenger style communication within there." Given the choice between true realtime (Supabase Realtime)
// and simple polling, Andy chose realtime for the Slack-like instant feel.
//
// New Supabase table coach_messages (2 Oct 2026 migration, applied directly -- apply_migration/create_branch
// both timed out repeatedly in this sandbox, so this went through execute_sql instead, with a manual
// supabase_migrations.schema_migrations tracking row where the sandbox's own "modify shared resources" guard
// allowed it): one whole-group channel (recipient_id null, visible to every coach in the organisation) plus
// direct messages between any two coaches (recipient_id set, visible only to the sender and that recipient).
// RLS reuses the existing is_org_member() function already proven by coach_alerts/live_broadcast, rather than
// inventing a new membership check. A new mclay_chat_roster RPC (also applied this session) gives any active
// coach -- owner OR assistant -- the roster for picking a DM recipient; the existing mclay_coach_access_roster
// stays owner-only on purpose (it also carries invite tokens/permission detail), so chat could not reuse it.
//
// Delivery: Supabase Realtime via the official @supabase/supabase-js UMD build, the ONE external script this
// whole offline-first, zero-dependency codebase loads. IMPORTANT, found the hard way during this session's
// own regression sweep: that script must NEVER be a static <script> tag in index.html. A first attempt did
// exactly that, and in this sandbox (whose own egress proxy denies the CDN host) it measurably delayed/broke
// unrelated page-load-time tests across the app -- a failed/slow deferred script delays DOMContentLoaded for
// EVERYTHING after it in document order, not just chat. Given Andy's own stated connectivity reality ("if
// we're in a swimming pool where the internet connection's dodgy at best... wi-fi access is poor at best so
// mobile data and then mobile data crashing because of the concrete"), a flaky CDN host could have done the
// same to his real app boot, not just this sandbox's tests. Fixed by loading the script dynamically, lazily,
// only from inside K.connect() below (see loadRealtimeScript()) -- completely decoupled from app boot/
// DOMContentLoaded, with its own load/error/timeout race -- so chat's own realtime path can be exactly as
// slow or broken as the CDN host, without that ever touching anything else in the app. If that script fails
// to load, the socket can't connect, or it drops and can't reconnect, this engine transparently falls back
// to polling every ~8s -- the other option Andy was offered -- so a chat feature failure never means a
// broken chat feature, just a slower one. Known, stated limitation: this sandbox has only ONE real signed-in
// coach account (Andy's own) to test against, so true cross-device "does it actually feel instant" delivery
// could not be verified end to end here -- that needs a second real account (Jordan's, once he completes
// onboarding) or two of Andy's own devices.
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.store)return;
  const BUILD='v4-coach-chat-20261002';
  const K=M.coachChat={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const POLL_MS=8000;
  const HISTORY_LIMIT=200;

  function cfg(){return M.store.config()||{};}
  function authed(){return M.store.auth()||null;}
  function myId(){return authed()?.user?.id||null;}
  function fetcher(){return M.cloudSessionEngine?.fetch||M.cloud?.fetch||null;}
  function org(){return M.cloud?.org?.()||M.state?.settings?.organisationId||'';}

  function dmThreadKey(otherId){return `dm:${otherId}`;}
  const GROUP_KEY='group';

  // In-memory, per-boot caches (not persisted -- message history always comes from the server, which is the
  // single source of truth; nothing here needs to survive a reload any more than any other live view does).
  const threads={}; // key -> array of messages, newest last
  const lastSeenAt={}; // key -> ISO timestamp of the newest message this device has actually displayed
  const listeners=new Set(); // fn(key, messages) -- called whenever a thread's content changes
  function notify(key){const msgs=threads[key]||[];for(const fn of listeners)try{fn(key,msgs);}catch{/* a bad listener must never break delivery for the others */}}
  K.onUpdate=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};

  function mergeMessages(key,rows){
    if(!Array.isArray(rows)||!rows.length)return false;
    const existing=threads[key]=threads[key]||[];
    const seen=new Set(existing.map(m=>m.id));
    let added=false;
    for(const row of rows){if(row?.id&&!seen.has(row.id)){existing.push(row);seen.add(row.id);added=true;}}
    if(added)existing.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    return added;
  }

  function restFilterFor(key){
    const o=org();if(!o)return null;
    if(key===GROUP_KEY)return `organisation_id=eq.${encodeURIComponent(o)}&recipient_id=is.null`;
    const other=key.startsWith('dm:')?key.slice(3):null;const me=myId();
    if(!other||!me)return null;
    return `organisation_id=eq.${encodeURIComponent(o)}&or=(and(sender_id.eq.${encodeURIComponent(me)},recipient_id.eq.${encodeURIComponent(other)}),and(sender_id.eq.${encodeURIComponent(other)},recipient_id.eq.${encodeURIComponent(me)}))`;
  }

  K.history=async key=>{
    const f=fetcher(),filter=restFilterFor(key);
    if(!f||!filter)return threads[key]||[];
    const rows=await f(`/rest/v1/coach_messages?${filter}&order=created_at.asc&limit=${HISTORY_LIMIT}`,{method:'GET'});
    if(mergeMessages(key,rows))notify(key);
    return threads[key]||[];
  };

  K.send=async(key,body)=>{
    const o=org(),me=myId(),f=fetcher();
    body=text(body);
    if(!o)throw new Error('Organisation not loaded on this device yet.');
    if(!me)throw new Error('Sign in before sending a message.');
    if(!f)throw new Error('Cloud connection is not available on this device.');
    if(!body)throw new Error('Nothing to send.');
    const actor=M.teamAccess?.actor?.()||{role:'owner',name:''};
    const other=key.startsWith('dm:')?key.slice(3):null;
    const payload={organisation_id:o,sender_id:me,sender_name:actor.name||'',sender_role:actor.role||'',recipient_id:other||null,recipient_name:other?(K.roster().find(r=>r.user_id===other)?.display_name||''):'',body};
    const rows=await f('/rest/v1/coach_messages',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    const saved=Array.isArray(rows)?rows[0]:rows;
    if(saved&&mergeMessages(key,[saved]))notify(key);
    return saved;
  };

  // Roster for the DM picker -- any active coach, via the new non-owner-gated RPC (NOT
  // T.listRoster()/mclay_coach_access_roster, which is deliberately owner-only and also exposes invite
  // tokens/permission detail that chat has no business showing).
  let rosterCache=[];
  K.roster=()=>rosterCache;
  K.refreshRoster=async()=>{
    const f=fetcher(),o=org();if(!f||!o)return rosterCache;
    const rows=await f('/rest/v1/rpc/mclay_chat_roster',{method:'POST',body:JSON.stringify({target_org:o})});
    const me=myId();
    rosterCache=(Array.isArray(rows)?rows:[]).filter(r=>r.user_id&&r.user_id!==me).map(r=>({user_id:r.user_id,display_name:text(r.display_name)||text(r.email)||'Coach',role:r.role||''}));
    return rosterCache;
  };

  K.markSeen=key=>{const msgs=threads[key]||[];const last=msgs[msgs.length-1];if(last)lastSeenAt[key]=last.created_at;};
  K.unreadCount=key=>{const msgs=threads[key]||[];const since=lastSeenAt[key];if(!since)return msgs.filter(m=>m.sender_id!==myId()).length;return msgs.filter(m=>m.sender_id!==myId()&&String(m.created_at)>since).length;};
  K.totalUnread=()=>{let n=0;n+=K.unreadCount(GROUP_KEY);for(const r of rosterCache)n+=K.unreadCount(dmThreadKey(r.user_id));return n;};
  K.dmThreadKey=dmThreadKey;K.GROUP_KEY=GROUP_KEY;
  K._snapshot=key=>(threads[key]||[]).slice();

  function keyForIncoming(row){
    const me=myId();
    if(!row)return null;
    if(row.recipient_id==null)return GROUP_KEY;
    if(row.sender_id===me)return dmThreadKey(row.recipient_id);
    if(row.recipient_id===me)return dmThreadKey(row.sender_id);
    return null; // not for us -- RLS should never actually deliver this, but never trust the network blindly
  }
  function ingest(row){const key=keyForIncoming(row);if(!key)return;if(mergeMessages(key,[row]))notify(key);}
  K._ingestForTest=ingest; // exercised directly by tests -- both the realtime callback and the poll loop fit this one path

  // --- Realtime (preferred) with a transparent polling fallback (never a hard failure mode). ---
  let realtimeClient=null,realtimeChannel=null,realtimeStatus='idle',pollTimer=null;
  K.realtimeStatus=()=>realtimeStatus;

  function startPolling(){
    if(pollTimer)return;
    pollTimer=setInterval(()=>{
      const o=org();if(!o)return;
      K.history(GROUP_KEY).catch(()=>{});
      for(const r of rosterCache)K.history(dmThreadKey(r.user_id)).catch(()=>{});
    },POLL_MS);
  }
  function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

  // Lazily, asynchronously loads the Supabase Realtime script -- NEVER a static tag in index.html (see the
  // header comment above for why that broke unrelated tests in this sandbox and could just as easily break
  // real app boot on Andy's own flaky poolside connection). Resolves true once window.supabase is usable,
  // false if it errors or simply never finishes within the timeout -- either way K.connect() below falls
  // back to polling rather than waiting on it.
  const REALTIME_SRC='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  let realtimeScriptPromise=null;
  function loadRealtimeScript(){
    if(g.supabase?.createClient)return Promise.resolve(true);
    if(realtimeScriptPromise)return realtimeScriptPromise;
    realtimeScriptPromise=new Promise(resolve=>{
      let done=false;
      const finish=ok=>{if(done)return;done=true;resolve(ok);};
      try{
        let s=g.document?.querySelector?.('script[data-coach-chat-realtime]');
        if(!s){
          s=g.document.createElement('script');
          s.src=REALTIME_SRC;s.async=true;s.dataset.coachChatRealtime='1';
          s.addEventListener('load',()=>finish(!!g.supabase?.createClient));
          s.addEventListener('error',()=>finish(false));
          g.document.head.appendChild(s);
        }else{
          s.addEventListener('load',()=>finish(!!g.supabase?.createClient));
          s.addEventListener('error',()=>finish(false));
        }
      }catch{finish(false);}
      // A slow or blocked CDN must never leave chat waiting indefinitely -- same "never silently stuck"
      // discipline as the post-subscribe 6s fallback a few lines down.
      setTimeout(()=>finish(!!g.supabase?.createClient),5000);
    });
    return realtimeScriptPromise;
  }

  K.connect=async()=>{
    const o=org(),a=authed();
    if(!o||!a?.access_token){realtimeStatus='idle';return;}
    await K.refreshRoster().catch(()=>{});
    await K.history(GROUP_KEY).catch(()=>{});
    for(const r of rosterCache)await K.history(dmThreadKey(r.user_id)).catch(()=>{});
    const scriptReady=await loadRealtimeScript().catch(()=>false);
    if(!scriptReady||!g.supabase?.createClient){realtimeStatus='polling-only';startPolling();return;}
    try{
      const c=cfg();
      if(!realtimeClient)realtimeClient=g.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);
      realtimeClient.realtime.setAuth(a.access_token);
      realtimeChannel?.unsubscribe?.();
      realtimeChannel=realtimeClient.channel(`coach-messages-${o}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'coach_messages',filter:`organisation_id=eq.${o}`},payload=>{ingest(payload?.new);}).subscribe(status=>{
        if(status==='SUBSCRIBED'){realtimeStatus='realtime';stopPolling();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){realtimeStatus='polling-fallback';startPolling();}
      });
      // If the socket never actually reaches SUBSCRIBED within a reasonable window, don't leave the coach
      // with a chat that silently never updates -- fall back to polling until/unless it does connect.
      setTimeout(()=>{if(realtimeStatus!=='realtime'){realtimeStatus='polling-fallback';startPolling();}},6000);
    }catch{realtimeStatus='polling-fallback';startPolling();}
  };
  K.disconnect=()=>{stopPolling();try{realtimeChannel?.unsubscribe?.();}catch{}realtimeChannel=null;realtimeStatus='idle';};
})(globalThis);
