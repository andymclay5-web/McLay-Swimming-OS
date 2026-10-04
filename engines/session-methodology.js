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
  const SM=M.sessionMethodology={build:'v4-session-methodology-20260911a'};
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
  // Rushton's HR bands are continuous, not hard walls -- Andy's own correction above explicitly named one
  // real overlap ("clearance fitting into the top of aerobic power"), so a session genuinely delivered at
  // Clearance intensity against a Threshold-named target is a real crossover, not a methodology drift, and
  // must never be flagged as a mismatch. Deliberately general (not scoped to season-planner text only):
  // the same physiology applies whether "Threshold" came from this file's own vocabulary lookup above or
  // from a plain "Threshold week" weekly-plan phrase classified by dosageEngine.systemFrom() directly. No
  // other crossover is assumed here -- only the one Andy actually stated.
  function isKnownCrossover(plannedSystem,dominantSystem){
    return plannedSystem==='Threshold'&&dominantSystem==='Clearance';
  }
  // Only fires when the weekly plan's free text names one of dosageEngine's own system labels (directly, or
  // via the season-planner vocabulary lookup above) -- never invents a target from silence. A session with
  // no weekly plan linked, or a weekly plan whose free text doesn't name a system, returns checked:false and
  // is never treated as a failure.
  function planTargetCheck(session,state){
    let ctx=null;try{ctx=M.coachLoopUI?.planContext?.(session);}catch{}
    const focusText=text([ctx?.weeklyFocus,ctx?.todayFocus,ctx?.technicalFocus].filter(Boolean).join(' '));
    if(!focusText)return{checked:false};
    // Season-planner vocabulary is checked first (its own phrases aren't dosageEngine keywords at all, so
    // there's no real ambiguity to resolve either way); dosageEngine's own classifier remains the fallback
    // authority for every other weekly-plan free-text phrasing, same as before this change.
    const named=seasonPlannerSystem(focusText)||D.systemFrom(focusText);
    if(named==='Unclassified')return{checked:false};
    let dose;try{dose=D.session(session,state,{delivered:false});}catch{return{checked:false};}
    const ranked=Object.entries(dose.systems||{}).filter(([,v])=>v.pctDose>0).sort((a,b)=>b[1].pctDose-a[1].pctDose);
    if(!ranked.length)return{checked:false};
    const dominantSystem=ranked[0][0];
    const matches=dominantSystem===named||isKnownCrossover(named,dominantSystem);
    return{checked:true,plannedSystem:named,dominantSystem,matches};
  }
  function evaluate(session,state=M.state){
    const drift=stimulusDrift(session,state),plan=planTargetCheck(session,state);
    const reasons=drift.map(d=>`${d.athleteName}: intended ${d.squadSystem} but delivered as ${d.athSystem}${d.reason?` (${d.reason})`:''}`);
    if(plan.checked&&!plan.matches)reasons.push(`Weekly focus names ${plan.plannedSystem}, but this session's dominant classified system is ${plan.dominantSystem}`);
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
    section.innerHTML=`<div class="eyebrow">SESSION METHODOLOGY</div><p>${esc(sum.dosageLine)}${sum.weeklyFocus?` · Weekly focus: ${esc(sum.weeklyFocus)}`:''}</p>${pending?`<div class="context-note msos-pending-methodology"><b>⚑ Flagged for review:</b> ${esc(pending.reasons.join('; '))}${owner?'':' Only Andy can mark this reviewed.'}</div>${owner?'<div class="hub-actions"><button type="button" data-methodology-reviewed>Mark reviewed</button></div>':''}`:(s.methodologyVerdict?.approved?'<div class="context-note ok">✓ Evidence check: this session\'s individual modifications preserve the intended stimulus.</div>':'')}`;
    const anchor=host.querySelector('.board-hero,.session-card,.board-header,.v4-block-nav')||host.firstElementChild;
    if(anchor)anchor.insertAdjacentElement(anchor.classList?.contains('v4-block-nav')?'beforebegin':'afterend',section);else host.prepend(section);
    section.querySelector('[data-methodology-reviewed]')?.addEventListener('click',async()=>{await markReviewed(s,pending.alertId||null);UI.renderBoard?.();});
  }
  const baseBoard2=UI.renderBoard?.bind(UI);
  if(baseBoard2)UI.renderBoard=()=>{baseBoard2();queueMicrotask(installBanner);};

  SM.checks=()=>({build:SM.build,evaluate:typeof evaluate==='function',gate:typeof resolveSessionGate==='function',notify:typeof notifyPendingReview==='function'});
})(globalThis);
