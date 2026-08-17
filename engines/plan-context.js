'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.PlanContext=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lower=v=>text(v).toLowerCase();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  function squads(v){return[...(v||[])].map(lower).filter(Boolean).sort()}
  function sameSquads(a,b){const x=squads(a),y=squads(b);return x.length===y.length&&x.every((v,i)=>v===y[i])}
  function inRange(d,start,end){if(!d)return false;return(!start||d>=start)&&(!end||d<=end)}
  function active(row){return row?.active!==false&&!['inactive','archived','superseded','draft'].includes(lower(row?.status||row?.version_status))}
  function exactSessionMatch(row,session){if(row?.session_id&&row.session_id===session?.id)return true;const id=session?.identity||{};return !!(date(row?.date)&&date(row.date)===date(id.date)&&(!row.dayPart||lower(row.dayPart)===lower(id.dayPart))&&(!(row.squads||[]).length||sameSquads(row.squads,id.squads||[]))&&(!row.start||text(row.start)===text(id.start))&&(!row.venue||lower(row.venue)===lower(id.venue)))}

  class PlanContext{
    constructor({seasons=[],phases=[],weeks=[],sessionIntents=[],meets=[]}={}){this.seasons=clone(seasons||[]);this.phases=clone(phases||[]);this.weeks=clone(weeks||[]);this.sessionIntents=clone(sessionIntents||[]);this.meets=clone(meets||[])}
    season(session){const d=date(session?.identity?.date);return clone(this.seasons.filter(active).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0]||null)}
    phase(session,season=null){const d=date(session?.identity?.date),sid=season?.id||this.season(session)?.id;return clone(this.phases.filter(active).filter(x=>!x.season_id||!sid||x.season_id===sid).filter(x=>inRange(d,date(x.start_date||x.start),date(x.end_date||x.end))).sort((a,b)=>(Number(a.order)||999)-(Number(b.order)||999))[0]||null)}
    week(session,season=null){const d=date(session?.identity?.date),sid=season?.id||this.season(session)?.id;return clone(this.weeks.filter(active).filter(x=>!x.season_id||!sid||x.season_id===sid).filter(x=>inRange(d,date(x.start_date||x.week_start||x.start),date(x.end_date||x.week_end||x.end))).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0]||null)}
    intent(session,week=null){
      const rows=this.sessionIntents.filter(active),direct=rows.filter(x=>x.session_id&&x.session_id===session?.id).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0];if(direct)return clone(direct);
      const exact=rows.filter(x=>!x.session_id&&exactSessionMatch(x,session)).filter(x=>!x.week_id||!week?.id||x.week_id===week.id).sort((a,b)=>text(b.updated_at||b.updatedAt).localeCompare(text(a.updated_at||a.updatedAt)))[0];return clone(exact||null);
    }
    meetRefs(ids=[]){const wanted=new Set((ids||[]).map(text).filter(Boolean));return clone(this.meets.filter(active).filter(x=>wanted.has(text(x.id))))}
    resolve(session){
      if(!session?.id||!session?.identity)throw new Error('Plan Context requires exact session identity');const season=this.season(session),phase=this.phase(session,season),week=this.week(session,season),intent=this.intent(session,week);
      const meetIds=[...(intent?.target_meet_ids||intent?.targetMeetIds||[]),...(week?.target_meet_ids||week?.targetMeetIds||[]),...(phase?.target_meet_ids||phase?.targetMeetIds||[]),...(season?.target_meet_ids||season?.targetMeetIds||[])];
      const context={status:intent?'ok':'missing_session_intent',sessionId:session.id,sessionDate:date(session.identity.date),season,phase,week,intent,meets:this.meetRefs([...new Set(meetIds)]),purpose:text(intent?.purpose||intent?.session_purpose),primaryStimulus:text(intent?.primary_stimulus||intent?.primaryStimulus),supportingStimuli:clone(intent?.supporting_stimuli||intent?.supportingStimuli||[]),technicalFocus:clone(intent?.technical_focus||intent?.technicalFocus||[]),athleteThreads:clone(intent?.athlete_threads||intent?.athleteThreads||[]),source:{seasonId:season?.id||null,phaseId:phase?.id||null,weekId:week?.id||null,intentId:intent?.id||null}};
      if(!intent)context.message='No explicit session intent loaded; do not infer purpose from workout text';return context;
    }
  }
  const create=options=>new PlanContext(options);
  return{VERSION,create,PlanContext,date,squads,sameSquads,inRange,active,exactSessionMatch};
});
