'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M?.ui||!M?.actions) return;
  const U=M.util||{};
  const UI=M.ui;
  const L=M.coachLoopUI={build:'v4-coach-loop-20260821ai'};
  const BUILD='v4-coach-loop-20260821ai';
  M.BUILD=BUILD;
  M.CORE='20260821-coach-loop-ai';
  M.RELEASE_ATTESTATION=Object.freeze({
    ...(M.RELEASE_ATTESTATION||{}),
    build:BUILD,
    softwareReady:false,
    generatedAt:new Date().toISOString(),
    note:'Coach-loop field build. Existing v4 foundation preserved; real-phone acceptance is required before any production cutover claim.'
  });

  const text=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U.escape?U.escape(String(v??'')):String(v??'');
  const clock=v=>U.clock?U.clock(Number(v)):String(v??'—');
  const now=()=>new Date().toISOString();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim();
  const arr=v=>Array.isArray(v)?v:(v==null||v===''?[]:[v]);
  const unique=(rows,keyFn)=>{const out=[],seen=new Set();for(const row of rows||[]){if(!row||typeof row!=='object')continue;const k=keyFn(row);if(seen.has(k))continue;seen.add(k);out.push(row);}return out;};
  const currentSession=()=>M.currentSession?.()||null;
  const saveUi=()=>{try{M.storageEngine?.saveUi?.(M.state)}catch{}try{M.store?.save?.(M.state)}catch{}};
  const go=(view,opts={})=>M.navigationEngine?.go?M.navigationEngine.go(view,{restore:false,...opts}):M.nav?.show?.(view,{restoreScroll:false,...opts});

  // ---------------------------------------------------------------------------
  // Planning/reference bridge. The prior bridge preferred an empty legacy array
  // over populated v4 state. Merge every known source, then score by identity.
  // ---------------------------------------------------------------------------
  function legacy(){try{return M.store?.legacy?.()||{}}catch{return{}}}
  function refRows(key){try{return M.refs?.get?.(key)||[]}catch{return[]}}
  function weekRows(old=legacy()){return unique([
    ...(M.state?.weeklyPlans||[]),...(M.state?.weekly_plans||[]),
    ...(old.weeklyPlans||[]),...(old.weekly_plans||[]),...refRows('weekly_plans')
  ],x=>text(x.id)||JSON.stringify([x.week_start,x.weekStart,x.squad,x.programme,x.objective,x.focus]));}
  function seasonRows(old=legacy()){return unique([
    ...(M.state?.seasonPlans||[]),...(M.state?.season_plans||[]),
    ...(old.seasonPlans||[]),...(old.season_plans||[]),...refRows('season_plans')
  ],x=>text(x.id)||JSON.stringify([x.start_date,x.end_date,x.name,x.squad,x.programme]));}
  const KNOWN_SQUADS=['national','development','fitness','intermediate','junior','novice para','novice','learn to swim'];
  function squadKeys(value){const raw=norm(value);if(!raw)return[];const out=new Set([raw]);for(const k of KNOWN_SQUADS)if(raw===k||raw.includes(k))out.add(k);for(const bit of String(value??'').split(/[+,&/|]+/))if(norm(bit))out.add(norm(bit));return[...out];}
  function sessionSquads(s){return[...new Set((s?.identity?.squads||[]).flatMap(squadKeys))]}
  function planSquads(p){return[...new Set(arr(p?.squads).concat(arr(p?.squad),arr(p?.squad_name),arr(p?.programme),arr(p?.program),arr(p?.team),arr(p?.group)).flatMap(squadKeys))]}
  function dateInWeek(date,start){if(!date||!start)return false;const d=Date.parse(`${date}T12:00:00Z`),s=Date.parse(`${String(start).slice(0,10)}T12:00:00Z`);return Number.isFinite(d)&&Number.isFinite(s)&&d>=s&&d<s+7*86400000;}
  function inSeason(date,p){if(!date)return false;const start=text(p?.start_date||p?.startDate),end=text(p?.end_date||p?.endDate);return(!start||start<=date)&&(!end||end>=date);}
  function squadScore(plan,session){const ps=planSquads(plan),ss=sessionSquads(session);if(!ps.length)return 2;if(!ss.length)return 0;return ps.some(x=>ss.includes(x))?28:-220;}
  function weekScore(w,s,directId){let score=0;if(directId&&text(w.id)===text(directId))score+=120;if(dateInWeek(s?.identity?.date,w.week_start||w.weekStart||w.start_date))score+=45;score+=squadScore(w,s);const programme=norm(w.programme||w.program||w.squad||'');if(programme&&sessionSquads(s).includes(programme))score+=12;return score;}
  function seasonScore(p,s,directId){let score=0;if(directId&&text(p.id)===text(directId))score+=120;if(inSeason(s?.identity?.date,p))score+=35;score+=squadScore(p,s);return score;}
  function nestedWeekSession(week,session){const rows=[...(week?.sessions||[]),...(week?.session_plans||[]),...(week?.sessionPlans||[]),...(week?.days||[])];if(!rows.length)return null;const date=session?.identity?.date||'',part=norm(session?.identity?.dayPart||session?.identity?.slot||'');const day=new Date(`${date}T12:00:00`).toLocaleDateString('en-NZ',{weekday:'long'}).toLowerCase();let best=null,bestScore=-1;for(const r of rows){let score=0;const rd=text(r.date||r.session_date);if(rd&&rd===date)score+=30;const label=norm([r.day,r.weekday,r.day_name,r.slot,r.dayPart,r.am_pm,r.name,r.title].filter(Boolean).join(' '));if(day&&label.includes(day))score+=12;if(part&&label.includes(part))score+=10;if(score>bestScore){best=r;bestScore=score}}return bestScore>0?best:null;}
  function planContext(session=currentSession()){
    if(!session)return{season:null,week:null,weekSession:null,seasonName:'',seasonGoal:'',weeklyFocus:'',carry:'',todayFocus:'',technicalFocus:'',psychologicalFocus:'',linkStatus:'none'};
    const old=legacy(),oldSession=(old.sessions||[]).find(x=>x.id===session?.metadata?.legacySessionId||x.id===session.id)||{};
    const directWeek=session?.metadata?.weeklyPlanId||session?.metadata?.weekly_plan_id||oldSession.weekly_plan_id||oldSession.week_plan_id||'';
    const weeks=weekRows(old).map(w=>({row:w,score:weekScore(w,session,directWeek)})).sort((a,b)=>b.score-a.score);
    const week=weeks[0]?.score>0?weeks[0].row:null,weekSession=nestedWeekSession(week,session);
    const directSeason=session?.metadata?.seasonPlanId||session?.metadata?.season_plan_id||oldSession.season_plan_id||week?.season_plan_id||week?.seasonPlanId||'';
    const seasons=seasonRows(old).map(p=>({row:p,score:seasonScore(p,session,directSeason)})).sort((a,b)=>b.score-a.score);
    const season=seasons[0]?.score>0?seasons[0].row:null;
    const weeklyFocus=text(weekSession?.objective||weekSession?.focus||week?.objective||week?.focus||week?.phase||week?.physiological_focus||week?.physiology||session?.metadata?.weekObjective||session?.metadata?.weekPhase||'');
    const technicalFocus=text(weekSession?.technical_focus||week?.technical_focus||session?.metadata?.technicalFocus||oldSession.technical_focus||'');
    const todayFocus=text(weekSession?.primary_system||weekSession?.purpose||weekSession?.session_focus||session?.metadata?.primarySystem||session?.metadata?.planCue||oldSession.primary_system||'');
    const carry=text(week?.carry_forward||week?.carryForward||weekSession?.carry_forward||weekSession?.carryForward||'');
    const psychologicalFocus=text(weekSession?.psychological_focus||weekSession?.mental_focus||week?.psychological_focus||week?.mental_focus||season?.psychological_focus||season?.mental_focus||'');
    return{
      season,week,weekSession,
      seasonName:text(season?.name||season?.phase||session?.metadata?.season||oldSession.season||''),
      seasonGoal:text(season?.overarching_goal||season?.goal||season?.physiological_focus||''),
      weeklyFocus,carry,todayFocus,technicalFocus,psychologicalFocus,
      linkStatus:season&&week?'season+week':week?'week':season?'season':'none'
    };
  }
  L.planContext=planContext;
  if(M.correct)M.correct.planContext=planContext;

  // ---------------------------------------------------------------------------
  // Session coaching intelligence: current canonical prescription, not a second
  // session tree. Purpose stays coach-authored; raw metres are supporting truth.
  // ---------------------------------------------------------------------------
  function itemDistance(item){if(!item)return 0;if(item.kind==='set')return Math.max(1,Number(item.reps)||1)*(Number(item.distance)||0);if(item.kind==='group')return Math.max(1,Number(item.rounds)||1)*(item.items||[]).reduce((n,x)=>n+itemDistance(x),0);return 0;}
  function walk(items,mult,fn){for(const item of items||[]){if(item?.kind==='group')walk(item.items||[],mult*Math.max(1,Number(item.rounds)||1),fn);else if(item?.kind==='set')fn(item,mult);}}
  function strokeFor(item){let s=text(M.analysis?.strokeFor?.(item)||item?.stroke||'');if(!s||/^choice$/i.test(s)){const raw=text(item?.raw||item?.text);if(/\bfly|butterfly\b/i.test(raw))s='Butterfly';else if(/\bbreast|breaststroke\b/i.test(raw))s='Breaststroke';else if(/\bback|backstroke\b/i.test(raw))s='Backstroke';else if(/\bIM|medley\b/i.test(raw))s='IM';else if(/\bfree|freestyle\b/i.test(raw))s='Freestyle';else s='Choice / mixed';}return s;}
  function zoneFor(item){return text(M.analysis?.zoneFor?.(item)||item?.zone||item?.system||item?.training_system||'Unclassified');}
  function sessionMix(session){const zones={},strokes={},movement={Swim:0,Kick:0,Pull:0,Underwater:0,Skills:0};let total=0;for(const block of session?.blocks||[])walk(block.items||[],1,(item,mult)=>{const d=itemDistance(item)*mult;if(!d)return;total+=d;const z=zoneFor(item),s=strokeFor(item),raw=text([item.raw,item.text,...(item.cues||[])].filter(Boolean).join(' '));zones[z]=(zones[z]||0)+d;strokes[s]=(strokes[s]||0)+d;if(/\bunderwater|uw\b/i.test(raw))movement.Underwater+=d;else if(/\bkick\b/i.test(raw))movement.Kick+=d;else if(/\bpull\b/i.test(raw))movement.Pull+=d;else if(/\bscull|drill|skill|stroke count|dive|start|turn\b/i.test(raw))movement.Skills+=d;else movement.Swim+=d;});return{total,zones,strokes,movement};}
  function topRows(map,total,limit=6){return Object.entries(map||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([label,metres])=>({label,metres,pct:total?metres/total*100:0}));}
  function intentRows(ctx,session){const source=text([
    ctx.psychologicalFocus,ctx.seasonGoal,ctx.weeklyFocus,ctx.todayFocus,ctx.technicalFocus,
    session?.metadata?.psychologicalFocus,session?.metadata?.mentalFocus,session?.metadata?.planCue,
    ...(session?.blocks||[]).flatMap(b=>[b.title,b.purpose,...(b.cues||[])])
  ].filter(Boolean).join(' · '));
    const rules=[
      ['Confidence / self-belief',/confidence|self[ -]?belief|believe|commit/i],
      ['Resilience / tolerate pressure',/resilien|tolerat|lactate|hold under pressure|finish under pressure/i],
      ['Focus / execution',/focus|execute|execution|precision|discipline|process/i],
      ['Ownership / decision-making',/ownership|choose|choice|decision|self[- ]?manage/i],
      ['Race confidence / competitiveness',/race|compete|competitive|attack|pressure/i],
      ['Calm / control',/calm|control|relax|composure|breath control/i]
    ];
    return rules.filter(([,re])=>re.test(source)).map(([label])=>label);
  }
  function upcomingMeet(ctx,session){const today=session?.identity?.date||new Date().toISOString().slice(0,10),rows=[];for(const x of M.state?.meets||[])rows.push({id:x.id,date:text(x.date),title:text(x.title||x.name||'Meet'),venue:text(x.venue),course:text(x.course),raw:x});for(const raw of arr(ctx?.season?.meets||ctx?.season?.season_meets)){if(typeof raw==='object')rows.push({id:raw.id,date:text(raw.date),title:text(raw.title||raw.name||'Meet'),venue:text(raw.venue),course:text(raw.course),raw});else for(const line of String(raw||'').split(/\n+/)){const p=line.split('|').map(text);if(p[0])rows.push({date:p[0],title:p[1]||'Meet',course:p[2]||'',venue:p[4]||'',raw:{}})}}return rows.filter(x=>x.date&&x.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;}
  function recentCarry(session){return Object.values(M.state?.canonicalSessions||{}).filter(x=>x.id!==session?.id&&x.finish&&(x.identity?.squads||[]).some(s=>(session?.identity?.squads||[]).includes(s))&&(x.identity?.date||'')<=(session?.identity?.date||'')).sort((a,b)=>`${b.identity?.date||''}${b.identity?.dayPart||''}`.localeCompare(`${a.identity?.date||''}${a.identity?.dayPart||''}`)).map(x=>text(x.finish?.carryForward||x.finish?.review?.carryForward)).find(Boolean)||'';}
  function metricRows(rows){return rows.map(x=>`<div class="loop-metric"><span>${esc(x.label)}</span><b>${Math.round(x.metres).toLocaleString()}m</b><small>${x.pct.toFixed(0)}%</small></div>`).join('');}
  // Andy (16 Sept 2026): "I hit coach hub and nothing happens, I click it again it freezes. Stays there
  // till I back out." Coach Hub's render walks nearly all of M.state synchronously and with no caching --
  // weekRows/seasonRows scan every weekly/season plan, recentCarry scans every canonicalSession looking
  // for a match, sessionMix walks every block/item, plus captures/reflections/meetRaces lookups -- all on
  // every single visit. As months of history accumulate (the same "state has grown large, cloud sync off"
  // pattern behind the QR-freeze/background-save investigation), this can genuinely take long enough that
  // nothing visibly happens on the first tap. The nav click handler (engines/navigation.js's V.go) has no
  // guard against re-navigating to a view that's already active, so a second, impatient tap on "Coach Hub"
  // queues a full SECOND run of this same expensive computation right behind the first (JS is
  // single-threaded, so this isn't concurrent -- it's back-to-back), roughly doubling the wait and
  // crossing into what reads as a genuine freeze. L.hubRenderRuns below counts only real (non-coalesced)
  // runs, for tests; M.viewTimings.hub is a real duration in ms, surfaced on the Connection page and Copy
  // Diagnostics (same pattern as the background-save timing) so the next report carries a number instead
  // of another guess at the underlying render cost itself.
  // ---------------------------------------------------------------------------
  // Coach Hub section breaker (5 Oct 2026, Andy: "Still freezing on coach hub button hit", after the
  // 16 Sept double-tap fix). Every other tab worked; only Hub froze the phone, and no synthetic data
  // volume reproduced it in the browser harness (180 sessions, 72 athletes, 2,880 attendance rows, a
  // 5MB legacy blob, real-shaped PB/T400 evidence: ~110ms total). So rather than guess a sixth time,
  // each Hub section now runs through runSection(): it records "started <section>" in localStorage
  // BEFORE running and clears it AFTER. If the phone freezes inside a section and Andy backs out, that
  // marker survives; the next Hub open sees it, skips ONLY that section, says so on screen (no hiding
  // broken state), and the rest of the Hub opens normally. "Retry skipped sections" clears it. The
  // per-section timings + which section tripped are shown in Hub's Data / diagnostics panel, so the
  // next report names the exact culprit instead of another theory.
  // ---------------------------------------------------------------------------
  const HUB_CRUMB_KEY='msos_hub_breadcrumb_v1';
  const HUB_SECTION_LABELS={plan:'Season / week plan link',summary:'Session summary',mix:'Session makeup',meet:'Next meet',carry:'Carry-forward',dosage:'Dosage / stimulus card'};
  let hubCrumbCache=null;
  const msNow=()=>(g.performance&&typeof g.performance.now==='function')?g.performance.now():Date.now();
  // 5 Oct 2026, second round ("Same again" after the breaker build went live): the breaker only works if
  // its marker actually persists. On a phone whose localStorage is already full (the compact recovery
  // copy + legacy store live there), setItem throws and the marker silently never lands. So every write
  // ALSO goes to a small cookie (separate quota, synchronous, survives back-out/reload), and a failed
  // localStorage write is itself recorded so the next report shows it.
  const HUB_COOKIE='msos_hub_crumb';
  function readCookieCrumb(){try{const raw=String(g.document?.cookie||'').split(/;\s*/).find(x=>x.startsWith(HUB_COOKIE+'='));if(!raw)return null;const v=JSON.parse(decodeURIComponent(raw.slice(HUB_COOKIE.length+1)));if(!v||typeof v!=='object')return null;
    const at=v.a||'';return{seq:Number(v.q)||0,open:Object.fromEntries((v.o||[]).map(n=>[n,{at,build:v.b||''}])),tripped:Object.fromEntries((v.t||[]).map(n=>[n,{startedAt:'',build:v.b||'',detectedAt:''}])),renderOpen:v.r||undefined,stage:v.s||'',stageAt:v.sa||'',stageBuild:v.b||'',lsFailed:v.lf||'',fromCookie:true};}catch{return null}}
  function writeCookieCrumb(c){try{if(!g.document)return;const v={q:c.seq||0,o:Object.keys(c.open||{}),t:Object.keys(c.tripped||{}),r:c.renderOpen||'',s:c.stage||'',sa:c.stageAt||'',b:M.BUILD||'',lf:c.lsFailed||'',a:Object.values(c.open||{})[0]?.at||''};g.document.cookie=`${HUB_COOKIE}=${encodeURIComponent(JSON.stringify(v))}; max-age=31536000; SameSite=Lax`;}catch{}}
  function readHubCrumb(){let c=null;try{c=JSON.parse(g.localStorage?.getItem?.(HUB_CRUMB_KEY)||'null')}catch{}if(!c||typeof c!=='object')c={};
    const ck=readCookieCrumb();if(ck&&(ck.seq||0)>(Number(c.seq)||0)){c={...c,seq:ck.seq,open:ck.open,tripped:{...(c.tripped||{}),...ck.tripped},renderOpen:ck.renderOpen,stage:ck.stage,stageAt:ck.stageAt,stageBuild:ck.stageBuild,lsFailed:ck.lsFailed,recoveredFromCookie:true};if(!c.renderOpen)delete c.renderOpen;}
    return c;}
  function writeHubCrumb(c){c.seq=(Number(c.seq)||0)+1;try{g.localStorage?.setItem?.(HUB_CRUMB_KEY,JSON.stringify(c));}catch(e){c.lsFailed=text(e?.name||e?.message||e).slice(0,60)||'write failed';}writeCookieCrumb(c);}
  const STAGE_LABELS={'nav:tap':'after tapping Coach Hub, before the Hub started drawing','hub:start':'starting the Hub','hub:html':'drawing the Hub page','sec:plan':'Season / week plan link','sec:summary':'Session summary','sec:mix':'Session makeup','sec:meet':'Next meet','sec:carry':'Carry-forward','sec:dosage':'Dosage / stimulus card'};
  function setStage(stage){const c=hubCrumb();c.stage=stage;c.stageAt=now();c.stageBuild=M.BUILD||'';writeHubCrumb(c);}
  function hubCrumb(){
    if(hubCrumbCache)return hubCrumbCache;
    const c=readHubCrumb();c.open=c.open&&typeof c.open==='object'?c.open:{};c.tripped=c.tripped&&typeof c.tripped==='object'?c.tripped:{};c.timings=c.timings&&typeof c.timings==='object'?c.timings:{};c.errors=c.errors&&typeof c.errors==='object'?c.errors:{};
    // Anything still marked open was started on an EARLIER page load and never finished: the phone
    // froze (or was killed) inside it. Nothing from this page load can be open yet -- this runs once,
    // before the first section of this page load starts.
    for(const [name,info] of Object.entries(c.open))c.tripped[name]={startedAt:info?.at||info||'',build:info?.build||'',detectedAt:now()};
    if(c.renderOpen){c.renderStalled={startedAt:c.renderOpen,detectedAt:now(),sectionTripped:Object.keys(c.open).length>0};}delete c.renderOpen;
    // Any stage other than a clean finish means the last Hub attempt never completed on that page load.
    if(c.stage&&!/^(?:hub:done|hub:coalesced|idle)$/.test(c.stage)){c.lastStall={stage:c.stage,label:STAGE_LABELS[c.stage]||c.stage,at:c.stageAt||'',build:c.stageBuild||'',storage:c.lsFailed?`localStorage full/failing (${c.lsFailed})`:'ok',detectedAt:now(),acknowledged:false};}
    c.stage='idle';
    c.open={};writeHubCrumb(c);hubCrumbCache=c;return c;
  }
  // A section tripped under an older build gets one automatic retry on a new build (that build may be the
  // fix); if it freezes again it re-trips under the new build and stays skipped until Retry.
  function expireOldTrips(c){let changed=false;for(const [n,t] of Object.entries(c.tripped||{}))if(t?.build&&M.BUILD&&t.build!==M.BUILD){delete c.tripped[n];changed=true;}if(changed)writeHubCrumb(c);}
  function runSection(name,fn,fallback){
    const c=hubCrumb(),fb=()=>typeof fallback==='function'?fallback():fallback;expireOldTrips(c);
    if(c.tripped[name])return fb();
    const prevStage=c.stage;c.open[name]={at:now(),build:M.BUILD||''};c.stage='sec:'+name;c.stageAt=now();c.stageBuild=M.BUILD||'';writeHubCrumb(c);
    const t0=msNow();
    try{const out=fn();delete c.errors[name];return out;}
    catch(e){c.errors[name]=text(e?.message||e).slice(0,200);return fb();}
    finally{delete c.open[name];c.timings[name]=Math.round(msNow()-t0);c.lastRunAt=now();c.stage=prevStage&&prevStage!=='idle'?prevStage:'hub:done';writeHubCrumb(c);}
  }
  function trippedSections(){const c=hubCrumb();expireOldTrips(c);return Object.keys(c.tripped);}
  function resetTripped(){const c=hubCrumb();c.tripped={};writeHubCrumb(c);}
  function hubDiagnostics(){const c=hubCrumb();return{timings:{...c.timings},tripped:{...c.tripped},errors:{...c.errors},lastRunAt:c.lastRunAt||'',renderStalled:c.renderStalled||null,lastStall:c.lastStall||null,storage:c.lsFailed?`localStorage failing (${c.lsFailed})`:'ok'};}
  function acknowledgeStall(){const c=hubCrumb();if(c.lastStall)c.lastStall.acknowledged=true;writeHubCrumb(c);}
  L.setStage=setStage;L.acknowledgeStall=acknowledgeStall;
  L.runSection=runSection;L.trippedSections=trippedSections;L.resetTripped=resetTripped;L.hubDiagnostics=hubDiagnostics;L.HUB_CRUMB_KEY=HUB_CRUMB_KEY;
  L._resetCrumbCacheForTests=()=>{hubCrumbCache=null;};

  // Hub display honesty (5 Oct 2026, Andy: "at the moment I'm showing all last season's data. But now we
  // need to be able to move on to the planning phase."). planContext() still picks the best-scoring season
  // and week exactly as before (the session-methodology check depends on that); this only labels whether
  // the picked season/week actually covers this session's date, and finds an already-planned next season,
  // so Hub can say "between seasons" instead of presenting last season as current.
  function withPlanStatus(ctx,session){
    const date=session?.identity?.date||'';if(!date)return ctx;
    const start=r=>String(r?.start_date||r?.startDate||r?.effective_from||'').slice(0,10),end=r=>String(r?.end_date||r?.endDate||'').slice(0,10);
    const ss=sessionSquads(session),forSquads=r=>{const ps=planSquads(r);return!ps.length||!ss.length||ps.some(x=>ss.includes(x));};
    ctx.seasonStatus=!ctx.season?'none':inSeason(date,ctx.season)?'current':(start(ctx.season)>date?'upcoming':'ended');
    ctx.seasonEnded=ctx.seasonStatus==='ended'?end(ctx.season):'';
    ctx.weekCurrent=!!(ctx.week&&dateInWeek(date,ctx.week.week_start||ctx.week.weekStart||ctx.week.start_date));
    // A stale week from last season must not feed Today / carry-forward either.
    if(ctx.week&&!ctx.weekCurrent){ctx.todayFocus=text(session?.metadata?.primarySystem||session?.metadata?.planCue||'');ctx.carry='';ctx.staleWeek=ctx.week.week_start||'';}
    if(ctx.seasonStatus!=='current'){const next=seasonRows({}).filter(r=>start(r)>date&&forSquads(r)).sort((a,b)=>start(a).localeCompare(start(b)))[0];if(next)ctx.nextSeason={name:text(next.name||'Next season'),start:start(next)};}
    return ctx;
  }
  const niceDay=v=>{const t=Date.parse(`${String(v||'').slice(0,10)}T12:00:00`);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{day:'numeric',month:'short'}):String(v||'');};
  function seasonCardHtml(ctx){
    const owner=(M.access?.role?.()||'owner')==='owner',btn=owner?'<div class="loop-quick"><button data-msos-plan-season>Plan next season</button></div>':'';
    if(ctx.seasonStatus==='ended'||ctx.seasonStatus==='upcoming'||(!ctx.season&&ctx.linkStatus!=='skipped')){
      const next=ctx.nextSeason?`<p><b>${esc(ctx.nextSeason.name)}</b> starts ${esc(niceDay(ctx.nextSeason.start))}.</p>`:'';
      const was=ctx.seasonStatus==='ended'?`${esc(ctx.seasonName||'Last season')} finished ${esc(niceDay(ctx.seasonEnded))}. `:'';
      return`<article class="page-card" data-loop-season-between><div class="eyebrow">SEASON DIRECTION</div><h2>Between seasons</h2><p>${was}${ctx.nextSeason?'':'Next season is not planned yet.'}</p>${next}${ctx.nextSeason?(owner?'<div class="loop-quick"><button data-msos-plan-season>Review season plan</button></div>':''):btn}</article>`;
    }
    return`<article class="page-card"><div class="eyebrow">SEASON DIRECTION</div><h2>${esc(ctx.seasonName||'Season link needs repair')}</h2><p>${esc(ctx.seasonGoal||'No season goal available from the linked source.')}</p></article>`;
  }
  function weekCardHtml(ctx){
    if(ctx.week&&ctx.weekCurrent===false)return`<article class="page-card"><div class="eyebrow">THIS WEEK</div><h2>No week planned for this week</h2><p class="muted">The weekly focus shows here once a season plan covers this week.</p></article>`;
    return`<article class="page-card"><div class="eyebrow">THIS WEEK</div><h2>${esc(ctx.weeklyFocus||'Weekly focus needs repair')}</h2><p>${esc(ctx.technicalFocus||'No separate weekly technical focus loaded.')}</p></article>`;
  }
  L.withPlanStatus=withPlanStatus;

  // ---------------------------------------------------------------------------
  // Today (7 Oct 2026). Andy, on the Hub: "a page of useless info with no easy add or edit option ... not
  // easy for a coach to pick up and make sense of ... supposed to say between seasons." The Hub was anchored
  // to whichever session happened to be SELECTED (24 Sep in his screenshot), so it described last season's
  // taper week and offered no way to write or edit anything. It now opens on TODAY: where the season is,
  // and today's + the next days' sessions from the timetable, each with Write / Open / Edit. The selected
  // session's full analysis is kept, collapsed, underneath.
  // ---------------------------------------------------------------------------
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const addDay=(iso,n)=>new Date(Date.parse(`${iso}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
  const dayLabel=(iso,today)=>{if(iso===today)return'Today';if(iso===addDay(today,1))return'Tomorrow';const t=Date.parse(`${iso}T12:00:00Z`);return new Date(t).toLocaleDateString('en-NZ',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'});};
  const shortDate=iso=>{const t=Date.parse(`${String(iso||'').slice(0,10)}T12:00:00Z`);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-NZ',{day:'numeric',month:'short',timeZone:'UTC'}):'';};
  const clock12=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return String(t||'');const h=Number(m[1]);return`${h%12||12}:${m[2]}${h<12?'am':'pm'}`;};
  function seasonToday(today){
    const rows=seasonRows({}),start=r=>text(r?.start_date||r?.startDate||r?.effective_from).slice(0,10),end=r=>text(r?.end_date||r?.endDate).slice(0,10);
    const cur=rows.find(r=>inSeason(today,r)&&start(r)),next=rows.filter(r=>start(r)>today).sort((a,b)=>start(a).localeCompare(start(b)))[0],last=rows.filter(r=>end(r)&&end(r)<today).sort((a,b)=>end(b).localeCompare(end(a)))[0];
    if(cur){const weeks=weekRows({}).filter(w=>dateInWeek(today,w.week_start||w.weekStart||w.start_date));const w=weeks[0]||null;const n=Math.floor((Date.parse(`${today}T12:00:00Z`)-Date.parse(`${start(cur)}T12:00:00Z`))/(7*86400000))+1,total=end(cur)?Math.ceil((Date.parse(`${end(cur)}T12:00:00Z`)-Date.parse(`${start(cur)}T12:00:00Z`))/(7*86400000))+1:0;
      return{status:'current',name:text(cur.name||'Season'),line:`Week ${n}${total?` of ${total}`:''}${w?.phase?` · ${text(w.phase)}`:''}`,focus:text(w?.objective||w?.focus||''),meet:text(cur.meets?.[0]?.name||''),meetDate:text(cur.meets?.[0]?.date||end(cur))};}
    if(next)return{status:'upcoming',name:text(next.name||'Next season'),line:`Starts ${shortDate(start(next))}`,last:last?text(last.name):''};
    return{status:'between',name:'',line:last?`${text(last.name||'Last season')} finished ${shortDate(end(last))}`:'No season plan yet',last:last?text(last.name):''};
  }
  function slotGroups(date){
    let slots=[];try{slots=M.calendar?.slots?.(date)||[];}catch{}
    const groups=new Map();
    for(const x of slots){const k=`${x.dayPart}|${x.start}|${x.end}|${x.venue}`;if(!groups.has(k))groups.set(k,{date,dayPart:x.dayPart,start:x.start,end:x.end,venue:x.venue,squads:[],slotId:x.id});groups.get(k).squads.push(x.squad);}
    const sessions=Object.values(M.state.canonicalSessions||{}).filter(s=>s?.identity?.date===date&&(!M.access?.sessionAllowed||M.access.sessionAllowed(s)));
    const out=[...groups.values()].sort((a,b)=>(a.dayPart+a.start).localeCompare(b.dayPart+b.start));
    for(const g of out){const keys=g.squads.map(x=>text(x).toLowerCase());g.session=sessions.find(s=>String(s.identity?.dayPart||'').toUpperCase()===g.dayPart&&(s.identity?.squads||[]).some(q=>keys.includes(text(q).toLowerCase())))||null;}
    return out;
  }
  // Whose sessions to list: an assistant's assigned squads; for the owner, the squads they've actually
  // written sessions for in the last 60 days (Andy: National / Development), so Intermediate / Junior /
  // Fitness-only slots don't bury his own. "Show all squads" lists everything.
  let hubAllSquads=false;
  function mySquads(today){
    if(hubAllSquads)return null;
    try{if((M.access?.role?.()||'owner')!=='owner'){const a=M.access?.assignedSquads?.();return a&&a.size?a:null;}}catch{}
    const cut=addDay(today,-60),set=new Set();
    for(const x of Object.values(M.state.canonicalSessions||{})){const d=x?.identity?.date||'';if(d>=cut&&d<=addDay(today,14))for(const q of x.identity?.squads||[])set.add(text(q).toLowerCase());}
    return set.size?set:null;
  }
  function slotRowHtml(g,canWrite){
    const s=g.session,total=s?(M.session?.total?.(s)||0):0;
    let brief='';if(!s){try{const b=M.sessionMethodology?.brief?.({id:'hub-brief',identity:{date:g.date,dayPart:g.dayPart,squads:g.squads},blocks:[]});if(b&&b.source!=='none')brief=text(b.sessionFocus||b.system||'');}catch{}}
    let check='';if(s){try{const v=M.sessionMethodology?.evaluate?.(s,M.state);if(v?.plan?.checked)check=v.plan.matches?'✓ on brief':'⚠ off brief';}catch{}}
    const status=s?`<b>${total.toLocaleString()}m written</b>${s.finish?' · finished':''}${check?` · ${esc(check)}`:''}`:`<span class="muted">Not written yet${brief?` · brief: ${esc(brief)}`:''}</span>`;
    const actions=s?`<button type="button" data-hub-open="${esc(s.id)}">Open</button>${canWrite?`<button type="button" data-hub-edit="${esc(s.id)}">Edit</button>`:''}`:(canWrite?`<button type="button" class="hub-write" data-hub-write="${esc(g.date)}" data-hub-slot="${esc(g.slotId)}">Write session</button>`:'');
    return`<div class="hub-slot"><div class="hub-slot-main"><div class="hub-slot-when">${esc(g.dayPart)} ${esc(clock12(g.start))}</div><div><b>${esc(g.squads.join(' + '))}</b>${g.venue&&!/aquagym/i.test(g.venue)?` <span class="muted">· ${esc(g.venue)}</span>`:''}<div class="hub-slot-status">${status}</div></div></div><div class="hub-slot-actions">${actions}</div></div>`;
  }
  function todayHtml(){
    const today=nzToday(),owner=(M.access?.role?.()||'owner')==='owner',canWrite=M.access?.can?M.access.can('session.create'):true,season=seasonToday(today);
    const seasonBtn=owner?(season.status==='current'?'<button type="button" data-msos-plan-season>Season plan</button>':'<button type="button" class="hub-write" data-msos-plan-season>Plan next season</button>'):'';
    const seasonCard=season.status==='current'
      ?`<div class="hub-season"><div><div class="eyebrow">SEASON</div><h2>${esc(season.name)}</h2><p>${esc(season.line)}${season.meet?` · peaking for ${esc(season.meet)}${season.meetDate?` (${esc(shortDate(season.meetDate))})`:''}`:''}</p>${season.focus?`<p class="muted">This week: ${esc(season.focus)}</p>`:''}</div>${seasonBtn}</div>`
      :`<div class="hub-season"><div><div class="eyebrow">SEASON</div><h2>${season.status==='upcoming'?esc(season.name):'Between seasons'}</h2><p>${esc(season.line)}</p></div>${seasonBtn}</div>`;
    const mine=mySquads(today),keep=g=>!mine||g.squads.some(q=>mine.has(text(q).toLowerCase()));
    const days=[];for(let i=0;i<7&&days.length<4;i++){const d=addDay(today,i),g=slotGroups(d).filter(keep);if(g.length||i===0)days.push({d,g});}
    const dayHtml=days.map(({d,g},i)=>`<div class="hub-day${i===0?' hub-day-today':''}"><h3>${esc(dayLabel(d,today))}${i===0?` <span class="muted">· ${esc(shortDate(d))}</span>`:''}</h3>${g.length?g.map(x=>slotRowHtml(x,canWrite)).join(''):'<p class="muted">No sessions on the timetable today.</p>'}</div>`).join('');
    // Cloud sync status (10 Oct 2026): sync sat off unnoticed for a month. Owner sees a plain warning
    // whenever it is off or waiting, with how many changes are queued. Cheap settings reads only -- no
    // preflight here (that walks every session).
    let syncCard='';
    if(owner){const st=M.state?.settings||{},pending=(M.state?.pending||[]).length,sus=st.cloudWritesSuspended,guardOk=M.release?.guardianCurrent?.();
      let why='';if(!st.cloudWritesEnabled)why=sus?`Switched off because this build's Guardian check failed${sus.failed?.length?` (${sus.failed.join(', ')})`:''}.`:'Your sessions, Roll and captures are only on this phone until it is turned on.';else if(!guardOk)why='Waiting for this build\'s Guardian check before sending.';
      if(why)syncCard=`<section class="page-card hub-sync" data-hub-sync><div><b>Cloud sync is ${st.cloudWritesEnabled?'waiting':'off'}</b>${pending?` · ${pending.toLocaleString()} change${pending===1?'':'s'} waiting to send`:''}<p>${esc(why)} Other coaches, swimmer phones and the TV only see what reaches the cloud.</p></div><button type="button" class="hub-write" data-hub-sync-btn>${st.cloudWritesEnabled?'Check sync':'Turn on cloud sync'}</button></section>`;}
    return`${syncCard}<section class="page-card hub-today" data-hub-today><div class="eyebrow">COACH HUB</div>${seasonCard}</section><section class="page-card hub-days" data-hub-days>${dayHtml}<div class="loop-quick hub-more">${mine||hubAllSquads?`<button data-hub-squads>${hubAllSquads?'Just my squads':'Show all squads'}</button>`:''}<button data-hub-calendar>All sessions (calendar)</button><button data-loop-swimmers>Swimmers</button><button data-loop-reports>Reports</button>${owner?'<button data-hub-team>Coach &amp; TV sign-in</button>':''}</div></section>`;
  }
  function bindToday(h){
    h.querySelectorAll('[data-hub-write]').forEach(b=>b.addEventListener('click',()=>{M.actions?.openNewSession?.({date:b.dataset.hubWrite,slotId:b.dataset.hubSlot});}));
    h.querySelectorAll('[data-hub-open]').forEach(b=>b.addEventListener('click',()=>{if(M.selectSession?.(b.dataset.hubOpen)!==null)go('board',{restore:true});}));
    h.querySelectorAll('[data-hub-edit]').forEach(b=>b.addEventListener('click',()=>{if(M.selectSession?.(b.dataset.hubEdit)!==null){go('board',{restore:true});setTimeout(()=>M.actions?.openSessionEdit?.(),0);}}));
    h.querySelector('[data-hub-calendar]')?.addEventListener('click',()=>M.ui?.openSessionCalendar?.());
    // 9 Oct 2026: the coach-invite and sign-in screen (Connection) was only reachable from Data / diagnostics.
    h.querySelector('[data-hub-team]')?.addEventListener('click',()=>go('connection'));
    h.querySelector('[data-hub-sync-btn]')?.addEventListener('click',()=>go('connection'));
    h.querySelector('[data-hub-squads]')?.addEventListener('click',()=>{hubAllSquads=!hubAllSquads;h.dataset.loopHubRenderedAt='0';renderCoachHub();});
    // Standard timetable engine missing on this page load (seen on Andy's phone, 10 Oct): load it again
    // once, then repaint so today's sessions appear.
    if(!M.standardTimetable&&M.dataAdminUI?.ensureEngine&&!bindToday.ttRetry){bindToday.ttRetry=true;M.dataAdminUI.ensureEngine('engines/standard-timetable.js',()=>!!M.standardTimetable).then(ok=>{if(ok){M.calendar?.reset?.();if(M.state?.settings?.view==='hub'){h.dataset.loopHubRenderedAt='0';renderCoachHub();}}});}
    // Timetable not loaded yet on a cold open: load once, then repaint the day list only if it now has data.
    if(!M.calendar?.data&&M.calendar?.load&&!bindToday.loading){bindToday.loading=true;M.calendar.load().then(d=>{bindToday.loading=false;if(d&&M.state?.settings?.view==='hub'){h.dataset.loopHubRenderedAt='0';renderCoachHub();}}).catch(()=>{bindToday.loading=false;});}
  }
  L.todayHtml=todayHtml;L.slotGroups=slotGroups;L.seasonToday=seasonToday;

  L.hubRenderRuns=0;
  function renderCoachHub(){
    const h=document.querySelector('#hubView');if(!h)return;
    const rev=Number(M.state?.settings?.storageRevision)||0;
    if(h.dataset.loopHubRev===String(rev)&&Date.now()-(Number(h.dataset.loopHubRenderedAt)||0)<400){setStage('hub:coalesced');return;}
    const t0=Date.now();
    {const c=hubCrumb();c.renderOpen=now();c.stage='hub:start';c.stageAt=now();c.stageBuild=M.BUILD||'';writeHubCrumb(c);}
    const finish=()=>{{const c=hubCrumb();delete c.renderOpen;c.stage='hub:done';if(c.lastStall)c.lastStall.acknowledged=true;c.stageAt=now();writeHubCrumb(c);}h.dataset.loopHubRev=String(rev);h.dataset.loopHubRenderedAt=String(Date.now());L.hubRenderRuns++;M.viewTimings=M.viewTimings||{};M.viewTimings.hub=Date.now()-t0;};
    const s=currentSession();if(!s){h.innerHTML=todayHtml();bindToday(h);h.querySelector('[data-loop-swimmers]')?.addEventListener('click',()=>go('athletes'));h.querySelector('[data-loop-reports]')?.addEventListener('click',()=>go('reports'));finish();return;}
    const emptyCtx={season:null,week:null,weekSession:null,seasonName:'',seasonGoal:'',weeklyFocus:'',carry:'',todayFocus:'',technicalFocus:'',psychologicalFocus:'',linkStatus:'skipped'};
    const ctx=runSection('plan',()=>withPlanStatus(planContext(s),s),emptyCtx),sum=runSection('summary',()=>M.analysis?.summary?.(s,M.state)||{},{})||{},mix=runSection('mix',()=>sessionMix(s),()=>({total:0,zones:{},strokes:{},movement:{}})),meetInfo=runSection('meet',()=>{const meet=upcomingMeet(ctx,s);return{meet,entries:meet?.id&&M.meet?.visibleEntries?M.meet.visibleEntries(meet.id):[]};},()=>({meet:null,entries:[]})),meet=meetInfo.meet,entries=meetInfo.entries||[],carry=ctx.carry||runSection('carry',()=>recentCarry(s),''),psy=intentRows(ctx,s),zoneRows=topRows(mix.zones,mix.total),strokeRows=topRows(mix.strokes,mix.total),moveRows=topRows(mix.movement,mix.total),planned=Number(M.session?.total?.(s)||mix.total)||0,delivered=Number(sum?.delivered?.total??s.finish?.actualDistance??planned)||0;
    const tripped=trippedSections(),diag=hubDiagnostics();
    setStage('hub:html');
    const isToday=s.identity?.date===nzToday();
    h.innerHTML=`${todayHtml()}
      <details class="page-card loop-hub-detail" data-loop-session-detail ${isToday?'open':''}><summary><span class="eyebrow">SESSION DETAIL</span> <b>${esc(shortDate(s.identity?.date)||s.identity?.date||'')} ${esc(s.identity?.dayPart||'')} · ${esc((s.identity?.squads||[]).join(' + '))}</b><span class="muted"> — plan, makeup, dosage, evidence</span></summary>
      <section class="page-card loop-hub-hero">
        <div class="eyebrow">SELECTED SESSION</div>
        <h1>${esc(`${s.identity?.date||''} ${s.identity?.dayPart||''}`.trim())}</h1>
        <p>${esc([(s.identity?.squads||[]).join(' + '),s.identity?.venue,s.identity?.course].filter(Boolean).join(' · '))}</p>
        <div class="loop-quick"><button data-loop-board>Board</button><button data-loop-meet>Meet</button></div>
      </section>
      ${tripped.length?`<section class="page-card" data-loop-hub-tripped><div class="eyebrow">COACH HUB · SKIPPED TO KEEP THE PHONE RESPONSIVE</div><p>${esc(tripped.map(n=>HUB_SECTION_LABELS[n]||n).join(', '))} froze the phone on an earlier open, so ${tripped.length===1?'it is':'they are'} skipped for now. Everything else below is live.</p><div class="loop-quick"><button data-loop-hub-retry>Retry skipped sections</button></div></section>`:''}
      <section class="loop-context-grid">
        ${seasonCardHtml(ctx)}
        ${weekCardHtml(ctx)}
        <article class="page-card loop-today"><div class="eyebrow">TODAY</div><h2>${esc(ctx.todayFocus||sum?.purpose?.label||'Coach-authored purpose not loaded')}</h2><div class="loop-kpis"><span>${planned.toLocaleString()}m planned</span><span>${delivered.toLocaleString()}m ${sum?.finished||s.finish?'delivered':'current'}</span><span>${sum?.attendance?.here||0} here</span><span>${sum?.attendance?.modified||0} modified</span></div></article>
        <article class="page-card"><div class="eyebrow">CARRY FORWARD</div><h2>${esc(carry||'No carry-forward recorded')}</h2><small>${ctx.week?'Linked weekly-plan / prior delivered evidence':'Prior delivered evidence only'}</small></article>
      </section>
      <section class="page-card loop-intelligence"><div class="eyebrow">SESSION MAKEUP</div><div class="loop-three"><div><h3>Physiology / dosage</h3>${zoneRows.length?metricRows(zoneRows):'<p class="muted">No classified physiological metres. Unclassified work stays unclassified.</p>'}</div><div><h3>Stroke mix</h3>${strokeRows.length?metricRows(strokeRows):'<p class="muted">No stroke mix resolved.</p>'}</div><div><h3>Movement mix</h3>${moveRows.length?metricRows(moveRows):'<p class="muted">No movement mix resolved.</p>'}</div></div><p class="muted">Metres describe the canonical prescription; they do not overrule the coach-authored primary purpose.</p></section>
      <section class="page-card"><div class="eyebrow">PSYCHOLOGICAL / BEHAVIOURAL INTENT</div>${psy.length?`<div class="loop-chip-row">${psy.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'<p class="muted">No explicit psychological/behavioural cue was found in the linked plan or authored session. MSOS does not invent one.</p>'}${ctx.psychologicalFocus?`<p>${esc(ctx.psychologicalFocus)}</p>`:''}</section>
      <section class="page-card"><div class="eyebrow">NEXT PERFORMANCE TARGET</div>${meet?`<div class="loop-meet-line"><div><h2>${esc(meet.title)}</h2><p>${esc([meet.date,meet.course,meet.venue].filter(Boolean).join(' · '))}</p></div><strong>${entries.length?`${entries.length} loaded entr${entries.length===1?'y':'ies'}`:'Meet loaded'}</strong></div>`:'<h2>No upcoming meet currently linked</h2>'}</section>
      <section class="page-card"><div class="eyebrow">EVIDENCE FROM THIS SESSION</div><div class="loop-kpis"><span>${sum?.evidence?.changes||0} live changes</span><span>${sum?.evidence?.captures||0} captures</span><span>${sum?.evidence?.timedSets||0} timed sets</span></div><p class="muted">Evidence supports the coaching picture; it does not replace the plan or delivered-session truth.</p></section>
      </details>
      <details class="page-card" data-loop-hub-diagnostics><summary>Data / diagnostics</summary><p>Plan link: <b>${esc(ctx.linkStatus)}</b></p><p class="muted">Hub section timings: ${esc(Object.entries(diag.timings).map(([k,v])=>`${k} ${v}ms`).join(' · ')||'none yet')}${tripped.length?` · skipped: ${esc(tripped.join(', '))}`:''}${diag.lastStall?` · last unfinished attempt stuck at: ${esc(diag.lastStall.label)} (${esc(diag.lastStall.at)})`:''}${diag.storage!=='ok'?` · ${esc(diag.storage)}`:''}${diag.renderStalled&&!diag.renderStalled.sectionTripped?` · an earlier open stalled outside the guarded sections (${esc(diag.renderStalled.startedAt)})`:''}${Object.keys(diag.errors).length?` · errors: ${esc(Object.entries(diag.errors).map(([k,v])=>`${k}: ${v}`).join('; '))}`:''}</p><div class="loop-quick"><button data-loop-data>Data & References</button><button data-loop-guardian>Guardian</button><button data-loop-connection>Connection</button></div></details>`;
    bindToday(h);
    h.querySelector('[data-loop-board]')?.addEventListener('click',()=>go('board',{restore:true}));
    h.querySelector('[data-loop-swimmers]')?.addEventListener('click',()=>go('athletes'));
    h.querySelector('[data-loop-meet]')?.addEventListener('click',()=>go('meet'));
    h.querySelector('[data-loop-reports]')?.addEventListener('click',()=>go('reports'));
    h.querySelector('[data-loop-data]')?.addEventListener('click',()=>go('data'));
    h.querySelector('[data-loop-guardian]')?.addEventListener('click',()=>go('guardian'));
    h.querySelector('[data-loop-connection]')?.addEventListener('click',()=>go('connection'));
    h.querySelector('[data-loop-hub-retry]')?.addEventListener('click',()=>{resetTripped();h.dataset.loopHubRenderedAt='0';renderCoachHub();});
    finish();
  }
  L.renderCoachHub=renderCoachHub;

  // ---------------------------------------------------------------------------
  // Board attendee strip -> current-session swimmer window.
  // ---------------------------------------------------------------------------
  function attending(session=currentSession()){
    const present=UI.presentAthletes?.()||[];if(present.length)return present;
    const ids=new Set((M.state?.attendance||[]).filter(x=>x.session_id===session?.id&&['present','modified','late'].includes(norm(x.status))).map(x=>x.athlete_id));
    return(M.state?.athletes||[]).filter(a=>ids.has(a.id)&&a.active!==false);
  }
  function captureBelongs(c,ath){const ids=[...(c?.athlete_ids||c?.swimmer_ids||[])];if(c?.athlete_id&&!ids.includes(c.athlete_id))ids.push(c.athlete_id);return ids.includes(ath?.id);}
  function boardName(a,pool){return M.boardEngine?.name?.(a,pool)||text(a?.preferred_name||a?.nickname||a?.full_name).split(' ')[0]||'Swimmer'}
  function openLiveAthlete(ath){const s=currentSession();if(!ath||!s)return;M.state.settings.selectedAthleteId=ath.id;M.state.settings.loopAthleteOrigin={sessionId:s.id,blockId:M.state.settings.boardBlockBySession?.[s.id]||'',scrollY:window.scrollY,openedAt:now()};saveUi();go('athletes');}
  function installBoardAthletes(){const host=document.querySelector('#boardView'),s=currentSession();if(!host||!s)return;host.querySelector('[data-loop-attendees]')?.remove();const rows=attending(s);if(!rows.length)return;const section=document.createElement('section');section.dataset.loopAttendees='1';section.className='loop-attendees';section.innerHTML=`<div class="loop-attendee-head"><b>Here now</b><small>tap swimmer · today first</small></div><div class="loop-attendee-scroll">${rows.map(a=>{const n=(M.state.captures||[]).filter(c=>c.session_id===s.id&&captureBelongs(c,a)).length;return`<button data-loop-athlete="${esc(a.id)}"><span>${esc(boardName(a,rows))}</span>${n?`<small>${n} capture${n===1?'':'s'}</small>`:''}</button>`}).join('')}</div>`;const anchor=host.querySelector('.board-hero,.session-card,.board-header,.v4-block-nav')||host.firstElementChild;if(anchor)anchor.insertAdjacentElement(anchor.classList?.contains('v4-block-nav')?'beforebegin':'afterend',section);else host.prepend(section);section.querySelectorAll('[data-loop-athlete]').forEach(b=>b.onclick=()=>openLiveAthlete(rows.find(a=>a.id===b.dataset.loopAthlete)));}

  // ---------------------------------------------------------------------------
  // Individual swimmer Today window over the existing performance/pathway page.
  // ---------------------------------------------------------------------------
  function sessionByOrigin(){const current=currentSession(),id=M.state?.settings?.loopAthleteOrigin?.sessionId;return id&&current?.id===id?(M.state?.canonicalSessions?.[id]||current):current;}
  function currentBlock(session){const id=M.state?.settings?.loopAthleteOrigin?.blockId||M.state?.settings?.boardBlockBySession?.[session?.id];return(session?.blocks||[]).find(b=>b.id===id)||(session?.blocks||[]).find(b=>b.type==='main_set')||(session?.blocks||[])[0]||null;}
  function captureTitle(c){return text(c?.title||c?.text_content)||({video:'Video',photo:'Photo',voice:'Voice',note:'Note'}[norm(c?.capture_type)]||'Capture')}
  function captureNote(c){return text(c?.capture_note||c?.notes||c?.metadata?.capture_note||'')}
  function ensureReflections(){if(!Array.isArray(M.state.athleteReflections))M.state.athleteReflections=[];return M.state.athleteReflections}
  function reflectionsFor(ath,session){return ensureReflections().filter(x=>x.athlete_id===ath?.id&&(!session||x.session_id===session.id)).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))}
  function recentRaces(ath){const entries=new Map((M.state?.meetEntries||[]).map(e=>[e.id,e])),meets=new Map((M.state?.meets||[]).map(m=>[m.id,m]));return(M.state?.meetRaces||[]).filter(r=>r.athlete_id===ath?.id&&r.status==='complete').sort((a,b)=>String(b.completed_at||b.updated_at||'').localeCompare(String(a.completed_at||a.updated_at||''))).slice(0,4).map(r=>({race:r,entry:entries.get(r.entry_id)||{},meet:meets.get(r.meet_id)||{}}));}
  function detectedStroke(c){const t=norm([captureTitle(c),captureNote(c),c?.context_label].join(' '));if(/butterfly|\bfly\b/.test(t))return'Butterfly';if(/breaststroke|\bbreast\b|\bbr\b/.test(t))return'Breaststroke';if(/backstroke|\bback\b|\bbk\b/.test(t))return'Backstroke';if(/freestyle|\bfree\b|\bfr\b/.test(t))return'Freestyle';if(/\bim\b|medley/.test(t))return'IM';return'';}
  function matchingEvents(ath,course,capture){let p=null;try{p=M.pathway?.profile?.(ath,course)}catch{}const rows=(p?.events||[]).filter(x=>x?.pb),stroke=detectedStroke(capture);const match=stroke?rows.filter(x=>text(x.pb.stroke)===stroke):[];return(match.length?match:rows).slice(0,4);}
  function restoreBoard(){const o=M.state?.settings?.loopAthleteOrigin||{};if(o.sessionId&&M.state?.canonicalSessions?.[o.sessionId])M.state.settings.selectedSessionId=o.sessionId;if(o.blockId){M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};M.state.settings.boardBlockBySession[o.sessionId]=o.blockId;}saveUi();go('board',{restore:true});requestAnimationFrame(()=>window.scrollTo(0,Number(o.scrollY)||0));}
  function individualTrainingStatus(ath){try{const today=M.swimmerTrainingBG?.viewFor?.(ath)?.today;if(today){const delivered=Number(today.deliveredMetres),prescribed=Number(today.prescribedMetres);if(['ended-early','delivered-prescription'].includes(today.delivery)&&Number.isFinite(delivered))return`${delivered.toLocaleString()}m recorded`;if(Number.isFinite(prescribed)&&prescribed>0)return`${prescribed.toLocaleString()}m current prescription`;}}catch{}return'Individual prescription';}
  function enhanceAthleteToday(){const h=document.querySelector('#athletesView');if(!h||h.querySelector('[data-loop-athlete-today]'))return;const id=M.state?.settings?.selectedAthleteId,ath=(M.state?.athletes||[]).find(a=>a.id===id);if(!ath)return;const s=sessionByOrigin(),origin=M.state?.settings?.loopAthleteOrigin||{},originActive=!!(origin.sessionId&&s?.id===origin.sessionId&&currentSession()?.id===origin.sessionId),block=currentBlock(s),course=s?.identity?.course||M.state?.settings?.pathwayCourse||'SCM',caps=(M.state?.captures||[]).filter(c=>c.session_id===s?.id&&captureBelongs(c,ath)).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),latest=caps[0],events=matchingEvents(ath,course,latest),attendance=(M.state?.attendance||[]).find(x=>x.session_id===s?.id&&x.athlete_id===ath.id),reflections=reflectionsFor(ath,s),races=recentRaces(ath);const card=document.createElement('section');card.dataset.loopAthleteToday='1';card.className='page-card loop-athlete-today';card.innerHTML=`<div class="loop-athlete-top"><div><div class="eyebrow">TODAY · ${esc(s?`${s.identity?.date||''} ${s.identity?.dayPart||''}`:'CURRENT CONTEXT')}</div><h2>${esc(ath.full_name)}</h2><p>${esc([attendance?.status,block?.title].filter(Boolean).join(' · '))}</p></div>${originActive?'<button data-loop-back-board>← Board</button>':''}</div><div class="loop-quick"><button data-loop-performance>Performance</button><button data-loop-training>Training</button>${M.meet?.current?.()?'<button data-loop-ath-meet>Meet</button>':''}</div><div data-loop-training-box class="loop-training-box"><b>${esc(block?.title||'Current session')}</b><span>${esc(individualTrainingStatus(ath))}</span></div><h3>Session captures</h3>${caps.length?`<div class="loop-capture-list">${caps.slice(0,8).map((c,i)=>`<article><button class="loop-capture-open" data-loop-open-cap="${esc(c.id)}"><b>${i===0?'LATEST · ':''}${esc(captureTitle(c))}</b><span>${esc(c.context_label||block?.title||'Session')}</span>${captureNote(c)?`<small>${esc(captureNote(c))}</small>`:''}</button></article>`).join('')}</div>`:'<p class="muted">No individual captures in this session yet.</p>'}${reflections.length?`<h3>Swimmer input</h3><div class="loop-capture-list">${reflections.slice(0,4).map(r=>`<article><div class="loop-reflection"><b>${esc(r.label||'Swimmer reflection')}</b><small>${esc(r.text||'')}</small></div></article>`).join('')}</div>`:''}${races.length?`<h3>Recent racing</h3><div class="loop-capture-list">${races.map(x=>`<article><button data-loop-race-entry="${esc(x.entry.id||'')}"><b>${esc(x.entry.event||`${x.entry.distance||''} ${x.entry.stroke||''}`)}</b><span>${esc(x.meet.title||x.meet.name||'Meet')}${x.race.result_seconds?` · ${clock(x.race.result_seconds)}`:''}</span><small>${esc(x.race.notes||x.race.round_result||'')}</small></button></article>`).join('')}</div>`:''}${events.length?`<h3>${latest&&detectedStroke(latest)?`${esc(detectedStroke(latest))} performance links`:'Performance links'}</h3><div class="loop-chip-row">${events.map(e=>`<button data-loop-event="${esc(`${e.pb.distance} ${e.pb.stroke}`)}">${esc(`${e.pb.distance} ${e.pb.stroke}`)} · ${clock(e.pb.result_seconds)}</button>`).join('')}</div>`:''}`;const head=h.firstElementChild;head?.insertAdjacentElement('afterend',card);card.querySelector('[data-loop-back-board]')?.addEventListener('click',restoreBoard);card.querySelector('[data-loop-performance]')?.addEventListener('click',()=>{const target=h.querySelector('.perf-kpis')?.closest('.page-card')||[...h.querySelectorAll('.page-card')].find(x=>/PB \/ event ranking|PERFORMANCE IDENTITY/i.test(x.textContent));target?.scrollIntoView({behavior:'smooth',block:'start'});});card.querySelector('[data-loop-training]')?.addEventListener('click',()=>card.querySelector('[data-loop-training-box]')?.scrollIntoView({behavior:'smooth',block:'center'}));card.querySelector('[data-loop-ath-meet]')?.addEventListener('click',()=>go('meet'));card.querySelectorAll('[data-loop-open-cap]').forEach(b=>b.onclick=()=>M.captureUI?.openEvidence?.(b.dataset.loopOpenCap));card.querySelectorAll('[data-loop-race-entry]').forEach(b=>b.onclick=()=>{if(b.dataset.loopRaceEntry)M.state.settings.currentMeetEntryId=b.dataset.loopRaceEntry;saveUi();go('meet');});card.querySelectorAll('[data-loop-event]').forEach(b=>b.onclick=()=>{const wanted=norm(b.dataset.loopEvent);const target=[...h.querySelectorAll('summary,.perf-rank b')].find(x=>norm(x.textContent).includes(wanted));if(target?.closest('details'))target.closest('details').open=true;target?.scrollIntoView({behavior:'smooth',block:'center'});});}

  let athleteObserver=null;
  function observeAthletes(){const h=document.querySelector('#athletesView');if(!h||athleteObserver)return;athleteObserver=new MutationObserver(()=>queueMicrotask(enhanceAthleteToday));athleteObserver.observe(h,{childList:true,subtree:false});}

  // ---------------------------------------------------------------------------
  // Capture: keep the fast one-swimmer-after-another workflow. Media is saved
  // immediately with selected swimmer identity; title/note/share are post-save.
  // ---------------------------------------------------------------------------
  function checkedIds(modal){return[...modal.querySelectorAll('[data-capture-athlete]:checked')].map(x=>x.dataset.captureAthlete).filter(Boolean)}
  function athleteNames(ids){return ids.map(id=>(M.state?.athletes||[]).find(a=>a.id===id)?.full_name||id).filter(Boolean)}
  function clearCaptureSelection(modal){modal.querySelectorAll('[data-capture-athlete]').forEach(x=>x.checked=false);const label=modal.querySelector('#captureSelectionLabel');if(label)label.textContent='0 selected';}
  async function waitForCapture(before,kind,tries=50){for(let i=0;i<tries;i++){const c=[...(M.state?.captures||[])].reverse().find(x=>!before.has(x.id)&&norm(x.capture_type)===kind);if(c)return c;await new Promise(r=>setTimeout(r,40));}return null;}
  function showPostSave(modal,cap,names){let box=modal.querySelector('[data-loop-post-save]');if(!box){box=document.createElement('div');box.dataset.loopPostSave='1';box.className='loop-post-save';const status=modal.querySelector('#captureStatus');status?.insertAdjacentElement('afterend',box);}const who=names.length?names.join(' + '):'GROUP';box.hidden=false;box.innerHTML=`<div class="loop-post-head"><b>✓ Saved · ${esc(who)}</b><small>${esc(cap.context_label||'current session')}</small></div><label>Title <input data-loop-cap-title placeholder="Optional · e.g. Fly breakout / Dive start" value="${esc(cap.title||cap.text_content||'')}"></label><label>Notes <textarea data-loop-cap-note placeholder="Optional coaching note">${esc(captureNote(cap))}</textarea></label><label class="loop-share"><input type="checkbox" data-loop-cap-share ${['shared','swimmer'].includes(cap.audience)?'checked':''}> Share with swimmer</label><div class="capture-pick-actions"><button type="button" data-loop-save-details>Save details</button><button type="button" data-loop-next>Next capture</button></div>`;const persist=()=>{const title=text(box.querySelector('[data-loop-cap-title]')?.value),note=text(box.querySelector('[data-loop-cap-note]')?.value),share=!!box.querySelector('[data-loop-cap-share]')?.checked;cap.title=title;cap.text_content=title;cap.capture_note=note;cap.metadata={...(cap.metadata||{}),capture_note:note};cap.audience=share?'shared':'coach';cap.updated_at=now();saveUi();try{M.cloud?.stageCapture?.(cap)}catch{}return{title,note,share};};box.querySelector('[data-loop-save-details]').onclick=()=>{persist();M.toast?.(`Capture details saved · ${who}`);box.hidden=true;};box.querySelector('[data-loop-next]').onclick=()=>{persist();box.hidden=true;modal.querySelector('.capture-athlete-chip input')?.focus();};}
  function upgradeCaptureModal(modal){if(!modal||modal.dataset.loopCapture==='1')return;modal.dataset.loopCapture='1';for(const [id,kind] of [['captureVideo','video'],['capturePhoto','photo']]){const input=modal.querySelector('#'+id),previous=input?.onchange;if(!input||!previous)continue;input.onchange=async e=>{const ids=checkedIds(modal),names=athleteNames(ids),before=new Set((M.state?.captures||[]).map(c=>c.id)),status=modal.querySelector('#captureStatus');if(status)status.textContent=`Saving ${kind} locally · ${names.length?names.join(' + '):'GROUP'}`;previous.call(input,e);await new Promise(r=>setTimeout(r,0));const pending=modal.querySelector('[data-media-pending]');if(pending){pending.style.display='none';pending.querySelector('[data-save-media]')?.click();}const cap=await waitForCapture(before,kind);if(!cap){if(status)status.textContent='Capture save did not complete · media remains selected for retry';return;}clearCaptureSelection(modal);if(status)status.textContent=`Saved locally · ${names.length?names.join(' + '):'GROUP'} · select next swimmer when ready`;showPostSave(modal,cap,names);};}
    const note=modal.querySelector('[data-save-note]'),oldNote=note?.onclick;if(note&&oldNote){note.onclick=async e=>{const ids=checkedIds(modal),names=athleteNames(ids),before=new Set((M.state?.captures||[]).map(c=>c.id));await oldNote.call(note,e);const cap=await waitForCapture(before,'note',20);if(cap){clearCaptureSelection(modal);showPostSave(modal,cap,names);}};}
  }

  // ---------------------------------------------------------------------------
  // Swimmer-owned device extension. Only explicitly shared captures render.
  // ---------------------------------------------------------------------------
  function sharedCaptures(ath,session){return(M.state?.captures||[]).filter(c=>c.session_id===session?.id&&captureBelongs(c,ath)&&['shared','swimmer'].includes(c.audience||''));}
  function enhanceSwimmerDevice(){const h=document.querySelector('#swimmerView'),aid=M.state?.settings?.activeUserAthleteId,ath=(M.state?.athletes||[]).find(a=>a.id===aid),s=currentSession();if(!h||!ath||!s||h.querySelector('[data-loop-my-evidence]'))return;const caps=sharedCaptures(ath,s).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),mine=reflectionsFor(ath,s),races=recentRaces(ath);const card=document.createElement('section');card.dataset.loopMyEvidence='1';card.className='page-card loop-my-evidence';card.innerHTML=`<div class="eyebrow">MY SESSION / FEEDBACK</div><h2>${esc(ath.full_name)}</h2><div class="loop-quick"><button data-loop-my-performance>My performance</button><button data-loop-my-meet>Meet</button></div>${caps.length?`<div class="loop-capture-list">${caps.slice(0,6).map(c=>`<article><button data-loop-open-cap="${esc(c.id)}"><b>${esc(captureTitle(c))}</b>${captureNote(c)?`<small>${esc(captureNote(c))}</small>`:''}</button></article>`).join('')}</div>`:'<p class="muted">No coach-approved captures have been shared from this session yet.</p>'}<div class="loop-reflection-entry"><label>My reflection<textarea data-loop-reflection placeholder="What did I feel / notice / want to ask about?"></textarea></label><button data-loop-save-reflection>Save my input</button></div>${mine.length?`<div class="loop-reflection-history"><b>My recent input</b>${mine.slice(0,3).map(r=>`<small>${esc(r.text)}</small>`).join('')}</div>`:''}${races.length?`<details><summary>My recent races</summary>${races.map(x=>`<div class="loop-race-row"><b>${esc(x.entry.event||`${x.entry.distance||''} ${x.entry.stroke||''}`)}</b><span>${x.race.result_seconds?clock(x.race.result_seconds):'Result saved'} · ${esc(x.meet.title||x.meet.name||'Meet')}</span></div>`).join('')}</details>`:''}`;h.prepend(card);card.querySelector('[data-loop-my-performance]')?.addEventListener('click',()=>go('athletes'));card.querySelector('[data-loop-my-meet]')?.addEventListener('click',()=>go('meet'));card.querySelectorAll('[data-loop-open-cap]').forEach(b=>b.onclick=()=>M.captureUI?.openEvidence?.(b.dataset.loopOpenCap));card.querySelector('[data-loop-save-reflection]')?.addEventListener('click',()=>{const value=text(card.querySelector('[data-loop-reflection]')?.value);if(!value)return M.toast?.('Add a reflection first');ensureReflections().push({id:U.uid?U.uid('reflection'):`reflection-${Date.now()}`,athlete_id:ath.id,session_id:s.id,capture_id:caps[0]?.id||null,label:'Swimmer reflection',text:value,audience:'shared',created_at:now(),updated_at:now()});saveUi();M.toast?.('Your reflection is saved');card.remove();enhanceSwimmerDevice();});}

  // ---------------------------------------------------------------------------
  // Meet intake: make PDF/photo/text selection possible without pretending the
  // browser extracted content it cannot verify. Text is reviewable immediately;
  // PDF/photo source is retained as a pending source record for later extraction.
  // ---------------------------------------------------------------------------
  function ensureMeetImports(){if(!Array.isArray(M.state.meetImports))M.state.meetImports=[];return M.state.meetImports}
  const MEET_SOURCE_DB='mclay_swimming_v4_meet_sources',MEET_SOURCE_STORE='sources';
  function openMeetSourceDb(){return new Promise((resolve,reject)=>{try{const r=indexedDB.open(MEET_SOURCE_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(MEET_SOURCE_STORE))r.result.createObjectStore(MEET_SOURCE_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Meet source store unavailable'));}catch(e){reject(e)}})}
  async function storeMeetBlob(id,file){const db=await openMeetSourceDb();return new Promise((resolve,reject)=>{const tx=db.transaction(MEET_SOURCE_STORE,'readwrite');tx.objectStore(MEET_SOURCE_STORE).put({blob:file,name:file.name||'',mime:file.type||'',saved_at:now()},id);tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('Meet source save failed'))};});}
  async function readMeetBlob(id){const db=await openMeetSourceDb();return new Promise((resolve,reject)=>{const tx=db.transaction(MEET_SOURCE_STORE,'readonly'),q=tx.objectStore(MEET_SOURCE_STORE).get(id);q.onsuccess=()=>{const v=q.result||null;db.close();resolve(v)};q.onerror=()=>{const e=q.error;db.close();reject(e||new Error('Meet source read failed'))};});}
  function addMeetSource(file){const meet=M.meet?.current?.(),row={id:U.uid?U.uid('meet-source'):`meet-source-${Date.now()}`,meet_id:meet?.id||'',name:file.name||'Meet source',mime:file.type||'',size:Number(file.size)||0,status:/text|csv|json/.test(file.type||'')?'review_text':'source_attached',source_stored:false,created_at:now(),text:''};ensureMeetImports().push(row);saveUi();return row;}
  async function showStoredMeetSource(row){try{const saved=await readMeetBlob(row.id);if(!saved?.blob)throw new Error('Source blob not found on this device');const url=URL.createObjectURL(saved.blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){M.toast?.(e.message||String(e));}}
  async function handleMeetFile(file,box){if(!file)return;const row=addMeetSource(file),status=box.querySelector('[data-loop-meet-source-status]');try{await storeMeetBlob(row.id,file);row.source_stored=true;saveUi();}catch(e){row.source_store_error=text(e.message||e);saveUi();}
    const view=`<button type=\"button\" data-loop-view-meet-source>View original source</button>`;
    if(/text|csv|json/.test(file.type||'')||/\.(txt|csv|json)$/i.test(file.name||'')){try{row.text=await file.text();row.status='review_text';saveUi();status.innerHTML=`<b>${esc(file.name)}</b><small>Original source saved locally · text loaded for review</small>${view}<textarea data-loop-meet-paste>${esc(row.text.slice(0,12000))}</textarea>`;}catch(e){row.status='read_error';saveUi();status.textContent=`Could not read ${file.name}: ${e.message||e}`;}}
    else if(/^image\//i.test(file.type||'')&&M.intake?.transcribe){status.innerHTML=`<b>${esc(file.name)}</b><small>Original image saved locally · extracting text for review…</small>${view}`;try{const tr=await M.intake.transcribe(file,'photo'),raw=text(tr?.rawText||tr?.raw_text||'');row.text=raw;row.status=raw?'review_text':'source_attached';saveUi();status.innerHTML=`<b>${esc(file.name)}</b><small>Original image saved locally · ${raw?'extracted text ready for review':'no readable text returned'}</small>${view}${raw?`<textarea data-loop-meet-paste>${esc(raw.slice(0,12000))}</textarea>`:'<p>Keep the source attached and enter programme details manually if needed.</p>'}`;}catch(e){row.status='source_attached';row.extract_error=text(e.message||e);saveUi();status.innerHTML=`<b>${esc(file.name)}</b><small>Original image saved locally · extraction needs review</small>${view}<p>${esc(e.message||e)}</p>`;}}
    else{status.innerHTML=`<b>${esc(file.name)}</b><small>Original source ${row.source_stored?'saved locally':'identified'} · ${esc(file.type||'file')} · ${(row.size/1024).toFixed(0)} KB</small>${view}<p>MSOS will not invent entries from an unread PDF. The original source is retained on this device; paste programme text if available or keep it queued for extraction/review.</p>`;}
    status.querySelector('[data-loop-view-meet-source]')?.addEventListener('click',()=>showStoredMeetSource(row));}
  function installMeetIntake(){const h=document.querySelector('#meetView');if(!h||h.querySelector('[data-loop-meet-intake]'))return;const role=M.access?.role?.()||'owner';if(role!=='owner')return;const card=document.createElement('section');card.dataset.loopMeetIntake='1';card.className='page-card loop-meet-intake';card.innerHTML=`<div class="eyebrow">MEET INTAKE</div><h2>Add programme / entries</h2><p class="muted">PDF, photo, text or CSV. Source first → review → commit. Unknown content is never guessed.</p><div class="loop-quick"><button data-loop-meet-file>Choose file</button><button data-loop-meet-paste-btn>Paste text</button></div><input data-loop-meet-file-input type="file" accept="application/pdf,.pdf,image/*,.txt,.csv,text/plain,text/csv" hidden><div data-loop-meet-source-status></div>`;h.prepend(card);const input=card.querySelector('[data-loop-meet-file-input]');card.querySelector('[data-loop-meet-file]').onclick=()=>input.click();input.onchange=()=>handleMeetFile(input.files?.[0],card);card.querySelector('[data-loop-meet-paste-btn]').onclick=()=>{const target=card.querySelector('[data-loop-meet-source-status]');target.innerHTML='<label>Paste programme / entry text<textarea data-loop-meet-paste rows="8" placeholder="Paste meet programme or swimmer entries here"></textarea></label><button data-loop-meet-save-text>Save source text</button>';target.querySelector('[data-loop-meet-save-text]').onclick=()=>{const value=text(target.querySelector('[data-loop-meet-paste]')?.value);if(!value)return M.toast?.('Paste some meet text first');const row={id:U.uid?U.uid('meet-source'):`meet-source-${Date.now()}`,meet_id:M.meet?.current?.()?.id||'',name:'Pasted meet text',mime:'text/plain',size:value.length,status:'review_text',created_at:now(),text:value};ensureMeetImports().push(row);saveUi();M.toast?.('Meet source text saved for review');};};}

  // Install wrappers after all existing v4 engines so we extend rather than
  // replace the proven Board/pathway/capture foundations.
  const baseBoard=UI.renderBoard?.bind(UI),baseAthletes=UI.renderAthletes?.bind(UI),baseSwimmer=UI.renderSwimmer?.bind(UI),baseMeet=UI.renderMeet?.bind(UI),baseOpenCapture=M.actions.openCapture?.bind(M.actions);
  UI.renderHub=renderCoachHub;
  // Hub stall notice: shown on the Board (which opens fine) when the previous Coach Hub attempt never
  // finished, so the exact stuck stage is visible even if Hub itself can't open. Dismissible; diagnostic
  // only -- it never changes the session, Roll or view.
  function installHubStallNotice(){const host=document.querySelector('#boardView');if(!host)return;host.querySelector('[data-loop-hub-stall]')?.remove();const st=hubCrumb().lastStall;if(!st||st.acknowledged)return;const sec=document.createElement('section');sec.dataset.loopHubStall='1';sec.className='page-card';sec.innerHTML=`<div class="eyebrow">COACH HUB · DIDN'T FINISH LAST TIME</div><p>Stuck at: <b>${esc(st.label)}</b></p><p class="muted">${esc([st.at,st.build,`storage ${st.storage}`].filter(Boolean).join(' · '))}</p><div class="loop-quick"><button data-loop-hub-stall-ok>Got it</button></div>`;host.prepend(sec);const ok=sec.querySelector('[data-loop-hub-stall-ok]');if(ok)ok.onclick=()=>{acknowledgeStall();sec.remove();};}
  L.installHubStallNotice=installHubStallNotice;
  if(baseBoard)UI.renderBoard=()=>{baseBoard();installBoardAthletes();try{installHubStallNotice()}catch{}};
  // Record the tap itself (capture phase, before navigation runs) so a freeze between the tap and the
  // Hub starting to draw is distinguishable from a freeze inside the Hub.
  try{g.document?.addEventListener?.('click',e=>{if(e?.target?.closest?.('[data-nav="hub"]'))setStage('nav:tap');},true);}catch{}
  try{hubCrumb();}catch{}
  if(baseAthletes)UI.renderAthletes=()=>{baseAthletes();enhanceAthleteToday();observeAthletes();};
  if(M.performanceUI)M.performanceUI.render=UI.renderAthletes;
  if(baseSwimmer)UI.renderSwimmer=()=>{baseSwimmer();enhanceSwimmerDevice();};
  if(baseMeet)UI.renderMeet=()=>{baseMeet();installMeetIntake();};
  if(baseOpenCapture)M.actions.openCapture=ctx=>{const r=baseOpenCapture(ctx);queueMicrotask(()=>upgradeCaptureModal(document.querySelector('#modalHost .modal')));return r;};

  addEventListener('msos:evidence-ready',()=>{if(M.state?.settings?.view==='athletes')queueMicrotask(enhanceAthleteToday)});
  addEventListener('msos:data-updated',()=>{if(M.state?.settings?.view==='hub')queueMicrotask(renderCoachHub)});

  L.checks=()=>({
    build:M.BUILD,
    planBridge:typeof planContext==='function',
    coachHub:UI.renderHub===renderCoachHub,
    captureFastFlow:!!M.actions.openCapture,
    athleteToday:true,
    meetFileAcceptsPdf:true,
    preservesCanonicalSession:true,
    cloudCutoverClaim:false
  });
})(globalThis);
