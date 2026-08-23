'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const F=M.contractFixesAL={build:'v4-contract-fixes-20260824cf'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=/\b([2-9]|[12]\d|30)(800|400|200|150|100|75|50|35|25)s\b/gi;
  const expandCompact=s=>String(s??'').replace(compact,'$1 x $2');
  const athleteKey=a=>E?.Evidence?.key?.(a?.full_name)||E?.key?.(a?.full_name)||text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const rawOf=item=>text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));
  const isKick=item=>/\bkick\b/i.test(rawOf(item));
  const isUnderwater=item=>/\bunderwater\b/i.test(rawOf(item));
  const explicitStroke=item=>{
    const st=E?.Evidence?.stroke?.(item?.stroke||'')||E?.stroke?.(item?.stroke||'')||'';if(st&&st!=='Choice')return st;
    const raw=rawOf(item);
    if(/\b(?:free|freestyle)\s+kick\b/i.test(raw))return'Freestyle';
    if(/\b(?:back|backstroke)\s+kick\b/i.test(raw))return'Backstroke';
    if(/\b(?:breast|breaststroke)\s+kick\b/i.test(raw))return'Breaststroke';
    if(/\b(?:fly|butterfly|dolphin)\s+kick\b/i.test(raw))return'Butterfly';
    if(/\b(?:IM|medley)\s+kick\b/i.test(raw))return'IM';
    return'';
  };
  const genericKick=item=>isKick(item)&&!explicitStroke(item);
  const strokeAssignmentIntent=item=>/#\s*1\b/i.test(rawOf(item))||!!item?.numberOneStroke||isKick(item);

  function setsInOrder(session){const out=[];const walk=items=>{for(const x of items||[]){if(x?.kind==='group')walk(x.items||[]);else if(x?.kind==='set')out.push(x)}};for(const b of session?.blocks||[])walk(b.items||[]);return out;}
  function tagStrokePolicy(session){for(const x of setsInOrder(session)){const explicit=explicitStroke(x);if(explicit){if(!x.stroke||x.stroke==='Choice')x.stroke=explicit;x.kickStrokePolicy='authored';}else if(isKick(x)){x.numberOneStroke=true;x.strokePolicy='number1';x.kickStrokePolicy='number1';}}return session;}

  // Parser compatibility + metadata only. Authored text remains untouched.
  if(M.parser?.parse){
    if(M.parser.normalise){const priorNormalise=M.parser.normalise.bind(M.parser);M.parser.normalise=s=>priorNormalise(expandCompact(s));}
    const priorParse=M.parser.parse.bind(M.parser);
    const attachStandaloneRest=(session,source)=>{
      const lines=String(source??'').replace(/\r/g,'').split('\n').map(x=>x.trim()),sets=setsInOrder(session);let cursor=0;
      for(let i=1;i<lines.length;i++){
        const rm=lines[i].match(/^(\d{1,2})\s*(?:s|sec|seconds?)\s*(?:r|rest)\b/i);if(!rm)continue;
        let j=i-1;while(j>=0&&!lines[j])j--;if(j<0)continue;
        const pm=lines[j].match(/^(\d{1,3})\s*[x×]\s*(\d{1,4}(?:\.5)?)\b/i);if(!pm)continue;
        const reps=Number(pm[1]),distance=Number(pm[2]),rest=Number(rm[1]);let found=-1;
        for(let k=cursor;k<sets.length;k++){if(Number(sets[k].reps||1)===reps&&Number(sets[k].distance||0)===distance){found=k;break}}
        if(found<0)for(let k=0;k<sets.length;k++){if(Number(sets[k].reps||1)===reps&&Number(sets[k].distance||0)===distance){found=k;break}}
        if(found>=0){sets[found].restSeconds=rest;cursor=found+1;}
      }
      return session;
    };
    M.parser.parse=(source,identity={})=>{const src=expandCompact(source),session=priorParse(src,identity);attachStandaloneRest(session,src);return tagStrokePolicy(session)};
    F.expandCompact=expandCompact;F.attachStandaloneRest=attachStandaloneRest;F.tagStrokePolicy=tagStrokePolicy;
  }

  function cycleClock(s){s=Number(s)||0;const m=Math.floor(s/60),sec=Math.round(s%60);return`${m}:${String(sec).padStart(2,'0')}`;}
  function rewriteCycleText(s,oldCycle,newCycle){s=text(s);if(!newCycle)return s;const next=cycleClock(newCycle),old=Number(oldCycle)||0;if(old){const o=cycleClock(old),re=new RegExp(`(?:@|on)\\s*${o.replace(':','[:.]')}`,'i');if(re.test(s))return s.replace(re,`@ ${next}`);}return /(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i.test(s)?s.replace(/(?:@|on)\s*\d{1,2}[:.]\d{2}\b/i,`@ ${next}`):s;}
  function originalDescGroup(item){for(const s of [item?.raw,item?.text,...(item?.cues||[])]){const m=text(s).match(/\bDesc(?:end|ending)?\s+1\s*[-–—]\s*(\d+)\b/i);if(m)return Number(m[1]);}return 0;}
  function descentFor(reps,original){const n=Math.max(1,Number(reps)||1),o=Math.max(0,Number(original)||0);if(n<=1)return'';if(n===2)return'1 Build / 1 Fast';if(o>=3&&n%o===0)return`Desc 1-${o}`;const divisors=[];for(let d=3;d<=n;d++)if(n%d===0)divisors.push(d);if(divisors.length){divisors.sort((a,b)=>Math.abs(a-o)-Math.abs(b-o)||b-a);return`Desc 1-${divisors[0]}`;}return`Desc 1-${n}`;}
  function rewriteDescText(s,from,to){s=text(s);if(!from||!to)return s;return s.replace(/\bDesc(?:end|ending)?\s+1\s*[-–—]\s*\d+\b/ig,to);}
  function resetFromAuthored(out,item,reps,cycle){const d=Number(item?.distance)||0,oldCycle=Number(item?.cycleSeconds)||0,n=Math.max(1,Number(reps)||1),lead=n>1?`${n} × ${d}`:`${d}`,src=text(item?.raw||item?.text),desc=descentFor(n,originalDescGroup(item));let raw=/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(src)?src.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead):src;raw=rewriteCycleText(raw,oldCycle,cycle);raw=rewriteDescText(raw,originalDescGroup(item),desc);out.reps=n;out.distance=d;out.cycleSeconds=Number(cycle)||oldCycle||null;out.raw=raw;out.text=raw;out.cues=(item?.cues||[]).map(c=>rewriteDescText(rewriteCycleText(c,oldCycle,cycle),originalDescGroup(item),desc));if(desc&&!out.cues.some(c=>new RegExp(desc.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(c))&&!new RegExp(desc.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(raw))out.cues.push(desc);return out;}
  function activeOverride(item,ath,state,session){return(state?.adaptationOverrides||[]).find(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false)||null;}
  function coachStroke(item,ath,state,session){const ov=activeOverride(item,ath,state,session),s=E?.Evidence?.stroke?.(ov?.patch?.stroke||'')||E?.stroke?.(ov?.patch?.stroke||'')||'';return s&&s!=='Choice'?s:'';}
  function contextualStroke(item,ath,state,session){try{const c=M.performanceEngine?.selectStrokeForContext?.(ath,{...item,numberOneStroke:true},state,session,{formOnly:false});if(c?.stroke)return E?.Evidence?.stroke?.(c.stroke)||c.stroke;}catch{}return'Freestyle';}

  // Coach-confirmed morning corrections. These replace the failed 'spread reduced reps across the squad window' fallback.
  if(E?.Modification?.adaptItem&&!F._adaptWrapped){
    F._adaptWrapped=true;const baseAdapt=E.Modification.adaptItem.bind(E.Modification);
    E.Modification.adaptItem=(item,ath,state=M.state,session=M.currentSession?.()||{})=>{
      let out=baseAdapt(item,ath,state,session);if(item?.kind!=='set'||!ath)return out;
      const key=athleteKey(ath),d=Number(item?.distance)||0,reps=Math.max(1,Number(item?.reps)||1),manual=!!activeOverride(item,ath,state,session)&&E.Modification.shapeOverride?.(activeOverride(item,ath,state,session));
      if(!manual&&key==='charlottemurphy'&&isUnderwater(item)&&d<=25&&reps>1){out=resetFromAuthored(out,item,Math.max(1,Math.round(reps*.75)),60);out.adaptationReason='Coach-confirmed underwater modification · 75% reps · 1:00 cycle';out.adaptationTiming={mode:'coach-confirmed-underwater',cycleSeconds:60};}
      else if(!manual&&isKick(item)&&d===100&&reps>1){if(key==='charlottemurphy'){out=resetFromAuthored(out,item,Math.max(1,Math.round(reps*.5)),270);out.adaptationReason='Coach-confirmed kick model · 50% reps · 4:30 cycle';}else if(key==='mckenziedrage'||key==='mackenziedrage'){out=resetFromAuthored(out,item,Math.max(1,Math.round(reps*(2/3))),225);out.adaptationReason='Coach-confirmed kick model · 67% reps · 3:45 cycle';}}
      else if(!manual&&isKick(item)&&d===200&&/\bfins?\b/i.test(rawOf(item))&&reps>1){if(key==='charlottemurphy'){out=resetFromAuthored(out,item,Math.max(1,Math.round(reps*.5)),330);out.adaptationReason='Coach-confirmed fins kick model · 50% reps · 5:30 cycle';}else if(key==='mckenziedrage'||key==='mackenziedrage'){out=resetFromAuthored(out,item,Math.max(1,Math.round(reps*(2/3))),270);out.adaptationReason='Coach-confirmed fins kick model · 67% reps · 4:30 cycle';}}
      const selected=coachStroke(item,ath,state,session),explicit=explicitStroke(item);if(selected){out.stroke=selected;out.strokePolicy='coach';out.kickStrokeSource='coach';}else if(explicit&&isKick(item)){out.stroke=explicit;out.strokePolicy='authored';out.kickStrokeSource='authored';}else if(genericKick(item)||/#\s*1\b/i.test(rawOf(item))||item?.numberOneStroke){out.stroke=contextualStroke(item,ath,state,session);out.numberOneStroke=true;out.strokePolicy='number1';out.kickStrokeSource='number1-context';}
      return out;
    };
    F.baseAdaptItem=baseAdapt;F.adaptItem=(item,ath,state,session)=>E.Modification.adaptItem(item,ath,state,session);
  }

  function setStroke(session,item,ath,value){const rows=M.state.adaptationOverrides=M.state.adaptationOverrides||[],x=rows.find(r=>r.sessionId===session.id&&r.itemId===item.id&&r.athleteId===ath.id&&r.active!==false),stroke=value==='AUTO'?'':(E?.Evidence?.stroke?.(value)||value);if(stroke){if(x){x.patch=x.patch||{};x.patch.stroke=stroke;x.active=true;x.updatedAt=new Date().toISOString();}else rows.push({id:M.util?.uid?.('mod')||`mod-${Date.now()}`,sessionId:session.id,itemId:item.id,athleteId:ath.id,patch:{stroke},active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}else if(x){x.patch=x.patch||{};delete x.patch.stroke;if(!Object.keys(x.patch).length)x.active=false;x.updatedAt=new Date().toISOString();}E?.Coordinator?.clearCache?.();E?.RacePace?.invalidate?.(M.state);M.performanceEngine?.invalidate?.(M.state);M.store?.save?.(M.state);M.cloud?.stageAdaptationsForSession?.(session);M.ui?.renderBoard?.();}
  function findItem(session,id){let hit=null;const walk=items=>{for(const n of items||[]){if(n?.id===id){hit=n;return}if(n?.kind==='group')walk(n.items);if(hit)return}};for(const b of session?.blocks||[]){walk(b.items);if(hit)break}return hit;}
  function shortStroke(s){return({Freestyle:'Fr',Backstroke:'Bk',Breaststroke:'Br',Butterfly:'Fly',IM:'IM'})[s]||s||'Auto';}
  function decorateBoard(){if(typeof document==='undefined')return;const host=document.querySelector('#boardView'),session=M.currentSession?.();if(!host||!session)return;const athletes=M.ui?.presentAthletes?.()||[];for(const row of host.querySelectorAll('.msos-work-row[data-item]')){if(row.querySelector('[data-cf-stroke-strip]'))continue;const item=findItem(session,row.dataset.item);if(!item||!strokeAssignmentIntent(item))continue;const cell=row.querySelector('.msos-group-cell');if(!cell)continue;const strip=document.createElement('div');strip.dataset.cfStrokeStrip='1';strip.style.cssText='display:flex;flex-wrap:wrap;gap:5px 8px;align-items:center;margin-top:6px';for(const ath of athletes){const wrap=document.createElement('span');wrap.style.cssText='display:inline-flex;align-items:center;gap:3px';const nm=document.createElement('small');nm.textContent=M.boardEngine?.name?.(ath,athletes)||text(ath.full_name).split(' ')[0]||'Swimmer';const b=document.createElement('button');b.className='msos-stroke-pill';const actual=E.Modification.adaptItem(item,ath,M.state,session),resolved=E?.Evidence?.stroke?.(actual?.stroke||'')||actual?.stroke||'Auto';b.textContent=shortStroke(resolved);b.title='Tap to change stroke';b.onclick=e=>{e.stopPropagation();host.querySelectorAll('.msos-stroke-menu').forEach(x=>x.remove());const menu=document.createElement('div');menu.className='msos-stroke-menu';for(const [v,l] of [['AUTO','Auto / #1'],['Freestyle','Fr'],['Backstroke','Bk'],['Breaststroke','Br'],['Butterfly','Fly'],['IM','IM']]){const x=document.createElement('button');x.textContent=l;x.onclick=ev=>{ev.stopPropagation();setStroke(session,item,ath,v)};menu.appendChild(x)}wrap.appendChild(menu);setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0)};wrap.append(nm,b);strip.appendChild(wrap)}cell.appendChild(strip)}}
  if(typeof document!=='undefined'){const boot=()=>{const h=document.querySelector('#boardView');if(!h)return setTimeout(boot,100);decorateBoard();if(!F._boardObserver){F._boardObserver=new MutationObserver(()=>requestAnimationFrame(decorateBoard));F._boardObserver.observe(h,{childList:true,subtree:true})}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
  F.strokeAssignmentIntent=strokeAssignmentIntent;F.genericKick=genericKick;F.explicitStroke=explicitStroke;F.descentFor=descentFor;F.decorateBoard=decorateBoard;

  // Development opportunities require actual PB evidence. Coverage monitoring can still say what is missing.
  if(M.developmentEngine?.profile){
    const D=M.developmentEngine,priorProfile=D.profile.bind(D);
    const fixedProfile=(ath,state=M.state,course='SCM')=>{const out=priorProfile(ath,state,course);if(Number(out?.pbEvents||0)===0)out.opportunities=[];return out};
    D.profile=fixedProfile;
    D.squad=(state=M.state,{course='SCM',athletes=null}={})=>{const list=(athletes||state?.athletes||[]).filter(a=>a.active!==false),rows=list.map(a=>fixedProfile(a,state,course));return{rows,summary:{athletes:rows.length,withPb:rows.filter(r=>r.pbEvents>0).length,noPb:rows.filter(r=>!r.pbEvents).length,withOpportunities:rows.filter(r=>r.opportunities.length).length,xlr8Monitored:rows.filter(r=>r.xlr8?.monitored).length,xlr8CoverageReady:rows.filter(r=>r.xlr8?.complete).length}}};
  }

  if(M.guardian?.run){
    const priorRun=M.guardian.run.bind(M.guardian),obsolete='Poolside swimmer answer links pathway steps to recent training area';
    M.guardian.run=()=>{
      const r=priorRun()||{},tests=(r.tests||[]).filter(t=>text(t.name)!==obsolete),test={name:'Poolside swimmer answer links real milestones to recent training area',ok:false,detail:''};
      try{const ath={id:'poolside-ath',full_name:'Poolside Swimmer'},pb={course:'SCM',distance:100,stroke:'Freestyle',result_seconds:60},event={pb,qualifying:[{_label:'Meet QT',_kind:'qualifying',_seconds:58}],deeper:[{_label:'Finalist',_kind:'benchmark',_seconds:56}]},answer=M.correct?.poolsidePathwayAnswer?.(ath,event),session=M.parser.parse('MAIN SET\n4 x 100 Freestyle Threshold 10s Rest\n4 x 25 Freestyle 100 Race Pace',{id:'poolside-training-al',date:'2026-08-10',dayPart:'AM',course:'SCM',squads:['National']}),state={canonicalSessions:{'poolside-training-al':session},attendance:[{session_id:'poolside-training-al',athlete_id:'poolside-ath',status:'present'}],adaptationProfiles:[],adaptationOverrides:[],timedSets:[]},area=M.correct?.trainingArea?.(ath,pb,{state,days:42});if(answer?.milestones?.length!==2)throw new Error(`${answer?.milestones?.length||0} real milestones`);if(area?.sessions!==1||area?.metres!==500||area?.racePaceExposures!==1)throw new Error(`${area?.metres||0}m · ${area?.racePaceExposures||0} race-pace`);test.ok=true;test.detail=`2 real milestones · ${area.metres}m · ${area.racePaceExposures} race-pace`;}catch(e){test.detail=e?.message||String(e)}
      tests.push(test);const passed=tests.filter(x=>x.ok===true).length;return{...r,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length};
    };
  }
})(globalThis);
