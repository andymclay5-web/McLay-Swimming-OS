'use strict';
/* McLay Swimming OS — Thursday bridge + compact target fit · 20 Aug 2026 */
(function(g){
  const M=g.MSOS4;if(!M?.ui||!M?.targets||!M?.adapt)return;
  const U=M.util,UI=M.ui,T=M.targets,A=M.adapt,C=M.correct=M.correct||{};
  const B=M.thursdayBridgeFit={build:'v4-thursday-boardfit-20260820f'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const stroke=v=>{const s=text(v).toLowerCase();if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';return text(v)};
  const rowName=r=>r?.full_name||r?.athlete_name||r?.swimmer_name||r?.match_name||r?.source_swimmer_name||r?.name||'';
  const secs=r=>Number(r?.result_seconds??r?.time_seconds??r?.seconds??r?.result_time_seconds??r?.pb_seconds??r?.best_time_seconds);
  const course=r=>text(r?.course||r?.pool_course).toUpperCase();
  const distance=r=>Number(r?.distance||r?.event_distance);
  const eventStroke=r=>stroke(r?.stroke||r?.event_stroke||'');
  const sex=v=>{const s=text(v).toUpperCase();if(/^F/.test(s))return'F';if(/^M/.test(s))return'M';return s};
  const save=()=>{try{M.store?.save?.(M.state)}catch{}};

  M.BUILD=B.build;M.CORE='20260820-thursday-boardfit';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:B.build,softwareReady:false,note:'Thursday compact target / PB alias bridge loaded; Android acceptance still required'});

  // Protect the agreed active baseline ratios from stale imported profile rows.
  const baseProfile=A.profile?.bind(A);
  if(baseProfile)A.profile=(ath,state=M.state)=>{const p=baseProfile(ath,state)||{ratio:1},k=norm(ath?.full_name),fixed={charlottemurphy:.50,conorfischer:.50,mckenziedrage:2/3,amberproudfoot:2/3,matthewkofoed:2/3,rubystace:2/3};if(fixed[k])p.ratio=fixed[k];if(k==='charlottemurphy'||k==='mckenziedrage')p.returnToStart=true;return p};

  // Old PB rows can carry a previous athlete id. Match through same-name athlete aliases.
  const snap=()=>M.thursdayRecovery?.performanceSnapshot||{};
  function aliasIds(ath,state=M.state){const ids=new Set(ath?.id?[ath.id]:[]),n=norm(ath?.full_name),pools=[...(state?.athletes||[]),...(snap()?.athletes||[])];for(const a of pools)if(n&&norm(a?.full_name)===n&&a?.id)ids.add(a.id);return ids}
  function sameAth(r,a,state=M.state){return aliasIds(a,state).has(r?.athlete_id)||(norm(rowName(r))&&norm(rowName(r))===norm(a?.full_name))}
  function pbPools(state=M.state){const R=M.refs?.data||{},P=snap(),PR=P?._refs||{};return[
    ...(state?.resultsPbBoard||state?.results_pb_board||[]),...(state?.coachResults||state?.coach_results||[]),...(state?.resultsEventHistory||state?.results_event_history||[]),
    ...(R.results_pb_board||[]),...(R.coach_results||[]),...(R.results_event_history||[]),
    ...(P.resultsPbBoard||P.results_pb_board||[]),...(P.coachResults||P.coach_results||[]),...(P.resultsEventHistory||P.results_event_history||[]),
    ...(PR.results_pb_board||[]),...(PR.coach_results||[]),...(PR.results_event_history||[])
  ]}
  function waBases(){const R=M.refs?.data||{},P=snap(),PR=P?._refs||{};return[...(R.world_aquatics_base_times||[]),...(PR.world_aquatics_base_times||[])]}
  function pointValue(ath,row){const explicit=Number(row?.world_para_points||row?.para_points||row?.wa_points||row?.world_aquatics_points||row?.fina_points||row?.points||row?.point_score);if(explicit>0)return explicit;const t=secs(row),d=distance(row),st=eventStroke(row),crs=course(row);if(!t||!d||!st||!crs)return NaN;const sx=sex(ath?.sex||ath?.gender),base=waBases().find(x=>x?.active!==false&&course(x)===crs&&distance(x)===d&&eventStroke(x)===st&&(!sex(x?.sex)||sex(x?.sex)==='OPEN'||sex(x?.sex)===sx));const b=Number(base?.base_seconds);return b>0?1000*Math.pow(b/t,3):NaN}

  T.pb=(ath,state=M.state,spec={})=>{const wantD=Number(spec.distance),wantS=stroke(spec.stroke),wantC=text(spec.course).toUpperCase(),rows=pbPools(state).filter(r=>sameAth(r,ath,state)&&distance(r)===wantD&&eventStroke(r)===wantS&&Number.isFinite(secs(r))&&secs(r)>0);const exact=rows.filter(r=>!wantC||!course(r)||course(r)===wantC).sort((a,b)=>secs(a)-secs(b))[0];if(exact)return{...exact,_anchor_seconds:secs(exact),_anchor_source:`${wantC||course(exact)||'Stored'} ${wantD} ${wantS} PB`};const other=wantC==='SCM'?'LCM':wantC==='LCM'?'SCM':'';if(!other)return null;const alt=rows.filter(r=>course(r)===other).sort((a,b)=>secs(a)-secs(b))[0];if(!alt)return null;const cv=T.convert?.(secs(alt),other,wantC,wantD,wantS,state);return cv?{...alt,_anchor_seconds:cv.seconds,_anchor_source:`${other} PB → ${wantC} · ${cv.source}`} : null};

  const priorBest=C.bestStroke?.bind(C);
  C.bestStroke=(ath,state=M.state,crs='',nonFree=false)=>{const declared=stroke(ath?.primary_stroke||ath?.best_stroke||ath?.preferred_stroke||ath?.stroke1||ath?.stroke_1||ath?.number_one_stroke||''),rows=pbPools(state).filter(r=>sameAth(r,ath,state)&&Number.isFinite(secs(r))&&secs(r)>0&&['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(eventStroke(r))&&(!nonFree||eventStroke(r)!=='Freestyle')),wantC=text(crs).toUpperCase(),same=rows.filter(r=>!wantC||!course(r)||course(r)===wantC),pool=same.length?same:rows,scored=pool.map(r=>({stroke:eventStroke(r),points:pointValue(ath,r),seconds:secs(r)})).filter(x=>Number.isFinite(x.points)&&x.points>0).sort((a,b)=>b.points-a.points||a.seconds-b.seconds);if(scored[0]?.stroke)return scored[0].stroke;const old=priorBest?.(ath,state,crs,nonFree);if(old)return old;return declared&&['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(declared)&&(!nonFree||declared!=='Freestyle')?declared:''};
  M.performanceBridge={...(M.performanceBridge||{}),ask:(kind,p={})=>kind==='pb'?T.pb(p.athlete,p.state||M.state,p):kind==='t400'?T.t400?.(p.athlete,p.state||M.state,'',p.stroke):null};

  function repaintAfterEvidence(){const jobs=[];try{const p=M.refs?.boot?.();if(p?.then)jobs.push(p)}catch{}try{const p=M.thursdayRecovery?.hydratePerformance?.();if(p?.then)jobs.push(p)}catch{}if(!jobs.length)return;Promise.allSettled(jobs).then(()=>{M.thursdayRecovery?.invalidatePerformance?.();const v=M.state?.settings?.view;if(v==='board')UI.renderBoard?.();else if(v==='tv')UI.renderTV?.()})}

  function migrateDeck(){M.state.settings=M.state.settings||{};if(M.state.settings.bridgeFitDeckBuild===B.build)return;M.state.settings.bridgeFitDeckBuild=B.build;M.state.settings.boardFocusMode=true;M.state.settings.expandedItemId='';const s=M.currentSession?.();if(s){M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};const main=(s.blocks||[]).find(b=>b.type==='main_set')||(s.blocks||[])[0];if(main)M.state.settings.boardBlockBySession[s.id]=main.id}save()}

  const priorBoard=UI.renderBoard?.bind(UI);
  if(priorBoard)UI.renderBoard=()=>{
    priorBoard();
    const host=document.querySelector('#boardView');if(!host)return;
    const athletes=UI.presentAthletes?.()||[];
    host.querySelectorAll('.thu3-mod-ath small').forEach(x=>x.hidden=true);
    host.querySelectorAll('.thu2-mod-selector span').forEach(x=>x.textContent='MOD');
    host.querySelectorAll('.thu2-mod-rail>header span').forEach(x=>x.textContent='MOD');
    host.querySelectorAll('.thu2-line-head strong,.thu2-line-head small,.thu3-mod-ath b,.thu3-mod-ath em,.thu2-target-row span').forEach(x=>{x.textContent=text(x.textContent).replace(/\bFreestyle\b/gi,'Fr').replace(/\bBackstroke\b/gi,'Bk').replace(/\bBreaststroke\b/gi,'Br').replace(/\bButterfly\b/gi,'Fly').replace(/No #1 stroke evidence loaded · target needed/gi,'#1 target needed')});
    host.querySelectorAll('.thu2-target-row').forEach(row=>{const sel=row.querySelector('[data-thu2-stroke]'),id=sel?.dataset.thu2Stroke?.split(':')[0],ath=athletes.find(a=>a.id===id),name=row.querySelector('b');if(name&&ath&&athletes.length>4)name.textContent=M.thursdayDeckFit?.boardName?.(ath,athletes,true)||name.textContent});
    host.querySelectorAll('.thu2-line.open').forEach(line=>{if(line.querySelector('.thu2-target-grid')){line.classList.add('thu6-target-line');line.querySelector('.thu2-line-detail')?.classList.add('thu6-target-detail')}});
    host.querySelectorAll('.thu2-line-head em').forEach(x=>{const t=text(x.textContent);if(/^T|Targets/i.test(t))x.textContent='TARGETS';else if(t==='×'||/Close/i.test(t))x.textContent='CLOSE'});
  };

  const boot=()=>{migrateDeck();repaintAfterEvidence();setTimeout(()=>{const v=M.state?.settings?.view;if(v==='board')UI.renderBoard?.();else if(v==='tv')UI.renderTV?.()},0)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
