'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.ResultsPathway=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.2.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const seconds=row=>{for(const k of ['pb_seconds','result_seconds','result_time_seconds','best_time_seconds']){const n=num(row?.[k]);if(n!==null&&n>0)return n}return null};
  const REQUIRED_RULES=['normalizeCourse','normalizeStroke','normalizeEvent','isParaAthlete','paraClassification','matches','forEvent','baseTime','points','pointSteps','statusForResult','milestones'];

  class Pathway{
    constructor({evidence,standardsEngine}={}){
      if(!evidence||typeof evidence.resolveAthlete!=='function'||typeof evidence.results!=='function')throw new Error('ResultsPathway requires Evidence Retrieval');
      if(!standardsEngine||REQUIRED_RULES.some(k=>typeof standardsEngine[k]!=='function'))throw new Error('ResultsPathway requires complete Standards Records contract');
      this.evidence=evidence;this.rules=standardsEngine;
    }
    athlete(ref){return this.evidence.resolveAthlete(ref)}
    pbRows(athleteRef,{course:courseWanted=''}={}){
      const ath=this.athlete(athleteRef);if(!ath)return[];const wanted=this.rules.normalizeCourse(courseWanted),rows=this.evidence.results(ath.id,{}).filter(x=>x.excluded_from_pb!==true),best=new Map();
      for(const raw of rows){const e=this.rules.normalizeEvent(raw),sec=seconds(raw);if(!e.course||e.course==='BOTH'||!e.distance||!e.stroke||sec===null)continue;if(wanted&&e.course!==wanted)continue;const k=`${e.course}|${e.distance}|${e.stroke}`,row={...clone(raw),...e,result_seconds:sec};if(!best.has(k)||sec<best.get(k).result_seconds)best.set(k,row)}
      return[...best.values()].sort((a,b)=>a.course.localeCompare(b.course)||a.distance-b.distance||a.stroke.localeCompare(b.stroke));
    }
    standardMatches(row,ath,pb,{asOfDate=''}={}){return this.rules.matches(row,ath,pb,{asOfDate})}
    standardsFor(ath,pb,opts={}){return this.rules.forEvent(ath,pb,opts).map(r=>({...clone(r),_seconds:r.standard_seconds,_kind:r.standard_kind,_label:r.label}))}
    baseTime(ath,pb){return this.rules.baseTime(ath,pb)}
    points(ath,pb){const p=this.rules.points(ath,pb,pb);return p?.source==='explicit result points'?{...p,source:'result'}:p}
    pointSteps(ath,pb,count=2){return this.rules.pointSteps(ath,pb,pb,count).map(x=>({points:x.points,seconds:x.seconds}))}
    trend(ath,pb){
      const rows=this.evidence.results(ath.id,{distance:pb.distance,stroke:pb.stroke,course:pb.course}).filter(r=>seconds(r)!==null).sort((a,b)=>text(a.result_date||a.date).localeCompare(text(b.result_date||b.date)));
      if(!rows.length)return{count:0,first:null,latest:null,pb:pb.result_seconds,improvementToPb:null,latestVsPb:null};const first=seconds(rows[0]),latest=seconds(rows.at(-1));return{count:rows.length,first,latest,pb:pb.result_seconds,improvementToPb:first-pb.result_seconds,latestVsPb:latest-pb.result_seconds,firstDate:text(rows[0].result_date||rows[0].date),latestDate:text(rows.at(-1).result_date||rows.at(-1).date)};
    }
    event(ath,pb,opts={}){
      const status=this.rules.statusForResult(ath,pb,pb.result_seconds,opts),standards=this.standardsFor(ath,pb,opts),byId=new Map(standards.map(x=>[text(x.id),x]));
      const compat=row=>{if(!row)return null;const c=byId.get(text(row.id));return c?clone(c):{...clone(row),_seconds:row.standard_seconds,_kind:row.standard_kind,_label:row.label}};
      const next=status.nextNational?compat(status.nextNational):null,qualifying=(status.qualifying||[]).map(compat),qualifyingIds=new Set(qualifying.map(x=>text(x.id))),deeper=standards.filter(x=>!qualifyingIds.has(text(x.id))),achievedNational=(status.achievedNational||[]).map(x=>({...compat(x),gap:clone(x.gap)}));
      return{pb:clone(pb),points:this.points(ath,pb),pointSteps:this.pointSteps(ath,pb),trend:this.trend(ath,pb),nextNational:next?{row:next,gap:clone(status.nextNational.gap)}:null,qualifying,deeper,achievedNational,milestones:this.rules.milestones(ath,pb,pb,opts)};
    }
    profile(athleteRef,{course:courseWanted='',asOfDate=''}={}){
      const ath=this.athlete(athleteRef),wanted=this.rules.normalizeCourse(courseWanted);if(!ath)return{status:'missing_athlete',athlete:null,course:wanted,pbs:[],events:[],closest:null,furthest:null,classificationNeeded:false};
      if(this.rules.isParaAthlete(ath)&&!this.rules.paraClassification(ath,'Freestyle')&&!this.rules.paraClassification(ath,'Breaststroke')&&!this.rules.paraClassification(ath,'IM'))return{status:'classification_needed',athlete:clone(ath),course:wanted,classificationNeeded:true,pbs:[],events:[],closest:null,furthest:null};
      const pbs=this.pbRows(ath.id,{course:wanted}),events=pbs.map(pb=>this.event(ath,pb,{asOfDate})),withNext=events.filter(x=>x.nextNational),closest=withNext.slice().sort((a,b)=>a.nextNational.gap.percentage-b.nextNational.gap.percentage)[0]||null,furthest=withNext.slice().sort((a,b)=>b.nextNational.gap.percentage-a.nextNational.gap.percentage)[0]||null;
      return{status:'ok',athlete:clone(ath),course:wanted,classificationNeeded:false,pbs,events,closest,furthest,summary:{pbEvents:pbs.length,matchedNationalTargets:withNext.length,closestEvent:closest?`${closest.pb.course} ${closest.pb.distance} ${closest.pb.stroke}`:null,furthestEvent:furthest?`${furthest.pb.course} ${furthest.pb.distance} ${furthest.pb.stroke}`:null}};
    }
    eventAnswer(athleteRef,{course:poolCourse,distance:eventDistance,stroke:eventStroke,asOfDate=''}={}){const p=this.profile(athleteRef,{course:poolCourse,asOfDate});if(p.status!=='ok')return{status:p.status,event:null};const wantedStroke=this.rules.normalizeStroke(eventStroke),ev=p.events.find(x=>x.pb.distance===num(eventDistance)&&x.pb.stroke===wantedStroke);return ev?{status:'ok',event:ev}:{status:'missing_event',event:null}}
  }
  const create=options=>new Pathway(options);
  return{VERSION,REQUIRED_RULES,create,Pathway};
});
