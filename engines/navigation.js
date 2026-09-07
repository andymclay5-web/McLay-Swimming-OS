'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.nav||!M?.ui)return;
  const N=M.nav,UI=M.ui,V=M.navigationEngine={build:'v4-navigation-session-selection-authority-20260907'};
  const views=new Set([...(N.views||['board','tv','hub','swimmer','meet','athletes','roll','times','connection','guardian']),'reports','data']);
  const active=view=>{if(!views.has(view))view='board';document.querySelectorAll('.view').forEach(x=>{const on=x.id===`${view}View`;x.classList.toggle('active',on);x.hidden=!on;if('inert'in x)x.inert=!on});document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===view));document.body.dataset.msosView=view;document.body.dataset.msosSurface=view==='meet'?'meet':'training';};
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}};
  const scrollKey=view=>`${M.state?.settings?.selectedSessionId||'none'}:${view||M.state?.settings?.view||'board'}`;
  const rememberScroll=()=>{try{M.state.settings=M.state.settings||{};M.state.settings.viewScroll=M.state.settings.viewScroll||{};M.state.settings.viewScroll[scrollKey()]=Math.max(0,Math.round(window.scrollY||0));saveUi()}catch{}};
  const restoreScroll=view=>{const y=Number(M.state?.settings?.viewScroll?.[scrollKey(view)]||0);requestAnimationFrame(()=>window.scrollTo(0,y));};
  const closeTransient=()=>{const h=document.querySelector('#modalHost');if(h)h.innerHTML='';if(M.state?.settings)M.state.settings.expandedItemId='';};
  const renderExtra=view=>{if(view==='reports')M.reportingUI?.render?.();if(view==='data')M.dataAdminUI?.render?.();M.dataAdminUI?.ensureShortcut?.(view);};
  const paint=view=>{active(view);if(view==='reports'||view==='data'){UI.renderHeader?.();renderExtra(view);active(view);return}UI.renderCurrent?.();active(view);};
  const esc=v=>M.util?.escape?.(v)??String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

  V.go=(view,{push=true,restore=true,restoreScroll:restoreOpt}={})=>{
    if(!views.has(view))view='board';
    M.boardStateEngine?.cancelWork?.();rememberScroll();closeTransient();
    M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode=view==='meet'?'meet':'training';
    paint(view);
    if(push){try{history.pushState(N.state?.(view)||{msos:true,msosView:view},'',`#${view}`)}catch{}}
    saveUi();
    const doRestore=restoreOpt===undefined?restore:restoreOpt;if(doRestore)restoreScroll(view);else requestAnimationFrame(()=>window.scrollTo(0,0));
  };
  V.rememberScroll=rememberScroll;V.restoreScroll=restoreScroll;V.clearTransient=closeTransient;V.activateView=active;

  N.show=V.go;N.rememberScroll=rememberScroll;N.restoreScroll=restoreScroll;N.clearTransient=closeTransient;N.activateView=active;
  N.dismissLayer=()=>{const layer=history.state?.layer;if(layer){closeTransient();history.back();return true}closeTransient();M.boardStateEngine?.cancelWork?.();paint(M.state?.settings?.view||'board');saveUi();return false;};
  // Browser/Android history owns view/detail only. It must never select a different training session.
  N.applyHistory=state=>{M.boardStateEngine?.cancelWork?.();const view=views.has(state?.msosView)?state.msosView:'board';M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode=view==='meet'?'meet':'training';if(!state?.layer)closeTransient();else if(state.layer.type==='item')M.state.settings.expandedItemId=state.layer.id;paint(view);saveUi();restoreScroll(view);};

  // Session-picker authority: published timetable slots must be visible before a workout exists.
  // Existing canonical sessions win; an unmatched published slot is an authoring route, not an empty canonical shell.
  V.sessionEntriesForDate=(date,allowed=Object.values(M.state?.canonicalSessions||{}).filter(x=>M.access?.sessionAllowed?.(x)!==false))=>{
    const sessions=(allowed||[]).filter(s=>s?.identity?.date===date),slots=M.calendar?.slots?.(date)||[],entries=sessions.map(session=>({kind:'session',id:session.id,dayPart:String(session.identity?.dayPart||''),session,label:`${session.identity?.dayPart||''} · ${(session.identity?.squads||[]).join('+')||session.identity?.title||''}`,detail:session.identity?.venue||''}));
    for(const slot of slots){if(sessions.some(s=>M.calendar?.matches?.(s,slot)))continue;entries.push({kind:'slot',id:slot.id,dayPart:String(slot.dayPart||''),slot,label:slot.label||`${slot.dayPart||''} · ${slot.squad||''}`,detail:'Published · add workout'});}
    return entries;
  };
  V.openPublishedSlot=async slot=>{
    if(!slot)return;if(!M.access?.can?.('session.create')){M.toast?.('Session creation is not available for this role');return}
    closeTransient();await M.actions?.openNewSession?.();const host=document.querySelector('#modalHost'),date=host?.querySelector?.('#newDate'),pick=host?.querySelector?.('#newSlot');if(!date||!pick)return;
    date.value=slot.date;if(typeof date.onchange==='function')await date.onchange();
    if([...pick.options].some(o=>o.value===slot.id)){pick.value=slot.id;if(typeof pick.onchange==='function')pick.onchange()}
    host.querySelector?.('#newSource')?.focus?.();
  };
  V.openSessionCalendar=async()=>{
    await M.calendar?.load?.();const allowed=Object.values(M.state?.canonicalSessions||{}).filter(x=>M.access?.sessionAllowed?.(x)!==false),current=M.currentSession?.(),todayStr=localDate(),latest=allowed.slice().sort((a,b)=>`${b.identity?.date||''}`.localeCompare(`${a.identity?.date||''}`))[0],hasToday=(M.calendar?.slots?.(todayStr)||[]).length>0,baseDate=hasToday?todayStr:(current?.identity?.date||latest?.identity?.date||todayStr);let[vy,vm]=baseDate.split('-').map(Number);
    const choose=id=>{M.selectSession?.(id);M.actions?.closeModal?.();UI.renderCurrent?.()};
    const chooseEntry=entry=>entry?.kind==='session'?choose(entry.id):V.openPublishedSlot(entry?.slot);
    const openDayPicker=list=>{const m=UI.modal('Choose session',`<div class="picker-list">${list.map((x,i)=>`<button data-cal-entry="${i}"><b>${esc(x.label)}</b><small>${esc(x.detail||'')}</small></button>`).join('')}</div>`);m.querySelectorAll('[data-cal-entry]').forEach(b=>b.onclick=()=>chooseEntry(list[Number(b.dataset.calEntry)]))};
    const m=UI.modal('Select session','');
    const draw=()=>{const first=new Date(vy,vm-1,1),startWeekday=(first.getDay()+6)%7,daysInMonth=new Date(vy,vm,0).getDate(),monthLabel=first.toLocaleDateString('en-NZ',{month:'long',year:'numeric'});let cells='';for(let i=0;i<startWeekday;i++)cells+='<div class="cal-day cal-empty"></div>';
      for(let day=1;day<=daysInMonth;day++){const dateStr=`${vy}-${String(vm).padStart(2,'0')}-${String(day).padStart(2,'0')}`,entries=V.sessionEntriesForDate(dateStr,allowed);const pillsHtml=['AM','PM'].map(part=>{const list=entries.filter(x=>x.dayPart.toUpperCase()===part);if(!list.length)return'<span class="cal-pill cal-pill-empty"></span>';const selected=list.some(x=>x.kind==='session'&&x.id===current?.id),published=list.some(x=>x.kind==='slot');return`<button type="button" class="cal-pill has-session${selected?' selected':''}" data-cal-date="${dateStr}" data-cal-part="${part}" title="${published?'Published session available':'Saved session'}">${part}</button>`}).join(''),extra=entries.filter(x=>!['AM','PM'].includes(x.dayPart.toUpperCase())),extraHtml=extra.length?`<button type="button" class="cal-pill has-session" data-cal-date="${dateStr}" data-cal-part="OTHER">${esc(extra[0].dayPart||'•')}</button>`:'';cells+=`<div class="cal-day${dateStr===todayStr?' cal-today':''}"><span class="cal-date">${day}</span><span class="cal-pills">${pillsHtml}${extraHtml}</span></div>`}
      m.querySelector('.modal-body').innerHTML=`<div class="cal-month-nav"><button type="button" data-cal-prev aria-label="Previous month">‹</button><strong>${esc(monthLabel)}</strong><button type="button" data-cal-next aria-label="Next month">›</button></div><div class="cal-grid cal-grid-head"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="cal-grid">${cells}</div>`;
      m.querySelector('[data-cal-prev]').onclick=()=>{vm--;if(vm<1){vm=12;vy--}draw()};m.querySelector('[data-cal-next]').onclick=()=>{vm++;if(vm>12){vm=1;vy++}draw()};m.querySelectorAll('[data-cal-date]').forEach(b=>{b.onclick=()=>{const entries=V.sessionEntriesForDate(b.dataset.calDate,allowed),part=b.dataset.calPart,list=part==='OTHER'?entries.filter(x=>!['AM','PM'].includes(x.dayPart.toUpperCase())):entries.filter(x=>x.dayPart.toUpperCase()===part);if(list.length===1)chooseEntry(list[0]);else if(list.length>1)openDayPicker(list)}})};
    draw();
  };
  UI.openSessionCalendar=V.openSessionCalendar;

  let rootBackArmed=false;
  N.init=()=>{if(V.initialized)return;V.initialized=true;M.state.settings=M.state.settings||{};const role=M.access?.role?.()||'owner',initial=role==='swimmer'?'swimmer':'board';M.state.settings.view=initial;M.state.settings.surfaceMode='training';active(initial);try{history.replaceState(N.state?.(initial,{exitGuard:true})||{msos:true,msosView:initial,exitGuard:true},'',`#${initial}`);history.pushState(N.state?.(initial)||{msos:true,msosView:initial},'',`#${initial}`)}catch{}
    addEventListener('popstate',e=>{if(e.state?.exitGuard){if(rootBackArmed){history.back();return}rootBackArmed=true;M.toast?.('Press back again to exit');try{history.pushState(N.state?.(M.state.settings.view)||{msos:true,msosView:M.state.settings.view},'',`#${M.state.settings.view}`)}catch{}setTimeout(()=>rootBackArmed=false,1800);return}if(e.state?.msos)N.applyHistory(e.state)});
    addEventListener('pagehide',rememberScroll);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberScroll();else if(document.visibilityState==='visible')restoreScroll(M.state.settings.view)});renderExtra(initial);saveUi();
  };

  function openAthlete(id){if(!id)return;M.state.settings.selectedAthleteId=id;M.state.settings.selectedSwimmerId=id;saveUi();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});}
  document.addEventListener('click',e=>{
    const nav=e.target.closest?.('.bottom-nav [data-nav]');if(nav){e.preventDefault();V.go(nav.dataset.nav,{restore:true});return}
    const report=e.target.closest?.('#reportsShortcut,[data-msos-reports]');if(report){e.preventDefault();V.go('reports',{restore:false});return}
    const data=e.target.closest?.('[data-msos-data]');if(data){e.preventDefault();V.go('data',{restore:false});return}
    const roll=e.target.closest?.('[data-msos-roll]');if(roll){e.preventDefault();V.go('roll',{restore:false});return}
    const times=e.target.closest?.('[data-msos-t400]');if(times){e.preventDefault();V.go('times',{restore:false});return}
    const swimmers=e.target.closest?.('[data-msos-swimmers]');if(swimmers){e.preventDefault();V.go((M.access?.role?.()||'owner')==='swimmer'?'swimmer':'athletes',{restore:false});return}
    const ath=e.target.closest?.('[data-msos-ath]');if(ath){e.preventDefault();openAthlete(ath.dataset.msosAth);return}
    const timeRow=e.target.closest?.('#timesView .time-row,#timesView .timing-evidence-row');if(timeRow&&!e.target.closest?.('button,input,select,label')){const n=timeRow.querySelector('strong')?.textContent?.trim(),a=(M.state.athletes||[]).find(x=>String(x.full_name||'').trim()===n);if(a){e.preventDefault();openAthlete(a.id)}}
  });
})(globalThis);
