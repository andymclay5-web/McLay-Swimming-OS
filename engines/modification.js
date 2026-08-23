'use strict';
(function(root,factory){
  const api=factory(root.MSOSEngines?.Evidence,root.MSOSEngines?.Aerobic);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Modification=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(E,A){
  const VERSION='3.0.0-bu';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const FIXED={charlottemurphy:.50,conorfischer:.50,mckenziedrage:2/3,mackenziedrage:2/3,amberproudfoot:2/3,matthewkofoed:2/3,rubystace:2/3};
  const ZONES=['Regeneration','Development','Overload','Threshold','Clearance'];
  const AMBER_MODES=Object.freeze([
    {id:'Pull',label:'Pull'},
    {id:'Swim',label:'Swim'},
    {id:'Paddles',label:'Paddles'},
    {id:'Drill',label:'Drill'},
    {id:'Scull',label:'Scull',scullCyclePer50:120,note:'Very slow ¬∑ allow up to 2:00 per 50'},
    {id:'Body alignment',label:'Body alignment'}
  ]);
  const AMBER_STROKES=Object.freeze(['Freestyle','Backstroke','Breaststroke','Butterfly','IM','Choice']);
  const CONOR_MODES=Object.freeze([
    {id:'Choice non-Breaststroke',label:'Choice non-Breaststroke'},
    {id:'Freestyle',label:'Freestyle'},
    {id:'Backstroke',label:'Backstroke'},
    {id:'Butterfly',label:'Butterfly'}
  ]);
  const cycleClock=s=>`${Math.floor(Number(s||0)/60)}:${String(Math.round(Number(s||0)%60)).padStart(2,'0')}`;
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;

  function profile(ath,state){
    const rows=state?.adaptationProfiles||state?.athlete_adaptation_profiles||[];
    const aliases=E?.athleteAliases?.(ath,state)||new Set([ath?.id]);
    const p=rows.find(x=>aliases.has(x.athlete_id)&&x.active!==false)||{};
    const k=E?.key?.(ath?.full_name)||text(ath?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
    let ratio=Number(p.default_volume_ratio),ratioSource='profile';
    if(!Number.isFinite(ratio)||ratio<=0){
      if(FIXED[k]){ratio=FIXED[k];ratioSource='legacy-load-fallback';}
      else{ratio=1;ratioSource='none';}
    }
    const clipped=Math.max(.25,Math.min(1,ratio));
    const returnToStart=p.return_to_starting_end===false?false:(p.return_to_starting_end===true||clipped<.98);
    return{ratio:clipped,key:k,label:p.profile_label||ath?.modifications||'',returnToStart,ratioSource};
  }

  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const courseOf=s=>/LCM/i.test(text(s?.identity?.course))?'LCM':'SCM';
  const rawOf=item=>text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));

  function energyZones(item){
    const out=[];
    if(item?.zone)out.push(item.zone);
    for(const p of item?.repPattern||[])if(p?.zone)out.push(p.zone);
    const raw=rawOf(item);
    for(const z of ZONES)if(new RegExp(`\\b${z}|\\b${z.slice(0,3)}`,'i').test(raw))out.push(z);
    return[...new Set(out)];
  }
  function isAerobic(item){return energyZones(item).length>0||/\b(?:aerobic|capacity|vo2)\b/i.test(rawOf(item));}
  function isIM(item){return E?.stroke?.(item?.stroke)==='IM'||/\bIM\b|individual\s+medley/i.test(rawOf(item));}
  function isQuality(item){return /\b(?:max|sprint|race|pace|quality|fast|underwater|dive|start|build|turn|finish)\b/i.test(rawOf(item));}
  function independentSkill(item){return /\b(?:dive|start|turn|finish)\b/i.test(rawOf(item))&&!/\b(?:kick|fins?|underwater)\b/i.test(rawOf(item));}
  function targetDriven(item){return !!(item?.targetSeconds||item?.raceIntent||item?.repInstructions?.some(x=>x?.raceIntent)||item?.zone||(item?.repPattern||[]).length);}
  function sameTeamExposure(item){
    const d=Number(item?.distance)||0,r=Math.max(1,Number(item?.reps)||1),metres=d*r;
    if(isAerobic(item)||d<=0||d>100||metres>300||/\bkick\b/i.test(rawOf(item)))return false;
    return /\b(?:max|sprint|race|pace|quality|fast|underwater|dive|start|drill|scull|skill|build|turn|finish)\b/i.test(rawOf(item));
  }

  function safeReps(reps,distance,ratio,session,returnToStart){
    reps=Math.max(1,Number(reps)||1);if(ratio>=.98)return reps;
    const d=Number(distance)||0,target=reps*d*ratio,c=[];
    for(let r=1;r<=reps;r++){
      const metres=r*d;
      if(returnToStart&&d){const unit=poolLength(session)*2;if(Math.abs(metres/unit-Math.round(metres/unit))>.001)continue;}
      c.push({r,delta:Math.abs(metres-target),metres});
    }
    if(!c.length)return Math.max(1,Math.round(reps*ratio));
    c.sort((a,b)=>a.delta-b.delta||b.metres-a.metres);return c[0].r;
  }
  function safeDistance(distance,ratio,session,returnToStart,minDistance=25){
    const d=Number(distance)||0;if(ratio>=.98||!d)return d;
    const pool=poolLength(session),unit=returnToStart?pool*2:pool,target=Math.max(minDistance,d*ratio),c=[];
    for(let x=unit;x<=d;x+=unit)c.push({d:x,delta:Math.abs(x-target)});
    if(!c.length)return Math.max(pool,Math.round(target/pool)*pool);
    c.sort((a,b)=>a.delta-b.delta||b.d-a.d);return c[0].d;
  }
  function nearestPracticalDistance(distance,session,{returnToStart=false,minDistance=25,maxDistance=null}={}){
    const pool=poolLength(session),unit=returnToStart?pool*2:pool,max=Number(maxDistance)||Math.max(pool,Number(distance)||pool),target=Math.max(minDistance,Number(distance)||pool),c=[];
    for(let d=unit;d<=max;d+=unit)c.push({d,delta:Math.abs(d-target)});
    if(!c.length)return Math.min(max,Math.max(pool,Math.round(target/pool)*pool));
    c.sort((a,b)=>a.delta-b.delta||b.d-a.d);return c[0].d;
  }

  function remapRepPattern(pattern,oldReps,newReps){
    if(!Array.isArray(pattern)||!pattern.length||oldReps===newReps)return clone(pattern||[]);
    const src=Array.from({length:oldReps},(_,i)=>pattern.find(x=>Number(x.rep)===i+1)||pattern[Math.min(pattern.length-1,i)]||{}),out=[];
    for(let i=0;i<newReps;i++){const idx=Math.min(oldReps-1,Math.floor(((i+.5)*oldReps)/newReps));out.push({...clone(src[idx]||{}),rep:i+1});}
    return out;
  }
  function remapRepInstructions(rows,oldReps,newReps){
    if(!Array.isArray(rows)||!rows.length||oldReps===newReps)return clone(rows||[]);
    const src=Array.from({length:oldReps},(_,i)=>rows.find(x=>Number(x.rep)===i+1)||rows[Math.min(rows.length-1,i)]||{}),out=[];
    for(let i=0;i<newReps;i++){const idx=Math.min(oldReps-1,Math.floor(((i+.5)*oldReps)/newReps));out.push({...clone(src[idx]||{}),rep:i+1});}
    return out;
  }
  function remapComposition(rows,oldDistance,newDistance,session){
    if(!Array.isArray(rows)||!rows.length||oldDistance===newDistance)return clone(rows||[]);
    const valid=rows.map(x=>({...clone(x),distance:Number(x.distance)||0})).filter(x=>x.distance>0),total=valid.reduce((n,x)=>n+x.distance,0);
    if(!valid.length||total<=0||newDistance<=0)return clone(rows||[]);
    const pool=poolLength(session),out=[],count=valid.length;let remaining=Number(newDistance);
    for(let i=0;i<count;i++){
      const x=valid[i],left=count-i-1;
      if(i===count-1){out.push({...x,distance:remaining});break;}
      const proportional=newDistance*(x.distance/total),minLeft=left*pool;
      let d=Math.round(proportional/pool)*pool;d=Math.max(pool,d);d=Math.min(Math.max(pool,remaining-minLeft),d);
      out.push({...x,distance:d});remaining-=d;
    }
    if(out.some(x=>x.distance<=0)||Math.abs(out.reduce((n,x)=>n+x.distance,0)-newDistance)>.001)return clone(rows||[]);
    return out;
  }
  function repeatCue(rb,reps){
    const unit=rb?.unit||[],unitReps=Math.max(1,Number(rb?.unitReps)||unit.reduce((n,x)=>n+Math.max(1,Number(x.count)||1),0)||1),total=Math.max(1,Number(reps)||1),rounds=Math.floor(total/unitReps),rem=total%unitReps,expanded=[];
    for(const x of unit)for(let i=0;i<Math.max(1,Number(x.count)||1);i++)expanded.push(text(x.text||'Choice'));
    const core=unit.map(x=>{const n=Math.max(1,Number(x.count)||1),t=text(x.text||'Choice');return `${n>1?n+' ':''}${t}`}).join(' / ');
    let out=rounds?`${rounds} round${rounds===1?'¢∑¢~∑¶¢Î~¢Î~{Zù◊ù≤Xú{Jﬁö:"ü˙ﬁ∂ÍÁ¢Î\¢∑ü∫w-äâÏ wzóö¥ﬁjGh¬z.∂ .≠«ú¢{-≠