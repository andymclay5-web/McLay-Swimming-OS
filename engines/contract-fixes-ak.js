'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const F=M.contractFixesAK={build:'v4-contract-fixes-20260821ak'};
  if(M.parser?.normalise){
    const baseNormalise=M.parser.normalise.bind(M.parser);
    M.parser.normalise=s=>baseNormalise(s).replace(/\b(\d{1,2})(800|400|200|150|100|75|50|35|25)s\b/gi,(m,r,d)=>{
      const reps=Number(r);return reps>=2&&reps<=30?`${reps} x ${d}`:m;
    });
  }
  // Compatibility handle only. engines/modification.js is the sole modification policy owner.
  F.adaptItem=(item,ath,state,session)=>E?.Modification?.adaptItem?.(item,ath,state,session);
})(globalThis);
