'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionDose=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const zoneKey=z=>text(z)?`aerobic:${text(z).toLowerCase()}`:'';
  const repDistance=item=>num(item?.distance)||0;
  const reps=item=>Math.max(1,num(item?.reps)||1);
  const itemDistance=item=>reps(item)*repDistance(item);
  function nodeDistance(node){if(!node)return 0;if(node.kind==='set')return itemDistance(node);if(node.kind==='group')return Math.max(1,num(node.rounds)||1)*(node.items||[]).reduce((n,x)=>n+nodeDistance(x),0);return 0}
  const sessionDistance=session=>(session?.blocks||[]).reduce((n,b)=>n+(b.items||[]).reduce((s,x)=>s+nodeDistance(x),0),0);
  function add(map,key,metres){if(!key||!(metres>0))return;map[key]=(map[key]||0)+metres}
  function explicitRaceReps(item){return new Set((item?.repInstructions||[]).filter(x=>x?.raceIntent).map(x=>num(x.rep)).filter(x=>x&&x<=reps(item)))}
  function zoneByRep(item){const map=new Map();for(const r of item?.repPattern||[])if(num(r.rep)&&r.zone)map.set(num(r.rep),zoneKey(r.zone));return map}
  function techniqueByRep(item){const map=new Map();for(const r of item?.repInstructions||[])if(num(r.rep)&&r.drill)map.set(num(r.rep),true);return map}
  function classifyFlat(item){
    const dose={},d=repDistance(item),n=reps(item),race=explicitRaceReps(item),zones=zoneByRep(item),tech=techniqueByRep(item),globalRace=!!item?.raceIntent,globalZone=zoneKey(item?.zone);let classified=0;
    for(let rep=1;rep<=n;rep++){
      let k='';if(race.has(rep)||globalRace)k='race_pace';else if(zones.has(rep))k=zones.get(rep);else if(globalZone)k=globalZone;else if(tech.has(rep))k='technique';
      if(k){add(dose,k,d);classified+=d}
    }
    return{dose,classified,total:n*d,unclassified:(n*d)-classified};
  }
  function phaseItem(parent,phase){return{...clone(parent),...clone(phase),reps:num(phase?.reps)||num(phase?.count)||1,distance:num(phase?.distance)||num(parent?.distance)||0,raceIntent:clone(phase?.raceIntent||null),repInstructions:clone(phase?.repInstructions||[]),repPattern:clone(phase?.repPattern||[]),phases:[]}}
  function classifySet(item){
    if((item?.phases||[]).length){const dose={};let total=0,classified=0,unclassified=0;for(const p of item.phases){const x=classifyFlat(phaseItem(item,p));total+=x.total;classified+=x.classified;unclassified+=x.unclassified;for(const [k,v] of Object.entries(x.dose))add(dose,k,v)}return{dose,total,classified,unclassified}}
    return classifyFlat(item);
  }
  function analyzeNodes(nodes,multiplier=1,out=null){
    out=out||{dose:{},total:0,classified:0,unclassified:0};for(const n of nodes||[]){if(n?.kind==='group'){analyzeNodes(n.items,(multiplier*Math.max(1,num(n.rounds)||1)),out);continue}if(n?.kind!=='set')continue;const x=classifySet(n);out.total+=x.total*multiplier;out.classified+=x.classified*multiplier;out.unclassified+=x.unclassified*multiplier;for(const [k,v] of Object.entries(x.dose))add(out.dose,k,v*multiplier)}return out;
  }
  function analyzeOccurrences(occurrences=[]){const out={dose:{},total:0,classified:0,unclassified:0};for(const o of occurrences){const x=classifySet(o?.work||{}),expected=num(o?.distance),scale=expected!==null&&x.total>0?expected/x.total:1;out.total+=expected!==null?expected:x.total;out.classified+=x.classified*scale;out.unclassified+=(expected!==null?expected:x.total)-(x.classified*scale);for(const [k,v] of Object.entries(x.dose))add(out.dose,k,v*scale)}return out}
  function rankDose(dose){return Object.entries(dose||{}).map(([key,metres])=>({key,metres})).sort((a,b)=>b.metres-a.metres||a.key.localeCompare(b.key))}
  function planKeys(planContext={}){const intent=planContext?.intent||{},primary=text(intent.primary_dose_key||intent.primaryDoseKey||planContext.primaryDoseKey),support=[...(intent.supporting_dose_keys||intent.supportingDoseKeys||planContext.supportingDoseKeys||[])].map(text).filter(Boolean),required=[...(intent.required_dose_keys||intent.requiredDoseKeys||[])].map(text).filter(Boolean);return{primary,support,required}}
  function blockRole(type){const t=text(type);return t==='warm_up'?'warm_up':t==='warm_down'?'warm_down':t==='pre_set'?'pre_set':t==='main_set'?'main_set':t==='post_set'?'post_set':t||'other'}

  class SessionDose{
    analyze(session,{planContext=null,delivered=null}={}){
      if(!session?.id||!Array.isArray(session.blocks))throw new Error('Session Dose requires canonical session');
      const whole=delivered?.delivered_occurrences?analyzeOccurrences(delivered.delivered_occurrences):analyzeNodes(session.blocks.flatMap(b=>b.items||[]));
      const blocks=(session.blocks||[]).map(b=>{const x=analyzeNodes(b.items||[]);return{id:b.id,type:text(b.type),role:blockRole(b.type),title:text(b.title),distance:x.total,classifiedDistance:x.classified,unclassifiedDistance:x.unclassified,dose:x.dose}});
      const ranked=rankDose(whole.dose),keys=planKeys(planContext||{}),primary=keys.primary,primaryMetres=primary?(whole.dose[primary]||0):0,primaryShare=whole.classified>0?primaryMetres/whole.classified:null,feedback=[];
      let alignment={status:'not_assessed',primaryKey:primary||null,primaryMetres,primaryShare,topDose:ranked[0]||null};
      if(primary){if(!whole.classified)alignment.status='insufficient_classification';else if(!primaryMetres)alignment.status='primary_missing';else alignment.status=ranked[0]?.key===primary?'aligned':'primary_not_dominant'}
      if(alignment.status==='aligned')feedback.push({type:'alignment',status:'ok',message:`Primary dose ${primary} is the largest classified quality dose`});
      if(alignment.status==='primary_missing')feedback.push({type:'alignment',status:'attention',message:`Planned primary dose ${primary} is not present in canonical classified work`});
      if(alignment.status==='primary_not_dominant')feedback.push({type:'alignment',status:'review',message:`Planned primary dose ${primary} is present but ${ranked[0]?.key||'another dose'} is larger`});
      if(alignment.status==='insufficient_classification')feedback.push({type:'alignment',status:'unknown',message:'No classified quality dose available; do not infer session tone from recovery/support metres'});
      for(const k of [...new Set([...keys.support,...keys.required])])if(!(whole.dose[k]>0))feedback.push({type:'support',status:'review',message:`Planned supporting dose ${k} has no classified work`});
      const unclassifiedShare=whole.total>0?whole.unclassified/whole.total:0;if(unclassifiedShare>.60)feedback.push({type:'classification',status:'info',message:`${Math.round(unclassifiedShare*100)}% of distance is support/unclassified; quality-dose alignment is calculated from classified work only`});
      return{schema:'msos.session-dose.v1',engineVersion:VERSION,sessionId:session.id,scope:delivered?.delivered_occurrences?'delivered':'current',totalDistance:whole.total,classifiedQualityDistance:whole.classified,supportOrUnclassifiedDistance:whole.unclassified,classifiedShare:whole.total>0?whole.classified/whole.total:0,dose:whole.dose,rankedDose:ranked,blocks,plan:{status:planContext?.status||'not_loaded',primaryDoseKey:primary||null,supportingDoseKeys:keys.support,requiredDoseKeys:keys.required},alignment,feedback};
    }
  }
  const create=()=>new SessionDose();
  return{VERSION,create,SessionDose,zoneKey,itemDistance,nodeDistance,sessionDistance,explicitRaceReps,zoneByRep,techniqueByRep,classifyFlat,classifySet,analyzeNodes,analyzeOccurrences,rankDose,planKeys};
});
