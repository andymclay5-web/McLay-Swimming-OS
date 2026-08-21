'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification||!M.phoneAcceptanceAO)return;
  const BUILD='v4-amber-ratio-20260821ap',A=M.amberRatioAP={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const current=()=>M.currentSession?.()||null;
  const rawOf=item=>text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const independentSkill=item=>/\b(?:dive|start|turn|finish)\b/i.test(rawOf(item))&&!/\b(?:kick|fins?|underwater)\b/i.test(rawOf(item));
  const evidenceMeasured=item=>!!(item?.targetSeconds||item?.zone||(item?.repPattern||[]).length||item?.raceIntent||(item?.repInstructions||[]).some(x=>x?.raceIntent));
  const manualShape=ov=>E.Modification.shapeOverride?.(ov)||false;
  function rewriteLead(out,reps,distance){
    const raw=text(out?.raw||out?.text),lead=Number(reps)>1?`${reps} × ${distance}`:`${distance}`;out.reps=Number(reps);out.distance=Number(distance);
    if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);
    else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);
    else out.raw=`${lead}${raw?` · ${raw}`:''}`;out.text=out.raw;return out;
  }
  function rewriteCycle(out,seconds){
    if(!Number(seconds))return out;const next=clock(seconds),fix=s=>{s=text(s);return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(s)?s.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${next}`):s};
    out.cycleSeconds=Number(seconds);out.raw=fix(out.raw||out.text);out.text=out.raw;
    if(Array.isArray(out.cues))out.cues=out.cues.map(fix);
    if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>({...x,text:fix(x.text||'')}));
    if(Array.isArray(out.repPattern))out.repPattern=out.repPattern.map(x=>({...x,text:x.text?fix(x.text):x.text}));
    if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map(x=>({...x,label:x.label?fix(x.label):x.label}));
    if(out.repeatBreakdownCue)out.repeatBreakdownCue=fix(out.repeatBreakdownCue);
    return out;
  }
  function applyAmberRatio(out,item,ath,state,session){
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true},ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1)),ov=activeOverride(session,item,ath,state);
    if(ratio>=.98||manualShape(ov)||independentSkill(item)||evidenceMeasured(item))return out;
    const oldReps=Math.max(1,Number(item?.reps)||1),oldDistance=Number(item?.distance)||0,internals=E.Modification.internals||{};
    if(oldReps>1&&oldDistance>0){
      const newReps=E.Modification.safeReps?E.Modification.safeReps(oldReps,oldDistance,ratio,session,p.returnToStart):Math.max(1,Math.round(oldReps*ratio));
      if(newReps!==oldReps){
        rewriteLead(out,newReps,oldDistance);
        if(internals.remapRepPattern)out.repPattern=internals.remapRepPattern(item.repPattern,oldReps,newReps);
        if(internals.remapRepInstructions)out.repInstructions=internals.remapRepInstructions(item.repInstructions,oldReps,newReps);
        if(internals.rewriteInstructionRanges)internals.rewriteInstructionRanges(out,oldReps,newReps);
        if(internals.syncRepeatBreakdown)internals.syncRepeatBreakdown(out,item);
        const baseCycle=Number(item.cycleSeconds)||0;if(baseCycle){let next=ceil5(oldReps*baseCycle/newReps);if(text(out.adaptiveMode)==='Scull')next=Math.max(120,next);rewriteCycle(out,next);}
      }
    }else if(oldReps===1&&oldDistance>=100){
      const newDistance=E.Modification.safeDistance?E.Modification.safeDistance(oldDistance,ratio,session,p.returnToStart,Math.min(100,oldDistance)):Math.max(25,Math.round(oldDistance*ratio/25)*25);
      if(newDistance!==oldDistance){rewriteLead(out,1,newDistance);if(internals.remapComposition)out.composition=internals.remapComposition(item.composition,oldDistance,newDistance,session);}
    }
    out.adaptationReason=`${Math.round(ratio*100)}% Amber volume profile${out.adaptiveMode?` · ${out.adaptiveMode}`:''}`;return out;
  }
  const prior=E.Modification.adaptItem.bind(E.Modification);
  function adapt(item,ath,state=M.state,session=current()){
    let out=prior(item,ath,state,session);if(!out||item?.kind!=='set'||key(ath)!=='amberproudfoot')return out;out=clone(out);
    out=applyAmberRatio(out,item,ath,state,session);
    if(text(out.adaptiveMode)==='Scull'&&Number(out.cycleSeconds||0)<120)rewriteCycle(out,120);
    return out;
  }
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;if(M.adaptiveDelivery)M.adaptiveDelivery.adaptItem=adapt;M.phoneAcceptanceAO.adaptItem=adapt;A.adaptItem=adapt;
  A.evidenceMeasured=evidenceMeasured;A.independentSkill=independentSkill;
  A.checks=()=>({policy:'Amber 2/3 on non-T400/PB work',scullMinimumPer50:120,skillException:'start/turn/finish full team work',evidenceException:'target-driven work remains target-engine controlled'});
})(globalThis);
