'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.BoardProjection=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  function names(ath){const parts=text(ath?.full_name).split(/\s+/).filter(Boolean);return{parts,first:parts[0]||'',last:parts.at(-1)||'',initials:parts.map(x=>x[0]).join('').toUpperCase()}}
  function identifiers(athletes=[]){
    const out=new Map(),byInitial=new Map();
    for(const a of athletes){const n=names(a),k=n.initials||text(a.id).slice(0,3).toUpperCase();if(!byInitial.has(k))byInitial.set(k,[]);byInitial.get(k).push(a)}
    for(const [initial,list] of byInitial){if(list.length===1){out.set(list[0].id,initial);continue}const second=new Map();for(const a of list){const n=names(a),label=`${n.first} ${n.last?`${n.last[0].toUpperCase()}.`:''}`.trim();if(!second.has(label))second.set(label,[]);second.get(label).push(a)}for(const [label,rows] of second){if(rows.length===1)out.set(rows[0].id,label);else for(const a of rows)out.set(a.id,text(a.full_name)||text(a.id))}}
    return out;
  }
  function work(item){return{reps:Math.max(1,num(item?.reps)||1),distance:num(item?.distance)||0,stroke:text(item?.stroke),zone:text(item?.zone),restSeconds:num(item?.restSeconds),cycleSeconds:num(item?.cycleSeconds),cycleOptions:clone(item?.cycleOptions||[]),equipment:clone(item?.equipment||[]),composition:clone(item?.composition||[]),pattern:clone(item?.pattern||[]),patternRounds:num(item?.patternRounds),phases:clone(item?.phases||[]),repPattern:clone(item?.repPattern||[]),repInstructions:clone(item?.repInstructions||[]),cues:clone(item?.cues||[]),raw:text(item?.raw||item?.text)}}
  function targetNeeded(item){return num(item?.targetSeconds)!==null||!!item?.zone||!!item?.raceIntent||(item?.repPattern||[]).some(x=>x.zone)||(item?.repInstructions||[]).some(x=>x.raceIntent)}
  function displayTarget(result){
    if(!result)return{status:'none'};
    if(result.status==='ok')return{status:'ok',kind:result.kind,seconds:num(result.seconds),sendOff:num(result.sendOff),source:text(result.source),zone:text(result.zone),message:''};
    if(result.status==='pattern'||result.status==='rep_race')return{status:result.status,kind:result.kind,source:text(result.source),rows:(result.rows||[]).map(r=>({rep:num(r.rep),zone:text(r.zone),label:text(r.label),status:text(r.status),seconds:num(r.seconds),sendOff:num(r.sendOff),source:text(r.source),message:text(r.message||r.reason)}))};
    if(result.status==='missing')return{status:'missing',kind:result.kind,message:text(result.message)||'Target unavailable',source:text(result.source)};
    return{status:'none',reason:text(result.reason)};
  }
  function itemDistance(item){return(Math.max(1,num(item?.reps)||1))*(num(item?.distance)||0)}
  function nodeDistance(node){if(!node)return 0;if(node.kind==='set')return itemDistance(node);if(node.kind==='group')return Math.max(1,num(node.rounds)||1)*(node.items||[]).reduce((n,x)=>n+nodeDistance(x),0);return 0}
  function blockDistance(block){return(block?.items||[]).reduce((n,x)=>n+nodeDistance(x),0)}
  function sessionDistance(session){return(session?.blocks||[]).reduce((n,b)=>n+blockDistance(b),0)}

  class BoardProjection{
    constructor({attendance,adaptation,targets}={}){
      if(!attendance||typeof attendance.hereAthletes!=='function')throw new Error('Board Projection requires Attendance Engine');
      if(!adaptation||typeof adaptation.forItem!=='function')throw new Error('Board Projection requires Adaptation Engine');
      if(!targets||typeof targets.forItem!=='function')throw new Error('Board Projection requires Target Engine');
      this.attendance=attendance;this.adaptation=adaptation;this.targets=targets;
    }
    targetFor(session,prescription,athlete){
      try{return displayTarget(this.targets.forItem(session,prescription,athlete.id))}catch(e){return{status:'error',message:`Target unavailable · ${text(e?.message||e)}`}}
    }
    adaptFor(session,item,athlete){
      try{return this.adaptation.forItem(session,item,athlete.id)}catch(e){return{status:'error',sameAsGroup:true,prescription:clone(item),reason:`Modification unavailable · ${text(e?.message||e)}`}}
    }
    athleteRows(session,item,athletes,labelMap){
      const mods=[],targets=[];
      for(const athlete of athletes){
        const adapted=this.adaptFor(session,item,athlete),actual=adapted?.prescription||clone(item),label=labelMap.get(athlete.id)||text(athlete.full_name),target=this.targetFor(session,actual,athlete),base={athleteId:athlete.id,athleteName:text(athlete.full_name),label};
        if(adapted?.status==='error')mods.push({...base,status:'error',message:adapted.reason,work:work(item)});
        else if(adapted?.sameAsGroup===false)mods.push({...base,status:'modified',reason:text(adapted.reason),work:work(actual),target});
        if(target.status!=='none')targets.push({...base,...target});
      }
      return{modifications:mods,targets};
    }
    phaseRows(session,parent,phase,athletes,labelMap){
      const rows=[];
      for(const athlete of athletes){
        let target;
        try{target=displayTarget(this.targets.forPhase?this.targets.forPhase(session,parent,phase,athlete.id):this.targets.forItem(session,{...parent,...phase},athlete.id))}catch(e){target={status:'error',message:`Target unavailable · ${text(e?.message||e)}`}}
        if(target.status!=='none')rows.push({athleteId:athlete.id,athleteName:text(athlete.full_name),label:labelMap.get(athlete.id)||text(athlete.full_name),...target});
      }
      return rows;
    }
    projectSet(session,item,athletes,labelMap){
      const athleteData=this.athleteRows(session,item,athletes,labelMap),phases=(item.phases||[]).map((phase,i)=>({index:i+1,work:work({...item,...phase,reps:num(phase?.reps)||num(phase?.count)||1,distance:num(phase?.distance)||num(item.distance),phases:[]}),targets:this.phaseRows(session,item,phase,athletes,labelMap)}));
      return{id:item.id,kind:'set',distance:itemDistance(item),groupWork:work(item),phases,modifications:athleteData.modifications,targets:athleteData.targets};
    }
    projectNode(session,node,athletes,labelMap){
      if(node?.kind==='cue')return{id:node.id,kind:'cue',role:text(node.role),text:text(node.text||node.raw),summaryMetres:num(node.summaryMetres)};
      if(node?.kind==='group')return{id:node.id,kind:'group',rounds:Math.max(1,num(node.rounds)||1),label:text(node.label),distance:nodeDistance(node),items:(node.items||[]).map(x=>this.projectNode(session,x,athletes,labelMap))};
      return this.projectSet(session,node,athletes,labelMap);
    }
    project(session){
      if(!session||!text(session.id))throw new Error('Board Projection requires canonical session');
      let athletes=[];try{athletes=this.attendance.hereAthletes(session)||[]}catch{athletes=[]}
      const labelMap=identifiers(athletes),blocks=(session.blocks||[]).map(block=>({id:block.id,type:text(block.type),title:text(block.title),distance:blockDistance(block),items:(block.items||[]).map(x=>this.projectNode(session,x,athletes,labelMap))}));
      return{schema:'msos.board.v1',engineVersion:VERSION,sessionId:session.id,identity:clone(session.identity||{}),totalDistance:sessionDistance(session),attendance:{here:athletes.length,athletes:athletes.map(a=>({id:a.id,name:text(a.full_name),label:labelMap.get(a.id)||text(a.full_name)}))},blocks};
    }
  }
  const create=options=>new BoardProjection(options);
  return{VERSION,create,BoardProjection,identifiers,work,displayTarget,targetNeeded,itemDistance,nodeDistance,blockDistance,sessionDistance};
});
