'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.performanceEngine||!M?.strokeBalance)return;
  const R=M.reportingEngine={build:'v4-reporting-20260820p'};
  const STROKES=M.strokeBalance.STROKES;
  const METRICS=Object.freeze([
    {id:'stroke_focus',label:'Stroke focus',source:'Stroke Balance'},
    {id:'performance',label:'PB / WA performance',source:'Performance'},
    {id:'tests',label:'T400 / tests',source:'Evidence + Aerobic'},
    {id:'timed',label:'Timed sets',source:'Timing'},
    {id:'volume',label:'Training volume',source:'Session truth'},
    {id:'evidence',label:'Coaching evidence',source:'Evidence'}
  ]);
  const activeAthletes=(state=M.state)=> (state?.athletes||[]).filter(a=>a.active!==false);
  function athleteRow(ath,state,days){const perf=M.performanceEngine.profile(ath,state,''),bal=M.strokeBalance.summary(ath,state,{days}),best=perf.bestEvent,stroke=perf.bestStroke,form=perf.bestFormStroke;return{athlete:ath,athleteId:ath.id,name:ath.full_name,squad:ath.squad||'',bestEvent:best?`${best.distance} ${best.stroke}`:'No ranked PB',bestEventPoints:Number.isFinite(best?.points)?Math.round(best.points):null,bestStroke:stroke?.stroke||'',bestFormStroke:form?.stroke||'',medleyPrimary:!!perf.medleyPrimary,contextStroke:perf.contextStroke?.stroke||'',contextReason:perf.contextStroke?.source||'',strokeBalance:bal,t400:perf.t400,timedSets:perf.timedSets,pbCount:perf.pbs.length};}
  function filterAthletes(spec,state){let rows=activeAthletes(state);if(spec.squad)rows=rows.filter(a=>a.squad===spec.squad);if(spec.athleteId)rows=rows.filter(a=>a.id===spec.athleteId);return rows;}
  function aggregateStroke(rows){const raw=Object.fromEntries(STROKES.map(s=>[s,0])),weighted=Object.fromEntries(STROKES.map(s=>[s,0]));for(const r of rows)for(const s of STROKES){raw[s]+=r.strokeBalance.raw[s]||0;weighted[s]+=r.strokeBalance.weighted[s]||0;}const tr=Object.values(raw).reduce((a,b)=>a+b,0),tw=Object.values(weighted).reduce((a,b)=>a+b,0);return{raw,weighted,totalRaw:tr,totalWeighted:tw,share:Object.fromEntries(STROKES.map(s=>[s,tw?weighted[s]/tw*100:0]))};}
  function run(spec={},state=M.state){const scope=spec.scope||'squad',days=Number(spec.days||7),metrics=Array.isArray(spec.metrics)&&spec.metrics.length?spec.metrics:METRICS.map(x=>x.id),athletes=filterAthletes(spec,state),rows=athletes.map(a=>athleteRow(a,state,days)),aggregate=aggregateStroke(rows),timedCount=rows.reduce((n,r)=>n+r.timedSets.length,0),t400Count=rows.reduce((n,r)=>n+Object.keys(r.t400||{}).length,0);return{spec:{scope,days,squad:spec.squad||'',athleteId:spec.athleteId||'',metrics},generatedAt:new Date().toISOString(),rows,aggregate,summary:{athletes:rows.length,rawMetres:aggregate.totalRaw,weightedFocus:aggregate.totalWeighted,t400Anchors:t400Count,recentTimedSets:timedCount},methodology:{strokeWeights:M.strokeBalance.WEIGHTS,provisional:true,note:'Raw metres and weighted focus are both retained; incidental/easy Freestyle is deliberately discounted.'}};}
  function squads(state=M.state){return[...new Set(activeAthletes(state).map(a=>a.squad).filter(Boolean))].sort();}
  R.METRICS=METRICS;R.catalog=()=>({metrics:METRICS,scopes:['squad','swimmer'],windows:[7,14,28,0],strokes:STROKES});R.run=run;R.squads=squads;R.athleteRow=athleteRow;R.aggregateStroke=aggregateStroke;
})(globalThis);
