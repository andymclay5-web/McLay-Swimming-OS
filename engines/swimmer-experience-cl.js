'use strict';
(function(g){
  const M=g.MSOS4,P=M?.performanceEngine;
  if(!M?.state||!P)return;
  const U=M.util||{},text=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim(),esc=v=>U.escape?U.escape(String(v??'')):String(v??''),clock=v=>U.clock?U.clock(Number(v)):String(v??'—');
  const X=M.swimmerExperienceCL={build:'v4-swimmer-context-unified-20260824cl'};
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const course=()=>text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
  const eventKey=e=>`${text(e?.course).toUpperCase()}|${Number(e?.distance)||0}|${text(e?.stroke)}`;

  // One PB event means one event. Duplicate source rows must never duplicate the swimmer ranking.
  if(!P._clDeduped){
    P._clDeduped=true;
    const rawRank=P.rankedEvents?.bind(P),rawRows=P.rows?.bind(P);
    if(rawRank)P.rankedEvents=(ath,state=M.state,c='')=>{
      const best=new Map();
      for(const r of rawRank(ath,state,c)||[]){const k=eventKey(r),old=best.get(k);if(!old||Number(r.points||-1)>Number(old.points||-1)||(Number(r.points||-1)===Number(old.points||-1)&&Number(r.seconds||Infinity)<Number(old.seconds||Infinity)))best.set(k,r);}
      return[...best.values()].sort((a,b)=>Number(b.points||-1)-Number(a.points||-1)||Number(a.seconds||Infinity)-Number(b.seconds||Infinity));
    };
    if(rawRows)P.rows=(ath,state=M.state,c='')=>{
      const best=new Map();
      for(const r of rawRows(ath,state,c)||[]){const k=eventKey(r),old=best.get(k);if(!old||Number(r.seconds||Infinity)<Number(old.seconds||Infinity))best.set(k,r);}
      return[...best.values()];
    };
  }

  const kindLabel=k=>({qualifying:'QT',finalist:'Final',medal:'Medal',winner:'Win',record:'Record',benchmark:'Benchmark'})[k]||'Step';
  function stepHtml(s){const gap=Number(s.gapSeconds),age=Number(s.ageAtTarget),meta=[];if(s.targetSeason)meta.push(String(s.targetSeason));if(Number.isFinite(age))meta.push(`age ${age}`);if(s.planningProxy)meta.push(`using ${s.sourceSeason||'latest'} standard`);return`<div class="msos-path-step ${s.achieved?'achieved':'upcoming'}"><small>${esc(kindLabel(s.kind))}</small><b>${esc(s.label)}${s.targetSeason?` ${esc(s.targetSeason)}`:''}</b><span>${clock(s.seconds)}${meta.length?` · ${esc(meta.join(' · '))}`:''}</span><em>${s.achieved?'✓ achieved':Number.isFinite(gap)?`${gap.toFixed(2)}s away`:''}</em></div>`;}
  function trackHtml(title,steps){const useful=(steps||[]).filter(s=>['qualifying','finalist','medal','winner','record','benchmark'].includes(s.kind)),ach=useful.filter(s=>s.achieved),future=useful.filter(s=>!s.achieved),window=[...ach.slice(-2),...future.slice(0,6)];return`<section class="page-card msos-path-track"><div class="eyebrow">${esc(title)}</div>${window.length?`<div class="msos-path-ladder">${window.map(stepHtml).join('')}</div>`:'<p class="muted">No verified milestones loaded for this course yet.</p>'}</section>`;}
  function performancePathwayHtml(ath){
    if(typeof P.pathwaysForAthlete!=='function')return'';
    const c=course(),model=P.pathwaysForAthlete(ath,{course:c});if(!model?.events?.length)return'';
    const key=M.state.settings.pathwayEventKey||`${model.events[0].distance}|${model.events[0].stroke}`,chosen=model.events.find(e=>`${e.distance}|${e.stroke}`===key)||model.events[0],main=c==='LCM'?chosen.ladder.tracks.LCM:chosen.ladder.tracks.SCM,other=c==='LCM'?chosen.ladder.tracks.SCM:chosen.ladder.tracks.LCM,next=main.find(s=>!s.achieved)||null;
    return`<div data-cl-performance-pathway><section class="page-card msos-pathway-head"><div class="eyebrow">PERFORMANCE + PATHWAY · ${esc(c)}</div><h2>${esc(`${chosen.distance} ${chosen.stroke}`)} · PB ${clock(chosen.seconds)}</h2><p class="muted">Qualification is a step. The pathway continues through final, medal, win and higher benchmarks.</p><div class="msos-event-tabs">${model.events.map(e=>`<button data-cl-event="${esc(`${e.distance}|${e.stroke}`)}" class="${e===chosen?'active':''}">${esc(`${e.distance} ${e.stroke}`)}</button>`).join('')}</div>${next?`<div class="context-note"><b>Next meaningful step:</b> ${esc(next.label)}${next.targetSeason?` ${esc(next.targetSeason)}`:''} · ${clock(next.seconds)} · ${Number(next.gapSeconds).toFixed(2)}s away</div>`:''}</section>${trackHtml(`${c} pathway`,main)}${trackHtml(`${c==='SCM'?'LCM':'SCM'} outlook`,other)}</div>`;
  }
  function testsHtml(ath){const anchors=Object.values(P.t400s?.(ath,M.state)||{}),timed=P.timed?.(ath,M.state,20)||[];return`<div data-msos-ath-panel="tests" class="msos-ath-panel" hidden><section class="page-card"><div class="eyebrow">TESTS · ${esc(ath.full_name)}</div><h2>Individual test history</h2><p class="muted">This stays on ${esc(ath.full_name)}. Group timing is separate.</p>${anchors.length?`<h3>T400</h3><div class="loop-capture-list">${anchors.map(x=>`<article><b>${esc(x.stroke)} T400</b><span>${clock(x.seconds)} · ${esc(x.row?.pool_course||x.row?.course||'SCM')}</span></article>`).join('')}</div>`:'<p class="muted">No T400 anchors loaded.</p>'}${timed.length?`<h3>Timed sets</h3><div class="loop-capture-list">${timed.map(x=>`<article><b>${esc(x.set_label||`${x.distance||''} ${x.stroke||''}`)}</b><span>${Number.isFinite(Number(x.best))?`Best ${clock(x.best)}`:'Saved'}${x.average?` · Avg ${clock(x.average)}`:''}</span></article>`).join('')}</div>`:''}<button data-cl-group-timing>Open group timing</button></section></div>`;}
  function closestCurrentStep(ath){if(typeof P.pathwaysForAthlete!=='function')return null;const c=course(),model=P.pathwaysForAthlete(ath,{course:c}),rows=[];for(const e of model?.events||[]){const steps=c==='LCM'?e.ladder.tracks.LCM:e.ladder.tracks.SCM,next=steps.find(s=>!s.achieved);if(next)rows.push({event:e,step:next});}return rows.sort((a,b)=>Number(a.step.gapPercentage||Infinity)-Number(b.step.gapPercentage||Infinity)||Number(b.event.points||0)-Number(a.event.points||0))[0]||null;}
  function patchSnapshot(root,ath){const hit=closestCurrentStep(ath);if(!hit)return;const nodes=[...root.querySelectorAll('span,small,div')].filter(n=>n.children.length===0&&text(n.textContent)==='Next milestone');for(const n of nodes){const box=n.parentElement;if(!box)continue;const b=box.querySelector('b'),s=box.querySelector('small');if(b)b.textContent=`${hit.event.distance} ${hit.event.stroke}`;if(s)s.textContent=`${hit.step.label}${hit.step.targetSeason?` ${hit.step.targetSeason}`:''} · ${Number(hit.step.gapSeconds).toFixed(2)}s`;}}
  function patchTraining(root,ath){const panel=root.querySelector('[data-msos-ath-panel="training"]');if(!panel||typeof P.pathwaysForAthlete!=='function')return;const heading=[...panel.querySelectorAll('h2,h3')].find(h=>/performance and the work underneath it/i.test(text(h.textContent)));if(!heading)return;const card=heading.closest('.page-card,section');if(!card||card.dataset.clTrainingTargets)return;const c=course(),model=P.pathwaysForAthlete(ath,{course:c}),rows=(model?.events||[]).slice(0,5);card.dataset.clTrainingTargets='1';card.innerHTML=`<div class="eyebrow">PERFORMANCE ↔ TRAINING</div><h2>Performance and the work underneath it</h2>${rows.map(e=>{const steps=c==='LCM'?e.ladder.tracks.LCM:e.ladder.tracks.SCM,next=steps.find(s=>!s.achieved);return`<article class="perf-evidence"><b>#${e.rank||'—'} · ${esc(`${e.distance} ${e.stroke}`)} · ${Math.floor(Number(e.points)||0)} ${esc(e.pointSystem||'WA')}</b><span>PB ${clock(e.seconds)}${next?` · Next ${esc(next.label)}${next.targetSeason?` ${esc(next.targetSeason)}`:''} ${clock(next.seconds)} · ${Number(next.gapSeconds).toFixed(2)}s`:''}</span></article>`}).join('')}<p class="muted">Training exposure supports the coaching picture; qualification is one step in the pathway, not the end goal.</p>`;}
  function installTabs(root,ath){
    const perf=root.querySelector('[data-msos-ath-panel="performance"]'),path=root.querySelector('[data-msos-ath-panel="pathway"]');if(!perf)return;
    if(path)path.hidden=true;
    const navButtons=[...root.querySelectorAll('button')].filter(b=>['Today','Performance','Training','Pathway','Meet'].includes(text(b.textContent)));
    const pathBtn=navButtons.find(b=>text(b.textContent)==='Pathway');if(pathBtn)pathBtn.hidden=true;
    let tests=root.querySelector('[data-msos-ath-panel="tests"]');if(!tests){perf.insertAdjacentHTML('afterend',testsHtml(ath));tests=root.querySelector('[data-msos-ath-panel="tests"]');}
    let testBtn=[...root.querySelectorAll('button')].find(b=>text(b.textContent)==='Tests'&&b.dataset.clTests==='1');if(!testBtn){const trainBtn=navButtons.find(b=>text(b.textContent)==='Training');if(trainBtn){testBtn=document.createElement('button');testBtn.textContent='Tests';testBtn.dataset.clTests='1';trainBtn.insertAdjacentElement('afterend',testBtn);}}
    if(testBtn&&!testBtn.dataset.clBound){testBtn.dataset.clBound='1';testBtn.onclick=()=>{root.querySelectorAll('[data-msos-ath-panel]').forEach(p=>p.hidden=true);tests.hidden=false;root.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===testBtn));M.state.settings.loopAthleteTab='tests';};}
    tests?.querySelector('[data-cl-group-timing]')?.addEventListener('click',()=>{M.state.settings.timingAthleteId=ath.id;M.navigationEngine?.go?.('times',{restore:false});},{once:true});
    const oldTimes=root.querySelector('#perfTimes');if(oldTimes)oldTimes.hidden=true;
    if(!perf.querySelector('[data-cl-performance-pathway]'))perf.insertAdjacentHTML('beforeend',performancePathwayHtml(ath));
    perf.querySelectorAll('[data-cl-event]').forEach(b=>{if(b.dataset.clBound)return;b.dataset.clBound='1';b.onclick=()=>{M.state.settings.pathwayEventKey=b.dataset.clEvent;perf.querySelector('[data-cl-performance-pathway]')?.remove();perf.insertAdjacentHTML('beforeend',performancePathwayHtml(ath));installTabs(root,ath);};});
  }
  function apply(){const root=document.querySelector('#athletesView'),ath=selected();if(!root||!ath)return;installTabs(root,ath);patchSnapshot(root,ath);patchTraining(root,ath);}
  function install(){apply();const root=document.querySelector('#athletesView');if(root){let pending=false;const obs=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply();});});obs.observe(root,{childList:true,subtree:true});X.observer=obs;}document.querySelectorAll('[data-msos-deck-ath]').forEach(b=>b.addEventListener('pointerdown',()=>{const ath=(M.state.athletes||[]).find(a=>a.id===b.dataset.msosDeckAth);if(ath)M.swimmerPerformanceBM?.completeEvidence?.(ath).catch?.(()=>{});},{passive:true}));g.addEventListener?.('msos:evidence-ready',()=>requestAnimationFrame(apply));}
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
  X.apply=apply;X.closestCurrentStep=closestCurrentStep;
})(globalThis);
