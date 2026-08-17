'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.DeliveredSession=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const SCHEMA='msos.delivery.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(x=>text(x).toLowerCase()).join('|'))}`;
  const setDistance=item=>(Math.max(1,num(item?.reps)||1))*(num(item?.distance)||0);
  function nodeDistance(node){if(!node)return 0;if(node.kind==='set')return setDistance(node);if(node.kind==='group')return Math.max(1,num(node.rounds)||1)*(node.items||[]).reduce((n,x)=>n+nodeDistance(x),0);return 0}
  const sessionDistance=session=>(session?.blocks||[]).reduce((n,b)=>n+(b.items||[]).reduce((s,x)=>s+nodeDistance(x),0),0);
  function blankState(){return{schema:SCHEMA,deliveries:[],updatedAt:null}}
  function normalizeState(raw){const s=raw&&typeof raw==='object'?clone(raw):blankState();s.schema=SCHEMA;if(!Array.isArray(s.deliveries))s.deliveries=[];return s}
  class MemoryStorage{constructor(initial=null){this.value=initial==null?null:clone(initial);this.reads=0;this.writes=0}load(){this.reads++;return clone(this.value)}save(value){this.writes++;this.value=clone(value);return true}}

  function expandNode(node,ctx,out){
    if(!node)return;
    if(node.kind==='set'){
      const rounds=clone(ctx.rounds||[]),occurrenceIndex=out.filter(x=>x.item_id===node.id).length+1;
      out.push({occurrence_id:stable('occurrence',ctx.sessionId,ctx.blockId,node.id,rounds.map(x=>`${x.groupId}:${x.round}`).join('/'),occurrenceIndex),session_id:ctx.sessionId,block_id:ctx.blockId,item_id:node.id,group_rounds:rounds,occurrence:occurrenceIndex,distance:setDistance(node),work:{reps:Math.max(1,num(node.reps)||1),distance:num(node.distance)||0,stroke:text(node.stroke),zone:text(node.zone),restSeconds:num(node.restSeconds),cycleSeconds:num(node.cycleSeconds),equipment:clone(node.equipment||[]),composition:clone(node.composition||[]),pattern:clone(node.pattern||[]),phases:clone(node.phases||[]),repPattern:clone(node.repPattern||[]),repInstructions:clone(node.repInstructions||[]),cues:clone(node.cues||[]),raw:text(node.raw||node.text)}});return;
    }
    if(node.kind==='group'){
      const rounds=Math.max(1,num(node.rounds)||1);for(let round=1;round<=rounds;round++){const next={...ctx,rounds:[...(ctx.rounds||[]),{groupId:node.id,round}]};for(const child of node.items||[])expandNode(child,next,out)}
    }
  }
  function expand(session){
    if(!session?.id||!Array.isArray(session.blocks))throw new Error('Delivered Session requires canonical session');const out=[];
    for(const block of session.blocks){for(const node of block.items||[])expandNode(node,{sessionId:session.id,blockId:block.id,rounds:[]},out)}return out;
  }
  function resolveFinish(occurrences,session,point={}){
    if(point.full===true||point.type==='session_end'||(!point.blockId&&!point.itemId&&!point.occurrenceId))return occurrences.length-1;
    if(point.occurrenceId){const i=occurrences.findIndex(x=>x.occurrence_id===point.occurrenceId);if(i<0)throw new Error(`Finish occurrence not found: ${point.occurrenceId}`);return i}
    if(point.itemId){let rows=occurrences.map((x,i)=>({x,i})).filter(z=>z.x.item_id===point.itemId);if(point.blockId)rows=rows.filter(z=>z.x.block_id===point.blockId);if(Array.isArray(point.roundPath)&&point.roundPath.length){rows=rows.filter(z=>JSON.stringify(z.x.group_rounds.map(r=>r.round))===JSON.stringify(point.roundPath.map(Number)))}if(point.occurrence){const n=Math.max(1,Number(point.occurrence)||1),row=rows[n-1];if(!row)throw new Error(`Finish item occurrence not found: ${point.itemId} #${n}`);return row.i}if(rows.length===1)return rows[0].i;if(rows.length>1)throw new Error('Repeated item finish requires occurrence or roundPath; guessing is forbidden');throw new Error(`Finish item not found: ${point.itemId}`)}
    if(point.blockId){const rows=occurrences.map((x,i)=>({x,i})).filter(z=>z.x.block_id===point.blockId);if(!rows.length)throw new Error(`Finish block not found: ${point.blockId}`);return rows.at(-1).i}
    throw new Error('Finish point is incomplete');
  }

  class DeliveredSession{
    constructor({storage,clock=nowDefault}={}){if(!storage||typeof storage.load!=='function'||typeof storage.save!=='function')throw new Error('Delivered Session requires a storage adapter');this.storage=storage;this.clock=clock;this.state=normalizeState(storage.load())}
    snapshot(){return clone(this.state)}
    persist(){this.state.updatedAt=this.clock();this.storage.save(this.state);return this.snapshot()}
    get(sessionId){return clone(this.state.deliveries.find(x=>x.session_id===sessionId)||null)}
    finish(record,{point={},coachId='',note=''}={}){
      const current=record?.current||record,original=record?.originalPlan||record?.original_plan||current;if(!current?.id)throw new Error('Finish requires current canonical session');if(this.state.deliveries.some(x=>x.session_id===current.id))throw new Error(`Session already finished: ${current.id}`);
      const occurrences=expand(current);if(!occurrences.length)throw new Error('Cannot finish a session with no runnable work');const index=resolveFinish(occurrences,current,point),delivered=occurrences.slice(0,index+1),remaining=occurrences.slice(index+1),at=this.clock();
      const row={id:stable('delivery',current.id,at),session_id:current.id,identity:clone(current.identity||{}),coach_id:text(coachId),finished_at:at,note:text(note),finish_point:{occurrence_id:delivered.at(-1)?.occurrence_id||null,block_id:delivered.at(-1)?.block_id||null,item_id:delivered.at(-1)?.item_id||null,group_rounds:clone(delivered.at(-1)?.group_rounds||[])},planned_distance:sessionDistance(original),current_distance:sessionDistance(current),delivered_distance:delivered.reduce((n,x)=>n+x.distance,0),remaining_distance:remaining.reduce((n,x)=>n+x.distance,0),planned_snapshot:clone(original),current_snapshot:clone(current),delivered_occurrences:clone(delivered),remaining_occurrences:clone(remaining),status:'finished'};
      this.state.deliveries.push(row);this.persist();return clone(row);
    }
  }
  const create=options=>new DeliveredSession(options);
  return{VERSION,SCHEMA,create,DeliveredSession,MemoryStorage,blankState,normalizeState,setDistance,nodeDistance,sessionDistance,expand,resolveFinish};
});
