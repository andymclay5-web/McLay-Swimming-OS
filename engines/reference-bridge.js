'use strict';
(function(g){
  const M=g.MSOS4,R=M?.refs,U=M?.util;if(!M||!R?.get)return;
  const B=M.referenceBridge={build:'v4-reference-bridge-20260820u'},cache=new Map();
  const baseGet=R.get.bind(R),baseBoot=R.boot?.bind(R);let bootPromise=null;
  const stateMap={coach_results:'coachResults',results_pb_board:'resultsPbBoard',results_event_history:'resultsEventHistory',world_aquatics_base_times:'worldAquaticsBaseTimes',course_conversions:'courseConversions',athlete_achievements:'athleteAchievements'};
  if(baseBoot)R.boot=()=>bootPromise||(bootPromise=Promise.resolve(baseBoot()).finally(()=>{B.booted=true;}));
  function activeRegistryRows(key){const D=M.dataRegistry;if(!D)return null;if(key==='world_aquatics_base_times'){const meta=D.activeMeta?.('wa_points'),rows=D.activeRowsSync?.('wa_points')||[];return meta&&rows.length?rows:null;}if(/qualif|standard/i.test(key)){const nat=D.activeRowsSync?.('national_standards')||[],meet=D.activeRowsSync?.('meet_qualifying')||[],has=D.activeMeta?.('national_standards')||D.activeMeta?.('meet_qualifying');return has?[...nat,...meet]:null;}return null;}
  R.get=key=>{const registry=activeRegistryRows(key);if(registry)return registry;const heavy=baseGet(key)||[],stateKey=stateMap[key]||key,local=M.state?.[stateKey],active=M.state?.dataRegistry?.active||{},stamp=`${heavy.length}|${Array.isArray(local)?local.length:0}|${M.state?._evidenceBridge?.hydratedAt||''}|${active.wa_points||''}|${active.national_standards||''}|${active.meet_qualifying||''}`;const hit=cache.get(key);if(hit?.stamp===stamp)return hit.rows;if(!Array.isArray(local)||!local.length){cache.set(key,{stamp,rows:heavy});return heavy;}const map=new Map();for(const x of heavy)if(x)map.set(x.id||U.hash(JSON.stringify(x)),x);for(const x of local)if(x)map.set(x.id||U.hash(JSON.stringify(x)),x);const rows=[...map.values()];cache.set(key,{stamp,rows});return rows;};
  B.get=R.get;B.invalidate=key=>key?cache.delete(key):cache.clear();
})(globalThis);
