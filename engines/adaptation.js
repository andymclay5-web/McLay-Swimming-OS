'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Adaptation=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const FALLBACKS={
    charlottemurphy:{ratio:.50,label:'~½ volume when condensation is needed · preserve theme/quality · return to starting end',returnToStart:true},
    conorfischer:{ratio:.50,label:'~½ volume when condensation is needed · preserve theme/quality',returnToStart:false},
    mckenziedrage:{ratio:2/3,label:'~⅔ volume when condensation is needed · preserve theme/quality · return to starting end',returnToStart:true,roundUpReturn:true},
    amberproudfoot:{ratio:2/3,label:'~⅔ volume when condensation is needed · upper-body equivalent where constraint applies',returnToStart:false},
    matthewkofoed:{ratio:2/3,label:'~⅔ volume when condensation is needed',returnToStart:false},
    rubystace:{ratio:2/3,label:'~⅔ volume when condensation is needed',returnToStart:false}
  };
  function poolLength(session){return /LCM/i.test(text(session?.identity?.course))?50:25}
  function patternSpan(item){return(item?.pattern||[]).reduce((n,x)=>n+(num(x.count)||0),0)}
  function coversPattern(item){const span=patternSpan(item),reps=Math.max(1,num(item?.reps)||1);return span>0&&reps%span===0}
  function rawText(item){return[item?.raw,item?.text,item?.zone,...(item?.cues||[]),...(item?.pattern||[]).map(x=>x.text),...(item?.phases||[]).map(x=>x.text||x.raw)].filter(Boolean).join(' ')}
  function isAerobic(item){return!!item?.zone||/\b(?:regeneration|regen|development|overload|threshold|clearance|aerobic|capacity|vo2)\b/i.test(rawText(item))}
  function isQuality(item){const raw=rawText(item),d=num(item?.distance)||0,r=Math.max(1,num(item?.reps)||1);if(isAerobic(item))return false;return d>0&&d<=100&&r<=4&&/\b(?:descend|build|fast|max|sprint|race|pace|quality|underwater|drill|scull|skill|turn|start)\b/i.test(raw)}
  function sameTeamExposure(item){const raw=rawText(item),d=num(item?.distance)||0,r=Math.max(1,num(item?.reps)||1);if(isQuality(item))return true;if(isAerobic(item)||d<=0||d>50||r>8)return false;return/\b(?:max|sprint|race|pace|quality|fast|underwater|drill|scull|skill|build|turn|start)\b/i.test(raw)}
  function sameWork(a,b){const arr=v=>(v||[]).map(text).sort().join('|').toLowerCase();return(num(a?.reps)||1)===(num(b?.reps)||1)&&(num(a?.distance)||0)===(num(b?.distance)||0)&&text(a?.stroke).toLowerCase()===text(b?.stroke).toLowerCase()&&(num(a?.restSeconds)||0)===(num(b?.restSeconds)||0)&&(num(a?.cycleSeconds)||0)===(num(b?.cycleSeconds)||0)&&arr(a?.equipment)===arr(b?.equipment)&&JSON.stringify(a?.pattern||[])===JSON.stringify(b?.pattern||[])&&JSON.stringify(a?.phases||[])===JSON.stringify(b?.phases||[])}
  function nearestWholePattern(reps,ratio,span){const target=reps*ratio,c=[];for(let r=span;r<=reps;r+=span)c.push({reps:r,delta:Math.abs(r-target)});if(!c.length)return reps;c.sort((a,b)=>a.delta-b.delta||b.reps-a.reps);return c[0].reps}
  function scaleReps(item,ratio){const reps=Math.max(1,num(item?.reps)||1);if(ratio>=.98)return reps;const span=patternSpan(item);if(span>0&&coversPattern(item))return nearestWholePattern(reps,ratio,span);return Math.max(1,Math.round(reps*ratio))}
  function scaleContinuousDistance(distance,ratio,session,{returnToStart=false,roundUpReturn=false}={}){const d=num(distance)||0;if(ratio>=.98||d<=0)return d;const pool=poolLength(session),unit=returnToStart?pool*2:pool,target=Math.max(unit,d*ratio),steps=roundUpReturn?Math.ceil(target/unit):Math.round(target/unit);return Math.min(d,Math.max(unit,steps*unit))}
  function constraintFor(ath,item){
    const k=key(ath?.full_name),raw=rawText(item);
    if(k==='conorfischer'&&/\b(?:breaststroke|breast|br)\b/i.test(raw)&&/\bfins?\b/i.test(raw))return{type:'substitution',reason:'No Breaststroke kick with fins',apply:x=>{x.stroke='Choice';x.raw=`${x.reps} × ${x.distance} Choice non-Breaststroke with Fins`;return x}};
    if(k==='amberproudfoot'&&/\b(?:kick|fins?|underwater|dive|start)\b/i.test(raw))return{type:'substitution',reason:'Upper-body equivalent · same work window',apply:x=>{x.stroke='Choice';x.equipment=(x.equipment||[]).filter(z=>!/fins?/i.test(text(z)));x.raw=`${x.reps} × ${x.distance} Upper-body equivalent · same work window`;return x}};
    return null;
  }

  class Adaptation{
    constructor({evidence,profiles=[],overrides=[],clock=()=>new Date().toISOString()}={}){if(!evidence||typeof evidence.resolveAthlete!=='function')throw new Error('Adaptation Engine requires Evidence Retrieval for athlete identity');this.evidence=evidence;this.profiles=clone(profiles||[]);this.overrides=clone(overrides||[]);this.clock=clock}
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    profile(athleteRef){const ath=this.athlete(athleteRef);if(!ath)return null;const stored=this.profiles.find(x=>x.athlete_id===ath.id&&x.active!==false),fallback=FALLBACKS[key(ath.full_name)]||{},raw=num(stored?.default_volume_ratio),ratio=raw!==null&&raw>0?Math.max(.25,Math.min(1,raw)):(fallback.ratio||1);return{athleteId:ath.id,key:key(ath.full_name),ratio,label:text(stored?.profile_label||fallback.label||ath.modifications),returnToStart:stored?.return_to_starting_end===true||fallback.returnToStart===true,roundUpReturn:stored?.round_up_return===true||fallback.roundUpReturn===true,source:stored?'stored':'fallback'}}
    listOverrides({sessionId='',itemId='',athleteId=''}={}){return clone(this.overrides.filter(x=>x.active!==false).filter(x=>!sessionId||x.sessionId===sessionId).filter(x=>!itemId||x.itemId===itemId).filter(x=>!athleteId||x.athleteId===athleteId))}
    override(session,item,ath){return this.overrides.filter(x=>x.active!==false&&x.athleteId===ath.id&&x.sessionId===session?.id&&x.itemId===item?.id).sort((a,b)=>text(b.updatedAt||b.updated_at).localeCompare(text(a.updatedAt||a.updated_at)))[0]||null}
    setOverride(session,item,athleteRef,prescription,{reason='Coach override'}={}){
      const sid=text(session?.id),iid=text(item?.id),ath=this.athlete(athleteRef);if(!sid)throw new Error('Adaptation override requires exact session id');if(!iid)throw new Error('Adaptation override requires exact item id');if(!ath)throw new Error(`Athlete not found: ${athleteRef}`);
      const at=this.clock(),row={id:`adapt-${sid}-${iid}-${ath.id}`,sessionId:sid,itemId:iid,athleteId:ath.id,prescription:clone(prescription||{}),reason:text(reason)||'Coach override',active:true,updatedAt:at};
      const i=this.overrides.findIndex(x=>x.sessionId===sid&&x.itemId===iid&&x.athleteId===ath.id);if(i>=0)this.overrides[i]=row;else this.overrides.push(row);return clone(row);
    }
    clearOverride(session,item,athleteRef){const sid=text(session?.id),iid=text(item?.id),ath=this.athlete(athleteRef);if(!sid||!iid||!ath)return false;const before=this.overrides.length;this.overrides=this.overrides.filter(x=>!(x.sessionId===sid&&x.itemId===iid&&x.athleteId===ath.id));return this.overrides.length!==before}
    applyOverride(item,override){const x=clone(item),p=override?.prescription||override?.work||override||{};for(const field of ['reps','distance','stroke','restSeconds','cycleSeconds','raw'])if(p[field]!==undefined)x[field]=clone(p[field]);if(p.equipment!==undefined)x.equipment=clone(p.equipment);if(p.pattern!==undefined)x.pattern=clone(p.pattern);if(p.phases!==undefined)x.phases=clone(p.phases);return x}
    adaptPhase(session,parent,phase,ath,profile){const child={...clone(parent),...clone(phase),reps:num(phase?.reps)||num(phase?.count)||1,distance:num(phase?.distance)||num(parent?.distance),raw:phase?.raw||phase?.text||parent?.raw,phases:[],pattern:clone(phase?.pattern||[]),cues:clone(phase?.cues||[])};const result=this.adaptItem(session,child,ath.id,{profile,allowOverride:false});return{...clone(phase),reps:result.prescription.reps,distance:result.prescription.distance,stroke:result.prescription.stroke||phase.stroke,equipment:clone(result.prescription.equipment||phase.equipment||[]),pattern:clone(result.prescription.pattern||phase.pattern||[]),adaptationReason:result.reason,sameAsGroup:result.sameAsGroup}}
    adaptItem(session,item,athleteRef,{profile:profileOverride=null,allowOverride=true}={}){
      const ath=this.athlete(athleteRef);if(!ath)return{status:'missing_athlete',sameAsGroup:true,prescription:clone(item),reason:'Athlete not found',profile:null};
      const profile=profileOverride||this.profile(ath.id)||{ratio:1,returnToStart:false,roundUpReturn:false},explicit=allowOverride?this.override(session,item,ath):null;
      if(explicit){const prescription=this.applyOverride(item,explicit);return{status:'ok',sameAsGroup:sameWork(item,prescription),prescription,reason:text(explicit.reason||'Explicit coach override'),profile,source:'override'}}
      const preserveTeam=isQuality(item)||sameTeamExposure(item);let x=clone(item),reasons=[];const constraint=constraintFor(ath,item);if(constraint){x=constraint.apply(x);reasons.push(constraint.reason)}
      if(profile.ratio<.98){
        if((x.phases||[]).length){x.phases=x.phases.map(p=>this.adaptPhase(session,x,p,ath,profile));x.reps=x.phases.reduce((n,p)=>n+(num(p.reps)||0),0);reasons.push('Phase structure preserved')}
        else if(preserveTeam){reasons.push('Same-team quality exposure preserved')}
        else if((num(x.reps)||1)===1){const before=num(x.distance)||0,x2=scaleContinuousDistance(before,profile.ratio,session,profile);x.distance=x2;if(x2!==before)reasons.push(`Continuous volume ${before} → ${x2}m${profile.returnToStart?' · returns to starting end':''}`)}
        else{const before=num(x.reps)||1,after=scaleReps(x,profile.ratio);x.reps=after;if(after!==before)reasons.push(`Volume ${before} → ${after} reps${patternSpan(x)?' · whole pattern preserved':''}`)}
      }
      const same=sameWork(item,x);return{status:'ok',sameAsGroup:same,prescription:x,reason:same?(reasons[0]||'Same as group'):reasons.join(' · ')||profile.label||'Athlete adaptation',profile,source:'derived'};
    }
    forItem(session,item,athleteRef){return this.adaptItem(session,item,athleteRef)}
    forAthletes(session,item,athleteRefs=[]){return(athleteRefs||[]).map(ref=>{const ath=this.athlete(ref);return{athlete:ath,result:this.adaptItem(session,item,ref)}})}
  }
  const create=options=>new Adaptation(options);
  return{VERSION,create,Adaptation,FALLBACKS,poolLength,patternSpan,coversPattern,isAerobic,isQuality,sameTeamExposure,sameWork,scaleReps,scaleContinuousDistance,constraintFor};
});
