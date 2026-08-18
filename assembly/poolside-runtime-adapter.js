'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyPoolsideRuntime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  class PoolsideRuntimeAdapter{
    constructor({app}={}){if(!app||typeof app.selectedSession!=='function'||typeof app.boardForSession!=='function')throw new Error('Poolside Runtime Adapter requires unified App Composition');this.app=app}
    selectedRecord(){return this.app.selectedSession()}
    selectedSession(){return clone(this.selectedRecord()?.current||null)}
    selectedId(){return text(this.selectedRecord()?.id)}
    requireSelected(){const id=this.selectedId();if(!id)throw new Error('No selected session');return id}
    roll(){const id=this.selectedId();if(!id)return{session:null,eligible:[],here:[],summary:null};const data=this.app.rollForSession(id);return{session:this.selectedSession(),eligible:clone(data.eligible||[]),here:clone(data.here||[]),summary:clone(data.summary||null)}}
    allAthletes(){return clone(this.app.measurementAthletes())}
    markAttendance(athleteRef,status,opts={}){const id=this.requireSelected();return text(status)==='not_marked'?this.app.clearAttendance(id,athleteRef):this.app.markAttendance(id,athleteRef,status,opts)}
    clearAttendance(athleteRef){return this.app.clearAttendance(this.requireSelected(),athleteRef)}
    t400Evidence(athleteRef,opts={}){return this.app.t400Evidence(this.requireSelected(),athleteRef,opts)}
    pathwayProfile(athleteRef,opts={}){return this.app.pathway(athleteRef,opts)}
    targetFor(itemId,athleteRef){return this.app.targetFor(this.requireSelected(),itemId,athleteRef)}
    adaptationFor(itemId,athleteRef){const answer=this.app.adaptationFor(this.requireSelected(),itemId,athleteRef);return answer?{...clone(answer),work:clone(answer.prescription||answer.work||null)}:answer}
    setAdaptationOverride(itemId,athleteRef,prescription,opts={}){return this.app.setAdaptationForItem(this.requireSelected(),itemId,athleteRef,prescription,opts)}
    clearAdaptationOverride(itemId,athleteRef){return this.app.clearAdaptationForItem(this.requireSelected(),itemId,athleteRef)}
    editSession(itemId,patch,opts={}){return this.app.editSet(this.requireSelected(),itemId,patch,opts)}
    editBlock(blockId,patch,opts={}){return this.app.editBlock(this.requireSelected(),blockId,patch,opts)}
    captureEvidence(spec={}){return this.app.capture(this.requireSelected(),spec)}
    evidenceAt(context={}){const id=this.requireSelected();if(context.sessionId&&text(context.sessionId)!==id)throw new Error('Evidence context session mismatch');return this.app.evidenceAt(id,context)}
    timingSessions(query={}){const sid=this.requireSelected();return clone(this.app.timingSessions(query).filter(x=>text(x?.context?.training_session_id)===sid))}
    timingSession(id){const row=this.app.timingSession(id);if(row&&text(row?.context?.training_session_id)!==this.requireSelected())throw new Error('Timing session belongs to a different training session');return clone(row)}
    testResults(query={}){return clone(this.app.testResults(query))}
    createT400Timing(athleteRefs=[],opts={}){const selected=this.selectedSession(),sid=this.requireSelected(),requirements=this.app.testProtocolRequirements('t400_freestyle');if(requirements.status!=='ok')throw new Error(requirements.message||'T400 protocol unavailable');const course=text(opts.course||selected?.identity?.course).toUpperCase(),poolLength=Number(opts.poolLength||requirements.poolLengthsByCourse?.[course]||0)||null,refs=[...new Set((athleteRefs||[]).map(text).filter(Boolean))];if(!refs.length)throw new Error('Choose at least one swimmer for T400');const timing=this.app.createTimingSession({context:{training_session_id:sid,test_protocol_id:requirements.protocol.id},course,poolLength,label:'T400 Freestyle',coachId:text(opts.coachId),source:'deck_timer'});refs.forEach((ref,index)=>this.app.assignTimingAthlete(timing.id,ref,{lane:opts.lanes?.[ref]??null,position:index+1}));return this.app.timingSession(timing.id)}
    assignTimingAthlete(timingId,athleteRef,opts={}){this.timingSession(timingId);return this.app.assignTimingAthlete(timingId,athleteRef,opts)}
    unassignTimingAthlete(timingId,athleteRef,opts={}){this.timingSession(timingId);return this.app.unassignTimingAthlete(timingId,athleteRef,opts)}
    startTiming(timingId,opts={}){this.timingSession(timingId);return this.app.startTiming(timingId,opts)}
    recordTimingSplit(timingId,athleteRef,distance,elapsedSeconds,opts={}){this.timingSession(timingId);return this.app.recordTimingSplit(timingId,athleteRef,{distance,elapsedSeconds,...opts})}
    finishTimingAthlete(timingId,athleteRef,elapsedSeconds,opts={}){this.timingSession(timingId);return this.app.finishTimingAthlete(timingId,athleteRef,{distance:400,elapsedSeconds,...opts})}
    saveT400FromTiming(timingId,athleteRef,opts={}){this.timingSession(timingId);return this.app.captureAndPublishTimingTest(timingId,athleteRef,'t400_freestyle',opts)}
    closeTiming(timingId,opts={}){this.timingSession(timingId);return this.app.closeTiming(timingId,opts)}
    finish(opts={}){return this.app.finishSession(this.requireSelected(),opts)}
    delivery(){const id=this.selectedId();return id?this.app.deliveryForSession(id):null}
    boardModel(){const id=this.selectedId();return id?this.app.boardForSession(id):null}
  }
  const create=options=>new PoolsideRuntimeAdapter(options);
  return{VERSION,create,PoolsideRuntimeAdapter};
});
