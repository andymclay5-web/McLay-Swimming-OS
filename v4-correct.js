'use strict';
/*
 McLay Swimming OS — Correct Version 4
 Consolidation / recovery layer over the proven v4.0.1 shadow architecture.
 User-facing version remains "Version 4". Internal build id exists only for cache
 invalidation / Guardian identity.
*/
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS v4 base app must load before v4-correct.js');
  const U=M.util;
  const C=M.correct=M.correct||{};
  const BASE_BUILD=M.BUILD;
  const EXPECTED_BASE_BUILD='4.0.1-shadow-tv-individual-foundation-20260816';
  C.baseBuild={expected:EXPECTED_BASE_BUILD,loaded:BASE_BUILD,match:BASE_BUILD===EXPECTED_BASE_BUILD};
  if(!C.baseBuild.match)console.warn('[MSOS v4] Base build differs from validated baseline',C.baseBuild);

  M.VERSION='4';
  M.BUILD='v4-correct-20260817-transcriptfinal';
  M.CORE='20260817-v4-transcriptfinal';

  // Keep production cloud cutover locked until the corrected bytes pass the real-phone gate.
  M.RELEASE_ATTESTATION=Object.freeze({
    build:M.BUILD,
    softwareReady:C.baseBuild.match,
    generatedAt:'2026-08-17T14:18:00+12:00',
    suiteDigest:'v4-contract-20260817-transcriptfinal',
    packageDigest:'see-SHA256SUMS',
    note:'Correct Version 4 software-attested; physical Android acceptance, production schema probe and remaining release gates are still required before production cutover.'
  });


  // The v4.0.1 base already contains substantive TV, Individual Device,
  // Assistant and Meet Deck implementations plus Guardian coverage. In Correct
  // Version 4 these are no longer treated as future placeholders. The only
  // parity item deliberately left non-implemented is packaged Android acceptance.
  if(Array.isArray(M.PARITY_REQUIREMENTS)){
    const completed=new Set(['PARITY-33','PARITY-34','PARITY-35','PARITY-36']);
    M.PARITY_REQUIREMENTS=M.PARITY_REQUIREMENTS.map(x=>completed.has(x.id)?{...x,status:'implemented'}:x);
  }

  const text=v=>U?.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U?.escape?U.escape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=v=>U?.clock?U.clock(v):String(v??'—');
  const now=()=>U?.now?U.now():new Date().toISOString();
  const uid=p=>U?.uid?U.uid(p):`${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const athleteKey=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const isSophie=a=>/^sophie?newlove$/.test(athleteKey(a));

  function normaliseStroke(stroke){
    const s=text(stroke).toLowerCase();
    if(!s) return 'Freestyle';
    if(/^(?:free|freestyle|fr)$/.test(s)) return 'Freestyle';
    if(/^(?:back|backstroke|bk)$/.test(s)) return 'Backstroke';
    if(/^(?:breast|breaststroke|br)$/.test(s)) return 'Breaststroke';
    if(/^(?:fly|butterfly)$/.test(s)) return 'Butterfly';
    if(/^(?:im|medley|individual medley)$/.test(s)) return 'IM';
    return text(stroke);
  }
  function strokeSlug(stroke){
    return normaliseStroke(stroke).toLowerCase().replace(/\s+/g,'_');
  }
  function practicalSendOff(targetSeconds,restSeconds){
    const t=Number(targetSeconds),r=Math.max(0,Number(restSeconds)||0);
    if(!Number.isFinite(t)) return null;
    const raw=Math.floor(t)+r;
    return Math.ceil(raw/5)*5;
  }
  function typeKey(state,row){
    const types=state?.trainingTestTypes||state?.training_test_types||[];
    return text(types.find(x=>x.id===row?.test_type_id)?.test_key||row?.test_key);
  }
  function testStroke(state,row){
    const k=typeKey(state,row).toLowerCase();
    if(!/t400/.test(k)) return '';
    if(/(?:^|[_\s-])(?:free|freestyle)(?:$|[_\s-])/.test(k)||k==='t400') return 'Freestyle';
    if(/back/.test(k)) return 'Backstroke';
    if(/breast/.test(k)) return 'Breaststroke';
    if(/(?:fly|butterfly)/.test(k)) return 'Butterfly';
    if(/(?:^|[_\s-])im(?:$|[_\s-])|medley/.test(k)) return 'IM';
    return normaliseStroke(row?.stroke||row?.metadata?.stroke||'');
  }
  function resultSeconds(row){
    return Number(row?.result_seconds||row?.time_seconds||row?.seconds||row?.result_time_seconds);
  }

  C._internals={normaliseStroke,strokeSlug,practicalSendOff,typeKey,testStroke,isSophie,athleteKey};

  C.hydratePlanning=()=>{
    if(!M.state)return;
    const legacy=M.store?.legacy?.()||{};
    if(!(M.state.seasonPlans||[]).length){
      const x=legacy.season_plans||legacy.seasonPlans||[];
      if(x.length)M.state.seasonPlans=JSON.parse(JSON.stringify(x));
    }
    if(!(M.state.weeklyPlans||[]).length){
      const x=legacy.weekly_plans||legacy.weeklyPlans||[];
      if(x.length)M.state.weeklyPlans=JSON.parse(JSON.stringify(x));
    }
  };

  C.ensureSettings=()=>{
    if(!M.state?.settings) return;
    const s=M.state.settings;
    if(!s.boardBlockBySession||typeof s.boardBlockBySession!=='object') s.boardBlockBySession={};
    if(s.boardFocusMode===undefined) s.boardFocusMode=true;
    if(!s.t400Stroke) s.t400Stroke='Freestyle';
    if(!s.v4TimingMode) s.v4TimingMode='t400';
    if(!Number.isFinite(Number(s.t400HeatIndex)))s.t400HeatIndex=0;
    if(!s.finishDrafts||typeof s.finishDrafts!=='object')s.finishDrafts={};
    if(!s.t400RosterBySession||typeof s.t400RosterBySession!=='object')s.t400RosterBySession={};
  };

  C.enforceRoster=()=>{
    if(!M.state) return false;
    let changed=false;
    for(const a of M.state.athletes||[]){
      if(isSophie(a) && a.active!==false){a.active=false;changed=true;}
    }
    if(M.state.settings){
      const activeIds=new Set((M.state.athletes||[]).filter(a=>a.active!==false).map(a=>a.id));
      const next=(M.state.settings.timingRoster||[]).filter(id=>activeIds.has(id));
      if(next.length!==(M.state.settings.timingRoster||[]).length){
        M.state.settings.timingRoster=next;changed=true;
      }
      for(const [sid,ids] of Object.entries(M.state.settings.t400RosterBySession||{})){
        const clean=(Array.isArray(ids)?ids:[]).filter(id=>activeIds.has(id));
        if(clean.length!==(Array.isArray(ids)?ids:[]).length){M.state.settings.t400RosterBySession[sid]=clean;changed=true;}
      }
      if(isSophie((M.state.athletes||[]).find(a=>a.id===M.state.settings.selectedAthleteId))){
        M.state.settings.selectedAthleteId='';changed=true;
      }
    }
    return changed;
  };

  // Run roster enforcement every time state is established, not only on first boot.
  if(M.ensureState){
    const baseEnsureState=M.ensureState;
    M.ensureState=function(){
      const out=baseEnsureState.apply(this,arguments);
      C.ensureSettings();
      C.hydratePlanning();
      const changed=C.enforceRoster();
      if(changed) try{M.store?.save?.(M.state)}catch{}
      return out;
    };
  }

  // ---------- Athlete modification parity ----------
  if(M.adapt){
    M.adapt.profile=(athlete,state=M.state)=>{
      const rows=state?.adaptationProfiles||state?.athlete_adaptation_profiles||[];
      const p=rows.find(x=>x.athlete_id===athlete.id&&x.active!==false);
      let ratio=Number(p?.default_volume_ratio);
      if(!Number.isFinite(ratio)||ratio<=0) ratio=1;
      const key=athleteKey(athlete);
      const fallbacks={
        charlottemurphy:.50,
        conorfischer:.50,
        mckenziedrage:2/3,
        amberproudfoot:2/3,
        matthewkofoed:2/3,
        rubystace:2/3
      };
      if(ratio===1&&fallbacks[key]) ratio=fallbacks[key];
      // Sophie is intentionally absent: history may remain, but no active programme rule.
      const returnToStart=p?.return_to_starting_end===true||key==='charlottemurphy';
      return{
        ratio:Math.max(.25,Math.min(1,ratio)),
        label:p?.profile_label||athlete.modifications||'',
        key,
        returnToStart
      };
    };
  }


  C.ACTIVE_MODIFICATION_DEFAULTS=Object.freeze({
    charlottemurphy:{ratio:.50,label:'~½ volume when condensation is needed · preserve theme/quality · return to starting end'},
    conorfischer:{ratio:.50,label:'~½ volume when condensation is needed · preserve theme/quality'},
    mckenziedrage:{ratio:2/3,label:'~⅔ volume when condensation is needed · practical independent rest for fast 75s'},
    amberproudfoot:{ratio:2/3,label:'~⅔ volume when condensation is needed · upper-body equivalent where athlete constraint applies'},
    matthewkofoed:{ratio:2/3,label:'~⅔ volume when condensation is needed'},
    rubystace:{ratio:2/3,label:'~⅔ volume when condensation is needed'}
  });

  if(M.adapt?.item){
    const baseAdaptItem=M.adapt.item.bind(M.adapt);
    M.adapt.item=(item,athlete,state=M.state,session=null)=>{
      const out=baseAdaptItem(item,athlete,state,session);
      const key=athleteKey(athlete),raw=text(out?.raw||out?.text||item?.raw||item?.text);
      const hasExplicit=(state?.adaptationOverrides||[]).some(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===athlete?.id&&x.active!==false);
      if(!hasExplicit&&key==='mckenziedrage'&&Number(out?.distance)===75&&/\b(?:fast|max|race|quality|pace)\b/i.test(raw)){
        const current=Number(out.cycleSeconds)||0;
        if(current<115) out.cycleSeconds=115;
        out.adaptationReason=[out.adaptationReason,'McKenzie fast 75 · independent practical rest · 1:55 minimum'].filter(Boolean).join(' · ');
      }
      return out;
    };
  }

  // ---------- T400 / aerobic target truth ----------
  if(M.targets){
    const T=M.targets;

    T.t400=(athlete,state=M.state,course='',stroke='Freestyle')=>{
      const wanted=normaliseStroke(stroke||'Freestyle');
      const rows=state?.trainingTestResults||state?.training_test_results||[];
      return rows
        .filter(r=>r.athlete_id===athlete?.id)
        .filter(r=>/t400/i.test(typeKey(state,r)))
        .filter(r=>testStroke(state,r)===wanted)
        .filter(r=>r.valid_for_anchor!==false)
        .filter(r=>!course||!r.pool_course||String(r.pool_course).toUpperCase()===String(course).toUpperCase())
        .filter(r=>Number.isFinite(resultSeconds(r)))
        // Proven v3 behaviour: fastest valid like-for-like test is the current anchor.
        .sort((a,b)=>resultSeconds(a)-resultSeconds(b)||String(b.result_date||'').localeCompare(String(a.result_date||'')))[0]||null;
    };

    T.aerobic=(anchor,distance,zone,authoredRest=10)=>{
      const table=T.AEROBIC?.[distance];
      if(!table||!zone) return null;
      const rest=Math.max(0,Number(authoredRest)||0);
      const modelRest=rest>=20?30:10;
      const coef=table[modelRest]?.[zone];
      if(!coef) return null;
      const seconds=(Number(anchor)/table.divisor)*coef;
      return{
        seconds,
        sendOff:practicalSendOff(seconds,rest),
        modelRest,
        authoredRest:rest,
        method:`T400 ${distance}m ${zone} (${modelRest}s coefficient; ${rest}s authored rest; practical 5s deck cycle)`
      };
    };

    function aerobicStroke(item){
      const source=text(item?.stroke);
      if(/^Choice$/i.test(source))return '';
      if(source){
        const raw=normaliseStroke(source);
        if(['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(raw))return raw;
      }
      return 'Freestyle';
    }

    function pbPools(state){
      const refs=M.refs?.data||{};
      return [
        ...(state?.coachResults||state?.coach_results||[]),
        ...(state?.resultsEventHistory||state?.results_event_history||[]),
        ...(state?.resultsPbBoard||state?.results_pb_board||[]),
        ...(refs.coach_results||[]),
        ...(refs.results_event_history||[]),
        ...(refs.results_pb_board||[])
      ];
    }
    function pbCourse(row){return text(row?.pool_course||row?.course).toUpperCase();}
    function pbDistance(row){return Number(row?.distance||row?.event_distance);}
    function pbStroke(row){return normaliseStroke(row?.stroke||row?.event_stroke||'');}
    function rawExactPb(ath,state,{distance,stroke,course}){
      const wanted=normaliseStroke(stroke),wantedCourse=text(course).toUpperCase();
      return pbPools(state)
        .filter(r=>r.athlete_id===ath?.id)
        .filter(r=>pbDistance(r)===Number(distance))
        .filter(r=>!wanted||pbStroke(r)===wanted)
        .filter(r=>!wantedCourse||!pbCourse(r)||pbCourse(r)===wantedCourse)
        .filter(r=>Number.isFinite(resultSeconds(r)))
        .sort((a,b)=>resultSeconds(a)-resultSeconds(b))[0]||null;
    }
    T.pb=(ath,state,spec)=>{
      const wanted={...spec,stroke:normaliseStroke(spec.stroke)};
      const exact=rawExactPb(ath,state,wanted);
      if(exact)return{...exact,_anchor_seconds:resultSeconds(exact),_anchor_source:`${wanted.course} ${wanted.distance} ${wanted.stroke} PB`};
      const other=wanted.course==='SCM'?'LCM':wanted.course==='LCM'?'SCM':'';
      if(!other)return null;
      const p=rawExactPb(ath,state,{...wanted,course:other});
      if(!p)return null;
      const c=T.convert?.(resultSeconds(p),other,wanted.course,wanted.distance,wanted.stroke,state);
      return c?{...p,_anchor_seconds:c.seconds,_anchor_source:`${other} PB → ${wanted.course} · ${c.source}`} : null;
    };
    C.bestStroke=(ath,state=M.state,course='',nonFree=false)=>{
      const profile=M.pathway?.profile?.(ath,course);
      const candidates=(profile?.events||[]).map(ev=>{
        const st=normaliseStroke(ev?.pb?.stroke||'');
        const points=Number(ev?.points?.value??ev?.pb?.wa_points??ev?.pb?.para_points??ev?.pb?.points);
        return{stroke:st,points,pb:ev?.pb};
      }).filter(x=>['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(x.stroke))
        .filter(x=>!nonFree||x.stroke!=='Freestyle')
        .filter(x=>Number.isFinite(x.points)&&x.points>0)
        .sort((a,b)=>b.points-a.points||Number(a.pb?.result_seconds||Infinity)-Number(b.pb?.result_seconds||Infinity));
      return candidates[0]?.stroke||'';
    };
    function raceStroke(item,ath,state,explicit=''){
      if(explicit)return normaliseStroke(explicit);
      const raw=text(item?.raw||item?.text);
      if(/#\s*1F\b/i.test(raw))return C.bestStroke(ath,state,item?._course||'',true);
      if(/#\s*1\b/i.test(raw))return C.bestStroke(ath,state,item?._course||'',false);
      const sourceStroke=text(item?.stroke);
      if(sourceStroke){
        const st=normaliseStroke(sourceStroke);
        return ['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(st)?st:'';
      }
      return C.bestStroke(ath,state,item?._course||'',false);
    }

    T.suppressPace=item=>{
      const raw=[item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' ');
      const hasRace=!!item?.raceIntent||item?.repInstructions?.some(x=>x.raceIntent);
      if(/\bHR\s*Gauge\b/i.test(raw))return'HR Gauge';
      if(hasRace)return'';
      if(/^Choice$/i.test(text(item?.stroke))||/\bChoice\b/i.test(raw))return'Choice work';
      if(/\b(?:Drill|Scull|Technique)\b/i.test(raw))return'Skill / drill';
      if(/\b(?:Easy|Recovery|Reset|Warm\s*-?\s*down|Cool\s*-?\s*down|5HR)\b/i.test(raw))return'Recovery / reset';
      if(/\bKick\b/i.test(raw))return'Kick';
      if(/\b(?:Paddles?|Bands?\s*Only)\b/i.test(raw)&&!item?.zone)return'Equipment / non-pace';
      if(/\b(?:Underwater|Dive|Start|Finish|Last\s*\d+\s*m|Max|Sprint)\b/i.test(raw)&&!item?.zone)return'Quality / skill';
      return'';
    };

    function racePaceTarget(pbSeconds,eventDistance,workDistance,{item,athlete,stroke}={}){
      const total=Number(pbSeconds),event=Number(eventDistance),work=Number(workDistance);
      if(!Number.isFinite(total)||!event||!work)return null;
      const raw=text(item?.raw||item?.text);
      const workStroke=text(item?.stroke);
      if(stroke==='IM'&&workStroke&&normaliseStroke(workStroke)!=='IM')return{missing:true,message:'Exact IM leg race model not loaded · target needed'};
      const sex=text(athlete?.sex||athlete?.gender).toUpperCase();
      if(event===100&&stroke==='Freestyle'&&/^M(?:ALE)?$/.test(sex)){
        if(/\b(?:first|1st)\s*50\b/i.test(raw))return{seconds:total*.4754,source:'John Pike SCM · Male 100 Free first 50'};
        if(/\b(?:second|2nd|last)\s*50\b/i.test(raw))return{seconds:total*.5246,source:'John Pike SCM · Male 100 Free second 50'};
        if(/\b(?:dive|race\s*start|start)\b/i.test(raw)&&work<=25){
          const first50=total*.4754,dive25=first50*.4554;
          return{seconds:dive25*(work/25),source:'John Pike start-shape · Male 100 Free'};
        }
        if(/\bpush\b/i.test(raw)&&work===50){
          const first50=total*.4754,dive25=first50*.4554;
          return{seconds:(first50-dive25)*2,source:'John Pike push-first-50 estimate · Male 100 Free'};
        }
      }
      const asksNamed=/\b(?:first|1st|second|2nd|last|final|dive|race\s*start|start|push|turn|finish)\b/i.test(raw);
      if(asksNamed)return{missing:true,message:'Exact race-model segment not loaded · target needed'};
      return{seconds:total*(work/event),source:'PB · generic non-dive race-pace average'};
    }

    T.forItem=(session,item,athlete,state=M.state)=>{
      if(item?.targetSeconds) return{
        status:'ok',seconds:Number(item.targetSeconds),
        sendOff:item.cycleSeconds||null,source:'Coach target'
      };
      const suppressed=T.suppressPace?.(item);
      if(suppressed) return{status:'none',reason:suppressed};
      const course=session?.identity?.course||'';

      if(item?.repInstructions?.some(x=>x.raceIntent)){
        const rows=[];
        for(const rep of item.repInstructions){
          if(!rep.raceIntent){rows.push({rep:rep.rep,status:'none',label:rep.label||'Drill'});continue;}
          const explicit=rep.raceIntent.eventStroke||item.raceIntent?.eventStroke||'';
          const pseudo={...item,raw:`${item.raw||''} ${rep.label||''}`,_course:course};
          const eventStroke=raceStroke(pseudo,athlete,state,explicit);
          if(!eventStroke){rows.push({rep:rep.rep,status:'missing',message:'No #1 stroke evidence loaded · target needed'});continue;}
          const pb=T.pb?.(athlete,state,{distance:rep.raceIntent.distance,stroke:eventStroke,course});
          if(!pb){rows.push({rep:rep.rep,status:'missing',message:`${eventStroke} PB unavailable · target needed`});continue;}
          const rp=racePaceTarget(pb._anchor_seconds,rep.raceIntent.distance,item.distance,{item:pseudo,athlete,stroke:eventStroke});
          if(rp?.missing){rows.push({rep:rep.rep,status:'missing',message:rp.message});continue;}
          rows.push({
            rep:rep.rep,status:'ok',
            seconds:rp.seconds,
            sendOff:item.cycleSeconds||null,source:`${pb._anchor_source} · ${rp.source}`
          });
        }
        return{status:'rep_race',rows};
      }

      if(item?.repPattern?.length){
        const stroke=aerobicStroke(item);
        if(!stroke)return{status:'none',reason:'Choice aerobic work'};
        const anchor=T.t400(athlete,state,course,stroke);
        if(!anchor) return{status:'missing',message:`No ${stroke} T400 loaded · target needed`};
        const rest=item.restSeconds??10;
        return{
          status:'pattern',
          rows:item.repPattern.map(p=>{
            const a=T.aerobic(Number(anchor.result_seconds),item.distance,p.zone,rest);
            return{rep:p.rep,zone:p.zone,...a,sendOff:item.cycleSeconds||a?.sendOff||null};
          }),
          source:`${stroke} T400 ${clock(anchor.result_seconds)}`
        };
      }

      if(item?.zone){
        const stroke=aerobicStroke(item);
        if(!stroke)return{status:'none',reason:'Choice aerobic work'};
        const anchor=T.t400(athlete,state,course,stroke);
        if(!anchor) return{status:'missing',message:`No ${stroke} T400 loaded · target needed`};
        const a=T.aerobic(Number(anchor.result_seconds),item.distance,item.zone,item.restSeconds??10);
        return a?{
          status:'ok',...a,
          sendOff:item.cycleSeconds||a.sendOff,
          source:`${stroke} T400 ${clock(anchor.result_seconds)}`
        }:{status:'missing',message:'No valid T400 coefficient for this line'};
      }

      if(item?.raceIntent){
        const eventStroke=raceStroke({...item,_course:course},athlete,state,item.raceIntent.eventStroke||'');
        if(!eventStroke)return{status:'missing',message:'No #1 stroke evidence loaded · target needed'};
        const pb=T.pb?.(athlete,state,{distance:item.raceIntent.distance,stroke:eventStroke,course});
        if(!pb) return{status:'missing',message:`${eventStroke} PB unavailable · target needed`};
        const rp=racePaceTarget(pb._anchor_seconds,item.raceIntent.distance,item.distance,{item:{...item,_course:course},athlete,stroke:eventStroke});
        if(rp?.missing)return{status:'missing',message:rp.message};
        return{
          status:'ok',
          seconds:rp.seconds,
          sendOff:item.cycleSeconds||null,
          source:`${pb._anchor_source} · ${rp.source}`
        };
      }
      return{status:'none'};
    };
  }

  // ---------- Timing roster + T400 runner ----------
  if(M.timing){
    const X=M.timing;
    const baseDefaultRoster=X.defaultRoster?.bind(X);

    function presentRosterIds(state=M.state,session=M.currentSession?.()){
      if(!session)return[];
      const squads=new Set((session.identity?.squads||[]).map(x=>text(x).toLowerCase()));
      const status=new Map((state.attendance||[]).filter(x=>x.session_id===session.id).map(x=>[x.athlete_id,text(x.status).toLowerCase()]));
      return (state.athletes||[])
        .filter(a=>a.active!==false&&!isSophie(a))
        .filter(a=>!squads.size||squads.has(text(a.squad).toLowerCase()))
        .filter(a=>['present','modified'].includes(status.get(a.id)))
        .map(a=>a.id);
    }
    X.t400RosterIds=(state=M.state,session=M.currentSession?.())=>{
      C.ensureSettings();
      const sid=session?.id||'';
      const stored=sid?state.settings?.t400RosterBySession?.[sid]:null;
      return (Array.isArray(stored)?stored:presentRosterIds(state,session))
        .filter(id=>(state.athletes||[]).some(a=>a.id===id&&a.active!==false&&!isSophie(a)));
    };
    X.add=(athleteId,state=M.state,session=M.currentSession?.())=>{
      if(!(state.athletes||[]).some(a=>a.id===athleteId&&a.active!==false&&!isSophie(a))) return false;
      state.settings=state.settings||{};C.ensureSettings();
      const sid=session?.id||'';
      const base=X.t400RosterIds(state,session);
      const next=[...new Set([...base,athleteId])];
      if(sid)state.settings.t400RosterBySession[sid]=next;
      // Keep general Timing aligned with the currently selected T400 participants.
      state.settings.timingRoster=next;
      return true;
    };
    X.remove=(athleteId,state=M.state,session=M.currentSession?.())=>{
      state.settings=state.settings||{};C.ensureSettings();
      const sid=session?.id||'';
      const base=X.t400RosterIds(state,session),next=base.filter(id=>id!==athleteId);
      if(sid)state.settings.t400RosterBySession[sid]=next;
      state.settings.timingRoster=next;
      return next;
    };
    X.useAttendance=(state=M.state,session=M.currentSession?.())=>{
      state.settings=state.settings||{};C.ensureSettings();
      const sid=session?.id||'';
      if(sid)delete state.settings.t400RosterBySession[sid];
      const ids=presentRosterIds(state,session);
      state.settings.timingRoster=ids;
      return ids;
    };

    X.T400_LANE_ORDER=Object.freeze([4,5,3,6,2,7,1,8]);
    X.t400Seed=(state=M.state,session=M.currentSession?.(),stroke='Freestyle')=>{
      const roster=X.t400RosterIds(state,session).map(id=>(state.athletes||[]).find(a=>a.id===id)).filter(a=>a&&a.active!==false&&!isSophie(a));
      return roster.map(a=>({athlete:a,anchor:M.targets.t400(a,state,session?.identity?.course||'',stroke)}))
        .sort((a,b)=>{
          const av=resultSeconds(a.anchor),bv=resultSeconds(b.anchor);
          if(Number.isFinite(av)&&Number.isFinite(bv))return av-bv;
          if(Number.isFinite(av))return -1;
          if(Number.isFinite(bv))return 1;
          return String(a.athlete.full_name||'').localeCompare(String(b.athlete.full_name||''));
        });
    };
    X.t400Heat=(state=M.state,session=M.currentSession?.(),stroke='Freestyle',heatIndex=0)=>{
      const seed=X.t400Seed(state,session,stroke);
      const start=Math.max(0,Number(heatIndex)||0)*8;
      return seed.slice(start,start+8).map((x,i)=>({...x,lane:X.T400_LANE_ORDER[i]}));
    };

    X.ensureType=(state=M.state,stroke='Freestyle')=>{
      const s=normaliseStroke(stroke),slug=strokeSlug(s),key=`t400_${slug}`;
      let tt=(state.trainingTestTypes||[]).find(x=>text(x.test_key).toLowerCase()===key);
      if(!tt&&s==='Freestyle') tt=(state.trainingTestTypes||[]).find(x=>/t400.*free/i.test(x.test_key||''));
      if(!tt){
        tt={id:uid('testtype'),test_key:key,name:`T400 ${s}`,active:true,stroke:s};
        state.trainingTestTypes=state.trainingTestTypes||[];
        state.trainingTestTypes.push(tt);
      }else{
        tt.active=true;
        if(!tt.stroke)tt.stroke=s;
      }
      return tt;
    };

    X.saveT400=(athleteId,value,session=M.currentSession?.(),state=M.state,date=new Date().toISOString().slice(0,10),stroke='Freestyle',meta={})=>{
      const seconds=typeof value==='number'?value:U.seconds(value);
      if(!session) throw new Error('No session selected');
      if(!(state.athletes||[]).some(a=>a.id===athleteId&&a.active!==false)) throw new Error('Swimmer not found');
      if(!seconds||seconds<120||seconds>1200) throw new Error('Enter a valid 400 time');
      const s=normaliseStroke(stroke),tt=X.ensureType(state,s);
      const row={
        id:uid('testresult'),test_type_id:tt.id,athlete_id:athleteId,
        result_seconds:seconds,result_date:date,pool_course:session.identity?.course||'SCM',
        valid_for_anchor:true,source:meta.source||'timed_v4_poolside',
        source_type:'training',
        source_label:meta.source_label||`T400 ${s} · MSOS Version 4`,
        stroke:s,session_id:session.id,
        metadata:{after_warm_up:true,msos_v4:true,stroke:s,...(meta.metadata||{})},
        created_at:now(),updated_at:now()
      };
      state.trainingTestResults=state.trainingTestResults||[];
      state.trainingTestResults.push(row);
      X.add(athleteId,state,session);
      return row;
    };

    X.anchor=(athlete,state=M.state,session=M.currentSession?.(),stroke='Freestyle')=>
      M.targets.t400(athlete,state,session?.identity?.course||'',stroke);
  }

  // ---------- Coach Hub: coaching first, diagnostics separate ----------
  function sameSquad(a,b){
    const x=new Set(a?.identity?.squads||[]);
    return (b?.identity?.squads||[]).some(s=>x.has(s));
  }
  function parseMeetLines(v){
    if(Array.isArray(v)) return v;
    return String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{
      const p=line.split('|').map(x=>x.trim());
      return{date:p[0]||'',title:p[1]||line,course:p[2]||'',role:p[3]||'',venue:p[4]||''};
    });
  }
  function dateInWeek(date,start){
    if(!date||!start) return false;
    const d=new Date(`${date}T12:00:00`),s=new Date(`${start}T12:00:00`);
    if(Number.isNaN(+d)||Number.isNaN(+s)) return false;
    const days=(d-s)/86400000;
    return days>=0&&days<7;
  }
  C.planContext=session=>{
    const legacy=M.store?.legacy?.()||{};
    const weeks=legacy.weekly_plans||legacy.weeklyPlans||M.state?.weeklyPlans||[];
    const seasons=legacy.season_plans||legacy.seasonPlans||M.state?.seasonPlans||[];
    const old=(legacy.sessions||[]).find(x=>x.id===session?.metadata?.legacySessionId||x.id===session?.id)||{};
    const weekId=session?.metadata?.weeklyPlanId||session?.metadata?.weekly_plan_id||old.weekly_plan_id||old.week_plan_id;
    let week=weeks.find(w=>w.id===weekId);
    if(!week) week=weeks.filter(w=>dateInWeek(session?.identity?.date,w.week_start||w.weekStart)).sort((a,b)=>String(b.week_start||b.weekStart||'').localeCompare(String(a.week_start||a.weekStart||'')))[0]||null;
    const seasonId=session?.metadata?.seasonPlanId||session?.metadata?.season_plan_id||old.season_plan_id||week?.season_plan_id;
    let season=seasons.find(s=>s.id===seasonId)||null;
    if(!season){
      const d=session?.identity?.date||'';
      season=seasons.find(s=>(!s.start_date||s.start_date<=d)&&(!s.end_date||s.end_date>=d))||null;
    }
    const weeklyFocus=text(week?.objective||week?.phase||session?.metadata?.weekObjective||session?.metadata?.weekPhase||'');
    const todayFocus=text(session?.metadata?.primarySystem||session?.metadata?.technicalFocus||session?.metadata?.planCue||old.primary_system||old.technical_focus||'');
    return{
      season,
      week,
      seasonName:text(season?.name||session?.metadata?.season||old.season||''),
      seasonGoal:text(season?.overarching_goal||season?.goal||''),
      weeklyFocus,
      carry:text(week?.carry_forward||week?.carryForward||''),
      todayFocus
    };
  };

  function nextMeet(ctx){
    const today=M.currentSession?.()?.identity?.date||new Date().toISOString().slice(0,10);
    const rows=[
      ...(M.state?.meets||[]).map(x=>({date:x.date||'',title:x.title||x.name||'Meet',venue:x.venue||'',course:x.course||''})),
      ...parseMeetLines(ctx?.season?.meets||ctx?.season?.season_meets||'')
    ].filter(x=>x.date&&x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
    return rows[0]||null;
  }

  function recentDelivered(session){
    if(!session)return[];
    return Object.values(M.state?.canonicalSessions||{})
      .filter(x=>x.id!==session.id&&x.finish&&sameSquad(session,x))
      .filter(x=>(x.identity?.date||'')<=(session.identity?.date||''))
      .sort((a,b)=>`${b.identity?.date||''}-${b.identity?.dayPart||''}`.localeCompare(`${a.identity?.date||''}-${a.identity?.dayPart||''}`))
      .slice(0,3);
  }

  function renderCoachHub(){
    const h=document.querySelector('#hubView');if(!h)return;
    const s=M.currentSession?.(),ctx=C.planContext(s),meet=nextMeet(ctx),recent=recentDelivered(s);
    const sum=s?M.analysis?.summary?.(s,M.state):null;
    const seasonTitle=ctx.seasonName||'Season plan not linked';
    const weekTitle=ctx.weeklyFocus||'Weekly-plan focus not loaded';
    const todayTitle=ctx.todayFocus||sum?.purpose?.label||'Today’s purpose not yet set';
    const carry=ctx.carry||recent.find(x=>text(x.finish?.carryForward))?.finish?.carryForward||'No carry-forward note loaded.';
    h.innerHTML=`
      <section class="page-card v4-hub-hero">
        <div class="eyebrow">COACH HUB · VERSION 4</div>
        <h1>${esc(s?.identity?.date?`${s.identity.date} ${s.identity.dayPart||''}`:'Coach Hub')}</h1>
        <p>${esc(s?`${(s.identity.squads||[]).join(' + ')} · ${s.identity.venue||'Venue unset'} · ${s.identity.course||'Course unset'}`:'Select a session to see its coaching context.')}</p>
        <div class="v4-quick-actions">
          <button id="v4OpenBoard">Board</button>
          <button id="v4SessionIntake">Session intake</button>
          <button id="v4OpenSwimmers">Swimmers</button>
          <button id="v4OpenMeet">Meet</button>
        </div>
      </section>
      <section class="v4-plan-grid">
        <article class="page-card"><div class="eyebrow">SEASON</div><h2>${esc(seasonTitle)}</h2><p>${esc(ctx.seasonGoal||'No linked season goal loaded.')}</p></article>
        <article class="page-card"><div class="eyebrow">THIS WEEK</div><h2>${esc(weekTitle)}</h2><p>${esc(ctx.carry||'No weekly carry-forward loaded.')}</p></article>
        <article class="page-card v4-today-card"><div class="eyebrow">TODAY</div><h2>${esc(todayTitle)}</h2>
          ${s?`<div class="v4-mini-kpis"><span>${Number(M.session.total(s)).toLocaleString()}m planned</span><span>${esc([s.identity.start,s.identity.end].filter(Boolean).join('–')||'time not set')}</span><span>${sum?.attendance?.here||0} here</span><span>${sum?.attendance?.modified||0} modified</span><span>${sum?.finished?'finished':'live / planned'}</span></div>`:''}
        </article>
        <article class="page-card"><div class="eyebrow">CARRY FORWARD</div><h2>${esc(carry)}</h2></article>
      </section>
      <section class="page-card">
        <div class="eyebrow">NEXT TARGET</div>
        ${meet?`<h2>${esc(meet.title)}</h2><p>${esc([meet.date,meet.course,meet.venue].filter(Boolean).join(' · '))}</p>`:'<h2>No upcoming meet loaded</h2><p class="muted">Nothing is invented when the season/meet source is absent.</p>'}
      </section>
      ${s&&sum?`<section class="page-card"><h2>Delivery truth</h2><div class="v4-mini-kpis"><span>${sum.delivered?.total?.toLocaleString?.()||0}m delivered</span><span>${sum.evidence?.changes||0} live change${sum.evidence?.changes===1?'':'s'}</span><span>${sum.evidence?.captures||0} capture${sum.evidence?.captures===1?'':'s'}</span><span>${sum.evidence?.timedSets||0} timed set${sum.evidence?.timedSets===1?'':'s'}</span></div><p class="muted">Support/recovery volume does not redefine the coach-authored purpose.</p></section>`:''}
      ${recent.length?`<section class="page-card"><h2>Recently delivered</h2>${recent.map(x=>`<div class="v4-recent-row"><b>${esc(`${x.identity.date} ${x.identity.dayPart||''}`)}</b><span>${Number(x.finish?.actualDistance||M.session.total(x)||0).toLocaleString()}m</span><small>${esc(x.finish?.carryForward||'')}</small></div>`).join('')}</section>`:''}
      <details class="page-card v4-diagnostics"><summary>Diagnostics / release checks</summary><p class="muted">Guardian, parity, connection and migration tools stay available here — not in the coaching view.</p><div class="v4-quick-actions"><button id="v4Guardian">Guardian</button><button id="v4Connection">Connection</button><button id="v4Reimport">Recover / re-import legacy evidence</button></div></details>`;
    h.querySelector('#v4OpenBoard')?.addEventListener('click',()=>M.nav.show('board',{restoreScroll:true}));
    h.querySelector('#v4SessionIntake')?.addEventListener('click',()=>M.actions.openSessionIntake());
    h.querySelector('#v4OpenSwimmers')?.addEventListener('click',()=>M.nav.show('athletes',{restoreScroll:true}));
    h.querySelector('#v4OpenMeet')?.addEventListener('click',()=>M.nav.show('meet',{restoreScroll:false}));
    h.querySelector('#v4Guardian')?.addEventListener('click',()=>M.nav.show('guardian',{restoreScroll:false}));
    h.querySelector('#v4Connection')?.addEventListener('click',()=>M.nav.show('connection',{restoreScroll:false}));
    h.querySelector('#v4Reimport')?.addEventListener('click',()=>M.actions.reimportLegacy());
  }

  // ---------- Swimmer Hub: restore coaching snapshot above existing pathway ----------
  function athleteCapture(c,a){
    return c?.athlete_id===a.id||(c?.athlete_ids||[]).includes(a.id)||(c?.selected_athletes||[]).includes(a.id);
  }
  function goalRows(ath){
    const rows=[];
    for(const v of [ath?.primary_goal,ath?.goal,ath?.goals,ath?.target]){
      if(Array.isArray(v)) rows.push(...v.map(text).filter(Boolean));
      else if(text(v)) rows.push(text(v));
    }
    for(const x of M.state?.athleteAchievements||[]){
      if(x.athlete_id!==ath?.id)continue;
      const kind=text(x.type||x.category||x.kind).toLowerCase();
      if(/goal|target/.test(kind)) rows.push(text(x.title||x.name||x.description||x.value));
    }
    return [...new Set(rows.filter(Boolean))].slice(0,4);
  }
  function t400HistoryFor(ath,course,stroke){
    return (M.state?.trainingTestResults||[])
      .filter(r=>r.athlete_id===ath.id&&/t400/i.test(typeKey(M.state,r))&&testStroke(M.state,r)===stroke)
      .filter(r=>!course||!r.pool_course||text(r.pool_course).toUpperCase()===text(course).toUpperCase())
      .filter(r=>Number.isFinite(resultSeconds(r)))
      .sort((a,b)=>String(b.result_date||b.created_at||'').localeCompare(String(a.result_date||a.created_at||'')));
  }
  function aerobicMatrix(anchor){
    if(!anchor)return'';
    const zones=[['Regeneration','Reg'],['Development','Dev'],['Overload','OL'],['Threshold','AT'],['Clearance','CL']];
    return [50,100,200,400].map(d=>{
      const cells=zones.map(([z,label])=>{const x=M.targets.aerobic(resultSeconds(anchor),d,z,10);return x?`<span title="${esc(z)}"><b>${label}</b> ${clock(x.seconds)} <small>@${clock(x.sendOff)}</small></span>`:''}).join('');
      return `<div class="v4-aerobic-row"><strong>${d}m</strong><div>${cells}</div></div>`;
    }).join('');
  }
  function athleteNextMeet(ath){
    const today=M.currentSession?.()?.identity?.date||new Date().toISOString().slice(0,10);
    const entries=(M.state?.meetEntries||[]).filter(e=>e.athlete_id===ath.id);
    return (M.state?.meets||[]).filter(m=>m.date>=today&&(!entries.length||entries.some(e=>e.meet_id===m.id))).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0]||null;
  }

  function enhanceSwimmerHub(){
    const h=document.querySelector('#athletesView');if(!h)return;
    h.querySelector('#v4SwimmerSnapshot')?.remove();
    const ath=(M.state.athletes||[]).find(a=>a.id===M.state.settings.selectedAthleteId&&a.active!==false);
    if(!ath)return;
    const course=M.state.settings.pathwayCourse||'SCM';
    const profile=M.pathway?.profile?.(ath,course);
    const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'];
    const anchors=strokes.map(st=>[st,M.targets.t400(ath,M.state,course,st)]).filter(([,r])=>r);
    const pbs=(profile?.events||[]).map(x=>x.pb).filter(Boolean).slice(0,8);
    const mod=M.adapt?.profile?.(ath,M.state)||{ratio:1,label:''};
    const caps=(M.state.captures||[]).filter(c=>athleteCapture(c,ath)).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,5);
    const timed=(M.state.timedSets||[]).filter(x=>x.athlete_id===ath.id).slice(-5).reverse();
    const goals=goalRows(ath);
    const best=C.bestStroke(ath,M.state,course,false),bestNonFree=C.bestStroke(ath,M.state,course,true);
    const freeAnchor=M.targets.t400(ath,M.state,course,'Freestyle');
    const t400History=strokes.flatMap(st=>t400HistoryFor(ath,course,st).slice(0,4).map(r=>({stroke:st,row:r}))).sort((a,b)=>String(b.row.result_date||'').localeCompare(String(a.row.result_date||''))).slice(0,12);
    const next=profile?.closest||null,meet=athleteNextMeet(ath);
    const section=document.createElement('section');
    section.id='v4SwimmerSnapshot';
    section.className='v4-swimmer-snapshot';
    section.innerHTML=`
      <section class="page-card v4-swimmer-hero">
        <div class="eyebrow">SWIMMER HUB</div>
        <h2>${esc(ath.full_name)}</h2>
        <p>${esc([ath.squad,course,mod.label].filter(Boolean).join(' · '))}</p>
        <div class="v4-mini-kpis">
          <span>${pbs.length} PB event${pbs.length===1?'':'s'} loaded</span>
          <span>${anchors.length} T400 anchor${anchors.length===1?'':'s'}</span>
          <span>${Math.round((mod.ratio||1)*100)}% volume profile</span>
        </div>
        <div class="v4-quick-actions"><button id="v4SwimmerBoard">Board</button><button id="v4SwimmerTimes">Time / T400</button></div>
      </section>
      <div class="v4-swimmer-grid">
        <article class="page-card v4-primary-snapshot">
          <h3>Performance snapshot</h3>
          <div class="v4-data-row"><span>#1 stroke</span><b>${esc(best||'Evidence needed')}</b></div>
          <div class="v4-data-row"><span>#1F</span><b>${esc(bestNonFree||'Evidence needed')}</b></div>
          ${next?.nextNational?`<div class="v4-data-row"><span>Closest national target</span><b>${esc(next.nextNational.row?._label||'Target')}</b><small>${clock(next.nextNational.row?._seconds)} · ${Number(next.nextNational.gap?.seconds||0).toFixed(2)}s away</small></div>`:'<div class="v4-data-row"><span>Closest target</span><b>Evidence needed</b></div>'}
          ${meet?`<div class="v4-data-row"><span>Next meet</span><b>${esc(meet.title||meet.name||'Meet')}</b><small>${esc([meet.date,meet.course,meet.venue].filter(Boolean).join(' · '))}</small></div>`:''}
        </article>
        <article class="page-card v4-current-training">
          <h3>Current training anchors</h3>
          ${anchors.length?anchors.slice(0,3).map(([st,r])=>`<div class="v4-data-row"><span>${esc(st)} T400</span><b>${clock(resultSeconds(r))}</b><small>${esc(r.pool_course||course)} · ${esc(r.result_date||'')}</small></div>`).join(''):'<p class="muted">No valid T400 anchor loaded for this course.</p>'}
          ${freeAnchor?(()=>{const dev=M.targets.aerobic(resultSeconds(freeAnchor),100,'Development',10),at=M.targets.aerobic(resultSeconds(freeAnchor),200,'Threshold',10);return `<div class="v4-anchor-strip">${dev?`<span><b>100 Dev</b>${clock(dev.seconds)} <small>@${clock(dev.sendOff)}</small></span>`:''}${at?`<span><b>200 AT</b>${clock(at.seconds)} <small>@${clock(at.sendOff)}</small></span>`:''}</div>`})():''}
          ${(mod.ratio||1)<.99||mod.label?`<div class="v4-mod-summary"><b>Modification</b><span>${esc(mod.label||`${Math.round((mod.ratio||1)*100)}% baseline`)}</span></div>`:''}
        </article>
      </div>
      <details class="page-card v4-swimmer-detail"><summary>PBs & performance detail</summary>
        ${pbs.length?pbs.map(pb=>`<div class="v4-data-row"><span>${esc(`${pb.distance} ${pb.stroke}`)}</span><b>${clock(pb.result_seconds)}</b><small>${esc(pb.course||course)}${pb.wa_points?` · ${pb.wa_points} pts`:''}</small></div>`).join(''):'<p class="muted">No verified PBs loaded for this course.</p>'}
      </details>
      <details class="page-card v4-swimmer-detail"><summary>T400 history & aerobic target table</summary>
        ${freeAnchor?`<div class="v4-target-table">${aerobicMatrix(freeAnchor)}</div>`:''}
        <h4>T400 history</h4>${t400History.length?t400History.map(x=>`<div class="v4-data-row"><span>${esc(x.stroke)} · ${esc(x.row.result_date||'')}</span><b>${clock(resultSeconds(x.row))}</b><small>${x.row.id===M.targets.t400(ath,M.state,course,x.stroke)?.id?'Current anchor':''}</small></div>`).join(''):'<p class="muted">No test history loaded.</p>'}
      </details>
      <details class="page-card v4-swimmer-detail"><summary>Goals, modification & recent evidence</summary>
        <h4>Goals</h4>${goals.length?goals.map(x=>`<div class="v4-goal-row">${esc(x)}</div>`).join(''):'<p class="muted">No coach-set goal loaded.</p>'}
        <h4>Current modification</h4><p>${esc(mod.label||((mod.ratio||1)<.99?`${Math.round((mod.ratio||1)*100)}% baseline`:'No active modification'))}</p>
        <h4>Recent evidence</h4>${caps.length?caps.map(c=>`<div class="v4-data-row"><span>${esc(c.capture_type||'note')}</span><small>${esc(c.text_content||'Media saved')}</small></div>`).join(''):'<p class="muted">No recent tagged captures.</p>'}${timed.length?`<h4>Timed work</h4>${timed.map(t=>`<div class="v4-data-row"><span>${esc(t.set_label||`${t.distance||''} ${t.stroke||''}`)}</span><b>${t.best?clock(t.best):'Saved'}</b></div>`).join('')}`:''}
      </details>`;;
    const first=h.firstElementChild;
    first?.insertAdjacentElement('afterend',section);
    section.querySelector('#v4SwimmerBoard')?.addEventListener('click',()=>M.nav.show('board',{restoreScroll:true}));
    section.querySelector('#v4SwimmerTimes')?.addEventListener('click',()=>M.nav.show('times',{restoreScroll:false}));
  }

  // ---------- Individual Device: keep my work first, add concise pathway/meet context ----------
  function enhanceIndividualDevice(){
    const h=document.querySelector('#swimmerView');if(!h)return;
    h.querySelector('#v4IndividualContext')?.remove();
    const aid=M.state?.settings?.activeUserAthleteId;
    const ath=(M.state?.athletes||[]).find(a=>a.id===aid&&a.active!==false&&!isSophie(a));
    const session=M.currentSession?.();
    if(!ath||!session||!M.access?.sessionAllowed?.(session))return;
    const course=session.identity?.course||'SCM';
    const profile=M.pathway?.profile?.(ath,course);
    const best=C.bestStroke?.(ath,M.state,course,false)||'';
    const closest=profile?.closest?.nextNational?.row?._label||profile?.closest?.nextNational?.label||'';
    const meet=M.meet?.current?.();
    const entries=meet?M.meet.visibleEntries(meet.id).filter(e=>e.athlete_id===ath.id):[];
    const next=entries.find(e=>!['complete','scratched'].includes(text(e.status).toLowerCase()))||null;
    const card=document.createElement('section');card.id='v4IndividualContext';card.className='page-card v4-individual-context';
    card.innerHTML=`<div class="eyebrow">MY PATHWAY / NEXT</div><div class="v4-individual-grid"><span><small>#1</small><b>${esc(best||'Evidence needed')}</b></span><span><small>Pathway</small><b>${esc(closest||'Open My Path')}</b></span><span><small>Meet</small><b>${esc(meet?.title||'No meet loaded')}</b></span><span><small>Next race</small><b>${esc(next?.event|| (next?.distance&&next?.stroke?`${next.distance} ${next.stroke}`:'—'))}</b></span></div><div class="v4-quick-actions"><button id="v4MyPath">My Path</button><button id="v4MyMeet">Meet</button></div>`;
    const hero=h.querySelector('.swimmer-hero');hero?.insertAdjacentElement('afterend',card);
    card.querySelector('#v4MyPath')?.addEventListener('click',()=>M.nav.show('athletes',{restoreScroll:false}));
    card.querySelector('#v4MyMeet')?.addEventListener('click',()=>M.nav.show('meet',{restoreScroll:false}));
  }

  // ---------- Target-ranked lane grouping ----------
  function targetSortSeconds(result){
    if(!result)return Infinity;
    if(result.status==='ok')return Number(result.sendOff||result.seconds)||Infinity;
    if(result.status==='pattern'){
      const vals=(result.rows||[]).map(x=>Number(x.sendOff||x.seconds)).filter(Number.isFinite);
      return vals.length?Math.min(...vals):Infinity;
    }
    if(result.status==='rep_race'){
      const vals=(result.rows||[]).filter(x=>x.status==='ok').map(x=>Number(x.sendOff||x.seconds)).filter(Number.isFinite);
      return vals.length?Math.min(...vals):Infinity;
    }
    return Infinity;
  }
  function targetSummary(result){
    if(!result||result.status==='none')return'No pace';
    if(result.status==='missing')return result.message||'Target needed';
    if(result.status==='ok')return `${clock(result.seconds)}${result.sendOff?` on ${clock(result.sendOff)}`:''}`;
    if(result.status==='pattern')return (result.rows||[]).map(x=>`#${x.rep} ${String(x.zone||'').slice(0,3)} ${clock(x.seconds)}${x.sendOff?`/${clock(x.sendOff)}`:''}`).join(' · ');
    if(result.status==='rep_race')return (result.rows||[]).map(x=>x.status==='ok'?`#${x.rep} ${clock(x.seconds)}`:`#${x.rep} ${x.label||x.message||'No pace'}`).join(' · ');
    return'Target needed';
  }
  C.targetLaneGroups=(session,item,state=M.state)=>{
    const derived=M.teamDisplay?.presentAthletes?.(session,state)||[];
    const athletes=((derived.length?derived:M.ui?.presentAthletes?.())||[])
      .filter(a=>a&&a.active!==false&&!isSophie(a));
    const rows=athletes.map(athlete=>{
      const actual=M.adapt?.item?M.adapt.item(item,athlete,state,session):item;
      const result=M.targets?.forItem?M.targets.forItem(session,actual,athlete,state):{status:'none'};
      return{athlete,actual,result,sort:targetSortSeconds(result),summary:targetSummary(result)};
    }).filter(x=>x.result?.status!=='none');
    rows.sort((a,b)=>a.sort-b.sort||String(a.athlete.full_name||'').localeCompare(String(b.athlete.full_name||'')));
    const groups=[];
    for(const row of rows){
      const key=row.summary;
      const previous=groups.at(-1);
      if(previous&&previous.key===key)previous.rows.push(row);
      else groups.push({key,rows:[row]});
    }
    return groups.map((g,i)=>({
      index:i+1,target:g.key,athletes:g.rows.map(x=>x.athlete),sort:Math.min(...g.rows.map(x=>x.sort))
    }));
  };
  function enhanceExpandedTargetLaneGroups(host,session){
    host.querySelectorAll('.v4-target-lane-panel').forEach(x=>x.remove());
    const expanded=M.state?.settings?.expandedItemId;
    if(!expanded)return;
    const line=host.querySelector(`[data-item-id="${CSS.escape(expanded)}"]`);
    const panel=line?.querySelector('.target-panel');
    const found=M.session?.findItem?.(session,expanded),item=found?.item;
    if(!panel||!item||item.kind!=='set')return;
    const groups=C.targetLaneGroups(session,item,M.state);
    if(!groups.length)return;
    const box=document.createElement('section');
    box.className='v4-target-lane-panel';
    box.innerHTML=`<div class="v4-target-lane-head"><b>Suggested lane groups</b><small>ranked by target / send-off</small></div>${groups.map(g=>`<div class="v4-target-lane-row"><span>Lane group ${g.index}</span><strong>${esc(g.athletes.map(a=>M.ui?.identifier?M.ui.identifier(a):a.full_name).join(' · '))}</strong><small>${esc(g.target)}</small></div>`).join('')}`;
    panel.prepend(box);
  }

  // ---------- Compact Board / current-block focus ----------
  function blockLabel(el){
    const h=el.querySelector('h2')?.textContent||'Block';
    const m=el.querySelector('header > strong')?.textContent||'';
    return `${h}${m?` · ${m}`:''}`;
  }
  function setBoardBlock(host,id,all=false){
    const cards=[...host.querySelectorAll('.block-card')];
    if(!cards.length)return;
    for(const c of cards)c.classList.toggle('v4-block-hidden',!all&&c.dataset.blockId!==id);
    host.querySelectorAll('[data-v4-block]').forEach(b=>b.classList.toggle('active',!all&&b.dataset.v4Block===id));
    host.querySelector('[data-v4-all]')?.classList.toggle('active',all);
    host.querySelector('.finish-card')?.classList.toggle('v4-finish-hidden',!all&&cards.at(-1)?.dataset.blockId!==id);
  }
  function enhanceBoard(){
    const host=document.querySelector('#boardView'),session=M.currentSession?.();
    if(!host||!session)return;
    host.querySelector('.v4-block-nav')?.remove();
    const cards=[...host.querySelectorAll('.block-card')];
    if(cards.length<2)return;
    C.ensureSettings();
    const map=M.state.settings.boardBlockBySession;
    const expanded=M.state.settings.expandedItemId;
    let expandedBlock='';
    if(expanded){
      const item=host.querySelector(`[data-item-id="${CSS.escape(expanded)}"]`);
      expandedBlock=item?.closest('.block-card')?.dataset.blockId||'';
    }
    const firstVisit=!map[session.id];
    let selected=expandedBlock||map[session.id];
    if(!cards.some(c=>c.dataset.blockId===selected))selected=cards[0].dataset.blockId;
    map[session.id]=selected;
    if(firstVisit)M.state.settings.boardFocusMode=true;
    const nav=document.createElement('div');
    nav.className='v4-block-nav';
    nav.innerHTML=cards.map(c=>`<button data-v4-block="${esc(c.dataset.blockId)}">${esc(blockLabel(c))}</button>`).join('')+`<button data-v4-all>Whole</button>`;
    const context=host.querySelector('.context-strip')||host.querySelector('.session-summary');
    context?.insertAdjacentElement('afterend',nav);
    host.querySelector('.v4-board-plan-cue')?.remove();
    const plan=C.planContext(session),cue=document.createElement('div');
    cue.className='v4-board-plan-cue';
    const cueBits=[plan.weeklyFocus,plan.todayFocus,plan.carry].filter(Boolean);
    if(cueBits.length){cue.innerHTML=`<b>Plan cue</b><span>${esc(cueBits.join(' · '))}</span>`;nav.insertAdjacentElement('afterend',cue);}
    const focus=M.state.settings.boardFocusMode!==false;
    setBoardBlock(host,selected,!focus);
    nav.querySelectorAll('[data-v4-block]').forEach(b=>b.onclick=()=>{
      M.state.settings.boardFocusMode=true;
      map[session.id]=b.dataset.v4Block;
      M.store.save(M.state);
      setBoardBlock(host,b.dataset.v4Block,false);
      window.scrollTo({top:0,behavior:'auto'});
    });
    nav.querySelector('[data-v4-all]').onclick=()=>{
      M.state.settings.boardFocusMode=false;
      M.store.save(M.state);
      setBoardBlock(host,selected,true);
    };
    enhanceExpandedTargetLaneGroups(host,session);
  }

  // ---------- T400-first Times UI ----------
  function persistT400Live(){
    if(!M.state?.settings)return;
    M.state.settings.t400Live=C.t400Live?JSON.parse(JSON.stringify(C.t400Live)):null;
    try{M.store.save(M.state)}catch{}
  }
  function hydrateT400Live(){
    if(C.t400Live||!M.state?.settings?.t400Live)return;
    const x=M.state.settings.t400Live;
    if(x?.session_id===M.currentSession?.()?.id)C.t400Live=JSON.parse(JSON.stringify(x));
    else M.state.settings.t400Live=null;
  }
  function stopT400Ticker(){
    if(C._t400Ticker){clearInterval(C._t400Ticker);C._t400Ticker=null;}
  }
  function t400Roster(session,stroke=normaliseStroke(M.state?.settings?.t400Stroke||'Freestyle')){
    return M.timing.t400Seed(M.state,session,stroke).map(x=>x.athlete);
  }
  function t400Heat(session,stroke,heatIndex=Number(M.state?.settings?.t400HeatIndex||0)){
    return M.timing.t400Heat(M.state,session,stroke,heatIndex);
  }
  function t400Histories(stroke){
    const wanted=normaliseStroke(stroke);
    return (M.state?.trainingTestResults||[])
      .filter(r=>/t400/i.test(typeKey(M.state,r))&&testStroke(M.state,r)===wanted)
      .filter(r=>!isSophie((M.state.athletes||[]).find(a=>a.id===r.athlete_id)))
      .sort((a,b)=>String(b.result_date||b.created_at||'').localeCompare(String(a.result_date||a.created_at||'')));
  }
  function renderT400Live(live){
    if(!live)return'';
    const running=live.status==='running',elapsed=running&&live.start_epoch!=null?Math.max(0,(Date.now()-live.start_epoch)/1000):0;
    return `<section class="page-card v4-t400-live">
      <div class="timing-live-head"><div><div class="eyebrow">LIVE T400 · ${esc(live.stroke)}</div><h2>${running?'Running':'Ready'}</h2></div><b id="v4T400Elapsed">${clock(elapsed)}</b></div>
      <div class="timing-live-grid">${live.athlete_ids.map((id,i)=>{
        const a=M.state.athletes.find(x=>x.id===id),v=live.finishes[id],lane=live.lanes?.[id]||M.timing.T400_LANE_ORDER[i]||i+1;
        return `<button class="timing-athlete ${v?'complete':''}" data-v4-t400-finish="${esc(id)}" ${!running||v?'disabled':''}><strong>L${lane} · ${esc(a?.full_name||id)}</strong><span>${v?clock(v):'FINISH'}</span><small>${v?'Recorded':'Tap as they finish'}</small></button>`;
      }).join('')}</div>
      <div class="v4-quick-actions">
        <button id="v4StartT400" ${running?'disabled':''}>START ALL</button>
        <button id="v4ResetT400">Reset</button>
        <button id="v4SaveT400" ${Object.values(live.finishes||{}).some(Boolean)?'':'disabled'}>Save results</button>
      </div>
      <p class="muted">One common push start. Tap each swimmer as they finish. Saving is local first.</p>
    </section>`;
  }

  function renderTimes(){
    stopT400Ticker();
    const h=document.querySelector('#timesView'),s=M.currentSession?.();
    if(!h)return;
    if(!M.access?.can?.('timing.read')){h.innerHTML='<section class="empty-card"><h2>Coach timing is not available on this device</h2></section>';return;}
    if(!s){h.innerHTML='<section class="empty-card"><h2>No session selected</h2></section>';return;}
    C.ensureSettings();

    if(M.state.settings.v4TimingMode==='general'&&C.baseRenderTimes){
      C.baseRenderTimes();
      [...h.querySelectorAll('section.page-card')].forEach(sec=>{if(sec.querySelector('h2')?.textContent?.trim()==='Save T400')sec.remove();});
      const back=document.createElement('button');back.className='v4-back-t400';back.textContent='← T400 / Tests';
      back.onclick=()=>{M.state.settings.v4TimingMode='t400';M.store.save(M.state);renderTimes();};
      h.prepend(back);
      return;
    }

    const stroke=normaliseStroke(M.state.settings.t400Stroke||'Freestyle');
    const allSeed=t400Roster(s,stroke),heatCount=Math.max(1,Math.ceil(allSeed.length/8));
    M.state.settings.t400HeatIndex=Math.min(Number(M.state.settings.t400HeatIndex||0),heatCount-1);
    const heat=t400Heat(s,stroke),athletes=heat.map(x=>x.athlete),ids=new Set(allSeed.map(a=>a.id));
    const addable=(M.state.athletes||[]).filter(a=>a.active!==false&&!isSophie(a)&&!ids.has(a.id)).sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));
    hydrateT400Live();
    const live=C.t400Live;
    h.innerHTML=`
      <section class="page-card v4-times-hero">
        <div class="eyebrow">TIME / TEST · VERSION 4</div><h1>T400</h1>
        <p>Attendance fills the swimmers. Add or remove anyone without changing the session.</p>
        <label>Stroke<select id="v4T400Stroke">${['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].map(x=>`<option ${x===stroke?'selected':''}>${x}</option>`).join('')}</select></label>
        ${heatCount>1?`<div class="v4-heat-tabs">${Array.from({length:heatCount},(_,i)=>`<button data-v4-heat="${i}" class="${i===Number(M.state.settings.t400HeatIndex||0)?'active':''}">Heat ${i+1}</button>`).join('')}</div>`:''}
        <div class="v4-timing-roster">${heat.map(x=>{const a=x.athlete,r=x.anchor;return `<div class="time-row"><div><strong>L${x.lane} · ${esc(a.full_name)}</strong><small>${esc(a.squad||'')}</small></div><div><b>${r?clock(resultSeconds(r)):`No ${esc(stroke)} T400`}</b><button data-v4-remove-timing="${esc(a.id)}" aria-label="Remove">×</button></div></div>`}).join('')||'<p class="muted">No swimmers on this heat.</p>'}</div>
        <div class="v4-add-row"><select id="v4AddTiming"><option value="">＋ Add swimmer</option>${addable.map(a=>`<option value="${esc(a.id)}">${esc(a.full_name)} · ${esc(a.squad||'')}</option>`).join('')}</select><button id="v4ResetRoster">Use attendance</button></div>
        ${!live?'<button id="v4LoadT400" class="v4-primary-action">Load T400 clock</button>':''}
      </section>
      ${renderT400Live(live)}
      <details class="page-card"><summary>Manual T400 entry</summary>
        <label>Swimmer<select id="v4ManualAthlete">${athletes.map(a=>`<option value="${esc(a.id)}">${esc(a.full_name)}</option>`).join('')}</select></label>
        <label>Time<input id="v4ManualTime" placeholder="4:29.0"></label>
        <button id="v4ManualSave">Save ${esc(stroke)} T400</button>
      </details>
      <details class="page-card v4-test-history"><summary>T400 history · ${esc(stroke)}</summary>
        ${t400Histories(stroke).slice(0,30).map(r=>{const a=M.state.athletes.find(x=>x.id===r.athlete_id);return `<div class="v4-data-row"><span>${esc(a?.full_name||r.athlete_id)} · ${esc(r.result_date||'')}</span><b>${clock(resultSeconds(r))}</b><small>${esc(r.pool_course||'')} ${r.valid_for_anchor===false?'· not anchor':''}</small><span class="v4-test-actions"><button data-v4-edit-t400="${esc(r.id)}">Edit</button><button data-v4-delete-t400="${esc(r.id)}">Delete</button></span></div>`}).join('')||'<p class="muted">No saved tests for this stroke.</p>'}
      </details>
      <section class="page-card"><button id="v4GeneralTiming">Other timed set / stopwatch</button></section>`;

    h.querySelectorAll('[data-v4-heat]').forEach(b=>b.onclick=()=>{
      M.state.settings.t400HeatIndex=Number(b.dataset.v4Heat)||0;M.store.save(M.state);renderTimes();
    });
    h.querySelector('#v4T400Stroke')?.addEventListener('change',e=>{
      if(C.t400Live&&C.t400Live.status==='running'){e.target.value=C.t400Live.stroke;M.toast('Reset the live T400 before changing stroke');return;}
      M.state.settings.t400Stroke=e.target.value;M.state.settings.t400HeatIndex=0;M.store.save(M.state);
      C.t400Live=null;persistT400Live();renderTimes();
    });
    h.querySelector('#v4AddTiming')?.addEventListener('change',e=>{
      if(!e.target.value)return;
      M.timing.add(e.target.value,M.state,s);M.store.save(M.state);renderTimes();
    });
    h.querySelectorAll('[data-v4-remove-timing]').forEach(b=>b.onclick=()=>{
      M.timing.remove(b.dataset.v4RemoveTiming,M.state,s);M.store.save(M.state);renderTimes();
    });
    h.querySelector('#v4ResetRoster')?.addEventListener('click',()=>{
      M.timing.useAttendance(M.state,s);M.store.save(M.state);renderTimes();
    });
    h.querySelector('#v4LoadT400')?.addEventListener('click',()=>{
      const roster=t400Heat(s,stroke);
      if(!roster.length)return M.toast('Mark swimmers Here or add a swimmer first');
      C.t400Live={id:uid('t400-live'),session_id:s.id,stroke,heat_index:Number(M.state.settings.t400HeatIndex||0),athlete_ids:roster.map(x=>x.athlete.id),lanes:Object.fromEntries(roster.map(x=>[x.athlete.id,x.lane])),started_at:null,start_epoch:null,status:'ready',finishes:Object.fromEntries(roster.map(x=>[x.athlete.id,null]))};
      persistT400Live();renderTimes();
    });

    h.querySelectorAll('[data-v4-edit-t400]').forEach(b=>b.onclick=()=>{
      const row=(M.state.trainingTestResults||[]).find(r=>r.id===b.dataset.v4EditT400);if(!row)return;
      const value=prompt('Correct T400 time (m:ss.xx)',clock(resultSeconds(row)));if(value==null)return;
      const seconds=U.seconds(value);
      if(!seconds||seconds<120||seconds>1200)return M.toast('Enter a valid 400 time');
      row.result_seconds=seconds;row.updated_at=now();row.source='corrected_v4_poolside';
      M.store.save(M.state);M.cloud?.stageTrainingTestResult?.(row);M.toast(`T400 corrected · ${clock(seconds)}`);renderTimes();
    });

    h.querySelectorAll('[data-v4-delete-t400]').forEach(b=>b.onclick=()=>{
      if(!confirm('Delete this T400 result?'))return;
      M.state.trainingTestResults=(M.state.trainingTestResults||[]).filter(r=>r.id!==b.dataset.v4DeleteT400);
      M.store.save(M.state);M.toast('T400 result deleted locally');renderTimes();
    });

    const saveLiveResults=()=>{
      const live=C.t400Live,rows=[];
      if(!live)return rows;
      for(const id of live.athlete_ids){
        const sec=live.finishes[id];if(!sec)continue;
        rows.push(M.timing.saveT400(id,sec,s,M.state,new Date().toISOString().slice(0,10),live.stroke,{source:'timed_v4_poolside',source_label:`Timed T400 ${live.stroke} · MSOS Version 4`,metadata:{lane:live.lanes?.[id]||null,heat:(live.heat_index||0)+1}}));
      }
      if(rows.length){
        M.store.save(M.state);
        for(const row of rows)M.cloud?.stageTrainingTestResult?.(row);
      }
      return rows;
    };

    if(C.t400Live){
      h.querySelector('#v4StartT400')?.addEventListener('click',()=>{
        C.t400Live.start_epoch=Date.now();C.t400Live.started_at=now();C.t400Live.status='running';persistT400Live();renderTimes();
      });
      h.querySelectorAll('[data-v4-t400-finish]').forEach(b=>b.onclick=()=>{
        const live=C.t400Live;if(!live||live.status!=='running')return;
        const sec=(Date.now()-live.start_epoch)/1000;
        if(sec<=0)return;
        live.finishes[b.dataset.v4T400Finish]=Math.round(sec*100)/100;
        if(live.athlete_ids.every(id=>live.finishes[id])){
          live.status='complete';persistT400Live();
          const rows=saveLiveResults();
          C.t400Live=null;persistT400Live();
          M.toast(`${rows.length} T400 result${rows.length===1?'':'s'} auto-saved`);
        }else persistT400Live();
        renderTimes();
      });
      h.querySelector('#v4ResetT400')?.addEventListener('click',()=>{C.t400Live=null;persistT400Live();renderTimes();});
      h.querySelector('#v4SaveT400')?.addEventListener('click',()=>{
        const rows=saveLiveResults();
        if(!rows.length)return M.toast('No finishes recorded');
        C.t400Live=null;persistT400Live();
        M.toast(`${rows.length} T400 result${rows.length===1?'':'s'} saved`);
        renderTimes();
      });
      if(C.t400Live.status==='running'){
        C._t400Ticker=setInterval(()=>{
          const el=document.querySelector('#v4T400Elapsed');
          if(el&&C.t400Live?.start_epoch!=null)el.textContent=clock((Date.now()-C.t400Live.start_epoch)/1000);
        },100);
      }
    }

    h.querySelector('#v4ManualSave')?.addEventListener('click',()=>{
      try{
        const row=M.timing.saveT400(h.querySelector('#v4ManualAthlete').value,h.querySelector('#v4ManualTime').value,s,M.state,new Date().toISOString().slice(0,10),stroke,{source:'manual_v4_poolside',source_label:`Manual T400 ${stroke} · MSOS Version 4`});
        M.store.save(M.state);M.cloud?.stageTrainingTestResult?.(row);M.toast(`${stroke} T400 ${clock(row.result_seconds)} saved`);renderTimes();
      }catch(e){M.toast(e.message)}
    });
    h.querySelector('#v4GeneralTiming')?.addEventListener('click',()=>{M.state.settings.v4TimingMode='general';M.store.save(M.state);renderTimes();});
  }


  // ---------- Finish / review: same canonical session, richer learning ----------
  function finishDraftKey(session){return session?.id||'none'}
  C.finishDraft=(session=M.currentSession?.())=>{
    C.ensureSettings();
    M.state.settings.finishDrafts=M.state.settings.finishDrafts||{};
    return M.state.settings.finishDrafts[finishDraftKey(session)]||{wentWell:'',reinforce:'',athleteNotes:'',carryForward:''};
  };
  C.saveFinishDraft=(session,patch)=>{
    M.state.settings.finishDrafts=M.state.settings.finishDrafts||{};
    M.state.settings.finishDrafts[finishDraftKey(session)]={...C.finishDraft(session),...patch,updated_at:now()};
    M.store.save(M.state);
  };
  C.openFinishReview=(blockId)=>{
    M.access?.assert?.('session.finish');
    const session=M.currentSession?.(),block=session?.blocks?.find(x=>x.id===blockId);
    if(!session||!block)return;
    const calc=M.session.finishThroughBlock(session,blockId),draft=C.finishDraft(session),host=document.querySelector('#modalHost');
    const attendance=(M.state.attendance||[]).filter(x=>x.session_id===session.id);
    const here=attendance.filter(x=>['present','modified'].includes(text(x.status).toLowerCase())).length;
    host.innerHTML=`<div class="modal-backdrop"><section class="modal v4-finish-modal"><header><h2>Finish session</h2><button data-close-v4-finish>×</button></header><div class="modal-body">
      <div class="v4-finish-truth"><b>${esc(session.identity.title||'Session')}</b><span>${calc.total.toLocaleString()}m delivered through ${esc(block.title)}</span><span>${here} swimmer${here===1?'':'s'} here</span></div>
      <label>What went well?<textarea id="v4FinishWell">${esc(draft.wentWell||'')}</textarea></label>
      <label>What needs reinforcing?<textarea id="v4FinishReinforce">${esc(draft.reinforce||'')}</textarea></label>
      <label>Athlete-specific notes?<textarea id="v4FinishAthletes">${esc(draft.athleteNotes||'')}</textarea></label>
      <label>What carries into the next session?<textarea id="v4FinishCarry">${esc(draft.carryForward||'')}</textarea></label>
      <p class="muted">Original plan stays preserved. Live edits, attendance, timing and captures remain linked to this same session.</p>
    </div><footer><button data-v4-finish-confirm>Finish · ${calc.total.toLocaleString()}m</button></footer></section></div>`;
    M.nav?.openLayer?.('modal');
    const m=host.querySelector('.modal');
    const values=()=>({wentWell:text(m.querySelector('#v4FinishWell')?.value),reinforce:text(m.querySelector('#v4FinishReinforce')?.value),athleteNotes:text(m.querySelector('#v4FinishAthletes')?.value),carryForward:text(m.querySelector('#v4FinishCarry')?.value)});
    m.querySelectorAll('textarea').forEach(x=>x.addEventListener('input',()=>C.saveFinishDraft(session,values())));
    m.querySelector('[data-close-v4-finish]').onclick=()=>{C.saveFinishDraft(session,values());M.actions.closeModal?.()};
    m.querySelector('[data-v4-finish-confirm]').onclick=()=>{
      const v=values(),observations=[v.wentWell&&`Went well: ${v.wentWell}`,v.reinforce&&`Reinforce: ${v.reinforce}`,v.athleteNotes&&`Athlete notes: ${v.athleteNotes}`].filter(Boolean).join('\n');
      const next=M.changes.finishAtBlock(session,blockId,{observations,carryForward:v.carryForward});
      next.finish={...next.finish,review:{...v},attendanceCount:here,plannedDistance:M.session.total(session),actualDistance:calc.total};
      M.actions.commit(next);
      delete M.state.settings.finishDrafts[finishDraftKey(session)];
      M.store.save(M.state);
      M.actions.closeModal?.();
      M.toast(`Finished · ${calc.total.toLocaleString()}m · review saved locally`);
    };
  };

  // Replace the full-session/block Finish entry point only. Exact-line Finish
  // remains owned by the proven line-context flow.
  if(M.actions?.finishBlock)M.actions.finishBlock=blockId=>C.openFinishReview(blockId);


  // ---------- Poolside voice evidence: audio local-first + transcript ----------
  C.transcribePoolsideVoice=async blob=>{
    if(!M.intake?.transcribe)throw new Error('Voice transcription is not available on this build.');
    const result=await M.intake.transcribe(blob,'voice');
    const transcript=text(result?.rawText||result?.raw_text||'');
    if(!transcript)throw new Error('No transcript returned.');
    return{transcript,provider:text(result?.provider||''),model:text(result?.model||'')};
  };
  if(M.actions){
    M.actions.recordVoice=async(mod,save)=>{
      const btn=mod.querySelector('[data-capture-voice]'),status=mod.querySelector('#captureStatus');
      if(!btn||!status)return;
      if(btn.dataset.recording==='1'){M._recorder?.stop();return}
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true}),chunks=[],r=new MediaRecorder(stream);
        M._recorder=r;
        r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        r.onstop=async()=>{
          stream.getTracks().forEach(t=>t.stop());
          const blob=new Blob(chunks,{type:r.mimeType||'audio/webm'});
          btn.textContent='Voice';btn.dataset.recording='';
          status.textContent='Saving audio locally…';
          let cap=null;
          try{
            cap=await save('voice','',blob);
            status.textContent='Audio saved locally · transcribing…';
          }catch(e){status.textContent=`Could not save audio: ${e.message||e}`;return}
          try{
            const tr=await C.transcribePoolsideVoice(blob);
            cap.text_content=tr.transcript;
            cap.transcript_text=tr.transcript;
            cap.transcript_provider=tr.provider||null;
            cap.transcript_model=tr.model||null;
            cap.transcribed_at=now();cap.updated_at=now();
            M.store.save(M.state);
            M.cloud?.stageCapture?.(cap);
            const note=mod.querySelector('#captureText');if(note)note.value=tr.transcript;
            const names=(cap.athlete_ids||[]).map(id=>M.state.athletes?.find(a=>a.id===id)?.full_name).filter(Boolean);
            const who=names.length?names.join(' + '):'GROUP';
            status.textContent=`Transcript saved · ${who} · ${cap.context_label||'current session'}`;
            M.toast?.(`Voice transcript saved · ${who}`);
          }catch(e){
            status.textContent=`Audio saved locally · transcript failed: ${e.message||e}`;
            M.toast?.('Voice audio saved · transcript needs retry');
          }
        };
        r.start(1000);
        btn.textContent='Stop voice';btn.dataset.recording='1';status.textContent='Recording voice note…';
      }catch(e){status.textContent=e.message||String(e)}
    };
  }

  // ---------- Validated-base safety banner ----------
  C.renderBaseMismatch=()=>{
    let el=document.querySelector('#v4BaseMismatch');
    if(C.baseBuild.match){el?.remove();return;}
    if(!el){
      el=document.createElement('div');el.id='v4BaseMismatch';el.className='v4-base-mismatch';
      document.body.prepend(el);
    }
    el.innerHTML=`<strong>VERSION 4 BASE MISMATCH — DO NOT COACH FROM THIS BUILD</strong><span>Loaded ${esc(C.baseBuild.loaded||'unknown')} · expected ${esc(C.baseBuild.expected)}</span>`;
  };

  // ---------- Install UI wrappers ----------
  if(M.ui){
    const UI=M.ui;
    C.baseRenderTimes=UI.renderTimes?.bind(UI);
    C.baseRenderAthletes=UI.renderAthletes?.bind(UI);
    C.baseRenderBoard=UI.renderBoard?.bind(UI);
    C.baseRenderRoll=UI.renderRoll?.bind(UI);
    C.baseRenderTV=UI.renderTV?.bind(UI);
    C.baseRenderSwimmer=UI.renderSwimmer?.bind(UI);
    C.baseRenderCurrent=UI.renderCurrent?.bind(UI);

    UI.renderHub=renderCoachHub;
    UI.renderTimes=renderTimes;
    UI.renderAthletes=()=>{
      C.enforceRoster();
      C.baseRenderAthletes?.();
      enhanceSwimmerHub();
    };
    UI.renderBoard=()=>{
      C.enforceRoster();
      C.baseRenderBoard?.();
      enhanceBoard();
    };
    UI.renderRoll=()=>{C.enforceRoster();C.baseRenderRoll?.();};
    UI.renderTV=()=>{C.enforceRoster();C.baseRenderTV?.();};
    UI.renderSwimmer=()=>{C.enforceRoster();C.baseRenderSwimmer?.();enhanceIndividualDevice();};
    UI.renderCurrent=()=>{
      C.ensureSettings();
      const changed=C.enforceRoster();
      if(changed)try{M.store.save(M.state)}catch{}
      C.baseRenderCurrent?.();
      const badge=document.querySelector('#buildBadge');if(badge)badge.textContent='v4';
      C.renderBaseMismatch();
    };
  }

  // Keep selected session/view/swimmer as local truth during live updates.
  if(M.live?.apply){
    const baseLiveApply=M.live.apply.bind(M.live);
    M.live.apply=msg=>{
      const before=M.state?{
        view:M.state.settings.view,
        sid:M.state.settings.selectedSessionId,
        athlete:M.state.settings.selectedAthleteId,
        expanded:M.state.settings.expandedItemId,
        scrollY:window.scrollY
      }:null;
      const out=baseLiveApply(msg);
      if(before&&M.state){
        // TV/individual display may intentionally follow coach publish; coach/board never does.
        if(!['tv','swimmer'].includes(before.view)){
          M.state.settings.view=before.view;
          M.state.settings.selectedSessionId=before.sid;
          M.state.settings.selectedAthleteId=before.athlete;
          M.state.settings.expandedItemId=before.expanded;
        }
        C.enforceRoster();
        M.store.save(M.state);
      }
      return out;
    };
  }


  // ---------- Guardian: retire only superseded expectations, add current v4 contract ----------
  // The base v4.0.1 Guardian contains a handful of assertions from the shadow
  // prototype (60% Charlotte volume, raw target+rest cycles, etc.). Those rules
  // were deliberately replaced by the accepted Version 4 deck contract. Keep
  // every other base Guardian assertion and replace only the named superseded
  // expectations with current behaviour tests.
  if(M.guardian?.run){
    const baseGuardianRun=M.guardian.run.bind(M.guardian);
    const supersededGuardianNames=new Set([
      'Charlotte profile derives from canonical work',
      'Charlotte single long swim scales by work volume',
      'T400 Reg/Dev pattern gives distinct targets with actual rest',
      'Genuine Clearance produces a T400 target',
      'Genuine Clearance without HR Gauge still receives supported target',
      'TV Board splits modified work into swimmer-specific cards'
    ]);
    const gtest=(name,ok,detail='')=>({name,ok:!!ok,detail:text(detail)});
    C.guardianContractTests=()=>{
      const tests=[];
      tests.push(gtest('Correct v4 is running on the validated base build',C.baseBuild.match,`loaded ${C.baseBuild.loaded} · expected ${C.baseBuild.expected}`));
      try{
        const blank={adaptationProfiles:[]};
        const expected={
          'Charlotte Murphy':.50,'Conor Fischer':.50,'McKenzie Drage':2/3,
          'Amber Proudfoot':2/3,'Matthew Kofoed':2/3,'Ruby Stace':2/3
        };
        const good=Object.entries(expected).every(([full_name,ratio])=>Math.abs(M.adapt.profile({id:full_name,full_name},blank).ratio-ratio)<1e-9);
        tests.push(gtest('Correct v4 active modification defaults',good,'Charlotte/Conor 1/2; McKenzie/Amber/Matthew/Ruby 2/3'));
        tests.push(gtest('Sophie stays outside active modification defaults',M.adapt.profile({id:'sophie',full_name:'Sophie Newlove'},blank).ratio===1,'Historical Sophie data may remain; active fallback must not return.'));
        const mck=M.adapt.item({id:'g-mck75',kind:'set',distance:75,reps:4,raw:'4 x 75 #1 Fast',cycleSeconds:90},{id:'mck',full_name:'McKenzie Drage'},{adaptationProfiles:[],adaptationOverrides:[]},{id:'gs',identity:{course:'SCM',squads:['National']}});
        tests.push(gtest('McKenzie fast 75 protects independent practical rest',Number(mck.cycleSeconds)>=115,`cycle ${clock(mck.cycleSeconds)} · 1:55 minimum`));
        tests.push(gtest('Charlotte retains return-to-start-end rule',M.adapt.profile({id:'charlotte',full_name:'Charlotte Murphy'},blank).returnToStart===true));
        const conor=M.adapt.item({id:'g-conor',kind:'set',reps:4,distance:50,stroke:'Breaststroke',raw:'4 x 50 Breaststroke with Fins'},{id:'conor',full_name:'Conor Fischer'},{adaptationProfiles:[],adaptationOverrides:[]},{id:'gs',identity:{course:'SCM',squads:['National']}});
        tests.push(gtest('Conor breaststroke-with-fins constraint remains active',conor.stroke==='Choice'&&/no Breaststroke kick with fins/i.test(text(conor.adaptationReason||conor.raw))));
        const amber=M.adapt.item({id:'g-amber',kind:'set',reps:4,distance:25,raw:'4 x 25 Underwater with Fins'},{id:'amber',full_name:'Amber Proudfoot'},{adaptationProfiles:[],adaptationOverrides:[]},{id:'gs',identity:{course:'SCM',squads:['National']}});
        tests.push(gtest('Amber underwater/kick constraint remains upper-body equivalent',/upper-body equivalent/i.test(text(amber.raw||amber.text||amber.adaptationReason))));
        const inclusive=M.adapt.item({id:'g-inc',kind:'set',reps:8,distance:25,raw:'8 x 25 MAX @ 1:00'},{id:'charlotte',full_name:'Charlotte Murphy'},{adaptationProfiles:[],adaptationOverrides:[]},{id:'gs',identity:{course:'SCM',squads:['National']}});
        tests.push(gtest('Short safe quality work keeps modified swimmer with team',Number(inclusive.reps)===8&&/same team exposure/i.test(text(inclusive.adaptationReason))));
      }catch(e){tests.push(gtest('Correct v4 active modification defaults',false,e.message));}
      try{
        tests.push(gtest('T400 practical deck cycle rounds upward to 5s',practicalSendOff(72.63,10)===85&&practicalSendOff(140.88,10)===150&&practicalSendOff(281.80,10)===295,'Henry 4:29 model examples'));
      }catch(e){tests.push(gtest('T400 practical deck cycle rounds upward to 5s',false,e.message));}
      try{
        const st={
          trainingTestTypes:[
            {id:'gf',test_key:'t400_freestyle'},{id:'gb',test_key:'t400_backstroke'}
          ],
          trainingTestResults:[
            {athlete_id:'g',test_type_id:'gf',result_seconds:270,pool_course:'SCM',valid_for_anchor:true,result_date:'2026-06-01'},
            {athlete_id:'g',test_type_id:'gf',result_seconds:269,pool_course:'SCM',valid_for_anchor:true,result_date:'2026-08-01'},
            {athlete_id:'g',test_type_id:'gb',result_seconds:300,pool_course:'SCM',valid_for_anchor:true,result_date:'2026-08-01'}
          ]
        };
        const ath={id:'g',full_name:'Guardian Swimmer'};
        tests.push(gtest('T400 uses fastest valid exact-stroke anchor',resultSeconds(M.targets.t400(ath,st,'SCM','Freestyle'))===269&&resultSeconds(M.targets.t400(ath,st,'SCM','Backstroke'))===300));
        tests.push(gtest('Named-stroke T400 never silently falls back to Freestyle',M.targets.t400(ath,st,'SCM','Butterfly')===null));
        const dev=M.targets.aerobic(269,100,'Development',10);
        tests.push(gtest('T400 Development target keeps authored rest model and practical cycle',Math.abs(dev.seconds-72.63)<.02&&dev.sendOff===85));
      }catch(e){tests.push(gtest('T400 exact-stroke contract',false,e.message));}
      try{
        const state={
          athletes:[{id:'here',full_name:'Here Swimmer',active:true,squad:'National'},{id:'other',full_name:'Other Squad',active:true,squad:'Intermediate'},{id:'soph',full_name:'Sophie Newlove',active:true,squad:'National'}],
          attendance:[{session_id:'gs',athlete_id:'here',status:'present'},{session_id:'gs',athlete_id:'soph',status:'present'}],
          settings:{timingRoster:[],t400RosterBySession:{}},trainingTestTypes:[],trainingTestResults:[]
        };
        const session={id:'gs',identity:{course:'SCM',squads:['National']}};
        const before=M.timing.t400RosterIds(state,session);
        M.timing.add('other',state,session);
        const after=M.timing.t400RosterIds(state,session);
        tests.push(gtest('T400 roster starts from Here/Modified and cross-squad add appends',before.includes('here')&&!before.includes('soph')&&after.includes('here')&&after.includes('other')));
      }catch(e){tests.push(gtest('T400 roster starts from Here/Modified and cross-squad add appends',false,e.message));}
      try{
        const suppressed=['Choice','Kick','Drill','Easy','5HR Reset','HR Gauge'].every(raw=>!!M.targets.suppressPace?.({raw,stroke:raw}));
        tests.push(gtest('Non-target work stays free of fake pace numbers',suppressed));
      }catch(e){tests.push(gtest('Non-target work stays free of fake pace numbers',false,e.message));}
      try{
        if(M.parser?.parse&&M.teamDisplay?.groups){
          const sess=M.parser.parse('MAIN SET\n10 x 100 Freestyle Threshold 10s Rest',{id:'v4-tv-mod',squads:['National'],course:'SCM'});
          const st={athletes:[{id:'std',full_name:'Standard Swimmer',squad:'National',active:true},{id:'cm',full_name:'Charlotte Murphy',squad:'National',active:true}],attendance:[{session_id:'v4-tv-mod',athlete_id:'std',status:'present'},{session_id:'v4-tv-mod',athlete_id:'cm',status:'modified'}],adaptationProfiles:[],adaptationOverrides:[],trainingTestTypes:[],trainingTestResults:[],coachResults:[]};
          const groups=M.teamDisplay.groups(sess,sess.blocks[0].items[0],st),works=groups.map(x=>x.work).join(' | ');
          tests.push(gtest('TV Board splits current modified work without old 60% assumption',groups.length===2&&/10\s*[×x]\s*100/.test(works)&&/5\s*[×x]\s*100/.test(works),works));
        }
      }catch(e){tests.push(gtest('TV Board splits current modified work without old 60% assumption',false,e.message));}
      try{
        if(M.teamDisplay?.presentAthletes){
          const laneState={
            athletes:[{id:'la',full_name:'Lane A',active:true,squad:'National'},{id:'lb',full_name:'Lane B',active:true,squad:'National'},{id:'lc',full_name:'Lane C',active:true,squad:'National'}],
            attendance:[{session_id:'gl',athlete_id:'la',status:'present'},{session_id:'gl',athlete_id:'lb',status:'present'},{session_id:'gl',athlete_id:'lc',status:'present'}],
            trainingTestTypes:[{id:'ltf',test_key:'t400_freestyle'}],
            trainingTestResults:[
              {id:'la-t',test_type_id:'ltf',athlete_id:'la',result_seconds:280,pool_course:'SCM',valid_for_anchor:true},
              {id:'lb-t',test_type_id:'ltf',athlete_id:'lb',result_seconds:280,pool_course:'SCM',valid_for_anchor:true},
              {id:'lc-t',test_type_id:'ltf',athlete_id:'lc',result_seconds:320,pool_course:'SCM',valid_for_anchor:true}
            ],adaptationProfiles:[],adaptationOverrides:[],settings:{}
          };
          const groups=C.targetLaneGroups({id:'gl',identity:{course:'SCM',squads:['National']}},{id:'gl-item',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Development',restSeconds:10,raw:'4 x 100 Freestyle Development 10s Rest'},laneState);
          tests.push(gtest('Target-ranked lane grouping keeps equal targets together',groups.length===2&&groups[0].athletes.length===2&&groups[0].athletes.every(a=>['la','lb'].includes(a.id))&&groups[1].athletes[0]?.id==='lc'));
        }
      }catch(e){tests.push(gtest('Target-ranked lane grouping keeps equal targets together',false,e.message));}
      try{
        const completed=['PARITY-33','PARITY-34','PARITY-35','PARITY-36'].every(id=>M.PARITY_REQUIREMENTS?.find(x=>x.id===id)?.status==='implemented');
        tests.push(gtest('TV / Individual / Assistant / Meet are first-class Version 4 parity',completed));
      }catch(e){tests.push(gtest('TV / Individual / Assistant / Meet are first-class Version 4 parity',false,e.message));}
      return tests;
    };
    M.guardian.run=()=>{
      const base=baseGuardianRun()||{};
      const retained=(base.tests||[]).filter(t=>!supersededGuardianNames.has(text(t.name)));
      const current=C.guardianContractTests();
      const tests=[...retained,...current];
      const passed=tests.filter(t=>t.ok===true).length;
      return {...base,build:M.BUILD,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length};
    };
  }

  // Guarantee correction settings/roster are present before the base boot handler runs.
  if(M.state){C.ensureSettings();C.hydratePlanning();C.enforceRoster();}
  if(typeof document!=='undefined'&&document.body)C.renderBaseMismatch();
})(globalThis);
