'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Targets=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const stroke=v=>{const s=text(v).toLowerCase();if(!s)return'';if(/^(?:free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(?:back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(?:breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(?:fly|butterfly)$/.test(s))return'Butterfly';if(/^(?:im|medley|individual medley)$/.test(s))return'IM';if(/^choice$/.test(s))return'Choice';return text(v)};
  const AEROBIC={
    50:{10:{Regeneration:1.062,Development:1.033,Overload:1.002,Threshold:.969,Clearance:.941},30:{Regeneration:1.02,Development:.989,Overload:.961,Threshold:.931,Clearance:.91},divisor:8},
    100:{10:{Regeneration:1.1165,Development:1.08,Overload:1.05,Threshold:1.024,Clearance:1},30:{Regeneration:1.093,Development:1.048,Overload:1.024,Threshold:.995,Clearance:.972},divisor:4},
    200:{10:{Regeneration:1.1405,Development:1.0945,Overload:1.0687,Threshold:1.0474,Clearance:1.0225},30:{Regeneration:1.1261,Development:1.081,Overload:1.055,Threshold:1.02518,Clearance:1.0087},divisor:2},
    400:{10:{Regeneration:1.156,Development:1.1142,Overload:1.091,Threshold:1.0686,Clearance:1.04759},30:{Regeneration:1.1515,Development:1.103,Overload:1.0731,Threshold:1.0554,Clearance:1.036},divisor:1}
  };
  const testKeyForStroke=s=>`t400_${stroke(s||'Freestyle').toLowerCase().replace(/\s+/g,'_')}`;
  function practicalSendOff(targetSeconds,restSeconds){const t=num(targetSeconds),r=Math.max(0,num(restSeconds)||0);if(t===null)return null;return Math.ceil((Math.floor(t)+r)/5)*5}
  function suppressReason(item){const raw=text(item?.raw||item?.text||item?.label),st=stroke(item?.stroke);if(st==='Choice')return'Choice work has no automatic pace target';if(/\b(?:easy|recovery|reset|warm.?down|warm.?up|minimum stroke count|msc|scull|drill|technique|hypoxic|bands only)\b/i.test(raw)&&!item?.zone&&!item?.raceIntent&&!item?.targetSeconds&&!item?.repInstructions?.some(x=>x.raceIntent))return'Non-target work';return''}
  function itemRest(item){return Math.max(0,num(item?.restSeconds)||0)}
  function modelRest(rest){return Number(rest)>=20?30:10}

  class Targets{
    constructor({evidence,pathway=null}={}){if(!evidence||typeof evidence.latestTrainingTestEvidence!=='function'||typeof evidence.personalBestEvidence!=='function')throw new Error('Target Engine requires Evidence Retrieval');this.evidence=evidence;this.pathway=pathway}
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    t400(athleteRef,{course='',stroke:strokeWanted='Freestyle'}={}){
      const ath=this.athlete(athleteRef);if(!ath)return{status:'missing',message:'Athlete not found',row:null};const wanted=stroke(strokeWanted||'Freestyle');
      return this.evidence.latestTrainingTestEvidence(ath.id,{testKey:testKeyForStroke(wanted),course,stroke:wanted});
    }
    aerobicFromAnchor(anchorSeconds,{distance,zone,restSeconds=0}={}){
      const d=num(distance),table=AEROBIC[d],z=text(zone),anchor=num(anchorSeconds);if(anchor===null||!table||!z)return null;const rest=Math.max(0,num(restSeconds)||0),mr=modelRest(rest),coef=table[mr]?.[z];if(!coef)return null;const seconds=(anchor/table.divisor)*coef;return{seconds,sendOff:practicalSendOff(seconds,rest),modelRest:mr,authoredRest:rest,coefficient:coef,method:`T400 ${d}m ${z} (${mr}s coefficient; ${rest}s authored rest)`}}
    aerobic(session,item,athleteRef,{zoneOverride=''}={}){
      const zone=text(zoneOverride||item?.zone),distance=num(item?.distance);if(!zone||!AEROBIC[distance])return{status:'none',reason:'No aerobic target model for this set'};
      const workStroke=stroke(item?.stroke||'Freestyle');if(workStroke==='Choice')return{status:'none',reason:'Choice work has no automatic aerobic target'};
      const wanted=workStroke||'Freestyle',course=text(session?.identity?.course).toUpperCase(),anchor=this.t400(athleteRef,{course,stroke:wanted});
      if(anchor.status!=='ok')return{status:'missing',kind:'aerobic',message:`No current ${wanted} T400 loaded`,evidence:anchor};
      const calc=this.aerobicFromAnchor(anchor.seconds,{distance,zone,restSeconds:itemRest(item)});if(!calc)return{status:'missing',kind:'aerobic',message:`No ${distance}m ${zone} aerobic model loaded`};
      return{status:'ok',kind:'aerobic',...calc,zone,distance,anchorSeconds:anchor.seconds,source:`Latest valid ${wanted} T400 · ${anchor.date||'date unknown'}`,evidence:clone(anchor)};
    }
    convertedPb(athleteRef,{distance,eventDistance,stroke:eventStroke,course}={}){
      const ath=this.athlete(athleteRef);if(!ath)return{status:'missing',message:'Athlete not found'};const d=num(eventDistance??distance),st=stroke(eventStroke),wanted=text(course).toUpperCase();
      const exact=this.evidence.personalBestEvidence(ath.id,{distance:d,stroke:st,course:wanted});if(exact.status==='ok')return{status:'ok',seconds:exact.seconds,row:exact.row,source:`${wanted} ${d} ${st} PB`,evidence:exact.source,converted:false};
      const other=wanted==='SCM'?'LCM':wanted==='LCM'?'SCM':'';if(!other)return{status:'missing',message:`No ${wanted} ${d} ${st} PB loaded`};
      const pb=this.evidence.personalBestEvidence(ath.id,{distance:d,stroke:st,course:other});if(pb.status!=='ok')return{status:'missing',message:`No ${wanted} or ${other} ${d} ${st} PB loaded`};
      const conversion=this.evidence.conversion({from:other,to:wanted,distance:d,stroke:st});if(!conversion)return{status:'missing',message:`${other} PB exists but ${other} → ${wanted} conversion is not loaded`,evidence:pb.source};
      const delta=num(conversion.seconds);if(delta===null)return{status:'missing',message:'Course conversion is invalid'};
      return{status:'ok',seconds:pb.seconds+delta,row:pb.row,source:`${other} PB → ${wanted} · ${text(conversion.source)||'loaded conversion'}`,evidence:{pb:pb.source,conversion:clone(conversion._evidence)},converted:true};
    }
    raceModel(session,item,athleteRef,raceIntent=null){
      const ath=this.athlete(athleteRef);if(!ath)return{status:'missing',message:'Athlete not found'};const ri=clone(raceIntent||item?.raceIntent);if(!ri?.distance)return{status:'none',reason:'No race-pace intent'};
      const event=num(ri.distance),workingStroke=stroke(ri.workingStroke||item?.stroke||ri.eventStroke||'Freestyle'),eventStroke=stroke(ri.eventStroke||workingStroke||'Freestyle'),course=text(session?.identity?.course).toUpperCase()||'SCM',work=num(item?.distance);
      if(!event||!work||!eventStroke)return{status:'missing',kind:'race',message:'Race-pace instruction is incomplete'};
      const pb=this.convertedPb(ath.id,{eventDistance:event,stroke:eventStroke,course});if(pb.status!=='ok')return{status:'missing',kind:'race',message:pb.message,evidence:pb.evidence||null};const total=pb.seconds,raw=text(item?.raw||item?.text||'');
      if(eventStroke==='IM'&&workingStroke&&workingStroke!=='IM')return{status:'missing',kind:'race',message:'Exact IM leg race model not loaded · target needed',evidence:pb};
      const sx=text(ath.sex||ath.gender).toUpperCase();
      if(event===100&&eventStroke==='Freestyle'&&/^M(?:ALE)?$/.test(sx)){
        if(/\b(?:first|1st)\s*50\b/i.test(raw))return{status:'ok',kind:'race',seconds:total*.4754,source:`John Pike SCM · Male 100 Free first 50 · ${pb.source}`,evidence:pb};
        if(/\b(?:second|2nd|last)\s*50\b/i.test(raw))return{status:'ok',kind:'race',seconds:total*.5246,source:`John Pike SCM · Male 100 Free second 50 · ${pb.source}`,evidence:pb};
        if(/\b(?:dive|race\s*start|start)\b/i.test(raw)&&work<=25){const first50=total*.4754,dive25=first50*.4554;return{status:'ok',kind:'race',seconds:dive25*(work/25),source:`John Pike start-shape · Male 100 Free · ${pb.source}`,evidence:pb}}
        if(/\bpush\b/i.test(raw)&&work===50){const first50=total*.4754,dive25=first50*.4554;return{status:'ok',kind:'race',seconds:(first50-dive25)*2,source:`John Pike push-first-50 estimate · Male 100 Free · ${pb.source}`,evidence:pb}}
      }
      const asksNamed=/\b(?:first|1st|second|2nd|last|final|dive|race\s*start|start|push|turn|finish)\b/i.test(raw);if(asksNamed)return{status:'missing',kind:'race',message:'Exact race-model segment not loaded · target needed',evidence:pb};
      return{status:'ok',kind:'race',seconds:total*(work/event),source:`${pb.source} · generic race-pace average`,evidence:pb};
    }
    repRace(session,item,athleteRef){
      const instructions=(item?.repInstructions||[]).filter(x=>x.raceIntent);if(!instructions.length)return null;const rows=[];
      for(const instruction of instructions){const proxy={...clone(item),raw:instruction.label||item.raw,raceIntent:instruction.raceIntent,repInstructions:[]},r=this.raceModel(session,proxy,athleteRef,instruction.raceIntent);rows.push({rep:instruction.rep,label:instruction.label||'',...r})}
      return{status:'rep_race',kind:'race',rows};
    }
    aerobicPattern(session,item,athleteRef){
      const reps=(item?.repPattern||[]).filter(x=>x.zone);if(!reps.length)return null;const rows=[];
      for(const r of reps){const x=this.aerobic(session,item,athleteRef,{zoneOverride:r.zone});rows.push({rep:r.rep,zone:r.zone,label:r.text||'',...x})}
      return{status:'pattern',kind:'aerobic',rows,source:'Canonical rep-zone pattern'};
    }
    forItem(session,item,athleteRef){
      if(num(item?.targetSeconds)!==null)return{status:'ok',kind:'coach',seconds:num(item.targetSeconds),sendOff:num(item.cycleSeconds),source:'Coach target'};
      const repRace=this.repRace(session,item,athleteRef);if(repRace)return repRace;
      const pattern=this.aerobicPattern(session,item,athleteRef);if(pattern)return pattern;
      if(item?.raceIntent)return this.raceModel(session,item,athleteRef,item.raceIntent);
      if(item?.zone)return this.aerobic(session,item,athleteRef);
      const suppressed=suppressReason(item);if(suppressed)return{status:'none',reason:suppressed};
      return{status:'none',reason:'No target instruction on canonical set'};
    }
    forPhase(session,parent,phase,athleteRef){const item={...clone(parent),...clone(phase),reps:num(phase?.reps)||num(phase?.count)||1,distance:num(phase?.distance)||num(parent?.distance),raw:phase?.raw||phase?.text||parent?.raw,repInstructions:clone(phase?.repInstructions||[]),raceIntent:clone(phase?.raceIntent||null),zone:phase?.zone||'',targetSeconds:null};return this.forItem(session,item,athleteRef)}
  }
  const create=options=>new Targets(options);
  return{VERSION,AEROBIC,create,Targets,stroke,testKeyForStroke,practicalSendOff,modelRest,suppressReason};
});
