'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.access)return;
  const BUILD='v4-stability-identity-20260822bh',BINDING='bh1';
  const I=M.stabilityIdentityBH={build:BUILD,bindingVersion:BINDING};
  const A=M.access;
  const saveUi=()=>{try{if(M.storageEngine?.saveUi)M.storageEngine.saveUi(M.state);else M.store?.save?.(M.state)}catch{}};
  const saveFull=()=>{try{M.store?.save?.(M.state)}catch{}};
  const athlete=id=>(M.state.athletes||[]).find(x=>x.id===id&&x.active!==false)||null;
  const placeholderName=name=>/^swimmer\s+[a-z0-9]+$/i.test(String(name||'').replace(/\s+/g,' ').trim());
  const isPlaceholderAthlete=a=>placeholderName(a?.full_name||a?.name||'');
  const validLinkedAthlete=id=>{const a=athlete(id);return !!a&&!isPlaceholderAthlete(a)};

  function purgePlaceholders({persist=true}={}){
    const list=Array.isArray(M.state.athletes)?M.state.athletes:[];
    const removed=list.filter(isPlaceholderAthlete);
    if(!removed.length)return{changed:false,removed:[]};
    const ids=new Set(removed.map(a=>a.id).filter(Boolean));
    M.state.athletes=list.filter(a=>!ids.has(a.id));
    for(const key of ['attendance','adaptationProfiles','adaptationOverrides','trainingTestResults','coachResults','athleteAchievements','timedSets']){
      if(Array.isArray(M.state[key]))M.state[key]=M.state[key].filter(row=>!ids.has(row?.athlete_id)&&!ids.has(row?.athleteId));
    }
    if(Array.isArray(M.state.captures))M.state.captures=M.state.captures.map(row=>{
      const next={...row};
      if(ids.has(next.athlete_id))next.athlete_id=null;
      if(ids.has(next.athleteId))next.athleteId=null;
      if(Array.isArray(next.athlete_ids))next.athlete_ids=next.athlete_ids.filter(id=>!ids.has(id));
      if(Array.isArray(next.athleteIds))next.athleteIds=next.athleteIds.filter(id=>!ids.has(id));
      return next;
    });
    const s=M.state.settings=M.state.settings||{};
    if(ids.has(s.selectedAthleteId))s.selectedAthleteId='';
    if(ids.has(s.selectedSwimmerId))s.selectedSwimmerId='';
    if(ids.has(s.activeUserAthleteId)){s.activeUserAthleteId='';s.activeRole='owner';s.view='board';}
    if(Array.isArray(s.timingRoster))s.timingRoster=s.timingRoster.filter(id=>!ids.has(id));
    M.state.migrations=M.state.migrations||{};
    const stamp=new Date().toISOString();
    M.state.migrations.removedPlaceholderAthletes=[...(M.state.migrations.removedPlaceholderAthletes||[]),...removed.map(a=>({id:a.id||'',name:String(a.full_name||a.name||''),removedAt:stamp,reason:'test-placeholder-roster-cleanup'}))].slice(-20);
    M.state.guardian=M.state.guardian||{};
    M.state.guardian.fieldIncidents=M.state.guardian.fieldIncidents||[];
    M.state.guardian.fieldIncidents.push({id:`placeholder-${Date.now()}`,type:'placeholder_roster_contamination',names:removed.map(a=>String(a.full_name||a.name||'')),detectedAt:stamp,resolvedBy:'automatic local cleanup'});
    M.state.guardian.fieldIncidents=M.state.guardian.fieldIncidents.slice(-20);
    if(persist)saveFull();
    return{changed:true,removed:removed.map(a=>({id:a.id||'',name:String(a.full_name||a.name||'')}))};
  }

  function resetOwner(reason='identity-reset',persist=true){
    const s=M.state.settings=M.state.settings||{};
    s.activeRole='owner';s.activeUserAthleteId='';s.assistantId='';
    s.roleBindingVersion=BINDING;s.roleBindingKind='owner';s.roleBindingAthleteId='';s.roleBindingReason=reason;
    if(['swimmer','athletes'].includes(s.view))s.view='board';
    if(persist)saveUi();
    return'owner';
  }
  function normalize({persist=true}={}){
    const s=M.state.settings=M.state.settings||{};
    let changed=false,reason='';
    if(s.roleBindingVersion!==BINDING){reason='migrate-pre-bh-role-state';resetOwner(reason,false);changed=true;}
    else if(s.activeRole==='swimmer'){
      const valid=s.roleBindingKind==='swimmer'&&s.roleBindingAthleteId===s.activeUserAthleteId&&validLinkedAthlete(s.activeUserAthleteId);
      if(!valid){reason='invalid-swimmer-link';resetOwner(reason,false);changed=true;}
    }else if(s.activeRole==='owner'&&(s.activeUserAthleteId||s.roleBindingKind==='swimmer')){
      s.activeUserAthleteId='';s.roleBindingKind='owner';s.roleBindingAthleteId='';reason='owner-cleared-stale-athlete';changed=true;
    }
    if(changed&&persist)saveUi();
    return{changed,reason,role:s.activeRole,athleteId:s.activeUserAthleteId||''};
  }
  I.athlete=athlete;I.placeholderName=placeholderName;I.isPlaceholderAthlete=isPlaceholderAthlete;I.validLinkedAthlete=validLinkedAthlete;I.purgePlaceholders=purgePlaceholders;I.resetOwner=resetOwner;I.normalize=normalize;

  const firstPurge=purgePlaceholders({persist:false}),firstIdentity=normalize({persist:false});
  if(firstPurge.changed)saveFull();else if(firstIdentity.changed)saveUi();

  const oldRole=typeof A.role==='function'?A.role.bind(A):()=>M.state.settings.activeRole||'owner';
  const oldSetRole=typeof A.setRole==='function'?A.setRole.bind(A):null;
  A.role=()=>{const role=oldRole();if(role==='swimmer'){const s=M.state.settings||{};if(s.roleBindingVersion!==BINDING||s.roleBindingKind!=='swimmer'||s.roleBindingAthleteId!==s.activeUserAthleteId||!validLinkedAthlete(s.activeUserAthleteId))return resetOwner('runtime-invalid-swimmer-link');}return role;};
  A.setRole=(role,opts={})=>{
    if(role==='swimmer'){
      const id=String(opts.athleteId||'');if(!validLinkedAthlete(id))throw new Error('Choose a real active swimmer before linking a swimmer device');
      if(oldSetRole)oldSetRole(role,{...opts,athleteId:id});else{M.state.settings.activeRole='swimmer';M.state.settings.activeUserAthleteId=id;}
      Object.assign(M.state.settings,{roleBindingVersion:BINDING,roleBindingKind:'swimmer',roleBindingAthleteId:id,roleBindingReason:'explicit-swimmer-link'});saveUi();return role;
    }
    if(role==='owner'){if(oldSetRole)oldSetRole('owner',opts);else M.state.settings.activeRole='owner';return resetOwner('explicit-owner');}
    if(oldSetRole)oldSetRole(role,opts);else M.state.settings.activeRole=role;
    Object.assign(M.state.settings,{roleBindingVersion:BINDING,roleBindingKind:role,roleBindingAthleteId:'',roleBindingReason:`explicit-${role}`});saveUi();return role;
  };

  if(typeof M.ui?.configureRoleChrome==='function'){
    const oldConfigure=M.ui.configureRoleChrome.bind(M.ui);
    M.ui.configureRoleChrome=()=>{purgePlaceholders();normalize();oldConfigure();};
  }
  const afterHydrate=()=>{const p=purgePlaceholders(),n=normalize();if((p.changed||n.changed)&&M.ui?.renderCurrent)requestAnimationFrame(()=>M.ui.renderCurrent());};
  if(M.storageEngine?.readyPromise?.then)M.storageEngine.readyPromise.then(afterHydrate).catch(()=>{});

  I.loadFullGuardian=()=>{
    if(I.guardianLoadPromise)return I.guardianLoadPromise;
    const add=src=>new Promise((resolve,reject)=>{if(document.querySelector(`script[data-bj-src="${src}"]`))return resolve();const s=document.createElement('script');s.src=src;s.defer=true;s.dataset.bjSrc=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Could not load ${src}`));document.head.appendChild(s);});
    I.guardianLoadPromise=add('engines/guardian-device-state-bj.js?v=20260822bj').then(()=>add('engines/release-guardian-bj.js?v=20260822bj')).then(()=>{M.ui?.renderHeader?.();return true;}).catch(e=>{I.guardianLoadError=e?.message||String(e);return false;});
    return I.guardianLoadPromise;
  };
  if(typeof document!=='undefined')I.loadFullGuardian();
})(globalThis);
