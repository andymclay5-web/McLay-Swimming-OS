'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.MeetLifecycle=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.meet.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function stroke(v){const s=lower(v);if(!s)return'';if(/^(free|freestyle|fr)$/.test(s))return'Freestyle';if(/^(back|backstroke|bk)$/.test(s))return'Backstroke';if(/^(breast|breaststroke|br)$/.test(s))return'Breaststroke';if(/^(fly|butterfly)$/.test(s))return'Butterfly';if(/^(im|medley|individual medley)$/.test(s))return'IM';return text(v)}
  function blankState(){return{schema:SCHEMA,meets:[],sessions:[],events:[],entries:[],races:[],journal:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;for(const k of ['meets','sessions','events','entries','races','journal'])if(!Array.isArray(s[k]))s[k]=[];return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(v){this.writes++;this.value=clone(v);return true}}
  const COLLECTIONS={meet:'meets',session:'sessions',event:'events',entry:'entries',race:'races'};

  class MeetLifecycle{
    constructor({storage,entities,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Meet Lifecycle requires storage adapter');
      if(!entities||typeof entities.resolveAthlete!=='function'||typeof entities.athleteId!=='function')throw new Error('Meet Lifecycle requires injected Entity Registry contract');
      this.storage=storage;this.entities=entities;this.clock=clock;this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    athlete(ref){const a=this.entities.resolveAthlete(ref);if(!a)throw new Error(`Athlete not found: ${typeof ref==='string'?ref:ref?.id||''}`);return a}
    _get(kind,id){const rows=this.state[COLLECTIONS[kind]]||[];return clone(rows.find(x=>x.id===text(id))||null)}
    getMeet(id){return this._get('meet',id)}getSession(id){return this._get('session',id)}getEvent(id){return this._get('event',id)}getEntry(id){return this._get('entry',id)}getRace(id){return this._get('race',id)}
    _upsert(kind,row,{coachId='',note=''}={}){
      const collection=COLLECTIONS[kind];if(!collection)throw new Error(`Unknown meet collection: ${kind}`);const rows=this.state[collection],id=text(row?.id);if(!id)throw new Error(`${kind} requires id`);const i=rows.findIndex(x=>x.id===id),before=i>=0?clone(rows[i]):null,at=this.clock(),next={...clone(row),id,updated_at:at};
      if(i>=0)rows[i]=next;else rows.push(next);this.state.journal.push({id:stable('meet-event',kind,id,i>=0?'update':'create',at),kind,row_id:id,action:i>=0?'update':'create',at,coach_id:text(coachId),note:text(note),before,after:clone(next)});this.persist();return clone(next);
    }
    upsertMeet(row,opts={}){const id=text(row?.id);if(!id)throw new Error('Meet requires id');return this._upsert('meet',{name:text(row.name),start_date:text(row.start_date||row.startDate),end_date:text(row.end_date||row.endDate),venue:text(row.venue),course:text(row.course).toUpperCase(),status:text(row.status)||'planned',active:row.active!==false,...clone(row),id},opts)}
    upsertSession(row,opts={}){const meet=this.getMeet(row?.meet_id||row?.meetId);if(!meet)throw new Error('Meet session requires valid meet_id');const id=text(row?.id);if(!id)throw new Error('Meet session requires id');return this._upsert('session',{meet_id:meet.id,date:text(row.date),name:text(row.name),order:num(row.order),status:text(row.status)||'planned',...clone(row),id,meet_id:meet.id},opts)}
    upsertEvent(row,opts={}){const meet=this.getMeet(row?.meet_id||row?.meetId);if(!meet)throw new Error('Meet event requires valid meet_id');const id=text(row?.id),distance=num(row.distance_m??row.distance),st=stroke(row.stroke);if(!id)throw new Error('Meet event requires id');if(distance===null||distance<=0)throw new Error('Meet event requires positive distance_m');if(!st)throw new Error('Meet event requires stroke');const sessionId=text(row.meet_session_id||row.meetSessionId);if(sessionId){const s=this.getSession(sessionId);if(!s||s.meet_id!==meet.id)throw new Error('Meet event session does not belong to meet')}return this._upsert('event',{meet_id:meet.id,meet_session_id:sessionId||null,event_no:text(row.event_no||row.eventNo),distance_m:distance,stroke:st,sex:text(row.sex),age_group:text(row.age_group||row.ageGroup),classification:text(row.classification),name:text(row.name)||`${distance} ${st}`,status:text(row.status)||'scheduled',...clone(row),id,meet_id:meet.id,meet_session_id:sessionId||null,distance_m:distance,stroke:st},opts)}
    upsertEntry(row,opts={}){const event=this.getEvent(row?.event_id||row?.eventId);if(!event)throw new Error('Meet entry requires valid event_id');const athlete=this.athlete(row?.athlete_id||row?.athleteId||row?.athlete),meetId=text(row.meet_id||row.meetId||event.meet_id);if(meetId!==event.meet_id)throw new Error('Meet entry event does not belong to meet');const id=text(row?.id)||stable('entry',meetId,event.id,athlete.id);return this._upsert('entry',{meet_id:meetId,event_id:event.id,athlete_id:athlete.id,seed_seconds:num(row.seed_seconds??row.seedSeconds),status:text(row.status)||'entered',...clone(row),id,meet_id:meetId,event_id:event.id,athlete_id:athlete.id},opts)}
    upsertRace(row,opts={}){
      const event=this.getEvent(row?.event_id||row?.eventId);if(!event)throw new Error('Race requires valid event_id');const athlete=this.athlete(row?.athlete_id||row?.athleteId||row?.athlete),meetId=text(row.meet_id||row.meetId||event.meet_id);if(meetId!==event.meet_id)throw new Error('Race event does not belong to meet');let entry=null;const entryId=text(row.entry_id||row.entryId);if(entryId)entry=this.getEntry(entryId);else entry=this.entryFor({meetId,athleteRef:athlete.id,eventId:event.id});if(!entry||entry.meet_id!==meetId||entry.event_id!==event.id||entry.athlete_id!==athlete.id)throw new Error('Race requires matching meet entry');const id=text(row?.id)||stable('race',meetId,event.id,athlete.id,text(row.round)||'heat',text(row.heat)||'',text(row.lane)||'');return this._upsert('race',{meet_id:meetId,event_id:event.id,entry_id:entry.id,athlete_id:athlete.id,meet_session_id:text(row.meet_session_id||row.meetSessionId||event.meet_session_id)||null,round:text(row.round)||'heat',heat:text(row.heat),lane:text(row.lane),status:text(row.status)||'scheduled',...clone(row),id,meet_id:meetId,event_id:event.id,entry_id:entry.id,athlete_id:athlete.id},opts)
    }
    retire(kind,id,{coachId='',note=''}={}){const row=this._get(kind,id);if(!row)throw new Error(`${kind} not found: ${id}`);return this._upsert(kind,{...row,active:false,status:'retired'},{coachId,note:note||'Retired'})}
    listMeets({activeOnly=true}={}){return clone(this.state.meets.filter(x=>!activeOnly||x.active!==false&&x.status!=='retired'))}
    meetSessions(meetId){return clone(this.state.sessions.filter(x=>x.meet_id===text(meetId)&&x.status!=='retired'))}
    meetEvents(meetId){return clone(this.state.events.filter(x=>x.meet_id===text(meetId)&&x.status!=='retired'))}
    athleteEntries(athleteRef,{meetId=''}={}){const aid=this.athlete(athleteRef).id;return clone(this.state.entries.filter(x=>x.athlete_id===aid).filter(x=>!meetId||x.meet_id===text(meetId)).filter(x=>x.status!=='retired'))}
    athleteRaces(athleteRef,{meetId=''}={}){const aid=this.athlete(athleteRef).id;return clone(this.state.races.filter(x=>x.athlete_id===aid).filter(x=>!meetId||x.meet_id===text(meetId)).filter(x=>x.status!=='retired'))}
    entryFor({meetId,athleteRef,eventId}={}){const aid=this.athlete(athleteRef).id,rows=this.state.entries.filter(x=>x.meet_id===text(meetId)&&x.athlete_id===aid&&x.event_id===text(eventId)&&x.status!=='retired');if(rows.length>1)throw new Error('Ambiguous meet entry');return clone(rows[0]||null)}
    matchEvent({meetId,eventId='',eventNo='',distance=null,stroke:strokeWanted='',sex='',ageGroup='',classification=''}={}){
      const mid=text(meetId);if(!this.getMeet(mid))return{status:'missing_meet',event:null,candidates:[]};if(eventId){const e=this.getEvent(eventId);return e&&e.meet_id===mid?{status:'ok',event:e,candidates:[e]}:{status:'missing',event:null,candidates:[]}}
      const d=num(distance),st=stroke(strokeWanted),eno=text(eventNo),sx=lower(sex),ag=lower(ageGroup),cl=lower(classification);const rows=this.state.events.filter(x=>x.meet_id===mid&&x.status!=='retired').filter(x=>!eno||text(x.event_no)===eno).filter(x=>d===null||num(x.distance_m)===d).filter(x=>!st||stroke(x.stroke)===st).filter(x=>!sx||!x.sex||lower(x.sex)===sx).filter(x=>!ag||!x.age_group||lower(x.age_group)===ag).filter(x=>!cl||!x.classification||lower(x.classification)===cl);return{status:rows.length===1?'ok':rows.length?'ambiguous':'missing',event:rows.length===1?clone(rows[0]):null,candidates:clone(rows)}
    matchRace({meetId,raceId='',athleteRef='',eventId='',eventNo='',distance=null,stroke:strokeWanted='',round=''}={}){
      const mid=text(meetId);if(!this.getMeet(mid))return{status:'missing_meet',race:null,candidates:[]};let aid='';if(athleteRef){try{aid=this.athlete(athleteRef).id}catch(_){return{status:'missing_athlete',race:null,candidates:[]}}}if(raceId){const r=this.getRace(raceId);if(!r||r.meet_id!==mid||aid&&r.athlete_id!==aid)return{status:'missing',race:null,candidates:[]};return{status:'ok',race:r,candidates:[r]}}
      let eventIds=null;if(eventId)eventIds=new Set([text(eventId)]);else if(eventNo||num(distance)!==null||strokeWanted){const em=this.matchEvent({meetId:mid,eventNo,distance,stroke:strokeWanted});if(em.status!=='ok')return{status:em.status,race:null,candidates:[],eventMatch:em};eventIds=new Set([em.event.id])}
      const rd=lower(round);const rows=this.state.races.filter(x=>x.meet_id===mid&&x.status!=='retired').filter(x=>!aid||x.athlete_id===aid).filter(x=>!eventIds||eventIds.has(x.event_id)).filter(x=>!rd||lower(x.round)===rd);return{status:rows.length===1?'ok':rows.length?'ambiguous':'missing',race:rows.length===1?clone(rows[0]):null,candidates:clone(rows)}
    lineage(raceId){const race=this.getRace(raceId);if(!race)return null;return{schema:SCHEMA,version:VERSION,meet:this.getMeet(race.meet_id),session:race.meet_session_id?this.getSession(race.meet_session_id):null,event:this.getEvent(race.event_id),entry:this.getEntry(race.entry_id),race}}
    history(kind,id){return clone(this.state.journal.filter(x=>x.kind===kind&&x.row_id===text(id)).sort((a,b)=>text(a.at).localeCompare(text(b.at))))}
  }
  const create=options=>new MeetLifecycle(options);
  return{VERSION,SCHEMA,create,MeetLifecycle,MemoryStorage,blankState,normalizeState,stroke};
});
