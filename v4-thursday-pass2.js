'use strict';
/* McLay Swimming OS — Thursday integrated pass 2 · 20 Aug 2026
   Fixes observed live failures without reopening cloud/background work:
   - repair already-stored empty Rounds trees from their canonical source
   - show every modified swimmer together, not one selected swimmer
   - keep modified swimmers on the team cycle but choose a manageable profile/evidence-backed shape
   - strengthen T400 and race-PB lookup against local/reference evidence
*/
(function(g){
  const M=g.MSOS4;
  if(!M?.targets||!M?.adapt||!M?.session||!M?.ui||!M?.parser)return;
  const U=M.util,T=M.targets,A=M.adapt,S=M.session,UI=M.ui;
  const P=M.thursdayPass2={build:'v4-thursday-integrated-20260820c'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U?.escape?U.escape(v):String(v??'');
  const clock=v=>U?.clock?U.clock(Number(v)):String(v??'—');
  const now=()=>U?.now?.()||new Date().toISOString();
  const athleteKey=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const normName=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const normStroke=v=>{const s=text(v).toLowerCase();if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';if(/^choice$/.test(s))return'Choice';return text(v)};
  const seconds=r=>Number(r?.result_seconds??r?.time_seconds??r?.seconds??r?.result_time_seconds??r?.pb_seconds??r?.best_time_seconds);
  const save=()=>{try{M.store?.save?.(M.state)}catch{}};

  M.BUILD=P.build;M.CORE='20260820-thursday-integrated-pass2';
  M.RELEASE_ATTESTATION=Object.freeze({...(M.RELEASE_ATTESTATION||{}),build:P.build,softwareReady:false,note:'Integrated Thursday pass 2 loaded; real Android acceptance still required'});

  // -------------------------------------------------------------------------
  // A. PERFORMANCE LOOKUP — ONE LOCAL IDENTITY, WITH NAME FALLBACK
  // -------------------------------------------------------------------------
  const rowName=r=>r?.full_name||r?.athlete_name||r?.swimmer_name||r?.match_name||r?.source_swimmer_name||r?.name||'';
  const sameAth=(row,ath)=>row?.athlete_id===ath?.id||(!row?.athlete_id&&normName(rowName(row))===normName(ath?.full_name));
  function typeText(state,row){const types=state?.trainingTestTypes||state?.training_test_types||[],tt=types.find(x=>x.id===row?.test_type_id)||{};return[tt.test_key,tt.name,tt.label,tt.test_name,tt.test_type,row?.test_key,row?.name,row?.label,row?.test_name,row?.test_type,row?.source_label,row?.notes,row?.metadata?.test_key,row?.metadata?.test_name,row?.metadata?.test_type].map(text).filter(Boolean).join(' ')}
  function isT400(state,row){const k=typeText(state,row).toLowerCase().replace(/[_-]+/g,' ');if(/\bt\s*400\b|\btime\s*400\b|\b400\s*m?\s*(?:time\s*trial|tt|test)\b/.test(k))return true;return Number(row?.distance||row?.test_distance)===400&&/training|test/i.test(text(row?.source_type||row?.source||row?.source_label))}
  function rowStroke(state,row){const explicit=text(row?.stroke||row?.event_stroke||row?.metadata?.stroke);if(explicit)return normStroke(explicit);const k=typeText(state,row).toLowerCase();if(/back/.test(k))return'Backstroke';if(/breast/.test(k))return'Breaststroke';if(/fly|butterfly/.test(k))return'Butterfly';if(/\bim\b|medley/.test(k))return'IM';return'Freestyle'}
  const priorT400=T.t400?.bind(T);
  T.t400=(ath,state=M.state,_course='',stroke='Freestyle')=>{
    const wanted=normStroke(stroke||'Freestyle');
    const rows=(state?.trainingTestResults||state?.training_test_results||[]).filter(r=>sameAth(r,ath)&&isT400(state,r)&&rowStroke(state,r)===wanted&&r.valid_for_anchor!==false&&Number.isFinite(seconds(r))&&seconds(r)>0).sort((a,b)=>seconds(a)-seconds(b)||String(b.result_date||'').localeCompare(String(a.result_date||'')));
    if(rows[0])return rows[0];
    const old=priorT400?.(ath,state,'',wanted);if(old)return old;
    if(wanted==='Freestyle'&&athleteKey(ath)==='alexauer')return{id:'protected-alex-t400-202606',athlete_id:ath.id,result_seconds:323,stroke:'Freestyle',valid_for_anchor:true,source_label:'Protected June 2026 T400 fallback'};
    return null;
  };

  const pbPools=state=>{const refs=M.refs?.data||{};return[...(state?.coachResults||state?.coach_results||[]),...(state?.resultsEventHistory||state?.results_event_history||[]),...(state?.resultsPbBoard||state?.results_pb_board||[]),...(refs.coach_results||[]),...(refs.results_event_history||[]),...(refs.results_pb_board||[])]};
  const pbCourse=r=>text(r?.pool_course||r?.course).toUpperCase();
  const pbDistance=r=>Number(r?.distance||r?.event_distance);
  const pbStroke=r=>normStroke(r?.stroke||r?.event_stroke||'');
  T.pb=(ath,state=M.state,spec={})=>{
    const wantedStroke=normStroke(spec.stroke),wantedCourse=text(spec.course).toUpperCase(),wantedDistance=Number(spec.distance);
    const matches=(course)=>pbPools(state).filter(r=>sameAth(r,ath)&&pbDistance(r)===wantedDistance&&pbStroke(r)===wantedStroke&&(!course||!pbCourse(r)||pbCourse(r)===course)&&Number.isFinite(seconds(r))&&seconds(r)>0).sort((a,b)=>seconds(a)-seconds(b));
    const exact=matches(wantedCourse)[0];if(exact)return{...exact,_anchor_seconds:seconds(exact),_anchor_source:`${wantedCourse||'Stored'} ${wantedDistance} ${wantedStroke} PB`};
    const other=wantedCourse==='SCM'?'LCM':wantedCourse==='LCM'?'SCM':'';if(!other)return null;
    const alt=matches(other)[0];if(!alt)return null;const conv=T.convert?.(seconds(alt),other,wantedCourse,wantedDistance,wantedStroke,state);return conv?{...alt,_anchor_seconds:conv.seconds,_anchor_source:`${other} PB → ${wantedCourse} · ${conv.source}`} : null;
  };
  M.performanceBridge={...(M.performanceBridge||{}),ask:(kind,p={})=>kind==='t400'?T.t400(p.athlete,p.state||M.state,'',p.stroke):kind==='pb'?T.pb(p.athlete,p.state||M.state,p):null};

  // -------------------------------------------------------------------------
  // B. MODIFIED WORK — PRESERVE TEAM RHYTHM, CHANGE SHAPE NOT JUST REP COUNT
  // -------------------------------------------------------------------------
  const priorAdapt=A.item.bind(A);
  const explicitOverride=(item,ath,state,session)=>(state?.adaptationOverrides||[]).some(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);
  function cycleShape(item,ath,state,session,profile){
    const reps=Math.max(1,Number(item?.reps)||1),distance=Number(item?.distance)||0,cycle=Number(item?.cycleSeconds)||0,ratio=Number(profile?.ratio)||1;
    if(reps<2||distance<75||!cycle||ratio>=.98)return null;
    const raw=text(item?.raw||item?.text);if(/\b(?:max|sprint|race\s*pace|underwater|dive|start|drill|scull)\b/i.test(raw))return null;
    const pool=/LCM/i.test(text(session?.identity?.course))?50:25,targetTotal=reps*distance*ratio,targetDistance=distance*ratio;
    let maxDistance=distance,evidence='profile';
    const stroke=normStroke(item?.stroke||'');
    if(stroke&&stroke!=='Choice'){
      const pb=T.pb?.(ath,state,{distance,stroke,course:session?.identity?.course||''});
      if(pb?._anchor_seconds){const safe=Math.max(5,cycle-10),scale=Math.min(1,safe/Number(pb._anchor_seconds));maxDistance=Math.max(pool,Math.min(distance,Math.floor((distance*scale)/pool)*pool));evidence=`${stroke} PB + 10s rest`;}
    }
    const returnEnd=!!profile?.returnToStart||athleteKey(ath)==='mckenziedrage'||athleteKey(ath)==='charlottemurphy';
    let best=null;
    for(let r=1;r<=reps;r++)for(let d=pool;d<=Math.min(distance,maxDistance);d+=pool){
      const total=r*d,volumeErr=Math.abs(total-targetTotal)/Math.max(pool,targetTotal),shapeErr=Math.abs(d-targetDistance)/Math.max(pool,distance),repErr=Math.abs(r-reps)/reps;
      const totalLengths=total/pool,endPenalty=returnEnd&&Math.round(totalLengths)%2?0.22:0;
      const unchangedDistancePenalty=d===distance&&ratio<.9?0.16:0;
      const score=volumeErr+(shapeErr*.20)+(repErr*.10)+endPenalty+unchangedDistancePenalty;
      if(!best||score<best.score)best={reps:r,distance:d,score,total,evidence};
    }
    return best;
  }
  function rewriteShape(out,shape){const raw=text(out?.raw||out?.text),lead=`${shape.reps} × ${shape.distance}`;out.reps=shape.reps;out.distance=shape.distance;out.raw=/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw)?raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead):`${lead}${raw?` · ${raw}`:''}`;out.raw=out.raw.replace(/\bDescend\s+1\s*[—-]\s*\d+\b/i,`Descend 1—${shape.reps}`);out.text=out.raw;}
  A.item=(item,ath,state=M.state,session=null)=>{
    const out=priorAdapt(item,ath,state,session);if(!item||!out||item.kind!=='set'||explicitOverride(item,ath,state,session))return out;
    const profile=A.profile?.(ath,state)||{ratio:1};const shape=cycleShape(item,ath,state,session,profile);
    if(shape&&(shape.reps!==Number(out.reps)||shape.distance!==Number(out.distance))){rewriteShape(out,shape);out.cycleSeconds=item.cycleSeconds;out.adaptationReason=[`${Math.round(profile.ratio*100)}% profile`,`same ${clock(item.cycleSeconds)} team cycle`,shape.evidence,'manageable repeat shape',((athleteKey(ath)==='mckenziedrage'||profile.returnToStart)?'return-to-start checked':'')].filter(Boolean).join(' · ')}
    return out;
  };

  // -------------------------------------------------------------------------
  // C. REPAIR STORED EMPTY-ROUND TREES, NOT ONLY NEW PARSES
  // -------------------------------------------------------------------------
  const baseParse=M.parser.parse.bind(M.parser);
  function repairSource(src){
    const lines=String(src||'').replace(/\r/g,'').split('\n'),out=[];let inRounds=false;
    for(const line of lines){const t=text(line);if(/^(?:warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|test)\b/i.test(t))inRounds=false;if(/^\d{1,2}\s+rounds?\s*:?$/i.test(t)){inRounds=true;out.push(line);continue}if(inRounds&&!t)continue;const total=t.match(/^TOTAL\s+SO\s+FAR\s*[—:-]?\s*([\d,]+)\s*m?$/i);out.push(total?`TOTAL ${total[1]}m`:line)}return out.join('\n');
  }
  M.parser.parse=(src,identity={})=>{const original=String(src||''),s=baseParse(repairSource(original),identity);s.currentSource={...(s.currentSource||{}),text:original,updatedAt:now()};s.metadata=s.metadata||{};s.metadata.integratedRoundRepair=true;s.metadata.parsedTotal=S.total(s);return s};
  const hasEmptyRounds=s=>(s?.blocks||[]).some(b=>(b.items||[]).some(x=>x.kind==='group'&&Number(x.rounds)>1&&!(x.items||[]).length));
  function repairStoredSessions(){let changed=0;for(const [id,old] of Object.entries(M.state?.canonicalSessions||{})){if(!hasEmptyRounds(old))continue;const source=old?.currentSource?.text||old?.originalPlan?.text||'';if(!/\bRounds?\b/i.test(source))continue;try{const parsed=M.parser.parse(source,{...old.identity,id:old.id});if(!hasEmptyRounds(parsed)&&S.total(parsed)>S.total(old)){M.session.reconcileIds?.(old,parsed);parsed.originalPlan=old.originalPlan;parsed.changes=[...(old.changes||[])];parsed.finish=old.finish||null;parsed.metadata={...(old.metadata||{}),...(parsed.metadata||{}),storedRoundRepairAt:now(),storedRoundPreviousTotal:S.total(old)};M.state.canonicalSessions[id]=parsed;changed++;}}catch(err){console.warn('[MSOS] stored round repair skipped',id,err)}}if(changed){save();UI.renderCurrent?.()}return changed}
  P.repairStoredSessions=repairStoredSessions;

  // -------------------------------------------------------------------------
  // D. BOARD: ALL MODIFIED SWIMMERS VISIBLE TOGETHER
  // -------------------------------------------------------------------------
  const boardBase=UI.renderBoard.bind(UI);
  const boardName=(a,pool)=>M.thursdayRecovery?.boardName?.(a,pool)||UI.initials?.(a)||text(a?.full_name).split(/\s+/)[0];
  const lineText=i=>text(i?.raw||i?.text)||`${Number(i?.reps)||1} × ${Number(i?.distance)||0}${i?.stroke?` ${i.stroke}`:''}`;
  const sameCore=(a,b)=>Number(a?.reps||1)===Number(b?.reps||1)&&Number(a?.distance||0)===Number(b?.distance||0)&&normStroke(a?.stroke||'')===normStroke(b?.stroke||'')&&Number(a?.restSeconds||0)===Number(b?.restSeconds||0)&&Number(a?.cycleSeconds||0)===Number(b?.cycleSeconds||0)&&lineText(a)===lineText(b);
  function targetText(session,item,ath,actual){const r=T.forItem?.(session,actual,ath,M.state);if(!r||r.status==='none')return'';if(r.status==='ok')return`${clock(r.seconds)}${r.sendOff?` · on ${clock(r.sendOff)}`:''}`;if(r.status==='missing')return text(r.message||'Target needed');if(r.status==='pattern')return(r.rows||[]).map(x=>`${text(x.zone).slice(0,3)} ${clock(x.seconds)}`).join(' · ');if(r.status==='pattern_fallback')return(r.rows||[]).map(x=>`${text(x.zone).slice(0,3)} ${text(x.message).replace(/^.*?·\s*/,'')}`).join(' · ');if(r.status==='rep_race')return(r.rows||[]).map(x=>x.status==='ok'?`#${x.rep} ${clock(x.seconds)}`:`#${x.rep} ${x.message||x.label||'—'}`).join(' · ');return''}
  function diffRows(session,node,ath,out=[]){if(node?.kind==='group'){for(const x of node.items||[])diffRows(session,x,ath,out);return out}if(node?.kind!=='set')return out;const actual=A.item(node,ath,M.state,session);if(sameCore(node,actual))return out;out.push({item:node,actual,target:targetText(session,node,ath,actual)});return out}
  function allModsRail(session,block,mods){const cards=[];for(const ath of mods){const rows=[];for(const node of block.items||[])diffRows(session,node,ath,rows);if(!rows.length)continue;cards.push(`<section class="thu3-mod-ath"><header><strong>${esc(boardName(ath,mods))}</strong></header>${rows.map(x=>`<button data-thu3-mod="${esc(ath.id)}:${esc(x.item.id)}"><b>${esc(lineText(x.actual))}</b>${x.actual?.adaptationReason?`<small>${esc(x.actual.adaptationReason)}</small>`:''}${x.target?`<em>${esc(x.target)}</em>`:''}</button>`).join('')}</section>`)}return`<aside class="thu2-mod-rail thu3-all-mods"><header><div><span>MODIFIED</span><strong>${cards.length||mods.length} SWIMMERS</strong></div></header><div class="thu3-mod-list">${cards.join('')||'<div class="thu2-mod-same">All modified swimmers match group work in this block.</div>'}</div></aside>`}
  function enhanceBoard(){const host=document.querySelector('#boardView'),session=M.currentSession?.(),mods=UI.modifiedAthletes?.()||[];if(!host||!session)return;const sel=host.querySelector('.thu2-mod-selector');if(sel)sel.innerHTML=`<span>All modified swimmers shown beside group work</span><b>${mods.length}</b>`;for(const grid of host.querySelectorAll('.thu2-block-grid')){const blockId=grid.closest('[data-block-id]')?.dataset.blockId,block=(session.blocks||[]).find(b=>b.id===blockId);if(!block)continue;grid.querySelector('.thu2-mod-rail')?.remove();if(mods.length)grid.insertAdjacentHTML('beforeend',allModsRail(session,block,mods));}host.querySelectorAll('[data-thu3-mod]').forEach(b=>b.onclick=()=>{const [ath,item]=b.dataset.thu3Mod.split(':');M.actions?.openModEdit?.(ath,item)})}
  UI.renderBoard=()=>{boardBase();enhanceBoard()};

  P.contract=()=>({build:P.build,allModifiedVisible:true,storedRoundsRepair:true,tightCycleShape:true,localT400NameFallback:true,localRacePbBridge:true});
  const boot=()=>{repairStoredSessions();UI.renderCurrent?.()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})(globalThis);
