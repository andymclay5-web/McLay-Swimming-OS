'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence,AR=g.MSOSArchitecture?.AthleteSession;if(!M?.ui||!M?.state)return;
  const X=M.swimmerInviteBN={build:'v4-swimmer-secure-onboarding-20260824cv',GENERATE_TIMEOUT_MS:120000,STATUS_TICK_MS:1000};
  // Real coaching failure this guards against: Andy's own report -- the QR-generate modal froze on
  // "Checking swimmer evidence..." for several literal minutes with zero further status change, and no
  // error ever surfaced. The per-job 12s evidence timeout (swimmer-performance-ci.js) was working and had
  // already reached the last check, so the freeze was happening in one of the UNGUARDED steps that run
  // after completeEvidence() resolves -- the reference-cache save, "Establishing secure owner access",
  // the Challenge/Edit/Finish check, publishing the payload, creating the invite, or loading the QR
  // renderer script from the CDN -- none of which had any timeout at all. This wraps the WHOLE
  // generate-QR flow in one hard ceiling so it always recovers with a clear error naming which step was
  // in flight, instead of ever freezing silently again.
  function withTimeout(promise,ms,label){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{const l=typeof label==='function'?label():label;reject(new Error(`${l} timed out after ${Math.round(ms/1000)}s — check your connection and try again.`));},ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});});}
  // Real coaching failure this guards against (Andy, 16 Sept 2026): "we'll just get started here on the
  // zero seconds. It gets to there, and nothing happens. Two minutes later, it's still just sitting
  // there." -- the modal froze on "Checking swimmer evidence... (5/5 · training_test_types)" with the
  // elapsed-seconds ticker itself apparently stuck at 0s. Every existing timeout in this flow (the 12s
  // per-job evidence timeout, the 5s local-cache-save timeout, the 120s whole-flow ceiling) only reports
  // once the flow actually resolves -- but if the freeze itself never resolves (Andy has to back out of
  // the app entirely), none of those diagnostics ever get the chance to fire or be read. This writes a
  // plain synchronous localStorage breadcrumb (not IndexedDB -- no clone/serialize cost, cannot itself be
  // the thing that's slow) on every single status change and tick, so after a freeze that never resolves,
  // the LAST breadcrumb written before Andy force-closed the app is still sitting in localStorage,
  // recording exactly which step was in flight and how many ticks it had reached. Surfaced on the
  // Connection page so the next report carries real forensic evidence instead of a stopwatch guess.
  const QR_ATTEMPT_KEY='msos_qr_last_attempt';
  function writeAttempt(patch){try{const cur=JSON.parse(localStorage.getItem(QR_ATTEMPT_KEY)||'null')||{};localStorage.setItem(QR_ATTEMPT_KEY,JSON.stringify({...cur,...patch}));}catch{}}
  X.lastAttemptStatus=()=>{try{return JSON.parse(localStorage.getItem(QR_ATTEMPT_KEY)||'null')}catch{return null}};
  // 19 Sept 2026 (third same-day freeze on Matthew Robertson -- see the full account further down, at the
  // point this is actually used): whichever "Generate" attempt is currently allowed to touch the screen or
  // write msos_qr_last_attempt. Starting a new attempt, or closing its modal, cancels whatever this was
  // previously pointing at, so at most one attempt's ticker/breadcrumb writes are ever live at once.
  let activeGeneration=null;
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??''),text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const cfg=()=>M.store?.config?.()||g.MCLAY_CONFIG||{},auth=()=>M.store?.auth?.()||{};
  const ownCapture=(c,a)=>{const ids=[c?.athlete_id,c?.athleteId,...(c?.athlete_ids||[]),...(c?.athleteIds||[])].filter(Boolean).map(String);return ids.includes(String(a?.id))&&['shared','swimmer'].includes(String(c?.audience||''));};
  async function rpc(name,body){const c=cfg(),token=auth().access_token;if(!c.supabaseUrl||!c.supabaseAnonKey)throw new Error('Supabase is not configured.');if(!token)throw new Error('Coach sign-in is required before creating swimmer access.');const res=await fetch(`${String(c.supabaseUrl).replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.supabaseAnonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const raw=await res.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}if(!res.ok)throw new Error(data?.message||data?.hint||`Secure access failed (${res.status})`);return data;}
  function safeTraining(a){try{const v=M.swimmerTrainingBG?.viewFor?.(a);if(!v)return{};const pick=w=>w?{confirmedDeliveredMetres:Number(w.confirmedDeliveredMetres)||0,sessions:Number(w.sessions)||0,strokes:w.strokes||{},tags:w.tags||{},zones:w.zones||{}}:{};const r=v.today;return{today:r?{title:r.title||'',date:r.date||'',delivery:r.delivery||'',deliveredMetres:Number(r.deliveredMetres)||0,prescribedMetres:Number(r.prescribedMetres)||0,strokes:r.strokes||{},tags:r.tags||{},zones:r.zones||{}}:null,week:pick(v.week),month:pick(v.month),upcoming:(v.upcoming||[]).slice(0,6).map(x=>({date:x.date||'',title:x.title||'',prescribedMetres:Number(x.prescribedMetres)||0,zones:x.plannedZones||x.zones||{}}))};}catch{return{}}}
  // safeSession now takes an optional explicit session (falling back to the coach's currently-open one, the
  // original behaviour) -- this is what lets sessionsFor build a real, individually-projected payload for
  // EVERY session on the swimmer's picker, not only whichever one happens to be open on Andy's device when
  // he taps "Generate 15-minute QR". Also fixed `slot` to read the session's real `dayPart` field
  // (identity.slot never existed -- this was always silently blank) since the picker needs to tell same-day
  // AM/PM sessions apart.
  // Real coaching failure this fixes: R.athleteSessionProjection already computes exactly where an individual
  // swimmer's session diverges from the plain squad session -- a squad-layer or fully individual start point
  // (with any join warm-up), an early squad or individual finish, and the full un-truncated squad metres to
  // compare against -- but safeSession discarded all of it, keeping only the already-merged blocks/metres. A
  // swimmer with a genuinely modified session (joined the Development layer late, or the squad session was cut
  // short) saw no indication their view was anything other than the plain squad session, with no way to tell
  // WHY their blocks/metres looked different from a squad-mate's. Publishing p.start/p.finish/the full-squad
  // metres lets the portal show "this is your own version of the squad session, here is what's different".
  // training-history-core.js's recordSession only fills in an endLabel from the ATHLETE's own individual end
  // boundary -- when a session ends early because Andy cut the whole SQUAD session short (session.finish), no
  // human-readable label comes through the projection at all, even though the real line is easy to find via
  // the same architecture engine's own sessionFinishBoundary/boundaryLabel helpers.
  function squadFinishLabel(p,s){if(p.finish?.source!=='squad_finish'||!AR?.sessionFinishBoundary||!AR?.boundaryLabel)return'';try{return text(AR.boundaryLabel(s,AR.sessionFinishBoundary(s)))}catch{return''}}
  // Real coaching failure this fixes: architecture/training-history-core.js's projection() now carries
  // stroke/strokeResolution on each line (the resolved "#1 stroke" and why), but safeSession discarded it like
  // everything else it doesn't explicitly list -- so the swimmer portal had zero visibility into which stroke
  // was resolved for a set, and no way to let a swimmer challenge it. Surfacing it here (stroke defaults to ''
  // when no #1-stroke context applies to that line) is what lets swimmer-portal.js show the pill and challenge it.
  // Real coaching failure this fixes (Andy's own voice-memo spec): "Matthew will be doing his sessions when I'm
  // not thinking about swimming" -- a stroke challenge needs an instant, evidence-checked answer on the
  // swimmer's own device, not only once Andy later opens his feedback inbox. Neither the swimmer portal nor a
  // Supabase RPC has access to M.performanceEngine/M.strokeBalance, so the only safe way to give an instant
  // answer without a second, competing implementation of the evidence logic is to publish the SAME raw evidence
  // engines/swimmer-feedback-cu.js already checks a challenge against (M.strokeBalance.challengeEvidence -- see
  // its own comment for why this is the one shared owner) alongside the session, once, at QR-publish time.
  // supabase/20260910_swimmer_stroke_challenge_rpc.sql's msos_swimmer_submit_stroke_challenge applies the exact
  // same approve rule against this published snapshot. It is a point-in-time snapshot like everything else in
  // this payload (performance events, training accumulation) -- refreshed whenever Andy next issues a QR, not
  // live -- which is an existing, accepted property of this whole portal, not a new one.
  function strokeEvidenceFor(a,session){try{return M.strokeBalance?.challengeEvidence?.(a,M.state,session)||null}catch{return null}}
  function safeSession(a,session){try{const s=session||M.currentSession?.();const p=M.swimmerTrainingBG?.projectionFor?.(a,s);if(!p||!s)return null;const evidence=strokeEvidenceFor(a,s);const target=t=>t?{status:t.status||'',seconds:Number.isFinite(Number(t.seconds))?Number(t.seconds):null,sendOff:Number.isFinite(Number(t.sendOff))?Number(t.sendOff):null,hr:t.hr||null,sr:t.sr||null,message:t.message||'',rows:Array.isArray(t.rows)?t.rows.slice(0,16).map(r=>({rep:r.rep,zone:r.zone||'',seconds:Number.isFinite(Number(r.seconds))?Number(r.seconds):null,sendOff:Number.isFinite(Number(r.sendOff))?Number(r.sendOff):null,hr:r.hr||null,sr:r.sr||null,status:r.status||''})):[]}:null;return{id:String(s.id),date:s.identity?.date||p.date||'',slot:s.identity?.dayPart||'',squad:p.squad||a.squad||'',course:p.course||s.identity?.course||'',title:p.title||s.title||`${s.identity?.dayPart||''} ${a.squad||''}`.trim(),metres:Number(p.metres?.recorded||p.metres?.current||p.metres?.prescribed||0),delivery:p.delivery||'',zones:p.zones||{},strokes:p.strokes||{},tags:p.tags||{},finished:!!s.finish,modification:{startSource:p.start?.source||'session_start',startLabel:p.start?.label||'',joinWorkMetres:Number(p.start?.joinWork?.metres)||0,joinWorkNote:text(p.start?.joinWork?.text||p.start?.joinWork?.note||''),finishSource:p.finish?.source||'planned',finishLabel:p.finish?.label||squadFinishLabel(p,s),fullSquadMetres:Number(p.metres?.fullSquadSource)||0},blocks:(p.blocks||[]).map(b=>({id:String(b.id||''),label:b.label||b.title||'Block',metres:Number(b.metres)||0,items:(b.items||[]).map(i=>({id:String(i.id||i.canonicalItemId||''),label:i.label||i.text||'Set',metres:Number(i.metres)||0,tags:i.tags||[],target:target(i.target),observations:i.performanceSummary||null,stroke:text(i.stroke||''),strokeResolution:i.strokeResolution?{kind:text(i.strokeResolution.kind||''),source:text(i.strokeResolution.source||''),stroke:text(i.strokeResolution.stroke||'')}:null,strokeEvidence:i.stroke&&evidence?.hasEvidence?evidence:null}))}))};}catch{return null;}}
  // The calendar-driven session picker: every session from Andy's own calendar within a sensible window that
  // actually applies to this athlete's squad(s), each individually projected (their own targets/send-offs and
  // squad-vs-individual modifications) exactly like the single "current session" view always was.
  function sessionsFor(a){const candidates=M.swimmerTrainingBG?.candidateSessionsFor?.(a)||[];const out=[];for(const s of candidates){const built=safeSession(a,s);if(built)out.push(built);}return out;}
  const mapStep=s=>s?{label:text(s.displayLabel||s.label||'Milestone'),kind:text(s.kind||''),seconds:Number(s.seconds),gapSeconds:Number(s.gapSeconds),gapPercentage:Number(s.gapPercentage),achieved:!!s.achieved,targetSeason:Number.isFinite(Number(s.targetSeason))?Number(s.targetSeason):null,sourceSeason:Number.isFinite(Number(s.sourceSeason))?Number(s.sourceSeason):null,planningProxy:!!s.planningProxy,targetDate:s.targetDate||'',ageAtTarget:Number.isFinite(Number(s.ageAtTarget))?Number(s.ageAtTarget):null,course:s.course||'',officialCourse:s.officialCourse||'',sourceStatus:s.sourceStatus||''}:null;
  function safePerformance(a){const c=text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';let path=null;try{path=M.performanceEngine?.pathwaysForAthlete?.(a,{course:c})||null}catch{}if(path?.events?.length){const events=path.events.map(e=>{const scm=(e.ladder?.tracks?.SCM||[]).map(mapStep).filter(Boolean),lcm=(e.ladder?.tracks?.LCM||[]).map(mapStep).filter(Boolean),main=c==='LCM'?lcm:scm,next=e.ladder?.next?mapStep(e.ladder.next):(main.find(s=>!s.achieved)||null),raw=e.raw||e.pbRow||e.pb||{};return{key:`${String(e.course||c).toUpperCase()}|${Number(e.distance)}|${text(e.stroke)}`,course:e.course||c,distance:Number(e.distance),stroke:e.stroke,seconds:Number(e.seconds),points:Number.isFinite(Number(e.points))?Number(e.points):null,pointSystem:e.pointSystem||'',rank:e.rank||null,next,pathway:{SCM:scm,LCM:lcm},race:{date:raw.result_date||raw.date||'',meet:raw.meet_name||raw.meet||'',splits:raw.splits||raw.split_times||raw.splitTimes||raw.laps||raw.intermediates||null}};});const opportunities=events.filter(e=>e.next&&!e.next.achieved).slice().sort((a,b)=>Number(a.next.gapPercentage||Infinity)-Number(b.next.gapPercentage||Infinity)||Number(b.points||0)-Number(a.points||0));return{course:c,events,opportunities,hasDualCoursePathway:true};}const fallback=M.swimmerPerformanceBM?.modelFor?.(a,c);const events=(fallback?.events||[]).map(e=>({key:e.key,course:e.course,distance:e.distance,stroke:e.stroke,seconds:Number(e.pbSeconds),points:Number.isFinite(Number(e.points))?Number(e.points):null,pointSystem:e.pointSystem||'',rank:e.rank||null,next:mapStep(e.next),pathway:{SCM:[],LCM:[]},race:{date:e.pbRow?.result_date||'',meet:e.pbRow?.meet_name||'',splits:e.pbRow?.splits||null}}));return{course:c,events,opportunities:events.filter(e=>e.next&&!e.next.achieved)};}
  function safeTests(a){const rows=[];if(E)for(const st of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM'])for(const r of E.t400Rows?.(a,M.state,st)||[])rows.push({type:'T400',label:`${st} T400`,seconds:Number(E.seconds(r)),date:r.result_date||r.date||r.result_period||'',course:E.course(r)||'SCM'});const ids=new Set(rows.map(x=>`${x.label}|${x.seconds}|${x.date}`));for(const r of M.state.trainingTestResults||[]){if(String(r.athlete_id||r.athleteId||'')!==String(a.id))continue;const sec=Number(E?.seconds?.(r)||r.result_seconds);if(!Number.isFinite(sec)||sec<=0)continue;const label=text(r.test_name||r.name||r.source_label||'Test'),k=`${label}|${sec}|${r.result_date||r.date||''}`;if(ids.has(k))continue;ids.add(k);rows.push({type:'test',label,seconds:sec,date:r.result_date||r.date||r.result_period||'',course:E?.course?.(r)||r.pool_course||r.course||''});}return rows.sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,30);}
  function safeMeet(a){return(M.state.meetEntries||[]).filter(x=>String(x.athlete_id||x.athleteId||'')===String(a.id)).slice(-20).map(x=>({event:x.event_name||x.event||`${x.distance||''} ${x.stroke||''}`,meet:x.meet_name||x.meet||'',date:x.meet_date||x.date||'',seed_seconds:Number(x.seed_seconds||x.seedTimeSeconds)||null,status:x.status||''}));}
  // 19 Sept 2026: Matthew Robertson's QR-generate flow froze again ("Checking swimmer evidence... (5/5 ·
  // training_test_types) (0s)", never advancing) -- confirmed via live Supabase edge logs that every
  // evidence network call had already completed fine seconds earlier and nothing further ever reached the
  // network, so the freeze is client-side, inside this synchronous payload build (or the readinessFor/
  // buildModel work just before it) with no breadcrumb of its own. payloadFor previously ran all of
  // sessions/performance/training/tests/meet as one unbroken synchronous block, so however long it actually
  // takes, the modal (and the localStorage breadcrumb) kept showing whichever evidence-job note fired last --
  // indistinguishable from a true hang. onStep (optional) now fires between each sub-step so the next
  // occurrence's breadcrumb names the specific one still running, the same diagnostic-first approach that
  // found the real pathway_standards staleness bug on the 18th.
  function athleteShapeFor(a){return{id:String(a.id),full_name:a.full_name||'',preferred_name:a.preferred_name||a.nickname||'',squad:a.squad||'',date_of_birth:a.date_of_birth||'',current_s_class:a.current_s_class||'',current_sb_class:a.current_sb_class||'',current_sm_class:a.current_sm_class||''};}
  function sessionsPartFor(a,step){step('sessions');const sessions=sessionsFor(a),currentId=String(M.currentSession?.()?.id||''),session=sessions.find(s=>s.id===currentId)||safeSession(a);return{session,sessions};}
  function payloadFor(a,onStep){
    const step=name=>{try{onStep?.(name)}catch{}};
    const{session,sessions}=sessionsPartFor(a,step);
    step('performance');const performance=safePerformance(a);
    step('training');const training=safeTraining(a);
    step('tests');const tests=safeTests(a);
    step('meet');const meet=safeMeet(a);
    step('shared_evidence');const sharedEvidence=(M.state.captures||[]).filter(c=>ownCapture(c,a)).slice(-12).reverse().map(c=>({id:c.id||'',title:c.title||c.context_label||'',type:c.type||c.evidence_type||'',text:c.text_content||c.capture_note||c.text||'',created_at:c.created_at||''}));
    return{schema:'msos-swimmer-portal-v6',publishedAt:new Date().toISOString(),athlete:athleteShapeFor(a),session,sessions,performance,training,tests,meet,sharedEvidence};
  }
  // Real coaching failure this fixes (Andy, live, 20 Sept 2026: "we need to get them to be able to see all
  // of the information I have for them" -- the full performance/training/test/meet history, disabled the
  // same night it shipped after payloadFor() locked William Callow's phone solid for Matthew Robertson's
  // attempt right after). The disabled block's own comment named the real reason: deferring payloadFor()'s
  // START via setTimeout does nothing to stop it hogging the one JS thread for however long it takes once it
  // actually starts, because it computed performance/training/tests/meet/shared_evidence as one unbroken
  // synchronous span with no chance for the browser to process a single tap or paint a single frame in
  // between. That block was disabled rather than fixed because the leading suspect (safePerformance ->
  // buildAthletePathways in performance-pathway-ck.js) was never proven safe against Andy's real data volume.
  //
  // Since then: (1) buildAthletePathways() was directly profiled (not guessed) against a synthetic table
  // sized to Andy's own real ~4,400-row pathway_standards figure -- confirmed a genuine O(events x standards)
  // inefficiency (it rescanned the entire table from scratch for every ranked event) and fixed it into
  // O(standards + events) by indexing the table once per athlete instead -- a measured ~2.3x speedup at
  // realistic event counts, verified against the real pre-fix file, not just the new one in isolation. (2)
  // Independently of whether that was ever the WHOLE cause, payloadForAsync below removes the actual
  // structural flaw the disabled comment identified: it is a real async generator over the same five stages
  // (sessions/performance/training/tests/meet/shared_evidence, each computed by the exact same unchanged
  // safeX() functions as payloadFor above -- same logic, same output shape, nothing recomputed differently),
  // yielding back to the browser's event loop between every single stage via a real setTimeout(0) tick. This
  // does not make any one stage compute faster on its own (the indexing fix above is what does that) -- what
  // it guarantees is that the browser gets a genuine scheduling opportunity, to process a queued tap or paint
  // a frame, at every stage boundary, so a single unexpectedly slow stage can no longer compound with every
  // other stage into one unbroken multi-second block. A hard wall-clock ceiling (ENRICHMENT_BUDGET_MS) is
  // also checked before each stage starts: if the stages already run have together exceeded it, every
  // remaining stage is skipped for this pass (recorded as enrichmentTruncatedAt on the breadcrumb) rather than
  // adding more synchronous work on top of an already-slow run -- the swimmer still gets whatever finished
  // sections say, and the very next Generate (or the next auto-publish on session save) gets a fresh attempt.
  const ENRICHMENT_BUDGET_MS=4000;
  X.ENRICHMENT_BUDGET_MS=ENRICHMENT_BUDGET_MS;
  const yieldToMainThread=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function payloadForAsync(a,onStep,budgetMs=ENRICHMENT_BUDGET_MS){
    const step=name=>{try{onStep?.(name)}catch{}};
    const t0=Date.now();
    const{session,sessions}=sessionsPartFor(a,step);
    const out={schema:'msos-swimmer-portal-v6',publishedAt:new Date().toISOString(),athlete:athleteShapeFor(a),session,sessions,performance:{course:'SCM',events:[],opportunities:[]},training:{},tests:[],meet:[],sharedEvidence:[]};
    const stages=[
      ['performance',()=>{out.performance=safePerformance(a);}],
      ['training',()=>{out.training=safeTraining(a);}],
      ['tests',()=>{out.tests=safeTests(a);}],
      ['meet',()=>{out.meet=safeMeet(a);}],
      ['shared_evidence',()=>{out.sharedEvidence=(M.state.captures||[]).filter(c=>ownCapture(c,a)).slice(-12).reverse().map(c=>({id:c.id||'',title:c.title||c.context_label||'',type:c.type||c.evidence_type||'',text:c.text_content||c.capture_note||c.text||'',created_at:c.created_at||''}));}],
    ];
    let truncatedAt='';
    for(const[name,run]of stages){
      if(Date.now()-t0>budgetMs){truncatedAt=name;break;}
      step(name);
      try{run();}catch{}
      await yieldToMainThread();
    }
    return{payload:out,truncatedAt};
  }
  // 20 Sept 2026 (Andy, live: "Come on Claude this is enough, can you sort it out or do we need to find an
  // easier way to give swimmers access" -- after the SAME night's national-benchmark fix and training-view
  // fix each independently unblocked one freeze only to reach a NEW one, this time on the 'performance' step
  // for William Callow, tickSeconds stuck at 0 with wakeLockHeld:true again): two genuinely different
  // unbounded-computation bugs in ONE evening, in the SAME payloadFor() pipeline, is a pattern, not a
  // coincidence -- this pipeline had apparently never run end-to-end against Andy's real production data
  // volume before tonight, and there is no way to prove from here that 'performance' (or 'training'/'tests'/
  // 'meet', still untouched) is the last one hiding a similar issue. Rather than keep finding these one at a
  // time under time pressure, this stops computing ANY of the rich analytical sections (performance ladders,
  // training accumulation, test history, meet history) in Generate's own critical path at all. corePayloadFor
  // below builds ONLY identity + session + squad sessions -- exactly what Andy asked for tonight ("I just
  // want to give them access to their info and their squads sessions") -- all of which was already fast and
  // bounded (sessionsPartFor/candidateSessionsFor, at most 8 sessions). Access publishes from this minimal
  // payload immediately; the FULL payload (built by the unchanged payloadFor above) is computed and
  // re-published afterward, deferred one tick so it can never delay the QR/status the coach is waiting on.
  // msos_publish_swimmer_payload is a plain upsert keyed by athlete_id (supabase/20260824_secure_swimmer_
  // portal.sql: `on conflict(athlete_id) do update ...`), so this second publish safely updates the SAME
  // record in place -- no new invite or device pairing needed, and the swimmer's next portal open (or a
  // manual refresh) picks up the fuller payload automatically. swimmer-portal.js already renders every one
  // of these sections gracefully when empty (performance: "0 events"/"Tap for pathway"; training: "0m ·
  // 0 sessions"; tests/meet: "No ... loaded yet.") -- confirmed by reading its own rendering code, not
  // assumed -- so a swimmer opening the link in the first few seconds sees a working portal with their
  // session, just without the extra analysis until it lands moments later.
  function corePayloadFor(a,onStep){
    const step=name=>{try{onStep?.(name)}catch{}};
    const{session,sessions}=sessionsPartFor(a,step);
    const course=text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
    return{schema:'msos-swimmer-portal-v6',publishedAt:new Date().toISOString(),athlete:athleteShapeFor(a),session,sessions,performance:{course,events:[],opportunities:[]},training:{},tests:[],meet:[],sharedEvidence:[]};
  }
  async function sessionActionsFor(a,sessionId=''){try{return await rpc('msos_owner_swimmer_session_actions',{p_athlete_id:String(a?.id||''),p_session_id:sessionId||null})}catch{return[]}}
  async function verifySessionInteractionLayer(a,sessionId){try{await rpc('msos_owner_swimmer_session_actions',{p_athlete_id:String(a?.id||''),p_session_id:String(sessionId||'')});return true;}catch(err){throw new Error(`Swimmer access held: session Challenge / Edit / Finish logging is not ready. ${err?.message||err}`);}}
  async function acknowledgeSessionAction(id){return rpc('msos_ack_swimmer_session_action',{p_action_id:id});}
  // 20 Sept 2026 (Andy, live, THREE separate genuine "QR renderer could not load" failures tonight against
  // a third-party CDN, THEN a FOURTH failure -- "QR renderer is missing from this build" -- immediately after
  // that CDN dependency was replaced with a second same-origin file, engines/qrcode-local.js, loaded via its
  // own <script> tag): the most likely explanation for the fourth failure is that a brand-new file is exactly
  // the one kind of change a manual deploy step can miss, when every other fix tonight only ever touched
  // files that already existed on the live site and updated correctly every single time. Rather than ask
  // Andy to go debug his deploy pipeline, this removes that risk category entirely: the QR encoder now lives
  // INLINE, right here, in the one file that has proven itself reliable all night. There is no second file,
  // no separate <script> tag, no window global to be missing, and no precache entry that could be left out --
  // qrEncode()/drawQr() below are just ordinary functions in this module, exactly like everything else in it.
  // If swimmer-invite-bn.js itself loaded (and it always has, every time, tonight), the QR renderer is there.
  //
  // qrEncode() is a from-scratch, dependency-free implementation of the QR Code encoding algorithm
  // (ISO/IEC 18004): mode selection (byte mode only -- this app's inputs are invite URLs, and byte mode is
  // the safe general-purpose choice), automatic version selection, Reed-Solomon error correction, full
  // module placement (finder/timing/alignment patterns, format+version info), and all 8 standard mask
  // patterns scored so the best one is chosen. Validated before shipping with an independent decoder
  // (OpenCV's QRCodeDetector, a different codebase from this encoder) round-tripping realistic invite URLs
  // -- including the exact 64-hex-char token shape msos_create_swimmer_invite produces -- at error-correction
  // level M, plus a from-scratch Reed-Solomon-syndrome re-check across every QR version and EC level.
  const QR_LEVEL_M=0; // matches the numeric value the old qrcodejs-style CorrectLevel.M used
  const QR_GF_EXP=new Array(256),QR_GF_LOG=new Array(256);
  (function initQrGaloisField(){let x=1;for(let i=0;i<255;i++){QR_GF_EXP[i]=x;QR_GF_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}})();
  function qrGfMul(a,b){if(a===0||b===0)return 0;return QR_GF_EXP[(QR_GF_LOG[a]+QR_GF_LOG[b])%255];}
  function qrPolyMultiply(p1,p2){const result=new Array(p1.length+p2.length-1).fill(0);for(let i=0;i<p1.length;i++){if(p1[i]===0)continue;for(let j=0;j<p2.length;j++)result[i+j]^=qrGfMul(p1[i],p2[j]);}return result;}
  function qrGeneratorPoly(degree){let poly=[1];for(let i=0;i<degree;i++)poly=qrPolyMultiply(poly,[1,QR_GF_EXP[i]]);return poly;}
  function qrRsEncode(dataCodewords,ecCount){const generator=qrGeneratorPoly(ecCount);const result=dataCodewords.concat(new Array(ecCount).fill(0));for(let i=0;i<dataCodewords.length;i++){const coef=result[i];if(coef!==0)for(let j=0;j<generator.length;j++)result[i+j]^=qrGfMul(generator[j],coef);}return result.slice(dataCodewords.length);}
  const QR_RS_BLOCK_TABLE=[
    [[1,26,19],[1,26,16],[1,26,13],[1,26,9]],[[1,44,34],[1,44,28],[1,44,22],[1,44,16]],[[1,70,55],[1,70,44],[2,35,17],[2,35,13]],
    [[1,100,80],[2,50,32],[2,50,24],[4,25,9]],[[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12]],[[2,86,68],[4,43,27],[4,43,19],[4,43,15]],
    [[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14]],[[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15]],
    [[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13]],[[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16]],
    [[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13]],[[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15]],
    [[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12]],[[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13]],
    [[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13]],[[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16]],
    [[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15]],[[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15]],
    [[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14]],[[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16]],
    [[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17]],[[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13]],
    [[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16]],[[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17]],
    [[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16]],[[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17]],
    [[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16]],[[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16]],
    [[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16]],[[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16]],
    [[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16]],[[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16]],
    [[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16]],[[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17]],
    [[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16]],[[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16]],
    [[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16]],[[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16]],
    [[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16]],[[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]]
  ];
  function qrGetRSBlocks(version,levelIndex){const rows=QR_RS_BLOCK_TABLE[version-1][levelIndex];const blocks=[];const groups=rows.length/3;for(let g2=0;g2<groups;g2++){const n=rows[g2*3],total=rows[g2*3+1],data=rows[g2*3+2];for(let k=0;k<n;k++)blocks.push({totalCount:total,dataCount:data});}return blocks;}
  function qrTotalDataCodewords(version,levelIndex){return qrGetRSBlocks(version,levelIndex).reduce((s,b)=>s+b.dataCount,0);}
  const QR_LEVEL_VALUE_TO_INDEX={0:1,1:0,2:3,3:2}; // CorrectLevel value (L=1,M=0,Q=3,H=2) -> RS table index
  function qrCharCountBits(version){return version<=9?8:16;}
  function qrUtf8Encode(str){const bytes=[];for(let i=0;i<str.length;i++){let code=str.codePointAt(i);if(code>0xFFFF)i++;if(code<0x80)bytes.push(code);else if(code<0x800)bytes.push(0xC0|(code>>6),0x80|(code&0x3F));else if(code<0x10000)bytes.push(0xE0|(code>>12),0x80|((code>>6)&0x3F),0x80|(code&0x3F));else bytes.push(0xF0|(code>>18),0x80|((code>>12)&0x3F),0x80|((code>>6)&0x3F),0x80|(code&0x3F));}return bytes;}
  function QrBitBuffer(){this.buffer=[];this.length=0;}
  QrBitBuffer.prototype.putBit=function(bit){const idx=Math.floor(this.length/8);if(this.buffer.length<=idx)this.buffer.push(0);if(bit)this.buffer[idx]|=(0x80>>>(this.length%8));this.length++;};
  QrBitBuffer.prototype.put=function(num,length){for(let i=length-1;i>=0;i--)this.putBit(((num>>>i)&1)===1);};
  function qrChooseVersion(byteLength,levelIndex){for(let v=1;v<=40;v++){const capacityBits=qrTotalDataCodewords(v,levelIndex)*8;const neededBits=4+qrCharCountBits(v)+8*byteLength;if(neededBits<=capacityBits)return v;}return -1;}
  function qrAlignmentPositions(version){if(version===1)return[];const numAlign=Math.floor(version/7)+2;const size=version*4+17;let step;if(version===32)step=26;else step=Math.floor((version*4+numAlign*2+1)/(numAlign*2-2))*2;const result=new Array(numAlign);result[0]=6;let pos=size-7;for(let i=numAlign-1;i>=1;i--){result[i]=pos;pos-=step;}return result;}
  const QR_G15=0x537,QR_G15_MASK=0x5412,QR_G18=0x1F25;
  function qrBitLength(x){let l=0;while(x!==0){x>>>=1;l++;}return l;}
  function qrComputeFormatBits(levelIndex,maskPattern){const FORMAT_LEVEL_BITS=[1,0,3,2];const data=(FORMAT_LEVEL_BITS[levelIndex]<<3)|maskPattern;let d=data<<10;while(qrBitLength(d)-qrBitLength(QR_G15)>=0)d^=(QR_G15<<(qrBitLength(d)-qrBitLength(QR_G15)));return((data<<10)|d)^QR_G15_MASK;}
  function qrComputeVersionBits(version){let d=version<<12;while(qrBitLength(d)-qrBitLength(QR_G18)>=0)d^=(QR_G18<<(qrBitLength(d)-qrBitLength(QR_G18)));return(version<<12)|d;}
  function qrPlaceFinder(dark,reserved,size,row0,col0){for(let r=-1;r<=7;r++){if(row0+r<=-1||size<=row0+r)continue;for(let c=-1;c<=7;c++){if(col0+c<=-1||size<=col0+c)continue;const isDarkModule=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4);dark[row0+r][col0+c]=isDarkModule;reserved[row0+r][col0+c]=true;}}}
  function qrPlaceAlignment(dark,reserved,size,row0,col0){for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++){const rr=row0+r,cc=col0+c;if(rr<0||rr>=size||cc<0||cc>=size)continue;dark[rr][cc]=(Math.abs(r)===2||Math.abs(c)===2||(r===0&&c===0));reserved[rr][cc]=true;}}
  function qrReserveFormatInfo(reserved,size){for(let i=0;i<15;i++){const r=i<6?i:(i<8?i+1:size-15+i);reserved[r][8]=true;const c=i<8?size-1-i:(i<9?15-i:14-i);reserved[8][c]=true;}}
  function qrWriteFormatInfo(dark,size,bits){for(let i=0;i<15;i++){const bit=((bits>>i)&1)===1;const r=i<6?i:(i<8?i+1:size-15+i);dark[r][8]=bit;const c=i<8?size-1-i:(i<9?15-i:14-i);dark[8][c]=bit;}}
  function qrReserveVersionInfo(reserved,size){for(let i=0;i<18;i++){const r1=Math.floor(i/3),c1=(i%3)+size-11;reserved[r1][c1]=true;const r2=(i%3)+size-11,c2=Math.floor(i/3);reserved[r2][c2]=true;}}
  function qrWriteVersionInfo(dark,size,bits){for(let i=0;i<18;i++){const bit=((bits>>i)&1)===1;const r1=Math.floor(i/3),c1=(i%3)+size-11;dark[r1][c1]=bit;const r2=(i%3)+size-11,c2=Math.floor(i/3);dark[r2][c2]=bit;}}
  function qrBuildSkeleton(version){const size=version*4+17;const dark=[],reserved=[];for(let i=0;i<size;i++){dark.push(new Array(size).fill(false));reserved.push(new Array(size).fill(false));}
    qrPlaceFinder(dark,reserved,size,0,0);qrPlaceFinder(dark,reserved,size,0,size-7);qrPlaceFinder(dark,reserved,size,size-7,0);
    for(let i=8;i<=size-9;i++){if(!reserved[i][6]){dark[i][6]=(i%2===0);reserved[i][6]=true;}if(!reserved[6][i]){dark[6][i]=(i%2===0);reserved[6][i]=true;}}
    const positions=qrAlignmentPositions(version);
    if(positions.length>0){const first=positions[0],last=positions[positions.length-1];for(let pi=0;pi<positions.length;pi++)for(let pj=0;pj<positions.length;pj++){const r=positions[pi],c=positions[pj];if((r===first&&c===first)||(r===first&&c===last)||(r===last&&c===first))continue;qrPlaceAlignment(dark,reserved,size,r,c);}}
    dark[size-8][8]=true;reserved[size-8][8]=true;
    qrReserveFormatInfo(reserved,size);
    if(version>=7)qrReserveVersionInfo(reserved,size);
    return{size,dark,reserved};
  }
  function qrPlaceData(dark,reserved,size,codewords,maskFn){let inc=-1,row=size-1,bitIndex=7,byteIndex=0;
    for(let col=size-1;col>0;col-=2){if(col===6)col--;
      for(;;){for(let cc=0;cc<2;cc++){const c=col-cc;if(!reserved[row][c]){let bit=false;if(byteIndex<codewords.length)bit=((codewords[byteIndex]>>>bitIndex)&1)===1;if(maskFn(row,c))bit=!bit;dark[row][c]=bit;bitIndex--;if(bitIndex===-1){byteIndex++;bitIndex=7;}}}
        row+=inc;if(row<0||row>=size){row-=inc;inc=-inc;break;}}}}
  const QR_MASK_FUNCS=[
    (r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
    (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>((r*c)%2+(r*c)%3)===0,
    (r,c)=>(((r*c)%2+(r*c)%3)%2)===0,(r,c)=>(((r+c)%2+(r*c)%3)%2)===0,
  ];
  const QR_PATTERN_A=[true,false,true,true,true,false,true,false,false,false,false];
  const QR_PATTERN_B=[false,false,false,false,true,false,true,true,true,false,true];
  function qrWindowMatches(dark,r,c,dr,dc,pattern){for(let k=0;k<pattern.length;k++)if(dark[r+dr*k][c+dc*k]!==pattern[k])return false;return true;}
  function qrComputePenalty(dark,size){let score=0;
    for(let r=0;r<size;r++){let runLen=1;for(let c=1;c<size;c++){if(dark[r][c]===dark[r][c-1])runLen++;else{if(runLen>=5)score+=3+(runLen-5);runLen=1;}}if(runLen>=5)score+=3+(runLen-5);}
    for(let c=0;c<size;c++){let runLen2=1;for(let r=1;r<size;r++){if(dark[r][c]===dark[r-1][c])runLen2++;else{if(runLen2>=5)score+=3+(runLen2-5);runLen2=1;}}if(runLen2>=5)score+=3+(runLen2-5);}
    for(let r2=0;r2<size-1;r2++)for(let c2=0;c2<size-1;c2++){const v=dark[r2][c2];if(v===dark[r2][c2+1]&&v===dark[r2+1][c2]&&v===dark[r2+1][c2+1])score+=3;}
    for(let r3=0;r3<size;r3++)for(let c3=0;c3<=size-11;c3++){if(qrWindowMatches(dark,r3,c3,0,1,QR_PATTERN_A)||qrWindowMatches(dark,r3,c3,0,1,QR_PATTERN_B))score+=40;}
    for(let c4=0;c4<size;c4++)for(let r4=0;r4<=size-11;r4++){if(qrWindowMatches(dark,r4,c4,1,0,QR_PATTERN_A)||qrWindowMatches(dark,r4,c4,1,0,QR_PATTERN_B))score+=40;}
    let darkCount=0;for(let r5=0;r5<size;r5++)for(let c5=0;c5<size;c5++)if(dark[r5][c5])darkCount++;
    const percent=(darkCount*100)/(size*size);const prevMultiple=Math.floor(percent/5)*5,nextMultiple=prevMultiple+5;
    score+=Math.min(Math.abs(prevMultiple-50),Math.abs(nextMultiple-50))/5*10;
    return score;
  }
  function qrEncode(text,correctLevel){
    if(correctLevel===undefined||correctLevel===null)correctLevel=QR_LEVEL_M;
    const levelIndex=QR_LEVEL_VALUE_TO_INDEX[correctLevel];
    if(levelIndex===undefined)throw new Error('QRCode: invalid correctLevel '+correctLevel);
    const dataBytes=qrUtf8Encode(String(text));
    const version=qrChooseVersion(dataBytes.length,levelIndex);
    if(version===-1)throw new Error('QRCode: input text is too long to fit in a QR code (even at version 40) at this error-correction level.');
    const buf=new QrBitBuffer();
    buf.put(0x4,4);buf.put(dataBytes.length,qrCharCountBits(version));
    for(let i=0;i<dataBytes.length;i++)buf.put(dataBytes[i],8);
    const totalDC=qrTotalDataCodewords(version,levelIndex);const capacityBits=totalDC*8;
    for(let t=0;t<4&&buf.length<capacityBits;t++)buf.putBit(false);
    while(buf.length%8!==0)buf.putBit(false);
    const padBytes=[0xEC,0x11];let padToggle=0;
    while(buf.buffer.length<totalDC){buf.put(padBytes[padToggle%2],8);padToggle++;}
    const dataCodewords=buf.buffer.slice(0,totalDC);
    const rsBlocks=qrGetRSBlocks(version,levelIndex);let offset=0;const blocks=[];
    for(let b=0;b<rsBlocks.length;b++){const rb=rsBlocks[b];const d=dataCodewords.slice(offset,offset+rb.dataCount);offset+=rb.dataCount;const ecCount=rb.totalCount-rb.dataCount;blocks.push({data:d,ec:qrRsEncode(d,ecCount)});}
    let maxDataLen=0,maxEcLen=0;for(let bi=0;bi<blocks.length;bi++){if(blocks[bi].data.length>maxDataLen)maxDataLen=blocks[bi].data.length;if(blocks[bi].ec.length>maxEcLen)maxEcLen=blocks[bi].ec.length;}
    const finalCodewords=[];
    for(let di=0;di<maxDataLen;di++)for(let bd=0;bd<blocks.length;bd++)if(di<blocks[bd].data.length)finalCodewords.push(blocks[bd].data[di]);
    for(let ei=0;ei<maxEcLen;ei++)for(let be=0;be<blocks.length;be++)if(ei<blocks[be].ec.length)finalCodewords.push(blocks[be].ec[ei]);
    const skeleton=qrBuildSkeleton(version);let best=null;
    for(let m=0;m<8;m++){const trialDark=skeleton.dark.map(row=>row.slice());qrPlaceData(trialDark,skeleton.reserved,skeleton.size,finalCodewords,QR_MASK_FUNCS[m]);const penalty=qrComputePenalty(trialDark,skeleton.size);if(best===null||penalty<best.penalty)best={penalty,mask:m,dark:trialDark};}
    const formatBits=qrComputeFormatBits(levelIndex,best.mask);qrWriteFormatInfo(best.dark,skeleton.size,formatBits);
    if(version>=7)qrWriteVersionInfo(best.dark,skeleton.size,qrComputeVersionBits(version));
    const finalDark=best.dark;
    return{moduleCount:skeleton.size,version,maskPattern:best.mask,isDark:(row,col)=>finalDark[row][col]};
  }
  // Draws directly to a <canvas> appended into el -- no separate library/class, just this app's own encoder.
  function drawQr(el,text,width,height){
    el.innerHTML='';
    const result=qrEncode(text,QR_LEVEL_M);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000000';
    const count=result.moduleCount;
    for(let r=0;r<count;r++){const y0=Math.round((r*height)/count),y1=Math.round(((r+1)*height)/count);
      for(let c=0;c<count;c++){if(!result.isDark(r,c))continue;const x0=Math.round((c*width)/count),x1=Math.round(((c+1)*width)/count);ctx.fillRect(x0,y0,x1-x0,y1-y0);}}
    el.appendChild(canvas);
  }
  // Real coaching failure this fixes: Andy reported the "give swimmer access" QR modal never actually
  // locking the screen -- he could still tap around the rest of the app behind it -- and tapping Close
  // appeared to do nothing. Root cause: every OTHER modal in this app (app.js, attendance-roster.js,
  // modification-edit.js, and a dozen more) uses the real, styled `modal-backdrop` class (position:fixed,
  // full-screen dim, centering -- defined once in styles.css), but this file alone used a class,
  // `modal-overlay`, that has never had any CSS rule anywhere in the codebase. With no matching rule the
  // wrap rendered as a plain, unstyled block appended in the NORMAL page flow instead of a fixed overlay --
  // nothing blocked touches to the page behind it (exactly "I can move around as usual"), and removing an
  // in-flow block on Close reflows/scrolls the page in a way that can look like nothing happened. Using the
  // one real, already-correct class fixes both.
  function modal(a){const host=document.querySelector('#modalHost')||document.body,wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.dataset.bnAccess='1';wrap.innerHTML=`<div class="bn-access-modal"><div class="eyebrow">SECURE SWIMMER ACCESS</div><h2>${esc(a.full_name)}</h2><p class="muted">Private swimmer-only access. MSOS verifies performance, the current individual session and the Challenge / Edit / Finish link back to your coach before it issues the QR.</p><div class="bn-qr" data-bn-qr><span class="muted">QR appears here</span></div><div class="bn-access-url" data-bn-url hidden></div><div class="bn-access-actions"><button class="primary" data-bn-generate>Generate 15-minute QR</button><button data-bn-copy hidden>Copy link</button><button class="danger" data-bn-revoke>Revoke swimmer devices</button><button data-bn-close>Close</button></div><p class="bn-access-status" data-bn-status></p></div>`;host.append(wrap);
    // Real coaching failure this fixes: fixing the missing backdrop class (above) surfaced a second, deeper
    // bug -- Andy reported that even with the screen now properly dimmed/locked, tapping the on-screen
    // "Close" button did nothing, and the only way out was pressing the phone's back button several times
    // in a row. Root cause: every OTHER modal in the app (app.js, attendance-roster.js, and others) calls
    // `M.nav.openLayer('modal')` the moment it opens, which pushes one browser-history entry tagged as a
    // dismissable "layer" -- that's what lets a single back-press (or this file's own Close button, once it
    // also routes through `M.nav.dismissLayer()`) cleanly pop exactly that one entry and close just the
    // modal. This file never called openLayer at all, so opening it left the coach's EXISTING navigation
    // history untouched -- pressing back just walked back through whatever screens the coach had already
    // visited, with the modal still sitting on top the whole time, until enough presses happened to land on
    // a history entry with no "layer" tag, which is the one specific case navigation.js's own popstate
    // handler clears #modalHost as a side effect. That accidental clear is why it eventually worked, and why
    // it took several presses instead of one. Routing both the Close button and the browser back button
    // through the exact same `M.nav.openLayer`/`dismissLayer` pair every other modal already uses fixes both
    // in one place, with no special-case logic of its own.
    M.nav?.openLayer?.('modal');
    const status=wrap.querySelector('[data-bn-status]'),qr=wrap.querySelector('[data-bn-qr]'),urlBox=wrap.querySelector('[data-bn-url]'),copy=wrap.querySelector('[data-bn-copy]');let activeUrl='';const setStatus=(msg,kind='')=>{status.textContent=msg;status.className=`bn-access-status ${kind}`};
    let myGeneration=null;
    const closeModal=()=>{myGeneration?.cancel?.();wrap.remove();M.nav?.dismissLayer?.();};
    wrap.querySelector('[data-bn-close]').onclick=closeModal;const genBtn=wrap.querySelector('[data-bn-generate]');genBtn.onclick=async()=>{if(genBtn.disabled)return;genBtn.disabled=true;
      // Real coaching failure this fixes (19 Sept 2026, third same-day freeze on Matthew Robertson): the ONLY
      // guard against two "Generate" flows running at once was `genBtn.disabled`, scoped to THIS modal's one
      // button element. Closing the modal (the Close button, or the phone's back button, which routes here
      // via M.nav's layer system) never cancelled an in-flight generate() call -- its ticker, wake lock,
      // visibility listener and pending network/RPC calls all kept running in the background for up to the
      // full GENERATE_TIMEOUT_MS (2 minutes), completely invisibly. Re-opening "Give swimmer access" and
      // tapping Generate again built a BRAND NEW modal with a freshly-enabled genBtn that had zero awareness
      // of that still-running old attempt -- both then wrote to the SAME shared msos_qr_last_attempt
      // breadcrumb key on every tick, so whichever one wrote last simply overwrote the other's real progress.
      // A genuinely slow-but-working NEW attempt could have its status silently stomped by an OLD, already-
      // abandoned attempt re-stamping its own frozen step every second -- making a real recovery look
      // indistinguishable from an eternal freeze, and wasting a full duplicate evidence-fetch + RPC round
      // trip every time Andy retried, which matches "same old shit" recurring same-day, same-build, same
      // exact step far better than a fresh, unrelated freeze each time would. activeGeneration (declared
      // above, module-level) is cancelled the instant a newer attempt starts or its own modal closes, and
      // every write below now checks its own attempt is still the active one first -- a superseded attempt
      // can never again touch the screen or corrupt a newer attempt's diagnostics.
      activeGeneration?.cancel?.();
      let wakeLock=null,tickTimer=null,onVisibilityChange=null;
      const gen={cancelled:false};
      gen.cancel=()=>{if(gen.cancelled)return;gen.cancelled=true;try{clearInterval(tickTimer)}catch{}try{onVisibilityChange&&document.removeEventListener('visibilitychange',onVisibilityChange)}catch{}try{wakeLock?.release?.()}catch{}wakeLock=null;};
      activeGeneration=gen;myGeneration=gen;
      try{writeAttempt({athleteId:String(a.id||''),athleteName:a.full_name||'',step:'starting',tickSeconds:0,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),resolvedAt:null,outcome:null,message:''});
      // Confirmed root cause (19 Sept 2026): Andy's screenshot showed the modal frozen at "Checking swimmer
      // evidence... (5/5 * training_test_types) (0s)" for Matthew Robertson; live Supabase logs proved every
      // evidence job had already returned in under 2.5s and no RPC after that point ever reached the network,
      // so the freeze was entirely client-side with no error and no further activity of any kind. Andy
      // confirmed directly when asked: "screen was locked, yeah" -- Android suspends a backgrounded/locked
      // page's JS outright, which explains a frozen ticker (setInterval never fires), no network traffic, and
      // no thrown error, all at once. Requesting a screen wake lock for the duration of this flow keeps the
      // screen (and therefore the JS) alive so the flow can actually run to completion or fail loudly instead
      // of silently freezing. Wrapped defensively: unsupported browsers, denied permission, or any other
      // wakeLock error must never block or break QR generation itself -- and if the phone still locks for some
      // other reason (a hardware power-button press some Android versions honour despite a held lock), the
      // flow still hits its existing GENERATE_TIMEOUT_MS bound and surfaces a real error rather than a silent
      // freeze, and the released lock is re-acquired on the swimmer's next attempt regardless. Deliberately a
      // private, local lock rather than routing through app.js's existing M.wake ("Screen awake" button /
      // M.state.settings.keepAwake): that module is a persisted, coach-visible preference ("always keep my
      // screen on"), and acquiring/releasing it here on every QR generation would flip that toggle's own UI
      // and saved setting as a side effect of an unrelated flow. Multiple independent wake locks can be held
      // at once with no conflict, so this coexists safely whether or not the coach also has Keep Awake on.
      //
      // 19 Sept 2026, same day, second occurrence: the wake lock above did NOT stop a fourth freeze on the
      // exact same step for Matthew Robertson, on this exact build. The Wake Lock API only stops the screen
      // dimming/turning off from ordinary inactivity -- it does NOT stop a manual power-button press, and
      // critically does NOT stop Android from throttling/suspending a BACKGROUNDED tab if Andy switches to
      // another app (phone-in-pocket, a text message, anything that takes the browser out of the foreground)
      // -- "screen was locked" may have meant any of these, and only one of them is even theoretically fixable
      // from this file. Rather than guess again, this adds three independent, purely observational breadcrumb
      // fields so the NEXT occurrence proves which one actually happened instead of us re-guessing a second
      // time: whether the lock was even supported/held at all, whether the BROWSER itself force-released it
      // (its own 'release' event -- fires when the OS reclaims it, e.g. a real screen-off), and the exact
      // moment(s) the tab's own visibility changed (hidden = truly backgrounded, not just screen dimming).
      const wakeLockSupported=!!(navigator.wakeLock&&typeof navigator.wakeLock.request==='function');
      try{wakeLock=await navigator.wakeLock?.request?.('screen');}catch{}
      if(gen.cancelled)return;
      writeAttempt({wakeLockSupported,wakeLockHeld:!!wakeLock,wakeLockReleasedEarly:false});
      try{wakeLock?.addEventListener?.('release',()=>{if(!gen.cancelled)writeAttempt({wakeLockReleasedEarly:true,wakeLockReleasedAt:new Date().toISOString()});},{once:true});}catch{}
      onVisibilityChange=()=>{if(!gen.cancelled)writeAttempt({lastVisibilityState:document.visibilityState,lastVisibilityChangeAt:new Date().toISOString()});};
      try{document.addEventListener('visibilitychange',onVisibilityChange);}catch{}
      let step='Checking swimmer evidence';
      // Real coaching failure this guards against: Andy reported the modal frozen on the exact same status
      // text for a full minute even with every step now individually bounded well under that -- with no way
      // for either of us to tell, from the screenshot alone, whether the app was still legitimately working
      // or the JS itself had stopped running. Ticking the elapsed time for whichever step is CURRENTLY in
      // flight makes that visible on the screen itself: if the seconds keep counting up, the app is alive
      // and the step is just slow (and will still resolve or time out on its own bound); if the seconds
      // freeze too, that is a materially different, more serious problem than any of the timeouts above can
      // fix, and is itself the diagnostic we need.
      const note=msg=>{if(gen.cancelled)return;clearInterval(tickTimer);step=msg;const t0=Date.now();const render=()=>{if(gen.cancelled)return;const secs=Math.max(0,Math.round((Date.now()-t0)/1000));setStatus(`${msg} (${secs}s)`);writeAttempt({step:msg,tickSeconds:secs,updatedAt:new Date().toISOString()});};render();tickTimer=setInterval(render,X.STATUS_TICK_MS);};
      // 19 Sept 2026 (third same-day freeze): every prior breadcrumb showed the SAME last step --
      // "Checking swimmer evidence... (5/5 * training_test_types)" -- with every checkpoint after it
      // (the reference-cache save, the T400 hydrate, the cache invalidation, the pathway model build, each
      // of payloadFor's six sub-steps) never once appearing, across three separate occurrences. note() above
      // writes the breadcrumb only via setStatus+render, so if a stale/cancelled attempt's ticker (the exact
      // bug this whole change fixes) was overwriting a live attempt's step every second, or if setStatus
      // itself ever threw for any reason, every write downstream of that point would silently vanish with
      // no trace, indistinguishable from the app never reaching that line at all. lastCheckpoint is written
      // directly here, before note() touches the screen at all, and does not depend on the ticker or on
      // setStatus succeeding -- so if this same gap ever shows up again, we can finally tell whether the
      // code genuinely never got there, or got there fine and only the on-screen status was lost.
      const mark=name=>{if(gen.cancelled)return;try{writeAttempt({lastCheckpoint:String(name||''),lastCheckpointAt:new Date().toISOString()});}catch{}};
      // 19 Sept 2026, fourth+ occurrence: this exact freeze now reproduces for EVERY swimmer (not just
      // Matthew Robertson) and survives a full app reload, which rules out both today's earlier concurrency
      // fix and anything specific to one athlete's data. Andy separately checked Chrome's own per-site
      // storage figure for this app and found 223MB stored -- for an offline-first app whose real per-athlete
      // evidence should be single-digit-to-low-double-digit MB, that is a strong sign something local has
      // grown unbounded, but there is no safe way to confirm what without risking real, possibly-unsynced
      // coaching data (Andy has marked very few sessions "Finished" while chasing this bug, so a manual
      // storage clear is explicitly NOT being attempted). This purely-observational, read-only snapshot
      // (navigator.storage.estimate() plus the in-memory length of every evidence/reference array this flow
      // touches) costs nothing, changes nothing, and never blocks the flow if unsupported -- it exists so the
      // next breadcrumb can show, in MB and row counts, whether one of these arrays really has ballooned
      // before we go looking for a synchronous loop that may not exist.
      try{
        const est=await(navigator.storage?.estimate?.()||Promise.resolve(null));
        const diagStorageUsageMB=est&&Number.isFinite(est.usage)?Math.round(est.usage/1048576*10)/10:null;
        const diagStorageQuotaMB=est&&Number.isFinite(est.quota)?Math.round(est.quota/1048576*10)/10:null;
        const diagStateCounts={trainingTestTypes:(M.state?.trainingTestTypes||[]).length,trainingTestResults:(M.state?.trainingTestResults||[]).length,resultsPbBoard:(M.state?.resultsPbBoard||[]).length,coachResults:(M.state?.coachResults||[]).length,resultsEventHistory:(M.state?.resultsEventHistory||[]).length,pathwayStandards:(M.state?.pathwayStandards||[]).length,pathwayMeets:(M.state?.pathwayMeets||[]).length,captures:(M.state?.captures||[]).length,athletes:(M.state?.athletes||[]).length,sessions:(M.state?.sessions||[]).length};
        if(!gen.cancelled)writeAttempt({diagStorageUsageMB,diagStorageQuotaMB,diagStateCounts});
      }catch{}
      if(gen.cancelled)return;
      // 19 Sept 2026 (Andy, direct): "I just want to give them access to their info and their squads
      // sessions, this back and forth is wearing me down for 1 simple task" -- and he's right. Every freeze
      // chased across this whole day (wake lock, visibility, the concurrency guard, storage/checkpoint
      // diagnostics, refs-save-outcome diagnostics) traced back to one step: M.swimmerPerformanceBM's live
      // completeEvidence() call, run synchronously in this button's critical path, which pulls PB board /
      // coach results / event history / test results+types and -- worst of all -- refetches the whole
      // ~4400-row pathway_standards/pathway_meets tables whenever the local copy is empty, which it always
      // is on Andy's phone. That live network step is now removed from this button entirely. Access is
      // built from whatever is ALREADY cached locally, which already includes the swimmer's squad sessions
      // (sessionsFor/candidateSessionsFor below was never limited to "today only" -- that part was never
      // the problem, only the live evidence refresh gating it was). A refresh is still kicked off here so
      // the cache keeps improving for next time, but it is fire-and-forget: nothing below ever awaits it,
      // and whatever it does -- succeeds, times out, or throws -- can never hold up or fail this flow again.
      try{M.swimmerPerformanceBM?.completeEvidence?.(a)?.then?.(c=>{try{writeAttempt({backgroundRefreshOutcome:c?.ok===false?'errors':'ok',backgroundRefreshAt:new Date().toISOString()});}catch{}},()=>{try{writeAttempt({backgroundRefreshOutcome:'threw',backgroundRefreshAt:new Date().toISOString()});}catch{}});}catch{}
      if(gen.cancelled)return;
      try{await withTimeout((async()=>{mark('readiness_check');note('Checking swimmer readiness…');const ready=M.swimmerPerformanceBM?.readinessFor?.(a)||{ok:true,issues:[],model:{events:[]}};if(!ready.ok)throw new Error(`Swimmer access held: ${ready.issues.join(' ')}`);if(gen.cancelled)return;const eventCount=Number(ready.model?.events?.length)||0;note('Assembling private swimmer view…');const portal=corePayloadFor(a,name=>{mark(`payload:${name}`);note(`Assembling private swimmer view… (${String(name||'').replace(/_/g,' ')})`);});if(gen.cancelled)return;if(!portal.session?.blocks?.length)throw new Error('Swimmer access held: no current individual session is published.');if(portal.session.blocks.some(b=>(b.items||[]).some(i=>!i.id)))throw new Error('Swimmer access held: one or more session lines do not have stable item identity for Challenge / Edit logging.');mark('bootstrap_owner');note('Establishing secure owner access…');await rpc('msos_bootstrap_owner',{});if(gen.cancelled)return;mark('interaction_layer');note('Checking Challenge / Edit / Finish link…');await verifySessionInteractionLayer(a,portal.session.id);if(gen.cancelled)return;mark('publish_payload');note(`Verified ${eventCount} event${eventCount===1?'':'s'} + current session + feedback link. Publishing private view…`);await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:portal});if(gen.cancelled)return;mark('create_invite');const inv=await rpc('msos_create_swimmer_invite',{p_athlete_id:String(a.id),p_minutes:15});if(gen.cancelled)return;activeUrl=new URL('swimmer-portal.html',location.href);activeUrl.searchParams.set('invite',inv.invite_token);activeUrl=activeUrl.toString();urlBox.textContent=activeUrl;urlBox.hidden=false;copy.hidden=false;qr.innerHTML='';const expiresLabel=new Date(inv.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        // 20 Sept 2026 (Andy, live, twice on two different builds -- same message both times): by this point
        // access is already fully granted and published -- the invite exists and the link above is real and
        // copyable. Drawing the small QR IMAGE is a cosmetic nicety loaded from an external CDN on top of
        // that, and it failing must never again look like access itself failed. It used to share the SAME
        // try/catch as everything above it, so a flaky CDN load painted the whole attempt red with a scary
        // error while giving a coach no reason to trust the perfectly good link already sitting above it.
        // Isolated into its own try/catch: on success nothing changes; on failure the real "Ready" status
        // still shows (Copy link already works), a plain note says the QR image specifically didn't draw,
        // and the breadcrumb records qrRenderOutcome separately from the attempt's real outcome/step, which
        // stay 'ok'/'done' because access genuinely succeeded.
        mark('load_qr');note('Loading QR renderer…');let qrOutcome='ok',qrMessage='';
        try{if(gen.cancelled)return;drawQr(qr,activeUrl,240,240);}
        catch(qrErr){qrOutcome='error';qrMessage=qrErr?.message||String(qrErr);qr.innerHTML='<span class="muted">QR image unavailable — use Copy link below.</span>';}
        if(gen.cancelled)return;
        setStatus(qrOutcome==='ok'
          ?`Ready · session + ${eventCount} event${eventCount===1?'':'s'} + feedback link verified · one scan only · expires ${expiresLabel}`
          :`Ready · link verified, expires ${expiresLabel} · QR image failed to load (${qrMessage}) — use Copy link`,'ok');
        writeAttempt({resolvedAt:new Date().toISOString(),outcome:'ok',step:'done',message:'',qrRenderOutcome:qrOutcome,qrRenderMessage:qrMessage});
        // 20 Sept 2026, RE-ENABLED (Andy, live: "we need to get them to be able to see all of the information
        // I have for them"). Disabled the same night it first shipped after payloadFor() locked William
        // Callow's phone solid for a later Matthew Robertson attempt -- see payloadForAsync's own comment
        // above for the full account of what was found and fixed since: buildAthletePathways() directly
        // profiled and measurably sped up (~2.3x at Andy's real ~4,400-row standards-table scale, verified
        // against the actual pre-fix file), and this deferred republish now runs as payloadForAsync's real
        // multi-stage generator -- the same unchanged safeX() computations as before, but yielding back to
        // the browser between every stage and bounded by a hard wall-clock ceiling, so no single stage can
        // ever again compound into one unbroken freeze. Deliberately still deferred one tick and never
        // awaited by the Generate button itself -- it can only add data to an access that has already fully
        // succeeded, never delay or fail it.
        (async()=>{
          try{
            const{payload:full,truncatedAt}=await payloadForAsync(a,name=>{try{writeAttempt({enrichmentStep:String(name||'')});}catch{}});
            await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:full});
            writeAttempt({enrichmentOutcome:truncatedAt?'partial':'ok',enrichmentTruncatedAt:truncatedAt||null,enrichmentAt:new Date().toISOString()});
          }catch(err){try{writeAttempt({enrichmentOutcome:'error',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
        })();
      })(),X.GENERATE_TIMEOUT_MS,()=>step);}finally{clearInterval(tickTimer);try{document.removeEventListener('visibilitychange',onVisibilityChange);}catch{}try{await wakeLock?.release?.()}catch{}wakeLock=null;}}catch(err){if(!gen.cancelled){qr.innerHTML='<span class="muted">QR not generated</span>';setStatus(err?.message||String(err),'error');writeAttempt({resolvedAt:new Date().toISOString(),outcome:'error',message:err?.message||String(err)});}}finally{if(activeGeneration===gen)activeGeneration=null;if(myGeneration===gen)myGeneration=null;genBtn.disabled=false}};copy.onclick=async()=>{if(!activeUrl)return;try{await navigator.clipboard.writeText(activeUrl);setStatus('Link copied.','ok')}catch{setStatus('Copy failed — use the QR code.','error')}};const revokeBtn=wrap.querySelector('[data-bn-revoke]');revokeBtn.onclick=async()=>{if(revokeBtn.disabled)return;revokeBtn.disabled=true;try{const n=await rpc('msos_revoke_swimmer_devices',{p_athlete_id:String(a.id)});setStatus(`${Number(n)||0} swimmer device${Number(n)===1?'':'s'} revoked.`,'ok')}catch(err){setStatus(err?.message||String(err),'error')}finally{revokeBtn.disabled=false}};}
  // Real coaching failure this fixes (Andy, live, 20 Sept 2026, right after Matthew's first real session
  // reached his phone and came back with his own notes): "will tonight's session show on his phone when I
  // write it?" Until this fix, the honest answer was no. Device pairing itself is permanent -- msos_claim_
  // swimmer_invite exchanges a one-time QR for a device token saved on the swimmer's own phone (localStorage),
  // proven working live tonight, so a swimmer never needs to scan a second QR code -- but the actual SESSION
  // DATA only ever got (re)published to Supabase from inside "Generate 15-minute QR", which required Andy to
  // reopen that one swimmer's own access screen and tap Generate again, every time, per swimmer. That is not
  // what "give swimmers access to their sessions" was ever supposed to mean, and it does not scale past one
  // or two athletes -- the real substance behind tonight's "how much longer" frustration, not a new bug so
  // much as a piece of the original ask that was never actually finished.
  //
  // Fixed here without touching app.js at all: Store.putSession is a checksum-protected release asset (see
  // release-package.test.js's `mutable` set, which app.js is deliberately NOT in) and app.js/Coach Hub stay
  // off-limits without concrete evidence tying them to a real bug, per standing instruction. Instead this
  // wraps the EXISTING M.store.putSession the exact same optional-hook way app.js already layers cloud sync
  // onto it -- Store.putSession's own body already calls `M.cloud?.stageSession?.(...)` right after saving;
  // this is that identical pattern, from a different engine, not a new technique. Whenever ANY session is
  // saved (new session created, session edited, or intake applied -- the three real places app.js calls
  // Store.putSession), every currently-active athlete belonging to that session's squad(s) (the same
  // case-insensitive squad match app.js's own UI.currentAthletes/D.presentAthletes already use) gets their
  // swimmer-portal payload silently republished in the background, using corePayloadFor -- the exact same
  // minimal, twice-proven-fast shape Generate's own critical path already trusts, never the full analytical
  // payloadFor (that stays deliberately disabled -- see the comment above corePayloadFor for why). This can
  // never block or fail the session save itself (fire-and-forget, each athlete's publish independently
  // wrapped in try/catch, so one failure can't affect another athlete or the save that triggered it), and it
  // is harmless to run for an athlete who has never been given access at all: msos_publish_swimmer_payload is
  // a plain upsert nobody can read without their own device token (RLS revokes all direct access to that
  // table -- supabase/20260824_secure_swimmer_portal.sql), so it just sits there ready for whenever Andy does
  // eventually generate that swimmer's first QR.
  function athletesForSquads(squads){
    if(!Array.isArray(squads)||!squads.length)return[];
    const set=new Set(squads.map(s=>String(s||'').toLowerCase()).filter(Boolean));
    if(!set.size)return[];
    return(M.state?.athletes||[]).filter(a=>a.active!==false&&set.has(String(a.squad||'').toLowerCase()));
  }
  // Real coaching failure this fixes (Andy, live, 21 Sept 2026: "add squad on roll also freezes" -- reported
  // right after his own Coach Hub freeze report, on a completely different screen, ruling out Hub's own
  // render as the shared cause once profiling had already cleared it -- see coach-hub-double-tap-freeze test
  // and its 2026-09-21 re-verification for that separate finding). engines/attendance-roster.js's addSquad()
  // calls M.store.putSession() directly (the exact same call app.js makes on every new session, session
  // edit, and intake apply), which this file's installSessionAutoPublishHook wraps. Until this fix,
  // autoPublishSessionToSwimmers() queued EVERY currently-active athlete in the session's (now-larger) squad
  // set as its own Promise.resolve().then() microtask, all in the same synchronous turn -- microtasks all run
  // back-to-back before the browser gets a chance to paint or handle the next tap. Profiled against real
  // Supabase-sourced scale (272 sessions, 72 athletes, a real 2-squad session pulling in 30 athletes -- see
  // /tmp/msos-profile2/profile-autopublish.cjs): the synchronous corePayloadFor()-equivalent work alone
  // (candidateSessionsFor + projectionFor per candidate session) totalled ~167ms on server-grade hardware for
  // just those 30 athletes, with real per-athlete variance up to 52ms -- on a real phone's much slower JS
  // engine this compounds well into freeze territory, on top of firing 30 concurrent network RPCs at once.
  // This is exactly the same "unbounded synchronous burst, no yield to the browser" shape as the double-tap
  // Coach Hub freeze this project already fixed once (engines/coach-loop-ui.js, 16 Sept) and the same shape
  // the 20 Sept re-enable comment above describes payloadForAsync being rewritten to avoid ("yielding back to
  // the browser between every stage ... so no single stage can ever again compound into one unbroken
  // freeze") -- this auto-publish-on-every-save hook was simply added later and never got that same
  // treatment. Fixed by yielding to the browser (a real macrotask boundary, not just a microtask) before
  // each athlete's synchronous work runs, so a squad add (or any session save) can never do more than roughly
  // one athlete's worth of work per turn -- the browser gets to paint and handle input in between every
  // single athlete, no matter how large the squad. Still fire-and-forget (never awaited by putSession, so it
  // can never block or fail the save itself) and still one try/catch per athlete (one failure can't affect
  // another). See tests/swimmer-autopublish-squad-add-freeze-20260921.cjs.
  async function autoPublishSessionToSwimmers(session){
    try{
      const athletes=athletesForSquads(session?.identity?.squads);
      for(const a of athletes){
        await new Promise(resolve=>setTimeout(resolve,0));
        try{
          const payload=corePayloadFor(a,()=>{});
          await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:payload});
        }catch{}
      }
    }catch{}
  }
  (function installSessionAutoPublishHook(){
    if(typeof M.store?.putSession!=='function'||M.store.putSession.__msosSwimmerAutoPublish)return;
    const prevPutSession=M.store.putSession;
    const wrapped=(state,session)=>{
      const result=prevPutSession(state,session);
      autoPublishSessionToSwimmers(result||session);
      return result;
    };
    wrapped.__msosSwimmerAutoPublish=true;
    M.store.putSession=wrapped;
  })();
  function installButton(){if((M.access?.role?.()||'owner')!=='owner')return;const a=selected(),head=document.querySelector('#athletesView .cn-owner-actions')||document.querySelector('#athletesView .perf-head .hub-actions')||document.querySelector('#athletesView .perf-head');if(!a||!head||head.querySelector('[data-bn-access]'))return;const b=document.createElement('button');b.dataset.bnAccess='1';b.className='bn-access-btn';b.textContent='Give swimmer access';b.onclick=()=>modal(a);head.append(b);}
  function install(){requestAnimationFrame(installButton);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  X.payloadFor=payloadFor;X.corePayloadFor=corePayloadFor;X.safeSession=safeSession;X.sessionsFor=sessionsFor;X.safePerformance=safePerformance;X.safeTests=safeTests;X.safeMeet=safeMeet;X.sessionActionsFor=sessionActionsFor;X.verifySessionInteractionLayer=verifySessionInteractionLayer;X.acknowledgeSessionAction=acknowledgeSessionAction;X.rpc=rpc;X.installButton=installButton;X.qrEncode=qrEncode;X.drawQr=drawQr;X.athletesForSquads=athletesForSquads;X.autoPublishSessionToSwimmers=autoPublishSessionToSwimmers;X.payloadForAsync=payloadForAsync;X.sessionsPartFor=sessionsPartFor;X.safeTraining=safeTraining;X.ownCapture=ownCapture;
})(globalThis);
