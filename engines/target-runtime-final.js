'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;
  if(!M?.targets||!E?.Coordinator?.targetForItem)return;
  const T=M.targetRuntimeFinal={build:'v4-target-runtime-final-20260824cs'};
  M.targets.forItem=(session,item,ath,state=M.state)=>E.Coordinator.targetForItem(session,item,ath,state);
  M.targets.suppressPace=item=>E.Coordinator.suppress(item);
  T.checks=()=>({owner:'Coordinator',hrGauge:E.Coordinator.suppress({raw:'4 x 100 IM Clearance · HR Gauge',text:'4 x 100 IM Clearance · HR Gauge',zone:'Clearance',stroke:'IM'})==='HR Gauge'});
})(globalThis);
