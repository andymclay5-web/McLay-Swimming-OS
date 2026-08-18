'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Reporting=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const pct=(a,b)=>b>0?a/b:null;
  function captureSummary(captures=[]){
    const byType={},byAthlete={};for(const c of captures||[]){if(c?.status&&c.status!=='active')continue;const t=text(c.type)||'unknown';byType[t]=(byType[t]||0)+1;for(const id of c.athlete_ids||[])byAthlete[id]=(byAthlete[id]||0)+1}
    return{total:Object.values(byType).reduce((n,x)=>n+x,0),byType,byAthlete};
  }
  function journalSummary(journal=[]){const byType={};for(const j of journal||[]){const t=text(j.type||j.action)||'unknown';byType[t]=(byType[t]||0)+1}return{total:(journal||[]).length,byType}}
  function attendanceFact(summary=null){if(!summary)return{status:'not_loaded',here:null,eligible:null,counts:{}};return{status:'ok',here:num(summary.here)||0,eligible:num(summary.eligible)||0,counts:clone(summary.counts||{}),attendanceRate:summary.eligible>0?pct(summary.here,summary.eligible):null}}

  class Reporting{
    session({session,lifecycleRecord=null,delivery=null,dose=null,planContext=null,attendanceSummary=null,captures=[]}={}){
      if(!session?.id)throw new Error('Session report requires canonical session');
      const planned=num(delivery?.planned_distance)??num(dose?.totalDistance)??0,current=num(delivery?.current_distance)??num(dose?.totalDistance)??planned,delivered=num(delivery?.delivered_distance),remaining=num(delivery?.remaining_distance),deliveryStatus=delivery?'finished':'not_finished',capture=captureSummary(captures),journal=journalSummary(lifecycleRecord?.journal||[]);
      return{schema:'msos.report.session.v1',engineVersion:VERSION,sessionId:session.id,identity:clone(session.identity||{}),delivery:{status:deliveryStatus,plannedDistance:planned,currentDistance:current,deliveredDistance:delivered,remainingDistance:remaining,completion:delivered!==null&&current>0?pct(delivered,current):null,finishPoint:clone(delivery?.finish_point||null)},plan:{status:planContext?.status||'not_loaded',purpose:text(planContext?.purpose),primaryStimulus:text(planContext?.primaryStimulus),supportingStimuli:clone(planContext?.supportingStimuli||[]),technicalFocus:clone(planContext?.technicalFocus||[]),source:clone(planContext?.source||null)},dose:dose?{status:'ok',scope:text(dose.scope),classifiedQualityDistance:num(dose.classifiedQualityDistance)||0,supportOrUnclassifiedDistance:num(dose.supportOrUnclassifiedDistance)||0,classifiedShare:num(dose.classifiedShare),dose:clone(dose.dose||{}),rankedDose:clone(dose.rankedDose||[]),alignment:clone(dose.alignment||null),feedback:clone(dose.feedback||[])}:{status:'not_loaded'},attendance:attendanceFact(attendanceSummary),captures:capture,lifecycle:journal};
    }
    period(reports=[]){
      const rows=(reports||[]).filter(Boolean).map(clone),dose={},captures={},alignment={},attendance={here:0,eligible:0};let planned=0,current=0,delivered=0,finished=0;
      for(const r of rows){planned+=num(r?.delivery?.plannedDistance)||0;current+=num(r?.delivery?.currentDistance)||0;if(num(r?.delivery?.deliveredDistance)!==null)delivered+=num(r.delivery.deliveredDistance)||0;if(r?.delivery?.status==='finished')finished++;for(const [k,v] of Object.entries(r?.dose?.dose||{}))dose[k]=(dose[k]||0)+(num(v)||0);for(const [k,v] of Object.entries(r?.captures?.byType||{}))captures[k]=(captures[k]||0)+(num(v)||0);const as=text(r?.dose?.alignment?.status)||'not_assessed';alignment[as]=(alignment[as]||0)+1;if(r?.attendance?.status==='ok'){attendance.here+=num(r.attendance.here)||0;attendance.eligible+=num(r.attendance.eligible)||0}}
      return{schema:'msos.report.period.v1',engineVersion:VERSION,sessions:rows.length,finishedSessions:finished,plannedDistance:planned,currentDistance:current,deliveredDistance:delivered,completion:current>0?delivered/current:null,dose,rankedDose:Object.entries(dose).map(([key,metres])=>({key,metres})).sort((a,b)=>b.metres-a.metres||a.key.localeCompare(b.key)),capturesByType:captures,alignmentCounts:alignment,attendance:{...attendance,rate:attendance.eligible>0?attendance.here/attendance.eligible:null},sessionIds:rows.map(x=>x.sessionId)};
    }
    athlete({athlete,pathway=null,attendanceRows=[],captures=[],sessionReports=[]}={}){
      if(!athlete?.id)throw new Error('Athlete report requires athlete identity');const attendance=(attendanceRows||[]).filter(r=>r.athlete_id===athlete.id),here=attendance.filter(r=>['present','modified','late'].includes(text(r.status).toLowerCase())).length,cap=captureSummary((captures||[]).filter(c=>(c.athlete_ids||[]).includes(athlete.id))),sessions=(sessionReports||[]).filter(Boolean);
      return{schema:'msos.report.athlete.v1',engineVersion:VERSION,athlete:clone(athlete),attendance:{marked:attendance.length,here,rate:attendance.length?here/attendance.length:null,byStatus:attendance.reduce((m,r)=>{const k=text(r.status)||'unknown';m[k]=(m[k]||0)+1;return m},{})},captures:cap,pathway:clone(pathway||null),sessionCount:sessions.length,sessionIds:sessions.map(x=>x.sessionId)};
    }
    coach({coachId='',sessionReports=[]}={}){
      const rows=(sessionReports||[]).filter(Boolean),period=this.period(rows),lifecycle={},captures={};for(const r of rows){for(const [k,v] of Object.entries(r?.lifecycle?.byType||{}))lifecycle[k]=(lifecycle[k]||0)+(num(v)||0);for(const [k,v] of Object.entries(r?.captures?.byType||{}))captures[k]=(captures[k]||0)+(num(v)||0)}
      return{schema:'msos.report.coach.v1',engineVersion:VERSION,coachId:text(coachId),sessions:rows.length,period,lifecycleActions:lifecycle,capturesByType:captures};
    }
  }
  const create=()=>new Reporting();
  return{VERSION,create,Reporting,captureSummary,journalSummary,attendanceFact};
});
