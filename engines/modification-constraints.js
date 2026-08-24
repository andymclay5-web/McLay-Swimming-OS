'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M||!E?.Modification?.adaptItem)return;
  const BUILD='v4-modification-constraints-20260824b',text=v=>String(v??'').replace(/\s+/g,' ').trim(),key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  function amberConstraint(source,out,ath){
    if(key(ath)!=='amberproudfoot')return out;const raw=text([source?.raw,source?.text,...(source?.cues||[])].filter(Boolean).join(' '));
    const unsafe=/\b(?:underwater|kick)\b/i.test(raw)&&(/\bfins?\b/i.test(raw)||/\bunderwater\b/i.test(raw));if(!unsafe)return out;
    const lead=Number(out?.reps)>1?`${Number(out.reps)} × ${Number(out.distance)||0}`:`${Number(out?.distance)||0}`;
    out.raw=`${lead} Upper-body equivalent${/\bfins?\b/i.test(raw)?' · no fin/kick loading':''}`;out.text=out.raw;out.stroke='Choice';out.equipment=(out.equipment||[]).filter(x=>!/fin/i.test(String(x)));out.adaptationReason=[out.adaptationReason,'Amber constraint · upper-body equivalent'].filter(Boolean).join(' · ');out.constraintApplied='amber-upper-body';return out;
  }
  const base=E.Modification.adaptItem.bind(E.Modification);
  E.Modification.adaptItem=(item,ath,state,session)=>amberConstraint(item,base(item,ath,state,session),ath);
  M.modificationConstraints={build:BUILD,amberConstraint};
})(globalThis);
