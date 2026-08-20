'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const F=M.contractFixesAK={build:'v4-contract-fixes-20260821ak'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  if(M.parser?.normalise){
    const baseNormalise=M.parser.normalise.bind(M.parser);
    M.parser.normalise=s=>baseNormalise(s).replace(/\b(\d{1,2})(800|400|200|150|100|75|50|35|25)s\b/gi,(m,r,d)=>{
      const reps=Number(r);return reps>=2&&reps<=30?`${reps} x ${d}`:m;
    });
  }
  if(E?.Modification?.adaptItem){
    const baseAdapt=E.Modification.adaptItem.bind(E.Modification);
    const fixedAdapt=(item,ath,state,session)=>{
      const out=baseAdapt(item,ath,state,session);
      if(!out||item?.kind!=='set')return out;
      const ov=(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);
      if(ov)out.adaptationReason='Coach override';
      const key=text(ath?.full_name).toLowerCase().replace(/[^a-z0-9]/g,''),raw=text(item?.raw||item?.text);
      if(key==='conorfischer'&&/\b(?:breaststroke|breast|br)\b/i.test(raw)&&/\bfins?\b/i.test(raw)){
        out.stroke='Choice';
        out.raw=text(out.raw||out.text).replace(/\bnon-Br\b/ig,'non-Breaststroke');
        if(!/non-Breaststroke/i.test(out.raw))out.raw=`${Math.max(1,Number(out.reps)||1)} × ${Number(out.distance)||0} Choice non-Breaststroke with Fins`;
        out.text=out.raw;out.adaptationReason='No Breaststroke kick with fins';
      }
      return out;
    };
    E.Modification.adaptItem=fixedAdapt;
    if(M.adapt)M.adapt.item=fixedAdapt;
    F.adaptItem=fixedAdapt;
  }
})(globalThis);
