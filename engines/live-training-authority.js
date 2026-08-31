'use strict';
(function(g){
  const BUILD='v4-live-training-authority-20260901b';
  const SEP1_SOURCE=`WARM UP

400 Choice

8 x 50
4 Kick
4 Drill
10 sec Rest

4 x 100 IM
Descend 1-4
10 sec Rest

PRE-SET

12 x 50 @ 1:15

3 Rounds:
1 Build
1 Middle 20m MAX
1 First 15m MAX
1 Easy

MAIN SET

5 Rounds:

200 Overload
10 sec Rest

100 Threshold
10 sec Rest

POST-SET

8 x 75 Pull @ 1:30
Descend 1-4

8 x 25 Underwater with Fins @ 0:45

WARM DOWN

200 Easy`;
  function install(){
    const M=g.MSOS4,U=M?.util,L=M?.live;
    if(!M||!U||!L||M.liveTrainingAuthority?.build===BUILD)return false;
    const operationalViews=new Set(['board','roll','times','hub','connection','guardian','athletes']);
    const derivedViews=new Set(['tv','swimmer']);
    const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    const currentView=()=>String(M.state?.settings?.view||'board');
    const currentRole=()=>String(M.access?.role?.()||M.state?.settings?.activeRole||'owner');
    const sourceAuthority=()=>operationalViews.has(currentView())&&['owner','assistant'].includes(currentRole())?'coach-operational':'derived-display';
    const total=s=>Number(M.session?.total?.(s)||0);
    function intentionallyRemovedThreshold(s){return (s?.changes||[]).some(c=>/remove/i.test(String(c?.type||''))&&/100\s+Threshold/i.test(JSON.stringify(c?.before||c?.meta||'')));}
    function repairSep1Session(){
      const sid=M.state?.settings?.selectedSessionId,s=sid&&M.state?.canonicalSessions?.[sid];if(!s)return false;
      const date=String(s.identity?.date||''),part=String(s.identity?.dayPart||s.identity?.day_part||'').toUpperCase();
      if(date!=='2026-09-01'||(part&&part!=='AM')||total(s)!==3800||intentionallyRemovedThreshold(s))return false;
      const hasMain=(s.blocks||[]).some(b=>String(b.type||'')==='main_set'&&Number(M.session?.blockDistance?.(b)||0)===1000);if(!hasMain)return false;
      let parsed;try{parsed=M.parser?.parse?.(SEP1_SOURCE,{...(s.identity||{}),id:s.id});}catch{return false}if(!parsed||total(parsed)!==4300)return false;
      const main=(parsed.blocks||[]).find(b=>b.type==='main_set');if(Number(M.session?.blockDistance?.(main)||0)!==1500)return false;
      try{M.session?.reconcileIds?.(s,parsed)}catch{}
      parsed.originalPlan=s.originalPlan||parsed.originalPlan;parsed.originalSource=s.originalSource||parsed.originalSource;parsed.changes=[...(s.changes||[])];parsed.finish=s.finish||null;parsed.metadata={...(s.metadata||{}),...(parsed.metadata||{}),recoveredSep1TrainingTruth:true,recoveredSep1TrainingTruthAt:U.now(),recoveredFromTotal:3800};parsed.updatedAt=U.now();
      M.state.canonicalSessions[s.id]=parsed;M.state.settings.selectedSessionId=s.id;M.store?.save?.(M.state);return true;
    }
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
    if(typeof document!=='undefined'&&!document.getElementById('msos-training-surface-isolation')){const style=document.createElement('style');style.id='msos-training-surface-isolation';style.textContent='body:not([data-msos-view="meet"]) #meetModeBtn,body:not([data-msos-view="meet"]) .bottom-nav [data-nav="meet"],body:not([data-msos-view="meet"]) #meetView{display:none!important}.view:not(.active){display:none!important}';document.head?.appendChild(style);}
    const baseConfigure=M.ui?.configureRoleChrome?.bind(M.ui);if(baseConfigure)M.ui.configureRoleChrome=()=>{const x=baseConfigure();document.body.dataset.msosView=M.state?.settings?.view||'board';return x};
    const afterReady=()=>{try{if(repairSep1Session())M.ui?.renderCurrent?.()}catch{}};if(M.storageEngine?.readyPromise)M.storageEngine.readyPromise.finally(()=>setTimeout(afterReady,0));else setTimeout(afterReady,0);
    M.liveTrainingAuthority={build:BUILD,operationalViews:[...operationalViews],derivedViews:[...derivedViews],repairSep1Session};return true;
  }
  if(!install()&&typeof document!=='undefined')document.addEventListener('DOMContentLoaded',install,{once:true});
})(globalThis);
