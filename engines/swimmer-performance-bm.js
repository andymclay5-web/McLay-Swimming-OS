'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence;
  if(!M?.ui||!M?.state||!M?.performanceEngine||!M?.pathway)return;

  const BUILD='v4-swimmer-performance-pathway-20260824bm';
  const X=M.swimmerPerformanceBM={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const clock=v=>M.util?.clock?M.util.clock(Number(v)):String(v??'—');
  const courseOf=r=>text(E?.course?.(r)||r?.course||r?.pool_course).toUpperCase();
  const distanceOf=r=>Number(E?.distance?.(r)||r?.distance||r?.event_distance);
  const strokeOf=r=>text(E?.rowStroke?.(r)||r?.stroke||r?.event_stroke);
  const secondsOf=r=>Number(E?.seconds?.(r)||r?.result_seconds||r?.seconds||r?.time_seconds);
  const dateOf=r=>text(r?.result_date||r?.date||r?.meet_date||r?.event_date||r?.created_at).slice(0,10);
  const currentCourse=()=>text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
  const selectedAthlete=()=>{
    const role=M.access?.role?.()||'owner';
    const id=role==='swimmer'?M.state?.settings?.activeUserAthleteId:M.state?.settings?.selectedAthleteId;
    return (M.state?.athletes||[]).find(a=>a.id===id)||null;
  };
  const eventKey=(course,distance,stroke)=>`${text(course).toUpperCase()}|${Number(distance)||0}|${text(stroke)}`;
  const shortStroke=s=>text(s).replace('Freestyle','Free').replace('Backstroke','Back').replace('Breaststroke','Breast').replace('Butterfly','Fly');

  function rawRows(ath){
    let rows=[];
    try{rows=E?.pbRows?.(ath,M.state)||[]}catch{}
    return rows.filter(r=>{
      const s=secondsOf(r),d=distanceOf(r),st=strokeOf(r);
      return Number.isFinite(s)&&s>0&&d>0&&!!st;
    });
  }

  function bestRowsByEvent(ath,course){
    const wanted=text(course).toUpperCase(),map=new Map();
    for(const r of rawRows(ath)){
      const crs=courseOf(r);
      if(wanted&&crs&&crs!==wanted)continue;
      const k=eventKey(crs||wanted,distanceOf(r),strokeOf(r)),s=secondsOf(r),old=map.get(k);
      if(!old||s<secondsOf(old))map.set(k,r);
    }
    return [...map.values()];
  }

  function milestoneRows(ev){
    if(!ev?.pb)return[];
    if(M.swimmerTabsUI?.realMilestones){
      try{return M.swimmerTabsUI.realMilestones(ev)||[]}catch{}
    }
    const pbSeconds=Number(ev.pb.result_seconds),rows=[];
    for(const r of [...(ev.qualifying||[]),...(ev.deeper||[])]){
      const seconds=Number(r?._seconds??M.pathway?.seconds?.(r));
      if(!Number.isFinite(seconds)||seconds<=0)continue;
      rows.push({
        _label:text(r?._label||M.pathway?.standardLabel?.(r)||r?.name||'Milestone'),
        _seconds:seconds,
        achieved:Number.isFinite(pbSeconds)&&pbSeconds<=seconds,
        gapSeconds:Math.max(0,pbSeconds-seconds),
        gapPercentage:seconds>0?Math.max(0,(pbSeconds-seconds)/seconds*100):0,
        _kind:r?._kind||''
      });
    }
    return rows.sort((a,b)=>b._seconds-a._seconds);
  }

  function pathwayMap(ath,course){
    let p=null;try{p=M.pathway.profile(ath,course)}catch{}
    const map=new Map();
    for(const ev of p?.events||[]){
      const pb=ev?.pb;if(!pb)continue;
      map.set(eventKey(pb.course||course,pb.distance,pb.stroke),ev);
    }
    return {profile:p,map};
  }

  function resultHistoryFor(ath,course,distance,stroke){
    const wanted=text(course).toUpperCase(),d=Number(distance),st=text(stroke);
    return rawRows(ath).filter(r=>{
      const crs=courseOf(r);
      return (!wanted||!crs||crs===wanted)&&distanceOf(r)===d&&strokeOf(r)===st;
    }).sort((a,b)=>String(dateOf(a)).localeCompare(String(dateOf(b)))||secondsOf(a)-secondsOf(b));
  }

  function seasonProgress(ath,course,distance,stroke){
    const year=String(new Date().getFullYear()),rows=resultHistoryFor(ath,course,distance,stroke)
      .filter(r=>dateOf(r).startsWith(year));
    if(!rows.length)return null;
    const dated=rows.filter(r=>dateOf(r));
    const first=(dated.length?dated:rows)[0];
    const best=rows.reduce((a,b)=>secondsOf(b)<secondsOf(a)?b:a,rows[0]);
    const firstSeconds=secondsOf(first),bestSeconds=secondsOf(best);
    const improvement=Math.max(0,firstSeconds-bestSeconds);
    return {
      year,
      firstSeconds,
      bestSeconds,
      firstDate:dateOf(first),
      bestDate:dateOf(best),
      improvement,
      swims:rows.length
    };
  }

  function buildModel(ath,course=currentCourse()){
    const bestRows=bestRowsByEvent(ath,course),path=pathwayMap(ath,course),ranked=M.performanceEngine.rankedEvents?.(ath,M.state,course)||[];
    const rankMap=new Map(ranked.map((r,i)=>[eventKey(r.course||course,r.distance,r.stroke),{...r,rank:i+1}]));
    const events=bestRows.map(row=>{
      const crs=courseOf(row)||course,d=distanceOf(row),st=strokeOf(row),k=eventKey(crs,d,st),pbSeconds=secondsOf(row);
      const pathway=path.map.get(k)||null,milestones=pathway?milestoneRows(pathway):[],next=milestones.find(x=>!x.achieved)||null,rank=rankMap.get(k)||null;
      return {
        key:k,course:crs,distance:d,stroke:st,pbSeconds,pbRow:row,
        points:Number.isFinite(Number(rank?.points))?Number(rank.points):null,
        pointSystem:rank?.pointSystem||M.performanceEngine.scoreSystem?.(ath)||'WA',
        rank:rank?.rank||null,
        milestones,next,
        season:seasonProgress(ath,crs,d,st)
      };
    });
    events.sort((a,b)=>{
      const ag=a.next?Number(a.next.gapPercentage):Infinity,bg=b.next?Number(b.next.gapPercentage):Infinity;
      return ag-bg||(Number(b.points)||0)-(Number(a.points)||0)||a.distance-b.distance||a.stroke.localeCompare(b.stroke);
    });
    return {
      athlete:ath,
      course,
      events,
      closest:events.filter(e=>e.next).slice(0,4),
      pathwayProfile:path.profile||null
    };
  }

  function gapText(e){
    if(!e.next)return'No faster loaded benchmark';
    const s=Number(e.next.gapSeconds);
    if(s<=0)return'Benchmark achieved';
    return `${s.toFixed(2)}s to ${text(e.next._label||'next benchmark')}`;
  }

  function seasonText(s){
    if(!s)return'No 2026 event progression loaded';
    if(s.swims<2)return`${s.year} · ${clock(s.bestSeconds)} · 1 recorded swim`;
    if(s.improvement>0)return`${s.year} · ${clock(s.firstSeconds)} → ${clock(s.bestSeconds)} · −${s.improvement.toFixed(2)}s`;
    return`${s.year} · ${clock(s.bestSeconds)} · ${s.swims} recorded swims`;
  }

  function opportunityClass(e){
    if(!e.next)return'';
    const p=Number(e.next.gapPercentage);
    if(p<=1)return'very-close';
    if(p<=3)return'close';
    if(p<=6)return'in-range';
    return'building';
  }

  function eventCard(e){
    const next=e.next,pts=e.points?`${Math.round(e.points)} ${esc(e.pointSystem)}`:'';
    const pct=next?Number(next.gapPercentage):null;
    return `<article class="bm-event ${opportunityClass(e)}" data-bm-event="${esc(e.key)}">
      <button class="bm-event-main" data-bm-open="${esc(e.key)}">
        <span class="bm-event-name"><b>${esc(`${e.distance} ${shortStroke(e.stroke)}`)}</b><small>${esc(e.course)}</small></span>
        <span class="bm-pb"><small>PB</small><b>${clock(e.pbSeconds)}</b>${pts?`<em>${pts}</em>`:''}</span>
        <span class="bm-gap">${next?`<small>${esc(next._label||'Next benchmark')}</small><b>${Number(next.gapSeconds).toFixed(2)}s away</b><em>${pct.toFixed(1)}%</em>`:'<small>Pathway</small><b>Benchmark not loaded</b>'}</span>
      </button>
      <div class="bm-event-detail" data-bm-detail="${esc(e.key)}" hidden>
        <div class="bm-detail-grid">
          <div><small>Current PB</small><b>${clock(e.pbSeconds)}</b></div>
          <div><small>Season progress</small><b>${esc(seasonText(e.season))}</b></div>
          <div><small>Next meaningful step</small><b>${esc(next?`${next._label} · ${clock(next._seconds)}`:'No faster loaded benchmark')}</b></div>
          <div><small>Gap</small><b>${esc(next?`${Number(next.gapSeconds).toFixed(2)}s · ${Number(next.gapPercentage).toFixed(1)}%`:'—')}</b></div>
        </div>
        ${e.milestones.length?`<div class="bm-ladder">${e.milestones.map(m=>`<span class="${m.achieved?'achieved':'upcoming'}"><small>${esc(m._label)}</small><b>${clock(m._seconds)}</b>${m.achieved?'<em>✓</em>':`<em>${Number(m.gapSeconds).toFixed(2)}s</em>`}</span>`).join('')}</div>`:'<p class="muted">No verified pathway milestones are loaded for this event yet.</p>'}
      </div>
    </article>`;
  }

  function performancePanel(model){
    const events=model.events||[];
    const closest=model.closest||[];
    return `<section class="bm-performance-shell" data-bm-performance>
      <section class="page-card bm-hero">
        <div class="eyebrow">MY SWIMMING · ${esc(model.course)}</div>
        <h2>${esc(model.athlete?.full_name||'Swimmer')}</h2>
        <p>Every loaded event, current PB, season movement and the next meaningful benchmark.</p>
        ${closest.length?`<div class="bm-opportunities">${closest.map((e,i)=>`<span><small>${i===0?'CLOSEST LOADED OPPORTUNITY':`#${i+1} NEXT`}</small><b>${esc(`${e.distance} ${shortStroke(e.stroke)}`)}</b><em>${Number(e.next.gapSeconds).toFixed(2)}s to ${esc(e.next._label)}</em></span>`).join('')}</div>`:'<div class="context-note"><b>Benchmarks are still loading.</b> PBs remain visible; MSOS will not invent a target.</div>'}
      </section>
      <section class="page-card">
        <div class="bm-section-head"><div><div class="eyebrow">ALL EVENTS</div><h2>${events.length} loaded ${esc(model.course)} event${events.length===1?'':'s'}</h2></div><small>Ordered by closest loaded benchmark, then performance strength.</small></div>
        ${events.length?`<div class="bm-events">${events.map(eventCard).join('')}</div>`:'<p class="muted">No verified event evidence is loaded for this course.</p>'}
      </section>
    </section>`;
  }

  function pathwayPanel(model){
    const events=model.events||[],withSteps=events.filter(e=>e.milestones.length);
    return `<section class="bm-pathway-shell" data-bm-pathway>
      <section class="page-card bm-hero">
        <div class="eyebrow">PATHWAY · ${esc(model.course)}</div>
        <h2>Where I am → what comes next</h2>
        <p>The same event truth as Performance, focused on benchmarks and qualification gaps.</p>
      </section>
      <section class="page-card">
        ${withSteps.length?`<div class="bm-path-grid">${withSteps.map(e=>{
          const next=e.next;
          return `<article>
            <div><small>${esc(e.course)}</small><b>${esc(`${e.distance} ${shortStroke(e.stroke)}`)}</b><span>PB ${clock(e.pbSeconds)}</span></div>
            <div>${next?`<small>NEXT</small><b>${esc(next._label)}</b><span>${clock(next._seconds)} · ${Number(next.gapSeconds).toFixed(2)}s away</span>`:'<small>PATHWAY</small><b>All loaded steps achieved</b>'}</div>
          </article>`;
        }).join('')}</div>`:'<p class="muted">No verified pathway standards are loaded for these events yet.</p>'}
      </section>
    </section>`;
  }

  function installInteractions(root){
    root?.querySelectorAll?.('[data-bm-open]').forEach(btn=>btn.onclick=()=>{
      const key=btn.dataset.bmOpen,detail=[...root.querySelectorAll('[data-bm-detail]')].find(x=>x.dataset.bmDetail===key);
      if(detail)detail.hidden=!detail.hidden;
    });
  }

  function render(){
    const ath=selectedAthlete();if(!ath)return;
    const course=currentCourse(),model=buildModel(ath,course),host=document.querySelector('#athletesView');
    if(!host)return;
    const perf=host.querySelector('[data-msos-ath-panel="performance"]'),path=host.querySelector('[data-msos-ath-panel="pathway"]');
    if(perf){
      for(const child of [...perf.children]){if(!child.matches('[data-bm-performance]'))child.hidden=true;}
      perf.querySelector('[data-bm-performance]')?.remove();
      const wrap=document.createElement('div');wrap.innerHTML=performancePanel(model);const node=wrap.firstElementChild;perf.prepend(node);installInteractions(node);
    }
    if(path){
      for(const child of [...path.children]){if(!child.matches('[data-bm-pathway]'))child.hidden=true;}
      path.querySelector('[data-bm-pathway]')?.remove();
      const wrap=document.createElement('div');wrap.innerHTML=pathwayPanel(model);path.prepend(wrap.firstElementChild);
    }
  }

  function install(){
    const base=M.ui.renderAthletes?.bind(M.ui);
    if(base&&!X._wrapped){
      X._wrapped=true;
      M.ui.renderAthletes=(...args)=>{const out=base(...args);requestAnimationFrame(render);return out;};
      if(M.performanceUI)M.performanceUI.render=M.ui.renderAthletes;
    }
    const host=document.querySelector('#athletesView');
    if(host&&!X._bound){
      X._bound=true;
      host.addEventListener('click',e=>{
        if(e.target.closest?.('[data-msos-ath-tab="performance"],[data-msos-ath-tab="pathway"]'))requestAnimationFrame(render);
      });
    }
    requestAnimationFrame(render);
  }

  X.modelFor=buildModel;
  X.render=render;
  X.seasonProgress=seasonProgress;
  X.gapText=gapText;
  X.checks=()=>({build:BUILD,allEvents:true,benchmarkGap:true,seasonProgress:true,noAthleteSpecialCases:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(globalThis);