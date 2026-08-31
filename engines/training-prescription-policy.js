'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.TrainingPolicy=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.0-20260831';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const rawOf=i=>text([i?.raw,i?.text,...(i?.cues||[])].filter(Boolean).join(' '));
  function isKick(item){return /\bkick\b/i.test(rawOf(item));}
  function isRacePace(item){return !!(item?.raceIntent||(item?.repInstructions||[]).some(x=>x?.raceIntent)||/\b(?:50|100|200|400)\s*(?:m\s*)?(?:race\s*)?pace\b/i.test(rawOf(item)));}
  function isAerobic(item){return !!(item?.zone||(item?.repPattern||[]).length||/\b(?:regeneration|development|overload|threshold|clearance|aerobic)\b/i.test(rawOf(item)));}
  function authoredRest(item){const r=Number(item?.restSeconds);return Number.isFinite(r)&&r>0?r:null;}
  function authoredCycle(item){const c=Number(item?.cycleSeconds);return Number.isFinite(c)&&c>0?c:null;}
  function preserveLongerAuthoredCycle(item,calculated){const authored=authoredCycle(item),next=Number(calculated)||0;return authored!=null&&authored>next?authored:next;}
  function aerobicRestSeconds(item){const authored=authoredRest(item);if(authored!=null)return clamp(authored,5,60);const c=Number(item?.cycleSeconds),t=Number(item?.targetSeconds);if(c>0&&t>0&&c>t)return clamp(c-t,10,30);return 20;}
  function raceDistance(item){const direct=Number(item?.raceIntent?.distance);if(direct)return direct;for(const x of item?.repInstructions||[]){const d=Number(x?.raceIntent?.distance);if(d)return d;}const m=rawOf(item).match(/\b(50|100|200|400)\s*(?:m\s*)?(?:race\s*)?pace\b/i);return m?Number(m[1]):null;}
  function groupWorkRest(item,referenceWorkSeconds){const cycle=Number(item?.cycleSeconds)||0,work=Number(referenceWorkSeconds)||0;if(!(cycle>0&&work>0&&cycle>work))return null;const rest=cycle-work;return{work,rest,ratio:rest/work,cycle};}
  function racePaceRestSeconds(item,targetSeconds,referenceWorkSeconds){
    const target=Number(targetSeconds)||0;if(!target)return null;const race=raceDistance(item),group=groupWorkRest(item,referenceWorkSeconds);
    let minRest=20,minRatio=.5,maxRest=150;
    if(race===100){minRest=60;minRatio=1.0;maxRest=150;}
    else if(race===200){minRest=30;minRatio=.45;maxRest=90;}
    else if(race===50){minRest=90;minRatio=1.5;maxRest=180;}
    if(group){const comparable=group.ratio;minRatio=Math.max(minRatio,comparable*.75);}
    let rest=Math.max(minRest,target*minRatio);
    if(race===100&&target>=50)rest=Math.max(rest,60);
    if(race===200&&target>=55)rest=Math.max(rest,30);
    return ceil5(Math.min(maxRest,rest));
  }
  function kickCycleSeconds(item,ath,volumeRatio=1){
    if(!isKick(item)||Number(item?.distance)!==50)return null;
    const authored=authoredCycle(item)||0,k=key(ath);let floor=0;
    if(k==='mckenziedrage'||k==='mackenziedrage')floor=90;
    else if(k==='charlottemurphy')floor=135;
    else if(authored&&Number(volumeRatio)<.98)floor=ceil5(authored/Math.max(.5,Number(volumeRatio)||1));
    else floor=authored;
    return Math.max(authored,floor)||null;
  }
  function safeCycle({item,targetSeconds,referenceWorkSeconds,athlete,volumeRatio=1}){
    const target=Number(targetSeconds)||0;
    if(isKick(item)){const cycle=kickCycleSeconds(item,athlete,volumeRatio);return cycle?{cycleSeconds:cycle,restSeconds:target>0?Math.max(0,cycle-target):null,owner:'kick',authoredCycleSeconds:authoredCycle(item)}:null;}
    if(isRacePace(item)&&target>0){const requiredRest=racePaceRestSeconds(item,target,referenceWorkSeconds),requiredCycle=ceil5(target+requiredRest),cycle=preserveLongerAuthoredCycle(item,requiredCycle);return{cycleSeconds:cycle,restSeconds:Math.max(requiredRest,cycle-target),owner:'race-pace',raceDistance:raceDistance(item),authoredCycleSeconds:authoredCycle(item),requiredCycleSeconds:requiredCycle};}
    if(isAerobic(item)&&target>0){const requiredRest=aerobicRestSeconds(item),requiredCycle=ceil5(target+requiredRest),cycle=preserveLongerAuthoredCycle(item,requiredCycle);return{cycleSeconds:cycle,restSeconds:Math.max(requiredRest,cycle-target),owner:'aerobic',authoredCycleSeconds:authoredCycle(item),requiredCycleSeconds:requiredCycle};}
    return null;
  }
  return{VERSION,isKick,isRacePace,isAerobic,raceDistance,groupWorkRest,aerobicRestSeconds,racePaceRestSeconds,kickCycleSeconds,safeCycle,preserveLongerAuthoredCycle};
});
