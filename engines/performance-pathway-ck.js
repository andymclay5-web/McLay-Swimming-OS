'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence,P=M?.performanceEngine;
  if(!M?.state||!P||!E)return;
  const X=P.pathwayCK={build:'v4-performance-pathway-20260824cv'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const courseOf=r=>text(E.course?.(r)||r?.course||r?.pool_course).toUpperCase();
  const distanceOf=r=>Number(E.distance?.(r)||r?.distance||r?.event_distance);
  const strokeOf=r=>text(E.rowStroke?.(r)||r?.stroke||r?.event_stroke);
  const secondsOf=r=>Number(E.seconds?.(r)||r?.qualifying_seconds||r?.seconds||r?.time_seconds||r?._seconds);
  const dateOf=r=>text(r?.age_date||r?.meet_date||r?.date).slice(0,10);
  const sexKey=v=>{const s=text(v).toUpperCase();if(/^M(?:ALE)?$/.test(s))return'M';if(/^F(?:EMALE)?$/.test(s))return'F';return s;};
  const strokeKey=v=>text(E.stroke?.(v)||v);
  const active=r=>r?.active!==false&&text(r?.version_status||'active').toLowerCase()!=='superseded';
  const today=()=>text(M.currentSession?.()?.identity?.date||new Date().toISOString().slice(0,10)).slice(0,10);
  const standardRows=()=>{try{return M.refs?.get?.('pathway_standards')||[]}catch{return[]}};
  const meetRows=()=>{try{return M.refs?.get?.('pathway_meets')||[]}catch{return[]}};
  function ageOn(dob,when){if(!dob||!when)return null;const b=new Date(`${String(dob).slice(0,10)}T00:00:00Z`),d=new Date(`${String(when).slice(0,10)}T00:00:00Z`);if(!Number.isFinite(b.getTime())||!Number.isFinite(d.getTime()))return null;let a=d.getUTCFullYear()-b.getUTCFullYear();if(d.getUTCMonth()<b.getUTCMonth()||(d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate()))a--;return a;}
  function ageBounds(r){let min=Number(r?.age_min),max=Number(r?.age_max);if(!Number.isFinite(min))min=null;if(!Number.isFinite(max))max=null;const raw=text(r?.age_group);if(min==null&&/^\d+$/.test(raw))min=Number(raw);if(max==null&&/^\d+$/.test(raw))max=Number(raw);return{min,max};}
  function ageFits(r,age){const{min,max}=ageBounds(r);if(age==null)return min==null&&max==null;if(min!=null&&age<min)return false;if(max!=null&&age>max)return false;return true;}
  function programme(r){return text(r?.programme||r?.standard_name||r?.name||r?._label);}
  function kind(r){const k=norm(r?.standard_kind||r?._kind),l=norm(programme(r));if(k==='record'||/record/.test(l))return'record';if(/winner|1st/.test(k+' '+l))return'winner';if(/medal|bronze|silver|gold|3rd/.test(k+' '+l))return'medal';if(/finalist|final|8th/.test(k+' '+l))return'finalist';if(k==='qualifying'||/qualif|division|nzsc|nags|champ/.test(l))return'qualifying';return k||'benchmark';}
  function stageRank(k){return({qualifying:10,finalist:20,medal:30,winner:40,record:50,benchmark:60})[k]||70;}
  function family(label){const n=norm(label);if(/division ii|division 2/.test(n))return'div2';if(/canterbury sc|south island sc/.test(n))return'regional_sc';if(/secondary.*school|nzss/.test(n))return'nzss';if(/national sc|nzsc|new zealand short course/.test(n))return'nzsc';if(/national lc age|nags|age group/.test(n))return'nags';if(/national lc open|nz championships|nz champs|open/.test(n))return'nzopen';if(/world.*short|world sc/.test(n))return'world_sc';if(/world.*long|world lc/.test(n))return'world_lc';if(/olymp/.test(n))return'olympics';return n.replace(/\s+/g,'_');}
  function nativeTrackForFamily(f){if(['nzsc','div2','regional_sc','nzss','world_sc'].includes(f))return'SCM';if(['nags','nzopen','world_lc','olympics'].includes(f))return'LCM';return'';}
  function trackFor(r){const f=family(programme(r)),native=nativeTrackForFamily(f);if(native)return native;const c=courseOf(r);if(c==='SCM'||c==='LCM'||c==='BOTH')return c;return c||'BOTH';}
  function programmePriority(f,track){const scm={div2:10,regional_sc:20,nzss:25,nzsc:30,world_sc:60};const lcm={regional_sc:10,nags:30,nzopen:40,world_lc:60,olympics:80};return(track==='LCM'?lcm:scm)[f]??55;}
  function strengthOrder(a,b,track){const as=Number(a?.seconds),bs=Number(b?.seconds);if(Number.isFinite(as)&&Number.isFinite(bs)&&as!==bs)return bs-as;return programmePriority(a?.family,track)-programmePriority(b?.family,track)||stageRank(a?.kind)-stageRank(b?.kind)||text(a?.label).localeCompare(text(b?.label));}
  function actionOrder(a,b,track){return programmePriority(a?.family,track)-programmePriority(b?.family,track)||stageRank(a?.kind)-stageRank(b?.kind)||strengthOrder(a,b,track);}
  function addYears(date,years){const d=new Date(`${date}T00:00:00Z`);if(!Number.isFinite(d.getTime()))return'';d.setUTCFullYear(d.getUTCFullYear()+years);return d.toISOString().slice(0,10);}
  function latestProgrammeDate(rows){return rows.map(dateOf).filter(Boolean).sort().pop()||'';}
  function futureMeetDate(label,rows,now=today()){
    const f=family(label),matchingMeets=meetRows().filter(m=>family(m?.programme||m?.meet_name||m?.name)===f).map(m=>text(m?.meet_date||m?.date).slice(0,10)).filter(Boolean).sort();
    const exact=matchingMeets.find(d=>d>=now);if(exact)return{date:exact,planningProxy:false,sourceDate:exact};
    const source=latestProgrammeDate(rows)||matchingMeets.pop()||'';if(!source)return{date:'',planningProxy:false,sourceDate:''};
    let d=source,guard=0;while(d<now&&guard++<10)d=addYears(d,1);return{date:d,planningProxy:d!==source,sourceDate:source};
  }
  function sourceSeasonFor(rows){return rows.map(r=>Number(r?.season)).filter(Number.isFinite).sort((a,b)=>b-a)[0]||null;}
  function targetSeason(date){return Number(String(date||'').slice(0,4))||null;}
  function eventMatch(r,event){return distanceOf(r)===Number(event?.distance)&&strokeKey(strokeOf(r))===strokeKey(event?.stroke);}
  function sexMatch(r,ath){const req=sexKey(r?.sex),actual=sexKey(ath?.sex);return!req||req==='OPEN'||req===actual;}
  function paraMatch(r,ath){const pc=text(r?.para_class||r?.classification);return!pc&&!P.isPara?.(ath);}
  function rowsByProgramme(event,ath){const map=new Map();for(const r of standardRows()){if(!active(r)||!eventMatch(r,event)||!sexMatch(r,ath)||!paraMatch(r,ath))continue;const f=family(programme(r));if(!f)continue;if(!map.has(f))map.set(f,[]);map.get(f).push(r);}return map;}
  function chooseProgrammeRows(rows,ath,event,viewCourse,now=today()){
    if(!rows.length)return[];const label=programme(rows[0]),f=family(label),native=nativeTrackForFamily(f),target=futureMeetDate(label,rows,now),age=ageOn(ath?.date_of_birth,target.date),sourceSeason=sourceSeasonFor(rows),targetYr=targetSeason(target.date);
    const sourceYearRows=sourceSeason?rows.filter(r=>Number(r?.season)===sourceSeason):rows;
    const ageRows=sourceYearRows.filter(r=>ageFits(r,age));
    let preferred=ageRows.length?ageRows:sourceYearRows.filter(r=>{const{min,max}=ageBounds(r);return min==null&&max==null;});
    if(native){const nativeRows=preferred.filter(r=>courseOf(r)===native);if(nativeRows.length)preferred=nativeRows;else return[];}
    const wanted=text(viewCourse).toUpperCase();
    const dedupe=new Map();for(const r of preferred){const sec=secondsOf(r);if(!Number.isFinite(sec)||sec<=0)continue;const displayCourse=native||courseOf(r)||wanted,k=`${kind(r)}|${sec.toFixed(2)}|${displayCourse}`;if(dedupe.has(k))continue;dedupe.set(k,{raw:r,label:programme(r),family:f,kind:kind(r),seconds:sec,course:displayCourse,officialCourse:native||trackFor(r)||displayCourse,targetDate:target.date,targetSeason:targetYr,sourceSeason,planningProxy:target.planningProxy,sourceDate:target.sourceDate,ageAtTarget:age,sourceStatus:text(r?.source_status||r?.source_version),sourceUrl:text(r?.source_url)});}
    return[...dedupe.values()];
  }
  function staticDeep(event,viewCourse,ath,now=today()){
    const rows=[...(event?.deeper||[])],out=[];
    for(const r of rows){const sec=Number(r?._seconds??M.pathway?.seconds?.(r));if(!Number.isFinite(sec)||sec<=0)continue;const k=kind(r);if(k==='qualifying')continue;const label=text(r?._label||M.pathway?.standardLabel?.(r)||programme(r)||'Benchmark'),f=family(label),native=nativeTrackForFamily(f),c=native||courseOf(r)||viewCourse;const target=futureMeetDate(label,[r],now),targetYr=targetSeason(target.date);out.push({raw:r,label,family:f,kind:k,seconds:sec,course:c||viewCourse,officialCourse:native||trackFor({...r,programme:label,course:c})||c||viewCourse,targetDate:target.date,targetSeason:targetYr,sourceSeason:Number(r?.season)||null,planningProxy:target.planningProxy,sourceDate:target.sourceDate,ageAtTarget:ageOn(ath?.date_of_birth,target.date),sourceStatus:text(r?.source_status||r?.source_version),sourceUrl:text(r?.source_url)});}
    return out;
  }
  function buildEventLadder(ath,event,{course='',now=today()}={}){
    if(!ath||!event)return{course:text(course).toUpperCase(),steps:[],next:null,tracks:{SCM:[],LCM:[]}};const c=text(course||event?.course||event?.pb?.course||'SCM').toUpperCase(),pbSeconds=Number(event?.pbSeconds??event?.seconds??event?.pb?.result_seconds),byProgramme=rowsByProgramme(event,ath),steps=[];
    for(const rows of byProgramme.values())steps.push(...chooseProgrammeRows(rows,ath,event,c,now));
    steps.push(...staticDeep(event,c,ath,now));
    const seen=new Set(),clean=[];for(const s of steps){const key=`${s.family}|${s.kind}|${s.seconds.toFixed(2)}|${s.course}|${s.targetSeason||''}`;if(seen.has(key))continue;seen.add(key);const achieved=Number.isFinite(pbSeconds)?pbSeconds<=s.seconds:false,gapSeconds=Number.isFinite(pbSeconds)?Math.max(0,pbSeconds-s.seconds):null,gapPercentage=Number.isFinite(gapSeconds)&&s.seconds>0?gapSeconds/s.seconds*100:null;clean.push({...s,achieved,gapSeconds,gapPercentage,displayLabel:s.planningProxy?`${s.label} ${s.targetSeason||''} planning`:s.label});}
    clean.sort((a,b)=>(a.course===c?0:1)-(b.course===c?0:1)||strengthOrder(a,b,c));
    const tracks={SCM:clean.filter(s=>s.course==='SCM'||s.course==='BOTH'),LCM:clean.filter(s=>s.course==='LCM'||s.course==='BOTH')};
    for(const key of ['SCM','LCM'])tracks[key].sort((a,b)=>strengthOrder(a,b,key));
    const currentTrack=tracks[c]||clean,actionable=currentTrack.filter(s=>!s.achieved).slice().sort((a,b)=>actionOrder(a,b,c));
    const next=actionable[0]||null;
    const nextQualifying=actionable.find(s=>s.kind==='qualifying')||null;
    const nextFinal=currentTrack.filter(s=>s.kind==='finalist'&&!s.achieved).slice().sort((a,b)=>strengthOrder(a,b,c))[0]||null;
    const nextMedal=currentTrack.filter(s=>s.kind==='medal'&&!s.achieved).slice().sort((a,b)=>strengthOrder(a,b,c))[0]||null;
    return{course:c,pbSeconds,steps:clean,next,nextQualifying,nextFinal,nextMedal,tracks,athleteAgeNow:ageOn(ath?.date_of_birth,now)};
  }
  function buildAthletePathways(ath,{course='',now=today()}={}){
    const c=text(course||M.state?.settings?.pathwayCourse||M.currentSession?.()?.identity?.course||'SCM').toUpperCase(),ranked=P.rankedEvents?.(ath,M.state,c)||[],profile=M.pathway?.profile?.(ath,c)||{},eventMap=new Map((profile?.events||[]).filter(e=>e?.pb).map(e=>[`${Number(e.pb.distance)}|${strokeKey(e.pb.stroke)}`,e])),events=ranked.map(r=>{const legacy=eventMap.get(`${Number(r.distance)}|${strokeKey(r.stroke)}`)||{pb:{course:r.course||c,distance:r.distance,stroke:r.stroke,result_seconds:r.seconds},qualifying:[],deeper:[]};const ladder=buildEventLadder(ath,{...legacy,distance:r.distance,stroke:r.stroke,pbSeconds:r.seconds,course:r.course||c},{course:c,now});return{...r,ladder};});return{athlete:ath,course:c,events,scm:events.map(e=>({...e,steps:e.ladder.tracks.SCM})),lcm:events.map(e=>({...e,steps:e.ladder.tracks.LCM}))};
  }
  P.pathwayLadderForEvent=buildEventLadder;
  P.pathwaysForAthlete=buildAthletePathways;
  P.projectedMeetDate=futureMeetDate;
  P.ageAt=ageOn;
  P.pathwayFamily=family;
  X.buildEventLadder=buildEventLadder;X.buildAthletePathways=buildAthletePathways;X.futureMeetDate=futureMeetDate;X.ageOn=ageOn;X.strengthOrder=strengthOrder;X.actionOrder=actionOrder;X.nativeTrackForFamily=nativeTrackForFamily;
})(globalThis);
