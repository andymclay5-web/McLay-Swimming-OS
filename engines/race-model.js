'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.RaceModel=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function course(v){const n=norm(v);return /short|scm|25m/.test(n)?'SCM':/long|lcm|50m/.test(n)?'LCM':text(v).toUpperCase()}
  function stroke(v){const n=norm(v);if(/free/.test(n))return'Freestyle';if(/back/.test(n))return'Backstroke';if(/breast/.test(n))return'Breaststroke';if(/butter|fly/.test(n))return'Butterfly';if(/\bim\b|individual medley/.test(n))return'IM';return text(v)}
  function eventKey(x={}){return`${course(x.course||x.pool_course)}|${num(x.distance_m??x.distance)??''}|${stroke(x.stroke)}`}
  function normalizeModel(raw={}){
    const distance=num(raw.distance_m??raw.distance),segments=(raw.segments||[]).map((s,i)=>({index:i+1,distance_m:num(s.distance_m??s.distance),fraction:num(s.fraction??s.total_fraction),label:text(s.label)}));
    if(!text(raw.id))throw new Error('Race model requires id');if(distance===null||distance<=0)throw new Error('Race model requires positive distance');if(!segments.length)throw new Error('Race model requires segments');
    let dm=0,f=0;for(const s of segments){if(s.distance_m===null||s.distance_m<=0)throw new Error('Race model segment requires positive distance');if(s.fraction===null||s.fraction<=0)throw new Error('Race model segment requires positive fraction');dm+=s.distance_m;f+=s.fraction}if(Math.abs(dm-distance)>1e-9)throw new Error('Race model segment distances must equal event distance');if(Math.abs(f-1)>1e-6)throw new Error('Race model fractions must sum to 1');
    return{id:text(raw.id),name:text(raw.name||raw.id),version:text(raw.version||'1'),course:course(raw.course),distance_m:distance,stroke:stroke(raw.stroke),segments,source:text(raw.source),provenance:raw.provenance==null?null:clone(raw.provenance),active:raw.active!==false};
  }
  function normalizeActual(raw=[]){let priorDistance=0,priorElapsed=0;return(raw||[]).map((s,i)=>{const distance=num(s.distance_m??s.distance),elapsed=num(s.elapsed_seconds??s.elapsedSeconds);if(distance===null||distance<=priorDistance)throw new Error('Actual split distances must increase');if(elapsed===null||elapsed<=priorElapsed)throw new Error('Actual split elapsed times must increase');const row={index:i+1,distance_m:distance,elapsed_seconds:elapsed,split_seconds:elapsed-priorElapsed};priorDistance=distance;priorElapsed=elapsed;return row})}
  class RaceModel{
    constructor({models=[]}={}){this.models=(models||[]).map(normalizeModel)}
    list({activeOnly=true}={}){return clone(this.models.filter(x=>!activeOnly||x.active))}
    resolve(refOrEvent={}){if(typeof refOrEvent==='string'){const rows=this.models.filter(x=>x.active&&x.id===text(refOrEvent));return rows.length===1?clone(rows[0]):null}const key=eventKey(refOrEvent),rows=this.models.filter(x=>x.active&&eventKey(x)===key);if(rows.length===1)return clone(rows[0]);return null}
    match(event={}){const key=eventKey(event),rows=this.models.filter(x=>x.active&&eventKey(x)===key);return{status:rows.length===1?'ok':rows.length?'ambiguous':'missing',model:rows.length===1?clone(rows[0]):null,candidates:clone(rows)}}
    target({targetSeconds,target_seconds,course:poolCourse,distance_m,distance,stroke:eventStroke,modelId='',model_id=''}={}){
      const total=num(targetSeconds??target_seconds);if(total===null||total<=0)return{status:'missing_target',model:null,target_seconds:null,segments:[]};let model;if(modelId||model_id){model=this.resolve(modelId||model_id);if(!model)return{status:'model_missing',model:null,target_seconds:total,segments:[]};const wanted=eventKey({course:poolCourse,distance_m:distance_m??distance,stroke:eventStroke});if(wanted!=='||'&&eventKey(model)!==wanted)return{status:'model_event_mismatch',model, target_seconds:total,segments:[]}}else{const m=this.match({course:poolCourse,distance_m:distance_m??distance,stroke:eventStroke});if(m.status!=='ok')return{status:m.status==='missing'?'model_missing':'model_ambiguous',model:null,target_seconds:total,segments:[]};model=m.model}
      let cumulativeDistance=0,cumulativeSeconds=0;const segments=model.segments.map(s=>{const split=total*s.fraction;cumulativeDistance+=s.distance_m;cumulativeSeconds+=split;return{index:s.index,label:s.label||null,distance_m:s.distance_m,cumulative_distance_m:cumulativeDistance,split_seconds:split,cumulative_seconds:cumulativeSeconds,fraction:s.fraction}});if(segments.length)segments[segments.length-1].cumulative_seconds=total;return{status:'ok',model:{id:model.id,name:model.name,version:model.version,source:model.source,provenance:clone(model.provenance)},event:{course:model.course,distance_m:model.distance_m,stroke:model.stroke},target_seconds:total,segments};
    }
    compare(actualSplits=[],targetPlan){if(!targetPlan||targetPlan.status!=='ok')return{status:'target_unavailable',segments:[]};const actual=normalizeActual(actualSplits),targets=new Map(targetPlan.segments.map(x=>[x.cumulative_distance_m,x]));const rows=[];for(const a of actual){const t=targets.get(a.distance_m);if(!t)continue;rows.push({...a,target_cumulative_seconds:t.cumulative_seconds,target_split_seconds:t.split_seconds,cumulative_delta_seconds:a.elapsed_seconds-t.cumulative_seconds})}return{status:'ok',target_seconds:targetPlan.target_seconds,model:clone(targetPlan.model),segments:rows,finish_delta_seconds:rows.length&&rows.at(-1).distance_m===targetPlan.event.distance_m?rows.at(-1).cumulative_delta_seconds:null};}
    snapshot(){return{version:VERSION,models:this.list({activeOnly:false})}}
  }
  const create=options=>new RaceModel(options);
  return{VERSION,create,RaceModel,course,stroke,eventKey,normalizeModel,normalizeActual};
});
