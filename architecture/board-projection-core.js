'use strict';
(function(root,factory){const deps=typeof module==='object'&&module.exports?{Projection:require('./projection-core')}:(root.MSOSArchitecture||{});const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.BoardProjection=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(A){
  const VERSION='1.0.0-ax';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const round5=n=>Math.round(Number(n||0)/5)*5;
  function clock(s){if(!Number.isFinite(Number(s)))return'';s=Number(s);const m=Math.floor(s/60),x=Math.round((s-m*60)*10)/10;const tail=x.toFixed(Number.isInteger(x)?0:1).padStart(Number.isInteger(x)?2:4,'0');return m?`${m}:${tail}`:tail;}
  function practicalTarget(target,{windowSeconds=2,roundSeconds=1}={}){
    if(!target||target.status==='none'||target.status==='missing')return null;
    if(target.kind==='hr_sr')return{kind:'physiology',label:`HR ${target.hr}${target.sr?` · SR ${target.sr}`:''}`};
    const sec=Number(target.seconds);if(!Number.isFinite(sec))return null;const rounded=Math.round(sec/roundSeconds)*roundSeconds;return{kind:'pace',low:Math.max(0,rounded-windowSeconds),high:rounded+windowSeconds,center:rounded,label:`${clock(Math.max(0,rounded-windowSeconds))}–${clock(rounded+windowSeconds)}`,sendOff:Number(target.sendOff)||null};
  }
  function bandKey(p){if(!p)return'none';if(p.kind==='physiology')return`phys|${p.label}`;return`pace|${round5(p.center)}|${round5(p.sendOff||0)}`;}
  function targetBands(rows=[]){const map=new Map();for(const row of rows){const p=practicalTarget(row.target);const k=bandKey(p);if(!map.has(k))map.set(k,{key:k,target:p,athletes:[],rows:[]});const b=map.get(k);if(row.athlete)b.athletes.push(row.athlete);b.rows.push(row);}return[...map.values()].sort((a,b)=>{const aa=a.target?.center??Infinity,bb=b.target?.center??Infinity;return aa-bb||b.athletes.length-a.athletes.length;});}
  function normalizePrescription(row){const item=row.item||row.prescription?.item||row,target=row.target||row.prescription?.target||null;return{...row,item,target,timingOwnership:A.Projection?.timingOwnership?.(item)||'shared'};}
  function workFingerprint(row){const i=row?.item||row||{};return JSON.stringify({reps:Number(i.reps)||1,distance:Number(i.distance)||0,stroke:text(i.stroke),cycle:Number(i.cycleSeconds)||0,rest:Number(i.restSeconds)||0,equipment:[...(i.equipment||[])].map(text).sort(),cues:(i.cues||[]).map(text).filter(Boolean),zone:text(i.zone),pattern:(i.repPattern||[]).map(x=>`${x.rep}:${x.zone||x.label||''}`),adaptiveMode:text(i.adaptiveMode)});}
  function workGroups(rows=[]){const map=new Map();for(const row of rows){const k=workFingerprint(row);if(!map.has(k))map.set(k,{fingerprint:k,item:row.item,athletes:[],rows:[]});const g=map.get(k);if(row.athlete)g.athletes.push(row.athlete);g.rows.push(row);}return[...map.values()].sort((a,b)=>b.athletes.length-a.athletes.length||a.fingerprint.localeCompare(b.fingerprint));}
  function projectCurrent({context,timeline,prescriptions=[]}={}){
    const rows=prescriptions.map(normalizePrescription),timing=new Set(rows.map(r=>r.timingOwnership));const ownership=timing.size===1?[...timing][0]:timing.has('coach')?'coach':timing.has('athlete')?'athlete':'shared';
    return{nowNext:A.Projection?.boardNowNext?.(context,timeline)||{now:null,next:null},timingOwnership:ownership,timingLabel:ownership==='coach'?'COACH TIME':ownership==='athlete'?'SELF CLOCK':'SHARED',prescriptionGroups:workGroups(rows),targetBands:targetBands(rows),contextConfidence:context?.confidence??0,contextSource:context?.source||'timeline'};
  }
  function compactGroups(groups=[]){return groups.map(g=>({athleteIds:g.athletes.map(a=>a.id),athleteNames:g.athletes.map(a=>a.board_name||a.preferred_name||a.full_name||a.id),work:text(g.item?.raw||g.item?.text||''),target:practicalTarget(g.target),count:g.athletes.length}));}
  return{VERSION,clock,practicalTarget,targetBands,workFingerprint,workGroups,projectCurrent,compactGroups};
});
