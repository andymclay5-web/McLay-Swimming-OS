'use strict';
(function(root,factory){
  const AS=typeof module==='object'&&module.exports?require('./athlete-session-core'):root.MSOSArchitecture?.AthleteSession;
  const T=typeof module==='object'&&module.exports?require('./training-history-core'):root.MSOSArchitecture?.TrainingHistory;
  const api=factory(AS,T);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.AthleteReport=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(AthleteSession,TrainingHistory){
  const VERSION='1.0.0-be';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function athleteIds(capture){
    const ids=[...(capture?.athlete_ids||capture?.swimmer_ids||[])];
    const one=capture?.athlete_id||capture?.swimmer_id;
    if(one&&!ids.includes(one))ids.push(one);
    return [...new Set(ids.filter(Boolean))];
  }
  function captureContext(capture){
    return{
      itemId:capture?.item_id||capture?.itemId||capture?.context_item_id||capture?.canonical_item_id||'',
      blockId:capture?.block_id||capture?.blockId||capture?.context_block_id||'',
      sessionId:capture?.session_id||capture?.sessionId||''
    };
  }
  function rowMatchesContext(row,ctx){
    if(ctx.itemId)return row?.item?.id===ctx.itemId;
    if(ctx.blockId)return row?.block?.id===ctx.blockId;
    return true;
  }
  function groupCaptureApplies(capture,window){
    const ctx=captureContext(capture);
    if(!ctx.itemId&&!ctx.blockId)return true;
    return (window?.rows||[]).some(row=>rowMatchesContext(row,ctx));
  }
  function evidenceForAthlete({session,athlete,captures=[],window,participation}={}){
    const named=[],group=[];
    for(const capture of captures||[]){
      const ctx=captureContext(capture);if(ctx.sessionId!==session?.id)continue;
      const ids=athleteIds(capture);
      if(ids.includes(athlete?.id)){named.push({...clone(capture),evidence_scope:'named'});continue;}
      if(ids.length===0&&participation?.status==='attended'&&groupCaptureApplies(capture,window))group.push({...clone(capture),evidence_scope:'group'});
    }
    const combined=[...named,...group].sort((a,b)=>String(a.created_at||a.updated_at||'').localeCompare(String(b.created_at||b.updated_at||'')));
    return{named,group,combined,namedCount:named.length,groupCount:group.length,total:combined.length};
  }
  function athleteSessionProjection({session,athlete,attendance=[],attendanceSnapshots={},athleteSessionBoundaries=null,squadSessionBoundaries=null,presentSessionIds=[],prescribe=null,captures=[]}={}){
    if(!session||!athlete)throw new Error('Session and athlete are required');
    const record=TrainingHistory.recordSession({session,athlete,attendance,attendanceSnapshots,athleteSessionBoundaries,squadSessionBoundaries,presentSessionIds,prescribe,captures:[]});
    const window=AthleteSession.deliveryWindow({session,athlete,athleteId:athlete.id,boundaries:athleteSessionBoundaries,squadBoundaries:squadSessionBoundaries});
    const evidence=evidenceForAthlete({session,athlete,captures,window,participation:record.participation});
    const startBoundary=window.startBoundary||null,endBoundary=window.athleteBoundary?.end||null;
    return{
      schemaVersion:1,
      kind:'athlete_session_projection',
      id:`athlete-session:${session.id}:${athlete.id}`,
      sourceSessionId:session.id,
      athleteId:athlete.id,
      athleteName:text(athlete.full_name||athlete.name),
      squad:text(athlete.squad),
      date:record.date,
      title:record.title,
      course:record.course,
      participation:record.participation,
      delivery:record.delivery,
      metres:{recorded:record.deliveredMetres||0,current:record.trainingMetres||0,prescribed:record.prescribedMetres||0,fullSquadSource:record.canonicalMetres||0},
      start:{source:record.startSource||'session_start',label:record.startLabel||'',boundary:clone(startBoundary),joinWork:clone(record.joinWork||null)},
      finish:{source:record.deliveryEndSource||'planned',label:record.endLabel||'',boundary:clone(endBoundary),sessionFinish:clone(record.finish||null)},
      blocks:clone(record.blocks||[]),
      targets:clone(record.targets||[]),
      zones:clone(record.zones||{}),
      strokes:clone(record.strokes||{}),
      tags:clone(record.tags||{}),
      evidence,
      lineage:{
        canonicalSessionId:session.id,
        derivedFromCanonicalSession:true,
        usesIndividualPrescription:true,
        inheritedSquadStart:record.startSource==='squad_start',
        individualStartOverride:record.startSource==='athlete_start',
        individualEndOverride:record.deliveryEndSource==='athlete_end',
        noDuplicateCanonicalSession:true
      },
      principle:'This is the swimmer-specific delivered projection of the shared canonical session: their entry point, warm-up/join work, modification, targets/send-offs, exit point, named evidence and applicable group evidence.'
    };
  }
  function athleteReport({athlete,sessions=[],attendance=[],attendanceSnapshots={},athleteSessionBoundaries=null,squadSessionBoundaries=null,presentSessionIds=[],prescribe=null,captures=[],asOf=new Date()}={}){
    const projections=(sessions||[]).map(session=>athleteSessionProjection({session,athlete,attendance,attendanceSnapshots,athleteSessionBoundaries,squadSessionBoundaries,presentSessionIds,prescribe,captures}));
    const records=(sessions||[]).map(session=>TrainingHistory.recordSession({session,athlete,attendance,attendanceSnapshots,athleteSessionBoundaries,squadSessionBoundaries,presentSessionIds,prescribe,captures:[]}));
    const week=TrainingHistory.summariseWindow(records,{days:7,asOf}),month=TrainingHistory.summariseWindow(records,{days:30,asOf});
    const evidence=projections.flatMap(x=>x.evidence.combined.map(e=>({...e,projection_id:x.id,source_session_id:x.sourceSessionId})));
    return{schemaVersion:1,athleteId:athlete?.id||'',athleteName:text(athlete?.full_name||athlete?.name),projections,week,month,evidence,evidenceCount:evidence.length};
  }
  return{VERSION,text,clone,athleteIds,captureContext,rowMatchesContext,groupCaptureApplies,evidenceForAthlete,athleteSessionProjection,athleteReport};
});
