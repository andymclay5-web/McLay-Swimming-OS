'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const BUILD='v4-stability-roster-cleanup-20260822bi';
  const R=M.stabilityRosterBI={build:BUILD};
  const U=M.util||{};
  const save=()=>{try{if(M.storageEngine?.saveUi)M.storageEngine.saveUi(M.state);else M.store?.save?.(M.state)}catch{}};
  const nameOf=a=>String(a?.full_name||a?.name||'').replace(/\s+/g,' ').trim();
  const isPlaceholder=a=>/^Swimmer\s+[A-Z0-9]+$/i.test(nameOf(a));
  function purge(){
    const athletes=Array.isArray(M.state.athletes)?M.state.athletes:[];
    const removed=athletes.filter(isPlaceholder);
    if(!removed.length)return{changed:false,removed:[]};
    const ids=new Set(removed.map(a=>a.id).filter(Boolean));
    M.state.athletes=athletes.filter(a=>!ids.has(a.id));
    for(const key of ['attendance','adaptationProfiles','adaptationOverrides','trainingTestResults','coachResults','athleteAchievements','timedSets']){
      if(!Array.isArray(M.state[key]))continue;
      M.state[key]=M.state[key].filter(row=>!ids.has(row?.athlete_id)&&!ids.has(row?.athleteId));
    }
    if(Array.isArray(M.state.captures))M.state.captures=M.state.captures.filter(row=>{
      const one=row?.athlete_id||row?.athleteId;
      const many=[...(row?.athlete_ids||row?.athleteIds||[])];
      if(one&&ids.has(one))return false;
      return !many.some(id=>ids.has(id));
    });
    const s=M.state.settings=M.state.settings||{};
    if(ids.has(s.selectedAthleteId))s.selectedAthleteId='';
    if(ids.has(s.activeUserAthleteId)){s.activeUserAthleteId='';s.activeRole='owner';s.view='board';}
    if(Array.isArray(s.timingRoster))s.timingRoster=s.timingRoster.filter(id=>!ids.has(id));
    M.state.migrations=M.state.migrations||{};
    const prior=Array.isArray(M.state.migrations.removedPlaceholderAthletes)?M.state.migrations.removedPlaceholderAthletes:[];
    M.state.migrations.removedPlaceholderAthletes=[...prior,...removed.map(a=>({id:a.id||'',name:nameOf(a),removedAt:new Date().toISOString(),reason:'test-placeholder-roster-cleanup'}))].slice(-20);
    save();
    return{changed:true,removed:removed.map(a=>({id:a.id||'',name:nameOf(a)}))};
  }
  R.isPlaceholder=isPlaceholder;R.purge=purge;
  const result=purge();R.lastResult=result;
  if(result.changed)M.toast?.(`Removed ${result.removed.length} test swimmer${result.removed.length===1?'':'s'}`);
  M.BUILD=BUILD;M.CORE='20260822-stability-roster-bi';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'BI stability cleanup removes known placeholder test swimmers from live roster state while preserving an audit marker. Physical phone acceptance still required.'});
})(globalThis);
