'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.ExposureLoad=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const dateOnly=v=>text(v).slice(0,10);
  const inRange=(d,from,to)=>{const x=dateOnly(d);return(!from||x>=dateOnly(from))&&(!to||x<=dateOnly(to))};
  function doseOf(row){return clone(row?.dose?.dose||row?.dose||{})}
  function distanceOf(row){for(const v of [row?.totalDistance,row?.deliveredDistance,row?.distance,row?.dose?.totalDistance]){const n=num(v);if(n!==null&&n>=0)return n}return 0}
  function normalizeTarget(raw={}){const key=text(raw.key||raw.dose_key||raw.doseKey);if(!key)throw new Error('Exposure target requires dose key');const min=num(raw.min_metres??raw.minMetres),max=num(raw.max_metres??raw.maxMetres),target=num(raw.target_metres??raw.targetMetres);return{key,min_metres:min,max_metres:max,target_metres:target,label:text(raw.label||key)}}
  class ExposureLoad{
    summarize(records=[],query={}){
      const from=dateOnly(query.from||query.start_date),to=dateOnly(query.to||query.end_date),athleteId=text(query.athlete_id||query.athleteId),squadId=text(query.squad_id||query.squadId);
      const rows=(records||[]).filter(Boolean).filter(r=>inRange(r.date||r.session_date||r.completed_at,from,to)).filter(r=>!athleteId||text(r.athlete_id||r.athleteId)===athleteId).filter(r=>!squadId||text(r.squad_id||r.squadId)===squadId);
      const dose={},byDate={},bySession=[],sessionIds=[];let totalDistance=0,classifiedDistance=0;
      for(const r of rows){const d=doseOf(r),date=dateOnly(r.date||r.session_date||r.completed_at),id=text(r.session_id||r.sessionId||r.id);if(id)sessionIds.push(id);const distance=distanceOf(r);totalDistance+=distance;let classified=0;for(const [k,v] of Object.entries(d)){const metres=num(v)||0;if(metres<=0)continue;dose[k]=(dose[k]||0)+metres;classified+=metres;if(date){byDate[date]=byDate[date]||{date,totalDistance:0,dose:{},sessions:0};byDate[date].dose[k]=(byDate[date].dose[k]||0)+metres}}classifiedDistance+=classified;if(date){byDate[date]=byDate[date]||{date,totalDistance:0,dose:{},sessions:0};byDate[date].totalDistance+=distance;byDate[date].sessions++}bySession.push({session_id:id,date,totalDistance:distance,classifiedDistance:classified,dose:d})}
      const ranked=Object.entries(dose).map(([key,metres])=>({key,metres,share:classifiedDistance>0?metres/classifiedDistance:0})).sort((a,b)=>b.metres-a.metres||a.key.localeCompare(b.key));return{schema:'msos.exposure-load.v1',engineVersion:VERSION,scope:{from:from||null,to:to||null,athlete_id:athleteId||null,squad_id:squadId||null},sessions:rows.length,session_ids:[...new Set(sessionIds)],totalDistance,classifiedDistance,unclassifiedDistance:Math.max(0,totalDistance-classifiedDistance),dose,rankedDose:ranked,byDate:Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date)),bySession};
    }
    compare(summary,plan={}){
      if(!summary?.dose)throw new Error('Exposure compare requires exposure summary');const targets=(plan.exposure_targets||plan.exposureTargets||plan.targets||[]).map(normalizeTarget),rows=targets.map(t=>{const actual=num(summary.dose[t.key])||0;let status='observed';if(t.min_metres!==null&&actual<t.min_metres)status='below_minimum';else if(t.max_metres!==null&&actual>t.max_metres)status='above_maximum';else if(t.min_metres!==null||t.max_metres!==null)status='within_range';else if(t.target_metres!==null)status=actual<t.target_metres?'below_target':actual>t.target_metres?'above_target':'on_target';const target=t.target_metres!==null?t.target_metres:t.min_metres!==null?t.min_metres:t.max_metres,delta=target===null?null:actual-target;return{...t,actual_metres:actual,status,delta_metres:delta}});return{schema:'msos.exposure-plan-comparison.v1',engineVersion:VERSION,scope:clone(summary.scope),plan_id:text(plan.id||plan.plan_id),targets:rows,below:rows.filter(x=>/^below/.test(x.status)),above:rows.filter(x=>/^above/.test(x.status)),within:rows.filter(x=>x.status==='within_range'||x.status==='on_target')};
    }
    athleteContext(records=[],athleteId,plan={},query={}){const exposure=this.summarize(records,{...query,athleteId}),comparison=this.compare(exposure,plan);return{athlete_id:text(athleteId),exposure,comparison,evidence:{session_ids:clone(exposure.session_ids),fact:`${exposure.sessions} supplied sessions; ${Math.round(exposure.classifiedDistance)}m classified dose`}}}
  }
  const create=()=>new ExposureLoad();
  return{VERSION,create,ExposureLoad,doseOf,distanceOf,normalizeTarget,inRange};
});
