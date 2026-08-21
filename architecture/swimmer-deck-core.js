'use strict';
(function(root,factory){const deps=typeof module==='object'&&module.exports?{Performance:require('./performance-core')}:(root.MSOSArchitecture||{});const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.SwimmerDeck=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(A){
  const VERSION='1.0.0-ax';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function quickView({athlete,resultRows=[],milestones=[],pointsFor=null,course='',opportunities=[]}={}){
    const all=A.Performance.dedupePBs(resultRows),filter=text(course).toUpperCase(),pbs=filter?all.filter(x=>x.course===filter):all,ranked=A.Performance.rankedEvents(pbs,pointsFor),gaps=A.Performance.allEventGaps(pbs,milestones);
    const gapMap=new Map(gaps.map(g=>[g.pb.key,g.next]));
    return{athleteId:athlete?.id||null,athleteName:athlete?.full_name||'',course:filter||'ALL',pbs:pbs.map(pb=>({...pb,next:gapMap.get(pb.key)||null})),bestEvents:ranked.map((x,i)=>({rank:i+1,key:x.pb.key,course:x.pb.course,distance:x.pb.distance,stroke:x.pb.stroke,seconds:x.pb.seconds,points:x.points})),gaps:gaps.map(x=>({key:x.pb.key,event:`${x.pb.distance} ${x.pb.stroke}`,course:x.pb.course,pbSeconds:x.pb.seconds,next:x.next})),opportunities:[...(opportunities||[])],eventCount:pbs.length};
  }
  function eventAnswer(view,{distance,stroke,course=''}){const p=A.Performance.findPB(view?.pbs||[],{distance,stroke,course});if(!p)return null;return{event:`${p.distance} ${p.stroke}`,course:p.course,seconds:p.seconds,next:p.next||null,provenanceCount:p.provenance?.length||1};}
  function dedupeProof(view){const keys=(view?.pbs||[]).map(x=>x.key);return{unique:new Set(keys).size===keys.length,count:keys.length,duplicates:keys.filter((x,i)=>keys.indexOf(x)!==i)};}
  return{VERSION,quickView,eventAnswer,dedupeProof};
});
