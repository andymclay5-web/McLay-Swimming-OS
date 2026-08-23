'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-modification-consolidation-20260823bp',Q=M.amberAlignmentAT={build:BUILD};
  Q.alignedReps=(item,ath,state=M.state,session=M.currentSession?.())=>{
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true};
    return E.Modification.safeReps?.(item?.reps,item?.distance,p.ratio,session,p.returnToStart)??Math.max(1,Math.round((Number(item?.reps)||1)*(Number(p.ratio)||1)));
  };
  Q.adaptItem=(item,ath,state=M.state,session=M.currentSession?.())=>E.Modification.adaptItem(item,ath,state,session);
  Q.checks=()=>({scm75:'Compatibility only · core Modification owns practical 75 decisions',reason:'No late-loaded timing policy'});
})(globalThis);
