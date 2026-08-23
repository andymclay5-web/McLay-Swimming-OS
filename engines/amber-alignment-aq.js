'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-amber-alignment-20260821aq',Q=M.amberAlignmentAQ={build:BUILD};
  Q.alignedReps=(item,ath,state=M.state,session=M.currentSession?.())=>{
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true};
    return E.Modification.safeReps?.(item?.reps,item?.distance,p.ratio,session,p.returnToStart)??Math.max(1,Math.round((Number(item?.reps)||1)*(Number(p.ratio)||1)));
  };
  Q.adaptItem=(item,ath,state=M.state,session=M.currentSession?.())=>E.Modification.adaptItem(item,ath,state,session);
  Q.checks=()=>({policy:'Compatibility only · return-to-start is owned by engines/modification.js',oddLength75:'core engine decides practical work',scull:'core athlete constraint'});
})(globalThis);
