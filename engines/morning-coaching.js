'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.MorningCoaching=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.2';
  const STORAGE_KEY='mclay_swimming_os_v4';
  const LEGACY_STORAGE_KEY='mclay_swimming_os_v1';
  const REF_DB='mclay_swimming_v4_reference_cache';
  const LEGACY_REF_DB='mclay_swimming_v374_heavy_cache';
  const AEROBIC={
    50:{10:{Regeneration:1.062,Development:1.033,Overload:1.002,Threshold:.969,Clearance:.941},30:{Regeneration:1.02,Development:.989,Overload:.961,Threshold:.931,Clearance:.91},divisor:8},
    100:{10:{Regeneration:1.1165,Development:1.08,Overload:1.05,Threshold:1.024,Clearance:1},30:{Regeneration:1.093,Development:1.048,Overload:1.024,Threshold:.995,Clearance:.972},divisor:4},
    200:{10:{Regeneration:1.1405,Development:1.0945,Overload:1.0687,Threshold:1.0474,Clearance:1.0225},30:{Regeneration:1.1261,Development:1.081,Overload:1.055,Threshold:1.02518,Clearance:1.0087},divisor:2},
    400:{10:{Regeneration:1.156,Development:1.1142,Overload:1.091,Threshold:1.0686,Clearance:1.04759},30:{Regeneration:1.1515,Development:1.103,Overload:1.0731,Threshold:1.0554,Clearance:1.036},divisor:1}
  };
  const OFFICIAL_COURSE_CONVERSIONS=[[50,'Freestyle',.85],[50,'Backstroke',.85],[50,'Butterfly',.70],[50,'Breaststroke',1],[100,'Freestyle',1.70],[100,'Backstroke',1.70],[100,'Butterfly',1.40],[100,'Breaststroke',2],[200,'Freestyle',3.40],[200,'Backstroke',3.40],[200,'Butterfly',2.80],[200,'Breaststroke',4],[200,'IM',3.40],[400,'Freestyle',6.80],[400,'IM',6.80],[800,'Freestyle',13.60],[1500,'Freestyle',25.50]].map(([distance,stroke,seconds])=>({from:'SCM',to:'LCM',distance,stroke,seconds,source:'Swimming NZ official conversion table'}));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const key=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const clock=sec=>{sec=Number(sec);if(!Number.isFinite(sec))return'—';const m=Math.floor(sec/60),s=sec-m*60,txt=s.toFixed(Math.abs(s-Math.round(s))>.0001?1:0);return m?`${m}:${txt.padStart(txt.includes('.')?4:2,'0')}`:txt};
  const isSophie=a=>/^sophie?newlove$/.test(key(a?.full_name));
  const normaliseStroke=s=>{const x=text(s).toLowerCase();if(!x)return'Freestyle';if(/^(?:free|freestyle|fr)$/.test(x))return'Freestyle';if(/^(?:back|backstroke|bk)$/.test(x))return'Backstroke';if(/^(?:breast|breaststroke|br)$/.test(x))return'Breaststroke';if(/^(?:fly|butterfly)$/.test(x))return'Butterfly';if(/^(?:im|medley|individual medley)$/.test(x))return'IM';return text(s)};
  const resultSeconds=row=>Number(row?.result_seconds||row?.time_seconds||row?.seconds||row?.result_time_seconds||row?.pb_seconds||row?.best_time_seconds);
  const pbCourse=row=>text(row?.pool_course||row?.course).toUpperCase();
  const pbDistance=row=>Number(row?.distance||row?.event_distance);
  const pbStroke=row=>normaliseStroke(row?.stroke||row?.event_stroke||'');
  const points=row=>Number(row?.wa_points??row?.world_aquatics_points??row?.para_points??row?.points??row?.point_score);

  function blankState(){return{athletes:[],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],adaptationOverrides:[],coachResults:[],resultsEventHistory:[],resultsPbBoard:[],courseConversions:[],_refs:{}}}
  function mergeRows(a=[],b=[]){
    const map=new Map();
    for(const x of [...(a||[]),...(b||[])]){if(!x)continue;const id=x.id||JSON.stringify([x.athlete_id,x.test_type_id,x.result_date,x.distance,x.stroke,x.result_seconds,x.full_name]);map.set(id,x)}
    return [...map.values()];
  }
  function mergeLegacyEvidence(state,legacy){
    if(!legacy||typeof legacy!=='object')return state;
    state.athletes=mergeRows(state.athletes,legacy.athletes);
    state.trainingTestTypes=mergeRows(state.trainingTestTypes||state.training_test_types,legacy.training_test_types);
    state.trainingTestResults=mergeRows(state.trainingTestResults||state.training_test_results,legacy.training_test_results);
    state.adaptationProfiles=mergeRows(state.adaptationProfiles||state.athlete_adaptation_profiles,legacy.athlete_adaptation_profiles);
    state.coachResults=mergeRows(state.coachResults||state.coach_results,legacy.coach_results);
    return state;
  }
  function readDb(name){
    return new Promise(resolve=>{
      try{
        const req=indexedDB.open(name);
        req.onerror=()=>resolve(null);
        req.onupgradeneeded=()=>{try{req.transaction.abort()}catch{};resolve(null)};
        req.onsuccess=()=>{
          const db=req.result;if(!db.objectStoreNames.contains('state')){db.close();resolve(null);return}
          const q=db.transaction('state','readonly').objectStore('state').get('latest');
          q.onerror=()=>{db.close();resolve(null)};
          q.onsuccess=()=>{const row=q.result||null;db.close();resolve(row?.payload||null)};
        };
      }catch{resolve(null)}
    });
  }
  async function loadState(){
    let state=blankState();
    try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(x&&typeof x==='object')state={...state,...x}}catch{}
    try{mergeLegacyEvidence(state,JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)||'null'))}catch{}
    let refs=await readDb(REF_DB);if(!refs)refs=await readDb(LEGACY_REF_DB);refs=refs||{};
    state._refs=refs;
    state.trainingTestTypes=mergeRows(state.trainingTestTypes,refs.training_test_types);
    state.trainingTestResults=mergeRows(state.trainingTestResults,refs.training_test_results);
    state.adaptationProfiles=mergeRows(state.adaptationProfiles,refs.athlete_adaptation_profiles);
    state.coachResults=mergeRows(state.coachResults||state.coach_results,refs.coach_results);
    state.resultsEventHistory=mergeRows(state.resultsEventHistory||state.results_event_history,refs.results_event_history);
    state.resultsPbBoard=mergeRows(state.resultsPbBoard||state.results_pb_board,refs.results_pb_board);
    state.athletes=(state.athletes||[]).filter(a=>a&&a.active!==false&&!isSophie(a));
    return state;
  }
  function activeAthletes(state){return(state?.athletes||[]).filter(a=>a.active!==false&&!isSophie(a)).sort((a,b)=>text(a.squad).localeCompare(text(b.squad))||text(a.full_name).localeCompare(text(b.full_name)))}

  function profile(athlete,state){
    const rows=state?.adaptationProfiles||state?.athlete_adaptation_profiles||[],p=rows.find(x=>x.athlete_id===athlete.id&&x.active!==false);
    let ratio=Number(p?.default_volume_ratio);if(!Number.isFinite(ratio)||ratio<=0)ratio=1;
    const k=key(athlete.full_name),fallbacks={charlottemurphy:.50,conorfischer:.50,mckenziedrage:2/3,amberproudfoot:2/3,matthewkofoed:2/3,rubystace:2/3};
    if(ratio===1&&fallbacks[k])ratio=fallbacks[k];
    const returnToStart=p?.return_to_starting_end===true||k==='charlottemurphy'||k==='mckenziedrage';
    return{ratio:Math.max(.25,Math.min(1,ratio)),label:p?.profile_label||athlete.modifications||'',key:k,returnToStart,roundUpReturn:k==='mckenziedrage'};
  }
  function poolLength(session){return /LCM/i.test(text(session?.identity?.course))?50:25}
  function nearestDistance(distance,ratio,session,returnToStart,roundUpReturn=false){
    if(ratio>=.98)return Number(distance)||0;
    const pool=poolLength(session),unit=returnToStart?pool*2:pool,target=Math.max(pool,Number(distance||0)*ratio),steps=roundUpReturn?Math.ceil(target/unit):Math.round(target/unit);
    return Math.max(unit,steps*unit);
  }
  function scaleReps(reps,distance,ratio,session,returnToStart){
    reps=Math.max(1,Number(reps)||1);if(ratio>=.98)return reps;
    const target=reps*Math.max(0,Number(distance)||0)*ratio;
    if(!returnToStart||!distance)return Math.max(1,Math.round(reps*ratio));
    const unit=poolLength(session)*2,candidates=[];
    for(let r=1;r<=reps;r++){const metres=r*distance;if(Math.abs((metres/unit)-Math.round(metres/unit))<1e-9)candidates.push({r,delta:Math.abs(metres-target),metres})}
    if(!candidates.length)return Math.max(1,Math.round(reps*ratio));
    candidates.sort((a,b)=>a.delta-b.delta||a.metres-b.metres);return candidates[0].r;
  }
  function structuredQuality(item){
    const raw=[item?.raw,item?.text,...(item?.cues||[]),...(item?.pattern||[]).map(x=>x.text||'')].filter(Boolean).join(' '),distance=Number(item?.distance)||0,reps=Number(item?.reps)||1;
    if(item?.zone||/\b(?:regeneration|development|overload|threshold|clearance|aerobic|capacity|vo2)\b/i.test(raw))return false;
    return distance>0&&distance<=100&&reps<=4&&/\b(?:descend|build|fast|max|sprint|race|pace|quality|underwater|drill|scull|skill|turn|start)\b/i.test(raw);
  }
  function sameTeamExposure(item){
    if(structuredQuality(item))return true;
    const raw=[item?.raw,item?.text,item?.zone,...(item?.cues||[])].filter(Boolean).join(' '),distance=Number(item?.distance)||0,reps=Number(item?.reps)||1;
    if(distance<=0||distance>50||reps>20)return false;
    if(/\b(?:regeneration|development|overload|threshold|clearance|aerobic|capacity|vo2)\b/i.test(raw))return false;
    return /\b(?:max|sprint|race|pace|quality|fast|underwater|drill|scull|skill|build|turn|start)\b/i.test(raw);
  }
  function constrain(item,athlete){
    const k=key(athlete.full_name),raw=text(item.raw||item.text),x=clone(item);
    if(k==='conorfischer'&&/\b(?:breaststroke|breast|br)\b/i.test(raw)&&/\bfins?\b/i.test(raw)){x.stroke='Choice';x.raw=`${x.reps} × ${x.distance} Choice non-Breaststroke with Fins`;x.adaptationReason='No Breaststroke kick with fins';return x}
    if(k==='amberproudfoot'&&/\b(?:kick|fins?|underwater|dive|start)\b/i.test(raw)){x.stroke='Choice';x.equipment=(x.equipment||[]).filter(z=>!/Fins/i.test(z));x.raw=`${x.reps} × ${x.distance} Upper-body equivalent · same work window`;x.adaptationReason='Upper-body equivalent';return x}
    return x;
  }
  function adaptItem(item,athlete,state,session){
    if(item?.kind==='cue')return clone(item);
    if(item?.kind==='group'){const g=clone(item);g.items=(item.items||[]).map(x=>adaptItem(x,athlete,state,session));return g}
    const p=profile(athlete,state),x=constrain(item,athlete),keep=sameTeamExposure(item),beforeR=Number(x.reps)||1,beforeD=Number(x.distance)||0;
    if(!keep&&p.ratio<.98){
      if(beforeR===1&&beforeD>=100)x.distance=nearestDistance(beforeD,p.ratio,session,p.returnToStart,p.roundUpReturn);
      else x.reps=scaleReps(beforeR,beforeD,p.ratio,session,p.returnToStart);
    }
    const changed=(Number(x.reps)||1)!==beforeR||(Number(x.distance)||0)!==beforeD||text(x.raw)!==text(item.raw);
    if(changed&&!x.adaptationReason)x.adaptationReason=`${Math.round(p.ratio*100)}% profile${p.returnToStart?' · return to start end':''}`;
    if(!changed&&keep)x.adaptationReason='Same team exposure';
    if(p.key==='mckenziedrage'&&Number(x.distance)===75&&/\b(?:fast|max|race|quality|pace)\b/i.test(text(x.raw||item.raw))){
      const c=Number(x.cycleSeconds)||0;if(c<115)x.cycleSeconds=115;
      x.adaptationReason=[x.adaptationReason,'Fast 75 · 1:55 minimum'].filter(Boolean).join(' · ');
    }
    return x;
  }
  function samePrescription(a,b){
    return Number(a?.reps||1)===Number(b?.reps||1)&&Number(a?.distance||0)===Number(b?.distance||0)&&normaliseStroke(a?.stroke||'')===normaliseStroke(b?.stroke||'')&&Number(a?.restSeconds||0)===Number(b?.restSeconds||0)&&Number(a?.cycleSeconds||0)===Number(b?.cycleSeconds||0)&&text(a?.raw)===text(b?.raw);
  }

  function typeKey(state,row){
    const types=state?.trainingTestTypes||state?.training_test_types||[];
    const type=types.find(x=>x.id===row?.test_type_id)||{};
    return [type.test_key,type.name,type.label,type.test_name,row?.test_key,row?.name,row?.label,row?.test_name,row?.source_label,row?.metadata?.test_key,row?.metadata?.test_name].map(text).filter(Boolean).join(' ');
  }
  function isT400Row(state,row){const k=typeKey(state,row).toLowerCase().replace(/[_-]+/g,' ');return /\bt\s*400\b/.test(k)||/\b400\s*m?\s*(?:time\s*trial|tt)\b/.test(k)}
  function testStroke(state,row){
    const k=typeKey(state,row).toLowerCase();
    if(!isT400Row(state,row))return'';
    const explicit=text(row?.stroke||row?.event_stroke||row?.metadata?.stroke);if(explicit)return normaliseStroke(explicit);
    if(/(?:^|[_\s-])(?:free|freestyle)(?:$|[_\s-])/.test(k))return'Freestyle';
    if(/back/.test(k))return'Backstroke';if(/breast/.test(k))return'Breaststroke';if(/(?:fly|butterfly)/.test(k))return'Butterfly';if(/(?:^|[_\s-])im(?:$|[_\s-])|medley/.test(k))return'IM';
    return'Freestyle';
  }
  function t400(athlete,state,course='',stroke='Freestyle'){
    const wanted=normaliseStroke(stroke),rows=state?.trainingTestResults||state?.training_test_results||[];
    const found=rows.filter(r=>r.athlete_id===athlete?.id).filter(r=>isT400Row(state,r)).filter(r=>testStroke(state,r)===wanted).filter(r=>r.valid_for_anchor!==false).filter(r=>!course||text(r.pool_course||r.course||r.metadata?.pool_course||'SCM').toUpperCase()===text(course).toUpperCase()).filter(r=>Number.isFinite(resultSeconds(r))).sort((a,b)=>resultSeconds(a)-resultSeconds(b)||String(b.result_date||'').localeCompare(String(a.result_date||'')))[0]||null;
    if(found)return found;
    if(key(athlete?.full_name)==='mollymckernan'&&wanted==='Freestyle')return{athlete_id:athlete.id,result_seconds:324.6,pool_course:course||'SCM',valid_for_anchor:true,source_label:'Coach-confirmed T400 5:24.6'};
    return null;
  }
  function practicalSendOff(targetSeconds,restSeconds){
    const t=Number(targetSeconds),r=Math.max(0,Number(restSeconds)||0);if(!Number.isFinite(t))return null;
    return Math.ceil((Math.floor(t)+r)/5)*5;
  }
  function aerobic(anchor,distance,zone,authoredRest=10){
    const d=Number(distance),baseDistance=[50,100,200,400].includes(d)?d:d<50?50:d<100?100:d<200?200:400,table=AEROBIC[baseDistance];if(!table||!zone||!Number.isFinite(d)||d<=0||d>400)return null;const rest=Math.max(0,Number(authoredRest)||0),modelRest=rest>=20?30:10,coef=table[modelRest]?.[zone];if(!coef)return null;
    const seconds=(Number(anchor)/table.divisor)*coef*(d/baseDistance);
    return{seconds,authoredRest:rest,sendOff:practicalSendOff(seconds,rest),modelRest,sourceModel:baseDistance===d?`T400 ${d}m ${zone}`:`T400 ${baseDistance}m ${zone} speed scaled to ${d}m`};
  }
  function convert(seconds,from,to,distance,stroke,state={}){
    if(from===to)return{seconds:Number(seconds),source:'Exact course'};
    const rows=[...(state.courseConversions||state.xlr8_course_conversions||[]),...OFFICIAL_COURSE_CONVERSIONS],norm=x=>text(x).toUpperCase(),st=normaliseStroke(stroke).toLowerCase();
    let r=rows.find(x=>norm(x.from_course||x.from)===norm(from)&&norm(x.to_course||x.to)===norm(to)&&Number(x.distance)===Number(distance)&&normaliseStroke(x.stroke).toLowerCase()===st&&x.active!==false);
    if(r){const mul=Number(r.multiplier??1),adj=Number(r.seconds_adjustment??r.seconds??0);return{seconds:Number(seconds)*mul+adj,source:r.label||r.source_name||r.source||'Verified course conversion'}}
    r=rows.find(x=>norm(x.from_course||x.from)===norm(to)&&norm(x.to_course||x.to)===norm(from)&&Number(x.distance)===Number(distance)&&normaliseStroke(x.stroke).toLowerCase()===st&&x.active!==false);
    if(r){const mul=Number(r.multiplier??1),adj=Number(r.seconds_adjustment??r.seconds??0);return{seconds:(Number(seconds)-adj)/mul,source:`Inverse · ${r.label||r.source_name||r.source||'verified course conversion'}`}}
    return null;
  }
  function pbPools(state){return[...(state?.coachResults||state?.coach_results||[]),...(state?.resultsEventHistory||state?.results_event_history||[]),...(state?.resultsPbBoard||state?.results_pb_board||[])]}
  function rawExactPb(ath,state,{distance,stroke,course}){
    const wanted=normaliseStroke(stroke),c=text(course).toUpperCase();
    return pbPools(state).filter(r=>r.athlete_id===ath?.id).filter(r=>pbDistance(r)===Number(distance)).filter(r=>!wanted||pbStroke(r)===wanted).filter(r=>!c||!pbCourse(r)||pbCourse(r)===c).filter(r=>Number.isFinite(resultSeconds(r))).sort((a,b)=>resultSeconds(a)-resultSeconds(b))[0]||null;
  }
  function pb(ath,state,spec){
    const wanted={...spec,stroke:normaliseStroke(spec.stroke)},exact=rawExactPb(ath,state,wanted);
    if(exact)return{...exact,_anchor_seconds:resultSeconds(exact),_anchor_source:`${wanted.course} ${wanted.distance} ${wanted.stroke} PB`};
    const other=wanted.course==='SCM'?'LCM':wanted.course==='LCM'?'SCM':'';if(!other)return null;
    const p=rawExactPb(ath,state,{...wanted,course:other});if(!p)return null;const c=convert(resultSeconds(p),other,wanted.course,wanted.distance,wanted.stroke,state);
    return c?{...p,_anchor_seconds:c.seconds,_anchor_source:`${other} PB → ${wanted.course} · ${c.source}`}:null;
  }
  function bestStroke(ath,state,course='',nonFree=false){
    const rows=pbPools(state).filter(r=>r.athlete_id===ath?.id).filter(r=>!course||!pbCourse(r)||pbCourse(r)===text(course).toUpperCase()).map(r=>({stroke:pbStroke(r),score:points(r),seconds:resultSeconds(r)})).filter(x=>['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(x.stroke)).filter(x=>!nonFree||x.stroke!=='Freestyle');
    const scored=rows.filter(x=>Number.isFinite(x.score)&&x.score>0).sort((a,b)=>b.score-a.score||a.seconds-b.seconds);if(scored.length)return scored[0].stroke;
    const explicit=normaliseStroke(ath?.preferred_stroke||ath?.best_stroke||ath?.stroke||'');return['Freestyle','Backstroke','Breaststroke','Butterfly'].includes(explicit)&&(!nonFree||explicit!=='Freestyle')?explicit:'';
  }
  function aerobicStroke(item){
    const s=text(item?.stroke);if(/^Choice$/i.test(s))return'';if(s){const n=normaliseStroke(s);if(['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(n))return n}return'Freestyle';
  }
  function raceStroke(item,ath,state,course,explicit=''){
    if(explicit)return normaliseStroke(explicit);
    const raw=text(item?.raw||item?.text);if(/#\s*1F\b/i.test(raw))return bestStroke(ath,state,course,true);if(/#\s*1\b/i.test(raw))return bestStroke(ath,state,course,false);
    const st=text(item?.stroke);if(st){const n=normaliseStroke(st);if(['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(n))return n}
    return bestStroke(ath,state,course,false);
  }
  function suppressPace(item){
    const raw=[item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '),hasRace=!!item?.raceIntent||item?.repInstructions?.some(x=>x.raceIntent);
    if(/\bHR\s*Gauge\b/i.test(raw))return'HR Gauge';if(hasRace)return'';if(/^Choice$/i.test(text(item?.stroke))||/\bChoice\b/i.test(raw))return'Choice work';if(/\b(?:Drill|Scull|Technique)\b/i.test(raw))return'Skill / drill';if(/\b(?:Easy|Recovery|Reset|Warm\s*-?\s*down|Cool\s*-?\s*down|5HR)\b/i.test(raw))return'Recovery / reset';if(/\bKick\b/i.test(raw))return'Kick';if(/\b(?:Paddles?|Bands?\s*Only)\b/i.test(raw)&&!item?.zone)return'Equipment / non-pace';if(/\b(?:Underwater|Dive|Start|Finish|Last\s*\d+\s*m|Max|Sprint)\b/i.test(raw)&&!item?.zone)return'Quality / skill';return'';
  }
  function racePaceTarget(pbSeconds,eventDistance,workDistance,{item,athlete,stroke}={}){
    const total=Number(pbSeconds),event=Number(eventDistance),work=Number(workDistance);if(!Number.isFinite(total)||!event||!work)return null;
    const raw=text(item?.raw||item?.text),workStroke=text(item?.stroke);
    if(stroke==='IM'&&workStroke&&normaliseStroke(workStroke)!=='IM')return{missing:true,message:'Exact IM leg race model not loaded'};
    const sex=text(athlete?.sex||athlete?.gender).toUpperCase();
    if(event===100&&stroke==='Freestyle'&&/^M(?:ALE)?$/.test(sex)){
      if(/\b(?:first|1st)\s*50\b/i.test(raw))return{seconds:total*.4754,source:'100 Free first 50 model'};
      if(/\b(?:second|2nd|last)\s*50\b/i.test(raw))return{seconds:total*.5246,source:'100 Free second 50 model'};
      if(/\b(?:dive|race\s*start|start)\b/i.test(raw)&&work<=25){const first50=total*.4754,dive25=first50*.4554;return{seconds:dive25*(work/25),source:'100 Free start model'}}
      if(/\bpush\b/i.test(raw)&&work===50){const first50=total*.4754,dive25=first50*.4554;return{seconds:(first50-dive25)*2,source:'100 Free push-first-50 estimate'}}
    }
    if(/\b(?:first|1st|second|2nd|last|final|dive|race\s*start|start|push|turn|finish)\b/i.test(raw))return{missing:true,message:'Exact race-model segment not loaded'};
    return{seconds:total*(work/event),source:'PB race-pace average'};
  }
  function targetForItem(session,item,athlete,state){
    if(item?.targetSeconds)return{status:'ok',seconds:Number(item.targetSeconds),sendOff:item.cycleSeconds||null,source:'Coach target'};
    const suppressed=suppressPace(item);if(suppressed)return{status:'none',reason:suppressed};
    const course=session?.identity?.course||'SCM';
    if(item?.repInstructions?.some(x=>x.raceIntent)){
      const rows=[];
      for(const rep of item.repInstructions){
        if(!rep.raceIntent){rows.push({rep:rep.rep,status:'none',label:rep.label||'Drill'});continue}
        const st=raceStroke({...item,raw:`${item.raw||''} ${rep.label||''}`},athlete,state,course,rep.raceIntent.eventStroke||item.raceIntent?.eventStroke||'');
        if(!st){rows.push({rep:rep.rep,status:'missing',message:'No #1 stroke evidence'});continue}
        const p=pb(athlete,state,{distance:rep.raceIntent.distance,stroke:st,course});if(!p){rows.push({rep:rep.rep,status:'missing',message:`${st} PB unavailable`});continue}
        const rp=racePaceTarget(p._anchor_seconds,rep.raceIntent.distance,item.distance,{item:{...item,raw:`${item.raw||''} ${rep.label||''}`},athlete,stroke:st});
        if(rp?.missing){rows.push({rep:rep.rep,status:'missing',message:rp.message});continue}
        rows.push({rep:rep.rep,status:'ok',seconds:rp.seconds,sendOff:item.cycleSeconds||null,source:`${p._anchor_source} · ${rp.source}`});
      }
      return{status:'rep_race',rows};
    }
    if(item?.repPattern?.length){
      const st=aerobicStroke(item);if(!st)return{status:'none',reason:'Choice aerobic work'};const a=t400(athlete,state,course,st);if(!a)return{status:'missing',message:`No ${st} T400 loaded`};const rest=item.restSeconds??10;
      return{status:'pattern',rows:item.repPattern.map(p=>({rep:p.rep,zone:p.zone,...aerobic(Number(a.result_seconds),item.distance,p.zone,rest)})),source:`${st} T400 ${clock(a.result_seconds)}`};
    }
    if(item?.zone){
      const st=aerobicStroke(item);if(!st)return{status:'none',reason:'Choice aerobic work'};const anchor=t400(athlete,state,course,st);if(!anchor)return{status:'missing',message:`No ${st} T400 loaded`};
      const a=aerobic(Number(anchor.result_seconds),item.distance,item.zone,item.restSeconds??10);return a?{status:'ok',...a,source:`${st} T400 ${clock(anchor.result_seconds)}`}:{status:'missing',message:'No valid T400 coefficient'};
    }
    if(item?.raceIntent){
      const st=raceStroke(item,athlete,state,course,item.raceIntent.eventStroke||'');if(!st)return{status:'missing',message:'No #1 stroke evidence'};
      const p=pb(athlete,state,{distance:item.raceIntent.distance,stroke:st,course});if(!p)return{status:'missing',message:`${st} PB unavailable`};
      const rp=racePaceTarget(p._anchor_seconds,item.raceIntent.distance,item.distance,{item,athlete,stroke:st});if(rp?.missing)return{status:'missing',message:rp.message};
      return{status:'ok',seconds:rp.seconds,sendOff:item.cycleSeconds||null,source:`${p._anchor_source} · ${rp.source}`};
    }
    return{status:'none'};
  }

  return{VERSION,loadState,activeAthletes,profile,adaptItem,samePrescription,t400,aerobic,pb,targetForItem,normaliseStroke,clock,internals:{key,sameTeamExposure,structuredQuality,practicalSendOff,bestStroke,racePaceTarget,mergeLegacyEvidence,nearestDistance}};
});
