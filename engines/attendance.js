'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Attendance=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.attendance.v1';
  const HERE_STATUSES=new Set(['present','modified','late']);
  const VALID_STATUSES=new Set(['present','modified','late','absent','excused','not_marked']);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;

  function blankState(){return{schema:SCHEMA,records:[],journal:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.records))s.records=[];if(!Array.isArray(s.journal))s.journal=[];return s}
  function sessionId(sessionOrId){return typeof sessionOrId==='string'?text(sessionOrId):text(sessionOrId?.id)}
  function normalizeStatus(status){const s=lower(status||'not_marked').replace(/\s+/g,'_');if(!VALID_STATUSES.has(s))throw new Error(`Invalid attendance status: ${status}`);return s}
  function recordKey(session,athleteId){return`${sessionId(session)}|${text(athleteId)}`}
  function entryId(session,athleteId,at,status){return stable('attendance-event',sessionId(session),athleteId,at,status)}

  class MemoryStorage{
    constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0;}
    load(){this.reads++;return clone(this.value)}
    save(value){this.writes++;this.value=clone(value);return true}
  }

  class Attendance{
    constructor({storage,evidence,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Attendance Engine requires a storage adapter');
      if(!evidence||typeof evidence.resolveAthlete!=='function'||typeof evidence.listAthletes!=='function')throw new Error('Attendance Engine requires Evidence Retrieval for athlete identity');
      this.storage=storage;this.evidence=evidence;this.clock=clock;
      // Boot is read-only. No roster or old roll is copied into a new session.
      this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    eligibleRoster(session,{includeInactive=false}={}){
      const squads=new Set((session?.identity?.squads||[]).map(lower).filter(Boolean));
      return this.evidence.listAthletes().filter(a=>includeInactive||a.active!==false).filter(a=>!squads.size||squads.has(lower(a.squad))).sort((a,b)=>text(a.full_name).localeCompare(text(b.full_name))).map(clone);
    }
    get(session,athleteRef){
      const sid=sessionId(session),ath=this.athlete(athleteRef);if(!sid||!ath)return null;return clone(this.state.records.find(r=>r.session_id===sid&&r.athlete_id===ath.id)||null);
    }
    status(session,athleteRef){return this.get(session,athleteRef)?.status||'not_marked'}
    isHere(session,athleteRef){return HERE_STATUSES.has(this.status(session,athleteRef))}
    mark(session,athleteRef,status,{note='',source='roll'}={}){
      const sid=sessionId(session);if(!sid)throw new Error('Attendance requires an exact session id');const ath=this.athlete(athleteRef);if(!ath)throw new Error(`Athlete not found: ${athleteRef}`);if(ath.active===false)throw new Error(`Inactive athlete cannot be marked on an active roll: ${ath.full_name}`);
      const next=normalizeStatus(status),at=this.clock(),key=recordKey(sid,ath.id),i=this.state.records.findIndex(r=>recordKey(r.session_id,r.athlete_id)===key),before=i>=0?this.state.records[i].status:'not_marked';
      if(before===next){return clone(this.state.records[i]||{session_id:sid,athlete_id:ath.id,status:next})}
      const row={session_id:sid,athlete_id:ath.id,status:next,note:text(note),updated_at:at};if(i>=0)this.state.records[i]=row;else this.state.records.push(row);
      this.state.journal.push({id:entryId(sid,ath.id,at,next),session_id:sid,athlete_id:ath.id,from:before,to:next,note:text(note),source:text(source)||'roll',at});this.persist();return clone(row);
    }
    clearMark(session,athleteRef,{note=''}={}){return this.mark(session,athleteRef,'not_marked',{note,source:'roll_clear'})}
    recordsForSession(session){const sid=sessionId(session);if(!sid)return[];return clone(this.state.records.filter(r=>r.session_id===sid))}
    here(session){
      const sid=sessionId(session);if(!sid)return[];
      return this.state.records.filter(r=>r.session_id===sid&&HERE_STATUSES.has(r.status)).map(r=>({record:clone(r),athlete:this.athlete(r.athlete_id)})).filter(x=>x.athlete).sort((a,b)=>text(a.athlete.full_name).localeCompare(text(b.athlete.full_name)));
    }
    hereAthletes(session){return this.here(session).map(x=>clone(x.athlete))}
    notMarked(session){return this.eligibleRoster(session).filter(a=>this.status(session,a.id)==='not_marked')}
    summary(session){const rows=this.recordsForSession(session),counts={present:0,modified:0,late:0,absent:0,excused:0,not_marked:0};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;const eligible=this.eligibleRoster(session);counts.not_marked=eligible.filter(a=>this.status(session,a.id)==='not_marked').length;return{sessionId:sessionId(session),here:this.here(session).length,eligible:eligible.length,counts}}
    history(session,athleteRef){const sid=sessionId(session),ath=this.athlete(athleteRef);if(!sid||!ath)return[];return clone(this.state.journal.filter(x=>x.session_id===sid&&x.athlete_id===ath.id).sort((a,b)=>text(a.at).localeCompare(text(b.at))))}
  }

  const create=options=>new Attendance(options);
  return{VERSION,SCHEMA,HERE_STATUSES,VALID_STATUSES,create,Attendance,MemoryStorage,blankState,normalizeState,sessionId,normalizeStatus,recordKey};
});
