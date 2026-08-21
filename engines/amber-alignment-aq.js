'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification||!M.amberRatioAP)return;
  const BUILD='v4-amber-alignment-20260821aq',Q=M.amberAlignmentAQ={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const current=()=>M.currentSession?.()||null;
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const manualShape=ov=>E.Modification.shapeOverride?.(ov)||!!(ov&&(ov.raw||['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(ov.patch||{},k))));
  const evidenceMeasured=item=>M.amberRatioAP?.evidenceMeasured?.(item)===true;
  const independentSkill=item=>M.amberRatioAP?.independentSkill?.(item)===true;
  function alignedReps(item,ath,state,session){
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true},base=Math.max(1,Number(item?.reps)||1),d=Number(item?.distance)||0,ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1));
    if(ratio>=.98||!d||!p.returnToStart)return Math.max(1,Math.round(base*ratio));
    const unit=poolLength(session)*2,target=base*ratio,c=[];
    for(let r=1;r<=base;r++)if(Math.abs((r*d)/unit-Math.round((r*d)/unit))<.001)c.push(r);
    if(!c.length)return Math.max(1,Math.round(target));
    c.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||b-a);return c[0];
  }
  function rewriteLead(out,reps,distance){
    const raw=text(out?.raw||out?.text),lead=Number(reps)>1?`${reps} × ${distance}`:`${distance}`;out.reps=Number(reps);out.distance=Number(distance);
    if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);else out.raw=`${lead}${raw?` · ${raw}`:''}`;out.text=out.raw;return out;
  }
  function rewriteCycle(out,seconds){
    if(!Number(seconds))return out;const next=M.util?.clock?.(Number(seconds))||String(seconds),fix=s=>{s=text(s);return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(s)?s.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${next}`):s};
    out.cycleSeconds=Number(seconds);out.raw=fix(out.raw||out.text);out.text=out.raw;if(Array.isArray(out.cues))out.cues=out.cues.map(fix);if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>({...x,text:fix(x.text||'')}));if(Array.isArray(out.repPattern))out.repPattern=out.repPattern.map(x=>({...x,text:x.text?fix(x.text):x.text}));if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map(x=>({...x,label:x.label?fix(x.label):x.label}));if(out.repeatBreakdownCue)out.repeatBreakdownCue=fix(out.repeatBreakdownCue);return out;
  }
  const prior=E.Modification.adaptItem.bind(E.Modification);
  function adapt(item,ath,state=M.state,session=current()){
    let out=prior(item,ath,state,session);if(!out||item?.kind!=='set'||key(ath)!=='amberproudfoot')return out;out=clone(out);
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true},ov=activeOverride(session,item,ath,state);
    if(Number(p.ratio)<.98&&!manualShape(ov)&&!evidenceMeasured(item)&&!independentSkill(item)&&Number(item.distance)>0&&Number(item.reps)>1){
      const reps=alignedReps(item,ath,state,session),oldReps=Math.max(1,Number(item.reps)||1),d=Number(item.distance)||0;
      if(reps!==Number(out.reps)){rewriteLead(out,reps,d);const I=E.Modification.internals||{};if(I.remapRepPattern)out.repPattern=I.remapRepPattern(item.repPattern,oldReps,reps);if(I.remapRepInstructions)out.repInstructions=I.remapRepInstructions(item.repInstructions,oldReps,reps);if(I.rewriteInstructionRanges)I.rewriteInstructionRanges(out,oldReps,reps);if(I.syncRepeatBreakdown)I.syncRepeatBreakdown(out,item);}
      const baseCycle=Number(item.cycleSeconds)||0;if(baseCycle){let cycle=ceil5(oldReps*baseCycle/reps);if(text(out.adaptiveMode)==='Scull')cycle=Math.max(120,cycle);rewriteCycle(out,cycle);}
      out.adaptationReason=`${Math.round(Number(p.ratio)*100)}% Amber volume profile · pool-end aligned${out.adaptiveMode?` · ${out.adaptiveMode}`:''}`;
    }
    return out;
  }
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;if(M.adaptiveDelivery)M.adaptiveDelivery.adaptItem=adapt;if(M.phoneAcceptanceAO)M.phoneAcceptanceAO.adaptItem=adapt;if(M.amberRatioAP)M.amberRatioAP.adaptItem=adapt;Q.adaptItem=adapt;Q.alignedReps=alignedReps;
  Q.checks=()=>({policy:'Amber 2/3 plus return-to-start practicality',oddLength75:'8×75 → 6×75',scull:'ratio first, then minimum 2:00/50'});
})(globalThis);
