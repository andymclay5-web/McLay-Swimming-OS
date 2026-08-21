'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Context=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const SOURCE_CONFIDENCE=Object.freeze({coach:1,meet:1,action:.94,evidence:.86,timeline:.55});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function parseClock(v){
    if(v==null||v==='')return null;
    if(typeof v==='number')return Number(v);
    const s=text(v),m=s.match(/^(\d{1,2})(?::(\d{2}))(?::(\d{2}))?$/);
    if(!m)return null;
    return m[3]?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):Number(m[1])*60+Number(m[2]);
  }
  function sessionStartEpoch(session,tzOffsetMinutes=null){
    const d=text(session?.identity?.date||session?.session_date),t=text(session?.identity?.time||session?.start_time||'');
    if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
    const hhmm=(t.match(/\b(\d{1,2}):(\d{2})\b/)||[]);if(!hhmm.length)return null;
    const hh=Number(hhmm[1]),mm=Number(hhmm[2]);
    if(tzOffsetMinutes==null){const x=new Date(`${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);return x.getTime();}
    return Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7))-1,Number(d.slice(8,10)),hh,mm)-Number(tzOffsetMinutes)*60000;
  }
  function walkItems(items,block,out,parentIds=[]){
    for(const item of items||[]){
      if(!item)continue;
      if(item.kind==='group')walkItems(item.items||[],block,out,[...parentIds,item.id]);
      else if(item.kind==='set')out.push({blockId:block.id,blockLabel:block.title||block.label||block.type||'Block',item,parentIds:[...parentIds]});
    }
  }
  function flattenSession(session){
    const out=[];for(const block of session?.blocks||[])walkItems(block.items||[],block,out,[]);return out;
  }
  function defaultDuration(item,{secondsPerMetre=1.35,transitionSeconds=12}={}){
    const reps=Math.max(1,num(item?.reps)||1),distance=Math.max(0,num(item?.distance)||0),cycle=num(item?.cycleSeconds),rest=Math.max(0,num(item?.restSeconds)||0),target=num(item?.targetSeconds)||num(item?.estimatedSeconds);
    if(cycle&&cycle>0)return Math.max(cycle,reps*cycle)+transitionSeconds;
    const swim=target&&target>0?target:distance*secondsPerMetre;
    if(swim<=0)return transitionSeconds;
    return Math.max(swim,reps*swim+Math.max(0,reps-1)*rest)+transitionSeconds;
  }
  function plannedTimeline(session,options={}){
    const startAt=num(options.startAt)||sessionStartEpoch(session,options.tzOffsetMinutes);
    const rows=[],flat=flattenSession(session),resolve=typeof options.durationResolver==='function'?options.durationResolver:defaultDuration;
    let cursor=startAt,previousBlock='';
    for(let i=0;i<flat.length;i++){
      const f=flat[i],item=f.item;
      if(cursor!=null&&previousBlock&&previousBlock!==f.blockId)cursor+=Math.max(0,num(options.blockTransitionSeconds)??45)*1000;
      const duration=Math.max(1,num(resolve(item,{session,blockId:f.blockId,index:i,secondsPerMetre:options.secondsPerMetre,transitionSeconds:options.transitionSeconds}))||defaultDuration(item,options));
      const row={index:i,sessionId:session?.id||null,blockId:f.blockId,blockLabel:f.blockLabel,itemId:item.id,itemLabel:text(item.raw||item.text||`${item.reps||1} × ${item.distance||0}`),plannedStartAt:cursor,plannedEndAt:cursor==null?null:cursor+duration*1000,durationSeconds:duration,parentIds:f.parentIds};
      rows.push(row);if(cursor!=null)cursor=row.plannedEndAt;previousBlock=f.blockId;
    }
    return{sessionId:session?.id||null,startAt,rows,durationSeconds:rows.reduce((n,r)=>n+r.durationSeconds,0),endAt:cursor,source:'advisory_timeline'};
  }
  function sourceConfidence(source){return SOURCE_CONFIDENCE[source]??.5;}
  function decayConfidence(base,ageMs,halfLifeMinutes=45){
    if(!Number.isFinite(ageMs)||ageMs<=0)return base;
    const half=Math.max(1,Number(halfLifeMinutes))*60000;return Math.max(.2,base*Math.pow(.5,ageMs/half));
  }
  function timelineRowAt(timeline,at,driftMs=0){
    if(!timeline?.rows?.length||!Number.isFinite(Number(at)))return null;
    const shifted=Number(at)-Number(driftMs||0);
    let row=timeline.rows.find(r=>r.plannedStartAt!=null&&shifted>=r.plannedStartAt&&shifted<r.plannedEndAt);
    if(!row&&timeline.rows[0]?.plannedStartAt!=null&&shifted<timeline.rows[0].plannedStartAt)row=timeline.rows[0];
    if(!row&&timeline.rows.at(-1)?.plannedEndAt!=null&&shifted>=timeline.rows.at(-1).plannedEndAt)row=timeline.rows.at(-1);
    return row||null;
  }
  function normalizeAnchor(anchor){
    return Object.freeze({
      id:anchor.id||`ctx_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
      at:Number(anchor.at)||Date.now(),
      source:anchor.source||'coach',
      sessionId:anchor.sessionId||null,
      blockId:anchor.blockId||null,
      itemId:anchor.itemId||null,
      rep:Number.isFinite(Number(anchor.rep))?Number(anchor.rep):null,
      round:Number.isFinite(Number(anchor.round))?Number(anchor.round):null,
      note:text(anchor.note||''),
      confidence:Number.isFinite(Number(anchor.confidence))?Math.max(0,Math.min(1,Number(anchor.confidence))):sourceConfidence(anchor.source||'coach')
    });
  }
  class ContextTracker{
    constructor({session=null,timeline=null,anchors=[],now=()=>Date.now(),halfLifeMinutes=45}={}){
      this.session=session;this.timeline=timeline||plannedTimeline(session||{});this.anchors=(anchors||[]).map(normalizeAnchor);this.clock=now;this.halfLifeMinutes=halfLifeMinutes;
    }
    setSession(session,options={}){this.session=session;this.timeline=plannedTimeline(session,options);return this;}
    anchor(input){const a=normalizeAnchor({...input,sessionId:input.sessionId||this.session?.id||null});this.anchors.push(a);return a;}
    latestAnchor(at=this.clock()){
      const candidates=this.anchors.filter(a=>(!this.session?.id||!a.sessionId||a.sessionId===this.session.id)&&a.at<=at).map(a=>({...a,effectiveConfidence:decayConfidence(a.confidence,at-a.at,this.halfLifeMinutes)}));
      candidates.sort((a,b)=>b.effectiveConfidence-a.effectiveConfidence||b.at-a.at);return candidates[0]||null;
    }
    frame(at=this.clock()){
      if(!this.session)return{status:'idle',confidence:0,source:'none'};
      const anchor=this.latestAnchor(at),rows=this.timeline?.rows||[];
      let driftMs=0,anchorRow=null;
      if(anchor?.itemId)anchorRow=rows.find(r=>r.itemId===anchor.itemId)||null;
      if(!anchorRow&&anchor?.blockId)anchorRow=rows.find(r=>r.blockId===anchor.blockId)||null;
      if(anchor&&anchorRow?.plannedStartAt!=null)driftMs=anchor.at-anchorRow.plannedStartAt;
      const estimated=timelineRowAt(this.timeline,at,driftMs);
      const explicitRow=anchor?.itemId?rows.find(r=>r.itemId===anchor.itemId):null;
      const row=explicitRow||estimated||anchorRow;
      const base=anchor?decayConfidence(anchor.confidence,at-anchor.at,this.halfLifeMinutes):sourceConfidence('timeline');
      const confidence=Math.max(.2,Math.min(1,base));
      return{status:'active',sessionId:this.session.id||null,blockId:row?.blockId||anchor?.blockId||null,blockLabel:row?.blockLabel||'',itemId:row?.itemId||anchor?.itemId||null,itemLabel:row?.itemLabel||'',rep:anchor?.rep||null,round:anchor?.round||null,source:anchor?.source||'timeline',confidence,driftSeconds:Math.round(driftMs/1000),plannedStartAt:row?.plannedStartAt??null,plannedEndAt:row?.plannedEndAt??null,asOf:at};
    }
    snapshot(at=this.clock()){return clone(this.frame(at));}
  }
  return{VERSION,SOURCE_CONFIDENCE,parseClock,sessionStartEpoch,flattenSession,defaultDuration,plannedTimeline,timelineRowAt,normalizeAnchor,ContextTracker};
});
