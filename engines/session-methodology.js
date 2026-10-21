'use strict';
// Learning loop (11 Sept 2026) -- Andy's own phrase from 10 Sept: "Jordan sees methodology/evidence behind
// sessions he writes, plus some form of self-assessment." Asked Andy directly which shape each half should
// take (AskUserQuestion, since his one-sentence description left genuine design room): he chose "Both" for
// evidence scope (per-decision AND session-level) and "Instant evidence verdict on the whole session" for
// self-assessment, explicitly the option that reuses engines/modification-edit.js's stroke-evidence-gate
// SHAPE (compute evidence -> plain-English verdict -> apply-instantly-or-flag-for-Andy -> notify -> review)
// rather than inventing a rating/rubric. The per-decision half of "evidence" (engines/board.js's
// evidenceProvenance, appended to the existing adaptationReason line) shipped alongside this file.
//
// Ground-truth audit before building (matching the Phase 2/4/5 pattern): there is no structured weekly/
// season target in this app -- weeklyPlans/seasonPlans are free text (engines/coach-loop-ui.js's
// planContext()). So "does this session match methodology" cannot be checked against an invented numeric
// target. What IS always mechanically checkable, for every session, with data every engine here already
// computes, is whether an individual swimmer's modification changed the SESSION's actual training-system
// classification (dosageEngine.systemFrom) relative to what the squad was authored to do -- a direct
// restatement of the North Star principle "individualisation must preserve session purpose/stimulus,"
// checked the same way engines/modification.js already computes every adaptation. Separately, when a
// weekly plan DOES name a recognisable training system in its free text, that's also checked against the
// session's actual dominant classified system. Two real checks; nothing invented; "no target declared"
// is treated as "nothing to check" (unknown remains unknown), never as a failure.
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;
  if(!M?.state||!M?.util||!E?.Modification||!M?.dosageEngine||!M?.boardEngine||!M?.ui)return;
  const U=M.util,D=M.dosageEngine,B=M.boardEngine,UI=M.ui;
  const SM=M.sessionMethodology={build:'v4-session-methodology-20261006-brief'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U.escape?U.escape(String(v??'')):text(v);
  const now=()=>new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Pure computation -- no I/O, safe to unit test directly.
  // ---------------------------------------------------------------------------
  // Only athletes with an ACTIVE override in this session are in scope: this is deliberately the exact
  // same data structure the stroke-evidence-gate already gates on (M.state.adaptationOverrides), not a
  // second attendance-derived list -- a session with no individual modifications has nothing to drift from.
  function stimulusDrift(session,state){
    const rows=(state?.adaptationOverrides||[]).filter(x=>x.sessionId===session?.id&&x.active!==false);
    const flagged=[];
    for(const row of rows){
      const item=B.findItem?.(session,row.itemId);if(!item||item.kind!=='set')continue;
      const athlete=(state?.athletes||[]).find(a=>a.id===row.athleteId);if(!athlete)continue;
      const squadSystem=D.systemFrom('',item);
      let adapted;try{adapted=E.Modification.adaptItem(item,athlete,state,session);}catch{continue;}
      const athSystem=D.systemFrom('',adapted);
      if(athSystem!==squadSystem)flagged.push({athleteId:athlete.id,athleteName:athlete.full_name||'Swimmer',itemId:item.id,squadSystem,athSystem,reason:text(adapted.adaptationReason||'')});
    }
    return flagged;
  }
  // 4 Oct 2026 (Andy, decided via AskUserQuestion -- the "vocabulary mapping" option left open since the
  // season planner shipped earlier today): engines/season-planner.js writes weekly-plan focus text in its
  // OWN vocabulary (Aerobic Capacity/Power, Anaerobic Capacity/Power, Aerobic Skills, and the combo day
  // "Aerobic + Anaerobic Capacity"), none of which dosageEngine.systemFrom's own keywords recognise -- so
  // this check safely did nothing (named==='Unclassified') for any season-planner-generated week, never a
  // misfire, just inert.
  //
  // First proposed mapping (same day, superseded minutes later -- kept only as history): Anaerobic
  // Capacity->Clearance, Anaerobic Power->Speed/Max. Andy corrected this immediately against his own real
  // reading of Clive Rushton's model, verbatim: "anaerobic capacity is atp, top end speed, assisted and
  // resisted. Developing the capacity or ability of the anaerobic system, anaerobic power is race pace
  // work, lactate tolerance etc with clearance fitting into the top of aerobic power but there are some
  // crossovers. Ac, ap, anp, anc in the progression." i.e. the two terms are the OPPOSITE of this file's
  // first guess: Anaerobic Capacity is the alactic/ATP-PC, pure-speed end (assisted/resisted sprint work),
  // and Anaerobic Power is the race-pace/lactate-tolerance end -- and Clearance (dosageEngine's own
  // 165-185bpm Rushton band) is the ceiling of Aerobic Power, not a separate Anaerobic Capacity zone.
  // Current (corrected) mapping: Aerobic Capacity->Development (aerobic base), Aerobic Power->Threshold
  // (Clearance accepted too -- see the crossover check below), Anaerobic Power->Race pace (race-pace/
  // lactate-tolerance work), Anaerobic Capacity->Speed/Max (ATP-PC/alactic top-end speed -- matches
  // systemFrom's own "alactic"/"neural" keywords exactly), Aerobic Skills->Skill/Technical, the combo
  // day->Overload (the middle ground; Andy's correction didn't address this specific compound phrase, kept
  // as the original reasonable default rather than guessed into something new).
  //
  // Deliberately a SEPARATE lookup checked only here, not a change to systemFrom() itself -- systemFrom()
  // classifies real authored session/set text everywhere else in the app (dosage reports, drift checks,
  // Board badges), and season-planner phrases like "capacity"/"power" are not safe general-purpose
  // training-system keywords (e.g. a coach could write "aerobic capacity" as a genuine descriptive phrase
  // inside a set's own text without meaning dosageEngine's Development exactly). Checked longest/most-
  // specific phrase first so the combo phrase "Aerobic + Anaerobic Capacity" is never shadowed by the plain
  // "Anaerobic Capacity" substring it contains, and "Anaerobic Capacity"/"Anaerobic Power" are each checked
  // before their "Aerobic Capacity"/"Aerobic Power" counterparts for the same reason ("Anaerobic..." itself
  // contains "...aerobic..." as a substring). Today, only weekSession.primary_system/objective (the
  // phase-level terms) actually reach this check via coach-loop-ui.js's planContext(); the per-day template
  // labels in SEED_WEEKLY (e.g. "Aerobic Skills" on a specific day) are included here for when/if those are
  // ever wired into session metadata, but are not reachable through any real path today -- stated plainly,
  // not a silent assumption either way.
  const SEASON_PHASE_VOCAB=[
    [/aerobic\s*\+\s*anaerobic\s*capacity/i,'Overload'],
    [/aerobic\s*skills/i,'Skill / Technical'],
    [/anaerobic\s*capacity/i,'Speed / Max'],
    [/anaerobic\s*power/i,'Race pace'],
    [/aerobic\s*power/i,'Threshold'],
    [/aerobic\s*capacity/i,'Development'],
  ];
  function seasonPlannerSystem(focusText){
    for(const[re,sys]of SEASON_PHASE_VOCAB)if(re.test(focusText))return sys;
    return null;
  }
  // 13 Oct 2026 (Andy built Tue AM from the suggestions and the check said "off brief"): a combination day such as
  // "Aerobic + Anaerobic Capacity" asks for BOTH systems -- aerobic capacity (Development) and top-end speed
  // (Speed / Max) -- not for Overload. Read each half on its own; the session is on brief when its main set has
  // real work in both. Suggestions and drafts offer both.
  function comboSystems(focusText){const t=String(focusText||'');if(!/\+|&|\band\b/i.test(t))return null;const parts=t.split(/\s*(?:\+|&|\band\b)\s*/i).map(x=>x.trim()).filter(Boolean);if(parts.length<2)return null;
    const noun=(parts[parts.length-1].match(/\b(capacity|power)\b/i)||[])[1]||'';const out=[];for(let p of parts){if(noun&&!/\b(capacity|power|skills?)\b/i.test(p))p=`${p} ${noun}`;const sys=seasonPlannerSystem(p)||(D.systemFrom?(x=>x&&x!=='Unclassified'?x:null)(D.systemFrom(p)):null);if(sys&&!out.includes(sys))out.push(sys);}
    return out.length>=2?out:null;}
  SM.comboSystems=comboSystems;SM.planTargetCheck=(...a)=>planTargetCheck(...a);
  // Rushton's HR bands are continuous, not hard walls -- Andy's own correction above explicitly named one
  // real overlap ("clearance fitting into the top of aerobic power"), so a session genuinely delivered at
  // Clearance intensity against a Threshold-named target is a real crossover, not a methodology drift, and
  // must never be flagged as a mismatch. Deliberately general (not scoped to season-planner text only):
  // the same physiology applies whether "Threshold" came from this file's own vocabulary lookup above or
  // from a plain "Threshold week" weekly-plan phrase classified by dosageEngine.systemFrom() directly. No
  // other crossover is assumed here -- only the one Andy actually stated.
  // 15 Oct 2026: Andy's reference library defines Aerobic Power as "stronger aerobic output, threshold/overload", so
  // an Overload main set on an Aerobic Power day is on brief too (his AP01 "3 Rounds of 8 x 100 Overload").
  function isKnownCrossover(plannedSystem,dominantSystem){
    return plannedSystem==='Threshold'&&(dominantSystem==='Clearance'||dominantSystem==='Overload');
  }
  // Only fires when the weekly plan's free text names one of dosageEngine's own system labels (directly, or
  // via the season-planner vocabulary lookup above) -- never invents a target from silence. A session with
  // no weekly plan linked, or a weekly plan whose free text doesn't name a system, returns checked:false and
  // is never treated as a failure.
  // ---------------------------------------------------------------------------
  // Today's brief (6 Oct 2026, Andy: the app is "to help write and assess a training session and ... have
  // all the tools in front of you to ensure that the session that you're writing hits the brief of those
  // overriding plans"). brief() is the ONE place that answers "what is this session supposed to be":
  //   1. the season plan's week covering this date (its day/slot row first, then the week's own focus);
  //   2. otherwise the standing weekly template for this squad/day/slot (engines/season-planner.js's
  //      M.state.weeklyTemplates -- Andy's "standard that stays as is unless specifically changed"),
  //      labelled as such;
  //   3. otherwise nothing (unknown remains unknown).
  // A week from a season that does not cover this date is ignored -- previously the best-scoring week from
  // last season was used, which is exactly the "showing all last season's data" Andy reported.
  // ---------------------------------------------------------------------------
  const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const lc=v=>text(v).toLowerCase();
  function weekCovers(week,date){const st=String(week?.week_start||week?.weekStart||week?.start_date||'').slice(0,10);if(!st||!date)return null;const d=Date.parse(`${date}T12:00:00Z`),s0=Date.parse(`${st}T12:00:00Z`);return Number.isFinite(d)&&Number.isFinite(s0)?d>=s0&&d<s0+7*86400000:null;}
  function weekdayOf(date){const t=Date.parse(`${date}T12:00:00Z`);return Number.isFinite(t)?WEEKDAYS[new Date(t).getUTCDay()]:'';}
  function templateDay(session,state){
    const date=session?.identity?.date||'',day=weekdayOf(date),part=lc(session?.identity?.dayPart);if(!day)return null;
    const squads=(session?.identity?.squads||[]).map(lc);
    for(const t of state?.weeklyTemplates||[]){if(squads.length&&!squads.some(s=>s===lc(t.squad)||s.includes(lc(t.squad))||lc(t.squad).includes(s)))continue;
      const rows=(t.days||[]).filter(d=>lc(d.day)===day);const hit=rows.find(d=>!part||lc(d.dayPart)===part)||(rows.length===1?rows[0]:null);if(hit)return{squad:t.squad,row:hit};}
    return null;
  }
  function planBrief(session,state=M.state){
    if(!session)return null;
    let ctx=null;try{ctx=M.coachLoopUI?.planContext?.(session);}catch{}
    const date=session?.identity?.date||'';
    const covers=ctx?.week?weekCovers(ctx.week,date):null;
    if(ctx&&covers!==false&&(ctx.todayFocus||ctx.weeklyFocus||ctx.technicalFocus)){
      const ws=ctx.weekSession||{},wk=ctx.week||{};
      return{source:'season',seasonName:text(ctx.seasonName),slot:text([ws.day,ws.dayPart].filter(Boolean).join(' ')),
        system:text(ctx.todayFocus),sessionFocus:text(ws.session_focus||ws.focus||''),
        technical:text(ws.technical_focus||ctx.technicalFocus||''),weekFocus:text(ctx.weeklyFocus),phase:text(wk.phase||wk.focus||''),
        mental:text(ctx.psychologicalFocus||''),weekStart:text(wk.week_start||''),weekStroke:text(wk.stroke||((text(wk.objective||'').split('·')[0]||'').trim().match(/^(Freestyle|Backstroke|Breaststroke|Butterfly)$/i)||[''])[0])};
    }
    const tpl=templateDay(session,state);
    if(tpl){const r=tpl.row;return{source:'standard',squad:tpl.squad,slot:text([r.day,r.dayPart].filter(Boolean).join(' ')),system:text(r.primary_system),sessionFocus:text(r.session_focus),technical:text(r.technical_focus),weekFocus:'',phase:'',mental:'',staleWeek:covers===false};}
    return{source:'none',staleWeek:covers===false};
  }
  // Coach-chosen focus (10 Oct 2026, Andy: "we still need to be able to just paste in a session or override /
  // lead the way with writing"). The plan's brief is the default; the coach can pick a different energy-system
  // focus for one session. It is stored on that session (metadata.coachFocus) so the check, suggestions,
  // drafts and the Board banner all judge the session against what the coach chose, and the plan's own
  // wording stays visible beside it.
  const FOCUS_OPTIONS=[['Development','Aerobic Capacity'],['Threshold','Aerobic Power'],['Race pace','Anaerobic Power'],['Speed / Max','Anaerobic Capacity'],['Skill / Technical','Skills'],['Overload','Mixed']];
  function withFocus(b,focus){
    if(!focus||!FOCUS_OPTIONS.some(([k])=>k===focus))return b;
    const base=b&&b.source!=='none'?b:{source:'coach',slot:'',sessionFocus:'',technical:'',weekFocus:'',phase:'',mental:''};
    return{...base,source:base.source==='none'?'coach':base.source,briefSystem:b&&b.source!=='none'?(base.system||''):'',system:focus,coachFocus:focus};
  }
  function brief(session,state=M.state){if(!session)return null;return withFocus(planBrief(session,state),session?.metadata?.coachFocus);}
  SM.FOCUS_OPTIONS=FOCUS_OPTIONS;SM.planBrief=planBrief;
  SM.brief=brief;
  function namedSystem(t){const x=text(t);if(!x)return null;const s=seasonPlannerSystem(x)||D.systemFrom(x);return s&&s!=='Unclassified'?s:null;}
  function mainBlocks(session){return(session?.blocks||[]).filter(b=>b?.type==='main_set'||b?.type==='main'||/\bmain\b/i.test(text(b?.title)));}
  function rankedSystems(dose){return Object.entries(dose?.systems||{}).filter(([,v])=>v.pctDose>0).sort((a,b)=>b[1].pctDose-a[1].pctDose);}
  // The check the brief panel, the Board banner and the assistant-coach review all share. Today's slot
  // system is checked first, then the week's focus, then technical text -- previously all three were run
  // together and the first vocabulary phrase found won, so a week named "Aerobic Power" could override a
  // day row that said "Aerobic Capacity". The session side is the MAIN SET's dominant classified system
  // when the session has a main set (warm-up / pull / kick volume would otherwise outweigh the purpose of
  // almost any session), else the whole session.
  function planTargetCheck(session,state,b=undefined){
    if(b===undefined)b=brief(session,state);
    if(!b||b.source==='none')return{checked:false};
    const combo=b.coachFocus?null:comboSystems(b.system);
    let named=null,from='';for(const [k,v] of [['day',b.system],['week',b.weekFocus],['technical',b.technical]]){named=namedSystem(v);if(named){from=k;break;}}
    if(combo){named=combo[0];from='day';}
    if(!named)return{checked:false,source:b.source};
    let dose;try{dose=D.session(session,state,{delivered:false});}catch{return{checked:false,source:b.source};}
    const ranked=rankedSystems(dose);if(!ranked.length)return{checked:false,source:b.source};
    const mains=mainBlocks(session);let basis='whole session',mainRanked=null;
    if(mains.length){try{const md=D.session({...session,id:`${session.id||'session'}#main`,blocks:mains},state,{delivered:false});const r=rankedSystems(md);if(r.length){mainRanked=r;basis='main set';}}catch{}}
    const top=(mainRanked||ranked)[0],dominantSystem=top[0];
    // A tie for the most work counts as the planned system being on top.
    const pctOf=(rows,k)=>Number((rows||[]).find(([x])=>x===k)?.[1]?.pctMetres||0);const basisRows=mainRanked||ranked;
    let matches=dominantSystem===named||isKnownCrossover(named,dominantSystem)||(pctOf(basisRows,named)>0&&pctOf(basisRows,named)>=Number(top[1].pctMetres||0)-0.5);
    // 15 Oct 2026 (Andy: "in an aerobic capacity phase ... there might be slightly more of an aerobic feel to some of
    // those higher intensity sets"): in the Base Skills / aerobic phase, a harder day whose main set is mostly
    // aerobic but still has real work of the planned system (at least 15% of the main set) is the aerobic-phase
    // version of that day -- on brief, and said so (his AP05 "early-season aerobic power touch").
    // 19 Oct 2026 (Andy: "too much weight on sprint components" -- only the MAX metres of a "15m MAX" rep now count as
    // speed): top-end speed work is small in metres and sits inside long recovery, scull and drill (his methodology:
    // "MAX efforts, assisted and resisted, long recovery"; his ANC01 cords/parachutes set). A Speed / Max day is on
    // brief when the main set carries a real share of max work (at least 15%) even though recovery/skill metres are larger.
    if(!matches&&named==='Speed / Max'&&['Skill / Technical','Development','Regeneration'].includes(dominantSystem)&&pctOf(basisRows,named)>=15)matches=true;
    let aerobicPhase=false;
    if(!matches&&!combo&&baseLike(b)&&['Threshold','Race pace','Speed / Max'].includes(named)&&['Development','Regeneration'].includes(dominantSystem)&&pctOf(basisRows,named)>=15){matches=true;aerobicPhase=true;}
    let comboInfo=null;if(combo){const share=combo.map(k=>({k,pct:Math.round(pctOf(basisRows,k))}));const missing=share.filter(x=>x.pct<10).map(x=>x.k);matches=!missing.length;comboInfo={systems:combo,share,missing};}
    const planned=dose.systems?.[named]||{metres:0,pctMetres:0};
    return{checked:true,combo:comboInfo,aerobicPhase,plannedSystem:named,plannedFrom:from,dominantSystem,dominantPct:Math.round(top[1].pctMetres||top[1].pctDose||0),basis,matches,source:b.source,
      plannedMetres:Math.round(planned.metres||0),plannedPct:Math.round(planned.pctMetres||0),totalMetres:Math.round(dose.rawMetres||0),
      mix:[...ranked].sort((a,b)=>(b[1].pctMetres||0)-(a[1].pctMetres||0)).slice(0,3).map(([label,v])=>({label,pct:Math.round(v.pctMetres||0)}))};
  }
  function evaluate(session,state=M.state){
    const drift=stimulusDrift(session,state),plan=planTargetCheck(session,state);
    const reasons=drift.map(d=>`${d.athleteName}: intended ${d.squadSystem} but delivered as ${d.athSystem}${d.reason?` (${d.reason})`:''}`);
    if(plan.checked&&!plan.matches&&plan.combo)reasons.push(`Brief asks for ${plan.combo.systems.join(' + ')}, but the ${plan.basis} has no ${plan.combo.missing.join(' or ')}`);
    else if(plan.checked&&!plan.matches)reasons.push(`Weekly focus names ${plan.plannedSystem}, but this session's ${plan.basis==='main set'?'main set':'dominant classified system'} is ${plan.basis==='main set'?'mostly ':''}${plan.dominantSystem}`);
    return{approved:reasons.length===0,drift,plan,reasons};
  }
  SM.evaluate=evaluate;
  SM.seasonPlannerSystem=seasonPlannerSystem;
  // Owner sessions are never gated -- Andy's own judgement is never second-guessed by this, exactly matching
  // the stroke-evidence-gate's "Andy's own edits are never gated" rule (engines/modification-edit.js).
  function resolveSessionGate(who,session,state=M.state){
    if(who?.role!=='assistant')return{gated:false};
    return{gated:true,verdict:evaluate(session,state)};
  }
  SM.resolveSessionGate=resolveSessionGate;

  // ---------------------------------------------------------------------------
  // Session-level "why this session" -- the other half of "Both": reuses the exact dosage/plan computation
  // already built and shown on the Coach Hub (engines/coach-loop-ui.js), surfaced right on the Board where
  // Jordan is actually working, instead of requiring a separate trip to Coach Hub to find it.
  // ---------------------------------------------------------------------------
  function summary(session,state=M.state){
    let ctx=null;try{ctx=M.coachLoopUI?.planContext?.(session);}catch{}
    let dose=null;try{dose=D.session(session,state,{delivered:false});}catch{}
    const ranked=Object.entries(dose?.systems||{}).filter(([,v])=>v.pctDose>0).sort((a,b)=>b[1].pctDose-a[1].pctDose);
    const top=ranked.slice(0,2).map(([label,v])=>`${label} ${Math.round(v.pctDose)}%`).join(' · ');
    return{
      dosageLine:top||'No classified physiological metres yet.',
      weeklyFocus:text(ctx?.weeklyFocus||''),
      seasonGoal:text(ctx?.seasonGoal||''),
      linkStatus:ctx?.linkStatus||'none'
    };
  }
  SM.summary=summary;

  // ---------------------------------------------------------------------------
  // Notification + durable record -- reuses Phase 5's coach_alerts/push-alerts infrastructure directly
  // rather than inventing a second delivery mechanism. Fire-and-forget: a session finish must never block
  // or fail because a notification round trip is slow or offline, matching notifyPendingStroke's contract.
  // ---------------------------------------------------------------------------
  async function notifyPendingReview(session,verdict){
    try{
      const res=await M.pushAlerts?.sendCoachAlert?.({
        sessionId:session.id,
        athleteId:null,
        kind:'methodology_review',
        title:`${session.identity?.date||'Session'} ${session.identity?.dayPart||''} · methodology flagged`.trim(),
        body:verdict.reasons[0]+(verdict.reasons.length>1?` (+${verdict.reasons.length-1} more)`:''),
      });
      return res?.alertId||null;
    }catch{return null;}
  }
  SM.notifyPendingReview=notifyPendingReview;

  // Andy (or Jordan, on the device that raised it) acknowledging a flagged session -- there is no
  // alternate "value" to apply/revert the way the stroke gate has (a whole finished session has no single
  // field to undo), so this is deliberately one action: mark reviewed. Clears the local field and, when an
  // alert id is known, the durable coach_alerts row too, so a second device won't keep showing it as open.
  async function markReviewed(session,alertId){
    session.pendingMethodologyReview=null;
    session.methodologyReviewedAt=now();
    session.methodologyReviewedBy=M.teamAccess?.actor?.()||{role:'owner',name:'Owner'};
    try{M.store?.putSession?.(M.state,session);}catch{}
    if(alertId){try{await M.cloud?.fetch?.(`/rest/v1/coach_alerts?id=eq.${encodeURIComponent(alertId)}`,{method:'PATCH',body:JSON.stringify({read_at:now()})});}catch{}}
  }
  SM.markReviewed=markReviewed;

  // Cross-device visibility: a session field set on Jordan's device is local-only (it is not part of
  // C.stageSession/C.reconstructSession's known field set -- see architecture note in
  // /areas/msos-known-issues.md). The durable coach_alerts row is what any device, including Andy's, can
  // actually see. Best-effort, read-only, never blocks rendering.
  async function fetchOpenReview(session){
    if(!M.cloud?.ready?.())return null;
    const org=M.cloud.org?.();if(!org)return null;
    try{
      const rows=await M.cloud.fetch(`/rest/v1/coach_alerts?select=id,title,body,created_at&organisation_id=eq.${encodeURIComponent(org)}&session_id=eq.${encodeURIComponent(session.id)}&kind=eq.methodology_review&read_at=is.null&order=created_at.desc&limit=1`);
      return Array.isArray(rows)&&rows[0]?rows[0]:null;
    }catch{return null;}
  }

  // ---------------------------------------------------------------------------
  // Board banner -- wraps UI.renderBoard the same way engines/coach-loop-ui.js already does (that wrap has
  // already run by the time this script loads; this composes on top of it, not in place of it), rather than
  // editing board.js's own monolithic render() template.
  // ---------------------------------------------------------------------------
  function currentSession(){return M.currentSession?.()||null;}
  async function installBanner(){
    const host=document.querySelector('#boardView'),s=currentSession();
    if(!host||!s)return;
    if(M.access?.role?.()==='swimmer')return;
    host.querySelector('[data-methodology-banner]')?.remove();
    const sum=summary(s),owner=M.access?.role?.()==='owner';
    let remote=null;if(!s.pendingMethodologyReview)remote=await fetchOpenReview(s);
    const pending=s.pendingMethodologyReview||(remote?{reasons:[remote.body],remote:true,alertId:remote.id}:null);
    const section=document.createElement('section');
    section.dataset.methodologyBanner='1';section.className='page-card msos-methodology-banner';
    // Board stays a whiteboard (CLAUDE.md 2.52): one collapsed line naming the brief and whether the
    // session is on it; tap to open the full brief.
    let bf=null,bc=null;try{bf=brief(s);bc=bf&&bf.source!=='none'?planTargetCheck(s,M.state,bf):null;}catch{}
    const briefLine=!bf||bf.source==='none'?'No plan covers this session yet':`${esc(bf.sessionFocus||bf.system||'Session focus')}${bc?.checked?(bc.matches?' · ✓ on brief':' · ⚠ off brief'):''}`;
    section.innerHTML=`<details class="msos-brief-board"><summary><span class="eyebrow">TODAY'S BRIEF</span> ${briefLine}</summary>${briefHtml(s,M.state,{compact:true})}<p class="muted">${esc(sum.dosageLine)}</p></details>${pending?`<div class="context-note msos-pending-methodology"><b>⚑ Flagged for review:</b> ${esc(pending.reasons.join('; '))}${owner?'':' Only Andy can mark this reviewed.'}</div>${owner?'<div class="hub-actions"><button type="button" data-methodology-reviewed>Mark reviewed</button></div>':''}`:(s.methodologyVerdict?.approved?'<div class="context-note ok">✓ Evidence check: this session\'s individual modifications preserve the intended stimulus.</div>':'')}`;
    // Two renders in quick succession both awaited fetchOpenReview above, then both inserted a banner (Andy's
    // Board showed TODAY'S BRIEF twice, 11 Oct). Clear again right before inserting so only the latest stays.
    host.querySelectorAll('[data-methodology-banner]').forEach(x=>x.remove());if(currentSession()?.id!==s.id)return;
    const anchor=host.querySelector('.board-hero,.session-card,.board-header,.v4-block-nav')||host.firstElementChild;
    if(anchor)anchor.insertAdjacentElement(anchor.classList?.contains('v4-block-nav')?'beforebegin':'afterend',section);else host.prepend(section);
    section.querySelector('[data-methodology-reviewed]')?.addEventListener('click',async()=>{await markReviewed(s,pending.alertId||null);UI.renderBoard?.();});
  }
  SM.refreshBanner=()=>{if((M.state?.settings?.view||'board')==='board')installBanner();};
  // A plan restored or changed in Data & References repaints only the brief banner (not the Board).
  try{addEventListener('msos:data-updated',e=>{if(['season_plan','weekly_plan','weeklyTemplates','standardTimetable'].includes(e?.detail?.type))SM.refreshBanner();});}catch{}
  const baseBoard2=UI.renderBoard?.bind(UI);
  if(baseBoard2)UI.renderBoard=()=>{baseBoard2();queueMicrotask(installBanner);};

  // ---------------------------------------------------------------------------
  // Brief panel -- shown while WRITING a session (Add session and Edit workout) and on the Board, so the
  // coach sees what this session is meant to be and how the text in front of them measures up, as they
  // type. Display only: never changes the session, Roll or selection. Called by the modal owners themselves
  // (v4-poolside-core.js openNewSession, app.js openSessionEdit) -- no wrapper over their actions.
  // ---------------------------------------------------------------------------
  const COACH_TERM={'Development':'Aerobic Capacity','Threshold':'Aerobic Power','Clearance':'Aerobic Power (top)','Race pace':'Anaerobic Power','Speed / Max':'Anaerobic Capacity','Overload':'Aerobic + Anaerobic Capacity','Skill / Technical':'Skills'};
  const sysLabel=sys=>COACH_TERM[sys]?`${COACH_TERM[sys]} (${sys})`:sys;
  // 10 Oct 2026: when a season plan already exists (e.g. it starts next Monday), say so and let the coach
  // open it, instead of always offering "Plan next season" as if nothing had been planned.
  function seasonNote(){try{const s=M.dataAdminUI?.activeSeason?.();if(!s)return'';const st=String(s.start_date||s.effective_from||'').slice(0,10);const t=Date.parse(`${st}T12:00:00Z`);return` <b>${esc(s.name||'Season plan')}</b> starts ${esc(Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{day:'numeric',month:'short',timeZone:'UTC'}):st)}.`;}catch{return'';}}
  function seasonButton(){let has=false;try{has=!!M.dataAdminUI?.activeSeason?.();}catch{}return`<button type="button" data-msos-plan-season>${has?'View season plan':'Plan next season'}</button>`;}
  // Session starters (10 Oct 2026, Andy: "should have a plan session option or template to write the
  // individual session here"). Two ways to start instead of a blank box: the five block headings, or a copy
  // of the last session written for the same squad on the same day and time slot (the closest real template
  // a coach has). Only fills the box -- the coach edits and saves as normal.
  function lastSameSlot(identity,state=M.state){
    const date=identity?.date||'',day=weekdayOf(date),part=lc(identity?.dayPart),squads=(identity?.squads||[]).map(lc);if(!day)return null;
    return Object.values(state?.canonicalSessions||{}).filter(x=>{const d=x?.identity?.date||'';return d&&d<date&&weekdayOf(d)===day&&lc(x.identity?.dayPart)===part&&(!squads.length||(x.identity?.squads||[]).some(q=>squads.includes(lc(q))))&&(x.blocks||[]).some(b=>(b.items||[]).length);}).sort((a,b)=>String(b.identity.date).localeCompare(String(a.identity.date)))[0]||null;
  }
  function sessionText(s){const t=text(s?.currentSource?.text||'')?s.currentSource.text:(M.session?.serialize?M.session.serialize(s):'');return String(t||'').replace(/\n?TOTAL\s+[\d,]+m\s*$/i,'').trim();}
  const TEMPLATE_TEXT='WARM UP\n\n\nPRE SET\n\n\nMAIN SET\n\n\nPOST SET\n\n\nWARM DOWN\n';
  // ---------------------------------------------------------------------------
  // Andy's component library (10 Oct 2026). Every set below is taken from his own written methodology
  // (docs/METHODOLOGY_McLay_20261010.md -- "Session Structure, Programming Philosophy and Energy Zone
  // Examples"), in his shorthand, so suggestions and drafts are his programming, not invented sets.
  // `fits` = the dosage systems a main-set component delivers (checked against the parser in
  // tests/session-guide-20261010.cjs). Section = where it belongs in his structure.
  // ---------------------------------------------------------------------------
  const LIB=[
    {id:'wu-a',section:'WARM UP',label:'Aerobic + stroke prep (1100)',text:'500 (300 Free / 200 Reverse IM)\n12 x 50 Scull / Drill / Swim Perfect Technique',for:['speed','race','mixed']},
    {id:'wu-b',section:'WARM UP',label:'Mixed stroke prep (1200)',text:'400 Choice\n8 x 50 (4 Kick / 4 Drill) 10sR\n4 x 100 IM Desc 1-4 10sR',for:['race','mixed','speed','threshold']},
    {id:'wu-c',section:'WARM UP',label:'Longer aerobic prep (1200)',text:'4 x 300 (200 Free / 100 Reverse IM)',for:['aerobic','threshold']},
    {id:'wu-d',section:'WARM UP',label:'Alignment → Performance (400)',text:'8 x 50 Alignment / Connection / Activation / Performance Stroke',for:['skill','speed','race']},
    {id:'pre-speed',section:'PRE SET',label:'Speed preparation (600)',text:'3 Rounds:\n4 x 50 @1:15\n#1 Build\n#2 Middle 20m MAX\n#3 First 15m MAX\n#4 Easy',for:['speed','race']},
    {id:'pre-count',section:'PRE SET',label:'Stroke count + kick (850)',text:'3 x 200 Pull Desc Stroke Count 1-3\n5 x 50 Kick Build @1:00',for:['aerobic','threshold','skill','mixed']},
    {id:'pre-rp',section:'PRE SET',label:'Race-pace activation (600)',text:'4 Rounds:\n3 x 50\n#1-2 Drill\n#3 @200 Pace',for:['race','aerobic']},
    {id:'reg-400',section:'MAIN SET',label:'2 x 400 Regeneration',text:'2 x 400 Free Reg 10sR',fits:['Regeneration']},
    {id:'reg-prog',section:'MAIN SET',label:'Reg → Dev → OL rounds',text:'2 Rounds:\n300 Reg 10sR\n200 Dev 10sR\n100 OL 10sR',fits:['Regeneration','Development','Overload']},
    {id:'dev-100',section:'MAIN SET',label:'6 x 100 Development',text:'6 x 100 Dev 10sR',fits:['Development']},
    {id:'dev-200',section:'MAIN SET',label:'4 x 200 Development',text:'4 x 200 Dev 10sR',fits:['Development']},
    {id:'dev-mix',section:'MAIN SET',label:'Reg / Dev rounds',text:'2 Rounds:\n200 Reg 10sR\n2 x 100 Dev 10sR',fits:['Regeneration','Development']},
    {id:'ol-at-100',section:'MAIN SET',label:'8 x 100 OL → AT',text:'8 x 100 10sR\n#1-4 Overload\n#5-8 Threshold',fits:['Overload','Threshold']},
    {id:'ol-at-rounds',section:'MAIN SET',label:'5 rounds 200 OL / 100 AT',text:'5 Rounds:\n200 OL 10sR\n100 AT 10sR',fits:['Overload','Threshold']},
    {id:'at-rounds',section:'MAIN SET',label:'2 rounds 4 x 100 AT',text:'2 Rounds:\n4 x 100 AT 10sR',fits:['Threshold']},
    {id:'zone-ladder',section:'MAIN SET',label:'12 x 100 Dev → OL → AT → CL',text:'12 x 100 10sR\n#1-3 Dev\n#4-6 OL\n#7-9 AT\n#10-12 CL',fits:['Development','Overload','Threshold','Clearance']},
    {id:'cl-100',section:'MAIN SET',label:'4 x 100 Clearance',text:'4 x 100 CL 10sR',fits:['Clearance']},
    {id:'cl-hr',section:'MAIN SET',label:'2 x 200 IM Clearance HR Gauge',text:'2 x 200 IM Clearance 20sR HR Gauge',fits:['Clearance']},
    {id:'rp-200',section:'MAIN SET',label:'200 pace rounds',text:'2 Rounds:\n4 x 50 @200 Pace\n200 Easy @4:00',fits:['Race pace']},
    {id:'rp-25',section:'MAIN SET',label:'6 x 25 → 100 pace',text:'6 x 25 @1:00\n#1 Build\n#2-6 @100 Pace',fits:['Race pace']},
    {id:'rp-50',section:'MAIN SET',label:'4 x 50 → 100 pace',text:'4 x 50 @2:30\n#1 Build\n#2-4 @100 Pace',fits:['Race pace']},
    {id:'rp-odd',section:'MAIN SET',label:'Odd 200 pace / even drill',text:'4 x 50 Stroke @1:15\nOdd 200 Pace\nEven Drill',fits:['Race pace']},
    {id:'max-12',section:'MAIN SET',label:'8 x 12.5 MAX',text:'8 x 12.5 MAX @0:45',fits:['Speed / Max']},
    {id:'max-15',section:'MAIN SET',label:'6 x 15 MAX',text:'6 x 15 MAX @1:30',fits:['Speed / Max']},
    {id:'max-25',section:'MAIN SET',label:'8 x 25 MAX',text:'8 x 25 MAX @2:00',fits:['Speed / Max']},
    {id:'max-100',section:'MAIN SET',label:'1 x 100 MAX',text:'1 x 100 MAX',fits:['Speed / Max']},
    {id:'reset-scull',section:'MAIN SET',label:'Scull reset',text:'100 Scull',fits:['Skill / Technical']},
    {id:'post-bands',section:'POST SET',label:'Bands / swim builds',text:'16 x 50 Bands / Swim Build',for:['aerobic','mixed']},
    {id:'post-pull-uw',section:'POST SET',label:'Pull desc + UW fins',text:'8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins @0:45',for:['speed','race','threshold','skill']},
    // 13 Oct 2026 (Andy: "I love the sets to select, we just need to increase the range a bit") -- more of his
    // documented formats.
    {id:'wu-e',section:'WARM UP',label:'4 x 200 Free / Rev IM (800)',text:'4 x 200 (100 Free / 100 Reverse IM) 15sR',for:['aerobic','threshold','mixed','acanc']},
    {id:'pre-kick',section:'PRE SET',label:'Kick builds (400)',text:'8 x 50 Kick Build @1:00',for:['speed','race','mixed','acanc']},
    {id:'reg-200',section:'MAIN SET',label:'4 x 200 Regeneration',text:'4 x 200 Reg 10sR',fits:['Regeneration']},
    {id:'dev-400',section:'MAIN SET',label:'3 x 400 Development',text:'3 x 400 Dev 15sR',fits:['Development']},
    {id:'dev-8x200',section:'MAIN SET',label:'8 x 200 Development',text:'8 x 200 Dev 10sR',fits:['Development']},
    {id:'ol-at-6',section:'MAIN SET',label:'6 x 100 OL → AT',text:'6 x 100 10sR\n#1-3 OL\n#4-6 AT',fits:['Overload','Threshold']},
    {id:'at-200',section:'MAIN SET',label:'5 x 200 Threshold',text:'5 x 200 AT 20sR',fits:['Threshold']},
    {id:'at-3r',section:'MAIN SET',label:'3 rounds 3 x 100 AT',text:'3 Rounds:\n3 x 100 AT 10sR\n100 Easy',fits:['Threshold']},
    {id:'rp-6x50',section:'MAIN SET',label:'6 x 50 @ 200 pace',text:'6 x 50 @200 Pace @1:30',fits:['Race pace']},
    {id:'rp-ladder',section:'MAIN SET',label:'Race-pace ladder 15 → 65',text:'5 x 15 @100 Pace @1:30\n100 Scull\n4 x 25 @100 Pace @2:00\n100 Scull\n3 x 35 @100 Pace @2:30\n100 Scull\n2 x 50 @100 Pace @3:00\n100 Scull\n1 x 65 @100 Pace',fits:['Race pace']},
    {id:'max-4x50',section:'MAIN SET',label:'4 x 50 MAX',text:'4 x 50 MAX @3:00',fits:['Speed / Max']},
    {id:'post-paddles',section:'POST SET',label:'Paddles descend (400)',text:'4 x 100 Pull Paddles Desc 1-4 10sR',for:['aerobic','threshold','mixed','acanc']},
    {id:'wd',section:'WARM DOWN',label:'200 easy',text:'200 Easy',for:['all']}
  ];
  // ---------------------------------------------------------------------------
  // Andy's Session Writing Reference Library (15 Oct 2026, built with ChatGPT from the sessions he has been
  // writing; "HISTORICAL" = sessions he dictated, "NEW" = examples in his style). Kept in his wording; where the
  // app's parser would have read a line differently from what he meant, it is written the way the parser counts it
  // (e.g. "4 x 50 #1 @ 1:15 @ 200 Pace" instead of "200 Pace" on its own line, which counted as an extra 200m) --
  // checked in tests/session-library-stages-20261015.cjs.
  //   focus  -- which session focus the set serves: aerobic (Aerobic Capacity), threshold (Aerobic Power), race
  //             (Anaerobic Power), speed (Anaerobic Capacity), mixed, skill, all (fits any session).
  //   phases -- season phases it suits: base, underwater, turns, finish, taper, any. strict = only in those phases.
  //   use    -- his note on when to use it, shown with the suggestion.
  // ---------------------------------------------------------------------------
  const REFLIB=[
 // WARM-UPS
 {id:'W01',origin:'H',section:'WARM UP',focus:['threshold','mixed','all'],phases:['any'],label:'Mixed-stroke base',text:'4 x 200\n50 Free\n100 Reverse IM\n50 Reverse IM Order\n15sR',use:'Aerobic-power evenings, mixed-stroke preparation, technical rhythm before overload.'},
 {id:'W02',origin:'H',section:'WARM UP',focus:['race','aerobic'],phases:['any'],label:'Long ladder',text:'500 Choice\n400 Free\n300 Back\n200 Breast\n100 Fly\n15sR',use:'Race-pace evening, large aerobic preparation without aggressive intensity.'},
 {id:'W03',origin:'H',section:'WARM UP',focus:['aerobic'],phases:['base','any'],label:'Simple choice + kick',text:'800 Choice\n12 x 50 Kick @ 1:10 Desc 1-3\n200 IM',use:'Aerobic-capacity morning, kick conditioning and stroke balance.'},
 {id:'W04',origin:'H',section:'WARM UP',focus:['speed','skill'],phases:['turns','taper'],label:'Race-skills long course',text:'800\n200 Free / 200 Choice / Repeat',use:'Short session before starts, turns and finish skills.'},
 {id:'W05',origin:'H',section:'WARM UP',focus:['race'],phases:['finish','any'],label:'Speed-endurance preparation',text:'2 Rounds:\n300 Free 15sR\n200 IM 15sR\n100 #1 15sR',use:'Anaerobic-power main set, broad warm-up before quality 200-pace repeats.'},
 {id:'W06',origin:'H',section:'WARM UP',focus:['mixed','aerobic'],phases:['any'],label:'Rainbow warm-up',text:'4 x 250 15sR\n100 IM\n100 Free\n50 #1 Hands by Side\n4 x 100 Kick @ 2:20 Desc 1-4\n4 x 75 Fins @ 1:45\n25 Swim / 25 Kick Streamline Build / 25 Underwater\n400 FOB\nIncrease underwater distance every 100',use:'Long mixed-zone rainbow session, aerobic and technical preparation.'},
 {id:'W07',origin:'N',section:'WARM UP',focus:['aerobic','skill','all'],phases:['base'],label:'Base skills (week one)',text:'600 Choice\n4 x 100 @ 2:00\n25 Hands by Side / 25 Scull / 50 Swim',use:'Early-season aerobic-capacity day, quiet entry and body line.'},
 {id:'W08',origin:'N',section:'WARM UP',focus:['speed'],phases:['turns','any'],label:'Speed-day technical',text:'400 Free\n4 x 100 Choice 15sR\n8 x 50 #1 @ 1:15\nOdd Minimum Stroke Count / Even Build',use:'Anaerobic-capacity top-end speed, prepare nervous system without fatigue.'},
 {id:'W09',origin:'H',section:'WARM UP',focus:['race','speed'],phases:['taper'],label:'Own race warm-up (45 min)',text:'45 min Own Race Warm-Up\nSwimmer explains planned race warm-up to coach\nComplete individual warm-up',use:'Taper or race rehearsal; conversation and swimmer ownership are part of session, not swimming distance.'},
 // PRE-SETS
 {id:'P01',origin:'H',section:'PRE SET',focus:['threshold'],phases:['base','underwater','any'],label:'Bands and body line',text:'8 x 50 Bands Only @ 1:30 Build\n200 #1 Hands by Side',use:'Aerobic-power evening, reinforce catch and body alignment before overload.'},
 {id:'P02',origin:'H',section:'PRE SET',focus:['speed','race'],phases:['underwater','turns'],label:'Underwater and MAX prep',text:'8 x 25 #1 @ 0:45 15m MAX\n200 #1 Drill\n4 x 50 #1 @ 2:00 35m MAX',use:'Speed-quality session; strong activation but monitor fatigue.'},
 {id:'P03',origin:'H',section:'PRE SET',focus:['race'],phases:['taper','underwater'],label:'Fins race prep',text:'2 Rounds:\n2 x 25 Underwater Fins\n2 x 25 15m MAX Fins\n100 #1 Drill\n300 #1 Stroke Check',use:'200-pace session in taper; underwater and breakout precision.'},
 {id:'P04',origin:'H',section:'PRE SET',focus:['skill','speed'],phases:['turns'],label:'Turn and breakout',text:'4 Rounds:\n3 x Turn + Breakout\nStart at Flags\nInto Turn\nUnderwater + Breakout 15-20m\n50 Scull',use:'Technical day, race turns without large metabolic load.'},
 {id:'P05',origin:'H',section:'PRE SET',focus:['speed','race'],phases:['turns','finish'],label:'Dive start progression',text:'4 x 50 #1 Dive Start @ 2:00\n#1 15m MAX\n#2 25m MAX\n#3 35m MAX\n#4 50m MAX\n200 Easy',use:'Speed or race-quality day; increase exposure progressively.'},
 {id:'P06',origin:'H',section:'PRE SET',focus:['speed','skill'],phases:['taper','turns'],label:'Kick progression',text:'100 Kick Steady @ 2:30\n50 Kick Build @ 1:30\n100 Kick Steady @ 2:30\n2 x 50 Kick @ 1:30\n#1 Build / #2 Fast',use:'Race-skills morning, activation without excessive fatigue.'},
 {id:'P07',origin:'H',section:'PRE SET',focus:['speed'],phases:['taper','any'],label:'Kick MAX',text:'12 x 12.5 Kick MAX @ 0:45\n150 Scull',use:'Pre-main activation before moderate kick set, or short speed touch.'},
 {id:'P08',origin:'N',section:'PRE SET',focus:['threshold','aerobic'],phases:['base'],label:'Aerobic economy',text:'8 x 50 @ 1:10\n#1-2 Minimum Stroke Count\n#3-4 Build\nRepeat',use:'Week-one aerobic power touch, preserve length and quiet catch.'},
 {id:'P09',origin:'N',section:'PRE SET',focus:['race'],phases:['base'],label:'Anaerobic power primer (aerobic week)',text:'4 x 50 #1 @ 1:30\n25 Build / 25 Easy\n4 x 25 #1 @ 1:00\n15m Race Speed / Easy Finish\n200 Easy',use:'Short quality primer while keeping overall weekly aerobic load dominant.'},
 {id:'P10',origin:'N',section:'PRE SET',focus:['speed'],phases:['turns','any'],label:'Top-end speed primer',text:'4 x 25 Fins @ 1:30\n15m MAX / Easy Finish\n200 Easy\n4 x Dive Start 15m MAX\nFull Recovery',use:'Anaerobic-capacity session, high speed with recovery; not a lactate tolerance set.'},
 // MAIN SETS -- AEROBIC CAPACITY
 {id:'AC01',origin:'H',section:'MAIN SET',focus:['aerobic'],phases:['base','underwater'],label:'Progressive distance',text:'400 Freestyle Regeneration 10sR\n2 x 200 Freestyle Development 10sR\n2 x 25 15m Underwater MAX @ 1:00\n400 Freestyle Regeneration 10sR\n4 x 100 Freestyle Development 10sR\n2 x 25 15m Underwater MAX @ 1:00',use:'Aerobic-capacity session with small neuromuscular touches, not a full speed session.'},
 {id:'AC02',origin:'H',section:'MAIN SET',focus:['aerobic'],phases:['base','any'],label:'Pull and IM mix',text:'400 Pull 20sR\n4 x 100 IM 20sR\n4 x 100 Paddles 20sR\n400 Pull 20sR\n4 x 100 IM Order 20sR',use:'Aerobic-capacity morning, mixed-stroke technique and pull conditioning.'},
 {id:'AC03',origin:'H',section:'MAIN SET',focus:['aerobic'],phases:['underwater','any'],label:'Kick capacity',text:'12 x 100 Kick @ 2:10 Desc 1-3\n8 x 25 @ 0:45 15m Underwater MAX\n4 x 200 Kick with Fins @ 3:30 Desc 1-4\n8 x 25 Kick @ 1:00 MAX',use:'Kick-focused aerobic-capacity session with speed inserts; substantial load.'},
 {id:'AC04',origin:'N',section:'MAIN SET',focus:['aerobic'],phases:['base'],label:'LCM early base',text:'3 Rounds:\n300 Regeneration 15sR\n2 x 200 Development 20sR\n4 x 50 Build @ 1:15\n100 Easy',use:'Week-one LCM aerobic-capacity development, repeatability and stroke economy.'},
 {id:'AC05',origin:'N',section:'MAIN SET',focus:['aerobic'],phases:['finish'],label:'Aerobic maintenance (anaerobic power phase)',text:'3 x 400 Pull 20sR\n6 x 100 #1 Drill / Swim 15sR\n200 Easy',use:'Between demanding speed-endurance sessions; avoid threshold escalation.'},
 {id:'AC06',origin:'N',section:'MAIN SET',focus:['aerobic'],phases:['base','turns'],label:'Capacity with short race feel',text:'2 Rounds:\n400 Regeneration 15sR\n4 x 100 Development 15sR\n4 x 25 #1 Race Breakout @ 1:00\n200 Easy',use:'Aerobic block maintaining starts and race familiarity.'},
 // AEROBIC POWER
 {id:'AP01',origin:'H',section:'MAIN SET',focus:['threshold'],phases:['underwater'],label:'Overload volume',text:'3 Rounds:\n8 x 100 Overload 10sR',use:'Full aerobic-power loading session, not an appropriate unmodified race-week prescription.'},
 {id:'AP02',origin:'H',section:'MAIN SET',focus:['threshold'],phases:['any'],label:'Minimum stroke count + threshold',text:'3 Rounds:\n200 Minimum Stroke Count @ 3:30\n3 x 100 Threshold 30sR\n100 Minimum Stroke Count\n3 x 50 #1 @ 1:10 Desc 1-3\n#3 @ 200 Pace',use:'Aerobic-power evening, technical economy before strong aerobic work and race-specific finish.'},
 {id:'AP03',origin:'H',section:'MAIN SET',focus:['threshold'],phases:['underwater','any'],label:'Threshold ladder',text:'5 x 100 #1 Threshold 10sR\n300 Choice\n6 x 100 IM Threshold 10sR\n300 Easy\n7 x 100 Free Threshold 10sR\n200 Easy',use:'Mixed-stroke aerobic power with controlled recovery between blocks.'},
 {id:'AP04',origin:'H',section:'MAIN SET',focus:['threshold'],phases:['any'],label:'Stroke count + HR',text:'4 Rounds:\n200 Minimum Stroke Count @ 3:30\n2 x 100 @ 1:45\n#1 Build\n#2 Clearance Heart Rate 170-180',use:'Aerobic-power day, stroke economy before controlled higher effort. HR target is historical, not universally appropriate.'},
 {id:'AP05',origin:'N',strict:true,section:'MAIN SET',focus:['threshold'],phases:['base'],label:'Early-season aerobic power touch',text:'3 Rounds:\n200 Regeneration 15sR\n2 x 200 Development 20sR\n4 x 50 #1 @ 1:15\n#1-2 Smooth Build\n#3-4 Threshold (controlled aerobic power)\n100 Easy',use:'Week-one LCM capacity session containing limited aerobic-power work.'},
 {id:'AP06',origin:'N',section:'MAIN SET',focus:['threshold'],phases:['taper','finish'],label:'Aerobic power (race-prep week)',text:'2 Rounds:\n3 x 100 Threshold 20sR\n200 Easy\n4 x 50 #1 @ 1:30 @ 200 Pace with technical control',use:'Reduced volume, maintain rhythm and specificity rather than chase fatigue.'},
 // ANAEROBIC CAPACITY / TOP-END SPEED
 {id:'ANC01',origin:'H',section:'MAIN SET',focus:['speed'],phases:['turns','any'],label:'Starts, cords, parachutes',text:'2 Rounds:\n4 x Assisted / Resisted Cords\n50 Scull\n4 x 25 Small Parachute 15m MAX\n4 x 25 Big Parachute 15m MAX\n50 Scull\n200 #1 Drill',use:'Top-end speed, resisted power and technical restoration. Give sufficient recovery; cords distance unspecified.'},
 {id:'ANC02',origin:'H',section:'MAIN SET',focus:['speed'],phases:['turns','taper'],label:'Starts and breakouts',text:'6 x Dive Start 15-20m Race Pace\n400 Scull / Swim\n4 x Turn 20-25m Race Intensity\n400 Drill / Swim\n4 x 15m Finish MAX\n400 Choice',use:'Pre-meet race skills, mostly race-intensity skill rehearsal rather than continuous maximal speed.'},
 {id:'ANC03',origin:'H',section:'MAIN SET',focus:['speed'],phases:['any'],label:'Short MAX finish',text:'16 x 12.5 Bands Only MAX @ 0:40',use:'Short power/speed touch after aerobic work. Rest and technical quality determine whether it is truly top-end speed.'},
 {id:'ANC04',origin:'N',section:'MAIN SET',focus:['speed'],phases:['turns'],label:'Pure top-end speed',text:'3 Rounds:\n4 x 15 Dive Start MAX\nFull Recovery Between Reps\n200 Easy',use:'Anaerobic-capacity emphasis, maximal velocity and high quality; stop when speed deteriorates.'},
 {id:'ANC05',origin:'N',section:'MAIN SET',focus:['speed'],phases:['underwater'],label:'Underwater velocity',text:'3 Rounds:\n4 x 25 Fins @ 1:30 15m Underwater MAX / Easy Finish\n200 Easy',use:'Speed day, underwater power and body-line control; individualize underwater distance safely.'},
 // ANAEROBIC POWER / SPEED ENDURANCE
 {id:'ANP01',origin:'H',section:'MAIN SET',focus:['race'],phases:['finish'],label:'200 pace repeats',text:'3 Rounds:\n3 x 100 #1 @ 200 Pace @ 3:00\n300 Easy\n100 Scull\n100 Drill\n100 Swim',use:'Anaerobic-power evening, repeated race-speed 100s and substantial recovery.'},
 {id:'ANP02',origin:'H',section:'MAIN SET',focus:['race'],phases:['taper'],label:'200 pace (taper)',text:'3 Rounds:\n4 x 50 #1 @ 1:15 @ 200 Pace\n300 Easy\nRound 1 Swim\nRound 2 Fins\nRound 3 Paddles',use:'Race-week speed endurance maintenance, reduced metabolic cost.'},
 {id:'ANP03',origin:'H',section:'MAIN SET',focus:['race'],phases:['finish','any'],label:'Progressive race pace',text:'4 x 50 #1 @ 1:30\n#1-2 200 Pace\n#3-4 100 Pace\n2 Rounds:\n25 Dive Start Easy Speed @ 1:00\n50 @ 100 Race Pace @ 1:00\n200 Easy',use:'Race-speed progression following aerobic work.'},
 {id:'ANP04',origin:'H',section:'MAIN SET',focus:['race'],phases:['finish'],label:'Repeated 200-pace blocks',text:'4 Rounds:\n5 x 50 #1 @ 1:10 @ 200 Pace\n250 Easy',use:'Significant race-specific quality volume; better in loading phase than final taper.'},
 {id:'ANP05',origin:'N',section:'MAIN SET',focus:['race'],phases:['finish','any'],label:'Broken 200',text:'3 Rounds:\n4 x 50 #1 @ 1:20 @ 200 Race Pace\n300 Easy',use:'Specific speed endurance, accurate race speed and recovery.'},
 {id:'ANP06',origin:'N',section:'MAIN SET',focus:['race'],phases:['finish','turns'],label:'Short-course race quality',text:'3 Rounds:\n2 x 75 #1 @ 2:30 @ 200 Pace\n50 at 200 Pace / 25 Strong Finish\n200 Easy',use:'200-race speed endurance with final turn/finish emphasis.'},
 // MIXED ZONE / RAINBOW
 {id:'MX01',origin:'H',section:'MAIN SET',focus:['mixed'],phases:['any'],label:'Rainbow progression',text:'400 Regeneration\n3 x 200 Development 10sR\n3 x 100 IM @ 1:45 Desc 1-3\n4 x 150 Overload to Threshold 30sR\n100 #1 Drill @ 2:30\n100 #1 Build @ 2:00\n3 x 50 #1 @ 200 Pace\n#1 @ 1:00 / #2 @ 1:15 / #3 @ 1:30\n100 #1 @ 200 Pace @ 2:00\n4 x 25 @ 0:45\n12.5 Kayak Kick / 12.5 Slip Hold Body Line\n100 #1 Build @ 2:00\n3 x 50 #1 @ 200 Pace\n#1 @ 1:00 / #2 @ 1:15 / #3 @ 1:30\n100 #1 @ 200 Pace @ 2:00\n4 x 25 @ 0:45\n12.5 Kayak Kick / 12.5 Slip Hold Body Line',use:'Mixed-zone aerobic-to-race progression, not one uniform energy system.'},
 {id:'MX02',origin:'N',section:'MAIN SET',focus:['mixed','aerobic'],phases:['base'],label:'Base week rainbow',text:'2 Rounds:\n300 Regeneration 15sR\n200 Development 15sR\n100 Overload 20sR\n4 x 50 #1 Build @ 1:15\n200 Easy',use:'Early-season progression through controlled aerobic zones.'},
 // POST-SETS / RECOVERY
 {id:'PS01',origin:'H',section:'POST SET',focus:['mixed','aerobic','all'],phases:['any'],label:'Technical pull',text:'5 x 200 Pull 10sR',use:'After mixed-zone session, low-intensity aerobic restoration and catch mechanics.'},
 {id:'PS02',origin:'H',section:'POST SET',focus:['aerobic','speed'],phases:['any'],label:'Fins and paddles',text:'800 Fins & Paddles\nMinimum Stroke Count',use:'After kick-quality session, smooth technique and aerobic continuation.'},
 {id:'PS03',origin:'H',section:'POST SET',focus:['aerobic','threshold'],phases:['underwater'],label:'Underwater finish',text:'8 x 100 Fins 20sR\nOdd 25 Underwater / 75 Choice\nEven 75 Choice / 25 Underwater',use:'Technical underwater volume after aerobic work; manage fatigue and safe breath control.'},
 {id:'PS04',origin:'H',section:'POST SET',focus:['threshold'],phases:['any'],label:'Paddle build',text:'12 x 50 Paddles @ 1:00\nBuild',use:'Aerobic-power session, controlled catch pressure and technical rhythm.'},
 {id:'PS05',origin:'H',section:'POST SET',focus:['race','all'],phases:['any'],label:'Minimum stroke count pull',text:'6 x 200 Pull\nMinimum Stroke Count',use:'After race-pace session, aerobic restoration without chasing intensity.'},
 {id:'PS06',origin:'H',section:'POST SET',focus:['mixed','skill'],phases:['any'],label:'Kick with fins',text:'4 x 150 Kick with Fins',use:'After mixed technical or aerobic work, kick maintenance.'},
 {id:'PS07',origin:'N',section:'POST SET',focus:['speed','race'],phases:['any'],label:'Speed-day reset',text:'4 x 100 Choice 15sR\n25 Scull / 25 Drill / 50 Swim\n200 Easy',use:'After top-end speed or anaerobic power, restore movement quality.'},
 {id:'PS08',origin:'N',section:'POST SET',focus:['aerobic'],phases:['base'],label:'Aerobic base technique',text:'4 x 150 Pull 15sR\n50 Scull / 100 Swim\nMinimum Stroke Count',use:'Early-season LCM base work, quiet catch and alignment.'},
];
  for(const r of REFLIB){r.ref=true;r.id=`ref-${r.id.toLowerCase()}`;r.code=r.id.replace(/^ref-/,'').toUpperCase();if(r.section!=='MAIN SET')r.for=r.focus;}
  LIB.push(...REFLIB);
  SM.LIB=LIB;SM.REFLIB=REFLIB;
  // Which kind of session a brief asks for, from its named system.
  function briefKind(named){return({'Development':'aerobic','Regeneration':'aerobic','Threshold':'threshold','Clearance':'threshold','Overload':'mixed','Race pace':'race','Speed / Max':'speed','Skill / Technical':'skill'})[named]||'mixed';}
  // Main-set sequences for a draft, following his progressions (METHODOLOGY 1 "Session progression",
  // 12-13 "Combining energy systems"): builds before race pace, aerobic resets between race-pace sections,
  // short high-quality speed with recovery. Components are added in order while the session still fits.
  function comboKind(combo){const k=(combo||[]).slice().sort().join('+');return({'Development+Speed / Max':'acanc','Race pace+Threshold':'apanp'})[k]||'mixed';}
  const MAIN_SEQ={
    acanc:['dev-200','max-12','dev-100','reset-scull','max-25','dev-mix'],
    apanp:['at-rounds','rp-25','dev-100','rp-50','cl-100'],
    // 13 Oct 2026 (Andy: an Anaerobic Power night should not have offered a "12 x 100 Dev / OL / AT / CL" -- "the sets
    // that popped up in the main set should have all been specific anaerobic power"): each sequence now stays in
    // its own system; the resets between demanding pieces are scull/easy, not another training zone.
    aerobic:['dev-200','dev-400','dev-100','dev-8x200'],
    threshold:['at-rounds','at-200','at-3r','cl-100'],
    race:['rp-25','reset-scull','rp-50','reset-scull','rp-200','rp-6x50','rp-ladder'],
    speed:['max-12','reset-scull','max-25','reset-scull','max-15','max-4x50','max-100'],
    mixed:['reg-400','max-12','rp-25','ol-at-100','reset-scull','rp-50','max-100'],
    skill:['reg-400','dev-mix','dev-100']
  };
  const libById=id=>LIB.find(x=>x.id===id)||M.setLibrary?.byId?.(id)||mySets().find(x=>x.id===id);
  // "Does it remember new sets that are added?" (Andy, 13 Oct 2026) -- yes: every set in a session he writes and
  // saves is offered back under YOUR SETS, newest first, tagged by what the parser and dosage engine make of it.
  // Nothing extra to save; it follows his real sessions. Library sets are not repeated here.
  const SECTION_OF=b=>{const t=`${b?.type||''} ${b?.title||''}`.toLowerCase();return/warm.?up/.test(t)?'WARM UP':/pre/.test(t)?'PRE SET':/post/.test(t)?'POST SET':/warm.?down|swim.?down/.test(t)?'WARM DOWN':/main/.test(t)?'MAIN SET':null;};
  let mineCache={rev:-1,list:[]};
  function mySets(){const rev=Number(M.state?.settings?.storageRevision)||0;if(mineCache.rev===rev)return mineCache.list;
    const seen=new Set(LIB.map(x=>lc(x.text))),out=[];const sessions=Object.values(M.state?.canonicalSessions||{}).filter(x=>x?.identity?.date&&(x.blocks||[]).length).sort((a,b)=>String(b.identity.date+b.identity.dayPart).localeCompare(String(a.identity.date+a.identity.dayPart))).slice(0,40);
    for(const ses of sessions)for(const blk of ses.blocks||[]){const sec=SECTION_OF(blk);if(!sec)continue;for(const it of blk.items||[]){if(it.kind!=='set'&&it.kind!=='group')continue;let t='';try{t=String(M.session?.itemText?.(it)||it.raw||'').trim();}catch{t=String(it.raw||'').trim();}if(!t||t.length>400)continue;const key=lc(t);if(seen.has(key))continue;seen.add(key);
      let fits=[];try{const d=D.session({id:`mine-probe-${ses.id}-${blk.id||''}-${it.id||out.length}`,identity:ses.identity,blocks:[{id:'b',type:blk.type,title:blk.title,items:[it]}]},M.state,{delivered:false});fits=Object.entries(d.systems||{}).filter(([k,v])=>k!=='Unclassified'&&v.metres>0).sort((a,b)=>b[1].metres-a[1].metres).map(([k])=>k);}catch{}
      const first=t.split('\n')[0];const by=ses.lastEditedBy||{};out.push({id:`mine-${out.length}-${first.replace(/[^a-z0-9]+/gi,'-').slice(0,24)}`,section:sec,label:first,text:t,fits,for:['all'],mine:true,author:by.role&&by.role!=='owner'?(String(by.name||'').split(/[\s@]/)[0]||'Assistant'):'Andy',from:`${ses.identity.date} ${ses.identity.dayPart||''}`.trim()});if(out.length>=60)break;}}
    mineCache={rev,list:out};return out;}
  SM.mySets=mySets;
  function pick(section,kind){return LIB.find(x=>x.section===section&&(x.for||[]).includes(kind))||LIB.find(x=>x.section===section);}
  function composeText(parts){const order=['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'];return order.filter(h=>parts[h]?.length).map(h=>`${h}\n${parts[h].join('\n')}`).join('\n\n');}
  function draftFromBrief(identity,state=M.state,{focus=null}={}){
    const probe={id:'draft-probe',identity,blocks:[],metadata:focus?{coachFocus:focus}:{}},b=brief(probe,state),combo=b&&b.source!=='none'&&!b.coachFocus?comboSystems(b.system):null,named=b&&b.source!=='none'?(combo?combo[0]:(namedSystem(b.system)||namedSystem(b.weekFocus))):null,kind=combo?comboKind(combo):briefKind(named);
    const parts={'WARM UP':[pick('WARM UP',kind).text],'PRE SET':[pick('PRE SET',kind).text],'MAIN SET':[],'POST SET':[],'WARM DOWN':[libById('wd').text]};
    const limit=(slotMinutes(identity)||90)*60;const dur=()=>{try{const s=M.parser.parse(composeText(parts),{...identity,id:'draft-probe'});return M.contextEngineAV?.plannedTimeline?.(s)?.durationSeconds||0;}catch{return 0;}};
    // A component that would overrun the slot is skipped and the next (usually shorter) one is tried.
    for(const id of MAIN_SEQ[kind]||MAIN_SEQ.mixed){const c=libById(id);if(!c)continue;parts['MAIN SET'].push(c.text);if(parts['MAIN SET'].length>1&&dur()>limit-5*60)parts['MAIN SET'].pop();}
    // The session's main purpose must be in the main set. If the first pass ran out of time before any set of
    // the chosen system went in, try each one at the end; if none fits, shorten the warm-up and pre-set to
    // the quickest of his options and try again (METHODOLOGY 1: "there should normally be a clear primary
    // purpose").
    // A combination day needs a set of EACH system (13 Oct 2026).
    const needs=(combo||[named]).filter(k=>k&&k!=='Skill / Technical');
    const fitsAny=(c,k)=>(c.fits||[]).includes(k);
    const missingNeed=()=>needs.find(k=>!parts['MAIN SET'].some(t=>LIB.some(c=>c.text===t&&fitsAny(c,k))))||null;
    const hasPrimary=()=>!missingNeed();
    const tryPrimary=()=>{let k=missingNeed();while(k){let ok=false;for(const c of(MAIN_SEQ[kind]||[]).map(libById).filter(c=>c&&fitsAny(c,k))){parts['MAIN SET'].push(c.text);if(dur()<=limit-5*60){ok=true;break;}parts['MAIN SET'].pop();}if(!ok)return false;k=missingNeed();}return true;};
    if(needs.length&&!hasPrimary()&&!tryPrimary()){
      const before={...parts,'MAIN SET':[...parts['MAIN SET']]};
      const quickest=sec=>{let best=null,bt=Infinity;for(const c of LIB.filter(x=>x.section===sec&&!x.ref)){const t=(()=>{try{const s=M.parser.parse(`${sec}\n${c.text}`,{...identity,id:'q'});return M.contextEngineAV?.plannedTimeline?.(s)?.durationSeconds||0;}catch{return Infinity;}})();if(t<bt){bt=t;best=c;}}return best;};
      const wu=quickest('WARM UP'),pre=quickest('PRE SET');if(wu)parts['WARM UP']=[wu.text];if(pre)parts['PRE SET']=[pre.text];
      while(parts['MAIN SET'].length&&!tryPrimary())parts['MAIN SET'].pop();
      if(!hasPrimary())Object.assign(parts,before);
    }
    // A reset only belongs between demanding sections -- never as the last thing in the main set.
    while(parts['MAIN SET'].length&&parts['MAIN SET'][parts['MAIN SET'].length-1]===libById('reset-scull').text)parts['MAIN SET'].pop();
    const post=pick('POST SET',kind);parts['POST SET'].push(post.text);if(dur()>limit)parts['POST SET']=[];
    // Base/aerobic phase: the anaerobic pieces keep their purpose with a little more recovery.
    parts['MAIN SET']=parts['MAIN SET'].map(t=>{const c=LIB.find(x=>x.text===t);return c?adjustForPhase(c,b).text:t;});
    return{text:composeText(parts),kind,named,minutes:Math.round(dur()/60),limit:Math.round(limit/60)};
  }
  SM.draftFromBrief=draftFromBrief;
  // Insert a component under its heading (after that section's last line), adding the heading if missing.
  function insertComponent(textValue,section,setText){
    const lines=String(textValue||'').replace(/\s+$/,'').split('\n');const isHead=l=>/^\s*(warm\s*-?\s*up|pre\s*-?\s*set|main(\s*set)?|post\s*-?\s*set|warm\s*-?\s*down|swim\s*down)\s*:?\s*$/i.test(l);
    const want=new RegExp('^\\s*'+section.replace(/\s+/g,'\\s*-?\\s*')+'\\s*:?\\s*$','i');let at=lines.findIndex(l=>want.test(l));
    if(at<0){return(lines.join('\n').trim()?lines.join('\n')+'\n\n':'')+`${section}\n${setText}`;}
    let end=at+1;while(end<lines.length&&!isHead(lines[end]))end++;while(end>at+1&&!lines[end-1].trim())end--;
    lines.splice(end,0,setText);return lines.join('\n');
  }
  SM.insertComponent=insertComponent;
  // In an aerobic/base phase, anaerobic pieces keep their purpose but get a little more recovery (Andy, 13 Oct
  // 2026: "if anything, slightly extended in the recovery because it's an aerobic training phase"): +15s on each
  // send-off of a Race-pace or Speed/Max set.
  const PHASE_EXTRA_S=15;
  // 15 Oct 2026: which season phase a brief is in -- the season planner's phases (Base Skills, Under Water, Dives &
  // Turns, Finish & Breath Control, Taper & Race), read from the phase label first, then the week's focus text.
  // Replaces a looser test that matched "aerobic" anywhere, so "Anaerobic Power" / "Anaerobic Capacity" weeks
  // (which contain the letters "aerobic") were wrongly treated as the aerobic base phase.
  function phaseKey(b){const tests=[[/\bbase\b|general\s+prep/i,'base'],[/under\s*-?\s*water/i,'underwater'],[/\bdives?\b|\bturns?\b/i,'turns'],[/\bfinish|breath\s+control/i,'finish'],[/\btaper|\brace\s+(?:week|prep)|peak/i,'taper']];
    for(const t of [b?.phase,b?.weekFocus]){const x=String(t||'');for(const[re,k]of tests)if(re.test(x))return k;}
    return /(^|[^n])aerobic\s+capacity/i.test(String(b?.weekFocus||''))?'base':'';}
  SM.phaseKey=phaseKey;
  function baseLike(b){return phaseKey(b)==='base';}
  // 15 Oct 2026 (Andy: "in an aerobic capacity phase there might be longer recovery between swims"): his library's
  // Aerobic Power / Anaerobic Power / Anaerobic Capacity main sets get the same treatment -- +15s on each send-off
  // and +10s on each "NNsR" rest -- so the harder sets keep their purpose with a more aerobic feel.
  const PHASE_EXTRA_REST_S=10;
  function hardSet(c){return(c.fits||[]).some(k=>k==='Race pace'||k==='Speed / Max')||(c.ref&&(c.focus||[]).some(k=>['race','speed','threshold'].includes(k)));}
  function adjustForPhase(c,b){if(!c||c.section!=='MAIN SET'||!baseLike(b)||!hardSet(c))return c;
    let t=c.text.replace(/@\s*(\d{1,2}):(\d{2})/g,(m,mm,ss)=>{const v=Number(mm)*60+Number(ss)+PHASE_EXTRA_S;return`@${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;});
    if(c.ref)t=t.replace(/\b(\d{1,2})sR\b/g,(m,n)=>`${Number(n)+PHASE_EXTRA_REST_S}sR`);
    return t===c.text?c:{...c,text:t,label:`${c.label} · +recovery (aerobic phase)`,phaseAdjusted:true};}
  SM.adjustForPhase=adjustForPhase;
  // Sets this squad has swum in the last few days are not offered again as suggestions (Andy: Jordan "kind of did
  // the same set I did last night").
  // 15 Oct 2026: a set is identified by its first real line -- for a rounds block, the "N Rounds:" line plus the
  // first line inside it, so two different "3 Rounds:" sets are not mistaken for each other.
  function setKey(t){const ls=String(t||'').split('\n').map(x=>lc(x).replace(/\s+/g,' ').trim()).filter(Boolean);if(!ls.length)return'';return /^\d+\s*(?:x\s*)?rounds?\s*:?$/.test(ls[0])&&ls[1]?`${ls[0]} ${ls[1]}`:ls[0];}
  function itemKeys(session){const keys=new Set();for(const blk of session?.blocks||[])for(const it of blk.items||[]){let t='';try{t=String(M.session?.itemText?.(it)||it.raw||'');}catch{t=String(it.raw||'');}const k=setKey(t);if(k)keys.add(k);}return keys;}
  function recentSetKeys(session,days=3){const id=session?.identity||{},squads=new Set(id.squads||[]),date=id.date||'';if(!date)return new Set();const from=new Date(Date.parse(date)-days*864e5).toISOString().slice(0,10);const keys=new Set();
    for(const s of Object.values(M.state?.canonicalSessions||{})){const d=s?.identity?.date||'';if(!s||s.id===session.id||d<from||d>date||!(s.identity.squads||[]).some(q=>squads.has(q)))continue;
      for(const k of itemKeys(s))keys.add(k);}
    return keys;}
  const firstKey=x=>setKey(x.text);
  // ---------------------------------------------------------------------------
  // Stage-by-stage suggestions (15 Oct 2026, Andy: "when you're writing ... it's the start of the set you're
  // writing the warm-up, warm-up options come; once you've got the warm-up sussed then it comes up with preset
  // options and all of those options need to be tied back to the weekly plan objective and then have cues from
  // the season plan"). The panel offers options for ONE part of the session at a time, in his order. The stage
  // is the first part not written yet -- except that a main set which is off brief keeps the main-set stage
  // until it hits the brief. The coach can tap any stage to lead instead. Options are drawn from his reference
  // library and earlier components, narrowed to the session's focus and ranked by the season phase and the
  // week's technical focus; anything swum by this squad in the last 3 days, or already in the session, is left out.
  // ---------------------------------------------------------------------------
  const STAGES=['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'];
  const STAGE_LABEL={'WARM UP':'Warm-up','PRE SET':'Pre-set','MAIN SET':'Main set','POST SET':'Post-set','WARM DOWN':'Warm-down'};
  let writerStage;SM.writerStage=()=>writerStage;
  function filledStages(session){const out=new Set();for(const blk of session?.blocks||[]){const sec=SECTION_OF(blk);if(sec&&(blk.items||[]).some(i=>i.kind==='set'||i.kind==='group'||i.kind==='component'))out.add(sec);}return out;}
  function autoStage(session,chk){const f=filledStages(session);if(f.has('MAIN SET')&&chk?.checked&&!chk.matches)return'MAIN SET';return STAGES.find(x=>!f.has(x))||null;}
  SM.autoStage=autoStage;SM.filledStages=filledStages;
  function sessionKinds(b,chk){if(!b||b.source==='none')return{kinds:['mixed'],systems:[],combo:null};const combo=chk?.combo?.systems||(b.coachFocus?null:comboSystems(b.system));const named=chk?.plannedSystem||namedSystem(b.system);
    const systems=(combo||[named]).filter(Boolean);const kinds=[...new Set(systems.map(briefKind))];if(combo)kinds.push(comboKind(combo));return{kinds:kinds.length?kinds:['mixed'],systems,combo,named};}
  const entryKinds=x=>x.focus||(x.section==='MAIN SET'?(x.fits||[]).map(briefKind):(x.for||[]));
  function fitsFocus(x,k){if(x.section==='MAIN SET'){if(x.focus)return x.focus.some(f=>k.kinds.includes(f))||(k.kinds.includes('mixed')&&!k.systems.length);
      if(!k.systems.length)return true;const allowed=new Set([...k.systems,'Skill / Technical','Regeneration']);return(x.fits||[]).length>0&&(x.fits||[]).every(z=>allowed.has(z))&&(x.fits||[]).some(z=>z!=='Skill / Technical'&&z!=='Regeneration');}
    const ek=entryKinds(x);return ek.includes('all')||ek.some(f=>k.kinds.includes(f));}
  function scoreFor(x,k,phase,techWords){let sc=0;const ek=entryKinds(x);
    if(x.section!=='MAIN SET')sc+=ek.some(f=>k.kinds.includes(f))?3:ek.includes('all')?1:0;else sc+=3;
    const ph=x.phases||['any'];sc+=phase?(ph.includes(phase)?2:ph.includes('any')?1:0):1;
    if(techWords.length){const t=lc(`${x.label} ${x.text} ${x.use||''}`);if(techWords.some(w=>t.includes(w)))sc+=1;}
    if(x.ref)sc+=0.5;return sc;}
  function stageOptions(session,state,b,chk,stage){
    const k=sessionKinds(b,chk),phase=b&&b.source!=='none'?phaseKey(b):'',techWords=b?.technical?focusTerms(b.technical).flatMap(x=>x.words):[];
    // Warm-downs are meant to repeat; everything else already in this session or swum by the squad in the last 3
    // days is left out.
    const here=itemKeys(session),recent=recentSetKeys(session);
    const keysOf=x=>{const a=firstKey(x);let b2=a;try{b2=b?firstKey(adjustForPhase(x,b)):a;}catch{}return[a,b2];};
    const notUsed=x=>stage==='WARM DOWN'||keysOf(x).every(k=>!here.has(k)&&!recent.has(k));
    const inPhase=x=>!x.strict||(x.phases||[]).includes(phase);
    // 19 Oct 2026: options come from the set library (engines/set-library.js) -- Andy's sets, his sessions' sets, coach
    // sets, Claude's variations -- kept sets plus at most one new one waiting for his review; a set flagged by the sense
    // check (e.g. 200 #1 hands by side) or dropped by him is never offered.
    const SLB=M.setLibrary,SRC=SLB?SLB.all().filter(x=>x.status==='approved'||x.status==='proposed'):LIB;
    let pool=SRC.filter(x=>x.section===stage&&notUsed(x)&&inPhase(x)&&fitsFocus(x,k));
    if(!pool.length&&stage!=='MAIN SET')pool=SRC.filter(x=>x.section===stage&&notUsed(x)&&inPhase(x));
    const ranked=pool.map((x,i)=>({x,sc:scoreFor(x,k,phase,techWords)-(x.status==='proposed'?0.75:0),i})).sort((p,q)=>q.sc-p.sc||p.i-q.i).map(o=>o.x);
    // A phase-specific set from another phase is kept for "more", never the top list.
    const inPh=ranked.filter(x=>!phase||(x.phases||['any']).includes(phase)||(x.phases||['any']).includes('any'));
    // Andy: "poor and similar" -- six DIFFERENT options (no two from the same set or starting the same way, a mix of
    // authors), turning over day to day.
    // His own sets from earlier sessions that fit come first (up to two), then the rest of the variety.
    let top=inPh.slice(0,5);if(SLB?.varied){const fromMine=stage==='MAIN SET'?inPh.filter(x=>x.origin==='session').filter((x,i,a)=>a.findIndex(y=>y.text.split('\n')[0].trim().toLowerCase()===x.text.split('\n')[0].trim().toLowerCase())===i).slice(0,2):[];
      top=[...fromMine,...SLB.varied(inPh.filter(x=>!fromMine.includes(x)),{limit:6-fromMine.length,taken:fromMine,date:String(session?.identity?.date||''),score:x=>scoreFor(x,k,phase,techWords)-(x.status==='proposed'?0.75:0)})].map(x=>x.origin==='session'&&x.from?{...x,label:`${x.label} · yours (${x.from})`}:x);}
    let mine=[];if(!SLB&&stage==='MAIN SET'&&k.systems.length){try{const allowed=new Set([...k.systems,'Skill / Technical','Regeneration']);mine=mySets().filter(x=>x.section==='MAIN SET'&&(x.fits||[]).length&&(x.fits||[]).every(z=>allowed.has(z))&&(x.fits||[]).some(z=>z!=='Skill / Technical'&&z!=='Regeneration')&&notUsed(x)).slice(0,2).map(x=>({...x,label:`${x.label} · yours (${x.from})`}));}catch{}}
    // On a combination day, the system the main set is still missing comes first.
    if(stage==='MAIN SET'&&k.combo&&chk?.combo?.missing?.length){const miss=chk.combo.missing.map(briefKind);top.sort((p,q)=>(entryKinds(q).some(f=>miss.includes(f))?1:0)-(entryKinds(p).some(f=>miss.includes(f))?1:0));}
    return{top:[...top,...mine],more:ranked.filter(x=>!top.includes(x)),phase,k};
  }
  SM.stageOptions=stageOptions;
  const PHASE_LABEL={base:'Base Skills (aerobic) phase',underwater:'Under Water phase',turns:'Dives & Turns phase',finish:'Finish & Breath Control phase',taper:'Taper & Race phase'};
  function suggestionsHtml(session,state,b,chk){
    const noPlan=!b||b.source==='none';
    const filled=filledStages(session),auto=autoStage(session,noPlan?null:chk),stage=writerStage||auto||'MAIN SET';
    const opts=stageOptions(session,state,noPlan?null:b,noPlan?null:chk,stage);
    const k=opts.k,focusLabel=k.combo?k.combo.map(x=>COACH_TERM[x]||x).join(' + '):k.named?sysLabel(k.named):'';
    const chips=`<div class="msos-stages" data-msos-stages>${STAGES.map(x=>`<button type="button" data-msos-stage="${esc(x)}" class="${x===stage?'on':''}${filled.has(x)?' done':''}">${filled.has(x)?'✓ ':''}${esc(STAGE_LABEL[x])}</button>`).join('')}</div>`;
    const squads=(session?.identity?.squads||[]).map(lc);
    const squadNote=squads.length&&!squads.some(q=>/national/.test(q))?`<p class="msos-stage-note">These sets are written for the National squad — scale or simplify them for ${esc((session.identity.squads||[]).join(' + '))}. Sets for the younger squads are the next step.</p>`:'';
    const phaseNote=!noPlan&&opts.phase?`<p class="msos-stage-note">${esc(PHASE_LABEL[opts.phase]||'')}${opts.phase==='base'?' — harder sets shown with longer recovery':''}${b.technical?` · technical focus: ${esc(b.technical)}`:''}</p>`:'';
    const planNote=noPlan?`<p class="muted">No season or weekly plan on this phone for this session yet, so these aren't matched to a brief. The head coach's plan arrives automatically once this phone is signed in and online.</p>`:'';
    const rows=opts.top.map(x=>noPlan?x:adjustForPhase(x,b));
    const head=`<div class="msos-check-title">FROM YOUR PROGRAMMING${focusLabel?` · ${esc(focusLabel)}`:''} · ${esc(STAGE_LABEL[stage].toUpperCase())} OPTIONS</div>`;
    const list=rows.length?rows.map(fitRow).join(''):`<p class="muted">Nothing in your programming for this part yet${stage==='MAIN SET'&&!noPlan?" matches today's focus":''} — write it in, or pick another part above.</p>`;
    const more=opts.more.length?`<details class="msos-more" data-msos-stage-more><summary>More ${esc(STAGE_LABEL[stage].toLowerCase())} options (${opts.more.length})</summary>${opts.more.map(x=>fitRow(noPlan?x:adjustForPhase(x,b))).join('')}</details>`:'';
    const libBtn=M.setLibrary?`<div class="hub-actions"><button type="button" data-sl-open data-sl-tab="${(M.access?.role?.()||'owner')==='owner'&&(M.setLibrary.counts().proposed||0)?'waiting':'approved'}">Set library · ${M.setLibrary.counts().total} sets${(M.setLibrary.counts().proposed||0)?` · ${M.setLibrary.counts().proposed} waiting`:''}</button></div>`:'';
    return`<div class="msos-fits" data-msos-stage-panel="${esc(stage)}">${planNote}${chips}${phaseNote}${squadNote}${head}${list}${more}${libBtn}${moreHtml(k.kinds[0]||'mixed',k.named||null,k.combo,noPlan?null:b)}</div>`;
  }
  function fitRow(x){const SLB=M.setLibrary,a=x.author||(x.ref?(x.origin==='N'?'ChatGPT':'Andy'):'Andy'),wait=x.status==='proposed',own=(M.access?.role?.()||'owner')==='owner';
    const who=SLB?`${M.setLibraryUI?.chip?.(a)||esc(a)}${wait?'<span class="sl-new">new · not reviewed</span>':''}`:'';
    const rev=SLB&&wait&&own?`<span class="sl-quick"><button type="button" class="sl-yes" data-msos-review="${esc(x.id)}" data-v="approved" title="Keep">✓</button><button type="button" class="sl-no" data-msos-review="${esc(x.id)}" data-v="rejected" title="Drop">✗</button></span>`:'';
    return`<div class="msos-fit"><div>${who}<b>${esc(x.label)}</b>${x.use?`<small class="msos-use">${esc(x.use)}${x.ref&&!SLB?` · ${x.origin==='N'?'example in your style':'from your sessions'}`:''}</small>`:''}<small>${esc(x.section)} · ${esc(x.text.replace(/\n/g,' / '))}</small></div>${rev}<button type="button" data-msos-insert="${esc(x.id)}">Add</button></div>`;}
  // Every component, by section, so the coach can lead: pick any piece of his programming, not only the
  // ones matched to today's focus. Matched pieces are listed first within each section.
  function moreHtml(kind,named,combo=null,b=null){
    const order=['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'];let mine=[];try{mine=mySets();}catch{}
    // With a brief, main-set pieces for today's system come first; everything else is still there to lead with,
    // under "Other systems", so the coach can override -- but it is never mixed in with today's.
    const want=new Set((combo||[named]).filter(Boolean)),hasBrief=want.size>0,wantKinds=new Set([...want].map(briefKind)),fitsBrief=x=>hasBrief&&(x.focus?x.focus.some(f=>wantKinds.has(f)):(x.fits||[]).some(k=>want.has(k))&&(x.fits||[]).every(k=>want.has(k)||k==='Skill / Technical'||k==='Regeneration'));
    const tag=x=>({...x,label:`${x.label}${x.fits?.[0]?` · ${(x.fits||[]).map(k=>COACH_TERM[k]||k).filter((v,i,a)=>a.indexOf(v)===i).join(' / ')}`:''}`});
    const split=(rows,title)=>{if(!hasBrief)return`<div class="msos-check-title">${esc(title)}</div>${rows.map(fitRow).join('')}`;const on=rows.filter(x=>x.section!=='MAIN SET'||fitsBrief(x)),off=rows.filter(x=>x.section==='MAIN SET'&&!fitsBrief(x));return`<div class="msos-check-title">${esc(title)}</div>${on.map(x=>fitRow(adjustForPhase(x,b))).join('')}${off.length?`<div class="msos-check-title msos-other">Other systems (not today's focus)</div>${off.map(fitRow).join('')}`:''}`;};
    const mineHtml=mine.length?`<div class="msos-more-sec">${split(mine.slice(0,25).map(tag),"YOUR SETS · from sessions you've written")}</div>`:'';
    const rank=x=>x.section==='MAIN SET'?(fitsBrief(x)?0:1):(((x.for||[]).includes(kind)||(x.for||[]).includes('all'))?0:1);
    return`<details class="msos-more" data-msos-more><summary>All your components (${LIB.length+mine.length})</summary>${mineHtml}${order.map(sec=>{const rows=LIB.filter(x=>x.section===sec).sort((a,b)=>rank(a)-rank(b));return`<div class="msos-more-sec">${sec==='MAIN SET'?split(rows.map(tag),sec):`<div class="msos-check-title">${esc(sec)}</div>${rows.map(fitRow).join('')}`}</div>`;}).join('')}</details>`;
  }
  function startersHtml(identity,focus=null){const last=lastSameSlot(identity);const day=weekdayOf(identity?.date||'');const label=day?`${day[0].toUpperCase()}${day.slice(1)} ${identity?.dayPart||''}`.trim():'';
    const plan=planBrief({id:'focus-probe',identity,blocks:[]});const planNamed=plan&&plan.source!=='none'?(namedSystem(plan.system)||namedSystem(plan.weekFocus)):null;
    const focusRow=`<div class="msos-focus" data-msos-focus-row><span>Focus:</span><button type="button" data-msos-focus=""${!focus?' class="on"':''}>${planNamed?`Plan · ${esc(COACH_TERM[planNamed]||planNamed)}`:'Plan'}</button>${FOCUS_OPTIONS.map(([k,l])=>`<button type="button" data-msos-focus="${esc(k)}"${focus===k?' class="on"':''}>${esc(l)}</button>`).join('')}</div>`;
    return`${focusRow}<div class="msos-starters" data-msos-starters><span>Start from:</span><button type="button" class="msos-start-main" data-msos-start="draft">Draft from brief</button><button type="button" data-msos-start="template">Session template</button>${last?`<button type="button" data-msos-start="last" data-msos-last="${esc(last.id)}">Last ${esc(label)} (${esc(last.identity.date)})</button>`:''}</div>`;}
  SM.lastSameSlot=lastSameSlot;
  // ---------------------------------------------------------------------------
  // Session check (10 Oct 2026, Andy: "Can we give more suggestions and assessment around session
  // building"). Plain checks computed from the draft and the app's own data -- no invented targets:
  //   time      -- planned duration (engines/context-engine-av.js plannedTimeline) vs the slot length
  //   technical -- is the brief's technical focus named anywhere in the session
  //   stroke    -- the season week's stroke of the week appears in the session
  //   structure -- a warm-up and a warm-down block exist
  //   last time -- distance vs the last session for the same squad, weekday and slot
  //   week      -- strokes the squad has not touched yet this week (Mon-Sun, planned sessions)
  // Ideas appear only when the main set is off brief, using the coaching rules already settled for this app
  // (Andy's energy-system definitions; CLAUDE.md 2.45 race-pace recovery, 2.46 aerobic real rest).
  // ---------------------------------------------------------------------------
  const IDEAS={
    'Development':'Aerobic Capacity: aerobic base — longer swims or repeats at steady pace with real rest (about 10–30s).',
    'Threshold':'Aerobic Power: threshold-type repeats on real rest (about 10–30s), paced from T400.',
    'Clearance':'Aerobic Power (top end): hard aerobic repeats, HR gauge, real rest.',
    'Race pace':'Anaerobic Power: race-pace / lactate-tolerance work, e.g. 50s @100p or @200p — 100-pace about 1:2 work:rest, 200-pace about 30–40s recovery.',
    'Speed / Max':'Anaerobic Capacity: top-end speed — short MAX efforts (12.5–25), assisted / resisted, long recovery.',
    'Overload':'Aerobic + Anaerobic Capacity: aerobic volume with short top-end efforts mixed in.',
    'Skill / Technical':'Skills: drill / scull / technique sets with simple recovery.'
  };
  const STOP=new Set(['with','under','the','and','into','from','over','per','for','your','each','stroke','work','quality','set','sets','focus','main','event','individual','direction','detail','details','skills','skill']);
  function focusTerms(t){return text(t).split(/[·,;/]+/).map(x=>x.trim()).filter(Boolean).map(ph=>({phrase:ph,words:ph.toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3&&!STOP.has(w)).map(w=>w.replace(/s$/,''))})).filter(x=>x.words.length);}
  function sessionWords(session){return lc((session.blocks||[]).map(b=>[b.title,...(b.items||[]).map(function walk(i){return [i.raw,i.text,...(i.cues||[]),...((i.items||[]).map(walk))].join(' ');})].join(' ')).join(' '));}
  function clockMin(sec){const m=Math.round(sec/60);return`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;}
  function slotMinutes(id){const a=String(id?.start||'').match(/^(\d{1,2}):(\d{2})/),b=String(id?.end||'').match(/^(\d{1,2}):(\d{2})/);if(!a||!b)return 0;return (Number(b[1])*60+Number(b[2]))-(Number(a[1])*60+Number(a[2]));}
  function weekMonday(iso){const t=Date.parse(`${iso}T12:00:00Z`);if(!Number.isFinite(t))return'';const d=new Date(t),dow=(d.getUTCDay()+6)%7;return new Date(t-dow*86400000).toISOString().slice(0,10);}
  function assess(session,state=M.state,b=null,chk=null){
    const rows=[],id=session?.identity||{},blocks=session?.blocks||[];if(!blocks.some(x=>(x.items||[]).length))return rows;
    let dose=null;try{dose=D.session(session,state,{delivered:false});}catch{}
    const total=Math.round(dose?.rawMetres||M.session?.total?.(session)||0);
    // time
    try{const tl=M.contextEngineAV?.plannedTimeline?.(session),mins=slotMinutes(id);if(tl?.durationSeconds){const over=tl.durationSeconds/60-mins;rows.push(mins?{ok:over<=0,kind:'time',text:over<=0?`About ${clockMin(tl.durationSeconds)} of a ${clockMin(mins*60)} session — fits`:`About ${clockMin(tl.durationSeconds)} — about ${Math.round(over)} min over the ${clockMin(mins*60)} slot`}:{ok:true,kind:'time',text:`About ${clockMin(tl.durationSeconds)} including transitions`});}}catch{}
    // structure
    const titles=blocks.map(x=>lc(`${x.type||''} ${x.title||''}`));
    const hasWU=titles.some(t=>/warm.?up|warm_up/.test(t)),hasWD=titles.some(t=>/warm.?down|warm_down|swim.?down/.test(t));
    if(!hasWU||!hasWD)rows.push({ok:false,kind:'structure',text:`No ${[!hasWU&&'warm-up',!hasWD&&'warm-down'].filter(Boolean).join(' or ')} block`});
    // technical focus
    if(b?.technical){const terms=focusTerms(b.technical),words=sessionWords(session),hit=terms.filter(x=>x.words.some(w=>words.includes(w)));
      rows.push(hit.length?{ok:true,kind:'technical',text:`Technical focus in the session: ${hit.map(x=>x.phrase).join(', ')}`}:{ok:false,kind:'technical',text:`Technical focus (${b.technical}) isn't named in any set — add a cue or a skill block`});}
    // stroke of the week
    if(b?.weekStroke&&/^(freestyle|backstroke|breaststroke|butterfly)$/i.test(b.weekStroke)){const m=Math.round(dose?.strokes?.[b.weekStroke]?.metres||0);rows.push(m>0?{ok:true,kind:'stroke',text:`Stroke of the week (${b.weekStroke}): ${m.toLocaleString()}m`}:{ok:false,kind:'stroke',text:`Stroke of the week is ${b.weekStroke} — none in this session yet`});}
    // last time
    try{const last=lastSameSlot(id,state);if(last&&last.id!==session.id){const lt=Math.round(M.session?.total?.(last)||0);if(lt>0&&total>0){const pct=Math.round((total-lt)/lt*100);rows.push({ok:true,kind:'last',text:`Last ${weekdayOf(last.identity.date).replace(/^./,c=>c.toUpperCase())} ${last.identity.dayPart||''} (${last.identity.date}): ${lt.toLocaleString()}m — this one ${total.toLocaleString()}m (${pct>=0?'+':'−'}${Math.abs(pct)}%)`});}}}catch{}
    // week stroke balance
    try{const mon=weekMonday(id.date||'');if(mon){const end=new Date(Date.parse(`${mon}T12:00:00Z`)+6*86400000).toISOString().slice(0,10),sq=(id.squads||[]).map(lc);
      const others=Object.values(state?.canonicalSessions||{}).filter(x=>x?.id!==session.id&&x?.identity?.date>=mon&&x.identity.date<=end&&(!sq.length||(x.identity.squads||[]).some(q=>sq.includes(lc(q)))));
      const strokes={Freestyle:0,Backstroke:0,Breaststroke:0,Butterfly:0};for(const x of [session,...others]){let d=null;try{d=x===session?dose:D.session(x,state,{delivered:false});}catch{}for(const k of Object.keys(strokes))strokes[k]+=Number(d?.strokes?.[k]?.metres||0);}
      // IM work covers all four strokes.
      let im=0;for(const x of [session,...others]){let d=null;try{d=x===session?dose:D.session(x,state,{delivered:false});}catch{}im+=Number(d?.strokes?.IM?.metres||0);}
      const missing=im>0?[]:Object.keys(strokes).filter(k=>!strokes[k]);if(missing.length&&missing.length<4)rows.push({ok:false,kind:'week',text:`This week so far (${others.length+1} session${others.length?'s':''}) has no ${missing.join(' or ')}`});}}catch{}
    // progression (METHODOLOGY 1 "Session progression"): builds before race pace, aerobic resets between
    // race-pace sections, a pre-set that prepares a fast main set.
    try{const seq=[];for(const blk of blocks){const isPre=/pre/i.test(`${blk.type} ${blk.title}`);(function walk(items){for(const it of items||[]){if(it.kind==='group'){walk(it.items);continue;}if(it.kind!=='set')continue;let sys='';try{sys=D.systemFrom('',it);}catch{}const raw=lc([it.raw,...(it.cues||[])].join(' '));seq.push({blk,isPre,sys,build:/\bbuild\b|\bdesc/.test(raw),easy:sys==='Regeneration'||/\b(easy|scull|loosen|recovery)\b/.test(raw)});}})(blk.items);}
      const fast=i=>i.sys==='Race pace'||i.sys==='Speed / Max';
      const firstFast=seq.findIndex(fast);if(firstFast>=0&&!seq.slice(0,firstFast).some(x=>x.build||x.isPre||fast(x)))rows.push({ok:false,kind:'progression',text:'Race-pace or MAX work comes before any build or pre-set — your structure puts progressive builds first'});
      let flagged=false;
      const fastIdx=seq.map((x,i)=>fast(x)?i:-1).filter(i=>i>=0);for(let k=1;k<fastIdx.length&&!flagged;k++){const between=seq.slice(fastIdx[k-1]+1,fastIdx[k]);if(!between.length||!between.some(y=>y.easy||['Development','Overload','Threshold','Clearance'].includes(y.sys)))flagged=true;}
      if(flagged)rows.push({ok:false,kind:'progression',text:'Two race-pace / MAX sections run back to back — add an aerobic reset, scull or easy swim between them'});
      const mainFast=seq.some(x=>!x.isPre&&fast(x)),pre=seq.filter(x=>x.isPre);if(mainFast&&pre.length&&!pre.some(x=>x.build||fast(x)))rows.push({ok:false,kind:'progression',text:'The main set has race-pace / MAX work but the pre-set has no builds or speed — e.g. Speed preparation or Race-pace activation'});
    }catch{}
    // ideas when off brief
    if(chk?.checked&&!chk.matches&&IDEAS[chk.plannedSystem])rows.push({ok:null,kind:'idea',text:`Idea — ${IDEAS[chk.plannedSystem]}`});
    return rows;
  }
  SM.assess=assess;
  function checkRowsHtml(session,state,b,chk){let rows=[];try{rows=assess(session,state,b,chk);}catch{}if(!rows.length)return'';
    return`<div class="msos-check" data-msos-check><div class="msos-check-title">SESSION CHECK</div>${rows.map(r=>`<div class="msos-check-row ${r.ok===true?'ok':r.ok===false?'warn':'idea'}" data-check="${esc(r.kind)}"><span aria-hidden="true">${r.ok===true?'✓':r.ok===false?'⚠':'→'}</span><span>${esc(r.text)}</span></div>`).join('')}</div>`;}
  function briefHtml(session,state=M.state,{compact=false}={}){
    const b=brief(session,state),owner=(M.access?.role?.()||'owner')==='owner';
    if(!b||b.source==='none'){
      return`<section class="msos-brief msos-brief-none" data-msos-brief><div class="eyebrow">TODAY'S BRIEF</div><p>No plan covers this session yet${b?.staleWeek?' (last season has finished)':''}. Pick a focus above to get suggestions, or just write or paste the session.${seasonNote()}</p>${owner?seasonButton():''}${compact?'':checkRowsHtml(session,state,b,null)}${compact?'':suggestionsHtml(session,state,b,null)}</section>`;
    }
    const chk=planTargetCheck(session,state,b);
    const head=[b.slot,b.source==='standard'?b.squad:''].filter(Boolean).join(' · ');
    let verdict='';
    if(chk.checked&&chk.combo){
      const where=chk.basis==='main set'?'Main set':'Session',names=chk.combo.systems.map(sysLabel);
      verdict=chk.matches?`<div class="msos-brief-check ok">✓ ${where} has both ${esc(names.join(' and '))} — on brief</div>`
        :`<div class="msos-brief-check off">⚠ ${where} has no ${esc(chk.combo.missing.map(sysLabel).join(' or '))} yet — ${b.coachFocus?'you chose':'brief asks for'} ${esc(b.system)}</div>`;
      verdict+=`<p class="msos-brief-mix">${chk.combo.share.map(x=>`${esc(COACH_TERM[x.k]||x.k)} ${x.pct}%`).join(' · ')} of the ${esc(chk.basis)} · Whole session: ${chk.mix.map(x=>`${esc(x.label)} ${x.pct}%`).join(' · ')}</p>`;
    }else if(chk.checked){
      const p=sysLabel(chk.plannedSystem);
      verdict=chk.matches&&chk.aerobicPhase
        ?`<div class="msos-brief-check ok">✓ ${chk.basis==='main set'?'Main set':'Session'} is the aerobic-phase version of ${esc(sysLabel(chk.plannedSystem))} — mostly aerobic, with ${chk.plannedPct}% ${esc(COACH_TERM[chk.plannedSystem]||chk.plannedSystem)} — on brief</div>`
        :chk.matches
        ?`<div class="msos-brief-check ok">✓ ${chk.basis==='main set'?'Main set':'Session'} is ${esc(sysLabel(chk.dominantSystem))} — on brief</div>`
        :`<div class="msos-brief-check off">⚠ ${chk.basis==='main set'?'Main set':'Session'} is mostly ${esc(sysLabel(chk.dominantSystem))} — ${b.coachFocus?'you chose':'brief asks for'} ${esc(p)}</div>`;
      verdict+=`<p class="msos-brief-mix">${esc(chk.plannedSystem)} in this session: <b>${chk.plannedMetres.toLocaleString()}m</b> (${chk.plannedPct}%) · Whole session: ${chk.mix.map(x=>`${esc(x.label)} ${x.pct}%`).join(' · ')}</p>`;
    }else if(b.system&&namedSystem(b.system)){
      verdict=`<p class="msos-brief-mix muted">Brief asks for ${esc(sysLabel(namedSystem(b.system)))}. Write the session and the check updates as you type.</p>`;
    }else if(b.system){
      verdict=`<p class="msos-brief-mix muted">${esc(b.system)} covers several energy systems, so there's no single-system check — use the focus above.</p>`;
    }
    const chosen=b.coachFocus?`<p class="msos-brief-src msos-brief-chosen">Your focus for this session: <b>${esc(sysLabel(b.coachFocus))}</b>${b.briefSystem?` · the plan says ${esc(b.briefSystem)}`:''}.</p>`:'';
    const src=b.source==='standard'?`<p class="msos-brief-src">From your standard week — no season plan covers this week yet.${seasonNote()}${owner?` ${seasonButton()}`:''}</p>`:'';
    return`<section class="msos-brief" data-msos-brief><div class="eyebrow">TODAY'S BRIEF${head?` · ${esc(head)}`:''}</div>
      <h3>${esc(b.source==='coach'?sysLabel(b.coachFocus):(b.sessionFocus||b.system||'Session focus'))}</h3>
      ${b.technical?`<p><b>Technical:</b> ${esc(b.technical)}</p>`:''}
      ${!compact&&(b.phase||b.weekFocus)?`<p class="muted"><b>This week:</b> ${esc(b.weekFocus||b.phase)}${b.mental?` · ${esc(b.mental)}`:''}</p>`:''}
      ${chosen}${verdict}${compact?'':checkRowsHtml(session,state,b,chk)}${compact?'':suggestionsHtml(session,state,b,chk)}${src}</section>`;
  }
  SM.briefHtml=briefHtml;
  function liveBrief(host,anchor,getSession,textarea=null){
    let box=host.querySelector('[data-msos-brief-host]');
    if(!box){box=document.createElement('div');box.dataset.msosBriefHost='1';anchor.insertAdjacentElement('beforebegin',box);
      box.addEventListener('click',e=>{
        // A stage chip: show that part's options now; it stays chosen until a set is added.
        const st=e.target.closest?.('[data-msos-stage]');if(st){writerStage=st.dataset.msosStage;paint();return;}
        // 19 Oct 2026: the head coach keeps / drops a new set right where it is offered
        const rv=e.target.closest?.('[data-msos-review]');if(rv){try{M.setLibrary.review(rv.dataset.msosReview,rv.dataset.v);M.toast?.(rv.dataset.v==='approved'?'Kept in your sets':'Dropped');}catch(err){M.toast?.(err.message);}paint();return;}
        const btn=e.target.closest?.('[data-msos-insert]');if(!btn||!textarea)return;let c=libById(btn.dataset.msosInsert);if(!c)return;try{c=adjustForPhase(c,brief(getSession()));}catch{}
        textarea.value=insertComponent(textarea.value,c.section,c.text);
        // Once a part is written the panel moves on to the next part (the coach can tap back).
        writerStage=undefined;
        textarea.dispatchEvent(new Event('input',{bubbles:true}));M.toast?.(`Added to ${c.section.toLowerCase()}: ${c.label}`);});}
    let t=null;const paint=()=>{const more=box.querySelector('[data-msos-more]')?.open,y=box.querySelector('[data-msos-more]')?.scrollTop;try{const s=getSession();box.innerHTML=s?briefHtml(s):'';}catch(e){box.innerHTML='';}if(more){const d=box.querySelector('[data-msos-more]');if(d){d.open=true;if(y)d.scrollTop=y;}}};
    const schedule=()=>{clearTimeout(t);t=setTimeout(paint,300);};paint();return schedule;
  }
  function nzToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});}
  function slotIdentity(slotId,date){try{const d=date||nzToday(),slot=(M.calendar?.slots?.(d)||[]).find(x=>x.id===slotId);return slot?M.calendar.identityFromSlot(slot):null;}catch{return null;}}
  function parseDraft(rawText,identity,focus=null){const meta=focus?{coachFocus:focus}:{};if(!text(rawText))return{id:'brief-draft',identity,blocks:[],metadata:meta};try{const s=M.parser.parse(rawText,{...identity,id:'brief-draft'});s.identity={...s.identity,...identity};s.id='brief-draft';s.metadata={...(s.metadata||{}),...meta};return s;}catch{return{id:'brief-draft',identity,blocks:[],metadata:meta};}}
  // The focus the coach picked in the writer that is open now: undefined = not touched (keep whatever the
  // session already had), null = follow the plan, otherwise the chosen system. Read by the save owners
  // (v4-poolside-core.js create, app.js openSessionEdit) when they build the session.
  let writerFocus;SM.writerFocus=()=>writerFocus;
  function installNewSessionBrief(opts={}){
    const host=document.querySelector('#modalHost'),raw=host?.querySelector('#coreRaw'),slot=host?.querySelector('#coreSlot');if(!raw||!slot)return;
    writerFocus=undefined;writerStage=undefined;
    const anchor=host.querySelector('.intake-tabs')||raw.closest('label')||raw;
    const forDate=/^\d{4}-\d{2}-\d{2}$/.test(String(opts?.date||''))?opts.date:nzToday();const fallbackId=()=>({date:forDate,dayPart:new Date().getHours()>=12?'PM':'AM',squads:['National','Development']});
    const ident=()=>slotIdentity(slot.value,forDate)||fallbackId();
    const getSession=()=>parseDraft(raw.value,ident(),writerFocus||null);
    const schedule=liveBrief(host,anchor,getSession,raw);
    raw.addEventListener('input',schedule);slot.addEventListener('change',schedule);
    // Session starters sit right above the writing box; rebuilt when the slot or the focus changes.
    let starters=host.querySelector('[data-msos-starters-host]');if(!starters){starters=document.createElement('div');starters.dataset.msosStartersHost='1';anchor.insertAdjacentElement('beforebegin',starters);}
    const paintStarters=()=>{const id=ident();starters.innerHTML=startersHtml(id,writerFocus||null);
      starters.querySelectorAll('[data-msos-focus]').forEach(b=>b.addEventListener('click',()=>{writerFocus=b.dataset.msosFocus||null;paintStarters();schedule();}));
      starters.querySelectorAll('[data-msos-start]').forEach(b=>b.addEventListener('click',()=>{let t=TEMPLATE_TEXT;if(b.dataset.msosStart==='last'){const src=M.state.canonicalSessions?.[b.dataset.msosLast];t=sessionText(src);if(!t)return;}else if(b.dataset.msosStart==='draft'){const d=draftFromBrief(ident(),M.state,{focus:writerFocus||null});t=d.text;M.toast?.(`Draft built from your programming · about ${d.minutes} of ${d.limit} min — edit it to suit`);}
        if(text(raw.value)&&!window.confirm('Replace what is already in the box?'))return;raw.value=t;raw.dispatchEvent(new Event('input',{bubbles:true}));raw.focus?.();}));};
    paintStarters();slot.addEventListener('change',paintStarters);
    // Voice/photo transcription fills the box programmatically (no input event): repaint on any change.
    new MutationObserver(schedule).observe(host.querySelector('#corePreview')||raw,{childList:true,characterData:true,subtree:true});
    M.assistant?.mountWriter?.(raw,{getSession});
  }
  function installEditBrief(){
    const host=document.querySelector('#modalHost'),raw=host?.querySelector('#sessionEditText');if(!raw)return;const cur=M.currentSession?.();if(!cur)return;
    writerFocus=undefined;writerStage=undefined;
    const anchor=raw.closest('label')||raw;
    const getSession=()=>parseDraft(raw.value,{...cur.identity},writerFocus===undefined?(cur.metadata?.coachFocus||null):writerFocus);
    const schedule=liveBrief(host,anchor,getSession,raw);
    raw.addEventListener('input',schedule);
    let row=host.querySelector('[data-msos-starters-host]');if(!row){row=document.createElement('div');row.dataset.msosStartersHost='1';anchor.insertAdjacentElement('beforebegin',row);}
    const paintFocus=()=>{const f=writerFocus===undefined?(cur.metadata?.coachFocus||null):writerFocus;const tmp=document.createElement('div');tmp.innerHTML=startersHtml(cur.identity,f);row.innerHTML='';const fr=tmp.querySelector('[data-msos-focus-row]');if(fr)row.appendChild(fr);
      row.querySelectorAll('[data-msos-focus]').forEach(b=>b.addEventListener('click',()=>{writerFocus=b.dataset.msosFocus||null;paintFocus();schedule();raw.dispatchEvent(new Event('input',{bubbles:true}));}));};
    paintFocus();
    M.assistant?.mountWriter?.(raw,{getSession});
  }
  SM.installNewSessionBrief=installNewSessionBrief;SM.installEditBrief=installEditBrief;

  SM.checks=()=>({build:SM.build,evaluate:typeof evaluate==='function',gate:typeof resolveSessionGate==='function',notify:typeof notifyPendingReview==='function'});
})(globalThis);
