'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.PerformanceProjection=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const REQUIRED={entities:['resolveAthlete'],pathway:['profile','eventAnswer'],standards:['statusForResult','classificationStatus'],publication:['operationalMeetResults','provisional'],raceModel:['target','compare']};
  function contract(name,obj,methods){if(!obj||methods.some(k=>typeof obj[k]!=='function'))throw new Error(`Performance Projection requires ${name} contract`)}
  function resultEvent(row){return{course:row.pool_course||row.course,distance:row.distance??row.distance_m,stroke:row.stroke}}
  function resultSeconds(row){return num(row.result_seconds??row.resultSeconds??row.time_seconds)}
  function eligibleSignal(row){const s=text(row.result_status||row.status||'finished').toLowerCase();return !['dq','dns','dnf','scratched','rejected'].includes(s)&&resultSeconds(row)!==null}
  class PerformanceProjection{
    constructor(deps={}){for(const [name,methods] of Object.entries(REQUIRED))contract(name,deps[name],methods);Object.assign(this,deps)}
    provisionalMeetSignals(athleteRef,{meetId='',asOfDate=''}={}){
      const athlete=this.entities.resolveAthlete(athleteRef);if(!athlete)return{status:'missing_athlete',athlete:null,signals:[]};const rows=this.publication.operationalMeetResults({athleteRef,meetId}).filter(x=>x.permanent_eligible===false&&eligibleSignal(x)),signals=[];
      for(const row of rows){const event=resultEvent(row),sec=resultSeconds(row),standards=this.standards.statusForResult(athlete,event,sec,{asOfDate:asOfDate||row.result_date||row.date||''});signals.push({status:'provisional',result_id:text(row.id),meet_id:text(row.meet_id||row.meetId),race_id:text(row.race_id||row.raceId),athlete_id:athlete.id,event:clone(event),result_seconds:sec,source_type:text(row.source_type||row.sourceType),publication_status:text(row.publication_status),achieved:(standards.achieved||[]).map(x=>({id:x.id,label:x.label,kind:x.standard_kind,seconds:x.standard_seconds,points:clone(x.points)})),next:standards.next?{id:standards.next.id,label:standards.next.label,kind:standards.next.standard_kind,seconds:standards.next.standard_seconds,gap:clone(standards.next.gap)}:null,national_qualifying:(standards.nationalQualifying||[]).filter(x=>x.gap?.achieved).map(x=>({id:x.id,label:x.label,seconds:x.standard_seconds})),records:(standards.records||[]).filter(x=>x.gap?.achieved).map(x=>({id:x.id,label:x.label,seconds:x.standard_seconds}))})}
      return{status:'ok',athlete:clone(athlete),signals};
    }
    athlete(athleteRef,{course='',meetId='',asOfDate=''}={}){const athlete=this.entities.resolveAthlete(athleteRef);if(!athlete)return{status:'missing_athlete',athlete:null,verified_pathway:null,provisional_meet:{status:'missing_athlete',signals:[]}};return{status:'ok',athlete:clone(athlete),verified_pathway:this.pathway.profile(athlete.id,{course,asOfDate}),provisional_meet:this.provisionalMeetSignals(athlete.id,{meetId,asOfDate})}}
    raceTarget(athleteRef,{course,distance,stroke,targetSeconds,modelId=''}={}){const athlete=this.entities.resolveAthlete(athleteRef);if(!athlete)return{status:'missing_athlete',athlete:null,target:null};const target=this.raceModel.target({course,distance,stroke,targetSeconds,modelId});return{status:target.status,athlete:clone(athlete),target}}
    compareRace(athleteRef,targetSpec={},actualSplits=[]){const t=this.raceTarget(athleteRef,targetSpec);if(t.status!=='ok')return{...t,comparison:null};return{...t,comparison:this.raceModel.compare(actualSplits,t.target)}}
    meetBoard(athleteRefs=[],opts={}){return(athleteRefs||[]).map(ref=>this.athlete(ref,opts)).filter(x=>x.status==='ok')}
  }
  const create=deps=>new PerformanceProjection(deps);
  return{VERSION,REQUIRED,create,PerformanceProjection,resultEvent,resultSeconds,eligibleSignal};
});
