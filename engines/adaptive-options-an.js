'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines,UI=M?.ui;if(!M||!E?.Modification||!UI)return;
  const A=M.adaptiveDeliveryAN={build:'v4-adaptive-calendar-20260821an'};
  const prior=M.adaptiveDelivery;
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'');
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const activeOverride=(session,item,ath,state=M.state)=>(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;
  const AMBER_MODES=prior?.AMBER_MODES||Object.freeze([{id:'Pull',label:'Pull'},{id:'Swim',label:'Swim'},{id:'Paddles',label:'Paddles'},{id:'Drill',label:'Drill'},{id:'Scull',label:'Scull',scullCyclePer50:120,note:'Very slow · allow up to 2:00 per 50'},{id:'Body alignment',label:'Body alignment'}]);
  const AMBER_STROKES=Object.freeze(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice']);
  const modeIds=AMBER_MODES.map(x=>x.id);
  function rewrite(out,label){const reps=Math.max(1,Number(out?.reps)||1),d=Number(out?.distance)||0,cycle=Number(out?.cycleSeconds)||0;out.raw=`${reps} × ${d} ${label}${cycle?` @ ${clock(cycle)}`:''}`;out.text=out.raw;return out;}
  function applyAmberRequested(out,item,ath,state,session){
    if(key(ath)!=='amberproudfoot'||!out||item?.kind!=='set')return out;
    const raw=text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));
    const constrained=/\b(?:kick|fins?|underwater|dive|start)\b/i.test(raw)||Array.isArray(out.adaptiveOptions);
    if(!constrained)return out;
    const ov=activeOverride(session,item,ath,state),requested=text(ov?.patch?.adaptiveMode);
    if(!requested||!modeIds.includes(requested)||requested===out.adaptiveMode)return out;
    const stroke=E.Evidence?.stroke?.(ov?.patch?.stroke||'Choice')||'Choice';
    out.adaptiveOptions=AMBER_MODES.map(x=>({...x}));out.adaptiveStrokeChoices=[...AMBER_STROKES];out.adaptiveMode=requested;out.adaptiveRuleStatus='coach-confirmed';out.adaptiveNote='Upper-body variation · all strokes available · Scull very slow, up to 2:00 per 50';
    out.equipment=[...(out.equipment||[])].filter(x=>!/\b(?:Fins?|Kick)\b/i.test(String(x)));
    let label='';
    if(requested==='Pull')label=`Upper-body ${stroke} Pull`;
    else if(requested==='Paddles'){label=`Upper-body ${stroke} Paddles`;if(!out.equipment.some(x=>/paddles/i.test(String(x))))out.equipment.push('Paddles');}
    else if(requested==='Swim')label=`Upper-body ${stroke} Swim`;
    else if(requested==='Drill')label=`Upper-body ${stroke} Drill`;
    else if(requested==='Scull'){label=`Upper-body ${stroke} Scull`;const min=ceil5((Number(out.distance)||50)/50*120);if(Number(out.cycleSeconds||0)<min)out.cycleSeconds=min;}
    else label='Upper-body Body alignment';
    rewrite(out,label);out.adaptationReason=`Amber adaptive upper-body · ${requested}`;
    out.cues=[...(out.cues||[]).filter(x=>!/^Adaptive options:/i.test(text(x))),`Adaptive options: Pull / Swim / Paddles / Drill / Scull / Alignment`];return out;
  }
  const priorAdapt=E.Modification.adaptItem.bind(E.Modification);
  const adapt=(item,ath,state=M.state,session=M.currentSession?.()||null)=>applyAmberRequested(priorAdapt(item,ath,state,session),item,ath,state,session);
  E.Modification.adaptItem=adapt;if(M.adapt)M.adapt.item=adapt;
  A.adaptItem=adapt;A.activeOverride=activeOverride;A.AMBER_MODES=AMBER_MODES;A.AMBER_STROKES=AMBER_STROKES;
  A.checks=()=>({...(prior?.checks?.()||{}),statePureOverrides:true,amberModes:[...modeIds],amberStrokes:[...AMBER_STROKES]});
  // Preserve existing UI/session/calendar helpers while making the canonical adaptive engine state-pure.
  if(prior){for(const k of ['hidePastBlank','sessionStatus','sessionEvidence','CONOR_MODES'])if(prior[k]!==undefined)A[k]=prior[k];M.adaptiveDelivery={...prior,...A,adaptItem:adapt,checks:A.checks};}
})(globalThis);
