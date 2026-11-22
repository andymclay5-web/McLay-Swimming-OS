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

  const merged=new Map();
  R.get=key=>{
    const heavy=Array.isArray(R.data?.[key])?R.data[key]:[],localRaw=M.state?.[stateMap[key]||key],local=Array.isArray(localRaw)?localRaw:[];
    if(!local.length)return heavy;
    if(!heavy.length)return local;
    // Reference/cache rows are authoritative for an athlete represented in that dataset.
    // Local state may supplement other athletes, but must not leak a second identity for the same swimmer
    // (for example `elsie` vs `athlete-elsie-knowles`) into pathway/PB selection.
    // 23 Nov 2026 (freeze recorder, Andy's phone: 34 s stuck building Matthew's performance page): this compared every
    // phone row with every reference row (3,344 x 3,344, each comparison looking up the roster) on EVERY call, and the
    // pathway asks for results many times per swimmer. Same rule, worked out once per swimmer identity (an athlete id +
    // name pair -- there are about a hundred, not thousands), and the merged list is kept until either list changes.
    const stamp=`${heavy.length}|${local.length}|${(M.state?.athletes||[]).length}`,hit=merged.get(key);
    if(hit&&hit.heavy===heavy&&hit.local===local&&hit.stamp===stamp)return hit.rows;
    let base=local;
    if(resultKeys.has(key)){const idOf=x=>`${athleteId(x)}\u0001${rowName(x)}`;const refs=new Map();for(const h of heavy){const k=idOf(h);if(!refs.has(k))refs.set(k,h);}
      const reps=[...refs.values()],seen=new Map();
      base=local.filter(x=>{const k=idOf(x);if(!seen.has(k))seen.set(k,reps.some(h=>sameAthleteReference(h,x)));return!seen.get(k);});}
    const map=new Map();for(const x of base)map.set(keyOf(key,x),x);for(const x of heavy)map.set(keyOf(key,x),x);const rows=[...map.values()];
    merged.set(key,{heavy,local,stamp,rows});return rows;
  };
  R.sameAthleteReference=sameAthleteReference;
  M.referenceAuthority={build:BUILD};
})(globalThis);
