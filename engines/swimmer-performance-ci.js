'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence;
  if(!M?.state||!M?.pathway||!M?.performanceEngine||!E)return;

  const BUILD='v4-swimmer-performance-integrity-20260824ci';
  const X=M.swimmerPerformanceBM={build:BUILD,uiTakeover:false};
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
    if(courseOf(r)!==e.course||distanceOf(r)!==e.distance||strokeKey(strokeOf(r))!==strokeKey(e.stroke))return false;
    const req=sexKey(r?.sex),actual=sexKey(ath?.sex);if(req&&req!=='OPEN'&&req!==actual)return false;
    if(text(r?.para_class||r?.classification))return false;
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

  async function cloudPages(path){if(M.cloudSessionEngine?.fetchPages)return M.cloudSessionEngine.fetchPages(path);if(M.cloud?.ready?.()&&M.cloud?.fetchPages)return M.cloud.fetchPages(path);throw new Error('Connected swimmer evidence is unavailable.');}
  async function mergeRows(refKey,stateKey,rows){if(!Array.isArray(rows)||!rows.length)return 0;M.refs?.merge?.(refKey,rows);M.state[stateKey]=E.merge(M.state[stateKey]||[],rows);return rows.length;}
  async function completeEvidence(ath){
    if(!ath)return{ok:false,rows:0,error:'No swimmer selected'};
    if(!(M.engineBridge?.canAttemptCloudRead?.()||M.cloud?.ready?.()))return{ok:false,rows:0,error:'Connected swimmer evidence is unavailable'};
    const id=encodeURIComponent(String(ath.id||'')),org=encodeURIComponent(String(ath.organisation_id||M.cloud?.org?.()||M.state?.settings?.organisationId||''));let added=0,errors=[];
    const jobs=[];
    if(id)jobs.push(['results_pb_board','resultsPbBoard',`/rest/v1/results_pb_board?select=*&athlete_id=eq.${id}`],['coach_results','coachResults',`/rest/v1/coach_results?select=*&athlete_id=eq.${id}`],['results_event_history','resultsEventHistory',`/rest/v1/results_event_history?select=*&athlete_id=eq.${id}`],['training_test_results','trainingTestResults',`/rest/v1/training_test_results?select=*&athlete_id=eq.${id}`]);
    if(org)jobs.push(['training_test_types','trainingTestTypes',`/rest/v1/training_test_types?select=*&organisation_id=eq.${org}`]);
    if(!(standardRows().length))jobs.push(['pathway_standards','pathwayStandards','/rest/v1/pathway_standards?select=*']);
    if(!(meetRows().length))jobs.push(['pathway_meets','pathwayMeets','/rest/v1/pathway_meets?select=*']);
    for(const [rk,sk,path] of jobs){try{added+=await mergeRows(rk,sk,await cloudPages(path));}catch(err){errors.push(`${rk}: ${err?.message||err}`)}}
    try{await M.refs?.save?.()}catch{}
    try{M.correct?.hydrateT400Evidence?.(M.state,M.store?.legacy?.()||null)}catch{}
    M.performanceEngine?.invalidate?.(M.state);M.engineBridge?.pathwayPbCache?.clear?.();g.MSOSEvidenceIndex?.invalidate?.(M.state);try{dispatchEvent(new CustomEvent('msos:evidence-ready',{detail:{reason:'athlete-completion',athleteId:ath.id,rows:added}}))}catch{}
    X.lastCompletion={athleteId:ath.id,ok:errors.length===0,rows:added,errors,at:new Date().toISOString()};return{ok:errors.length===0,rows:added,errors};
  }
  async function prepareAthlete(ath,{course=currentCourse()}={}){const completion=await completeEvidence(ath);return{completion,model:buildModel(ath,course)};}
  function readinessFor(ath,{course=currentCourse()}={}){
    const model=buildModel(ath,course),issues=[];
    if(!ath?.date_of_birth)issues.push('Date of birth is required for age-specific pathway standards.');
    if(!model.events.length)issues.push(`No verified ${model.course} race events are loaded.`);
    if(!model.events.some(e=>e.next))issues.push(`No upcoming verified ${model.course} national benchmark is linked.`);
    return{ok:issues.length===0,issues,model};
  }

  // Preserve the proven morning coach UI. This module owns data/model completion only.
  // It deliberately does not replace Performance or Pathway DOM.
  function installBackgroundCompletion(){
    const base=M.ui?.renderAthletes?.bind(M.ui);if(!base||X._wrapped)return;X._wrapped=true;
    const queued=new Set();
    M.ui.renderAthletes=(...args)=>{const out=base(...args);const id=M.state?.settings?.selectedAthleteId,ath=(M.state?.athletes||[]).find(a=>a.id===id),c=currentCourse(),k=`${id}|${c}`;if(ath&&!queued.has(k)){queued.add(k);setTimeout(()=>completeEvidence(ath).then(()=>{if((M.state?.settings?.view||'')==='athletes'&&M.state?.settings?.selectedAthleteId===id)base();}).catch(()=>{}),0);}return out;};
    if(M.performanceUI)M.performanceUI.render=M.ui.renderAthletes;
  }

  X.modelFor=buildModel;X.seasonProgress=seasonProgress;X.completeEvidence=completeEvidence;X.prepareAthlete=prepareAthlete;X.readinessFor=readinessFor;X.ageOn=ageOn;X.targetDate=targetDate;X.checks=()=>({build:BUILD,allEvents:true,performanceOrder:true,futureMeetAge:true,pastMeetNotNext:true,uiTakeover:false});
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBackgroundCompletion,{once:true});else installBackgroundCompletion();}
})(globalThis);
