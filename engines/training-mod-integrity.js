'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification?.adaptItem)return;
  const BUILD='v4-training-mod-integrity-20260831a';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const clock=s=>`${Math.floor(Number(s||0)/60)}:${String(Math.round(Number(s||0)%60)).padStart(2,'0')}`;
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const rawOf=x=>text([x?.raw,x?.text,...(x?.cues||[])].filter(Boolean).join(' '));
  const base=E.Modification.adaptItem.bind(E.Modification);

  function rewriteCycle(out,next){
    next=Math.max(0,Number(next)||0);if(!next)return out;const old=Number(out?.cycleSeconds)||0,n=clock(next),o=old?clock(old):'';
    const fix=v=>{v=text(v);if(!v)return v;if(o){const re=new RegExp(`(?:@|on)\\s*${o.replace(':','[:.]')}`,'i');if(re.test(v))return v.replace(re,`@ ${n}`);}return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(v)?v.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${n}`):v;};
    out.cycleSeconds=next;out.raw=fix(out.raw||out.text);out.text=out.raw;if(Array.isArray(out.cues))out.cues=out.cues.map(fix);return out;
  }
  function coachOverride(item,ath,state,session){return(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);}
  function hasManualTiming(item,ath,state,session){const p=coachOverride(item,ath,state,session)?.patch||{};return Object.prototype.hasOwnProperty.call(p,'cycleSeconds')||Object.prototype.hasOwnProperty.call(p,'restSeconds');}
  function kickIntegrity(source,out,ath,state,session){
    if(!/\bkick\b/i.test(rawOf(source))||Number(source?.distance)!==50||hasManualTiming(source,ath,state,session))return out;
    const k=key(ath),ratio=Number(E.Modification.profile?.(ath,state)?.ratio)||1;
    // Coach-confirmed practical 50 kick baselines. Unknown modified swimmers fall back to load ratio rather than inheriting an impossible squad cycle.
    let minCycle=0,sourceLabel='';
    if(k==='mckenziedrage'||k==='mackenziedrage'){minCycle=90;sourceLabel='Coach-confirmed McKenzie 50 kick baseline';}
    else if(k==='charlottemurphy'){minCycle=135;sourceLabel='Coach-confirmed Charlotte 50 kick baseline';}
    else if(ratio<.98){const authored=Number(source?.cycleSeconds)||0;if(authored)minCycle=ceil5(authored/Math.max(.5,ratio));sourceLabel='Modified-swimmer kick load fallback';}
    if(minCycle&&Number(out?.cycleSeconds||0)<minCycle){rewriteCycle(out,minCycle);out.kickTimingPlan={mode:'athlete-kick-rule',cycleSeconds:minCycle,source:sourceLabel};out.adaptationTiming={mode:'athlete-kick-rule',cycleSeconds:minCycle,source:sourceLabel,reason:'Kick timing is capability-specific; do not inherit an impossible squad send-off'};out.adaptationReason=[out.adaptationReason,`${sourceLabel} · @ ${clock(minCycle)}`].filter(Boolean).join(' · ');}
    return out;
  }
  function timingGate(out){
    const target=Number(out?.targetSeconds),rest=Math.max(0,Number(out?.restSeconds)||0),cycle=Number(out?.cycleSeconds)||0;
    if(Number.isFinite(target)&&target>0&&cycle>0&&cycle<=target){const next=ceil5(target+Math.max(5,rest));rewriteCycle(out,next);out.timingIntegrity={adjusted:true,targetSeconds:target,minimumRestSeconds:Math.max(5,rest),cycleSeconds:next,reason:'Send-off cannot be at or faster than target swim time'};}
    return out;
  }
  E.Modification.adaptItem=(item,ath,state,session)=>timingGate(kickIntegrity(item,base(item,ath,state,session),ath,state,session));
  M.trainingModIntegrity={build:BUILD,kickIntegrity,timingGate};
})(globalThis);
