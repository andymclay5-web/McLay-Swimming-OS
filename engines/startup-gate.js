'use strict';
(function(g){
  const M=g.MSOS4,UI=M?.ui,S=M?.storageEngine;if(!M||!UI?.renderCurrent||!S?.readyPromise)return;
  const G=M.startupGate={build:'v4-startup-gate-20260907-stability'},base=UI.renderCurrent.bind(UI);let released=!!S.ready,pending=false;
  const text=v=>String(v??'').trim();
  const raf=fn=>typeof g.requestAnimationFrame==='function'?g.requestAnimationFrame(fn):setTimeout(fn,0);

  function nzNowKey(value=new Date()){
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return value;
    const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value),p={};
    for(const x of parts)if(x.type!=='literal')p[x.type]=x.value;
    return`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function sessionStartKey(session){
    const i=session?.identity||{},date=text(i.date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return'';
    const raw=text(i.start||i.start_time||i.startTime),m=raw.match(/^(\d{1,2}):([0-5]\d)/);let time='';
    if(m){const h=Number(m[1]);if(h>=0&&h<=23)time=`${String(h).padStart(2,'0')}:${m[2]}`;}
    if(!time)time=/\bPM\b/i.test(text(i.dayPart||i.day_part))?'12:00':'00:00';
    return`${date}T${time}`;
  }
  function hasWorkout(session){
    if(Number(session?.metadata?.parsedTotal)>0)return true;
    if((session?.blocks||[]).some(block=>(block?.items||[]).length>0))return true;
    return !!text(session?.currentSource?.text||session?.originalPlan?.text||session?.workout||session?.source);
  }
  function latestStartedSession(now=new Date(),sessions=Object.values(M.state?.canonicalSessions||{})){
    const nowKey=nzNowKey(now),rows=(sessions||[]).map(session=>({session,key:sessionStartKey(session)})).filter(x=>x.key&&x.key<=nowKey&&hasWorkout(x.session)).sort((a,b)=>b.key.localeCompare(a.key)||String(b.session?.updatedAt||b.session?.updated_at||'').localeCompare(String(a.session?.updatedAt||a.session?.updated_at||''))||String(b.session?.id||'').localeCompare(String(a.session?.id||'')));
    if(!rows.length)return null;const topKey=rows[0].key,selected=M.state?.settings?.selectedSessionId||'',keep=rows.find(x=>x.key===topKey&&x.session?.id===selected);return keep?.session||rows[0].session;
  }
  function selectLatestStarted(now=new Date()){
    const best=latestStartedSession(now);if(!best?.id)return null;
    M.state.settings=M.state.settings||{};const before=M.state.settings.selectedSessionId||'';
    if(before!==best.id){M.state.settings.selectedSessionId=best.id;S.saveUi?.(M.state);}
    G.startupSelection={before,after:best.id,key:sessionStartKey(best),changed:before!==best.id,at:new Date().toISOString()};
    return best;
  }

  function loading(){const h=document.querySelector('#boardView');if(h&&!h.innerHTML.trim())h.innerHTML='<section class="empty-card"><h2>Loading saved session…</h2></section>';}
  function clearTransient(){M.state.settings=M.state.settings||{};if(G.transientsCleared)return;M.state.settings.boardExpandedTargetId='';M.state.settings.expandedItemId='';G.transientsCleared=true;S.saveUi?.(M.state);}
  UI.renderCurrent=(...args)=>{if(!released&&!S.ready){pending=true;loading();return;}released=true;clearTransient();G.rendered=true;return base(...args);};

  function operationalView(){return['board','roll','times'].includes(String(M.state?.settings?.view||'board'));}
  function scheduleDeferredEvidence(run){
    let finished=false,attempts=0,timer=0,idle=0;
    const cleanup=()=>{if(timer)clearTimeout(timer);if(idle&&typeof g.cancelIdleCallback==='function')g.cancelIdleCallback(idle);document.removeEventListener?.('visibilitychange',onVisibility);};
    const execute=async()=>{if(finished)return G.deferredEvidenceResult||null;finished=true;cleanup();G.deferredEvidenceStartedAt=Date.now();try{G.deferredEvidenceResult=await run();G.deferredEvidenceFinishedAt=Date.now();return G.deferredEvidenceResult}catch(e){G.deferredEvidenceError=String(e?.message||e);return null;}};
    const attempt=()=>{idle=0;if(finished)return;if(document.hidden||!operationalView())return void execute();attempts++;if(attempts<6)timer=setTimeout(queue,5000);};
    const queue=()=>{timer=0;if(finished)return;if(typeof g.requestIdleCallback==='function')idle=g.requestIdleCallback(attempt);else timer=setTimeout(attempt,1500);};
    const onVisibility=()=>{if(document.hidden)execute();};
    document.addEventListener?.('visibilitychange',onVisibility,{passive:true});
    G.runDeferredEvidenceNow=execute;G.deferredEvidenceAttempts=()=>attempts;queue();
    return{execute,cancel:cleanup};
  }
  let startupWindowOpen=true;
  if(document.readyState==='loading')document.addEventListener?.('DOMContentLoaded',()=>setTimeout(()=>{startupWindowOpen=false;},0),{once:true});else startupWindowOpen=false;
  function installCloudEvidenceDeferral(){
    const C=M.cloud;if(!C?.pullEvidence||G.cloudEvidenceDeferralInstalled)return false;
    const pull=C.pullEvidence.bind(C),apply=typeof C.applyEvidence==='function'?C.applyEvidence.bind(C):null;let first=true;
    C.pullEvidence=(...args)=>{
      if(!first||!startupWindowOpen)return pull(...args);first=false;G.bootEvidenceDeferred=true;
      scheduleDeferredEvidence(async()=>{const payload=await pull(...args);if(apply)apply(payload);M.state._evidenceBridge={...(M.state._evidenceBridge||{}),contentRevision:Number(M.state?._evidenceBridge?.contentRevision||0)+1,hydratedAt:new Date().toISOString(),reason:'deferred-cloud-evidence'};g.MSOSEvidenceIndex?.invalidate?.(M.state);g.MSOSEngines?.Coordinator?.clearCache?.();M.performanceEngine?.invalidate?.(M.state);M.waPointsEngine?.invalidate?.();return payload;});
      return Promise.resolve({tables:{},deferredByStartupGate:true});
    };
    if(apply)C.applyEvidence=payload=>payload?.deferredByStartupGate?M.state:apply(payload);
    G.cloudEvidenceDeferralInstalled=true;return true;
  }

  installCloudEvidenceDeferral();
  S.readyPromise.finally(()=>{released=true;clearTransient();selectLatestStarted();const selectionChanged=G.startupSelection?.changed===true;raf(()=>{if(!G.rendered||selectionChanged)UI.renderCurrent();M.nav?.activateView?.(M.state?.settings?.view||'board');});pending=false;});
  G.pending=()=>pending;G.ready=()=>released;G.nzNowKey=nzNowKey;G.sessionStartKey=sessionStartKey;G.hasWorkout=hasWorkout;G.latestStartedSession=latestStartedSession;G.selectLatestStarted=selectLatestStarted;G.installCloudEvidenceDeferral=installCloudEvidenceDeferral;
})(globalThis);
