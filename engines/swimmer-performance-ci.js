'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence;
  if(!M?.state||!M?.pathway||!M?.performanceEngine||!E)return;

  const BUILD='v4-swimmer-performance-integrity-20260824co';
  const X=M.swimmerPerformanceBM={build:BUILD,uiTakeover:false,EVIDENCE_JOB_TIMEOUT_MS:12000,REFS_SAVE_TIMEOUT_MS:5000,REF_FETCH_PAGE_SIZE:8000};
  function withTimeout(promise,ms,label){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s — check your connection and try again.`)),ms);
      Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});
    });
  }
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const courseOf=r=>text(E.course?.(r)||r?.course||r?.pool_course).toUpperCase();
  const distanceOf=r=>Number(E.distance?.(r)||r?.distance||r?.event_distance);
  const strokeOf=r=>text(E.rowStroke?.(r)||r?.stroke||r?.event_stroke);
  const secondsOf=r=>Number(E.seconds?.(r)||r?.result_seconds||r?.seconds||r?.time_seconds||r?.pb_seconds);
  const dateOf=r=>text(r?.result_date||r?.date||r?.meet_date||r?.event_date||r?.created_at).slice(0,10);
  const currentCourse=()=>text(M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase()||'SCM';
  const today=()=>text(M.currentSession?.()?.identity?.date||new Date().toISOString().slice(0,10)).slice(0,10);
  const eventKey=(course,distance,stroke)=>`${text(course).toUpperCase()}|${Number(distance)||0}|${text(stroke)}`;
  const national=r=>/nzsc|new zealand|nz champs|national|nags/i.test(text(r?.programme||r?.standard_name||r?.name));
  const defaultStandard=r=>{try{return M.pathway.defaultStandard?.(r)!==false}catch{return String(r?.standard_kind||'qualifying').toLowerCase()==='qualifying'}};
  const active=r=>r?.active!==false&&text(r?.version_status||'active').toLowerCase()!=='superseded';

  function ageOn(dob,when){
    if(!dob||!when)return null;
    const b=new Date(`${String(dob).slice(0,10)}T00:00:00Z`),d=new Date(`${String(when).slice(0,10)}T00:00:00Z`);
    if(!Number.isFinite(b.getTime())||!Number.isFinite(d.getTime()))return null;
    let a=d.getUTCFullYear()-b.getUTCFullYear();
    if(d.getUTCMonth()<b.getUTCMonth()||(d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate()))a--;
    return a;
  }
  function ageBounds(r){
    let min=Number(r?.age_min),max=Number(r?.age_max);
    if(!Number.isFinite(min))min=null;if(!Number.isFinite(max))max=null;
    const raw=text(r?.age_group);
    if(min==null&&/^\d+$/.test(raw))min=Number(raw);
    if(max==null&&/^\d+$/.test(raw))max=Number(raw);
    return{min,max};
  }
  function sexKey(v){const s=text(v).toUpperCase();if(/^M(?:ALE)?$/.test(s))return'M';if(/^F(?:EMALE)?$/.test(s))return'F';return s;}
  function strokeKey(v){return text(E.stroke?.(v)||v);}
  function resultRows(ath){
    let rows=[];try{rows=E.pbRows?.(ath,M.state)||[]}catch{}
    return rows.filter(r=>Number.isFinite(secondsOf(r))&&secondsOf(r)>0&&distanceOf(r)>0&&strokeOf(r));
  }
  function bestRows(ath,course){
    const wanted=text(course).toUpperCase(),map=new Map();
    for(const r of resultRows(ath)){
      const c=courseOf(r);if(wanted&&c&&c!==wanted)continue;
      const k=eventKey(c||wanted,distanceOf(r),strokeOf(r)),old=map.get(k);
      if(!old||secondsOf(r)<secondsOf(old))map.set(k,r);
    }
    return [...map.values()];
  }
  function seasonProgress(ath,course,distance,stroke){
    const year=today().slice(0,4),rows=resultRows(ath).filter(r=>(!courseOf(r)||courseOf(r)===course)&&distanceOf(r)===Number(distance)&&strokeKey(strokeOf(r))===strokeKey(stroke)&&dateOf(r).startsWith(year)).sort((a,b)=>dateOf(a).localeCompare(dateOf(b))||secondsOf(a)-secondsOf(b));
    if(!rows.length)return null;
    const first=rows[0],best=rows.reduce((a,b)=>secondsOf(b)<secondsOf(a)?b:a,rows[0]),firstSeconds=secondsOf(first),bestSeconds=secondsOf(best);
    return{year,firstSeconds,bestSeconds,firstDate:dateOf(first),bestDate:dateOf(best),improvement:Math.max(0,firstSeconds-bestSeconds),swims:rows.length};
  }
  function standardRows(){try{return M.refs?.get?.('pathway_standards')||[]}catch{return[]}}
  function meetRows(){try{return M.refs?.get?.('pathway_meets')||[]}catch{return[]}}
  function targetDate(r){
    const direct=text(r?.age_date||r?.meet_date).slice(0,10);if(direct)return direct;
    const p=norm(r?.programme),m=meetRows().find(x=>norm(x?.programme)===p||norm(x?.meet_name)===p);
    return text(m?.meet_date).slice(0,10);
  }
  function meetFor(r){
    const p=norm(r?.programme),d=text(r?.meet_date).slice(0,10);
    return meetRows().find(x=>(norm(x?.programme)===p||norm(x?.meet_name)===p)&&(!d||!x?.meet_date||String(x.meet_date).slice(0,10)===d))||null;
  }
  function standardApplies(r,ath,e){
    if(!active(r)||!defaultStandard(r))return false;
    const rCourse=courseOf(r);
    if(rCourse&&rCourse!=='BOTH'&&rCourse!==e.course)return false;
    if(distanceOf(r)!==e.distance||strokeKey(strokeOf(r))!==strokeKey(e.stroke))return false;
    const req=sexKey(r?.sex),actual=sexKey(ath?.sex);if(req&&req!=='OPEN'&&req!==actual)return false;
    // A row carrying a para classification (S13/SB13/SM13/...) is a real national standard for a swimmer
    // in that exact class -- not something to blanket-reject. Only exclude it when it does NOT match this
    // athlete's own classification for this event's stroke (which also correctly excludes every para
    // standard for a non-classified/able-bodied athlete, since their class is then empty).
    const rowClass=text(r?.para_class||r?.classification);
    if(rowClass){
      const athClass=text(M.pathway?.paraClass?.(ath,e.stroke)).toUpperCase().replace(/\s/g,'');
      if(!athClass||athClass!==rowClass.toUpperCase().replace(/\s/g,''))return false;
    }
    const {min,max}=ageBounds(r);if(min==null&&max==null)return true;
    const d=targetDate(r);if(!d)return false;
    const age=ageOn(ath?.date_of_birth,d);if(age==null)return false;
    return !(min!=null&&age<min)&&!(max!=null&&age>max);
  }
  function targetView(r,ath,pbSeconds){
    if(!r)return null;const sec=secondsOf(r),d=targetDate(r),age=ageOn(ath?.date_of_birth,d),gap=Math.max(0,Number(pbSeconds)-sec),meet=meetFor(r),meetCourse=text(meet?.course).toUpperCase(),shownCourse=courseOf(r),converted=!!(meetCourse&&shownCourse&&meetCourse!==shownCourse);
    return{label:text(r?.programme||r?.standard_name||r?.name||'Target'),seconds:sec,gapSeconds:gap,gapPercentage:sec>0?gap/sec*100:0,achieved:Number(pbSeconds)<=sec,kind:text(r?.standard_kind||'qualifying'),meetDate:d,ageAtTarget:age,course:shownCourse,officialCourse:meetCourse||shownCourse,converted,provenance:converted?`${shownCourse} equivalent of ${meetCourse} standard`:text(r?.source_status||r?.source_version||'verified standard'),sourceUrl:text(r?.source_url)};
  }
  function targetsFor(ath,e){
    const now=today(),rows=standardRows().filter(r=>national(r)&&standardApplies(r,ath,e)&&Number.isFinite(secondsOf(r))&&secondsOf(r)>0),future=rows.filter(r=>{const d=targetDate(r);return d&&d>=now}).sort((a,b)=>targetDate(a).localeCompare(targetDate(b))||Number(a?.progression_order||999)-Number(b?.progression_order||999)||secondsOf(b)-secondsOf(a));
    const views=future.map(r=>targetView(r,ath,e.pbSeconds));
    return{next:views[0]||null,milestones:views};
  }
  function buildModel(ath,course=currentCourse()){
    const c=text(course).toUpperCase()||'SCM',best=bestRows(ath,c),ranked=M.performanceEngine.rankedEvents?.(ath,M.state,c)||[],rankMap=new Map(ranked.map((r,i)=>[eventKey(r.course||c,r.distance,r.stroke),{...r,rank:i+1}]));
    const events=best.map(row=>{
      const ec=courseOf(row)||c,d=distanceOf(row),st=strokeOf(row),k=eventKey(ec,d,st),rank=rankMap.get(k)||null,e={key:k,course:ec,distance:d,stroke:st,pbSeconds:secondsOf(row),pbRow:row,points:Number.isFinite(Number(rank?.points))?Number(rank.points):Number.isFinite(Number(E.points?.(row)))?Number(E.points(row)):null,pointSystem:rank?.pointSystem||M.performanceEngine.scoreSystem?.(ath)||'WA',rank:rank?.rank||null,season:seasonProgress(ath,ec,d,st)};
      const t=targetsFor(ath,e);e.next=t.next;e.milestones=t.milestones;return e;
    });
    events.sort((a,b)=>(Number.isFinite(b.points)?b.points:-1)-(Number.isFinite(a.points)?a.points:-1)||a.pbSeconds-b.pbSeconds||a.distance-b.distance||a.stroke.localeCompare(b.stroke));
    events.forEach((e,i)=>e.rank=i+1);
    const opportunities=events.filter(e=>e.next&&!e.next.achieved).slice().sort((a,b)=>a.next.gapPercentage-b.next.gapPercentage||(Number(b.points)||0)-(Number(a.points)||0));
    const achieved=events.filter(e=>e.next?.achieved);
    const nextDates=events.map(e=>e.next?.meetDate).filter(Boolean).sort(),targetMeet=nextDates[0]||'';
    return{athlete:ath,course:c,events,closest:opportunities.slice(0,4),opportunities,achieved,targetMeet,allEvents:true};
  }

  async function cloudPages(path,pageSize){if(M.cloudSessionEngine?.fetchPages)return pageSize?M.cloudSessionEngine.fetchPages(path,pageSize):M.cloudSessionEngine.fetchPages(path);if(M.cloud?.ready?.()&&M.cloud?.fetchPages)return pageSize?M.cloud.fetchPages(path,pageSize):M.cloud.fetchPages(path);throw new Error('Connected swimmer evidence is unavailable.');}
  async function mergeRows(refKey,stateKey,rows){if(!Array.isArray(rows)||!rows.length)return 0;M.refs?.merge?.(refKey,rows);M.state[stateKey]=E.merge(M.state[stateKey]||[],rows);return rows.length;}
  // 18 Sept 2026 (Andy, live: Matthew Robertson's swimmer-access QR held on "No upcoming verified SCM
  // national benchmark is linked" for a fully-qualifying, real 16yo male swimmer): pathway_standards and
  // pathway_meets -- the two reference tables readinessFor()'s targetsFor()/standardApplies() gate depends
  // on -- were only ever (re)fetched from Supabase by this job list when the LOCAL cache was completely
  // EMPTY (`if(!standardRows().length)`). Once any rows were cached even once, on any device, they were
  // never refreshed again -- not on a schedule, not on demand -- however long ago that was or however much
  // the live table changed since (e.g. a new meet's qualifying standards added centrally). Confirmed live
  // against production Supabase: a real, current, exactly-matching NZSC standard (age 16, male, SCM, every
  // one of Matthew's events, meet 2026-09-27) genuinely exists server-side -- his device's stale local copy
  // simply never picked it up. Fixed: these two jobs now also re-run whenever the local copy was last
  // confirmed synced more than X.REF_STALE_MS ago (24h in production, exported so a test can shrink it),
  // not only when it is empty -- bounded staleness instead of "cached forever". A successful fetch of
  // either records its own sync timestamp (msos_ref_last_synced__<key> in localStorage) independently, so a
  // failure on one never wrongly marks the other fresh.
  X.REF_STALE_MS=24*60*60*1000;
  function refSyncKey(k){return`msos_ref_last_synced__${k}`;}
  function refLastSyncedAt(k){try{const v=Number(localStorage.getItem(refSyncKey(k)));return Number.isFinite(v)&&v>0?v:0}catch{return 0}}
  function markRefSynced(k){try{localStorage.setItem(refSyncKey(k),String(Date.now()))}catch{}}
  function refStale(k){return(Date.now()-refLastSyncedAt(k))>X.REF_STALE_MS;}
  async function completeEvidence(ath,onJob){
    if(!ath)return{ok:false,rows:0,error:'No swimmer selected'};
    if(!(M.engineBridge?.canAttemptCloudRead?.()||M.cloud?.ready?.()))return{ok:false,rows:0,error:'Connected swimmer evidence is unavailable'};
    const id=encodeURIComponent(String(ath.id||'')),org=encodeURIComponent(String(ath.organisation_id||M.cloud?.org?.()||M.state?.settings?.organisationId||''));let added=0,errors=[];
    const jobs=[];
    if(id)jobs.push(['results_pb_board','resultsPbBoard',`/rest/v1/results_pb_board?select=*&athlete_id=eq.${id}`],['coach_results','coachResults',`/rest/v1/coach_results?select=*&athlete_id=eq.${id}`],['results_event_history','resultsEventHistory',`/rest/v1/results_event_history?select=*&athlete_id=eq.${id}`],['training_test_results','trainingTestResults',`/rest/v1/training_test_results?select=*&athlete_id=eq.${id}`]);
    if(org)jobs.push(['training_test_types','trainingTestTypes',`/rest/v1/training_test_types?select=*&organisation_id=eq.${org}`]);
    // Andy, 18 Sept 2026: "Yea that needs to be fixed" -- confirming the QR-generate flow's overall ~3.5
    // minute duration (even when it correctly resolves) still needs work. Checked directly against
    // production Supabase rather than guessing: every other job here is scoped to one athlete or one
    // organisation and returns well under 100 rows (single network round trip). pathway_standards is the
    // one unscoped `select=*` fetch of the WHOLE table -- 4406 rows live, 18 Sept -- and C.fetchPages()
    // paginates at 1000 rows/page, so this single job alone was up to 5 SEQUENTIAL round trips (each with
    // its own real network latency + Postgres/PostgREST overhead), on top of the up-to-6 other sequential
    // jobs in this same loop. That is a highly plausible dominant contributor to the overall slowness, and
    // fetching it in fewer, larger pages changes nothing about WHICH rows are merged in (same data, same
    // 8000-row maxRows ceiling, comfortably above the live 4406) -- purely a round-trip-count reduction.
    // REF_FETCH_PAGE_SIZE is exported so a test can shrink it over the identical pagination code path.
    if(!(standardRows().length)||refStale('pathway_standards'))jobs.push(['pathway_standards','pathwayStandards','/rest/v1/pathway_standards?select=*',X.REF_FETCH_PAGE_SIZE]);
    if(!(meetRows().length)||refStale('pathway_meets'))jobs.push(['pathway_meets','pathwayMeets','/rest/v1/pathway_meets?select=*',X.REF_FETCH_PAGE_SIZE]);
    // A stalled request can still take up to EVIDENCE_JOB_TIMEOUT_MS to give up, and there are up to
    // seven of these run one after another -- with no visible feedback that was indistinguishable from a
    // true hang. Report which check is running (and how many are left) so a slow-but-working pass never
    // looks identical to a frozen one.
    for(const [i,[rk,sk,path,pageSize]] of jobs.entries()){
      try{onJob?.(rk,i+1,jobs.length);}catch{}
      // 19 Sept 2026 (fourth+ same-day freeze, now confirmed reproducing on EVERY athlete, not just Matthew
      // Robertson, and surviving a full app reload -- ruling out both the concurrency bug fixed earlier today
      // and anything athlete-specific): every occurrence's lastCheckpoint still stops dead at this exact job
      // (training_test_types, always last) with nothing beyond it ever written, even though live Supabase
      // logs prove the network call itself succeeds every time. Andy separately found his browser is holding
      // 223MB of site data for an app whose real per-athlete evidence should be a few MB at most -- far more
      // consistent with something in LOCAL state/cache having silently grown unbounded than with a genuine
      // infinite loop over the tiny (10-row) training_test_types payload itself. These two silent, index-free
      // checkpoints (no `i`/`total`, so they render as their own "Building …" line rather than disturbing the
      // existing indexed "Checking swimmer evidence… (i/total)" text) capture the in-memory array length for
      // THIS job's own state slot immediately before and after the merge that already runs here -- if a
      // future freeze's breadcrumb shows the "before" figure alone, the hang is inside cloudPages/withTimeout
      // itself despite Supabase showing success; if it shows "before" but never "after", the hang is inside
      // mergeRows (R.merge/E.merge) specifically, and the "before" count tells us whether that array was
      // already the size of the problem before this run even started.
      try{
        const beforeLen=Array.isArray(M.state[sk])?M.state[sk].length:0;
        const fetched=await withTimeout(cloudPages(path,pageSize),X.EVIDENCE_JOB_TIMEOUT_MS,rk);
        try{onJob?.(`${rk}_fetched_rows${Array.isArray(fetched)?fetched.length:'x'}_existing${beforeLen}`);}catch{}
        added+=await mergeRows(rk,sk,fetched);
        try{onJob?.(`${rk}_merged_now${Array.isArray(M.state[sk])?M.state[sk].length:'x'}`);}catch{}
        if(rk==='pathway_standards'||rk==='pathway_meets')markRefSynced(rk);
      }catch(err){errors.push(`${rk}: ${err?.message||err}`)}
    }
    // Real coaching failure this guards against: Andy reported the QR-generate modal frozen on the last
    // "Checking swimmer evidence..." message for several literal minutes with no further status change and
    // no error, even though the per-job evidence timeout above had already correctly reached its final
    // job. M.refs.save() (an IndexedDB write) runs immediately after the loop with no timeout of its own --
    // exactly the kind of silent, unbounded step that would freeze the status text forever while looking
    // identical to the evidence check itself still "in progress". Bound it so a stuck local write can never
    // hang the whole flow again.
    // 19 Sept 2026: this exact symptom recurred for Matthew Robertson (screenshot: "Checking swimmer
    // evidence... (5/5 · training_test_types) (0s)", frozen). Checked directly against live Supabase edge
    // logs for that exact minute: all 5 evidence jobs (including training_test_types) returned 200 in under
    // 2.5 seconds total, and no bootstrap_owner/publish/create-invite RPC call ever fired afterward -- so the
    // freeze is real but happens ENTIRELY client-side, somewhere between the job loop finishing and
    // note('Establishing secure owner access...') further down in swimmer-invite-bn.js, none of which
    // previously had its own breadcrumb. A synchronous compute-cost benchmark of the standards-matching this
    // step and buildModel()/pathwaysForAthlete() do (targetsFor/rowsByProgramme against the ~4400-row
    // pathway_standards table, x2-3 for Matthew's ~35 events) came back well under a second even generously
    // derated for a slow device, so pure compute time is an unlikely sole explanation -- most likely the
    // phone's screen locked/backgrounded and Android suspended the page's JS mid-flow (matching the
    // already-tracked "phone-in-pocket/screen-off" freeze pattern). Not fixed here -- these two extra
    // checkpoints (and the payloadFor sub-step breadcrumbs in swimmer-invite-bn.js) exist so the NEXT
    // occurrence's breadcrumb pinpoints the exact stuck step instead of leaving the whole post-network tail
    // as one unaccounted-for gap, the same diagnostic-first approach that cracked the pathway_standards
    // staleness bug on the 18th.
    try{onJob?.('refs_save')}catch{}
    try{await withTimeout(M.refs?.save?.()||Promise.resolve(),X.REFS_SAVE_TIMEOUT_MS,'Saving evidence to local cache')}catch{}
    try{onJob?.('t400_hydrate')}catch{}
    try{M.correct?.hydrateT400Evidence?.(M.state,M.store?.legacy?.()||null)}catch{}
    try{onJob?.('cache_invalidate')}catch{}
    M.performanceEngine?.invalidate?.(M.state);M.engineBridge?.pathwayPbCache?.clear?.();g.MSOSEvidenceIndex?.invalidate?.(M.state);try{dispatchEvent(new CustomEvent('msos:evidence-ready',{detail:{reason:'athlete-completion',athleteId:ath.id,rows:added}}))}catch{}
    X.lastCompletion={athleteId:ath.id,ok:errors.length===0,rows:added,errors,at:new Date().toISOString()};return{ok:errors.length===0,rows:added,errors};
  }
  // Real coaching failure this guards against: Andy repeatedly reported the QR-generate modal "stopping at
  // 5/5 0s" -- frozen on the LAST evidence-job status text with the elapsed-seconds ticker itself not moving,
  // even after the per-job/refs-save timeouts above were already in place. Every prior status update in this
  // flow comes from onJob(), which only fires from inside the network-jobs loop above -- buildModel() below
  // runs synchronously immediately afterwards, with no status update of its own, so any time it takes (it
  // ranks every event against every national standard/meet for this athlete) was invisible and silently
  // misattributed to whichever job happened to run last. Firing one more onJob() call here, before buildModel
  // starts, gives it a status line of its own so a slow or stuck pass here is no longer indistinguishable from
  // the evidence-fetch step that already finished.
  async function prepareAthlete(ath,{course=currentCourse(),onJob}={}){const completion=await completeEvidence(ath,onJob);try{onJob?.('pathway_model')}catch{}return{completion,model:buildModel(ath,course)};}
  function readinessFor(ath,{course=currentCourse()}={}){
    const model=buildModel(ath,course),issues=[];
    if(!ath?.date_of_birth)issues.push('Date of birth is required for age-specific pathway standards.');
    if(!model.events.length)issues.push(`No verified ${model.course} race events are loaded.`);
    if(!model.events.some(e=>e.next))issues.push(`No upcoming verified ${model.course} national benchmark is linked.`);
    return{ok:issues.length===0,issues,model};
  }

  // Evidence completion is explicit only. Opening a swimmer must never trigger network,
  // cloud merge, cache invalidation or a second renderer behind the coach's touch.
  function installBackgroundCompletion(){X.backgroundCompletionDisabled=true;}

  X.modelFor=buildModel;X.seasonProgress=seasonProgress;X.completeEvidence=completeEvidence;X.prepareAthlete=prepareAthlete;X.readinessFor=readinessFor;X.ageOn=ageOn;X.targetDate=targetDate;X.checks=()=>({build:BUILD,allEvents:true,performanceOrder:true,futureMeetAge:true,pastMeetNotNext:true,uiTakeover:false,backgroundCompletionDisabled:true});
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBackgroundCompletion,{once:true});else installBackgroundCompletion();}
})(globalThis);
