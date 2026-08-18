'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSPoolsideActions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.1.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();

  class PoolsideActions{
    constructor({runtime,onChange=()=>{},present=null}={}){if(!runtime||typeof runtime.selectedSession!=='function')throw new Error('Poolside Actions require rebuild Runtime');this.runtime=runtime;this.onChange=onChange;this.present=present}
    emit(type,panel){const value={type,...panel};return typeof this.present==='function'?this.present(value):value}
    changed(result){this.onChange?.();return result}
    roll=({context,session,data}={})=>this.emit('roll',{context:clone(context),session:clone(session),eligible:clone(data?.eligible||[]),here:clone(data?.here||[]),summary:clone(data?.summary||null),mark:(athleteRef,status,opts={})=>this.changed({record:this.runtime.markAttendance(athleteRef,status,opts),roll:this.runtime.roll()}),clear:athleteRef=>this.changed({record:this.runtime.markAttendance(athleteRef,'not_marked',{source:'roll_clear'}),roll:this.runtime.roll()})})
    times=({context,session}={})=>{
      const athletes=typeof this.runtime.allAthletes==='function'?this.runtime.allAthletes():this.runtime.roll().eligible||[],timingSessions=typeof this.runtime.timingSessions==='function'?this.runtime.timingSessions({}):[];
      return this.emit('times',{context:clone(context),session:clone(session),athletes:clone(athletes),timingSessions:clone(timingSessions),
        t400:(athleteRef,opts={})=>this.runtime.t400Evidence(athleteRef,{course:session?.identity?.course||'',...opts}),
        pathway:(athleteRef,opts={})=>this.runtime.pathwayProfile(athleteRef,{course:session?.identity?.course||'',...opts}),target:(itemId,athleteRef)=>this.runtime.targetFor(itemId,athleteRef),
        startT400:typeof this.runtime.createT400Timing==='function'?(athleteRefs,opts={})=>this.runtime.createT400Timing(athleteRefs,{course:session?.identity?.course||'',...opts}):null,
        timing:typeof this.runtime.timingSession==='function'?id=>this.runtime.timingSession(id):null,
        startTiming:typeof this.runtime.startTiming==='function'?(id,opts={})=>this.runtime.startTiming(id,opts):null,
        split:typeof this.runtime.recordTimingSplit==='function'?(id,athleteRef,distance,elapsed,opts={})=>this.runtime.recordTimingSplit(id,athleteRef,distance,elapsed,opts):null,
        finishAthlete:typeof this.runtime.finishTimingAthlete==='function'?(id,athleteRef,elapsed,opts={})=>this.runtime.finishTimingAthlete(id,athleteRef,elapsed,opts):null,
        saveT400:typeof this.runtime.saveT400FromTiming==='function'?(id,athleteRef,opts={})=>this.changed(this.runtime.saveT400FromTiming(id,athleteRef,opts)):null,
        closeTiming:typeof this.runtime.closeTiming==='function'?(id,opts={})=>this.runtime.closeTiming(id,opts):null
      })
    }
    capture=({context,mode='choose',session,roll}={})=>this.emit('capture',{context:clone(context),mode,textMode:mode==='choose'?'note':mode,session:clone(session),roll:clone(roll),save:(spec={})=>{const type=text(spec.type||((mode==='choose')?'note':mode)).toLowerCase(),created=this.runtime.captureEvidence({...clone(spec),type,blockId:context?.blockId||null,itemId:context?.itemId||null});return this.changed(created)}})
    editSet=({context,session,block,item}={})=>this.emit('editSet',{context:clone(context),session:clone(session),block:clone(block),item:clone(item),save:(patch={},opts={})=>this.changed(this.runtime.editSession(item.id,patch,{note:text(opts.note)}))})
    editAthleteSet=({context,session,block,item,athlete}={})=>this.emit('editAthleteSet',{context:clone(context),session:clone(session),block:clone(block),item:clone(item),athlete:clone(athlete),current:clone(this.runtime.adaptationFor(item.id,athlete.id)),save:(prescription={},opts={})=>this.changed(this.runtime.setAdaptationOverride(item.id,athlete.id,prescription,{reason:text(opts.reason)||'Coach poolside override'})),clear:()=>this.changed(this.runtime.clearAdaptationOverride(item.id,athlete.id))})
    editBlock=({context,session,block}={})=>this.emit('editBlock',{context:clone(context),session:clone(session),block:clone(block),save:(patch={},opts={})=>this.changed(this.runtime.editBlock(block.id,patch,{note:text(opts.note)}))})
    evidence=({context,session,items}={})=>this.emit('evidence',{context:clone(context),session:clone(session),items:clone(items||[])})
    finish=({context,session}={})=>this.emit('finish',{context:clone(context),session:clone(session),confirm:(opts={})=>this.changed(this.runtime.finish(opts))})
    openers(){return{roll:this.roll,times:this.times,capture:this.capture,editSet:this.editSet,editAthleteSet:this.editAthleteSet,editBlock:this.editBlock,evidence:this.evidence,finish:this.finish}}
  }
  const create=options=>new PoolsideActions(options);
  return{VERSION,create,PoolsideActions};
});
