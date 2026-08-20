'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.performanceEngine||!M?.strokeBalance)return;
  const R=M.reportingEngine={build:'v4-reporting-20260820q'};
  const STROKES=M.strokeBalance.STROKES;
  const BASE_METRICS=[
    {id:'stroke_focus',label:'Stroke focus',source:'Stroke Balance'},
    {id:'performance',label:'PB / WA performance',source:'Performance'},
    {id:'tests',label:'T400 / tests',source:'Evidence + Aerobic'},
    {id:'timed',label:'Timed sets',source:'Timing'},
    {id:'volume',label:'Training volume',source:'Session truth'},
    {id:'evidence',label:'Coaching evidence',source:'Evidence'}
  ];
  const BASE_FIELDS=[
    {id:'raw_metres',label:'Raw metres',source:'Session + Stroke Balance'},
    {id:'weighted_focus',label:'Weighted stroke focus',source:'Stroke Balance'},
    {id:'best_event',label:'#1 event',source:'Performance'},
    {id:'best_event_points',label:'#1 event points',source:'Performance'},
    {id:'best_stroke',label:'#1 stroke',source:'Performance'},
    {id:'best_form_stroke',label:'#1F',source:'Performance'},
    {id:'pb_count',label:'PB events',source:'Evidence'},
    {id:'t400_count',label:'T400 anchors',source:'Evidence'},
    {id:'timed_count',label:'Timed sets',source:'Timing'},
    {id:'session_count',label:'Training sessions',source:'Session truth'},
    {id:'modified_sessions',label:'Modified sessions',source:'Attendance + Modification'},
    {id:'capture_count',label:'Coaching captures',source:'Evidence'}
  ];
  const extraMetrics=[],extraFields=[];
  const allMetrics=()=>[...BASE_METRICS,...extraMetrics],allFields=()=>[...BASE_FIELDS,...extraFields];
  const visibleAthletes=(state=M.state)=>{const allowed=M.access?.visibleAthletes?.();return(Array.isArray(allowed)?allowed:(state?.athletes||[])).filter(a=>a.active!==false);};
  const cutoff=days=>days?Date.now()-Number(days)*86400000:0;
  function timedRows(ath,state,days){const cut=cutoff(days);return(state?.timedSets||[]).filter(x=>x.athlete_id===ath?.id&&(!cut||!x.created_at||Date.parse(x.created_at)>=cut)).slice(-20).reverse();}
  function captureCount(ath,state,days){const cut=cutoff(days);return(state?.captures||[]).filter(c=>{if(cut&&c.created_at&&Date.parse(c.created_at)<cut)return false;const ids=c.athlete_ids||c.swimmer_ids||[];return c.athlete_id===ath?.id||ids.includes?.(ath?.id);}).length;}
  function modifiedSessions(ath,state,days){const sessions=new Set(M.strokeBalance.rangeSessions(state,days).map(s=>s.id));return(state?.attendance||[]).filter(x=>sessions.has(x.session_id||x.sessionId)&&(x.athlete_id||x.athleteId)===ath?.id&&String(x.status||'').toLowerCase()==='modified').length;}
  function athleteRow(ath,state,days){const perf=M.performanceEngine.profile(ath,state,''),bal=M.strokeBalance.summary(ath,state,{days}),best=perf.bestEvent,stroke=perf.bestStroke,form=perf.bestFormStroke,recentTimed=timedRows(ath,state,days);return{athlete:ath,athleteId:ath.id,name:ath.full_name,squad:ath.squad||'',bestEvent:best?`${best.distance} ${best.stroke}`:'No ranked PB',bestEventPoints:Number.isFinite(best?.points)?Math.round(best.points):null,bestStroke:stroke?.stroke||'',bestFormStroke:form?.stroke||'',medleyPrimary:!!perf.medleyPrimary,contextStroke:perf.contextStroke?.stroke||'',contextReason:perf.contextStroke?.source||'',strokeBalance:bal,t400:perf.t400,timedSets:recentTimed,pbCount:perf.pbs.length,sessionCount:bal.sessions,modifiedSessions:modifiedSessions(ath,state,days),captureCount:captureCount(ath,state,days)};}
  function filterAthletes(spec,state){let rows=visibleAthletes(state);const role=M.access?.role?.()||'owner';if(role==='swimmer'){const own=state?.settings?.activeUserAthleteId;rows=rows.filter(a=>a.id===own);}if(spec.squad)rows=rows.filter(a=>a.squad===spec.squad);if(spec.athleteId)rows=rows.filter(a=>a.id===spec.athleteId);return rows;}
  function aggregateStroke(rows){const raw=Object.fromEntries(STROKES.map(s=>[s,0])),weighted=Object.fromEntries(STROKES.map(s=>[s,0]));for(const r of rows)for(const s of STROKES){raw[s]+=r.strokeBalance.raw[s]||0;weighted[s]+=r.strokeBalance.weighted[s]||0;}const tr=Object.values(raw).reduce((a,b)=>a+b,0),tw=Object.values(weighted).reduce((a,b)=>a+b,0);return{raw,weighted,totalRaw:tr,totalWeighted:tw,share:Object.fromEntries(STROKES.map(s=>[s,tw?weighted[s]/tw*100:0]))};}
  function run(spec={},state=M.state){const role=M.access?.role?.()||'owner',scope=role==='swimmer'?'swimmer':(spec.scope||'squad'),days=spec.days===undefined||spec.days===null?7:Number(spec.days),metrics=Array.isArray(spec.metrics)&&spec.metrics.length?spec.metrics:allMetrics().map(x=>x.id),athletes=filterAthletes({...spec,scope},state),rows=athletes.map(a=>athleteRow(a,state,days)),aggregate=aggregateStroke(rows),timedCount=rows.reduce((n,r)=>n+r.timedSets.length,0),t400Count=rows.reduce((n,r)=>n+Object.keys(r.t400||{}).length,0),captureTotal=rows.reduce((n,r)=>n+r.captureCount,0);return{spec:{scope,days,squad:spec.squad||'',athleteId:role==='swimmer'?(state?.settings?.activeUserAthleteId||''):(spec.athleteId||''),metrics},generatedAt:new Date().toISOString(),rows,aggregate,summary:{athletes:rows.length,rawMetres:aggregate.totalRaw,weightedFocus:aggregate.totalWeighted,t400Anchors:t400Count,recentTimedSets:timedCount,captures:captureTotal},methodology:{strokeWeights:M.strokeBalance.WEIGHTS,provisional:true,note:'Raw metres and weighted focus are both retained; incidental/easy Freestyle is deliberately discounted.'}};}
  function squads(state=M.state){return[...new Set(visibleAthletes(state).map(a=>a.squad).filter(Boolean))].sort();}
  function registerMetric(metric){if(!metric?.id||allMetrics().some(x=>x.id===metric.id))return false;extraMetrics.push({...metric});return true;}
  function registerField(field){if(!field?.id||allFields().some(x=>x.id===field.id))return false;extraFields.push({...field});return true;}
  Object.defineProperty(R,'METRICS',{get:allMetrics});Object.defineProperty(R,'FIELDS',{get:allFields});
  R.catalog=()=>({metrics:allMetrics(),fields:allFields(),scopes:['squad','swimmer'],windows:[7,14,28,0],strokes:STROKES});R.registerMetric=registerMetric;R.registerField=registerField;R.run=run;R.squads=squads;R.athleteRow=athleteRow;R.aggregateStroke=aggregateStroke;R.visibleAthletes=visibleAthletes;
})(globalThis);
