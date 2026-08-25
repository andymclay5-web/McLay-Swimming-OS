'use strict';
(function(g){
  const M=g.MSOS4,R=M?.refs,U=M?.util,E=g.MSOSEngines?.Evidence;if(!M||!R?.get)return;
  const BUILD='v4-reference-authority-20260825',text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const stateMap={coach_results:'coachResults',results_pb_board:'resultsPbBoard',results_event_history:'resultsEventHistory',pathway_standards:'pathwayStandards',world_aquatics_base_times:'worldAquaticsBaseTimes'};
  const resultKeys=new Set(['results_pb_board','coach_results','results_event_history']);
  const athleteId=x=>String(x?.athlete_id||x?.athleteId||'').trim();
  const rowName=x=>text(E?.rowName?.(x)||x?.full_name||x?.athlete_name||x?.swimmer_name||x?.match_name||x?.source_swimmer_name||'');
  const nameKey=v=>text(v).toLowerCase().replace(/[-_]+/g,' ').replace(/[^a-z0-9 ]+/g,' ').trim();
  const keyOf=(key,x)=>{if(resultKeys.has(key))return [athleteId(x),text(x?.course||x?.pool_course).toUpperCase(),Number(x?.distance||x?.event_distance)||'',text(x?.stroke||x?.event_stroke).toLowerCase()].join('|');return String(x?.id||U?.hash?.(JSON.stringify(x))||JSON.stringify(x));};

  function rosterAthleteFor(row){
    const roster=Array.isArray(M.state?.athletes)?M.state.athletes:[],id=athleteId(row),name=rowName(row);
    if(id){const direct=roster.find(a=>String(a?.id||a?.athlete_id||'')===id);if(direct)return direct;}
    if(name&&E?.sameName){const named=roster.filter(a=>E.sameName(name,a?.full_name||a?.display_name||a?.preferred_name||''));if(named.length===1)return named[0];}
    if(!id)return null;
    // Some controlled/reference datasets use a stable short-name id while live rows use the roster UUID/id.
    // Resolve that only when it identifies exactly one roster athlete; ambiguous first names remain unresolved.
    const idWords=nameKey(id.replace(/^athlete[\s_-]*/i,'')).split(/\s+/).filter(Boolean);
    if(!idWords.length)return null;
    const candidates=roster.filter(a=>{
      const full=nameKey(a?.full_name||a?.display_name||a?.preferred_name||''),parts=full.split(/\s+/).filter(Boolean);
      if(!parts.length)return false;
      if(idWords.length>=2)return full===idWords.join(' ')||(E?.sameName?.(idWords.join(' '),full)===true);
      return parts[0]===idWords[0];
    });
    return candidates.length===1?candidates[0]:null;
  }

  function sameAthleteReference(referenceRow,localRow){
    const a=athleteId(referenceRow),b=athleteId(localRow);if(a&&b&&a===b)return true;
    const refAth=rosterAthleteFor(referenceRow);if(refAth&&E?.sameAthlete?.(localRow,refAth,M.state))return true;
    const rn=rowName(referenceRow),ln=rowName(localRow);if(rn&&ln&&E?.sameName?.(rn,ln))return true;
    return false;
  }

  R.get=key=>{
    const heavy=Array.isArray(R.data?.[key])?R.data[key]:[],localRaw=M.state?.[stateMap[key]||key],local=Array.isArray(localRaw)?localRaw:[];
    if(!local.length)return heavy;
    if(!heavy.length)return local;
    // Reference/cache rows are authoritative for an athlete represented in that dataset.
    // Local state may supplement other athletes, but must not leak a second identity for the same swimmer
    // (for example `elsie` vs `athlete-elsie-knowles`) into pathway/PB selection.
    const base=resultKeys.has(key)?local.filter(x=>!heavy.some(h=>sameAthleteReference(h,x))):local;
    const map=new Map();for(const x of base)map.set(keyOf(key,x),x);for(const x of heavy)map.set(keyOf(key,x),x);return [...map.values()];
  };
  R.sameAthleteReference=sameAthleteReference;
  M.referenceAuthority={build:BUILD};
})(globalThis);
