'use strict';
(function(root,factory){const api=factory(root.MSOSEngines||{});if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Coordinator=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  const VERSION='2.1.0',text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const cache=new Map();
  function overrideStroke(item,ath,state,session){const ov=(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false),s=ov?.patch?.stroke;return s||''}
  function suppress(item){const raw=[item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '),hasRace=!!item?.raceIntent||item?.repInstructions?.some(x=>x.raceIntent);if(hasRace)return'';if(/^Choice$/i.test(text(item?.stroke))||/\bChoice\b/i.test(raw))return'Choice';if(/\b(?:Drill|Scull|Technique|Easy|Recovery|Reset|Warm\s*-?down|Cool\s*-?down|5HR|Kick|Underwater|Dive|Start|Finish|Max|Sprint)\b/i.test(raw)&&!item?.zone)return'Non-target work';return''}
  function itemKey(item){return [item?.id,item?.reps,item?.distance,item?.stroke,item?.zone,item?.restSeconds,item?.cycleSeconds,item?.raw,item?.text,JSON.stringify(item?.repPattern||[]),JSON.stringify(item?.repInstructions||[]),JSON.stringify(item?.raceIntent||null)].join('|')}
  function cacheKey(session,item,ath,state,ov){return [Number(state?.settings?.storageRevision||0),session?.id||'',ath?.id||'',ov||'',itemKey(item)].join('::')}
  function compute(session,item,ath,state,ov){if(item?.targetSeconds)return{status:'ok',seconds:Number(item.targetSeconds),sendOff:item.cycleSeconds||null,source:'Coach target'};if(suppress(item))return{status:'none'};if(item?.raceIntent||item?.repInstructions?.some(x=>x.raceIntent))return E.RacePace.forItem(session,item,ath,state,ov);if(item?.zone||item?.repPattern?.length)return E.Aerobic.forItem(session,item,ath,state,ov);return{status:'none'}}
  function targetForItem(session,item,ath,state){const ov=overrideStroke(item,ath,state,session),k=cacheKey(session,item,ath,state,ov);if(cache.has(k))return cache.get(k);const out=compute(session,item,ath,state,ov);cache.set(k,out);if(cache.size>1500){const first=cache.keys().next().value;cache.delete(first)}return out}
  function prescription(session,item,ath,state){const modified=E.Modification.adaptItem(item,ath,state,session),target=targetForItem(session,modified,ath,state);return{item:modified,target,athlete:ath,sessionId:session?.id,evidence:{source:target?.source||'',status:target?.status||'none'}}}
  function clearCache(){cache.clear()}
  return{VERSION,targetForItem,prescription,overrideStroke,clearCache};
});
