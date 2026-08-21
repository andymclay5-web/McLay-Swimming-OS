'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Events=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;};
  const EVENT_TYPES=Object.freeze(['session_started','context_anchor','item_started','rep_observed','item_completed','delivered_item','live_edit','branch_created','attendance_changed','evidence_captured','target_spot_checked','swimmer_message_sent','tv_projection_changed','session_finished','correction']);
  function createEvent(input={}){
    if(!input.type)throw new Error('event type required');
    return freeze({id:input.id||`evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,schemaVersion:1,occurredAt:Number(input.occurredAt)||Date.now(),sessionId:input.sessionId||null,actorId:input.actorId||'coach',actorRole:input.actorRole||'coach',type:input.type,blockId:input.blockId||null,itemId:input.itemId||null,athleteIds:[...new Set(input.athleteIds||[])],payload:clone(input.payload||{}),source:input.source||'coach_touch',deviceId:input.deviceId||null,localSequence:Number.isFinite(Number(input.localSequence))?Number(input.localSequence):null,supersedes:input.supersedes||null});
  }
  class EventLedger{
    constructor(seed=[]){this.events=[...seed];this.sequence=this.events.reduce((n,e)=>Math.max(n,Number(e.localSequence)||0),0);}
    append(input){const e=Object.isFrozen(input)?input:createEvent({...input,localSequence:input.localSequence??++this.sequence});if(this.events.some(x=>x.id===e.id))return e;this.events.push(e);return e;}
    correct(eventId,payload,{actorId='coach',source='coach_touch',occurredAt=Date.now()}={}){const old=this.events.find(x=>x.id===eventId);if(!old)throw new Error(`Unknown event ${eventId}`);return this.append({type:'correction',sessionId:old.sessionId,actorId,source,occurredAt,supersedes:eventId,payload});}
    forSession(sessionId){return this.events.filter(x=>x.sessionId===sessionId).sort((a,b)=>a.occurredAt-b.occurredAt||Number(a.localSequence)-Number(b.localSequence));}
    activeEvents(sessionId=null){const rows=sessionId?this.forSession(sessionId):[...this.events],superseded=new Set(rows.filter(x=>x.supersedes).map(x=>x.supersedes));return rows.filter(x=>!superseded.has(x.id));}
    cursor(){const last=this.events.at(-1);return last?{sequence:last.localSequence||this.sequence,eventId:last.id,occurredAt:last.occurredAt}:{sequence:0,eventId:null,occurredAt:null};}
  }
  return{VERSION,EVENT_TYPES,createEvent,EventLedger};
});
