'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.nav||!M?.ui)return;
  const N=M.nav,UI=M.ui,V=M.navigationEngine={build:'v4-navigation-session-selection-authority-20260901'};
  const views=new Set([...(N.views||['board','tv','hub','swimmer','meet','athletes','roll','times','connection','guardian']),'reports','data']);
  const MEET_SHELVED=true;
  const normalView=view=>MEET_SHELVED&&view==='meet'?'board':views.has(view)?view:'board';
  const clearMeetChrome=()=>{
    document.body.classList.remove('meet-program-ba-active');
    document.querySelector('[data-ba-talkbar]')?.remove();
  };
  const hideShelvedMeet=()=>{
    if(!MEET_SHELVED)return;
    document.body.dataset.msosMeetShelved='1';
    document.querySelectorAll('.bottom-nav [data-nav="meet"]').forEach(x=>x.hidden=true);
    const nav=document.querySelector('.bottom-nav');
    if(nav){const visible=[...nav.querySelectorAll('[data-nav]')].filter(x=>!x.hidden);if(visible.length)nav.style.gridTemplateColumns=`repeat(${visible.length},1fr)`}
  };
  const active=view=>{view=normalView(view);document.querySelectorAll('.view').forEach(x=>{const on=x.id===`${view}View`;x.classList.toggle('active',on);x.hidden=!on;if('inert'in x)x.inert=!on});document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===view));document.body.dataset.msosView=view;document.body.dataset.msosSurface='training';clearMeetChrome();hideShelvedMeet();};
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}};
  const scrollKey=view=>`${M.state?.settings?.selectedSessionId||'none'}:${view||M.state?.settings?.view||'board'}`;
  const rememberScroll=()=>{try{M.state.settings=M.state.settings||{};M.state.settings.viewScroll=M.state.settings.viewScroll||{};M.state.settings.viewScroll[scrollKey()]=Math.max(0,Math.round(window.scrollY||0));saveUi()}catch{}};
  const restoreScroll=view=>{const y=Number(M.state?.settings?.viewScroll?.[scrollKey(view)]||0);requestAnimationFrame(()=>window.scrollTo(0,y));};
  const closeTransient=()=>{const h=document.querySelector('#modalHost');if(h)h.innerHTML='';if(M.state?.settings)M.state.settings.expandedItemId='';};
  const renderExtra=view=>{if(view==='reports')M.reportingUI?.render?.();if(view==='data')M.dataAdminUI?.render?.();M.dataAdminUI?.ensureShortcut?.(view);};
  const paint=view=>{view=normalView(view);active(view);if(view==='reports'||view==='data'){UI.renderHeader?.();renderExtra(view);active(view);return}UI.renderCurrent?.();active(view);};

  const nzToday=()=>{try{const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}catch{return new Date().toISOString().slice(0,10)}};
  let publishedCalendar=null;
  const loadPublishedCalendar=async()=>{
    if(publishedCalendar)return publishedCalendar;
    const urls=['monthly_calendar.json?v=20260907-training-calendar-b','monthly_calendar.json'];
    for(const url of urls){try{const r=await fetch(url,{cache:'no-store'});if(r.ok){const j=await r.json();if(Array.isArray(j?.dates)){publishedCalendar=j;return j}}}catch{}}
    return {dates:[]};
  };
  const squadsOf=x=>(x||[]).map(v=>String(v||'').trim()).filter(Boolean);
  const sameSquads=(a,b)=>{a=squadsOf(a).slice().sort();b=squadsOf(b).slice().sort();return a.length===b.length&&a.every((x,i)=>x===b[i])};
  const canonicalMatchesSlot=(session,date,slot)=>session?.identity?.date===date&&String(session.identity.dayPart||'').toUpperCase()===String(slot.day_part||'').toUpperCase()&&sameSquads(session.identity.squads,slot.squads);
  const slotTitle=(date,slot)=>`${String(slot.day_part||'').toUpperCase()} · ${slot.start_time||''}${slot.end_time?`–${slot.end_time}`:''} · ${squadsOf(slot.squads).join('+')||'Training'}${slot.venue?` · ${slot.venue}`:''}`;
  const primeNewSessionSlot=(date,slot)=>{
    M.actions?.openNewSession?.();
    let tries=0;
    const apply=()=>{
      const sel=document.querySelector('#coreSlot');
      if(!sel){if(tries++<40)setTimeout(apply,50);return}
      const part=String(slot.day_part||'').toUpperCase(),time=String(slot.start_time||''),squads=squadsOf(slot.squads).map(x=>x.toUpperCase());
      const opt=[...sel.options].find(o=>{const t=String(o.textContent||'').toUpperCase();return (!part||t.includes(part))&&(!time||t.includes(time))&&squads.every(s=>t.includes(s))})||[...sel.options].find(o=>String(o.textContent||'').toUpperCase().includes(part));
      if(opt){sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}))}
      else M.toast?.(`Published ${date} ${part} slot is available — choose it in Add session`);
    };
    apply();
  };
  UI.openSessionCalendar=async()=>{
    const allowed=Object.values(M.state.canonicalSessions||{}).filter(x=>M.access.sessionAllowed(x));
    const published=await loadPublishedCalendar();
    const scheduleByDate={};for(const d of published.dates||[]){if(d?.date)(scheduleByDate[d.date]=d.sessions||[])}
    if(!allowed.length&&!Object.keys(scheduleByDate).length){M.toast('No sessions available yet');return}
    const current=M.currentSession();const byDate={};for(const s of allowed){const d=s.identity?.date;if(!d)continue;(byDate[d]=byDate[d]||[]).push(s)}
    const todayStr=nzToday();let baseDate=todayStr;
    const coverageStart=published.coverage_start||Object.keys(scheduleByDate).sort()[0]||'';
    const coverageEnd=published.coverage_end||Object.keys(scheduleByDate).sort().at(-1)||'';
    if(coverageStart&&coverageEnd&&(todayStr<coverageStart||todayStr>coverageEnd))baseDate=current?.identity?.date||coverageEnd||todayStr;
    let[vy,vm]=baseDate.split('-').map(Number);
    const choose=id=>{M.selectSession(id);M.actions.closeModal();M.state.settings.view='board';M.state.settings.surfaceMode='training';UI.renderCurrent();active('board')};
    const openDayPicker=(dateStr,part)=>{
      const canon=(byDate[dateStr]||[]).filter(x=>String(x.identity?.dayPart||'').toUpperCase()===part);
      const scheduled=(scheduleByDate[dateStr]||[]).filter(x=>String(x.day_part||'').toUpperCase()===part).filter(slot=>!canon.some(s=>canonicalMatchesSlot(s,dateStr,slot)));
      const entries=[...canon.map(session=>({kind:'open',session,label:`${String(session.identity.dayPart||'').toUpperCase()} · ${squadsOf(session.identity.squads).join('+')||session.identity.title||'Training'} · ${session.identity.venue||''}`})),...scheduled.map(slot=>({kind:'create',slot,label:slotTitle(dateStr,slot)}))];
      if(entries.length===1&&entries[0].kind==='open'){choose(entries[0].session.id);return}
      const modal=UI.modal(`${dateStr} · ${part}`,`<div class="picker-list">${entries.map((e,i)=>`<button type="button" data-training-cal-choice="${i}"><b>${U.escape(e.label)}</b><small>${e.kind==='open'?'Open session':'Published schedule · Create session'}</small></button>`).join('')||'<p class="muted">No training scheduled.</p>'}</div>`);
      modal.querySelectorAll('[data-training-cal-choice]').forEach(b=>b.onclick=()=>{const e=entries[Number(b.dataset.trainingCalChoice)];if(!e)return;if(e.kind==='open')choose(e.session.id);else primeNewSessionSlot(dateStr,e.slot)});
    };
    const m=UI.modal('Select Training session','');
    const draw=()=>{
      const first=new Date(vy,vm-1,1),startWeekday=(first.getDay()+6)%7,daysInMonth=new Date(vy,vm,0).getDate(),monthLabel=first.toLocaleDateString('en-NZ',{month:'long',year:'numeric'});let cells='';
      for(let i=0;i<startWeekday;i++)cells+='<div class="cal-day cal-empty"></div>';
      for(let day=1;day<=daysInMonth;day++){
        const dateStr=`${vy}-${String(vm).padStart(2,'0')}-${String(day).padStart(2,'0')}`,canon=byDate[dateStr]||[],scheduled=scheduleByDate[dateStr]||[];
        const pillsHtml=['AM','PM'].map(part=>{const cs=canon.filter(x=>String(x.identity?.dayPart||'').toUpperCase()===part),ss=scheduled.filter(x=>String(x.day_part||'').toUpperCase()===part);if(!cs.length&&!ss.length)return'<span class="cal-pill cal-pill-empty"></span>';const isSel=cs.some(x=>x.id===current?.id),scheduledOnly=!cs.length&&!!ss.length;return`<button type="button" class="cal-pill has-session${isSel?' selected':''}${scheduledOnly?' scheduled-session':''}" data-cal-date="${dateStr}" data-cal-part="${part}" aria-label="${U.escape(dateStr+' '+part)}">${part}</button>`}).join('');
        cells+=`<div class="cal-day${dateStr===todayStr?' cal-today':''}" data-training-calendar-date="${dateStr}"><span class="cal-date">${day}</span><span class="cal-pills">${pillsHtml}</span></div>`;
      }
      m.querySelector('.modal-body').innerHTML=`<div class="cal-month-nav"><button type="button" data-cal-prev aria-label="Previous month">‹</button><strong data-training-calendar-month>${U.escape(monthLabel)}</strong><button type="button" data-cal-next aria-label="Next month">›</button></div><div class="cal-grid cal-grid-head"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="cal-grid">${cells}</div><p class="muted" style="margin-top:10px">Published schedule is shown even before a workout has been created. Tap AM/PM to open or create that Training session.</p>`;
      m.querySelector('[data-cal-prev]').onclick=()=>{vm--;if(vm<1){vm=12;vy--}draw()};m.querySelector('[data-cal-next]').onclick=()=>{vm++;if(vm>12){vm=1;vy++}draw()};m.querySelectorAll('[data-cal-date]').forEach(b=>b.onclick=()=>openDayPicker(b.dataset.calDate,b.dataset.calPart));
    };
    draw();
  };

  V.go=(view,{push=true,restore=true,restoreScroll:restoreOpt}={})=>{
    view=normalView(view);
    M.boardStateEngine?.cancelWork?.();rememberScroll();closeTransient();
    M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode='training';
    paint(view);
    if(push){try{history.pushState(N.state?.(view)||{msos:true,msosView:view},'',`#${view}`)}catch{}}
    saveUi();
    const doRestore=restoreOpt===undefined?restore:restoreOpt;if(doRestore)restoreScroll(view);else requestAnimationFrame(()=>window.scrollTo(0,0));
  };
  V.rememberScroll=rememberScroll;V.restoreScroll=restoreScroll;V.clearTransient=closeTransient;V.activateView=active;

  N.show=V.go;N.rememberScroll=rememberScroll;N.restoreScroll=restoreScroll;N.clearTransient=closeTransient;N.activateView=active;
  N.dismissLayer=()=>{const layer=history.state?.layer;if(layer){closeTransient();history.back();return true}closeTransient();M.boardStateEngine?.cancelWork?.();paint(normalView(M.state?.settings?.view||'board'));saveUi();return false;};
  N.applyHistory=state=>{M.boardStateEngine?.cancelWork?.();const view=normalView(state?.msosView);M.state.settings=M.state.settings||{};M.state.settings.view=view;M.state.settings.surfaceMode='training';if(!state?.layer)closeTransient();else if(state.layer.type==='item')M.state.settings.expandedItemId=state.layer.id;paint(view);saveUi();restoreScroll(view);};

  let rootBackArmed=false;
  N.init=()=>{if(V.initialized)return;V.initialized=true;const initial=normalView(M.state?.settings?.view||'board');M.state.settings.view=initial;M.state.settings.surfaceMode='training';active(initial);try{history.replaceState(N.state?.(initial,{exitGuard:true})||{msos:true,msosView:initial,exitGuard:true},'',`#${initial}`);history.pushState(N.state?.(initial)||{msos:true,msosView:initial},'',`#${initial}`)}catch{}
    addEventListener('popstate',e=>{if(e.state?.exitGuard){if(rootBackArmed){history.back();return}rootBackArmed=true;M.toast?.('Press back again to exit');try{history.pushState(N.state?.(M.state.settings.view)||{msos:true,msosView:M.state.settings.view},'',`#${M.state.settings.view}`)}catch{}setTimeout(()=>rootBackArmed=false,1800);return}if(e.state?.msos)N.applyHistory(e.state)});
    addEventListener('pagehide',rememberScroll);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberScroll();else if(document.visibilityState==='visible')restoreScroll(M.state.settings.view)});renderExtra(initial);hideShelvedMeet();
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
