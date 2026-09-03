'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const BUILD='v4-guardian-full-gate-20260822bj';
  const D=M.guardianDeviceStateBJ={build:BUILD};
  const U=M.util||{};
  const placeholderName=name=>/^swimmer\s+[a-z0-9]+$/i.test(String(name||'').replace(/\s+/g,' ').trim());
  const athleteName=a=>String(a?.full_name||a?.name||'').replace(/\s+/g,' ').trim();
  D.placeholderName=placeholderName;
  D.scan=()=>{
    const athletes=Array.isArray(M.state.athletes)?M.state.athletes:[];
    const placeholders=athletes.filter(a=>placeholderName(athleteName(a))).map(a=>({id:a.id||'',name:athleteName(a)}));
    const s=M.state.settings||{},selected=s.selectedSessionId||'',current=M.currentSession?.();
    const tests=[
      {name:'No placeholder/test swimmers in production roster',ok:placeholders.length===0,detail:placeholders.length?placeholders.map(x=>x.name).join(', '):'clean roster'},
      {name:'Selected session identity resolves',ok:!selected||current?.id===selected,detail:selected?`${selected} → ${current?.id||'missing'}`:'no session selected'},
      {name:'Owner identity is not bound to a swimmer',ok:s.activeRole!=='owner'||!s.activeUserAthleteId,detail:s.activeRole==='owner'?(s.activeUserAthleteId||'clean'):`role ${s.activeRole||'unknown'}`}
    ];
    const passed=tests.filter(x=>x.ok).length;
    return{ok:passed===tests.length,passed,total:tests.length,tests,placeholders,at:new Date().toISOString(),build:M.BUILD||BUILD};
  };
  // Placeholder-roster purging is owned by stability-identity-bh.js's purgePlaceholders
  // (wired to every render and to post-hydration cleanup). This file previously carried an
  // independent, near-identical purge implementation of its own; it was never called anywhere
  // in the shipping app, so it has been removed rather than left as a second, drift-prone copy
  // of the same logic. This file's live contract is D.scan — a read-only diagnostic consumed
  // by guardian-runtime.js's device health check.
})(globalThis);
