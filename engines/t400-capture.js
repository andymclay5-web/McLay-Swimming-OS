'use strict';
(function(g){const M=g.MSOS4,E=g.MSOSEngines;if(!M?.timing?.saveT400||!E?.Aerobic||!E?.Evidence)return;const C=M.t400Capture={build:'v4-t400-capture-20260820r'};const base=M.timing.saveT400.bind(M.timing),clock=s=>M.util?.clock?.(Number(s))||String(s),now=()=>new Date().toISOString();
  function athlete(id,state){return(state?.athletes||[]).find(a=>a.id===id)||null;}
  function comparison(current,prior){if(!Number.isFinite(prior))return{status:'baseline',delta:null};const delta=Number(current)-Number(prior);if(Math.abs(delta)<.01)return{status:'equal',delta:0};return{status:delta<0?'improved':'slower',delta};}
  M.timing.saveT400=function(athleteId,value,session=M.currentSession?.(),state=M.state,date,stroke='Freestyle',meta={}){
    const ath=athlete(athleteId,state),st=E.Evidence.stroke(stroke||'Freestyle'),course=session?.identity?.course||'',prior=ath?E.Aerobic.t400(ath,state,st,course):null,priorSec=E.Evidence.seconds(prior),row=base(athleteId,value,session,state,date,st,meta),current=E.Evidence.seconds(row),cmp=comparison(current,priorSec),liveState=state===M.state;
    if(row&&Number.isFinite(current)){
      row.stroke=st;row.valid_for_anchor=row.valid_for_anchor!==false;row.metadata={...(row.metadata||{}),t400_comparison:cmp.status,t400_delta_seconds:cmp.delta,t400_previous_best_seconds:Number.isFinite(priorSec)?priorSec:null,t400_compared_at:now()};row.t400_comparison=cmp.status;row.t400_delta_seconds=cmp.delta;
      // Guardian/regression fixtures deliberately pass isolated state objects. They may exercise
      // the capture logic, but they must never persist, publish or toast as if a coach saved a result.
      if(liveState){M.store?.save?.(state);const who=M.boardEngine?.name?.(ath,state?.athletes||[])||String(ath?.full_name||'Swimmer').split(/\s+/)[0],label=cmp.status==='baseline'?`${who} · first ${st} T400 ${clock(current)}`:cmp.status==='improved'?`${who} · PB ${clock(current)} · ${Math.abs(cmp.delta).toFixed(1)}s faster`:cmp.status==='equal'?`${who} · ${clock(current)} · equals PB`:`${who} · ${clock(current)} · ${Math.abs(cmp.delta).toFixed(1)}s off PB`;M.toast?.(label);}
    }
    return row;
  };
  C.comparison=comparison;
})(globalThis);