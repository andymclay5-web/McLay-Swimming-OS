'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionSchedule=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.session-schedule.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const time=v=>/^\d{2}:\d{2}$/.test(text(v))?text(v):'';
  const minutes=v=>{const t=time(v);if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  const normDayPart=v=>{const x=text(v).toUpperCase();return x==='AM'||x==='PM'?x:''};
  const inferredDayPart=start=>{const m=minutes(start);return m==null?'':m<12*60?'AM':'PM'};
  const active=row=>row?.active!==false&&!['retired','cancelled','superseded'].includes(text(row?.status).toLowerCase());
  const coverageContains=(source,d)=>{const start=date(source?.coverage_start||source?.coverageStart),end=date(source?.coverage_end||source?.coverageEnd);return !!d&&(!start||d>=start)&&(!end||d<=end)};
  const sourceId=(source,i=0)=>text(source?.calendar_id||source?.id)||`calendar-${i+1}`;
  const sourcePriority=(source,i=0)=>({priority:Number(source?.priority)||0,published:text(source?.published_at||source?.publishedAt),index:i});
  function strongerSource(a,b){if(!a)return b;if(!b)return a;const A=sourcePriority(a.source,a.index),B=sourcePriority(b.source,b.index);if(A.priority!==B.priority)return B.priority>A.priority?b:a;if(A.published!==B.published)return B.published>A.published?b:a;return B.index>A.index?b:a}
  function chooseSourceForDate(sources,d){let winner=null;(sources||[]).forEach((source,index)=>{if(!coverageContains(source,d)&&!(source?.dates||[]).some(x=>date(x?.date)===d))return;winner=strongerSource(winner,{source,index})});return winner}
  function resolveSquad(entities,ref){if(!entities||typeof entities.resolveSquad!=='function')throw new Error('SessionSchedule requires Entity Registry contract');return entities.resolveSquad(ref)}
  function normalizePublishedSlot({source,dateValue,row,squadRef,kind='training',eventName='',sourceGroupId=''},{entities,index=0}={}){
    const d=date(dateValue),start=time(row?.start_time||row?.start),end=time(row?.end_time||row?.end),dayPart=normDayPart(row?.day_part||row?.dayPart)||inferredDayPart(start),venue=text(row?.venue),course=text(row?.pool_course||row?.course).toUpperCase(),label=text(squadRef),squad=resolveSquad(entities,squadRef),sid=sourceId(source,index);
    const id=stable('schedule-slot',sid,d,dayPart,start,end,label,venue,course,kind,eventName);
    return{id,kind,date:d,dayPart,start,end,venue,course,squadId:squad?.id||'',squadLabel:squad?.name||label,identityStatus:squad?'resolved':'unresolved_squad',source:{type:'published_calendar',calendarId:sid,calendarTitle:text(source?.title),publishedAt:text(source?.published_at||source?.publishedAt),status:text(source?.status),groupId:sourceGroupId},eventName:text(eventName),note:text(row?.note),active:true};
  }
  function slotsFromSourceDate(source,dateRow,{entities,index=0}={}){
    const d=date(dateRow?.date);if(!d)return[];const out=[];
    for(const row of (dateRow?.sessions||[])){
      const groupId=stable('schedule-source-group',sourceId(source,index),d,normDayPart(row?.day_part)||inferredDayPart(row?.start_time),row?.start_time,row?.end_time,row?.venue,row?.pool_course,(row?.squads||[]).map(text).sort().join('+'));
      for(const squadRef of (row?.squads||[]))out.push(normalizePublishedSlot({source,dateValue:d,row,squadRef,kind:'training',sourceGroupId:groupId},{entities,index}));
    }
    for(const row of (dateRow?.events||[])){
      if(!row?.authorable||!text(row?.session_squad))continue;
      const eventName=text(row?.name),groupId=stable('schedule-source-event',sourceId(source,index),d,eventName,row?.start_time,row?.venue);
      out.push(normalizePublishedSlot({source,dateValue:d,row,squadRef:row.session_squad,kind:'event',eventName,sourceGroupId:groupId},{entities,index}));
    }
    return dedupeSlots(out);
  }
  function dedupeSlots(rows=[]){const seen=new Set(),out=[];for(const row of rows){if(seen.has(row.id))continue;seen.add(row.id);out.push(row)}return out}
  function blankState(){return{schema:SCHEMA,customSlots:[],occurrences:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.customSlots))s.customSlots=[];if(!Array.isArray(s.occurrences))s.occurrences=[];return s}
  function journal(type,at,details={}){return{id:stable('schedule-event',type,at,JSON.stringify(details)),type,at,...clone(details)}}
  function sortSlots(rows=[]){return [...rows].sort((a,b)=>`${a.start}|${a.end}|${a.squadLabel}|${a.id}`.localeCompare(`${b.start}|${b.end}|${b.squadLabel}|${b.id}`))}
  function assertSlotTimes(slot){const a=minutes(slot?.start),b=minutes(slot?.end);if(a==null||b==null||b<=a)throw new Error(`Invalid schedule slot time: ${slot?.id||'unknown'}`)}
  function occurrenceWindow(slots=[]){const starts=slots.map(x=>minutes(x.start)),ends=slots.map(x=>minutes(x.end));return{startMinutes:Math.min(...starts),endMinutes:Math.max(...ends),overlapStart:Math.max(...starts),overlapEnd:Math.min(...ends)}}

  class MemoryStorage{
    constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}
    load(){this.reads++;return clone(this.value)}
    save(value){this.writes++;this.value=clone(value);return true}
  }

  class SessionSchedule{
    constructor({storage,entities,calendarSources=[],clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('SessionSchedule requires a storage adapter');
      if(!entities||typeof entities.resolveSquad!=='function')throw new Error('SessionSchedule requires Entity Registry contract');
      this.storage=storage;this.entities=entities;this.clock=clock;this.sources=clone(calendarSources||[]);this.state=normalizeState(storage.load());this._rebuildPublishedIndex();
    }
    _rebuildPublishedIndex(){
      this.publishedByDate=new Map();this.publishedById=new Map();const dates=new Set();for(const source of this.sources)for(const row of (source?.dates||[])){const d=date(row?.date);if(d)dates.add(d)}
      for(const d of dates){const picked=chooseSourceForDate(this.sources,d);if(!picked)continue;const row=(picked.source?.dates||[]).find(x=>date(x?.date)===d);const slots=row?slotsFromSourceDate(picked.source,row,{entities:this.entities,index:picked.index}):[];this.publishedByDate.set(d,slots);for(const slot of slots)this.publishedById.set(slot.id,slot)}
    }
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    dateInfo(d){
      const day=date(d);if(!day)return{date:'',status:'invalid',source:null};const picked=chooseSourceForDate(this.sources,day);if(!picked)return{date:day,status:'unpublished',source:null};const row=(picked.source?.dates||[]).find(x=>date(x?.date)===day)||null,emptyMeansOff=picked.source?.rules?.empty_date_means_no_training===true,status=row?text(row.status)||((row.sessions||[]).length?'training':'no_training'):(emptyMeansOff?'no_training':'unpublished');
      return{date:day,status,notes:clone(row?.notes||[]),source:{calendarId:sourceId(picked.source,picked.index),title:text(picked.source?.title),publishedAt:text(picked.source?.published_at||picked.source?.publishedAt),coverageMode:text(picked.source?.coverage_mode||picked.source?.coverageMode),timezone:text(picked.source?.timezone)}}
    }
    listCustomSlots({includeRetired=false}={}){return clone(this.state.customSlots.filter(x=>includeRetired||active(x)))}
    slotsForDate(d,{includeRetired=false}={}){const day=date(d);if(!day)return[];const rows=[...(this.publishedByDate.get(day)||[]),...this.state.customSlots.filter(x=>x.date===day).filter(x=>includeRetired||active(x))];return clone(sortSlots(rows))}
    getSlot(id){const key=text(id);if(this.publishedById.has(key))return clone(this.publishedById.get(key));return clone(this.state.customSlots.find(x=>x.id===key)||null)}
    createCustomSlot(spec={},{note=''}={}){
      const d=date(spec.date),start=time(spec.start),end=time(spec.end),dayPart=normDayPart(spec.dayPart)||inferredDayPart(start),squad=resolveSquad(this.entities,spec.squadId||spec.squadRef||spec.squad);if(!d)throw new Error('Custom schedule slot requires YYYY-MM-DD date');if(!start||!end)throw new Error('Custom schedule slot requires HH:MM start and end');if(minutes(end)<=minutes(start))throw new Error('Custom schedule slot end must be after start');if(!squad)throw new Error(`Custom schedule slot squad not found: ${text(spec.squadId||spec.squadRef||spec.squad)}`);
      const at=this.clock(),id=text(spec.id)||stable('custom-schedule-slot',d,dayPart,start,end,squad.id,text(spec.venue),text(spec.course),at),slot={id,kind:text(spec.kind)||'training',date:d,dayPart,start,end,venue:text(spec.venue),course:text(spec.course).toUpperCase(),squadId:squad.id,squadLabel:squad.name||text(spec.squad),identityStatus:'resolved',source:{type:'coach_custom'},eventName:text(spec.eventName),note:text(spec.note||note),active:true,createdAt:at,updatedAt:at,journal:[journal('create_custom_slot',at,{note:text(note)})]};if(this.getSlot(id))throw new Error(`Schedule slot already exists: ${id}`);this.state.customSlots.push(slot);this.persist();return clone(slot)
    }
    retireCustomSlot(id,{note=''}={}){const i=this.state.customSlots.findIndex(x=>x.id===text(id));if(i<0)throw new Error(`Custom schedule slot not found: ${id}`);const at=this.clock(),slot=this.state.customSlots[i];slot.active=false;slot.status='retired';slot.updatedAt=at;slot.journal=[...(slot.journal||[]),journal('retire_custom_slot',at,{note:text(note)})];this.persist();return clone(slot)}
    _activeOccurrences(){return this.state.occurrences.filter(active)}
    _occurrenceForSlot(slotId){return this._activeOccurrences().find(x=>(x.slotIds||[]).includes(text(slotId)))||null}
    _validateLink(slotIds){
      const ids=[...new Set((slotIds||[]).map(text).filter(Boolean))];if(!ids.length)throw new Error('At least one schedule slot is required');const slots=ids.map(id=>this.getSlot(id));if(slots.some(x=>!x))throw new Error(`Schedule slot not found: ${ids[slots.findIndex(x=>!x)]}`);for(const slot of slots){assertSlotTimes(slot);if(!slot.squadId)throw new Error(`Schedule slot has unresolved squad identity: ${slot.id}`);if(this._occurrenceForSlot(slot.id))throw new Error(`Schedule slot already belongs to an active occurrence: ${slot.id}`)}
      const first=slots[0];for(const slot of slots.slice(1)){for(const field of ['date','dayPart','venue','course','kind'])if(text(slot[field])!==text(first[field]))throw new Error(`Shared occurrence requires matching ${field}`)}
      const squadIds=slots.map(x=>x.squadId);if(new Set(squadIds).size!==squadIds.length)throw new Error('Shared occurrence cannot contain the same squad twice');const w=occurrenceWindow(slots);if(slots.length>1&&w.overlapStart>=w.overlapEnd)throw new Error('Shared occurrence slots must overlap in clock time');return sortSlots(slots)
    }
    linkSlots(slotIds,{id='',sessionId='',note=''}={}){
      const slots=this._validateLink(slotIds),at=this.clock(),occurrenceId=text(id)||stable('schedule-occurrence',slots.map(x=>x.id).sort().join('+'),at),occ={id:occurrenceId,slotIds:slots.map(x=>x.id),sessionId:text(sessionId),status:'active',active:true,createdAt:at,updatedAt:at,journal:[journal('link_slots',at,{slotIds:slots.map(x=>x.id),sessionId:text(sessionId),note:text(note)})]};if(this.state.occurrences.some(x=>x.id===occurrenceId))throw new Error(`Schedule occurrence already exists: ${occurrenceId}`);if(occ.sessionId&&this._activeOccurrences().some(x=>x.sessionId===occ.sessionId))throw new Error(`Session already bound to an active schedule occurrence: ${occ.sessionId}`);this.state.occurrences.push(occ);this.persist();return this.occurrence(occ.id)
    }
    bindSession(occurrenceId,sessionId,{note=''}={}){const i=this.state.occurrences.findIndex(x=>x.id===text(occurrenceId)&&active(x));if(i<0)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);const sid=text(sessionId);if(!sid)throw new Error('Session id is required');const other=this._activeOccurrences().find(x=>x.id!==text(occurrenceId)&&x.sessionId===sid);if(other)throw new Error(`Session already bound to schedule occurrence: ${other.id}`);const at=this.clock(),occ=this.state.occurrences[i];if(occ.sessionId===sid)return this.occurrence(occ.id);occ.sessionId=sid;occ.updatedAt=at;occ.journal.push(journal('bind_session',at,{sessionId:sid,note:text(note)}));this.persist();return this.occurrence(occ.id)}
    unbindSession(occurrenceId,{note=''}={}){const i=this.state.occurrences.findIndex(x=>x.id===text(occurrenceId)&&active(x));if(i<0)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);const at=this.clock(),occ=this.state.occurrences[i],before=occ.sessionId||'';occ.sessionId='';occ.updatedAt=at;occ.journal.push(journal('unbind_session',at,{sessionId:before,note:text(note)}));this.persist();return this.occurrence(occ.id)}
    retireOccurrence(occurrenceId,{note=''}={}){const i=this.state.occurrences.findIndex(x=>x.id===text(occurrenceId)&&active(x));if(i<0)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);const at=this.clock(),occ=this.state.occurrences[i];occ.active=false;occ.status='retired';occ.updatedAt=at;occ.journal.push(journal('retire_occurrence',at,{note:text(note)}));this.persist();return clone(occ)}
    occurrence(id){const raw=this.state.occurrences.find(x=>x.id===text(id));return raw?this._occurrenceView(raw):null}
    occurrenceForSession(sessionId){const raw=this._activeOccurrences().find(x=>x.sessionId===text(sessionId));return raw?this._occurrenceView(raw):null}
    _occurrenceView(raw){
      const slots=sortSlots((raw.slotIds||[]).map(id=>this.getSlot(id)).filter(Boolean)),w=slots.length?occurrenceWindow(slots):null,first=slots[0]||null;return{id:raw.id,status:raw.status||'active',active:active(raw),sessionId:raw.sessionId||'',date:first?.date||'',dayPart:first?.dayPart||'',start:w?`${String(Math.floor(w.startMinutes/60)).padStart(2,'0')}:${String(w.startMinutes%60).padStart(2,'0')}`:'',end:w?`${String(Math.floor(w.endMinutes/60)).padStart(2,'0')}:${String(w.endMinutes%60).padStart(2,'0')}`:'',venue:first?.venue||'',course:first?.course||'',kind:first?.kind||'',slotIds:slots.map(x=>x.id),squadEntries:slots.map(x=>({slotId:x.id,squadId:x.squadId,squadLabel:x.squadLabel,start:x.start,end:x.end,startOffsetMinutes:w?minutes(x.start)-w.startMinutes:0,endBeforeLatestMinutes:w?w.endMinutes-minutes(x.end):0,eventName:x.eventName||''})),createdAt:raw.createdAt,updatedAt:raw.updatedAt,journal:clone(raw.journal||[])}
    }
    entryContext(occurrenceId,squadRef){const occ=this.occurrence(occurrenceId);if(!occ||!occ.active)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);const squad=resolveSquad(this.entities,squadRef),id=squad?.id||text(squadRef),row=occ.squadEntries.find(x=>x.squadId===id);if(!row)throw new Error(`Squad is not part of schedule occurrence: ${text(squadRef)}`);return clone({...row,occurrenceId:occ.id,sessionId:occ.sessionId,date:occ.date,dayPart:occ.dayPart,venue:occ.venue,course:occ.course})}
    identityForOccurrence(occurrenceId,{title=''}={}){const occ=this.occurrence(occurrenceId);if(!occ||!occ.active)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);const squads=occ.squadEntries.map(x=>x.squadLabel),squadIds=occ.squadEntries.map(x=>x.squadId);return{date:occ.date,dayPart:occ.dayPart,title:text(title)||`${occ.dayPart} · ${squads.join('+')}`,squads,squadIds,venue:occ.venue,course:occ.course,start:occ.start,end:occ.end,scheduleOccurrenceId:occ.id,scheduleSlotIds:clone(occ.slotIds),scheduleEntries:clone(occ.squadEntries)}}
    day(d){
      const day=date(d),slots=this.slotsForDate(day),slotIds=new Set(slots.map(x=>x.id)),occurrences=this._activeOccurrences().filter(o=>(o.slotIds||[]).some(id=>slotIds.has(id))).map(o=>this._occurrenceView(o)),bound=new Set(occurrences.flatMap(x=>x.slotIds)),items=[...occurrences.map(x=>({type:'occurrence',...x})),...slots.filter(x=>!bound.has(x.id)).map(x=>({type:'slot',id:x.id,date:x.date,dayPart:x.dayPart,start:x.start,end:x.end,venue:x.venue,course:x.course,kind:x.kind,sessionId:'',slotIds:[x.id],squadEntries:[{slotId:x.id,squadId:x.squadId,squadLabel:x.squadLabel,start:x.start,end:x.end,startOffsetMinutes:0,endBeforeLatestMinutes:0,eventName:x.eventName||''}],source:clone(x.source)}))];items.sort((a,b)=>`${a.start}|${a.end}|${a.id}`.localeCompare(`${b.start}|${b.end}|${b.id}`));return{...this.dateInfo(day),items}
    }
    listOccurrences({date:dateFilter='',includeRetired=false}={}){return this.state.occurrences.filter(x=>includeRetired||active(x)).map(x=>this._occurrenceView(x)).filter(x=>!dateFilter||x.date===date(dateFilter))}
    history(occurrenceId){return clone(this.state.occurrences.find(x=>x.id===text(occurrenceId))?.journal||[])}
    snapshot(){return{schema:SCHEMA,version:VERSION,state:clone(this.state),publishedSlotCount:this.publishedById.size,calendarSources:this.sources.map((x,i)=>({calendarId:sourceId(x,i),title:text(x.title),publishedAt:text(x.published_at||x.publishedAt),coverageStart:date(x.coverage_start||x.coverageStart),coverageEnd:date(x.coverage_end||x.coverageEnd)}))}}
  }
  const create=options=>new SessionSchedule(options);
  return{VERSION,SCHEMA,create,SessionSchedule,MemoryStorage,blankState,normalizeState,date,time,minutes,normDayPart,inferredDayPart,coverageContains,chooseSourceForDate,normalizePublishedSlot,slotsFromSourceDate,occurrenceWindow};
});
