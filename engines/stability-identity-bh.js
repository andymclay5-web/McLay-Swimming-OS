'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.access)return;
  const BUILD='v4-stability-identity-20260822bh',BINDING='bh1';
  const I=M.stabilityIdentityBH={build:BUILD,bindingVersion:BINDING};
  const A=M.access,UI=M.ui||{},G=M.guardian||{},U=M.util||{};
  const esc=v=>U.escape?U.escape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const saveUi=()=>{try{if(M.storageEngine?.saveUi)M.storageEngine.saveUi(M.state);else M.store?.save?.(M.state)}catch{}};
  const saveFull=()=>{try{M.store?.save?.(M.state)}catch{}};
  const athlete=id=>(M.state.athletes||[]).find(x=>x.id===id&&x.active!==false)||null;
  const placeholderName=name=>/^swimmer\s+[a-z0-9]+$/i.test(String(name||'').trim());
  const isPlaceholderAthlete=a=>placeholderName(a?.full_name||a?.name||'');
  const validLinkedAthlete=id=>{const a=athlete(id);return !!a&&!isPlaceholderAthlete(a)};

  function purgePlaceholders({persist=true}={}){
    const list=Array.isArray(M.state.athletes)?M.state.athletes:[];
    const removed=list.filter(isPlaceholderAthlete);
    if(!removed.length)return{changed:false,removed:[]};
    const ids=new Set(removed.map(a=>a.id).filter(Boolean));
    M.state.athletes=list.filter(a=>!ids.has(a.id));
    for(const key of ['attendance','adaptationProfiles','adaptationOverrides','trainingTestResults','coachResults','athleteAchievements','timedSets']){
      if(!Array.isArray(M.state[key]))continue;
      M.state[key]=M.state[key].filter(row=>!ids.has(row?.athlete_id)&&!ids.has(row?.athleteId));
    }
    if(Array.isArray(M.state.captures))M.state.captures=M.state.captures.flatMap(row=>{
      const one=row?.athlete_id||row?.athleteId||'';
      const key=Array.isArray(row?.athlete_ids)?'athlete_ids':Array.isArray(row?.athleteIds)?'athleteIds':'';
      const many=key?[...row[key]].filter(id=>!ids.has(id)):[];
      if(one&&ids.has(one)&&!many.length)return[];
      if(!one&&!key)return[row];
      const next={...row};
      if(one&&ids.has(one)){if('athlete_id'in next)next.athlete_id=many.length===1?many[0]:null;if('athleteId'in next)next.athleteId=many.length===1?many[0]:null;}
      if(key)next[key]=many;
      return[next];
    });
    const s=M.state.settings=M.state.settings||{};
    if(ids.has(s.selectedAthleteId))s.selectedAthleteId='';
    if(ids.has(s.selectedSwimmerId))s.selectedSwimmerId='';
    if(ids.has(s.activeUserAthleteId)){s.activeUserAthleteId='';s.activeRole='owner';s.view='board';}
    if(Array.isArray(s.timingRoster))s.timingRoster=s.timingRoster.filter(id=>!ids.has(id));
    M.state.migrations=M.state.migrations||{};
    const prior=Array.isArray(M.state.migrations.removedPlaceholderAthletes)?M.state.migrations.removedPlaceholderAthletes:[];
    const stamp=new Date().toISOString();
    M.state.migrations.removedPlaceholderAthletes=[...prior,...removed.map(a=>({id:a.id||'',name:String(a.full_name||a.name||''),removedAt:stamp,reason:'test-placeholder-roster-cleanup'}))].slice(-20);
    if(persist)saveFull();
    return{changed:true,removed:removed.map(a=>({id:a.id||'',name:String(a.full_name||a.name||'')}))};
  }

  function resetOwner(reason='identity-reset',persist=true){
    const s=M.state.settings=M.state.settings||{};
    s.activeRole='owner';s.activeUserAthleteId='';s.assistantId='';
    s.roleBindingVersion=BINDING;s.roleBindingKind='owner';s.roleBindingAthleteId='';s.roleBindingReason=reason;
    if(['swimmer','athletes','meet'].includes(s.view))s.view='board';
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

  const initialPurge=purgePlaceholders({persist:false});
  const initialIdentity=normalize({persist:false});
  if(initialPurge.changed)saveFull();else if(initialIdentity.changed)saveUi();

  const oldRole=typeof A.role==='function'?A.role.bind(A):()=>M.state.settings.activeRole||'owner';
  const oldSetRole=typeof A.setRole==='function'?A.setRole.bind(A):null;
  A.role=()=>{
    const role=oldRole();
    if(role==='swimmer'){
      const s=M.state.settings||{};
      if(s.roleBindingVersion!==BINDING||s.roleBindingKind!=='swimmer'||s.roleBindingAthleteId!==s.activeUserAthleteId||!validLinkedAthlete(s.activeUserAthleteId))return resetOwner('runtime-invalid-swimmer-link');
    }
    return role;
  };
  A.setRole=(role,opts={})=>{
    if(role==='swimmer'){
      const id=String(opts.athleteId||'');
      if(!validLinkedAthlete(id))throw new Error('Choose a real active swimmer before linking a swimmer device');
      if(oldSetRole)oldSetRole(role,{...opts,athleteId:id});else{M.state.settings.activeRole='swimmer';M.state.settings.activeUserAthleteId=id;}
      M.state.settings.roleBindingVersion=BINDING;M.state.settings.roleBindingKind='swimmer';M.state.settings.roleBindingAthleteId=id;M.state.settings.roleBindingReason='explicit-swimmer-link';saveUi();return role;
    }
    if(role==='owner'){
      if(oldSetRole)oldSetRole('owner',opts);else M.state.settings.activeRole='owner';
      return resetOwner('explicit-owner');
    }
    if(oldSetRole)oldSetRole(role,opts);else M.state.settings.activeRole=role;
    M.state.settings.roleBindingVersion=BINDING;M.state.settings.roleBindingKind=role;M.state.settings.roleBindingAthleteId='';M.state.settings.roleBindingReason=`explicit-${role}`;saveUi();return role;
  };

  M.BUILD=BUILD;M.CORE='20260822-stability-identity-bh';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'BH stability candidate: owner identity guard, placeholder roster cleanup and phone-safe Guardian. Full regression remains CI-owned; physical Android acceptance remains required.'});

  function phoneSafeChecks(){
    const tests=[],test=(name,fn)=>{try{const detail=fn();tests.push({name,ok:true,detail:detail==null?'':String(detail)})}catch(e){tests.push({name,ok:false,detail:e?.message||String(e)})}},assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
    test('Current role identity is coherent',()=>{assert(!(M.state.athletes||[]).some(isPlaceholderAthlete),'placeholder test swimmer still in roster');const role=A.role(),s=M.state.settings||{};if(role==='swimmer'){assert(validLinkedAthlete(s.activeUserAthleteId),'linked swimmer missing');assert(s.roleBindingKind==='swimmer','swimmer binding missing');return athlete(s.activeUserAthleteId)?.full_name||s.activeUserAthleteId}assert(role==='owner'||role==='assistant',`unexpected role ${role}`);return role});
    test('Owner role cannot retain a swimmer identity',()=>{const s=M.state.settings||{};if(A.role()==='owner')assert(!s.activeUserAthleteId,'owner still has active swimmer id');return'clean'});
    test('Current session identity resolves',()=>{const id=M.state.settings?.selectedSessionId||'',s=M.currentSession?.();assert(!id||s?.id===id,`selected ${id} did not resolve`);return s?.id||'no session selected'});
    test('Attendance merge is non-destructive',()=>{const P=M.presencePersistenceBC;if(!P?.mergeRows)return'presence engine unavailable';const local=[{session_id:'bh',athlete_id:'a',status:'present',updated_at:'2026-08-22T00:00:00Z'}],merged=P.mergeRows(local,[],'bh');assert(merged.length===1,'empty payload erased presence');return'1 row retained'});
    test('Guardian is phone-safe',()=>{assert(G.runAndRender===I.runPhoneSafe,'full Guardian still bound to phone action');return'full regression kept out of UI thread'});
    const passed=tests.filter(x=>x.ok).length;return{ok:passed===tests.length,passed,total:tests.length,tests,at:new Date().toISOString(),build:BUILD,phoneSafe:true};
  }
  I.phoneSafeChecks=phoneSafeChecks;
  function latestPhoneSafe(){return(M.state.guardian?.phoneSafeRuns||[]).at?.(-1)||null}
  function renderGuardian(result=null){
    const h=document.querySelector('#guardianView');if(!h)return;
    const r=result||latestPhoneSafe(),status=r?`${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}`:'Not run on this load';
    h.innerHTML=`<section class="page-card"><div class="eyebrow">GUARDIAN · PHONE-SAFE</div><h1>${esc(status)}</h1><p><b>${esc(BUILD)}</b></p><p class="muted">The full regression suite is deliberately not executed on the coaching phone. It belongs in CI so Guardian cannot freeze the Board. These checks only verify device identity, selected-session coherence, attendance protection and the phone-safe Guardian binding.</p>${r?`<div class="guardian-list">${r.tests.map(t=>`<div class="check-card ${t.ok?'ok':'bad'}"><b>${t.ok?'✓':'✕'} ${esc(t.name)}</b>${t.detail?`<small>${esc(t.detail)}</small>`:''}</div>`).join('')}</div>`:''}<div class="hub-actions"><button id="runPhoneSafeGuardian">Run phone-safe checks</button><button id="guardianBackBoard">Back to Board</button></div></section>`;
    h.querySelector('#runPhoneSafeGuardian')?.addEventListener('click',()=>I.runPhoneSafe());
    h.querySelector('#guardianBackBoard')?.addEventListener('click',()=>M.nav?.show?.('board',{restoreScroll:false}));
  }
  I.renderGuardian=renderGuardian;
  I.runPhoneSafe=()=>{
    const h=document.querySelector('#guardianView');if(h)h.innerHTML='<section class="page-card"><div class="eyebrow">GUARDIAN · PHONE-SAFE</div><h1>Checking…</h1><p class="muted">Short device checks only.</p></section>';
    setTimeout(()=>{const r=phoneSafeChecks();M.state.guardian=M.state.guardian||{};M.state.guardian.phoneSafeRuns=M.state.guardian.phoneSafeRuns||[];M.state.guardian.phoneSafeRuns.push(r);M.state.guardian.phoneSafeRuns=M.state.guardian.phoneSafeRuns.slice(-20);saveFull();renderGuardian(r);M.toast?.(`Phone checks ${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}`)},0);
    return{deferred:true,phoneSafe:true,build:BUILD};
  };
  G.runAndRender=I.runPhoneSafe;
  UI.renderGuardian=renderGuardian;

  if(typeof UI.configureRoleChrome==='function'){
    const oldConfigure=UI.configureRoleChrome.bind(UI);
    UI.configureRoleChrome=()=>{purgePlaceholders();normalize();oldConfigure();const guard=document.querySelector('#guardianShortcut');if(guard&&!guard.hidden)guard.onclick=()=>M.nav?.show?.('guardian',{restoreScroll:false});};
  }

  const afterHydrate=()=>{const p=purgePlaceholders(),n=normalize();if((p.changed||n.changed)&&M.ui?.renderCurrent)requestAnimationFrame(()=>M.ui.renderCurrent());};
  if(M.storageEngine?.readyPromise?.then)M.storageEngine.readyPromise.then(afterHydrate).catch(()=>{});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{purgePlaceholders();normalize();if(A.role()==='owner'&&['swimmer','athletes','meet'].includes(M.state.settings.view))M.state.settings.view='board';},{once:true});
})(globalThis);
