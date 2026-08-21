'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Projection=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const stable=v=>JSON.stringify(v,Object.keys(v||{}).sort());
  function timingOwnership(item={}){
    const raw=text([item.raw,item.text,...(item.cues||[])].join(' '));
    if(item.timingOwnership)return item.timingOwnership;
    if(item.raceIntent||item.repInstructions?.some(x=>x.raceIntent)||/\b(?:race\s*pace|max|sprint|test|time\s*trial|timed|split|dive|start|finish)\b/i.test(raw))return'coach';
    if(item.zone||item.repPattern?.some(x=>x.zone)||/\b(?:regeneration|development|overload|threshold|clearance|aerobic)\b/i.test(raw))return'athlete';
    return'shared';
  }
  function cleanCues(cues){return(cues||[]).map(text).filter(Boolean).filter(x=>!/^(?:source|debug|engine)\b/i.test(x));}
  function fingerprint(row){const i=row?.item||row||{},t=row?.target||{};return stable({reps:Number(i.reps)||1,distance:Number(i.distance)||0,stroke:text(i.stroke),cycle:Number(i.cycleSeconds)||0,rest:Number(i.restSeconds)||0,equipment:[...(i.equipment||[])].map(text).sort(),cues:cleanCues(i.cues),zone:text(i.zone),pattern:(i.repPattern||[]).map(x=>`${x.rep}:${x.zone||x.label||''}`),targetStatus:t.status||'',targetSeconds:Number.isFinite(Number(t.seconds))?Math.round(Number(t.seconds)*10)/10:null,targetSendOff:Number(t.sendOff)||0,adaptiveMode:text(i.adaptiveMode)});}
  function groupPrescriptions(rows=[]){const map=new Map();for(const row of rows){const fp=fingerprint(row);if(!map.has(fp))map.set(fp,{fingerprint:fp,item:row.item||row,target:row.target||null,athletes:[],rows:[]});const g=map.get(fp);if(row.athlete)g.athletes.push(row.athlete);else if(row.athleteId)g.athletes.push({id:row.athleteId,full_name:row.athleteName||row.athleteId});g.rows.push(row);}return[...map.values()].sort((a,b)=>b.athletes.length-a.athletes.length||a.fingerprint.localeCompare(b.fingerprint));}
  function projectAthleteSession(session,athlete,derivePrescription){
    if(typeof derivePrescription!=='function')throw new Error('derivePrescription required');
    const blocks=(session?.blocks||[]).map(block=>({id:block.id,title:block.title||block.type,items:(block.items||[]).map(item=>({canonicalItemId:item.id,canonicalSessionId:session.id,prescription:derivePrescription(session,item,athlete)}))}));
    return{projectionType:'athlete_session',canonicalSessionId:session?.id||null,athleteId:athlete?.id||null,originalPlanId:session?.originalPlanId||session?.id||null,blocks};
  }
  function boardNowNext(context,timeline){const rows=timeline?.rows||[],idx=Math.max(0,rows.findIndex(r=>r.itemId===context?.itemId)),now=rows[idx]||null,next=rows[idx+1]||null;return{now,next,confidence:context?.confidence??0,source:context?.source||'timeline'};}
  return{VERSION,timingOwnership,fingerprint,groupPrescriptions,projectAthleteSession,boardNowNext};
});
