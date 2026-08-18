'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyPoolsideRuntime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  class PoolsideRuntimeAdapter{
    constructor({app}={}){if(!app||typeof app.selectedSession!=='function'||typeof app.boardForSession!=='function')throw new Error('Poolside Runtime Adapter requires unified App Composition');this.app=app}
    selectedRecord(){return this.app.selectedSession()}
    selectedSession(){return clone(this.selectedRecord()?.current||null)}
    selectedId(){return text(this.selectedRecord()?.id)}
    requireSelected(){const id=this.selectedId();if(!id)throw new Error('No selected session');return id}
    roll(){const id=this.selectedId();if(!id)return{session:null,eligible:[],here:[],summary:null};const data=this.app.rollForSession(id);return{session:this.selectedSession(),eligible:clone(data.eligible||[]),here:clone(data.here||[]),summary:clone(data.summary||null)}}
    markAttendance(athleteRef,status,opts={}){const id=this.requireSelected();return text(status)==='not_marked'?this.app.clearAttendance(id,athleteRef):this.app.markAttendance(id,athleteRef,status,opts)}
    clearAttendance(athleteRef){return this.app.clearAttendance(this.requireSelected(),athleteRef)}
    t400Evidence(athleteRef,opts={}){return this.app.t400Evidence(this.requireSelected(),athleteRef,opts)}
    pathwayProfile(athleteRef,opts={}){return this.app.pathway(athleteRef,opts)}
    targetFor(itemId,athleteRef){return this.app.targetFor(this.requireSelected(),itemId,athleteRef)}
    adaptationFor(itemId,athleteRef){return this.app.adaptationFor(this.requireSelected(),itemId,athleteRef)}
    setAdaptationOverride(itemId,athleteRef,prescription,opts={}){return this.app.setAdaptationForItem(this.requireSelected(),itemId,athleteRef,prescription,opts)}
    clearAdaptationOverride(itemId,athleteRef){return this.app.clearAdaptationForItem(this.requireSelected(),itemId,athleteRef)}
    editSession(itemId,patch,opts={}){return this.app.editSet(this.requireSelected(),itemId,patch,opts)}
    editBlock(blockId,patch,opts={}){return this.app.editBlock(this.requireSelected(),blockId,patch,opts)}
    captureEvidence(spec={}){return this.app.capture(this.requireSelected(),spec)}
    evidenceAt(context={}){const id=this.requireSelected();if(context.sessionId&&text(context.sessionId)!==id)throw new Error('Evidence context session mismatch');return this.app.evidenceAt(id,context)}
    finish(opts={}){return this.app.finishSession(this.requireSelected(),opts)}
    delivery(){const id=this.selectedId();return id?this.app.deliveryForSession(id):null}
    boardModel(){const id=this.selectedId();return id?this.app.boardForSession(id):null}
  }
  const create=options=>new PoolsideRuntimeAdapter(options);
  return{VERSION,create,PoolsideRuntimeAdapter};
});
