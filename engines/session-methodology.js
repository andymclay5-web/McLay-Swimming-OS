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
  function brief(session,state=M.state){
    if(!session)return null;
    let ctx=null;try{ctx=M.coachLoopUI?.planContext?.(session);}catch{}
    const date=session?.identity?.date||'';
    const covers=ctx?.week?weekCovers(ctx.week,date):null;
    if(ctx&&covers!==false&&(ctx.todayFocus||ctx.weeklyFocus||ctx.technicalFocus)){
      const ws=ctx.weekSession||{},wk=ctx.week||{};
      return{source:'season',seasonName:text(ctx.seasonName),slot:text([ws.day,ws.dayPart].filter(Boolean).join(' ')),
        system:text(ctx.todayFocus),sessionFocus:text(ws.session_focus||ws.focus||''),
        technical:text(ws.technical_focus||ctx.technicalFocus||''),weekFocus:text(ctx.weeklyFocus),phase:text(wk.phase||wk.focus||''),
        mental:text(ctx.psychologicalFocus||''),weekStart:text(wk.week_start||'')};
    }
    const tpl=templateDay(session,state);
    if(tpl){const r=tpl.row;return{source:'standard',squad:tpl.squad,slot:text([r.day,r.dayPart].filter(Boolean).join(' ')),system:text(r.primary_system),sessionFocus:text(r.session_focus),technical:text(r.technical_focus),weekFocus:'',phase:'',mental:'',staleWeek:covers===false};}
    return{source:'none',staleWeek:covers===false};
  }
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
    let named=null,from='';for(const [k,v] of [['day',b.system],['week',b.weekFocus],['technical',b.technical]]){named=namedSystem(v);if(named){from=k;break;}}
    if(!named)return{checked:false,source:b.source};
    let dose;try{dose=D.session(session,state,{delivered:false});}catch{return{checked:false,source:b.source};}
    const ranked=rankedSystems(dose);if(!ranked.length)return{checked:false,source:b.source};
    const mains=mainBlocks(session);let basis='whole session',mainRanked=null;
    if(mains.length){try{const md=D.session({...session,id:`${session.id||'session'}#main`,blocks:mains},state,{delivered:false});const r=rankedSystems(md);if(r.length){mainRanked=r;basis='main set';}}catch{}}
    const top=(mainRanked||ranked)[0],dominantSystem=top[0];
    const matches=dominantSystem===named||isKnownCrossover(named,dominantSystem);
    const planned=dose.systems?.[named]||{metres:0,pctMetres:0};
    return{checked:true,plannedSystem:named,plannedFrom:from,dominantSystem,dominantPct:Math.round(top[1].pctMetres||top[1].pctDose||0),basis,matches,source:b.source,
      plannedMetres:Math.round(planned.metres||0),plannedPct:Math.round(planned.pctMetres||0),totalMetres:Math.round(dose.rawMetres||0),
      mix:[...ranked].sort((a,b)=>(b[1].pctMetres||0)-(a[1].pctMetres||0)).slice(0,3).map(([label,v])=>({label,pct:Math.round(v.pctMetres||0)}))};
  }
  function evaluate(session,state=M.state){
    const drift=stimulusDrift(session,state),plan=planTargetCheck(session,state);
    const reasons=drift.map(d=>`${d.athleteName}: intended ${d.squadSystem} but delivered as ${d.athSystem}${d.reason?` (${d.reason})`:''}`);
    if(plan.checked&&!plan.matches)reasons.push(`Weekly focus names ${plan.plannedSystem}, but this session's ${plan.basis==='main set'?'main set':'dominant classified system'} is ${plan.basis==='main set'?'mostly ':''}${plan.dominantSystem}`);
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
    const anchor=host.querySelector('.board-hero,.session-card,.board-header,.v4-block-nav')||host.firstElementChild;
    if(anchor)anchor.insertAdjacentElement(anchor.classList?.contains('v4-block-nav')?'beforebegin':'afterend',section);else host.prepend(section);
    section.querySelector('[data-methodology-reviewed]')?.addEventListener('click',async()=>{await markReviewed(s,pending.alertId||null);UI.renderBoard?.();});
  }
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
  function briefHtml(session,state=M.state,{compact=false}={}){
    const b=brief(session,state),owner=(M.access?.role?.()||'owner')==='owner';
    if(!b||b.source==='none'){
      return`<section class="msos-brief msos-brief-none" data-msos-brief><div class="eyebrow">TODAY'S BRIEF</div><p>No plan covers this session yet${b?.staleWeek?' (last season has finished)':''}, so there's nothing to check it against.</p>${owner?'<button type="button" data-msos-plan-season>Plan next season</button>':''}</section>`;
    }
    const chk=planTargetCheck(session,state,b);
    const head=[b.slot,b.source==='standard'?b.squad:''].filter(Boolean).join(' · ');
    let verdict='';
    if(chk.checked){
      const p=sysLabel(chk.plannedSystem);
      verdict=chk.matches
        ?`<div class="msos-brief-check ok">✓ ${chk.basis==='main set'?'Main set':'Session'} is ${esc(sysLabel(chk.dominantSystem))} — on brief</div>`
        :`<div class="msos-brief-check off">⚠ ${chk.basis==='main set'?'Main set':'Session'} is mostly ${esc(sysLabel(chk.dominantSystem))} — brief asks for ${esc(p)}</div>`;
      verdict+=`<p class="msos-brief-mix">${esc(chk.plannedSystem)} in this session: <b>${chk.plannedMetres.toLocaleString()}m</b> (${chk.plannedPct}%) · Whole session: ${chk.mix.map(x=>`${esc(x.label)} ${x.pct}%`).join(' · ')}</p>`;
    }else if(b.system&&namedSystem(b.system)){
      verdict=`<p class="msos-brief-mix muted">Brief asks for ${esc(sysLabel(namedSystem(b.system)))}. Write the session and the check updates as you type.</p>`;
    }else if(b.system){
      verdict=`<p class="msos-brief-mix muted">${esc(b.system)} covers several energy systems, so there's no single-system check — use the focus above.</p>`;
    }
    const src=b.source==='standard'?`<p class="msos-brief-src">From your standard week — no season plan covers this week yet.${owner?' <button type="button" data-msos-plan-season>Plan next season</button>':''}</p>`:'';
    return`<section class="msos-brief" data-msos-brief><div class="eyebrow">TODAY'S BRIEF${head?` · ${esc(head)}`:''}</div>
      <h3>${esc(b.sessionFocus||b.system||'Session focus')}</h3>
      ${b.technical?`<p><b>Technical:</b> ${esc(b.technical)}</p>`:''}
      ${!compact&&(b.phase||b.weekFocus)?`<p class="muted"><b>This week:</b> ${esc(b.weekFocus||b.phase)}${b.mental?` · ${esc(b.mental)}`:''}</p>`:''}
      ${verdict}${src}</section>`;
  }
  SM.briefHtml=briefHtml;
  function liveBrief(host,anchor,getSession){
    let box=host.querySelector('[data-msos-brief-host]');
    if(!box){box=document.createElement('div');box.dataset.msosBriefHost='1';anchor.insertAdjacentElement('beforebegin',box);}
    let t=null;const paint=()=>{try{const s=getSession();box.innerHTML=s?briefHtml(s):'';}catch(e){box.innerHTML='';}};
    const schedule=()=>{clearTimeout(t);t=setTimeout(paint,300);};paint();return schedule;
  }
  function nzToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});}
  function slotIdentity(slotId,date){try{const d=date||nzToday(),slot=(M.calendar?.slots?.(d)||[]).find(x=>x.id===slotId);return slot?M.calendar.identityFromSlot(slot):null;}catch{return null;}}
  function parseDraft(rawText,identity){if(!text(rawText))return{id:'brief-draft',identity,blocks:[]};try{const s=M.parser.parse(rawText,{...identity,id:'brief-draft'});s.identity={...s.identity,...identity};s.id='brief-draft';return s;}catch{return{id:'brief-draft',identity,blocks:[]};}}
  function installNewSessionBrief(opts={}){
    const host=document.querySelector('#modalHost'),raw=host?.querySelector('#coreRaw'),slot=host?.querySelector('#coreSlot');if(!raw||!slot)return;
    const anchor=host.querySelector('.intake-tabs')||raw.closest('label')||raw;
    const forDate=/^\d{4}-\d{2}-\d{2}$/.test(String(opts?.date||''))?opts.date:nzToday();const fallbackId=()=>({date:forDate,dayPart:new Date().getHours()>=12?'PM':'AM',squads:['National','Development']});
    const schedule=liveBrief(host,anchor,()=>{const id=slotIdentity(slot.value,forDate)||fallbackId();return parseDraft(raw.value,id);});
    raw.addEventListener('input',schedule);slot.addEventListener('change',schedule);
    // Voice/photo transcription fills the box programmatically (no input event): repaint on any change.
    new MutationObserver(schedule).observe(host.querySelector('#corePreview')||raw,{childList:true,characterData:true,subtree:true});
  }
  function installEditBrief(){
    const host=document.querySelector('#modalHost'),raw=host?.querySelector('#sessionEditText');if(!raw)return;const cur=M.currentSession?.();if(!cur)return;
    const schedule=liveBrief(host,raw.closest('label')||raw,()=>parseDraft(raw.value,{...cur.identity}));
    raw.addEventListener('input',schedule);
  }
  SM.installNewSessionBrief=installNewSessionBrief;SM.installEditBrief=installEditBrief;

  SM.checks=()=>({build:SM.build,evaluate:typeof evaluate==='function',gate:typeof resolveSessionGate==='function',notify:typeof notifyPendingReview==='function'});
})(globalThis);
