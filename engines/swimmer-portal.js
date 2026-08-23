'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const E=g.MSOSEngines||{},UI=M.ui,U=M.util;
  const P=M.swimmerPortal={build:'v4-swimmer-portal-20260823cf'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>U.escape(v),clock=s=>U.clock(Number(s));
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const role=()=>text(M.state?.settings?.activeRole||'owner').toLowerCase();
  const isSwimmer=()=>role()==='swimmer';
  const athlete=()=>{const id=M.state?.settings?.activeUserAthleteId||M.state?.settings?.selectedAthleteId||'';return(M.state?.athletes||[]).find(a=>a.id===id&&a.active!==false)||null};
  const same=v=>text(v).toLowerCase();
  const course=()=>text(M.state?.settings?.swimmerPortalCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
  const sessionAllows=(s,a)=>!!(s&&a&&(!(s.identity?.squads||[]).length||(s.identity.squads||[]).some(x=>same(x)===same(a.squad))));
  function sessionFor(a){
    const selected=M.currentSession?.();if(sessionAllows(selected,a))return selected;
    const today=nzToday(),rows=Object.values(M.state?.canonicalSessions||{}).filter(s=>sessionAllows(s,a)&&s?.identity?.date);
    return rows.sort((x,y)=>{const xt=x.identity.date===today?0:x.identity.date>today?2:1,yt=y.identity.date===today?0:y.identity.date>today?2:1;return xt-yt||(xt===1?String(y.identity.date).localeCompare(String(x.identity.date)):String(x.identity.date).localeCompare(String(y.identity.date)))||String(x.identity.dayPart||'').localeCompare(String(y.identity.dayPart||''))})[0]||null;
  }
  function coordinator(){return E.Coordinator||M.coordinatorEngine||null}
  function prescription(s,item,a){try{return coordinator()?.prescription?.(s,item,a,M.state)||{item,target:{status:'none'}}}catch(err){return{item,target:{status:'missing',message:'Prescription unavailable'},error:err}}}
  function itemLabel(item){return M.boardEngine?.workLabel?.(item)||`${Math.max(1,Number(item?.reps)||1)}×${Number(item?.distance)||0}${item?.stroke?` ${item.stroke}`:''}`}
  function itemCue(item){return M.boardEngine?.cueText?.(item)||[item?.zone,item?.restSeconds?`Rest · ${item.restSeconds}s`:'',item?.cycleSeconds?`@ ${clock(item.cycleSeconds)}`:'',...(item?.cues||[])].filter(Boolean).join(' · ')}
  function targetHtml(target){
    if(!target||target.status==='none')return'';
    if(target.status==='ok')return`<div class="swp-target"><b>Target ${esc(clock(target.seconds))}</b>${target.sendOff?`<span>leave ${esc(clock(target.sendOff))}</span>`:''}<small>${esc(target.source||'')}</small></div>`;
    if(target.status==='fallback')return`<div class="swp-target guide"><b>${esc(target.stroke||'')} aerobic guide</b><span>HR ${esc(target.hr||'—')}${target.sr?` · SR ${esc(target.sr)}`:''}</span><small>${esc(target.message||target.source||'')}</small></div>`;
    if(target.status==='pattern_fallback')return`<div class="swp-target guide"><b>Aerobic guide</b>${(target.rows||[]).map(r=>`<span>#${esc(r.rep)} ${esc(r.zone)} · HR ${esc(r.hr||'—')}${r.sr?` · SR ${esc(r.sr)}`:''}</span>`).join('')}<small>${esc(target.message||target.source||'')}</small></div>`;
    if(target.status==='pattern')return`<div class="swp-target"><b>Aerobic targets</b>${(target.rows||[]).map(r=>`<span>#${esc(r.rep)} ${esc(r.zone)} · ${esc(clock(r.seconds))}${r.sendOff?` on ${esc(clock(r.sendOff))}`:''}</span>`).join('')}<small>${esc(target.source||'')}</small></div>`;
    if(target.status==='rep_race')return`<div class="swp-target"><b>Race pace</b>${(target.rows||[]).map(r=>r.status==='ok'?`<span>#${esc(r.rep)} · ${esc(clock(r.seconds))}${r.sendOff?` on ${esc(clock(r.sendOff))}`:''}</span>`:`<span>#${esc(r.rep)} · ${esc(r.label||r.message||'No evidence')}</span>`).join('')}</div>`;
    return`<div class="swp-target missing"><b>${esc(target.message||'No pace evidence')}</b>${target.source?`<small>${esc(target.source)}</small>`:''}</div>`;
  }
  function renderSet(s,item,a){
    if(item?.kind==='cue')return`<div class="swp-cue">${esc(item.text||item.raw||'')}</div>`;
    if(item?.kind==='group')return`<section class="swp-group"><header><b>${Number(item.rounds)||1} rounds</b></header>${(item.items||[]).map(x=>renderSet(s,x,a)).join('')}</section>`;
    const p=prescription(s,item,a),actual=p.item||item,cue=itemCue(actual),changed=JSON.stringify([actual.reps,actual.distance,actual.stroke,actual.cycleSeconds,actual.restSeconds,actual.repInstructions,actual.repPattern])!==JSON.stringify([item.reps,item.distance,item.stroke,item.cycleSeconds,item.restSeconds,item.repInstructions,item.repPattern]);
    return`<article class="swp-set${changed?' modified':''}"><div class="swp-work"><strong>${esc(itemLabel(actual))}</strong>${changed?'<em>Your prescription</em>':''}</div>${cue?`<div class="swp-cue">${esc(cue)}</div>`:''}${targetHtml(p.target)}</article>`;
  }
  function todayPanel(a){
    const s=sessionFor(a);if(!s)return`<section class="swp-card"><h2>No session loaded</h2><p>Your next programme session has not reached this device yet.</p><button data-swp-refresh>Refresh</button></section>`;
    const blocks=(s.blocks||[]).map(b=>`<section class="swp-block"><header><div><small>${esc(b.title||U.blockTitle?.(b.type)||'Block')}</small><h2>${esc(b.title||'Block')}</h2></div><b>${Number(M.session?.blockDistance?.(b)||0).toLocaleString()}m squad</b></header>${(b.items||[]).map(x=>renderSet(s,x,a)).join('')}</section>`).join('');
    return`<section class="swp-session-head"><div><small>${esc(`${s.identity?.date||''} ${s.identity?.dayPart||''}`)}</small><h1>${esc(s.identity?.title||'Today')}</h1><p>${esc([a.squad,s.identity?.course].filter(Boolean).join(' · '))}</p></div><button data-swp-refresh>Refresh</button></section>${blocks}`;
  }
  function resolvedCourse(row,a){
    const own=text(row?.course).toUpperCase();if(own)return own;
    const history=[...(M.state?.resultsEventHistory||[]),...(M.refs?.get?.('results_event_history')||[])],d=Number(row?.distance),st=same(row?.stroke),sec=Number(row?.seconds);
    const hit=history.find(x=>(!x.athlete_id||x.athlete_id===a.id)&&Number(x.distance)===d&&same(x.stroke)===st&&Math.abs(Number(x.result_seconds??x.seconds)-sec)<.02&&text(x.course));
    return text(hit?.course).toUpperCase()||'';
  }
  function uniquePbs(a){
    let rows=[];try{rows=M.performanceEngine?.rows?.(a,M.state,'')||[]}catch{}
    const map=new Map();for(const r of rows){const crs=resolvedCourse(r,a),k=`${crs||'?'}|${r.distance}|${same(r.stroke)}`,old=map.get(k);if(!old||Number(r.seconds)<Number(old.seconds))map.set(k,{...r,resolvedCourse:crs})}return[...map.values()];
  }
  function performancePanel(a){
    const c=course(),all=uniquePbs(a),exact=all.filter(r=>r.resolvedCourse===c),unknown=all.filter(r=>!r.resolvedCourse),other=all.filter(r=>r.resolvedCourse&&r.resolvedCourse!==c),ranked=[...exact].sort((x,y)=>(Number(y.points)||-1)-(Number(x.points)||-1)||Number(x.seconds)-Number(y.seconds));
    const system=M.performanceEngine?.scoreSystem?.(a)||'WA';
    const top=ranked[0];
    return`<section class="swp-card"><div class="swp-course"><b>Performance</b><div><button data-swp-course="SCM" class="${c==='SCM'?'active':''}">SCM</button><button data-swp-course="LCM" class="${c==='LCM'?'active':''}">LCM</button></div></div>${top?`<div class="swp-hero"><small>#1 event</small><strong>${esc(`${top.distance} ${top.stroke}`)}</strong><span>${esc(clock(top.seconds))}${top.points?` · ${Math.round(top.points)} ${esc(system)}`:''}</span></div>`:`<div class="swp-warning">No verified ${esc(c)} PB ranking is loaded.</div>`}${ranked.length?`<h3>PBs · ${ranked.length} unique events</h3><div class="swp-pbs">${ranked.map((r,i)=>`<div><b>#${i+1} ${esc(`${r.distance} ${r.stroke}`)}</b><span>${esc(clock(r.seconds))}${r.points?` · ${Math.round(r.points)} ${esc(system)}`:''}</span></div>`).join('')}</div>`:''}${unknown.length?`<div class="swp-warning">${unknown.length} PB event${unknown.length===1?'':'s'} need course confirmation before MSOS will call them SCM or LCM.</div>`:''}${other.length&&!exact.length?`<button data-swp-course="${esc(other[0].resolvedCourse)}">Show ${esc(other[0].resolvedCourse)} PBs</button>`:''}</section>${developmentPanel(a,c)}`;
  }
  function developmentPanel(a,c){let ops=[];try{ops=E.Development?.opportunities?.(a,M.state,c)||M.developmentEngine?.opportunities?.(a,M.state,c)||[]}catch{}if(!ops.length)return'';return`<section class="swp-card"><h2>What could I race next?</h2>${ops.slice(0,4).map(x=>`<article class="swp-op"><strong>${esc(x.label||x.event||`${x.distance||''} ${x.stroke||''}`)}</strong>${x.why?`<p>${esc(x.why)}</p>`:''}${x.supportingEvidence?`<small>Evidence · ${esc(`${x.supportingEvidence.distance||''} ${x.supportingEvidence.stroke||''} ${clock(x.supportingEvidence.seconds)}`)}</small>`:''}${x.whatItShows?`<small>What it tells us · ${esc(x.whatItShows)}</small>`:''}${x.modeledSeconds?`<small>Starting guide · ≈ ${esc(clock(x.modeledSeconds))} · estimate only</small>`:''}</article>`).join('')}</section>`}
  function trainingPanel(a){
    let v=null;try{v=M.swimmerTrainingBG?.viewFor?.(a)||null}catch{}const today=v?.today||null,seven=v?.accumulation?.last7||v?.last7||null,thirty=v?.accumulation?.last30||v?.last30||null,t400=M.performanceEngine?.t400s?.(a,M.state)?.[0]||null;
    return`<section class="swp-card"><h2>Training</h2>${today?`<div class="swp-hero"><small>Today</small><strong>${Number(today.deliveredMetres??today.prescribedMetres??0).toLocaleString()}m</strong><span>${esc(today.delivery||'current prescription')}</span></div>`:'<p>No individual training record is loaded for today.</p>'}${t400?`<div class="swp-row"><b>T400</b><span>${esc(clock(t400.result_seconds??t400.seconds))} · ${esc(t400.pool_course||t400.course||'course ?')}</span></div>`:''}${seven?`<div class="swp-row"><b>Last 7 days</b><span>${Number(seven.metres??seven.totalMetres??0).toLocaleString()}m</span></div>`:''}${thirty?`<div class="swp-row"><b>Last 30 days</b><span>${Number(thirty.metres??thirty.totalMetres??0).toLocaleString()}m</span></div>`:''}<p class="swp-note">Training evidence is context for coaching decisions; it is not treated as proof that one set caused a result.</p></section>`;
  }
  function pathwayPanel(a){
    const c=course();let p=null;try{p=M.pathway?.profile?.(a,c)||null}catch{}const events=(p?.events||[]).filter(x=>x?.pb).slice(0,8);return`<section class="swp-card"><h2>Pathway · ${esc(c)}</h2>${events.length?events.map(e=>{const answer=M.swimmerTabsUI?.poolsidePathwayAnswer?.(a,e),n=answer?.next;return`<div class="swp-path"><b>${esc(`${e.pb.distance} ${e.pb.stroke}`)}</b><span>PB ${esc(clock(e.pb.result_seconds))}</span>${n?`<small>Next · ${esc(n._label||n.name||'milestone')} · ${esc(clock(n._seconds))} · ${Number(n.gapSeconds||0).toFixed(2)}s</small>`:'<small>No faster loaded milestone ahead.</small>'}</div>`}).join(''):`<p>No verified ${esc(c)} PB-to-standard pathway is loaded.</p>`}</section>`;
  }
  function meetPanel(a){
    const meets=new Map((M.state?.meets||[]).map(x=>[x.id,x])),today=nzToday(),entries=(M.state?.meetEntries||[]).filter(x=>x.athlete_id===a.id&&!['complete','scratched'].includes(same(x.status))).map(x=>({entry:x,meet:meets.get(x.meet_id)||{}})).filter(x=>!x.meet.date||x.meet.date>=today).sort((x,y)=>String(x.meet.date||'9999').localeCompare(String(y.meet.date||'9999')));return`<section class="swp-card"><h2>Meet</h2>${entries.length?entries.map(x=>`<div class="swp-row"><b>${esc(x.entry.event||`${x.entry.distance||''} ${x.entry.stroke||''}`)}</b><span>${esc([x.meet.title||x.meet.name,x.meet.date,x.entry.round].filter(Boolean).join(' · '))}</span></div>`).join(''):'<p>No upcoming loaded entries.</p>'}</section>`;
  }
  function portalMarkup(a,tab){const panels={today:todayPanel,performance:performancePanel,training:trainingPanel,pathway:pathwayPanel,meet:meetPanel},render=panels[tab]||todayPanel;return`<section class="swp-shell"><header class="swp-head"><div><small>MY SWIMMING</small><h1>${esc(a.full_name)}</h1><span>${esc(a.squad||'')}</span></div><span class="swp-live">${navigator.onLine?'Online':'Offline'}</span></header><nav class="swp-tabs">${['today','performance','training','pathway','meet'].map(x=>`<button data-swp-tab="${x}" class="${x===tab?'active':''}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</nav><main data-swp-panel>${render(a)}</main></section>`}
  function applySwimmerChrome(){if(!isSwimmer())return;document.body.classList.add('msos-swimmer-portal');document.querySelector('.sticky-actions')?.setAttribute('hidden','');document.querySelector('.bottom-nav')?.setAttribute('hidden','');document.querySelector('#guardianShortcut')?.setAttribute('hidden','');document.querySelector('#newSessionBtn')?.setAttribute('hidden','');document.querySelector('#squadTabs')?.setAttribute('hidden','');document.querySelector('#wakeBtn')?.setAttribute('hidden','');document.querySelector('#tvModeBtn')?.setAttribute('hidden','');document.querySelector('#meetModeBtn')?.setAttribute('hidden','');const badge=document.querySelector('#roleBadge');if(badge)badge.textContent='Swimmer';}
  function render(){
    if(!isSwimmer())return false;applySwimmerChrome();const h=document.querySelector('#boardView');if(!h)return true;const a=athlete();if(!a){h.innerHTML='<section class="swp-card"><h1>Swimmer portal</h1><p>This sign-in is not linked to a swimmer yet.</p></section>';return true}const tab=M.state.settings.swimmerPortalTab||'today';h.innerHTML=portalMarkup(a,tab);h.querySelectorAll('[data-swp-tab]').forEach(b=>b.onclick=()=>{M.state.settings.swimmerPortalTab=b.dataset.swpTab;M.store.save(M.state);render()});h.querySelectorAll('[data-swp-course]').forEach(b=>b.onclick=()=>{M.state.settings.swimmerPortalCourse=b.dataset.swpCourse;M.store.save(M.state);render()});h.querySelectorAll('[data-swp-refresh]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Refreshing…';try{await refresh(a);M.toast?.('Updated')}catch(e){M.toast?.(e.message||'Refresh unavailable')}finally{render()}});return true;
  }
  async function refresh(a=athlete()){
    if(!a)throw new Error('Swimmer is not linked');await M.cloudSessionEngine?.ensureFresh?.();if(M.cloud?.pullShadow&&M.cloud?.applyShadow){const shadow=await M.cloud.pullShadow();M.cloud.applyShadow(shadow)}if(M.cloud?.pullAthletePathway)await M.cloud.pullAthletePathway(a.id);g.dispatchEvent?.(new Event('msos:data-updated'));return true;
  }
  const baseBoard=UI.renderBoard?.bind(UI);if(baseBoard)UI.renderBoard=()=>{if(!render())baseBoard()};
  const baseCurrent=UI.renderCurrent?.bind(UI);if(baseCurrent)UI.renderCurrent=()=>{if(isSwimmer()){if(M.state.settings.view!=='board')M.state.settings.view='board';render();return}return baseCurrent?.()};
  P.isSwimmer=isSwimmer;P.athlete=athlete;P.sessionFor=sessionFor;P.prescription=prescription;P.uniquePbs=uniquePbs;P.resolvedCourse=resolvedCourse;P.refresh=refresh;P.render=render;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(isSwimmer()){M.state.settings.view='board';render()}},{once:true});else if(isSwimmer())render();
})(globalThis);
