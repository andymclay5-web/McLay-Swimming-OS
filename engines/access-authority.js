'use strict';
(function(g){
  const M=g.MSOS4,U=M?.util;if(!M?.state||!M?.access)return;
  const A=M.access,BUILD='v4-access-authority-20260825-atomic-role',BINDING=M.stabilityIdentityBH?.bindingVersion||'bh1';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const placeholderName=name=>M.stabilityIdentityBH?.placeholderName?.(name)??/^swimmer\s+[a-z0-9]+$/i.test(text(name));
  const linkedAthlete=id=>{const a=(M.state.athletes||[]).find(x=>String(x.id)===String(id)&&x.active!==false);return a&&!placeholderName(a.full_name||a.name)?a:null;};
  function resetOwner(reason='access-invalid-role'){
    const s=M.state.settings=M.state.settings||{};
    Object.assign(s,{activeRole:'owner',activeUserAthleteId:'',assistantId:'',roleBindingVersion:BINDING,roleBindingKind:'owner',roleBindingAthleteId:'',roleBindingReason:reason});
    if(['swimmer','athletes'].includes(s.view))s.view='board';
    return'owner';
  }
  function ensure(){
    const s=M.state.settings=M.state.settings||{};
    if(s.activeRole===undefined)s.activeRole='owner';if(s.activeUserAthleteId===undefined)s.activeUserAthleteId='';if(!Array.isArray(s.assistantPermissions))s.assistantPermissions=[];if(!Array.isArray(s.assistantSquads))s.assistantSquads=[];
    const r=text(s.activeRole||'owner').toLowerCase();
    if(!['owner','assistant','swimmer'].includes(r)){resetOwner('unknown-role');return s;}
    if(r==='swimmer'){
      const valid=s.roleBindingVersion===BINDING&&s.roleBindingKind==='swimmer'&&String(s.roleBindingAthleteId||'')===String(s.activeUserAthleteId||'')&&!!linkedAthlete(s.activeUserAthleteId);
      if(!valid)resetOwner('invalid-swimmer-link');
    }else if(r==='owner'){
      if(s.activeUserAthleteId||s.roleBindingKind==='swimmer')resetOwner('owner-cleared-stale-athlete');
      else{if(!s.roleBindingVersion)s.roleBindingVersion=BINDING;if(!s.roleBindingKind)s.roleBindingKind='owner';if(s.roleBindingAthleteId===undefined)s.roleBindingAthleteId='';}
    }else{
      s.activeRole='assistant';s.activeUserAthleteId='';s.roleBindingVersion=BINDING;s.roleBindingKind='assistant';s.roleBindingAthleteId='';
    }
    return s;
  }
  const role=()=>{ensure();return text(M.state.settings.activeRole||'owner').toLowerCase();};
  const caps={
    owner:new Set(['display.tv','session.view','session.create','session.edit','session.finish','attendance.read','attendance.write','timing.read','timing.write','capture.read','capture.write','athlete.read_all','athlete.private_notes','pathway.read_all','pathway.admin','meet.view','meet.manage','cloud.sync','cloud.repair','settings.admin','release.guardian']),
    assistant:new Set(['display.tv','session.view','attendance.read','attendance.write','timing.read','timing.write','capture.read','capture.write','athlete.read_assigned','pathway.read_assigned','meet.view']),
    swimmer:new Set(['session.view_own','timing.read_own','capture.write_own','athlete.read_own','pathway.read_own','meet.view_own'])
  };
  function assignedSquads(){ensure();return new Set((M.state.settings.assistantSquads||[]).map(x=>text(x).toLowerCase()).filter(Boolean));}
  function can(cap){const r=role(),set=new Set(caps[r]||[]);if(r==='assistant')for(const x of M.state.settings.assistantPermissions||[])set.add(x);return set.has(cap);}
  function setRole(next,{athleteId='',assistantId=''}={}){
    ensure();next=text(next).toLowerCase();if(!['owner','assistant','swimmer'].includes(next))throw new Error('Unknown MSOS role');const s=M.state.settings;
    if(next==='swimmer'){
      const id=String(athleteId||''),ath=linkedAthlete(id);if(!id||!ath)throw new Error('Choose a real active swimmer before linking a swimmer device');
      Object.assign(s,{activeRole:'swimmer',activeUserAthleteId:id,assistantId:'',roleBindingVersion:BINDING,roleBindingKind:'swimmer',roleBindingAthleteId:id,roleBindingReason:'explicit-swimmer-link'});
    }else if(next==='assistant'){
      Object.assign(s,{activeRole:'assistant',activeUserAthleteId:'',assistantId:String(assistantId||''),roleBindingVersion:BINDING,roleBindingKind:'assistant',roleBindingAthleteId:'',roleBindingReason:'explicit-assistant'});
    }else resetOwner('explicit-owner');
    M.store?.save?.(M.state);return next;
  }
  function athleteAllowed(ath){const r=role();if(r==='owner')return true;if(r==='swimmer')return String(ath?.id||'')===String(M.state.settings.activeUserAthleteId||'');const s=assignedSquads();return !!s.size&&s.has(text(ath?.squad).toLowerCase());}
  function visibleAthletes(){const seen=new Set(),out=[];for(const a of M.state.athletes||[]){if(a?.active===false||!athleteAllowed(a))continue;const id=String(a?.id||'');if(!id||seen.has(id))continue;seen.add(id);out.push(a);}return out;}
  function sessionAllowed(session){const r=role();if(r==='owner')return true;if(r==='swimmer'){const id=String(M.state.settings.activeUserAthleteId||'');return !!id&&(M.state.attendance||[]).some(x=>String(x.session_id||x.sessionId)===String(session?.id)&&String(x.athlete_id||x.athleteId)===id&&['present','modified','late'].includes(text(x.status).toLowerCase()));}const squads=assignedSquads();return !!squads.size&&(session?.identity?.squads||[]).some(x=>squads.has(text(x).toLowerCase()));}
  function captureVisible(cap){const r=role();if(r==='owner')return true;if(r==='assistant'){if(cap?.audience==='owner_only')return false;const ids=[cap?.athlete_id,cap?.athleteId,...(cap?.athlete_ids||[]),...(cap?.athleteIds||[])].filter(Boolean);if(!ids.length)return true;return ids.some(id=>athleteAllowed((M.state.athletes||[]).find(a=>String(a.id)===String(id))));}const aid=String(M.state.settings.activeUserAthleteId||'');if(!aid)return false;const ids=new Set([cap?.athlete_id,cap?.athleteId,...(cap?.athlete_ids||[]),...(cap?.athleteIds||[])].filter(Boolean).map(String));return ids.has(aid)&&['shared','swimmer'].includes(text(cap?.audience).toLowerCase());}
  A.build=BUILD;A.bindingVersion=BINDING;A.ensure=ensure;A.role=role;A.baseCaps=r=>new Set(caps[r]||[]);A.caps=()=>{const r=role(),s=new Set(caps[r]||[]);if(r==='assistant')for(const x of M.state.settings.assistantPermissions||[])s.add(x);return s;};A.can=can;A.setRole=setRole;A.assignedSquads=assignedSquads;A.sessionAllowed=sessionAllowed;A.athleteAllowed=athleteAllowed;A.visibleAthletes=visibleAthletes;A.captureVisible=captureVisible;A.assert=(cap,msg='Action not permitted on this device')=>{if(!can(cap))throw new Error(msg);return true;};
  const D=M.meet;if(D){
    D.visibleEntries=meetId=>{const r=role(),aid=String(M.state.settings.activeUserAthleteId||'');return (M.state.meetEntries||[]).filter(x=>String(x.meet_id||x.meetId)===String(meetId)).filter(x=>r==='owner'||(r==='swimmer'?!!aid&&String(x.athlete_id||x.athleteId)===aid:athleteAllowed((M.state.athletes||[]).find(a=>String(a.id)===String(x.athlete_id||x.athleteId))))).sort((a,b)=>(Number(a.event_number)||9999)-(Number(b.event_number)||9999)||(Number(a.heat)||9999)-(Number(b.heat)||9999));};
    D.visibleEvidence=entryId=>{const r=role(),aid=String(M.state.settings.activeUserAthleteId||'');return (M.state.meetEvidence||[]).filter(x=>String(x.entry_id||x.entryId)===String(entryId)).filter(x=>{if(r==='owner')return true;if(r==='swimmer')return !!aid&&String(x.athlete_id||x.athleteId)===aid&&['shared','swimmer'].includes(text(x.audience).toLowerCase());if(x.audience==='owner_only')return false;return athleteAllowed((M.state.athletes||[]).find(a=>String(a.id)===String(x.athlete_id||x.athleteId)));});};
  }
  M.accessAuthority={build:BUILD,bindingVersion:BINDING,atomicRoleBinding:true};
})(globalThis);
