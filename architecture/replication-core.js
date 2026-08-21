'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Replication=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-ax';
  function createOutbox(seed=[]){return[...seed];}
  function enqueue(outbox,record,{kind='event',at=Date.now()}={}){const id=record?.id;if(!id)throw new Error('stable id required');if(outbox.some(x=>x.recordId===id&&x.kind===kind))return outbox.find(x=>x.recordId===id&&x.kind===kind);const row={id:`out_${kind}_${id}`,recordId:id,kind,enqueuedAt:Number(at),attempts:0,status:'pending',lastError:null};outbox.push(row);return row;}
  function pending(outbox,limit=50){return outbox.filter(x=>x.status==='pending').sort((a,b)=>a.enqueuedAt-b.enqueuedAt).slice(0,limit);}
  function markSynced(outbox,id,{at=Date.now()}={}){const row=outbox.find(x=>x.id===id);if(row){row.status='synced';row.syncedAt=Number(at);row.lastError=null;}return row||null;}
  function markFailed(outbox,id,error,{retry=true}={}){const row=outbox.find(x=>x.id===id);if(row){row.attempts++;row.status=retry?'pending':'failed';row.lastError=String(error?.message||error||'unknown');}return row||null;}
  function mergeAppendOnly(local=[],remote=[]){const map=new Map();for(const row of [...local,...remote])if(row?.id&&!map.has(row.id))map.set(row.id,row);return[...map.values()].sort((a,b)=>Number(a.occurredAt||a.createdAt||a.created_at||0)-Number(b.occurredAt||b.createdAt||b.created_at||0)||String(a.id).localeCompare(String(b.id)));}
  function liveBoardPullPolicy({view,explicit=false}={}){if(explicit)return{allow:true,reason:'explicit_manual_sync'};if(view==='board'||view==='tv')return{allow:false,reason:'protected_live_projection'};return{allow:true,reason:'not_live_board'};}
  return{VERSION,createOutbox,enqueue,pending,markSynced,markFailed,mergeAppendOnly,liveBoardPullPolicy};
});
