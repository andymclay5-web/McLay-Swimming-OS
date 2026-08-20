'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.performanceEngine||!M?.strokeBalance)return;
  const R=M.reportingEngine={build:'v4-reporting-20260820v'};
  const STROKES=M.strokeBalance.STROKES;
  const BASE_METRICS=[
    {id:'stroke_focus',label:'Stroke focus',source:'Stroke Balance'},
    {id:'performance',label:'PB / WA performance',source:'Performance + WA Points'},
    {id:'pathway',label:'Pathway / qualifying progress',source:'Pathway'},
    {id:'tests',label:'T400 / tests',source:'Evidence + Aerobic'},
    {id:'timed',label:'Timed sets',source:'Timing'},
    {id:'volume',label:'Training volume',source:'Session truth'},
    {id:'evidence',label:'Coaching evidence',source:'Evidence'},
    {id:'reference_data',label:'Reference versions / data health',source:'Data Registry'}
  ];
  const BASE_FIELDS=[
    {id:'raw_metres',label:'Raw metres',source:'Session + Stroke Balance'},
    {id:'weighted_focus',label:'Weighted stroke focus',source:'Stroke Balance'},
    {id:'best_event',label:'#1 event',source:'Performance'},
    {id:'best_event_points',label:'#1 event WA points',source:'WA Points'},
    {id:'best_stroke',label:'#1 stroke',source:'Performance'},
    {id:'best_form_stroke',label:'#1F',source:'Performance'},
    {id:'pb_count',label:'PB events',source:'Evidence'},
    {id:'pathway_event',label:'Closest pathway event',source:'Pathway'},
    {id:'pathway_gap_seconds',label:'Pathway gap seconds',source:'Pathway'},
    {id:'pathway_gap_percent',label:'Pathway gap percent',source:'Pathway'},
    {id:'t400_count',label:'T400 anchors',source:'Evidence'},
    {id:'timed_count',label:'Timed sets',source:'Timing'},
    {id:'session_count',label:'Training sessions',source:'Session truth'},
    {id:'modified_sessions',label:'Modified sessions',source:'Attendance + Modification'},
    {id:'capture_count',label:'Coaching captures',source:'Evidence'},
    {id:'capture_context',label:'Capture session / block / line context',source:'Evidence + Session truth'},
    {id:'wa_table_version',label:'WA points table version',source:'Data Registry + WA Points'},
    {id:'standards_version',label:'Pathway standards version',source:'Data Registry'}
  ];
  const extraMetrics=[],extraFields=[],providers=new Map();
  const allMetrics=()=>[...BASE_METRICS,...extraMetrics],allFields=()=>[...BASE_FIELDS,...extraFields];
  const visibleAthletes=(state=M.state)=>{const allowed=M.access?.visibleAthletes?.();return(Array.isArray(allowed)?allowed:(state?.athletes||[])).filter(a=>a.active!==false);};
  const cutoff=days=>days?Date.now()-Number(days)*86400000:0;
  function timedRows(ath,state,days){const cut=cutoff(days);return(state?.timedSets||[]).filter(x=>x.athlete_id===ath?.id&&(!cut||!x.created_at||Date.parse(x.created_at)>=cut)).slice(-20).reverse();}
  function sessionRelevantToAthlete(session,ath,state){if(!session||!ath)return false;const attendance=(state?.attendance||[]).find(x=>(x.session_id||x.sessionId)===session.id&&(x.athlete_id||x.athleteId)===ath.id);if(attendance)return !/absent|away|no/i.test(String(attendance.status||''));return(session.identity?.squads||[]).includes(ath.squad);}
  function captureRows(ath,state,days){const cut=cutoff(days);return(state?.captures||[]).filter(c=>{if(cut&&c.created_at&&Date.parse(c.created_at)<cut)return false;const ids=[...(c.athlete_ids||c.swimmer_ids||[])];if(c.athlete_id&&!ids.includes(c.athlete_id))ids.push(c.athlete_id);if(ids.includes(ath?.id))return true;if(ids.length)return false;return sessionRelevantToAthlete(state?.canonicalSessions?.[c.session_id],ath,state);}).map(c=>{const ids=[...(c.athlete_ids||c.swimmer_ids||[])];if(c.athlete_id&&!ids.includes(c.athlete_id))ids.push(c.athlete_id);return{...c,evidenceScope:ids.includes(ath?.id)?'individual':'session_group'};}).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));}
  function captureCount(ath,state,days){return captureRows(ath,state,days).length;}
  function modifiedSessions(ath,state,days){const sessions=new Set(M.strokeBalance.rangeSessions(state,days).map(s=>s.id));return(state?.attendance||[]).filter(x=>sessions.has(x.session_id||x.sessionId)&&(x.athlete_id||x.athleteId)===ath?.id&&String(x.status||'').toLowerCase()==='modified').length;}
  function pathwayRow(ath,course='SCM'){try{const p=M.pathway?.profile?.(ath,course),c=p?.closest;if(!c)return{course,event:'',gapSeconds:null,gapPercent:null,label:'',classificationNeeded:!!p?.classificationNeeded};return{course,event:`${c.pb?.distance||''} ${c.pb?.stroke||''}`.trim(),pbSeconds:Number(c.pb?.result_seconds),targetSeconds:Number(c.nextNational?.row?._seconds),gapSeconds:Number(c.nextNational?.gap?.seconds),gapPercent:Number(c.nextNational?.gap?.percentage),label:c.nextNational?.row?._label||'',classificationNeeded:false};}catch{return{course,event:'',gapSeconds:null,gapPercent:null,label:'',classificationNeeded:false};}}
  function references(){const wa=M.waPointsEngine?.tableInfo?.(M.state)||{},nat=M.dataRegistry?.activeMeta?.('national_standards'),meet=M.dataRegistry?.activeMeta?.('meet_qualifying');return{wa,standards:nat||meet||null,nationalStandards:nat||null,meetQualifying:meet||null,lastImport:M.state?.dataRegistry?.lastImport||null};}
  function athleteRow(ath,state,days,course='SCM'){const perf=M.performanceEngine.profile(ath,state,course),bal=M.strokeBalance.summary(ath,state,{days}),best=perf.bestEvent,stroke=perf.bestStroke,form=perf.bestFormStroke,recentTimed=timedRows(ath,state,days),path=pathwayRow(ath,course),captures=captureRows(ath,state,days),extras={};for(const [id,fn] of providers){try{extras[id]=fn({athlete:ath,state,days,course,performance:perf,strokeBalance:bal,pathway:path,captures});}catch{extras[id]=null;}}return{athlete:ath,athleteId:ath.id,name:ath.full_name,squad:ath.squad||'',course,bestEvent:best?`${best.distance} ${best.stroke}`:'No ranked PB',bestEventPoints:Number.isFinite(best?.points)?Math.floor(best.points):null,bestEventPointVersion:best?.pointVersion||'',bestStroke:stroke?.stroke||'',bestFormStroke:form?.stroke||'',medleyPrimary:!!perf.medleyPrimary,contextStroke:perf.contextStroke?.stroke||'',contextReason:perf.contextStroke?.source||'',strokeBalance:bal,t400:perf.t400,timedSets:recentTimed,pbCount:perf.pbs.length,pointStatus:perf.pointStatus,pathway:path,sessionCount:bal.sessions,modifiedSessions:modifiedSessions(ath,state,days),captureCount:captures.length,captures,extras};}
  function filterAthletes(spec,state){let rows=visibleAthletes(state);const role=M.access?.role?.()||'owner';if(role==='swimmer'){const own=state?.settings?.activeUserAthleteId;rows=rows.filter(a=>a.id===own);}if(spec.squad)rows=rows.filter(a=>a.squad===spec.squad);if(spec.athleteId)rows=rows.filter(a=>a.id===spec.athleteId);return rows;}
  function aggregateStroke(rows){const raw=Object.fromEntries(STROKES.map(s=>[s,0])),weighted=Object.fromEntries(STROKES.map(s=>[s,0]));for(const r of rows)for(const s of STROKES){raw[s]+=r.strokeBalance.raw[s]||0;weighted[s]+=r.strokeBalance.weighted[s]||0;}const tr=Object.values(raw).reduce((a,b)=>a+b,0),tw=Object.values(weighted).reduce((a,b)=>a+b,0);return{raw,weighted,totalRaw:tr,totalWeighted:tw,share:Object.fromEntries(STROKES.map(s=>[s,tw?weighted[s]/tw*100:0]))};}
  function run(spec={},state=M.state){const role=M.access?.role?.()||'owner',scope=role==='swimmer'?'swimmer':(spec.scope||'squad'),days=spec.days===undefined||spec.days===null?7:Number(spec.days),course=spec.course||state?.settings?.pathwayCourse||'SCM',metrics=Array.isArray(spec.metrics)&&spec.metrics.length?spec.metrics:allMetrics().map(x=>x.id),athletes=filterAthletes({...spec,scope},state),rows=athletes.map(a=>athleteRow(a,state,days,course)),aggregate=aggregateStroke(rows),timedCount=rows.reduce((n,r)=>n+r.timedSets.length,0),t400Count=rows.reduce((n,r)=>n+Object.keys(r.t400||{}).length,0),evidenceRows=[...new Map(rows.flatMap(r=>r.captures||[]).map(c=>[c.id,c])).values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),refs=references();return{spec:{scope,days,course,squad:spec.squad||'',athleteId:role==='swimmer'?(state?.settings?.activeUserAthleteId||''):(spec.athleteId||''),metrics},generatedAt:new Date().toISOString(),rows,aggregate,evidenceRows,references:refs,summary:{athletes:rows.length,rawMetres:aggregate.totalRaw,weightedFocus:aggregate.totalWeighted,t400Anchors:t400Count,recentTimedSets:timedCount,captures:evidenceRows.length,rankedAthletes:rows.filter(r=>r.bestEventPoints!=null).length,pathwayMatched:rows.filter(r=>r.pathway?.event).length},methodology:{strokeWeights:M.strokeBalance.WEIGHTS,provisional:true,note:'Raw metres and weighted focus are both retained; incidental/easy Freestyle is deliberately discounted.'}};}
  function squads(state=M.state){return[...new Set(visibleAthletes(state).map(a=>a.squad).filter(Boolean))].sort();}
  function registerMetric(metric){if(!metric?.id||allMetrics().some(x=>x.id===metric.id))return false;extraMetrics.push({...metric});return true;}
  function registerField(field){if(!field?.id||allFields().some(x=>x.id===field.id))return false;extraFields.push({...field});return true;}
  function registerProvider(id,fn,{fields=[],metric=null}={}){if(!id||typeof fn!=='function'||providers.has(id))return false;providers.set(id,fn);for(const f of fields)registerField({...f,provider:id});if(metric)registerMetric(metric);return true;}
  Object.defineProperty(R,'METRICS',{get:allMetrics});Object.defineProperty(R,'FIELDS',{get:allFields});
  R.catalog=()=>({metrics:allMetrics(),fields:allFields(),scopes:['squad','swimmer'],windows:[7,14,28,0],courses:['SCM','LCM'],strokes:STROKES,providers:[...providers.keys()]});R.registerMetric=registerMetric;R.registerField=registerField;R.registerProvider=registerProvider;R.run=run;R.squads=squads;R.athleteRow=athleteRow;R.aggregateStroke=aggregateStroke;R.visibleAthletes=visibleAthletes;R.references=references;R.captureRows=captureRows;
})(globalThis);
