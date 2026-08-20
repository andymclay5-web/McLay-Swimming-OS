'use strict';
(function(g){
  const M=g.MSOS4,R=M?.refs,U=M?.util;if(!M||!R?.get)return;
  const B=M.referenceBridge={build:'v4-reference-bridge-20260820s'};
  const baseGet=R.get.bind(R);
  const stateMap={
    coach_results:'coachResults',
    results_pb_board:'resultsPbBoard',
    results_event_history:'resultsEventHistory',
    world_aquatics_base_times:'worldAquaticsBaseTimes',
    course_conversions:'courseConversions',
    athlete_achievements:'athleteAchievements'
  };
  R.get=key=>{
    const heavy=baseGet(key)||[],stateKey=stateMap[key]||key,local=M.state?.[stateKey];
    if(!Array.isArray(local)||!local.length)return heavy;
    const map=new Map();for(const x of heavy)if(x)map.set(x.id||U.hash(JSON.stringify(x)),x);for(const x of local)if(x)map.set(x.id||U.hash(JSON.stringify(x)),x);return[...map.values()];
  };
  B.get=R.get;
})(globalThis);
