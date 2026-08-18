'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.OfficialResultsReconciliation=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.official-results-reconciliation.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  function blankState(){return{schema:SCHEMA,reconciliations:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.reconciliations))s.reconciliations=[];return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(v){this.writes++;this.value=clone(v);return true}}
  function officialSpec(row={}){return{raceId:text(row.race_id||row.raceId),athleteRef:row.athlete_id||row.athleteId||row.athlete_name||row.athleteName||row.athlete,eventId:text(row.event_id||row.eventId),eventNo:text(row.event_no||row.eventNo),distance_m:num(row.distance_m??row.distance),stroke:text(row.stroke),round:text(row.round),heat:text(row.heat),lane:text(row.lane),course:text(row.course||row.pool_course).toUpperCase(),resultSeconds:num(row.result_seconds??row.resultSeconds??row.time_seconds),resultStatus:lower(row.result_status||row.resultStatus||row.status||'finished'),splits:clone(row.splits||[]),place:num(row.place),notes:text(row.notes||row.note)}}
  function compare(existing,official){if(!existing)return'add_official';const status=lower(official.resultStatus);if(status==='dq')return'dq';const sameStatus=lower(existing.result_status)===status,sameTime=num(existing.result_seconds)===num(official.resultSeconds),samePlace=num(existing.place)===num(official.place),sameSplits=JSON.stringify(existing.splits||[])===JSON.stringify(official.splits||[]);return sameStatus&&sameTime&&samePlace&&sameSplits?'confirm':'correct'}

  class OfficialResultsReconciliation{
    constructor({storage,meets,results,clock=nowDefault}={}){
      if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Official Results Reconciliation requires storage adapter');
      if(!meets||typeof meets.matchRace!=='function'||typeof meets.matchEvent!=='function'||typeof meets.entryFor!=='function'||typeof meets.upsertEntry!=='function'||typeof meets.upsertRace!=='function')throw new Error('Official Results Reconciliation requires Meet Lifecycle contract');
      if(!results||typeof results.byRace!=='function'||typeof results.applyOfficial!=='function'||typeof results.captureOfficial!=='function'||typeof results.query!=='function')throw new Error('Official Results Reconciliation requires Meet Result Input contract');
      this.storage=storage;this.meets=meets;this.results=results;this.clock=clock;this.state=normalizeState(storage.load());
    }
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    get(id){return clone(this.state.reconciliations.find(x=>x.id===text(id))||null)}
    _resolveRow(meetId,row,index){
      const spec=officialSpec(row),base={index,official:spec,source_row:clone(row)};let match=this.meets.matchRace({meetId,raceId:spec.raceId,athleteRef:spec.athleteRef,eventId:spec.eventId,eventNo:spec.eventNo,distance:spec.distance_m,stroke:spec.stroke,round:spec.round});
      if(match?.status==='ok'){const existing=this.results.byRace(match.race.id);return{...base,status:'matched',action:compare(existing,spec),race:match.race,existing}}
      if(match?.status==='missing_athlete')return{...base,status:'unresolved',reason:'missing_athlete'};
      if(match?.status==='ambiguous')return{...base,status:'unresolved',reason:'ambiguous_race'};
      const eventMatch=this.meets.matchEvent({meetId,eventId:spec.eventId,eventNo:spec.eventNo,distance:spec.distance_m,stroke:spec.stroke});if(eventMatch?.status!=='ok')return{...base,status:'unresolved',reason:eventMatch?.status==='ambiguous'?'ambiguous_event':'missing_event'};
      let entry=null;try{entry=this.meets.entryFor({meetId,athleteRef:spec.athleteRef,eventId:eventMatch.event.id})}catch(_){return{...base,status:'unresolved',reason:'ambiguous_entry'}}
      return{...base,status:'matched',action:entry?'create_race_and_result':'create_entry_race_and_result',event:eventMatch.event,entry};
    }
    preview({meetId,sourceRef,officialRows=[],completeFile=false}={}){
      const mid=text(meetId),ref=text(sourceRef);if(!mid)throw new Error('Official reconciliation requires meetId');if(!ref)throw new Error('Official reconciliation requires sourceRef');if(!Array.isArray(officialRows))throw new Error('officialRows must be an array');const actions=officialRows.map((row,i)=>this._resolveRow(mid,row,i));const matchedRaceIds=new Set(actions.map(x=>x.race?.id).filter(Boolean));const provisionalNotConfirmed=[];if(completeFile){for(const row of this.results.query({meetId:mid,evidenceStatus:'provisional'}))if(!matchedRaceIds.has(row.race_id))provisionalNotConfirmed.push({result_id:row.id,race_id:row.race_id,athlete_id:row.athlete_id,reason:'provisional_not_present_in_official_file'})}
      const counts={rows:actions.length,confirm:0,correct:0,dq:0,add_official:0,create_race_and_result:0,create_entry_race_and_result:0,unresolved:0,provisional_not_confirmed:provisionalNotConfirmed.length};for(const x of actions){if(x.status==='unresolved')counts.unresolved++;else if(Object.hasOwn(counts,x.action))counts[x.action]++}return{schema:SCHEMA,version:VERSION,meetId:mid,sourceRef:ref,completeFile:!!completeFile,actions:clone(actions),provisionalNotConfirmed,counts}}
    apply({meetId,sourceRef,officialRows=[],completeFile=false,coachId='',note=''}={}){
      const preview=this.preview({meetId,sourceRef,officialRows,completeFile}),at=this.clock(),id=stable('reconciliation',meetId,sourceRef,at),outcomes=[];
      for(const item of preview.actions){if(item.status==='unresolved'){outcomes.push({index:item.index,status:'unresolved',reason:item.reason});continue}let race=item.race,entry=item.entry;
        if(item.action==='create_entry_race_and_result'){entry=this.meets.upsertEntry({meet_id:meetId,event_id:item.event.id,athlete_id:item.official.athleteRef,status:'entered'},{coachId,note:`Official file ${sourceRef}: recovered missed entry`});}
        if(item.action==='create_race_and_result'||item.action==='create_entry_race_and_result'){race=this.meets.upsertRace({meet_id:meetId,event_id:item.event.id,entry_id:entry.id,athlete_id:entry.athlete_id,round:item.official.round||'heat',heat:item.official.heat,lane:item.official.lane,status:'completed'},{coachId,note:`Official file ${sourceRef}: recovered missed race`});}
        const official={meetId,raceId:race.id,athleteRef:race.athlete_id,eventId:race.event_id,round:item.official.round||race.round,heat:item.official.heat||race.heat,lane:item.official.lane||race.lane,course:item.official.course,resultSeconds:item.official.resultSeconds,resultStatus:item.official.resultStatus,splits:item.official.splits,place:item.official.place,notes:item.official.notes};let result;
        if(item.action==='confirm'||item.action==='correct'||item.action==='dq')result=this.results.applyOfficial(item.existing.id,official,{sourceRef,sourceType:'official_tm',reconciliationId:id,coachId,note});else result=this.results.captureOfficial(official,{sourceRef,sourceType:'official_tm',reconciliationId:id,coachId,note});
        if(race.status!=='completed')race=this.meets.upsertRace({...race,status:'completed'},{coachId,note:`Official file ${sourceRef}: race reconciled`});outcomes.push({index:item.index,status:'applied',action:item.action,race_id:race.id,result_id:result.id,verification_outcome:result.verification_outcome,result_status:result.result_status});
      }
      const counts={confirmed:outcomes.filter(x=>x.verification_outcome==='confirmed').length,corrected:outcomes.filter(x=>x.verification_outcome==='corrected').length,dq:outcomes.filter(x=>x.verification_outcome==='dq').length,official_only:outcomes.filter(x=>x.verification_outcome==='official_only').length,unresolved:outcomes.filter(x=>x.status==='unresolved').length,provisional_not_confirmed:preview.provisionalNotConfirmed.length};const report={id,schema:SCHEMA,meet_id:text(meetId),source_type:'official_tm',source_ref:text(sourceRef),complete_file:!!completeFile,created_at:at,coach_id:text(coachId),note:text(note),counts,outcomes,provisional_not_confirmed:clone(preview.provisionalNotConfirmed)};this.state.reconciliations.push(report);this.persist();return clone(report)
    }
    list({meetId=''}={}){return clone(this.state.reconciliations.filter(x=>!meetId||x.meet_id===text(meetId)))}
  }
  const create=options=>new OfficialResultsReconciliation(options);
  return{VERSION,SCHEMA,create,OfficialResultsReconciliation,MemoryStorage,blankState,normalizeState,officialSpec,compare};
});
