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
  D.cleanupPlaceholders=()=>{
    const scan=D.scan();if(!scan.placeholders.length)return{changed:false,removed:[]};
    const ids=new Set(scan.placeholders.map(x=>x.id).filter(Boolean));
    M.state.athletes=(M.state.athletes||[]).filter(a=>!ids.has(a.id));
    for(const key of ['attendance','adaptationProfiles','adaptationOverrides','trainingTestResults','coachResults','athleteAchievements','timedSets']){
      if(Array.isArray(M.state[key]))M.state[key]=M.state[key].filter(r=>!ids.has(r?.athlete_id)&&!ids.has(r?.athleteId));
    }
    if(Array.isArray(M.state.captures))M.state.captures=M.state.captures.map(r=>{
      const next={...r};
      if(ids.has(next.athlete_id))next.athlete_id=null;
      if(ids.has(next.athleteId))next.athleteId=null;
      if(Array.isArray(next.athlete_ids))next.athlete_ids=next.athlete_ids.filter(id=>!ids.has(id));
      if(Array.isArray(next.athleteIds))next.athleteIds=next.athleteIds.filter(id=>!ids.has(id));
      return next;
    });
    const st=M.state.settings=M.state.settings||{};
    if(ids.has(st.selectedAthleteId))st.selectedAthleteId='';
    if(ids.has(st.selectedSwimmerId))st.selectedSwimmerId='';
    if(ids.has(st.activeUserAthleteId)){st.activeUserAthleteId='';st.activeRole='owner';st.view='board';}
    if(Array.isArray(st.timingRoster))st.timingRoster=st.timingRoster.filter(id=>!ids.has(id));
    M.state.migrations=M.state.migrations||{};
    M.state.migrations.removedPlaceholderAthletes=[...(M.state.migrations.removedPlaceholderAthletes||[]),...scan.placeholders.map(x=>({...x,removedAt:new Date().toISOString(),reason:'guardian-confirmed-placeholder-cleanup'}))].slice(-20);
    M.store?.save?.(M.state);
    return{changed:true,removed:scan.placeholders};
  };
})(globalThis);
