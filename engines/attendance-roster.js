'use strict';
(function(g){
  const M=g.MSOS4,U=M?.util,UI=M?.ui;if(!M||!U||!UI)return;
  const R=M.attendanceRoster={build:'v4-attendance-roster-20260820ad'};
  const text=v=>U.text?U.text(v):String(v??'').trim(),esc=v=>U.escape?U.escape(v):text(v),key=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const activeAthletes=(state=M.state)=>(state?.athletes||[]).filter(a=>a.active!==false);
  const attendanceRows=(session,state=M.state)=>(state?.attendance||[]).filter(x=>x.session_id===session?.id);
  const baseSquads=session=>new Set((session?.identity?.squads||[]).map(x=>text(x).toLowerCase()).filter(Boolean));
  function athletes(session=M.currentSession?.(),state=M.state){
    if(!session)return[];
    const squads=baseSquads(session),explicit=new Set(attendanceRows(session,state).map(x=>x.athlete_id));
    return activeAthletes(state).filter(a=>!squads.size||squads.has(text(a.squad).toLowerCase())||explicit.has(a.id));
  }
  function present(session=M.currentSession?.(),state=M.state){
    if(!session)return[];
    const rows=attendanceRows(session,state),status=new Map(rows.map(x=>[x.athlete_id,text(x.status).toLowerCase()]));
    return athletes(session,state).filter(a=>['present','modified'].includes(status.get(a.id)));
  }
  function attendanceRow(session,athleteId,state=M.state){return(state.attendance||[]).find(x=>x.session_id===session.id&&x.athlete_id===athleteId)||null;}
  function setAttendance(session,athleteId,status='present'){
    M.access?.assert?.('attendance.write');M.state.attendance=M.state.attendance||[];
    let row=attendanceRow(session,athleteId);if(!row){row={id:`attendance-${session.id}-${athleteId}`,session_id:session.id,athlete_id:athleteId,status,note:'',updated_at:U.now()};M.state.attendance.push(row);}else{row.status=status;row.id=`attendance-${session.id}-${athleteId}`;row.updated_at=U.now();}
    M.store?.save?.(M.state);M.cloud?.stageAttendance?.(row);return row;
  }
  function addSquad(session,squad){
    M.access?.assert?.('session.edit');squad=text(squad);if(!session||!squad)return false;
    const before=[...(session.identity?.squads||[])];if(before.some(x=>text(x).toLowerCase()===squad.toLowerCase()))return false;
    const next=M.session?.cloneCurrent?M.session.cloneCurrent(session):U.clone(session);next.identity=next.identity||{};next.identity.squads=[...before,squad];next.changes=next.changes||[];next.changes.push({id:U.uid('change'),sessionId:next.id,type:'add_session_squad',itemId:null,before:{squads:before},after:{squads:[...next.identity.squads]},meta:{squad},at:U.now()});next.updatedAt=U.now();M.store?.putSession?.(M.state,next);return true;
  }
  function close(){const h=document.querySelector('#modalHost');if(h)h.innerHTML='';M.nav?.dismissLayer?.();}
  function modal(title,body){const h=document.querySelector('#modalHost');if(!h)return null;h.innerHTML=`<div class="modal-backdrop"><section class="modal"><header><h2>${esc(title)}</h2><button type="button" data-roster-close>×</button></header><div class="modal-body">${body}</div></section></div>`;M.nav?.openLayer?.('modal');h.querySelector('[data-roster-close]')?.addEventListener('click',close);h.querySelector('.modal-backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)close()});return h;}
  function searchText(a){return key([a.full_name,a.preferred_name,a.nickname,a.board_name,a.squad].filter(Boolean).join(' '));}
  function rankMatches(rows,q){const k=key(q);if(!k)return[];return rows.map(a=>{const full=key(a.full_name),blob=searchText(a),first=full.split(' ')[0]||'',score=full===k?0:first===k?1:full.startsWith(k)?2:first.startsWith(k)?3:blob.includes(` ${k}`)?4:blob.includes(k)?5:99;return{a,score};}).filter(x=>x.score<99).sort((x,y)=>x.score-y.score||text(x.a.full_name).localeCompare(text(y.a.full_name))).slice(0,8).map(x=>x.a);}
  function openAthletePicker(){
    const s=M.currentSession?.();if(!s)return;M.access?.assert?.('attendance.write');const roster=new Set(athletes(s).map(a=>a.id));let available=activeAthletes();if((M.access?.role?.()||'owner')==='assistant')available=available.filter(a=>M.access?.athleteAllowed?.(a));available=available.filter(a=>!roster.has(a.id));
    const h=modal('Add individual swimmer',available.length?`<p class="muted">${esc((s.identity?.squads||[]).join(' + ')||'Selected session')} stays the lead session. Start typing a swimmer name; choosing them adds only that swimmer and marks them Here.</p><label>Find swimmer<input id="rosterSearch" type="search" autocomplete="off" placeholder="Start typing a name…"></label><div id="rosterSearchResults" class="picker-list"><p class="muted">Type a name to search the loaded swimmer roster.</p></div>`:'<p>No additional swimmers available.</p>');
    const input=h?.querySelector('#rosterSearch'),results=h?.querySelector('#rosterSearchResults');if(!input||!results)return;
    const paint=()=>{const matches=rankMatches(available,input.value);results.innerHTML=!text(input.value)?'<p class="muted">Type a name to search the loaded swimmer roster.</p>':matches.length?matches.map(a=>`<button data-roster-ath="${esc(a.id)}"><b>${esc(a.full_name)}</b><small>${esc(a.squad||'')}</small></button>`).join(''):'<p class="muted">No matching swimmer.</p>';results.querySelectorAll('[data-roster-ath]').forEach(b=>b.addEventListener('click',()=>{setAttendance(s,b.dataset.rosterAth,'present');close();UI.renderCurrent?.();M.toast?.('Swimmer added · Here')}));};
    input.addEventListener('input',paint);requestAnimationFrame(()=>input.focus());
  }
  function openSquadPicker(){
    const s=M.currentSession?.();if(!s)return;M.access?.assert?.('session.edit');const have=baseSquads(s),squads=[...new Set(activeAthletes().map(a=>text(a.squad)).filter(Boolean))].filter(x=>!have.has(x.toLowerCase())).sort();
    const h=modal('Add squad to this session',squads.length?`<p class="muted"><b>${esc((s.identity?.squads||[]).join(' + ')||'Selected session')}</b> remains the lead session. Tap a squad once to add its swimmers to this Roll.</p><div class="picker-list">${squads.map(x=>`<button data-roster-squad="${esc(x)}"><b>${esc(x)}</b></button>`).join('')}</div>`:'<p>All loaded squads are already part of this session.</p>');
    h?.querySelectorAll('[data-roster-squad]').forEach(b=>b.addEventListener('click',()=>{if(addSquad(s,b.dataset.rosterSquad)){close();UI.renderCurrent?.();M.toast?.(`${b.dataset.rosterSquad} added to session`);}}));
  }
  function renderRoll(){
    const h=document.querySelector('#rollView'),s=M.currentSession?.();if(!h)return;if(!M.access?.can?.('attendance.read')){h.innerHTML='<section class="empty-card"><h2>Roll is not available on this device</h2></section>';return}if(!s){h.innerHTML='<div class="empty-card">No session selected.</div>';return}
    const rows=athletes(s),canWrite=M.access.can('attendance.write'),canEdit=M.access.can('session.edit');
    h.innerHTML=`<section class="page-card"><div class="eyebrow">LEAD SESSION ROSTER</div><h1>Roll · ${esc(s.identity?.title||'Session')}</h1><p class="muted">${esc((s.identity?.squads||[]).join(' + ')||'No squad')} · Keep this selected session as the lead. Add a whole squad, or add one swimmer who happens to be here.</p><div class="hub-actions">${canEdit?'<button data-roll-add-squad>＋ Add squad</button>':''}${canWrite?'<button data-roll-add-ath>＋ Add individual</button>':''}</div>${rows.map(a=>{const st=attendanceRow(s,a.id)?.status||'absent',extra=!(s.identity?.squads||[]).some(x=>text(x).toLowerCase()===text(a.squad).toLowerCase());return `<div class="roll-row"><div><strong>${esc(a.full_name)}</strong><small>${esc(a.squad||'')}${extra?' · individual add':''}</small></div><div class="seg"><button data-roll="${esc(a.id)}:present" class="${st==='present'?'active':''}">Here</button><button data-roll="${esc(a.id)}:modified" class="${st==='modified'?'active warn':''}">Modified</button><button data-roll="${esc(a.id)}:absent" class="${st==='absent'?'active':''}">Away</button></div></div>`}).join('')}</section>`;
    h.querySelector('[data-roll-add-squad]')?.addEventListener('click',openSquadPicker);h.querySelector('[data-roll-add-ath]')?.addEventListener('click',openAthletePicker);h.querySelectorAll('[data-roll]').forEach(b=>b.addEventListener('click',()=>{if(!canWrite)return;const [id,status]=b.dataset.roll.split(':');setAttendance(s,id,status);renderRoll();if(M.state.settings.view==='board')UI.renderBoard?.();}));
  }
  R.athletes=athletes;R.present=present;R.addSquad=addSquad;R.setAttendance=setAttendance;R.rankMatches=rankMatches;R.openAthletePicker=openAthletePicker;R.openSquadPicker=openSquadPicker;
  UI.currentAthletes=()=>athletes();UI.presentAthletes=()=>present();UI.renderRoll=renderRoll;
  if(M.teamDisplay)M.teamDisplay.presentAthletes=(session=M.currentSession?.(),state=M.state)=>{const here=present(session,state);return here.length?here:athletes(session,state)};
})(globalThis);
