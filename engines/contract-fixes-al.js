'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const F=M.contractFixesAL={build:'v4-contract-fixes-20260824ch'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=/\b([2-9]|[12]\d|30)(800|400|200|150|100|75|50|35|25)s\b/gi;
  const expandCompact=s=>String(s??'').replace(compact,'$1 x $2');

  // Parser compatibility remains here. Modification policy no longer does.
  if(M.parser?.parse){
    if(M.parser.normalise){
      const priorNormalise=M.parser.normalise.bind(M.parser);
      M.parser.normalise=s=>priorNormalise(expandCompact(s));
    }
    const priorParse=M.parser.parse.bind(M.parser);
    const setsInOrder=session=>{const out=[];const walk=items=>{for(const x of items||[]){if(x?.kind==='group')walk(x.items||[]);else if(x?.kind==='set')out.push(x)}};for(const b of session?.blocks||[])walk(b.items||[]);return out;};
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
    M.parser.parse=(source,identity={})=>{const src=expandCompact(source),session=priorParse(src,identity);return attachStandaloneRest(session,src)};
    F.expandCompact=expandCompact;F.attachStandaloneRest=attachStandaloneRest;
  }

  // Compatibility handle only. All athlete/set prescription policy now lives in engines/modification.js.
  F.adaptItem=(item,ath,state,session)=>E?.Modification?.adaptItem?.(item,ath,state,session);

  // The AquaGym season/weekly source was repeatedly present in the coaching files
  // but absent from live v4 state. Load the canonical reference bridge without
  // changing an existing imported plan. Coach Hub already listens for data-updated.
  if(!M.planReferenceCH&&typeof document!=='undefined'){
    const prior=document.querySelector('script[data-msos-plan-reference]');
    if(!prior){
      const s=document.createElement('script');s.dataset.msosPlanReference='1';s.src='engines/plan-reference-ch.js?v=20260824ch';
      s.onload=()=>{try{dispatchEvent(new CustomEvent('msos:data-updated',{detail:{source:'plan-reference-ch'}}))}catch{}};
      s.onerror=()=>console.warn('[MSOS] canonical plan reference failed to load');
      document.head.appendChild(s);
    }
  }

  // Development opportunities require actual PB evidence. Coverage monitoring can
  // still say what is missing, but it must not invent a target event for a blank profile.
  if(M.developmentEngine?.profile){
    const D=M.developmentEngine,priorProfile=D.profile.bind(D);
    const fixedProfile=(ath,state=M.state,course='SCM')=>{const out=priorProfile(ath,state,course);if(Number(out?.pbEvents||0)===0)out.opportunities=[];return out};
    D.profile=fixedProfile;
    D.squad=(state=M.state,{course='SCM',athletes=null}={})=>{const list=(athletes||state?.athletes||[]).filter(a=>a.active!==false),rows=list.map(a=>fixedProfile(a,state,course));return{rows,summary:{athletes:rows.length,withPb:rows.filter(r=>r.pbEvents>0).length,noPb:rows.filter(r=>!r.pbEvents).length,withOpportunities:rows.filter(r=>r.opportunities.length).length,xlr8Monitored:rows.filter(r=>r.xlr8?.monitored).length,xlr8CoverageReady:rows.filter(r=>r.xlr8?.complete).length}}};
  }

  // Replace the obsolete point-step/training-link assertion with the same linkage
  // against the real milestone pathway contract.
  if(M.guardian?.run){
    const priorRun=M.guardian.run.bind(M.guardian),obsolete='Poolside swimmer answer links pathway steps to recent training area';
    M.guardian.run=()=>{
      const r=priorRun()||{},tests=(r.tests||[]).filter(t=>text(t.name)!==obsolete),test={name:'Poolside swimmer answer links real milestones to recent training area',ok:false,detail:''};
      try{
        const ath={id:'poolside-ath',full_name:'Poolside Swimmer'},pb={course:'SCM',distance:100,stroke:'Freestyle',result_seconds:60},event={pb,qualifying:[{_label:'Meet QT',_kind:'qualifying',_seconds:58}],deeper:[{_label:'Finalist',_kind:'benchmark',_seconds:56}]},answer=M.correct?.poolsidePathwayAnswer?.(ath,event),session=M.parser.parse('MAIN SET\n4 x 100 Freestyle Threshold 10s Rest\n4 x 25 Freestyle 100 Race Pace',{id:'poolside-training-al',date:'2026-08-10',dayPart:'AM',course:'SCM',squads:['National']}),state={canonicalSessions:{'poolside-training-al':session},attendance:[{session_id:'poolside-training-al',athlete_id:'poolside-ath',status:'present'}],adaptationProfiles:[],adaptationOverrides:[],timedSets:[]},area=M.correct?.trainingArea?.(ath,pb,{state,days:42});
        if(answer?.milestones?.length!==2)throw new Error(`${answer?.milestones?.length||0} real milestones`);if(area?.sessions!==1||area?.metres!==500||area?.racePaceExposures!==1)throw new Error(`${area?.metres||0}m · ${area?.racePaceExposures||0} race-pace`);test.ok=true;test.detail=`2 real milestones · ${area.metres}m · ${area.racePaceExposures} race-pace`;
      }catch(e){test.detail=e?.message||String(e)}
      tests.push(test);const passed=tests.filter(x=>x.ok===true).length;return{...r,tests,passed,total:tests.length,ok:tests.length>0&&passed===tests.length};
    };
  }
})(globalThis);
