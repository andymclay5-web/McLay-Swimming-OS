'use strict';
(function(g){
  const M=g.MSOS4,U=M?.util,UI=M?.ui;if(!M||!U||!UI)return;
  const R=M.attendanceRoster={build:'v4-attendance-roster-20260820ad'};
  const text=v=>U.text?U.text(v):String(v??'').trim(),esc=v=>U.escape?U.escape(v):text(v);
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
  function openAthletePicker(){const s=M.currentSession?.();if(!s)return;M.access?.assert?.('attendance.write');const roster=new Set(athletes(s).map(a=>a.id));let rows=activeAthletes();if((M.access?.role?.()||'owner')==='assistant')rows=rows.filter(a=>M.access?.athleteAllowed?.(a));rows=rows.filter(a=>!roster.has(a.id)).sort((a,b)=>text(a.squad).localeCompare(text(b.squad))||text(a.full_name).localeCompare(text(b.full_name)));const h=modal('Add swimmer to this session',rows.length?`<p class="muted">This adds one swimmer without changing the session squad identity.</p><div class="picker-list">${rows.map(a=>`<button data-roster-ath="${esc(a.id)}"><b>${esc(a.full_name)}</b><small>${esc(a.squad||'')}</small></button>`).join('')}</div>`:'<p>No additional swimmers available.</p>');h?.querySelectorAll('[data-roster-ath]').forEach(b=>b.addEventListener('click',()=>{setAttendance(s,b.dataset.rosterAth,'present');close();UI.renderCurrent?.();M.toast?.('Swimmer added to this session')}));}
  function openSquadPicker(){const s=M.currentSession?.();if(!s)return;M.access?.assert?.('session.edit');const have=baseSquads(s),squads=[...new Set(activeAthletes().map(a=>text(a.squad)).filter(Boolean))].filter(x=>!have.has(x.toLowerCase())).sort();const h=modal('Add squad to this session',squads.length?`<p class="muted">This changes the session identity. Swimmers in the added squad then appear on the Roll.</p><div class="picker-list">${squads.map(x=>`<button data-roster-squad="${esc(x)}"><b>${esc(x)}</b></button>`).join('')}</div>`:'<p>All loaded squads are already part of this session.</p>');h?.querySelectorAll('[data-roster-squad]').forEach(b=>b.addEventListener('click',()=>{if(addSquad(s,b.dataset.rosterSquad)){close();UI.renderCurrent?.();M.toast?.(`${b.dataset.rosterSquad} added to session`);}}));}
  function renderRoll(){
    const h=document.querySelector('#rollView'),s=M.currentSession?.();if(!h)return;if(!M.access?.can?.('attendance.read')){h.innerHTML='<section class="empty-card"><h2>Roll is not available on this device</h2></section>';return}if(!s){h.innerHTML='<div class="empty-card">No session selected.</div>';return}
    const rows=athletes(s),canWrite=M.access.can('attendance.write'),canEdit=M.access.can('session.edit');
    h.innerHTML=`<section class="page-card"><div class="eyebrow">SESSION ROSTER</div><h1>Roll · ${esc(s.identity?.title||'Session')}</h1><p class="muted">${esc((s.identity?.squads||[]).join(' + ')||'No squad')} · Add a whole squad to session identity, or add one visitor swimmer without changing the squad list.</p><div class="hub-actions">${canEdit?'<button data-roll-add-squad>＋ Squad</button>':''}${canWrite?'<button data-roll-add-ath>＋ Swimmer</button>':''}</div>${rows.map(a=>{const st=attendanceRow(s,a.id)?.status||'absent',extra=!(s.identity?.squads||[]).some(x=>text(x).toLowerCase()===text(a.squad).toLowerCase());return `<div class="roll-row"><div><strong>${esc(a.full_name)}</strong><small>${esc(a.squad||'')}${extra?' · added to this session':''}</small></div><div class="seg"><button data-roll="${esc(a.id)}:present" class="${st==='present'?'active':''}">Here</button><button data-roll="${esc(a.id)}:modified" class="${st==='modified'?'active warn':''}">Modified</button><button data-roll="${esc(a.id)}:absent" class="${st==='absent'?'active':''}">Away</button></div></div>`}).join('')}</section>`;
    h.querySelector('[data-roll-add-squad]')?.addEventListener('click',openSquadPicker);h.querySelector('[data-roll-add-ath]')?.addEventListener('click',openAthletePicker);h.querySelectorAll('[data-roll]').forEach(b=>b.addEventListener('click',()=>{if(!canWrite)return;const [id,status]=b.dataset.roll.split(':');setAttendance(s,id,status);renderRoll();if(M.state.settings.view==='board')UI.renderBoard?.();}));
  }
  R.athletes=athletes;R.present=present;R.addSquad=addSquad;R.setAttendance=setAttendance;R.openAthletePicker=openAthletePicker;R.openSquadPicker=openSquadPicker;
  UI.currentAthletes=()=>athletes();UI.presentAthletes=()=>present();UI.renderRoll=renderRoll;
  if(M.teamDisplay)M.teamDisplay.presentAthletes=(session=M.currentSession?.(),state=M.state)=>{const here=present(session,state);return here.length?here:athletes(session,state)};
})(globalThis);
