'use strict';
(function(g){
  const BUILD='v4-live-training-authority-20260910a-cloud-broadcast';
  function install(){
    const M=g.MSOS4,U=M?.util,L=M?.live;
    if(!M||!U||!L||M.liveTrainingAuthority?.build===BUILD)return false;
    const operationalViews=new Set(['board','roll','times','hub','connection','guardian','athletes']);
    const derivedViews=new Set(['tv','swimmer']);
    const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    const currentView=()=>String(M.state?.settings?.view||'board');
    const currentRole=()=>String(M.access?.role?.()||M.state?.settings?.activeRole||'owner');
    const sourceAuthority=()=>operationalViews.has(currentView())&&['owner','assistant'].includes(currentRole())?'coach-operational':'derived-display';
    // `timedSets` (10 Sept 2026, Phase 4 -- "proper TV live-times broadcast") is the actual live-timing
    // record: X.createLive/X.tap/X.saveLive on the coach's Times view saves one row per swimmer per finished
    // rep here (engines/board.js's TV view was reading nothing at all before this -- see the new
    // liveTimesPanel there). Scoped to the current session, same as attendance/adaptationOverrides just
    // below, rather than cloned whole like trainingTestResults already was -- there is no reason for a TV
    // showing tonight's session to receive every timed set from the whole season on every publish.
    L.payload=state=>{const sid=state?.settings?.selectedSessionId||'';return{kind:'v4-live-state',build:M.BUILD,from:L.instanceId,at:U.now(),authority:sourceAuthority(),sourceView:currentView(),sourceRole:currentRole(),surfaceMode:state?.settings?.surfaceMode||'training',sessionId:sid,session:sid?clone(state.canonicalSessions?.[sid]||null):null,attendance:clone((state.attendance||[]).filter(x=>!sid||x.session_id===sid)),adaptationOverrides:clone((state.adaptationOverrides||[]).filter(x=>!sid||x.sessionId===sid)),timedSets:clone((state.timedSets||[]).filter(x=>!sid||x.session_id===sid)),trainingTestResults:clone(state.trainingTestResults||[]),revision:Number(state?.settings?.liveRevision||0)}};
    L.apply=msg=>{
      if(!msg||msg.kind!=='v4-live-state'||msg.from===L.instanceId||msg.build!==M.BUILD)return false;
      const view=currentView();
      if(!derivedViews.has(view)){L.ignoredOperationalMessages=Number(L.ignoredOperationalMessages||0)+1;return false;}
      if(msg.authority!=='coach-operational'){L.ignoredDerivedMessages=Number(L.ignoredDerivedMessages||0)+1;return false;}
      if(msg.surfaceMode&&msg.surfaceMode!=='training'){L.ignoredMeetMessages=Number(L.ignoredMeetMessages||0)+1;return false;}
      // Pre-apply staleness guard. `revision` is a per-sender, strictly-increasing local counter
      // (bumped on every local save -- see Store.save), not a shared logical clock, so it is only
      // ever meaningful compared against the last revision actually applied FROM THAT SAME SENDER.
      // Without this, an out-of-order delivery (a frozen/backgrounded tab flushing a backlog, or any
      // future transport that isn't BroadcastChannel's same-origin FIFO guarantee) could apply an
      // older session/attendance snapshot over a newer one already showing on a TV/swimmer display,
      // then just ratchet the counter forward afterwards as if nothing had regressed.
      const lastBySender=L.lastAppliedRevisionBySender||(L.lastAppliedRevisionBySender={});
      const senderPrev=Number(lastBySender[msg.from]||0),incomingRevision=Number(msg.revision||0);
      if(incomingRevision<senderPrev){L.ignoredStaleMessages=Number(L.ignoredStaleMessages||0)+1;return false;}
      lastBySender[msg.from]=Math.max(senderPrev,incomingRevision);
      L.suppress=true;
      try{
        const role=M.state.settings.activeRole,aid=M.state.settings.activeUserAthleteId,assistantId=M.state.settings.assistantId;
        if(msg.session?.id)M.state.canonicalSessions[msg.session.id]=clone(msg.session);
        if(msg.sessionId){M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==msg.sessionId).concat(clone(msg.attendance||[]));M.state.adaptationOverrides=(M.state.adaptationOverrides||[]).filter(x=>x.sessionId!==msg.sessionId).concat(clone(msg.adaptationOverrides||[]));M.state.timedSets=(M.state.timedSets||[]).filter(x=>x.session_id!==msg.sessionId).concat(clone(msg.timedSets||[]));}
        if(Array.isArray(msg.trainingTestResults))M.state.trainingTestResults=clone(msg.trainingTestResults);
        M.state.settings.view=view;M.state.settings.activeRole=role;M.state.settings.activeUserAthleteId=aid;M.state.settings.assistantId=assistantId;
        if(msg.session?.id&&((view==='tv'&&role!=='swimmer')||(view==='swimmer'&&role==='swimmer'&&M.access?.sessionAllowed?.(msg.session))))M.state.settings.selectedSessionId=msg.session.id;
        M.state.settings.liveRevision=Math.max(Number(M.state.settings.liveRevision||0),Number(msg.revision||0));
        if(view==='tv')M.ui?.renderTV?.();else if(view==='swimmer')M.ui?.renderSwimmer?.();return true;
      }finally{L.suppress=false;}
    };
    // Real coaching failure this fixes (Andy's own words, 10 Sept 2026, Phase 4): everything above (L.payload/
    // L.apply) already works the instant the coach saves -- but only inside a `BroadcastChannel`, which is
    // same-browser-context only. A TV screen at poolside is a genuinely separate physical device from the
    // coach's phone, so it never received any of this. There is no realtime/websocket channel anywhere in
    // this codebase (confirmed repo-wide, see app.js's C.reconcileSession header comment), so this reuses the
    // same REST-poll pattern already proven for cross-device session sync (Phase 2) -- just a faster interval
    // suited to something branded "live" -- rather than inventing a new transport. L.publishCloud pushes the
    // exact same L.payload() this device already builds for BroadcastChannel into one shared row per session
    // (upserted, never appended -- see supabase/20260910_live_broadcast.sql); L.pullCloud fetches that row on
    // a TV device and feeds it straight back through the SAME L.apply() above, so the cross-device path gets
    // the exact same authority/staleness/gating guarantees as the same-tab path for free, rather than a
    // second, subtly different "should I trust this" implementation.
    L.publishCloud=state=>{
      if(sourceAuthority()!=='coach-operational')return false;
      if(!M.cloud?.ready?.()||!M.state?.settings?.cloudWritesEnabled||!M.release?.canWrite?.())return false;
      const sid=state?.settings?.selectedSessionId;if(!sid)return false;
      const now=Date.now();if(now-Number(L.lastCloudPublish||0)<L.CLOUD_PUBLISH_THROTTLE_MS)return false;
      L.lastCloudPublish=now;
      const payload=L.payload(state);
      M.cloud.fetch(`/rest/v1/live_broadcast?on_conflict=organisation_id,session_id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({organisation_id:M.cloud.org(),session_id:sid,payload,revision:payload.revision,from_instance:payload.from,updated_at:U.now()})}).catch(()=>{});
      return true;
    };
    L.pullCloud=async()=>{
      if(!M.cloud?.ready?.())return null;
      const sid=M.state?.settings?.selectedSessionId;if(!sid)return null;
      const org=encodeURIComponent(M.cloud.org()),sidEnc=encodeURIComponent(sid);
      let rows;try{rows=await M.cloud.fetch(`/rest/v1/live_broadcast?select=payload,from_instance&organisation_id=eq.${org}&session_id=eq.${sidEnc}&limit=1`)}catch{return null;}
      const row=Array.isArray(rows)?rows[0]:null;
      if(!row?.payload||row.from_instance===L.instanceId)return null;
      return L.apply(row.payload);
    };
    L.CLOUD_PUBLISH_THROTTLE_MS=Number.isFinite(L.CLOUD_PUBLISH_THROTTLE_MS)?L.CLOUD_PUBLISH_THROTTLE_MS:3000;
    // Deliberately scoped to view==='tv' only (not 'swimmer' -- that view already has its own separate sync
    // path via pullSessionAdaptations, and Andy specifically asked for "proper TV live-times broadcast", not
    // a broader change to swimmer sync). A solo coach device that never opens a TV view pays nothing beyond
    // one cheap view-check every 4s.
    // .unref() (Node-only; a no-op optional-chain in a browser, where setInterval returns a plain numeric id
    // with no such method) stops this timer from ever keeping a plain Node process alive on its own -- without
    // it, any test harness that loads this file with a real `require()` into actual Node globals (rather than
    // this app's normal browser environment, or a vm-sandboxed test) would hang forever after its own test
    // logic finished, since Node will not exit while an un-refed... i.e. a REFERENCED timer is still pending.
    // Caught exactly this way: tests/v4-guardian.test.js requires this file directly into real Node globals.
    if(!L._cloudPollTimer){L._cloudPollTimer=setInterval(()=>{if(currentView()==='tv')L.pullCloud().catch(()=>{})},4000);L._cloudPollTimer?.unref?.();}
    M.liveTrainingAuthority={build:BUILD,operationalViews:[...operationalViews],derivedViews:[...derivedViews],mode:'derived-displays-only'};return true;
  }
  if(!install()&&typeof document!=='undefined')document.addEventListener('DOMContentLoaded',install,{once:true});
})(globalThis);
