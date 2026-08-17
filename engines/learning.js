'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Learning=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  function evidenceRef(type,ids=[],fact=''){return{type,ids:[...new Set((ids||[]).filter(Boolean))],fact:text(fact)}}
  function finding({id,level='observation',message,evidence=[],question='',inference=false}={}){return{id,level,message:text(message),evidence:clone(evidence),question:text(question),inference:!!inference}}
  function countBy(rows,keyFn){const out={};for(const r of rows||[]){const k=keyFn(r);if(k)out[k]=(out[k]||0)+1}return out}

  class Learning{
    session(report){
      if(!report?.sessionId)throw new Error('Session learning requires a session report');const out=[];
      const alignment=text(report?.dose?.alignment?.status),sid=report.sessionId;
      if(alignment==='primary_missing')out.push(finding({id:`session-primary-missing-${sid}`,level:'attention',message:`The planned primary dose was not present in the classified delivered/session dose.`,evidence:[evidenceRef('session',[sid],`alignment=${alignment}`)],question:'Was the session changed intentionally, or is the plan/session link wrong?'}));
      if(alignment==='primary_not_dominant')out.push(finding({id:`session-primary-secondary-${sid}`,level:'review',message:`The planned primary dose was present but another classified dose was larger.`,evidence:[evidenceRef('session',[sid],`alignment=${alignment}`)],question:'Was that balance intentional for this session?'}));
      if(alignment==='insufficient_classification')out.push(finding({id:`session-classification-${sid}`,level:'unknown',message:'There is not enough classified quality work to judge plan alignment without guessing from support/recovery metres.',evidence:[evidenceRef('session',[sid],'classifiedQualityDistance=0')],question:'Does Session Truth need more explicit stimulus metadata for this workout?'}));
      const completion=num(report?.delivery?.completion);if(completion!==null&&completion<.85)out.push(finding({id:`session-completion-${sid}`,level:'review',message:`The session delivered ${Math.round(completion*100)}% of the current planned distance.`,evidence:[evidenceRef('delivery',[sid],`${report.delivery.deliveredDistance}/${report.delivery.currentDistance}m`)],question:'Was the early finish planned, time-driven, or a coaching response?'}));
      const edits=num(report?.lifecycle?.byType?.edit)||0;if(edits>=3)out.push(finding({id:`session-edits-${sid}`,level:'observation',message:`The session needed ${edits} live edits.`,evidence:[evidenceRef('lifecycle',[sid],`${edits} edit transactions`)],question:'Is there a repeatable planning assumption here worth changing before the next similar session?'}));
      return out;
    }
    period(periodReport,sessionReports=[]){
      const rows=(sessionReports||[]).filter(Boolean),ids=rows.map(x=>x.sessionId),out=[];
      const align=countBy(rows,r=>text(r?.dose?.alignment?.status));
      if((align.primary_not_dominant||0)>=2)out.push(finding({id:'period-primary-not-dominant',level:'pattern',message:`The planned primary dose was not the largest classified dose in ${align.primary_not_dominant} sessions.`,evidence:[evidenceRef('sessions',rows.filter(r=>text(r?.dose?.alignment?.status)==='primary_not_dominant').map(r=>r.sessionId),'primary_not_dominant')],question:'Is the weekly plan asking for a different emphasis than the sessions are actually delivering?'}));
      if((align.primary_missing||0)>=2)out.push(finding({id:'period-primary-missing',level:'attention',message:`The planned primary dose was missing from ${align.primary_missing} sessions.`,evidence:[evidenceRef('sessions',rows.filter(r=>text(r?.dose?.alignment?.status)==='primary_missing').map(r=>r.sessionId),'primary_missing')],question:'Check whether plan links, session classification or delivered content are wrong before drawing a coaching conclusion.'}));
      const editCounts=rows.map(r=>({id:r.sessionId,count:num(r?.lifecycle?.byType?.edit)||0})),heavilyEdited=editCounts.filter(x=>x.count>=3);if(heavilyEdited.length>=2)out.push(finding({id:'period-live-edit-pattern',level:'pattern',message:`${heavilyEdited.length} sessions required at least three live edits.`,evidence:[evidenceRef('lifecycle',heavilyEdited.map(x=>x.id),heavilyEdited.map(x=>`${x.id}:${x.count}`).join(', '))],question:'Are the same session-design assumptions repeatedly being corrected on deck?'}));
      const attendanceRate=num(periodReport?.attendance?.rate);if(attendanceRate!==null&&attendanceRate<.7)out.push(finding({id:'period-attendance-exposure',level:'context',message:`Recorded attendance across the period is ${Math.round(attendanceRate*100)}%.`,evidence:[evidenceRef('attendance',ids,`${periodReport.attendance.here}/${periodReport.attendance.eligible}`)],question:'When reviewing squad response, separate programme effect from uneven exposure.'}));
      return out;
    }
    athlete(athleteReport,{recentSessionReports=[]}={}){
      if(!athleteReport?.athlete?.id)throw new Error('Athlete learning requires an athlete report');const id=athleteReport.athlete.id,out=[];
      const rate=num(athleteReport?.attendance?.rate);if(rate!==null&&rate<.7)out.push(finding({id:`athlete-exposure-${id}`,level:'context',message:`Recorded session exposure is ${Math.round(rate*100)}% across the supplied attendance window.`,evidence:[evidenceRef('attendance',[id],`${athleteReport.attendance.here}/${athleteReport.attendance.marked}`)],question:'Could limited exposure be contributing to the performance pattern?',inference:true}));
      const pathway=athleteReport.pathway;if(pathway?.status==='classification_needed')out.push(finding({id:`athlete-classification-${id}`,level:'attention',message:'Pathway comparison is blocked because the swimmer classification evidence is incomplete.',evidence:[evidenceRef('pathway',[id],'classification_needed')],question:'Load the correct S/SB/SM classification before comparing standards.'}));
      if(pathway?.status==='ok'&&pathway?.closest?.nextNational){const ev=pathway.closest,gap=ev.nextNational.gap;out.push(finding({id:`athlete-closest-${id}`,level:'opportunity',message:`Closest loaded national pathway gap is ${gap.seconds.toFixed(2)}s (${gap.percentage.toFixed(2)}%) in ${ev.pb.distance} ${ev.pb.stroke}.`,evidence:[evidenceRef('pathway',[id],`${ev.pb.course} ${ev.pb.distance} ${ev.pb.stroke}`)],question:'Does current training emphasis support this opportunity?'}))}
      // Exposure-to-dose is contextual, never causal: only surface what sessions containing
      // the athlete were supplied, and word any performance link as a question/inference.
      const supplied=(recentSessionReports||[]).filter(Boolean);if(supplied.length){const dose={};for(const r of supplied)for(const [k,v] of Object.entries(r?.dose?.dose||{}))dose[k]=(dose[k]||0)+(num(v)||0);const ranked=Object.entries(dose).sort((a,b)=>b[1]-a[1]);if(ranked.length)out.push(finding({id:`athlete-dose-context-${id}`,level:'context',message:`Across the supplied recent sessions, the largest recorded classified dose is ${ranked[0][0]} (${Math.round(ranked[0][1])}m).`,evidence:[evidenceRef('sessions',supplied.map(x=>x.sessionId),`${ranked[0][0]}=${ranked[0][1]}m`)],question:'Use this as exposure context only; it does not prove why the swimmer is improving or struggling.',inference:true}))}
      return out;
    }
    coach(coachReport,sessionReports=[]){
      if(!coachReport)throw new Error('Coach learning requires coach report');const rows=(sessionReports||[]).filter(Boolean),out=this.period(coachReport.period||{},rows),edits=num(coachReport?.lifecycleActions?.edit)||0,sessions=num(coachReport.sessions)||rows.length;
      if(sessions>=3&&edits/sessions>=2)out.push(finding({id:'coach-edit-rate',level:'pattern',message:`Live session edits average ${(edits/sessions).toFixed(1)} per supplied session.`,evidence:[evidenceRef('coach',rows.map(x=>x.sessionId),`${edits} edits / ${sessions} sessions`)],question:'Which recurring edits should become upstream planning defaults, and which are desirable responsive coaching?'}));
      return out;
    }
  }
  const create=()=>new Learning();
  return{VERSION,create,Learning,evidenceRef,finding,countBy};
});
