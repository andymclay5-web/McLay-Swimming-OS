'use strict';
(function(g){
  const BUILD='v4-live-training-authority-20260901c-root';
  function install(){
    const M=g.MSOS4,U=M?.util,L=M?.live;
    if(!M||!U||!L||M.liveTrainingAuthority?.build===BUILD)return false;
    const operationalViews=new Set(['board','roll','times','hub','connection','guardian','athletes']);
    const derivedViews=new Set(['tv','swimmer']);
    const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    const currentView=()=>String(M.state?.settings?.view||'board');
    const currentRole=()=>String(M.access?.role?.()||M.state?.settings?.activeRole||'owner');
    const sourceAuthority=()=>operationalViews.has(currentView())&&['owner','assistant'].includes(currentRole())?'coach-operational':'derived-display';
    L.payload=state=>{const sid=state?.settings?.selectedSessionId||'';return{kind:'v4-live-state',build:M.BUILD,from:L.instanceId,at:U.now(),authority:sourceAuthority(),sourceView:currentView(),sourceRole:currentRole(),surfaceMode:state?.settings?.surfaceMode||'training',sessionId:sid,session:sid?clone(state.canonicalSessions?.[sid]||null):null,attendance:clone((state.attendance||[]).filter(x=>!sid||x.session_id===sid)),adaptationOverrides:clone((state.adaptationOverrides||[]).filter(x=>!sid||x.sessionId===sid)),trainingTestResults:clone(state.trainingTestResults||[]),revision:Number(state?.settings?.liveRevision||0)}};
    L.apply=msg=>{
      if(!msg||msg.kind!=='v4-live-state'||msg.from===L.instanceId||msg.build!==M.BUILD)return false;
      const view=currentView();
      if(!derivedViews.has(view)){L.ignoredOperationalMessages=Number(L.ignoredOperationalMessages||0)+1;return false;}
      if(msg.authority!=='coach-operational'){L.ignoredDerivedMessages=Number(L.ignoredDerivedMessages||0)+1;return false;}
      if(msg.surfaceMode&&msg.surfaceMode!=='training'){L.ignoredMeetMessages=Number(L.ignoredMeetMessages||0)+1;return false;}
      L.suppress=true;
      try{
        const role=M.state.settings.activeRole,aid=M.state.settings.activeUserAthleteId,assistantId=M.state.settings.assistantId;
        if(msg.session?.id)M.state.canonicalSessions[msg.session.id]=clone(msg.session);
        if(msg.sessionId){M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==msg.sessionId).concat(clone(msg.attendance||[]));M.state.adaptationOverrides=(M.state.adaptationOverrides||[]).filter(x=>x.sessionId!==msg.sessionId).concat(clone(msg.adaptationOverrides||[]));}
        if(Array.isArray(msg.trainingTestResults))M.state.trainingTestResults=clone(msg.trainingTestResults);
        M.state.settings.view=view;M.state.settings.activeRole=role;M.state.settings.activeUserAthleteId=aid;M.state.settings.assistantId=assistantId;
        if(msg.session?.id&&((view==='tv'&&role!=='swimmer')||(view==='swimmer'&&role==='swimmer'&&M.access?.sessionAllowed?.(msg.session))))M.state.settings.selectedSessionId=msg.session.id;
        M.state.settings.liveRevision=Math.max(Number(M.state.settings.liveRevision||0),Number(msg.revision||0));
        if(view==='tv')M.ui?.renderTV?.();else if(view==='swimmer')M.ui?.renderSwimmer?.();return true;
      }finally{L.suppress=false;}
    };
    M.liveTrainingAuthority={build:BUILD,operationalViews:[...operationalViews],derivedViews:[...derivedViews],mode:'derived-displays-only'};return true;
  }
  if(!install()&&typeof document!=='undefined')document.addEventListener('DOMContentLoaded',install,{once:true});
})(globalThis);
