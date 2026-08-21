'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Remote=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  function createRun({session,athlete,projection,deviceId=null,createdAt=Date.now()}={}){if(!session?.id||!athlete?.id)throw new Error('canonical session and athlete required');return{id:`remote_${session.id}_${athlete.id}_${Number(createdAt).toString(36)}`,canonicalSessionId:session.id,athleteId:athlete.id,projectionVersion:projection?.version||projection?.projectionVersion||'current',createdAt:Number(createdAt),startedAt:null,finishedAt:null,status:'ready',deviceId,sourceItemIds:(projection?.blocks||[]).flatMap(b=>(b.items||[]).map(x=>x.canonicalItemId)).filter(Boolean),events:[],evidenceIds:[],syncCursor:null};}
  function start(run,at=Date.now()){return{...run,status:'active',startedAt:run.startedAt||Number(at)};}
  function appendEvent(run,event){if(run.events.some(x=>x.id===event.id))return run;return{...run,events:[...run.events,event]};}
  function attachEvidence(run,evidenceId){return run.evidenceIds.includes(evidenceId)?run:{...run,evidenceIds:[...run.evidenceIds,evidenceId]};}
  function finish(run,at=Date.now()){return{...run,status:'finished',finishedAt:Number(at)};}
  function syncPayload(run){return{remoteRunId:run.id,canonicalSessionId:run.canonicalSessionId,athleteId:run.athleteId,events:run.events,evidenceIds:run.evidenceIds,finishedAt:run.finishedAt,sourceItemIds:run.sourceItemIds};}
  return{VERSION,createRun,start,appendEvent,attachEvidence,finish,syncPayload};
});
