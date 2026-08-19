'use strict';
/* McLay Swimming OS — Thursday bridge/deck fit · 20 Aug 2026
   Finalises the current Thursday pass around the live findings:
   - make race-pace #1 resolve from the same local PB/reference evidence pool
   - rerender Board/TV after local reference hydration completes
   - migrate the coach Board once to compact current-set mode
   - keep deck text compact; preserve rationale in state, not on the whiteboard
*/
(function(g){
  const M=g.MSOS4;if(!M?.ui||!M?.targets||!M?.adapt)return;
  const U=M.util,UI=M.ui,T=M.targets,A=M.adapt,S=M.session,C=M.correct=M.correct||{};
  const B=M.thursdayBridgeFit={build:'v4-thursday-bridgefit-20260820e'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const stroke=v=>{const s=text(v).toLowerCase();if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';return text(v)};
  const rowName=r=>r?.full_name||r?.athlete_name||r?.swimmer_name||r?.match_name||r?.source_swimmer_name||r?.name||'';
  const sameAth=(r,a)=>r?.athlete_id===a?.id||norm(rowName(r))===norm(a?.full_name);
  const secs=r=>Number(r?.result_seconds??r?.time_seconds??r?.seconds??r?.result_time_seconds??r?.pb_seconds??r?.best_time_seconds);
  const course=r=>text(r?.course||r?.pool_course).toUpperCase();
  const distance=r=>Number(r?.distance||r?.event_distance);
  const eventStroke=r=>stroke(r?.stroke||r?.event_stroke||'');
  const sex=v=>{const s=text(v).toUpperCase();if(/^F/.test(s))return'F';if(/^M/.test(s))return'M';return s};
  const save=()=>{try{M.store?.save?.(M.state)}catch{}};

  M.BUILD=B.build;M.CORE='20260820-thursday-bridgefit';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:B.build,softwareReady:false,note:'Thursday bridge/deck fit loaded; Android acceptance still required'});

  const priorBest=C.bestStroke?.bind(C);
  function pbPools(state=M.state){const R=M.refs?.data||{};return[
    ...(state?.resultsPbBoard||state?.results_pb_board||[]),
    ...(state?.coachResults||state?.coach_results||[]),
    ...(state?.resultsEventHistory||state?.results_event_history||[]),
    ...(R.results_pb_board||[]),...(R.coach_results||[]),...(R.results_event_history||[])
  ]}
  function waBases(){const R=M.refs?.data||{};return R.world_aquatics_base_times||[]}
  function pointValue(ath,row){
    const explicit=Number(row?.world_para_points||row?.para_points||row?.wa_points||row?.world_aquatics_points||row?.fina_points||row?.points);
    if(explicit>0)return explicit;
    const t=secs(row),d=distance(row),st=eventStroke(row),crs=course(row);if(!t||!d||!st||!crs)return NaN;
    const asex=sex(ath?.sex||ath?.gender),base=waBases().find(x=>x?.active!==false&&course(x)===crs&&distance(x)===d&&eventStroke(x)===st&&(!sex(x?.sex)||sex(x?.sex)==='OPEN'||sex(x?.sex)===asex));
    const b=Number(base?.base_seconds);return b>0?1000*Math.pow(b/t,3):NaN;
  }
  C.bestStroke=(ath,state=M.state,crs='',nonFree=false)=>{
    const first=priorBest?.(ath,state,crs,nonFree);if(first)return first;
    const declared=stroke(ath?.primary_stroke||ath?.best_stroke||ath?.preferred_stroke||ath?.stroke1||ath?.stroke_1||ath?.number_one_stroke||'');
    if(declared&&['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(declared)&&(!nonFree||declared!=='Freestyle'))return declared;
    const wantedCourse=text(crs).toUpperCase();
    const rows=pbPools(state).filter(r=>sameAth(r,ath)&&Number.isFinite(secs(r))&&secs(r)>0&&['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(eventStroke(r))&&(!nonFree||eventStroke(r)!=='Freestyle'));
    let candidates=rows.filter(r=>!wantedCourse||!course(r)||course(r)===wantedCourse).map(r=>({stroke:eventStroke(r),points:pointValue(ath,r),seconds:secs(r)})).filter(x=>Number.isFinite(x.points)&&x.points>0);
    if(!candidates.length)candidates=rows.map(r=>({stroke:eventStroke(r),points:pointValue(ath,r),seconds:secs(r)})).filter(x=>Number.isFinite(x.points)&&x.points>0);
    candidates.sort((a,b)=>b.points-a.points||a.seconds-b.seconds);return candidates[0]?.stroke||'';
  };

  function repaintAfterRefs(){
    try{
      const p=M.refs?.boot?.();if(!p?.then)return;
      p.then(()=>{M.thursdayRecovery?.invalidatePerformance?.();const v=M.state?.settings?.view;if(v==='board')UI.renderBoard?.();else if(v==='tv')UI.renderTV?.();}).catch(()=>{});
    }catch{}
  }

  function migrateDeck(){
    M.state.settings=M.state.settings||{};
    if(M.state.settings.bridgeFitDeckBuild===B.build)return;
    M.state.settings.bridgeFitDeckBuild=B.build;
    M.state.settings.boardFocusMode=true;
    M.state.settings.expandedItemId='';
    const s=M.currentSession?.();if(s){
      M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};
      const main=(s.blocks||[]).find(b=>b.type==='main_set')||(s.blocks||[])[0];if(main)M.state.settings.boardBlockBySession[s.id]=main.id;
    }
    save();
  }

  const priorBoard=UI.renderBoard?.bind(UI);
  if(priorBoard)UI.renderBoard=()=>{
    priorBoard();
    const host=document.querySelector('#boardView');if(!host)return;
    host.querySelectorAll('.thu3-mod-ath small').forEach(x=>x.hidden=true);
    host.querySelectorAll('.thu2-mod-selector span').forEach(x=>x.textContent='MOD');
    host.querySelectorAll('.thu2-mod-rail>header span').forEach(x=>x.textContent='MOD');
    host.querySelectorAll('.thu2-line-head strong,.thu2-line-head small,.thu3-mod-ath b,.thu3-mod-ath em,.thu2-target-row span').forEach(x=>{x.textContent=text(x.textContent).replace(/\bFreestyle\b/gi,'Fr').replace(/\bBackstroke\b/gi,'Bk').replace(/\bBreaststroke\b/gi,'Br').replace(/\bButterfly\b/gi,'Fly').replace(/No #1 stroke evidence loaded · target needed/gi,'#1 target needed')});
  };

  const boot=()=>{migrateDeck();repaintAfterRefs();setTimeout(()=>{const v=M.state?.settings?.view;if(v==='board')UI.renderBoard?.();else if(v==='tv')UI.renderTV?.()},0)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
