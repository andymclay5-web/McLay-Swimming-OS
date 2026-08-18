'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Timing=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='2.0.0';
  const SCHEMA='msos.timing.v2';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function blankState(){return{schema:SCHEMA,sessions:[],journal:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.sessions))s.sessions=[];if(!Array.isArray(s.journal))s.journal=[];return s}
  function normalizeContext(raw={}){return{training_session_id:text(raw.training_session_id||raw.sessionId)||null,block_id:text(raw.block_id||raw.blockId)||null,item_id:text(raw.item_id||raw.itemId)||null,test_protocol_id:text(raw.test_protocol_id||raw.testProtocolId)||null,meet_id:text(raw.meet_id||raw.meetId)||null,event_id:text(raw.event_id||raw.eventId)||null,race_id:text(raw.race_id||raw.raceId)||null}}
  function activeMeasurement(row){return row?.status!=='retired'}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(v){this.writes++;this.value=clone(v);return true}}

  class TimingEngine{
    constructor({storage,entities,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Timing Engine requires a storage adapter');
      if(!entities||typeof entities.resolveAthlete!=='function'||typeof entities.athleteId!=='function')throw new Error('Timing Engine requires injected Entity Registry contract');
      this.storage=storage;this.entities=entities;this.clock=clock;this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    athleteId(ref){const a=this.entities.resolveAthlete(ref);if(!a)throw new Error(`Athlete not found: ${typeof ref==='string'?ref:ref?.id||''}`);return a.id}
    get(sessionId){return clone(this.state.sessions.find(x=>x.id===text(sessionId))||null)}
    _row(sessionId){const row=this.state.sessions.find(x=>x.id===text(sessionId));if(!row)throw new Error(`Timing session not found: ${sessionId}`);return row}
    createSession({id='',context={},course='',poolLength=null,label='',coachId='',source='deck_timer'}={}){
      const at=this.clock(),sid=text(id)||stable('timing',context.training_session_id||context.sessionId||'',context.test_protocol_id||context.testProtocolId||'',label,at);if(this.state.sessions.some(x=>x.id===sid))throw new Error(`Timing session already exists: ${sid}`);
      const pl=num(poolLength);if(pl!==null&&pl<=0)throw new Error('poolLength must be positive');
      const row={id:sid,schema:SCHEMA,context:normalizeContext(context),course:text(course).toUpperCase(),pool_length_m:pl,label:text(label),coach_id:text(coachId),source:text(source)||'deck_timer',status:'setup',assignments:[],measurements:[],created_at:at,started_at:null,ended_at:null,revision:1};
      this.state.sessions.push(row);this.state.journal.push({id:stable('timing-event',sid,'create',at),timing_session_id:sid,action:'create',at});this.persist();return clone(row);
    }
    assignAthlete(sessionId,athleteRef,{lane=null,position=null,label=''}={}){
      const s=this._row(sessionId);if(['finished','abandoned'].includes(s.status))throw new Error('Cannot change assignments after timing session closes');const aid=this.athleteId(athleteRef),existing=s.assignments.find(x=>x.athlete_id===aid&&x.active!==false),at=this.clock();if(existing)return clone(existing);
      const row={athlete_id:aid,lane:lane===null||lane===''?null:text(lane),position:position===null||position===''?null:Number(position),label:text(label),active:true,assigned_at:at};s.assignments.push(row);s.revision++;this.state.journal.push({id:stable('timing-event',s.id,'assign',aid,at),timing_session_id:s.id,action:'assign',athlete_id:aid,at});this.persist();return clone(row);
    }
    unassignAthlete(sessionId,athleteRef,{note=''}={}){
      const s=this._row(sessionId);if(['finished','abandoned'].includes(s.status))throw new Error('Cannot change assignments after timing session closes');const aid=this.athleteId(athleteRef),row=s.assignments.find(x=>x.athlete_id===aid&&x.active!==false);if(!row)return false;if(s.measurements.some(x=>x.athlete_id===aid&&activeMeasurement(x)))throw new Error('Cannot unassign athlete after measurements exist');const at=this.clock();row.active=false;row.unassigned_at=at;s.revision++;this.state.journal.push({id:stable('timing-event',s.id,'unassign',aid,at),timing_session_id:s.id,action:'unassign',athlete_id:aid,note:text(note),at});this.persist();return true;
    }
    start(sessionId,{startedAt='',coachId=''}={}){const s=this._row(sessionId);if(s.status!=='setup')throw new Error(`Timing session cannot start from ${s.status}`);if(!s.assignments.some(x=>x.active!==false))throw new Error('Timing session requires at least one assigned athlete');const at=text(startedAt)||this.clock();s.status='running';s.started_at=at;if(coachId)s.coach_id=text(coachId);s.revision++;this.state.journal.push({id:stable('timing-event',s.id,'start',at),timing_session_id:s.id,action:'start',at});this.persist();return clone(s)}
    timeline(sessionId,athleteRef,{includeRetired=false}={}){const s=this._row(sessionId),aid=this.athleteId(athleteRef);return clone(s.measurements.filter(x=>x.athlete_id===aid).filter(x=>includeRetired||activeMeasurement(x)).sort((a,b)=>a.elapsed_seconds-b.elapsed_seconds||a.distance_m-b.distance_m||text(a.captured_at).localeCompare(text(b.captured_at))))}
    _record(sessionId,athleteRef,kind,{distance,elapsedSeconds,capturedAt='',source='manual_tap',note=''}={}){
      const s=this._row(sessionId);if(s.status!=='running')throw new Error('Timing measurements require a running timing session');const aid=this.athleteId(athleteRef),assignment=s.assignments.find(x=>x.athlete_id===aid&&x.active!==false);if(!assignment)throw new Error('Athlete is not assigned to this timing session');const d=num(distance),e=num(elapsedSeconds);if(d===null||d<=0)throw new Error('Measurement distance must be positive');if(e===null||e<=0)throw new Error('Measurement elapsedSeconds must be positive');const prior=this.timeline(s.id,aid);if(prior.some(x=>x.kind==='finish'))throw new Error('Athlete already has a finish measurement');const last=prior.at(-1);if(last&&d<=last.distance_m)throw new Error('Measurement distance must increase');if(last&&e<=last.elapsed_seconds)throw new Error('Measurement elapsed time must increase');const at=text(capturedAt)||this.clock(),id=stable('timing-measurement',s.id,aid,kind,d,e,at),row={id,timing_session_id:s.id,athlete_id:aid,lane:assignment.lane,kind,distance_m:d,elapsed_seconds:e,captured_at:at,source:text(source)||'manual_tap',note:text(note),status:'active',revision:1};s.measurements.push(row);s.revision++;this.state.journal.push({id:stable('timing-event',s.id,id,'record',at),timing_session_id:s.id,measurement_id:id,action:'record',athlete_id:aid,at});this.persist();return clone(row);
    }
    recordSplit(sessionId,athleteRef,spec={}){return this._record(sessionId,athleteRef,'split',spec)}
    finishAthlete(sessionId,athleteRef,spec={}){return this._record(sessionId,athleteRef,'finish',spec)}
    correctMeasurement(sessionId,measurementId,{distance,elapsedSeconds,note='',coachId=''}={}){
      const s=this._row(sessionId),row=s.measurements.find(x=>x.id===text(measurementId));if(!row)throw new Error(`Measurement not found: ${measurementId}`);if(row.status==='retired')throw new Error('Retired measurement cannot be corrected');const before=clone(row),d=distance===undefined?row.distance_m:num(distance),e=elapsedSeconds===undefined?row.elapsed_seconds:num(elapsedSeconds);if(d===null||d<=0||e===null||e<=0)throw new Error('Corrected measurement requires positive distance and elapsed time');const peers=s.measurements.filter(x=>x.athlete_id===row.athlete_id&&x.id!==row.id&&activeMeasurement(x)).sort((a,b)=>a.distance_m-b.distance_m),lower=peers.filter(x=>x.distance_m<d).at(-1),upper=peers.find(x=>x.distance_m>d);if(lower&&e<=lower.elapsed_seconds)throw new Error('Corrected elapsed time conflicts with prior measurement');if(upper&&e>=upper.elapsed_seconds)throw new Error('Corrected elapsed time conflicts with later measurement');if(peers.some(x=>x.distance_m===d))throw new Error('Corrected distance duplicates another measurement');const at=this.clock();row.distance_m=d;row.elapsed_seconds=e;row.revision++;row.corrected_at=at;row.correction_note=text(note);row.corrected_by=text(coachId);s.revision++;this.state.journal.push({id:stable('timing-event',s.id,row.id,'correct',at),timing_session_id:s.id,measurement_id:row.id,action:'correct',athlete_id:row.athlete_id,at,before,after:clone(row),note:text(note),coach_id:text(coachId)});this.persist();return clone(row);
    }
    retireMeasurement(sessionId,measurementId,{note='',coachId=''}={}){const s=this._row(sessionId),row=s.measurements.find(x=>x.id===text(measurementId));if(!row)throw new Error(`Measurement not found: ${measurementId}`);if(row.status==='retired')return clone(row);const at=this.clock();row.status='retired';row.revision++;row.retired_at=at;s.revision++;this.state.journal.push({id:stable('timing-event',s.id,row.id,'retire',at),timing_session_id:s.id,measurement_id:row.id,action:'retire',athlete_id:row.athlete_id,at,note:text(note),coach_id:text(coachId)});this.persist();return clone(row)}
    closeSession(sessionId,{endedAt='',note=''}={}){const s=this._row(sessionId);if(s.status!=='running')throw new Error(`Timing session cannot close from ${s.status}`);const at=text(endedAt)||this.clock();s.status='finished';s.ended_at=at;s.revision++;this.state.journal.push({id:stable('timing-event',s.id,'close',at),timing_session_id:s.id,action:'close',at,note:text(note)});this.persist();return clone(s)}
    abandonSession(sessionId,{note=''}={}){const s=this._row(sessionId);if(s.status==='finished')throw new Error('Finished timing session cannot be abandoned');if(s.status==='abandoned')return clone(s);const at=this.clock();s.status='abandoned';s.ended_at=at;s.revision++;this.state.journal.push({id:stable('timing-event',s.id,'abandon',at),timing_session_id:s.id,action:'abandon',at,note:text(note)});this.persist();return clone(s)}
    list({status='',athleteRef=''}={}){let rows=this.state.sessions;if(status)rows=rows.filter(x=>x.status===text(status));if(athleteRef){const aid=this.athleteId(athleteRef);rows=rows.filter(x=>x.assignments.some(a=>a.athlete_id===aid&&a.active!==false))}return clone(rows)}
    history(sessionId){return clone(this.state.journal.filter(x=>x.timing_session_id===text(sessionId)).sort((a,b)=>text(a.at).localeCompare(text(b.at))))}
  }
  const create=options=>new TimingEngine(options);
  return{VERSION,SCHEMA,create,TimingEngine,MemoryStorage,blankState,normalizeState,normalizeContext,activeMeasurement};
});
