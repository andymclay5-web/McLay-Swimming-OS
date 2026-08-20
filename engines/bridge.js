'use strict';
(function(g){const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Evidence||!E?.Aerobic||!E?.RacePace||!E?.Modification||!E?.Coordinator)throw new Error('MSOS engine bridge dependencies missing');
  const B={build:'v4-engine-silos-20260820p',hydrated:false,hydrating:null};M.engineBridge=B;M.BUILD=B.build;M.CORE='20260820-engine-silos-p';
  M.targets.t400=(ath,state=M.state,_course='',stroke='Freestyle')=>E.Aerobic.t400(ath,state,stroke);
  M.targets.pb=(ath,state=M.state,spec={})=>E.RacePace.pb(ath,state,spec);
  M.targets.forItem=(session,item,ath,state=M.state)=>E.Coordinator.targetForItem(session,item,ath,state);
  M.adapt.profile=(ath,state=M.state)=>E.Modification.profile(ath,state);
  M.adapt.item=(item,ath,state=M.state,session=null)=>E.Modification.adaptItem(item,ath,state,session);
  M.adapt.samePrescription=(a,b)=>E.Modification.samePrescription(a,b);
  M.performanceBridge={ask:(kind,p={})=>kind==='t400'?E.Aerobic.t400(p.athlete,p.state||M.state,p.stroke):kind==='pb'?E.RacePace.pb(p.athlete,p.state||M.state,p):kind==='bestStroke'?(M.performanceEngine?.bestStroke?.(p.athlete,p.state||M.state,p.course||'',!!p.nonFree)?.stroke||E.RacePace.bestStroke(p.athlete,p.state||M.state,p.course||'',!!p.nonFree)):kind==='bestEvent'?M.performanceEngine?.bestEvent?.(p.athlete,p.state||M.state,p.course||''):kind==='bestFormStroke'?M.performanceEngine?.bestFormStroke?.(p.athlete,p.state||M.state,p.course||''):null};
  function mergeReferenceEvidence(){
    const R=M.refs;if(!R?.get)return{pb:0,history:0,coach:0,base:0};
    const pb=R.get('results_pb_board')||[],history=R.get('results_event_history')||[],coach=R.get('coach_results')||[],base=R.get('world_aquatics_base_times')||[];
    M.state.resultsPbBoard=E.Evidence.merge(M.state.resultsPbBoard||M.state.results_pb_board||[],pb);
    M.state.resultsEventHistory=E.Evidence.merge(M.state.resultsEventHistory||M.state.results_event_history||[],history);
    M.state.coachResults=E.Evidence.merge(M.state.coachResults||M.state.coach_results||[],coach);
    M.state.worldAquaticsBaseTimes=E.Evidence.merge(M.state.worldAquaticsBaseTimes||[],base);
    return{pb:pb.length,history:history.length,coach:coach.length,base:base.length};
  }
  function pathwayEvidence(){
    const rows=[];if(!M.pathway?.profile)return rows;const stable=M.util?.stableId||((p,...v)=>`${p}-${v.join('-')}`);
    for(const ath of M.state?.athletes||[]){if(!ath||ath.active===false)continue;for(const course of ['SCM','LCM']){let profile=null;try{profile=M.pathway.profile(ath,course)}catch{}for(const ev of profile?.events||[]){const pb=ev?.pb;if(!pb)continue;const seconds=E.Evidence.seconds(pb),distance=E.Evidence.distance(pb)||Number(ev?.distance||ev?.event_distance),stroke=E.Evidence.rowStroke(pb)||E.Evidence.stroke(ev?.stroke||ev?.event_stroke||'');if(!Number.isFinite(seconds)||seconds<=0||!distance||!stroke)continue;const points=Number(ev?.points?.value??pb?.wa_points??pb?.world_aquatics_points??pb?.para_points??pb?.points);rows.push({...pb,id:pb.id||stable('pathway-pb',ath.id,course,distance,stroke,seconds),athlete_id:ath.id,distance,stroke,pool_course:E.Evidence.course(pb)||course,result_seconds:seconds,wa_points:Number.isFinite(points)&&points>0?points:pb.wa_points,source_type:pb.source_type||'pathway',source_label:pb.source_label||'Swimmer pathway evidence'});}}}
    return rows;
  }
  B.hydrate=async({force=false}={})=>{if(B.hydrated&&!force)return true;if(B.hydrating&&!force)return B.hydrating;B.hydrating=(async()=>{try{
      try{await M.storageEngine?.readyPromise;}catch{}
      try{await M.refs?.boot?.();}catch{}
      const snap=await E.Evidence.hydrate(M.state||{});for(const k of ['athletes','trainingTestTypes','trainingTestResults','adaptationProfiles','adaptationOverrides','coachResults','resultsEventHistory','resultsPbBoard','courseConversions','worldAquaticsBaseTimes'])if(Array.isArray(snap[k]))M.state[k]=E.Evidence.merge(M.state[k],snap[k]);M.state._refs=snap._refs||M.state._refs||{};
      const refs=mergeReferenceEvidence();E.Evidence.ensureVerified?.(M.state);const pathway=pathwayEvidence();if(pathway.length)M.state.resultsPbBoard=E.Evidence.merge(M.state.resultsPbBoard||[],pathway);
      M.state._evidenceBridge={...refs,pathwayRows:pathway.length,hydratedAt:new Date().toISOString()};E.Coordinator.clearCache?.();B.hydrated=true;M.ui?.renderCurrent?.();return true;
    }catch(err){console.warn('[MSOS] evidence hydration failed',err);return false;}finally{B.hydrating=null;}})();return B.hydrating;};
  const boot=async()=>{B.hydrated=false;await B.hydrate({force:true});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
