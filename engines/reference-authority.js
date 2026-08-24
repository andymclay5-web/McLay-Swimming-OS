'use strict';
(function(g){
  const M=g.MSOS4,R=M?.refs,U=M?.util;if(!M||!R?.get)return;
  const BUILD='v4-reference-authority-20260824',text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const stateMap={coach_results:'coachResults',results_pb_board:'resultsPbBoard',results_event_history:'resultsEventHistory',pathway_standards:'pathwayStandards',world_aquatics_base_times:'worldAquaticsBaseTimes'};
  const keyOf=(key,x)=>{if(['results_pb_board','coach_results','results_event_history'].includes(key))return [x?.athlete_id||x?.athleteId,text(x?.course||x?.pool_course).toUpperCase(),Number(x?.distance||x?.event_distance)||'',text(x?.stroke||x?.event_stroke).toLowerCase()].join('|');return String(x?.id||U?.hash?.(JSON.stringify(x))||JSON.stringify(x));};
  R.get=key=>{
    const heavy=Array.isArray(R.data?.[key])?R.data[key]:[],localRaw=M.state?.[stateMap[key]||key],local=Array.isArray(localRaw)?localRaw:[];
    if(!local.length)return heavy;
    if(!heavy.length)return local;
    const heavyAthletes=new Set(heavy.map(x=>String(x?.athlete_id||x?.athleteId||'')).filter(Boolean));
    const base=heavyAthletes.size?local.filter(x=>!heavyAthletes.has(String(x?.athlete_id||x?.athleteId||''))):local;
    const map=new Map();for(const x of base)map.set(keyOf(key,x),x);for(const x of heavy)map.set(keyOf(key,x),x);return [...map.values()];
  };
  M.referenceAuthority={build:BUILD};
})(globalThis);
