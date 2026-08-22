'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.AdaptationEvidence=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1-bf';
  const finite=v=>Number.isFinite(Number(v));
  const n=v=>Number(v);
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const round5=v=>Math.max(5,Math.round(n(v)/5)*5);

  function speedFactor(athleteSeconds,referenceSeconds){
    if(!finite(athleteSeconds)||!finite(referenceSeconds)||n(athleteSeconds)<=0||n(referenceSeconds)<=0)return null;
    return n(referenceSeconds)/n(athleteSeconds);
  }

  function workRest(targetSeconds,cycleSeconds){
    if(!finite(targetSeconds)||!finite(cycleSeconds)||n(targetSeconds)<=0||n(cycleSeconds)<=0)return null;
    const work=n(targetSeconds),cycle=n(cycleSeconds),rest=Math.max(0,cycle-work);
    return{workSeconds:work,restSeconds:rest,workFraction:work/cycle,restFraction:rest/cycle,workRestRatio:rest>0?work/rest:Infinity};
  }

  function cycleForWorkRest(athleteTargetSeconds,referenceTargetSeconds,referenceCycleSeconds,{roundTo5=true}={}){
    if(!finite(athleteTargetSeconds)||!finite(referenceTargetSeconds)||!finite(referenceCycleSeconds))return null;
    const at=n(athleteTargetSeconds),rt=n(referenceTargetSeconds),rc=n(referenceCycleSeconds);
    if(at<=0||rt<=0||rc<=0)return null;
    const raw=at*(rc/rt);
    return roundTo5?round5(raw):raw;
  }

  function practicalDistances({baseDistance,poolLength=25,reps=1,returnToStart=false,minDistance=25}){
    const base=n(baseDistance),pool=n(poolLength)||25,r=Math.max(1,Math.round(n(reps)||1)),min=Math.max(pool,n(minDistance)||pool),out=[];
    if(base<=0)return out;
    for(let d=min;d<=base+1e-9;d+=pool){
      if(returnToStart){const lengths=(r*d)/pool;if(Math.abs(lengths-Math.round(lengths))>.001||Math.round(lengths)%2)continue;}
      out.push(d);
    }
    if(!out.length)out.push(base);
    return out;
  }

  function nearestPracticalDistance({baseDistance,factor,poolLength=25,reps=1,returnToStart=false,minDistance=25}){
    if(!finite(factor)||n(factor)<=0)return null;
    const ideal=n(baseDistance)*clamp(n(factor),.25,1.5),rows=practicalDistances({baseDistance,poolLength,reps,returnToStart,minDistance});
    rows.sort((a,b)=>Math.abs(a-ideal)-Math.abs(b-ideal)||b-a);
    return{distance:rows[0],idealDistance:ideal,factor:n(factor),candidates:rows.slice()};
  }

  function targetLookup(targets,distance){
    if(!targets)return null;
    if(typeof targets==='function'){const v=targets(distance);return finite(v)&&n(v)>0?n(v):null;}
    const v=targets[distance]??targets[String(distance)];return finite(v)&&n(v)>0?n(v):null;
  }

  function chooseEvidenceDistance({baseDistance,baseReps=1,poolLength=25,returnToStart=false,minDistance=25,referenceTargetSeconds,athleteTargets,athleteAnchorSeconds,referenceAnchorSeconds}){
    const refTarget=finite(referenceTargetSeconds)&&n(referenceTargetSeconds)>0?n(referenceTargetSeconds):null;
    const factor=speedFactor(athleteAnchorSeconds,referenceAnchorSeconds);
    const rows=practicalDistances({baseDistance,poolLength,reps:baseReps,returnToStart,minDistance});
    const scored=[];
    for(const d of rows){
      const target=targetLookup(athleteTargets,d);
      let score=0,why=[];
      if(refTarget&&target){const e=Math.abs(target-refTarget)/refTarget;score+=e*100;why.push(`work-time ${Math.round(e*1000)/10}%`);}
      else if(factor){const ideal=n(baseDistance)*factor,e=Math.abs(d-ideal)/Math.max(1,ideal);score+=e*100;why.push(`speed-scale ${Math.round(e*1000)/10}%`);}
      else continue;
      const change=Math.abs(n(baseDistance)-d)/Math.max(1,n(baseDistance));score+=change*2;
      scored.push({distance:d,targetSeconds:target,score,why});
    }
    scored.sort((a,b)=>a.score-b.score||b.distance-a.distance);
    if(!scored.length)return null;
    return{...scored[0],factor,idealDistance:factor?n(baseDistance)*factor:null,candidates:scored};
  }

  function planLine(input={}){
    const baseDistance=n(input.baseDistance)||0,baseReps=Math.max(1,Math.round(n(input.baseReps)||1)),baseCycle=finite(input.baseCycleSeconds)?n(input.baseCycleSeconds):null;
    const evidence=chooseEvidenceDistance(input);
    if(evidence){
      const target=evidence.targetSeconds;
      let cycle=baseCycle;
      let cycleSource=baseCycle?'authored-cycle':'';
      if(target&&finite(input.referenceTargetSeconds)&&baseCycle){
        const matched=cycleForWorkRest(target,n(input.referenceTargetSeconds),baseCycle);
        if(matched&&Math.abs(matched-baseCycle)<=2.5){cycle=baseCycle;cycleSource='shared-cycle-work-rest-close';}
        else if(matched){cycle=matched;cycleSource='matched-work-rest';}
      }
      return{mode:'evidence',reps:baseReps,distance:evidence.distance,targetSeconds:target,cycleSeconds:cycle,cycleSource,speedFactor:evidence.factor,referenceTargetSeconds:finite(input.referenceTargetSeconds)?n(input.referenceTargetSeconds):null,evidenceSource:input.evidenceSource||'',targetSource:input.targetSource||'',confidence:input.confidence||'evidence-backed',reason:evidence.why.join(' · ')};
    }
    const fallback=finite(input.fallbackLoadRatio)?clamp(n(input.fallbackLoadRatio),.25,1):1;
    return{mode:'fallback-load',reps:baseReps,distance:baseDistance,targetSeconds:null,cycleSeconds:baseCycle,cycleSource:baseCycle?'authored-cycle':'',speedFactor:null,referenceTargetSeconds:null,evidenceSource:'',targetSource:'',confidence:'fallback-only',reason:`${Math.round(fallback*100)}% load guide available; no performance evidence supplied`,targetRequired:!!input.targetDriven};
  }

  function decisionRecord({sessionId='',itemId='',athleteId='',plan,evidenceIds=[],ruleVersion=VERSION,createdAt=''}={}){
    return{schemaVersion:1,kind:'adaptation_decision',sessionId,itemId,athleteId,ruleVersion,createdAt:createdAt||new Date().toISOString(),plan:plan?JSON.parse(JSON.stringify(plan)):null,evidenceIds:[...new Set((evidenceIds||[]).filter(Boolean))],historicalImmutable:true,recalculateFutureFromLatestEvidence:true};
  }

  return{VERSION,speedFactor,workRest,cycleForWorkRest,practicalDistances,nearestPracticalDistance,chooseEvidenceDistance,planLine,decisionRecord};
});
