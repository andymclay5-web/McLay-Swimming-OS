'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification)return;
  const BUILD='v4-para-mqs-stable-20260821as',Q=M.amberAlignmentAS={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const current=()=>M.currentSession?.()||null;
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const evidence=item=>M.amberRatioAP?.evidenceMeasured?.(item)===true;
  const independent=item=>M.amberRatioAP?.independentSkill?.(item)===true;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const manualShape=ov=>E.Modification.shapeOverride?.(ov)||!!(ov&&(ov.raw||['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(ov.patch||{},k))));
  function rewriteLead(out,reps,distance){const raw=text(out?.raw||out?.text),lead=reps>1?`${reps} × ${distance}`:`${distance}`;out.reps=reps;out.distance=distance;if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);else out.raw=`${lead}${raw?` · ${raw}`:''}`;out.text=out.raw;return out;}
  function alignedReps(item,ath,state,session){
    const p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true},base=Math.max(1,Number(item?.reps)||1),d=Number(item?.distance)||0,pool=poolLength(session),ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1));
    if(ratio>=.98||!p.returnToStart||!d||d%pool!==0)return Math.max(1,Math.round(base*ratio));
    const lengths=d/pool;if(lengths%2===0)return Math.max(1,Math.round(base*ratio));
    const target=base*ratio,c=[];for(let r=1;r<=base;r++)if((r*lengths)%2===0)c.push(r);if(!c.length)return Math.max(1,Math.round(target));c.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||b-a);return c[0];
  }
  const prior=E.Modification.adaptItem.bind(E.Modification);
  function adapt(item,ath,state=M.state,session=current()){
    let out=prior(item,ath,state,session);if(!out||item?.kind!=='set'||key(ath)!=='amberproudfoot')return out;out=clone(out);
    const ov=activeOverride(session,item,ath,state),p=E.Modification.profile?.(ath,state)||{ratio:1,returnToStart:true},d=Number(item.distance)||0,pool=poolLength(session);
    if(Number(p.ratio)<.98&&!manualShape(ov)&&!evidence(item)&&!independent(item)&&Number(item.reps)>1&&d>0&&d%pool===0&&((d/pool)%2===1)){
      const reps=alignedReps(item,ath,state,session);if(reps!==Number(out.reps)){
        const oldReps=Math.max(1,Number(item.reps)||1),I=E.Modification.internals||{};rewriteLead(out,reps,d);if(I.remapRepPattern)out.repPattern=I.remapRepPattern(item.repPattern,oldReps,reps);if(I.remapRepInstructions)out.repInstructions=I.remapRepInstructions(item.repInstructions,oldReps,reps);if(I.rewriteInstructionRanges)I.rewriteInstructionRanges(out,oldReps,reps);if(I.syncRepeatBreakdown)I.syncRepeatBreakdown(out,item);
      }
      out.adaptationReason=`${Math.round(Number(p.ratio)*100)}% Amber volume profile · return-to-start aligned${out.adaptiveMode?` · ${out.adaptiveMode}`:''}`;
    }
    return out;
  }
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;if(M.adaptiveDelivery)M.adaptiveDelivery.adaptItem=adapt;if(M.phoneAcceptanceAO)M.phoneAcceptanceAO.adaptItem=adapt;if(M.amberRatioAP)M.amberRatioAP.adaptItem=adapt;if(M.amberAlignmentAQ)M.amberAlignmentAQ.adaptItem=adapt;Q.adaptItem=adapt;Q.alignedReps=alignedReps;
})(globalThis);
