'use strict';
// "While you were away" (27 Oct 2026). Andy: "I need to see anything that's happened that isn't in front of me. I need to
// be notified of what's happened. So when another coach has finished a session that I haven't been there to see, I need
// to see some sort of report or notes pop up on my screen. Same as when a swimmer does a session remotely, I need to see
// that pop up on my screen and know that that information is stored against their profile."
//
// Owner of one thing: telling the coach what happened that he didn't see. It reads what the existing owners already
// hold -- finished sessions and captures (synced by app.js cloud), a remote swimmer's Finish / Challenge / Edit request
// (msos_owner_swimmer_session_actions), swimmer join requests -- and shows the ones he hasn't seen, as a card that pops
// up over whatever screen he is on (it never changes the screen, the session or Roll underneath), plus a bell in the
// header that keeps the last 30 days.
//
// One write, and only to finish a job the swimmer's phone started: when a remote swimmer finished a session, the cloud
// marks them present -- unless the session had not reached the cloud yet when they tapped Finish (Matthew Robertson,
// Fri 23 Oct AM, was lost from his training that way). If that session is on this phone and the swimmer isn't marked,
// they are marked present through the attendance owner (engines/attendance-roster.js setAttendance), so the card's
// "saved to his profile" is true.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const X=M.awayInbox={build:'v4-away-inbox-20261027'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const DAY=864e5,WINDOW_DAYS=30,POP_DAYS=14;
  const role=()=>{try{return M.access?.role?.()||'owner'}catch{return'owner'}};
  const settings=()=>(M.state.settings=M.state.settings||{});
  const seenMap=()=>(settings().awaySeen=settings().awaySeen||{});
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{try{M.store?.save?.(M.state)}catch{}}};
  const me=()=>{try{return M.teamAccess?.actor?.()||{role:'owner',name:''}}catch{return{role:'owner',name:''}}};
  const myUserId=()=>M.store?.auth?.()?.user?.id||'';
  const athlete=id=>(M.state.athletes||[]).find(a=>a.id===id)||null;
  const firstName=a=>text(a?.full_name||a?.name||'').split(' ')[0]||'Swimmer';
  const ts=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:0;};
  function sessionLabel(s){const id=s?.identity||{};const t=Date.parse(`${id.date}T12:00:00Z`);const day=Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):(id.date||'');
    return [day,id.dayPart,(id.squads||[]).join(' + ')].filter(Boolean).join(' · ');}
  const metres=n=>`${Math.round(Number(n)||0).toLocaleString()}m`;

  // ---------- what happened ----------
  function finishedByOthers(now=Date.now()){
    const out=[],mine=me(),meId=myUserId();
    for(const s of Object.values(M.state.canonicalSessions||{})){
      const f=s?.finish;if(!f?.finishedAt)continue;const at=ts(f.finishedAt);if(!at||now-at>WINDOW_DAYS*DAY)continue;
      const fc=[...(s.changes||[])].reverse().find(c=>/^finish_here/.test(String(c?.type||'')));const by=fc?.by||s.lastEditedBy||null;
      if(!by)continue;const sameRole=String(by.role||'owner')===String(mine.role||'owner');
      // Who finished it: someone in another role, or another assistant coach. There is one head coach, so an owner-role
      // finish is always this head coach's own (older ones were stamped 'Owner' before he signed in).
      if(sameRole&&(String(by.role||'owner')==='owner'||!text(by.name)||!text(mine.name)||text(by.name).toLowerCase()===text(mine.name).toLowerCase()))continue;
      const edits=(s.changes||[]).filter(c=>c!==fc&&c?.by&&text(c.by.name)===text(by.name)&&String(c.by.role)===String(by.role)&&!/^finish_here/.test(String(c.type||''))).length;
      const notes=(M.state.captures||[]).filter(c=>c.session_id===s.id&&c.created_by&&c.created_by!==meId);
      out.push({key:`finish:${s.id}:${f.finishedAt}`,kind:'finish',at,session:s,by,finish:f,edits,notes});}
    return out;}
  function notesByOthers(now=Date.now(),finishedIds=new Set()){
    const meId=myUserId();if(!meId)return[];const bySession={};
    for(const c of M.state.captures||[]){if(!c?.created_by||c.created_by===meId||!c.session_id||finishedIds.has(c.session_id))continue;const at=ts(c.created_at);if(!at||now-at>WINDOW_DAYS*DAY)continue;(bySession[c.session_id]||(bySession[c.session_id]=[])).push(c);}
    return Object.entries(bySession).map(([sid,list])=>{const s=M.state.canonicalSessions?.[sid];const last=Math.max(...list.map(c=>ts(c.created_at)));return{key:`notes:${sid}:${list.length}:${last}`,kind:'notes',at:last,session:s,sessionId:sid,notes:list};});}
  let remote=[],joinCount=0,lastFetch=0,fetching=null;
  X.remote=()=>remote.slice();
  function swimmerItems(now=Date.now()){return remote.filter(a=>now-ts(a.created_at)<=(a.acknowledged_at?WINDOW_DAYS:60)*DAY).map(a=>({key:`swim:${a.id}`,kind:`swim-${a.action_type}`,at:ts(a.created_at),action:a,athlete:athlete(a.athlete_id),session:M.state.canonicalSessions?.[a.session_id]||null}));}
  X.items=(now=Date.now())=>{const fin=finishedByOthers(now);const ids=new Set(fin.map(x=>x.session.id));
    const all=[...fin,...notesByOthers(now,ids),...swimmerItems(now)];
    if(joinCount>0)all.push({key:`join:${joinCount}`,kind:'join',at:now,count:joinCount});
    return all.sort((a,b)=>b.at-a.at);};
  X.unseen=(now=Date.now())=>{const seen=seenMap();return X.items(now).filter(x=>!seen[x.key]&&!x.action?.acknowledged_at&&(x.kind.startsWith('swim')||x.kind==='join'||now-x.at<=POP_DAYS*DAY));};

  // A remote finish counts in the swimmer's training only if they are marked present for that session.
  function savedToProfile(a,{write=true}={}){const s=M.state.canonicalSessions?.[a.session_id];if(!s)return'missing';
    const row=(M.state.attendance||[]).find(r=>r.session_id===s.id&&r.athlete_id===a.athlete_id);if(row&&row.status!=='absent')return'saved';
    if(!write||role()!=='owner'||!M.attendanceRoster?.setAttendance)return'unsaved';
    try{M.attendanceRoster.setAttendance(s,a.athlete_id,'present');return'saved';}catch{return'unsaved';}}
  X.savedToProfile=savedToProfile;

  async function rpc(name,body){const r=M.swimmerInviteBN?.rpc;if(!r)throw new Error('Swimmer link not loaded');return r(name,body);}
  X.refresh=async({force=false}={})=>{
    if(role()!=='owner'||!M.cloud?.ready?.())return false;if(fetching)return fetching;if(!force&&Date.now()-lastFetch<120000)return false;
    fetching=(async()=>{lastFetch=Date.now();
      try{const rows=await rpc('msos_owner_swimmer_access',{});const ids=(Array.isArray(rows)?rows:[]).filter(r=>Number(r.devices)>0||r.has_account).map(r=>r.athlete_id);
        const lists=await Promise.all(ids.map(id=>rpc('msos_owner_swimmer_session_actions',{p_athlete_id:id,p_session_id:null}).catch(()=>[])));
        remote=lists.flat().filter(Boolean);
        for(const a of remote)if(a.action_type==='finish'&&!a.acknowledged_at)savedToProfile(a);}catch{}
      try{const org=M.cloud?.org?.()||settings().organisationId;if(org){const r=await rpc('mclay_list_swimmer_link_requests',{target_org:org});joinCount=Array.isArray(r)?r.length:0;}}catch{}
      fetching=null;paintBell();maybePop();return true;})();
    return fetching;};

  // ---------- show it ----------
  function card(x){
    if(x.kind==='finish'){const f=x.finish,rv=f.review||{},who=text(x.by.name)||(x.by.role==='assistant'?'Assistant coach':'Head coach');
      const lines=[[f.attendanceCount!=null?`${f.attendanceCount} swam`:'',f.actualDistance?`${metres(f.actualDistance)}${f.plannedDistance?` of ${metres(f.plannedDistance)} planned`:''}`:''].filter(Boolean).join(' · '),
        rv.wentWell&&`Went well: ${rv.wentWell}`,rv.reinforce&&`Reinforce: ${rv.reinforce}`,rv.athleteNotes&&`Swimmers: ${rv.athleteNotes}`,(rv.carryForward||f.carryForward)&&`Next time: ${rv.carryForward||f.carryForward}`,
        !rv.wentWell&&!rv.reinforce&&f.observations&&f.observations,x.edits?`${x.edits} change${x.edits===1?'':'s'} made on deck`:''].filter(Boolean);
      const notes=x.notes.slice(0,4).map(c=>`${athlete(c.athlete_id)?`${firstName(athlete(c.athlete_id))}: `:''}${text(c.text_content||c.title||c.capture_type||'note')}`);
      return`<article class="away-card" data-away-key="${esc(x.key)}"><div class="away-kicker">SESSION FINISHED</div><h3>${esc(who)} finished ${esc(sessionLabel(x.session))}</h3>${lines.map(l=>`<p>${esc(l)}</p>`).join('')}${notes.length?`<p class="away-sub">Notes (${x.notes.length})</p><ul>${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}<div class="away-acts"><button type="button" data-away-open-session="${esc(x.session.id)}">Open session</button></div></article>`;}
    if(x.kind==='notes'){const notes=x.notes.slice(0,5).map(c=>`${athlete(c.athlete_id)?`${firstName(athlete(c.athlete_id))}: `:''}${text(c.text_content||c.title||c.capture_type||'note')}`);
      return`<article class="away-card" data-away-key="${esc(x.key)}"><div class="away-kicker">NOTES FROM ANOTHER COACH</div><h3>${x.notes.length} note${x.notes.length===1?'':'s'} on ${esc(x.session?sessionLabel(x.session):'a session')}</h3><ul>${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>${x.session?`<div class="away-acts"><button type="button" data-away-open-session="${esc(x.session.id)}">Open session</button></div>`:''}</article>`;}
    if(x.kind==='join')return`<article class="away-card" data-away-key="${esc(x.key)}"><div class="away-kicker">SWIMMERS ASKING TO JOIN</div><h3>${x.count} swimmer${x.count===1?' is':'s are'} waiting for you to approve</h3><div class="away-acts"><button type="button" data-away-join>Review</button></div></article>`;
    const a=x.action,p=a.payload||{},ath=x.athlete,name=text(ath?.full_name)||'A swimmer',sl=x.session?sessionLabel(x.session):'a session';
    if(a.action_type==='finish'){const st=savedToProfile(a,{write:false});
      const lines=[[p.stoppedAtLabel?`Stopped at ${p.stoppedAtLabel}`:p.completion,p.feeling&&`Feeling ${String(p.feeling).toLowerCase()}`,p.rpe&&`RPE ${p.rpe}`].filter(Boolean).join(' · '),p.best&&`Best: ${p.best}`,p.hardest&&`Hardest: ${p.hardest}`,p.note&&!/^no$/i.test(text(p.note))&&`Note: ${p.note}`].filter(Boolean);
      return`<article class="away-card" data-away-key="${esc(x.key)}"><div class="away-kicker">DONE ON THEIR OWN</div><h3>${esc(name)} finished ${esc(sl)}</h3>${lines.map(l=>`<p>${esc(l)}</p>`).join('')}<p class="away-saved ${st}">${st==='saved'?`✓ Saved to ${esc(firstName(ath))}'s profile — counts in their training`:st==='missing'?'This session isn\'t on this phone yet — it is added to their training when it arrives':'Not counted in their training yet — open their profile to check'}</p><div class="away-acts"><button type="button" data-away-athlete="${esc(a.athlete_id)}">Open profile</button></div></article>`;}
    const kind=a.action_type==='challenge'?(p.kind==='stroke'?'#1 STROKE CHALLENGE':'CHALLENGE'):'ASKING TO CHANGE A SET';
    const body=a.action_type==='challenge'?(p.kind==='stroke'?`${p.currentStroke||'Unset'} → ${p.proposedStroke||''}${p.reason?` · ${p.reason}`:''}`:[p.reason,p.message].filter(Boolean).join(' — ')):[p.change,p.reason&&`because ${p.reason}`].filter(Boolean).join(' — ');
    return`<article class="away-card" data-away-key="${esc(x.key)}"><div class="away-kicker">${esc(kind)}</div><h3>${esc(name)} · ${esc(sl)}</h3><p>${esc(body)}</p><div class="away-acts"><button type="button" data-away-athlete="${esc(a.athlete_id)}">Open profile</button></div></article>`;}

  function host(){let h=document.querySelector('#awaySheet');if(!h){h=document.createElement('div');h.id='awaySheet';h.className='away-sheet';h.hidden=true;document.body.appendChild(h);}return h;}
  function markSeen(items){const seen=seenMap(),now=new Date().toISOString();for(const x of items){seen[x.key]=now;if(x.kind?.startsWith('swim')&&x.action?.id&&role()==='owner')M.swimmerInviteBN?.acknowledgeSessionAction?.(x.action.id)?.then?.(()=>{x.action.acknowledged_at=now;})?.catch?.(()=>{});}
    const cut=Date.now()-90*DAY;for(const [k,v] of Object.entries(seen))if(ts(v)<cut)delete seen[k];saveUi();paintBell();}
  function open({items=null,history=false}={}){const h=host(),list=items||(history?X.items():X.unseen());
    h.innerHTML=`<div class="away-panel" role="dialog" aria-label="While you were away"><header><h2>${history?'What\'s happened':'While you were away'}</h2><button type="button" data-away-close aria-label="Close">×</button></header>
      <div class="away-list">${list.length?list.map(card).join(''):'<p class="muted">Nothing new. Finished sessions, notes from other coaches and swimmers\' own sessions show here.</p>'}</div>
      <footer>${list.length&&!history?'<button type="button" class="away-ok" data-away-ok>Got it</button>':''}${history?'':'<button type="button" data-away-history>Last 30 days</button>'}</footer></div>`;
    h.hidden=false;shown=list;
    h.querySelector('[data-away-close]').onclick=()=>close(true);
    h.querySelector('[data-away-ok]')?.addEventListener('click',()=>close(true));
    h.querySelector('[data-away-history]')?.addEventListener('click',()=>{markSeen(shown);open({history:true});});
    h.querySelectorAll('[data-away-open-session]').forEach(b=>b.onclick=()=>{close(true);try{M.selectSession?.(b.dataset.awayOpenSession);M.nav?.show?.('board');M.ui?.renderCurrent?.();}catch(e){M.toast?.(e.message||'Could not open that session');}});
    h.querySelectorAll('[data-away-athlete]').forEach(b=>b.onclick=()=>{close(true);settings().selectedAthleteId=b.dataset.awayAthlete;try{M.nav?.show?.('athletes');M.ui?.renderCurrent?.();}catch{}});
    h.querySelector('[data-away-join]')?.addEventListener('click',()=>{close(true);M.swimmerInviteBN?.linkRequestsModal?.();});}
  let shown=[];
  function close(seen){const h=host();if(seen&&shown.length)markSeen(shown);shown=[];h.hidden=true;h.innerHTML='';}
  X.open=open;X.close=close;X.markSeen=markSeen;

  function paintBell(){const row=document.querySelector('.app-header .top-row');if(!row||role()==='swimmer')return;let b=document.querySelector('#awayBtn');
    if(!b){b=document.createElement('button');b.id='awayBtn';b.type='button';b.className='away-bell';b.setAttribute('aria-label','What\'s happened');b.innerHTML='<span aria-hidden="true">🔔</span><span class="away-count" hidden></span>';b.onclick=()=>{const u=X.unseen();open(u.length?{items:u}:{history:true});};
      const g=row.querySelector('#guardianShortcut');g?row.insertBefore(b,g):row.appendChild(b);}
    const n=X.unseen().length,c=b.querySelector('.away-count');c.hidden=!n;c.textContent=String(n);}
  X.paintBell=paintBell;
  // Pops up by itself only when nothing else is open (a writer, Finish, Roll picker...), and never twice for the same things.
  let popped='';
  function maybePop(){if(role()==='swimmer'||!host().hidden)return;if(document.querySelector('#modalHost .modal, #modalHost .modal-backdrop'))return;
    const u=X.unseen();if(!u.length)return;const sig=u.map(x=>x.key).join('|');if(sig===popped)return;popped=sig;open({items:u});}
  X.maybePop=maybePop;

  function tick(){try{paintBell();}catch{}if(document.visibilityState!=='visible')return;if(M.resume?.isQuiet?.())return;X.refresh().catch(()=>{});try{maybePop();}catch{}}
  function install(){paintBell();setTimeout(tick,6000);setInterval(tick,30000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>{X.refresh({force:true}).catch(()=>{});tick();},21000);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(globalThis);
