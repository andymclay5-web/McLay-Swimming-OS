'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const F=M.contractFixesAL={build:'v4-contract-fixes-20260821al'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=a=>text(a?.full_name).toLowerCase().replace(/[^a-z0-9]/g,'');
  const ceil5=n=>Math.ceil(Number(n||0)/5)*5;
  const poolLength=s=>/LCM/i.test(text(s?.identity?.course))?50:25;
  const compact=/\b([2-9]|[12]\d|30)(800|400|200|150|100|75|50|35|25)s\b/gi;
  const expandCompact=s=>String(s??'').replace(compact,'$1 x $2');

  // Parser contract: resolve collapsed dictation before every parser layer, then
  // restore standalone rest to the immediately-authored parent set.
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

  // Modification contract: inclusion for short safe quality, but practical
  // independent handling for 75s and per-athlete distance on mixed aerobic work.
  if(E?.Modification?.adaptItem){
    const priorAdapt=E.Modification.adaptItem.bind(E.Modification),priorProfile=E.Modification.profile?.bind(E.Modification);
    const profile=(ath,state)=>{const p=priorProfile?priorProfile(ath,state):M.adapt?.profile?.(ath,state)||{ratio:1};const row=(state?.adaptationProfiles||state?.athlete_adaptation_profiles||[]).find(x=>x.athlete_id===ath?.id&&x.active!==false);return{...p,returnToStart:row?.return_to_starting_end===true||key(ath)==='charlottemurphy'}};
    const hasOverride=(item,ath,state,session)=>(state?.adaptationOverrides||[]).some(x=>x.sessionId===session?.id&&x.itemId===item?.id&&x.athleteId===ath?.id&&x.active!==false);
    const rewriteLead=(out,reps,distance)=>{const raw=text(out?.raw||out?.text),lead=`${Math.max(1,Number(reps)||1)} × ${Number(distance)||0}`;out.reps=Math.max(1,Number(reps)||1);out.distance=Number(distance)||0;if(/^\d+\s*[x×]\s*\d+(?:\.5)?/i.test(raw))out.raw=raw.replace(/^\d+\s*[x×]\s*\d+(?:\.5)?/i,lead);else if(/^\d+(?:\.5)?\b/.test(raw))out.raw=raw.replace(/^\d+(?:\.5)?\b/,lead);else out.raw=`${lead}${raw?` · ${raw}`:''}`;out.text=out.raw;return out};
    const setCycle=(out,seconds)=>{seconds=ceil5(seconds);const old=Number(out.cycleSeconds)||0;out.cycleSeconds=seconds;if(old&&out.raw){const om=`${Math.floor(old/60)}:${String(Math.round(old%60)).padStart(2,'0')}`,nm=`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;out.raw=String(out.raw).replace(new RegExp(`(@|on)\\s*${om.replace(':','[:.]')}`,'i'),`@ ${nm}`);out.text=out.raw}return out};
    const remapRows=(rows,oldReps,newReps)=>{if(!Array.isArray(rows)||!rows.length||oldReps===newReps)return rows?JSON.parse(JSON.stringify(rows)):[];const src=Array.from({length:oldReps},(_,i)=>rows.find(x=>Number(x.rep)===i+1)||rows[Math.min(rows.length-1,i)]||{});return Array.from({length:newReps},(_,i)=>{const idx=Math.min(oldReps-1,Math.floor(((i+.5)*oldReps)/newReps));return{...JSON.parse(JSON.stringify(src[idx]||{})),rep:i+1}})};
    const even75Reps=(reps,ratio)=>{const target=reps*ratio,c=[];for(let r=2;r<=reps;r+=2)c.push({r,d:Math.abs(r-target)});if(!c.length)return Math.max(1,Math.round(target));c.sort((a,b)=>a.d-b.d||b.r-a.r);return c[0].r};
    const fixedAdapt=(item,ath,state,session)=>{
      const out=priorAdapt(item,ath,state,session);if(!out||item?.kind!=='set'||hasOverride(item,ath,state,session))return out;
      const p=profile(ath,state),ratio=Math.max(.25,Math.min(1,Number(p.ratio)||1)),name=key(ath),raw=text([item.raw,item.text,...(item.cues||[])].filter(Boolean).join(' ')),reps=Math.max(1,Number(item.reps)||1),distance=Number(item.distance)||0;
      const shortSafe=ratio<.98&&distance<=25&&/\b(?:max|sprint|race|pace|quality|fast|underwater|dive|start|build|turn|finish)\b/i.test(raw);
      if(shortSafe){rewriteLead(out,reps,distance);out.cycleSeconds=item.cycleSeconds??out.cycleSeconds;out.repPattern=JSON.parse(JSON.stringify(item.repPattern||[]));out.repInstructions=JSON.parse(JSON.stringify(item.repInstructions||[]));out.adaptationReason=`${out.adaptationReason&&!/profile/i.test(out.adaptationReason)?out.adaptationReason+' · ':''}Same team exposure · safe short quality`;return out;}
      const mixedAerobic=ratio<.98&&reps<=4&&distance>=200&&Array.isArray(item.repPattern)&&item.repPattern.length>=reps;
      if(mixedAerobic&&name!=='charlottemurphy'){
        const pool=poolLength(session),desired=Math.max(pool,Math.min(distance,Math.round((distance*ratio)/pool)*pool));rewriteLead(out,reps,desired);out.repPattern=JSON.parse(JSON.stringify(item.repPattern||[]));out.repInstructions=JSON.parse(JSON.stringify(item.repInstructions||[]));out.adaptationReason=`${Math.round(ratio*100)}% profile · every authored phase retained`;return out;
      }
      if(ratio<.98&&distance===75){
        const desired=even75Reps(reps,ratio);rewriteLead(out,desired,75);out.repPattern=remapRows(item.repPattern||[],reps,desired);out.repInstructions=remapRows(item.repInstructions||[],reps,desired);if(Number(item.cycleSeconds)>0)setCycle(out,Number(item.cycleSeconds)*reps/desired);if(name==='mckenziedrage'&&/\b(?:fast|race|quality|max|sprint)\b/i.test(raw)&&Number(out.cycleSeconds||0)<115)setCycle(out,115);if(/upper-body equivalent/i.test(text(out.raw||out.text)))out.adaptationReason=`Upper-body equivalent · ${Math.round(ratio*100)}% profile`;else out.adaptationReason=`${Math.round(ratio*100)}% profile · return-end practical 75s`;return out;
      }
      return out;
    };
    E.Modification.adaptItem=fixedAdapt;E.Modification.profile=profile;if(M.adapt){M.adapt.item=fixedAdapt;M.adapt.profile=profile}F.adaptItem=fixedAdapt;
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
