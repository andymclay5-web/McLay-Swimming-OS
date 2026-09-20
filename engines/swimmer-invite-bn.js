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
  async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.referrerPolicy='no-referrer';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('QR renderer did not load'));s.onerror=()=>reject(new Error('QR renderer could not load'));document.head.appendChild(s)});return X.qrPromise;}
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
      try{await withTimeout((async()=>{mark('readiness_check');note('Checking swimmer readiness…');const ready=M.swimmerPerformanceBM?.readinessFor?.(a)||{ok:true,issues:[],model:{events:[]}};if(!ready.ok)throw new Error(`Swimmer access held: ${ready.issues.join(' ')}`);if(gen.cancelled)return;const eventCount=Number(ready.model?.events?.length)||0;note('Assembling private swimmer view…');const portal=corePayloadFor(a,name=>{mark(`payload:${name}`);note(`Assembling private swimmer view… (${String(name||'').replace(/_/g,' ')})`);});if(gen.cancelled)return;if(!portal.session?.blocks?.length)throw new Error('Swimmer access held: no current individual session is published.');if(portal.session.blocks.some(b=>(b.items||[]).some(i=>!i.id)))throw new Error('Swimmer access held: one or more session lines do not have stable item identity for Challenge / Edit logging.');mark('bootstrap_owner');note('Establishing secure owner access…');await rpc('msos_bootstrap_owner',{});if(gen.cancelled)return;mark('interaction_layer');note('Checking Challenge / Edit / Finish link…');await verifySessionInteractionLayer(a,portal.session.id);if(gen.cancelled)return;mark('publish_payload');note(`Verified ${eventCount} event${eventCount===1?'':'s'} + current session + feedback link. Publishing private view…`);await rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:portal});if(gen.cancelled)return;mark('create_invite');const inv=await rpc('msos_create_swimmer_invite',{p_athlete_id:String(a.id),p_minutes:15});if(gen.cancelled)return;activeUrl=new URL('swimmer-portal.html',location.href);activeUrl.searchParams.set('invite',inv.invite_token);activeUrl=activeUrl.toString();urlBox.textContent=activeUrl;urlBox.hidden=false;copy.hidden=false;qr.innerHTML='';mark('load_qr');note('Loading QR renderer…');const Q=await loadQr();if(gen.cancelled)return;new Q(qr,{text:activeUrl,width:240,height:240,correctLevel:Q.CorrectLevel?.M});setStatus(`Ready · session + ${eventCount} event${eventCount===1?'':'s'} + feedback link verified · one scan only · expires ${new Date(inv.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`,'ok');writeAttempt({resolvedAt:new Date().toISOString(),outcome:'ok',step:'done',message:''});
        // 20 Sept 2026: performance/training/tests/meet are deliberately NOT part of the payload published
        // above -- see corePayloadFor's own comment for why. Build and publish the full, enriched payload
        // now, but deferred via setTimeout so it runs AFTER this handler's own synchronous work (and the
        // QR/"Ready" status the coach is actually watching) has already rendered, and entirely outside
        // withTimeout/GENERATE_TIMEOUT_MS above -- however long this takes, or even if it never finishes,
        // it can no longer delay or fail the access the coach already has in hand. Silent by design (writes
        // only to the breadcrumb, never to setStatus/mark/note) so it can never overwrite the "Ready" status
        // still on screen.
        setTimeout(()=>{
          try{
            const full=payloadFor(a,name=>{try{writeAttempt({enrichmentStep:String(name||'')});}catch{}});
            rpc('msos_publish_swimmer_payload',{p_athlete_id:String(a.id),p_payload:full}).then(
              ()=>{try{writeAttempt({enrichmentOutcome:'ok',enrichmentAt:new Date().toISOString()});}catch{}},
              err=>{try{writeAttempt({enrichmentOutcome:'error',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
            );
          }catch(err){try{writeAttempt({enrichmentOutcome:'threw',enrichmentMessage:err?.message||String(err),enrichmentAt:new Date().toISOString()});}catch{}}
        },0);
      })(),X.GENERATE_TIMEOUT_MS,()=>step);}finally{clearInterval(tickTimer);try{document.removeEventListener('visibilitychange',onVisibilityChange);}catch{}try{await wakeLock?.release?.()}catch{}wakeLock=null;}}catch(err){if(!gen.cancelled){qr.innerHTML='<span class="muted">QR not generated</span>';setStatus(err?.message||String(err),'error');writeAttempt({resolvedAt:new Date().toISOString(),outcome:'error',message:err?.message||String(err)});}}finally{if(activeGeneration===gen)activeGeneration=null;if(myGeneration===gen)myGeneration=null;genBtn.disabled=false}};copy.onclick=async()=>{if(!activeUrl)return;try{await navigator.clipboard.writeText(activeUrl);setStatus('Link copied.','ok')}catch{setStatus('Copy failed — use the QR code.','error')}};const revokeBtn=wrap.querySelector('[data-bn-revoke]');revokeBtn.onclick=async()=>{if(revokeBtn.disabled)return;revokeBtn.disabled=true;try{const n=await rpc('msos_revoke_swimmer_devices',{p_athlete_id:String(a.id)});setStatus(`${Number(n)||0} swimmer device${Number(n)===1?'':'s'} revoked.`,'ok')}catch(err){setStatus(err?.message||String(err),'error')}finally{revokeBtn.disabled=false}};}
  function installButton(){if((M.access?.role?.()||'owner')!=='owner')return;const a=selected(),head=document.querySelector('#athletesView .cn-owner-actions')||document.querySelector('#athletesView .perf-head .hub-actions')||document.querySelector('#athletesView .perf-head');if(!a||!head||head.querySelector('[data-bn-access]'))return;const b=document.createElement('button');b.dataset.bnAccess='1';b.className='bn-access-btn';b.textContent='Give swimmer access';b.onclick=()=>modal(a);head.append(b);}
  function install(){requestAnimationFrame(installButton);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  X.payloadFor=payloadFor;X.corePayloadFor=corePayloadFor;X.safeSession=safeSession;X.sessionsFor=sessionsFor;X.safePerformance=safePerformance;X.safeTests=safeTests;X.safeMeet=safeMeet;X.sessionActionsFor=sessionActionsFor;X.verifySessionInteractionLayer=verifySessionInteractionLayer;X.acknowledgeSessionAction=acknowledgeSessionAction;X.rpc=rpc;X.installButton=installButton;
})(globalThis);
