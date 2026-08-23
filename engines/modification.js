'use strict';
(function(root,factory){
  const api=factory(root.MSOSEngines?.Evidence,root.MSOSEngines?.Aerobic);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Modification=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(E,A){
  const VERSION='3.0.4-ca';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const FIXED={charlottemurphy:.50,conorfischer:.50,mckenziedrage:2/3,mackenziedrage:2/3,amberproudfoot:2/3,matthewkofoed:2/3,rubystace:2/3};
  const ZONES=['Regeneration','Development','Overload','Threshold','Clearance'];
  const AMBER_MODES=Object.freeze([
    {id:'Pull',label:'Pull'},
    {id:'Swim',label:'Swim'},
    {id:'Paddles',label:'Paddles'},
    {id:'Drill',label:'Drill'},
    {id:'Scull',label:'Scull',scullCyclePer50:120,note:'Very slow · allow up to 2:00 per 50'},
    {id:'Body alignment',label:'Body alignment'}
  ]);
  const AMBER_STROKES=Object.freeze(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice']);
  const CONOR_MODES=Object.freeze([
    {id:'Choice non-Breaststroke',label:'Choice non-Breaststroke'},
    {id:'Freestyle',label:'Freestyle'},
    {id:'Backstroke',label:'Backstroke'},
    {id:'Butterfly',label:'Butterfly'}
  ]);
  const cycleClock=s=>`${Math.floor(Number(s||0)/60)}:${String(Math.round(Number(s||0)%60)).padStart(2,'0')}`;
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;

  function profile(ath,state){
    const rows=state?.adaptationProfiles||state?.athlete_adaptation_profiles||[];
    const aliases=E?.athleteAliases?.(ath,state)||new Set([ath?.id]);
    const p=rows.find(x=>aliases.has(x.athlete_id)&&x.active!==false)||{};
    const k=E?.key?.(ath?.full_name)||text(ath?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
    let ratio=Number(p.default_volume_ratio),ratioSource='profile';
    if(!Number.isFinite(ratio)||ratio<=0){
      if(FIXED[k]){ratio=FIXED[k];ratioSource='legacy-load-fallback';}
      else{ratio=1;ratioSource='none';}
    }
    const clipped=Math.max(.25,Math.min(1,ratio));
    const returnToStart=p.return_to_starting_end===false?false:(p.return_to_starting_end===true||clipped<.98);
    return{ratio:clipped,key:k,label:p.profile_label||ath?.modifications||'',returnToStart,ratioSource};
  }

  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const courseOf=s=>/LCM/i.test(text(s?.identity?.course))?'LCM':'SCM';
  const rawOf=item=>text([
    item?.raw,item?.text,
    ...(item?.cues||[]),
    ...(item?.pattern||[]).map(x=>x?.text||x?.label||''),
    ...(item?.repPattern||[]).map(x=>x?.text||x?.label||x?.zone||''),
    ...(item?.repInstructions||[]).map(x=>x?.label||x?.text||''),
    item?.repeatBreakdownCue||''
  ].filter(Boolean).join(' '));

  function energyZones(item){
    const out=[];
    if(item?.zone)out.push(item.zone);
    for(const p of item?.repPattern||[])if(p?.zone)out.push(p.zone);
    const raw=rawOf(item);
    for(const z of ZONES)if(new RegExp(`\\b${z}|\\b${z.slice(0,3)}`,'i').test(raw))out.push(z);
    return[...new Set(out)];
  }
  function isAerobic(item){return energyZones(item).length>0||/\b(?:aerobic|capacity|vo2)\b/i.test(rawOf(item));}
  function isIM(item){return E?.stroke?.(item?.stroke)==='IM'||/\bIM\b|individual\s+medley/i.test(rawOf(item));}
  function hasRaceIntent(item){return !!(item?.raceIntent||(item?.repInstructions||[]).some(x=>x?.raceIntent));}
  function isQuality(item){return hasRaceIntent(item)||/\b(?:max|sprint|race|pace|quality|fast|underwater|dive|start|build|turn|finish)\b/i.test(rawOf(item));}
  function independentSkill(item){return /\b(?:dive|start|turn|finish)\b/i.test(rawOf(item))&&!/\b(?:kick|fins?|underwater)\b/i.test(rawOf(item));}
  function targetDriven(item){return !!(item?.targetSeconds||hasRaceIntent(item)||item?.zone||(item?.repPattern||[]).length);}
  function sameTeamExposure(item){
    const d=Number(item?.distance)||0,r=Math.max(1,Number(item?.reps)||1),metres=d*r;
    if(isAerobic(item)||d<=0||d>100||metres>300||/\bkick\b/i.test(rawOf(item)))return false;
    return hasRaceIntent(item)||/\b(?:max|sprint|race|pace|quality|fast|underwater|dive|start|drill|scull|skill|build|turn|finish)\b/i.test(rawOf(item));
  }

  function safeReps(reps,distance,ratio,session,returnToStart){
    reps=Math.max(1,Number(reps)||1);if(ratio>=.98)return reps;
    const d=Number(distance)||0,target=reps*d*ratio,c=[];
    for(let r=1;r<=reps;r++){
      const metres=r*d;
      if(returnToStart&&d){const unit=poolLength(session)*2;if(Math.abs(metres/unit-Math.round(metres/unit))>.001)continue;}
      c.push({r,delta:Math.abs(metres-target),metres});
    }
    if(!c.length)return Math.max(1,Math.round(reps*ratio));
    c.sort((a,b)=>a.delta-b.delta||b.metres-a.metres);return c[0].r;
  }
  function safeDistance(distance,ratio,session,returnToStart,minDistance=25){
    const d=Number(distance)||0;if(ratio>=.98||!d)return d;
    const pool=poolLength(session),unit=returnToStart?pool*2:pool,target=Math.max(minDistance,d*ratio),c=[];
    for(let x=unit;x<=d;x+=unit)c.push({d:x,delta:Math.abs(x-target)});
    if(!c.length)return Math.max(pool,Math.round(target/pool)*pool);
    c.sort((a,b)=>a.delta-b.delta||b.d-a.d);return c[0].d;
  }
  function nearestPracticalDistance(distance,session,{returnToStart=false,minDistance=25,maxDistance=null}={}){
    const pool=poolLength(session),unit=returnToStart?pool*2:pool,max=Number(maxDistance)||Math.max(pool,Number(distance)||pool),target=Math.max(minDistance,Number(distance)||pool),c=[];
    for(let d=unit;d<=max;d+=unit)c.push({d,delta:Math.abs(d-target)});
    if(!c.length)return Math.min(max,Math.max(pool,Math.round(target/pool)*pool));
    c.sort((a,b)=>a.delta-b.delta||b.d-a.d);return c[0].d;
  }

  function remapRepPattern(pattern,oldReps,newReps){
    if(!Array.isArray(pattern)||!pattern.length||oldReps===newReps)return clone(pattern||[]);
    const src=Array.from({length:oldReps},(_,i)=>pattern.find(x=>Number(x.rep)===i+1)||pattern[Math.min(pattern.length-1,i)]||{}),out=[];
    for(let i=0;i<newReps;i++){const idx=Math.min(oldReps-1,Math.floor(((i+.5)*oldReps)/newReps));out.push({...clone(src[idx]||{}),rep:i+1});}
    return out;
  }
  function remapRepInstructions(rows,oldReps,newReps){
    if(!Array.isArray(rows)||!rows.length||oldReps===newReps)return clone(rows||[]);
    const src=Array.from({length:oldReps},(_,i)=>rows.find(x=>Number(x.rep)===i+1)||rows[Math.min(rows.length-1,i)]||{}),out=[];
    for(let i=0;i<newReps;i++){const idx=Math.min(oldReps-1,Math.floor(((i+.5)*oldReps)/newReps));out.push({...clone(src[idx]||{}),rep:i+1});}
    return out;
  }
  function remapComposition(rows,oldDistance,newDistance,session){
    if(!Array.isArray(rows)||!rows.length||oldDistance===newDistance)return clone(rows||[]);
    const valid=rows.map(x=>({...clone(x),distance:Number(x.distance)||0})).filter(x=>x.distance>0),total=valid.reduce((n,x)=>n+x.distance,0);
    if(!valid.length||total<=0||newDistance<=0)return clone(rows||[]);
    const pool=poolLength(session),out=[],count=valid.length;let remaining=Number(newDistance);
    for(let i=0;i<count;i++){
      const x=valid[i],left=count-i-1;
      if(i===count-1){out.push({...x,distance:remaining});break;}
      const proportional=newDistance*(x.distance/total),minLeft=left*pool;
      let d=Math.round(proportional/pool)*pool;d=Math.max(pool,d);d=Math.min(Math.max(pool,remaining-minLeft),d);
      out.push({...x,distance:d});remaining-=d;
    }
    if(out.some(x=>x.distance<=0)||Math.abs(out.reduce((n,x)=>n+x.distance,0)-newDistance)>.001)return clone(rows||[]);
    return out;
  }
  function repeatCue(rb,reps){
    const unit=rb?.unit||[],unitReps=Math.max(1,Number(rb?.unitReps)||unit.reduce((n,x)=>n+Math.max(1,Number(x.count)||1),0)||1),total=Math.max(1,Number(reps)||1),rounds=Math.floor(total/unitReps),rem=total%unitReps,expanded=[];
    for(const x of unit)for(let i=0;i<Math.max(1,Number(x.count)||1);i++)expanded.push(text(x.text||'Choice'));
    const core=unit.map(x=>{const n=Math.max(1,Number(x.count)||1),t=text(x.text||'Choice');return `${n>1?n+' ':''}${t}`}).join(' / ');
    let out=rounds?`${rounds} round${rounds===1?'':'s'} · ${core}`:'';if(rem)out+=`${out?' + ':''}${expanded.slice(0,rem).join(' / ')}`;return out||core;
  }
  function syncRepeatBreakdown(out,source){
    const rb=out?.repeatBreakdown||source?.repeatBreakdown;if(!rb)return out;
    out.repeatBreakdown=clone(rb);const old=source?.repeatBreakdownCue||out.repeatBreakdownCue||'',next=repeatCue(rb,Math.max(1,Number(out.reps)||1));
    out.cues=[...(out.cues||[])].filter(c=>text(c)!==text(old)&&text(c)!==text(out.repeatBreakdownCue));out.repeatBreakdownCue=next;
    if(next&&!out.cues.some(c=>text(c)===text(next)))out.cues.push(next);out.pattern=[];return out;
  }
  function rewriteLead(out,reps,distance){
    const raw=text(out?.raw||out?.text),n=Math.max(1,Number(reps)||1),d=Number(distance)||0,lead=n>1?`${n} × ${d}`:`${d}`;
    out.reps=n;out.distance=d;
    if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);
    else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);
    else out.raw=`${lead}${raw?` · ${raw}`:''}`;
    out.text=out.raw;return out;
  }
  function rewriteCycle(out,oldCycle,newCycle){
    if(!newCycle)return out;const next=cycleClock(newCycle),old=Number(oldCycle)||0;
    const fix=s=>{s=text(s);if(old){const o=cycleClock(old);const re=new RegExp(`(?:@|on)\\s*${o.replace(':','[:.]')}`,'i');if(re.test(s))return s.replace(re,`@ ${next}`);}return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(s)?s.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${next}`):s;};
    out.raw=fix(out.raw||out.text);out.text=out.raw;out.cycleSeconds=Number(newCycle);
    if(Array.isArray(out.cues))out.cues=out.cues.map(fix);
    if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>({...x,text:fix(x.text||'')}));
    if(Array.isArray(out.repPattern))out.repPattern=out.repPattern.map(x=>({...x,text:x.text?fix(x.text):x.text}));if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map(x=>({...x,label:x.label?fix(x.label):x.label}));if(out.repeatBreakdownCue)out.repeatBreakdownCue=fix(out.repeatBreakdownCue);return out;
  }
  function preserveAuthoredTiming(out,item,reason='Common starts preserved; authored send-off still protects the intended stimulus'){
    const cycle=Number(item?.cycleSeconds)||null;if(!cycle)return out;
    rewriteCycle(out,Number(out?.cycleSeconds)||cycle,cycle);
    out.adaptationTiming={mode:'common-start',cycleSeconds:cycle,source:'Coach-authored session timing',reason};
    out.cyclePolicy='common send-off retained because the individual stimulus remains valid';return out;
  }

  function bestEventSeconds(ath,state,distance,strokeWanted,session){
    const course=courseOf(session),rows=E?.pbRows?.(ath,state)||[],wanted=E?.stroke?.(strokeWanted)||strokeWanted;
    const vals=rows.filter(r=>Number(E?.distance?.(r))===Number(distance)&&E?.stroke?.(E?.rowStroke?.(r)||r?.stroke||r?.event_stroke||'')===wanted&&String(E?.course?.(r)||'').toUpperCase()===course).map(r=>Number(E?.seconds?.(r))).filter(v=>Number.isFinite(v)&&v>0);
    return vals.length?Math.min(...vals):null;
  }
  function t400Seconds(ath,state,stroke='Freestyle'){
    try{const row=A?.t400?.(ath,state,stroke)||(E?.t400Rows?.(ath,state,stroke)||[])[0];const s=Number(E?.seconds?.(row));return Number.isFinite(s)&&s>0?s:null;}catch{return null;}
  }
  function median(values){const x=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;}
  function assignedSquad(ath,session){
    if(text(ath?.squad))return text(ath.squad).toLowerCase();
    const squads=[...(session?.identity?.squads||[]),...(session?.squads||[])].map(x=>text(x).toLowerCase()).filter(Boolean);return squads[0]||'';
  }
  function referenceCandidate(a,state,squad){
    if(!a||a.active===false)return false;if(squad&&text(a.squad).toLowerCase()!==squad)return false;
    return profile(a,state).ratio>=.98;
  }
  function relevantGroupAthletes(ath,state,session){
    const squad=assignedSquad(ath,session),all=(state?.athletes||[]).filter(a=>a?.id!==ath?.id&&referenceCandidate(a,state,squad));
    const liveIds=new Set((state?.attendance||[]).filter(r=>r?.session_id===session?.id&&['present','modified','late'].includes(text(r?.status).toLowerCase())).map(r=>r.athlete_id).filter(Boolean));
    const live=all.filter(a=>liveIds.has(a.id));return live.length?live:all;
  }
  function comparisonEventSpec(item){
    const race=item?.raceIntent||item?.repInstructions?.find(x=>x?.raceIntent)?.raceIntent||null;
    const d=Number(item?.distance)||0;
    const eventDistance=Number(race?.distance)||(d<=50?50:d<=125?100:d<=300?200:400);
    let stroke=E?.stroke?.(race?.eventStroke||item?.stroke||'')||'';
    if(stroke==='Choice')stroke='';
    return{distance:eventDistance,stroke};
  }
  function referenceValues(ath,state,session,valueFor){
    const squad=assignedSquad(ath,session),all=(state?.athletes||[]).filter(a=>a?.id!==ath?.id&&referenceCandidate(a,state,squad));
    const liveIds=new Set((state?.attendance||[]).filter(r=>r?.session_id===session?.id&&['present','modified','late'].includes(text(r?.status).toLowerCase())).map(r=>r.athlete_id).filter(Boolean));
    const live=all.filter(a=>liveIds.has(a.id)).map(valueFor).filter(Boolean);
    if(live.length>=3)return{values:live,source:'current assigned-squad cohort',confidence:'high'};
    const stable=all.map(valueFor).filter(Boolean);
    if(stable.length>=3)return{values:stable,source:'assigned-squad reference bank',confidence:'high'};
    return{values:stable,source:'insufficient assigned-squad evidence',confidence:'low'};
  }
  function relativeEvidence(item,ath,state,session){
    if(!ath||!state)return null;
    if(isAerobic(item)){
      let stroke=E?.stroke?.(item?.stroke||'Freestyle')||'Freestyle';if(!stroke||stroke==='Choice')stroke='Freestyle';
      const athleteSeconds=t400Seconds(ath,state,stroke);if(!athleteSeconds)return null;
      const ref=referenceValues(ath,state,session,a=>t400Seconds(a,state,stroke));if(ref.values.length<3)return{kind:'t400',stroke,athleteSeconds,referenceCount:ref.values.length,confidence:'low',missingReference:true,source:ref.source};
      const referenceSeconds=median(ref.values);return{kind:'t400',stroke,athleteSeconds,referenceSeconds,referenceCount:ref.values.length,timeRatio:athleteSeconds/referenceSeconds,speedFactor:referenceSeconds/athleteSeconds,source:ref.source,confidence:ref.confidence};
    }
    const spec=comparisonEventSpec(item);if(!spec.stroke)return null;
    const athleteSeconds=bestEventSeconds(ath,state,spec.distance,spec.stroke,session);if(!athleteSeconds)return null;
    const ref=referenceValues(ath,state,session,a=>bestEventSeconds(a,state,spec.distance,spec.stroke,session));if(ref.values.length<3)return{kind:'pb',...spec,athleteSeconds,referenceCount:ref.values.length,confidence:'low',missingReference:true,source:ref.source};
    const referenceSeconds=median(ref.values);return{kind:'pb',...spec,athleteSeconds,referenceSeconds,referenceCount:ref.values.length,timeRatio:athleteSeconds/referenceSeconds,speedFactor:referenceSeconds/athleteSeconds,source:ref.source,confidence:ref.confidence};
  }
  function commonIntervalSafe(item,evidence){
    const cycle=Number(item?.cycleSeconds)||0,d=Number(item?.distance)||0;if(!isQuality(item)||!cycle||d<=0)return false;
    if(evidence?.referenceSeconds&&evidence?.athleteSeconds&&evidence?.distance){
      const scale=d/Number(evidence.distance),groupWork=evidence.referenceSeconds*scale,athleteWork=evidence.athleteSeconds*scale,groupRest=cycle-groupWork,athleteRest=cycle-athleteWork;
      return groupRest>=groupWork&&athleteRest>=athleteWork&&athleteRest>0;
    }
    return d<=50&&sameTeamExposure(item);
  }
  function performancePlan(item,ath,state,session,evidence=relativeEvidence(item,ath,state,session)){
    const baseReps=Math.max(1,Number(item?.reps)||1),baseCycle=Number(item?.cycleSeconds)||0;if(!baseCycle||!evidence?.referenceSeconds||!evidence?.athleteSeconds)return null;
    const cycleSeconds=ceil5(baseCycle*evidence.timeRatio),groupWindowSeconds=baseReps*baseCycle,candidates=[];
    for(let reps=1;reps<=baseReps;reps++)candidates.push({reps,totalSeconds:reps*cycleSeconds,delta:Math.abs(reps*cycleSeconds-groupWindowSeconds)});
    candidates.sort((a,b)=>a.delta-b.delta||b.reps-a.reps);const best=candidates[0];
    return{reps:best.reps,cycleSeconds,athleteSeconds:evidence.athleteSeconds,referenceSeconds:evidence.referenceSeconds,referenceCount:evidence.referenceCount,baseCycleSeconds:baseCycle,groupWindowSeconds,totalSeconds:best.totalSeconds,finishDeltaSeconds:best.totalSeconds-groupWindowSeconds,timeRatio:evidence.timeRatio,speedFactor:evidence.speedFactor,evidenceKind:evidence.kind,source:`${evidence.kind==='t400'?'T400':'PB'} · ${evidence.source} · proportional work:rest`,confidence:evidence.confidence};
  }
  function imPerformancePlan(item,ath,state,session){return performancePlan(item,ath,state,session,relativeEvidence(item,ath,state,session));}
  function applyPerformancePlan(out,item,plan,label='Relative stimulus'){
    if(!plan)return out;rewriteLead(out,plan.reps,Number(item?.distance)||Number(out?.distance)||0);rewriteCycle(out,Number(item?.cycleSeconds)||0,plan.cycleSeconds);
    out.relativeStimulusPlan=clone(plan);out.imPerformancePlan=isIM(item)?clone(plan):out.imPerformancePlan;
    out.adaptationTiming={mode:'performance-relative',cycleSeconds:plan.cycleSeconds,source:plan.source,reason:'Preserve a comparable work:rest relationship and remain connected to the squad set window'};
    out.cyclePolicy='performance-relative send-off with rep count nearest the squad set window';out.adaptationReason=`${label} · ${cycleClock(plan.referenceSeconds)} squad reference / ${cycleClock(plan.athleteSeconds)} athlete evidence · ${plan.reps} reps near ${cycleClock(plan.groupWindowSeconds)} squad window`;return out;
  }
  function applyIMPerformancePlan(out,item,plan){return applyPerformancePlan(out,item,plan,'Modified IM');}
  function alignIMTeamWindow(out,item,baseReps,newReps){
    const cycle=Number(item?.cycleSeconds)||0,from=Math.max(1,Number(baseReps)||1),to=Math.max(1,Number(newReps)||1);if(!cycle||to>=from)return out;
    const next=ceil5(cycle*from/to);rewriteCycle(out,cycle,next);out.adaptationTiming={mode:'low-confidence-team-window-fallback',cycleSeconds:next,source:'No fair squad performance comparator available',reason:'Fallback only: keep complete IM units near the squad set window'};out.cyclePolicy='low-confidence IM set-window fallback';out.adaptationConfidence='low';return out;
  }
  function relativeDistance(item,evidence,session,p){
    const base=Number(item?.distance)||0;if(base<=50||isIM(item)||hasRaceIntent(item)||!evidence?.speedFactor)return null;
    const desired=base*evidence.speedFactor;if(desired>=base-.01)return null;
    const d=nearestPracticalDistance(desired,session,{returnToStart:p?.returnToStart,minDistance:poolLength(session),maxDistance:base});return d<base?d:null;
  }

  function invalidateDistanceTarget(out,item,oldDistance,newDistance){
    if(Number(oldDistance)===Number(newDistance))return out;
    out.targetMustRecalculate=targetDriven(item);out.adaptationTarget={mode:out.targetMustRecalculate?'recalculate-for-distance':'none',fromDistance:Number(oldDistance)||0,toDistance:Number(newDistance)||0,source:'Stimulus-safe modification'};
    if(out.targetMustRecalculate&&Number.isFinite(Number(out.targetSeconds))){out.referenceTargetSeconds=Number(out.targetSeconds);delete out.targetSeconds;}
    if(out.targetMustRecalculate)out.adaptationTiming={mode:'recalculate-target-recovery',source:'Distance changed',reason:'Target/recovery must be recomputed from athlete evidence for the delivered distance'};return out;
  }
  function rewriteInstructionRanges(out,oldReps,newReps){
    if(!out||oldReps===newReps||newReps<1)return out;
    const genericDescPattern=`\\bDesc(?:end|ending)?\\s+1\\s*[-–—]\\s*${oldReps}\\b`,hasGenericDesc=s=>new RegExp(genericDescPattern,'i').test(text(s));
    const hadGenericDesc=[out.raw,out.text,...(out.cues||[]),...(out.repInstructions||[]).map(x=>x.label||''),...(out.pattern||[]).map(x=>x.text||''),out.repeatBreakdownCue||''].some(hasGenericDesc);
    const remap=s=>text(s).replace(/\bDesc(?:end|ending)?\s+Stroke\s+Count\s+1\s*[-–—]\s*(\d+)\b/ig,(m,end)=>Number(end)===Number(oldReps)?`Desc SC 1-${newReps}`:m).replace(/\bDesc(?:end|ending)?\s+SC\s+1\s*[-–—]\s*(\d+)\b/ig,(m,end)=>Number(end)===Number(oldReps)?`Desc SC 1-${newReps}`:m).replace(new RegExp(genericDescPattern,'ig'),newReps===2?'1 Build / 1 Fast':`Desc 1-${newReps}`);
    out.raw=remap(out.raw||out.text);out.text=out.raw;if(Array.isArray(out.cues))out.cues=out.cues.map(remap);if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map((x,i)=>({...x,rep:i+1,label:remap(x.label||'')}));if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>({...x,text:remap(x.text||'')}));if(out.repeatBreakdownCue)out.repeatBreakdownCue=remap(out.repeatBreakdownCue);
    if(hadGenericDesc&&newReps===2){const existing=(out.repInstructions||[]).some(x=>x?.raceIntent||(/\S/.test(text(x?.label))&&!/\bdesc/i.test(text(x?.label))&&!/1\s+Build\s*\/\s*1\s+Fast/i.test(text(x?.label))));if(!existing)out.repInstructions=[{rep:1,label:'Build',raceIntent:null},{rep:2,label:'Fast',raceIntent:null}];out.adaptationPattern={mode:'two-rep-descent-collapse',source:'Coach-confirmed modification rule',labels:['Build','Fast'],reason:'Two repetitions are not a meaningful descent range'};}
    return out;
  }

  function activeOverride(item,ath,state,session){return(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;}
  function shapeOverride(ov){if(!ov)return false;if(ov.raw)return true;const p=ov.patch||{};return['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(p,k));}
  function applyOverride(out,ov){if(!ov)return out;if(ov.raw)out.raw=ov.raw;Object.assign(out,ov.patch||{});out.text=out.raw||out.text;out.adaptationReason='Coach override';return out;}

  function adaptiveMeta(out,opts,strokes,note,status='coach-confirmed'){out.adaptiveOptions=opts.map(x=>({...x}));out.adaptiveStrokeChoices=[...strokes];out.adaptiveRuleStatus=status;out.adaptiveNote=note;return out;}
  function applyAmberConstraint(item,ath,ov){
    const raw=rawOf(item),needsUpper=/\b(?:kick|fins?|underwater)\b/i.test(raw),independent=/\b(?:dive|start|turn|finish)\b/i.test(raw)&&!needsUpper;
    if(!needsUpper||independent)return clone(item);
    const out=clone(item),requested=text(ov?.patch?.adaptiveMode),mode=AMBER_MODES.some(x=>x.id===requested)?requested:'',selectedStroke=E?.stroke?.(ov?.patch?.stroke||'Choice')||'Choice';
    out.stroke=selectedStroke;out.equipment=[...(out.equipment||[])].filter(x=>!/\b(?:fins?|kick|paddles?)\b/i.test(String(x)));
    adaptiveMeta(out,AMBER_MODES,AMBER_STROKES,'Choose the upper-body option that best fits this set. Scull may need up to 2:00 per 50.');out.adaptiveMode=mode;out.adaptivePending=!mode;
    return out;
  }
  function applyConorConstraint(item,ov){
    const raw=rawOf(item);if(!/\b(?:breaststroke|breast|br)\b/i.test(raw)||!/\bfins?\b/i.test(raw))return clone(item);
    const out=clone(item),requested=text(ov?.patch?.adaptiveMode),mode=CONOR_MODES.some(x=>x.id===requested)?requested:'Choice non-Breaststroke';
    adaptiveMeta(out,CONOR_MODES,['Freestyle','Backstroke','Butterfly','Choice'],'No Breaststroke kick with fins.','starter');out.adaptiveMode=mode;out.stroke=mode==='Choice non-Breaststroke'?'Choice':mode;out.adaptationReason='No Breaststroke kick with fins';return out;
  }
  function adaptiveLabel(out,item,ath){
    const k=E?.key?.(ath?.full_name)||text(ath?.full_name).toLowerCase().replace(/[^a-z0-9]/g,''),reps=Math.max(1,Number(out?.reps)||1),d=Number(out?.distance)||0,cycle=Number(out?.cycleSeconds)||0;
    if(k==='amberproudfoot'&&out?.adaptiveOptions?.length){
      const mode=text(out.adaptiveMode),stroke=E?.stroke?.(out.stroke||'Choice')||'Choice';
      if(!mode){out.raw=`${reps} × ${d} Upper-body choice${cycle?` @ ${cycleClock(cycle)}`:''}`;out.text=out.raw;out.adaptationReason='Amber upper-body choice · option not selected';return out;}
      let label='';if(mode==='Pull')label=`Upper-body ${stroke} Pull`;else if(mode==='Paddles'){label=`Upper-body ${stroke} Paddles`;if(!out.equipment.some(x=>/paddles/i.test(String(x))))out.equipment.push('Paddles');}else if(mode==='Swim')label=`Upper-body ${stroke} Swim`;else if(mode==='Drill')label=`Upper-body ${stroke} Drill`;else if(mode==='Scull'){label=`Upper-body ${stroke} Scull`;const min=ceil5((d||50)/50*120);if(cycle<min)rewriteCycle(out,cycle,min);}else label='Upper-body · Body alignment';
      out.adaptivePending=false;out.raw=`${reps} × ${d} ${label}${Number(out.cycleSeconds)?` @ ${cycleClock(out.cycleSeconds)}`:''}`;out.text=out.raw;out.adaptationReason=`Amber adaptive upper-body · ${mode}`;return out;
    }
    if(k==='conorfischer'&&out?.adaptiveOptions?.length){const mode=text(out.adaptiveMode)||'Choice non-Breaststroke';out.raw=`${reps} × ${d} ${mode} with Fins${cycle?` @ ${cycleClock(cycle)}`:''}`;out.text=out.raw;out.adaptationReason='No Breaststroke kick with fins';}
    return out;
  }
  function applyCharlotteKickBase(out,ath,manualShape){
    if(manualShape||(E?.key?.(ath?.full_name)||'')!=='charlottemurphy'||Number(out?.distance)!==50)return out;if(!/\bkick\b/i.test(rawOf(out)))return out;
    const c=Number(out.cycleSeconds),base=(c>=130&&c<=140)?c:135;if(base!==c)rewriteCycle(out,c,base);out.kickCycleRange={min:130,base:135,max:140,source:'Coach-confirmed Charlotte 50 kick base'};out.adaptationReason='50 kick base 2:10–2:20';out.adaptationTiming={mode:'athlete-rule',cycleSeconds:base,source:'Coach-confirmed Charlotte 50 kick base'};return out;
  }

  function reshapeWithReps(out,item,reps){
    const baseReps=Math.max(1,Number(item?.reps)||1),d=Number(item?.distance)||0;rewriteLead(out,reps,d);out.repPattern=remapRepPattern(item.repPattern,baseReps,reps);out.repInstructions=remapRepInstructions(item.repInstructions,baseReps,reps);rewriteInstructionRanges(out,baseReps,reps);syncRepeatBreakdown(out,item);return out;
  }
  function reshapeWithDistance(out,item,distance,session){
    const baseDist=Number(item?.distance)||0,reps=Math.max(1,Number(item?.reps)||1);rewriteLead(out,reps,distance);out.composition=remapComposition(item.composition,baseDist,distance,session);out.repPattern=clone(item.repPattern||[]);out.repInstructions=clone(item.repInstructions||[]);invalidateDistanceTarget(out,item,baseDist,distance);return out;
  }

  function adaptItem(item,ath,state,session){
    if(item?.kind==='cue')return clone(item);
    if(item?.kind==='group'){const g=clone(item);g.items=(item.items||[]).map(x=>adaptItem(x,ath,state,session));return g;}
    if(item?.kind!=='set')return clone(item);
    state=state||{};session=session||{};
    const p=profile(ath,state),ov=activeOverride(item,ath,state,session),manualShape=shapeOverride(ov),baseReps=Math.max(1,Number(item.reps)||1),baseDist=Number(item.distance)||0,raw=rawOf(item),key=p.key;
    let out=key==='amberproudfoot'?applyAmberConstraint(item,ath,ov):key==='conorfischer'?applyConorConstraint(item,ov):clone(item);

    if(!manualShape&&p.ratio<.98){
      const evidence=relativeEvidence(item,ath,state,session),quality=isQuality(item),aerobic=isAerobic(item),im=isIM(item),skill=independentSkill(item),commonSafe=quality&&commonIntervalSafe(item,evidence);
      out.relativeStimulusEvidence=evidence?clone(evidence):null;

      if(skill){out.adaptationReason='Same team exposure · independent skill quality';preserveAuthoredTiming(out,item,'Independent skill quality remains a common-start squad activity');}
      else if(commonSafe){out=clone(out);out.adaptationReason='Same team exposure · common interval preserves short quality stimulus';preserveAuthoredTiming(out,item,'Work/rest remains a full-recovery quality stimulus for this swimmer');}
      else{
        if(key==='charlottemurphy'&&baseDist===50&&/\bkick\b/i.test(raw)){
          const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps)reshapeWithReps(out,item,reps);
        }
        const evidenceDistance=relativeDistance(item,evidence,session,p);
        const preservePattern=!!item?.repeatBreakdown||/\bdesc(?:end|ending)?(?:\s+stroke\s+count|\s+sc|\s+1\s*[-–—])/i.test(raw);
        if(evidenceDistance){
          reshapeWithDistance(out,item,evidenceDistance,session);preserveAuthoredTiming(out,item,'Distance adjusted from relative performance evidence so the swimmer can keep common starts');out.adaptationReason=`Relative ${evidence.kind} · ${Math.round(evidence.speedFactor*100)}% squad speed · ${baseDist}→${evidenceDistance} to preserve group rhythm`;out.adaptationConfidence=evidence.confidence;
        }else if((im||hasRaceIntent(item)||quality)&&evidence?.referenceSeconds&&Number(item.cycleSeconds)>0){
          const plan=performancePlan(item,ath,state,session,evidence);applyPerformancePlan(out,item,plan,im?'Modified IM':'Relative quality');
        }else if(im){
          const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps)reshapeWithReps(out,item,reps);
          preserveAuthoredTiming(out,item,'Complete IM units retained; no fair evidence supports inventing a new individual interval');
          out.adaptationReason='Complete IM units retained · load adjusted by reps';out.adaptationConfidence='low';
        }else if(aerobic&&baseDist>=100){
          const ratio=evidence?.speedFactor||p.ratio,desired=nearestPracticalDistance(baseDist*ratio,session,{returnToStart:p.returnToStart,minDistance:Math.min(100,baseDist),maxDistance:baseDist});
          if(desired<baseDist){reshapeWithDistance(out,item,desired,session);preserveAuthoredTiming(out,item,'Aerobic work distance adjusted while the target engine recalculates athlete pace/recovery');out.adaptationReason=`${evidence?.referenceSeconds?'Relative T400':'Load fallback'} · ${baseDist}→${desired} · authored phases retained`;out.adaptationConfidence=evidence?.confidence||'low';}
          else{const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);out.adaptationReason=`${evidence?.referenceSeconds?'Relative T400':'Load fallback'} · reps adjusted because distance cannot shorten without losing the aerobic unit`;out.adaptationConfidence=evidence?.confidence||'low';}}
        }else if(baseDist>50&&!preservePattern){
          if(baseReps===1){
            const desired=nearestPracticalDistance(baseDist*p.ratio,session,{returnToStart:p.returnToStart,minDistance:poolLength(session),maxDistance:baseDist});
            if(desired<baseDist){reshapeWithDistance(out,item,desired,session);out.adaptationReason=`Load fallback · ${baseDist}→${desired} single continuous work`;out.adaptationConfidence='low';}
          }else{
            const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);
            if(reps!==baseReps){reshapeWithReps(out,item,reps);preserveAuthoredTiming(out,item,'No fair performance evidence requires a shorter repeat; preserve authored distance and adjust total work by reps');out.adaptationReason=`Load fallback · ${baseReps}→${reps} reps · authored ${baseDist}m repeat retained`;out.adaptationConfidence='low';}
          }
        }else if(baseDist<=50&&baseReps*baseDist<=300&&sameTeamExposure(item)){
          out.adaptationReason='Short work retained with squad · load recovered elsewhere';preserveAuthoredTiming(out,item,'Short work remains connected to the squad; global load is not enforced by cutting every small set');
        }else{
          const reps=safeReps(baseReps,baseDist,p.ratio,session,p.returnToStart);if(reps!==baseReps){reshapeWithReps(out,item,reps);out.adaptationReason=`${Math.round(p.ratio*100)}% load fallback · no fair performance comparator`;out.adaptationConfidence='low';if(Number(item.cycleSeconds)>0)preserveAuthoredTiming(out,item,'Fallback rep reduction only; no evidence supports inventing a new send-off');}
        }
      }
    }

    if(!manualShape&&(key==='mckenziedrage'||key==='mackenziedrage')&&Number(item.distance)===50&&/\bkick\b/i.test(raw)&&Number(item.cycleSeconds)>0)preserveAuthoredTiming(out,item,'McKenzie 50 kick keeps the coach-authored cycle');
    applyCharlotteKickBase(out,ath,manualShape);
    adaptiveLabel(out,item,ath);
    applyOverride(out,ov);
    syncRepeatBreakdown(out,item);
    return out;
  }

  function samePrescription(a,b){return Number(a?.reps||1)===Number(b?.reps||1)&&Number(a?.distance||0)===Number(b?.distance||0)&&E?.stroke?.(a?.stroke||'')===E?.stroke?.(b?.stroke||'')&&Number(a?.restSeconds||0)===Number(b?.restSeconds||0)&&Number(a?.cycleSeconds||0)===Number(b?.cycleSeconds||0)&&text(a?.raw)===text(b?.raw)&&text(a?.repeatBreakdownCue)===text(b?.repeatBreakdownCue);}

  return{
    VERSION,profile,adaptItem,samePrescription,poolLength,safeReps,safeDistance,isIM,isAerobic,isQuality,hasRaceIntent,targetDriven,sameTeamExposure,shapeOverride,
    AMBER_MODES,AMBER_STROKES,CONOR_MODES,relativeEvidence,commonIntervalSafe,performancePlan,relevantGroupAthletes,
    internals:{remapRepPattern,remapRepInstructions,remapComposition,rewriteInstructionRanges,energyZones,applyCharlotteKickBase,preserveAuthoredTiming,bestEventSeconds,t400Seconds,relevantGroupAthletes,relativeEvidence,performancePlan,imPerformancePlan,applyPerformancePlan,applyIMPerformancePlan,alignIMTeamWindow,invalidateDistanceTarget,rewriteCycle,rewriteLead,repeatCue,syncRepeatBreakdown,nearestPracticalDistance,comparisonEventSpec,referenceValues}
  };
});