'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,R=E?.RacePace,Mod=E?.Modification;
  if(!M||!R||!Mod)return;
  const BUILD='v4-rainbow-race-model-20260822au';
  const Q=M.rainbowRulesAU={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const current=()=>M.currentSession?.()||null;
  const zoneName=v=>{const s=text(v).toLowerCase();if(/^reg/.test(s))return'Regeneration';if(/^dev/.test(s))return'Development';if(/^(?:over|ol)/.test(s))return'Overload';if(/^(?:thr|threshold)/.test(s))return'Threshold';if(/^(?:clear|cl)/.test(s))return'Clearance';return'';};
  function applyZoneTransition(item){
    if(!item||item.kind!=='set')return item;
    const raw=text([item.raw,item.text,...(item.cues||[])].filter(Boolean).join(' '));
    const m=raw.match(/\b(Regeneration|Regen|Reg|Development|Dev|Overload|OL|Threshold|Thr|Clearance|CL)\s*(?:to|→|->)\s*(Regeneration|Regen|Reg|Development|Dev|Overload|OL|Threshold|Thr|Clearance|CL)\b/i);
    const reps=Math.max(1,Number(item.reps)||1);if(!m||reps<2)return item;
    const from=zoneName(m[1]),to=zoneName(m[2]);if(!from||!to||from===to)return item;
    const first=Math.ceil(reps/2);item.zone='';item.repPattern=Array.from({length:reps},(_,i)=>({rep:i+1,zone:i<first?from:to}));
    item.zoneTransition={from,to,split:[first,reps-first],source:'coach-authored transition phrase'};
    return item;
  }
  function applySessionTransitions(session){
    const walk=items=>{for(const item of items||[]){if(item?.kind==='group')walk(item.items||[]);else applyZoneTransition(item);}};
    for(const b of session?.blocks||[])walk(b.items||[]);return session;
  }
  if(M.parser?.parse){const priorParse=M.parser.parse.bind(M.parser);M.parser.parse=(source,identity={})=>applySessionTransitions(priorParse(source,identity));}
  Q.applyZoneTransition=applyZoneTransition;Q.applySessionTransitions=applySessionTransitions;
  function upgradeExisting(){const seen=new Set(),rows=[current(),...(M.state?.sessions||[]),...(M.state?.canonicalSessions||[])].filter(Boolean);for(const s of rows){if(seen.has(s))continue;seen.add(s);applySessionTransitions(s);}return seen.size;}
  Q.upgradeExisting=upgradeExisting;upgradeExisting();if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{upgradeExisting();E.Coordinator?.clearCache?.();},{once:true});
  const MODEL={
    M:{
      Freestyle:{100:{parts:[.4754,.5246],unit:50,dive25:.4554},200:{parts:[.2334,.2532,.2570,.2564],unit:50,dive25:.4487},400:{parts:[.2431,.2550,.2547,.2478],unit:100,dive50:.4798},1500:{parts:[.1970,.2012,.2013,.2014,.1991],unit:300,dive50:.1543}},
      Backstroke:{100:{parts:[.4858,.5142],unit:50,dive25:.4611},200:{parts:[.2359,.2517,.2567,.2554],unit:50,dive25:.4581}},
      Breaststroke:{100:{parts:[.4660,.5340],unit:50,dive25:.4525},200:{parts:[.2301,.2554,.2578,.2567],unit:50,dive25:.4539}},
      Butterfly:{100:{parts:[.4666,.5333],unit:50,dive25:.4572},200:{parts:[.2221,.2537,.2604,.2623],unit:50,dive25:.4522}},
      IM:{200:{parts:[.2159,.2523,.2917,.2401],unit:50,dive25:.4485},400:{parts:[.2255,.2561,.2814,.2370],unit:100,dive50:.4612}}
    },
    F:{
      Freestyle:{100:{parts:[.4797,.5197],unit:50,dive25:.4555},200:{parts:[.2343,.2526,.2570,.2560],unit:50,dive25:.4583},400:{parts:[.2415,.2535,.2542,.2505],unit:100,dive50:.4831},800:{parts:[.2450,.2525,.2530,.2498],unit:200,dive50:.2403}},
      Backstroke:{100:{parts:[.4851,.5149],unit:50,dive25:.4609},200:{parts:[.2354,.2519,.2555,.2572],unit:50,dive25:.4636}},
      Breaststroke:{100:{parts:[.4688,.5312],unit:50,dive25:.4573},200:{parts:[.2311,.2541,.2564,.2584],unit:50,dive25:.4562}},
      Butterfly:{100:{parts:[.4667,.5333],unit:50,dive25:.4580},200:{parts:[.2258,.2536,.2591,.2617],unit:50,dive25:.4555}},
      IM:{200:{parts:[.2161,.2543,.2902,.2394],unit:50,dive25:.4569},400:{parts:[.2298,.2573,.2842,.2287],unit:100,dive50:.4684}}
    }
  };
  function sexKey(ath,row){const s=text(ath?.sex||ath?.gender||row?.sex||row?.gender).toUpperCase();if(/^(?:M|MALE|BOY|BOYS|MEN)$/.test(s))return'M';if(/^(?:F|FEMALE|GIRL|GIRLS|WOMEN)$/.test(s))return'F';return'';}
  function modelFor(sex,distance,stroke){let x=MODEL?.[sex]?.[stroke]?.[Number(distance)];if(!x&&Number(distance)===800)x=MODEL.F.Freestyle[800];if(!x&&Number(distance)===1500)x=MODEL.M.Freestyle[1500];return x||null;}
  function fiftyProfile(total,sex,distance,stroke){const model=modelFor(sex,distance,stroke);if(!model||!Number.isFinite(Number(total)))return null;const groups=model.parts.map(p=>Number(total)*p),fifties=[];if(model.unit===50)fifties.push(...groups);else{const first=groups[0],first50=model.dive50?first*model.dive50:first/(model.unit/50);fifties.push(first50);const remainCount=model.unit/50-1,remaining=Math.max(0,first-first50);for(let i=0;i<remainCount;i++)fifties.push(remaining/remainCount);for(const group of groups.slice(1)){const count=model.unit/50;for(let i=0;i<count;i++)fifties.push(group/count);}}const dive25=model.dive25&&fifties[0]?fifties[0]*model.dive25:null;return{fifties,dive25,model};}
  function cumulative(profile,distance){const d=Math.max(0,Number(distance)||0),full=Math.floor(d/50),rem=d-full*50;let s=0;for(let i=0;i<full&&i<profile.fifties.length;i++)s+=profile.fifties[i];if(rem&&full<profile.fifties.length)s+=profile.fifties[full]*(rem/50);return s;}
  function ordinal(v){const s=text(v).toLowerCase();if(/\b(?:1st|first)\b/.test(s))return 1;if(/\b(?:2nd|second)\b/.test(s))return 2;if(/\b(?:3rd|third)\b/.test(s))return 3;if(/\b(?:4th|fourth)\b/.test(s))return 4;if(/\b(?:5th|fifth)\b/.test(s))return 5;return null;}
  function namedSegment(line,eventDistance,workDistance){const s=text(line).toLowerCase();let m=s.match(/\blast\s+(15|25|35|50|65|75|100)\b/);if(m){const n=Number(m[1]);return{start:Math.max(0,eventDistance-n),length:n,label:`last ${n}`};}m=s.match(/\b(1st|first|2nd|second|3rd|third|4th|fourth|5th|fifth)\s*50\b/);if(m){const n=ordinal(m[1]);return{start:(n-1)*50,length:50,label:`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'} 50`};}m=s.match(/\bfirst\s+(15|25|35|50|65|75|100)\b/);if(m)return{start:0,length:Number(m[1]),label:`first ${m[1]}`};return null;}
  const imStrokeIndex=stroke=>({Butterfly:0,Backstroke:1,Breaststroke:2,Freestyle:3})[stroke];
  const pushFirst50=profile=>profile?.dive25!=null&&profile?.fifties?.[0]!=null?Math.max(0,(profile.fifties[0]-profile.dive25)*2):null;
  const priorRacePace=R.racePace.bind(R),priorForItem=R.forItem.bind(R);
  function modelRacePace(total,eventDistance,workDistance,{item,athlete,stroke,pbRow=null,course='SCM'}={}){
    const event=Number(eventDistance),work=Number(workDistance),raw=text(item?.raw||item?.text),st=E.Evidence?.stroke?E.Evidence.stroke(stroke):String(stroke||'');
    if(text(course).toUpperCase()!=='SCM'){const x=priorRacePace(total,event,work,{item,athlete,stroke,pbRow});if(x&&!x.missing&&/PB race-pace average/i.test(x.source||''))x.source='Estimated average fallback · no SCM race model';return x;}
    const stored=priorRacePace(total,event,work,{item,athlete,stroke,pbRow});if(stored&&!stored.missing&&/^Stored /i.test(stored.source||''))return stored;
    const sex=sexKey(athlete,pbRow),eventStroke=st||stroke,profile=fiftyProfile(total,sex,event,eventStroke);
    if(!profile){const x=priorRacePace(total,event,work,{item,athlete,stroke,pbRow});if(x&&!x.missing&&/PB race-pace average/i.test(x.source||''))x.source='Estimated average fallback · unsupported race model';return x;}
    const workStroke=E.Evidence?.stroke?E.Evidence.stroke(item?.stroke||''):text(item?.stroke);
    const named=namedSegment(raw,event,work),push=/\bpush\b/i.test(raw),dive=/\b(?:dive|race\s*start|from\s+blocks?)\b/i.test(raw);
    if(named){let start=named.start,length=named.length;if(eventStroke==='IM'&&event===200&&workStroke&&workStroke!=='IM'){const leg=imStrokeIndex(workStroke);if(leg!=null&&!/\b(?:1st|first|2nd|second|3rd|third|4th|fourth)\s*50\b/i.test(raw))start=leg*50+start;}if(push&&start===0&&length===50){const v=pushFirst50(profile);if(v!=null)return{seconds:v,source:'Race planning model · push first 50',model:'Short Course Race Planning Calculator'};}return{seconds:cumulative(profile,start+length)-cumulative(profile,start),source:`Race planning model · exact ${named.label}`,model:'Short Course Race Planning Calculator'};}
    if(dive){const d=Math.min(work,event);return{seconds:cumulative(profile,d),source:`Race planning model · dive ${d}`,model:'Short Course Race Planning Calculator'};}
    if(eventStroke==='IM'&&event===200){const idx=imStrokeIndex(workStroke);if(idx==null)return{missing:true,message:'Exact IM leg race model not loaded'};let pace50=profile.fifties[idx];if(idx===0){const p=pushFirst50(profile);if(p!=null)pace50=p;}return{seconds:pace50*(work/50),source:`Race planning model · 200 IM ${workStroke} leg`,model:'Short Course Race Planning Calculator'};}
    if(eventStroke==='IM'&&event===400){const idx=imStrokeIndex(workStroke);if(idx==null)return{missing:true,message:'Exact IM leg race model not loaded'};const a=profile.fifties[idx*2],b=profile.fifties[idx*2+1],pace50=idx===0?b:(a+b)/2;return{seconds:pace50*(work/50),source:`Race planning model · 400 IM ${workStroke} pace`,model:'Short Course Race Planning Calculator'};}
    const nonDive=profile.fifties.slice(1),pace50=nonDive.length?nonDive.reduce((a,b)=>a+b,0)/nonDive.length:null;if(!pace50)return null;return{seconds:pace50*(work/50),source:'Race planning model · generic non-dive 50 average',model:'Short Course Race Planning Calculator'};
  }
  function intentOverride(item,intent,manual='',extra=''){if(manual&&manual!=='AUTO')return manual;const raw=text(`${item?.raw||item?.text||''} ${extra}`);if(/#\s*1F?\b/i.test(raw))return'';return intent?.eventStroke||'';}
  function forItem(session,item,ath,state,strokeOverride=''){
    const course=text(session?.identity?.course||'SCM').toUpperCase();if(!item?.raceIntent&&!item?.repInstructions?.some(x=>x.raceIntent))return priorForItem(session,item,ath,state,strokeOverride);
    if(item?.repInstructions?.some(x=>x.raceIntent)){const rows=[],resolved=new Map(),anchors=new Map();for(const rep of item.repInstructions){if(!rep.raceIntent){rows.push({rep:rep.rep,status:'none',label:rep.label||'Build'});continue;}const extra=rep.label||'',io=intentOverride(item,rep.raceIntent,strokeOverride,extra),rk=`${rep.raceIntent.distance}|${io}|${strokeOverride}`;let st=resolved.get(rk);if(st===undefined){st=R.resolveStroke({...item,raw:`${item.raw||''} ${extra}`},ath,state,course,io)||'';resolved.set(rk,st);}if(!st){rows.push({rep:rep.rep,status:'missing',message:'#1 stroke needed'});continue;}const ak=`${rep.raceIntent.distance}|${st}`;let p=anchors.get(ak);if(p===undefined){p=R.anchor(ath,state,{distance:rep.raceIntent.distance,stroke:st,course})||null;anchors.set(ak,p);}if(!p){rows.push({rep:rep.rep,status:'missing',message:`${st} PB needed`,stroke:st});continue;}const rp=modelRacePace(p._anchor_seconds,rep.raceIntent.distance,item.distance,{item:{...item,raw:`${item.raw||''} ${extra}`},athlete:ath,stroke:st,pbRow:p,course});rows.push(rp?.missing?{rep:rep.rep,status:'missing',message:rp.message,stroke:st}:{rep:rep.rep,status:'ok',seconds:rp.seconds,sendOff:item.cycleSeconds||null,source:`${p._anchor_source} · ${rp.source}`,stroke:st,modeled:!!p._modeled,raceModel:rp.model||''});}return{status:'rep_race',rows,stroke:rows.find(x=>x.stroke)?.stroke||''};}
    const io=intentOverride(item,item.raceIntent,strokeOverride,''),st=R.resolveStroke(item,ath,state,course,io);if(!st)return{status:'missing',message:'#1 stroke needed'};const p=R.anchor(ath,state,{distance:item.raceIntent.distance,stroke:st,course});if(!p)return{status:'missing',message:`${st} PB needed`,stroke:st};const rp=modelRacePace(p._anchor_seconds,item.raceIntent.distance,item.distance,{item,athlete:ath,stroke:st,pbRow:p,course});return rp?.missing?{status:'missing',message:rp.message,stroke:st}:{status:'ok',seconds:rp.seconds,sendOff:item.cycleSeconds||null,source:`${p._anchor_source} · ${rp.source}`,stroke:st,modeled:!!p._modeled,raceModel:rp.model||''};
  }
  R.racePace=modelRacePace;R.forItem=forItem;Q.racePace=modelRacePace;Q.raceForItem=forItem;Q.RACE_MODEL=MODEL;E.Coordinator?.clearCache?.();
  const priorAdapt=Mod.adaptItem.bind(Mod);const descRe=/\bDesc(?:end(?:ing)?)?\s*1\s*(?:[-–—]|to)\s*(\d+)\b/ig;
  function activeOverride(session,item,ath,state){return(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;}
  function manualShape(ov){if(!ov)return false;if(ov.raw)return true;const p=ov.patch||{};return['reps','distance','cycleSeconds','restSeconds','equipment','raw','text'].some(k=>Object.prototype.hasOwnProperty.call(p,k));}
  function sourceDesc(item){const s=text([item?.raw,item?.text,...(item?.cues||[]),...(item?.pattern||[]).map(x=>x?.text||''),...(item?.repInstructions||[]).map(x=>x?.label||'')].join(' '));let max=0;for(const m of s.matchAll(new RegExp(descRe.source,'ig')))max=Math.max(max,Number(m[1])||0);return max;}
  function buildFast(out){const fix=s=>text(s).replace(new RegExp(descRe.source,'ig'),'1 Build / 1 Fast');let touched=false;for(const k of ['raw','text'])if(out[k]){const next=fix(out[k]);if(next!==text(out[k]))touched=true;out[k]=next;}if(Array.isArray(out.cues))out.cues=out.cues.map(c=>{const n=fix(c);if(n!==text(c))touched=true;return n;});if(Array.isArray(out.pattern))out.pattern=out.pattern.map(x=>{const n=fix(x.text||'');if(n!==text(x.text||''))touched=true;return{...x,text:n};});if(Array.isArray(out.repInstructions))out.repInstructions=out.repInstructions.map(x=>{const n=fix(x.label||'');if(n!==text(x.label||''))touched=true;return{...x,label:n};});if(out.repeatBreakdownCue){const n=fix(out.repeatBreakdownCue);if(n!==text(out.repeatBreakdownCue))touched=true;out.repeatBreakdownCue=n;}if(!touched&&!out.cues?.some(c=>/1 Build\s*\/\s*1 Fast/i.test(c))){out.cues=[...(out.cues||[]),'1 Build / 1 Fast'];}out.descendAdaptation='build_fast';out.adaptationReason=[text(out.adaptationReason),'2-rep Desc → 1 Build / 1 Fast'].filter(Boolean).join(' · ');return out;}
  function postDesc(source,out,ath,state,session){if(!source||!out)return out;if(source.kind==='group'&&out.kind==='group'){out.items=(out.items||[]).map((x,i)=>postDesc(source.items?.[i],x,ath,state,session));return out;}if(source.kind!=='set'||out.kind!=='set')return out;const desc=sourceDesc(source),ov=activeOverride(session,source,ath,state);if(desc>=3&&Number(out.reps)===2&&!manualShape(ov))return buildFast(clone(out));return out;}
  function adapt(item,ath,state=M.state,session=current()){return postDesc(item,priorAdapt(item,ath,state,session),ath,state,session);}
  Mod.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;if(M.adaptiveDelivery)M.adaptiveDelivery.adaptItem=adapt;if(M.phoneAcceptanceAO)M.phoneAcceptanceAO.adaptItem=adapt;if(M.amberRatioAP)M.amberRatioAP.adaptItem=adapt;if(M.amberAlignmentAQ)M.amberAlignmentAQ.adaptItem=adapt;if(M.amberAlignmentAS)M.amberAlignmentAS.adaptItem=adapt;if(M.amberAlignmentAT)M.amberAlignmentAT.adaptItem=adapt;
  Q.adaptItem=adapt;Q.sourceDesc=sourceDesc;Q.buildFast=buildFast;Q.checks=()=>({zoneTransition:'4 reps → 2 Overload + 2 Threshold',raceModel:'SCM calculator non-dive pace restored',descTwo:'automatic 2 reps → 1 Build / 1 Fast'});
})(globalThis);
