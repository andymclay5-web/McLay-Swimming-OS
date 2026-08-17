'use strict';
(function(root,factory){
  const truth=(typeof module==='object'&&module.exports)?require('./session-truth.js'):root?.MSOSEngines?.SessionTruth;
  const api=factory(truth);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.BoardProjection=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(DefaultTruth){
  const VERSION='2.0.0';
  const SCHEMA='msos.board.v2';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};

  function nameParts(ath){
    const parts=text(ath?.full_name||ath?.name).split(/\s+/).filter(Boolean);
    return{parts,first:parts[0]||'',last:parts.at(-1)||'',base:`${parts[0]?.[0]||''}${parts.at(-1)?.[0]||''}`.toUpperCase()};
  }
  function identifiers(athletes=[]){
    const rows=(athletes||[]).map(a=>({athlete:a,...nameParts(a)})),out=new Map(),groups=new Map();
    for(const r of rows){const base=r.base||text(r.athlete?.id).slice(0,2).toUpperCase();if(!groups.has(base))groups.set(base,[]);groups.get(base).push(r)}
    for(const [base,list] of groups){
      if(list.length===1){out.set(list[0].athlete.id,base);continue}
      const unresolved=new Set(list.map(r=>r.athlete.id));
      const maxLast=Math.max(...list.map(r=>r.last.length),1);
      for(let width=2;width<=maxLast&&unresolved.size;width++){
        const bucket=new Map();
        for(const r of list.filter(x=>unresolved.has(x.athlete.id))){const label=`${r.first[0]||''}${r.last.slice(0,width)}`;if(!bucket.has(label))bucket.set(label,[]);bucket.get(label).push(r)}
        for(const [label,rr] of bucket)if(rr.length===1){out.set(rr[0].athlete.id,label);unresolved.delete(rr[0].athlete.id)}
      }
      if(unresolved.size){
        const remaining=list.filter(r=>unresolved.has(r.athlete.id));
        const maxFirst=Math.max(...remaining.map(r=>r.first.length),1);
        for(let width=2;width<=maxFirst&&unresolved.size;width++){
          const bucket=new Map();
          for(const r of remaining.filter(x=>unresolved.has(x.athlete.id))){const label=`${r.first.slice(0,width)}${r.last}`;if(!bucket.has(label))bucket.set(label,[]);bucket.get(label).push(r)}
          for(const [label,rr] of bucket)if(rr.length===1){out.set(rr[0].athlete.id,label);unresolved.delete(rr[0].athlete.id)}
        }
      }
      for(const r of list.filter(x=>unresolved.has(x.athlete.id)))out.set(r.athlete.id,`${text(r.athlete.full_name||r.athlete.name)||text(r.athlete.id)} · ${text(r.athlete.id).slice(-4)}`);
    }
    return out;
  }

  function work(item){
    return{
      reps:Math.max(1,num(item?.reps)||1),distance:num(item?.distance)||0,stroke:text(item?.stroke),zone:text(item?.zone),
      restSeconds:num(item?.restSeconds),cycleSeconds:num(item?.cycleSeconds),cycleOptions:clone(item?.cycleOptions||[]),equipment:clone(item?.equipment||[]),
      composition:clone(item?.composition||[]),compositionRepeats:Math.max(1,num(item?.compositionRepeats)||1),pattern:clone(item?.pattern||[]),patternRounds:num(item?.patternRounds),
      phases:clone(item?.phases||[]),repPattern:clone(item?.repPattern||[]),repInstructions:clone(item?.repInstructions||[]),cues:clone(item?.cues||[]),
      raceIntent:clone(item?.raceIntent||null),targetSeconds:num(item?.targetSeconds),raw:text(item?.raw||item?.text)
    };
  }

  function displayTarget(result){
    if(!result)return{status:'none'};
    if(result.status==='ok')return{status:'ok',kind:text(result.kind),seconds:num(result.seconds),sendOff:num(result.sendOff),source:text(result.source),zone:text(result.zone),message:''};
    if(result.status==='pattern'||result.status==='rep_race')return{
      status:text(result.status),kind:text(result.kind),source:text(result.source),
      rows:(result.rows||[]).map(r=>({rep:num(r.rep),zone:text(r.zone),label:text(r.label),status:text(r.status),seconds:num(r.seconds),sendOff:num(r.sendOff),source:text(r.source),message:text(r.message||r.reason)}))
    };
    if(result.status==='missing')return{status:'missing',kind:text(result.kind),message:text(result.message)||'Target unavailable',source:text(result.source)};
    if(result.status==='error')return{status:'error',kind:text(result.kind),message:text(result.message)||'Target unavailable',source:text(result.source)};
    return{status:'none',reason:text(result.reason)};
  }

  function captureSummary(rows=[]){
    const active=(rows||[]).filter(x=>!x?.status||x.status==='active');
    const byType={};for(const row of active){const k=text(row.type)||'other';byType[k]=(byType[k]||0)+1}
    return{count:active.length,byType,items:active.map(row=>({id:row.id,type:text(row.type),athleteIds:clone(row.athlete_ids||[]),visibility:text(row.visibility),createdAt:text(row.created_at)}))};
  }

  class BoardProjection{
    constructor({truth=DefaultTruth,attendance,adaptation,targets,captures=null}={}){
      if(!truth||typeof truth.nodeDistance!=='function'||typeof truth.blockDistance!=='function'||typeof truth.totalDistance!=='function')throw new Error('Board Projection requires Session Truth distance contract');
      if(!attendance||typeof attendance.hereAthletes!=='function')throw new Error('Board Projection requires Attendance Engine');
      if(!adaptation||typeof adaptation.forItem!=='function')throw new Error('Board Projection requires Adaptation Engine');
      if(!targets||typeof targets.forItem!=='function')throw new Error('Board Projection requires Target Engine');
      if(captures&&typeof captures.atBoardPoint!=='function')throw new Error('Board Projection capture source must implement atBoardPoint');
      this.truth=truth;this.attendance=attendance;this.adaptation=adaptation;this.targets=targets;this.captures=captures;
    }
    context(sessionId,blockId,{groupId=null,setId=null,cueId=null,phaseIndex=null}={}){
      return{sessionId,blockId,groupId,setId,itemId:setId||cueId||null,cueId,phaseIndex};
    }
    attendanceRows(session){
      try{
        if(typeof this.attendance.here==='function')return(this.attendance.here(session)||[]).map(x=>({athlete:clone(x.athlete),status:text(x.record?.status)||'present',record:clone(x.record)}));
        return(this.attendance.hereAthletes(session)||[]).map(athlete=>({athlete:clone(athlete),status:'present',record:null}));
      }catch{return[]}
    }
    capturesFor(session,blockId,itemId=null){
      if(!this.captures)return{count:0,byType:{},items:[]};
      try{return captureSummary(this.captures.atBoardPoint(session,{blockId,itemId}))}catch{return{count:0,byType:{},items:[]}}
    }
    targetFor(session,prescription,athlete){
      try{return displayTarget(this.targets.forItem(session,prescription,athlete.id))}
      catch(e){return{status:'error',message:`Target unavailable · ${text(e?.message||e)}`}}
    }
    adaptFor(session,item,athlete){
      try{return this.adaptation.forItem(session,item,athlete.id)}
      catch(e){return{status:'error',sameAsGroup:true,prescription:clone(item),reason:`Modification unavailable · ${text(e?.message||e)}`}}
    }
    athleteRows(session,blockId,item,attendanceRows,labelMap){
      const modifications=[],targets=[];
      for(const row of attendanceRows){
        const athlete=row.athlete,adapted=this.adaptFor(session,item,athlete),actual=adapted?.prescription||clone(item),target=this.targetFor(session,actual,athlete),context=this.context(session.id,blockId,{setId:item.id}),base={athleteId:athlete.id,athleteName:text(athlete.full_name||athlete.name),label:labelMap.get(athlete.id)||text(athlete.full_name||athlete.name),attendanceStatus:row.status,context:clone(context)};
        if(adapted?.status==='error')modifications.push({...base,status:'error',message:text(adapted.reason),work:work(item)});
        else if(adapted?.sameAsGroup===false)modifications.push({...base,status:'modified',reason:text(adapted.reason),work:work(actual),target:clone(target)});
        if(target.status!=='none')targets.push({...base,...target});
      }
      return{modifications,targets};
    }
    phaseRows(session,blockId,parent,phase,phaseIndex,attendanceRows,labelMap){
      const rows=[];
      for(const attendance of attendanceRows){
        const athlete=attendance.athlete;let target;
        try{target=displayTarget(this.targets.forPhase?this.targets.forPhase(session,parent,phase,athlete.id):this.targets.forItem(session,{...parent,...phase},athlete.id))}
        catch(e){target={status:'error',message:`Target unavailable · ${text(e?.message||e)}`}}
        if(target.status!=='none')rows.push({athleteId:athlete.id,athleteName:text(athlete.full_name||athlete.name),label:labelMap.get(athlete.id)||text(athlete.full_name||athlete.name),attendanceStatus:attendance.status,context:this.context(session.id,blockId,{setId:parent.id,phaseIndex}),...target});
      }
      return rows;
    }
    projectSet(session,blockId,item,attendanceRows,labelMap){
      const athleteData=this.athleteRows(session,blockId,item,attendanceRows,labelMap),context=this.context(session.id,blockId,{setId:item.id});
      const phases=(item.phases||[]).map((phase,i)=>({
        index:i+1,context:this.context(session.id,blockId,{setId:item.id,phaseIndex:i+1}),
        work:work({...item,...phase,reps:num(phase?.reps)||num(phase?.count)||1,distance:num(phase?.distance)||num(item.distance),phases:[]}),
        targets:this.phaseRows(session,blockId,item,phase,i+1,attendanceRows,labelMap)
      }));
      return{
        id:item.id,kind:'set',context,distance:this.truth.nodeDistance(item),groupWork:work(item),phases,
        modifications:athleteData.modifications,targets:athleteData.targets,captures:this.capturesFor(session,blockId,item.id)
      };
    }
    projectNode(session,blockId,node,attendanceRows,labelMap){
      if(node?.kind==='cue')return{id:node.id,kind:'cue',context:this.context(session.id,blockId,{cueId:node.id}),role:text(node.role),text:text(node.text||node.raw),summaryMetres:num(node.summaryMetres),captures:this.capturesFor(session,blockId,node.id)};
      if(node?.kind==='group')return{
        id:node.id,kind:'group',context:this.context(session.id,blockId,{groupId:node.id}),rounds:Math.max(1,num(node.rounds)||1),scope:text(node.scope),roundNumber:num(node.roundNumber),label:text(node.label),distance:this.truth.nodeDistance(node),items:(node.items||[]).map(x=>this.projectNode(session,blockId,x,attendanceRows,labelMap))
      };
      return this.projectSet(session,blockId,node,attendanceRows,labelMap);
    }
    project(session){
      if(!session||!text(session.id))throw new Error('Board Projection requires canonical session');
      const attendanceRows=this.attendanceRows(session),athletes=attendanceRows.map(x=>x.athlete),labelMap=identifiers(athletes);
      const blocks=(session.blocks||[]).map(block=>({
        id:block.id,type:text(block.type),title:text(block.title),authoredTitle:text(block.authoredTitle),order:num(block.order),sourceOrder:num(block.sourceOrder),
        context:{sessionId:session.id,blockId:block.id},distance:this.truth.blockDistance(block),captures:this.capturesFor(session,block.id,null),
        items:(block.items||[]).map(x=>this.projectNode(session,block.id,x,attendanceRows,labelMap))
      }));
      let summary=null;try{summary=typeof this.attendance.summary==='function'?this.attendance.summary(session):null}catch{}
      return{
        schema:SCHEMA,engineVersion:VERSION,sessionId:session.id,identity:clone(session.identity||{}),totalDistance:this.truth.totalDistance(session),
        validation:{writtenTotal:num(session.metadata?.writtenTotal),totalMatches:session.metadata?.totalMatches!==false,warnings:clone(session.metadata?.warnings||[])},
        attendance:{here:athletes.length,summary:clone(summary),athletes:attendanceRows.map(r=>({id:r.athlete.id,name:text(r.athlete.full_name||r.athlete.name),label:labelMap.get(r.athlete.id)||text(r.athlete.full_name||r.athlete.name),status:r.status}))},
        blocks
      };
    }
  }
  const create=options=>new BoardProjection(options);
  return{VERSION,SCHEMA,create,BoardProjection,identifiers,work,displayTarget,captureSummary};
});
