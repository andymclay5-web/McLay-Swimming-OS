'use strict';
// Coach Hub screens (12 Oct 2026). Andy: Coach Hub is "where you go to retrieve, to find, to input" -- buttons,
// each opening its own screen, "rather than being all sprawled down that screen". This file draws two of those
// screens; engines/coach-loop-ui.js owns the Hub itself and calls these.
//  - Reports & analysis: "hit the button for whatever report we want and the information comes up straight away"
//    -- This session, This week, Season so far, Test sets, Times, Per swimmer. Read-only: every number comes from
//    the owners (session totals, dosage engine, plan context, timing records, results evidence).
//  - Swimmers: profiles, giving access, and "swimmers that have the app ... and manage that" (who has it, last
//    seen, account vs QR link, revoke QR links). The list comes from msos_owner_swimmer_access() (owner-only).
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const P=M.hubPanels={build:'v4-hub-panels-20261012'};
  const U=M.util||{},E=g.MSOSEngines||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),lc=v=>text(v).toLowerCase();
  const clock=s=>U.clock?U.clock(s):String(s);
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const addDay=(iso,n)=>new Date(Date.parse(`${iso}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
  const monday=iso=>{const d=new Date(`${iso}T12:00:00Z`),dow=(d.getUTCDay()+6)%7;return addDay(iso,-dow);};
  const dayName=iso=>new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
  const num=n=>Math.round(Number(n)||0).toLocaleString();
  const SYS=['Regeneration','Development','Overload','Threshold','Clearance','Race pace','Speed / Max','Skill / Technical'];
  const COACH={'Development':'Aerobic Capacity','Threshold':'Aerobic Power','Clearance':'Aerobic Power (top)','Race pace':'Anaerobic Power','Speed / Max':'Anaerobic Capacity','Overload':'Overload','Regeneration':'Regeneration','Skill / Technical':'Skills'};

  // ---------- data helpers (read-only) ----------
  function sessions(){return Object.values(M.state?.canonicalSessions||{}).filter(s=>s?.identity?.date&&(!M.access?.sessionAllowed||M.access.sessionAllowed(s)));}
  function total(s){try{return Number(s.finish?.actualDistance)||M.session?.total?.(s)||0;}catch{return 0}}
  function dose(s){try{return M.dosageEngine?.session?.(s,M.state,{delivered:!!s.finish})||null;}catch{return null}}
  function minutes(s){try{return Math.round((M.contextEngineAV?.plannedTimeline?.(s)?.durationSeconds||0)/60)||null;}catch{return null}}
  function present(s){return(M.state?.attendance||[]).filter(a=>(a.session_id||a.sessionId)===s.id&&/present|here|late|attend/i.test(String(a.status||''))).length;}
  function written(s){return total(s)>0;}
  function mix(list){const acc={};let all=0;for(const s of list){const d=dose(s);if(!d)continue;for(const[k,v]of Object.entries(d.systems||{})){if(k==='Unclassified')continue;acc[k]=(acc[k]||0)+(Number(v.metres)||0);all+=Number(v.metres)||0;}}
    return SYS.map(k=>({k,m:acc[k]||0,pct:all?Math.round((acc[k]||0)*100/all):0})).filter(x=>x.m>0);}
  function strokes(list){const acc={};let all=0;for(const s of list){const d=dose(s);if(!d)continue;for(const[k,v]of Object.entries(d.strokes||{})){acc[k]=(acc[k]||0)+(Number(v.metres)||0);all+=Number(v.metres)||0;}}return Object.entries(acc).filter(([,m])=>m>0).sort((a,b)=>b[1]-a[1]).map(([k,m])=>({k,m,pct:all?Math.round(m*100/all):0}));}
  function bars(rows,label=x=>COACH[x.k]?`${COACH[x.k]}${COACH[x.k]!==x.k?` · ${x.k}`:''}`:x.k){return rows.length?`<div class="hp-bars">${rows.map(x=>`<div class="hp-bar"><span>${esc(label(x))}</span><i style="width:${Math.max(2,x.pct)}%"></i><b>${x.pct}% · ${num(x.m)}m</b></div>`).join('')}</div>`:'<p class="muted">No classified training yet.</p>';}
  function topSys(s){const d=dose(s);if(!d)return'';const t=Object.entries(d.systems||{}).filter(([k,v])=>k!=='Unclassified'&&v.metres>0).sort((a,b)=>b[1].metres-a[1].metres)[0];return t?(COACH[t[0]]||t[0]):'';}
  function squadFilter(list,sq){return sq?list.filter(s=>(s.identity?.squads||[]).some(q=>lc(q)===lc(sq))):list;}
  function sessionRow(s){return`<button class="hp-row" data-hp-open="${esc(s.id)}"><span><b>${esc(dayName(s.identity.date))} ${esc(s.identity.dayPart||'')}</b><small>${esc((s.identity.squads||[]).join(' + '))}</small></span><span><b>${num(total(s))}m</b><small>${esc(topSys(s)||'—')}${s.finish?' · finished':''}</small></span></button>`;}
  const isOwner=()=>(M.access?.role?.()||'owner')==='owner';
  // An assistant coach only sees their assigned squads (access-authority athlete.read_assigned).
  function athletes(){let list=(M.state?.athletes||[]).filter(a=>a&&a.active!==false);if(!isOwner()){try{const ok=new Set((M.access?.visibleAthletes?.()||[]).map(a=>a.id));list=list.filter(a=>ok.has(a.id));}catch{list=[];}}return list.sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));}
  function nameOf(id){return(M.state?.athletes||[]).find(a=>a.id===id)?.full_name||'Swimmer';}

  // ---------- reports ----------
  let rState={report:null,squad:'',athleteId:''};
  const REPORTS=[['session','This session'],['week','This week'],['season','Season so far'],['tests','Test sets'],['times','Times'],['swimmer','Per swimmer']];
  function reportSession(){const s=M.currentSession?.();if(!s)return'<p>No session open. Open one from Today or the Board.</p>';
    let plan='';try{const v=M.sessionMethodology?.evaluate?.(s,M.state)?.plan;const b=M.sessionMethodology?.brief?.(s);if(b&&b.source!=='none')plan=`<p><b>Brief:</b> ${esc(b.sessionFocus||b.system||'')}${v?.checked?` · ${v.matches?'<span class="good-text">✓ on brief</span>':'<span class="warn-text">⚠ off brief</span>'}`:''}</p>`;}catch{}
    const caps=(M.state.captures||[]).filter(c=>c.session_id===s.id).length,ts=(M.state.timedSets||[]).filter(x=>x.session_id===s.id).length,min=minutes(s);
    return`<h3>${esc(s.identity.date)} ${esc(s.identity.dayPart||'')} · ${esc((s.identity.squads||[]).join(' + '))}</h3>${plan}<div class="hp-kpis"><span><b>${num(total(s))}m</b>${s.finish?'delivered':'planned'}</span>${min?`<span><b>${min} min</b>planned time</span>`:''}<span><b>${present(s)}</b>here</span><span><b>${caps}</b>captures</span><span><b>${ts}</b>timed sets</span><span><b>${(s.changes||[]).length}</b>live edits</span></div><h4>Energy systems</h4>${bars(mix([s]))}<h4>Strokes</h4>${bars(strokes([s]),x=>x.k)}<div class="hub-actions"><button type="button" data-hp-detail>Full session detail (plan, makeup, dosage, evidence)</button></div>`;}
  function reportWeek(){const start=monday(nzToday()),end=addDay(start,6),list=squadFilter(sessions().filter(s=>s.identity.date>=start&&s.identity.date<=end&&written(s)),rState.squad).sort((a,b)=>(a.identity.date+a.identity.dayPart).localeCompare(b.identity.date+b.identity.dayPart));
    let focus='';try{const any=list[0]||{id:'wk',identity:{date:nzToday(),squads:rState.squad?[rState.squad]:['National']},blocks:[]};const ctx=M.coachLoopUI?.planContext?.(any);if(ctx?.weeklyFocus)focus=`<p><b>Week plan:</b> ${esc(ctx.weeklyFocus)}${ctx.technicalFocus?` · ${esc(ctx.technicalFocus)}`:''}</p>`;}catch{}
    const tot=list.reduce((a,s)=>a+total(s),0);
    return`<h3>Week of ${esc(dayName(start))}</h3>${focus}<div class="hp-kpis"><span><b>${list.length}</b>sessions</span><span><b>${num(tot)}m</b>total</span><span><b>${list.length?num(tot/list.length):0}m</b>per session</span></div><h4>Energy systems this week</h4>${bars(mix(list))}<h4>Strokes</h4>${bars(strokes(list),x=>x.k)}<h4>Sessions</h4>${list.map(sessionRow).join('')||'<p class="muted">No sessions written yet this week.</p>'}`;}
  function reportSeason(){let season=null;try{season=M.dataAdminUI?.activeSeason?.()||null;}catch{}const start=String(season?.start_date||season?.effective_from||addDay(nzToday(),-84)).slice(0,10),today=nzToday();
    const list=squadFilter(sessions().filter(s=>s.identity.date>=start&&s.identity.date<=today&&written(s)),rState.squad);const weeks=new Map();for(const s of list){const w=monday(s.identity.date);if(!weeks.has(w))weeks.set(w,[]);weeks.get(w).push(s);}
    const plans=M.state?.weeklyPlans||[];const phase=w=>{const p=plans.find(x=>String(x.week_start||'').slice(0,10)===w&&(!rState.squad||lc(x.squad)===lc(rState.squad)))||plans.find(x=>String(x.week_start||'').slice(0,10)===w);return text(p?.objective||p?.focus||p?.phase||'');};
    const tot=list.reduce((a,s)=>a+total(s),0);
    return`<h3>${esc(season?.name||'Last 12 weeks')}${season?` · since ${esc(dayName(start))}`:''}</h3><div class="hp-kpis"><span><b>${list.length}</b>sessions</span><span><b>${(tot/1000).toFixed(1)}km</b>total</span><span><b>${weeks.size}</b>weeks</span></div><h4>Energy systems so far</h4>${bars(mix(list))}<h4>Week by week</h4>${[...weeks.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([w,ss])=>`<div class="hp-row hp-static"><span><b>${esc(dayName(w))}</b><small>${esc(phase(w)||'')}</small></span><span><b>${num(ss.reduce((a,s)=>a+total(s),0))}m</b><small>${ss.length} session${ss.length===1?'':'s'} · ${esc(mix(ss)[0]?((COACH[mix(ss).sort((a,b)=>b.m-a.m)[0].k])||''):'')}</small></span></div>`).join('')||'<p class="muted">No sessions written in this season yet.</p>'}`;}
  function reportTests(){const types=new Map((M.state.trainingTestTypes||[]).map(t=>[t.id,t]));const rows=(M.state.trainingTestResults||[]).filter(r=>Number(r.result_seconds)>0);
    const isT400=r=>{const t=types.get(r.test_type_id);return/t400|timed 400/i.test(`${t?.test_key||''} ${t?.name||''} ${r.source_label||''}`);};
    const t4=rows.filter(isT400),by=new Map();for(const r of t4){const k=`${r.athlete_id}|${r.stroke||'Freestyle'}`;if(!by.has(k))by.set(k,[]);by.get(k).push(r);}
    const t4rows=[...by.entries()].map(([k,rs])=>{rs.sort((a,b)=>String(b.result_date).localeCompare(String(a.result_date)));const latest=rs[0],prev=rs[1],best=rs.reduce((a,b)=>Number(b.result_seconds)<Number(a.result_seconds)?b:a);return{ath:latest.athlete_id,stroke:latest.stroke||'Freestyle',latest,prev,best};}).sort((a,b)=>nameOf(a.ath).localeCompare(nameOf(b.ath)));
    const other=rows.filter(r=>!isT400(r)).sort((a,b)=>String(b.result_date).localeCompare(String(a.result_date))).slice(0,40);
    return`<h3>T400s · these set training targets</h3>${t4rows.length?t4rows.map(x=>`<button class="hp-row" data-hp-ath="${esc(x.ath)}"><span><b>${esc(nameOf(x.ath))}</b><small>${esc(x.stroke)} · ${esc(x.latest.result_date||'')}</small></span><span><b>${esc(clock(x.latest.result_seconds))}</b><small>${x.prev?`${Number(x.latest.result_seconds)<Number(x.prev.result_seconds)?'<span class="good-text">':'<span>'}${(Number(x.latest.result_seconds)-Number(x.prev.result_seconds)).toFixed(1)}s vs last</span>`:'first'}${x.best!==x.latest?` · best ${esc(clock(x.best.result_seconds))}`:''}</small></span></button>`).join(''):'<p class="muted">No T400s recorded yet. Add them in Input data.</p>'}
      <h3>Other test sets</h3>${other.length?other.map(r=>`<div class="hp-row hp-static"><span><b>${esc(nameOf(r.athlete_id))}</b><small>${esc(types.get(r.test_type_id)?.name||r.source_label||'Test')} · ${esc(r.result_date||'')}</small></span><span><b>${esc(clock(r.result_seconds))}</b><small>${esc([r.distance,r.stroke].filter(Boolean).join(' '))}</small></span></div>`).join(''):'<p class="muted">None recorded yet.</p>'}`;}
  function reportTimes(){const cut=addDay(nzToday(),-28),byS=new Map(Object.values(M.state.canonicalSessions||{}).map(s=>[s.id,s]));const rows=(M.state.timedSets||[]).map(r=>({...r,date:byS.get(r.session_id)?.identity?.date||String(r.created_at||'').slice(0,10)})).filter(r=>r.date>=cut).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60);
    return`<h3>Timed sets · last 4 weeks</h3>${rows.length?rows.map(r=>`<button class="hp-row" data-hp-ath="${esc(r.athlete_id)}"><span><b>${esc(nameOf(r.athlete_id))}</b><small>${esc(r.date)} · ${esc(r.set_label||`${r.distance} ${r.stroke||''}`)}</small></span><span><b>${r.average!=null?`avg ${esc(clock(r.average))}`:''}</b><small>${r.best!=null?`best ${esc(clock(r.best))}`:''}${(r.times||[]).length?` · ${(r.times||[]).length} swims`:''}</small></span></button>`).join(''):'<p class="muted">No timed sets in the last 4 weeks. Time sets live in Times.</p>'}`;}
  function reportSwimmer(){const list=athletes();const id=rState.athleteId||list[0]?.id||'';if(!id)return'<p class="muted">No swimmers on the roster.</p>';const a=list.find(x=>x.id===id)||{full_name:nameOf(id)};
    const cut=addDay(nzToday(),-28),att=(M.state.attendance||[]).filter(r=>(r.athlete_id||r.athleteId)===id&&/present|here|late|attend/i.test(String(r.status||''))),byS=new Map(Object.values(M.state.canonicalSessions||{}).map(s=>[s.id,s])),recent=att.map(r=>byS.get(r.session_id||r.sessionId)).filter(s=>s&&s.identity.date>=cut);
    const t4=(M.state.trainingTestResults||[]).filter(r=>r.athlete_id===id).sort((x,y)=>String(y.result_date).localeCompare(String(x.result_date)))[0];
    let pbs=[];try{pbs=(E.Evidence?.pbRows?.(a,M.state)||[]).slice().sort((x,y)=>String(y.result_date||y.date||'').localeCompare(String(x.result_date||x.date||''))).slice(0,8);}catch{}
    const caps=(M.state.captures||[]).filter(c=>c.athlete_id===id||(c.athlete_ids||[]).includes?.(id)).length;
    return`<label class="hp-pick">Swimmer<select data-hp-swimmer>${list.map(x=>`<option value="${esc(x.id)}"${x.id===id?' selected':''}>${esc(x.full_name)}${x.squad?` · ${esc(x.squad)}`:''}</option>`).join('')}</select></label>
      <div class="hp-kpis"><span><b>${recent.length}</b>sessions · 4 wks</span><span><b>${num(recent.reduce((t,s)=>t+total(s),0))}m</b>squad metres · 4 wks</span><span><b>${t4?esc(clock(t4.result_seconds)):'—'}</b>latest T400${t4?` · ${esc(t4.result_date||'')}`:''}</span><span><b>${caps}</b>captures</span></div>
      <h4>Energy systems · last 4 weeks</h4>${bars(mix(recent))}<h4>Recent results</h4>${pbs.length?pbs.map(r=>`<div class="hp-row hp-static"><span><b>${esc([E.Evidence?.distance?.(r)??r.distance,E.Evidence?.rowStroke?.(r)??r.stroke].filter(Boolean).join(' '))}</b><small>${esc(r.meet_name||r.meet||'')} · ${esc(r.result_date||r.date||'')}</small></span><span><b>${esc(clock(E.Evidence?.seconds?.(r)??r.result_seconds))}</b><small>${esc(String(E.Evidence?.course?.(r)??r.course??r.pool_course??''))}</small></span></div>`).join(''):'<p class="muted">No results loaded for this swimmer.</p>'}
      ${isOwner()?`<div class="hub-actions"><button type="button" data-hp-profile="${esc(id)}">Full swimmer profile</button></div>`:''}`;}
  const RENDER={session:reportSession,week:reportWeek,season:reportSeason,tests:reportTests,times:reportTimes,swimmer:reportSwimmer};
  function squadsList(){const set=new Set();for(const s of sessions())for(const q of s.identity?.squads||[])set.add(text(q));return[...set].sort();}
  function renderReports(host){const r=rState.report;const sq=['week','season'].includes(r);
    host.innerHTML=`<section class="page-card"><div class="hp-grid" data-hp-reports>${REPORTS.map(([k,l])=>`<button type="button" class="hp-btn${r===k?' on':''}" data-hp-report="${k}">${esc(l)}</button>`).join('')}</div>${sq?`<label class="hp-pick">Squad<select data-hp-squad><option value="">All squads</option>${squadsList().map(q=>`<option${q===rState.squad?' selected':''}>${esc(q)}</option>`).join('')}</select></label>`:''}</section>${r?`<section class="page-card hp-out" data-hp-out="${r}">${(()=>{try{return RENDER[r]();}catch(e){return`<p class="warn-text">This report could not be built: ${esc(e.message)}</p>`;}})()}</section>`:'<p class="muted hp-pickone">Pick a report.</p>'}${isOwner()?'<section class="page-card"><div class="hub-actions"><button type="button" data-hp-engine>Full reports (squad / swimmer / pathway / evidence)</button></div></section>':''}`;
    host.querySelectorAll('[data-hp-report]').forEach(b=>b.onclick=()=>{rState.report=b.dataset.hpReport;renderReports(host);});
    host.querySelector('[data-hp-squad]')?.addEventListener('change',e=>{rState.squad=e.target.value;renderReports(host);});
    host.querySelector('[data-hp-swimmer]')?.addEventListener('change',e=>{rState.athleteId=e.target.value;renderReports(host);});
    host.querySelector('[data-hp-detail]')?.addEventListener('click',()=>M.coachLoopUI?.openHubPanel?.('session'));
    host.querySelectorAll('[data-hp-open]').forEach(b=>b.onclick=()=>{if(M.selectSession?.(b.dataset.hpOpen)!==null)M.nav?.show?.('board',{restoreScroll:false});});
    host.querySelectorAll('[data-hp-ath]').forEach(b=>b.onclick=()=>{rState.report='swimmer';rState.athleteId=b.dataset.hpAth;renderReports(host);});
    host.querySelector('[data-hp-profile]')?.addEventListener('click',e=>{M.state.settings.selectedAthleteId=e.currentTarget.dataset.hpProfile;M.storageEngine?.saveUi?.(M.state);M.nav?.show?.('athletes',{restoreScroll:false});});
    if(host.querySelector('[data-hp-engine]'))host.querySelector('[data-hp-engine]').onclick=()=>M.nav?.show?.('reports',{restoreScroll:false});}
  P.renderReports=(host,opts={})=>{if(opts.report)rState.report=opts.report;renderReports(host);};
  P.REPORTS=REPORTS;

  // ---------- swimmers ----------
  let access=null,accessErr='',accessAt=0;
  async function loadAccess(){try{const rows=await M.swimmerInviteBN?.rpc?.('msos_owner_swimmer_access',{});access=Array.isArray(rows)?rows:[];accessErr='';}catch(e){accessErr=e?.message||String(e);}accessAt=Date.now();}
  function ago(ts){if(!ts)return'';const d=(Date.now()-Date.parse(ts))/86400000;return d<1?'today':d<2?'yesterday':d<14?`${Math.floor(d)} days ago`:new Date(ts).toLocaleDateString('en-NZ',{day:'numeric',month:'short'});}
  function renderSwimmers(host){const owner=(M.access?.role?.()||'owner')==='owner',list=athletes(),by=new Map((access||[]).map(r=>[r.athlete_id,r]));
    const withApp=list.filter(a=>{const r=by.get(a.id);return r&&(r.devices>0||r.has_account);});
    const row=a=>{const r=by.get(a.id)||{};const how=[r.has_account?'account':'',r.devices?`${r.devices} QR device${r.devices===1?'':'s'}`:''].filter(Boolean).join(' + ');
      return`<div class="hp-row hp-static" data-hp-swim="${esc(a.id)}"><span><b>${esc(a.full_name)}</b><small>${esc(a.squad||'')}${how?` · ${esc(how)}`:''}${r.last_seen_at?` · seen ${esc(ago(r.last_seen_at))}`:''}${r.last_published_at?` · updated ${esc(ago(r.last_published_at))}`:''}${r.open_invites?` · ${r.open_invites} invite open`:''}</small></span><span class="hp-acts">${owner?`<button type="button" data-hp-profile="${esc(a.id)}">Profile</button>`:''}${owner&&r.devices?`<button type="button" class="danger" data-hp-revoke="${esc(a.id)}">Revoke QR</button>`:''}</span></div>`;};
    host.innerHTML=`${owner?`<section class="page-card"><div class="hp-grid"><button type="button" class="hp-btn" data-hp-go="athletes">Swimmer profiles</button>`:''}${owner?'<button type="button" class="hp-btn" data-hp-give>Give a swimmer the app</button><button type="button" class="hp-btn" data-hp-join>Join requests</button></div></section>':''}
      ${owner?`<section class="page-card"><h3>Swimmers with the app</h3>${access==null?`<p class="muted" data-hp-access-status>${accessErr?esc(accessErr):'Checking…'}</p>`:accessErr?`<p class="warn-text">${esc(accessErr)}</p>`:withApp.length?withApp.map(row).join(''):'<p class="muted">No swimmer has the app linked yet.</p>'}${access!=null?'<div class="hub-actions"><button type="button" data-hp-refresh>Refresh</button></div>':''}</section>`:''}
      <section class="page-card"><h3>${owner?'Everyone else':'Your squads'}</h3>${list.filter(a=>!withApp.includes(a)).map(row).join('')||'<p class="muted">—</p>'}</section>`;
    host.querySelectorAll('[data-hp-profile]').forEach(b=>b.onclick=()=>{M.state.settings.selectedAthleteId=b.dataset.hpProfile;M.storageEngine?.saveUi?.(M.state);M.nav?.show?.('athletes',{restoreScroll:false});});
    host.querySelector('[data-hp-go]')?.addEventListener('click',()=>M.nav?.show?.('athletes',{restoreScroll:false}));
    host.querySelector('[data-hp-give]')?.addEventListener('click',()=>{M.nav?.show?.('athletes',{restoreScroll:false});M.toast?.('Pick the swimmer, then tap Give swimmer access');});
    host.querySelector('[data-hp-join]')?.addEventListener('click',()=>{M.nav?.show?.('athletes',{restoreScroll:false});setTimeout(()=>document.querySelector('[data-bn-link-requests]')?.click(),300);});
    host.querySelector('[data-hp-refresh]')?.addEventListener('click',async()=>{access=null;renderSwimmers(host);await loadAccess();if(host.isConnected)renderSwimmers(host);});
    host.querySelectorAll('[data-hp-revoke]').forEach(b=>b.onclick=async()=>{const id=b.dataset.hpRevoke;if(!confirm(`Stop ${nameOf(id)}'s linked QR devices? They'll need a new QR to get back in.`))return;try{const n=await M.swimmerInviteBN.rpc('msos_revoke_swimmer_devices',{p_athlete_id:id});M.toast?.(`${Number(n)||0} device link${Number(n)===1?'':'s'} stopped`);await loadAccess();if(host.isConnected)renderSwimmers(host);}catch(e){M.toast?.(e.message||'Could not revoke');}});
    if(owner&&(access==null&&!accessErr||Date.now()-accessAt>120000)&&!renderSwimmers.loading){renderSwimmers.loading=true;loadAccess().then(()=>{renderSwimmers.loading=false;if(host.isConnected)renderSwimmers(host);});}}
  P.renderSwimmers=renderSwimmers;P.loadAccess=loadAccess;
})(globalThis);
