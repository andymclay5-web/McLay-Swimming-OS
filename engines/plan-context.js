'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.PlanContext=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='2.0.0';
  const SCHEMA='msos.plan.v2';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const COLLECTIONS=['seasons','phases','cycles','weeks','sessionIntents','meets','squadObjectives','athleteObjectives'];
  function squads(v){return[...(v||[])].map(lower).filter(Boolean).sort()}
  function sameSquads(a,b){const x=squads(a),y=squads(b);return x.length===y.length&&x.every((v,i)=>v===y[i])}
  function inRange(d,start,end){if(!d)return false;return(!start||d>=start)&&(!end||d<=end)}
  function active(row){return row?.active!==false&&!['inactive','archived','superseded','draft'].includes(lower(row?.status||row?.version_status))}
  function exactSessionMatch(row,session){if(row?.session_id&&row.session_id===session?.id)return true;const id=session?.identity||{};return !!(date(row?.date)&&date(row.date)===date(id.date)&&(!row.dayPart||lower(row.dayPart)===lower(id.dayPart))&&(!(row.squads||[]).length||sameSquads(row.squads,id.squads||[]))&&(!row.start||text(row.start)===text(id.start))&&(!row.venue||lower(row.venue)===lower(id.venue)))}
  function initialState(opts={}){const s={schema:SCHEMA,journal:[],updatedAt:null};for(const k of COLLECTIONS)s[k]=clone(opts[k]||[]);return s}
  function normalizeState(raw,opts={}){const s=raw&&typeof raw==='object'?clone(raw):initialState(opts);s.schema=SCHEMA;if(!Array.isArray(s.journal))s.journal=[];for(const k of COLLECTIONS)if(!Array.isArray(s[k]))s[k]=clone(opts[k]||[]);return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(v){this.writes++;this.value=clone(v);return true}}

  class PlanContext{
    constructor({storage=null,entities=null,clock=()=>new Date().toISOString(),...opts}={}){this.storage=storage;this.entities=entities;this.clock=clock;this.state=normalizeState(storage&&typeof storage.load==='function'?storage.load():null,opts);this._syncProps()}
    _syncProps(){for(const k of COLLECTIONS)this[k]=this.state[k]}
    snapshot(){return clone(this.state)}
    persist(){if(this.storage&&typeof this.storage.save==='function'){this.state.updatedAt=this.clock();this.storage.save(this.state)}this._syncProps();return this.snapshot()}
    _collection(name){if(!COLLECTIONS.includes(name))throw new Error(`Unknown plan collection: ${name}`);return this.state[name]}
    upsert(name,row,{coachId='',note=''}={}){const rows=this._collection(name),id=text(row?.id);if(!id)throw new Error(`${name} row requires id`);const at=this.clock(),next={...clone(row),id,updated_at:at},i=rows.findIndex(x=>text(x.id)===id),before=i>=0?clone(rows[i]):null;if(i>=0)rows[i]=next;else rows.push(next);this.state.journal.push({id:`plan-${name}-${id}-${at}`,action:i>=0?'update':'create',collection:name,rowId:id,coachId:text(coachId),note:text(note),at,before,after:clone(next)});this.persist();return clone(next)}
    retire(name,id,{coachId='',note=''}={}){const rows=this._collection(name),i=rows.findIndex(x=>text(x.id)===text(id));if(i<0)return false;return this.upsert(name,{...rows[i],active:false,status:'archived'},{coachId,note:note||'Retired'})}
    season(sessionOrDate){const d=typeof sessionOrDate==='string'?date(sessionOrDate):date(sessionOrDate?.identity?.date);return clone(this.seasons.filter(active).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0]||null)}
    phase(session,season=null){const d=date(session?.identity?.date),sid=season?.id||this.season(session)?.id;return clone(this.phases.filter(active).filter(x=>!x.season_id||!sid||x.season_id===sid).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))).sort((a,b)=>(Number(a.order)||999)-(Number(b.order)||999))[0]||null)}
    cycle(session,phase=null){const d=date(session?.identity?.date),pid=phase?.id||this.phase(session)?.id;return clone(this.cycles.filter(active).filter(x=>!x.phase_id||!pid||x.phase_id===pid).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))).sort((a,b)=>(Number(a.order)||999)-(Number(b.order)||999))[0]||null)}
    week(session,season=null,cycle=null){const d=date(session?.identity?.date),sid=season?.id||this.season(session)?.id,cid=cycle?.id||null;return clone(this.weeks.filter(active).filter(x=>!x.season_id||!sid||x.season_id===sid).filter(x=>!x.cycle_id||!cid||x.cycle_id===cid).filter(x=>inRange(d,date(x.start_date||x.week_start||x.start),date(x.end_date||x.week_end||x.end))).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0]||null)}
    intent(session,week=null){const rows=this.sessionIntents.filter(active),direct=rows.filter(x=>x.session_id&&x.session_id===session?.id).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0];if(direct)return clone(direct);const exact=rows.filter(x=>!x.session_id&&exactSessionMatch(x,session)).filter(x=>!x.week_id||!week?.id||x.week_id===week.id).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0];return clone(exact||null)}
    meetRefs(ids=[]){const wanted=new Set((ids||[]).map(text).filter(Boolean));return clone(this.meets.filter(active).filter(x=>wanted.has(text(x.id))))}
    squadIds(session){const refs=session?.identity?.squads||[];return refs.map(ref=>this.entities?.resolveSquad?this.entities.resolveSquad(ref)?.id||text(ref):text(ref)).filter(Boolean)}
    squadObjectivesFor(session,{asOfDate=''}={}){const d=date(asOfDate)||date(session?.identity?.date),ids=new Set(this.squadIds(session));return clone(this.squadObjectives.filter(active).filter(x=>!ids.size||ids.has(text(x.squad_id||x.squadId||x.squad))).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))))}
    athleteObjectivesFor(athleteRef,{asOfDate=''}={}){const aid=this.entities?.athleteId?this.entities.athleteId(athleteRef):text(athleteRef),d=date(asOfDate);if(!aid)return[];return clone(this.athleteObjectives.filter(active).filter(x=>text(x.athlete_id||x.athleteId)===aid).filter(x=>!d||inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))))}
    weeklyPlan({date:planDate='',weekId='',squadId=''}={}){const pseudo={id:'plan-query',identity:{date:date(planDate),squads:squadId?[squadId]:[]}},week=weekId?clone(this.weeks.find(x=>text(x.id)===text(weekId))||null):this.week(pseudo),intents=clone(this.sessionIntents.filter(active).filter(x=>!week?.id||!x.week_id||x.week_id===week.id).filter(x=>!squadId||!(x.squads||[]).length||(x.squads||[]).some(s=>text(s)===text(squadId)||this.entities?.resolveSquad?.(s)?.id===text(squadId))));return{status:week?'ok':'missing_week',week,intents,plannedExposure:clone(week?.planned_exposure||week?.plannedExposure||{}),squadObjectives:squadId?clone(this.squadObjectives.filter(active).filter(x=>text(x.squad_id||x.squadId)===text(squadId))):[]}}
    resolve(session){
      if(!session?.id||!session?.identity)throw new Error('Plan Context requires exact session identity');const season=this.season(session),phase=this.phase(session,season),cycle=this.cycle(session,phase),week=this.week(session,season,cycle),intent=this.intent(session,week);
      const meetIds=[...(intent?.target_meet_ids||intent?.targetMeetIds||[]),...(week?.target_meet_ids||week?.targetMeetIds||[]),...(cycle?.target_meet_ids||cycle?.targetMeetIds||[]),...(phase?.target_meet_ids||phase?.targetMeetIds||[]),...(season?.target_meet_ids||season?.targetMeetIds||[])];
      const context={schema:SCHEMA,version:VERSION,status:intent?'ok':'missing_session_intent',sessionId:session.id,sessionDate:date(session.identity.date),season,phase,cycle,week,intent,meets:this.meetRefs([...new Set(meetIds)]),squadObjectives:this.squadObjectivesFor(session),purpose:text(intent?.purpose||intent?.session_purpose),primaryStimulus:text(intent?.primary_stimulus||intent?.primaryStimulus),supportingStimuli:clone(intent?.supporting_stimuli||intent?.supportingStimuli||[]),technicalFocus:clone(intent?.technical_focus||intent?.technicalFocus||[]),athleteThreads:clone(intent?.athlete_threads||intent?.athleteThreads||[]),plannedExposure:clone(intent?.planned_exposure||intent?.plannedExposure||{}),source:{seasonId:season?.id||null,phaseId:phase?.id||null,cycleId:cycle?.id||null,weekId:week?.id||null,intentId:intent?.id||null}};
      if(!intent)context.message='No explicit session intent loaded; do not infer purpose from workout text';return context;
    }
  }
  const create=options=>new PlanContext(options);
  return{VERSION,SCHEMA,COLLECTIONS,create,PlanContext,MemoryStorage,date,squads,sameSquads,inRange,active,exactSessionMatch,initialState,normalizeState};
});
