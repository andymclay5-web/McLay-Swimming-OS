'use strict';
(function(g){
  const M=g.MSOS4,P=M?.performanceEngine,E=g.MSOSEngines?.Evidence;
  if(!M?.state||!M?.ui||!P)return;
  const U=M.util||{},esc=v=>U.escape?U.escape(String(v??'')):String(v??''),text=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim(),clock=v=>U.clock?U.clock(Number(v)):String(v??'—');
  const X=M.swimmerInstantOpenCN={build:'v4-swimmer-instant-open-20260824cn'};
  const oldRender=M.ui.renderAthletes?.bind(M.ui);
  const oldPerfRender=M.performanceUI?.render?.bind(M.performanceUI);
  const short=s=>String(s||'').replace('Freestyle','Fr').replace('Backstroke','Bk').replace('Breaststroke','Br').replace('Butterfly','Fly');
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const visibleAthletes=()=>((M.access?.visibleAthletes?.()||M.state.athletes||[]).filter(a=>a.active!==false)).sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));
  const course=()=>text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
  const keyOf=e=>`${Number(e?.distance)||0}|${text(E?.stroke?.(e?.stroke)||e?.stroke)}`;

  function ranked(ath,c){
    const seen=new Map();
    for(const r of P.rankedEvents?.(ath,M.state,c)||[]){const k=keyOf(r),old=seen.get(k);if(!old||Number(r.points||-1)>Number(old.points||-1)||(Number(r.points||-1)===Number(old.points||-1)&&Number(r.seconds||Infinity)<Number(old.seconds||Infinity)))seen.set(k,r);}
    return [...seen.values()].sort((a,b)=>Number(b.points||-1)-Number(a.points||-1)||Number(a.seconds||Infinity)-Number(b.seconds||Infinity));
  }
  function raceEvidence(ath,e){
    const rows=P.rows?.(ath,M.state,e.course||course())||[],stroke=text(E?.stroke?.(e.stroke)||e.stroke),cand=rows.filter(r=>Number(r.distance)===Number(e.distance)&&text(E?.stroke?.(r.stroke)||r.stroke)===stroke).sort((a,b)=>Math.abs(Number(a.seconds)-Number(e.seconds))-Math.abs(Number(b.seconds)-Number(e.seconds)))[0]?.raw||null;
    return cand;
  }
  function splitPairs(raw){
    if(!raw||typeof raw!=='object')return[];const out=[],push=(label,val)=>{const n=Number(val);if(Number.isFinite(n)&&n>0)out.push({label:text(label),seconds:n});};const arr=raw.splits||raw.split_times||raw.splitTimes||raw.laps||raw.intermediates;
    if(Array.isArray(arr))arr.forEach((x,i)=>{if(typeof x==='number')push(`${(i+1)*50}m`,x);else if(x&&typeof x==='object')push(x.distance?`${x.distance}m`:(x.label||`${(i+1)*50}m`),x.seconds??x.time_seconds??x.time);});else if(arr&&typeof arr==='object')Object.entries(arr).forEach(([k,v])=>push(k,v));
    return out;
  }
  function legacyEvent(ath,e,c){
    try{const p=M.pathway?.profile?.(ath,c),k=`${Number(e.distance)}|${text(E?.stroke?.(e.stroke)||e.stroke)}`;return(p?.events||[]).find(x=>x?.pb&&`${Number(x.pb.distance)}|${text(E?.stroke?.(x.pb.stroke)||x.pb.stroke)}`===k)||null;}catch{return null;}
  }
  function detailsHtml(ath,e,c){
    const legacy=legacyEvent(ath,e,c)||{pb:{course:c,distance:e.distance,stroke:e.stroke,result_seconds:e.seconds},qualifying:[],deeper:[]},lad=P.pathwayLadderForEvent?.(ath,{...legacy,distance:e.distance,stroke:e.stroke,pbSeconds:e.seconds,course:e.course||c},{course:c})||{tracks:{SCM:[],LCM:[]}},main=c==='LCM'?lad.tracks.LCM||[]:lad.tracks.SCM||[],other=c==='LCM'?lad.tracks.SCM||[]:lad.tracks.LCM||[],useful=[...main.filter(s=>s.achieved).slice(-1),...main.filter(s=>!s.achieved).slice(0,4)],raw=raceEvidence(ath,e),splits=splitPairs(raw),meta=[raw?.result_date||raw?.date,raw?.meet_name||raw?.meet||raw?.competition].filter(Boolean).join(' · ');
    const step=s=>`<div class="cn-step"><b>${esc(s.label||'Benchmark')}</b><span>${clock(s.seconds)}</span><em>${s.achieved?'✓ achieved':Number.isFinite(Number(s.gapSeconds))?`${Number(s.gapSeconds).toFixed(2)}s away`:''}</em></div>`;
    return `<div class="cn-detail">${meta?`<p class="cn-meta">${esc(meta)}</p>`:''}${splits.length?`<div class="cn-splits">${splits.map(s=>`<span><b>${esc(s.label)}</b> ${clock(s.seconds)}</span>`).join('')}</div>`:'<p class="cn-meta">No race splits loaded for this PB.</p>'}<div class="cn-steps">${useful.length?useful.map(step).join(''):'<span class="muted">No pathway marks loaded.</span>'}</div>${other.some(s=>!s.achieved)?`<details class="cn-outlook"><summary>${c==='SCM'?'LCM':'SCM'} outlook</summary>${other.filter(s=>!s.achieved).slice(0,3).map(step).join('')}</details>`:''}</div>`;
  }
  function renderFast(){
    const root=document.querySelector('#athletesView'),ath=selected(),list=visibleAthletes(),c=course();if(!root||!ath)return false;
    if(M.swimmerCompactCM?.observer){try{M.swimmerCompactCM.observer.disconnect();M.swimmerCompactCM.observer=null;}catch{}}
    const rows=ranked(ath,c),role=M.access?.role?.()||'owner';
    root.dataset.cnFast='1';
    root.innerHTML=`<section class="page-card perf-head"><div class="eyebrow">SWIMMER PERFORMANCE</div><h1>${esc(ath.full_name)}</h1><div class="path-controls">${role==='swimmer'?'':`<select id="cnAthlete">${list.map(a=>`<option value="${esc(a.id)}" ${a.id===ath.id?'selected':''}>${esc(a.full_name)} · ${esc(a.squad||'')}</option>`).join('')}</select>`}<div class="course-toggle"><button data-cn-course="SCM" class="${c==='SCM'?'active':''}">SCM</button><button data-cn-course="LCM" class="${c==='LCM'?'active':''}">LCM</button></div></div><div class="hub-actions"><button id="cnReports">Reports</button>${role==='swimmer'?'':'<button id="cnRefresh">Refresh PB / results</button><button data-msos-data>Data & References</button>'}</div></section><div class="msos-ath-tabs"><button class="active" data-cn-tab="performance">Performance + Pathway</button><button data-cn-tab="training">Training</button><button data-cn-tab="tests">Tests</button><button data-cn-tab="meet">Meet</button></div><section class="page-card cn-performance" data-cn-panel="performance"><div class="eyebrow">${esc(c)} · PERFORMANCE ORDER</div><h2>${rows.length} events</h2><p class="muted">Tap an event for race detail, splits and pathway.</p><div class="cn-events">${rows.map((e,i)=>`<details class="cn-event" data-cn-event="${esc(keyOf(e))}"><summary><span>#${i+1}</span><b>${esc(`${e.distance} ${short(e.stroke)}`)}</b><strong>${clock(e.seconds)}</strong><em>${Number.isFinite(Number(e.points))?`${Math.floor(Number(e.points))} ${esc(e.pointSystem||P.scoreSystem?.(ath)||'WA')}`:'—'}</em></summary><div class="cn-detail-host"><span class="muted">Tap to load detail.</span></div></details>`).join('')}</div></section><section class="page-card" data-cn-panel="lazy" hidden><h2>Loading…</h2></section>`;
    root.querySelector('#cnAthlete')?.addEventListener('change',e=>{M.state.settings.selectedAthleteId=e.target.value;M.storageEngine?.saveUi?.(M.state);renderFast();});
    root.querySelectorAll('[data-cn-course]').forEach(b=>b.onclick=()=>{M.state.settings.pathwayCourse=b.dataset.cnCourse;M.storageEngine?.saveUi?.(M.state);P.invalidate?.(M.state);renderFast();});
    root.querySelector('#cnReports')?.addEventListener('click',()=>M.navigationEngine?.go?.('reports',{restore:false}));
    root.querySelector('#cnRefresh')?.addEventListener('click',()=>{M.swimmerPerformanceBM?.completeEvidence?.(ath).then(()=>renderFast()).catch(()=>{});});
    root.querySelectorAll('.cn-event').forEach(d=>d.addEventListener('toggle',()=>{if(!d.open||d.dataset.loaded)return;d.dataset.loaded='1';const e=rows.find(x=>keyOf(x)===d.dataset.cnEvent),h=d.querySelector('.cn-detail-host');if(e&&h)requestAnimationFrame(()=>{h.innerHTML=detailsHtml(ath,e,c);});}));
    root.querySelectorAll('[data-cn-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.cnTab==='performance')return;const lazy=root.querySelector('[data-cn-panel="lazy"]');root.querySelector('[data-cn-panel="performance"]').hidden=true;lazy.hidden=false;lazy.innerHTML=`<h2>Loading ${esc(b.textContent)}…</h2><p class="muted">Performance stays instant; this section loads only when you ask for it.</p>`;requestAnimationFrame(()=>{if(oldRender){oldRender();setTimeout(()=>{const btn=[...document.querySelectorAll('#athletesView .msos-ath-tabs button')].find(x=>text(x.textContent).toLowerCase()===text(b.textContent).toLowerCase());btn?.click?.();},0);}});});
    requestAnimationFrame(()=>M.swimmerInviteBN?.installButton?.());
    X.lastOpenMs=performance.now()-X._start;
    return true;
  }
  function install(){
    if(!oldRender||X.installed)return;X.installed=true;
    const fast=(...args)=>{X._start=performance.now();return renderFast()||oldRender(...args);};
    M.ui.renderAthletes=fast;if(M.performanceUI)M.performanceUI.render=fast;
    if(M.navigationEngine?.go&&!M.navigationEngine._cnWrapped){const go=M.navigationEngine.go.bind(M.navigationEngine);M.navigationEngine._cnWrapped=true;M.navigationEngine.go=(view,opts={})=>{if(view==='athletes'){M.state.settings.view='athletes';M.nav?.activateView?.('athletes');M.storageEngine?.saveUi?.(M.state);try{if(opts.push!==false)history.pushState({msos:true,msosView:'athletes',sessionId:M.state.settings.selectedSessionId||''},'','#athletes');}catch{}X._start=performance.now();renderFast();requestAnimationFrame(()=>window.scrollTo(0,0));setTimeout(()=>M.swimmerPerformanceBM?.completeEvidence?.(selected()).catch?.(()=>{}),0);return;}return go(view,opts);};M.nav.show=M.navigationEngine.go;}
  }
  if(typeof document!=='undefined'){const style=document.createElement('style');style.textContent=`.cn-events{display:grid;gap:6px}.cn-event{border:1px solid #d8e4ea;border-radius:12px;overflow:hidden;background:#fff}.cn-event>summary{display:grid;grid-template-columns:30px minmax(110px,1fr) 76px 70px;gap:6px;align-items:center;padding:10px;list-style:none;cursor:pointer}.cn-event>summary::-webkit-details-marker{display:none}.cn-event summary span{font-size:12px;color:#667d89}.cn-event summary b{color:#123f59}.cn-event summary strong{text-align:right}.cn-event summary em{font-style:normal;text-align:right;font-size:12px;color:#49616f}.cn-detail-host{border-top:1px solid #e6eef2;padding:10px}.cn-detail{display:grid;gap:8px}.cn-meta{font-size:12px;color:#607582;margin:0}.cn-splits{display:flex;flex-wrap:wrap;gap:6px}.cn-splits span{font-size:12px;background:#f3f7f9;padding:5px 7px;border-radius:8px}.cn-steps{display:grid;gap:4px}.cn-step{display:grid;grid-template-columns:minmax(110px,1fr) auto auto;gap:7px;font-size:12px;border-top:1px solid #edf2f4;padding:5px 0}.cn-step em{font-style:normal}.cn-outlook summary{font-weight:800;padding:6px 0}@media(max-width:460px){.cn-event>summary{grid-template-columns:26px minmax(95px,1fr) 68px 58px;padding:9px 8px}.cn-event summary b,.cn-event summary strong{font-size:14px}.cn-event summary em{font-size:11px}.cn-step{grid-template-columns:1fr auto}.cn-step em{grid-column:2}}`;document.head.appendChild(style);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
  X.renderFast=renderFast;X.splitPairs=splitPairs;X.oldRender=oldRender;
})(globalThis);
