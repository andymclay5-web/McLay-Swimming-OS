'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-evidence-backed-mods-20260823bf',Q=M.amberAlignmentAT={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const current=()=>M.currentSession?.()||null;
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const manualShape=ov=>E.Modification.shapeOverride?.(ov)||!!(ov&&(ov.raw||['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(ov.patch||{},k))));
  const evidence=item=>M.amberRatioAP?.evidenceMeasured?.(item)===true;
  const independent=item=>M.amberRatioAP?.independentSkill?.(item)===true;
  function alignedReps(item,ath,state,session){
    const p=E.Modification.profile?.(ath,state)||{ratio:1},base=Math.max(1,Number(item?.reps)||1),d=Number(item?.distance)||0,pool=poolLength(session),ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1));
    if(ratio>=.98||!d||d%pool!==0)return Math.max(1,Math.round(base*ratio));
    const lengths=d/pool;if(lengths%2===0)return Math.max(1,Math.round(base*ratio));
    const targetMetres=base*d*ratio,c=[];
    for(let r=1;r<=base;r++)if(((r*d)/pool)%2===0)c.push({r,delta:Math.abs(r*d-targetMetres)});
    if(!c.length)return Math.max(1,Math.round(base*ratio));
    c.sort((a,b)=>a.delta-b.delta||b.r-a.r);return c[0].r;
  }
  function rewriteLead(out,reps,distance){
    const raw=text(out?.raw||out?.text),lead=reps>1?`${reps} × ${distance}`:`${distance}`;out.reps=reps;out.distance=distance;
    if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);else out.raw=`${lead}${raw?` · ${raw}`:''}`;out.text=out.raw;return out;
  }
  function rewriteCycle(out,seconds){
    if(!Number(seconds))return out;const next=M.util?.clock?.(Number(seconds))||String(seconds),fix=s=>{s=text(s);return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(s)?s.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${next}`):s};
    out.cycleSeconds=Number(seconds);out.raw=fix(out.raw||out.text);out.text=out.raw;if(Array.isArray(out.cues))out.cues=out.cues.map(fix);if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>({...x,text:fix(x.text||'')}));if(Array.isArray(out.repPattern))out.repPattern=out.repPattern.map(x=>({...x,text:x.text?fix(x.text):x.text}));if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map(x=>({...x,label:x.label?fix(x.label):x.label}));if(out.repeatBreakdownCue)out.repeatBreakdownCue=fix(out.repeatBreakdownCue);return out;
  }
  const prior=E.Modification.adaptItem.bind(E.Modification);
  function adapt(item,ath,state=M.state,session=current()){
    let out=prior(item,ath,state,session);if(!out||item?.kind!=='set'||key(ath)!=='amberproudfoot')return out;out=clone(out);
    const p=E.Modification.profile?.(ath,state)||{ratio:1},ov=activeOverride(session,item,ath,state),baseReps=Math.max(1,Number(item.reps)||1),d=Number(item.distance)||0,pool=poolLength(session),ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1));
    if(ratio<.98&&!manualShape(ov)&&!evidence(item)&&!independent(item)&&baseReps>1&&d>0&&d%pool===0&&((d/pool)%2===1)){
      const reps=alignedReps(item,ath,state,session),I=E.Modification.internals||{};
      if(reps!==Number(out.reps)){
        rewriteLead(out,reps,d);if(I.remapRepPattern)out.repPattern=I.remapRepPattern(item.repPattern,baseReps,reps);if(I.remapRepInstructions)out.repInstructions=I.remapRepInstructions(item.repInstructions,baseReps,reps);if(I.rewriteInstructionRanges)I.rewriteInstructionRanges(out,baseReps,reps);if(I.syncRepeatBreakdown)I.syncRepeatBreakdown(out,item);
      }
      const baseCycle=Number(item.cycleSeconds)||0;if(baseCycle){const cycle=text(out.adaptiveMode)==='Scull'?Math.max(120,baseCycle):baseCycle;rewriteCycle(out,cycle);out.cyclePolicy=text(out.adaptiveMode)==='Scull'?'scull hard constraint':'authored send-off preserved when only rep count changes';}
      out.adaptationReason=`${Math.round(ratio*100)}% Amber load-profile fallback · return-to-start enforced${out.adaptiveMode?` · ${out.adaptiveMode}`:''}`;
    }
    return out;
  }
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;if(M.adaptiveDelivery)M.adaptiveDelivery.adaptItem=adapt;if(M.phoneAcceptanceAO)M.phoneAcceptanceAO.adaptItem=adapt;if(M.amberRatioAP)M.amberRatioAP.adaptItem=adapt;if(M.amberAlignmentAQ)M.amberAlignmentAQ.adaptItem=adapt;if(M.amberAlignmentAS)M.amberAlignmentAS.adaptItem=adapt;Q.adaptItem=adapt;Q.alignedReps=alignedReps;
  Q.checks=()=>({scm75:'8×75 at fallback load ratio → aligned reps; authored send-off preserved',reason:'rep-count changes do not invent a longer cycle'});
})(globalThis);
