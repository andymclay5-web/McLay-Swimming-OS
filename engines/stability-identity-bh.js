'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.access)return;
  const BUILD='v4-stability-identity-20260822bh',BINDING='bh1';
  const I=M.stabilityIdentityBH={build:BUILD,bindingVersion:BINDING};
  const A=M.access,UI=M.ui||{},G=M.guardian||{},U=M.util||{};
  const esc=v=>U.escape?U.escape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const saveUi=()=>{try{if(M.storageEngine?.saveUi)M.storageEngine.saveUi(M.state);else M.store?.save?.(M.state)}catch{}};
  const athlete=id=>(M.state.athletes||[]).find(x=>x.id===id&&x.active!==false)||null;
  const placeholderName=name=>/^swimmer\s+[a-z0-9]+$/i.test(String(name||'').trim());
  const validLinkedAthlete=id=>{const a=athlete(id);return !!a&&!placeholderName(a.full_name||a.name)};
  function resetOwner(reason='identity-reset',persist=true){
    const s=M.state.settings=M.state.settings||{};
    s.activeRole='owner';s.activeUserAthleteId='';s.assistantId='';
    s.roleBindingVersion=BINDING;s.roleBindingKind='owner';s.roleBindingAthleteId='';s.roleBindingReason=reason;
    if(['swimmer','athletes','meet'].includes(s.view))s.view='board';
    if(persist)saveUi();
    return 'owner';
  }
  function normalize({persist=true}={}){
    const s=M.state.settings=M.state.settings||{};
    let changed=false,reason='';
    if(s.roleBindingVersion!==BINDING){
      reason='migrate-pre-bh-role-state';
      resetOwner(reason,false);changed=true;
    }else if(s.activeRole==='swimmer'){
      const valid=s.roleBindingKind==='swimmer'&&s.roleBindingAthleteId===s.activeUserAthleteId&&validLinkedAthlete(s.activeUserAthleteId);
      if(!valid){reason='invalid-swimmer-link';resetOwner(reason,false);changed=true;}
    }else if(s.activeRole==='owner'&&(s.activeUserAthleteId||s.roleBindingKind==='swimmer')){
      s.activeUserAthleteId='';s.roleBindingKind='owner';s.roleBindingAthleteId='';reason='owner-cleared-stale-athlete';changed=true;
    }
    if(changed&&persist)saveUi();
    return{changed,reason,role:s.activeRole,athleteId:s.activeUserAthleteId||''};
  }
  I.athlete=athlete;I.placeholderName=placeholderName;I.validLinkedAthlete=validLinkedAthlete;I.resetOwner=resetOwner;I.normalize=normalize;

  // One-time migration of any pre-BH role state: this phone starts as Coach/Owner.
  normalize();

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
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:BUILD,softwareReady:false,generatedAt:new Date().toISOString(),note:'BH stability candidate: owner identity guard and phone-safe Guardian. Full regression remains CI-owned; physical Android acceptance remains required.'});

  function phoneSafeChecks(){
    const tests=[],test=(name,fn)=>{try{const detail=fn();tests.push({name,ok:true,detail:detail==null?'':String(detail)})}catch(e){tests.push({name,ok:false,detail:e?.message||String(e)})}},assert=(c,m)=>{if(!c)throw new Error(m||'assertion failed')};
    test('Current role identity is coherent',()=>{const role=A.role(),s=M.state.settings||{};if(role==='swimmer'){assert(validLinkedAthlete(s.activeUserAthleteId),'linked swimmer missing');assert(s.roleBindingKind==='swimmer','swimmer binding missing');return athlete(s.activeUserAthleteId)?.full_name||s.activeUserAthleteId}assert(role==='owner'||role==='assistant',`unexpected role ${role}`);return role});
    test('Owner role cannot retain a swimmer identity',()=>{const s=M.state.settings||{};if(A.role()==='owner')assert(!s.activeUserAthleteId,'owner still has active swimmer id');return 'clean'});
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
    setTimeout(()=>{const r=phoneSafeChecks();M.state.guardian=M.state.guardian||{};M.state.guardian.phoneSafeRuns=M.state.guardian.phoneSafeRuns||[];M.state.guardian.phoneSafeRuns.push(r);M.state.guardian.phoneSafeRuns=M.state.guardian.phoneSafeRuns.slice(-20);saveUi();renderGuardian(r);M.toast?.(`Phone checks ${r.ok?'PASS':'FAIL'} · ${r.passed}/${r.total}`)},0);
    return{deferred:true,phoneSafe:true,build:BUILD};
  };
  G.runAndRender=I.runPhoneSafe;
  UI.renderGuardian=renderGuardian;

  // Rebind role chrome after every render so the Guardian shortcut can only open the safe page.
  if(typeof UI.configureRoleChrome==='function'){
    const oldConfigure=UI.configureRoleChrome.bind(UI);
    UI.configureRoleChrome=()=>{normalize();oldConfigure();const guard=document.querySelector('#guardianShortcut');if(guard&&!guard.hidden)guard.onclick=()=>M.nav?.show?.('guardian',{restoreScroll:false});};
  }

  // Final guard before first paint. No stale Swimmer A/B identity is allowed to survive boot.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{normalize();if(A.role()==='owner'&&['swimmer','athletes','meet'].includes(M.state.settings.view))M.state.settings.view='board';},{once:true});
})(globalThis);
